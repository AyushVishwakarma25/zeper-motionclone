"""Asset studio: spec card -> locked-style image -> transparent PNG -> recognition test -> manifest.

Nothing in the render path may draw a prop out of primitives. Every object that appears in a scene is built here from a
written Object Spec Card, generated in ONE locked style, keyed to transparency, scaled from its real-world size and
verified by a fresh vision call that sees only the picture. Generation and vision are injected so tests run offline.
"""
import hashlib
import io
import json
import re
from pathlib import Path
from typing import Callable, Literal, Optional

import numpy as np
from PIL import Image
from pydantic import Field

from .models import Strict

KEY_RGB = (0, 255, 0)
NEGATIVE = ('photo, 3d render, realistic, blurry, extra limbs, text, letters, logo, cropped, multiple objects, '
            'gradient mesh, noisy texture, different art style than the references')
PRIMITIVE_WORDS = re.compile(r'^(a |an |the )?(plain |simple |basic )?(box|rectangle|square|circle|sphere|cylinder|cube|blob)\b', re.I)
MOUTHS = {'A': 'lips pressed shut (M B P)', 'B': 'slightly open, teeth together (K S T EE)', 'C': 'open, medium (EH AE)',
          'D': 'wide open (AA)', 'E': 'rounded, medium (AO ER)', 'F': 'small round pucker (OO W)',
          'G': 'upper teeth on lower lip (F V)', 'H': 'tongue behind upper teeth (L)', 'X': 'closed rest'}


class StyleBible(Strict):
    summary: str = Field(min_length=10, description='measurable: line weight, outline colour, shading, proportions')
    outline: str = Field(min_length=3, description='e.g. "4px #3a2418"')
    shading: Literal['flat', 'cel', 'soft'] = 'flat'
    palette: list[str] = Field(min_length=3, max_length=12)
    reference_images: list[str] = Field(default_factory=list, max_length=3)
    forbidden: list[str] = Field(default_factory=lambda: ['3d render look', 'photo textures', 'primitive shapes as objects'])

    def suffix(self):
        return (f'{self.summary}. Outline {self.outline}. Flat {self.shading} colouring, limited palette '
                f'{", ".join(self.palette)}. Clean vector-like edges, no text, no watermark, no scenery, single subject '
                f'centred, whole object visible with margin, on a solid pure green (#00ff00) background.')


class ObjectSpec(Strict):
    id: str = Field(pattern=r'^[a-z][a-z0-9_]{1,39}$')
    name: str = Field(min_length=3, max_length=80)
    kind: Literal['prop', 'character_part', 'set_plate'] = 'prop'
    height_cm: float = Field(gt=0, le=5000)
    parts: list[str] = Field(min_length=2, description='what a child would point at')
    silhouette: str = Field(min_length=8)
    materials: list[str] = Field(min_length=1)
    rests_on: str = Field(default='', description='support id; empty only if held_by or flying')
    held_by: str = ''
    flying: bool = False
    state: str = 'idle'
    must_not_look_like: list[str] = Field(default_factory=list)
    notes: str = ''


def lint_spec(spec: ObjectSpec) -> list[str]:
    """Reasons the card is not ready. Empty list = ready to generate."""
    bad = []
    if PRIMITIVE_WORDS.match(spec.name.strip()) or PRIMITIVE_WORDS.match(spec.silhouette.strip()):
        bad.append('named or described as a bare shape: say what the object really is and its signature detail')
    if spec.kind == 'prop' and not (spec.rests_on or spec.held_by or spec.flying):
        bad.append('no support: set rests_on, held_by or flying')
    if len({p.lower() for p in spec.parts}) < 2:
        bad.append('needs at least two distinct parts')
    return bad


def spec_prompt(spec: ObjectSpec, style: StyleBible, extra: str = '') -> tuple[str, str]:
    parts = ', '.join(spec.parts)
    view = 'three-quarter view, resting on a flat surface with a faint contact shadow' if spec.kind == 'prop' else 'flat view'
    prompt = (f'{spec.name} ({parts}). {spec.silhouette}. Materials: {", ".join(spec.materials)}. State: {spec.state}. '
              f'{view}. {extra} {style.suffix()}').replace('  ', ' ').strip()
    neg = NEGATIVE + (', ' + ', '.join(spec.must_not_look_like) if spec.must_not_look_like else '')
    return prompt, neg


def mouth_prompt(character: str, shape: str, style: StyleBible) -> tuple[str, str]:
    return (f'{character} mouth only, shape {shape}: {MOUTHS[shape]}. Same line weight and colours as the face, centred on a '
            f'square canvas, nothing else. {style.suffix()}', NEGATIVE)


def key_out(png: bytes, key=KEY_RGB, tol=70, soft=60, pad=12) -> Image.Image:
    """Chroma key to transparency with despill and a tight crop. Returns RGBA."""
    im = Image.open(io.BytesIO(png)).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    dist = np.sqrt(((a - np.array(key, np.float32)) ** 2).sum(-1))
    alpha = np.clip((dist - tol) / soft, 0, 1)
    # despill: where green exceeds the other channels on kept pixels, pull it back
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    spill = np.clip(g - np.maximum(r, b), 0, None) * (alpha > 0)
    near_edge = (alpha < 1) & (alpha > 0)
    g2 = np.where(near_edge, g - spill, g)
    out = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    rgba = Image.fromarray(out, 'RGBA')
    box = rgba.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if not box:
        raise ValueError('nothing left after keying: the subject may be green or the background was not solid')
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(rgba.width, box[2] + pad), min(rgba.height, box[3] + pad))
    return rgba.crop(box)


def fringe_score(rgba: Image.Image) -> float:
    """Share of semi-transparent edge pixels that are still green-dominant. ~0 is clean."""
    a = np.asarray(rgba).astype(np.float32)
    edge = (a[..., 3] > 8) & (a[..., 3] < 247)
    if not edge.any():
        return 0.0
    g, rb = a[..., 1][edge], np.maximum(a[..., 0], a[..., 2])[edge]
    return float(((g - rb) > 40).mean())


def pixel_height(spec: ObjectSpec, hero_cm: float, hero_px: int) -> int:
    """On-screen height from real size: hero_px * object_cm / hero_cm."""
    return max(8, round(hero_px * spec.height_cm / hero_cm))


def fit_to_height(rgba: Image.Image, px: int) -> Image.Image:
    w = max(1, round(rgba.width * px / rgba.height))
    return rgba.resize((w, px), Image.LANCZOS)


def palette_distance(rgba: Image.Image, palette: list[str]) -> float:
    """Mean distance (0..441) from each opaque pixel to its nearest palette colour. Lower = on style."""
    a = np.asarray(rgba)
    px = a[a[..., 3] > 200][:, :3].astype(np.float32)
    if len(px) == 0:
        return 441.0
    px = px[:: max(1, len(px) // 4000)]
    pal = np.array([[int(h.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)] for h in palette], np.float32)
    d = np.sqrt(((px[:, None, :] - pal[None]) ** 2).sum(-1)).min(1)
    return float(d.mean())


def name_matches(spec: ObjectSpec, answer: str) -> bool:
    """Loose match: the head noun of the name, or any part word, appears in the blind answer."""
    ans = re.findall(r'[a-z]+', answer.lower())
    names = re.findall(r'[a-z]+', spec.name.lower())
    head = [w for w in names if len(w) > 2 and w not in {'the', 'and', 'with', 'two', 'slot', 'pop', 'up'}]
    stems = {w.rstrip('s') for w in ans}
    return any(w.rstrip('s') in stems for w in head[-2:] or head)


GenFn = Callable[[str, str, list], bytes]           # (prompt, negative, reference_paths) -> png bytes
SeeFn = Callable[[bytes, str], str]                 # (png bytes, question) -> text


def build_asset(spec: ObjectSpec, style: StyleBible, out_dir: Path, gen: GenFn, see: Optional[SeeFn], *,
                hero_cm: float = 170, hero_px: int = 1000, max_tries: int = 3, extra: str = '') -> dict:
    """Generate -> key -> verify. Retries with a stronger prompt. Returns a manifest row; never raises for a bad image."""
    problems = lint_spec(spec)
    if problems:
        return {'id': spec.id, 'ok': False, 'stage': 'spec', 'problems': problems}
    out_dir.mkdir(parents=True, exist_ok=True)
    refs = [p for p in style.reference_images if Path(p).is_file()]
    tries = []
    for n in range(max_tries):
        stronger = extra + (' Make the signature parts large and unmistakable.' if n else '')
        prompt, neg = spec_prompt(spec, style, stronger)
        seed = hashlib.sha256(f'{spec.id}:{n}'.encode()).hexdigest()[:8]
        try:
            raw = gen(prompt + f' [variation {seed}]', neg, refs)
            rgba = key_out(raw)
        except Exception as exc:  # generation or keying failed; record and retry
            tries.append({'try': n, 'error': str(exc)[:160]})
            continue
        fr, pd = fringe_score(rgba), palette_distance(rgba, style.palette)
        seen = ''
        recognised = True
        if see is not None:
            buf = io.BytesIO(); rgba.save(buf, 'PNG')
            seen = see(buf.getvalue(), 'What is this object? Answer in at most two words.')
            recognised = name_matches(spec, seen)
        tries.append({'try': n, 'fringe': round(fr, 3), 'palette_dist': round(pd, 1), 'blind_answer': seen, 'recognised': recognised})
        if recognised and fr < 0.15:
            px = pixel_height(spec, hero_cm, hero_px)
            final = fit_to_height(rgba, px)
            path = out_dir / f'{spec.id}.png'; final.save(path, 'PNG')
            return {'id': spec.id, 'ok': True, 'path': str(path), 'height_px': px, 'width_px': final.width,
                    'scale_vs_hero': round(spec.height_cm / hero_cm, 4), 'tries': tries, 'spec': spec.model_dump()}
    return {'id': spec.id, 'ok': False, 'stage': 'asset', 'tries': tries,
            'problems': ['not recognised or fringed after retries: rewrite the spec (signature detail) instead of retrying']}


def build_all(specs: list[ObjectSpec], style: StyleBible, out_dir: Path, gen: GenFn, see: Optional[SeeFn], **kw) -> dict:
    rows = [build_asset(s, style, out_dir, gen, see, **kw) for s in specs]
    manifest = {'style': style.model_dump(), 'assets': rows, 'ok': all(r['ok'] for r in rows)}
    (out_dir / 'manifest.json').write_text(json.dumps(manifest, indent=1), encoding='utf-8')
    return manifest


def gemini_gen(pro: bool = False) -> GenFn:
    """Production generator: Gemini image model with up to two style references."""
    from . import ai

    def gen(prompt, negative, refs):
        data = ai.generate_image_composite(f'{prompt}\nAvoid: {negative}', [Path(p) for p in refs], pro_mode=pro)
        if not data:
            raise RuntimeError('image model returned no image')
        return data
    return gen


def gemini_see() -> SeeFn:
    """Production blind viewer: a fresh vision call that sees only the picture."""
    from google.genai import types
    from . import ai

    def see(png, question):
        client, model, _ = ai.get_gemini_client(tier='qa_gate')
        res = client.models.generate_content(model=model, contents=[question, types.Part.from_bytes(data=png, mime_type='image/png')],
                                             config=types.GenerateContentConfig(temperature=0.0, max_output_tokens=32))
        return (res.text or '').strip()
    return see

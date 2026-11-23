"""Director: topic -> spec-ready ShotPlan -> compiled `scene.layered` for the LAYERED_ASSET_SCENE template.

The old script step produced free strings ("character_pose": "confused", "prop_type": "money_stack") that were keyword-
matched onto a few hand-drawn SVGs. Here every object a beat needs is a full ObjectSpec (parts, real size, what it rests
on), every beat names where objects sit, and a lint rejects plans an illustrator could not draw or physics would reject.
"""
import json
import re
from typing import Callable, Literal, Optional

from pydantic import Field

from .asset_studio import ObjectSpec, lint_spec
from .models import Strict

CameraMove = Literal['hold', 'push_in', 'pull_back', 'pan_left', 'pan_right', 'low_angle', 'crane_down']


class BeatObject(Strict):
    ref: str = Field(description='id of an ObjectSpec in plan.specs or a character in plan.characters')
    x_frac: float = Field(ge=0.05, le=0.95, description='horizontal position as a fraction of the set width')
    on: str = Field(default='', description='support id (floor, counter...) when resting; empty if held')
    held_by: str = ''
    hand: Literal['left', 'right'] = 'right'
    hold_from: float = Field(default=0.0, ge=0, le=1, description='fraction of the beat when the hand takes it')


class Beat(Strict):
    id: int
    text: str = Field(description='narration, at most 12 words')
    dur_s: float = Field(gt=0.5, le=3.5)
    visual: str = Field(min_length=12, description='a picture a stranger could draw, no abstractions')
    set: str
    camera: CameraMove = 'hold'
    objects: list[BeatObject] = Field(min_length=1)
    emotion: str = 'neutral'


class Surface(Strict):
    id: str
    x: float = Field(description='centre x, world px')
    y: float = Field(description='BOTTOM edge, world px (y grows down)')
    w: float
    h: float = Field(description='height; the top edge that things rest on is y - h')


class Plates(Strict):
    far: str = ''
    mid: str = ''
    near: str = ''


class SetSpec(Strict):
    id: str
    surfaces: list[Surface] = Field(min_length=1, description='floor first, then furniture tops')
    plates: Plates = Field(default_factory=Plates)


class Character(Strict):
    id: str
    height_cm: float = 170
    asset: str = ''
    w_px: int = 260
    h_px: int = 1000


class ShotPlan(Strict):
    language: str = 'english'
    hero_cm: float = 170
    sets: list[SetSpec] = Field(min_length=1)
    characters: list[Character] = Field(default_factory=list)
    specs: list[ObjectSpec] = Field(default_factory=list)
    beats: list[Beat] = Field(min_length=1)


def director_prompt(topic: str, language: str, seconds: int, style_summary: str) -> str:
    return f"""You are the Director of a short vertical animated video. Topic: {topic}. Language: {language}. Length about {seconds}s.
Style (already locked, do not restyle): {style_summary}

Return a ShotPlan. Rules:
- Beat 1 is the hook: a moving, readable image of the payoff or problem. Each beat <= 12 words and <= 3.5 s.
- Every beat's `visual` is a picture an illustrator could draw: who, doing what, with which named object. No abstractions.
- Every consecutive pair of beats differs in set, camera move or objects: a new picture at least every 3 s.
- Every object that appears needs an ObjectSpec in `specs`: what it REALLY is (name its parts: a toaster has two slots, a
  lever, a dial), real height in cm, silhouette, materials, and what it rests on or who holds it. Never describe an
  object as a box, rectangle, circle or blob.
- Place each object with x_frac and an `on` support from the set's surfaces, or `held_by` a character. Nothing floats.
- Use at most 3 sets and a small cast. Keep object sizes believable next to the hero ({170} cm).
- The last beat is the twist or payoff."""


def lint_plan(plan: ShotPlan) -> list[str]:
    bad = []
    spec_ids = {s.id for s in plan.specs}
    char_ids = {c.id for c in plan.characters}
    set_by = {s.id: s for s in plan.sets}
    for sp in plan.specs:
        bad += [f'spec {sp.id}: {m}' for m in lint_spec(sp)]
    prev = None
    for b in plan.beats:
        if len(re.findall(r'\S+', b.text)) > 12:
            bad.append(f'beat {b.id}: more than 12 words')
        if b.set not in set_by:
            bad.append(f'beat {b.id}: unknown set {b.set}')
            continue
        surf = {s.id for s in set_by[b.set].surfaces}
        for o in b.objects:
            if o.ref not in spec_ids | char_ids:
                bad.append(f'beat {b.id}: object {o.ref} has no spec card')
            if o.held_by:
                if o.held_by not in char_ids:
                    bad.append(f'beat {b.id}: {o.ref} held_by unknown character {o.held_by}')
            elif o.on not in surf:
                bad.append(f'beat {b.id}: {o.ref} rests on {o.on or "nothing"}: not a surface of set {b.set}')
        sig = (b.set, b.camera, tuple(sorted(o.ref for o in b.objects)))
        if prev and sig == prev:
            bad.append(f'beat {b.id}: same picture as the previous beat (set, camera, objects)')
        prev = sig
    return bad


_CAM = {  # (cx offset, cy offset, zoom) start -> end, as fractions of the world
    'hold': ((0, 0, 1.0), (0, 0, 1.0)), 'push_in': ((0, 0, 1.0), (0, -0.04, 1.18)), 'pull_back': ((0, -0.04, 1.18), (0, 0, 1.0)),
    'pan_left': ((0.08, 0, 1.12), (-0.08, 0, 1.12)), 'pan_right': ((-0.08, 0, 1.12), (0.08, 0, 1.12)),
    'low_angle': ((0, 0.06, 1.0), (0, 0.04, 1.1)), 'crane_down': ((0, -0.12, 1.1), (0, 0.02, 1.0)),
}


def compile_layered(plan: ShotPlan, beat: Beat, manifest: dict, fps: int = 30, world=(1080, 1920),
                    mouth_tracks: Optional[dict] = None, mouth_dirs: Optional[dict] = None) -> dict:
    """One beat -> `scene.layered`. Sizes come from the asset manifest (real-size scaled), never from the LLM."""
    W, H = world
    frames = max(1, round(beat.dur_s * fps))
    sset = next(s for s in plan.sets if s.id == beat.set)
    surfaces = [s.model_dump() for s in sset.surfaces]
    floor = surfaces[0]
    size = {r['id']: (r['width_px'], r['height_px'], r['path']) for r in manifest.get('assets', []) if r.get('ok')}
    chars = {c.id: c for c in plan.characters}
    surf_top = {sf['id']: sf['y'] - sf['h'] for sf in surfaces}
    pick = {}                                           # (holder, hand) -> (frame, grip point in world px)
    for o in beat.objects:
        if o.held_by and o.ref in size:
            w, h, _ = size[o.ref]
            gx, gy = o.x_frac * W, surf_top.get(o.on, floor['y'] - floor['h']) - h / 2
            pick[(o.held_by, o.hand)] = (max(1, round(o.hold_from * frames)), gx, gy)
    objects = []
    for o in beat.objects:
        x = o.x_frac * W
        if o.ref in chars:
            c = chars[o.ref]
            hands = {}
            for (holder, hand), (t0, gx, gy) in pick.items():
                if holder == c.id:   # rest pose near the body, reach the prop's grip point at t0, then follow it
                    hands[hand] = [{'f': 0, 'x': x + 0.4 * c.w_px, 'y': floor['y'] - floor['h'] - 0.45 * c.h_px},
                                   {'f': t0, 'x': gx, 'y': gy}, {'f': frames + 1, 'x': gx, 'y': gy}]
            d = {'id': c.id, 'class': 'character', 'asset': c.asset, 'x': x, 'w': c.w_px, 'h': c.h_px, 'support': o.on or 'floor',
                 'facing': 1, 'z': 4, 'hands': hands or None}
            if mouth_tracks and c.id in mouth_tracks and mouth_dirs and c.id in mouth_dirs:
                d['mouth'] = mouth_dirs[c.id]
            objects.append({k: v for k, v in d.items() if v is not None})
        else:
            if o.ref not in size:
                raise KeyError(f'asset for {o.ref} is not in the manifest (failed or not built)')
            w, h, path = size[o.ref]
            d = {'id': o.ref, 'class': 'prop', 'asset': path, 'x': x, 'w': w, 'h': h, 'z': 5}
            if o.held_by:
                t0 = pick[(o.held_by, o.hand)][0]
                d['attach'] = [{'from': t0, 'to': frames + 1, 'held_by': o.held_by, 'hand': o.hand, 'grip': [0, -h / 2]}]
            d['support'] = o.on
            objects.append(d)
    a, b = _CAM[beat.camera]
    cam = [{'f': 0, 'cx': W / 2 + a[0] * W, 'cy': H / 2 + a[1] * H, 'zoom': a[2]},
           {'f': frames - 1, 'cx': W / 2 + b[0] * W, 'cy': H / 2 + b[1] * H, 'zoom': b[2]}]
    layered = {'world': {'w': W, 'h': H}, 'plates': {k: v for k, v in sset.plates.model_dump().items() if v}, 'surfaces': surfaces, 'objects': objects, 'camera': cam}
    if mouth_tracks:
        layered['mouth_tracks'] = mouth_tracks
    return {'layered': layered, 'frames': frames}


def plan_with_llm(topic: str, language: str, seconds: int, style_summary: str, llm: Callable[[str, type], str]) -> ShotPlan:
    """`llm(prompt, schema)` returns JSON text; production wiring uses Gemini structured output (see layered_pipeline)."""
    raw = llm(director_prompt(topic, language, seconds, style_summary), ShotPlan)
    plan = ShotPlan.model_validate_json(raw if isinstance(raw, str) else json.dumps(raw))
    return plan

"""Director for the ICON-EXPLAINER genre (flat icon per beat, word-by-word headline, pill label, dark hook).

The Director never invents pictures. It chooses a catalog icon by id (remotion/src/explainer/icons) and may set only the
parameters that icon declares. A concept with no icon is reported in `need_icon` for a human or a new icon, never faked.
"""
import json
import re
from pathlib import Path
from typing import Literal, Optional

from pydantic import Field

from .models import Strict

CATALOG = json.loads((Path(__file__).with_name('icon_catalog.json')).read_text(encoding='utf-8'))
IconId = Literal[tuple(CATALOG)]            # type: ignore[valid-type]


class Pill(Strict):
    text: str = Field(max_length=44)
    tag: str = Field(default='', max_length=10, description='e.g. News, Step 1')
    tone: Literal['dark', 'red', 'green', 'white'] = 'dark'
    at: float = Field(default=0.5, ge=0, le=2.5, description='seconds into the beat')


class IconChoice(Strict):
    id: IconId
    params: dict[str, str] = Field(default_factory=dict, description='only keys the icon declares; values as strings')


class IconBeat(Strict):
    id: str
    text: str = Field(description='narration, <= 12 words')
    hook: bool = False
    title_lines: list[str] = Field(default_factory=list, max_length=3, description='hook only: 2-3 short title lines; the LAST is shown big (<= 4 words)')
    icon: Optional[IconChoice] = None
    need_icon: str = Field(default='', description='if no catalog icon fits: describe the picture needed instead of forcing a wrong one')
    pill: Optional[Pill] = None


class IconPlan(Strict):
    language: str = 'hinglish'
    beats: list[IconBeat] = Field(min_length=3)


def icon_prompt(topic: str, language: str, seconds: int) -> str:
    cat = '\n'.join(f'- {k}: {v["use"]}; params: {", ".join(v["params"]) or "none"}' for k, v in CATALOG.items())
    return f"""You are the Director of a short vertical explainer in the flat-icon style: one headline, one animated icon, optional pill label per beat.
Topic: {topic}. Language: {language}. About {seconds}s. Each beat is spoken narration of at most 12 words, about 3 seconds.
Beat 1 is the hook: set hook=true and give title_lines (2-3 short lines, the last one big and at most 4 words, e.g. ["History mein aisa", "pehli baar hone ja raha hai", "First time in history"]). The last beat is the takeaway.
Pick each beat's icon ONLY from this catalog (id and params must match exactly):
{cat}
If nothing fits, leave icon null and describe the picture in need_icon. Do not force a wrong icon.
Do not use the same icon id in two consecutive beats unless params change its state (e.g. gold_bars then gold_bars with fall=true).
Use pills for a short fact, a source tag ("News") or a step ("Step 1"). Never repeat the narration verbatim in the pill."""


def lint_icon_plan(plan: IconPlan) -> list[str]:
    bad, prev = [], None
    if not plan.beats[0].hook:
        bad.append('beat 1 must be the hook (hook=true)')
    elif plan.beats[0].title_lines and len(re.findall(r'\S+', plan.beats[0].title_lines[-1])) > 4:
        bad.append('beat 1: the last title line is shown big: at most 4 words')
    for b in plan.beats:
        if len(re.findall(r'\S+', b.text)) > 12:
            bad.append(f'beat {b.id}: more than 12 words')
        if b.hook:
            prev = None
            continue
        if b.icon is None and not b.need_icon:
            bad.append(f'beat {b.id}: no icon and no need_icon')
        if b.icon:
            allowed = set(CATALOG[b.icon.id]['params'])
            extra = set(b.icon.params) - allowed
            if extra:
                bad.append(f'beat {b.id}: {b.icon.id} has no params {sorted(extra)} (allowed: {sorted(allowed) or "none"})')
            sig = (b.icon.id, tuple(sorted(b.icon.params.items())))
            if prev == sig:
                bad.append(f'beat {b.id}: same icon and state as the previous beat')
            prev = sig
        if b.pill and b.pill.text.strip().lower() == b.text.strip().lower():
            bad.append(f'beat {b.id}: pill repeats the narration')
    return bad


def _coerce(v: str):
    if v.lower() in ('true', 'false'):
        return v.lower() == 'true'
    try:
        return float(v) if '.' in v else int(v)
    except ValueError:
        return v


def compile_scenes(plan: IconPlan, timing: dict, fps: int = 30) -> dict:
    """Beats + narration timing (scripts/assemble_beats.py -> timing.json) -> scene_plan.scenes for render.mjs."""
    by_id = {b['id']: b for b in timing['beats']}
    scenes, missing = [], []
    for b in plan.beats:
        t = by_id.get(b.id)
        if t is None:
            raise KeyError(f'beat {b.id} is missing from timing.json')
        words = [{'w': w['word'], 'start': round(w['t0'] - t['start'], 3), 'end': round(w['t1'] - t['start'], 3)} for w in t['words']]
        sc = {'template': 'icon_explainer', 'beat': b.id, 'duration_seconds': round(t['end'] - t['start'], 3), 'words': words}
        if b.hook:
            sc['mode'] = 'hook'; sc['hook'] = {'lines': b.title_lines or [' '.join(w['w'] for w in words)]}
        elif b.icon:
            sc['icon'] = {'id': b.icon.id, 'params': {k: _coerce(v) for k, v in b.icon.params.items()}}
        else:
            missing.append({'beat': b.id, 'need_icon': b.need_icon})
        if b.pill:
            sc['pill'] = b.pill.model_dump()
        scenes.append(sc)
    return {'scenes': scenes, 'need_icon': missing}

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


ICON_KEYWORDS: dict[str, list[str]] = {
    'city_map': ['map', 'city', 'warehouse', 'warehouses', 'hub', 'location', 'locations', 'pin', 'pins', 'network', 'area', 'route', 'routes', 'dark store', 'dark stores', 'streets'],
    'stopwatch_timer': ['stopwatch', 'timer', 'ticking', 'countdown', 'time', 'clock', 'grocery', 'groceries', 'bag', 'speed', 'fast', '10-minute', 'minute', 'seconds', 'quick'],
    'delivery_scooter': ['scooter', 'rider', 'delivery', 'courier', 'bike', 'motorcycle', 'driver', 'street', 'road', 'zooming', 'speeding', 'transport', 'shipping'],
    'package_box': ['box', 'package', 'parcel', 'chip', 'microchip', 'glowing', 'location pin', 'smart', 'tech', 'hardware', 'cube', 'iot'],
    'shopping_cart': ['cart', 'shopping', 'supermarket', 'items', 'store', 'retail', 'buy', 'checkout', 'basket'],
    'smartphone_app': ['phone', 'smartphone', 'app', 'mobile', 'screen', 'tracking', 'notification', 'order', 'status', 'eta'],
    'store_warehouse': ['warehouse', 'dark store', 'fulfillment', 'storage', 'depot', 'inventory', 'center', 'dispatch', 'shelves'],
    'rocket_growth': ['rocket', 'launch', 'growth', 'hyper', 'rapid', 'scale', 'scaling', 'skyrocket', 'speed', 'fast', 'expansion'],
    'gold_bars': ['gold', 'wealth', 'safe haven', 'bullion', 'bars', 'treasure', 'reserve', 'reserves'],
    'silver_coin': ['silver', 'coin', 'sliding', 'metal', 'commodity', 'drop', 'slide'],
    'candles': ['candles', 'stock', 'market', 'chart', 'trading', 'crash', 'rise', 'candlestick', 'crypto'],
    'ai_bars': ['ai', 'artificial intelligence', 'tech', 'chip', 'semiconductor', 'model', 'software', 'growth'],
    'bond': ['bond', 'bonds', 'treasury', 'debt', 'yield', 'government', 'certificate'],
    'shield_crack': ['shield', 'protection', 'safe', 'crack', 'cracking', 'fails', 'broken', 'breach', 'vulnerability'],
    'flask': ['flask', 'lab', 'science', 'synthetic', 'chemistry', 'formula', 'research', 'experiment'],
    'gauge': ['gauge', 'meter', 'trust', 'confidence', 'risk', 'level', 'measure', 'indicator'],
    'radar': ['radar', 'military', 'target', 'targeting', 'surveillance', 'attack', 'defense', 'scan'],
    'lock_hack': ['lock', 'hack', 'hacked', 'security', 'theft', 'stolen', 'bank', 'breach', 'cyber'],
    'calendar_fill': ['calendar', 'month', 'months', 'year', 'saving', 'savings', 'emergency', 'timeline'],
    'car_house_x': ['car', 'house', 'purchase', 'buy', 'expensive', 'postpone', 'avoid', 'spending'],
    'investors_cash': ['investors', 'cash', 'market', 'capital', 'funds', 'pulling money', 'liquidity'],
    'expect_line': ['expect', 'expected', 'expectation', 'hype', 'reality', 'versus', 'trend', 'curve'],
    'why_mark': ['why', 'question', 'curiosity', 'wonder', 'mystery', 'reason', 'doubt']
}


def resolve_fallback_icon(need_icon_desc: str) -> tuple[str, dict[str, str]]:
    """Resolves an arbitrary need_icon text description to the best-matching catalog icon."""
    desc = (need_icon_desc or '').lower()
    best_id = 'why_mark'
    best_score = 0

    for icon_id, kws in ICON_KEYWORDS.items():
        if icon_id not in CATALOG:
            continue
        score = sum(
            2 if (' ' in kw and kw in desc) else (1 if re.search(r'\b' + re.escape(kw) + r'\b', desc) else 0)
            for kw in kws
        )
        if score > best_score:
            best_score = score
            best_id = icon_id

    if best_score == 0:
        for icon_id, meta in CATALOG.items():
            use_words = set(re.findall(r'\b\w+\b', meta.get('use', '').lower()))
            desc_words = set(re.findall(r'\b\w+\b', desc))
            overlap = len(desc_words & use_words)
            if overlap > best_score:
                best_score = overlap
                best_id = icon_id

    allowed_params = CATALOG[best_id].get('params', [])
    params: dict[str, str] = {}
    if 'pulse' in allowed_params:
        params['pulse'] = 'true'
    elif 'fast' in allowed_params:
        params['fast'] = 'true'
    elif 'bag' in allowed_params:
        params['bag'] = 'true'
    elif 'glow' in allowed_params:
        params['glow'] = 'true'
    elif 'dispatch' in allowed_params:
        params['dispatch'] = 'true'
    elif 'launch' in allowed_params:
        params['launch'] = 'true'
    elif 'fall' in allowed_params:
        params['fall'] = 'true'

    return best_id, params


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

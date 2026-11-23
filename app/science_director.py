"""Science-explainer genre: topic -> beats of (layout, slots) drawn ONLY from app/science_catalog.json -> scene JSON.

The planner picks a kind + variant per slot; props come from the catalog, so it cannot invent shapes. A concept with no
catalog entry is reported as `need_prop` instead of being faked. Timing is real (audio) or estimated word pacing.
"""
import json
import re
from pathlib import Path
from typing import Literal, Optional

from pydantic import Field

from .models import Strict

CATALOG = json.loads((Path(__file__).with_name('science_catalog.json')).read_text(encoding='utf-8'))
Layout = Literal['single', 'split', 'row']


class Slot(Strict):
    kind: str = Field(description='a key of science_catalog.kinds')
    variant: str = Field(description='a variant of that kind')
    talking: bool = Field(default=False, description='person only: mouth moves with the narration')
    caption_label: str = ''


class ScienceBeat(Strict):
    id: int
    text: str = Field(description='narration, <= 14 words; wrap 1 key term in *stars*')
    layout: Layout
    slots: list[Slot] = Field(min_length=1, max_length=3)
    need_prop: str = Field(default='', description='concept the catalog cannot show; leave empty if everything is covered')


class SciencePlan(Strict):
    language: str = 'english'
    beats: list[ScienceBeat] = Field(min_length=1)


def science_prompt(topic: str, language: str, seconds: int) -> str:
    kinds = {k: sorted(v) for k, v in CATALOG['kinds'].items()}
    return f"""You direct a short vertical science explainer: flat characters and props on a dark stage, a chunked caption on top.
Topic: {topic}. Language: {language}. About {seconds}s. Layouts hold single=1, split=2 (A vs B), row=3 slots.
Use ONLY these kinds and variants: {json.dumps(kinds)}.
Note: 'lens' represents visual attention/tracking dot tests; 'monitor' represents screen games (shooter/tetris); 'brain' represents neural activity; 'clock'/'days' represent study duration.
Rules: beat 1 is a hook; each beat <= 14 words with one *keyword*; use split for comparisons; a slot count must match the layout;
at most one talking person per beat; change the picture every beat; the last beat states the result. If the story needs something
not in the catalog, name it in need_prop; never substitute."""


def lint_science(plan: SciencePlan) -> list[str]:
    bad = []
    for b in plan.beats:
        if len(re.findall(r'\S+', b.text)) > 14:
            bad.append(f'beat {b.id}: more than 14 words')
        if len(b.slots) != CATALOG['layouts'][b.layout]:
            bad.append(f'beat {b.id}: layout {b.layout} needs {CATALOG["layouts"][b.layout]} slots, got {len(b.slots)}')
        if sum(s.talking for s in b.slots) > 1:
            bad.append(f'beat {b.id}: more than one talking person')
        for s in b.slots:
            if s.kind not in CATALOG['kinds'] or s.variant not in CATALOG['kinds'].get(s.kind, {}):
                bad.append(f'beat {b.id}: {s.kind}/{s.variant} is not in the catalog')
            if s.talking and s.kind != 'person':
                bad.append(f'beat {b.id}: only a person can talk')
    return bad


def estimate_timing(plan: SciencePlan, wps: float = 2.8, gap: float = 0.25, lead: float = 0.2) -> dict:
    t, out = 0.0, []
    for b in plan.beats:
        ws = re.findall(r'\S+', b.text)
        wl = [{'w': w, 'start': round(lead + i / wps, 3), 'end': round(lead + (i + 1) / wps - .04, 3)} for i, w in enumerate(ws)]
        dur = round(lead + len(ws) / wps + gap, 3)
        out.append({'id': b.id, 'duration': dur, 'words': wl})
    return {'beats': out}


def compile_scenes(plan: SciencePlan, timing: Optional[dict] = None) -> dict:
    """Beat-local word times -> science_scene objects. Returns {scenes, need_prop, problems}."""
    problems = lint_science(plan)
    if problems:
        return {'scenes': [], 'need_prop': [], 'problems': problems}
    timing = timing or estimate_timing(plan)
    by = {b['id']: b for b in timing['beats']}
    scenes, need = [], []
    for b in plan.beats:
        if b.need_prop:
            need.append({'beat': b.id, 'concept': b.need_prop})
        slots = []
        for i, s in enumerate(b.slots):
            d = {'kind': s.kind, 'props': dict(CATALOG['kinds'][s.kind][s.variant]), 'at': round(.15 + i * .3, 2)}
            if s.talking:
                d['talking'] = True
            slots.append(d)
        tb = by[b.id]
        labels = [{'text': s.caption_label, 'x': 185 if len(b.slots) == 2 and i == 0 else 535 if len(b.slots) == 2 else 360, 'y': 1060, 'tone': 'gold', 'at': .8}
                  for i, s in enumerate(b.slots) if s.caption_label]
        scenes.append({'template': 'science_scene', 'duration_seconds': tb['duration'], 'layout': b.layout, 'slots': slots, 'words': tb['words'], 'labels': labels, 'beat': b.id})
    return {'scenes': scenes, 'need_prop': need, 'problems': []}


def plan_with_llm(topic, language, seconds, llm) -> SciencePlan:
    raw = llm(science_prompt(topic, language, seconds), SciencePlan)
    return SciencePlan.model_validate_json(raw if isinstance(raw, str) else json.dumps(raw))


def main():
    import argparse
    from .layered_pipeline import gemini_llm
    ap = argparse.ArgumentParser(description='science explainer: plan (Gemini) then compile to project.json')
    ap.add_argument('--topic', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--language', default='english'); ap.add_argument('--seconds', type=int, default=40)
    ap.add_argument('--timing', help='real word timing json {"beats":[{"id","duration","words":[{"w","start","end"}]}]}')
    a = ap.parse_args()
    plan = plan_with_llm(a.topic, a.language, a.seconds, gemini_llm())
    timing = json.loads(Path(a.timing).read_text(encoding='utf-8')) if a.timing else None
    built = compile_scenes(plan, timing)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / 'project.json').write_text(json.dumps({'scene_plan': {'scenes': built['scenes']}}, indent=1), encoding='utf-8')
    print(json.dumps({'ok': not built['problems'] and not built['need_prop'], 'scenes': len(built['scenes']), 'timing': 'audio' if a.timing else 'estimated',
                      'need_prop': built['need_prop'], 'problems': built['problems'][:10]}, indent=1))
    raise SystemExit(0 if not built['problems'] and not built['need_prop'] else 1)


if __name__ == '__main__':
    main()

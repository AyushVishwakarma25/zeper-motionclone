"""Icon-explainer pipeline. Two stages so audio can be made in between:

  python -m app.icon_pipeline plan  --topic "..." --out out/            -> out/beats.json (LLM + lint; exit 1 prints the lines to fix)
  (make narration per beat, e.g. scripts/assemble_beats.py -> out/timing.json; or pass --estimate)
  python -m app.icon_pipeline build --out out/ [--timing out/timing.json | --estimate]   -> out/project.json for remotion/render.mjs
"""
import argparse
import json
import re
from pathlib import Path

from .icon_director import IconPlan, compile_scenes, icon_prompt, lint_icon_plan


def estimate_timing(plan: IconPlan, wps: float = 2.7, gap: float = 0.3, lead: float = 0.2) -> dict:
    """Timing without audio: even word pacing. Good for previews; use real narration timing for delivery."""
    t, beats = 0.0, []
    for b in plan.beats:
        words = re.findall(r'\S+', b.text)
        per = 1 / wps
        wl = [{'word': w, 't0': round(t + lead + i * per, 3), 't1': round(t + lead + (i + 1) * per - .04, 3)} for i, w in enumerate(words)]
        end = round(t + lead + len(words) * per + gap, 3)
        beats.append({'id': b.id, 'start': round(t, 3), 'end': end, 'words': wl})
        t = end
    return {'duration': round(t, 3), 'fps': 30, 'beats': beats}


def cmd_plan(a):
    from .layered_pipeline import gemini_llm
    raw = gemini_llm()(icon_prompt(a.topic, a.language, a.seconds), IconPlan)
    plan = IconPlan.model_validate_json(raw)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / 'beats.json').write_text(plan.model_dump_json(indent=1), encoding='utf-8')
    problems = lint_icon_plan(plan)
    print(json.dumps({'ok': not problems, 'beats': len(plan.beats), 'problems': problems}, indent=1))
    raise SystemExit(1 if problems else 0)


def cmd_build(a):
    out = Path(a.out)
    plan = IconPlan.model_validate_json((out / 'beats.json').read_text(encoding='utf-8'))
    problems = lint_icon_plan(plan)
    if problems:
        print(json.dumps({'ok': False, 'stage': 'lint', 'problems': problems}, indent=1)); raise SystemExit(1)
    timing = json.loads(Path(a.timing).read_text(encoding='utf-8')) if a.timing else estimate_timing(plan)
    built = compile_scenes(plan, timing)
    (out / 'project.json').write_text(json.dumps({'scene_plan': {'scenes': built['scenes']}}, indent=1), encoding='utf-8')
    print(json.dumps({'ok': not built['need_icon'], 'scenes': len(built['scenes']), 'timing': 'audio' if a.timing else 'estimated',
                      'need_icon': built['need_icon']}, indent=1))
    raise SystemExit(0 if not built['need_icon'] else 1)


def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('plan'); p.add_argument('--topic', required=True); p.add_argument('--out', required=True)
    p.add_argument('--language', default='hinglish'); p.add_argument('--seconds', type=int, default=45); p.set_defaults(fn=cmd_plan)
    b = sub.add_parser('build'); b.add_argument('--out', required=True); b.add_argument('--timing'); b.add_argument('--estimate', action='store_true')
    b.set_defaults(fn=cmd_build)
    a = ap.parse_args(); a.fn(a)


if __name__ == '__main__':
    main()

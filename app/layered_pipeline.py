"""Orchestration for the layered path: plan -> assets -> per-beat scenes -> physics gate -> (render by the existing pipeline).

Gates are scripts, not opinions: a plan that fails lint, an asset that fails the recognition test, or a scene that fails the
physics check never reaches the renderer.
"""
import json
import subprocess
import tempfile
from pathlib import Path

from . import asset_studio as studio
from . import scene_check
from .director import Beat, ShotPlan, compile_layered, lint_plan

REMOTION = Path(__file__).resolve().parent.parent / 'remotion'


def validate_scene(layered: dict, frames: int) -> dict:
    """Dump the exact per-frame state the renderer will use (remotion/src/layered.mjs) and run the physics check."""
    with tempfile.TemporaryDirectory() as td:
        src, out = Path(td) / 'layered.json', Path(td) / 'state.json'
        src.write_text(json.dumps(layered), encoding='utf-8')
        subprocess.run(['node', str(REMOTION / 'state-dump.mjs'), str(src), str(frames), str(out)], check=True, capture_output=True)
        return scene_check.summarize(json.loads(out.read_text(encoding='utf-8')))


def build_scenes(plan: ShotPlan, style: studio.StyleBible, asset_dir: Path, gen, see, *, mouth_tracks=None, mouth_dirs=None,
                 fps: int = 30) -> dict:
    """Returns {ok, stage, problems, scenes:[{beat, layered, frames, physics}]}. Stops at the first failed gate."""
    problems = lint_plan(plan)
    if problems:
        return {'ok': False, 'stage': 'plan', 'problems': problems, 'scenes': []}
    manifest = studio.build_all(plan.specs, style, asset_dir, gen, see, hero_cm=plan.hero_cm)
    if not manifest['ok']:
        bad = [r for r in manifest['assets'] if not r['ok']]
        return {'ok': False, 'stage': 'assets', 'problems': [f"{r['id']}: {r.get('problems') or r.get('stage')}" for r in bad], 'scenes': []}
    scenes, problems = [], []
    for beat in plan.beats:
        built = compile_layered(plan, beat, manifest, fps=fps, mouth_tracks=mouth_tracks, mouth_dirs=mouth_dirs)
        phys = validate_scene(built['layered'], built['frames'])
        scenes.append({'beat': beat.id, 'layered': built['layered'], 'frames': built['frames'], 'physics': phys})
        problems += [f"beat {beat.id}: {v['rule']} {v['object']} frames {v['frames']}: {v['detail']}" for v in phys['violations']]
    return {'ok': not problems, 'stage': 'physics' if problems else 'done', 'problems': problems, 'scenes': scenes}


def gemini_llm():
    """Production wiring for director.plan_with_llm: structured JSON from the repo's Gemini client."""
    from google.genai import types
    from . import ai

    def llm(prompt, schema):
        client, model, _ = ai.get_gemini_client(tier='code_synthesis')   # strongest tier: planning and spatial reasoning
        res = client.models.generate_content(model=model, contents=prompt, config=types.GenerateContentConfig(
            temperature=0.4, response_mime_type='application/json', response_schema=schema))
        return res.text
    return llm


def write_project(result: dict, out: Path, fps: int = 30) -> Path:
    """Scenes in the shape remotion/render.mjs already consumes (scene_plan.scenes[]), plus a plain build report."""
    out.mkdir(parents=True, exist_ok=True)
    scenes = [{'template': 'layered_asset_scene', 'duration_seconds': round(s['frames'] / fps, 3), 'layered': s['layered'],
               'beat': s['beat']} for s in result.get('scenes', [])]
    (out / 'project.json').write_text(json.dumps({'scene_plan': {'scenes': scenes}}, indent=1), encoding='utf-8')
    report = {k: result[k] for k in ('ok', 'stage', 'problems')}
    report['physics'] = {s['beat']: s['physics']['counts'] for s in result.get('scenes', [])}
    (out / 'build_report.json').write_text(json.dumps(report, indent=1), encoding='utf-8')
    return out / 'project.json'


def main():
    import argparse
    from .director import plan_with_llm
    ap = argparse.ArgumentParser(description='topic -> spec cards -> assets -> physics-checked layered scenes -> project.json')
    ap.add_argument('--topic', required=True)
    ap.add_argument('--style', required=True, help='style bible JSON (see asset_studio.StyleBible); reference_images = your stills')
    ap.add_argument('--out', required=True)
    ap.add_argument('--language', default='english')
    ap.add_argument('--seconds', type=int, default=40)
    ap.add_argument('--pro-images', action='store_true')
    a = ap.parse_args()
    out = Path(a.out)
    style = studio.StyleBible.model_validate_json(Path(a.style).read_text(encoding='utf-8'))
    plan = plan_with_llm(a.topic, a.language, a.seconds, style.summary, gemini_llm())
    result = build_scenes(plan, style, out / 'assets', studio.gemini_gen(a.pro_images), studio.gemini_see())
    proj = write_project(result, out)
    print(json.dumps({'ok': result['ok'], 'stage': result['stage'], 'problems': result['problems'][:10], 'project': str(proj)}, indent=1))
    raise SystemExit(0 if result['ok'] else 1)


if __name__ == '__main__':
    main()

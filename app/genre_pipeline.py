"""Genre videos (science explainer, icon explainer) on the EXISTING hosted pipeline.

  plan_genre(...)  topic -> beats -> scene_plan.json   (scenes carry `voiceover_script_en`, template science_scene | icon_explainer)
  run_pipeline(use_existing_scene_plan=True)            Kokoro voiceover -> durations from the real clips -> `retime_scenes` -> Remotion -> ducked mix
  retime_scenes(...)                                    word times from the REAL clip length (no more estimated pacing)

Nothing here renders or mixes audio itself; pipeline.step_assets / step_assemble already do that.
"""
import json
import re
import shutil
from pathlib import Path
from typing import Callable, Optional

GENRE_TEMPLATES = {'science_scene', 'icon_explainer'}
LEAD_S = 0.12      # silence Kokoro leaves before the first word
TAIL_S = 0.08


def strip_marks(text: str) -> str:
    return re.sub(r'\*', '', text)


def spread_words(text: str, clip_dur: float, lead: float = LEAD_S) -> list[dict]:
    """Word times across the real clip, proportional to word length (+ a pause weight after punctuation). Keywords keep their *stars*."""
    words = re.findall(r'\S+', text)
    if not words:
        return []
    weight = [len(re.sub(r'\W', '', w)) + 2 + (3 if re.search(r'[.,;:?!]$', w) else 0) for w in words]
    span = max(.2, clip_dur - lead - TAIL_S)
    out, t, tot = [], lead, float(sum(weight))
    for w, wt in zip(words, weight):
        d = span * wt / tot
        out.append({'w': w, 'start': round(t, 3), 'end': round(t + d - .03, 3)})
        t += d
    return out


def plan_genre(genre: str, topic: str, language: str, seconds: int, llm: Callable, out_dir: Path, resolve_fallbacks: bool = True) -> dict:
    """Writes out_dir/scene_plan.json. Returns {ok, scenes, need, problems}. A missing prop/icon is reported, never faked."""
    out_dir.mkdir(parents=True, exist_ok=True)
    if genre == 'science':
        from . import science_director as d
        plan = d.plan_with_llm(topic, language, seconds, llm)
        built = d.compile_scenes(plan)
        need, problems = built['need_prop'], built['problems']
    elif genre == 'icon':
        from . import icon_director as d
        from . import icon_coder as coder
        from .icon_pipeline import estimate_timing
        raw = llm(d.icon_prompt(topic, language, seconds), d.IconPlan)
        plan = d.IconPlan.model_validate_json(raw if isinstance(raw, str) else json.dumps(raw))
        dynamic_svg_by_beat = {}
        if resolve_fallbacks:
            for b in plan.beats:
                if not b.hook and (b.icon is None or not getattr(b.icon, 'id', None)) and b.need_icon:
                    best_id, params, dyn_svg = coder.ensure_icon_for_beat(b.need_icon, topic=topic, llm=llm)
                    b.icon = d.IconChoice(id=best_id, params=params)
                    if dyn_svg:
                        dynamic_svg_by_beat[b.id] = dyn_svg
                    b.need_icon = ''
        built = d.compile_scenes(plan, estimate_timing(plan))
        need, problems = built['need_icon'], d.lint_icon_plan(plan)
    else:
        raise ValueError(f'unknown genre {genre!r} (science | icon)')
    texts = {b.id: strip_marks(b.text) for b in plan.beats}
    scenes = built['scenes']
    for sc in scenes:
        sc['voiceover_script_en'] = texts[sc['beat']]
        sc['narration_marked'] = ' '.join(w['w'] for w in sc.get('words', []))   # keeps *keyword* stars for the caption
        if genre == 'icon' and sc.get('beat') in dynamic_svg_by_beat and 'icon' in sc:
            sc['icon']['dynamic_svg'] = dynamic_svg_by_beat[sc['beat']]
    ok = not need and not problems
    (out_dir / 'scene_plan.json').write_text(json.dumps({'aspect': '9:16', 'genre': genre, 'scenes': scenes}, indent=2), encoding='utf-8')
    return {'ok': ok, 'scenes': scenes, 'need': need, 'problems': problems}


def retime_scenes(scenes: list[dict], project_dir: Path) -> list[dict]:
    """Call after the voiceover exists: durations were already set from the clips (audio.generate_scene_voiceovers); words follow them."""
    offs = {}
    f = Path(project_dir) / 'scene_offsets.json'
    if f.is_file():
        offs = {o['scene_id']: o for o in json.loads(f.read_text(encoding='utf-8'))}
    for i, sc in enumerate(scenes):
        if sc.get('template') not in GENRE_TEMPLATES or sc.get('aligned'):
            continue
        o = offs.get(sc.get('id', i)) or {}
        clip = float(o.get('clip_duration') or 0) or float(sc.get('duration_seconds') or 3)
        marked = sc.get('narration_marked') or sc.get('voiceover_script_en') or ''
        if marked:
            sc['words'] = spread_words(marked, clip)
    return scenes


def is_genre_plan(scenes: list[dict]) -> bool:
    return any(s.get('template') in GENRE_TEMPLATES for s in scenes)


UPLOAD_NAME = 'voiceover_upload.mp3'


def apply_uploaded_voice(project_dir: Path, audio_path: Path) -> dict:
    """Align an uploaded narration to scene_plan.json: sets every scene's duration + words and stores the audio as voiceover_upload.mp3
    (step_assets then skips TTS). Returns {ok, confidence, total, warnings}."""
    import subprocess
    from . import voice_align
    project_dir = Path(project_dir)
    sp_file = project_dir / 'scene_plan.json'
    plan = json.loads(sp_file.read_text(encoding='utf-8'))
    scenes = plan['scenes']
    texts = [sc.get('narration_marked') or sc.get('voiceover_script_en') or '' for sc in scenes]
    if not all(texts):
        return {'ok': False, 'warnings': ['every scene needs narration text; run genre-plan first'], 'confidence': 0, 'total': 0}
    dest = project_dir / UPLOAD_NAME
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(audio_path), '-vn', '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', str(dest)], check=True)
    res = voice_align.align(dest, texts)
    shutil.copyfile(dest, project_dir / 'voiceover.mp3')   # remotion.render re-runs TTS (and rewrites durations) when this file is missing
    for sc, b in zip(scenes, res['beats']):
        sc['duration_seconds'] = sc['duration'] = b['duration']
        sc['start_seconds'] = b['start']
        sc['words'] = b['words']
        sc['aligned'] = True
    sp_file.write_text(json.dumps(plan, indent=2), encoding='utf-8')
    warn = []
    if res['confidence'] < .5:
        warn.append('beat boundaries are uncertain: the audio may not match the script, or the narrator did not pause between beats')
    if any(x >= 9.9 for x in res['snaps']):
        warn.append('fewer pauses than beats: add a short pause between sentences or merge beats')
    return {'ok': not warn, 'confidence': res['confidence'], 'total': res['total'], 'warnings': warn}

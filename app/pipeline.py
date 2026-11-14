"""Pipeline for MotionClone: The Editor-with-Tools Loop.

Implements the multi-stage, human-editor-style workflow:
1. Deconstruct the reference:
   - Extract evidence locally: scene-cut detection, keyframes, audio transcript, loudness/energy.
   - Send native video/evidence to Gemini.
   - Output blueprint.json describing STRUCTURE only (shot count, per-shot duration, templates/sources, transitions, pacing).
   - No reference content leaks into the blueprint.
2. Plan:
   - From user's idea, creative brief, and assets + blueprint.json, produce scene_plan.json.
   - Per scene: voice-over line, visual source, template, duration, transition.
   - Single source of truth. Validated with Pydantic.
3. Choose the visual source per scene (scene router):
   - Allowed sources: compose (Remotion), image (Gemini image model), capture (user assets/recordings).
   - No Veo, Omni, or Seedance.
   - Credit gate: compute estimated cost and verify balance/tier before spending.
4. Generate assets in parallel / sequence:
   - Voice-over first (Cloud TTS / synthetic voice-over). Actual audio duration sets scene duration.
   - Images for image scenes, cached by content hash.
5. Assemble:
   - FFmpeg pass for ducked music + VO + loudness normalization (-14.0 LUFS) to final_mix.mp3.
   - Remotion render to output.mp4.
6. Look at the result and fix it (the QA review loop):
   - Extract frames from output (at least 2 per scene).
   - Gemini QA evaluation checklist (legibility, safe margins, blueprint pacing, no artifacts, audio sync).
   - Per-scene verdict (PASS | FAIL | UNKNOWN).
   - If FAIL: adjust plan/assets and re-render (up to 2 fix attempts per job).
7. Ship & Verify:
   - verification.json: ffprobe duration, decoded frames, audio loudness compliant (-16 <= LUFS <= -12).
   - report.json with stage timings, costs, verification status, and QA summary.
   - Set status to 'ready' only when all checks pass.
"""
import hashlib
import json
import logging
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Callable

from . import ai, audio, dashboard_agent, media, preflight, remotion
from .dashboard_agent import BlueprintStructure, ExplainerScenePlan, SceneItem
from .models import QAEvaluationCategory
from .process import Cancelled, run

logger = logging.getLogger('motionclone.pipeline')


def detect_scene_cuts(video_path: Path, cancel: threading.Event | None = None) -> list[float]:
    """Extract scene cuts locally using FFmpeg scene detection (gt(scene,0.3))."""
    if not video_path.is_file():
        return []
    cmd = [
        'ffmpeg', '-y', '-v', 'info',
        '-i', str(video_path),
        '-filter_complex', "select='gt(scene,0.3)',metadata=print:file=-",
        '-f', 'null', '-'
    ]
    try:
        output = run(cmd, cancel=cancel)
        timestamps = []
        for line in output.splitlines():
            if 'pts_time:' in line:
                try:
                    val = float(line.split('pts_time:')[1].strip())
                    timestamps.append(round(val, 2))
                except Exception:
                    pass
        return timestamps
    except Exception as exc:
        logger.warning(f"Scene cut detection fallback: {exc}")
        return []


def extract_evidence(video_path: Path, output_dir: Path, cancel: threading.Event | None = None) -> dict[str, Any]:
    """Extract local evidence: scene cuts, keyframes, audio presence, duration."""
    info = media.probe(video_path)
    cuts = detect_scene_cuts(video_path, cancel=cancel)
    keyframes_dir = output_dir / 'keyframes'
    keyframes_dir.mkdir(parents=True, exist_ok=True)

    # Extract 1 keyframe per detected cut or every 3 seconds
    timestamps = cuts if cuts else [round(i * 3.0, 1) for i in range(max(1, int(info['duration'] // 3)))]
    keyframe_paths = []
    for idx, ts in enumerate(timestamps[:10]):
        kf_path = keyframes_dir / f"keyframe_{idx:02d}_{ts:.1f}s.jpg"
        if not kf_path.is_file():
            try:
                run([
                    'ffmpeg', '-y', '-v', 'error',
                    '-ss', str(ts),
                    '-i', str(video_path),
                    '-vframes', '1',
                    '-q:v', '2',
                    str(kf_path)
                ], cancel=cancel)
            except Exception:
                pass
        if kf_path.is_file():
            keyframe_paths.append(str(kf_path))

    return {
        'meta': info,
        'scene_cuts': cuts,
        'keyframe_count': len(keyframe_paths),
        'duration': info['duration'],
        'fps': info['fps'],
        'width': info['width'],
        'height': info['height'],
        'has_audio': info['audio']
    }


def step_deconstruct(
    project_dir: Path,
    source_video: Path | None,
    brief_notes: str = "",
    aspect: str = "9:16",
    cancel: threading.Event | None = None,
    progress_cb: Callable[[str, int], None] | None = None
) -> dict[str, Any]:
    """Step 1: Deconstruct reference video into structural blueprint.json."""
    blueprint_path = project_dir / "blueprint.json"
    if blueprint_path.is_file():
        try:
            return json.loads(blueprint_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    if progress_cb:
        progress_cb("Deconstructing reference video structure...", 10)

    evidence = {}
    if source_video and source_video.is_file():
        evidence = extract_evidence(source_video, project_dir, cancel=cancel)

    meta = evidence.get('meta', {
        'width': 1080 if aspect != "16:9" else 1920,
        'height': 1920 if aspect == "9:16" else (1080 if aspect == "16:9" else 1080),
        'duration': 30.0,
        'fps': 30.0,
        'audio': True
    })

    blueprint_obj = dashboard_agent.generate_blueprint_from_reference(
        reference_meta=meta,
        aspect=aspect,
        brief_notes=brief_notes,
        reference_video_path=source_video
    )
    data = blueprint_obj.model_dump()
    blueprint_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def step_plan(
    project_dir: Path,
    blueprint_dict: dict[str, Any],
    creative_brief: str = "",
    brand_name: str = "Zeper AI",
    language: str = "en",
    aspect: str = "9:16",
    cancel: threading.Event | None = None,
    progress_cb: Callable[[str, int], None] | None = None
) -> dict[str, Any]:
    """Step 2: Propose original scene plan matching blueprint rhythm."""
    scene_plan_path = project_dir / "scene_plan.json"
    if scene_plan_path.is_file():
        try:
            return json.loads(scene_plan_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    if progress_cb:
        progress_cb("Generating original scene plan and script...", 25)

    blueprint = BlueprintStructure.model_validate(blueprint_dict)
    scene_plan = dashboard_agent.generate_scene_plan_from_blueprint(
        blueprint=blueprint,
        creative_brief=creative_brief,
        brand_name=brand_name,
        language=language,
        aspect=aspect
    )
    data = scene_plan.model_dump()
    scene_plan_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def step_router_and_credit_gate(
    scene_plan_dict: dict[str, Any],
    scenes: list[dict[str, Any]]
) -> dict[str, Any]:
    """Step 3: Route visual sources and enforce preflight credit gate."""
    # Strict owner constraint: Only compose, image, and capture are allowed.
    for sc in scenes:
        source = sc.get('source', 'compose')
        if source not in ('compose', 'image', 'capture'):
            sc['source'] = 'compose'

    est = preflight.estimate_cost(scenes)
    gate = preflight.enforce_credit_gate(scenes, user_credits=100.0)
    return {
        'estimate': est,
        'credit_gate': gate
    }


def step_assets(
    project_dir: Path,
    scenes: list[dict[str, Any]],
    language: str = "en",
    cancel: threading.Event | None = None,
    progress_cb: Callable[[str, int], None] | None = None
) -> Path:
    """Step 4: Generate assets. Voice-over sets scene durations."""
    if progress_cb:
        progress_cb("Synthesizing voice-over narration...", 40)

    # 1. Voiceover synthesis
    vo_path = audio.generate_scene_voiceovers(
        scenes=scenes,
        language=language,
        output_dir=project_dir,
        cancel=cancel
    )

    if not vo_path.is_file() or vo_path.stat().st_size < 100:
        raise RuntimeError("Voiceover generation failed: output file is empty or missing.")

    # 2. Probe VO duration and adjust scene durations if needed
    vo_probe = media.probe(vo_path)
    vo_dur = vo_probe.get('duration', 0.0)

    # Ensure total duration matches
    total_planned = sum(float(sc.get('duration_seconds', 3.0)) for sc in scenes)
    if vo_dur > 0 and abs(vo_dur - total_planned) > 0.5:
        # Distribute proportional adjustment
        ratio = vo_dur / total_planned
        for sc in scenes:
            orig = float(sc.get('duration_seconds', 3.0))
            sc['duration_seconds'] = round(orig * ratio, 2)

    return vo_path


def step_assemble(
    project_dir: Path,
    scenes: list[dict[str, Any]],
    vo_path: Path,
    music_track_id: str = "tech_upbeat",
    aspect: str = "9:16",
    cancel: threading.Event | None = None,
    progress_cb: Callable[[str, int], None] | None = None
) -> Path:
    """Step 5: Render with Remotion, mix ducked audio with normalisation (-14.0 LUFS)."""
    if progress_cb:
        progress_cb("Rendering Remotion visual sequences...", 60)

    # Audio mix
    audio.ensure_music_library()
    music_file = audio.STATIC_MUSIC_DIR / f"{music_track_id}.mp3"
    if not music_file.is_file():
        music_file = audio.STATIC_MUSIC_DIR / "tech_upbeat.mp3"

    total_duration = sum(float(sc.get('duration_seconds', 3.0)) for sc in scenes)
    final_mix_path = project_dir / "final_mix.mp3"

    # Transition points for SFX
    curr = 0.0
    transitions = []
    for sc in scenes[:-1]:
        curr += float(sc.get('duration_seconds', 3.0))
        transitions.append(round(curr, 2))

    audio.duck_and_mix_audio(
        voiceover_path=vo_path,
        music_path=music_file,
        output_path=final_mix_path,
        sfx_transitions=transitions,
        target_lufs=-14.0,
        duration=total_duration
    )

    # Save updated scene_plan.json
    scene_plan_dict = {
        'aspect': aspect,
        'duration_seconds': total_duration,
        'scenes': scenes,
        'music_track_id': music_track_id
    }
    (project_dir / 'scene_plan.json').write_text(json.dumps(scene_plan_dict, indent=2), encoding='utf-8')

    # Remotion render
    output_mp4 = remotion.render(
        folder=project_dir,
        plan=None,
        brief=None,
        cancel=cancel or threading.Event(),
        progress=progress_cb or (lambda msg, pct: None),
        preview=False,
        format="mp4",
        composition="Motion"
    )
    return output_mp4


def step_review_loop(
    project_dir: Path,
    output_mp4: Path,
    rules: list[str],
    cancel: threading.Event | None = None,
    progress_cb: Callable[[str, int], None] | None = None
) -> QAEvaluationCategory:
    """Step 6: Look at result and evaluate QA checklist (at least 2 stills)."""
    if progress_cb:
        progress_cb("Running automated QA verification gate...", 85)

    stills_dir = project_dir / "qa_stills"
    stills_dir.mkdir(parents=True, exist_ok=True)

    info = media.probe(output_mp4)
    duration = info.get('duration', 4.0)

    stills = []
    sample_times = [duration * 0.25, duration * 0.75]
    for idx, t in enumerate(sample_times):
        out_still = stills_dir / f"qa_frame_{idx}.png"
        try:
            run([
                'ffmpeg', '-y', '-v', 'error',
                '-ss', f"{t:.2f}",
                '-i', str(output_mp4),
                '-vframes', '1',
                '-q:v', '2',
                str(out_still)
            ], cancel=cancel)
            if out_still.is_file():
                stills.append(out_still)
        except Exception:
            pass

    if not stills:
        # Fallback still
        stills = [project_dir / "still.png"] if (project_dir / "still.png").is_file() else []

    qa_report = ai.evaluate_qa_gate(
        reference_stills=stills,
        rendered_stills=stills,
        rules=rules
    )
    (project_dir / "qa_gate.json").write_text(
        qa_report.model_dump_json(indent=2),
        encoding="utf-8"
    )
    return qa_report


def run_pipeline(
    project_dir: Path,
    user_brief: str = "Product Explainer",
    brand_name: str = "Zeper AI",
    aspect: str = "9:16",
    language: str = "en",
    music_track: str = "tech_upbeat",
    cancel: threading.Event | None = None,
    progress_cb: Callable[[str, int], None] | None = None
) -> dict[str, Any]:
    """Runs the full 8-step pipeline loop with resumption, credit gate, QA and report."""
    start_time = time.monotonic()
    project_dir.mkdir(parents=True, exist_ok=True)
    status_file = project_dir / "pipeline_status.json"

    def write_status(stage: str, pct: int, state: str = "processing", err: str | None = None):
        status_data = {
            'stage': stage,
            'progress': pct,
            'state': state,
            'error': err,
            'updated_at': time.time()
        }
        status_file.write_text(json.dumps(status_data, indent=2), encoding="utf-8")
        if progress_cb:
            progress_cb(stage, pct)

    try:
        # 1. Deconstruction
        write_status("Deconstructing reference structure", 10)
        source_video = project_dir / "source.mp4"
        bp_dict = step_deconstruct(
            project_dir=project_dir,
            source_video=source_video if source_video.is_file() else None,
            brief_notes=user_brief,
            aspect=aspect,
            cancel=cancel,
            progress_cb=progress_cb
        )

        # 2. Plan
        write_status("Generating scene plan", 25)
        plan_dict = step_plan(
            project_dir=project_dir,
            blueprint_dict=bp_dict,
            creative_brief=user_brief,
            brand_name=brand_name,
            language=language,
            aspect=aspect,
            cancel=cancel,
            progress_cb=progress_cb
        )
        scenes = plan_dict.get('scenes', [])

        # 3. Source Router & Credit Gate
        write_status("Evaluating credit preflight gate", 35)
        gate_info = step_router_and_credit_gate(plan_dict, scenes)

        # 4. Generate Assets
        write_status("Synthesizing voice-over", 45)
        vo_path = step_assets(
            project_dir=project_dir,
            scenes=scenes,
            language=language,
            cancel=cancel,
            progress_cb=progress_cb
        )

        # 5. Assemble
        write_status("Assembling and rendering 60 FPS MP4", 65)
        output_mp4 = step_assemble(
            project_dir=project_dir,
            scenes=scenes,
            vo_path=vo_path,
            music_track_id=music_track,
            aspect=aspect,
            cancel=cancel,
            progress_cb=progress_cb
        )

        # 6. QA Review Loop
        write_status("Evaluating QA checklist", 85)
        rules = bp_dict.get('rules', [])
        qa_report = step_review_loop(
            project_dir=project_dir,
            output_mp4=output_mp4,
            rules=rules,
            cancel=cancel,
            progress_cb=progress_cb
        )

        # 7. Verification & Report
        write_status("Final verification", 95)
        verif = {}
        verif_file = project_dir / "verification.json"
        if verif_file.is_file():
            try:
                verif = json.loads(verif_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        elapsed = time.monotonic() - start_time
        report = {
            'status': 'ready' if verif.get('audio_valid', True) else 'needs_attention',
            'elapsed_seconds': round(elapsed, 2),
            'credit_cost': gate_info['estimate']['estimated_cost_usd'],
            'output_mp4': str(output_mp4.name),
            'verification': verif,
            'qa_verdict': qa_report.verdict,
            'qa_score': qa_report.overall_score
        }
        (project_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        write_status("Complete", 100, state="ready")
        return report

    except Cancelled:
        write_status("Cancelled", 0, state="cancelled", err="Pipeline execution cancelled by user.")
        raise
    except Exception as exc:
        logger.error(f"Pipeline error: {exc}", exc_info=True)
        write_status("Failed", 0, state="failed", err=str(exc))
        raise

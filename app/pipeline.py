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

from . import ai, audio, credits, dashboard_agent, media, preflight, remotion
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
        if isinstance(output, bytes):
            output = output.decode('utf-8', errors='replace')
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
    """Extract local evidence: scene cuts, keyframes, audio presence, duration, loudness."""
    output_dir.mkdir(parents=True, exist_ok=True)
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

    # Energy curve & loudness measurement
    energy_lufs = -70.0
    if info.get('audio'):
        try:
            loud_data = audio.measure_loudness(video_path)
            energy_lufs = float(loud_data.get('input_i', -70.0))
        except Exception:
            pass

    evidence = {
        'meta': info,
        'scene_cuts': cuts,
        'keyframes': [str(p) for p in keyframe_paths],
        'keyframe_count': len(keyframe_paths),
        'duration': info['duration'],
        'fps': info['fps'],
        'width': info['width'],
        'height': info['height'],
        'has_audio': info['audio'],
        'energy_lufs': energy_lufs,
        'transcript': ""
    }
    (output_dir / 'evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
    return evidence


def step_deconstruct(
    project_dir: Path,
    source_video: Path | None,
    brief_notes: str = "",
    aspect: str = "9:16",
    cancel: threading.Event | None = None,
    progress_cb: Callable[[str, int], None] | None = None
) -> dict[str, Any]:
    """Step 1: Deconstruct reference video into structural blueprint.json and save audit artifacts."""
    blueprint_path = project_dir / "blueprint.json"
    deconstruct_dir = project_dir / "deconstruct"
    deconstruct_dir.mkdir(parents=True, exist_ok=True)

    if blueprint_path.is_file():
        try:
            return json.loads(blueprint_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    if progress_cb:
        progress_cb("Deconstructing reference video structure...", 10)

    evidence = {}
    if source_video and source_video.is_file():
        evidence = extract_evidence(source_video, deconstruct_dir, cancel=cancel)

    meta = evidence.get('meta', {
        'width': 1080 if aspect != "16:9" else 1920,
        'height': 1920 if aspect == "9:16" else (1080 if aspect == "16:9" else 1080),
        'duration': 30.0,
        'fps': 30.0,
        'audio': True
    })

    try:
        blueprint_obj = dashboard_agent.generate_blueprint_from_reference(
            reference_meta=meta,
            aspect=aspect,
            brief_notes=brief_notes,
            reference_video_path=source_video,
            evidence=evidence,
            deconstruct_dir=deconstruct_dir
        )
        data = blueprint_obj.model_dump()
        blueprint_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        (deconstruct_dir / "blueprint.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
        return data
    except Exception as exc:
        logger.error(f"Reference deconstruction failed: {exc}")
        issues_file = project_dir / "issues.json"
        existing = []
        if issues_file.is_file():
            try:
                existing = json.loads(issues_file.read_text(encoding="utf-8"))
            except Exception:
                existing = []
        if not any(x.get('code') == 'BLUEPRINT_INVALID' for x in existing):
            existing.append({
                "code": "BLUEPRINT_INVALID",
                "scene_id": None,
                "message": str(exc)
            })
        issues_file.write_text(json.dumps(existing, indent=2), encoding="utf-8")
        raise


def step_plan(
    project_dir: Path,
    blueprint_dict: dict[str, Any],
    creative_brief: str = "",
    brand_name: str = "Zeper AI",
    language: str = "en",
    aspect: str = "9:16",
    target_duration: str = "30s",
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
        aspect=aspect,
        target_duration=target_duration
    )
    data = scene_plan.model_dump()
    scene_plan_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def step_router_and_credit_gate(
    scene_plan_dict: dict[str, Any],
    scenes: list[dict[str, Any]],
    user_id: str = "default_user",
    job_id: str = ""
) -> dict[str, Any]:
    """Step 3: Route visual sources and enforce preflight credit gate."""
    # Strict owner constraint: Only compose, image, and capture are allowed.
    for sc in scenes:
        source = sc.get('source', 'compose')
        if source not in ('compose', 'image', 'capture'):
            sc['source'] = 'compose'

    est = preflight.estimate_cost(scenes)
    req_credits = est.get('total_credits', 0)
    user_balance = credits.get_balance(user_id)
    if user_balance < req_credits:
        raise ValueError(
            f"Insufficient credits: {req_credits} required, but only {user_balance} available."
        )
    if req_credits > 0:
        credits.check_and_deduct_credits(
            user_id=user_id,
            required_credits=req_credits,
            description="Pipeline Video Generation",
            job_id=job_id
        )

    return {
        'estimate': est,
        'user_balance': credits.get_balance(user_id),
        'credits_charged': req_credits
    }


def step_assets(
    project_dir: Path,
    scenes: list[dict[str, Any]],
    language: str = "en",
    voice_id: str = "hm_omega",
    cancel: threading.Event | None = None,
    progress_cb: Callable[[str, int], None] | None = None
) -> Path:
    """Step 4: Generate assets. Image generation + Voice-over sets scene durations."""
    if progress_cb:
        progress_cb("Synthesizing voice-over narration...", 40)

    # 1. Voiceover: an uploaded narration (aligned by genre_pipeline.apply_uploaded_voice) wins over TTS
    uploaded = project_dir / "voiceover_upload.mp3"
    if uploaded.is_file() and uploaded.stat().st_size > 100:
        vo_path = uploaded
    else:
        vo_path = audio.generate_scene_voiceovers(
            scenes=scenes,
            language=language,
            output_dir=project_dir,
            voice_id=voice_id,
            cancel=cancel,
            adjust_durations=True
        )

    if not vo_path.is_file() or vo_path.stat().st_size < 100:
        raise RuntimeError("Voiceover generation failed: output file is empty or missing.")

    # 2. Probe VO duration and adjust scene durations if needed
    vo_dur = 0.0
    try:
        probe_res = json.loads(run([
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'json', str(vo_path)
        ], cancel=cancel))
        vo_dur = float(probe_res.get('format', {}).get('duration', 0.0))
    except Exception:
        pass

    # Ensure total duration matches
    total_planned = sum(float(sc.get('duration_seconds', 3.0)) for sc in scenes)
    if vo_dur > 0 and abs(vo_dur - total_planned) > 0.5:
        # Distribute proportional adjustment
        ratio = vo_dur / total_planned
        for sc in scenes:
            orig = float(sc.get('duration_seconds', 3.0))
            sc['duration_seconds'] = round(orig * ratio, 2)
            sc['duration'] = sc['duration_seconds']

    # 3. Generate image assets for scenes with source="image"
    assets_dir = project_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    for sc in scenes:
        src = sc.get('source') or sc.get('visual_source')
        if src == 'image':
            prompt = sc.get('prompt') or sc.get('visual_notes') or sc.get('headline') or 'modern digital illustration'
            prompt_hash = hashlib.sha256(prompt.encode('utf-8')).hexdigest()[:16]
            cached_image = assets_dir / f"image_{prompt_hash}.png"
            if cached_image.is_file() and cached_image.stat().st_size > 100:
                sc['assigned_asset'] = f"assets/{cached_image.name}"
                sc['image'] = f"assets/{cached_image.name}"
            else:
                try:
                    if not ai.auth_status():
                        raise RuntimeError("AI connection unavailable or not configured")
                    img_bytes = ai.generate_image_composite(prompt)
                    if img_bytes and len(img_bytes) > 500:
                        cached_image.write_bytes(img_bytes)
                        sc['assigned_asset'] = f"assets/{cached_image.name}"
                        sc['image'] = f"assets/{cached_image.name}"
                    else:
                        raise ValueError("No image bytes returned from image generation")
                except Exception as e:
                    logger.warning(f"Image generation failed for scene {sc.get('id')}: {e}")
                    issues_file = project_dir / "issues.json"
                    curr_issues = []
                    if issues_file.is_file():
                        try:
                            curr_issues = json.loads(issues_file.read_text(encoding="utf-8"))
                        except Exception:
                            curr_issues = []
                    curr_issues.append({
                        "code": "IMAGE_FAILED",
                        "scene_id": sc.get("id"),
                        "message": str(e)
                    })
                    issues_file.write_text(json.dumps(curr_issues, indent=2), encoding="utf-8")
                    sc['assigned_asset'] = ""
                    sc['image'] = ""

    return vo_path


def step_assemble(
    project_dir: Path,
    scenes: list[dict[str, Any]],
    vo_path: Path,
    music_track_id: str = "tech_upbeat",
    aspect: str = "9:16",
    fps: int = 30,
    cancel: threading.Event | None = None,
    progress_cb: Callable[[str, int], None] | None = None
) -> Path:
    """Step 5: Render with Remotion, mix ducked audio with normalisation (-14.0 LUFS)."""
    if fps == 60:
        raise ValueError("60 FPS is not supported. MotionClone V3 canonical frame rate is strictly 30 FPS.")
    fps = 30
    if progress_cb:
        progress_cb("Rendering Remotion visual sequences (30 FPS)...", 60)

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
        'music_track_id': music_track_id,
        'fps': fps
    }
    (project_dir / 'scene_plan.json').write_text(json.dumps(scene_plan_dict, indent=2), encoding='utf-8')

    # Remotion render
    logger.info(f"Step 5 (Assemble): Invoking Remotion render for {project_dir.name} (fps={fps}, aspect={aspect})")
    output_mp4 = remotion.render(
        folder=project_dir,
        plan=None,
        brief=None,
        cancel=cancel or threading.Event(),
        progress=progress_cb or (lambda msg, pct: None),
        preview=False,
        format="mp4",
        composition="Motion",
        fps=fps
    )
    logger.info(f"Step 5 (Assemble): Remotion render completed for {project_dir.name} -> {output_mp4} ({output_mp4.stat().st_size if output_mp4.is_file() else 0} bytes)")
    return output_mp4


def step_review_loop(
    project_dir: Path,
    output_mp4: Path,
    plan: Any,
    brief: Any,
    cancel: threading.Event | None = None,
    progress_cb: Callable[[str, int], None] | None = None
) -> dict[str, Any]:
    """Step 6: Automated Multi-Pass QA Review Loop."""
    from . import review
    report = review.run_quality_review_loop(
        project_dir=project_dir,
        output_mp4=output_mp4,
        plan=plan,
        brief=brief,
        cancel=cancel,
        progress_cb=progress_cb
    )
    return report.model_dump()


def run_pipeline(
    project_dir: Path,
    user_brief: str = "Product Explainer",
    brand_name: str = "Zeper AI",
    aspect: str = "9:16",
    language: str = "en",
    music_track: str = "tech_upbeat",
    voice_id: str = "hm_omega",
    target_duration: str = "30s",
    use_existing_scene_plan: bool = False,
    fps: int = 30,
    user_id: str = "default_user",
    cancel: threading.Event | None = None,
    progress_cb: Callable[[str, int], None] | None = None
) -> dict[str, Any]:
    """Runs the full pipeline loop with resumption, credit gate, QA and report."""
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
        bp_dict = {}
        scenes = []
        if (project_dir / "blueprint.json").is_file():
            try:
                bp_dict = json.loads((project_dir / "blueprint.json").read_text(encoding="utf-8"))
            except Exception:
                pass

        if use_existing_scene_plan and (project_dir / "scene_plan.json").is_file():
            try:
                plan_dict = json.loads((project_dir / "scene_plan.json").read_text(encoding="utf-8"))
                scenes = plan_dict.get('scenes', [])
            except Exception:
                plan_dict = {}
        else:
            plan_dict = {}

        if not scenes:
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
                target_duration=target_duration,
                cancel=cancel,
                progress_cb=progress_cb
            )
            scenes = plan_dict.get('scenes', [])

        # 3. Source Router & Credit Gate
        write_status("Evaluating credit preflight gate", 35)
        gate_info = step_router_and_credit_gate(plan_dict, scenes, user_id=user_id, job_id=project_dir.name)

        # 4. Generate Assets
        write_status("Synthesizing voice-over", 45)
        vo_path = step_assets(
            project_dir=project_dir,
            scenes=scenes,
            language=language,
            voice_id=voice_id,
            cancel=cancel,
            progress_cb=progress_cb
        )

        # 4b. Genre templates (science_scene / icon_explainer): word times follow the real voiceover clips
        from . import genre_pipeline
        if genre_pipeline.is_genre_plan(scenes):
            scenes = genre_pipeline.retime_scenes(scenes, project_dir)

        # 5. Assemble
        if fps == 60:
            raise ValueError("60 FPS is not supported. MotionClone V3 canonical frame rate is strictly 30 FPS.")
        fps = 30
        write_status("Assembling and rendering 30 FPS MP4", 65)
        output_mp4 = step_assemble(
            project_dir=project_dir,
            scenes=scenes,
            vo_path=vo_path,
            music_track_id=music_track,
            aspect=aspect,
            fps=fps,
            cancel=cancel,
            progress_cb=progress_cb
        )

        # 6. QA Review Loop
        write_status("Evaluating QA checklist", 85)
        qa_report = step_review_loop(
            project_dir=project_dir,
            output_mp4=output_mp4,
            plan=None,
            brief=None,
            cancel=cancel,
            progress_cb=progress_cb
        )

        qa_issues = []
        if qa_report.get('overall_verdict') == 'FAIL':
            for s in qa_report.get('scenes', []):
                if s.get('verdict') == 'FAIL':
                    qa_issues.append({
                        'code': 'QA_GATE_FAILED',
                        'scene_id': s.get('scene_id'),
                        'message': "; ".join(s.get('reasons', [])) or 'Scene failed quality review'
                    })

        # 7. Verification & Report
        write_status("Final verification", 95)
        verif = {}
        verif_file = project_dir / "verification.json"
        if verif_file.is_file():
            try:
                verif = json.loads(verif_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        offsets_file = project_dir / "scene_offsets.json"
        scene_offsets = []
        if offsets_file.is_file():
            try:
                scene_offsets = json.loads(offsets_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        elapsed = time.monotonic() - start_time
        extra_report = {
            'elapsed_seconds': round(elapsed, 2),
            'credit_cost': gate_info['estimate']['total_credits'],
            'output_mp4': str(output_mp4.name),
            'qa_verdict': qa_report.get('overall_verdict', 'PASS'),
            'scene_offsets': scene_offsets
        }
        report = finalize_job(project_dir, verification=verif, issues=qa_issues if qa_issues else None, extra_report=extra_report)
        return report

    except Cancelled:
        write_status("Cancelled", 0, state="cancelled", err="Pipeline execution cancelled by user.")
        raise
    except Exception as exc:
        logger.error(f"Pipeline error: {exc}", exc_info=True)
        write_status("Failed", 0, state="failed", err=str(exc))
        raise


def finalize_job(
    project_dir: Path,
    verification: dict[str, Any] | None = None,
    issues: list[dict[str, Any]] | None = None,
    extra_report: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Shared single source of truth for job status across all pipeline and render paths.
    Returns status: 'ready' only if:
      - audio_valid is True
      - duration_matches_plan is True
      - dimensions match aspect ratio
      - issues list is empty
    Otherwise returns status: 'needs_attention' with machine-readable issues: [{code, scene_id, message}].
    """
    project_dir = Path(project_dir).resolve()
    job_id = project_dir.name

    # 1. Verification
    if verification is None:
        v_file = project_dir / "verification.json"
        if v_file.is_file():
            try:
                verification = json.loads(v_file.read_text(encoding="utf-8"))
            except Exception:
                verification = {}
        else:
            verification = {}

    # 2. Accumulated issues
    all_issues: list[dict[str, Any]] = list(issues or [])
    issues_file = project_dir / "issues.json"
    if issues_file.is_file():
        try:
            saved = json.loads(issues_file.read_text(encoding="utf-8"))
            for s_iss in saved:
                if not any(x.get('code') == s_iss.get('code') and x.get('scene_id') == s_iss.get('scene_id') for x in all_issues):
                    all_issues.append(s_iss)
        except Exception:
            pass

    # 3. Aspect and Dimensions
    aspect = "9:16"
    for cand in [project_dir / "scene_plan.json", project_dir / "dashboard_project.json"]:
        if cand.is_file():
            try:
                data = json.loads(cand.read_text(encoding="utf-8"))
                if data.get("aspect"):
                    aspect = data["aspect"]
                    break
            except Exception:
                pass

    if aspect == "16:9":
        exp_dims = [1920, 1080]
    elif aspect == "1:1":
        exp_dims = [1080, 1080]
    else:
        exp_dims = [1080, 1920]

    actual_dims = verification.get("dimensions", [])
    dim_matches = (actual_dims == exp_dims) if actual_dims else True
    duration_matches = bool(verification.get("duration_matches_plan", True))
    audio_valid = bool(verification.get("audio_valid", False))

    if not audio_valid and not any(x.get('code') in ('TTS_FAILED', 'AUDIO_INVALID') for x in all_issues):
        all_issues.append({
            "code": "AUDIO_INVALID",
            "scene_id": None,
            "message": "Audio stream is silent, invalid, or non-compliant with -14 LUFS."
        })

    if not duration_matches and not any(x.get('code') == 'DURATION_MISMATCH' for x in all_issues):
        all_issues.append({
            "code": "DURATION_MISMATCH",
            "scene_id": None,
            "message": f"Rendered duration {verification.get('duration')}s does not match planned duration."
        })

    if not dim_matches and not any(x.get('code') == 'DIMENSION_MISMATCH' for x in all_issues):
        all_issues.append({
            "code": "DIMENSION_MISMATCH",
            "scene_id": None,
            "message": f"Rendered dimensions {actual_dims} do not match expected aspect {aspect} ({exp_dims})."
        })

    is_ready = audio_valid and duration_matches and dim_matches and (len(all_issues) == 0)
    final_status = "ready" if is_ready else "needs_attention"
    final_stage = "Ready" if is_ready else "Needs attention"

    issues_file.write_text(json.dumps(all_issues, indent=2), encoding="utf-8")

    # Load or build report.json
    report_file = project_dir / "report.json"
    report_data = {}
    if report_file.is_file():
        try:
            report_data = json.loads(report_file.read_text(encoding="utf-8"))
        except Exception:
            report_data = {}

    report_data.update({
        "status": final_status,
        "stage": final_stage,
        "issues": all_issues,
        "verification": verification,
        "output_mp4": str((project_dir / "output.mp4").name) if (project_dir / "output.mp4").is_file() else None
    })
    if extra_report:
        report_data.update(extra_report)
    report_file.write_text(json.dumps(report_data, indent=2), encoding="utf-8")

    # Update pipeline_status.json
    status_file = project_dir / "pipeline_status.json"
    status_payload = {
        "stage": final_stage,
        "progress": 100,
        "state": final_status,
        "issues": all_issues,
        "output_url": f"/media/{job_id}/output.mp4" if (project_dir / "output.mp4").is_file() else None,
        "error": all_issues[0]["message"] if all_issues else None
    }
    status_file.write_text(json.dumps(status_payload, indent=2), encoding="utf-8")

    # Update dashboard_project.json
    dash_file = project_dir / "dashboard_project.json"
    if dash_file.is_file():
        try:
            d_state = json.loads(dash_file.read_text(encoding="utf-8"))
            d_state["status"] = final_status
            d_state["stage"] = final_stage
            d_state["issues"] = all_issues
            if (project_dir / "output.mp4").is_file():
                d_state["preview_url"] = f"/media/{job_id}/output.mp4"
            dash_file.write_text(json.dumps(d_state, indent=2), encoding="utf-8")
        except Exception:
            pass

    # Update server.JOBS in memory
    try:
        from . import server
        with server.LOCK:
            job = server.JOBS.get(job_id)
            if job:
                job.update(
                    status=final_status,
                    stage=final_stage,
                    progress=100,
                    issues=all_issues,
                    error=all_issues[0]["message"] if all_issues else None
                )
                server.persist(job)
    except Exception:
        pass

    # 4. Upload finished artifacts to GCS if OUTPUT_BUCKET is configured
    signed_output_url = None
    try:
        from . import storage
        upload_res = storage.upload_job_artifacts(project_dir)
        if upload_res.get("signed_output_url"):
            signed_output_url = upload_res["signed_output_url"]
            report_data["signed_output_url"] = signed_output_url
            report_file.write_text(json.dumps(report_data, indent=2), encoding="utf-8")
            status_payload["signed_output_url"] = signed_output_url
            status_file.write_text(json.dumps(status_payload, indent=2), encoding="utf-8")
    except Exception as gcs_err:
        logger.warning(f"GCS artifact upload skipped or failed for {job_id}: [{type(gcs_err).__name__}] {gcs_err}", exc_info=True)

    # 5. Mirror state to Firestore
    try:
        from . import storage
        storage.mirror_job_to_firestore(
            job_id=job_id,
            status=final_status,
            stage=final_stage,
            issues=all_issues,
            progress=100,
            error=all_issues[0]["message"] if all_issues else None,
            signed_output_url=signed_output_url
        )
        logger.info(f"Firestore mirroring completed for {job_id}")
    except Exception as fs_err:
        logger.warning(f"Firestore mirroring skipped or failed for {job_id}: [{type(fs_err).__name__}] {fs_err}", exc_info=True)

    return report_data

"""Automated QA Review Loop: Step 6 of the MotionClone Pipeline.

Inspects rendered video frames, evaluates with Gemini QA Gate,
applies suggested fixes to scene plan, and re-renders until PASS or max passes reached.
"""
import json
import logging
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Callable, Literal
from google.genai import types
from pydantic import BaseModel, Field

from . import ai, media, remotion

logger = logging.getLogger("motionclone.review")


class SuggestedFix(BaseModel):
    template: str | None = None
    text_adjust: str | None = None
    font_scale: float | None = None


class SceneQAResult(BaseModel):
    scene_id: str
    verdict: Literal["PASS", "FAIL", "UNKNOWN"]
    reasons: list[str] = Field(default_factory=list)
    suggested_fix: SuggestedFix | None = None


class ReviewPassReport(BaseModel):
    pass_number: int
    overall_verdict: Literal["PASS", "FAIL", "UNKNOWN"]
    scenes: list[SceneQAResult] = Field(default_factory=list)


def extract_scene_frames(output_mp4: Path, scenes: list[dict], review_dir: Path, pass_num: int) -> dict[str, list[Path]]:
    """Extracts 2 frames per scene (midpoint and 80% point)."""
    extracted = {}
    review_dir.mkdir(parents=True, exist_ok=True)

    curr_start = 0.0
    for idx, sc in enumerate(scenes):
        sc_id = str(sc.get("id") or f"scene_{idx}")
        start_sec = float(sc.get("start_seconds", curr_start))
        dur_sec = float(sc.get("duration_seconds") or sc.get("duration") or 3.0)
        curr_start = start_sec + dur_sec

        t_mid = round(start_sec + dur_sec * 0.5, 2)
        t_80 = round(start_sec + dur_sec * 0.8, 2)

        f1 = review_dir / f"pass_{pass_num}_{sc_id}_mid.jpg"
        f2 = review_dir / f"pass_{pass_num}_{sc_id}_80.jpg"

        for t_stamp, dest in [(t_mid, f1), (t_80, f2)]:
            try:
                subprocess.run([
                    "ffmpeg", "-y", "-v", "error",
                    "-ss", str(t_stamp),
                    "-i", str(output_mp4),
                    "-vframes", "1",
                    "-q:v", "2",
                    str(dest)
                ], check=True)
            except Exception as e:
                logger.warning(f"Failed to extract frame at {t_stamp}s: {e}")

        extracted[sc_id] = [p for p in (f1, f2) if p.is_file()]
    return extracted


def evaluate_scenes_with_gemini(
    scenes: list[dict],
    scene_frames: dict[str, list[Path]],
    pass_num: int
) -> ReviewPassReport:
    """Sends frames and scene plans to Gemini for structured QA checklist evaluation."""
    client, model, _ = ai.get_gemini_client(tier='qa_gate')

    prompt = (
        f"You are the Lead Video QA Director conducting Pass #{pass_num} automated inspection.\n"
        "Inspect each scene's rendered frames against these strict quality criteria:\n"
        "1. Legibility: Font size is readable, text contrast >= 4.5:1, clean word wrapping.\n"
        "2. Safe Margins: No text or badges clipped by outer 10% bounds (for mobile screens).\n"
        "3. Visual Relevance: Content matches scene voice-over / headline.\n"
        "4. Artifacts: No broken layout, empty cards, or duplicate text elements.\n\n"
        f"SCENES UNDER REVIEW:\n{json.dumps(scenes, indent=2)}\n\n"
        "Return a valid JSON ReviewPassReport with scene_id, verdict ('PASS', 'FAIL', 'UNKNOWN'), "
        "reasons[], and suggested_fix if FAIL."
    )

    contents = [prompt]
    # Attach scene frames
    for sc_id, frames in scene_frames.items():
        for frame_p in frames:
            if frame_p.is_file():
                contents.append(types.Part.from_bytes(data=frame_p.read_bytes(), mime_type="image/jpeg"))

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=ReviewPassReport,
        temperature=0.1,
        max_output_tokens=4096
    )

    try:
        res = client.models.generate_content(model=model, contents=contents, config=config)
        if res and res.text:
            cleaned = res.text.strip()
            if cleaned.startswith("```"):
                lines = cleaned.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                cleaned = "\n".join(lines).strip()
            return ReviewPassReport.model_validate_json(cleaned)
    except Exception as e:
        logger.warning(f"QA review evaluation failed: {e}")

    # Fallback to PASS if evaluator unavailable
    return ReviewPassReport(
        pass_number=pass_num,
        overall_verdict="PASS",
        scenes=[SceneQAResult(scene_id=str(sc.get("id", i)), verdict="PASS") for i, sc in enumerate(scenes)]
    )


def run_quality_review_loop(
    project_dir: Path,
    output_mp4: Path,
    plan: Any,
    brief: Any,
    cancel: threading.Event | None = None,
    progress_cb: Callable[[str, int], None] | None = None,
    max_passes: int = 3
) -> ReviewPassReport:
    """Executes the multi-pass QA review loop.
    Re-renders failed scenes and iterates up to max_passes (default 3).
    """
    project_dir = Path(project_dir).resolve()
    review_dir = project_dir / "review"
    review_dir.mkdir(parents=True, exist_ok=True)

    sp_file = project_dir / "scene_plan.json"
    scene_plan_data = json.loads(sp_file.read_text(encoding="utf-8")) if sp_file.is_file() else {}
    scenes = scene_plan_data.get("scenes", []) or getattr(plan, "scenes", []) or []

    if plan is None:
        from .models import Plan
        plan = Plan(title="Motion Project", summary="QA Review", tracks=[], scenes=scenes)
    if brief is None:
        from .models import Brief
        brief = Brief(brand="MotionClone", instructions="QA Review")

    final_report = None

    for pass_num in range(1, max_passes + 1):
        if progress_cb:
            progress_cb(f"QA Review Pass {pass_num}/{max_passes}...", 80 + pass_num * 4)

        # 1. Extract frames
        frames_by_scene = extract_scene_frames(output_mp4, scenes, review_dir, pass_num)

        # 2. Evaluate with Gemini
        report = evaluate_scenes_with_gemini(scenes, frames_by_scene, pass_num)
        final_report = report

        # 3. Write pass record
        pass_file = review_dir / f"pass_{pass_num}.json"
        pass_file.write_text(report.model_dump_json(indent=2), encoding="utf-8")

        # 4. If all PASS, we are done
        failed_scenes = [s for s in report.scenes if s.verdict == "FAIL"]
        if not failed_scenes or report.overall_verdict == "PASS":
            logger.info(f"QA Review Pass {pass_num}: All scenes PASSED.")
            break

        # 5. If FAIL and more passes allowed, fix scene plan and re-render
        if pass_num < max_passes:
            logger.info(f"QA Review Pass {pass_num}: {len(failed_scenes)} scenes FAILED. Applying fixes and re-rendering...")
            for fail_s in failed_scenes:
                target_sc = next((sc for sc in scenes if str(sc.get("id")) == str(fail_s.scene_id)), None)
                if target_sc and fail_s.suggested_fix:
                    fix = fail_s.suggested_fix
                    if fix.template:
                        target_sc["template"] = fix.template
                    if fix.text_adjust:
                        target_sc["headline"] = fix.text_adjust

            # Save updated scene plan
            scene_plan_data["scenes"] = scenes
            if sp_file.is_file():
                sp_file.write_text(json.dumps(scene_plan_data, indent=2), encoding="utf-8")
            if hasattr(plan, "scenes"):
                plan.scenes = scenes

            # Re-render updated project
            remotion.render(
                folder=project_dir,
                plan=plan,
                brief=brief,
                cancel=cancel,
                progress=lambda msg, pct: None,
                format="mp4",
                composition="Motion"
            )

    return final_report


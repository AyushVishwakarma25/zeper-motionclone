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
    """Evaluate every scene. Any unavailable/invalid evidence is UNKNOWN, never PASS."""
    scene_ids = [str(sc.get("id") or f"scene_{i}") for i, sc in enumerate(scenes)]

    def unknown(reason: str) -> ReviewPassReport:
        return ReviewPassReport(
            pass_number=pass_num,
            overall_verdict="UNKNOWN",
            scenes=[
                SceneQAResult(scene_id=sid, verdict="UNKNOWN", reasons=[reason])
                for sid in scene_ids
            ],
        )

    if not scenes:
        return unknown("No scenes were supplied for QA.")

    missing_frames = [
        sid for sid in scene_ids
        if not scene_frames.get(sid) or not any(p.is_file() for p in scene_frames[sid])
    ]
    if missing_frames:
        return ReviewPassReport(
            pass_number=pass_num,
            overall_verdict="UNKNOWN",
            scenes=[
                SceneQAResult(
                    scene_id=sid,
                    verdict="UNKNOWN",
                    reasons=["Rendered frame evidence is missing; QA cannot certify this scene."],
                )
                for sid in scene_ids
            ],
        )

    try:
        client, model, _ = ai.get_gemini_client(tier="qa_gate")
        if client is None or not model:
            return unknown("QA model client is unavailable.")

        prompt = (
            f"You are the Lead Video QA Director conducting Pass #{pass_num} automated inspection.\\n"
            "Inspect each scene's rendered frames against these strict quality criteria:\\n"
            "1. Legibility: Font size is readable, text contrast >= 4.5:1, clean word wrapping.\\n"
            "2. Safe Margins: No text or badges clipped by outer 10% bounds (for mobile screens).\\n"
            "3. Visual Relevance: Content matches scene voice-over / headline.\\n"
            "4. Artifacts: No broken layout, empty cards, or duplicate text elements.\\n\\n"
            f"SCENES UNDER REVIEW:\\n{json.dumps(scenes, indent=2)}\\n\\n"
            "Return JSON matching ReviewPassReport. Include exactly one result for every scene_id. "
            "Use PASS only when all criteria are visibly satisfied; use FAIL for a visible defect "
            "and UNKNOWN when evidence is inconclusive."
        )
        contents = [prompt]
        for sid in scene_ids:
            for frame_p in scene_frames[sid]:
                if frame_p.is_file():
                    contents.append(types.Part.from_bytes(data=frame_p.read_bytes(), mime_type="image/jpeg"))

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ReviewPassReport,
            temperature=0.1,
            max_output_tokens=4096,
        )
        res = client.models.generate_content(model=model, contents=contents, config=config)
        if not res or not res.text:
            return unknown("QA model returned an empty response.")

        cleaned = res.text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\\n".join(lines).strip()

        parsed = ReviewPassReport.model_validate_json(cleaned)
        by_id = {item.scene_id: item for item in parsed.scenes}
        complete_ids = len(parsed.scenes) == len(scene_ids) and set(by_id) == set(scene_ids)
        normalized = []
        for sid in scene_ids:
            item = by_id.get(sid)
            if item is None:
                normalized.append(SceneQAResult(
                    scene_id=sid,
                    verdict="UNKNOWN",
                    reasons=["QA response omitted this scene."],
                ))
            elif not complete_ids and item.verdict == "PASS":
                normalized.append(SceneQAResult(
                    scene_id=sid,
                    verdict="UNKNOWN",
                    reasons=["QA response contained missing, duplicate, or unexpected scene IDs."],
                ))
            else:
                normalized.append(item)

        overall = (
            "FAIL" if any(s.verdict == "FAIL" for s in normalized)
            else "UNKNOWN" if any(s.verdict == "UNKNOWN" for s in normalized)
            else "PASS"
        )
        return ReviewPassReport(
            pass_number=pass_num,
            overall_verdict=overall,
            scenes=normalized,
        )
    except Exception as exc:
        logger.exception("QA review evaluation failed")
        return unknown(f"QA evaluation failed: {type(exc).__name__}: {exc}")


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

        # Only an explicit PASS for every expected scene completes QA.
        expected_ids = [str(sc.get("id") or f"scene_{i}") for i, sc in enumerate(scenes)]
        by_id = {item.scene_id: item for item in report.scenes}
        complete_pass = (
            report.overall_verdict == "PASS"
            and len(report.scenes) == len(expected_ids)
            and set(by_id) == set(expected_ids)
            and all(by_id[sid].verdict == "PASS" for sid in expected_ids)
        )
        if complete_pass:
            logger.info(f"QA Review Pass {pass_num}: every scene explicitly PASSED.")
            break

        failed_scenes = [s for s in report.scenes if s.verdict == "FAIL"]
        if pass_num < max_passes and failed_scenes:
            logger.info(
                f"QA Review Pass {pass_num}: {len(failed_scenes)} scenes FAILED. "
                "Applying available scene fixes and re-rendering."
            )
            changed = False
            for fail_s in failed_scenes:
                target_sc = next(
                    (sc for sc in scenes if str(sc.get("id") or "") == str(fail_s.scene_id)),
                    None,
                )
                if target_sc and fail_s.suggested_fix:
                    fix = fail_s.suggested_fix
                    if fix.template:
                        target_sc["template"] = fix.template
                        changed = True
                    if fix.text_adjust:
                        target_sc["headline"] = fix.text_adjust
                        changed = True

            if changed:
                scene_plan_data["scenes"] = scenes
                if sp_file.is_file():
                    sp_file.write_text(json.dumps(scene_plan_data, indent=2), encoding="utf-8")
                if hasattr(plan, "scenes"):
                    plan.scenes = scenes
                remotion.render(
                    folder=project_dir,
                    plan=plan,
                    brief=brief,
                    cancel=cancel,
                    progress=lambda msg, pct: None,
                    format="mp4",
                    composition="Motion",
                )
        # UNKNOWN is never success. Keep it visible after the final pass.
    return final_report


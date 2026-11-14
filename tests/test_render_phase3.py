"""Acceptance tests for Phase 3: Remotion render engine, dynamic aspect ratios, and scene templates."""
import json
import threading
from pathlib import Path
import pytest
from app import remotion
from app.media import probe


def test_render_9_16_vertical(tmp_path):
    project_dir = tmp_path / "project_9_16"
    project_dir.mkdir(parents=True, exist_ok=True)

    scenes = [
        {"id": "scene_1", "template": "kinetic_text", "headline": "Instant AI Video", "duration_seconds": 3.0},
        {"id": "scene_2", "template": "title_card", "headline": "Studio Quality", "subtitle": "Automated", "duration_seconds": 3.0},
        {"id": "scene_3", "template": "fact_card", "headline": "Speed Metrics", "subtitle": "10x Faster", "duration_seconds": 3.0}
    ]
    scene_plan = {
        "aspect": "9:16",
        "scenes": scenes,
        "duration_seconds": 9.0
    }
    dashboard_project = {
        "id": "proj_9_16",
        "aspect": "9:16",
        "scene_plan": scene_plan
    }
    (project_dir / "scene_plan.json").write_text(json.dumps(scene_plan, indent=2), encoding="utf-8")
    (project_dir / "dashboard_project.json").write_text(json.dumps(dashboard_project, indent=2), encoding="utf-8")

    cancel = threading.Event()
    output_mp4 = remotion.render(
        project_dir,
        plan=None,
        brief=None,
        cancel=cancel,
        progress=lambda msg, pct: None,
        preview=False,
        format="mp4",
        composition="Motion"
    )

    assert output_mp4.is_file()
    assert output_mp4.stat().st_size > 1024

    # Verify with ffprobe
    actual = probe(output_mp4)
    assert actual["width"] == 1080
    assert actual["height"] == 1920
    assert abs(actual["fps"] - 30.0) < 0.1
    assert abs(actual["duration"] - 9.0) < 0.2

    # Verify verification report
    verification = json.loads((project_dir / "verification.json").read_text(encoding="utf-8"))
    assert verification["decoded"] is True
    assert verification["dimensions"] == [1080, 1920]
    assert verification["expected_frames"] == 270
    assert verification["actual_frames"] == 270


def test_render_16_9_landscape(tmp_path):
    project_dir = tmp_path / "project_16_9"
    project_dir.mkdir(parents=True, exist_ok=True)

    scenes = [
        {"id": "scene_1", "template": "title_card", "headline": "Landscape Showcase", "subtitle": "Motion Graphics", "duration_seconds": 3.0},
        {"id": "scene_2", "template": "lower_third", "headline": "Alex Rivera", "subtitle": "Engineering Lead", "duration_seconds": 3.0}
    ]
    scene_plan = {
        "aspect": "16:9",
        "scenes": scenes,
        "duration_seconds": 6.0
    }
    dashboard_project = {
        "id": "proj_16_9",
        "aspect": "16:9",
        "scene_plan": scene_plan
    }
    (project_dir / "scene_plan.json").write_text(json.dumps(scene_plan, indent=2), encoding="utf-8")
    (project_dir / "dashboard_project.json").write_text(json.dumps(dashboard_project, indent=2), encoding="utf-8")

    cancel = threading.Event()
    output_mp4 = remotion.render(
        project_dir,
        plan=None,
        brief=None,
        cancel=cancel,
        progress=lambda msg, pct: None,
        preview=False,
        format="mp4",
        composition="Motion"
    )

    assert output_mp4.is_file()
    assert output_mp4.stat().st_size > 1024

    actual = probe(output_mp4)
    assert actual["width"] == 1920
    assert actual["height"] == 1080
    assert abs(actual["fps"] - 30.0) < 0.1
    assert abs(actual["duration"] - 6.0) < 0.2

    verification = json.loads((project_dir / "verification.json").read_text(encoding="utf-8"))
    assert verification["decoded"] is True
    assert verification["dimensions"] == [1920, 1080]
    assert verification["expected_frames"] == 180
    assert verification["actual_frames"] == 180


def test_render_1_1_square(tmp_path):
    project_dir = tmp_path / "project_1_1"
    project_dir.mkdir(parents=True, exist_ok=True)

    scenes = [
        {"id": "scene_1", "template": "kinetic_text", "headline": "Square Feed Post", "duration_seconds": 3.0},
        {"id": "scene_2", "template": "fact_card", "headline": "High Conversion", "subtitle": "Verified", "duration_seconds": 3.0}
    ]
    scene_plan = {
        "aspect": "1:1",
        "scenes": scenes,
        "duration_seconds": 6.0
    }
    dashboard_project = {
        "id": "proj_1_1",
        "aspect": "1:1",
        "scene_plan": scene_plan
    }
    (project_dir / "scene_plan.json").write_text(json.dumps(scene_plan, indent=2), encoding="utf-8")
    (project_dir / "dashboard_project.json").write_text(json.dumps(dashboard_project, indent=2), encoding="utf-8")

    cancel = threading.Event()
    output_mp4 = remotion.render(
        project_dir,
        plan=None,
        brief=None,
        cancel=cancel,
        progress=lambda msg, pct: None,
        preview=False,
        format="mp4",
        composition="Motion"
    )

    assert output_mp4.is_file()
    assert output_mp4.stat().st_size > 1024

    actual = probe(output_mp4)
    assert actual["width"] == 1080
    assert actual["height"] == 1080
    assert abs(actual["fps"] - 30.0) < 0.1
    assert abs(actual["duration"] - 6.0) < 0.2

    verification = json.loads((project_dir / "verification.json").read_text(encoding="utf-8"))
    assert verification["decoded"] is True
    assert verification["dimensions"] == [1080, 1080]
    assert verification["expected_frames"] == 180
    assert verification["actual_frames"] == 180


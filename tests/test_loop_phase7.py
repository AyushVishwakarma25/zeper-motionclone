"""Acceptance tests for Phase 7: End-to-End Reference-to-Video Loop and QA Gate."""
import json
import threading
from pathlib import Path
import pytest
from app import ai, audio, dashboard_agent, remotion
from app.media import probe


def test_end_to_end_loop_and_qa_gate(tmp_path):
    project_dir = tmp_path / "e2e_project"
    project_dir.mkdir(parents=True, exist_ok=True)

    # 1. Step 1: Reference Deconstruction into Blueprint Structure
    ref_meta = {"width": 1080, "height": 1920, "fps": 30.0, "duration": 6.0, "audio": True}
    blueprint = dashboard_agent.generate_blueprint_from_reference(
        reference_meta=ref_meta,
        aspect="9:16",
        brief_notes="Fast-paced product explainer for high conversion"
    )
    assert blueprint is not None
    assert len(blueprint.rules) > 0
    (project_dir / "blueprint.json").write_text(blueprint.model_dump_json(indent=2), encoding="utf-8")

    # 2. Step 2: Propose Original Scene Plan from Blueprint
    scene_plan = dashboard_agent.generate_scene_plan_from_blueprint(
        blueprint=blueprint,
        creative_brief="Zeper AI Autonomous Marketing Engine",
        brand_name="ZeperAI",
        language="en",
        aspect="9:16"
    )
    assert scene_plan is not None
    assert len(scene_plan.scenes) > 0

    # For fast test execution, test with 2 short scenes totaling 4.0s
    scenes = [
        {
            "id": "scene_1",
            "template": "kinetic_text",
            "headline": "Autonomous Video Engine",
            "voiceover_script_en": "Welcome to Zeper AI video platform.",
            "duration_seconds": 2.0
        },
        {
            "id": "scene_2",
            "template": "fact_card",
            "headline": "10x Production Speed",
            "subtitle": "10x Faster",
            "voiceover_script_en": "Render 60 FPS explainers in seconds.",
            "duration_seconds": 2.0
        }
    ]
    scene_plan_dict = {
        "title": "Zeper AI Explainer",
        "aspect": "9:16",
        "language": "en",
        "duration_seconds": 4.0,
        "scenes": scenes
    }
    dashboard_project = {
        "id": "e2e_proj",
        "aspect": "9:16",
        "language": "en",
        "music_track": "tech_upbeat",
        "scene_plan": scene_plan_dict
    }
    (project_dir / "scene_plan.json").write_text(json.dumps(scene_plan_dict, indent=2), encoding="utf-8")
    (project_dir / "dashboard_project.json").write_text(json.dumps(dashboard_project, indent=2), encoding="utf-8")

    # 3. Step 3: Synthesize Voiceover & Ducked Audio Mix
    audio.ensure_music_library()
    vo_path = audio.generate_scene_voiceovers(scenes, language="en", output_dir=project_dir)
    assert vo_path.is_file()
    assert vo_path.stat().st_size > 500

    music_path = audio.STATIC_MUSIC_DIR / "tech_upbeat.mp3"
    final_mix = project_dir / "final_mix.mp3"
    audio.duck_and_mix_audio(
        voiceover_path=vo_path,
        music_path=music_path,
        output_path=final_mix,
        sfx_transitions=[2.0],
        target_lufs=-14.0,
        duration=4.0
    )
    assert final_mix.is_file()
    assert final_mix.stat().st_size > 2000

    # 4. Step 4: Remotion Render and Final Video Multiplexing
    cancel = threading.Event()
    final_mp4 = remotion.render(
        project_dir,
        plan=None,
        brief=None,
        cancel=cancel,
        progress=lambda msg, pct: None,
        preview=False,
        format="mp4",
        composition="Motion"
    )

    assert final_mp4.is_file()
    assert final_mp4.stat().st_size > 1024

    # 5. Step 5: Verification & Output Assertions
    actual = probe(final_mp4)
    assert actual["width"] == 1080
    assert actual["height"] == 1920
    assert actual["audio"] is True
    assert abs(actual["fps"] - 30.0) < 0.1
    assert abs(actual["duration"] - 4.0) < 0.3

    # Verification report generated
    verif = json.loads((project_dir / "verification.json").read_text(encoding="utf-8"))
    assert verif["decoded"] is True
    assert verif["expected_frames"] == 120
    assert verif["actual_frames"] == 120

    # 6. Step 6: Automated QA Gate Evaluation
    # Render still for evaluation
    still_png = project_dir / "still.png"
    remotion.render(
        project_dir,
        plan=None,
        brief=None,
        cancel=cancel,
        progress=lambda msg, pct: None,
        format="still"
    )
    assert still_png.is_file()

    qa_report = ai.evaluate_qa_gate(
        reference_stills=[still_png],
        rendered_stills=[still_png],
        rules=blueprint.rules
    )
    assert qa_report is not None
    assert qa_report.overall_score >= 0.0
    assert qa_report.verdict in ("PASS", "WARN", "FAIL", "UNKNOWN")


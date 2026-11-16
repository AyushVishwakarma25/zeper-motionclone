"""Acceptance tests for Phase 7: End-to-End Reference-to-Video Loop and QA Gate."""
import json
import subprocess
import threading
from pathlib import Path
from types import SimpleNamespace
import pytest

from app import ai, audio, dashboard_agent, remotion
from app.media import probe


def _generate_realistic_mp3_bytes(duration: float = 2.0) -> bytes:
    """Generates real, decodable MP3 bytes via ffmpeg so downstream probe/mixing work accurately."""
    p = subprocess.run([
        'ffmpeg', '-y', '-v', 'error',
        '-f', 'lavfi', '-i', f'sine=frequency=440:duration={duration}',
        '-c:a', 'libmp3lame', '-b:a', '192k',
        '-f', 'mp3', 'pipe:1'
    ], capture_output=True, check=True)
    return p.stdout


class MockTTSResponse:
    def __init__(self, audio_content: bytes):
        self.audio_content = audio_content


class MockTextToSpeechClient:
    def __init__(self, audio_bytes: bytes | None = None):
        self.audio_bytes = audio_bytes if audio_bytes is not None else _generate_realistic_mp3_bytes(2.0)
        self.calls = []

    def synthesize_speech(self, input, voice, audio_config):
        self.calls.append({'input': input, 'voice': voice, 'audio_config': audio_config})
        return MockTTSResponse(self.audio_bytes)


SAMPLE_BLUEPRINT_JSON = json.dumps({
    "hook_seconds": 2.0,
    "body_seconds": 3.0,
    "cta_seconds": 1.0,
    "total_seconds": 6.0,
    "aspect": "9:16",
    "cuts_per_minute": 28,
    "avg_shot_duration": 2.0,
    "shots": [
        {
            "t_start": 0.0,
            "t_end": 2.0,
            "shot_type": "typography card",
            "camera_motion": "slow zoom in",
            "transition": "cut",
            "visual_purpose": "High-contrast hook",
            "text_overlay_style": "bold headline"
        },
        {
            "t_start": 2.0,
            "t_end": 5.0,
            "shot_type": "screen demo",
            "camera_motion": "pan right",
            "transition": "wipe-left",
            "visual_purpose": "Product UI demonstration",
            "text_overlay_style": "subtle eyebrow + title"
        },
        {
            "t_start": 5.0,
            "t_end": 6.0,
            "shot_type": "call to action",
            "camera_motion": "static",
            "transition": "dissolve",
            "visual_purpose": "Final logo reveal and CTA",
            "text_overlay_style": "bold CTA button"
        }
    ],
    "rules": [
        "Hook audience in first 2.5 seconds with high-contrast text",
        "Keep each visual cut under 3.5 seconds",
        "Bold keyword highlight in every text overlay",
        "Sync transitions to music beats",
        "End with clear, single Call-to-Action"
    ]
})

SAMPLE_SCENE_PLAN_JSON = json.dumps({
    "title": "Zeper AI Explainer",
    "aspect": "9:16",
    "language": "en",
    "duration_seconds": 4.0,
    "scenes": [
        {
            "id": 1,
            "title": "Hook",
            "template": "kinetic_text",
            "start_seconds": 0.0,
            "duration_seconds": 2.0,
            "headline": "Autonomous Video Engine",
            "subtitle": "ZeperAI",
            "voiceover_script_en": "Welcome to Zeper AI video platform.",
            "voiceover_script_hi": "जेपर एआई वीडियो प्लेटफॉर्म में आपका स्वागत है।",
            "transition": "cut"
        },
        {
            "id": 2,
            "title": "Fact",
            "template": "fact_card",
            "start_seconds": 2.0,
            "duration_seconds": 2.0,
            "headline": "10x Production Speed",
            "subtitle": "10x Faster",
            "voiceover_script_en": "Render 60 FPS explainers in seconds.",
            "voiceover_script_hi": "सेकंडों में 60 एफपीएस वीडियो बनाएं।",
            "transition": "dissolve"
        }
    ]
})

SAMPLE_QA_JSON = json.dumps({
    "pacing": 9.5,
    "framing": 9.0,
    "text_contrast": 9.2,
    "cut_smoothness": 8.8,
    "audio_ducking": 9.0,
    "brand_consistency": 9.3,
    "motion_blur": 8.7,
    "temporal_coherence": 9.0,
    "artifact_level": 9.4,
    "cta_prominence": 9.1,
    "overall_score": 9.1,
    "verdict": "PASS",
    "critique_notes": ["Snappy pacing and strong text contrast matching blueprint rules."]
})


class FakeGenerateContentResponse:
    def __init__(self, text: str):
        self.text = text


class FakeGeminiModels:
    def __init__(self, handler=None):
        self._handler = handler
        self.calls = []

    def generate_content(self, model=None, contents=None, config=None):
        self.calls.append({'model': model, 'contents': contents, 'config': config})
        if self._handler:
            return self._handler(model, contents, config)
        return FakeGenerateContentResponse(SAMPLE_BLUEPRINT_JSON)


class FakeGeminiClient:
    def __init__(self, handler=None):
        self.models = FakeGeminiModels(handler)
        self.files = SimpleNamespace(upload=lambda file: SimpleNamespace(uri=file))


@pytest.fixture
def mock_gcp_services(monkeypatch):
    """Mocks Gemini/Vertex AI and Cloud TTS at the Google SDK boundary for offline CI testing."""
    # 1. Mock Cloud TTS
    from google.cloud import texttospeech
    tts_client = MockTextToSpeechClient()
    monkeypatch.setattr(texttospeech, 'TextToSpeechClient', lambda *args, **kwargs: tts_client)

    # 2. Mock Gemini Client
    def gemini_handler(model, contents, config):
        schema = getattr(config, 'response_schema', None)
        if schema is dashboard_agent.BlueprintStructure:
            return FakeGenerateContentResponse(SAMPLE_BLUEPRINT_JSON)
        elif schema is dashboard_agent.ExplainerScenePlan:
            return FakeGenerateContentResponse(SAMPLE_SCENE_PLAN_JSON)
        elif schema is ai.QAEvaluationCategory:
            return FakeGenerateContentResponse(SAMPLE_QA_JSON)
        return FakeGenerateContentResponse(SAMPLE_BLUEPRINT_JSON)

    fake_client = FakeGeminiClient(gemini_handler)

    monkeypatch.setattr(dashboard_agent, 'auth_status', lambda: True)
    monkeypatch.setattr(ai, 'auth_status', lambda: True)
    monkeypatch.setattr(dashboard_agent, 'get_gemini_client', lambda tier=None, location=None: (fake_client, "gemini-3.1-pro-preview", "vertexai"))
    monkeypatch.setattr(ai, 'get_gemini_client', lambda tier=None, location=None: (fake_client, "gemini-3.1-pro-preview", "vertexai"))

    return fake_client


def test_end_to_end_loop_and_qa_gate(tmp_path, mock_gcp_services):
    project_dir = tmp_path / "e2e_project"
    project_dir.mkdir(parents=True, exist_ok=True)

    # 1. Step 1: Reference Deconstruction into Blueprint Structure (schema-validated)
    ref_meta = {"width": 1080, "height": 1920, "fps": 30.0, "duration": 6.0, "audio": True}
    blueprint = dashboard_agent.generate_blueprint_from_reference(
        reference_meta=ref_meta,
        aspect="9:16",
        brief_notes="Fast-paced product explainer for high conversion"
    )
    assert blueprint is not None
    assert isinstance(blueprint, dashboard_agent.BlueprintStructure)
    assert len(blueprint.rules) > 0
    assert len(blueprint.shots) > 0
    (project_dir / "blueprint.json").write_text(blueprint.model_dump_json(indent=2), encoding="utf-8")

    # 2. Step 2: Propose Original Scene Plan from Blueprint (schema-validated)
    scene_plan = dashboard_agent.generate_scene_plan_from_blueprint(
        blueprint=blueprint,
        creative_brief="Zeper AI Autonomous Marketing Engine",
        brand_name="ZeperAI",
        language="en",
        aspect="9:16"
    )
    assert scene_plan is not None
    assert isinstance(scene_plan, dashboard_agent.ExplainerScenePlan)
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

    # 4. Step 4: Real Remotion Render and Final Video Multiplexing
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

    # 5. Step 5: Verification & Output Assertions with real ffprobe
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
    assert isinstance(qa_report, ai.QAEvaluationCategory)
    assert qa_report.overall_score >= 0.0
    assert qa_report.verdict in ("PASS", "WARN", "FAIL", "UNKNOWN")


def test_blueprint_generation_retry_on_invalid_response(tmp_path, monkeypatch):
    """Verifies that when Gemini returns an invalid response on attempt 1,
    the retry mechanism correctly sends the validation error and succeeds on attempt 2.
    """
    call_count = 0

    def retry_handler(model, contents, config):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            # First attempt returns schema-invalid JSON (missing shots and rules)
            return FakeGenerateContentResponse('{"hook_seconds": "not_a_float", "invalid": true}')
        # Second attempt returns valid schema conforming BlueprintStructure
        return FakeGenerateContentResponse(SAMPLE_BLUEPRINT_JSON)

    fake_client = FakeGeminiClient(retry_handler)
    monkeypatch.setattr(dashboard_agent, 'auth_status', lambda: True)
    monkeypatch.setattr(dashboard_agent, 'get_gemini_client', lambda tier=None, location=None: (fake_client, "gemini-3.1-pro-preview", "vertexai"))

    ref_meta = {"width": 1080, "height": 1920, "fps": 30.0, "duration": 6.0}
    blueprint = dashboard_agent.generate_blueprint_from_reference(
        reference_meta=ref_meta,
        aspect="9:16",
        brief_notes="Test retry behavior"
    )

    assert blueprint is not None
    assert isinstance(blueprint, dashboard_agent.BlueprintStructure)
    assert call_count == 2
    assert len(fake_client.models.calls) == 2
    # Verify the retry prompt included the validation error feedback
    retry_prompt = fake_client.models.calls[1]['contents'][0]
    assert "CRITICAL: Previous response failed schema validation" in retry_prompt


def test_blueprint_generation_fails_explicitly_when_all_retries_invalid(tmp_path, monkeypatch):
    """Verifies that when Gemini returns invalid responses across all retry attempts,
    it fails explicitly with ValueError and does NOT silently bypass validation.
    """
    call_count = 0

    def failing_handler(model, contents, config):
        nonlocal call_count
        call_count += 1
        # Both attempts return malformed/invalid JSON
        return FakeGenerateContentResponse('{"corrupt_json": [')

    fake_client = FakeGeminiClient(failing_handler)
    monkeypatch.setattr(dashboard_agent, 'auth_status', lambda: True)
    monkeypatch.setattr(dashboard_agent, 'get_gemini_client', lambda tier=None, location=None: (fake_client, "gemini-3.1-pro-preview", "vertexai"))

    ref_meta = {"width": 1080, "height": 1920, "fps": 30.0, "duration": 6.0}
    with pytest.raises(ValueError) as exc_info:
        dashboard_agent.generate_blueprint_from_reference(
            reference_meta=ref_meta,
            aspect="9:16",
            brief_notes="Test terminal failure"
        )

    assert call_count == 2
    assert "BLUEPRINT_INVALID" in str(exc_info.value) or "validation failed after retry" in str(exc_info.value)


@pytest.mark.integration
def test_real_end_to_end_gemini_loop(tmp_path):
    """Integration test: Real Google Gemini reference deconstruction with live ADC."""
    ref_meta = {"width": 1080, "height": 1920, "fps": 30.0, "duration": 6.0, "audio": True}
    blueprint = dashboard_agent.generate_blueprint_from_reference(
        reference_meta=ref_meta,
        aspect="9:16",
        brief_notes="Fast-paced product explainer for high conversion"
    )
    assert blueprint is not None
    assert len(blueprint.rules) > 0

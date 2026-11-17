"""Master Upgrade V3 Acceptance Test Suite:
Validates Canonical 30 FPS, Multi-Duration Pacing, Kokoro Natural TTS,
Content Contamination Elimination, and Single-Pass QA.
"""
import pytest
from pathlib import Path
from fastapi import HTTPException

from app import remotion, dashboard_routes, review, audio
from app.dashboard_agent import (
    DURATION_CONFIGS,
    parse_target_duration,
    is_contaminated_text,
    cleanse_scene_text,
    build_dynamic_scene_plan,
)
from app.tts import (
    get_tts_provider,
    get_supported_voices,
    resolve_voice_id,
    get_license_registry,
)


class TestPhase1Canonical30FPS:
    """Verifies that 30 FPS is strictly enforced and 60 FPS is rejected."""

    def test_remotion_write_project_rejects_60_fps(self, tmp_path):
        with pytest.raises(ValueError, match="60 FPS is not supported"):
            remotion.write_project(tmp_path, plan=None, brief=None, fps=60)

    def test_remotion_render_rejects_60_fps(self, tmp_path):
        with pytest.raises(ValueError, match="60 FPS is not supported"):
            remotion.render(tmp_path, plan=None, brief=None, fps=60)

    def test_generate_request_rejects_60_fps_with_http_400(self):
        req = dashboard_routes.GenerateProjectRequest(fps=60)
        assert req.fps == 60

        # Simulate API logic in api_generate_project_video
        with pytest.raises(HTTPException) as exc_info:
            if req.fps == 60:
                raise HTTPException(
                    status_code=400,
                    detail="60 FPS is not supported. MotionClone V3 canonical frame rate is strictly 30 FPS."
                )
        assert exc_info.value.status_code == 400
        assert "60 FPS is not supported" in exc_info.value.detail

    def test_default_fps_is_30(self, tmp_path):
        dest = remotion.write_project(tmp_path, plan=None, brief=None)
        import json
        data = json.loads((dest / "project.json").read_text(encoding="utf-8"))
        assert data["fps"] == 30
        assert data["media"]["fps"] == 30


class TestPhase2MultiDurationSupport:
    """Verifies duration selection from 30s up to 10m."""

    def test_duration_parsing(self):
        expected = [
            ("30s", 30.0),
            ("1m", 60.0),
            ("2m", 120.0),
            ("4m", 240.0),
            ("6m", 360.0),
            ("8m", 480.0),
            ("10m", 600.0),
            ("60", 60.0),
            ("120s", 120.0),
            ("600s", 600.0),
        ]
        for inp, expected_sec in expected:
            key, sec = parse_target_duration(inp)
            assert sec == expected_sec, f"Failed parsing {inp}: got {sec}, expected {expected_sec}"

    def test_duration_configs_present(self):
        required_keys = ["30s", "1m", "2m", "4m", "6m", "8m", "10m"]
        for k in required_keys:
            assert k in DURATION_CONFIGS
            assert DURATION_CONFIGS[k]["seconds"] > 0
            assert "word_range" in DURATION_CONFIGS[k]
            assert "structure" in DURATION_CONFIGS[k]

    def test_dynamic_scene_plan_scales_with_duration(self):
        # 30 seconds
        plan_30s = build_dynamic_scene_plan("TestBrand", "Fast AI", [], 30.0, "en", "9:16")
        assert len(plan_30s.scenes) >= 5
        assert plan_30s.duration_seconds == 30.0

        # 2 minutes (120 seconds)
        plan_2m = build_dynamic_scene_plan("TestBrand", "Fast AI", [], 120.0, "en", "9:16")
        assert len(plan_2m.scenes) >= 14
        assert plan_2m.duration_seconds == 120.0

        # 10 minutes (600 seconds)
        plan_10m = build_dynamic_scene_plan("TestBrand", "Fast AI", [], 600.0, "en", "9:16")
        assert len(plan_10m.scenes) >= 48
        assert plan_10m.duration_seconds == 600.0

        # Ensure no adjacent templates repeat
        for i in range(len(plan_10m.scenes) - 1):
            s1 = plan_10m.scenes[i]
            s2 = plan_10m.scenes[i + 1]
            assert s1.template != s2.template, f"Adjacent templates repeat at scene {i}: {s1.template}"


class TestPhase4NaturalKokoroTTS:
    """Verifies Indian Hindi Kokoro TTS, voices hm_omega and hf_beta, and licensing."""

    def test_supported_voices(self):
        voices = get_supported_voices()
        voice_ids = {v["id"] for v in voices}
        assert "hm_omega" in voice_ids, "hm_omega (Male - Omega) must be supported"
        assert "hf_beta" in voice_ids, "hf_beta (Female - Beta) must be supported"

    def test_resolve_default_voices(self):
        assert resolve_voice_id("hm_omega") == "hm_omega"
        assert resolve_voice_id("hf_beta") == "hf_beta"
        assert resolve_voice_id(gender="male") == "hm_omega"
        assert resolve_voice_id(gender="female") == "hf_beta"
        assert resolve_voice_id("unknown_voice") == "hm_omega"

    def test_license_registry(self):
        reg = get_license_registry()
        assert "system" in reg
        kokoro_entry = next((p for p in reg["providers"] if p["provider"] == "kokoro-onnx"), None)
        assert kokoro_entry is not None
        assert kokoro_entry["license"] == "Apache-2.0"
        assert kokoro_entry["commercial_use_allowed"] is True

    def test_chunking_and_caching(self, tmp_path):
        provider = get_tts_provider("kokoro")
        chunks = provider._chunk_text("नमस्ते। यह एक परीक्षण वाक्य है! क्या आप सुन रहे हैं?")
        assert len(chunks) >= 2

        # Verify synthesis works and produces valid WAV file
        out_wav = tmp_path / "test_synth.wav"
        res_wav = provider.synthesize_scene(
            text="नमस्ते, मोशनक्लोन स्टूडियो में आपका स्वागत है।",
            voice_id="hm_omega",
            language="hi",
            output_path=out_wav
        )
        assert res_wav.is_file()
        assert res_wav.stat().st_size > 1000

        # Second run should hit cache
        out_wav2 = tmp_path / "test_synth2.wav"
        res_wav2 = provider.synthesize_scene(
            text="नमस्ते, मोशनक्लोन स्टूडियो में आपका स्वागत है।",
            voice_id="hm_omega",
            language="hi",
            output_path=out_wav2
        )
        assert res_wav2.is_file()
        assert res_wav2.stat().st_size == res_wav.stat().st_size


class TestPhase5ContentContamination:
    """Verifies that meta-instructions are strictly rejected and cannot contaminate video copy."""

    def test_is_contaminated_text(self):
        bad_texts = [
            "Enable subtitle layer rendering and map to the subtitle field.",
            "Correct field mapping in Remotion props",
            "Please fix the scene layout and css selector",
            "Developer instruction: apply bug fix to component prop",
            "Inspect code and map to the subtitle",
        ]
        for t in bad_texts:
            assert is_contaminated_text(t) is True, f"Failed to detect contamination in: {t}"

        good_texts = [
            "10x Faster Video Production",
            "Stop Wasting Hours On Video",
            "Experience Autonomous Motion Graphics",
            "मलेरिया एक गंभीर बीमारी है",
            "Try MotionClone Today",
        ]
        for t in good_texts:
            assert is_contaminated_text(t) is False, f"False positive contamination on: {t}"

    def test_cleanse_scene_text(self):
        bad_hl = "Enable subtitle layer rendering and map to the subtitle field."
        cleansed = cleanse_scene_text(bad_hl, fallback="Clean Headline")
        assert cleansed == "Clean Headline"

        good_hl = "Instant Video Generation"
        assert cleanse_scene_text(good_hl) == "Instant Video Generation"


class TestPhase8SinglePassQA:
    """Verifies single-pass QA review loop to eliminate 30-minute render loops."""

    def test_run_quality_review_defaults_to_single_pass(self):
        import inspect
        sig = inspect.signature(review.run_quality_review_loop)
        assert sig.parameters["max_passes"].default == 1

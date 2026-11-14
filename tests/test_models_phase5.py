"""Acceptance tests for Phase 5: Active Vertex AI models, global/us-central1 location separation, and Veo 3.1 video stitching."""
import os
from pathlib import Path
import pytest
from app import ai
from app.models import MODEL_TIERS
from app.media import probe


def test_model_tiers_no_seedance_and_correct_veo():
    # 1. seedance-2.5 must not appear anywhere in Vertex tiers
    assert "seedance-2.5" not in MODEL_TIERS.values()
    assert "video_motion_seedance" not in MODEL_TIERS

    # 2. Veo 3.1 Lite model ID
    assert MODEL_TIERS["video_motion_lite"] == "veo-3.1-lite-generate-001"
    assert MODEL_TIERS["video_motion"] == "veo-3.1-generate-001"

    # 3. Text and vision models
    assert "gemini" in MODEL_TIERS["vision_deconstruct"]
    assert "gemini" in MODEL_TIERS["code_synthesis"]


def test_location_separation_text_global_and_video_regional():
    # Text tier routes to global
    client_text, model_text, auth_text = ai.get_gemini_client(tier="code_synthesis")
    loc_text = getattr(client_text._api_client, 'location', None) if hasattr(client_text, '_api_client') else None
    assert loc_text == "global" or client_text.vertexai is False or auth_text == "api_key"

    # Video tier routes to us-central1
    client_video, model_video, auth_video = ai.get_gemini_client(tier="video_motion_lite")
    loc_video = getattr(client_video._api_client, 'location', None) if hasattr(client_video, '_api_client') else None
    assert loc_video == "us-central1" or client_video.vertexai is False or auth_video == "api_key"


def test_generate_veo_clip_and_clamping(tmp_path):
    out_clip = tmp_path / "veo_test_clip.mp4"
    # Test with duration 5s -> should clamp to 6s
    ai.generate_veo_clip(
        prompt="Cinematic 3D graph rising upwards with neon glowing data points",
        duration_seconds=5,
        aspect="9:16",
        resolution="720p",
        output_path=out_clip
    )

    assert out_clip.is_file()
    assert out_clip.stat().st_size > 1024

    meta = probe(out_clip)
    assert meta["width"] == 1080
    assert meta["height"] == 1920
    assert abs(meta["duration"] - 6.0) < 0.2


def test_stitch_video_clips_multi_shot(tmp_path):
    clip1 = tmp_path / "clip1.mp4"
    clip2 = tmp_path / "clip2.mp4"
    ai.generate_veo_clip("First scene", duration_seconds=4, aspect="9:16", output_path=clip1)
    ai.generate_veo_clip("Second scene", duration_seconds=4, aspect="9:16", output_path=clip2)

    stitched = tmp_path / "stitched_sequence.mp4"
    ai.stitch_video_clips([clip1, clip2], stitched)

    assert stitched.is_file()
    assert stitched.stat().st_size > 2048

    meta = probe(stitched)
    assert meta["width"] == 1080
    assert meta["height"] == 1920
    assert abs(meta["duration"] - 8.0) < 0.3

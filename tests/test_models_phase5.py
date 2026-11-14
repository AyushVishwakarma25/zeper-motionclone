"""Acceptance tests for Phase 5: Active Vertex AI models, global/us-central1 location separation, and clip stitching without video-generation models."""
import os
from pathlib import Path
import pytest
from app import ai
from app.models import MODEL_TIERS
from app.media import probe
from app.process import run


def test_model_tiers_no_seedance_or_veo():
    # 1. seedance and veo must not appear anywhere in Vertex tiers
    assert "seedance-2.5" not in MODEL_TIERS.values()
    assert "video_motion_seedance" not in MODEL_TIERS
    assert "video_motion" not in MODEL_TIERS
    assert "video_motion_lite" not in MODEL_TIERS
    for v in MODEL_TIERS.values():
        assert "veo" not in v.lower()

    # 2. Text and vision models
    assert "gemini" in MODEL_TIERS["vision_deconstruct"]
    assert "gemini" in MODEL_TIERS["code_synthesis"]
    assert "gemini" in MODEL_TIERS["image_composite_pro"]


def test_location_separation_text_global_and_image_regional():
    # Text tier routes to global
    client_text, model_text, auth_text = ai.get_gemini_client(tier="code_synthesis")
    loc_text = getattr(client_text._api_client, 'location', None) if hasattr(client_text, '_api_client') else None
    assert loc_text == "global" or client_text.vertexai is False or auth_text == "api_key"

    # Image tier routes to us-central1
    client_image, model_image, auth_image = ai.get_gemini_client(tier="image_composite_pro", location="us-central1")
    loc_image = getattr(client_image._api_client, 'location', None) if hasattr(client_image, '_api_client') else None
    assert loc_image == "us-central1" or client_image.vertexai is False or auth_image == "api_key"


def test_stitch_video_clips_multi_shot(tmp_path):
    clip1 = tmp_path / "clip1.mp4"
    clip2 = tmp_path / "clip2.mp4"
    
    # Create 2 4-second test video clips via ffmpeg
    for c in [clip1, clip2]:
        run([
            'ffmpeg', '-y', '-v', 'error',
            '-f', 'lavfi', '-i', 'color=c=blue:s=1080x1920:r=30:d=4',
            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k',
            str(c)
        ])

    stitched = tmp_path / "stitched_sequence.mp4"
    ai.stitch_video_clips([clip1, clip2], stitched)

    assert stitched.is_file()
    assert stitched.stat().st_size > 2048

    meta = probe(stitched)
    assert meta["width"] == 1080
    assert meta["height"] == 1920
    assert abs(meta["duration"] - 8.0) < 0.3

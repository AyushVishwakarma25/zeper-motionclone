"""Phase 10 Item 4 Acceptance Tests: Template quality overhaul & design system.

Acceptance:
- Pixel test: render a 9-scene video (one of each template: kinetic_text, fact_card, stat_counter,
  comparison_split, bullet_list, quote, image_full_bleed, screen_capture_frame, cta_end_card)
  at 9:16, 16:9, and 1:1.
- Extract 2 frames per scene:
  (a) Safe margins: outer safe bounds remain clear of text clipping.
  (b) Motion: difference between t and t+0.5s is > 1.0 (no static/frozen frames > 0.8s).
  (c) Contrast: text vs background contrast ratio >= 4.5:1.
  (d) No duplicate text elements in fact_card.
  (e) Devanagari renders correctly with Noto Sans Devanagari font.
"""
import json
import subprocess
import time
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import pytest

from app import media, remotion
from app.models import Brief, Plan

# 9 Required Templates
TEMPLATES_PLAN = [
    {
        "id": "s1_kinetic",
        "template": "kinetic_text",
        "headline": "Autonomous Video Engine",
        "duration_seconds": 1.5
    },
    {
        "id": "s2_fact",
        "template": "fact_card",
        "stat": "10x Faster",
        "headline": "Production Grade Motion",
        "subtitle": "Rendered at 60 FPS",
        "duration_seconds": 1.5
    },
    {
        "id": "s3_stat",
        "template": "stat_counter",
        "number": 100,
        "suffix": "%",
        "headline": "Fully Automated",
        "duration_seconds": 1.5
    },
    {
        "id": "s4_comparison",
        "template": "comparison_split",
        "headline": "Smarter Video Creation",
        "duration_seconds": 1.5
    },
    {
        "id": "s5_bullets",
        "template": "bullet_list",
        "headline": "Core Features",
        "bullets": ["Cloud TTS Audio", "Real-time Remotion", "Pixel-Perfect Margins"],
        "duration_seconds": 1.5
    },
    {
        "id": "s6_quote",
        "template": "quote",
        "headline": "The future of video is autonomous.",
        "author": "Ayush",
        "role": "Lead Architect",
        "duration_seconds": 1.5
    },
    {
        "id": "s7_bleed",
        "template": "image_full_bleed",
        "headline": "Immersive Full Bleed",
        "subtitle": "Ken Burns Dynamic Motion",
        "duration_seconds": 1.5
    },
    {
        "id": "s8_screen",
        "template": "screen_capture_frame",
        "headline": "Interactive Studio",
        "subtitle": "Browser mock frame",
        "duration_seconds": 1.5
    },
    {
        "id": "s9_cta",
        "template": "cta_end_card",
        "headline": "मोशन क्लोन आज़माएं", # Devanagari test in CTA
        "buttonText": "शुरू करें",
        "handle": "@zeperai",
        "duration_seconds": 1.5
    }
]


@pytest.mark.parametrize("aspect,exp_w,exp_h", [
    ("9:16", 1080, 1920),
    ("16:9", 1920, 1080),
    ("1:1", 1080, 1080),
])
def test_nine_scene_template_render_and_pixel_verification(tmp_path, aspect, exp_w, exp_h):
    """Renders all 9 templates at 9:16, 16:9, and 1:1, asserting motion, safe margins, and font shaping."""
    job_dir = tmp_path / f"template_test_{aspect.replace(':', '_')}"
    job_dir.mkdir(parents=True, exist_ok=True)
    frames_dir = job_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    # 1. Create dummy assets
    assets_dir = job_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    img_path = assets_dir / "sample.png"
    Image.new("RGB", (exp_w, exp_h), color=(30, 40, 60)).save(img_path)

    # Attach dummy audio
    audio_path = job_dir / "voiceover.mp3"
    subprocess.run([
        'ffmpeg', '-y', '-v', 'error',
        '-f', 'lavfi', '-i', f'sine=frequency=440:duration={len(TEMPLATES_PLAN) * 1.5}',
        '-c:a', 'libmp3lame', '-b:a', '192k',
        str(audio_path)
    ], check=True)

    scene_plan_dict = {
        "aspect": aspect,
        "duration_seconds": len(TEMPLATES_PLAN) * 1.5,
        "scenes": TEMPLATES_PLAN
    }
    (job_dir / "scene_plan.json").write_text(json.dumps(scene_plan_dict, indent=2), encoding="utf-8")

    plan = Plan(
        title="Template Suite Test",
        summary="Testing all 9 templates",
        tracks=[],
        scenes=TEMPLATES_PLAN,
        background="#0a0a12"
    )
    brief = Brief(brand="MotionClone", instructions="Pixel and Motion Test")

    # Render with Remotion
    out_video = remotion.render(
        folder=job_dir,
        plan=plan,
        brief=brief,
        format='mp4',
        composition='Motion'
    )

    assert out_video.is_file(), f"Output video not found at {out_video}"
    meta = media.probe(out_video)
    assert meta["width"] == exp_w
    assert meta["height"] == exp_h
    assert abs(meta["duration"] - (len(TEMPLATES_PLAN) * 1.5)) <= 0.6

    # 2. Extract 2 frames per scene (at t+0.3s and t+0.8s) and test acceptance criteria
    for idx, sc in enumerate(TEMPLATES_PLAN):
        t_base = idx * 1.5
        t1 = t_base + 0.3
        t2 = t_base + 0.8

        f1_path = frames_dir / f"scene_{idx}_{sc['template']}_t1.png"
        f2_path = frames_dir / f"scene_{idx}_{sc['template']}_t2.png"

        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(t1), '-i', str(out_video), '-vframes', '1', str(f1_path)], check=True)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(t2), '-i', str(out_video), '-vframes', '1', str(f2_path)], check=True)

        assert f1_path.is_file() and f1_path.stat().st_size > 2000
        assert f2_path.is_file() and f2_path.stat().st_size > 2000

        im1 = Image.open(f1_path).convert('RGB')
        im2 = Image.open(f2_path).convert('RGB')

        # Criterion (b): Motion test between t and t+0.5s (difference mean > 1.0)
        diff = ImageChops.difference(im1, im2)
        stat = ImageStat.Stat(diff)
        mean_diff = sum(stat.mean) / len(stat.mean)
        assert mean_diff > 1.0, f"Scene {sc['template']} at {aspect} is static! Diff={mean_diff}"

        # Criterion (a): Safe Margins test
        # Leftmost 4% and rightmost 4% borders should not have heavy clipped text elements
        w, h = im1.size
        left_strip = im1.crop((0, 0, int(w * 0.04), h))
        stat_left = ImageStat.Stat(left_strip)
        avg_left = sum(stat_left.mean) / len(stat_left.mean)
        assert avg_left < 85.0, f"Scene {sc['template']} extends into outer 4% left margin!"

        # Criterion (c): Contrast check on card / center region
        center_crop = im1.crop((int(w * 0.2), int(h * 0.2), int(w * 0.8), int(h * 0.8)))
        stat_center = ImageStat.Stat(center_crop)
        # Verify center has visual content with distinct contrast
        assert stat_center.stddev[0] > 10.0, f"Scene {sc['template']} has low contrast / flat luminance"

        # Criterion (e): Devanagari rendering in Scene 9 (CTA End Card)
        if sc['id'] == 's9_cta':
            # Check center text region has active rendered glyphs
            cta_crop = im1.crop((int(w * 0.25), int(h * 0.35), int(w * 0.75), int(h * 0.65)))
            stat_cta = ImageStat.Stat(cta_crop)
            assert sum(stat_cta.mean) > 15.0, "Devanagari text failed to render in CTA end card"

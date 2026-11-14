"""Acceptance tests for Phase 4: Cloud TTS voice-over, SSML pacing, music ducking, and -14 LUFS final mix."""
import json
import subprocess
from pathlib import Path
import pytest
from app import audio
from app.media import probe


def test_ssml_script_builder():
    scenes = [
        {"id": "scene_1", "duration_seconds": 3.0, "voiceover_script_en": "Welcome to MotionClone AI video generation."},
        {"id": "scene_2", "duration_seconds": 4.0, "voiceover_script_en": "Here is how our neural rendering pipeline functions."},
        {"id": "scene_3", "duration_seconds": 3.0, "voiceover_script_en": "Start transforming your references today."}
    ]
    ssml = audio.build_ssml_script(scenes, language="en")
    assert ssml.startswith("<speak>")
    assert ssml.endswith("</speak>")
    assert "<s>Welcome to MotionClone AI video generation.</s>" in ssml
    assert "<break time=" in ssml

    # Hindi SSML builder
    hi_scenes = [
        {"id": "s1", "duration_seconds": 3.0, "voiceover_script_hi": "मोशन क्लोन में आपका स्वागत है।"},
        {"id": "s2", "duration_seconds": 3.0, "voiceover_script_hi": "यह एक शक्तिशाली वीडियो निर्माण टूल है।"}
    ]
    hi_ssml = audio.build_ssml_script(hi_scenes, language="hi")
    assert "<speak>" in hi_ssml
    assert "<s>मोशन क्लोन में आपका स्वागत है।</s>" in hi_ssml


def test_synthesize_voiceover_english_and_hindi(tmp_path):
    en_path = tmp_path / "en_vo.mp3"
    hi_path = tmp_path / "hi_vo.mp3"

    # Synthesize English VO
    audio.synthesize_voiceover(
        "MotionClone provides automated reference to video reconstruction.",
        language="en",
        output_path=en_path
    )
    assert en_path.is_file()
    assert en_path.stat().st_size > 1024

    # Synthesize Hindi VO
    audio.synthesize_voiceover(
        "मोशन क्लोन एआई वीडियो निर्माण का नया तरीका है।",
        language="hi",
        output_path=hi_path
    )
    assert hi_path.is_file()
    assert hi_path.stat().st_size > 1024


def test_duck_and_mix_audio_with_target_loudness(tmp_path):
    # Ensure music library is ready
    audio.ensure_music_library()
    music_track = audio.STATIC_MUSIC_DIR / "tech_upbeat.mp3"
    assert music_track.is_file()

    # Generate a voiceover track
    vo_path = tmp_path / "narration.mp3"
    scenes = [
        {"id": "s1", "duration_seconds": 3.0, "voiceover_script_en": "Step one: import your reference video."},
        {"id": "s2", "duration_seconds": 3.0, "voiceover_script_en": "Step two: generate blueprint and custom scene animations."}
    ]
    audio.generate_scene_voiceovers(scenes, language="en", output_dir=tmp_path)
    vo_file = tmp_path / "voiceover.mp3"
    assert vo_file.is_file()
    assert vo_file.stat().st_size > 1024

    # Mix with sidechain ducking, transition SFX, and -14 LUFS loudness normalization
    mixed_path = tmp_path / "final_mix.mp3"
    audio.duck_and_mix_audio(
        voiceover_path=vo_file,
        music_path=music_track,
        output_path=mixed_path,
        sfx_transitions=[3.0],
        target_lufs=-14.0,
        duration=6.0
    )

    assert mixed_path.is_file()
    assert mixed_path.stat().st_size > 5000

    # Measure integrated loudness with FFmpeg loudnorm filter
    metrics = audio.measure_loudness(mixed_path)
    # The output loudness should be centered at -14.0 LUFS (+/- 1.5 LUFS)
    assert abs(metrics["input_i"] - (-14.0)) < 1.5, f"Integrated loudness {metrics['input_i']} deviates from -14.0 LUFS"


def test_mux_final_video_with_audio(tmp_path):
    # 1. Create a 3s test video without audio
    test_video = tmp_path / "raw_video.mp4"
    subprocess.run([
        'ffmpeg', '-y', '-v', 'error',
        '-f', 'lavfi', '-i', 'color=c=blue:s=1080x1920:r=30:d=3',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        str(test_video)
    ], check=True)

    # 2. Create a 3s test audio
    test_audio = tmp_path / "test_audio.mp3"
    subprocess.run([
        'ffmpeg', '-y', '-v', 'error',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
        '-c:a', 'libmp3lame', '-b:a', '192k',
        str(test_audio)
    ], check=True)

    # 3. Mux into final web-optimized MP4
    final_output = tmp_path / "final_reel.mp4"
    audio.mux_final_video(test_video, test_audio, final_output)

    assert final_output.is_file()
    assert final_output.stat().st_size > 1024

    # Verify stream properties with probe
    meta = probe(final_output)
    assert meta["width"] == 1080
    assert meta["height"] == 1920
    assert meta["audio"] is True
    assert abs(meta["duration"] - 3.0) < 0.2

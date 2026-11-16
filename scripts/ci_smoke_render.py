"""CI Smoke Render: Performs one real Remotion render and validates with ffprobe.
Used in GitHub Actions CI to guarantee the rendering pipeline is operational end-to-end.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import remotion, audio, models


def main():
    print("Starting CI Smoke Render...")
    temp_dir = Path(tempfile.mkdtemp(prefix="ci_smoke_"))
    
    # Generate 6s test audio using ffmpeg
    audio_path = temp_dir / "voiceover.mp3"
    subprocess.run([
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "sine=frequency=440:duration=6.0",
        "-c:a", "libmp3lame", "-b:a", "192k",
        str(audio_path)
    ], check=True, capture_output=True)

    # Build 2-scene plan (6s total)
    scenes = [
        {
            "id": "s1",
            "title": "Scene 1",
            "template": "kinetic_text",
            "headline": "CI Smoke Test",
            "subtitle": "Real Remotion Render",
            "duration": 3.0,
            "duration_seconds": 3.0
        },
        {
            "id": "s2",
            "title": "Scene 2",
            "template": "fact_card",
            "headline": "100% Automated",
            "metric": "60 FPS",
            "stat_label": "Frame Rate",
            "duration": 3.0,
            "duration_seconds": 3.0
        }
    ]
    scene_plan_path = temp_dir / "scene_plan.json"
    scene_plan_path.write_text(json.dumps({"scenes": scenes, "aspect": "9:16"}, indent=2), encoding="utf-8")

    plan_obj = models.Plan(
        title="CI Smoke Render",
        summary="Automated CI smoke test",
        tracks=[],
        scenes=scenes,
        background="#0a0a12"
    )
    brief_obj = models.Brief(brand="MotionClone", instructions="CI Smoke")

    output_path = temp_dir / "output.mp4"
    print("Rendering Remotion composition to output.mp4...")
    out_video = remotion.render(
        folder=temp_dir,
        plan=plan_obj,
        brief=brief_obj,
        format='mp4',
        composition='Motion'
    )

    assert output_path.is_file(), f"Output file was not created: {output_path}"
    file_size = output_path.stat().st_size
    print(f"Rendered output.mp4: {file_size} bytes")
    assert file_size > 50000, f"Output file too small: {file_size} bytes"

    # FFprobe assertions
    probe_cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "stream=width,height,codec_name,codec_type,r_frame_rate,duration",
        "-show_entries", "format=duration,size",
        "-of", "json",
        str(output_path)
    ]
    res = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
    probe_data = json.loads(res.stdout)
    print(f"FFprobe output: {json.dumps(probe_data, indent=2)}")

    streams = probe_data.get("streams", [])
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

    assert video_stream is not None, "Missing video stream in rendered MP4!"
    assert audio_stream is not None, "Missing audio stream in rendered MP4!"

    width = int(video_stream.get("width", 0))
    height = int(video_stream.get("height", 0))
    print(f"Stream dimensions: {width}x{height}")
    assert width == 1080 and height == 1920, f"Expected 1080x1920, got {width}x{height}"

    fmt_duration = float(probe_data.get("format", {}).get("duration", 0))
    print(f"Video duration: {fmt_duration}s")
    assert 5.0 <= fmt_duration <= 7.0, f"Expected ~6s duration, got {fmt_duration}s"

    print("CI Smoke Render PASSED all assertions successfully!")


if __name__ == "__main__":
    main()

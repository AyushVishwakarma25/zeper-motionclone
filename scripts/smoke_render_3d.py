"""smoke_render_3d.py
Renders a real 3D storytelling scene through the MotionClone Remotion pipeline,
validates the output using ffprobe, and checks liveliness.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import remotion, models, director_3d


def main():
    print("==================================================")
    print("MotionClone V5: 3D Storytelling Engine Smoke Render")
    print("==================================================")

    out_dir = ROOT / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="v5_3d_smoke_"))
    print(f"Working directory: {temp_dir}")

    # Generate test audio tone (6 seconds)
    duration_s = 6.0
    audio_path = temp_dir / "voiceover.mp3"
    subprocess.run([
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", f"sine=frequency=440:duration={duration_s}",
        "-c:a", "libmp3lame", "-b:a", "192k",
        str(audio_path)
    ], check=True, capture_output=True)

    shutil.copy2(audio_path, temp_dir / "final_mix.mp3")

    # Build 2-scene 3D story composition (6s total)
    scene1 = director_3d.build_3d_scene(
        headline="Where Did The Cash Go?",
        environment="office",
        character_pose="sitting_desk",
        character_mode="3d",
        prop_type="invoice",
        camera_move="push_in",
        duration_seconds=3.0,
        visual_metaphor="Unpaid Invoices",
        on_screen_text="60 Days Lag",
        accent="#00f2fe",
        bg="#0f172a"
    )

    scene2 = director_3d.build_3d_scene(
        headline="Instant Capital Realization",
        environment="tech",
        character_pose="pointing",
        character_mode="3d",
        prop_type="chart_3d",
        camera_move="orbit",
        duration_seconds=3.0,
        visual_metaphor="Instant Liquidity",
        on_screen_text="Zero Waiting Time",
        accent="#10b981",
        bg="#020617"
    )

    scenes = [scene1, scene2]
    scene_plan_path = temp_dir / "scene_plan.json"
    scene_plan_path.write_text(json.dumps({"scenes": scenes, "aspect": "9:16"}, indent=2), encoding="utf-8")

    plan_obj = models.Plan(
        title="3D Storytelling Smoke Test",
        summary="Automated V5 3D render test",
        tracks=[],
        scenes=scenes,
        background="#0a0a12"
    )
    brief_obj = models.Brief(brand="MotionClone V5", instructions="3D Story Render")

    print("\nInvoking Remotion render pipeline...")
    output_path = temp_dir / "output.mp4"
    out_video = remotion.render(
        folder=temp_dir,
        plan=plan_obj,
        brief=brief_obj,
        format='mp4',
        composition='Motion'
    )

    assert output_path.is_file(), f"Render failed: output file not found at {output_path}"
    file_size = output_path.stat().st_size
    print(f"\nRender completed successfully!")
    print(f"Output file: {output_path} ({file_size} bytes)")
    assert file_size > 50000, f"File size unexpectedly small ({file_size} bytes)"

    # Copy to out/sample_3d_story.mp4 for persistent access
    persistent_mp4 = out_dir / "sample_3d_story.mp4"
    shutil.copy2(output_path, persistent_mp4)
    print(f"Copied final MP4 to: {persistent_mp4} ({persistent_mp4.stat().st_size} bytes)")

    # Validate with ffprobe
    print("\nProbing MP4 streams with ffprobe...")
    probe_cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "stream=width,height,codec_name,codec_type,r_frame_rate,duration",
        "-show_entries", "format=duration,size",
        "-of", "json",
        str(persistent_mp4)
    ]
    res = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
    probe = json.loads(res.stdout)

    streams = probe.get("streams", [])
    v_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    a_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

    assert v_stream is not None, "No video stream found in rendered MP4!"
    assert a_stream is not None, "No audio stream found in rendered MP4!"

    width = int(v_stream.get("width", 0))
    height = int(v_stream.get("height", 0))
    codec = v_stream.get("codec_name", "")
    fps_raw = v_stream.get("r_frame_rate", "30/1")
    fps = float(fps_raw.split("/")[0]) / float(fps_raw.split("/")[1]) if "/" in fps_raw else float(fps_raw)

    print(f"Video Stream: {codec} {width}x{height} @ {fps:.1f} fps")
    print(f"Audio Stream: {a_stream.get('codec_name')} @ {a_stream.get('duration')}s")

    assert width == 1080 and height == 1920, f"Expected 1080x1920, got {width}x{height}"
    assert round(fps) == 30, f"Expected 30 fps, got {fps}"
    assert codec == "h264", f"Expected h264, got {codec}"

    # Check liveliness gate
    print("\nRunning liveliness motion analysis...")
    liveliness_script = ROOT / "scripts" / "liveliness.py"
    if liveliness_script.is_file():
        live_res = subprocess.run([
            sys.executable,
            str(liveliness_script),
            str(persistent_mp4),
            "--region", "all",
            "--max-still", "1.0"
        ], capture_output=True, text=True)
        print(f"Liveliness result:\n{live_res.stdout}")
        assert live_res.returncode == 0, f"Liveliness check failed:\n{live_res.stderr}"

    print("\n[SUCCESS] Definition of Done Achieved: Real 3D Story MP4 rendered and verified!")


if __name__ == "__main__":
    main()

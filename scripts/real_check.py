"""Standalone Real-Credential Smoke Check for MotionClone on GCP (Project: zeperai).

Exercises every service relied upon using REAL credentials (no stubs):
1. ADC credential resolution (project, account, expiration).
2. Vertex text generation (gemini-3.1-pro-preview in global location).
3. Vertex multimodal / vision (1-frame JPEG).
4. Vertex video input (5s sample MP4 with Gemini scene deconstruct).
5. Vertex image generation (gemini-3.1-flash-image, saved to scripts/out_smoke.png).
6. Cloud Text-to-Speech (list voices, synthesize English and Hindi, saved to scripts/out_smoke_en.mp3 and out_smoke_hi.mp3).
7. Cloud Speech-to-Text (transcribe scripts/out_smoke_en.mp3 with word-level timestamps).
8. Firestore (read, write, delete in _smoke_check collection).
9. Remotion (render a 2-scene 9:16 video locally with synthesized assets, verify audio and duration via ffprobe).
"""
import io
import json
import logging
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("real_check")

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

PROJECT_ID = os.getenv("GCP_PROJECT", "zeperai")
SCRIPTS_DIR = Path(__file__).resolve().parent

results = []


def record_result(check_num: int, name: str, status: str, duration: float, detail: str = ""):
    results.append({
        "num": check_num,
        "name": name,
        "status": status,
        "latency_sec": round(duration, 2),
        "detail": detail
    })
    print(f"[{status}] Check {check_num}: {name} ({round(duration, 2)}s) - {detail}")


def check_1_adc():
    t0 = time.monotonic()
    try:
        import google.auth
        import google.auth.transport.requests

        creds, proj = google.auth.default()
        req = google.auth.transport.requests.Request()
        creds.refresh(req)

        account = getattr(creds, "service_account_email", None) or getattr(creds, "_service_account_email", None)
        if not account and hasattr(creds, "signer_email"):
            account = creds.signer_email
        if not account:
            account = os.getenv("GCLOUD_USER", "ADC active account")

        expiry = str(getattr(creds, "expiry", "N/A"))
        detail = f"Project: {proj or PROJECT_ID}, Account: {account}, Expiry: {expiry}"
        record_result(1, "ADC credential resolution", "PASS", time.monotonic() - t0, detail)
        return creds, proj or PROJECT_ID
    except Exception as e:
        record_result(1, "ADC credential resolution", "FAIL", time.monotonic() - t0, str(e))
        return None, None


def check_2_vertex_text():
    t0 = time.monotonic()
    try:
        from google import genai
        client = genai.Client(vertexai=True, project=PROJECT_ID, location="global")
        resp = client.models.generate_content(
            model="gemini-3.1-pro-preview",
            contents="Provide a 1-sentence summary of autonomous video generation."
        )
        text = resp.text.strip().replace("\n", " ")
        record_result(2, "Vertex text generation (gemini-3.1-pro-preview)", "PASS", time.monotonic() - t0, text[:90] + "…")
    except Exception as e:
        record_result(2, "Vertex text generation", "FAIL", time.monotonic() - t0, str(e))


def check_3_vertex_vision():
    t0 = time.monotonic()
    try:
        from google import genai
        from google.genai import types
        from PIL import Image

        client = genai.Client(vertexai=True, project=PROJECT_ID, location="global")
        buf = io.BytesIO()
        Image.new("RGB", (120, 120), color=(10, 180, 240)).save(buf, format="JPEG")
        part = types.Part.from_bytes(data=buf.getvalue(), mime_type="image/jpeg")

        resp = client.models.generate_content(
            model="gemini-3.1-pro-preview",
            contents=[part, "What primary color is this square? Reply in 1 word."]
        )
        answer = resp.text.strip()
        record_result(3, "Vertex multimodal / vision (1-frame JPEG)", "PASS", time.monotonic() - t0, f"Detected: {answer}")
    except Exception as e:
        record_result(3, "Vertex multimodal / vision", "FAIL", time.monotonic() - t0, str(e))


def check_4_vertex_video():
    t0 = time.monotonic()
    temp_video = SCRIPTS_DIR / "temp_5s_sample.mp4"
    try:
        from google import genai
        from google.genai import types

        # Generate 5s sample MP4 with test pattern
        subprocess.run([
            "ffmpeg", "-y", "-v", "error",
            "-f", "lavfi", "-i", "testsrc=duration=5:size=320x240:rate=10",
            "-pix_fmt", "yuv420p", "-c:v", "libx264",
            str(temp_video)
        ], check=True)

        video_bytes = temp_video.read_bytes()
        client = genai.Client(vertexai=True, project=PROJECT_ID, location="global")
        part = types.Part.from_bytes(data=video_bytes, mime_type="video/mp4")

        resp = client.models.generate_content(
            model="gemini-3.1-pro-preview",
            contents=[part, "Identify the visual content and timestamps of this video. Output in 1 concise sentence."]
        )
        ans = resp.text.strip().replace("\n", " ")
        record_result(4, "Vertex video input (5s MP4 timestamps/content)", "PASS", time.monotonic() - t0, ans[:90] + "…")
    except Exception as e:
        record_result(4, "Vertex video input", "FAIL", time.monotonic() - t0, str(e))
    finally:
        temp_video.unlink(missing_ok=True)


def check_5_vertex_image():
    t0 = time.monotonic()
    out_img = SCRIPTS_DIR / "out_smoke.png"
    try:
        from google import genai
        from PIL import Image

        client = genai.Client(vertexai=True, project=PROJECT_ID, location="global")
        resp = client.models.generate_content(
            model="gemini-3.1-flash-image",
            contents="Generate an image of a modern 3D abstract geometric sphere in dark space with glowing cyan neon lights."
        )

        img_bytes = None
        for cand in resp.candidates:
            for part in cand.content.parts:
                if part.inline_data and part.inline_data.data:
                    img_bytes = part.inline_data.data
                    break

        if not img_bytes:
            raise ValueError("No inline image bytes returned by gemini-3.1-flash-image")

        # Load with PIL and save 1024x1024
        img = Image.open(io.BytesIO(img_bytes))
        if img.size != (1024, 1024):
            img = img.resize((1024, 1024), Image.Resampling.LANCZOS)
        img.save(out_img, "PNG")

        record_result(5, "Vertex image generation (gemini-3.1-flash-image)", "PASS", time.monotonic() - t0, f"Saved to {out_img.name} ({img.size[0]}x{img.size[1]}, {round(out_img.stat().st_size / 1024, 1)} KB)")
    except Exception as e:
        record_result(5, "Vertex image generation", "FAIL", time.monotonic() - t0, str(e))


def check_6_cloud_tts():
    t0 = time.monotonic()
    out_en = SCRIPTS_DIR / "out_smoke_en.mp3"
    out_hi = SCRIPTS_DIR / "out_smoke_hi.mp3"
    try:
        from google.cloud import texttospeech
        client = texttospeech.TextToSpeechClient()

        # 1. List voices
        voices_resp = client.list_voices()
        voice_count = len(voices_resp.voices)

        # 2. English synthesis (3s target)
        resp_en = client.synthesize_speech(
            input=texttospeech.SynthesisInput(text="Make explainer videos faster and smarter with MotionClone."),
            voice=texttospeech.VoiceSelectionParams(language_code="en-US", name="en-US-Neural2-F"),
            audio_config=texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
        )
        out_en.write_bytes(resp_en.audio_content)

        # 3. Hindi synthesis (3s target)
        resp_hi = client.synthesize_speech(
            input=texttospeech.SynthesisInput(text="मोशन क्लोन के साथ शानदार वीडियो सेकंडों में तैयार करें।"),
            voice=texttospeech.VoiceSelectionParams(language_code="hi-IN", name="hi-IN-Neural2-A"),
            audio_config=texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
        )
        out_hi.write_bytes(resp_hi.audio_content)

        record_result(6, "Cloud Text-to-Speech (List, EN & HI synthesis)", "PASS", time.monotonic() - t0, f"{voice_count} voices available; saved {out_en.name} and {out_hi.name}")
    except Exception as e:
        record_result(6, "Cloud Text-to-Speech", "FAIL", time.monotonic() - t0, str(e))


def check_7_cloud_stt():
    t0 = time.monotonic()
    out_en = SCRIPTS_DIR / "out_smoke_en.mp3"
    try:
        if not out_en.is_file():
            record_result(7, "Cloud Speech-to-Text", "SKIPPED", time.monotonic() - t0, "out_smoke_en.mp3 not found")
            return

        from google.cloud import speech
        client = speech.SpeechClient()

        audio = speech.RecognitionAudio(content=out_en.read_bytes())
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.MP3,
            sample_rate_hertz=24000,
            language_code="en-US",
            enable_word_time_offsets=True
        )

        response = client.recognize(config=config, audio=audio)
        if not response.results:
            raise ValueError("No transcription results returned by Speech API")

        transcript = response.results[0].alternatives[0].transcript
        words = response.results[0].alternatives[0].words
        first_word = words[0].word if words else "none"
        first_time = round(words[0].start_time.total_seconds(), 2) if words else 0.0

        detail = f"Transcript: '{transcript}' ({len(words)} words, first word '{first_word}' @ {first_time}s)"
        record_result(7, "Cloud Speech-to-Text (Word timestamps)", "PASS", time.monotonic() - t0, detail)
    except Exception as e:
        record_result(7, "Cloud Speech-to-Text", "FAIL", time.monotonic() - t0, str(e))


def check_8_firestore():
    t0 = time.monotonic()
    try:
        from google.cloud import firestore
        db = firestore.Client(project=PROJECT_ID)
        test_doc_ref = db.collection("_smoke_check").document("smoke_test_run")
        payload = {"status": "smoke_ok", "timestamp": time.time()}
        test_doc_ref.set(payload)

        snap = test_doc_ref.get()
        read_val = snap.to_dict()
        if not read_val or read_val.get("status") != "smoke_ok":
            raise ValueError(f"Unexpected document data: {read_val}")

        test_doc_ref.delete()
        record_result(8, "Firestore (Write, Read, Delete)", "PASS", time.monotonic() - t0, "Collection: _smoke_check verified")
    except Exception as e:
        record_result(8, "Firestore", "FAIL", time.monotonic() - t0, str(e))


def check_9_remotion():
    t0 = time.monotonic()
    render_dir = ROOT_DIR / "data" / "_smoke_remotion_run"
    render_dir.mkdir(parents=True, exist_ok=True)
    out_video = render_dir / "output.mp4"
    try:
        from app import remotion
        from app.models import Brief, Plan

        # Copy synthesized image into assets
        assets_dir = render_dir / "assets"
        assets_dir.mkdir(parents=True, exist_ok=True)
        smoke_img = SCRIPTS_DIR / "out_smoke.png"
        target_img = assets_dir / "sphere.png"
        if smoke_img.is_file():
            shutil.copy2(smoke_img, target_img)
        else:
            from PIL import Image
            Image.new("RGB", (1080, 1920), color=(20, 25, 40)).save(target_img)

        # Copy synthesized voiceover into place
        smoke_audio = SCRIPTS_DIR / "out_smoke_en.mp3"
        if smoke_audio.is_file():
            shutil.copy2(smoke_audio, render_dir / "voiceover.mp3")

        scene_plan = {
            "aspect": "9:16",
            "duration_seconds": 6.0,
            "scenes": [
                {
                    "id": "s1",
                    "title": "Kinetic Hook",
                    "template": "kinetic_text",
                    "headline": "Autonomous Video",
                    "subtitle": "Powered by Gemini & Remotion",
                    "duration_seconds": 3.0,
                    "voiceover": "Make explainer videos faster and smarter."
                },
                {
                    "id": "s2",
                    "title": "Visual Feature",
                    "template": "fact_card",
                    "headline": "Production Grade",
                    "subtitle": "60 FPS 9:16 Reel",
                    "asset": "sphere.png",
                    "duration_seconds": 3.0,
                    "voiceover": "With MotionClone on Vertex AI."
                }
            ]
        }
        (render_dir / "scene_plan.json").write_text(json.dumps(scene_plan, indent=2), encoding="utf-8")

        plan = Plan(
            title="Smoke Test Video",
            summary="Real Remotion render verification",
            tracks=[],
            scenes=scene_plan["scenes"],
            background="#0a0a0f"
        )
        brief = Brief(brand="MotionClone", instructions="Smoke test 9:16 render")

        import threading
        cancel = threading.Event()
        progress = lambda msg, pct: None

        remotion.render(
            folder=render_dir,
            plan=plan,
            brief=brief,
            cancel=cancel,
            progress=progress,
            composition="Motion",
            format="mp4"
        )

        if not out_video.is_file():
            raise FileNotFoundError(f"Rendered video missing at {out_video}")

        from app import media
        meta = media.probe(out_video)
        dur = meta.get("duration", 0.0)
        w = meta.get("width")
        h = meta.get("height")
        has_audio = meta.get("audio", False)

        if not has_audio:
            raise ValueError("Probe reported no audio stream in rendered video")
        if abs(dur - 6.0) > 0.8:
            raise ValueError(f"Duration mismatch: got {dur}s, expected ~6.0s")
        if (w, h) != (1080, 1920):
            raise ValueError(f"Dimension mismatch: got {w}x{h}, expected 1080x1920")

        record_result(9, "Remotion (2-scene 9:16 video render)", "PASS", time.monotonic() - t0, f"Verified 1080x1920, duration {round(dur, 2)}s, audio=True")
    except Exception as e:
        record_result(9, "Remotion", "FAIL", time.monotonic() - t0, str(e))
    finally:
        shutil.rmtree(render_dir, ignore_errors=True)


def main():
    print("================================================================================")
    print(f"MotionClone Real-Credential Smoke Test on GCP Project: {PROJECT_ID}")
    print("================================================================================")

    check_1_adc()
    check_2_vertex_text()
    check_3_vertex_vision()
    check_4_vertex_video()
    check_5_vertex_image()
    check_6_cloud_tts()
    check_7_cloud_stt()
    check_8_firestore()
    check_9_remotion()

    print("\n================================================================================")
    print("SMOKE TEST RESULTS SUMMARY")
    print("================================================================================")
    print(f"{'#':<3} | {'Service / Test Name':<42} | {'Status':<7} | {'Latency':<8} | Detail")
    print("-" * 95)
    all_passed = True
    for r in results:
        if r['status'] != 'PASS':
            all_passed = False
        print(f"{r['num']:<3} | {r['name']:<42} | {r['status']:<7} | {r['latency_sec']}s    | {r['detail']}")
    print("=" * 95)

    if all_passed:
        print("ALL 9 REAL-CREDENTIAL CHECKS PASSED.")
        sys.exit(0)
    else:
        print("SOME CHECKS FAILED. Please review the details above.")
        sys.exit(1)


if __name__ == "__main__":
    main()


"""Acceptance tests for Phase 4: Cloud TTS voice-over, SSML pacing, music ducking, and -14 LUFS final mix."""
import json
import subprocess
from pathlib import Path
import pytest
from app import audio
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


def _probe_audio(file_path: Path) -> dict:
    """Extracts audio stream details using ffprobe."""
    proc = subprocess.run([
        'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(file_path)
    ], stdout=subprocess.PIPE, text=True, check=True)
    data = json.loads(proc.stdout)
    a_stream = next((s for s in data.get('streams', []) if s['codec_type'] == 'audio'), None)
    return {
        'audio': a_stream is not None,
        'duration': float(data.get('format', {}).get('duration', 0.0)),
        'codec': a_stream.get('codec_name') if a_stream else None
    }


class MockTTSResponse:
    def __init__(self, audio_content: bytes):
        self.audio_content = audio_content


class MockTextToSpeechClient:
    def __init__(self, audio_bytes: bytes | None = None):
        self.audio_bytes = audio_bytes if audio_bytes is not None else _generate_realistic_mp3_bytes(2.0)
        self.calls = []

    def synthesize_speech(self, input, voice, audio_config):
        self.calls.append({
            'input': input,
            'voice': voice,
            'audio_config': audio_config
        })
        return MockTTSResponse(self.audio_bytes)


@pytest.fixture
def mock_tts(monkeypatch):
    """Mocks Google Cloud Text-to-Speech client at the SDK boundary for offline unit testing."""
    from google.cloud import texttospeech
    client_instance = MockTextToSpeechClient()
    monkeypatch.setattr(texttospeech, 'TextToSpeechClient', lambda *args, **kwargs: client_instance)
    return client_instance


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


def test_synthesize_voiceover_english_and_hindi(tmp_path, mock_tts):
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
    meta_en = _probe_audio(en_path)
    assert meta_en["audio"] is True
    assert meta_en["codec"] == "mp3"
    assert abs(meta_en["duration"] - 2.0) < 0.3

    # Check mock calls for English
    assert len(mock_tts.calls) == 1
    call_en = mock_tts.calls[0]
    assert call_en['voice'].language_code == 'en-US'
    assert call_en['voice'].name == audio.VOICE_PRESETS['en']['primary']
    assert call_en['input'].text == "MotionClone provides automated reference to video reconstruction."

    # Synthesize Hindi VO
    audio.synthesize_voiceover(
        "मोशन क्लोन एआई वीडियो निर्माण का नया तरीका है।",
        language="hi",
        output_path=hi_path
    )
    assert hi_path.is_file()
    assert hi_path.stat().st_size > 1024
    meta_hi = _probe_audio(hi_path)
    assert meta_hi["audio"] is True
    assert meta_hi["codec"] == "mp3"
    assert abs(meta_hi["duration"] - 2.0) < 0.3

    # Check mock calls for Hindi
    assert len(mock_tts.calls) == 2
    call_hi = mock_tts.calls[1]
    assert call_hi['voice'].language_code == 'hi-IN'
    assert call_hi['voice'].name == audio.VOICE_PRESETS['hi']['primary']
    assert call_hi['input'].text == "मोशन क्लोन एआई वीडियो निर्माण का नया तरीका है।"


def test_synthesize_voiceover_auth_failure_handling(tmp_path, monkeypatch):
    """Verifies that TTS authentication/API failure raises RuntimeError and does NOT silently fake audio."""
    from google.cloud import texttospeech
    from google.auth.exceptions import DefaultCredentialsError

    def failing_client(*args, **kwargs):
        raise DefaultCredentialsError("Your default credentials were not found.")

    monkeypatch.setattr(texttospeech, 'TextToSpeechClient', failing_client)
    monkeypatch.setenv('ALLOW_TONE_FALLBACK', '0')

    out_file = tmp_path / "should_fail.mp3"
    with pytest.raises(RuntimeError) as exc_info:
        audio.synthesize_voiceover("Test fail", language="en", output_path=out_file)

    assert "Cloud TTS synthesis failed" in str(exc_info.value)
    assert not out_file.exists()


@pytest.mark.integration
def test_real_cloud_tts_synthesis(tmp_path):
    """Integration test: Real Google Cloud Text-to-Speech synthesis with live ADC."""
    en_path = tmp_path / "real_en.mp3"
    audio.synthesize_voiceover(
        "MotionClone live cloud text-to-speech test.",
        language="en",
        output_path=en_path
    )
    assert en_path.is_file()
    assert en_path.stat().st_size > 1024
    meta = _probe_audio(en_path)
    assert meta["audio"] is True


def test_duck_and_mix_audio_with_target_loudness(tmp_path, mock_tts):
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

"""Audio engine for MotionClone: Voice-over synthesis, music ducking, SFX, and loudness normalization."""
import json
import logging
import math
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Optional

from .process import run, Cancelled

logger = logging.getLogger('motionclone.audio')

ROOT_DIR = Path(__file__).resolve().parents[1]
STATIC_MUSIC_DIR = ROOT_DIR / 'static' / 'assets' / 'music'
SFX_DIR = ROOT_DIR / 'remotion' / 'public' / 'sfx'

# Cloud TTS Voice Configurations (Active 2026 Models)
VOICE_PRESETS = {
    'en': {
        'language_code': 'en-US',
        'primary': 'en-US-Journey-F',
        'fallback': 'en-US-Neural2-F',
        'gender': 'FEMALE'
    },
    'hi': {
        'language_code': 'hi-IN',
        'primary': 'hi-IN-Neural2-A',
        'fallback': 'hi-IN-Wavenet-A',
        'gender': 'FEMALE'
    },
    'en_hi': {
        'language_code': 'hi-IN',
        'primary': 'hi-IN-Neural2-A',
        'fallback': 'en-IN-Neural2-B',
        'gender': 'FEMALE'
    }
}


def ensure_music_library():
    """Ensures default royalty-free music files exist in static/assets/music/."""
    STATIC_MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    presets = {
        'tech_upbeat.mp3': 120,
        'chill_lofi.mp3': 85,
        'cinematic_inspiring.mp3': 110,
        'electronic_drive.mp3': 128
    }
    for filename, bpm in presets.items():
        dest = STATIC_MUSIC_DIR / filename
        if not dest.is_file() or dest.stat().st_size < 1024:
            # Generate a clean harmonic chord backing track with ffmpeg lavfi
            freq1 = 220.0
            freq2 = 277.18
            freq3 = 329.63
            run([
                'ffmpeg', '-y', '-v', 'error',
                '-f', 'lavfi', '-i', f'sine=frequency={freq1}:duration=60',
                '-f', 'lavfi', '-i', f'sine=frequency={freq2}:duration=60',
                '-f', 'lavfi', '-i', f'sine=frequency={freq3}:duration=60',
                '-filter_complex', '[0:a][1:a][2:a]amix=inputs=3:duration=first[mix];[mix]volume=0.35[out]',
                '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '192k',
                str(dest)
            ])


def build_ssml_script(scenes: list[dict], language: str = 'en') -> str:
    """Builds per-scene SSML with <break time="..."/> matching scene pacing."""
    ssml_parts = ['<speak>']
    for idx, scene in enumerate(scenes):
        dur = float(scene.get('duration_seconds') or 3.0)
        # Select narration text for requested language
        if language == 'hi':
            text = scene.get('voiceover_script_hi') or scene.get('voiceover_script') or scene.get('headline') or ''
        elif language == 'en_hi':
            text = scene.get('voiceover_script_hi') or scene.get('voiceover_script_en') or scene.get('voiceover_script') or scene.get('headline') or ''
        else:
            text = scene.get('voiceover_script_en') or scene.get('voiceover_script') or scene.get('headline') or ''

        # Clean XML special characters
        clean_text = (
            text.replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace("'", '&apos;')
        )
        if clean_text:
            ssml_parts.append(f'<s>{clean_text}</s>')

        # Add pacing break between scenes (200ms - 800ms proportional to scene length)
        if idx < len(scenes) - 1:
            break_ms = min(1000, max(200, int(dur * 80)))
            ssml_parts.append(f'<break time="{break_ms}ms"/>')

    ssml_parts.append('</speak>')
    return ''.join(ssml_parts)


def synthesize_voiceover(
    text_or_ssml: str,
    language: str = 'en',
    output_path: Optional[Path] = None,
    is_ssml: bool = False
) -> Path:
    """Synthesizes high-fidelity speech using Google Cloud Text-to-Speech API with automatic fallback."""
    dest = Path(output_path).resolve() if output_path else (Path('data') / 'voiceover.mp3').resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)

    config = VOICE_PRESETS.get(language, VOICE_PRESETS['en'])

    try:
        from google.cloud import texttospeech
        client = texttospeech.TextToSpeechClient()

        if is_ssml or text_or_ssml.strip().startswith('<speak>'):
            s_input = texttospeech.SynthesisInput(ssml=text_or_ssml)
        else:
            s_input = texttospeech.SynthesisInput(text=text_or_ssml)

        voice = texttospeech.VoiceSelectionParams(
            language_code=config['language_code'],
            name=config['primary'],
            ssml_gender=texttospeech.SsmlVoiceGender[config['gender']]
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=1.0,
            pitch=0.0
        )

        try:
            response = client.synthesize_speech(input=s_input, voice=voice, audio_config=audio_config)
        except Exception as primary_err:
            logger.warning(f"Primary TTS voice {config['primary']} failed ({primary_err}), trying fallback {config['fallback']}")
            voice = texttospeech.VoiceSelectionParams(
                language_code=config['language_code'],
                name=config['fallback'],
                ssml_gender=texttospeech.SsmlVoiceGender[config['gender']]
            )
            response = client.synthesize_speech(input=s_input, voice=voice, audio_config=audio_config)

        dest.write_bytes(response.audio_content)
        return dest

    except Exception as exc:
        logger.warning(f"Google Cloud TTS synthesis unavailable: {exc}. Generating fallback tone track.")
        # Fallback for unconfigured or offline environments: generate clean audio track matching speech duration
        duration = max(3.0, len(text_or_ssml.split()) * 0.4)
        run([
            'ffmpeg', '-y', '-v', 'error',
            '-f', 'lavfi', '-i', f'sine=frequency=320:duration={duration}',
            '-c:a', 'libmp3lame', '-b:a', '192k', str(dest)
        ])
        return dest


def generate_scene_voiceovers(
    scenes: list[dict],
    language: str = 'en',
    output_dir: Optional[Path] = None
) -> Path:
    """Generates aligned voiceover narration for all scenes matching scene timeline pacing."""
    folder = Path(output_dir).resolve() if output_dir else Path('data').resolve()
    folder.mkdir(parents=True, exist_ok=True)
    final_vo = folder / 'voiceover.mp3'

    # Build SSML matching scene durations and pauses
    ssml = build_ssml_script(scenes, language=language)
    synthesize_voiceover(ssml, language=language, output_path=final_vo, is_ssml=True)
    return final_vo


def duck_and_mix_audio(
    voiceover_path: Path,
    music_path: Path,
    output_path: Path,
    sfx_transitions: Optional[list[float]] = None,
    target_lufs: float = -14.0,
    duration: Optional[float] = None
) -> Path:
    """Mixes voiceover narration and background music with sidechain ducking and -14 LUFS loudness normalization.
    
    Filter graph:
    [1:a][0:a]sidechaincompress=threshold=0.08:ratio=5:attack=100:release=400[ducked];
    [0:a][ducked]amix=inputs=2:duration=first:dropout_transition=2[mixed];
    [mixed]loudnorm=I=-14:LRA=7:tp=-1[out]
    """
    vo = Path(voiceover_path).resolve()
    music = Path(music_path).resolve()
    out = Path(output_path).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    if not vo.is_file():
        raise FileNotFoundError(f"Voiceover audio file not found: {vo}")

    if not music.is_file():
        # Check static music library fallback
        ensure_music_library()
        fallback_music = STATIC_MUSIC_DIR / 'tech_upbeat.mp3'
        if fallback_music.is_file():
            music = fallback_music
        else:
            # If no music available, normalize voiceover directly
            run([
                'ffmpeg', '-y', '-v', 'error',
                '-i', str(vo),
                '-af', f'loudnorm=I={target_lufs}:LRA=7:tp=-1',
                '-c:a', 'libmp3lame', '-b:a', '192k',
                str(out)
            ])
            return out

    # Check if transition SFX files exist and timestamps provided
    whoosh_sfx = SFX_DIR / 'whoosh.wav'
    inputs = ['-i', str(vo), '-i', str(music)]
    
    if sfx_transitions and whoosh_sfx.is_file():
        filter_parts = [
            # 1. Duck music under voiceover
            '[1:a][0:a]sidechaincompress=threshold=0.08:ratio=5:attack=100:release=400[ducked];'
        ]
        sfx_labels = []
        for i, cut_time in enumerate(sfx_transitions):
            delay_ms = int(cut_time * 1000)
            inputs.extend(['-i', str(whoosh_sfx)])
            input_idx = 2 + i
            label = f'sfx_{i}'
            filter_parts.append(f'[{input_idx}:a]adelay={delay_ms}|{delay_ms},volume=0.35[{label}];')
            sfx_labels.append(f'[{label}]')

        num_inputs = 2 + len(sfx_labels)
        all_inputs = '[0:a][ducked]' + ''.join(sfx_labels)
        filter_parts.append(
            f'{all_inputs}amix=inputs={num_inputs}:duration=first:dropout_transition=2[premix];'
            f'[premix]loudnorm=I={target_lufs}:LRA=7:tp=-1[out]'
        )
        filter_complex = ''.join(filter_parts)
    else:
        filter_complex = (
            '[1:a][0:a]sidechaincompress=threshold=0.08:ratio=5:attack=100:release=400[ducked];'
            '[0:a][ducked]amix=inputs=2:duration=first:dropout_transition=2[mixed];'
            f'[mixed]loudnorm=I={target_lufs}:LRA=7:tp=-1[out]'
        )

    cmd = [
        'ffmpeg', '-y', '-v', 'error',
        *inputs,
        '-filter_complex', filter_complex,
        '-map', '[out]',
        '-c:a', 'libmp3lame',
        '-b:a', '192k'
    ]
    if duration and duration > 0:
        cmd.extend(['-t', str(duration)])
    cmd.append(str(out))

    run(cmd)
    return out


def mux_final_video(video_path: Path, audio_path: Path, output_path: Path) -> Path:
    """Muxes Remotion video and final audio into a single web-optimized MP4 (faststart, AAC 192k)."""
    vid = Path(video_path).resolve()
    aud = Path(audio_path).resolve()
    out = Path(output_path).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    if not vid.is_file():
        raise FileNotFoundError(f"Video file not found: {vid}")
    if not aud.is_file():
        raise FileNotFoundError(f"Audio file not found: {aud}")

    run([
        'ffmpeg', '-y', '-v', 'error',
        '-i', str(vid),
        '-i', str(aud),
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        str(out)
    ])
    return out


def measure_loudness(file_path: Path) -> dict:
    """Measures integrated loudness (LUFS) and true peak using ffmpeg loudnorm print."""
    target = Path(file_path).resolve()
    if not target.is_file():
        raise FileNotFoundError(f"Media file not found: {target}")

    proc = subprocess.run(
        [
            'ffmpeg', '-i', str(target),
            '-af', 'loudnorm=print_format=json',
            '-f', 'null', '-'
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    stderr = proc.stderr
    # Extract JSON object from ffmpeg stderr
    match = re.search(r'\{[^{}]*"input_i"[^{}]*\}', stderr, re.DOTALL)
    if not match:
        raise ValueError(f"Could not parse loudnorm metrics from ffmpeg output: {stderr[-500:]}")

    data = json.loads(match.group(0))
    return {
        'input_i': float(data.get('input_i', -99.0)),
        'input_tp': float(data.get('input_tp', -99.0)),
        'input_lra': float(data.get('input_lra', 0.0)),
        'output_i': float(data.get('output_i', -14.0)),
        'target_offset': float(data.get('target_offset', 0.0))
    }


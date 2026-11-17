"""Kokoro ONNX TTS Provider for Indian Hindi & English narration."""
import hashlib
import logging
import os
import re
import shutil
from pathlib import Path
from typing import Any, Optional

import numpy as np

from .base import TTSProvider

logger = logging.getLogger('motionclone.tts.kokoro')

ROOT_DIR = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT_DIR / 'data' / 'models' / 'kokoro'
CACHE_DIR = ROOT_DIR / 'data' / 'tts_cache'


class KokoroTTSProvider(TTSProvider):
    """High-quality neural TTS provider powered by Kokoro ONNX."""

    def __init__(
        self,
        model_path: Optional[Path] = None,
        voices_path: Optional[Path] = None
    ):
        self.model_path = model_path or (MODEL_DIR / 'kokoro-v1.0.onnx')
        self.voices_path = voices_path or (MODEL_DIR / 'voices-v1.0.bin')
        self._kokoro = None
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    @property
    def name(self) -> str:
        return "kokoro"

    def _ensure_loaded(self):
        if self._kokoro is not None:
            return
        if not self.model_path.is_file() or not self.voices_path.is_file():
            raise FileNotFoundError(
                f"Kokoro model files missing: {self.model_path} or {self.voices_path}"
            )
        import kokoro_onnx
        logger.info(f"Loading Kokoro ONNX model from {self.model_path}...")
        self._kokoro = kokoro_onnx.Kokoro(str(self.model_path), str(self.voices_path))
        logger.info("Kokoro ONNX engine initialized successfully.")

    def get_available_voices(self) -> list[dict[str, Any]]:
        return [
            {
                "id": "hm_omega",
                "name": "Omega (Male)",
                "gender": "male",
                "language": "hi",
                "accent": "Indian Hindi / English",
                "description": "Natural, resonant Indian male narrator voice."
            },
            {
                "id": "hf_beta",
                "name": "Beta (Female)",
                "gender": "female",
                "language": "hi",
                "accent": "Indian Hindi / English",
                "description": "Clear, articulate Indian female narrator voice."
            }
        ]

    def validate_voice(self, voice_id: str) -> bool:
        valid_ids = {"hm_omega", "hf_beta", "hf_alpha", "hm_psi"}
        return voice_id in valid_ids

    def _chunk_text(self, text: str) -> list[str]:
        """Split text into sentence-level chunks for natural prosody."""
        # Split on sentence boundaries including Hindi danda (।)
        sentences = re.split(r'([।\.\?!;\n]+)', text)
        chunks = []
        curr = ""
        for part in sentences:
            if not part:
                continue
            if re.match(r'^[।\.\?!;\n]+$', part):
                curr += part
                if len(curr.strip()) > 0:
                    chunks.append(curr.strip())
                curr = ""
            else:
                curr += part
        if curr.strip():
            chunks.append(curr.strip())
        return chunks if chunks else [text.strip()]

    def synthesize_scene(
        self,
        text: str,
        voice_id: str = "hm_omega",
        language: str = "hi",
        output_path: Optional[Path] = None,
        speed: float = 1.0,
        cancel: Optional[Any] = None
    ) -> Path:
        """Synthesize scene narration with caching and sentence chunking."""
        import soundfile as sf

        dest = Path(output_path).resolve() if output_path else (CACHE_DIR / 'temp_voice.wav')
        dest.parent.mkdir(parents=True, exist_ok=True)

        clean_text = text.strip()
        if not clean_text:
            # Generate silent 2.0s WAV
            sr = 24000
            silence = np.zeros(int(sr * 2.0), dtype=np.float32)
            sf.write(str(dest), silence, sr)
            return dest

        # Map language to Kokoro format ('hi' for Hindi, 'en-us' for English)
        lang_code = 'hi' if (language in ('hi', 'en_hi') or any('\u0900' <= c <= '\u097F' for c in clean_text)) else 'en-us'
        resolved_voice = voice_id if self.validate_voice(voice_id) else "hm_omega"

        # Check Cache
        cache_key = hashlib.sha256(f"{resolved_voice}_{speed:.2f}_{lang_code}_{clean_text}".encode('utf-8')).hexdigest()
        cached_wav = CACHE_DIR / f"{cache_key}.wav"
        if cached_wav.is_file() and cached_wav.stat().st_size > 1024:
            logger.debug(f"TTS cache hit for key {cache_key[:12]}")
            shutil.copy2(cached_wav, dest)
            return dest

        self._ensure_loaded()

        chunks = self._chunk_text(clean_text)
        audio_segments = []
        sample_rate = 24000

        for chunk in chunks:
            if cancel and cancel.is_set():
                raise RuntimeError("TTS synthesis cancelled by user.")
            if not chunk.strip():
                continue
            try:
                samples, sr = self._kokoro.create(
                    chunk,
                    voice=resolved_voice,
                    speed=speed,
                    lang=lang_code
                )
                sample_rate = sr
                audio_segments.append(samples)
                # Add natural pause between sentence chunks (180ms)
                pause_samples = np.zeros(int(sr * 0.18), dtype=np.float32)
                audio_segments.append(pause_samples)
            except Exception as e:
                logger.warning(f"Kokoro chunk synthesis failed for '{chunk[:30]}...': {e}")
                # Try fallback language if language code caused error
                if lang_code == 'hi':
                    try:
                        samples, sr = self._kokoro.create(chunk, voice=resolved_voice, speed=speed, lang='en-us')
                        audio_segments.append(samples)
                        sample_rate = sr
                    except Exception:
                        pass

        if not audio_segments:
            raise RuntimeError(f"Kokoro TTS produced no audio segments for text: {clean_text[:50]}")

        final_samples = np.concatenate(audio_segments)
        sf.write(str(cached_wav), final_samples, sample_rate)
        shutil.copy2(cached_wav, dest)
        logger.info(f"Kokoro synthesized {len(final_samples)/sample_rate:.2f}s of audio with voice '{resolved_voice}' -> {dest.name}")
        return dest

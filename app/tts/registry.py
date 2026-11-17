"""TTS Provider registry and resolution."""
import json
import logging
from pathlib import Path
from typing import Any, Optional

from .base import TTSProvider
from .kokoro_provider import KokoroTTSProvider

logger = logging.getLogger('motionclone.tts.registry')

_PROVIDERS: dict[str, TTSProvider] = {}


def get_tts_provider(name: str = "kokoro") -> TTSProvider:
    """Retrieve or instantiate a TTS provider."""
    global _PROVIDERS
    name = (name or "kokoro").lower().strip()
    if name not in _PROVIDERS:
        if name in ("kokoro", "kokoro-onnx", "local"):
            _PROVIDERS[name] = KokoroTTSProvider()
        else:
            # Default to Kokoro
            _PROVIDERS[name] = KokoroTTSProvider()
    return _PROVIDERS[name]


def get_license_registry() -> dict[str, Any]:
    """Load the license registry JSON."""
    reg_path = Path(__file__).resolve().parent / 'license_registry.json'
    if reg_path.is_file():
        try:
            return json.loads(reg_path.read_text(encoding='utf-8'))
        except Exception:
            pass
    return {"system": "MotionClone V3 Natural Voice Architecture", "providers": []}


def get_supported_voices() -> list[dict[str, Any]]:
    """Return all supported voices for UI selection."""
    provider = get_tts_provider("kokoro")
    return provider.get_available_voices()


def resolve_voice_id(voice_id: Optional[str] = None, gender: Optional[str] = None) -> str:
    """Return canonical voice ID (defaults to 'hm_omega' male, 'hf_beta' female)."""
    if voice_id and voice_id.strip() in ("hm_omega", "hf_beta", "hf_alpha", "hm_psi"):
        return voice_id.strip()
    if gender and gender.lower() == "female":
        return "hf_beta"
    return "hm_omega"

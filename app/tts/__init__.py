"""TTS Package for MotionClone V3."""
from .base import TTSProvider
from .kokoro_provider import KokoroTTSProvider
from .registry import get_tts_provider, get_supported_voices, resolve_voice_id, get_license_registry

__all__ = [
    "TTSProvider",
    "KokoroTTSProvider",
    "get_tts_provider",
    "get_supported_voices",
    "resolve_voice_id",
    "get_license_registry"
]

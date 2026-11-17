"""Base abstract class and definitions for MotionClone V3 TTS providers."""
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Optional


class TTSProvider(ABC):
    """Abstract provider for text-to-speech synthesis."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of the TTS provider."""
        pass

    @abstractmethod
    def synthesize_scene(
        self,
        text: str,
        voice_id: str,
        language: str,
        output_path: Path,
        speed: float = 1.0,
        cancel: Optional[Any] = None
    ) -> Path:
        """Synthesize narration text for a scene, returning output WAV or MP3 path."""
        pass

    @abstractmethod
    def get_available_voices(self) -> list[dict[str, Any]]:
        """Return list of supported voice specifications."""
        pass

    @abstractmethod
    def validate_voice(self, voice_id: str) -> bool:
        """Return True if voice_id is valid for this provider."""
        pass

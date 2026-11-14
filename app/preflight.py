"""Preflight Cost Estimation, Parameter Validation, and SHA-256 Idempotency Gate.
Enforces zero-credit execution for deterministic Remotion & FFmpeg shots,
while gating generative image and video models behind explicit credit confirmations.
"""
import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger('motionclone.preflight')

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get('FRAMEFORGE_DATA', str(ROOT / 'data'))).resolve()
CACHE_DIR = DATA_DIR / 'preflight_cache'
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Credit pricing structure
CREDIT_RATES = {
    'REMOTION_CODE_SCENE': 0,        # Zero credits (deterministic Remotion JSX/SVG)
    'FFMPEG_SPEAKER_TRACKER': 0,     # Zero credits (deterministic face tracking & crop)
    'HYBRID_ANNOTATED_SCENE': 5,     # 5 credits for pro visual synthesis & composite
    'gemini-3.1-flash-image': 1,     # 1 credit for fast preview image
    'gemini-3-pro-image': 5,         # 5 credits for 4K relighting/composite
    'veo-3.1-lite': 15,              # 15 credits
    'veo-3.1-generate-001': 30,      # 30 credits (full quality video generation)
    'seedance-2.5': 25,              # 25 credits
    'GENERATIVE_I2V_MOTION': 30,     # Standard generative I2V motion
}

VALID_ASPECTS = {'9:16', '16:9', '1:1', '4:5', '21:9'}
VALID_CAMERA_MOTIONS = {
    'pan_left', 'pan_right', 'tilt_up', 'tilt_down',
    'zoom_in', 'zoom_out', 'dolly_in', 'dolly_out',
    'pedestal_up', 'pedestal_down', 'truck_left', 'truck_right',
    'roll_clockwise', 'roll_counterclockwise',
    'orbit_left', 'orbit_right', 'crane_up', 'crane_down',
    'handheld', 'fpv_drone'
}


def compute_idempotency_key(payload: dict[str, Any]) -> str:
    """Generates a reproducible SHA-256 hash from normalized inputs."""
    normalized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


class IdempotencyCache:
    """Persistent disk cache for idempotent shot generation."""

    def __init__(self, cache_dir: Path = CACHE_DIR):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def get(self, key: str) -> Optional[dict[str, Any]]:
        target = self.cache_dir / f"{key}.json"
        if target.is_file():
            try:
                data = json.loads(target.read_text(encoding='utf-8'))
                logger.info(f"Idempotency cache HIT for key {key[:12]}")
                return data
            except Exception:
                pass
        return None

    def put(self, key: str, value: dict[str, Any]) -> None:
        target = self.cache_dir / f"{key}.json"
        try:
            target.write_text(json.dumps(value, indent=2), encoding='utf-8')
            logger.info(f"Stored result under idempotency key {key[:12]}")
        except Exception as e:
            logger.warning(f"Could not persist idempotency cache: {e}")


idempotency_cache = IdempotencyCache()


def validate_params(engine: str, params: dict[str, Any]) -> tuple[bool, str]:
    """Validates parameters for the requested shot engine."""
    duration = float(params.get('duration_seconds', params.get('duration', 3.0)))
    if duration < 0.5 or duration > 120.0:
        return False, f"Invalid duration {duration}s. Must be between 0.5s and 120.0s."

    aspect = params.get('aspect', '9:16')
    if aspect not in VALID_ASPECTS:
        return False, f"Invalid aspect ratio {aspect}. Must be one of {VALID_ASPECTS}."

    camera_motions = params.get('camera_motions', [])
    for motion in camera_motions:
        m_id = motion.get('id') if isinstance(motion, dict) else getattr(motion, 'id', None)
        if m_id and m_id not in VALID_CAMERA_MOTIONS:
            return False, f"Invalid camera motion '{m_id}'. Must be one of {VALID_CAMERA_MOTIONS}."

    if engine in ('GENERATIVE_I2V_MOTION', 'veo-3.1-generate-001', 'seedance-2.5'):
        prompt = params.get('prompt', '')
        if not prompt and not params.get('source_image'):
            return False, "Generative video motion requires either a text prompt or input keyframe."

    return True, "Parameters valid."


def estimate_cost(shot_plan: Any) -> dict[str, Any]:
    """Estimates credit cost across a sequence of shots.
    Enforces zero-credit execution for REMOTION_CODE_SCENE and FFMPEG_SPEAKER_TRACKER.
    """
    shots_data = []
    if isinstance(shot_plan, dict):
        shots_data = shot_plan.get('shots') or shot_plan.get('scenes') or [shot_plan]
    elif isinstance(shot_plan, list):
        shots_data = shot_plan
    elif hasattr(shot_plan, 'shots'):
        shots_data = [s.model_dump() if hasattr(s, 'model_dump') else s for s in shot_plan.shots]
    elif hasattr(shot_plan, 'scenes'):
        shots_data = [s.model_dump() if hasattr(s, 'model_dump') else s for s in shot_plan.scenes]
    else:
        shots_data = [shot_plan]

    total_credits = 0
    free_count = 0
    generative_count = 0
    breakdown = []

    for i, shot in enumerate(shots_data):
        if isinstance(shot, dict):
            engine = shot.get('engine') or ('REMOTION_CODE_SCENE' if shot.get('template') else 'REMOTION_CODE_SCENE')
            title = shot.get('title') or shot.get('headline') or f'Shot {i + 1}'
            assigned_slot = shot.get('assigned_slot')
            assigned_asset = shot.get('assigned_asset')
        else:
            engine = getattr(shot, 'engine', None) or ('REMOTION_CODE_SCENE' if hasattr(shot, 'template') else 'REMOTION_CODE_SCENE')
            title = getattr(shot, 'title', None) or getattr(shot, 'headline', None) or f'Shot {i + 1}'
            assigned_slot = getattr(shot, 'assigned_slot', None)
            assigned_asset = getattr(shot, 'assigned_asset', None)

        rate = CREDIT_RATES.get(engine, 0)
        
        # If user provided a clean asset for hybrid scene, visual gen is not required
        if engine == 'HYBRID_ANNOTATED_SCENE' and (assigned_slot not in ('', 'none', None) or assigned_asset):
            rate = 0

        total_credits += rate
        if rate == 0:
            free_count += 1
        else:
            generative_count += 1

        breakdown.append({
            'shot_index': i + 1,
            'title': title,
            'engine': engine,
            'credits': rate,
            'is_free': (rate == 0)
        })

    return {
        'total_credits': total_credits,
        'free_shots_count': free_count,
        'generative_shots_count': generative_count,
        'requires_credit_confirmation': (total_credits > 0),
        'breakdown': breakdown,
        'currency_equivalent_usd': round(total_credits * 0.05, 2)
    }


def enforce_credit_gate(
    engine: str,
    params: dict[str, Any],
    credit_confirmation: Optional[dict[str, Any]] = None
) -> dict[str, Any]:
    """Preflight check: verifies params, checks idempotency cache, and confirms credits."""
    valid, reason = validate_params(engine, params)
    if not valid:
        raise ValueError(f"Preflight validation failed: {reason}")

    # Check idempotency cache first
    cache_key = compute_idempotency_key({'engine': engine, 'params': params})
    cached_result = idempotency_cache.get(cache_key)
    if cached_result:
        return {'cached': True, 'cache_key': cache_key, 'result': cached_result, 'credits_charged': 0}

    cost = estimate_cost([{'engine': engine, **params}])
    required_credits = cost['total_credits']

    if required_credits > 0:
        if not credit_confirmation or not credit_confirmation.get('confirmed'):
            return {
                'ok': False,
                'gate_triggered': True,
                'required_credits': required_credits,
                'engine': engine,
                'message': f"This shot requires {required_credits} generative credits ({engine}). Please confirm to proceed.",
                'cost_details': cost
            }

    return {
        'ok': True,
        'cached': False,
        'cache_key': cache_key,
        'credits_charged': required_credits
    }


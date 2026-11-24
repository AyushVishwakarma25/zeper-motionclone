"""Gemini-backed structured 3D scene planning; outputs data only, never executable code."""
import json
import logging
import re
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .ai import get_gemini_client

logger = logging.getLogger("motionclone.3d_planner")

ALLOWED_ASSETS = frozenset({
    "credit_card", "cash_stack", "coin", "smartphone", "laptop",
    "document", "desk", "chair", "shopping_cart", "car",
    "bank_counter", "house", "banknote", "wallet", "monitor",
    "building", "package"
})

class StrictSceneModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class SceneObject(StrictSceneModel):
    id: str = Field(min_length=1, max_length=64)
    asset: str = Field(min_length=1, max_length=64)
    position: list[float] = Field(min_length=3, max_length=3)
    rotation: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0], min_length=3, max_length=3)
    scale: list[float] = Field(default_factory=lambda: [1.0, 1.0, 1.0], min_length=3, max_length=3)
    action: Literal["static", "float", "rotate", "pulse", "drop", "slide", "bounce"] = "static"

class CameraShot(StrictSceneModel):
    start_frame: int = Field(ge=0)
    end_frame: int = Field(gt=0)
    from_shot: Literal[
        "establishing", "wide", "medium", "close_up", "extreme_close_up",
        "over_shoulder", "low_angle", "top_down", "orbit", "tracking",
        "dolly_in", "dolly_out", "pan_left", "pan_right", "crane_down", "hold"
    ] = "medium"
    to_shot: Literal[
        "establishing", "wide", "medium", "close_up", "extreme_close_up",
        "over_shoulder", "low_angle", "top_down", "orbit", "tracking",
        "dolly_in", "dolly_out", "pan_left", "pan_right", "crane_down", "hold"
    ] = "medium"
    focus: list[float] = Field(default_factory=lambda: [0.0, 1.0, 0.0], min_length=3, max_length=3)
    ease: Literal["linear", "smooth", "out"] = "smooth"

class PhysicsBody(StrictSceneModel):
    id: str
    type: Literal["fixed", "dynamic"] = "dynamic"
    position: list[float] = Field(min_length=3, max_length=3)
    half_extents: list[float] = Field(default_factory=lambda: [0.5, 0.5, 0.5], min_length=3, max_length=3)
    restitution: float = Field(default=0.05, ge=0, le=1)
    friction: float = Field(default=0.7, ge=0, le=2)
    linear_velocity: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0], min_length=3, max_length=3)

class CharacterConfig(StrictSceneModel):
    enabled: bool = True
    action: Literal["idle", "walk", "run", "sit", "stand", "point", "hold", "think", "celebrate", "fall", "explain"] = "idle"
    expression: Literal["neutral", "happy", "sad", "stressed", "surprised", "confused"] = "neutral"
    position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0], min_length=3, max_length=3)
    color: str = "#20242b"
    accent: str = "#4f9cf9"

class ThreeDScenePlan(StrictSceneModel):
    schema_version: Literal["1.0"] = "1.0"
    scene_id: str = "scene-3d"
    duration_seconds: float = Field(default=5, ge=0.25, le=120)
    environment: Literal["studio", "office", "room", "street", "forest"] = "studio"
    background: str = "#b9c7d8"
    ground: str = "#d9d4ca"
    character: Optional[CharacterConfig] = None
    objects: list[SceneObject] = Field(default_factory=list, max_length=40)
    camera_shots: list[CameraShot] = Field(default_factory=list, max_length=80)
    physics_bodies: list[PhysicsBody] = Field(default_factory=list, max_length=60)

    @field_validator("background", "ground")
    @classmethod
    def valid_hex(cls, value: str) -> str:
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("Colors must be six-digit hex.")
        return value

def create_deterministic_fallback_plan(topic: str, narration: str, duration_seconds: float = 30) -> ThreeDScenePlan:
    """Provides a guaranteed physically and cinematically valid 3D scene plan when offline or testing."""
    fps = 30
    total_frames = max(1, round(duration_seconds * fps))
    beat1 = min(total_frames, round(total_frames * 0.25))
    beat2 = min(total_frames, round(total_frames * 0.6))

    is_finance = any(k in topic.lower() for k in ("credit", "debt", "bank", "money", "finance", "cash", "loan"))
    env = "office" if is_finance else "studio"

    if is_finance:
        objects = [
            SceneObject(id="office_desk", asset="desk", position=[0.0, 0.0, -1.0]),
            SceneObject(id="main_card", asset="credit_card", position=[-0.6, 1.05, -0.9], action="float"),
            SceneObject(id="cash_strap", asset="cash_stack", position=[0.6, 0.95, -0.9]),
            SceneObject(id="statement_doc", asset="document", position=[0.0, 0.92, -0.8]),
            SceneObject(id="tech_laptop", asset="laptop", position=[0.0, 0.92, -1.3]),
            SceneObject(id="office_chair", asset="chair", position=[0.0, 0.0, -2.1]),
        ]
        physics_bodies = [
            PhysicsBody(id="dropping_coins", type="dynamic", position=[0.6, 2.5, -0.9], half_extents=[0.2, 0.1, 0.2], restitution=0.2),
            PhysicsBody(id="desk_surface", type="fixed", position=[0.0, 0.9, -1.0], half_extents=[1.2, 0.1, 0.6]),
        ]
        char_action = "think"
        char_expression = "stressed"
    else:
        objects = [
            SceneObject(id="workstation", asset="desk", position=[0.0, 0.0, -1.0]),
            SceneObject(id="laptop_prop", asset="laptop", position=[0.0, 0.95, -0.9]),
            SceneObject(id="phone_prop", asset="smartphone", position=[0.5, 0.95, -0.8], action="float"),
        ]
        physics_bodies = [
            PhysicsBody(id="desk_surface", type="fixed", position=[0.0, 0.9, -1.0], half_extents=[1.2, 0.1, 0.6]),
        ]
        char_action = "explain"
        char_expression = "neutral"

    camera_shots = [
        CameraShot(start_frame=0, end_frame=beat1, from_shot="establishing", to_shot="wide", focus=[0.0, 1.2, -0.5]),
        CameraShot(start_frame=beat1, end_frame=beat2, from_shot="medium", to_shot="close_up", focus=[-0.3, 1.3, -0.8]),
        CameraShot(start_frame=beat2, end_frame=total_frames, from_shot="low_angle", to_shot="medium", focus=[0.0, 1.2, 0.0]),
    ]

    return ThreeDScenePlan(
        schema_version="1.0",
        scene_id="scene-3d-plan",
        duration_seconds=duration_seconds,
        environment=env,
        background="#263445" if is_finance else "#1f2937",
        ground="#c5cdd6" if is_finance else "#e2e8f0",
        character=CharacterConfig(
            enabled=True,
            action=char_action,
            expression=char_expression,
            position=[0.0, 0.0, 0.0],
            color="#20242b",
            accent="#3b82f6"
        ),
        objects=objects,
        camera_shots=camera_shots,
        physics_bodies=physics_bodies
    )

def plan_three_d_scene(
    topic: str,
    narration: str,
    duration_seconds: float = 30,
    *,
    tier: str = "code_synthesis",
    max_retries: int = 2
) -> ThreeDScenePlan:
    """Ask Gemini for validated scene/camera/physics data with automatic retries and fallback."""
    last_err = None
    for attempt in range(max_retries + 1):
        try:
            client, model, _ = get_gemini_client(tier=tier)
            assets_str = ", ".join(sorted(ALLOWED_ASSETS))
            prompt = f"""Create a cinematic 3D explainer scene plan for this topic: {topic}
Narration/context: {narration}
Target duration: {duration_seconds} seconds. Return JSON matching the supplied schema.
Use only these semantic asset IDs: {assets_str}.
Place objects with physically plausible positions and sizes. Make camera shots change with story beats: establish, medium, close-up, then reveal. Use physics only for meaningful object interactions. Camera and object timing must be frame deterministic at 30fps.
Set character action (idle, walk, run, sit, stand, point, hold, think, celebrate, fall, explain) and expression (neutral, happy, sad, stressed, surprised, confused).
Do not output code, URLs, invented asset IDs, or prose outside JSON."""

            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": ThreeDScenePlan,
                    "temperature": 0.2,
                    "max_output_tokens": 8192
                },
            )
            raw_text = response.text or ""
            plan = ThreeDScenePlan.model_validate_json(raw_text)

            # Sanitize / validate shot ranges
            max_frames = max(1, round(duration_seconds * 30))
            for shot in plan.camera_shots:
                shot.start_frame = max(0, min(max_frames - 1, shot.start_frame))
                shot.end_frame = max(shot.start_frame + 1, min(max_frames, shot.end_frame))

            unknown = [obj.asset for obj in plan.objects if obj.asset not in ALLOWED_ASSETS]
            if unknown:
                raise ValueError("Planner emitted unsupported asset IDs: " + ", ".join(unknown))

            return plan
        except Exception as e:
            last_err = e
            logger.warning(f"3D scene planning attempt {attempt + 1} failed: {e}")

    logger.warning(f"All 3D scene planner attempts failed ({last_err}), using deterministic fallback plan.")
    return create_deterministic_fallback_plan(topic, narration, duration_seconds)

def export_scene_plan(plan: ThreeDScenePlan) -> dict:
    """Stable interchange format consumed by the Remotion scene compiler."""
    data = plan.model_dump(mode="json")
    shots = []
    for shot in plan.camera_shots:
        s_dict = shot.model_dump(mode="json")
        s_dict["from"] = shot.from_shot
        s_dict["to"] = shot.to_shot
        shots.append(s_dict)
    data["camera"] = {"shots": shots}
    data["physics"] = {"bodies": [body.model_dump(mode="json") for body in plan.physics_bodies]}
    if plan.character:
        data["character"] = plan.character.model_dump(mode="json")
    return data

"""Gemini-backed structured 3D scene planning; outputs data only, never executable code."""
import json
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .ai import get_gemini_client

class StrictSceneModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class SceneObject(StrictSceneModel):
    id: str = Field(min_length=1, max_length=64)
    asset: str = Field(min_length=1, max_length=64)
    position: list[float] = Field(min_length=3, max_length=3)
    rotation: list[float] = Field(default_factory=lambda: [0, 0, 0], min_length=3, max_length=3)
    scale: list[float] = Field(default_factory=lambda: [1, 1, 1], min_length=3, max_length=3)
    action: Literal["static", "float", "rotate", "pulse", "drop", "slide", "bounce"] = "static"

class CameraShot(StrictSceneModel):
    start_frame: int = Field(ge=0)
    end_frame: int = Field(gt=0)
    from_shot: Literal["establishing", "wide", "medium", "close_up", "extreme_close_up", "over_shoulder", "low_angle", "top_down", "orbit", "tracking", "dolly_in", "dolly_out", "pan_left", "pan_right", "crane_down", "hold"] = "medium"
    to_shot: Literal["establishing", "wide", "medium", "close_up", "extreme_close_up", "over_shoulder", "low_angle", "top_down", "orbit", "tracking", "dolly_in", "dolly_out", "pan_left", "pan_right", "crane_down", "hold"] = "medium"
    focus: list[float] = Field(default_factory=lambda: [0, 1, 0], min_length=3, max_length=3)
    ease: Literal["linear", "smooth", "out"] = "smooth"

class PhysicsBody(StrictSceneModel):
    id: str
    type: Literal["fixed", "dynamic"] = "dynamic"
    position: list[float] = Field(min_length=3, max_length=3)
    half_extents: list[float] = Field(default_factory=lambda: [.5,.5,.5], min_length=3, max_length=3)
    restitution: float = Field(default=.05, ge=0, le=1)
    friction: float = Field(default=.7, ge=0, le=2)
    linear_velocity: list[float] = Field(default_factory=lambda: [0,0,0], min_length=3, max_length=3)

class ThreeDScenePlan(StrictSceneModel):
    schema_version: Literal["1.0"] = "1.0"
    scene_id: str = "scene-3d"
    duration_seconds: float = Field(default=5, ge=.25, le=120)
    environment: Literal["studio", "office", "room", "street", "forest"] = "studio"
    background: str = "#b9c7d8"
    ground: str = "#d9d4ca"
    objects: list[SceneObject] = Field(default_factory=list, max_length=40)
    camera_shots: list[CameraShot] = Field(default_factory=list, max_length=80)
    physics_bodies: list[PhysicsBody] = Field(default_factory=list, max_length=60)

    @field_validator("background", "ground")
    @classmethod
    def valid_hex(cls, value):
        import re
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("Colors must be six-digit hex.")
        return value

def plan_three_d_scene(topic: str, narration: str, duration_seconds: float = 30, *, tier: str = "code_synthesis") -> ThreeDScenePlan:
    """Ask Gemini for validated scene/camera/physics data using the existing configured Vertex/Gemini client."""
    client, model, _ = get_gemini_client(tier=tier)
    prompt = f"""Create a cinematic 3D explainer scene plan for this topic: {topic}
Narration/context: {narration}
Target duration: {duration_seconds} seconds. Return JSON matching the supplied schema.
Use only these semantic asset IDs: credit_card, cash_stack, coin, smartphone, laptop, document, desk, chair, shopping_cart, car, bank_counter, house.
Place objects with physically plausible positions and sizes. Make camera shots change with story beats: establish, medium, close-up, then reveal. Use physics only for meaningful object interactions. Camera and object timing must be frame deterministic at 30fps. Do not output code, URLs, invented asset IDs, or prose outside JSON."""
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config={"response_mime_type": "application/json", "response_schema": ThreeDScenePlan, "temperature": .2, "max_output_tokens": 8192},
    )
    plan = ThreeDScenePlan.model_validate_json(response.text or "")
    max_frames = round(duration_seconds * 30)
    for shot in plan.camera_shots:
        if shot.end_frame <= shot.start_frame or shot.end_frame > max_frames:
            raise ValueError(f"Invalid camera shot range: {shot.start_frame}-{shot.end_frame}")
    allowed = {"credit_card", "cash_stack", "coin", "smartphone", "laptop", "document", "desk", "chair", "shopping_cart", "car", "bank_counter", "house"}
    unknown = [obj.asset for obj in plan.objects if obj.asset not in allowed]
    if unknown:
        raise ValueError("Planner emitted unsupported asset IDs: " + ", ".join(unknown))
    return plan

def export_scene_plan(plan: ThreeDScenePlan) -> dict:
    """Stable interchange format consumed by the Remotion scene compiler."""
    data = plan.model_dump(mode="json")
    data["camera"] = {"shots": [shot.model_dump(mode="json") for shot in plan.camera_shots]}
    data["physics"] = {"bodies": [body.model_dump(mode="json") for body in plan.physics_bodies]}
    return data

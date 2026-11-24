"""director_3d.py
3D Storytelling Engine Director (V5).
Provides pure validation, normalization, and scene generation helpers
for MotionClone's 3D storytelling scenes.
"""
from __future__ import annotations
import math
from typing import Any, Literal

SUPPORTED_3D_ENVIRONMENTS = ["studio", "office", "room", "street", "forest", "tech"]
SUPPORTED_3D_POSES = [
    "idle",
    "walking",
    "running",
    "pointing",
    "holding_object",
    "turning",
    "celebrating",
    "stress_panic",
    "confused",
    "sitting_desk"
]
SUPPORTED_3D_PROPS = [
    "money_stack",
    "coin",
    "invoice",
    "laptop",
    "phone",
    "box",
    "chart_3d",
    "trophy",
    "shield"
]
SUPPORTED_CAMERA_MOVES = [
    "hold",
    "push_in",
    "pull_back",
    "pan_left",
    "pan_right",
    "orbit",
    "crane_down",
    "dutch_tilt"
]


def is_3d_scene(scene: dict[str, Any]) -> bool:
    """Returns True if the scene requests 3D rendering mode or 3d story template."""
    return (
        scene.get("render_mode") == "3d"
        or scene.get("template") == "three_d_story"
        or bool(scene.get("three_d"))
    )


def normalize_3d_scene(scene: dict[str, Any]) -> dict[str, Any]:
    """Validates, clamps, and sets defaults on 3D scene attributes."""
    normalized = dict(scene)

    # Set template and render mode
    normalized["template"] = "three_d_story"
    normalized["render_mode"] = "3d"

    # Character mode: "3d" (default) or "2d"
    char_mode = normalized.get("character_mode", "3d")
    normalized["character_mode"] = "2d" if char_mode == "2d" else "3d"

    # Environment
    env = normalized.get("environment") or normalized.get("art_direction") or "studio"
    if env not in SUPPORTED_3D_ENVIRONMENTS:
        env = "studio"
    normalized["environment"] = env

    # Pose
    pose = normalized.get("character_pose") or "idle"
    if pose not in SUPPORTED_3D_POSES:
        pose = "idle"
    normalized["character_pose"] = pose

    # Prop
    prop = normalized.get("prop_type") or normalized.get("props") or None
    if prop and prop not in SUPPORTED_3D_PROPS:
        prop = "box"
    normalized["prop_type"] = prop

    # Camera motion
    cam_move = normalized.get("camera_motion") or "hold"
    if cam_move not in SUPPORTED_CAMERA_MOVES:
        cam_move = "hold"
    normalized["camera_motion"] = cam_move

    # Ensure three_d dictionary structure exists
    three_d = dict(normalized.get("three_d") or {})
    three_d["environment"] = env
    three_d["camera"] = three_d.get("camera") or {"move": cam_move, "intensity": 0.6}
    three_d["character"] = three_d.get("character") or {
        "enabled": True,
        "mode": normalized["character_mode"],
        "pose": pose,
        "shirtColor": normalized.get("accent_color") or normalized.get("accent") or "#00f2fe"
    }
    if prop:
        three_d["prop"] = three_d.get("prop") or {"type": prop, "motion": "float"}

    normalized["three_d"] = three_d
    return normalized


def build_3d_scene(
    headline: str,
    environment: str = "studio",
    character_pose: str = "idle",
    character_mode: Literal["3d", "2d"] = "3d",
    prop_type: str | None = None,
    camera_move: str = "hold",
    duration_seconds: float = 3.5,
    visual_metaphor: str = "",
    on_screen_text: str = "",
    accent: str = "#00f2fe",
    bg: str = "#0a0a12",
    voiceover_script_en: str = "",
    voiceover_script_hi: str = ""
) -> dict[str, Any]:
    """Constructs a fully formed 3D storytelling scene dictionary."""
    scene = {
        "template": "three_d_story",
        "render_mode": "3d",
        "character_mode": character_mode,
        "headline": headline,
        "on_screen_text": on_screen_text or headline,
        "visual_metaphor": visual_metaphor,
        "environment": environment,
        "character_pose": character_pose,
        "prop_type": prop_type,
        "camera_motion": camera_move,
        "duration_seconds": float(duration_seconds),
        "accent": accent,
        "accent_color": accent,
        "bg": bg,
        "background_color": bg,
        "voiceover_script_en": voiceover_script_en,
        "voiceover_script_hi": voiceover_script_hi,
        "three_d": {
            "environment": environment,
            "camera": {"move": camera_move, "intensity": 0.7},
            "character": {
                "enabled": True,
                "mode": character_mode,
                "pose": character_pose,
                "shirtColor": accent
            },
            "prop": {"type": prop_type, "motion": "float"} if prop_type else None
        }
    }
    return normalize_3d_scene(scene)


def sample_3d_story_plan(topic: str = "Working Capital Cash Flow", total_seconds: float = 30.0) -> dict[str, Any]:
    """Generates a complete, multi-scene 3D storytelling plan for testing and production rendering."""
    scenes = [
        build_3d_scene(
            headline="The Unpaid Invoices Trap",
            on_screen_text="60 Days Waiting",
            visual_metaphor="Cash Flow Lag",
            environment="office",
            character_pose="sitting_desk",
            character_mode="3d",
            prop_type="invoice",
            camera_move="push_in",
            duration_seconds=7.0,
            accent="#00f2fe",
            bg="#0f172a",
            voiceover_script_en="Your business made ten lakh this month, but your bank account is empty because client payments are delayed sixty days.",
            voiceover_script_hi="Aapne business me sales to badha li, par account khali hai kyunki client payment do mahine delay chal rahi hai."
        ),
        build_3d_scene(
            headline="Moving Fast With Instant Credit",
            on_screen_text="Zero Waiting Time",
            visual_metaphor="Agile Capital",
            environment="street",
            character_pose="walking",
            character_mode="3d",
            prop_type="phone",
            camera_move="pan_right",
            duration_seconds=7.5,
            accent="#38bdf8",
            bg="#020617",
            voiceover_script_en="Instead of chasing invoices, smart founders unlock instant invoice financing right from their phone in seconds.",
            voiceover_script_hi="Roz roz client ke peeche bhaagne ke bajaye, smart founders phone se instant invoice financing unlock kar rahe hain."
        ),
        build_3d_scene(
            headline="Revenue Scaling Unlocked",
            on_screen_text="3X Monthly Growth",
            visual_metaphor="Predictable Realization",
            environment="tech",
            character_pose="pointing",
            character_mode="3d",
            prop_type="chart_3d",
            camera_move="orbit",
            duration_seconds=8.0,
            accent="#10b981",
            bg="#030712",
            voiceover_script_en="Cash flow becomes instant and predictable, letting you fulfill bigger vendor purchase orders without pause.",
            voiceover_script_hi="Cash flow instant banta hai, aur aap bina ruke bade orders fulfill kar sakte hain."
        ),
        build_3d_scene(
            headline="Reclaim Your Working Capital",
            on_screen_text="Unlock Instant Cash",
            visual_metaphor="Full Cash Realization",
            environment="studio",
            character_pose="celebrating",
            character_mode="3d",
            prop_type="money_stack",
            camera_move="pull_back",
            duration_seconds=7.5,
            accent="#fbbf24",
            bg="#0a0a12",
            voiceover_script_en="Stop waiting for payments and start scaling today. Click below to get started.",
            voiceover_script_hi="Payments ka intezaar chodiye aur grow kijiye. Aaj hi shuru karne ke liye neeche click karein."
        )
    ]

    total_dur = sum(s["duration_seconds"] for s in scenes)

    return {
        "title": f"3D Story: {topic}",
        "topic": topic,
        "style": "3d_story",
        "genre": "3d",
        "duration_seconds": total_dur,
        "scenes": scenes
    }

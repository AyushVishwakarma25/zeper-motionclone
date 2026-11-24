"""tests/test_three_d_story.py
Automated tests for MotionClone V5 3D Storytelling Engine.
Verifies scene models, director normalization, backward compatibility,
and Remotion plan export.
"""
import pytest
from app.dashboard_agent import SceneItem, ExplainerScenePlan, export_scene_plan_to_remotion_plan
from app.director_3d import (
    is_3d_scene,
    normalize_3d_scene,
    build_3d_scene,
    sample_3d_story_plan,
    SUPPORTED_3D_ENVIRONMENTS,
    SUPPORTED_3D_POSES,
    SUPPORTED_3D_PROPS,
    SUPPORTED_CAMERA_MOVES
)


def test_scene_item_supports_three_d():
    scene = SceneItem(
        id=1,
        title="3D Cash Flow",
        template="three_d_story",
        render_mode="3d",
        character_mode="3d",
        headline="Where Did The Cash Go?",
        environment="office",
        character_pose="sitting_desk",
        prop_type="invoice",
        camera_motion="push_in",
        three_d={
            "environment": "office",
            "camera": {"move": "push_in", "intensity": 0.7},
            "character": {"pose": "sitting_desk", "shirtColor": "#00f2fe"},
            "prop": {"type": "invoice", "motion": "float"}
        }
    )
    assert scene.template == "three_d_story"
    assert scene.render_mode == "3d"
    assert scene.character_mode == "3d"
    assert scene.three_d["environment"] == "office"
    assert scene.three_d["camera"]["move"] == "push_in"


def test_scene_item_backward_compatibility():
    # Existing 2D scenes without 3D fields must validate identically
    legacy_scene = SceneItem(
        id=2,
        title="2D Character Story",
        template="character_story",
        headline="Traditional 2D Story",
        character_pose="confused",
        props="money_stack"
    )
    assert legacy_scene.template == "character_story"
    assert legacy_scene.render_mode == "2d"
    assert legacy_scene.character_pose == "confused"
    assert legacy_scene.three_d is None


def test_is_3d_scene_detection():
    assert is_3d_scene({"template": "three_d_story"}) is True
    assert is_3d_scene({"render_mode": "3d"}) is True
    assert is_3d_scene({"three_d": {"environment": "studio"}}) is True
    assert is_3d_scene({"template": "character_story", "render_mode": "2d"}) is False
    assert is_3d_scene({"template": "kinetic_text"}) is False


def test_normalize_3d_scene_clamps_malformed_inputs():
    raw_scene = {
        "headline": "Clamping Test",
        "environment": "invalid_cyber_void",
        "character_pose": "breakdance_spin",
        "prop_type": "alien_weapon",
        "camera_motion": "warp_jump",
        "character_mode": "invalid_mode"
    }
    normalized = normalize_3d_scene(raw_scene)
    assert normalized["template"] == "three_d_story"
    assert normalized["render_mode"] == "3d"
    assert normalized["character_mode"] == "3d"  # Safely defaults to 3d
    assert normalized["environment"] == "studio"  # Clamped to fallback
    assert normalized["character_pose"] == "idle"  # Clamped to fallback
    assert normalized["prop_type"] == "box"  # Clamped to fallback
    assert normalized["camera_motion"] == "hold"  # Clamped to fallback
    assert normalized["three_d"]["environment"] == "studio"


def test_build_3d_scene():
    scene = build_3d_scene(
        headline="Instant Financing",
        environment="street",
        character_pose="walking",
        character_mode="3d",
        prop_type="phone",
        camera_move="pan_right",
        duration_seconds=5.0
    )
    assert scene["template"] == "three_d_story"
    assert scene["environment"] == "street"
    assert scene["character_pose"] == "walking"
    assert scene["prop_type"] == "phone"
    assert scene["camera_motion"] == "pan_right"
    assert scene["duration_seconds"] == 5.0


def test_sample_3d_story_plan_structure():
    plan = sample_3d_story_plan(topic="SaaS Working Capital", total_seconds=30.0)
    assert len(plan["scenes"]) == 4
    assert plan["duration_seconds"] == 30.0
    for scene in plan["scenes"]:
        assert scene["template"] == "three_d_story"
        assert scene["render_mode"] == "3d"
        assert scene["character_mode"] == "3d"
        assert scene["environment"] in SUPPORTED_3D_ENVIRONMENTS
        assert scene["character_pose"] in SUPPORTED_3D_POSES
        assert scene["prop_type"] in SUPPORTED_3D_PROPS
        assert scene["camera_motion"] in SUPPORTED_CAMERA_MOVES


def test_export_scene_plan_to_remotion_plan():
    plan_dict = sample_3d_story_plan("Fintech Demo")
    scene_items = [SceneItem(**s) for s in plan_dict["scenes"]]
    explainer_plan = ExplainerScenePlan(
        title="3D Story Test",
        scenes=scene_items
    )
    remotion_plan = export_scene_plan_to_remotion_plan(explainer_plan)
    assert hasattr(remotion_plan, "tracks")
    assert len(remotion_plan.tracks) >= len(scene_items)

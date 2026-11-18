import json
import subprocess
import pytest
from app.dashboard_agent import (
    SceneItem,
    ExplainerScenePlan,
    build_dynamic_scene_plan,
    parse_target_duration
)


def test_scene_item_schema_preserves_custom_and_visual_fields():
    """Verify SceneItem preserves extra attributes without dropping data (extra='allow')."""
    payload = {
        "id": 1,
        "title": "Scene 1 • Working Capital Trap",
        "template": "character_story",
        "start_seconds": 0.0,
        "duration_seconds": 5.0,
        "headline": "Where Did The Cash Go?",
        "on_screen_text": "Where Did The Cash Go?",
        "visual_metaphor": "Working Capital Trap",
        "character_pose": "confused",
        "character_action": "Character confused with boxes",
        "character_expression": "surprised",
        "camera_motion": "slow_zoom_in",
        "props": "boxes",
        "prop_type": "boxes",
        "prop_amount": "₹10 LAKH",
        "art_direction": "editorial_flat",
        "environment": "editorial_flat",
        "transition": "push-left",
        "accent_color": "#00f2fe",
        "background_color": "#0a0a12",
        "number": 100,
        "prefix": "₹",
        "suffix": "L",
        "bullets": ["Point A", "Point B"],
        "custom_plugin_field": "preserved_safely"
    }

    item = SceneItem.model_validate(payload)
    assert item.template == "character_story"
    assert item.on_screen_text == "Where Did The Cash Go?"
    assert item.visual_metaphor == "Working Capital Trap"
    assert item.character_pose == "confused"
    assert item.props == "boxes"
    assert item.art_direction == "editorial_flat"
    assert item.number == 100
    assert item.bullets == ["Point A", "Point B"]
    # Check extra allowed field
    assert getattr(item, "custom_plugin_field") == "preserved_safely"


def test_scene_templates_include_story_driven_templates():
    """Verify character_story, finance_breakdown, timeline_gap, money_flow are valid."""
    for tmpl in ["character_story", "finance_breakdown", "timeline_gap", "money_flow"]:
        item = SceneItem(
            id=1,
            title="Test",
            template=tmpl,
            start_seconds=0.0,
            duration_seconds=3.0,
            headline="Sample Headline"
        )
        assert item.template == tmpl


def test_dynamic_scene_plan_generates_story_driven_scenes():
    """Verify build_dynamic_scene_plan generates a humanized, story-driven scene plan."""
    plan = build_dynamic_scene_plan(
        brand_name="FlowPay",
        brand_tagline="Working Capital Accelerated",
        assets_list=[],
        target_seconds=60.0,
        language="bilingual",
        aspect="9:16"
    )

    assert isinstance(plan, ExplainerScenePlan)
    assert len(plan.scenes) >= 8
    assert plan.duration_seconds == 60.0

    templates_used = {s.template for s in plan.scenes}
    # Must include story-driven visual templates
    assert "character_story" in templates_used or "timeline_gap" in templates_used or "finance_breakdown" in templates_used

    # Check that character poses and props are defined
    story_scenes = [s for s in plan.scenes if s.template == "character_story"]
    if story_scenes:
        first_story = story_scenes[0]
        assert first_story.character_pose in [
            "idle", "pointing", "holding_money", "holding_invoice",
            "confused", "celebrating", "stress_panic", "sitting_desk", "walking"
        ]
        assert first_story.props != ""
        assert first_story.visual_metaphor != ""

    # Check last scene is CTA
    assert plan.scenes[-1].template == "cta_end_card"


def test_voiceover_script_separated_from_on_screen_text():
    """Verify on_screen_text is short and punchy, distinct from spoken voiceover."""
    plan = build_dynamic_scene_plan(
        brand_name="FlowPay",
        brand_tagline="Working Capital Accelerated",
        assets_list=[],
        target_seconds=30.0,
        language="en",
        aspect="9:16"
    )

    for s in plan.scenes:
        if s.template != "cta_end_card":
            # On-screen text must be punchy (< 10 words)
            word_count = len(s.on_screen_text.split())
            assert word_count <= 8, f"on_screen_text '{s.on_screen_text}' is too long for on-screen display!"

            # Spoken voiceover should be a full conversational sentence
            assert len(s.voiceover_script_en.split()) > word_count, (
                f"Voiceover should contain full spoken sentence, not identical short text: {s.voiceover_script_en}"
            )


def test_remotion_bundle_compilation():
    """Verify that the Remotion bundle with all new components and transitions compiles with 0 errors."""
    cmd = [
        "node",
        "-e",
        "import('@remotion/bundler').then(b => b.bundle({entryPoint: './src/index.jsx'})).then(() => console.log('OK')).catch(e => {console.error(e); process.exit(1)})"
    ]
    res = subprocess.run(cmd, cwd="remotion", capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, f"Remotion bundle failed to compile:\nSTDOUT: {res.stdout}\nSTDERR: {res.stderr}"
    assert "OK" in res.stdout

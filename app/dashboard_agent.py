"""Dashboard Agent for MotionClone: Reference-to-Video Studio.
Drives the user journey:
1. Analyze reference video -> Scene-by-scene Blueprint
2. User reviews and approves Blueprint
3. Generate original script and scene plan (English & Hindi support)
4. Remotion preview generation
5. Per-scene edits via chat or timeline
6. Automated QA and final MP4 export
"""
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Literal
from pydantic import Field

from google.genai import types

from .ai import auth_status, get_gemini_client
from .models import Strict

logger = logging.getLogger('motionclone.dashboard')

# Built-in Royalty-Free Music Library Presets
ROYALTY_FREE_MUSIC_TRACKS = [
    {
        "id": "tech_upbeat",
        "name": "Upbeat Tech Innovation",
        "genre": "Corporate / Modern Tech",
        "bpm": 120,
        "mood": "Confident, driving, optimistic",
        "url": "/static/assets/music/tech_upbeat.mp3",
        "attribution": "Royalty-Free Commercial License Included"
    },
    {
        "id": "chill_lofi",
        "name": "Minimal Lo-Fi Pulse",
        "genre": "Lo-Fi / Ambient",
        "bpm": 85,
        "mood": "Calm, focused, elegant",
        "url": "/static/assets/music/chill_lofi.mp3",
        "attribution": "Royalty-Free Commercial License Included"
    },
    {
        "id": "cinematic_inspiring",
        "name": "Cinematic Future Horizon",
        "genre": "Cinematic / Neo-Classical",
        "bpm": 110,
        "mood": "Inspiring, expansive, visionary",
        "url": "/static/assets/music/cinematic_inspiring.mp3",
        "attribution": "Royalty-Free Commercial License Included"
    },
    {
        "id": "electronic_drive",
        "name": "Cyber Dynamic Energy",
        "genre": "Electronic / Synth",
        "bpm": 128,
        "mood": "Energetic, fast-paced, high impact",
        "url": "/static/assets/music/electronic_drive.mp3",
        "attribution": "Royalty-Free Commercial License Included"
    }
]

# Supported Aspect Ratios
ASPECT_RATIOS = {
    "9:16": {"width": 1080, "height": 1920, "label": "Vertical Reel / Shorts / TikTok (9:16)"},
    "16:9": {"width": 1920, "height": 1080, "label": "Horizontal / YouTube / Desktop (16:9)"},
    "1:1": {"width": 1080, "height": 1080, "label": "Square / Feed / LinkedIn (1:1)"}
}


class BlueprintShot(Strict):
    t_start: float
    t_end: float
    shot_type: str = Field(description="e.g. b-roll, product close-up, screen demo, typography card, call to action")
    camera_motion: str = Field(default="slow push-in", description="e.g. static, slow zoom in, pan right, spring enter")
    transition: str = Field(default="cut", description="cut, dissolve, wipe-left, zoom-punch")
    visual_purpose: str = Field(description="what this shot achieves in the story")
    text_overlay_style: str = Field(default="bold headline", description="on-screen typography style")


class BlueprintStructure(Strict):
    hook_seconds: float = Field(default=3.0)
    body_seconds: float = Field(default=22.0)
    cta_seconds: float = Field(default=5.0)
    total_seconds: float = Field(default=30.0)
    aspect: str = Field(default="9:16")
    cuts_per_minute: int = Field(default=28)
    avg_shot_duration: float = Field(default=2.5)
    shots: list[BlueprintShot] = Field(default_factory=list)
    rules: list[str] = Field(
        default_factory=lambda: [
            "Hook audience in first 2.5 seconds with high-contrast text",
            "Keep each visual cut under 3.5 seconds",
            "Bold keyword highlight in every text overlay",
            "Sync transitions to music beats",
            "End with clear, single Call-to-Action"
        ]
    )
    voice_tone: str = Field(default="Confident, engaging, crisp")
    music_mood: str = Field(default="Upbeat modern tech, ducked under voice-over")


class SceneItem(Strict):
    id: int
    title: str
    template: Literal[
        "kinetic_text",
        "dashboard_3d_float",
        "interactive_cursor_click",
        "fact_card",
        "title_card",
        "lower_third",
        "transparent_callout"
    ] = "kinetic_text"
    start_seconds: float
    duration_seconds: float
    headline: str
    subtitle: str = ""
    voiceover_script_en: str = ""
    voiceover_script_hi: str = ""
    assigned_asset: str = ""
    transition: str = "cut"
    accent_color: str = "#00f2fe"
    background_color: str = "#0e0e13"


class ExplainerScenePlan(Strict):
    title: str = "AI Explainer Video"
    aspect: Literal["9:16", "16:9", "1:1"] = "9:16"
    language: Literal["en", "hi", "bilingual"] = "en"
    duration_seconds: float = 30.0
    music_track_id: str = "tech_upbeat"
    scenes: list[SceneItem] = Field(default_factory=list)


def generate_blueprint_from_reference(
    reference_meta: dict[str, Any],
    aspect: str = "9:16",
    brief_notes: str = ""
) -> BlueprintStructure:
    """Uses Gemini Pro to analyze reference temporal/media info and extract a reusable Blueprint."""
    if not auth_status():
        raise ValueError("Google Gemini or Vertex AI is not configured. Configure in Settings.")

    client, model, _ = get_gemini_client()

    prompt = (
        "You are an elite Commercial Video Director and Motion Graphics Specialist.\n"
        "Deconstruct this video reference into a reusable STYLE BLUEPRINT.\n"
        "The blueprint captures STRUCTURE, PACING, CAMERA MOTION, and TIMING RULES—NEVER original copyrighted text or footage.\n\n"
        f"REFERENCE METADATA: {json.dumps(reference_meta, indent=2)}\n"
        f"TARGET ASPECT RATIO: {aspect}\n"
        f"USER GOALS: {brief_notes}\n\n"
        "BLUEPRINT REQUIREMENTS:\n"
        "1. Structure breakdown: Hook (0-3s), Body (core problem & solution 4-6 shots), CTA (closing 4-5s).\n"
        "2. Pacing: Average shot length 1.8 to 3.0 seconds, snappy rhythm.\n"
        "3. Shots: 5 to 8 sequential shots with precise shot_type, camera_motion, and transition.\n"
        "4. Rules: 5 concrete, checkable rules that made this reference engaging (e.g. 'Question hook within 2.5s', 'Safe margins 64px').\n"
        "5. Output must conform to BlueprintStructure schema."
    )

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=BlueprintStructure,
        temperature=0.2,
        max_output_tokens=4096,
    )

    res = client.models.generate_content(
        model=model,
        contents=[prompt],
        config=config,
    )

    if not res or not res.text:
        raise ValueError("Gemini returned empty blueprint.")

    return BlueprintStructure.model_validate_json(res.text.strip())


def generate_scene_plan(
    blueprint: BlueprintStructure,
    user_story: str,
    brand_name: str,
    brand_tagline: str,
    language: str = "en",
    aspect: str = "9:16",
    uploaded_assets: list[str] = None
) -> ExplainerScenePlan:
    """Adapts a Blueprint into an original Scene Plan using Remotion templates with English & Hindi scripts."""
    if not auth_status():
        raise ValueError("Google Gemini or Vertex AI is not configured.")

    client, model, _ = get_gemini_client()
    assets_list = uploaded_assets or []

    prompt = (
        "You are an expert Motion Video Producer for high-growth tech startups.\n"
        "Create an original 30-second Remotion Explainer Scene Plan by applying the provided Blueprint to the user's story.\n\n"
        f"BRAND: {brand_name}\n"
        f"TAGLINE: {brand_tagline}\n"
        f"USER STORY / BRIEF: {user_story}\n"
        f"TARGET ASPECT RATIO: {aspect}\n"
        f"PRIMARY LANGUAGE: {language} (Provide BOTH English AND natural conversational Hindi scripts in voiceover_script_en and voiceover_script_hi)\n"
        f"AVAILABLE USER ASSETS: {json.dumps(assets_list)}\n\n"
        f"STYLE BLUEPRINT TO FOLLOW:\n{blueprint.model_dump_json(indent=2)}\n\n"
        "SCENE DESIGN RULES:\n"
        "1. Divide the 30-second duration into 5 to 7 crisp scenes matching the blueprint shots.\n"
        "2. Template mappings (choose the best Remotion template for each scene):\n"
        "   - 'kinetic_text': high energy typography for hook or bold statements\n"
        "   - 'dashboard_3d_float': showcase uploaded screenshot with smooth 3D float\n"
        "   - 'interactive_cursor_click': animated mouse cursor clicking UI with ripple\n"
        "   - 'fact_card': clear value metric / feature stat card\n"
        "   - 'title_card': bold intro or hero headline\n"
        "   - 'lower_third': subtle overlay on visuals\n"
        "   - 'transparent_callout': floating badge with key metric\n"
        "3. Copywriting: Punchy, modern, no fluff. Keep headlines under 8 words.\n"
        "4. Hindi voiceover: Natural, modern conversational Hindustani/Hinglish (e.g., 'Agar aap bhi video creation me ghanto bita rahe hain...').\n"
        "5. If user assets exist, assign them to relevant scenes (e.g. dashboard_3d_float).\n"
        "6. Ensure the sum of scene duration_seconds is exactly ~30s."
    )

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=ExplainerScenePlan,
        temperature=0.3,
        max_output_tokens=6144,
    )

    res = client.models.generate_content(
        model=model,
        contents=[prompt],
        config=config,
    )

    if not res or not res.text:
        raise ValueError("Gemini returned empty scene plan.")

    return ExplainerScenePlan.model_validate_json(res.text.strip())


def process_dashboard_chat_turn(
    message: str,
    history: list[dict[str, str]],
    project_state: dict[str, Any]
) -> dict[str, Any]:
    """Processes a user chat message with context and returns assistant response + optional action/state updates."""
    if not auth_status():
        return {
            "reply": "⚠️ Google Gemini or Vertex AI is not yet configured. Please open **Settings** in the header to enter your Gemini API Key or GCP project details.",
            "action": "none"
        }

    client, model, _ = get_gemini_client()

    sys_instructions = (
        "You are MotionClone AI, an autonomous video production director inside the Reference-to-Video Studio.\n"
        "You help the user create high-converting 30-second explainer motion graphics videos with Remotion.\n"
        "You can:\n"
        "1. Deconstruct reference videos into structural blueprints.\n"
        "2. Generate bilingual scripts (English & Hindi).\n"
        "3. Modify specific scenes (timing, headlines, templates, colors, assets).\n"
        "4. Recommend royalty-free music and aspect ratios (9:16, 16:9, 1:1).\n\n"
        "CURRENT PROJECT STATE:\n"
        f"{json.dumps(project_state, indent=2)}\n\n"
        "REPLY GUIDELINES:\n"
        "- Be concise, enthusiastic, and direct.\n"
        "- If the user asks to edit a scene (e.g. 'make scene 2 faster', 'change headline to X'), explicitly confirm the exact change.\n"
        "- If the user asks for Hindi, provide Hindi translations with Devanagari or Romanized Hindi.\n"
        "- If you propose a structured update to the scene plan or blueprint, summarize it cleanly."
    )

    # Format history for Gemini
    contents = []
    for h in history[-8:]:
        role = "user" if h.get("role") == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=h.get("content", ""))]))

    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=message)]))

    config = types.GenerateContentConfig(
        system_instruction=sys_instructions,
        temperature=0.4,
        max_output_tokens=2048,
    )

    try:
        res = client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
        reply_text = res.text if res and res.text else "I've reviewed your request. What would you like to adjust next?"
    except Exception as e:
        reply_text = f"I encountered an error connecting to Gemini: {e}. Please try again."

    # Inspect message for quick intent detection to return actionable UI cards
    msg_lower = message.lower()
    action = "chat"
    action_payload = {}

    if "blueprint" in msg_lower or "analyze" in msg_lower:
        action = "suggest_blueprint"
    elif "script" in msg_lower or "generate plan" in msg_lower or "scene plan" in msg_lower:
        action = "suggest_scene_plan"
    elif "render" in msg_lower or "preview" in msg_lower:
        action = "trigger_render"
    elif "hindi" in msg_lower:
        action = "set_language_hindi"

    return {
        "reply": reply_text,
        "action": action,
        "action_payload": action_payload
    }

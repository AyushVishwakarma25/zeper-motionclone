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
from pydantic import BaseModel, ConfigDict, Field

from google.genai import types

from .ai import auth_status, get_gemini_client
from .models import Strict
from .preflight import estimate_cost

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


class BlueprintShot(BaseModel):
    model_config = ConfigDict(extra='ignore')
    t_start: float
    t_end: float
    shot_type: str = Field(description="e.g. b-roll, product close-up, screen demo, typography card, call to action")
    camera_motion: str = Field(default="slow push-in", description="e.g. static, slow zoom in, pan right, spring enter")
    transition: str = Field(default="cut", description="cut, dissolve, wipe-left, zoom-punch")
    visual_purpose: str = Field(description="what this shot achieves in the story")
    text_overlay_style: str = Field(default="bold headline", description="on-screen typography style")


class BlueprintStructure(BaseModel):
    model_config = ConfigDict(extra='ignore')
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


class SceneItem(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: int | str = 0
    title: str = "Scene"
    template: Literal[
        "character_story",
        "finance_breakdown",
        "timeline_gap",
        "money_flow",
        "kinetic_text",
        "dashboard_3d_float",
        "interactive_cursor_click",
        "fact_card",
        "stat_counter",
        "comparison_split",
        "bullet_list",
        "quote",
        "image_full_bleed",
        "screen_capture_frame",
        "cta_end_card",
        "title_card",
        "lower_third",
        "transparent_callout",
        "science_scene",       # genre templates are produced by app/genre_pipeline.py; listed so stored plans validate
        "icon_explainer",
        "three_d_story"        # V5 3D storytelling engine
    ] = "character_story"
    render_mode: Literal["2d", "3d"] = "2d"
    character_mode: Literal["2d", "3d"] = "3d"
    three_d: dict[str, Any] | None = None
    start_seconds: float = 0.0
    duration_seconds: float = 3.0
    headline: str = "Headline"
    subtitle: str = ""
    on_screen_text: str = ""
    visual_metaphor: str = ""
    environment: str = "editorial_flat"
    art_direction: str = "editorial_flat"
    character_pose: str = "idle"
    character_action: str = ""
    character_expression: str = "neutral"
    camera_motion: str = "slow_zoom_in"
    props: str = ""
    prop_type: str = ""
    prop_amount: str = ""
    stat: str = ""
    stat_label: str = ""
    number: float | int | None = None
    prefix: str = ""
    suffix: str = ""
    optionA: dict[str, Any] | None = None
    optionB: dict[str, Any] | None = None
    bullets: list[str] | None = None
    author: str = ""
    role: str = ""
    buttonText: str = ""
    handle: str = ""
    chart_data: list[dict[str, Any]] | None = None
    chart_title: str = ""
    caption: str = ""
    show_subtitle: bool = False
    voiceover_script_en: str = ""
    voiceover_script_hi: str = ""
    assigned_asset: str = ""
    transition: str = "crossfade"
    accent_color: str = "#00f2fe"
    background_color: str = "#0e0e13"


class ExplainerScenePlan(BaseModel):
    model_config = ConfigDict(extra='allow')
    title: str = "AI Explainer Video"
    aspect: Literal["9:16", "16:9", "1:1"] = "9:16"
    language: Literal["en", "hi", "bilingual"] = "en"
    duration_seconds: float = 30.0
    music_track_id: str = "tech_upbeat"
    scenes: list[SceneItem] = Field(default_factory=list)


def _clean_markdown_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    return cleaned


def generate_blueprint_from_reference(
    reference_meta: dict[str, Any],
    aspect: str = "9:16",
    brief_notes: str = "",
    reference_video_path: Path | None = None,
    evidence: dict[str, Any] | None = None,
    deconstruct_dir: Path | None = None
) -> BlueprintStructure:
    """Uses Google Gemini to analyze reference video/frames/metadata and extract a reusable Blueprint."""
    if not auth_status():
        raise ValueError("Google Gemini or Vertex AI is not configured. Configure in Settings.")

    client, model, _ = get_gemini_client(tier='vision_deconstruct')

    base_instruction = (
        "You are an elite Commercial Video Director and Motion Graphics Specialist.\n"
        "Extract ONLY the structure, pacing, scene types, visual compositions, transitions, and motion rhythm. "
        "DO NOT copy text, dialogue, company names, product names, or slogans from the reference. "
        "Output must be a valid JSON BlueprintStructure.\n\n"
        f"REFERENCE METADATA: {json.dumps(reference_meta, indent=2)}\n"
        f"LOCAL EVIDENCE: {json.dumps(evidence or {}, indent=2)}\n"
        f"TARGET ASPECT RATIO: {aspect}\n"
        f"USER GOALS: {brief_notes}\n\n"
        "BLUEPRINT REQUIREMENTS:\n"
        "1. Structure breakdown: Hook (0-3s), Body (core problem & solution 4-6 shots), CTA (closing 4-5s).\n"
        "2. Pacing: Average shot length 1.8 to 3.0 seconds, snappy rhythm.\n"
        "3. Shots: 5 to 8 sequential shots with precise shot_type, camera_motion, and transition.\n"
        "4. Rules: 5 concrete, checkable rules that made this reference engaging (e.g. 'Question hook within 2.5s', 'Safe margins 64px').\n"
        "5. Output must conform to BlueprintStructure schema. NEVER include specific copy or brand slogans from the reference."
    )

    contents = [base_instruction]

    # Multimodal video ingestion: attach reference frames or video if present
    if reference_video_path and Path(reference_video_path).is_file():
        ref_p = Path(reference_video_path)
        parent_dir = ref_p.parent
        stills = sorted(parent_dir.glob('reference-*.jpg'))
        if deconstruct_dir and (deconstruct_dir / 'keyframes').is_dir():
            stills = sorted((deconstruct_dir / 'keyframes').glob('*.jpg'))

        if stills:
            for s in stills[:6]:
                contents.append(types.Part.from_bytes(data=s.read_bytes(), mime_type='image/jpeg'))
        elif ref_p.stat().st_size <= 20 * 1024 * 1024:
            # Under 20MB, pass raw video bytes directly
            contents.append(types.Part.from_bytes(data=ref_p.read_bytes(), mime_type='video/mp4'))
        else:
            # Over 20MB, upload via files API
            try:
                uploaded = client.files.upload(file=str(ref_p))
                contents.append(uploaded)
            except Exception as up_err:
                logger.warning(f"Files API upload fallback to keyframes: {up_err}")

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=BlueprintStructure,
        temperature=0.2,
        max_output_tokens=8192,
    )

    raw_text_1 = ""
    raw_text_2 = ""
    val_err_1 = None

    # Attempt 1
    try:
        res = client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
        if res and res.text:
            raw_text_1 = res.text.strip()
            cleaned_1 = _clean_markdown_fence(raw_text_1)
            parsed = BlueprintStructure.model_validate_json(cleaned_1)

            if deconstruct_dir:
                (deconstruct_dir / 'raw_response.json').write_text(json.dumps({'raw': raw_text_1}, indent=2), encoding='utf-8')
                (deconstruct_dir / 'blueprint.json').write_text(parsed.model_dump_json(indent=2), encoding='utf-8')
            return parsed
    except Exception as e:
        val_err_1 = e
        logger.warning(f"Blueprint attempt 1 validation failed: {e}. Retrying ONCE with error appended...")

    # Retry ONCE with validation error appended
    retry_instruction = (
        f"{base_instruction}\n\n"
        f"CRITICAL: Previous response failed schema validation with error:\n{val_err_1}\n"
        f"Previous invalid text was:\n{raw_text_1[:400]}\n"
        "Please fix the schema errors, remove any trailing commas or markdown fences, and return valid JSON conforming to BlueprintStructure."
    )
    contents_retry = [retry_instruction]
    for c in contents[1:]:
        contents_retry.append(c)

    try:
        res_retry = client.models.generate_content(
            model=model,
            contents=contents_retry,
            config=config,
        )
        if res_retry and res_retry.text:
            raw_text_2 = res_retry.text.strip()
            cleaned_2 = _clean_markdown_fence(raw_text_2)
            parsed_2 = BlueprintStructure.model_validate_json(cleaned_2)

            if deconstruct_dir:
                (deconstruct_dir / 'raw_response.json').write_text(json.dumps({'raw': raw_text_2, 'retry': True}, indent=2), encoding='utf-8')
                (deconstruct_dir / 'blueprint.json').write_text(parsed_2.model_dump_json(indent=2), encoding='utf-8')
            return parsed_2
    except Exception as e2:
        logger.error(f"Blueprint retry attempt 2 also failed: {e2}")
        if deconstruct_dir:
            (deconstruct_dir / 'error_response.json').write_text(json.dumps({
                'attempt1': raw_text_1,
                'attempt2': raw_text_2,
                'error': str(e2)
            }, indent=2), encoding='utf-8')
        raise ValueError(f"BLUEPRINT_INVALID: Schema validation failed after retry: {e2}") from e2

    if deconstruct_dir:
        (deconstruct_dir / 'error_response.json').write_text(json.dumps({
            'attempt1': raw_text_1,
            'attempt2': raw_text_2,
            'error': str(val_err_1)
        }, indent=2), encoding='utf-8')
    raise ValueError(f"BLUEPRINT_INVALID: No response returned from Gemini: {val_err_1}")


def _fallback_blueprint(reference_meta: dict[str, Any], aspect: str = "9:16") -> BlueprintStructure:
    duration = float(reference_meta.get("duration", 30.0)) or 30.0
    hook_sec = min(3.0, round(duration * 0.1, 1))
    cta_sec = min(5.0, round(duration * 0.15, 1))
    body_sec = max(5.0, round(duration - hook_sec - cta_sec, 1))
    
    shots = [
        BlueprintShot(
            t_start=0.0,
            t_end=hook_sec,
            shot_type="typography card",
            camera_motion="slow zoom in",
            transition="cut",
            visual_purpose="High-contrast question hook to stop scrolling",
            text_overlay_style="bold headline"
        ),
        BlueprintShot(
            t_start=hook_sec,
            t_end=round(hook_sec + body_sec * 0.35, 1),
            shot_type="screen demo",
            camera_motion="pan right",
            transition="wipe-left",
            visual_purpose="Demonstrate core product feature & interactive UI",
            text_overlay_style="subtle eyebrow + title"
        ),
        BlueprintShot(
            t_start=round(hook_sec + body_sec * 0.35, 1),
            t_end=round(hook_sec + body_sec * 0.7, 1),
            shot_type="product close-up",
            camera_motion="slow push-in",
            transition="cut",
            visual_purpose="Show key metric / proof point / results card",
            text_overlay_style="metric callout"
        ),
        BlueprintShot(
            t_start=round(hook_sec + body_sec * 0.7, 1),
            t_end=round(duration - cta_sec, 1),
            shot_type="b-roll",
            camera_motion="spring enter",
            transition="zoom-punch",
            visual_purpose="Highlight rapid workflow execution and speed",
            text_overlay_style="kinetic caption"
        ),
        BlueprintShot(
            t_start=round(duration - cta_sec, 1),
            t_end=round(duration, 1),
            shot_type="call to action",
            camera_motion="static",
            transition="dissolve",
            visual_purpose="Final logo reveal and high-conversion call to action",
            text_overlay_style="bold CTA button"
        ),
    ]
    return BlueprintStructure(
        hook_seconds=hook_sec,
        body_seconds=body_sec,
        cta_seconds=cta_sec,
        total_seconds=round(duration, 1),
        aspect=aspect,
        cuts_per_minute=28,
        avg_shot_duration=round(duration / len(shots), 1),
        shots=shots,
        rules=[
            "Hook audience in first 2.5 seconds with high-contrast text",
            "Keep each visual cut under 3.5 seconds for snappy pacing",
            "Bold keyword highlight in every text overlay",
            "Sync transitions to music beats",
            "End with clear, single Call-to-Action"
        ]
    )


# --- Duration-Aware Planning & Storytelling System (Phase 2) ---

DURATION_CONFIGS: dict[str, dict[str, Any]] = {
    "30s": {
        "seconds": 30.0,
        "label": "30 Seconds",
        "scene_count": "5 to 7",
        "min_scenes": 5,
        "max_scenes": 7,
        "word_range": "60–70 words",
        "structure": "Hook -> Problem -> Core Solution -> Feature Highlight -> Call to Action"
    },
    "1m": {
        "seconds": 60.0,
        "label": "1 Minute",
        "scene_count": "8 to 12",
        "min_scenes": 8,
        "max_scenes": 12,
        "word_range": "120–140 words",
        "structure": "Hook -> Context -> Problem Breakdown -> Solution Architecture -> Key Benefits -> Proof Point -> CTA"
    },
    "2m": {
        "seconds": 120.0,
        "label": "2 Minutes",
        "scene_count": "14 to 20",
        "min_scenes": 14,
        "max_scenes": 20,
        "word_range": "240–280 words",
        "structure": "Prologue -> Act 1 (Status Quo) -> Act 2 (Breakthrough) -> Act 3 (Walkthrough & Benefits) -> Epilogue & Next Steps"
    },
    "4m": {
        "seconds": 240.0,
        "label": "4 Minutes",
        "scene_count": "24 to 34",
        "min_scenes": 24,
        "max_scenes": 34,
        "word_range": "480–560 words",
        "structure": "Chaptered Narrative: 1. Overview & Hook -> 2. The Core Problem -> 3. Step-by-Step System Architecture -> 4. Case Studies -> 5. Capabilities -> 6. Conclusion"
    },
    "6m": {
        "seconds": 360.0,
        "label": "6 Minutes",
        "scene_count": "32 to 44",
        "min_scenes": 32,
        "max_scenes": 44,
        "word_range": "720–840 words",
        "structure": "Deep Dive Documentary: Multi-chapter storytelling with recurring callbacks, varied visual pacing, diagrams, and comprehensive feature breakdowns."
    },
    "8m": {
        "seconds": 480.0,
        "label": "8 Minutes",
        "scene_count": "40 to 55",
        "min_scenes": 40,
        "max_scenes": 55,
        "word_range": "960–1,120 words",
        "structure": "Masterclass / Technical Deep-Dive: Progressive chapter breakdown, case studies, comparative analysis, workflow architecture, and enterprise takeaways."
    },
    "10m": {
        "seconds": 600.0,
        "label": "10 Minutes",
        "scene_count": "48 to 65",
        "min_scenes": 48,
        "max_scenes": 65,
        "word_range": "1,200–1,400 words",
        "structure": "Full-Length Master Explainer: Multi-chapter documentary style with distinct thematic segments, dramatic retention hooks every 45-60s, rich infographic scenes, and complete storytelling arc."
    }
}


def parse_target_duration(duration_input: str | float | int | None) -> tuple[str, float]:
    """Parse duration input into canonical key ('30s', '1m', etc.) and float seconds."""
    if not duration_input:
        return "30s", 30.0
    s = str(duration_input).strip().lower()
    mapping = {
        "30s": 30.0, "30": 30.0, "30sec": 30.0, "30second": 30.0, "30seconds": 30.0,
        "1m": 60.0, "1min": 60.0, "1minute": 60.0, "60": 60.0, "60s": 60.0,
        "2m": 120.0, "2min": 120.0, "2minutes": 120.0, "120": 120.0, "120s": 120.0,
        "4m": 240.0, "4min": 240.0, "4minutes": 240.0, "240": 240.0, "240s": 240.0,
        "6m": 360.0, "6min": 360.0, "6minutes": 360.0, "360": 360.0, "360s": 360.0,
        "8m": 480.0, "8min": 480.0, "8minutes": 480.0, "480": 480.0, "480s": 480.0,
        "10m": 600.0, "10min": 600.0, "10minutes": 600.0, "600": 600.0, "600s": 600.0,
    }
    for k, v in mapping.items():
        if s == k:
            canonical_key = f"{int(v)}s" if v < 60 else f"{int(v // 60)}m"
            return canonical_key, v
    try:
        val = float(s)
        closest_key = min(DURATION_CONFIGS.keys(), key=lambda k: abs(DURATION_CONFIGS[k]["seconds"] - val))
        return closest_key, DURATION_CONFIGS[closest_key]["seconds"]
    except ValueError:
        return "30s", 30.0


# --- Content Contamination Elimination (Phase 5) ---

CONTAMINATION_PATTERNS = [
    r'enable\s+subtitle',
    r'subtitle\s+layer',
    r'layer\s+rendering',
    r'field\s+mapping',
    r'map\s+to\s+the\s+subtitle',
    r'remotion\s+render',
    r'component\s+prop',
    r'fix\s+the\s+scene',
    r'correct\s+field',
    r'developer\s+instruction',
    r'code\s+scene',
    r'meta[-\s]instruction',
    r'css\s+selector',
    r'inspect\s+code',
]


def is_contaminated_text(text: str | None) -> bool:
    """Detects whether text contains internal engineering/debugging meta-instructions."""
    if not text or not isinstance(text, str):
        return False
    lower = text.lower().strip()
    return any(re.search(pat, lower) for pat in CONTAMINATION_PATTERNS)


def cleanse_scene_text(text: str | None, fallback: str = "") -> str:
    """Return text stripped of meta-instructions or fallback if contaminated."""
    if not text:
        return fallback
    if is_contaminated_text(text):
        return fallback
    return text.strip()


def generate_scene_plan(
    blueprint: BlueprintStructure,
    user_story: str = "AI explainer video",
    brand_name: str = "MotionClone",
    brand_tagline: str = "Reference-to-Video AI",
    language: str = "en",
    aspect: str = "9:16",
    uploaded_assets: list[str] = None,
    creative_brief: str = "",
    target_duration: str = "30s"
) -> ExplainerScenePlan:
    """Adapts a Blueprint into an original Scene Plan using Remotion templates with English & Hindi scripts."""
    if creative_brief and not user_story:
        user_story = creative_brief
    if not auth_status():
        raise ValueError("Google Gemini or Vertex AI is not configured.")

    client, model, _ = get_gemini_client()
    assets_list = uploaded_assets or []
    canonical_key, target_seconds = parse_target_duration(target_duration)
    dur_cfg = DURATION_CONFIGS[canonical_key]

    prompt = (
        "You are an expert Motion Video Producer and Creative Director for high-growth tech startups and business explainers.\n"
        f"Create an original {dur_cfg['label']} Remotion Explainer Scene Plan by applying the provided Blueprint to the user's story.\n\n"
        f"TARGET DURATION: {target_seconds:.1f} seconds ({dur_cfg['label']})\n"
        f"TARGET WORD COUNT: Approximately {dur_cfg['word_range']} (narration pacing at 120-140 words per minute)\n"
        f"NARRATIVE STRUCTURE: {dur_cfg['structure']}\n"
        f"BRAND: {brand_name}\n"
        f"TAGLINE: {brand_tagline}\n"
        f"USER STORY / BRIEF: {user_story}\n"
        f"TARGET ASPECT RATIO: {aspect}\n"
        f"PRIMARY LANGUAGE: {language} (Provide BOTH English AND natural conversational Hindi scripts in voiceover_script_en and voiceover_script_hi)\n"
        f"AVAILABLE USER ASSETS: {json.dumps(assets_list)}\n\n"
        f"STYLE BLUEPRINT TO FOLLOW:\n{blueprint.model_dump_json(indent=2)}\n\n"
        "CRITICAL VISUAL ENGINE V4 DESIGN RULES:\n"
        "1. STRICT SEPARATION OF VOICEOVER AND ON-SCREEN TEXT:\n"
        "   - 'voiceover_script_en' and 'voiceover_script_hi' are spoken audio narration ONLY.\n"
        "   - 'on_screen_text' is short, high-impact on-screen graphics (1 to 6 words maximum, e.g. 'Where Did The Cash Go?').\n"
        "   - NEVER put full spoken narration sentences into on_screen_text, headline, or subtitle.\n"
        "2. NARRATIVE CHARACTER STORIES & METAPHORS (Prefer over text slides):\n"
        "   - 'three_d_story': Immersive 3D narrative scene with animated 3D stickman, 3D props (money_stack, invoice, laptop, phone, box, coin, chart_3d), rich 3D environments (office, room, street, forest, tech, studio), and camera choreography.\n"
        "   - 'character_story': Human narrative scene with animated vector character, props, and visual metaphor badge.\n"
        "   - 'finance_breakdown': Revenue splitting into COGS, salaries, rent, net cash.\n"
        "   - 'timeline_gap': Payment delay gap analysis (e.g. 60-day invoice lag).\n"
        "   - 'money_flow': Trapped cash or working capital bar chart.\n"
        "   - 'kinetic_text': High energy typography for hook or bold statements.\n"
        "   - 'fact_card': Clear value metric / feature stat card.\n"
        "   - 'stat_counter': Animated numerical growth or percentage counter.\n"
        "   - 'comparison_split': Before vs after or problem vs solution comparison.\n"
        "   - 'cta_end_card': Final call to action card with handle/link.\n"
        "3. CHARACTER ACTIONS & PROPS:\n"
        "   - Available character poses: 'idle', 'pointing', 'holding_money', 'holding_invoice', 'confused', 'celebrating', 'stress_panic', 'sitting_desk', 'walking'.\n"
        "   - Available animated props: 'money_stack' (currency notes), 'invoice' (stamped bill), 'glass_barrier' (trapped money), 'calendar' (delay clock), 'scale' (inflow vs outflow), 'boxes' (delivery orders).\n"
        "4. ART DIRECTION & ENVIRONMENT:\n"
        "   - Assign 'art_direction' per scene: 'editorial_flat', 'finance_documentary', 'minimal_whiteboard', 'bold_infographic', 'corporate_cinematic'.\n"
        "5. DYNAMIC TRANSITIONS & CAMERA MOTION:\n"
        "   - Transitions: 'wipe-left', 'wipe-right', 'push-left', 'push-right', 'zoom-in', 'zoom-out', 'crossfade', 'mask-reveal'.\n"
        "   - Camera motion: 'slow_zoom_in', 'slow_zoom_out', 'pan_right', 'pan_left', 'subtle_drift'.\n"
        "   - ANTI-MONOTONY RULE: Never repeat the exact same template on two consecutive scenes.\n"
        "6. Copywriting: Punchy, modern, no fluff. Keep on_screen_text under 6 words. DO NOT output code or developer instructions.\n"
        "7. Hindi voiceover: Natural, modern conversational Hindustani/Hinglish (e.g., 'Agar aapka bhi paisa pending invoices me fansa hai...').\n"
        f"8. Ensure the sum of scene duration_seconds is exactly ~{target_seconds:.1f}s."
    )

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=ExplainerScenePlan,
        temperature=0.3,
        max_output_tokens=8192,
    )

    try:
        res = client.models.generate_content(
            model=model,
            contents=[prompt],
            config=config,
        )

        if res and res.text:
            text = res.text.strip()
            parsed_plan = None
            try:
                parsed_plan = ExplainerScenePlan.model_validate_json(text)
            except Exception:
                if not text.endswith('}'):
                    if text.rfind(']') < text.rfind('['):
                        text += '\n]}'
                    else:
                        text += '\n}'
                try:
                    parsed_plan = ExplainerScenePlan.model_validate_json(text)
                except Exception:
                    pass

            if parsed_plan and parsed_plan.scenes:
                # Sanitize content against developer/meta instructions (Phase 5)
                for idx, sc in enumerate(parsed_plan.scenes):
                    sc.headline = cleanse_scene_text(sc.headline, f"Chapter {idx + 1}")
                    sc.on_screen_text = cleanse_scene_text(getattr(sc, 'on_screen_text', '') or sc.headline, sc.headline)
                    sc.subtitle = cleanse_scene_text(sc.subtitle, "")
                    sc.voiceover_script_en = cleanse_scene_text(sc.voiceover_script_en, "")
                    sc.voiceover_script_hi = cleanse_scene_text(sc.voiceover_script_hi, "")
                parsed_plan.duration_seconds = target_seconds
                return parsed_plan
    except Exception as e:
        logger.warning(f"Gemini scene plan error: {e}. Falling back to dynamic duration-aware scene plan.")

    return build_dynamic_scene_plan(
        brand_name=brand_name,
        brand_tagline=brand_tagline,
        assets_list=assets_list,
        target_seconds=target_seconds,
        language=language,
        aspect=aspect
    )

def build_dynamic_scene_plan(
    brand_name: str,
    brand_tagline: str,
    assets_list: list[str],
    target_seconds: float,
    language: str,
    aspect: str
) -> ExplainerScenePlan:
    """Builds a rich, story-driven scene plan with characters, visual metaphors, props, and data visualizations."""
    # Rich story-driven template sequence
    story_templates = [
        "character_story",
        "timeline_gap",
        "finance_breakdown",
        "money_flow",
        "stat_counter",
        "comparison_split",
        "kinetic_text",
        "character_story",
        "fact_card",
        "bullet_list"
    ]
    
    # Calculate scene count and average duration
    if target_seconds <= 30.0:
        target_scene_count = 5
    elif target_seconds <= 60.0:
        target_scene_count = 10
    elif target_seconds <= 120.0:
        target_scene_count = 18
    elif target_seconds <= 240.0:
        target_scene_count = 32
    elif target_seconds <= 360.0:
        target_scene_count = 42
    elif target_seconds <= 480.0:
        target_scene_count = 52
    else:
        target_scene_count = 60

    avg_dur = round(target_seconds / target_scene_count, 1)
    scenes: list[SceneItem] = []
    curr_time = 0.0

    # Rich Story Beats (Metaphor, On-Screen Headline, Pose, Prop, Art Direction, English VO, Hindi VO)
    story_beats = [
        (
            "The Working Capital Trap",
            "Where Did The Cash Go?",
            "confused",
            "boxes",
            "editorial_flat",
            "push-left",
            "slow_zoom_in",
            f"You booked ten lakh in sales, but your bank account is empty. Sound familiar? {brand_name} fixes this.",
            f"दस लाख की बिक्री हुई, पर बैंक अकाउंट खाली है। क्या आपके साथ भी ऐसा होता है? {brand_name} इसे ठीक करता है।"
        ),
        (
            "The 60-Day Payment Delay",
            "The Payment Lag",
            "stress_panic",
            "calendar",
            "finance_documentary",
            "wipe-left",
            "pan_right",
            "Your clients take sixty days to pay, but your suppliers need money today.",
            "क्लाइंट्स भुगतान करने में साठ दिन लगाते हैं, लेकिन सप्लायर्स को आज ही पैसे चाहिए।"
        ),
        (
            "Inflow vs Outflow",
            "The Cash Crunch",
            "pointing",
            "scale",
            "finance_documentary",
            "zoom-in",
            "subtle_drift",
            "Six lakhs goes to stock, two lakhs to payroll. One small delay triggers a cash crunch.",
            "छह लाख स्टॉक में गए, दो लाख सैलरी में। एक छोटी सी देरी कैश क्रंच पैदा कर देती है।"
        ),
        (
            "Trapped Capital",
            "Cash Stuck Behind Invoices",
            "holding_money",
            "glass_barrier",
            "bold_infographic",
            "mask-reveal",
            "slow_zoom_in",
            "Your profit is real on paper, but physically trapped until invoices clear.",
            "कागजों पर आपका मुनाफा असली है, लेकिन इनवॉइस क्लियर होने तक फंसा हुआ है।"
        ),
        (
            "Instant Acceleration",
            "Unlock Cash In 24 Hours",
            "celebrating",
            "money_stack",
            "corporate_cinematic",
            "wipe-right",
            "slow_zoom_out",
            f"With {brand_name}, automate your cash realization and accelerate working capital instantly.",
            f"{brand_name} के साथ, अपने कैश फ्लो को ऑटोमेट करें और वर्किंग कैपिटल को तुरंत अनलॉक करें।"
        ),
        (
            "Side-by-Side Comparison",
            "Manual Invoicing vs AI Flow",
            "pointing",
            "invoice",
            "editorial_flat",
            "push-right",
            "pan_left",
            "Replace tedious manual follow-ups with intelligent, autonomous collection pipelines.",
            "थका देने वाले मैनुअल फॉलो-अप्स को इंटेलिजेंट ऑटोमेटेड कलेक्शन पाइपलाइन से बदलें।"
        ),
        (
            "Proven Metric",
            "10x Faster Realization",
            "celebrating",
            "money_stack",
            "bold_infographic",
            "zoom-in",
            "slow_zoom_in",
            "Businesses recover receivables ten times faster, cutting working capital stress to zero.",
            "कंपनियां अपने बकाये को दस गुना तेजी से वसूल करती हैं, जिससे कैश फ्लो का तनाव खत्म हो जाता है।"
        ),
        (
            "Automated Workflows",
            "Zero Manual Friction",
            "sitting_desk",
            "boxes",
            "minimal_whiteboard",
            "crossfade",
            "subtle_drift",
            "Set your rules once. Let our neural automation orchestrate your finances effortlessly.",
            "एक बार अपने नियम सेट करें और हमारे न्यूरल ऑटोमेशन को सब कुछ आसानी से संभालने दें।"
        )
    ]

    for i in range(target_scene_count):
        is_last = (i == target_scene_count - 1)
        dur = round(target_seconds - curr_time, 1) if is_last else avg_dur
        if dur <= 0:
            dur = 3.0

        if is_last:
            scenes.append(
                SceneItem(
                    id=i + 1,
                    title="Final Call to Action",
                    template="cta_end_card",
                    start_seconds=round(curr_time, 2),
                    duration_seconds=dur,
                    headline=f"Experience {brand_name}",
                    on_screen_text=f"Experience {brand_name}",
                    subtitle="Get started free today",
                    buttonText="Get Started Now",
                    handle=f"@{brand_name.lower().replace(' ', '')}",
                    voiceover_script_en=f"Start accelerating your business cash flow today. Try {brand_name} now.",
                    voiceover_script_hi=f"आज ही अपने बिजनेस कैश फ्लो को गति दें। {brand_name} अभी आज़माएं।",
                    transition="crossfade",
                    camera_motion="slow_zoom_in",
                    art_direction="corporate_cinematic"
                )
            )
        else:
            beat_idx = i % len(story_beats)
            metaphor, on_screen, pose, prop, art_dir, trans, cam_motion, vo_en, vo_hi = story_beats[beat_idx]
            tmpl = story_templates[i % len(story_templates)]

            # Assign asset if available
            assigned_asset = ""
            if assets_list and tmpl in ("dashboard_3d_float", "interactive_cursor_click", "image_full_bleed"):
                assigned_asset = assets_list[i % len(assets_list)]

            scenes.append(
                SceneItem(
                    id=i + 1,
                    title=f"Scene {i + 1} • {metaphor}",
                    template=tmpl,
                    start_seconds=round(curr_time, 2),
                    duration_seconds=dur,
                    headline=on_screen,
                    on_screen_text=on_screen,
                    visual_metaphor=metaphor,
                    character_pose=pose,
                    character_action=f"Character {pose} with {prop}",
                    props=prop,
                    prop_type=prop,
                    prop_amount="₹10 LAKH" if "money" in prop or "scale" in prop else "",
                    art_direction=art_dir,
                    environment=art_dir,
                    number=10 if tmpl == "stat_counter" else None,
                    suffix="x" if tmpl == "stat_counter" else "",
                    stat_label="Faster Cash Velocity" if tmpl == "stat_counter" else "",
                    optionA={"title": "Manual Followups", "desc": "60+ days delayed payments"} if tmpl == "comparison_split" else None,
                    optionB={"title": f"{brand_name} Flow", "desc": "Instant 24-hr realization"} if tmpl == "comparison_split" else None,
                    bullets=["Zero invoice delays", "Real-time liquidity tracking", "Automated working capital"] if tmpl == "bullet_list" else None,
                    voiceover_script_en=vo_en,
                    voiceover_script_hi=vo_hi,
                    assigned_asset=assigned_asset,
                    transition=trans,
                    camera_motion=cam_motion
                )
            )
        curr_time += dur

    return ExplainerScenePlan(
        title=f"{brand_name} Explainer",
        aspect=aspect if aspect in ("9:16", "16:9", "1:1") else "9:16",
        language=language if language in ("en", "hi", "bilingual", "en_hi") else "en",
        duration_seconds=target_seconds,
        scenes=scenes
    )


generate_scene_plan_from_blueprint = generate_scene_plan


def export_scene_plan_to_remotion_plan(scene_plan: ExplainerScenePlan) -> Any:
    """Converts an ExplainerScenePlan into a validated Remotion Plan with animated text tracks."""
    from .models import Plan, Track, Keyframe
    tracks: list[Track] = []
    current_time = 0.0
    for idx, scene in enumerate(scene_plan.scenes):
        dur = max(1.0, float(scene.duration_seconds or 3.0))
        t_start = round(current_time, 2)
        t_end = round(current_time + dur, 2)
        current_time = t_end

        # Main headline text track
        text_content = scene.headline or f"Scene {idx + 1}"
        tracks.append(
            Track(
                id=f"headline_{idx + 1}",
                kind="text",
                start=t_start,
                end=t_end,
                text=text_content,
                color="#ffffff",
                size=0.08,
                keyframes=[Keyframe(t=0.0, opacity=1.0)]
            )
        )
        if scene.subtitle:
            tracks.append(
                Track(
                    id=f"sub_{idx + 1}",
                    kind="text",
                    start=round(t_start + 0.2, 2),
                    end=t_end,
                    text=scene.subtitle,
                    color="#00f2fe",
                    size=0.045,
                    keyframes=[Keyframe(t=0.0, opacity=1.0)]
                )
            )

    if not tracks:
        tracks.append(
            Track(
                id="default_title",
                kind="text",
                start=0.0,
                end=5.0,
                text=scene_plan.title or "MotionClone Explainer",
                color="#ffffff",
                keyframes=[Keyframe(t=0.0, opacity=1.0)]
            )
        )

    return Plan(
        title=scene_plan.title,
        summary=f"Explainer video with {len(scene_plan.scenes)} scenes",
        tracks=tracks,
        background="#0a0a0f"
    )


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


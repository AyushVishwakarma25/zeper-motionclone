"""Master Studio: Website Brand Analysis, Semantic Rebranding, and Visual Layer Customizer."""
import html
import json
import logging
import re
import shutil
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Literal
from PIL import Image

from fastapi import File, Form, HTTPException, UploadFile
from google.genai import types
from pydantic import Field

from .ai import auth_status, get_gemini_client
from .hyperframes import run_cli, frame_info, probe
from .models import Strict, MAX_DURATION
from .process import Cancelled, run
from .rebuild_author import STYLE_PROPERTIES, SceneProject, Layer, Pose
from .security import (
    MAX_UPLOAD_MB,
    ALLOWED_ASSET_EXTENSIONS,
    validate_and_save_upload,
)

logger = logging.getLogger(__name__)


class ColorPalette(Strict):
    background: str = Field(default='#0e0e13', pattern=r'^(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|transparent)$')
    text: str = Field(default='#ffffff', pattern=r'^#[0-9a-fA-F]{6}$')
    accent: str = Field(default='#00f2fe', pattern=r'^#[0-9a-fA-F]{6}$')


class BrandProfile(Strict):
    company_name: str = Field(default='', max_length=120)
    tagline: str = Field(default='', max_length=240)
    description: str = Field(default='', max_length=1000)
    key_value_props: list[str] = Field(default_factory=list)
    call_to_action: str = Field(default='Get started today', max_length=100)
    colors: ColorPalette = Field(default_factory=ColorPalette)
    logo_url: str = Field(default='', max_length=1000)
    logo_svg: str = Field(default='', max_length=5000)



class AnalyzeRequest(Strict):
    url: str = Field(default='', max_length=500)
    description: str = Field(default='', max_length=2000)


class RebrandRequest(Strict):
    brand: BrandProfile
    instructions: str = Field(default='', max_length=1500)


class AnimateScreenshotRequest(Strict):
    asset_filename: str = Field(min_length=1, max_length=200)
    preset: Literal['dashboard_3d_float', 'interactive_cursor_click', 'hero_scroll_reveal', 'transparent_callout'] = 'dashboard_3d_float'
    title: str = Field(default='', max_length=120)
    subtitle: str = Field(default='', max_length=240)
    click_x: float = Field(default=0.72, ge=0.0, le=1.0)
    click_y: float = Field(default=0.38, ge=0.0, le=1.0)
    duration: float = Field(default=5.0, ge=1.0, le=30.0)
    card_radius: int = Field(default=16, ge=0, le=60)
    accent_color: str = Field(default='#00f2fe', pattern=r'^#[0-9a-fA-F]{6}$')



def scrape_website_content(url: str) -> dict[str, Any]:
    """Extract page title, description, headings, visible text, colors, and logo clues."""
    parsed = urllib.parse.urlparse(url)
    if not parsed.scheme:
        url = 'https://' + url
        parsed = urllib.parse.urlparse(url)

    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            content_type = response.headers.get('content-type', '').lower()
            if 'text/html' not in content_type and 'application/xhtml' not in content_type:
                return {'url': url, 'raw_text': f'Website responded with content-type: {content_type}'}
            raw_bytes = response.read(256 * 1024)  # First 256KB is plenty
            encoding = response.headers.get_content_charset() or 'utf-8'
            html_text = raw_bytes.decode(encoding, errors='replace')
    except Exception as exc:
        raise ValueError(f'Could not fetch website {url}: {exc}') from exc

    # Extract Meta & OpenGraph
    title_match = re.search(r'<title[^>]*>(.*?)</title>', html_text, re.I | re.S)
    title = html.unescape(title_match.group(1).strip()) if title_match else ''

    def get_meta(prop_name):
        m = re.search(rf'<meta\s+(?:name|property)=["\'](?:og:)?{prop_name}["\']\s+content=["\'](.*?)["\']', html_text, re.I)
        if not m:
            m = re.search(rf'<meta\s+content=["\'](.*?)["\']\s+(?:name|property)=["\'](?:og:)?{prop_name}["\']', html_text, re.I)
        return html.unescape(m.group(1).strip()) if m else ''

    og_title = get_meta('title') or title
    og_desc = get_meta('description')
    og_image = get_meta('image')
    site_name = get_meta('site_name')

    # Extract favicon / logo icon
    icon_match = re.search(r'<link[^>]+rel=["\'](?:shortcut )?icon["\'][^>]+href=["\'](.*?)["\']', html_text, re.I)
    favicon = icon_match.group(1).strip() if icon_match else ''
    if favicon and not favicon.startswith(('http://', 'https://', '//')):
        favicon = urllib.parse.urljoin(url, favicon)

    # Extract prominent hex colors
    colors = re.findall(r'#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b', html_text)
    dominant_colors = [c.upper() for c in colors[:15]]

    # Strip scripts, styles, and tags for readable text
    cleaned = re.sub(r'<script.*?</script>', ' ', html_text, flags=re.I | re.S)
    cleaned = re.sub(r'<style.*?</style>', ' ', cleaned, flags=re.I | re.S)
    cleaned = re.sub(r'<svg.*?</svg>', ' ', cleaned, flags=re.I | re.S)
    cleaned = re.sub(r'<[^>]+>', ' ', cleaned)
    visible_text = re.sub(r'\s+', ' ', cleaned).strip()[:3500]

    return {
        'url': url,
        'title': og_title,
        'site_name': site_name,
        'description': og_desc,
        'logo_candidate': og_image or favicon,
        'colors': dominant_colors,
        'text_snippet': visible_text,
    }


def analyze_brand(req: AnalyzeRequest) -> BrandProfile:
    """Uses Gemini to distill scraped website data or manual notes into a BrandProfile."""
    if not auth_status():
        raise ValueError('Gemini connection required. Connect Gemini in Settings.')

    scraped_data = {}
    if req.url.strip():
        try:
            scraped_data = scrape_website_content(req.url.strip())
        except Exception as e:
            logger.warning(f'Scraping failed: {e}. Will rely on Gemini knowledge.')
            scraped_data = {'url': req.url, 'note': f'Direct crawl returned: {e}'}

    client, model, auth_type = get_gemini_client()

    prompt = (
        "You are an elite Brand Strategist and Creative Director.\n"
        "Analyze this company/product information and return a structured BrandProfile in JSON.\n\n"
        f"USER REQUEST / DESCRIPTION:\n{req.description}\n\n"
        f"WEBSITE SCRAPED INTEL:\n{json.dumps(scraped_data, indent=2)}\n\n"
        "EXTRACTION GOALS:\n"
        "1. Identify the exact company/brand name.\n"
        "2. Formulate a killer 1-sentence punchy marketing tagline (under 12 words).\n"
        "3. Provide a concise 2-sentence description of what the product does.\n"
        "4. Extract 3 to 4 distinct key value propositions (bullet benefits like '10x Faster Deployment', 'Zero-Config Setup').\n"
        "5. Define a high-conversion call to action (e.g. 'Start Free Trial', 'Book a Demo', 'Download Now').\n"
        "6. Curate a harmonious, premium color palette:\n"
        "   - 'background': deep modern dark (#0b0c10 or #0e0e13) or clean crisp light (#f8f9fa)\n"
        "   - 'text': contrasting high-legibility color (#ffffff or #111111)\n"
        "   - 'accent': eye-popping vibrant brand color (e.g. #00f2fe, #7952d5, #00ff88, #ff3366)\n"
        "7. Include a logo_url if found in the intel, or an SVG path string for a clean geometric icon if appropriate.\n"
    )

    config = types.GenerateContentConfig(
        response_mime_type='application/json',
        response_schema=BrandProfile,
        temperature=0.2,
        max_output_tokens=4096,
    )

    res = client.models.generate_content(
        model=model,
        contents=[prompt],
        config=config,
    )

    if not res or not res.text:
        raise ValueError('No brand profile returned by Gemini.')

    return BrandProfile.model_validate_json(res.text.strip())


def rebrand_project(folder: Path, req: RebrandRequest) -> dict[str, Any]:
    """Semantically remaps all text and styles in project.json to match the target BrandProfile."""
    project_file = folder / 'rebuild/project.json'
    if not project_file.is_file():
        raise ValueError('No rebuilt project found for this job.')

    data = json.loads(project_file.read_text(encoding='utf-8'))
    layers = data.get('layers', [])
    text_layers = [l for l in layers if l.get('kind') == 'text' and l.get('text', '').strip()]

    if not text_layers:
        raise ValueError('This project contains no text layers to rebrand.')

    client, model, auth_type = get_gemini_client()

    summary_layers = [
        {
            'id': l['id'],
            'original_text': l['text'],
            'start': round(l.get('start', 0), 2),
            'end': round(l.get('end', 0), 2),
        }
        for l in text_layers
    ]

    palette = req.brand.colors.model_dump()

    prompt = (
        "You are an award-winning Commercial Director and Motion Graphics Copywriter.\n"
        "You are given the text layer breakdown of a viral commercial, ordered by appearance.\n"
        "YOUR TASK: Rewrite every single text layer to promote the target client brand, preserving the original rhythm, duration, and narrative arc.\n\n"
        f"TARGET BRAND PROFILE:\n{req.brand.model_dump_json(indent=2)}\n\n"
        f"USER EXTRA INSTRUCTIONS:\n{req.instructions}\n\n"
        f"ORIGINAL MOTION TEXT LAYERS (CHRONOLOGICAL):\n{json.dumps(summary_layers, indent=2)}\n\n"
        "MANDATORY COPYWRITING RULES:\n"
        "1. Respect character length: Do NOT exceed the original layer's character length by more than 20%, otherwise the text will overflow the video viewport.\n"
        "2. Narrative Arc:\n"
        "   - Early layers: Hook the viewer with the customer problem or company name.\n"
        "   - Middle layers: Showcase the target brand's unique features and superpowers.\n"
        "   - Final layers: Strong Call to Action (e.g. website, 'Try Zeper AI', 'Download today').\n"
        "3. Match tone: Premium, punchy, modern tech commercial style.\n"
        "4. Colors: Use the brand palette: Background: " + palette.get('background', '#0b0c10') +
        ", Text: " + palette.get('text', '#ffffff') + ", Accent: " + palette.get('accent', '#00f2fe') + ".\n\n"
        "Return a JSON object containing:\n"
        "- 'background': the hex color for the overall project background\n"
        "- 'updates': list of objects, each containing:\n"
        "    - 'id': exact layer ID\n"
        "    - 'text': the new rewritten text\n"
        "    - 'color': hex color for this text layer (use text or accent color)\n"
    )

    class TextLayerUpdate(Strict):
        id: str
        text: str
        color: str = Field(default='#ffffff', pattern=r'^#[0-9a-fA-F]{6}$')

    class RebrandResponse(Strict):
        background: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
        updates: list[TextLayerUpdate]

    config = types.GenerateContentConfig(
        response_mime_type='application/json',
        response_schema=RebrandResponse,
        temperature=0.3,
        max_output_tokens=8192,
        thinking_config=types.ThinkingConfig(thinking_budget=512),
    )


    res = client.models.generate_content(
        model=model,
        contents=[prompt],
        config=config,
    )

    if not res or not res.text:
        raise ValueError('No rebrand suggestions returned by Gemini.')

    raw_text = res.text.strip()
    if raw_text.startswith('```'):
        raw_text = re.sub(r'^```(?:json)?\s*', '', raw_text).removesuffix('```').strip()

    rebrand_data = RebrandResponse.model_validate_json(raw_text)
    new_bg = rebrand_data.background or palette.get('background', '#0b0c10')
    updates_map = {u.id: u for u in rebrand_data.updates}

    # Apply updates to data
    data['background'] = new_bg
    for layer in data.get('layers', []):
        lid = layer.get('id')
        if lid in updates_map:
            layer['text'] = updates_map[lid].text
            layer_color = updates_map[lid].color or palette.get('text', '#ffffff')
            layer.setdefault('style', {})['color'] = layer_color

        # If it's a background rect layer, update its background color
        if '__background' in lid or layer.get('id', '').endswith('background'):
            layer.setdefault('style', {})['background'] = new_bg

    # Validate against SceneProject excluding root dimensions
    clean_data = {k: v for k, v in data.items() if k not in ('width', 'height', 'duration')}
    validated = SceneProject.model_validate(clean_data)

    final_dict = {
        **validated.model_dump(),
        **{k: v for k, v in data.items() if k in ('width', 'height', 'duration')}
    }

    # Save project.json and project.js atomically
    save_rebuild_project(folder, final_dict)

    return final_dict



def save_rebuild_project(folder: Path, project_data: dict[str, Any]) -> None:
    """Save project.json and sync project.js atomically."""
    rebuild_dir = folder / 'rebuild'
    rebuild_dir.mkdir(parents=True, exist_ok=True)

    project_json = rebuild_dir / 'project.json'
    tmp_json = rebuild_dir / 'project.tmp'
    tmp_json.write_text(json.dumps(project_data, indent=2), encoding='utf-8')
    tmp_json.replace(project_json)

    project_js = rebuild_dir / 'project.js'
    tmp_js = rebuild_dir / 'project_js.tmp'
    tmp_js.write_text(f'window.project = {json.dumps(project_data, indent=2)};\n', encoding='utf-8')
    tmp_js.replace(project_js)


def animate_screenshot_layers(folder: Path, req: AnimateScreenshotRequest) -> dict[str, Any]:
    """Generates spring/eased animated layers for a website or dashboard screenshot."""
    rebuild_dir = folder / 'rebuild'
    project_file = rebuild_dir / 'project.json'

    if project_file.is_file():
        project_data = json.loads(project_file.read_text(encoding='utf-8'))
    else:
        media_file = folder / 'media.json'
        media = json.loads(media_file.read_text(encoding='utf-8')) if media_file.is_file() else {'width': 1920, 'height': 1080, 'fps': 30, 'duration': req.duration}
        project_data = {
            'width': media.get('width', 1920),
            'height': media.get('height', 1080),
            'duration': req.duration,
            'title': req.title or 'Dashboard Animation',
            'background': '#0b0b12' if req.preset != 'transparent_callout' else '#00000000',
            'notes': ['Animated screenshot showcase created with Motion-Graphics Studio.'],
            'layers': []
        }

    W = int(project_data.get('width', 1920))
    H = int(project_data.get('height', 1080))
    dur = float(req.duration)
    project_data['duration'] = max(float(project_data.get('duration', 5.0)), dur)

    # Locate image asset
    asset_path = folder / 'assets' / req.asset_filename
    if not asset_path.is_file():
        asset_path = rebuild_dir / 'assets' / req.asset_filename
    if not asset_path.is_file():
        raise ValueError(f'Asset {req.asset_filename} not found in project assets.')

    img_w, img_h = 1600, 1000
    try:
        with Image.open(asset_path) as im:
            img_w, img_h = im.size
    except Exception:
        pass

    aspect = img_w / max(1, img_h)
    target_w = round(min(W * 0.80, 1400))
    target_h = round(target_w / aspect)
    if target_h > H * 0.58:
        target_h = round(H * 0.58)
        target_w = round(target_h * aspect)

    center_x = round((W - target_w) / 2)
    center_y = round((H - target_h) / 2 + (40 if req.title else 0))

    # Pro Prompts Animation: Enter with spring overshoot, subtle holding life (floating y), clean exit
    t_enter_settle = round(min(0.9, dur * 0.18), 2)
    t_overshoot = round(t_enter_settle * 0.65, 2)
    t_exit_start = round(dur - min(0.8, dur * 0.16), 2)

    screenshot_poses = [
        # Offscreen / scaled down entrance with anticipation
        Pose(t=0.0, x=center_x, y=center_y + 45, w=round(target_w * 0.84), h=round(target_h * 0.84), opacity=0.0, rotation=-2.0, reveal=1.0),
        # Overshoot peak
        Pose(t=t_overshoot, x=center_x, y=center_y - 6, w=round(target_w * 1.025), h=round(target_h * 1.025), opacity=1.0, rotation=0.4, reveal=1.0),
        # Settle
        Pose(t=t_enter_settle, x=center_x, y=center_y, w=target_w, h=target_h, opacity=1.0, rotation=0.0, reveal=1.0),
        # Subtle floating life while holding
        Pose(t=round(dur * 0.42, 2), x=center_x, y=center_y - 7, w=target_w, h=target_h, opacity=1.0, rotation=0.0, reveal=1.0),
        Pose(t=round(dur * 0.68, 2), x=center_x, y=center_y + 6, w=target_w, h=target_h, opacity=1.0, rotation=0.0, reveal=1.0),
        # Exit start
        Pose(t=t_exit_start, x=center_x, y=center_y, w=target_w, h=target_h, opacity=1.0, rotation=0.0, reveal=1.0),
        # Clean exit before scene finish
        Pose(t=dur, x=center_x, y=center_y - 35, w=round(target_w * 0.90), h=round(target_h * 0.90), opacity=0.0, rotation=1.5, reveal=1.0)
    ]

    new_layers = []
    ts = int(time.time() * 1000)

    # 1. Main Screenshot Card Layer
    card_layer = Layer(
        id=f"card_{ts}",
        parent="",
        kind="image",
        text="",
        image=f"/media/{folder.name}/assets/{req.asset_filename}",
        path="",
        style={
            "borderRadius": f"{req.card_radius}px",
            "boxShadow": f"0 24px 70px rgba(0,0,0,0.7), 0 0 25px {req.accent_color}25",
            "border": f"1px solid rgba(255,255,255,0.14)",
            "objectFit": "cover"
        },
        start=0.0,
        end=dur,
        frames=screenshot_poses
    )
    new_layers.append(card_layer)

    # 2. Interactive Cursor Click Demo
    if req.preset == 'interactive_cursor_click':
        cx = center_x + round(target_w * req.click_x)
        cy = center_y + round(target_h * req.click_y)
        t_click = round(min(2.0, dur * 0.4), 2)

        # Expanding Ripple Ring
        ripple_layer = Layer(
            id=f"ripple_{ts}",
            parent="",
            kind="ellipse",
            text="",
            path="",
            style={
                "border": f"2.5px solid {req.accent_color}",
                "boxShadow": f"0 0 16px {req.accent_color}"
            },
            start=max(0.1, t_click - 0.05),
            end=min(dur, t_click + 0.6),
            frames=[
                Pose(t=round(t_click - 0.05, 2), x=cx - 4, y=cy - 4, w=8, h=8, opacity=0.0, rotation=0.0, reveal=1.0),
                Pose(t=t_click, x=cx - 8, y=cy - 8, w=16, h=16, opacity=0.95, rotation=0.0, reveal=1.0),
                Pose(t=round(t_click + 0.55, 2), x=cx - 40, y=cy - 40, w=80, h=80, opacity=0.0, rotation=0.0, reveal=1.0)
            ]
        )
        new_layers.append(ripple_layer)

        # SVG Mouse Cursor
        cursor_layer = Layer(
            id=f"cursor_{ts}",
            parent="",
            kind="path",
            text="",
            path="M 0 0 L 16 16 L 9 17 L 14 27 L 10 29 L 5 19 L 0 23 Z",
            style={
                "fill": "#ffffff",
                "stroke": "#000000",
                "strokeWidth": "1.5px",
                "filter": "drop-shadow(0 4px 8px rgba(0,0,0,0.6))"
            },
            start=round(t_click * 0.4, 2),
            end=min(dur, t_click + 1.8),
            frames=[
                Pose(t=round(t_click * 0.4, 2), x=cx + 120, y=cy + 160, w=28, h=28, opacity=0.0, rotation=0.0, reveal=1.0),
                Pose(t=round(t_click * 0.75, 2), x=cx + 35, y=cy + 45, w=28, h=28, opacity=1.0, rotation=0.0, reveal=1.0),
                Pose(t=round(t_click - 0.05, 2), x=cx, y=cy, w=28, h=28, opacity=1.0, rotation=0.0, reveal=1.0),
                Pose(t=t_click, x=cx, y=cy, w=22, h=22, opacity=1.0, rotation=0.0, reveal=1.0),
                Pose(t=round(t_click + 0.2, 2), x=cx, y=cy, w=28, h=28, opacity=1.0, rotation=0.0, reveal=1.0),
                Pose(t=round(t_click + 0.8, 2), x=cx + 60, y=cy + 60, w=28, h=28, opacity=1.0, rotation=0.0, reveal=1.0),
                Pose(t=round(t_click + 1.8, 2), x=cx + 100, y=cy + 100, w=28, h=28, opacity=0.0, rotation=0.0, reveal=1.0)
            ]
        )
        new_layers.append(cursor_layer)

    # 3. Typography Title & Eyebrow Overlays
    if req.title:
        title_top = max(30, center_y - 110)
        title_layer = Layer(
            id=f"title_{ts}",
            parent="",
            kind="text",
            text=req.title,
            style={
                "color": "#ffffff",
                "fontSize": f"{min(52, round(W * 0.045))}px",
                "fontWeight": "800",
                "fontFamily": "Inter, sans-serif",
                "textAlign": "center",
                "textShadow": "0 4px 20px rgba(0,0,0,0.8)"
            },
            start=0.1,
            end=dur,
            frames=[
                Pose(t=0.1, x=round(W * 0.1), y=title_top + 25, w=round(W * 0.8), h=70, opacity=0.0, rotation=0.0, reveal=0.0),
                Pose(t=t_overshoot, x=round(W * 0.1), y=title_top - 4, w=round(W * 0.8), h=70, opacity=1.0, rotation=0.0, reveal=1.0),
                Pose(t=t_enter_settle, x=round(W * 0.1), y=title_top, w=round(W * 0.8), h=70, opacity=1.0, rotation=0.0, reveal=1.0),
                Pose(t=t_exit_start, x=round(W * 0.1), y=title_top, w=round(W * 0.8), h=70, opacity=1.0, rotation=0.0, reveal=1.0),
                Pose(t=dur, x=round(W * 0.1), y=title_top - 20, w=round(W * 0.8), h=70, opacity=0.0, rotation=0.0, reveal=1.0)
            ]
        )
        new_layers.append(title_layer)

    if req.subtitle:
        sub_top = max(10, center_y - 155)
        sub_layer = Layer(
            id=f"subtitle_{ts}",
            parent="",
            kind="text",
            text=req.subtitle.upper(),
            style={
                "color": req.accent_color,
                "fontSize": f"{min(20, round(W * 0.018))}px",
                "fontWeight": "700",
                "letterSpacing": "2px",
                "fontFamily": "Inter, sans-serif",
                "textAlign": "center",
                "textShadow": f"0 0 12px {req.accent_color}55"
            },
            start=0.05,
            end=dur,
            frames=[
                Pose(t=0.05, x=round(W * 0.15), y=sub_top + 15, w=round(W * 0.7), h=40, opacity=0.0, rotation=0.0, reveal=1.0),
                Pose(t=round(t_enter_settle * 0.8, 2), x=round(W * 0.15), y=sub_top, w=round(W * 0.7), h=40, opacity=1.0, rotation=0.0, reveal=1.0),
                Pose(t=t_exit_start, x=round(W * 0.15), y=sub_top, w=round(W * 0.7), h=40, opacity=1.0, rotation=0.0, reveal=1.0),
                Pose(t=dur, x=round(W * 0.15), y=sub_top - 15, w=round(W * 0.7), h=40, opacity=0.0, rotation=0.0, reveal=1.0)
            ]
        )
        new_layers.append(sub_layer)

    # If preset is transparent callout, adjust project background
    if req.preset == 'transparent_callout':
        project_data['background'] = '#00000000'

    # Combine with existing layers
    raw_existing = project_data.get('layers', [])
    combined_layers = raw_existing + [l.model_dump() for l in new_layers]
    clean_data = {k: v for k, v in project_data.items() if k not in ('width', 'height', 'duration')}
    clean_data['layers'] = combined_layers
    validated = SceneProject.model_validate(clean_data)

    final_dict = {
        **validated.model_dump(),
        'width': W,
        'height': H,
        'duration': project_data['duration']
    }

    save_rebuild_project(folder, final_dict)
    return final_dict


def render_hyperframes_output(folder: Path, cancel: threading.Event, progress=None) -> Path:
    """Renders the current rebuild/ project into output.mp4 at 30 FPS."""
    rebuild_dir = folder / 'rebuild'
    if not (rebuild_dir / 'index.html').is_file():
        raise ValueError('Rebuild project index.html not found.')

    source_path = folder / 'source.mp4'
    media = probe(source_path) if source_path.is_file() else {'fps': 30, 'audio': True}
    count, fps = frame_info(source_path, cancel) if source_path.is_file() else (900, '30/1')

    if progress:
        progress('Rendering updated 30 FPS animation in HyperFrames', 10)

    # Clean previous output
    output_mp4 = folder / 'output.mp4'
    output_mp4.unlink(missing_ok=True)

    # Run hyperframes render CLI inside rebuild directory
    run_cli(['render', '--video-frame-format', 'png', '--quality', 'high', '--crf', '16', '--fps', str(fps), '--output', 'rendered.mp4'],
            rebuild_dir, cancel, progress)

    rendered_raw = rebuild_dir / 'rendered.mp4'
    if not rendered_raw.is_file():
        # Fallback to check if output.mp4 was written directly
        if (rebuild_dir / 'output.mp4').is_file():
            rendered_raw = rebuild_dir / 'output.mp4'
        else:
            raise ValueError('HyperFrames render did not produce rendered.mp4.')

    if progress:
        progress('Muxing audio and finalizing video', 90)

    # If original audio exists, mux it with the new render
    if source_path.is_file() and media.get('audio'):
        run([
            'ffmpeg', '-y', '-v', 'error',
            '-i', str(rendered_raw),
            '-i', str(source_path),
            '-c:v', 'copy',
            '-map', '0:v:0',
            '-map', '1:a:0?',
            '-c:a', 'aac',
            '-shortest',
            '-movflags', '+faststart',
            str(output_mp4)
        ], timeout=120, cancel=cancel)
        rendered_raw.unlink(missing_ok=True)
    else:
        shutil.move(str(rendered_raw), str(output_mp4))

    if progress:
        progress('Render complete! Your customized video is ready.', 100)

    return output_mp4


def install(app, server):
    """Register Master Studio API routes."""

    @app.post('/api/brand/analyze')
    def api_analyze_brand(req: AnalyzeRequest):
        try:
            return analyze_brand(req)
        except Exception as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get('/api/jobs/{id}/rebuild-project')
    def api_get_rebuild_project(id: str):
        job = server.get_job(id)
        project_file = server.DATA / id / 'rebuild/project.json'
        if not project_file.is_file():
            raise HTTPException(404, 'No editable HyperFrames project found for this job.')
        try:
            return json.loads(project_file.read_text(encoding='utf-8'))
        except Exception as exc:
            raise HTTPException(500, f'Error reading project.json: {exc}') from exc

    @app.post('/api/jobs/{id}/rebrand')
    def api_rebrand_project(id: str, req: RebrandRequest):
        job = server.get_job(id)
        folder = server.DATA / id
        try:
            updated = rebrand_project(folder, req)
            return updated
        except Exception as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post('/api/jobs/{id}/save-project')
    def api_save_project(id: str, project_data: dict[str, Any]):
        job = server.get_job(id)
        folder = server.DATA / id
        try:
            clean_data = {k: v for k, v in project_data.items() if k not in ('width', 'height', 'duration')}
            validated = SceneProject.model_validate(clean_data)
            final_dict = {
                **validated.model_dump(),
                **{k: v for k, v in project_data.items() if k in ('width', 'height', 'duration')}
            }
            save_rebuild_project(folder, final_dict)
            return {'ok': True, 'project': final_dict}

        except Exception as exc:
            raise HTTPException(422, f'Invalid project structure: {exc}') from exc

    @app.post('/api/jobs/{id}/render-rebuild')
    def api_render_rebuild(id: str):
        job = server.get_job(id)
        folder = server.DATA / id
        with server.LOCK:
            if server.ACTIVE['id']:
                raise HTTPException(409, 'Another video is currently processing. Please wait.')
            server.ACTIVE['id'] = id
            job.update(status='running', stage='Rendering your customized HyperFrames video…', progress=10)
            server.persist(job)

        def run_background():
            try:
                render_hyperframes_output(folder, job['cancel'], lambda msg, pct: job.update(stage=msg, progress=pct))
                with server.LOCK:
                    job.update(status='complete', stage='Ready', progress=100)
                    server.persist(job)
            except Exception as e:
                with server.LOCK:
                    job.update(status='error', stage='Render failed', error=str(e))
                    server.persist(job)
            finally:
                with server.LOCK:
                    server.ACTIVE['id'] = None

        server.POOL.submit(run_background)
        return {'ok': True, 'message': 'Render started. Follow progress on dashboard.'}

    @app.post('/api/jobs/{id}/upload-asset')
    async def api_upload_asset(id: str, file: UploadFile = File(...)):
        server.get_job(id)
        folder = server.DATA / id
        assets_dir = folder / 'assets'
        assets_dir.mkdir(parents=True, exist_ok=True)
        rebuild_assets = folder / 'rebuild/assets'
        rebuild_assets.mkdir(parents=True, exist_ok=True)

        raw_name = Path(file.filename or 'asset.png').name
        content_type = getattr(file, 'content_type', '') or ''
        is_video_hint = bool(
            re.search(r'\.(mp4|mov|webm|m4v|mkv)$', raw_name, re.I)
            or content_type.startswith('video/')
            or 'video' in raw_name.lower()
        )
        safe_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', raw_name)
        if is_video_hint and not re.search(r'\.(mp4|mov|webm)$', safe_name, re.I):
            safe_name += '.mp4'
        elif not re.search(r'\.(png|jpg|jpeg|webp|svg|gif|mp4|mov|webm)$', safe_name, re.I):
            safe_name += '.png'

        dest = assets_dir / safe_name
        await validate_and_save_upload(file, dest, ALLOWED_ASSET_EXTENSIONS, MAX_UPLOAD_MB)

        # Mirror to rebuild/assets
        shutil.copy2(dest, rebuild_assets / safe_name)
        contents_len = dest.stat().st_size

        # If a video is uploaded to assets, auto-wire it as the reference source.mp4
        is_video = bool(re.search(r'\.(mp4|mov|webm)$', safe_name, re.I)) or is_video_hint
        if is_video and contents_len > 10240:
            dest_source = folder / 'source.mp4'
            shutil.copy2(dest, dest_source)
            from .media import thumbnail, probe
            try:
                meta = probe(dest_source)
                (folder / 'media.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
                job = server.get_job(id)
                job['media'] = meta
                job['has_reference'] = True
                job['stage'] = 'Reference ready'
                server.persist(job)
                thumbnail(dest_source, folder / 'thumbnail.jpg')
            except Exception:
                pass

            # Update dashboard_project.json
            dashboard_file = folder / 'dashboard_project.json'
            try:
                dstate = {}
                if dashboard_file.is_file():
                    dstate = json.loads(dashboard_file.read_text(encoding='utf-8'))
                dstate['has_reference'] = True
                dstate['source_url'] = f'/media/{id}/source.mp4'
                dstate['stage'] = 'Reference ready'
                dashboard_file.write_text(json.dumps(dstate, indent=2), encoding='utf-8')
            except Exception:
                pass

        w, h = 1920, 1080
        if not is_video:
            try:
                with Image.open(dest) as im:
                    w, h = im.size
            except Exception:
                pass

        return {
            'ok': True,
            'filename': safe_name,
            'is_video': is_video,
            'source_url': f'/media/{id}/source.mp4' if is_video else None,
            'url': f'/media/{id}/assets/{safe_name}',
            'width': w,
            'height': h
        }

    @app.get('/api/jobs/{id}/assets')
    def api_list_assets(id: str):
        server.get_job(id)
        folder = server.DATA / id
        assets_dir = folder / 'assets'
        if not assets_dir.is_dir():
            return []
        items = []
        for p in sorted(assets_dir.glob('*'), key=lambda x: x.stat().st_mtime, reverse=True):
            if p.is_file() and not p.name.startswith('.'):
                items.append({
                    'filename': p.name,
                    'url': f'/media/{id}/assets/{p.name}',
                    'size': p.stat().st_size
                })
        return items

    @app.post('/api/jobs/{id}/animate-screenshot')
    def api_animate_screenshot(id: str, req: AnimateScreenshotRequest):
        server.get_job(id)
        folder = server.DATA / id
        try:
            result = animate_screenshot_layers(folder, req)
            return {'ok': True, 'project': result, 'message': 'Screenshot animated into scene!'}
        except Exception as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post('/api/jobs/{id}/render-remotion')
    def api_render_remotion(id: str, format: str = 'mp4', composition: str = 'Motion'):
        return trigger_remotion_render(id, format=format, composition=composition)


def trigger_remotion_render(id: str, format: str = 'mp4', composition: str = 'Motion'):
    from . import server
    job = server.get_job(id)
    folder = server.DATA / id
    from .remotion import render as remotion_render
    from .models import Brief, Plan, Track, Keyframe

    cancel_event = job.get('cancel')
    if cancel_event is None:
        cancel_event = threading.Event()
        job['cancel'] = cancel_event

    with server.LOCK:
        if server.ACTIVE['id']:
            raise HTTPException(409, 'Another video is currently processing. Please wait.')
        server.ACTIVE['id'] = id
        label = 'Rendering transparent ProRes overlay…' if format == 'prores' else 'Rendering Remotion video…'
        job.update(status='running', stage=label, progress=10)
        server.persist(job)

    def run_remotion():
        current_stage = "Remotion rendering"
        try:
            plan_file = folder / 'plan.json'
            if plan_file.is_file():
                plan_data = Plan.model_validate_json(plan_file.read_text(encoding='utf-8'))
            else:
                plan_data = Plan(
                    title=job.get('name', 'MotionClone Film'),
                    tracks=[Track(id='scene_fallback', kind='text', text='MotionClone', start=0.0, end=5.0, keyframes=[Keyframe(t=0.0)])],
                    background='#0b0b12'
                )
            brief = Brief.model_validate(job.get('brief', {'brand': '', 'instructions': ''}))
            logger.info(f"Job {id}: Starting Remotion render ({format}, comp={composition})")
            rendered_output = remotion_render(
                folder, plan_data, brief, cancel_event,
                lambda msg, pct: job.update(stage=msg, progress=pct),
                format=format,
                composition=composition
            )
            logger.info(f"Job {id}: Remotion render produced {rendered_output} ({rendered_output.stat().st_size if rendered_output.is_file() else 0} bytes)")

            current_stage = "Post-render finalization"
            logger.info(f"Job {id}: Starting post-render finalization")
            from .pipeline import finalize_job
            finalize_job(folder)
            logger.info(f"Job {id}: Completed successfully")
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            (folder / 'error.log').write_text(tb, encoding='utf-8')
            logger.error(
                f"Job {id} failed during stage '{current_stage}': [{type(e).__name__}] {e}\nFull traceback:\n{tb}"
            )
            failure_stage = 'Render failed' if current_stage == "Remotion rendering" else 'Finalization failed'
            with server.LOCK:
                job.update(status='error', stage=failure_stage, error=f"[{current_stage}] {str(e)}")
                server.persist(job)
        finally:
            with server.LOCK:
                server.ACTIVE['id'] = None

    server.POOL.submit(run_remotion)
    return {'ok': True, 'message': f'Remotion {format} render started.'}


# Module level alias for external routers
api_render_remotion = trigger_remotion_render


"""Reusable Icon & Graphics Kit Coder.

Inspects the existing catalog of coded icons, finds matching reusable icons,
and if not found, automatically synthesizes and codes new vector graphics/icons
using LLM, registering them into the persistent reusable icon kit.
"""
import json
import logging
import re
from pathlib import Path
from typing import Any, Callable, Optional

from pydantic import Field

from .icon_director import CATALOG as BASE_CATALOG, ICON_KEYWORDS, resolve_fallback_icon
from .models import Strict

logger = logging.getLogger(__name__)

CATALOG_PATH = Path(__file__).with_name('icon_catalog.json')
DYNAMIC_CATALOG_PATH = Path(__file__).with_name('dynamic_icon_catalog.json')


class DynamicIconSpec(Strict):
    id: str = Field(pattern=r'^[a-z][a-z0-9_]{2,40}$')
    title: str = Field(min_length=2, max_length=60)
    description: str = Field(min_length=5, max_length=160)
    params: list[str] = Field(default_factory=list)
    viewBox: str = '0 0 400 400'
    layers: list[dict[str, Any]] = Field(default_factory=list)
    svg_markup: Optional[str] = None
    jsx_code: Optional[str] = None


def get_current_catalog() -> dict:
    catalog = dict(BASE_CATALOG)
    if DYNAMIC_CATALOG_PATH.is_file():
        try:
            dynamic = json.loads(DYNAMIC_CATALOG_PATH.read_text(encoding='utf-8'))
            catalog.update(dynamic)
        except Exception:
            pass
    return catalog


def is_in_kit(icon_id: str) -> bool:
    return icon_id in get_current_catalog()


def procedural_fallback_spec(concept: str) -> DynamicIconSpec:
    """Generates a structured, validated animated vector graphic spec without external calls."""
    slug = re.sub(r'[^a-z0-9]+', '_', concept.lower().strip()).strip('_')
    if not slug or not slug[0].isalpha():
        slug = f'icon_{slug}'
    slug = slug[:32]

    # Deterministic palette based on hash
    colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4']
    h = sum(ord(c) for c in concept)
    primary = colors[h % len(colors)]
    accent = colors[(h + 2) % len(colors)]

    layers = [
        # Outer Card / Base Plate
        {
            'tag': 'rect',
            'props': {'x': 40, 'y': 50, 'width': 320, 'height': 300, 'rx': 24, 'fill': '#f8fafc', 'stroke': '#cbd5e1', 'strokeWidth': 4},
            'anim': {'enter': {'delay': 0.05, 'duration': 0.4}}
        },
        # Central Graphic Disc
        {
            'tag': 'circle',
            'props': {'cx': 200, 'cy': 180, 'r': 70, 'fill': primary, 'opacity': 0.15},
            'anim': {'pulse': {'freq': 3, 'amp': 0.08}}
        },
        # Primary Geometric Core
        {
            'tag': 'circle',
            'props': {'cx': 200, 'cy': 180, 'r': 48, 'fill': primary, 'stroke': '#ffffff', 'strokeWidth': 4},
            'anim': {'bob': {'freq': 2.5, 'amp': 6}}
        },
        # Graphic Accent Symbol
        {
            'tag': 'polygon',
            'props': {'points': '200,145 220,195 180,195', 'fill': '#ffffff'},
            'anim': {'rotate': {'speed': 90, 'origin': [200, 180]}}
        },
        # Dynamic Orbiting Spark
        {
            'tag': 'circle',
            'props': {'cx': 255, 'cy': 140, 'r': 8, 'fill': accent, 'stroke': '#ffffff', 'strokeWidth': 2},
            'anim': {'pulse': {'freq': 5, 'amp': 0.2}}
        },
        # Label Plaque
        {
            'tag': 'rect',
            'props': {'x': 90, 'y': 280, 'width': 220, 'height': 36, 'rx': 10, 'fill': '#1e293b'}
        },
        {
            'tag': 'text',
            'props': {'x': 200, 'y': 303, 'textAnchor': 'middle', 'fontSize': 14, 'fontWeight': '800', 'fill': '#ffffff', 'fontFamily': 'Arial'},
            'text': concept[:22].upper()
        }
    ]

    return DynamicIconSpec(
        id=slug,
        title=concept[:40],
        description=f'Vector graphic for {concept}',
        params=['pulse'],
        viewBox='0 0 400 400',
        layers=layers
    )


def code_icon_with_llm(concept: str, topic: str = '', llm: Optional[Callable] = None) -> DynamicIconSpec:
    """Uses Gemini / LLM to write a brand new animated vector icon specification for a topic."""
    if not llm:
        return procedural_fallback_spec(concept)

    prompt = f"""You are an Expert SVG and Remotion Vector Animation Engineer.
Topic: {topic}. Required Icon Concept: "{concept}".
Write a high quality, modern flat vector graphic specification for this concept (viewBox "0 0 400 400").
Use clean geometric shapes (rect, circle, path, polygon, polyline, line, g, text), attractive modern colors (#2a2b44 navy, #3b82f6 blue, #22c55e green, #f59e0b amber, #ef4444 red, #f8fafc white).
Include subtle animation configs:
- enter: {{"delay": 0.05, "duration": 0.4}}
- bob: {{"freq": 3, "amp": 4}}
- pulse: {{"freq": 4, "amp": 0.05}}
- rotate: {{"speed": 180}} (for spinning wheels, needles, radar, or rotating components)
- dash: {{"speed": 40}} (for moving lines, roads, circuits)

Return ONLY valid JSON matching this schema:
{{
  "id": "short_snake_case_name",
  "title": "Short Title",
  "description": "when this icon fits",
  "params": ["pulse"],
  "viewBox": "0 0 400 400",
  "layers": [
     {{"tag": "rect", "props": {{"x": 50, "y": 50, "width": 300, "height": 300, "rx": 16, "fill": "#f8fafc"}}, "anim": {{"enter": {{"delay": 0.05, "duration": 0.4}}}}}},
     ...
  ]
}}"""
    try:
        raw = llm(prompt, DynamicIconSpec)
        if isinstance(raw, str):
            raw = json.loads(raw)
        return DynamicIconSpec.model_validate(raw)
    except Exception as e:
        logger.warning(f"LLM icon coding fallback for '{concept}': {e}")
        return procedural_fallback_spec(concept)


def register_icon_in_kit(icon_spec: DynamicIconSpec) -> None:
    """Registers the newly coded icon into the persistent dynamic icon catalog and files."""
    dynamic_catalog = {}
    if DYNAMIC_CATALOG_PATH.is_file():
        try:
            dynamic_catalog = json.loads(DYNAMIC_CATALOG_PATH.read_text(encoding='utf-8'))
        except Exception:
            pass

    if icon_spec.id in dynamic_catalog or icon_spec.id in BASE_CATALOG:
        return

    dynamic_catalog[icon_spec.id] = {
        'use': icon_spec.description,
        'params': icon_spec.params or [],
        'dynamic_svg': icon_spec.model_dump()
    }
    DYNAMIC_CATALOG_PATH.write_text(json.dumps(dynamic_catalog, indent=2), encoding='utf-8')
    logger.info(f"Registered new reusable icon in dynamic catalog: {icon_spec.id} ({icon_spec.title})")


def ensure_icon_for_beat(need_icon_desc: str, topic: str = '', llm: Optional[Callable] = None, allow_code_new: bool = True) -> tuple[str, dict[str, str], Optional[dict]]:
    """Primary entry point: checks if an icon exists in the kit, and if not, codes it automatically.

    Returns: (icon_id, params, optional_dynamic_svg_payload)
    """
    desc = (need_icon_desc or '').strip()
    if not desc:
        return 'why_mark', {}, None

    # Step 1: Check existing kit using semantic keyword matcher
    best_id, params = resolve_fallback_icon(desc)
    desc_lower = desc.lower()
    matched_kws = [
        kw for kw in ICON_KEYWORDS.get(best_id, [])
        if (' ' in kw and kw in desc_lower) or re.search(r'\b' + re.escape(kw) + r'\b', desc_lower)
    ]

    if matched_kws or not allow_code_new:
        # Reusing existing icon from the kit
        logger.info(f"Reusing existing kit icon '{best_id}' for '{desc}' (matched keywords: {matched_kws})")
        return best_id, params, None

    # Step 2: Not in kit -> Automatically code new icon
    logger.info(f"Icon not found in kit for '{desc}'. Automatically coding new reusable icon...")
    new_spec = code_icon_with_llm(desc, topic=topic, llm=llm)
    register_icon_in_kit(new_spec)

    return new_spec.id, {p: 'true' for p in new_spec.params}, new_spec.model_dump()

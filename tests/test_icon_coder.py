import json
from pathlib import Path

from app.icon_coder import (
    DynamicIconSpec,
    ensure_icon_for_beat,
    get_current_catalog,
    is_in_kit,
    procedural_fallback_spec,
    register_icon_in_kit,
)


def test_is_in_kit_detects_existing_and_missing_icons():
    assert is_in_kit('gold_bars') is True
    assert is_in_kit('city_map') is True
    assert is_in_kit('delivery_scooter') is True
    assert is_in_kit('stopwatch_timer') is True
    assert is_in_kit('non_existent_random_icon_xyz') is False


def test_procedural_fallback_spec_creates_valid_animated_layers():
    spec = procedural_fallback_spec('quantum encryption satellite')
    assert spec.id.startswith('quantum_encryption')
    assert spec.viewBox == '0 0 400 400'
    assert len(spec.layers) >= 5
    # Verify animated layer structure
    assert any('anim' in layer for layer in spec.layers)
    assert any(layer.get('tag') == 'rect' for layer in spec.layers)
    assert any(layer.get('tag') == 'circle' for layer in spec.layers)


def test_ensure_icon_for_beat_reuses_existing_kit_icon():
    icon_id, params, dyn = ensure_icon_for_beat('delivery rider on scooter speeding through city traffic')
    assert icon_id == 'delivery_scooter'
    assert params.get('fast') == 'true'
    assert dyn is None  # Reused from kit, no new dynamic svg needed


def test_ensure_icon_for_beat_auto_codes_new_icon_when_missing():
    concept = 'superconducting magnetic levitation train'
    icon_id, params, dyn = ensure_icon_for_beat(concept, topic='Future Transport')
    assert dyn is not None
    assert 'layers' in dyn
    assert len(dyn['layers']) >= 4
    assert is_in_kit(icon_id) is True


def test_genre_pipeline_auto_codes_and_renders_dynamic_svg(tmp_path):
    from app import genre_pipeline as gp
    from app.icon_director import IconBeat, IconPlan

    plan = IconPlan(beats=[
        IconBeat(id='b1', text='Future of energy storage', hook=True, title_lines=['Future of', 'Energy Storage']),
        IconBeat(id='b2', text='Solid state batteries charge instantly', need_icon='A solid state battery glowing with green energy cells'),
        IconBeat(id='b3', text='The grid is transformed forever', need_icon='City map with active green energy connections')
    ])

    res = gp.plan_genre('icon', 'clean tech', 'english', 15, lambda p, s: plan.model_dump_json(), tmp_path)
    assert res['ok'] is True
    assert len(res['need']) == 0

    sp = json.loads((tmp_path / 'scene_plan.json').read_text())
    scene2 = sp['scenes'][1]
    assert 'icon' in scene2
    # Verify either it mapped to a kit icon or attached a dynamic_svg payload
    assert scene2['icon']['id'] != ''

import re
from pathlib import Path

from app.icon_director import CATALOG, IconBeat, IconChoice, IconPlan, Pill, compile_scenes, icon_prompt, lint_icon_plan


def beat(i, text, icon=None, params=None, **kw):
    return IconBeat(id=i, text=text, icon=IconChoice(id=icon, params=params or {}) if icon else None, **kw)


def plan():
    return IconPlan(beats=[beat('h', 'History mein aisa pehli baar', hook=True), beat('b1', 'Gold crash kar raha hai', 'gold_bars', {'fall': 'true'}),
                           beat('b2', 'Silver bhi gir raha hai', 'silver_coin', pill=Pill(text='Silver -8%', tone='red'))])


def test_catalog_matches_the_remotion_registry():
    js = (Path(__file__).parent.parent / 'remotion/src/explainer/icons/index.js').read_text()
    ids = set(re.findall(r"^  (\w+): \{C:", js, re.M))
    assert ids == set(CATALOG), (ids ^ set(CATALOG))


def test_good_plan_passes_lint():
    assert lint_icon_plan(plan()) == []


def test_lint_catches_bad_params_repeats_and_missing_hook():
    p = plan(); p.beats[1].icon.params = {'speed': '3'}
    assert any('no params' in m for m in lint_icon_plan(p))
    p = plan(); p.beats[2].icon = p.beats[1].icon
    assert any('same icon' in m for m in lint_icon_plan(p))
    p = plan(); p.beats[0].hook = False
    assert any('hook' in m for m in lint_icon_plan(p))
    p = plan(); p.beats[2].icon = None
    assert any('no icon' in m for m in lint_icon_plan(p))


def test_compile_uses_relative_word_times_and_reports_missing_icons():
    p = plan(); p.beats[2].icon = None; p.beats[2].need_icon = 'a miner digging silver'
    timing = {'beats': [{'id': 'h', 'start': 0, 'end': 2.5, 'words': [{'word': 'History', 't0': .1, 't1': .5}]},
                        {'id': 'b1', 'start': 2.5, 'end': 5.5, 'words': [{'word': 'Gold', 't0': 2.7, 't1': 3.0}]},
                        {'id': 'b2', 'start': 5.5, 'end': 8.0, 'words': [{'word': 'Silver', 't0': 5.6, 't1': 6.0}]}]}
    out = compile_scenes(p, timing)
    s = out['scenes']
    assert s[0]['mode'] == 'hook' and s[1]['words'][0]['start'] == 0.2 and s[1]['icon']['params'] == {'fall': True}
    assert s[1]['duration_seconds'] == 3.0 and out['need_icon'] == [{'beat': 'b2', 'need_icon': 'a miner digging silver'}]


def test_prompt_lists_every_icon():
    assert all(k in icon_prompt('x', 'hinglish', 40) for k in CATALOG)


def test_estimate_timing_feeds_compile():
    from app.icon_pipeline import estimate_timing
    t = estimate_timing(plan())
    out = compile_scenes(plan(), t)
    assert len(out['scenes']) == 3 and all(s['duration_seconds'] > 1 for s in out['scenes'])
    assert out['scenes'][1]['words'][0]['start'] >= 0.19


def test_resolve_fallback_icon_for_quick_commerce():
    from app.icon_director import resolve_fallback_icon
    # Test user reported cases
    icon1, p1 = resolve_fallback_icon('A city map with multiple small warehouse icons popping up')
    assert icon1 == 'city_map'
    assert p1.get('pulse') == 'true'

    icon2, p2 = resolve_fallback_icon('A stopwatch ticking down while groceries are dropped into a brown bag')
    assert icon2 == 'stopwatch_timer'
    assert p2.get('bag') == 'true'

    icon3, p3 = resolve_fallback_icon('A delivery rider on a scooter zooming fast on a street')
    assert icon3 == 'delivery_scooter'
    assert p3.get('fast') == 'true'

    icon4, p4 = resolve_fallback_icon('A glowing box combining a location pin and a microchip')
    assert icon4 == 'package_box'
    assert p4.get('glow') == 'true'

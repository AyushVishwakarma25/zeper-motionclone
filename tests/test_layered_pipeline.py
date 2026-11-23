import io

from PIL import Image, ImageDraw

from app import asset_studio as st
from app.director import Beat, BeatObject, Character, Plates, SetSpec, ShotPlan, Surface, lint_plan
from app.layered_pipeline import build_scenes

STYLE = st.StyleBible(summary='flat 2D cartoon, thick dark outline, warm palette', outline='4px #3a2418',
                      palette=['#3a2418', '#e9b872', '#c9783c', '#f6e7c8'])


def png(*_):
    im = Image.new('RGB', (400, 300), (0, 255, 0)); ImageDraw.Draw(im).rounded_rectangle((100, 80, 300, 220), 20, fill=(190, 190, 200), outline=(58, 36, 24), width=4)
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()


def plan(**over):
    spec = lambda i, n, cm: st.ObjectSpec(id=i, name=n, height_cm=cm, parts=['body', 'handle'], silhouette='rounded shape with handle',
                                          materials=['metal'], rests_on='counter')
    beats = [
        Beat(id=1, text='Your toaster is on fire', dur_s=2.0, visual='hero stares at a smoking toaster on the counter', set='kitchen',
             camera='push_in', objects=[BeatObject(ref='hero', x_frac=.2, on='floor'), BeatObject(ref='toaster', x_frac=.75, on='counter')]),
        Beat(id=2, text='Grab the toast fast', dur_s=2.0, visual='hero grabs the toast from the counter and lifts it', set='kitchen',
             camera='pan_right', objects=[BeatObject(ref='hero', x_frac=.2, on='floor'),
                                          BeatObject(ref='toast', x_frac=.45, on='counter', held_by='hero', hold_from=.5)]),
    ]
    p = ShotPlan(sets=[SetSpec(id='kitchen', surfaces=[Surface(id='floor', x=540, y=1920, w=1080, h=620), Surface(id='counter', x=540, y=1300, w=1080, h=220)],
                               plates=Plates())],
                 characters=[Character(id='hero', asset='hero.png')],
                 specs=[spec('toaster', 'two-slot toaster', 19), spec('toast', 'slice of toast', 2)], beats=beats)
    return p.model_copy(update=over)


def test_validate_scene_rejects_a_floating_prop_through_node():
    from app.layered_pipeline import validate_scene
    layered = {'world': {'w': 1080, 'h': 1920}, 'surfaces': [{'id': 'counter', 'x': 540, 'y': 1300, 'w': 1080, 'h': 220}],
               'objects': [{'id': 'toaster', 'class': 'prop', 'asset': 'x.png', 'x': 500, 'y': 1000, 'w': 150, 'h': 180, 'support': 'counter'}]}
    r = validate_scene(layered, 10)
    assert not r['ok'] and 'floating' in r['counts']


def test_physics_gate_passes_with_recognised_assets(tmp_path):
    names = {'a': 'toaster', 'b': 'toast'}
    calls = iter(['toaster', 'toast'])
    r = build_scenes(plan(), STYLE, tmp_path, lambda p, n, refs: png(), lambda b, q: next(calls))
    assert r['ok'], r['problems']
    assert all(s['physics']['ok'] for s in r['scenes'])


def test_lint_catches_unsupported_and_repeats():
    p = plan()
    p.beats[1].objects[1].on = 'ceiling'
    p.beats[1].objects[1].held_by = ''
    msgs = lint_plan(p)
    assert any('not a surface' in m for m in msgs)
    p2 = plan(); p2.beats[1].camera = 'push_in'; p2.beats[1].objects = p2.beats[0].objects
    assert any('same picture' in m for m in lint_plan(p2))


def test_beat_with_too_many_words_is_rejected():
    p = plan(); p.beats[0].text = ' '.join(['word'] * 13)
    assert any('12 words' in m for m in lint_plan(p))


def test_write_project_matches_render_contract(tmp_path):
    import json
    from app.layered_pipeline import write_project
    calls = iter(['toaster', 'toast'])
    r = build_scenes(plan(), STYLE, tmp_path / 'assets', lambda p, n, refs: png(), lambda b, q: next(calls))
    p = write_project(r, tmp_path)
    sc = json.loads(p.read_text())['scene_plan']['scenes']
    assert [s['template'] for s in sc] == ['layered_asset_scene'] * 2 and sc[0]['duration_seconds'] == 2.0
    assert json.loads((tmp_path / 'build_report.json').read_text())['ok'] is True

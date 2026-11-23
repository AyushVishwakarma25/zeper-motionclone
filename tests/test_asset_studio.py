import io
import json

import pytest
from PIL import Image, ImageDraw

from app import asset_studio as s

STYLE = s.StyleBible(summary='flat 2D cartoon, thick dark outline, warm palette', outline='4px #3a2418',
                     palette=['#3a2418', '#e9b872', '#c9783c', '#f6e7c8'])
TOASTER = s.ObjectSpec(id='toaster', name='two-slot toaster', height_cm=19, parts=['chrome body', 'two slots', 'lever'],
                       silhouette='rounded body with two slot cuts', materials=['chrome'], rests_on='counter')


def fake_png(fill=(200, 120, 60), w=400, h=300):
    im = Image.new('RGB', (w, h), (0, 255, 0))
    d = ImageDraw.Draw(im); d.rounded_rectangle((100, 80, 300, 220), 20, fill=fill, outline=(58, 36, 24), width=4)
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()


def test_lint_rejects_shapes_and_unsupported():
    bad = s.ObjectSpec(id='milk', name='a box', height_cm=20, parts=['label', 'top'], silhouette='a plain rectangle', materials=['x'])
    msgs = s.lint_spec(bad)
    assert any('bare shape' in m for m in msgs) and any('support' in m for m in msgs)
    assert s.lint_spec(TOASTER) == []


def test_key_out_is_clean_and_cropped():
    rgba = s.key_out(fake_png())
    assert rgba.mode == 'RGBA' and rgba.width < 400 and rgba.height < 300
    assert rgba.getpixel((0, 0))[3] == 0 and s.fringe_score(rgba) < 0.15


def test_pixel_height_comes_from_real_size():
    assert s.pixel_height(TOASTER, 170, 1000) == 112


def test_build_asset_passes_and_writes_manifest(tmp_path):
    m = s.build_all([TOASTER], STYLE, tmp_path, lambda p, n, r: fake_png(), lambda b, q: 'toaster')
    assert m['ok'] and (tmp_path / 'toaster.png').is_file()
    assert json.loads((tmp_path / 'manifest.json').read_text())['assets'][0]['height_px'] == 112


def test_unrecognised_asset_fails_after_retries(tmp_path):
    row = s.build_asset(TOASTER, STYLE, tmp_path, lambda p, n, r: fake_png(), lambda b, q: 'beige square', max_tries=2)
    assert not row['ok'] and len(row['tries']) == 2


def test_stronger_prompt_on_retry(tmp_path):
    seen = []
    def gen(p, n, r): seen.append(p); return fake_png()
    s.build_asset(TOASTER, STYLE, tmp_path, gen, lambda b, q: 'nothing', max_tries=2)
    assert 'unmistakable' not in seen[0] and 'unmistakable' in seen[1]


def test_mouth_prompts_cover_nine_shapes():
    assert set(s.MOUTHS) == set('ABCDEFGHX')
    assert 'shape F' in s.mouth_prompt('hero', 'F', STYLE)[0]

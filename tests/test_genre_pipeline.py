import json

from app import genre_pipeline as gp
from app.science_director import ScienceBeat, SciencePlan, Slot


def test_spread_words_fills_the_real_clip_in_order():
    w = gp.spread_words('Gamers see *more* at once.', 3.0)
    assert [x['w'] for x in w][2] == '*more*'
    assert w[0]['start'] >= gp.LEAD_S and w[-1]['end'] <= 3.0
    assert all(a['end'] <= b['start'] + .001 for a, b in zip(w, w[1:]))


def test_retime_uses_clip_duration_not_estimate(tmp_path):
    (tmp_path / 'scene_offsets.json').write_text(json.dumps([{'scene_id': 0, 'clip_duration': 4.0}]))
    sc = [{'template': 'science_scene', 'voiceover_script_en': 'a b c', 'narration_marked': 'a b *c*', 'duration_seconds': 4.3, 'words': []},
          {'template': 'text_scene', 'duration_seconds': 3}]
    out = gp.retime_scenes(sc, tmp_path)
    assert out[0]['words'][-1]['end'] <= 4.0 and out[0]['words'][2]['w'] == '*c*' and 'words' not in out[1]


def test_plan_genre_writes_scene_plan_with_voice_text(tmp_path):
    plan = SciencePlan(beats=[ScienceBeat(id=1, text='Gamers see *more*.', layout='single', slots=[Slot(kind='brain', variant='glow')])])
    res = gp.plan_genre('science', 't', 'english', 20, lambda prompt, schema: plan.model_dump_json(), tmp_path)
    sp = json.loads((tmp_path / 'scene_plan.json').read_text())
    assert res['ok'] and sp['scenes'][0]['voiceover_script_en'] == 'Gamers see more.' and sp['scenes'][0]['template'] == 'science_scene'


def test_unknown_genre_and_missing_prop_are_reported(tmp_path):
    import pytest
    with pytest.raises(ValueError):
        gp.plan_genre('stickman', 't', 'en', 20, None, tmp_path)
    plan = SciencePlan(beats=[ScienceBeat(id=1, text='Zebras glow.', layout='single', slots=[Slot(kind='brain', variant='glow')], need_prop='zebra')])
    assert gp.plan_genre('science', 't', 'en', 20, lambda p, s: plan.model_dump_json(), tmp_path)['ok'] is False


def test_genre_scenes_validate_in_the_dashboard_plan_model(tmp_path):
    """/scenes/update and the project-state save re-validate stored plans; a genre plan must not 400 there."""
    from app.dashboard_agent import SceneItem
    plan = SciencePlan(beats=[ScienceBeat(id=1, text='Gamers see *more*.', layout='single', slots=[Slot(kind='brain', variant='glow')])])
    gp.plan_genre('science', 't', 'english', 20, lambda p, s: plan.model_dump_json(), tmp_path)
    sc = json.loads((tmp_path / 'scene_plan.json').read_text())['scenes'][0]
    assert SceneItem.model_validate({**sc, 'id': 0}).template == 'science_scene'

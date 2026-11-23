from app.science_director import CATALOG, ScienceBeat, SciencePlan, Slot, compile_scenes, estimate_timing, lint_science


def beat(i, text, layout, slots, need=''):
    return ScienceBeat(id=i, text=text, layout=layout, slots=slots, need_prop=need)


def test_catalog_variants_are_compilable():
    plan = SciencePlan(beats=[beat(1, 'Gamers see *more* at once.', 'split', [Slot(kind='person', variant='gamer', talking=True), Slot(kind='lens', variant='gamer')])])
    out = compile_scenes(plan)
    assert not out['problems'] and out['scenes'][0]['slots'][0]['talking'] is True
    assert out['scenes'][0]['words'][0]['start'] < out['scenes'][0]['words'][-1]['end'] < out['scenes'][0]['duration_seconds']


def test_lint_rejects_unknown_wrong_count_and_double_talk():
    bad = lint_science(SciencePlan(beats=[
        beat(1, 'a b c', 'split', [Slot(kind='dragon', variant='x')]),
        beat(2, 'a b', 'row', [Slot(kind='person', variant='gamer', talking=True), Slot(kind='person', variant='student', talking=True), Slot(kind='brain', variant='glow')]),
        beat(3, 'a b', 'single', [Slot(kind='brain', variant='glow', talking=True)])]))
    text = ' | '.join(bad)
    assert 'needs 2 slots' in text and 'not in the catalog' in text and 'more than one talking' in text and 'only a person can talk' in text


def test_need_prop_reported_not_faked_and_real_timing_wins():
    plan = SciencePlan(beats=[beat(1, 'Zebras *glow*.', 'single', [Slot(kind='brain', variant='glow')], need='zebra')])
    real = {'beats': [{'id': 1, 'duration': 2.0, 'words': [{'w': 'Zebras', 'start': .5, 'end': .9}, {'w': '*glow*.', 'start': 1.0, 'end': 1.4}]}]}
    out = compile_scenes(plan, real)
    assert out['need_prop'] == [{'beat': 1, 'concept': 'zebra'}] and out['scenes'][0]['duration_seconds'] == 2.0 and out['scenes'][0]['words'][0]['start'] == .5


def test_catalog_kinds_match_template():
    import re
    src = open('remotion/src/science/ScienceScene.jsx', encoding='utf-8').read()
    block = src.split('export const KINDS')[1].split('};')[0]
    assert set(CATALOG['kinds']) == set(re.findall(r'^\s*(?:\{)?\s*(\w+): \{C:', block.replace(', ', ',\n'), re.M))

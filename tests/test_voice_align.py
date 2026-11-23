import json
import subprocess

from app import genre_pipeline as gp
from app import voice_align as va


def make_audio(path, bursts, gap=.5, lead=.3, tail=.3):
    """Speech stand-in: loud tone bursts (seconds each) separated by silence."""
    parts, f = [], []
    def sil(d): return f'anullsrc=r=44100:cl=mono:d={d}'
    ins = [sil(lead)]
    for i, b in enumerate(bursts):
        ins += [f'sine=frequency={300 + 60 * i}:duration={b}:sample_rate=44100']
        ins += [sil(gap if i < len(bursts) - 1 else tail)]
    cmd = ['ffmpeg', '-y', '-v', 'error']
    for x in ins: cmd += ['-f', 'lavfi', '-i', x]
    cmd += ['-filter_complex', ''.join(f'[{i}:a]' for i in range(len(ins))) + f'concat=n={len(ins)}:v=0:a=1[o]', '-map', '[o]', str(path)]
    subprocess.run(cmd, check=True)


def test_boundaries_snap_to_the_pauses(tmp_path):
    a = tmp_path / 'v.wav'; make_audio(a, [1.5, 2.5, 1.0])         # pauses at 1.8..2.3 and 4.8..5.3
    texts = ['Can a game make you see', 'Gamers and non gamers took the same test today', 'Attention improved']
    r = va.align(a, texts)
    b = r['beats']
    assert abs(b[1]['start'] - 2.05) < .3 and abs(b[2]['start'] - 5.05) < .3
    assert abs(r['total'] - 6.6) < .2 and r['confidence'] > .6
    assert all(w['start'] >= 0 for x in b for w in x['words']) and b[1]['words'][0]['start'] < .5


def test_missing_pauses_lower_confidence(tmp_path):
    a = tmp_path / 'v.wav'; make_audio(a, [6.0])
    r = va.align(a, ['one two three', 'four five six', 'seven eight nine'])
    assert 9.9 in r['snaps']


def test_apply_uploaded_voice_updates_plan_and_blocks_tts(tmp_path):
    a = tmp_path / 'in.wav'; make_audio(a, [1.5, 2.0])
    sc = [{'template': 'science_scene', 'voiceover_script_en': 'Can a game make you see', 'narration_marked': 'Can a *game* make you see', 'words': [], 'duration_seconds': 3},
          {'template': 'science_scene', 'voiceover_script_en': 'Gamers took the test', 'narration_marked': 'Gamers took the *test*', 'words': [], 'duration_seconds': 3}]
    (tmp_path / 'scene_plan.json').write_text(json.dumps({'scenes': sc}))
    res = gp.apply_uploaded_voice(tmp_path, a)
    plan = json.loads((tmp_path / 'scene_plan.json').read_text())['scenes']
    assert (tmp_path / 'voiceover.mp3').is_file()          # the renderer's own TTS guard
    assert res['ok'] and (tmp_path / gp.UPLOAD_NAME).stat().st_size > 1000
    assert plan[0]['aligned'] and plan[0]['words'][2]['w'] == '*game*' and abs(sum(s['duration_seconds'] for s in plan) - res['total']) < .01
    assert gp.retime_scenes(plan, tmp_path)[0]['words'] == plan[0]['words']       # aligned scenes are never re-estimated

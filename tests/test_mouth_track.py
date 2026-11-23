import subprocess, wave, numpy as np
from app.mouth_track import build_track


def make_speechlike(path, secs=2.0, sr=16000):
    t = np.arange(int(sr * secs)) / sr
    env = (np.sin(2 * np.pi * 3.5 * t) > -0.2) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.9 * t))
    env[int(sr * 1.4):] = 0          # trailing silence
    x = env * np.sin(2 * np.pi * 180 * t) * 0.5
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((x * 32767).astype('<i2').tobytes())


def test_one_shape_per_frame_and_rest_in_silence(tmp_path):
    p = tmp_path / 'a.wav'; make_speechlike(p)
    tr = build_track(str(p), fps=30, rhubarb='/nonexistent')
    assert len(tr['frames']) == 60 and set(tr['frames']) <= set('ABCDEFGHX')
    assert tr['frames'][-5:] == ['X'] * 5 and len(set(tr['frames'])) >= 3
    # a mouth never flickers: no isolated one-frame shape
    f = tr['frames']
    assert not any(f[i] != f[i - 1] and f[i] != f[i + 1] for i in range(1, len(f) - 1))

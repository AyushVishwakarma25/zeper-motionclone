"""Uploaded voiceover -> beat boundaries + word times. No ML dependency: ffmpeg silencedetect + the script text.

1. Find speech/silence with ffmpeg. 2. For each of the N-1 beat boundaries pick the silence nearest to where the script says it
should fall (cumulative characters of the beats, over the speech duration), in order. 3. Inside each beat, words are spread over the
beat's own speech (leading/trailing silence trimmed) by word length. Returns a confidence so the UI can warn about bad splits.
For exact per-word sync swap `spread` for a forced aligner; the return shape stays the same.
"""
import re
import subprocess
from pathlib import Path


def probe_duration(path: Path) -> float:
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)], capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def detect_silences(path: Path, noise_db: float = -35.0, min_s: float = 0.18) -> list[tuple[float, float]]:
    r = subprocess.run(['ffmpeg', '-v', 'info', '-i', str(path), '-af', f'silencedetect=noise={noise_db}dB:d={min_s}', '-f', 'null', '-'], capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r'silence_start: (-?[\d.]+)', r.stderr)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', r.stderr)]
    out = []
    for i, s in enumerate(starts):
        out.append((max(0.0, s), ends[i] if i < len(ends) else probe_duration(path)))
    return out


def speech_span(sils: list, dur: float) -> tuple[float, float]:
    lead = sils[0][1] if sils and sils[0][0] <= 0.05 else 0.0
    tail = sils[-1][0] if sils and sils[-1][1] >= dur - 0.05 else dur
    return lead, max(lead + .1, tail)


def split_beats(texts: list[str], sils: list, dur: float) -> dict:
    """Returns {bounds:[t0,t1,...,tN], confidence, snaps:[distance_s,...]} - N+1 boundaries, beat i = bounds[i]..bounds[i+1]."""
    s0, s1 = speech_span(sils, dur)
    inner = [((a + b) / 2, b - a) for a, b in sils if a > s0 + .05 and b < s1 - .05]       # gaps strictly inside the speech
    weights = [max(1, len(re.sub(r'\W', '', t))) for t in texts]
    tot, cum, want = float(sum(weights)), 0.0, []
    for w in weights[:-1]:
        cum += w
        want.append(s0 + (s1 - s0) * cum / tot)
    bounds, snaps, last, used = [s0], [], s0, set()
    for k, tgt in enumerate(want):
        cand = [(abs(m - tgt) - .15 * min(gap, 1.0), i, m) for i, (m, gap) in enumerate(inner) if i not in used and m > last + .3]
        if cand:
            _, i, m = min(cand); used.add(i); snaps.append(round(abs(m - tgt), 2)); last = m; bounds.append(m)
        else:
            snaps.append(9.9); last = max(last + .3, tgt); bounds.append(last)
    bounds.append(s1)
    span = max(.5, s1 - s0)
    conf = 1.0 if not snaps else round(max(0.0, 1 - (sum(min(x, 2.0) for x in snaps) / len(snaps)) / (.35 * span / max(1, len(texts)) + .5)), 2)
    return {'bounds': [round(b, 3) for b in bounds], 'confidence': conf, 'snaps': snaps}


def spread(text: str, t0: float, t1: float) -> list[dict]:
    """Beat-local word times (0 = beat start is handled by the caller) across t0..t1, proportional to length, pause weight after punctuation."""
    words = re.findall(r'\S+', text)
    if not words:
        return []
    wt = [len(re.sub(r'\W', '', w)) + 2 + (3 if re.search(r'[.,;:?!]$', w) else 0) for w in words]
    t, tot = t0, float(sum(wt))
    out = []
    for w, x in zip(words, wt):
        d = (t1 - t0) * x / tot
        out.append({'w': w, 'start': round(t, 3), 'end': round(t + d - .03, 3)})
        t += d
    return out


def align(audio: Path, marked_texts: list[str], tail: float = .4) -> dict:
    """marked_texts: one string per beat (keeps *keyword* stars). -> {total, confidence, beats:[{start,end,duration,words}]} beat-local words."""
    dur = probe_duration(audio)
    sils = detect_silences(audio)
    sp = split_beats(marked_texts, sils, dur)
    b = sp['bounds']
    beats = []
    for i, text in enumerate(marked_texts):
        start = 0.0 if i == 0 else b[i]                  # beat 0 owns the leading silence, every beat starts where the previous speech ended
        end = dur if i == len(marked_texts) - 1 else b[i + 1]
        sp0, sp1 = (b[i] + .05 if i else b[0]), (b[i + 1] - .05 if i < len(marked_texts) - 1 else min(dur, b[-1] + .05))
        words = [{**w, 'start': round(w['start'] - start, 3), 'end': round(w['end'] - start, 3)} for w in spread(text, sp0, max(sp0 + .2, sp1))]
        beats.append({'start': round(start, 3), 'end': round(end, 3), 'duration': round(end - start, 3), 'words': words})
    total = beats[-1]['end']
    return {'total': round(total, 3), 'confidence': sp['confidence'], 'snaps': sp['snaps'], 'beats': beats}

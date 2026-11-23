#!/usr/bin/env python3
"""
Mouth-per-frame track: audio -> ONE mouth shape for EVERY video frame.

  python3 mouth_track.py narration.wav out/mouth_track.json --fps 30 [--lang en|other] [--dialog script.txt]
                         [--rhubarb /path/to/rhubarb] [--lead 1]

Engine 1 (preferred): Rhubarb Lip Sync (github.com/DanielSWolf/rhubarb-lip-sync, v1.13.0 Linux/Mac/Win zip, MIT).
  Found via --rhubarb, $VC_RHUBARB, scripts/bin/rhubarb, or PATH. `--lang other` (Hindi, Hinglish, anything not English)
  uses the language-agnostic phonetic recognizer; English with --dialog script.txt is the most accurate.
Engine 2 (fallback, no binary): audio-feature estimator (energy + spectral shape). It makes believable talking mouths
  but does NOT know phonemes. The JSON says which engine ran ("engine"): tell the user when it was the fallback.

Mouth set = Preston Blair / Rhubarb shapes. Your character needs ALL nine drawings:
  A  closed, lips pressed  (M B P)        F  small round pucker   (OO W)
  B  slightly open, teeth  (K S T EE)     G  upper teeth on lip   (F V)
  C  open, medium          (EH AE)        H  tongue up, open      (L)
  D  wide open             (AA)           X  idle / closed rest   (silence)
  E  rounded, medium       (AO ER)

Output: {"fps","frames":["X","X","C",...],"engine","lead","cues":[{start,end,value}], "shape_guide":{...}}
frames[i] is the mouth to show on video frame i. Post-processing: 1-frame blips removed (a mouth never flickers), and
the whole track is shifted `lead` frames EARLIER (default 1): real mouths start moving a hair before the sound.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile
import numpy as np

GUIDE = {"A": "closed, lips pressed (M B P)", "B": "slightly open, teeth (K S T EE)", "C": "open medium (EH AE)", "D": "wide open (AA)",
         "E": "rounded medium (AO ER)", "F": "small round pucker (OO W)", "G": "upper teeth on lower lip (F V)", "H": "tongue up, open (L)", "X": "idle closed rest"}


def find_rhubarb(explicit=None):
    here = os.path.dirname(os.path.abspath(__file__))
    for c in [explicit, os.environ.get("VC_RHUBARB"), os.path.join(here, "bin", "rhubarb"), shutil.which("rhubarb")]:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def run_rhubarb(rb, audio, lang, dialog):
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, "in.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", audio, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], check=True)
        out = os.path.join(td, "o.json")
        cmd = [rb, "-f", "json", "-q", wav, "-o", out]
        if lang != "en" or not dialog:
            cmd += ["--recognizer", "phonetic"]
        if dialog and lang == "en":
            cmd += ["--dialogFile", dialog]
        subprocess.run(cmd, check=True, capture_output=True)
        return json.load(open(out))["mouthCues"]


def fallback_cues(audio, fps):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", audio, "-ar", "16000", "-ac", "1", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    sr, hop = 16000, int(16000 / fps)
    n = len(x) // hop
    fr = x[:n * hop].reshape(n, hop)
    rms = np.sqrt((fr ** 2).mean(1))
    zcr = (np.diff(np.sign(fr), axis=1) != 0).mean(1)
    e = np.clip(rms / (np.percentile(rms, 95) + 1e-9), 0, 1)
    win = np.hanning(hop)
    spec = np.abs(np.fft.rfft(fr * win, axis=1))
    freqs = np.fft.rfftfreq(hop, 1 / sr)
    cent = (spec * freqs).sum(1) / (spec.sum(1) + 1e-9)
    voiced = e >= 0.07
    rank = np.zeros(n)
    if voiced.any():  # loudness RANK among voiced frames, so syllables open and close instead of sitting at one shape
        order = np.argsort(np.argsort(e[voiced]))
        rank[voiced] = order / max(1, voiced.sum() - 1)
    shape = []
    for i in range(n):
        if not voiced[i]:
            s = "X"
        elif zcr[i] > 0.30 or cent[i] > 2600:
            s = "B"                                   # fricative / sibilant
        elif rank[i] < 0.20:
            s = "A"                                   # trough between syllables = lips closing
        elif rank[i] < 0.45:
            s = "B"
        elif rank[i] < 0.78:
            s = "E" if cent[i] < 650 else "C"
        else:
            s = "E" if (cent[i] < 650 and rank[i] < 0.9) else "D"
        shape.append(s)
    cues, start = [], 0
    for i in range(1, n + 1):
        if i == n or shape[i] != shape[start]:
            cues.append({"start": round(start / fps, 3), "end": round(i / fps, 3), "value": shape[start]})
            start = i
    return cues


def to_frames(cues, fps, total_s, lead):
    n = int(round(total_s * fps))
    fr = ["X"] * n
    for c in cues:
        a, b = int(round(c["start"] * fps)), int(round(c["end"] * fps))
        for i in range(a, min(b, n)):
            fr[i] = c["value"]
    # a mouth never flickers: remove 1-frame runs by merging them into the previous shape
    for _ in range(2):
        i = 1
        while i < n - 1:
            if fr[i] != fr[i - 1] and fr[i] != fr[i + 1]:
                fr[i] = fr[i - 1]
            i += 1
    if lead > 0:
        fr = fr[lead:] + ["X"] * lead
    return fr


def build_track(audio, fps=30, lang='en', dialog=None, rhubarb=None, lead=1):
    """Library entry: returns the same dict the CLI writes. engine == 'fallback' means no phoneme knowledge."""
    total = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio],
                                 capture_output=True, text=True, check=True).stdout)
    rb = find_rhubarb(rhubarb)
    cues, engine = (run_rhubarb(rb, audio, lang, dialog), "rhubarb") if rb else (fallback_cues(audio, fps), "fallback")
    return {"fps": fps, "frames": to_frames(cues, fps, total, lead), "engine": engine, "lead": lead, "cues": cues, "shape_guide": GUIDE}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio"); ap.add_argument("out")
    ap.add_argument("--fps", type=int, default=30); ap.add_argument("--lang", default="en"); ap.add_argument("--dialog")
    ap.add_argument("--rhubarb"); ap.add_argument("--lead", type=int, default=1)
    a = ap.parse_args()
    total = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.audio], capture_output=True, text=True).stdout)
    rb = find_rhubarb(a.rhubarb)
    if rb:
        cues, engine = run_rhubarb(rb, a.audio, a.lang, a.dialog), "rhubarb"
    else:
        cues, engine = fallback_cues(a.audio, a.fps), "fallback"
        print("WARNING: Rhubarb not found; used the audio-feature fallback (no phoneme knowledge). Put the rhubarb binary in scripts/bin/.", file=sys.stderr)
    frames = to_frames(cues, a.fps, total, a.lead)
    json.dump({"fps": a.fps, "frames": frames, "engine": engine, "lead": a.lead, "cues": cues, "shape_guide": GUIDE}, open(a.out, "w"))
    used = {s: frames.count(s) for s in sorted(set(frames))}
    flips = sum(1 for i in range(1, len(frames)) if frames[i] != frames[i - 1])
    print(json.dumps({"engine": engine, "frames": len(frames), "shapes": used, "changes_per_s": round(flips / total, 1)}))


if __name__ == "__main__":
    main()

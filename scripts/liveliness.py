#!/usr/bin/env python3
"""Liveliness check: is anything moving on screen at every moment?
  python3 liveliness.py video.mp4 [--region icon|all] [--thr 0.35] [--max-still 0.4]
Per-frame mean absolute difference (0-255 scale, 144x256 gray). A frame is 'still' when diff < thr. Reports the share of still
frames, the longest still run in seconds and where it starts. Exit 1 if the longest still run > --max-still.
region=icon looks only at the central band where the icon lives (y 35%-72%), so a moving headline cannot hide a frozen picture.
"""
import argparse, json, subprocess, sys
import numpy as np

ap = argparse.ArgumentParser(); ap.add_argument('video'); ap.add_argument('--region', default='icon'); ap.add_argument('--thr', type=float, default=0.35)
ap.add_argument('--max-still', type=float, default=0.4); a = ap.parse_args()
W, H = 144, 256
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', a.video, '-vf', f'scale={W}:{H},format=gray', '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
fps = float(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', a.video], capture_output=True, text=True).stdout.split('/')[0].split('\n')[0] or 30)
if a.region == 'icon':
    fr = fr[:, int(H * .35):int(H * .72), :]
d = np.abs(np.diff(fr, axis=0)).mean((1, 2))
still = d < a.thr
runs, start = [], None
for i, s in enumerate(still):
    if s and start is None: start = i
    if (not s or i == len(still) - 1) and start is not None:
        end = i if not s else i + 1; runs.append((start / fps, (end - start) / fps)); start = None
longest = max(runs, key=lambda r: r[1]) if runs else (0, 0)
rep = {'region': a.region, 'fps': fps, 'still_share_pct': round(100 * still.mean(), 1), 'longest_still_s': round(longest[1], 2), 'at_s': round(longest[0], 2),
       'runs_over_limit': [(round(s, 1), round(l, 2)) for s, l in runs if l > a.max_still][:12], 'ok': longest[1] <= a.max_still}
print(json.dumps(rep, indent=1)); sys.exit(0 if rep['ok'] else 1)

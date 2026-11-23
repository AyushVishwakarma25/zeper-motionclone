#!/usr/bin/env python3
"""
Physics + continuity validator ("the brain"): catches floating props, teleporting objects, drifting backgrounds,
objects that grow and shrink, things clipping through each other, held items that let go, moonwalking.

Works on ANY renderer: dump the scene state for every frame to JSON and run

    python3 scene_check.py state.json [--report out/physics.json]       exit 0 = clean, 1 = violations

state.json  (world coordinates, y grows DOWN, x,y = BOTTOM-CENTRE of the object's box)
{
  "fps": 30, "frame_h": 1920,
  "shots": [{"start": 0, "end": 84}],                       # cuts reset motion checks
  "rules": {"max_step_frac": 0.06, "float_tol_px": 4},      # optional overrides
  "frames": [ {"f": 0, "objects": [ OBJ, ... ]}, ... ]
}
OBJ = { "id": "milk", "class": "character|prop|surface|background",
        "x": 540, "y": 880, "w": 80, "h": 160, "z": 3,
        "support": "desk",            # id of what it rests on ("floor" is a surface too)   -> required unless held/flying
        "held_by": "hero", "hand": "right", "grip": [dx, dy],   # grip offset from the object's bottom-centre
        "flying": false,              # true for birds, thrown things mid-air, anything allowed to be unsupported
        "fixed": false,               # true for furniture/backdrops: must NEVER move
        "solid": true,                # false = ghost/effect/shadow, ignored for clipping
        "facing": 1,                  # characters: +1 right, -1 left
        "hands": {"right": [x, y]},   # characters: world position of each hand
        "scale_ref": {"ref": "hero", "min": 0.10, "max": 0.30},   # h / ref.h must stay in range
        "overlap_ok": ["table"] }     # ids this object may overlap
Surfaces: class "surface" -> its top edge is y - h.
"""
import argparse, collections, json, sys

DEFAULT = dict(float_tol_px=4.0, max_step_frac=0.06, jitter_amp_px=1.5, jitter_flips=4, scale_step=0.04,
               fixed_tol_px=0.5, scale_total=0.08, clip_frac=0.25, held_tol_frac=0.05, held_tol_min=10.0, moonwalk_vx=1.0)


def spans(hits):
    """hits: list of (frame, id, rule, detail) -> merged spans per (id, rule)."""
    by = collections.defaultdict(list)
    for f, i, r, d in hits:
        by[(i, r)].append((f, d))
    out = []
    for (i, r), v in by.items():
        v.sort()
        a = b = v[0][0]; det = v[0][1]
        for f, d in v[1:] + [(None, None)]:
            if f is not None and f - b <= 2:
                b = f
            else:
                out.append({"rule": r, "object": i, "frames": [a, b], "detail": det})
                if f is not None:
                    a = b = f; det = d
    return sorted(out, key=lambda x: x["frames"][0])


def check(state):
    R = dict(DEFAULT); R.update(state.get("rules", {}))
    fh = state.get("frame_h", 1920)
    frames = state["frames"]
    shots = state.get("shots") or [{"start": 0, "end": len(frames)}]
    shot_of = {}
    for k, s in enumerate(shots):
        for f in range(s["start"], s["end"]):
            shot_of[f] = k
    starts = {s["start"] for s in shots}
    hits = []
    prev = {}
    hist = collections.defaultdict(list)
    fixed_ref = {}
    size_ref = {}
    for fr in frames:
        f = fr["f"]
        objs = {o["id"]: o for o in fr["objects"]}
        for o in objs.values():
            cls, oid = o.get("class", "prop"), o["id"]
            # R1 floating / unsupported
            if cls in ("prop", "character") and not o.get("flying") and not o.get("held_by"):
                sup = objs.get(o.get("support"))
                if not o.get("support"):
                    hits.append((f, oid, "unsupported", "no support, held_by or flying declared: what is it resting on?"))
                elif sup is None:
                    hits.append((f, oid, "unsupported", f"support '{o['support']}' does not exist"))
                else:
                    top = sup["y"] - sup["h"]
                    gap = top - o["y"]
                    tol = max(R["float_tol_px"], 0.02 * o["h"])
                    if abs(gap) > tol:
                        hits.append((f, oid, "floating" if gap > 0 else "sunk-into-support", f"bottom {o['y']:.0f} vs support top {top:.0f} ({gap:+.0f}px)"))
                    sl, sr = sup["x"] - sup["w"] / 2, sup["x"] + sup["w"] / 2
                    if not (sl <= o["x"] <= sr):
                        hits.append((f, oid, "off-edge", f"centre x {o['x']:.0f} is outside '{sup['id']}' [{sl:.0f},{sr:.0f}]: it would fall"))
            # R2 held items stay in the hand
            if o.get("held_by"):
                h = objs.get(o["held_by"])
                hand = (h or {}).get("hands", {}).get(o.get("hand", "right"))
                if not h or not hand:
                    hits.append((f, oid, "held-by-nobody", f"holder '{o['held_by']}' or its '{o.get('hand','right')}' hand missing"))
                else:
                    gx, gy = o["x"] + o.get("grip", [0, -o["h"] / 2])[0], o["y"] + o.get("grip", [0, -o["h"] / 2])[1]
                    dist = ((gx - hand[0]) ** 2 + (gy - hand[1]) ** 2) ** 0.5
                    if dist > max(R["held_tol_min"], R["held_tol_frac"] * h["h"]):
                        hits.append((f, oid, "held-object-detached", f"grip is {dist:.0f}px from the hand"))
            # R3 teleport / R4 scale drift, within a shot only
            p = prev.get(oid)
            if p is not None and f not in starts and shot_of.get(f) == shot_of.get(p["_f"]):
                step = ((o["x"] - p["x"]) ** 2 + (o["y"] - p["y"]) ** 2) ** 0.5
                if cls in ("prop", "character") and step > R["max_step_frac"] * fh:
                    hits.append((f, oid, "teleport", f"{step:.0f}px in one frame (limit {R['max_step_frac'] * fh:.0f})"))
                if not o.get("animates_scale") and cls != "background":
                    for k in ("w", "h"):
                        if p[k] > 0 and abs(o[k] - p[k]) / p[k] > R["scale_step"]:
                            hits.append((f, oid, "scale-drift", f"{k} changed {p[k]:.0f}->{o[k]:.0f} in one frame"))
                            break
                if cls == "character" and abs(o["x"] - p["x"]) > R["moonwalk_vx"] and o.get("facing") and (o["x"] - p["x"]) * o["facing"] < 0:
                    hits.append((f, oid, "moonwalk", "moving opposite to the way it faces"))
            if not o.get("animates_scale") and cls in ("prop", "character"):   # slow growth/shrink never trips the per-frame check
                r0 = size_ref.setdefault((oid, shot_of.get(f)), (o["w"], o["h"]))
                if r0[1] > 0 and abs(o["h"] - r0[1]) / r0[1] > R["scale_total"]:
                    hits.append((f, oid, "scale-drift", f"height {r0[1]:.0f} -> {o['h']:.0f} ({(o['h'] / r0[1] - 1) * 100:+.0f}%) since the start of the shot"))
            if o.get("scale_ref"):
                sr_ = o["scale_ref"]; ref = objs.get(sr_["ref"])
                if ref and ref["h"] > 0:
                    ratio = o["h"] / ref["h"]
                    if not (sr_["min"] <= ratio <= sr_["max"]):
                        hits.append((f, oid, "wrong-scale", f"{ratio:.2f} x {sr_['ref']} height (allowed {sr_['min']}-{sr_['max']})"))
            # R5 fixed things never move
            if o.get("fixed"):
                key = (oid, shot_of.get(f))
                ref0 = fixed_ref.setdefault(key, (o["x"], o["y"], o["w"], o["h"]))
                if max(abs(o["x"] - ref0[0]), abs(o["y"] - ref0[1])) > R["fixed_tol_px"] or abs(o["w"] - ref0[2]) > 0.5 or abs(o["h"] - ref0[3]) > 0.5:
                    hits.append((f, oid, "fixed-object-moved", f"moved {abs(o['x'] - ref0[0]):.1f},{abs(o['y'] - ref0[1]):.1f}px from its first position in this shot"))
            hist[oid].append((f, o["x"], o["y"], cls, f in starts))
        # R6 clipping between solid foreground objects
        solids = [o for o in objs.values() if o.get("class", "prop") in ("prop", "character") and o.get("solid", True)]
        for i in range(len(solids)):
            for j in range(i + 1, len(solids)):
                a, b = solids[i], solids[j]
                if a.get("support") == b["id"] or b.get("support") == a["id"] or a.get("held_by") == b["id"] or b.get("held_by") == a["id"]:
                    continue
                if b["id"] in a.get("overlap_ok", []) or a["id"] in b.get("overlap_ok", []):
                    continue
                ix = min(a["x"] + a["w"] / 2, b["x"] + b["w"] / 2) - max(a["x"] - a["w"] / 2, b["x"] - b["w"] / 2)
                iy = min(a["y"], b["y"]) - max(a["y"] - a["h"], b["y"] - b["h"])
                if ix > 0 and iy > 0 and ix * iy / min(a["w"] * a["h"], b["w"] * b["h"]) > R["clip_frac"]:
                    hits.append((f, a["id"] + "~" + b["id"], "clipping", f"{ix * iy / min(a['w'] * a['h'], b['w'] * b['h']) * 100:.0f}% of the smaller object overlaps"))
        prev = {k: dict(v, _f=f) for k, v in objs.items()}
    # R7 jitter: rapid direction flips of props
    for oid, h in hist.items():
        if h[0][3] != "prop":
            continue
        for k in range(len(h) - 8):
            seg = h[k:k + 9]
            if any(s[4] for s in seg[1:]):
                continue
            flips = 0
            for ax in (1, 2):
                v = [seg[t + 1][ax] - seg[t][ax] for t in range(8)]
                flips += sum(1 for t in range(7) if v[t] * v[t + 1] < 0 and abs(v[t]) > R["jitter_amp_px"] and abs(v[t + 1]) > R["jitter_amp_px"])
            if flips >= R["jitter_flips"]:
                hits.append((seg[4][0], oid, "jitter", f"{flips} direction flips in 8 frames"))
    return spans(hits)


def summarize(state):
    """For the pipeline: one dict, ready for issues.json. ok=False means send fix tickets to the owner."""
    v = check(state)
    return {"ok": not v, "counts": dict(collections.Counter(x["rule"] for x in v)), "violations": v}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("state"); ap.add_argument("--report")
    a = ap.parse_args()
    state = json.load(open(a.state))
    v = check(state)
    counts = collections.Counter(x["rule"] for x in v)
    rep = {"ok": not v, "frames": len(state["frames"]), "violations": v, "counts": dict(counts)}
    if a.report:
        json.dump(rep, open(a.report, "w"), indent=1)
    print(json.dumps({"ok": rep["ok"], "counts": rep["counts"], "examples": v[:8]}, indent=1))
    sys.exit(0 if rep["ok"] else 1)


if __name__ == "__main__":
    main()

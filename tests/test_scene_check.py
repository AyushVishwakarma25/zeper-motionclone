from app.scene_check import summarize


def frame(f, toast_y=880, toast_h=180, hero_x=300):
    return {"f": f, "objects": [
        {"id": "counter", "class": "surface", "x": 540, "y": 1100, "w": 900, "h": 220, "fixed": True},
        {"id": "hero", "class": "character", "x": hero_x, "y": 1500, "w": 260, "h": 1000, "support": "floor", "facing": 1,
         "hands": {"right": [420, 900]}},
        {"id": "floor", "class": "surface", "x": 540, "y": 1920, "w": 1080, "h": 420, "fixed": True},
        {"id": "toaster", "class": "prop", "x": 600, "y": toast_y, "w": 150, "h": toast_h, "support": "counter"},
    ]}


def state(frames):
    return {"fps": 30, "frame_h": 1920, "shots": [{"start": 0, "end": len(frames)}], "frames": frames}


def test_clean_scene_passes():
    assert summarize(state([frame(i) for i in range(30)]))["ok"]


def test_floating_prop_is_caught():
    r = summarize(state([frame(i, toast_y=840) for i in range(10)]))
    assert not r["ok"] and "floating" in r["counts"]


def test_slow_scale_drift_is_caught():
    r = summarize(state([frame(i, toast_h=180 + i) for i in range(40)]))
    assert "scale-drift" in r["counts"]


def test_teleport_is_caught():
    fr = [frame(i) for i in range(10)]
    for o in fr[5]["objects"]:
        if o["id"] == "toaster":
            o["x"] = 1000
    assert "teleport" in summarize(state(fr))["counts"]

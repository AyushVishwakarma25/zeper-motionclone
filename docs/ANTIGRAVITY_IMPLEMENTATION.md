# Antigravity IDE brief: ship the "genre" videos (science explainer, icon explainer) on the hosted site

Most of this is already written (the patch). Antigravity's job is to apply it, finish the UI, run the checks, and deploy.
Do NOT redesign the templates. Do NOT touch `scripts/`, `hyperframes/`, billing or auth.

## 0. Already in the patch (do not rewrite)
| Piece | Files |
|---|---|
| Remotion template `science_scene` + `icon_explainer` (wired in `Composition.jsx` `SceneSwitch`) | `remotion/src/science/*`, `remotion/src/explainer/*` |
| Catalog-only Directors (props can't be invented; missing ones come back as `need_prop` / `need_icon`) | `app/science_director.py`, `app/science_catalog.json`, `app/icon_director.py`, `app/icon_catalog.json` |
| Genre glue: topic -> `scene_plan.json`; uploaded voiceover -> alignment | `app/genre_pipeline.py`, `app/voice_align.py` |
| Liveliness gate (needs numpy, ffmpeg: already in the image) | `scripts/liveliness.py` |
| Pipeline hook (after Kokoro voiceover, before render) | `app/pipeline.py` (`genre_pipeline.retime_scenes`) |
| API routes | `POST .../genre-plan`, `POST .../voiceover-upload` in `app/dashboard_routes.py` |
| Layered-asset path (optional, needs image generation) | `app/asset_studio.py`, `app/director.py`, `app/layered_pipeline.py`, `app/scene_check.py`, `app/mouth_track.py` |

## 1. Apply
```
git checkout -b feat/genre-videos
git apply layered-pipeline.patch
python -m pytest tests/test_genre_pipeline.py tests/test_science_director.py tests/test_icon_director.py tests/test_asset_studio.py tests/test_scene_check.py tests/test_mouth_track.py tests/test_layered_pipeline.py -q   # 27+4 pass
cd remotion && node --test test/*.test.mjs                                                                   # 18 pass
```
`Dockerfile` needs no change (Node, ffmpeg, Chromium, Kokoro's espeak-ng are already there). Optional: add the Rhubarb binary
for phoneme-accurate mouths (`app/mouth_track.py`); without it the speaking mouth uses the built-in word-gated cycle.

## 2. The flow (backend done; you upload the voiceover, no TTS)
1. `POST /api/dashboard/create-project` -> `id` (existing).
2. `POST /api/dashboard/project/{id}/genre-plan` `{"genre":"science"|"icon","topic":"...","language":"english","seconds":40}`
   -> `{ok, scenes, need[], problems[]}`; writes `scene_plan.json` with one narration line per beat. If `ok` is false show `need` and stop.
   The UI shows the beat lines so the narrator records exactly that script, one sentence per beat, with a short pause between beats.
3. `POST /api/dashboard/project/{id}/voiceover-upload` (multipart `file`, mp3/wav/m4a) -> `{ok, confidence, total, warnings[]}`.
   Aligns the audio to the beats (ffmpeg silence detection + script), sets every scene's duration and word times, saves `voiceover.mp3`.
   `ok:false` or `confidence < 0.5` -> show `warnings` (narrator did not pause between beats / audio does not match script) and let the user re-upload.
4. `POST /api/dashboard/project/{id}/generate` with `use_existing_scene_plan: true`, `music_track`, `aspect:"9:16"`. TTS is skipped because the upload exists;
   existing code mixes music under the voice (-14 LUFS) and renders with Remotion.
5. Poll `/api/dashboard/project/{id}/status`, play `/media/{id}/output.mp4`.

## 3. What Antigravity must still build (UI only, `web/dashboard.html` + `web/dashboard.js`)
- **Style** selector (`Auto`, `Science explainer`, `Icon explainer`) beside the duration/voice controls.
- For Science/Icon: Generate runs step 2, shows the beat script, then a **Upload voiceover** drop zone (step 3) with the returned confidence/warnings, then step 4
  (reuse `callApi`, `showOverlay`, the poll loop near line 1353). Hide the Kokoro voice picker in this mode.
- If step 2 returns `need.length`, toast the missing props and do not continue. Do not add a second credit charge (step 4 already runs the gate).
- 2 UI checks: selector present; Science mode calls `genre-plan`, then `voiceover-upload`, then `generate` in that order.

## 3b. Other repo fixes included in the patch
- `app/dashboard_agent.py`: `SceneItem.template` now lists `science_scene` / `icon_explainer`, otherwise `/scenes/update` and the project-state save reject genre plans (400/422).
- `deploy-gcp.sh`, `deploy-gcp.ps1`: now match `cloudbuild.yaml` (4Gi, 2 CPU, min-instances 1, `--no-cpu-throttling`). Renders run as background tasks; with CPU throttling they can stall once the response is sent. `tests/test_phase10_item7.py` passes again.
- `remotion/src/components/Lively.jsx` + `LIVELY_TEMPLATES` in `Composition.jsx`: continuous motion (push-in, float, drifting particles, light sweep) for the old card templates. Measured on a 6-scene sample: still frames 63.6 % -> 36.4 %, longest still 2.2 s -> 1.6 s. Still above the 0.7 s target: the old cards need per-template motion (next piece below). `scene.lively=false` opts out.

## 4. Acceptance (all must pass before merge)
- `genre-plan` with a Gemini key returns `ok:true` for the topic "Action games and visual attention" and writes `scene_plan.json`.
- Upload a real narration: `confidence >= 0.5`, scene cuts land on the pauses (check by ear), no `TTS_FAILED` in `issues.json`, no `scene_*_raw.mp3` files created.
- Generated MP4: 1080x1920, 30 fps, has audio, about -14 LUFS, captions show <=3 words, the narrator's mouth moves only while words are spoken.
- Liveliness gate: `python scripts/liveliness.py output.mp4` -> longest still <= 0.7 s and still share <= 35 %.
- A topic needing an unknown prop returns `ok:false` with `need`, and no render starts.
- No new Python dependency (all new code uses pydantic, already installed).

## 5. Known limits (state them, don't hide them)
- Word times are spread by word length inside each beat's speech (not forced alignment). Beat cuts are accurate to the pauses; individual words can drift ~0.1-0.2 s. For exact sync add a forced aligner inside `voice_align.spread` (same return shape).
- Repo bug found and fixed: `remotion.render` re-ran TTS (and rewrote durations) whenever `voiceover.mp3` was missing; the upload now writes that file.
- Props are the catalog only (10 kinds). New concepts = add a component in `remotion/src/science/props*.jsx`, register it in `KINDS` and `science_catalog.json` (a test keeps them in sync).
- The stickman genre is not built.
- Verified here end to end through `pipeline.run_pipeline` (tone fallback voice because Kokoro isn't installed in the sandbox); first real Kokoro + Gemini run happens on your server.

# Layered asset pipeline (LAYERED_ASSET_SCENE)

Why: stills and props were generated one flattened picture at a time with no style lock, no object spec and no physics check, and
characters were hand-coded SVG with no mouths. This path builds every object from a written spec, in one locked style, as a
transparent PNG, then composites and validates it.

```
topic --director.plan_with_llm--> ShotPlan --lint_plan--> asset_studio.build_all --> compile_layered (per beat)
      --> node remotion/state-dump.mjs --> app/scene_check.py --> project.json (template: layered_asset_scene) --> render.mjs
```

| File | Job |
|---|---|
| `app/asset_studio.py` | StyleBible, ObjectSpec + lint (rejects "a box"), prompts, chroma key, fringe/palette checks, real-size scaling, blind name-it test, manifest |
| `app/director.py` | ShotPlan schema, Director prompt, `lint_plan` (12 words, anchors exist, no repeat pictures), `compile_layered` |
| `app/scene_check.py` | floating, teleport, scale drift, clipping, held items, moonwalk, fixed objects moving |
| `app/mouth_track.py` | audio -> one of A-H/X per frame (Rhubarb if installed, else a non-phoneme fallback; `engine` says which) |
| `remotion/src/layered.mjs` | pure layout: engine-grounded supports, hand-held objects, camera, parallax, mouth lookup |
| `remotion/src/components/LayeredScene.jsx` | compositor; missing assets render a red "MISSING ASSET" marker |
| `remotion/state-dump.mjs` | dumps the exact per-frame state the renderer uses, for the physics gate |
| `app/layered_pipeline.py` | `build_scenes`, `write_project`, CLI: `python -m app.layered_pipeline --topic ... --style style.json --out out/` |

Run: put 2-3 reference stills in the style JSON `reference_images`, then the CLI above. Exit 1 prints the failing stage (plan, assets, physics)
and the exact lines. Lip sync: build a track per scene audio with `mouth_track.build_track`, pass `mouth_tracks`/`mouth_dirs` to `build_scenes`.

Style JSON example: `{"summary":"2D flat cartoon, thick dark-brown outline, warm palette","outline":"4px #3a2418","shading":"flat","palette":["#3a2418","#e9b872","#c9783c","#f6e7c8"],"reference_images":["refs/1.png"]}`

Tests: `pytest tests/test_asset_studio.py tests/test_scene_check.py tests/test_mouth_track.py tests/test_layered_pipeline.py` and `cd remotion && npm test`.

---
# Icon-explainer genre (flat icon per beat, word-by-word headline)

The look of "First time in History, Everything is Crashing": one headline revealed word by word, one animated flat icon, an optional pill label,
a dark hook card. Built from a designed SVG icon kit, not generated images. Both genres coexist; the stickman path is unchanged.

```
python -m app.icon_pipeline plan  --topic "..." --out out/          # Director picks icons from the catalog; lint prints what to fix
python -m app.icon_pipeline build --out out/ --timing out/timing.json   # or --estimate for a silent preview
cd remotion && node render.mjs ../out/project.json ../out/video.mp4 --composition=Motion
```
| File | Job |
|---|---|
| `remotion/src/explainer/icons/*.jsx` | 15 catalog icons, each a pure function of time with an entrance AND a continuous loop |
| `remotion/src/explainer/icons/index.js` + `app/icon_catalog.json` | the catalog the Director may choose from (a test keeps them in sync) |
| `remotion/src/explainer/IconExplainer.jsx` | scene template: springy entrance, idle bob/breathe/sway, ambient sparkles, drifting backdrop, slow camera push, exit slide |
| `WordReveal.jsx`, `PillLabel.jsx`, `Ambient.jsx` | headline with spoken-word darkening and pop, pill, sparkles/backdrop |
| `app/icon_director.py`, `app/icon_pipeline.py` | schema + lint + compile; concepts with no icon are listed in `need_icon`, never faked |

Add an icon: write a component `({t, d, ...params})` returning a 400x400 SVG, register it in `icons/index.js` and `icon_catalog.json`, and run `icon-sheet`
(`remotion` Studio composition) to look at it. Every icon must keep moving after its entrance: check with `scripts/liveliness.py` (target: longest still run <= 0.7 s).

## Science-explainer genre (`science_scene`)

Flat vector characters + props on a dark teal stage, chunked keyword caption on top (<=3 words, `*keyword*` = orange pill, spoken word bright).
- Template: `remotion/src/science/ScienceScene.jsx` (layouts `single` / `split` / `row`, stage scaled from 720x1280, ambient bob, push-in).
- Parts: `Person` (front/back, 6 hair styles, glasses/headphones/controller, moods, blinking, breathing, **nine mouth shapes per frame**),
  props: monitor (shooter/tetris), lens, brain, clock, day boxes, funnel, university, bird/plane, emotes.
- Director: `app/science_director.py` + `app/science_catalog.json` (kind + variant only; unknown concept -> `need_prop`, never faked).
- CLI: `python -m app.science_director --topic "..." --out out/ [--timing words.json]` then `node remotion/render.mjs out/project.json out.mp4 --composition=Motion`.
- Preview sheets: compositions `person-sheet`, `prop-sheet`. Liveliness: `scripts/liveliness.py` (demo: longest still 0.4 s, 25.9 % still).

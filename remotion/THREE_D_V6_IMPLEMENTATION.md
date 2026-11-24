# V6 3D Character Story Engine

V6 is an opt-in 3D renderer. Existing 2D templates remain the default.

## Implemented modules on this branch
- `characterRig.mjs`: procedural articulated stickman and deterministic frame poses.
- `assetCatalog.mjs`: semantic procedural fallbacks.
- `sceneCompiler.mjs`: bounded JSON-to-render-contract compiler.
- `gltfAssetLoader.mjs`: local-only GLB manifest plus Three.js GLTFLoader and DRACO utilities. **The manifest is a loader contract, not a claim that binary model files have been supplied.** Licensed GLB binaries must be placed under `remotion/public/models`.
- `physicsBake.mjs`: Rapier offline simulation and immutable frame-indexed transform bake.
- `cinematicCamera.mjs`: named shot presets, frame-range shot cues and deterministic interpolation.
- `app/three_d_scene_planner.py`: Gemini structured-output scene planner using the existing configured Gemini/Vertex client. Emits validated JSON only.

## Remaining integration work (must be completed in Antigravity)
1. Connect Python planner output to the existing scene generation job and persist the plan as versioned JSON.
2. Add `@dimforge/rapier3d-compat` dependency and regenerate `remotion/package-lock.json` with `npm install`.
3. Add licensed GLB binaries and DRACO decoder assets locally. Record creator, source URL, license, attribution and modifications in `THIRD_PARTY.md`. Do not use remote model URLs at render time.
4. Integrate GLB loading into Remotion using `delayRender/continueRender`; the render must wait for every required model and decoder asset. Report missing assets and apply an explicit procedural fallback only when allowed.
5. Wire `normalizeCameraPlan` and `cameraPoseForFrame` into `ThreeDWorld`; apply camera position, target, FOV and roll for each frame.
6. Run Rapier once before frame rendering, bake transforms, serialize the bake with the scene, then apply only baked transforms during frame rendering. Never step a physics world inside a frame callback.
7. Add integration tests for planner output, GLB preload success/failure, physics bake determinism, camera shot boundaries and renderer cleanup.
8. Ensure the scene compiler accepts and validates camera/physics contracts and never evaluates model-generated code.

## Acceptance gates
- Python schema/planner tests pass with mocked Gemini responses.
- Node tests cover camera interpolation, physics bake validation, asset manifest errors and fallback.
- Existing 2D smoke render remains unchanged.
- 3D scene renders in headless Chromium with actual local GLBs and a Rapier bake.
- A 60-second MP4 passes ffprobe duration, codec, resolution, frame-rate and audio checks.
- Contact sheets are reviewed for missing assets, camera cuts, clipping, temporal continuity and character visibility.

Do not mark the engine production-ready until the 3D render and MP4 acceptance gates pass.

# V6 3D Character Story Engine

V6 builds on the opt-in V5 Three.js renderer. Existing 2D templates remain the default.

## New modules
- characterRig.mjs: procedural articulated stickman rig and deterministic frame-based poses.
- assetCatalog.mjs: semantic IDs for finance, office, technology, retail, transport and home props.
- sceneCompiler.mjs: validates semantic JSON and compiles a bounded render contract.
- characterRig.test.mjs: unit tests for animation, configuration, asset resolution and compilation.

## Integration contract
The renderer instantiates createStickmanRig(THREE, scene.character), adds rig.root to the Three.js scene, and calls applyStickmanPose(rig, characterPoseAtFrame(action, frame, fps)) for each Remotion frame. The integration change must preserve the legacy SVG path for all existing templates.

Gemini should emit semantic JSON only. Pass it through compileThreeDScene before rendering. Never execute model-generated JavaScript.

## Asset roadmap
The catalogue currently supplies procedural placeholders. High-quality GLB assets still need to be authored/curated and added as local packaged files with a manifest. Do not rely on remote model URLs at render time.

## Physics roadmap
Use frame-keyed transforms for simple interactions. Add Rapier only for scenes requiring collision or rigid-body simulation. Bake simulation into deterministic keyframes before Remotion rendering.

## Acceptance gates
1. npm ci succeeds with the committed lockfile.
2. Existing and V6 Node tests pass.
3. Existing 2D smoke render remains unchanged.
4. A 3D scene renders with WebGL in the deployment image.
5. Character visibly performs walk, point, hold and explain.
6. A complete 60-second MP4 passes ffprobe checks for duration, codec, resolution and audio.
7. Contact-sheet review shows no blank frames, missing assets or clipping.

# MotionClone V6: 3D Character Storytelling Engine

The **V6 3D Character Storytelling Engine** is a deterministic, cinematic 3D explainer system built into MotionClone. It transforms narrative topics and scripts into high-quality vertical explainer videos featuring 3D stickman characters, realistic local 3D props, multi-shot camera choreography, and offline Rapier physics simulations.

---

## Architecture Overview

```
                                      +-----------------------------------------+
                                      |     Gemini Structured Scene Planner     |
                                      |       (app/three_d_scene_planner.py)    |
                                      +--------------------+--------------------+
                                                           |
                                                           v
                                      +--------------------+--------------------+
                                      |     Offline Rapier 3D Physics Bake      |
                                      |       (remotion/src/three/physicsBake)  |
                                      +--------------------+--------------------+
                                                           |
                                                           v
                                      +--------------------+--------------------+
                                      |        Remotion Composition Engine       |
                                      |     (remotion/src/three/ThreeDWorld)    |
                                      +--------------------+--------------------+
                                                           |
             +--------------------+------------------------+------------------------+
             |                                             |                        |
             v                                             v                        v
+---------------------------+                +---------------------------+   +---------------------------+
|    Local GLB Assets       |                |   Stickman Character Rig  |   |     Cinematic Camera      |
| remotion/public/models/*  |                |     characterRig.mjs      |   |    cinematicCamera.mjs    |
+---------------------------+                +---------------------------+   +---------------------------+
```

1. **Scene Planner (`app/three_d_scene_planner.py`)**: Uses Google Gemini to generate validated 3D scene descriptions with strict Pydantic models. It outputs data only—never arbitrary code.
2. **Physics Baker (`remotion/src/three/physicsBake.mjs`)**: Steps physics simulations offline before rendering using `@dimforge/rapier3d-compat`. Transforms are baked into a frame-indexed lookup table (`transforms[frame][body_id]`). No live physics simulation runs during Remotion's frame render callback.
3. **Renderer (`remotion/src/three/ThreeDWorld.jsx`)**: Instantiates Three.js WebGL scenes in headless Chromium, loading local binary `.glb` assets asynchronously with Remotion's `delayRender` and `continueRender` barriers.
4. **Cinematic Camera (`remotion/src/three/cinematicCamera.mjs`)**: Computes smooth camera paths across 16 cinematic shot presets (`establishing`, `wide`, `medium`, `close_up`, `extreme_close_up`, `over_shoulder`, `low_angle`, `top_down`, `orbit`, `tracking`, `dolly_in`, `dolly_out`, `pan_left`, `pan_right`, `crane_down`, `hold`) with easing curves and target tracking.

---

## Local GLB Asset Library

All 3D models are bundled locally under `remotion/public/models/`. There is **strictly zero external network dependency** at render time.

### Available Categories & Models

| Category | Semantic Asset ID | Local Path | Description |
|---|---|---|---|
| **Finance** | `credit_card` | `/models/finance/credit-card.glb` | ISO card with EMV chip & magstripe |
| | `cash_stack` / `cash_bundle` | `/models/finance/cash-bundle.glb` | Currency strap bank stack |
| | `coin` / `coin_stack` | `/models/finance/coin-stack.glb` | Tiered metallic coin tokens |
| | `banknote` | `/models/finance/banknote.glb` | Single currency paper note |
| | `wallet` | `/models/finance/wallet.glb` | Bi-fold leather wallet |
| | `bank_counter` | `/models/finance/bank-counter.glb` | Polished teller counter |
| **Technology** | `smartphone` | `/models/technology/smartphone.glb` | Glass-faced beveled smartphone |
| | `laptop` | `/models/technology/laptop.glb` | Open notebook workstation |
| | `monitor` | `/models/technology/monitor.glb` | Widescreen desktop display |
| **Office** | `desk` / `office_desk` | `/models/office/desk.glb` | Executive workstation desk |
| | `chair` / `office_chair` | `/models/office/chair.glb` | Ergonomic caster chair |
| | `document` | `/models/office/document.glb` | Formatted billing invoice |
| **Transport** | `car` | `/models/transport/car.glb` | Compact passenger vehicle |
| **Home** | `house` | `/models/home/house.glb` | Residential gable dwelling |
| | `building` | `/models/home/building.glb` | Commercial high-rise structure |
| **Retail** | `shopping_cart` | `/models/retail/shopping-cart.glb` | Wireframe retail trolley |
| | `package` | `/models/retail/package.glb` | Corrugated shipping carton |

*All assets are CC0 (Public Domain Dedication) compliant and documented in `THIRD_PARTY.md`.*

---

## Character Rig & Interactions

The 3D character is a procedural stickman rig (`characterRig.mjs`) with expressive facial features and articulated limbs:

- **Actions (`CHARACTER_ACTIONS`)**: `idle`, `walk`, `run`, `sit`, `stand`, `point`, `hold`, `think`, `celebrate`, `fall`, `explain`.
- **Expressions (`CHARACTER_EXPRESSIONS`)**: `neutral`, `happy`, `sad`, `stressed`, `surprised`, `confused`.
- **Prop Holding**: Props can specify `held_by: "character"` or `attached_to: "hand"`. The object dynamically follows the character's hand bone during animations.

---

## Offline Rapier Physics Baking

To guarantee determinism in Remotion renders, physics simulations are stepped offline ahead of rendering:

```javascript
import {bakePhysicsScene, physicsTransformAtFrame} from './three/physicsBake.mjs';

// 1. Bake physics offline (deterministic timestep 1/fps)
const bake = await bakePhysicsScene({
  bodies: [
    {id: 'coins', position: [0.3, 3.5, -0.9], half_extents: [0.2, 0.1, 0.2], restitution: 0.3},
    {id: 'desk_surface', type: 'fixed', position: [0, 0.9, -1], half_extents: [1.2, 0.1, 0.6]}
  ]
}, {fps: 30, durationInFrames: 360});

// 2. Synchronous O(1) transform lookup during frame rendering
const transform = physicsTransformAtFrame(bake, 'coins', frame);
mesh.position.set(...transform.position);
mesh.quaternion.set(...transform.rotation);
```

---

## Generating & Rendering 3D Scenes

### 1. Scene Specification Format

A 3D scene is activated by specifying `render_mode: "3d"` or `template: "three_d_story"`:

```json
{
  "id": "scene_debt_trap",
  "template": "three_d_story",
  "render_mode": "3d",
  "duration_seconds": 12.0,
  "headline": "THE 24% APR TRAP",
  "on_screen_text": "Average Card Debt: $7,951",
  "visual_metaphor": "Financial Quicksand",
  "three_d": {
    "environment": "office",
    "background": "#0f172a",
    "ground": "#334155",
    "character": {
      "enabled": true,
      "action": "think",
      "expression": "stressed",
      "position": [0, 0, 0],
      "accent": "#38bdf8"
    },
    "camera_shots": [
      {"start_frame": 0, "end_frame": 120, "from_shot": "establishing", "to_shot": "wide", "focus": [0, 1.2, -0.5]},
      {"start_frame": 120, "end_frame": 360, "from_shot": "wide", "to_shot": "close_up", "focus": [-0.5, 1.2, -0.9]}
    ],
    "objects": [
      {"id": "desk", "asset": "desk", "position": [0, 0, -1]},
      {"id": "card", "asset": "credit_card", "position": [-0.5, 1.05, -0.85], "motion": "float"},
      {"id": "cash", "asset": "cash_stack", "position": [0.55, 0.95, -0.9]}
    ]
  }
}
```

### 2. Python Scene Planner

```python
from app.three_d_scene_planner import plan_three_d_scene, export_scene_plan

# Ask Gemini to generate validated 3D scene plan
plan = plan_three_d_scene(
    topic="How credit card debt traps people in the United States",
    narration="Credit card debt keeps multiplying due to high APR and minimum payments.",
    duration_seconds=60.0
)
data = export_scene_plan(plan)
```

### 3. Running Production Renders

To run the complete 60-second production fixture render with strict validation:

```bash
python scripts/render_v6_production_fixture.py
```

The fixture validates:
- Video stream: `1080x1920` (9:16 vertical), `30 FPS`, `H.264` codec.
- Audio stream: `AAC`, 48kHz, stereo, duration matching video duration.
- Liveliness analysis across extracted frames to ensure non-static rendering.

# MotionClone V5 Architecture & 3D Storytelling Engine

## Overview

MotionClone V5 introduces a deterministic 3D storytelling engine powered by Three.js inside Remotion. It bridges the gap between 2D vector explainers and spatial 3D narrative cinema, providing rich procedural environments, an articulated 3D stickman character, reusable 3D props, dynamic camera choreography, and soft contact shadows.

---

## Key Components

### 1. 3D Stickman Character (`remotion/src/three/stickman3d.mjs`)
- Full procedural joint hierarchy: Pelvis root, torso, neck, head, visor eyes, bilateral shoulders, upper arms, elbows, forearms, hands with prop socket, hips, thighs, knees, shins, and feet.
- 10 Expressive Poses:
  - `idle`: Breathing cycle with natural chest expansion and micro arm sway.
  - `walking`: 1.8 Hz rhythmic stride with knee flexion and counter-phase arm swings.
  - `running`: 2.8 Hz athletic sprint with forward torso tilt and pumped elbows.
  - `pointing`: Directed arm extension towards on-screen target with head gaze tracking.
  - `holding_object`: Both arms bent forward at 90°, hands gripping active 3D props.
  - `turning`: Smooth yaw turnaround over scene progress.
  - `celebrating`: Victory "V" arm posture with joyful vertical hopping.
  - `stress_panic`: Hands clutching head/temples, jittery posture, head shaking.
  - `confused`: One hand scratching head, head tilted sideways (15° roll).
  - `sitting_desk`: Pelvis lowered, thighs horizontal, knees bent 90°, arms resting or typing on desk.
- Option to toggle between 3D mesh character and existing 2D vector character via `character_mode: "3d" | "2d"`.

### 2. Reusable 3D Props (`remotion/src/three/props3d.mjs`)
- `money_stack`: Banded stacks of green banknotes and gold coins.
- `coin`: Thick golden coin cylinder with star relief and rim.
- `invoice`: 3D paper document card with colored header bar, text lines, and status stamp.
- `laptop`: Base with keyboard recess and open angled lid with emissive screen.
- `phone`: Modern smartphone slab with curved corners, bezel, and emissive screen.
- `box`: Delivery parcel box with tape ribbon.
- `chart_3d`: 3D bar chart with rising colored columns and ground pedestal.
- `trophy`: Golden victory trophy cup with pedestal base and handles.
- `shield`: Glossy security shield.

### 3. Environment Presets (`remotion/src/three/environments3d.mjs`)
- `studio`: Infinite cyclorama with sleek pedestal and soft rim lighting.
- `office`: Parquet ground, wooden slat acoustic back-wall, executive desk, desk legs, and potted indoor plant.
- `street`: Asphalt road with yellow dashed center lines, concrete curbs, and street lamps.
- `forest`: Rolling grass ground, low-poly pine trees with multi-tiered geometric foliage crowns.
- `tech`: Dark reflective floor grid with glowing cyan lines and floating data pillars.
- `room`: Modern interior with parquet floor, walls, framed modern geometric poster, and ambient lighting.

### 4. Camera Choreography (`remotion/src/three/scene3d.mjs`)
- `push_in`: Cinematic push-in towards character / active prop.
- `pull_back`: Reveal shot pulling backward.
- `pan_left` / `pan_right`: Horizontal tracking pan.
- `orbit`: Smooth arc orbit around the subject.
- `crane_down`: High-angle descent to eye level.
- `dutch_tilt`: Dramatic roll angle for tension or drama.
- `hold`: Continuous floating drift ensuring zero dead or still frames.

### 5. WebGL Headless & Fallback Guarantee (`remotion/src/three/ThreeDFallbackView.jsx`)
- In headless Chromium environments (e.g. CI runners or Cloud Run), Remotion runs via ANGLE SwiftShader (`gl: 'swangle'`).
- If WebGL cannot be initialized, the system automatically renders `ThreeDFallbackView` (isometric SVG + CSS 3D projection) with 0 dropped frames and 0% still share.

### 6. AI Pipeline Integration (`app/director_3d.py`, `app/dashboard_agent.py`)
- Gemini Explainer Scene Plan generator natively supports `template: "three_d_story"`, `render_mode: "3d"`, `character_mode: "3d"`, and `three_d` scene descriptions.
- `director_3d.py` validates and normalizes all 3D scene requests.

---

## Verification & Smoke Test

A sample 3D story MP4 is generated and validated via:
```bash
python scripts/smoke_render_3d.py
```
- Output: `out/sample_3d_story.mp4` (1080x1920 @ 30 FPS, H.264, AAC audio).
- Liveliness check: 0.0% still share, 0s longest still run, `ok: true`.

# MotionClone V5: 3D Storytelling Engine Specification

The 3D Storytelling Engine (V5) introduces real-time, deterministic 3D procedural scenes rendered inside Remotion via Three.js. It operates alongside existing 2D templates with complete backward compatibility.

---

## 1. Scene Structure & JSON Schema

A 3D story scene is enabled by setting `template: "three_d_story"` or `render_mode: "3d"`.

```json
{
  "template": "three_d_story",
  "render_mode": "3d",
  "character_mode": "3d",
  "headline": "Where Did The Cash Go?",
  "on_screen_text": "60 Days Payment Lag",
  "visual_metaphor": "Trapped Working Capital",
  "environment": "office",
  "character_pose": "sitting_desk",
  "prop_type": "invoice",
  "camera_motion": "push_in",
  "duration_seconds": 6.0,
  "accent": "#00f2fe",
  "bg": "#0f172a",
  "three_d": {
    "environment": "office",
    "camera": {
      "move": "push_in",
      "intensity": 0.7
    },
    "character": {
      "enabled": true,
      "mode": "3d",
      "pose": "sitting_desk",
      "shirtColor": "#00f2fe"
    },
    "prop": {
      "type": "invoice",
      "motion": "float"
    }
  }
}
```

---

## 2. Supported Attributes

### Environments (`environment`)
- **`studio`**: Infinite cyclorama floor with sleek circular pedestal and ambient rim lighting.
- **`office`**: Parquet/tile ground, wooden slat acoustic back-wall, executive desk, desk legs, and potted indoor plant.
- **`street`**: Double-lane asphalt road with dashed lane markings, sidewalk curb, and street lamp posts.
- **`forest`**: Stylized rolling terrain with low-poly pine trees, multi-tiered foliage cones, and trunks.
- **`tech`**: Dark reflective floor grid with glowing neon accent lines and floating semi-transparent data pillars.
- **`room`**: Modern interior with parquet floor, side and back walls, modern framed geometric wall art, and ambient lighting.

### 3D Stickman Character (`character_pose`)
The procedural 3D stickman character features full joint articulation (pelvis, torso, neck, head, visor eyes, shoulders, upper arms, elbows, forearms, hands, hips, thighs, knees, shins, and feet):
- **`idle`**: Natural breathing, torso micro-expansion, head glance, relaxed arm sway.
- **`walking`**: Natural 1.8 Hz walking stride, leg swing, counter-phase arm pumps, vertical bounce.
- **`running`**: 2.8 Hz athletic stride, forward torso lean (20°), bent elbows pumping aggressively.
- **`pointing`**: Extended arm towards the target/stat, head angled towards gaze direction, opposite arm relaxed.
- **`holding_object`**: Both arms brought forward, elbows bent at 90°, hands gripping or socketing the active 3D prop.
- **`turning`**: Smooth deterministic yaw rotation across the scene duration.
- **`celebrating`**: Both arms raised high in a victory "V", hands waving, head tilted upward, joyful vertical hopping.
- **`stress_panic`**: Both hands gripping temples/head, jittery posture, head shaking.
- **`confused`**: One hand scratching head, head tilted to the side (15° roll), puzzled stance.
- **`sitting_desk`**: Pelvis lowered to seat level, horizontal thighs, knees bent 90°, arms resting or typing on desk.

### Character Rendering Mode (`character_mode`)
- **`3d` (Default)**: Full Three.js mesh character with real-time lighting, specular highlights, and contact shadows.
- **`2d`**: Existing vector SVG stickman layered in the foreground over the 3D world, preserving legacy 2D appearance when desired.

### Reusable 3D Props (`prop_type`)
- **`money_stack`**: Banded stacks of banknotes with gold coins.
- **`coin`**: Golden coin cylinder with star relief and rim.
- **`invoice`**: 3D paper document card with colored header bar, body text lines, and status badge ("DUE" / "PAID").
- **`laptop`**: Sleek laptop base with keyboard recess and open angled display with emissive screen.
- **`phone`**: Modern smartphone slab with curved corners, bezel, and emissive display.
- **`box`**: Cardboard parcel with tape strips and shipping label.
- **`chart_3d`**: 3D animated bar chart with rising colored columns and pedestal.
- **`trophy`**: Shiny gold trophy cup with pedestal base and handles.
- **`shield`**: Glossy security emblem shield.

### Camera Choreography (`camera_motion` / `camera.move`)
- **`push_in`**: Smooth cinematic push-in towards the subject.
- **`pull_back`**: Reveal shot pulling backward.
- **`pan_left` / `pan_right`**: Horizontal tracking pan.
- **`orbit`**: Smooth arc orbit around the subject.
- **`crane_down`**: Descending camera crane from high angle to eye level.
- **`dutch_tilt`**: Dynamic Dutch roll angle for tension or drama.
- **`hold`**: Subtle continuous floating drift guaranteeing no frozen frames.

---

## 3. WebGL Headless & Fallback Guarantee

1. **Headless Chromium**: Configured with ANGLE SwiftShader (`gl: 'swangle'`), enabling hardware-free software rasterization on headless containers, CI runners, and Cloud Run.
2. **Synchronous Fallback**: If WebGL cannot be initialized, the system automatically falls back to `ThreeDFallbackView` (isometric SVG + CSS 3D projection) with 0 dropped frames, 0% still share, and full visual continuity.

---

## 4. Verification & Smoke Test

To execute the 3D storytelling engine smoke test:
```bash
python scripts/smoke_render_3d.py
```
Output artifact: `out/sample_3d_story.mp4` (1080x1920 @ 30 FPS, H.264, AAC audio).

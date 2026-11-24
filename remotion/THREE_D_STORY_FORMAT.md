# MotionClone 3D Story Scene Format (V5)

The 3D renderer is opt-in. Existing projects continue using the current Remotion/SVG templates unless a scene explicitly sets `render_mode: "3d"` or `template: "three_d_story"`.

## Scene example

```json
{
  "template": "three_d_story",
  "render_mode": "3d",
  "headline": "The bill arrives before payday",
  "character_pose": "stress_panic",
  "character_expression": "stressed",
  "three_d": {
    "environment": "office",
    "background": "#b9c7d8",
    "ground": "#d9d4ca",
    "camera": {"move": "push_in", "intensity": 0.7},
    "objects": [
      {
        "id": "desk",
        "type": "box",
        "position": [0, 0.55, -1],
        "size": [5.2, 1.1, 1.6],
        "color": "#8b674d"
      },
      {
        "id": "invoice",
        "type": "box",
        "position": [0.5, 1.18, -0.8],
        "size": [0.9, 0.04, 1.1],
        "color": "#fffaf0",
        "motion": "float"
      }
    ]
  }
}
```

## Supported fields

- `environment`: `studio`, `office`, `room`, `street`, `forest`.
- `objects[].type`: `box`, `sphere`, `cylinder`, `cone`, `torus`.
- `objects[].position`, `size`, and `rotation`: three-number arrays in world units.
- `objects[].motion`: `none`, `float`, `rotate`, or `pulse`.
- `camera.move`: `hold`, `push_in`, `pull_back`, `pan_left`, `pan_right`, or `orbit`.

The existing SVG stickman remains a 2D foreground layer over the 3D environment. The existing voice, music, caption, transition, and MP4 rendering stages are unchanged.

## Rendering notes

The renderer uses Three.js WebGL with deterministic frame-to-transform mapping. Remotion's headless Chromium must provide WebGL (the current render command configures SwiftShader). A runtime smoke render is still required on the deployment image before enabling this mode for production jobs.

// Pure layout for LAYERED_ASSET_SCENE. No React, no randomness: frame -> world state -> screen state.
// World coordinates are output pixels of the set plate; y grows down; x,y of an object = bottom-centre of its box.
//
// scene.layered = {
//   world:   {w, h},                                  // plate size, usually the output size
//   surfaces:[{id, x, y, w, h, fixed:true}],          // floor and furniture tops; top edge = y - h
//   objects: [{id, asset, class, w, h, support|held_by|flying, x:[keys]|number, y:[keys]|number,
//              rot:[keys], scale:[keys], attach:[{from,to,held_by,hand,grip:[dx,dy]}], hands:{right:[{f,x,y}]}, z}],
//   camera:  [{f, cx, cy, zoom, ease}],
//   plates:  {far, mid, near}, parallax: {far:0.85, mid:1, near:1.15}
// }
// Objects with a `support` and no y-keys are GROUNDED BY THE ENGINE: y is the support's top edge, so they cannot float.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const EASE = {
  linear: p => p,
  inOut: p => (p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2),
  out: p => 1 - (1 - p) ** 3,
  spring: p => (p >= 1 ? 1 : 1 - Math.cos(p * 3.5 * Math.PI) * Math.exp(-6 * p)),
};

export function sample(track, f, fallback = 0) {
  if (track === undefined || track === null) return fallback;
  if (typeof track === 'number') return track;
  if (!track.length) return fallback;
  if (f <= track[0].f) return track[0].v;
  const last = track[track.length - 1];
  if (f >= last.f) return last.v;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    if (f > b.f) continue;
    const p = (f - a.f) / Math.max(1, b.f - a.f);
    return a.v + (b.v - a.v) * (EASE[b.ease || a.ease || 'inOut'] || EASE.inOut)(p);
  }
  return last.v;
}

const asTrack = (keys, key) => (Array.isArray(keys) ? keys.map(k => ({f: k.f, v: k[key], ease: k.ease})) : keys);

export function cameraAt(camera, f, world) {
  const keys = camera && camera.length ? camera : [{f: 0, cx: world.w / 2, cy: world.h / 2, zoom: 1}];
  return {
    cx: sample(asTrack(keys, 'cx'), f), cy: sample(asTrack(keys, 'cy'), f),
    zoom: clamp(sample(asTrack(keys, 'zoom'), f, 1), .5, 2.5),
  };
}

export function surfaceTop(surface) { return surface.y - surface.h; }

function handAt(holder, hand, f) {
  const t = holder.hands && holder.hands[hand];
  if (!t || !t.length) return null;
  if (typeof t[0] === 'number') return t;   // already resolved to [x, y] for this frame
  return [sample(asTrack(t, 'x'), f), sample(asTrack(t, 'y'), f)];
}

/** World state of every object at frame f (the format scripts/scene_check.py reads). */
export function worldState(layered, f) {
  const byId = {}, out = [];
  const surfaces = (layered.surfaces || []).map(s => ({...s, class: 'surface', fixed: s.fixed !== false}));
  surfaces.forEach(s => { byId[s.id] = s; });
  const objs = layered.objects || [];
  // characters and free-moving things first, so hands exist when held objects are resolved
  const order = [...objs].sort((a, b) => (a.held_by || a.attach ? 1 : 0) - (b.held_by || b.attach ? 1 : 0));
  for (const o of order) {
    const seg = (o.attach || []).find(s => f >= s.from && f < s.to);
    const holderId = seg ? seg.held_by : o.held_by;
    let x = sample(o.x, f, 0), y;
    const scale = sample(asTrack(o.scale, 'v') || o.scale, f, 1);
    const w = o.w * scale, h = o.h * scale;
    let supportId = seg ? '' : (o.support || '');
    let grip, hand, held = '';
    if (holderId && byId[holderId]) {
      const holder = byId[holderId];
      const hp = handAt(holder, seg ? seg.hand : (o.hand || 'right'), f);
      grip = (seg && seg.grip) || o.grip || [0, -h / 2];
      if (hp) { x = hp[0] - grip[0]; y = hp[1] - grip[1]; held = holderId; hand = seg ? seg.hand : (o.hand || 'right'); }
    }
    if (y === undefined) {
      const sup = byId[supportId];
      y = o.y !== undefined && !(sup && o.y === 'auto') ? sample(o.y, f, 0) : sup ? surfaceTop(sup) : 0;
      if (sup && (o.y === undefined || o.y === 'auto')) y = surfaceTop(sup);
    }
    const st = {
      id: o.id, class: o.class || 'prop', x, y, w, h, z: o.z ?? 5, solid: o.solid !== false,
      fixed: !!o.fixed, flying: !!o.flying, facing: o.facing, rot: sample(o.rot, f, 0),
    };
    if (supportId) st.support = supportId;
    if (held) { st.held_by = held; st.hand = hand; st.grip = grip; }
    if (o.hands) { st.hands = {}; for (const k of Object.keys(o.hands)) st.hands[k] = handAt(o, k, f); }
    if (o.scale_ref) st.scale_ref = o.scale_ref;
    if (o.overlap_ok) st.overlap_ok = o.overlap_ok;
    if (o.asset) st.asset = o.asset;
    byId[o.id] = st; out.push(st);
  }
  return [...surfaces, ...out];
}

/** Screen placement of a world box. Parallax: only far/near plates differ; objects and mid plate share factor 1. */
export function toScreen(box, cam, view, factor = 1) {
  const sx = (box.x - cam.cx * factor - (view.w / 2) * (1 - factor)) * cam.zoom + view.w / 2;
  const sy = (box.y - cam.cy) * cam.zoom + view.h / 2;
  return {x: sx, y: sy, w: box.w * cam.zoom, h: box.h * cam.zoom};
}

export function plateTransform(cam, view, world, factor = 1) {
  const tx = (-(cam.cx - world.w / 2) * factor) * cam.zoom + view.w / 2 - (world.w / 2) * cam.zoom;
  const ty = (-(cam.cy - world.h / 2)) * cam.zoom + view.h / 2 - (world.h / 2) * cam.zoom;
  return {x: tx, y: ty, scale: cam.zoom};
}

/** Dump state for every frame so app/scene_check.py can prove the scene is physically sane. */
export function dumpState(layered, totalFrames, shots, frameH = 1920, fps = 30) {
  const frames = [];
  for (let f = 0; f < totalFrames; f++) frames.push({f, objects: worldState(layered, f)});
  return {fps, frame_h: frameH, shots: shots || [{start: 0, end: totalFrames}], frames};
}

/** One of A-H/X for frame f from a mouth track ({frames:[...]}), clamped, defaulting to the closed rest shape. */
export function mouthAt(track, f) {
  const fr = track && track.frames;
  if (!fr || !fr.length) return 'X';
  return fr[clamp(f, 0, fr.length - 1)] || 'X';
}

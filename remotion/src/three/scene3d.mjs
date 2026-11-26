/**
 * scene3d.mjs
 * Pure helpers and normalizers for MotionClone's deterministic 3D scene format (V5).
 * Free of browser / WebGL APIs so all scene planning and mathematics
 * can be tested in Node.js unit tests.
 */

export const STICKMAN_POSES = [
  'idle',
  'walking',
  'running',
  'pointing',
  'holding_object',
  'turning',
  'celebrating',
  'stress_panic',
  'confused',
  'sitting_desk'
];

export const REUSABLE_PROP_TYPES = [
  'money_stack',
  'coin',
  'invoice',
  'laptop',
  'phone',
  'box',
  'chart_3d',
  'trophy',
  'shield'
];

export const THREE_D_ENVIRONMENTS = [
  'studio',
  'office',
  'room',
  'street',
  'forest',
  'tech'
];

export const THREE_D_PRIMITIVE_TYPES = new Set(['box', 'sphere', 'cylinder', 'cone', 'torus']);
export const THREE_D_OBJECT_TYPES = new Set([
  ...THREE_D_PRIMITIVE_TYPES,
  ...REUSABLE_PROP_TYPES
]);

export const CAMERA_MOVES = [
  'hold',
  'push_in',
  'pull_back',
  'pan_left',
  'pan_right',
  'orbit',
  'crane_down',
  'dutch_tilt'
];

const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const vector = (value, fallback) =>
  Array.isArray(value) && value.length === 3
    ? value.map((part, index) => finite(part, fallback[index]))
    : [...fallback];

/**
 * Normalizes input scene and extracts safe, fully bounded 3D configuration.
 */
export function normalizeThreeDScene(input = {}) {
  const source = input.three_d && typeof input.three_d === 'object' ? input.three_d : input;

  // Environment
  const rawEnv = source.environment || input.art_direction || input.environment || 'studio';
  const environment = THREE_D_ENVIRONMENTS.includes(rawEnv) ? rawEnv : 'studio';

  // Palette & Background
  const background = /^#[0-9a-f]{6}$/i.test(source.background || input.bg || '')
    ? (source.background || input.bg)
    : environment === 'tech'
      ? '#020617'
      : environment === 'office'
        ? '#b0bec5'
        : environment === 'forest'
          ? '#94a3b8'
          : '#b9c7d8';

  const ground = /^#[0-9a-f]{6}$/i.test(source.ground || '')
    ? source.ground
    : environment === 'tech'
      ? '#0f172a'
      : environment === 'office'
        ? '#cbd5e1'
        : environment === 'forest'
          ? '#3f6212'
          : '#d9d4ca';

  // Camera choreography
  const rawMove = source.camera?.move || input.camera_motion || 'hold';
  const move = CAMERA_MOVES.includes(rawMove) ? rawMove : 'hold';
  const camera = {
    move,
    intensity: Math.max(0, Math.min(1, finite(source.camera?.intensity, 0.6)))
  };

  // Character 3D Configuration
  const rawPose = source.character?.pose || input.character_pose || 'idle';
  const pose = STICKMAN_POSES.includes(rawPose) ? rawPose : 'idle';
  const characterMode = source.character?.mode || input.character_mode || '3d';
  const character = {
    enabled: source.character?.enabled !== false && input.character !== false,
    mode: characterMode === '2d' ? '2d' : '3d',
    pose,
    position: vector(source.character?.position, [0, 0, 0]),
    rotation: vector(source.character?.rotation, [0, 0, 0]),
    scale: Math.max(0.2, Math.min(3.0, finite(source.character?.scale, 1.0))),
    shirtColor: /^#[0-9a-f]{6}$/i.test(source.character?.shirtColor || input.accent || '')
      ? (source.character?.shirtColor || input.accent)
      : '#00f2fe',
    heldProp: source.character?.heldProp || source.held_prop || input.prop_type || input.props || null
  };

  // Reusable Main Prop
  const mainPropType = source.prop?.type || input.prop_type || input.props || null;
  const prop = mainPropType
    ? {
      type: REUSABLE_PROP_TYPES.includes(mainPropType) ? mainPropType : 'box',
      position: vector(source.prop?.position, [1.3, 0.8, -0.2]),
      rotation: vector(source.prop?.rotation, [0, 0, 0]),
      scale: Math.max(0.1, Math.min(5, finite(source.prop?.scale, 1.0))),
      motion: ['float', 'rotate', 'pulse', 'none'].includes(source.prop?.motion)
        ? source.prop.motion
        : 'float'
    }
    : null;

  // Custom 3D Objects
  const objects = Array.isArray(source.objects)
    ? source.objects.slice(0, 40).map((item, index) => {
      const type = THREE_D_OBJECT_TYPES.has(item?.type) ? item.type : 'box';
      const defaultSize = type === 'sphere' ? [0.8, 0.8, 0.8] : [1, 1, 1];
      return {
        id: String(item?.id || `object-${index + 1}`).slice(0, 64),
        type,
        position: vector(item?.position, [index * 1.5 - 1, 0.5, 0]),
        size: vector(item?.size, defaultSize).map((v) => Math.max(0.05, Math.min(20, Math.abs(v)))),
        color: /^#[0-9a-f]{6}$/i.test(item?.color || '') ? item.color : '#e8edf5',
        roughness: Math.max(0, Math.min(1, finite(item?.roughness, 0.72))),
        metalness: Math.max(0, Math.min(1, finite(item?.metalness, 0.05))),
        motion: ['float', 'rotate', 'pulse', 'none'].includes(item?.motion) ? item.motion : 'none',
        motionAmplitude: Math.max(0, Math.min(2, finite(item?.motion_amplitude, 0.18))),
        rotation: vector(item?.rotation, [0, 0, 0])
      };
    })
    : [];

  return {
    environment,
    background,
    ground,
    camera,
    character,
    prop,
    objects
  };
}

/**
 * Deterministic Camera Pose interpolation for Remotion frames.
 */
export function cameraPoseAtFrame(camera = {}, frame = 0, fps = 30, durationInFrames = 90) {
  const progress = Math.max(0, Math.min(1, frame / Math.max(1, durationInFrames - 1)));
  const intensity = Math.max(0, Math.min(1, finite(camera.intensity, 0.6)));
  const eased = progress * progress * (3 - 2 * progress);
  const time = frame / Math.max(1, fps);

  // Standard perspective camera baseline
  const base = { x: 0, y: 5.2, z: 12, targetX: 0, targetY: 1.1, targetZ: 0, roll: 0 };

  switch (camera.move) {
    case 'push_in':
      return {
        ...base,
        z: 12 - eased * 3.2 * intensity,
        y: 5.2 - eased * 0.45 * intensity,
        targetY: 1.1 + eased * 0.15 * intensity
      };

    case 'pull_back':
      return {
        ...base,
        z: 9 + eased * 3.2 * intensity,
        y: 4.75 + eased * 0.45 * intensity
      };

    case 'pan_left':
      return {
        ...base,
        x: -2.4 * eased * intensity,
        targetX: -1.2 * eased * intensity
      };

    case 'pan_right':
      return {
        ...base,
        x: 2.4 * eased * intensity,
        targetX: 1.2 * eased * intensity
      };

    case 'orbit': {
      const angle = progress * Math.PI * 0.45 * intensity;
      return {
        ...base,
        x: Math.sin(angle) * 3.2,
        z: 12 - (1 - Math.cos(angle)) * 1.4
      };
    }

    case 'crane_down':
      return {
        ...base,
        y: 7.5 - eased * 2.3 * intensity,
        z: 13.5 - eased * 1.5 * intensity
      };

    case 'dutch_tilt':
      return {
        ...base,
        roll: Math.sin(progress * Math.PI) * 0.08 * intensity,
        z: 12 - eased * 1.2 * intensity
      };

    case 'hold':
    default: {
      return base;
    }
  }
}

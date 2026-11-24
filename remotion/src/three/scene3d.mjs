/**
 * Pure helpers for MotionClone's deterministic 3D scene format.
 * Keep these free of browser/WebGL APIs so scene plans can be validated in Node tests.
 */

export const THREE_D_OBJECT_TYPES = new Set(['box', 'sphere', 'cylinder', 'cone', 'torus']);

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const vector = (value, fallback) => Array.isArray(value) && value.length === 3
  ? value.map((part, index) => finite(part, fallback[index]))
  : [...fallback];

export function normalizeThreeDScene(input = {}) {
  const source = input.three_d && typeof input.three_d === 'object' ? input.three_d : input;
  const environment = ['studio', 'office', 'room', 'street', 'forest'].includes(source.environment)
    ? source.environment : 'studio';
  const objects = Array.isArray(source.objects) ? source.objects.slice(0, 40).map((item, index) => {
    const type = THREE_D_OBJECT_TYPES.has(item?.type) ? item.type : 'box';
    const defaultSize = type === 'sphere' ? [0.8, 0.8, 0.8] : [1, 1, 1];
    return {
      id: String(item?.id || `object-${index + 1}`).slice(0, 64),
      type,
      position: vector(item?.position, [index * 1.5 - 1, 0.5, 0]),
      size: vector(item?.size, defaultSize).map(value => Math.max(0.05, Math.min(20, Math.abs(value)))),
      color: /^#[0-9a-f]{6}$/i.test(item?.color || '') ? item.color : '#e8edf5',
      roughness: Math.max(0, Math.min(1, finite(item?.roughness, 0.72))),
      metalness: Math.max(0, Math.min(1, finite(item?.metalness, 0.05))),
      motion: ['float', 'rotate', 'pulse', 'none'].includes(item?.motion) ? item.motion : 'none',
      motionAmplitude: Math.max(0, Math.min(2, finite(item?.motion_amplitude, 0.18))),
      rotation: vector(item?.rotation, [0, 0, 0])
    };
  }) : [];
  return {
    environment,
    background: /^#[0-9a-f]{6}$/i.test(source.background || '') ? source.background : '#b9c7d8',
    ground: /^#[0-9a-f]{6}$/i.test(source.ground || '') ? source.ground : '#d9d4ca',
    camera: {
      move: ['hold', 'push_in', 'pull_back', 'pan_left', 'pan_right', 'orbit'].includes(source.camera?.move)
        ? source.camera.move : 'hold',
      intensity: Math.max(0, Math.min(1, finite(source.camera?.intensity, 0.5)))
    },
    objects
  };
}

export function cameraPoseAtFrame(camera = {}, frame = 0, fps = 30, durationInFrames = 150) {
  const progress = Math.max(0, Math.min(1, frame / Math.max(1, durationInFrames - 1)));
  const intensity = Math.max(0, Math.min(1, finite(camera.intensity, 0.5)));
  const eased = progress * progress * (3 - 2 * progress);
  const base = {x: 0, y: 5.2, z: 12, targetX: 0, targetY: 1.1, targetZ: 0};
  switch (camera.move) {
    case 'push_in':
      return {...base, z: 12 - eased * 3.2 * intensity, y: 5.2 - eased * 0.45 * intensity};
    case 'pull_back':
      return {...base, z: 9 + eased * 3.2 * intensity, y: 4.75 + eased * 0.45 * intensity};
    case 'pan_left':
      return {...base, x: -2.4 * eased * intensity, targetX: -1.2 * eased * intensity};
    case 'pan_right':
      return {...base, x: 2.4 * eased * intensity, targetX: 1.2 * eased * intensity};
    case 'orbit': {
      const angle = progress * Math.PI * 0.45 * intensity;
      return {...base, x: Math.sin(angle) * 3.2, z: 12 - (1 - Math.cos(angle)) * 1.4};
    }
    default:
      return base;
  }
}

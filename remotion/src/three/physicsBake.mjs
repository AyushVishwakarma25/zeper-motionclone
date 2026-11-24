/**
 * Deterministic offline physics bake using @dimforge/rapier3d-compat.
 * Never runs live physics in Remotion frame callbacks.
 */

const finite = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);

export async function bakePhysicsScene(scene = {}, options = {}) {
  const fps = Math.max(1, Math.min(60, Math.round(finite(options.fps, 30))));
  const duration = Math.max(1, Math.min(60 * 120, Math.round(finite(options.durationInFrames, 150))));
  const RAPIER = options.rapier || (await import('@dimforge/rapier3d-compat'));
  if (typeof RAPIER.init === 'function') {
    await RAPIER.init({});
  }

  const gravity = scene.gravity || [0, -9.81, 0];
  const world = new RAPIER.World({
    x: finite(gravity[0], 0),
    y: finite(gravity[1], -9.81),
    z: finite(gravity[2], 0)
  });
  world.timestep = 1 / fps;

  // Add fixed ground plane so dropping/falling objects land reliably unless explicitly disabled
  if (scene.include_ground !== false) {
    const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0);
    const groundBody = world.createRigidBody(groundDesc);
    const groundCollider = RAPIER.ColliderDesc.cuboid(50, 0.05, 50);
    groundCollider.setRestitution(finite(scene.ground_restitution, 0.1));
    groundCollider.setFriction(finite(scene.ground_friction, 0.8));
    world.createCollider(groundCollider, groundBody);
  }

  const bodies = new Map();
  const initialTransforms = {};

  for (const [i, item] of (scene.bodies || []).entries()) {
    const id = String(item.id || `body-${i}`);
    const position = item.position || [0, 1, 0];
    const rotation = item.rotation || [0, 0, 0, 1];
    const isFixed = item.type === 'fixed' || item.is_static;
    const desc = isFixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic();

    desc.setTranslation(finite(position[0]), finite(position[1]), finite(position[2]));
    desc.setRotation({
      x: finite(rotation[0], 0),
      y: finite(rotation[1], 0),
      z: finite(rotation[2], 0),
      w: finite(rotation[3], 1)
    });

    if (item.linear_velocity) {
      desc.setLinvel({
        x: finite(item.linear_velocity[0], 0),
        y: finite(item.linear_velocity[1], 0),
        z: finite(item.linear_velocity[2], 0)
      });
    }
    if (item.angular_velocity) {
      desc.setAngvel({
        x: finite(item.angular_velocity[0], 0),
        y: finite(item.angular_velocity[1], 0),
        z: finite(item.angular_velocity[2], 0)
      });
    }

    const body = world.createRigidBody(desc);
    const size = item.half_extents || item.size?.map((v) => v / 2) || [0.5, 0.5, 0.5];
    const shape = String(item.shape || item.primitive || 'cuboid').toLowerCase();

    let collider;
    if (shape === 'ball' || shape === 'sphere') {
      collider = RAPIER.ColliderDesc.ball(Math.max(0.01, finite(size[0], 0.5)));
    } else if (shape === 'cylinder') {
      collider = RAPIER.ColliderDesc.cylinder(
        Math.max(0.01, finite(size[1], 0.5)),
        Math.max(0.01, finite(size[0], 0.5))
      );
    } else {
      collider = RAPIER.ColliderDesc.cuboid(
        Math.max(0.01, Math.abs(finite(size[0], 0.5))),
        Math.max(0.01, Math.abs(finite(size[1], 0.5))),
        Math.max(0.01, Math.abs(finite(size[2], 0.5)))
      );
    }

    collider.setRestitution(Math.max(0, Math.min(1, finite(item.restitution, 0.05))));
    collider.setFriction(Math.max(0, Math.min(2, finite(item.friction, 0.7))));
    world.createCollider(collider, body);

    bodies.set(id, body);
    initialTransforms[id] = {
      position: [finite(position[0]), finite(position[1]), finite(position[2])],
      rotation: [finite(rotation[0]), finite(rotation[1]), finite(rotation[2]), finite(rotation[3], 1)]
    };
  }

  const frames = [];
  for (let frame = 0; frame < duration; frame++) {
    if (typeof options.onProgress === 'function' && frame % Math.max(1, Math.floor(fps / 2)) === 0) {
      options.onProgress(frame, duration);
    }
    world.step();
    const transforms = {};
    for (const [id, body] of bodies) {
      const p = body.translation();
      const q = body.rotation();
      transforms[id] = {
        position: [p.x, p.y, p.z],
        rotation: [q.x, q.y, q.z, q.w]
      };
    }
    frames.push(transforms);
  }

  world.free();
  return {
    schema_version: '1.0',
    fps,
    duration_in_frames: duration,
    frames,
    initial_transforms: initialTransforms
  };
}

export function physicsTransformAtFrame(bake, id, frame) {
  if (!bake || !Array.isArray(bake.frames) || bake.frames.length === 0) {
    return bake?.initial_transforms?.[id] || null;
  }
  const f = finite(frame, 0);
  const clamped = Math.max(0, Math.min(bake.frames.length - 1, Math.floor(f)));
  const current = bake.frames[clamped]?.[id];
  if (!current) return bake?.initial_transforms?.[id] || null;

  // If sub-frame interpolation is needed
  const frac = f - clamped;
  if (frac > 0.001 && clamped + 1 < bake.frames.length && bake.frames[clamped + 1]?.[id]) {
    const next = bake.frames[clamped + 1][id];
    return {
      position: [
        current.position[0] + (next.position[0] - current.position[0]) * frac,
        current.position[1] + (next.position[1] - current.position[1]) * frac,
        current.position[2] + (next.position[2] - current.position[2]) * frac
      ],
      rotation: current.rotation // Quaternion rotation at frame boundary
    };
  }

  return current;
}

export function validatePhysicsBake(bake) {
  const errors = [];
  if (bake?.schema_version !== '1.0') errors.push('Unsupported physics bake schema.');
  if (!Number.isInteger(bake?.fps) || bake.fps < 1) errors.push('Invalid physics FPS.');
  if (!Array.isArray(bake?.frames) || bake.frames.length !== bake.duration_in_frames) {
    errors.push('Physics frames do not match declared duration.');
  }
  for (const [i, frame] of (bake?.frames || []).entries()) {
    for (const [id, t] of Object.entries(frame || {})) {
      if (![...(t.position || []), ...(t.rotation || [])].every(Number.isFinite)) {
        errors.push('Non-finite transform at frame ' + i + ' for ' + id);
      }
    }
  }
  return {valid: errors.length === 0, errors};
}

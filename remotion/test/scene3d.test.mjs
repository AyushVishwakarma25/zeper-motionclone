import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraPoseAtFrame, normalizeThreeDScene} from '../src/three/scene3d.mjs';

test('normalizes supported environment and clamps malformed objects', () => {
  const result = normalizeThreeDScene({
    environment: 'forest',
    objects: [
      {type: 'sphere', position: [1, 2, 3], size: [-2, 0, 40], motion: 'float'},
      {type: 'unknown', color: 'red'}
    ]
  });
  assert.equal(result.environment, 'forest');
  assert.equal(result.objects.length, 2);
  assert.equal(result.objects[0].type, 'sphere');
  assert.deepEqual(result.objects[0].size, [2, 0.05, 20]);
  assert.equal(result.objects[1].type, 'box');
  assert.equal(result.objects[1].color, '#e8edf5');
});

test('camera choreography is deterministic and bounded', () => {
  const start = cameraPoseAtFrame({move: 'push_in', intensity: 1}, 0, 30, 90);
  const end = cameraPoseAtFrame({move: 'push_in', intensity: 1}, 89, 30, 90);
  assert.equal(start.z, 12);
  assert.ok(end.z < start.z);
  assert.ok(end.z > 8);
});

test('orbit camera choreography curves around scene smoothly', () => {
  const start = cameraPoseAtFrame({move: 'orbit', intensity: 1}, 0, 30, 90);
  const mid = cameraPoseAtFrame({move: 'orbit', intensity: 1}, 45, 30, 90);
  const end = cameraPoseAtFrame({move: 'orbit', intensity: 1}, 89, 30, 90);
  assert.ok(Number.isFinite(start.x));
  assert.ok(Number.isFinite(mid.z));
  assert.ok(Number.isFinite(end.x));
});

test('crane_down and dutch_tilt camera moves compute valid poses', () => {
  const craneStart = cameraPoseAtFrame({move: 'crane_down', intensity: 0.8}, 0, 30, 90);
  const craneEnd = cameraPoseAtFrame({move: 'crane_down', intensity: 0.8}, 89, 30, 90);
  assert.ok(craneEnd.y < craneStart.y, 'Crane down must lower camera height');

  const tilt = cameraPoseAtFrame({move: 'dutch_tilt', intensity: 1}, 45, 30, 90);
  assert.ok(Math.abs(tilt.roll) > 0.02, 'Dutch tilt should add camera roll');
});

test('unknown camera movement safely falls back to a hold', () => {
  assert.deepEqual(
    cameraPoseAtFrame({move: 'teleport'}, 45, 30, 90),
    cameraPoseAtFrame({move: 'hold'}, 45, 30, 90)
  );
});

test('normalizeThreeDScene gracefully handles empty and null inputs', () => {
  const empty = normalizeThreeDScene({});
  assert.equal(empty.environment, 'studio');
  assert.ok(empty.camera);
  assert.ok(Array.isArray(empty.objects));
});

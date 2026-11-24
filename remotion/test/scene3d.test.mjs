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

test('unknown camera movement safely falls back to a hold', () => {
  assert.deepEqual(
    cameraPoseAtFrame({move: 'teleport'}, 45, 30, 90),
    cameraPoseAtFrame({move: 'hold'}, 45, 30, 90)
  );
});

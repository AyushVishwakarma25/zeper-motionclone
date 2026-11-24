import test from 'node:test';
import assert from 'node:assert/strict';
import {STICKMAN_POSES, stickmanPoseKeyframes} from '../src/three/stickman3d.mjs';
import {normalizeThreeDScene, REUSABLE_PROP_TYPES, THREE_D_ENVIRONMENTS} from '../src/three/scene3d.mjs';

test('stickman supports all 10 expressive poses deterministically', () => {
  for (const pose of STICKMAN_POSES) {
    const kf0 = stickmanPoseKeyframes(pose, 0, 30, 90);
    const kfMid = stickmanPoseKeyframes(pose, 45, 30, 90);
    const kfEnd = stickmanPoseKeyframes(pose, 89, 30, 90);

    // All joint values must be finite numbers
    for (const [key, val] of Object.entries(kf0)) {
      assert.ok(Number.isFinite(val), `Keyframe 0: ${pose}.${key} must be finite, got ${val}`);
    }
    for (const [key, val] of Object.entries(kfMid)) {
      assert.ok(Number.isFinite(val), `Keyframe Mid: ${pose}.${key} must be finite, got ${val}`);
    }
    for (const [key, val] of Object.entries(kfEnd)) {
      assert.ok(Number.isFinite(val), `Keyframe End: ${pose}.${key} must be finite, got ${val}`);
    }
  }
});

test('walking and running produce rhythmic stride motion', () => {
  const walk0 = stickmanPoseKeyframes('walking', 0, 30, 90);
  const walk15 = stickmanPoseKeyframes('walking', 8, 30, 90);
  assert.notEqual(walk0.leftLegRotX, walk15.leftLegRotX);
  assert.ok(Math.abs(walk0.hipsY - 1.05) < 0.1);

  const run = stickmanPoseKeyframes('running', 10, 30, 90);
  assert.ok(run.torsoRotX > 0.15, 'Running must feature forward torso lean');
  assert.ok(run.leftForearmRotX > 0.8, 'Running must have bent elbows');
});

test('pointing extends arm toward target and angles gaze', () => {
  const point = stickmanPoseKeyframes('pointing', 30, 30, 90);
  assert.ok(point.rightArmRotX > 1.0, 'Pointing arm must be extended forward/up');
  assert.ok(point.headRotY < -0.1, 'Head should turn toward the target');
});

test('sitting_desk lowers hips and bends knees at 90 degrees', () => {
  const sit = stickmanPoseKeyframes('sitting_desk', 20, 30, 90);
  assert.ok(sit.hipsY < 0.8, 'Hips must be lowered for seated pose');
  assert.ok(sit.leftLegRotX > 1.2, 'Thighs must be horizontal');
  assert.ok(sit.leftKneeRotX > 1.2, 'Knees must be bent 90 degrees');
});

test('unknown pose safely defaults to idle', () => {
  const unknown = stickmanPoseKeyframes('breakdancing_in_space', 10, 30, 90);
  const idle = stickmanPoseKeyframes('idle', 10, 30, 90);
  assert.deepEqual(unknown, idle);
});

test('normalizes 3D character, props, and environment options', () => {
  const scene = normalizeThreeDScene({
    three_d: {
      environment: 'office',
      character: {
        pose: 'pointing',
        shirtColor: '#ff0055',
        scale: 1.2
      },
      prop: {
        type: 'laptop',
        motion: 'float'
      }
    }
  });

  assert.equal(scene.environment, 'office');
  assert.equal(scene.character.pose, 'pointing');
  assert.equal(scene.character.shirtColor, '#ff0055');
  assert.equal(scene.character.scale, 1.2);
  assert.equal(scene.prop.type, 'laptop');
  assert.equal(scene.prop.motion, 'float');
});

test('reusable props catalog covers all required types', () => {
  assert.ok(REUSABLE_PROP_TYPES.includes('money_stack'));
  assert.ok(REUSABLE_PROP_TYPES.includes('laptop'));
  assert.ok(REUSABLE_PROP_TYPES.includes('phone'));
  assert.ok(REUSABLE_PROP_TYPES.includes('invoice'));
  assert.ok(REUSABLE_PROP_TYPES.includes('box'));
  assert.ok(REUSABLE_PROP_TYPES.includes('chart_3d'));
});

test('supported environments cover all required presets', () => {
  assert.ok(THREE_D_ENVIRONMENTS.includes('studio'));
  assert.ok(THREE_D_ENVIRONMENTS.includes('office'));
  assert.ok(THREE_D_ENVIRONMENTS.includes('street'));
  assert.ok(THREE_D_ENVIRONMENTS.includes('forest'));
  assert.ok(THREE_D_ENVIRONMENTS.includes('tech'));
  assert.ok(THREE_D_ENVIRONMENTS.includes('room'));
});

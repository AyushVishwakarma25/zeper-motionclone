import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worldState, cameraAt, dumpState, plateTransform} from '../src/layered.mjs';

const scene = () => ({
  world: {w: 1080, h: 1920},
  surfaces: [{id: 'floor', x: 540, y: 1920, w: 1080, h: 420}, {id: 'counter', x: 540, y: 1300, w: 900, h: 220}],
  objects: [
    {id: 'hero', class: 'character', x: 250, y: 1500, w: 260, h: 1000, support: 'floor', facing: 1,
      hands: {right: [{f: 0, x: 400, y: 900}, {f: 30, x: 600, y: 1050}, {f: 60, x: 600, y: 1050}]}},
    {id: 'toaster', class: 'prop', asset: 'toaster.png', x: 600, w: 150, h: 180, support: 'counter'},
    {id: 'toast', class: 'prop', asset: 'toast.png', x: 600, w: 60, h: 60, support: 'counter',
      attach: [{from: 30, to: 60, held_by: 'hero', hand: 'right', grip: [0, -30]}]},
  ],
});

test('a supported object is grounded by the engine, it cannot float', () => {
  const st = worldState(scene(), 5);
  const toaster = st.find(o => o.id === 'toaster');
  assert.equal(toaster.y, 1300 - 220);
  assert.equal(toaster.support, 'counter');
});

test('a held object follows the hand and drops its support while held', () => {
  const st = worldState(scene(), 45);
  const toast = st.find(o => o.id === 'toast');
  assert.equal(toast.held_by, 'hero');
  assert.equal(toast.support, undefined);
  const hand = st.find(o => o.id === 'hero').hands.right;
  assert.ok(Math.abs(toast.x - hand[0]) < 1e-6 && Math.abs((toast.y - 30) - hand[1]) < 1e-6);
});

test('after release it is grounded again', () => {
  const toast = worldState(scene(), 61).find(o => o.id === 'toast');
  assert.equal(toast.support, 'counter');
  assert.equal(toast.y, 1080);
});

test('camera interpolates and clamps zoom', () => {
  const cam = [{f: 0, cx: 540, cy: 960, zoom: 1}, {f: 10, cx: 640, cy: 960, zoom: 9}];
  assert.equal(cameraAt(cam, 0, {w: 1080, h: 1920}).cx, 540);
  assert.equal(cameraAt(cam, 10, {w: 1080, h: 1920}).zoom, 2.5);
});

test('plates are centred when the camera is centred', () => {
  const t = plateTransform({cx: 540, cy: 960, zoom: 1}, {w: 1080, h: 1920}, {w: 1080, h: 1920});
  assert.deepEqual([t.x, t.y, t.scale], [0, 0, 1]);
});

test('dumpState has one entry per frame', () => {
  const d = dumpState(scene(), 12);
  assert.equal(d.frames.length, 12);
  assert.equal(d.frames[3].objects.find(o => o.id === 'floor').fixed, true);
});

import {mouthAt} from '../src/layered.mjs';
test('mouth track gives one shape per frame, clamped, rest shape when missing', () => {
  const t = {frames: ['X', 'B', 'D', 'A']};
  assert.deepEqual([0, 1, 2, 3, 99, -5].map(f => mouthAt(t, f)), ['X', 'B', 'D', 'A', 'A', 'X']);
  assert.equal(mouthAt(null, 3), 'X');
});

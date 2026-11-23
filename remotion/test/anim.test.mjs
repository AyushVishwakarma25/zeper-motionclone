import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prog, wordStates, splitLines, hash, ease} from '../src/explainer/anim.mjs';

const W = [{w: 'ki', start: 0, end: .2}, {w: 'wo', start: .2, end: .4}, {w: 'Gold', start: .4, end: .8}, {w: 'ko', start: .9, end: 1.0},
  {w: 'lab', start: 1.5, end: 1.8}, {w: 'mein', start: 1.8, end: 2.0}, {w: 'bana', start: 2.0, end: 2.3}, {w: 'sakta', start: 2.3, end: 2.6}];

test('words move ahead -> now -> done with time', () => {
  assert.deepEqual(wordStates(W, 0.5).map(s => s.state).slice(0, 4), ['done', 'done', 'now', 'ahead']);
  assert.equal(wordStates(W, 99).every(s => s.state === 'done'), true);
});
test('lines split at the longest pause', () => {
  const [a, b] = splitLines(W);
  assert.deepEqual(a, [0, 1, 2, 3]); assert.deepEqual(b, [4, 5, 6, 7]);
});
test('short phrases are one big line', () => { assert.deepEqual(splitLines(W.slice(0, 3))[0], []); });
test('prog clamps and eases; hash is deterministic', () => {
  assert.equal(prog(5, 1, 2), 1); assert.equal(prog(0, 1, 2), 0); assert.ok(prog(1.5, 1, 2, ease.out) > .5);
  assert.equal(hash(7), hash(7)); assert.ok(hash(7) >= 0 && hash(7) < 1);
});

import {fitSize} from '../src/explainer/anim.mjs';
test('long lines shrink to fit one line, short lines keep the full size', () => {
  assert.equal(fitSize('lab mein', 640, 56), 56);
  assert.ok(fitSize('hai gold lab mein banega ho jayega', 640, 56) < 40);
  assert.equal(fitSize('x'.repeat(200), 640, 56), 30);
});

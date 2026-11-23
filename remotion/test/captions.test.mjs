import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeChunks, captionAt, parseWords} from '../src/science/captions.mjs';

const W = (s, t0 = 0) => s.split(' ').map((w, i) => ({w, start: t0 + i * .3, end: t0 + i * .3 + .25}));

test('keywords are marked and unstarred', () => {
  const p = parseWords(W("But maybe *sharp* people"));
  assert.deepEqual(p.map(x => [x.w, x.key]), [['But', false], ['maybe', false], ['sharp', true], ['people', false]]);
});
test('chunks: <=3 words, keyword alone, break after punctuation', () => {
  const c = makeChunks(W("Do video games change your brain? In 2003, a *team* tested gamers"));
  assert.deepEqual(c.map(x => x.map(w => w.w).join(' ')), ['Do video games', 'change your brain?', 'In 2003,', 'a', 'team', 'tested gamers']);
  assert.ok(c.every(x => x.length <= 3));
});
test('long words respect the character limit', () => {
  const c = makeChunks(W("extraordinarily extraordinarily extraordinarily"));
  assert.ok(c.every(x => x.length === 1));
});
test('words appear as spoken; the latest is now; hidden before and after', () => {
  const c = makeChunks(W("Do video games"));
  assert.equal(captionAt(c, -1), null);
  const a = captionAt(c, 0.5);
  assert.deepEqual(a.words.map(w => w.state), ['done', 'now']);
  assert.equal(captionAt(c, 99), null);
});

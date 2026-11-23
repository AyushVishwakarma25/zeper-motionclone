// Pure caption logic for the science-explainer genre. Words arrive as {w, start, end}; a word wrapped in *stars* is a KEYWORD.
const END = /[.?!,;:]$/;

export function parseWords(words) {
  return words.map(x => { const k = /^\*.+\*[.,?!;:]*$/.test(x.w); return {...x, w: x.w.replace(/\*/g, ''), key: k}; });
}

/** Chunks of at most `maxWords` words / `maxChars` characters, broken after punctuation; every keyword is its own chunk (shown as a pill). */
export function makeChunks(words, maxWords = 3, maxChars = 22) {
  const ws = parseWords(words), chunks = [];
  let cur = [];
  const flush = () => { if (cur.length) { chunks.push(cur); cur = []; } };
  for (const w of ws) {
    if (w.key) { flush(); chunks.push([w]); continue; }
    if (cur.length && (cur.length >= maxWords || cur.map(x => x.w).join(' ').length + w.w.length + 1 > maxChars)) flush();
    cur.push(w);
    if (END.test(w.w)) flush();
  }
  flush();
  return chunks;
}

/** What to show at time t: the active chunk and each word's state. Words appear as they are spoken; the latest one is 'now'. */
export function captionAt(chunks, t) {
  let idx = -1;
  for (let i = 0; i < chunks.length; i++) if (t >= chunks[i][0].start - 0.04) idx = i;
  if (idx < 0) return null;
  const chunk = chunks[idx], next = chunks[idx + 1];
  const last = chunk[chunk.length - 1];
  if (!next && t > last.end + 0.6) return null;                     // fade out after the final chunk
  const shown = chunk.filter(w => t >= w.start - 0.04);
  return {index: idx, since: t - chunk[0].start, words: shown.map((w, i) => ({...w, state: i === shown.length - 1 ? 'now' : 'done'}))};
}

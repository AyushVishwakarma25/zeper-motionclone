// Pure animation maths for the icon-explainer genre. Everything is a function of time t (seconds in the scene).
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, p) => a + (b - a) * p;
export const ease = {
  out: p => 1 - (1 - clamp(p)) ** 3,
  inOut: p => { p = clamp(p); return p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2; },
  back: p => { p = clamp(p); const c = 1.70158; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; },
  spring: p => { p = clamp(p); return p >= 1 ? 1 : 1 - Math.cos(p * 3.2 * Math.PI) * Math.exp(-5.5 * p); },
};
/** progress 0..1 of the window [a, b] seconds, optionally eased. */
export const prog = (t, a, b, fn = null) => { const p = clamp((t - a) / Math.max(1e-6, b - a)); return fn ? fn(p) : p; };
/** deterministic pseudo-random in [0,1) from an integer seed: no Math.random anywhere. */
export const hash = n => { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * Word-by-word headline state. words: [{w, start, end}] in seconds.
 * 'ahead' = not spoken yet (light grey), 'now' = being spoken, 'done' = spoken (dark).
 * `visible` is false before the line's first word is ~0.25 s away so lines slide in just before they are needed.
 */
export function wordStates(words, t, lead = 0.25) {
  return words.map(x => ({w: x.w, state: t < x.start ? 'ahead' : t < x.end ? 'now' : 'done'}))
    .map((s, i, arr) => ({...s, visible: t >= (words[0]?.start ?? 0) - lead}));
}

/** Split a flat word list into [small line, big line] at the last pause, or the midpoint. Hinglish-safe (no language rules). */
export function splitLines(words, maxPerLine = 4) {
  if (words.length <= maxPerLine) return [[], words.map((w, i) => i)];
  let cut = Math.ceil(words.length / 2), best = -1;
  for (let i = 1; i < words.length; i++) { const gap = words[i].start - words[i - 1].end; if (gap > best) { best = gap; cut = i; } }
  if (best < 0.12) cut = Math.floor(words.length / 2);
  return [words.slice(0, cut).map((_, i) => i), words.slice(cut).map((_, i) => i + cut)];
}

/** Font size that keeps `text` on ONE line of `width` px (bold sans averages ~0.53 em per character). Never above `max`, never below `min`. */
export function fitSize(text, width, max, min = 30) {
  const est = width / (Math.max(1, text.length) * 0.53);
  return Math.max(min, Math.min(max, Math.floor(est)));
}

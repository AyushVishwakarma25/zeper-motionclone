import React from 'react';
import {ease, fitSize, prog, splitLines, wordStates} from './anim.mjs';

export const INK = '#202020', GREY = '#b9b9bd';

/** Two-line headline whose words darken as they are spoken. t = seconds in scene; words from timing.json. */
export function WordReveal({words = [], t = 0, y = 330, width = 640, small = 40, big = 56, ink = INK, grey = GREY, font = "Inter, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"}) {
  if (!words.length) return null;
  const st = wordStates(words, t);
  const [l1, l2] = splitLines(words);
  const appear = prog(t, words[0].start - .3, words[0].start - .05, ease.out);
  const line = (idx, size0, weight) => idx.length ? (() => { const size = fitSize(idx.map(i => words[i].w).join(' '), width, size0);
    return (<div style={{fontSize: size, fontWeight: weight, lineHeight: 1.18, letterSpacing: '-0.02em', textAlign: 'center', whiteSpace: 'nowrap'}}>
      {idx.map(i => { const w = words[i], k = st[i].state === 'now' ? Math.sin(Math.min(1, (t - w.start) / Math.max(.12, w.end - w.start)) * Math.PI) : 0;
        return <span key={i} style={{display: 'inline-block', whiteSpace: 'pre', color: st[i].state === 'ahead' ? grey : ink, transform: `translateY(${-5 * k}px) scale(${1 + .07 * k})`}}>{w.w}{' '}</span>; })}
    </div>); })() : null;
  return (
    <div style={{position: 'absolute', left: (720 - width) / 2, top: y, width, fontFamily: font, opacity: appear,
      transform: `translateY(${(1 - appear) * 18}px)`}}>
      {line(l1, small, 700)}
      {line(l2, big, 800)}
    </div>
  );
}
export default WordReveal;

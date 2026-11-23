import React from 'react';
import {ease, prog} from '../explainer/anim.mjs';
import {captionAt, makeChunks} from './captions.mjs';
import {S} from './theme.mjs';

/** Top caption of the science explainer. y is in the 720x1280 design space. */
export function ChunkCaption({words = [], t = 0, y = 215, size = 56, font = "Nunito, Poppins, 'Segoe UI', Arial, sans-serif"}) {
  const chunks = React.useMemo(() => makeChunks(words), [words]);
  const cap = captionAt(chunks, t);
  if (!cap) return null;
  const pop = ease.back(prog(cap.since, 0, .16));
  return (
    <div style={{position: 'absolute', left: 0, width: 720, top: y, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, fontFamily: font,
      fontSize: size, fontWeight: 800, letterSpacing: '-0.01em', transform: `scale(${.88 + .12 * pop}) translateY(${(1 - pop) * 8}px)`, opacity: Math.min(1, pop * 2.2)}}>
      {cap.words.map((w, i) => w.key
        ? <span key={i} style={{background: S.orange, color: '#fff', padding: '2px 22px 6px', borderRadius: 999, lineHeight: 1.15}}>{w.w}</span>
        : <span key={i} style={{color: w.state === 'now' ? S.cream : S.dim, display: 'inline-block', transform: w.state === 'now' ? `scale(${1 + .06 * Math.sin(Math.min(1, (t - w.start) / Math.max(.1, w.end - w.start)) * Math.PI)})` : undefined}}>{w.w}</span>)}
    </div>);
}
export default ChunkCaption;

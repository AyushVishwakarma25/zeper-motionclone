import React from 'react';
import {ease, hash, prog} from './anim.mjs';

/** Four-point twinkle star. */
const Star = ({s, c}) => <path d={`M0,${-s} Q${s * .18},${-s * .18} ${s},0 Q${s * .18},${s * .18} 0,${s} Q${-s * .18},${s * .18} ${-s},0 Q${-s * .18},${-s * .18} 0,${-s}Z`} fill={c} />;

/** Sparkles that twinkle around the icon, forever. Deterministic: position, phase and speed come from hash(seed). */
export function Sparkles({t, n = 6, color = '#f5b932', box = 380, seed = 1}) {
  return (<svg viewBox={`0 0 ${box} ${box}`} width={box} height={box} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none'}}>
    {Array.from({length: n}, (_, i) => {
      const a = hash(seed * 31 + i) * Math.PI * 2, r = box * (.42 + .1 * hash(seed + i * 7)), sp = .5 + hash(i + seed * 3) * .6;
      const x = box / 2 + Math.cos(a + t * .25 * sp) * r, y = box / 2 + Math.sin(a + t * .25 * sp) * r * .8 - 6 * Math.sin(t * 1.5 + i);
      const tw = .5 + .5 * Math.sin(t * (2.4 + hash(i) * 2) + i * 2), s = 5 + hash(i + 5) * 9;
      return <g key={i} transform={`translate(${x} ${y}) rotate(${t * 40 * sp})`} opacity={tw}><Star s={s * (.6 + tw * .6)} c={color} /></g>; })}</svg>);
}

/** Soft drifting shapes behind everything: depth without noise. Very low contrast so text stays readable. */
export function Backdrop({t, d, tone = '#dcdce2'}) {
  return (<svg viewBox="0 0 720 1280" width="720" height="1280" style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none'}}>
    {Array.from({length: 9}, (_, i) => {
      const x = ((hash(i * 3) * 760 + t * (6 + hash(i) * 10) * (i % 2 ? 1 : -1)) % 800 + 800) % 800 - 40, y = 120 + hash(i * 5 + 1) * 1000 + 14 * Math.sin(t * .8 + i);
      const k = i % 3, s = 14 + hash(i + 9) * 22, o = .45 + .25 * Math.sin(t + i);
      return k === 0 ? <circle key={i} cx={x} cy={y} r={s} fill="none" stroke={tone} strokeWidth="4" opacity={o} />
        : k === 1 ? <g key={i} transform={`translate(${x} ${y}) rotate(${t * 18 + i * 40})`} opacity={o}><rect x={-s} y="-3" width={s * 2} height="6" rx="3" fill={tone} /><rect x="-3" y={-s} width="6" height={s * 2} rx="3" fill={tone} /></g>
        : <circle key={i} cx={x} cy={y} r={s * .35} fill={tone} opacity={o} />; })}</svg>);
}

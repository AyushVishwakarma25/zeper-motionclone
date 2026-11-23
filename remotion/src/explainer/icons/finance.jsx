import React from 'react';
import {clamp, ease, hash, lerp, prog} from '../anim.mjs';
import {C} from './theme.mjs';

// Every icon: ({t, d}) -> <svg viewBox="0 0 400 400">. t = seconds into the scene, d = scene length. Pure functions of t.
const Svg = ({children}) => <svg viewBox="0 0 400 400" width="100%" height="100%" style={{overflow: 'visible'}}>{children}</svg>;

export function Bar({x, y, w, h, op = 1}) {   // one gold bar (trapezoid, lit top, shaded front)
  const t = w * .16;
  return (
    <g opacity={op}>
      <polygon points={`${x + t},${y} ${x + w - t},${y} ${x + w},${y + h * .42} ${x},${y + h * .42}`} fill={C.goldHi} />
      <polygon points={`${x},${y + h * .42} ${x + w},${y + h * .42} ${x + w},${y + h} ${x},${y + h}`} fill={C.gold} />
      <polygon points={`${x},${y + h * .42} ${x + w},${y + h * .42} ${x + w},${y + h * .55} ${x},${y + h * .55}`} fill={C.goldLo} opacity=".35" />
    </g>);
}

const Glint = ({x, y, t, ph = 0}) => { const k = Math.max(0, Math.sin(t * 3 + ph)); return <g transform={`translate(${x} ${y}) rotate(${t * 60})`} opacity={k}><path d={`M0,-16 Q3,-3 16,0 Q3,3 0,16 Q-3,3 -16,0 Q-3,-3 0,-16Z`} fill="#fff" transform={`scale(${.5 + k * .7})`} /></g>; };

export function GoldBars({t, d, fall = false}) {
  const rows = [[0, 3], [1, 2], [2, 1]];                      // bottom row 3 bars, then 2, then 1 on top
  let i = 0; const bars = [];
  rows.forEach(([r, n]) => { for (let k = 0; k < n; k++) {
    const start = .15 + i * .22, p = prog(t, start, start + .4, ease.back);
    const x = 200 - n * 62 + k * 124 + 0, y = 300 - r * 62;
    bars.push(<g key={i} transform={`translate(0 ${(1 - p) * -90})`}><Bar x={x - 62 + 62} y={y} w={118} h={58} op={clamp(p * 2)} /></g>); i++; } });
  const f = fall ? prog(t, d * .45, d * .9, ease.inOut) : 0;
  return <Svg><g transform={`translate(0 ${f * 70})`} opacity={1 - f * .25}>{bars}</g>
    {fall && <g opacity={prog(t, d * .45, d * .6)} transform={`translate(0 ${f * 40})`}><line x1="330" y1="70" x2="330" y2="170" stroke={C.red} strokeWidth="10" strokeLinecap="round" />
      <polygon points="306,160 354,160 330,200" fill={C.red} /></g>}
    {t > .9 && <g><Glint x={120} y={248} t={t} /><Glint x={236} y={290} t={t} ph={2} /><Glint x={170} y={310} t={t} ph={4} /></g>}</Svg>;
}

export function SilverCoin({t, d}) {
  const cyc = t < .2 ? 0 : ((t - .2) % (d * .8)) / (d * .8), run = ease.inOut(cyc), fadeIO = Math.min(1, cyc * 10) * (1 - Math.max(0, (cyc - .93) * 14)), x = lerp(70, 330, run), u = (x - 40) / 320, y = 86 + 190 * u ** 1.6 + 40, rot = run * 540;
  const pts = Array.from({length: 24}, (_, k) => { const u = k / 23; return `${lerp(40, 360, u)},${80 + 190 * u ** 1.6 + 6}`; }).join(' ');
  return <Svg>
    <path d={`M40,${80 + 6} L${pts.split(' ').map(p => p).join(' L')} L360,330 L40,330 Z`} fill="#d6d6dc" />
    <polyline points={pts} fill="none" stroke="#9b9ba6" strokeWidth="6" strokeLinecap="round" />
    <g transform={`translate(${x} ${y - 40}) rotate(${rot})`} opacity={fadeIO}>
      <circle r="34" fill="#cfd3dc" stroke="#8a8f9e" strokeWidth="6" /><circle r="22" fill="none" stroke="#8a8f9e" strokeWidth="3" />
      <text y="9" textAnchor="middle" fontSize="26" fontWeight="800" fill="#6b7080" fontFamily="Arial">Ag</text>
    </g></Svg>;
}

export function Candles({t, d, crash = true}) {
  const N = 9, vals = [60, 85, 95, 130, 150, 120, 80, 50, 35];
  const out = []; let path = '';
  for (let i = 0; i < N; i++) {
    const p = prog(t, .1 + i * .16, .1 + i * .16 + .25, ease.out); if (p <= 0) continue;
    const up = i < 5, cx = 60 + i * 34, mid = 330 - vals[i] * 1.5 + (i >= N - 3 ? 4 * Math.sin(t * 4 + i) : 0), body = 26 + hash(i) * 14 + (i >= N - 3 ? 5 * Math.sin(t * 5 + i) : 0), col = up ? C.green : C.redSoft;
    out.push(<g key={i} opacity={clamp(p * 2)} transform={`translate(0 ${(1 - p) * 20})`}>
      <line x1={cx} x2={cx} y1={mid - body - 16} y2={mid + body + 16} stroke={col} strokeWidth="4" strokeLinecap="round" />
      <rect x={cx - 11} y={mid - body / 2} width="22" height={body} rx="4" fill={col} /></g>);
  }
  return <Svg><rect x="20" y="40" width="360" height="300" rx="22" fill="#fff" />
    <line x1="40" x2="40" y1="60" y2="320" stroke="#d8d8de" strokeWidth="3" /><line x1="40" x2="360" y1="320" y2="320" stroke="#d8d8de" strokeWidth="3" />{out}</Svg>;
}

export function AiBars({t, d, chip = true}) {
  const hs = [50, 80, 115, 150, 200], bars = hs.map((h, i) => {
    const p = prog(t, .1 + i * .15, .1 + i * .15 + .45, ease.back), x = 60 + i * 62;
    return <rect key={i} x={x} y={330 - h * p * (1 + .05 * Math.sin(t * 3 + i))} width="46" height={h * p * (1 + .05 * Math.sin(t * 3 + i))} rx="6" fill={C.navy} />; });
  const chipP = prog(t, 1.0, 1.4, ease.back);
  return <Svg>{bars}<line x1="40" x2="360" y1="332" y2="332" stroke="#c9c9d0" strokeWidth="4" />
    {chip && <g transform={`translate(322 ${130 - 60 * (1 - chipP)}) scale(${chipP})`} opacity={clamp(chipP * 2)}>
      <rect x="-30" y="-30" width="60" height="60" rx="10" fill={C.navy} stroke="#fff" strokeWidth="4" />
      {[-18, -6, 6, 18].map(k => <g key={k}><line x1={k} x2={k} y1="-40" y2="-30" stroke={C.navy} strokeWidth="4" /><line x1={k} x2={k} y1="30" y2="40" stroke={C.navy} strokeWidth="4" />
        <line y1={k} y2={k} x1="-40" x2="-30" stroke={C.navy} strokeWidth="4" /><line y1={k} y2={k} x1="30" x2="40" stroke={C.navy} strokeWidth="4" /></g>)}
      <text y="9" textAnchor="middle" fontSize="26" fontWeight="800" fill="#fff" fontFamily="Arial">AI</text>
      <rect x="-36" y="-36" width="72" height="72" rx="14" fill="none" stroke={C.blue} strokeWidth="3" opacity={.45 + .45 * Math.sin(t * 4)} /></g>}</Svg>;
}

export function Bond({t, d}) {
  const p = prog(t, .1, .55, ease.back), sealP = prog(t, .6, .95, ease.spring);
  return <Svg><g transform={`translate(200 210) scale(${.75 + .25 * p}) rotate(${(1 - p) * -6})`} opacity={clamp(p * 2)}>
    <rect x="-150" y="-100" width="300" height="200" rx="14" fill="#f1f6ee" stroke="#3b7a4a" strokeWidth="6" />
    <rect x="-132" y="-82" width="264" height="164" rx="8" fill="none" stroke="#3b7a4a" strokeWidth="2" opacity=".6" />
    <text x="-108" y="-46" fontSize="34" fontWeight="800" fill="#2f5e3b" fontFamily="Arial">US BOND</text>
    {[0, 1, 2].map(k => <rect key={k} x="-108" y={-18 + k * 26} width={150 - k * 22} height="9" rx="4" fill="#8db497" />)}
    <g transform={`translate(88 28) rotate(${Math.sin(t * 2.5) * 6}) scale(${sealP * (1 + .06 * Math.sin(t * 4))})`}><circle r="34" fill={C.red} /><polygon points="0,-19 6,-6 20,-6 9,3 13,17 0,9 -13,17 -9,3 -20,-6 -6,-6" fill="#fff" /></g></g></Svg>;
}

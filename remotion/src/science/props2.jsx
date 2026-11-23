import React from 'react';
import {ease, hash, prog} from '../explainer/anim.mjs';
import {S} from './theme.mjs';
import {Tag} from './props1.jsx';

const SH = `drop-shadow(8px 10px 5px ${S.shadow})`;
const Box = ({vb = '0 0 400 400', children}) => <svg viewBox={vb} width="100%" height="100%" style={{overflow: 'visible', filter: SH}}>{children}</svg>;

/** Funnel with year tags; dots drop through and the stream narrows. */
export function Funnel({t, years = ['2010', '2013', '2016'], n = 9}) {
  return <Box><path d="M40,60 H360 L236,230 V330 Q236,350 216,350 H184 Q164,350 164,330 V230Z" fill="#cfd8d8" stroke="#eef" strokeWidth="6" strokeLinejoin="round" />
    <path d="M70,70 H330 L222,226 H178Z" fill="#9db4b6" opacity=".55" />
    {Array.from({length: n}, (_, i) => { const p = (t * .5 + i / n) % 1, y = 20 + p * 330, half = y < 230 ? 140 * (1 - (y - 60) / 170) : 20, x = 200 + Math.sin(i * 7.3) * Math.max(6, half * .8) * (p < .75 ? 1 : .2);
      return <circle key={i} cx={x} cy={y} r="9" fill={[S.orange, S.gold, S.teal][i % 3]} opacity={Math.min(1, p * 6) * (p > .93 ? (1 - p) * 14 : 1)} />; })}
    {years.map((y, i) => { const e = ease.back(prog(t, .3 + i * .25, .7 + i * .25)); return <g key={y} transform={`translate(${200 + (i - (years.length - 1) / 2) * 118} ${24 - 0}) scale(${e})`}><Tag text={y} tone="orange" w={78} /></g>; })}</Box>;
}

/** University building with pillars and a year tag. */
export function University({t, year = '', sway = true}) {
  const flag = Math.sin(t * 4) * 6;
  return <Box vb="0 0 480 360"><rect x="30" y="300" width="420" height="34" rx="6" fill="#b9a98a" /><rect x="60" y="270" width="360" height="34" rx="6" fill="#cdbd9d" />
    {[0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={86 + i * 60} y="150" width="30" height="124" rx="6" fill="#efe3c6" />)}
    <polygon points="40,150 240,50 440,150" fill="#e4d4ae" stroke="#cdbd9d" strokeWidth="6" strokeLinejoin="round" /><circle cx="240" cy="108" r="20" fill={S.orange} /><circle cx="240" cy="108" r="9" fill="#f4ecd8" />
    <line x1="240" y1="50" x2="240" y2="6" stroke="#6a5a40" strokeWidth="5" /><path d={`M240,8 q${26 + flag},-6 ${44 + flag},6 q${-18 - flag / 2},10 ${-44 - flag},10z`} fill={S.red} />
    {year && <g transform="translate(240 322)"><Tag text={year} tone="white" w={86} /></g>}</Box>;
}

/** Bird flapping across (0..1 loop) or a plane. */
export function Flyer({t, kind = 'bird', color = S.gold}) {
  const flap = Math.sin(t * 14) * .6;
  if (kind === 'plane') return <Box vb="0 0 400 200"><g transform={`translate(0 ${Math.sin(t * 2) * 6}) rotate(${Math.sin(t * 1.5) * 3} 200 100)`}><path d="M40,100 L330,84 Q380,100 330,116Z" fill="#eef1ee" /><path d="M170,96 L120,30 L146,30 L222,94Z M170,106 L120,170 L146,170 L222,108Z" fill="#c8d0d0" /><path d="M60,98 L40,60 L66,60 L96,96Z" fill={S.orange} /></g></Box>;
  return <Box vb="0 0 300 200"><g transform={`translate(0 ${Math.sin(t * 3) * 8})`}><ellipse cx="150" cy="110" rx="62" ry="38" fill={color} /><circle cx="208" cy="92" r="24" fill={color} /><polygon points="228,88 258,98 228,104" fill={S.orange} /><circle cx="214" cy="88" r="5" fill="#222" />
    <path d="M110,100 q-30,-70 10,-86 q20,40 50,86z" fill="#e0a43a" transform={`rotate(${flap * 30} 140 100)`} /><polygon points="90,110 40,96 50,128" fill="#e0a43a" /></g></Box>;
}

/** Floating hearts / sparkles / question marks around a point; loops forever. */
export function Emotes({t, kind = 'sparkle', n = 6}) {
  const glyph = {sparkle: 'M0,-14 L4,-4 L14,0 L4,4 L0,14 L-4,4 L-14,0 L-4,-4Z', heart: 'M0,10 C-18,-4 -10,-18 0,-8 C10,-18 18,-4 0,10Z', plus: 'M-4,-12 H4 V-4 H12 V4 H4 V12 H-4 V4 H-12 V-4 H-4Z'}[kind];
  const col = {sparkle: S.gold, heart: '#e8506a', plus: S.green}[kind];
  return <Box vb="0 0 300 300">{Array.from({length: n}, (_, i) => { const p = (t * .35 + i / n) % 1, a = hash(i) * 6.28; return <path key={i} d={glyph} fill={col} opacity={Math.sin(p * Math.PI)} transform={`translate(${150 + Math.cos(a) * (40 + p * 90)} ${170 - p * 120 + Math.sin(a) * 20}) scale(${.6 + p * .9}) rotate(${p * 90})`} />; })}</Box>;
}

export const PROPS2 = (t) => [['funnel', <Funnel t={t} />, 1], ['university', <University t={t} year="2010" />, 1], ['bird', <Flyer t={t} />, 1], ['plane', <Flyer t={t} kind="plane" />, 1], ['hearts', <Emotes t={t} kind="heart" />, 1], ['sparkle', <Emotes t={t} />, 1]];

import React from 'react';
import {clamp, ease, hash, lerp, prog} from '../explainer/anim.mjs';
import {S} from './theme.mjs';

const SH = `drop-shadow(8px 10px 5px ${S.shadow})`;
const Box = ({vb = '0 0 400 400', children}) => <svg viewBox={vb} width="100%" height="100%" style={{overflow: 'visible', filter: SH}}>{children}</svg>;

/** Pill tag ("GAMER", "ACTION") centred at (0,0). */
export function Tag({text, tone = 'gold', w}) {
  const bg = {gold: S.gold, orange: S.orange, blue: S.blue, green: S.green, red: S.red, white: '#f2f2ee'}[tone] || tone, fg = tone === 'white' || tone === 'gold' ? '#3a2a10' : '#fff';
  const width = w || 26 + text.length * 15;
  return <g><rect x={-width / 2} y="-15" width={width} height="30" rx="15" fill={bg} /><text y="7" textAnchor="middle" fontSize="19" fontWeight="900" fill={fg} fontFamily="Nunito, Arial">{text}</text></g>;
}

/** Round check / cross badge that pops in. */
export function Badge({kind = 'check', t = 0, at = 0, r = 22}) {
  const p = ease.back(prog(t, at, at + .3)); if (p <= 0) return null;
  const c = kind === 'x' ? S.red : S.green;
  return <g transform={`scale(${p})`}><circle r={r} fill={c} stroke="#fff" strokeWidth="4" />
    {kind === 'x' ? <path d={`M${-r * .38},${-r * .38} L${r * .38},${r * .38} M${r * .38},${-r * .38} L${-r * .38},${r * .38}`} stroke="#fff" strokeWidth="6" strokeLinecap="round" />
      : <path d={`M${-r * .4},0 L${-r * .08},${r * .32} L${r * .45},${-r * .3}`} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />}</g>;
}

/** Monitor showing a game. kind: 'shooter' | 'tetris' | 'blank'. viewBox 480x320. */
export function Monitor({t, kind = 'shooter', on = true}) {
  const ex = 240 + Math.sin(t * 1.6) * 70, ey = 138 + Math.sin(t * 2.3) * 14, shot = (t % 1.1) < .09;
  const stars = Array.from({length: 14}, (_, i) => { const ph = (t * .45 + hash(i)) % 1, side = i % 2 ? 1 : -1; return {x: 240 + side * (30 + ph * 190 * (.5 + hash(i + 3) * .5)), y: 120 + ph * 90 * (hash(i + 9) * .8 + .3), r: .8 + ph * 3.2, o: Math.min(1, ph * 3)}; });
  const tet = Array.from({length: 22}, (_, i) => { const col = i % 7, ph = (t * .5 + hash(i) * 4) % 4, fall = Math.min(1, ph / 3) ; const rest = 4 + Math.floor(i / 7) * 0, y = lerp(30, 250 - Math.floor(i / 7) * 24, fall);
    return {x: 128 + col * 32, y, c: [S.orange, S.teal, S.gold, S.blue, S.purple, S.red, S.green][(i * 3) % 7]}; });
  return <Box vb="0 0 480 320"><rect x="0" y="0" width="480" height="320" rx="22" fill="#1a2c34" />
    <rect x="14" y="14" width="452" height="292" rx="12" fill={on ? '#22404c' : '#0c1519'} />
    {on && kind === 'shooter' && <g clipPath="url(#scr)"><clipPath id="scr"><rect x="14" y="14" width="452" height="292" rx="12" /></clipPath>
      <polygon points="14,14 190,112 190,210 14,306" fill="#1b323c" /><polygon points="466,14 290,112 290,210 466,306" fill="#1b323c" />
      <rect x="190" y="112" width="100" height="98" fill="#0c171c" />
      {[0, 1, 2, 3, 4, 5].map(i => { const p = ((t * .6 + i / 6) % 1) ** 1.8, y = 210 + p * 96, w = 100 + p * 352; return <rect key={i} x={240 - w / 2} y={y} width={w} height={3 + p * 5} fill="#3e8a90" opacity={.35 + p * .55} />; })}
      {stars.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={q.r} fill={S.gold} opacity={q.o * .85} />)}
      <g transform={`translate(${ex} ${ey})`}><g stroke="#cfd6dc" strokeWidth="3"><line x1="-24" x2="-6" y1="-30" y2="-30" /><line x1="6" x2="24" y1="-30" y2="-30" /></g>
        <circle r="24" fill="#e9eef0" /><circle r="12" fill={S.orange} /><circle r="5" fill="#fff" /></g>
      <g transform={`translate(${ex * .92 + 240 * .08} ${ey + 4})`} stroke="#fff" strokeWidth="3.5" fill="none"><circle r="17" /><path d="M-26,0 H-10 M10,0 H26 M0,-26 V-10 M0,10 V26" strokeLinecap="round" /></g>
      {shot && <circle cx={ex} cy={ey} r="34" fill="#fff" opacity=".6" />}
      <g transform="translate(330 262) rotate(-14)"><rect width="150" height="34" rx="12" fill="#6c808a" /><rect x="-4" y="6" width="44" height="22" rx="9" fill={S.teal} /></g>
      <rect x="40" y="270" width="110" height="10" rx="4" fill="#0c171c" /><rect x="40" y="270" width={110 * (.45 + .4 * Math.abs(Math.sin(t * .6)))} height="10" rx="4" fill={S.teal} /></g>}
    {on && kind === 'tetris' && <g><rect x="110" y="26" width="260" height="270" rx="6" fill="#16262e" />
      {tet.map((b, i) => <rect key={i} x={b.x} y={b.y} width="28" height="22" rx="5" fill={b.c} />)}</g>}
  </Box>;
}

/** Attention-test lens: a dark disc with a ring, glowing field of view, dots, optional counter/label/badge. */
export function Lens({t, label = '', tone = 'gold', field = .5, dots = 5, counter = null, badge = null, at = 0}) {
  const enter = ease.back(prog(t, at, at + .4)), fieldR = 150 * field * (1 + .03 * Math.sin(t * 3));
  return <Box><g transform={`translate(200 190) scale(${enter})`}>
    <circle r="150" fill="#05141a" stroke="#eef1ee" strokeWidth="9" />
    <defs><radialGradient id="lg"><stop offset="0" stopColor="#d9b25a" stopOpacity=".95" /><stop offset=".7" stopColor="#8a6a30" stopOpacity=".55" /><stop offset="1" stopColor="#8a6a30" stopOpacity="0" /></radialGradient></defs>
    <circle r={fieldR} fill="url(#lg)" /><circle r={fieldR} fill="none" stroke="#caa54e" strokeWidth="2.5" strokeDasharray="6 6" transform={`rotate(${t * 12})`} />
    {Array.from({length: dots}, (_, i) => { const a = hash(i * 3) * 6.28 + t * .3, r = (30 + hash(i) * 95) * Math.max(.4, field + .25), tw = .55 + .45 * Math.sin(t * 4 + i);
      return <circle key={i} cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={6 + hash(i + 2) * 3} fill="#fff" opacity={tw} />; })}
    {counter !== null && <g transform="translate(112 -112)"><circle r="24" fill={tone === 'red' ? S.red : S.green} stroke="#fff" strokeWidth="4" /><text y="9" textAnchor="middle" fontSize="28" fontWeight="900" fill="#fff" fontFamily="Nunito, Arial">{counter}</text></g>}
    {badge && <g transform="translate(112 112)"><Badge kind={badge} t={t} at={at + .6} /></g>}
    {label && <g transform="translate(0 140)"><Tag text={label} tone={tone} /></g>}</g></Box>;
}

/** Pink brain with headphones. glow: 0..1 lights the frontal lobe; regions pulse. */
export function Brain({t, glow = 0, headphones = true, tint = 'pink'}) {
  const pulse = 1 + .018 * Math.sin(t * 2.4), body = tint === 'olive' ? '#a9a24c' : S.pink, lo = tint === 'olive' ? '#7d7a30' : S.pinkLo;
  return <Box><g transform={`translate(200 190) scale(${pulse}) translate(-200 -190)`}>
    <path d="M70,210 C40,150 70,70 150,62 C200,30 280,40 310,95 C362,105 378,175 346,225 C338,262 300,282 262,272 L230,286 C190,296 150,284 128,262 C92,262 74,240 70,210Z" fill={body} />
    <path d="M232,252 C262,246 318,262 336,290 C318,316 258,318 230,298Z" fill={lo} />
    <path d="M214,282 L238,282 C246,330 242,360 232,392 L212,392 C204,360 208,320 214,282Z" fill={body} />
    <g fill="none" stroke={lo} strokeWidth="3" strokeLinecap="round" opacity=".85"><path d="M110,150 C140,120 170,150 200,120 C230,95 260,120 290,100" /><path d="M96,200 C130,180 160,215 195,185 C225,160 262,196 322,160" /><path d="M130,246 C165,228 200,250 235,232 C262,220 290,236 318,222" /><path d="M150,92 C170,110 160,140 182,152" /><path d="M255,70 C240,100 270,118 256,150" /></g>
    {glow > 0 && <><circle cx="120" cy="165" r={70 + 8 * Math.sin(t * 5)} fill={S.gold} opacity={.28 * glow} /><circle cx="120" cy="165" r={38} fill="#fff3b0" opacity={.5 * glow} /></>}
    {headphones && <g><path d="M214,56 Q214,40 214,36 L214,150" stroke="#2f8f94" strokeWidth="14" fill="none" strokeLinecap="round" /><rect x="190" y="128" width="50" height="62" rx="20" fill={S.teal} /><circle cx="214" cy="160" r="12" fill={S.tealLo} /><circle cx="214" cy="160" r="6" fill="#bfe9e8" />
      <path d="M190,180 Q150,214 120,206" stroke="#1c2330" strokeWidth="4" fill="none" strokeLinecap="round" /></g>}
  </g></Box>;
}

/** Analogue clock whose sector fills to `frac` (0..1 of 12 h), with ticking hand. */
export function Clock({t, frac = .5, label = ''}) {
  const a = (frac * 360) * ease.out(prog(t, 0, .8)), hand = a + Math.sin(t * 3) * 1.2;
  const pt = d => [200 + 120 * Math.sin(d * Math.PI / 180), 200 - 120 * Math.cos(d * Math.PI / 180)];
  const [x, y] = pt(a);
  return <Box><circle cx="200" cy="200" r="150" fill="#f4f1e8" stroke="#d8d4c8" strokeWidth="10" />
    <path d={`M200,200 L200,80 A120,120 0 ${a > 180 ? 1 : 0} 1 ${x},${y}Z`} fill={S.gold} opacity=".9" />
    {Array.from({length: 12}, (_, i) => <line key={i} x1="200" x2="200" y1="62" y2={i % 3 ? 72 : 78} stroke="#3a3a3a" strokeWidth={i % 3 ? 4 : 7} strokeLinecap="round" transform={`rotate(${i * 30} 200 200)`} />)}
    <line x1="200" y1="200" x2="200" y2="90" stroke="#2a2a2a" strokeWidth="8" strokeLinecap="round" transform={`rotate(${hand} 200 200)`} /><circle cx="200" cy="200" r="11" fill="#2a2a2a" />
    {label && <g transform="translate(200 372)"><Tag text={label} tone="white" /></g>}</Box>;
}

/** Row of n boxes that tick off one by one (days of practice). */
export function DayBoxes({t, n = 10, doneBy = 1, speed = .22}) {
  return <svg viewBox={`0 0 ${n * 46 + 10} 70`} width="100%" height="100%" style={{overflow: 'visible', filter: SH}}>{Array.from({length: n}, (_, i) => {
    const p = ease.back(prog(t, i * speed, i * speed + .25)) * doneBy, e = ease.out(prog(t, i * .05, i * .05 + .2));
    return <g key={i} transform={`translate(${5 + i * 46} 12) scale(${e})`} opacity={e}><rect width="38" height="42" rx="8" fill="#fbf6e8" /><rect width="38" height="11" rx="5" fill={S.orange} />
      {p > .01 && <g transform={`translate(19 26) scale(${p})`}><circle r="12" fill={S.green} /><path d="M-5,0 L-1,4 L6,-4" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></g>}</g>; })}</svg>;
}

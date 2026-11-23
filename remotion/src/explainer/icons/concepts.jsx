import React from 'react';
import {clamp, ease, hash, lerp, prog} from '../anim.mjs';
import {C} from './theme.mjs';
import {Bar} from './finance.jsx';

const Svg = ({children}) => <svg viewBox="0 0 400 400" width="100%" height="100%" style={{overflow: 'visible'}}>{children}</svg>;

/** Gold bar inside a shield; the shield cracks and shatters when `crack` is true. */
export function ShieldCrack({t, d, crack = true}) {
  const enter = prog(t, .05, .5, ease.back), t0 = d * .5, c = crack ? prog(t, t0, t0 + .9, ease.out) : 0;
  const ramp = crack ? prog(t, t0 - .7, t0) : 0, shake = ramp * (1 - (c > 0 ? 1 : 0));          // tremble builds, then stops on impact
  const flash = crack ? Math.max(0, 1 - Math.abs(t - t0) / .22) : 0;
  const pulse = .5 + .5 * Math.sin(t * 5);
  const shards = c > 0 ? Array.from({length: 11}, (_, i) => { const a = i / 11 * Math.PI * 2 + hash(i) * .5, r = c * (60 + 70 * hash(i + 2));
    return {x: Math.cos(a) * r + 6 * Math.cos(t * 2 + i), y: Math.sin(a) * r + 90 * c * c + 7 * Math.sin(t * 2.6 + i), rot: c * (hash(i + 3) * 200 - 100) + t * (hash(i + 8) * 50 - 25), s: .9 - c * .15}; }) : [];
  const barY = 10 + c * 70 + (c >= 1 ? 6 * Math.sin(t * 3) : 0), barRot = c * Math.sin(t * 2.2) * 9;
  return <Svg><g transform={`translate(${200 + Math.sin(t * 40) * 3 * shake} ${200}) rotate(${Math.sin(t * 33) * 2.6 * shake}) scale(${.6 + .4 * enter})`} opacity={clamp(enter * 2)}>
    <circle r={150 + 14 * pulse} fill="none" stroke="#8da0ff" strokeWidth="6" opacity={(1 - c) * (.18 + .25 * pulse)} />
    <g opacity={1 - c * .95}><path d="M0,-150 L120,-105 L120,10 Q120,100 0,160 Q-120,100 -120,10 L-120,-105 Z" fill="#b6c3ff" stroke="#6f83ec" strokeWidth="8" strokeLinejoin="round" />
      <path d="M0,-118 L92,-84 L92,8 Q92,82 0,128 Q-92,82 -92,8 L-92,-84 Z" fill="none" stroke="#fff" strokeWidth="4" opacity=".55" /></g>
    {shards.map((q, i) => <polygon key={i} points="-16,-11 18,-15 11,16 -14,13" fill="#b6c3ff" stroke="#6f83ec" strokeWidth="4" transform={`translate(${q.x} ${q.y}) rotate(${q.rot}) scale(${q.s})`} opacity={1 - c * .35} />)}
    {crack && <polyline points="-10,-140 14,-70 -16,-20 18,40 -6,100" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity={Math.max(c, ramp * .8) * (1 - c)} strokeDasharray="400" strokeDashoffset={(1 - Math.max(c, ramp)) * 400} />}
    {flash > 0 && <circle r={40 + 150 * (1 - flash)} fill="#fff" opacity={flash * .85} />}
    <g transform={`translate(0 ${barY}) rotate(${barRot})`}><Bar x={-70} y={-25} w={140} h={66} /></g></g></Svg>;
}

/** Conical flask filling with liquid and bubbles; a gold bar is produced at the neck when `makes` is set. */
export function Flask({t, d, makes = 'gold'}) {
  const fill = prog(t, .2, 1.1, ease.out), bar = prog(t, 1.2, 1.8, ease.back);
  const lvl = lerp(330, 235, fill) + 2.5 * Math.sin(t * 4);
  const bubbles = Array.from({length: 7}, (_, i) => { const ph = (t * .7 + hash(i) * 3) % 1; return {x: 150 + hash(i + 9) * 100, y: 322 - ph * (322 - lvl - 6), r: 4 + hash(i + 4) * 6, o: fill > .2 ? 1 - ph * .6 : 0}; });
  return <Svg>
    <clipPath id="fl"><polygon points="170,150 230,150 230,215 322,335 78,335 170,215" /></clipPath>
    <g clipPath="url(#fl)"><rect x="60" y={lvl} width="280" height="200" fill={C.gold} />{bubbles.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={b.r} fill="#fff" opacity={b.o * .75} />)}</g>
    <polyline points="170,95 170,215 78,335 322,335 230,215 230,95" fill="none" stroke={C.navy} strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" />
    <line x1="160" x2="240" y1="95" y2="95" stroke={C.navy} strokeWidth="9" strokeLinecap="round" />
    {makes && <g transform={`translate(0 ${(1 - bar) * 50 + 5 * Math.sin(t * 3)})`} opacity={clamp(bar * 2)}><Bar x={135} y={30} w={130} h={62} /></g>}</Svg>;
}

/** Semicircle gauge Low -> High; needle swings, `to` is 0..1 (0 = Low). Colours: red, amber, green. */
export function Gauge({t, d, to = 0.12, from = 0.7}) {
  const sw = ease.inOut(prog(t, .25, d * .75)), v = lerp(from, to, sw), ang = lerp(-180, 0, v) + (sw > .98 ? 2.2 * Math.sin(t * 13) : 0);
  const arc = (a0, a1, col) => { const r = 140, p = a => [200 + r * Math.cos(a * Math.PI / 180), 250 + r * Math.sin(a * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1); return <path d={`M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`} fill="none" stroke={col} strokeWidth="38" />; };
  const enter = prog(t, 0, .35, ease.out);
  return <Svg><g opacity={enter}>{arc(-180, -125, C.red)}{arc(-122, -58, '#e0a82e')}{arc(-55, 0, C.green)}
    <g transform={`translate(200 250) rotate(${ang})`}><polygon points="0,-9 -118,0 0,9" fill={C.navy} /><circle r="16" fill={C.navy} /></g>
    <text x="52" y="292" fontSize="26" fontWeight="700" fill="#333" fontFamily="Arial">Low</text><text x="305" y="292" fontSize="26" fontWeight="700" fill="#333" fontFamily="Arial">High</text></g></Svg>;
}

/** Radar with a sweeping beam, a target locking on, and optional red corner brackets. */
export function Radar({t, d, lock = true}) {
  const sweep = (t * 220) % 360, k = lock ? prog(t, d * .45, d * .7, ease.out) : 0, enter = prog(t, 0, .35, ease.out);
  return <Svg><g opacity={enter}>
    <circle cx="200" cy="200" r="150" fill="#f7f7f9" stroke="#d4d4da" strokeWidth="5" />
    {[100, 50].map(r => <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#dcdce2" strokeWidth="3" />)}
    <line x1="50" x2="350" y1="200" y2="200" stroke="#dcdce2" strokeWidth="3" /><line x1="200" x2="200" y1="50" y2="350" stroke="#dcdce2" strokeWidth="3" />
    <path d="M200,200 L350,200 A150,150 0 0 0 313,98 Z" fill="#9aa0b8" opacity=".35" transform={`rotate(${sweep} 200 200)`} />
    <circle cx="258" cy="150" r={7 + 3 * Math.sin(t * 8)} fill={C.red} />
    <circle cx="258" cy="150" r={8 + ((t * 45) % 45)} fill="none" stroke={C.red} strokeWidth="3" opacity={1 - ((t * 45) % 45) / 45} />
    {lock && <g opacity={k} transform={`translate(258 150) scale(${1.6 - .6 * k})`}>{[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], i) => <polyline key={i} points={`${a * 26},${b * 12} ${a * 26},${b * 26} ${a * 12},${b * 26}`} fill="none" stroke={C.red} strokeWidth="5" strokeLinecap="round" />)}</g>}</g></Svg>;
}

/** Browser window with a padlock; when `hacked` the lock turns red and cash flies out. */
export function LockHack({t, d, hacked = true}) {
  const h = hacked ? prog(t, d * .4, d * .6, ease.out) : 0, enter = prog(t, 0, .4, ease.back);
  const cash = Array.from({length: 7}, (_, i) => { const p = prog(t, d * .45 + i * .07, d * .9, ease.out); const a = -Math.PI / 2 + (i - 3) * .42;
    return {x: 200 + Math.cos(a) * 150 * p, y: 220 + Math.sin(a) * 150 * p + 6 * Math.sin(t * 3 + i), r: (hash(i) * 80 - 40) * p, o: p > 0 ? 1 - p * .15 : 0}; });
  return <Svg><g transform={`translate(200 210) scale(${.8 + .2 * enter})`} opacity={clamp(enter * 2)}>
    <rect x="-170" y="-130" width="340" height="260" rx="14" fill="#fff" stroke="#dcdce2" strokeWidth="4" />
    <rect x="-170" y="-130" width="340" height="30" rx="14" fill="#f1f1f4" />{[-150, -132, -114].map((x, i) => <circle key={i} cx={x} cy="-115" r="5" fill={['#ef6b6b', '#f1c34c', '#5fcf7b'][i]} />)}
    <g opacity={1 - h * .0}><rect x="-52" y="-10" width="104" height="80" rx="12" fill={h > .3 ? C.red : C.navy} />
      <path d={h > .3 ? 'M-30,-10 V-40 a30,30 0 0 1 60,0' : 'M-30,-10 V-40 a30,30 0 0 1 60,0 V-10'} fill="none" stroke={h > .3 ? C.red : C.navy} strokeWidth="14" strokeLinecap="round" />
      <circle cy="26" r="10" fill="#fff" /><rect x="-4" y="26" width="8" height="24" rx="3" fill="#fff" /></g></g>
    {h > .3 && <circle cx="200" cy="225" r={60 + 30 * ((t * 1.4) % 1)} fill="none" stroke={C.red} strokeWidth="4" opacity={.8 * (1 - ((t * 1.4) % 1))} />}
    {cash.map((c, i) => <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${c.r})`} opacity={c.o}><rect x="-26" y="-14" width="52" height="28" rx="4" fill="#4cc46a" stroke="#2f8f4a" strokeWidth="3" /><circle r="8" fill="#2f8f4a" opacity=".6" /></g>)}</Svg>;
}

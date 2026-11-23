import React from 'react';
import {clamp, ease, hash, lerp, prog} from '../anim.mjs';
import {C} from './theme.mjs';

const Svg = ({children}) => <svg viewBox="0 0 400 400" width="100%" height="100%" style={{overflow: 'visible'}}>{children}</svg>;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 12-month grid; months turn green one after another (an emergency fund filling up). */
export function CalendarFill({t, d, months = 12}) {
  return <Svg>{MONTHS.map((m, i) => {
    const on = months > i && t > .25 + i * .16, pop = prog(t, .25 + i * .16, .25 + i * .16 + .25, ease.back), enter = prog(t, i * .03, i * .03 + .3, ease.out);
    const x = 40 + (i % 4) * 86, y = 80 + Math.floor(i / 4) * 78;
    return <g key={i} opacity={enter} transform={`translate(${x + 38} ${y + 28}) scale(${on ? .9 + .1 * pop + .025 * Math.sin(t * 3.5 + i * .7) : 1}) translate(-38 -28)`}>
      <rect width="76" height="56" rx="10" fill={on ? '#22c55e' : '#fff'} stroke={on ? '#15803d' : '#dcdce2'} strokeWidth="3" />
      <text x="38" y="35" textAnchor="middle" fontSize="22" fontWeight="800" fill={on ? '#fff' : '#a9a9b3'} fontFamily="Arial">{m}</text></g>; })}</Svg>;
}

/** Car and house tiles; a red cross slams over each when `cross` is set. */
export function CarHouseX({t, d, cross = true}) {
  const tile = (x, i, art, label) => { const e = prog(t, i * .15, i * .15 + .4, ease.back), c = cross ? prog(t, .7 + i * .25, .7 + i * .25 + .22, ease.back) : 0;
    return <g transform={`translate(${x} 200) scale(${.7 + .3 * e})`} opacity={clamp(e * 2)}>
      <rect x="-80" y="-90" width="160" height="180" rx="16" fill="#fff" stroke="#e1e1e6" strokeWidth="3" />{art}
      <text y="76" textAnchor="middle" fontSize="22" fontWeight="700" fill="#555" fontFamily="Arial">{label}</text>
      {c > 0 && <g opacity={clamp(c * 2)} transform={`rotate(${c >= 1 ? 3 * Math.sin(t * 9 + i) : 0}) scale(${2 - c})`}><line x1="-62" y1="-70" x2="62" y2="62" stroke={C.red} strokeWidth="14" strokeLinecap="round" /><line x1="62" y1="-70" x2="-62" y2="62" stroke={C.red} strokeWidth="14" strokeLinecap="round" /></g>}</g>; };
  const car = <g transform="translate(0 -8)"><path d="M-58,14 L-48,-14 Q-42,-30 -22,-30 L22,-30 Q42,-30 50,-12 L60,14 Z" fill="#3f6fe0" /><rect x="-62" y="10" width="124" height="22" rx="8" fill="#3f6fe0" />
    <rect x="-34" y="-24" width="30" height="20" rx="4" fill="#cfe0ff" /><rect x="2" y="-24" width="30" height="20" rx="4" fill="#cfe0ff" /><circle cx="-34" cy="34" r="14" fill="#2a2b44" /><circle cx="34" cy="34" r="14" fill="#2a2b44" /></g>;
  const house = <g transform="translate(0 -6)"><polygon points="-62,-4 0,-52 62,-4" fill="#e04b3a" /><rect x="-48" y="-6" width="96" height="62" fill="#f6e1c3" /><rect x="-12" y="18" width="24" height="38" fill="#c98d4d" /><rect x="-40" y="4" width="20" height="18" fill="#cfe0ff" /><rect x="22" y="4" width="20" height="18" fill="#cfe0ff" /></g>;
  return <Svg>{tile(110, 0, car, 'Car')}{tile(290, 1, house, 'House')}</Svg>;
}

/** Three investors, a falling market tile and a cash tile; money flows from market to cash. */
export function InvestorsCash({t, d}) {
  const e = prog(t, 0, .4, ease.out), flow = t < .6 ? 0 : (((t - .6) / 1.3) % 1);
  const person = x => <g key={x} transform={`translate(${x} 80)`}><circle cy="-14" r="14" fill={C.navy} /><path d="M-18,24 Q-18,0 0,0 Q18,0 18,24 Z" fill={C.navy} /><path d="M-4,2 L0,14 L4,2 Z" fill={C.red} /></g>;
  const bills = Array.from({length: 6}, (_, i) => { const p = clamp(flow * 1.4 - i * .12); return p > 0 && p < 1.0 ? <g key={i} transform={`translate(${lerp(100, 300, p)} ${lerp(260, 250, p) - Math.sin(p * Math.PI) * 60}) rotate(${p * 160 * (i % 2 ? 1 : -1)})`}><rect x="-18" y="-10" width="36" height="20" rx="3" fill="#4cc46a" stroke="#2f8f4a" strokeWidth="2" /></g> : null; });
  return <Svg><g opacity={e}>{[130, 200, 270].map(person)}<text x="200" y="128" textAnchor="middle" fontSize="20" fontWeight="700" fill="#555" fontFamily="Arial">Big investors</text>
    <rect x="40" y="200" width="120" height="110" rx="12" fill="#fff" stroke="#e1e1e6" strokeWidth="3" /><polyline points="55,225 90,240 110,270 150,290" fill="none" stroke={C.redSoft} strokeWidth="5" strokeLinecap="round" />
    <rect x="240" y="200" width="120" height="110" rx="12" fill="#fff" stroke="#e1e1e6" strokeWidth="3" /><circle cx="300" cy="255" r="34" fill="#eef1ee" stroke="#cdd3cd" strokeWidth="3" />
    <g transform={`translate(300 255) rotate(${t * 120})`}>{[0, 120, 240].map(a => <ellipse key={a} cy="-16" rx="7" ry="14" fill="#22c55e" transform={`rotate(${a})`} />)}</g></g>{bills}
    {t > d * .8 && <g opacity={prog(t, d * .82, d * .92)} transform="translate(300 340)"><rect x="-70" y="-16" width="140" height="32" rx="16" fill="#22c55e" /><text y="7" textAnchor="middle" fontSize="19" fontWeight="800" fill="#fff" fontFamily="Arial">Sitting in cash</text></g>}</Svg>;
}

/** Line chart draws itself; a dashed 'expectation' line and an arrow show where people thought it was going. */
export function ExpectLine({t, d, label = 'People expected'}) {
  const n = 40, pts = Array.from({length: n}, (_, i) => { const u = i / (n - 1); return [50 + u * 300, 300 - (u * 80 + 14 * Math.sin(u * 18) * (1 - u * .3) + u * u * 40)]; });
  const draw = prog(t, .15, d * .55, ease.inOut), k = Math.max(2, Math.floor(draw * n)), path = pts.slice(0, k).map(p => p.join(',')).join(' ');
  const ex = prog(t, d * .55, d * .85, ease.out);
  return <Svg><rect x="20" y="50" width="360" height="300" rx="20" fill="#fff" />
    <polyline points={path} fill="none" stroke={C.ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    {draw >= 1 && (() => { const q = pts[Math.min(n - 1, Math.floor(((t * .45) % 1) * n))]; return <circle cx={q[0]} cy={q[1]} r={8 + 2 * Math.sin(t * 8)} fill={C.blue} stroke="#fff" strokeWidth="3" />; })()}
    <line x1="350" y1="180" x2={lerp(350, 350, ex)} y2={lerp(180, 90, ex)} stroke={C.blue} strokeWidth="5" strokeDasharray="10 8" opacity={ex} />
    <line x1="50" y1="300" x2={lerp(50, 350, ex)} y2={lerp(300, 90, ex)} stroke={C.blue} strokeWidth="4" strokeDasharray="10 8" opacity={ex * .9} />
    <g opacity={ex}><rect x="200" y="62" width="150" height="30" rx="15" fill={C.blueSoft} /><text x="275" y="83" textAnchor="middle" fontSize="17" fontWeight="800" fill={C.blue} fontFamily="Arial">{label}</text></g></Svg>;
}

/** Big 'Why?' with question marks drifting around it. */
export function WhyMark({t, d, text = 'Why?'}) {
  const e = prog(t, .05, .5, ease.back);
  return <Svg><g transform={`translate(200 210) rotate(${Math.sin(t * 3) * 2.5}) scale(${.5 + .5 * e})`} opacity={clamp(e * 2)}><text textAnchor="middle" fontSize="92" fontWeight="900" fill={C.ink} fontFamily="Arial">{text}</text></g>
    {[[70, 100], [330, 130], [60, 300], [340, 310], [200, 60]].map(([x, y], i) => <text key={i} x={x} y={y - 12 * Math.sin(t * 2 + i)} textAnchor="middle" fontSize={34 + hash(i) * 20} fontWeight="800" fill="#c4c4cc" opacity={prog(t, .3 + i * .1, .6 + i * .1)} fontFamily="Arial" transform={`rotate(${hash(i + 2) * 40 - 20} ${x} ${y})`}>?</text>)}</Svg>;
}

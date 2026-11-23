import React from 'react';
import {hash} from '../explainer/anim.mjs';
import {Mouth} from './Mouths.jsx';
import {S} from './theme.mjs';

/**
 * Flat-vector person, 400x560 box, feet at y=560. Pure function of t (seconds).
 * props: skin, hair {style:'short'|'bob'|'curly'|'bun'|'bald'|'long', color}, shirt, pants, mood, mouth (A-H/X from a mouth track),
 *        headphones, glasses, controller, view 'front'|'back', look [dx,dy] in -1..1, arms 'down'|'cheer'|'hold', seed.
 * Alive by default: breathing, head bob, blinking at irregular intervals, drifting gaze, arm sway, thumb jiggle on the controller.
 */
const BROWS = {neutral: [-2, -2], smile: [-4, -4], worried: [8, 8], sad: [9, 9], surprised: [-9, -9], cheer: [-6, -6], angry: [-9, 9]};

function Hair({style, color, back}) {
  if (style === 'bald') return null;
  if (back) {                                                       // hair BEHIND the head (long / bob)
    if (style === 'bob') return <path d="M105,150 Q105,60 200,60 Q295,60 295,150 L295,238 Q270,244 262,224 L262,150 L138,150 L138,224 Q130,244 105,238Z" fill={color} />;
    if (style === 'long') return <path d="M102,150 Q102,56 200,56 Q298,56 298,150 L304,300 Q250,316 246,260 L154,260 Q150,316 96,300Z" fill={color} />;
    if (style === 'bun') return <circle cx="200" cy="52" r="30" fill={color} />;
    return null;
  }
  if (style === 'curly') return <g fill={color}>{Array.from({length: 11}, (_, i) => { const a = Math.PI * (1.05 + i * .09), r = 84 + hash(i + 4) * 8; return <circle key={i} cx={200 + Math.cos(a) * r} cy={166 + Math.sin(a) * r} r={30 + hash(i) * 8} />; })}<path d="M114,150 Q200,70 286,150 Q250,104 200,108 Q150,104 114,150Z" /></g>;
  return <path d={style === 'short' ? 'M108,160 Q106,70 200,70 Q294,70 292,160 Q272,112 200,114 Q128,112 108,160Z' : 'M106,168 Q100,60 200,62 Q300,60 294,168 Q276,104 232,104 Q196,138 150,116 Q120,124 106,168Z'} fill={color} />;
}

export function Person({t = 0, skin = S.skin.brown, hair = {style: 'short', color: S.hair.black}, shirt = S.blue, pants = '#2c3560', mood = 'neutral', mouth = 'X',
  headphones = false, glasses = false, controller = false, view = 'front', look = [0, 0], arms = 'down', seed = 1, shadow = true}) {
  const breathe = Math.sin(t * 2.2 + seed) * 1.6, bob = Math.sin(t * 1.7 + seed * 2) * 2.2, tilt = Math.sin(t * 1.1 + seed) * 1.4;
  const blinkPhase = (t * .33 + hash(seed) * 5) % 1, blink = blinkPhase > .965 ? 0.1 : 1;
  const gaze = [look[0] * 7 + Math.sin(t * .8 + seed) * 2.5, look[1] * 5 + Math.sin(t * 1.3 + seed) * 1.5];
  const sway = Math.sin(t * 2 + seed) * 3, jig = controller ? Math.sin(t * 17 + seed) * 1.6 : 0;
  const brow = BROWS[mood] || BROWS.neutral, back = view === 'back';
  const cheer = arms === 'cheer' ? Math.sin(t * 6 + seed) * 5 : 0;
  const leftArm = arms === 'cheer' ? `M118,288 Q70,230 ${70 + cheer},170` : arms === 'hold' || controller ? 'M118,288 Q96,350 150,372' : `M118,288 Q100,350 ${104 + sway},408`;
  const rightArm = arms === 'cheer' ? `M282,288 Q330,230 ${330 - cheer},170` : arms === 'hold' || controller ? 'M282,288 Q304,350 250,372' : `M282,288 Q300,350 ${296 - sway},408`;
  const hand = (x, y) => <circle cx={x} cy={y} r="19" fill={skin} />;
  return (
    <svg viewBox="0 0 400 560" width="100%" height="100%" style={{overflow: 'visible', filter: shadow ? `drop-shadow(9px 11px 5px ${S.shadow})` : undefined}}>
      {/* legs */}
      <g><rect x="140" y="400" width="52" height="150" rx="14" fill={pants} /><rect x="208" y="400" width="52" height="150" rx="14" fill={pants} />
        <rect x="132" y="540" width="66" height="20" rx="10" fill="#e9e9ee" /><rect x="202" y="540" width="66" height="20" rx="10" fill="#e9e9ee" /></g>
      <g transform={`translate(0 ${breathe * .4})`}>
        {/* arms behind torso for 'down', in front for hold */}
        {!controller && arms !== 'hold' && <><path d={leftArm} fill="none" stroke={shirt} strokeWidth="44" strokeLinecap="round" />{hand(arms === 'cheer' ? 70 + cheer : 104 + sway, arms === 'cheer' ? 170 : 410)}
          <path d={rightArm} fill="none" stroke={shirt} strokeWidth="44" strokeLinecap="round" />{hand(arms === 'cheer' ? 330 - cheer : 296 - sway, arms === 'cheer' ? 170 : 410)}</>}
        <rect x="112" y="250" width="176" height={190} rx="46" fill={shirt} />
        <rect x="112" y="250" width="176" height="46" rx="30" fill="#fff" opacity=".08" />
        {(controller || arms === 'hold') && <><path d={leftArm} fill="none" stroke={shirt} strokeWidth="42" strokeLinecap="round" /><path d={rightArm} fill="none" stroke={shirt} strokeWidth="42" strokeLinecap="round" /></>}
        {controller && <g transform="translate(200 368)"><rect x="-70" y="-26" width="140" height="56" rx="28" fill="#2a2f3a" /><circle cx="-34" cy="-2" r="9" fill="#444b5a" /><circle cx="36" cy="-6" r="5" fill={S.gold} /><circle cx="46" cy="4" r="5" fill={S.orange} />
          <circle cx={-44 + jig} cy={4} r="19" fill={skin} /><circle cx={44 - jig} cy={4} r="19" fill={skin} /></g>}
        {!controller && arms === 'hold' && <>{hand(150, 372)}{hand(250, 372)}</>}
      </g>
      {/* head group */}
      <g transform={`translate(0 ${bob + breathe * .6}) rotate(${tilt} 200 240)`}>
        <rect x="178" y="226" width="44" height="40" rx="14" fill={skin} opacity=".92" />
        <Hair style={hair.style} color={hair.color} back />
        {headphones && <path d="M104,166 Q104,56 200,56 Q296,56 296,166" fill="none" stroke="#1c2330" strokeWidth="9" strokeLinecap="round" />}
        <circle cx="106" cy="172" r="19" fill={skin} opacity=".94" /><circle cx="294" cy="172" r="19" fill={skin} opacity=".94" />
        <ellipse cx="200" cy="168" rx="94" ry="98" fill={skin} />
        {headphones && <><rect x="86" y="140" width="34" height="62" rx="16" fill={S.teal} /><rect x="280" y="140" width="34" height="62" rx="16" fill={S.teal} />
          <rect x="86" y="140" width="14" height="62" rx="7" fill={S.tealLo} opacity=".6" />{!back && <path d="M92,196 Q96,236 150,236" fill="none" stroke="#1c2330" strokeWidth="5" strokeLinecap="round" />}{!back && <circle cx="152" cy="236" r="8" fill="#1c2330" />}</>}
        {back ? (hair.style === 'bald' ? null : <ellipse cx="200" cy="166" rx="96" ry="101" fill={hair.color} />) : <>
          <Hair style={hair.style === 'bob' || hair.style === 'long' ? 'bob-fringe' : hair.style} color={hair.color} />
          <circle cx="146" cy="196" r="17" fill="#e0443a" opacity={mood === 'smile' || mood === 'cheer' ? .3 : .18} /><circle cx="254" cy="196" r="17" fill="#e0443a" opacity={mood === 'smile' || mood === 'cheer' ? .3 : .18} />
          <g transform={`translate(${gaze[0]} ${gaze[1]})`}>
            <ellipse cx="160" cy="168" rx="9" ry={11 * blink} fill={S.ink} /><ellipse cx="240" cy="168" rx="9" ry={11 * blink} fill={S.ink} />
            <circle cx="163" cy={164} r="3" fill="#fff" opacity={blink > .5 ? .9 : 0} /><circle cx="243" cy={164} r="3" fill="#fff" opacity={blink > .5 ? .9 : 0} />
            <path d={`M140,${146 + brow[0] * .3} Q160,${138 - brow[0] * .5} 180,${146 - brow[0] * .6}`} fill="none" stroke={S.ink} strokeWidth="6" strokeLinecap="round" />
            <path d={`M220,${146 - brow[1] * .6} Q240,${138 - brow[1] * .5} 260,${146 + brow[1] * .3}`} fill="none" stroke={S.ink} strokeWidth="6" strokeLinecap="round" />
          </g>
          {glasses && <g fill="none" stroke="#2a1a14" strokeWidth="6"><circle cx="160" cy="168" r="27" /><circle cx="240" cy="168" r="27" /><path d="M187,166 Q200,158 213,166" /></g>}
          <g transform={`translate(200 ${222 + gaze[1] * .3})`}><Mouth shape={mouth} mood={mood} s={1.35} /></g></>}
      </g>
    </svg>);
}
export default Person;

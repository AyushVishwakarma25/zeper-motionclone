import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import * as P from './props1.jsx';
import {PROPS2} from './props2.jsx';
import {S} from './theme.mjs';

export function PropSheet({atSeconds = null}) {
  const f = useCurrentFrame(), {fps} = useVideoConfig(), t = atSeconds ?? f / fps;
  const items = [['monitor shooter', <P.Monitor t={t} kind="shooter" />, 2], ['monitor tetris', <P.Monitor t={t} kind="tetris" />, 2], ['lens', <P.Lens t={t} label="GAMER" field={.8} dots={6} counter={5} badge="check" />, 1],
    ['lens red', <P.Lens t={t} label="NON-GAMER" tone="blue" field={.4} dots={4} counter={3} badge="x" />, 1], ['brain', <P.Brain t={t} glow={1} />, 1], ['clock', <P.Clock t={t} frac={.4} label="10 h" />, 1],
    ['days', <P.DayBoxes t={t} n={10} />, 3], ...PROPS2(t)];
  let x = 10, y = 20, rowH = 0; const out = [];
  items.forEach(([name, el, span], i) => { const w = 225 * span - 10; if (x + w > 720) { x = 10; y += rowH + 30; rowH = 0; } const h = span === 3 ? 60 : span === 2 ? 150 : 225; rowH = Math.max(rowH, h);
    out.push(<div key={i} style={{position: 'absolute', left: x, top: y, width: w, height: h}}>{el}<div style={{position: 'absolute', top: h + 2, width: w, textAlign: 'center', color: '#8aa', fontSize: 15, fontFamily: 'Arial'}}>{name}</div></div>); x += w + 10; });
  return <AbsoluteFill style={{background: S.bg}}>{out}</AbsoluteFill>;
}
export default PropSheet;

import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ICONS} from './icons/index.js';
import {C} from './icons/theme.mjs';

/** Contact sheet of every catalog icon at one moment: for looking, and for Studio. */
export function IconSheet({atSeconds = null, d = 3}) {
  const f = useCurrentFrame(), {fps} = useVideoConfig(), t = atSeconds ?? f / fps;
  const ids = Object.keys(ICONS), cols = 3;
  return (
    <AbsoluteFill style={{background: C.bg, fontFamily: 'Arial'}}>
      {ids.map((id, i) => { const I = ICONS[id].C;
        return <div key={id} style={{position: 'absolute', left: 10 + (i % cols) * 235, top: 20 + Math.floor(i / cols) * 285, width: 225, height: 275}}>
          <div style={{width: 225, height: 225}}><I t={t} d={d} /></div>
          <div style={{textAlign: 'center', fontSize: 20, fontWeight: 700, color: '#333'}}>{id}</div></div>; })}
    </AbsoluteFill>);
}
export default IconSheet;

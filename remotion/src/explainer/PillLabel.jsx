import React from 'react';
import {ease, prog} from './anim.mjs';

/** Rounded pill, optionally with a coloured tag on the left ("News | Startup says ..."). Pops in with a small overshoot. */
export function PillLabel({text, tag = '', t = 0, at = 0.4, y = 1010, tone = 'dark', font = "Inter, 'Helvetica Neue', Arial, sans-serif"}) {
  const p = prog(t, at, at + .35, ease.back);
  if (p <= 0) return null;
  const bg = {dark: '#2a2b33', red: '#d62839', green: '#22c55e', white: '#ffffff'}[tone] || tone;
  const fg = tone === 'white' ? '#202020' : '#fff';
  return (
    <div style={{position: 'absolute', left: 0, width: 720, top: y, display: 'flex', justifyContent: 'center', fontFamily: font,
      opacity: Math.min(1, p * 1.5), transform: `scale(${.7 + .3 * p})`}}>
      {tag ? (
        <div style={{display: 'flex', alignItems: 'stretch', borderRadius: 14, overflow: 'hidden', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,.06)'}}>
          <div style={{background: '#c8141e', color: '#fff', fontWeight: 800, fontSize: 28, padding: '10px 22px'}}>{tag}</div>
          <div style={{color: '#202020', fontWeight: 700, fontSize: 26, padding: '10px 22px', display: 'flex', alignItems: 'center'}}>{text}</div>
        </div>
      ) : (
        <div style={{background: bg, color: fg, fontWeight: 800, fontSize: 26, padding: '9px 24px', borderRadius: 999}}>{text}</div>
      )}
    </div>
  );
}
export default PillLabel;

import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ease, hash, prog} from '../explainer/anim.mjs';
import {Person} from './Person.jsx';
import {ChunkCaption} from './ChunkCaption.jsx';
import {mouthAt} from '../layered.mjs';
import * as P1 from './props1.jsx';
import * as P2 from './props2.jsx';
import {S} from './theme.mjs';

/** kind -> {component, aspect (w/h)}. The Director may only use these ids (see app/science_catalog.json). */
export const KINDS = {
  person: {C: Person, aspect: 400 / 560}, monitor: {C: P1.Monitor, aspect: 1.5}, lens: {C: P1.Lens, aspect: 1}, brain: {C: P1.Brain, aspect: 1}, clock: {C: P1.Clock, aspect: 1},
  days: {C: P1.DayBoxes, aspect: 6.5}, funnel: {C: P2.Funnel, aspect: 1}, university: {C: P2.University, aspect: 4 / 3}, flyer: {C: P2.Flyer, aspect: 1.5}, emotes: {C: P2.Emotes, aspect: 1},
};

export const LAYOUTS = {   // slot centres in the 720x1280 design space, and the box each slot may fill
  single: {cx: [360], cy: 800, box: [560, 640]},
  split: {cx: [185, 535], cy: 800, box: [320, 520], divider: true},
  row: {cx: [120, 360, 600], cy: 800, box: [220, 380]},
};

export function slotRect(layout, i, kind, scale = 1) {
  const L = LAYOUTS[layout] || LAYOUTS.single, [bw, bh] = L.box, a = KINDS[kind].aspect;
  let w = bw, h = bw / a; if (h > bh) { h = bh; w = bh * a; }
  w *= scale; h *= scale;
  return {x: L.cx[i] - w / 2, y: L.cy - h / 2, w, h};
}

/** Speaking mouth: nine shapes swapped per ~90 ms while a word is spoken; rests (X) otherwise. A real Rhubarb track wins if given. */
export function speakingShape(words, t, track, fps = 30) {
  if (track) return mouthAt(track, Math.round(t * fps));
  const w = words.find(x => t >= x.start && t <= x.end + .05);
  if (!w) return 'X';
  return ['B', 'C', 'D', 'E', 'A', 'F', 'C', 'G'][Math.floor(hash(Math.floor(t * 11) + w.start * 7) * 8) % 8];
}

function Stage({t, scene}) {
  const L = LAYOUTS[scene.layout] || LAYOUTS.single;
  return <>
    <div style={{position: 'absolute', left: 60, top: 560, width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${S.disc} 0%, ${S.disc}00 72%)`, opacity: .9 + .1 * Math.sin(t * 1.5)}} />
    <div style={{position: 'absolute', left: 90, top: 1010, width: 540, height: 70, borderRadius: '50%', background: 'rgba(0,0,0,.28)', filter: 'blur(14px)'}} />
    {L.divider && <div style={{position: 'absolute', left: 358, top: 560, width: 4, height: 480, borderRadius: 2, background: '#1b4a4c', opacity: ease.out(prog(t, .1, .5))}} />}
  </>;
}

export function ScienceScene({scene = {}}) {
  const frame = useCurrentFrame(), {fps, width, height} = useVideoConfig(), t = frame / fps;
  const k = Math.min(width / 720, height / 1280), words = scene.words || [], slots = scene.slots || [];
  const push = 1 + .03 * Math.min(1, t / Math.max(1, scene.duration_seconds || 3));
  return (
    <AbsoluteFill style={{background: S.bg, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: (width - 720) / 2, top: (height - 1280) / 2, width: 720, height: 1280, transform: `scale(${k * push})`, transformOrigin: '50% 50%'}}>
        <Stage t={t} scene={scene} />
        {slots.map((s, i) => {
          const def = KINDS[s.kind]; if (!def) return null;
          const at = s.at ?? i * .25, lt = Math.max(0, t - at), e = ease.back(prog(t, at, at + .45)); if (e <= 0) return null;
          const r = slotRect(scene.layout, i, s.kind, s.scale || 1), bob = Math.sin(t * 2 + i * 1.7) * 5, props = {...(s.props || {}), t: lt};
          if (s.kind === 'person') { if (typeof props.skin === 'string' && S.skin[props.skin]) props.skin = S.skin[props.skin]; if (props.hair && S.hair[props.hair.color]) props.hair = {...props.hair, color: S.hair[props.hair.color]}; props.seed = props.seed ?? i + 1; if (s.talking) props.mouth = speakingShape(words, t, scene.mouth_track); }
          const C = def.C;
          return <div key={i} style={{position: 'absolute', left: r.x, top: r.y + bob, width: r.w, height: r.h, transformOrigin: '50% 100%', transform: `scale(${e}) rotate(${(1 - e) * -6}deg)`, opacity: Math.min(1, e * 2)}}><C {...props} /></div>;
        })}
        {(scene.labels || []).map((l, i) => { const e = ease.back(prog(t, l.at ?? .4, (l.at ?? .4) + .3)); return <div key={i} style={{position: 'absolute', left: l.x, top: l.y, transform: `translate(-50%,-50%) scale(${e})`}}><svg width="260" height="40" viewBox="-130 -20 260 40" style={{overflow: 'visible'}}><P1.Tag text={l.text} tone={l.tone || 'gold'} /></svg></div>; })}
        <ChunkCaption words={words} t={t} />
      </div>
    </AbsoluteFill>);
}
export default ScienceScene;

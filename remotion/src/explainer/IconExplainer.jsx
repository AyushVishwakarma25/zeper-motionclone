import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ease, lerp, prog} from './anim.mjs';
import {ICONS} from './icons/index.js';
import {C} from './icons/theme.mjs';
import {WordReveal} from './WordReveal.jsx';
import {PillLabel} from './PillLabel.jsx';
import {Backdrop, Sparkles} from './Ambient.jsx';
import {DynamicSvgIcon} from './DynamicSvgIcon.js';

/**
 * ICON_EXPLAINER scene. One headline revealed word by word, one flat icon acting out the idea, an optional pill.
 * scene = {duration_seconds, words:[{w,start,end}], icon:{id, params}, icons:[{id, params, x, y, size, from, to}], pill:{text, tag, tone, at},
 *          mode: 'light'|'hook', hook:{lines:[...]}}   // 'hook' = dark opening with a falling red line
 * Geometry follows the reference (720x1280): headline y 330, icon box 380px centred at y 670, pill y 890.
 */
const SPARK = {gold_bars: '#f5b932', flask: '#f5b932', shield_crack: '#8da0ff', ai_bars: '#5b7cfa', gauge: '#d62839', radar: '#d62839', lock_hack: '#d62839',
  calendar_fill: '#22c55e', bond: '#3b7a4a', candles: '#22c55e', silver_coin: '#9b9ba6', investors_cash: '#22c55e', car_house_x: '#d62839', expect_line: '#5b7cfa', why_mark: '#b9b9bd',
  city_map: '#3b82f6', stopwatch_timer: '#ef4444', delivery_scooter: '#22c55e', package_box: '#3b82f6', shopping_cart: '#22c55e', smartphone_app: '#3b82f6', store_warehouse: '#f59e0b', rocket_growth: '#f59e0b'};

function Icon({spec, t, d, box, index = 0}) {
  const entry = ICONS[spec.id];
  let I = entry?.C;
  if (!I && (spec.dynamic_svg || spec.svg_markup || spec.layers)) {
    const dynSpec = spec.dynamic_svg || spec;
    I = (props) => <DynamicSvgIcon spec={dynSpec} {...props} />;
  }
  if (!I) return <div style={{width: box, height: box, background: 'rgba(255,0,0,.3)', color: '#fff', fontSize: 28}}>UNKNOWN ICON {spec.id}</div>;
  const from = spec.from ?? 0, to = spec.to ?? d, lt = t - from;
  const out = prog(t, to - .2, to, ease.inOut), pop = prog(t, from, from + .55, ease.spring), vis = prog(t, from, from + .16, ease.out);
  // continuous life: bob, breathe, sway. Never zero motion, never more than a few px, so it reads as alive not jittery.
  const bob = Math.sin(t * 2.3 + index) * 8, breathe = 1 + .028 * Math.sin(t * 2.9 + index), sway = Math.sin(t * 1.4 + index * 2) * 1.6;
  const size = spec.size ?? box;
  return (<div style={{position: 'absolute', left: spec.x ?? (720 - box) / 2, top: spec.y ?? 480, width: size, height: size, opacity: vis * (1 - out)}}>
    <div style={{position: 'absolute', left: size * .2, width: size * .6, top: size * .94, height: 22, borderRadius: '50%', background: 'rgba(30,30,50,.10)',
      transform: `scale(${(.55 + .45 * pop) * (1 - bob / 90)})`, opacity: vis}} />
    <div style={{width: '100%', height: '100%', transformOrigin: '50% 60%',
      transform: `translate(${out * -120}px, ${(1 - pop) * 70 + bob}px) rotate(${(1 - pop) * -7 + sway}deg) scale(${(.6 + .4 * pop) * breathe})`}}>
      <I t={lt} d={to - from} {...(spec.params || {})} />
      <Sparkles t={t} color={SPARK[spec.id] || '#f5b932'} box={size} seed={index + spec.id.length} />
    </div></div>);
}

function HookBg({t, d, lines}) {
  const n = 60, fall = prog(t, .1, d * .9, ease.inOut), pts = Array.from({length: n}, (_, i) => { const u = i / (n - 1); return [40 + u * 640, 190 + 30 * Math.sin(u * 14) * (1 - u) + u * u * 150 * fall]; });
  const k = Math.max(2, Math.floor(prog(t, .1, d * .7) * n));
  return (<div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', left: 0, width: 720, top: 330, textAlign: 'center', color: '#fff', fontFamily: "Inter, Arial, sans-serif"}}>
      {lines.map((l, i) => <div key={i} style={{fontSize: i === lines.length - 1 ? 64 : 34, fontWeight: i === lines.length - 1 ? 800 : 500, opacity: prog(t, i * .25, i * .25 + .3, ease.out) * (i === lines.length - 1 ? 1 : .7), lineHeight: 1.2}}>{l}</div>)}</div>
    <svg viewBox="0 0 720 400" style={{position: 'absolute', left: 0, top: 620, width: 720, height: 400}}>
      <rect x="20" y="40" width="680" height="300" rx="22" fill="#18181c" />
      <polyline points={pts.slice(0, k).map(p => p.join(',')).join(' ')} fill="none" stroke="#e5303c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </div>);
}

/** The design is authored at 720x1280 and scaled to whatever the composition renders (1080x1920 in the main Motion composition). */
function Stage({children, width, height, bg}) {
  const k = Math.min(width / 720, height / 1280);
  return (<AbsoluteFill style={{background: bg, overflow: 'hidden'}}>
    <div style={{position: 'absolute', left: (width - 720 * k) / 2, top: (height - 1280 * k) / 2, width: 720, height: 1280, transformOrigin: '0 0',
      transform: `scale(${k})`}}>{children}</div></AbsoluteFill>);
}

export function IconExplainer({scene = {}}) {
  const frame = useCurrentFrame(), {fps, durationInFrames, width, height} = useVideoConfig();
  const t = frame / fps, d = scene.duration_seconds || durationInFrames / fps;
  const words = scene.words || [];
  if (scene.mode === 'hook') {
    return (<Stage width={width} height={height} bg="#101012"><HookBg t={t} d={d} lines={scene.hook?.lines || [words.map(w => w.w).join(' ')]} /></Stage>);
  }
  const icons = scene.icons || (scene.icon ? [scene.icon] : []);
  return (
    <Stage width={width} height={height} bg={C.bg}>
      <Backdrop t={t} d={d} />
      <div style={{position: 'absolute', inset: 0, transformOrigin: '360px 640px', transform: `scale(${1 + .05 * (t / d)}) translateY(${-6 * (t / d)}px)`}}>
      <WordReveal words={words} t={t} />
      {icons.map((s, i) => <Icon key={i} spec={s} t={t} d={d} box={380} index={i} />)}
      {scene.pill && <PillLabel t={t} {...scene.pill} />}
      </div>
    </Stage>);
}
export default IconExplainer;

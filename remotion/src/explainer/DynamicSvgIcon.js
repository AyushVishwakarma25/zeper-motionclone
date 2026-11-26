import React from 'react';
import {clamp, ease, hash, lerp, prog} from './anim.mjs';
import {C} from './icons/theme.mjs';

const Svg = ({children, viewBox = '0 0 400 400'}) =>
  React.createElement('svg', {viewBox, width: '100%', height: '100%', style: {overflow: 'visible'}}, children);

/**
 * Calculates dynamic transform string and opacity for a layer based on its animation config.
 */
function evaluateAnim(anim = {}, t, d, index = 0) {
  let transform = '';
  let opacity = 1;

  if (anim.enter) {
    const delay = anim.enter.delay ?? 0.05;
    const dur = anim.enter.duration ?? 0.4;
    const p = prog(t, delay, delay + dur, ease.back);
    transform += ` scale(${0.7 + 0.3 * p})`;
    opacity = clamp(p * 2);
  }

  if (anim.bob) {
    const freq = anim.bob.freq ?? 3;
    const amp = anim.bob.amp ?? 5;
    const y = Math.sin(t * freq + index) * amp;
    transform += ` translateY(${y}px)`;
  }

  if (anim.pulse) {
    const freq = anim.pulse.freq ?? 4;
    const amp = anim.pulse.amp ?? 0.05;
    const s = 1 + Math.sin(t * freq) * amp;
    transform += ` scale(${s})`;
  }

  if (anim.rotate) {
    const speed = anim.rotate.speed ?? 180;
    const deg = (t * speed) % 360;
    const origin = anim.rotate.origin || [200, 200];
    transform += ` rotate(${deg} ${origin[0]} ${origin[1]})`;
  }

  return {transform: transform.trim() || undefined, opacity};
}

/**
 * Recursively renders declarative vector layer nodes.
 */
function renderLayer(layer, t, d, index = 0) {
  if (!layer || typeof layer !== 'object') return null;

  const Tag = layer.tag || 'g';
  const rawProps = layer.props || {};
  const {transform: animTransform, opacity: animOpacity} = evaluateAnim(layer.anim, t, d, index);

  const style = {
    ...rawProps.style,
    transform: animTransform ? `${rawProps.style?.transform || ''} ${animTransform}`.trim() : rawProps.style?.transform,
    opacity: animOpacity !== 1 ? animOpacity : rawProps.style?.opacity
  };

  let strokeDashoffset = rawProps.strokeDashoffset;
  if (layer.anim?.dash?.speed) {
    strokeDashoffset = -((t * layer.anim.dash.speed) % 100);
  }

  const props = {
    ...rawProps,
    style: Object.keys(style).length > 0 ? style : undefined,
    strokeDashoffset: strokeDashoffset !== undefined ? strokeDashoffset : rawProps.strokeDashoffset
  };

  const children = Array.isArray(layer.children)
    ? layer.children.map((child, i) => renderLayer(child, t, d, index + i + 1))
    : layer.text || layer.children;

  return React.createElement(Tag, {key: index, ...props}, children);
}

/**
 * DynamicSvgIcon:
 * Renders declarative vector graphics and animated SVG components generated on the fly.
 */
export function DynamicSvgIcon({spec = {}, t = 0, d = 3}) {
  const enter = prog(t, 0.05, 0.45, ease.back);
  const bob = Math.sin(t * 2.5) * 4;
  const viewBox = spec.viewBox || '0 0 400 400';
  const svgStyle = {overflow: 'visible', width: '100%', height: '100%'};

  // Mode 1: Declarative Layers
  if (Array.isArray(spec.layers) && spec.layers.length > 0) {
    return React.createElement(
      'svg',
      {viewBox, width: '100%', height: '100%', style: svgStyle},
      React.createElement(
        'g',
        {transform: `translate(0 ${bob})`},
        spec.layers.map((layer, i) => renderLayer(layer, t, d, i))
      )
    );
  }

  // Mode 2: Clean Sanitized SVG Markup String
  if (typeof spec.svg_markup === 'string' && spec.svg_markup.trim()) {
    const sanitized = spec.svg_markup
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '');

    return React.createElement(
      'svg',
      {viewBox, width: '100%', height: '100%', style: svgStyle},
      React.createElement('g', {
        transform: `translate(200 200) scale(${0.75 + 0.25 * enter}) translate(-200 -200) translate(0 ${bob})`,
        opacity: clamp(enter * 2),
        dangerouslySetInnerHTML: {__html: sanitized}
      })
    );
  }

  // Mode 3: Fallback Icon Card when spec is minimal
  const label = spec.title || spec.name || spec.id || 'Graphic';
  return React.createElement(
    'svg',
    {viewBox, width: '100%', height: '100%', style: svgStyle},
    React.createElement(
      'g',
      {
        transform: `translate(200 200) scale(${0.8 + 0.2 * enter}) translate(-200 -200)`,
        opacity: clamp(enter * 2)
      },
      React.createElement('rect', {x: 50, y: 50, width: 300, height: 300, rx: 30, fill: '#f8fafc', stroke: C.navy, strokeWidth: 6}),
      React.createElement('circle', {cx: 200, cy: 180, r: 60, fill: C.blueSoft, stroke: C.blue, strokeWidth: 5}),
      React.createElement('polygon', {points: '175,200 200,150 225,200', fill: C.gold}),
      React.createElement('rect', {x: 100, y: 270, width: 200, height: 36, rx: 10, fill: C.navy}),
      React.createElement(
        'text',
        {x: 200, y: 294, textAnchor: 'middle', fontSize: 16, fontWeight: '900', fill: '#fff', fontFamily: 'Arial'},
        label.toUpperCase().slice(0, 16)
      )
    )
  );
}

export default DynamicSvgIcon;

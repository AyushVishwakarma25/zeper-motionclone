import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {hash} from '../explainer/anim.mjs';

/**
 * Continuous motion for the static card templates (kinetic_text, fact_card, stat_counter, comparison_split, bullet_list, quote, cta_end_card).
 * Nothing in the card is changed: the content gets a slow push-in + breathing + float, and a drifting particle/glow layer sits behind it.
 * Pure function of the frame (no Math.random), so renders are reproducible. Accent colour comes from the scene.
 */
export function Lively({children, accent = '#00f2fe', strength = 1}) {
  const frame = useCurrentFrame(), {fps, width, height, durationInFrames} = useVideoConfig(), t = frame / fps;
  const k = Math.max(0, Math.min(1, frame / Math.max(1, durationInFrames))) , push = 1 + .085 * strength * k;
  const breathe = 1 + .016 * strength * Math.sin(t * 2.2), floatY = Math.sin(t * 1.3) * 13 * strength * (height / 1280);
  const dots = Array.from({length: 16}, (_, i) => {
    const sp = 14 + hash(i) * 30, x = (hash(i * 3 + 1) * 100 + Math.sin(t * .6 + i) * 3) % 100, y = (((hash(i * 5 + 2) * 100 - t * sp * .5) % 110) + 110) % 110 - 5;
    return {x, y, r: (5 + hash(i + 9) * 10) * (width / 720), o: .22 + .32 * (.5 + .5 * Math.sin(t * 1.7 + i * 2)), ring: i % 3 === 0};
  });
  const sweep = ((t / 2.4) % 1), bx = 50 + Math.sin(t * .5) * 22, by = 42 + Math.cos(t * .4) * 14;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: `radial-gradient(circle at ${bx}% ${by}%, ${accent}26 0%, ${accent}00 46%)`, pointerEvents: 'none'}} />
      {dots.map((d, i) => <div key={i} style={{position: 'absolute', left: `${d.x}%`, top: `${d.y}%`, width: d.r * 2, height: d.r * 2, borderRadius: '50%', opacity: d.o,
        background: d.ring ? 'transparent' : accent, border: d.ring ? `2px solid ${accent}` : 'none', pointerEvents: 'none'}} />)}
      <AbsoluteFill style={{background: `linear-gradient(105deg, transparent ${sweep * 140 - 40}%, ${accent}22 ${sweep * 140 - 30}%, transparent ${sweep * 140 - 18}%)`, pointerEvents: 'none'}} />
      <AbsoluteFill style={{transform: `translateY(${floatY}px) scale(${push * breathe})`, transformOrigin: '50% 48%'}}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
}
export default Lively;

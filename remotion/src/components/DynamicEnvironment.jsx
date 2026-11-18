import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * Dynamic Environment & Visual Art Direction Engine for Remotion.
 * Replaces the monolithic dark-neon grid with 5 distinct cinematic art styles.
 */

export function DynamicEnvironment({
  artDirection = 'editorial_flat', // editorial_flat | finance_documentary | minimal_whiteboard | bold_infographic | corporate_cinematic
  accent = '#00f2fe',
  bg = null
}) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  // Subtle continuous motion
  const driftX = Math.sin(frame / 36) * 40;
  const driftY = Math.cos(frame / 48) * 40;

  switch (artDirection) {
    case 'editorial_flat': {
      // Warm, sophisticated editorial background: warm off-white/cream or deep warm slate
      const baseBg = bg || '#161922';
      return (
        <AbsoluteFill style={{backgroundColor: baseBg, overflow: 'hidden', zIndex: 0, pointerEvents: 'none'}}>
          {/* Subtle warm paper / ambient wash */}
          <div style={{
            position: 'absolute',
            inset: '-20%',
            background: `radial-gradient(circle at ${40 + driftX / 2}% ${35 + driftY / 2}%, rgba(254, 215, 170, 0.08) 0%, transparent 65%), linear-gradient(145deg, #181c26 0%, #10121a 100%)`
          }} />

          {/* Elegant geometric art blocks */}
          <div style={{
            position: 'absolute',
            right: `${width * 0.05}px`,
            top: `${height * 0.15}px`,
            width: `${width * 0.55}px`,
            height: `${width * 0.55}px`,
            borderRadius: '40px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.02), transparent)',
            transform: `rotate(${15 + driftX * 0.05}deg)`
          }} />

          {/* Minimal architectural ruling lines */}
          <div style={{
            position: 'absolute',
            left: `${width * 0.08}px`,
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'rgba(255, 255, 255, 0.04)'
          }} />
          <div style={{
            position: 'absolute',
            right: `${width * 0.08}px`,
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'rgba(255, 255, 255, 0.04)'
          }} />
        </AbsoluteFill>
      );
    }

    case 'finance_documentary': {
      // Deep financial navy with gold & cyan subtle accents
      const baseBg = bg || '#070d1e';
      return (
        <AbsoluteFill style={{backgroundColor: baseBg, overflow: 'hidden', zIndex: 0, pointerEvents: 'none'}}>
          {/* Deep blue gradient with subtle amber glow */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(circle at 75% 25%, rgba(245, 158, 11, 0.09) 0%, transparent 55%), radial-gradient(circle at 20% 80%, rgba(14, 165, 233, 0.12) 0%, transparent 60%), linear-gradient(180deg, #070d1e 0%, #030712 100%)`
          }} />

          {/* Financial grid lines */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(to right, rgba(56, 189, 248, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(56, 189, 248, 0.04) 1px, transparent 1px)`,
            backgroundSize: `${Math.round(width * 0.1)}px ${Math.round(width * 0.1)}px`,
            backgroundPosition: `${Math.round(driftX * 0.3)}px ${Math.round(driftY * 0.3)}px`
          }} />

          {/* Faint ticker watermark */}
          <div style={{
            position: 'absolute',
            bottom: '10%',
            left: '-10%',
            right: '-10%',
            display: 'flex',
            justifyContent: 'space-around',
            opacity: 0.06,
            fontFamily: 'monospace',
            fontSize: '28px',
            fontWeight: 800,
            color: '#38bdf8',
            transform: `translateX(${driftX}px)`
          }}>
            <span>▲ SENSEX +1.4%</span>
            <span>▲ NIFTY +1.2%</span>
            <span>▼ REVENUE DELAY</span>
            <span>▲ WORKING CAPITAL</span>
          </div>
        </AbsoluteFill>
      );
    }

    case 'minimal_whiteboard': {
      // Crisp technical white/light gray background
      return (
        <AbsoluteFill style={{backgroundColor: '#f8fafc', overflow: 'hidden', zIndex: 0, pointerEvents: 'none'}}>
          {/* Technical blueprint dot grid */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(#94a3b8 1.2px, transparent 1.2px)`,
            backgroundSize: '24px 24px',
            opacity: 0.35
          }} />

          {/* Soft ambient corner warmth */}
          <div style={{
            position: 'absolute',
            top: '-20%',
            right: '-20%',
            width: '60%',
            height: '60%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%)',
            filter: 'blur(50px)'
          }} />
        </AbsoluteFill>
      );
    }

    case 'bold_infographic': {
      // High-contrast vibrant graphic background
      const baseBg = bg || '#121217';
      return (
        <AbsoluteFill style={{backgroundColor: baseBg, overflow: 'hidden', zIndex: 0, pointerEvents: 'none'}}>
          {/* Bold geometric diagonal block */}
          <div style={{
            position: 'absolute',
            width: '180%',
            height: '80%',
            left: '-40%',
            top: '-20%',
            background: `linear-gradient(135deg, ${accent}18 0%, transparent 60%)`,
            transform: 'rotate(-12deg)'
          }} />

          {/* High-contrast circular punch */}
          <div style={{
            position: 'absolute',
            bottom: '-15%',
            right: '-15%',
            width: `${width * 0.75}px`,
            height: `${width * 0.75}px`,
            borderRadius: '50%',
            border: `2px dashed ${accent}33`,
            opacity: 0.5
          }} />
        </AbsoluteFill>
      );
    }

    case 'corporate_cinematic':
    default: {
      // Modern cinematic dark mode with subtle lighting
      const baseBg = bg || '#0a0a12';
      return (
        <AbsoluteFill style={{backgroundColor: baseBg, overflow: 'hidden', zIndex: 0, pointerEvents: 'none'}}>
          {/* Ambient spotlight */}
          <div style={{
            position: 'absolute',
            left: `${width * 0.5 + driftX}px`,
            top: `${height * 0.4 + driftY}px`,
            width: `${width * 0.9}px`,
            height: `${width * 0.9}px`,
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${accent}1c 0%, transparent 65%)`,
            filter: 'blur(80px)'
          }} />

          {/* Subtle grid */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)`,
            backgroundSize: `${Math.round(width * 0.08)}px ${Math.round(width * 0.08)}px`,
            opacity: 0.5
          }} />
        </AbsoluteFill>
      );
    }
  }
}

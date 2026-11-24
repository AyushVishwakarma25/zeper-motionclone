import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {StickmanCharacter} from '../components/StickmanCharacter';
import {AnimatedProp} from '../components/AnimatedProps';

/**
 * ThreeDFallbackView
 * Robust, highly aesthetic SVG + CSS isometric fallback for environments
 * where WebGL is unavailable or fails to initialize.
 * Ensures zero dropped frames, zero crashes, and guaranteed liveliness compliance.
 */
export function ThreeDFallbackView({config = {}, width, height}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const isVertical = height > width;
  const time = frame / Math.max(1, fps);

  const env = config.environment || 'studio';
  const bg = config.background || '#0a0a12';
  const ground = config.ground || '#1e293b';
  const accent = config.character?.shirtColor || '#00f2fe';
  const pose = config.character?.pose || 'idle';
  const propType = config.prop?.type || 'money_stack';

  // Ambient lively drift
  const driftX = Math.sin(time * 1.5) * 12;
  const floatY = Math.sin(time * 2.2) * 8;

  return (
    <AbsoluteFill
      data-three-fallback="true"
      style={{
        backgroundColor: bg,
        overflow: 'hidden',
        perspective: '900px'
      }}
    >
      {/* Isometric Floor Plane */}
      <div
        style={{
          position: 'absolute',
          left: '-20%',
          right: '-20%',
          bottom: '-15%',
          height: '65%',
          background: `linear-gradient(180deg, ${ground} 0%, rgba(15,23,42,0.95) 100%)`,
          transform: 'rotateX(55deg)',
          transformOrigin: 'bottom center',
          boxShadow: '0 -20px 40px rgba(0,0,0,0.4)',
          borderRadius: '32px',
          borderTop: `2px solid ${accent}33`
        }}
      >
        {/* Grid lines on floor */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            opacity: 0.7
          }}
        />
      </div>

      {/* Environment-specific background accents */}
      {env === 'office' && (
        <div
          style={{
            position: 'absolute',
            top: '15%',
            left: '10%',
            right: '10%',
            height: '25%',
            borderBottom: '2px solid rgba(255,255,255,0.1)',
            display: 'flex',
            gap: '16px'
          }}
        >
          {Array.from({length: 12}).map((_, i) => (
            <div
              key={i}
              style={{
                width: '6px',
                height: '100%',
                background: 'rgba(133, 77, 14, 0.35)',
                borderRadius: '3px'
              }}
            />
          ))}
        </div>
      )}

      {env === 'street' && (
        <div
          style={{
            position: 'absolute',
            bottom: '22%',
            left: 0,
            right: 0,
            height: '14%',
            background: '#1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            opacity: 0.8
          }}
        >
          {Array.from({length: 6}).map((_, i) => (
            <div
              key={i}
              style={{
                width: '60px',
                height: '8px',
                background: '#facc15',
                borderRadius: '4px'
              }}
            />
          ))}
        </div>
      )}

      {/* Fallback Custom Objects */}
      {config.objects && config.objects.length > 0 && (
        <div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
          {config.objects.slice(0, 6).map((item, idx) => (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                left: `${20 + (idx % 3) * 28}%`,
                top: `${40 + Math.floor(idx / 3) * 18}%`,
                width: `${Math.max(30, item.size[0] * 35)}px`,
                height: `${Math.max(30, item.size[1] * 35)}px`,
                borderRadius: item.type === 'sphere' ? '50%' : '12px',
                background: item.color,
                boxShadow: '0 12px 24px rgba(0,0,0,0.3)',
                transform: `translateY(${Math.sin(time * 2 + idx) * 8}px)`
              }}
            />
          ))}
        </div>
      )}

      {/* Fallback Character & Prop Stage */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '52%',
          transform: `translate(-50%, -50%) translate(${driftX}px, ${floatY}px)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isVertical ? '18px' : '36px'
        }}
      >
        {/* Character */}
        <div style={{position: 'relative'}}>
          <StickmanCharacter
            pose={pose}
            size={isVertical ? Math.min(width * 0.65, 420) : Math.min(height * 0.6, 380)}
            shirtColor={accent}
          />
        </div>

        {/* Prop */}
        {config.prop && (
          <div
            style={{
              transform: `translateY(${Math.sin(time * 3) * 12}px) rotate(${Math.sin(time * 1.5) * 6}deg)`
            }}
          >
            <AnimatedProp
              type={propType}
              size={isVertical ? 160 : 200}
            />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

export default ThreeDFallbackView;

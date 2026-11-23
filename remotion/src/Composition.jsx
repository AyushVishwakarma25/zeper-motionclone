import React, {useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {stateAt} from './motion.mjs';
import {getTheme, MOTION_SPRINGS, PALETTES} from './theme.js';
import {SceneTransition} from './transitions/SceneTransition';
import {CharacterStory} from './templates/CharacterStory';
import {LayeredScene} from './components/LayeredScene';
import {IconExplainer} from './explainer/IconExplainer';
import {ScienceScene} from './science/ScienceScene';
import {Lively} from './components/Lively';
import {StickmanCharacter} from './components/StickmanCharacter';
import {AnimatedProp} from './components/AnimatedProps';
import {DynamicEnvironment} from './components/DynamicEnvironment';
import {CashFlowSplit, TimelineGap, AnimatedBarChart} from './components/DataVisualizations';
import {SafeAsset, resolveAssetSrc} from './components/SafeAsset';

const families = {
  sans: "'Noto Sans Devanagari', 'Nirmala UI', Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  serif: 'Georgia, serif',
  mono: "Consolas, 'JetBrains Mono', monospace"
};

// Font-face declaration for Devanagari support
export function GlobalFontStyles() {
  return (
    <style>{`
      @font-face {
        font-family: 'Noto Sans Devanagari';
        src: url('${staticFile('fonts/NotoSansDevanagari-Regular.ttf')}') format('truetype');
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: 'Noto Sans Devanagari';
        src: url('${staticFile('fonts/NotoSansDevanagari-Bold.ttf')}') format('truetype');
        font-weight: 700;
        font-style: normal;
      }
    `}</style>
  );
}

// Continuous Motion Background: guarantees no static frames (>0.8s) across any scene
export function MotionBackground({theme, accent = '#00f2fe', bg = '#0a0a12'}) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  // Continuous drifting motion: angle and coordinates evolve on every frame
  const angle = (125 + frame * 0.35) % 360;
  const driftX = Math.sin(frame / 32) * 50;
  const driftY = Math.cos(frame / 42) * 50;
  const pulse = 0.85 + 0.15 * Math.sin(frame / 20);

  return (
    <AbsoluteFill style={{backgroundColor: bg, overflow: 'hidden', pointerEvents: 'none', zIndex: 0}}>
      {/* Drifting ambient dynamic gradient */}
      <div style={{
        position: 'absolute',
        inset: '-25%',
        background: `radial-gradient(circle at ${50 + driftX / 2}% ${45 + driftY / 2}%, ${accent}28 0%, transparent 65%), linear-gradient(${angle}deg, ${bg} 0%, rgba(22,26,42,0.85) 100%)`
      }} />

      {/* Floating subtle glow orb */}
      <div style={{
        position: 'absolute',
        left: `${width * 0.5 + driftX}px`,
        top: `${height * 0.45 + driftY}px`,
        width: `${width * 0.75}px`,
        height: `${width * 0.75}px`,
        transform: `translate(-50%, -50%) scale(${pulse})`,
        background: `radial-gradient(circle, ${accent}20 0%, transparent 70%)`
      }} />

      {/* Subtle moving grid */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)`,
        backgroundSize: `${Math.round(width * 0.08)}px ${Math.round(width * 0.08)}px`,
        backgroundPosition: `${Math.round(driftX * 0.5)}px ${Math.round(driftY * 0.5)}px`,
        opacity: 0.6
      }} />
    </AbsoluteFill>
  );
}

// 1. KINETIC TEXT TEMPLATE (Word-level beat reveal, responsive safe-margins)
export function KineticText({
  headline = 'Autonomous Video Engine',
  words = null,
  accent = '#00f2fe',
  bg = '#0a0a12'
}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const theme = getTheme(width, height);

  const wordList = (words && words.length > 0)
    ? words
    : (headline ? headline.split(' ').filter(Boolean) : ['Autonomous', 'Video', 'Platform']);

  const fontSize = theme.typeScale.h1;

  return (
    <AbsoluteFill style={{
      fontFamily: theme.fontFamilies.sans,
      overflow: 'hidden'
    }}>
      <GlobalFontStyles />
      <MotionBackground theme={theme} accent={accent} bg={bg} />

      {/* Safe container (8% sides, 12% top, 18% bottom) */}
      <div style={{
        position: 'absolute',
        top: theme.safeMargins.top,
        bottom: theme.safeMargins.bottom,
        left: theme.safeMargins.left,
        right: theme.safeMargins.right,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
        boxSizing: 'border-box'
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: `${Math.round(fontSize * 0.28)}px`,
          maxWidth: '100%',
          textAlign: 'center',
          lineHeight: 1.25,
          wordBreak: 'break-word'
        }}>
          {wordList.map((word, i) => {
            const sp = spring({frame: frame - i * 6, fps, config: theme.springs.snappy});
            const isAccent = (i === wordList.length - 1) || (wordList.length > 4 && i % 3 === 0);
            return (
              <span
                key={i}
                style={{
                  color: isAccent ? accent : theme.palette.textPrimary,
                  fontSize: `${fontSize}px`,
                  fontWeight: 900,
                  letterSpacing: '-0.5px',
                  transform: `scale(${sp}) translateY(${interpolate(sp, [0, 1], [35, 0])}px)`,
                  opacity: sp,
                  display: 'inline-block',
                  textShadow: '0 4px 20px rgba(0,0,0,0.8)'
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// 2. FACT CARD TEMPLATE (Single headline, cleanly wrapped, animated stat, glassmorphism border)
export function FactCard({
  title = 'Engineered for High Conversion',
  headline = '',
  stat = '10x Faster',
  subtitle = '',
  source = 'Verified Benchmark',
  accent = '#00f2fe',
  bg = '#0a0a12'
}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const theme = getTheme(width, height);

  const displayTitle = headline || title || 'Engineered for High Conversion';
  const displaySubtitle = subtitle || '';

  const enter = spring({frame, fps, config: theme.springs.smooth});
  const statScale = spring({frame: frame - 4, fps, config: theme.springs.snappy});
  const opacity = enter;

  return (
    <AbsoluteFill style={{fontFamily: theme.fontFamilies.sans, overflow: 'hidden'}}>
      <GlobalFontStyles />
      <MotionBackground theme={theme} accent={accent} bg={bg} />

      <div style={{
        position: 'absolute',
        top: theme.safeMargins.top,
        bottom: theme.safeMargins.bottom,
        left: theme.safeMargins.left,
        right: theme.safeMargins.right,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
        boxSizing: 'border-box'
      }}>
        <div style={{
          transform: `scale(${0.88 + enter * 0.12})`,
          opacity,
          background: theme.palette.cardBg,
          border: `1.5px solid ${accent}50`,
          borderRadius: `${Math.round(theme.width * 0.03)}px`,
          padding: `${Math.round(theme.safeMargins.top * 0.35)}px ${Math.round(theme.safeMargins.left * 0.6)}px`,
          textAlign: 'center',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          boxShadow: `0 30px 90px rgba(0,0,0,0.7), 0 0 45px ${accent}25`
        }}>
          {/* Source / Verified Pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 14px',
            borderRadius: '20px',
            background: `${accent}18`,
            border: `1px solid ${accent}40`,
            color: accent,
            fontSize: `${theme.typeScale.caption}px`,
            fontWeight: 700,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            marginBottom: '16px'
          }}>
            <span style={{width: '6px', height: '6px', borderRadius: '50%', background: accent}} />
            {source}
          </div>

          {/* Animated Big Stat */}
          <div style={{
            fontSize: `${theme.typeScale.display}px`,
            fontWeight: 900,
            color: accent,
            letterSpacing: '-1.5px',
            lineHeight: 1.1,
            transform: `scale(${statScale})`,
            marginBottom: '16px',
            textShadow: `0 0 30px ${accent}40`
          }}>
            {stat}
          </div>

          {/* Single Headline (Never duplicated) */}
          <div style={{
            fontSize: `${theme.typeScale.h2}px`,
            fontWeight: 800,
            color: theme.palette.textPrimary,
            lineHeight: 1.25,
            marginBottom: displaySubtitle ? '12px' : '0px',
            wordBreak: 'break-word'
          }}>
            {displayTitle}
          </div>

          {/* Subtitle */}
          {displaySubtitle && (
            <div style={{
              fontSize: `${theme.typeScale.body}px`,
              color: theme.palette.textSecondary,
              fontWeight: 500,
              lineHeight: 1.35
            }}>
              {displaySubtitle}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// 3. STAT COUNTER TEMPLATE (Animated number counting up + description)
export function StatCounter({
  number = 100,
  prefix = '',
  suffix = '%',
  headline = 'Automated Pipeline',
  subtitle = 'Zero manual editing required',
  accent = '#00f2fe',
  bg = '#0a0a12'
}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const theme = getTheme(width, height);

  const sp = spring({frame, fps, config: theme.springs.smooth});
  const currentVal = Math.round(interpolate(sp, [0, 1], [0, Number(number) || 100]));

  return (
    <AbsoluteFill style={{fontFamily: theme.fontFamilies.sans, overflow: 'hidden'}}>
      <GlobalFontStyles />
      <MotionBackground theme={theme} accent={accent} bg={bg} />

      <div style={{
        position: 'absolute',
        top: theme.safeMargins.top,
        bottom: theme.safeMargins.bottom,
        left: theme.safeMargins.left,
        right: theme.safeMargins.right,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: `${Math.round(theme.typeScale.display * 1.3)}px`,
          fontWeight: 900,
          color: accent,
          letterSpacing: '-2px',
          lineHeight: 1.05,
          textShadow: `0 0 40px ${accent}50`,
          transform: `scale(${0.9 + sp * 0.1})`
        }}>
          {prefix}{currentVal}{suffix}
        </div>
        <div style={{
          fontSize: `${theme.typeScale.h1}px`,
          fontWeight: 800,
          color: theme.palette.textPrimary,
          marginTop: '16px',
          lineHeight: 1.25
        }}>
          {headline}
        </div>
        {subtitle && (
          <div style={{
            fontSize: `${theme.typeScale.body}px`,
            color: theme.palette.textSecondary,
            marginTop: '10px'
          }}>
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

// 4. COMPARISON SPLIT TEMPLATE (Before vs After / Option A vs Option B)
export function ComparisonSplit({
  optionA = {title: 'Manual Editing', desc: '4-8 Hours per video'},
  optionB = {title: 'MotionClone AI', desc: '30 Seconds total'},
  headline = 'The Smarter Workflow',
  accent = '#00f2fe',
  bg = '#0a0a12'
}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const theme = getTheme(width, height);

  const isStacked = theme.isVertical || theme.isSquare;
  const spA = spring({frame: frame - 2, fps, config: theme.springs.smooth});
  const spB = spring({frame: frame - 10, fps, config: theme.springs.smooth});

  return (
    <AbsoluteFill style={{fontFamily: theme.fontFamilies.sans, overflow: 'hidden'}}>
      <GlobalFontStyles />
      <MotionBackground theme={theme} accent={accent} bg={bg} />

      <div style={{
        position: 'absolute',
        top: theme.safeMargins.top,
        bottom: theme.safeMargins.bottom,
        left: theme.safeMargins.left,
        right: theme.safeMargins.right,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        zIndex: 2
      }}>
        {headline && (
          <div style={{
            fontSize: `${theme.typeScale.h2}px`,
            fontWeight: 800,
            color: theme.palette.textPrimary,
            textAlign: 'center',
            marginBottom: '4px'
          }}>
            {headline}
          </div>
        )}

        <div style={{
          display: 'flex',
          flexDirection: isStacked ? 'column' : 'row',
          gap: '20px',
          width: '100%',
          justifyContent: 'center',
          alignItems: 'stretch'
        }}>
          {/* Card A: Before / Legacy */}
          <div style={{
            flex: 1,
            background: 'rgba(255, 60, 60, 0.08)',
            border: '1.5px solid rgba(255, 60, 60, 0.35)',
            borderRadius: '20px',
            padding: '24px',
            textAlign: 'center',
            transform: `scale(${0.9 + spA * 0.1})`,
            opacity: spA
          }}>
            <div style={{color: '#ff6b6b', fontSize: `${theme.typeScale.caption}px`, fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px'}}>BEFORE</div>
            <div style={{color: '#ffffff', fontSize: `${theme.typeScale.h2}px`, fontWeight: 800, marginBottom: '6px'}}>{optionA.title}</div>
            <div style={{color: theme.palette.textSecondary, fontSize: `${theme.typeScale.body}px`}}>{optionA.desc}</div>
          </div>

          {/* Card B: After / AI */}
          <div style={{
            flex: 1,
            background: `${accent}15`,
            border: `1.5px solid ${accent}`,
            borderRadius: '20px',
            padding: '24px',
            textAlign: 'center',
            transform: `scale(${0.9 + spB * 0.1})`,
            opacity: spB,
            boxShadow: `0 10px 40px ${accent}25`
          }}>
            <div style={{color: accent, fontSize: `${theme.typeScale.caption}px`, fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px'}}>WITH MOTIONCLONE</div>
            <div style={{color: '#ffffff', fontSize: `${theme.typeScale.h2}px`, fontWeight: 800, marginBottom: '6px'}}>{optionB.title}</div>
            <div style={{color: theme.palette.textSecondary, fontSize: `${theme.typeScale.body}px`}}>{optionB.desc}</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// 5. BULLET LIST TEMPLATE (Sequential reveal with checkmarks)
export function BulletList({
  headline = 'Key Architectural Pillars',
  bullets = ['Real-time Vertex AI integration', 'Cloud TTS neural voiceover', '30 FPS broadcast Remotion render', 'Single source of truth pipeline'],
  accent = '#00f2fe',
  bg = '#0a0a12'
}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const theme = getTheme(width, height);

  return (
    <AbsoluteFill style={{fontFamily: theme.fontFamilies.sans, overflow: 'hidden'}}>
      <GlobalFontStyles />
      <MotionBackground theme={theme} accent={accent} bg={bg} />

      <div style={{
        position: 'absolute',
        top: theme.safeMargins.top,
        bottom: theme.safeMargins.bottom,
        left: theme.safeMargins.left,
        right: theme.safeMargins.right,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        zIndex: 2
      }}>
        {headline && (
          <div style={{
            fontSize: `${theme.typeScale.h1}px`,
            fontWeight: 800,
            color: theme.palette.textPrimary,
            textAlign: 'center',
            marginBottom: '32px'
          }}>
            {headline}
          </div>
        )}

        <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
          {bullets.map((item, idx) => {
            const sp = spring({frame: frame - idx * 8, fps, config: theme.springs.snappy});
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  background: theme.palette.cardBg,
                  border: `1px solid ${accent}30`,
                  borderRadius: '16px',
                  padding: '16px 20px',
                  transform: `translateX(${interpolate(sp, [0, 1], [-40, 0])}px)`,
                  opacity: sp
                }}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#000000',
                  fontWeight: 900,
                  fontSize: '16px',
                  flexShrink: 0
                }}>
                  ✓
                </div>
                <div style={{
                  color: theme.palette.textPrimary,
                  fontSize: `${theme.typeScale.body}px`,
                  fontWeight: 600,
                  lineHeight: 1.3
                }}>
                  {item}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// 6. QUOTE TEMPLATE (Block quote + author + avatar placeholder)
export function QuoteScene({
  quote = "The future of motion design belongs to code and generative AI.",
  author = "Zeper AI Research",
  role = "Autonomous Media Lab",
  accent = '#00f2fe',
  bg = '#0a0a12'
}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const theme = getTheme(width, height);

  const sp = spring({frame, fps, config: theme.springs.smooth});

  return (
    <AbsoluteFill style={{fontFamily: theme.fontFamilies.sans, overflow: 'hidden'}}>
      <GlobalFontStyles />
      <MotionBackground theme={theme} accent={accent} bg={bg} />

      <div style={{
        position: 'absolute',
        top: theme.safeMargins.top,
        bottom: theme.safeMargins.bottom,
        left: theme.safeMargins.left,
        right: theme.safeMargins.right,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
        textAlign: 'center'
      }}>
        {/* Typographic quote mark */}
        <div style={{
          fontSize: `${Math.round(theme.typeScale.display * 1.6)}px`,
          lineHeight: 0.6,
          color: accent,
          fontFamily: 'Georgia, serif',
          opacity: 0.8
        }}>
          “
        </div>

        {/* Quote body */}
        <div style={{
          fontSize: `${theme.typeScale.h2}px`,
          fontWeight: 700,
          color: theme.palette.textPrimary,
          lineHeight: 1.35,
          fontStyle: 'italic',
          margin: '20px 0',
          transform: `scale(${0.92 + sp * 0.08})`,
          opacity: sp
        }}>
          {quote}
        </div>

        {/* Author info */}
        <div style={{display: 'flex', alignItems: 'center', gap: '14px', marginTop: '16px'}}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: `${accent}30`,
            border: `2px solid ${accent}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accent,
            fontWeight: 800,
            fontSize: '18px'
          }}>
            {author.charAt(0)}
          </div>
          <div style={{textAlign: 'left'}}>
            <div style={{color: theme.palette.textPrimary, fontSize: `${theme.typeScale.body}px`, fontWeight: 800}}>{author}</div>
            <div style={{color: theme.palette.textSecondary, fontSize: `${theme.typeScale.caption}px`}}>{role}</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// 7. IMAGE FULL BLEED TEMPLATE (Ken Burns slow zoom/pan + lower-third caption)
export function ImageFullBleed({
  image = null,
  headline = 'Stunning Visual Detail',
  subtitle = 'High-resolution generative synthesis',
  accent = '#00f2fe'
}) {
  const frame = useCurrentFrame();
  const {durationInFrames, width, height} = useVideoConfig();
  const theme = getTheme(width, height);

  // Ken Burns zoom & subtle pan
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.12], {extrapolateRight: 'clamp'});
  const panY = interpolate(frame, [0, durationInFrames], [0, -25], {extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{backgroundColor: '#0a0a12', overflow: 'hidden', fontFamily: theme.fontFamilies.sans}}>
      <GlobalFontStyles />
      <SafeAsset
        src={image}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale}) translateY(${panY}px)`
        }}
        fallback={<MotionBackground theme={theme} accent={accent} bg="#0a0a12" />}
        accent={accent}
      />

      {/* Dark gradient shadow for lower third readability */}
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '45%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)',
        zIndex: 1
      }} />

      {/* Lower Third Caption inside safe margins */}
      <div style={{
        position: 'absolute',
        bottom: theme.safeMargins.bottom,
        left: theme.safeMargins.left,
        right: theme.safeMargins.right,
        zIndex: 2
      }}>
        <div style={{
          fontSize: `${theme.typeScale.h1}px`,
          fontWeight: 900,
          color: '#ffffff',
          lineHeight: 1.2,
          textShadow: '0 4px 20px rgba(0,0,0,0.8)'
        }}>
          {headline}
        </div>
        {subtitle && (
          <div style={{
            fontSize: `${theme.typeScale.body}px`,
            color: accent,
            fontWeight: 700,
            marginTop: '8px',
            textShadow: '0 2px 10px rgba(0,0,0,0.8)'
          }}>
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

// 8. SCREEN CAPTURE FRAME TEMPLATE (Mock browser/device frame with inner scroll/zoom)
export function ScreenCaptureFrame({
  image = null,
  headline = 'Interactive Workspace',
  subtitle = 'Full real-time visual control',
  accent = '#00f2fe',
  bg = '#0a0a12'
}) {
  const frame = useCurrentFrame();
  const {durationInFrames, width, height} = useVideoConfig();
  const theme = getTheme(width, height);

  const innerScrollY = interpolate(frame, [0, durationInFrames], [0, -40], {extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{fontFamily: theme.fontFamilies.sans, overflow: 'hidden'}}>
      <GlobalFontStyles />
      <MotionBackground theme={theme} accent={accent} bg={bg} />

      <div style={{
        position: 'absolute',
        top: theme.safeMargins.top,
        bottom: theme.safeMargins.bottom,
        left: theme.safeMargins.left,
        right: theme.safeMargins.right,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        zIndex: 2
      }}>
        {headline && (
          <div style={{
            fontSize: `${theme.typeScale.h2}px`,
            fontWeight: 800,
            color: theme.palette.textPrimary,
            textAlign: 'center'
          }}>
            {headline}
          </div>
        )}

        {/* Browser Mock Frame */}
        <div style={{
          width: '100%',
          flex: 1,
          maxHeight: '75%',
          background: '#161824',
          borderRadius: '16px',
          border: `1.5px solid ${accent}40`,
          boxShadow: `0 25px 70px rgba(0,0,0,0.8), 0 0 30px ${accent}20`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Header bar */}
          <div style={{
            height: '32px',
            background: '#0d0f17',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: '8px'
          }}>
            <span style={{width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f56'}} />
            <span style={{width: '10px', height: '10px', borderRadius: '50%', background: '#ffbd2e'}} />
            <span style={{width: '10px', height: '10px', borderRadius: '50%', background: '#27c93f'}} />
            <div style={{
              flex: 1,
              height: '18px',
              background: '#1a1d2c',
              borderRadius: '6px',
              marginLeft: '12px',
              marginRight: '12px',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '8px',
              color: '#666',
              fontSize: '11px'
            }}>
              motionclone.studio/app
            </div>
          </div>

          {/* Viewport content */}
          <div style={{flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0a10'}}>
            <SafeAsset
              src={image}
              style={{
                width: '100%',
                height: '120%',
                objectFit: 'cover',
                transform: `translateY(${innerScrollY}px)`
              }}
              fallback={
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: accent, gap: '10px'}}>
                  <span style={{fontSize: '32px'}}>🖥️</span>
                  <span style={{fontWeight: 700, fontSize: '15px', color: '#f8fafc'}}>Interactive Preview Frame</span>
                </div>
              }
              accent={accent}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// 9. CTA END CARD TEMPLATE (Logo + headline + action button + handle)
export function CtaEndCard({
  headline = 'Start Creating Today',
  buttonText = 'Try MotionClone Free',
  handle = '@zeperai',
  accent = '#00f2fe',
  bg = '#0a0a12',
  logo = null
}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const theme = getTheme(width, height);

  const sp = spring({frame, fps, config: theme.springs.snappy});
  const btnPulse = 1.0 + 0.04 * Math.sin(frame / 12);

  return (
    <AbsoluteFill style={{fontFamily: theme.fontFamilies.sans, overflow: 'hidden'}}>
      <GlobalFontStyles />
      <MotionBackground theme={theme} accent={accent} bg={bg} />

      <div style={{
        position: 'absolute',
        top: theme.safeMargins.top,
        bottom: theme.safeMargins.bottom,
        left: theme.safeMargins.left,
        right: theme.safeMargins.right,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        zIndex: 2,
        textAlign: 'center'
      }}>
        {/* Brand Icon */}
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '20px',
          background: `linear-gradient(135deg, ${accent}, #0072ff)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 12px 35px ${accent}60`,
          transform: `scale(${sp})`
        }}>
          <span style={{fontSize: '36px', color: '#ffffff'}}>⚡</span>
        </div>

        {/* CTA Headline */}
        <div style={{
          fontSize: `${theme.typeScale.h1}px`,
          fontWeight: 900,
          color: theme.palette.textPrimary,
          lineHeight: 1.2
        }}>
          {headline}
        </div>

        {/* Interactive-Styled Action Button */}
        <div style={{
          background: `linear-gradient(90deg, ${accent}, #4facfe)`,
          color: '#000000',
          fontWeight: 900,
          fontSize: `${theme.typeScale.body}px`,
          padding: '16px 36px',
          borderRadius: '30px',
          boxShadow: `0 10px 40px ${accent}50`,
          transform: `scale(${btnPulse})`,
          letterSpacing: '0.5px'
        }}>
          {buttonText} →
        </div>

        {/* Handle / Domain Pill */}
        <div style={{
          color: theme.palette.textSecondary,
          fontSize: `${theme.typeScale.caption}px`,
          fontWeight: 700,
          letterSpacing: '1px'
        }}>
          {handle}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Card templates that were fully static: they get continuous motion from <Lively> (see components/Lively.jsx). scene.lively=false opts out.
const LIVELY_TEMPLATES = new Set(['kinetic_text', 'fact_card', 'stat_counter', 'comparison_split', 'bullet_list', 'quote', 'cta_end_card', 'finance_breakdown', 'cash_flow', 'timeline_gap', 'delay_timeline', 'money_flow', 'working_capital']);

export function SceneSwitch({scene = {}, logo = null}) {
  const template = (scene.template || 'kinetic_text').toLowerCase();
  if (LIVELY_TEMPLATES.has(template) && scene.lively !== false) {
    return <Lively accent={scene.accent_color || scene.accent || '#00f2fe'}><SceneSwitchInner scene={scene} logo={logo} /></Lively>;
  }
  return <SceneSwitchInner scene={scene} logo={logo} />;
}

// Universal Scene Switch Component for Explainer Sequences
function SceneSwitchInner({scene = {}, logo = null}) {
  const template = (scene.template || 'kinetic_text').toLowerCase();
  const headline = scene.headline || scene.title || scene.on_screen_text || '';
  // Subtitle is purely concise supporting on-screen text, NEVER the full voiceover script
  const subtitle = scene.subtitle || scene.stat_label || '';
  const accent = scene.accent_color || scene.accent || '#00f2fe';
  const bg = scene.background_color || scene.bg || '#0a0a12';
  const asset = scene.assigned_asset || scene.asset || logo;

  switch (template) {
    case 'science_scene':
      return <ScienceScene scene={scene} />;
    case 'icon_explainer':
      return <IconExplainer scene={scene} />;
    case 'layered_asset_scene':
      return <LayeredScene layered={scene.layered || {}} accent={accent} bg={bg} />;
    case 'character_story':
      return (
        <CharacterStory
          scene={scene}
          headline={headline}
          onScreenText={scene.on_screen_text}
          visualMetaphor={scene.visual_metaphor}
          characterPose={scene.character_pose}
          characterAction={scene.character_action}
          characterExpression={scene.character_expression}
          propType={scene.props || scene.prop_type}
          propAmount={scene.prop_amount || scene.stat}
          artDirection={scene.art_direction || scene.environment}
          accent={accent}
          bg={bg}
        />
      );
    case 'finance_breakdown':
    case 'cash_flow':
      return (
        <CharacterStory
          scene={scene}
          headline={headline}
          onScreenText={scene.on_screen_text}
          visualMetaphor={scene.visual_metaphor || 'Cash Inflow vs Outflow'}
          characterPose={scene.character_pose || 'pointing'}
          characterAction={scene.character_action || 'pointing at expenses'}
          propType={scene.props || 'scale'}
          propAmount={scene.prop_amount || scene.stat || '₹10 LAKH'}
          artDirection={scene.art_direction || 'finance_documentary'}
          accent={accent}
          bg={bg}
          dataVizType="cash_flow"
        />
      );
    case 'timeline_gap':
    case 'delay_timeline':
      return (
        <CharacterStory
          scene={scene}
          headline={headline}
          onScreenText={scene.on_screen_text}
          visualMetaphor={scene.visual_metaphor || 'The 60-Day Payment Delay'}
          characterPose={scene.character_pose || 'stress_panic'}
          characterAction={scene.character_action || 'panicking over overdue invoice'}
          propType={scene.props || 'calendar'}
          artDirection={scene.art_direction || 'editorial_flat'}
          accent={accent}
          bg={bg}
          dataVizType="timeline"
        />
      );
    case 'money_flow':
    case 'working_capital':
      return (
        <CharacterStory
          scene={scene}
          headline={headline}
          onScreenText={scene.on_screen_text}
          visualMetaphor={scene.visual_metaphor || 'Working Capital Trapped'}
          characterPose={scene.character_pose || 'holding_money'}
          propType={scene.props || 'glass_barrier'}
          artDirection={scene.art_direction || 'bold_infographic'}
          accent={accent}
          bg={bg}
          dataVizType="bar_chart"
        />
      );
    case 'kinetic_text':
      return (
        <KineticText
          headline={headline}
          words={headline ? headline.split(' ').filter(Boolean) : null}
          accent={accent}
          bg={bg}
        />
      );
    case 'fact_card':
      const statVal = scene.stat || (headline.length <= 15 ? headline : '10x Faster');
      const titleVal = scene.title && scene.title !== 'Fact' ? scene.title : headline;
      return (
        <FactCard
          title={titleVal}
          headline={titleVal}
          stat={statVal}
          subtitle={subtitle}
          accent={accent}
          bg={bg}
        />
      );
    case 'stat_counter':
      return (
        <StatCounter
          number={scene.number || 100}
          prefix={scene.prefix || ''}
          suffix={scene.suffix || '%'}
          headline={headline}
          subtitle={subtitle}
          accent={accent}
          bg={bg}
        />
      );
    case 'comparison_split':
      return (
        <ComparisonSplit
          optionA={scene.optionA || {title: 'Manual Video Edit', desc: 'Hours of timeline tweaking'}}
          optionB={scene.optionB || {title: 'MotionClone AI', desc: 'Instant 30 FPS compilation'}}
          headline={headline}
          accent={accent}
          bg={bg}
        />
      );
    case 'bullet_list':
      const bulletItems = scene.bullets || ['High-conversion hooks', 'Automated audio mixing', 'Production quality Remotion output'];
      return (
        <BulletList
          headline={headline}
          bullets={bulletItems}
          accent={accent}
          bg={bg}
        />
      );
    case 'quote':
      return (
        <QuoteScene
          quote={headline || subtitle || 'Motion graphics at the speed of thought.'}
          author={scene.author || 'Zeper AI'}
          role={scene.role || 'Design Engine'}
          accent={accent}
          bg={bg}
        />
      );
    case 'image_full_bleed':
      return (
        <ImageFullBleed
          image={asset}
          headline={headline}
          subtitle={subtitle}
          accent={accent}
        />
      );
    case 'screen_capture_frame':
      return (
        <ScreenCaptureFrame
          image={asset}
          headline={headline}
          subtitle={subtitle}
          accent={accent}
          bg={bg}
        />
      );
    case 'cta_end_card':
      return (
        <CtaEndCard
          headline={headline || 'Ready to Rebuild Your Video?'}
          buttonText={scene.buttonText || 'Get Started Now'}
          handle={scene.handle || '@zeperai'}
          accent={accent}
          bg={bg}
          logo={logo}
        />
      );
    default:
      return (
        <KineticText
          headline={headline}
          words={headline ? headline.split(' ').filter(Boolean) : null}
          accent={accent}
          bg={bg}
        />
      );
  }
}

export function SubtitleOverlay({text, accent = '#00f2fe'}) {
  const {width, height} = useVideoConfig();
  const theme = getTheme(width, height);
  if (!text || typeof text !== 'string' || text.trim() === '') return null;
  return (
    <div style={{
      position: 'absolute',
      bottom: Math.max(32, Math.round(theme.safeMargins.bottom * 0.75)),
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      padding: '0 32px',
      pointerEvents: 'none',
      zIndex: 100
    }}>
      <div style={{
        background: 'rgba(5, 7, 12, 0.92)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        borderRadius: '12px',
        padding: '6px 20px',
        maxWidth: '85%',
        textAlign: 'center',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.55)'
      }}>
        <span style={{
          color: '#f8fafc',
          fontFamily: theme.fontFamilies.sans,
          fontSize: `${Math.round(theme.typeScale.body * 0.9)}px`,
          fontWeight: 600,
          letterSpacing: '-0.1px',
          lineHeight: 1.3
        }}>
          {text}
        </span>
      </div>
    </div>
  );
}

// Main Universal Explainer Composition
export function MotionComposition(props) {
  const {plan, audio, logo, scene_plan, scenes} = props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const allScenes = (scene_plan?.scenes && scene_plan.scenes.length > 0)
    ? scene_plan.scenes
    : (scenes && scenes.length > 0 ? scenes : null);

  const bg = plan?.background || '#0a0a12';

  return (
    <AbsoluteFill style={{backgroundColor: bg, overflow: 'hidden'}}>
      <GlobalFontStyles />
      {audio ? (
        <Audio
          src={resolveAssetSrc(audio) || (audio.startsWith('http') ? audio : staticFile(audio))}
          onError={(e) => {
            console.warn('Audio tag playback error (handled safely):', e);
          }}
        />
      ) : null}

      {/* Render scene sequence when scenes exist */}
      {(() => {
        let accumulatedSec = 0;
        return allScenes && allScenes.map((scene, idx) => {
          const startSec = (scene.start_seconds !== undefined && scene.start_seconds !== null)
            ? Number(scene.start_seconds)
            : accumulatedSec;
          const durSec = Number(scene.duration_seconds) || Number(scene.duration) || 3;
          accumulatedSec = startSec + durSec;
          const startFrame = Math.round(startSec * fps);
          const durationFrames = Math.max(1, Math.round(durSec * fps));
          return (
            <Sequence
              key={`scene-${idx}-${scene.id || idx}`}
              from={startFrame}
              durationInFrames={durationFrames}
            >
              <SceneTransition
                transition={scene.transition || 'crossfade'}
                cameraMotion={scene.camera_motion || 'slow_zoom_in'}
                durationInFrames={durationFrames}
              >
                <SceneSwitch scene={scene} logo={logo} />
              </SceneTransition>

              {/* Subtitles: Only displayed when explicit caption or subtitle track is active, NEVER raw voiceover */}
              {Boolean(scene.caption || (scene.subtitle && scene.show_subtitle)) && (
                <SubtitleOverlay
                  text={scene.caption || scene.subtitle}
                  accent={scene.accent || '#00f2fe'}
                />
              )}
            </Sequence>
          );
        });
      })()}
    </AbsoluteFill>
  );
}

// Legacy Composition Aliases
export function DashboardShowcase(props) {
  return <ScreenCaptureFrame {...props} />;
}
export function TitleCard(props) {
  return <KineticText {...props} />;
}
export function LowerThird({name = 'Name', role = 'Role', accent = '#00f2fe'}) {
  const {width, height} = useVideoConfig();
  const theme = getTheme(width, height);
  return (
    <AbsoluteFill style={{background: 'transparent', fontFamily: theme.fontFamilies.sans}}>
      <div style={{
        position: 'absolute',
        bottom: theme.safeMargins.bottom,
        left: theme.safeMargins.left,
        background: 'rgba(10,12,20,0.94)',
        borderLeft: `4px solid ${accent}`,
        padding: '12px 24px',
        borderRadius: '0 12px 12px 0'
      }}>
        <div style={{color: '#fff', fontSize: `${theme.typeScale.h2}px`, fontWeight: 800}}>{name}</div>
        <div style={{color: accent, fontSize: `${theme.typeScale.body}px`, fontWeight: 600}}>{role}</div>
      </div>
    </AbsoluteFill>
  );
}
export function TransparentOverlay({badgeText = 'FEATURED', stat = '10x Faster', accent = '#00f2fe'}) {
  const {width, height} = useVideoConfig();
  const theme = getTheme(width, height);
  return (
    <AbsoluteFill style={{background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: theme.fontFamilies.sans}}>
      <div style={{
        padding: '24px 36px',
        borderRadius: '20px',
        background: 'rgba(18, 18, 26, 0.94)',
        border: `2px solid ${accent}`,
        textAlign: 'center'
      }}>
        <div style={{color: accent, fontSize: `${theme.typeScale.caption}px`, fontWeight: 800, textTransform: 'uppercase'}}>{badgeText}</div>
        <div style={{color: '#ffffff', fontSize: `${theme.typeScale.display}px`, fontWeight: 900}}>{stat}</div>
      </div>
    </AbsoluteFill>
  );
}

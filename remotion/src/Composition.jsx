import React, {useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {stateAt} from './motion.mjs';

const families = {sans: 'Inter, Arial, sans-serif', serif: 'Georgia, serif', mono: 'Consolas, monospace'};

// Text layer with layout measurement so typewriter reveals don't reflow
function Text({track, state, height, width, boxHeight}) {
  const ref = useRef(null);
  const [size, setSize] = useState(track.size * height);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const intended = track.size * height;
    element.style.fontSize = `${intended}px`;
    setSize(Math.max(2, intended * Math.min(1, width / Math.max(1, element.scrollWidth), boxHeight / Math.max(1, element.scrollHeight))));
  }, [track.text, track.size, track.font, track.weight, height, width, boxHeight]);
  const common = {
    fontFamily: families[track.font] || families.sans,
    fontWeight: track.weight === 'bold' ? 700 : 400,
    whiteSpace: 'pre-wrap',
    lineHeight: 1.18,
    textAlign: track.align
  };
  return <>
    <span ref={ref} style={{...common, position:'absolute', visibility:'hidden', fontSize:track.size*height}}>{track.text}</span>
    <span style={{...common, fontSize:size}}>{track.text.slice(0, Math.ceil(track.text.length * state.reveal))}</span>
  </>;
}

// General Layer Component for Motion Rebuilds
function Layer({track, time, logo}) {
  const {width, height} = useVideoConfig();
  if (time < track.start || time >= track.end) return null;
  const state = stateAt(track, time), w = state.w * width, h = state.h * height;
  const style = {
    position: 'absolute',
    left: state.x * width,
    top: state.y * height,
    width: w,
    height: h,
    opacity: state.opacity,
    transform: `rotate(${state.rotation}deg)`,
    filter: state.blur ? `blur(${state.blur}px)` : undefined,
    color: track.color,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: {left:'flex-start', center:'center', right:'flex-end'}[track.align] || 'center'
  };
  const paint = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    clipPath: track.kind !== 'text' ? `inset(0 ${(1-state.reveal)*100}% 0 0)` : undefined
  };

  let content;
  if (track.kind === 'text') {
    content = <Text track={track} state={state} height={height} width={w} boxHeight={h}/>;
  } else if (track.kind === 'image') {
    let imgSrc = null;
    if (track.asset === 'logo' && logo) imgSrc = staticFile(logo);
    else if (track.image) imgSrc = track.image.startsWith('http') ? track.image : staticFile(track.image);
    else if (track.src) imgSrc = track.src.startsWith('http') ? track.src : staticFile(track.src);
    else if (logo) imgSrc = staticFile(logo);

    content = imgSrc ? (
      <Img
        src={imgSrc}
        style={{
          ...paint,
          objectFit: track.style?.objectFit || 'contain',
          borderRadius: track.style?.borderRadius || `${(track.radius || 0.02) * height}px`,
          boxShadow: track.style?.boxShadow || '0 20px 50px rgba(0,0,0,0.6)'
        }}
      />
    ) : null;
  } else if (track.kind === 'line') {
    content = (
      <svg width={w} height={h} style={paint}>
        <line x1="0" y1="0" x2={w} y2={h} stroke={track.color} strokeWidth={Math.max(1,track.stroke*height)}/>
      </svg>
    );
  } else {
    content = (
      <div style={{
        ...paint,
        borderRadius: track.kind==='ellipse' ? '50%' : `${(track.radius || 0) * height}px`,
        background: track.kind==='gradient' ? `linear-gradient(${track.color},${track.color2})` : track.stroke ? 'transparent' : track.color,
        border: track.stroke ? `${track.stroke*height}px solid ${track.color}` : undefined
      }}/>
    );
  }
  return <div style={style}>{content}</div>;
}

// 1. Full Motion Reconstructed Composition
export function MotionComposition(props) {
  const {plan, audio, logo, scene_plan, scenes} = props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const allScenes = (scene_plan?.scenes && scene_plan.scenes.length > 0)
    ? scene_plan.scenes
    : (scenes && scenes.length > 0 ? scenes : null);

  const bg = plan?.background || '#0a0a0f';

  return (
    <AbsoluteFill style={{backgroundColor: bg, overflow: 'hidden'}}>
      {audio ? <Audio src={audio.startsWith('http') ? audio : staticFile(audio)} /> : null}

      {/* Render scene sequence when scenes exist */}
      {(() => {
        let accumulatedSec = 0;
        return allScenes && allScenes.map((scene, idx) => {
          const startSec = (scene.start_seconds !== undefined && scene.start_seconds !== null)
            ? Number(scene.start_seconds)
            : accumulatedSec;
          const durSec = Number(scene.duration_seconds) || 3;
          accumulatedSec = startSec + durSec;
          const startFrame = Math.round(startSec * fps);
          const durationFrames = Math.max(1, Math.round(durSec * fps));
          return (
            <Sequence
              key={`scene-${idx}-${scene.id || idx}`}
              from={startFrame}
              durationInFrames={durationFrames}
            >
              <SceneSwitch scene={scene} logo={logo} />
            </Sequence>
          );
        });
      })()}

      {/* Render overlay tracks from plan (animated text, graphics, subtitles) */}
      {plan?.tracks && plan.tracks.map((track, index) => (
        <Layer key={`${index}-${track.id}`} track={track} time={frame / fps} logo={logo} />
      ))}
    </AbsoluteFill>
  );
}

// 2. Pro Website & Dashboard Screenshot Showcase
// Includes: Spring enter/exit, subtle floating life, animated mouse cursor with click & expanding ripple
export function DashboardShowcase(props) {
  const frame = useCurrentFrame();
  const {fps, durationInFrames, width, height} = useVideoConfig();

  const title = props.title || 'Next-Gen Analytics Platform';
  const subtitle = props.subtitle || 'Real-time Telemetry & Autonomous AI Workflows';
  const accent = props.accentColor || '#00f2fe';
  const bg = props.backgroundColor || '#0a0a0f';
  const clickXNorm = props.clickX ?? 0.72;
  const clickYNorm = props.clickY ?? 0.38;
  const imageSrc = props.image ? (props.image.startsWith('http') ? props.image : staticFile(props.image)) : null;

  // Spring Entrance (damping 12, mass 0.8 with overshoot)
  const enterProgress = spring({
    frame,
    fps,
    config: {damping: 12, mass: 0.8, stiffness: 100}
  });

  // Clean Exit before clip finishes
  const exitFrames = 25;
  const exitProgress = interpolate(
    frame,
    [durationInFrames - exitFrames, durationInFrames],
    [0, 1],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );

  // Subtle Life: gentle float bobbing
  const floatY = Math.sin((frame) / 16) * 8;
  const glowPulse = 0.4 + 0.2 * Math.sin(frame / 20);

  // Scale and opacity combined
  const scale = (0.85 + enterProgress * 0.15) * (1 - exitProgress * 0.08);
  const opacity = enterProgress * (1 - exitProgress);

  // Card dimensions
  const cardW = Math.round(width * 0.82);
  const cardH = Math.round(height * 0.56);
  const cardX = Math.round((width - cardW) / 2);
  const cardY = Math.round((height - cardH) / 2 + 50 + floatY);

  // Mouse Cursor Click Animation
  // Arrives at frame 35, clicks at frame 50, ripples at 52-68, departs at 75
  const clickFrame = 50;
  const cursorEnter = spring({
    frame: frame - 25,
    fps,
    config: {damping: 14, mass: 0.9}
  });
  const cursorDepress = spring({
    frame: frame - clickFrame,
    fps,
    config: {damping: 10, mass: 0.5, stiffness: 200}
  });
  const cursorDepressScale = interpolate(cursorDepress, [0, 0.5, 1], [1, 0.82, 1], {extrapolateRight: 'clamp'});

  const cursorTargetX = cardX + Math.round(cardW * clickXNorm);
  const cursorTargetY = cardY + Math.round(cardH * clickYNorm);

  const cursorStartX = width * 0.92;
  const cursorStartY = height * 0.95;

  const curX = interpolate(cursorEnter, [0, 1], [cursorStartX, cursorTargetX]);
  const curY = interpolate(cursorEnter, [0, 1], [cursorStartY, cursorTargetY]);

  // Ripple Wave Expansion on click
  const rippleProgress = interpolate(
    frame,
    [clickFrame, clickFrame + 22],
    [0, 1],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );
  const rippleScale = interpolate(rippleProgress, [0, 1], [0.1, 2.6]);
  const rippleOpacity = interpolate(rippleProgress, [0, 0.2, 1], [0, 0.9, 0]);

  return (
    <AbsoluteFill style={{backgroundColor: bg, overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif'}}>
      {/* Background radial ambient glow */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '800px',
        height: '600px',
        background: `radial-gradient(circle, ${accent}25 0%, transparent 70%)`,
        pointerEvents: 'none',
        filter: 'blur(60px)'
      }} />

      {/* Title-Safe Header Bar */}
      <div style={{
        position: 'absolute',
        top: Math.round(height * 0.08),
        left: '10%',
        right: '10%',
        textAlign: 'center',
        opacity,
        transform: `translateY(${interpolate(enterProgress, [0, 1], [30, 0])}px)`
      }}>
        {subtitle && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 16px',
            borderRadius: '20px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: accent,
            fontSize: `${Math.round(height * 0.016)}px`,
            fontWeight: 700,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            marginBottom: '12px'
          }}>
            <span style={{width:'8px', height:'8px', borderRadius:'50%', background:accent, boxShadow:`0 0 10px ${accent}`}} />
            {subtitle}
          </div>
        )}
        <h1 style={{
          margin: 0,
          color: '#ffffff',
          fontSize: `${Math.round(height * 0.045)}px`,
          fontWeight: 800,
          letterSpacing: '-0.5px',
          textShadow: '0 4px 24px rgba(0,0,0,0.8)'
        }}>
          {title}
        </h1>
      </div>

      {/* Main Floating Dashboard Card */}
      <div style={{
        position: 'absolute',
        left: cardX,
        top: cardY,
        width: cardW,
        height: cardH,
        opacity,
        transform: `scale(${scale})`,
        borderRadius: '16px',
        boxShadow: `0 30px 80px rgba(0,0,0,0.8), 0 0 35px ${accent}${Math.round(glowPulse * 40).toString(16).padStart(2,'0')}`,
        border: '1px solid rgba(255,255,255,0.16)',
        overflow: 'hidden',
        background: '#121218'
      }}>
        {imageSrc ? (
          <Img src={imageSrc} style={{width:'100%', height:'100%', objectFit:'cover', display:'block'}} />
        ) : (
          <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#888'}}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <p style={{marginTop:'12px', fontSize:'18px', color:'#ccc'}}>Dashboard / Website Screenshot Preview</p>
          </div>
        )}
      </div>

      {/* Animated Click Ripple Ring */}
      {frame >= clickFrame && frame <= clickFrame + 22 && (
        <div style={{
          position: 'absolute',
          left: cursorTargetX - 35,
          top: cursorTargetY - 35,
          width: '70px',
          height: '70px',
          borderRadius: '50%',
          border: `3px solid ${accent}`,
          boxShadow: `0 0 20px ${accent}`,
          transform: `scale(${rippleScale})`,
          opacity: rippleOpacity,
          pointerEvents: 'none'
        }} />
      )}

      {/* Animated Mouse Cursor */}
      {frame >= 25 && frame <= durationInFrames - 15 && (
        <div style={{
          position: 'absolute',
          left: curX,
          top: curY,
          transform: `scale(${cursorDepressScale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
          filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.7))'
        }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path
              d="M3 2 L22 17 L14 18 L19 29 L14 31 L9 20 L3 25 Z"
              fill="#ffffff"
              stroke="#000000"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {/* Synced Audio Sound Effects */}
      <Sequence from={0} durationInFrames={20}>
        <Audio src={staticFile('sfx/whoosh.wav')} volume={0.4} />
      </Sequence>
      <Sequence from={clickFrame} durationInFrames={8}>
        <Audio src={staticFile('sfx/click.wav')} volume={0.7} />
      </Sequence>
      <Sequence from={clickFrame + 2} durationInFrames={32}>
        <Audio src={staticFile('sfx/chime.wav')} volume={0.35} />
      </Sequence>
      <Sequence from={Math.max(0, durationInFrames - 22)} durationInFrames={20}>
        <Audio src={staticFile('sfx/swish.wav')} volume={0.35} />
      </Sequence>
    </AbsoluteFill>
  );
}

// 3. Pro Title Card (RANGY.AI Part 1 4a)
export function TitleCard({title = 'Master Title Card', subtitle = 'Clean Motion Graphic', accent = '#00f2fe', bg = '#0b0b12'}) {
  const frame = useCurrentFrame();
  const {fps, durationInFrames, width, height} = useVideoConfig();

  const enter = spring({frame, fps, config: {damping: 12, mass: 0.8}});
  const exit = interpolate(frame, [durationInFrames - 20, durationInFrames], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const opacity = enter * (1 - exit);
  const scale = (0.9 + enter * 0.1) * (1 - exit * 0.05);

  return (
    <AbsoluteFill style={{backgroundColor: bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter, sans-serif'}}>
      <div style={{textAlign:'center', opacity, transform:`scale(${scale})`, padding:'0 10%'}}>
        <div style={{color:accent, fontSize:`${Math.round(height*0.022)}px`, fontWeight:700, letterSpacing:'3px', textTransform:'uppercase', marginBottom:'16px'}}>
          {subtitle}
        </div>
        <h1 style={{color:'#ffffff', fontSize:`${Math.round(height*0.065)}px`, fontWeight:800, margin:0, textShadow:'0 4px 30px rgba(0,0,0,0.8)'}}>
          {title}
        </h1>
        <div style={{width:'80px', height:'4px', background:accent, margin:'24px auto 0', borderRadius:'2px'}} />
      </div>

      {/* Synced Audio Sound Effects */}
      <Sequence from={0} durationInFrames={20}>
        <Audio src={staticFile('sfx/whoosh.wav')} volume={0.45} />
      </Sequence>
      <Sequence from={15} durationInFrames={35}>
        <Audio src={staticFile('sfx/chime.wav')} volume={0.4} />
      </Sequence>
      <Sequence from={Math.max(0, durationInFrames - 20)} durationInFrames={20}>
        <Audio src={staticFile('sfx/swish.wav')} volume={0.35} />
      </Sequence>
    </AbsoluteFill>
  );
}

// 4. Pro Lower Third (RANGY.AI Part 1 4b)
export function LowerThird({name = 'Alex Morgan', role = 'Founder & CEO · Linear', accent = '#00f2fe'}) {
  const frame = useCurrentFrame();
  const {fps, durationInFrames, height} = useVideoConfig();

  const enter = spring({frame, fps, config: {damping: 14, mass: 0.9}});
  const exit = interpolate(frame, [durationInFrames - 20, durationInFrames], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const slideX = interpolate(enter, [0, 1], [-120, 0]) - exit * 150;
  const opacity = enter * (1 - exit);

  return (
    <AbsoluteFill style={{background:'transparent', pointerEvents:'none', fontFamily:'Inter, sans-serif'}}>
      <div style={{
        position: 'absolute',
        bottom: Math.round(height * 0.12),
        left: Math.round(height * 0.08),
        opacity,
        transform: `translateX(${slideX}px)`,
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '16px 28px',
        borderRadius: '14px',
        background: 'rgba(15, 15, 23, 0.92)',
        border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(16px)'
      }}>
        <div style={{width:'4px', height:'44px', background:accent, borderRadius:'2px'}} />
        <div>
          <div style={{color:'#ffffff', fontSize:'24px', fontWeight:800}}>{name}</div>
          <div style={{color:accent, fontSize:'15px', fontWeight:600, letterSpacing:'0.5px'}}>{role}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// 5. Kinetic Text (RANGY.AI Part 1 4c)
export function KineticText({words = ['Design.', 'Build.', 'Ship.'], accent = '#00f2fe', bg = '#09090e'}) {
  const frame = useCurrentFrame();
  const {fps, height} = useVideoConfig();

  return (
    <AbsoluteFill style={{backgroundColor: bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter, sans-serif'}}>
      <div style={{display:'flex', gap:'20px'}}>
        {words.map((word, i) => {
          const sp = spring({frame: frame - i * 12, fps, config: {damping: 10, mass: 0.7, stiffness: 140}});
          return (
            <span key={i} style={{
              color: i === words.length - 1 ? accent : '#ffffff',
              fontSize: `${Math.round(height * 0.07)}px`,
              fontWeight: 900,
              transform: `scale(${sp}) translateY(${interpolate(sp, [0, 1], [40, 0])}px)`,
              opacity: sp
            }}>
              {word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// 6. Transparent Overlay Demo (RANGY.AI Part 1 4d) - Real Alpha Channel
export function TransparentOverlay({badgeText = 'FEATURED PRODUCT', stat = '10x Faster', accent = '#00f2fe'}) {
  const frame = useCurrentFrame();
  const {fps, durationInFrames, width, height} = useVideoConfig();

  const enter = spring({frame, fps, config: {damping: 12, mass: 0.8}});
  const exit = interpolate(frame, [durationInFrames - 20, durationInFrames], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const opacity = enter * (1 - exit);

  return (
    <AbsoluteFill style={{background: 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter, sans-serif'}}>
      <div style={{
        opacity,
        transform: `scale(${0.9 + enter * 0.1})`,
        padding: '24px 36px',
        borderRadius: '20px',
        background: 'rgba(18, 18, 26, 0.94)',
        border: `2px solid ${accent}`,
        boxShadow: `0 20px 60px rgba(0,0,0,0.7), 0 0 30px ${accent}40`,
        textAlign: 'center'
      }}>
        <div style={{color:accent, fontSize:'14px', fontWeight:800, letterSpacing:'2px', marginBottom:'8px'}}>{badgeText}</div>
        <div style={{color:'#ffffff', fontSize:'42px', fontWeight:900}}>{stat}</div>
      </div>
    </AbsoluteFill>
  );
}

// 6b. High-Impact Fact / Metric Card
export function FactCard({
  title = 'Autonomous Video Engine',
  stat = '10x Faster',
  subtitle = 'Engineered for High-Conversion Explainer Videos',
  accent = '#00f2fe',
  bg = '#09090e'
}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  const enter = spring({frame, fps, config: {damping: 12, mass: 0.8}});
  const scale = 0.9 + enter * 0.1;
  const opacity = enter;

  return (
    <AbsoluteFill style={{backgroundColor: bg, justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, system-ui, sans-serif'}}>
      <div style={{
        position: 'absolute',
        width: '600px',
        height: '600px',
        background: `radial-gradient(circle, ${accent}25 0%, transparent 70%)`,
        filter: 'blur(80px)',
        pointerEvents: 'none'
      }} />
      <div style={{
        transform: `scale(${scale})`,
        opacity,
        background: 'rgba(20, 20, 30, 0.85)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${accent}40`,
        borderRadius: '24px',
        padding: '48px 56px',
        textAlign: 'center',
        maxWidth: '85%',
        boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 40px ${accent}20`
      }}>
        <div style={{fontSize: `${Math.round(height * 0.07)}px`, fontWeight: 900, color: accent, letterSpacing: '-1px', marginBottom: '16px'}}>
          {stat}
        </div>
        <div style={{fontSize: `${Math.round(height * 0.035)}px`, fontWeight: 700, color: '#ffffff', marginBottom: '12px', lineHeight: 1.2}}>
          {title}
        </div>
        {subtitle && (
          <div style={{fontSize: `${Math.round(height * 0.02)}px`, color: '#a1a1aa', fontWeight: 500}}>
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

// Universal Scene Switch Component for Explainer Sequences
export function SceneSwitch({scene = {}, logo = null}) {
  const template = (scene.template || 'kinetic_text').toLowerCase();
  const headline = scene.headline || scene.title || '';
  const subtitle = scene.subtitle || '';
  const accent = scene.accent_color || '#00f2fe';
  const bg = scene.background_color || '#09090e';
  const asset = scene.assigned_asset || logo;

  switch (template) {
    case 'kinetic_text':
      return (
        <KineticText
          words={headline.split(' ').filter(Boolean)}
          accent={accent}
          bg={bg}
        />
      );
    case 'dashboard_3d_float':
      return (
        <DashboardShowcase
          title={headline}
          subtitle={subtitle}
          image={asset}
          accentColor={accent}
          backgroundColor={bg}
        />
      );
    case 'interactive_cursor_click':
      return (
        <DashboardShowcase
          title={headline}
          subtitle={subtitle}
          image={asset}
          clickX={0.72}
          clickY={0.42}
          accentColor={accent}
          backgroundColor={bg}
        />
      );
    case 'fact_card':
      return (
        <FactCard
          title={headline}
          stat={subtitle || '10x Faster'}
          subtitle={scene.voiceover_script_en || ''}
          accent={accent}
          bg={bg}
        />
      );
    case 'title_card':
      return (
        <TitleCard
          title={headline}
          subtitle={subtitle}
          accent={accent}
          bg={bg}
        />
      );
    case 'lower_third':
      return (
        <LowerThird
          name={headline}
          role={subtitle}
          accent={accent}
        />
      );
    case 'transparent_callout':
      return (
        <TransparentOverlay
          badgeText={headline}
          stat={subtitle || 'Verified'}
          accent={accent}
        />
      );
    default:
      return (
        <KineticText
          words={headline.split(' ').filter(Boolean)}
          accent={accent}
          bg={bg}
        />
      );
  }
}

// 7. KATANA 4-ENGINE: Annotated Visual Scene (Before/After Wipe Slider + SVG Callouts)
export function AnnotatedVisualScene({
  beforeImage,
  afterImage,
  callouts = [{x: 0.5, y: 0.4, title: 'Target Area', text: 'Optimized response'}],
  wipeDuration = 60,
  accent = '#00f2fe'
}) {
  const frame = useCurrentFrame();
  const {width, height, fps, durationInFrames} = useVideoConfig();

  const wipeProgress = interpolate(frame, [15, Math.min(durationInFrames - 15, 15 + wipeDuration)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const splitX = wipeProgress * width;

  return (
    <AbsoluteFill style={{backgroundColor: '#09090b', overflow: 'hidden'}}>
      {/* After image (base) */}
      {afterImage && (
        <Img src={afterImage.startsWith('http') ? afterImage : staticFile(afterImage)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      )}
      {/* Before image (clipped) */}
      {beforeImage && (
        <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', clipPath: `polygon(0 0, ${splitX}px 0, ${splitX}px 100%, 0 100%)`}}>
          <Img src={beforeImage.startsWith('http') ? beforeImage : staticFile(beforeImage)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </div>
      )}
      {/* Wipe Slider Line */}
      <div style={{position: 'absolute', left: `${splitX}px`, top: 0, bottom: 0, width: '3px', background: '#ffffff', boxShadow: `0 0 12px ${accent}`}}>
        <div style={{position: 'absolute', top: '50%', left: '-14px', width: '30px', height: '30px', borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'translateY(-50%)', boxShadow: '0 2px 8px rgba(0,0,0,0.5)'}}>
          <span style={{fontSize: '12px', color: '#09090b', fontWeight: 900}}>⇄</span>
        </div>
      </div>
      {/* SVG Callout Markers */}
      {callouts.map((c, i) => {
        const appear = spring({frame: frame - 20 - i * 10, fps, config: {damping: 12}});
        return (
          <div key={i} style={{position: 'absolute', left: `${c.x * width}px`, top: `${c.y * height}px`, transform: `translate(-50%, -50%) scale(${appear})`, opacity: appear}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(8px)', border: `1px solid ${accent}`, borderRadius: '20px', color: '#ffffff', fontSize: '13px', fontWeight: 700}}>
              <span style={{width: '8px', height: '8px', borderRadius: '50%', background: accent}} />
              <span>{c.title}</span>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

// 8. KATANA 4-ENGINE: Speaker Tracker Scene (Portrait 9:16 Crop + Dynamic Centering)
export function SpeakerTrackerScene({
  videoSrc,
  speakerTrack = {cx: 0.5, cy: 0.35, zoom: 1.2},
  activeWord = 'Impact',
  accent = '#00f2fe'
}) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  return (
    <AbsoluteFill style={{backgroundColor: '#09090b', overflow: 'hidden'}}>
      {videoSrc && (
        <OffthreadVideo
          src={videoSrc.startsWith('http') ? videoSrc : staticFile(videoSrc)}
          style={{
            position: 'absolute',
            width: `${100 * (speakerTrack.zoom || 1.2)}%`,
            height: `${100 * (speakerTrack.zoom || 1.2)}%`,
            left: `${(0.5 - speakerTrack.cx) * 100}%`,
            top: `${(0.5 - speakerTrack.cy) * 100}%`,
            objectFit: 'cover'
          }}
          autoPlay
          muted
          playsInline
        />
      )}
      {/* Dynamic Word-Pop Caption */}
      <div style={{position: 'absolute', bottom: '15%', left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
        <div style={{padding: '10px 24px', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', borderRadius: '12px', border: `1px solid ${accent}60`, color: '#ffffff', fontSize: '28px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px'}}>
          <span style={{color: accent}}>{activeWord}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// 9. KATANA 4-ENGINE: Synchronized Split-Screen Comparison
export function SplitScreenComparison({referenceVideo, rebuiltVideo, showCannyOverlay = false, cannySrc = null}) {
  return (
    <AbsoluteFill style={{display: 'flex', flexDirection: 'row', backgroundColor: '#09090b'}}>
      {/* Left: Reference Viewport */}
      <div style={{flex: 1, position: 'relative', borderRight: '1px solid #27272a', overflow: 'hidden'}}>
        <div style={{position: 'absolute', top: 12, left: 12, zIndex: 10, padding: '4px 8px', background: 'rgba(0,0,0,0.7)', borderRadius: '4px', color: '#a1a1aa', fontSize: '11px', fontFamily: 'monospace'}}>
          ORIGINAL REFERENCE
        </div>
        {referenceVideo && <OffthreadVideo src={referenceVideo} style={{width: '100%', height: '100%', objectFit: 'contain'}} autoPlay muted playsInline />}
        {showCannyOverlay && cannySrc && (
          <Img src={cannySrc} style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'screen', opacity: 0.8}} />
        )}
      </div>
      {/* Right: Rebuilt Engine Output */}
      <div style={{flex: 1, position: 'relative', overflow: 'hidden'}}>
        <div style={{position: 'absolute', top: 12, left: 12, zIndex: 10, padding: '4px 8px', background: 'rgba(0,0,0,0.7)', borderRadius: '4px', color: '#00f2fe', fontSize: '11px', fontFamily: 'monospace'}}>
          KATANA RECONSTRUCTION
        </div>
        {rebuiltVideo && <OffthreadVideo src={rebuiltVideo} style={{width: '100%', height: '100%', objectFit: 'contain'}} autoPlay muted playsInline />}
      </div>
    </AbsoluteFill>
  );
}

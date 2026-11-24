import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {
  MotionComposition,
  KineticText,
  FactCard,
  StatCounter,
  ComparisonSplit,
  BulletList,
  QuoteScene,
  ImageFullBleed,
  ScreenCaptureFrame,
  CtaEndCard,
  SceneSwitch,
  DashboardShowcase,
  TitleCard,
  LowerThird,
  TransparentOverlay
} from './Composition.jsx';
import {CharacterStory} from './templates/CharacterStory.jsx';
import {StickmanCharacter} from './components/StickmanCharacter.jsx';
import {AnimatedProp} from './components/AnimatedProps.jsx';
import {CashFlowSplit, TimelineGap, AnimatedBarChart} from './components/DataVisualizations.jsx';
import {DynamicEnvironment} from './components/DynamicEnvironment.jsx';
import {LayeredScene} from './components/LayeredScene.jsx';
import {IconSheet} from './explainer/IconSheet.jsx';
import {PersonSheet} from './science/PersonSheet.jsx';
import {PropSheet} from './science/PropSheet.jsx';
import {IconExplainer} from './explainer/IconExplainer.jsx';

/**
 * Derives width, height, fps, and durationInFrames from inputProps.
 * Supports:
 * - 9:16 (1080x1920)
 * - 16:9 (1920x1080)
 * - 1:1  (1080x1080)
 * Default: 30 fps.
 * Duration: strictly sum of scene durations (default 30s).
 */
function resolveDimensions(props) {
  const aspect = props?.media?.aspect || props?.aspect || '9:16';
  let width = props?.media?.width;
  let height = props?.media?.height;

  if (!width || !height) {
    if (aspect === '16:9') {
      width = 1920;
      height = 1080;
    } else if (aspect === '1:1') {
      width = 1080;
      height = 1080;
    } else {
      width = 1080;
      height = 1920; // Default 9:16 vertical reel
    }
  }

  // Canonical MotionClone V3 Frame Rate: 30 FPS strictly. 60 FPS is not supported.
  const fps = 30;

  const allScenes = (props?.scene_plan?.scenes && Array.isArray(props.scene_plan.scenes) && props.scene_plan.scenes.length > 0)
    ? props.scene_plan.scenes
    : (Array.isArray(props?.scenes) && props.scenes.length > 0 ? props.scenes : null);

  let durationSec = 0;
  if (allScenes && allScenes.length > 0) {
    durationSec = allScenes.reduce((sum, s) => sum + (Number(s.duration_seconds) || Number(s.duration) || 0), 0);
  } else if (props?.duration_seconds || props?.duration) {
    durationSec = Number(props.duration_seconds || props.duration);
  } else if (props?.media?.duration) {
    durationSec = Number(props.media.duration);
  }
  if (!durationSec || durationSec <= 0) {
    durationSec = 30.0;
  }

  const durationInFrames = Math.max(1, Math.ceil(durationSec * fps));
  return {width, height, fps, durationInFrames};
}

function Root() {
  const defaultMeta = resolveDimensions({aspect: '9:16'});

  return (
    <>
      {/* 1. Main Reconstructed Explainer & Layer Composition */}
      <Composition
        id="Motion"
        component={MotionComposition}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={defaultMeta.durationInFrames}
        calculateMetadata={async ({props}) => {
          const meta = resolveDimensions(props);
          return {
            width: meta.width,
            height: meta.height,
            fps: 30,
            durationInFrames: meta.durationInFrames,
            props: {
              ...props,
              media: {
                ...(props?.media || {}),
                width: meta.width,
                height: meta.height,
                fps: 30,
                duration: meta.durationInFrames / 30
              }
            }
          };
        }}
        defaultProps={{
          media: {width: 1080, height: 1920, fps: 30, duration: 30.0},
          plan: {title: 'MotionClone Explainer', background: '#0a0a0f', tracks: []}
        }}
      />

      {/* 2. Registered Scene Templates (kebab-case & PascalCase aliases) */}
      
      {/* A. kinetic-text / KineticText */}
      <Composition
        id="kinetic-text"
        component={KineticText}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          words: ['Capture.', 'Animate.', 'Export.'],
          accent: '#00f2fe',
          bg: '#09090e'
        }}
      />
      <Composition
        id="KineticText"
        component={KineticText}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          words: ['Capture.', 'Animate.', 'Export.'],
          accent: '#00f2fe',
          bg: '#09090e'
        }}
      />

      {/* B. dashboard-3d-float / DashboardShowcase */}
      <Composition
        id="dashboard-3d-float"
        component={DashboardShowcase}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={120}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          title: 'Next-Gen Analytics & AI Platform',
          subtitle: 'Real-Time Telemetry & Autonomous Workflows',
          accentColor: '#00f2fe',
          backgroundColor: '#0a0a0f',
          image: null
        }}
      />
      <Composition
        id="DashboardShowcase"
        component={DashboardShowcase}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={120}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          title: 'Next-Gen Analytics & AI Platform',
          subtitle: 'Real-Time Telemetry & Autonomous Workflows',
          accentColor: '#00f2fe',
          backgroundColor: '#0a0a0f',
          image: null
        }}
      />

      {/* C. interactive-cursor-click / InteractiveCursorClick */}
      <Composition
        id="interactive-cursor-click"
        component={DashboardShowcase}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={120}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          title: 'Interactive UI Simulation',
          subtitle: 'Smooth Cursor Click & Dynamic Ripple Wave',
          accentColor: '#00f2fe',
          backgroundColor: '#0a0a0f',
          clickX: 0.72,
          clickY: 0.42
        }}
      />
      <Composition
        id="InteractiveCursorClick"
        component={DashboardShowcase}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={120}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          title: 'Interactive UI Simulation',
          subtitle: 'Smooth Cursor Click & Dynamic Ripple Wave',
          accentColor: '#00f2fe',
          backgroundColor: '#0a0a0f',
          clickX: 0.72,
          clickY: 0.42
        }}
      />

      {/* D. fact-card / FactCard */}
      <Composition
        id="fact-card"
        component={FactCard}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          title: 'Autonomous Production Speed',
          stat: '10x Faster',
          subtitle: 'Engineered for High-Conversion Explainer Videos',
          accent: '#00f2fe',
          bg: '#09090e'
        }}
      />
      <Composition
        id="FactCard"
        component={FactCard}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          title: 'Autonomous Production Speed',
          stat: '10x Faster',
          subtitle: 'Engineered for High-Conversion Explainer Videos',
          accent: '#00f2fe',
          bg: '#09090e'
        }}
      />

      {/* E. title-card / TitleCard */}
      <Composition
        id="title-card"
        component={TitleCard}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          title: 'Autonomous Motion Studio',
          subtitle: 'Crafted with AI & Remotion',
          accent: '#00f2fe',
          bg: '#0b0b12'
        }}
      />
      <Composition
        id="TitleCard"
        component={TitleCard}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          title: 'Autonomous Motion Studio',
          subtitle: 'Crafted with AI & Remotion',
          accent: '#00f2fe',
          bg: '#0b0b12'
        }}
      />

      {/* F. lower-third / LowerThird */}
      <Composition
        id="lower-third"
        component={LowerThird}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          name: 'Alex Rivera',
          role: 'Lead Architect · Cloud AI',
          accent: '#00f2fe'
        }}
      />
      <Composition
        id="LowerThird"
        component={LowerThird}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          name: 'Alex Rivera',
          role: 'Lead Architect · Cloud AI',
          accent: '#00f2fe'
        }}
      />

      {/* G. transparent-callout / TransparentOverlay */}
      <Composition
        id="transparent-callout"
        component={TransparentOverlay}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          badgeText: 'VERIFIED 30 FPS EXPORT',
          stat: 'Zero Friction',
          accent: '#00f2fe'
        }}
      />
      <Composition
        id="TransparentOverlay"
        component={TransparentOverlay}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          badgeText: 'VERIFIED 30 FPS EXPORT',
          stat: 'Zero Friction',
          accent: '#00f2fe'
        }}
      />
      {/* H. character-story / CharacterStory */}
      <Composition
        id="character-story"
        component={CharacterStory}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          onScreenText: 'Where Did The Cash Go?',
          visualMetaphor: 'Working Capital Trap',
          characterPose: 'confused',
          propType: 'money_stack',
          propAmount: '₹10 LAKH',
          artDirection: 'editorial_flat',
          accent: '#00f2fe'
        }}
      />
      {/* I. layered-scene: generated transparent assets over a 3-plate set (see src/layered.mjs) */}
      <Composition
        id="layered-scene"
        component={LayeredScene}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{layered: {}}}
      />
      <Composition
        id="icon-explainer"
        component={IconExplainer}
        width={720}
        height={1280}
        fps={30}
        durationInFrames={90}
        defaultProps={{scene: {duration_seconds: 3, words: [{w: 'ki', start: .3, end: .5}, {w: 'wo', start: .5, end: .7}, {w: 'Gold', start: .7, end: 1.0}, {w: 'ko', start: 1.0, end: 1.2}, {w: 'lab', start: 1.4, end: 1.7}, {w: 'mein', start: 1.7, end: 1.9}, {w: 'bana', start: 1.9, end: 2.2}, {w: 'sakta', start: 2.2, end: 2.5}], icon: {id: 'flask'}, pill: {tag: 'News', text: 'Startup says it can make gold in a lab', at: .5}}}}
      />
      <Composition
        id="prop-sheet"
        component={PropSheet}
        width={720}
        height={1280}
        fps={30}
        durationInFrames={90}
        defaultProps={{atSeconds: null}}
      />
      <Composition
        id="person-sheet"
        component={PersonSheet}
        width={720}
        height={1280}
        fps={30}
        durationInFrames={90}
        defaultProps={{atSeconds: null}}
      />
      <Composition
        id="icon-sheet"
        component={IconSheet}
        width={720}
        height={1280}
        fps={30}
        durationInFrames={90}
        defaultProps={{atSeconds: null, d: 3}}
      />
      <Composition
        id="CharacterStory"
        component={CharacterStory}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          onScreenText: 'Where Did The Cash Go?',
          visualMetaphor: 'Working Capital Trap',
          characterPose: 'confused',
          propType: 'money_stack',
          propAmount: '₹10 LAKH',
          artDirection: 'editorial_flat',
          accent: '#00f2fe'
        }}
      />
      <Composition
        id="ThreeDStory"
        component={CharacterStory}
        width={defaultMeta.width}
        height={defaultMeta.height}
        fps={defaultMeta.fps}
        durationInFrames={90}
        calculateMetadata={async ({props}) => resolveDimensions(props)}
        defaultProps={{
          scene: {
            template: 'three_d_story',
            render_mode: '3d',
            character_mode: '3d',
            headline: '3D Autonomous Storytelling Engine',
            on_screen_text: '3D Storytelling Engine',
            visual_metaphor: 'Spatial Motion',
            character_pose: 'walking',
            prop_type: 'laptop',
            accent: '#00f2fe',
            bg: '#0a0a12',
            three_d: {
              environment: 'office',
              camera: {move: 'push_in', intensity: 0.7}
            }
          }
        }}
      />
    </>
  );
}

registerRoot(Root);

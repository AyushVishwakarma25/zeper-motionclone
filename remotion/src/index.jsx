import React from 'react';
import {Composition, registerRoot, delayRender, continueRender, cancelRender, staticFile} from 'remotion';
import {
  MotionComposition,
  DashboardShowcase,
  TitleCard,
  LowerThird,
  KineticText,
  TransparentOverlay
} from './Composition.jsx';

function Root() {
  const [handle] = React.useState(() => delayRender('Loading saved motion'));
  const [project, setProject] = React.useState(null);

  React.useEffect(() => {
    fetch(staticFile('project.json'))
      .then(r => {
        if (!r.ok) throw new Error('Project not found');
        return r.json();
      })
      .then(data => {
        setProject(data);
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [handle]);

  const defaultWidth = project?.media?.width || 1920;
  const defaultHeight = project?.media?.height || 1080;
  const defaultFps = project?.media?.fps || 30;
  const defaultDuration = project?.media?.duration ? Math.ceil(project.media.duration * defaultFps) : 150;

  return (
    <>
      {/* 1. Main Reconstructed Motion Graphic */}
      {project && (
        <Composition
          id="Motion"
          component={MotionComposition}
          width={project.media.width}
          height={project.media.height}
          fps={project.media.fps}
          durationInFrames={Math.ceil(project.media.duration * project.media.fps)}
          defaultProps={project}
          calculateMetadata={({props}) => ({
            width: props.media.width,
            height: props.media.height,
            fps: props.media.fps,
            durationInFrames: Math.ceil(props.media.duration * props.media.fps)
          })}
        />
      )}

      {/* 2. Website & Dashboard Screenshot Animator Showcase */}
      <Composition
        id="DashboardShowcase"
        component={DashboardShowcase}
        width={defaultWidth}
        height={defaultHeight}
        fps={defaultFps}
        durationInFrames={180}
        defaultProps={{
          title: 'Next-Gen Analytics & AI Platform',
          subtitle: 'Real-Time Telemetry & Autonomous Workflows',
          accentColor: '#00f2fe',
          backgroundColor: '#0a0a0f',
          clickX: 0.72,
          clickY: 0.38,
          image: project?.assets?.[0] || 'logo.png'
        }}
      />

      {/* 3. Title Card (RANGY.AI Starter Kit 4a) */}
      <Composition
        id="TitleCard"
        component={TitleCard}
        width={defaultWidth}
        height={defaultHeight}
        fps={defaultFps}
        durationInFrames={120}
        defaultProps={{
          title: 'Autonomous Motion Studio',
          subtitle: 'Crafted with AI & Remotion',
          accent: '#00f2fe',
          bg: '#0b0b12'
        }}
      />

      {/* 4. Lower Third (RANGY.AI Starter Kit 4b) */}
      <Composition
        id="LowerThird"
        component={LowerThird}
        width={defaultWidth}
        height={defaultHeight}
        fps={defaultFps}
        durationInFrames={120}
        defaultProps={{
          name: 'Alex Rivera',
          role: 'Lead Architect · Cloud AI',
          accent: '#00f2fe'
        }}
      />

      {/* 5. Kinetic Text Reveal (RANGY.AI Starter Kit 4c) */}
      <Composition
        id="KineticText"
        component={KineticText}
        width={defaultWidth}
        height={defaultHeight}
        fps={defaultFps}
        durationInFrames={120}
        defaultProps={{
          words: ['Capture.', 'Animate.', 'Export.'],
          accent: '#00f2fe',
          bg: '#09090e'
        }}
      />

      {/* 6. Transparent Overlay Badge (RANGY.AI Starter Kit 4d) */}
      <Composition
        id="TransparentOverlay"
        component={TransparentOverlay}
        width={defaultWidth}
        height={defaultHeight}
        fps={defaultFps}
        durationInFrames={120}
        defaultProps={{
          badgeText: 'VERIFIED 60 FPS EXPORT',
          stat: 'Zero Friction',
          accent: '#00f2fe'
        }}
      />
    </>
  );
}

registerRoot(Root);

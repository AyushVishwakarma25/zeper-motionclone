import React from 'react';
import {useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill} from 'remotion';

/**
 * SceneTransition
 * Wraps scene contents and applies entrance transitions, exit transitions,
 * and continuous cinematic camera motion (slow zoom, pan, drift).
 *
 * Supported transition types:
 * - 'wipe-left', 'wipe-right'
 * - 'push-left', 'push-right'
 * - 'zoom-in', 'zoom-out'
 * - 'crossfade', 'fade'
 * - 'mask-reveal', 'circle-mask'
 * - 'slide-up'
 * - 'cut', 'none'
 *
 * Supported camera_motion types:
 * - 'slow_zoom_in', 'slow_zoom_out'
 * - 'pan_right', 'pan_left'
 * - 'subtle_drift'
 */
export function SceneTransition({
  children,
  transition = 'crossfade',
  cameraMotion = 'slow_zoom_in',
  durationInFrames = 90,
  transitionDuration = 12,
  style = {}
}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  const transType = (transition || 'crossfade').toLowerCase().trim();
  const transFrames = Math.min(transitionDuration, Math.floor(durationInFrames / 3));

  // Entrance spring progress (0 -> 1)
  const enterSpring = spring({
    frame,
    fps,
    config: {damping: 18, mass: 0.8, stiffness: 120}
  });

  // Linear entrance progress for clip-path/fade
  const enterLinear = interpolate(frame, [0, transFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  // Exit progress (0 at start of exit, 1 at end)
  const exitStart = Math.max(0, durationInFrames - transFrames);
  const exitProgress = interpolate(frame, [exitStart, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  // Camera Motion Progress across entire scene (0 -> 1)
  const sceneProgress = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  // Calculate Transition Transforms & Styles
  let enterStyle = {};
  let clipPath = undefined;

  switch (transType) {
    case 'wipe-left':
      // Clip path reveal from right to left
      const wipeLeftPct = interpolate(enterLinear, [0, 1], [100, 0]);
      clipPath = `inset(0 ${wipeLeftPct}% 0 0)`;
      break;

    case 'wipe-right':
      // Clip path reveal from left to right
      const wipeRightPct = interpolate(enterLinear, [0, 1], [100, 0]);
      clipPath = `inset(0 0 0 ${wipeRightPct}%)`;
      break;

    case 'push-left':
      // Slide in from right (100% -> 0%)
      const pushXLeft = interpolate(enterSpring, [0, 1], [width * 0.7, 0]);
      enterStyle = {
        transform: `translateX(${pushXLeft}px)`,
        opacity: interpolate(enterLinear, [0, 0.4], [0, 1], {extrapolateRight: 'clamp'})
      };
      break;

    case 'push-right':
      // Slide in from left (-100% -> 0%)
      const pushXRight = interpolate(enterSpring, [0, 1], [-width * 0.7, 0]);
      enterStyle = {
        transform: `translateX(${pushXRight}px)`,
        opacity: interpolate(enterLinear, [0, 0.4], [0, 1], {extrapolateRight: 'clamp'})
      };
      break;

    case 'zoom-in':
      // Scale up from 0.82 to 1.0
      const zoomScale = interpolate(enterSpring, [0, 1], [0.85, 1.0]);
      enterStyle = {
        transform: `scale(${zoomScale})`,
        opacity: interpolate(enterLinear, [0, 0.5], [0, 1], {extrapolateRight: 'clamp'})
      };
      break;

    case 'zoom-out':
      // Scale down from 1.15 to 1.0
      const zoomOutScale = interpolate(enterSpring, [0, 1], [1.15, 1.0]);
      enterStyle = {
        transform: `scale(${zoomOutScale})`,
        opacity: interpolate(enterLinear, [0, 0.5], [0, 1], {extrapolateRight: 'clamp'})
      };
      break;

    case 'mask-reveal':
    case 'circle-mask':
      // Expanding circle mask from center
      const maskRadius = interpolate(enterSpring, [0, 1], [0, 150]);
      clipPath = `circle(${maskRadius}% at 50% 50%)`;
      break;

    case 'slide-up':
      // Slide up from bottom
      const slideY = interpolate(enterSpring, [0, 1], [120, 0]);
      enterStyle = {
        transform: `translateY(${slideY}px)`,
        opacity: interpolate(enterLinear, [0, 0.4], [0, 1], {extrapolateRight: 'clamp'})
      };
      break;

    case 'cut':
    case 'none':
      enterStyle = {};
      break;

    case 'crossfade':
    case 'fade':
    default:
      enterStyle = {
        opacity: enterLinear
      };
      break;
  }

  // Camera Motion (continuous subtle scale/pan)
  let cameraTransform = '';
  const motionMode = (cameraMotion || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (motionMode === 'slow_zoom_in' || motionMode === 'slow_push_in' || motionMode === 'push_in') {
    const s = interpolate(sceneProgress, [0, 1], [1.0, 1.05]);
    cameraTransform = `scale(${s})`;
  } else if (motionMode === 'slow_zoom_out') {
    const s = interpolate(sceneProgress, [0, 1], [1.05, 1.0]);
    cameraTransform = `scale(${s})`;
  } else if (motionMode === 'pan_right') {
    const px = interpolate(sceneProgress, [0, 1], [-20, 20]);
    cameraTransform = `translateX(${px}px) scale(1.03)`;
  } else if (motionMode === 'pan_left') {
    const px = interpolate(sceneProgress, [0, 1], [20, -20]);
    cameraTransform = `translateX(${px}px) scale(1.03)`;
  } else if (motionMode === 'subtle_drift' || motionMode === 'gentle_drift') {
    const s = interpolate(sceneProgress, [0, 1], [1.0, 1.03]);
    const py = interpolate(sceneProgress, [0, 1], [0, -15]);
    cameraTransform = `scale(${s}) translateY(${py}px)`;
  } else if (motionMode === 'shake_impact') {
    // Subtle impact settle on entry (first 10 frames)
    const shakeProgress = interpolate(frame, [0, 10], [1, 0], {extrapolateRight: 'clamp'});
    const shakeX = Math.sin(frame * 2.5) * 8 * shakeProgress;
    const shakeY = Math.cos(frame * 3.0) * 6 * shakeProgress;
    cameraTransform = `translate(${shakeX}px, ${shakeY}px)`;
  }

  // Combine transforms
  const finalTransform = [enterStyle.transform, cameraTransform].filter(Boolean).join(' ');

  // Exit fade out slightly at very end for smoother cross-scene transitions
  const exitOpacity = exitProgress > 0 ? interpolate(exitProgress, [0, 1], [1, 0.85]) : 1;
  const combinedOpacity = (enterStyle.opacity !== undefined ? enterStyle.opacity : 1) * exitOpacity;

  return (
    <AbsoluteFill
      style={{
        ...enterStyle,
        transform: finalTransform || undefined,
        opacity: combinedOpacity,
        clipPath: clipPath || undefined,
        WebkitClipPath: clipPath || undefined,
        transformOrigin: 'center center',
        overflow: 'hidden',
        ...style
      }}
    >
      {children}
    </AbsoluteFill>
  );
}
export default SceneTransition;

import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {cameraPoseAtFrame, normalizeThreeDScene} from './scene3d.mjs';
import {buildStickman3D, applyStickmanPose} from './stickman3d.mjs';
import {buildProp3D} from './props3d.mjs';
import {addEnvironment3D} from './environments3d.mjs';
import {ThreeDFallbackView} from './ThreeDFallbackView.jsx';

/**
 * Synchronous WebGL check helper.
 */
export function isWebGLAvailable() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

function geometryForPrimitive(item) {
  const [w, h, d] = item.size;
  switch (item.type) {
    case 'sphere':
      return new THREE.SphereGeometry(w / 2, 24, 16);
    case 'cylinder':
      return new THREE.CylinderGeometry(w / 2, w / 2, h, 24);
    case 'cone':
      return new THREE.ConeGeometry(w / 2, h, 24);
    case 'torus':
      return new THREE.TorusGeometry(w / 2, Math.max(0.05, d / 5), 12, 32);
    default:
      return new THREE.BoxGeometry(w, h, d);
  }
}

function buildWorld(canvas, config, width, height) {
  const scene = new THREE.Scene();
  addEnvironment3D(THREE, scene, config);

  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 200);
  camera.position.set(0, 3.8, 8.8);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  // Scene Lighting
  const hemi = new THREE.HemisphereLight('#ffffff', '#334155', 2.2);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight('#fff7ed', 3.0);
  keyLight.position.set(-4, 9, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 40;
  keyLight.shadow.camera.left = -15;
  keyLight.shadow.camera.right = 15;
  keyLight.shadow.camera.top = 15;
  keyLight.shadow.camera.bottom = -15;
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight('#93c5fd', 1.2);
  fillLight.position.set(6, 4, -3);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight('#38bdf8', 0.8);
  rimLight.position.set(0, 6, -8);
  scene.add(rimLight);

  // 3D Stickman Character
  let stickmanRig = null;
  if (config.character?.enabled !== false && config.character?.mode === '3d') {
    stickmanRig = buildStickman3D(THREE, {
      shirtColor: config.character.shirtColor,
      scale: config.character.scale
    });
    stickmanRig.root.position.set(...config.character.position);
    stickmanRig.root.rotation.set(...config.character.rotation);
    scene.add(stickmanRig.root);
  }

  // Reusable 3D Prop
  let mainPropGroup = null;
  if (config.prop) {
    mainPropGroup = buildProp3D(THREE, config.prop.type, {
      accent: config.character?.shirtColor
    });
    mainPropGroup.position.set(...config.prop.position);
    mainPropGroup.rotation.set(...config.prop.rotation);
    mainPropGroup.scale.setScalar(config.prop.scale);
    mainPropGroup.userData = {
      baseY: config.prop.position[1],
      motion: config.prop.motion
    };

    if (config.character?.pose === 'holding_object' && stickmanRig?.propSocket) {
      // Attach to character's hand
      mainPropGroup.position.set(0, 0, 0);
      stickmanRig.propSocket.add(mainPropGroup);
    } else {
      scene.add(mainPropGroup);
    }
  }

  // Custom 3D Objects
  const objectGroup = new THREE.Group();
  for (const item of config.objects) {
    const material = new THREE.MeshStandardMaterial({
      color: item.color,
      roughness: item.roughness,
      metalness: item.metalness
    });
    const mesh = new THREE.Mesh(geometryForPrimitive(item), material);
    mesh.position.set(...item.position);
    mesh.rotation.set(...item.rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      motion: item.motion,
      baseY: item.position[1],
      baseRotation: [...item.rotation],
      amplitude: item.motionAmplitude
    };
    objectGroup.add(mesh);
  }
  scene.add(objectGroup);

  return {
    scene,
    camera,
    renderer,
    stickmanRig,
    mainPropGroup,
    objectGroup
  };
}

export function ThreeDWorld({scene = {}, background = '#b9c7d8'}) {
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const [hasWebgl, setHasWebgl] = useState(() => isWebGLAvailable());
  const frame = useCurrentFrame();
  const {width, height, fps, durationInFrames} = useVideoConfig();

  // Normalize full 3D configuration
  const config = useMemo(
    () => normalizeThreeDScene({...scene, three_d: scene.three_d || {background}}),
    [
      scene.environment,
      scene.art_direction,
      scene.character_pose,
      scene.character_mode,
      scene.prop_type,
      scene.props,
      scene.camera_motion,
      scene.accent_color,
      scene.accent,
      background,
      scene.three_d
    ]
  );

  // Initialize and tear down Three.js
  useLayoutEffect(() => {
    if (!hasWebgl || !canvasRef.current) return undefined;

    let world;
    try {
      world = buildWorld(canvasRef.current, config, width, height);
      worldRef.current = world;
    } catch (error) {
      if (canvasRef.current) {
        canvasRef.current.dataset.webglError = String(error?.message || error);
      }
      setHasWebgl(false);
      return undefined;
    }

    return () => {
      if (!world) return;
      // Thorough disposal of all geometries, materials, and textures
      world.scene.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          if (Array.isArray(node.material)) {
            node.material.forEach((mat) => mat?.dispose?.());
          } else {
            node.material?.dispose?.();
          }
        }
      });
      world.renderer.dispose();
      world.renderer.forceContextLoss?.();
      worldRef.current = null;
    };
  }, [hasWebgl, config, width, height]);

  // Frame update
  useLayoutEffect(() => {
    const world = worldRef.current;
    if (!world) return;

    const time = frame / Math.max(1, fps);

    // 1. Camera Pose
    const pose = cameraPoseAtFrame(config.camera, frame, fps, durationInFrames);
    world.camera.position.set(pose.x, pose.y, pose.z);
    world.camera.lookAt(pose.targetX, pose.targetY, pose.targetZ);
    if (pose.roll) {
      world.camera.rotation.z = pose.roll;
    }

    // 2. 3D Stickman Character Pose
    if (world.stickmanRig) {
      applyStickmanPose(world.stickmanRig, config.character.pose, frame, fps, durationInFrames);
    }

    // 3. Main Prop Animation
    if (world.mainPropGroup && config.prop?.motion) {
      const motion = config.prop.motion;
      if (motion === 'float') {
        world.mainPropGroup.position.y = world.mainPropGroup.userData.baseY + Math.sin(time * 2.2) * 0.12;
      } else if (motion === 'rotate') {
        world.mainPropGroup.rotation.y = time * 0.9;
      } else if (motion === 'pulse') {
        const s = 1 + Math.sin(time * 3.0) * 0.08;
        world.mainPropGroup.scale.setScalar(config.prop.scale * s);
      }

      // Bar chart height animation
      if (world.mainPropGroup.userData?.bars) {
        const growth = Math.min(1, time * 1.5);
        world.mainPropGroup.userData.bars.forEach((bar) => {
          const h = bar.userData.targetHeight * growth;
          bar.scale.y = Math.max(0.01, h);
          bar.position.y = 0.08 + h / 2;
        });
      }
    }

    // 4. Custom 3D Objects Animation
    world.objectGroup.children.forEach((mesh, index) => {
      const phase = time + index * 0.7;
      const motion = mesh.userData.motion;
      if (motion === 'float') {
        mesh.position.y = mesh.userData.baseY + Math.sin(phase * 1.8) * mesh.userData.amplitude;
      } else if (motion === 'rotate') {
        mesh.rotation.y = mesh.userData.baseRotation[1] + phase * 0.8;
      } else if (motion === 'pulse') {
        const scale = 1 + Math.sin(phase * 2) * 0.08;
        mesh.scale.setScalar(scale);
      }
    });

    world.renderer.render(world.scene, world.camera);
  }, [frame, config, fps, durationInFrames]);

  // If WebGL is unavailable or failed, render the graceful isometric fallback
  if (!hasWebgl) {
    return <ThreeDFallbackView config={config} width={width} height={height} />;
  }

  return (
    <AbsoluteFill style={{backgroundColor: config.background, overflow: 'hidden', zIndex: 0}}>
      <canvas
        ref={canvasRef}
        aria-label="Procedurally rendered 3D story environment"
        style={{display: 'block', width: '100%', height: '100%'}}
      />
    </AbsoluteFill>
  );
}

export default ThreeDWorld;

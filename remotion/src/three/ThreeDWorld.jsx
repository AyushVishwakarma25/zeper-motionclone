import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {cameraPoseAtFrame, normalizeThreeDScene} from './scene3d.mjs';
import {createStickmanRig, applyStickmanPose, characterPoseAtFrame, normalizeCharacterConfig} from './characterRig.mjs';

function addEnvironment(scene, config) {
  scene.background = new THREE.Color(config.background);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({color: config.ground, roughness: 0.95})
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  scene.add(ground);

  const wallMaterial = new THREE.MeshStandardMaterial({color: '#e9edf2', roughness: 0.95});
  if (config.environment === 'room' || config.environment === 'office' || config.environment === 'studio') {
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(24, 12), wallMaterial);
    backWall.position.set(0, 6, -8);
    backWall.receiveShadow = true;
    scene.add(backWall);
    if (config.environment !== 'studio') {
      const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), wallMaterial);
      sideWall.rotation.y = Math.PI / 2;
      sideWall.position.set(-10, 6, 0);
      scene.add(sideWall);
    }
  }

  if (config.environment === 'street') {
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 9),
      new THREE.MeshStandardMaterial({color: '#414b58', roughness: 1})
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.005, 1.5);
    scene.add(road);
    for (let x = -35; x < 35; x += 5) {
      const marking = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.025, 0.12),
        new THREE.MeshBasicMaterial({color: '#f5e8bd'})
      );
      marking.position.set(x, 0.03, 1.5);
      scene.add(marking);
    }
  }

  if (config.environment === 'forest') {
    const trunkMaterial = new THREE.MeshStandardMaterial({color: '#75543c'});
    const leafMaterial = new THREE.MeshStandardMaterial({color: '#4f805e', roughness: 1});
    for (let i = 0; i < 14; i++) {
      const x = (i % 7 - 3) * 4.5;
      const z = -4 - Math.floor(i / 7) * 7;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 3.5, 7), trunkMaterial);
      trunk.position.set(x, 1.75, z);
      trunk.castShadow = true;
      scene.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), leafMaterial);
      crown.position.set(x, 4.1, z);
      crown.castShadow = true;
      scene.add(crown);
    }
  }
}

function geometryFor(item) {
  const [w, h, d] = item.size;
  switch (item.type) {
    case 'sphere': return new THREE.SphereGeometry(w / 2, 24, 16);
    case 'cylinder': return new THREE.CylinderGeometry(w / 2, w / 2, h, 24);
    case 'cone': return new THREE.ConeGeometry(w / 2, h, 24);
    case 'torus': return new THREE.TorusGeometry(w / 2, Math.max(0.05, d / 5), 12, 32);
    default: return new THREE.BoxGeometry(w, h, d);
  }
}

function buildWorld(canvas, config, width, height) {
  const scene = new THREE.Scene();
  addEnvironment(scene, config);

  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 180);
  camera.position.set(0, 5.2, 12);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: true
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene.add(new THREE.HemisphereLight('#ffffff', '#64748b', 2.0));
  const key = new THREE.DirectionalLight('#fff4df', 3.2);
  key.position.set(-5, 10, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  scene.add(key);

  const fill = new THREE.DirectionalLight('#a9c9ff', 1.0);
  fill.position.set(7, 5, -4);
  scene.add(fill);

  const objectGroup = new THREE.Group();
  for (const item of config.objects) {
    const material = new THREE.MeshStandardMaterial({
      color: item.color,
      roughness: item.roughness,
      metalness: item.metalness
    });
    const mesh = new THREE.Mesh(geometryFor(item), material);
    mesh.position.set(...item.position);
    mesh.rotation.set(...item.rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.motion = item.motion;
    mesh.userData.baseY = item.position[1];
    mesh.userData.baseRotation = [...item.rotation];
    mesh.userData.amplitude = item.motionAmplitude;
    objectGroup.add(mesh);
  }
  scene.add(objectGroup);

  const characterRig = config.character?.enabled === false ? null : createStickmanRig(THREE, config.character || {});
  if (characterRig) scene.add(characterRig.root);

  return {scene, camera, renderer, objectGroup, characterRig};
}

export function ThreeDWorld({scene = {}, background = '#b9c7d8'}) {
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const [webglError, setWebglError] = useState(false);
  const frame = useCurrentFrame();
  const {width, height, fps, durationInFrames} = useVideoConfig();
  const config = useMemo(
    () => {
      const normalized = normalizeThreeDScene({...scene, three_d: scene.three_d || {background}});
      normalized.character = normalizeCharacterConfig(scene.character || scene.three_d?.character || {});
      return normalized;
    },
    [scene, background]
  );

  useLayoutEffect(() => {
    if (!canvasRef.current) return undefined;
    let world;
    setWebglError(false);
    try {
      world = buildWorld(canvasRef.current, config, width, height);
      worldRef.current = world;
    } catch (error) {
      // The DOM fallback remains visible if the render host cannot create WebGL.
      canvasRef.current.dataset.webglError = String(error?.message || error);
      setWebglError(true);
      return undefined;
    }
    return () => {
      world.objectGroup.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
          else node.material.dispose();
        }
      });
      if (world.characterRig) {
        world.characterRig.root.traverse((node) => {
          if (node.geometry) node.geometry.dispose();
        });
        world.characterRig.root.userData.disposeMaterials?.forEach((material) => material.dispose());
      }
      world.renderer.dispose();
      worldRef.current = null;
    };
  }, [config, width, height]);

  useLayoutEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const pose = cameraPoseAtFrame(config.camera, frame, fps, durationInFrames);
    world.camera.position.set(pose.x, pose.y, pose.z);
    world.camera.lookAt(pose.targetX, pose.targetY, pose.targetZ);
    world.objectGroup.children.forEach((mesh, index) => {
      const phase = frame / Math.max(1, fps) + index * 0.7;
      const motion = mesh.userData.motion;
      mesh.position.y = mesh.userData.baseY + (motion === 'float' ? Math.sin(phase * 1.8) * mesh.userData.amplitude : 0);
      mesh.rotation.y = mesh.userData.baseRotation[1] + (motion === 'rotate' ? phase * 0.8 : 0);
      if (motion === 'pulse') {
        const scale = 1 + Math.sin(phase * 2) * 0.08;
        mesh.scale.setScalar(scale);
      } else {
        mesh.scale.setScalar(1);
      }
    });
    if (world.characterRig) {
      const action = config.character?.action || 'idle';
      applyStickmanPose(world.characterRig, characterPoseAtFrame(action, frame, fps));
    }
    world.renderer.render(world.scene, world.camera);
  }, [frame, config, fps, durationInFrames]);

  return (
    <AbsoluteFill style={{backgroundColor: config.background, overflow: 'hidden', zIndex: 0}}>
      <canvas
        ref={canvasRef}
        aria-label="Procedurally rendered 3D story environment"
        style={{display: 'block', width: '100%', height: '100%'}}
      />
      {webglError && (
        <div
          data-three-fallback="true"
          style={{position: 'absolute', inset: 0, overflow: 'hidden', background: `linear-gradient(180deg, ${config.background} 0%, ${config.ground} 100%)`}}
        >
          <div style={{position: 'absolute', left: '8%', right: '8%', bottom: '14%', height: '28%', borderRadius: '18px', background: 'rgba(38, 49, 65, 0.16)', transform: 'perspective(700px) rotateX(12deg)'}} />
          {config.objects.slice(0, 8).map((item, index) => (
            <div key={item.id} style={{position: 'absolute', left: `${18 + (index % 4) * 18}%`, top: `${28 + Math.floor(index / 4) * 18}%`, width: `${Math.max(5, Math.min(14, item.size[0] * 5))}%`, height: `${Math.max(5, Math.min(18, item.size[1] * 7))}%`, borderRadius: item.type === 'sphere' ? '50%' : '8px', background: item.color, boxShadow: '0 16px 24px rgba(20,30,45,.18)', transform: `rotate(${item.rotation[2] * 30}deg)`}} />
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
}

export default ThreeDWorld;

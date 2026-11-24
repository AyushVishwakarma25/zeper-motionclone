/**
 * stickman3d.mjs
 * Deterministic procedural 3D Stickman character system for MotionClone V5.
 * Contains pure mathematical pose keyframing (Node testable without WebGL)
 * and Three.js hierarchy construction with shadows and materials.
 */

export const STICKMAN_POSES = [
  'idle',
  'walking',
  'running',
  'pointing',
  'holding_object',
  'turning',
  'celebrating',
  'stress_panic',
  'confused',
  'sitting_desk'
];

/**
 * Pure mathematical calculation of joint angles and displacements for any pose at any frame.
 * Deterministic, smooth, zero external dependencies.
 */
export function stickmanPoseKeyframes(pose = 'idle', frame = 0, fps = 30, durationInFrames = 90) {
  const normPose = STICKMAN_POSES.includes(pose) ? pose : 'idle';
  const progress = Math.max(0, Math.min(1, frame / Math.max(1, durationInFrames - 1)));
  const time = frame / Math.max(1, fps);

  // Defaults
  let hipsY = 1.05;
  let hipsX = 0;
  let hipsZ = 0;
  let torsoRotX = 0;
  let torsoRotY = 0;
  let torsoRotZ = 0;
  let headRotX = 0;
  let headRotY = 0;
  let headRotZ = 0;
  let leftArmRotX = 0;
  let leftArmRotY = 0;
  let leftArmRotZ = 0.2;
  let leftForearmRotX = 0.15;
  let rightArmRotX = 0;
  let rightArmRotY = 0;
  let rightArmRotZ = -0.2;
  let rightForearmRotX = 0.15;
  let leftLegRotX = 0;
  let leftKneeRotX = 0;
  let rightLegRotX = 0;
  let rightKneeRotX = 0;
  let turnY = 0;

  switch (normPose) {
    case 'idle': {
      // Gentle breathing & subtle weight shift
      const breath = Math.sin(time * 2.2);
      hipsY = 1.05 + breath * 0.02;
      torsoRotX = breath * 0.02;
      headRotX = -breath * 0.015;
      leftArmRotZ = 0.22 + breath * 0.02;
      rightArmRotZ = -0.22 - breath * 0.02;
      headRotY = Math.sin(time * 0.8) * 0.08;
      break;
    }

    case 'walking': {
      // Natural walking stride ~1.8 Hz
      const strideFreq = 1.8 * Math.PI * 2;
      const stride = Math.sin(time * strideFreq);
      const cosStride = Math.cos(time * strideFreq);

      // Vertical bounce (two bounces per full stride cycle)
      hipsY = 1.05 + Math.abs(cosStride) * 0.05;
      torsoRotX = 0.08; // Slight forward lean
      torsoRotY = -stride * 0.08; // Torso counters hips

      // Legs swing forward and backward
      leftLegRotX = stride * 0.45;
      rightLegRotX = -stride * 0.45;

      // Knees bend during backswing / lift
      leftKneeRotX = leftLegRotX < 0 ? Math.abs(leftLegRotX) * 1.2 : 0.05;
      rightKneeRotX = rightLegRotX < 0 ? Math.abs(rightLegRotX) * 1.2 : 0.05;

      // Arms swing in opposition to legs
      leftArmRotX = -stride * 0.4;
      rightArmRotX = stride * 0.4;
      leftForearmRotX = 0.25 + Math.max(0, -stride * 0.2);
      rightForearmRotX = 0.25 + Math.max(0, stride * 0.2);
      break;
    }

    case 'running': {
      // Athletic run ~2.8 Hz
      const runFreq = 2.8 * Math.PI * 2;
      const stride = Math.sin(time * runFreq);
      const cosStride = Math.cos(time * runFreq);

      hipsY = 1.08 + Math.abs(cosStride) * 0.09;
      torsoRotX = 0.24; // Pronounced forward tilt
      torsoRotY = -stride * 0.14;

      leftLegRotX = stride * 0.85;
      rightLegRotX = -stride * 0.85;
      leftKneeRotX = leftLegRotX < 0 ? Math.abs(leftLegRotX) * 1.4 : 0.1;
      rightKneeRotX = rightLegRotX < 0 ? Math.abs(rightLegRotX) * 1.4 : 0.1;

      // Pumped arms bent at 90 deg
      leftArmRotX = -stride * 0.8;
      rightArmRotX = stride * 0.8;
      leftArmRotZ = 0.25;
      rightArmRotZ = -0.25;
      leftForearmRotX = 1.1;
      rightForearmRotX = 1.1;
      break;
    }

    case 'pointing': {
      // Right arm raised and pointing forward/upward, gaze tracking target
      const easeIn = Math.min(1, time * 3.0);
      hipsY = 1.05;
      torsoRotY = -0.15 * easeIn;
      headRotY = -0.25 * easeIn;
      headRotX = -0.1 * easeIn;

      // Right arm extended
      rightArmRotX = 1.45 * easeIn;
      rightArmRotZ = -0.15 * easeIn;
      rightForearmRotX = 0.05;

      // Left arm relaxed at hip
      leftArmRotZ = 0.28;
      leftForearmRotX = 0.35;
      break;
    }

    case 'holding_object': {
      // Both arms forward holding prop at chest height
      const pulse = Math.sin(time * 2.0) * 0.02;
      hipsY = 1.05 + pulse;
      torsoRotX = 0.04;
      leftArmRotX = 0.85;
      leftArmRotZ = 0.35;
      leftArmRotY = -0.25;
      leftForearmRotX = 0.95;

      rightArmRotX = 0.85;
      rightArmRotZ = -0.35;
      rightArmRotY = 0.25;
      rightForearmRotX = 0.95;
      headRotX = 0.12; // Looking down slightly at held prop
      break;
    }

    case 'turning': {
      // Smooth 360 or quarter turnaround over the scene duration
      const easedProgress = progress * progress * (3 - 2 * progress);
      turnY = easedProgress * Math.PI * 0.5; // Smooth quarter turn
      hipsY = 1.05 + Math.sin(time * 3) * 0.015;
      leftArmRotZ = 0.25;
      rightArmRotZ = -0.25;
      break;
    }

    case 'celebrating': {
      // Victory V arms, bouncing joyfully
      const jump = Math.abs(Math.sin(time * 4.2)) * 0.12;
      hipsY = 1.05 + jump;
      torsoRotX = -0.06;
      headRotX = -0.28; // Head tilted up

      // Arms raised high
      const wave = Math.sin(time * 5.5) * 0.12;
      leftArmRotX = 2.6 + wave;
      leftArmRotZ = 0.6 + wave * 0.5;
      leftForearmRotX = 0.4;

      rightArmRotX = 2.6 - wave;
      rightArmRotZ = -0.6 - wave * 0.5;
      rightForearmRotX = 0.4;
      break;
    }

    case 'stress_panic': {
      // Hands grasping temples/head, jittery pacing
      const jitter = Math.sin(time * 12.0) * 0.03;
      hipsY = 1.02 + jitter;
      hipsX = Math.sin(time * 3.5) * 0.06;
      torsoRotX = 0.18 + jitter * 0.5;
      headRotZ = Math.sin(time * 4.5) * 0.14; // Shaking head

      // Hands to head
      leftArmRotX = 2.1;
      leftArmRotZ = 0.85;
      leftForearmRotX = 1.6;

      rightArmRotX = 2.1;
      rightArmRotZ = -0.85;
      rightForearmRotX = 1.6;
      break;
    }

    case 'confused': {
      // One hand scratching head, head tilted sideways
      hipsY = 1.05;
      headRotZ = 0.28; // Tilted head
      headRotY = -0.15;
      torsoRotZ = -0.05;

      // Right arm scratches head
      const scratch = Math.sin(time * 6.0) * 0.08;
      rightArmRotX = 2.3 + scratch;
      rightArmRotZ = -0.7;
      rightForearmRotX = 1.7;

      // Left arm relaxed
      leftArmRotZ = 0.28;
      leftForearmRotX = 0.2;
      break;
    }

    case 'sitting_desk': {
      // Seated at desk: lowered hips, horizontal thighs, 90 deg knees
      hipsY = 0.65;
      hipsZ = -0.15;
      torsoRotX = 0.05;

      // Legs bent to sit
      leftLegRotX = 1.57; // 90 degrees forward
      leftKneeRotX = 1.57; // 90 degrees down
      rightLegRotX = 1.57;
      rightKneeRotX = 1.57;

      // Arms resting on desk or typing
      const typing = Math.sin(time * 8.0) * 0.04;
      leftArmRotX = 0.75 + typing;
      leftArmRotZ = 0.25;
      leftForearmRotX = 0.85;

      rightArmRotX = 0.75 - typing;
      rightArmRotZ = -0.25;
      rightForearmRotX = 0.85;
      break;
    }
  }

  return {
    hipsX,
    hipsY,
    hipsZ,
    torsoRotX,
    torsoRotY,
    torsoRotZ,
    headRotX,
    headRotY,
    headRotZ,
    leftArmRotX,
    leftArmRotY,
    leftArmRotZ,
    leftForearmRotX,
    rightArmRotX,
    rightArmRotY,
    rightArmRotZ,
    rightForearmRotX,
    leftLegRotX,
    leftKneeRotX,
    rightLegRotX,
    rightKneeRotX,
    turnY
  };
}

/**
 * Builds the 3D Stickman mesh and joint hierarchy in Three.js.
 */
export function buildStickman3D(THREE, options = {}) {
  const shirtColor = options.shirtColor || '#00f2fe';
  const skinColor = options.skinColor || '#f8fafc';
  const darkColor = options.darkColor || '#1e293b';
  const scale = Number.isFinite(options.scale) ? options.scale : 1.0;

  const characterRoot = new THREE.Group();
  characterRoot.scale.setScalar(scale);

  // Materials
  const shirtMat = new THREE.MeshStandardMaterial({
    color: shirtColor,
    roughness: 0.45,
    metalness: 0.1
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.35,
    metalness: 0.05
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: darkColor,
    roughness: 0.7,
    metalness: 0.15
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: darkColor,
    roughness: 0.5,
    metalness: 0.2
  });

  // Hips Root
  const hips = new THREE.Group();
  hips.position.y = 1.05;
  characterRoot.add(hips);

  const pelvisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), darkMat);
  pelvisMesh.castShadow = true;
  hips.add(pelvisMesh);

  // Spine / Torso
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 0.08;
  hips.add(torsoGroup);

  const torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.55, 16), shirtMat);
  torsoMesh.position.y = 0.28;
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  torsoGroup.add(torsoMesh);

  // Neck and Head
  const neckGroup = new THREE.Group();
  neckGroup.position.y = 0.58;
  torsoGroup.add(neckGroup);

  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 12), skinMat);
  neckMesh.position.y = 0.06;
  neckMesh.castShadow = true;
  neckGroup.add(neckMesh);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.14;
  neckGroup.add(headGroup);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 20), skinMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headGroup.add(headMesh);

  // Stylized modern visor / eyes
  const visorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.07, 0.08),
    new THREE.MeshStandardMaterial({color: '#0f172a', roughness: 0.2})
  );
  visorMesh.position.set(0, 0.03, 0.21);
  headGroup.add(visorMesh);

  // Helper for limbs
  function createLimbJoint(radius = 0.08) {
    const joint = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 10), jointMat);
    joint.castShadow = true;
    return joint;
  }

  function createLimbSegment(topRadius, bottomRadius, height, mat) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, height, 12), mat);
    mesh.position.y = -height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // --- Left Arm ---
  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(0.25, 0.52, 0);
  torsoGroup.add(leftShoulder);
  leftShoulder.add(createLimbJoint(0.08));

  const leftUpperArm = new THREE.Group();
  leftShoulder.add(leftUpperArm);
  leftUpperArm.add(createLimbSegment(0.065, 0.055, 0.32, shirtMat));

  const leftElbow = new THREE.Group();
  leftElbow.position.y = -0.32;
  leftUpperArm.add(leftElbow);
  leftElbow.add(createLimbJoint(0.065));

  const leftForearm = new THREE.Group();
  leftElbow.add(leftForearm);
  leftForearm.add(createLimbSegment(0.055, 0.05, 0.28, skinMat));

  const leftHand = new THREE.Group();
  leftHand.position.y = -0.28;
  leftForearm.add(leftHand);
  const leftHandMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), skinMat);
  leftHandMesh.castShadow = true;
  leftHand.add(leftHandMesh);

  // --- Right Arm ---
  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(-0.25, 0.52, 0);
  torsoGroup.add(rightShoulder);
  rightShoulder.add(createLimbJoint(0.08));

  const rightUpperArm = new THREE.Group();
  rightShoulder.add(rightUpperArm);
  rightUpperArm.add(createLimbSegment(0.065, 0.055, 0.32, shirtMat));

  const rightElbow = new THREE.Group();
  rightElbow.position.y = -0.32;
  rightUpperArm.add(rightElbow);
  rightElbow.add(createLimbJoint(0.065));

  const rightForearm = new THREE.Group();
  rightElbow.add(rightForearm);
  rightForearm.add(createLimbSegment(0.055, 0.05, 0.28, skinMat));

  const rightHand = new THREE.Group();
  rightHand.position.y = -0.28;
  rightForearm.add(rightHand);
  const rightHandMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), skinMat);
  rightHandMesh.castShadow = true;
  rightHand.add(rightHandMesh);

  // Socket for held props
  const propSocket = new THREE.Group();
  propSocket.position.set(0, -0.06, 0.12);
  rightHand.add(propSocket);

  // --- Left Leg ---
  const leftHip = new THREE.Group();
  leftHip.position.set(0.13, -0.05, 0);
  hips.add(leftHip);
  leftHip.add(createLimbJoint(0.08));

  const leftThigh = new THREE.Group();
  leftHip.add(leftThigh);
  leftThigh.add(createLimbSegment(0.075, 0.065, 0.44, darkMat));

  const leftKnee = new THREE.Group();
  leftKnee.position.y = -0.44;
  leftThigh.add(leftKnee);
  leftKnee.add(createLimbJoint(0.07));

  const leftShin = new THREE.Group();
  leftKnee.add(leftShin);
  leftShin.add(createLimbSegment(0.065, 0.055, 0.42, darkMat));

  const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.2), darkMat);
  leftFoot.position.set(0, -0.44, 0.05);
  leftFoot.castShadow = true;
  leftShin.add(leftFoot);

  // --- Right Leg ---
  const rightHip = new THREE.Group();
  rightHip.position.set(-0.13, -0.05, 0);
  hips.add(rightHip);
  rightHip.add(createLimbJoint(0.08));

  const rightThigh = new THREE.Group();
  rightHip.add(rightThigh);
  rightThigh.add(createLimbSegment(0.075, 0.065, 0.44, darkMat));

  const rightKnee = new THREE.Group();
  rightKnee.position.y = -0.44;
  rightThigh.add(rightKnee);
  rightKnee.add(createLimbJoint(0.07));

  const rightShin = new THREE.Group();
  rightKnee.add(rightShin);
  rightShin.add(createLimbSegment(0.065, 0.055, 0.42, darkMat));

  const rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.2), darkMat);
  rightFoot.position.set(0, -0.44, 0.05);
  rightFoot.castShadow = true;
  rightShin.add(rightFoot);

  return {
    root: characterRoot,
    hips,
    torsoGroup,
    neckGroup,
    headGroup,
    leftShoulder,
    leftUpperArm,
    leftElbow,
    leftForearm,
    leftHand,
    rightShoulder,
    rightUpperArm,
    rightElbow,
    rightForearm,
    rightHand,
    propSocket,
    leftHip,
    leftThigh,
    leftKnee,
    leftShin,
    rightHip,
    rightThigh,
    rightKnee,
    rightShin
  };
}

/**
 * Updates stickman rig transforms for a given pose and frame.
 */
export function applyStickmanPose(rig, pose, frame, fps, durationInFrames) {
  if (!rig) return;
  const kf = stickmanPoseKeyframes(pose, frame, fps, durationInFrames);

  rig.hips.position.y = kf.hipsY;
  rig.hips.position.x = kf.hipsX;
  rig.hips.position.z = kf.hipsZ;
  rig.root.rotation.y = kf.turnY;

  rig.torsoGroup.rotation.x = kf.torsoRotX;
  rig.torsoGroup.rotation.y = kf.torsoRotY;
  rig.torsoGroup.rotation.z = kf.torsoRotZ;

  rig.headGroup.rotation.x = kf.headRotX;
  rig.headGroup.rotation.y = kf.headRotY;
  rig.headGroup.rotation.z = kf.headRotZ;

  rig.leftUpperArm.rotation.x = kf.leftArmRotX;
  rig.leftUpperArm.rotation.y = kf.leftArmRotY;
  rig.leftUpperArm.rotation.z = kf.leftArmRotZ;
  rig.leftForearm.rotation.x = kf.leftForearmRotX;

  rig.rightUpperArm.rotation.x = kf.rightArmRotX;
  rig.rightUpperArm.rotation.y = kf.rightArmRotY;
  rig.rightUpperArm.rotation.z = kf.rightArmRotZ;
  rig.rightForearm.rotation.x = kf.rightForearmRotX;

  rig.leftThigh.rotation.x = kf.leftLegRotX;
  rig.leftKnee.rotation.x = kf.leftKneeRotX;

  rig.rightThigh.rotation.x = kf.rightLegRotX;
  rig.rightKnee.rotation.x = kf.rightKneeRotX;
}

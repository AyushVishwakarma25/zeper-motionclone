/**
 * environments3d.mjs
 * 3D Environment presets for MotionClone V5 in Three.js.
 * Sets up ground, backdrops, architectural props, and ambient scene assets.
 */

export const THREE_D_ENVIRONMENTS = [
  'studio',
  'office',
  'room',
  'street',
  'forest',
  'tech'
];

export function addEnvironment3D(THREE, scene, config) {
  const env = THREE_D_ENVIRONMENTS.includes(config.environment) ? config.environment : 'studio';
  const groundColor = config.ground || '#d9d4ca';
  const bgColor = config.background || '#b9c7d8';

  scene.background = new THREE.Color(bgColor);

  // Common Ground Plane with Shadow Receiving
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({color: groundColor, roughness: 0.92, metalness: 0.05})
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  switch (env) {
    case 'office': {
      // Back wall with wooden slat pattern
      const wallMat = new THREE.MeshStandardMaterial({color: '#e2e8f0', roughness: 0.95});
      const backWall = new THREE.Mesh(new THREE.PlaneGeometry(28, 14), wallMat);
      backWall.position.set(0, 7, -7);
      backWall.receiveShadow = true;
      scene.add(backWall);

      // Slat wall accents
      const woodMat = new THREE.MeshStandardMaterial({color: '#854d0e', roughness: 0.7});
      for (let s = -10; s <= 10; s += 0.8) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 12, 0.08), woodMat);
        slat.position.set(s, 6, -6.9);
        slat.castShadow = true;
        scene.add(slat);
      }

      // Office desk
      const deskTopMat = new THREE.MeshStandardMaterial({color: '#78350f', roughness: 0.6});
      const deskLegMat = new THREE.MeshStandardMaterial({color: '#1e293b', roughness: 0.4, metalness: 0.8});

      const deskTop = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 1.6), deskTopMat);
      deskTop.position.set(0, 0.85, -0.6);
      deskTop.castShadow = true;
      deskTop.receiveShadow = true;
      scene.add(deskTop);

      // 4 Desk legs
      const legPositions = [
        [-1.6, 0.42, -1.2],
        [1.6, 0.42, -1.2],
        [-1.6, 0.42, 0.0],
        [1.6, 0.42, 0.0]
      ];
      for (const pos of legPositions) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 12), deskLegMat);
        leg.position.set(...pos);
        leg.castShadow = true;
        scene.add(leg);
      }

      // Potted plant on desk
      const potMat = new THREE.MeshStandardMaterial({color: '#f8fafc', roughness: 0.3});
      const leafMat = new THREE.MeshStandardMaterial({color: '#15803d', roughness: 0.8});
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.22, 16), potMat);
      pot.position.set(1.4, 1.01, -0.6);
      pot.castShadow = true;
      scene.add(pot);

      for (let l = 0; l < 4; l++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), leafMat);
        leaf.scale.set(1, 1.8, 0.3);
        leaf.position.set(1.4 + (l % 2 === 0 ? 0.06 : -0.06), 1.18 + l * 0.04, -0.6);
        leaf.rotation.z = (l - 1.5) * 0.4;
        leaf.castShadow = true;
        scene.add(leaf);
      }
      break;
    }

    case 'street': {
      // Asphalt road with road markings
      const roadMat = new THREE.MeshStandardMaterial({color: '#334155', roughness: 0.95});
      const road = new THREE.Mesh(new THREE.PlaneGeometry(100, 10), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.01, 1.5);
      road.receiveShadow = true;
      scene.add(road);

      // Dashed center line
      const stripeMat = new THREE.MeshBasicMaterial({color: '#facc15'});
      for (let x = -40; x < 40; x += 6) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.02, 0.16), stripeMat);
        stripe.position.set(x, 0.02, 1.5);
        scene.add(stripe);
      }

      // Sidewalk curbs and slabs
      const curbMat = new THREE.MeshStandardMaterial({color: '#cbd5e1', roughness: 0.9});
      const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(100, 0.16, 6), curbMat);
      sidewalk.position.set(0, 0.08, -6.5);
      sidewalk.receiveShadow = true;
      scene.add(sidewalk);

      // Street lamps
      const lampMat = new THREE.MeshStandardMaterial({color: '#0f172a', roughness: 0.5, metalness: 0.8});
      for (const lx of [-12, 12]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5.5, 12), lampMat);
        pole.position.set(lx, 2.75, -4.5);
        pole.castShadow = true;
        scene.add(pole);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.35), lampMat);
        head.position.set(lx + 0.3, 5.5, -4.5);
        head.castShadow = true;
        scene.add(head);
      }
      break;
    }

    case 'forest': {
      // Stylized forest with low-poly geometric pine trees
      const trunkMat = new THREE.MeshStandardMaterial({color: '#713f12', roughness: 0.9});
      const foliageMat = new THREE.MeshStandardMaterial({color: '#15803d', roughness: 0.95});

      for (let i = 0; i < 16; i++) {
        const x = ((i % 8) - 3.5) * 5.2 + Math.sin(i * 1.7) * 1.5;
        const z = -4.5 - Math.floor(i / 8) * 7.5;
        const heightScale = 0.8 + Math.abs(Math.sin(i)) * 0.5;

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 3.2 * heightScale, 8), trunkMat);
        trunk.position.set(x, 1.6 * heightScale, z);
        trunk.castShadow = true;
        scene.add(trunk);

        // 3 Tiers of foliage cones
        for (let t = 0; t < 3; t++) {
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry((2.2 - t * 0.45) * heightScale, 2.2 * heightScale, 7),
            foliageMat
          );
          cone.position.set(x, (3.2 + t * 1.3) * heightScale, z);
          cone.castShadow = true;
          scene.add(cone);
        }
      }
      break;
    }

    case 'tech': {
      // Futuristic / FinTech grid
      const gridMat = new THREE.MeshStandardMaterial({
        color: '#020617',
        roughness: 0.2,
        metalness: 0.9
      });
      const gridFloor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), gridMat);
      gridFloor.rotation.x = -Math.PI / 2;
      gridFloor.position.y = 0.01;
      gridFloor.receiveShadow = true;
      scene.add(gridFloor);

      // Glowing grid lines
      const lineMat = new THREE.MeshBasicMaterial({color: '#00f2fe'});
      for (let g = -20; g <= 20; g += 4) {
        const xLine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 60), lineMat);
        xLine.position.set(g, 0.02, 0);
        scene.add(xLine);

        const zLine = new THREE.Mesh(new THREE.BoxGeometry(60, 0.02, 0.04), lineMat);
        zLine.position.set(0, 0.02, g);
        scene.add(zLine);
      }

      // Floating data pillars
      const pillarMat = new THREE.MeshStandardMaterial({
        color: '#0284c7',
        roughness: 0.2,
        metalness: 0.5,
        transparent: true,
        opacity: 0.6
      });
      for (let p = 0; p < 6; p++) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5 + p * 0.8, 0.8), pillarMat);
        pillar.position.set((p - 2.5) * 4.2, (3.5 + p * 0.8) / 2, -7);
        pillar.castShadow = true;
        scene.add(pillar);
      }
      break;
    }

    case 'room': {
      // Modern interior room with parquet floor and art frame
      const wallMat = new THREE.MeshStandardMaterial({color: '#f1f5f9', roughness: 0.95});
      const backWall = new THREE.Mesh(new THREE.PlaneGeometry(24, 12), wallMat);
      backWall.position.set(0, 6, -8);
      backWall.receiveShadow = true;
      scene.add(backWall);

      const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), wallMat);
      sideWall.rotation.y = Math.PI / 2;
      sideWall.position.set(-10, 6, 0);
      sideWall.receiveShadow = true;
      scene.add(sideWall);

      // Modern wall art frame
      const frameMat = new THREE.MeshStandardMaterial({color: '#0f172a', roughness: 0.4});
      const canvasMat = new THREE.MeshStandardMaterial({color: '#0ea5e9', roughness: 0.3});
      const artFrame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.4, 0.08), frameMat);
      artFrame.position.set(0, 6.5, -7.9);
      scene.add(artFrame);

      const artCanvas = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 4.1), canvasMat);
      artCanvas.position.set(0, 6.5, -7.84);
      scene.add(artCanvas);
      break;
    }

    case 'studio':
    default: {
      // Sleek minimalist studio cyclorama
      const cycMat = new THREE.MeshStandardMaterial({color: groundColor, roughness: 0.95});
      const backWall = new THREE.Mesh(new THREE.PlaneGeometry(36, 16), cycMat);
      backWall.position.set(0, 8, -10);
      backWall.receiveShadow = true;
      scene.add(backWall);

      // Sleek pedestal in center
      const pedMat = new THREE.MeshStandardMaterial({color: '#f8fafc', roughness: 0.2, metalness: 0.1});
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.2, 32), pedMat);
      pedestal.position.set(0, 0.1, 0);
      pedestal.receiveShadow = true;
      pedestal.castShadow = true;
      scene.add(pedestal);
      break;
    }
  }
}

/**
 * props3d.mjs
 * Reusable 3D Props builder for MotionClone V5 in Three.js.
 * Provides high-aesthetic procedural props with animated behaviors.
 */

export const REUSABLE_PROP_TYPES = [
  'money_stack',
  'coin',
  'invoice',
  'laptop',
  'phone',
  'box',
  'chart_3d',
  'trophy',
  'shield'
];

/**
 * Builds a 3D prop group in Three.js.
 */
export function buildProp3D(THREE, type = 'box', options = {}) {
  const propGroup = new THREE.Group();
  const accent = options.accent || '#00f2fe';

  switch (type) {
    case 'money_stack': {
      // Bundled banknotes (green stack)
      const noteMat = new THREE.MeshStandardMaterial({
        color: '#10b981',
        roughness: 0.6,
        metalness: 0.05
      });
      const bandMat = new THREE.MeshStandardMaterial({
        color: '#fef08a',
        roughness: 0.5
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: '#fbbf24',
        roughness: 0.3,
        metalness: 0.8
      });

      // 3 Stacked bundles
      for (let i = 0; i < 3; i++) {
        const bundle = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.2), noteMat);
        bundle.position.y = 0.06 + i * 0.13;
        bundle.rotation.y = (i - 1) * 0.08;
        bundle.castShadow = true;
        bundle.receiveShadow = true;
        propGroup.add(bundle);

        // Paper band across bundle
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.13, 0.28), bandMat);
        band.position.set(0, 0.06 + i * 0.13, 0);
        band.rotation.y = (i - 1) * 0.08;
        propGroup.add(band);
      }

      // Adjacent gold coins
      for (let c = 0; c < 4; c++) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16), goldMat);
        coin.position.set(0.55, 0.03 + c * 0.065, 0.25);
        coin.castShadow = true;
        propGroup.add(coin);
      }
      break;
    }

    case 'coin': {
      // Large golden coin
      const goldMat = new THREE.MeshStandardMaterial({
        color: '#fbbf24',
        roughness: 0.25,
        metalness: 0.85
      });
      const coinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24), goldMat);
      coinMesh.rotation.z = Math.PI / 2;
      coinMesh.position.y = 0.55;
      coinMesh.castShadow = true;
      propGroup.add(coinMesh);

      // Star emblem on face
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.24, 0),
        new THREE.MeshStandardMaterial({color: '#fef08a', roughness: 0.2, metalness: 0.9})
      );
      star.position.set(0.07, 0.55, 0);
      star.scale.set(0.2, 1, 1);
      propGroup.add(star);
      break;
    }

    case 'invoice': {
      // 3D paper document card with colored header bar & text stripes
      const paperMat = new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.5,
        metalness: 0.05
      });
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.25, 0.04), paperMat);
      paper.position.y = 0.65;
      paper.castShadow = true;
      propGroup.add(paper);

      // Header stripe
      const headerStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 0.14, 0.045),
        new THREE.MeshStandardMaterial({color: accent, roughness: 0.4})
      );
      headerStripe.position.set(0, 1.12, 0.01);
      propGroup.add(headerStripe);

      // Body lines
      const lineMat = new THREE.MeshStandardMaterial({color: '#94a3b8'});
      for (let l = 0; l < 4; l++) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.045), lineMat);
        line.position.set(0, 0.9 - l * 0.14, 0.01);
        propGroup.add(line);
      }

      // Stamp badge (e.g. green PAID or red DUE)
      const stampMat = new THREE.MeshStandardMaterial({color: '#ef4444', roughness: 0.3});
      const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), stampMat);
      stamp.position.set(0.18, 0.35, 0.01);
      stamp.rotation.z = -0.22;
      propGroup.add(stamp);
      break;
    }

    case 'laptop': {
      // Modern laptop (base + keyboard + angled display)
      const bodyMat = new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.3,
        metalness: 0.7
      });
      const screenMat = new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.2,
        metalness: 0.1,
        emissive: accent,
        emissiveIntensity: 0.35
      });

      // Base
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.85), bodyMat);
      base.position.set(0, 0.02, 0);
      base.castShadow = true;
      propGroup.add(base);

      // Keyboard plate
      const keyboard = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.02, 0.45),
        new THREE.MeshStandardMaterial({color: '#1e293b', roughness: 0.8})
      );
      keyboard.position.set(0, 0.04, 0.06);
      propGroup.add(keyboard);

      // Display lid (angled 115 deg)
      const lidGroup = new THREE.Group();
      lidGroup.position.set(0, 0.03, -0.42);
      lidGroup.rotation.x = -1.15;
      propGroup.add(lidGroup);

      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.82, 0.03), bodyMat);
      lid.position.set(0, 0.41, 0);
      lid.castShadow = true;
      lidGroup.add(lid);

      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.72), screenMat);
      screen.position.set(0, 0.41, 0.016);
      lidGroup.add(screen);
      break;
    }

    case 'phone': {
      // Smartphone slab
      const phoneMat = new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.25,
        metalness: 0.8
      });
      const glassMat = new THREE.MeshStandardMaterial({
        color: '#020617',
        roughness: 0.1,
        metalness: 0.1,
        emissive: accent,
        emissiveIntensity: 0.4
      });

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.95, 0.05), phoneMat);
      body.position.y = 0.48;
      body.castShadow = true;
      propGroup.add(body);

      const display = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.88), glassMat);
      display.position.set(0, 0.48, 0.026);
      propGroup.add(display);
      break;
    }

    case 'box': {
      // Cardboard package box
      const boxMat = new THREE.MeshStandardMaterial({
        color: '#c29b68',
        roughness: 0.85,
        metalness: 0.0
      });
      const tapeMat = new THREE.MeshStandardMaterial({
        color: '#a37844',
        roughness: 0.6
      });

      const box = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.85), boxMat);
      box.position.y = 0.38;
      box.castShadow = true;
      box.receiveShadow = true;
      propGroup.add(box);

      // Tape along top and sides
      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.76, 0.86), tapeMat);
      tape.position.y = 0.38;
      propGroup.add(tape);
      break;
    }

    case 'chart_3d': {
      // 3 Rising colored 3D data bars on a pedestal
      const pedMat = new THREE.MeshStandardMaterial({color: '#334155', roughness: 0.8});
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.7), pedMat);
      pedestal.position.y = 0.04;
      pedestal.receiveShadow = true;
      propGroup.add(pedestal);

      const barColors = ['#ef4444', '#f59e0b', '#10b981'];
      const barHeights = [0.45, 0.85, 1.35];
      propGroup.userData.bars = [];

      for (let b = 0; b < 3; b++) {
        const barMat = new THREE.MeshStandardMaterial({
          color: barColors[b],
          roughness: 0.35,
          metalness: 0.2
        });
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.0, 0.32), barMat);
        bar.position.set((b - 1) * 0.48, 0.08, 0);
        bar.castShadow = true;
        bar.receiveShadow = true;
        bar.scale.y = barHeights[b];
        bar.position.y = 0.08 + barHeights[b] / 2;
        bar.userData.targetHeight = barHeights[b];
        propGroup.add(bar);
        propGroup.userData.bars.push(bar);
      }
      break;
    }

    case 'trophy': {
      // Shiny gold trophy
      const goldMat = new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        roughness: 0.2,
        metalness: 0.9
      });
      const baseMat = new THREE.MeshStandardMaterial({color: '#1e293b', roughness: 0.7});

      const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), baseMat);
      base.position.y = 0.1;
      base.castShadow = true;
      propGroup.add(base);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.35, 16), goldMat);
      stem.position.y = 0.35;
      propGroup.add(stem);

      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.18, 0.55, 20), goldMat);
      cup.position.y = 0.75;
      cup.castShadow = true;
      propGroup.add(cup);
      break;
    }

    case 'shield': {
      // Glossy security emblem shield
      const shieldMat = new THREE.MeshStandardMaterial({
        color: accent,
        roughness: 0.25,
        metalness: 0.6
      });
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.1, 0.8, 4), shieldMat);
      shield.rotation.y = Math.PI / 4;
      shield.position.y = 0.5;
      shield.castShadow = true;
      propGroup.add(shield);
      break;
    }

    default: {
      // Fallback box
      const defaultMat = new THREE.MeshStandardMaterial({color: accent, roughness: 0.5});
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), defaultMat);
      mesh.position.y = 0.4;
      mesh.castShadow = true;
      propGroup.add(mesh);
      break;
    }
  }

  return propGroup;
}

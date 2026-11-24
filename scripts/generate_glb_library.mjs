/**
 * generate_glb_library.mjs
 * Generates local, self-contained, CC0-licensed binary glTF (.glb) 3D assets
 * for MotionClone V6.
 */

class PolyfillFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
      if (this.onload) this.onload();
    });
  }
}
globalThis.FileReader = PolyfillFileReader;

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../remotion/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../remotion/node_modules/three/examples/jsm/exporters/GLTFExporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MODELS_DIR = path.join(ROOT, 'remotion', 'public', 'models');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
}

function exportToGlb(scene, outputPath) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (glb) => {
        ensureDir(path.dirname(outputPath));
        fs.writeFileSync(outputPath, Buffer.from(glb));
        console.log(`Exported: ${path.relative(ROOT, outputPath)} (${glb.byteLength} bytes)`);
        resolve();
      },
      (error) => reject(error),
      {binary: true}
    );
  });
}

// -------------------------------------------------------------
// Model Builders
// -------------------------------------------------------------

function buildCreditCard() {
  const scene = new THREE.Scene();
  // Card base (85.6mm x 53.98mm ratio, depth 0.04)
  const cardMat = new THREE.MeshStandardMaterial({color: 0x1e3a8a, roughness: 0.35, metalness: 0.2});
  const card = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.88), cardMat);
  card.castShadow = true;
  card.receiveShadow = true;
  scene.add(card);

  // EMV Chip
  const chipMat = new THREE.MeshStandardMaterial({color: 0xfacc15, roughness: 0.2, metalness: 0.9});
  const chip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.2), chipMat);
  chip.position.set(-0.35, 0.005, -0.05);
  scene.add(chip);

  // Holographic badge
  const holoMat = new THREE.MeshStandardMaterial({color: 0x38bdf8, roughness: 0.1, metalness: 0.8});
  const holo = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.045, 16), holoMat);
  holo.position.set(0.42, 0.005, 0.18);
  scene.add(holo);

  // Magnetic stripe on back
  const stripeMat = new THREE.MeshStandardMaterial({color: 0x0f172a, roughness: 0.8});
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.045, 0.18), stripeMat);
  stripe.position.set(0, -0.005, -0.22);
  scene.add(stripe);

  return scene;
}

function buildCashBundle() {
  const scene = new THREE.Scene();
  const noteMat = new THREE.MeshStandardMaterial({color: 0x15803d, roughness: 0.7});
  const bandMat = new THREE.MeshStandardMaterial({color: 0xfef08a, roughness: 0.4});

  for (let i = 0; i < 3; i++) {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.7), noteMat);
    stack.position.y = 0.07 + i * 0.15;
    stack.rotation.y = (i - 1) * 0.06;
    stack.castShadow = true;
    stack.receiveShadow = true;
    scene.add(stack);

    const band = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.71), bandMat);
    band.position.set(0, 0.07 + i * 0.15, 0);
    band.rotation.y = (i - 1) * 0.06;
    scene.add(band);
  }
  return scene;
}

function buildCoinStack() {
  const scene = new THREE.Scene();
  const goldMat = new THREE.MeshStandardMaterial({color: 0xf59e0b, roughness: 0.25, metalness: 0.85});
  for (let i = 0; i < 6; i++) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 24), goldMat);
    coin.position.y = 0.05 + i * 0.105;
    coin.rotation.y = i * 0.4;
    coin.castShadow = true;
    scene.add(coin);
  }
  return scene;
}

function buildBanknote() {
  const scene = new THREE.Scene();
  const billMat = new THREE.MeshStandardMaterial({color: 0x16a34a, roughness: 0.65});
  const bill = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.015, 0.75), billMat);
  bill.castShadow = true;
  scene.add(bill);

  const sealMat = new THREE.MeshStandardMaterial({color: 0xfef08a, roughness: 0.3, metalness: 0.5});
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16), sealMat);
  seal.position.y = 0.005;
  scene.add(seal);
  return scene;
}

function buildWallet() {
  const scene = new THREE.Scene();
  const leatherMat = new THREE.MeshStandardMaterial({color: 0x78350f, roughness: 0.5, metalness: 0.1});
  const wallet = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.7), leatherMat);
  wallet.position.y = 0.1;
  wallet.castShadow = true;
  scene.add(wallet);

  const cardMat = new THREE.MeshStandardMaterial({color: 0x0284c7, roughness: 0.3});
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.03, 0.45), cardMat);
  card.position.set(0, 0.18, 0.15);
  scene.add(card);
  return scene;
}

function buildBankCounter() {
  const scene = new THREE.Scene();
  const woodMat = new THREE.MeshStandardMaterial({color: 0x475569, roughness: 0.6});
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.1, 1.2), woodMat);
  counter.position.y = 0.55;
  counter.castShadow = true;
  counter.receiveShadow = true;
  scene.add(counter);

  const glassMat = new THREE.MeshStandardMaterial({color: 0x93c5fd, roughness: 0.1, transparent: true, opacity: 0.6});
  const partition = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.06), glassMat);
  partition.position.set(0, 1.55, 0.2);
  scene.add(partition);
  return scene;
}

function buildSmartphone() {
  const scene = new THREE.Scene();
  const bodyMat = new THREE.MeshStandardMaterial({color: 0x0f172a, roughness: 0.2, metalness: 0.85});
  const screenMat = new THREE.MeshStandardMaterial({color: 0x020617, roughness: 0.1, emissive: 0x38bdf8, emissiveIntensity: 0.3});

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.06), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  scene.add(body);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.02), screenMat);
  screen.position.set(0, 0.55, 0.031);
  scene.add(screen);

  // Camera Island on back
  const cameraBump = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.03), bodyMat);
  cameraBump.position.set(-0.12, 0.9, -0.04);
  scene.add(cameraBump);
  return scene;
}

function buildLaptop() {
  const scene = new THREE.Scene();
  const metalMat = new THREE.MeshStandardMaterial({color: 0x334155, roughness: 0.3, metalness: 0.7});
  const screenMat = new THREE.MeshStandardMaterial({color: 0x020617, roughness: 0.15, emissive: 0x00f2fe, emissiveIntensity: 0.35});

  // Base with keyboard
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 1.0), metalMat);
  base.position.set(0, 0.025, 0);
  base.castShadow = true;
  scene.add(base);

  const keyboard = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.02, 0.55),
    new THREE.MeshStandardMaterial({color: 0x1e293b, roughness: 0.8})
  );
  keyboard.position.set(0, 0.045, 0.08);
  scene.add(keyboard);

  // Angled Display
  const lidGroup = new THREE.Group();
  lidGroup.position.set(0, 0.035, -0.5);
  lidGroup.rotation.x = -1.15;
  scene.add(lidGroup);

  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.04), metalMat);
  lid.position.set(0, 0.5, 0);
  lid.castShadow = true;
  lidGroup.add(lid);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), screenMat);
  screen.position.set(0, 0.5, 0.021);
  lidGroup.add(screen);
  return scene;
}

function buildMonitor() {
  const scene = new THREE.Scene();
  const frameMat = new THREE.MeshStandardMaterial({color: 0x0f172a, roughness: 0.3, metalness: 0.6});
  const screenMat = new THREE.MeshStandardMaterial({color: 0x020617, roughness: 0.1, emissive: 0x0284c7, emissiveIntensity: 0.35});

  // Stand base and neck
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.05, 24), frameMat);
  base.position.y = 0.025;
  scene.add(base);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 12), frameMat);
  neck.position.set(0, 0.42, 0);
  scene.add(neck);

  // Screen
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 0.08), frameMat);
  panel.position.set(0, 1.2, 0);
  panel.castShadow = true;
  scene.add(panel);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.92, 1.12), screenMat);
  screen.position.set(0, 1.2, 0.041);
  scene.add(screen);
  return scene;
}

function buildDesk() {
  const scene = new THREE.Scene();
  const woodMat = new THREE.MeshStandardMaterial({color: 0x713f12, roughness: 0.6});
  const legMat = new THREE.MeshStandardMaterial({color: 0x1e293b, roughness: 0.4, metalness: 0.8});

  const desktop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 1.4), woodMat);
  desktop.position.set(0, 0.85, 0);
  desktop.castShadow = true;
  desktop.receiveShadow = true;
  scene.add(desktop);

  const legPositions = [
    [-1.25, 0.42, -0.55],
    [1.25, 0.42, -0.55],
    [-1.25, 0.42, 0.55],
    [1.25, 0.42, 0.55]
  ];
  for (const pos of legPositions) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.85, 12), legMat);
    leg.position.set(...pos);
    leg.castShadow = true;
    scene.add(leg);
  }
  return scene;
}

function buildChair() {
  const scene = new THREE.Scene();
  const cushionMat = new THREE.MeshStandardMaterial({color: 0x334155, roughness: 0.7});
  const metalMat = new THREE.MeshStandardMaterial({color: 0x0f172a, roughness: 0.3, metalness: 0.8});

  // Seat
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.7), cushionMat);
  seat.position.y = 0.55;
  seat.castShadow = true;
  scene.add(seat);

  // Backrest
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.75, 0.08), cushionMat);
  back.position.set(0, 0.95, -0.32);
  back.castShadow = true;
  scene.add(back);

  // Stem
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 12), metalMat);
  stem.position.y = 0.275;
  scene.add(stem);

  // 5 Star base
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.4), metalMat);
    leg.position.set(Math.sin(angle) * 0.2, 0.05, Math.cos(angle) * 0.2);
    leg.rotation.y = angle;
    scene.add(leg);
  }
  return scene;
}

function buildDocument() {
  const scene = new THREE.Scene();
  const paperMat = new THREE.MeshStandardMaterial({color: 0xf8fafc, roughness: 0.5});
  const doc = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.25, 0.03), paperMat);
  doc.position.y = 0.65;
  doc.castShadow = true;
  scene.add(doc);

  const headerStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.12, 0.035),
    new THREE.MeshStandardMaterial({color: 0xef4444, roughness: 0.4})
  );
  headerStripe.position.set(0, 1.15, 0.005);
  scene.add(headerStripe);
  return scene;
}

function buildCar() {
  const scene = new THREE.Scene();
  const bodyMat = new THREE.MeshStandardMaterial({color: 0x0284c7, roughness: 0.25, metalness: 0.6});
  const glassMat = new THREE.MeshStandardMaterial({color: 0x0f172a, roughness: 0.1});
  const wheelMat = new THREE.MeshStandardMaterial({color: 0x1e293b, roughness: 0.85});

  // Chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.55, 1.3), bodyMat);
  chassis.position.set(0, 0.45, 0);
  chassis.castShadow = true;
  scene.add(chassis);

  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.15), glassMat);
  cabin.position.set(-0.15, 0.95, 0);
  cabin.castShadow = true;
  scene.add(cabin);

  // 4 Wheels
  const wheelPositions = [
    [-0.9, 0.22, 0.65],
    [0.9, 0.22, 0.65],
    [-0.9, 0.22, -0.65],
    [0.9, 0.22, -0.65]
  ];
  for (const pos of wheelPositions) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 16), wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(...pos);
    wheel.castShadow = true;
    scene.add(wheel);
  }
  return scene;
}

function buildHouse() {
  const scene = new THREE.Scene();
  const wallMat = new THREE.MeshStandardMaterial({color: 0xf1f5f9, roughness: 0.9});
  const roofMat = new THREE.MeshStandardMaterial({color: 0xb91c1c, roughness: 0.6});
  const doorMat = new THREE.MeshStandardMaterial({color: 0x78350f, roughness: 0.5});

  // Main House Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 2.2), wallMat);
  body.position.set(0, 0.9, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);

  // Pitched Roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, 2.4, 0);
  roof.castShadow = true;
  scene.add(roof);

  // Door
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.95, 0.05), doorMat);
  door.position.set(0, 0.48, 1.12);
  scene.add(door);
  return scene;
}

function buildBuilding() {
  const scene = new THREE.Scene();
  const concreteMat = new THREE.MeshStandardMaterial({color: 0x475569, roughness: 0.8});
  const glassMat = new THREE.MeshStandardMaterial({color: 0x38bdf8, roughness: 0.15, metalness: 0.7});

  const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 6.0, 2.4), concreteMat);
  tower.position.set(0, 3.0, 0);
  tower.castShadow = true;
  scene.add(tower);

  // Window bands
  for (let y = 1.0; y < 5.5; y += 0.8) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.4, 2.44), glassMat);
    band.position.set(0, y, 0);
    scene.add(band);
  }
  return scene;
}

function buildShoppingCart() {
  const scene = new THREE.Scene();
  const metalMat = new THREE.MeshStandardMaterial({color: 0x94a3b8, roughness: 0.3, metalness: 0.8});
  const plasticMat = new THREE.MeshStandardMaterial({color: 0xdc2626, roughness: 0.4});

  // Wire basket
  const basket = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.7), metalMat);
  basket.position.set(0, 0.75, 0);
  basket.castShadow = true;
  scene.add(basket);

  // Handle
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 12), plasticMat);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(-0.6, 1.15, 0);
  scene.add(handle);
  return scene;
}

function buildPackage() {
  const scene = new THREE.Scene();
  const cardMat = new THREE.MeshStandardMaterial({color: 0xc29b68, roughness: 0.85});
  const tapeMat = new THREE.MeshStandardMaterial({color: 0xa37844, roughness: 0.5});

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.85), cardMat);
  box.position.y = 0.375;
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);

  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.76, 0.86), tapeMat);
  tape.position.y = 0.375;
  scene.add(tape);
  return scene;
}

// -------------------------------------------------------------
// Generation Pipeline
// -------------------------------------------------------------

async function main() {
  console.log('Generating MotionClone V6 GLB Asset Library...');

  const manifest = [
    {category: 'finance', file: 'credit-card.glb', builder: buildCreditCard},
    {category: 'finance', file: 'cash-bundle.glb', builder: buildCashBundle},
    {category: 'finance', file: 'coin-stack.glb', builder: buildCoinStack},
    {category: 'finance', file: 'banknote.glb', builder: buildBanknote},
    {category: 'finance', file: 'wallet.glb', builder: buildWallet},
    {category: 'finance', file: 'bank-counter.glb', builder: buildBankCounter},
    {category: 'technology', file: 'smartphone.glb', builder: buildSmartphone},
    {category: 'technology', file: 'laptop.glb', builder: buildLaptop},
    {category: 'technology', file: 'monitor.glb', builder: buildMonitor},
    {category: 'office', file: 'desk.glb', builder: buildDesk},
    {category: 'office', file: 'chair.glb', builder: buildChair},
    {category: 'office', file: 'document.glb', builder: buildDocument},
    {category: 'transport', file: 'car.glb', builder: buildCar},
    {category: 'home', file: 'house.glb', builder: buildHouse},
    {category: 'home', file: 'building.glb', builder: buildBuilding},
    {category: 'retail', file: 'shopping-cart.glb', builder: buildShoppingCart},
    {category: 'retail', file: 'package.glb', builder: buildPackage}
  ];

  for (const item of manifest) {
    const outPath = path.join(MODELS_DIR, item.category, item.file);
    const scene = item.builder();
    await exportToGlb(scene, outPath);
  }

  console.log('Successfully generated all GLB assets!');
}

main().catch((err) => {
  console.error('Failed to generate GLB library:', err);
  process.exit(1);
});

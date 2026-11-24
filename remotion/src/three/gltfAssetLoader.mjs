import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * Stable manifest of bundled local GLB assets.
 * All paths are local to public/models/ — strictly zero external network dependencies at render time.
 */
export const GLB_ASSET_MANIFEST = Object.freeze({
  credit_card: {
    url: '/models/finance/credit-card.glb',
    category: 'finance',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [0.86, 0.045, 0.55], color: '#263c63'},
    license: 'CC0-1.0'
  },
  finance_card: {
    url: '/models/finance/credit-card.glb',
    category: 'finance',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [0.86, 0.045, 0.55], color: '#263c63'},
    license: 'CC0-1.0'
  },
  cash_stack: {
    url: '/models/finance/cash-bundle.glb',
    category: 'finance',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [0.72, 0.18, 0.42], color: '#4e9b69'},
    license: 'CC0-1.0'
  },
  cash_bundle: {
    url: '/models/finance/cash-bundle.glb',
    category: 'finance',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [0.72, 0.18, 0.42], color: '#4e9b69'},
    license: 'CC0-1.0'
  },
  coin: {
    url: '/models/finance/coin-stack.glb',
    category: 'finance',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'cylinder', size: [0.32, 0.12, 0.32], color: '#d9a52e'},
    license: 'CC0-1.0'
  },
  coin_stack: {
    url: '/models/finance/coin-stack.glb',
    category: 'finance',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'cylinder', size: [0.32, 0.12, 0.32], color: '#d9a52e'},
    license: 'CC0-1.0'
  },
  banknote: {
    url: '/models/finance/banknote.glb',
    category: 'finance',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [0.65, 0.01, 0.32], color: '#689f38'},
    license: 'CC0-1.0'
  },
  wallet: {
    url: '/models/finance/wallet.glb',
    category: 'finance',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [0.45, 0.12, 0.35], color: '#5d4037'},
    license: 'CC0-1.0'
  },
  bank_counter: {
    url: '/models/finance/bank-counter.glb',
    category: 'finance',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [3.2, 1.05, 0.85], color: '#b9a58a'},
    license: 'CC0-1.0'
  },
  smartphone: {
    url: '/models/technology/smartphone.glb',
    category: 'technology',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [0.34, 0.72, 0.055], color: '#20242b'},
    license: 'CC0-1.0'
  },
  laptop: {
    url: '/models/technology/laptop.glb',
    category: 'technology',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [1.05, 0.055, 0.72], color: '#9aa5b1'},
    license: 'CC0-1.0'
  },
  monitor: {
    url: '/models/technology/monitor.glb',
    category: 'technology',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [1.2, 0.75, 0.25], color: '#1f2937'},
    license: 'CC0-1.0'
  },
  office_desk: {
    url: '/models/office/desk.glb',
    category: 'office',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [2.4, 0.16, 1.15], color: '#8b674d'},
    license: 'CC0-1.0'
  },
  desk: {
    url: '/models/office/desk.glb',
    category: 'office',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [2.4, 0.16, 1.15], color: '#8b674d'},
    license: 'CC0-1.0'
  },
  office_chair: {
    url: '/models/office/chair.glb',
    category: 'office',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [0.65, 0.9, 0.65], color: '#485568'},
    license: 'CC0-1.0'
  },
  chair: {
    url: '/models/office/chair.glb',
    category: 'office',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [0.65, 0.9, 0.65], color: '#485568'},
    license: 'CC0-1.0'
  },
  document: {
    url: '/models/office/document.glb',
    category: 'office',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [0.72, 0.025, 0.96], color: '#f5f2e9'},
    license: 'CC0-1.0'
  },
  car: {
    url: '/models/transport/car.glb',
    category: 'transport',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [2.1, 0.7, 1.05], color: '#4778a8'},
    license: 'CC0-1.0'
  },
  house: {
    url: '/models/home/house.glb',
    category: 'home',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [2.8, 2.1, 2.5], color: '#d8c7a6'},
    license: 'CC0-1.0'
  },
  building: {
    url: '/models/home/building.glb',
    category: 'home',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [3.5, 6.0, 3.5], color: '#607d8b'},
    license: 'CC0-1.0'
  },
  shopping_cart: {
    url: '/models/retail/shopping-cart.glb',
    category: 'retail',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [0.9, 0.75, 0.55], color: '#9ba8b5'},
    license: 'CC0-1.0'
  },
  package: {
    url: '/models/retail/package.glb',
    category: 'retail',
    scale: [1, 1, 1],
    anchor: [0, 0, 0],
    fallback: {primitive: 'box', size: [0.6, 0.45, 0.45], color: '#bcaaa4'},
    license: 'CC0-1.0'
  }
});

export function resolveModelUrl(rawUrl) {
  if (typeof window !== 'undefined') {
    // In browser/Remotion context, if staticFile is available or URL is relative
    return rawUrl;
  }
  return rawUrl;
}

export function createLocalGltfLoader({dracoDecoderPath = '/draco/'} = {}) {
  const loader = new GLTFLoader();
  let draco = null;
  try {
    draco = new DRACOLoader();
    draco.setDecoderPath(dracoDecoderPath);
    loader.setDRACOLoader(draco);
  } catch (_) {
    // DRACOLoader is optional when loading non-compressed binary GLTF
  }
  return {
    loader,
    dispose: () => {
      if (draco) {
        try {
          draco.dispose();
        } catch (_) {}
      }
    }
  };
}

export async function loadCatalogAsset(id, loader) {
  const entry = GLB_ASSET_MANIFEST[id];
  if (!entry) throw new Error('Unknown GLB asset: ' + id);
  const activeLoader = loader || createLocalGltfLoader().loader;
  const gltf = await activeLoader.loadAsync(resolveModelUrl(entry.url));
  gltf.scene.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.material) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const m of mats) {
          m.needsUpdate = true;
        }
      }
    }
  });
  return {
    id,
    scene: gltf.scene,
    animations: gltf.animations || [],
    manifest: entry
  };
}

export async function preloadCatalogAssets(ids = [], loader) {
  const result = new Map();
  const errors = [];
  for (const id of [...new Set(ids)]) {
    try {
      result.set(id, await loadCatalogAsset(id, loader));
    } catch (error) {
      errors.push({id, message: String(error?.message || error)});
    }
  }
  return {assets: result, errors, complete: errors.length === 0};
}

export function disposeHierarchy(root) {
  if (!root) return;
  root.traverse((node) => {
    if (node.geometry) {
      node.geometry.dispose();
    }
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) {
        for (const key of Object.keys(m)) {
          const val = m[key];
          if (val && typeof val === 'object' && val.isTexture) {
            val.dispose();
          }
        }
        m.dispose();
      }
    }
  });
}

export const ASSET_CATALOG = Object.freeze({
  credit_card: {kind: 'glb', glb: 'credit_card', category: 'finance', primitive: 'box', size: [.86, .045, .55], color: '#263c63', tags: ['banking', 'debt', 'payment']},
  finance_card: {kind: 'glb', glb: 'credit_card', category: 'finance', primitive: 'box', size: [.86, .045, .55], color: '#263c63', tags: ['banking', 'debt', 'payment']},
  cash_stack: {kind: 'glb', glb: 'cash_stack', category: 'finance', primitive: 'box', size: [.72, .18, .42], color: '#4e9b69', tags: ['money', 'cash', 'savings']},
  cash_bundle: {kind: 'glb', glb: 'cash_bundle', category: 'finance', primitive: 'box', size: [.72, .18, .42], color: '#4e9b69', tags: ['money', 'cash', 'savings']},
  coin: {kind: 'glb', glb: 'coin', category: 'finance', primitive: 'cylinder', size: [.32, .12, .32], color: '#d9a52e', tags: ['money', 'savings']},
  coin_stack: {kind: 'glb', glb: 'coin_stack', category: 'finance', primitive: 'cylinder', size: [.32, .12, .32], color: '#d9a52e', tags: ['money', 'savings']},
  banknote: {kind: 'glb', glb: 'banknote', category: 'finance', primitive: 'box', size: [.65, .01, .32], color: '#689f38', tags: ['money', 'cash']},
  wallet: {kind: 'glb', glb: 'wallet', category: 'finance', primitive: 'box', size: [.45, .12, .35], color: '#5d4037', tags: ['finance', 'payment']},
  bank_counter: {kind: 'glb', glb: 'bank_counter', category: 'finance', primitive: 'box', size: [3.2, 1.05, .85], color: '#b9a58a', tags: ['bank', 'money']},
  smartphone: {kind: 'glb', glb: 'smartphone', category: 'technology', primitive: 'box', size: [.34, .72, .055], color: '#20242b', tags: ['phone', 'app']},
  laptop: {kind: 'glb', glb: 'laptop', category: 'technology', primitive: 'box', size: [1.05, .055, .72], color: '#9aa5b1', tags: ['computer', 'office']},
  monitor: {kind: 'glb', glb: 'monitor', category: 'technology', primitive: 'box', size: [1.2, .75, .25], color: '#1f2937', tags: ['office', 'display']},
  document: {kind: 'glb', glb: 'document', category: 'office', primitive: 'box', size: [.72, .025, .96], color: '#f5f2e9', tags: ['bill', 'invoice', 'paper']},
  desk: {kind: 'glb', glb: 'desk', category: 'office', primitive: 'box', size: [2.4, .16, 1.15], color: '#8b674d', tags: ['office', 'work']},
  office_desk: {kind: 'glb', glb: 'desk', category: 'office', primitive: 'box', size: [2.4, .16, 1.15], color: '#8b674d', tags: ['office', 'work']},
  chair: {kind: 'glb', glb: 'chair', category: 'office', primitive: 'box', size: [.65, .9, .65], color: '#485568', tags: ['office', 'home']},
  office_chair: {kind: 'glb', glb: 'chair', category: 'office', primitive: 'box', size: [.65, .9, .65], color: '#485568', tags: ['office', 'home']},
  shopping_cart: {kind: 'glb', glb: 'shopping_cart', category: 'retail', primitive: 'box', size: [.9, .75, .55], color: '#9ba8b5', tags: ['shopping', 'retail']},
  package: {kind: 'glb', glb: 'package', category: 'retail', primitive: 'box', size: [.6, .45, .45], color: '#bcaaa4', tags: ['shipping', 'retail']},
  car: {kind: 'glb', glb: 'car', category: 'transport', primitive: 'box', size: [2.1, .7, 1.05], color: '#4778a8', tags: ['vehicle', 'travel']},
  house: {kind: 'glb', glb: 'house', category: 'home', primitive: 'box', size: [2.8, 2.1, 2.5], color: '#d8c7a6', tags: ['home', 'property']},
  building: {kind: 'glb', glb: 'building', category: 'home', primitive: 'box', size: [3.5, 6.0, 3.5], color: '#607d8b', tags: ['building', 'city']}
});

export function resolveAsset(id) {
  return typeof id === 'string' ? (ASSET_CATALOG[id] || null) : null;
}

export function validateSceneAssets(objects = []) {
  const missing = [];
  const resolved = objects.map((item, index) => {
    if (!item || typeof item !== 'object') {
      missing.push({index, asset: null, reason: 'invalid_object'});
      return null;
    }
    if (!item.asset) return {...item, source: 'primitive'};
    const asset = resolveAsset(item.asset);
    if (!asset) {
      missing.push({index, asset: item.asset, reason: 'unknown_asset'});
      return {...item, source: 'missing'};
    }
    return {
      ...asset,
      ...item,
      type: item.type || asset.primitive,
      size: item.size || asset.size,
      color: item.color || asset.color,
      source: asset.kind,
      glb: asset.glb
    };
  }).filter(Boolean);
  return {objects: resolved, missing, valid: missing.length === 0};
}

import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
/** All model URLs are local public/ paths. No render-time third-party network dependency. */
export const GLB_ASSET_MANIFEST=Object.freeze({
 finance_card:{url:'/models/finance/credit-card.glb',category:'finance',license:'record-in-assets-third-party-md'},
 cash_bundle:{url:'/models/finance/cash-bundle.glb',category:'finance',license:'record-in-assets-third-party-md'},
 coin_stack:{url:'/models/finance/coin-stack.glb',category:'finance',license:'record-in-assets-third-party-md'},
 smartphone:{url:'/models/technology/smartphone.glb',category:'technology',license:'record-in-assets-third-party-md'},
 laptop:{url:'/models/technology/laptop.glb',category:'technology',license:'record-in-assets-third-party-md'},
 office_desk:{url:'/models/office/desk.glb',category:'office',license:'record-in-assets-third-party-md'},
 office_chair:{url:'/models/office/chair.glb',category:'office',license:'record-in-assets-third-party-md'},
 house:{url:'/models/home/house.glb',category:'home',license:'record-in-assets-third-party-md'},
 car:{url:'/models/transport/car.glb',category:'transport',license:'record-in-assets-third-party-md'}
});
export function createLocalGltfLoader({dracoDecoderPath='/draco/'}={}){
 const loader=new GLTFLoader();const draco=new DRACOLoader();draco.setDecoderPath(dracoDecoderPath);loader.setDRACOLoader(draco);
 return {loader,dispose:()=>draco.dispose()};
}
export async function loadCatalogAsset(id,loader=createLocalGltfLoader().loader){
 const entry=GLB_ASSET_MANIFEST[id];if(!entry)throw new Error('Unknown GLB asset: '+id);
 const gltf=await loader.loadAsync(entry.url);
 gltf.scene.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;if(node.material){const mats=Array.isArray(node.material)?node.material:[node.material];for(const m of mats){m.needsUpdate=true;}}}});
 return {id,scene:gltf.scene,animations:gltf.animations||[],manifest:entry};
}
export async function preloadCatalogAssets(ids=[],loader){
 const result=new Map();const errors=[];
 for(const id of [...new Set(ids)]){
  try{result.set(id,await loadCatalogAsset(id,loader));}
  catch(error){errors.push({id,message:String(error?.message||error)});}
 }
 return {assets:result,errors,complete:errors.length===0};
}

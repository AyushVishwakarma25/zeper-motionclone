export const ASSET_CATALOG=Object.freeze({
 credit_card:{kind:'procedural',category:'finance',primitive:'box',size:[.86,.045,.55],color:'#263c63',tags:['banking','debt','payment']},
 cash_stack:{kind:'procedural',category:'finance',primitive:'box',size:[.72,.18,.42],color:'#4e9b69',tags:['money','cash','savings']},
 coin:{kind:'procedural',category:'finance',primitive:'cylinder',size:[.32,.12,.32],color:'#d9a52e',tags:['money','savings']},
 smartphone:{kind:'procedural',category:'technology',primitive:'box',size:[.34,.72,.055],color:'#20242b',tags:['phone','app']},
 laptop:{kind:'procedural',category:'technology',primitive:'box',size:[1.05,.055,.72],color:'#9aa5b1',tags:['computer','office']},
 document:{kind:'procedural',category:'office',primitive:'box',size:[.72,.025,.96],color:'#f5f2e9',tags:['bill','invoice','paper']},
 desk:{kind:'procedural',category:'furniture',primitive:'box',size:[2.4,.16,1.15],color:'#8b674d',tags:['office','work']},
 chair:{kind:'procedural',category:'furniture',primitive:'box',size:[.65,.9,.65],color:'#485568',tags:['office','home']},
 shopping_cart:{kind:'procedural',category:'retail',primitive:'box',size:[.9,.75,.55],color:'#9ba8b5',tags:['shopping','retail']},
 car:{kind:'procedural',category:'transport',primitive:'box',size:[2.1,.7,1.05],color:'#4778a8',tags:['vehicle','travel']},
 bank_counter:{kind:'procedural',category:'finance',primitive:'box',size:[3.2,1.05,.85],color:'#b9a58a',tags:['bank','money']},
 house:{kind:'procedural',category:'building',primitive:'box',size:[2.8,2.1,2.5],color:'#d8c7a6',tags:['home','property']}
});
export function resolveAsset(id){return typeof id==='string'?(ASSET_CATALOG[id]||null):null;}
export function validateSceneAssets(objects=[]){
 const missing=[];
 const resolved=objects.map((item,index)=>{
  if(!item||typeof item!=='object'){missing.push({index,asset:null,reason:'invalid_object'});return null;}
  if(!item.asset)return {...item,source:'primitive'};
  const asset=resolveAsset(item.asset);
  if(!asset){missing.push({index,asset:item.asset,reason:'unknown_asset'});return {...item,source:'missing'};}
  return {...asset,...item,type:item.type||asset.primitive,size:item.size||asset.size,color:item.color||asset.color,source:asset.kind};
 }).filter(Boolean);
 return {objects:resolved,missing,valid:missing.length===0};
}

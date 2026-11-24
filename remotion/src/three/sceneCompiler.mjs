import {normalizeThreeDScene} from './scene3d.mjs';
import {normalizeCharacterConfig,CHARACTER_ACTIONS} from './characterRig.mjs';
import {validateSceneAssets} from './assetCatalog.mjs';
const finite=(v,f)=>Number.isFinite(Number(v))?Number(v):f;
/** Converts semantic JSON to a bounded renderer contract. Never evaluates model-generated code. */
export function compileThreeDScene(input={},options={}){
 const fps=Math.max(1,Math.min(60,finite(options.fps,30)));
 const durationSeconds=Math.max(.25,Math.min(120,finite(input.duration_seconds,5)));
 const durationInFrames=Math.max(1,Math.round(durationSeconds*fps));
 const source=input.three_d||input;
 const assetResult=validateSceneAssets(Array.isArray(source.objects)?source.objects:[]);
 const base=normalizeThreeDScene({...source,objects:assetResult.objects});
 const characterInput=input.character||source.character||{};
 const character=normalizeCharacterConfig({...characterInput,action:CHARACTER_ACTIONS.includes(characterInput.action)?characterInput.action:'idle',enabled:characterInput.enabled!==false});
 return {schema_version:'1.0',scene_id:String(input.scene_id||input.id||'scene-3d').slice(0,96),fps,duration_seconds:durationSeconds,duration_in_frames:durationInFrames,environment:base.environment,background:base.background,ground:base.ground,camera:base.camera,character,objects:base.objects,diagnostics:{valid:assetResult.valid,warnings:assetResult.missing.map(x=>'Object '+x.index+': '+x.reason+' ('+(x.asset||'unnamed')+')')}};
}
export function validateCompiledScene(scene){
 const errors=[];
 if(!scene||scene.schema_version!=='1.0')errors.push('Unsupported scene schema.');
 if(!Number.isInteger(scene?.duration_in_frames)||scene.duration_in_frames<1)errors.push('Invalid frame duration.');
 if(!Array.isArray(scene?.objects)||scene.objects.length>40)errors.push('Invalid object collection.');
 if(scene?.character?.action&&!CHARACTER_ACTIONS.includes(scene.character.action))errors.push('Unsupported character action.');
 return {valid:errors.length===0,errors};
}

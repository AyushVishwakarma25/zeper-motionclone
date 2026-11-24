import test from 'node:test';
import assert from 'node:assert/strict';
import {characterPoseAtFrame,normalizeCharacterConfig,CHARACTER_ACTIONS} from '../src/three/characterRig.mjs';
import {compileThreeDScene,validateCompiledScene} from '../src/three/sceneCompiler.mjs';
import {resolveAsset,validateSceneAssets} from '../src/three/assetCatalog.mjs';

test('character config clamps scale and validates action',()=>{
 const c=normalizeCharacterConfig({scale:99,action:'fly'});
 assert.equal(c.scale,3);assert.equal(c.action,'idle');
});
test('all advertised animation actions return finite joint values',()=>{
 for(const action of CHARACTER_ACTIONS){const pose=characterPoseAtFrame(action,45,30);for(const v of Object.values(pose))assert.ok(Number.isFinite(v),action);}
});
test('walking pose moves alternating limbs',()=>{
 const pose=characterPoseAtFrame('walk',12,30);
 assert.notEqual(pose.leftLegX,pose.rightLegX);
});
test('semantic catalogue resolves known props and flags unknown assets',()=>{
 assert.ok(resolveAsset('credit_card'));
 const result=validateSceneAssets([{asset:'credit_card'},{asset:'unknown_thing'}]);
 assert.equal(result.objects[0].type,'box');assert.equal(result.valid,false);
});
test('scene compiler returns deterministic bounded renderer contract',()=>{
 const scene=compileThreeDScene({id:'demo',duration_seconds:4,character:{action:'point'},three_d:{environment:'office',objects:[{asset:'laptop',position:[0,1,0]}]}},{fps:30});
 assert.equal(scene.duration_in_frames,120);assert.equal(scene.character.action,'point');assert.equal(validateCompiledScene(scene).valid,true);
});

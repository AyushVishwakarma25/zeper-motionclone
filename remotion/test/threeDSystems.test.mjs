import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCameraPlan,cameraPoseForFrame} from '../src/three/cinematicCamera.mjs';
import {validatePhysicsBake,physicsTransformAtFrame} from '../src/three/physicsBake.mjs';
import {GLB_ASSET_MANIFEST} from '../src/three/gltfAssetLoader.mjs';

test('cinematic camera plan normalizes shot ranges and produces finite poses',()=>{
 const plan=normalizeCameraPlan({shots:[{start_frame:0,end_frame:30,from:'wide',to:'close_up',ease:'smooth',focus:[0,1,0]}]},30,30);
 const first=cameraPoseForFrame(plan,0),last=cameraPoseForFrame(plan,29);
 assert.ok(first.position.every(Number.isFinite));assert.ok(last.position.every(Number.isFinite));
 assert.ok(last.position[2]<first.position[2]);
});
test('camera shot selection remains deterministic at boundaries',()=>{
 const plan=normalizeCameraPlan({shots:[{start_frame:0,end_frame:10,from:'wide',to:'wide'},{start_frame:10,end_frame:20,from:'close_up',to:'close_up'}]},30,20);
 assert.ok(cameraPoseForFrame(plan,9).position[2]>cameraPoseForFrame(plan,10).position[2]);
});
test('physics bake validation checks frame count and finite transforms',()=>{
 const valid={schema_version:'1.0',fps:30,duration_in_frames:1,frames:[{box:{position:[0,1,0],rotation:[0,0,0,1]}}]};
 assert.equal(validatePhysicsBake(valid).valid,true);
 assert.equal(physicsTransformAtFrame(valid,'box',0).position[1],1);
 assert.equal(validatePhysicsBake({...valid,frames:[]}).valid,false);
});
test('GLB manifest uses only local public paths',()=>{
 assert.ok(Object.keys(GLB_ASSET_MANIFEST).length>=8);
 for(const item of Object.values(GLB_ASSET_MANIFEST)){assert.ok(item.url.startsWith('/models/'));assert.equal(/^https?:/i.test(item.url),false);}
});

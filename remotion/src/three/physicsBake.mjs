/** Deterministic offline physics bake. Import Rapier lazily so 2D projects do not load it. */
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
export async function bakePhysicsScene(scene={},options={}){
 const fps=Math.max(1,Math.min(60,Math.round(finite(options.fps,30))));
 const duration=Math.max(1,Math.min(60*120,Math.round(finite(options.durationInFrames,150))));
 const RAPIER=options.rapier||await import('@dimforge/rapier3d-compat');
 await RAPIER.init();
 const gravity=scene.gravity||[0,-9.81,0];
 const world=new RAPIER.World({x:finite(gravity[0]),y:finite(gravity[1],-9.81),z:finite(gravity[2])});
 world.timestep=1/fps;
 const bodies=new Map();
 for(const [i,item] of (scene.bodies||[]).entries()){
  const position=item.position||[0,1,0],rotation=item.rotation||[0,0,0,1];
  const desc=item.type==='fixed'?RAPIER.RigidBodyDesc.fixed():RAPIER.RigidBodyDesc.dynamic();
  desc.setTranslation(finite(position[0]),finite(position[1]),finite(position[2]));
  desc.setRotation({x:finite(rotation[0]),y:finite(rotation[1]),z:finite(rotation[2]),w:finite(rotation[3],1)});
  if(item.linear_velocity)desc.setLinvel({x:finite(item.linear_velocity[0]),y:finite(item.linear_velocity[1]),z:finite(item.linear_velocity[2])});
  const body=world.createRigidBody(desc);
  const size=item.half_extents||[.5,.5,.5];
  const collider=RAPIER.ColliderDesc.cuboid(Math.max(.01,Math.abs(finite(size[0],.5))),Math.max(.01,Math.abs(finite(size[1],.5))),Math.max(.01,Math.abs(finite(size[2],.5))));
  collider.setRestitution(Math.max(0,Math.min(1,finite(item.restitution,0.05))));
  collider.setFriction(Math.max(0,Math.min(2,finite(item.friction,.7))));
  world.createCollider(collider,body);bodies.set(String(item.id||i),body);
 }
 const frames=[];
 for(let frame=0;frame<duration;frame++){
  if(typeof options.onProgress==='function'&&frame%Math.max(1,Math.floor(fps/2))===0)options.onProgress(frame,duration);
  world.step();
  const transforms={};
  for(const [id,body] of bodies){
   const p=body.translation(),q=body.rotation();
   transforms[id]={position:[p.x,p.y,p.z],rotation:[q.x,q.y,q.z,q.w]};
  }
  frames.push(transforms);
 }
 world.free();
 return {schema_version:'1.0',fps,duration_in_frames:duration,frames};
}
export function physicsTransformAtFrame(bake,id,frame){
 const index=Math.max(0,Math.min((bake?.frames?.length||1)-1,Math.floor(finite(frame))));
 return bake?.frames?.[index]?.[id]||null;
}
export function validatePhysicsBake(bake){
 const errors=[];
 if(bake?.schema_version!=='1.0')errors.push('Unsupported physics bake schema.');
 if(!Number.isInteger(bake?.fps)||bake.fps<1)errors.push('Invalid physics FPS.');
 if(!Array.isArray(bake?.frames)||bake.frames.length!==bake.duration_in_frames)errors.push('Physics frames do not match declared duration.');
 for(const [i,frame] of (bake?.frames||[]).entries())for(const [id,t] of Object.entries(frame||{}))if(![...(t.position||[]),...(t.rotation||[])].every(Number.isFinite))errors.push('Non-finite transform at frame '+i+' for '+id);
 return {valid:errors.length===0,errors};
}

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(Number(v))?Number(v):a));
const smooth=t=>t*t*(3-2*t);
const easeOut=t=>1-Math.pow(1-t,3);
const lerp=(a,b,t)=>a+(b-a)*t;
const SHOTS=new Set(['establishing','wide','medium','close_up','extreme_close_up','over_shoulder','low_angle','top_down','orbit','tracking','dolly_in','dolly_out','pan_left','pan_right','crane_down','hold']);
const PRESETS={
 establishing:{position:[0,7.5,18],target:[0,1,0],fov:46},
 wide:{position:[0,6.2,15],target:[0,1.1,0],fov:42},
 medium:{position:[0,4.7,10],target:[0,1.3,0],fov:38},
 close_up:{position:[0,3.4,6.2],target:[0,1.8,0],fov:34},
 extreme_close_up:{position:[0,2.6,4.1],target:[0,2,0],fov:30},
 over_shoulder:{position:[2.8,4.2,8],target:[0,1.5,-1],fov:40},
 low_angle:{position:[0,1.8,10],target:[0,2.1,0],fov:39},
 top_down:{position:[0,17,0.01],target:[0,0,0],fov:48},
 orbit:{position:[7,5,12],target:[0,1.2,0],fov:38},
 tracking:{position:[-4,4.5,11],target:[0,1.2,0],fov:38},
 dolly_in:{position:[0,5.2,13],target:[0,1.2,0],fov:39},
 dolly_out:{position:[0,5.2,9],target:[0,1.2,0],fov:42},
 pan_left:{position:[3,5.2,12],target:[0,1.2,0],fov:38},
 pan_right:{position:[-3,5.2,12],target:[0,1.2,0],fov:38},
 crane_down:{position:[0,10,14],target:[0,1,0],fov:42},
 hold:{position:[0,5.2,12],target:[0,1.2,0],fov:38}
};
/** Shot cues are absolute frame ranges. Each shot can ease between named presets. */
export function normalizeCameraPlan(plan={},fps=30,durationInFrames=150){
 const cues=Array.isArray(plan.shots)?plan.shots:[];
 const normalized=cues.slice(0,80).map((shot,i)=>{
  const start=Math.max(0,Math.floor(clamp(shot.start_frame,0,durationInFrames-1)));
  const end=Math.max(start+1,Math.min(durationInFrames,Math.floor(clamp(shot.end_frame,durationInFrames,1))));
  const from=SHOTS.has(shot.from)?shot.from:(SHOTS.has(shot.type)?shot.type:'medium');
  const to=SHOTS.has(shot.to)?shot.to:from;
  return {id:String(shot.id||'shot-'+i),start_frame:start,end_frame:end,from,to,focus:Array.isArray(shot.focus)&&shot.focus.length===3?shot.focus.map(v=>clamp(v,-50,50)):[0,1,0],ease:['linear','smooth','out'].includes(shot.ease)?shot.ease:'smooth',fov:clamp(shot.fov,20,75),roll:clamp(shot.roll,-0.25,0.25)};
 }).sort((a,b)=>a.start_frame-b.start_frame);
 return {fps,duration_in_frames:durationInFrames,shots:normalized};
}
function shotPose(name,focus){
 const p=PRESETS[name]||PRESETS.medium;
 return {position:p.position.map((v,i)=>v+focus[i]),target:p.target.map((v,i)=>v+focus[i]),fov:p.fov};
}
export function cameraPoseForFrame(plan={},frame=0){
 const shots=plan.shots||[];
 if(!shots.length)return {...shotPose('medium',[0,0,0]),roll:0};
 let shot=shots.find(s=>frame>=s.start_frame&&frame<s.end_frame);
 if(!shot)shot=frame<shots[0].start_frame?shots[0]:shots[shots.length-1];
 const raw=clamp((frame-shot.start_frame)/Math.max(1,shot.end_frame-shot.start_frame-1),0,1);
 const t=shot.ease==='linear'?raw:shot.ease==='out'?easeOut(raw):smooth(raw);
 const a=shotPose(shot.from,shot.focus),b=shotPose(shot.to,shot.focus);
 return {position:a.position.map((v,i)=>lerp(v,b.position[i],t)),target:a.target.map((v,i)=>lerp(v,b.target[i],t)),fov:lerp(a.fov,b.fov,t)+(shot.fov?shot.fov-b.fov:0)*t,roll:shot.roll||0};
}

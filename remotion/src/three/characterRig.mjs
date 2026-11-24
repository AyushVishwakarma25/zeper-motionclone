/**
 * Deterministic procedural stickman rig. All animation derives from Remotion frames.
 */
export const CHARACTER_ACTIONS = Object.freeze(['idle','walk','run','sit','stand','point','hold','think','celebrate','fall','explain']);
export const CHARACTER_EXPRESSIONS = Object.freeze(['neutral','happy','sad','stressed','surprised','confused']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};

export function normalizeCharacterConfig(input={}) {
 const action=CHARACTER_ACTIONS.includes(input.action)?input.action:'idle';
 const expression=CHARACTER_EXPRESSIONS.includes(input.expression)?input.expression:'neutral';
 return {enabled:input.enabled!==false,action,expression,scale:clamp(Number(input.scale)||1,.35,3),
 position:Array.isArray(input.position)&&input.position.length===3?input.position.map(v=>clamp(Number(v)||0,-30,30)):[0,0,0],
 color:/^#[0-9a-f]{6}$/i.test(input.color||'')?input.color:'#20242b',
 accent:/^#[0-9a-f]{6}$/i.test(input.accent||'')?input.accent:'#4f9cf9'};
}

export function characterPoseAtFrame(action,frame,fps=30,options={}) {
 const t=Math.max(0,frame)/Math.max(1,fps), phase=t*(action==='run'?11:6.2), wave=Math.sin(phase);
 const blend=smooth((frame-(options.enterFrame||0))/Math.max(1,options.blendFrames||8));
 const p={rootY:0,rootX:0,rootZ:0,torsoX:0,torsoZ:0,headX:0,headZ:0,
 leftArmX:0,leftArmZ:0,rightArmX:0,rightArmZ:0,leftLegX:0,rightLegX:0,leftKneeX:0,rightKneeX:0,leftElbowX:0,rightElbowX:0};
 switch(action){
 case 'walk':case 'run':{const a=action==='run'?.85:.48;p.rootY=Math.abs(wave)*(action==='run'?.16:.07);p.leftLegX=wave*a;p.rightLegX=-wave*a;p.leftArmX=-wave*a*.8;p.rightArmX=wave*a*.8;p.leftKneeX=Math.max(0,-wave)*a;p.rightKneeX=Math.max(0,wave)*a;p.torsoX=action==='run'?-.18:0;break;}
 case 'sit':p.rootY=-.48;p.torsoX=-.08;p.leftLegX=-1.15;p.rightLegX=-1.15;p.leftKneeX=1.05;p.rightKneeX=1.05;p.leftArmX=-.35;p.rightArmX=-.35;break;
 case 'stand':p.rootY=-.45*(1-smooth((frame%Math.max(1,fps))/Math.max(1,fps)));p.leftLegX=-.2;p.rightLegX=-.2;break;
 case 'point':p.rightArmX=-1.25;p.rightArmZ=-.22;p.rightElbowX=-.15;p.headZ=-.08;break;
 case 'hold':p.leftArmX=-.72;p.rightArmX=-.72;p.leftArmZ=.28;p.rightArmZ=-.28;p.leftElbowX=-.75;p.rightElbowX=-.75;break;
 case 'think':p.rightArmX=-1.35;p.rightArmZ=-.32;p.rightElbowX=-1.1;p.headX=.12;p.headZ=Math.sin(t*1.5)*.035;break;
 case 'celebrate':p.leftArmX=-2.65;p.rightArmX=-2.65;p.leftArmZ=.35;p.rightArmZ=-.35;p.rootY=Math.abs(Math.sin(t*5))*.22;break;
 case 'fall':p.rootZ=Math.min(1.25,smooth(t/1.2)*1.25);p.rootY=-smooth(t/1.2)*.65;p.leftArmZ=1;p.rightArmZ=-1;break;
 case 'explain':p.leftArmX=-.55+Math.sin(t*2.4)*.2;p.rightArmX=-.55-Math.sin(t*2.4)*.2;p.leftArmZ=.18;p.rightArmZ=-.18;p.headZ=Math.sin(t*1.8)*.04;break;
 default:p.rootY=Math.sin(t*2)*.025;p.leftArmX=Math.sin(t*1.4)*.025;p.rightArmX=-Math.sin(t*1.4)*.025;
 }
 Object.keys(p).forEach(k=>p[k]*=blend);return p;
}

function capsule(T,r,len,mat){const m=new T.Mesh(new T.CapsuleGeometry(r,len,4,8),mat);m.castShadow=true;m.receiveShadow=true;return m;}
function pivot(T,parent,x,y,z){const g=new T.Group();g.position.set(x,y,z);parent.add(g);return g;}

export function createStickmanRig(T,config={}) {
 const c=normalizeCharacterConfig(config),root=new T.Group();root.name='motionclone-stickman-root';root.position.set(...c.position);root.scale.setScalar(c.scale);
 const dark=new T.MeshStandardMaterial({color:c.color,roughness:.78}),accent=new T.MeshStandardMaterial({color:c.accent,roughness:.65}),skin=new T.MeshStandardMaterial({color:'#f1c7a5',roughness:.85}),eyes=new T.MeshStandardMaterial({color:'#20242b'});
 const joints={};
 const torso=capsule(T,.19,.68,accent);torso.position.y=1.55;root.add(torso);
 const pelvis=new T.Mesh(new T.SphereGeometry(.2,16,12),dark);pelvis.position.y=1.08;root.add(pelvis);
 const neck=new T.Mesh(new T.CylinderGeometry(.07,.08,.16,12),skin);neck.position.y=2;root.add(neck);
 const head=new T.Mesh(new T.SphereGeometry(.27,24,18),skin);head.position.y=2.32;root.add(head);
 for(const side of [-1,1]){const eye=new T.Mesh(new T.SphereGeometry(.025,8,8),eyes);eye.position.set(side*.095,2.36,.235);root.add(eye);}
 for(const [side,label] of [[-1,'left'],[1,'right']]){
  const shoulder=pivot(T,root,side*.25,1.82,0),upper=capsule(T,.075,.36,dark);upper.position.y=-.2;shoulder.add(upper);
  const elbow=pivot(T,shoulder,0,-.4,0),fore=capsule(T,.065,.34,dark);fore.position.y=-.19;elbow.add(fore);
  const hand=new T.Mesh(new T.SphereGeometry(.085,12,10),skin);hand.position.y=-.4;elbow.add(hand);
  joints[label+'Arm']=shoulder;joints[label+'Elbow']=elbow;
  const hip=pivot(T,root,side*.12,1,0),thigh=capsule(T,.095,.43,dark);thigh.position.y=-.25;hip.add(thigh);
  const knee=pivot(T,hip,0,-.49,0),shin=capsule(T,.075,.42,dark);shin.position.y=-.23;knee.add(shin);
  const foot=new T.Mesh(new T.BoxGeometry(.16,.09,.28),dark);foot.position.set(0,-.48,.08);knee.add(foot);
  joints[label+'Leg']=hip;joints[label+'Knee']=knee;
 }
 joints.head=head;joints.torso=torso;joints.root=root;
 root.userData.disposeMaterials=[dark,accent,skin,eyes];
 return {root,joints,config:c};
}
export function applyStickmanPose(rig,p) {
 if(!rig?.joints)return;const j=rig.joints;
 j.root.position.y=rig.config.position[1]+p.rootY;j.root.rotation.x=p.rootX;j.root.rotation.z=p.rootZ;
 j.torso.rotation.x=p.torsoX;j.torso.rotation.z=p.torsoZ;j.head.rotation.x=p.headX;j.head.rotation.z=p.headZ;
 for(const side of ['left','right']){j[side+'Arm'].rotation.x=p[side+'ArmX'];j[side+'Arm'].rotation.z=(side==='left'?1:-1)*p[side+'ArmZ'];j[side+'Elbow'].rotation.x=p[side+'ElbowX'];j[side+'Leg'].rotation.x=p[side+'LegX'];j[side+'Knee'].rotation.x=p[side+'KneeX'];}
}

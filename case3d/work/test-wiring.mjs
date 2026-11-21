// งานบัดกรีจริง: JST / ตัวต้านทาน / ท่อหด ต้องอยู่ในกล่องและไม่ชนชิ้นอื่น, สายต้องไปลงขาที่ต่อจริง
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import * as THREE from './vendor/three.module.js';import {makeShell} from './shell-geometry.js';
const cfg={window:{}};vm.createContext(cfg);vm.runInContext(fs.readFileSync('work/config.js','utf8'),cfg);
const CONFIG=cfg.window.CONFIG;const {buildDevice,wiringGapText}=new Function('THREE','CONFIG','makeShell',fs.readFileSync('work/model.js','utf8')+'\nreturn {buildDevice,wiringGapText};')(THREE,CONFIG,makeShell);
assert.ok(Array.isArray(CONFIG.wiring.backPads),'interior back-pad table replaces guessed edge-row BAT pads');
assert.equal(CONFIG.wiring.batPads,undefined,'obsolete BAT edge-row mapping removed');
const eps=0.05;
const overlap=(a,b)=>a.min.x<b.max.x-eps&&a.max.x>b.min.x+eps&&a.min.y<b.max.y-eps&&a.max.y>b.min.y+eps&&a.min.z<b.max.z-eps&&a.max.z>b.min.z+eps;
let checked=0;
for(const version of ['v1','legacy','v2','v2p'])for(const battery of [500,1200])for(const variant of ['clip','magnet','pendant']) {
 const d=buildDevice({version,battery,variant,angle:20,fov:false,torso:false},false);d.root.updateMatrixWorld(true);
 const parts=[],others=[];
 d.root.traverse(o=>{
  if(['wiring-jst-battery','wiring-jst-button','wiring-resistor','wiring-shrink'].includes(o.name)){parts.push(o);return;}
  if(!o.isMesh)return;for(let parent=o.parent;parent;parent=parent.parent)if(parent.name.startsWith('wiring-jst-'))return;
  const skip=o===d.parts.front.children[0]||o===d.parts.back.children[0]||o.geometry.type==='TubeGeometry'||o.userData.ribbon
   ||o.parent===d.parts.mount||o.name.startsWith('hinge')||o.name==='shirt'||o.parent?.name==='fov'||o.name.startsWith('wiring-joint')||o.name==='wiring-junction';
  if(!skip)others.push(o);});
 assert.equal(parts.length,6,'2 JST + 2 resistors + 2 sleeves');
 const inner={x:d.p.w/2-CONFIG.case.wall,y:d.p.h/2-CONFIG.case.wall,z:d.p.d/2-CONFIG.case.wall};
 for(const a of parts){const A=new THREE.Box3().setFromObject(a);
  assert.ok(Math.max(Math.abs(A.min.x),Math.abs(A.max.x))<=inner.x&&Math.max(Math.abs(A.min.y),Math.abs(A.max.y))<=inner.y&&Math.max(Math.abs(A.min.z),Math.abs(A.max.z))<=inner.z,`${version} ${battery} ${variant}: ${a.name} inside the case`);
  for(const o of others){const B=new THREE.Box3().setFromObject(o);
   assert.ok(!overlap(A,B),`${version} ${battery} ${variant}: ${a.name} hits ${o.name||o.parent.name+' part'} ${JSON.stringify([B.min,B.max].map(v=>v.toArray().map(n=>+n.toFixed(2))))}`);}
  for(const b of parts)if(b!==a&&!(a.name.startsWith('wiring-res')||a.name.startsWith('wiring-shrink'))&&!(b.name.startsWith('wiring-res')||b.name.startsWith('wiring-shrink')))
   assert.ok(!overlap(A,new THREE.Box3().setFromObject(b)),'JSTs do not overlap');
 }
 // ก้อนตะกั่วอยู่ที่ขาที่ต่อจริง: BAT+, BAT−, D5, D1, GND (+ 5V และ GND อีกเส้นในรุ่น 2) ไม่มีที่ D0
 const joints=[];d.root.traverse(o=>{if(o.name==='wiring-joint')joints.push(d.parts.board.worldToLocal(o.getWorldPosition(new THREE.Vector3())));});
 assert.equal(joints.length,version.startsWith('v2')?7:5,'solder joints count');
 const B=CONFIG.board,pinY=i=>d.p.boardY+(i-3)*B.pinPitch;
 assert.ok(!joints.some(j=>j.x<0&&Math.abs(j.y-pinY(0))<0.5&&Math.abs(j.x+B.width/2)<1),'nothing soldered to dead D0');
 assert.ok(joints.some(j=>j.x<0&&Math.abs(j.y-pinY(5))<0.01&&Math.abs(j.x+B.width/2)<1),'joint on D5');
 for(const name of ['BAT+','BAT-']){const pad=CONFIG.wiring.backPads.find(p=>p.name===name);
  assert.ok(Math.abs(pad.x)<B.width/2-2,'BAT pad is interior');
  assert.ok(joints.some(j=>Math.abs(j.x-pad.x)<.01&&Math.abs(j.y-d.p.boardY-pad.y)<.01),'joint on back '+name);
 }
 for(const [x,i] of [[-B.width/2,1],[B.width/2,1]])assert.ok(joints.some(j=>Math.abs(j.x-x)<.01&&Math.abs(j.y-pinY(i))<.01),'button on edge D1/GND');
 if(version.startsWith('v2'))for(const name of ['VUSB','GND']){const pad=CONFIG.wiring.backPads.find(p=>p.name===name);assert.ok(joints.some(j=>Math.abs(j.x-pad.x)<.01&&Math.abs(j.y-d.p.boardY-pad.y)<.01),'charge joint on back '+name);}
 // ตรวจผิวตะกั่วและรัศมีสายตลอดทางจริง ไม่ตรวจเฉพาะจุดควบคุม
 const low=B.baseZ+B.pcb/2,high=B.senseZ-B.senseThickness/2,toLocal=v=>d.parts.board.worldToLocal(v),inside=v=>Math.abs(v.x)<B.width/2-.05&&Math.abs(v.y-d.p.boardY)<B.height/2-.05;
 let gapSamples=0;
 d.root.traverse(o=>{
  if(o.name==='wiring-joint'){const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){const v=toLocal(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld));assert.ok(v.z>=low-1e-5&&v.z<=high+1e-5,'solder dome contained in gap');}}
  if(!o.userData.solderWire)return;
  const r=o.geometry.parameters.radius;
  for(const v of o.geometry.parameters.path.getSpacedPoints(1200)){
   toLocal(v.applyMatrix4(o.matrixWorld));if(!inside(v))continue;
   assert.ok(v.z-r>=low-1e-4||v.z+r<=low-B.pcb+1e-4,`${version}: wire crosses XIAO PCB at ${v.toArray()}`);
   assert.ok(v.z+r<=high+1e-4||v.z-r>=high+B.senseThickness-1e-4,`${version}: wire crosses Sense PCB at ${v.toArray()}`);
   if(v.z>=low&&v.z<=high){gapSamples++;assert.ok(v.z-r>=low-1e-4&&v.z+r<=high+1e-4,'full wire radius inside gap');}
  }
 });assert.ok(gapSamples>100,'wire paths actually enter gap');
 checked++;
}
const original=CONFIG.detail.b2b.matedHeight;CONFIG.detail.b2b.matedHeight=1.2;
assert.ok(wiringGapText().includes('เตือน: ช่องไม่พอ!')&&wiringGapText().includes('-0.46'),'undersized gap warns with deficit, never silently enlarges');CONFIG.detail.b2b.matedHeight=original;
console.log('PASS: '+checked+' assemblies (v1/legacy/v2 × battery × mount); original containment/collisions retained; back BAT+/BAT−, edge D5/D1/GND, v2 back VUSB/GND, no D0; solder domes and full wire radii within PCB gap; undersized-gap warning');

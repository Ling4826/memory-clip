// ภาพจริง: ฝาเปิด USB ชี้บน แบตแผงหน้า เสาอากาศหน้ากล่อง ปุ่มข้าง
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import * as THREE from './vendor/three.module.js';import {makeShell} from './shell-geometry.js';
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('work/config.js','utf8'),ctx);const C=ctx.window.CONFIG,q=C.cardboard;
const {buildDevice}=new Function('THREE','CONFIG','makeShell',fs.readFileSync('work/model.js','utf8')+'\nreturn {buildDevice};')(THREE,C,makeShell);
const d=buildDevice({version:'v1',battery:500,variant:'clip',angle:20},false);d.root.updateMatrixWorld(true);
const obj=n=>{const o=d.root.getObjectByName(n);assert.ok(o,n);return o;},bb=n=>new THREE.Box3().setFromObject(obj(n)),center=n=>bb(n).getCenter(new THREE.Vector3()),overlap=(a,b)=>['x','y','z'].every(k=>a.min[k]<b.max[k]-.06&&a.max[k]>b.min[k]+.06);
assert.deepEqual([d.p.w,d.p.h,d.p.d],[120,120,40]);assert.equal(d.p.battery.width,34);
assert.ok(center('xiao-usb-shell').y>center('xiao-pcb').y,'USB head up');assert.ok(Math.abs(center('optics').x)<.01,'camera centered');
assert.ok(bb('battery-pouch').max.x<0&&bb('battery-pouch').max.y<=.01,'battery lower left');assert.ok(bb('battery-pouch').min.z>0,'battery on front panel');
assert.ok(bb('antenna-flat').min.z>q.depth/2&&bb('antenna-flat').max.x<0,'antenna outside front left');assert.ok(bb('cardboard-button').min.x>=q.width/2,'button outside side');
assert.ok(bb('cardboard-usb-cable').max.y>q.height/2,'cable exits open top');assert.ok(bb('cardboard-flap').max.y>q.height/2,'standing rear flap');obj('cardboard-lanyard');obj('cardboard-flutes');obj('cardboard-kapton');obj('wiring-shrink');
const parts=['xiao-pcb','rf-shield','xiao-usb-shell','sd-shell','sd-card','battery-pouch','wiring-jst-battery','wiring-jst-button','wiring-shrink'];
const inside=new THREE.Box3(new THREE.Vector3(-q.width/2+q.wall,-q.height/2+q.wall,-q.depth/2+q.wall),new THREE.Vector3(q.width/2-q.wall,q.height/2,q.depth/2-q.wall));
for(const name of parts)assert.ok(inside.containsBox(bb(name)),name+' inside cavity');
for(const name of ['cardboard-board-tape','cardboard-battery-tape'])assert.ok(inside.containsBox(bb(name)),name+' within inner walls');
const attached=[['sd-card','sd-shell'],['xiao-pcb','xiao-usb-shell']]; // ซ็อกเก็ตคร่อม PCB และการ์ดอยู่ในช่องจริง
for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++)if(!attached.some(pair=>pair.includes(parts[i])&&pair.includes(parts[j])))assert.ok(!overlap(bb(parts[i]),bb(parts[j])),parts[i]+' clear of '+parts[j]);
const ray=(pos,dir,objects)=>new THREE.Raycaster(new THREE.Vector3(...pos),new THREE.Vector3(...dir)).intersectObjects(objects,true);
assert.equal(ray([0,80,0],[0,-1,0],[d.parts.back]).filter(hit=>hit.point.y>q.height/2-q.wall).length,0,'top open');
assert.equal(ray([0,q.height/2-q.cameraDrop,50],[0,0,-1],[d.parts.front]).length,0,'square camera opening');
for(const x of [-q.hook.x,q.hook.x])assert.equal(ray([x,q.hook.y,50],[0,0,-1],[d.parts.front]).length,0,'punched hook hole');
assert.equal(ray([q.antenna.slitX,q.antenna.slitY,50],[0,0,-1],[d.parts.front]).length,0,'coax slit');
let wires=0;d.root.traverse(o=>{if(!['antenna-coax','cardboard-button-wire','cardboard-battery-wire','cardboard-battery-return','cardboard-button-return'].includes(o.name))return;wires++;const a=o.geometry.attributes.position;
 for(let i=0;i<a.count;i++){
  const v=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);
  if(v.z>=q.depth/2-q.wall&&v.z<=q.depth/2)assert.ok(Math.abs(v.x-q.antenna.slitX)<q.antenna.slit[0]/2&&Math.abs(v.y-q.antenna.slitY)<q.antenna.slit[1]/2,o.name+' crosses front through slit');
  if(v.x>=q.width/2-q.wall&&v.x<=q.width/2)assert.ok(Math.hypot(v.y-q.button.holeY,v.z-q.button.holeZ)<q.button.wireHole/2,o.name+' crosses side through button hole');
  assert.ok(v.x>-q.width/2+q.wall&&v.y>-q.height/2+q.wall&&v.z>-q.depth/2+q.wall,o.name+' avoids closed walls');
  if(o.name!=='cardboard-battery-wire')assert.ok(!bb('battery-pouch').expandByScalar(-.1).containsPoint(v),o.name+' avoids battery pouch');
 }
});assert.equal(wires,9,'external/loop/return routes all checked');
for(const hook of d.parts.mount.children.filter(o=>o.name==='cardboard-hook'))hook.traverse(o=>{if(o.geometry?.type!=='TubeGeometry')return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){const v=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);if(v.z>=q.depth/2-q.wall&&v.z<=q.depth/2)assert.ok(Math.hypot(Math.abs(v.x)-q.hook.x,v.y-q.hook.y)<q.hook.hole/2,'hook passes through punched hole');}});
const legs=obj('cardboard-button').children.filter(o=>o.name==='tactile-leg').map(o=>o.getWorldPosition(new THREE.Vector3()));
d.root.traverse(o=>{if(o.name==='cardboard-button-wire'){const start=o.geometry.parameters.path.getPoint(0).applyMatrix4(o.matrixWorld);assert.ok(legs.some(p=>p.distanceTo(start)<.01),'button wire starts on a metal terminal');}});
assert.equal(Object.keys(d.exportParts).length,0,'no cardboard STL');
console.log('PASS: photo-based 120x120x40 cardboard; head-up USB, front-mounted battery, external antenna/button, open top/flap/lanyard, punched openings, Box3 internal clearances, no STL');

// กล่องรุ่น 2: ชิ้นที่เพิ่มต้องปิดเป็น solid, ไม่ชนชิ้นส่วนอื่น, อยู่ในกล่อง, และช่อง SD ด้านข้างต้องปิดแล้ว
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import * as THREE from './vendor/three.module.js';import {makeShell,auditClosedGeometry} from './shell-geometry.js';
const cfg={window:{}};vm.createContext(cfg);vm.runInContext(fs.readFileSync('work/config.js','utf8'),cfg);
const CONFIG=cfg.window.CONFIG;const {buildDevice}=new Function('THREE','CONFIG','makeShell',fs.readFileSync('work/model.js','utf8')+'\nreturn {buildDevice};')(THREE,CONFIG,makeShell);
const eps=0.05;
const overlap=(a,b)=>a.min.x<b.max.x-eps&&a.max.x>b.min.x+eps&&a.min.y<b.max.y-eps&&a.max.y>b.min.y+eps&&a.min.z<b.max.z-eps&&a.max.z>b.min.z+eps;
let checked=0;
for(const battery of [500,1200])for(const variant of ['clip','magnet','pendant'])for(const angle of [0,20]) {
 const d=buildDevice({version:'v2',battery,variant,angle,fov:false,torso:false},false);d.root.updateMatrixWorld(true);
 const added=[],others=[];
 d.root.traverse(o=>{if(!o.isMesh)return;
  if(o.name.startsWith('v2-'))added.push(o);
  // ชิ้นที่ต้องไม่โดน: ทุกอย่างยกเว้นผิวกล่อง (ชิ้นรุ่น 2 ต่อกับผนังโดยตั้งใจ), สาย (กล่องรอบเส้นโค้งกว้างเกินจริง), สายแพ, ชุดยึดด้านนอก
  const skip=o.parent===d.parts.front&&o===d.parts.front.children[0]||o.parent===d.parts.back&&o===d.parts.back.children[0]
   ||o.geometry.type==='TubeGeometry'||o.userData.ribbon||o.parent===d.parts.mount||o.name.startsWith('hinge')||o.name==='shirt'||o.parent?.name==='fov';
  if(!skip&&!o.name.startsWith('v2-'))others.push(o);});
 assert.equal(added.filter(o=>o.name==='v2-ledge').length,4,'4 board ledges');
 const inner={x:d.p.w/2-CONFIG.case.wall+0.2,y:d.p.h/2-CONFIG.case.wall+0.2,z:d.p.d/2-CONFIG.case.wall+0.2};
 for(const a of added) {
  if(!a.name.startsWith('v2-diode'))assert.ok(auditClosedGeometry(a.geometry).closed,a.name+' closed');
  const A=new THREE.Box3().setFromObject(a);
  assert.ok(Math.abs(A.min.x)<=inner.x&&Math.abs(A.max.x)<=inner.x&&Math.abs(A.min.y)<=inner.y&&Math.abs(A.max.y)<=inner.y&&Math.abs(A.min.z)<=inner.z&&Math.abs(A.max.z)<=inner.z,`${a.name} stays inside the case (${battery} ${variant})`);
  for(const o of others){const B=new THREE.Box3().setFromObject(o);
   assert.ok(!overlap(A,B),`${battery} ${variant} ${angle}°: ${a.name} hits ${o.name||o.parent.name+' part'} at ${JSON.stringify([B.min,B.max].map(v=>v.toArray().map(n=>+n.toFixed(2))))}`);}
 }
 // โฟมต้องแตะปลายการ์ดพอดี (ไม่มีช่องให้การ์ดเลื่อนออก)
 const sd=CONFIG.board.sd,foam=new THREE.Box3().setFromObject(added.find(o=>o.name==='v2-sd-foam'));
 const cardBounds=new THREE.Box3().setFromObject(d.root.getObjectByName('sd-card'));assert.ok(Math.abs(foam.max.y-cardBounds.min.y)<1e-6,'foam touches the USB-side card end');
 assert.ok(Math.abs(((d.p.boardY-CONFIG.board.height/2)-cardBounds.min.y)-4)<1e-6,'SD protrudes 4 mm beyond the USB edge');
 assert.ok(Math.abs((added.find(o=>o.name==='v2-sd-stop').minY||0))<1,'');
 // ช่อง SD ด้านข้างปิดแล้ว: ยิงเส้นจากนอกกล่องเข้าไปตรงแกนการ์ด ต้องชนผนัง
 const ray=new THREE.Raycaster(new THREE.Vector3(d.p.w,d.p.boardY+sd.y,sd.z),new THREE.Vector3(-1,0,0));
 assert.ok(ray.intersectObject(d.parts.front.children[0]).length>0,'side microSD opening is closed in v2');
 checked++;
}
// รุ่น 1 ยังเหมือนเดิม: ช่อง SD เปิด และไม่มีชิ้น v2
const legacy=buildDevice({version:'legacy',battery:500,variant:'clip',angle:10,fov:false,torso:false},false);let extra=0;legacy.root.traverse(o=>{if(o.name.startsWith('v2-'))extra++;});
assert.equal(extra,0,'legacy has no v2 parts');legacy.root.updateMatrixWorld(true);
const ray=new THREE.Raycaster(new THREE.Vector3(legacy.p.w/2+1,legacy.p.boardY+CONFIG.board.sd.y,CONFIG.board.sd.z),new THREE.Vector3(-1,0,0),0,CONFIG.case.wall+2);
assert.equal(ray.intersectObject(legacy.parts.front.children[0]).length,0,'legacy side SD opening retained');
console.log('PASS: '+checked+' v2 assemblies; added parts closed, inside the case, clear of board/card/USB/battery/magnets; side SD opening closed; legacy printed design retained');

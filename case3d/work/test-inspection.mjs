// ตรวจระยะที่อ่านจาก geometry จริง
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import * as THREE from './vendor/three.module.js';import {makeShell} from './shell-geometry.js';
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('work/config.js','utf8'),ctx);const C=ctx.window.CONFIG;
const {buildDevice,computeMeasurements,partsList}=new Function('THREE','CONFIG','makeShell',fs.readFileSync('work/model.js','utf8')+'\nreturn {buildDevice,computeMeasurements,partsList};')(THREE,C,makeShell);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} = ${b}`);let checked=0;
for(const version of ['v1','v2','v2p','legacy'])for(const battery of [500,1200])for(const variant of ['clip','magnet','pendant']){
 const d=buildDevice({version,battery,variant,angle:10},false),measures=computeMeasurements(d);
 assert.equal(measures.length,version.startsWith('v2')?7:4);for(const m of measures){near(new THREE.Vector3(...m.a).distanceTo(new THREE.Vector3(...m.b)),m.value);assert.ok(m.value>0,m.id);}
 near(measures.find(m=>m.id==='width').value,d.p.w);near(measures.find(m=>m.id==='height').value,d.p.h);near(measures.find(m=>m.id==='depth').value,d.p.d);
 if(version.startsWith('v2')){
  const byId=id=>computeMeasurements(d).find(m=>m.id===id).value,board=d.root.getObjectByName('xiao-pcb'),card=d.root.getObjectByName('sd-card'),bat=d.root.getObjectByName('battery-pouch');
  for(const [obj,id,axis,delta] of [[board,'board-wall','x',.2],[card,'card-stop','y',-.2],[bat,'battery-wall','x',.2]]){const before=byId(id);obj.position[axis]+=delta;near(byId(id),before-.2);obj.position[axis]-=delta;}
 }
 const rows=partsList({version,battery,variant},d.p);assert.ok(rows.length>=7);assert.ok(rows.some(r=>r.includes(String(C.board.width))));checked++;
}
console.log('PASS: 18 inspection assemblies; computed dimension endpoints and live clearances, CONFIG parts lists');

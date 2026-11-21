import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import * as THREE from './vendor/three.module.js';import {makeShell} from './shell-geometry.js';
const cfg={window:{}};vm.createContext(cfg);vm.runInContext(fs.readFileSync('work/config.js','utf8'),cfg);
const CONFIG=cfg.window.CONFIG;const {buildDevice}=new Function('THREE','CONFIG','makeShell',fs.readFileSync('work/model.js','utf8')+'\nreturn {buildDevice};')(THREE,CONFIG,makeShell);
const solids=(g)=>{const out=[];g.traverse(o=>{if(o.isMesh&&o.geometry.type!=='TubeGeometry'&&!o.userData.ribbon)out.push(o);});return out;};
const bbox=(o)=>new THREE.Box3().setFromObject(o);
for(const battery of [500,1200]) {
 const d=buildDevice({battery,variant:'magnet',angle:10,fov:false,torso:false},false);d.root.updateMatrixWorld(true);
 const magnets=solids(d.parts.hardware).filter(o=>{const s=bbox(o).getSize(new THREE.Vector3());return Math.abs(s.x-CONFIG.magnet.diameter)<0.1&&Math.abs(s.z-CONFIG.magnet.depth)<0.1;});
 assert.equal(magnets.length,4,'four magnets present');
 const inner=magnets.filter(o=>bbox(o).min.z>=-d.p.d/2);
 assert.equal(inner.length,2,'two magnets inside the case');
 for(const m of inner) {
  const mb=bbox(m);
  for(const group of [d.parts.board,d.parts.battery,d.parts.details]) for(const o of solids(group)) {
   const ob=bbox(o);
   assert.ok(!mb.intersectsBox(ob),`battery ${battery}: magnet ${JSON.stringify(mb.min)}-${JSON.stringify(mb.max)} collides with ${group.name} part ${o.geometry.type} ${JSON.stringify(ob.min)}-${JSON.stringify(ob.max)}`);
  }
  const half=d.p.w/2-CONFIG.case.wall;
  assert.ok(mb.max.x+CONFIG.case.wall<=half&&mb.min.x-CONFIG.case.wall>=-half,'pocket wall stays inside case width');
  assert.ok(mb.max.y<d.p.h/2-CONFIG.case.wall&&mb.min.y>-d.p.h/2+CONFIG.case.wall,'magnet inside case height');
 }
}
console.log('PASS: inner magnets clear of board, battery and USB parts for both battery sizes');

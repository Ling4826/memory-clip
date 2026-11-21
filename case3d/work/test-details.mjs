// ตรวจรูปทรงจริงและช่องว่างของรายละเอียดใหม่
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import * as THREE from './vendor/three.module.js';import {makeShell,auditClosedGeometry} from './shell-geometry.js';
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('work/config.js','utf8'),ctx);const C=ctx.window.CONFIG;
const {buildDevice}=new Function('THREE','CONFIG','makeShell',fs.readFileSync('work/model.js','utf8')+'\nreturn {buildDevice};')(THREE,C,makeShell);
const bounds=o=>new THREE.Box3().setFromObject(o),overlap=(a,b)=>['x','y','z'].every(k=>a.min[k]<b.max[k]-.05&&a.max[k]>b.min[k]+.05);
let checked=0,maxTriangles=0,maxMeshes=0;
for(const version of ['v1','v2','v2p','legacy'])for(const battery of [500,1200])for(const variant of ['clip','magnet','pendant']){
 const d=buildDevice({version,battery,variant,angle:20,fov:false,torso:false},false);d.root.updateMatrixWorld(true);
 const find=n=>{const o=d.root.getObjectByName(n);assert.ok(o,n+' exists');return o;};
 const pcb=find('xiao-pcb'),sd=find('sd-card'),socket=find('sd-shell'),b2b=find('b2b'),ufl=find('ufl'),fpc=find('camera-fpc'),protection=find('battery-protection');
 const count=n=>{let total=0;d.root.traverse(o=>{if(o.name===n)total++;});return total;};
 assert.equal(count('lens-thread'),C.detail.lensRings);assert.equal(count('sd-contact'),8);assert.equal(count('tactile-leg'),4);assert.equal(count('jst-pin'),4);find('ufl-plug');
 for(const name of ['wiring-jst-battery','wiring-jst-button']){const j=find(name);assert.ok(j.isGroup,'JST housing has separate walls/pins');j.traverse(o=>{if(o.isMesh)assert.ok(auditClosedGeometry(o.geometry).closed,'JST wall/pin solid');});const ray=new THREE.Raycaster(j.localToWorld(new THREE.Vector3(0,0,5)),new THREE.Vector3(0,0,-1).transformDirection(j.matrixWorld));assert.equal(ray.intersectObjects(j.children.filter(o=>o.name!=='jst-latch'),true).length,0,'JST mating seam exposes cavity');}
 assert.ok(auditClosedGeometry(pcb.geometry).closed,'castellated PCB closed');
 const boardRay=(pos,dir)=>new THREE.Raycaster(d.parts.board.localToWorld(new THREE.Vector3(...pos)),new THREE.Vector3(...dir).transformDirection(d.parts.board.matrixWorld));
 const hole=boardRay([C.board.width/2-.15,d.p.boardY,5],[0,0,-1]);
 assert.equal(hole.intersectObject(pcb).length,0,'castellated half-hole is cut through PCB');
 const plain=boardRay([C.board.width/2-.15,d.p.boardY+1.27,5],[0,0,-1]);assert.ok(plain.intersectObject(pcb).length,'PCB remains between half-holes');
 assert.ok(!overlap(bounds(sd),bounds(b2b)),'B2B clear of card');
 assert.ok(!overlap(bounds(fpc),bounds(socket)),'FPC clear of socket');
 assert.ok(!overlap(bounds(find('rf-shield')),bounds(find('xiao-usb-shell'))),'RF shield clear of USB receptacle');
 assert.ok(!overlap(bounds(find('rf-shield')),bounds(ufl)),'U.FL clear of RF shield');
 const usb=find('xiao-usb-shell');assert.equal(boardRay([0,d.p.boardY-C.board.height/2-1,C.board.baseZ-C.board.usb[2]/2],[0,1,0]).intersectObject(usb).length,0,'USB receptacle has open mouth');
 assert.equal(boardRay([C.board.sd.x-C.board.sd.card[1]/2+.1,d.p.boardY+C.board.sd.y+C.board.sd.card[0]/2-.1,C.board.sd.z+C.board.sd.depth/2+2],[0,0,-1]).intersectObject(sd).length,0,'microSD notch cut through card');
 const wiring=[];d.root.traverse(o=>{if(['wiring-jst-battery','wiring-jst-button','wiring-shrink'].includes(o.name))wiring.push(o);});
 for(const a of [b2b,ufl,fpc,protection])for(const b of wiring)assert.ok(!overlap(bounds(a),bounds(b)),a.name+' clears '+b.name);
 // ตรวจท่อสายเป็นชิ้นย่อย แทนกล่องครอบเส้นโค้งทั้งหมด
 const obstacles=[b2b,fpc,socket];d.root.traverse(o=>{if(o.geometry?.type!=='TubeGeometry'||o.parent?.name==='fov')return;const a=o.geometry.attributes.position;
  for(let i=0;i<a.count;i++){const v=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);for(const obstacle of obstacles){const b=bounds(obstacle).expandByScalar(-.08);assert.ok(!b.containsPoint(v),(o.name||'wire')+' avoids '+obstacle.name);}}
 });
 assert.ok(sd.userData.sense&&socket.userData.sense&&fpc.userData.sense&&b2b.userData.sense,'Sense parts removable for solder view');
 const coax=find('antenna-coax'),verts=coax.geometry.attributes.position;
 for(let i=0;i<verts.count;i++){
  const v=new THREE.Vector3().fromBufferAttribute(verts,i).applyMatrix4(coax.matrixWorld);
  if(version==='v1'){
   const a=C.cardboard.antenna;if(v.z>=d.p.d/2-C.cardboard.wall&&v.z<=d.p.d/2)assert.ok(Math.abs(v.x-a.slitX)<=a.slit[0]/2&&Math.abs(v.y-a.slitY)<=a.slit[1]/2,'coax passes through front slit');
  }else{
   assert.ok(Math.abs(v.x)<=d.p.w/2-C.case.wall+.01&&Math.abs(v.y)<=d.p.h/2-C.case.wall+.01&&Math.abs(v.z)<=d.p.d/2-C.case.wall+.01,'coax stays in printed cavity');
   for(const boss of d.p.screws)assert.ok(Math.hypot(v.x-boss.x,v.y-boss.y)>C.case.bossDiameter/2,'coax avoids screw bosses');
   for(const o of wiring)assert.ok(!bounds(o).expandByScalar(-.03).containsPoint(v),'coax clears '+o.name);
   d.root.traverse(o=>{if(o.isMesh&&/^v2-(ledge|lip|usb)/.test(o.name))assert.ok(!bounds(o).expandByScalar(-.03).containsPoint(v),'coax clears '+o.name);});
   if(variant==='magnet')for(const sign of [-1,1])assert.ok(!(v.z<-d.p.d/2+C.case.wall+C.magnet.depth&&v.z>-d.p.d/2+C.case.wall&&Math.hypot(v.x-sign*C.magnet.separation/2,v.y-d.p.boardY-C.magnet.y)<C.magnet.diameter/2),'coax clears inner magnets');
   assert.ok(!bounds(protection).containsPoint(v),'coax clears battery protection');
   assert.ok(!(Math.abs(v.x)<d.p.battery.width/2&&Math.abs(v.y-d.p.batteryY)<d.p.battery.height/2&&Math.abs(v.z-d.p.batteryZ)<d.p.battery.depth/2),'coax clears battery pouch');
  }
 }
 if(version==='v1'){
  assert.equal(Object.values(d.exportParts).filter(Boolean).length,0,'cardboard never exports STL');
  assert.equal(d.p.battery.width,34,'cardboard uses real 603450 even with old battery selection');
  assert.equal(d.parts.mount.children.filter(o=>o.name==='cardboard-hook').length,2,'two side hooks');
  assert.ok(bounds(find('antenna-flat')).min.z>d.p.d/2&&bounds(find('antenna-flat')).max.x<0,'flat antenna outside front left');
  assert.ok(bounds(find('cardboard-usb-cable')).max.y>d.p.h/2,'USB cable leaves top');
  const ray=new THREE.Raycaster(new THREE.Vector3(0,d.p.h/2-C.cardboard.cameraDrop,40),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObject(d.parts.front,true).length,0,'cardboard camera hole open');
  assert.ok(!d.root.getObjectByName('charge-breakout'),'no planned breakout in real cardboard');
 }else{
  for(const part of Object.values(d.exportParts))if(part)part.traverse(o=>{if(o.isMesh)assert.ok(auditClosedGeometry(o.geometry).closed,o.name+' export closed');});
 }
 let triangles=0,meshes=0;d.root.traverse(o=>{if(o.isMesh){meshes++;const g=o.geometry;assert.ok(g.attributes.position.array.every(Number.isFinite));triangles+=(g.index?.count??g.attributes.position.count)/3;}});
 maxTriangles=Math.max(maxTriangles,triangles);maxMeshes=Math.max(maxMeshes,meshes);assert.ok(triangles<180000&&meshes<450,'phone geometry budget');checked++;
}
console.log('PASS: '+checked+' detailed assemblies; castellations, connectors, wiring clearance, cardboard openings/hooks/external antenna; no cardboard STL; printed solids closed');
console.log('PASS: geometry budget < 180000 triangles / 450 meshes (max '+maxTriangles+' triangles / '+maxMeshes+' meshes)');

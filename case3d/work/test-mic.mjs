// รูไมค์บนฝาหน้าต้องตรงกับ acoustic port และโครงสร้างรอบรูพิมพ์ได้
import assert from 'node:assert/strict';
import {Vector3,Box3,Raycaster} from './vendor/three.module.js';
import {CONFIG,buildDevice} from './print-model.mjs';

const C=CONFIG,d=buildDevice({version:'v2',battery:1200,variant:'pendant',angle:CONFIG.camera.pendantTilt,fov:false,torso:false},false);
d.root.updateMatrixWorld(true);
const port={x:C.board.mic.x,y:d.p.micY},holes=d.parts.front.userData.microphonePorts;
assert.equal(holes.length,1,'one top-face port preserves edge clearance');
const nearest=Math.min(...holes.map(h=>Math.hypot(h.x-port.x,h.y-port.y)));
assert.ok(nearest<=1.5,'XY distance from MEMS acoustic port to nearest front opening <=1.5 mm: '+nearest);
const frontShell=d.parts.front.children.find(o=>o.name==='front-shell'),duct=d.parts.front.getObjectByName('microphone-duct');
assert.ok(duct,'front microphone duct included');
assert.ok(duct.userData.minWall>=1.2,'duct minimum wall >=1.2 mm');
assert.equal(holes[0].x,port.x);assert.equal(holes[0].y,port.y,'opening and duct centered on acoustic port');
// The acoustic opening remains clear through the modeled front shell.
const ray=new Raycaster(new Vector3(port.x,port.y,d.p.d/2+1),new Vector3(0,0,-1),0,3);
assert.equal(ray.intersectObject(frontShell).length,0,'front shell is open at acoustic port');
// The duct stays away from the rounded side walls and M2 screw/boss positions.
const b=new Box3().setFromObject(duct),left=-d.p.w/2+C.case.wall,right=d.p.w/2-C.case.wall;
assert.ok(b.min.x>left&&b.max.x<right,'duct clears side walls');
for(const screw of d.p.screws){
 const dx=Math.max(Math.abs(screw.x-port.x)-C.microphone.ductWidth/2,0);
 const dy=Math.max(Math.abs(screw.y-port.y)-C.microphone.ductHeight/2,0);
 assert.ok(Math.hypot(dx,dy)>C.case.bossDiameter/2,'duct clears M2 boss');
}
console.log('PASS: microphone opening offset '+nearest.toFixed(3)+' mm XY; duct wall '+duct.userData.minWall.toFixed(2)+' mm; clears shell walls and screw bosses');

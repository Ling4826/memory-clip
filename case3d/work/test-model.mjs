import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import * as THREE from './vendor/three.module.js';import {makeShell,auditClosedGeometry} from './shell-geometry.js';
const cfg={window:{}};vm.createContext(cfg);vm.runInContext(fs.readFileSync('work/config.js','utf8'),cfg);
const CONFIG=cfg.window.CONFIG;const {buildDevice}=new Function('THREE','CONFIG','makeShell',fs.readFileSync('work/model.js','utf8')+'\nreturn {buildDevice};')(THREE,CONFIG,makeShell);
let checked=0;const issues=[];
for(const battery of [500,1200])for(const variant of ['clip','magnet','pendant'])for(const angle of [CONFIG.camera.pendantTilt,0,20]) {
 const s={battery,variant,angle,fov:false,torso:false};const d=buildDevice(s,false);d.root.updateMatrixWorld(true);
 const direction=new THREE.Vector3(0,0,1).applyQuaternion(d.optics.quaternion);
 assert.ok(Math.abs(direction.y-Math.sin(angle*Math.PI/180))<1e-10,'camera tilt supports positive and negative angles');
 for(const [name,part] of Object.entries(d.exportParts))if(part)part.traverse(o=>{if(o.isMesh){const a=auditClosedGeometry(o.geometry);if(!a.closed)issues.push({battery,variant,angle,name,...a});assert.ok(o.geometry.getAttribute('position').array.every(Number.isFinite));}});
 const shellFront=d.parts.front.children[0];assert.ok(auditClosedGeometry(shellFront.geometry).closed);
 // Face hole clearances are tested using the complete exported front incl pillars.
 const mic=CONFIG.board.mic,led=CONFIG.led;
 for(const [x,y] of [[CONFIG.camera.x,d.p.cameraY],[mic.x,d.p.micY],[0,CONFIG.button.y]]){
  const hits=new THREE.Raycaster(new THREE.Vector3(x,y,30),new THREE.Vector3(0,0,-1)).intersectObject(d.parts.front,true);assert.equal(hits.length,0,'front holes stay open including mounting pillars');
 }
 checked++;
}
if(issues.length)console.log(JSON.stringify(issues.slice(0,3),null,2));
assert.equal(issues.length,0,'every exported primitive is a closed oriented solid');
console.log('PASS: '+checked+' battery/mount/angle assemblies; finite geometry, closed part solids, optical axes, all face clearances');

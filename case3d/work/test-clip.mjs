import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import {makeShell,auditClosedGeometry} from './shell-geometry.js';
const ctx={THREE,window:{},makeShell}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('work/config.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('work/model.js','utf8')+'\nthis.build=buildDevice;',ctx);
const C=ctx.window.CONFIG;
for(const battery of [500,1200]) {
  const model=ctx.build({battery,variant:'clip',angle:10,fov:false,torso:false},false);
  model.root.updateMatrixWorld(true);
  for(const g of [model.parts.back,model.parts.mount]) g.traverse(o=>{if(o.material) o.material.side=THREE.DoubleSide;});
  const q=C.clip, p=model.p, hy=Math.min(q.hingeY,p.h/2-q.hingeOuter), hz=-p.d/2-q.hingeOuter/2;
  for(const direction of [-1,1]) for(const rho of [0,q.pinDiameter*0.35]) for(let k=0;k<8;k++) {
    const a=k*Math.PI/4;
    const ray=new THREE.Raycaster(new THREE.Vector3(-direction*p.w,hy+rho*Math.cos(a),hz+rho*Math.sin(a)),new THREE.Vector3(direction,0,0));
    const hits=ray.intersectObjects([model.parts.back,model.parts.mount],true);
    assert.equal(hits.length,0,`battery ${battery}, bore ray angle ${a}, radius ${rho}: ${hits.length} obstructing faces`);
  }
  const control=new THREE.Raycaster(new THREE.Vector3(-p.w,hy+q.hingeOuter*0.4,hz),new THREE.Vector3(1,0,0));
  assert.ok(control.intersectObjects([model.parts.back,model.parts.mount],true).length>0,'positive control hits solid hinge wall');
  const coil=model.parts.hardware.children.at(-1), coilBox=new THREE.Box3().setFromObject(coil);
  // The complete coil's bounding box is separate from every clip or rear part.
  for(const g of [model.parts.back,model.parts.mount]) for(const o of g.children) {
    if(!o.isMesh) continue;
    assert.equal(coilBox.intersectsBox(new THREE.Box3().setFromObject(o)),false,`spring overlaps ${o.name||o.geometry.type}`);
  }
  for(const o of [...model.parts.back.children,...model.parts.mount.children].filter(o=>o.name.startsWith('hinge-')))
    assert.ok(auditClosedGeometry(o.geometry).closed,`${o.name} extrusion is closed`);
}
console.log('PASS: both battery layouts; 64 axial bore rays, positive wall controls, spring clearance, closed hinge extrusions');

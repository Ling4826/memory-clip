import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import {makeShell,auditClosedGeometry} from './shell-geometry.js';

let tested=0;
for(const [w,h,d] of [[36,75,23],[45,90,23],[60,110,26]]) {
  for(const front of [true,false]) {
    for(const openings of [false,true]) {
      const p={w,h,d,wall:1.5,radius:5,front,
        holes:front?[{x:-3,y:13,r:5.8},{x:8,y:15,r:1.75},{x:0,y:0,r:5.225},
          {x:-5.5,y:-8,r:0.75},{x:-3.1,y:-8,r:0.75},{x:-7.9,y:-8,r:0.75}]:[],
        screws:[-1,1].flatMap(x=>[-1,1].map(y=>({x:x*(w/2-4),y:y*(h/2-4),r:1.1}))),
        bottomPort:openings?{w:10,h:4,z:0}:null,
        sidePort:openings&&front?{w:14,h:3.5,y:11,z:4}:null};
      const g=makeShell(THREE,p), result=auditClosedGeometry(g);
      assert.equal(result.closed,true,JSON.stringify({p,result}));
      assert.ok(result.volumeMm3>0,'outward winding / positive signed volume');
      const b=g.boundingBox;
      assert.equal(b.max.x-b.min.x,w);
      assert.equal(b.max.y-b.min.y,h);
      assert.equal(b.max.z-b.min.z,d/2);
      const testMesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
      const throughFace=new THREE.Raycaster(new THREE.Vector3(front?-3:p.screws[0].x,front?13:p.screws[0].y,front?d:-d),new THREE.Vector3(0,0,front?-1:1));
      assert.equal(throughFace.intersectObject(testMesh).length,0,'face opening is a physical through-hole');
      testMesh.material.dispose();
      // The horizontal ray crosses both skins unless it passes through the
      // bottom USB port. The same check exercises actual geometry, not metadata.
      if(openings) {
        const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
        const ray=new THREE.Raycaster(new THREE.Vector3(0,-h,front?1:-1),new THREE.Vector3(0,1,0));
        const hit=ray.intersectObject(mesh);
        assert.ok(hit.length>=2,'ray eventually reaches the opposite wall');
        assert.ok(hit[0].point.y>0,'USB opening has no wall across it');
        const solidRay=new THREE.Raycaster(new THREE.Vector3(8,-h,front?1:-1),new THREE.Vector3(0,1,0));
        assert.ok(solidRay.intersectObject(mesh)[0].point.y<0,'neighboring bottom wall is solid');
        if(front) {
          const sideRay=new THREE.Raycaster(new THREE.Vector3(w,11,4),new THREE.Vector3(-1,0,0));
          assert.ok(sideRay.intersectObject(mesh)[0].point.x<0,'microSD opening has no wall across it');
        }
        mesh.material.dispose();
      }
      g.dispose(); tested++;
    }
  }
}
console.log(`PASS: ${tested} shell combinations; closed oriented edges, positive volume, exact dimensions, USB and microSD ray clearance`);

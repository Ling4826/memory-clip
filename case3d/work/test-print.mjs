// อ่าน STL จริง แล้วเทียบทุกสามเหลี่ยมกับชิ้นพิมพ์จากโมเดล
import fs from 'node:fs';import assert from 'node:assert/strict';import * as THREE from './vendor/three.module.js';
import path from 'node:path';import {execFileSync} from 'node:child_process';
import {auditClosedGeometry} from './shell-geometry.js';
assert.ok(fs.existsSync('print/v2/manifest.json'),'print package must be exported');
const {makePrintParts,readSTL,inspectSTL,validatePart,CONFIG,buildDevice}=await import('./print-model.mjs');
const manifest=JSON.parse(fs.readFileSync('print/v2/manifest.json','utf8')),expected=makePrintParts();
const fovHalf=THREE.MathUtils.degToRad(CONFIG.camera.fov/2),cameraTilt=THREE.MathUtils.degToRad(Math.abs(CONFIG.camera.pendantTilt)),face=2.2;
const fovEnvelope=CONFIG.camera.lensDiameter/2+face*Math.tan(fovHalf)+face*Math.tan(cameraTilt);
assert.ok(CONFIG.camera.apertureDiameter/2>=fovEnvelope,'front aperture clears the tilted lens FOV at both faces');
assert.equal(manifest.parts.length,4,'pendant print set: front, back, button cap and coupon');
assert.equal(manifest.variant,'pendant');assert.equal(manifest.battery,1200);
assert.deepEqual(manifest.config,CONFIG,'export must match current CONFIG');
assert.equal(CONFIG.case.wall>=1.2,true,'shell skin >=1.2 mm');
assert.ok((CONFIG.case.bossDiameter-CONFIG.case.screwHole)/2>=1.2,'front boss radial wall >=1.2 mm');
assert.ok((CONFIG.case.bossDiameter-CONFIG.case.bossPilot)/2>=1.2,'rear boss radial wall >=1.2 mm');
assert.ok(CONFIG.case.wall*Math.cos(Math.PI/24)>=1.2,'12-segment rounded corner normal wall >=1.2 mm');
const layout=buildDevice({version:'v2',battery:1200,variant:'pendant',angle:CONFIG.camera.pendantTilt,fov:false},false).p;
for(const part of expected){
 const data=fs.readFileSync('print/v2/'+part.file),entry=manifest.parts.find(p=>p.file===part.file);
 assert.ok(entry,part.file+' listed');const metrics=validatePart(data,part);
 assert.deepEqual(entry.metrics,metrics,'recorded metrics match disk');
 const meshes=part.object.children;
 if(part.kind==='front'){
  assert.equal(meshes.filter(o=>o.name==='v2-sd-stop').length,1,'SD stop included');
  assert.equal(meshes.filter(o=>o.name==='microphone-duct').length,1,'microphone duct included');
  assert.ok(meshes.find(o=>o.name==='microphone-duct').userData.minWall>=1.2,'microphone duct wall >=1.2 mm');
 }
 if(part.kind==='back') {
  for(const [name,n] of Object.entries({'v2-ledge':4,'v2-ledge-lip':4,'v2-cradle-base':1,'v2-cradle-side':2,'v2-cradle-stop':0}))assert.equal(meshes.filter(o=>o.name===name).length,n,name+' count for pendant (no rear wall)');
  assert.equal(meshes.filter(o=>o.name==='pendant-lanyard-eyelet').length,0,'projecting eyelets removed');
  const lug=CONFIG.pendant.lug,c=CONFIG.measured.cord,tab=meshes.find(o=>o.name==='pendant-lanyard-tab');
  assert.ok(tab,'rear lanyard tab included');
  assert.ok(lug.barWidth>=1.6&&lug.barWidth<=c.hookGate-0.8,'hook bar width fits gate');
  assert.ok(Math.min(...lug.slot)>=c.hookWire+1.3,'narrowest hook slot clears wire');
  assert.ok((layout.w/2-(lug.slotX+lug.slot[0]/2))>=1.6,'slot side wall >=1.6 mm');
  assert.ok(lug.barDepth<=5,'hook bar z thickness <=5 mm');
  assert.ok(lug.barRecess>=0.8,'bar edge recessed >=0.8 mm');
  assert.ok(lug.topRadius>=3,'tab top corner rounds down >=3 mm along the side (drop FE: R1 was too sharp)');
  assert.deepEqual(tab.userData.slot,lug.slot);assert.equal(tab.userData.barWidth,lug.barWidth);
  assert.equal(tab.userData.barDepth,lug.barDepth);assert.equal(tab.userData.barRecess,lug.barRecess);
  assert.ok(auditClosedGeometry(tab.geometry).closed,'lanyard tab is closed');
  assert.equal(tab.userData.depth,layout.d/2,'tab spans the rear cover depth to the split plane');
  const bars=meshes.filter(o=>o.name==='pendant-lanyard-bar');assert.equal(bars.length,2,'two recessed hook bars');
  for(const bar of bars){assert.ok(auditClosedGeometry(bar.geometry).closed,'hook bar is closed');assert.equal(bar.userData.width,lug.slot[0]+2,'bar overhangs slot by 1 mm at each end');assert.equal(bar.userData.barWidth,lug.barWidth);assert.equal(bar.userData.barDepth,lug.barDepth);
   bar.geometry.computeBoundingBox();const bb=bar.geometry.boundingBox;assert.ok(Math.abs(bb.min.y-bar.userData.slotTop)<1e-6&&Math.abs(bb.max.y-(bar.userData.tabTop-lug.barRecess))<1e-6,'bar is recessed from outer edge by CONFIG.barRecess');assert.ok(Math.abs(bb.max.z-bb.min.z-lug.barDepth)<1e-6,'physical bar thickness follows CONFIG.barDepth');
  }
  assert.equal(tab.userData.slotY,layout.h/2+lug.tabLength-lug.barRecess-lug.barWidth-lug.slot[1]/2,'slot position leaves configured bar above');
  {const asm=buildDevice({version:'v2',battery:1200,variant:'pendant',angle:CONFIG.camera.pendantTilt,fov:false},false);asm.root.updateMatrixWorld(true);const lugTab=asm.parts.back.children.find(o=>o.name==='pendant-lanyard-tab');
   for(const x of [-lug.slotX,lug.slotX])for(const dy of [-lug.slot[1]/2+0.25,0,lug.slot[1]/2-0.25]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,tab.userData.slotY+dy,-layout.d/2-0.1),new THREE.Vector3(0,0,1));
    assert.equal(ray.intersectObject(lugTab).length,0,'slot is open through z at x='+x+', y offset='+dy);
   }
   for(const x of [-lug.slotX+lug.slot[0]/2+0.1,lug.slotX+lug.slot[0]/2+0.1]){const ray=new THREE.Raycaster(new THREE.Vector3(x,tab.userData.slotY,-layout.d/2-0.1),new THREE.Vector3(0,0,1));assert.ok(ray.intersectObject(lugTab).length>0,'slot sidewall remains immediately outside the configured opening');}
  }
  {const rp=CONFIG.v2.rearPad;assert.deepEqual(meshes[0].geometry.userData.faceRecesses.map(({width,height,depth})=>[width,height,depth]),rp.depth>0?[[rp.width,rp.height,rp.depth]]:[],'rear anti-slip recess follows CONFIG.v2.rearPad (depth 0 = flat back)');}
 }
 if(part.kind==='front'||part.kind==='back'){
  const {geometry,solids}=inspectSTL(data,part),positions=geometry.attributes.position.array.slice(0,solids[0].triangles*9),shell=new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)),new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),sign=part.kind==='front'?1:-1;
  shell.updateMatrixWorld(true);
  // ยิงทะลุหน้าราบและผนังข้างบน STL ที่อ่านกลับ ไม่อ้างเพียงค่าที่ระบุ
  for(const [origin,dir] of [[[0,30,sign*layout.d],[0,0,-sign]],[[layout.w,0,sign*5],[-1,0,0]]]){
   const o=new THREE.Vector3(...origin).applyMatrix4(part.object.matrixWorld),v=new THREE.Vector3(...dir).transformDirection(part.object.matrixWorld),hits=new THREE.Raycaster(o,v).intersectObject(shell),dist=[...new Set(hits.map(h=>+h.distance.toFixed(4)))];
   assert.ok(dist.length>=2,'ray crosses shell skin');const expectedWall=part.kind==='front'&&origin[0]===0?2.2:CONFIG.case.wall;assert.ok(Math.abs(dist[1]-dist[0]-expectedWall)<.001,'disk wall equals modeled face/side thickness');assert.ok(dist[1]-dist[0]>=1.2,'sampled disk shell wall >=1.2 mm');
  }
 }
 if(part.kind==='coupon'){
  const {geometry,solids}=inspectSTL(data,part),bounds=name=>{const s=solids.find(s=>s.name===name),g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(geometry.attributes.position.array.slice(s.start*9,(s.start+s.triangles)*9),3));g.computeBoundingBox();return g.boundingBox;};
  const rail=bounds('coupon-usb-rail');
  assert.ok(Math.abs(rail.max.y-rail.min.y-(CONFIG.v2.cradle.cavity[1]-CONFIG.v2.cradle.sideShort))<1e-5,'coupon USB rails use full breakout cavity length minus sideShort');
  assert.equal(solids.some(s=>s.name==='coupon-usb-stop'),false,'USB cavity gauge has no rear wall');
  // ทุกชิ้นนูนต้องอยู่ในแผ่นฐาน และไม่ทับกันในแนว XY (บอร์ดวางลองระหว่างรางได้ราบ)
  const boxOf=s=>{const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(geometry.attributes.position.array.slice(s.start*9,(s.start+s.triangles)*9),3));g.computeBoundingBox();return g.boundingBox;};
  const base=boxOf(solids.find(s=>s.name==='coupon-base')),feats=solids.filter(s=>s.name!=='coupon-base').map(boxOf);
  for(const b of feats)assert.ok(b.min.x>=base.min.x-1e-6&&b.max.x<=base.max.x+1e-6&&b.min.y>=base.min.y-1e-6&&b.max.y<=base.max.y+1e-6,'coupon feature inside base');
  for(let i=0;i<feats.length;i++)for(let j=i+1;j<feats.length;j++){const p=feats[i],q=feats[j];assert.ok(p.max.x<=q.min.x+1e-6||q.max.x<=p.min.x+1e-6||p.max.y<=q.min.y+1e-6||q.max.y<=p.min.y+1e-6,'coupon features do not overlap');}
  assert.ok(entry.timeMinutes[1]<20,'coupon estimated under 20 min at documented rate');
 }
 // ลบชิ้นเล็กออกจริงจากข้อมูล STL: ตัวตรวจต้องปฏิเสธ แม้กรอบกล่องเท่าเดิม
 if(part.kind==='front'||part.kind==='back'){
  const solids=inspectSTL(data,part).solids,removed=solids.find(s=>s.name.startsWith('v2-'));
  const bad=Buffer.concat([data.subarray(0,84+removed.start*50),data.subarray(84+(removed.start+removed.triangles)*50)]);
  bad.writeUInt32LE(data.readUInt32LE(80)-removed.triangles,80);
  assert.throws(()=>validatePart(bad,part),/triangle|missing|inventory/,'missing addition rejected');
 }
 const invalid=Buffer.from(data);invalid.writeFloatLE(NaN,96);assert.throws(()=>readSTL(invalid),/finite/);
 console.log(`PRINT: ${part.file} | ${data.length} bytes | ${metrics.sizeMm.join(' x ')} mm | ${metrics.volumeMm3} mm3 | ${metrics.plaSolidGrams} g PLA (100% solid upper estimate)`);
}
assert.ok(fs.readFileSync('work/ui-shell.html','utf8').includes('href="../print/v2/index.html"'),'main handout link');
// ลองค่าที่วัดใหม่ในโฟลเดอร์ชั่วคราว: ตัวเลขอธิบายต้องไม่ค้างค่าเดิม
const fixture=fs.mkdtempSync('work/print-doc-test-');
try{
 fs.mkdirSync(fixture+'/img');for(const name of [...expected.map(p=>p.file.replace('.stl','')),'assembled','exploded','solder'])fs.copyFileSync('print/v2/img/'+name+'.png',fixture+'/img/'+name+'.png');
 const changed=structuredClone(manifest);changed.config.button.holeClearance=.65;changed.config.case.wall=1.6;changed.config.case.bossDiameter=5;changed.config.case.screwHole=2.4;changed.config.case.bossPilot=1.8;changed.config.v2.ledge.lipGap=.4;changed.config.v2.cradle.sideGap=.45;changed.config.magnet.pocketClearance=.35;
 fs.writeFileSync(fixture+'/manifest.json',JSON.stringify(changed));
 execFileSync(process.execPath,['work/build-print-handout.mjs'],{env:{...process.env,PRINT_PACKAGE_DIR:fixture+'/'},stdio:'pipe'});
 assert.ok(fs.existsSync(fixture+'/README.md'),'handout generator accepts independent package directory');
 const doc=fs.readFileSync(fixture+'/README.md','utf8');
 for(const phrase of ['รูปุ่ม Ø10.65','หลวม 0.325 ต่อข้าง','ช่อง Ø10.35','บอร์ดสวมหลวมเล็กน้อย +0.8','breakout หลวม +0.9','case.wall=1.6'])assert.ok(doc.includes(phrase),'regenerated fit note: '+phrase);
}finally{
 const target=fs.realpathSync(fixture),allowed=path.resolve('work')+path.sep;assert.ok(target.startsWith(allowed),'cleanup remains in work');fs.rmSync(target,{recursive:true,force:true});
}
console.log('PASS: '+expected.length+' binary mm STLs reread; finite, closed oriented source shells, pendant lanyard tab/slots, countersinks, coupon and walls, z=0, centered XY, 180 mm bed; missing-addition and corrupt-STL controls');
console.log('PASS: print handout regeneration follows changed CONFIG fit clearances');

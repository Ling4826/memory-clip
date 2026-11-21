// รันจาก case3d/; ปุ่ม "รุ่น 2 · ที่สั่งพิมพ์" (v2p) ต้องสร้างฝาหน้า/ฝาหลังตรงกับ STL ที่ส่งร้าน KNN 23 ต.ค. ทุก byte
import fs from 'node:fs';import assert from 'node:assert/strict';import {CONFIG,buildDevice,STLExporter,orient} from './print-model.mjs';
const d=buildDevice({version:'v2p',battery:1200,variant:'pendant',angle:CONFIG.camera.pendantTilt,fov:false,torso:false},false);
assert.equal(d.parts.back.children.filter(o=>o.name==='pendant-lanyard-eyelet').length,2,'two printed eyelets');
assert.equal(d.parts.back.children.filter(o=>o.name==='pendant-lanyard-tab').length,0,'no Rev 3 tab');
for(const [kind,file,rotation] of [['back','v2-back-shell-pendant.stl',[0,0,0]],['front','v2-front-shell.stl',[Math.PI,0,0]]]){
 const view=new STLExporter().parse(orient(d.exportParts[kind],rotation),{binary:true}),data=Buffer.from(view.buffer,view.byteOffset,view.byteLength);
 Buffer.from('Memory Clip v2 | millimetres | merge overlapping shells').copy(data,0);
 assert.ok(data.equals(fs.readFileSync('sim/designs/eyelet/'+file)),kind+' matches printed '+file);
}
console.log('PASS: v2p rebuilds the printed eyelet set (front + back STL byte-identical to sim/designs/eyelet)');

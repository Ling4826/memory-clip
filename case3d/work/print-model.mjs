// แหล่งรูปทรงเดียวกับหน้าเว็บ; หน่วย mm
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';import {makeShell,auditClosedGeometry} from './shell-geometry.js';
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('work/config.js','utf8'),ctx);
export const CONFIG=JSON.parse(JSON.stringify(ctx.window.CONFIG));
export const {buildDevice}=new Function('THREE','CONFIG','makeShell',fs.readFileSync('work/model.js','utf8')+'\nreturn {buildDevice};')(THREE,CONFIG,makeShell);
export const STLExporter=new Function('Vector3',fs.readFileSync('work/vendor/STLExporter.js','utf8').replace(/^import .*;$/mg,'').replace(/^export .*;$/mg,'')+'\nreturn STLExporter;')(THREE.Vector3);
const rounded=n=>+n.toFixed(4);
export function orient(part,rotation=[0,0,0]){
 part.updateWorldMatrix(true,true);const out=new THREE.Group();
 part.traverse(o=>{if(o.isMesh){const g=o.geometry.clone().applyMatrix4(o.matrixWorld),m=new THREE.Mesh(g,o.material);m.name=o.name||'printed-solid';m.userData={...o.userData};out.add(m);}});
 out.rotation.set(...rotation);out.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(out),c=b.getCenter(new THREE.Vector3());out.position.set(-c.x,-c.y,-b.min.z);out.updateMatrixWorld(true);return out;
}
export function makeCoupon(){
 const C=CONFIG,L=C.v2.ledge,R=C.v2.cradle,g=new THREE.Group(),w=C.board.width+2*(L.lipGap+L.lip)+8,h=32,t=C.case.wall;
 const add=(name,size,pos)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size));m.name=name;m.position.set(...pos);g.add(m);};
 add('coupon-base',[w,h,t],[0,0,t/2]);
 // แยกเป็น 3 แถวไม่ให้ทับกัน (23 ต.ค.): ล่าง = ช่อง breakout, กลาง = รางบอร์ด, บน = ช่องโฟม; ทุกชิ้นอยู่ในแผ่นฐาน
 for(const [name,gap,width,y] of [['board',C.board.width+2*L.lipGap,L.lip,6],['usb',R.cavity[0]+2*R.sideGap,R.side,-7.2]]){
  const length=name==='usb'?R.cavity[1]-R.sideShort:4,centerY=name==='usb'?y-R.sideShort/2:y;
  for(const s of [-1,1])add('coupon-'+name+'-rail',[width,length,L.lipHeight],[s*(gap+width)/2,centerY,t+L.lipHeight/2]);
 }
 for(const s of [-1,1])add('coupon-foam-slot',[C.v2.sdStop.thickness,4,L.lipHeight],[w/2-2*C.v2.sdStop.thickness-C.v2.sdStop.foam/2+s*(C.v2.sdStop.foam+C.v2.sdStop.thickness)/2,12,t+L.lipHeight/2]);
 return g;
}
export function makePrintParts(){
 const parts=[],states={pendant:buildDevice({version:'v2',battery:1200,variant:'pendant',angle:CONFIG.camera.pendantTilt,fov:false,torso:false},false)};
 function add(file,kind,variant,label,rotation,orientation,supports,brim){parts.push({file:'v2-'+file+'.stl',kind,variant,label,orientation,supports,brim,object:orient(kind==='coupon'?makeCoupon():states[variant].exportParts[kind],rotation)});}
 add('front-shell','front','pendant','ฝาหน้า + ผนังกัน SD + ช่องไมค์ทะลุ',[Math.PI,0,0],'ผิวหน้าด้านนอกคว่ำลง ช่องภายในหงายขึ้น','ไม่; ตรวจสะพานสั้นเหนือช่อง USB ใน slicer',0);
 add('back-shell-pendant','back','pendant','ฝาหลังพร้อมแผ่นหัวกล่อง/แท่งเกี่ยว',[0,0,0],'ผิวหลังและแผ่นหัวกล่องวางราบ','ไม่; ตรวจสะพานสั้นเหนือช่อง USB',0);
 add('button-cap','cap','pendant','ฝาปุ่มกด',[Math.PI,0,0],'หน้าปุ่มแบนคว่ำลง ก้านชี้ขึ้น','ไม่; ยื่นจากฐานแบน',0);
 add('fit-coupon','coupon','pendant','เกจลองระยะบอร์ด / USB / โฟม',[0,0,0],'ฐานแบนคว่ำลง รางสั้นหงายขึ้น','ไม่',0);
 return parts;
}
export function readSTL(data){
 assert.ok(data.length>=84,'binary STL header');const count=data.readUInt32LE(80);assert.ok(count>0,'non-empty STL');assert.equal(data.length,84+count*50,'binary triangle byte count');
 const a=new Float32Array(count*9);for(let i=0;i<count;i++){
  for(let j=0;j<12;j++)assert.ok(Number.isFinite(data.readFloatLE(84+i*50+j*4)),'finite STL normal/vertex');
  for(let j=0;j<9;j++)a[i*9+j]=data.readFloatLE(96+i*50+j*4);
 }
 return new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(a,3));
}
function expectedSolid(mesh){const g=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);return g.index?g.toNonIndexed():g;}
export function inspectSTL(data,part){
 const g=readSTL(data),a=g.attributes.position.array;let start=0;const solids=[];part.object.updateMatrixWorld(true);
 for(const m of part.object.children){const source=expectedSolid(m),n=source.attributes.position.count/3;assert.ok((start+n)*9<=a.length,'missing triangle inventory: '+m.name);
  const slice=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(a.slice(start*9,(start+n)*9),3));
  const audit=auditClosedGeometry(slice);assert.ok(audit.closed,m.name+' source shell closed: '+JSON.stringify(audit));assert.ok(audit.volumeMm3>0,m.name+' positive volume');
  const ref=source.attributes.position.array;for(let i=0;i<ref.length;i++)assert.ok(Math.abs(ref[i]-a[start*9+i])<2e-5,'triangle inventory differs: '+m.name);
  solids.push({name:m.name,start,triangles:n,volumeMm3:audit.volumeMm3});start+=n;
 }
 assert.equal(start*9,a.length,'extra triangle inventory');return {geometry:g,solids};
}
export function validatePart(data,part){
 const {geometry:g,solids}=inspectSTL(data,part);g.computeBoundingBox();const b=g.boundingBox,size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());
 assert.ok(Math.abs(b.min.z)<2e-5,'z=0 and nothing below');assert.ok(Math.abs(center.x)<2e-5&&Math.abs(center.y)<2e-5,'centered XY');assert.ok(size.toArray().every(v=>v>0&&v<=180),'fits 180 mm bed');
 const volume=solids.reduce((s,p)=>s+p.volumeMm3,0);return {sizeMm:size.toArray().map(rounded),minMm:b.min.toArray().map(rounded),maxMm:b.max.toArray().map(rounded),volumeMm3:rounded(volume),plaSolidGrams:rounded(volume/1000*1.24),triangles:g.attributes.position.count/3,closedSolids:solids.length};
}

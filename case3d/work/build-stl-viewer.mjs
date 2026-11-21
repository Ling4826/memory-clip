// หน้าดู STL ชุดส่งพิมพ์ทั้ง 4 ชิ้นพร้อมกัน ลากหมุนได้ทีละชิ้น
// ฝังไฟล์ STL จาก print/v2 ตรงๆ (base64) จึงเห็นไฟล์ตัวเดียวกับที่ส่งร้าน
// รันจาก case3d/: node work/build-stl-viewer.mjs  ->  print/v2/viewer.html
import fs from 'node:fs';

const dir = 'print/v2/';
const parts = [
  ['v2-front-shell.stl', 'ฝาหน้า', '1-front-shell.stl'],
  ['v2-back-shell-pendant.stl', 'ฝาหลัง + ห่วงตะขอ', '2-back-shell.stl'],
  ['v2-button-cap.stl', 'ฝาปุ่ม', '3-button-cap.stl'],
  ['v2-fit-coupon.stl', 'ชิ้นทดสอบขนาด', '4-fit-coupon.stl'],
].map(([file, label, shopName]) => ({ file, label, shopName, b64: fs.readFileSync(dir + file).toString('base64') }));

const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>STL ชุดส่งพิมพ์</title>
<style>
:root{--bg:#f3f3ef;--card:#fff;--fg:#1f2d33;--muted:#5d6b70;--line:#d9dcd6}
@media (prefers-color-scheme:dark){:root{--bg:#161b1d;--card:#1f2629;--fg:#e6ebe9;--muted:#9aa7a8;--line:#323b3e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,"Leelawadee UI",sans-serif;padding:16px}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.card header{padding:8px 12px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.card b{font-size:15px}.card small{color:var(--muted)}
canvas{display:block;width:100%;height:340px;cursor:grab}
</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"}}</script>
</head><body>
<h1>ไฟล์ STL ชุดส่งพิมพ์ (แบบคล้องคอ)</h1>
<p>ลากเพื่อหมุน ล้อเมาส์เพื่อซูม · แสดงจากไฟล์ใน print/v2 ตอนสร้างหน้า · ในโฟลเดอร์ส่งร้านใช้ชื่อไฟล์ตามวงเล็บ · กริดช่องละ 10 มม.</p>
<div class="grid" id="grid"></div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const parts = ${JSON.stringify(parts)};
function parseSTL(b64){
  const bin=atob(b64),buf=new ArrayBuffer(bin.length),u8=new Uint8Array(buf);
  for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
  const dv=new DataView(buf),n=dv.getUint32(80,true),pos=new Float32Array(n*9);
  for(let i=0;i<n;i++){const o=84+i*50+12;for(let k=0;k<9;k++)pos[i*9+k]=dv.getFloat32(o+k*4,true);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.computeVertexNormals();g.computeBoundingBox();return g;
}
const dark=matchMedia('(prefers-color-scheme: dark)').matches;
for(const p of parts){
  const g=parseSTL(p.b64),bb=g.boundingBox,size=bb.getSize(new THREE.Vector3());
  const card=document.createElement('div');card.className='card';
  card.innerHTML='<header><b></b><small></small></header><canvas></canvas>';
  card.querySelector('b').textContent=p.label;
  card.querySelector('small').textContent=p.file+' ('+p.shopName+') · '+size.x.toFixed(1)+' × '+size.y.toFixed(1)+' × '+size.z.toFixed(1)+' มม.';
  document.getElementById('grid').append(card);
  const canvas=card.querySelector('canvas'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene=new THREE.Scene();scene.background=new THREE.Color(dark?0x1f2629:0xffffff);
  // STL เป็น z ขึ้น (ฐานพิมพ์ = z 0) หมุนให้ฐานพิมพ์อยู่ล่างในฉาก y ขึ้น
  const root=new THREE.Group();root.rotation.x=-Math.PI/2;scene.add(root);
  const c=bb.getCenter(new THREE.Vector3());
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x8fbcc2,roughness:.6,metalness:0}));
  mesh.position.set(-c.x,-c.y,0);root.add(mesh);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(g,30),new THREE.LineBasicMaterial({color:0x2c5a61}));
  edges.position.copy(mesh.position);root.add(edges);
  const span=Math.ceil(Math.max(size.x,size.y)/10+2)*10,grid=new THREE.GridHelper(span,span/10,dark?0x55605f:0xbfc6c2,dark?0x3a4344:0xdfe3df);
  scene.add(grid);
  scene.add(new THREE.HemisphereLight(0xffffff,0x667777,1.6));
  const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.set(40,80,60);scene.add(sun);
  const r=Math.max(size.x,size.y,size.z),cam=new THREE.PerspectiveCamera(35,1,.1,2000);
  cam.position.set(r*1.1,r*1.0,r*1.4);
  const ctl=new OrbitControls(cam,canvas);ctl.target.set(0,size.z/2,0);ctl.enableDamping=true;ctl.update();
  const fit=()=>{const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.round(w*renderer.getPixelRatio())){renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();}};
  renderer.setAnimationLoop(()=>{fit();ctl.update();renderer.render(scene,cam);});
}
</script>
</body></html>`;
fs.writeFileSync(dir + 'viewer.html', html);
console.log('BUILT: ' + dir + 'viewer.html (' + html.length + ' bytes, ' + parts.length + ' STL)');

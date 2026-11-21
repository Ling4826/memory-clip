const state={version:'v2p',variant:'pendant',battery:1200,angle:CONFIG.camera.pendantTilt,explode:0,transparent:false,labels:false,fov:false,torso:false,view:'iso',openFront:false,dimensions:false};
const pendantData=JSON.parse(document.getElementById('pendant-clips').textContent);
const $=id=>document.getElementById(id),viewport=$('viewport');
const scene=new THREE.Scene();scene.background=new THREE.Color(CONFIG.view.background);
const camera=new THREE.PerspectiveCamera(CONFIG.view.fov,1,CONFIG.view.near,CONFIG.view.far);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
const simulationTimer=new THREE.Timer();simulationTimer.connect(document);
renderer.setPixelRatio(Math.min(devicePixelRatio,CONFIG.view.maxPixelRatio));
renderer.setClearColor(CONFIG.view.background);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.28;
viewport.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label','ลากเพื่อหมุน เลื่อนล้อเมาส์เพื่อซูม คลิกขวาลากเพื่อแพน');
const labelRenderer=new CSS2DRenderer();labelRenderer.domElement.style.cssText='position:absolute;inset:0;pointer-events:none';viewport.appendChild(labelRenderer.domElement);
const leaderSVG=document.createElementNS('http://www.w3.org/2000/svg','svg');leaderSVG.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible';viewport.insertBefore(leaderSVG,labelRenderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=0.09;
controls.minDistance=CONFIG.view.minDistance;controls.maxDistance=CONFIG.view.maxDistance;controls.maxPolarAngle=Math.PI*0.96;
scene.add(new THREE.HemisphereLight('#ffffff','#75847c',2.6));
const key=new THREE.DirectionalLight('#fff8ed',3.1);key.position.set(...CONFIG.view.lightPosition);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-150;key.shadow.camera.right=150;key.shadow.camera.top=180;key.shadow.camera.bottom=-160;key.shadow.normalBias=0.15;scene.add(key);
const fill=new THREE.DirectionalLight('#bce3e4',1.9);fill.position.set(-150,40,-100);scene.add(fill);
const floor=mesh(new THREE.PlaneGeometry(CONFIG.view.gridSize,CONFIG.view.gridSize),new THREE.ShadowMaterial({opacity:0.13}),scene);floor.rotation.x=-Math.PI/2;floor.position.y=CONFIG.view.floorY;floor.receiveShadow=true;
const grid=new THREE.GridHelper(CONFIG.view.gridSize,CONFIG.view.gridDivisions,'#c5cfc5','#dce2d8');grid.position.y=CONFIG.view.floorY;grid.material.transparent=true;grid.material.opacity=0.52;scene.add(grid);
let device,torsoGroup,dimensionGroup,calloutGroup,cameraTween=null,toastTimer;
let pendantMode=null,pendantPick={design:'E',compare:'',scenario:'brisk',drop:15},pendantElapsed=0,pendantSpeed=1,pendantStartedAt=0,pendantPlaying=false,pendantDuration=10,pendantCamera=null;
function dispose(root) {
 if(!root)return;const geometries=new Set(),materials=new Set();
 root.traverse(o=>{if(o.isCSS2DObject)o.element.remove();if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
 const textures=new Set();materials.forEach(m=>{for(const value of Object.values(m))if(value?.isTexture)textures.add(value);});textures.forEach(t=>t.dispose());
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();
}
function makeTorso() {
 const c=CONFIG.torso,g=new THREE.Group(),s=new THREE.Shape(),cw=c.chestWidth/2,sw=c.shoulderWidth/2,nw=c.neckWidth/2;
 s.moveTo(-cw*0.84,c.lowerY);s.quadraticCurveTo(-cw*1.04,c.lowerY*0.45,-cw,c.clavicleY*0.25);
 s.quadraticCurveTo(-sw,c.clavicleY*0.68,-sw,c.shoulderY-c.neckWidth*0.2);
 s.quadraticCurveTo(-sw,c.shoulderY,-nw,c.shoulderY+c.neckWidth*0.18);
 s.lineTo(-nw,c.neckTop);s.quadraticCurveTo(0,c.neckTop+nw*0.18,nw,c.neckTop);
 s.lineTo(nw,c.shoulderY+c.neckWidth*0.18);s.quadraticCurveTo(sw,c.shoulderY,sw,c.shoulderY-c.neckWidth*0.2);
 s.quadraticCurveTo(sw,c.clavicleY*0.68,cw,c.clavicleY*0.25);s.quadraticCurveTo(cw*1.04,c.lowerY*0.45,cw*0.84,c.lowerY);s.closePath();
 mesh(extrude(s,c.depth),mat(CONFIG.colors.skin),g,[0,0,device.shirtZ-c.shirtThickness/2-c.depth]);
 // Thin shirt, including shoulder outline and open neckline. Chest surface is the contact plane.
 const shirt=s.clone();const neck=new THREE.Path();neck.absellipse(0,c.shoulderY+c.neckWidth*0.18,nw*1.03,nw*0.52,0,Math.PI*2,true);shirt.holes.push(neck);
 mesh(extrude(shirt,c.shirtThickness),mat(CONFIG.colors.shirt,{roughness:1}),g,[0,0,device.shirtZ-c.shirtThickness/2]);
 const lineMat=new THREE.LineBasicMaterial({color:'#bcc5bb',transparent:true,opacity:0.8});
 const pts=[[-cw*0.6,c.clavicleY,device.shirtZ+c.shirtThickness],[-nw,c.clavicleY-c.neckWidth*0.12,device.shirtZ+c.shirtThickness],[0,c.clavicleY,device.shirtZ+c.shirtThickness],[nw,c.clavicleY-c.neckWidth*0.12,device.shirtZ+c.shirtThickness],[cw*0.6,c.clavicleY,device.shirtZ+c.shirtThickness]];
 g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(...p))),lineMat));
 const measure=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(cw*0.36,0,device.shirtZ+c.shirtThickness),new THREE.Vector3(cw*0.36,c.clavicleY,device.shirtZ+c.shirtThickness)]),new THREE.LineDashedMaterial({color:'#89a898',dashSize:5,gapSize:4}));measure.computeLineDistances();g.add(measure);
 label(g,'ใต้ไหปลาร้า '+c.clavicleY+' มม.',[cw*0.36,c.clavicleY/2,device.shirtZ+c.shirtThickness],'context');
 label(g,'หน้าอก '+c.chestWidth+' มม.',[0,c.lowerY*0.6,device.shirtZ+c.shirtThickness],'context');
 return g;
}
function applyVisibility() {
 for(const name of ['front','back']) {const m=device.materials[name],see=state.transparent;m.transparent=see;m.opacity=see?0.16:1;m.depthWrite=!see;m.side=THREE.DoubleSide;m.needsUpdate=true;}
 // มุมงานบัดกรี: ถอดฝาหน้า/ฝาปุ่ม/บอร์ด Sense ออก เห็นด้านใต้ XIAO เหมือนตอนบัดกรีจริง
 // เปิดฝาหน้า: ถอดฝาด้านกล้อง + ฝาปุ่ม เห็นของข้างในตามตำแหน่งจริง
 device.parts.front.visible=device.parts.cap.visible=!state.solderView&&!state.openFront;device.parts.hardware.visible=!state.solderView;
 device.root.traverse(o=>{if(o.userData.sense||o.userData.ribbon||o.name==='v2-sd-foam')o.visible=!state.solderView;});
 if(calloutGroup){calloutGroup.traverse(o=>o.visible=!!state.solderView);$('solderList').hidden=!state.solderView;} // CSS2D ไม่ดูพ่อ ต้องตั้งทุกชิ้น
 device.fov.visible=state.fov&&!state.solderView;const hideFront=state.solderView||state.openFront;device.labels.forEach(l=>l.visible=state.labels&&(!state.solderView||!l.parent.userData.sense)&&(!hideFront||(l.parent!==device.parts.front&&l.parent!==device.parts.cap)));
 torsoGroup.visible=state.torso;device.shirt.visible=state.version!=='v1'&&state.variant==='magnet'&&!state.torso;
 floor.position.y=grid.position.y=state.torso?CONFIG.torso.lowerY-CONFIG.case.endClearance:Math.min(CONFIG.view.floorY,-device.p.h/2-CONFIG.case.endClearance);
}
function applyExplosion() {
 const e=state.explode/100*CONFIG.view.explodedDistance;
 const parts=device.parts;
 parts.front.position.z=e;parts.cap.position.z=e;parts.details.position.z=e*0.4;
 parts.board.position.copy(parts.board.userData.home||new THREE.Vector3());parts.board.position.z+=e*0.35;parts.battery.position.copy(parts.battery.userData.home||new THREE.Vector3());parts.battery.position.add(new THREE.Vector3(e*0.5,-e*0.16,-e*0.24));
 parts.back.position.z=-e*0.75;parts.mount.position.z=-e*1.35;parts.hardware.position.z=-e*0.1;
 device.shirt.position.z=device.shirtZ-e;
 $('explodeValue').textContent=state.explode+'%';
}
function buildDimensions() {
 dispose(dimensionGroup);dimensionGroup=new THREE.Group();scene.add(dimensionGroup);
 for(const m of computeMeasurements(device)){
  const a=new THREE.Vector3(...m.a),b=new THREE.Vector3(...m.b),off=new THREE.Vector3(...m.offset),start=a.clone().add(off),end=b.clone().add(off),dir=end.clone().sub(start).normalize(),color=m.id.includes('-')?'#b45a26':'#145e72';
  const material=new THREE.LineBasicMaterial({color,depthTest:false}),line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([a,start,start,end,end,b]),material);line.renderOrder=20;dimensionGroup.add(line);
  for(const [point,direction] of [[start,dir],[end,dir.clone().negate()]]){const arrow=new THREE.ArrowHelper(direction,point,Math.min(m.value/2,3),color,Math.min(m.value/2,2),Math.min(m.value/3,1.2));arrow.traverse(o=>{if(o.material){o.material.depthTest=false;o.renderOrder=20;}});dimensionGroup.add(arrow);}
  const mid=start.clone().lerp(end,.5);if(m.value<8)mid.y-=4;
  label(dimensionGroup,m.title+' '+m.value.toFixed(1)+' มม.',mid.toArray(),'dimension-label');
 }
}
// ป้ายเลขจุดบัดกรี: อ่านตำแหน่งก้อนตะกั่วจริง เรียงเป็นแถวซ้าย/ขวาของบอร์ด + เส้นชี้ ใช้ในมุมงานบัดกรี
function buildSolderCallouts() {
 calloutGroup?.removeFromParent();dispose(calloutGroup);calloutGroup=new THREE.Group();calloutGroup.name='solder-callouts';
 const board=device.parts.board,B=CONFIG.board,edge=B.width/2,by=device.p.boardY;device.root.updateMatrixWorld(true);
 const joints=[];device.root.traverse(o=>{if(o.name==='wiring-joint')joints.push(o);});
 const items=[];CONFIG.solderLog.forEach(e=>{const j=joints.find(o=>o.userData.pad===e.pad);if(j)items.push({...e,at:board.worldToLocal(j.getWorldPosition(new THREE.Vector3()))});});
 const z=items[0]?.at.z??0,d0=CONFIG.wiring.pins.left.indexOf(CONFIG.wiring.deadPin);
 items.push({pad:CONFIG.wiring.deadPin,what:'เสีย (รั่วลง GND) ถอดสายออกแล้ว ไม่ใช้',dead:true,at:new THREE.Vector3(-edge,by+(d0-(B.pinCount-1)/2)*B.pinPitch,z)});
 items.forEach((it,i)=>it.n=i+1);
 for(const side of [-1,1]){
  const list=items.filter(it=>(it.at.x<0?-1:1)===side).sort((a,b)=>b.at.y-a.at.y),step=3.4,y0=by+(list.length-1)*step/2;
  list.forEach((it,k)=>{
   const anchor=new THREE.Vector3(side*(edge+7),y0-k*step,z+1.5),tone=it.dead?'dead':it.done?'':'todo';
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([it.at,anchor]),new THREE.LineBasicMaterial({color:it.dead?'#c0392b':it.done?'#2f7a52':'#c98a00',depthTest:false}));line.renderOrder=30;calloutGroup.add(line);
   const o=label(calloutGroup,it.n+' · '+it.pad.replace('back:','หลัง ')+(it.dead?' ✕':it.done?' ✓':' ⏳'),anchor.toArray(),'joint-label '+tone);o.center.set(side<0?1:0,.5);
  });
 }
 board.add(calloutGroup);
 const row=it=>'<li class="'+(it.dead?'dead':it.done?'':'todo')+'"><b>'+({'back:GND':'GND หลังชิป',GND:'GND ขอบ'}[it.pad]||it.pad)+'</b> '+(it.dead?'✕ ':it.done?'✓ ':'⏳ ')+it.what+'</li>';
 $('solderList').innerHTML='<h3>จุดบัดกรีบนบอร์ด (✓ ทำแล้ว · ⏳ รุ่น 2 ยังไม่ทำ)</h3><ol>'+items.map(row).join('')+'</ol>';
}
function updateInspection() {
 dimensionGroup.visible=state.dimensions;
 $('dimensionNote').hidden=!state.dimensions;$('dimensionNote').textContent=state.explode?'เส้นบอกขนาดอ้างอิงตำแหน่งเมื่อประกอบ (0%)':'ระยะผิวจริงของแบบ · ค่าประมาณ ต้องวัดก่อนพิมพ์';
 $('dimensionNote').textContent+=' · '+wiringGapText();
}
function updateInfo() {
 const p=device.p,variant={clip:'A · คลิปหนีบ',magnet:'B · แม่เหล็ก',pendant:'C · ห้อยคอ'}[state.variant];
 const cardboard=state.version==='v1';$('variantName').textContent=cardboard?'กล่องกระดาษ · ตะขอสองข้าง':variant;$('batteryName').textContent=(cardboard?'รุ่น 1 · ':state.version==='v2'?'รุ่น 2 · ':state.version==='v2p'?'รุ่น 2 ที่สั่งพิมพ์ · ':'แบบพิมพ์เดิม · ')+(state.battery===1200||cardboard?'แบต 603450 (ฉลาก 1,200 mAh)':state.battery.toLocaleString()+' mAh');
 const pendant=CONFIG.pendant,eyes=pendant.eyes,height=state.variant!=='pendant'?p.h:state.version==='v2p'?Math.max(p.h,2*(p.h/2+eyes.topOffset+eyes.outerDiameter/2)):p.h+pendant.lug.tabLength;
 const totalDepth=p.d+device.mountThickness+Math.max(CONFIG.button.capDepth,CONFIG.screw.headDepth);
 $('dims').textContent=[p.w,p.h,p.d].map(n=>n.toFixed(1)).join(' × ');
 $('mountDims').textContent=cardboard?'สายคล้อง + ฝาพับเปิด':[Math.max(p.w,state.variant==='magnet'?CONFIG.magnet.plateWidth:0),height,totalDepth].map(n=>n.toFixed(1)).join(' × ');
 $('mass').textContent='≈ '+estimateMass(state,p).toFixed(1)+' กรัม';
 $('angleValue').textContent=cardboard?'0° (ตามภาพ)':state.angle+'°';$('angle').disabled=cardboard;
 const btn=document.querySelector('[data-export="mount"]');btn.disabled=state.variant==='pendant';btn.textContent=state.variant==='clip'?'คลิปหนีบ':state.variant==='magnet'?'แผ่นแม่เหล็ก':state.version==='v2p'?'ห่วงรวมในฝาหลัง':'แผ่นหัวกล่องรวมในฝาหลัง';
 document.querySelectorAll('[data-export]').forEach(b=>b.disabled=cardboard||(b.dataset.export==='mount'&&state.variant==='pendant'));
 const q=CONFIG.cardboard;
 $('estimateDetails').hidden=!cardboard;
 $('estimateNote').textContent='กล่อง DIGITAL MULTIMETER ใช้แล้ว ตามภาพ IMG_8274–8277 · '+[p.w,p.h,p.d].join(' × ')+' มม. (ลึก '+q.depth+' มม. ผู้ใช้ระบุ; ที่เหลือประมาณ ไม่ได้วัด) · กระดาษหนา '+q.wall+' มม.; รูเลนส์ '+q.cameraHole+' มม. ต่ำจากขอบ '+q.cameraDrop+' มม.; รูตะขอ Ø'+q.hook.hole+' มม. ที่ ±'+q.hook.x+' / สูง '+q.hook.y+' มม.; ตะขอยาว '+q.hook.length+' มม.; สายคล้องกว้าง '+q.lanyard.width+' มม.; ฝาพับสูง '+q.flap.height+' มม.; ช่องสายเสา '+q.antenna.slit.join('×')+' มม.; เสา '+q.antenna.size.join('×')+' มม.; เทปกว้าง '+q.tape.width+' มม.; สาย USB Ø'+(q.cableRadius*2)+' มม. · บอร์ด USB ชี้บน แบต 603450 แผงหน้าซ้ายล่าง ปุ่ม 6×6 อยู่ข้าง · ตำแหน่ง สาย เทป ลอนกระดาษ และระยะย่อยทั้งหมดประมาณ ไม่ได้วัด';
 $('versionNote').textContent=cardboard?'กล่อง DIGITAL MULTIMETER ใช้แล้ว ตามภาพ IMG_8274–8277 · '+[p.w,p.h,p.d].join(' × ')+' มม. (ลึก '+q.depth+' มม. ผู้ใช้ระบุ; ที่เหลือประมาณ ไม่ได้วัด) · กระดาษหนา '+q.wall+' มม.; รูเลนส์ '+q.cameraHole+' มม. ต่ำจากขอบ '+q.cameraDrop+' มม.; รูตะขอ Ø'+q.hook.hole+' มม. ที่ ±'+q.hook.x+' / สูง '+q.hook.y+' มม.; ตะขอยาว '+q.hook.length+' มม.; สายคล้องกว้าง '+q.lanyard.width+' มม.; ฝาพับสูง '+q.flap.height+' มม.; ช่องสายเสา '+q.antenna.slit.join('×')+' มม.; เสา '+q.antenna.size.join('×')+' มม.; เทปกว้าง '+q.tape.width+' มม.; สาย USB Ø'+(q.cableRadius*2)+' มม. · บอร์ด USB ชี้บน แบต 603450 แผงหน้าซ้ายล่าง ปุ่ม 6×6 อยู่ข้าง · ตำแหน่ง สาย เทป ลอนกระดาษ และระยะย่อยทั้งหมดประมาณ ไม่ได้วัด':state.version==='v2p'?'ชุดที่สั่งพิมพ์ร้าน KNN 23 ต.ค. (140 บาท): รุ่น 2 แบบห้อยคอ แบต 1200 mAh ห่วงตะขอ 2 ห่วงยื่นเหนือหัวกล่อง ตรงกับไฟล์ STL ที่ส่งร้าน · รุ่น 2 ปัจจุบันเปลี่ยนเป็นแผ่นหัว Rev 3 ซึ่งยังไม่ได้ส่งพิมพ์':state.version==='v2'?'แบบเสนอ: ช่องชาร์จแยก 5.1kΩ + ไดโอด 1N5817, ปิดช่อง SD + โฟม 1 มม. กันการ์ดเลื่อน, ขารองบอร์ด 4 มุม':'แบบพิมพ์เดิม: ช่องเข้าถึง SD ด้านข้าง ยังไม่มีโฟมกันหลุด ขารองบอร์ด หรือแท่นรับแรงช่องชาร์จ';
 $('partsList').textContent=partsList(state,p).join('\n');
 $('gapNote').textContent=wiringGapText();
 $('wiringNote').textContent='แบต/JST และขา 100kΩ ลง BAT+/BAT− กลางหลัง XIAO; จุดรวม → D5; D0 เสีย ไม่ใช้; ปุ่ม → D1/GND ขอบบอร์ด · พิกัดแผ่นประมาณจากรูป'+(state.version==='v2'||state.version==='v2p'?' · breakout 5V → 1N5817 (ขีดหันเข้าบอร์ด) → VUSB หลัง; breakout GND → GND หลัง · VUSB กับ 5V ขอบเป็น net เดียวกัน ให้ยืนยันด้วยเสียงบี๊บเมื่อถอดไฟ/แบต':'');
 if(cardboard){
  $('versionNote').textContent='กล่อง DIGITAL MULTIMETER ตามภาพ · '+[p.w,p.h,p.d].join(' × ')+' มม. · กว้าง/สูงและตำแหน่งประมาณ ไม่ได้วัด; ลึก '+q.depth+' มม. ผู้ใช้ระบุ · USB ชี้บน แบตแผงหน้า เสาอากาศภายนอก สายคล้องคอ';
  $('estimateNote').textContent+='\nตำแหน่งเทียบกึ่งกลางกล่อง (มม.): แบต x/y '+[q.batteryX,q.batteryY].join(' / ')+'; ห่างแผงหน้า '+q.batteryGap+'; เสา x/y '+[q.antenna.x,q.antenna.y].join(' / ')+'; ห่างหน้า '+q.antenna.gap+'; ปุ่ม y/z '+[q.button.y,q.button.z].join(' / ')+'; รูสายปุ่ม Ø'+q.button.wireHole+' ที่ y/z '+[q.button.holeY,q.button.holeZ].join(' / ')+'\nJST แบต x/y/z '+q.batteryJst.join(' / ')+'; JST ปุ่ม '+q.buttonJst.join(' / ')+'; ตัวต้านทาน x '+q.resistorX.join(' / ')+' y/z '+[q.resistorY,q.resistorZ].join(' / ')+'\nปลีกย่อย (มม.): ลอนระยะ '+q.flutePitch+' ลึก '+q.fluteDepth+'; ขอบฉีก '+q.rough+'; รอยพับ '+q.seam+'; เทปหนา '+q.tape.depth+' ยาว '+q.tape.length+'; เทปบอร์ด '+q.boardTape.join('×')+'; ท่อหด Ø'+q.heatShrink.radius*2+' ยาว '+q.heatShrink.length+'; สายแบต/ปุ่ม Ø'+q.wireRadius*2+'; หัว USB '+q.plug.join('×')+' ปลอก '+q.boot.join('×')+'; สาย USB ยกสูง '+q.cableExit+'; สายคล้องหนา '+q.lanyard.thickness+' สูง '+q.lanyard.rise+'; ลวดตะขอ Ø'+q.hook.wire*2+' ห่วง Ø'+q.hook.ring*2+'; บ่าฝาพับ '+q.flap.notchWidth+'×'+q.flap.notchDepth;
 }
 $('exportNote').textContent=cardboard?'กล่องกระดาษใช้ดูการประกอบเท่านั้น · ปิดการส่งออก STL':'STL · หน่วยมิลลิเมตร · เฉพาะพลาสติก ไม่รวมอิเล็กทรอนิกส์หรือโลหะ · รวมเนื้อชิ้นส่วนที่ซ้อนกันในโปรแกรมสไลซ์';
 document.querySelectorAll('[data-variant]').forEach(b=>{b.disabled=cardboard||state.version==='v2p';const a=!cardboard&&b.dataset.variant===state.variant;b.classList.toggle('active',a);b.setAttribute('aria-pressed',a);});
 document.querySelectorAll('[data-version]').forEach(b=>{const a=b.dataset.version===state.version;b.classList.toggle('active',a);b.setAttribute('aria-pressed',a);});
 document.querySelectorAll('[data-battery]').forEach(b=>{b.disabled=cardboard||state.version==='v2p';const a=+b.dataset.battery===(cardboard?1200:state.battery);b.classList.toggle('active',a);b.setAttribute('aria-pressed',a);});
}
function rebuild() {
 const next=buildDevice(state);dispose(device?.root);dispose(torsoGroup);device=next;scene.add(device.root);
 torsoGroup=makeTorso();scene.add(torsoGroup);buildDimensions();buildSolderCallouts();applyExplosion();applyVisibility();updateInfo();updateInspection();if(pendantMode)hidePendantBase();
}
function toast(message) {clearTimeout(toastTimer);$('status').textContent=message;$('status').classList.add('visible');toastTimer=setTimeout(()=>$('status').classList.remove('visible'),5000);}
function setView(name,instant=false) {
 if(pendantMode)exitPendantMode();
 let pos,target=new THREE.Vector3(),factor=Math.max(device.p.h/75,1);
 if(state.version==='v1'){factor*=1.15;target.y=CONFIG.cardboard.flap.height*.8;}
 // มุม 'งานบัดกรี': มองหลังบอร์ดจากซ้ายหลัง ซ่อนชุดยึด/แม่เหล็ก ฝาหลังโปร่ง ให้เห็นแผ่นขา ก้อนตะกั่ว JST ตัวต้านทาน
 state.solderView=name==='solder';applyVisibility();updateInspection();
 if(name==='solder') {// จ่อตรงหลังบอร์ด ตามแนวตั้งฉากหน้าแผ่น ใช้ได้ทั้งบอร์ดหัวลง (พิมพ์) และหัวขึ้น (กล่องกระดาษ)
  const board=device.parts.board;device.root.updateMatrixWorld(true);const n=new THREE.Vector3(0,0,1).transformDirection(board.matrixWorld),up=new THREE.Vector3(0,1,0).transformDirection(board.matrixWorld);
  target.copy(board.localToWorld(new THREE.Vector3(0,device.p.boardY,CONFIG.board.baseZ)));pos=target.clone().addScaledVector(n,CONFIG.view.solderDistance).addScaledVector(up,-6);}
 else if(name==='conversation') {state.torso=true;$('torso').checked=true;applyVisibility();pos=new THREE.Vector3(...CONFIG.view.conversation);target.set(...CONFIG.view.conversationTarget);}
 else if(name==='fit') {
  if(state.torso) {pos=new THREE.Vector3(...CONFIG.view.torsoView);target.set(0,(CONFIG.torso.neckTop+CONFIG.torso.lowerY)/2,0);}
  else {const e=state.explode/100;pos=new THREE.Vector3(...(e>0?CONFIG.view.exploded:CONFIG.view.iso)).multiplyScalar(factor*(1+e*0.2));target.z=-e*CONFIG.view.explodedDistance*0.12;}
 } else {pos=new THREE.Vector3(...CONFIG.view[name]).multiplyScalar(state.torso?3.8:factor*(1+state.explode/100*0.6));if(state.torso)target.y=(CONFIG.torso.neckTop+CONFIG.torso.lowerY)/2;}
 // Narrow screens need a longer camera distance to preserve horizontal fit.
 if(camera.aspect<1 && name!=='conversation')pos.multiplyScalar(1/Math.max(camera.aspect,0.55));
 state.view=name;
 if(instant){camera.position.copy(pos);controls.target.copy(target);controls.update();}
 else cameraTween={start:performance.now(),from:camera.position.clone(),to:pos,fromTarget:controls.target.clone(),toTarget:target};
 $('viewName').textContent={iso:'มุมสามมิติ',front:'ด้านหน้า',side:'ด้านข้าง',solder:'งานบัดกรี (ถอด Sense ออก)',conversation:'สายตาคู่สนทนา',fit:'พอดีจอ'}[name];
 document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
}
controls.addEventListener('start',()=>cameraTween=null);
function exportPart(which) {
 if(state.version==='v1'){toast('กล่องกระดาษเป็นแบบจำลอง ไม่ส่งออก STL');return;}
 // Rebuild an assembled model so UI transparency/explosion/torso never affects STL.
 const fresh=buildDevice({...state,explode:0,fov:false,labels:false},false),part=fresh.exportParts[which];
 if(!part){dispose(fresh.root);toast('แผ่นหัวกล่องรวมอยู่ในไฟล์ฝาหลัง');return;}
 const out=new THREE.Group();
 part.updateWorldMatrix(true,true);
 part.traverse(o=>{if(o.isMesh){const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);out.add(new THREE.Mesh(g));}});
 // Place the selected part flat in the slicer (front outside face on the bed).
 if(which==='front')out.rotation.x=Math.PI;
 out.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(out),center=bounds.getCenter(new THREE.Vector3());
 out.position.set(-center.x,-center.y,-bounds.min.z);out.updateMatrixWorld(true);
 const data=new STLExporter().parse(out,{binary:true});
 const name=`memory-camera_${state.version}_${state.battery}mAh_${state.variant}_${which}_mm.stl`;
 const url=URL.createObjectURL(new Blob([data],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 dispose(fresh.root);dispose(out);toast('ส่งออก '+name+' · ตั้งหน่วยใน slicer เป็น mm');
 return {name,bytes:data.byteLength};
}
function pendantClip(id) {return pendantData.clips.find(clip=>clip.id===id);}
function pendantClipId(design) {return `${design}-${pendantPick.scenario}-${Math.round(pendantPick.drop)}`;}
function pendantClipIds() {
 const ids=[pendantClipId(pendantPick.design)];
 if(pendantPick.compare&&pendantPick.compare!==pendantPick.design)ids.push(pendantClipId(pendantPick.compare));
 return ids;
}
function currentPendantElapsed() {
 if(!pendantPlaying)return pendantElapsed;
 return ((simulationTimer.getElapsed()-pendantStartedAt)*pendantSpeed%pendantDuration+pendantDuration)%pendantDuration;
}
function hidePendantBase() {
 for(const child of scene.children)if(child!==pendantMode?.root&&!child.isLight)child.visible=false;
}
function fillPendantSelects() {
 const option=(value,text)=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;};
 $('pendantDesign').replaceChildren(...pendantData.designs.map(d=>option(d.id,`${d.id} · ${d.short}`)));
 $('pendantCompareDesign').replaceChildren(option('','ไม่เทียบ'),...pendantData.designs.map(d=>option(d.id,`${d.id} · ${d.short}`)));
 $('pendantScenario').replaceChildren(...Object.entries(pendantData.scenarios).map(([id,s])=>option(id,s.label)));
 $('pendantDrop').replaceChildren(...pendantData.drops.map(m=>option(String(Math.round(m*100)),Math.round(m*100)+' ซม.')));
}
function syncPendantButtons() {
 $('pendantDesign').value=pendantPick.design;$('pendantCompareDesign').value=pendantPick.compare;
 $('pendantScenario').value=pendantPick.scenario;$('pendantDrop').value=String(pendantPick.drop);
}
function refreshPendantStats() {
 const panel=$('pendantStats');panel.replaceChildren();
 for(const id of pendantClipIds()){
  const clip=pendantClip(id),card=document.createElement('article');card.className='pendant-stat';
  const heading=document.createElement('h3');heading.textContent=clip.title;heading.title=clip.designName;
  const metrics=document.createElement('p');metrics.textContent=`ระยะแกว่ง P90 ${clip.stats.swingP90mm} มม. · เวลาที่พลิก ${clip.stats.flipPct}% · ภาพคมกลางแจ้ง ${clip.stats.sharpOutdoor}%`;
  card.append(heading,metrics);panel.append(card);
 }
 $('pendantNote').textContent=pendantData.note;
}
function syncPendantReadout() {
 if(!pendantMode)return;
 const elapsed=currentPendantElapsed(),slider=$('pendantTime');
 pendantElapsed=elapsed;pendantMode.update(elapsed);
 slider.value=String(Math.round(elapsed/pendantDuration*1000));
 $('pendantTimeValue').textContent=elapsed.toFixed(2)+' วินาที';
 const flipped=pendantMode.rigs.filter(rig=>rig.frame?.flip);
 $('pendantFlip').textContent=flipped.length?'กล้องหันเข้าอก · '+flipped.map(rig=>'แบบ '+rig.clip.design).join(' / '):'กล่องยังหันออกจากอก';
 $('pendantPlay').textContent=pendantPlaying?'หยุด':'เล่น';
}
function rebuildPendantMode() {
 pendantMode?.dispose();
 const ids=pendantClipIds();
 pendantMode=createPendantMode(THREE,pendantData,ids);scene.add(pendantMode.root);hidePendantBase();
 const first=pendantMode.rigs[0].clip;
 pendantDuration=Math.max(0.001,first.frames.at(-1).t-first.frames[0].t);
 pendantElapsed=((pendantElapsed%pendantDuration)+pendantDuration)%pendantDuration;
 syncPendantButtons();refreshPendantStats();syncPendantReadout();
}
function setPendantElapsed(seconds) {
 pendantElapsed=((seconds%pendantDuration)+pendantDuration)%pendantDuration;
 if(pendantPlaying)pendantStartedAt=simulationTimer.getElapsed()-pendantElapsed/pendantSpeed;
 syncPendantReadout();
}
function enterPendantMode() {
 if(pendantMode)return;
 pendantCamera={position:camera.position.clone(),target:controls.target.clone(),minDistance:controls.minDistance,maxDistance:controls.maxDistance};
 const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
 pendantSpeed=Number($('pendantSpeed').value)||1;pendantElapsed=0;pendantPlaying=!reduceMotion;
 pendantStartedAt=simulationTimer.getElapsed();
 $('pendantPanel').hidden=false;document.querySelector('.stage').classList.add('pendant-active');
 $('pendantModeToggle').textContent='ออกจากจำลอง';$('pendantModeToggle').setAttribute('aria-pressed','true');
 rebuildPendantMode();
 const target=new THREE.Vector3(0,0,0),aspect=Math.max(camera.aspect,0.3),distance=Math.max(1100,520/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*aspect));
 controls.maxDistance=Math.max(controls.maxDistance,distance*1.1);
 const direction=new THREE.Vector3(0.68,0.12,0.68).normalize();
 cameraTween={start:performance.now(),from:camera.position.clone(),to:target.clone().addScaledVector(direction,distance),fromTarget:controls.target.clone(),toTarget:target};
 syncPendantReadout();
}
function exitPendantMode() {
 if(!pendantMode)return;
 pendantMode.dispose();pendantMode=null;pendantPlaying=false;
 for(const child of scene.children)if(!child.isLight)child.visible=true;
 applyVisibility();updateInspection();
 $('pendantPanel').hidden=true;document.querySelector('.stage').classList.remove('pendant-active');
 $('pendantModeToggle').textContent='จำลองการห้อยคอ';$('pendantModeToggle').setAttribute('aria-pressed','false');
 if(pendantCamera){controls.minDistance=pendantCamera.minDistance;controls.maxDistance=pendantCamera.maxDistance;camera.position.copy(pendantCamera.position);controls.target.copy(pendantCamera.target);controls.update();pendantCamera=null;}
 cameraTween=null;
}
function initUI() {
document.querySelectorAll('[data-variant]').forEach(b=>b.addEventListener('click',()=>{const previous=state.variant;state.variant=b.dataset.variant;if(state.variant==='pendant'){state.battery=1200;state.angle=CONFIG.camera.pendantTilt;}else if(previous==='pendant'){if(state.battery===1200)state.battery=1000;state.angle=CONFIG.camera.tilt;}rebuild();}));
 document.querySelectorAll('[data-version]').forEach(b=>b.addEventListener('click',()=>{state.version=b.dataset.version;if(state.version==='v2p')Object.assign(state,{variant:'pendant',battery:1200,angle:CONFIG.camera.pendantTilt});rebuild();setView(state.view);}));
 document.querySelectorAll('[data-battery]').forEach(b=>b.addEventListener('click',()=>{state.battery=+b.dataset.battery;rebuild();setView(state.view);}));
 $('explode').addEventListener('input',e=>{state.explode=+e.target.value;applyExplosion();applyVisibility();updateInspection();});
 $('explode').addEventListener('change',()=>{if(!state.torso)setView('fit');});
 $('angle').min=CONFIG.camera.minTilt;$('angle').max=CONFIG.camera.maxTilt;$('angle').value=state.angle;
 $('angle').addEventListener('input',e=>{state.angle=+e.target.value;device.optics.rotation.x=-THREE.MathUtils.degToRad(state.angle);$('angleValue').textContent=state.angle+'°';const l=device.labels.find(l=>l.element.textContent.startsWith('OV2640'));if(l)l.element.textContent='OV2640 · เงย '+state.angle+'°';});
 for(const id of ['transparent','labels','fov','torso','openFront','dimensions'])$(id).addEventListener('change',e=>{state[id]=e.target.checked;applyVisibility();updateInspection();if(id==='torso')setView('fit');});
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
 $('pendantModeToggle').addEventListener('click',()=>pendantMode?exitPendantMode():enterPendantMode());
 $('pendantExit').addEventListener('click',exitPendantMode);
 fillPendantSelects();syncPendantButtons();
 for(const [id,key] of [['pendantDesign','design'],['pendantCompareDesign','compare'],['pendantScenario','scenario'],['pendantDrop','drop']])$(id).addEventListener('change',event=>{
  pendantPick[key]=key==='drop'?Number(event.target.value):event.target.value;pendantElapsed=0;if(pendantPlaying)pendantStartedAt=simulationTimer.getElapsed();if(pendantMode)rebuildPendantMode();else syncPendantButtons();
 });
 $('pendantPlay').addEventListener('click',()=>{
  if(!pendantMode)return;
  if(pendantPlaying){pendantElapsed=currentPendantElapsed();pendantPlaying=false;}
  else{pendantStartedAt=simulationTimer.getElapsed()-pendantElapsed/pendantSpeed;pendantPlaying=true;}
  syncPendantReadout();
 });
 $('pendantSpeed').addEventListener('change',event=>{
  const elapsed=currentPendantElapsed();pendantSpeed=Number(event.target.value)||1;pendantElapsed=elapsed;
  if(pendantPlaying)pendantStartedAt=simulationTimer.getElapsed()-elapsed/pendantSpeed;
  syncPendantReadout();
 });
 $('pendantTime').addEventListener('input',event=>setPendantElapsed(Number(event.target.value)/1000*pendantDuration));
 document.querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',()=>{try{exportPart(b.dataset.export);}catch(err){toast('ส่งออกไม่ได้: '+err.message);console.error(err);}}));
}
function resize() {const {width,height}=viewport.getBoundingClientRect();if(!width||!height)return;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);labelRenderer.setSize(width,height);}
new ResizeObserver(resize).observe(viewport);resize();rebuild();initUI();setView('iso',true);
function arrangeLabels() {
 const width=viewport.clientWidth,height=viewport.clientHeight;
 leaderSVG.style.display=state.labels?'block':'none';
 if(!state.labels)return;
 while(leaderSVG.children.length<device.labels.length){const l=document.createElementNS('http://www.w3.org/2000/svg','line');l.setAttribute('stroke','#739a8a');l.setAttribute('stroke-width','0.8');l.setAttribute('opacity','0.65');leaderSVG.appendChild(l);}
 while(leaderSVG.children.length>device.labels.length)leaderSVG.lastChild.remove();
 const anchors=device.labels.map((l,i)=>{let visible=l.visible;for(let o=l.parent;o;o=o.parent)visible=visible&&o.visible;leaderSVG.children[i].style.display=visible?'':'none';const p=l.getWorldPosition(new THREE.Vector3()).project(camera);return{l,i,visible,x:(p.x+1)*width/2,y:(1-p.y)*height/2,side:l.userData.side??([0,1,5,6,9].includes(i)?-1:1)};}).filter(a=>a.visible);
 for(const side of [-1,1]) {
  const entries=anchors.filter(a=>a.side===side).sort((a,b)=>a.y-b.y);
  entries.forEach((a,n)=>{
   const x=width*(side===-1?0.24:0.78),top=Math.min(height*0.3,150),bottom=height-105;
   const y=entries.length===1?(top+bottom)/2:top+n*(bottom-top)/(entries.length-1);
   a.l.element.style.marginLeft=(x-a.x)+'px';a.l.element.style.marginTop=(y-a.y)+'px';
   const line=leaderSVG.children[a.i];line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',x-side*a.l.element.offsetWidth/2);line.setAttribute('y2',y);
  });
 }
}
// กันป้ายขนาดทับกันเมื่อจอแคบหรือหมุนโมเดล
function arrangeDimensions() {
 if(!state.dimensions)return;const w=viewport.clientWidth,h=viewport.clientHeight,placed=[];
 const entries=dimensionGroup.children.filter(o=>o.isCSS2DObject).map(o=>{const p=o.getWorldPosition(new THREE.Vector3()).project(camera);return{o,x:(p.x+1)*w/2,y:(1-p.y)*h/2,width:o.element.offsetWidth,height:o.element.offsetHeight};}).sort((a,b)=>a.y-b.y);
 for(const e of entries){e.tx=Math.max(e.width/2+8,Math.min(w-e.width/2-8,e.x));e.ty=Math.max(70,Math.min(h-100,e.y));for(const other of placed)if(Math.abs(e.tx-other.tx)<(e.width+other.width)/2+5&&Math.abs(e.ty-other.ty)<(e.height+other.height)/2+5)e.ty=other.ty+(e.height+other.height)/2+5;placed.push(e);}
 const shift=Math.max(0,...placed.map(e=>e.ty+e.height/2-(h-85)));for(const e of placed){e.o.element.style.marginLeft=(e.tx-e.x)+'px';e.o.element.style.marginTop=(e.ty-shift-e.y)+'px';}
}
$('loadStatus').hidden=true;window.__viewerReady=true;
window.__viewer={state,computeLayout,computeMeasurements,get device(){return device;},get dimensionGroup(){return dimensionGroup;},get pendantMode(){return pendantMode;},pendantData,pendantPick,enterPendantMode,exitPendantMode,setPendantElapsed,exportPart,renderer,scene,camera,rebuild};
renderer.setAnimationLoop(()=>{
 simulationTimer.update();
 if(cameraTween){const q=Math.min((performance.now()-cameraTween.start)/550,1),t=1-(1-q)**3;camera.position.lerpVectors(cameraTween.from,cameraTween.to,t);controls.target.lerpVectors(cameraTween.fromTarget,cameraTween.toTarget,t);if(q===1)cameraTween=null;}
 if(pendantMode)syncPendantReadout();
 controls.update(simulationTimer.getDelta());renderer.render(scene,camera);arrangeLabels();arrangeDimensions();labelRenderer.render(scene,camera);
});

function computeLayout(batteryKey,variant='clip') {
  const c=CONFIG.case, b=CONFIG.batteries[batteryKey], board=CONFIG.board;
  const service=variant==='pendant'?CONFIG.v2.pendantBatteryClearance:c.sideService,bayGap=variant==='pendant'?CONFIG.v2.pendantBatteryClearance:c.bayGap;
  const recessWidth=variant==='pendant'?CONFIG.v2.rearPad.width+0.2:0;
  const screwSafeWidth=variant==='pendant'?2*(c.screwInset+board.width/2-CONFIG.v2.ledge.under+CONFIG.v2.ledge.width+CONFIG.v2.ledge.lip+c.bossDiameter/2+0.2):0;
  const w=Math.max(board.width,b.width+2*service,recessWidth,screwSafeWidth)+2*c.wall;
  const h=board.height+b.height+bayGap+c.usbBay+2*(c.wall+c.endClearance);
  const d=2*c.wall+board.stackHeight+c.depthClearance+c.tiltReserve+(variant==='pendant'?0:1.5); // Preserve the previous non-pendant magnet/clip reserve after stackHeight was measured 1.5 mm thinner.
  const boardY=h/2-c.wall-c.endClearance-board.height/2;
  return {w,h,d,battery:b,boardY,batteryY:boardY-board.height/2-bayGap-b.height/2,batteryClearance:service,bayGap,
    batteryZ:-d/2+c.wall+CONFIG.battery.rearClearance+b.depth/2,
    cameraY:boardY+CONFIG.camera.y, micY:boardY+board.mic.y,
    screws:[-1,1].flatMap(x=>[-1,1].map(y=>({x:x*(w/2-c.screwInset),y:y*(h/2-c.screwInset),r:c.screwHole/2}))) };
}
// GEOMETRY HELPERS
function mat(color,extra={}) { return new THREE.MeshStandardMaterial({color,roughness:0.65,metalness:0.05,...extra}); }
function roundedShape(w,h,r,cx=0,cy=0) {
  r=Math.min(r,w/2,h/2);const s=new THREE.Shape(),x=cx-w/2,y=cy-h/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);s.closePath();return s;
}
function roundHole(x,y,r) {const p=new THREE.Path();p.absarc(x,y,r,0,Math.PI*2,true);return p;}
function extrude(shape,depth) {return new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:12,steps:1});}
function mesh(g,m,parent,pos=[0,0,0]) {const o=new THREE.Mesh(g,m);o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;if(parent)parent.add(o);return o;}
function box(size,m,parent,pos) {return mesh(new THREE.BoxGeometry(...size),m,parent,pos);}
function rounded(w,h,d,r,m,parent,pos=[0,0,0]) {const g=extrude(roundedShape(w,h,r),d);g.translate(0,0,-d/2);return mesh(g,m,parent,pos);}
function cylinder(r,h,m,parent,pos=[0,0,0]) {const g=new THREE.CylinderGeometry(r,r,h,40);g.rotateX(Math.PI/2);return mesh(g,m,parent,pos);}
function countersink(C,m,parent,pos,faceZ) {
 const outer=C.screw.countersink/2,inner=C.screw.throughHole/2,depth=(C.screw.countersink-C.screw.throughHole)/2,overlap=1.2;
 const g=new THREE.LatheGeometry([new THREE.Vector2(inner,-depth),new THREE.Vector2(outer+overlap,-depth),new THREE.Vector2(outer+overlap,0),new THREE.Vector2(outer,0),new THREE.Vector2(inner,-depth)],48);
 g.rotateX(Math.PI/2);const o=mesh(g,m,parent,[pos.x,pos.y,faceZ]);o.name='m2-countersink-90deg';o.userData={countersinkDiameter:C.screw.countersink,throughDiameter:C.screw.throughHole,depth};return o;
}
function annulus(outer,inner,h,m,parent,pos) {const s=new THREE.Shape();s.absarc(0,0,outer,0,Math.PI*2,false);s.holes.push(roundHole(0,0,inner));const g=extrude(s,h);g.translate(0,0,-h/2);return mesh(g,m,parent,pos);}
function chamferedAnnulus(outer,inner,h,chamfer,m,parent,pos) {
 const profile=[
  [inner+chamfer,-h/2],[outer,-h/2],[outer,h/2],[inner+chamfer,h/2],
  [inner,h/2-chamfer],[inner,-h/2+chamfer],[inner+chamfer,-h/2]
 ].map(([r,z])=>new THREE.Vector2(r,z));
 const g=new THREE.LatheGeometry(profile,64);g.rotateX(Math.PI/2);
 const o=mesh(g,m,parent,pos);o.userData={holeDiameter:inner*2,outerDiameter:outer*2,chamfer};return o;
}
function tube(points,r,m,parent) {const c=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(new THREE.TubeGeometry(c,28,r,8,false),m,parent);}
// โค้งเฉพาะหัวมุม ไม่โก่งเลยแนวทางเดินสาย
function routedTube(points,r,bend,m,parent) {
 const pts=points.map(p=>new THREE.Vector3(...p)),path=new THREE.CurvePath();let last=pts[0];
 for(let i=1;i<pts.length-1;i++){const p=pts[i],a=pts[i-1],b=pts[i+1],cut=Math.min(bend,p.distanceTo(a)/3,p.distanceTo(b)/3),entry=p.clone().lerp(a,cut/p.distanceTo(a)),leave=p.clone().lerp(b,cut/p.distanceTo(b));path.add(new THREE.LineCurve3(last,entry));path.add(new THREE.QuadraticBezierCurve3(entry,p,leave));last=leave;}
 path.add(new THREE.LineCurve3(last,pts.at(-1)));return mesh(new THREE.TubeGeometry(path,96,r,8,false),m,parent);
}
function label(parent,text,pos,tone='') {const el=document.createElement('div');el.className='part-label '+tone;el.textContent=text;const o=new CSS2DObject(el);o.position.set(...pos);parent.add(o);return o;}
function wireRibbon(points,width,thickness,material,parent) {
 const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal'),n=48,pos=[],idx=[],X=new THREE.Vector3(1,0,0);
 for(let i=0;i<=n;i++) {
  const c=path.getPoint(i/n),t=path.getTangent(i/n),nrm=new THREE.Vector3().crossVectors(t,X).normalize();
  for(const [sx,sn] of [[-1,-1],[1,-1],[1,1],[-1,1]]) pos.push(c.x+sx*width/2*X.x+sn*thickness/2*nrm.x,c.y+sn*thickness/2*nrm.y,c.z+sn*thickness/2*nrm.z);
 }
 for(let i=0;i<n;i++)for(let k=0;k<4;k++){const a=i*4+k,b=i*4+(k+1)%4,c=a+4,d=b+4;idx.push(a,b,c,b,d,c);}
 idx.push(0,2,1,0,3,2);const e=n*4;idx.push(e,e+1,e+2,e,e+2,e+3);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
 const m=mesh(g,material,parent);m.userData.ribbon=true;return m;
}
function group(parent,name) {const g=new THREE.Group();g.name=name;parent.add(g);return g;}
// v2p = รุ่น 2 ชุดที่สั่งพิมพ์แล้ว ต่างจาก v2 แค่ที่ยึดสายคล้องคอ
const isV2=version=>version==='v2'||version==='v2p';
function buildDevice(state,withLabels=true) {
 const cardboard=state.version==='v1';if(cardboard)state={...state,battery:1000,variant:'hooks'};
 const p=computeLayout(state.battery,state.variant), C=CONFIG, c=C.case, col=C.colors, root=new THREE.Group(), v2=isV2(state.version);
 if(cardboard)Object.assign(p,{w:C.cardboard.width,h:C.cardboard.height,d:C.cardboard.depth,cardboard:true});
 const materials={front:mat(col.front),back:mat(col.back),pcb:mat(col.pcb),sense:mat(col.sense),
 battery:mat(col.battery),foil:mat(col.foil,{metalness:0.6,roughness:0.32}),camera:mat(col.camera),
 glass:mat(col.glass,{metalness:0.5,roughness:0.15}),copper:mat(col.copper),metal:mat(col.metal,{metalness:0.65}),
 button:mat(col.button),led:mat(col.led),mount:mat(col.mount),
 magnet:mat(col.magnet,{metalness:0.7}),wire:mat('#374452'),red:mat('#d45e49'),antenna:mat('#23252d'),foam:mat(col.foam,{roughness:1})};
 const front=group(root,'front'),back=group(root,'back'),board=group(root,'board'),battery=group(root,'battery'),mount=group(root,'mount');
 const cap=group(root,'cap'),hardware=group(root,'hardware'),details=group(root,'details');
 const frontHoles=[{x:C.camera.x,y:p.cameraY,r:C.camera.apertureDiameter/2},
 {x:0,y:C.button.y,r:(C.button.capDiameter+C.button.holeClearance)/2}];
 for(let i=0;i<C.microphone.count;i++) frontHoles.push({x:C.board.mic.x+(i-(C.microphone.count-1)/2)*C.microphone.pitch,y:p.micY,r:C.microphone.holeDiameter/2});
 const shellParams={w:p.w,h:p.h,d:p.d,wall:c.wall,radius:c.radius,bottomPort:{w:C.usb.openingWidth,h:C.usb.openingHeight,z:C.usb.z},
 sidePort:v2?null:{w:C.board.sd.serviceLength,h:C.board.sd.openingDepth,y:p.boardY+C.board.sd.y,z:C.board.sd.z},
 screws:p.screws.map(s=>front?{...s,r:C.screw.countersink/2,throughRadius:C.screw.throughHole/2,countersinkDepth:(C.screw.countersink-C.screw.throughHole)/2}:s),
 recesses:state.variant==='pendant'&&C.v2.rearPad.depth>0?[{x:0,y:p.batteryY,width:C.v2.rearPad.width,height:C.v2.rearPad.height,depth:C.v2.rearPad.depth}]:[],frontFaceThickness:front?2.2:undefined};
 if(!cardboard){
 const frontShell=mesh(makeShell(THREE,{...shellParams,front:true,holes:frontHoles,recesses:[]}),materials.front,front);
 front.userData.microphonePorts=frontHoles.slice(2).map(({x,y,r})=>({x,y,r}));
 frontShell.name='front-shell';
 if(v2&&state.variant==='pendant') {
  // ท่อรับเสียงของชุด pendant ต่อจากผิวในฝาหน้าถึงเหนือรูไมค์; ผนัง ≥1.2 มม.
  const micPart=C.board.mic,duct=C.microphone,ductShape=roundedShape(duct.ductWidth,duct.ductHeight,0.35);
  ductShape.holes.push(roundHole(0,0,duct.ductBoreDiameter/2));
  const ductEnd=p.d/2-shellParams.frontFaceThickness+0.15,ductStart=ductEnd-duct.ductLength;
  const micDuct=mesh(extrude(ductShape,ductEnd-ductStart),materials.front,front,[micPart.x,p.micY,ductStart]);
  micDuct.name='microphone-duct';micDuct.userData={boreDiameter:duct.ductBoreDiameter,minWall:(Math.min(duct.ductWidth,duct.ductHeight)-duct.ductBoreDiameter)/2};
 }
 mesh(makeShell(THREE,{...shellParams,front:false,holes:[]}),materials.back,back);

 // M2 pillars support the case only: there are no invented PCB screw holes.
 for(const s of p.screws) {
  annulus(c.bossDiameter/2,c.bossPilot/2,p.d/2-c.wall+c.bossOverlap,materials.back,back,[s.x,s.y,-(p.d/2-c.wall+c.bossOverlap)/2]);

  cylinder(C.screw.headDiameter/2,C.screw.headDepth,materials.metal,hardware,[s.x,s.y,p.d/2+C.screw.headDepth/2]);
 }
 }
 // Upper XIAO PCB and stacked Sense expansion board; coordinates approximate.
 buildXiaoDetail(p,C,materials,board);
 const S=o=>{o.userData.sense=true;return o;};
 S(rounded(C.board.senseWidth,C.board.senseHeight,C.board.senseThickness,C.board.senseRadius,materials.sense,board,[0,p.boardY,C.board.senseZ])).name='sense-pcb';
 // Sense card socket stays ON the board; a side tunnel reaches its insertion axis.
 const sd=C.board.sd;
 buildSenseDetail(p,C,materials,board,S);
 const mic=C.board.mic;
 S(box([mic.width,mic.height,mic.depth],materials.metal,board,[mic.x,p.micY,C.board.senseZ+C.board.senseThickness/2+mic.depth/2]));
 S(cylinder(C.microphone.holeDiameter/2,C.camera.glassDepth,materials.camera,board,[mic.x,p.micY,C.board.senseZ+C.board.senseThickness/2+mic.depth]));
 // Camera optical axis +Z rotates toward +Y when x rotation is negative.
 const optics=S(group(board,'optics'));optics.position.set(C.camera.x,p.cameraY,C.camera.z);optics.rotation.x=cardboard?0:-THREE.MathUtils.degToRad(state.angle);
 box(C.camera.sensor,materials.camera,optics,[0,0,0]);
 cylinder(C.camera.bezelDiameter/2,C.camera.sensor[2],materials.camera,optics,[0,0,C.camera.sensor[2]]);
 cylinder(C.camera.lensDiameter/2,C.camera.lensLength,materials.camera,optics,[0,0,C.camera.sensor[2]/2+C.camera.lensLength/2]);
 cylinder(C.camera.lensDiameter*0.39,C.camera.glassDepth,materials.glass,optics,[0,0,C.camera.sensor[2]/2+C.camera.lensLength+C.camera.glassDepth/2]);
 for(let i=0;i<C.detail.lensRings;i++)annulus(C.camera.lensDiameter/2+C.detail.lensThread,C.camera.lensDiameter/2,C.detail.lensThread,materials.camera,optics,[0,0,C.camera.sensor[2]/2+(i+1)*C.camera.lensLength/(C.detail.lensRings+1)]).name='lens-thread';
 const rb=C.camera.ribbon,sdTop=C.board.sd.z+C.board.sd.depth/2+C.board.sd.card[2]/2+rb.sdClearance,senseTop=C.board.senseZ+C.board.senseThickness/2+rb.padLift,sdEdgeY=p.boardY+C.board.sd.y-C.board.sd.height/2;
 wireRibbon([[C.camera.x,p.cameraY,C.camera.z-C.camera.sensor[2]/2],[C.camera.x+1,p.cameraY-rb.dropStep,sdTop],[C.camera.x+2,p.boardY+C.board.sd.y,sdTop],[rb.endX-0.5,sdEdgeY-rb.edgeMargin,sdTop],[rb.endX,sdEdgeY-rb.edgeMargin-rb.descent,(sdTop+senseTop)/2],[rb.endX,p.boardY+rb.endY,senseTop]],C.camera.ribbonWidth,C.camera.ribbonThickness,materials.copper,board);
 const fov=group(optics,'fov'),fl=C.camera.fovLength,fr=fl*Math.tan(THREE.MathUtils.degToRad(C.camera.fov/2));
 const fovMesh=mesh(new THREE.ConeGeometry(fr,fl,64,1,true),new THREE.MeshBasicMaterial({color:'#63b6a6',transparent:true,opacity:0.10,side:THREE.DoubleSide,depthWrite:false}),fov,[0,0,fl/2+C.camera.lensLength]);fovMesh.rotation.x=-Math.PI/2;
 const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:80},(_,i)=>new THREE.Vector3(fr*Math.cos(i*Math.PI/40),fr*Math.sin(i*Math.PI/40),fl+C.camera.lensLength))),new THREE.LineBasicMaterial({color:'#56a696',transparent:true,opacity:0.5}));fov.add(ring);
 fov.visible=state.fov;
 // รูไมค์เปิดตรงทะลุผนังหน้า แทนท่อผนังบางที่ไม่เหมาะกับ FDM
 const b=p.battery;
 rounded(b.width,b.height,b.depth,C.battery.foilRadius,materials.foil,battery,[0,p.batteryY,p.batteryZ]).name='battery-pouch';
 rounded(b.width-C.battery.tapeDepth*2,b.height-C.battery.tapeHeight*2,C.battery.tapeDepth,C.battery.foilRadius,materials.battery,battery,[0,p.batteryY,p.batteryZ+b.depth/2]);
 for(const sign of [-1,1]) box([b.width+C.battery.tapeDepth,C.battery.tapeHeight+C.battery.tapeDepth,b.depth+C.battery.tapeDepth],materials.battery,battery,[0,p.batteryY+sign*(b.height-C.battery.tapeHeight)/2,p.batteryZ]);
 buildBatteryDetail(p,C,materials,battery);
 const wiring=cardboard?{labels:[]}:buildWiring(p,C,materials,{board,battery,details},withLabels);
 if(!cardboard)S(buildTactile(C,materials,details,[0,C.button.y,C.button.switchZ]));
 if(!cardboard){
 cylinder(C.button.capDiameter/2,C.button.capDepth,materials.button,cap,[0,C.button.y,p.d/2+C.button.capDepth/2]);
 cylinder(C.button.capStemDiameter/2,C.button.capStemLength,materials.button,cap,[0,C.button.y,p.d/2-C.button.capStemLength/2]);
 cylinder(C.button.capFlangeDiameter/2,C.button.capFlangeDepth,materials.button,cap,[0,C.button.y,p.d/2-c.wall-C.button.capFlangeDepth/2]);
 }
 // Lower charge-only socket bay and routing allowance. Wiring is a visual concept.
 const usb=C.usb;
 if(!cardboard){
 box(usb.pcb,materials.pcb,details,[0,-p.h/2+c.wall+usb.pcb[1]/2,usb.z-usb.socket[2]/2]).name='charge-breakout';
 const socket=rounded(usb.socket[0],usb.socket[2],usb.socket[1],usb.socket[2]/2,materials.metal,details,[0,-p.h/2+usb.socket[1]/2,usb.z]);socket.rotation.x=Math.PI/2;
 box([usb.socket[0]-2*C.camera.glassDepth,C.camera.glassDepth,usb.socket[2]-2*C.camera.glassDepth],materials.camera,details,[0,-p.h/2-C.camera.glassDepth,usb.z]);
 const wireX=p.w/2-c.wall-C.battery.wireSideOffset,wirePath=dx=>[[usb.pcb[0]/2+dx,-p.h/2+c.wall+usb.pcb[1],usb.z],[wireX+dx,0,usb.z],[wireX+dx,p.boardY-C.board.height/2-C.case.bayGap/2,C.board.baseZ],[dx,p.boardY-C.board.height/2,C.board.baseZ]];
 if(!v2) tube(wirePath(0),usb.wireRadius,materials.wire,details);
 if(v2) buildV2(p,C,materials,{front,back,board,details},wirePath,wireX,wiring,state.variant);
 }
 // Adhesive antenna in a non-metal side bay.
 buildAntennaDetail(p,C,materials,board,cardboard,state.variant);
 let mountThickness=0, shirtZ=-p.d/2-C.torso.shirtThickness-C.magnet.shirtGap;
 if(cardboard)buildCardboard(p,C,materials,{front,back,mount,details,board,battery},wiring,withLabels);
 else if(state.variant==='clip') {
  const q=C.clip,hingeY=Math.min(q.hingeY,p.h/2-q.hingeOuter),hingeZ=-p.d/2-q.hingeOuter/2;
  // A single holed profile joins each barrel to its support. A separate solid
  // bridge would block the pin hole. Local profile axes map to world Y and Z.
  function hingeProfile(length,reach,towardCase,parent,material,x,name) {
   const r=q.hingeOuter/2,s=new THREE.Shape();
   if(towardCase) {
    s.moveTo(-r,reach);s.lineTo(-r,0);s.absarc(0,0,r,Math.PI,Math.PI*2,false);s.lineTo(r,reach);s.closePath();
   } else {
    s.moveTo(-r,-reach);s.lineTo(r,-reach);s.lineTo(r,0);s.absarc(0,0,r,0,Math.PI,false);s.closePath();
   }
   s.holes.push(roundHole(0,0,q.pinDiameter/2));
   const g=extrude(s,length);g.translate(0,0,-length/2);
   g.applyMatrix4(new THREE.Matrix4().set(0,0,1,0, 1,0,0,0, 0,1,0,0, 0,0,0,1));
   const part=mesh(g,material,parent,[x,hingeY,hingeZ]);part.name=name;
   return part;
  }
  // The two end knuckles leave the middle free for the metal torsion coil.
  const arm=rounded(q.width,q.length,q.thickness,q.thickness,materials.mount,mount,[0,hingeY-q.length/2+q.hingeOuter/2,-p.d/2-q.gap-q.thickness/2]);
  for(const sign of [-1,1]) hingeProfile(q.knuckleLength,q.gap+q.thickness-q.hingeOuter/2,false,mount,materials.mount,sign*(q.width-q.knuckleLength)/2,'hinge-clip-'+sign);
  box([q.width,q.tip,q.tip],materials.mount,mount,[0,hingeY-q.length+q.hingeOuter/2+q.tip/2,-p.d/2-q.gap+q.tip/2]);
  for(const sign of [-1,1]) hingeProfile((q.hingeWidth-q.width)/2,q.hingeOuter/2+c.bossOverlap,true,back,materials.back,sign*(q.width/2+(q.hingeWidth-q.width)/4),'hinge-back-'+sign);
  const pin=cylinder(q.pinDiameter/2,q.hingeWidth,materials.metal,hardware,[0,hingeY,hingeZ]);pin.rotation.y=Math.PI/2;
  tube(Array.from({length:97},(_,i)=>{const t=i/96;return [(t-0.5)*q.width/2,hingeY+Math.cos(t*q.springTurns*Math.PI*2)*q.springRadius,hingeZ+Math.sin(t*q.springTurns*Math.PI*2)*q.springRadius];}),q.springWire,materials.metal,hardware);
  mountThickness=q.gap+q.thickness;shirtZ=-p.d/2-q.gap+C.torso.shirtThickness/2;
 } else if(state.variant==='magnet') {
  const q=C.magnet,mY=p.boardY+q.y,plateZ=-p.d/2-q.shirtGap-C.torso.shirtThickness-q.plateDepth/2;
  const plate=roundedShape(q.plateWidth,q.plateHeight,q.plateRadius);
  // Through pockets with rear retention film; actual magnets are excluded from STL.
  for(const sign of [-1,1])plate.holes.push(roundHole(sign*q.separation/2,0,(q.diameter+q.pocketClearance)/2));
  const pg=extrude(plate,q.plateDepth);pg.translate(0,0,-q.plateDepth/2);mesh(pg,materials.mount,mount,[0,mY,plateZ]);
  rounded(q.plateWidth,q.plateHeight,q.retainer,q.plateRadius,materials.mount,mount,[0,mY,plateZ-q.plateDepth/2-q.retainer/2]);
  for(const sign of [-1,1]) {
   cylinder(q.diameter/2,q.depth,materials.magnet,hardware,[sign*q.separation/2,mY,-p.d/2+c.wall+q.depth/2]);
   cylinder(q.diameter/2,q.depth,materials.magnet,hardware,[sign*q.separation/2,mY,plateZ+(q.plateDepth-q.depth)/2]);
   annulus((q.diameter+q.pocketClearance)/2+c.wall,(q.diameter+q.pocketClearance)/2,q.depth,materials.back,back,[sign*q.separation/2,mY,-p.d/2+c.wall+q.depth/2-c.bossOverlap]);
  }
  mountThickness=q.shirtGap+C.torso.shirtThickness+q.plateDepth+q.retainer;
  shirtZ=-p.d/2-q.shirtGap-C.torso.shirtThickness/2;
 } else if(state.version==='v2p') {
  // รุ่นที่สั่งพิมพ์แล้ว: ห่วงตะขอ 2 ห่วง (โค้ดเดิมก่อน Rev 3)
  const q=C.pendant,e=q.eyes,outer=e.outerDiameter/2,inner=e.holeDiameter/2,y=p.h/2+e.topOffset,z=-p.d/2+q.thickness/2;
  for(const x of [-e.x,e.x]) chamferedAnnulus(outer,inner,q.thickness,e.chamfer,materials.back,back,[x,y,z]).name='pendant-lanyard-eyelet';
 } else {
  const lug=C.pendant.lug,baseY=p.h/2,tabBottom=baseY-1.5,tabTop=baseY+lug.tabLength;
  const tabShape=new THREE.Shape(),half=p.w/2,r=Math.min(C.case.radius,half,lug.tabLength/2+0.75),topR=Math.min(lug.topRadius??1,half),cornerX=Math.max(half-topR,lug.slotX+lug.slot[0]/2+1);
  tabShape.moveTo(-half,tabBottom+r);tabShape.quadraticCurveTo(-half,tabBottom,-half+r,tabBottom);
  tabShape.lineTo(half-r,tabBottom);tabShape.quadraticCurveTo(half,tabBottom,half,tabBottom+r);
  tabShape.lineTo(half,tabTop-topR);tabShape.quadraticCurveTo(half,tabTop,cornerX,tabTop); // มุมโค้งจบที่ขอบร่องแท่ง ไม่ให้เส้นขอบย้อนทับกัน
  const notchSides=[-lug.slotX,lug.slotX].map(x=>[x-lug.slot[0]/2-1,x-lug.slot[0]/2,x+lug.slot[0]/2,x+lug.slot[0]/2+1]).sort((a,b)=>b[0]-a[0]);
  const slotY=tabTop-lug.barRecess-lug.barWidth-lug.slot[1]/2,slotBottom=slotY-lug.slot[1]/2,slotTop=slotY+lug.slot[1]/2;
  for(const [recessLeft,slotLeft,slotRight,recessRight] of notchSides){
   tabShape.lineTo(recessRight,tabTop);tabShape.lineTo(recessRight,tabTop-lug.barRecess);
   tabShape.lineTo(slotRight,tabTop-lug.barRecess);tabShape.lineTo(slotRight,slotBottom+lug.slotRadius);
   tabShape.quadraticCurveTo(slotRight,slotBottom,slotRight-lug.slotRadius,slotBottom);
   tabShape.lineTo(slotLeft+lug.slotRadius,slotBottom);tabShape.quadraticCurveTo(slotLeft,slotBottom,slotLeft,slotBottom+lug.slotRadius);
   tabShape.lineTo(slotLeft,tabTop-lug.barRecess);tabShape.lineTo(recessLeft,tabTop-lug.barRecess);tabShape.lineTo(recessLeft,tabTop);
  }
  tabShape.lineTo(-cornerX,tabTop);tabShape.quadraticCurveTo(-half,tabTop,-half,tabTop-topR);tabShape.lineTo(-half,tabBottom+r);tabShape.closePath();
  const depth=p.d/2,tabGeo=extrude(tabShape,depth);tabGeo.translate(0,0,0);
  const tab=mesh(tabGeo,materials.back,back,[0,0,-p.d/2]);tab.name='pendant-lanyard-tab';
  tab.userData={width:p.w,tabLength:lug.tabLength,slot:[...lug.slot],slotX:lug.slotX,slotRadius:lug.slotRadius,
    barWidth:lug.barWidth,barDepth:Math.min(lug.barDepth,depth),barRecess:lug.barRecess,slotY,slotTop,tabTop,depth};
  for(const x of [-lug.slotX,lug.slotX]){
   const bar=box([lug.slot[0]+2,lug.barWidth,Math.min(lug.barDepth,depth)],materials.back,back,
    [x,(slotTop+tabTop-lug.barRecess)/2,-p.d/2+Math.min(lug.barDepth,depth)/2]);
   bar.name='pendant-lanyard-bar';bar.userData={x,width:lug.slot[0]+2,barWidth:lug.barWidth,barDepth:Math.min(lug.barDepth,depth),barRecess:lug.barRecess,slotTop,tabTop};
  }
 }
 // Sectional shirt patch is visible even with the full torso switched off.
 const shirt=rounded(C.magnet.plateWidth+C.case.sideService*2,C.magnet.plateHeight+C.case.sideService*2,C.torso.shirtThickness,C.magnet.plateRadius,mat(col.shirt,{transparent:true,opacity:0.68,side:THREE.DoubleSide}),root,[0,p.boardY+C.magnet.y,shirtZ]);shirt.name='shirt';shirt.visible=state.variant==='magnet'&&!state.torso;
 const labels=[];
 if(withLabels) {
  labels.push(label(front,cardboard?'กล่องกระดาษ · ขนาดประมาณ':'ฝาหน้า · ผนัง '+c.wall+' มม.',[-p.w/2, -p.h/2+8,p.d/2]));
  labels.push(label(board,'บอร์ด XIAO + Sense',[ -C.board.width/2,p.boardY,C.board.senseZ]));
  labels.push(label(optics,'OV2640 · เงย '+(cardboard?0:state.angle)+'°',[0,0,C.camera.lensLength]));
  labels.push(label(battery,state.battery===1200?'LiPo 34×54×6 มม.':'LiPo '+state.battery+' mAh',[b.width/2,p.batteryY,p.batteryZ]));
  labels.push(label(board,'LED ใช้ไม่ได้ · GPIO21 ร่วมกับ SD',[C.led.x,p.boardY+C.led.y,C.board.baseZ]));
  labels.push(label(details,'ช่องไมค์บน Sense',[mic.x,p.micY,p.d/2]));
  labels.push(label(details,cardboard?'สาย USB ออกด้านบน':v2?'ช่องชาร์จแยก · 5.1kΩ + ไดโอด → 5V':'USB-C · ชาร์จผ่านสายต่อ',[cardboard?C.cardboard.usbX:0,cardboard?p.h/2:-p.h/2,usb.z]));
  labels.push(label(board,v2?'microSD · โฟมกันการ์ดเลื่อน':cardboard?'microSD · ยังไม่มีตัวกันหลุด':'microSD · ช่องเข้าถึงด้านข้าง',[sd.x,p.boardY+sd.y,sd.z]));
  labels.push(label(back,cardboard?'รอยพับและเทป · ตำแหน่งประมาณ':'ฝาหลัง + เสา M2',[-p.w/2,-p.h/2+8,-p.d/2]));
  labels.push(label(cardboard?details:cap,cardboard?'ปุ่ม 6×6 ภายนอก → JST':'ปุ่มอัดคลิป + เสียง',cardboard?[p.w/2,C.cardboard.button.y,C.cardboard.button.z]:[0,C.button.y,p.d/2+C.button.capDepth]));
  labels.push(label(cardboard?details:board,cardboard?'เสาอากาศแบนภายนอก · ต่อ U.FL':'เสาอากาศแบน + สาย U.FL',cardboard?[C.cardboard.antenna.x,C.cardboard.antenna.y,p.d/2+C.cardboard.antenna.gap]:[-p.w/2+c.wall,p.batteryY,-p.d/2]));
  if(v2) {
   labels.push(label(front,'ผนังกันการ์ดหลุด + โฟม',[C.board.sd.x+C.board.sd.card[1]/2+C.v2.sdStop.foam,p.boardY+C.board.sd.y,p.d/2-c.wall]));
   labels.push(label(back,'ขารองมุมบอร์ด ×4',[C.v2.ledge.inset+C.v2.ledge.width/2,p.boardY+C.board.height/2-C.v2.ledge.length/2,C.board.baseZ-C.board.pcb/2]));
   labels.push(label(details,'ไดโอด 1N5817',[p.w/2-c.wall-C.battery.wireSideOffset,0,0]));
  }
  labels.push(...wiring.labels);
  if(state.variant!=='pendant') labels.push(label(mount,cardboard?'ตะขอสองข้าง · รูปทรงประมาณ':state.variant==='clip'?'คลิป + สปริงโลหะ':'แผ่นแม่เหล็กด้านในเสื้อ',[cardboard?p.w/2:0,p.boardY+C.magnet.y,-p.d/2-mountThickness]));
 }
 const parts={front,back,board,battery,mount,cap,hardware,details};
 return {root,p,materials,parts,labels,optics,fov,shirt,shirtZ,mountThickness,exportParts:cardboard?{}:{front,back,mount:state.variant==='pendant'?null:mount,cap}};
}
// ขอบบอร์ดเว้าจริง พร้อมผิวชุบทองครึ่งรู
function buildXiaoDetail(p,C,m,board) {
 const B=C.board,D=C.detail,r=D.castellation.radius,w=B.width/2,h=B.height/2,s=new THREE.Shape(),ys=Array.from({length:B.pinCount},(_,i)=>(i-(B.pinCount-1)/2)*B.pinPitch);
 s.moveTo(-w,-h);s.lineTo(w,-h);for(const y of ys){s.lineTo(w,y-r);s.absarc(w,y,r,-Math.PI/2,-3*Math.PI/2,true);}s.lineTo(w,h);s.lineTo(-w,h);
 for(const y of [...ys].reverse()){s.lineTo(-w,y+r);s.absarc(-w,y,r,Math.PI/2,-Math.PI/2,true);}s.lineTo(-w,-h);s.closePath();
 const g=extrude(s,B.pcb);g.translate(0,0,-B.pcb/2);mesh(g,m.pcb,board,[0,p.boardY,B.baseZ]).name='xiao-pcb';
 for(const side of [-1,1])for(const y of ys){
  const a=side>0?Math.PI/2:-Math.PI/2,t=new THREE.Shape(),outer=r+D.castellation.plating;
  t.absarc(0,0,outer,a,a+Math.PI,false);t.lineTo(r*Math.cos(a+Math.PI),r*Math.sin(a+Math.PI));t.absarc(0,0,r,a+Math.PI,a,true);t.closePath();
  mesh(extrude(t,B.pcb+B.pad[2]),m.copper,board,[side*w,p.boardY+y,B.baseZ-B.pcb/2-B.pad[2]/2]).name='castellation';
 }
 const shield=rounded(...B.shield,D.shieldRadius,m.metal,board,[0,p.boardY+B.shieldY,B.baseZ-B.pcb/2-B.shield[2]/2]);shield.name='rf-shield';
 const marking=surfaceText('ESP32-S3\nseeed studio',B.shield[0]*.85,B.shield[1]*.7,board,[0,p.boardY+B.shieldY,B.baseZ-B.pcb/2-B.shield[2]-.02],'#3e4a50');if(marking)marking.rotation.y=Math.PI;
 const q=D.b2b,b2b=group(board,'b2b');b2b.userData.sense=true;const bz=(B.baseZ+B.pcb/2+B.senseZ-B.senseThickness/2)/2;
 for(const z of [-1,1])box([q.size[0],q.size[1],(q.matedHeight-q.seam)/2],m.camera,b2b,[q.x,p.boardY+q.y,bz+z*(q.matedHeight+q.seam)/4]);
 for(const side of [-1,1])for(let i=0;i<q.count;i++)box(q.pin,m.copper,b2b,[q.x+(i-(q.count-1)/2)*q.pitch,p.boardY+q.y+side*q.size[1]/2,bz]);
 const u=B.usb,t=D.usbWall,profile=roundedShape(u[0],u[2],B.usbRadius);profile.holes.push(new THREE.Path(roundedShape(u[0]-2*t,u[2]-2*t,B.usbRadius-t).getPoints()));
 const ug=extrude(profile,u[1]);ug.translate(0,0,-u[1]/2);const socket=mesh(ug,m.metal,board,[0,p.boardY-h+u[1]/2,B.baseZ-u[2]/2]);socket.rotation.x=Math.PI/2;socket.name='xiao-usb-shell';
 box([D.usbTongue[0],u[1]-t,D.usbTongue[2]],m.camera,board,[0,p.boardY-h+u[1]/2,B.baseZ-u[2]/2]);
 for(let i=0;i<10;i++)box(D.contact,m.copper,board,[(i-4.5)*D.contactPitch,p.boardY-h+D.contact[1]/2+t,B.baseZ-u[2]/2+D.usbTongue[2]/2]);
 // เซรามิกเล็กนอกพื้นที่ขั้วต่อและแผ่น BAT
 for(let i=0;i<4;i++)box(D.passive,m.metal,board,[2+i*D.passivePitch,p.boardY-1,B.baseZ+B.pcb/2+D.passive[2]/2]);
}
// ซ็อกเก็ต SD เป็นฝาโลหะบาง การ์ดมีบ่าและรอยบาก
function buildSenseDetail(p,C,m,board,S) {
 const sd=C.board.sd,D=C.detail,t=D.sdMetal,cz=sd.z+sd.depth/2,top=cz+sd.card[2]/2+D.sdRoofGap+t/2;
 const shell=S(group(board,'sd-shell')),roof=roundedShape(sd.width,sd.height,C.board.senseRadius);
 for(const y of [-1,1])roof.holes.push(new THREE.Path(roundedShape(...D.sdWindow,t,sd.x*0,y*(sd.height/2-D.sdWindow[1])).getPoints()));
 mesh(extrude(roof,t),m.metal,shell,[sd.x,p.boardY+sd.y,top-t/2]);
 box([sd.width,sd.height,t],m.camera,shell,[sd.x,p.boardY+sd.y,sd.z-sd.depth/2]);
 for(const sign of [-1,1])box([sd.width,t,top-(sd.z-sd.depth/2)],m.metal,shell,[sd.x,p.boardY+sd.y+sign*(sd.height-t)/2,(top+sd.z-sd.depth/2)/2]);
 const x=sd.card[0]/2,y=sd.card[1]/2,[nx,ny]=D.sdNotch,s=new THREE.Shape();
 s.moveTo(-x,-y+ny);s.lineTo(-x+nx,-y);s.lineTo(x,-y);s.lineTo(x,y);s.lineTo(-x+nx,y);s.lineTo(-x+nx,y-ny);s.lineTo(-x,y-ny);s.closePath();
 const cardY=sd.y+sd.cardOffsetY;
 const cg=extrude(s,sd.card[2]);cg.translate(0,0,-sd.card[2]/2);const card=S(mesh(cg,m.camera,board,[sd.x,p.boardY+cardY,cz]));card.name='sd-card';
 for(let i=0;i<D.sdContacts;i++){const contact=S(box(D.sdContact,m.copper,board,[sd.x+(i-(D.sdContacts-1)/2)*D.sdContactPitch,p.boardY+cardY+sd.card[1]/2-D.sdContact[0]/2-D.sdNotch[0],cz-sd.card[2]/2-D.sdContact[2]/2]));contact.name='sd-contact';}
 const f=D.fpc,fc=S(group(board,'camera-fpc'));box(f.size,m.metal,fc,[C.camera.ribbon.endX,p.boardY+f.y,C.board.senseZ+C.board.senseThickness/2+f.size[2]/2]);
 box(f.latch,m.camera,fc,[C.camera.ribbon.endX,p.boardY+f.y+f.size[1]/2-f.latch[1]/2,C.board.senseZ+C.board.senseThickness/2+f.size[2]+f.latch[2]/2]);
}
function buildBatteryDetail(p,C,m,battery) {
 const q=C.battery,b=p.battery,top=p.batteryY+b.height/2,z=p.batteryZ+b.depth/2;
 box(q.protection,m.pcb,battery,[0,top-q.protection[1]/2,z+q.protectionLift]).name='battery-protection';
 for(const sign of [-1,1])box(q.tab,m.metal,battery,[sign*q.tabX,top-q.tab[1]/2,z+q.tab[2]/2]);
 for(const sign of [-1,1])box([q.seal,b.height-C.battery.tapeHeight*2,q.seal],m.metal,battery,[sign*(b.width/2-q.seal/2),p.batteryY,z]);
 const D=C.detail;for(const x of [-q.tabX,0,q.tabX])box(D.passive,m.camera,battery,[x,top-q.protection[1]/2,z+q.protectionLift+q.protection[2]/2+D.passive[2]/2]);
 // ป้ายซองแบตสร้างจากข้อความ ไม่ใช้รูปภายนอก
 if(typeof document!=='undefined'){
  const cv=document.createElement('canvas');cv.width=512;cv.height=256;const g=cv.getContext('2d');g.fillStyle=C.colors.silk;g.fillRect(0,0,512,256);g.fillStyle=C.colors.camera;g.textAlign='center';
  for(const [i,t] of (b.width===34?['ลิเธียมโพลิเมอร์','603450 · 3.7V','ฉลาก 1200 mAh','ขนาด 34 × 50 × 6 มม.']:['ลิเธียมโพลิเมอร์','แบบจำลอง 500 mAh','ขนาดประมาณ']).entries()){g.font=(i===1?'bold 38':'26')+'px Tahoma';g.fillText(t,256,48+i*54);}
  const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;const o=mesh(new THREE.PlaneGeometry(b.width*.8,b.height*.36),new THREE.MeshBasicMaterial({map:tex}),battery,[0,p.batteryY,z+C.battery.tapeDepth/2+D.silkLift]);o.castShadow=false;
 }
}
function buildAntennaDetail(p,C,m,board,cardboard,variant) {
 const A=C.antenna,u=A.ufl,z=C.board.baseZ-C.board.pcb/2-u.height/2,ux=u.x,uy=p.boardY+u.y;
 const ufl=group(board,'ufl');annulus(u.outer,u.inner,u.height,m.metal,ufl,[ux,uy,z]);cylinder(u.inner*.5,u.height,m.copper,ufl,[ux,uy,z]);
 cylinder(u.outer*.85,u.height*.35,m.metal,ufl,[ux,uy,z-u.height*.65]).name='ufl-plug';
 if(cardboard)return;
 const x=-p.w/2+C.case.wall+A.width/2,y=p.batteryY,az=-p.d/2+C.case.wall+A.depth/2;
 const rearZ=variant==='pendant'?p.batteryZ-p.battery.depth/2-A.cableRadius-0.2:A.rearZ;
 box([A.width,A.height,A.depth],m.antenna,board,[x,y,az]).name='antenna-flat';
 for(let i=0;i<4;i++)box([A.width*.65,A.trace,A.trace],m.copper,board,[x,y+(i-1.5)*A.height/5,az+A.depth/2]);
 const route=[[ux,uy,z],[ux,p.boardY+A.routeY,z],[x,p.boardY+A.routeY,z],[x,p.boardY+A.routeY,rearZ],[x,y+A.height/2,rearZ],[x,y+A.height/2,az]];
 routedTube(route,A.cableRadius,A.bend,m.wire,board).name='antenna-coax';
}
// กล่องกระดาษแยกฝาพับ รูด้านหน้า และรอยลอนที่ขอบตัด
// ผิวพิมพ์จาก canvas ไม่ต้องโหลดรูป/ฟอนต์ภายนอก
function surfaceText(text,w,h,parent,pos,color='#e8e8df') {
 if(typeof document==='undefined')return null;
 const cv=document.createElement('canvas');cv.width=512;cv.height=256;const g=cv.getContext('2d'),lines=text.split('\n');g.fillStyle=color;g.textAlign='center';g.textBaseline='middle';g.font='bold '+Math.min(50,210/lines.length)+'px Tahoma';lines.forEach((s,i)=>g.fillText(s,256,(i+.5)*256/lines.length,490));
 const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;const o=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.DoubleSide}),parent,pos);o.castShadow=false;return o;
}
function buildTactile(C,m,parent,pos) {
 const g=group(parent,'tactile'),b=C.button.body,t=C.detail.tactile;g.position.set(...pos);
 box([b[0],b[1],b[2]-t.capHeight],m.camera,g,[0,0,-t.capHeight/2]);
 box([b[0]-.4,b[1]-.4,t.top],m.metal,g,[0,0,b[2]/2-t.capHeight-t.top/2]);
 cylinder(t.cap/2,t.capHeight,m.camera,g,[0,0,b[2]/2-t.capHeight/2]);
 for(const x of [-1,1])for(const y of [-1,1])box(t.leg,m.metal,g,[x*(b[0]/2+t.leg[0]/2),y*b[1]/3,-b[2]/2+t.leg[2]/2]).name='tactile-leg';return g;
}
function buildJst(C,m,parent,pos,name) {
 const g=group(parent,name),[w,h,d]=C.wiring.jst,t=C.detail.jstWall;g.position.set(...pos);
 for(const sign of [-1,1]){
  const len=h/2-t/2,y=sign*(h/4+t/4),s=roundedShape(w,d,t);s.holes.push(new THREE.Path(roundedShape(w-2*t,d-2*t,t/2).getPoints()));
  const o=mesh(extrude(s,len),m.jst,g,[0,y-sign*len/2,0]);o.rotation.x=sign>0?-Math.PI/2:Math.PI/2;
  box([w-2*t,t,d-2*t],m.jst,g,[0,sign*(h/2-t/2),0]);
 }
 for(const sign of [-1,1])box(C.detail.jstPin,m.metal,g,[sign*C.detail.jstPitch/2,0,0]).name='jst-pin';
 box([w*.4,h*.22,t],m.jst,g,[0,0,d/2+t/2]).name='jst-latch';return g;
}
// กล่องใช้แล้ว: ผิวเหลืองด้านนอก ลอนน้ำตาลด้านใน ฝาบนเปิด
function buildCardboard(p,C,m,parts,wiring,withLabels) {
 const q=C.cardboard,w=p.w,h=p.h,d=p.d,t=q.wall,inner=d/2-t,{front,back,board,battery,details,mount}=parts;
 const edge=mat(C.colors.cardboardEdge,{roughness:1}),paper=mat(q.print.outer,{roughness:1}),tape=mat(q.tape.color,{transparent:true,opacity:.72,roughness:.35,side:THREE.DoubleSide}),green=mat(q.lanyard.color,{roughness:.9});
 m.front.color.set(q.print.outer);m.front.roughness=1;m.back.color.set(C.colors.cardboard);m.back.roughness=1;
 const pixels=new Uint8Array(128*128*4);for(let i=0;i<128*128;i++){const shade=220+Math.floor((Math.sin(i*12.9898)*43758.5453%1+1)*16);pixels.set([shade,shade,shade,255],i*4);}
 const grain=new THREE.DataTexture(pixels,128,128);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.repeat.set(w/q.grainTile,h/q.grainTile);grain.needsUpdate=true;m.front.bumpMap=m.back.bumpMap=paper.bumpMap=grain;m.front.bumpScale=m.back.bumpScale=paper.bumpScale=.15;
 // รอยฉีกไม่เป็นเส้นตรง ใช้จุดน้อยและลอนรวมใน geometry เดียว
 const s=new THREE.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2);
 for(let x=w/2;x>=-w/2;x-=q.flutePitch)s.lineTo(x,h/2-q.rough*(.5+.5*Math.sin(x*1.7)));s.closePath();
 const hole=(shape,x,y,a,b)=>shape.holes.push(new THREE.Path(roundedShape(a,b,.25,x,y).getPoints()));
 hole(s,0,h/2-q.cameraDrop,q.cameraHole,q.cameraHole);hole(s,q.antenna.slitX,q.antenna.slitY,...q.antenna.slit);
 for(const side of [-1,1])s.holes.push(roundHole(side*q.hook.x,q.hook.y,q.hook.hole/2));
 const panelFront=mesh(extrude(s,t),m.front,front,[0,0,inner]);panelFront.name='cardboard-front';const liningFront=mesh(extrude(s,.025),m.back,front,[0,0,inner-.025]);liningFront.name='cardboard-front-inner';liningFront.castShadow=false;
 box([w,h,t],m.back,back,[0,0,-d/2+t/2]).name='cardboard-rear';
 for(const side of [-1,1]){
  const sideShape=roundedShape(d-2*t,h,.2);if(side===1)sideShape.holes.push(roundHole(-q.button.holeZ,q.button.holeY,q.button.wireHole/2));
  const panel=mesh(extrude(sideShape,t),paper,back,[side===1?w/2-t:-w/2,0,0]);panel.rotation.y=Math.PI/2;panel.name='cardboard-side';
  const lining=mesh(extrude(sideShape,.025),m.back,back,[side*(w/2-t)-.025,0,0]);lining.rotation.y=Math.PI/2;
  box([t,h,q.tape.width],m.back,back,[side*(w/2-1.5*t),0,-d/2+t+q.tape.width/2]);
 }
 box([w-2*t,t,d-2*t],m.back,back,[0,-h/2+t/2,0]);
 const flap=new THREE.Shape(),fh=q.flap.height,nw=q.flap.notchWidth/2;flap.moveTo(-w/2,0);flap.lineTo(w/2,0);flap.lineTo(w/2,fh);
 flap.lineTo(nw,fh);flap.lineTo(nw,fh-q.flap.notchDepth);flap.lineTo(-nw,fh-q.flap.notchDepth);flap.lineTo(-nw,fh);flap.lineTo(-w/2,fh);flap.closePath();
 const fm=mesh(extrude(flap,t),m.back,back,[0,h/2,-d/2]);fm.rotation.x=-q.flap.lean;fm.name='cardboard-flap';
 for(const sign of [-1,1]){const f=box([t,q.flap.sideHeight,d-2*t],m.back,back,[sign*(w/2+q.flap.sideHeight*.25),h/2+q.flap.sideHeight*.25,0]);f.rotation.z=-sign*Math.PI/4;}
 const flutes=[];for(let x=-w/2+t;x<w/2-t;x+=q.flutePitch){const y=h/2-q.rough*(.5+.5*Math.sin(x*1.7));flutes.push(new THREE.Vector3(x,y,inner+.15),new THREE.Vector3(x+q.flutePitch/2,y, d/2-.15),new THREE.Vector3(x+q.flutePitch/2,y,d/2-.15),new THREE.Vector3(x+q.flutePitch,y,inner+.15));}
 const flute=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(flutes),new THREE.LineBasicMaterial({color:C.colors.cardboardEdge}));front.add(flute);flute.name='cardboard-flutes';
 for(const sign of [-1,1])box([q.seam,h,q.seam],edge,front,[sign*(w/2-t),0,d/2+q.seam/2]);
 box([w,q.seam,q.seam],edge,back,[0,h/2,-d/2+t]);
 // บอร์ดหมุน 180° ในระนาบแผง: USB ชี้ขึ้น เลนส์ตรงรูหน้า
 const face=C.camera.z+C.camera.sensor[2]/2+C.camera.lensLength+C.camera.glassDepth;
 board.rotation.z=Math.PI;board.position.set(C.camera.x,h/2-q.cameraDrop+C.camera.y+p.boardY,inner-face-q.lensRecess);board.userData.home=board.position.clone();
 battery.rotation.y=Math.PI;battery.position.set(q.batteryX,q.batteryY-p.batteryY,inner-q.batteryGap-p.battery.depth/2+p.batteryZ);battery.userData.home=battery.position.clone();
 board.updateWorldMatrix(true,true);battery.updateWorldMatrix(true,true);
 const world=a=>board.localToWorld(new THREE.Vector3(...a)).toArray(),by=world([0,p.boardY,0])[1];
 const kap=(size,pos,parent=details)=>{const o=box(size,tape,parent,pos);o.name='cardboard-kapton';return o;};
 for(const sign of [-1,1]){
  const x=C.camera.x+sign*(C.board.width/2-.5),z=board.position.z+C.board.baseZ-C.board.pcb/2-q.boardTape[2],end=q.boardTape[1]/2,edgeY=C.board.height/2+1;
  const strip=wireRibbon([[x,by-end,inner-q.boardTape[2]],[x,by-edgeY,z],[x,by+edgeY,z],[x,by+end,inner-q.boardTape[2]]],q.boardTape[0],q.boardTape[2],tape,details);strip.userData.ribbon=false;strip.name='cardboard-board-tape';
 }
 const tapeZ=inner-q.batteryGap-p.battery.depth-q.tape.depth;
 const batteryTape=wireRibbon([[q.batteryX,Math.max(-h/2+2*t,q.batteryY-p.battery.height/2-q.tape.length/2),inner-q.tape.depth],[q.batteryX,q.batteryY-p.battery.height/2-1,tapeZ],[q.batteryX,q.batteryY+p.battery.height/2+1,tapeZ],[q.batteryX,q.batteryY+p.battery.height/2+q.tape.length/2,inner-q.tape.depth]],q.tape.width,q.tape.depth,tape,details);batteryTape.userData.ribbon=false;batteryTape.name='cardboard-battery-tape';
 for(const sign of [-1,1])kap([q.tape.width,q.tape.length,q.tape.depth],[sign*(w/2-q.tape.inset),-h/2+q.tape.length/2,d/2+q.tape.depth/2],front);
 // ตะขอสวิเวลร้อยรูหน้า + ห่วงวงกลมและสายคล้องแบน
 for(const sign of [-1,1]){
  const hx=sign*q.hook.x,hy=q.hook.y,hz=d/2+q.hook.gap,g=group(mount,'cardboard-hook');
  routedTube([[hx,hy,inner-1],[hx,hy,d/2+3*q.hook.wire],[hx-3,hy+5,hz+3],[hx+3,hy+5,hz+3],[hx+4,hy,hz+3],[hx+2,hy-q.hook.length*.55,hz+3],[hx-2,hy-q.hook.length*.55,hz+3]],q.hook.wire,q.hook.wire*.5,m.metal,g);
  const gate=box([q.hook.gate,q.hook.length*.55,q.hook.wire*2],m.metal,g,[hx-1,hy-q.hook.length*.22,hz+2]);gate.rotation.z=-.2;
  cylinder(q.hook.wire*1.4,q.hook.wire,m.metal,g,[hx,hy-q.hook.length*.45,hz+3]);
  rounded(4,5,2,1,m.metal,g,[hx,hy-q.hook.length*.65,hz+2]);
  annulus(q.hook.ring,q.hook.ring-q.hook.wire,q.hook.wire*2,m.metal,g,[hx,hy-q.hook.length,hz+2]);
  const strap=wireRibbon([[hx,hy-q.hook.length-q.hook.ring+1,hz+2],[sign*q.lanyard.spread,hy-15,hz+5],[sign*q.lanyard.spread,h/2+q.lanyard.rise*.5,-d/2],[sign*C.torso.neckWidth/2,h/2+q.lanyard.rise,-d/2-12]],q.lanyard.width,q.lanyard.thickness,green,mount);strap.userData.ribbon=false;strap.name='cardboard-lanyard';
 }
 wireRibbon([[-C.torso.neckWidth/2,h/2+q.lanyard.rise,-d/2-12],[0,h/2+q.lanyard.rise+10,-d/2-20],[C.torso.neckWidth/2,h/2+q.lanyard.rise,-d/2-12]],q.lanyard.width,q.lanyard.thickness,green,mount).userData.ribbon=false;
 // สาย UGREEN เสียบหัว USB เดิมแล้วออกด้านบนที่เปิด
 const usbY=p.boardY-C.board.height/2,uz=C.board.baseZ-C.board.usb[2]/2;
 rounded(...q.plug,q.radius,m.wire,board,[0,usbY-q.plug[1]/2,uz]).name='cardboard-usb-plug';
 rounded(...q.boot,q.radius,m.camera,board,[0,usbY-q.plug[1]-q.boot[1]/2,uz]);
 const up=world([0,usbY-q.plug[1]-q.boot[1],uz]);
 tube([up,[up[0],h/2+8,up[2]],[up[0]+10,h/2+q.cableExit,up[2]-2],[up[0]+38,h/2+q.cableExit-4,-d/2],[up[0]+52,h/2+3,-d/2-15]],q.cableRadius,m.wire,details).name='cardboard-usb-cable';
 const ug=surfaceText('UGREEN',q.plug[0]*.85,q.plug[1]*.6,board,[0,usbY-q.plug[1]/2,uz-q.plug[2]/2-.03]);if(ug)ug.rotation.y=Math.PI;
 // เสาแบนห้อยหน้ากล่องและสายลอดช่องแนวนอน
 const a=q.antenna,ag=group(details,'cardboard-antenna');ag.position.set(a.x,a.y,d/2+a.gap);ag.rotation.z=a.tilt;
 box(a.size,m.antenna,ag,[0,0,0]).name='antenna-flat';const at=surfaceText('seeed studio\n2.4G A-02',a.size[0]*.8,a.size[1]*.65,ag,[0,0,a.size[2]/2+.02]);
 const u=C.antenna.ufl,uf=world([u.x,p.boardY+u.y,C.board.baseZ-C.board.pcb/2-u.height]);
 routedTube([uf,[uf[0],uf[1],uf[2]-2],[uf[0]-5,uf[1],uf[2]-3],[-C.board.width/2-2,uf[1],uf[2]-3],[-C.board.width/2-4,a.slitY,inner-3],[a.slitX,a.slitY,inner-3],[a.slitX,a.slitY,d/2+1],[a.x,a.y+a.size[1]/2,d/2+a.gap]],C.antenna.cableRadius,C.antenna.bend,m.wire,details).name='antenna-coax';
 // ปุ่มภายนอกด้าน MULTIMETER; แกนกดออกทาง +X
 const bt=q.button,bg=buildTactile(C,m,details,[w/2+C.button.body[2]/2+bt.gap,bt.y,bt.z]);bg.rotation.y=Math.PI/2;bg.name='cardboard-button';
 const btTape=kap([q.tape.depth,C.button.body[1]+4,C.button.body[0]+5],[w/2+bt.gap-q.tape.depth/2,bt.y,bt.z]);
 const holeTape=roundedShape(q.tape.width,q.tape.length,1);holeTape.holes.push(roundHole(0,0,bt.wireHole/2));const ht=mesh(extrude(holeTape,q.tape.depth),tape,details,[w/2+.02,bt.holeY,bt.holeZ]);ht.rotation.y=Math.PI/2;ht.name='cardboard-kapton';
 buildCardboardWiring(p,C,m,parts,wiring,withLabels,world);
 // กล่องมิเตอร์พิมพ์เก่า ใช้ผิวหน้าตัดรูร่วมกับกระดาษ
 if(typeof document!=='undefined'){
  const cv=document.createElement('canvas');cv.width=cv.height=1024;const g=cv.getContext('2d');g.fillStyle=q.print.outer;g.fillRect(0,0,1024,1024);g.strokeStyle=g.fillStyle=q.print.ink;g.lineWidth=2;
  g.setLineDash([8,5]);g.beginPath();g.roundRect(280,490,480,230,22);g.stroke();g.setLineDash([]);g.textAlign='center';g.font='bold 49px Arial';g.fillText('CE   ♻   RoHS',430,836);g.font='20px Arial';g.fillText('Made in China',420,867);g.font='35px Arial';g.fillText('EMC&LVD',520,950);
  g.strokeRect(706,788,242,95);g.font='19px Arial';g.fillText('IEC61010-1',827,812);g.font='bold 22px Arial';g.fillText('CAT II 1000V',827,841);g.fillText('CAT III 600V',827,869);
  // ถังขยะกากบาท
  g.lineWidth=4;g.strokeRect(595,795,38,53);g.beginPath();g.moveTo(584,781);g.lineTo(647,858);g.moveTo(647,781);g.lineTo(584,858);g.stroke();
  const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=2;
  const pg=panelFront.geometry,uv=pg.attributes.uv,pos=pg.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,(pos.getX(i)+w/2)/w,(pos.getY(i)+h/2)/h);uv.needsUpdate=true;m.front.map=tex;m.front.color.set('#ffffff');
  const sideInk=group(back,'cardboard-side-print');sideInk.position.set(w/2+.04,0,0);sideInk.rotation.y=Math.PI/2;
  const sidePrint=surfaceText('DIGITAL MULTIMETER',h*.82,d*.28,sideInk,[0,0,0],q.print.ink);sidePrint.rotation.z=Math.PI/2;
  for(const sign of [-1,1])box([d*.08,h*.9,.02],mat(q.print.ink),sideInk,[sign*d*.33,0,0]).castShadow=false;
 }
}
// สายตามภาพ: แบตวนลง JST กลับบอร์ด ท่อหดเขียวห้อยใต้บอร์ด
// ผิวหลังร่วมทุกแบบ; back:GND แยกจาก GND ขอบสำหรับปุ่ม
function wiringGap(C=CONFIG) {
 const low=C.board.baseZ+C.board.pcb/2,high=C.board.senseZ-C.board.senseThickness/2;
 const required=C.board.pad[2]+C.wiring.jointHeight+2*C.wiring.wire;
 return {low,high,height:high-low,required,clearance:high-low-required,wireZ:low+C.board.pad[2]+C.wiring.wire};
}
function wiringGapText(C=CONFIG) {
 const g=wiringGap(C);return (g.clearance<0?'เตือน: ช่องไม่พอ! ':'ช่องตามแบบ: ')+'XIAO–Sense '+g.height.toFixed(2)+' มม. / แผ่น '+C.board.pad[2]+' + ตะกั่ว '+C.wiring.jointHeight+' + สาย Ø'+(2*C.wiring.wire).toFixed(1)+' = '+g.required.toFixed(2)+' มม. / เหลือ '+g.clearance.toFixed(2)+' มม. · B2B ยังไม่วัดจริง';
}
function buildSolderFace(p,C,m,board) {
 const B=C.board,W=C.wiring,by=p.boardY,edge=B.width/2,gap=wiringGap(C),padZ=gap.low+B.pad[2]/2;
 const pinY=i=>by+(i-(B.pinCount-1)/2)*B.pinPitch;
 const pad=name=>{const key=name.replace('back:',''),back=W.backPads.find(q=>q.name===key&&(name.startsWith('back:')||!W.pins.right.includes(key)));
  if(back)return [back.x,by+back.y,padZ];const i=W.pins.left.indexOf(name),j=W.pins.right.indexOf(name);if(i<0&&j<0)throw Error('Unknown pad '+name);return [i<0?edge:-edge,pinY(i<0?j:i),padZ];};
 for(const q of W.backPads){const o=box([...q.size,B.pad[2]],m.copper,board,[q.x,by+q.y,padZ]);o.name='back-pad';o.userData.pad=q.name;}
 const gold=W.goldPad;box([...gold.size,B.pad[2]],m.copper,board,[gold.x,by+gold.y,padZ]).name='back-gold-pad';
 const solder=mat(C.colors.solder,{metalness:.8,roughness:.25});
 const joint=(parent,name)=>{const a=pad(name),o=mesh(new THREE.SphereGeometry(W.joint,16,12),solder,parent,[a[0],a[1],gap.low+B.pad[2]+W.jointHeight/2]);o.scale.z=W.jointHeight/(2*W.joint);o.name='wiring-joint';o.userData.pad=name;return o;};
 // สายวางราบในช่อง; เลี้ยวขึ้น/ลงได้เมื่อพ้นขอบ PCB พร้อมรัศมีสายแล้ว
 const access=(name,side='left',r=W.wire)=>{const a=pad(name),z=gap.low+B.pad[2]+Math.max(r,W.wire),end=[a[0],a[1],z];
  return side==='usb'?[[a[0],by-B.height/2-1.3,z],end]:[[side==='right'?edge+1.3:-edge-1.3,a[1],z],end];};
 if(typeof document!=='undefined'){
  const px=60,cv=document.createElement('canvas');cv.width=B.width*px;cv.height=B.height*px;const g=cv.getContext('2d');g.textBaseline='middle';
  // ตัวอักษรอ่านตรงเมื่อถือ USB ขึ้น (ตามรูปบอร์ดจริง): หมุนแต่ละคำ 180° รอบจุดวาง ซ้าย/ขวาสลับกัน
  const put=(t,x,y,color=C.colors.silk)=>{const align=g.textAlign;g.save();g.fillStyle=color;g.translate((x+edge)*px,(B.height/2-y)*px);g.rotate(Math.PI);g.textAlign={left:'right',right:'left'}[align]||align;g.fillText(t,0,0);g.restore();};
  g.font='bold '+(.9*px)+'px Tahoma,sans-serif';g.textAlign='left';W.pins.left.forEach((t,i)=>put(t,-edge+1.5,pinY(i)-by,t===W.deadPin?C.colors.dead:C.colors.silk));g.textAlign='right';W.pins.right.forEach((t,i)=>put(t,edge-1.5,pinY(i)-by));
  g.textAlign='center';g.font='bold '+(.64*px)+'px Tahoma,sans-serif';for(const q of W.backPads){
   if(q.name==='EN')put(q.name,q.x+1.35,q.y);
   else if(q.name==='MTDO')put(q.name,q.x+1.25,q.y+1.05);
   else put(q.name,q.x,q.y+q.size[1]/2+.46);
  }
  g.font='bold '+(.9*px)+'px Tahoma,sans-serif';put('seeed studio',0,5.1);put('XIAO ESP32S3',0,6.3);
  const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;const o=mesh(new THREE.PlaneGeometry(B.width,B.height),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}),board,[0,by,gap.low+.02]);o.name='silk';o.castShadow=false;o.userData.padLabels=W.backPads.map(q=>q.name);
 }
 const d0=pad(W.deadPin);for(const a of [-1,1]){const o=box([2.2,.3,.1],mat(C.colors.dead),board,[d0[0]+.6,d0[1],padZ+.15]);o.rotation.z=a*Math.PI/4;}
 return {pad,joint,access};
}
function buildCardboardWiring(p,C,m,parts,wiring,withLabels,world) {
 const q=C.cardboard,W=C.wiring,{details,board}=parts,jm={jst:mat(C.colors.jst),metal:m.metal},wr=W.wire;
 const {pad,joint,access}=buildSolderFace(p,C,m,board),solder=mat(C.colors.solder,{metalness:.8});
 for(const name of ['BAT+','BAT-','D5','D1','GND'])joint(board,name);
 buildJst(C,jm,details,q.batteryJst,'wiring-jst-battery');buildJst(C,jm,details,q.buttonJst,'wiring-jst-button');
 const route=(pts,r,material,name)=>{const o=routedTube(pts,r,.35,material,details);o.userData.solderWire=true;if(name)o.name=name;return o;};
 // ขึ้นขอบ PCB ด้านนอก แล้วลอดช่องระหว่าง XIAO/Sense เหมือนงานจริง
 const toPad=(name,start)=>{const a=access(name,name==='GND'?'right':'left'),last=board.worldToLocal(new THREE.Vector3(...start.at(-1))),y=p.boardY+(last.y>p.boardY?1:-1)*(C.board.height/2+2);
  return [...start,world([last.x,y,last.z]),world([a[0][0],y,last.z]),...a.map(world)];};
 for(const [sign,name,wm] of [[1,'BAT+',m.red],[-1,'BAT-',m.wire]]){
  const b=q.batteryJst,dx=sign*C.detail.jstPitch/2,bz=p.d/2-q.wall-q.batteryGap-p.battery.depth-1;
  route([[q.batteryX-sign*C.battery.tabX,q.batteryY+p.battery.height/2,bz],[q.batteryX-20-sign,q.batteryY+8,bz],[q.batteryX-20-sign,q.wireLoopY,b[2]],[b[0]+dx,q.wireLoopY-4,b[2]],[b[0]+dx,b[1]-W.jst[1]/2,b[2]]],wr,wm,'cardboard-battery-wire');
  const sleeve=cylinder(q.heatShrink.radius,q.heatShrink.length,wm,details,[q.batteryX-20-sign,q.batteryY,bz]);sleeve.rotation.x=Math.PI/2;sleeve.name='battery-heatshrink';
  route(toPad(name,[[b[0]+dx,b[1]+W.jst[1]/2,b[2]],[b[0]+dx,-25,2],[19+sign,8,2]]),wr,wm,'cardboard-battery-return');
 }
 const R=W.resistor,join=[(q.resistorX[0]+q.resistorX[1])/2,q.resistorY-R.length/2-3,q.resistorZ];
 q.resistorX.forEach((x,i)=>{const r=cylinder(R.diameter/2,R.length,mat(C.colors.resistor),details,[x,q.resistorY,q.resistorZ]);r.rotation.x=Math.PI/2;r.name='wiring-resistor';const sleeve=cylinder(R.shrink/2,R.length+1,mat(C.colors.shrink,{transparent:true,opacity:.8}),details,[x,q.resistorY,q.resistorZ]);sleeve.rotation.x=Math.PI/2;sleeve.name='wiring-shrink';route(toPad(i?'BAT-':'BAT+',[[x,q.resistorY+R.length/2,q.resistorZ],[17+i*2,19,3]]),R.lead/2,m.metal);route([[x,q.resistorY-R.length/2,q.resistorZ],join],R.lead/2,m.metal);});
 route(toPad('D5',[join,[20,join[1],2]]),wr,m.red);mesh(new THREE.SphereGeometry(.8,12,8),solder,details,join).name='wiring-junction';
 for(const [sign,name,wm] of [[1,'D1',m.red],[-1,'GND',m.wire]]){
  const bt=q.button,j=q.buttonJst,dx=sign*C.detail.jstPitch/2;
  const button=details.getObjectByName('cardboard-button'),leg=button.children.find(o=>o.name==='tactile-leg'&&o.position.x>0&&Math.sign(o.position.y)===sign);button.updateWorldMatrix(true,true);const terminal=leg.getWorldPosition(new THREE.Vector3()).toArray();
  route([terminal,[p.w/2+4,bt.y+sign*C.button.body[1]/3,bt.z-C.button.body[0]/2-2],[p.w/2+4,bt.holeY,bt.holeZ+sign*.7],[p.w/2-4,bt.holeY,bt.holeZ+sign*.7],[j[0]+dx,j[1]-W.jst[1]/2,j[2]]],wr,wm,'cardboard-button-wire');
  route(toPad(name,[[j[0]+dx,j[1]+W.jst[1]/2,j[2]],[j[0]+dx,23+sign*2,0]]),wr,wm,'cardboard-button-return');
 }
 if(withLabels){wiring.labels.push(label(details,'603450 → JST → BAT+ / BAT−',q.batteryJst),label(details,'100kΩ ×2 ท่อหดเขียว → D5',join),label(details,'ปุ่มด้านข้าง → JST → D1 / GND',q.buttonJst));}
}

function estimateMass(state,p) {
 const m=CONFIG.mass,scale=p.w*p.h/m.referenceArea;
 if(state.version==='v1')return CONFIG.cardboard.mass+m.board+m.sense+m.camera+m.button+m.wires+m.antenna+p.battery.mass;
 const common=(isV2(state.version)?m.v2Extras:0)+m.front*scale+m.back*scale+m.board+m.sense+m.camera+m.button+m.cap+m.led+m.wires+m.usb+m.antenna+m.screws+p.battery.mass;
 return common+(state.variant==='clip'?m.clipPlastic+m.clipHardware:state.variant==='magnet'?4*m.magnetEach+m.magnetPlate:m.pendant+m.cord);
}

// ขอบอุปกรณ์อ่านจากชิ้นจริง; ระยะผนังในจากขนาดกล่องและความหนา CONFIG
function computeMeasurements(device) {
 const {p,root}=device;root.updateMatrixWorld(true);const bounds=name=>new THREE.Box3().setFromObject(root.getObjectByName(name)),out=[];
 const add=(id,title,a,b,offset)=>out.push({id,title,a,b,offset,value:new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b))});
 add('width','กว้าง',[-p.w/2,-p.h/2,p.d/2],[p.w/2,-p.h/2,p.d/2],[0,-10,5]);
 add('height','สูง',[p.w/2,-p.h/2,p.d/2],[p.w/2,p.h/2,p.d/2],[10,0,5]);
 add('depth','ลึก',[-p.w/2,-p.h/2,-p.d/2],[-p.w/2,-p.h/2,p.d/2],[-9,-5,0]);
 const board=device.parts.board,g=wiringGap(),at=z=>board.localToWorld(new THREE.Vector3(-CONFIG.board.width/2,p.boardY,z)).toArray();
 add('board-gap','ช่อง XIAO–Sense',at(g.low),at(g.high),[-17,0,0]);
 if(root.getObjectByName('v2-sd-stop')){
  const pcb=bounds('xiao-pcb'),card=bounds('sd-card'),stop=bounds('v2-sd-stop'),bat=bounds('battery-pouch'),wall=p.w/2-CONFIG.case.wall;
  add('board-wall','บอร์ด → ผนัง',[pcb.max.x,pcb.max.y,pcb.max.z],[wall,pcb.max.y,pcb.max.z],[0,7,4]);
  add('card-stop','SD tip ? stop (foam)',[card.min.x,card.min.y,card.max.z],[card.min.x,stop.max.y,card.max.z],[0,-8,12]);
  add('battery-wall','แบต → ผนัง',[bat.max.x,bat.min.y,bat.max.z],[wall,bat.min.y,bat.max.z],[0,-4,7]);
 }return out;
}
function partsList(state,p) {
 const C=CONFIG,cb=state.version==='v1',size=a=>a.join(' × ')+' มม.',b=p.battery;
 const rows=[(cb?'กล่องกระดาษ':'ตัวเรือน')+' · '+size([p.w,p.h,p.d]),'XIAO ESP32-S3 · '+size([C.board.width,C.board.height,C.board.pcb]),'Sense · '+size([C.board.senseWidth,C.board.senseHeight,C.board.senseThickness]),'กล้อง · เลนส์ Ø'+C.camera.lensDiameter+' × '+C.camera.lensLength+' มม.','microSD · '+size(C.board.sd.card),'แบต '+(b.width===34?'603450':'500 mAh')+' · '+size([b.width,b.height,b.depth]),'ปุ่ม 4 ขา · '+size(C.button.body),'JST 2 ขา ×2 · '+size(C.wiring.jst),'100kΩ ×2 · Ø'+C.wiring.resistor.diameter+' × '+C.wiring.resistor.length+' มม.','เสาอากาศ · '+size(cb?C.cardboard.antenna.size:[C.antenna.width,C.antenna.height,C.antenna.depth])];
 if(cb)rows.push('ตะขอสวิเวล ×2 · สูง '+C.cardboard.hook.length+' มม. / สายคล้องกว้าง '+C.cardboard.lanyard.width+' มม.');
 else {rows.push('ช่องชาร์จแยก · PCB '+size(C.usb.pcb));if(isV2(state.version))rows.push('ผนังกัน SD '+C.v2.sdStop.thickness+' มม. + โฟม '+C.v2.sdStop.foam+' มม.','ขารองบอร์ด ×4 · '+C.v2.ledge.width+' × '+C.v2.ledge.length+' มม.','ไดโอด 1N5817 · Ø'+C.v2.diode.diameter+' × '+C.v2.diode.length+' มม.');rows.push(state.variant==='clip'?'คลิป · '+size([C.clip.width,C.clip.length,C.clip.thickness]):state.variant==='magnet'?'แม่เหล็ก ×4 · Ø'+C.magnet.diameter+' × '+C.magnet.depth+' มม.':'แผ่นหัวกล่อง · '+size([p.w,C.pendant.lug.tabLength,p.d/2]));}
 return rows;
}


// กล่องรุ่น 2: ชิ้นที่เพิ่มจากรุ่น 1 (ทุกชิ้นตั้งชื่อ v2-* ให้ test หาเจอ)
function buildV2(p,C,materials,parts,wirePath,wireX,wiring,variant) {
 const c=C.case,q=C.v2,sd=C.board.sd,by=p.boardY,ov=c.bossOverlap,wallIn=p.d/2-c.wall;
 const named=(o,name)=>{o.name=name;return o;};
 const span=(lo,hi)=>[(lo+hi)/2,hi-lo];  // ช่วง [lo,hi] -> [กลาง, ยาว]
 const slab=(x,y,z,m,parent,name)=>{const [cx,sx]=span(...x),[cy,sy]=span(...y),[cz,sz]=span(...z);return named(box([sx,sy,sz],m,parent,[cx,cy,cz]),name);};
 // 1) microSD: การ์ดเสียบจากด้าน +X ถ้าขยับจะเลื่อนออกทางนั้น -> โฟมกดปลายการ์ด + ผนังจากฝาหน้ากั้นไว้
 const cardEndY=sd.y+sd.cardOffsetY-sd.card[1]/2,cardZ=sd.z+sd.depth/2,cardX=[sd.x-sd.card[0]/2-q.sdStop.margin,sd.x+sd.card[0]/2+q.sdStop.margin];
 const stopZ=[cardZ-sd.card[2]/2-q.sdStop.below,wallIn+ov];
 slab(cardX,[by+cardEndY-q.sdStop.foam,by+cardEndY],[stopZ[0],cardZ+sd.card[2]/2+q.sdStop.below],materials.foam,parts.details,'v2-sd-foam');
 slab(cardX,[by+cardEndY-q.sdStop.foam-q.sdStop.thickness,by+cardEndY-q.sdStop.foam],stopZ,materials.front,parts.front,'v2-sd-stop');
 // 2) ขารองมุมบอร์ด 4 จุด (ฝาหลัง): รองใต้ขอบ PCB + ขอบกันบอร์ดเลื่อนข้าง ไม่มีรูน็อตบนบอร์ดจึงใช้วิธีรองมุม
 const L=q.ledge,pcbBottom=C.board.baseZ-C.board.pcb/2,edge=C.board.width/2;
 for(const sx of [-1,1]) for(const sy of [-1,1]) {
  const ys=[by+sy*(C.board.height/2-L.length),by+sy*C.board.height/2].sort((a,b)=>a-b);
  const xs=v=>[sx*v[0],sx*v[1]].sort((a,b)=>a-b);
  slab(xs([edge-L.under,edge-L.under+L.width+L.lip]),ys,[-wallIn-ov,pcbBottom],materials.back,parts.back,'v2-ledge');
  slab(xs([edge+L.lipGap,edge+L.lipGap+L.lip]),ys,[pcbBottom,pcbBottom+L.lipHeight],materials.back,parts.back,'v2-ledge-lip');
 }
 // 3) แท่นช่องชาร์จ (ฝาหลัง): ฐานใต้ PCB + ผนังสองข้าง + ผนังหลังรับแรงตอนเสียบสาย
 const u=C.usb,R=q.cradle,y0=-p.h/2+c.wall,y1=y0+R.cavity[1],pcbLow=u.z-u.socket[2]/2-u.pcb[2]/2;
 slab([-R.cavity[0]/2,R.cavity[0]/2],[y0-ov,y1],[-wallIn-ov,pcbLow],materials.back,parts.back,'v2-cradle-base');
 for(const s of [-1,1]) slab([s*(R.cavity[0]/2+R.sideGap),s*(R.cavity[0]/2+R.sideGap+R.side)].sort((a,b)=>a-b),[y0-ov,y1-R.sideShort],[-wallIn-ov,0],materials.back,parts.back,'v2-cradle-side');
 if(variant!=='pendant')slab([-R.stopWidth/2,R.stopWidth/2],[y1+R.stopGap,y1+R.stopGap+R.stop],[-wallIn-ov,0],materials.back,parts.back,'v2-cradle-stop');
 // 4) สาย GND (ดำ) ข้างสาย 5V (แดง) + ไดโอดคั่นสาย 5V ขีดหันไปทางบอร์ด
 // ชาร์จลงแผ่นหลัง VUSB/GND; เข้าขอบฝั่ง USB ใกล้ breakout
 const u0=C.usb,start=dx=>[u0.pcb[0]/2+dx,-p.h/2+c.wall+u0.pcb[1],u0.z];
 const toBack=(pin,dx)=>{const a=wiring.access(pin,'usb'),y=a[0][1]-2-dx;return [start(dx),[wireX+dx,0,u0.z],[wireX+dx,y,u0.z],[a[0][0],y,a[0][2]],...a];};
 for(const [pin,dx,material] of [['VUSB',0,materials.red],['back:GND',-q.wireGap,materials.wire]]){
  const o=routedTube(toBack(pin,dx),C.wiring.wire,.35,material,parts.details);o.name='charge-wire';o.userData.pad=pin;o.userData.solderWire=true;wiring.joint(parts.details,pin);
 }
 const D=q.diode,dz=C.usb.z;
 const body=named(cylinder(D.diameter/2,D.length,materials.camera,parts.details,[wireX,0,dz]),'v2-diode');body.rotation.x=Math.PI/2;
 const band=named(cylinder(D.diameter/2+0.05,D.band,materials.metal,parts.details,[wireX,D.length/2-D.band,dz]),'v2-diode-band');band.rotation.x=Math.PI/2;
}

// งานบัดกรีจริง: ด้านใต้ XIAO (ฝั่งที่มีป้ายขา + แผ่น BAT หันเข้าหาบอร์ด Sense) สายแบตผ่าน JST,
// ตัวต้านทานวัดแบต -> D5, ปุ่มผ่าน JST -> D1/GND  สายที่ต้องเข้าไปแผ่น BAT ลอดช่องระหว่างบอร์ดทางปลายบน (ไม่มี B2B ตรงนั้น)
function buildWiring(p,C,materials,parts,withLabels) {
 const W=C.wiring,B=C.board,by=p.boardY,col=C.colors,labels=[];
 const face=B.baseZ+B.pcb/2,edge=B.width/2;
 const m={jst:mat(col.jst),res:mat(col.resistor),shrink:mat(col.shrink,{transparent:true,opacity:0.55}),solder:mat(col.solder,{metalness:0.8,roughness:0.25})};
 const named=(o,name)=>{o.name=name;return o;}, {pad,joint,access}=buildSolderFace(p,C,materials,parts.board),d0=pad(W.deadPin);
 const toBat=(name,from)=>[...from,...access(name)];
 const route=(pts,r,material,parent)=>{const o=routedTube(pts,r,.35,material,parent);o.userData.solderWire=true;return o;};
 // แบต -> JST -> BAT+/BAT−
 const b=p.battery,bj=W.batteryJst,J=W.jst,jY=by+bj.y;
 buildJst(C,{jst:m.jst,metal:materials.metal},parts.battery,[bj.x,jY,bj.z],'wiring-jst-battery');
 const top=p.batteryY+b.height/2,lowY=jY-J[1]/2,highY=jY+J[1]/2;
 for(const [k,dx,wm] of [['BAT+',0.9,materials.red],['BAT-',-0.9,materials.wire]]) {
  route([[dx*2,top-C.battery.protection[1]/2,p.batteryZ+b.depth/2+C.battery.protectionLift+C.battery.protection[2]/2],[-C.board.width/2-2,top+1.5,p.batteryZ],[bj.x+dx,lowY-2.5,bj.z],[bj.x+dx,lowY,bj.z]],W.wire,wm,parts.battery);
  route(toBat(k,[[bj.x+dx,highY,bj.z],[bj.x+dx,highY+1.5,bj.z+0.8]]),W.wire,wm,parts.battery);
  joint(parts.battery,k);
 }
 // ตัวต้านทาน 100k สองตัว (ท่อหดเขียว) วางข้างบอร์ด ขาบนลงแผ่น BAT+/BAT− ขาล่างบิดรวมกัน -> สายแดง -> D5
 const R=W.resistor,rz=R.z,ry0=by+R.y0,ry1=ry0+R.length,junction=[(R.xs[0]+R.xs[1])/2,ry0-1.0,rz];
 R.xs.forEach((x,i)=>{
  const body=named(cylinder(R.diameter/2,R.length,m.res,parts.details,[x,ry0+R.length/2,rz]),'wiring-resistor');body.rotation.x=Math.PI/2;
  const sl=named(cylinder(R.shrink/2,R.length+1,m.shrink,parts.details,[x,ry0+R.length/2,rz]),'wiring-shrink');sl.rotation.x=Math.PI/2;
  route(toBat(i===0?'BAT+':'BAT-',[[x,ry1,rz],[x,ry1+0.8,rz-0.5]]),R.lead/2,materials.metal,parts.details);
  route([[x,ry0,rz],[x,ry0-0.6,rz],junction],R.lead/2,materials.metal,parts.details);
 });
 named(mesh(new THREE.SphereGeometry(0.8,16,12),m.solder,parts.details,junction),'wiring-junction');
 const d5=pad('D5');
 route([junction,[junction[0]+1.5,junction[1]+1,rz-1],...access('D5')],W.wire,materials.red,parts.details);
 joint(parts.details,'D5');
 // ปุ่ม -> JST (ขวา) -> แดง D1 (วิ่งหลังบอร์ดไปขอบซ้าย), ดำ GND (ขอบขวา)
 const kj=W.buttonJst,kY=by+kj.y,bt=C.button;
 buildJst(C,{jst:m.jst,metal:materials.metal},parts.details,[kj.x,kY,kj.z],'wiring-jst-button');
 for(const dx of [0.9,-0.9]) route([[dx,bt.y,p.cardboard?p.d/2-bt.body[2]:bt.switchZ-bt.body[2]/2],[kj.x-3+dx,bt.y+4,0],[kj.x+2.6+dx,kY+J[1]/2+2,kj.z+1],[kj.x+dx,kY+J[1]/2,kj.z]],W.wire,dx>0?materials.red:materials.wire,parts.details);
 const d1=pad('D1'),gnd=pad('GND'),wb=W.wireBack,lo=kY-J[1]/2;
 route([[kj.x+0.9,lo,kj.z],[kj.x,lo-1.5,wb],[3,d1[1]+1,wb],[-edge-1.5,d1[1],wb+1.5],...access('D1')],W.wire,materials.red,parts.details);
 route([[kj.x-0.9,lo,kj.z],[kj.x-1.5,lo-1.5,wb+1],[gnd[0]+1.6,gnd[1],wb+1],...access('GND','right')],W.wire,materials.wire,parts.details);
 joint(parts.details,'D1');joint(parts.details,'GND');
 if(withLabels) {
  const L=(parent,text,pos,side)=>{const o=label(parent,text,pos);o.userData.side=side;labels.push(o);};
  L(parts.battery,'แบต → JST → BAT+ / BAT−',[bj.x,jY,bj.z],-1);
  L(parts.details,'100k ×2 (ท่อหดเขียว) → D5 · วัดแบต',junction,-1);
  L(parts.board,'D0 เสีย (รั่วลง GND) ไม่ใช้',d0,-1);
  L(parts.details,'ปุ่ม → JST → D1 / GND',[kj.x,kY,kj.z],1);
 }
 return {pad,joint,access,labels};
}

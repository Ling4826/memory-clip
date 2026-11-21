from pathlib import Path
p=Path('work/model.js');s=p.read_text(encoding='utf-8')
start=s.index(' const q=C.cardboard,W=C.wiring',s.index('function buildCardboardWiring'))
end=s.index(' buildJst(C,jm,details,q.batteryJst',start)
s=s[:start]+''' const q=C.cardboard,W=C.wiring,{details,board}=parts,jm={jst:mat(C.colors.jst),metal:m.metal},wr=W.wire;
 const {pad,joint,access}=buildSolderFace(p,C,m,board),solder=mat(C.colors.solder,{metalness:.8});
 for(const name of ['BAT+','BAT-','D5','D1','GND'])joint(board,name);
'''+s[end:]
start=s.index(' const toPad=',s.index('function buildCardboardWiring'));end=s.index('\n',start)
s=s[:start]+''' const toPad=(name,start)=>[...start,...access(name,name==='GND'?'right':'left').map(world)];'''+s[end:]
start=s.index(' const face=B.baseZ',s.index('function buildWiring'));end=s.index(' // แบต -> JST',start)
s=s[:start]+''' const face=B.baseZ+B.pcb/2,edge=B.width/2;
 const m={jst:mat(col.jst),res:mat(col.resistor),shrink:mat(col.shrink,{transparent:true,opacity:0.55}),solder:mat(col.solder,{metalness:0.8,roughness:0.25})};
 const named=(o,name)=>{o.name=name;return o;}, {pad,joint,access}=buildSolderFace(p,C,materials,parts.board),d0=pad(W.deadPin);
 const toBat=(name,from)=>[...from,...access(name)];
 const route=(pts,r,material,parent)=>routedTube(pts,r,.35,material,parent);
'''+s[end:]
# จำกัดการแก้ tube เฉพาะงานบัดกรี ใช้เส้นไม่โก่งทะลุ PCB
start=s.index('function buildWiring');end=s.index('\n}',start)+2
block=s[start:end].replace('tube(','route(').replace('toBat(pad(k),','toBat(k,').replace("toBat(pad(i===0?'BAT+':'BAT-'),","toBat(i===0?'BAT+':'BAT-',")
block=block.replace("[d5[0]-1.6,d5[1]-0.5,d5[2]+0.6],[d5[0]-0.3,d5[1],d5[2]+0.2]","...access('D5')")
block=block.replace("[-edge-1.5,d1[1],wb+1.5],[d1[0]-0.3,d1[1],d1[2]+0.2]","[-edge-1.5,d1[1],wb+1.5],...access('D1')")
block=block.replace("[gnd[0]+1.6,gnd[1],gnd[2]-0.6],[gnd[0]+0.3,gnd[1],gnd[2]+0.2]","[gnd[0]+1.6,gnd[1],wb+1],...access('GND','right')")
block=block.replace('return {pad,joint,labels};','return {pad,joint,access,labels};')
s=s[:start]+block+s[end:]
start=s.index(' // สายแดง 5V (ผ่านไดโอด)');end=s.index(' const D=q.diode',start)
s=s[:start]+''' // ชาร์จลงแผ่นหลัง VUSB/GND; เข้าขอบฝั่ง USB ใกล้ breakout
 const u0=C.usb,start=dx=>[u0.pcb[0]/2+dx,-p.h/2+c.wall+u0.pcb[1],u0.z];
 const toBack=(pin,dx)=>{const a=wiring.access(pin,'usb'),y=a[0][1]-2-dx;return [start(dx),[wireX+dx,0,u0.z],[wireX+dx,y,u0.z],[a[0][0],y,a[0][2]],...a];};
 for(const [pin,dx,material] of [['VUSB',0,materials.red],['back:GND',-q.wireGap,materials.wire]]){
  const o=routedTube(toBack(pin,dx),C.wiring.wire,.35,material,parts.details);o.name='charge-wire';o.userData.pad=pin;wiring.joint(parts.details,pin);
 }
'''+s[end:]
p.write_text(s,encoding='utf-8')

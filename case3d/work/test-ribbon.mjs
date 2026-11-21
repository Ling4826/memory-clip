import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import * as THREE from './vendor/three.module.js';import {makeShell} from './shell-geometry.js';
const cfg={window:{}};vm.createContext(cfg);vm.runInContext(fs.readFileSync('work/config.js','utf8'),cfg);
const CONFIG=cfg.window.CONFIG;const {buildDevice}=new Function('THREE','CONFIG','makeShell',fs.readFileSync('work/model.js','utf8')+'\nreturn {buildDevice};')(THREE,CONFIG,makeShell);
const B=CONFIG.board,sd=B.sd,eps=0.02;
for(const battery of [500,1200])for(const angle of [0,20]) {
 const d=buildDevice({battery,variant:'clip',angle,fov:false,torso:false},false);d.root.updateMatrixWorld(true);
 let ribbon=null;d.parts.board.traverse(o=>{if(o.userData.ribbon)ribbon=o;});
 assert.ok(ribbon,'ribbon exists');
 const by=d.p.boardY,boxes=[
  {name:'sd socket',min:[sd.x-sd.width/2,by+sd.y-sd.height/2,sd.z-sd.depth/2],max:[sd.x+sd.width/2,by+sd.y+sd.height/2,sd.z+sd.depth/2]},
  {name:'sd card',min:[sd.x-sd.card[1]/2,by+sd.y-sd.card[0]/2,sd.z+sd.depth/2-sd.card[2]/2],max:[sd.x+sd.card[1]/2,by+sd.y+sd.card[0]/2,sd.z+sd.depth/2+sd.card[2]/2]},
  {name:'mic',min:[B.mic.x-B.mic.width/2,d.p.micY-B.mic.height/2,B.senseZ],max:[B.mic.x+B.mic.width/2,d.p.micY+B.mic.height/2,B.senseZ+B.senseThickness/2+B.mic.depth]},
  {name:'sense board',min:[-B.senseWidth/2,by-B.senseHeight/2,B.senseZ-B.senseThickness/2],max:[B.senseWidth/2,by+B.senseHeight/2,B.senseZ+B.senseThickness/2]}];
 const pos=ribbon.geometry.getAttribute('position');let maxZ=-1e9;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);maxZ=Math.max(maxZ,z);
  for(const b of boxes)assert.ok(!(x>b.min[0]+eps&&x<b.max[0]-eps&&y>b.min[1]+eps&&y<b.max[1]-eps&&z>b.min[2]+eps&&z<b.max[2]-eps),`battery ${battery}: ribbon vertex (${x.toFixed(2)},${(y-by).toFixed(2)},${z.toFixed(2)}) inside ${b.name}`);
  assert.ok(Math.abs(x)<=B.width/2+eps&&y>=by-B.height/2-eps&&y<=by+B.height/2+eps,'ribbon stays over the board footprint');}
 assert.ok(maxZ<d.p.d/2-CONFIG.case.wall,'ribbon stays behind the front wall');
}
console.log('PASS: camera ribbon clears microSD socket, card, microphone and Sense board');

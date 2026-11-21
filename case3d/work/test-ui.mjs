// เรียกตรรกะ UI จริงกับโครงปุ่มและรหัสจาก HTML โดยไม่ต้องโหลด CDN
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import * as THREE from './vendor/three.module.js';import {makeShell} from './shell-geometry.js';
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('work/config.js','utf8'),ctx);const C=ctx.window.CONFIG,html=fs.readFileSync('work/ui-shell.html','utf8'),app=fs.readFileSync('work/app.js','utf8');
const {buildDevice,estimateMass,partsList,wiringGapText}=new Function('THREE','CONFIG','makeShell',fs.readFileSync('work/model.js','utf8')+'\nreturn {buildDevice,estimateMass,partsList,wiringGapText};')(THREE,C,makeShell);
const element=()=>({textContent:'',disabled:false,classList:{toggle(){}},setAttribute(k,v){this[k]=v;}}),ids=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],element()]));
const buttons=[...html.matchAll(/<button[^>]*data-(variant|battery|version|export)="([^"]+)"[^>]*>([^<]*)<\/button>/g)].map(m=>({...element(),dataset:{[m[1]]:m[2]},textContent:m[3]}));
const doc={querySelectorAll:selector=>buttons.filter(b=>b.dataset[selector.slice(6,-1)]!==undefined),querySelector:selector=>buttons.find(b=>b.dataset.export===selector.match(/="([^"]+)"/)[1])};
const extract=(start,end)=>app.slice(app.indexOf('function '+start+'('),app.indexOf('function '+end+'('));
let checked=0;
for(const version of ['v1','v2','v2p','legacy'])for(const variant of ['clip','magnet','pendant']){
 const state={version,variant,battery:500,angle:10,labels:false,solderView:true,fov:true,transparent:false,torso:false},device=buildDevice(state,false);
 const update=new Function('state','device','CONFIG','document','$','estimateMass','partsList','wiringGapText',extract('updateInfo','rebuild')+'\nupdateInfo();');update(state,device,C,doc,id=>ids.get(id),estimateMass,partsList,wiringGapText);
 const exports=buttons.filter(b=>b.dataset.export);assert.equal(exports.every(b=>b.disabled),version==='v1');assert.equal(exports.find(b=>b.dataset.export==='mount').disabled,version==='v1'||variant==='pendant');
 assert.equal(buttons.filter(b=>b.dataset.variant).every(b=>b.disabled),version==='v1'||version==='v2p');assert.equal(buttons.filter(b=>b.dataset.battery).every(b=>b.disabled),version==='v1'||version==='v2p'); // v2p ล็อกห้อยคอ + 1200 ตามชุดที่สั่งพิมพ์
 assert.ok(ids.get('versionNote').textContent.length>40);assert.ok(ids.get('exportNote').textContent.includes(version==='v1'?'ปิดการส่งออก':'STL'));
 assert.ok(ids.get('partsList').textContent.includes(String(C.board.width)));assert.equal(ids.get('angle').disabled,version==='v1');
 if(version==='v1'){assert.ok(ids.get('batteryName').textContent.includes('603450'));assert.ok(ids.get('dims').textContent.startsWith(C.cardboard.width.toFixed(1)));let message='';new Function('state','toast',extract('exportPart','initUI')+'\nexportPart("front");')(state,m=>message=m);assert.ok(message.includes('ไม่ส่งออก STL'));}
 const visibility=new Function('state','device','CONFIG','THREE','torsoGroup','floor','grid','calloutGroup',extract('applyVisibility','applyExplosion')+'\napplyVisibility();');
 for(const solder of [true,false]){state.solderView=solder;visibility(state,device,C,THREE,new THREE.Group(),new THREE.Group(),new THREE.Group());assert.equal(device.parts.front.visible,!solder);assert.equal(device.fov.visible,!solder);device.root.traverse(o=>{if(o.userData.sense||o.userData.ribbon)assert.equal(o.visible,!solder);});}
 checked++;
}
assert.equal(buttons.filter(b=>b.dataset.version).length,4);assert.ok(!/\?{3,}|Exploded view|A · Clip|B · Magnet|C · Pendant/.test(html),'Thai UI remains intact');
console.log('PASS: 12 UI states; version notes, real cardboard battery, disabled controls, STL guard, solder visibility and restoration; Thai UI intact');

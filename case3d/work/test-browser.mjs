// เปิด Edge แบบไม่มีหน้าต่าง ตรวจหน้าเว็บจริงและเก็บภาพ
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const local=process.argv.includes('--local-preview'),root=path.resolve('.'),profile=path.join(root,'work/.browser-check-2'),port=8767,debug=9767;
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if(req.url==='/favicon.ico'){res.writeHead(204).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(port,'127.0.0.1',r));
const executable=process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=spawn(executable,['--headless=new','--no-sandbox','--no-first-run','--disable-gpu-sandbox','--enable-unsafe-swiftshader','--disable-background-networking','--disable-extensions',`--remote-debugging-port=${debug}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map(),errors=[];let result=[];
try{
 let pages;for(let i=0;i<60;i++){try{pages=await(await fetch(`http://127.0.0.1:${debug}/json`)).json();if(pages.some(p=>p.type==='page'))break;}catch{}await sleep(250);}assert.ok(pages,'Edge remote debugger available');
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=e=>{const a=JSON.parse(e.data);if(a.id){const p=pending.get(a.id);pending.delete(a.id);a.error?p.reject(a.error):p.resolve(a.result);}else if(a.method==='Runtime.exceptionThrown')errors.push(a.params.exceptionDetails.exception?.description||a.params.exceptionDetails.text);else if(a.method==='Runtime.consoleAPICalled'&&a.params.type==='error')errors.push(a.params.args.map(x=>x.value||x.description).join(' '));};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),15000);pending.set(++id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await send('Runtime.enable');await send('Page.enable');await send('Browser.setDownloadBehavior',{behavior:'deny'});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:`http://127.0.0.1:${port}/${local?'work/preview-local.html':'outputs/index.html'}`});
 for(let i=0;i<100;i++){if(await run('!!window.__viewerReady'))break;if(errors.length)break;await sleep(300);}
 const ready=await run('!!window.__viewerReady'),networkBlocked=!ready&&errors.length>0&&errors.every(e=>e.includes('Failed to fetch dynamically imported module: https://cdn.jsdelivr.net/'));
 if(networkBlocked){const status='SKIP: full CDN app browser check; sandbox blocks jsDelivr module fetch';console.log(status);fs.writeFileSync('outputs/browser-check.json',JSON.stringify({status,errors},null,2));}else{
 assert.equal(ready,true,JSON.stringify({errors,status:await run('document.getElementById("loadStatus")?.textContent')}));
 const click=selector=>run(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const input=(id,value,event='input')=>run(`(()=>{const el=document.getElementById(${JSON.stringify(id)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);
 const capture=async file=>{await sleep(700);const {data}=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,file),Buffer.from(data,'base64'));};
 const shot=async name=>capture(`outputs/${name}.png`);
 if(local){
  await shot('local-v2');await run('__viewer.rebuild("inside")');await shot('local-inside');await run('__viewer.rebuild("solder")');await shot('local-solder');await run('__viewer.state.version="v1";__viewer.rebuild()');await shot('local-cardboard');await run('__viewer.state.version="v2";__viewer.state.variant="pendant";__viewer.state.angle=-12;__viewer.rebuild("front")');await capture('check-mic.png');
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: local Three.js geometry preview rendered in Edge; v2, internals, solder view and cardboard; no console errors (full CDN app not checked)');
 }else{
 assert.equal(await run('document.querySelectorAll("[data-version]").length'),4,'four versions available');
 await shot('check-v2');
 for(const version of ['v1','v2','v2p','legacy']){
  await click(`[data-version="${version}"]`);assert.equal(await run('__viewer.state.version'),version);
  assert.equal(await run('[...document.querySelectorAll("[data-export]")].every(b=>b.disabled)'),version==='v1','export buttons match version');
  assert.equal(await run('document.getElementById("versionNote").textContent.length>40'),true);
  await click('[data-view="solder"]');assert.equal(await run('__viewer.device.parts.front.visible'),false);
  assert.equal(await run(`(()=>{let bad=false;__viewer.device.root.traverse(o=>{if((o.userData.sense||o.userData.ribbon)&&o.visible)bad=true;});return bad;})()`),false,'Sense and ribbon hidden');
  assert.equal(await run('__viewer.device.root.getObjectByName("silk").visible'),true,'pin labels visible');
  if(version==='v2'){await shot('check-solder');await shot('check-backpads');}
  assert.equal(await run('__viewer.device.root.getObjectByName("silk").userData.padLabels.length'),9,'all back labels rendered');
  // ป้ายเลขจุดบัดกรี: ทุกก้อนตะกั่ว + D0 มีป้ายและรายการ, รุ่น 2 มีจุดที่ยังไม่ทำ 2 จุด, ออกจากมุมนี้แล้วซ่อน
  const joints=version.startsWith('v2')?7:5;await sleep(900);
  assert.equal(await run('[...document.querySelectorAll(".joint-label")].filter(e=>e.style.display!=="none").length'),joints+1,'one callout per joint + D0');
  assert.equal(await run('document.querySelectorAll("#solderList li").length'),joints+1);assert.equal(await run('document.getElementById("solderList").hidden'),false);
  assert.equal(await run('document.querySelectorAll("#solderList li.todo").length'),version.startsWith('v2')?2:0,'v2 charge joints marked not done');
  assert.equal(await run('document.getElementById("gapNote").textContent.includes("1.84")'),true,'clearance numbers visible');
  await click('[data-view="iso"]');assert.equal(await run('__viewer.device.parts.front.visible'),true);
  await sleep(150);assert.equal(await run('document.getElementById("solderList").hidden&&[...document.querySelectorAll(".joint-label")].every(e=>e.style.display==="none")'),true,'callouts hidden outside solder view');
  if(version==='v1')await shot('check-cardboard');
  await click('#dimensions');await click('#openFront');
  // เปิดฝาหน้า: ฝาด้านกล้อง + ฝาปุ่มหาย ของข้างในยังอยู่ที่เดิม
  assert.equal(await run('__viewer.device.parts.front.visible||__viewer.device.parts.cap.visible'),false,'open front hides camera-side cover');
  assert.equal(await run('__viewer.device.parts.board.visible&&__viewer.device.parts.battery.visible&&__viewer.device.parts.back.visible'),true,'inside parts stay visible');
  assert.equal(await run('__viewer.dimensionGroup.visible'),true);assert.equal(await run('__viewer.dimensionGroup.children.filter(o=>o.isCSS2DObject).length'),version.startsWith('v2')?7:4);
  await shot('check-open-'+version);
  if(version==='v1'){
   // มองแผงหน้าจากด้านใน ถอดฝาหลังเพื่ออ่านสาย/เทปจริง
   await click('#openFront');await run('__viewer.device.parts.back.visible=false;__viewer.camera.position.set(-100,90,-260);__viewer.camera.lookAt(0,5,10)');await shot('check-cardboard-inside');await run('__viewer.device.parts.back.visible=true');await click('[data-view="iso"]');await click('#openFront');
  }
  await click('#labels');assert.equal(await run('__viewer.device.labels.some(l=>l.visible&&(l.parent===__viewer.device.parts.front||l.parent===__viewer.device.parts.cap))'),false,'front labels hidden with the cover');await click('#labels');
  await input('explode',50);assert.equal(await run('document.getElementById("dimensionNote").textContent.includes("0%")'),true);await input('explode',0);
  await run('__viewer.rebuild()');assert.equal(await run('__viewer.device.parts.front.visible'),false,'open front survives rebuild');
  if(version!=='v1'){
   await run(`(()=>{const a=__viewer.exportPart('front');__viewer.state.openFront=false;const b=__viewer.exportPart('front');__viewer.state.openFront=true;if(a.bytes!==b.bytes)throw Error('open front changed STL');})()`);
  }
  await click('#openFront');assert.equal(await run('__viewer.device.parts.front.visible&&__viewer.device.parts.cap.visible'),true,'cover restored');await click('#dimensions');
 }
 // สลับรุ่นซ้ำแล้วทรัพยากรไม่สะสม
 await click('[data-version="v2"]');await sleep(100);const before=await run('({...__viewer.renderer.info.memory})');
 for(let i=0;i<4;i++){await click('[data-version="v1"]');await click('[data-version="legacy"]');await click('[data-version="v2"]');}
 await sleep(300);const after=await run('({...__viewer.renderer.info.memory})');assert.ok(after.textures<=before.textures&&after.geometries<=before.geometries,'rebuild releases textures and geometry');
 await click('#pendantModeToggle');assert.equal(await run('!!__viewer.pendantMode'),true,'pendant mode opens');assert.equal(await run('document.getElementById("pendantPanel").hidden'),false);
 await run(`(()=>{for(const [id,v] of [['pendantDesign','A'],['pendantCompareDesign','E'],['pendantScenario','brisk'],['pendantDrop','30']]){const el=document.getElementById(id);el.value=v;el.dispatchEvent(new Event('change'));}})()`);assert.equal(await run('document.getElementById("pendantDesign").options.length'),7,'all seven designs selectable');assert.equal(await run('__viewer.pendantMode.rigs.length'),2,'compare view shows two rigs');
 assert.equal(await run('__viewer.pendantMode.rigs.map(r=>r.clip.id).join(",")'),'A-brisk-30,E-brisk-30','brisk comparison places A and E together');
 const flipSlider=await run(`(()=>{const c=__viewer.pendantData.clips.find(x=>x.id==="A-brisk-30"),f=c.frames.find(x=>x.flip);return Math.round((f.t-c.frames[0].t)/(c.frames.at(-1).t-c.frames[0].t)*1000);})()`);
 await run(`(()=>{const b=document.getElementById("pendantPlay");if(b.textContent==="หยุด")b.click();})()`);await input('pendantTime',flipSlider);
 assert.equal(await run('__viewer.pendantMode.rigs[0].frame.flip'),true,'A clip is on a recorded flip frame');assert.equal(await run('__viewer.pendantMode.rigs[1].frame.flip'),false,'E clip stays camera-out');
 assert.ok((await run('document.getElementById("pendantFlip").textContent')).includes('กล้องหันเข้าอก'),'flip warning is shown');
 await run(`(()=>{const el=document.getElementById("status");el.textContent="";el.classList.remove("visible");})()`);
 await capture('check-pendant-anim.png');
 await click('#pendantExit');
 assert.equal(await run('__viewer.scene.getObjectByName("pendant-simulation")==null'),true,'exiting removes simulation objects');
 assert.equal(await run('document.getElementById("pendantPanel").hidden'),true,'exiting hides simulation controls');
 await run('document.getElementById("status").textContent=""');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await click('[data-view="fit"]');await shot('check-mobile');
 await click('#openFront');await click('#dimensions');await shot('check-mobile-open');assert.equal(await run('__viewer.dimensionGroup.visible&&__viewer.state.openFront&&!__viewer.device.parts.front.visible'),true,'mobile inspection enabled');assert.equal(await run(`(()=>{const r=[...document.querySelectorAll('.dimension-label')].map(e=>e.getBoundingClientRect());return r.every((a,i)=>r.every((b,j)=>i===j||a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom));})()`),true,'mobile dimension labels do not overlap');await click('#openFront');await click('#dimensions');
 assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'),'no mobile horizontal page overflow');
 assert.equal(errors.length,0,errors.join('\n'));
 result=['PASS: Edge headless; CDN page load, 4 versions, open-front cover toggle, dimension labels, opacity, explosion/rebuild, STL invariance/guards, solder view, pendant comparison and flip screenshot, scene cleanup, disposal, 390px mobile; no console errors'];
 console.log(result[0]);fs.writeFileSync('outputs/browser-check.json',JSON.stringify({result,errors,before,after},null,2));
 }
 }
 await send('Browser.close');
}finally{ws?.close();browser.kill();server.close();}

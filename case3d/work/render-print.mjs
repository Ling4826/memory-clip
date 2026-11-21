// ภาพจาก STL บนดิสก์และโมเดลประกอบ ใช้ Edge + Three.js ภายในเครื่อง
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const root=path.resolve('.'),port=8768,debug=9768,manifest=JSON.parse(fs.readFileSync('print/v2/manifest.json','utf8'));
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if(req.url==='/favicon.ico'){res.writeHead(204).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(port,'127.0.0.1',r));
const browser=spawn(process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--no-sandbox','--no-first-run','--disable-gpu-sandbox','--enable-unsafe-swiftshader','--disable-background-networking','--disable-extensions',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(root,'work/.print-browser')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws,id=0;const pending=new Map(),errors=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let pages;for(let i=0;i<60;i++){try{pages=await(await fetch(`http://127.0.0.1:${debug}/json`)).json();if(pages.some(p=>p.type==='page'))break;}catch{}await sleep(200);}assert.ok(pages,'Edge debugger available');
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>{const a=JSON.parse(e.data);if(a.id){const p=pending.get(a.id);pending.delete(a.id);a.error?p.reject(a.error):p.resolve(a.result);}else if(a.method==='Runtime.exceptionThrown')errors.push(a.params.exceptionDetails.exception?.description||a.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout '+method)),20000);pending.set(++id,{resolve:x=>{clearTimeout(timer);resolve(x);},reject});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1000,height:760,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:`http://127.0.0.1:${port}/work/print-preview.html`});
 for(let i=0;i<100;i++){if(await run('!!window.__printReady'))break;assert.equal(errors.length,0,errors.join('\n'));await sleep(100);}assert.equal(await run('!!window.__printReady'),true);
 for(const name of [...manifest.parts.map(p=>p.file),'assembled','exploded','solder']){
  await run(`printPreview.show(${JSON.stringify(name)})`);await sleep(120);const {data}=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('print/v2/img/'+name.replace('.stl','')+'.png',Buffer.from(data,'base64'));
 }
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: '+(manifest.parts.length+3)+' offline Edge PNG previews; '+manifest.parts.length+' pendant disk STLs plus assembled/exploded/solder v2; no console errors');
 // ตรวจเอกสารหลังสร้าง: ใช้ flag เพื่อเก็บหลักฐาน A4 และหน้าเว็บออฟไลน์
 if(process.argv.includes('--handout')){
  await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});
  await send('Page.navigate',{url:new URL('../print/v2/index.html',import.meta.url).href});await sleep(700);
  const checks=await run(`({images:document.images.length,complete:[...document.images].every(i=>i.complete&&i.naturalWidth>0),overflow:document.documentElement.scrollWidth>innerWidth,sections:document.querySelectorAll('section.page').length})`);
 assert.equal(checks.images,manifest.parts.length+3);assert.equal(checks.complete,true);assert.equal(checks.overflow,false);
  await send('Emulation.setEmulatedMedia',{media:'print'});
  const boxes=await run(`[...document.querySelectorAll('section.page')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height}})`);
  fs.mkdirSync('print/v2/img/a4-check',{recursive:true});
  for(let i=0;i<boxes.length;i++){const b=boxes[i],shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{...b,scale:1}});fs.writeFileSync('print/v2/img/a4-check/page-'+String(i+1).padStart(2,'0')+'.png',Buffer.from(shot.data,'base64'));}
  fs.writeFileSync('print/v2/preview-check.json',JSON.stringify({checks,a4SectionHeightsMm:boxes.map(b=>+(b.height*25.4/96).toFixed(2)),errors},null,2));
  assert.ok(boxes.every(b=>b.height<=273*96/25.4),'each section fits A4 content height 273 mm: '+boxes.map(b=>(b.height*25.4/96).toFixed(1)).join(', '));
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: offline Thai handout; '+checks.images+' embedded images loaded, no horizontal overflow; '+boxes.length+' sections fit A4 with 12 mm margins');
 }
 await send('Browser.close');
}finally{ws?.close();browser.kill();server.close();}

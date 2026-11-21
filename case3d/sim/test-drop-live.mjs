import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assess, classify, randomQuaternion, rotateDown, simulateVerticalDrop } from './drop-model.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const designs = JSON.parse(fs.readFileSync(path.join(root, 'drop-designs.json'), 'utf8'));
const closePct = (a, b) => Math.abs(a - b) / b * 100;
const designFor = key => ({ ...designs[key], cases: JSON.parse(fs.readFileSync(path.join(root, designs[key].fe), 'utf8')).cases });

// 1. The JavaScript port must reproduce every stored 1.3 m FE result of both designs.
for (const key of ['eyelet', 'lug']) {
  const design = designFor(key);
  for (const row of design.cases) for (const mat of ['PLA', 'PETG']) {
    const expected = row.drops.find(d => d.mat === mat && d.h === 1.3);
    const actual = assess(design, row.id, mat, 1.3);
    assert.ok(closePct(actual.F, expected.F) <= 5, `${key}/${row.id}/${mat}: force ${actual.F} vs ${expected.F}`);
    assert.ok(closePct(actual.ratio, expected.ratio) <= 5, `${key}/${row.id}/${mat}: ratio ${actual.ratio} vs ${expected.ratio}`);
  }
}
console.log('PASS 1: FE calibration for every collision point of both designs (PLA + PETG)');

// 2. Match drop-sim.mjs class proportions with 20,000 deterministic orientations.
let seed = 0x51a7;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const counts = { corner: 0, eyelet: 0, edge: 0, face: 0 };
for (let i = 0; i < 20000; i++) {
  const id = classify(rotateDown(randomQuaternion(random)));
  counts[id === 'eyelet' ? 'eyelet' : id === 'corner' ? 'corner' : id.startsWith('face') ? 'face' : 'edge']++;
}
for (const [id, expected] of Object.entries({ corner: 52, eyelet: 34, edge: 13, face: 1 })) {
  const pct = counts[id] / 200;
  assert.ok(Math.abs(pct - expected) <= 2, `${id}: ${pct}% differs from ${expected}% by more than 2 points`);
}
// 2b. Rev 3 (lug): analytic classify vs. brute-force lowest STL vertex.
const stlModel = (file, part, dy) => { const b = fs.readFileSync(path.join(root, file)), n = b.readUInt32LE(80), seen = new Map();
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const o = 84 + i * 50 + 12 + k * 12, x = b.readFloatLE(o), y = b.readFloatLE(o + 4), z = b.readFloatLE(o + 8);
    const v = part === 'back' ? [x, y + dy, z - 10.75] : [x, -y, 10.75 - z]; seen.set(v.map(c => c.toFixed(2)).join(), v); }
  return [...seen.values()]; };
const lug = designs.lug, lugPts = [...stlModel(lug.frontStl, 'front', 0), ...stlModel(lug.backStl, 'back', lug.backOffsetY)];
const groupOf = id => id.startsWith('tab') ? 'tab' : id === 'corner' ? 'corner' : id.startsWith('face') ? 'face' : 'edge';
const lugA = { tab: 0, corner: 0, edge: 0, face: 0 }, lugB = { tab: 0, corner: 0, edge: 0, face: 0 };
seed = 0x2b3c;
for (let i = 0; i < 20000; i++) {
  const d = rotateDown(randomQuaternion(random)); lugA[groupOf(classify(d, 'lug'))]++;
  let best = -Infinity, bp = null; for (const v of lugPts) { const h = v[0] * d[0] + v[1] * d[1] + v[2] * d[2]; if (h > best) { best = h; bp = v; } }
  lugB[bp[1] > 49.3 ? 'tab' : groupOf(classify(d, 'box'))]++;
}
for (const k of Object.keys(lugA)) assert.ok(Math.abs(lugA[k] - lugB[k]) / 200 <= 3, `lug ${k}: classify ${lugA[k] / 200}% vs STL ${lugB[k] / 200}%`);
console.log('PASS 2: 20,000 randomized orientations within ±2 points (eyelet) and ±3 points vs STL (lug: ' + Object.entries(lugA).map(([k, v]) => k + ' ' + (v / 200).toFixed(1) + '%').join(', ') + ')');

// 3. Check free-fall speed and a stable, non-sinking rest state.
const physics = simulateVerticalDrop(1);
const ideal = Math.sqrt(2 * 9.81);
assert.ok(closePct(physics.impactSpeed, ideal) <= 3, `${physics.impactSpeed} vs ${ideal}`);
assert.ok(physics.restingPenetrationMm <= 0.5, `${physics.restingPenetrationMm} mm rest penetration`);
console.log('PASS 3: 1 m impact speed and resting penetration');

// 4. Build standalone HTML and assert all assets and calculations are embedded.
const { exitCode, stderr } = await new Promise(resolve => {
  const child = spawn(process.execPath, ['sim/build-drop-live.mjs'], { cwd: path.resolve(root, '..'), windowsHide: true });
  let err = ''; child.stderr.on('data', c => err += c);
  child.on('close', code => resolve({ exitCode: code, stderr: err }));
});
assert.equal(exitCode, 0, stderr);
const htmlPath = path.join(root, 'drop-live.html'), html = fs.readFileSync(htmlPath, 'utf8');
for (const token of ['drop-data', 'drop-model', 'drop-fe-results', 'v2-front-shell', 'v2-back-shell', 'ConvexHull', 'OrbitControls', 'ปล่อยกล่อง', 'สุ่มตก 1,000 ครั้ง']) assert.ok(html.includes(token), `missing embedded feature: ${token}`);
assert.ok(html.includes('"front":"') && html.includes('"back":"'), 'STL payloads are embedded as base64');
console.log('PASS 4: standalone HTML build with embedded assets and model');

// 5. Launch real headless Edge, inspect the live view, first eyelet hit, and red hot-point indicator.
const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(fs.existsSync(edge), `Edge not found at ${edge}`);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'drop-live-edge-'));
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent((req.url || '/').split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port, debugPort = 9879;
const browser = spawn(edge, ['--headless=new', '--no-sandbox', '--no-first-run', '--disable-background-networking', '--disable-extensions', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let socket, nextId = 0;
const pending = new Map(), errors = []; let remoteClose = async () => {}; 
try {
  let pages;
  for (let i = 0; i < 80; i++) { try { pages = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); if (pages.some(p => p.type === 'page')) break; } catch {} await sleep(200); }
  assert.ok(pages?.some(p => p.type === 'page'), 'Edge debugger did not start');
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' ')); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; const timer = setTimeout(() => reject(Error(`CDP timeout: ${method}`)), 50000); pending.set(id, { resolve: x => { clearTimeout(timer); resolve(x); }, reject: x => { clearTimeout(timer); reject(x); } }); socket.send(JSON.stringify({ id, method, params })); });
  remoteClose = () => send('Browser.close').catch(() => {});
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/drop-live.html` });
  for (let i = 0; i < 120; i++) { if (await evaluate('!!window.__dropLive')) break; if (errors.length) break; await sleep(250); }
  assert.equal(await evaluate('!!window.__dropLive'), true, `page not ready: ${errors.join('; ')}`);
  assert.ok(await evaluate('__dropLive.hull.length>=150&&__dropLive.hull.length<=300'), 'convex hull reduction is outside 150–300 points');
  const dropWith = async (key, pose = 'head') => {
    await evaluate(`document.getElementById('design').value='${key}';document.getElementById('design').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('material').value='PLA';document.getElementById('material').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('pose').value='${pose}';document.getElementById('pose').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('height').value='1.3';document.getElementById('height').dispatchEvent(new Event('input',{bubbles:true}));__dropLive.reset();document.getElementById('drop').click()`);
    await evaluate("new Promise(resolve=>{let n=0;const timer=setInterval(()=>{if(__dropLive.state==='slow'){clearInterval(timer);resolve(true)}else if(++n>900){clearInterval(timer);resolve(false)}},50)})");
    assert.equal(await evaluate("__dropLive.state==='slow'"), true, `${key}: first impact did not enter slow motion`);
    const zNow = await evaluate("__dropLive.sim.p.z");
    assert.ok(zNow < 0.12, `${key}: box is not near the floor during slow motion (z=${zNow} m)`);
    const vHit = await evaluate("parseFloat(document.getElementById('speed').textContent)");
    assert.ok(Math.abs(vHit - Math.sqrt(2 * 9.81 * 1.3)) < 0.25, `${key}: panel should show the first impact at ~5.05 m/s, got ${vHit}`);
    return evaluate("({kind:__dropLive.impact.kind,level:document.getElementById('level').textContent,hot:!!__dropLive.impact.r.hot,light:(()=>{let f=false;__dropLive.scene.traverse(o=>{if(o.isPointLight)f=true});return f})(),crack:!!__dropLive.crack})");
  };
  const oldHit = await dropWith('eyelet');
  assert.ok(oldHit.kind.startsWith('eyelet') && oldHit.level.includes('ร้าว'), `eyelet head-down should crack: ${JSON.stringify(oldHit)}`);
  assert.ok(oldHit.hot && oldHit.light, 'red hot-point light was not placed');
  assert.ok(oldHit.crack, 'crack line was not drawn for a cracking hit');
  fs.writeFileSync(path.join(root, 'check-drop-live.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  const newHit = await dropWith('lug');
  assert.ok(newHit.kind.startsWith('tab') && !newHit.level.includes('ร้าว'), `lug head-down should not crack: ${JSON.stringify(newHit)}`);
  assert.ok(newHit.light && !newHit.crack, 'lug: expected hot-point light and no crack line');
  for (const key of ['eyelet', 'lug']) {
    const faceHit = await dropWith(key, 'face');
    const forceText = await evaluate("document.getElementById('force').textContent");
    assert.ok(faceHit.kind.startsWith('face') && /\d+ N/.test(forceText), `${key}: flat-face drop should show an FE force, got ${faceHit.kind} / ${forceText}`);
    assert.ok(await evaluate("document.getElementById('rimNote').textContent.includes('หน้าราบ')"), `${key}: flat-face caveat missing`);
  }
  await evaluate("document.getElementById('compare').click()");
  assert.ok(await evaluate("document.querySelectorAll('#compareCharts .row').length>=8&&document.getElementById('summary').textContent.includes('%')"), 'compare mode did not render two chart sets and the summary');
  await evaluate("document.getElementById('compareCharts').scrollIntoView()");
  fs.writeFileSync(path.join(root, 'check-drop-live-compare.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), '390 px view has horizontal overflow');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS 5: Edge: eyelet head-down cracks, lug head-down does not, compare charts render, screenshots saved, 390 px OK, no console errors');
} finally {
  try { socket?.close(); } catch {}
  await remoteClose(); browser.kill(); server.close(); await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}

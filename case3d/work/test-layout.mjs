import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const c = {window:{}}; vm.createContext(c);
vm.runInContext(fs.readFileSync('work/config.js','utf8'),c);
const CONFIG=c.window.CONFIG;
let source=''; try { source=fs.readFileSync('work/model.js','utf8'); } catch {}
assert.ok(source.includes('function computeLayout'), 'layout implementation is present');
vm.runInContext(source.slice(0,source.indexOf('// GEOMETRY HELPERS'))+'\nthis.layout=computeLayout;',c);
for(const battery of [500,1200]) {
 const p=c.layout(battery); const b=CONFIG.batteries[battery];
 assert.equal(p.d,2*CONFIG.case.wall+CONFIG.board.stackHeight+CONFIG.case.depthClearance+CONFIG.case.tiltReserve+1.5); assert.ok(p.w>=b.width+2*CONFIG.case.wall);
 assert.ok(p.batteryY+b.height/2<p.boardY-CONFIG.board.height/2);
 assert.ok(p.batteryY-b.height/2>-p.h/2+CONFIG.case.wall+CONFIG.case.usbBay);
}
assert.ok(c.layout(1200).w>c.layout(500).w);
assert.ok(c.layout(1200).h>c.layout(500).h);
const pendant=c.layout(1200,'pendant');
assert.equal((pendant.w-2*CONFIG.case.wall-pendant.battery.width)/2,CONFIG.v2.pendantBatteryClearance,'pendant battery side clearance');
assert.equal(pendant.bayGap,CONFIG.v2.pendantBatteryClearance,'pendant battery-to-board clearance');
console.log('PASS: both battery envelopes, lower battery placement and USB bay clearance');

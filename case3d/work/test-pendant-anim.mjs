// ตรวจข้อมูล build, การคั่นเฟรม, ทิศกล้อง และการคืนฉากของโหมดห้อยคอ
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';

const html = fs.readFileSync('outputs/index.html', 'utf8');
const payload = html.match(/<script\b[^>]*id=["']pendant-clips["'][^>]*>([\s\S]*?)<\/script>/i);
assert.ok(payload, 'build should embed pendant-clips.json in the HTML');
const data = JSON.parse(payload[1]);
const animationPath = new URL('./pendant-animation.mjs', import.meta.url);
assert.ok(fs.existsSync(animationPath), 'pendant animation helpers should exist');
const { samplePendantFrame, createPendantMode, expandPendantClip } = await import(animationPath.href);
assert.equal(data.clips.length, 63, 'designs A–G × 3 activities × 3 drops should be embedded');
for (const d of data.designs) for (const s of Object.keys(data.scenarios)) for (const m of data.drops)
  assert.ok(data.clips.some(clip => clip.id === `${d.id}-${s}-${Math.round(m * 100)}`), `clip ${d.id}-${s}-${m} exists`);
for (const clip of data.clips) {
  expandPendantClip(data, clip);
  assert.equal(clip.frames.length, 501, `${clip.id} should contain 501 frames`);
  assert.equal(clip.frames[0].cord.length, clip.attachFromCom.length + 2, `${clip.id} cord passes every attach point`);
}
// เชือกที่คำนวณใหม่ต้องเริ่มที่จุดยึดคอและผ่านจุดร้อยบนกล่อง
const e = data.clips.find(clip => clip.id === 'E-walk-15'), f0 = e.frames[0];
const neck = new THREE.Vector3(...e.anchorsLocal[0]).applyQuaternion(new THREE.Quaternion(f0.torso.q[1], f0.torso.q[2], f0.torso.q[3], f0.torso.q[0])).add(new THREE.Vector3(...f0.torso.p));
assert.ok(neck.distanceTo(new THREE.Vector3(...f0.cord[0])) < 0.01, 'cord starts at the neck anchor');
const brisk = data.clips.find(clip => clip.id === 'A-brisk-30');
const first = brisk.frames[0], second = brisk.frames[1];
const middle = samplePendantFrame(THREE, brisk, (second.t - first.t) / 2);
for (let axis = 0; axis < 3; axis++) {
  const low = Math.min(first.device.p[axis], second.device.p[axis]);
  const high = Math.max(first.device.p[axis], second.device.p[axis]);
  assert.ok(middle.device.p[axis] >= low && middle.device.p[axis] <= high,
    `device position axis ${axis} should interpolate between adjacent frames`);
}
assert.ok(middle.t > first.t && middle.t < second.t, 'sample time should lie between adjacent frames');

const mode = createPendantMode(THREE, data, ['A-brisk-30']);
const flipFrame = brisk.frames.find(frame => frame.flip);
assert.ok(flipFrame, 'A-brisk-30 should contain a camera flip');
const sliderTime = Math.round((flipFrame.t - brisk.frames[0].t) / (brisk.frames.at(-1).t - brisk.frames[0].t) * 1000) / 1000 * (brisk.frames.at(-1).t - brisk.frames[0].t);
assert.equal(samplePendantFrame(THREE, brisk, sliderTime).flip, true, 'slider-rounded time should still select the recorded flip frame');
mode.update(flipFrame.t - brisk.frames[0].t);
const cameraDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(mode.rigs[0].device.quaternion);
const chestNormal = new THREE.Vector3(...data.chest.normalLocal);
assert.ok(cameraDirection.dot(chestNormal) < 0, 'flipped box camera should point into the chest');

const scene = new THREE.Scene();
scene.add(mode.root);
mode.dispose();
assert.equal(scene.getObjectByName('pendant-simulation'), undefined, 'disposing the mode should remove its scene objects');
console.log('PASS: embedded clips, adjacent-frame interpolation, flip orientation and scene cleanup');

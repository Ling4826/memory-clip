// บันทึกท่าของกล่องทุกเฟรม (50 fps) จากการจำลองแบบห้อยคอ ให้หน้าโมเดล 3D เล่นเป็นแอนิเมชัน
// ครบทุกแบบ A–G × ท่าทาง (เดินปกติ/เดินเร็ว/วิ่งเหยาะ) × ระยะห้อย 15/22/30 ซม. = 63 คลิป
// รัน: node sim/record-clips.mjs  -> เขียน sim/pendant-clips.json (ใช้เวลาประมาณ 3 นาที)
// เก็บแบบย่อ: ลำตัวเก็บครั้งเดียวต่อท่าทาง (ไม่ขึ้นกับแบบกล่อง), กล่องเก็บ [px,py,pz,qw,qx,qy,qz] ต่อเฟรม,
// เชือกไม่เก็บ ให้หน้าเว็บคำนวณจากจุดยึดที่คอ (anchorsLocal) + จุดร้อยเชือกบนกล่อง (attachFromCom)
// พิกัด: มม., y ขึ้น, z ออกจากหน้าอก, จุดกำเนิด = จุดบนหน้าอกที่กล่องพิงตอนยืนนิ่ง
import { writeFileSync } from 'node:fs';
import { simulate, summarize, device, DESIGNS, SCENARIOS } from './pendant-sim.mjs';

const CHEST = 16, FROM = 4, TO = 14, FPS = 50;
const CLIP_SCENARIOS = ['walk', 'brisk', 'jog'], CLIP_DROPS = [15, 22, 30];
const SHORT = { A: 'ห่วงเดียว ชิดหลัง', B: 'ห่วงเดียว แนว COM', C: 'สองรู 30 มม.', D: 'สองรู 36 มม.', E: 'สองรู 36 มม. + แผ่นกันลื่น', F: 'ห่วงเดียว + แผ่นกันลื่น', G: 'สองรู แนว COM + แผ่นกันลื่น' };

const r2 = n => Math.round(n * 100) / 100, r4 = n => Math.round(n * 1e4) / 1e4;
const round = v => v.map(r2);
const scenarios = {}, clips = [];
const t0 = Date.now();
for (const scenario of CLIP_SCENARIOS) for (const d of DESIGNS) for (const dropCm of CLIP_DROPS) {
  const design = { ...d, drop: dropCm / 100, chest: CHEST }, frames = [];
  const r = simulate(design, SCENARIOS[scenario], { record: frames, recordFrom: FROM, tEnd: TO });
  const id = `${d.id}-${scenario}-${dropCm}`;
  if (r.error) throw new Error(`${id}: ${r.error}`);
  // ลำตัวเหมือนกันทุกแบบในท่าเดียวกัน: เก็บจากคลิปแรก แล้วตรวจว่าคลิปอื่นตรงกัน
  const torso = frames.flatMap(f => [...f.torso.p, ...f.torso.q]);
  if (!scenarios[scenario]) scenarios[scenario] = { label: SCENARIOS[scenario].label, t0: frames[0].t, frameCount: frames.length, torso };
  else if (scenarios[scenario].torso.length !== torso.length || scenarios[scenario].torso.some((v, i) => v !== torso[i])) throw new Error(`${id}: torso track differs`);
  const dev = device(design), [w, h, dd] = dev.dims, stats = summarize(r);
  console.log(id, frames.length, 'frames', JSON.stringify(stats));
  clips.push({
    id, design: d.id, scenario, drop: dropCm / 100,
    title: `แบบ ${d.id} (${SHORT[d.id]}) · ${SCENARIOS[scenario].label} · ห้อย ${dropCm} ซม.`,
    designName: d.name, chestDeg: CHEST, scenarioLabel: SCENARIOS[scenario].label, stats,
    box: { size: round([w, h, dd]), centerFromCom: round([0, -dev.com[1], -dev.com[2]]) }, // กล่อง: frame ของ device อยู่ที่ COM, กล้องชี้ +z
    attachFromCom: dev.attach.map(a => round(a.map(n => n * 1e3))), // จุดร้อยเชือก (ห่วงเดียว หรือ 2 รู)
    anchorsLocal: r.anchorsL.map(a => round(a.map(n => n * 1e3))),   // จุดยึดเชือกที่คอ ในพิกัดลำตัว
    loop: design.attach === 'single' ? { outer: [17, 9], hole: [10, 4], thickness: 3 } : null,
    pad: design.pad ? { size: [30, 50], thickness: 1.5 } : null,
    device: frames.flatMap(f => [...f.device.p, ...f.device.q]),
    flags: frames.map(f => (f.contact ? 1 : 0) + (f.flip ? 2 : 0)).join(''),
  });
}
const out = {
  note: 'ผลจากโมเดลอย่างง่ายใน sim/pendant-sim.mjs ค่าการเดิน หน้าอก และแรงหน่วงเป็นค่าสมมติ ใช้เทียบแบบต่อแบบ ไม่ใช่ค่าจริง',
  units: 'mm', fps: FPS, axes: 'y up, z out of chest (camera direction), torso local origin = chest contact point',
  chest: { normalLocal: round([0, Math.sin(CHEST * Math.PI / 180), Math.cos(CHEST * Math.PI / 180)]), pointLocal: [0, 0, 0] },
  frame: 'torso: world = p + rotate(q, local); device: world = p + rotate(q, body), body origin = COM; q = [w, x, y, z]; scenarios[s].torso and clip.device are flat [px,py,pz,qw,qx,qy,qz] per frame; flags digit = contact + 2*flip; cord = [torso(anchorsLocal[0]), device(attachFromCom)..., torso(anchorsLocal[1])]',
  designs: DESIGNS.map(d => ({ id: d.id, name: d.name, short: SHORT[d.id] })),
  drops: CLIP_DROPS.map(n => n / 100),
  scenarios,
  clips,
};
writeFileSync(new URL('./pendant-clips.json', import.meta.url), JSON.stringify(out));
console.log(`wrote pendant-clips.json · ${clips.length} clips · ${((Date.now() - t0) / 1000).toFixed(0)} s`);

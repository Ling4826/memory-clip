// จำลองกล่องคล้องคอตกพื้นแข็ง (กระเบื้อง/ปูน) แบบง่าย
// 1) สุ่มท่าตก 20,000 ครั้ง ดูว่าจุดไหนแตะพื้นก่อน (หน้า, ขอบ, มุม, ห่วงตะขอ)
// 2) แต่ละแบบ: จำลองการชนแบบ 2 มวล (เปลือก+บอร์ด / แบตบนโฟม) หาแรงชนสูงสุด, g, รอยบุบ
// 3) ประมาณความเค้นในจุดที่รับแรง เทียบกับกำลังของ PLA / PETG ที่พิมพ์แบบ FDM
// ทุกค่าวัสดุเป็นค่าทั่วไปจากตำรา ไม่ได้ทดสอบจริง ใช้เทียบว่าแบบไหนเสี่ยงกว่ากัน ไม่ใช่คำทำนายแม่นยำ
// รันจาก case3d/: node sim/drop-sim.mjs
import fs from 'node:fs';

const g0 = 9.81;
// ---- ขนาดและมวลจาก CONFIG/STL (มม., กรัม) ----
const box = { w: 40, h: 98, d: 21.5, r: 5 };              // กล่องหลัก มุมแนวตั้งโค้ง R5
const eye = { x: 18, y: 50.4, R: 5.1, hole: 2.0, t: 3, zMin: -10.75, zMax: -7.75 }; // ห่วงตะขอ 2 ข้าง (ศูนย์กลางห่วง y=55.5-5.1)
const wall = 1.5, faceFront = 2.2;
const mShell = 12.2 + 13.3;   // ฝาหน้า+ฝาหลัง (STL 11.5+12.6 cm3 × 1.24 g/cm3 × ~0.85 ตาม infill)
const mInner = 5.8 + 3.7;     // บอร์ด+Sense+กล้อง และปุ่ม สาย USB สกรู ยึดแน่นกับเปลือก
const mBat = 24;              // แบต 603450 1200mAh บนโฟม
const M = (mShell + mInner + mBat) / 1000; // kg
const COMz = -2.5;            // ประมาณ: แบตอยู่ฝั่งหลัง

const MAT = {
  PLA:  { E: 3.0e9, nu: 0.35, H: 120e6, inPlane: 45e6, interLayer: 25e6, brittle: true },
  PETG: { E: 2.0e9, nu: 0.38, H: 90e6,  inPlane: 45e6, interLayer: 35e6, brittle: false },
};
const foam = { E: 2e6, thick: 1.5, bottom: 1.0, area: 15e-3 * 52e-3 }; // EVA ด้านข้างแบต ยุบจาก 2 เหลือ 1.5 มม.
const heights = [0.75, 1.0, 1.3, 1.5]; // โต๊ะ, กระเป๋า, หลุดจากคอ, ยกมือ

// ---- 1) สุ่มท่าตก ----
function randQuat() { const u1 = Math.random(), u2 = Math.random(), u3 = Math.random();
  return [Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2), Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2), Math.sqrt(u1) * Math.sin(2 * Math.PI * u3), Math.sqrt(u1) * Math.cos(2 * Math.PI * u3)]; }
function rotT(q, v) { // หมุน v ด้วย q^-1 (ทิศ "ลง" ในพิกัดกล่อง)
  const [x, y, z, w] = q, ix = w * v[0] - y * v[2] + z * v[1], iy = w * v[1] - z * v[0] + x * v[2], iz = w * v[2] - x * v[1] + y * v[0], iw = x * v[0] + y * v[1] + z * v[2];
  return [ix * w + iw * x + iy * z - iz * y, iy * w + iw * y + iz * x - ix * z, iz * w + iw * z + ix * y - iy * x].map(c => -c); }
const deg = Math.PI / 180, tolFace = Math.sin(6 * deg);
function classify(d) { // d = ทิศลงพื้นในพิกัดกล่อง (หน่วย)
  // จุดต่ำสุดของกล่องมน: ส่วนกล่องแกน + วงกลม R5 ใน xy
  const hx = box.w / 2 - box.r, hy = box.h / 2 - box.r, hz = box.d / 2;
  const dxy = Math.hypot(d[0], d[1]) || 1e-9;
  const pBox = [Math.sign(d[0]) * hx + box.r * d[0] / dxy, Math.sign(d[1]) * hy + box.r * d[1] / dxy, Math.sign(d[2]) * hz];
  const sBox = pBox[0] * d[0] + pBox[1] * d[1] + (pBox[2] - 0) * d[2];
  let sEye = -Infinity;
  for (const sx of [-1, 1]) { const c = [sx * eye.x, eye.y]; const z = d[2] > 0 ? eye.zMax : eye.zMin;
    const s = c[0] * d[0] + c[1] * d[1] + eye.R * dxy + z * d[2]; if (s > sEye) sEye = s; }
  if (sEye > sBox + 0.05) return 'eyelet';
  if (Math.abs(d[2]) > Math.cos(6 * deg)) return 'face-big';           // ฝาหน้า/ฝาหลังราบ
  const ax = Math.abs(d[0]) / dxy, ay = Math.abs(d[1]) / dxy;
  const onAxis = ax > Math.cos(6 * deg) || ay > Math.cos(6 * deg);
  if (Math.abs(d[2]) < tolFace) return onAxis ? 'face-side' : 'edge-round'; // ผนังข้างราบ / ขอบโค้ง R5
  return onAxis ? 'edge-rim' : 'corner';                                   // ขอบรอบฝา / มุม
}
const N = 20000, counts = {};
for (let i = 0; i < N; i++) { const k = classify(rotT(randQuat(), [0, 0, -1])); counts[k] = (counts[k] || 0) + 1; }
const prob = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / N]));

// ---- 2) ชนแบบ 2 มวล ----
// จุดแตะพื้น: R = รัศมีโค้ง, L = ความยาวแนวสัมผัส (0 = จุด), mEff = สัดส่วนมวลที่รับแรงจริง (กล่องหมุนได้ จุดที่ชนห่างจุดศูนย์ถ่วง)
const CASES = {
  'face-big':   { th: 'ฝาหน้า/ฝาหลังราบ', flat: true, k: 6e7, mEff: 1.0, area: 0.04 * 0.098 },
  'face-side':  { th: 'ผนังข้างราบ', flat: true, k: 3e7, mEff: 0.9, area: 0.0215 * 0.098 },
  'edge-round': { th: 'ขอบโค้ง R5 (มุมกล่องมองจากหน้า)', R: 5e-3, L: 15e-3, mEff: 0.45 },
  'edge-rim':   { th: 'ขอบรอบฝา', R: 1e-3, L: 20e-3, mEff: 0.5 },
  'corner':     { th: 'มุม (จุดเดียว)', R: 2.2e-3, L: 0, mEff: 0.35 },
  'eyelet':     { th: 'ห่วงตะขอ', R: 5.1e-3, L: 3e-3, mEff: 0.3 },
};
function contactForce(c, m, delta, st) { // แรงสัมผัสพื้น ณ การยุบ delta (m), st เก็บสถานะ plastic
  if (delta <= 0) return 0;
  if (c.flat) return c.k * delta;
  const Es = m.E / (1 - m.nu * m.nu);
  let Fel, Fpl;
  if (c.L === 0) { Fel = 4 / 3 * Es * Math.sqrt(c.R) * delta ** 1.5; Fpl = 2 * Math.PI * c.R * m.H * delta; }
  else { Fel = Math.PI / 4 * Es * c.L * delta; Fpl = m.H * c.L * 2 * Math.sqrt(2 * c.R * delta); }
  if (delta >= st.dMax) { st.dMax = delta; st.Fmax = Math.min(Fel, Fpl); st.plastic = Fpl < Fel; return st.Fmax; }
  // คลายตัวแบบยืดหยุ่นจากจุดสูงสุด: รอยบุบถาวร = dMax - การยุบยืดหยุ่นที่ Fmax
  const dEl = c.L === 0 ? (st.Fmax / (4 / 3 * Es * Math.sqrt(c.R))) ** (2 / 3) : st.Fmax / (Math.PI / 4 * Es * c.L);
  st.dRes = Math.max(0, st.dMax - dEl);
  return delta <= st.dRes ? 0 : st.Fmax * ((delta - st.dRes) / Math.max(st.dMax - st.dRes, 1e-12)) ** (c.L === 0 ? 1.5 : 1);
}
function impact(c, mat, h) {
  const scale = c.mEff, m1 = (mShell + mInner) / 1000 * scale, m2 = mBat / 1000 * scale;
  const kf = foam.E * foam.area / (foam.thick * 1e-3), kHard = 2e7;
  const v0 = Math.sqrt(2 * g0 * h);
  let x1 = 0, x2 = 0, v1 = -v0, v2 = -v0, t = 0; const dt = 2e-8, st = { dMax: 0, Fmax: 0, dRes: 0 };
  let Fpk = 0, a1pk = 0, a2pk = 0, tOn = null, tOff = null, foamBottom = false;
  for (let i = 0; i < 2e6; i++) {
    const delta = -x1, F = contactForce(c, mat, delta, st);
    const rel = x2 - x1; // แบตเคลื่อนเข้าหาพื้นเทียบกับเปลือก = rel < 0
    let Ff = -kf * rel; if (-rel > foam.bottom * 1e-3) { Ff += kHard * (-rel - foam.bottom * 1e-3); foamBottom = true; }
    Ff += -2 * 0.15 * Math.sqrt(kf * m2) * (v2 - v1); // หน่วงในโฟม
    const a1 = (F - Ff) / m1 - g0, a2 = Ff / m2 - g0;
    v1 += a1 * dt; v2 += a2 * dt; x1 += v1 * dt; x2 += v2 * dt; t += dt;
    if (F > 0 && tOn === null) tOn = t;
    Fpk = Math.max(Fpk, F); a1pk = Math.max(a1pk, Math.abs(a1)); a2pk = Math.max(a2pk, Math.abs(a2));
    if (tOn !== null && F === 0 && v1 > 0 && x1 > 0) { tOff = t; break; }
  }
  return { F: Fpk, gShell: a1pk / g0, gBat: a2pk / g0, ms: (tOff - tOn) * 1e3, dent: st.dRes * 1e3, plastic: st.plastic, vOut: v1, foamBottom };
}
// ---- 3) ความเค้น (MPa) จากแรงชน ----
function stress(kind, F, mat) {
  switch (kind) {
    case 'face-big': return { s: F / (2 * (40 + 98) * wall) * 2, lim: mat.inPlane, where: 'ผนังรอบฝารับแรงอัด' };
    case 'face-side': return { s: F / (2 * 21.5 * wall) * 2, lim: mat.interLayer, where: 'ผนังข้าง (แรงขวางชั้นพิมพ์)' };
    case 'edge-round': return { s: 2 * F / (15 * wall), lim: mat.inPlane, where: 'ผนังโค้งตรงขอบ' };
    case 'edge-rim': return { s: 2 * F / (20 * wall), lim: mat.interLayer, where: 'ขอบฝา (แรงขวางชั้นพิมพ์)' };
    case 'corner': return { s: 2 * F / (2 * wall * 6), lim: mat.interLayer, where: 'มุมกล่อง (แรงขวางชั้นพิมพ์)' };
    case 'eyelet': return { s: 0.138 * F, lim: mat.inPlane, where: 'โคนห่วงตะขอ (ดัดในระนาบชั้นพิมพ์)' };
  }
}
const results = [];
for (const [mname, mat] of Object.entries(MAT)) for (const h of heights) for (const [kind, c] of Object.entries(CASES)) {
  const r = impact(c, mat, h), s = stress(kind, r.F, mat), ratio = s.s * 1e0 / (s.lim / 1e6);
  // ระดับความเสียหาย
  let level;
  if (ratio >= 1) level = mat.brittle ? 'ร้าว/บิ่น' : 'เสียรูป/ร้าวเล็ก';
  else if (ratio >= 0.7 || r.dent > 0.15) level = 'รอยบุบ/ขาว';
  else if (r.dent > 0.02) level = 'รอยเล็กน้อย';
  else level = 'ไม่เสียหาย';
  results.push({ mat: mname, h, kind, th: c.th, p: prob[kind] || 0, ...r, stress: s.s, limit: s.lim / 1e6, ratio, where: s.where, level });
}
// โอกาสเสียหายต่อการตก 1 ครั้ง (ถ่วงด้วยโอกาสท่าตก)
const risk = {};
for (const r of results) { const k = r.mat + '@' + r.h; risk[k] ??= { crack: 0, dent: 0 };
  if (r.level.startsWith('ร้าว') || r.level.startsWith('เสียรูป')) risk[k].crack += r.p; else if (r.level !== 'ไม่เสียหาย') risk[k].dent += r.p; }
// ชิ้นส่วนข้างใน (ใช้กรณีตกจาก 1.3 ม.)
const inner = {};
for (const mname of Object.keys(MAT)) { const rs = results.filter(r => r.mat === mname && r.h === 1.3);
  const gMax = Math.max(...rs.map(r => r.gShell)), gBat = Math.max(...rs.map(r => r.gBat));
  inner[mname] = { gBoardMax: gMax, gBatMax: gBat,
    senseForceN: (1.8 + 1.2) / 1000 * gMax * g0, batInertiaN: mBat / 1000 * gBat * g0,
    foamFrictionN: 2 * 0.5 * (foam.E * 0.25) * foam.area * 2 /* สองข้าง ยุบ 25% μ0.5 */ ,
    foamBottom: rs.some(r => r.foamBottom) }; }
const out = { note: 'โมเดลอย่างง่าย: ค่าวัสดุทั่วไป ไม่ได้ทดสอบจริง พื้นแข็งไม่ยุบ ใช้เทียบความเสี่ยง', massG: M * 1000, prob, results, risk, inner };
fs.writeFileSync('sim/drop-results.json', JSON.stringify(out, null, 1));
console.log('mass', (M * 1000).toFixed(1), 'g'); console.log('prob', JSON.stringify(Object.fromEntries(Object.entries(prob).map(([k, v]) => [k, (v * 100).toFixed(1) + '%']))));
for (const r of results) if (r.h === 1.3 || r.h === 0.75) console.log(r.mat.padEnd(4), r.h, r.kind.padEnd(10), 'F', r.F.toFixed(0).padStart(5), 'N  g', r.gShell.toFixed(0).padStart(5), ' gBat', r.gBat.toFixed(0).padStart(4), ' ms', r.ms.toFixed(2), ' dent', r.dent.toFixed(3), ' σ', r.stress.toFixed(1), '/', r.limit, ' →', r.level);
console.log('risk', JSON.stringify(risk)); console.log('inner', JSON.stringify(inner));

// จำลองการแกว่งของ Memory Clip แบบห้อยคอ: กล่องแข็ง 3 มิติ + เชือกคล้องคอ (ตึงอย่างเดียว ลอดห่วงได้) + หน้าอกเป็นระนาบมีแรงเสียดทาน
// หน่วย SI (m, kg, s) ทุกค่าของร่างกาย/การเดินเป็นค่าประมาณ ใช้เปรียบเทียบแบบต่อแบบ ไม่ใช่ทำนายค่าจริง
// รัน: node sim/pendant-sim.mjs [ชื่อไฟล์ผล]  -> เขียน sim/results.json (ใช้เวลาหลายนาที)
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEG = Math.PI / 180, G = 9.81;

// ---------- vector / matrix ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const mv = (M, v) => [dot(M[0], v), dot(M[1], v), dot(M[2], v)];
const mtv = (M, v) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
const mm = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const rotX = a => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const rotY = a => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const quatMat = ([w, x, y, z]) => [
  [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
  [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
  [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
const matQuat = M => { // M เป็น rotation matrix ที่ trace > -1 ในกรณีที่ใช้
  const w = Math.sqrt(Math.max(0, 1 + M[0][0] + M[1][1] + M[2][2])) / 2;
  return [w, (M[2][1] - M[1][2]) / (4 * w), (M[0][2] - M[2][0]) / (4 * w), (M[1][0] - M[0][1]) / (4 * w)];
};

// ---------- อุปกรณ์: ขนาดตาม layout ใน work/config.js แต่ใช้แบตที่วัดจริง 34 × 54 × 4 มม. ----------
function device(design) {
  const mmm = 1e-3, wall = 1.5, endClr = 2, bayGap = 4, usbBay = 8, side = 4;
  const board = { w: 17.8, h: 21, stack: 15, baseZ: -4 }, bat = { w: 34, h: 54, d: 4, mass: 20 };
  const w = Math.max(board.w, bat.w) + 2 * (wall + side);
  const h = board.h + bat.h + bayGap + usbBay + 2 * (wall + endClr);
  const d = 2 * wall + board.stack + 2 + 3;
  const boardY = h / 2 - wall - endClr - board.h / 2, batY = boardY - board.h / 2 - bayGap - bat.h / 2;
  const batZ = -d / 2 + wall + 1.6 + bat.d / 2, area = w * h / (36 * 75);
  // [มวล g, y มม., z มม.] จาก CONFIG.mass (ค่าประมาณ ต้องชั่งจริง)
  const parts = [
    [6.7 * area, 0, d / 4], [7.1 * area, 0, -d / 4],                 // ฝาหน้า / ฝาหลัง
    [2.8 + 1.8 + 1.2 + 0.1, boardY, board.baseZ + board.stack / 2],  // XIAO + Sense + กล้อง + LED
    [bat.mass, batY, batZ],                                          // แบต
    [0.65 + 0.45, boardY - 6, d / 2 - 3],                            // ปุ่ม + ฝาปุ่ม
    [0.8, -h / 2 + wall + 3, 0], [0.7, -h / 2 + wall + 5, 0],        // breakout USB / ไดโอด+ผนังเสริม
    [0.9 + 0.35, 0, -2], [0.7, 0, 0],                                // สาย+เสาอากาศ / สกรู 4 ตัว
    [design.pad ? 1.5 : 0, batY, -d / 2],                            // แผ่นซิลิโคนหลัง (ถ้ามี)
  ];
  const loopY = h / 2 + 9 / 2 - 1.2; // ห่วงยื่นจากขอบบน (CONFIG.pendant)
  if (design.attach === 'single') parts.push([0.8, loopY, -d / 2 + 1.5]);
  else parts.push([0.5, loopY - 3, 0], [0.5, loopY - 3, 0]);
  const m = parts.reduce((s, p) => s + p[0], 0);
  const com = [0, parts.reduce((s, p) => s + p[0] * p[1], 0) / m, parts.reduce((s, p) => s + p[0] * p[2], 0) / m];
  // ตำแหน่งห่วง (body frame อ้างจาก COM): z ตาม design.loopZ
  const zOf = { back: -d / 2 + 1.5, com: com[2], front: d / 2 - 1.5 }[design.loopZ];
  const xs = design.attach === 'single' ? [0] : [-design.spacing / 2, design.spacing / 2];
  const yAttach = design.attach === 'single' ? loopY : h / 2 - 3; // แบบสองรู: เจาะรูที่มุมบนในเนื้อกล่อง
  const attach = xs.map(x => mul([x, yAttach - com[1], zOf - com[2]], mmm));
  // จุดสัมผัสหน้าอก: กริด 3×5 บนผิวหลัง + มุมหน้า 4 มุม (กันกรณีพลิกคว่ำ)
  const contacts = [];
  for (const x of [-w / 2 + 3, 0, w / 2 - 3]) for (const y of [-h / 2 + 3, -h / 4, 0, h / 4, h / 2 - 3]) contacts.push(mul([x, y - com[1], -d / 2 - com[2]], mmm));
  for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) contacts.push(mul([x, y - com[1], d / 2 - com[2]], mmm));
  const M = m * mmm, W = w * mmm, H = h * mmm, D = d * mmm; // inertia: กล่องตันสม่ำเสมอรอบ COM (ประมาณ)
  const I = [M * (H * H + D * D) / 12, M * (W * W + D * D) / 12, M * (W * W + H * H) / 12];
  return { m: M, I, attach, contacts, dims: [w, h, d], com, massG: m, loopZmm: zOf, comToLoopMm: [0, (yAttach - com[1]), zOf - com[2]] };
}

// ---------- การเคลื่อนไหวของลำตัว ----------
// ลำตัว: จุดกำเนิด = จุดบนหน้าอกที่กล่องพิง, หมุน yaw/pitch รอบจุดหมุน S (สะโพก/กระดูกสันหลัง)
// ค่าประมาณการเดิน: ขึ้นลงที่ความถี่ก้าว, ส่ายข้างและบิดลำตัวที่ความถี่ช่วงก้าวคู่ (stride)
const SCENARIOS = {
  stand:  { f: 0.25, vert: 1, lat: 4, fore: 3, yaw: 1, pitch: 0.5, lean: 0, label: 'ยืนนิ่ง' },
  desk:   { f: 0.25, vert: 1, lat: 2, fore: 2, yaw: 1, pitch: 0.5, lean: 25, label: 'นั่งโน้มตัว 25°' },
  walk:   { f: 1.8, vert: 20, lat: 20, fore: 10, yaw: 4, pitch: 1.5, lean: 3, label: 'เดินปกติ' },
  brisk:  { f: 2.1, vert: 25, lat: 20, fore: 15, yaw: 6, pitch: 2, lean: 5, label: 'เดินเร็ว' },
  jog:    { f: 2.7, vert: 40, lat: 15, fore: 20, yaw: 8, pitch: 3, lean: 8, label: 'วิ่งเหยาะ' },
};
const S_PIVOT = [0, -0.35, -0.10];
function torsoPose(sc, t) {
  const ramp = t < 2 ? 0 : t < 4 ? 0.5 - 0.5 * Math.cos(Math.PI * (t - 2) / 2) : 1; // 2 s แรกนิ่งให้ห้อยเข้าที่
  const w = 2 * Math.PI * sc.f, w2 = w / 2, k = ramp * 1e-3;
  const T = [k * sc.lat * Math.sin(w2 * t + 0.3) + k * 3 * Math.sin(2.3 * t),
    k * sc.vert * Math.sin(w * t) + k * 0.3 * sc.vert * Math.sin(2 * w * t + 1),
    k * sc.fore * Math.sin(w * t + 1.2) + k * 2 * Math.sin(1.7 * t)];
  const yaw = ramp * DEG * (sc.yaw * Math.sin(w2 * t + 0.8) + 0.5 * Math.sin(1.3 * t));
  const pitch = DEG * (Math.min(1, t / 2) * sc.lean + ramp * sc.pitch * Math.sin(w * t + 0.5));
  return { T, R: mm(rotY(yaw), rotX(pitch)) };
}
const toWorld = (P, pl) => add(add(P.T, S_PIVOT), mv(P.R, sub(pl, S_PIVOT)));
const toLocal = (P, pw) => add(mtv(P.R, sub(sub(pw, P.T), S_PIVOT)), S_PIVOT);

// ---------- จำลอง ----------
function simulate(design, sc, opt = {}) {
  const dev = device(design), dt = 5e-5, tEnd = opt.tEnd ?? 20, tMeasure = 5;
  const th = design.chest * DEG, nL = [0, Math.sin(th), Math.cos(th)]; // ระนาบหน้าอกหันหน้า+เงยขึ้น θ
  const kC = 300, cC = 1.5, mu = design.pad ? 0.8 : 0.35, eps = 0.002;
  const kCord = 3000, cCord = 2 * 0.3 * Math.sqrt(kCord * dev.m);
  // หน่วงรวม (อากาศ + เชือกถูคอ): ζ ≈ 0.03 ของการแกว่งแบบลูกตุ้ม ~1 Hz เป็นค่าสมมติ = หยุดแกว่งเองใน 5–10 รอบ
  const cLin = 0.02, cRot = 1e-4;
  // ท่าเริ่ม: ผิวหลังแนบระนาบหน้าอก
  const Rb0 = [[1, 0, 0], [0, Math.cos(th), Math.sin(th)], [0, -Math.sin(th), Math.cos(th)]];
  let q = matQuat(Rb0);
  const backOffset = -Math.min(...dev.contacts.slice(0, 15).map(c => c[2]));
  let x = add(mul(nL, backOffset + 0.0002), [0, 0, 0]), v = [0, 0, 0], w = [0, 0, 0];
  // จุดยึดเชือกที่คอ: ห่างกัน 92 มม. สูงเหนือห่วง design.drop, อยู่หลังจุดพิงหน้าอก 70 มม.
  const Rq = quatMat(q), loopW = dev.attach.map(a => add(x, mv(Rq, a)));
  const topY = Math.max(...loopW.map(p => p[1]));
  const anchorsL = [[-0.046, topY + design.drop, -0.07], [0.046, topY + design.drop, -0.07]];
  const cordPath = (P, pts) => [toWorld(P, anchorsL[0]), ...pts, toWorld(P, anchorsL[1])];
  const pathLen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += len(sub(pts[i], pts[i - 1])); return s; };
  const L0 = pathLen(cordPath(torsoPose(sc, 0), loopW));

  const camB = [0, 0, 1]; // แกนหน้ากล่อง (ก่อนเอียงกล้องภายใน)
  const out = { pitch: [], yaw: [], roll: [], omega: [], swing: [], lift: 0, flip: 0, n: 0, omegaTorso: [] };
  let rest = null;
  const steps = Math.round(tEnd / dt);
  for (let i = 1; i <= steps; i++) {
    const t = i * dt, P = torsoPose(sc, t), Pn = torsoPose(sc, t + 1e-5), Pp = torsoPose(sc, t - 1e-5);
    const Tdot = mul(sub(Pn.T, Pp.T), 1 / 2e-5);
    // ω ลำตัว จาก dR/dt R^T
    const dR = Pn.R.map((r, a) => r.map((val, b) => (val - Pp.R[a][b]) / 2e-5)), Wm = mm(dR, P.R.map((_, a) => [P.R[0][a], P.R[1][a], P.R[2][a]]));
    const wT = [(Wm[2][1] - Wm[1][2]) / 2, (Wm[0][2] - Wm[2][0]) / 2, (Wm[1][0] - Wm[0][1]) / 2];
    const pivotW = add(P.T, S_PIVOT), surfVel = p => add(Tdot, cross(wT, sub(p, pivotW)));
    const R = quatMat(q);
    let F = add([0, -dev.m * G, 0], mul(v, -cLin)), Tq = mul(w, -cRot), nTot = 0;
    // เชือก: แรงตึงเท่ากันตลอดเส้น ลอดห่วงได้
    const att = dev.attach.map(a => mv(R, a)), attW = att.map(a => add(x, a)), path = cordPath(P, attW);
    const Lc = pathLen(path);
    if (Lc > L0) {
      const vel = [surfVel(path[0]), ...att.map(a => add(v, cross(w, a))), surfVel(path[path.length - 1])];
      let Ld = 0; for (let j = 1; j < path.length; j++) { const u = mul(sub(path[j], path[j - 1]), 1 / len(sub(path[j], path[j - 1]))); Ld += dot(u, sub(vel[j], vel[j - 1])); }
      const Tn = Math.max(0, kCord * (Lc - L0) + cCord * Ld);
      for (let j = 1; j < path.length - 1; j++) {
        const toPrev = sub(path[j - 1], path[j]), toNext = sub(path[j + 1], path[j]);
        const f = mul(add(mul(toPrev, 1 / len(toPrev)), mul(toNext, 1 / len(toNext))), Tn);
        F = add(F, f); Tq = add(Tq, cross(att[j - 1], f));
      }
    }
    // หน้าอก: penalty + แรงเสียดทาน Coulomb แบบเรียบ
    const nW = mv(P.R, nL), originW = toWorld(P, [0, 0, 0]);
    for (const cb of dev.contacts) {
      const r = mv(R, cb), c = add(x, r), s = dot(nW, sub(c, originW));
      if (s >= 0) continue;
      const vr = sub(add(v, cross(w, r)), surfVel(c)), vn = dot(vr, nW);
      const fn = Math.max(0, -kC * s - cC * vn); if (!fn) continue;
      const vt = sub(vr, mul(nW, vn)), ft = mul(vt, -mu * fn / Math.sqrt(dot(vt, vt) + eps * eps));
      const f = add(mul(nW, fn), ft); F = add(F, f); Tq = add(Tq, cross(r, f)); nTot += fn;
    }
    // อินทิเกรต (semi-implicit Euler)
    const Iw = R.map((_, a) => [0, 1, 2].map(b => R[a][0] * dev.I[0] * R[b][0] + R[a][1] * dev.I[1] * R[b][1] + R[a][2] * dev.I[2] * R[b][2]));
    const Iinv = R.map((_, a) => [0, 1, 2].map(b => R[a][0] / dev.I[0] * R[b][0] + R[a][1] / dev.I[1] * R[b][1] + R[a][2] / dev.I[2] * R[b][2]));
    v = add(v, mul(F, dt / dev.m)); x = add(x, mul(v, dt));
    w = add(w, mul(mv(Iinv, sub(Tq, cross(w, mv(Iw, w)))), dt));
    const [qw, qx, qy, qz] = q, [a, b, cq] = w;
    q = [qw + 0.5 * dt * (-a * qx - b * qy - cq * qz), qx + 0.5 * dt * (a * qw + b * qz - cq * qy), qy + 0.5 * dt * (b * qw + cq * qx - a * qz), qz + 0.5 * dt * (cq * qw + a * qy - b * qx)];
    const qn = Math.hypot(...q); q = q.map(e => e / qn);
    if (!Number.isFinite(x[1])) return { error: 'diverged' };
    // บันทึกท่าทุก 20 ms (50 fps) สำหรับแอนิเมชัน: ตำแหน่งเป็น มม. ในพิกัดโลก, ลำตัว world = p + R·local
    if (opt.record && i % 400 === 0 && t >= (opt.recordFrom ?? 4)) {
      const camL = mtv(P.R, mv(quatMat(q), camB)), r4 = n => Math.round(n * 1e4) / 1e4, mmv = p => p.map(n => Math.round(n * 1e5) / 100);
      opt.record.push({ t: r4(t), torso: { p: mmv(sub(add(P.T, S_PIVOT), mv(P.R, S_PIVOT))), q: matQuat(P.R).map(r4) },
        device: { p: mmv(x), q: q.map(r4) }, cord: path.map(mmv), contact: nTot > 0, flip: dot(camL, nL) < 0 });
    }
    // เก็บค่าทุก 2 ms
    if (i % 40) continue;
    const xl = toLocal(P, x);
    if (t > 4.5 && !rest) rest = xl;
    if (t < tMeasure) continue;
    const Rn = quatMat(q), camL = mtv(P.R, mv(Rn, camB)), xL = mtv(P.R, mv(Rn, [1, 0, 0]));
    out.pitch.push(Math.asin(camL[1]) / DEG); out.yaw.push(Math.atan2(camL[0], camL[2]) / DEG); out.roll.push(Math.asin(xL[1]) / DEG);
    out.omega.push(len(w) / DEG); out.omegaTorso.push(len(wT) / DEG);
    out.swing.push(len(sub(xl, rest)) * 1e3);
    out.n++; if (nTot === 0) out.lift++; if (dot(camL, nL) < 0) out.flip++;
  }
  return { dev, out, anchorsL };
}

// ---------- สถิติ ----------
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
// ภาพคม: เบลอ ≤ 3 px ที่ภาพกว้าง 1600 px / FOV 65° -> ความเร็วเชิงมุมสูงสุดที่รับได้ = 3 / (t_exp · px_per_rad)
const pxPerRad = 1600 / (65 * DEG), okIndoor = 3 / (pxPerRad / 30) / DEG, okOutdoor = 3 / (pxPerRad / 250) / DEG;
function summarize(r) {
  const o = r.out;
  return {
    pitchMean: +mean(o.pitch).toFixed(1), pitchStd: +std(o.pitch).toFixed(2), yawStd: +std(o.yaw).toFixed(2), rollStd: +std(o.roll).toFixed(2),
    omegaP90: +pct(o.omega, 0.9).toFixed(1), sharpIndoor: +(100 * o.omega.filter(x => x < okIndoor).length / o.n).toFixed(0),
    sharpOutdoor: +(100 * o.omega.filter(x => x < okOutdoor).length / o.n).toFixed(0),
    torsoSharpIndoor: +(100 * o.omegaTorso.filter(x => x < okIndoor).length / o.n).toFixed(0),
    torsoSharpOutdoor: +(100 * o.omegaTorso.filter(x => x < okOutdoor).length / o.n).toFixed(0),
    swingP90mm: +pct(o.swing, 0.9).toFixed(1), liftPct: +(100 * o.lift / o.n).toFixed(0), flipPct: +(100 * o.flip / o.n).toFixed(1),
  };
}

// ---------- ชุดทดลอง ----------
const DESIGNS = [
  { id: 'A', name: 'ห่วงเดียวกลางบน ชิดหลัง (แบบปัจจุบัน)', attach: 'single', loopZ: 'back', pad: false },
  { id: 'B', name: 'ห่วงเดียวกลางบน ตรงแนว COM', attach: 'single', loopZ: 'com', pad: false },
  { id: 'C', name: 'สองรูมุมบน ห่าง 30 มม. ชิดหลัง', attach: 'dual', spacing: 30, loopZ: 'back', pad: false },
  { id: 'D', name: 'สองรูมุมบน ห่าง 36 มม. ชิดหลัง', attach: 'dual', spacing: 36, loopZ: 'back', pad: false },
  { id: 'E', name: 'สองรู 36 มม. ชิดหลัง + แผ่นซิลิโคนหลัง', attach: 'dual', spacing: 36, loopZ: 'back', pad: true },
  { id: 'F', name: 'ห่วงเดียว ชิดหลัง + แผ่นซิลิโคนหลัง', attach: 'single', loopZ: 'back', pad: true },
  { id: 'G', name: 'สองรู 36 มม. ตรงแนว COM + แผ่นซิลิโคนหลัง', attach: 'dual', spacing: 36, loopZ: 'com', pad: true },
];
const DROPS = [0.15, 0.22, 0.30], CHESTS = [8, 16, 24], RUN_SC = ['walk', 'brisk', 'jog', 'stand', 'desk'];

export { simulate, summarize, device, DESIGNS, SCENARIOS, S_PIVOT };

// รันชุดทดลองเฉพาะตอนเรียกไฟล์นี้ตรงๆ (record-clips.mjs import ไปใช้โดยไม่รันชุดนี้)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = [];
  const t0 = Date.now();
  for (const d of DESIGNS) for (const drop of DROPS) for (const chest of CHESTS) for (const s of RUN_SC) {
    const r = simulate({ ...d, drop, chest }, SCENARIOS[s]);
    results.push({ design: d.id, drop, chest, scenario: s, ...(r.error ? { error: r.error } : summarize(r)), massG: r.dev?.massG });
  }
  const devInfo = Object.fromEntries(DESIGNS.map(d => { const v = device(d); return [d.id, { massG: +v.massG.toFixed(1), dims: v.dims.map(n => +n.toFixed(1)), comMm: v.com.map(n => +n.toFixed(1)), loopFromComMm: v.comToLoopMm.map(n => +n.toFixed(1)) }]; }));
  writeFileSync(new URL(process.argv[2] || './results.json', import.meta.url), JSON.stringify({ assumptions: { okIndoorDegPerS: +okIndoor.toFixed(1), okOutdoorDegPerS: +okOutdoor.toFixed(1), SCENARIOS, DROPS, CHESTS }, devInfo, results }, null, 1));
  console.log(`runs=${results.length} time=${((Date.now() - t0) / 1000).toFixed(1)}s errors=${results.filter(r => r.error).length}`);
  console.log('device', JSON.stringify(devInfo));
}

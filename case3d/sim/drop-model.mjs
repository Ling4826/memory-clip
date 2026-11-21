// Shared drop calculations for the live page and its Node tests.
export const G = 9.81;
export const MATERIALS = Object.freeze({
  PLA: Object.freeze({ E: 3.0e9, nu: 0.35, H: 120e6, inPlane: 45e6, inter: 25e6, brittle: true }),
  PETG: Object.freeze({ E: 2.0e9, nu: 0.38, H: 90e6, inPlane: 45e6, inter: 35e6, brittle: false }),
});
export const INERTIA = Object.freeze({ xx: 0.059 * (0.098 ** 2 + 0.0215 ** 2) / 12, yy: 0.059 * (0.040 ** 2 + 0.0215 ** 2) / 12, zz: 0.059 * (0.040 ** 2 + 0.098 ** 2) / 12 });
export const COM = Object.freeze([0, 0, -0.0025]);

const CASE_CONTACT = Object.freeze({
  'eyelet-top': { R: 5.1e-3, L: 3e-3 }, 'eyelet-diag': { R: 5.1e-3, L: 3e-3 },
  'corner-back': { R: 1e-3, L: 0 }, 'corner-front': { R: 1e-3, L: 0 }, 'rim-side': { R: 1e-3, L: 15e-3 },
});
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = a => Math.hypot(...a);

export function mEff(pointMm, normal) {
  const nlen = norm(normal);
  if (!(nlen > 0)) throw new RangeError('normal must be nonzero');
  const n = normal.map(x => x / nlen), r = pointMm.map((x, i) => x / 1000 - COM[i]), rn = cross(r, n);
  const invI = dot(rn, [rn[0]/INERTIA.xx, rn[1]/INERTIA.yy, rn[2]/INERTIA.zz]);
  return 1 / (1 / 0.059 + invI);
}

export function contact(c, mat, force) {
  const Es = mat.E / (1 - mat.nu ** 2), { R, L } = c;
  const count = 6000, maxD = 3e-3, step = maxD / (count - 1);
  const forceAt = d => L === 0
    ? Math.min(4/3 * Es * Math.sqrt(R) * d**1.5, 2*Math.PI*R*mat.H*d)
    : Math.min(Math.PI/4 * Es * L * d, mat.H*L*2*Math.sqrt(2*R*d));
  let i = 0;
  while (i < count - 1 && forceAt(i * step) < force) i++;
  let energy = 0, prev = 0;
  for (let j = 1; j <= i; j++) { const current = forceAt(j * step); energy += (prev + current) * 0.5 * step; prev = current; }
  const dent = i * step, elastic = L === 0 ? 4/3*Es*Math.sqrt(R)*dent**1.5 : Math.PI/4*Es*L*dent;
  return { dent, energy, plastic: forceAt(dent) < elastic };
}

export function peakForce(design, featureId, material, heightM, impactVelocity = null, actualPoint = null, actualNormal = null) {
  const row = design.cases.find(c => c.id === (design.contacts?.[featureId] ?? featureId));
  if (!row) return { approximate: true, F: null, g: null, dent: 0, s1: null, limit: null, ratio: null, level: 'ค่าประมาณ', hot: null, note: 'ค่าประมาณ ไม่ได้คำนวณ FE' };
  const mat = MATERIALS[material];
  if (!mat) throw new RangeError(`unknown material: ${material}`);
  const fe = row.fe, c = { ...CASE_CONTACT[row.id], ...row }, part = row.part ?? design.caseParts?.[row.id] ?? (row.id === 'corner-front' ? 'front' : 'back'), backOffsetY = row.backOffsetY ?? design.backOffsetY ?? 3.25;
  const P = actualPoint ?? (part === 'front' ? [fe.P_stl[0], -fe.P_stl[1], 10.75-fe.P_stl[2]] : [fe.P_stl[0], fe.P_stl[1]+backOffsetY, fe.P_stl[2]-10.75]);
  const n = actualNormal ?? (part === 'front' ? [fe.n_stl[0], -fe.n_stl[1], -fe.n_stl[2]] : [...fe.n_stl]);
  const me = mEff(P, n), velocity = impactVelocity ?? Math.sqrt(2 * G * heightM), kinetic = 0.5 * me * velocity ** 2;
  const stiffness = mat.E / fe.compliance_E1;
  let lo = 0, hi = 50000;
  for (let i = 0; i < 80; i++) {
    const f = (lo + hi) / 2, d = contact(c, mat, f), energy = f*f/(2*stiffness) + d.energy;
    if (energy < kinetic) lo = f; else hi = f;
  }
  const F = (lo + hi) / 2, d = contact(c, mat, F), s1 = fe.s1_perN * F;
  const limit = mat.inPlane * (1 - fe.vz**2) + mat.inter * fe.vz**2, ratio = s1 / limit;
  const level = ratio >= 1 ? (mat.brittle ? 'ร้าว' : 'ร้าว/งอ') : ratio >= 0.7 || (d.plastic && d.dent > 0.0003) ? 'บุบ/ขาว' : d.plastic && d.dent > 0.00005 ? 'รอยเล็กน้อย' : 'ไม่เสียหาย';
  const hotModel = part === 'front' ? [fe.hot[0], -fe.hot[1], 10.75-fe.hot[2]] : [fe.hot[0], fe.hot[1]+backOffsetY, fe.hot[2]-10.75];
  const baseModel = part === 'front' ? [fe.P_stl[0], -fe.P_stl[1], 10.75-fe.P_stl[2]] : [fe.P_stl[0], fe.P_stl[1]+backOffsetY, fe.P_stl[2]-10.75];
  // กล่องสมมาตรซ้าย-ขวาและบน-ล่าง: สะท้อนจุดร้อนไปฝั่งที่ชนจริง (ไม่เลื่อนตาม เพราะจุดชนจริงอาจอยู่ไกลจากจุดชนของ FE)
  const hot = hotModel.map((x, i) => (i < 2 && Math.abs(baseModel[i]) > 1 && Math.sign(P[i]) !== Math.sign(baseModel[i])) ? -x : x);
  return { F, g: F / me / G, dent: d.plastic ? d.dent * 1000 : 0, s1, limit, ratio, level, hot, mEff: me, kStruct: stiffness, approximate: false };
}

export function assess(design, featureId, material, heightM, impactVelocity = null, actualPoint = null, actualNormal = null) {
  return peakForce(design, featureId, material, heightM, impactVelocity, actualPoint, actualNormal);
}

export function classify(d, shape = 'eyelet') {
  const [dx, dy, dz] = d, box = { w:40, h:98, d:21.5, r:5 }, eye = { x:18, y:50.4, R:5.1, zMin:-10.75, zMax:-7.75 };
  const dxy = Math.hypot(dx, dy) || 1e-9, hx=box.w/2-box.r, hy=box.h/2-box.r, hz=box.d/2;
  const p=[Math.sign(dx)*hx+box.r*dx/dxy, Math.sign(dy)*hy+box.r*dy/dxy, Math.sign(dz)*hz];
  const sb=dot(p,d); let se=-Infinity;
  for (const sx of [-1,1]) se=Math.max(se,sx*eye.x*dx+eye.y*dy+eye.R*dxy+(dz>0?eye.zMax:eye.zMin)*dz);
  if (shape === 'eyelet' && se > sb + .05) return 'eyelet';
  if (shape === 'lug') {
    const support = (cx,cy,hx,hy,r,z0,z1) => cx*dx+cy*dy+(hx-r)*Math.abs(dx)+(hy-r)*Math.abs(dy)+r*dxy+Math.max(z0*dz,z1*dz);
    const boxSupport=support(0,0,20,49,5,-10.75,10.75), tabSupport=support(0,51.75,20,4.25,3,-10.75,0);
    const comDz = dz;
    if (tabSupport > boxSupport + .05) {
      if (Math.abs(dx)/dxy < Math.sin(6*Math.PI/180)) return 'tab-top';
      if (Math.abs(comDz) < Math.sin(6*Math.PI/180)) return 'tab-edge';
      return 'tab-corner';
    }
  }
  if (shape === 'eyelet' && se > sb + .05) return 'eyelet';
  const tol=Math.sin(6*Math.PI/180);
  if (Math.abs(dz)>Math.cos(6*Math.PI/180)) return 'face-big';
  const ax=Math.abs(dx)/dxy, ay=Math.abs(dy)/dxy, onAxis=ax>Math.cos(6*Math.PI/180)||ay>Math.cos(6*Math.PI/180);
  if (Math.abs(dz)<tol) return onAxis?'face-side':'edge-round';
  return onAxis?'edge-rim':'corner';
}

export function randomQuaternion(random = Math.random) {
  const u1=random(),u2=random(),u3=random();
  return [Math.sqrt(1-u1)*Math.sin(2*Math.PI*u2),Math.sqrt(1-u1)*Math.cos(2*Math.PI*u2),Math.sqrt(u1)*Math.sin(2*Math.PI*u3),Math.sqrt(u1)*Math.cos(2*Math.PI*u3)];
}
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export function rotateDown(q) {
  const [x,y,z,w]=q, v=[0,0,-1], ix=w*v[0]-y*v[2]+z*v[1], iy=w*v[1]-z*v[0]+x*v[2], iz=w*v[2]-x*v[1]+y*v[0], iw=x*v[0]+y*v[1]+z*v[2];
  return [ix*w+iw*x+iy*z-iz*y,iy*w+iw*y+iz*x-ix*z,iz*w+iw*z+ix*y-iy*x].map(c=>-c);
}

export function simulateVerticalDrop(heightM = 1, massKg = 0.059, springNPerM = 60000, dampingNsPerM = 75) {
  const dt = 0.00005, end = 2, steps = Math.ceil(end / dt);
  let z = heightM, v = 0, firstImpactSpeed = null;
  for (let i = 0; i < steps; i++) {
    const penetration = Math.max(0, -z);
    if (penetration > 0 && firstImpactSpeed === null) firstImpactSpeed = Math.abs(v);
    const contactForce = penetration > 0 ? Math.max(0, springNPerM * penetration - dampingNsPerM * Math.min(v, 0)) : 0;
    v += (contactForce / massKg - G) * dt;
    z += v * dt;
    if (i > steps * 0.75 && Math.abs(v) < 0.002 && Math.abs(z) < 0.0005) return { impactSpeed: firstImpactSpeed, restingPenetrationMm: Math.max(0, -z) * 1000 };
  }
  return { impactSpeed: firstImpactSpeed, restingPenetrationMm: Math.max(0, -z) * 1000 };
}

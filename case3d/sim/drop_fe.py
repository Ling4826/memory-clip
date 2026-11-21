# จำลองกล่องตกแบบ FE (voxel) บนไฟล์ STL ที่ส่งพิมพ์จริง (แบบห่วงยื่น รอบ 23 ต.ค.)
# วิธี: แบ่งเนื้อพลาสติกรอบจุดชนเป็นลูกเต๋า 0.5 มม. (hex 8 จุด) คำนวณการยุบตัวแบบสถิต
#   -> ได้ความแข็ง k ของโครงสร้างตรงจุดชน และความเค้นต่อแรง 1 N
#   -> ใช้สมดุลพลังงานตอนตก (มวลเทียบเท่า + ความแข็งโครงสร้าง + การยุบตรงจุดสัมผัส) หาแรงสูงสุด
#   -> เทียบความเค้นดึงสูงสุดกับกำลังของ PLA/PETG แบบ FDM (แยกในระนาบชั้นพิมพ์ / ขวางชั้น)
# ขอบเขต: ตัดเฉพาะรัศมี 16 มม. รอบจุดชน ขอบที่ตัดยึดแน่น (แข็งกว่าจริง -> แรงสูงกว่าจริง = ระวังไว้ก่อน)
#         ลูกเต๋า 3 ชั้นในผนัง 1.5 มม. ทำให้แข็งเกินจริงเล็กน้อย; ค่าวัสดุเป็นค่าทั่วไป ไม่ได้ทดสอบ
# รัน: "D:\ADONO\Memory Clip\.venv-dfam\Scripts\python.exe" sim/drop_fe.py   (จาก case3d/)
import json, math, sys, time
import numpy as np, trimesh
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve

import os
PITCH = float(os.environ.get("FE_PITCH", 0.5)); R_CROP = float(os.environ.get("FE_RCROP", 16.0)); PATCH = 1.0
ONLY = os.environ.get("FE_ONLY", "").split(",") if os.environ.get("FE_ONLY") else None
OUT = os.environ.get("FE_OUT", "sim/drop-fe-results.json")
STL = {'back': os.environ.get('FE_BACK_STL', 'sim/designs/eyelet/v2-back-shell-pendant.stl'), 'front': 'sim/designs/eyelet/v2-front-shell.stl'}   # แบบห่วงยื่น (ส่งร้าน 23 ต.ค.) เก็บสำเนาไว้ใน sim/designs/eyelet
g0 = 9.81
BACK_DY = 3.25                  # ฝาหลัง: y_stl = y_model - BACK_DY (export จัดกึ่งกลางกรอบ)
M = 0.059                       # kg ทั้งเครื่อง (ฝา 25.5 + บอร์ดและของจุกจิก 9.5 + แบต 24 กรัม)
BOX = np.array([40, 98, 21.5]) / 1000
I_COM = np.diag([M * (BOX[1]**2 + BOX[2]**2) / 12, M * (BOX[0]**2 + BOX[2]**2) / 12, M * (BOX[0]**2 + BOX[1]**2) / 12])
COM = np.array([0, 0, -2.5]) / 1000   # พิกัดโมเดล (ม.) แบตอยู่ฝั่งหลัง
MAT = {'PLA': dict(E=3.0e9, nu=0.35, H=120e6, inPlane=45e6, inter=25e6),
       'PETG': dict(E=2.0e9, nu=0.38, H=90e6, inPlane=45e6, inter=35e6)}
HEIGHTS = [0.75, 1.0, 1.3, 1.5]

def model_to_stl(part, p):        # พิกัดโมเดล (มม.) -> พิกัดไฟล์ STL ที่วางพิมพ์
    x, y, z = p
    return np.array([x, y - BACK_DY, z + 10.75]) if part == 'back' else np.array([x, -y, 10.75 - z])
def dir_to_stl(part, v):
    x, y, z = v
    return np.array([x, y, z]) if part == 'back' else np.array([x, -y, -z])

# จุดชน: ตำแหน่ง (มม., พิกัดโมเดล) และทิศแรงจากพื้นดันเข้าตัวกล่อง (พิกัดโมเดล)
s2 = 1 / math.sqrt(2); s3 = 1 / math.sqrt(3)
CASES = [
  dict(id='eyelet-top', part='back', th='ห่วงตะขอ ชนตรงลงจากด้านบน', P=(18, 55.5, -9.25), n=(0, -1, 0), R=5.1e-3, L=3e-3, feat='eyelet', ax=(0, 0, 1)),
  dict(id='eyelet-diag', part='back', th='ห่วงตะขอ ชนเฉียง 45°', P=(18 + 5.1 * s2, 50.4 + 5.1 * s2, -9.25), n=(-s2, -s2, 0), R=5.1e-3, L=3e-3, feat='eyelet', ax=(0, 0, 1)),
  dict(id='corner-back', part='back', th='มุมล่าง ฝั่งฝาหลัง', P=(15 + 5 * s2, -44 - 5 * s2, -10.75), n=(-s3, s3, s3), R=1e-3, L=0, feat='corner'),
  dict(id='corner-front', part='front', th='มุมล่าง ฝั่งฝาหน้า', P=(15 + 5 * s2, -44 - 5 * s2, 10.75), n=(-s3, s3, -s3), R=1e-3, L=0, feat='corner'),
  dict(id='rim-side', part='back', th='ขอบข้าง ฝั่งฝาหลัง', P=(20, 0, -10.75), n=(-s2, 0, s2), R=1e-3, L=15e-3, feat='edge', ax=(0, 1, 0)),
  # หน้าราบ: ตกเกือบขนาน (≤6°) พื้นดันผิวนอกทั้งแผ่นแบบสม่ำเสมอ ในวงรัศมี 24 มม. รอบกลางหน้า (ขอบวงยึดแน่น) ใช้ voxel 0.6 มม.
  dict(id='face-front', part='front', th='หน้าราบ ฝาหน้า (ด้านเลนส์)', P=(0, 0, 10.75), n=(0, 0, -1), R=50e-3, L=30e-3, feat='face', ax=(1, 0, 0), pressure=True, rcrop=24, pitch=0.6),
  dict(id='face-back', part='back', th='หน้าราบ ฝาหลัง (ด้านแบต)', P=(0, 0, -10.75), n=(0, 0, 1), R=50e-3, L=30e-3, feat='face', ax=(1, 0, 0), pressure=True, rcrop=24, pitch=0.6),
]

def hex_ke(E, nu, h):
    lam = E * nu / ((1 + nu) * (1 - 2 * nu)); mu = E / (2 * (1 + nu))
    D = np.zeros((6, 6)); D[:3, :3] = lam; D[np.arange(3), np.arange(3)] += 2 * mu; D[3:, 3:] = np.eye(3) * mu
    nodes = np.array([[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]], float)
    def B_at(xi):
        dN = np.zeros((8, 3))
        for a, (i, j, k) in enumerate(nodes):
            sx, sy, sz = 2*i-1, 2*j-1, 2*k-1
            dN[a] = [sx*(1+sy*xi[1])*(1+sz*xi[2]), sy*(1+sx*xi[0])*(1+sz*xi[2]), sz*(1+sx*xi[0])*(1+sy*xi[1])]
        dN *= 1/8 * 2/h   # d/dx = d/dxi * 2/h
        B = np.zeros((6, 24))
        for a in range(8):
            x, y, z = dN[a]; c = 3*a
            B[0, c] = x; B[1, c+1] = y; B[2, c+2] = z
            B[3, c] = y; B[3, c+1] = x; B[4, c+1] = z; B[4, c+2] = y; B[5, c] = z; B[5, c+2] = x
        return B
    gp = 1/math.sqrt(3); K = np.zeros((24, 24)); w = (h/2)**3
    for a in (-gp, gp):
        for b in (-gp, gp):
            for c in (-gp, gp):
                B = B_at((a, b, c)); K += B.T @ D @ B * w
    return K, D, B_at((0, 0, 0)), nodes.astype(int)

def solve_case(c, mesh_cache):
    part = c['part']; P = model_to_stl(part, c['P']); n = dir_to_stl(part, np.array(c['n'], float)); n /= np.linalg.norm(n)
    mesh = mesh_cache[part]
    # voxel เฉพาะกล่องรอบจุดชน แล้วตัดเป็นทรงกลม
    RC = c.get('rcrop', R_CROP); PI = c.get('pitch', PITCH)
    lo = P - RC; hi = P + RC
    xs = np.arange(lo[0], hi[0], PI) + PI/2; ys = np.arange(lo[1], hi[1], PI) + PI/2; zs = np.arange(lo[2], hi[2], PI) + PI/2
    G = np.stack(np.meshgrid(xs, ys, zs, indexing='ij'), -1).reshape(-1, 3)
    G = G[np.linalg.norm(G - P, axis=1) < RC]
    G = G[(G[:, 2] > 0) & (G[:, 2] < 10.75)]
    # STL มีหลายก้อนซ้อนกัน (ยังไม่ union) จึงต้องเช็กทีละก้อนแล้วรวม ถ้าใช้ contains ทั้งไฟล์ ส่วนที่ซ้อนจะกลายเป็นรู
    inside = np.zeros(len(G), bool)
    for body in mesh_cache[part + '_bodies']:
        bl, bh = body.bounds; m = np.all((G >= bl) & (G <= bh), axis=1)
        if m.any(): inside[m] |= body.contains(G[m])
    C = G[inside]
    ijk = np.round((C - lo - PI/2) / PI).astype(int)
    E = 1.0; nu = MAT['PLA']['nu']   # ความแข็งสเกลตาม E ภายหลัง (เชิงเส้น)
    Ke, D, B0, nloc = hex_ke(E, nu, PI / 1000)
    en = (ijk[:, None, :] + nloc[None, :, :])                                  # (ne,8,3) ดัชนีโหนด
    key = en[..., 0] * 1_000_000 + en[..., 1] * 1000 + en[..., 2]
    uniq, inv = np.unique(key.ravel(), return_inverse=True); conn = inv.reshape(-1, 8)
    nn = len(uniq); nodeXYZ = lo + np.stack([uniq // 1_000_000, (uniq // 1000) % 1000, uniq % 1000], 1) * PI
    dof = (conn[:, :, None] * 3 + np.arange(3)).reshape(-1, 24)
    rows = np.repeat(dof, 24, axis=1).ravel(); cols = np.tile(dof, (1, 24)).ravel(); vals = np.tile(Ke.ravel(), len(conn))
    K = coo_matrix((vals, (rows, cols)), shape=(3*nn, 3*nn)).tocsr()
    # แรง 1 N กระจายบนโหนดผิวรอบจุดชน
    d = np.linalg.norm(nodeXYZ - P, axis=1)
    if c.get('pressure'):   # หน้าราบ: พื้นดันทั้งผิวนอก (ผิวนอกอยู่ที่ z_stl = 0 ทั้งสองฝา) แรงเท่ากันทุกโหนด
        near = np.where((nodeXYZ[:, 2] < 0.3 * PI) & (d < RC - 3))[0]
    elif c['L'] > 0:   # สัมผัสเป็นเส้น: กระจายแรงตามแนวเส้นยาว L ให้ตรงกับที่ใช้คำนวณแรง (เดิมกองไว้จุดเดียว ทำให้ความเค้นเกินจริง)
        ax = dir_to_stl(part, np.array(c['ax'], float)); ax /= np.linalg.norm(ax)
        rel = nodeXYZ - P; along = rel @ ax; perp = np.linalg.norm(rel - np.outer(along, ax), axis=1)
        near = np.where((perp < PATCH) & (np.abs(along) < c['L'] * 500))[0]
    else:
        near = np.argsort(d)[:max(4, int((d < PATCH).sum()))]
    f = np.zeros(3*nn)
    for k in near: f[3*k:3*k+3] += n / len(near)
    fixed = np.where(d > RC - 1.5*PI)[0]
    fdofs = (fixed[:, None]*3 + np.arange(3)).ravel()
    free = np.setdiff1d(np.arange(3*nn), fdofs)
    t0 = time.time()
    u = np.zeros(3*nn); u[free] = spsolve(K[free][:, free], f[free])
    tsolve = time.time() - t0
    uLoad = np.mean([u[3*k:3*k+3] @ n for k in near])          # m ต่อ 1 N เมื่อ E=1
    # ความเค้นที่กลางลูกเต๋า ต่อแรง 1 N (ไม่ขึ้นกับ E)
    ue = u[dof]; eps = ue @ B0.T; sig = eps @ D.T               # (ne,6)
    S = np.zeros((len(sig), 3, 3)); S[:, 0, 0], S[:, 1, 1], S[:, 2, 2] = sig[:, 0], sig[:, 1], sig[:, 2]
    S[:, 0, 1] = S[:, 1, 0] = sig[:, 3]; S[:, 1, 2] = S[:, 2, 1] = sig[:, 4]; S[:, 0, 2] = S[:, 2, 0] = sig[:, 5]
    w, V = np.linalg.eigh(S); s1 = w[:, 2]; vz = np.abs(V[:, 2, 2])
    cen = C; dc = np.linalg.norm(cen - P, axis=1)
    ok = ((dc > 2.0) | bool(c.get('pressure'))) & (dc < RC - 3)                           # ตัดจุดสัมผัสและขอบที่ยึด
    idx = np.where(ok)[0]; order = idx[np.argsort(s1[idx])]
    top = order[-max(3, len(order)//200):]                       # 0.5% บนสุด (ลดผลขั้นบันไดของลูกเต๋า)
    s1p = float(np.median(s1[top])); vzp = float(np.median(vz[top])); where = cen[order[-1]].tolist()
    return dict(nElem=len(C), nNode=nn, solveS=round(tsolve, 1), compliance_E1=float(uLoad), s1_perN=s1p, vz=vzp, hot=where, P_stl=P.tolist(), n_stl=n.tolist())

def m_eff(c):
    r = (np.array(c['P']) / 1000) - COM; n = np.array(c['n'], float); n /= np.linalg.norm(n)
    rn = np.cross(r, n); return 1 / (1 / M + rn @ np.linalg.solve(I_COM, rn))

def contact(c, mat, F):           # การยุบตรงจุดสัมผัส (ม.) ที่แรง F และพลังงานที่ใช้
    Es = mat['E'] / (1 - mat['nu']**2); R, L, H = c['R'], c['L'], mat['H']
    ds = np.linspace(0, 3e-3, 6000)
    if L == 0: Fd = np.minimum(4/3 * Es * math.sqrt(R) * ds**1.5, 2 * math.pi * R * H * ds)
    else: Fd = np.minimum(math.pi/4 * Es * L * ds, H * L * 2 * np.sqrt(2 * R * ds))
    i = np.searchsorted(Fd, F); i = min(i, len(ds) - 1)
    Ec = np.trapezoid(Fd[:i+1], ds[:i+1]); return ds[i], Ec, Fd[i] < (4/3 * Es * math.sqrt(R) * ds[i]**1.5 if L == 0 else math.pi/4 * Es * L * ds[i])

def peak_force(c, fe, mat, h):
    me = m_eff(c); Ekin = 0.5 * me * 2 * g0 * h
    ks = 1 / (fe['compliance_E1'] / mat['E'])
    lo, hi = 0.0, 50000.0
    for _ in range(80):
        F = (lo + hi) / 2; dc, Ec, pl = contact(c, mat, F); E = F*F / (2*ks) + Ec
        lo, hi = (F, hi) if E < Ekin else (lo, F)
    F = (lo + hi) / 2; dc, Ec, pl = contact(c, mat, F)
    return dict(F=F, mEff=me, kStruct=ks, gShell=F / me / g0, dent_mm=dc * 1000 if pl else 0.0, plasticShare=Ec / Ekin)

def main():
    mesh_cache = {k: trimesh.load(v) for k, v in STL.items()}
    for k in list(mesh_cache): mesh_cache[k + '_bodies'] = mesh_cache[k].split(only_watertight=False)
    out = dict(note='FE voxel 0.5 มม. รอบจุดชน รัศมี 16 มม. ขอบตัดยึดแน่น; ค่าวัสดุทั่วไป ไม่ได้ทดสอบจริง; พื้นแข็ง', cases=[])
    for c in CASES:
        if ONLY and c["id"] not in ONLY: continue
        fe = solve_case(c, mesh_cache)
        print(c['id'], 'elems', fe['nElem'], 'solve', fe['solveS'], 's; s1/N', round(fe['s1_perN'] / 1e6, 3), 'MPa/N, vz', round(fe['vz'], 2), file=sys.stderr)
        row = dict(id=c['id'], th=c['th'], feat=c['feat'], part=c['part'], R=c['R'], L=c['L'], backOffsetY=BACK_DY, fe=fe, drops=[])
        for mname, mat in MAT.items():
            lim = mat['inPlane'] * (1 - fe['vz']**2) + mat['inter'] * fe['vz']**2
            for h in HEIGHTS:
                pk = peak_force(c, fe, mat, h); s = fe['s1_perN'] * pk['F']
                row['drops'].append(dict(mat=mname, h=h, **pk, s1=s, limit=lim, ratio=s / lim))
        out['cases'].append(row)
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for r in out['cases']:
        for d in r['drops']:
            if d['h'] in (0.75, 1.3):
                print(f"{r['id']:13} {d['mat']:4} {d['h']:.2f}m  F {d['F']:6.0f} N  mEff {d['mEff']*1000:4.1f} g  k {d['kStruct']/1e3:6.0f} N/mm  g {d['gShell']:6.0f}  dent {d['dent_mm']:.2f} mm  s1 {d['s1']/1e6:6.1f}/{d['limit']/1e6:.0f} MPa  ratio {d['ratio']:.2f}")

main()

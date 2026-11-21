# แบตเตอรี่: อ่านค่าที่บอร์ดจดไว้ใน log.txt แล้วแปลงเป็น %
#   GET /api/battery              -> ค่าล่าสุด (ป้ายมุมขวาบน)
#   GET /api/battery?day=2026-... -> ทุกค่าของวันนั้น (กราฟรายนาที/รายชั่วโมง)
#   GET /api/battery?day=all      -> ทุกค่าของทุกวัน (กราฟรายวัน)

import json
import re
import time

from flask import Blueprint, jsonify, request

from config import STATUS_FILE, UPLOAD_ROOT

bp = Blueprint("battery", __name__)

# บรรทัดตัวอย่าง: "20261019_221910  wake#5  /photo_....jpg  OK  bat 3912mV"
BAT_LINE = re.compile(r"^(\d{8})_(\d{2})(\d{2})(\d{2}).*?bat (\d{3,4})mV")
# ต่ำกว่านี้ไม่ใช่ค่าแบตจริง (บอร์ดยังทำงานได้แปลว่าแบตต้อง > 3V) = วงจรวัดแบตหลุด หรือถอดแบตอยู่
# เจอ 20 ต.ค.: ตัวต้านทานฝั่ง BAT+ ขาด ขาวัดลอย อ่านได้ 200-900 mV
BAT_MIN_VALID = 2500
# แรงดัน -> % ของแบต LiPo (ค่าประมาณ: กราฟไม่เป็นเส้นตรง ช่วงกลางลดช้า ช่วงท้ายลดเร็ว)
LIPO = [(4200, 100), (4100, 90), (4000, 79), (3900, 62), (3800, 42), (3700, 20), (3600, 9), (3500, 4), (3300, 0)]


def battery_percent(mv):
    if mv >= LIPO[0][0]:
        return 100
    for (v1, p1), (v2, p2) in zip(LIPO, LIPO[1:]):
        if mv >= v2:
            return round(p2 + (p1 - p2) * (mv - v2) / (v1 - v2))
    return 0


def battery_points():
    """[(เวลา, mV), ...] เรียงตามเวลา
    log.txt ถูกส่งซ้ำทุกรอบและไปอยู่ในโฟลเดอร์วันที่ส่ง -> รวมทุกไฟล์แล้วตัดค่าซ้ำด้วยเวลา"""
    pts = {}
    for log in UPLOAD_ROOT.glob("*/log.txt"):
        for line in log.read_text(encoding="utf-8", errors="replace").splitlines():
            m = BAT_LINE.match(line)
            if m and int(m.group(5)) >= BAT_MIN_VALID:
                d, hh, mm, ss, mv = m.groups()
                pts[f"{d[:4]}-{d[4:6]}-{d[6:]}T{hh}:{mm}:{ss}"] = int(mv)
    return sorted(pts.items())


def last_untimed_battery():
    # บรรทัดที่บอร์ดยังไม่รู้เวลา (เพิ่งเปิดเครื่อง) เช่น "wake#1  /photo_00103.jpg  OK  bat 3876mV"
    # ใช้เวลาที่ log ถูกส่งมาถึงคอมแทน (บอร์ดวัดก่อนส่งไม่กี่นาที) จะได้มีค่าโชว์ทันที
    logs = sorted(UPLOAD_ROOT.glob("*/log.txt"), key=lambda p: p.stat().st_mtime)
    if not logs:
        return None
    for line in reversed(logs[-1].read_text(encoding="utf-8", errors="replace").splitlines()):
        m = re.search(r"bat (\d{3,4})mV", line)
        if m:
            # ดูแค่บรรทัดล่าสุด ถ้าวัดไม่ได้ก็ไม่มีค่า (ห้ามย้อนไปหยิบค่าดีเก่ามาติดเวลาปัจจุบัน)
            if int(m.group(1)) < BAT_MIN_VALID:
                return None
            t = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(logs[-1].stat().st_mtime))
            return (t, int(m.group(1)))
    return None


@bp.get("/api/battery")
def api_battery():
    pts = battery_points()
    # ป้ายมุมขวาบนใช้ค่าล่าสุดจริงๆ แม้บรรทัดนั้นไม่มีเวลา (กราฟยังใช้เฉพาะบรรทัดที่มีเวลา)
    extra = last_untimed_battery()
    if extra and (not pts or extra[0] > pts[-1][0]):
        latest = extra
    else:
        latest = pts[-1] if pts else None
    st = json.loads(STATUS_FILE.read_text(encoding="utf-8")) if STATUS_FILE.exists() else None
    # step10b ส่ง log.txt เฉพาะรอบที่ส่งไฟล์หมด ตอนไฟล์ค้างเยอะ log จะเก่า -> ใช้ bat_mv จากสถานะล่าสุดแทน
    if st and st.get("bat_mv", 0) >= BAT_MIN_VALID and (not latest or st["at"] > latest[0]):
        latest = (st["at"], st["bat_mv"])
    day = request.args.get("day")
    sel = pts if day == "all" else [p for p in pts if p[0].startswith(day)] if day else pts[-1:]
    # ค่าล่าสุดจริงๆ (รวมค่าที่วัดไม่ได้) ถ้าใหม่กว่าค่าดีล่าสุด = ตอนนี้วัดแบตไม่ได้
    sensor_ok = not (st and st.get("bat_mv", BAT_MIN_VALID) < BAT_MIN_VALID and (not latest or st["at"] > latest[0]))
    return jsonify({
        "sensor_ok": sensor_ok,
        "latest": {"at": latest[0], "mv": latest[1], "percent": battery_percent(latest[1])} if latest else None,
        "points": [{"at": t, "mv": mv, "percent": battery_percent(mv)} for t, mv in sel],
    })

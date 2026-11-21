# สถานะกล้อง (ป้ายมุมขวาบน + รายละเอียดตอนกด)
#   GET /api/status -> ติดต่อล่าสุดเมื่อไหร่ + รายการปัญหา (ข้อความภาษาอังกฤษ ขึ้นบนหน้าเว็บตรงๆ)
# บอร์ดส่งสถานะมาที่ POST /api/status (อยู่ใน board.py)

import json
import time

from flask import Blueprint, jsonify

from battery import BAT_MIN_VALID, battery_percent
from config import OFFLINE_MIN, STATUS_FILE, STATUS_LOG, UPLOAD_ROOT

bp = Blueprint("device", __name__)

# สาเหตุที่บอร์ดเปิดเครื่องใหม่ (บอร์ดส่งมาเป็นคำสั้นๆ)
RESET_TEXT = {"brownout": "a power drop (battery low?)", "crash": "a crash", "watchdog": "a freeze (watchdog)"}
# ตัวนับ *_fail ที่บอร์ดส่งมา = จำนวนครั้งตั้งแต่รายงานครั้งก่อน (บอร์ดรีเซ็ตเป็น 0 หลังส่งสำเร็จ)
FAIL_TEXT = (("sd_fail", "SD card failed to open"), ("cam_fail", "Camera failed to start"), ("photo_fail", "Photo failed"))


def recent_statuses(hours=24):
    if not STATUS_LOG.exists():
        return []
    since = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(time.time() - hours * 3600))
    out = []
    for line in STATUS_LOG.read_text(encoding="utf-8").splitlines():
        try:
            st = json.loads(line)
        except ValueError:
            continue
        if st.get("at", "") >= since:
            out.append(st)
    return out


def sd_outages(days=7):
    """ช่วงที่บอร์ดเปิด SD ไม่ได้ = ช่วงที่ไม่มีภาพ (ดูจาก status_log ย้อนหลัง)
    start   = รายงานแรกที่บอกว่าเสีย (บอร์ดแจ้งทันทีตอนเสียครั้งแรก) ย้อนไปตามจำนวนครั้งที่นับได้ ครั้งละ 1 นาที
    end     = รายงานแรกที่บอกว่ากลับมาอ่านได้ (ดีแน่ๆ ตอนนี้ อาจหายก่อนหน้านั้นไม่กี่นาที) None = ยังเสียอยู่
    missed  = จำนวนรอบที่เปิดไม่ได้ (ตื่นทุกนาที รอบละ 1 ภาพ) นับเท่าที่บอร์ดรายงานมา ถ้าถอดไฟระหว่างนั้นตัวนับจะหาย"""
    fmt = lambda t: time.strftime("%Y-%m-%dT%H:%M", time.localtime(t))
    out, cur = [], None
    for st in recent_statuses(days * 24):
        t = time.mktime(time.strptime(st["at"], "%Y-%m-%dT%H:%M:%S"))
        n, bad = st.get("sd_fail", 0), not st.get("sd_ok", True)
        if (bad or n) and cur is None:
            cur = {"start": fmt(t - max(n - 1, 0) * 60), "end": None, "missed": 0}
        if cur:
            cur["missed"] += n
            if not bad:  # กลับมาอ่านได้แล้ว ปิดช่วงนี้
                cur["end"] = fmt(t)
                out.append(cur)
                cur = None
    if cur:
        out.append(cur)
    return out


def find_problems(st, minutes):
    """bad = ยังเป็นอยู่ตอนนี้ (ป้ายแดง), past = เคยเกิดแต่หายแล้ว (แค่บอกไว้ ป้ายยังเขียว)"""
    problems = []
    add = lambda level, text: problems.append({"level": level, "text": text})

    if minutes is None:
        add("bad", "No data from the camera yet")
    elif minutes > OFFLINE_MIN:
        add("bad", f"No contact for {minutes // 60} h {minutes % 60} min (away from home, or the camera has a problem)")
    if not st:
        return problems

    if not st.get("sd_ok", True):
        add("bad", "Can't read the SD card, no photos are being taken (card loose? push it in and press R)")
    recent = recent_statuses()
    for key, text in FAIL_TEXT:
        n = sum(s.get(key, 0) for s in recent)
        if n:
            still = key == "sd_fail" and not st.get("sd_ok", True) or key in ("cam_fail", "photo_fail") and st.get(key, 0)
            add("bad" if still else "past", f"{text} {n} time(s) in the last 24 h" + ("" if still else ", now fixed"))

    mv = st.get("bat_mv", BAT_MIN_VALID)
    if mv < BAT_MIN_VALID:
        add("bad", f"Can't measure the battery (board reads {mv / 1000:.2f} V): the battery resistor on BAT+ is loose")
    elif battery_percent(mv) <= 15:
        add("bad", f"Battery at {battery_percent(mv)}%, please charge")

    total, used = st.get("sd_total_mb", -1), st.get("sd_used_mb", -1)
    if total > 0 and used >= 0 and (total - used) / total < 0.1:
        add("bad", f"SD card almost full, {total - used} MB left")
    if st.get("reset") in RESET_TEXT:
        add("past", f"Last restart was caused by {RESET_TEXT[st['reset']]}")
    return problems


@bp.get("/api/status")
def api_status():
    st = json.loads(STATUS_FILE.read_text(encoding="utf-8")) if STATUS_FILE.exists() else None
    # ติดต่อล่าสุด = สถานะล่าสุด หรือ log.txt ที่ส่งมาล่าสุด (เฟิร์มแวร์ขั้น 9 ไม่ส่งสถานะ แต่ส่ง log)
    seen = [time.mktime(time.strptime(st["at"], "%Y-%m-%dT%H:%M:%S"))] if st else []
    seen += [p.stat().st_mtime for p in UPLOAD_ROOT.glob("*/log.txt")]
    last = max(seen) if seen else None
    minutes = int((time.time() - last) // 60) if last else None
    return jsonify({
        "last_seen": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(last)) if last else None,
        "minutes": minutes,
        "status": st,
        "problems": find_problems(st, minutes),
        # ให้หน้าเว็บสรุปเป็นรายการเช็กได้เอง (ใช้เกณฑ์เดียวกับ find_problems)
        "offline_min": OFFLINE_MIN,
        "sd_outages": sd_outages(3),
        "battery_percent": battery_percent(st["bat_mv"]) if st and st.get("bat_mv", 0) >= BAT_MIN_VALID else None,
    })

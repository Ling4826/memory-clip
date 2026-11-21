# ส่วนที่บอร์ดเรียกใช้ (ตอนต่อ hotspot ของคอมได้)
#   GET  /api/time   -> เวลาปัจจุบัน (บอร์ดไม่มีนาฬิกาที่รู้เวลาจริง)
#   POST /upload     -> ส่งไฟล์ทีละไฟล์ เช่น /upload?path=/clip_0006/img_00.jpg
#                       เนื้อไฟล์อยู่ใน body ตรงๆ (ไม่ใช่ form) ง่ายสำหรับฝั่ง ESP32
#   POST /api/status -> สถานะบอร์ด (SD, กล้อง, แบต, สัญญาณ) เป็น JSON
# ทุกคำขอที่เขียนไฟล์ต้องมี header "X-Clip-Token" ตรงกับ secret.txt

import hmac
import json
import threading
import time
from datetime import date

from flask import Blueprint, abort, request
from PIL import Image

from config import FLIP_PHOTOS, STATUS_FILE, STATUS_LOG, TOKEN, UPLOAD_ROOT
from media import pretty
from storage import day_of

bp = Blueprint("board", __name__)


def check_token():
    # compare_digest เทียบรหัสโดยใช้เวลาเท่ากันเสมอ คนเดาจะจับเวลาตอบกลับเพื่อเดาทีละตัวอักษรไม่ได้
    if not hmac.compare_digest(request.headers.get("X-Clip-Token", ""), TOKEN):
        abort(401)


@bp.get("/api/time")
def api_time():
    # วินาทีนับจาก 1 ม.ค. 1970 UTC
    return str(int(time.time()))


@bp.post("/upload")
def upload():
    check_token()
    sd_path = request.args.get("path", "")
    # เก็บลงโฟลเดอร์ "วันที่ถ่าย" ตามชื่อไฟล์ ถ้าชื่อไม่มีเวลา (บอร์ดยังไม่เคยได้เวลา) ใช้วันที่อัปโหลดแทน
    day = day_of(sd_path) or date.today().isoformat()
    folder = (UPLOAD_ROOT / day).resolve()
    target = (folder / sd_path.lstrip("/")).resolve()
    # กันชื่อไฟล์แปลกๆ อย่าง ../../ ที่จะเขียนไฟล์ออกนอกโฟลเดอร์ uploads
    if not sd_path or folder not in target.parents:
        abort(400, "bad path")

    data = request.get_data()
    if not data:
        # ไฟล์ว่าง (0 byte) เกิดจากบอร์ดเขียนภาพไม่สำเร็จ ไม่ต้องเก็บ แต่ตอบ "0" ให้บอร์ดถือว่าจบแล้ว
        return "0"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    if target.suffix.lower() == ".jpg":
        if FLIP_PHOTOS:
            flip(target)
        # ปรับภาพรอไว้เลย (ทำเบื้องหลัง ไม่ให้บอร์ดต้องรอ) เปิดเว็บทีหลังจะได้ไม่ต้องรอปรับทีละภาพ
        threading.Thread(target=pretty, args=(target,), daemon=True).start()
    print(f"saved {target.relative_to(UPLOAD_ROOT.resolve())}  {len(data)} bytes")
    # ตอบขนาดที่ได้รับกลับไป ให้บอร์ดเช็กว่าส่งครบก่อนย้ายไฟล์บน SD
    return str(len(data))


def flip(path):
    # กลับบน-ล่างอย่างเดียว = หมุน 180° + แก้ภาพกลับซ้าย-ขวาที่มาจากเซนเซอร์ (เจอ 21 ต.ค.)
    try:
        with Image.open(path) as im:
            flipped = im.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        flipped.save(path, "JPEG", quality=92)
    except OSError:  # ภาพเสีย หมุนไม่ได้ ก็เก็บไฟล์เดิมไว้
        pass


@bp.post("/api/status")
def api_status_post():
    # เช่น {"sd_ok":true,"sd_fail":0,"pending":3,"bat_mv":3900,"rssi":-45,...}
    check_token()
    st = request.get_json(silent=True)
    if not isinstance(st, dict):
        abort(400, "bad json")
    st["at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    STATUS_FILE.write_text(json.dumps(st, ensure_ascii=False), encoding="utf-8")
    with STATUS_LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(st, ensure_ascii=False) + "\n")
    print(f"status {st}")
    return "ok"

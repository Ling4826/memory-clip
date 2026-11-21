# ข้อมูลรายวันให้หน้าเว็บ + ลบ/กู้คืน + สั่งทำวิดีโอสรุปวัน
#   GET  /api/days                -> ทุกวัน (การ์ดหน้าแรก)
#   GET  /api/day/<วัน>           -> ภาพ + คลิป + วิดีโอของวันนั้น
#   POST /api/delete              -> ย้ายภาพ/คลิปไปถังขยะ
#   POST /api/restore             -> ปุ่ม "Undo": ย้ายกลับจากถังขยะ
#   POST /api/highlight           -> เริ่มทำวิดีโอสรุปวัน (highlight.py)
#   GET  /api/highlight/status    -> ทำถึงไหนแล้ว

import json

from flask import Blueprint, abort, jsonify, request

import highlight
from config import TRASH_ROOT, UPLOAD_ROOT
from device import sd_outages
from storage import all_days, day_dir, move_items, read_day, safe_items, thumb, time_of, url

bp = Blueprint("days", __name__)


@bp.get("/api/days")
def api_days():
    out = []
    for d in all_days():
        photos, clips = read_day(d)
        # ปก = ภาพกลางวัน (ไม่มีภาพ ใช้ภาพแรกของคลิปแรก)
        cover = thumb(photos[len(photos) // 2]) if photos else (clips[0]["thumbs"][0] if clips and clips[0]["thumbs"] else None)
        out.append({"day": d.name, "photos": len(photos), "clips": len(clips), "cover": cover})
    return jsonify(out)


@bp.get("/api/day/<day>")
def api_day(day):
    d = day_dir(day)
    photos, clips = read_day(d)
    return jsonify({
        "day": day,
        "photos": [{"name": p.name, "time": time_of(p.name), "src": url(p), "thumb": thumb(p)} for p in photos],
        "clips": clips,
        "highlight": url(d / "highlight.mp4") if (d / "highlight.mp4").exists() else None,
        "highlight_stale": highlight_stale(d),
        # ช่วงที่ SD เสียในวันนี้ (ไม่มีภาพช่วงนั้น) หน้าเว็บแทรกไว้ระหว่างชั่วโมง
        "sd_outages": [o for o in sd_outages(days=60) if o["start"][:10] <= day <= (o["end"] or "9999")[:10]],
    })


def highlight_stale(d):
    """วิดีโอสรุปวันมีภาพ/คลิปที่ถูกลบไปแล้วไหม (วิดีโอเป็นไฟล์ที่ทำเสร็จแล้ว ลบภาพทีหลังวิดีโอไม่เปลี่ยนเอง ต้องกดทำใหม่)"""
    mp4, info = d / "highlight.mp4", d / "highlight.json"
    if not mp4.exists():
        return False
    try:
        used = json.loads(info.read_text(encoding="utf-8")).get("used")
    except (OSError, ValueError):
        used = None
    if used is not None:
        return any(not (d / n).exists() for n in used)
    # วิดีโอเก่าที่ทำก่อนมีรายชื่อ used: ดูว่ามีการลบของวันนี้หลังทำวิดีโอไหม
    trash = TRASH_ROOT / d.name
    return trash.exists() and trash.stat().st_mtime > mp4.stat().st_mtime


# ---------- ลบ (ย้ายไปถังขยะ) ----------

@bp.post("/api/delete")
def api_delete():
    # รับ {"day": "2026-10-20", "names": ["photo_....jpg", "clip_..."]} (คลิปลบทั้งโฟลเดอร์)
    body = request.get_json(force=True)
    d = day_dir(body.get("day", ""))
    moved = move_items(d, TRASH_ROOT / d.name, safe_items(d, body.get("names", [])))
    return jsonify({"deleted": moved})


@bp.post("/api/restore")
def api_restore():
    body = request.get_json(force=True)
    day = body.get("day", "")
    t = (TRASH_ROOT / day).resolve()
    if t.parent != TRASH_ROOT.resolve() or not t.is_dir():
        abort(404)
    moved = move_items(t, UPLOAD_ROOT / day, safe_items(t, body.get("names", [])))
    return jsonify({"restored": moved})


# ---------- วิดีโอสรุปวัน ----------

@bp.post("/api/highlight")
def api_highlight():
    d = day_dir(request.get_json(force=True).get("day", ""))
    if not highlight.start(d):
        return jsonify({"error": "Already making a video for another day, please wait"}), 409
    return jsonify({"ok": True})


@bp.get("/api/highlight/status")
def api_highlight_status():
    return jsonify(highlight.status)

# ส่งไฟล์ภาพ/เสียง/วิดีโอให้หน้าเว็บ
#   GET /files/<path>     -> ภาพ .jpg ส่งแบบปรับแล้ว (enhance.py), ไฟล์อื่น (เสียง วิดีโอ) ส่งตามเดิม
#   GET /original/<path>  -> ภาพต้นฉบับจากกล้อง ไม่ได้ปรับ (ไว้เทียบ)
#   GET /thumb/<path>     -> ภาพย่อกว้าง 480 (ทำจากภาพที่ปรับแล้ว)
# ภาพที่ปรับแล้ว/ภาพย่อ สร้างครั้งแรกที่มีคนขอ แล้วเก็บไว้ใน cache/ ครั้งต่อไปส่งไฟล์เดิมเลย

import threading

from flask import Blueprint, abort, send_file, send_from_directory
from PIL import Image

from config import PRETTY_ROOT, THUMB_ROOT, THUMB_SIZE, UPLOAD_ROOT
from enhance import grade
from storage import upload_file

bp = Blueprint("media", __name__)


def pretty(src):
    """ภาพที่ปรับแล้วของ src (path เต็มใน uploads) ภาพเสียได้ None"""
    dst = PRETTY_ROOT / src.relative_to(UPLOAD_ROOT.resolve())
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return dst
    try:
        with Image.open(src) as im:
            out = grade(im.convert("RGB"))
    except OSError:  # ไฟล์เสีย/ว่าง เปิดเป็นภาพไม่ได้
        return None
    dst.parent.mkdir(parents=True, exist_ok=True)
    # เขียนไฟล์ชั่วคราวก่อนแล้วค่อยเปลี่ยนชื่อ กันอีกคำขอมาอ่านไฟล์ที่ยังเขียนไม่เสร็จ
    tmp = dst.with_name(f"{dst.stem}.{threading.get_ident()}.tmp")
    out.save(tmp, "JPEG", quality=90)
    tmp.replace(dst)
    return dst


def make_thumb(src, force=False):
    """ภาพย่อของ src (ทำจากภาพที่ปรับแล้ว) ภาพเสียได้ None"""
    dst = THUMB_ROOT / src.relative_to(UPLOAD_ROOT.resolve())
    if not force and dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return dst
    p = pretty(src)
    if not p:
        return None
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(p) as im:
        im.thumbnail((THUMB_SIZE, THUMB_SIZE))
        im.save(dst, "JPEG", quality=80)
    return dst


@bp.get("/files/<path:sub>")
def files(sub):
    src = upload_file(sub)
    if src.suffix.lower() == ".jpg" and (p := pretty(src)):
        return send_file(p, max_age=86400)
    return send_from_directory(UPLOAD_ROOT, sub)


@bp.get("/original/<path:sub>")
def original(sub):
    return send_from_directory(UPLOAD_ROOT, sub)


@bp.get("/thumb/<path:sub>")
def thumbs(sub):
    p = make_thumb(upload_file(sub))
    if not p:
        abort(404)
    return send_file(p, max_age=86400)

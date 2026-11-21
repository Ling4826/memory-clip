# หาไฟล์ของแต่ละวันใน uploads/ และย้ายไฟล์ไป-กลับถังขยะ (ใช้ร่วมกันหลายไฟล์)

import re
import shutil

from flask import abort

from config import UPLOAD_ROOT

# ชื่อไฟล์จากบอร์ดตั้งแต่ขั้น 8c มีเวลาที่ถ่าย: photo_20261020_143500.jpg, clip_20261020_143500/
STAMP = re.compile(r"_(\d{8})_(\d{2})(\d{2})(\d{2})")


def time_of(name):
    """'photo_20261020_143500.jpg' -> '14:35' (ชื่อไม่มีเวลา -> None)"""
    m = STAMP.search(name)
    return f"{m.group(2)}:{m.group(3)}" if m else None


def day_of(name):
    """'photo_20261020_143500.jpg' -> '2026-10-20' (ชื่อไม่มีเวลา -> None)"""
    m = STAMP.search(name)
    return f"{m.group(1)[:4]}-{m.group(1)[4:6]}-{m.group(1)[6:]}" if m else None


def day_dir(day):
    """โฟลเดอร์ของวัน (กันชื่อแปลกๆ อย่าง ../ ไม่ให้ออกนอก uploads)"""
    d = (UPLOAD_ROOT / day).resolve()
    if d.parent != UPLOAD_ROOT.resolve() or not d.is_dir():
        abort(404)
    return d


def all_days():
    """ทุกโฟลเดอร์วัน ใหม่สุดก่อน (ไม่รวมโฟลเดอร์ที่ขึ้นต้นด้วย _ เช่น _trash)"""
    return sorted((p for p in UPLOAD_ROOT.glob("*") if p.is_dir() and not p.name.startswith("_")), reverse=True)


def upload_file(sub):
    """ไฟล์ใน uploads จาก path ใน URL (ไม่มีไฟล์ หรือพยายามออกนอก uploads -> 404)"""
    src = (UPLOAD_ROOT / sub).resolve()
    if UPLOAD_ROOT.resolve() not in src.parents or not src.is_file():
        abort(404)
    return src


# ---------- ลิงก์ที่หน้าเว็บใช้ ----------

def url(p):
    return "/files/" + p.relative_to(UPLOAD_ROOT).as_posix()


def thumb(p):
    return "/thumb/" + p.relative_to(UPLOAD_ROOT).as_posix()


# ---------- ภาพ + คลิปของวัน ----------

def images(folder, pattern):
    # ข้ามไฟล์ว่าง (0 byte) ที่เกิดจากบอร์ดเขียนภาพไม่สำเร็จ
    return sorted(p for p in folder.glob(pattern) if p.stat().st_size > 0)


def read_day(d):
    photos = images(d, "photo_*.jpg")
    clips = []
    for c in sorted(p for p in d.glob("clip_*") if p.is_dir()):
        frames = images(c, "img_*.jpg")
        audio = c / "audio.wav"
        clips.append({
            "name": c.name,
            "time": time_of(c.name),
            "frames": [url(f) for f in frames],
            "thumbs": [thumb(f) for f in frames],
            "audio": url(audio) if audio.exists() else None,
        })
    return photos, clips


# ---------- ถังขยะ ----------

def safe_items(d, names):
    # รับเฉพาะไฟล์/โฟลเดอร์คลิปที่อยู่ในโฟลเดอร์วันนั้นจริง กันชื่อแปลกๆ อย่าง ../
    out = []
    for n in names:
        p = (d / n).resolve()
        if d in p.parents and p.exists() and p.name not in ("notes.json", "log.txt"):
            out.append(p.relative_to(d).as_posix())
    return out


def move_items(src_root, dst_root, items):
    moved = []
    for rel in items:
        src, dst = src_root / rel, dst_root / rel
        if not src.exists():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists():  # เคยลบชื่อนี้ไปแล้ว ทับของเก่าในถังขยะ
            shutil.rmtree(dst) if dst.is_dir() else dst.unlink()
        shutil.move(str(src), str(dst))
        moved.append(rel)
    return moved

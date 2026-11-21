# ปรับภาพเก่าทั้งหมดรอไว้ล่วงหน้า (cache/pretty + cache/thumbs_pretty)
# หน้าเว็บสร้างให้เองตอนมีคนเปิดอยู่แล้ว แต่ภาพละ ~0.4 วิ ตัวเล่น "Day recap" ที่เปลี่ยนภาพเร็วๆ จะกระตุก
# รันครั้งเดียวหลังแก้วิธีปรับภาพ:  python make_pretty.py        (ภาพที่ปรับแล้วข้ามไป)
#                                   python make_pretty.py --all  (ทำใหม่ทุกภาพ)

import sys
import time

from config import PRETTY_ROOT, UPLOAD_ROOT
from media import make_thumb, pretty

redo = "--all" in sys.argv
root = UPLOAD_ROOT.resolve()
photos = [p for p in sorted(root.rglob("*.jpg")) if "_trash" not in p.parts]
start = time.time()
for i, src in enumerate(photos, 1):
    if redo:
        (PRETTY_ROOT / src.relative_to(root)).unlink(missing_ok=True)
    if pretty(src):
        make_thumb(src, force=redo)
    if i % 100 == 0 or i == len(photos):
        print(f"{i}/{len(photos)}  {time.time() - start:.0f} s", flush=True)

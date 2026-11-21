# Memory Clip server: รับไฟล์จากบอร์ด + หน้าเว็บดูรูป
#
# วิธีรัน:  ดับเบิลคลิก start_server.bat  (หรือ python server.py)
#
# 1) รับไฟล์: บอร์ดต่อ hotspot ของคอม แล้วส่งมาที่ http://<your-pc-ip>:8000/upload
#    ไฟล์ไปอยู่ที่ uploads/<วันที่>/<path เดิมบน SD> เช่น uploads/2026-10-19/clip_0006/img_00.jpg
# 2) ดูรูป: เปิด http://127.0.0.1:8000 บนคอม หรือจากมือถือ/iPad ผ่าน Tailscale
#    https://<your-tailnet-host>:8443  (เห็นเฉพาะเครื่องของเราเอง)
#    หน้าเว็บอยู่ใน web/ ส่วน server แค่ส่งข้อมูลเป็น JSON ให้
# 3) วิดีโอสรุปวัน: highlight.py คัดภาพดีๆ + คลิปสั้นๆ + เพลง -> uploads/<วัน>/highlight.mp4
#
# ไฟล์ของ server แยกตามหน้าที่:
#   server.py       ไฟล์นี้: รวมทุกส่วน + ส่งหน้าเว็บ
#   config.py       ที่อยู่โฟลเดอร์และค่าตั้งต่างๆ
#   storage.py      หาไฟล์ของแต่ละวัน + ถังขยะ
#   board.py        ส่วนที่บอร์ดเรียกใช้: รับไฟล์, บอกเวลา, รับสถานะ
#   days.py         ข้อมูลรายวัน, ลบ/กู้คืน, สั่งทำวิดีโอ
#   media.py        ส่งภาพที่ปรับแล้ว / ภาพต้นฉบับ / ภาพย่อ
#   battery.py      แบต (อ่านจาก log.txt)
#   device.py       สถานะกล้อง + รายการปัญหา
#   enhance.py      ปรับภาพ (ลดฝ้า + แก้สี)
#   photo_pick.py   คัดภาพดีๆ ของวัน (ใช้ทำวิดีโอ)
#   highlight.py    ตัดต่อวิดีโอสรุปวัน
#   make_pretty.py  (รันเอง) ปรับภาพเก่าทั้งหมดรอไว้

import mimetypes

from flask import Flask, send_from_directory

import battery
import board
import days
import device
import media
from config import MAX_UPLOAD_MB, WEB_ROOT

# Windows บางเครื่องจด .js ไว้เป็น text/plain ใน registry -> เบราว์เซอร์ไม่ยอมโหลด <script type="module">
mimetypes.add_type("text/javascript", ".js")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
for module in (board, days, media, battery, device):
    app.register_blueprint(module.bp)


@app.get("/")
def index():
    # บอร์ดก็ใช้หน้านี้เช็กว่า server เปิดอยู่ (ได้ 200 = OK)
    return send_from_directory(WEB_ROOT, "index.html")


@app.get("/web/<path:name>")
def web_files(name):
    return send_from_directory(WEB_ROOT, name)


if __name__ == "__main__":
    # 0.0.0.0 = รับจากทุกเครื่องที่ต่อ hotspot/Wi-Fi เดียวกัน (ถ้าใช้ 127.0.0.1 จะรับได้แค่จากคอมตัวเอง)
    app.run(host="0.0.0.0", port=8000)

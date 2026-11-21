# ปรับภาพจากกล้องให้สวยขึ้น (ใช้ทั้งหน้าเว็บและวิดีโอสรุปวัน)
#   เลนส์กล้องตัวนี้ทำให้ภาพเป็นฝ้าขาวๆ และติดม่วง -> ลดฝ้า -> แก้สี -> ยกความสว่างกลับ -> เพิ่มสีสัน + โทนอุ่น
# ลองแล้วไม่ดี (21 ต.ค.): CLAHE (เกิดลายเป็นวง), Gray World ทั้งภาพ (หน้าคนเต็มจอ -> ภาพออกเขียว)

import cv2
import numpy as np
from PIL import Image, ImageEnhance


def grade(im):
    """PIL RGB image -> ภาพที่ปรับแล้ว (ขนาดเท่าเดิม)"""
    f = np.asarray(im, np.float32) / 255
    before = f.mean()
    # แก้สีทีหลังลดฝ้า เพราะลดฝ้าทำให้สีที่เพี้ยนนิดๆ ชัดขึ้น
    f = np.clip(white_balance(np.clip(dehaze(f), 0, 1)), 0, 1)
    # ลดฝ้าทำให้ภาพมืดลง (ภาพในห้องมืดๆ จะมืดจนดูไม่ออก) -> ยกความสว่างกลับให้ใกล้เดิมด้วย gamma
    # (gamma ยกส่วนมืด/กลาง แต่ส่วนสว่างไม่จ้าจนขาวโพลนแบบการคูณตรงๆ)
    after = f.mean()
    if 0.02 < after < before * 0.95:
        f = f ** max(0.6, np.log(before * 0.95) / np.log(after))
    g = ImageEnhance.Color(Image.fromarray((f * 255).astype(np.uint8))).enhance(1.15)
    r, gr, b = g.split()
    return Image.merge("RGB", (r.point(lambda v: min(255, int(v * 1.02))), gr, b.point(lambda v: int(v * 0.96))))


def dehaze(f, strength=0.5):
    # Dark Channel Prior (He et al. 2009): ภาพปกติแทบทุกจุดจะมีสักช่องสีที่มืด
    # ถ้าทั้งบริเวณสว่างหมด = มีฝ้าบัง -> ประเมินความหนาของฝ้าแล้วลบออก
    # ขนาดช่องที่ดู/ความเบลอ ปรับตามขนาดภาพ (ภาพ 480 px ใช้ 15 px) ภาพย่อกับภาพเต็มจะได้ผลเหมือนกัน
    size = max(3, f.shape[1] // 32)
    kernel = np.ones((size, size), np.uint8)
    dark = cv2.erode(f.min(2), kernel)
    top = np.argsort(dark.ravel())[-max(1, dark.size // 1000):]  # 0.1% ที่ฝ้าหนาสุด = สีของฝ้า
    # สีของฝ้าใช้เป็นสีเทา (ค่าเดียวทุกช่อง): ถ้าใช้สีที่วัดได้ ซึ่งมักอมม่วงจากมุมภาพ ภาพจะออกเขียวแทน
    air = f.reshape(-1, 3)[top].mean()
    t = 1 - strength * cv2.erode((f / air).min(2), kernel)
    t = np.clip(cv2.GaussianBlur(t, (0, 0), size / 2), 0.5, 1)[..., None]  # ไม่ต่ำกว่า 0.5 กันจุดรบกวนบนผนังเรียบ
    return (f - air) / t + air


def white_balance(f):
    # แก้ภาพติดสี (กล้องตัวนี้ติดม่วงหรือเขียวแล้วแต่แสง): หาจุดที่ "ควรเป็นสีเทา/ขาว"
    # เช่นผนัง เพดาน เสื้อขาว (สว่างพอ และสีไม่จัด) แล้วปรับให้จุดพวกนั้นเป็นกลาง
    # ไม่ใช้ค่าเฉลี่ยทั้งภาพ (Gray World) เพราะภาพที่มีหน้าคนเต็มจอจะโดนแก้จนออกเขียว
    # วัดเฉพาะกลางภาพ 60% เพราะมุมภาพติดม่วงจัดกว่ากลางภาพมาก, แก้ไม่เกิน 15% กันภาพแปลก
    h, w = f.shape[:2]
    px = f[int(h * .2):int(h * .8), int(w * .2):int(w * .8)].reshape(-1, 3)
    lum = px.mean(1)
    chroma = px.max(1) - px.min(1)
    gray = px[(lum > 0.3) & (lum < 0.95) & (chroma < 0.12)]
    if len(gray) < 200:  # ไม่มีอะไรที่ควรเป็นสีเทาเลย ไม่แตะ
        return f
    means = gray.mean(0)
    return f * np.clip(means.mean() / means, 0.85, 1.15)

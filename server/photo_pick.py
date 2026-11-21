# คัดภาพดีๆ ของวันไปทำวิดีโอสรุปวัน (แนวคิดจากงานวิจัยกล้อง SenseCam: แบ่งวันเป็นช่วง แล้วเลือกภาพดีที่สุดของแต่ละช่วง)
#   1) ให้คะแนนทุกภาพด้วย OpenCV: ความคม (variance of Laplacian), สีสัน, ความสว่าง
#   2) ตัดภาพเสียทิ้ง: มืดเกิน / สว่างจ้าเกิน / ฝ้าหรือเบลอมากเมื่อเทียบกับภาพอื่นของวันเดียวกัน
#   3) แบ่งภาพที่เหลือเป็นช่วงเท่าๆ กันตามเวลา เลือกภาพคะแนนสูงสุดของแต่ละช่วง
#      (ข้ามภาพที่หน้าตาเหมือนภาพที่เพิ่งเลือก วิดีโอจะได้ไม่ซ้ำฉากเดิม)

import cv2
import numpy as np

MAX_PHOTOS = 32   # ภาพทุกนาทีทั้งวันมี ~700 ภาพ เลือกมาแค่นี้
MAX_CLIPS = 4     # คลิปเยอะเกินจะกินทั้งวิดีโอ เลือกมาแค่นี้ กระจายทั้งวัน
SAME_SCENE = 0.9  # หน้าตาสองภาพคล้ายกันเกินค่านี้ (0-1) = ฉากเดียวกัน


def measure(p):
    """คะแนนต่างๆ ของภาพ (ไฟล์เสีย/ว่าง -> None)"""
    # อ่านภาพแบบย่อ 1/4 (400x300) เร็วกว่าอ่านเต็มมาก และพอสำหรับให้คะแนน
    im = cv2.imread(str(p), cv2.IMREAD_REDUCED_COLOR_4)
    if im is None:
        return None
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    b, g, r = (c.astype(np.float32) for c in cv2.split(im))
    rg, yb = np.abs(r - g), np.abs(0.5 * (r + g) - b)
    # ลายเซ็นฉาก: ภาพขาวดำย่อเหลือ 16x12 จุด ปรับให้ไม่ขึ้นกับความสว่าง
    # (เทียบด้วยสีไม่ได้ ไฟห้องเปลี่ยนสีแล้วฉากเดิมจะดูเป็นคนละฉาก)
    small = cv2.resize(gray, (16, 12), interpolation=cv2.INTER_AREA).astype(np.float32).ravel()
    return {
        "path": p,
        "sharp": cv2.Laplacian(gray, cv2.CV_64F).var(),  # ยิ่งสูงยิ่งคม
        "bright": float(gray.mean()),
        "contrast": float(gray.std()),                    # ต่ำมาก = ฝ้าทั้งภาพ/ถูกบัง
        # colorfulness (Hasler & Süsstrunk 2003) ภาพสีสดดูเป็นไลฟ์สไตล์กว่าภาพเทาๆ
        "color": float(np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean())),
        "layout": (small - small.mean()) / (small.std() + 1e-6),
    }


def rank(values):
    # แปลงเป็นอันดับ 0..1 (เทียบกันเองภายในวัน ไม่ใช้เกณฑ์ตายตัว เพราะค่าขึ้นกับแสงของวันนั้น)
    order = np.argsort(np.argsort(values))
    return order / max(1, len(values) - 1)


def same_scene(a, b):
    # correlation ของลายเซ็นฉาก: ฉากเดิม ~0.95-1.0, คนละฉาก มักต่ำกว่า 0.85
    return float(np.dot(a["layout"], b["layout"])) / len(a["layout"]) > SAME_SCENE


def pick_photos(photos):
    """ภาพทั้งวัน (เรียงตามเวลา) -> ภาพที่เลือก ไม่เกิน MAX_PHOTOS ภาพ"""
    scored = [m for m in map(measure, photos) if m]
    if not scored:
        return []
    med = np.median([m["sharp"] for m in scored])
    good = [m for m in scored
            if 45 < m["bright"] < 225 and m["contrast"] > 20 and m["sharp"] > 0.35 * med]
    if len(good) < 5:  # วันที่ภาพแย่เกือบหมด ก็ยังทำวิดีโอได้จากภาพที่มี
        good = scored

    sharp, color = rank([m["sharp"] for m in good]), rank([m["color"] for m in good])
    for m, s, c in zip(good, sharp, color):
        exposure = 1 - abs(m["bright"] - 125) / 125
        m["score"] = 0.55 * s + 0.3 * c + 0.15 * exposure

    # แบ่งเป็นช่วงจำนวนภาพเท่ากัน (ช่วงที่ไม่ได้ใส่กล้องไม่มีภาพ จึงไม่เกิดช่วงว่าง)
    chosen = []
    for chunk in np.array_split(np.arange(len(good)), min(MAX_PHOTOS, len(good))):
        for m in sorted((good[i] for i in chunk), key=lambda m: -m["score"]):
            # ภาพเหมือน 3 ภาพที่เลือกไปล่าสุด (นั่งที่เดิม) -> ลองภาพอันดับถัดไปของช่วงนี้
            # ทั้งช่วงเหมือนหมด = ข้ามช่วงนี้ไปเลย วิดีโอสั้นลงดีกว่าเห็นฉากเดิมซ้ำ
            if any(same_scene(c, m) for c in chosen[-3:]):
                continue
            chosen.append(m)
            break
    return [m["path"] for m in chosen]


def pick_clips(clips):
    """คลิปที่มีภาพ เลือกมาไม่เกิน MAX_CLIPS โดยกระจายให้ทั่วทั้งวัน"""
    clips = [c for c in clips if any(c.glob("img_*.jpg"))]
    if len(clips) <= MAX_CLIPS:
        return clips
    return [clips[round(i)] for i in np.linspace(0, len(clips) - 1, MAX_CLIPS)]

# ตัดต่อวิดีโอสรุปวันอัตโนมัติ (ไม่ใช้ AI) -> uploads/<วัน>/highlight.mp4
#
#   1) คัดภาพดีๆ + คลิป (photo_pick.py)
#   2) หน้าปก -> ภาพ/คลิปเรียงตามเวลาจริง (ภาพเลือนเข้าหากัน, คลิปตัดเหลือ 4 วิพร้อมเสียง)
#      วาดทีละเฟรมด้วย Pillow (ภาพปรับด้วย enhance.py) แล้วส่งให้ ffmpeg ทำเป็นวิดีโอทีละท่อน
#   3) ต่อทุกท่อน แล้วใส่เพลงจากโฟลเดอร์ music/
#      (เพลงต้องเป็นเพลงที่ใช้ได้ฟรี เช่นจาก Pixabay Music ไม่งั้นแชร์ลง IG/Facebook แล้วโดนปิดเสียง)
# server เรียก start() ให้ทำเบื้องหลัง แล้วหน้าเว็บถามความคืบหน้าจาก status

import json
import random
import shutil
import subprocess
import tempfile
import threading
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from enhance import grade
from photo_pick import pick_clips, pick_photos
from storage import time_of

ROOT = Path(__file__).resolve().parent.parent
FFMPEG = ROOT / "tools" / "ffmpeg" / "ffmpeg.exe"
MUSIC_ROOT = ROOT / "music"
MOODS = ["chill", "happy"]  # เพลงไลฟ์สไตล์ สุ่มจากสองโฟลเดอร์นี้
FONT = "C:/Windows/Fonts/tahomabd.ttf"

W, H = 960, 720       # 4:3 เท่าภาพจากกล้อง
FPS = 30
TITLE_SEC = 2.5       # หน้าปก
PHOTO_SEC = 1.2       # ภาพละกี่วินาที
FADE_SEC = 0.3        # ช่วงที่ภาพเลือนเข้าหากัน
CLIP_START, CLIP_SEC = 1, 4  # ใช้วินาทีที่ 1-5 ของคลิป (วินาทีแรกมักเป็นตอนกดปุ่ม)
MUSIC_VOLUME = 0.35   # เพลงเบากว่าเสียงพูดในคลิป

# ทุกท่อนต้องมีรูปแบบเดียวกัน (ขนาด, fps, ช่องเสียง) ถึงจะต่อกันด้วย concat ได้โดยไม่ต้องแปลงใหม่
VIDEO_OUT = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-ar", "44100", "-ac", "2"]
SILENCE = ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]  # ท่อนที่ไม่มีเสียง ใส่ความเงียบแทน

# หน้าเว็บอ่านค่านี้ทุก 1.5 วิ (step = ข้อความโชว์บนเว็บ)
status = {"busy": False, "day": None, "step": "", "error": None}


# ---------- เริ่ม/ขั้นตอนหลัก ----------

def start(day_dir):
    """เริ่มทำวิดีโอเบื้องหลัง (กำลังทำอีกวันอยู่ -> False)"""
    if status["busy"]:
        return False

    def run():
        status.update(busy=True, day=day_dir.name, error=None)
        try:
            build(day_dir)
            status["step"] = "Done"
        except Exception as e:
            status["error"] = str(e)
        status["busy"] = False

    threading.Thread(target=run, daemon=True).start()
    return True


def build(day_dir, out=None):
    """ทำวิดีโอของวัน (out = ที่เก็บไฟล์ ไม่ใส่ = highlight.mp4 ในโฟลเดอร์วัน) -> ข้อมูลสรุป"""
    out = out or day_dir / "highlight.mp4"
    photos = sorted(p for p in day_dir.glob("photo_*.jpg") if p.stat().st_size > 0)
    clips = sorted(p for p in day_dir.glob("clip_*") if p.is_dir())
    if not photos and not clips:
        raise RuntimeError("No photos on this day")

    tmp = Path(tempfile.mkdtemp(prefix="highlight_"))
    try:
        status["step"] = f"Picking the best of {len(photos)} photos"
        chosen = pick_photos(photos)
        used_clips = pick_clips(clips)

        status["step"] = "Making the title"
        parts = [tmp / "p000.mp4"]
        still(title_card(day_dir.name, len(photos), len(clips)), TITLE_SEC, parts[0])
        total = TITLE_SEC + render_timeline(chosen, used_clips, tmp, parts)

        status["step"] = "Joining"
        joined = tmp / "joined.mp4"
        concat(parts, joined)

        song = pick_music()
        if song:
            status["step"] = "Adding music"
            add_music(joined, song, total, out)
        else:
            ffmpeg("-i", joined, "-c", "copy", "-movflags", "+faststart", out)

        # used = ชื่อภาพ/คลิปที่อยู่ในวิดีโอ ไว้ให้ server เช็กว่ามีอันไหนถูกลบไปหลังทำวิดีโอไหม
        info = {"song": song.name if song else None, "photos": len(chosen), "clips": len(used_clips),
                "seconds": round(total, 1), "used": [p.name for p in chosen] + [c.name for c in used_clips]}
        if out == day_dir / "highlight.mp4":
            (day_dir / "highlight.json").write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
        return info
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def render_timeline(photos, clips, tmp, parts):
    """เรียงภาพกับคลิปตามเวลาจริง ทำเป็นท่อนๆ ต่อท้าย parts -> ความยาวรวม (วินาที)
    ภาพที่อยู่ติดกัน (ไม่มีคลิปคั่น) รวมเป็นท่อนเดียว จะได้เลือนเข้าหากันได้"""
    # ชื่อไฟล์หลัง "photo_"/"clip_" คือเวลาที่ถ่าย -> เรียงตามชื่อ = เรียงตามเวลา
    timeline = sorted([(p.name[6:], "photo", p) for p in photos] + [(c.name[5:], "clip", c) for c in clips])
    total, run = 0, []

    def flush():
        if run:
            status["step"] = f"Rendering {len(run)} photos"
            parts.append(tmp / f"p{len(parts):03d}.mp4")
            photo_run(run, parts[-1], fade_in_black=len(parts) == 2)  # ท่อนแรกหลังหน้าปก เลือนจากสีดำ
            run.clear()

    for _, kind, item in timeline:
        if kind == "photo":
            run.append(item)
            total += PHOTO_SEC
        else:
            flush()
            status["step"] = f"Adding clip {time_of(item.name) or item.name}"
            parts.append(tmp / f"p{len(parts):03d}.mp4")
            total += clip_part(item, tmp, parts[-1])
    flush()
    return total


# ---------- วาดเฟรม ----------

def font(size):
    return ImageFont.truetype(FONT, size)


def fit(src):
    """ภาพจากกล้อง -> เฟรม W x H ที่ปรับสีแล้ว (พื้นดำถ้าสัดส่วนไม่ตรง)"""
    canvas = Image.new("RGB", (W, H), "black")
    with Image.open(src) as im:
        im = im.convert("RGB")
        im.thumbnail(canvas.size)
        im = grade(im)
        canvas.paste(im, ((canvas.width - im.width) // 2, (canvas.height - im.height) // 2))
    return canvas


def draw_time(frame, text):
    """เวลาเล็กๆ มุมซ้ายล่าง แบบกล้องฟิล์ม"""
    if not text:
        return frame
    d = ImageDraw.Draw(frame, "RGBA")
    f = font(30)
    box = d.textbbox((0, 0), text, font=f)
    x, y = 36, H - 36 - (box[3] - box[1])
    d.text((x + 2, y - box[1] + 2), text, font=f, fill=(0, 0, 0, 140))
    d.text((x, y - box[1]), text, font=f, fill=(255, 214, 160))
    return frame


def title_card(day, n_photos, n_clips):
    im = Image.new("RGB", (W, H), (20, 17, 15))
    d = ImageDraw.Draw(im)
    lines = [(long_date(day), font(52), (255, 255, 255)),
             (f"{n_photos} photos · {n_clips} clips", font(28), (200, 190, 180)),
             ("Memory Clip", font(24), (255, 170, 90))]
    y = H // 2 - 80
    for text, f, color in lines:
        box = d.textbbox((0, 0), text, font=f)
        d.text(((W - box[2] + box[0]) // 2, y - box[1]), text, font=f, fill=color)
        y += box[3] - box[1] + 30
    return im


def long_date(day):
    """'2026-10-20' -> 'Tuesday, 20 October 2026' (ชื่อโฟลเดอร์ไม่ใช่วันที่ -> ชื่อเดิม)"""
    try:
        d = date.fromisoformat(day)
    except ValueError:
        return day
    return f"{d:%A}, {d.day} {d:%B %Y}"


# ---------- ทำวิดีโอทีละท่อน ----------

class Writer:
    """ส่งเฟรมดิบให้ ffmpeg ทาง stdin -> ได้ mp4 (ไม่ต้องเขียนเฟรมเป็นไฟล์ทีละภาพ)"""

    def __init__(self, out, seconds):
        self.p = subprocess.Popen(
            [str(FFMPEG), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
             "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", *SILENCE, "-t", str(seconds), *VIDEO_OUT, str(out)],
            stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    def put(self, frame):
        self.p.stdin.write(frame.tobytes())

    def close(self):
        self.p.stdin.close()
        err = self.p.stderr.read().decode("utf-8", "replace")
        if self.p.wait() != 0:
            raise RuntimeError(err.strip()[-300:])


def still(img, seconds, out):
    w = Writer(out, seconds)
    for _ in range(round(seconds * FPS)):
        w.put(img)
    w.close()


def photo_run(photos, out, fade_in_black=False):
    """ภาพนิ่งหลายภาพต่อกัน ภาพละ PHOTO_SEC วิ เลือนเข้าหากันช่วง FADE_SEC"""
    n, fade = round(PHOTO_SEC * FPS), round(FADE_SEC * FPS)
    w = Writer(out, len(photos) * PHOTO_SEC)
    prev = Image.new("RGB", (W, H)) if fade_in_black else None
    for p in photos:
        img = draw_time(fit(p), time_of(p.name))
        for i in range(n):
            w.put(Image.blend(prev, img, (i + 1) / (fade + 1)) if i < fade and prev is not None else img)
        prev = img
    w.close()


def clip_part(clip, tmp, out):
    """คลิป -> ท่อนวิดีโอยาว CLIP_SEC วิพร้อมเสียง -> ความยาว (วินาที)
    บอร์ดถ่าย 1 ภาพต่อวินาที ภาพที่ k = วินาทีที่ k ของเสียง"""
    imgs = sorted(p for p in clip.glob("img_*.jpg") if p.stat().st_size > 0)
    start = CLIP_START if len(imgs) > CLIP_START + 1 else 0
    imgs = imgs[start:start + CLIP_SEC]
    label = time_of(clip.name)
    frames = []
    for i, p in enumerate(imgs):
        f = tmp / f"{clip.name}_{i:02d}.jpg"
        draw_time(fit(p), label).save(f, quality=92)
        frames.append(f)
    # ffconcat: บอก ffmpeg ว่าภาพไหนแสดงกี่วินาที (ภาพสุดท้ายต้องใส่ซ้ำ ไม่งั้น ffmpeg ตัดทิ้ง)
    lst = out.with_suffix(".txt")
    lst.write_text("ffconcat version 1.0\n" + "".join(f"file '{f.as_posix()}'\nduration 1\n" for f in frames)
                   + f"file '{frames[-1].as_posix()}'\n", encoding="utf-8")
    total = len(frames)
    audio = clip / "audio.wav"
    if audio.exists():
        # เสียงค่อยๆ ดังขึ้น/เบาลง 0.15 วิ กันเสียงดังป๊อกตอนตัด
        ffmpeg("-f", "concat", "-safe", "0", "-i", lst, "-ss", start, "-i", audio, "-t", total,
               "-af", f"afade=t=in:d=0.15,afade=t=out:st={total - 0.15}:d=0.15", *VIDEO_OUT, out)
    else:
        ffmpeg("-f", "concat", "-safe", "0", "-i", lst, *SILENCE, "-t", total, *VIDEO_OUT, out)
    return total


# ---------- ต่อท่อน + เพลง ----------

def ffmpeg(*args):
    r = subprocess.run([str(FFMPEG), "-y", "-loglevel", "error", *map(str, args)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[-300:])


def concat(parts, out):
    lst = out.with_suffix(".txt")
    lst.write_text("\n".join(f"file '{p.as_posix()}'" for p in parts), encoding="utf-8")
    ffmpeg("-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out)


def pick_music():
    songs = [s for m in MOODS for s in (MUSIC_ROOT / m).glob("*.mp3")]
    if not songs:  # ไม่มีเพลงในสองโฟลเดอร์นี้ ใช้เพลงจากโฟลเดอร์ไหนก็ได้
        songs = list(MUSIC_ROOT.glob("*/*.mp3")) + list(MUSIC_ROOT.glob("*/*.m4a"))
    return random.choice(songs) if songs else None


def add_music(video, song, seconds, out):
    # -stream_loop -1 = เพลงสั้นกว่าวิดีโอก็วนซ้ำ, เพลงค่อยๆ เบาลง 2 วิสุดท้าย
    # amix: รวมเสียงคลิป (ท่อนอื่นเงียบ) กับเพลง จบพร้อมวิดีโอ
    ffmpeg("-i", video, "-stream_loop", "-1", "-i", song, "-filter_complex",
           f"[1:a]volume={MUSIC_VOLUME},afade=t=out:st={max(0, seconds - 2):.2f}:d=2[m];"
           "[0:a][m]amix=inputs=2:duration=first:normalize=0[a]",
           "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", out)

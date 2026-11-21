// ตัวเล่นในหน้าวัน: "สรุปวันนี้" (ภาพทุกนาทีเล่นต่อกัน) และคลิป (ภาพเปลี่ยนตามเสียง)

import { openLightbox } from './lightbox.js';
import { ICON_PAUSE, ICON_PLAY } from './util.js';

// ---------- สรุปวันนี้ ----------
// เปลี่ยนภาพเร็วๆ เหมือนเปิดสมุดภาพ (flipbook) กดความเร็วได้ 1× 2× 4×
export function setupRecap(photos) {
  const root = document.getElementById('recap');
  const img = root.querySelector('img');
  const range = root.querySelector('input');
  const btn = root.querySelector('.play');
  const speedBtn = root.querySelector('.speed');
  const count = root.querySelector('.count');
  const speeds = [1, 2, 4];
  let i = 0, timer = null, speed = 0;

  // โหลดภาพล่วงหน้า 3 ภาพ ตอนเล่นจะได้ไม่กระพริบ
  const preload = k => { for (let j = 1; j <= 3; j++) if (photos[k + j]) new Image().src = photos[k + j].src; };

  function show(k) {
    i = k;
    img.src = photos[k].src;
    range.value = k;
    count.textContent = `${k + 1} / ${photos.length}`;
    preload(k);
  }
  function stop() { clearInterval(timer); timer = null; btn.innerHTML = ICON_PLAY; }
  function play() {
    if (i >= photos.length - 1) show(0);
    btn.innerHTML = ICON_PAUSE;
    timer = setInterval(() => (i < photos.length - 1 ? show(i + 1) : stop()), 400 / speeds[speed]);
  }

  btn.onclick = () => (timer ? stop() : play());
  range.oninput = () => { stop(); show(+range.value); };
  speedBtn.onclick = () => {
    speed = (speed + 1) % speeds.length;
    speedBtn.textContent = speeds[speed] + '×';
    if (timer) { stop(); play(); }
  };
  img.onclick = () => openLightbox(photos, i);
  show(0);
}

// ---------- คลิป ----------
// บอร์ดถ่ายภาพทุก 1 วินาทีระหว่างอัดเสียง: ภาพที่ k = วินาทีที่ k ของเสียง
export function setupClip(el, clip) {
  const img = el.querySelector('.screen img');
  const bar = el.querySelector('.progress i');
  const strip = [...el.querySelectorAll('.strip img')];
  const audio = el.querySelector('audio');
  const show = k => {
    if (!clip.frames[k]) return;
    img.src = clip.frames[k];
    strip.forEach((s, j) => s.classList.toggle('on', j === k));
  };
  show(0);

  // กดภาพเล็กด้านล่าง = กระโดดไปวินาทีนั้น
  strip.forEach(s => s.addEventListener('click', () => {
    const k = +s.dataset.k;
    if (audio) audio.currentTime = k;
    show(k);
  }));
  if (!audio) {  // คลิปไม่มีเสียง: กดแล้วดูภาพเต็มจอแทน
    if (img) img.parentElement.onclick = () => openLightbox(clip.frames, 0);
    return;
  }

  el.querySelector('.screen').onclick = () => {
    // เล่นได้ทีละคลิป: กดคลิปใหม่ คลิปที่เล่นอยู่จะหยุด
    document.querySelectorAll('.clip audio').forEach(a => { if (a !== audio) a.pause(); });
    audio.paused ? audio.play() : audio.pause();
  };
  audio.onplay = () => el.classList.add('playing');
  audio.onpause = audio.onended = () => el.classList.remove('playing');
  audio.ontimeupdate = () => {
    show(Math.min(clip.frames.length - 1, Math.floor(audio.currentTime)));
    bar.style.width = (audio.currentTime / (audio.duration || 1)) * 100 + '%';
  };
}

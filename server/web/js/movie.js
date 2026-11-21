// วิดีโอสรุปวัน: ปุ่ม "Make day video/Remake" สั่ง server ตัดต่อ (highlight.py) แล้วถามความคืบหน้าทุก 1.5 วิ

import { renderDay } from './day.js';
import { shareFile } from './share.js';
import { app, getJSON, postJSON } from './util.js';

export function setupMovie(day, src) {
  const make = app.querySelector('.make-movie');
  const share = app.querySelector('.share-movie');
  const status = app.querySelector('.movie-status');
  if (share) share.onclick = () => shareFile(src, `memory-clip-${day}.mp4`);

  async function poll() {
    const s = await getJSON('/api/highlight/status');
    if (s.busy) {
      status.textContent = 'Working: ' + s.step;
      make.disabled = true;
      setTimeout(poll, 1500);
    } else if (s.error) {
      status.textContent = 'Failed: ' + s.error;
      make.disabled = false;
    } else if (make.disabled) {
      renderDay(day);  // เสร็จแล้ว โหลดหน้าใหม่ให้เห็นวิดีโอ
    }
  }

  make.onclick = async () => {
    const r = await postJSON('/api/highlight', { day });
    if (!r.ok) { status.textContent = (await r.json()).error; return; }
    make.disabled = true;
    poll();
  };
}

// เลือกภาพเพื่อลบ (ในหัวข้อ "Photos" ภาพแบ่งเป็นชั่วโมง ดู day.js)
//   วิธีที่ 1: กด "Select" -> แตะภาพทีละภาพ -> กดปุ่มลบด้านล่าง
//   วิธีที่ 2: กดค้างที่ภาพแล้วลาก = เลือกทั้งช่วง (แบบ Google Photos)
//   วิธีที่ 3: กด "Select hour" ที่หัวชั่วโมง = เลือก/เอาออกทั้งชั่วโมง
//   ออกจากโหมดเลือก: ปุ่ม Cancel ในแถบล่าง (อยู่ล่างจอตลอด) หรือปุ่มเดิมที่หัวข้อ
// ตอนไม่ได้อยู่ในโหมดเลือก แตะภาพ = ดูภาพเต็มจอ

import { openLightbox } from './lightbox.js';
import { deleteItems } from './trash.js';

let picking = false;      // อยู่ในโหมดเลือกไหม
const picked = new Set(); // ชื่อไฟล์ที่เลือกไว้

// ออกจากโหมดเลือก (ตอนเปลี่ยนหน้า)
export function resetPicker() {
  picking = false;
  picked.clear();
}

export function setupPicker(day, photos) {
  const grid = document.getElementById('grid');
  const toggle = document.getElementById('pickToggle');
  const bar = document.getElementById('pickBar');

  // วาดหน้าจอให้ตรงกับ picking/picked ทุกครั้งที่มีอะไรเปลี่ยน
  const sync = () => {
    grid.classList.toggle('picking', picking);
    toggle.textContent = picking ? 'Cancel' : 'Select';
    grid.querySelectorAll('.ph').forEach(b => b.classList.toggle('picked', picked.has(photos[b.dataset.i].name)));
    // ปุ่มหัวชั่วโมง: เลือกครบทั้งชั่วโมงแล้ว -> เปลี่ยนเป็น "Clear hour"
    grid.querySelectorAll('.hour').forEach(h => {
      const all = [...h.querySelectorAll('.ph')].every(b => picked.has(photos[b.dataset.i].name));
      h.querySelector('.hour-pick').textContent = all ? 'Clear hour' : 'Select hour';
    });
    bar.hidden = !picking;
    bar.querySelectorAll('.n').forEach(n => { n.textContent = picked.size; });
    bar.querySelector('.del').disabled = picked.size === 0;
  };

  toggle.onclick = () => { picking = !picking; picked.clear(); sync(); };
  bar.querySelector('.cancel').onclick = () => { picking = false; picked.clear(); sync(); };
  grid.querySelectorAll('.hour-pick').forEach(b => b.addEventListener('click', () => {
    const names = [...b.closest('.hour').querySelectorAll('.ph')].map(p => photos[p.dataset.i].name);
    const all = names.every(n => picked.has(n));
    names.forEach(n => all ? picked.delete(n) : picked.add(n));
    sync();
  }));
  grid.querySelectorAll('.ph').forEach(b => b.addEventListener('click', () => {
    const p = photos[b.dataset.i];
    if (!picking) return openLightbox(photos, +b.dataset.i);
    picked.has(p.name) ? picked.delete(p.name) : picked.add(p.name);
    sync();
  }));
  setupDragSelect(grid, photos, sync);
  bar.querySelector('.del').onclick = async () => {
    const names = [...picked];
    picking = false; picked.clear(); sync();
    await deleteItems(day, names);
  };
  sync();
}

// ---------- กดค้างแล้วลาก = เลือกหลายภาพ ----------
// กดค้าง 0.4 วิที่ภาพไหนก็ได้ -> เข้าโหมดเลือกเอง แล้วลากนิ้วผ่านภาพอื่น
// ภาพตั้งแต่ภาพแรกถึงภาพที่นิ้วอยู่จะถูกเลือกทั้งช่วง
// ถ้าเริ่มกดที่ภาพที่เลือกไว้แล้ว การลากจะ "เอาออก" แทน
// ถ้าขยับนิ้วก่อนครบ 0.4 วิ = ตั้งใจเลื่อนจอ ไม่นับเป็นการเลือก
function setupDragSelect(grid, photos, sync) {
  const HOLD_MS = 400;
  let timer = null, start = null, drag = null, last = null, skipClick = false, scrollRaf = null;

  function begin(x, y, target) {
    const b = target.closest('#grid .ph');
    if (!b) return;
    skipClick = false;
    start = { x, y };
    timer = setTimeout(() => {
      timer = null;
      if (!picking) { picking = true; picked.clear(); }
      const i = +b.dataset.i;
      // จำว่าก่อนลากเลือกอะไรไว้ ลากย้อนกลับแล้วภาพที่เคยเลือกจะไม่หายไปด้วย
      drag = { from: i, to: null, adding: !picked.has(photos[i].name), before: new Set(picked) };
      skipClick = true;  // ปล่อยนิ้วแล้วไม่ต้องนับเป็นการแตะอีกครั้ง
      navigator.vibrate?.(15);
      update(x, y);
    }, HOLD_MS);
  }

  function update(x, y) {
    last = { x, y };
    const b = document.elementFromPoint(x, y)?.closest('#grid .ph');
    if (!b || +b.dataset.i === drag.to) return;
    drag.to = +b.dataset.i;
    const lo = Math.min(drag.from, drag.to), hi = Math.max(drag.from, drag.to);
    picked.clear();
    drag.before.forEach(n => picked.add(n));
    for (let i = lo; i <= hi; i++) drag.adding ? picked.add(photos[i].name) : picked.delete(photos[i].name);
    sync();
  }

  function move(x, y, e) {
    if (timer && Math.hypot(x - start.x, y - start.y) > 10) { clearTimeout(timer); timer = null; }
    if (!drag) return;
    e.preventDefault();  // กันจอเลื่อนตามนิ้วตอนลากเลือก
    update(x, y);
    autoScroll();
  }

  function end() {
    clearTimeout(timer);
    timer = null; drag = null;
    cancelAnimationFrame(scrollRaf); scrollRaf = null;
  }

  // ลากไปใกล้ขอบบน/ล่างของจอ -> เลื่อนจอให้เอง จะได้เลือกภาพที่อยู่นอกจอได้
  function autoScroll() {
    if (scrollRaf) return;
    const step = () => {
      scrollRaf = null;
      if (!drag) return;
      const EDGE = 70, y = last.y;
      const dy = y < EDGE ? -(EDGE - y) / 3 : y > innerHeight - EDGE ? (y - innerHeight + EDGE) / 3 : 0;
      if (!dy) return;
      scrollBy(0, dy);
      update(last.x, last.y);
      scrollRaf = requestAnimationFrame(step);
    };
    scrollRaf = requestAnimationFrame(step);
  }

  // นิ้ว (มือถือ)
  const pt = e => e.touches[0];
  grid.addEventListener('touchstart', e => {
    if (e.touches.length === 1) begin(pt(e).clientX, pt(e).clientY, e.target); else end();
  }, { passive: true });
  grid.addEventListener('touchmove', e => move(pt(e).clientX, pt(e).clientY, e), { passive: false });
  grid.addEventListener('touchend', end);
  grid.addEventListener('touchcancel', end);
  // เมาส์ (คอม): กดค้างแล้วลากได้เหมือนกัน
  grid.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();  // กันเบราว์เซอร์ลากรูปออกไปเป็นไฟล์
    begin(e.clientX, e.clientY, e.target);
    addEventListener('mouseup', end, { once: true });  // ปล่อยเมาส์นอกตารางภาพก็หยุดลาก
  });
  grid.addEventListener('mousemove', e => move(e.clientX, e.clientY, e));
  grid.addEventListener('contextmenu', e => e.preventDefault());  // กดค้างบนมือถือไม่ให้เด้งเมนู "บันทึกภาพ"
  grid.addEventListener('click', e => {
    if (skipClick) { e.stopPropagation(); skipClick = false; }
  }, true);
}

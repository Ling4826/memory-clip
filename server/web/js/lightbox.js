// ดูภาพเต็มจอ: เลื่อนภาพด้วยปุ่ม < > / ลูกศรบนคีย์บอร์ด / ปัดซ้าย-ขวาบนมือถือ, แชร์ และลบภาพนี้

import { shareFile } from './share.js';
import { deleteItems } from './trash.js';

const lb = document.getElementById('lightbox');
const lbImg = lb.querySelector('img');
const lbCap = lb.querySelector('.lb-cap');
const lbDel = lb.querySelector('.lb-del');
// รายการเป็นได้ทั้ง "ลิงก์ภาพ" เฉยๆ (เฟรมในคลิป) หรือ {src, name, time} (ภาพทั้งวัน)
let list = [], index = 0;
let day = null;  // วันของภาพที่เปิดอยู่ (ใช้ตอนกดลบ)

export function openLightbox(items, i) {
  day = decodeURIComponent((location.hash.match(/^#\/day\/(.+)$/) || [])[1] || '');
  list = items;
  lb.hidden = false;
  show(i);
}

export function closeLightbox() {
  lb.hidden = true;
}

function show(i) {
  index = (i + list.length) % list.length;  // เลยภาพสุดท้ายแล้ววนกลับภาพแรก
  const item = list[index];
  lbDel.hidden = !item.name;  // เฟรมในคลิปลบทีละภาพไม่ได้ ลบทั้งคลิปที่การ์ดคลิปแทน
  lbImg.src = item.src || item;
  lbCap.textContent = `${index + 1} / ${list.length}` + (item.time ? ` · ${item.time}` : '');
}

// ---------- ปุ่ม ----------
lbDel.onclick = async e => {
  e.stopPropagation();
  const item = list[index];
  if (!item.name || !day) return;
  closeLightbox();
  await deleteItems(day, [item.name]);
};
lb.querySelector('.lb-share').onclick = e => {
  e.stopPropagation();
  const src = list[index].src || list[index];
  shareFile(src, 'memory-clip-' + src.split('/').pop());
};
lb.querySelector('.lb-close').onclick = closeLightbox;
lb.querySelector('.prev').onclick = e => { e.stopPropagation(); show(index - 1); };
lb.querySelector('.next').onclick = e => { e.stopPropagation(); show(index + 1); };
lb.onclick = e => { if (e.target === lb) closeLightbox(); };  // กดพื้นดำรอบภาพ = ปิด

// ---------- คีย์บอร์ด ----------
document.addEventListener('keydown', e => {
  if (lb.hidden) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') show(index - 1);
  if (e.key === 'ArrowRight') show(index + 1);
});

// ---------- มือถือ: ปัดซ้าย/ขวาเพื่อเปลี่ยนภาพ ----------
let touchX = null;
lb.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
lb.addEventListener('touchend', e => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  touchX = null;
});

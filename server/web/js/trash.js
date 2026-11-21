// ลบภาพ/คลิป (server ย้ายไปถังขยะ uploads/_trash) + แถบแจ้ง "Deleted" พร้อมปุ่ม Undo
// ไม่ถามยืนยันก่อนลบ แต่ให้กด "Undo" ได้ 8 วินาที (ไฟล์ยังอยู่ในถังขยะเสมอ)

import { renderDay } from './day.js';
import { keepScroll, postJSON } from './util.js';

const toast = document.getElementById('toast');
let toastTimer = null;

function showToast(text, onUndo) {
  toast.querySelector('span').textContent = text;
  const undo = toast.querySelector('button');
  undo.hidden = !onUndo;
  undo.onclick = async () => { toast.hidden = true; await onUndo(); };
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 8000);
}

export async function deleteItems(day, names) {
  if (!names.length) return;
  const r = await (await postJSON('/api/delete', { day, names })).json();
  await keepScroll(() => renderDay(day));
  showToast(`Deleted ${r.deleted.length} item${r.deleted.length === 1 ? '' : 's'}`, async () => {
    await postJSON('/api/restore', { day, names: r.deleted });
    await keepScroll(() => renderDay(day));
    showToast('Restored');
  });
}

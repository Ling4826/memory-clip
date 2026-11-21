// ของที่ใช้ร่วมกันหลายไฟล์: ส่วนของหน้าเว็บที่ JS เขียนเนื้อหาลงไป, แปลงวันที่, คุยกับ server, ไอคอน
// ข้อความบนหน้าเว็บเป็นภาษาอังกฤษ (คอมเมนต์ในโค้ดเป็นไทย)

export const app = document.getElementById('app');       // เนื้อหาหลักของหน้า (เปลี่ยนตามหน้าที่เปิด)
export const topSub = document.getElementById('topSub'); // วันที่เล็กๆ ในแถบบน

export const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';
export const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1.5"/><rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>';

// แปลง "2026-10-19" เป็น "Monday 19 October 2026" (ถ้าชื่อโฟลเดอร์ไม่ใช่วันที่ ก็แสดงชื่อเดิม)
export function formatDate(day, opts = { dateStyle: 'full' }) {
  const d = new Date(day + 'T00:00:00');
  return isNaN(d) ? day : new Intl.DateTimeFormat('en-GB', opts).format(d);
}

// กันตัวอักษรพิเศษในข้อความ (เช่น < >) กลายเป็น HTML ตอนใส่ลงหน้าเว็บ
export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function getJSON(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

export function postJSON(u, body) {
  return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

// ทำงาน (เช่น โหลดหน้าใหม่) โดยจอยังอยู่ตำแหน่งเดิม ไม่เด้งกลับขึ้นบนสุด
export async function keepScroll(fn) {
  const y = window.scrollY;
  await fn();
  window.scrollTo(0, y);
}

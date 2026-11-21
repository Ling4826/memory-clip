// หน้าเว็บ Memory Clip — ไฟล์เริ่มต้น (index.html โหลดไฟล์นี้ไฟล์เดียว ไฟล์อื่น import ต่อกันเอง)
//
// ใช้ # ใน URL แยกหน้า:  #/ = รายการวัน,  #/day/2026-10-19 = หน้าของวันนั้น
// ข้อมูลมาจาก server เป็น JSON (/api/days, /api/day/<วัน>) แล้ว JS สร้างหน้าเว็บเอง
//
// ไฟล์ใน js/ แยกตามหน้าที่:
//   main.js      เลือกหน้าตาม URL + เริ่มทุกอย่าง (ไฟล์นี้)
//   home.js      หน้าแรก: การ์ดทีละวัน
//   day.js       หน้าของวัน: ประกอบทุกส่วนเข้าด้วยกัน
//   status.js    ป้ายแบต/สถานะกล้องมุมขวาบน + กราฟแบต
//   movie.js     วิดีโอสรุปวัน (สั่งทำ/ทำใหม่)
//   players.js   ตัวเล่น "สรุปวันนี้" และคลิป
//   picker.js    เลือกภาพเพื่อลบ (แตะ / กดค้างแล้วลาก)
//   trash.js     ลบ + ปุ่มเลิกทำ
//   lightbox.js  ดูภาพเต็มจอ
//   share.js     แชร์ไฟล์ไป IG / Facebook / LINE
//   util.js      ของที่ใช้ร่วมกัน

import { renderDay } from './day.js';
import { renderHome } from './home.js';
import { closeLightbox } from './lightbox.js';
import { resetPicker } from './picker.js';
import { startStatusPills } from './status.js';
import { app, esc } from './util.js';

async function route() {
  closeLightbox();
  resetPicker();
  document.querySelectorAll('audio').forEach(a => a.pause());
  const m = location.hash.match(/^#\/day\/(.+)$/);
  try {
    if (m) await renderDay(decodeURIComponent(m[1]));
    else await renderHome();
  } catch (err) {
    app.innerHTML = `<div class="empty"><b>Couldn't load</b>Is the server running? (${esc(err.message)})</div>`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
startStatusPills();

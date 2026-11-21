// หน้าแรก (#/): ภาพปก + วันที่ ทีละวัน กดแล้วไปหน้าของวันนั้น

import { showUploadLine } from './status.js';
import { app, esc, formatDate, getJSON, topSub } from './util.js';

export async function renderHome() {
  topSub.textContent = '';
  const days = await getJSON('/api/days');
  if (!days.length) {
    app.innerHTML = `<div class="empty"><b>No memories yet</b>Connect the camera to the computer's hotspot and files will appear here.</div>`;
    return;
  }
  const total = days.reduce((n, d) => n + d.photos, 0);
  app.innerHTML = `
    <div class="hero">
      <h1>Days</h1>
      <p>${days.length} days, ${total.toLocaleString('en-GB')} photos</p>
    </div>
    <p class="upload-line" id="uploadLine" hidden></p>
    <div class="days">${days.map(dayCard).join('')}</div>`;
  showUploadLine();
}

function dayCard(d) {
  return `
    <a class="day-card" href="#/day/${encodeURIComponent(d.day)}">
      <div class="cover">${d.cover ? `<img src="${esc(d.cover)}" loading="lazy" alt="">` : ''}</div>
      <div class="meta">
        <b>${esc(formatDate(d.day, { weekday: 'short', day: 'numeric', month: 'short' }))}</b>
        <span class="num">${d.photos} photos · ${d.clips} clips</span>
      </div>
    </a>`;
}

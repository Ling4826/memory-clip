// หน้าของวัน (#/day/2026-10-19): ประกอบหน้าจากส่วนย่อยๆ ตามลำดับบนจอ
//   หัวหน้า -> Battery -> Highlight video -> Timelapse (เล่นภาพต่อกัน) -> Clips -> All photos
// แต่ละส่วนมีฟังก์ชันสร้าง HTML ของตัวเอง แล้วค่อยผูกปุ่มต่างๆ หลังใส่ลงหน้าแล้ว

import { renderBattery } from './battery.js';
import { setupMovie } from './movie.js';
import { setupPicker } from './picker.js';
import { setupClip, setupRecap } from './players.js';
import { gapMissed, gapRange } from './status.js';
import { deleteItems } from './trash.js';
import { app, esc, formatDate, getJSON, ICON_PLAY, topSub } from './util.js';

// ชั่วโมงที่เปิดดูอยู่ (จำไว้ หลังลบภาพแล้วหน้าวาดใหม่ ชั่วโมงที่เปิดอยู่จะได้ไม่พับกลับ)
const openHours = new Set();
let openDay = null;

export async function renderDay(day) {
  const data = await getJSON('/api/day/' + encodeURIComponent(day));
  const { photos, clips } = data;
  topSub.textContent = formatDate(day, { day: 'numeric', month: 'short' });

  app.innerHTML = [
    headHtml(day, photos, clips),
    batteryHtml(),
    movieHtml(data, photos),
    photos.length > 1 ? recapHtml(photos) : '',
    clips.length ? clipsHtml(clips) : '',
    photos.length ? gridHtml(photos, day, data.sd_outages || []) : '',
    !photos.length && !clips.length ? '<div class="empty"><b>Nothing here yet</b></div>' : '',
  ].join('');

  renderBattery(day, document.getElementById('batChart'));
  setupMovie(day, data.highlight);
  if (photos.length > 1) setupRecap(photos);
  app.querySelectorAll('.clip').forEach(el => setupClip(el, clips[el.dataset.i]));
  setupClipList();
  app.querySelectorAll('.clip-del').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();  // ไม่ให้นับเป็นการกดเล่นคลิป
    deleteItems(day, [b.dataset.name]);
  }));
  if (photos.length) {
    setupHours(day);
    setupPicker(day, photos);
  }
}

function headHtml(day, photos, clips) {
  return `
    <div class="day-head">
      <a class="back" href="#/">&larr; All days</a>
      <h1>${esc(formatDate(day))}</h1>
      <span class="count-line num">${photos.length} photos · ${clips.length} clips</span>
    </div>`;
}

function batteryHtml() {
  return `
    <section>
      <h2>Battery</h2>
      <div class="bat-chart" id="batChart"></div>
    </section>`;
}

function movieHtml(data, photos) {
  // ?v=เวลา กันเบราว์เซอร์เล่นวิดีโอเก่าที่จำไว้ หลังกด "Remake"
  const poster = photos.length ? `poster="${esc(photos[Math.floor(photos.length / 2)].src)}"` : '';
  return `
    <section>
      <h2>Highlight video</h2>
      <div class="movie">
        ${data.highlight ? `<video controls playsinline preload="metadata" src="${esc(data.highlight)}?v=${Date.now()}" ${poster}></video>` : ''}
        <div class="movie-bar">
          ${data.highlight ? `<button class="share-movie">Share video</button>` : ''}
          <button class="make-movie">${data.highlight ? 'Remake' : 'Make video'}</button>
          <span class="movie-status">${data.highlight_stale ? 'Some photos in this video were deleted. Press "Remake" to remove them.' : ''}</span>
        </div>
      </div>
    </section>`;
}

function recapHtml(photos) {
  return `
    <section>
      <h2>Timelapse <small class="num">${photos.length} frames</small></h2>
      <div class="recap" id="recap">
        <div class="screen"><img alt=""></div>
        <div class="bar">
          <button class="play" aria-label="Play">${ICON_PLAY}</button>
          <input type="range" min="0" max="${photos.length - 1}" value="0" aria-label="Seek">
          <button class="speed">1×</button>
          <span class="count"></span>
        </div>
      </div>
    </section>`;
}

function clipsHtml(clips) {
  return `
    <section>
      <h2>Clips <small class="num">${clips.length}</small></h2>
      <div class="clips">${clips.map(clipHtml).join('')}</div>
    </section>`;
}

function clipHtml(c, i) {
  const title = c.time ? 'Clip ' + esc(c.time) : esc(c.name.replace('clip_', 'Clip #'));
  const detail = (c.frames.length ? c.frames.length + ' photos' : 'Audio only') + (c.audio && c.frames.length ? ' · with sound' : '');
  // แถวเล็ก (ภาพย่อ + เวลา + รายละเอียด) แตะแล้วกางตัวเล่นข้างล่าง เปิดได้ทีละคลิป
  return `
    <div class="clip" data-i="${i}">
      <button class="clip-row" aria-expanded="false">
        ${c.frames.length ? `<img src="${esc(c.thumbs[0] || c.frames[0])}" loading="lazy" alt="">` : '<span class="clip-noimg">audio</span>'}
        <b>${title}</b>
        <span>${detail}</span>
        <i class="hour-arrow" aria-hidden="true">›</i>
      </button>
      <div class="clip-body">
      <div class="screen">
        ${c.frames.length ? `<img src="${esc(c.frames[0])}" alt="">` : '<div class="audio-only">audio only</div>'}
        ${c.audio ? `<button class="big-play" aria-label="Play clip">${ICON_PLAY}</button>` : ''}
      </div>
      <div class="progress"><i></i></div>
      <div class="info">
        <b>${title}</b>
        <span><button class="clip-del" data-name="${esc(c.name)}" aria-label="Delete this clip">delete</button></span>
      </div>
      <div class="strip">${c.thumbs.map((t, k) => `<img src="${esc(t)}" data-k="${k}" loading="lazy" alt="">`).join('')}</div>
      ${c.audio ? `<audio preload="none" src="${esc(c.audio)}"></audio>` : ''}
      </div>
    </div>`;
}

// แตะแถวคลิป = กางตัวเล่น + เล่นเลย, แตะคลิปอื่น = คลิปเดิมพับและหยุด, แตะซ้ำ = พับ
function setupClipList() {
  const all = [...app.querySelectorAll('.clip')];
  all.forEach(el => el.querySelector('.clip-row').addEventListener('click', () => {
    const opening = !el.classList.contains('open');
    all.forEach(o => {
      o.classList.remove('open');
      o.querySelector('.clip-row').setAttribute('aria-expanded', 'false');
      o.querySelector('audio')?.pause();
    });
    if (!opening) return;
    el.classList.add('open');
    el.querySelector('.clip-row').setAttribute('aria-expanded', 'true');
    el.querySelector('audio')?.play();
    // ให้ตัวเล่นทั้งอันอยู่ในจอ (ถ้าแถวอยู่ล่างจอ ตัวเล่นจะโผล่ใต้จอจนไม่เห็น)
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }));
}

// ภาพทั้งวันแบ่งเป็นชั่วโมง (ทั้งวันมีหลายร้อยภาพ ถ้าเรียงยาวต้องเลื่อนนานมาก)
// แต่ละชั่วโมงพับไว้ เห็นภาพตัวอย่างแถวเดียว แตะหัวชั่วโมงเพื่อเปิด/ปิด
// ช่วงที่ SD เสีย แทรกไว้ระหว่างชั่วโมงตามเวลาที่เกิด จะได้รู้ว่าภาพหายไปช่วงไหน
function gapHtml(o, day) {
  return `
      <div class="gap${o.end ? '' : ' now'}">
        <b class="num">${esc(gapRange(o, day))}</b>
        <span>No photos: SD card couldn't be read · ${esc(gapMissed(o))}</span>
      </div>`;
}

function gridHtml(photos, day, outages) {
  const hours = new Map();  // "02" -> [ลำดับภาพ, ...]
  photos.forEach((p, i) => {
    const h = p.time ? p.time.slice(0, 2) : '--';
    if (!hours.has(h)) hours.set(h, []);
    hours.get(h).push(i);
  });
  const PREVIEW = 6;  // ภาพตัวอย่างตอนพับ: เลือกห่างๆ กันให้เห็นทั้งชั่วโมง
  const hourHtml = (h, idx) => {
    const step = Math.max(1, idx.length / PREVIEW);
    const preview = Array.from({ length: Math.min(PREVIEW, idx.length) }, (_, k) => photos[idx[Math.floor(k * step)]]);
    return `
      <div class="hour${openHours.has(h) ? ' open' : ''}" data-h="${esc(h)}">
        <div class="hour-head">
          <button class="hour-toggle" aria-expanded="${openHours.has(h)}">
            <b class="num" title="${h === '--' ? 'No time recorded' : ''}">${h === '--' ? '--:--' : esc(h) + ':00'}</b>
            <span class="num">${idx.length} photos</span>
            <span class="hour-preview">${preview.map(p => `<img src="${esc(p.thumb)}" loading="lazy" alt="">`).join('')}</span>
            <i class="hour-arrow" aria-hidden="true">›</i>
          </button>
          <button class="hour-pick">Select hour</button>
        </div>
        <div class="grid">${idx.map(i => `
          <button class="ph" data-i="${i}">
            <img src="${esc(photos[i].thumb)}" loading="lazy" alt="">
            ${photos[i].time ? `<span class="when-tag">${esc(photos[i].time)}</span>` : ''}
            <span class="check">✓</span>
          </button>`).join('')}
        </div>
      </div>`;
  };
  return `
    <section>
      <h2>Photos <small class="num">${photos.length}</small>
        <button class="pick-toggle" id="pickToggle">Select</button></h2>
      <div class="hours" id="grid">${withGaps([...hours], day, outages, hourHtml)}</div>
    </section>`;
}

// ใส่ช่วงที่เสียไว้หลังชั่วโมงที่มันเริ่ม (เริ่มก่อนวันนี้ = อยู่บนสุด) ที่เหลือต่อท้าย
function withGaps(hours, day, outages, hourHtml) {
  const left = outages.map(o => ({ o, h: o.start.slice(0, 10) < day ? '' : o.start.slice(11, 13) }));
  let html = '';
  for (const [h, idx] of hours) {
    if (h !== '--') while (left.length && left[0].h < h) html += gapHtml(left.shift().o, day);
    html += hourHtml(h, idx);
  }
  return html + left.map(g => gapHtml(g.o, day)).join('');
}

// แตะหัวชั่วโมง = เปิด/ปิดชั่วโมงนั้น
function setupHours(day) {
  if (openDay !== day) { openHours.clear(); openDay = day; }
  app.querySelectorAll('.hour-toggle').forEach(b => b.addEventListener('click', () => {
    const hour = b.closest('.hour');
    const open = hour.classList.toggle('open');
    b.setAttribute('aria-expanded', open);
    open ? openHours.add(hour.dataset.h) : openHours.delete(hour.dataset.h);
  }));
}

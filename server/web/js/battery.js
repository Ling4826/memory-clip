// กราฟแบตในหน้าวัน: ตัวเลขสรุป + เลือกดูได้ 3 แบบ + ชี้ดูค่า + ตาราง
//   Minute = เส้นทุกค่าที่วัด (กรองหนามออก)  Hour = แท่งรายชั่วโมง (วันนี้)  Day = แท่งรายวัน (ทุกวัน)
// ทำไมต้องกรอง: ตอนบอร์ดเปิด Wi-Fi ส่งไฟล์ แรงดันแบตตกแวบหนึ่ง ค่าที่วัดตอนนั้นต่ำกว่าจริง
// กลายเป็นหนามแหลมลงล่าง -> ใช้ค่ากลาง (median) ของ 7 ค่าใกล้กันแทน หนามหายแต่เส้นยังตามแบตจริง

import { esc, getJSON } from './util.js';

const GAP_MIN = 15;  // ไม่มีค่าเกิน 15 นาที = ไม่ได้ใส่กล้อง/ถอดแบต -> เส้นขาดตรงนั้น ไม่ลากต่อ
const VIEWS = [['minute', 'Minute'], ['hour', 'Hour'], ['day', 'Day']];
const H_SMALL = 170, H_LARGE = 220;  // ความสูงกราฟ (จอแคบ / จอกว้าง)
const PAD = { l: 40, r: 12, t: 14, b: 28 };  // เว้นขอบให้ตัวเลขแกน

let view = 'minute';  // จำมุมมองที่เลือกไว้ข้ามวัน

// ใส่กราฟลงใน el (div ว่างใน section "Battery") ไม่มีข้อมูลพอ -> ซ่อนทั้ง section
export async function renderBattery(day, el) {
  let today, all;
  try {
    [today, all] = await Promise.all([
      getJSON('/api/battery?day=' + encodeURIComponent(day)), getJSON('/api/battery?day=all')]);
  } catch { return; }
  const pts = today.points.map(p => ({ ...p, min: minuteOf(p.at) }));
  if (pts.length < 2) { el.closest('section').hidden = true; return; }

  const data = {
    minute: smooth(pts),
    hour: groupBy(pts, p => Math.floor(p.min / 60), h => `${pad2(h)}:00`),
    day: groupBy(all.points, p => p.at.slice(0, 10), d => shortDate(d)),
  };

  el.innerHTML = `
    ${statsHtml(pts)}
    <div class="seg" role="tablist" aria-label="Battery chart view">
      ${VIEWS.map(([v, label]) => `<button role="tab" data-view="${v}">${label}</button>`).join('')}
    </div>
    <div class="bat-plot"><div class="tip" hidden></div></div>
    <details class="bat-table"><summary>Show table</summary><div></div></details>`;

  const plot = el.querySelector('.bat-plot');
  const tabs = [...el.querySelectorAll('.seg button')];
  const draw = () => {
    tabs.forEach(b => b.setAttribute('aria-selected', b.dataset.view === view));
    drawView(plot, view, data[view]);
    el.querySelector('.bat-table div').innerHTML = tableHtml(view, data[view]);
  };
  tabs.forEach(b => b.onclick = () => { view = b.dataset.view; draw(); });
  draw();

  // หมุนจอ/ย่อหน้าต่าง -> วาดใหม่ให้พอดี (ความกว้างไม่เปลี่ยนก็ไม่วาดซ้ำ)
  let lastW = plot.clientWidth;
  new ResizeObserver(() => { if (plot.clientWidth !== lastW) { lastW = plot.clientWidth; draw(); } }).observe(plot);
}

// ---------- เตรียมข้อมูล ----------

const pad2 = n => String(n).padStart(2, '0');
const minuteOf = at => +at.slice(11, 13) * 60 + +at.slice(14, 16);  // "2026-10-20T08:42:11" -> 522
const clock = min => `${pad2(Math.floor(min / 60))}:${pad2(Math.round(min % 60))}`;
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const shortDate = d => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(d + 'T00:00:00'));

// กรองหนาม: แต่ละจุดใช้ค่ากลางของ 7 จุดรอบตัว (ไม่ข้ามช่วงที่ขาดหาย)
function smooth(pts) {
  return pts.map((p, i) => {
    const near = pts.slice(Math.max(0, i - 3), i + 4).filter(q => Math.abs(q.min - p.min) <= GAP_MIN);
    return { min: p.min, percent: median(near.map(q => q.percent)), mv: p.mv };
  });
}

// รวมเป็นกลุ่ม (รายชั่วโมง/รายวัน): ค่ากลาง + ต่ำสุด + สูงสุด ของแต่ละกลุ่ม
function groupBy(pts, keyOf, labelOf) {
  const groups = new Map();
  for (const p of pts) {
    const k = keyOf(p);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p.percent);
  }
  return [...groups].map(([k, v]) => ({ label: labelOf(k), percent: median(v), low: Math.min(...v), high: Math.max(...v), n: v.length }));
}

// ---------- ตัวเลขสรุป ----------

function statsHtml(pts) {
  const s = smooth(pts);
  const first = s[0], last = s[s.length - 1];
  const low = s.reduce((a, b) => (b.percent < a.percent ? b : a));
  // ใช้ไปชั่วโมงละกี่ %: จากต้นวันถึงจุดต่ำสุด (ช่วงที่ใช้แบตอย่างเดียว ยังไม่ได้ชาร์จ)
  const hrs = (low.min - first.min) / 60;
  const rate = hrs >= 0.5 && first.percent > low.percent ? `${((first.percent - low.percent) / hrs).toFixed(1)}%` : '–';
  const tile = (label, value, note = '') =>
    `<div class="stat"><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`;
  return `<div class="stats">
    ${tile('Start', `${first.percent}%`, clock(first.min))}
    ${tile('End', `${last.percent}%`, clock(last.min))}
    ${tile('Lowest', `${low.percent}%`, clock(low.min))}
    ${tile('Used per hour', rate, 'while on battery')}
  </div>`;
}

// ---------- วาด ----------

function drawView(plot, kind, rows) {
  const W = plot.clientWidth;
  if (W < 100) return;
  const H = W < 500 ? H_SMALL : H_LARGE;
  const y = pct => PAD.t + (1 - pct / 100) * (H - PAD.t - PAD.b);
  const grid = [0, 50, 100].map(v =>
    `<line class="g" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/>` +
    `<text x="${PAD.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join('');
  const chart = kind === 'minute' ? lineChart(rows, W, H, y) : barChart(rows, W, H, y);
  const tip = plot.querySelector('.tip');
  tip.hidden = true;  // วาดใหม่ = เส้นชี้หายไปด้วย กล่องบอกค่าต้องหายตาม
  plot.querySelector('svg')?.remove();
  plot.insertAdjacentHTML('afterbegin',
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" tabindex="0" role="img" aria-label="${esc(chart.label)}">
      ${grid}${chart.svg}<line class="cross" y1="${PAD.t}" y2="${H - PAD.b}" visibility="hidden"/></svg>`);
  hover(plot.querySelector('svg'), tip, chart.items);
}

// เส้นรายนาที: แกนนอน = ช่วงที่มีข้อมูลจริง (ปัดเป็นชั่วโมง) ไม่ใช่ 0-24 ตายตัว
function lineChart(rows, W, H, y) {
  const start = Math.floor(rows[0].min / 60) * 60;
  const end = Math.max(start + 60, Math.ceil(rows[rows.length - 1].min / 60) * 60);
  const x = min => PAD.l + ((min - start) / (end - start)) * (W - PAD.l - PAD.r);

  // ขาดเกิน GAP_MIN = ขึ้นเส้นใหม่ (M) แทนการลากต่อ (L)
  const d = rows.map((r, i) => `${i && r.min - rows[i - 1].min <= GAP_MIN ? 'L' : 'M'}${x(r.min).toFixed(1)},${y(r.percent).toFixed(1)}`).join('');
  const last = rows[rows.length - 1];

  // เลขเวลาบนแกน: ห่างกันอย่างน้อย ~70px
  const hours = (end - start) / 60;
  const step = [1, 2, 3, 4, 6, 12].find(s => (W - PAD.l - PAD.r) / (hours / s) >= 70) || 12;
  let ticks = '';
  for (let m = start; m <= end; m += step * 60) {
    const anchor = m === end ? 'end' : m === start ? 'start' : 'middle';  // เลขที่ขอบ ชิดเข้าด้านใน ไม่โดนตัด
    ticks += `<text x="${x(m)}" y="${H - 8}" text-anchor="${anchor}">${clock(m % 1440)}</text>`;
  }

  return {
    label: `Battery from ${clock(rows[0].min)} to ${clock(last.min)}: ${rows[0].percent}% to ${last.percent}%`,
    svg: `${ticks}<path class="l" d="${d}"/>
      <circle class="dot" cx="${x(last.min)}" cy="${y(last.percent)}" r="4"/>
      <text class="end" x="${Math.min(x(last.min) + 8, W - PAD.r)}" y="${y(last.percent) - 8}" text-anchor="${x(last.min) > W - 60 ? 'end' : 'start'}">${last.percent}%</text>`,
    items: rows.map(r => ({ x: x(r.min), title: clock(r.min), value: `${r.percent}%`, note: `${(r.mv / 1000).toFixed(2)} V` })),
  };
}

// แท่งรายชั่วโมง/รายวัน: ความสูง = ค่ากลางของกลุ่ม
function barChart(rows, W, H, y) {
  const band = (W - PAD.l - PAD.r) / rows.length;
  const bw = Math.min(24, band * 0.7);  // แท่งกว้างไม่เกิน 24px ที่เหลือเป็นช่องว่าง
  const every = Math.ceil(rows.length / Math.floor((W - PAD.l - PAD.r) / 44));  // ป้ายแกนไม่ชนกัน
  const base = y(0);
  const bars = rows.map((r, i) => {
    const cx = PAD.l + band * (i + 0.5), top = y(r.percent), h = base - top, rad = Math.min(4, h);
    // ปลายบนมน 4px โคนแท่งเหลี่ยม (ติดเส้นฐาน)
    const path = h <= 0 ? '' : `M${cx - bw / 2},${base}V${top + rad}Q${cx - bw / 2},${top} ${cx - bw / 2 + rad},${top}` +
      `H${cx + bw / 2 - rad}Q${cx + bw / 2},${top} ${cx + bw / 2},${top + rad}V${base}Z`;
    const label = i % every === 0 ? `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(r.label)}</text>` : '';
    return `<path class="bar" data-i="${i}" d="${path}"/>${label}`;
  }).join('');
  return {
    label: `Battery by ${rows.length > 1 ? 'group' : 'period'}: ` + rows.map(r => `${r.label} ${r.percent}%`).join(', '),
    svg: bars,
    items: rows.map((r, i) => ({ x: PAD.l + band * (i + 0.5), title: r.label, value: `${r.percent}%`, note: `low ${r.low}% · high ${r.high}%`, bar: i })),
  };
}

// ชี้/แตะ/กดลูกศร -> เส้นแนวตั้งไปที่จุดใกล้สุด + กล่องบอกค่า
function hover(svg, tip, items) {
  const cross = svg.querySelector('.cross');
  const bars = [...svg.querySelectorAll('.bar')];
  let cur = -1;
  const show = i => {
    cur = Math.max(0, Math.min(items.length - 1, i));
    const it = items[cur];
    cross.setAttribute('x1', it.x); cross.setAttribute('x2', it.x); cross.setAttribute('visibility', 'visible');
    bars.forEach((b, k) => b.classList.toggle('on', k === it.bar));
    tip.replaceChildren();
    const v = document.createElement('b'); v.textContent = it.value;
    const t = document.createElement('span'); t.textContent = it.title;
    const n = document.createElement('small'); n.textContent = it.note;
    tip.append(v, t, n);
    tip.hidden = false;
    // กล่องอยู่ข้างเส้น ไม่ล้นขอบกราฟ
    const left = it.x + 12 + tip.offsetWidth > svg.clientWidth ? it.x - 12 - tip.offsetWidth : it.x + 12;
    tip.style.left = Math.max(0, left) + 'px';
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); bars.forEach(b => b.classList.remove('on')); tip.hidden = true; };
  const nearest = px => items.reduce((best, it, i) => (Math.abs(it.x - px) < Math.abs(items[best].x - px) ? i : best), 0);

  svg.addEventListener('pointermove', e => show(nearest(e.clientX - svg.getBoundingClientRect().left)));
  svg.addEventListener('pointerdown', e => show(nearest(e.clientX - svg.getBoundingClientRect().left)));
  svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      show(cur < 0 ? items.length - 1 : cur + (e.key === 'ArrowRight' ? 1 : -1));
    }
  });
}

// ---------- ตาราง (อ่านค่าได้โดยไม่ต้องชี้กราฟ) ----------

function tableHtml(kind, rows) {
  if (kind === 'minute') {
    // รายนาทีเยอะเกินจะอ่าน -> ทุก 10 นาที
    const seen = new Set();
    rows = rows.filter(r => { const k = Math.floor(r.min / 10); return !seen.has(k) && seen.add(k); })
      .map(r => ({ label: clock(r.min), percent: r.percent, note: `${(r.mv / 1000).toFixed(2)} V` }));
  } else {
    rows = rows.map(r => ({ label: r.label, percent: r.percent, note: `${r.low}–${r.high}%` }));
  }
  const head = kind === 'minute' ? ['Time', 'Battery', 'Voltage'] : [kind === 'hour' ? 'Hour' : 'Day', 'Typical', 'Range'];
  return `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${r.percent}%</td><td>${esc(r.note)}</td></tr>`).join('')}
  </tbody></table>`;
}

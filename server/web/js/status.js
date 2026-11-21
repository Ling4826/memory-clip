// ป้ายมุมขวาบน: แบต + สถานะกล้อง (อัปเดตทุกนาที) กดป้ายสถานะ = ดูรายละเอียด
// (กราฟแบตในหน้าวันอยู่ใน battery.js)

import { esc, formatDate, getJSON } from './util.js';

const batPill = document.getElementById('batPill');
const devPill = document.getElementById('devPill');
const devPanel = document.getElementById('devPanel');

export function startStatusPills() {
  showBatteryPill();
  showStatusPill();
  setInterval(showBatteryPill, 60000);
  setInterval(showStatusPill, 60000);
  devPill.onclick = () => { devPanel.hidden = !devPanel.hidden; };
  // แตะที่อื่นนอกแผง = ปิดแผง (บนมือถือไม่ต้องเลื่อนกลับขึ้นไปกดป้ายอีกที)
  document.addEventListener('click', e => {
    if (!devPanel.hidden && !devPanel.contains(e.target) && !devPill.contains(e.target)) devPanel.hidden = true;
  });
}

// ---------- ป้ายแบต ----------
// บอร์ดจดแรงดันแบตลง log ทุกครั้งที่ถ่ายภาพ server อ่าน log แล้วแปลงเป็น %
async function showBatteryPill() {
  let b;
  try { b = await getJSON('/api/battery'); } catch { return; }
  if (!b.sensor_ok) {
    batPill.textContent = 'Battery: no reading';
    batPill.title = 'Battery sensor wire is loose or the battery is unplugged. The camera still works.';
    batPill.className = 'bat-pill low';
    batPill.hidden = false;
    return;
  }
  if (!b.latest) return;
  const t = new Date(b.latest.at);
  // เวลาอยู่ใน span.opt ให้มือถือซ่อนได้ (แถบบนจะได้อยู่แถวเดียว)
  batPill.innerHTML = `Battery ${b.latest.percent}%<span class="opt"> at ${t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>`;
  batPill.title = `${(b.latest.mv / 1000).toFixed(2)} V (latest reading from the camera)`;
  batPill.className = 'bat-pill ' + (b.latest.percent <= 15 ? 'low' : 'ok');
  batPill.hidden = false;
}

// ---------- ป้ายสถานะกล้อง + รายละเอียดตอนกด ----------
// เฟิร์มแวร์ขั้น 10 ส่งสถานะทุกรอบที่ต่อคอม (SD, กล้อง, ไฟล์ค้าง, สัญญาณ) server สรุปเป็นรายการปัญหาให้
// กดป้ายแล้วเห็น: ประโยคสรุปตัวใหญ่ -> รายการเช็กทีละอย่าง (ประโยคธรรมดา) -> ที่เคยผิดปกติ -> ค่าดิบ (ซ่อนไว้)
function ago(min) {
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ${min % 60} min ago`;
}

// รอบส่งไฟล์ของบอร์ด (ต้องตรงกับ firmware config.h): ส่งหมด -> อีก 30 นาที, ส่งไม่หมด (cut) -> พัก 5 นาทีแล้วส่งต่อ
const UPLOAD_EVERY_MIN = 30;
const RESUME_MIN = 5;
const hhmm = d => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

let lastStatus = null;  // สถานะล่าสุดจาก server (หน้าแรกใช้เขียนบรรทัดเวลาส่งไฟล์)

// บรรทัดบนหน้าแรก: ส่งล่าสุดเมื่อไหร่ + รอบหน้าอีกกี่นาที / เลยมากี่นาทีแล้ว
// เรียกตอนวาดหน้าแรกเสร็จ และทุกครั้งที่สถานะอัปเดต (ทุกนาที) ถ้าไม่ได้อยู่หน้าแรกก็ไม่ทำอะไร
export function showUploadLine() {
  const el = document.getElementById('uploadLine');
  const st = lastStatus?.status;
  if (!el || !st?.at) return;
  const last = new Date(st.at);
  const next = new Date(last.getTime() + (st.cut ? RESUME_MIN : UPLOAD_EVERY_MIN) * 60000);
  const min = Math.round((next - Date.now()) / 60000);
  const lastText = `Last upload ${hhmm(last)} (${ago(lastStatus.minutes)})`;
  let nextText, cls = '';
  if (min > 0) nextText = `next around <b>${hhmm(next)}</b>, in ${min} min`;
  else if (min > -5) nextText = `next due now (${hhmm(next)})`;
  else {
    nextText = `next was due ${hhmm(next)}, <b>${ago(-min)}</b>`;
    cls = 'late';
  }
  el.innerHTML = `${esc(lastText)} · ${nextText}`;
  el.className = 'upload-line ' + cls;
  el.hidden = false;
}

// คาดว่าบอร์ดจะส่งรอบหน้าเมื่อไหร่ (นับจากเวลาที่ส่งสถานะครั้งล่าสุด) -> ประโยคบอกเวลา
function nextUpload(st) {
  if (!st || !st.at) return null;
  const next = new Date(new Date(st.at).getTime() + (st.cut ? RESUME_MIN : UPLOAD_EVERY_MIN) * 60000);
  const min = Math.round((next - Date.now()) / 60000);
  // บอร์ดตื่นมาถ่ายภาพทุกนาที ส่งช้ากว่ากำหนดได้นิดหน่อย -> ช้าไม่เกิน 5 นาทียังถือว่ากำลังจะมา
  if (min > 0) return `Next upload around ${hhmm(next)} (in ${min} min).`;
  if (min > -5) return `Next upload should arrive any moment (due ${hhmm(next)}).`;
  return `Next upload was due at ${hhmm(next)} but has not arrived. Normal if the camera is away from the computer.`;
}

// สถานะของแต่ละข้อ: ok = ปกติ, warn = ควรรู้แต่ยังใช้ได้, bad = ต้องแก้, unknown = ยังไม่มีข้อมูล
// ---------- ช่วงที่ SD เสีย (= ไม่มีภาพช่วงนั้น) ใช้ทั้งในแผงนี้และในหน้าวัน ----------
// "17:28 – 20:45" ถ้าเวลาไม่ใช่วัน day ใส่วันที่นำหน้า, end = null แปลว่ายังเสียอยู่
export function gapRange(o, day = o.start.slice(0, 10)) {
  const t = s => (s.slice(0, 10) === day ? '' : formatDate(s.slice(0, 10), { day: 'numeric', month: 'short' }) + ' ') + s.slice(11, 16);
  if (o.end === o.start) return t(o.start);  // เสียแค่นาทีเดียว
  return `${t(o.start)} – ${o.end ? t(o.end) : 'now'}`;
}
export const gapMissed = o => o.end ? `about ${o.missed} photo${o.missed === 1 ? '' : 's'} missing` : 'still failing, no photos are being taken';

// แผงโชว์แค่ช่วงที่เสียใน 24 ชม. ล่าสุด (สูงสุด 3) ไม่ให้แผงยาวจนแตะข้างนอกเพื่อปิดไม่ได้ ที่เก่ากว่าดูได้ในหน้าวัน
const GAPS_SHOWN = 3;
const recentGaps = list => list.filter(o => !o.end || new Date(o.end) > Date.now() - 864e5).slice(-GAPS_SHOWN);

function dayLabel(d) {
  const ymd = x => x.toLocaleDateString('sv');  // YYYY-MM-DD ตามเวลาเครื่อง
  const now = new Date(), yest = new Date(now - 864e5);
  return d === ymd(now) ? 'Today' : d === ymd(yest) ? 'Yesterday' : formatDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
}

const MARK = { ok: 'OK', warn: '!', bad: '✕', unknown: '?' };

function checks(s, bat) {
  const st = s.status;
  const out = [];
  const add = (level, name, text) => out.push({ level, name, text });

  // 1. ติดต่อคอมล่าสุดเมื่อไหร่ (บอร์ดส่งทุก 30 นาที ถ้าออกนอกบ้านจะเงียบเป็นปกติ)
  if (s.minutes == null) add('unknown', 'Connection', 'The camera has never sent anything yet.');
  else if (s.minutes <= s.offline_min) add('ok', 'Connection', `Last sent files ${ago(s.minutes)}.`);
  else add('warn', 'Connection', `Not heard from in ${ago(s.minutes).replace(' ago', '')}. Normal if you are out; it sends everything when it is back near the computer.`);
  if (!st) return out;

  // 2. กล้องถ่ายภาพได้ไหม (ตัวนับ = ครั้งที่พังตั้งแต่รายงานครั้งก่อน)
  if (st.cam_fail) add('bad', 'Camera', `Failed to start ${st.cam_fail} time(s). Unplug the battery for a few seconds and plug it back in.`);
  else if (st.photo_fail) add('bad', 'Camera', `${st.photo_fail} photo(s) failed. Check the camera ribbon cable.`);
  else add('ok', 'Camera', 'Taking photos normally.');

  // 3. SD card
  const freeMb = st.sd_total_mb > 0 && st.sd_used_mb >= 0 ? st.sd_total_mb - st.sd_used_mb : null;
  if (!st.sd_ok) add('bad', 'SD card', "Can't be read, so no photos are saved. Push the card in and press R on the board.");
  else if (freeMb != null && freeMb / st.sd_total_mb < 0.1) add('warn', 'SD card', `Almost full, ${freeMb} MB left.`);
  else add('ok', 'SD card', st.sd_total_mb > 0 ? `Working (${(st.sd_total_mb / 1024).toFixed(1)} GB card).` : 'Working.');

  // 4. แบต
  // ใช้ค่าเดียวกับป้ายแบตมุมขวาบน (ค่าล่าสุดจาก log ภาพ) ถ้ามี ไม่งั้นใช้ค่าตอนส่งสถานะ
  const pct = bat?.sensor_ok && bat.latest ? bat.latest.percent : s.battery_percent;
  const mv = bat?.sensor_ok && bat.latest ? bat.latest.mv : st.bat_mv;
  if (pct == null) add('warn', 'Battery', "Can't measure it (resistor wire on BAT+ loose?). The camera still works.");
  else if (pct <= 15) add('bad', 'Battery', `${pct}%, charge it soon.`);
  else add('ok', 'Battery', `${pct}% (${(mv / 1000).toFixed(2)} V).`);

  // 5. ส่งไฟล์ (cut = ส่งไม่หมดในรอบนี้ เหลือไว้รอบหน้า)
  // (เวลาส่งรอบหน้าอยู่ใต้ประโยคสรุปด้านบนแผง)
  if (st.failed) add('warn', 'Upload', `${st.failed} file(s) failed to send last time. They will be retried.`);
  else if (st.pending > 0) add('ok', 'Upload', `Sent ${st.sent} file(s), ${st.pending} still waiting for next time.`);
  else add('ok', 'Upload', `All files sent (${st.sent} last time).`);

  // 6. สัญญาณ Wi-Fi (dBm ยิ่งใกล้ 0 ยิ่งแรง)
  if (st.rssi >= -67) add('ok', 'Wi-Fi', 'Strong signal.');
  else if (st.rssi >= -80) add('warn', 'Wi-Fi', 'Weak signal. Uploads may be slow; bring it closer to the computer.');
  else add('bad', 'Wi-Fi', 'Very weak signal. Bring it closer to the computer.');
  return out;
}

async function showStatusPill() {
  let s, bat = null;
  try { s = await getJSON('/api/status'); } catch { return; }
  lastStatus = s;
  showUploadLine();
  try { bat = await getJSON('/api/battery'); } catch { /* ไม่มีค่าแบตก็ยังแสดงส่วนอื่นได้ */ }
  const list = checks(s, bat);
  // ประโยคสรุป: มีข้อ bad = ต้องแก้, ขาดการติดต่อ = ไม่รู้, ที่เหลือ = ใช้ได้
  const bad = list.some(c => c.level === 'bad') || s.problems.some(p => p.level === 'bad' && !/^No contact|^No data/.test(p.text));
  const away = s.minutes == null || s.minutes > s.offline_min;
  const [cls, title, sub] =
    bad ? ['bad', 'Camera needs attention', 'Something below is marked ✕.']
    : away ? ['away', s.minutes == null ? 'No data yet' : 'Camera is away',
      s.minutes == null ? 'Connect the camera to the hotspot once.' : 'It was fine last time it reported.']
    : ['ok', 'Camera is working', 'Everything looked fine last time it reported.'];

  // คำว่า "· x min ago" อยู่ใน span.opt ให้มือถือซ่อนได้ (แถบบนจะได้อยู่แถวเดียว)
  const short = bad ? 'Camera problem' : away ? (s.minutes == null ? 'No data yet' : 'Camera away') : 'Camera OK';
  devPill.innerHTML = esc(short) + (s.minutes == null ? '' : `<span class="opt"> · ${esc(ago(s.minutes))}</span>`);
  devPill.className = 'dev-pill ' + (bad ? 'bad' : away ? '' : 'ok');
  devPill.hidden = false;

  const st = s.status;
  // "SD card failed N times" ซ้ำกับรายการช่วงเวลาข้างล่าง (ซึ่งบอกละเอียดกว่า) -> ไม่ต้องขึ้นซ้ำ
  const gaps = recentGaps(s.sd_outages || []);
  const past = s.problems.filter(p => p.level === 'past' && !(gaps.length && /^SD card failed/.test(p.text)));
  const rows = st ? [
    ['Firmware', st.fw],
    ['SD used', st.sd_used_mb >= 0 ? `${st.sd_used_mb} / ${st.sd_total_mb} MB` : `- / ${st.sd_total_mb} MB`],
    ['Files waiting', st.pending >= 0 ? `${st.pending}` : '-'],
    ['Last upload', `${st.sent} sent, ${st.failed} failed${st.cut ? ' (more left)' : ''}`],
    ['Wi-Fi signal', `${st.rssi} dBm`],
    ['Battery', st.bat_mv < 2500 ? 'no reading' : `${st.bat_mv} mV`],
    ['Last restart', st.reset],
    ['Last contact', s.last_seen ? new Date(s.last_seen).toLocaleString('en-GB') : '-'],
  ] : [];
  devPanel.innerHTML = `
    <div class="dev-head ${cls}"><b>${esc(title)}</b><span>${esc(sub)}</span>
      ${nextUpload(st) ? `<span class="dev-next">${esc(nextUpload(st))}</span>` : ''}</div>
    <ul class="dev-checks">${list.map(c => `
      <li class="${c.level}"><i>${MARK[c.level]}</i><b>${esc(c.name)}</b><span>${esc(c.text)}</span></li>`).join('')}
    </ul>
    ${gaps.length ? `<div class="dev-gaps"><b>No photos in these times</b> <span>(SD card couldn't be read)</span>
      <ul>${gaps.slice().reverse().map(o => `
        <li class="${o.end ? '' : 'now'}"><span>${esc(dayLabel(o.start.slice(0, 10)))}</span><b class="num">${esc(gapRange(o))}</b><span>${esc(o.end ? `${o.missed} missed` : 'still failing')}</span></li>`).join('')}
      </ul>${s.sd_outages.length > gaps.length ? `<p class="dev-note">${s.sd_outages.length - gaps.length} earlier gap(s) are shown in each day's photos.</p>` : ''}</div>` : ''}
    ${!st ? '<p class="dev-note">Detailed checks need firmware step 10 or later.</p>' : ''}
    ${past.length ? `<p class="dev-note">Earlier today: ${past.map(p => esc(p.text)).join('; ')}.</p>` : ''}
    ${rows.length ? `<details class="dev-raw"><summary>Raw values</summary>
      <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details>` : ''}`;
}

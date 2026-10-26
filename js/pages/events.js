import { $, esc, iso, parse, addDays, fmtDate, fmtShort, fmtTime, fmtChip, LONG } from '../utils.js';
import { store, officeHoursOn } from '../data.js';

const MAX_LINES = 3;   // lines shown per day before "… N more"
const now = new Date();
export const cal = { y: now.getFullYear(), m: now.getMonth() };
export const setMonth = (y, m) => { cal.y = y; cal.m = m; };

/** Decide which row ("slot") each all-day item occupies so multi-day bars line up across days. */
function layoutDays(gridStart, gridEnd) {
  const cmp = (a, b) => a.start.localeCompare(b.start)
    || (parse(b.end) - parse(b.start)) - (parse(a.end) - parse(a.start))
    || (a.type === 'key' ? -1 : 1) - (b.type === 'key' ? -1 : 1)
    || a.title.localeCompare(b.title);
  const occupied = {}, placed = [];
  store.items.filter(i => i.allDay).sort(cmp).forEach(it => {
    const days = [];
    for (let d = new Date(Math.max(parse(it.start), gridStart)); d <= Math.min(parse(it.end), gridEnd); d = addDays(d, 1)) days.push(iso(d));
    if (!days.length) return;
    let slot = 0;
    while (days.some(k => occupied[k]?.has(slot))) slot++;
    days.forEach(k => (occupied[k] ??= new Set()).add(slot));
    placed.push({ it, slot, days });
  });
  const rows = {};
  placed.forEach(({ it, slot, days }) => days.forEach(k => { (rows[k] ??= [])[slot] = it; }));
  Object.keys(rows).forEach(k => { rows[k] = Array.from(rows[k], x => x || null); });
  // timed events go after the all-day rows, ordered by start time
  store.items.filter(i => !i.allDay).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')).forEach(it => {
    if (it.start >= iso(gridStart) && it.start <= iso(gridEnd)) (rows[it.start] ??= []).push(it);
  });
  return rows;
}

function chipHTML(it, k, dow) {
  if (!it) return '<div class="chip spacer">.</div>';
  const multi = it.end !== it.start;
  const isStart = k === it.start, isEnd = k === it.end;
  const showTitle = isStart || dow === 0;   // repeat the title at the start of each week row
  const cls = ['chip', it.type, multi && !isStart ? 'contl' : '', multi && !isEnd ? 'contr' : ''].join(' ');
  const time = !it.allDay && it.startTime ? `<span class="t">${fmtChip(it.startTime)}</span>` : '';
  return `<div class="${cls}" title="${esc(it.title)}">${showTitle ? time + esc(it.title) : '&nbsp;'}</div>`;
}

export function render() {
  const first = new Date(cal.y, cal.m, 1);
  const gridStart = addDays(first, -first.getDay());
  const lastDay = new Date(cal.y, cal.m + 1, 0);
  const weeks = Math.ceil((first.getDay() + lastDay.getDate()) / 7);
  const gridEnd = addDays(gridStart, weeks * 7 - 1);
  const rows = layoutDays(gridStart, gridEnd);
  const todayK = iso(new Date());
  let cells = '', agenda = '';

  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(gridStart, i), k = iso(d), dow = d.getDay();
    const r = rows[k] || [];
    const hidden = r.slice(MAX_LINES).filter(Boolean).length;
    const oh = officeHoursOn(d);
    const count = r.filter(Boolean).length;
    cells += `<div class="day ${d.getMonth() !== cal.m ? 'out' : ''} ${k === todayK ? 'today' : ''}" role="button" tabindex="0" data-open="${k}"
        aria-label="${fmtDate(d, LONG)}, ${count} item${count === 1 ? '' : 's'}${oh.length ? ', office hours' : ''}">
      <span class="num">${d.getDate() === 1 ? fmtDate(d, { month: 'short', day: 'numeric' }) : d.getDate()}</span>
      ${r.slice(0, MAX_LINES).map(it => chipHTML(it, k, dow)).join('')}
      ${hidden ? `<div class="more">…<span class="txt"> ${hidden} more</span></div>` : ''}
      ${oh.length ? `<div class="dots">${oh.map(({ p, s }) => `<i style="background:${esc(p.color)}" title="${esc(p.name)}, ${fmtTime(s.start)}"></i>`).join('')}</div>` : ''}
    </div>`;

    // mobile agenda: multi-day items appear once, on their first day
    const ag = r.filter(it => it && (it.end === it.start || k === it.start));
    if (d.getMonth() === cal.m && ag.length) {
      const range = it => it.end !== it.start
        ? ` <small class="empty">${fmtDate(parse(it.start), { month: 'short', day: 'numeric' })} to ${fmtDate(parse(it.end), { month: 'short', day: 'numeric' })}</small>` : '';
      agenda += `<li data-open="${k}" tabindex="0" role="button"><div class="d">${d.getDate()}<small>${fmtDate(d, { weekday: 'short' })}</small></div><div>${
        ag.map(it => `<div><i class="sw" style="background:var(--${it.type});height:8px;width:14px"></i> ${esc(it.title)}${range(it)}${it.allDay ? '' : ` <small class="empty">${fmtTime(it.startTime)}</small>`}</div>`).join('')}</div></li>`;
    }
  }

  return `
  <h2 class="page-h" style="margin-bottom:12px">Events calendar</h2>
  <div class="cal-bar">
    <button class="btn sm" id="prevM" aria-label="Previous month">‹</button>
    <button class="btn sm" id="nextM" aria-label="Next month">›</button>
    <button class="btn sm" id="todayM">Today</button>
    <h2 aria-live="polite">${fmtDate(first, { month: 'long', year: 'numeric' })}</h2>
  </div>
  <div class="legend">
    <span><i class="sw" style="background:var(--event)"></i>Event</span>
    <span><i class="sw" style="background:var(--key)"></i>Key date</span>
    <span><b>Office hours:</b></span>
    ${store.ohPeople.map(p => `<span><i class="dot" style="background:${esc(p.color)}"></i>${esc(p.name.split(' ')[0])}</span>`).join('')}
  </div>
  <div class="cal">
    <div class="cal-head">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div>${d}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
  </div>
  <p class="note" style="font-size:.88rem;color:var(--muted)">Select a day to see key dates, office hours and full event details.</p>
  <section class="agenda card" aria-label="This month's agenda"><h3>This month</h3>${agenda ? `<ul>${agenda}</ul>` : '<p class="empty">Nothing scheduled this month.</p>'}</section>`;
}

/** Wire up month navigation. `redraw` re-renders the page. */
export function mount(redraw) {
  const go = n => {
    cal.m += n;
    if (cal.m < 0) { cal.m = 11; cal.y--; }
    if (cal.m > 11) { cal.m = 0; cal.y++; }
    redraw();
  };
  $('#prevM').onclick = () => go(-1);
  $('#nextM').onclick = () => go(1);
  $('#todayM').onclick = () => { const t = new Date(); setMonth(t.getFullYear(), t.getMonth()); redraw(); };
}

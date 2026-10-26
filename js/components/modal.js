// Day pop-up on the Events page: key info, office hours, and event cards.
import { $, esc, pic, parse, fmtDate, fmtTime, LONG } from '../utils.js';
import { store, itemsOn, officeHoursOn } from '../data.js';

let lastFocus = null;

export function whenText(e) {
  const s = parse(e.start), en = parse(e.end || e.start);
  const short = { weekday: 'short', month: 'short', day: 'numeric' };
  return e.end && e.end !== e.start ? `${fmtDate(s, short)} to ${fmtDate(en, short)}` : fmtDate(s, LONG);
}
export const timeText = e => e.allDay ? 'All day' : `${fmtTime(e.startTime)} to ${fmtTime(e.endTime)}`;

function eventCard(e) {
  const rows = [['Date', whenText(e)], ['Time', timeText(e)], ['Location', e.location || 'To be announced']];
  return `<article class="sub ev">
    <h4>${esc(e.title)}</h4>
    <dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
    <p>${esc(e.description)}</p>
    ${e.photos?.length ? `<div class="photos">${e.photos.map((p, i) => pic(p, `Promo photo ${i + 1}`, `${e.title} promotional photo ${i + 1}`)).join('')}</div>` : ''}
    ${e.registerUrl ? `<a class="btn primary sm" href="${esc(e.registerUrl)}">Register</a>` : '<span class="empty">No registration needed.</span>'}
    ${e.sponsors?.length ? `<div class="sponsors"><small>Sponsors</small>${e.sponsors.map(s =>
      s.logo ? `<img src="${esc(s.logo)}" alt="${esc(s.name)}">` : `<span>${esc(s.name)}</span>`).join('')}</div>` : ''}
  </article>`;
}

export function openDay(k) {
  const d = parse(k);
  const its = itemsOn(k);
  const keys = its.filter(i => i.type === 'key');
  const evs = its.filter(i => i.type === 'event').map(i => i.ref)
    .sort((a, b) => (a.allDay ? '' : a.startTime || '').localeCompare(b.allDay ? '' : b.startTime || ''));
  const oh = officeHoursOn(d);
  const rangeLabel = i => i.end !== i.start
    ? ` (${fmtDate(parse(i.start), { month: 'short', day: 'numeric' })} to ${fmtDate(parse(i.end), { month: 'short', day: 'numeric' })})` : '';

  const keyInfo = keys.length || oh.length ? `
    <section class="sub" aria-labelledby="keyH"><h3 id="keyH">Key info</h3>
      ${keys.map(i => `<span class="tag key">${esc(i.title)}${rangeLabel(i)}</span>`).join('')}
      ${oh.length ? `<h4 style="margin:.8em 0 .3em">Office hours</h4>${oh.map(({ p, s }) => `
        <div class="oh-row"><i class="dot" style="background:${esc(p.color)}"></i>
          <div><b>${esc(p.name)}</b><small>${esc(p.role)}</small></div>
          <div class="when">${fmtTime(s.start)} to ${fmtTime(s.end)}</div></div>`).join('')}` : ''}
    </section>` : '';

  lastFocus = document.activeElement;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="scrim" id="scrim"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">
      <div class="modal-head"><h2 id="mTitle">${fmtDate(d, LONG)}</h2><button class="x" aria-label="Close" id="mClose">×</button></div>
      <div class="modal-body">
        ${keyInfo}${evs.map(eventCard).join('')}
        ${!keyInfo && !evs.length ? '<p class="empty">Nothing scheduled for this day.</p>' : ''}
      </div></div></div>`);
  document.body.style.overflow = 'hidden';
  $('#mClose').focus();
  $('#mClose').onclick = closeModal;
  $('#scrim').addEventListener('click', e => { if (e.target.id === 'scrim') closeModal(); });
}

export function closeModal() {
  if (!$('#scrim')) return;
  $('#scrim').remove();
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}
export const isModalOpen = () => !!$('#scrim');

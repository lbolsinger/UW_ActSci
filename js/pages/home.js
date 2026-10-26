import { esc, pic, parse, fmtDate, fmtShort, DAYS } from '../utils.js';
import { store, nextEvent } from '../data.js';
import { whenText, timeText } from '../components/modal.js';

const ICON = {
  discord: '<svg viewBox="0 0 24 24"><path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><circle cx="9" cy="11.5" r="1"/><circle cx="15" cy="11.5" r="1"/></svg>',
  instagram: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".6"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 4l2.4 5 5.6.7-4.1 3.8 1.1 5.5L12 16.3 7 19l1.1-5.5L4 9.7 9.6 9z"/></svg>'
};

/** Office-hours photo, or a schedule generated from office-hours.json if no photo is set. */
function scheduleHTML() {
  const { site, ohPeople } = store;
  if (site.officeHoursImage) return pic(site.officeHoursImage, 'Office hours schedule', 'Office hours schedule', 'office-img');
  const byDay = {};
  ohPeople.forEach(p => p.officeHours.forEach(s => (byDay[s.day] ??= []).push({ p, s })));
  const items = [1, 2, 3, 4, 5, 6, 0].filter(d => byDay[d]).map(d =>
    `<li><b>${DAYS[d]}</b>${byDay[d].sort((a, b) => a.s.start.localeCompare(b.s.start)).map(({ p, s }) =>
      `<span><i class="dot" style="background:${esc(p.color)}"></i>${fmtShort(s.start)}–${fmtShort(s.end)} ${esc(p.name.split(' ')[0])}</span>`).join('')}</li>`).join('');
  return `<ul class="sched">${items}</ul>`;
}

function nextEventCard() {
  const ne = nextEvent();
  if (!ne) return `<section class="card"><h2>Next event</h2><p class="empty">No upcoming events are scheduled yet. Check the calendar soon.</p></section>`;
  const nd = parse(ne.start);
  return `
    <section class="card" aria-labelledby="nextH">
      <h2 id="nextH">Next event</h2>
      <div class="next">
        <div class="datetile"><span>${fmtDate(nd, { month: 'short' })}</span><b>${nd.getDate()}</b></div>
        <div>
          <h3>${esc(ne.title)}</h3>
          <ul class="meta"><li>${whenText(ne)}, ${timeText(ne)}</li><li>${esc(ne.location)}</li></ul>
          <p>${esc(ne.description)}</p>
          <div class="btnrow">
            ${ne.registerUrl ? `<a class="btn primary" href="${esc(ne.registerUrl)}">Register for this event</a>` : ''}
            <button class="btn" data-open="${ne.start}">See details</button>
          </div>
        </div>
      </div>
    </section>`;
}

export function render() {
  const { site } = store;
  return `
  <div class="home">
    <div class="stack">
      <section class="card" aria-labelledby="aboutH">
        <h2 id="aboutH">What we do</h2>
        <p class="lead">${esc(site.about[0])}</p>
        ${site.about.slice(1).map(p => `<p>${esc(p)}</p>`).join('')}
      </section>
      <figure class="card figure" style="margin:0">
        ${pic(site.execGroupPhoto, 'Exec team group photo', 'The club executive team')}
        <figcaption>This year's executive team. <a href="#execs">Meet everyone</a></figcaption>
      </figure>
      <section class="cta">
        <div><h2>Join the club</h2><p>Membership is free for students and gives you access to every event and program.</p></div>
        <a class="btn primary" href="${esc(site.registerUrl)}">Register now</a>
      </section>
      ${nextEventCard()}
    </div>
    <aside class="stack side" aria-label="Quick resources">
      <section class="card"><h3>Office hours</h3>${scheduleHTML()}
        <p style="margin:.8em 0 0;font-size:.85rem"><a href="#events">See them on the calendar</a></p></section>
      <section class="card"><h3>Find us</h3>
        <ul class="linklist">
          <li><a href="${esc(site.discord)}">${ICON.discord}Discord</a></li>
          <li><a href="${esc(site.instagram)}">${ICON.instagram}Instagram</a></li>
          <li><a href="mailto:${esc(site.email)}">${ICON.mail}Email us</a></li>
        </ul></section>
      <section class="card"><h3>Key programs</h3>
        <ul class="linklist">
          <li><a href="#programs/mentorship">${ICON.star}Mentorship</a></li>
          <li><a href="#programs/resume">${ICON.star}Resume critique</a></li>
          <li><a href="#programs/opg">${ICON.star}Open Pricing Game</a></li>
        </ul></section>
    </aside>
  </div>`;
}

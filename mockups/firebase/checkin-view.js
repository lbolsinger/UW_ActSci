// The page the door QR code opens: signs the member in to the event.
import { session } from '../session.js';
import { read } from '../db.js';
import { esc, toDate, fmtTime, fmtLong } from '../ui.js';
import { termId, termLabel } from '../terms.js';
import { isOpen, selfCheckIn, eventWindow } from '../checkin-core.js';
import { parse } from '../../utils.js';

const card = (title, body, extra = '') => `<div class="portal-narrow"><div class="card ${extra}">${`<h2>${title}</h2>`}${body}<div class="btnrow" style="margin-top:14px"><a class="btn" href="#account">Go to my account</a></div></div></div>`;

export async function render(box, eventId, ctx) {
  const ev = ctx.data.events.find(e => e.id === eventId);
  if (!ev) { box.innerHTML = card('We couldn\'t find that event', '<p>The code may be out of date. Ask an exec to sign you in.</p>'); return; }
  if (!session.isMember) { box.innerHTML = card('Use your Waterloo email', `<p>You're signed in as <b>${esc(session.email)}</b>. Check-in is for @uwaterloo.ca members.</p>`); return; }
  if (!session.profile) { box.innerHTML = card('Register first', `<p>You need a membership before you can check in. <a href="#account">Register here</a>, then scan the code again.</p>`); return; }

  const uid = session.user.uid, tid = termId(ctx.term);
  const m = await read('memberships', `${uid}_${tid}`);
  const existing = await read('attendance', `${ev.id}_${uid}`);
  const when = `${fmtLong(parse(ev.start))}${ev.allDay ? '' : ' · ' + ev.startTime + '–' + ev.endTime}`;

  const success = (at, how) => {
    box.innerHTML = `<div class="portal-narrow"><div class="card okcard"><div class="tick">✓</div><div class="big">You're signed in</div>
      <p style="margin:8px auto 4px"><b>${esc(ev.title)}</b><br>${esc(when)}${at ? ' · signed in at ' + esc(fmtTime(at)) : ''}</p>
      <p style="margin:0 auto 12px"><b>${esc(session.displayName)}</b><br><span class="pl">${esc(termLabel(ctx.term))} · Paid</span></p>
      <p class="hint" style="margin:0 auto">Show this screen to an exec if they ask.${how ? ' ' + esc(how) : ''}</p></div></div>`;
  };

  if (existing) return success(toDate(existing.at), 'You were already checked in.');
  if (!m) { box.innerHTML = card(`Renew for ${esc(termLabel(ctx.term))}`, `<p>Your membership isn't registered for this term yet. <a href="#account">Renew here</a>, or see an exec at the door.</p>`); return; }
  if (!m.paid) { box.innerHTML = card('See an exec to pay', `<p>You're registered, but your club fee hasn't been confirmed yet. An exec can take your payment and sign you in at the door.</p>`); return; }
  if (!isOpen(ev, ctx.portal.checkInOpensMinutesBefore)) {
    const w = eventWindow(ev, ctx.portal.checkInOpensMinutesBefore);
    box.innerHTML = card('Check-in isn\'t open', `<p><b>${esc(ev.title)}</b> check-in opens at ${esc(fmtTime(w.opens))} and closes when the event ends at ${esc(fmtTime(w.end))}.</p>`); return;
  }
  await selfCheckIn(ev, ctx.term, 'qr');
  success(new Date());
}

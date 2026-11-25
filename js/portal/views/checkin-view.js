// The page the door QR code opens: signs the member in to the event.
import { session } from '../session.js';
import { read } from '../db.js';
import { esc, toDate, fmtTime, fmtLong } from '../ui.js';
import { termId, termLabel } from '../terms.js';
import { isOpen, selfCheckIn, eventWindow } from '../checkin-core.js';
import { parse } from '../../utils.js';
import { canSignIn, payState } from '../payments.js';

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
      <p style="margin:0 auto 12px"><b>${esc(session.displayName)}</b><br><span class="pl">${esc(termLabel(ctx.term))} · ${m?.paid ? 'Paid' : 'Trial period'}</span></p>
      <p class="hint" style="margin:0 auto">Show this screen to an exec if they ask.${how ? ' ' + esc(how) : ''}</p></div></div>`;
  };

  if (existing) return success(toDate(existing.at), 'You were already checked in.');
  if (!m) { box.innerHTML = card(`Renew for ${esc(termLabel(ctx.term))}`, `<p>Your membership isn't registered for this term yet. <a href="#account">Renew here</a>, or see an exec at the door.</p>`); return; }
  if (!canSignIn(m)) {
    const office = ctx.data.site.office ? ` at the club office (${esc(ctx.data.site.office)})` : '';
    const body = payState(m) === 'flagged'
      ? `<p><b>Event sign-in is paused while an exec reviews your payment.</b></p><p>See an exec at the door, or email the club a screenshot or receipt of your payment.</p>`
      : m.payStatus === 'confirming'
        ? `<p><b>Your trial period has ended and your WUSA payment hasn't been confirmed yet.</b></p><p>Show an exec your WUSA receipt at the door, or email it to the club, and they'll confirm it.</p>`
        : `<p><b>You need to pay the club fee before you can sign in to events.</b> You're registered, but your payment hasn't been confirmed yet.</p><p>Pay in cash${office}, or through WUSA and enter your 6-digit confirmation number under <a href="#account/membership">My membership</a> to start a trial period. You can also see an exec at the door.</p>`;
    box.innerHTML = card(payState(m) === 'flagged' ? 'Payment under review' : 'Payment required', body, 'alert'); return;
  }
  if (!isOpen(ev, ctx.portal.checkInOpensMinutesBefore)) {
    const w = eventWindow(ev, ctx.portal.checkInOpensMinutesBefore);
    box.innerHTML = card('Check-in isn\'t open', `<p><b>${esc(ev.title)}</b> check-in opens at ${esc(fmtTime(w.opens))} and closes when the event ends at ${esc(fmtTime(w.end))}.</p>`); return;
  }
  await selfCheckIn(ev, ctx.term, 'qr');
  success(new Date());
}

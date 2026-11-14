// Event sign-up, member side: talks to the database. The rules themselves are in eventreg-core.js.
import { supabase } from './supabase.js';
import { ref, read, list, col, where, batch, F, stamp } from './db.js';
import { session } from './session.js';
import { termId } from './terms.js';
import { eventKey } from './eventreg-core.js';
import { esc } from './ui.js';

export * from './eventreg-core.js';

export const regDocId = (ev, uid = session.user.uid) => `${eventKey(ev)}_${uid}`;

/** Everything I've signed up for, keyed by event id. */
export async function myRegistrations() {
  const rows = await list(col('eventRegistrations'), where('uid', '==', session.user.uid));
  return new Map(rows.map(r => [r.eventId, r]));
}

/** Who is in line for each event, without names: { eventId: [{ at, mine }] } in sign-up order. */
export async function eventQueues(events) {
  const ids = [...new Set(events.map(eventKey))];
  if (!ids.length) return {};
  const { data, error } = await supabase.rpc('event_queues', { p_events: ids });
  if (error) throw error;
  return data || {};
}

export async function signUp(ev, term, answers = {}) {
  const uid = session.user.uid;
  await F.setDoc(ref('eventRegistrations', regDocId(ev)), {
    eventId: eventKey(ev), eventTitle: ev.title, uid, email: session.email,
    name: session.profile?.name || session.email, termId: termId(term), answers, registeredAt: stamp()
  });
}
export const changeAnswers = (ev, answers) => F.updateDoc(ref('eventRegistrations', regDocId(ev)), { answers });
export async function cancelSignUp(ev) { await batch().delete(ref('eventRegistrations', regDocId(ev))).commit(); }

/** A small pop-up message (uses the same look as the site's other pop-ups). */
export function popup(title, bodyHtml) {
  document.getElementById('notice-scrim')?.remove();
  const d = document.createElement('div');
  d.className = 'scrim'; d.id = 'notice-scrim';
  d.innerHTML = `<div class="modal" style="max-width:460px" role="alertdialog" aria-modal="true" aria-labelledby="noticeH">
    <div class="modal-head"><h2 id="noticeH">${esc(title)}</h2><button class="x" aria-label="Close">×</button></div>
    <div class="modal-body">${bodyHtml}<div class="btnrow" style="margin-top:16px"><button class="btn primary" type="button" data-close>OK</button></div></div></div>`;
  document.body.appendChild(d);
  const close = () => d.remove();
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('.x') || e.target.closest('[data-close]')) close(); });
  d.querySelector('[data-close]').focus();
  return close;
}

/** The "you need to pay" message, used wherever an unpaid member tries to check in. */
export function payWarning(office) {
  return popup('Payment required',
    `<p style="margin-top:0"><b>You need to pay the club fee before you can sign in to events.</b></p>
     <p>Pay in cash${office ? ` at the club office (${esc(office)})` : ''} or through WUSA. An exec will confirm your payment, and after that the sign-in button works. You can also see an exec at the door.</p>`);
}

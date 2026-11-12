// Exec tool: attendance for an event, plus the door check-in QR code.
import { session } from '../session.js';
import { F, col, ref, watch, where, batch, stamp } from '../db.js';
import { esc, fresh, acts, bindWidgets, collect, badge, toast, toDate, fmtTime, fmtLong } from '../ui.js';
import { termId, labelFromId } from '../terms.js';
import { loadPeople, paymentPanel, bindPayment } from '../members.js';
import { validatePayment, addPaid, addRenewalPaid } from '../payments.js';
import { eventWindow } from '../checkin-core.js';
import { parse } from '../../utils.js';

const eventLabel = e => `${e.title} · ${fmtLong(parse(e.start))}${e.allDay ? '' : ` · ${e.startTime}–${e.endTime}`}`;

export async function render(root, ctx) {
  const v = fresh(root); bindWidgets(v); bindPayment(v);
  const tid = termId(ctx.term);
  const { users, lastTerm } = await loadPeople();
  const events = [...ctx.data.events].sort((a, b) => (a.start + (a.startTime || '')).localeCompare(b.start + (b.startTime || '')));
  const now = Date.now();
  let event = events.reduce((best, e) => Math.abs(eventWindow(e, 0).start - now) < Math.abs(eventWindow(best, 0).start - now) ? e : best, events[0]);
  let mems = [], present = [], q = '', stopAtt = null;

  v.innerHTML = `
    <div class="bar"><h2>Attendance</h2></div>
    <div class="evpick"><div class="field" style="margin:0"><label for="evsel">Event <a href="#" data-act="qr" style="font-weight:400;margin-left:10px">Show door check-in QR</a></label>
      <select id="evsel">${events.map(e => `<option value="${esc(e.id)}" ${e.id === event.id ? 'selected' : ''}>${esc(eventLabel(e))}</option>`).join('')}</select></div>
      <div class="counts" id="counts"></div></div>
    <div class="cols2"><div><div class="field"><label for="aq">Find a member</label><input id="aq" type="search" placeholder="Search name or email" autocomplete="off"></div>
      <div id="results"></div><p class="hint">Can't find them? Ask them to sign in on the site and register first (it takes a minute), then search again.</p></div>
      <aside class="drawer" style="position:static"><div class="sec-h" id="ptitle">Present so far</div><ul class="pres" id="plist"></ul></aside></div>`;

  const memOf = uid => mems.find(m => m.uid === uid);
  const presentOf = uid => present.find(a => a.uid === uid);
  const stamps = a => `${fmtTime(toDate(a.at))}<br>${a.method === 'exec' ? 'Marked by ' + esc(a.by || 'an exec') : a.method === 'qr' ? 'Door code' : 'Signed in on phone'}`;

  function drawCounts() {
    const paidTonight = present.filter(a => a.paidTonight).length;
    v.querySelector('#counts').innerHTML = `<div class="stat"><b>${present.length}</b><span>Present</span></div><div class="stat"><b>${paidTonight}</b><span>Paid tonight</span></div>`;
    v.querySelector('#ptitle').textContent = `Present so far (${present.length})`;
    v.querySelector('#plist').innerHTML = present.length
      ? [...present].sort((a, b) => (toDate(b.at) || 0) - (toDate(a.at) || 0)).map(a => `<li><div><b>${esc(a.name)}</b></div><small>${stamps(a)}</small></li>`).join('')
      : '<li class="hint">No one yet.</li>';
  }

  function drawResults() {
    const out = v.querySelector('#results');
    if (out.contains(document.activeElement) && document.activeElement.matches('input,textarea')) return;   // don't wipe a payment someone is typing
    if (q.length < 2) { out.innerHTML = '<p class="hint">Type at least two letters of a name or email.</p>'; return; }
    const needle = q.toLowerCase();
    const hits = users.filter(u => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)).slice(0, 8);
    out.innerHTML = hits.length ? hits.map(u => {
      const m = memOf(u.id), here = presentOf(u.id);
      const who = `<div class="who"><b>${esc(u.name)}</b><small>${esc(u.email)} · ${esc(u.year)}${m ? '' : ' · last member ' + esc(lastTerm[u.id] ? labelFromId(lastTerm[u.id]) : 'never')}</small></div>`;
      if (here) return `<div class="res" data-uid="${esc(u.id)}"><div class="top">${who}<div>${badge('Present ✓', 'b-paid')} <span class="hint">${esc(fmtTime(toDate(here.at)))}</span></div></div></div>`;
      if (m?.paid) return `<div class="res" data-uid="${esc(u.id)}"><div class="top">${who}<div>${badge('Paid', 'b-paid')} <a class="btn primary sm" href="#" data-act="present">Mark present</a></div></div></div>`;
      if (m) return `<div class="res unpaid" data-uid="${esc(u.id)}"><div class="top">${who}${badge('Not paid yet', 'b-wait')}</div><div class="panel">${paymentPanel('Collect payment, then mark present', ['paypresent', 'Mark paid + present'], session.displayName)}</div></div>`;
      return `<div class="res exp" data-uid="${esc(u.id)}"><div class="top">${who}${badge('Expired', 'b-exp')}</div><div class="panel">${paymentPanel('Renew, collect payment, mark present', ['renewpresent', 'Renew + collect payment + mark present'], session.displayName)}</div></div>`;
    }).join('') : '<p class="hint">No one matches that search.</p>';
  }

  const attDoc = (u, extra = {}) => ({
    eventId: event.id, eventTitle: event.title, uid: u.id, email: u.email, name: u.name, termId: tid,
    method: 'exec', by: session.displayName, at: stamp(), ...extra
  });
  const rowUser = el => users.find(u => u.id === el.closest('[data-uid]').dataset.uid);
  const rowPay = el => collect(el.closest('.res').querySelector('.pay'));

  acts(v, {
    async present(el) { const u = rowUser(el); await F.setDoc(ref('attendance', `${event.id}_${u.id}`), attDoc(u)); toast(`${u.name} is marked present.`); },
    async paypresent(el) {
      const u = rowUser(el), d = rowPay(el), err = validatePayment(d); if (err) return toast(err, 'err');
      const b = batch(); addPaid(b, { uid: u.id, termId: tid, method: d.method, number: d.number });
      b.set(ref('attendance', `${event.id}_${u.id}`), attDoc(u, { paidTonight: true })); await b.commit();
      toast(`${u.name} is paid and present.`);
    },
    async renewpresent(el) {
      const u = rowUser(el), d = rowPay(el), err = validatePayment(d); if (err) return toast(err, 'err');
      const b = batch(); addRenewalPaid(b, { uid: u.id, termId: tid, user: u, method: d.method, number: d.number });
      b.set(ref('attendance', `${event.id}_${u.id}`), attDoc(u, { paidTonight: true })); await b.commit();
      toast(`${u.name} is renewed, paid and present.`);
    },
    async qr() {
      const { default: QRCode } = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
      const url = `${location.origin}${location.pathname}#checkin/${event.id}`;
      const w = eventWindow(event, ctx.portal.checkInOpensMinutesBefore);
      const dlg = document.createElement('div');
      dlg.className = 'scrim'; dlg.id = 'qr-scrim';
      dlg.innerHTML = `<div class="modal" style="max-width:480px" role="dialog" aria-modal="true" aria-labelledby="qrh"><div class="modal-head"><h2 id="qrh">Door check-in code</h2><button class="x" aria-label="Close">×</button></div>
        <div class="modal-body"><div class="qrbox"><canvas id="qrc"></canvas><b style="font-family:var(--head)">${esc(event.title)}</b><div class="hint" style="margin-top:4px">${esc(fmtLong(parse(event.start)))}${event.location ? ' · ' + esc(event.location) : ''}</div></div>
          <div class="alert" style="margin:14px 0 0">Scanning opens the club site. Paid members are marked present automatically. This code only works from ${esc(fmtTime(w.opens))} until the event ends at ${esc(fmtTime(w.end))}.</div>
          <p class="hint" style="word-break:break-all;margin:10px 0 0">${esc(url)}</p>
          <div class="btnrow" style="margin-top:14px;justify-content:center"><a class="btn primary" href="#" id="qr-print">Print this code</a></div></div></div>`;
      document.body.appendChild(dlg);
      await QRCode.toCanvas(dlg.querySelector('#qrc'), url, { width: 260, margin: 1, color: { dark: '#1B1B1B', light: '#FFFFFF' } });
      const close = () => dlg.remove();
      dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('.x')) close(); });
      dlg.querySelector('#qr-print').addEventListener('click', e => { e.preventDefault(); window.print(); });
    }
  });
  v.addEventListener('input', e => { if (e.target.id === 'aq') { q = e.target.value.trim(); drawResults(); } });
  v.querySelector('#evsel').addEventListener('change', e => { event = events.find(x => x.id === e.target.value); listen(); drawResults(); });

  function listen() {
    stopAtt?.();
    stopAtt = watch(col('attendance'), [where('eventId', '==', event.id)], data => { present = data; drawCounts(); drawResults(); });
  }
  ctx.onCleanup(() => stopAtt?.());
  ctx.onCleanup(watch(col('memberships'), [where('termId', '==', tid)], data => { mems = data; drawResults(); }));
  listen(); drawCounts(); drawResults();
}

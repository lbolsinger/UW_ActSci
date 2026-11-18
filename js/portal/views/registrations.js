// Exec tool: who has signed up for an event, who is on the waitlist, dietary needs, and who actually came.
import { col, ref, watch, where, batch } from '../db.js';
import { esc, fresh, acts, badge, toast, fmtLong } from '../ui.js';
import { termId } from '../terms.js';
import { parse } from '../../utils.js';
import { regConfig, queueState, eventKey, eventStart, eventEnd } from '../eventreg-core.js';

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function render(root, ctx) {
  const v = fresh(root);
  const tid = termId(ctx.term);
  const events = ctx.data.events.filter(e => regConfig(e).mode === 'portal').sort((a, b) => eventStart(a) - eventStart(b));
  if (!events.length) { v.innerHTML = '<div class="bar"><h2>Event sign-ups</h2></div><p class="hint">No events use sign-up in the portal yet.</p>'; return; }
  const now = Date.now();
  // start on the event closest to today
  let event = events.reduce((best, e) => Math.abs(eventStart(e) - now) < Math.abs(eventStart(best) - now) ? e : best, events[0]);
  let regs = [], present = [], mems = [], stopRegs = null, stopAtt = null;

  v.innerHTML = `
    <div class="bar"><h2>Event sign-ups</h2></div>
    <div class="evpick"><div class="field" style="margin:0"><label for="evsel">Event</label>
      <select id="evsel">${events.map(e => `<option value="${esc(eventKey(e))}" ${e === event ? 'selected' : ''}>${esc(`${e.title} · ${fmtLong(parse(e.start))}`)}</option>`).join('')}</select></div>
      <div class="counts" id="counts"></div></div>
    <div id="body"></div>`;

  const memOf = uid => mems.find(m => m.uid === uid);
  const cameUids = () => new Set(present.map(a => a.uid));

  function draw() {
    const cfg = regConfig(event), st = queueState(cfg, regs.map(r => ({ ...r, at: r.registeredAt })));
    const came = cameUids();
    const confirmedCame = st.confirmed.filter(r => came.has(r.uid)).length;
    const walkIns = [...came].filter(u => !st.confirmed.some(r => r.uid === u)).length;
    v.querySelector('#counts').innerHTML =
      `<div class="stat"><b>${st.confirmed.length}${cfg.capacity ? ` / ${cfg.capacity}` : ''}</b><span>Registered</span></div>
       <div class="stat"><b>${st.waitlist.length}</b><span>Waitlist</span></div>
       <div class="stat"><b>${confirmedCame}</b><span>Came (of registered)</span></div>
       <div class="stat"><b>${walkIns}</b><span>Walk-ins</span></div>`;

    const row = (r, i, listName) => {
      const m = memOf(r.uid), here = came.has(r.uid);
      const answers = cfg.questions.map(q => {
        const a = r.answers?.[q.id];
        return a === undefined || a === '' ? '' : `<div class="hint" style="margin:2px 0 0"><b>${esc(q.label)}</b> ${esc(a === true ? 'Yes' : a === false ? 'No' : a)}</div>`;
      }).join('');
      return `<div class="res" data-uid="${esc(r.uid)}"><div class="top">
        <div class="who"><b>${listName === 'late' ? '' : `#${i + 1} `}${esc(r.name)}</b><small>${esc(r.email)}${m?.year ? ' · ' + esc(m.year) : ''}${m?.dietary ? ' · Dietary: ' + esc(m.dietary) : ''}</small>${answers}</div>
        <div>${m ? (m.paid ? badge('Paid', 'b-paid') : badge('Not paid', 'b-wait')) : ''} ${here ? badge('Here ✓', 'b-paid') : ''}
          <a class="btn sm" href="#" data-act="remove">Remove</a></div></div></div>`;
    };
    const section = (title, list, name) => list.length
      ? `<div class="sec-h" style="margin-top:18px">${esc(title)} (${list.length})</div>${list.map((r, i) => row(r, i, name)).join('')}` : '';

    const diet = st.confirmed.map(r => ({ r, d: memOf(r.uid)?.dietary })).filter(x => x.d);
    v.querySelector('#body').innerHTML = `
      <div class="btnrow" style="margin:12px 0"><a class="btn sm" href="#" data-act="copy">Copy list (CSV)</a></div>
      ${cfg.deadline ? `<p class="hint">Sign-up deadline: ${esc(fmtLong(cfg.deadline))}${cfg.deadline.getHours() === 23 && cfg.deadline.getMinutes() === 59 ? '' : ' ' + esc(cfg.deadline.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }))}${st.deadlinePassed ? ' (closed)' : ''}</p>` : ''}
      ${diet.length ? `<div class="notice"><b>Dietary needs for the ${st.confirmed.length} registered (${diet.length}):</b> ${diet.map(x => `${esc(x.r.name)}: ${esc(x.d)}`).join(' · ')}</div>` : ''}
      ${section('Registered', st.confirmed, 'in') || '<p class="hint">No one has signed up yet.</p>'}
      ${section('Waitlist', st.waitlist, 'wait')}
      ${section('Signed up after the deadline (not counted)', st.late, 'late')}`;
  }

  function listen() {
    stopRegs?.(); stopAtt?.();
    stopRegs = watch(col('eventRegistrations'), [where('eventId', '==', eventKey(event))], d => { regs = d; draw(); });
    stopAtt = watch(col('attendance'), [where('eventId', '==', eventKey(event))], d => { present = d; draw(); });
  }
  ctx.onCleanup(() => { stopRegs?.(); stopAtt?.(); });
  ctx.onCleanup(watch(col('memberships'), [where('termId', '==', tid)], d => { mems = d; draw(); }));

  v.querySelector('#evsel').addEventListener('change', e => { event = events.find(x => eventKey(x) === e.target.value); regs = []; present = []; listen(); draw(); });

  acts(v, {
    async remove(el) {
      const r = regs.find(x => x.uid === el.closest('[data-uid]').dataset.uid);
      if (!r || !confirm(`Remove ${r.name} from ${event.title}? Everyone behind them moves up.`)) return;
      await batch().delete(ref('eventRegistrations', `${eventKey(event)}_${r.uid}`)).commit();
      toast(`${r.name} was removed.`);
    },
    async copy() {
      const cfg = regConfig(event), st = queueState(cfg, regs.map(r => ({ ...r, at: r.registeredAt })));
      const came = cameUids();
      const head = ['Status', 'Place', 'Name', 'Email', 'Year', 'Dietary', 'Paid', 'Came', ...cfg.questions.map(q => q.label)];
      const lines = [head, ...[['Registered', st.confirmed], ['Waitlist', st.waitlist], ['After deadline', st.late]].flatMap(([label, list]) =>
        list.map((r, i) => { const m = memOf(r.uid) || {};
          return [label, i + 1, r.name, r.email, m.year || '', m.dietary || '', m.paid ? 'Yes' : 'No', came.has(r.uid) ? 'Yes' : 'No',
            ...cfg.questions.map(q => { const a = r.answers?.[q.id]; return a === true ? 'Yes' : a === false ? 'No' : a ?? ''; })]; }))];
      const text = lines.map(l => l.map(csvCell).join(',')).join('\n');
      try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into a spreadsheet.'); }
      catch { toast('Could not copy automatically. Your browser blocked it.', 'err'); }
    }
  });
  listen(); draw();
}

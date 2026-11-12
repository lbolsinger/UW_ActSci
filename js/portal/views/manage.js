// Exec tool: the members table, with payments.
import { session } from '../session.js';
import { F, col, ref, list, read, watch, where, batch, stamp } from '../db.js';
import { esc, fresh, acts, bindWidgets, collect, badge, toast, toggle, toDate, fmtDay, fmtTime } from '../ui.js';
import { termId, termLabel, labelFromId } from '../terms.js';
import { loadPeople, paymentPanel, bindPayment } from '../members.js';
import { validatePayment, addPaid, addUnpaid, addRenewalPaid } from '../payments.js';

export async function render(root, ctx) {
  const v = fresh(root); bindWidgets(v); bindPayment(v);
  const tid = termId(ctx.term);
  const { users, lastTerm } = await loadPeople();
  const userById = Object.fromEntries(users.map(u => [u.id, u]));
  let mems = [], pays = {}, selected = null, filter = 'all', q = '';

  v.innerHTML = `
    <div class="bar"><h2>Manage members</h2><span class="badge b-ok">${esc(termLabel(ctx.term))}</span></div>
    <div class="stats" id="stats"></div>
    <div class="tools"><input type="search" id="mq" placeholder="Search name or email" aria-label="Search members">
      <div class="seg2" id="mf">${[['all', 'All'], ['unpaid', 'Awaiting payment'], ['paid', 'Paid'], ['past', 'Past members'], ['noemail', 'No club emails']].map(([k, l]) => `<span role="button" tabindex="0" data-f="${k}" class="${k === 'all' ? 'on' : ''}">${l}</span>`).join('')}</div></div>
    <div class="layout"><div class="tw"><div style="overflow-x:auto"><table class="m"><thead id="thead"></thead><tbody id="tbody"></tbody></table></div></div>
      <aside class="drawer" id="drawer"><p class="hint" style="margin:0">Select a member to see their details and record a payment.</p></aside></div>`;

  const memberOf = uid => mems.find(m => m.uid === uid);
  const payBadge = m => {
    if (!m.paid) return badge('Awaiting payment', 'b-wait');
    const p = pays[m.id];
    return badge(p ? (p.method === 'wusa' ? `WUSA · ${p.wusaNumber}` : `Cash · ${p.verifiedByName || ''}`) : 'Paid', 'b-paid');
  };

  function rows() {
    const needle = q.toLowerCase();
    const match = (n, e) => !needle || n.toLowerCase().includes(needle) || e.toLowerCase().includes(needle);
    if (filter === 'past') {
      const current = new Set(mems.map(m => m.uid));
      return { past: true, list: users.filter(u => !current.has(u.id) && match(u.name, u.email)).sort((a, b) => a.name.localeCompare(b.name)) };
    }
    return {
      past: false, list: mems.filter(m => match(m.name, m.email) &&
        (filter === 'all' || (filter === 'paid' && m.paid) || (filter === 'unpaid' && !m.paid) || (filter === 'noemail' && userById[m.uid]?.emailOptIn === false)))
        .sort((a, b) => a.name.localeCompare(b.name))
    };
  }

  function drawTable() {
    const paid = mems.filter(m => m.paid).length, current = new Set(mems.map(m => m.uid));
    v.querySelector('#stats').innerHTML = `
      <div class="stat"><b>${mems.length}</b><span>Registered this term</span></div><div class="stat"><b>${paid}</b><span>Paid</span></div>
      <div class="stat hl"><b>${mems.length - paid}</b><span>Awaiting payment</span></div>
      <div class="stat"><b>${users.filter(u => !current.has(u.id)).length}</b><span>Past members who haven't renewed</span></div>`;
    const r = rows();
    v.querySelector('#thead').innerHTML = r.past
      ? '<tr><th>Member</th><th>Year</th><th>Last member</th></tr>'
      : '<tr><th>Paid</th><th>Member</th><th>Year</th><th>Work term</th><th>Dietary</th><th>Registered</th><th>Payment</th></tr>';
    v.querySelector('#tbody').innerHTML = r.list.length ? r.list.map(x => r.past
      ? `<tr class="click ${selected === x.id ? 'sel' : ''}" data-uid="${esc(x.id)}"><td><b>${esc(x.name)}</b><small>${esc(x.email)}</small></td><td>${esc(x.year)}</td><td>${esc(lastTerm[x.id] ? labelFromId(lastTerm[x.id]) : '')}</td></tr>`
      : `<tr class="click ${selected === x.uid ? 'sel' : ''}" data-uid="${esc(x.uid)}"><td><span class="cb ${x.paid ? 'on' : ''}">${x.paid ? '✓' : ''}</span></td>
          <td><b>${esc(x.name)}</b><small>${esc(x.email)}</small>${userById[x.uid]?.emailOptIn === false ? '<span class="badge b-exp" style="margin-top:3px">No club emails</span>' : ''}</td>
          <td>${esc(x.year)}</td><td>${x.workTerm === 'coop' ? 'On co-op' : 'On study'}</td><td>${esc(x.dietary || '')}</td><td>${esc(fmtDay(toDate(x.registeredAt)))}</td><td>${payBadge(x)}</td></tr>`).join('')
      : `<tr><td colspan="7" class="hint" style="padding:18px">${all0()}</td></tr>`;
  }
  const all0 = () => (mems.length || filter === 'past') ? 'No one matches.' : 'No one has registered for this term yet.';

  async function drawDrawer() {
    const el = v.querySelector('#drawer');
    if (!selected) { el.innerHTML = '<p class="hint" style="margin:0">Select a member to see their details and record a payment.</p>'; return; }
    const u = userById[selected], m = memberOf(selected);
    if (!u) return;
    const atts = await list(col('attendance'), where('uid', '==', selected));
    const pay = m?.paid ? await read('payments', m.id) : null;
    if (selected !== u.id) return;   // they clicked someone else while we were loading
    el.innerHTML = `
      <h3>${esc(u.name)}</h3><div class="sub2">${esc(u.email)}</div>
      <dl class="kv"><dt>Term</dt><dd>${m ? esc(termLabel(ctx.term)) + ' · registered ' + esc(fmtDay(toDate(m.registeredAt))) : 'Not registered this term' + (lastTerm[u.id] ? ' (last member ' + esc(labelFromId(lastTerm[u.id])) + ')' : '')}</dd>
        <dt>Year</dt><dd>${esc(u.year)}, ${u.workTerm === 'coop' ? 'on co-op' : 'on study'}</dd>
        ${u.dietary ? `<dt>Dietary</dt><dd>${esc(u.dietary)}</dd>` : ''}
        ${u.linkedin ? `<dt>LinkedIn</dt><dd><a href="${esc(u.linkedin)}" target="_blank" rel="noopener noreferrer">${esc(u.linkedin.replace(/^https?:\/\/(www\.)?/, ''))}</a></dd>` : ''}
        ${u.coopExperience ? `<dt>Co-op</dt><dd>${esc(u.coopExperience)}</dd>` : ''}
        ${(u.exams || []).length ? `<dt>Exams</dt><dd>${esc(u.exams.join(', '))}</dd>` : ''}</dl>
      <div class="prefrow" style="margin-bottom:12px"><b style="font-size:.9rem">Club emails</b>${toggle('emailOptIn', u.emailOptIn !== false, 'execemail')}</div>
      <div style="margin-bottom:12px"><div class="lbl">Events attended</div>${atts.length
        ? `<ul class="att">${atts.sort((a, b) => (toDate(b.at) || 0) - (toDate(a.at) || 0)).map(a => `<li style="padding:5px 0"><span class="ck">✓</span><div>${esc(a.eventTitle || a.eventId)}<small>${esc(fmtDay(toDate(a.at)))} · ${a.method === 'exec' ? 'Marked by ' + esc(a.by || 'an exec') : a.method === 'qr' ? 'Signed in with the door code' : 'Signed in on phone'}</small></div></li>`).join('')}</ul>`
        : '<p class="hint" style="margin:0">None yet.</p>'}</div>
      ${m?.paid ? `<div class="pay"><div class="sec-h">Payment <span class="only">Execs only</span></div>
          <dl class="kv"><dt>Paid</dt><dd>${esc(fmtDay(toDate(m.paidAt)))}</dd><dt>How</dt><dd>${pay?.method === 'wusa' ? 'WUSA, confirmation ' + esc(pay.wusaNumber) : 'Cash'}</dd><dt>Verified by</dt><dd>${esc(pay?.verifiedByName || '')}</dd></dl>
          <a href="#" data-act="unpay" class="hint">Undo this payment</a></div>`
        : m ? paymentPanel('Payment', ['pay', 'Mark as paid'], session.displayName)
        : paymentPanel('Renew and record payment', ['renew', `Renew for ${termLabel(ctx.term)} and mark paid`], session.displayName)}`;
    el.querySelectorAll('.pay-wusa').forEach(x => x.classList.remove('hidden'));
  }

  v.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-uid]');
    if (tr && v.contains(tr)) { selected = tr.dataset.uid; drawTable(); drawDrawer(); lastSig = sigFor(); }
    const f = e.target.closest('#mf [data-f]');
    if (f) { filter = f.dataset.f; v.querySelectorAll('#mf [data-f]').forEach(x => x.classList.toggle('on', x === f)); drawTable(); }
  });
  v.querySelector('#mq').addEventListener('input', e => { q = e.target.value.trim(); drawTable(); });

  const panelData = () => collect(v.querySelector('#drawer .pay'));
  acts(v, {
    async pay() {
      const d = panelData(), err = validatePayment(d); if (err) return toast(err, 'err');
      const b = batch(); addPaid(b, { uid: selected, termId: tid, method: d.method, number: d.number });
      await b.commit(); toast('Marked as paid.');
    },
    async unpay() {
      if (!confirm('Undo this payment? It will show as awaiting payment again.')) return;
      const b = batch(); addUnpaid(b, { uid: selected, termId: tid }); await b.commit(); toast('Payment undone.');
    },
    async renew() {
      const d = panelData(), err = validatePayment(d); if (err) return toast(err, 'err');
      const b = batch(); addRenewalPaid(b, { uid: selected, termId: tid, user: userById[selected], method: d.method, number: d.number });
      await b.commit(); toast('Renewed and marked as paid.');
    },
    async execemail(el) {
      const on = !el.classList.contains('on'); el.classList.toggle('on', on);
      await F.updateDoc(ref('users', selected), { emailOptIn: on }); userById[selected].emailOptIn = on; drawTable();
      toast(on ? 'They will get club emails.' : 'They will no longer get club emails.');
    }
  });

  // Live: another exec recording a payment shows up here within a second.
  const sigFor = () => selected ? `${selected}:${memberOf(selected)?.paid}` : '';
  let lastSig = '';
  ctx.onCleanup(watch(col('memberships'), [where('termId', '==', tid)], data => {
    mems = data; drawTable();
    const sig = sigFor();
    if (sig !== lastSig) { lastSig = sig; drawDrawer(); }
  }));
  ctx.onCleanup(watch(col('payments'), [where('termId', '==', tid)], data => { pays = Object.fromEntries(data.map(p => [p.id, p])); drawTable(); }));
}

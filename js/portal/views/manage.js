// Exec tool: the members table, with payments.
import { session } from '../session.js';
import { F, col, ref, list, read, watch, where, batch, stamp } from '../db.js';
import { esc, fresh, acts, bindWidgets, collect, badge, toast, toggle, toDate, fmtDay, fmtTime } from '../ui.js';
import { termId, termLabel, labelFromId } from '../terms.js';
import { loadPeople, paymentPanel, bindPayment } from '../members.js';
import { validatePayment, addPaid, addUnpaid, addRenewalPaid, addWusaNotFound, addClearFlag, addDuplicateFlags, checkDuplicates, payBadge, payState, verifyDue, flagText } from '../payments.js';
import { coopLine, stripUrl } from '../profile-fields.js';
import { parseCsv, wusaRows, reconcile, RECENT_DAYS } from '../wusa-csv.js';

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
      <div class="seg2" id="mf">${[['all', 'All'], ['unpaid', 'Awaiting payment'], ['confirming', 'Awaiting confirmation'], ['flagged', 'Flagged'], ['paid', 'Paid'], ['past', 'Past members'], ['noemail', 'No club emails']].map(([k, l]) => `<span role="button" tabindex="0" data-f="${k}" class="${k === 'all' ? 'on' : ''}">${l}</span>`).join('')}</div>
      <button class="btn sm" type="button" id="export">Export list (CSV)</button>
      <button class="btn sm" type="button" id="wusafile">Check WUSA file…</button><input type="file" id="wusainput" accept=".csv,text/csv,text/plain" class="hidden"></div>
    <div class="layout"><div class="tw"><div style="overflow-x:auto"><table class="m"><thead id="thead"></thead><tbody id="tbody"></tbody></table></div></div>
      <aside class="drawer" id="drawer"><p class="hint" style="margin:0">Select a member to see their details and record a payment.</p></aside></div>`;

  const memberOf = uid => mems.find(m => m.uid === uid);
  const badgeFor = m => payBadge(m, { pay: pays[m.id], exec: true });

  function rows() {
    const needle = q.toLowerCase();
    const match = (n, e) => !needle || n.toLowerCase().includes(needle) || e.toLowerCase().includes(needle);
    if (filter === 'past') {
      const current = new Set(mems.map(m => m.uid));
      return { past: true, list: users.filter(u => !current.has(u.id) && match(u.name, u.email)).sort((a, b) => a.name.localeCompare(b.name)) };
    }
    return {
      past: false, list: mems.filter(m => match(m.name, m.email) &&
        (filter === 'all' || (filter === 'paid' && m.paid) || (filter === 'unpaid' && payState(m) === 'awaiting')
          || (filter === 'confirming' && payState(m) === 'confirming') || (filter === 'flagged' && !!m.flagged)
          || (filter === 'noemail' && userById[m.uid]?.emailOptIn === false)))
        .sort((a, b) => a.name.localeCompare(b.name))
    };
  }

  function drawTable() {
    const paid = mems.filter(m => m.paid).length, current = new Set(mems.map(m => m.uid));
    v.querySelector('#stats').innerHTML = `
      <div class="stat"><b>${mems.length}</b><span>Registered this term</span></div><div class="stat"><b>${paid}</b><span>Paid</span></div>
      <div class="stat hl"><b>${mems.filter(m => payState(m) === 'awaiting').length}</b><span>Awaiting payment</span></div>
      <div class="stat"><b>${mems.filter(m => payState(m) === 'confirming').length}</b><span>Awaiting confirmation${mems.some(verifyDue) ? ` (${mems.filter(verifyDue).length} to verify)` : ''}</span></div>
      <div class="stat ${mems.some(m => m.flagged) ? 'hl' : ''}"><b>${mems.filter(m => m.flagged).length}</b><span>Flagged</span></div>
      <div class="stat"><b>${users.filter(u => !current.has(u.id)).length}</b><span>Past members who haven't renewed</span></div>`;
    const r = rows();
    v.querySelector('#thead').innerHTML = r.past
      ? '<tr><th>Member</th><th>Year</th><th>Last member</th></tr>'
      : '<tr><th>Paid</th><th>Member</th><th>Year</th><th>Work term</th><th>Dietary</th><th>Registered</th><th>Payment</th></tr>';
    v.querySelector('#tbody').innerHTML = r.list.length ? r.list.map(x => r.past
      ? `<tr class="click ${selected === x.id ? 'sel' : ''}" data-uid="${esc(x.id)}"><td><b>${esc(x.name)}</b><small>${esc(x.email)}</small></td><td>${esc(x.year)}</td><td>${esc(lastTerm[x.id] ? labelFromId(lastTerm[x.id]) : '')}</td></tr>`
      : `<tr class="click ${selected === x.uid ? 'sel' : ''}" data-uid="${esc(x.uid)}"><td><span class="cb ${x.paid ? 'on' : ''}">${x.paid ? '✓' : ''}</span></td>
          <td><b>${esc(x.name)}</b><small>${esc(x.email)}</small>${userById[x.uid]?.emailOptIn === false ? '<span class="badge b-exp" style="margin-top:3px">No club emails</span>' : ''}</td>
          <td>${esc(x.year)}</td><td>${x.workTerm === 'coop' ? 'On co-op' : 'On study'}</td><td>${esc(x.dietary || '')}</td><td>${esc(fmtDay(toDate(x.registeredAt)))}</td><td>${badgeFor(x)}</td></tr>`).join('')
      : `<tr><td colspan="7" class="hint" style="padding:18px">${all0()}</td></tr>`;
  }
  const all0 = () => (mems.length || filter === 'past') ? 'No one matches.' : 'No one has registered for this term yet.';

  async function drawDrawer() {
    const el = v.querySelector('#drawer');
    if (!selected) { el.innerHTML = '<p class="hint" style="margin:0">Select a member to see their details and record a payment.</p>'; return; }
    const u = userById[selected], m = memberOf(selected);
    if (!u) return;
    const atts = await list(col('attendance'), where('uid', '==', selected));
    const pay = m ? (pays[m.id] || null) : null, st = payState(m);
    if (selected !== u.id) return;   // they clicked someone else while we were loading
    el.innerHTML = `
      <h3>${esc(u.name)}</h3><div class="sub2">${esc(u.email)}</div>
      <dl class="kv"><dt>Term</dt><dd>${m ? esc(termLabel(ctx.term)) + ' · registered ' + esc(fmtDay(toDate(m.registeredAt))) : 'Not registered this term' + (lastTerm[u.id] ? ' (last member ' + esc(labelFromId(lastTerm[u.id])) + ')' : '')}</dd>
        <dt>Year</dt><dd>${esc(u.year)}, ${u.workTerm === 'coop' ? 'on co-op' : 'on study'}</dd>
        ${(u.programs || []).length ? `<dt>Program</dt><dd>${esc(u.programs.join(', '))}</dd>` : ''}
        ${u.dietary ? `<dt>Dietary</dt><dd>${esc(u.dietary)}</dd>` : ''}
        ${(u.interests?.length || u.otherInterest) ? `<dt>Interests</dt><dd>${esc([...(u.interests || []), u.otherInterest].filter(Boolean).join(', '))}</dd>` : ''}
        ${u.coops?.length ? `<dt>Co-ops (${u.coops.length})</dt><dd>${u.coops.map(c => esc(coopLine(c))).join('<br>')}</dd>` : ''}
        ${(u.skills || []).length ? `<dt>Skills</dt><dd>${esc(u.skills.join(', '))}</dd>` : ''}
        ${u.contactEmail ? `<dt>Contact</dt><dd>${esc(u.contactEmail)}</dd>` : ''}
        ${u.website ? `<dt>Website</dt><dd><a href="${esc(u.website)}" target="_blank" rel="noopener noreferrer">${esc(stripUrl(u.website))}</a></dd>` : ''}
        ${u.linkedin ? `<dt>LinkedIn</dt><dd><a href="${esc(u.linkedin)}" target="_blank" rel="noopener noreferrer">${esc(u.linkedin.replace(/^https?:\/\/(www\.)?/, ''))}</a></dd>` : ''}
        ${u.coopExperience ? `<dt>${u.coops?.length ? 'Other experience' : 'Co-op'}</dt><dd>${esc(u.coopExperience)}</dd>` : ''}
        ${(u.exams || []).length ? `<dt>Exams</dt><dd>${esc(u.exams.join(', '))}</dd>` : ''}</dl>
      <div class="prefrow" style="margin-bottom:12px"><b style="font-size:.9rem">Club emails</b>${toggle('emailOptIn', u.emailOptIn !== false, 'execemail')}</div>
      <div style="margin-bottom:12px"><div class="lbl">Events attended</div>${atts.length
        ? `<ul class="att">${atts.sort((a, b) => (toDate(b.at) || 0) - (toDate(a.at) || 0)).map(a => `<li style="padding:5px 0"><span class="ck">✓</span><div>${esc(a.eventTitle || a.eventId)}<small>${esc(fmtDay(toDate(a.at)))} · ${a.method === 'exec' ? 'Marked by ' + esc(a.by || 'an exec') : a.method === 'qr' ? 'Signed in with the door code' : 'Signed in on phone'}</small></div></li>`).join('')}</ul>`
        : '<p class="hint" style="margin:0">None yet.</p>'}</div>
      ${m?.flagged ? `<div class="alert err" style="margin-bottom:12px"><b>Flagged: ${esc(flagText(m))}</b>${m.flaggedAt ? `<small>Since ${esc(fmtDay(toDate(m.flaggedAt)))}</small>` : ''}
          <a href="#" data-act="clearflag" class="btn sm" style="margin-top:8px">Clear flag</a></div>` : ''}
      ${st === 'confirming' || (st === 'flagged' && pay?.wusaNumber) ? `<div class="pay-info card" style="padding:12px;margin-bottom:12px"><div class="sec-h">WUSA payment to verify <span class="only">Execs only</span></div>
          <dl class="kv"><dt>Number</dt><dd>${esc(pay?.wusaNumber || '(none)')}</dd>${m.wusaSubmittedAt ? `<dt>Entered</dt><dd>${esc(fmtDay(toDate(m.wusaSubmittedAt)))}</dd>` : ''}
          ${m.verifyBy ? `<dt>Check with WUSA by</dt><dd>${esc(fmtDay(toDate(m.verifyBy)))}${verifyDue(m) ? ' <b>(due now)</b>' : ''}</dd>` : ''}</dl>
          ${pay?.wusaNumber ? `<div class="btnrow"><button class="btn primary sm" type="button" data-act="wusaok">WUSA confirmed it: mark paid</button>
          ${st === 'confirming' ? '<button class="btn sm" type="button" data-act="wusano">WUSA can\'t find it: flag</button>' : ''}</div>` : ''}
          <p class="hint" style="margin:8px 0 0">Or use the form below if the member shows you proof.</p></div>` : ''}
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

  /* CSV export of whoever the current filter/search shows. WUSA numbers and dietary notes are left out on purpose. */
  const csvCell = x => { let t = String(x ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const statusText = m => ({ paid: 'Paid', awaiting: 'Awaiting payment', confirming: verifyDue(m) ? 'Awaiting confirmation (verify with WUSA)' : 'Awaiting confirmation (within 2 weeks)', flagged: 'Flagged' }[payState(m)]) + (m.paid && m.flagged ? ' (flagged)' : '');
  v.querySelector('#export').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const r = rows(), atts = await list(col('attendance'), where('termId', '==', tid));
      const byUser = {}; for (const a of atts) (byUser[a.uid] ??= []).push(a.eventTitle || a.eventId);
      const head = ['Name', 'Email', 'Term', 'Year', 'Program', 'Events attended', 'Events', 'Payment status'];
      const lines = r.past
        ? r.list.map(u => [u.name, u.email, 'Not registered', u.year, (u.programs || []).join('; '), '', '', ''])
        : r.list.map(m => [m.name, m.email, termLabel(ctx.term), m.year, (userById[m.uid]?.programs || []).join('; '), (byUser[m.uid] || []).length, (byUser[m.uid] || []).join('; '), statusText(m)]);
      const csv = [head, ...lines].map(l => l.map(csvCell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `members-${tid}${filter === 'all' ? '' : '-' + filter}.csv` });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`Exported ${lines.length} ${lines.length === 1 ? 'member' : 'members'}.`);
    } catch (err) { console.error(err); toast('Could not export.', 'err'); }
    finally { btn.disabled = false; }
  });

  /* WUSA's CSV (every two weeks): mark confirmed payments as paid, flag the ones WUSA has no record of. */
  v.querySelector('#wusafile').addEventListener('click', () => { const i = v.querySelector('#wusainput'); i.value = ''; i.click(); });
  v.querySelector('#wusainput').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    let rows;
    try { rows = wusaRows(parseCsv(await f.text())); } catch { rows = []; }
    if (!rows.length) return toast('No 6-digit confirmation numbers found in that file.', 'err');
    const r = reconcile(mems, pays, rows, { toMs: d => +toDate(d) });
    const names = l => l.map(p => esc(p.m.name)).join(', ');
    const sec = (n, t, l, extra = '') => l.length ? `<p><b>${n} ${t}</b>${extra}<br><span class="hint">${names(l)}</span></p>` : '';
    const mism = r.paid.filter(p => p.emailMismatch);
    const todo = r.paid.length + r.missing.length;
    const dlg = document.createElement('div'); dlg.className = 'scrim';
    dlg.innerHTML = `<div class="modal" style="max-width:560px" role="dialog" aria-modal="true" aria-labelledby="wfh"><div class="modal-head"><h2 id="wfh">WUSA file: ${rows.length} payments read</h2><button class="x" aria-label="Close">×</button></div>
      <div class="modal-body">
        ${sec(r.paid.length, 'will be marked paid', r.paid)}
        ${mism.length ? `<p class="hint">For ${mism.length} of these the email in the file is different from the member's account (${names(mism)}). That's expected when someone pays with a personal email.</p>` : ''}
        ${sec(r.missing.length, 'not in the file, will be flagged as unverified', r.missing)}
        ${sec(r.recent.length, `not in the file, but entered in the last ${RECENT_DAYS} days`, r.recent, ' (left alone: they may be in the next file)')}
        ${sec(r.review.length, 'share a number and none matches the file\'s email', r.review, ' (left alone: check these by hand)')}
        ${sec(r.loser.length, 'share a number with a member who matched, still flagged as duplicates', r.loser)}
        ${r.alreadyFlagged.length ? `<p class="hint">${r.alreadyFlagged.length} already flagged as unverified and still not in the file.</p>` : ''}
        ${todo ? '' : '<p class="hint">Nothing to change.</p>'}
        <div class="btnrow"><button class="btn primary" type="button" data-go ${todo ? '' : 'disabled'}>Apply changes</button><button class="btn" type="button" data-no>Cancel</button></div></div></div>`;
    document.body.appendChild(dlg);
    const close = () => dlg.remove();
    dlg.addEventListener('click', ev => { if (ev.target === dlg || ev.target.closest('.x') || ev.target.closest('[data-no]')) close(); });
    dlg.querySelector('[data-go]').addEventListener('click', async ev => {
      ev.target.disabled = true; let done = 0, failed = 0;
      for (const { m, number } of r.paid) {
        try { const b = batch(); addPaid(b, { uid: m.uid, termId: tid, method: 'wusa', number, how: 'confirmed from WUSA file' }); if (m.flagged) addClearFlag(b, { uid: m.uid, termId: tid }); await b.commit(); done++; } catch (err) { console.error(err); failed++; }
      }
      for (const { m } of r.missing) {
        try { const b = batch(); addWusaNotFound(b, { uid: m.uid, termId: tid }); await b.commit(); done++; } catch (err) { console.error(err); failed++; }
      }
      close(); toast(failed ? `Updated ${done}, ${failed} failed. Try again.` : `Updated ${done} ${done === 1 ? 'member' : 'members'}.`, failed ? 'err' : undefined);
    });
  });

  const panelData = () => collect(v.querySelector('#drawer .pay'));
  acts(v, {
    async pay() {
      const d = panelData(), err = validatePayment(d); if (err) return toast(err, 'err');
      const m = memberOf(selected), id = `${selected}_${tid}`;
      const dupes = d.method === 'wusa' ? await checkDuplicates(d.number, id, uid => userById[uid]?.name) : [];
      if (dupes === null) return;
      const b = batch(); addPaid(b, { uid: selected, termId: tid, method: d.method, number: d.number, how: m?.flagged ? 'confirmed from proof' : '' });
      if (dupes.length) addDuplicateFlags(b, { uid: selected, termId: tid, others: dupes });
      else if (m?.flagged) addClearFlag(b, { uid: selected, termId: tid });
      await b.commit(); toast(dupes.length ? 'Marked as paid. Both accounts are flagged for review.' : 'Marked as paid.');
    },
    async wusaok() {
      const pay = pays[`${selected}_${tid}`]; if (!pay?.wusaNumber) return;
      const b = batch(); addPaid(b, { uid: selected, termId: tid, method: 'wusa', number: pay.wusaNumber, how: 'confirmed with WUSA' });
      if (memberOf(selected)?.flagged && memberOf(selected).flagReason === 'wusa-not-found') addClearFlag(b, { uid: selected, termId: tid });
      await b.commit(); toast('Marked as paid.');
    },
    async wusano() {
      if (!confirm('Flag this payment because WUSA could not find it? Their event sign-in is paused until it is sorted out.')) return;
      const b = batch(); addWusaNotFound(b, { uid: selected, termId: tid }); await b.commit(); toast('Flagged.');
    },
    async clearflag() {
      const b = batch(); addClearFlag(b, { uid: selected, termId: tid }); await b.commit(); toast('Flag cleared.');
    },
    async unpay() {
      if (!confirm('Undo this payment? It will show as awaiting payment again.')) return;
      const b = batch(); addUnpaid(b, { uid: selected, termId: tid, directoryEntry: await read('directory', selected).catch(() => null) }); await b.commit(); toast('Payment undone.');
    },
    async renew() {
      const d = panelData(), err = validatePayment(d); if (err) return toast(err, 'err');
      const dupes = d.method === 'wusa' ? await checkDuplicates(d.number, `${selected}_${tid}`, uid => userById[uid]?.name) : [];
      if (dupes === null) return;
      const b = batch(); addRenewalPaid(b, { uid: selected, termId: tid, user: userById[selected], method: d.method, number: d.number });
      if (dupes.length) addDuplicateFlags(b, { uid: selected, termId: tid, others: dupes });
      await b.commit(); toast(dupes.length ? 'Renewed and paid. Both accounts are flagged for review.' : 'Renewed and marked as paid.');
    },
    async execemail(el) {
      const on = !el.classList.contains('on'); el.classList.toggle('on', on);
      await F.updateDoc(ref('users', selected), { emailOptIn: on }); userById[selected].emailOptIn = on; drawTable();
      toast(on ? 'They will get club emails.' : 'They will no longer get club emails.');
    }
  });

  // Live: another exec recording a payment shows up here within a second.
  const sigFor = () => selected ? `${selected}:${payState(memberOf(selected))}:${!!memberOf(selected)?.flagged}:${!!pays[`${selected}_${tid}`]}` : '';
  let lastSig = '';
  ctx.onCleanup(watch(col('memberships'), [where('termId', '==', tid)], data => {
    mems = data; drawTable();
    const sig = sigFor();
    if (sig !== lastSig) { lastSig = sig; drawDrawer(); }
  }));
  ctx.onCleanup(watch(col('payments'), [where('termId', '==', tid)], data => { pays = Object.fromEntries(data.map(p => [p.id, p])); drawTable(); const sig = sigFor(); if (sig !== lastSig) { lastSig = sig; drawDrawer(); } }));
}

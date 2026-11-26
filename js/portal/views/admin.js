// Club account only: who is an exec, reviewer ratings, and account-deletion requests.
import { F, col, ref, list, stamp } from '../db.js';
import { labelFromId } from '../terms.js';
import { esc, fresh, acts, bindWidgets, toggle, toast, toDate, fmtDay, starText } from '../ui.js';
import { isMemberEmail } from '../config.js';

export async function render(root, ctx) {
  const v = fresh(root); bindWidgets(v);
  const [users, execs, ratings, dels, codes, reqs] = await Promise.all([list(col('users')), list(col('execs')), list(col('ratings')), list(col('deletionRequests')),
    list(col('discountCodes')).catch(() => []), list(col('codeRequests')).catch(() => [])]);   // the code tables only exist after the latest schema.sql
  const isExec = new Set(execs.map(e => e.id));
  let q = '';

  // average rating per reviewer
  const groups = {};
  for (const r of ratings) {
    const key = `${r.reviewerEmail || r.reviewerName}|${r.kind}`;
    (groups[key] ??= { name: r.reviewerName || r.reviewerEmail, kind: r.kind, stars: [], comments: [] }).stars.push(r.stars);
    if (r.comment) groups[key].comments.push(r);
  }
  const rows = Object.values(groups).map(g => ({ ...g, avg: g.stars.reduce((a, b) => a + b, 0) / g.stars.length })).sort((a, b) => b.avg - a.avg);

  v.innerHTML = `
    <div class="bar"><h2>Club admin</h2></div>
    <p class="hint" style="margin:-8px 0 14px">Only the club account can see this page.</p>
    <div class="cols2" style="grid-template-columns:1fr 1.5fr">
      <section class="card"><div class="sec-h">Who's an exec</div>
        <div class="field"><input type="search" id="xq" placeholder="Find a member" aria-label="Find a member"></div>
        <div class="tw"><table class="m"><thead><tr><th>Member</th><th style="text-align:right">Exec</th></tr></thead><tbody id="xbody"></tbody></table></div>
        <form id="addx" class="field" style="margin:14px 0 0"><label for="xe">Add an exec by email</label>
          <div style="display:flex;gap:8px"><input id="xe" type="email" placeholder="name@uwaterloo.ca"><button class="btn sm" type="submit">Add</button></div>
          <small>For someone who hasn't registered yet. They become an exec the next time they open the site.</small></form></section>
      <div class="stack">
        <section class="card"><div class="sec-h">Reviewer ratings <span class="only">Club account only</span></div>
          <p class="hint" style="margin-top:-4px">Ratings are anonymous. You see the score and comment, not who left it. Reviewers and other execs never see them.</p>
          <div class="tw"><table class="m"><thead><tr><th>Reviewer</th><th>Program</th><th>Average</th><th>Ratings</th><th>Latest comment</th></tr></thead><tbody>
            ${rows.map(g => `<tr><td><b>${esc(g.name)}</b></td><td>${g.kind === 'mock' ? 'Mock interview' : 'Resume critique'}</td><td><span class="stars" style="font-size:1rem;letter-spacing:1px">${starText(Math.round(g.avg))}</span> <b>${g.avg.toFixed(1)}</b></td><td>${g.stars.length}</td>
              <td class="hint">${esc(g.comments.sort((a, b) => (toDate(b.updatedAt) || 0) - (toDate(a.updatedAt) || 0))[0]?.comment || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="hint">No ratings yet.</td></tr>'}</tbody></table></div></section>
        <section class="card"><div class="sec-h">Discount codes <span class="only">Club account only</span></div>
          <p class="hint" style="margin-top:-4px">Codes are stored in the database, never in the website's files. Paid members only see a code after pressing Request, and each request is logged below.</p>
          <div id="codes"></div>
          <form id="addcode" class="stack" style="margin-top:12px" novalidate>
            <div class="two-f"><div class="field"><label for="cl">Name</label><input id="cl" name="label" maxlength="80" placeholder="Coaching Actuaries"></div>
              <div class="field"><label for="cc">Code</label><input id="cc" name="code" maxlength="100" autocomplete="off"></div></div>
            <div class="field"><label for="cn">Note for members <span class="hint">(optional)</span></label><input id="cn" name="note" maxlength="400" placeholder="25% off Practice, 50% off Learn Lite + Practice…"></div>
            <div><button class="btn sm" type="submit">Save code</button> <small>Using an existing name replaces that code.</small></div></form></section>
        <section class="card"><div class="sec-h">Code requests</div>
          <div class="tw"><table class="m"><thead><tr><th>Member</th><th>Code</th><th>Term</th><th>Times</th><th>Last</th></tr></thead><tbody>
            ${reqs.sort((a, b) => (toDate(b.lastAt) || 0) - (toDate(a.lastAt) || 0)).map(r => `<tr><td><b>${esc(r.name || '')}</b><small>${esc(r.email || '')}</small></td><td>${esc(r.label || r.key || '')}</td><td>${esc(labelFromId(r.termId))}</td><td>${esc(r.count || 1)}</td><td class="hint">${esc(fmtDay(toDate(r.lastAt)))}</td></tr>`).join('') || '<tr><td colspan="5" class="hint">No requests yet.</td></tr>'}</tbody></table></div></section>
        <section class="card"><div class="sec-h">Account deletion requests</div>
          ${dels.length ? `<table class="m"><tbody>${dels.map(d => `<tr data-id="${esc(d.id)}"><td><b>${esc(d.name || '')}</b><small>${esc(d.email)} · asked ${esc(fmtDay(toDate(d.at)))}</small></td><td style="text-align:right"><a href="#" class="btn sm" data-act="deldone">Mark done</a></td></tr>`).join('')}</tbody></table>
          <p class="hint" style="margin:10px 0 0">To delete someone: remove their records in the Supabase dashboard (SQL Editor), then press "Mark done". SUPABASE_SETUP.md has the exact steps.</p>` : '<p class="hint" style="margin:0">None right now.</p>'}</section>
      </div></div>`;

  function drawExecs() {
    const needle = q.toLowerCase();
    const extra = execs.filter(e => !users.some(u => u.email === e.id)).map(e => ({ id: e.id, name: e.name || e.id, email: e.id }));
    const all = [...users.map(u => ({ id: u.id, name: u.name, email: u.email })), ...extra]
      .filter(u => !needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle))
      .sort((a, b) => (isExec.has(b.email) - isExec.has(a.email)) || a.name.localeCompare(b.name)).slice(0, 40);
    v.querySelector('#xbody').innerHTML = all.map(u => `<tr data-email="${esc(u.email)}" data-name="${esc(u.name)}"><td><b>${esc(u.name)}</b><small>${esc(u.email)}</small></td><td style="text-align:right">${toggle('x', isExec.has(u.email), 'togglex')}</td></tr>`).join('')
      || '<tr><td colspan="2" class="hint">No one matches.</td></tr>';
  }
  v.querySelector('#xq').addEventListener('input', e => { q = e.target.value.trim(); drawExecs(); });
  v.querySelector('#addx').addEventListener('submit', async e => {
    e.preventDefault();
    const email = v.querySelector('#xe').value.trim().toLowerCase();
    if (!isMemberEmail(email)) return toast('Use an @uwaterloo.ca address.', 'err');
    await F.setDoc(ref('execs', email), { name: email, addedAt: stamp() }, { merge: true });
    isExec.add(email); execs.push({ id: email, name: email }); v.querySelector('#xe').value = ''; drawExecs(); toast(`${email} is now an exec.`);
  });
  acts(v, {
    async togglex(el) {
      const tr = el.closest('tr'), email = tr.dataset.email, on = !el.classList.contains('on');
      if (on) await F.setDoc(ref('execs', email), { name: tr.dataset.name, addedAt: stamp() }); else await F.deleteDoc(ref('execs', email));
      on ? isExec.add(email) : isExec.delete(email);
      el.classList.toggle('on', on); el.setAttribute('aria-checked', on);
      toast(on ? `${tr.dataset.name} is now an exec.` : `${tr.dataset.name} is no longer an exec.`);
    },
    async deldone(el) { await F.deleteDoc(ref('deletionRequests', el.closest('tr').dataset.id)); el.closest('tr').remove(); toast('Marked done.'); }
  });
  drawExecs();

  /* discount codes */
  const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const drawCodes = () => {
    v.querySelector('#codes').innerHTML = codes.length ? `<table class="m"><tbody>${codes.map(c => `<tr data-id="${esc(c.id)}"><td><b>${esc(c.label)}</b> ${c.active ? '' : '<span class="badge b-exp">Off</span>'}<small><code>${esc(c.code)}</code>${c.note ? ' · ' + esc(c.note) : ''}</small></td>
        <td style="text-align:right;white-space:nowrap"><a href="#" class="btn sm" data-act="codetoggle">${c.active ? 'Turn off' : 'Turn on'}</a> <a href="#" class="btn sm" data-act="codedel">Delete</a></td></tr>`).join('')}</tbody></table>` : '<p class="hint" style="margin:0">No codes yet.</p>';
  };
  drawCodes();
  v.querySelector('#addcode').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, label = f.label.value.trim(), code = f.code.value.trim(), note = f.note.value.trim(), id = slug(label);
    if (!id || !code) return toast('Add a name and a code.', 'err');
    const doc = { label, code, note, active: codes.find(c => c.id === id)?.active ?? true, updatedAt: stamp() };
    try { await F.setDoc(ref('discountCodes', id), doc); } catch (err) { return toast(err.message || 'Could not save.', 'err'); }
    const i = codes.findIndex(c => c.id === id); if (i >= 0) codes[i] = { id, ...doc }; else codes.push({ id, ...doc });
    f.reset(); drawCodes(); toast('Code saved.');
  });
  acts(v, {
    async codetoggle(el) {
      const c = codes.find(x => x.id === el.closest('tr').dataset.id);
      await F.updateDoc(ref('discountCodes', c.id), { active: !c.active }); c.active = !c.active; drawCodes();
    },
    async codedel(el) {
      const id = el.closest('tr').dataset.id;
      if (!confirm('Delete this code? Past requests stay in the log.')) return;
      await F.deleteDoc(ref('discountCodes', id)); codes.splice(codes.findIndex(x => x.id === id), 1); drawCodes();
    }
  });
}

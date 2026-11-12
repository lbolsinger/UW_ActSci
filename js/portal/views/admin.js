// Club account only: who is an exec, reviewer ratings, and account-deletion requests.
import { F, col, ref, list, stamp } from '../db.js';
import { esc, fresh, acts, bindWidgets, toggle, toast, toDate, fmtDay, starText } from '../ui.js';
import { isMemberEmail } from '../config.js';

export async function render(root, ctx) {
  const v = fresh(root); bindWidgets(v);
  const [users, execs, ratings, dels] = await Promise.all([list(col('users')), list(col('execs')), list(col('ratings')), list(col('deletionRequests'))]);
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
        <section class="card"><div class="sec-h">Account deletion requests</div>
          ${dels.length ? `<table class="m"><tbody>${dels.map(d => `<tr data-id="${esc(d.id)}"><td><b>${esc(d.name || '')}</b><small>${esc(d.email)} · asked ${esc(fmtDay(toDate(d.at)))}</small></td><td style="text-align:right"><a href="#" class="btn sm" data-act="deldone">Mark done</a></td></tr>`).join('')}</tbody></table>
          <p class="hint" style="margin:10px 0 0">To delete someone: remove their records in the Firebase console (Firestore Database), then press "Mark done". SETUP.md explains which collections to clear.</p>` : '<p class="hint" style="margin:0">None right now.</p>'}</section>
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
}

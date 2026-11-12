// Exec tool: the club email list (current members and recent ones, minus anyone who opted out).
import { list, col } from '../db.js';
import { esc, fresh, acts, toast } from '../ui.js';
import { termsBack, termId, termLabel, labelFromId } from '../terms.js';

export async function render(root, ctx) {
  const v = fresh(root);
  const terms = termsBack(ctx.term, ctx.portal.emailListTerms), ids = terms.map(termId);
  const [users, mems] = await Promise.all([list(col('users')), list(col('memberships'))]);
  const inWindow = mems.filter(m => ids.includes(m.termId));
  const uids = [...new Set(inWindow.map(m => m.uid))];
  const byId = Object.fromEntries(users.map(u => [u.id, u]));
  const people = uids.map(id => byId[id]).filter(Boolean);
  const included = people.filter(u => u.emailOptIn !== false).sort((a, b) => a.name.localeCompare(b.name));
  const optedOut = people.length - included.length;
  const older = users.length - people.length;
  const lastIn = u => ids.find(id => inWindow.some(m => m.uid === u.id && m.termId === id));
  const perTerm = Object.fromEntries(ids.map(id => [id, new Set(inWindow.filter(m => m.termId === id && byId[m.uid]?.emailOptIn !== false).map(m => m.uid)).size]));

  v.innerHTML = `
    <div class="bar"><h2>Email list</h2></div>
    <div class="stats">
      <div class="stat hl"><b>${included.length}</b><span>Emails included</span></div>
      <div class="stat"><b>${optedOut}</b><span>Opted out (never included)</span></div>
      <div class="stat"><b>${older}</b><span>Older members (not included)</span></div>
      <div class="stat"><b>${terms.length}</b><span>Terms covered</span></div></div>
    <section class="card"><div class="sec-h">Who's included</div>
      <p>Everyone who registered in the <b>current term or any of the previous ${terms.length - 1} terms</b>, except members who turned off club emails.</p>
      <div class="chips" style="margin-bottom:16px">${terms.map(t => `<span class="chip2 on" style="cursor:default">${esc(termLabel(t))} · ${perTerm[termId(t)]}</span>`).join('')}</div>
      <div class="btnrow"><a class="btn primary" href="#" data-act="copy">Copy ${included.length} emails</a><a class="btn" href="#" data-act="csv">Download CSV</a></div>
      <p class="hint" style="margin-top:10px">Paste the copied emails into the BCC line, or open the CSV in Google Sheets. Include an unsubscribe option in what you send, and point people to the email switch on their member page.</p></section>
    <div class="tw" style="margin-top:18px"><table class="m"><thead><tr><th>Name</th><th>Email</th><th>Last registered</th></tr></thead><tbody>
      ${included.slice(0, 12).map(u => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${esc(labelFromId(lastIn(u)))}</td></tr>`).join('')}
      ${included.length > 12 ? `<tr><td colspan="3" class="hint">…and ${included.length - 12} more</td></tr>` : ''}
      ${included.length ? '' : '<tr><td colspan="3" class="hint">No members yet.</td></tr>'}</tbody></table></div>`;

  acts(v, {
    async copy() {
      const text = included.map(u => u.email).join(', ');
      try { await navigator.clipboard.writeText(text); }
      catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
      toast(`Copied ${included.length} emails.`);
    },
    csv() {
      const q = s => `"${String(s).replace(/"/g, '""')}"`;
      const rows = [['name', 'email', 'last registered'], ...included.map(u => [u.name, u.email, labelFromId(lastIn(u))])].map(r => r.map(q).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }));
      a.download = `club-emails-${termId(ctx.term)}.csv`; a.click(); URL.revokeObjectURL(a.href);
    }
  });
}

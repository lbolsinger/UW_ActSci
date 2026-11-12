// Mock interviews: create sessions, see who registered, add feedback.
import { session } from '../session.js';
import { F, col, ref, watch, where, stamp } from '../db.js';
import { esc, fresh, acts, bindWidgets, collect, badge, toast, fmtLong, fmtTime } from '../ui.js';
import { termId } from '../terms.js';

export async function render(root, ctx) {
  const v = fresh(root); bindWidgets(v);
  const tid = termId(ctx.term);
  let sessions = [], regs = [];
  v.innerHTML = `
    <section class="card" style="margin-bottom:18px"><div class="sec-h">New session</div>
      <form id="sf" class="two-f" novalidate>
        <div class="field"><label>Date and time <span class="req">*</span></label><input type="datetime-local" name="start"></div>
        <div class="field"><label>Location <span class="req">*</span></label><input type="text" name="location" maxlength="120" placeholder="e.g. MC 5069"></div>
        <div class="field"><label>Interviewer</label><input type="text" name="interviewerName" maxlength="100" value="${esc(session.displayName)}"></div>
        <div class="field" style="align-self:end"><button class="btn primary" type="submit">Add session</button></div></form></section>
    <div id="slist"></div>`;

  function draw() {
    const el = v.querySelector('#slist');
    if (el.contains(document.activeElement) && document.activeElement.matches('input,textarea')) return;
    el.innerHTML = [...sessions].sort((a, b) => a.start.localeCompare(b.start)).map(s => {
      const rs = regs.filter(r => r.sessionId === s.id);
      return `<section class="card" style="margin-bottom:14px" data-sid="${esc(s.id)}"><div class="row-top"><div><h3>${esc(fmtLong(new Date(s.start)))} · ${esc(fmtTime(new Date(s.start)))}</h3>
        <div class="hint">${esc(s.location)}${s.interviewerName ? ' · ' + esc(s.interviewerName) : ''} · ${rs.length} registered</div></div>
        <div>${s.closed ? badge('Full', 'b-exp') : badge('Open', 'b-paid')} <a class="btn sm" href="#" data-act="toggle">${s.closed ? 'Reopen' : 'Mark full'}</a> <a class="btn sm" href="#" data-act="del">Delete</a></div></div>
        ${rs.map(r => `<div class="reg" data-rid="${esc(r.id)}" style="border-top:1px solid var(--line);padding-top:10px;margin-top:10px"><b>${esc(r.name)}</b> <span class="hint">${esc(r.email)}</span>
          <div class="two-f" style="margin-top:8px"><div class="field"><label>Feedback</label><textarea name="feedback" maxlength="2000">${esc(r.feedback || '')}</textarea></div>
          <div class="field"><label>Link to a feedback file (optional)</label><input type="url" name="link" value="${esc(r.feedbackLink || '')}"><a class="btn sm" href="#" data-act="fb" style="margin-top:8px;display:inline-block">Save feedback</a></div></div></div>`).join('')}
        ${rs.length ? '' : '<p class="hint" style="margin:8px 0 0">No registrations yet.</p>'}</section>`;
    }).join('') || '<p class="hint">No sessions yet. Add one above.</p>';
  }

  v.querySelector('#sf').addEventListener('submit', async e => {
    e.preventDefault();
    const d = collect(e.target);
    if (!d.start || !d.location) return toast('Add a date, time and location.', 'err');
    await F.addDoc(col('mockSessions'), { termId: tid, start: d.start, location: d.location, interviewerName: d.interviewerName || '', closed: false, createdAt: stamp() });
    e.target.reset(); e.target.querySelector('[name=interviewerName]').value = session.displayName; toast('Session added.');
  });
  const sid = el => el.closest('[data-sid]').dataset.sid;
  acts(v, {
    async toggle(el) { const s = sessions.find(x => x.id === sid(el)); await F.updateDoc(ref('mockSessions', s.id), { closed: !s.closed }); },
    async del(el) { if (confirm('Delete this session? Registrations for it will no longer show up.')) await F.deleteDoc(ref('mockSessions', sid(el))); },
    async fb(el) {
      const box = el.closest('.reg'), id = box.dataset.rid;
      const text = box.querySelector('[name=feedback]').value.trim(), link = box.querySelector('[name=link]').value.trim();
      if (!text) return toast('Write some feedback first.', 'err');
      if (link && !/^https?:\/\//i.test(link)) return toast('The link should start with https://', 'err');
      await F.updateDoc(ref('mockRegistrations', id), { feedback: text, feedbackLink: link, feedbackByName: session.displayName, feedbackByEmail: session.email, feedbackAt: stamp() });
      toast('Feedback saved. The member can see it now.');
    }
  });
  ctx.onCleanup(watch(col('mockSessions'), [where('termId', '==', tid)], d => { sessions = d; draw(); }));
  ctx.onCleanup(watch(col('mockRegistrations'), [where('termId', '==', tid)], d => { regs = d; draw(); }));
}

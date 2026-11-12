// Mock interviews, member side: register for a session, read feedback, rate it.
import { session } from '../session.js';
import { F, col, ref, list, read, stamp, where } from '../db.js';
import { esc, fresh, acts, bindWidgets, badge, starPicker, toast, fmtLong, fmtTime } from '../ui.js';
import { termId } from '../terms.js';

export async function render(el, ctx) {
  const v = fresh(el); bindWidgets(v);
  const uid = session.user.uid, tid = termId(ctx.term);
  const [sessions, regs] = await Promise.all([
    list(col('mockSessions'), where('termId', '==', tid)),
    list(col('mockRegistrations'), where('uid', '==', uid))
  ]);
  const regOf = Object.fromEntries(regs.map(r => [r.sessionId, r]));
  const ratings = {};
  for (const r of regs.filter(r => r.feedback)) ratings[r.id] = await read('ratings', `mock_${r.id}`);
  sessions.sort((a, b) => a.start.localeCompare(b.start));
  const now = new Date();
  const upcoming = sessions.filter(s => new Date(s.start) >= now || regOf[s.id] && !regOf[s.id].feedback);
  const past = sessions.filter(s => !upcoming.includes(s) && regOf[s.id]);

  const when = s => `${fmtLong(new Date(s.start))} · ${fmtTime(new Date(s.start))}`;
  v.innerHTML = `
    <div class="row-top"><h3>Mock interviews</h3></div>
    ${upcoming.length ? upcoming.map(s => {
      const r = regOf[s.id];
      return `<div class="row-top" style="border-top:1px solid var(--line);padding-top:10px">
        <div><b>${esc(when(s))}</b><div class="hint">${esc(s.location || 'Location to be announced')}${s.interviewerName ? ' · Interviewer: ' + esc(s.interviewerName) : ''}</div></div>
        <div>${r ? badge('Registered', 'b-wait') + ` <a class="btn sm" href="#" data-act="cancel" data-id="${esc(s.id)}">Cancel</a>`
          : s.closed ? badge('Full', 'b-exp') : `<a class="btn primary sm" href="#" data-act="register" data-id="${esc(s.id)}">Register</a>`}</div></div>`;
    }).join('') : '<p class="hint" style="margin:0">No sessions are scheduled yet. Check back soon.</p>'}
    ${regs.some(r => r.feedback) ? `<div style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px">
      <div class="lbl">Your feedback</div>
      ${regs.filter(r => r.feedback).map(r => {
        const s = sessions.find(x => x.id === r.sessionId);
        return `<div class="cmt"><small>${esc(s ? when(s) : 'Mock interview')} · from ${esc(r.feedbackByName || 'your interviewer')}${r.feedbackLink ? ` · <a href="${esc(r.feedbackLink)}" target="_blank" rel="noopener noreferrer">attached feedback</a>` : ''}</small>${esc(r.feedback)}</div>
          <div class="rate-row" style="border:0;padding-top:0;margin:0 0 12px"><b>Rate this session</b>${starPicker('stars-' + r.id, ratings[r.id]?.stars || 0)}<a class="btn sm" href="#" data-act="rate" data-id="${esc(r.id)}">Save rating</a></div>`;
      }).join('')}</div>` : ''}`;

  acts(v, {
    async register(el2) {
      const s = sessions.find(x => x.id === el2.dataset.id);
      await F.setDoc(ref('mockRegistrations', `${s.id}_${uid}`), {
        sessionId: s.id, uid, termId: tid, name: session.displayName, email: session.email, sessionStart: s.start, createdAt: stamp()
      });
      toast('You\'re registered.'); render(el, ctx);
    },
    async cancel(el2) {
      await F.deleteDoc(ref('mockRegistrations', `${el2.dataset.id}_${uid}`));
      toast('Registration cancelled.'); render(el, ctx);
    },
    async rate(el2) {
      const r = regs.find(x => x.id === el2.dataset.id);
      const stars = +v.querySelector(`[data-name="stars-${r.id}"]`).dataset.value;
      if (!stars) return toast('Tap a star to choose a rating.', 'err');
      await F.setDoc(ref('ratings', `mock_${r.id}`), {
        kind: 'mock', refId: r.id, reviewerEmail: r.feedbackByEmail || '', reviewerName: r.feedbackByName || '', stars, comment: '', updatedAt: stamp()
      });
      toast('Thanks for the feedback.');
    }
  });
}

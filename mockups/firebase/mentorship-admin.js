// Mentorship: see who needs a match, suggest mentors, create and remove pairs.
import { F, col, ref, read, watch, where, batch, stamp } from '../db.js';
import { esc, fresh, acts, badge, toast } from '../ui.js';
import { termId } from '../terms.js';

export async function render(root, ctx) {
  const v = fresh(root);
  const tid = termId(ctx.term), max = ctx.portal.mentorMaxMentees, years = ctx.portal.years;
  let profiles = [], pairs = [], selected = null;
  v.innerHTML = `<div class="stats" id="mstats"></div><div class="cols2"><div id="mentees"></div><aside id="suggest"></aside></div>
    <section class="card" style="margin-top:18px"><div class="sec-h">Current pairs</div><div id="pairs"></div></section>`;

  const tags = (list, cls = '') => (list || []).map(x => `<span class="mtag ${cls}">${esc(x)}</span>`).join('');
  const mentors = () => profiles.filter(p => p.role === 'mentor'), mentees = () => profiles.filter(p => p.role === 'mentee');
  const matched = new Set();
  const room = m => m.capacity - m.menteeCount;

  function draw() {
    matched.clear(); pairs.forEach(p => matched.add(p.menteeUid));
    const waiting = mentees().filter(m => !matched.has(m.uid));
    v.querySelector('#mstats').innerHTML = `
      <div class="stat"><b>${mentees().length}</b><span>Mentees</span></div><div class="stat hl"><b>${waiting.length}</b><span>Mentees without a mentor</span></div>
      <div class="stat"><b>${mentors().length}</b><span>Mentors</span></div><div class="stat"><b>${mentors().filter(m => room(m) > 0).length}</b><span>Mentors with room</span></div>`;
    v.querySelector('#mentees').innerHTML = `<div class="lbl" style="margin-bottom:8px">Mentees waiting for a match</div>` + (waiting.length ? waiting.map(m => `
      <div class="pcb ${m.uid === selected ? 'sel' : ''}" data-uid="${esc(m.uid)}"><div class="hd"><div><b>${esc(m.name)}</b><small>${esc(m.year)} · ${m.workTerm === 'coop' ? 'on co-op' : 'on study'}</small></div></div>${tags(m.interests)}
      <div class="hint" style="margin-top:8px">${esc(m.goals || '')}</div></div>`).join('') : '<p class="hint">Everyone has a mentor.</p>');
    const sel = waiting.find(m => m.uid === selected);
    v.querySelector('#suggest').innerHTML = sel ? `<div class="lbl" style="margin-bottom:8px">Suggested mentors for ${esc(sel.name)}</div>${suggestions(sel)}
      <p class="hint">Each mentor can take up to ${max} mentees, and never more than the number they chose. Matches are suggestions. You choose the pair, and both people can then see each other's mentorship profile.</p>`
      : '<p class="hint">Select a mentee to see suggested mentors.</p>';
    v.querySelector('#pairs').innerHTML = pairs.length ? `<table class="m"><thead><tr><th>Mentor</th><th>Mentee</th><th></th></tr></thead><tbody>${pairs.map(p => `<tr data-pid="${esc(p.id)}"><td>${esc(p.mentorName)}</td><td>${esc(p.menteeName)}</td><td style="text-align:right"><a href="#" data-act="unpair" class="hint">Unpair</a></td></tr>`).join('')}</tbody></table>` : '<p class="hint" style="margin:0">No pairs yet.</p>';
  }

  function suggestions(mentee) {
    const yi = y => years.indexOf(y);
    const scored = mentors().filter(m => room(m) > 0 && m.uid !== mentee.uid).map(m => {
      const shared = (m.interests || []).filter(i => (mentee.interests || []).includes(i));
      const reasons = [...shared.map(i => `${i} interest`), ...(yi(m.year) > yi(mentee.year) ? ['Higher year'] : []), ...(m.meet === mentee.meet || m.meet === 'Either' || mentee.meet === 'Either' ? ['Meeting style fits'] : [])];
      return { m, reasons, score: shared.length * 3 + (yi(m.year) > yi(mentee.year) ? 2 : 0) + (reasons.includes('Meeting style fits') ? 1 : 0) };
    }).sort((a, b) => b.score - a.score).slice(0, 5);
    return scored.length ? scored.map(({ m, reasons }) => `<div class="pcb" style="cursor:default"><div class="hd"><div><b>${esc(m.name)}</b><small>${esc(m.year)} · ${m.menteeCount} of ${m.capacity} mentees</small></div>
      <a class="btn primary sm" href="#" data-act="pair" data-mentor="${esc(m.uid)}">Pair</a></div>${tags(reasons, 'match')}<div class="hint" style="margin-top:8px">${esc(m.coop || '')}</div></div>`).join('')
      : '<p class="hint">No mentors with room right now.</p>';
  }

  v.addEventListener('click', e => { const c = e.target.closest('.pcb[data-uid]'); if (c) { selected = c.dataset.uid; draw(); } });
  acts(v, {
    async pair(el) {
      const mentorUid = el.dataset.mentor, menteeUid = selected, id = `${tid}_${mentorUid}_${menteeUid}`;
      const mentor = await read('mentorProfiles', `${mentorUid}_${tid}`), mentee = profiles.find(p => p.uid === menteeUid);
      if (mentor.menteeCount >= Math.min(mentor.capacity, max)) return toast(`${mentor.name} already has ${mentor.menteeCount} mentee${mentor.menteeCount === 1 ? '' : 's'}, their limit.`, 'err');
      const b = batch();
      b.set(ref('pairings', id), { termId: tid, mentorUid, menteeUid, mentorName: mentor.name, menteeName: mentee.name, createdAt: stamp() });
      b.update(ref('mentorProfiles', `${mentorUid}_${tid}`), { menteeCount: mentor.menteeCount + 1 });
      await b.commit(); selected = null; toast(`${mentor.name} and ${mentee.name} are paired.`);
    },
    async unpair(el) {
      const p = pairs.find(x => x.id === el.closest('[data-pid]').dataset.pid);
      if (!confirm(`Unpair ${p.mentorName} and ${p.menteeName}?`)) return;
      const mentor = await read('mentorProfiles', `${p.mentorUid}_${tid}`);
      const b = batch(); b.delete(ref('pairings', p.id)); b.update(ref('mentorProfiles', `${p.mentorUid}_${tid}`), { menteeCount: Math.max(0, mentor.menteeCount - 1) });
      await b.commit(); toast('Unpaired.');
    }
  });
  ctx.onCleanup(watch(col('mentorProfiles'), [where('termId', '==', tid)], d => { profiles = d; draw(); }));
  ctx.onCleanup(watch(col('pairings'), [where('termId', '==', tid)], d => { pairs = d; draw(); }));
}

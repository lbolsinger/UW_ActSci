// Mentorship, member side: sign up as a mentor or mentee, and see the person you're paired with.
import { session } from '../session.js';
import { F, col, ref, list, read, stamp, where, batch } from '../db.js';
import { esc, fresh, acts, bindWidgets, collect, seg, chips, badge, toast, initials } from '../ui.js';
import { termId, termLabel } from '../terms.js';

export async function render(el, ctx) {
  const v = fresh(el); bindWidgets(v);
  const uid = session.user.uid, tid = termId(ctx.term), max = ctx.portal.mentorMaxMentees;
  const mine = await read('mentorProfiles', `${uid}_${tid}`);
  const p = session.profile;

  const fields = (m = {}, locked = false) => `
    <div class="share"><b>Who sees this?</b> Only execs and the people you're matched with. It is separate from your public directory profile.</div>
    <div class="field"><span class="lbl">I want to be a <span class="req">*</span></span>${locked ? `<b>${m.role === 'mentor' ? 'Mentor' : 'Mentee'}</b> <span class="hint">(to change this, ask an exec)</span>` : seg('role', [['mentee', 'Mentee'], ['mentor', 'Mentor']], m.role || 'mentee')}</div>
    <div class="two-f"><div class="field"><label>Year of study <span class="req">*</span></label>
      <select name="year">${ctx.portal.years.map(y => `<option ${y === (m.year || p.year) ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select></div>
      <div class="field"><span class="lbl">Work term status <span class="req">*</span></span>${seg('workTerm', [['study', 'On study'], ['coop', 'On co-op']], m.workTerm || p.workTerm)}</div></div>
    <div class="field"><span class="lbl">Areas of interest <span class="req">*</span></span>${chips('interests', ctx.portal.mentorInterests, m.interests || [])}</div>
    <div class="field"><label>Co-op experience <span class="req">*</span></label><textarea name="coop" maxlength="1000">${esc(m.coop ?? p.coopExperience ?? '')}</textarea><small>Filled in from your profile. Editing it here changes it for this program only.</small></div>
    <div class="field"><label><span class="goal-label">${m.role === 'mentor' ? 'What can you offer a mentee?' : 'What do you want from a mentor?'}</span> <span class="req">*</span></label><textarea name="goals" maxlength="1000">${esc(m.goals || '')}</textarea></div>
    <div class="field"><label>LinkedIn <span class="req">*</span></label><input name="linkedin" type="url" maxlength="300" value="${esc(m.linkedin ?? p.linkedin ?? '')}"></div>
    <div class="two-f"><div class="field"><span class="lbl">Prefer to meet</span>${seg('meet', [['In person', 'In person'], ['Virtual', 'Virtual'], ['Either', 'Either']], m.meet || 'Either')}</div>
      <div class="field"><label>Availability</label><input name="availability" type="text" maxlength="200" value="${esc(m.availability || '')}" placeholder="e.g. weekday evenings"></div></div>
    <div class="field mentor-only ${(m.role || 'mentee') === 'mentor' ? '' : 'hidden'}"><span class="lbl">How many mentees can you take? <span class="req">*</span></span>
      ${seg('capacity', Array.from({ length: max }, (_, i) => [String(i + 1), String(i + 1)]), String(m.capacity > 1 || m.role === 'mentor' ? m.capacity : 2))}<small>Up to ${max} mentees per mentor.</small></div>
    <div class="notice mentor-only ${(m.role || 'mentee') === 'mentor' ? '' : 'hidden'}">Mentors get a <span class="badge b-ok">Mentor</span> mark on their member directory profile, if they're listed there, so other members can find them.</div>`;

  const needed = d => {
    if (!d.interests?.length) return 'Choose at least one area of interest.';
    if (!d.coop) return 'Tell us about your co-op experience (write "none yet" if that applies).';
    if (!d.goals) return 'Tell us what you want from the program.';
    if (!/^https?:\/\//i.test(d.linkedin || '')) return 'LinkedIn is needed for pairing. Paste the link starting with https://';
    return '';
  };

  if (!mine) {
    v.innerHTML = `<div class="row-top"><h3>Mentorship program</h3></div>
      <p>Tell us a bit about yourself so we can find a good match. Fields marked <span class="req">*</span> are needed for pairing.</p>
      <form id="mf" novalidate>${fields()}<button class="btn primary" type="submit">Join mentorship</button></form>`;
  } else {
    const partners = await findPartners(uid, tid, mine.role);
    v.innerHTML = `<div class="row-top"><h3>Mentorship</h3>${badge(`${mine.role === 'mentor' ? 'Mentor' : 'Mentee'} · ${termLabel(ctx.term)}`, 'b-ok')}</div>
      <div class="sec-h" style="font-size:1rem">${mine.role === 'mentor' ? `Your mentees <span class="hint" style="font-weight:400">(${mine.menteeCount} of ${mine.capacity})</span>` : 'Your mentor'}</div>
      ${partners.length ? `<div class="dgrid">${partners.map(card).join('')}</div>`
        : `<p class="hint" style="margin:0">${mine.role === 'mentor' ? 'No mentees yet.' : "You haven't been matched yet."} The mentorship team will pair you up and you'll see their profile here.</p>`}
      <p class="hint" style="margin:12px 0 0">Your partner can see your mentorship profile too. <a href="#" data-act="edit">Edit it</a></p>
      <form id="mf" class="hidden" novalidate style="margin-top:14px">${fields(mine, true)}<button class="btn primary" type="submit">Save changes</button></form>`;
  }

  const f = v.querySelector('#mf');
  v.addEventListener('click', e => {   // show or hide the mentor-only fields when the role changes
    if (!e.target.closest('[data-name="role"]')) return;
    queueMicrotask(() => {
      const mentor = f.querySelector('[data-name="role"] .on')?.dataset.val === 'mentor';
      f.querySelectorAll('.mentor-only').forEach(x => x.classList.toggle('hidden', !mentor));
      f.querySelector('.goal-label').textContent = mentor ? 'What can you offer a mentee?' : 'What do you want from a mentor?';
    });
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const d = collect(f);
    const problem = needed(d); if (problem) return toast(problem, 'err');
    const base = {
      name: session.displayName, year: d.year, workTerm: d.workTerm, interests: d.interests, coop: d.coop, goals: d.goals,
      linkedin: d.linkedin, meet: d.meet || 'Either', availability: d.availability || ''
    };
    if (!mine) {
      const role = d.role || 'mentee';
      await F.setDoc(ref('mentorProfiles', `${uid}_${tid}`), {
        uid, email: session.email, termId: tid, role, ...base, capacity: role === 'mentor' ? +d.capacity || 2 : 1, menteeCount: 0, createdAt: stamp()
      });
      // The directory mark can only be set after the mentor profile exists.
      if (role === 'mentor' && p.directoryVisible) { try { await F.updateDoc(ref('directory', uid), { isMentor: true, updatedAt: stamp() }); } catch (err) { console.warn(err); } }
      toast(role === 'mentor' ? 'You\'re signed up as a mentor.' : 'You\'re signed up. We\'ll find you a mentor.');
    } else {
      const cap = mine.role === 'mentor' ? Math.max(+d.capacity || mine.capacity, mine.menteeCount) : 1;
      await F.updateDoc(ref('mentorProfiles', `${uid}_${tid}`), { ...base, capacity: cap });
      toast('Saved.');
    }
    render(el, ctx);
  });
  acts(v, { edit() { f.classList.toggle('hidden'); } });
}

async function findPartners(uid, tid, role) {
  const field = role === 'mentor' ? 'mentorUid' : 'menteeUid', other = role === 'mentor' ? 'menteeUid' : 'mentorUid';
  const pairs = await list(col('pairings'), where('termId', '==', tid), where(field, '==', uid));
  const profiles = await Promise.all(pairs.map(x => read('mentorProfiles', `${x[other]}_${tid}`)));
  return profiles.filter(Boolean);
}

const card = m => `<div class="pcard"><div class="hd"><span class="av">${esc(initials(m.name))}</span><div><span class="nm">${esc(m.name)}</span><span class="yr">${esc(m.year)}</span></div></div>
  ${m.coop ? `<p><b>Co-op:</b> ${esc(m.coop)}</p>` : ''}
  <p><b>Interested in:</b> ${esc((m.interests || []).join(', '))}</p>
  ${m.goals ? `<p><b>${m.role === 'mentor' ? 'Can offer' : 'Wants'}:</b> ${esc(m.goals)}</p>` : ''}
  <p><b>Likes to meet:</b> ${esc(m.meet || 'Either')}${m.availability ? ' · ' + esc(m.availability) : ''}</p>
  <p><a href="${esc(m.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn</a> · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></p></div>`;

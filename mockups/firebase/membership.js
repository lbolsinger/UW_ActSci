// "My membership": registration, renewal, details, public profile, email preference.
import { session, reload } from '../session.js';
import { read, list, col, ref, db, F, stamp, where, batch } from '../db.js';
import { esc, fresh, acts, bindWidgets, collect, seg, chips, toggle, badge, toast, toDate, fmtDay, fmtTime } from '../ui.js';
import { termId, termLabel, labelFromId, termOrder } from '../terms.js';
import { isOpen, selfCheckIn } from '../checkin-core.js';
import { signOut } from '../auth.js';

export async function render(root, ctx) {
  const v = fresh(root);
  bindWidgets(v);
  if (!session.profile) return registration(v, ctx);
  await dashboard(v, ctx);
}

/* ------------------------------------------------------------------ pieces */
const yearSelect = (years, sel) =>
  `<select name="year">${years.map(y => `<option ${y === sel ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select>`;

function detailsFields(ctx, p = {}) {
  return `
    <div class="field"><label for="f-name">Your name <span class="req">*</span></label>
      <input id="f-name" name="name" type="text" value="${esc(p.name || '')}" maxlength="100" autocomplete="name"></div>
    <div class="two-f">
      <div class="field"><label for="f-year">Year of study <span class="req">*</span></label>${yearSelect(ctx.portal.years, p.year || ctx.portal.years[0])}</div>
      <div class="field"><span class="lbl">Work term status <span class="req">*</span></span>${seg('workTerm', [['study', 'On study'], ['coop', 'On co-op']], p.workTerm || 'study')}</div>
    </div>
    <div class="field"><label for="f-diet">Dietary restrictions</label>
      <textarea id="f-diet" name="dietary" maxlength="300">${esc(p.dietary || '')}</textarea><small>Used for event food orders.</small></div>`;
}

function publicFields(ctx, p = {}) {
  return `
    <div class="notice">Everything in this section appears in the member directory and can be seen by other members who are signed in. It's optional, and you can leave any of it blank. Don't add anything you wouldn't want other members to read.</div>
    <div class="field"><label for="f-li">LinkedIn</label><input id="f-li" name="linkedin" type="url" placeholder="https://linkedin.com/in/…" value="${esc(p.linkedin || '')}" maxlength="300"></div>
    <div class="field"><label for="f-coop">Previous co-op experience</label><textarea id="f-coop" name="coopExperience" maxlength="1000">${esc(p.coopExperience || '')}</textarea></div>
    <div class="field"><span class="lbl">Exams passed</span>${chips('exams', ctx.portal.exams, p.exams || [])}</div>
    <div class="prefrow rule"><div><b>Show me in the member directory</b><div class="hint">Shows your name, year and the details above to signed-in members. Turn off to hide yourself completely.</div></div>${toggle('directoryVisible', !!p.directoryVisible)}</div>`;
}

const clean = (d, keys) => Object.fromEntries(keys.map(k => [k, d[k]]));

function validate(d) {
  if (!d.name) return 'Please enter your name.';
  if (!d.year) return 'Please choose your year of study.';
  if (!d.workTerm) return 'Please choose your work term status.';
  if (d.linkedin && !/^https?:\/\//i.test(d.linkedin)) return 'The LinkedIn link should start with https://';
  return '';
}

/* ------------------------------------------------------------ registration */
function registration(v, ctx) {
  const office = ctx.data.site.office;
  v.innerHTML = `
  <div class="portal-narrow wide"><form class="card" id="reg" novalidate>
    <h2>Welcome! Register for ${esc(termLabel(ctx.term))}</h2>
    <p>You're signed in as <b>${esc(session.email)}</b>. Tell us a bit about yourself to join the club.</p>
    ${detailsFields(ctx)}
    <h3 style="margin-top:22px">Tell us more <span class="pub">Public to club members</span></h3>
    ${publicFields(ctx)}
    <div class="prefrow rule"><div><b>Send me club emails</b><div class="hint">Event announcements and sponsor opportunities. You can turn this off any time.</div></div>${toggle('emailOptIn', true)}</div>
    <div class="share"><b>Who sees what?</b> Execs can see everything you enter here. Other members see only what's in the "Tell us more" section, and only if you leave the directory switch on. Your payment details are only ever seen by execs.</div>
    <div class="share"><b>The club fee:</b> after you register, pay in cash${office ? ` at the club office (${esc(office)})` : ''} or through WUSA. An exec will confirm your payment here.</div>
    <button class="btn primary" type="submit">Register for ${esc(termLabel(ctx.term))}</button>
  </form></div>`;
  const form = v.querySelector('#reg');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const d = collect(form);
    const problem = validate(d);
    if (problem) return toast(problem, 'err');
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const uid = session.user.uid, tid = termId(ctx.term);
      const b = batch();
      b.set(ref('users', uid), {
        uid, email: session.email, ...clean(d, ['name', 'year', 'workTerm', 'dietary', 'linkedin', 'coopExperience', 'exams']),
        directoryVisible: !!d.directoryVisible, emailOptIn: !!d.emailOptIn, lastTermId: tid, createdAt: stamp()
      });
      b.set(ref('memberships', `${uid}_${tid}`), {
        uid, email: session.email, termId: tid, ...clean(d, ['name', 'year', 'workTerm', 'dietary']), paid: false, registeredAt: stamp()
      });
      if (d.directoryVisible) b.set(ref('directory', uid), directoryDoc(uid, d, tid, false));
      await b.commit();
      await reload();
      toast('You\'re registered!');
      ctx.rerender();
    } catch (err) { console.error(err); btn.disabled = false; toast(err.code === 'permission-denied' ? 'Registration was blocked. Make sure you signed in with your @uwaterloo.ca email.' : (err.message || 'Could not register.'), 'err'); }
  });
}

const directoryDoc = (uid, d, tid, isMentor) => ({
  uid, name: d.name, year: d.year, linkedin: d.linkedin || '', coopExperience: d.coopExperience || '',
  exams: d.exams || [], isMentor: !!isMentor, termId: tid, updatedAt: stamp()
});

/* --------------------------------------------------------------- dashboard */
const methodText = a => a.method === 'exec' ? `Marked by ${a.by || 'an exec'}` : a.method === 'qr' ? 'Signed in with the door code' : 'Signed in on phone';

async function dashboard(v, ctx) {
  const uid = session.user.uid, tid = termId(ctx.term), p = session.profile;
  const [mems, atts, mentor] = await Promise.all([
    list(col('memberships'), where('uid', '==', uid)),
    list(col('attendance'), where('uid', '==', uid)),
    read('mentorProfiles', `${uid}_${tid}`)
  ]);
  mems.sort((a, b) => termOrder(b.termId) - termOrder(a.termId));
  const current = mems.find(m => m.termId === tid);
  const attended = new Set(atts.map(a => a.eventId));
  const thisTermAtt = atts.filter(a => a.termId === tid).sort((a, b) => (toDate(b.at) || 0) - (toDate(a.at) || 0));

  const openEvents = current?.paid
    ? ctx.data.events.filter(e => !attended.has(e.id) && isOpen(e, ctx.portal.checkInOpensMinutesBefore)) : [];
  const prompts = openEvents.map(e => {
    const start = e.allDay ? 'today' : `at ${fmtTime(new Date(`${e.start}T${e.startTime}`))}`;
    return `<div class="prompt"><div><b>${esc(e.title)} is on now</b><span>${esc(start)}${e.location ? ', ' + esc(e.location) : ''}. Sign in and you'll be marked present.</span></div><a class="btn primary" href="#" data-act="checkin" data-event="${esc(e.id)}">Sign in to this event</a></div>`;
  }).join('');

  const office = ctx.data.site.office;
  const status = !current
    ? `<div class="alert"><b>You haven't registered for ${esc(termLabel(ctx.term))} yet.</b>Renew your membership to take part in this term's events and programs.</div>`
    : current.paid ? '' : `<div class="alert"><b>You're registered for ${esc(termLabel(ctx.term))}.</b>Pay in cash${office ? ` at the club office (${esc(office)})` : ''} or through WUSA. An exec will confirm your payment here once they receive it.</div>`;

  const hist = [
    !current ? `<li><div><b>${esc(termLabel(ctx.term))}</b><div class="hint">Not registered</div></div><a class="btn primary sm" href="#" data-act="renew">Renew for ${esc(termLabel(ctx.term))}</a></li>` : '',
    ...mems.map(m => `<li><div><b>${esc(labelFromId(m.termId))}</b>${m.termId === tid ? `<div class="hint">Registered ${esc(fmtDay(toDate(m.registeredAt)))}</div>` : ''}</div>${
      m.termId === tid ? (m.paid ? badge('Paid', 'b-paid') : badge('Awaiting payment', 'b-wait')) : badge('Expired', 'b-exp')}</li>`)
  ].join('');

  v.innerHTML = `
  ${prompts}${status}
  <div class="prof">
    <div class="stack">
      <section class="card"><div class="sec-h">Membership</div><ul class="hist">${hist}</ul>
        <p class="hint" style="margin:12px 0 0">A new term means a new registration. Your details carry over, so renewing takes one click.</p></section>
      <section class="card"><div class="sec-h">Events attended <span class="hint" style="font-weight:400">· ${esc(termLabel(ctx.term))}</span></div>
        ${thisTermAtt.length ? `<ul class="att">${thisTermAtt.map(a => `<li><span class="ck">✓</span><div><b>${esc(a.eventTitle || a.eventId)}</b><small>${esc(fmtDay(toDate(a.at)))} · ${esc(methodText(a))}${a.method !== 'exec' && toDate(a.at) ? ', ' + esc(fmtTime(toDate(a.at))) : ''}</small></div></li>`).join('')}</ul>`
          : '<p class="hint" style="margin:0">Nothing yet. Events you attend will show up here.</p>'}</section>
      <section class="card"><div class="sec-h">Email</div>
        <div class="prefrow"><div><b>Send me club emails</b><div class="hint">Event announcements and sponsor opportunities. Turn this off any time.</div></div>${toggle('emailOptIn', p.emailOptIn !== false, 'emailpref')}</div></section>
      <section class="card"><div class="sec-h">Account</div><p style="margin:0">${esc(session.email)}</p>
        <p class="hint" style="margin:6px 0 0"><a href="#" data-act="signout">Sign out</a> · <a href="#" data-act="delreq">Request account deletion</a></p></section>
    </div>
    <div class="stack"><form id="profile-form" class="stack" novalidate>
      <section class="card"><div class="sec-h">Your details this term</div>${detailsFields(ctx, p)}</section>
      <section class="card"><div class="sec-h">Tell us more <span class="pub">Public to club members</span></div>${publicFields(ctx, p)}
        <button class="btn primary" type="submit">Save changes</button></section>
    </form></div>
  </div>`;

  const form = v.querySelector('#profile-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const d = collect(form);
    const problem = validate(d); if (problem) return toast(problem, 'err');
    const b = batch();
    b.update(ref('users', uid), { ...clean(d, ['name', 'year', 'workTerm', 'dietary', 'linkedin', 'coopExperience', 'exams']), directoryVisible: !!d.directoryVisible });
    if (current) b.update(ref('memberships', `${uid}_${tid}`), clean(d, ['name', 'year', 'workTerm', 'dietary']));
    if (d.directoryVisible && current) b.set(ref('directory', uid), directoryDoc(uid, d, tid, mentor?.role === 'mentor'));
    if (!d.directoryVisible) b.delete(ref('directory', uid));
    await b.commit(); await reload();
    toast('Saved.'); ctx.rerender();
  });

  acts(v, {
    async renew() {
      const b = batch();
      b.set(ref('memberships', `${uid}_${tid}`), {
        uid, email: session.email, termId: tid, name: p.name, year: p.year, workTerm: p.workTerm, dietary: p.dietary || '', paid: false, registeredAt: stamp()
      });
      b.update(ref('users', uid), { lastTermId: tid });
      if (p.directoryVisible) b.set(ref('directory', uid), directoryDoc(uid, p, tid, false));
      await b.commit(); await reload();
      toast(`Renewed for ${termLabel(ctx.term)}.`); ctx.rerender();
    },
    async emailpref(el) {
      const on = !el.classList.contains('on');
      el.classList.toggle('on', on); el.setAttribute('aria-checked', on);
      await F.updateDoc(ref('users', uid), { emailOptIn: on });
      session.profile.emailOptIn = on;
      toast(on ? 'You\'ll get club emails.' : 'You won\'t get club emails.');
    },
    async checkin(el) {
      const e = ctx.data.events.find(x => x.id === el.dataset.event);
      await selfCheckIn(e, ctx.term, 'self');
      toast('You\'re signed in!'); ctx.rerender();
    },
    async signout() { await signOut(); location.reload(); },
    async delreq() {
      if (!confirm('Ask the club to delete your account and personal details? An admin will process this.')) return;
      await F.setDoc(ref('deletionRequests', uid), { uid, email: session.email, name: p.name, at: stamp() });
      toast('Deletion requested. An admin will take care of it.');
    }
  });
}

// "My membership": registration, renewal, details, public profile, email preference.
import { session, reload } from '../session.js';
import { read, list, col, ref, db, F, stamp, where, batch } from '../db.js';
import { esc, fresh, acts, bindWidgets, collect, seg, chips, toggle, badge, toast, toDate, fmtDay, fmtTime } from '../ui.js';
import { termId, termLabel, labelFromId, termOrder } from '../terms.js';
import { isOpen, selfCheckIn } from '../checkin-core.js';
import { regConfig, queueState, eventKey, eventStart, eventEnd, eventQueues, payWarning } from '../eventreg.js';
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

const SECONDARY_DESIGNATIONS = new Set(['CERA', 'MAAA']);

function coveredByDesignation(tracks) {
  const asa = tracks['SOA (ASA)'] || [];
  const fsa = tracks['SOA (FSA)'] || [];
  const acas = tracks['CAS (ACAS)'] || [];
  const fcas = tracks['CAS (FCAS)'] || [];
  return {
    ASA: [...asa, 'IFM'],
    FSA: [...asa, ...fsa, 'IFM'],
    ACAS: [...acas, 'IFM'],
    FCAS: [...acas, ...fcas, 'IFM'],
    ACIA: ['P', 'FM', 'IFM', 'ACIA Capstone'],
    FCIA: ['P', 'FM', 'IFM', 'ACIA Capstone', 'FCIA Mod 1', 'FCIA Mod 2', 'FCIA Capstone'],
    CERA: ['P', 'FM', 'IFM', 'ERM']
  };
}

/* Groups the exam tracks for display: "SOA (ASA)" and "SOA (FSA)" become one SOA tab with an
   ASA section and an FSA section. A track with no brackets (like "CIA / Other") is a tab on its own. */
function examGroups(tracks) {
  const groups = new Map();
  for (const [key, exams] of Object.entries(tracks)) {
    const m = key.match(/^(.*?)\s*\((.+)\)$/);
    const group = m ? m[1] : key, sub = m ? m[2] : '';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ sub, exams });
  }
  return [...groups];
}

function credentialsField(ctx, p = {}) {
  const { designations, tracks } = ctx.portal.credentials;
  const groups = examGroups(tracks);
  const selDes = p.credentials || [];
  const selExams = p.exams || [];

  return `
    <div class="field">
      <div class="cred-box" data-cred-widget>
        <div class="cred-top">
          <div>
            <span class="lbl">Credentials &amp; Exams</span>
            <div class="hint">Highlight your earned credentials and completed exams</div>
          </div>
        </div>

        <div data-cred-view>
          <div class="cred-row">
            <span class="cred-rlbl">Credentials</span>
            <div class="chips" data-cred-view-des></div>
          </div>
          <div class="cred-row">
            <span class="cred-rlbl">Exams</span>
            <div class="chips" data-cred-view-exams></div>
          </div>
        </div>

        <!-- Tray 1: Designations only -->
        <div class="cred-picker hidden" data-cred-tray="des">
          <div class="cred-sublbl">
            <span>Select designations</span>
            <button type="button" class="cred-edit-link" data-close-tray="des">Close</button>
          </div>
          <div data-des-group>${chips('credentials', designations, selDes)}</div>
        </div>

        <!-- Tray 2: Exams with track tabs -->
        <div class="cred-picker hidden" data-cred-tray="exams">
          <div class="cred-sublbl" style="margin-bottom:12px">
            <div class="track-Switch">
              ${groups.map(([g], i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-track-btn="${esc(g)}">${esc(g)}</button>`).join('')}
            </div>
            <button type="button" class="cred-edit-link" data-close-tray="exams">Close</button>
          </div>
          ${groups.map(([g, parts], i) => `
            <div class="${i === 0 ? '' : 'hidden'}" data-track-pane="${esc(g)}">
              ${parts.map(({ sub, exams }) => `
                ${sub ? `<div class="cred-grp-lbl" style="font-weight:600;margin:12px 0 6px">${esc(sub)} exams</div>` : ''}
                ${chips('exams', exams, selExams)}`).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
}

function bindCredentials(root, ctx) {
  const box = root.querySelector('[data-cred-widget]');
  if (!box) return;

  const coveredMap = coveredByDesignation(ctx.portal.credentials.tracks);
  const desTray = box.querySelector('[data-cred-tray="des"]');
  const examTray = box.querySelector('[data-cred-tray="exams"]');
  const desGroup = box.querySelector('[data-des-group]');
  const desSummary = box.querySelector('[data-cred-view-des]');
  const examSummary = box.querySelector('[data-cred-view-exams]');

  box.addEventListener('click', e => {
    const chip = e.target.closest('.chip2[data-val]');
    if (!chip || (!desTray.contains(chip) && !examTray.contains(chip))) return;
    requestAnimationFrame(() => {
      const val = chip.dataset.val;
      const isOn = chip.classList.contains('on');
      if (examTray.contains(chip)) {
        examTray.querySelectorAll(`[data-track-pane] .chip2[data-val="${CSS.escape(val)}"]`).forEach(c => {
          c.classList.toggle('on', isOn);
        });
      }
      renderSummary();
    });
  });

  box.querySelectorAll('[data-track-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.trackBtn;
      box.querySelectorAll('[data-track-btn]').forEach(b => b.classList.toggle('on', b === btn));
      box.querySelectorAll('[data-track-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.trackPane !== target));
    });
  });

  box.querySelectorAll('[data-close-tray]').forEach(btn => {
    btn.addEventListener('click', () => {
      const which = btn.dataset.closeTray;
      (which === 'des' ? desTray : examTray).classList.add('hidden');
    });
  });

  function toggleTray(which) {
    if (which === 'des') {
      desTray.classList.toggle('hidden');
      examTray.classList.add('hidden');
    } else {
      examTray.classList.toggle('hidden');
      desTray.classList.add('hidden');
    }
  }

  function renderSummary() {
    const activeDes = [...desGroup.querySelectorAll('.chip2.on[data-val]')].map(c => c.dataset.val);
    const covered = new Set(activeDes.flatMap(d => coveredMap[d] || []));
    const activeExams = [...new Set(
      [...examTray.querySelectorAll('[data-track-pane] .chip2.on[data-val]')].map(c => c.dataset.val)
    )].filter(ex => !covered.has(ex));

    desSummary.innerHTML = activeDes.map(d =>
      `<span class="chip2 ${SECONDARY_DESIGNATIONS.has(d) ? 'des-alt' : 'des'}" data-open-tray="des" title="Click to edit designations" style="cursor:pointer">${esc(d)}</span>`
    ).join('') + `<button type="button" class="chip2 add-Ghost" data-open-tray="des">+ Add</button>`;

    examSummary.innerHTML = activeExams.map(ex =>
      `<span class="chip2 on" data-open-tray="exams" title="Click to edit exams">${esc(ex)}</span>`
    ).join('') + `<button type="button" class="chip2 add-Ghost" data-open-tray="exams">+ Add Exam</button>`;

    box.querySelectorAll('[data-open-tray]').forEach(el => {
      el.addEventListener('click', () => toggleTray(el.dataset.openTray));
    });
  }

  renderSummary();
}

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
    ${credentialsField(ctx, p)}
    <div class="prefrow rule"><div><b>Show me in the member directory</b><div class="hint">Shows your name, year and the details above to signed-in members. Turn off to hide yourself completely.</div></div>${toggle('directoryVisible', p.directoryVisible !== false)}</div>`;
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
  bindCredentials(v, ctx);
  const form = v.querySelector('#reg');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const d = collect(form);
    d.credentials = [...new Set(d.credentials || [])];
    d.exams = [...new Set(d.exams || [])];
    const problem = validate(d);
    if (problem) return toast(problem, 'err');
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const uid = session.user.uid, tid = termId(ctx.term);
      const b = batch();
      b.set(ref('users', uid), {
        uid, email: session.email, ...clean(d, ['name', 'year', 'workTerm', 'dietary', 'linkedin', 'coopExperience', 'credentials', 'exams']),
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
  credentials: [...new Set(d.credentials || [])], exams: [...new Set(d.exams || [])], isMentor: !!isMentor, termId: tid, updatedAt: stamp()
});

/* --------------------------------------------------------------- dashboard */
const methodText = a => a.method === 'exec' ? `Marked by ${a.by || 'an exec'}` : a.method === 'qr' ? 'Signed in with the door code' : 'Signed in on phone';

async function dashboard(v, ctx) {
  const uid = session.user.uid, tid = termId(ctx.term), p = session.profile;
  const [mems, atts, mentor, myRegs] = await Promise.all([
    list(col('memberships'), where('uid', '==', uid)),
    list(col('attendance'), where('uid', '==', uid)),
    read('mentorProfiles', `${uid}_${tid}`),
    list(col('eventRegistrations'), where('uid', '==', uid)).catch(() => [])   // an older database without sign-up just has none
  ]);
  mems.sort((a, b) => termOrder(b.termId) - termOrder(a.termId));
  const current = mems.find(m => m.termId === tid);
  const attended = new Set(atts.map(a => a.eventId));
  const thisTermAtt = atts.filter(a => a.termId === tid).sort((a, b) => (toDate(b.at) || 0) - (toDate(a.at) || 0));

  // Check-in prompt. Unpaid members see it too, but it tells them they have to pay first.
  const minsBefore = ctx.portal.checkInOpensMinutesBefore;
  const openEvents = current ? ctx.data.events.filter(e => !attended.has(e.id) && isOpen(e, minsBefore)) : [];
  const prompts = openEvents.map(e => {
    const start = e.allDay ? 'today' : `at ${fmtTime(new Date(`${e.start}T${e.startTime}`))}`;
    const place = `${esc(start)}${e.location ? ', ' + esc(e.location) : ''}.`;
    return current.paid
      ? `<div class="prompt"><div><b>${esc(e.title)} is on now</b><span>${place} Sign in and you'll be marked present.</span></div><a class="btn primary" href="#" data-act="checkin" data-event="${esc(e.id)}">Sign in to this event</a></div>`
      : `<div class="prompt"><div><b>${esc(e.title)} is on now</b><span>${place} <b>Payment required:</b> you need to pay the club fee before you can sign in.</span></div><a class="btn primary" href="#" data-act="paywarn">Sign in to this event</a></div>`;
  }).join('');

  // Reminders for events you've signed up for that start within two days (the check-in prompt takes over once it opens).
  const regByEvent = new Map(myRegs.map(r => [r.eventId, r]));
  const dayWord = d => { const t0 = new Date(); t0.setHours(0, 0, 0, 0); const n = Math.round((new Date(d).setHours(0, 0, 0, 0) - t0) / 864e5); return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : fmtDay(d); };
  let reminders = '';
  try {
    const nowMs = Date.now();
    const soon = ctx.data.events.filter(e => regByEvent.has(eventKey(e)) && regConfig(e).mode === 'portal' && eventEnd(e) > nowMs
      && eventStart(e) - nowMs <= 48 * 3600e3 && !isOpen(e, minsBefore) && !attended.has(e.id));
    const queues = soon.length ? await eventQueues(soon) : {};
    reminders = soon.map(e => {
      const st = queueState(regConfig(e), queues[eventKey(e)] || []);
      const when = `${dayWord(eventStart(e))}${e.allDay ? '' : ' at ' + fmtTime(eventStart(e))}${e.location ? ', ' + esc(e.location) : ''}.`;
      if (st.mine?.state === 'confirmed') return `<div class="prompt"><div><b>You're registered for ${esc(e.title)}</b><span>${when} Can't make it? Cancel on the Events page so the next person can take your spot.</span></div><a class="btn" href="#account/events">See details</a></div>`;
      if (st.mine?.state === 'waitlisted') return `<div class="prompt"><div><b>You're on the waitlist for ${esc(e.title)} (#${st.mine.position})</b><span>${when} If a spot opens up you move up automatically, and this page will say so.</span></div><a class="btn" href="#account/events">See details</a></div>`;
      return '';
    }).join('');
  } catch (err) { console.warn(err); }

  const office = ctx.data.site.office;
  const status = !current
    ? `<div class="alert"><b>You haven't registered for ${esc(termLabel(ctx.term))} yet.</b>Renew your membership to take part in this term's events and programs.</div>`
    : current.paid ? '' : `<div class="alert"><b>You're registered for ${esc(termLabel(ctx.term))}.</b>Pay in cash${office ? ` at the club office (${esc(office)})` : ''} or through WUSA. An exec will confirm your payment here once they receive it. Programs (mentorship, resume critique, mock interviews) unlock when they do.</div>`;

  const hist = [
    !current ? `<li><div><b>${esc(termLabel(ctx.term))}</b><div class="hint">Not registered</div></div><a class="btn primary sm" href="#" data-act="renew">Renew for ${esc(termLabel(ctx.term))}</a></li>` : '',
    ...mems.map(m => `<li><div><b>${esc(labelFromId(m.termId))}</b>${m.termId === tid ? `<div class="hint">Registered ${esc(fmtDay(toDate(m.registeredAt)))}</div>` : ''}</div>${
      m.termId === tid ? (m.paid ? badge('Paid', 'b-paid') : badge('Awaiting payment', 'b-wait')) : badge('Expired', 'b-exp')}</li>`)
  ].join('');

  v.innerHTML = `
  ${prompts}${reminders}${status}
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

  bindCredentials(v, ctx);

  const form = v.querySelector('#profile-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const d = collect(form);
    d.credentials = [...new Set(d.credentials || [])];
    d.exams = [...new Set(d.exams || [])];
    const problem = validate(d); if (problem) return toast(problem, 'err');
    const b = batch();
    b.update(ref('users', uid), { ...clean(d, ['name', 'year', 'workTerm', 'dietary', 'linkedin', 'coopExperience', 'credentials', 'exams']), directoryVisible: !!d.directoryVisible });
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
    paywarn() { payWarning(office); },
    async signout() { await signOut(); location.reload(); },
    async delreq() {
      if (!confirm('Ask the club to delete your account and personal details? An admin will process this.')) return;
      await F.setDoc(ref('deletionRequests', uid), { uid, email: session.email, name: p.name, at: stamp() });
      toast('Deletion requested. An admin will take care of it.');
    }
  });
}

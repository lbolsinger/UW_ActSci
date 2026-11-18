// "Events": sign up for events, join the waitlist, answer an event's questions, cancel.
import { session } from '../session.js';
import { read } from '../db.js';
import { esc, fresh, acts, bindWidgets, collect, seg, badge, toast, fmtLong, fmtTime } from '../ui.js';
import { termId, termLabel } from '../terms.js';
import { parse } from '../../utils.js';
import {
  regConfig, queueState, signUpStatus, checkAnswers, eventKey, eventStart, eventEnd,
  eventQueues, myRegistrations, signUp, changeAnswers, cancelSignUp
} from '../eventreg.js';

const when = e => `${fmtLong(parse(e.start))}${e.allDay ? ' · All day' : ` · ${fmtTime(eventStart(e))} to ${fmtTime(eventEnd(e))}`}${e.location ? ' · ' + e.location : ''}`;
const deadlineText = d => {
  const endOfDay = d.getHours() === 23 && d.getMinutes() === 59;
  return `${fmtLong(d)}${endOfDay ? '' : ' at ' + fmtTime(d)}`;
};

function questionField(q, val) {
  const name = `q_${q.id}`, lbl = `${esc(q.label)}${q.required ? ' <span class="req">*</span>' : ''}`;
  if (q.type === 'yesno') return `<div class="field"><span class="lbl">${lbl}</span>${seg(name, [['Yes', 'Yes'], ['No', 'No']], val ?? null)}</div>`;
  if (q.type === 'choice') return `<div class="field"><label>${lbl}</label><select name="${name}"><option value="">Choose…</option>${q.options.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
  if (q.type === 'checkbox') return `<div class="field"><label style="display:flex;gap:8px;align-items:flex-start;font-weight:400"><input type="checkbox" name="${name}" ${val ? 'checked' : ''}> <span>${lbl}</span></label></div>`;
  return `<div class="field"><label>${lbl}</label><input type="text" name="${name}" maxlength="300" value="${esc(val || '')}"></div>`;
}
function readAnswers(form, cfg) {
  const d = collect(form), out = {};
  for (const q of cfg.questions) {
    const v = d[`q_${q.id}`];
    if (q.type === 'checkbox') out[q.id] = !!v;
    else if (v !== null && v !== undefined && v !== '') out[q.id] = v;
  }
  return out;
}

export async function render(root, ctx) {
  const v = fresh(root); bindWidgets(v);
  const uid = session.user.uid, tid = termId(ctx.term);
  const membership = await read('memberships', `${uid}_${tid}`);
  if (!membership) {
    v.innerHTML = `<div class="alert"><b>Register for ${esc(termLabel(ctx.term))} first.</b>Event sign-up is for members of the current term. <a href="#account/membership">Go to My membership</a> to renew.</div>`;
    return;
  }
  const now = new Date();
  const events = ctx.data.events.filter(e => regConfig(e).mode === 'portal' && eventEnd(e) >= now)
    .sort((a, b) => eventStart(a) - eventStart(b));
  const byId = Object.fromEntries(events.map(e => [eventKey(e), e]));

  let queues, mine;
  try { [queues, mine] = await Promise.all([eventQueues(events), myRegistrations()]); }
  catch (err) {
    console.error(err);
    v.innerHTML = `<div class="alert err"><b>Event sign-up isn't available yet.</b>If this keeps happening, tell an exec.</div>`;
    return;
  }

  const card = e => {
    const id = eventKey(e), cfg = regConfig(e), st = queueState(cfg, queues[id] || [], now), me = mine.get(id);
    const can = signUpStatus(e, cfg, st, now);
    const lines = [];
    if (cfg.capacity) lines.push(st.full ? `Full · ${st.waitlist.length} on the waitlist` : `${st.confirmed.length} of ${cfg.capacity} spots taken`);
    if (cfg.deadline) lines.push(`Sign up by ${deadlineText(cfg.deadline)}`);
    const form = (btnAct, btnLabel, hidden) => `<form class="regform ${hidden ? 'hidden' : ''}" novalidate style="margin-top:12px">
      ${cfg.questions.map(q => questionField(q, me?.answers?.[q.id])).join('')}
      <button class="btn primary" type="button" data-act="${btnAct}" data-ev="${esc(id)}">${esc(btnLabel)}</button></form>`;

    let status = '', action = '';
    if (st.mine?.state === 'confirmed') {
      status = badge("You're registered ✓", 'b-paid');
      action = `<div class="btnrow">${cfg.questions.length ? `<a class="btn sm" href="#" data-act="edit" data-ev="${esc(id)}">Change my answers</a>` : ''}<a class="btn sm" href="#" data-act="cancel" data-ev="${esc(id)}">Cancel my spot</a></div>${cfg.questions.length ? form('saveanswers', 'Save answers', true) : ''}`;
    } else if (st.mine?.state === 'waitlisted') {
      status = badge(`Waitlist #${st.mine.position}`, 'b-wait');
      action = `<p class="hint" style="margin:0 0 8px">You're on the waitlist. If a spot opens up, you move up automatically and it shows here and on your account page.</p>
        <div class="btnrow">${cfg.questions.length ? `<a class="btn sm" href="#" data-act="edit" data-ev="${esc(id)}">Change my answers</a>` : ''}<a class="btn sm" href="#" data-act="cancel" data-ev="${esc(id)}">Leave the waitlist</a></div>${cfg.questions.length ? form('saveanswers', 'Save answers', true) : ''}`;
    } else if (st.mine?.state === 'late') {
      status = badge('Not counted', 'b-exp');
      action = `<p class="hint" style="margin:0 0 8px">Your sign-up came in after the deadline, so it isn't counted. Ask an exec if you think that's a mistake.</p><a class="btn sm" href="#" data-act="cancel" data-ev="${esc(id)}">Remove it</a>`;
    } else if (!can.open) {
      status = badge(can.reason.replace('.', ''), 'b-exp');
    } else {
      const label = can.waitlist ? 'Join the waitlist' : 'Register';
      action = cfg.questions.length
        ? `<button class="btn primary" type="button" data-act="openform" data-ev="${esc(id)}">${label}</button>${form('signup', can.waitlist ? 'Join the waitlist' : 'Confirm my spot', true)}`
        : `<button class="btn primary" type="button" data-act="signup" data-ev="${esc(id)}">${label}</button>`;
    }
    return `<section class="card" data-card="${esc(id)}">
      <div class="row-top"><div><h3>${esc(e.title)}</h3><div class="hint">${esc(when(e))}</div></div>${status}</div>
      ${e.description ? `<p>${esc(e.description)}</p>` : ''}
      ${lines.length ? `<p class="hint" style="margin:0 0 10px">${esc(lines.join(' · '))}</p>` : ''}
      ${action}</section>`;
  };

  v.innerHTML = `<h2 class="page-h">Events</h2>
    <p class="hint" style="margin-top:0">Sign up so we can plan food and space. Events with limited spots have a waitlist. If someone cancels, the next person on the list moves up automatically.</p>
    ${membership.paid ? '' : `<div class="alert"><b>Your club fee hasn't been confirmed yet.</b>You can sign up for events now and pay in person when we take attendance. You do need to pay before you can check in. Pay in cash${ctx.data.site.office ? ` at the club office (${esc(ctx.data.site.office)})` : ''}, through WUSA, or at the event.</div>`}
    <div class="stack">${events.length ? events.map(card).join('') : '<p class="empty">No events are open for sign-up right now. Check back soon.</p>'}</div>`;

  const evOf = el => byId[el.dataset.ev];
  const cardOf = el => el.closest('[data-card]');
  const formOf = el => cardOf(el).querySelector('.regform');
  const run = async (el, fn, msg) => { await fn(); toast(msg); ctx.rerender(); };

  acts(v, {
    openform(el) { formOf(el).classList.remove('hidden'); el.classList.add('hidden'); },
    edit(el) { formOf(el).classList.toggle('hidden'); },
    async signup(el) {
      const e = evOf(el), cfg = regConfig(e);
      const waiting = queueState(cfg, queues[eventKey(e)] || []).full;
      const answers = el.closest('.regform') ? readAnswers(formOf(el), cfg) : {};
      const problem = checkAnswers(cfg, answers); if (problem) return toast(problem, 'err');
      await run(el, () => signUp(e, ctx.term, answers), waiting ? "You're on the waitlist." : "You're registered!");
    },
    async saveanswers(el) {
      const e = evOf(el), cfg = regConfig(e), answers = readAnswers(formOf(el), cfg);
      const problem = checkAnswers(cfg, answers); if (problem) return toast(problem, 'err');
      await run(el, () => changeAnswers(e, answers), 'Saved.');
    },
    async cancel(el) {
      const e = evOf(el);
      if (!confirm(`Cancel your sign-up for ${e.title}? Your spot goes to the next person.`)) return;
      await run(el, () => cancelSignUp(e), 'Cancelled.');
    }
  });
}

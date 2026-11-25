// "Programs": resume critique, mock interviews and mentorship, for the signed-in member.
import { session } from '../session.js';
import { read } from '../db.js';
import { esc, acts, toast } from '../ui.js';
import { listCodes, requestCode } from '../codes.js';
import { termId, termLabel } from '../terms.js';

export async function render(root, ctx) {
  const uid = session.user.uid, tid = termId(ctx.term);
  const membership = await read('memberships', `${uid}_${tid}`);
  if (!membership) {
    root.innerHTML = `<div class="alert"><b>Register for ${esc(termLabel(ctx.term))} first.</b>Programs are for members of the current term. <a href="#account/membership">Go to My membership</a> to renew.</div>`;
    return;
  }
  if (!membership.paid) {
    const office = ctx.data.site.office;
    root.innerHTML = `<h2 class="page-h">My programs</h2>
      <div class="alert"><b>Programs are for paid members.</b>Mentorship, resume critique, mock interviews and discount codes unlock once an exec has confirmed your club fee. A WUSA trial period covers events only. Pay in cash${office ? ` at the club office (${esc(office)})` : ''} or through WUSA, or in person at any club event, and an exec will confirm it. This page opens up as soon as they do.</div>`;
    return;
  }
  root.innerHTML = `<h2 class="page-h">My programs</h2>
    <div class="stack">
      <section class="card" id="sec-resume"></section>
      <section class="card" id="sec-mock"></section>
      <section class="card" id="sec-mentor"></section>
      <section class="card" id="sec-codes"></section>
    </div>`;
  drawCodes(root.querySelector('#sec-codes'), tid);
  const [resume, mock, mentor] = await Promise.all([import('../programs/resume-member.js'), import('../programs/mock-member.js'), import('../programs/mentor.js')]);
  await Promise.all([
    resume.render(root.querySelector('#sec-resume'), ctx),
    mock.render(root.querySelector('#sec-mock'), ctx),
    mentor.render(root.querySelector('#sec-mentor'), ctx)
  ]);
}

/* Discount codes: shown as buttons; the code only appears after pressing Request (which logs it for the execs). */
async function drawCodes(el, tid) {
  let codes = [];
  try { codes = await listCodes(tid); } catch (err) { console.warn(err); }
  if (!codes.length) { el.remove(); return; }
  const paint = shown => {
    el.innerHTML = `<div class="row-top"><h3>Exam study discounts</h3></div>
      <p>Members get discounts on exam study materials. Press <b>Request</b> to see the code. The club keeps a record of who requests each code, and codes can't be shared.</p>
      <ul class="hist">${codes.map(c => `<li data-key="${esc(c.key)}"><div><b>${esc(c.label)}</b>${c.note ? `<div class="hint">${esc(c.note)}</div>` : ''}
        ${shown[c.key] ? `<div class="codebox"><code>${esc(shown[c.key])}</code> <a href="#" data-act="copycode" data-code="${esc(shown[c.key])}">Copy</a></div>` : ''}</div>
        ${shown[c.key] ? '' : `<a class="btn sm ${c.requested ? '' : 'primary'}" href="#" data-act="request">${c.requested ? 'Show again' : 'Request'}</a>`}</li>`).join('')}</ul>`;
  };
  const shown = {};
  paint(shown);
  acts(el, {
    async request(a) {
      const key = a.closest('li').dataset.key;
      try { const r = await requestCode(key, tid); shown[key] = r.code; codes.find(c => c.key === key).requested = true; paint(shown); }
      catch (err) { toast(err.message || 'Could not get that code.', 'err'); }
    },
    async copycode(a) { try { await navigator.clipboard.writeText(a.dataset.code); toast('Copied.'); } catch { toast('Copy it by hand.', 'err'); } }
  });
}

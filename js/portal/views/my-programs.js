// "Programs": resume critique, mock interviews and mentorship, for the signed-in member.
import { session } from '../session.js';
import { read } from '../db.js';
import { esc } from '../ui.js';
import { termId, termLabel } from '../terms.js';

export async function render(root, ctx) {
  const uid = session.user.uid, tid = termId(ctx.term);
  const membership = await read('memberships', `${uid}_${tid}`);
  if (!membership) {
    root.innerHTML = `<div class="alert"><b>Register for ${esc(termLabel(ctx.term))} first.</b>Programs are for members of the current term. <a href="#account/membership">Go to My membership</a> to renew.</div>`;
    return;
  }
  root.innerHTML = `<h2 class="page-h">My programs</h2>
    <div class="stack">
      <section class="card" id="sec-resume"></section>
      <section class="card" id="sec-mock"></section>
      <section class="card" id="sec-mentor"></section>
    </div>`;
  const [resume, mock, mentor] = await Promise.all([import('../programs/resume-member.js'), import('../programs/mock-member.js'), import('../programs/mentor.js')]);
  await Promise.all([
    resume.render(root.querySelector('#sec-resume'), ctx),
    mock.render(root.querySelector('#sec-mock'), ctx),
    mentor.render(root.querySelector('#sec-mentor'), ctx)
  ]);
}

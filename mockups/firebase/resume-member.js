// Resume critique, member side: submit a link, follow progress, read comments, rate the reviewer.
import { session } from '../session.js';
import { db, F, col, ref, list, read, stamp, where } from '../db.js';
import { esc, fresh, acts, bindWidgets, collect, badge, starPicker, toast, toDate, fmtDay } from '../ui.js';
import { termId } from '../terms.js';

const STATUS = {
  new: ['Waiting for a reviewer', 'b-exp'], in_review: ['In review', 'b-wait'],
  reviewed: ['Reviewed', 'b-paid'], needs_link: ['Link needs fixing', 'b-wait']
};

export async function render(el, ctx) {
  const v = fresh(el); bindWidgets(v);
  const uid = session.user.uid, tid = termId(ctx.term);
  const reqs = (await list(col('resumeRequests'), where('uid', '==', uid))).filter(r => r.termId === tid).sort((a, b) => b.round - a.round);
  const latest = reqs[0];
  let comments = [], rating = null;
  if (latest) {
    comments = (await list(F.collection(db, 'resumeRequests', latest.id, 'comments'))).sort((a, b) => (toDate(a.at) || 0) - (toDate(b.at) || 0));
    rating = await read('ratings', `resume_${latest.id}`);
  }

  const form = (fixing) => `
    <form id="resume-form" class="${latest && !fixing ? 'hidden' : ''}" novalidate>
      ${fixing ? '<div class="alert err"><b>A reviewer couldn\'t open your link.</b>Check the sharing settings, or paste a new link, then save.</div>' : ''}
      <div class="field"><label for="r-link">Link to your resume <span class="req">*</span></label>
        <input id="r-link" name="link" type="url" placeholder="https://drive.google.com/…" value="${esc(fixing ? latest.link : '')}">
        <small>Google Drive, OneDrive or any link reviewers can open. Choose "view only".</small></div>
      ${fixing ? '' : `
      <div class="field"><label for="r-roles">Roles you're applying for <span class="req">*</span></label><input id="r-roles" name="roles" type="text" maxlength="200"></div>
      <div class="field"><label for="r-co">Companies you're targeting</label><input id="r-co" name="companies" type="text" maxlength="200"><small>Optional. Reviewers use this to tailor their advice.</small></div>
      <div class="field"><label for="r-fb">What would you like feedback on?</label><textarea id="r-fb" name="feedbackWanted" maxlength="500"></textarea></div>
      <div class="field"><label for="r-dl">Application deadline</label><input id="r-dl" name="deadline" type="date"><small>Optional. We'll try to review before this date.</small></div>
      <div class="share"><b>Who can open your resume?</b> We store only the link, never the file. The link is shown only to you, the reviewers assigned to it, and execs, and never in the member directory. Who can open the file itself depends on how you shared it, so choose view-only and turn sharing off when your review is done.</div>
      <label class="checkrow"><input type="checkbox" name="consent"> <span>I'm happy for reviewers to read this resume and leave comments.</span></label>`}
      <button class="btn primary" type="submit">${fixing ? 'Save new link' : 'Submit for review'}</button>
    </form>`;

  const [stLabel, stCls] = latest ? STATUS[latest.status] || STATUS.new : [];
  const viewed = toDate(latest?.viewedAt);
  v.innerHTML = `
    <div class="row-top"><h3>Resume critique</h3>${latest ? badge(stLabel, stCls) : ''}</div>
    ${latest ? `
      <div class="file" style="margin-bottom:10px"><i>LINK</i><div><b>Your resume link</b><small>Round ${latest.round} · submitted ${esc(fmtDay(toDate(latest.createdAt)))}</small></div>
        <a class="btn sm" style="margin-left:auto" href="${esc(latest.link)}" target="_blank" rel="noopener noreferrer">Open link</a></div>
      <p class="hint" style="margin:0 0 6px">Tailored for: ${esc(latest.roles)}${latest.companies ? ' · ' + esc(latest.companies) : ''}</p>
      <div class="tl">
        <div class="st done"><span class="dt">✓</span><b>Submitted</b><small>${esc(fmtDay(toDate(latest.createdAt)))}</small></div>
        <div class="st ${viewed ? 'done' : ''}"><span class="dt">${viewed ? '✓' : ''}</span><b>Viewed by a reviewer</b><small>${viewed ? esc(fmtDay(viewed) + (latest.viewedByName ? ' · ' + latest.viewedByName : '')) : 'Not yet'}</small></div>
        <div class="st ${comments.length ? 'done' : ''}"><span class="dt">${comments.length ? '✓' : ''}</span><b>${comments.length ? comments.length + ' comment' + (comments.length > 1 ? 's' : '') : 'Comments'}</b><small>${comments.length ? esc(fmtDay(toDate(comments[0].at)) + (comments.length > 1 ? '–' + fmtDay(toDate(comments.at(-1).at)) : '')) : 'Not yet'}</small></div>
      </div>
      ${comments.map(c => `<div class="cmt"><small>${esc(c.authorName)} · ${esc(fmtDay(toDate(c.at)))}</small>${esc(c.text)}</div>`).join('')}
      ${latest.reviewerEmail ? `
        <div class="rate-row"><div><b>How helpful was ${esc(latest.reviewerName || 'your reviewer')}'s review?</b><div class="hint">Only the club admin sees ratings, never reviewers or other execs.</div></div>
          ${starPicker('stars', rating?.stars || 0)}
          <input type="text" name="rcomment" placeholder="Optional comment" maxlength="500" value="${esc(rating?.comment || '')}" style="max-width:240px">
          <a class="btn sm" href="#" data-act="rate">Save rating</a></div>` : ''}
      <div class="btnrow" style="margin-top:14px">${latest.status === 'needs_link' ? '' : '<a class="btn sm" href="#" data-act="newver">Submit a new version</a>'}</div>` : `<p>Share a link to your resume and tell reviewers what to focus on. You'll see here when it's been viewed and when comments are added.</p>`}
    ${form(latest?.status === 'needs_link')}`;

  const f = v.querySelector('#resume-form');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const d = collect(f);
    if (!/^https?:\/\//i.test(d.link || '')) return toast('Paste a link that starts with https://', 'err');
    if (latest?.status === 'needs_link') {
      await F.updateDoc(ref('resumeRequests', latest.id), { link: d.link, status: 'new' });
      toast('New link saved.'); return render(el, ctx);
    }
    if (!d.roles) return toast('Tell us which roles you are applying for.', 'err');
    if (!d.consent) return toast('Please tick the box to confirm reviewers can read your resume.', 'err');
    await F.addDoc(col('resumeRequests'), {
      uid, termId: tid, round: (latest?.round || 0) + 1, link: d.link, roles: d.roles, companies: d.companies || '',
      feedbackWanted: d.feedbackWanted || '', deadline: d.deadline || '', status: 'new',
      memberName: session.displayName, memberEmail: session.email, createdAt: stamp()
    });
    toast('Submitted! Reviewers will take a look.'); render(el, ctx);
  });

  acts(v, {
    newver() { f.classList.remove('hidden'); f.querySelector('input')?.focus(); },
    async rate() {
      const stars = +v.querySelector('[data-w="stars"]').dataset.value;
      if (!stars) return toast('Tap a star to choose a rating.', 'err');
      await F.setDoc(ref('ratings', `resume_${latest.id}`), {
        kind: 'resume', refId: latest.id, reviewerEmail: latest.reviewerEmail, reviewerName: latest.reviewerName || '',
        stars, comment: v.querySelector('[name=rcomment]').value.trim(), updatedAt: stamp()
      });
      toast('Thanks for the feedback.');
    }
  });
}

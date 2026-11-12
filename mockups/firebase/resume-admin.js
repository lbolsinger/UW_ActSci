// Resume critique queue for execs and reviewers.
import { session } from '../session.js';
import { db, F, col, ref, list, watch, where, stamp } from '../db.js';
import { esc, fresh, acts, bindWidgets, badge, toast, toDate, fmtDay } from '../ui.js';
import { termId } from '../terms.js';

const STATUS = { new: ['New', 'b-exp'], in_review: ['In review', 'b-wait'], reviewed: ['Reviewed', 'b-paid'], needs_link: ['Link problem', 'b-wait'] };

export async function render(root, ctx) {
  const v = fresh(root); bindWidgets(v);
  const tid = termId(ctx.term);
  let reqs = [], selected = null, comments = [];

  v.innerHTML = `<div class="stats" id="rstats"></div><div class="cols2"><div id="rlist"></div><aside class="drawer" id="rdetail" style="position:static"><p class="hint" style="margin:0">Select a resume to review.</p></aside></div>`;

  const get = id => reqs.find(r => r.id === id);
  function drawList() {
    const n = s => reqs.filter(r => r.status === s).length;
    v.querySelector('#rstats').innerHTML = `
      <div class="stat hl"><b>${reqs.filter(r => !r.reviewerEmail && r.status !== 'reviewed').length}</b><span>Waiting for a reviewer</span></div>
      <div class="stat"><b>${n('in_review')}</b><span>In review</span></div><div class="stat"><b>${n('reviewed')}</b><span>Reviewed</span></div>
      <div class="stat"><b>${n('needs_link')}</b><span>Link couldn't be opened</span></div>`;
    const order = { needs_link: 0, new: 1, in_review: 2, reviewed: 3 };
    v.querySelector('#rlist').innerHTML = [...reqs].sort((a, b) => order[a.status] - order[b.status] || (toDate(a.createdAt) || 0) - (toDate(b.createdAt) || 0)).map(r => {
      const [l, c] = STATUS[r.status] || STATUS.new;
      return `<div class="pcb ${r.id === selected ? 'sel' : ''}" data-id="${esc(r.id)}"><div class="hd"><div><b>${esc(r.memberName)}</b><small>${esc(r.roles)}${r.companies ? ' · ' + esc(r.companies) : ''}</small></div>${badge(l, c)}</div>
        <div class="hint" style="margin-top:6px">Round ${r.round} · Reviewer: ${esc(r.reviewerName || 'Unassigned')}${r.deadline ? ' · due ' + esc(r.deadline) : ''}</div></div>`;
    }).join('') || '<p class="hint">No resumes submitted this term yet.</p>';
  }

  async function drawDetail() {
    const el = v.querySelector('#rdetail'), r = get(selected);
    if (!r) { el.innerHTML = '<p class="hint" style="margin:0">Select a resume to review.</p>'; return; }
    comments = (await list(F.collection(db, 'resumeRequests', r.id, 'comments'))).sort((a, b) => (toDate(a.at) || 0) - (toDate(b.at) || 0));
    if (selected !== r.id) return;
    const viewed = toDate(r.viewedAt);
    el.innerHTML = `
      <h3>${esc(r.memberName)} · Round ${r.round}</h3><div class="hint" style="margin-bottom:10px">Link submitted ${esc(fmtDay(toDate(r.createdAt)))}${r.deadline ? ' · deadline ' + esc(r.deadline) : ''}</div>
      <div class="file" style="margin-bottom:10px"><i>LINK</i><div><b>${esc(r.link.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))}…</b><small>Opens in a new tab</small></div></div>
      <div class="btnrow"><a class="btn primary sm" href="${esc(r.link)}" target="_blank" rel="noopener noreferrer" data-act="open">Open resume link</a><a class="btn sm" href="#" data-act="badlink">Can't open this link</a>
        ${r.reviewerEmail ? '' : '<a class="btn sm" href="#" data-act="claim">I\'ll review this</a>'}</div>
      <dl class="kv" style="margin-top:12px"><dt>Roles</dt><dd>${esc(r.roles)}</dd>${r.companies ? `<dt>Companies</dt><dd>${esc(r.companies)}</dd>` : ''}${r.feedbackWanted ? `<dt>Wants</dt><dd>${esc(r.feedbackWanted)}</dd>` : ''}
        <dt>Reviewer</dt><dd>${esc(r.reviewerName || 'Unassigned')}</dd>
        <dt>Status</dt><dd>${viewed ? `Viewed by ${esc(r.viewedByName || 'a reviewer')} on ${esc(fmtDay(viewed))}` : 'Not viewed yet'} <span class="hint">(marked automatically when a reviewer opens the link from here)</span></dd></dl>
      ${comments.map(c => `<div class="cmt"><small>${esc(c.authorName)} · ${esc(fmtDay(toDate(c.at)))}</small>${esc(c.text)}</div>`).join('')}
      <div class="field"><label for="cmt">Add a comment</label><textarea id="cmt" placeholder="Write feedback the member will see" maxlength="2000"></textarea></div>
      <div class="btnrow"><a class="btn primary sm" href="#" data-act="comment">Save comment</a><a class="btn sm" href="#" data-act="done">Mark reviewed</a></div>`;
  }

  const addComment = (r, text) => F.addDoc(F.collection(db, 'resumeRequests', r.id, 'comments'), { authorEmail: session.email, authorName: session.displayName, text, at: stamp() });
  v.addEventListener('click', e => { const c = e.target.closest('.pcb[data-id]'); if (c) { selected = c.dataset.id; drawList(); drawDetail(); } });
  acts(v, {
    async open() {   // the link itself opens in a new tab; here we record that it was viewed
      const r = get(selected), patch = {};
      if (!r.viewedAt) { patch.viewedAt = stamp(); patch.viewedByName = session.displayName; }
      if (!r.reviewerEmail) { patch.reviewerEmail = session.email; patch.reviewerName = session.displayName; }
      if (r.status === 'new') patch.status = 'in_review';
      if (Object.keys(patch).length) await F.updateDoc(ref('resumeRequests', r.id), patch);
    },
    async claim() { await F.updateDoc(ref('resumeRequests', selected), { reviewerEmail: session.email, reviewerName: session.displayName, status: get(selected).status === 'new' ? 'in_review' : get(selected).status }); toast('You\'re the reviewer.'); },
    async badlink() {
      const r = get(selected);
      await F.updateDoc(ref('resumeRequests', r.id), { status: 'needs_link' });
      await addComment(r, "I couldn't open your resume link. Please check the sharing settings or send a new link, then I'll take another look.");
      toast('The member has been asked to fix the link.'); drawDetail();
    },
    async comment() {
      const t = v.querySelector('#cmt').value.trim(); if (!t) return toast('Write a comment first.', 'err');
      const r = get(selected);
      await addComment(r, t);
      const patch = {}; if (!r.reviewerEmail) { patch.reviewerEmail = session.email; patch.reviewerName = session.displayName; }
      if (r.status === 'new') patch.status = 'in_review';
      if (Object.keys(patch).length) await F.updateDoc(ref('resumeRequests', r.id), patch);
      toast('Comment saved.'); drawDetail();
    },
    async done() { await F.updateDoc(ref('resumeRequests', selected), { status: 'reviewed' }); toast('Marked reviewed.'); }
  });
  ctx.onCleanup(watch(col('resumeRequests'), [where('termId', '==', tid)], data => { reqs = data; drawList(); }));
}

// The member guide: how accounts, payments and the trial period work. Content lives in data/guide.json.
import { esc } from '../utils.js';
import { store } from '../data.js';

const list = (items, cls = 'bullets') => `<ul class="${cls}">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
const mark = ok => ok ? '<span class="gd-yes" aria-label="Yes">✓</span>' : '<span class="gd-no" aria-label="No">–</span>';

export function render() {
  const g = store.guide;
  return `<h2 class="page-h">${esc(g.title)}</h2>
  <div class="stack guide">
    <section class="card"><p style="margin:0;max-width:none">${esc(g.intro)}</p></section>
    <section class="card" id="start"><h3>Getting started</h3>
      <ol class="gd-steps">${g.steps.map(s => `<li><b>${esc(s.title)}.</b> ${esc(s.text)}</li>`).join('')}</ol>
      <div class="btnrow"><a class="btn primary" href="#account">Go to my account</a></div></section>
    <section class="card" id="access"><h3>What you get access to</h3>
      <div class="gd-tw"><table class="gd-table"><thead><tr>${g.access.head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${g.access.rows.map(r => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map(c => `<td>${mark(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
    ${g.sections.map(s => `<section class="card" id="${esc(s.id)}"><h3>${esc(s.title)}</h3>
      ${(s.paragraphs || []).map(p => `<p>${esc(p)}</p>`).join('')}${s.bullets ? list(s.bullets) : ''}</section>`).join('')}
    <section class="card" id="faq"><h3>Common questions</h3>
      ${g.faq.map(f => `<details class="gd-q"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}
      <p class="hint" style="margin:12px 0 0">Still stuck? <a href="mailto:${esc(store.site.email)}">Email the club</a> or ask an exec at any event.</p></section>
  </div>`;
}

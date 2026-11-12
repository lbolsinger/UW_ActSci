// The member directory: name, year and whatever each member chose to share.
import { list, col, where } from '../db.js';
import { esc, fresh, bindWidgets, seg, initials } from '../ui.js';
import { termId } from '../terms.js';

export async function render(root, ctx) {
  const v = fresh(root); bindWidgets(v);
  const all = (await list(col('directory'), where('termId', '==', termId(ctx.term)))).sort((a, b) => a.name.localeCompare(b.name));
  v.innerHTML = `
    <div class="bar"><h2>Member directory</h2></div>
    <p class="hint" style="margin:-8px 0 14px">Only signed-in club members can see this page. It shows each person's name, year, and anything they chose to share.</p>
    <div class="tools"><input type="search" id="dq" placeholder="Search by name" aria-label="Search by name">
      ${seg('year', [['', 'All years'], ...ctx.portal.years.slice(0, 4).map(y => [y, y.replace(' year', '')])], '')}
      ${seg('who', [['', 'Everyone'], ['mentor', 'Mentors']], '')}</div>
    <div class="dgrid" id="dgrid"></div><p class="hint" id="dcount"></p>`;
  const grid = v.querySelector('#dgrid');
  const draw = () => {
    const q = v.querySelector('#dq').value.trim().toLowerCase();
    const year = v.querySelector('[data-name=year] .on')?.dataset.val || '';
    const mentorsOnly = v.querySelector('[data-name=who] .on')?.dataset.val === 'mentor';
    const rows = all.filter(m => (!q || m.name.toLowerCase().includes(q)) && (!year || m.year === year) && (!mentorsOnly || m.isMentor));
    grid.innerHTML = rows.map(m => `<div class="pcard"><div class="hd"><span class="av">${esc(initials(m.name))}</span>
      <div><span class="nm">${esc(m.name)} ${m.isMentor ? '<span class="badge b-ok">Mentor</span>' : ''}</span><span class="yr">${esc(m.year)}</span></div></div>
      ${m.coopExperience ? `<p><b>Co-op:</b> ${esc(m.coopExperience)}</p>` : ''}
      ${/^https?:\/\//i.test(m.linkedin || '') ? `<p><a href="${esc(m.linkedin)}" target="_blank" rel="noopener noreferrer">${esc(m.linkedin.replace(/^https?:\/\/(www\.)?/, ''))}</a></p>` : ''}
      ${(m.exams || []).length ? `<div class="chips">${m.exams.map(x => `<span class="chip2 on">${esc(x)}</span>`).join('')}</div>` : ''}</div>`).join('');
    v.querySelector('#dcount').textContent = rows.length ? '' : (all.length ? 'No one matches that search.' : 'No one has joined the directory yet.');
  };
  v.addEventListener('input', draw);
  v.addEventListener('click', () => queueMicrotask(draw));
  draw();
}

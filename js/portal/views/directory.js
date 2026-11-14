// The member directory: name, year and whatever each member chose to share.
import { list, col, where } from '../../db.js';
import { esc, fresh, bindWidgets, seg, initials } from '../../ui.js';
import { termId } from '../../terms.js';

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

export async function render(root, ctx) {
  const v = fresh(root); bindWidgets(v);
  const all = (await list(col('directory'), where('termId', '==', termId(ctx.term)))).sort((a, b) => a.name.localeCompare(b.name));
  const coveredMap = coveredByDesignation(ctx.portal.credentials?.tracks || {});

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

    grid.innerHTML = rows.map(m => {
      const creds = m.credentials || [];
      const exams = m.exams || [];
      const covered = new Set(creds.flatMap(d => coveredMap[d] || []));
      const visibleExams = exams.filter(ex => !covered.has(ex));

      const credChipsHTML = creds.map(d =>
        `<span class="chip2 ${SECONDARY_DESIGNATIONS.has(d) ? 'des-alt' : 'des'}">${esc(d)}</span>`
      ).join('');

      const examChipsHTML = visibleExams.map(x =>
        `<span class="chip2 on static">${esc(x)}</span>`
      ).join('');

      const hasChips = credChipsHTML || examChipsHTML;

      return `<div class="pcard"><div class="hd"><span class="av">${esc(initials(m.name))}</span>
        <div><span class="nm">${esc(m.name)} ${m.isMentor ? '<span class="badge b-ok">Mentor</span>' : ''}</span><span class="yr">${esc(m.year)}</span></div></div>
        ${m.coopExperience ? `<p><b>Co-op:</b> ${esc(m.coopExperience)}</p>` : ''}
        ${/^https?:\/\//i.test(m.linkedin || '') ? `<p><a href="${esc(m.linkedin)}" target="_blank" rel="noopener noreferrer">${esc(m.linkedin.replace(/^https?:\/\/(www\.)?/, ''))}</a></p>` : ''}
        ${hasChips ? `<div class="chips">${credChipsHTML}${examChipsHTML}</div>` : ''}</div>`;
    }).join('');

    v.querySelector('#dcount').textContent = rows.length ? '' : (all.length ? 'No one matches that search.' : 'No one has joined the directory yet.');
  };

  v.addEventListener('input', draw);
  v.addEventListener('click', () => queueMicrotask(draw));
  draw();
}

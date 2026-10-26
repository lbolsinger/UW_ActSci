import { esc, pic } from '../utils.js';
import { store } from '../data.js';

const member = m => `
  <div class="member">
    ${m.photo ? pic(m.photo, '', m.name) : `<div class="ini" aria-hidden="true">${esc(m.name.split(' ').map(x => x[0]).join('').slice(0, 2))}</div>`}
    <b>${esc(m.name)}</b><span>${esc(m.role)}</span><span>${esc(m.year)}${m.program ? ', ' + esc(m.program) : ''}</span>
  </div>`;

export function render() {
  return `<h2 class="page-h">Meet the execs</h2>
  <figure class="card figure" style="margin:0 0 24px">${pic(store.site.execGroupPhoto, 'Exec team group photo', 'The full executive team')}<figcaption>The full executive team</figcaption></figure>` +
  store.execTeams.map(t => `
    <section class="card team"><div class="team-top">
      ${pic(t.photo, t.name + ' team photo', t.name + ' team photo')}
      <div><h2>${esc(t.name)}</h2><div class="members">${t.members.map(member).join('')}</div></div>
    </div></section>`).join('');
}

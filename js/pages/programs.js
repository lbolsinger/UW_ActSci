import { esc } from '../utils.js';
import { store } from '../data.js';

function simpleProgram(id) {
  const p = store.programs[id];
  return `<section class="card" id="${id}"><h2>${esc(p.title)}</h2>${p.text.map(t => `<p>${esc(t)}</p>`).join('')}
    <div class="btnrow"><a class="btn primary" href="${esc(p.participantUrl)}">Sign up as a participant</a>
    <a class="btn" href="${esc(p.volunteerUrl)}">Volunteer</a></div></section>`;
}

export function render() {
  const o = store.programs.opg;
  return `<h2 class="page-h">Programs</h2>
  <div class="prog-grid">${simpleProgram('mentorship')}${simpleProgram('resume')}</div>
  <section class="card" id="opg" style="margin-top:24px">
    <h2>${esc(o.title)}</h2>
    <div class="cols"><div>
      <p class="lead">${esc(o.lead)}</p>
      ${o.text.map(t => `<p>${esc(t)}</p>`).join('')}
      <div class="btnrow"><a class="btn primary" href="${esc(o.registerUrl)}">Register a team</a></div>
    </div><div>
      <h3>How a session works</h3>
      <ol class="steps">${o.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    </div></div>
  </section>`;
}

// The profile fields shared by registration, the member dashboard and the mentor form:
// first/last name, interests, co-op history, skills and contact details.
import { esc, chips } from './ui.js';

/** Which program(s) of study: select all that apply. */
export const programField = (ctx, p = {}) => `<div class="field"><span class="lbl">Program <span class="req">*</span></span><div class="hint">Select all that apply</div>${chips('programs', ctx.portal.programs, p.programs || [])}</div>`;

export const MAX_COOPS = 8;

/** Old accounts only have one "name" box: split it on the first space so the new boxes aren't empty. */
export function splitName(p = {}) {
  if (p.firstName || p.lastName) return { first: p.firstName || '', last: p.lastName || '' };
  const full = String(p.name || '').trim(), i = full.indexOf(' ');
  return i < 0 ? { first: full, last: '' } : { first: full.slice(0, i), last: full.slice(i + 1).trim() };
}

export function nameFields(p = {}) {
  const n = splitName(p);
  return `<div class="two-f">
      <div class="field"><label for="f-first">First name <span class="req">*</span></label>
        <input id="f-first" name="firstName" type="text" value="${esc(n.first)}" maxlength="50" autocomplete="given-name"></div>
      <div class="field"><label for="f-last">Last name <span class="req">*</span></label>
        <input id="f-last" name="lastName" type="text" value="${esc(n.last)}" maxlength="50" autocomplete="family-name"></div>
    </div>`;
}

const coopRow = (c = {}, i) => `<div class="coop-row" data-coop-row>
    <label class="sr-only" for="co-d${i}">Co-op ${i + 1} start month</label><input id="co-d${i}" type="month" data-k="date" value="${esc(c.date || '')}" aria-label="Co-op ${i + 1} start month">
    <input type="text" data-k="company" placeholder="Company" maxlength="100" value="${esc(c.company || '')}" aria-label="Co-op ${i + 1} company">
    <input type="text" data-k="role" placeholder="Role" maxlength="100" value="${esc(c.role || '')}" aria-label="Co-op ${i + 1} role"></div>`;

export function coopCountOptions(n) {
  return Array.from({ length: MAX_COOPS + 1 }, (_, i) => `<option value="${i}" ${i === n ? 'selected' : ''}>${i === 0 ? 'None yet' : i}</option>`).join('');
}

/** Interests, co-ops and skills. `p` can be a user doc or a directory doc. */
export function experienceFields(ctx, p = {}) {
  const coops = Array.isArray(p.coops) ? p.coops : [];
  const n = Math.min(MAX_COOPS, Number.isInteger(p.coopCount) ? p.coopCount : coops.length);
  return `
    <div class="field"><span class="lbl">Interests</span><div class="hint">Select all that apply</div>
      ${chips('interests', ctx.portal.interests, p.interests || [])}
      <input name="otherInterest" type="text" maxlength="100" placeholder="Other (type your own)" aria-label="Other interest" value="${esc(p.otherInterest || '')}" style="margin-top:8px"></div>
    <div class="field"><label for="f-coopn">Actuarial co-ops so far</label>
      <select id="f-coopn" name="coopCount" data-coop-count>${coopCountOptions(n)}</select>
      <div data-coop-rows class="coop-rows">${Array.from({ length: n }, (_, i) => coopRow(coops[i], i)).join('')}</div>
      <small data-coop-hint class="${n ? '' : 'hidden'}">For each co-op: the start month, the company and your role.</small></div>
    <div class="field"><label for="f-coop">Other experience <span class="hint">(optional)</span></label>
      <textarea id="f-coop" name="coopExperience" maxlength="1000" placeholder="Research, case competitions, non-actuarial co-ops…">${esc(p.coopExperience || '')}</textarea></div>
    <div class="field"><span class="lbl">Skills</span><div class="hint">Software and tools you can use</div>
      ${chips('skills', ctx.portal.skills, p.skills || [])}</div>`;
}

export function contactFields(p = {}) {
  return `
    <div class="field"><label for="f-li">LinkedIn</label><input id="f-li" name="linkedin" type="url" placeholder="https://linkedin.com/in/…" value="${esc(p.linkedin || '')}" maxlength="300"></div>
    <div class="two-f">
      <div class="field"><label for="f-ce">Contact email <span class="hint">(optional)</span></label><input id="f-ce" name="contactEmail" type="email" maxlength="200" placeholder="Shown instead of nothing" value="${esc(p.contactEmail || '')}"></div>
      <div class="field"><label for="f-web">Website or GitHub <span class="hint">(optional)</span></label><input id="f-web" name="website" type="url" maxlength="300" placeholder="https://…" value="${esc(p.website || '')}"></div>
    </div>`;
}

/** Adds / removes co-op rows when the count changes, keeping what was already typed. */
export function bindExperience(root) {
  const sel = root.querySelector('[data-coop-count]'); if (!sel) return;
  const rows = root.querySelector('[data-coop-rows]'), hint = root.querySelector('[data-coop-hint]');
  sel.addEventListener('change', () => {
    const want = +sel.value, have = rows.querySelectorAll('[data-coop-row]').length;
    for (let i = have; i < want; i++) rows.insertAdjacentHTML('beforeend', coopRow({}, i));
    for (let i = have; i > want; i--) rows.lastElementChild.remove();
    hint.classList.toggle('hidden', want === 0);
  });
}

const stripUrl = u => String(u || '').replace(/^https?:\/\/(www\.)?/, '');
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const coopDate = d => { const m = /^(\d{4})-(\d{2})$/.exec(d || ''); return m ? `${MONTHS[+m[2] - 1] || ''} ${m[1]}`.trim() : (d || ''); };
export const coopLine = c => [coopDate(c.date), [c.role, c.company].filter(Boolean).join(' at ')].filter(Boolean).join(': ');
export { stripUrl };

/** Turns the form's collected values into clean profile data (call after collect()). */
export function readProfile(root, d) {
  const first = (d.firstName || '').trim(), last = (d.lastName || '').trim();
  const coops = [...root.querySelectorAll('[data-coop-row]')].map(r => {
    const g = k => (r.querySelector(`[data-k=${k}]`)?.value || '').trim();
    return { date: g('date'), company: g('company'), role: g('role') };
  });
  return {
    firstName: first, lastName: last, name: [first, last].filter(Boolean).join(' '), programs: [...new Set(d.programs || [])],
    interests: [...new Set(d.interests || [])], skills: [...new Set(d.skills || [])],
    otherInterest: (d.otherInterest || '').trim(),
    coopCount: Math.min(MAX_COOPS, Math.max(0, parseInt(d.coopCount, 10) || 0)), coops,
    contactEmail: (d.contactEmail || '').trim(), website: (d.website || '').trim()
  };
}

export function validateExtras(x, d) {
  if (!x.firstName) return 'Please enter your first name.';
  if (!x.lastName) return 'Please enter your last name.';
  if (!x.programs.length) return 'Please select your program (all that apply).';
  if (d.linkedin && !/^https?:\/\//i.test(d.linkedin)) return 'The LinkedIn link should start with https://';
  if (x.website && !/^https?:\/\//i.test(x.website)) return 'The website link should start with https://';
  if (x.contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.contactEmail)) return 'That contact email doesn\'t look right.';
  const bad = x.coops.findIndex(c => (c.company || c.role || c.date) && !(c.company && c.role));
  if (bad >= 0) return `Co-op ${bad + 1}: please add both the company and your role.`;
  return '';
}

/** The fields stored on both the user record and the directory entry. */
export const EXTRA_KEYS = ['firstName', 'lastName', 'programs', 'interests', 'skills', 'otherInterest', 'coopCount', 'coops', 'contactEmail', 'website'];

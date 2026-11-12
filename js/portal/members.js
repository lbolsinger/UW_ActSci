// Shared by the exec pages: everyone who has ever registered, and when they last were a member.
import { list, col } from './db.js';
import { termOrder } from './terms.js';

export async function loadPeople() {
  const [users, mems] = await Promise.all([list(col('users')), list(col('memberships'))]);
  const lastTerm = {};
  for (const m of mems) if (!lastTerm[m.uid] || termOrder(m.termId) > termOrder(lastTerm[m.uid])) lastTerm[m.uid] = m.termId;
  return { users, lastTerm };
}

/** The "how was it paid" panel used on the members and attendance pages. */
import { esc, seg } from './ui.js';
export const paymentPanel = (title, button, execName) => `
  <div class="pay">
    <div class="sec-h">${esc(title)} <span class="only">Execs only</span></div>
    <div class="field"><span class="lbl">Paid how?</span>${seg('method', [['wusa', 'WUSA'], ['cash', 'Cash']], 'wusa')}</div>
    <div class="field pay-wusa"><label>WUSA confirmation number</label><input type="text" name="number" inputmode="numeric" maxlength="12" placeholder="6 digits"><small>The 6-digit number from the WUSA receipt.</small></div>
    <div class="field" style="margin-bottom:12px"><span class="lbl">Verified by</span><b>${esc(execName)}</b> <span class="hint">(from your login)</span></div>
    <button class="btn primary block" type="button" data-act="${button[0]}">${esc(button[1])}</button>
  </div>`;

/** Show or hide the WUSA number box when WUSA/Cash is chosen. */
export function bindPayment(root) {
  root.addEventListener('click', e => {
    if (!e.target.closest('[data-name="method"]')) return;
    queueMicrotask(() => root.querySelectorAll('.pay').forEach(p => {
      const wusa = p.querySelector('[data-name="method"] .on')?.dataset.val === 'wusa';
      p.querySelector('.pay-wusa').classList.toggle('hidden', !wusa);
    }));
  });
}

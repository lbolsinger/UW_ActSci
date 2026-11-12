// Exec tool: running the programs (resume critique, mock interviews, mentorship).
import { fresh, bindWidgets } from '../ui.js';
import { termLabel } from '../terms.js';
import { esc } from '../ui.js';

const TABS = [['resume', 'Resume critique'], ['mock', 'Mock interviews'], ['mentorship', 'Mentorship']];
let lastTab = 'resume';

export async function render(root, ctx) {
  const v = fresh(root);
  v.innerHTML = `<div class="bar"><h2>Program admin</h2><span class="badge b-ok">${esc(termLabel(ctx.term))}</span></div>
    <div class="seg2" id="ptabs" style="margin-bottom:16px">${TABS.map(([k, l]) => `<span role="button" tabindex="0" data-tab="${k}" class="${k === lastTab ? 'on' : ''}">${l}</span>`).join('')}</div>
    <div id="pbody"></div>`;
  const show = async tab => {
    lastTab = tab;
    v.querySelectorAll('#ptabs [data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === tab));
    ctx.cleanBody?.(); ctx.cleanBody = null;
    const body = v.querySelector('#pbody'); body.innerHTML = '<p class="empty">Loading…</p>';
    const mod = await import(`../programadmin/${tab}-admin.js`);
    const stops = [];
    await mod.render(body, { ...ctx, onCleanup: fn => stops.push(fn) });
    ctx.cleanBody = () => stops.forEach(f => f());
  };
  v.querySelector('#ptabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) show(t.dataset.tab); });
  v.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-tab]')) { e.preventDefault(); e.target.click(); } });
  ctx.onCleanup(() => ctx.cleanBody?.());
  await show(lastTab);
}

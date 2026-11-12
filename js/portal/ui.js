// Shared bits of interface: toggles, chips, stars, toasts, small formatters.
import { esc } from '../utils.js';
export { esc };

/** Replace the contents of a container with a fresh empty div (avoids stacking up listeners). */
export const fresh = root => { root.innerHTML = '<div class="pv"></div>'; return root.firstElementChild; };

export function toast(msg, kind = '') {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.className = 'show ' + kind;
  clearTimeout(t._h); t._h = setTimeout(() => { t.className = ''; }, 4000);
}

export const badge = (text, cls = '') => `<span class="badge ${cls}">${esc(text)}</span>`;
export const initials = n => (n || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
export const starText = n => '★'.repeat(n) + `<span class="off">${'★'.repeat(5 - n)}</span>`;

/* ---------- form widgets (segmented buttons, chips, switches, star picker) ---------- */
export const seg = (name, opts, sel) =>
  `<div class="seg2" data-w="seg" data-name="${name}">${opts.map(([v, l]) =>
    `<span role="button" tabindex="0" data-val="${esc(v)}" class="${v === sel ? 'on' : ''}">${esc(l)}</span>`).join('')}</div>`;
export const chips = (name, opts, sel = []) =>
  `<div class="chips" data-w="chips" data-name="${name}">${opts.map(o =>
    `<span role="button" tabindex="0" data-val="${esc(o)}" class="chip2 ${sel.includes(o) ? 'on' : ''}">${esc(o)}</span>`).join('')}</div>`;
export const toggle = (name, on, act = '') =>
  `<span role="switch" tabindex="0" aria-checked="${!!on}" ${act ? `data-act="${act}"` : `data-w="tog"`} data-name="${name}" class="tog ${on ? 'on' : ''}"></span>`;
export const starPicker = (name, value = 0) =>
  `<span class="stars pick" data-w="stars" data-name="${name}" data-value="${value}">${[1, 2, 3, 4, 5].map(n =>
    `<button type="button" class="st ${n <= value ? 'on' : ''}" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</span>`;

/** Makes the widgets above respond to clicks and the keyboard. Call once per container. */
export function bindWidgets(root) {
  root.addEventListener('click', e => {
    const w = e.target.closest('[data-w]');
    if (!w || !root.contains(w)) return;
    if (w.dataset.w === 'seg') {
      const s = e.target.closest('[data-val]'); if (!s) return;
      w.querySelectorAll('[data-val]').forEach(x => x.classList.toggle('on', x === s));
    } else if (w.dataset.w === 'chips') {
      e.target.closest('[data-val]')?.classList.toggle('on');
    } else if (w.dataset.w === 'tog') {
      w.classList.toggle('on'); w.setAttribute('aria-checked', w.classList.contains('on'));
    } else if (w.dataset.w === 'stars') {
      const b = e.target.closest('.st'); if (!b) return;
      const n = +b.dataset.n; w.dataset.value = n;
      w.querySelectorAll('.st').forEach(x => x.classList.toggle('on', +x.dataset.n <= n));
    }
  });
  root.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-w] [data-val], [data-w="tog"], [data-act].tog')) {
      e.preventDefault(); e.target.click();
    }
  });
}

/** Reads every field inside a container (inputs by name, plus the widgets above). */
export function collect(root) {
  const out = {};
  root.querySelectorAll('input[name],select[name],textarea[name]').forEach(el => {
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
  });
  root.querySelectorAll('[data-w="seg"]').forEach(w => { out[w.dataset.name] = w.querySelector('.on')?.dataset.val ?? null; });
  root.querySelectorAll('[data-w="chips"]').forEach(w => { out[w.dataset.name] = [...w.querySelectorAll('.on')].map(x => x.dataset.val); });
  root.querySelectorAll('[data-w="tog"]').forEach(w => { out[w.dataset.name] = w.classList.contains('on'); });
  root.querySelectorAll('[data-w="stars"]').forEach(w => { out[w.dataset.name] = +w.dataset.value; });
  return out;
}

/** Click handling by data-act="name". handlers = { name(el, event) {...} } */
export function acts(root, handlers) {
  root.addEventListener('click', async e => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t) || !handlers[t.dataset.act]) return;
    if (!t.hasAttribute('target')) e.preventDefault();   // links that open a new tab should still open it
    if (t.disabled || t.dataset.busy) return;
    t.dataset.busy = '1';
    try { await handlers[t.dataset.act](t, e); }
    catch (err) { console.error(err); toast(friendly(err), 'err'); }
    finally { delete t.dataset.busy; }
  });
}
export function friendly(err) {
  const m = String(err?.code || err?.message || err);
  if (m.includes('permission-denied')) return "That wasn't allowed. If you think it should be, tell an exec.";
  if (m.includes('unavailable') || m.includes('network')) return 'Could not reach the server. Check your connection and try again.';
  return err?.message || 'Something went wrong. Please try again.';
}

/* ---------- dates ---------- */
export const toDate = ts => ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
export const fmtDay = d => d ? d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '';
export const fmtTime = d => d ? d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : '';
export const fmtLong = d => d ? d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) : '';

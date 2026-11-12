// The Account tab. This file is small on purpose: the real work lives in js/portal/
// and is only loaded when someone opens this page.
import { isConfigured } from '../portal/config.js';

const SETUP_NOTICE = `
  <div class="card portal-narrow">
    <h2>The member portal isn't switched on yet</h2>
    <p>Accounts, registration and the member directory need a Firebase project. Once it's set up and the settings are pasted into <code>js/portal/config.js</code>, this page will work. Follow <code>SETUP.md</code>.</p>
  </div>`;

export function render() { return `<div id="portal"><p class="empty">Loading…</p></div>`; }

export async function mount() {
  const box = document.getElementById('portal');
  if (!isConfigured()) { box.innerHTML = SETUP_NOTICE; return; }
  const sub = location.hash.replace('#', '').split('/')[1];
  try {
    const app = await import('../portal/app.js');
    if (!document.body.contains(box)) return;   // they already navigated away
    await app.renderAccount(box, sub);
  } catch (err) {
    console.error(err);
    box.innerHTML = `<div class="card portal-narrow"><h2>The member portal couldn't load</h2><p>${String(err.message || err)}</p><p class="hint">Check your internet connection and try refreshing the page. If this keeps happening, tell an exec.</p></div>`;
  }
}

export async function unmount() {
  try { (await import('../portal/app.js')).cleanup(); } catch { /* portal never loaded */ }
}

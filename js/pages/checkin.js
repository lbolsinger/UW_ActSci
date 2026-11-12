// The page the door QR code opens: #checkin/<event-id>
import { isConfigured } from '../portal/config.js';

export function render() { return `<div id="portal"><p class="empty">Loading…</p></div>`; }

export async function mount() {
  const box = document.getElementById('portal');
  if (!isConfigured()) { box.innerHTML = `<div class="card portal-narrow"><h2>Check-in isn't available yet</h2><p>The member portal hasn't been set up.</p></div>`; return; }
  const eventId = location.hash.replace('#', '').split('/')[1];
  try {
    const app = await import('../portal/app.js');
    if (!document.body.contains(box)) return;
    await app.renderCheckin(box, eventId);
  } catch (err) {
    console.error(err);
    box.innerHTML = `<div class="card portal-narrow"><h2>Check-in couldn't load</h2><p>${String(err.message || err)}</p></div>`;
  }
}
export async function unmount() {
  try { (await import('../portal/app.js')).cleanup(); } catch { /* portal never loaded */ }
}

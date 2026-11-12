import { esc, toast } from '../ui.js';
import { sendLink, finishLink } from '../auth.js';

const PRIVACY = `By signing in you agree that club execs can see the details you enter when you register.`;

export function render(box, { note = '', error = '' } = {}) {
  box.innerHTML = `
  <div class="portal-narrow card">
    <h2>Sign in to the member portal</h2>
    ${note ? `<div class="alert"><b>${esc(note)}</b></div>` : ''}
    ${error ? `<div class="alert err">${esc(error)}</div>` : ''}
    <p>Use your <b>@uwaterloo.ca</b> email. We'll send you a sign-in link, so there's no password to remember. New here? The same link creates your account.</p>
    <form id="signin-form" novalidate>
      <div class="field"><label for="signin-email">Waterloo email</label>
        <input id="signin-email" name="email" type="email" autocomplete="email" placeholder="you@uwaterloo.ca" required>
        <small>Only @uwaterloo.ca addresses can register.</small></div>
      <button class="btn primary block" type="submit">Email me a sign-in link</button>
    </form>
    <p class="hint" style="margin:14px 0 0">${PRIVACY}</p>
  </div>`;
  const form = box.querySelector('#signin-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = form.email.value.trim();
    const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Sending…';
    try { await sendLink(email); sent(box, email); }
    catch (err) { btn.disabled = false; btn.textContent = 'Email me a sign-in link'; toast(err.message || 'Could not send the link.', 'err'); }
  });
}

function sent(box, email) {
  box.innerHTML = `
  <div class="portal-narrow card">
    <h2>Check your email</h2>
    <p>We sent a sign-in link to <b>${esc(email)}</b>. It can take a minute to arrive, and it sometimes lands in spam or junk.</p>
    <p class="hint">For the smoothest sign-in, open the link on this same device and browser.</p>
    <div class="btnrow"><a class="btn" href="#account" id="again">Use a different email</a></div>
  </div>`;
  box.querySelector('#again').addEventListener('click', e => { e.preventDefault(); render(box); });
}

/** Shown when someone opens a sign-in link on a different device from the one that requested it. */
export function confirm(box) {
  box.innerHTML = `
  <div class="portal-narrow card">
    <h2>Confirm your email</h2>
    <p>To finish signing in, type the email address you used to request the link.</p>
    <form id="confirm-form" novalidate>
      <div class="field"><label for="confirm-email">Waterloo email</label>
        <input id="confirm-email" name="email" type="email" autocomplete="email" required></div>
      <button class="btn primary block" type="submit">Finish signing in</button>
    </form>
  </div>`;
  const form = box.querySelector('#confirm-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try { await finishLink(form.email.value); location.reload(); }
    catch (err) { render(box, { error: 'That link has expired, was already used, or the email did not match. Request a new link below.' }); }
  });
}

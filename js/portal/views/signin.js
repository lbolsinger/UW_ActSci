import { esc, toast } from '../ui.js';
import { sendCode, verifyCode } from '../auth.js';

const PRIVACY = `By signing in you agree that club execs can see the details you enter when you register.`;

export function render(box, { note = '', error = '' } = {}) {
  box.innerHTML = `
  <div class="portal-narrow card">
    <h2>Sign in to the member portal</h2>
    ${note ? `<div class="alert"><b>${esc(note)}</b></div>` : ''}
    ${error ? `<div class="alert err">${esc(error)}</div>` : ''}
    <p>Use your <b>@uwaterloo.ca</b> email. We'll email you a 6-digit code, so there's no password to remember. New here? The same code creates your account.</p>
    <form id="signin-form" novalidate>
      <div class="field"><label for="signin-email">Waterloo email</label>
        <input id="signin-email" name="email" type="email" autocomplete="email" placeholder="you@uwaterloo.ca" required>
        <small>Only @uwaterloo.ca addresses can register.</small></div>
      <button class="btn primary block" type="submit">Email me a sign-in code</button>
    </form>
    <p class="hint" style="margin:14px 0 0">${PRIVACY}</p>
  </div>`;
  const form = box.querySelector('#signin-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = form.email.value.trim();
    const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Sending…';
    try { await sendCode(email); enterCode(box, email.toLowerCase()); }
    catch (err) { btn.disabled = false; btn.textContent = 'Email me a sign-in code'; toast(err.message || 'Could not send the code.', 'err'); }
  });
}

/** Step 2: type the code from the email. */
function enterCode(box, email) {
  box.innerHTML = `
  <div class="portal-narrow card">
    <h2>Check your email</h2>
    <p>We sent a 6-digit code to <b>${esc(email)}</b>. It can take a minute to arrive, and it sometimes lands in spam or junk.</p>
    <form id="code-form" novalidate>
      <div class="field"><label for="signin-code">Sign-in code</label>
        <input id="signin-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" placeholder="123456" required>
        <small>The code works for about an hour and can be used once.</small></div>
      <button class="btn primary block" type="submit">Sign in</button>
    </form>
    <div class="btnrow" style="margin-top:14px"><a class="btn" href="#account" id="again">Use a different email</a>
      <a class="btn" href="#account" id="resend">Send a new code</a></div>
  </div>`;
  const form = box.querySelector('#code-form');
  box.querySelector('#signin-code').focus();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const code = form.code.value.trim();
    if (!/^\d{6,10}$/.test(code.replace(/\s+/g, ''))) return toast('Type the 6-digit code from the email.', 'err');
    const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Signing in…';
    try { await verifyCode(email, code); location.reload(); }
    catch (err) {
      console.error(err);
      btn.disabled = false; btn.textContent = 'Sign in';
      toast('That code is wrong or has expired. Check it, or send a new one.', 'err');
    }
  });
  box.querySelector('#again').addEventListener('click', e => { e.preventDefault(); render(box); });
  box.querySelector('#resend').addEventListener('click', async e => {
    e.preventDefault();
    try { await sendCode(email); toast('A new code is on its way.'); }
    catch (err) { toast(err.message || 'Could not send a new code.', 'err'); }
  });
}

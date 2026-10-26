// Entry point: loads data, then handles navigation between pages.
import { $, $$, parse } from './utils.js';
import { loadData } from './data.js';
import { renderBanner, initMenu } from './components/banner.js';
import { openDay, closeModal, isModalOpen } from './components/modal.js';
import * as home from './pages/home.js';
import * as events from './pages/events.js';
import * as resources from './pages/resources.js';
import * as programs from './pages/programs.js';
import * as execs from './pages/execs.js';

// To add a page: create js/pages/<name>.js exporting render(), add it here, and add a tab in index.html.
const PAGES = { home, events, resources, programs, execs };
let current = 'home';
let pendingOpen = null;   // day to open once the Events page has rendered

function show() {
  $('#app').innerHTML = PAGES[current].render();
  PAGES[current].mount?.(show);
}

function route() {
  const [page, sub] = location.hash.replace('#', '').split('/');
  current = PAGES[page] ? page : 'home';
  $$('.tab').forEach(a => a.removeAttribute('aria-current'));
  $(`.tab[href="#${current}"]`)?.setAttribute('aria-current', 'page');
  $('#navList').classList.remove('open');
  $('#menuBtn').setAttribute('aria-expanded', 'false');
  closeModal();
  show();
  if (sub && document.getElementById(sub)) document.getElementById(sub).scrollIntoView();
  else window.scrollTo(0, 0);
  if (pendingOpen) { const k = pendingOpen; pendingOpen = null; openDay(k); }
}

// Anything with data-open="YYYY-MM-DD" opens that day's pop-up.
document.addEventListener('click', e => {
  const t = e.target.closest('[data-open]');
  if (!t || e.target.closest('a')) return;
  if (t.matches('button.btn')) {            // e.g. "See details" on the Home page
    const d = parse(t.dataset.open);
    events.setMonth(d.getFullYear(), d.getMonth());
    pendingOpen = t.dataset.open;
    if (location.hash === '#events') route(); else location.hash = 'events';
  } else openDay(t.dataset.open);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isModalOpen()) closeModal();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-open][role=button]')) {
    e.preventDefault(); openDay(e.target.dataset.open);
  }
});

async function start() {
  try {
    await loadData();
  } catch (err) {
    $('#app').innerHTML = `<div class="card"><h2>The site could not load its data</h2>
      <p>${err.message}</p>
      <p>If you opened <code>index.html</code> by double-clicking it, browsers block data files. Run <code>python3 -m http.server</code> in this folder and visit <code>http://localhost:8000</code>, or publish with GitHub Pages.</p></div>`;
    return;
  }
  renderBanner();
  initMenu();
  window.addEventListener('hashchange', route);
  route();
}
start();

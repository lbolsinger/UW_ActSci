import { $, esc } from '../utils.js';
import { store } from '../data.js';

// A "loss triangle" of numbers; the newest diagonal is highlighted in the accent colour.
const TRIANGLE = [[812, 1204, 1390, 1462, 1480], [905, 1318, 1511, 1590], [780, 1156, 1337], [1002, 1488], [864]];

export function renderBanner() {
  const { site } = store;
  const numbers = TRIANGLE.map((row, i) => row.map((v, j) =>
    `<text x="${(j + 1) * 86 + 20}" y="${(i + 1) * 34 + 14}" text-anchor="end" class="${i + j === 4 ? 'new' : ''}">${v.toLocaleString('en-CA')}</text>`
  ).join('')).join('');

  const banner = $('#banner');
  if (site.bannerImage) {
    // Art mode: wide background image cropped to fit, with a live-text logo on top.
    banner.classList.add('has-art');
    banner.innerHTML =
      `<img class="banner-img" src="${esc(site.bannerImage)}" alt="">` +
      `<div class="lockup">
         ${site.bannerLogo ? `<img class="lockup-mark" src="${esc(site.bannerLogo)}" alt="">` : ''}
         <div class="lockup-text">
           ${site.organization ? `<p class="lockup-org">${esc(site.organization)}</p>` : ''}
           <h1>${esc(site.name)}</h1>
         </div>
       </div>`;
       </div>`;
  } else {
    // Fallback when bannerImage is null: the generated number-triangle banner.
    banner.classList.remove('has-art');
    banner.innerHTML =
      `<div class="banner-art" aria-hidden="true"><svg ...>${numbers}</svg></div>` +
      `<div class="banner-title"><h1>${esc(site.name)}</h1><p>${esc(site.tagline)}</p></div>`;
  }

  $('#navLabel').textContent = site.name;
  $('#foot').textContent = site.footer;
  document.title = site.name;
}

export function initMenu() {
  $('#menuBtn').addEventListener('click', () => {
    const open = $('#navList').classList.toggle('open');
    $('#menuBtn').setAttribute('aria-expanded', open);
  });
}

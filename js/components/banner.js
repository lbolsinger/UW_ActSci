import { $, esc } from '../utils.js';
import { store } from '../data.js';

// A "loss triangle" of numbers; the newest diagonal is highlighted in the accent colour.
const TRIANGLE = [[812, 1204, 1390, 1462, 1480], [905, 1318, 1511, 1590], [780, 1156, 1337], [1002, 1488], [864]];

export function renderBanner() {
  const { site } = store;
  const numbers = TRIANGLE.map((row, i) => row.map((v, j) =>
    `<text x="${(j + 1) * 86 + 20}" y="${(i + 1) * 34 + 14}" text-anchor="end" class="${i + j === 4 ? 'new' : ''}">${v.toLocaleString('en-CA')}</text>`
  ).join('')).join('');

  $('#banner').innerHTML =
    (site.bannerImage
      ? `<img class="banner-img" src="${esc(site.bannerImage)}" alt="">`
      : `<div class="banner-art" aria-hidden="true"><svg viewBox="0 0 470 200" preserveAspectRatio="xMaxYMid meet">${numbers}</svg></div>`) +
    `<div class="banner-title"><h1>${esc(site.name)}</h1><p>${esc(site.tagline)}</p></div>`;

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

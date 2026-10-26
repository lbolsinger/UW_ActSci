import { esc, pic } from '../utils.js';
import { store } from '../data.js';

export function render() {
  return `<h2 class="page-h">Resources</h2><div class="stack">` + store.resources.map(r => `
    <section class="card two res"><div>
      <h3>${esc(r.title)}</h3><p>${esc(r.text)}</p>
      <ul class="linklist">${r.links.map(l => `<li><a href="${esc(l.url)}"${l.url.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${esc(l.label)}</a></li>`).join('')}</ul>
    </div>${pic(r.image, r.title, '')}</section>`).join('') + `</div>`;
}

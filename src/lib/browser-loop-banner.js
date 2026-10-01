// THE NAVIGATION-LOOP BANNER of the live view (lane site-reset, 2026-09-30): the browser fact's `stuck.state === 'loop'`
// drawn as ONE element whose KEYED children (title, line, one row per address of the cycle, the hint) are patched in place
// — a banner rebuilt at every fact push would blink under the pointer (feedback: live cards patch in place). The words
// are PURE src/browser-stuck.js `loopWords` through the client's t(); every string lands through textContent (the
// addresses are page content). DOM-light on purpose: a fast suite drives it over a minimal document.
import { loopWords } from '../browser-stuck.js';

/** `doc` = the document (a suite hands a minimal one). → `{el, render(loop, t)}`; `render(null)` hides it. */
export function createLoopBanner(doc = (typeof document !== 'undefined' ? document : null)) {
  const mk = (tag, cls) => { const n = doc.createElement(tag); n.className = cls; return n; };
  const el = mk('div', 'browser-live-dialog stuck browser-live-loop');
  el.style = el.style || {};
  el.style.display = 'none';
  if (typeof el.setAttribute === 'function') el.setAttribute('role', 'status');
  const title = mk('span', 'browser-live-dialog-title browser-live-loop-title');
  const line = mk('span', 'browser-live-dialog-body browser-live-loop-line');
  const cycle = mk('ul', 'browser-live-loop-cycle');
  const hint = mk('span', 'browser-live-dialog-hint browser-live-loop-hint');
  for (const n of [title, line, cycle, hint]) el.appendChild(n);
  const put = (n, v) => { if (n.textContent !== v) n.textContent = v; };
  function render(loop, t) {
    const w = loop ? loopWords(loop, t) : null;
    el.style.display = w ? '' : 'none';
    if (!w) return;
    put(title, w.title); put(line, w.line); put(hint, `${w.hops} · ${w.hint}`);
    while (cycle.children.length > w.urls.length) { const last = cycle.children[cycle.children.length - 1]; if (typeof last.remove === 'function') last.remove(); else cycle.children.pop(); }
    w.urls.forEach((u, i) => { let li = cycle.children[i]; if (!li) { li = doc.createElement('li'); cycle.appendChild(li); } put(li, u); li.title = u; });
  }
  return { el, render, parts: { title, line, cycle, hint } };
}

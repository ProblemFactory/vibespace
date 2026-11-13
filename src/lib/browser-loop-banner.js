// THE NAVIGATION-LOOP BANNER of the live view (lane site-reset, 2026-09-30): the browser fact's `stuck.state === 'loop'`
// drawn as ONE element whose KEYED children (title, line, one row per address of the cycle, the hint) are patched in place
// — a banner rebuilt at every fact push would blink under the pointer (feedback: live cards patch in place). The words
// are PURE src/browser-stuck.js `loopWords` through the client's t(); every string lands through textContent (the
// addresses are page content). DOM-light on purpose: a fast suite drives it over a minimal document.
import { loopWords } from '../browser-stuck.js';

/** `doc` = the document (a suite hands a minimal one); `acts` = { stop(), close() } — the banner's own DOORS (lane ui-needs-a-button:
 *  the ways out it names are buttons on its line, not words). → `{el, render(loop, t, show)}`; `render(null)` hides it;
 *  `show` = { stop, close } — which doors this view may press (a stop on a conversation's view; a close while driving / the person's own window). */
export function createLoopBanner(doc = (typeof document !== 'undefined' ? document : null), acts = {}) {
  const mk = (tag, cls) => { const n = doc.createElement(tag); n.className = cls; return n; };
  const el = mk('div', 'browser-live-dialog stuck browser-live-loop');
  el.style = el.style || {};
  el.style.display = 'none';
  if (typeof el.setAttribute === 'function') el.setAttribute('role', 'status');
  const title = mk('span', 'browser-live-dialog-title browser-live-loop-title');
  const line = mk('span', 'browser-live-dialog-body browser-live-loop-line');
  const cycle = mk('ul', 'browser-live-loop-cycle');
  const hint = mk('span', 'browser-live-dialog-hint browser-live-loop-hint');
  const doors = mk('span', 'need-doors browser-live-loop-doors');
  const door = (key, cls) => { const b = mk('button', 'mounts-btn need-door' + cls); b.type = 'button'; if (b.dataset) b.dataset.door = key; b.onclick = (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); const f = acts && acts[key]; if (typeof f === 'function') f(); }; doors.appendChild(b); return b; };
  const stopBtn = door('stop', ' mounts-btn-primary'), closeBtn = door('close', '');
  for (const n of [title, line, cycle, hint, doors]) el.appendChild(n);
  const put = (n, v) => { if (n.textContent !== v) n.textContent = v; };
  function render(loop, t, show = {}) {
    const w = loop ? loopWords(loop, t) : null;
    el.style.display = w ? '' : 'none';
    if (!w) return;
    put(title, w.title); put(line, w.line); put(hint, `${w.hops} · ${w.hint}`);
    const tt = typeof t === 'function' ? t : (s) => s;   // a suite renders with no translator
    put(stopBtn, tt('Stop loading')); put(closeBtn, tt('Close this tab'));
    stopBtn.style.display = show.stop ? '' : 'none'; closeBtn.style.display = show.close ? '' : 'none';
    doors.style.display = show.stop || show.close ? '' : 'none';
    while (cycle.children.length > w.urls.length) { const last = cycle.children[cycle.children.length - 1]; if (typeof last.remove === 'function') last.remove(); else cycle.children.pop(); }
    w.urls.forEach((u, i) => { let li = cycle.children[i]; if (!li) { li = doc.createElement('li'); cycle.appendChild(li); } put(li, u); li.title = u; });
  }
  return { el, render, parts: { title, line, cycle, hint, doors, stop: stopBtn, close: closeBtn } };
}

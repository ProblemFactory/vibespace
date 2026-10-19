// THE FULL-SCREEN PILL (lane stream-stats-popup — the owner 2026-10-19: 「全屏模式做成真全屏，不要在顶部固定这个条，或者做成可移动的
// overlay 而不是挤压屏幕空间的固定条」): in 「全屏」 the machine desktop window's strip is no fixed bar over the picture any more —
// the picture takes the whole screen and the SAME strip floats over it as a small pill: its summary (the click = the details),
// 「退出全屏」 and 「⋯」 (the details, the display switcher, 「捕获快捷键」 — the caller's `menu()`). Its children stay its own (every
// door that put one there keeps it — the hand-over's words, a Mac's permission switch): which of them the pill shows is
// decided by class (public/style.css `.desktop-strip.is-pill`), and the notices that must not be missed — a Mac's permission,
// a refused input's words, a hand-over — keep it up while they are shown.
//   • dragged by its grip (or its bare background) to any corner of the screen, dropped on the nearest; the corner remembered
//     per machine (src/lib/corner-float.js; src/stream-series.js cornerOf / cornerMemory)
//   • hidden 3 s after the pointer last moved, back on a move (PURE pillVerdict); a TOUCH wakes it only inside its corner's
//     third of the screen — and that tap is the pill's, never a click on the machine (PURE wakeVerdict)
//   • Esc leaves full screen (the browser's own; with 「捕获快捷键」 on, held for 2 s) — and so does 「退出全屏」
import { t } from './i18n.js';
import { createPopover } from './utils.js';
import { pillVerdict, wakeVerdict, cornerMemory, rememberCorner, PILL } from '../stream-series.js';
import { placeInCorner, dragToCorner } from './corner-float.js';

// THE PILL'S MEMORY: { [hostId]: 'tl' | 'tr' | 'bl' | 'br' } — where this browser's full-screen pill sits for a machine (≤ 32)
const PILL_KEY = 'vibespace.streamPill';
const readCorner = (hostId) => { try { return cornerMemory(localStorage.getItem(PILL_KEY), hostId, PILL.corner); } catch { return PILL.corner; } };
const saveCorner = (hostId, corner) => { try { localStorage.setItem(PILL_KEY, rememberCorner(localStorage.getItem(PILL_KEY), hostId, corner)); } catch { /* storage refused: not remembered */ } };
// the notices that keep the pill up while they are shown (the strip's children, by class)
const HOLDS = '.desktop-strip-tcc, .desktop-strip-note, .desktop-strip-handover';
const GRIP_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="3.5" r="1.3"/><circle cx="10.5" cy="3.5" r="1.3"/><circle cx="5.5" cy="8" r="1.3"/><circle cx="10.5" cy="8" r="1.3"/><circle cx="5.5" cy="12.5" r="1.3"/><circle cx="10.5" cy="12.5" r="1.3"/></svg>';

/** `host` = the full-screen element (the window's content), `bar` = its strip, `fullBtn` = 「全屏」 (it says 「退出全屏」 in the pill),
 *  `hostId` = the memory key, `menu()` = the ⋯ rows ([{ label, checked?, action } | { separator: true }]).
 *  → { sync() (call it on every fullscreenchange), wake(), dispose(), state } */
export function createStreamPill({ host, bar, fullBtn, hostId = '', menu = () => [] }) {
  const grip = document.createElement('span'); grip.className = 'desktop-strip-grip'; grip.hidden = true; grip.innerHTML = GRIP_SVG; grip.title = t('Drag to another corner');
  const more = document.createElement('button'); more.type = 'button'; more.className = 'desktop-strip-btn desktop-strip-pill-more'; more.textContent = '⋯'; more.hidden = true;
  more.title = t('More'); more.setAttribute('aria-label', more.title);
  fullBtn.classList.add('desktop-strip-full');
  const fullWords = fullBtn.textContent;
  bar.prepend(grip); bar.append(more);
  let on = false, corner = readCorner(hostId), lastActive = 0, hover = false, dragging = false, timer = null, ctl = null, watch = null, swallowed = null;
  const notice = () => [...bar.querySelectorAll(HOLDS)].some((e) => e.parentNode === bar && !e.hidden);
  const popupUp = () => !!host.querySelector('[data-popover]'); // the ⋯ menu or the details, opened inside the full-screen element
  function judge() {
    clearTimeout(timer); timer = null;
    if (!on) return;
    const v = pillVerdict({ now: performance.now(), lastActive, hover, drag: dragging, menu: popupUp(), notice: notice() });
    bar.classList.toggle('is-away', !v.shown);
    bar.dataset.why = v.why;
    if (v.recheckMs != null) timer = setTimeout(judge, v.recheckMs + 20);
    else if (v.why === 'menu') timer = setTimeout(judge, 500); // a popup goes by itself (Esc, an outside press): look again
  }
  const wake = () => { lastActive = performance.now(); judge(); };
  function openMenu() {
    const had = host.querySelector('.stream-pill-menu') || document.querySelector('body > .stream-pill-menu');
    if (had) { had._closeCtl?.abort?.(); had.remove(); judge(); return; }
    const pop = createPopover(more, 'stream-pill-menu', on ? { parent: host } : {});
    pop.setAttribute('role', 'menu');
    for (const it of menu()) {
      if (it.separator) { const s = document.createElement('div'); s.className = 'stream-pill-menu-sep'; pop.append(s); continue; }
      const b = document.createElement('button'); b.type = 'button'; b.className = 'stream-pill-menu-item';
      b.setAttribute('role', it.checked == null ? 'menuitem' : 'menuitemcheckbox');
      if (it.checked != null) b.setAttribute('aria-checked', String(!!it.checked));
      b.textContent = (it.checked == null ? '' : it.checked ? '✓ ' : ' ') + it.label;
      b.onclick = () => { pop._closeCtl?.abort?.(); pop.remove(); try { it.action(more); } finally { judge(); } };
      pop.append(b);
    }
    judge();
  }
  more.onclick = () => openMenu();
  function enter() {
    on = true; ctl = new AbortController();
    const sig = { signal: ctl.signal };
    bar.classList.add('is-pill'); grip.hidden = false; more.hidden = false; fullBtn.textContent = t('Exit full screen');
    placeInCorner(bar, corner);
    // a move anywhere over the picture wakes it (a mouse / a pen); a touch only in its corner's zone, swallowed while it was away
    host.addEventListener('pointermove', (e) => { if (wakeVerdict({ type: 'pointermove', pointerType: e.pointerType }).wake) wake(); }, { capture: true, passive: true, ...sig });
    host.addEventListener('pointerdown', (e) => {
      if (bar.contains(e.target)) { wake(); return; }
      const r = host.getBoundingClientRect();
      const v = wakeVerdict({ type: 'pointerdown', pointerType: e.pointerType, pt: { x: e.clientX - r.left, y: e.clientY - r.top }, corner, box: { w: r.width, h: r.height }, shown: !bar.classList.contains('is-away') });
      if (v.swallow) { e.preventDefault(); e.stopPropagation(); swallowed = e.pointerId; }
      if (v.wake) wake();
    }, { capture: true, ...sig });
    for (const type of ['pointerup', 'pointercancel']) host.addEventListener(type, (e) => { if (swallowed != null && e.pointerId === swallowed) { e.stopPropagation(); swallowed = null; } }, { capture: true, ...sig });
    bar.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { hover = true; judge(); } }, sig);
    bar.addEventListener('pointerleave', () => { if (hover) { hover = false; wake(); } }, sig);
    // the drag: its grip or its bare background (a button, the summary keep their own press)
    bar.addEventListener('pointerdown', (e) => {
      if (e.target !== bar && !grip.contains(e.target)) return;
      e.preventDefault();
      dragToCorner(bar, host, bar, e, { signal: ctl.signal, onState: (d) => { dragging = d; judge(); }, onDrop: (c) => { if (!c) return; corner = c; placeInCorner(bar, c); saveCorner(hostId, c); wake(); } });
    }, sig);
    // a notice shown / hidden turns the verdict at once
    if (typeof MutationObserver === 'function') { watch = new MutationObserver(() => judge()); watch.observe(bar, { attributes: true, attributeFilter: ['hidden'], subtree: true, childList: true }); }
    wake();
  }
  function exit() {
    on = false; ctl?.abort(); ctl = null; watch?.disconnect(); watch = null; clearTimeout(timer); timer = null; swallowed = null; hover = false; dragging = false;
    bar.classList.remove('is-pill', 'is-away', 'is-dragging'); delete bar.dataset.why; delete bar.dataset.corner;
    bar.style.left = bar.style.right = bar.style.top = bar.style.bottom = '';
    grip.hidden = true; more.hidden = true; fullBtn.textContent = fullWords;
    host.querySelectorAll('.stream-pill-menu').forEach((p) => { p._closeCtl?.abort?.(); p.remove(); });
  }
  return {
    sync() { const full = typeof document !== 'undefined' && document.fullscreenElement === host; if (full && !on) enter(); else if (!full && on) exit(); },
    wake,
    dispose() { if (on) exit(); grip.remove(); more.remove(); },
    get state() { return { on, corner, away: bar.classList.contains('is-away') }; },
  };
}

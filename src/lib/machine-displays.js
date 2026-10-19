// lane desktop-display-modes (owner 2026-10-19 「多显示器：每个显示器一个窗口、所有显示器放进一个窗口，或在一个窗口里切换」): the
// PAGE half of a multi-display machine's three modes — the rules are PURE src/desktop-displays-layout.js; the window that uses
// this is src/lib/machine-desktop.js:
//   • the words and the SVG icons of the strip's mode control (单屏 · 切换 / 每显示器一窗 / 全部一窗) and a display's label
//     (its number, the machine's own name for it, its real pixels, HDR)
//   • this browser's per-machine memory of the mode, the display shown and the displays ① opened / ② folded
//   • THE PANES: every stream view of the window lives in a pane of the window's picture area — ONE pane that fills it (③, ①)
//     or a pane per display placed by paneLayout (②: the machine's arrangement scaled to fit, a pane folded to a tab-sized stub
//     and back); the keys follow the pointer (②: the pane the pointer last moved over takes the focus — displayAt — while the
//     window has it), a pane says why it shows nothing (a refusal, with its one act)
//   • THE STILL: the last picture of a view that is being replaced (a switch to another display) stays on screen until the new
//     stream's first picture — no blank frame between the two
import { t } from './i18n.js';
import { escHtml } from './utils.js';
import { modeOf, displayRows, paneLayout, displayAt, sumStats, rememberedOf } from '../desktop-displays-layout.js';

const MODES_KEY = 'vibespace.desktopModes'; // { [hostId]: { mode, display, displays, folded } } — this browser's per-machine choice
const readJson = (k) => { try { const o = JSON.parse(localStorage.getItem(k) || 'null'); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; } };

/** This browser's choice for the machine → { mode, display, displays, folded } (src/desktop-displays-layout.js rememberedOf). */
export function rememberedMode(hostId) { const o = readJson(MODES_KEY); return rememberedOf(o && o[hostId]); }
/** Remember (a patch of) the machine's choice. */
export function rememberMode(hostId, patch) {
  if (!hostId) return;
  const o = readJson(MODES_KEY) || {};
  o[hostId] = rememberedOf({ ...rememberedOf(o[hostId]), ...patch });
  try { localStorage.setItem(MODES_KEY, JSON.stringify(o)); } catch { /* storage refused: nothing remembered */ }
}
/** This browser on this device (the same tag the live browser view keeps): who opened a restored window. */
export function deviceTag() {
  try { let d = localStorage.getItem('vibespace.deviceTag'); if (!d || !/^[A-Za-z0-9_-]{4,40}$/.test(d)) { d = 'd' + Math.random().toString(36).slice(2, 12); localStorage.setItem('vibespace.deviceTag', d); } return d; } catch { return null; }
}
/** A phone shows one display at a time (③ only). */
export const isPhone = (app) => !!(app && app.isMobile) || (typeof innerWidth === 'number' && innerWidth < 600);
export { modeOf, displayRows, sumStats };

export const MODE_WORDS = { switch: () => t('One display · switch'), windows: () => t('A window per display'), all: () => t('All in one window') };
const svg = (d) => `<svg class="desktop-mode-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const MODE_ICONS = {
  switch: svg('<rect x="1.5" y="3" width="10" height="7" rx="1"/><path d="M13 5.5l1.5 1.5L13 8.5M6.5 12.5h0"/>'),
  windows: svg('<rect x="1" y="2.5" width="6.5" height="5" rx="1"/><rect x="8.5" y="6.5" width="6.5" height="5" rx="1"/><path d="M4 7.5V9M11.5 11.5V13"/>'),
  all: svg('<rect x="1" y="2.5" width="14" height="9" rx="1"/><path d="M8 2.5v9M5.5 14h5"/>'),
};
/** The mode control's menu row: the icon (ours) + the words (escaped). */
export const modeRowHtml = (mode, on) => `${on ? '✓ ' : ' '}${MODE_ICONS[mode]} ${escHtml(MODE_WORDS[mode]())}`;
/** A display in words: the machine's own name for it, else "Display n". */
export const displayName = (row) => row.name || t('Display {n}', { n: row.n });
/** The switcher's label of a display: its number, name, real pixels and HDR. */
export const displayLabel = (row) => `${row.n} · ${displayName(row)} · ${row.px.w}×${row.px.h}${row.hdr ? ' · HDR' : ''}`;

/** THE STILL: the view's last picture drawn onto a canvas in `host` (null when nothing was decoded). */
export function stillOf(view, host) {
  const v = view && view.video;
  if (!v || !v.videoWidth || !host) return null;
  const c = document.createElement('canvas'); c.className = 'desktop-display-still'; c.width = v.videoWidth; c.height = v.videoHeight;
  try { c.getContext('2d').drawImage(v, 0, 0); } catch { return null; }
  host.append(c);
  return c;
}

const FOLD_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg>';
/**
 * THE PANES of the window's picture area `area`. `onFold(id, folded)` = a pane's fold button / a stub's press. → { pane(id),
 * remove(id), place({rows, all, folded}), say(id, text, act?), lastPointer(), dispose() } — pane(id) is the element a stream
 * view goes into (made on first ask); place() fills the area with the one pane (all = false) or lays every display's pane out.
 */
export function createDisplayPanes(area, { onFold = () => { } } = {}) {
  const panes = new Map(); // display id ('' = not known yet) → { el, fold, say }
  const stubsEl = document.createElement('div'); stubsEl.className = 'desktop-display-stubs';
  area.append(stubsEl);
  let layout = null, last = null, all = false;
  function pane(id) {
    const k = id == null ? '' : String(id);
    let p = panes.get(k);
    if (p) return p.el;
    const el = document.createElement('div'); el.className = 'desktop-display-pane'; el.dataset.display = k;
    const fold = document.createElement('button'); fold.type = 'button'; fold.className = 'desktop-display-fold'; fold.innerHTML = FOLD_ICON; fold.hidden = true;
    fold.title = t('Collapse'); fold.setAttribute('aria-label', t('Collapse'));
    fold.onclick = (e) => { e.stopPropagation(); onFold(el.dataset.display, true); };
    el.append(fold);
    area.append(el);
    p = { el, fold, say: null };
    panes.set(k, p);
    return el;
  }
  /** The pane a view started before its display was known takes that display's id. */
  function rename(from, to) {
    const p = panes.get(from == null ? '' : String(from)), k = String(to);
    if (!p || panes.has(k)) return;
    panes.delete(from == null ? '' : String(from)); panes.set(k, p); p.el.dataset.display = k;
  }
  function remove(id) { const k = id == null ? '' : String(id), p = panes.get(k); if (!p) return; p.el.remove(); panes.delete(k); }
  function place({ rows = [], all: many = false, folded = [] } = {}) {
    all = many;
    const list = displayRows(rows);
    if (!all) {
      layout = null; stubsEl.replaceChildren(); stubsEl.hidden = true;
      for (const p of panes.values()) { p.el.style.cssText = ''; p.el.hidden = false; p.fold.hidden = true; }
      return;
    }
    layout = paneLayout({ displays: list, width: area.clientWidth, height: area.clientHeight, collapsed: folded });
    for (const [k, p] of panes) {
      const r = layout.panes.find((x) => x.id === k);
      p.el.hidden = !r; p.fold.hidden = !r;
      if (r) p.el.style.cssText = `inset:auto;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
    }
    stubsEl.replaceChildren(...layout.stubs.map((s) => {
      const row = list.find((d) => d.id === s.id);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'desktop-display-stub'; b.dataset.display = s.id;
      b.style.cssText = `left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px`;
      b.textContent = `${row.n} · ${displayName(row)}`; b.title = `${t('Expand')} · ${displayLabel(row)}`;
      b.onclick = () => onFold(s.id, false);
      return b;
    }));
    stubsEl.hidden = !layout.stubs.length;
  }
  /** A pane's sentence (a refusal) with its one act, or none (text = ''). */
  function say(id, text, act = null) {
    const p = panes.get(id == null ? '' : String(id)); if (!p) return;
    if (p.say) { p.say.remove(); p.say = null; }
    if (!text) return;
    const box = document.createElement('div'); box.className = 'desktop-display-say';
    const words = document.createElement('span'); words.textContent = text; box.append(words);
    if (act) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-create desktop-display-say-act'; b.textContent = act.label; b.onclick = act.run; box.append(b); }
    p.el.append(box); p.say = box;
  }
  // ② the keys follow the pointer: the pane it moves over takes the focus — only while this window holds it (never stolen
  // from another window the pointer merely crosses)
  const onMove = (e) => {
    if (!all || !layout) return;
    const r = area.getBoundingClientRect(), z = r.width / (area.clientWidth || 1) || 1;
    const id = displayAt(layout, (e.clientX - r.left) / z, (e.clientY - r.top) / z);
    if (!id || id === last) return;
    last = id;
    const v = panes.get(id) && panes.get(id).el.querySelector('.stream-video');
    if (v && area.contains(document.activeElement) && document.activeElement !== v) v.focus({ preventScroll: true });
  };
  area.addEventListener('pointermove', onMove);
  return { pane, rename, remove, place, say, has: (id) => panes.has(id == null ? '' : String(id)), lastPointer: () => last, layout: () => layout,
    dispose() { area.removeEventListener('pointermove', onMove); for (const p of panes.values()) p.el.remove(); panes.clear(); stubsEl.remove(); } };
}

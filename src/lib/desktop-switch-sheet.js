// THE DESKTOP SWITCH SHEET (lane desktop-switch-phone, 2026-10-25 — userW on the Duo's inner display: «如何在这个界面下切换桌面？»).
// The virtual-desktop switcher's home is the taskbar's corner (desktop-manager.js _renderSwitcher); where the taskbar is not
// drawn — the compact class and the regular class — this sheet is its door (the nav's Desktops button, src/lib/mobile-nav.js).
// ONE sheet over the PURE model (src/desktop-switch.js): one 44 px row per desktop — its name, the active mark, «N windows»,
// up to three window titles greyed, the held record's count of windows this page has not built — then «+ New desktop».
// A tap = the caller's switch (the manager's own road, then the desktop's window on show); a long press / right-click on a
// row = the desktop's DOORS — THE table's (src/desktop-switch.js desktopDoors, lane desktop-doors-table): Rename… · Delete ·
// Move up · Move down (a phone has no drag: these two are its order), a shut one greyed with its why — through the
// manager's ONE builder (_deskItems, tier 'phone': its handlers and its done/after cancel guard). Open, it FOLLOWS a remote
// change (round 2: the manager's `vs-desktops`): renamed, moved, added — redrawn; a desktop deleted on another screen keeps
// its row greyed with the why that names it (its tap and its doors say the same words). The product's existing
// sheet: the phone's `.mobile-sheet` context menu under the nav on the compact class (the «+» long-press sheet's pattern), a
// context menu beside the button on the regular class (the ⋯'s placement) — never a new component. Esc / an outside press
// close it (showContextMenu's own popover rules); the rows' long-press listeners hang on the sheet's own AbortController,
// aborted on EVERY road that takes the sheet out of the page (round 3: untilGone — a dismissed sheet kept its listener).
import { t } from './i18n.js';
import { escHtml, showContextMenu, uiScale } from './utils.js';
import { UI_ICONS } from './icons.js';
import { desktopRows, switchVerdict, sheetItems, followDesktops } from '../desktop-switch.js';

/** The model's input from the live page: the manager's desktops, the windows this page built on each (with their stacking),
 *  the entries each held record lists that the page has not built. `drawn` = the rows an open list showed, redrawn on a
 *  remote change (r2 ①, PURE followDesktops): a desktop deleted elsewhere keeps its row, `gone`. */
export function sheetRows(app, drawn = null) {
  const dm = app.desktopManager, wm = app.wm;
  if (!dm) return [];
  const desktops = drawn ? followDesktops({ drawn, desktops: dm.desktops }) : dm.desktops;
  const zOf = (w) => { const f = (w._tabChain && wm.windows.get(w._tabChain.tabs[0])) || w; return parseInt(f.element?.style?.zIndex, 10) || 0; };
  const windowsByDesktop = {}, heldByDesktop = {};
  for (const w of wm.windows.values()) {
    if (!w._desktopId || w._isStagePlaceholder) continue;
    (windowsByDesktop[w._desktopId] ||= []).push({ title: w.title || '', z: zOf(w) });
  }
  for (const d of desktops) {
    const held = (dm._savedStates?.get(d.id)?.windows || []).filter((ws) => { const id = ws && (ws.winId || ws.id); return id && !wm.windows.has(id); });
    heldByDesktop[d.id] = held.map((ws) => ({ title: ws.title || '', z: Number(ws.zIndex) || 0 }));
  }
  return desktopRows({ desktops, activeId: dm.activeDesktopId, windowsByDesktop, heldByDesktop });
}

let openCtl = null;

/** A surface's listeners live while it is IN THE PAGE (r3 ①, the listener lifecycle law): `ctl` is aborted the moment `el`
 *  leaves it — by ANY road: its own closers, an outside press, Esc's blind `[data-popover]` remove, a row's tap, the next
 *  open, the phone's Back (mobile-back.js) or a class change (viewport-switch.js) — never left for the next open or the next
 *  remote change to find (25151f0b: one `vs-desktops` listener + its detached list per dismissed switcher). */
export function untilGone(el, ctl) {
  if (!el?.isConnected) { ctl.abort(); return ctl.signal; }
  const mo = new MutationObserver(() => { if (!el.isConnected) ctl.abort(); });
  mo.observe(el.parentNode, { childList: true });
  ctl.signal.addEventListener('abort', () => mo.disconnect(), { once: true });
  return ctl.signal;
}

/** The regular class: the sheet stands INSIDE the viewport over the conversation column (主开发's defect on 8fda0ac8 — it took
 *  its rows' max-content width, ~1790 px with long titles, anchored at the bar's edge, and ran off the LEFT of the screen):
 *  its width = the column's (less 4 px each side), at most 480 px; its right edge at the trailing bar's left edge (landscape)
 *  or at the column's right under the bar lying over it (portrait); its top at the button's (clamped). The rows ellipsize. */
export function placeOverColumn(menu, ar) {
  const Z = uiScale(), nav = document.getElementById('mobile-nav');
  const nr = nav?.getBoundingClientRect?.(), col = document.getElementById('workspace')?.getBoundingClientRect?.();
  const vertical = !!nav && getComputedStyle(nav).flexDirection === 'column';
  const colL = col && col.width ? Math.max(0, col.left) : 0, colR = col && col.width ? Math.min(innerWidth, col.right) : innerWidth;
  const right = Math.min(colR, vertical && nr ? nr.left : innerWidth) - 4;
  const w = Math.max(0, Math.min(480, right - (colL + 4)));
  menu.style.width = (w / Z) + 'px'; menu.style.minWidth = '0'; menu.style.maxWidth = 'none';
  menu.style.left = ((right - w) / Z) + 'px'; menu.style.right = '';
  const h = menu.getBoundingClientRect().height;
  const want = vertical ? ar.top : ar.bottom + 4;
  menu.style.top = (Math.max(4, Math.min(want, innerHeight - h - 4)) / Z) + 'px'; menu.style.bottom = '';
}

/** Open the sheet from `anchor` (the nav's Desktops button). `onSwitch(id)` = the switch road (MobileNav.switchDesktop);
 *  `drawn` = the rows it showed when a remote change redraws it (r2 ①). */
export function openDesktopSheet(app, anchor, { onSwitch, drawn = null } = {}) {
  const dm = app.desktopManager;
  if (!dm || typeof onSwitch !== 'function') return null;
  openCtl?.abort();
  const ctl = new AbortController();
  openCtl = ctl;
  const rows = sheetRows(app, drawn);
  const mark = (svg) => `<span class="mdesk-mark">${svg || ''}</span>`;
  // THE sheet's rows (PURE sheetItems): each desktop's switch door with its words, then the 'new' door — the table's words
  const items = sheetItems(rows, { t }).map((s) => (s.door === 'new'
    ? { labelHtml: `${mark(UI_ICONS.plus)}<span class="mdesk-text"><span class="mdesk-name">${escHtml(s.label)}</span></span>`, action: () => { ctl.abort(); onSwitch(dm.createDesktop()); } }
    : {
      labelHtml: `${mark(s.active ? UI_ICONS.check : '')}<span class="mdesk-text"><span class="mdesk-line"><span class="mdesk-name">${escHtml(s.name)}</span><span class="mdesk-count">${escHtml(s.count)}</span></span>${s.sub ? `<span class="mdesk-titles">${escHtml(s.sub)}</span>` : ''}</span>`,
      title: s.title,
      action: () => { ctl.abort(); go(rows.find((x) => x.id === s.id)); },
    }));
  const go = (r) => {
    const v = switchVerdict({ from: dm.activeDesktopId, to: r.id, name: r.name, rows: sheetRows(app) });
    if (v.act === 'refused') return void dm._doorRefused({ id: r.id, name: v.name }, 'switch'); // the switch door's why — THE table's words (r3 ④: a literal of its own here)
    onSwitch(r.id); // 'none' too: the desktop on show keeps its window on show (the phone re-shows it)
  };
  const regular = app.viewportClass?.() === 'regular';
  const ar = anchor?.getBoundingClientRect?.() || { left: 0, top: 0, right: 0, bottom: 0 };
  const menu = showContextMenu(regular ? ar.left : 0, regular ? ar.top : 0, items);
  menu.classList.add('mdesk-menu');
  untilGone(menu, ctl); // every road that takes the sheet out of the page aborts its listeners (r3 ①: its dismiss left one)
  if (!regular) menu.classList.add('mobile-sheet'); // the phone's sheet under the nav (mobile-nav.js _sheet's own two lines)
  else placeOverColumn(menu, ar);
  menu.querySelectorAll('.context-menu-item').forEach((el, i) => {
    const r = rows[i];
    if (!r) { el.classList.add('mdesk-new'); return; }
    el.dataset.desktopId = r.id;
    el.classList.toggle('active', r.active);
    el.classList.toggle('mdesk-gone', !!r.gone); // deleted on another screen while the sheet was open: greyed, its why on its second line
    // a long press (touch: the synthesized contextmenu) / a right-click = the desktop's DOORS — the manager's ONE builder on
    // the phone tier (every door of THE table, a shut one greyed with its why; its handlers, its done/after guard: a
    // cancelled Rename… brings nothing back). Once an act is done: after a delete the desktop on show re-shows its window
    // (the deleted one's windows moved to the next desktop — the taskbar's own delete), after any other the sheet comes
    // back on its new state (a rename's name, a move's order — a second move is one press away)
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      ctl.abort();
      const desk = dm.desktops.find((d) => d.id === r.id) || { id: r.id, name: r.name }; // gone meanwhile: its doors say so by the name the row showed (r2 ①) — never a press that opens nothing
      const after = () => (dm.desktops.some((d) => d.id === desk.id) ? setTimeout(() => { if (anchor?.isConnected) openDesktopSheet(app, anchor, { onSwitch }); }, 0) : onSwitch(dm.activeDesktopId));
      showContextMenu(e.clientX, e.clientY, dm._deskItems(desk, { tier: 'phone', after }), 'context-menu', { extraClass: 'mdesk-doors' });
    }, { signal: ctl.signal });
  });
  // a remote change redraws the sheet while it is open, from the rows it drew (the manager's _followOpenLists says when)
  window.addEventListener('vs-desktops', () => {
    if (!menu.isConnected || !anchor?.isConnected) return;
    const top = menu.scrollTop, again = openDesktopSheet(app, anchor, { onSwitch, drawn: rows });
    if (again) again.scrollTop = top;
  }, { signal: ctl.signal });
  return menu;
}

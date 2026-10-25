// THE DESKTOP SWITCH SHEET (lane desktop-switch-phone, 2026-10-25 — userW on the Duo's inner display: «如何在这个界面下切换桌面？»).
// The virtual-desktop switcher's home is the taskbar's corner (desktop-manager.js _renderSwitcher); where the taskbar is not
// drawn — the compact class and the regular class — this sheet is its door (the nav's Desktops button, src/lib/mobile-nav.js).
// ONE sheet over the PURE model (src/desktop-switch.js): one 44 px row per desktop — its name, the active mark, «N windows»,
// up to three window titles greyed, the held record's count of windows this page has not built — then «+ New desktop».
// A tap = the caller's switch (the manager's own road, then the desktop's window on show); a long press / right-click on a
// row = Rename · Delete (the manager's own verbs and dialogs, as the switcher tab's long press). The product's existing
// sheet: the phone's `.mobile-sheet` context menu under the nav on the compact class (the «+» long-press sheet's pattern), a
// context menu beside the button on the regular class (the ⋯'s placement) — never a new component. Esc / an outside press
// close it (showContextMenu's own popover rules); the rows' long-press listeners hang on the sheet's own AbortController.
import { t } from './i18n.js';
import { escHtml, showContextMenu, showToast, uiScale } from './utils.js';
import { UI_ICONS } from './icons.js';
import { desktopRows, switchVerdict, rowWords } from '../desktop-switch.js';

/** The model's input from the live page: the manager's desktops, the windows this page built on each (with their stacking),
 *  the entries each held record lists that the page has not built. */
export function sheetRows(app) {
  const dm = app.desktopManager, wm = app.wm;
  if (!dm) return [];
  const zOf = (w) => { const f = (w._tabChain && wm.windows.get(w._tabChain.tabs[0])) || w; return parseInt(f.element?.style?.zIndex, 10) || 0; };
  const windowsByDesktop = {}, heldByDesktop = {};
  for (const w of wm.windows.values()) {
    if (!w._desktopId || w._isStagePlaceholder) continue;
    (windowsByDesktop[w._desktopId] ||= []).push({ title: w.title || '', z: zOf(w) });
  }
  for (const d of dm.desktops) {
    const held = (dm._savedStates?.get(d.id)?.windows || []).filter((ws) => { const id = ws && (ws.winId || ws.id); return id && !wm.windows.has(id); });
    heldByDesktop[d.id] = held.map((ws) => ({ title: ws.title || '', z: Number(ws.zIndex) || 0 }));
  }
  return desktopRows({ desktops: dm.desktops, activeId: dm.activeDesktopId, windowsByDesktop, heldByDesktop });
}

let openCtl = null;

/** Open the sheet from `anchor` (the nav's Desktops button). `onSwitch(id)` = the switch road (MobileNav.switchDesktop). */
export function openDesktopSheet(app, anchor, { onSwitch } = {}) {
  const dm = app.desktopManager;
  if (!dm || typeof onSwitch !== 'function') return null;
  openCtl?.abort();
  const ctl = new AbortController();
  openCtl = ctl;
  const rows = sheetRows(app);
  const mark = (svg) => `<span class="mdesk-mark">${svg || ''}</span>`;
  const items = rows.map((r) => {
    const w = rowWords(r, { t });
    const sub = [w.titles, w.held].filter(Boolean).join(' — ');
    return {
      labelHtml: `${mark(r.active ? UI_ICONS.check : '')}<span class="mdesk-text"><span class="mdesk-line"><span class="mdesk-name">${escHtml(r.name)}</span><span class="mdesk-count">${escHtml(w.count)}</span></span>${sub ? `<span class="mdesk-titles">${escHtml(sub)}</span>` : ''}</span>`,
      action: () => { ctl.abort(); go(r); },
    };
  });
  items.push({ labelHtml: `${mark(UI_ICONS.plus)}<span class="mdesk-text"><span class="mdesk-name">${escHtml(t('New desktop'))}</span></span>`, action: () => { ctl.abort(); onSwitch(dm.createDesktop()); } });
  const go = (r) => {
    const v = switchVerdict({ from: dm.activeDesktopId, to: r.id, name: r.name, rows: sheetRows(app) });
    if (v.act === 'refused') { showToast(t('“{name}” is no longer there', { name: v.name }), { type: 'info', duration: 4000 }); return; }
    onSwitch(r.id); // 'none' too: the desktop on show keeps its window on show (the phone re-shows it)
  };
  const regular = app.viewportClass?.() === 'regular';
  const ar = anchor?.getBoundingClientRect?.() || { left: 0, top: 0, right: 0, bottom: 0 };
  const menu = showContextMenu(regular ? ar.left : 0, regular ? ar.top : 0, items);
  menu.classList.add('mdesk-menu');
  if (!regular) menu.classList.add('mobile-sheet'); // the phone's sheet under the nav (mobile-nav.js _sheet's own two lines)
  else {
    const Z = uiScale(), nav = document.getElementById('mobile-nav');
    if (nav && getComputedStyle(nav).flexDirection === 'column') { menu.style.left = 'auto'; menu.style.right = ((innerWidth - ar.left + 8) / Z) + 'px'; }
    else { menu.style.top = ((ar.bottom + 4) / Z) + 'px'; menu.style.bottom = ''; menu.style.left = 'auto'; menu.style.right = (Math.max(4, innerWidth - ar.right) / Z) + 'px'; }
  }
  menu.querySelectorAll('.context-menu-item').forEach((el, i) => {
    const r = rows[i];
    if (!r) { el.classList.add('mdesk-new'); return; }
    el.dataset.desktopId = r.id;
    el.classList.toggle('active', r.active);
    // a long press (touch: the synthesized contextmenu) / a right-click = the desktop's own verbs (the switcher tab's long press)
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      ctl.abort();
      const desk = dm.desktops.find((d) => d.id === r.id);
      if (!desk) return;
      const verbs = [{ label: t('Rename'), action: () => dm._startRename(desk) }];
      if (dm.desktops.length > 1) verbs.push({ label: t('Delete'), style: 'color:var(--red, #e55)', action: async () => { await dm.deleteDesktop(desk.id); onSwitch(dm.activeDesktopId); } }); // its windows move to the next desktop (the taskbar's own delete)
      showContextMenu(e.clientX, e.clientY, verbs);
    }, { signal: ctl.signal });
  });
  return menu;
}

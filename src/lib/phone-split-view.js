// THE PHONE'S SIDE BY SIDE, DRAWN (lane phone-six, 2026-10-26 — userW's wish, the owner's framing 「不是窗口，只能支持左右分屏」;
// the verdicts are PURE src/phone-split.js). Two windows of the active desktop stand as the LEFT and RIGHT panes of the
// phone's window area, each exactly the phone's window (its own tabs, its own scroll, the chat, its head naming it), a fixed
// 8 px divider between them — no drag. The door is the window switcher's «Split» beside a window (mobile-nav.js: put it
// beside the window on show); a pane's ✕ ends the split (the other pane stays on show). The pair is THIS TAB's
// (sessionStorage `vibespace.phoneSplit`, beside `vibespace.phoneShown`): a reload restores it, no other device sees it,
// nothing is written to the layout record. A room under the bound (a rotation to portrait, the list column shown) shows the
// pane on show alone and keeps the pair; the room back restores it. Round 2 (the acceptance): the room IS the window area the
// panes may use now — the list column shown takes its width (the split collapses), hidden again gives it back (it returns);
// only «Split»'s own verdict counts the column, which its press hides. A pair never names a window that cannot stand: «Split»
// beside a minimized window restores it first, and a pane's window minimized, closed or moved away ends the split, SAID.
import { t } from './i18n.js';
import { showToast } from './utils.js';
import { splitVerdict, splitLayout, pairFor, closePane } from '../phone-split.js';

const SPLIT_KEY = 'vibespace.phoneSplit'; // { [desktopId]: [leftFrameId, rightFrameId] } — this tab's own
function readPairs() {
  try { const v = JSON.parse(sessionStorage.getItem(SPLIT_KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

/** Install on the phone's nav (MobileNav builds it). → { apply, offer, open, close, panes }. */
export function installPhoneSplit(app) {
  const pairs = readPairs();
  const root = document.documentElement;
  let painted = null; // { left, right } frame ids on screen
  const save = () => { try { sessionStorage.setItem(SPLIT_KEY, JSON.stringify(pairs)); } catch { } };
  const desk = () => app.desktopManager?.activeDesktopId || '';
  /** The frame a window is drawn in (a tab group's host). */
  const frameOf = (id) => { const w = id && app.wm.windows.get(id); return w ? (w._tabChain && w._tabChain.tabs[0]) || w.id : null; };
  const onDesk = (w) => !!w && !w._hiddenByDesktop && !w._hiddenByStage && !(desk() && w._desktopId && w._desktopId !== desk());
  /** The frames this desktop can show now (built, not minimized, not a guest). */
  const alive = () => [...app.wm.windows.values()].filter((w) => onDesk(w) && !(w._tabChain && w._tabChain.tabs[0] !== w.id) && !w.isMinimized).map((w) => w.id);
  /** The room the panes may use NOW: the window area (the list column shown takes its width — the split collapses). */
  const room = () => document.getElementById('workspace')?.offsetWidth || 0;
  /** The list column on show (the regular class): «Split» hides it, so its own verdict counts its width back. */
  const listColumn = () => (app.viewportClass?.() === 'regular' && !root.classList.contains('vs-list-hidden') ? document.getElementById('sidebar')?.offsetWidth || 0 : 0);
  /** The room the same screen would give turned to landscape (the regular class's 56 px bar beside it), portrait only. */
  const turnedRoom = () => (window.innerHeight > window.innerWidth ? Math.max(window.screen?.width || 0, window.screen?.height || 0) - 56 : null);
  /** «Split»'s verdict: the room its press makes (the window area + the list column it hides). */
  const verdict = () => splitVerdict({ room: room() + listColumn(), turnedRoom: turnedRoom() });
  /** A pane's window that can no longer stand: minimized, moved to another desktop, or closed after it stood (a window not
   *  built yet — a reload's lazy replay — is none of these). */
  const seen = new Set();
  const deadIn = (pair, d) => (pair || []).find((id) => {
    const w = app.wm.windows.get(id);
    if (!w) return seen.has(id);
    return !!w.isMinimized || !!(d && w._desktopId && w._desktopId !== d);
  }) || null;

  const divider = () => {
    let d = document.getElementById('phone-split-divider');
    if (!d) { d = document.createElement('div'); d.id = 'phone-split-divider'; d.setAttribute('aria-hidden', 'true'); document.getElementById('workspace')?.appendChild(d); }
    return d;
  };
  const fitPanes = (ids) => requestAnimationFrame(() => {
    for (const f of ids) {
      const w = app.wm.windows.get(f);
      for (const id of (w?._tabChain?.tabs || [f])) { try { app.sessions.get(id)?.fit?.(); } catch { } }
    }
  });
  /** Draw `want` ({ left, right } or null) — the panes' marks, their heads' ✕, the divider; the views re-measure. */
  function paint(want) {
    const was = painted ? [painted.left, painted.right] : [];
    for (const id of was) {
      const el = app.wm.windows.get(id)?.element;
      if (!el) continue;
      el.classList.remove('phone-pane'); delete el.dataset.pane;
      el.querySelector(':scope > .window-titlebar > .phone-pane-close')?.remove();
    }
    painted = want;
    root.classList.toggle('vs-split', !!want);
    if (want) {
      for (const [side, id] of [['left', want.left], ['right', want.right]]) {
        const el = app.wm.windows.get(id)?.element;
        if (!el) continue;
        el.classList.add('phone-pane'); el.dataset.pane = side;
        const bar = el.querySelector(':scope > .window-titlebar');
        if (bar && !bar.querySelector(':scope > .phone-pane-close')) {
          const x = document.createElement('button');
          x.type = 'button'; x.className = 'phone-pane-close'; x.textContent = '✕';
          x.title = t('Close the split'); x.setAttribute('aria-label', x.title);
          x.addEventListener('click', (e) => { e.stopPropagation(); close(id); });
          bar.appendChild(x);
        }
      }
      divider();
    }
    app.wm.syncHiddenViews?.(); // the pane beside the active one is drawn: its view is no hidden tab (window.js _deriveHiders)
    fitPanes([...was, ...(want ? [want.left, want.right] : [])]);
  }
  /** Bring the screen to the rule now (every window change, a desktop change, a resize of the window area). */
  function apply() {
    if (!app.isMobile) { if (painted) paint(null); return null; }
    const d = desk(), a = app.wm.windows.get(app.wm.activeWindowId);
    if (a && !onDesk(a)) return null; // a desktop switch's in-between: the old desktop's window is still the active one
    // a pane's window minimized, closed or moved away: the split is over — said, never a pair kept for nothing
    if (pairs[d] && app._mobileNav?._shownBooted && deadIn(pairs[d], d)) {
      delete pairs[d]; save();
      showToast(t('The split ended: one of its windows was minimized, closed or moved to another desktop'), { type: 'info' });
    }
    const v = splitLayout({ pair: pairs[d] || null, shown: frameOf(app.wm.activeWindowId), alive: alive(), room: room() });
    if (pairs[d]) for (const id of pairs[d]) if (app.wm.windows.has(id)) seen.add(id);
    // the split is over when the person showed another window ('other' — never during the boot's restore) or a pane's
    // window is gone for good; a pane not built yet (a reload's lazy replay) keeps the pair
    if (v.mode === 'single' && v.why === 'other' && pairs[d] && app._mobileNav?._shownBooted) { delete pairs[d]; save(); }
    const want = v.mode === 'split' ? { left: v.pair[0], right: v.pair[1] } : null;
    if ((want && painted && want.left === painted.left && want.right === painted.right) || (!want && !painted)) return v;
    paint(want);
    return v;
  }
  /** The switcher row's door for window `id`: null (the window on show, a tab of its group, already a pane) or the verdict
   *  ({ ok, why, words }) — a refusal keeps its words. */
  function offer(id) {
    const f = frameOf(id), shown = frameOf(app.wm.activeWindowId);
    if (!f || !shown || f === shown || (painted && (painted.left === f || painted.right === f))) return null;
    return verdict();
  }
  /** «Split» beside window `id`: it stands beside the window on show. A refusal is said (a toast), never silent; a
   *  minimized window is restored first (the switcher's Minimized row — never a pair naming a window that cannot stand). */
  function open(id) {
    const v = verdict();
    if (!v.ok) { showToast(t(v.words)); return false; }
    const pair = pairFor({ shown: frameOf(app.wm.activeWindowId), pick: id, pair: pairs[desk()] || null, frameOf });
    if (!pair) return false;
    // restored BEFORE the pair is kept (the restore's own notices run apply(), which drops a pair naming a minimized window)
    if (app.wm.windows.get(frameOf(id))?.isMinimized) app.wm.revealWindow(id); // and the one on show (its pane active)
    pairs[desk()] = pair; save();
    // the split takes the list column's room (☰ shows the list again — the split collapses while it stands)
    if (listColumn()) app.sidebar?.setListHidden?.(true);
    apply();
    return true;
  }
  /** A pane's ✕: the split ends, the other pane is the window on show. */
  function close(paneId) {
    const d = desk(), other = closePane(pairs[d] || (painted ? [painted.left, painted.right] : null), paneId);
    delete pairs[d]; save();
    paint(null);
    if (other && frameOf(app.wm.activeWindowId) !== other) app.wm.focusWindow(other);
    app._updateMobileNavTitle?.();
  }
  try { new ResizeObserver(() => apply()).observe(document.getElementById('workspace')); } catch { }
  /** A pane's window took a new id (MobileNav.followRekey — wm.rekeyWindow, layout.js's restore remap; r1793): the pair, the
   *  painted panes and the seen set name it under the new id — a pane re-keyed is never ended as «closed». → whether it named it */
  const rekey = (oldId, newId) => {
    const o = String(oldId), n = String(newId);
    let hit = false;
    for (const d of Object.keys(pairs)) if (Array.isArray(pairs[d]) && pairs[d].includes(o)) { pairs[d] = pairs[d].map((id) => (id === o ? n : id)); hit = true; }
    if (painted) for (const k of ['left', 'right']) if (painted[k] === o) { painted[k] = n; hit = true; }
    if (seen.delete(o)) { seen.add(n); hit = true; }
    if (hit) save();
    return hit;
  };
  return { apply, offer, open, close, rekey, panes: () => (painted ? [painted.left, painted.right] : null) };
}

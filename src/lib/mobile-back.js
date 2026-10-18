// THE PHONE'S BACK GESTURE, WIRED (lane mobile-back-guard, 2026-10-18; every decision is PURE in ./back-guard.js).
// App installs it only when app.isMobile — a desktop browser's back is never touched. ONE sentinel history entry stands
// above the page's own; a back press is a popstate onto the page's entry, and then:
//   close — the topmost layer closes exactly as Esc / its own ✕ / the sidebar's ‹ row would (the window area yields
//           to the sidebar, the phone's home), then history.go(1) steps back onto the same sentinel
//   arm   — at home: the 「再返回一次退出」 toast, and the page stays on its own entry for BACK_WINDOW_MS, so a second
//           back is the browser's own and leaves (also when VibeSpace is the tab's first page); after the window a
//           timer steps back onto the sentinel (a later back re-arms)
//   leave — the Mobile setting was turned off (or an odd stack): keep going back
// Re-arming is a TRAVERSAL (go(1)), never a fresh pushState — see back-guard.js's head for the measured reason.
import { t } from './i18n.js';
import { showToast, noteOwnGesture } from './utils.js';
import { BACK_WINDOW_MS, BACK_DISMISS_EVENT, isSentinel, bootStep, backTarget, backVerdict } from './back-guard.js';

export const BACK_SETTING = 'mobile.backGuard';
const shown = (el) => !!el && !el.classList.contains('hidden');

/** The open layers right now (backTarget's snapshot) and how each one closes. */
function layersOf(app) {
  const sb = app.sidebar;
  const shells = [...document.querySelectorAll('.dialog-overlay')].filter((o) => o.id !== 'dialog-overlay' && shown(o)); // createModalShell overlays (z 99998, above the static one)
  const sheets = [...document.querySelectorAll('.usage-popup')].filter(shown); // the For-you tray + the usage popup — full-width sheets on a phone
  const backRow = sb?._mobileDrilldown ? sb.listEl?.querySelector('.mobile-folder-back') : null;
  const snap = {
    popover: !!document.querySelector('[data-popover]'),
    dialog: shells.length > 0 || shown(document.getElementById('dialog-overlay')),
    switcher: !!document.querySelector('.mobile-win-switcher'),
    sheet: sheets.length > 0,
    sidebarOpen: !!sb?.isOpen,
    drilldown: !!backRow,
  };
  const close = {
    popover: () => document.querySelectorAll('[data-popover]').forEach((el) => el.remove()), // Esc's own rule: every float at once
    dialog: () => { // the topmost shell through its ✕ (its onClose / a dialog promise's cancel runs), else the static overlay
      const top = shells[shells.length - 1];
      if (!top) { app.hideDialogs(); return; }
      const x = top.querySelector('.dialog-close');
      if (x) x.click(); else top.remove();
    },
    switcher: () => document.querySelectorAll('.mobile-win-switcher').forEach((el) => el.remove()),
    sheet: () => { for (const el of sheets) if (el.dispatchEvent(new CustomEvent(BACK_DISMISS_EVENT, { cancelable: true }))) el.classList.add('hidden'); },
    window: () => sb.toggle(true),
    drilldown: () => backRow.click(),
  };
  return { snap, close };
}

export function installMobileBack(app) {
  const enabled = () => app.settings?.get(BACK_SETTING) !== false;
  const deepLink = !!location.search; // a `?` link opened a specific place: its first back closes no window (backVerdict)
  let lastBackAt = 0, backs = 0, gen = 0, restand = null;
  let baseHref = location.href; // the page entry the sentinel stands above (pushState('') keeps the URL)
  const push = () => { baseHref = location.href; history.pushState({ vs: 1 }, ''); };
  /** Step back onto the sentinel; when no forward entry answers (a same-document navigation dropped it), push one. */
  const forward = () => {
    restand = null;
    if (isSentinel(history.state)) return;
    const g = ++gen;
    history.go(1);
    setTimeout(() => { if (g === gen && !isSentinel(history.state) && enabled()) push(); }, 500);
  };
  if (bootStep({ phone: true, enabled: enabled(), state: history.state }) === 'push') push();
  window.addEventListener('popstate', (e) => {
    gen++;
    if (isSentinel(e.state)) return; // our own step forward landing
    // a same-document navigation to another URL (a #fragment link in rendered markdown) is no back press: stand above it
    if (location.href !== baseHref) { clearTimeout(restand); restand = null; push(); return; }
    clearTimeout(restand); restand = null;
    const { snap, close } = layersOf(app);
    const target = backTarget(snap), now = Date.now();
    const v = backVerdict({ phone: true, enabled: enabled(), target, lastBackAt, now, deepLinkFirst: deepLink && backs === 0 });
    backs++;
    if (v.action === 'close') {
      try { close[target](); } catch (err) { console.warn('back gesture: closing the', target, 'failed', err); }
      forward();
    } else if (v.action === 'arm') {
      lastBackAt = now;
      noteOwnGesture(); // the person's own act — the toast is not an unread notification
      showToast(t(v.toast), { duration: BACK_WINDOW_MS });
      restand = setTimeout(forward, BACK_WINDOW_MS);
    } else if (v.action === 'leave') {
      lastBackAt = 0;
      history.back();
    }
  });
  // turned on later (the boot saw it off): stand a sentinel now; turned off: the next back leaves (backVerdict)
  app.settings?.on?.(BACK_SETTING, (on) => { if (on !== false && !isSentinel(history.state)) push(); });
  return { layers: () => layersOf(app).snap };
}

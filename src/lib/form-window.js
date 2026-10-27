// THE FORM WINDOW (lane dialog-yield — the owner, 2026-10-26, on his hub: the Install plugin… and Plugin Git credential
// dialogs covered the whole screen, the chat behind refused his typing and the Integrations window they opened came up
// BEHIND them: «尽可能减少 blocking popup 的使用；带填空的对话框不阻塞聊天；打开别的窗口要让位»). createModalShell's
// `kind: 'form'` (src/lib/utils.js) on the desktop tier is a small window of the window manager — this host builds it:
//   • NO backdrop: the chat and every window behind it stay interactive; it YIELDS like any window (a press on another
//     window, or another window opened, stands in front of it) and comes back from where windows are listed (the
//     taskbar, the window list); ✕ / Cancel / Escape from a focus inside it close it; the unsaved guard still asks on ✕
//   • its SIZE is its dialog's (the «Fixed-size app windows» rule — WindowManager.setFixedSize: no resize handles, no
//     maximize), centred in the workspace when it first stands, then where the person puts it
//   • PER CLIENT, like a popover: type 'form' is registered persist:false and captureWin never records it (no layouts.json
//     row, no layout-sync to another client, no desktop / preset / stage record); it never joins a tab group
//   • FOCUS IS THE PERSON'S (R5): opened by the person's own act (a click, a key — the page's user activation) it stands in
//     front and takes the focus ONCE; opened by anything else (a broadcast, a wake, a poll) it opens BEHIND the focused
//     window (placeBehind) and its taskbar tile pulses (markArrived); while it is not the active window no script focus
//     enters it (a later update — a list redrawn, a credential read — never takes the caret nor raises it)
// The phone tier (no window beside it to block — app.isMobile / the window manager's phone layout) answers null here and
// the shell keeps its sheet; so does a form opened while a BLOCKING layer is up (a decision, the static New Session sheet,
// the first-run tour): a window would stand under it, out of reach — the sheet stands above it.
import { registerWindowType, svgIcon16 } from './window-types.js';
import { setFormHost } from './utils.js';
import { formOpenVerdict, formBox, formPlace, formFocusVerdict, formInside } from './form-yield.js'; // PURE: the verdicts (node-read by scripts/test-dialog-yield.mjs)
import { VC_PHONE_MEDIA } from '../viewport-class.js'; // the phone paths' ONE media list — a crossing into it turns the open forms into sheets

registerWindowType({ type: 'form', icon: svgIcon16('<rect x="2.5" y="2" width="11" height="12" rx="1.5"/><path d="M5 5.5h6M5 8h6M5 10.5h3.5"/>'), label: 'Form', persist: false });

/** The person's own act just now? The page's transient user activation (Chrome / Firefox / Safari: a click or a key in the
 *  last few seconds); a browser without the API counts as the person's. */
const activationNow = () => { try { const ua = typeof navigator !== 'undefined' ? navigator.userActivation : null; return ua ? !!ua.isActive : true; } catch { return true; } };
/** A BLOCKING layer on show: a decision's backdrop (createModalShell's overlay, the static #dialog-overlay) or the first-run
 *  tour (#welcome.onboarding) — a form opened over one is its sheet, above it. */
const BLOCKERS = '.dialog-overlay:not(.hidden), #welcome.onboarding:not(.hidden)';
const blockedNow = () => { try { return [...document.querySelectorAll(BLOCKERS)].some((e) => e.getClientRects().length > 0); } catch { return false; } };

let lastTabAt = 0;
/** THE OPEN FORM WINDOWS — a crossing into the phone tier (a fold, a narrowed browser) re-hosts each as its sheet: the phone
 *  shows one window at a time and the phone navigation hands that to a session, so a form window would stand hidden. */
const OPEN = new Set();
let phoneMq = null;   // held: a MediaQueryList nobody references may be collected with its listener (the crossing then never ran)
/** Wire the host (app.js, once, after the window manager exists). */
export function installFormHost(app) {
  if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => { if (e.key === 'Tab') lastTabAt = Date.now(); }, true);
  const phoneNow = () => !!app.isMobile || !!(app.wm && app.wm._mobileLayout && app.wm._mobileLayout());
  // THE CROSSING's first door: src/lib/viewport-switch.js enterPhone calls it before any phone rule runs (the media query's
  // change and a resize below are the second and third — their order against the switch's own listener is not ours)
  app.formsToSheets = () => { for (const h of [...OPEN]) h.toSheet(); };
  try { phoneMq = window.matchMedia(VC_PHONE_MEDIA); phoneMq.addEventListener('change', (e) => { if (e.matches) for (const h of [...OPEN]) h.toSheet(); }); } catch { /* no matchMedia: no crossing */ }
  // a resize re-fits every open form — and on the phone tier re-hosts it as its sheet (the crossing's second door)
  try { window.addEventListener('resize', () => { const phone = phoneNow(); for (const h of [...OPEN]) { if (phone) h.toSheet(); else h.refit(); } }, { passive: true }); } catch { /* no window: no resize */ }
  setFormHost({
    open({ id = null, title = '' } = {}) {
      const wm = app && app.wm;
      const phone = !wm || !!app.isMobile || !!(wm._mobileLayout && wm._mobileLayout());
      const where = formOpenVerdict({ phone, blocked: blockedNow(), activation: activationNow() });
      if (where === 'sheet') return null;
      const nth = [...wm.windows.values()].filter((w) => w.type === 'form' && !w.isMinimized && !w._hiddenByDesktop).length;
      let opener = wm.activeWindowId;   // the window it was opened over — the active one again when it closes (a person pressing into the form re-names it)
      const quiet = where === 'behind';   // no act of the person opened it: the automatic open's quiet (test-artifacts-auto-open's pass-through spelling)
      const win = wm.createWindow({ title: String(title || ''), type: 'form', width: 480, height: 320, ...(quiet ? { quiet: true } : {}) });
      win.element.classList.add('window-form');
      if (id) win.element.dataset.form = id;
      if (where === 'behind') { wm.placeBehind(win.id); wm.markArrived(win.id); }
      win.element.addEventListener('pointerdown', () => { if (wm.activeWindowId && wm.activeWindowId !== win.id) opener = wm.activeWindowId; }, true);
      let bound = null, ro = null, mo = null, grow = null, placed = false, root = null, sheet = false;
      const fit = () => {
        const dlg = win.content.querySelector(':scope > .dialog-form > .dialog');
        if (!dlg || !win.element.isConnected) return;
        const box = formBox({ dialog: { w: dlg.offsetWidth, h: dlg.offsetHeight }, chrome: { w: win.element.offsetWidth - win.content.offsetWidth, h: win.element.offsetHeight - win.content.offsetHeight } });
        if (!box) return;
        wm.setFixedSize(win.id, box);
        const ws = wm._workspaceBox ? wm._workspaceBox() : null;
        if (!placed) {
          placed = true;
          const at = formPlace({ ws, box, nth });
          if (at) { win.element.style.left = at.left + 'px'; win.element.style.top = at.top + 'px'; }
        }
        // the WHOLE form stays inside (its dialog grew after its first place, the viewport shrank) — the least move, never a re-centre
        const k = formInside({ at: { left: parseFloat(win.element.style.left) || 0, top: parseFloat(win.element.style.top) || 0 }, box, ws });
        if (k) { win.element.style.left = k.left + 'px'; win.element.style.top = k.top + 'px'; }
      };
      // the window's ✕ (and every door that asks a window to close) is the person's dismissal — the shell's guard decides
      win.onCloseRequest = () => { if (bound) { bound.dismiss('close'); return false; } return true; };
      win.onClose = () => { try { ro?.disconnect(); mo?.disconnect(); grow?.disconnect(); } catch { } OPEN.delete(handle); if (bound) bound.closed(); };
      /** the crossing into the phone tier: the form's own root becomes the sheet (the overlay, z 99998, its head and ✕ shown
       *  again — the same element keeps its id, its listeners, the guard and what was typed); its window closes quietly */
      const handle = {
        refit() { fit(); },
        toSheet() {
          if (sheet || !root || !root.isConnected) return;
          sheet = true; OPEN.delete(handle);
          try { ro?.disconnect(); mo?.disconnect(); grow?.disconnect(); } catch { }
          root.className = 'dialog-overlay'; root.style.zIndex = '99998';
          document.body.appendChild(root);
          win.onCloseRequest = null; win.onClose = null;
          wm.closeWindow(win.id);
        },
      };
      OPEN.add(handle);
      return {
        content: win.content,
        winId: win.id,
        /** the shell hands its dismiss / closed hooks and its root once the dialog is built */
        bind(hooks, rootEl) {
          bound = hooks; root = rootEl;
          const dlg = root.querySelector(':scope > .dialog');
          const h3 = dlg && dlg.querySelector(':scope > .dialog-header h3');
          try { ro = new ResizeObserver(() => fit()); if (dlg) ro.observe(dlg); } catch { }
          // …and on every change of its content, coalesced per microtask: a tab that is not rendering (in the background) runs no
          // ResizeObserver, and a form filled there kept its «Loading…» size (measured: test-exit-access-ui's page behind another tab)
          let queued = false;
          const soon = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; fit(); }); };
          try { grow = new MutationObserver(soon); if (dlg) grow.observe(dlg, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] }); } catch { }
          // the dialog's own title (a caller may re-word it) is the window's
          if (h3) { try { mo = new MutationObserver(() => wm.setTitle(win.id, h3.textContent)); mo.observe(h3, { childList: true, characterData: true, subtree: true }); } catch { } }
          // FOCUS IS THE PERSON'S: no script focus enters a form standing behind; a Tab the person pressed raises it
          root.addEventListener('focusin', (e) => {
            const v = formFocusVerdict({ active: sheet || wm.activeWindowId === win.id, byKeyboard: Date.now() - lastTabAt < 400 });
            if (v === 'allow') return;
            if (v === 'raise') { wm.revealWindow(win.id); return; } // the person tabbed into it: named by the person (§62's door)
            const back = e.relatedTarget;
            try { if (back && back.isConnected && back.focus) back.focus({ preventScroll: true }); else e.target.blur?.(); } catch { }
          });
          fit();
          requestAnimationFrame(() => fit());
        },
        close() {
          if (sheet) { OPEN.delete(handle); Element.prototype.remove.call(root); return; }
          const wasActive = wm.activeWindowId === win.id;
          wm.closeWindow(win.id);
          // THE ACTIVE WINDOW GOES BACK to the one the form was opened over (a dialog returns to its opener) — never the highest
          // other window the manager would pick (at a phone width only the active window is drawn: the card read went away)
          const back = wasActive && opener && opener !== win.id ? wm.windows.get(opener) : null;
          if (back && !back.isMinimized && !back._hiddenByDesktop) wm.focusWindow(opener);
        },
        active() { return sheet || wm.activeWindowId === win.id; },
      };
    },
  });
}

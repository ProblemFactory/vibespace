// THE FORM WINDOW (lane dialog-yield — the owner, 2026-10-26, on his hub: the Install plugin… and Plugin Git credential
// dialogs covered the whole screen, the chat behind refused his typing and the Integrations window they opened came up
// BEHIND them: «尽可能减少 blocking popup 的使用；带填空的对话框不阻塞聊天；打开别的窗口要让位»). createModalShell's
// `kind: 'form'` (src/lib/utils.js) on the desktop tier is a small window of the window manager — this host builds it:
//   • NO backdrop: the chat and every window behind it stay interactive; it YIELDS like any window (a press on another
//     window, or another window opened, stands in front of it) and comes back from where windows are listed (the
//     taskbar, the window list); ✕ / Cancel / Escape from a focus inside it close it; the unsaved guard still asks on ✕
//   • its SIZE is its dialog's (the «Fixed-size app windows» rule — WindowManager.setFixedSize: no resize handles, no
//     maximize), never taller than the workspace (the dialog's body scrolls), centred in the workspace when it first
//     stands, then where the person puts it
//   • PER CLIENT, like a popover: type 'form' is registered persist:false and captureWin never records it (no layouts.json
//     row, no layout-sync to another client, no desktop / preset / stage record); it never joins a tab group; the welcome
//     never counts it (app.js _checkWelcome — closing one re-checks)
//   • FOCUS IS THE PERSON'S (R5): opened by the PERSON (the caller's `opener`, default 'person') it stands in front and takes
//     the focus ONCE; opened by the system (`opener: 'system'` — a broadcast, a wake, a poll) — or while the person was
//     typing in a field (their last act, within a second) — it opens BEHIND the focused window (placeBehind) and its
//     taskbar tile pulses (markArrived); while it is not the active window no script focus enters it
//   • A SHEET EXISTS ONLY WHILE WHAT MADE IT DOES (round 2): the phone tier (no window beside it to block) and a form opened
//     FROM a blocking layer (the static New Session sheet's folder picker, the tour's sign-in) are its sheet — and the moment
//     neither holds (the page back at a desktop width, the layer closed) the sheet RE-HOSTS as its window, the same element
//     with what was typed. A form opened while a blocking layer is up but not from it waits as a window UNDER the layer.
//   • «FROM THE LAYER» IS CAPTURED AT THE PRESS (round 3): every trusted press records whether it landed inside a blocking
//     layer (a PRESS TOKEN — pressToken(), carried by the caller across its awaits as createModalShell's `from`; without
//     one, the press of the current task); no clock — Browse… over a 2 s remote listing opened its picker BEHIND the New
//     Session sheet at 1.5 s. A re-host MOVES the element (moveBefore where the browser has it: an iframe keeps its page,
//     the focus stays) and puts every inner scroller back where it was; a form holding an iframe is never re-hosted by
//     appendChild (it would reload) — it keeps its shape.
// Every form gets a HANDLE here (its shape — 'sheet' | 'window' — moves; the shell asks the handle, never the shape).
import { registerWindowType, svgIcon16 } from './window-types.js';
import { setFormHost } from './utils.js';
import { formOpenVerdict, formBox, formMaxDialog, formPlace, formFocusVerdict, formInside, typedLastVerdict, sheetHomeVerdict, BLOCKING_LAYERS } from './form-yield.js'; // PURE: the verdicts (node-read by scripts/test-dialog-yield.mjs)
import { VC_PHONE_MEDIA } from '../viewport-class.js'; // the phone paths' ONE media list — a crossing into it turns the open forms into sheets

registerWindowType({ type: 'form', icon: svgIcon16('<rect x="2.5" y="2" width="11" height="12" rx="1.5"/><path d="M5 5.5h6M5 8h6M5 10.5h3.5"/>'), label: 'Form', persist: false });

/** A BLOCKING layer on show: a decision's backdrop (createModalShell's overlay, the static #dialog-overlay) or the first-run
 *  tour (#welcome.onboarding) — never a form's own sheet (form-yield.js BLOCKING_LAYERS). */
const blockedNow = () => { try { return [...document.querySelectorAll(BLOCKING_LAYERS)].some((e) => e.getClientRects().length > 0); } catch { return false; } };
/** …and the person's act came FROM one: their last press (or command key) — just now — landed inside a blocking layer or a
 *  form's sheet over it (the New Session sheet's Browse…, a button the tour shows). The focus alone is no act: a confirm focuses
 *  its own OK, and a form a script opened while it stood must wait under it, not cover its Delete (round 2's attack (a)). */
const LAYERED = `${BLOCKING_LAYERS}, .form-sheet`;
let pressAt = null, typedAt = null, typedEl = null, lastTabAt = 0;
const EDIT_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Backspace', 'Delete', 'Process', 'Dead', 'Compose', 'Unidentified']);
/** THE PRESS OF THIS TASK (round 3): a token naming whether the person's press landed inside a blocking layer — judged AT the
 *  press; it lives for the task that dispatched it (its handler and that handler's microtasks), a caller that awaits first
 *  carries it itself (utils pressToken → createModalShell `from`) */
let taskPress = null;
const notePress = (e) => {
  let inLayer = false;
  try { inLayer = !!e.target && typeof e.target.closest === 'function' && !!e.target.closest(LAYERED); } catch { /* no element: no layer */ }
  const tok = Object.freeze({ at: Date.now(), inLayer });
  taskPress = tok;
  setTimeout(() => { if (taskPress === tok) taskPress = null; }, 0);
};
const editable = (el) => { try { return !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|color|file|image|hidden)$/i.test(el.type || ''))); } catch { return false; } };

/** THE OPEN FORMS — the window ones (a crossing into the phone tier re-hosts each as its sheet) and the sheets (re-hosted as
 *  windows the moment neither the phone nor a blocking layer holds them). */
const OPEN = new Set();
let phoneMq = null;   // held: a MediaQueryList nobody references may be collected with its listener (the crossing then never ran)
let layerMo = null;
/** Wire the host (app.js, once, after the window manager exists). */
export function installFormHost(app) {
  if (typeof document !== 'undefined') {
    // THE PERSON'S LAST ACT (R5, round 2): a press or a command key vs text typed into a field — a form opened while their last
    // act was typing never takes the keys from that field, whatever its caller says ('hello wor' / 'ld' on da9545e8)
    document.addEventListener('pointerdown', (e) => { if (e.isTrusted) { pressAt = Date.now(); notePress(e); } }, true);
    // (the release is the click's task — a mouse's pointerup and its click, a Space's keyup and its click: the handler that opens a form runs in it)
    document.addEventListener('pointerup', (e) => { if (e.isTrusted) notePress(e); }, true);
    document.addEventListener('keyup', (e) => { if (e.isTrusted && e.key === ' ') notePress(e); }, true);   // (Enter clicks at its keydown: noted above)
    // a COMMAND key (a named key that is not an edit — Enter, Tab, Escape, an arrow, F1… — or a chord) is an act like a press
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') lastTabAt = Date.now();
      if (e.isTrusted && !e.isComposing && e.keyCode !== 229 && ((typeof e.key === 'string' && e.key.length > 1 && !EDIT_KEYS.has(e.key)) || e.ctrlKey || e.metaKey || e.altKey)) { pressAt = Date.now(); notePress(e); }
    }, true);
    document.addEventListener('input', (e) => { if (e.isTrusted && editable(e.target)) { typedAt = Date.now(); typedEl = e.target; } }, true);
  }
  const phoneNow = () => !!app.isMobile || !!(app.wm && app.wm._mobileLayout && app.wm._mobileLayout());
  const sheets = () => [...OPEN].filter((h) => h.mode() === 'sheet');
  // THE CROSSING's first door: src/lib/viewport-switch.js enterPhone calls it before any phone rule runs (the media query's
  // change and a resize below are the second and third — their order against the switch's own listener is not ours)
  app.formsToSheets = () => { for (const h of [...OPEN]) h.toSheet(); };
  /** …and back (viewport-switch enterDesktop, a resize, the last blocking layer closed): every sheet whose home is gone re-hosts */
  app.sheetsToForms = () => { if (sheetHomeVerdict({ phone: phoneNow(), blocked: blockedNow() }) !== 'window') return; for (const h of sheets()) h.toWindow(); };
  try { phoneMq = window.matchMedia(VC_PHONE_MEDIA); phoneMq.addEventListener('change', (e) => { if (e.matches) app.formsToSheets(); else app.sheetsToForms(); }); } catch { /* no matchMedia: no crossing */ }
  // a resize re-fits every open form window — and on the phone tier re-hosts it as its sheet (the crossing's second door)
  try { window.addEventListener('resize', () => { if (phoneNow()) { app.formsToSheets(); return; } for (const h of [...OPEN]) h.refit(); app.sheetsToForms(); }, { passive: true }); } catch { /* no window: no resize */ }
  /** the layers a sheet stands over: armed while a sheet is open — a decision removed, the static sheet / the tour hidden */
  const watchLayers = () => {
    if (typeof MutationObserver !== 'function') return;
    if (!layerMo) layerMo = new MutationObserver(() => { if (!sheets().length) { layerMo.disconnect(); return; } app.sheetsToForms(); });
    layerMo.disconnect();
    if (!sheets().length) return;
    layerMo.observe(document.body, { childList: true });
    for (const el of [document.getElementById('dialog-overlay'), document.getElementById('welcome')]) if (el) layerMo.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] }); // the static New Session sheet, the tour
    for (const el of document.querySelectorAll(BLOCKING_LAYERS)) layerMo.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  };
  setFormHost({
    /** the press of the current task (null outside one) — a caller reads it before its first await */
    pressToken: () => taskPress,
    open({ id = null, title = '', opener = 'person', from = null } = {}) {
      const wm = app && app.wm;
      const phone = !wm || phoneNow(), blocked = blockedNow();
      // (the field typed into must still HOLD the keys — a form the person typed in and closed protects nothing)
      const typing = typedLastVerdict({ typedAt, pressAt, now: Date.now() }) && !!typedEl && typedEl.isConnected && document.activeElement === typedEl;
      const where = formOpenVerdict({ phone, blocked, fromLayer: blocked && !!(from && from.inLayer), opener, typedLast: typing });
      let mode = where === 'sheet' ? 'sheet' : 'window';
      let win = null, bound = null, root = null, ro = null, mo = null, grow = null, placed = false, backTo = null, nth = 0, gone = false, lastFocus = null, landed = where;
      const unwatch = () => { try { ro?.disconnect(); mo?.disconnect(); grow?.disconnect(); } catch { } ro = mo = grow = null; };
      const fit = () => {
        if (mode !== 'window' || !win || !root) return;
        const dlg = root.querySelector(':scope > .dialog');
        if (!dlg || !win.element.isConnected) return;
        const chrome = { w: win.element.offsetWidth - win.content.offsetWidth, h: win.element.offsetHeight - win.content.offsetHeight };
        const ws = wm._workspaceBox ? wm._workspaceBox() : null;
        // never taller than the workspace: the dialog is capped at its height less the title bar, its body scrolls (round 2: at
        // 900 × 480 the dialog at its 80vh max stood 23 px past the workspace's foot)
        const cap = formMaxDialog({ ws, chrome });
        const want = cap ? `min(calc(80vh / var(--ui-scale, 1)), ${cap}px)` : '';   // the stylesheet's 80vh stays the cap where the workspace is taller
        if (dlg.style.maxHeight !== want) dlg.style.maxHeight = want;
        const box = formBox({ dialog: { w: dlg.offsetWidth, h: dlg.offsetHeight }, chrome, ws });
        if (!box) return;
        wm.setFixedSize(win.id, box);
        if (!placed) {
          placed = true;
          const at = formPlace({ ws, box, nth });
          if (at) { win.element.style.left = at.left + 'px'; win.element.style.top = at.top + 'px'; }
        }
        // the WHOLE form stays inside (its dialog grew after its first place, the viewport shrank) — the least move, never a re-centre
        const k = formInside({ at: { left: parseFloat(win.element.style.left) || 0, top: parseFloat(win.element.style.top) || 0 }, box, ws });
        if (k) { win.element.style.left = k.left + 'px'; win.element.style.top = k.top + 'px'; }
      };
      /** its WINDOW (at the open, or a sheet re-hosted): front = the person's, behind = the system's / a typing person's / under a layer */
      const makeWindow = (place) => {
        nth = [...wm.windows.values()].filter((w) => w.type === 'form' && !w.isMinimized && !w._hiddenByDesktop).length;
        backTo = wm.activeWindowId;   // the window it was opened over — the active one again when it closes (a person pressing into the form re-names it)
        const quiet = place === 'behind';   // no act of the person opened it: the automatic open's quiet (test-artifacts-auto-open's pass-through spelling)
        landed = quiet ? 'behind' : 'front';
        win = wm.createWindow({ title: String(title || ''), type: 'form', width: 480, height: 320, ...(quiet ? { quiet: true } : {}) });
        win.element.classList.add('window-form');
        if (id) win.element.dataset.form = id;
        if (quiet) { wm.placeBehind(win.id); wm.markArrived(win.id); }
        win.element.addEventListener('pointerdown', () => { if (wm.activeWindowId && wm.activeWindowId !== win.id) backTo = wm.activeWindowId; }, true);
        // the window's ✕ (and every door that asks a window to close) is the person's dismissal — the shell's guard decides
        win.onCloseRequest = () => { if (bound) { bound.dismiss('close'); return false; } return true; };
        win.onClose = () => { unwatch(); OPEN.delete(handle); gone = true; if (bound) bound.closed(); try { app._checkWelcome?.(); } catch { } };
        placed = false;
      };
      /** the window half of `bind`: observers that size it and keep its title, the focus guard lives on the root (once) */
      const watchWindow = () => {
        if (mode !== 'window' || !root || !win) return;
        const dlg = root.querySelector(':scope > .dialog');
        const h3 = dlg && dlg.querySelector(':scope > .dialog-header h3');
        try { ro = new ResizeObserver(() => fit()); if (dlg) ro.observe(dlg); } catch { }
        // …and on every change of its content, coalesced per microtask: a tab that is not rendering (in the background) runs no
        // ResizeObserver, and a form filled there kept its «Loading…» size (measured: test-exit-access-ui's page behind another tab)
        let queued = false;
        const soon = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; fit(); }); };
        try { grow = new MutationObserver(soon); if (dlg) grow.observe(dlg, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] }); } catch { }
        // the dialog's own title (a caller may re-word it) is the window's
        if (h3) { try { mo = new MutationObserver(() => wm.setTitle(win.id, h3.textContent)); mo.observe(h3, { childList: true, characterData: true, subtree: true }); } catch { } }
        fit();
        requestAnimationFrame(() => fit());
      };
      /** MOVE the root (round 3 — the keyed-row law): moveBefore where the browser has it (an iframe keeps its page, the focus
       *  stays), and every inner scroller back where it was (measured on c3ed5f0a: scrollTop 150 → 0, the iframe loaded 3×) */
      const carry = (into) => {
        const a = document.activeElement, had = !!a && root.contains(a);
        const kept = [];
        if (root.isConnected) for (const el of [root, ...root.querySelectorAll('*')]) if (el.scrollTop || el.scrollLeft) kept.push([el, el.scrollTop, el.scrollLeft]);
        if (typeof into.moveBefore === 'function' && root.isConnected && into.isConnected) { try { into.moveBefore(root, null); } catch { into.appendChild(root); } } else into.appendChild(root);
        if (had && a.isConnected && document.activeElement !== a) { try { a.focus({ preventScroll: true }); } catch { } }
        const back = () => { for (const [el, top, left] of kept) if (el.isConnected) { el.scrollTop = top; el.scrollLeft = left; } };
        if (kept.length) { back(); requestAnimationFrame(back); }
      };
      /** may it move? an iframe moved by appendChild reloads its page — where the browser cannot move it whole, it keeps its shape */
      const movable = () => { try { return typeof Element.prototype.moveBefore === 'function' || !root.querySelector('iframe'); } catch { return true; } };
      const asSheet = () => { root.className = 'dialog-overlay form-sheet'; root.style.zIndex = '99998'; landed = 'sheet'; const d = root.querySelector(':scope > .dialog'); if (d) d.style.maxHeight = ''; carry(document.body); watchLayers(); };   // (a sheet's dialog is the stylesheet's again)
      const asWindow = () => { root.className = 'dialog-form'; root.style.zIndex = ''; delete root.dataset.popover; carry(win.content); };   // (a window is no popover: a sheet's [data-popover] — feedback-sheet's phone Esc — goes)
      if (mode === 'window') makeWindow(where);
      const handle = {
        mode: () => mode,
        refit() { fit(); },
        /** the shell hands its root once its dialog is built: it stands as its sheet or in its window */
        adopt(rootEl) {
          root = rootEl;
          if (mode === 'sheet') asSheet(); else asWindow();
        },
        /** the crossing into the phone tier: the form's own root becomes the sheet (the overlay, z 99998, its head and ✕ shown
         *  again — the same element keeps its id, its listeners, the guard and what was typed); its window closes quietly */
        toSheet() {
          if (mode !== 'window' || !root || !root.isConnected || gone || !movable()) return;
          mode = 'sheet'; unwatch();
          const w = win; win = null;
          asSheet();
          if (w) { w.onCloseRequest = null; w.onClose = null; wm.closeWindow(w.id); }
        },
        /** a sheet whose home is gone (the page back at a desktop width, the layer it stood over closed) becomes its window again —
         *  in front when the person is in it, else behind */
        toWindow() {
          if (mode !== 'sheet' || !root || !root.isConnected || gone || !wm || !movable()) return;
          const inside = root.contains(document.activeElement);
          mode = 'window';
          makeWindow(inside ? 'front' : 'behind');
          asWindow();
          watchWindow();
          watchLayers();
        },
        /** the same form opened again (reopenVerdict 'raise'): the person's ⇒ in front, focused; the system's ⇒ its tile pulses */
        raise({ opener: by = 'person' } = {}) {
          if (gone || !root) return;
          // the caret goes back where the person left it in this form (its last focused field), else the form itself
          const back = () => { try { if (root.contains(document.activeElement)) return; const el = lastFocus && lastFocus.isConnected && root.contains(lastFocus) ? lastFocus : root; el.focus({ preventScroll: true }); } catch { } };
          if (mode === 'sheet') { back(); return; }
          if (by === 'system') { wm.markArrived(win.id); return; }
          wm.revealWindow(win.id);
          setTimeout(back, 0);
        },
        bind(hooks) {
          bound = hooks;
          // FOCUS IS THE PERSON'S: no script focus enters a form standing behind; a Tab the person pressed raises it
          root.addEventListener('focusin', (e) => {
            if (e.target !== root) lastFocus = e.target;
            const v = formFocusVerdict({ active: mode === 'sheet' || (!!win && wm.activeWindowId === win.id), byKeyboard: Date.now() - lastTabAt < 400 });
            if (v === 'allow') return;
            if (v === 'raise') { wm.revealWindow(win.id); return; } // the person tabbed into it: named by the person (§62's door)
            const back = e.relatedTarget;
            try { if (back && back.isConnected && back.focus) back.focus({ preventScroll: true }); else e.target.blur?.(); } catch { }
          });
          watchWindow();
        },
        close() {
          if (gone) return;
          if (mode === 'sheet') { gone = true; OPEN.delete(handle); Element.prototype.remove.call(root); watchLayers(); return; }
          const wasActive = wm.activeWindowId === win.id;
          wm.closeWindow(win.id);
          // THE ACTIVE WINDOW GOES BACK to the one the form was opened over (a dialog returns to its opener) — never the highest
          // other window the manager would pick (at a phone width only the active window is drawn: the card read went away)
          const back = wasActive && backTo && backTo !== win.id ? wm.windows.get(backTo) : null;
          if (back && !back.isMinimized && !back._hiddenByDesktop) wm.focusWindow(backTo);
        },
        active() { return mode === 'sheet' || (!!win && wm.activeWindowId === win.id); },
        /** where it landed: 'front' | 'behind' | 'sheet' */
        placed() { return mode === 'sheet' ? 'sheet' : landed; },
        get content() { return mode === 'window' && win ? win.content : document.body; },
        get winId() { return win ? win.id : null; },
      };
      OPEN.add(handle);
      return handle;
    },
  });
}

// THE KEYBOARD YIELD — the client half of "your own press gets the keyboard" (lane takeover-keyboard, userW
// inc-mum339id-1zsb, 2026-09-28: the chat beside its agent's live view in ONE split tab group, Take over, three presses on
// the chat composer — and the typing went into the live view's hidden sink, i.e. into the PAGE).
//
// Lane J r2 (the 2026-09-25 study: "tomsmith…" — a password — in the chat composer) made a driving live view reclaim the
// focus from ANY editable outside it: the guard against PROGRAMMATIC focus (an attach, a reconnect, a message arriving
// moving the caret into a text box while the person types into the page). It bound the user's own press too. This module
// tells the two apart and remembers the answer; the view (src/lib/browser-live-window.js) registers its three handlers
// as DOCUMENT CAPTURE listeners on its window's AbortController and acts on what they return:
//   onPointerDown — a press OUTSIDE the view is remembered `{target, at, trusted}`; a press INSIDE it (the picture, the
//                   bar, a side pane) ends a yield ('resumed' — the view re-claims and focuses its sink) or says
//                   'press-view' (the view re-claims: the one the user pressed is the one that drives the keys); so does
//                   a press on what NAMES the view outside it (verify r1 K3, `ownChrome`: its tab, its taskbar button,
//                   its own title bar while it stands alone) — and a yield ends on it even while the view is off screen;
//   onPointerUp   — a touch tap focuses at its END: the release on the pressed element re-stamps the press;
//   onFocusIn     — PURE `userPressFocus` (the focus follows the user's own trusted press on THAT editable within
//                   USER_PRESS_MS — the same element, inside it, or its input host: xterm's screen focuses its helper
//                   textarea) → PURE `focusVerdict`: 'yield' (remembered here: the keys go where the user pressed, the
//                   takeover continues), 'reclaim' (a focus nobody pressed for — the view takes it back, as before), or
//                   'allow'. While yielded every focus is the user's to move ('allow'; the kind follows a new text box).
//   onPressFocused — (verify r1) a press on the text box that ALREADY holds the caret makes no focusin: the same verdicts
//                   judged at the press (the view owning again with the caret left in the composer — restored, back on
//                   screen, reconnected); 'yield' | null, never a reclaim.
//   sync          — (verify r2, H1) ONE OWNERSHIP TRANSITION of the view (shown / hidden / the stream up or down / a claim
//                   moved): PURE `keyboardTransition` → redraw at once, and keys moving to the page while a text box (or a
//                   frame) outside the view holds the caret move the caret to the sink. And a press while the takeover is
//                   MINE but the view does not drive (`mine`: minimized, another desktop, reconnecting) is judged like any
//                   other — it YIELDS: the caret's home wins until a press on the view.
//   takeCue       — (verify r2, Q1) the last reclaim followed the user's own press on something ELSE (a button of his that
//                   focused a box): still a reclaim, and the view says so once (PURE `reclaimCue`, rate-limited).
//   onDialogOpen  — (lane dialog-keys, the owner's "ok" 2026-09-30) an app MODAL announced its open (src/lib/utils.js
//                   announceModal — createModalShell, app._showDialog): PURE `dialogOpener` over the last TRUSTED act of the
//                   user on the app (every press is stamped — not only the ones outside the view — re-stamped at its release;
//                   a press on the view's PICTURE went to the page and opens nothing here; `onAppKey`: a key the app itself
//                   took) → PURE `dialogVerdict`: 'take' is REMEMBERED on a stack (the newest holds; `base` = where the keys
//                   were before the first one) and the view owns no keys while one holds (keyboardOwnership's `dialog`);
//                   'reclaim' (a modal that opened BY ITSELF while the keys are the page's) is the old rule — the focus rules
//                   below take its focus back, `dialogCue` says it once. `settleDialogs` re-reads the stack (a removal / a
//                   `hidden` class — the answer, a backdrop press or a script's close alike) → PURE `dialogReturn`.
// A picture is one input with what takes its keys (verify r2, N1: `INPUT_HOSTS` — xterm's screen, a picture shell's xpra
// pane / noVNC canvas; `isKeyboardSurface` — noVNC's canvas takes keys without being a text box).
// Per claim: two views driving both yield to one press (each has its own), a press inside either takes the keys back
// for that one. Nothing here touches focus, the DOM or the network — it decides and remembers.
// Gate: scripts/test-takeover-keyboard.mjs (a DOM-mini: real capture order, press → focusin → yield, a script's focus →
// reclaim, a press in the view → resumed, xterm's host, a synthetic press, two views) + test-browser-live-input ⑥.
import { focusVerdict, userPressFocus, yieldAfter, keyboardTransition, reclaimCue, yieldHomeVerdict } from '../browser-takeover.js';
import { dialogOpener, dialogVerdict, dialogReturn, dialogReclaimCue } from '../browser-takeover.js'; // lane dialog-keys: a dialog the user's own act opened takes the keys

/** An element a caret can live in — the thing a takeover may not let the keyboard fall into by itself (moved here from
 *  browser-live-window.js, lane J r2: ONE definition for the view and this module). */
const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week']);
export function isEditable(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return !el.readOnly && !el.disabled;
  if (el.tagName === 'INPUT') return TEXT_INPUT_TYPES.has(String(el.type || '').toLowerCase()) && !el.readOnly && !el.disabled;
  return false;
}
/** verify r2 (H1 / H5): a FRAME holding the focus — its own document takes every key, the view's listeners see none. */
export function isFrame(el) { return !!el && el.nodeType === 1 && ['IFRAME', 'FRAME', 'OBJECT', 'EMBED'].includes(el.tagName); }
/** The element that owns an editable's input: a terminal's screen and its hidden helper textarea are ONE input (xterm
 *  focuses the textarea from its own mousedown handler — the press lands on the screen, the focus on the textarea).
 *  verify r2 (N1): a desktop app's / the Desktop's PICTURE is one input with what takes its keys — the xpra pane focuses
 *  its IME textarea from its own pointerdown, noVNC focuses its own canvas (src/lib/picture-shell.js hosts both). Measured
 *  on cd867c05: a real press on the Desktop's noVNC canvas (and on an xpra pane) while driving was reclaimed and the
 *  typing went to the agent's PAGE — userW's report in another window. */
const INPUT_HOSTS = '.xterm, .picture-shell';
function inputHostOf(el) { try { return (el && typeof el.closest === 'function' && el.closest(INPUT_HOSTS)) || el; } catch { return el; } }
/** verify r2 (N1): a focus target that TAKES KEYS without being a text box — noVNC's canvas (its keyboard handler listens
 *  on it) inside a picture shell. A press on it yields like a press on a text box; a script's focus on it is reclaimed. */
export function isKeyboardSurface(el) {
  try { return !!el && el.nodeType === 1 && el.tagName === 'CANVAS' && typeof el.closest === 'function' && !!el.closest('.picture-shell'); } catch { return false; }
}
const takesKeys = (el) => isEditable(el) || isKeyboardSurface(el);
/** verify r3 (F4): an app DIALOG — src/lib/utils.js createModalShell's overlay (every dialog of the app: its own focus for
 *  Escape, a confirm's default button, an input dialog's box); lane dialog-keys: the static #dialog-overlay too */
const DIALOG_HOSTS = '.dialog-overlay';
/** lane dialog-keys: THE APP'S MODAL — the overlay element itself (createModalShell's, or the static #dialog-overlay) */
const classesOf = (el) => { try { return String((el && el.className) || '').split(/\s+/); } catch { return []; } };
export function isModalOverlay(el) { return !!el && el.nodeType === 1 && classesOf(el).includes(DIALOG_HOSTS.slice(1)); }
/** …and is it OPEN: in the document and not `.hidden` (the static overlay closes by the class; a shell's by its removal) */
export function modalOpen(el) { try { return isModalOverlay(el) && el.isConnected !== false && !classesOf(el).includes('hidden') && !el.hidden; } catch { return false; } }
/** lane mirror-green-228 (THE .228 MIRROR): a focus that lands LATE — on a session window's server answer (`created` /
 *  `attached`, src/lib/session-lifecycle.js) — takes the keys only while no app dialog holds them. The double-click that
 *  opens the Rename dialog on a sidebar row also attaches its session; on the slow Actions runner the answer landed after
 *  the dialog had focused its box, so the new name and its Enter went to the chat composer and the rename never happened.
 *  PURE over the overlays the caller lists ('keep' = leave the focus where it is). */
export function lateFocusVerdict(overlays) { try { return Array.from(overlays || []).some(modalOpen) ? 'keep' : 'take'; } catch { return 'take'; } }
/** lane dialog-keys: where a dialog that TOOK the keys but focuses nothing itself gets them (the brief: "its first
 *  focusable / its input") — its first text box, else the overlay (a keydown there bubbles through the dialog's own
 *  handlers). Never a button: Enter on a primary button the dialog did not choose would act for the user. */
export function dialogFocusTarget(ov) {
  try {
    // the first VISIBLE text box in document order (the static overlay holds every index.html dialog, the hidden ones too)
    const walk = (n) => { for (const c of Array.from((n && n.children) || [])) { if (isEditable(c) && isVisible(c)) return c; const f = walk(c); if (f) return f; } return null; };
    return walk(ov) || ov;
  } catch { return ov; }
}
/** verify r3 (F1, the input-surface census): a CHOICE control — a <select> opens its list under the user's own press and
 *  the pointer picks. Measured on 46462c3d: the code editor's language select was focused and `:open` 500 ms after a real
 *  press without a takeover — while driving, neither 100 ms after it (the sink took the focus back, the list closed with
 *  the blur): every dropdown of the app. Its keys stay the page's while the view owns (the document capture listener routes
 *  them first; an open list's own keys never reach the document). */
export function isChoiceControl(el) { try { return !!el && el.nodeType === 1 && el.tagName === 'SELECT' && !el.disabled; } catch { return false; } }
/**
 * verify r3: the view's sink LOST the focus while the view owns the keys (a press on the bar, a side pane, empty space, a
 * button, a list — or a script) — to `a`. → 'keep' (the sink itself; a text box: the focusin rule reclaimed it or yielded
 * to it; a choice control whose list is open under the pointer, F1) | 'frame' (a frame outside the view: its document takes
 * keys the view never sees — taken back and said, verify r2 H5) | 'take-back' (the sink takes the focus back: the next key
 * must reach a text field, or an IME never starts — lane live-input). `body` = the document's body (a focus on it is none).
 */
export function sinkBlurVerdict(a, { sink = null, root = null, body = null } = {}) {
  if (a && a === sink) return 'keep';
  if (!a || a === body) return 'take-back';
  if (isEditable(a) || isChoiceControl(a)) return 'keep';
  try { if (isFrame(a) && !(root && root.contains(a))) return 'frame'; } catch { /* detached */ }
  return 'take-back';
}
/** Is the element rendered (not on a hidden desktop / a minimized window / content-visibility hidden)? */
function isVisible(el) { try { if (!el.isConnected) return false; return typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true }) : true; } catch { return false; } }
/** Is the pressed element the focused editable's own input — the editable itself, inside it, its LABEL, or in its input host?
 *  verify r4: a press on the box's <label> (its `control` is the box, or it wraps the box — "Page name", a passphrase row) is a
 *  press on the box: the label's whole purpose is to focus it. Before, it was 'pressed elsewhere' — reclaimed and told to click
 *  the box itself. */
export function sameInput(pressed, focused) {
  if (!pressed || !focused) return false;
  if (pressed === focused) return true;
  try { if (typeof focused.contains === 'function' && focused.contains(pressed)) return true; } catch { /* detached */ }
  try { const lab = typeof pressed.closest === 'function' ? pressed.closest('label') : null; if (lab && (lab.control === focused || (typeof lab.contains === 'function' && lab.contains(focused)))) return true; } catch { /* detached */ }
  const host = inputHostOf(focused);
  try { return host !== focused && !!host && typeof host.contains === 'function' && host.contains(pressed); } catch { return false; }
}
/** Where the keys went, for the view's words: a chat composer, a terminal, or something else. */
export function yieldKindOf(el) {
  try {
    if (el && typeof el.closest === 'function') {
      if (el.closest('.chat-input-area')) return 'chat';
      if (el.closest('.xterm')) return 'terminal';
    }
  } catch { /* detached */ }
  return 'other';
}

/**
 * One live view's yield. `root` = the view's element, `sink` = its keyboard sink, `drives()` = this view drives a takeover
 * of its own (claimed, mine, socket open, on screen — the yield NOT counted), `now()` = the clock, `ownChrome(el)` = the
 * element NAMES this view outside its root (verify r1 K3: its tab in a tab strip, its taskbar button, its own title bar
 * while it stands alone) — a press there is a press on the view. `mine()` (verify r2, H1) = the takeover is this view's
 * even while it does not drive (claimed: minimized, on another desktop, its stream reconnecting) — a press then is still
 * judged (absent ⇒ never: the view's press rules only while it drives, as before).
 */
export function createKeyboardYield({ root, sink, drives, mine = () => false, now = () => Date.now(), ownChrome = () => false, picture = null }) {
  // lane dialog-keys: `opener` = the user's last TRUSTED act on the app {at, trusted, picture}; `holds` = the dialogs that
  // took the keys [{overlay, back}] (newest last); `base` = where the keys were before the first ({to: 'sink'|'yield', el})
  const s = { yielded: false, kind: null, press: null, last: null, cue: null, lastCueAt: null, drove: null, opener: null, holds: [], base: null, dialogWhy: null, home: null }; // (`home` = the text box the keys were yielded to — a dialog opened from a yield gives them back there)
  const inView = (el) => { try { return !!el && !!root && (el === root || root.contains(el)); } catch { return false; } };
  /** lane dialog-keys: the press landed on the view's PICTURE (`picture` = the element the page's pointer is forwarded from) */
  const onPicture = (el) => { try { return !!el && !!picture && (el === picture || picture.contains(el)); } catch { return false; } };
  const heldOpen = () => s.holds.filter((h) => modalOpen(h.overlay));
  const namesView = (el) => { if (inView(el)) return true; try { return !!el && !!ownChrome(el); } catch { return false; } };
  const driving = () => { try { return !!drives(); } catch { return false; } };
  const isMine = () => { try { return !!mine(); } catch { return false; } };
  /** verify r2 (H1): does a text box — or a FRAME (its document takes the keys the view's listeners never see) — outside
   *  this view hold the caret? */
  const caretOutside = (el) => !!el && el !== sink && !inView(el) && (takesKeys(el) || isFrame(el));
  return {
    get yielded() { return s.yielded; },
    get kind() { return s.kind; },
    /** → 'resumed' | 'press-view' | 'noted' | null (the takeover is not this view's) */
    onPointerDown(e) {
      // lane dialog-keys: EVERY press is the opener evidence a dialog opening next is judged by (inside the view too — its
      // bar's Quit opens a confirm — but a press on the picture is the page's); trusted only by the browser's own flag
      s.opener = { at: now(), trusted: e.isTrusted === true, picture: onPicture(e.target) };
      // verify r1 (K3): a press on the view — or on what names it — ends a yield, even while the view is off screen or its
      // stream reconnects (the user pointed at the browser: his keys are the page's again once it drives). Before, a press
      // on the view's own tab / title bar kept the caret in the composer and what he typed next for the page went there.
      if (s.yielded && namesView(e.target)) { s.press = null; s.yielded = yieldAfter(true, 'press-view'); s.kind = null; s.home = null; return 'resumed'; }
      // verify r2 (H1): the takeover MINE but the view not driving (minimized, another desktop, reconnecting) — the press is
      // still remembered and judged: a press on a text box then yields (before: ignored, and the view back on screen took
      // the next keys from the box the user had pressed — "c2" reached the PAGE)
      if (!driving() && !isMine()) { s.press = null; return null; }
      if (namesView(e.target)) { s.press = null; return 'press-view'; }
      s.press = { target: e.target, at: now(), trusted: e.isTrusted === true };
      return 'noted';
    },
    onPointerUp(e) {
      if (s.press && e.target === s.press.target && e.isTrusted === true) s.press.at = now();
      if (e.isTrusted === true) s.opener = { at: now(), trusted: true, picture: onPicture(e.target) }; // lane dialog-keys: a click opens its dialog at the release
    },
    /** lane dialog-keys: a key the APP itself took (a reserved chord, command mode — or a key typed into a dialog the user
     *  opened: an Enter that answers it may open the next) is the user's own act on the app too; a key the page gets never is */
    onAppKey(e) { if (e && e.isTrusted === true) s.opener = { at: now(), trusted: true, picture: false }; },
    /** → 'yield' | 'reclaim' | 'allow' (the view reclaims only when it is THE owner of this client) */
    onFocusIn(e) {
      const el = e.target;
      const editable = takesKeys(el), insideView = el === sink; // verify r2 (N1): a picture's keyboard surface counts
      if (s.holds.length) return 'allow'; // lane dialog-keys: a dialog the user opened holds the keys — every focus is his to move (the dialog's own, Tab)
      if (s.yielded) { if (editable && !inView(el)) { s.kind = yieldKindOf(el); s.home = el; } return 'allow'; }
      const p = s.press;
      const u = userPressFocus({ press: p, sameInput: !!p && sameInput(p.target, el), focusAt: now() }), byUserPress = u.byUserPress;
      const v = focusVerdict({ owns: driving(), mine: isMine(), editable, insideView, byUserPress });
      // verify r2 (Q1): a reclaim the user's own press elsewhere caused (a button of his focusing a box) is said, rate-limited.
      // verify r4: armed FOR THE BOX (`s.cue = el`) by a RECLAIM only, never a bare flag any focusin resets — a box focused,
      // replaced and focused again in one task (a keyed patch under a broadcast) armed two cues, and the first reader (the
      // gone box: never said, F2) consumed the flag — then its own focusSink's focusin reset it — before the second reader
      // (the box that stayed) ran: reclaimed twice, said never (measured on 41312584)
      if (v === 'reclaim') s.cue = reclaimCue({ why: u.why, press: p, focusAt: now(), lastCueAt: s.lastCueAt }) ? el : null; // (stamped when SAID — takeCue)
      if (v === 'yield') { s.press = null; s.yielded = yieldAfter(s.yielded, 'yield'); s.kind = yieldKindOf(el); s.home = el; }
      return v;
    },
    /** verify r1: a press on the text box that ALREADY holds the caret makes no focusin, so onFocusIn never judges it —
     *  measured on cf24cf01: the live view minimized, the composer pressed (the view did not drive, the caret stayed),
     *  the view restored (it owns again, the caret still in the composer), a real press on the composer — no yield, the
     *  typing went to the PAGE (userW's report, one state later). The same PURE verdicts as a focusin on `active`, called
     *  right after onPointerDown noted the press; never a reclaim (a press moves no focus). → 'yield' | null */
    onPressFocused(active) {
      if (s.holds.length || s.yielded || !s.press || !active || active === sink || inView(active) || !takesKeys(active)) return null; // (lane dialog-keys: a press inside a dialog that holds the keys is the dialog's, never a yield)
      const byUserPress = userPressFocus({ press: s.press, sameInput: sameInput(s.press.target, active), focusAt: now() }).byUserPress;
      if (focusVerdict({ owns: driving(), mine: isMine(), editable: true, insideView: false, byUserPress }) !== 'yield') return null;
      s.press = null; s.yielded = yieldAfter(s.yielded, 'yield'); s.kind = yieldKindOf(active); s.home = active;
      return 'yield';
    },
    /** 'claim' / 'release': a fresh takeover or its end clears the yield and the remembered press */
    reset(event) { s.yielded = yieldAfter(s.yielded, event); s.kind = null; s.press = null; s.holds = []; s.base = null; s.home = null; }, // (lane dialog-keys: a fresh claim / the release forgets the dialogs — the view owns nothing to give back)
    /** verify r2 (H1): the view's ownership may have changed — `{owns, yielded, dialog}` now, `active` = the focused element →
     *  PURE keyboardTransition `{changed, moveCaret, release}` (the view redraws on `changed`, moves the caret on
     *  `moveCaret`, lets go of the keys still held in the page on `release` — verify r2 H3; lane dialog-keys: a dialog taking
     *  the keys is a release too) */
    sync({ owns = false, yielded = false, dialog = false, active = null } = {}) {
      const r = keyboardTransition({ was: s.last, now: { owns, yielded, dialog }, caretOutside: caretOutside(active) });
      s.last = { owns: !!owns, yielded: !!yielded, dialog: !!dialog };
      return r;
    },
    /** lane dialog-keys: does a dialog the user opened hold the keys (the view owns none while it does)? */
    get dialogHolds() { return s.holds.length > 0; },
    /** …the overlays that hold them (the view watches each for its `hidden` class) */
    dialogOverlays() { return s.holds.map((h) => h.overlay); },
    /** …and why the last announced dialog was judged as it was (PURE dialogOpener's `why` — the view's state() says it) */
    get dialogWhy() { return s.dialogWhy; },
    /** lane dialog-keys: an app MODAL announced its open (`ov` = its overlay, `active` = the element focused at that moment).
     *  → 'take' (REMEMBERED: the dialog gets the keys; the opener evidence is spent — one act, one dialog) | 'reclaim' (it
     *  opened by itself while the keys are the page's: the focus rules take its focus back, `dialogCue` says it) | 'allow' |
     *  'held' (announced again while it holds — the static overlay switching dialogs) | null (not an open app modal). The
     *  view calls `settleDialogs` first (a dialog replaced by its successor in one task returns its keys before the new one
     *  is judged). */
    onDialogOpen(ov, { active = null } = {}) {
      if (!modalOpen(ov)) return null;
      if (s.holds.some((h) => h.overlay === ov)) return 'held';
      const held = s.holds.length > 0;
      const o = dialogOpener({ press: s.opener, openAt: now() });
      s.dialogWhy = o.why;
      const v = dialogVerdict({ owns: driving(), yielded: s.yielded, held, byUserPress: o.byUserPress, opener: 'app' });
      if (v !== 'take') return v;
      // the base: the page (the view owned the keys) or the yield's HOME — the text box focused now, else the one the keys were
      // yielded to (he may have pressed a button beside it: the button is not where he typed)
      if (!held) s.base = s.yielded ? { to: 'yield', el: active && active !== sink && !inView(active) && takesKeys(active) ? active : s.home } : { to: 'sink', el: null };
      s.holds.push({ overlay: ov, back: held ? active : null });
      s.opener = null;
      return v;
    },
    /** lane dialog-keys: the dialogs that hold the keys, re-read — each one no longer OPEN (answered, dismissed, removed or
     *  hidden by a script) leaves the stack: no orphan hold. → null (nothing closed) | `{to, el}` = PURE dialogReturn: 'back'
     *  (el = the older dialog's field), 'older' (el = the older dialog's OVERLAY — the view gives it its own field), 'sink',
     *  'yield' (el = the text box the keys had been yielded to), 'stay'. verify r1: `active` = the element focused now — while a
     *  dialog holds and the focus fell to NOWHERE (<body>: Chrome's fix-up when the focused element left the document — a
     *  self-opened modal answered over the held one, the held dialog's own control re-rendered) the keys would go nowhere while
     *  the chip still says "in the dialog": the newest held dialog gets them back ('older'), on any settle */
    settleDialogs({ active = null } = {}) {
      if (!s.holds.length) return null;
      const all = s.holds, top = all[all.length - 1];
      const open = heldOpen();
      const nowhere = (el) => { try { return !el || el.nodeType !== 1 || el.isConnected === false || el.tagName === 'BODY'; } catch { return true; } };
      if (open.length === all.length) return nowhere(active) ? { to: 'older', el: top.overlay } : null;
      s.holds = open;
      if (open.length && open[open.length - 1] === top) return nowhere(active) ? { to: 'older', el: top.overlay } : { to: 'stay', el: null }; // an OLDER one closed: the newest still holds (its keys stay — unless they fell to nowhere with the older one's element)
      const inOpen = (el) => { try { return !!el && el.isConnected !== false && open.some((h) => h.overlay.contains(el)); } catch { return false; } };
      // the newest CLOSED one's `back` first; a back that was itself in a closed dialog falls to the next older one's
      const back = all.filter((h) => !open.includes(h)).reverse().map((h) => h.back).find(inOpen) || null;
      const base = s.base;
      if (!open.length) s.base = null;
      const home = !!(base && base.to === 'yield' && base.el && base.el !== sink && !inView(base.el) && takesKeys(base.el) && isVisible(base.el));
      const to = dialogReturn({ left: open.length, back: { valid: !!back }, base: base ? { to: base.to, valid: home } : null });
      return { to, el: to === 'back' ? back : to === 'older' ? open[open.length - 1].overlay : to === 'yield' ? base.el : null };
    },
    /** lane dialog-keys: a modal that opened BY ITSELF while the view owns the keys ('reclaim') is said once — PURE
     *  dialogReclaimCue, one rate limit with the Q1 cue. → true = say it (the limit is spent) */
    dialogCue(verdict) {
      if (!dialogReclaimCue({ verdict, at: now(), lastCueAt: s.lastCueAt })) return false;
      s.lastCueAt = now();
      return true;
    },
    /** verify r2 (H1): the caret in a text box / a frame outside the view (the belt's question at a key) */
    caretOutside,
    /** verify r3 (r2's held): WHERE the yielded keys are now — the kind of what holds the focus ('chat' | 'terminal' |
     *  'other'; a frame is 'other': its page takes them), or 'none' when nothing that takes keys holds it. Measured on
     *  46462c3d: yielded to the composer, a press on the chat's message list focused its container — "nn" went nowhere while
     *  the chip still said "Keyboard is in the chat box". (A yield stays: the keys never go to the page by a press on the
     *  chat.) null = not yielded. */
    whereNow(active) {
      if (s.holds.length) return 'dialog'; // lane dialog-keys: a dialog the user opened holds the keys ("…it goes back when you answer it")
      if (!s.yielded) return null;
      if (active && active !== sink && !inView(active)) { if (takesKeys(active)) return yieldKindOf(active); if (isFrame(active)) return 'other'; }
      return 'none';
    },
    /** verify r2 (H1b'): the view may have come back to driving — a yield whose home is gone (the box the user pressed is not
     *  a visible, focused text box any more: on the desktop he left, closed) ends ('homeless'). → 'end' | 'keep' */
    settle({ drives = false, active = null } = {}) {
      const drovePrev = s.drove === null ? true : s.drove; s.drove = !!drives;
      if (s.holds.length) return 'keep'; // lane dialog-keys: a dialog the user opened holds the keys — the caret is in it, not homeless
      const homeVisible = !!active && active !== sink && !inView(active) && takesKeys(active) && isVisible(active);
      const v = yieldHomeVerdict({ yielded: s.yielded, drivesNow: !!drives, drovePrev, homeVisible });
      if (v === 'end') { s.yielded = yieldAfter(s.yielded, 'homeless'); s.kind = null; s.press = null; s.home = null; }
      return v;
    },
    // (verify r3 F4's `dialogCue(a)` — a dialog the user's own press opened, TAKEN BACK and said once at the sink's blur — is
    // retired by lane dialog-keys: such a dialog now TAKES the keys (onDialogOpen); the one that opens by itself is judged at
    // its open and said there (`dialogCue(verdict)` above), never at a focus.)
    /** verify r2 (Q1): did the last reclaim follow the user's own press elsewhere (say it)? — read once. verify r3 (F2): read
     *  where the reclaim RUNS, with the element taken back from — a box already gone is no box to click: never said, and the
     *  rate limit not spent. Measured on 46462c3d: "Copy Path" on plain http (utils.js copyText's fallback appends a scratch
     *  textarea, selects — focuses — it, copies and removes it in one task) said "click the text box itself to type there". */
    takeCue(el) { const c = !!el && s.cue === el && el.isConnected !== false; if (s.cue === el) s.cue = null; if (c) s.lastCueAt = now(); return c; },
  };
}

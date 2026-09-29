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
// A picture is one input with what takes its keys (verify r2, N1: `INPUT_HOSTS` — xterm's screen, a picture shell's xpra
// pane / noVNC canvas; `isKeyboardSurface` — noVNC's canvas takes keys without being a text box).
// Per claim: two views driving both yield to one press (each has its own), a press inside either takes the keys back
// for that one. Nothing here touches focus, the DOM or the network — it decides and remembers.
// Gate: scripts/test-takeover-keyboard.mjs (a DOM-mini: real capture order, press → focusin → yield, a script's focus →
// reclaim, a press in the view → resumed, xterm's host, a synthetic press, two views) + test-browser-live-input ⑥.
import { focusVerdict, userPressFocus, yieldAfter, keyboardTransition, reclaimCue, yieldHomeVerdict } from '../browser-takeover.js';

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
 *  Escape, a confirm's default button, an input dialog's box) */
const DIALOG_HOSTS = '.dialog-overlay';
const inDialog = (el) => { try { return !!el && typeof el.closest === 'function' && !!el.closest(DIALOG_HOSTS); } catch { return false; } };
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
/** Is the pressed element the focused editable's own input — the editable itself, inside it, or in its input host? */
export function sameInput(pressed, focused) {
  if (!pressed || !focused) return false;
  if (pressed === focused) return true;
  try { if (typeof focused.contains === 'function' && focused.contains(pressed)) return true; } catch { /* detached */ }
  const host = inputHostOf(focused);
  try { return host !== focused && !!host && typeof host.contains === 'function' && host.contains(pressed); } catch { return false; }
}
/** Where the keys went, for the view's words: a chat composer, a terminal, or something else. */
export const YIELD_KINDS = Object.freeze(['chat', 'terminal', 'other']);
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
export function createKeyboardYield({ root, sink, drives, mine = () => false, now = () => Date.now(), ownChrome = () => false }) {
  const s = { yielded: false, kind: null, press: null, last: null, cue: false, lastCueAt: null, drove: null };
  const inView = (el) => { try { return !!el && !!root && (el === root || root.contains(el)); } catch { return false; } };
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
      // verify r1 (K3): a press on the view — or on what names it — ends a yield, even while the view is off screen or its
      // stream reconnects (the user pointed at the browser: his keys are the page's again once it drives). Before, a press
      // on the view's own tab / title bar kept the caret in the composer and what he typed next for the page went there.
      if (s.yielded && namesView(e.target)) { s.press = null; s.yielded = yieldAfter(true, 'press-view'); s.kind = null; return 'resumed'; }
      // verify r2 (H1): the takeover MINE but the view not driving (minimized, another desktop, reconnecting) — the press is
      // still remembered and judged: a press on a text box then yields (before: ignored, and the view back on screen took
      // the next keys from the box the user had pressed — "c2" reached the PAGE)
      if (!driving() && !isMine()) { s.press = null; return null; }
      if (namesView(e.target)) { s.press = null; return 'press-view'; }
      s.press = { target: e.target, at: now(), trusted: e.isTrusted === true };
      return 'noted';
    },
    onPointerUp(e) { if (s.press && e.target === s.press.target && e.isTrusted === true) s.press.at = now(); },
    /** → 'yield' | 'reclaim' | 'allow' (the view reclaims only when it is THE owner of this client) */
    onFocusIn(e) {
      const el = e.target;
      const editable = takesKeys(el), insideView = el === sink; // verify r2 (N1): a picture's keyboard surface counts
      if (s.yielded) { if (editable && !inView(el)) s.kind = yieldKindOf(el); return 'allow'; }
      const p = s.press;
      const u = userPressFocus({ press: p, sameInput: !!p && sameInput(p.target, el), focusAt: now() }), byUserPress = u.byUserPress;
      const v = focusVerdict({ owns: driving(), mine: isMine(), editable, insideView, byUserPress });
      // verify r2 (Q1): a reclaim the user's own press elsewhere caused (a button of his focusing a box) is said, rate-limited
      s.cue = v === 'reclaim' && reclaimCue({ why: u.why, press: p, focusAt: now(), lastCueAt: s.lastCueAt }); // (stamped when SAID — takeCue)
      if (v === 'yield') { s.press = null; s.yielded = yieldAfter(s.yielded, 'yield'); s.kind = yieldKindOf(el); }
      return v;
    },
    /** verify r1: a press on the text box that ALREADY holds the caret makes no focusin, so onFocusIn never judges it —
     *  measured on cf24cf01: the live view minimized, the composer pressed (the view did not drive, the caret stayed),
     *  the view restored (it owns again, the caret still in the composer), a real press on the composer — no yield, the
     *  typing went to the PAGE (userW's report, one state later). The same PURE verdicts as a focusin on `active`, called
     *  right after onPointerDown noted the press; never a reclaim (a press moves no focus). → 'yield' | null */
    onPressFocused(active) {
      if (s.yielded || !s.press || !active || active === sink || inView(active) || !takesKeys(active)) return null;
      const byUserPress = userPressFocus({ press: s.press, sameInput: sameInput(s.press.target, active), focusAt: now() }).byUserPress;
      if (focusVerdict({ owns: driving(), mine: isMine(), editable: true, insideView: false, byUserPress }) !== 'yield') return null;
      s.press = null; s.yielded = yieldAfter(s.yielded, 'yield'); s.kind = yieldKindOf(active);
      return 'yield';
    },
    /** 'claim' / 'release': a fresh takeover or its end clears the yield and the remembered press */
    reset(event) { s.yielded = yieldAfter(s.yielded, event); s.kind = null; s.press = null; },
    /** verify r2 (H1): the view's ownership may have changed — `{owns, yielded}` now, `active` = the focused element →
     *  PURE keyboardTransition `{changed, moveCaret, release}` (the view redraws on `changed`, moves the caret on
     *  `moveCaret`, lets go of the keys still held in the page on `release` — verify r2 H3) */
    sync({ owns = false, yielded = false, active = null } = {}) {
      const r = keyboardTransition({ was: s.last, now: { owns, yielded }, caretOutside: caretOutside(active) });
      s.last = { owns: !!owns, yielded: !!yielded };
      return r;
    },
    /** verify r2 (H1): the caret in a text box / a frame outside the view (the belt's question at a key) */
    caretOutside,
    /** verify r3 (r2's held): WHERE the yielded keys are now — the kind of what holds the focus ('chat' | 'terminal' |
     *  'other'; a frame is 'other': its page takes them), or 'none' when nothing that takes keys holds it. Measured on
     *  46462c3d: yielded to the composer, a press on the chat's message list focused its container — "nn" went nowhere while
     *  the chip still said "Keyboard is in the chat box". (A yield stays: the keys never go to the page by a press on the
     *  chat.) null = not yielded. */
    whereNow(active) {
      if (!s.yielded) return null;
      if (active && active !== sink && !inView(active)) { if (takesKeys(active)) return yieldKindOf(active); if (isFrame(active)) return 'other'; }
      return 'none';
    },
    /** verify r2 (H1b'): the view may have come back to driving — a yield whose home is gone (the box the user pressed is not
     *  a visible, focused text box any more: on the desktop he left, closed) ends ('homeless'). → 'end' | 'keep' */
    settle({ drives = false, active = null } = {}) {
      const drovePrev = s.drove === null ? true : s.drove; s.drove = !!drives;
      const homeVisible = !!active && active !== sink && !inView(active) && takesKeys(active) && isVisible(active);
      const v = yieldHomeVerdict({ yielded: s.yielded, drivesNow: !!drives, drovePrev, homeVisible });
      if (v === 'end') { s.yielded = yieldAfter(s.yielded, 'homeless'); s.kind = null; s.press = null; }
      return v;
    },
    /** verify r3 (F4): the sink TOOK BACK the focus (sinkBlurVerdict 'take-back') from an app DIALOG that the user's own
     *  fresh press elsewhere just opened (a menu's Delete → the confirm dialog focusing its default button) — still taken back
     *  (a dialog that opens by itself must never get the keys: the password guard), and SAID once, rate-limited with the Q1
     *  cue: its Enter / Escape go to the page. Measured on 46462c3d: Delete → the confirm dialog, Enter → the PAGE (its
     *  textarea got a line break), the file kept, nothing said. A press ON the dialog (its button, its body) is silent.
     *  → true = say it */
    dialogCue(a) {
      if (!a || a.nodeType !== 1 || !inDialog(a) || !s.press) return false;
      const why = sameInput(s.press.target, a) ? 'pressed' : 'pressed elsewhere';
      if (!reclaimCue({ why, press: s.press, focusAt: now(), lastCueAt: s.lastCueAt })) return false;
      s.lastCueAt = now();
      return true;
    },
    /** verify r2 (Q1): did the last reclaim follow the user's own press elsewhere (say it)? — read once. verify r3 (F2): read
     *  where the reclaim RUNS, with the element taken back from — a box already gone is no box to click: never said, and the
     *  rate limit not spent. Measured on 46462c3d: "Copy Path" on plain http (utils.js copyText's fallback appends a scratch
     *  textarea, selects — focuses — it, copies and removes it in one task) said "click the text box itself to type there". */
    takeCue(el) { const c = !!s.cue && !(el && el.isConnected === false); s.cue = false; if (c) s.lastCueAt = now(); return c; },
  };
}

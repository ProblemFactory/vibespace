// AN ENTER MEANT FOR THE INPUT METHOD MUST NOT SEND THE MESSAGE (lane chat-enter-ime, inc-muukd9oq-qyc3, 2026-10-05 —
// the owner, Chrome 152 on macOS, a Chinese IME: "我还没写完消息怎么发出去了？"). The action ring: two Enters swallowed
// while the IME composed, a Shift TAP (a Chinese IME commits the composition on Shift and switches to English), and
// 383 ms later a plain Enter ⇒ sent mid-sentence. PURE (no DOM) so the fast suite drives the very object ChatInput uses.
//   · a composition ended by ANOTHER key (Shift / Escape / a Space-select / a click) arms `_imeEndedAt`;
//   · a plain Enter within IME_ENTER_WINDOW_MS of such an end inserts a newline and asks for the hint (once — the next
//     Enter sends, which is what the hint says);
//   · an Enter that itself ended the composition (Chrome: keydown isComposing → compositionend) arms nothing;
//   · chat.enterSends off (desktop) ⇒ Enter is a newline and Cmd/Ctrl+Enter sends, the expanded composer's rule.
// WHY 600 ms: the incident's Shift→Enter gap was 383 ms; a fast typist's Space-select → Enter lands at ~150–300 ms,
// and a deliberate "commit, then send" reads the committed text first (> 600 ms). A guarded Enter loses nothing — the
// newline stays in the box, the hint says what happened, and the next Enter sends.
export const IME_ENTER_WINDOW_MS = 600;
export const IME_HINT_MS = 2000;

/** The IME owns this keydown (Chrome/Firefox: isComposing; Safari and older Chrome: keyCode 229). */
export const imeOwnsKey = (e) => !!(e && (e.isComposing || e.keyCode === 229));

/** The physical Enter, even when an IME reports the key as 'Process' (Chrome on Windows). */
export const isEnterKey = (e) => !!e && (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter');

/** PURE: what a non-composing Enter keydown does in the composer.
 *  'none' (not Enter) · 'send' · 'newline' (the default action: the textarea inserts it) · 'ime-newline' (a newline +
 *  the "input method just ended" hint). ctx: { expanded, touch, touchEnterSends, enterSends, imeEndedAt, now, windowMs } */
export function enterKeyAction(e, ctx = {}) {
  if (!e || e.key !== 'Enter') return 'none';
  const mod = !!(e.ctrlKey || e.metaKey);
  // the expanded composer, and chat.enterSends off on a desktop keyboard: Cmd/Ctrl+Enter sends, Enter is a newline
  if (ctx.expanded || (ctx.enterSends === false && !ctx.touch)) return mod ? 'send' : 'newline';
  if (e.shiftKey) return 'newline';
  // Touch soft keyboards have no Shift — chat.touchEnterSends decides (2.234.0).
  if (ctx.touch && !ctx.touchEnterSends) return 'newline';
  const windowMs = ctx.windowMs ?? IME_ENTER_WINDOW_MS;
  if (!mod && !e.altKey && ctx.imeEndedAt && (ctx.now - ctx.imeEndedAt) < windowMs) return 'ime-newline';
  return 'send';
}

/** The composer's IME state. Wire: keydown(e) FIRST on every textarea keydown, compositionstart/compositionend on the
 *  textarea, enter(e, ctx) where the Enter branch decides. */
export class EnterGuard {
  constructor({ now = () => Date.now(), windowMs = IME_ENTER_WINDOW_MS } = {}) {
    this._now = now; this._windowMs = windowMs;
    this._lastKeyEnter = false;
    this._imeEndedAt = 0;
  }
  keydown(e) {
    this._lastKeyEnter = isEnterKey(e);
    // Safari fires compositionend BEFORE the committing Enter's keydown (keyCode 229): that Enter was the IME's, so the
    // end it followed must not arm the window.
    if (this._lastKeyEnter && imeOwnsKey(e)) this._imeEndedAt = 0;
  }
  compositionstart() { this._imeEndedAt = 0; }
  compositionend() { this._imeEndedAt = this._lastKeyEnter ? 0 : this._now(); }
  enter(e, ctx = {}) {
    const a = enterKeyAction(e, { ...ctx, imeEndedAt: this._imeEndedAt, now: this._now(), windowMs: this._windowMs });
    if (a === 'ime-newline' || a === 'send') this._imeEndedAt = 0;
    return a;
  }
}

/** The send key the send-mode hint names: 'Enter', or the platform's Cmd/Ctrl+Enter when chat.enterSends is off. */
export const sendKeyName = (enterSends, mac) => (enterSends === false ? (mac ? '⌘+Enter' : 'Ctrl+Enter') : 'Enter');

/** The incident recorder's action-ring words for a keydown — never the text. null for a plain character (the ring's
 *  one-per-burst "typing" marker covers it); else { key } prefixed C-/M-/A-/S- for Ctrl/Meta/Alt/Shift, plus c:1 when
 *  the input method owned the key. Without S- and c:1, inc-muukd9oq-qyc3's Shift tap that ended a composition and the
 *  plain Enter after it read exactly like a deliberate send. */
export function actionKeyWords(e) {
  if (!(e.key.length > 1 || e.ctrlKey || e.metaKey || e.altKey)) return null;
  const w = { key: (e.ctrlKey ? 'C-' : '') + (e.metaKey ? 'M-' : '') + (e.altKey ? 'A-' : '') + (e.shiftKey ? 'S-' : '') + e.key };
  if (imeOwnsKey(e)) w.c = 1;
  return w;
}

/** The recorder's input-method marker: a composition starting / ending in a textarea (the composer) — no text. */
export const imeMarker = (type, target) => (target && target.tagName === 'TEXTAREA' && (type === 'compositionstart' || type === 'compositionend')
  ? { k: 'ime', ph: type === 'compositionstart' ? 'start' : 'end' } : null);

// THE ENTER THAT COMMITS A WORD IN AN INPUT METHOD MUST NOT SEND THE MESSAGE (lanes chat-enter-ime r1 + r2,
// inc-muukd9oq-qyc3, 2026-10-05 — the owner, Chrome 152 on macOS, a Chinese IME: "我还没写完消息怎么发出去了？").
// r2, the owner's correction: "其实是中文输入法用回车上英文词的时候触发的 bug，而不是切换中英文" — Latin letters typed in a
// Chinese IME and Enter COMMITS them as an English word; on the owner's Chrome that committing Enter reached the composer
// as a PLAIN keydown (keyCode 13, isComposing false). The action ring: two composing Enters that sent nothing (:09.651,
// :10.802), then the next word's committing Enter at :12.243 — the send left at :12.244. The Shift at :11.860 (r1's
// "switch to English") was a capital letter inside the composition; nothing in the ring ended it but that Enter.
// PURE (no DOM) so the fast suite drives the very object ChatInput uses.
//   · EVERY compositionend arms `_imeEndedAt` — the key that ended it no longer matters (r1 exempted an Enter-ended
//     composition: exactly the owner's case);
//   · a plain Enter within IME_COMMIT_BURST_MS of it is SWALLOWED (no newline, no send) and asks for the hint (once —
//     the next Enter sends, which is what the hint says);
//   · Cmd/Ctrl+Enter sends regardless (a deliberate chord); chat.enterSends off (desktop) ⇒ Enter is a newline and
//     Cmd/Ctrl+Enter sends, the expanded composer's rule; touch keeps chat.touchEnterSends.
// WHY 50 ms: the window covers the commit's own event burst and nothing more. The ring's committing Enter followed the
// end by 0–1 ms (the same event burst, in either order); a human's two presses — Space to commit, then Enter to send,
// every Chinese sentence — are ≥ 80–100 ms apart, so a real send is never swallowed (r1's 600 ms swallowed it once per
// message). A swallowed Enter loses nothing — the hint says what happened and the next Enter sends.
export const IME_COMMIT_BURST_MS = 50;
export const IME_HINT_MS = 2000;

/** The IME owns this keydown (Chrome/Firefox: isComposing; Safari and older Chrome: keyCode 229). */
export const imeOwnsKey = (e) => !!(e && (e.isComposing || e.keyCode === 229));

/** PURE: what a non-composing Enter keydown does in the composer.
 *  'none' (not Enter) · 'send' · 'newline' (the default action: the textarea inserts it) · 'ime-swallow' (the input
 *  method's committing Enter: no newline, no send + the "input method just ended" hint). ctx: { expanded, touch, touchEnterSends, enterSends, imeEndedAt, now, windowMs } */
export function enterKeyAction(e, ctx = {}) {
  if (!e || e.key !== 'Enter') return 'none';
  const mod = !!(e.ctrlKey || e.metaKey);
  // the expanded composer, and chat.enterSends off on a desktop keyboard: Cmd/Ctrl+Enter sends, Enter is a newline
  if (ctx.expanded || (ctx.enterSends === false && !ctx.touch)) return mod ? 'send' : 'newline';
  if (e.shiftKey) return 'newline';
  // Touch soft keyboards have no Shift — chat.touchEnterSends decides (2.234.0).
  if (ctx.touch && !ctx.touchEnterSends) return 'newline';
  const windowMs = ctx.windowMs ?? IME_COMMIT_BURST_MS;
  if (!mod && !e.altKey && ctx.imeEndedAt && (ctx.now - ctx.imeEndedAt) < windowMs) return 'ime-swallow';
  return 'send';
}

/** The composer's IME state. Wire: compositionstart/compositionend on the textarea, enter(e, ctx) where the Enter
 *  branch decides (after the imeOwnsKey return). */
export class EnterGuard {
  constructor({ now = () => Date.now(), windowMs = IME_COMMIT_BURST_MS } = {}) {
    this._now = now; this._windowMs = windowMs;
    this._imeEndedAt = 0;
  }
  compositionstart() { this._imeEndedAt = 0; }
  // every end arms, whichever key (or click) ended it — a commit or a cancel alike (r2)
  compositionend() { this._imeEndedAt = this._now(); }
  enter(e, ctx = {}) {
    const a = enterKeyAction(e, { ...ctx, imeEndedAt: this._imeEndedAt, now: this._now(), windowMs: this._windowMs });
    if (a === 'ime-swallow' || a === 'send') this._imeEndedAt = 0;
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

/** The recorder's input-method marker: a composition starting / ending in a textarea (the composer) — never its text.
 *  An end says how when the event shows it (r2): how 'commit' (compositionend data non-empty) or 'cancel' (empty). */
export function imeMarker(type, target, data) {
  if (!target || target.tagName !== 'TEXTAREA' || (type !== 'compositionstart' && type !== 'compositionend')) return null;
  if (type === 'compositionstart') return { k: 'ime', ph: 'start' };
  return typeof data === 'string' ? { k: 'ime', ph: 'end', how: data.length > 0 ? 'commit' : 'cancel' } : { k: 'ime', ph: 'end' };
}

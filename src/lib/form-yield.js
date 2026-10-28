// THE FORM'S VERDICTS (lane dialog-yield) — PURE, imports nothing: where a createModalShell `kind: 'form'` stands (the sheet on
// the phone tier, else a window in front of or behind the focused one), the window box that holds its dialog exactly, its
// first place in the workspace, and whether a focus may enter it. src/lib/form-window.js (the DOM half) asks them;
// scripts/test-dialog-yield.mjs reads them in node.
// Round 2 (acceptance r1): THE ONE ANSWER to «did the person open a dialog?» lives here too — DIALOG_ROOTS / isPersonDialog /
// personDialogOf / BLOCKING_LAYERS — and every reader in src/ asks it (the live view's keys in keyboard-yield.js, a session's
// late focus, the toasts' place, the phone's back, a popover's outside press, the form host's blocking test). Measured on
// da9545e8: keyboard-yield judged `.dialog-overlay` only, so a form the person opened while driving an agent browser never held
// the keys — the secret pasted into «Paste a secret into the vault» went INTO THE AGENT'S PAGE. test-architecture §103 reds a
// `.dialog-overlay` read anywhere else, by file:line.

/** A DIALOG'S ROOT — a decision's overlay (createModalShell's, the static #dialog-overlay, a form's SHEET) or a form's root
 *  in its window. The one selector every reader queries. */
export const DIALOG_ROOTS = '.dialog-overlay, .dialog-form';
/** …the ones drawn as an OVERLAY over everything (a decision, the static New Session sheet, a form's sheet) — a form's window
 *  is not one (it yields like any window) */
export const SHEET_ROOTS = '.dialog-overlay';
/** …and a FORM's root in its window */
export const FORM_ROOTS = '.dialog-form';
/** A BLOCKING LAYER on show — a decision's backdrop, the static New Session sheet (#dialog-overlay), the first-run tour —
 *  never a form's own sheet (`.form-sheet`: it stands over a layer or the phone, it blocks nothing by itself). */
export const BLOCKING_LAYERS = '.dialog-overlay:not(.hidden):not(.form-sheet), #welcome.onboarding:not(.hidden)';
const classesOf = (el) => { try { return String((el && el.className) || '').split(/\s+/); } catch { return []; } };
/** Is `el` the ROOT of a dialog the app opened (either kind, either shape)? (PURE over its classes) */
export function isPersonDialog(el) { if (!el || el.nodeType !== 1) return false; const c = classesOf(el); return c.includes('dialog-overlay') || c.includes('dialog-form'); }
/** …a FORM standing as its WINDOW (not a sheet: a sheet is an overlay — a backdrop over everything, like a decision) */
export function isFormRoot(el) { return !!el && el.nodeType === 1 && classesOf(el).includes('dialog-form'); }
/** The dialog root `el` stands in (itself included), else null. */
export function personDialogOf(el) { try { return el && typeof el.closest === 'function' ? el.closest(DIALOG_ROOTS) : null; } catch { return null; } }
/** WHAT A FORM FLOATS IS THE FORM'S (round 3 — acceptance r2: a press on the path field's suggestion list, a child of
 *  <body>, dropped the form's hold and 'me/proj⏎' went into the agent's page). OWNERSHIP IS DECLARED, never guessed: the ONE
 *  helpers that float an element (path-field's list, createPopover, showContextMenu, the pickers) stamp it from the element
 *  that opened it — `data-owner-form` = the id of the dialog root that anchor stands in (nothing when it stands in none). */
export function ownFloat(floatEl, anchorEl) {
  try {
    if (!floatEl || floatEl.nodeType !== 1) return null;
    const root = anchorEl && anchorEl.nodeType === 1 ? (ownerFormOf(anchorEl) || personDialogOf(anchorEl)) : null;
    if (root && root.id) floatEl.setAttribute('data-owner-form', root.id); else floatEl.removeAttribute('data-owner-form');
    return root && root.id ? root : null;
  } catch { return null; }
}
/** …and THE ONE READER: the dialog root that owns `el` (a floated piece, or anything inside one), else null — keyboard-yield
 *  asks it before it calls a press «outside the form». (test-architecture §103 reds a `data-owner-form` read elsewhere.) */
export function ownerFormOf(el) {
  try {
    const f = el && typeof el.closest === 'function' ? el.closest('[data-owner-form]') : null;
    if (!f) return null;
    const root = (f.ownerDocument || document).getElementById(f.getAttribute('data-owner-form'));
    return root && isPersonDialog(root) && root.isConnected ? root : null;
  } catch { return null; }
}
/** Does a FORM window hold the person's work now — the focus inside it, or its window the active one? (a decision holds while
 *  it is open: it covers everything) — a session's late focus and the live view's hold ask it */
export function formHoldsNow(root, active = null) {
  try {
    if (!isFormRoot(root)) return false;
    if (active && typeof root.contains === 'function' && root.contains(active)) return true;
    const w = typeof root.closest === 'function' ? root.closest('.window') : null;
    return !!w && classesOf(w).includes('window-active');
  } catch { return false; }
}

/** WHERE IT STANDS (PURE): 'sheet' on the phone tier; while a BLOCKING layer is up a form the PERSON opened FROM it (their
 *  press inside that layer — the static New Session sheet's folder picker, the tour's sign-in) is its sheet above it, and any
 *  other form waits 'behind', a window UNDER the layer (the decision keeps its keys and its buttons — round 2: a sheet stacked
 *  over a danger confirm covered its Delete, and stayed a blocking sheet after the confirm closed); else a window — in 'front'
 *  when the PERSON opened it, 'behind' the focused window when the system did. «Opened by the person» is the CALLER's fact
 *  (`opener: 'person' | 'system'` at createModalShell — round 2: the browser's user activation lasts ~5 s and a popup spends
 *  it, so the Voice sheet re-opened after «Connect with Fish Audio» landed behind), and whatever the caller says a form never
 *  takes the keys from a field the person was TYPING in (`typedLast`: the person's last act was text typed into a field,
 *  within a second, no press since — 'hello wor' / 'ld' measured on da9545e8) — under a layer too.
 *  Round 3 (acceptance r2): «from the layer» is a FACT CAPTURED AT THE PRESS (`fromLayer` = the press token the call carries
 *  landed inside a blocking layer — form-window.js), never a clock at the open: Browse… over a 2 s remote listing opened its
 *  picker BEHIND the New Session sheet, and a system form 1403 ms after a press inside it covered the field being typed in. */
export function formOpenVerdict({ phone = false, blocked = false, fromLayer = false, opener = 'person', typedLast = false } = {}) {
  if (phone) return 'sheet';
  if (blocked) return fromLayer && opener !== 'system' && !typedLast ? 'sheet' : 'behind';
  if (typedLast || opener === 'system') return 'behind';
  return 'front';
}
/** WAS THE PERSON TYPING (PURE): their last act was text typed into a field (`typedAt`), within `withinMs`, and no press nor
 *  command key since (`pressAt`). */
export function typedLastVerdict({ typedAt = null, pressAt = null, now = 0, withinMs = 1000 } = {}) {
  if (typedAt == null || !Number.isFinite(Number(typedAt))) return false;
  const since = Number(now) - Number(typedAt);
  if (!(since >= 0 && since <= withinMs)) return false;
  return pressAt == null || Number(typedAt) >= Number(pressAt);
}
/** A SHEET'S HOME (PURE): a form's sheet exists only while what made it does — the phone tier, or a blocking layer it stands
 *  over; the moment neither holds it re-hosts as its window ('window'), what was typed kept. */
export function sheetHomeVerdict({ phone = false, blocked = false } = {}) { return phone || blocked ? 'sheet' : 'window'; }
/** THE SAME FORM AGAIN (PURE): a form whose id is open. Its IDENTITY is the caller's fact — the id plus the KEY it declares
 *  (the subject the content is about: the caller, the entry, the document, the conversation, the profile; null ≡ null = a
 *  single-subject form), NEVER its title (round 3 — acceptance r2: Rotate… twice raised the dialog showing the token that had
 *  been rotated away, and tok_TWO went into a detached shell). The same key ⇒ RAISED, never replaced: what was typed, its
 *  handlers and its guard stay ('raise' — the caller gets the LIVE shell, `raised: true`); another key ⇒ the open one's own
 *  door first ('door' — closed ⇒ the new one opens; asked ⇒ the new one opens when it closes, never if the person keeps it);
 *  an open form that declared itself UNDISMISSABLE (a running set-up: no Escape, no backdrop) is never closed by a
 *  neighbour's open ⇒ 'beside' (the new one opens next to it). */
export function reopenVerdict({ openKey = null, nextKey = null, undismissable = false } = {}) {
  const k = (x) => (x === undefined || x === null ? null : String(x));
  if (k(openKey) === k(nextKey)) return 'raise';
  return undismissable ? 'beside' : 'door';
}
/** IT CANNOT BE DISMISSED (PURE): the caller said so (`undismissable: true`) or turned off every door the person has —
 *  no Escape (and no ask-first hook), no backdrop press. */
export function undismissableVerdict({ undismissable = false, escapeToClose = false, closeOnBackdrop = true, onEscape = false } = {}) {
  return !!undismissable || (!escapeToClose && !onEscape && closeOnBackdrop === false);
}
/** ONE ESCAPE (PURE) — a form has ONE Escape door, the shell's, and it honours the call: 'none' (the site opted out — no
 *  escapeToClose, no onEscape), 'kept' (the caller's ask-first hook answered false: it asks or keeps itself), 'guard' (its
 *  unsaved guard decides — Escape = the ✕: it asks when dirty), 'ask' (no guard, but something was typed: the shell asks
 *  before it drops it), 'close'. */
export function escapeVerdict({ escapeToClose = false, hook = false, callerSays = true, guarded = false, typed = false } = {}) {
  if (!escapeToClose && !hook) return 'none';
  if (hook && callerSays === false) return 'kept';
  if (!escapeToClose) return 'none';
  if (guarded) return 'guard';
  return typed ? 'ask' : 'close';
}
/** WAS ANYTHING TYPED (PURE): a field whose value now differs from what it held when the person first entered it (`was` read
 *  at its first focus — a field never entered was never typed into). */
export function typedVerdict(fields = []) {
  try { return Array.from(fields || []).some((f) => f && f.was !== undefined && f.was !== f.now); } catch { return false; }
}
/** ITS BOX (PURE): the window that holds the dialog exactly — the dialog's own box plus the window's chrome (title bar and
 *  borders), whole pixels — never taller than the workspace (`ws`: round 2, at 900 × 480 a dialog at its 80vh max stood 23 px
 *  past the workspace's foot; formMaxDialog caps the dialog, its body scrolls). null while the dialog is not laid out. */
export function formBox({ dialog, chrome, ws = null } = {}) {
  if (!dialog || !(dialog.w > 0) || !(dialog.h > 0)) return null;
  const cw = chrome && chrome.w > 0 ? chrome.w : 0, ch = chrome && chrome.h > 0 ? chrome.h : 0;
  const h = Math.ceil(dialog.h + ch);
  return { w: Math.ceil(dialog.w + cw), h: ws && ws.h > 0 ? Math.min(h, Math.floor(ws.h)) : h };
}
/** THE DIALOG'S CAP inside its window (PURE): the workspace's height less the window's chrome — the whole box stays inside,
 *  the dialog's body scrolls, its foot stays reachable. null = no cap known. */
export function formMaxDialog({ ws = null, chrome = null } = {}) {
  if (!ws || !(ws.h > 0)) return null;
  const ch = chrome && chrome.h > 0 ? chrome.h : 0;
  return Math.max(80, Math.floor(ws.h - ch));
}
/** ITS FIRST PLACE (PURE): centred in the workspace (a little above the middle, where a dialog stands), each further form on
 *  show one step lower and to the right so no title bar is buried, never outside the workspace. */
export function formPlace({ ws, box, nth = 0 } = {}) {
  if (!ws || !box) return null;
  const step = 28, k = Math.max(0, nth | 0) % 6;
  const left = Math.round((ws.w - box.w) / 2) + k * step, top = Math.round((ws.h - box.h) * 0.4) + k * step;
  return { left: Math.max(0, Math.min(left, ws.w - box.w)), top: Math.max(0, Math.min(top, ws.h - box.h)) };
}
/** IT STAYS INSIDE (PURE): the place that keeps a form's WHOLE box inside the workspace — its dialog grew after its first
 *  place (a «Loading…» body filled in), the viewport shrank — moved by the least it takes, never re-centred; a box larger
 *  than the workspace stands at its top / left edge. null = nothing to move (or nothing laid out). */
export function formInside({ at, box, ws } = {}) {
  if (!at || !box || !ws) return null;
  const left = Math.max(0, Math.min(at.left, ws.w - box.w)), top = Math.max(0, Math.min(at.top, ws.h - box.h));
  return left === at.left && top === at.top ? null : { left, top };
}
/** MAY A FOCUS ENTER IT (PURE): while it is the active window — a press into it makes it so; a Tab the person pressed
 *  brings it in front — never a script's focus() while it stands behind. */
export function formFocusVerdict({ active = false, byKeyboard = false } = {}) {
  if (active) return 'allow';
  return byKeyboard ? 'raise' : 'refuse';
}


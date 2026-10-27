// THE FORM'S VERDICTS (lane dialog-yield) — PURE, imports nothing: where a createModalShell `kind: 'form'` stands (the sheet on
// the phone tier, else a window in front of or behind the focused one), the window box that holds its dialog exactly, its
// first place in the workspace, and whether a focus may enter it. src/lib/form-window.js (the DOM half) asks them;
// scripts/test-dialog-yield.mjs reads them in node.

/** WHERE IT STANDS (PURE): 'sheet' on the phone tier, and while a BLOCKING layer is up (a decision's backdrop, the static
 *  New Session sheet, the first-run tour — a window would stand under it, out of reach); else a window — in 'front' when
 *  the person's own act opened it, else 'behind' the focused window. `activation` = the page's transient user activation
 *  at the open (true when unknown). */
export function formOpenVerdict({ phone = false, blocked = false, activation = true } = {}) {
  if (phone || blocked) return 'sheet';
  return activation ? 'front' : 'behind';
}
/** ITS BOX (PURE): the window that holds the dialog exactly — the dialog's own box plus the window's chrome (title bar and
 *  borders), whole pixels. null while the dialog is not laid out. */
export function formBox({ dialog, chrome } = {}) {
  if (!dialog || !(dialog.w > 0) || !(dialog.h > 0)) return null;
  const cw = chrome && chrome.w > 0 ? chrome.w : 0, ch = chrome && chrome.h > 0 ? chrome.h : 0;
  return { w: Math.ceil(dialog.w + cw), h: Math.ceil(dialog.h + ch) };
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


// PURE (imports nothing) — A PRESS COUNTS ONLY ON WHAT SAT STILL WHERE THE USER SAW IT (verify-r6 V1, lane-pairing).
//
// An approval button is an approval of what the user READ beside it. Two For-you surfaces put a different approval under
// a pointer already on its way: the popup (a resolved "Allow … to run a command?" row drops its command and buttons, the
// row below slides up — a double-click, or the first ask's 60 s expiry, lands the press on the NEXT ask's Allow) and the
// For-you window (Allow advances to the next item, whose pane shows Allow in the same place — a double-click allows it
// unread). The inc-mtw02kbq-kj96 class, on the one button that runs a command. The rule: a press on Allow counts only
// once the button has stayed where it is for ARM_MS since it appeared or last moved; an earlier press does nothing and
// says so (the next press, once it is still, answers). Deny is never gated (a mistaken "no" runs nothing).
export const ARM_MS = 700;

/** → {ok:true} | {ok:false, code:'just-moved', waitMs}. `since` = when the control appeared / last moved (same clock as now). */
export function pressVerdict({ since = null, now = 0, armMs = ARM_MS } = {}) {
  if (since == null || !Number.isFinite(Number(since))) return { ok: false, code: 'just-moved', waitMs: armMs };
  const age = Number(now) - Number(since);
  return age >= armMs ? { ok: true } : { ok: false, code: 'just-moved', waitMs: Math.max(0, Math.ceil(armMs - age)) };
}

/** After a layout pass: the new `since` of a control whose screen position is `top` now — appeared (no previous
 *  reading) or moved (more than a pixel) ⇒ `now`, else the old `since` kept. */
export function armAfterLayout({ prevTop = null, top = 0, prevSince = null, now = 0 } = {}) {
  if (prevTop == null || prevSince == null) return now;
  return Math.abs(Number(top) - Number(prevTop)) > 1 ? now : prevSince;
}

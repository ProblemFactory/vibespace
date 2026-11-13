// THE PHONE'S SIDE BY SIDE (lane phone-six, 2026-10-26 — userW's wish, relayed by the owner: 「不是窗口，只能支持左右分屏」).
// The phone tier shows ONE window; a SPLIT shows exactly two, left and right, each a window of the current desktop (its own
// tabs, its own scroll), at a fixed 50/50 divider — no drag (a later lane may add a snap at 1/3–2/3). It is a LAYOUT of two
// phone windows, never the window manager: no geometry is written, the pair is this tab's own (sessionStorage beside
// `vibespace.phoneShown`), restored on a reload, never sent to another device.
//   · THE RULE OF WHEN — two panes stand side by side only where each keeps MIN_PANE: the room both panes share (the
//     conversation column with the list column hidden) ≥ 2 × MIN_PANE + the divider. MIN_PANE was MEASURED (lane phone-six
//     report, Chrome under the runner's DejaVu, ×4 CPU): a chat pane keeps its 16 px composer's words («Type a message...»
//     144 px), its send button and a one-line status bar from 290 px; a terminal at the phone's 14 px font reaches 40
//     columns at 350 px — the binding one. A landscape phone (844 − the 56 px bar = 788) splits; a portrait phone (≈ 360–430)
//     does not, and its door SAYS why («Rotate to split» when the turned screen clears the bound); a portrait foldable /
//     tablet whose width clears it does.
//   · THE PAIR — «Split» beside a window in the switcher puts it beside the window on show (the shown one keeps its side).
//   · COLLAPSE / RESTORE — a room under the bound (a rotation to portrait, the list column shown) shows the pane on show
//     alone and KEEPS the pair; the room back restores it. Showing a window outside the pair, a pane's ✕, a window gone: the
//     split ends.
//   · THE TURN — a rotation (the same screen turned: orientation flipped, the screen's area kept) vs a fold (another
//     screen): a rotation keeps the conversation list as the person left it (lane phone-six item 4 — 「每次旋转完屏幕之后都会
//     把侧边栏默认打开」); a fold builds what a fresh load at that size builds (SPEC-v3 §7, test-duo-layout).
// PURE: imports nothing (client: src/lib/phone-split-view.js, src/lib/viewport-switch.js; gate: test-phone-split).

/** The narrowest pane (CSS px) — measured, see above. */
const MIN_PANE = 350;
/** The divider between the two panes (CSS px): fixed, never dragged. */
const SPLIT_DIVIDER = 8;
/** The room two panes need. */
const splitBound = (minPane = MIN_PANE, divider = SPLIT_DIVIDER) => 2 * minPane + divider;
/** The door's words (English keys — the client says them through t()). */
const SPLIT_WORDS = Object.freeze({ ok: 'Split', rotate: 'Rotate to split', narrow: 'Too narrow to split' });

/** Can two panes stand side by side? `room` = the width both panes would share now (the list column hidden), `turnedRoom`
 *  = the same screen turned (null: no turn possible / unknown). → { ok, why: 'ok'|'rotate'|'narrow', words, bound }. A
 *  refusal keeps its words and its reason (a greyed door is forbidden: the row SAYS why). */
function splitVerdict({ room = 0, turnedRoom = null, minPane = MIN_PANE, divider = SPLIT_DIVIDER } = {}) {
  const bound = splitBound(minPane, divider);
  const r = Number(room) || 0, tr = Number(turnedRoom) || 0;
  if (r >= bound) return { ok: true, why: 'ok', words: SPLIT_WORDS.ok, bound };
  if (tr >= bound) return { ok: false, why: 'rotate', words: SPLIT_WORDS.rotate, bound };
  return { ok: false, why: 'narrow', words: SPLIT_WORDS.narrow, bound };
}

/** THE PAIR for «Split» pressed beside `pick` while `shown` is on show (`pair` = the split now, [left, right] or null).
 *  `frameOf(id)` = the frame a window is drawn in (a tab group's host; default: itself). → [left, right], or null when
 *  `pick` is no other frame (the shown window itself, a tab of its own group — one pane). The shown window keeps its side;
 *  a fresh pair puts it left and `pick` right. */
function pairFor({ shown = null, pick = null, pair = null, frameOf = (id) => id } = {}) {
  if (!shown || !pick) return null;
  const fs = frameOf(shown), fp = frameOf(pick);
  if (!fs || !fp || fs === fp) return null;
  if (Array.isArray(pair) && pair.length === 2 && (pair[0] === fs || pair[1] === fs)) return pair[0] === fs ? [fs, fp] : [fp, fs];
  return [fs, fp];
}

/** THE LAYOUT now. `pair` = this desktop's kept pair (frame ids) or null; `shown` = the frame on show; `alive` = the frames
 *  this desktop can show (built, not minimized); `room` as splitVerdict. → { mode: 'split', pair, focus } | { mode:
 *  'single', keep, why } — keep = the pair stays for a restore ('room': collapsed), false = the split is over ('none',
 *  'gone': a pane's window left, 'other': a window outside the pair is on show). */
function splitLayout({ pair = null, shown = null, alive = [], room = 0, minPane = MIN_PANE, divider = SPLIT_DIVIDER } = {}) {
  if (!Array.isArray(pair) || pair.length !== 2 || !pair[0] || !pair[1] || pair[0] === pair[1]) return { mode: 'single', keep: false, why: 'none' };
  const live = new Set(alive || []);
  if (!live.has(pair[0]) || !live.has(pair[1])) return { mode: 'single', keep: false, why: 'gone' };
  if (shown && !pair.includes(shown)) return { mode: 'single', keep: false, why: 'other' };
  if (!splitVerdict({ room, minPane, divider }).ok) return { mode: 'single', keep: true, why: 'room' };
  return { mode: 'split', pair: [pair[0], pair[1]], focus: shown && pair.includes(shown) ? shown : pair[0] };
}

/** A pane's ✕: the split ends, the OTHER pane is the window on show. → the frame id shown after. */
function closePane(pair, paneId) {
  if (!Array.isArray(pair) || pair.length !== 2) return null;
  return pair[0] === paneId ? pair[1] : pair[1] === paneId ? pair[0] : null;
}

/** THE TURN between two settled viewports `prev` → `next` ({ w, h, sw, sh } — the layout viewport and the screen):
 *  'none' (the orientation held), 'rotation' (it flipped on the SAME screen — the screen's area kept within 2 %, whether
 *  the platform swaps screen.width / height (Android) or never does (iOS)), 'fold' (another screen: the Duo's cover ↔
 *  its inner display). */
function turnOf(prev, next) {
  if (!prev || !next) return 'none';
  const land = (v) => Number(v.w) > Number(v.h);
  if (land(prev) === land(next)) return 'none';
  const a = (Number(prev.sw) || 0) * (Number(prev.sh) || 0), b = (Number(next.sw) || 0) * (Number(next.sh) || 0);
  if (!a || !b) return 'fold';
  return Math.abs(a - b) <= 0.02 * Math.max(a, b) ? 'rotation' : 'fold';
}

/** THE LIST ON A TURN (lane phone-six item 4): a rotation inside the phone tier keeps the conversation list as the person
 *  left it — the compact drawer open ⇔ the regular class's column shown (`wasShown`); anything else (a fold, a tier
 *  change, no turn) → null: the class's own rule (a fresh load's). */
function listOnTurn({ turn = 'none', prevPhone = false, nextPhone = false, wasShown = null } = {}) {
  if (turn !== 'rotation' || !prevPhone || !nextPhone || typeof wasShown !== 'boolean') return null;
  return wasShown;
}

module.exports = { MIN_PANE, SPLIT_DIVIDER, SPLIT_WORDS, splitBound, splitVerdict, pairFor, splitLayout, closePane, turnOf, listOnTurn };

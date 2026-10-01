'use strict';
// THE STAGE'S MOVE RULE, SPOKEN — PURE (imports nothing; CJS so the fast suite
// requires it and esbuild bundles it). inc-muly2izg-cks3 (userW, 2026-09-28).
//
// The rule itself is the owner's 2.112.4 directive and it STAYS: windows never
// move between the Stage and a normal desktop, in either direction (stage-view
// windows — the placeholder, the hero, its aux windows, anything born on the
// Stage — never go to a desktop; nothing moves onto the Stage). What was wrong
// is that it was SILENT: the drag over a desktop preview simply did not
// highlight, the drop did nothing, "Move to Desktop ▸" listed desktops whose
// rows did nothing, and nobody said why (the no-silent-failures law: a by-design
// refusal is still a user-facing failure until it speaks). This module is the
// ONE verdict every door asks — the title-bar drag (window.js), a taskbar item
// dropped on a preview and "Move to Desktop" (desktop-manager.js), the keyboard
// (command-mode.js) — and the ONE wording every door says.
//
// Facts (read by the caller off the window, never stored here):
//   { type, isPlaceholder, onStage, desktopId, bound }   — `bound` = a Stage aux binding
// The Stage's desktop id is passed in (stage-manager's STAGE_ID) so this module
// imports nothing.

/** Which kind of Stage window this is, or null (not a Stage window). The same
 *  membership `StageManager.dragToDesktopBlocked` always tested — the placeholder,
 *  a window borrowed onto the stage, a window whose home IS the stage, a bound aux. */
function stageWindowKind(f, stageId = '__stage__') {
  if (!f) return null;
  if (f.type === 'stage-placeholder' || f.isPlaceholder) return 'placeholder';
  const onStage = !!f.onStage || (f.desktopId != null && f.desktopId === stageId) || !!f.bound;
  if (!onStage) return null;
  return f.type === 'chat' || f.type === 'terminal' ? 'session' : 'window';
}

/** May a window of this Stage `kind` (null = not a Stage window) move to `targetId`?
 *    {ok:true}                         — an ordinary desktop move
 *    {ok:true, same:true}              — a Stage window aimed at the Stage: it is already there (no move, no words)
 *    {ok:false, code:'stage-window', kind} — a Stage window aimed at a normal desktop
 *    {ok:false, code:'onto-stage'}     — a desktop window aimed at the Stage */
function stageMoveVerdict({ kind = null, targetId = null, stageId = '__stage__' } = {}) {
  const toStage = targetId != null && targetId === stageId;
  if (toStage) return kind ? { ok: true, same: true } : { ok: false, code: 'onto-stage', kind: null };
  if (kind) return { ok: false, code: 'stage-window', kind };
  return { ok: true };
}

/** The refusal's words: `line` = what happened (short — it rides beside the
 *  pointer over the preview), `next` = what to do instead. `t` is injected (the
 *  client's i18n; the English string is the key). An ok verdict has no words. */
function stageRefusalWords(v, { t = (s) => s } = {}) {
  if (!v || v.ok) return null;
  if (v.code === 'onto-stage') {
    return { line: t('Windows can’t be moved onto the Stage'), next: t('On the Stage, click a session — it comes with its own windows.') };
  }
  if (v.kind === 'session') {
    return { line: t('The conversation stays on the Stage'), next: t('To use it on a desktop, open the session again on that desktop.') };
  }
  if (v.kind === 'placeholder') {
    return { line: t('The Stage’s slot stays on the Stage'), next: t('Click a session to bring it onto the Stage.') };
  }
  return { line: t('Windows on the Stage stay on the Stage'), next: t('Open it again on the desktop where you want it.') };
}

/** The one sentence a toast / a menu row says: "<line> — <next>". */
function stageRefusalSentence(v, { t = (s) => s } = {}) {
  const w = stageRefusalWords(v, { t });
  return w ? `${w.line} — ${w.next}` : '';
}

/** THE GEOMETRY A WINDOW CARRIES INTO ITS REPLACEMENT (verify r1 of inc-munl8jkl-gaih, 2026-09-30). A billing switch,
 *  a restart and the resume of a stopped conversation close the old window and re-create it at the old window's box.
 *  A window BORROWED by the Stage sits at the Stage's SLOT: its element's box is the slot, its OWN box is the home the
 *  Stage remembered (`stageHomeBounds`, un-maximized with `stageHomeMax`). The slot is the Stage's, never the window's —
 *  carried as the window's box it became the resumed conversation's home, the hand-back landed it at slot size on its
 *  desktop and every client's record of that desktop took it (the slot-leaks-into-desktop-records class the Stage's
 *  belt exists for). Facts off the window, never stored here. A borrowed window with no remembered home carries NO
 *  box (the Stage's belt gives it one at the next borrow). */
function carriedGeometry({ gridBounds = null, preSnapBounds = null, isMaximized = false, desktopId = null, onStage = false, stageHomeBounds = null, stageHomeMax = false } = {}) {
  const borrowed = !!onStage;
  return {
    gridBounds: borrowed ? (stageHomeBounds ? { ...stageHomeBounds } : null) : (gridBounds ? { ...gridBounds } : null),
    preSnapBounds: preSnapBounds ? { ...preSnapBounds } : null,
    isMaximized: borrowed ? !!stageHomeMax : !!isMaximized,
    desktopId: desktopId || null,
  };
}

/** WHERE A TAB TORN OUT OF A BORROWED FRAME LANDS ON THE DESKTOP (verify r2). An off-Stage tear-off drops the torn
 *  window under the pointer, BESIDE its frame; on the Stage the drop point is Stage geometry, so the torn half takes the
 *  frame's home shifted by one cascade step (clamped inside the workspace) — the frame keeps the home itself, and the
 *  two never sit exactly on top of each other (the survivor hidden behind the hero after the leave). */
const TORN_OFF_STEP = 0.04;
function tornOffBox(home, step = TORN_OFF_STEP, k = 0) {
  if (!home || ![home.left, home.top, home.width, home.height].every(Number.isFinite)) return null;
  // the k-th half torn off ONE home steps once more (verify r3: two tears from the same frame took the same step and sat
  // exactly on each other); `k` is the Stage's count for that home, this session
  const d = step * (1 + Math.max(0, Math.floor(Number(k) || 0)));
  // one axis: the step forward when the workspace has room for it, else BACKWARD (verify r3: a home flush with the right
  // and bottom edges — a snapped quadrant, the corner — had both steps clamped back onto the home itself: the torn-off half
  // sat exactly on the frame, the frame's title clicks landed in the hero), else — a home as large as the workspace — as is
  const axis = (pos, size) => { const max = Math.max(0, 1 - size); if (pos + d <= max + 1e-9) return Math.min(pos + d, max); if (pos - d >= -1e-9) return Math.max(0, pos - d); return Math.max(0, Math.min(pos, max)); };
  return { left: axis(home.left, home.width), top: axis(home.top, home.height), width: home.width, height: home.height };
}

/** THE HOME A HALF HANDS BACK TO A FRAME RE-FORMED AROUND IT (verify r4 of inc-munl8jkl-gaih). `_giveHome` stamps a half of a
 *  split borrowed frame with the frame's home AND the box the Stage placed it at (`at`); a restored record that re-forms
 *  the frame around that half takes the home back ONLY while the half still stands where the Stage put it. A half the
 *  user moved by hand off the Stage (or a record placed elsewhere) stands at HIS box: the stale stamp must not drag the
 *  re-formed group back to where the frame stood before (measured on the real classes: a group re-formed by a remote
 *  record jumped from the user's box to the pre-tear home). A maximized home is held while the half is still maximized
 *  (its captured fractions are the whole workspace, never the box). No stamp, no placed box ⇒ nothing handed back —
 *  the frame's home is then the box its host stands at, which is always a place the user can see. */
function givenHomeOf(stamp, { gridBounds = null, isMaximized = false } = {}, tol = 0.005) {
  if (!stamp || !stamp.gridBounds || !stamp.at) return null;
  const same = (a, b) => !!a && !!b && ['left', 'top', 'width', 'height'].every((k) => Number.isFinite(a[k]) && Number.isFinite(b[k]) && Math.abs(a[k] - b[k]) < tol);
  const held = stamp.isMaximized ? !!isMaximized : same(gridBounds, stamp.at);
  return held ? { gridBounds: { ...stamp.gridBounds }, isMaximized: !!stamp.isMaximized } : null;
}

/** WHICH CASCADE STEP THE NEXT HALF TORN OFF A BORROWED FRAME TAKES (verify r4 of inc-munl8jkl-gaih): the first step whose
 *  box no window on the frame's home desktop occupies (`occupied` = their boxes; the frame's own members are the caller's
 *  to leave out). r3 counted the tears per home IN MEMORY: a reload (the self-update reloads the page) reset the count and
 *  the next half landed EXACTLY on the first; a guest's close consumed a step nothing was placed at; the seventh cycled
 *  onto the first. What stands on the desktop is a fact every client and every reload derives alike. Every step taken
 *  ⇒ 0 (the cascade's own cycle: a thirteenth half is the user's stack to sort out). */
function tornOffStep(home, occupied = [], { step = TORN_OFF_STEP, max = 12, tol = 0.005 } = {}) {
  if (!home) return 0;
  const finite = (b) => !!b && ['left', 'top', 'width', 'height'].every((k) => Number.isFinite(b[k]));
  const boxes = (Array.isArray(occupied) ? occupied : []).filter(finite);
  const same = (a, b) => ['left', 'top', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) < tol);
  for (let k = 0; k < max; k++) {
    const b = tornOffBox(home, step, k);
    if (!b) return 0;
    if (!boxes.some((o) => same(o, b))) return k;
  }
  return 0;
}

module.exports = { stageWindowKind, stageMoveVerdict, stageRefusalWords, stageRefusalSentence, carriedGeometry, tornOffBox, tornOffStep, givenHomeOf, TORN_OFF_STEP };

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

module.exports = { stageWindowKind, stageMoveVerdict, stageRefusalWords, stageRefusalSentence };

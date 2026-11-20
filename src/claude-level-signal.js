'use strict';
/**
 * src/claude-level-signal.js — PURE: the background level signal's declaration in a Claude Code binary, and the build's own identity
 * strings (moved verbatim out of src/claude-model-catalog.js by B-24e2, which re-exports both): the device agent bundles THIS module
 * alone (src/cli-level-scan.js) — not the catalog's parser and its provider rows. Imports nothing.
 */

/** The build's own identity strings: `VERSION:"x.y.z"` … `BUILD_TIME:"…Z"` (the same constants object). */
function identityIn(text) {
  const m = /VERSION:"(\d{1,4}\.\d{1,4}\.\d{1,6})"[^{}]{0,600}?BUILD_TIME:"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)"/.exec(text);
  return m ? { version: m[1], builtAt: m[2] } : null;
}

/** THE BACKGROUND LEVEL SIGNAL, DECLARED (lane level-signal-2b, majordomo piece 2b). The hub reads a conversation's never-published
 *  background set as EMPTY only on a build that has the signal (src/conversation-facts.js trackedFacts); a build outside the
 *  measured span of tracked dumps has it when its OWN binary declares it in its record union — the object the tree's dump recipe
 *  reads (scripts/claude-cli-dump.mjs extractZodUnion: `<obj>({type:<lit>("system"),subtype:<lit>("background_tasks_changed")`,
 *  measured on 2.1.322: `u({type:T("system"),subtype:T("background_tasks_changed"),tasks:C(u({task_id:o(),…`). A mention in a
 *  description, or a reader's comparison (`e.subtype==="background_tasks_changed"`), is not a declaration. `levelSignalAt(text)`
 *  → the index of the declaration in `text`, or -1. PURE; bounded by the occurrences of the literal (each a 200-char look). */
const LEVEL_SIGNAL = 'background_tasks_changed';
const LEVEL_NEEDLE = '("' + LEVEL_SIGNAL + '")';
const LEVEL_IDENT = '[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*';
const LEVEL_DECL = new RegExp('(?<![A-Za-z0-9_$.])' + LEVEL_IDENT + '\\(\\{type:(' + LEVEL_IDENT + ')\\("system"\\),subtype:\\1\\("' + LEVEL_SIGNAL + '"\\)$');
function levelSignalAt(text) {
  if (typeof text !== 'string') return -1;
  let i = -1;
  while ((i = text.indexOf(LEVEL_NEEDLE, i + 1)) >= 0) {
    const from = Math.max(0, i - 200), end = i + LEVEL_NEEDLE.length;
    const m = LEVEL_DECL.exec(text.slice(from, end));
    if (m) return from + m.index;
  }
  return -1;
}


module.exports = { LEVEL_SIGNAL, LEVEL_NEEDLE, levelSignalAt, identityIn };

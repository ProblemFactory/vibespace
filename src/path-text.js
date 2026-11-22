'use strict';
// PATH TEXT (the paired machine's folder listing, r1636: «the machine collects, the hub shapes»): the few path facts BOTH halves of
// the folder field's answer read — a path in its `~/…` form on the machine it lives on and back, one candidate's answer from its ONE
// bare stat (lineAnswerOf, B-d833's fourth shape), and the package name that marks an instance's own checkout. Moved out of
// src/path-candidates.js (which re-exports every one of them, unchanged) so the device agent's bundle carries these few lines and
// NOT the candidates' ranking or the verdict's words: src/dir-collect.js (the collector, on the hub AND on a paired machine) reads
// them here. PURE: imports nothing.

const SELF_PACKAGE = 'vibespace';   // a folder whose package.json names this is an instance's own checkout (isExcludedPath's `self.roots`)
const toTilde = (home, p) => { const h = String(home || ''); const s = String(p || ''); return h && s === h ? '~' : h && s.startsWith(h + '/') ? '~' + s.slice(h.length) : s; };
const fromTilde = (home, p) => { const s = String(p || ''); return s === '~' ? String(home || '') : s.startsWith('~/') ? String(home || '') + s.slice(1) : s; };
const stripSlash = (p) => { const s = String(p || ''); return s.length > 1 ? s.replace(/\/+$/, '') || '/' : s; };
/** one candidate from the worker's ONE bare stat (src/dir-ops.js pathStat): 'listed' (a folder — or a file where a file will do),
 *  'listed' + completed (absent, and exactly ONE name in its parent starts with its last segment, a folder there), 'absent' (ENOENT;
 *  several names = no completion), 'failed' (the machine's own error about it) */
function lineAnswerOf(stat, { files = false } = {}) {
  const s = stat || {};
  if (s.err) return { answer: 'failed', err: String(s.err) };
  if (s.exists) return s.isDir !== false || files ? { answer: 'listed', ...(s.link ? { link: s.link } : {}), ...(s.isDir === false ? { file: true } : {}) } : { answer: 'absent', file: true };
  if (s.namesErr) return { answer: 'failed', err: String(s.namesErr) };
  const one = s.one;
  if (one && one.exists && (one.isDir !== false || files) && !one.err) return { answer: 'listed', completed: one.path, ...(one.isDir === false ? { file: true } : {}) };
  return { answer: 'absent' };
}

module.exports = { SELF_PACKAGE, toTilde, fromTilde, stripSlash, lineAnswerOf };

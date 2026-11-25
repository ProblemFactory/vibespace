'use strict';
// B-460d's remainder — THE NICE PROGRAM'S LOOK, in ONE file both sides require (at src/, inside both fs censuses' scope:
// scripts/sync-fs-census.mjs and mount-reader-census.mjs scan src, src/server, src/routes): the hub (src/server/spawn-priority.js: a local
// start's priority) and the device agent (src/agentd/agentd.js: its hello says `nicePath`, so the hub starts a paired machine's
// conversation below THAT machine's agent with THAT machine's own program — the same verdict, src/server/spawn-priority.js
// devicePriorityFor). FIXED local system directories (coreutils / busybox / Homebrew), never the PATH: a PATH entry may sit on
// a network mount, and this is looked at on the main thread. ONE look per process. Windows: none (a nice under Git Bash sets
// no Windows priority class). Node builtins only — the device bundle carries it.
const fs = require('fs');
const path = require('path');

const NICE_DIRS = Object.freeze(['/usr/bin', '/bin', '/usr/local/bin', '/opt/homebrew/bin']);
let niceAt;            // undefined = not looked yet; null = none here; else its absolute path (ONE look per process)

/** The nice program's absolute path, or null — looked up ONCE per process (a few local stats, the first ask). */
function niceProgram({ dirs = NICE_DIRS, access = (p) => fs.accessSync(p, fs.constants.X_OK), platform = process.platform } = {}) {
  if (niceAt !== undefined) return niceAt;
  niceAt = null;
  if (platform === 'win32') return niceAt;
  for (const d of dirs) { const p = path.join(d, 'nice'); try { access(p); niceAt = p; break; } catch { } }
  return niceAt;
}

/** B-460d's remainder (主开发 r1362 (b)) — A MACHINE'S ANSWER IS A CHOICE, NEVER A LINE: what another machine says its nice program is
 *  (its agent's hello `nicePath`, the look above run THERE) → the HUB's OWN constant from this fixed list when it matches one EXACTLY,
 *  else null (a crafted line, another path, nothing). The spawn line is composed from the returned constant only — the machine's
 *  bytes never reach it. Windows: none. PURE. */
const LISTED = Object.freeze(NICE_DIRS.map((d) => path.posix.join(d, 'nice')));
function listedNicePath(answer, { platform = null } = {}) {
  if (platform === 'win32' || typeof answer !== 'string') return null;
  const i = LISTED.indexOf(answer);
  return i < 0 ? null : LISTED[i];
}

/** B-460d's last part (主开发 r4369) — A PAIRED MACHINE's SERVE START, as the hub hands it with an `opencode-serve` op (the ONE
 *  verdict its conversations take: src/server/spawn-priority.js devicePriorityFor, fed THIS machine's hello nicePath, composed by
 *  src/spawn/line.js priorityArgv) → { argv, fact } taken ONLY when its argv is exactly [THIS machine's own nice program, '-n', a
 *  step of 1–19]; the fact is built from that step, never taken as handed. Anything else — an older hub's none, a foreign program,
 *  another step, more words, a machine with no program — ⇒ null: the serve starts as the release starts it. PURE. */
function serveStartOf(start, nicePath) {
  if (!start || typeof start !== 'object' || typeof nicePath !== 'string' || !nicePath) return null;
  const a = start.argv;
  if (!Array.isArray(a) || a.length !== 3 || a[0] !== nicePath || a[1] !== '-n' || typeof a[2] !== 'string' || !/^(?:[1-9]|1[0-9])$/.test(a[2])) return null;
  return { argv: [nicePath, '-n', a[2]], fact: { by: Number(a[2]) } };
}

/** a suite's seam: forget the one look */
function _resetNice() { niceAt = undefined; }

module.exports = { niceProgram, NICE_DIRS, LISTED, listedNicePath, serveStartOf, _resetNice };

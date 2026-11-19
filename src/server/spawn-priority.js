'use strict';
// B-460d (the owner's yes, 2026-11-17) — WHAT A CONVERSATION STARTS NEVER OUTRANKS THE HUB.
//
// Measured 2026-11-12: with lanes building, the hub's main thread waited 320 s for a CPU in 17 minutes (load 42) —
// every conversation and everything it started ran at the hub's own priority, so a parallel build or a test tier took
// the cores the page needed. A LOCAL conversation (the dtach road and the daemon pipe road — both run src/spawn/line.js)
// and a Background Work job (src/jobs.js) now START below the hub: `nice -n 5` on the spawn itself, so the first process
// is born with it and everything it starts inherits it (never a set-priority call after the fork, which races the
// child's own children). +5 over the hub's own niceness, whatever that is.
//
// The setting `agents.lowerCpuPriority` (default on; off = the release's spawn, byte for byte) is read at each START: a
// running conversation keeps the priority it started with. A machine with no nice program is never unable to start one:
// it starts at the hub's priority, and the journal says so once. NOT HERE: a paired machine's conversations (the device
// agent needs a signed release), CPU weights or a group per conversation (the separation programme's).
const fs = require('fs');
const path = require('path');
const { PRIORITY_BY } = require('../spawn/line.js');

const SETTING = 'agents.lowerCpuPriority';
// where the nice program lives (coreutils / busybox / Homebrew) — FIXED local system directories, never the PATH: a
// PATH entry may sit on a network mount, and this is looked at on the main thread
const NICE_DIRS = Object.freeze(['/usr/bin', '/bin', '/usr/local/bin', '/opt/homebrew/bin']);
const FACT_WHY = Object.freeze(['off', 'no-nice', 'remote']);

let niceAt;            // undefined = not looked yet; null = none here; else its absolute path (ONE look per process)
let saidMissing = false;

/** The nice program's absolute path, or null — looked up ONCE per process (a few local stats, the first start). */
function niceProgram({ dirs = NICE_DIRS, access = (p) => fs.accessSync(p, fs.constants.X_OK) } = {}) {
  if (niceAt !== undefined) return niceAt;
  niceAt = null;
  for (const d of dirs) { const p = path.join(d, 'nice'); try { access(p); niceAt = p; break; } catch { } }
  return niceAt;
}

/** THE START'S PRIORITY. → { priority: {nice, by} | null (src/spawn/line.js priorityArgv), fact: {by} | {by: 0, why} }:
 *  the fact is what the conversation's properties say (`why` ∈ FACT_WHY). `local` false = a remote conversation's local
 *  transport (its agent runs on the other machine: not lowered from here). */
function priorityFor({ serverSetting = () => undefined, local = true, log = console, nice = niceProgram } = {}) {
  if (!local) return { priority: null, fact: { by: 0, why: 'remote' } };
  let on = true;
  try { on = serverSetting(SETTING) !== false; } catch { on = true; }
  if (!on) return { priority: null, fact: { by: 0, why: 'off' } };
  const p = nice();
  if (!p) {
    if (!saidMissing) { saidMissing = true; try { log.warn?.(`[spawn-priority] no nice program in ${NICE_DIRS.join(', ')} — conversations and jobs start at the server's own CPU priority (${SETTING} is on)`); } catch { } }
    return { priority: null, fact: { by: 0, why: 'no-nice' } };
  }
  return { priority: { nice: p, by: PRIORITY_BY }, fact: { by: PRIORITY_BY } };
}

/** PURE: a stored fact (a session's meta `cpuNice`) → the fact, or null when it is not one */
function factOf(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x) || !Number.isInteger(x.by) || x.by < 0 || x.by > 19) return null;
  if (x.by > 0) return { by: x.by };
  return FACT_WHY.includes(x.why) ? { by: 0, why: x.why } : null;
}

/** a suite's seam: forget the one look and the said line */
function _reset() { niceAt = undefined; saidMissing = false; }

module.exports = { priorityFor, niceProgram, factOf, SETTING, NICE_DIRS, FACT_WHY, _reset };

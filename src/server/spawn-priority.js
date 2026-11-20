'use strict';
// B-460d (the owner's yes, 2026-11-17) — WHAT A CONVERSATION STARTS NEVER OUTRANKS THE HUB.
//
// Measured 2026-11-12: with lanes building, the hub's main thread waited 320 s for a CPU in 17 minutes (load 42) —
// every conversation and everything it started ran at the hub's own priority, so a parallel build or a test tier took
// the cores the page needed. A LOCAL conversation (the dtach road and the daemon pipe road — both run src/spawn/line.js)
// and a Background Work job (src/jobs.js) now START below the hub: `nice -n 5` on the spawn itself, so the first process
// is born with it and everything it starts inherits it (never a set-priority call after the fork, which races the
// child's own children). +5 over the hub's own niceness, whatever that is. ONE road reads this answer and sets the step right
// AFTER its spawn instead: the vault run door (B-7f18 — no program may stand in front of a minted value; src/server/vault-run-door.js
// lowerRun says what that costs).
//
// The setting `agents.lowerCpuPriority` (default on; off = the release's spawn, byte for byte) is read at each START: a
// running conversation keeps the priority it started with. A machine with no nice program is never unable to start one:
// it starts at the hub's priority, and the journal says so once. A PAIRED machine's conversation (B-460d's remainder):
// devicePriorityFor — the SAME verdict with THAT machine's own nice program as its input (the device agent's hello says it,
// from the shared look src/nice-program.js); the agent rides the signed update. NOT HERE: CPU weights or a group per
// conversation (the separation programme's), an ssh host, a Windows machine.
const { PRIORITY_BY } = require('../spawn/line.js');
const NP = require('../nice-program.js');   // THE look, ONE file: the hub's starts and the device agent's hello

const SETTING = 'agents.lowerCpuPriority';
// where the nice program lives — the shared look (src/nice-program.js): FIXED local system directories, never the PATH
const { NICE_DIRS, niceProgram } = NP;
const FACT_WHY = Object.freeze(['off', 'no-nice', 'remote']);

let saidMissing = false;

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
    if (!saidMissing) { saidMissing = true; try { log.warn?.(`[spawn-priority] no nice program in ${NICE_DIRS.join(', ')} — conversations, jobs and vault runs start at the server's own CPU priority (${SETTING} is on)`); } catch { } }
    return { priority: null, fact: { by: 0, why: 'no-nice' } };
  }
  return { priority: { nice: p, by: PRIORITY_BY }, fact: { by: PRIORITY_BY } };
}

/** PURE (B-460d's remainder): the nice program a device agent's hello names (`nicePath`, its own look) — an absolute path with no
 *  space, control or direction-changing format character, at most 1024 characters, never from a Windows agent; else null */
function nicePathOf(info) {
  const p = info && typeof info.nicePath === 'string' ? info.nicePath : '';
  if (!p || p.length > 1024 || !p.startsWith('/') || (info && info.platform === 'win32') || /[\s\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(p)) return null;
  return p;
}

/** B-460d's remainder — A PAIRED MACHINE'S START: the SAME verdict (priorityFor) with THAT machine's own nice program as its
 *  input — the one its agent's hello names. Lowered only when the agent named one and the setting is on; every other case
 *  (an older agent that says none, a machine with none, Windows, the setting off) is today's remote answer: the release's
 *  spec, the fact «set by its own machine». The step is relative to the device agent's own niceness, as +5 is the hub's. */
function devicePriorityFor({ serverSetting = () => undefined, hello = null } = {}) {
  const p = nicePathOf(hello);
  const pri = p ? priorityFor({ serverSetting, local: true, nice: () => p }) : null;
  return pri && pri.priority ? pri : priorityFor({ local: false });
}

/** PURE: a stored fact (a session's meta `cpuNice`) → the fact, or null when it is not one */
function factOf(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x) || !Number.isInteger(x.by) || x.by < 0 || x.by > 19) return null;
  if (x.by > 0) return { by: x.by };
  return FACT_WHY.includes(x.why) ? { by: 0, why: x.why } : null;
}

/** a suite's seam: forget the one look and the said line */
function _reset() { NP._resetNice(); saidMissing = false; }

module.exports = { priorityFor, devicePriorityFor, nicePathOf, niceProgram, factOf, SETTING, NICE_DIRS, FACT_WHY, _reset };

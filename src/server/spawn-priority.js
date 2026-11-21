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
/** the setting read at THIS start — on unless it says false; a setting that cannot be read is on (never a start refused) */
function settingOn(serverSetting) { try { return serverSetting(SETTING) !== false; } catch { return true; } }

function priorityFor({ serverSetting = () => undefined, local = true, log = console, nice = niceProgram } = {}) {
  if (!local) return { priority: null, fact: { by: 0, why: 'remote' } };
  if (!settingOn(serverSetting)) return { priority: null, fact: { by: 0, why: 'off' } };
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
const saidNoPath = new Set();   // the machines whose agent stated no nice program: ONE journal line each, per process (bounded)
function devicePriorityFor({ serverSetting = () => undefined, hello = null, machine = null, log = console } = {}) {
  // 主开发 r705 (1): the hub's own switch first — OFF is the reason a person can change, said as a local start says it
  if (!settingOn(serverSetting)) return priorityFor({ serverSetting });
  const p = nicePathOf(hello);
  if (p) { const pri = priorityFor({ serverSetting, local: true, nice: () => p }); if (pri.priority) return pri; }
  // r705 (2): an agent that states no program (an older agent, a machine without one, a Windows agent) is said ONCE a machine
  const id = machine && (machine.id || machine.deviceId);
  if (!p && id && !saidNoPath.has(id) && saidNoPath.size < 256) {
    saidNoPath.add(id);
    const name = String((machine && machine.name) || id).replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 64);
    try { log.warn?.(`[spawn-priority] ${name}: its agent states no nice program (an older agent, a machine without one, or Windows) — its conversations start at that agent's own priority`); } catch { }
  }
  return priorityFor({ local: false });
}

/** B-460d's remainder, its ssh half (lane login-request-card, 主开发 r1362 (3)) — AN ssh-ONLY MACHINE's START: the SAME verdict, fed
 *  by what THAT machine says through a round trip that already exists — its agent's hello on a link that is UP now (linkedHello:
 *  memory only — never a dial, never a wait, never a timer: no link = no answer) — and taken only as a CHOICE among the hub's own
 *  fixed list (src/nice-program.js listedNicePath: an exact match ⇒ the HUB's constant; the machine's bytes never reach a line).
 *  No answer, another answer, Windows ⇒ the release's start and the fact «set by its own machine». The setting off ⇒ off. */
const saidNoSsh = new Set();   // the follow (round wmm5vpkhl): the ssh-only machines with no answer it can use — ONE journal line each, per process (bounded)
function sshPriorityFor({ serverSetting = () => undefined, hello = null, machine = null, log = console } = {}) {
  if (!settingOn(serverSetting)) return priorityFor({ serverSetting });
  const p = NP.listedNicePath(hello && hello.nicePath, { platform: hello && hello.platform });
  if (p) { const pri = priorityFor({ serverSetting, local: true, nice: () => p }); if (pri.priority) return pri; }
  // said ONCE a machine, as devicePriorityFor says it: the machine's own bytes (a path it named) never reach the line
  const id = machine && machine.id;
  if (id && !saidNoSsh.has(id) && saidNoSsh.size < 256) {
    saidNoSsh.add(id);
    const name = String(machine.name || id).replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 64);
    try { log.warn?.(`[spawn-priority] ${name}: no answer it can use from its agent (no link up now, an older agent, or a nice program not on this server's list) — its conversations start at that machine's own priority`); } catch { }
  }
  return priorityFor({ local: false });
}
/** PURE (the follow, round wmm5vpkhl): an ssh road's fact says what its step is BELOW — the ssh login on that machine (`of:
 *  'login'`: the keeper road and the terminal road start under the ssh session, not under the machine's agent); `join`: the
 *  terminal road's `dtach -A` may JOIN a shell already running, which keeps its own priority (the road cannot tell which) */
function sshFactOf(fact, { join = false } = {}) {
  if (!fact || !(fact.by > 0)) return fact;
  return { ...fact, of: 'login', ...(join ? { join: true } : {}) };
}
/** the hello of a machine's agent on a link that is UP NOW — memory only (hosts.connectedDevice), or null; never dials */
function linkedHello(hosts, id) {
  try {
    const up = hosts && typeof hosts.connectedDevice === 'function' ? hosts.connectedDevice(id) : null;
    if (!up) return null;
    return typeof up.helloInfo === 'function' ? up.helloInfo() : (up.status && up.status().info) || null;
  } catch { return null; }
}

/** PURE: a stored fact (a session's meta `cpuNice`) → the fact, or null when it is not one */
function factOf(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x) || !Number.isInteger(x.by) || x.by < 0 || x.by > 19) return null;
  if (x.by > 0) return { by: x.by, ...(x.of === 'login' ? { of: 'login' } : {}), ...(x.of === 'login' && x.join === true ? { join: true } : {}) };
  return FACT_WHY.includes(x.why) ? { by: 0, why: x.why } : null;
}

/** a suite's seam: forget the one look and the said line */
function _reset() { NP._resetNice(); saidMissing = false; saidNoPath.clear(); saidNoSsh.clear(); }

module.exports = { priorityFor, devicePriorityFor, sshPriorityFor, sshFactOf, linkedHello, nicePathOf, niceProgram, factOf, SETTING, NICE_DIRS, FACT_WHY, _reset };

#!/usr/bin/env node
// Background Work job wrapper (STATIC tracked; docs/design-background-work.md §5).
// argv: node job-wrapper.js <ctlDir> <specPath> --proto=3 (the protocol the server speaks — below)
//   ctlDir holds: pid.json (OUR first act — the identity stamp), current.log,
//   exit.json (written on child exit), answers.jsonl (tailed → child stdin when
//   stdinOpen). specPath = <ctlDir>/spec.<runTs>.json = {argv, cwd, env,
//   logCapBytes, stdinOpen}, 0600, written by the engine (lane job-spec-off-argv,
//   2026-10-20): env carries the job's secrets and its job token, and argv is
//   public to every local user through /proc/<pid>/cmdline — so the spec rides a
//   file, read ONCE here and unlinked (nothing re-reads it; a job back after a
//   restart is re-spawned with a fresh file). The child's env is spec.env and
//   nothing else: a spec without one is refused, never run on our own env.
// Runs setsid-detached (the engine spawns us detached); we own the process
// group. First act = atomic pidfile with {pid, starttime, bootId, argvHash} —
// the spawn-then-persist crash window closes because WE write our own stamp.
// THE MEMORY BOUND (lane jobs-memory-bound, 2026-10-26): spec.memory = {mb, unit, rungs} — the bound the server resolved; the
// rung that holds the child is PROVEN here before the job runs and said (bound.json, then exit.json `memory`), a refused rung
// falls to the next, and an end by the bound is named (below, THE MEMORY BOUND).
// THE VAULT VALUES (lane vault-job-road, protocol 3 — design-vault-service-secret D3/D5): a job that declared `--vault` gets
// its values from the hub on OUR fd 3 as one frame (src/vault-job.js; the spec names them and their fds, never a value). We
// drain it (≤ 64 KiB, ≤ 5 s — else the run is not started) and CLOSE it before anything is spawned (a gate, systemd-run,
// prlimit, the job: none inherits it), then hand each value to the job on a fresh pipe at fd 4 + i on every rung we try; the
// job's env gets `NAME_FD=<n>` only. We hold this run's values to MASK ITS LOG — never a DEK — and zero them at exit.
'use strict';
const fs = require('fs');
const path = require('path');
// B-15ac (lane lg-store-writes): the ONE close of a written file — src/fd-close.js, required at the start as kept-copies.js is (the
// build this wrapper shipped with); a tree without it: the SAME words inline (test-fd-close-census ⑤ pins the two spellings equal)
let FC = null; try { FC = require(path.join(__dirname, '..', '..', 'src', 'fd-close.js')); } catch { FC = null; }
const closeWritten = FC ? FC.closeWritten : (fd, where, say) => { if (fd === null || fd === undefined) return null; try { fs.closeSync(fd); } catch (e) { try { say(`${where}: the file could not be closed (${(e && e.code) || 'error'}) — what was written may not be on disk`); } catch { } } return null; };
const renameSynced = FC && FC.renameSynced ? FC.renameSynced : (tmp, final, bytes, { mode, where, say } = {}) => { const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes)); let fd = fs.openSync(tmp, 'w', mode === undefined ? 0o666 : mode); try { for (let o = 0; o < b.length;) { const n = fs.writeSync(fd, b, o, b.length - o); if (!(n > 0)) throw Object.assign(new Error('a short write'), { code: 'ESHORT' }); o += n; } try { fs.fsyncSync(fd); } catch (e) { try { if (typeof say === 'function') say(`${where}: its new bytes could not be synced before it took its name (${(e && e.code) || 'error'}) — after a power cut it may read empty`); } catch { } } } finally { fd = closeWritten(fd, where, say); } fs.renameSync(tmp, final); };   // B-bcb8 unit B: src/fd-close.js renameSynced, the same words inline (test-fd-close-census ⑥)
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');

// ── THE NAMED END's PURE judges (lane jobs-memory-bound, acceptance round 2) — exported to a suite that require()s this file
// with no ctl dir on argv (the fixtures of scripts/test-jobs-memory.mjs); run as the wrapper, nothing below changes.
// An allocation the bound refused, in the job's LAST WORDS — keyed on the error CODE first, then on the words of every
// runtime the hub runs (measured under RLIMIT_DATA 2026-10-27: node 22.22 and 24.12 «RangeError: Array buffer allocation
// failed», no code; node 24.22 «RangeError: Failed to allocate memory», code ERR_MEMORY_ALLOCATION_FAILED; V8's own heap
// limit «JavaScript heap out of memory»), then other runtimes' (Python, C++, Go, Rust, a JVM). '' = not one.
const ALLOC_CODES = /\b(ERR_MEMORY_ALLOCATION_FAILED|ENOMEM)\b/;
const ALLOC_WORDS = /Array buffer allocation failed|Failed to allocate memory|JavaScript heap out of memory|Fatal process out of memory|Cannot allocate memory|\bMemoryError\b|std::bad_alloc|runtime: out of memory|memory allocation of \d+ bytes failed|OutOfMemoryError/i;
function allocationRefused(text) {
  const t = String(text || ''), c = ALLOC_CODES.exec(t);
  if (c) return `code ${c[1]}`;
  const w = ALLOC_WORDS.exec(t);
  return w ? `«${w[0]}»` : '';
}
/** the manager's major version: «259.5-0ubuntu3.4» (systemctl show -p Version) · «systemd 249 (249.11-…)» (--version) → 259 / 249 */
function systemdMajor(text) { const m = /^(?:systemd\s+)?(\d{2,4})\b/.exec(String(text || '').trim()); return m ? Number(m[1]) : 0; }
/** a scope's end on a manager ≥ 253 (OOMPolicy=stop): its Result says oom-kill; a peak well below the bound = the host ran out
 *  (a scope with no bound of its own — the owner's 0 where nothing contains it — can only have met the host's OOM) */
function scopeResultEnd(result, peakBytes, boundMb) {
  if (result !== 'oom-kill') return {};
  const peakMb = peakBytes ? Math.round(peakBytes / 1048576) : undefined;
  if (!boundMb) return { cause: 'oom', how: 'the kernel killed it (it had no bound of its own — the host ran out)', peakMb };
  return peakBytes && peakBytes < 0.9 * boundMb * 1048576 ? { cause: 'oom', how: 'the kernel killed it below its bound (the host ran out)', peakMb } : { cause: 'oom-bound', how: 'its scope was killed at MemoryMax (oom-kill)', peakMb };
}
/** THE CAP's arithmetic — src/job-model.js instanceCapOf's rule, its numbers handed in by the server (spec.memory.capRule; a
 *  suite pins the two equal): a limit leaves the hub max(1 GiB, 25 %) of it, a job the rest, never under the floor */
function capOf(limitMb, rule) {
  if (!(limitMb > 0) || !rule) return null;
  const hubMb = Math.max(rule.hubShareMinMb, Math.ceil(limitMb * rule.hubShareRatio));
  return { limitMb, hubMb, capMb: Math.max(rule.minMb, limitMb - hubMb) };
}
/** the cgroups two paths SHARE — their common ancestors, deepest first, «/» last: a scope beside the hub is inside these and
 *  nothing else of the hub's (the hub's own unit is not one of them) */
function sharedAncestors(a, b) {
  const pa = String(a || '').split('/').filter(Boolean), pb = String(b || '').split('/').filter(Boolean);
  let n = 0;
  while (n < pa.length && n < pb.length && pa[n] === pb[n]) n++;
  const out = [];
  for (let i = n; i >= 0; i--) out.push('/' + pa.slice(0, i).join('/'));
  return out;
}
/** a scope's end on a manager < 253 (no OOMPolicy for a scope): its OWN memory.events at the go and at the job's end — an
 *  oom_kill with the scope's own `oom` (its MemoryMax reached) is the bound; an oom_kill without it, the host's OOM */
function scopeEventsEnd(atGo, atEnd) {
  if (!atGo || !atEnd) return {};
  const kills = atEnd.oomKill - atGo.oomKill, ooms = atEnd.oom - atGo.oom;
  if (!(kills > 0)) return {};
  return ooms > 0 ? { cause: 'oom-bound', how: `its scope's memory.events: oom ${ooms}, oom_kill ${kills} (at MemoryMax)` } : { cause: 'oom', how: `its scope's memory.events: oom_kill ${kills} below its MemoryMax (the host ran out)` };
}
/** what the job LEFT running, worded (round 5; round 6: what left its group, what the record names of more than its bound) —
 *  src/job-model.js leftWords' twin, line for line (a suite pins the two equal) */
function leftWords(l) {
  const n = l.n || 0, es = (k) => (k === 1 ? '' : 'es');
  const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const sh = l.short ? ` (${l.short} process${es(l.short)} got less than the full grace)` : ''; // round 12: killed without its grace
  if (l.cleared) return `it left ${n} process${es(n)} running — stopped at ${hhmm(l.cleared)}${sh}`;
  if (l.gone) return `it left ${n} process${es(n)} running — ${n === 1 ? 'it' : 'they'} had already ended by ${hhmm(l.gone)}`;
  if (l.hubMain) return `its main process was the VibeSpace hub — the ${n} process${es(n)} it left ${n === 1 ? 'is' : 'are'} the hub's (its conversations and helpers): left running, never stopped by this job`;
  if (l.kept) return `it left ${n} process${es(n)} running — kept: a service's own until it is stopped or started again${l.escaped ? ` (${l.escaped} outside its group)` : ''}${l.recorded ? ` (${l.recorded} of ${n} recorded)` : ''}`;
  const esc = l.escaped ? `${l.escaped} process${es(l.escaped)} left its group — not stopped` : '';
  if (!n) return `${esc}; run it as a service job`;
  const out = l.outside ? ` (${l.outside} outside its group)` : '';   // B-7ca1: a task's stop ended what left its group too
  return `the job left ${n} process${es(n)} running — ${n === 1 ? 'it was' : 'they were'} stopped${l.force ? ' by force' : ''}${out}${sh}${esc ? `; ${esc}; run it as a service job` : '; to keep a daemon, run it as a service job'}`;
}
/** PURE (B-f494): a LOWERED job's scope property — `-p CPUWeight=<w>` when the server asked one (1–10000) AND cpu is ENABLED
 *  among the scope's siblings (the cgroup.subtree_control of its parent: app.slice under the user systemd, or the manager's own
 *  group where there is none). THE LAW (主开发 04:23Z): the unit never switches per-unit CPU scheduling ON where it was off — a
 *  controller only AVAILABLE (the manager's cgroup.controllers) leaves the siblings in ONE group, where the job's nice already
 *  competes with the hub, and the first weight asked would make systemd split them all; unreadable ⇒ none. */
function cpuWeightArgs(weight, siblingsSubtree) { return Number.isInteger(weight) && weight >= 1 && weight <= 10000 && /\bcpu\b/.test(String(siblingsSubtree || '')) ? ['-p', `CPUWeight=${weight}`] : []; }
/** B-f494: the cgroup.subtree_control of the scope's parent — `<root>/<manager>/app.slice` where that slice exists, else the
 *  manager's own group; '' when it cannot be read */
function siblingsSubtreeOf(root, cg) {
  const own = path.join(root, cg), app = path.join(own, 'app.slice');
  let parent = own; try { if (fs.statSync(app).isDirectory()) parent = app; } catch { }
  try { return fs.readFileSync(path.join(parent, 'cgroup.subtree_control'), 'utf8'); } catch { return ''; }
}
if (!process.argv[2] && require.main !== module) { module.exports = { allocationRefused, systemdMajor, scopeResultEnd, scopeEventsEnd, capOf, sharedAncestors, leftWords, cpuWeightArgs, siblingsSubtreeOf }; return; }

const ctlDir = process.argv[2];
const specPath = process.argv[3];
const protoArg = process.argv[4];
if (!ctlDir) { process.stderr.write('[job-wrapper] refused: no ctl dir on argv\n'); process.exit(2); }
// THE PROTOCOL BETWEEN THE SERVER AND THIS FILE IS VERSIONED, NEVER ASSUMED (lane job-wrapper-update-window,
// fb-7f7be1e24e): an update writes the new wrapper to disk BEFORE it restarts the server (scripts/update.sh: pull →
// install → build → restart; 45 s on the owner's hub, 2026-10-20) and the server still running spawns whatever wrapper
// is on disk — a .330 server's cron fire met .331's wrapper, was refused by name, and the agent was told of a failure
// that never happened. A server from 2.369.333 on SAYS its protocol (`--proto=N`); an older one is known by its shape: a
// file of the ctl dir = 2 (.331/.332), a base64 JSON argument = 1 (≤ .330: the spec — the job's secrets — on argv). A
// protocol this wrapper does not speak never starts the job: reason update_window (exit 75), which a server from
// 2.369.333 on judges an interruption of its update, not a failure. PROTOCOL 1 IS NEVER READ (lane
// job-wrapper-proto1-retire, 2026-10-21, 2.369.340 — the expiry test-job-model set at .333): the compat that read a ≤ .330
// caller's spec off argv for the update's window was removed as scheduled — every hub of the fleet is ≥ .331. Such an
// argument is judged by its SHAPE alone (base64 of a JSON object), never decoded, never kept, and the run ends «not
// started», update_window; test-job-model pins the removal.
const PROTO = 3;
const ofCtl = !!specPath && path.dirname(path.resolve(specPath)) === path.resolve(ctlDir);
const said = /^--proto=(\d{1,6})$/.exec(protoArg || '');
const v1 = !said && !ofCtl && /^eyJ[A-Za-z0-9+/]*={0,2}$/.test(specPath || '') && specPath.length % 4 === 0; // `{"` in base64 — a ≤ .330 caller
const proto = said ? Number(said[1]) : ofCtl ? PROTO : v1 ? 1 : 0;
// the spec file is read ONCE, then unlinked — and only a file of OUR ctl dir (a path elsewhere is never read nor removed)
let spec = null, refusal = '', windowEnd = false, refusedAs = 'spec_refused'; // lane vault-job-road r2: the refusal's CODE rides exit.json (`refused`) — the hub's use line names it
if (protoArg !== undefined && !said) { refusal = 'the protocol argument is unreadable'; if (ofCtl) { try { fs.unlinkSync(specPath); } catch { } } }
else if (v1) { // nothing read, nothing removed: the argument is no file, and its bytes are the job's secrets
  windowEnd = true; refusal = `the server spoke protocol 1 (a server older than 2.369.331) — this wrapper speaks ${PROTO}; an update in flight, or a server not restarted after one`;
} else if (proto && proto !== PROTO) { // never read: the spec file of another protocol is removed unread (it holds the job's secrets)
  windowEnd = true; refusal = `the server speaks protocol ${proto}, this wrapper ${PROTO} (an update in flight, or a server not restarted after one)`;
  if (ofCtl) { try { fs.unlinkSync(specPath); } catch { } }
} else if (!ofCtl) refusal = 'the spec path names no file of the ctl dir';
else {
  try { spec = JSON.parse(fs.readFileSync(specPath, 'utf-8')); } catch (e) { refusal = `the spec file is unreadable (${e.code || e.name})`; } // never e.message: a parse error quotes the text
  try { fs.unlinkSync(specPath); } catch { }
}
if (!refusal && !(spec && Array.isArray(spec.argv) && spec.argv.length)) refusal = 'the spec carries no argv';
if (!refusal && !(spec.env && typeof spec.env === 'object')) refusal = 'the spec carries no env (a job never runs on the wrapper\'s own)';
// THE VAULT VALUES (protocol 3): the masker is loaded BEFORE anything runs — a job given values never runs without it
let VJ = null, VR = null, VPLAN = null;
if (!refusal && spec.vault !== undefined) {
  try { VJ = require(path.join(__dirname, '..', '..', 'src', 'vault-job.js')); VR = require(path.join(__dirname, '..', '..', 'src', 'vault-run.js')); } catch { VJ = VR = null; }
  if (!VJ || !VR || typeof VR.createRunMasker !== 'function') { refusal = 'the log masker (src/vault-run.js) could not be loaded — a job given vault values is not started without it: they would reach its log in the clear'; refusedAs = 'masker_missing'; }
  else if (!(VPLAN = VJ.planOfSpec(spec.vault))) { refusal = 'the spec names its vault values in a shape this wrapper does not read'; refusedAs = 'vault_shape'; }
}
const logCap = (spec && spec.logCapBytes) || 50 * 1024 * 1024;
const logPath = path.join(ctlDir, 'current.log');

function readStat(pid) {
  try {
    const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
    return Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[19]); // field 22 (starttime), after comm
  } catch { return 0; }
}
function bootId() { try { return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf-8').trim(); } catch { return ''; } }

// ── first act: identity stamp (atomic tmp+rename) ──
const stamp = {
  pid: process.pid,
  starttime: readStat(process.pid),
  bootId: bootId(),
  argvHash: crypto.createHash('sha256').update(JSON.stringify(spec ? spec.argv : null)).digest('hex').slice(0, 16),
  startedAt: Date.now(),
};
fs.mkdirSync(ctlDir, { recursive: true });
// B-bcb8 unit B: the wrapper's own records (pid / exit / bound) take their name only after ONE sync of the temp; a refused sync is said in
// the job's log (before the own lines' road exists: appended — the job has not started; after it: on that road) and the record still lands
let recordSay = (l) => { try { fs.appendFileSync(logPath, `[job-wrapper] ${l}\n`); } catch { } };
renameSynced(path.join(ctlDir, 'pid.json.tmp'), path.join(ctlDir, 'pid.json'), JSON.stringify(stamp), { where: "the job's pid record", say: (l) => recordSay(l) });
function writeExit(exit) {
  try {
    renameSynced(path.join(ctlDir, 'exit.json.tmp'), path.join(ctlDir, 'exit.json'), JSON.stringify(exit), { where: "the job's exit record", say: (l) => recordSay(l) });   // B-bcb8 unit B
  } catch { }
}
// a refused spec ENDS the run where the engine reads it: the named line in the job's log, exit.json, a non-zero exit —
// a protocol mismatch says so in exit.json (reason update_window, exit 75): the job was never started
if (refusal) {
  const line = windowEnd ? `[job-wrapper] not started: ${refusal}\n` : `[job-wrapper] refused: ${refusal}\n`;
  try { process.stderr.write(line); } catch { }
  try { fs.appendFileSync(logPath, line); } catch { }
  writeExit(windowEnd ? { code: 75, signal: null, endedAt: Date.now(), reason: 'update_window', proto: { server: proto, wrapper: PROTO } } : { code: 2, signal: null, endedAt: Date.now(), ...(spec && spec.vault !== undefined ? { refused: refusedAs } : {}) }); // the code only where the hub waits for an ACK (a job without values: its record as before)
  process.exit(windowEnd ? 75 : 2);
}

let logFd = fs.openSync(logPath, 'a');
let logSize = fs.fstatSync(logFd).size;
let held = null; // a gated rung's words before its proof (THE MEMORY BOUND): the job's log gets them only once the job runs
let logOwed = null;   // B-15ac follow (主开发 r831): a failed close's sentence not yet in the log (its reopen threw) — written at the next open
/** the job's log descriptor: reopened when it has none (a rotation's reopen that threw); an owed close sentence written first.
 *  Every direct write of the wrapper's own lines (the stop, the exit) asks it — none goes nowhere while the log has no number */
function logOpen() {
  if (logFd === null) { logFd = fs.openSync(logPath, 'a'); logSize = fs.fstatSync(logFd).size; }
  if (logOwed) { ownQ.unshift(`[job-wrapper] ${logOwed}`); logOwed = null; }   // r3732: on the own lines' road (never between two of the job's chunks); r3942 (1): the OLDEST of the queue — first
  return logFd;
}
// r3732 / r3735 law 3 — THE WRAPPER's OWN LINES go out on the job's own ordered road: never inside a line of the job, never between the
// pieces of a value the masker holds. Queued; written when the masker holds nothing (its `holding`) and the job's last written byte
// ends a line — or, after a quiet with nothing held, on a line of their own; at the masker's ONE end and at the exit, all of them.
// r3942: the quiet counts from the job's last write that left its line open. A job that never goes quiet with nothing held keeps them
// until its end (the stop itself never waits for them); a wrapper killed before its drain loses what is still queued
let lastNl = true, ownQ = [], ownT = null;
function sayOwn(text) { ownQ.push(String(text).replace(/^\n+|\n+$/g, '')); drainOwn(); }
recordSay = (l) => sayOwn(`[job-wrapper] ${l}`);   // B-bcb8 unit B: from here a record's refused sync goes on the own lines' road
function maskHolds() { try { return !!(VAL && vmask && !vEnded && typeof vmask.holding === 'number' && vmask.holding > 0); } catch { return false; } }   // (before the masker's bindings exist: nothing is held)
function armOwn() { if (!ownT) { ownT = setTimeout(() => { ownT = null; drainOwn('quiet'); }, 450); ownT.unref?.(); } }
/** how: '' (a turn of the job's words: a line ended, nothing held), 'quiet' (no word of the job meanwhile: a line of its own), 'end' */
function drainOwn(how = '') {
  if (!ownQ.length) return;
  if (how !== 'end' && maskHolds()) { armOwn(); return; }
  if (how === '' && !lastNl) { armOwn(); return; }
  if (ownT) { clearTimeout(ownT); ownT = null; }
  let fd; try { fd = logOpen(); } catch { return; }   // r3942 (1): opened BEFORE the lines are built — an owed close sentence is in THIS write, never after the exit line; no log ⇒ they wait for the next drain
  const b = Buffer.from((lastNl ? '' : '\n') + ownQ.map((l) => `${l}\n`).join(''));
  ownQ = [];
  try { fs.writeSync(fd, b); logSize += b.length; lastNl = true; } catch { }
}
function writeLog(buf) {
  if (held) { held.push(buf); return; }
  try {
    if (logFd !== null && logSize + buf.length > logCap) { // rotate: keep ONE previous generation; never unlink the live fd's file
      // B-15ac: the number is FORGOTTEN in the statement that closes it — a reopen that throws leaves NO number, never a closed one
      // the next write would go through (another file's by then); a failed close is SAID in the job's log (owed until a reopen lands)
      logFd = closeWritten(logFd, "the job's log (its rotation)", (l) => { logOwed = l; });
      try { fs.renameSync(logPath, logPath + '.1'); } catch { }
      logFd = fs.openSync(logPath, 'a'); logSize = 0;   // (a rotation counts from 0, as the release did: a rename that failed never rotates every chunk)
    }
    fs.writeSync(logOpen(), buf); logSize += buf.length;
    if (buf.length) lastNl = buf[buf.length - 1] === 10;   // r3732: does the job's last written byte end a line
  } catch { }
  if (ownQ.length) { if (ownT && buf.length && !lastNl) { clearTimeout(ownT); ownT = null; } drainOwn(); }   // r3942 (2): the quiet counts from the job's LAST write that left its line open
}

// lane agent-output-sinks (design q-043 D3 ③): a secret an agent's job prints never lands in the log in the clear —
// every chunk passes the SHAPE census (src/secret-shapes.js R1–R8: a bearer, a known prefix, a PEM block, a JWT, a
// `KEY=value` …) before it is written. THE WRAPPER NEVER HOLDS A DEK (it is a detached process beside the vault): a job
// given vault values (protocol 3, lane vault-job-road — design-vault-service-secret D5; q-043 ① reworded: a job holds a
// stored value only once the owner approved it for that job — or it is its own conversation's PUT value — and the value
// passes nothing that prints by accident) is masked by VALUE first — THIS run's values, every spelling of
// src/vault-run.js's FORMS over one window for both pipes — then by shape; a job with none by shape alone. Residuals of the
// SHAPE road (a job given no values; the design §8.6 ③): a shape split across two reads, or between stdout and stderr, and a
// non-UTF-8 (binary) chunk pass — a credential is text, and mangling binary output would break a legitimate job. Best-effort: if the module cannot be required the write is never
// lost (the masker is a hardening layer, not the log's existence).
let SHAPE = null, SHAPE_MAX = 64 * 1024;
try { const m = require(path.join(__dirname, '..', '..', 'src', 'secret-shapes.js')); SHAPE = m.redactSecrets; SHAPE_MAX = m.INPUT_MAX || SHAPE_MAX; } catch { SHAPE = null; }
function maskChunk(buf) {
  if (!SHAPE || !buf || !buf.length) return buf;
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf)) return buf;   // binary / lossy round-trip → pass raw
  let out = '';
  try { for (let i = 0; i < text.length; i += SHAPE_MAX) out += SHAPE(text.slice(i, i + SHAPE_MAX)).text; } catch { return buf; }
  return out === text ? buf : Buffer.from(out, 'utf8');
}
// THE VALUE MASKER (protocol 3): this run's values in every spelling, both pipes in arrival order (createRunMasker — the run
// door's own), then the shapes. A QUIET (400 ms with no output) is a SETTLE TURN of a healthy masker, never an end (round
// wi8mtvm6c's MUST, 主开发 r2600: a quiet that released nothing left a short last line — a service's «listening on …», a task's
// until-marker — out of the log for good): what is CERTAIN is handed on, every complete value masked. A COMPLETED LINE IS CERTAIN
// (round wtlm3ig4w, ruled by 主开发 r2600): only the UNFINISHED last line's trailing run that could still be the START of a value
// (a proper prefix of some spelling, or a view piece still UNFINISHED — a colour code, an entity, an escape cut short; a finished
// one is text) stays held for the next piece. Its residual, said: a value WRAPPED across lines whose lines come with a quiet
// between them lands line by line (one written in a burst is still masked whole) (stage L3's F10, 主开发 r2524: the release ENDED the masker at the quiet — the
// first piece of a value written in two pieces went out unmasked, a fresh masker took the rest, the value landed WHOLE; now that
// first piece is exactly the run a settle keeps). The log lags by that run at a quiet; a value never lands. ONE MASKER FOR THE
// PIPES' WHOLE LIFE (主开发 r2552, stage L3's F11 — the
// release also ended it at the MAIN's exit event and a fresh masker took what the job's group wrote during the drain: a value
// whose second half a child wrote after the main ended landed whole): it ends ONCE, at the PIPES' END — the child's `close`, every
// writer of them gone (bounded after the drain, and below the engine's kill step: a writer that escaped holds them open) — a
// natural end there (a trailing text that merely BEGINS like a value is the job's own words); when that wait ran out (a writer
// still holds them) the end is a CUT: the uncertain tail is withheld by its placeholder. Nothing the pipes bring after the end is
// written. THE ONE RESTART (主开发 r2600 (3), ruled): a masker past its scan's work bound (`over` — it handed on its withheld words
// once, a line of their own, keeps nothing and hands on nothing) is retired at the next quiet and a fresh one takes what comes
// after, so a service's log goes on. Its residual, said: a value whose first piece fell in the withheld stretch has its REST —
// up to all but one character of one spelling — written as it came after that quiet (never the whole value). Text only: a job
// given values has its log decoded as UTF-8 (a value is text).
let VAL = null, vmask = null, vdec = null, vquiet = null, vEnded = false;
const PIPES_END_MS = 2000;   // F11: after the drain, how long the masker's ONE end waits for the pipes' end (every writer gone) — on a stop capped below the engine's kill step (r2600 (2b))
const KILL_STEP_MARGIN_MS = 400;   // the engine kills the wrapper at the grace + 1 s after its stop (src/jobs.js _killStepMs): the flush, the exit line and the record go before it
let pipesClosed = false;
const pipeWaiters = [];
const pipesEnd = (ms) => (pipesClosed ? Promise.resolve(true) : new Promise((res) => { const t = setTimeout(() => res(false), ms); pipeWaiters.push(() => { clearTimeout(t); res(true); }); }));
const { StringDecoder } = require('string_decoder');
function vaultMasker() {
  if (!vmask) {
    vmask = VR.createRunMasker(VAL.map((v, i) => ({ ref: { label: VPLAN[i].name }, value: v.toString('utf8') })), ['out', 'err']);
    vdec = { out: new StringDecoder('utf8'), err: new StringDecoder('utf8') };
  }
  return vmask;
}
const shaped = (t) => (t ? maskChunk(Buffer.from(t, 'utf8')) : Buffer.alloc(0));
function flushMask(cut = false) {
  if (vquiet) { clearTimeout(vquiet); vquiet = null; }
  if (!vmask) return Buffer.alloc(0);
  const m = vmask, rest = { out: vdec.out.end(), err: vdec.err.end() };
  vmask = null; vdec = null;
  let t = '';
  for (const k of ['out', 'err']) if (rest[k]) { const o = m.push(k, rest[k]); t += (o.out || '') + (o.err || ''); }
  // a natural end at the pipes' end (every writer gone: a trailing text that merely BEGINS like a value is the job's own words); a CUT
  // when the wait for that end ran out — a writer still holds them, so the uncertain tail is withheld by its placeholder (r2600 (2a))
  const o = m.end(cut === true);
  return shaped(t + (o.out || '') + (o.err || ''));
}
/** THE QUIET'S TURN (r2600): a healthy masker SETTLES — the certain text handed on, only a run that could begin a value kept; a masker
 *  past its work bound (`over`) is retired (the one restart) */
function quietTurn() {
  vquiet = null;
  if (!vmask || vEnded) return;
  if (vmask.over) { const f = flushMask(); if (f.length) writeLog(f); return; }
  let o = null;
  try { o = vmask.settle(); } catch { o = null; }
  const f = o ? shaped((o.out || '') + (o.err || '')) : Buffer.alloc(0);
  if (f.length) writeLog(f);
  if (ownQ.length) drainOwn('quiet');   // r3732: a quiet with nothing held lets the wrapper's own lines out
}
function maskOut(k, b) {
  if (!VAL) return maskChunk(b);
  if (vEnded) return Buffer.alloc(0);   // F11: after the masker's ONE end nothing more is written (a fresh window would hand on a value's rest) — a belt: the end is the wrapper's last act before its exit, so no pipe event reaches here today
  let o;
  try { const m = vaultMasker(); const text = vdec[k].write(b); o = text ? m.push(k, text) : {}; }
  catch { sayOwn('[job-wrapper] output withheld: the value masker failed on it'); return Buffer.alloc(0); }   // r3942 (3): on the own lines' road — never inside an open line of the job
  if (vquiet) { clearTimeout(vquiet); vquiet = null; }
  vquiet = setTimeout(quietTurn, 400); vquiet.unref?.();   // THE QUIET: a settle turn (healthy) or the retirement (over) — never an end of a healthy masker
  return shaped((o.out || '') + (o.err || ''));
}
process.on('exit', () => { drainOwn('end'); if (VAL) for (const v of VAL) v.fill(0); });   // r3732: no own line is lost at the exit

// ── THE MEMORY BOUND (lane jobs-memory-bound, F6 of B-7f9e, 2026-10-26; acceptance rounds 2–4, 2026-10-27) ──────────────────
// A fleet pod's cgroup has memory.oom.group=1: ONE process past the container's limit kills the whole pod, the hub with it.
// The server resolves the job's bound (src/job-model.js memoryMbOf); the RUNG that enforces it is PROVEN here BEFORE the job
// runs, best first — never assumed, never claimed unproven, and a rung this host refuses FALLS TO THE NEXT (the record says
// which rung holds the child and why a better one did not):
//   ① cgroup — `systemd-run --user --scope -p MemoryMax=` where a user systemd answers on the job's own bus and holds a
//     memory controller (a host under systemd; a fleet pod has none). MemorySwapMax=0: a bound that swaps is no bound.
//     OOMPolicy=stop only where the manager has it for a scope (systemd ≥ 253, its Version read first — 249 / 252 refuse the
//     assignment and nothing would run): there the scope's Result says oom-kill (measured 2026-10-27: the cgroup dir is GONE
//     when the child's exit reaches us — the unit's Result is the fact that survives; no --collect). Below 253 a KEEPER holds
//     the scope — a sh BESIDE the job, never its parent (round 4: a holder that was the job's parent died on the stop and left
//     the job running) — until the wrapper has read the scope's own memory.events after the job's end.
//     THE CAP of a scope (round 4) is the tightest limit it SHARES with the hub, read off the scope's own cgroup once it
//     exists — never the hub's own unit, which a scope beside it is not inside; a lower bound is set on the scope before the go.
//   ② rlimit-data — `prlimit --data=` on the child (util-linux; in the fleet image): RLIMIT_DATA, never RLIMIT_AS (V8
//     reserves address space and dies at start under -v). The refusal is an allocation error inside the job — its code
//     or its words, in its last words (allocationRefused above). Measured: node 24 counts ~600 MB of its own reservations.
//     The job lives inside the hub's cgroup: the server's bound, capped by the hub's own limit, holds as it is.
//   ③ none — said with its why (the owner's 0, or neither rung on this host / both refused).
// THE GATE: a rung's command runs `sh -c <gate>` with fd 3 a socket to us; the gate waits for our «go», which is said only
// once the bound was READ BACK off the child (its cgroup is the scope and the scope's memory.max is the bound; or its
// RLIMIT_DATA is the bound — confirmed: true). A tool that exits before the go («Unknown assignment», a refused scope) or
// does not answer within 3 s never ran the job: it is killed and the job starts on the next rung — exactly once. A rung's
// proof is ITS OWN (round 4): its timer is bound to its rung and its child, and ends with them.
// THE JOB IS THE WRAPPER'S OWN CHILD on every rung — the gate execs it — so a stop reaches the job itself and its end is its
// own code and signal (round 4).
const MiB = 1024 * 1024;
const asked = spec.memory && typeof spec.memory === 'object' ? spec.memory : null;
const memMb = asked && Number.isFinite(asked.mb) && asked.mb > 0 ? Math.floor(asked.mb) : 0;
// the bound the job ASKED before any cap (0 = unbounded): the cgroup rung caps it by what contains ITS scope (settleCap)
const askedMb = asked && Number.isFinite(asked.askedMb) && asked.askedMb >= 0 ? Math.floor(asked.askedMb) : memMb;
const hubCap = asked && asked.cap && typeof asked.cap === 'object' ? asked.cap : null; // the server's: the hub's own limit lowered `mb`
const capRule = asked && asked.capRule && typeof asked.capRule === 'object' ? asked.capRule : null;
const unit = asked && /^[A-Za-z0-9_.@-]{1,180}$/.test(String(asked.unit || '')) ? String(asked.unit) : `vibespace-job-${process.pid}`;
const rungs = asked && Array.isArray(asked.rungs) ? asked.rungs : ['cgroup', 'rlimit-data'];
const gateMs = asked && Number(asked.gateMs) > 0 ? Math.min(Number(asked.gateMs), 3000) : 3000; // the engine's test seam may shorten it
const stopMs = asked && Number(asked.stopMs) > 0 ? Math.min(Number(asked.stopMs), 10000) : 10000; // the scope's drain bound (below); a seam too
// round 5 (the ruling): a SERVICE keeps what its run leaves running — its own while it runs (the engine stops them before its
// next start, at its stop); what a TASK leaves is an orphan, stopped at its end and said
const keeps = spec.kind === 'service';
const limitRoot = asked && typeof asked.limitRoot === 'string' && asked.limitRoot[0] === '/' ? asked.limitRoot : '/sys/fs/cgroup'; // the cap's reads (a seam: a fake tree)
const selfCg = (() => { try { return (fs.readFileSync('/proc/self/cgroup', 'utf8').split('\n').find((l) => l.startsWith('0::')) || '0::/').slice(3) || '/'; } catch { return ''; } })();
function onPath(cmd) {
  for (const d of String(spec.env.PATH || '').split(':')) {
    if (!d) continue;
    try { fs.accessSync(path.join(d, cmd), fs.constants.X_OK); return path.join(d, cmd); } catch { }
  }
  return null;
}
// a short probe of THIS host on the job's own env (its PATH, its user bus) — bounded, its output read, then it ends
function ask(cmd, args) {
  try { const r = spawnSync(cmd, args, { env: spec.env, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }); return r.status === 0 ? String(r.stdout || '').trim() : null; } catch { return null; }
}
const GATE_EXEC = 'read -r go <&3 || exit 125; exec "$@" 3<&-';
// < 253: the KEEPER — a sh of its own (double-forked: no child of the job's) that ignores a stop and holds the scope open on
// fd 3 until the wrapper has read the scope's memory.events and lets it go; the job itself is exec'd, as on every rung. Round
// 6: the keeper is known by its PID — the gate says it on fd 3 ($! of the double fork) BEFORE the job is exec'd — never by its
// command line (a child of the job's carrying the gate's exact text was taken for it, and killed)
const GATE_KEEP = 'read -r go <&3 || exit 125; ( (trap "" TERM INT HUP; read -r ack <&3) </dev/null >/dev/null 2>&1 & echo "keeper $!" >&3 ); exec "$@" 3<&-';
const misses = []; // why each better rung does not hold the job — said in the why of the one that does
function rungPlan() {
  if (!asked) return [{ by: 'none', why: 'the server asked for no bound (a server older than this wrapper)' }];
  if (!memMb) return [{ by: 'none', why: 'unbounded — the owner set 0' }];
  const sh = onPath('sh'), plan = [];
  for (const rung of rungs) {
    if (rung === 'cgroup') {
      const run = onPath('systemd-run'), ctl = onPath('systemctl');
      const cg = run && ctl && sh ? ask(ctl, ['--user', 'show', '-p', 'ControlGroup', '--value']) : null;
      let controllers = '', siblingsSubtree = '';
      if (cg) { try { controllers = fs.readFileSync(path.join('/sys/fs/cgroup', cg, 'cgroup.controllers'), 'utf8'); } catch { } }
      if (cg && spec.cpuWeight) siblingsSubtree = siblingsSubtreeOf('/sys/fs/cgroup', cg);   // B-f494: weights decide among the siblings? (read only for a lowered job)
      if (!run || !ctl) misses.push('no systemd-run here');
      else if (!sh) misses.push('no sh here to hold the job until its bound is read back');
      else if (!cg) misses.push('no user systemd answered');
      else if (!/\bmemory\b/.test(controllers)) misses.push('the user systemd holds no memory controller');
      else {
        const version = systemdMajor(ask(ctl, ['--user', 'show', '-p', 'Version', '--value'])) || systemdMajor(ask(ctl, ['--version']));
        const policy = version >= 253;
        // the scope starts at the ASKED bound (unbounded: infinity); what contains it is read once it exists (settleCap)
        plan.push({ by: 'cgroup', ctl, version, policy, mb: askedMb, argv: [run, '--user', '--scope', '--quiet', `--unit=${unit}`, '-p', `MemoryMax=${askedMb ? askedMb + 'M' : 'infinity'}`, '-p', 'MemorySwapMax=0', ...cpuWeightArgs(spec.cpuWeight, siblingsSubtree), ...(policy ? ['-p', 'OOMPolicy=stop'] : []), '--', sh, '-c', policy ? GATE_EXEC : GATE_KEEP, 'sh', ...spec.argv] });
      }
    } else if (rung === 'rlimit-data') {
      const pl = onPath('prlimit');
      if (!pl) misses.push('no prlimit here');
      else if (!sh) misses.push('no sh here to hold the job until its limit is read back');
      else plan.push({ by: 'rlimit-data', mb: memMb, cap: hubCap, argv: [pl, `--data=${memMb * MiB}:${memMb * MiB}`, '--', sh, '-c', GATE_EXEC, 'sh', ...spec.argv] });
    }
  }
  return plan;
}
let plan = null; // computed at begin(): rungPlan asks this host (spawnSync) — never while the hub's fd 3 is open (protocol 3)
function whyOf(r) {
  if (r.why) return r.why;
  const before = misses.join('; ');
  if (r.by === 'cgroup') return `a scope of the user systemd (${unit}.scope, MemoryMax${r.policy ? ', OOMPolicy=stop' : `; systemd ${r.version || '?'} has no OOMPolicy for a scope — its end is read from the scope's memory.events`})`;
  if (r.by === 'rlimit-data') return before ? `${before} — RLIMIT_DATA on the job instead` : 'RLIMIT_DATA on the job';
  return `this host cannot enforce a bound (${before || 'no rung offered'})`;
}
let rung = null, child = null, proven = false, boundRec = null, stopping = null, exited = false, graceUp = false; // graceUp (round 12): our stop timer fired
let scopeDir = '', eventsAtGo = null;
let keeper = null, keeperSaid = null; // < 253 (round 6): the keeper's identity {pid, start} — said by the gate on fd 3

// the job's LAST WORDS (4 KiB, both streams): under RLIMIT_DATA an allocation the bound refuses ends inside the job, and the
// job says so as it dies (allocationRefused above)
let tail = Buffer.alloc(0);
const keepTail = (b) => { tail = Buffer.concat([tail, b]); if (tail.length > 4096) tail = tail.subarray(tail.length - 4096); };

function writeBound() {
  try {
    renameSynced(path.join(ctlDir, 'bound.json.tmp'), path.join(ctlDir, 'bound.json'), JSON.stringify(boundRec), { where: "the job's bound record", say: (l) => recordSay(l) });   // B-bcb8 unit B
  } catch { }
}
const readNum = (f) => { try { const v = fs.readFileSync(f, 'utf8').trim(); return /^\d+$/.test(v) ? Number(v) : null; } catch { return null; } };
function readEvents(dir) {
  try {
    const t = fs.readFileSync(path.join(dir, 'memory.events'), 'utf8');
    const n = (k) => Number((new RegExp(`^${k} (\\d+)$`, 'm').exec(t) || [])[1] || 0);
    return { oom: n('oom'), oomKill: n('oom_kill'), oomGroupKill: n('oom_group_kill') };
  } catch { return null; }
}
/** the processes still in a cgroup (its cgroup.procs) — [] once it is empty or gone */
function procsOf(dir) { try { return fs.readFileSync(path.join(dir, 'cgroup.procs'), 'utf8').split('\n').filter((l) => /^\d+$/.test(l)); } catch { return []; } }
// B-2c5c (主开发 01:57Z, the hosted run's red): a scope whose list no longer EXISTS is an EMPTY scope — systemd removes a transient scope
// once it empties: its list's PATH then reads ENOENT (ENOTDIR: a component of it no folder), a list opened while it lived reads
// ENODEV (both seen on a real user scope: bl-jobs/probes/errno/scope-gone.mjs, kernel 7.0). Only a list that EXISTS and cannot be
// read (EACCES, EPERM, EIO, EMFILE, ENFILE, …) is unread — named by its errno (`listUnread`), never a blanket catch
const GONE_LIST = new Set(['ENOENT', 'ENOTDIR', 'ENODEV']);
let listUnread = '';
function procsOrNull(dir) { try { return fs.readFileSync(path.join(dir, 'cgroup.procs'), 'utf8').split('\n').filter((l) => /^\d+$/.test(l)); } catch (e) { if (e && GONE_LIST.has(e.code)) return []; listUnread = (e && e.code) || true; return null; } }   // B-2c5c r1: unread ≠ empty; gone = empty
/** the keeper (< 253) is ours, never something the job left — known by the PID its gate said, and its start (round 6) */
const isKeeper = (pid) => !!keeper && Number(pid) === keeper.pid && Number((statOf(pid) || [])[19]) === keeper.start;

function launch() {
  const r = rung = plan.shift() || { by: 'none', mb: memMb, cap: hubCap };
  r.why = whyOf(r);
  const gated = r.by !== 'none';
  const argv = gated ? r.argv : spec.argv;
  held = gated ? [] : null; tail = Buffer.alloc(0); proven = false;
  child = spawn(argv[0], argv.slice(1), {
    cwd: spec.cwd || process.cwd(),
    env: spec.env,
    stdio: [spec.stdinOpen ? 'pipe' : 'ignore', 'pipe', 'pipe', ...(gated ? ['pipe'] : VAL ? ['ignore'] : []), ...(VAL ? VAL.map(() => 'pipe') : [])],
  });
  const c = child;
  armHubLatch();   // B-2c5c unit 1: is this main the hub? asked while it lives
  // protocol 3: each value on its own fresh pipe at fd 4 + i — written and ended now (every rung we try gets its own: a gate
  // that fell through never ran the job, nobody read the last one); the job reads it once
  if (VAL) for (let i = 0; i < VAL.length; i++) { const v = c.stdio[VJ.FD_BASE + i]; if (!v) continue; v.on('error', () => { }); try { v.end(VAL[i]); } catch { } }
  child.stdout.on('data', (b) => writeLog(maskOut('out', b)));
  child.stderr.on('data', (b) => writeLog(maskOut('err', b)));
  child.stdout.on('data', keepTail);
  child.stderr.on('data', keepTail);
  child.on('exit', (code, signal) => { if (c === child && (proven || !gated)) ended(code, signal); });
  child.on('close', (code, signal) => { if (c === child && gated && !proven) fellThrough(r, code, signal); });
  pipesClosed = false;
  child.on('close', () => { if (c === child) { pipesClosed = true; for (const f of pipeWaiters.splice(0)) f(); } });   // F11: THE PIPES' END — every writer of them gone
  if (!gated) { boundRec = { mb: memMb, askedMb, by: 'none', why: r.why, ...(hubCap ? { cap: hubCap } : {}) }; writeBound(); startSampler(); return; }
  child.stdio[3].on('error', () => { });
  if (r.by === 'cgroup' && !r.policy) { // the keeper's PID, said before the job runs (round 6)
    let said = '';
    keeperSaid = new Promise((res) => c.stdio[3].on('data', (b) => {
      said += b;
      const m = /^keeper (\d+)$/m.exec(said);
      if (m && !keeper && c === child) { keeper = { pid: Number(m[1]), start: Number((statOf(m[1]) || [])[19]) }; res(); }
    }));
  }
  prove(r, c, Date.now() + gateMs);
}
// THE PROOF: the bound read back off the gated child — then, and only then, the go. The timer is the rung's own: it reads only
// its rung and its child (closed over), and the rung's end (go, refusal, fall-through) ends it — a refused rung's proof never
// judges the next rung's child against its own, older deadline (round 4: it refused a sound rung — by none, a false why)
function prove(r, c, deadline) {
  r.timer = null;
  if (r.over || c.exitCode !== null || c.signalCode !== null) return;
  let seen = null, at = '';
  try {
    if (r.by === 'cgroup') {
      const cg = (/^0::(.*)$/m.exec(fs.readFileSync(`/proc/${c.pid}/cgroup`, 'utf8')) || [])[1] || '';
      if (cg.endsWith(`/${unit}.scope`)) {
        at = path.join('/sys/fs/cgroup', cg);
        if (!r.contain) settleCap(r, cg);
        seen = fs.readFileSync(path.join(at, 'memory.max'), 'utf8').trim();
      }
    } else {
      seen = (/^Max data size\s+(\S+)/m.exec(fs.readFileSync(`/proc/${c.pid}/limits`, 'utf8')) || [])[1] || null;
    }
  } catch { }
  if (seen === (r.mb ? String(r.mb * MiB) : 'max')) return sayGo(r, c, at, seen);
  if (Date.now() >= deadline) {
    const tool = path.basename(r.argv[0]);
    return refuse(r, c, at ? `its scope's memory.max reads ${seen || 'nothing'}, not ${r.mb ? r.mb + ' MB' : 'max'}` : `${tool} did not answer in ${gateMs / 1000} s`);
  }
  r.timer = setTimeout(() => prove(r, c, deadline), 10); r.timer.unref?.();
}
// THE CAP OF THE CGROUP RUNG (round 4): what contains the job is its scope's ancestry, not the hub's — the tightest memory.max
// among the cgroups the scope SHARES with the hub (user.slice, a container's root …; this wrapper lives in the hub's cgroup),
// less the hub's share (capRule). Read once, off the scope's own cgroup; a lower bound is set on the scope before the go.
function settleCap(r, cg) {
  r.cgroup = cg;
  let lim = null;
  if (capRule && selfCg) {
    for (const dir of sharedAncestors(cg, selfCg)) {
      const v = readNum(path.join(limitRoot, dir, 'memory.max'));
      if (v !== null && (!lim || Math.floor(v / MiB) < lim.limitMb)) lim = { limitMb: Math.floor(v / MiB), cgroup: dir };
    }
  }
  r.contain = lim || { limitMb: null };
  const cap = lim ? capOf(lim.limitMb, capRule) : null;
  if (!cap || (r.mb && r.mb <= cap.capMb)) return;
  r.mb = cap.capMb; r.cap = { limitMb: cap.limitMb, hubMb: cap.hubMb, cgroup: lim.cgroup };
  ask(r.ctl, ['--user', 'set-property', '--runtime', `${unit}.scope`, `MemoryMax=${r.mb}M`]); // read back by the proof, never assumed
}
function sayGo(r, c, at, seen) {
  r.over = true; proven = true;
  boundRec = { mb: r.mb || 0, askedMb, by: r.by, why: r.why, confirmed: true, maxBytes: /^\d+$/.test(seen) ? Number(seen) : null, ...(r.by === 'cgroup' ? { unit: `${unit}.scope`, cgroup: r.cgroup, contain: r.contain } : {}), ...(r.cap ? { cap: r.cap } : {}) };
  if (r.by === 'cgroup') { scopeDir = at; if (!r.policy) eventsAtGo = readEvents(at); }
  writeBound();
  const words = held || []; held = null;
  for (const b of words) writeLog(b);
  try { c.stdio[3].write('go\n'); } catch { }
  startSampler();
}
// the rung never held the job (no go was said, so the gate never ran it): close the gate, end the tool
function refuse(r, c, why) {
  r.refused = why;
  try { c.stdio[3].destroy(); } catch { }
  try { c.kill('SIGKILL'); } catch { }
}
// a gated tool ended before the go — refused by the host, or by us above: the job starts on the NEXT rung, said in the log
function fellThrough(r, code, signal) {
  r.over = true;
  if (r.timer) { clearTimeout(r.timer); r.timer = null; }
  const tool = path.basename(r.argv[0]);
  const words = Buffer.concat(held || []).toString('utf8').split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  held = null;
  const why = r.refused || (words ? `${tool} refused: ${words.slice(0, 160)}` : `${tool} ended before the job ran (${signal || `exit ${code}`})`);
  if (stopping) { boundRec = { mb: memMb, by: 'none', why: `stopped before its bound was proven (${why})` }; return ended(null, stopping); }
  misses.push(why);
  sayOwn(`[job-wrapper] the ${r.by} rung did not hold the job — ${why}; it runs on the next rung`);   // r3942 (3): the own lines' road (never the job's bytes)
  launch();
}

// THE PRESSURE SAMPLE — the boot's evidence when the WHOLE instance dies (memory.oom.group: we die with the job, no exit.json).
// Only where OUR cgroup has a finite limit (a pod: the container's). PAGE CACHE IS NEVER PRESSURE (acceptance round 2): the
// sample is the instance's ANON memory (memory.stat anon — never memory.current, which counts reclaimable cache) and the
// job's own (RssAnon over its process tree), written while the instance's anon sits at ≥ half its limit, removed below it;
// it carries the instance's oom_kill / oom_group_kill at the wrapper's start and the cgroup's identity — the boot reads the
// counters again in the SAME cgroup (src/job-model.js bootEndCause): only a ROSE count is an OOM.
const ownCg = (() => {
  if (asked && typeof asked.sampleDir === 'string' && asked.sampleDir[0] === '/') return asked.sampleDir; // the engine's test seam (a fake cgroup dir)
  return selfCg ? path.join('/sys/fs/cgroup', selfCg) : '';
})();
const limitBytes = ownCg ? readNum(path.join(ownCg, 'memory.max')) : null;
const eventsAtStart = limitBytes ? readEvents(ownCg) : null;
const cgId = (() => { try { return limitBytes ? `${bootId()}:${fs.statSync(ownCg).ino}` : ''; } catch { return ''; } })();
function memStat(dir) {
  try {
    const t = fs.readFileSync(path.join(dir, 'memory.stat'), 'utf8');
    const n = (k) => { const m = new RegExp(`^${k} (\\d+)$`, 'm').exec(t); return m ? Number(m[1]) : null; };
    return { anon: n('anon'), file: n('file') };
  } catch { return null; }
}
function treeAnon(root) { // the job's process tree (≤ 256 processes), RssAnon summed — /proc only, no exec
  let sum = 0, n = 0;
  const walk = (pid) => {
    if (n++ > 256) return;
    try { const m = /^RssAnon:\s+(\d+) kB/m.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8')); if (m) sum += Number(m[1]) * 1024; } catch { return; }
    let kids = [];
    try { kids = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean); } catch { }
    for (const k of kids) walk(k);
  };
  if (root) walk(root);
  return sum;
}
const pressurePath = path.join(ctlDir, 'pressure.json');
let pressureOn = false, pressureTimer = null;
function startSampler() {
  if (!limitBytes || pressureTimer) return;
  pressureTimer = setInterval(() => {
    const st = memStat(ownCg);
    if (!st || st.anon === null || !child || !child.pid) return;
    if (st.anon >= 0.5 * limitBytes) {
      const rec = {
        at: Date.now(), cgId, oomKillAtStart: eventsAtStart ? eventsAtStart.oomKill : null, oomGroupKillAtStart: eventsAtStart ? eventsAtStart.oomGroupKill : null,
        jobAnonMb: Math.round(treeAnon(child.pid) / MiB), anonMb: Math.round(st.anon / MiB), fileMb: Math.round((st.file || 0) / MiB),
        usedMb: Math.round((readNum(path.join(ownCg, 'memory.current')) || 0) / MiB), limitMb: Math.round(limitBytes / MiB),
      };
      try { fs.writeFileSync(pressurePath + '.tmp', JSON.stringify(rec)); fs.renameSync(pressurePath + '.tmp', pressurePath); pressureOn = true; } catch { }
    } else if (pressureOn) { try { fs.unlinkSync(pressurePath); } catch { } pressureOn = false; }
  }, Number(asked && asked.sampleMs) > 0 ? Number(asked.sampleMs) : 2000);
  pressureTimer.unref?.();
}

// THE NAMED END — what ended the job, measured where the rung can: the scope's Result (≥ 253; its MemoryPeak tells the bound
// from an OOM of the whole host), the scope's own memory.events (< 253, the keeper holding it), the job's last words under
// RLIMIT_DATA (a code first). Never a guess, never a counter wider than the job's own (the hub's whole subtree counts kills
// that were not this job's): no fact ⇒ no memory cause (the engine judges the exit as before).
const pause = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { } };
function memoryEnd(code, signal) {
  if (!proven) return {};
  if (rung.by === 'cgroup' && rung.policy) {
    let result = '', peak = 0;
    // the unit's facts land with the kill (measured: at once) — bounded at 1 s anyway; round 5: a job that EXITED, or one the
    // owner stopped (a stop stays a stop), is read once — its leftovers keep the scope active: no second of waiting for nothing
    for (let i = 0; i < (signal && !stopping ? 20 : 1); i++) {
      const out = ask(rung.ctl, ['--user', 'show', `${unit}.scope`, '-p', 'Result', '-p', 'ActiveState', '-p', 'MemoryPeak']);
      if (out === null) break;
      const f = Object.fromEntries(out.split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
      result = f.Result || ''; peak = /^\d+$/.test(f.MemoryPeak || '') ? Number(f.MemoryPeak) : 0;
      if (result !== 'success' || !['active', 'deactivating', 'activating'].includes(f.ActiveState)) break;
      pause(50);
    }
    if (result && result !== 'success') ask(rung.ctl, ['--user', 'reset-failed', `${unit}.scope`]); // a failed scope is ours to clear
    return scopeResultEnd(result, peak, rung.mb);
  }
  if (rung.by === 'cgroup') return scopeEventsEnd(eventsAtGo, readEvents(scopeDir));
  if (rung.by === 'rlimit-data' && (code !== 0 || signal)) {
    const r = allocationRefused(tail.toString('utf8'));
    if (r) return { cause: 'oom-bound', how: `an allocation past RLIMIT_DATA was refused (its last words: ${r})` };
  }
  return {};
}

// stdinOpen: tail answers.jsonl → child stdin, one JSON line per user answer
let ansOffset = 0, ansTimer = null;
if (spec.stdinOpen) {
  const ansPath = path.join(ctlDir, 'answers.jsonl');
  ansTimer = setInterval(() => {
    try {
      const st = fs.statSync(ansPath);
      if (st.size > ansOffset) {
        const fd = fs.openSync(ansPath, 'r');
        const buf = Buffer.alloc(st.size - ansOffset);
        fs.readSync(fd, buf, 0, buf.length, ansOffset); fs.closeSync(fd);
        ansOffset = st.size;
        try { child.stdin.write(buf); } catch { }
      }
    } catch { }
  }, 2000);
  ansTimer.unref?.();
}

// A STOP ENDS THE JOB (acceptance round 4). The engine signals OUR group (-pid) — the job is in it, our own child on every rung;
// we say it to the child too, and on the cgroup rung to EVERY process of its scope (THE SCOPE IS THE GROUP: what the job
// started outside its process group as well). Bounded: a job still running stopMs after the stop is stopped BY FORCE — its
// scope killed — and its end says so. A stop before the go never starts the job.
// ONE FLAG, ONE MEANING (round 5): `forced` is a kill WE made, its words say why — never inferred from how the job died (a
// SIGKILL of the job alone — an agent's kill -9, the kernel at MemoryMax — killed no scope: what it left is still drained);
// `scopeEmpty` is the scope's cgroup.procs MEASURED empty when the end is written
let stopAt = 0, forced = '';
const scoped = () => proven && rung.by === 'cgroup';
const nap = (ms) => new Promise((res) => setTimeout(res, ms));
function scopeKill(sig) { // the manager's own kill of every process of the scope — async, bounded at 3 s
  return new Promise((res) => {
    let p = null;
    try { p = spawn(rung.ctl, ['--user', 'kill', `--signal=${sig}`, `${unit}.scope`], { env: spec.env, stdio: 'ignore' }); } catch { return res(false); }
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { } }, 3000);
    p.on('error', () => { clearTimeout(t); res(false); });
    p.on('exit', (code) => { clearTimeout(t); res(code === 0); });
  });
}
async function forceScope(why) {
  // B-2c5c: a scope that holds what no stop of this job ends (the hub started by hand INSIDE the job, and what it runs) is never killed
  // WHOLE — neither the manager's kill nor the kernel's cgroup.kill: the job's own processes by force, one by one (identity re-read)
  const kept = keptTest(), list = procsOrNull(scopeDir);
  const held = list === null ? keptInScope() : kept ? list.filter((p) => kept(p)).length : 0;   // its read r1 (S1): a list unread is no proof the hub is not there
  // its read (round wwa7r2uc1, MUST): the end says what was DONE — the job's own processes killed one by one (the hub's left alone), or,
  // its list unread, nothing (the end says «could not be read: may still run») — never «its scope was killed»
  if (held) { sayKept(held, 'its kill', list === null); let n = 0; for (const p of scopeRows() || []) if (killNow(p)) n++; if (n && !forced) forced = why.replace(/its scope was killed$/, 'its own processes were killed one by one (the VibeSpace hub in its scope left alone)'); return n > 0; }   // the end says what was DONE: «by force» only when one was killed
  if (list !== null && !list.length) return false;   // its fresh read (SHOULD 3): the list GONE or empty — nothing of the job is left: no kill, never «its scope was killed»
  if (!forced) forced = why; // the first kill's why — and every call kills (round 5: a label is never the guard)
  await scopeKill('SIGKILL');
  if (procsOf(scopeDir).length) { try { fs.writeFileSync(path.join(scopeDir, 'cgroup.kill'), '1'); } catch { } } // no manager answered: the kernel's own
  return true;
}
// round 7: what OUR SIGTERM reached and when (`pid:start` → ms) — each process's grace runs from its own SIGTERM; a row of a fresh
// /proc scan, its start re-read at the act (same). Round 9: ONE SIGNAL PER PID PER STOP STEP — EVERY delivery of the stop goes
// through termOnce (the group's, the scope's, a stopped service's escapees; round 10: the job's main through termMain, by its handle): recorded, a second
// refused (round 8 forwarded the main's signal, then its group loop SIGTERMed it again 13 ms later — a graceful cleanup cut off,
// code 143); true when it was delivered
const termed = new Map();
const termKey = ([pid, st]) => `${pid}:${st}`;
// round 11: THIS TABLE IS WHO HEARD THE STOP — every writer of it goes through it: the engine's group signal (marked), our own
// SIGTERM at the stop step and at the drain; what got less than the full grace is what we KILLED that is not in it. One set, never
// a copy, never a clock (r10 judged «after the stop» by 10 % of the grace — the cut's red; r10c read a copy taken at the end of the
// stop step: a leftover the drain SIGTERMed 0.45 s into a 10 s grace, ended at once, was counted cut short). Round 12: EACH ENTRY
// NAMES ITS PASS — 'stop' (the stop step), 'drain' (the drain, with grace left: a wait follows), 'kill' (the drain once the grace is
// up: its SIGTERM and its SIGKILL in the same pass, nothing between — r11 took that one for heard: a helper forked after the stop
// step, SIGTERMed at 2051 ms of a 2 s grace and killed the same millisecond, was never said)
const termOnce = (p, pass = 'stop') => { if (termed.has(termKey(p)) || !same(p)) return false; const rec = { at: Date.now(), pass }; termed.set(termKey(p), rec); try { process.kill(p[0], 'SIGTERM'); rec.ok = true; return true; } catch { return false; } };
const landed = (k) => !!(termed.get(k) || {}).ok;   // B-d8f4 (unit 1's round, lens 1): a SIGTERM that LANDED — one that threw (EPERM) never makes a process the stop's
const rowOf = (pid) => { const r = pid ? statOf(pid) : null; return r && r[0] !== 'Z' ? [Number(pid), Number(r[19]), Number(r[2])] : null; }; // [pid, start, pgid]
// ── SHIPPED TWIN (B-c134) BEGIN — data/bin/job-wrapper.js carries these lines byte-for-byte (a wrapper copied into a scratch data
// folder cannot require src/); scripts/test-stop-tree.mjs pins the copy to this source ──
/** THE TREE A STOP STARTED (B-c134, lane bl-jobs 2026-11-18): every process under `root` by the PARENT CHAIN — each one's main-thread
 *  children list (/proc/<pid>/task/<pid>/children: the file the release's member walk reads; no directory is listed), breadth first —
 *  read BEFORE the first signal. A child that made its own group (setsid, the timeout program) or dropped the job's environ (env -i, a
 *  `systemd-run --scope … env -i`) is outside the group walk and the environ mark, but it is its parent's child until that parent
 *  dies; after the first signal it is re-parented and the chain is gone. SYNCHRONOUS on purpose, as the release's member walk: procfs is
 *  memory (never a mount), it costs THE TREE (a list and a stat a member) — never all of /proc — no thread pool stands between a stop
 *  and its first signal, and the stop's signal stays synchronous; bounded by `maxRows` and `maxMs` all the same. A zombie is no member (its children are re-parented already); nothing that started before `since`.
 *  → {rows: [[pid, starttime, pgid, comm]], cut, pruned} — a CUT walk proves nothing (the caller says so). THE MODEL: it ends what a
 *  MISTAKE left behind; a child that hides ON PURPOSE (a double fork that re-parents before the stop) is outside it, not chased.
 *  WHAT THE STOP DOES NOT OWN (cure, MUST A): `exclude` = identities [[pid, starttime]] (starttime 0: that pid, whatever its start)
 *  that are PRUNED — never added AND never walked into: what lives under the hub, another conversation's holder or another job's
 *  wrapper is theirs, however it came to sit under this root (a hub restarted from inside a conversation or a job) */
function childTreeOf(root, { since = 0, maxRows = 512, maxMs = 50, procRoot = '/proc', exclude = [] } = {}) {
  const rows = [], seen = new Set([Number(root)]), queue = [Number(root)], t0 = Date.now(), keep = new Map();
  for (const x of exclude || []) { const p = Number(Array.isArray(x) ? x[0] : x); if (p > 1 && p !== Number(root)) keep.set(p, Number(Array.isArray(x) ? x[1] : 0) || 0); }
  let cut = false, pruned = 0;
  walk: while (queue.length) {
    const p = queue.shift();
    let kids = '';
    try { kids = fs.readFileSync(`${procRoot}/${p}/task/${p}/children`, 'utf8'); } catch { continue; }
    for (const w of kids.split(/\s+/)) {
      const c = Number(w);
      if (!(c > 1) || seen.has(c)) continue;
      if (rows.length >= maxRows || Date.now() - t0 > maxMs) { cut = true; break walk; }
      seen.add(c);
      let st = '';
      try { st = fs.readFileSync(`${procRoot}/${c}/stat`, 'utf8'); } catch { continue; }
      const o = st.indexOf('('), e = st.lastIndexOf(')');
      if (o < 0 || e < o) continue;
      const r = st.slice(e + 2).split(' ');
      if (keep.has(c) && (!keep.get(c) || keep.get(c) === Number(r[19]))) { pruned++; continue; }   // not the stop's: never added, never walked into
      if (r[0] === 'Z' || !(Number(r[19]) >= since)) continue;
      rows.push([c, Number(r[19]), Number(r[2]), st.slice(o + 1, e).slice(0, 32)]);
      queue.push(c);
    }
  }
  return { rows, cut, pruned };
}
/** B-2c5c (lane bl-jobs): is `pid` — or a process up its PARENT chain — one of `keep` (a Map pid → starttime, 0 = that pid whatever
 *  its start), or one `isRoot` names? What runs under the hub is the hub's: a hub started by hand INSIDE a job lives in that job's
 *  scope, its process group and with its mark, and no stop of the job ends it or what it runs. The walk STOPS at a pid of `stop` (the
 *  job's own wrapper: the hub spawned every wrapper, so a walk past it reaches the hub from EVERY job process — its read r1, M1). The
 *  chain is read from <procRoot>/<p>/stat (its 4th field, the parent), at most `maxHops` links up; a link that cannot be read ends
 *  the walk — not kept. */
function keptByChain(pid, keep, { procRoot = '/proc', maxHops = 64, stop = null, isRoot = null } = {}) {
  let p = Number(pid);
  for (let hop = 0; hop <= maxHops && p > 1; hop++) {
    if (stop && stop.has(p)) return false;
    let st = '';
    try { st = fs.readFileSync(`${procRoot}/${p}/stat`, 'utf8'); } catch { return false; }
    const e = st.lastIndexOf(')');
    if (e < 0) return false;
    const r = st.slice(e + 2).split(' ');
    if ((keep.has(p) && (!keep.get(p) || keep.get(p) === Number(r[19]))) || (isRoot && isRoot(p))) return true;
    p = Number(r[1]);
  }
  return false;
}
/** B-2c5c (r1263 (b)): THE ONE RECOGNISER of «this run's main is the hub, or leads to it» — the engine's and the wrapper's, one text.
 *  The HUB'S OWN parent chain, read up from `hub` (the hub itself first): `pids` = every process on it until `stop` (the run's
 *  wrapper; never in it) or pid 1 — the hub and the launcher(s) it runs under (`./run.sh`, `npm start`: the hub's own supervisor,
 *  never a stop's to end); `reached` = the chain met `stop` (by its start, when `stopStart` is given): the run's main IS the hub or
 *  a launcher of it. The engine reads it from itself (process.pid), the wrapper from the hub of its <data>/server.pid. A link that
 *  cannot be read ends the walk (not reached) */
function hubChain(hub, { procRoot = '/proc', maxHops = 64, stop = 0, stopStart = 0 } = {}) {
  const pids = new Set();
  let p = Number(hub);
  for (let hop = 0; hop <= maxHops && p > 1; hop++) {
    let st = '';
    try { st = fs.readFileSync(`${procRoot}/${p}/stat`, 'utf8'); } catch { return { pids, reached: false }; }
    const e = st.lastIndexOf(')');
    if (e < 0) return { pids, reached: false };
    const r = st.slice(e + 2).split(' ');
    if (Number(stop) > 1 && p === Number(stop)) return { pids, reached: !stopStart || Number(stopStart) === Number(r[19]) };
    pids.add(p);
    p = Number(r[1]);
  }
  return { pids, reached: false };
}
/** B-d8f4 (主开发 r2215): ONE ANSWER to «what environment does this process carry?» — proc-identity's membersOf (the engine's walks)
 *  and the job wrapper's escapee scan read THIS text. `rest` = its /proc/<pid>/stat after the comm (the state first, the flags 7th).
 *  → {env: [...]} | {none: why} | {unread: why, final?}. A zombie or a kernel thread (its flags: PF_KTHREAD) carries none. A process in
 *  uninterruptible sleep is NEVER read (an environ read takes its memory map's lock): unread. An environ that reads EMPTY while the
 *  command line reads empty too is a process inside its exec (the new image's tables not yet written — Linux reads both as nothing,
 *  no error): unread; an empty environ WITH a command line was started with none: it carries no mark. A read refused (another user's:
 *  EACCES / EPERM) is unread for good (`final`); any other failed read is unread; a gone one carries none */
function envOf(root, pid, rest) {
  if (!rest || rest[0] === 'Z' || (Number(rest[6]) & 0x00200000)) return { none: 'no process to carry one' };
  if (rest[0] === 'D') return endingOf(root, pid, rest) || { unread: 'D' };
  const read = (name) => { try { return { text: fs.readFileSync(`${root}/${pid}/${name}`, 'latin1') }; } catch (err) { return { err: err || {} }; } };
  const gone = (r) => !!r.err && (r.err.code === 'ENOENT' || r.err.code === 'ESRCH');
  const env = read('environ');
  if (env.err) return gone(env) ? { none: 'gone' } : endingOf(root, pid, rest) || { unread: env.err.code || 'error', final: env.err.code === 'EACCES' || env.err.code === 'EPERM' };
  if (env.text.length) return { env: env.text.split('\0') };
  const cmd = read('cmdline');
  if (cmd.err) return gone(cmd) ? { none: 'gone' } : endingOf(root, pid, rest) || { unread: cmd.err.code || 'error' };
  return cmd.text.length ? { env: [] } : endingOf(root, pid, rest) || { unread: 'exec' };
}
/** r4302 (主开发): THE KERNEL SAYS IT IS ENDING — a process of OURS (its uid) whose mark could not be read, that is exiting
 *  (PF_EXITING: its memory given back, its environ reads empty) or holds a signal that ends it (SIGKILL pending; a SIGTERM pending that
 *  it neither blocks, ignores nor catches) → { ending } — never «could not be read». The walk looks at it once more at its end and says it
 *  «still ending» if it stands there (an exit can hang). null: not ending, or not ours — the read goes on as before (a LIVING process's
 *  mark is read as it always was; nothing here signals anything) */
function endingOf(root, pid, rest) {
  let s = ''; try { s = fs.readFileSync(`${root}/${pid}/status`, 'latin1'); } catch { return null; }
  const field = (k) => { const m = new RegExp(`^${k}:\\s*(\\S+)`, 'm').exec(s); return m ? m[1] : ''; };
  const me = typeof process.getuid === 'function' ? process.getuid() : -1;
  if (me < 0 || Number(field('Uid')) !== me) return null;
  if (Number(rest && rest[6]) & 0x4) return { ending: 'exiting' };
  // the masks are the LEADER's (<pid>/status is the main thread's): a SIGTERM blocked there but deliverable to another thread reads «not
  // ending» — the conservative side, the old word («could not be read … may be left») kept
  const low = (k) => (parseInt(field(k).slice(-8) || '0', 16) || 0) >>> 0, pending = low('SigPnd') | low('ShdPnd');
  if (pending & 0x100) return { ending: 'killed' };
  // r4324: a STOPPED or TRACED process (T / t) holds its SIGTERM until it is let go — held, not ending: no SIGTERM rung while stopped
  if (rest && (rest[0] === 'T' || rest[0] === 't')) return null;
  if ((pending & 0x4000) && !((low('SigBlk') | low('SigIgn') | low('SigCgt')) & 0x4000)) return { ending: 'terminated' };
  return null;
}
/** r4324 (主开发): THE WALK's WORDS — the ONE builder of what a walk's counts say (the unread of ours, the others', the ending). Every
 *  road that says them builds them HERE: the engine's forced end, its clear before a service's next start, the doubt's stop, and the
 *  wrapper's own scan. test-marked-walk's census reads each road and goes red on one that builds them itself or reads the counts
 *  without this. `others` not given (the wrapper's scan reads no owner) ⇒ the unread is not called «of ours» */
function walkWords(s) {
  const num = (v) => (Number(v) > 0 ? Math.floor(Number(v)) : 0), es = (k) => (k === 1 ? '' : 'es');
  const known = !!s && s.others !== undefined, others = num(s && s.others), ours = Math.max(0, num(s && s.unreadable) - others), ending = num(s && s.ending);
  return {
    ours, others, ending,
    unread: ours ? `${ours} process${es(ours)}${known ? ' of ours' : ''} (in uninterruptible sleep, inside an exec, or not dumpable)` : '',
    othersUnread: others ? `${others} of other users` : '',
    stillEnding: ending ? `${ending} process${es(ending)} of ours still ending at its last look (the kernel is ending ${ending === 1 ? 'it' : 'them'})` : '',
  };
}
// ── SHIPPED TWIN (B-c134) END ──
// B-c134 A STOP ENDS THE WHOLE TREE IT STARTED: the tree under this wrapper, read at the stop BEFORE its first signal — the members
// outside our group (setsid, the timeout program, a `systemd-run --scope … env -i`) hear the stop from us through the ONE table,
// once, and the drain takes what of them is left with the rest. Read here, in the wrapper's own process (never the hub's loop)
let stopTree = [];
// round 10: THE MAIN IS THE HANDLE WE SPAWNED — never a pid read again: signalled only while the handle is live (exitCode and
// signalCode null: not reaped, so its pid is no other process's), nothing after its 'exit' (r9 re-read /proc/<pid>/stat after
// the reap — a Stop racing the job's own end, a signal to us while we drained: whoever held that pid since got the job's stop,
// recorded «mainBy wrapper»)
const mainLive = () => !!child && !exited && child.exitCode === null && child.signalCode === null;
// B-2c5c, round wwa7r2uc1 (THE MAIN DOOR): the main asks the SAME kept test as every other door — a main that IS the hub (VibeSpace
// started AS this job: its command became the hub — by its pid file or its shape) is never signalled: the stop is refused by name in
// the job's log, and the job is not said ended (it ends when the hub ends)
const HUB_MAIN_WORDS = 'this job is the running VibeSpace: it is not stopped here';
// B-2c5c unit 1 (主开发 r1192, the row's (1)): «MY MAIN WAS THE HUB» IS REMEMBERED for as long as this wrapper runs — once the main
// ended (a restart, an update) the kept test can no longer see that hub, and what it started (its conversations, its helpers,
// re-parented into this job's group or scope) would read as the job's own: the drain at the end stops none of it, a stop after it
// stops none of it, and the end's record says so (exit.json `hubMain` — the engine then never reaps the run's scope)
let mainWasHub = false, hubLatchSaid = false;
const mainKept = () => {
  if (!mainLive()) return false;
  const k = keptTest(), yes = !!(k && k(child.pid));
  if (yes && !mainWasHub) { mainWasHub = true; if (!hubLatchSaid) { hubLatchSaid = true; sayOwn(`[job-wrapper] its main process is the VibeSpace hub — what the job runs is the hub's: no end or stop of this job stops it\n`); } }
  return yes;
};
// how often a live main is asked whether it is the hub: soon after its start (a hub by its shape at once, by <data>/server.pid
// seconds into its boot), every 2 s through its first minute, then every 30 s (a main is the hub from its start or never)
const HUB_LATCH = Object.freeze({ firstMs: 500, everyMs: 2000, earlyMs: 60000, laterMs: 30000 });
let hubLatchTimer = null;
const armHubLatch = () => {
  if (hubLatchTimer) return;
  const t0 = Date.now();
  const tick = () => { if (mainWasHub || exited) return; mainKept(); hubLatchTimer = setTimeout(tick, Date.now() - t0 < HUB_LATCH.earlyMs ? HUB_LATCH.everyMs : HUB_LATCH.laterMs); hubLatchTimer.unref?.(); };
  hubLatchTimer = setTimeout(tick, HUB_LATCH.firstMs); hubLatchTimer.unref?.();
};
let mainKeptSaid = 0, refusedAt = 0;
const sayMainKept = (sig) => { if (mainKeptSaid++) return; sayOwn(`\n[job-wrapper] stop: ${sig} refused — ${HUB_MAIN_WORDS} (its main process is the VibeSpace hub, or what started it, as this job)\n`); };
let hubLeftSaid = 0;
// r1263 small: the words are TRUE — a main that still runs, no longer recognised (its <data>/server.pid rewritten, a clock step), is
// never said «ended»
const sayHubLeft = (sig) => {
  if (hubLeftSaid++) return;
  const what = mainLive() ? `its main process was the VibeSpace hub (or what started it) and still runs, though it is no longer recognised as the hub: nothing of it is this job's to stop — stop VibeSpace itself to end it`
    : `its main process was the VibeSpace hub (or what started it) and has ended: what is left is the hub's (its conversations and helpers), never this job's to stop`;
  sayOwn(`\n[job-wrapper] stop: ${sig} refused — ${what}\n`);
};
const killMain = () => { if (mainKept()) { sayMainKept('SIGKILL'); return false; } try { child.kill('SIGKILL'); return true; } catch { return false; } };
const termMain = (p, sig) => { if (termed.has(termKey(p)) || !mainLive()) return false; if (mainKept()) { sayMainKept(sig); return false; } const rec = { at: Date.now(), pass: 'stop' }; termed.set(termKey(p), rec); try { process.kill(child.pid, sig); rec.ok = true; return true; } catch { return false; } };   // B-d8f4 (主开发 r1045): every writer of the table says whether its signal landed
// round 10: the manager's kill of the scope is a delivery too — recorded, once per stop step (r9 sent a natural end's leftovers
// their SIGTERM by it unrecorded: a stop while they drained SIGTERMed them again)
let scopeSent = 0;
const scopeTerm = (sig) => { if (scopeSent) return Promise.resolve(false); const inside = keptInScope(); if (inside) { sayKept(inside, 'its stop', true); return Promise.resolve(false); } scopeSent = Date.now(); return scopeKill(sig); };   // B-2c5c: never the hub's scope whole
// round 10: A STOP GOES ONCE — what this wrapper delivers itself (its own stop step, or the drain of what its ended job left) is
// said beside its stamp (stopping.json): the engine's stop then signals THIS process alone, the intent saying so (`alone`), and
// the rest hears it through the one table — never the engine's group signal again on what already heard one (r9: Stop pressed
// while a task's leftovers drained, or after an agent's SIGINT to us — a cleanup cut off by a second signal, code 143)
const markStopping = (by) => { try { fs.writeFileSync(path.join(ctlDir, 'stopping.json'), JSON.stringify({ at: Date.now(), by })); } catch { } };
const killNow = (p) => { if (!same(p)) return false; try { process.kill(p[0], 'SIGKILL'); return true; } catch { return false; } }; // round 8: by force, its start re-read
// round 8: WHO SIGNALLED WHOM — the engine writes its intent (stop.json), THEN signals our whole group (we are in it): a signal our
// handler hears beside a FRESH intent is the engine's, and every member heard it with us; a signal with no fresh intent is ours
// ALONE (an agent's `kill <wrapper pid>`, a SIGINT or SIGHUP to us) — round 7 marked the members «sent SIGTERM» and sent nothing,
// so a member that ends cleanly on SIGTERM was killed at the grace under words claiming one; an intent with no signal after it
// (a stop before our stamp, an engine gone between the two) is a stop nobody delivered — we deliver it. Said in the job's log and
// in exit.json (`stopBy`: engine | signal | intent)
const INTENT_FRESH_MS = 2000;
let stopBy = '', heard = null, mainBy = '', stopIntentAt = 0;   // stopIntentAt: an engine intent's own time (the masker's end counts the engine's kill step from it)
// THE STOP — the engine's signal to our group, or (round 7) ITS INTENT: stop.json beside pid.json, written before it signals. The
// child's end and our own handler land at once, in either order: a wrapper that handles the end first still knows a stop is in
// flight (a service's leftovers stopped with it — never kept, unsaid: heavy ㉒, 1 pair in 12). Said in the job's log
function onStop(sig, at, by) {
  if (stopping) return;
  // B-2c5c (THE MAIN DOOR): the main IS the hub — the stop is refused whole: nothing here is the stop's (what the hub runs is the hub's,
  // its keeper ours); its intent is not taken up again at the end (`refusedAt`)
  if (mainKept()) { sayMainKept(sig); refusedAt = Math.max(refusedAt, at); return; }
  // B-2c5c unit 1: the main WAS the hub and it has ended — what is left is the hub's (its conversations, its helpers): nothing stopped
  if (mainWasHub) { sayHubLeft(sig); refusedAt = Math.max(refusedAt, at); return; }
  stopping = sig; stopAt = at; stopBy = by;
  markStopping(by);
  // round 9: A SIGNAL GOES TO A PROVEN IDENTITY, NEVER ASSUMED DELIVERED — the engine's group signal reached what is in OUR group
  // NOW (its pgid ours, read at the stop): marked, never signalled again. Everything else hears the stop from us, once: the job's
  // main its own signal (round 8 assumed the engine's reached it — a main that left our group (setsid) was sent none, killed at
  // the grace under «did not end on SIGTERM»), then the rest SIGTERM. The cgroup rung: THE SCOPE IS THE GROUP — its processes one
  // by one through the same table (round 4's `systemctl kill` of the scope sent the stop AGAIN to all the engine's signal had
  // reached: the main heard it twice, 3 ms apart); a scope whose list cannot be read, the manager's kill (as before)
  const ko = keptOutHere(), tree = childTreeOf(process.pid, { since: Number(stamp.starttime) || 0, exclude: ko });   // B-c134: the tree FIRST — after the first signal a child is re-parented; never into what is not the job's (cure, MUST A)
  const main = mainLive() ? rowOf(child.pid) : null; // the main first — its own stat names its group (no walk before it hears the stop)
  if (main && by === 'engine' && main[2] === process.pid) termed.set(termKey(main), { at, pass: 'stop', ok: true });   // B-d8f4 (r1045): the engine's group signal LANDED on what was in our group at the stop (we heard it with them)
  mainBy = main ? (termed.has(termKey(main)) ? 'engine' : termMain(main, sig) ? 'wrapper' : '') : child && !mainLive() ? 'ended' : '';
  const listed = scoped() ? scopeRows() : null;
  const rows = scoped() ? listed || [] : groupLeft().map(([p, st]) => [p, st, process.pid]); // our group's: its pgid ours
  if (by === 'engine') for (const p of rows) if (p[2] === process.pid && !termed.has(termKey(p))) termed.set(termKey(p), { at, pass: 'stop', ok: true });   // B-d8f4 (r1045): landed, as the main's
  const who = by === 'engine' ? `the engine signalled its process group${mainBy === 'wrapper' ? '; its main process had left that group — the wrapper signals it' : ''}`
    : by === 'intent' ? "the engine's stop never reached its group — the wrapper signals it"
      : by === 'alone-hub' ? 'the VibeSpace hub runs in its process group (started inside the job) — the engine signalled the wrapper alone; the wrapper signals the job\'s processes, once'
      : by === 'alone' ? "the engine's stop reached the wrapper alone, already stopping what its job left — the wrapper signals the rest, once"
        : 'a signal to the wrapper alone — the wrapper signals its group';
  sayOwn(`\n[job-wrapper] stop: ${sig} — ${stopMs / 1000} s to end (${who}${mainBy === 'ended' ? '; its main process had already ended' : ''})\n`);
  for (const p of rows) termOnce(p); // what the engine's signal did not reach — every member, for a stop not the engine's
  // B-c134: the tree's members outside our group — not the main (its own road above), each once (the table); the drain takes the rest
  // the engine's intent carries the tree it read BEFORE its signal (ours here may come after the main's children were re-parented)
  const fromIntent = by === 'engine' || by === 'intent' || by === 'alone' || by === 'alone-hub' ? intentTree() : { rows: [], cut: false };
  const keyed = new Map([...fromIntent.rows, ...tree.rows].filter((r) => r[2] !== process.pid && !(child && r[0] === child.pid) && !ko.some((x) => x[0] === r[0])).map((r) => [termKey(r), r]));
  const kt = keptTest();   // small 3: a hub BOOTING inside the job (not yet in server.pid) outside our group is held out by its shape, with what it runs
  stopTree = [...keyed.values()].filter((r) => !(kt && kt(r[0])));
  let treeHeard = 0;
  for (const r of stopTree) if (termOnce(r)) { treeHeard++; if (!keeps) stopTreeOut.set(termKey(r), r); }   // B-d8f4 (its read's M1): remembered, as stopEsc — one that ends on it before the drain is still the stop's
  const treeCut = tree.cut || fromIntent.cut;
  if (tree.pruned) { sayOwn(`[job-wrapper] stop: its tree walk left alone ${tree.pruned} process${tree.pruned === 1 ? '' : 'es'} it does not own (the hub's, another job's or conversation's)\n`); }   // B-c134 cure 2: said, as the engine's walk says it
  if (stopTree.length || treeCut) { sayOwn(`[job-wrapper] stop: ${stopTree.length} process${stopTree.length === 1 ? '' : 'es'} it started outside its group (${[...new Set(stopTree.map((r) => r[3]))].join(', ') || '—'}) hear${stopTree.length === 1 ? 's' : ''} it from the wrapper${treeHeard < stopTree.length ? ` (${stopTree.length - treeHeard} could not be signalled: gone, or not ours)` : ''}${treeCut ? '; its process tree was read only in part — what it started may be left' : ''}\n`); }
  if (scoped() && !listed) scopeTerm(sig);
  const on = mainBy === 'engine' || mainBy === 'wrapper' ? ` on ${sig}` : ''; // «did not end on SIGTERM» only when one reached it
  const left = Math.max(0, at + stopMs - Date.now());
  if (!scoped()) { // round 6: a rung without a scope — the job's group is OURS to end at the grace, said (drainGroup takes what
    // the job left in it); the engine's kill step is a backstop for a wrapper that cannot (a second later). Round 7: the group
    // heard the stop with us (the engine signals it) — its grace runs from the stop; a SERVICE's processes that left the group
    // (its mark) hear it NOW, with the main — round 6 signalled them only once the main ended, against what was left of the grace
    for (const p of escapedOf()) if (keeps || p[2]) { if (termOnce(p) && !keeps) stopEsc.set(termKey(p), p); }   // B-7ca1: a TASK's too — what carries THIS RUN's mark outside its group hears the stop with the main (its grace runs from the stop); remembered: one that ends on it before the drain is still the stop's
    const t = setTimeout(() => { graceUp = true; if (exited) return; if (!forced) forced = `it did not end${on} in ${stopMs / 1000} s — its process group was killed`; killMain(); }, left); t.unref?.();
    return;
  }
  const t = setTimeout(() => { if (!exited) forceScope(`it did not end${on} in ${stopMs / 1000} s — its scope was killed`); }, left); t.unref?.();
}
/** round 9: the scope's processes as rows ([pid, start, pgid]) — never the keeper; null when its list cannot be read */
function scopeRows() {
  let t;
  try { t = fs.readFileSync(path.join(scopeDir, 'cgroup.procs'), 'utf8'); } catch (e) { if (e && GONE_LIST.has(e.code)) return []; listUnread = (e && e.code) || true; return null; }   // a gone list: no rows (the scope emptied); unread: null
  const kept = keptTest();   // B-2c5c: the hub's processes are never the stop's rows
  return t.split('\n').filter((l) => /^\d+$/.test(l) && Number(l) !== process.pid && !isKeeper(l) && !(kept && kept(l))).map(rowOf).filter(Boolean);
}
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => {
  const s = stopIntent(), engine = !!s && Date.now() - s.at <= INTENT_FRESH_MS; // round 8: the engine's — its clock is the intent's
  onStop(sig, engine ? s.at : Date.now(), engine ? (s.alone ? (s.hub ? 'alone-hub' : 'alone') : 'engine') : 'signal');
  if (heard) heard();
});
/** B-c134 cure (MUST A): WHAT THIS WRAPPER'S WALK NEVER ENTERS — the hub (its pid in <data>/server.pid, which the hub writes at its
 *  boot: a hub restarted from INSIDE this job is found by it) and what the engine's intent names (the engine holds the conversations'
 *  holders and the other jobs' wrappers); this wrapper is the root. [[pid, starttime]], starttime 0 = that pid whatever its start */
function keptOutHere() {
  const out = [];
  try { const f = path.join(__dirname, '..', 'server.pid'), p = Number(String(fs.readFileSync(f, 'utf8')).trim()); if (p > 1 && p !== process.pid && (startedBy(p, fs.statSync(f).mtimeMs) || hubShaped(p))) out.push([p, 0]); } catch { }   // small 1: a STALE file's pid is no hub (one with a hub's argv is: the clock may have stepped)
  out.hub = out.length ? out[0][0] : 0;   // r1263 (b): WHICH root is the hub of <data>/server.pid — the chain above IT is the hub's own (a conversation holder's is not)
  try { const s = JSON.parse(fs.readFileSync(path.join(ctlDir, 'stop.json'), 'utf8')); if (Array.isArray(s.keepOut)) for (const x of s.keepOut.slice(0, 512)) if (Array.isArray(x) && Number(x[0]) > 1) out.push([Number(x[0]), Number(x[1]) || 0]); } catch { }
  return out;
}
/** B-2c5c (主开发's small 1): a STALE <data>/server.pid — its pid now another process, started AFTER the file was written — names no
 *  hub: its root is kept only when its process started no later than the file's own time (to the second: /proc/stat's boot time is
 *  whole seconds); a start that cannot be read keeps it (never dropped on a guess) */
function startedBy(pid, atMs) {
  const st = Number((statOf(pid) || [])[19]);
  if (!(st > 0)) return true;
  let btime = 0;
  try { btime = Number((/^btime (\d+)$/m.exec(fs.readFileSync('/proc/stat', 'utf8')) || [])[1]) || 0; } catch { }
  return !btime || btime * 1000 + st * 10 <= atMs + 1000;   // starttime in USER_HZ (100 a second, /proc's fixed unit)
}
/** B-2c5c: WHAT NO STOP OF THIS JOB ENDS, BY THE PARENT CHAIN — the kept-out roots (keptOutHere: the hub of <data>/server.pid and what
 *  the engine's intent names) and everything under them. → (pid) => true when kept (memoised for this call's rows), or null */
function keptTest() {
  // its read r1: the walk STOPS at this wrapper (M1 — every job process reaches the hub that spawned us); a hub that has not yet written
  // <data>/server.pid (it writes it once it listens, seconds into its boot) is named by its SHAPE — this checkout's server.js (M4); the
  // server.pid root counts only while it is a hub (a stale file's pid may be another process now)
  const shaped = new Map(), isHub = (p) => { if (!shaped.has(p)) shaped.set(p, hubShaped(p)); return shaped.get(p); };
  // its read r2 (R3): the server.pid root (start 0) is dropped only when it is PROVEN not a hub — not node at all (a recycled pid); a
  // hub run as pm2 / `node .` / a relative path keeps it
  const all = keptOutHere(), ko = all.filter(([p, st]) => st || isHub(Number(p)) || nodeOrUnknown(Number(p)));
  const keep = new Map(ko.map(([p, st]) => [Number(p), Number(st) || 0])), memo = new Map(), stop = new Set([process.pid]);
  // r1263 (b), THE ONE RECOGNISER (the engine reads the same chain from itself — hubChain, the shipped twin): ABOVE the hub of
  // <data>/server.pid, its own parent chain up to this wrapper — the launcher the hub runs under (`npm start`, a start script: the
  // job's main when it started the hub as its child, or one backgrounded beside the main) is the hub's own supervisor: never a
  // stop's, never a drain's. A main on that chain IS «the hub» for the latch and the main door (mainKept)
  const hub = Number(all.hub) || 0, above = hub > 1 && keep.has(hub) ? hubChain(hub, { stop: process.pid }).pids : new Set();
  return (pid) => { const p = Number(pid); if (!memo.has(p)) memo.set(p, keptByChain(p, keep, { stop, isRoot: isHub }) || above.has(p)); return memo.get(p); };
}
/** B-2c5c r1 (M4): a process that IS a VibeSpace hub of this checkout — `node …/server.js` by its argv (the checkout's own path, or
 *  `server.js` run from the checkout as its cwd). The wrapper lives at <checkout>/data/bin */
const CHECKOUT = path.resolve(__dirname, '..', '..'), SERVER_JS = path.join(CHECKOUT, 'server.js');
/** B-2c5c r2 (R3): is this pid's executable node — or unknown (its link unreadable: kept, never dropped on a guess)? */
function nodeOrUnknown(pid) {
  try { return /node/i.test(path.basename(fs.readlinkSync(`/proc/${pid}/exe`))); } catch { return true; }
}
function hubShaped(pid) {
  if (!nodeOrUnknown(pid)) return false;   // its read (SHOULD 6): `tail -f server.js` in the checkout is no hub
  let args = [];
  try { args = fs.readFileSync(`/proc/${pid}/cmdline`, 'latin1').split('\0'); } catch { return false; }
  if (args.includes(SERVER_JS)) return true;
  if (!args.some((a) => a === 'server.js' || a === './server.js')) return false;
  try { return fs.readlinkSync(`/proc/${pid}/cwd`) === CHECKOUT; } catch { return false; }
}
/** B-2c5c: how many kept-out roots LIVE IN this job's scope by their own cgroup file (/proc/<pid>/cgroup names `<unit>.scope`) — the
 *  answer when the scope's list cannot be read */
function keptInScope() {
  let n = 0;
  for (const [p] of keptOutHere()) { try { if (fs.readFileSync(`/proc/${p}/cgroup`, 'utf8').split('\n').some((l) => l.endsWith(`/${unit}.scope`) || l.includes(`/${unit}.scope/`))) n++; } catch { } }
  return n;
}
let keptSaid = false;
/** B-2c5c: said ONCE in the job's log — the scope is not killed whole, and why */
function sayKept(n, what, unread = false) {
  if (keptSaid) return; keptSaid = true;
  // small 2: a list that cannot be read ends nothing — said so, never «ended one by one»
  const how = unread ? 'and its list could not be read: nothing of it was ended — what the job started may still run' : 'so the scope is never killed whole: the job\'s own processes are ended one by one, the hub\'s left alone';
  sayOwn(`[job-wrapper] ${what}: its scope holds ${n} process${n === 1 ? '' : 'es'} no stop of this job ends — the VibeSpace hub started inside this job, or what it runs — ${how}\n`);
}
/** B-c134: the tree the engine read before its signal, from its intent — rows [pid, start, pgid, comm] (each proven again at the act) */
function intentTree() {
  try { const s = JSON.parse(fs.readFileSync(path.join(ctlDir, 'stop.json'), 'utf8')); const rows = Array.isArray(s.tree) ? s.tree.filter((r) => Array.isArray(r) && Number(r[0]) > 1 && Number(r[1]) > 0).slice(0, 256).map((r) => [Number(r[0]), Number(r[1]), Number(r[2]), String(r[3] || '').slice(0, 32)]) : []; return { rows, cut: s.treeCut === true }; } catch { return { rows: [], cut: false }; }
}
/** the engine's stop intent for THIS run (its ctl dir), or null */
function stopIntent() {
  try { const s = JSON.parse(fs.readFileSync(path.join(ctlDir, 'stop.json'), 'utf8')); return { sig: /^SIG[A-Z]{2,6}$/.test(s.sig) ? s.sig : 'SIGTERM', at: Number(s.at) > 0 && Number(s.at) <= Date.now() ? Number(s.at) : Date.now(), alone: s.alone === true, hub: s.hub === true }; } catch { return null; }
}
// THE END IS WRITTEN ONCE THE SCOPE IS EMPTY (the cgroup rung): the keeper is let go (its events read), then — round 5, the
// ruling of 2026-10-27 (a job's scope IS the job) — at a natural end what still runs in the scope is what the job LEFT: a
// TASK's orphans are stopped at once (SIGTERM to the scope; stopMs later, by force) and said; a SERVICE keeps them (its own
// while it runs — the engine stops them before its next start, at its stop). After a stop the whole scope heard it: what
// still runs stopMs after it is killed. Never a run that «ended» while its processes still run, hold its ports, and meet
// the next start — and never a «scope was killed» that killed nothing (round 5)
async function drainScope() {
  const kept = keptTest(), own = () => procsOf(scopeDir).filter((p) => !(kept && kept(p)));   // B-2c5c: what the hub runs inside the scope is not the job's
  if (!rung.policy) { // the keeper's read ends: it leaves the scope — known by the PID it said, awaited out (round 6)
    if (keeperSaid && !keeper) await Promise.race([keeperSaid, nap(500)]);
    try { child.stdio[3].destroy(); } catch { }
    for (let i = 0; i < 40 && keeper && procsOf(scopeDir).includes(String(keeper.pid)); i++) await nap(25);
  }
  if (mainWasHub) { const n = own().filter((p) => !isKeeper(p)).length; return { ...(n ? { left: { n, hubMain: true } } : {}), scopeEmpty: !n }; }   // B-2c5c unit 1: the hub's — counted, never signalled
  const procs = stopping ? [] : own().filter((p) => !isKeeper(p)), left = procs.length;
  if (left && keeps) { // round 6: named by identity too — a stop whose read of the scope does not answer SIGTERMs them blind
    const rows = procs.map((p) => [Number(p), Number((statOf(p) || [])[19])]).filter((r) => r[1] > 0).slice(0, 64);
    return { left: { n: left, kept: true, pids: rows, boot: bootId(), ...(rows.length < left ? { recorded: rows.length } : {}) }, scopeEmpty: false };
  }
  if (left) { const rows = scopeRows(); if (rows) for (const p of rows) termOnce(p, 'drain'); else await scopeTerm('SIGTERM'); } // round 10: recorded, one by one
  const deadline = (stopping ? stopAt : Date.now()) + stopMs;
  while (own().length && Date.now() < deadline) await nap(25);
  const still = own().length, s = still === 1 ? '' : 'es', was = still === 1 ? 'was' : 'were';
  const forcedNow = still ? await forceScope(left ? `${still} process${s} it left ${was} still running ${stopMs / 1000} s after its SIGTERM — its scope was killed` : `${still} process${s} ${was} still in its scope ${stopMs / 1000} s after ${stopping ? 'the stop' : 'its end'} — its scope was killed`) : false;   // 主开发 02:46Z: the force answers whether it acted — the last processes may end between the count and its own read
  for (let i = 0; i < 80 && own().length; i++) await nap(25);
  // B-c134: a STOP's tree outside the scope (a child that moved to a scope of its own — `systemd-run --scope`) — heard at the stop
  // step (the table), waited on to the stop's one clock, then by force; never counted as the scope's
  const tl = stopping ? stopTree.filter(same) : [];
  if (tl.length) { while (tl.some(same) && Date.now() < deadline) await nap(25); for (const p of tl) killNow(p); }
  // small 2: the END measured on a list that READS — an unread one is no «empty»: the job reads ended, said «could not be read: may
  // still run», and the engine reaps the scope (scopeEmpty false)
  const fin = procsOrNull(scopeDir), unread = fin === null;
  return { ...(left ? { left: { n: left, ...(still && forcedNow ? { force: true } : {}) } } : {}), scopeEmpty: !unread && !fin.filter((p) => !(kept && kept(p))).length, ...(unread ? { scopeUnread: listUnread || true } : {}) };
}
// A RUNG WITHOUT A SCOPE (rlimit-data, none — a fleet pod): what the job left is what still runs in OUR process group (the job
// is our child in it; what it put in the background stays there) — a task's stopped and said, a service's kept and named by
// identity for the engine. Round 6: A STOP DRAINS THE GROUP THE WAY AN END DOES (round 5 left it to the engine's kill step,
// which cannot reach a group once its wrapper is gone: a SIGTERM-deaf member survived the stop for ever, unsaid) — its SIGTERM
// came with the stop, the grace runs from the stop. A process that LEFT the group (setsid) is beyond a rung without a scope:
// THE RECORD SAYS WHAT IT COULD NOT SEE — a fresh scan for the job's mark in /proc/*/environ (VIBESPACE_JOB_ID, inherited)
// finds it: a task's said, not stopped; a service keeps it with the rest. /proc only, no exec.
const statOf = (pid) => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return s.slice(s.lastIndexOf(')') + 2).split(' '); } catch { return null; } };
function groupLeft() {
  const out = [], kept = keptTest();   // B-2c5c: a hub started by hand inside the job may sit in its process group — never a row
  let ents = [];
  try { ents = fs.readdirSync('/proc'); } catch { return out; }
  for (const e of ents) {
    if (!/^\d+$/.test(e) || Number(e) === process.pid) continue;
    const r = statOf(e);
    if (r && Number(r[2]) === process.pid && r[0] !== 'Z' && !(kept && kept(e))) out.push([Number(e), Number(r[19])]);
  }
  return out;
}
const same = ([pid, st]) => { const r = statOf(pid); return !!r && r[0] !== 'Z' && Number(r[19]) === st; };
const MARK = spec && spec.env && spec.env.VIBESPACE_JOB_ID ? `VIBESPACE_JOB_ID=${spec.env.VIBESPACE_JOB_ID}` : '';
// B-7ca1 (its read's MUST): THIS RUN's own mark — the job's mark is per job, and an earlier run's leftover (and what it forks during
// this run) carries it too; a task's stop ends only what carries THIS run's ([2] of a row: true)
const MARK_RUN = spec && spec.env && spec.env.VIBESPACE_JOB_RUN ? `VIBESPACE_JOB_RUN=${spec.env.VIBESPACE_JOB_RUN}` : '';
const stopTreeOut = new Map();   // B-d8f4 (its read's M1): the stop step's TREE members outside our group it signalled (termKey → row) — counted «outside» whatever the drain still finds alive
const stopEsc = new Map();   // B-7ca1: this run's escapees the STOP STEP signalled (termKey → row) — counted as the stop's even if gone before the drain
/** B-7ca1 (its read r2, S1): the PARENT CHAIN above each kept-out root — a hub's launcher (a task that restarted the hub with
 *  `(setsid ./run.sh &)`: run.sh carries the run's mark, re-parented, not under the hub) is never an escapee; as the engine's
 *  _hubAncestors, bounded (64 hops) */
function keptAncestors() {   // r1263 (b): read through THE ONE RECOGNISER (hubChain, the shipped twin) — keptTest's walks read the same chain
  const out = new Set();
  for (const [root] of keptOutHere()) for (const q of hubChain(Number(root)).pids) if (q !== Number(root)) out.add(q);
  return out;
}
function escapedOf() { // started after us, outside our group, carrying the job's mark — never us (our own env carries it too); bounded (B-7ca1: it runs at every stop)
  const out = [], kept = keptTest(), anc = keptAncestors();   // B-2c5c: a hub started inside the job carries the job's mark — never an escapee
  let ents = [];
  if (!MARK) return out;
  try { ents = fs.readdirSync('/proc').filter((e) => /^\d+$/.test(e)).sort((a, b) => Number(b) - Number(a)); } catch (err) { out.none = (err && err.code) || 'error'; return out; }   // newest pid first: inside the bound on a busy machine; B-d8f4 (10): a listing that failed — said by the stop, with its errno
  const t0 = Date.now(), again = [], endingSeen = new Set();   // r4302: what read ENDING is looked at once more at the end
  // B-d8f4 (主开发 r2215): the engine's rule by ONE text (envOf, the shipped twin) — a process in uninterruptible sleep never read, an exec's
  // empty window unread, a kernel thread or a start with no environment none; what read unread for a moment is read ONCE more at the
  // end, inside the bound; still unread is COUNTED (`out.unread`) and said — never silently «not carrying». A refusal (another user's
  // process: EACCES) is skipped as before — not this job's to judge, and on a shared machine every stop would say it
  const look = (e, r, second) => {
    const v = envOf('/proc', e, r);
    if (v.env) { if (v.env.includes(MARK)) out.push([Number(e), Number(r[19]), !!MARK_RUN && v.env.includes(MARK_RUN)]); return; }
    if (v.ending) { if (second) out.ending = (out.ending || 0) + 1; else { endingSeen.add(e); again.push(e); } return; }   // r4302: the kernel says it is ending — never «could not read»; standing at the last look ⇒ counted
    if (v.unread && !v.final) { if (second) out.unread = (out.unread || 0) + 1; else again.push(e); }
  };
  for (const e of ents) {
    if (!/^\d+$/.test(e) || Number(e) === process.pid) continue;
    if (Date.now() - t0 > 250) { out.cut = true; break; }   // B-7ca1 (its read): bounded — what a cut scan did not read is neither stopped nor counted (the engine's own bounded scan backs a force)
    const r = statOf(e);
    if (!r || r[0] === 'Z' || Number(r[2]) === process.pid || Number(r[19]) < stamp.starttime) continue;
    if ((kept && kept(e)) || anc.has(Number(e))) continue;
    look(e, r, false);
  }
  // round whnhv7lcb (a): the second read repeats the FIRST pass's skips on its fresh stat — its own group, an ancestor of a kept hub,
  // and a kept hub by a FRESH test (the first pass's memo was made from a command line read empty inside the exec: a hub mid-exec passed)
  const kept2 = again.length ? keptTest() : null, anc2 = again.length ? keptAncestors() : null;
  for (const e of again) { if (Date.now() - t0 > 250) { if (endingSeen.has(e)) out.ending = (out.ending || 0) + 1; else out.unread = (out.unread || 0) + 1; continue; } const r = statOf(e); if (!r || r[0] === 'Z' || Number(r[2]) === process.pid || Number(r[19]) < stamp.starttime || (kept2 && kept2(e)) || anc2.has(Number(e))) continue; look(e, r, true); }
  return out;
}
async function drainGroup() {
  if (mainWasHub) { const n = groupLeft().length; return n ? { left: { n, hubMain: true } } : {}; }   // B-2c5c unit 1: the hub's — counted, never signalled
  const left = groupLeft();
  const out = escapedOf(), mine = keeps && stopping; // a service STOPPED: what it kept is its own, stopped with it — outside its group too
  // B-7ca1 (its round's should 5): a cut scan is said, as the engine's; B-d8f4 (10, its read's S2): a listing that failed too — for EVERY scan of
  // this drain (the late stop's rescan, the kill pass), each said once
  let saidCut = false, saidNone = false, saidUnread = false, saidEnding = false;
  const sayScan = (o) => {
    const ww = walkWords({ unreadable: o && o.unread, ending: o && o.ending });   // r4324: the walk's words from the ONE builder (the twin's); this scan reads no owner — `others` not given
    if (ww.unread && !saidUnread) { saidUnread = true; sayOwn(`[job-wrapper] stop: its scan for what left its group could not read ${ww.unread} twice — what they carry is unknown: they may be left running\n`); }   // B-d8f4 (r2215): said, never silently «not carrying»
    if (ww.stillEnding && !saidEnding) { saidEnding = true; sayOwn(`[job-wrapper] stop: its scan for what left its group met ${ww.stillEnding}\n`); }   // r4302: said by its true word, never «could not read», never silently
    if (o && o.cut && !saidCut) { saidCut = true; sayOwn(`[job-wrapper] stop: its scan for what left its group read only part of the processes (past 250 ms) — what it did not read may be left running\n`); }
    if (o && o.none && stopping && !saidNone) { saidNone = true; const why = o.none === 'ENOENT' ? 'this machine has no process file system (/proc)' : `it could not list the processes in /proc (${o.none})`; sayOwn(`[job-wrapper] stop: ${why} — what left its group cannot be found, and may be left running\n`); }
  };
  sayScan(out);
  // B-7ca1 (the group rung — no scope: a container, a pod): a TASK's stop ends what carries its mark outside its group too — a child that
  // made its own group (setsid, the timeout program) and was re-parented before the stop is neither in the group nor under the tree the
  // stop read; by identity (pid + start), never one that started before us, never a hub started inside the job (keptTest)
  let taskStop = !keeps && !!stopping;   // read again before the kill pass: a stop that lands while a natural end drains is a stop (its read's S2)
  const ours = (p) => !!p[2];   // carries THIS run's mark (an earlier run's leftover, and what it forks, never does)
  // B-c134: a STOP's tree — what of it the stop step read outside our group and is still there is the stop's to end, with the rest
  const outKeys = new Set();   // B-d8f4 (7): every process outside our group that is THIS stop's to end — counted «outside» once the stop reached it, whichever pass found it
  { const g = new Set(left.map(termKey)); for (const p of stopping ? stopTree.filter(same) : []) if (!g.has(termKey(p))) { left.push(p); g.add(termKey(p)); outKeys.add(termKey(p)); } }
  // B-d8f4 (主开发 r902): what the stop step reached outside our group is the stop's even when NOTHING is alive at the drain — the exit
  // record still carries its count (the early returns kept none)
  const stepReached = taskStop ? [...stopEsc.keys(), ...stopTreeOut.keys()].filter(landed) : [];
  if (!left.length && !out.length && !stepReached.length) return {};
  // round 10c: EVERY COUNT IN THE RECORD IS THE SIZE OF ONE SET of processes (`pid:start`) — one both scans saw (it left our group
  // between them) is one process, never two
  const inGroup = new Set(left.map(termKey)), outside = out.filter((p) => !inGroup.has(termKey(p))), runOut = outside.filter(ours);
  for (const [k, p] of stopEsc) if (!inGroup.has(k) && !runOut.some((q) => termKey(q) === k)) runOut.push(p);   // the stop step's, gone before this scan
  for (const p of runOut) outKeys.add(termKey(p));
  const rows = keeps ? [...left, ...outside] : taskStop ? [...left, ...runOut] : left, n = rows.length;
  const kept = keeps ? { kept: true, pids: rows.slice(0, 64), boot: bootId(), ...(outside.length ? { escaped: outside.length } : {}), ...(n > 64 ? { recorded: 64 } : {}) } : null;
  if (keeps && !stopping) return { left: { n, ...kept } }; // kept: named by identity for the engine (its stop, park, removal, next start)
  if (!n && !stepReached.length) return { left: { n: 0, escaped: outside.length } }; // a task's that left its group: said, not stopped
  if (mine) left.push(...outside); else if (taskStop) left.push(...runOut);
  // round 7: what our SIGTERM reaches only now hears it now (the group's and a stopped service's escapees' heard it at the stop).
  // Round 8: A STOP HAS ONE CLOCK — its grace runs from the stop, for every process: one first seen at the drain gets what is LEFT
  // of it, never a fresh grace (round 7's per-process deadline ran to twice the grace, past the engine's kill step a second after
  // it: the engine killed us mid-drain — no exit.json, a stopped service's escapee alive for ever, unsaid). The engine's step is
  // the backstop; our end comes first. A natural end's leftovers (no stop): the grace from their SIGTERM, now. Round 12: THE
  // GRACE IS UP (our own timer fired at it, or its deadline passed) ⇒ this is the KILL pass — what hears its SIGTERM only now is
  // killed in it, recorded 'kill'; with grace left, 'drain' — and a wait always follows it (one nap at least: never a 'drain'
  // SIGTERM with its SIGKILL straight after)
  const late = !!stopping && (graceUp || Date.now() >= stopAt + stopMs);
  for (const p of left) termOnce(p, late ? 'kill' : 'drain');
  const deadline = stopping ? stopAt + stopMs : Math.max(0, ...left.map((p) => termed.get(termKey(p))?.at || 0)) + stopMs;
  let live = left.filter(same);
  if (!late && live.length) do { await nap(25); live = live.filter(same); } while (live.length && Date.now() < deadline);
  // by force: the group once more and a stopped service's marked processes — rescanned until a pass finds none (one that forks on
  // its SIGTERM leaves no child behind), at most three passes
  if (!taskStop && !keeps && stopping) {   // a stop landed while this drain waited: its stop step SIGTERMed this run's escapees — they are a stop's now,
    taskStop = true;                        // with what is left of THE STOP's grace (its read r2, S2: one clock), never killed at once
    const raw = escapedOf(); sayScan(raw);
    const fresh = raw.filter(ours); for (const p of fresh) outKeys.add(termKey(p));   // B-d8f4 (7): one the late stop's rescan finds first is the stop's outside its group too
    const seenL = new Set(), lv0 = [...runOut, ...fresh, ...stopTree].filter((p) => !seenL.has(termKey(p)) && seenL.add(termKey(p)));   // its read r3: a FRESH scan too — what appeared since the first, and the stop's own tree
    let lv = lv0.filter(same); const dl = stopAt + stopMs;
    while (lv.length && Date.now() < dl) { await nap(25); lv = lv.filter(same); }
  }
  const killed = new Set();
  for (let pass = 0; pass < 3; pass++) {
    const rawE = mine || taskStop ? escapedOf() : []; sayScan(rawE);
    const esc = mine ? rawE : taskStop ? rawE.filter(ours) : [];
    if (taskStop) for (const p of esc) outKeys.add(termKey(p));   // B-d8f4 (7): …and one the kill pass finds first
    const more = [...groupLeft(), ...esc, ...(stopping ? stopTree.filter(same) : [])].filter((p) => !killed.has(termKey(p)));
    if (!more.length) break;
    for (const p of more) if (killNow(p)) killed.add(termKey(p));
  }
  const still = killed.size;
  if (still && !forced) forced = `${still} process${still === 1 ? '' : 'es'} it left ${still === 1 ? 'was' : 'were'} still running ${stopMs / 1000} s after ${stopping ? 'the stop' : 'its SIGTERM'} — killed`;
  const runStopped = taskStop ? runOut.filter((p) => landed(termKey(p)) || killed.has(termKey(p))) : [];   // B-7ca1 (its read r2): what the STOP reached — never one that ended by itself before it
  // B-d8f4 (7, its read's M1 + M2): what the stop step signalled outside our group — escapees and its tree's members — is the stop's, on
  // EITHER road (a stop before the drain, a stop that lands while it drains), whatever this drain still finds alive
  if (taskStop) { for (const k of stopEsc.keys()) outKeys.add(k); for (const k of stopTreeOut.keys()) outKeys.add(k); }
  const reachedKeys = taskStop ? [...outKeys].filter((k) => landed(k) || killed.has(k)) : [];
  const outsideReached = reachedKeys.length;   // B-d8f4 (7): the count «outside» — never low
  const counted = new Set([...rows.filter((p) => !runOut.includes(p) || runStopped.includes(p)).map(termKey), ...killed, ...runStopped.map(termKey), ...reachedKeys]), all = counted.size;   // its read's M2: n holds every one «outside» counts — never outside > n // forked while it drained: counted with the rest
  // what got less than the full grace — OF WHAT IT LEFT (round 10c: r10 counted every SIGTERM of the run, one that ended before
  // the drain too — 4 of 3). Round 11: what we KILLED that NO step reached with SIGTERM (the stop step's, the drain's — the one
  // table): it only ever got SIGKILL. One the drain SIGTERMed heard the stop — what was left of its grace was its to use, ended on
  // it or not — never counted (r10c counted it: «1 process got less than the full grace» on a stop that cut nothing). Round 12:
  // KILLED WITHOUT ITS GRACE — never termed, or termed in the KILL pass (its SIGTERM and SIGKILL together); one termed in an
  // earlier pass (the stop step's, the drain's with grace left) had its grace. A state the table holds — no clock in the count
  const short = stopping ? [...killed].filter((k) => { const t = termed.get(k); return !t || t.pass === 'kill'; }).length : 0;
  if (mine) return { left: { n: all, ...kept, ...(all > kept.pids.length && !kept.recorded ? { recorded: kept.pids.length } : {}), cleared: Date.now(), ...(short ? { short } : {}) } }; // recorded the way an end records them — and stopped with it
  return { left: { n: all, ...(still ? { force: true } : {}), ...(taskStop ? (() => { const sk = new Set(runStopped.map(termKey)), not = outside.filter((p) => !sk.has(termKey(p)) && same(p)).length;   /* its round's should 6: one that ended by itself is not «not stopped» */ return { ...(outsideReached ? { outside: outsideReached } : {}), ...(not ? { escaped: not } : {}) }; })() : outside.length ? { escaped: outside.length } : {}), ...(short ? { short } : {}) } };   // B-7ca1: a stop's are STOPPED (outside), a natural end's said (escaped)
}

async function ended(code, signal) {
  if (exited) return;
  exited = true;
  // protocol 3: the value masker does NOT end at the exit event — the job's group may still write the rest of a value during the
  // drain (F10, F11); it ends ONCE below, at the pipes' end
  if (!stopping) markStopping('drain'); // round 10: what the job left hears its SIGTERM from us — the engine's stop then signals us alone
  // round 7: the stop in flight, whatever ran first. Round 8: the intent is a stop the engine MEANT — its group signal reaches us
  // too: waited a little; heard ⇒ the engine's (our handler said so); not heard ⇒ nobody delivered it — we do, the grace from now
  if (!stopping) {
    const s0 = stopIntent(), s = s0 && s0.at > refusedAt ? s0 : null;   // B-2c5c: a stop refused while the hub was the main is no stop at its end
    if (s) { await new Promise((res) => { heard = res; setTimeout(res, Math.min(500, stopMs / 2)); }); heard = null; } // (a held timer: nothing else keeps us alive now)
    if (s && !stopping) { stopIntentAt = Number(s.at) || 0; onStop(s.sig, Date.now(), 'intent'); }
  }
  if (ansTimer) clearInterval(ansTimer);
  if (pressureTimer) clearInterval(pressureTimer);
  if (pressureOn) { try { fs.unlinkSync(pressurePath); } catch { } } // the run ended under its own wrapper: the exit record speaks
  const memory = { ...boundRec, ...memoryEnd(code, signal) };
  const drained = scoped() ? await drainScope() : await drainGroup();
  const named = memory.cause === 'oom-bound' ? ` — stopped: used more than ${memory.mb >= 1024 ? Math.round(memory.mb / 102.4) / 10 + ' GB' : memory.mb + ' MB'} (${memory.how})`
    : memory.cause === 'oom' ? ` — killed: out of memory (${memory.how})` : '';
  const end = (drained.left ? ` — ${leftWords(drained.left)}` : forced ? ` — stopped by force: ${forced}` : '') + (drained.scopeUnread ? ` — its scope's list could not be read${typeof drained.scopeUnread === 'string' ? ` (${drained.scopeUnread})` : ''}: what it started may still run` : '');
  if (VAL) {   // protocol 3: THE ONE END of the value masker, at the pipes' end — what it held back, masked
    // r2600 (2b): never past the engine's kill step — counted from the ENGINE's time (its stop's, or its intent's own); a stop no engine
    // gave (a signal) has no kill step to meet; a floor of 50 ms, so a pipe that closes at once is not read as held (round wtlm3ig4w)
    const killBase = stopBy === 'signal' ? 0 : stopBy === 'intent' ? (stopIntentAt || stopAt) : stopAt;
    const budget = stopping && killBase ? Math.max(50, Math.min(PIPES_END_MS, killBase + stopMs + 1000 - KILL_STEP_MARGIN_MS - Date.now())) : PIPES_END_MS;
    const closed = await pipesEnd(budget);
    const f = flushMask(!closed); vEnded = true; if (f.length) writeLog(f);   // r2600 (2a): a writer still holding them ⇒ a CUT
  }
  drainOwn('end');   // r3732: every own line the drain queued, after what the masker held (its ONE end above)
  sayOwn(`\n[job-wrapper] exit code=${code} signal=${signal || ''}${named}${end}\n`); drainOwn('end');
  writeExit({ code, signal: signal || null, endedAt: Date.now(), memory, ...(mainWasHub ? { hubMain: true } : {}), ...(stopping ? { stop: stopping, stopBy, ...(mainBy ? { mainBy } : {}) } : {}), ...(forced ? { forced: `stopped by force: ${forced}` } : {}), ...(drained.left ? { left: drained.left } : {}), ...(scoped() ? { scopeEmpty: drained.scopeEmpty, ...(drained.scopeUnread ? { scopeUnread: drained.scopeUnread } : {}) } : {}) });
  process.exit(code === null ? 143 : code);
}
// THE START (protocol 3): the values first — drained from OUR fd 3 (a socket the hub wrote and ended) on a non-blocking handle
// (a blocked read on the threadpool would hold our exit for ever), bounded in bytes and time, and the fd CLOSED (its 'close')
// before rungPlan asks this host anything or a rung is spawned; a frame that does not read, comes late or too large: not started.
// Round 2 — THE HAND-OVER IS ACKNOWLEDGED: a frame read whole (and no stop meanwhile) is answered with ONE byte (VJ.ACK) before
// the fd closes — the hub writes the start's use line on it. A refusal writes its record (exit.json `refused`: its code) and
// exits, and only that exit closes the fd: the hub, seeing the channel close with no ACK, reads the code it names
function notStarted(why, code = 'values_unreadable') {
  const line = `[job-wrapper] refused: ${why} — the job was not started\n`;
  sayOwn(line); drainOwn('end');
  try { process.stderr.write(line); } catch { }
  writeExit({ code: 2, signal: null, endedAt: Date.now(), refused: code });
  process.exit(2);
}
function stoppedBefore() { // stopped while its values were on their way: it never ran
  sayOwn(`[job-wrapper] stopped (${stopping}) before the job started\n`); drainOwn('end');
  writeExit({ code: null, signal: stopping, endedAt: Date.now(), stop: stopping, stopBy });
  process.exit(143);
}
function drainValues() {
  return new Promise((resolve) => {
    let sock;
    try { sock = new (require('net').Socket)({ fd: 3, readable: true, writable: true, allowHalfOpen: true }); } catch (e) { notStarted(`the hub's channel for its vault values is not open (${(e && e.code) || 'error'})`, 'no_channel'); return; }
    const chunks = [];
    let got = 0, values = null;
    const zero = () => { for (const b of chunks) b.fill(0); };
    const refuse = (why, code) => { zero(); notStarted(why, code); }; // the record first; our exit closes the fd
    const timer = setTimeout(() => refuse(`the vault values did not arrive within ${VJ.DRAIN_MS / 1000} s`, 'values_late'), VJ.DRAIN_MS);
    sock.on('data', (b) => { got += b.length; chunks.push(b); if (got > VJ.PAYLOAD_MAX) refuse(`the vault values were larger than ${VJ.PAYLOAD_MAX / 1024} KiB`, 'values_too_large'); });
    sock.on('end', () => { // the hub ended its side: the frame is whole
      clearTimeout(timer);
      const buf = Buffer.concat(chunks); zero();
      const r = VJ.decodeFrame(buf, VPLAN); buf.fill(0);
      if (!r.ok) refuse(r.why, 'values_unreadable');
      if (stopping) { for (const v of r.values) v.fill(0); stoppedBefore(); }
      values = r.values;
      sock.end(Buffer.from([VJ.ACK])); // THE ACK — then our side ends, and the fd closes
    });
    sock.on('error', (e) => { if (!values) refuse(`the vault values could not be read (${(e && e.code) || 'error'})`, 'values_unreadable'); }); // after the ACK: the hub went away — the values are ours
    sock.on('close', () => { clearTimeout(timer); if (values) resolve({ values }); }); // the fd is closed now — nothing spawned after this inherits it
  });
}
function begin() {
  if (stopping) stoppedBefore();
  plan = rungPlan();
  launch();
}
if (VPLAN) drainValues().then((r) => { VAL = r.values; begin(); }, () => notStarted('the vault values could not be read'));
else begin();

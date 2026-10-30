#!/usr/bin/env node
// Background Work job wrapper (STATIC tracked; docs/design-background-work.md §5).
// argv: node job-wrapper.js <ctlDir> <specPath> --proto=2 (the protocol the server speaks — below)
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
'use strict';
const fs = require('fs');
const path = require('path');
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
  const sh = l.short ? ` (${l.short} process${es(l.short)} got less than the full grace)` : ''; // round 8: first seen after the stop
  if (l.cleared) return `it left ${n} process${es(n)} running — stopped at ${hhmm(l.cleared)}${sh}`;
  if (l.gone) return `it left ${n} process${es(n)} running — ${n === 1 ? 'it' : 'they'} had already ended by ${hhmm(l.gone)}`;
  if (l.kept) return `it left ${n} process${es(n)} running — kept: a service's own until it is stopped or started again${l.escaped ? ` (${l.escaped} outside its group)` : ''}${l.recorded ? ` (${l.recorded} of ${n} recorded)` : ''}`;
  const esc = l.escaped ? `${l.escaped} process${es(l.escaped)} left its group — not stopped` : '';
  if (!n) return `${esc}; run it as a service job`;
  return `the job left ${n} process${es(n)} running — ${n === 1 ? 'it was' : 'they were'} stopped${l.force ? ' by force' : ''}${sh}${esc ? `; ${esc}; run it as a service job` : '; to keep a daemon, run it as a service job'}`;
}
if (!process.argv[2] && require.main !== module) { module.exports = { allocationRefused, systemdMajor, scopeResultEnd, scopeEventsEnd, capOf, sharedAncestors, leftWords }; return; }

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
const PROTO = 2;
const ofCtl = !!specPath && path.dirname(path.resolve(specPath)) === path.resolve(ctlDir);
const said = /^--proto=(\d{1,6})$/.exec(protoArg || '');
const v1 = !said && !ofCtl && /^eyJ[A-Za-z0-9+/]*={0,2}$/.test(specPath || '') && specPath.length % 4 === 0; // `{"` in base64 — a ≤ .330 caller
const proto = said ? Number(said[1]) : ofCtl ? PROTO : v1 ? 1 : 0;
// the spec file is read ONCE, then unlinked — and only a file of OUR ctl dir (a path elsewhere is never read nor removed)
let spec = null, refusal = '', windowEnd = false;
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
fs.writeFileSync(path.join(ctlDir, 'pid.json.tmp'), JSON.stringify(stamp));
fs.renameSync(path.join(ctlDir, 'pid.json.tmp'), path.join(ctlDir, 'pid.json'));
function writeExit(exit) {
  try {
    fs.writeFileSync(path.join(ctlDir, 'exit.json.tmp'), JSON.stringify(exit));
    fs.renameSync(path.join(ctlDir, 'exit.json.tmp'), path.join(ctlDir, 'exit.json'));
  } catch { }
}
// a refused spec ENDS the run where the engine reads it: the named line in the job's log, exit.json, a non-zero exit —
// a protocol mismatch says so in exit.json (reason update_window, exit 75): the job was never started
if (refusal) {
  const line = windowEnd ? `[job-wrapper] not started: ${refusal}\n` : `[job-wrapper] refused: ${refusal}\n`;
  try { process.stderr.write(line); } catch { }
  try { fs.appendFileSync(logPath, line); } catch { }
  writeExit(windowEnd ? { code: 75, signal: null, endedAt: Date.now(), reason: 'update_window', proto: { server: proto, wrapper: PROTO } } : { code: 2, signal: null, endedAt: Date.now() });
  process.exit(windowEnd ? 75 : 2);
}

let logFd = fs.openSync(logPath, 'a');
let logSize = fs.fstatSync(logFd).size;
let held = null; // a gated rung's words before its proof (THE MEMORY BOUND): the job's log gets them only once the job runs
function writeLog(buf) {
  if (held) { held.push(buf); return; }
  try {
    if (logSize + buf.length > logCap) { // rotate: keep ONE previous generation; never unlink the live fd's file
      try { fs.closeSync(logFd); fs.renameSync(logPath, logPath + '.1'); } catch { }
      logFd = fs.openSync(logPath, 'a'); logSize = 0;
    }
    fs.writeSync(logFd, buf); logSize += buf.length;
  } catch { }
}

// lane agent-output-sinks (design q-043 D3 ③): a secret an agent's job prints never lands in the log in the clear —
// every chunk passes the SHAPE census (src/secret-shapes.js R1–R8: a bearer, a known prefix, a PEM block, a JWT, a
// `KEY=value` …) before it is written. SHAPES ONLY: the wrapper is a detached process with no vault (no DEK, so no
// live-value masker — and a background job can never hold a stored value anyway, the q-043 ① law; a `vibespace-vault
// run` child's live values are masked by the hub that spawns it, P0-f). Residuals (said in the design §8.6 ③): a value
// split across two reads, or between stdout and stderr, and a non-UTF-8 (binary) chunk pass — a credential is text, and
// mangling binary output would break a legitimate job. Best-effort: if the module cannot be required the write is never
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
      let controllers = '';
      if (cg) { try { controllers = fs.readFileSync(path.join('/sys/fs/cgroup', cg, 'cgroup.controllers'), 'utf8'); } catch { } }
      if (!run || !ctl) misses.push('no systemd-run here');
      else if (!sh) misses.push('no sh here to hold the job until its bound is read back');
      else if (!cg) misses.push('no user systemd answered');
      else if (!/\bmemory\b/.test(controllers)) misses.push('the user systemd holds no memory controller');
      else {
        const version = systemdMajor(ask(ctl, ['--user', 'show', '-p', 'Version', '--value'])) || systemdMajor(ask(ctl, ['--version']));
        const policy = version >= 253;
        // the scope starts at the ASKED bound (unbounded: infinity); what contains it is read once it exists (settleCap)
        plan.push({ by: 'cgroup', ctl, version, policy, mb: askedMb, argv: [run, '--user', '--scope', '--quiet', `--unit=${unit}`, '-p', `MemoryMax=${askedMb ? askedMb + 'M' : 'infinity'}`, '-p', 'MemorySwapMax=0', ...(policy ? ['-p', 'OOMPolicy=stop'] : []), '--', sh, '-c', policy ? GATE_EXEC : GATE_KEEP, 'sh', ...spec.argv] });
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
const plan = rungPlan();
function whyOf(r) {
  if (r.why) return r.why;
  const before = misses.join('; ');
  if (r.by === 'cgroup') return `a scope of the user systemd (${unit}.scope, MemoryMax${r.policy ? ', OOMPolicy=stop' : `; systemd ${r.version || '?'} has no OOMPolicy for a scope — its end is read from the scope's memory.events`})`;
  if (r.by === 'rlimit-data') return before ? `${before} — RLIMIT_DATA on the job instead` : 'RLIMIT_DATA on the job';
  return `this host cannot enforce a bound (${before || 'no rung offered'})`;
}
let rung = null, child = null, proven = false, boundRec = null, stopping = null, exited = false;
let scopeDir = '', eventsAtGo = null;
let keeper = null, keeperSaid = null; // < 253 (round 6): the keeper's identity {pid, start} — said by the gate on fd 3

// the job's LAST WORDS (4 KiB, both streams): under RLIMIT_DATA an allocation the bound refuses ends inside the job, and the
// job says so as it dies (allocationRefused above)
let tail = Buffer.alloc(0);
const keepTail = (b) => { tail = Buffer.concat([tail, b]); if (tail.length > 4096) tail = tail.subarray(tail.length - 4096); };

function writeBound() {
  try {
    fs.writeFileSync(path.join(ctlDir, 'bound.json.tmp'), JSON.stringify(boundRec));
    fs.renameSync(path.join(ctlDir, 'bound.json.tmp'), path.join(ctlDir, 'bound.json'));
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
    stdio: [spec.stdinOpen ? 'pipe' : 'ignore', 'pipe', 'pipe', ...(gated ? ['pipe'] : [])],
  });
  const c = child;
  child.stdout.on('data', (b) => writeLog(maskChunk(b)));
  child.stderr.on('data', (b) => writeLog(maskChunk(b)));
  child.stdout.on('data', keepTail);
  child.stderr.on('data', keepTail);
  child.on('exit', (code, signal) => { if (c === child && (proven || !gated)) ended(code, signal); });
  child.on('close', (code, signal) => { if (c === child && gated && !proven) fellThrough(r, code, signal); });
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
  writeLog(Buffer.from(`[job-wrapper] the ${r.by} rung did not hold the job — ${why}; it runs on the next rung\n`));
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
  if (!forced) forced = why; // the first kill's why — and every call kills (round 5: a label is never the guard)
  await scopeKill('SIGKILL');
  if (procsOf(scopeDir).length) { try { fs.writeFileSync(path.join(scopeDir, 'cgroup.kill'), '1'); } catch { } } // no manager answered: the kernel's own
}
// round 7: what OUR SIGTERM reached and when (`pid:start` → ms) — each process's grace runs from its own SIGTERM; a row of a fresh
// /proc scan, its start re-read at the act (same). Round 9: ONE SIGNAL PER PID PER STOP STEP — EVERY delivery of the stop goes
// through termOnce (the group's, the scope's, a stopped service's escapees; round 10: the job's main through termMain, by its handle): recorded, a second
// refused (round 8 forwarded the main's signal, then its group loop SIGTERMed it again 13 ms later — a graceful cleanup cut off,
// code 143); true when it was delivered
const termed = new Map();
const termKey = ([pid, st]) => `${pid}:${st}`;
const termOnce = (p, sig = 'SIGTERM') => { if (termed.has(termKey(p)) || !same(p)) return false; termed.set(termKey(p), Date.now()); try { process.kill(p[0], sig); return true; } catch { return false; } };
const rowOf = (pid) => { const r = pid ? statOf(pid) : null; return r && r[0] !== 'Z' ? [Number(pid), Number(r[19]), Number(r[2])] : null; }; // [pid, start, pgid]
// round 10: THE MAIN IS THE HANDLE WE SPAWNED — never a pid read again: signalled only while the handle is live (exitCode and
// signalCode null: not reaped, so its pid is no other process's), nothing after its 'exit' (r9 re-read /proc/<pid>/stat after
// the reap — a Stop racing the job's own end, a signal to us while we drained: whoever held that pid since got the job's stop,
// recorded «mainBy wrapper»)
const mainLive = () => !!child && !exited && child.exitCode === null && child.signalCode === null;
const termMain = (p, sig) => { if (termed.has(termKey(p)) || !mainLive()) return false; termed.set(termKey(p), Date.now()); try { process.kill(child.pid, sig); return true; } catch { return false; } };
// round 10: the manager's kill of the scope is a delivery too — recorded, once per stop step (r9 sent a natural end's leftovers
// their SIGTERM by it unrecorded: a stop while they drained SIGTERMed them again)
let scopeSent = 0;
const scopeTerm = (sig) => { if (scopeSent) return Promise.resolve(false); scopeSent = Date.now(); return scopeKill(sig); };
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
let stopBy = '', heard = null, mainBy = '';
// THE STOP — the engine's signal to our group, or (round 7) ITS INTENT: stop.json beside pid.json, written before it signals. The
// child's end and our own handler land at once, in either order: a wrapper that handles the end first still knows a stop is in
// flight (a service's leftovers stopped with it — never kept, unsaid: heavy ㉒, 1 pair in 12). Said in the job's log
function onStop(sig, at, by) {
  if (stopping) return;
  stopping = sig; stopAt = at; stopBy = by;
  markStopping(by);
  // round 9: A SIGNAL GOES TO A PROVEN IDENTITY, NEVER ASSUMED DELIVERED — the engine's group signal reached what is in OUR group
  // NOW (its pgid ours, read at the stop): marked, never signalled again. Everything else hears the stop from us, once: the job's
  // main its own signal (round 8 assumed the engine's reached it — a main that left our group (setsid) was sent none, killed at
  // the grace under «did not end on SIGTERM»), then the rest SIGTERM. The cgroup rung: THE SCOPE IS THE GROUP — its processes one
  // by one through the same table (round 4's `systemctl kill` of the scope sent the stop AGAIN to all the engine's signal had
  // reached: the main heard it twice, 3 ms apart); a scope whose list cannot be read, the manager's kill (as before)
  const main = mainLive() ? rowOf(child.pid) : null; // the main first — its own stat names its group (no walk before it hears the stop)
  if (main && by === 'engine' && main[2] === process.pid) termed.set(termKey(main), at);
  mainBy = main ? (termed.has(termKey(main)) ? 'engine' : termMain(main, sig) ? 'wrapper' : '') : child && !mainLive() ? 'ended' : '';
  const listed = scoped() ? scopeRows() : null;
  const rows = scoped() ? listed || [] : groupLeft().map(([p, st]) => [p, st, process.pid]); // our group's: its pgid ours
  if (by === 'engine') for (const p of rows) if (p[2] === process.pid && !termed.has(termKey(p))) termed.set(termKey(p), at);
  const who = by === 'engine' ? `the engine signalled its process group${mainBy === 'wrapper' ? '; its main process had left that group — the wrapper signals it' : ''}`
    : by === 'intent' ? "the engine's stop never reached its group — the wrapper signals it"
      : by === 'alone' ? "the engine's stop reached the wrapper alone, already stopping what its job left — the wrapper signals the rest, once"
        : 'a signal to the wrapper alone — the wrapper signals its group';
  try { fs.writeSync(logFd, Buffer.from(`\n[job-wrapper] stop: ${sig} — ${stopMs / 1000} s to end (${who}${mainBy === 'ended' ? '; its main process had already ended' : ''})\n`)); } catch { }
  for (const p of rows) termOnce(p); // what the engine's signal did not reach — every member, for a stop not the engine's
  if (scoped() && !listed) scopeTerm(sig);
  const on = mainBy === 'engine' || mainBy === 'wrapper' ? ` on ${sig}` : ''; // «did not end on SIGTERM» only when one reached it
  const left = Math.max(0, at + stopMs - Date.now());
  if (!scoped()) { // round 6: a rung without a scope — the job's group is OURS to end at the grace, said (drainGroup takes what
    // the job left in it); the engine's kill step is a backstop for a wrapper that cannot (a second later). Round 7: the group
    // heard the stop with us (the engine signals it) — its grace runs from the stop; a SERVICE's processes that left the group
    // (its mark) hear it NOW, with the main — round 6 signalled them only once the main ended, against what was left of the grace
    if (keeps) for (const p of escapedOf()) termOnce(p);
    const t = setTimeout(() => { if (exited) return; if (!forced) forced = `it did not end${on} in ${stopMs / 1000} s — its process group was killed`; try { child.kill('SIGKILL'); } catch { } }, left); t.unref?.();
    return;
  }
  const t = setTimeout(() => { if (!exited) forceScope(`it did not end${on} in ${stopMs / 1000} s — its scope was killed`); }, left); t.unref?.();
}
/** round 9: the scope's processes as rows ([pid, start, pgid]) — never the keeper; null when its list cannot be read */
function scopeRows() {
  let t;
  try { t = fs.readFileSync(path.join(scopeDir, 'cgroup.procs'), 'utf8'); } catch { return null; }
  return t.split('\n').filter((l) => /^\d+$/.test(l) && Number(l) !== process.pid && !isKeeper(l)).map(rowOf).filter(Boolean);
}
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => {
  const s = stopIntent(), engine = !!s && Date.now() - s.at <= INTENT_FRESH_MS; // round 8: the engine's — its clock is the intent's
  onStop(sig, engine ? s.at : Date.now(), engine ? (s.alone ? 'alone' : 'engine') : 'signal');
  if (heard) heard();
});
/** the engine's stop intent for THIS run (its ctl dir), or null */
function stopIntent() {
  try { const s = JSON.parse(fs.readFileSync(path.join(ctlDir, 'stop.json'), 'utf8')); return { sig: /^SIG[A-Z]{2,6}$/.test(s.sig) ? s.sig : 'SIGTERM', at: Number(s.at) > 0 && Number(s.at) <= Date.now() ? Number(s.at) : Date.now(), alone: s.alone === true }; } catch { return null; }
}
// THE END IS WRITTEN ONCE THE SCOPE IS EMPTY (the cgroup rung): the keeper is let go (its events read), then — round 5, the
// ruling of 2026-10-27 (a job's scope IS the job) — at a natural end what still runs in the scope is what the job LEFT: a
// TASK's orphans are stopped at once (SIGTERM to the scope; stopMs later, by force) and said; a SERVICE keeps them (its own
// while it runs — the engine stops them before its next start, at its stop). After a stop the whole scope heard it: what
// still runs stopMs after it is killed. Never a run that «ended» while its processes still run, hold its ports, and meet
// the next start — and never a «scope was killed» that killed nothing (round 5)
async function drainScope() {
  if (!rung.policy) { // the keeper's read ends: it leaves the scope — known by the PID it said, awaited out (round 6)
    if (keeperSaid && !keeper) await Promise.race([keeperSaid, nap(500)]);
    try { child.stdio[3].destroy(); } catch { }
    for (let i = 0; i < 40 && keeper && procsOf(scopeDir).includes(String(keeper.pid)); i++) await nap(25);
  }
  const procs = stopping ? [] : procsOf(scopeDir).filter((p) => !isKeeper(p)), left = procs.length;
  if (left && keeps) { // round 6: named by identity too — a stop whose read of the scope does not answer SIGTERMs them blind
    const rows = procs.map((p) => [Number(p), Number((statOf(p) || [])[19])]).filter((r) => r[1] > 0).slice(0, 64);
    return { left: { n: left, kept: true, pids: rows, boot: bootId(), ...(rows.length < left ? { recorded: rows.length } : {}) }, scopeEmpty: false };
  }
  if (left) { const rows = scopeRows(); if (rows) for (const p of rows) termOnce(p); else await scopeTerm('SIGTERM'); } // round 10: recorded, one by one
  const deadline = (stopping ? stopAt : Date.now()) + stopMs;
  while (procsOf(scopeDir).length && Date.now() < deadline) await nap(25);
  const still = procsOf(scopeDir).length, s = still === 1 ? '' : 'es', was = still === 1 ? 'was' : 'were';
  if (still) await forceScope(left ? `${still} process${s} it left ${was} still running ${stopMs / 1000} s after its SIGTERM — its scope was killed` : `${still} process${s} ${was} still in its scope ${stopMs / 1000} s after ${stopping ? 'the stop' : 'its end'} — its scope was killed`);
  for (let i = 0; i < 80 && procsOf(scopeDir).length; i++) await nap(25);
  return { ...(left ? { left: { n: left, ...(still ? { force: true } : {}) } } : {}), scopeEmpty: !procsOf(scopeDir).length };
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
  const out = [];
  let ents = [];
  try { ents = fs.readdirSync('/proc'); } catch { return out; }
  for (const e of ents) {
    if (!/^\d+$/.test(e) || Number(e) === process.pid) continue;
    const r = statOf(e);
    if (r && Number(r[2]) === process.pid && r[0] !== 'Z') out.push([Number(e), Number(r[19])]);
  }
  return out;
}
const same = ([pid, st]) => { const r = statOf(pid); return !!r && r[0] !== 'Z' && Number(r[19]) === st; };
const MARK = spec && spec.env && spec.env.VIBESPACE_JOB_ID ? `VIBESPACE_JOB_ID=${spec.env.VIBESPACE_JOB_ID}` : '';
function escapedOf() { // started after us, outside our group, carrying the job's mark — never us (our own env carries it too)
  const out = [];
  let ents = [];
  if (!MARK) return out;
  try { ents = fs.readdirSync('/proc'); } catch { return out; }
  for (const e of ents) {
    if (!/^\d+$/.test(e) || Number(e) === process.pid) continue;
    const r = statOf(e);
    if (!r || r[0] === 'Z' || Number(r[2]) === process.pid || Number(r[19]) < stamp.starttime) continue;
    try { if (fs.readFileSync(`/proc/${e}/environ`, 'latin1').split('\0').includes(MARK)) out.push([Number(e), Number(r[19])]); } catch { }
  }
  return out;
}
async function drainGroup() {
  const left = groupLeft();
  const out = escapedOf(), mine = keeps && stopping; // a service STOPPED: what it kept is its own, stopped with it — outside its group too
  if (!left.length && !out.length) return {};
  const rows = keeps ? [...left, ...out] : left, n = rows.length;
  const kept = keeps ? { kept: true, pids: rows.slice(0, 64), boot: bootId(), ...(out.length ? { escaped: out.length } : {}), ...(n > 64 ? { recorded: 64 } : {}) } : null;
  if (keeps && !stopping) return { left: { n, ...kept } }; // kept: named by identity for the engine (its stop, park, removal, next start)
  if (!n) return { left: { n: 0, escaped: out.length } }; // a task's that left its group: said, not stopped
  if (mine) left.push(...out);
  // round 7: what our SIGTERM reaches only now hears it now (the group's and a stopped service's escapees' heard it at the stop).
  // Round 8: A STOP HAS ONE CLOCK — its grace runs from the stop, for every process: one first seen at the drain gets what is LEFT
  // of it, never a fresh grace (round 7's per-process deadline ran to twice the grace, past the engine's kill step a second after
  // it: the engine killed us mid-drain — no exit.json, a stopped service's escapee alive for ever, unsaid). The engine's step is
  // the backstop; our end comes first. A natural end's leftovers (no stop): the grace from their SIGTERM, now
  for (const p of left) termOnce(p);
  const deadline = stopping ? stopAt + stopMs : Math.max(0, ...left.map((p) => termed.get(termKey(p)) || 0)) + stopMs;
  let live = left.filter(same);
  while (live.length && Date.now() < deadline) { await nap(25); live = live.filter(same); }
  // by force: the group once more and a stopped service's marked processes — rescanned until a pass finds none (one that forks on
  // its SIGTERM leaves no child behind), at most three passes
  const killed = new Set();
  for (let pass = 0; pass < 3; pass++) {
    const more = [...groupLeft(), ...(mine ? escapedOf() : [])].filter((p) => !killed.has(termKey(p)));
    if (!more.length) break;
    for (const p of more) if (killNow(p)) killed.add(termKey(p));
  }
  const still = killed.size, tol = Math.min(1000, stopMs / 10);
  // what got less than the full grace: our SIGTERM came after the stop (it may have ended on it — its grace was cut all the same),
  // or none came before its kill
  const short = stopping ? [...termed.values()].filter((at) => at - stopAt > tol).length + [...killed].filter((k) => !termed.has(k)).length : 0;
  if (still && !forced) forced = `${still} process${still === 1 ? '' : 'es'} it left ${still === 1 ? 'was' : 'were'} still running ${stopMs / 1000} s after ${stopping ? 'the stop' : 'its SIGTERM'} — killed`;
  const seen = new Set(rows.map(termKey)), all = n + [...killed].filter((k) => !seen.has(k)).length; // forked while it drained: counted with the rest
  if (mine) return { left: { n: all, ...kept, ...(all > kept.pids.length && !kept.recorded ? { recorded: kept.pids.length } : {}), cleared: Date.now(), ...(short ? { short } : {}) } }; // recorded the way an end records them — and stopped with it
  return { left: { n: all, ...(still ? { force: true } : {}), ...(out.length ? { escaped: out.length } : {}), ...(short ? { short } : {}) } };
}

async function ended(code, signal) {
  if (exited) return;
  exited = true;
  if (!stopping) markStopping('drain'); // round 10: what the job left hears its SIGTERM from us — the engine's stop then signals us alone
  // round 7: the stop in flight, whatever ran first. Round 8: the intent is a stop the engine MEANT — its group signal reaches us
  // too: waited a little; heard ⇒ the engine's (our handler said so); not heard ⇒ nobody delivered it — we do, the grace from now
  if (!stopping) {
    const s = stopIntent();
    if (s) { await new Promise((res) => { heard = res; setTimeout(res, Math.min(500, stopMs / 2)); }); heard = null; } // (a held timer: nothing else keeps us alive now)
    if (s && !stopping) onStop(s.sig, Date.now(), 'intent');
  }
  if (ansTimer) clearInterval(ansTimer);
  if (pressureTimer) clearInterval(pressureTimer);
  if (pressureOn) { try { fs.unlinkSync(pressurePath); } catch { } } // the run ended under its own wrapper: the exit record speaks
  const memory = { ...boundRec, ...memoryEnd(code, signal) };
  const drained = scoped() ? await drainScope() : await drainGroup();
  const named = memory.cause === 'oom-bound' ? ` — stopped: used more than ${memory.mb >= 1024 ? Math.round(memory.mb / 102.4) / 10 + ' GB' : memory.mb + ' MB'} (${memory.how})`
    : memory.cause === 'oom' ? ` — killed: out of memory (${memory.how})` : '';
  const end = drained.left ? ` — ${leftWords(drained.left)}` : forced ? ` — stopped by force: ${forced}` : '';
  try { fs.writeSync(logFd, Buffer.from(`\n[job-wrapper] exit code=${code} signal=${signal || ''}${named}${end}\n`)); } catch { }
  writeExit({ code, signal: signal || null, endedAt: Date.now(), memory, ...(stopping ? { stop: stopping, stopBy, ...(mainBy ? { mainBy } : {}) } : {}), ...(forced ? { forced: `stopped by force: ${forced}` } : {}), ...(drained.left ? { left: drained.left } : {}), ...(scoped() ? { scopeEmpty: drained.scopeEmpty } : {}) });
  process.exit(code === null ? 143 : code);
}
launch();

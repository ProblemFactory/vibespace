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
if (!process.argv[2] && require.main !== module) { module.exports = { allocationRefused, systemdMajor, scopeResultEnd, scopeEventsEnd, capOf, sharedAncestors }; return; }

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
// fd 3 until the wrapper has read the scope's memory.events and lets it go; the job itself is exec'd, as on every rung
const GATE_KEEP = 'read -r go <&3 || exit 125; ( (trap "" TERM INT HUP; read -r ack <&3) </dev/null >/dev/null 2>&1 & ); exec "$@" 3<&-';
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
    for (let i = 0; i < 20; i++) { // the unit's facts land with the kill (measured: at once) — bounded at 1 s anyway
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
let stopAt = 0, forced = '';
const scoped = () => proven && rung.by === 'cgroup';
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
  if (forced) return;
  forced = why;
  await scopeKill('SIGKILL');
  if (procsOf(scopeDir).length) { try { fs.writeFileSync(path.join(scopeDir, 'cgroup.kill'), '1'); } catch { } } // no manager answered: the kernel's own
}
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = sig; stopAt = Date.now();
    try { child.kill(sig); } catch { }
    if (!scoped()) return;
    scopeKill(sig);
    const t = setTimeout(() => { if (!exited) forceScope(`it did not end on ${sig} in ${stopMs / 1000} s — its scope was killed`); }, stopMs); t.unref?.();
  });
}
// THE END IS WRITTEN ONCE THE SCOPE IS EMPTY (the cgroup rung): the keeper is let go (its events read), then what the job left
// behind gets the rest of stopMs (from the stop, else from its end) before the scope is killed — never a run that «ended»
// while its processes still run, hold its ports, and meet the next start
async function drainScope(signal) {
  if (!scoped()) return;
  if (!rung.policy) { try { child.stdio[3].destroy(); } catch { } } // the keeper's read ends: it leaves the scope
  if (stopping && signal === 'SIGKILL' && !forced) forced = `it did not end on ${stopping} — its scope was killed`; // the engine's kill step
  const deadline = (stopAt || Date.now()) + stopMs;
  while (procsOf(scopeDir).length && Date.now() < deadline) await new Promise((res) => setTimeout(res, 25));
  const left = procsOf(scopeDir).length;
  if (!left) return;
  await forceScope(`${left} process${left === 1 ? '' : 'es'} it left in its scope ${left === 1 ? 'was' : 'were'} still running ${stopMs / 1000} s after it ${stopping ? 'was stopped' : 'ended'} — its scope was killed`);
  for (let i = 0; i < 80 && procsOf(scopeDir).length; i++) await new Promise((res) => setTimeout(res, 25));
}

async function ended(code, signal) {
  if (exited) return;
  exited = true;
  if (ansTimer) clearInterval(ansTimer);
  if (pressureTimer) clearInterval(pressureTimer);
  if (pressureOn) { try { fs.unlinkSync(pressurePath); } catch { } } // the run ended under its own wrapper: the exit record speaks
  const memory = { ...boundRec, ...memoryEnd(code, signal) };
  await drainScope(signal);
  const named = memory.cause === 'oom-bound' ? ` — stopped: used more than ${memory.mb >= 1024 ? Math.round(memory.mb / 102.4) / 10 + ' GB' : memory.mb + ' MB'} (${memory.how})`
    : memory.cause === 'oom' ? ` — killed: out of memory (${memory.how})` : '';
  const force = forced ? ` — stopped by force: ${forced}` : '';
  try { fs.writeSync(logFd, Buffer.from(`\n[job-wrapper] exit code=${code} signal=${signal || ''}${named}${force}\n`)); } catch { }
  writeExit({ code, signal: signal || null, endedAt: Date.now(), memory, ...(stopping ? { stop: stopping } : {}), ...(forced ? { forced: `stopped by force: ${forced}` } : {}) });
  process.exit(code === null ? 143 : code);
}
launch();

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
// rung that holds the child is MEASURED here and said (bound.json, then exit.json `memory`), and an end by it is named.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');

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
function writeLog(buf) {
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

// ── THE MEMORY BOUND (lane jobs-memory-bound, F6 of B-7f9e, 2026-10-26) ──────────────────────────────────────────────────
// A fleet pod's cgroup has memory.oom.group=1: ONE process past the container's limit kills the whole pod, the hub with it.
// The server resolves the job's bound (src/job-model.js memoryMbOf); the RUNG that enforces it is MEASURED here, at spawn,
// best first — never assumed, never a silent fallback (the record says which rung holds the child and why a better did not):
//   ① cgroup — `systemd-run --user --scope -p MemoryMax=` where a user systemd answers on the job's own bus and holds a
//     memory controller (a host under systemd; a fleet pod has none). OOMPolicy=stop and no --collect: the scope's Result
//     says oom-kill when the kernel ended it (measured 2026-10-27: the cgroup dir is GONE when the child's exit reaches us —
//     the unit's Result is the fact that survives; --collect or OOMPolicy=continue lose it). MemorySwapMax=0: a bound that
//     swaps is no bound. The job keeps OUR process group (measured): the engine's group kill reaches it as before.
//   ② rlimit-data — `prlimit --data=` on the child (util-linux; in the fleet image): RLIMIT_DATA, never RLIMIT_AS (V8
//     reserves address space and dies at start under -v). The refusal is an ENOMEM inside the job — read in its last words.
//     Measured: node 24 counts ~600 MB of its own reservations against it (under 512 MB it cannot start).
//   ③ none — said with its why (the owner's 0, or neither rung on this host).
const MiB = 1024 * 1024;
const asked = spec.memory && typeof spec.memory === 'object' ? spec.memory : null;
const memMb = asked && Number.isFinite(asked.mb) && asked.mb > 0 ? Math.floor(asked.mb) : 0;
const unit = asked && /^[A-Za-z0-9_.@-]{1,180}$/.test(String(asked.unit || '')) ? String(asked.unit) : `vibespace-job-${process.pid}`;
const rungs = asked && Array.isArray(asked.rungs) ? asked.rungs : ['cgroup', 'rlimit-data'];
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
function measureBound() {
  if (!asked) return { mb: 0, by: 'none', why: 'the server asked for no bound (a server older than this wrapper)' };
  if (!memMb) return { mb: 0, by: 'none', why: 'unbounded — the owner set 0' };
  const misses = [];
  for (const rung of rungs) {
    if (rung === 'cgroup') {
      const run = onPath('systemd-run'), ctl = onPath('systemctl');
      const cg = run && ctl ? ask(ctl, ['--user', 'show', '-p', 'ControlGroup', '--value']) : null;
      let held = '';
      if (cg) { try { held = fs.readFileSync(path.join('/sys/fs/cgroup', cg, 'cgroup.controllers'), 'utf8'); } catch { } }
      if (!run || !ctl) misses.push('no systemd-run here');
      else if (!cg) misses.push('no user systemd answered');
      else if (!/\bmemory\b/.test(held)) misses.push('the user systemd holds no memory controller');
      else return { mb: memMb, by: 'cgroup', why: `a scope of the user systemd (${unit}.scope, MemoryMax)`, ctl, argv: [run, '--user', '--scope', '--quiet', `--unit=${unit}`, '-p', `MemoryMax=${memMb}M`, '-p', 'MemorySwapMax=0', '-p', 'OOMPolicy=stop', '--', ...spec.argv] };
    } else if (rung === 'rlimit-data') {
      const pl = onPath('prlimit');
      if (!pl) misses.push('no prlimit here');
      else return { mb: memMb, by: 'rlimit-data', why: `RLIMIT_DATA on the job${misses.length ? ` (no cgroup: ${misses.join('; ')})` : ''}`, argv: [pl, `--data=${memMb * MiB}:${memMb * MiB}`, '--', ...spec.argv] };
    }
  }
  return { mb: memMb, by: 'none', why: `this host cannot enforce a bound (${misses.join('; ') || 'no rung offered'})` };
}
const bound = measureBound();
const launch = bound.argv || spec.argv;
const boundRec = { mb: bound.mb, by: bound.by, why: bound.why, ...(bound.by === 'cgroup' ? { unit: `${unit}.scope` } : {}) };
let exited = false;

const child = spawn(launch[0], launch.slice(1), {
  cwd: spec.cwd || process.cwd(),
  env: spec.env,
  stdio: [spec.stdinOpen ? 'pipe' : 'ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (b) => writeLog(maskChunk(b)));
child.stderr.on('data', (b) => writeLog(maskChunk(b)));
// the job's LAST WORDS (4 KiB, both streams): under RLIMIT_DATA an allocation the bound refuses ends inside the job, and the
// job says so as it dies — node «Array buffer allocation failed» / «heap out of memory», «Cannot allocate memory» (ENOMEM),
// Python MemoryError, std::bad_alloc, Go «runtime: out of memory», Rust «memory allocation of N bytes failed», a JVM's
// OutOfMemoryError
let tail = Buffer.alloc(0);
const keepTail = (b) => { tail = Buffer.concat([tail, b]); if (tail.length > 4096) tail = tail.subarray(tail.length - 4096); };
child.stdout.on('data', keepTail);
child.stderr.on('data', keepTail);
const ENOMEM_WORDS = /Array buffer allocation failed|JavaScript heap out of memory|Fatal process out of memory|Cannot allocate memory|\bENOMEM\b|\bMemoryError\b|std::bad_alloc|runtime: out of memory|memory allocation of \d+ bytes failed|OutOfMemoryError/i;

// the rung is CONFIRMED on the child itself — its cgroup is the scope and holds the bound, or its RLIMIT_DATA is the bound —
// then written for the engine (bound.json: the card says it while the job runs; exit.json repeats it)
function writeBound() {
  try {
    fs.writeFileSync(path.join(ctlDir, 'bound.json.tmp'), JSON.stringify(boundRec));
    fs.renameSync(path.join(ctlDir, 'bound.json.tmp'), path.join(ctlDir, 'bound.json'));
  } catch { }
}
function confirmBound(tries) {
  if (bound.by === 'none') return writeBound();
  let seen = null;
  try {
    if (bound.by === 'cgroup') {
      const cg = fs.readFileSync(`/proc/${child.pid}/cgroup`, 'utf8').trim().replace(/^0::/, '');
      if (cg.endsWith(`/${unit}.scope`)) seen = fs.readFileSync(path.join('/sys/fs/cgroup', cg, 'memory.max'), 'utf8').trim();
    } else {
      const m = /^Max data size\s+(\S+)/m.exec(fs.readFileSync(`/proc/${child.pid}/limits`, 'utf8'));
      if (m && m[1] === String(bound.mb * MiB)) seen = m[1];
    }
  } catch { }
  if (seen) { boundRec.confirmed = true; boundRec.maxBytes = Number(seen) || 0; return writeBound(); }
  if (tries <= 0 || exited) { boundRec.confirmed = false; return writeBound(); }
  const t = setTimeout(() => confirmBound(tries - 1), 20); t.unref?.();
}
if (child.pid) confirmBound(150);

// THE PRESSURE SAMPLE — the boot's evidence when the WHOLE instance dies (memory.oom.group: we die with the job, no exit.json).
// Only where OUR cgroup has a finite limit (a pod: the container's); written while it sits at ≥ 90 % of it, removed below it.
// The engine's boot reads it (src/job-model.js bootEndCause): full, and this job held most of it ⇒ the run ended `oom`.
const ownCg = (() => {
  if (asked && typeof asked.sampleDir === 'string' && asked.sampleDir[0] === '/') return asked.sampleDir; // the engine's test seam (a fake cgroup dir)
  try { return path.join('/sys/fs/cgroup', (fs.readFileSync('/proc/self/cgroup', 'utf8').split('\n').find((l) => l.startsWith('0::')) || '0::/').slice(3)); } catch { return ''; }
})();
const readNum = (f) => { try { const v = fs.readFileSync(f, 'utf8').trim(); return /^\d+$/.test(v) ? Number(v) : null; } catch { return null; } };
const oomKills = () => { try { const m = /^oom_kill (\d+)$/m.exec(fs.readFileSync(path.join(ownCg, 'memory.events'), 'utf8')); return m ? Number(m[1]) : null; } catch { return null; } };
const oomKillsAtSpawn = ownCg ? oomKills() : null;
const limitBytes = ownCg ? readNum(path.join(ownCg, 'memory.max')) : null;
function treeRss(root) { // the job's process tree (≤ 256 processes), VmRSS summed — /proc only, no exec
  let sum = 0, n = 0;
  const walk = (pid) => {
    if (n++ > 256) return;
    try { const m = /^VmRSS:\s+(\d+) kB/m.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8')); if (m) sum += Number(m[1]) * 1024; } catch { return; }
    let kids = [];
    try { kids = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean); } catch { }
    for (const k of kids) walk(k);
  };
  if (root) walk(root);
  return sum;
}
const pressurePath = path.join(ctlDir, 'pressure.json');
let pressureOn = false, pressureTimer = null;
if (limitBytes && child.pid) {
  pressureTimer = setInterval(() => {
    const used = readNum(path.join(ownCg, 'memory.current'));
    if (used === null) return;
    if (used >= 0.9 * limitBytes) {
      const rec = { at: Date.now(), jobMb: Math.round(treeRss(child.pid) / MiB), usedMb: Math.round(used / MiB), limitMb: Math.round(limitBytes / MiB) };
      try { fs.writeFileSync(pressurePath + '.tmp', JSON.stringify(rec)); fs.renameSync(pressurePath + '.tmp', pressurePath); pressureOn = true; } catch { }
    } else if (pressureOn) { try { fs.unlinkSync(pressurePath); } catch { } pressureOn = false; }
  }, Number(asked && asked.sampleMs) > 0 ? Number(asked.sampleMs) : 2000);
  pressureTimer.unref?.();
}

// THE NAMED END — what ended the job, measured where it can be: the scope's Result (oom-kill; its MemoryPeak tells the bound
// from an OOM of the whole host), the job's last words under RLIMIT_DATA, the kernel's oom_kill count of OUR cgroup for a
// kill from outside. Never a guess: no fact ⇒ no memory cause (the engine judges the exit as before).
const pause = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { } };
function memoryEnd(code, signal) {
  if (bound.by === 'cgroup') {
    let result = '', peak = 0, read = false;
    for (let i = 0; i < 20; i++) { // the unit's facts land with the kill (measured: at once) — bounded at 1 s anyway
      const out = ask(bound.ctl, ['--user', 'show', `${unit}.scope`, '-p', 'Result', '-p', 'ActiveState', '-p', 'MemoryPeak']);
      if (out === null) break;
      read = true;
      const f = Object.fromEntries(out.split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
      result = f.Result || ''; peak = /^\d+$/.test(f.MemoryPeak || '') ? Number(f.MemoryPeak) : 0;
      if (result !== 'success' || !['active', 'deactivating', 'activating'].includes(f.ActiveState)) break;
      pause(50);
    }
    if (result && result !== 'success') ask(bound.ctl, ['--user', 'reset-failed', `${unit}.scope`]); // a failed scope is ours to clear
    const peakMb = peak ? Math.round(peak / MiB) : undefined;
    if (result === 'oom-kill') return peak && peak < 0.9 * bound.mb * MiB ? { cause: 'oom', how: 'the kernel killed it below its bound (the host ran out)', peakMb } : { cause: 'oom-bound', how: 'its scope was killed at MemoryMax (oom-kill)', peakMb };
    if (!read && (signal === 'SIGKILL' || code === 137)) return { cause: 'oom-bound', how: 'SIGKILL with the bound set (its scope could not be read)' };
  } else if (bound.by === 'rlimit-data' && (code !== 0 || signal) && ENOMEM_WORDS.test(tail.toString('utf8'))) {
    return { cause: 'oom-bound', how: 'an allocation past RLIMIT_DATA was refused (its last words)' };
  }
  const after = signal === 'SIGKILL' && oomKillsAtSpawn !== null ? oomKills() : null;
  if (after !== null && after > oomKillsAtSpawn) return { cause: 'oom', how: 'the kernel\'s OOM killer took it (the instance ran out)' };
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

// forward termination to the whole child group; the engine kills OUR group (-pid)
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { child.kill(sig); } catch { } });

child.on('exit', (code, signal) => {
  exited = true;
  if (ansTimer) clearInterval(ansTimer);
  if (pressureTimer) clearInterval(pressureTimer);
  if (pressureOn) { try { fs.unlinkSync(pressurePath); } catch { } } // the run ended under its own wrapper: the exit record speaks
  const memory = { ...boundRec, ...memoryEnd(code, signal) };
  const named = memory.cause === 'oom-bound' ? ` — stopped: used more than ${memory.mb >= 1024 ? Math.round(memory.mb / 102.4) / 10 + ' GB' : memory.mb + ' MB'} (${memory.how})`
    : memory.cause === 'oom' ? ` — killed: out of memory (${memory.how})` : '';
  try { fs.writeSync(logFd, Buffer.from(`\n[job-wrapper] exit code=${code} signal=${signal || ''}${named}\n`)); } catch { }
  writeExit({ code, signal: signal || null, endedAt: Date.now(), memory });
  process.exit(code === null ? 143 : code);
});

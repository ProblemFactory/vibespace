#!/usr/bin/env node
// Background Work job wrapper (STATIC tracked; docs/design-background-work.md §5).
// argv: node job-wrapper.js <ctlDir> <specPath>
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
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const ctlDir = process.argv[2];
const specPath = process.argv[3];
if (!ctlDir) { process.stderr.write('[job-wrapper] refused: no ctl dir on argv\n'); process.exit(2); }
// the spec file is read ONCE, then unlinked — and only a file of OUR ctl dir (a path elsewhere is never read nor removed)
let spec = null, refusal = '';
if (!specPath || path.dirname(path.resolve(specPath)) !== path.resolve(ctlDir)) refusal = 'the spec path names no file of the ctl dir';
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
// a refused spec ENDS the run where the engine reads it: the named line in the job's log, exit.json, a non-zero exit
if (refusal) {
  const line = `[job-wrapper] refused: ${refusal}\n`;
  try { process.stderr.write(line); } catch { }
  try { fs.appendFileSync(logPath, line); } catch { }
  writeExit({ code: 2, signal: null, endedAt: Date.now() });
  process.exit(2);
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

const child = spawn(spec.argv[0], spec.argv.slice(1), {
  cwd: spec.cwd || process.cwd(),
  env: spec.env,
  stdio: [spec.stdinOpen ? 'pipe' : 'ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (b) => writeLog(maskChunk(b)));
child.stderr.on('data', (b) => writeLog(maskChunk(b)));

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
  if (ansTimer) clearInterval(ansTimer);
  try { fs.writeSync(logFd, Buffer.from(`\n[job-wrapper] exit code=${code} signal=${signal || ''}\n`)); } catch { }
  writeExit({ code, signal: signal || null, endedAt: Date.now() });
  process.exit(code === null ? 143 : code);
});

#!/usr/bin/env node
// Background Work job wrapper (STATIC tracked; docs/design-background-work.md §5).
// argv: node job-wrapper.js <ctlDir> <cmdJsonB64>
//   ctlDir holds: pid.json (OUR first act — the identity stamp), current.log,
//   exit.json (written on child exit), answers.jsonl (tailed → child stdin when
//   stdinOpen). cmdJson = {argv, cwd, env, logCapBytes, stdinOpen}
// Runs setsid-detached (the engine spawns us detached); we own the process
// group. First act = atomic pidfile with {pid, starttime, bootId, argvHash} —
// the spawn-then-persist crash window closes because WE write our own stamp.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const ctlDir = process.argv[2];
const spec = JSON.parse(Buffer.from(process.argv[3], 'base64').toString('utf-8'));
const logCap = spec.logCapBytes || 50 * 1024 * 1024;
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
  argvHash: crypto.createHash('sha256').update(JSON.stringify(spec.argv)).digest('hex').slice(0, 16),
  startedAt: Date.now(),
};
fs.mkdirSync(ctlDir, { recursive: true });
fs.writeFileSync(path.join(ctlDir, 'pid.json.tmp'), JSON.stringify(stamp));
fs.renameSync(path.join(ctlDir, 'pid.json.tmp'), path.join(ctlDir, 'pid.json'));

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

const child = spawn(spec.argv[0], spec.argv.slice(1), {
  cwd: spec.cwd || process.cwd(),
  env: spec.env || process.env,
  stdio: [spec.stdinOpen ? 'pipe' : 'ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', writeLog);
child.stderr.on('data', writeLog);

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
  const exit = { code, signal: signal || null, endedAt: Date.now() };
  try {
    fs.writeFileSync(path.join(ctlDir, 'exit.json.tmp'), JSON.stringify(exit));
    fs.renameSync(path.join(ctlDir, 'exit.json.tmp'), path.join(ctlDir, 'exit.json'));
  } catch { }
  process.exit(code === null ? 143 : code);
});

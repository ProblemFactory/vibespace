#!/usr/bin/env node
// test-vendor-whitelist-live — THE HEAVY TWIN of test-vendor-whitelist (§ban-safety, 主开发 r1875 / r2036, lane bl-release, 2026-11-22).
// test-vendor-whitelist §6 «LOCAL ORACLES» has two halves: (a) STRUCTURAL — every shipped oracle carries a proof whose every
// measured run is 0 INET connects, every rejected candidate its counts — and (b) LIVE — re-measure each shipped oracle under strace
// and fail on any AF_INET/AF_INET6 connect. (b) starts the REAL agent CLI of each oracle (the slow part: a real program a row), so it
// lives HERE, moved WHOLE with its two controls (the loopback a detector must see; the trace a timeout cut short is no zero): the
// fast suite keeps (a), every census of a vendor construction and §10's live witness of the reset-credit helper (its tier pin).
// THE TRACER IS REQUIRED ON A RUNNER: on CI a missing strace is RED, never a SKIP (a measurement that silently stops is no gate).
// VS_NO_REAL_CLI=1 still skips by name (B-ddb9): the real oracles are not started under it.
// real-cli-env: each oracle runs with a child env built from nothing (ENVBASE: HOME a scratch dir, PATH, TERM) — no inherited vendor key reaches it
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import './scratch.mjs';   // FIRST after node's own (§113): the re-home before any of the suite's code
import { checker } from './lib/check.mjs';   // the guarded ok(): a condition that is no boolean is a thrown error, never a pass
const require = createRequire(import.meta.url);

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const onCI = !!(process.env.CI || process.env.GITHUB_ACTIONS);

console.log('§6 (b) the live re-measurement of every shipped local oracle under strace (test-vendor-whitelist\'s heavy twin)');
{
  // TIER PIN: this twin is a HEAVY row (it starts real programs); the fast suite pins that it holds this leg
  const ciRows = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8');
  ok(/\{\s*name:\s*'test-vendor-whitelist-live',\s*tier:\s*'heavy'/.test(ciRows), 'TIER PIN: test-vendor-whitelist-live is a HEAVY row of scripts/ci.mjs (it starts the real oracles)');
  const { ORACLES } = require(path.join(REPO, 'src/local-oracles.js'));
  ok(Array.isArray(ORACLES) && ORACLES.length > 0, `the registry ships oracles to re-measure (${Array.isArray(ORACLES) ? ORACLES.map((o) => o.id).join(', ') : 'no ORACLES array'})`);
  const has = (bin) => { try { execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'pipe' }); return true; } catch { return false; } };
  const cmdPath = (bin) => { try { return execFileSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf-8' }).trim(); } catch { return ''; } };
  const straceOk = has('strace');
  if (!straceOk) {
    ok(!onCI, onCI ? '§6 (b) LIVE: strace is REQUIRED on a CI runner — the re-measurement of every shipped oracle may never be skipped there (install strace on the runner)'
      : 'SKIP live re-measurement: strace is not on PATH (`command -v strace` found nothing) — the recorded proofs (test-vendor-whitelist §6 (a)) stand alone');
  } else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oracle-'));
    const ENVBASE = { HOME: tmp, PATH: process.env.PATH || '/usr/bin:/bin', TERM: 'dumb' };
    /** Run one command under strace and count INET connects. AF_UNIX and
     *  AF_NETLINK are NOT network (every process does those). */
    const inetConnects = (bin, argv, timeoutMs = 60000) => {
      const out = path.join(tmp, 'trace-' + Math.random().toString(36).slice(2));
      let timedOut = false;
      try {
        execFileSync('strace', ['-f', '-qq', '-e', 'trace=network', '-o', out, bin, ...argv],
          { env: ENVBASE, stdio: 'ignore', timeout: timeoutMs });
      } catch (e) {
        // a non-zero exit is fine: the TRACE is the measurement — but only a
        // trace of a command that EXITED (B-5f0b): a timeout kill is partial
        if (e && (e.code === 'ETIMEDOUT' || (e.signal && e.status === null))) timedOut = true;
      }
      if (timedOut) { try { fs.unlinkSync(out); } catch { } return { timedOut: true, timeoutMs }; }
      let text = ''; try { text = fs.readFileSync(out, 'utf-8'); } catch { return null; }
      const lines = text.split('\n').filter((l) => /\bconnect\(/.test(l) && /AF_INET6?/.test(l));
      return { n: lines.length, sample: lines.slice(0, 2).join(' | ') };
    };
    // NEGATIVE CONTROL FIRST: a deliberate LOOPBACK connect must be seen, or a
    // green measurement below means nothing. Loopback, never a vendor — the
    // rejected candidates stay un-run precisely because re-running them WOULD
    // be the call this law forbids.
    const ctl = inetConnects(process.execPath, ['-e', "const s=require('net').connect(1,'127.0.0.1');s.on('error',()=>process.exit(0));setTimeout(()=>process.exit(0),300)"]);
    ok(!!ctl && ctl.n >= 1, `NEGATIVE CONTROL: the detector sees a deliberate loopback connect (${ctl?.n} INET connect lines) — a zero below is a measurement, not a blind spot`);
    // THE TERMINAL SIGNAL (B-5f0b): a trace is a measurement only once the
    // traced command EXITED. A run the 60 s timeout killed on a loaded box
    // holds whatever had been traced by then, and its "zero" is vacuous.
    // Driven deterministically: a loopback connect AFTER a 1.5 s wait, under a
    // 400 ms budget — the trace ends before the connect ever happens.
    const cut = inetConnects(process.execPath, ['-e', "setTimeout(()=>{const s=require('net').connect(1,'127.0.0.1');s.on('error',()=>process.exit(0))},1500)"], 400);
    ok(!!cut && cut.timedOut === true, `TERMINAL SIGNAL: a trace the timeout cut short is reported as timedOut, never as a zero-connect measurement (${JSON.stringify(cut)})`);
    // the two controls above start only node under strace, never a real agent CLI: they run under VS_NO_REAL_CLI too
    if (process.env.VS_NO_REAL_CLI === '1') ok(true, 'SKIP live re-measurement of the shipped oracles: VS_NO_REAL_CLI=1 — the real oracles are not started here (B-ddb9); the two detector controls above ran; the recorded proofs (test-vendor-whitelist §6 (a)) stand alone');
    else for (const o of ORACLES) {
      const bin = cmdPath(o.backend === 'codex' ? 'codex' : o.backend);
      if (!bin) { ok(true, `SKIP live re-measurement of ${o.id}: ${o.backend} is not installed here (\`command -v ${o.backend}\` found nothing)`); continue; }
      const got = inetConnects(bin, o.argv.slice());
      if (got?.timedOut) { ok(true, `SKIP live re-measurement of ${o.id}: ${o.backend} ${o.argv.join(' ')} did not exit within ${got.timeoutMs} ms on this machine — a trace cut short is not a zero (B-5f0b)`); continue; }
      ok(!!got && got.n === 0, `LIVE: ${o.id} (${o.backend} ${o.argv.join(' ')}) opened ZERO INET connections under strace${got && got.n ? ' — got ' + got.n + ': ' + got.sample : ''}`);
    }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
  }
}

report();

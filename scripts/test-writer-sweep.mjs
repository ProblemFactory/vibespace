#!/usr/bin/env node
// ONE writer sweep, any machine (CS separation, 2.276.0).
//
// Before this, the sweep existed three times — ssh, dial, and NOT AT ALL for
// local — so a local resume of a conversation still held by a claude in an
// external terminal had the double-writer risk the remote paths had been
// protected from since B-4058. The asymmetry was not a decision; it is what
// happens when `hostId` is a BRANCH instead of a PARAMETER: whoever fixes the
// remote bug never touches the local twin.
//
// This test drives the SAME sweepWriters() against a fake local device and a
// fake remote device and demands identical behaviour — which is only
// meaningful because there is now one implementation to drive.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { writerSweepScript, sweepWriters, parseSwept } = require('../src/writer-sweep.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
const shq = (s) => `'${String(s).replace(/'/g, `'"'"'`)}'`;

// A fake machine: records what it was asked to run and answers with SWEPT lines.
const fakeDevice = (name, { swept = [], fail: shouldFail = false } = {}) => ({
  name, calls: [],
  async runCmd(cmd, args) {
    this.calls.push({ cmd, script: args[1] });
    if (shouldFail) throw new Error('device link lost');
    return { stdout: swept.map((p) => `SWEPT:${p}`).join('\n'), code: 0 };
  },
});

const mkHosts = (dev, { hostRec = null } = {}) => ({
  _dev: dev,
  async deviceBounded() { return dev; },
  get() { if (!hostRec) throw new Error('host not found'); return hostRec; },
  sshArgs() { return ['-p', '22', 'user@h']; },
});

// ── 1. The script itself is machine-agnostic ──
const script = writerSweepScript('rid-abc', shq);
ok(script.includes("RID='rid-abc'"), 'script quotes the conversation id');
ok(script.includes('/proc') && script.includes('lsof'), 'script covers Linux (/proc) AND macOS/BSD (lsof)');
ok(script.includes('.claude/sessions') && script.includes('.vibespace'), 'script sweeps lock files and pipe-session metas');
ok((script.match(/SWEPT:/g) || []).length >= 3, 'every kill leg reports what it terminated');

// ── 2. LOCAL and REMOTE run the IDENTICAL script ──
const localDev = fakeDevice('local', { swept: ['111'] });
const remoteDev = fakeDevice('remote', { swept: ['222'] });
const rLocal = await sweepWriters(mkHosts(localDev), null, 'rid-abc', { shq });
const rRemote = await sweepWriters(mkHosts(remoteDev, { hostRec: { transport: 'ssh' } }), 'h1', 'rid-abc', { shq });
ok(localDev.calls[0].script === remoteDev.calls[0].script, 'local and remote receive a BYTE-IDENTICAL script (one implementation)');
ok(rLocal.via === 'device' && rRemote.via === 'device', 'both run over the device link — no transport-specific path');
ok(rLocal.swept[0] === '111' && rRemote.swept[0] === '222', 'each machine reports its own swept pids');

// ── 3. A dial machine must NOT fall back to ssh (it has none) ──
let threw = null;
try {
  await sweepWriters(mkHosts(fakeDevice('dial', { fail: true }), { hostRec: { transport: 'dial' } }), 'd1', 'rid-abc',
    { shq, execFileAsync: async () => { throw new Error('ssh must never be attempted for dial'); } });
} catch (e) { threw = e; }
ok(threw && /device link lost/.test(threw.message), 'dial failure surfaces the DEVICE error (no bogus ssh fallback)');

// ── 4. An ssh machine keeps its legacy per-op channel as the fallback ──
let sshUsed = false;
const rFallback = await sweepWriters(mkHosts(fakeDevice('ssh', { fail: true }), { hostRec: { transport: 'ssh' } }), 'h2', 'rid-abc',
  { shq, execFileAsync: async () => { sshUsed = true; return 'SWEPT:333\n'; } });
ok(sshUsed && rFallback.via === 'ssh' && rFallback.swept[0] === '333', 'ssh host falls back to the per-op channel when the device is down');

// ── 5. LOCAL has no second channel — a down daemon must throw, not pretend ──
threw = null;
try { await sweepWriters(mkHosts(fakeDevice('local', { fail: true })), null, 'rid-abc', { shq, execFileAsync: async () => 'SWEPT:999' }); }
catch (e) { threw = e; }
ok(threw, 'local failure throws (caller decides to warn) instead of silently claiming a sweep');

// ── 6. Real script execution against a real process on this machine ──
// Proves the script's fd-scan leg actually finds a holder (Linux only).
if (fs.existsSync('/proc/self')) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sweep-'));
  const jsonl = path.join(dir, 'rid-live.jsonl');
  fs.writeFileSync(jsonl, '{}\n');
  const fd = fs.openSync(jsonl, 'r'); // THIS process now holds it open
  const { execFileSync } = await import('node:child_process');
  // ps -o args= for our pid contains 'node', not 'claude' → must NOT be killed
  const out = execFileSync('sh', ['-c', writerSweepScript('rid-live', shq)], { encoding: 'utf8', timeout: 20000, env: { ...process.env, HOME: dir } });
  fs.closeSync(fd);
  ok(parseSwept(out).length === 0, 'a NON-claude holder of the transcript is never killed (cmdline guard)');
  fs.rmSync(dir, { recursive: true, force: true });
} else { console.log('  · /proc absent — skipping the live fd-scan leg'); }

// ── 7. FORK EXCLUSION drift guard (2.284.4, real incident on the dev
// machine): forking a LIVE conversation ran the sweep against the parent's
// own rid and SIGTERMed the parent's claude mid-turn. A fork only READS the
// parent transcript and writes a NEW id's JSONL — no double-writer exists —
// so EVERY sweepWriters call site in the create handler must sit under a
// `!data.fork` gate. This guard fails anyone adding a new site without it.
{
  const src = fs.readFileSync(new URL('../src/ws-handler.js', import.meta.url), 'utf8')
    + fs.readFileSync(new URL('../src/ws-create.js', import.meta.url), 'utf8');
  const lines = src.split('\n');
  let sites = 0, gated = 0;
  lines.forEach((l, i) => {
    if (!/await sweepWriters\(/.test(l)) return;
    sites++;
    const window = lines.slice(Math.max(0, i - 15), i).join('\n');
    if (/!data\.fork/.test(window)) gated++;
  });
  ok(sites >= 3, `found the expected sweep call sites in ws-handler (${sites})`);
  ok(gated === sites, `EVERY sweep call site is gated on !data.fork (${gated}/${sites}) — forking a live session must never kill the parent`);
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// THE RESET-CREDIT HELPER'S CONNECT SET (lane reset-path, 2026-10-01) — a MAINTAINER tool, never
// part of a gate and never run by the server: it measures what the helper's `codex app-server`
// child (src/codex-reset-helper.js) connects to, so the vendor-whitelist row's numbers
// (MEASURED_CONNECTS) are a measurement and not a belief. Re-run it when codex-cli moves.
//
//   node scripts/measure-reset-helper.mjs [--codex <bin>] [--scratch <dir>]
//
// ZERO VENDOR CALLS, by construction: the helper runs ONLY inside an EMPTY network namespace
// (`unshare -rn`, else `sudo -n unshare -n` + setpriv back to this user) with an EMPTY throwaway
// CODEX_HOME and HOME (no login) and every vendor key stripped. strace records every
// connect()/sendto()/sendmsg() and every execve() of the whole tree (`-f`): the calls are
// attributed to the node process that runs the helper (OURS — must be zero internet-family
// calls) or to the codex tree it spawned (the app-server's own startup). An internet-family call
// that SUCCEEDED aborts the run. No network-less runner, or no strace ⇒ nothing runs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
let bin = opt('--codex');
if (!bin) { try { bin = execFileSync('sh', ['-c', 'command -v codex'], { encoding: 'utf8' }).trim(); } catch { } }
if (!bin) { console.error('no codex on PATH (pass --codex <bin>)'); process.exit(2); }
const strace = (() => { try { return execFileSync('sh', ['-c', 'command -v strace'], { encoding: 'utf8' }).trim(); } catch { return ''; } })();
if (!strace) { console.error('no strace on PATH — a measurement without a tracer is not one'); process.exit(2); }
const scratch = opt('--scratch') || fs.mkdtempSync(path.join(os.tmpdir(), 'vs-reset-helper-'));
const HOME_DIR = path.join(scratch, 'home'), CODEX_HOME = path.join(scratch, 'codex-home');
for (const d of [scratch, HOME_DIR, CODEX_HOME]) fs.mkdirSync(d, { recursive: true });
const VENDOR_KEYS = /^(OPENAI_|CODEX_API_KEY|ANTHROPIC_|AZURE_OPENAI|CHATGPT_|CLAUDE_)/;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !VENDOR_KEYS.test(k)));
Object.assign(env, { HOME: HOME_DIR, CODEX_HOME, RUST_LOG: 'error' });

function noNetRunner() {
  if (spawnSync('unshare', ['-rn', 'true']).status === 0) return ['unshare', '-rn', '--'];
  const uid = String(process.getuid()), gid = String(process.getgid());
  if (spawnSync('sudo', ['-n', 'unshare', '-n', '--', 'setpriv', `--reuid=${uid}`, `--regid=${gid}`, '--init-groups', '--', 'true']).status === 0) {
    return ['sudo', '-n', 'unshare', '-n', '--', 'setpriv', `--reuid=${uid}`, `--regid=${gid}`, '--init-groups', '--', 'env', ...Object.entries(env).map(([k, v]) => `${k}=${v}`)];
  }
  return null;
}
const NONET = noNetRunner();
if (!NONET) { console.error('no network-less runner here (unshare -rn refused, no passwordless sudo) — the helper is never run with network'); process.exit(2); }
// the network namespace must really be empty: no route out (the measurement's precondition, asserted)
{
  const probe = spawnSync(NONET[0], [...NONET.slice(1), process.execPath, '-e', "const s=require('net').connect(443,'1.1.1.1');s.on('connect',()=>{console.log('CONNECTED');process.exit(0)});s.on('error',(e)=>{console.log(e.code);process.exit(0)})"], { encoding: 'utf8', env, timeout: 10000 });
  if (/CONNECTED/.test(probe.stdout || '')) { console.error('ABORT: the namespace has a route out — refusing to start codex'); process.exit(1); }
}

const DRIVER = path.join(scratch, 'driver.cjs');
const KEY = crypto.randomUUID();
fs.writeFileSync(DRIVER, `'use strict';
const h = require(${JSON.stringify(path.join(REPO, 'src/codex-reset-helper.js'))});
let sentAt = 0;
h.consumeResetCreditViaAppServer({ idempotencyKey: ${JSON.stringify(KEY)}, env: process.env, cwd: process.env.CODEX_HOME, codexCmd: ${JSON.stringify(bin)}, onSent: () => { sentAt = Date.now(); }, pressedBy: 'person' })
  .then((r) => { process.stdout.write(JSON.stringify({ ...r, sentSeen: !!sentAt }) + '\\n'); setTimeout(() => process.exit(0), 2500); });
`);
const traceLog = path.join(scratch, 'strace.log');
const [c, ...a] = [...NONET, strace, '-f', '-qq', '-s', '256', '-e', 'trace=connect,sendto,sendmsg,execve', '-o', traceLog, process.execPath, DRIVER];
const run = spawnSync(c, a, { env, cwd: scratch, encoding: 'utf8', timeout: 90000 });
let result = null; try { result = JSON.parse((run.stdout || '').trim().split('\n').pop()); } catch { }
if (!result) { console.error('the driver produced no result', run.status, (run.stderr || '').slice(-600)); process.exit(1); }

// ── attribute every network call ──
const lines = fs.readFileSync(traceLog, 'utf8').split('\n').filter(Boolean);
const pidOf = (l) => Number((l.match(/^(\d+)\s/) || [])[1]) || 0;
const root = pidOf(lines[0] || '');
const codexPids = new Set();
for (const l of lines) if (/execve\(/.test(l) && !/= -1/.test(l) && pidOf(l) !== root && /codex/.test(l)) codexPids.add(pidOf(l));
// every pid that is not the driver itself belongs to the tree it spawned (the codex launcher and its native child)
const calls = [];
for (const l of lines) {
  if (!/\b(connect|sendto|sendmsg)\(/.test(l)) continue;
  const fam = (l.match(/sa_family=(AF_\w+)/) || [])[1] || (/AF_UNIX/.test(l) ? 'AF_UNIX' : null);
  if (!fam) continue;
  const port = Number((l.match(/sin6?_port=htons\((\d+)\)/) || [])[1]) || null;
  const addr = (l.match(/inet_addr\("([^"]+)"\)/) || l.match(/inet_pton\(AF_INET6, "([^"]+)"/) || [])[1] || null;
  const ok = !/= -1/.test(l);
  calls.push({ pid: pidOf(l), ours: pidOf(l) === root, fam, port, addr, ok, err: (l.match(/= -1 (\w+)/) || [])[1] || null });
}
const inet = calls.filter((x) => /AF_INET/.test(x.fam));
const summary = {
  tool: 'strace -f -qq -s 256 -e trace=connect,sendto,sendmsg,execve', date: new Date().toISOString().slice(0, 10),
  version: (spawnSync(NONET[0], [...NONET.slice(1), bin, '--version'], { encoding: 'utf8', env }).stdout || '').trim(),
  runner: NONET[0] === 'sudo' ? 'sudo -n unshare -n + setpriv (an empty network namespace, back to this user)' : 'unshare -rn',
  ours: { inet: inet.filter((x) => x.ours).length, all: calls.filter((x) => x.ours && x.fam !== 'AF_UNIX').length },
  appServer: {
    inet: inet.filter((x) => !x.ours).length, inetOk: inet.filter((x) => x.ok).length,
    dns: inet.filter((x) => !x.ours && x.port === 53).length, https: inet.filter((x) => !x.ours && x.port === 443).length,
    other: inet.filter((x) => !x.ours && x.port !== 53 && x.port !== 443).map((x) => `${x.addr}:${x.port}`),
    errors: [...new Set(inet.filter((x) => !x.ours).map((x) => x.err))],
    unix: calls.filter((x) => !x.ours && x.fam === 'AF_UNIX').length,
  },
  codexPids: codexPids.size,
  // what the app-server STARTED (its own startup work — e.g. the plugin marketplace's `git ls-remote`)
  execs: [...new Set(lines.filter((l) => /execve\(/.test(l) && !/= -1/.test(l) && pidOf(l) !== root).map((l) => { const m = l.match(/execve\("([^"]+)", \[([^\]]*)\]/); if (!m) return null; const args = [...m[2].matchAll(/"([^"]*)"/g)].map((x) => x[1]); return [path.basename(m[1]), ...args.slice(1, 4)].join(' ').slice(0, 160); }).filter(Boolean))],
  helper: { sent: result.sent, sentSeen: result.sentSeen, answered: result.answered, outcome: result.outcome, error: result.error, readError: result.readError, stage: result.stage, ms: result.ms },
};
if (summary.appServer.inetOk > 0) { console.error(`ABORT: ${summary.appServer.inetOk} internet-family call(s) SUCCEEDED inside the namespace`); process.exit(1); }
console.log(JSON.stringify(summary, null, 1));

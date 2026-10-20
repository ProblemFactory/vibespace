#!/usr/bin/env node
// THE /usage CAPTURE (lane antigravity-harness, commit 3) — run BY HAND, once, on a SIGNED-IN Antigravity login, to pin
// the shape of agy's own quota answer (`agy -p /usage --output-format json`, which its release notes say answers
// "without starting an agent turn, spending quota, or leaving a conversation behind"). The answer is judged by
// src/harnesses/antigravity-usage.js — a sign of a turn (num_turns / tokens / a conversation) is the STOP verdict
// (exit 3: the reading door must stay shut) — and written, REDACTED, as the fixture the parser is built on.
//   node scripts/agy-usage-capture.mjs [--account <data/agy-subs/<id> dir>] [--agy <path>] [--out <file>]
// --account runs it on a named account's HOME root (HOME = the root, the session bus disabled — exactly the spawn
// env); without it, the machine's own login. stdin is a closed PIPE (a character device makes an unauthenticated agy
// wait 60 s for a pasted code — measured), 30 s timeout. Exit: 0 a capture written · 2 not signed in / an error /
// no answer (nothing written) · 3 TURN-STARTED (written, marked — the evidence) · 1 usage.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const U = require(path.join(REPO, 'src/harnesses/antigravity-usage.js'));
const H = require(path.join(REPO, 'src/harnesses/antigravity.js'));

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
if (argv.includes('--help')) { console.log('usage: node scripts/agy-usage-capture.mjs [--account <dir>] [--agy <path>] [--out <file>]'); process.exit(1); }
const agyRaw = opt('--agy') || process.env.ANTIGRAVITY_CMD || 'agy';
const agy = agyRaw.includes('/') ? path.resolve(agyRaw) : agyRaw; // the run's cwd is a scratch dir: a relative path is pinned first
const account = opt('--account');
const env = { ...process.env };
for (const k of H.creds.keyEnvVars) delete env[k]; // an ambient key would answer for ANOTHER login (the agent door's rule)
if (account) {
  if (!fs.existsSync(path.join(account, H.ACCOUNT_MARK))) { console.error(`${account} is not an Antigravity account root (no ${H.ACCOUNT_MARK})`); process.exit(1); }
  Object.assign(env, H.creds.spawnEnv(account));
}
let version = null;
try { version = String(execFileSync(agy, ['--version'], { env, timeout: 10000 })).trim(); } catch { version = null; }
const cwd = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'agy-usage-cwd-'));
const child = spawn(agy, U.USAGE_ARGV, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
child.stdin.end();
let stdout = '', stderr = '';
child.stdout.on('data', (d) => { if (stdout.length < 262144) stdout += d; });
child.stderr.on('data', (d) => { if (stderr.length < 65536) stderr += d; });
const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { } }, 30000);
let spawnError = null;
child.on('error', (e) => { spawnError = e; });
const code = await new Promise((res) => child.on('close', (c, sig) => res(sig ? `signal ${sig}` : c)));
if (spawnError) { console.error(`could not run ${agy}: ${spawnError.message}`); try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { } process.exit(2); }
clearTimeout(timer);
try { fs.rmSync(cwd, { recursive: true, force: true }); } catch { }
const j = U.judgeUsageAnswer({ code, stdout, stderr });
console.log(`agy ${version || '(version unknown)'} — ${U.USAGE_ARGV.join(' ')} → exit ${code}: ${j.verdict} — ${j.why || ''}`);
if (j.verdict === 'auth-required' || j.verdict === 'error' || j.verdict === 'no-answer') process.exit(2);
const out = opt('--out') || path.join(REPO, 'scripts', 'fixtures', `antigravity-usage-${version || 'unknown'}.json`);
const capture = U.redactCapture({
  provenance: 'signed-in capture (scripts/agy-usage-capture.mjs)', version, argv: U.USAGE_ARGV, login: account ? 'named account (HOME root)' : 'machine login',
  capturedAt: new Date().toISOString(), exit: code, verdict: j.verdict, why: j.why || null,
  envelope: j.envelope, stdoutHead: j.envelope ? null : stdout.slice(0, 4000), stderrHead: stderr.slice(0, 2000),
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(capture, null, 2) + '\n');
console.log(`written (redacted): ${out}`);
process.exit(j.verdict === 'turn-started' ? 3 : 0);

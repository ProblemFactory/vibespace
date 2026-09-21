#!/usr/bin/env node
// THE §7.2.1 MEASUREMENT (docs/design-agent-browser-v2.md, agent browser P4):
// does CloakBrowser phone home, and how much? Modelled verbatim on the
// src/local-oracles.js measurement — `env -i HOME=<empty dir> PATH=… strace -f
// -qq -e trace=network`, every `connect(` with AF_INET/AF_INET6 counted, a DNS
// `connect(…:53)` counted as INET (resolving a vendor host is already the
// decision to talk to it). Four runs, as the design names them: first launch
// (the ~200 MB download is EXPECTED to connect — the number is the point), a
// second launch from cache, a launch with a license key present, and a
// 10-minute idle browser.
//
// This script NEVER installs or downloads anything itself. It measures the
// binary that is already on the machine (the `cloakbrowser` npm package's
// CLI, or a `cloakserve` on PATH); when neither exists it prints the REFUSAL
// record by name (`binary_absent`) — which is exactly what
// src/browser-profiles.CLOAK_EGRESS_PROOF carries today. Installing the pinned
// package is a USER action that comes AFTER reading this record, never a side
// effect of running it (§7.2's ordering: measure first, then install).
//
// Usage:  node scripts/measure-cloak-egress.mjs [--idle-ms 600000] [--license-key cb_…]
// Output: one JSON proof record on stdout, ready to paste into
//         src/browser-profiles.js (CLOAK_EGRESS_PROOF). `version` names the
//         binary the counts describe; an unpinned auto-download silently
//         invalidates the record.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../src/browser-profiles.js');

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
const IDLE_MS = Number(flag('--idle-ms', 600000)) || 600000;
const LICENSE = flag('--license-key', process.env.CLOAKBROWSER_LICENSE_KEY || '');
const today = new Date().toISOString().slice(0, 10);

function which(bin) { const r = spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; }
const strace = which('strace');
const cloakserve = which('cloakserve');
const cloakbrowser = which('cloakbrowser');
let pkg = null;
try { pkg = require.resolve('cloakbrowser/package.json'); } catch { pkg = null; }

const refusal = (why, detail) => ({
  provider: 'cloak', tool: 'strace -f -qq -e trace=network', date: today, version: null,
  status: 'refused', refusal: why, detail, blocks: 'cloak.wired', runs: [], expectedRuns: B.CLOAK_EGRESS_RUNS,
});

if (!cloakserve && !cloakbrowser && !pkg) {
  console.log(JSON.stringify(refusal('binary_absent', 'neither `cloakbrowser` nor `cloakserve` is on PATH and the `cloakbrowser` package is not resolvable — nothing was downloaded; install the PINNED package yourself after reading this record, then re-run'), null, 2));
  process.exit(0);
}
if (!strace) {
  console.log(JSON.stringify(refusal('strace_absent', 'strace is not installed on the measuring machine — the count cannot be taken (the design refuses a record with no counts)'), null, 2));
  process.exit(0);
}

// ── the counted run ────────────────────────────────────────────────────────
const bin = cloakserve || cloakbrowser || path.join(path.dirname(pkg), 'bin', 'cloakbrowser');
const version = (() => { const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 20000, env: { PATH: process.env.PATH, HOME: os.tmpdir() } }); return ((r.stdout || '') + (r.stderr || '')).trim().split('\n')[0] || (pkg ? 'cloakbrowser ' + require(pkg).version : 'unknown'); })();

function countInet(straceFile) {
  let n = 0, unix = 0; const hosts = new Set();
  const text = fs.readFileSync(straceFile, 'utf8');
  for (const line of text.split('\n')) {
    if (!/connect\(/.test(line)) continue;
    if (/AF_INET6?/.test(line)) { n++; const m = /inet_addr\("([^"]+)"\)|sin6_addr=inet_pton\([^,]+,\s*"([^"]+)"/.exec(line); const port = /sin6?_port=htons\((\d+)\)/.exec(line); if (m) hosts.add(`${m[1] || m[2]}:${port ? port[1] : '?'}`); }
    else if (/AF_UNIX/.test(line)) unix++;
  }
  return { inetConnects: n, unixConnects: unix, hosts: [...hosts].slice(0, 20) };
}
async function measured(what, argv, { env = {}, killAfterMs = 120000 } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cloak-measure-'));
  const out = path.join(home, 'out.strace');
  const child = spawn('env', ['-i', `HOME=${home}`, `PATH=${process.env.PATH}`, 'TERM=dumb', ...Object.entries(env).map(([k, v]) => `${k}=${v}`), strace, '-f', '-qq', '-e', 'trace=network', '-o', out, bin, ...argv], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { if (log.length < 8000) log += d; });
  child.stderr.on('data', (d) => { if (log.length < 8000) log += d; });
  const exit = await new Promise((resolve) => { const t = setTimeout(() => { try { child.kill('SIGTERM'); } catch { /* gone */ } }, killAfterMs); child.on('exit', (code, sig) => { clearTimeout(t); resolve({ code, sig }); }); });
  const c = fs.existsSync(out) ? countInet(out) : { inetConnects: -1, unixConnects: -1, hosts: [] };
  return { what, ...c, exit, note: log.trim().split('\n').slice(-3).join(' | ').slice(0, 300) };
}

const runs = [];
const launch = ['--headless', 'about:blank'];
runs.push(await measured(B.CLOAK_EGRESS_RUNS[0], launch, { killAfterMs: 10 * 60 * 1000 }));
runs.push(await measured(B.CLOAK_EGRESS_RUNS[1], launch, { killAfterMs: 120000 }));
runs.push(LICENSE ? await measured(B.CLOAK_EGRESS_RUNS[2], launch, { env: { CLOAKBROWSER_LICENSE_KEY: LICENSE }, killAfterMs: 120000 }) : { what: B.CLOAK_EGRESS_RUNS[2], inetConnects: -1, unixConnects: -1, hosts: [], note: 'skipped: no --license-key given (the free tier has no key to present)' });
runs.push(await measured(B.CLOAK_EGRESS_RUNS[3], launch, { killAfterMs: IDLE_MS }));

const record = { provider: 'cloak', tool: 'strace -f -qq -e trace=network', date: today, version, status: 'measured', binary: bin, runs, expectedRuns: B.CLOAK_EGRESS_RUNS };
const v = B.proofVerdict(record);
if (!v.ok) { record.status = 'refused'; record.refusal = 'incomplete'; record.detail = v.error; record.blocks = 'cloak.wired'; record.runs = []; record.attempted = runs; }
console.log(JSON.stringify(record, null, 2));

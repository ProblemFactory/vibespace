#!/usr/bin/env node
// THE CODEX APP-SERVER PROTOCOL MEASUREMENT (lane-codex-0159, 2026-09-30) — a
// MAINTAINER tool, never part of a gate and never run by the server: it writes
// scripts/fixtures/codex-app-server/<version>-methods.json, the table
// scripts/test-codex-protocol-drift.mjs judges the wrapper against. Run it
// when that gate goes red on a codex-cli update, read the diff, fix the wrapper
// where the census names a method, commit the new table WITH the fix.
//
//   node scripts/measure-codex-protocol.mjs [--codex <bin>] [--scratch <dir>] [--no-live]
//
// ZERO VENDOR CALLS, by construction (test-vendor-whitelist):
//  ① the schema half is LAUNCH-FREE — `codex app-server generate-json-schema
//    --experimental --out <dir>` writes the protocol's own JSON Schema to disk;
//  ② the live half (each wrapper method sent with `{}` to read the CLI's own
//    "missing field" words) runs ONLY inside an EMPTY network namespace
//    (`unshare -rn`, else `sudo -n unshare -n` + setpriv back to this user),
//    with an EMPTY throwaway CODEX_HOME (no login) and every vendor key
//    stripped; when strace is present every connect()/sendto() is recorded and
//    an internet-family call that SUCCEEDED aborts the run before anything is
//    written. No runner without network ⇒ the live half is SKIPPED by name.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tableFromSchemaDir, wrapperRequestSites, TABLE_DIR, WRAPPER } from './codex-protocol-census.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const live = !argv.includes('--no-live');
let bin = opt('--codex');
if (!bin) { try { bin = execFileSync('sh', ['-c', 'command -v codex'], { encoding: 'utf8' }).trim(); } catch { } }
if (!bin) { console.error('no codex on PATH (pass --codex <bin>)'); process.exit(2); }
const scratch = opt('--scratch') || fs.mkdtempSync(path.join(os.tmpdir(), 'vs-codex-proto-'));
fs.mkdirSync(scratch, { recursive: true });
const HOME_DIR = path.join(scratch, 'home'), CODEX_HOME = path.join(scratch, 'codex-home'), SCHEMA = path.join(scratch, 'schema');
for (const d of [HOME_DIR, CODEX_HOME, SCHEMA]) fs.mkdirSync(d, { recursive: true });
const VENDOR_KEYS = /^(OPENAI_|CODEX_API_KEY|ANTHROPIC_|AZURE_OPENAI|CHATGPT_)/;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !VENDOR_KEYS.test(k)));
Object.assign(env, { HOME: HOME_DIR, CODEX_HOME, RUST_LOG: 'error' });

// the network-less runner: unshare -rn, else sudo -n unshare -n + setpriv back
function noNetRunner() {
  if (spawnSync('unshare', ['-rn', 'true']).status === 0) return ['unshare', '-rn', '--'];
  const uid = String(process.getuid()), gid = String(process.getgid());
  if (spawnSync('sudo', ['-n', 'unshare', '-n', '--', 'setpriv', `--reuid=${uid}`, `--regid=${gid}`, '--init-groups', '--', 'true']).status === 0) {
    return ['sudo', '-n', 'unshare', '-n', '--', 'setpriv', `--reuid=${uid}`, `--regid=${gid}`, '--init-groups', '--', 'env', ...Object.entries(env).map(([k, v]) => `${k}=${v}`)];
  }
  return null;
}
const NONET = noNetRunner();
const run = (args, o = {}) => { const [c, ...a] = NONET ? [...NONET, bin, ...args] : [bin, ...args]; return execFileSync(c, a, { encoding: 'utf8', env, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'], ...o }); };

const version = (run(['--version']).match(/(\d+\.\d+\.\d+)/) || [])[1];
if (!version) { console.error('could not read the codex version'); process.exit(2); }
run(['app-server', 'generate-json-schema', '--experimental', '--out', SCHEMA]);
const t = tableFromSchemaDir(SCHEMA);
const src = fs.readFileSync(path.join(REPO, WRAPPER), 'utf8');
const wrapperMethods = [...new Set(wrapperRequestSites(src).flatMap((s) => s.methods))].sort();
console.log(`codex-cli ${version}: ${Object.keys(t.clientRequests).length} client requests, ${t.serverNotifications.length} server notifications; the wrapper calls ${wrapperMethods.length} methods`);

// ── the live half: each wrapper method with `{}` inside the empty netns ──
let liveFacts = { ran: false, why: null }, errorsOnEmpty = {}, unknownMethodError = null;
if (!live) liveFacts.why = 'skipped (--no-live)';
else if (!NONET) liveFacts.why = 'skipped: no network-less runner here (unshare -rn refused, no passwordless sudo) — the live half never runs with network';
else {
  const straceBin = spawnSync('sh', ['-c', 'command -v strace']).stdout?.toString().trim();
  const traceLog = path.join(scratch, 'strace.log');
  const inner = straceBin ? [straceBin, '-f', '-qq', '-e', 'trace=connect,sendto,sendmsg', '-o', traceLog, bin, 'app-server'] : [bin, 'app-server'];
  const [c, ...a] = [...NONET, ...inner];
  const child = spawn(c, a, { env, cwd: scratch, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = ''; const waiters = new Map(); let nextId = 1;
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); let m; try { m = JSON.parse(l); } catch { continue; } if (m.id != null && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } } });
  child.stderr.on('data', () => { });
  const ask = (method, params, ms = 8000) => new Promise((res) => { const id = nextId++; const t0 = setTimeout(() => { waiters.delete(id); res({ timeout: true }); }, ms); waiters.set(id, (m) => { clearTimeout(t0); res(m); }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n'); });
  const init = await ask('initialize', { clientInfo: { name: 'vibespace-measure', version: '0' }, capabilities: { experimentalApi: true } }, 30000);
  if (!init.result) { console.error('initialize failed', JSON.stringify(init).slice(0, 300)); child.kill('SIGKILL'); process.exit(1); }
  child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  for (const m of wrapperMethods) {
    if (m === 'initialize') continue;
    const r = await ask(m, {});
    errorsOnEmpty[m] = r.timeout ? { timeout: true } : r.error ? { code: r.error.code, message: String(r.error.message).slice(0, 300) } : { ok: true, resultKeys: Object.keys(r.result || {}).sort() };
  }
  const u = await ask('vibespace/noSuchMethod', {});
  unknownMethodError = u.error ? { code: u.error.code, message: String(u.error.message).slice(0, 300) } : null;
  child.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 500)); try { child.kill('SIGKILL'); } catch { }
  let net = { traced: !!straceBin, inet: 0, inetOk: 0, unix: 0 };
  if (straceBin && fs.existsSync(traceLog)) {
    for (const l of fs.readFileSync(traceLog, 'utf8').split('\n')) {
      if (!/connect\(|sendto\(|sendmsg\(/.test(l)) continue;
      if (/AF_UNIX|sa_family=AF_LOCAL/.test(l)) { net.unix++; continue; }
      if (/AF_INET6?|AF_NETLINK/.test(l) && /AF_INET/.test(l)) { net.inet++; if (/= 0$|= \d+$/.test(l.trim()) && !/= -1/.test(l)) net.inetOk++; }
    }
  }
  if (net.inetOk > 0) { console.error(`ABORT: ${net.inetOk} internet-family call(s) SUCCEEDED inside the namespace — nothing written`); process.exit(1); }
  liveFacts = { ran: true, runner: NONET[0] === 'sudo' ? 'sudo -n unshare -n + setpriv (an empty network namespace, back to this user)' : 'unshare -rn', network: net };
}

const out = {
  _note: 'MEASURED by scripts/measure-codex-protocol.mjs — never edited by hand. `clientRequests` = every request the CLI serves (required + known params fields, from its own JSON Schema); `wrapperMethods` = the requests data/bin/codex-chat-wrapper.js makes, with the CLI\'s own answer to `{}` when the live half ran. scripts/test-codex-protocol-drift.mjs judges the wrapper against the NEWEST table and fails when the installed codex is a version no table measured.',
  codexVersion: version,
  measuredAt: new Date().toISOString().slice(0, 10),
  how: {
    schema: 'codex app-server generate-json-schema --experimental --out DIR (launch-free; empty CODEX_HOME, no login)',
    live: liveFacts.ran ? `codex app-server under ${liveFacts.runner}, empty CODEX_HOME, vendor keys stripped; initialize, then each wrapper method with params {}` : liveFacts.why,
    network: liveFacts.network || null,
  },
  unknownMethodError,
  wrapperMethods: Object.fromEntries(wrapperMethods.map((m) => [m, { ...(t.clientRequests[m] || { missing: true }), errorOnEmpty: errorsOnEmpty[m] || null }])),
  resetCreditOutcomes: t.resetCreditOutcomes,
  clientNotifications: t.clientNotifications,
  serverRequests: t.serverRequests,
  serverNotifications: t.serverNotifications,
  clientRequests: Object.fromEntries(Object.entries(t.clientRequests).map(([m, r]) => [m, { required: r.required, properties: r.properties }])),
};
const dir = path.join(REPO, TABLE_DIR); fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${version}-methods.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${path.relative(REPO, file)}${liveFacts.ran ? ` (live: ${Object.keys(errorsOnEmpty).length} methods probed; inet calls ${liveFacts.network.inet}, succeeded ${liveFacts.network.inetOk})` : ` (${liveFacts.why})`}`);

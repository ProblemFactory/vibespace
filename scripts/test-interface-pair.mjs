#!/usr/bin/env node
// THE PAIR — THE INTERFACE IN FRONT OF TODAY'S HUB, AS TWO PROCESSES (the separation, M1 — lane B, piece B2b; HEAVY: it
// boots two hubs and an interface). A throwaway worktree of this tree; the test holds both start pipes (lane readings'
// supervisor is its pieces 5 and 6 — until then a suite starts the pair with the pipes itself, the supervisor's own
// mechanism, never a second road):
//   the interface: node src/interface/main.js, fd 3 ← {op:'start', party:'interface', secret, link}, {op:'admit', party:'hub', digest}
//   the hub:       node server.js,             fd 3 ← {op:'start', party:'hub', secret, link}   (PIPED: it joins, never listens)
//   the oracle:    node server.js on its own port with NO start pipe (PLAIN: today's road)
// Checked:
//   ① NEVER TWO OWNERS OF THE PORT (主开发's law 2): the piped hub's OWN record of what it bound — its «[hub-port] {…}» line —
//     says {form:'piped', listened:false}; the oracle's says {form:'plain', listened:true}; the interface answers the port.
//   ② T1's BRANCH TABLE through the interface's port, answered as the plain hub answers it: GET / and /index.html, an API
//     read, a POST, the page socket's upgrade (/ws), /proxy/, /api/vnc, a desktop stream, the browser stream, /svc/ — and
//     TLS when the oracle serves it (a throwaway pair through VIBESPACE_TLS_CERT / _KEY: the piped hub pushes it).
//   ③ THE START PIPE'S SECRETS travel only on fd 3: neither process's output, argv or environment carries one.
// Requires a fresh `npm run build` (the page and its bundle). Run: node scripts/test-interface-pair.mjs
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, endRootedProcesses, vncEnv } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + JSON.stringify(e).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms) => { const t = Date.now(); while (!(await f())) { if (Date.now() - t > ms) return false; await sleep(100); } return true; };

const [IFACE_PORT, PLAIN_PORT] = await freePorts(2);
const VNC_PLAIN = await vncEnv();   // each hub its own per-run singleton-Desktop names (test-architecture §57)
const VNC_PAIR = await vncEnv();
// two trees and two homes: the pair's hub and the oracle never share a data dir or a HOME
const wt = scratch('iface-pair-wt'), wtPlain = scratch('iface-pair-plain');
const fakeHome = scratchHome('iface-pair-home', fs), plainHome = scratchHome('iface-pair-plain-home', fs);
for (const w of [wt, wtPlain]) {
  try { execSync(`git worktree remove --force ${w}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  execSync(`git worktree add --detach ${w} HEAD`, { cwd: repo, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${w}/${f} && cp -r ${repo}/${f} ${w}/${f}`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(w, 'node_modules'));
  fs.mkdirSync(path.join(w, 'data'), { recursive: true });
}
const stub = `${wt}-claude-stub`;
fs.writeFileSync(stub, '#!/bin/sh\nfor a in "$@"; do case "$a" in --version) echo "2.1.288 (Claude Code) stub"; exit 0;; esac; done\nexit 0\n', { mode: 0o755 });
const tlsDir = path.join(wt, 'tls-pair'); fs.mkdirSync(tlsDir, { recursive: true });
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(tlsDir, 'key.pem'), '-out', path.join(tlsDir, 'cert.pem'), '-days', '2', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const hubEnv = (home) => ({ PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, CLAUDE_CMD: stub, VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1', HOST: '127.0.0.1',
  VIBESPACE_TLS_CERT: path.join(tlsDir, 'cert.pem'), VIBESPACE_TLS_KEY: path.join(tlsDir, 'key.pem') });
const link = path.join(path.dirname(wt), `vs-pair-${process.pid}.sock`);
const kids = [], outs = new Map();
const keep = (name, child) => { kids.push(child); outs.set(name, ''); for (const s of [child.stdout, child.stderr]) s && s.on('data', (b) => outs.set(name, outs.get(name) + b)); return child; };
const cleanup = () => {
  for (const k of kids) { try { k.kill('SIGKILL'); } catch { } }
  for (const r of [wt, wtPlain, fakeHome, plainHome]) { try { endRootedProcesses(r); } catch { } }
  for (const w of [wt, wtPlain]) { try { execSync(`git worktree remove --force ${w}`, { cwd: repo, stdio: 'ignore' }); } catch { } }
  for (const d of [fakeHome, plainHome, stub, link]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

// THE ORACLE: today's road, no start pipe
keep('plain', spawn(process.execPath, ['server.js'], { cwd: wtPlain, env: { ...hubEnv(plainHome), ...VNC_PLAIN, PORT: String(PLAIN_PORT) }, stdio: ['ignore', 'pipe', 'pipe'] }));
// THE PAIR: the interface first (its admit for the hub written BEFORE the hub starts), then the hub
const ifaceSecret = crypto.randomBytes(32).toString('hex'), hubSecret = crypto.randomBytes(32).toString('hex');
const hubDigest = crypto.createHash('sha256').update(hubSecret).digest('hex');
const iface = keep('interface', spawn(process.execPath, [path.join(wt, 'src/interface/main.js')], { cwd: wt, env: { PATH: process.env.PATH, PORT: String(IFACE_PORT), HOST: '127.0.0.1', VIBESPACE_START_FD: '3' }, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] }));   // the B2b cure: the start NAMES its pipe
iface.stdio[3].write(JSON.stringify({ op: 'start', party: 'interface', secret: ifaceSecret, link }) + '\n' + JSON.stringify({ op: 'admit', party: 'hub', digest: hubDigest }) + '\n');
await until(() => /listening on/.test(outs.get('interface')), 20000);
const hub = keep('piped', spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...hubEnv(fakeHome), ...VNC_PAIR, PORT: String(IFACE_PORT), VIBESPACE_START_FD: '3' }, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] }));
hub.stdio[3].on('error', () => { }); hub.stdio[3].write(JSON.stringify({ op: 'start', party: 'hub', secret: hubSecret, link }) + '\n');   // the hub reads this ONE line at its line 5 and closes its end (the B2b cure 2)

const record = (name) => { const m = [...outs.get(name).matchAll(/\[hub-port\] (\{[^\n]*\})/g)].pop(); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } };
const ready = (port, secure = false) => new Promise((resolve) => { const q = (secure ? https : http).get({ host: '127.0.0.1', port, path: '/api/home', agent: false, rejectUnauthorized: false, timeout: 3000 }, (r) => { r.resume(); resolve(r.statusCode > 0); }); q.on('error', () => resolve(false)); q.on('timeout', () => { q.destroy(); resolve(false); }); });
const upPlain = await until(() => ready(PLAIN_PORT), 90000), upPair = await until(() => ready(IFACE_PORT), 90000);
check('the oracle (plain) and the pair (interface + piped hub) both answer', upPlain && upPair, { upPlain, upPair, iface: outs.get('interface').slice(-400), piped: outs.get('piped').slice(-400) });

console.log('① NEVER TWO OWNERS OF THE PORT — read off the hub\'s own record');
{
  const piped = record('piped'), plain = record('plain');
  check(`the piped hub's own record: ${JSON.stringify(piped)}; the oracle's: ${JSON.stringify(plain)}`, piped && piped.form === 'piped' && piped.listened === false && plain && plain.form === 'plain' && plain.listened === true && plain.port === PLAIN_PORT, { piped, plain });
}

console.log('② T1\'s BRANCH TABLE through the interface, answered as the plain hub answers it');
const ask = (port, { method = 'GET', p = '/', secure = false, headers = {}, body = null } = {}) => new Promise((resolve) => {
  const q = (secure ? https : http).request({ host: '127.0.0.1', port, path: p, method, headers, agent: false, rejectUnauthorized: false, timeout: 8000 }, (r) => { let n = 0; r.on('data', (c) => { n += c.length; }); r.on('end', () => resolve({ status: r.statusCode, type: String(r.headers['content-type'] || '').split(';')[0], bytes: n > 0 })); });
  q.on('upgrade', (r, s) => { s.destroy(); resolve({ status: r.statusCode, type: 'upgrade', bytes: false }); });
  q.on('error', (e) => resolve({ status: 0, type: String(e.code || 'error'), bytes: false })); q.on('timeout', () => { q.destroy(); resolve({ status: 0, type: 'timeout', bytes: false }); });
  if (body) q.write(body); q.end();
});
const WS_HEADERS = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') };
const TABLE = [
  ['GET /', { p: '/' }], ['GET /index.html', { p: '/index.html' }], ['GET /api/home', { p: '/api/home' }],
  ['POST /api/pair-probe-unknown', { method: 'POST', p: '/api/pair-probe-unknown', headers: { 'content-type': 'application/json' }, body: '{}' }],
  ['GET /ws (upgrade)', { p: '/ws', headers: WS_HEADERS }], ['GET /proxy/', { p: '/proxy/' }], ['GET /api/vnc', { p: '/api/vnc' }],
  ['GET /api/desktop/none/stream', { p: '/api/desktop/none/stream' }], ['GET /api/browser/stream', { p: '/api/browser/stream' }], ['GET /svc/none/', { p: '/svc/none/' }],
];
{
  const rows = [];
  for (const [name, o] of TABLE) rows.push({ name, plain: await ask(PLAIN_PORT, o), pair: await ask(IFACE_PORT, o) });
  const same = rows.filter((r) => r.plain.status === r.pair.status && r.plain.type === r.pair.type);
  check(`${same.length} of ${rows.length} branches answered as the plain hub answers them: ${rows.map((r) => `${r.name} ${r.plain.status}/${r.pair.status}`).join(' · ')}`, same.length === rows.length && rows[0].plain.status === 200, rows.filter((r) => !same.includes(r)));
  // tls.js's plan reads the pair; the piped hub pushes it — waited for (≤ 20 s), and the same status must be a REAL answer:
  // two hubs that both fail TLS answer 0 = 0 (the B2b readers' vacuous leg)
  let tPlain = {}, tPair = {};
  await until(async () => { tPlain = await ask(PLAIN_PORT, { p: '/', secure: true }); tPair = await ask(IFACE_PORT, { p: '/', secure: true }); return tPlain.status > 0 && tPair.status > 0; }, 20000);
  check(`TLS GET /: the plain hub ${tPlain.status || tPlain.type}, through the interface ${tPair.status || tPair.type} — the same, and an answer`, tPlain.status > 0 && tPlain.status === tPair.status, { tPlain, tPair });
}

console.log('③ THE START PIPE\'S SECRETS travel only on fd 3');
{
  const procOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8') + fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); } catch { return ''; } };
  const seen = outs.get('interface') + outs.get('piped') + procOf(iface.pid) + procOf(hub.pid);
  const leaks = [ifaceSecret, hubSecret, hubDigest].filter((v) => seen.includes(v));
  check(`both processes' output (${outs.get('interface').length + outs.get('piped').length} B), argv and environment: ${leaks.length} secrets found`, procOf(hub.pid).length > 0 && leaks.length === 0);
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

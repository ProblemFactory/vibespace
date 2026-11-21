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
import { freePorts, vncEnv } from './scratch.mjs';
import { mintRoot, startHub } from './hub-boot.mjs';   // THE ONE ROOTED END (test-architecture §57c / §57d): the oracle boots through it, and its end reaches every process rooted in the suite's root

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, c, e) => { if (typeof n !== 'string') throw new TypeError('check(…): its name must be a string — a swapped call is refused'); if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + JSON.stringify(e).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms) => { const t = Date.now(); while (!(await f())) { if (Date.now() - t > ms) return false; await sleep(100); } return true; };

const [IFACE_PORT, PLAIN_PORT] = await freePorts(2);
const VNC_PLAIN = await vncEnv();   // each hub its own per-run singleton-Desktop names (test-architecture §57)
const VNC_PAIR = await vncEnv();
// two trees and two homes: the pair's hub and the oracle never share a data dir or a HOME
// THE SUITE'S ONE MINTED ROOT (hub-boot.mjs mintRoot, 0700): both trees, both homes, the CLI stub and the link's folder
const ROOT = mintRoot('iface-pair');
const wt = path.join(ROOT, 'wt'), wtPlain = path.join(ROOT, 'wt-plain');
const homeIn = (n) => { const h = path.join(ROOT, n); for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(h, d), { recursive: true }); return h; };
const fakeHome = homeIn('home'), plainHome = homeIn('home-plain');
for (const w of [wt, wtPlain]) {
  try { execSync(`git worktree remove --force ${w}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  execSync(`git worktree add --detach ${w} HEAD`, { cwd: repo, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${w}/${f} && cp -r ${repo}/${f} ${w}/${f}`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(w, 'node_modules'));
  fs.mkdirSync(path.join(w, 'data'), { recursive: true });
}
const stub = path.join(ROOT, 'claude-stub');
fs.writeFileSync(stub, '#!/bin/sh\nfor a in "$@"; do case "$a" in --version) echo "2.1.288 (Claude Code) stub"; exit 0;; esac; done\nexit 0\n', { mode: 0o755 });
const tlsDir = path.join(wt, 'tls-pair'); fs.mkdirSync(tlsDir, { recursive: true });
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(tlsDir, 'key.pem'), '-out', path.join(tlsDir, 'cert.pem'), '-days', '2', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const hubEnv = (home) => ({ PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, CLAUDE_CMD: stub, VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1', HOST: '127.0.0.1',
  VIBESPACE_TLS_CERT: path.join(tlsDir, 'cert.pem'), VIBESPACE_TLS_KEY: path.join(tlsDir, 'key.pem') });
const linkDir = path.join(ROOT, 'link'); fs.mkdirSync(linkDir, { mode: 0o700 });   // THE LINK'S FOLDER is this account's alone (r1124 2): the interface refuses /tmp itself, which every account may write
const link = path.join(linkDir, 'link.sock');
const kids = [], outs = new Map();
const keep = (name, child) => { kids.push(child); outs.set(name, ''); for (const s of [child.stdout, child.stderr]) s && s.on('data', (b) => outs.set(name, outs.get(name) + b)); return child; };
const cleanup = () => {
  for (const k of kids) { try { k.kill('SIGKILL'); } catch { } }
  for (const w of [wt, wtPlain]) { try { execSync(`git worktree remove --force ${w}`, { cwd: repo, stdio: 'ignore' }); } catch { } }
};   // the root itself, its homes and every process rooted in it: the boot helper's own end (mintRoot armed it, signals too)
process.on('exit', cleanup);

// THE ORACLE: today's road, no start pipe
const plainStart = Date.now();
const plainHub = startHub({ root: ROOT, tree: wtPlain, port: PLAIN_PORT, env: { ...hubEnv(plainHome), ...VNC_PLAIN }, log: 'plain' });   // THROUGH THE BOOT HELPER (主开发 r1341 1): no start pipe, a home of its own — its output in the root's plain.log
// THE PAIR: the interface first (its admit for the hub written BEFORE the hub starts), then the hub
const ifaceSecret = crypto.randomBytes(32).toString('hex'), hubSecret = crypto.randomBytes(32).toString('hex');
const hubDigest = crypto.createHash('sha256').update(hubSecret).digest('hex');
const iface = keep('interface', spawn(process.execPath, [path.join(wt, 'src/interface/main.js')], { cwd: wt, env: { PATH: process.env.PATH, PORT: String(IFACE_PORT), HOST: '127.0.0.1', VIBESPACE_START_FD: '3' }, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] }));   // the B2b cure: the start NAMES its pipe
// THE SIGN-IN TABLE the interface holds (piece B3b-1: the start line names it, REQUIRED): the piped hub's own data/auth.json — its
// folder this account's alone (the link's rule), made 0700 here before the interface judges it; sign-in off in both forms
// (VIBESPACE_PASSWORD empty, no file), so the oracle's answers and the pair's still meet the same gate
const signinDir = path.join(wt, 'data'); fs.mkdirSync(signinDir, { recursive: true }); fs.chmodSync(signinDir, 0o700);
iface.stdio[3].write(JSON.stringify({ op: 'start', party: 'interface', secret: ifaceSecret, link, signin: { file: path.join(signinDir, 'auth.json') } }) + '\n' + JSON.stringify({ op: 'admit', party: 'hub', digest: hubDigest }) + '\n');
await until(() => /listening on/.test(outs.get('interface')), 20000);
const pipedStart = Date.now(); let pipedJoined = 0;
// THE PIPED HUB THROUGH THE BOOT HELPER too (its start pipe on fd 3, named by the start word: startHub's startLine) — the hub
// reads this ONE line at its line 5 and closes its end (the B2b cure 2); its output in the root's piped.log
const pipedHub = startHub({ root: ROOT, tree: wt, port: IFACE_PORT, env: { ...hubEnv(fakeHome), ...VNC_PAIR }, log: 'piped', startLine: JSON.stringify({ op: 'start', party: 'hub', secret: hubSecret, link }) });
const hub = pipedHub.child;

const textOf = (name) => (name === 'plain' ? plainHub.log() : name === 'piped' ? pipedHub.log() : outs.get(name));   // the two hubs write the helper's logs, the interface its pipes
const record = (name) => { const m = [...textOf(name).matchAll(/\[hub-port\] (\{[^\n]*\})/g)].pop(); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } };
const ready = (port, secure = false) => new Promise((resolve) => { const q = (secure ? https : http).get({ host: '127.0.0.1', port, path: '/api/home', agent: false, rejectUnauthorized: false, timeout: 3000 }, (r) => { r.resume(); resolve(r.statusCode > 0); }); q.on('error', () => resolve(false)); q.on('timeout', () => { q.destroy(); resolve(false); }); });
const upPlain = await until(() => ready(PLAIN_PORT), 90000), plainUp = Date.now();
// THE PAIR IS READY ONCE ITS HUB HAS JOINED: before it, the interface answers every page itself (503 «no-owner»), and a status
// is no readiness — a branch table run then reads the interface's own refusal (two reds of 1522499e5's own read: the piped hub
// joined after the plain hub answered, a race the plain hub's own start time had hidden)
const upPair = await until(async () => { if (!pipedJoined && /\[hub-port\] \{/.test(textOf('piped'))) pipedJoined = Date.now(); return pipedJoined > 0 && await ready(IFACE_PORT); }, 90000);   // the moment the piped hub's own record says it joined (read off its log, every 100 ms)
console.log(`    (FACT, never judged: the plain hub answered ${plainUp - plainStart} ms after its start; the piped hub joined ${pipedJoined ? pipedJoined - pipedStart : 'never'} ms after its own)`);
check('the oracle (plain) and the pair (interface + piped hub) both answer', upPlain && upPair, { upPlain, upPair, iface: outs.get('interface').slice(-400), piped: textOf('piped').slice(-400) });

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
  const seen = outs.get('interface') + textOf('piped') + procOf(iface.pid) + procOf(hub.pid);
  const leaks = [ifaceSecret, hubSecret, hubDigest].filter((v) => seen.includes(v));
  check(`both processes' output (${outs.get('interface').length + textOf('piped').length} B), argv and environment: ${leaks.length} secrets found`, procOf(hub.pid).length > 0 && leaks.length === 0);
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

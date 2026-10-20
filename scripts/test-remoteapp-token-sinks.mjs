#!/usr/bin/env node
// WHERE A REMOTEAPP PASSWORD GOES (design q-024 r1 §1.3's census, lane remoteapp-r1a, 2026-10-16) — fast: no X, no xpra.
// The REAL chain — the route (people only) → src/server/desktop-access.js launchRemoteApp (the machine reached, Windows,
// its setup asked) → the hub keeper's machine half (src/desktop-serve.js launchRemoteApp → bringUp) → the REAL
// desktop-display startApp spawning the FAKE xfreerdp (scripts/fixtures/remoteapp/xfreerdp: the measured stdin protocol,
// pin and logon behaviour) — over a stand-in display recipe (a sleeping process is the "xpra") and a stand-in paired
// machine whose tcpForward reaches a loopback server playing the machine's 3389. The password is built at runtime and
// handed in ONLY through the setup GETTER (R1a's seam; R1b's sealed integration row).
//   §1 the launch: a record, the fake saw `/from-stdin` + `/d:` and read exactly ONE stdin line = the password (its
//      sha256 + length), its own fresh XDG_CONFIG_HOME (0700, empty), the forward opened (one reference) and the fake
//      reached the "machine" through it; the record's FACTS (pid + starttime, display, port, rdp {forwardId, certFp, port, client})
//   §2 THE SINKS: the record's argv, /proc/<pid>/cmdline, /proc/<pid>/environ, the console, the keeper + access logs,
//      desktop-apps.json, app.log, EVERY file under the data dir, every WS broadcast, GET /api/desktop/apps + /:id, the
//      access layer's forwards() — the password's bytes in NONE (the child's stdin is the one place)
//   §3 stop: the forward reference dropped (no listener left, the machine-side connection closed), the fake signalled
//   §4 why it ended, through the real chain: a wrong pin ⇒ rdp_cert_changed (exit 143), a wrong password ⇒
//      rdp_auth_failed (134) — the forward closed each time; a TOFU certificate stored in the hub user's ~/.config/freerdp +
//      a wrong pin ⇒ STILL refused (the client's own XDG_CONFIG_HOME — the measured hole closed)
//   §5 the door's refusals by name: no setup ⇒ 409 remoteapp_needs_setup (+ the missing parts, the NEXT-version words),
//      a Mac ⇒ remoteapp_not_windows, an agent token ⇒ 403 human_only, a second session ⇒ rdp_session_busy, FreeRDP 2 on
//      the hub ⇒ rdp_client_too_old, no client on the hub ⇒ no-backend naming the package — nothing opened, no forward left
//   §6 the relaunch (Scale ▸ seat) reconnects: the successor reads the setup again, shares the forward, the old one lets go
//   §5 also: the GENERIC launch (POST /api/desktop/apps, an agent token or not; the `launch` op) refuses a RemoteApp body
//      (remoteapp_door) — design §1.6 fence 4: only its own door starts one
//   §7 the hosted runner's spawn PATH (lane remoteapp-fake-node-path; master .288 went red there): /usr/bin + /bin minus
//      node ⇒ the sh fake's version read, the launch READY, the machine reached; RED CONTROL: an `#!/usr/bin/env node`
//      fake under that PATH ⇒ rdp_client_unknown in the runner's words, and with node put back it answers
//   A leg whose input an earlier leg failed to make is ✗ naming that cause; a section that throws is one ✗, the next runs.
//   CONTROLS (patched copies, scripts/mutant-copy.mjs): a planted console.log of the password ⇒ the console sink sees it; an
//   argv `/p:` ⇒ the record + cmdline sinks see it; the client's XDG_CONFIG_HOME dropped ⇒ the stored certificate wins
//   over a wrong pin (it connects); `/d:` dropped ⇒ the fake reads the password as the domain and the session ends cancelled;
//   the door check dropped ⇒ the generic launch starts a RemoteApp
// LANE REMOTEAPP-R1B — THE SEALED ROW (design §1.3–§1.6): the same chain over the REAL integration store (`remoteapp/<hostId>`)
// and the settings card's routes, the fake as the machine's certificate (scripts/fixtures/remoteapp/server-a.pem / -b):
//   §8 the card's doors — people only (an agent token on every one ⇒ 403, so no transcript can carry a sign-in); save SEALS
//      (the file holds ciphertext, the answer says "set"); no pin ⇒ the launch refused naming First connection; the first
//      connection = ONE `/auth-only /from-stdin:force /cert:tofu` run in its OWN fresh config dir (gone after), the pin = the
//      machine certificate's sha256, the forward closed; the launch then reads the sealed row (stdin = the password, the pin
//      = the stored one); a relaunch reads the row AGAIN (a password changed meanwhile is the one handed over); a changed
//      certificate ⇒ the launch ends rdp_cert_changed, the card says refused, 「重新信任」 pins the new one; a wrong
//      password ⇒ rdp_auth_failed, nothing pinned; the facts door answers a machine's rows, an old agent `agent_too_old`
//      naming the version it needs; a second session ⇒ rdp_session_busy; the forward stays loopback; two first connections at once
//      with a cold build read ⇒ ONE client run + rdp_trust_busy (verify r1; CONTROL: the pre-fix mark order runs two)
//   §9 THE SINKS of the sealed chain — the password's bytes ONLY in the store's sealed record (opened by resolveMachine) and
//      the child's stdin: never in the machine view, a route answer, the record, /proc cmdline / environ, the console, the
//      logs, app.log (a client that PRINTED it is scrubbed at its teardown), any file under the data dir (integrations.json
//      holds ciphertext), any WS broadcast, any audit row, GET /api/desktop/apps
//   CONTROLS: a planted machine-view leak (the secret field drawn like a plain one) ⇒ the view sink sees it; the teardown
//   scrub dropped ⇒ the printed password stays in app.log
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require(path.join(repo, 'src/desktop-display.js'));
const K = require(path.join(repo, 'src/server/desktop-app-keeper.js'));
const A = require(path.join(repo, 'src/server/desktop-access.js'));
const R = require(path.join(repo, 'src/routes/desktop-apps.js'));
const express = require('express');
const MUT = mutantCopies('rats', repo);
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : ''}`); } };
// lane remoteapp-fake-node-path: a leg whose input an earlier leg failed to make is ✗ NAMING that cause (never a
// TypeError that hides every leg after it — master .288 crashed at §1's record), and a section that still throws is
// one ✗ naming the throw; the next section runs
const notRun = (why, legs) => { for (const l of legs) ok(false, `${l} — not run: ${why}`); };
const section = async (title, fn) => { console.log(title); try { await fn(); } catch (e) { ok(false, `${title.split(' ')[0]} threw — ${(e && e.message) || e}`, String((e && e.stack) || '').split('\n').slice(1, 3).map((x) => x.trim()).join(' | ')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ── fixtures from SHAPES, built at runtime ──
const PW = ['Rw', crypto.randomBytes(6).toString('hex'), '-q#7'].join('');
const PW_BYTES = Buffer.from(PW);
const randFp = () => crypto.randomBytes(32).toString('hex').match(/../g).join(':');
const FP = randFp();
const HOST = 'dev-' + 'w1n';
const FAKE = path.join(repo, 'scripts/fixtures/remoteapp/xfreerdp');
const root = scratch('rats');
fs.mkdirSync(root, { recursive: true });
const home = path.join(root, 'home'); fs.mkdirSync(home, { recursive: true });

// ── the spies: console + the logs ──
const said = [];
for (const k of ['log', 'warn', 'error', 'info']) { const orig = console[k].bind(console); console[k] = (...a) => { said.push(a.map(String).join(' ')); orig(...a); }; }
const logs = [];
const spyLog = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), info: (...a) => logs.push(a.join(' ')) };

// ── the stand-in paired machine: its 3389 is a loopback server; its agent's tcpForward pipes to it ──
const machineConns = new Set();
let machineHellos = 0;
const machineSrv = net.createServer((s) => { machineConns.add(s); s.on('close', () => machineConns.delete(s)); s.on('data', (b) => { if (String(b).includes('VS-FAKE-RDP hello')) { machineHellos++; s.write('VS-FAKE-MACHINE 3389\n'); } }); s.on('error', () => { }); });
await new Promise((r) => machineSrv.listen(0, '127.0.0.1', r));
const machinePort = machineSrv.address().port;
const tcpOpened = [];
let platform = 'win32';
const dm = {
  status: () => ({ connected: true, info: { platform } }),
  desktopServe: async () => ({ ok: false, code: 'unused', error: 'this stand-in runs no desktop-serve op' }),
  tcpForward: async (port) => {
    tcpOpened.push(port);
    if (port !== 3389) throw new Error(`nothing listens on ${port}`);
    const s = net.connect(machinePort, '127.0.0.1');
    await new Promise((r, j) => { s.once('connect', r); s.once('error', j); });
    const h = { onData: null, onClose: null, write: (b) => s.write(b), close: () => s.destroy() };
    s.on('data', (b) => h.onData && h.onData(b)); s.on('close', () => h.onClose && h.onClose()); s.on('error', () => { });
    return h;
  },
};
const hosts = { deviceBounded: async () => dm, get: (id) => (id === HOST ? { id, name: 'Lab PC' } : null), isLocal: (id) => !id || id === 'local', list: () => [] };

// ── the stand-in display: everything real but the X/picture server (a sleeping process holds the "xpra" seat) ──
let serverPid = null;
const stubDisplay = (bins) => ({
  ...D,
  hostFacts: async () => ({ hostId: 'local', bins: { xpra: '/usr/bin/xpra', ...bins }, xpra: null }),
  RECIPES: { ...D.RECIPES, 'xpra-seamless': async (ctx) => { const sp = D.spawnDetached('sleep', ['300'], { env: ctx.base, logFd: ctx.logFd }); const c = await sp.spawned; serverPid = c.pid; ctx.onPart('x', c, { alsoServer: true, display: ':4242', port: 1 }); return { display: ':4242', port: 1, probe: 'http', wm: false }; } },
  waitForListen: async () => ({ ok: true }),
  listenerHeldBy: () => serverPid,
  waitForXftDpi: async () => ({ ok: true }),
  windowTree: async () => { throw new Error('no X here'); },
  enumerateWindows: async () => { throw new Error('no X here'); },
});

const recFile = path.join(root, 'fake-rdp.jsonl');
// lane race-sweep (B-6b74): ONE reader of the fake's record, and it never throws. Only COMPLETE lines count (the tail after
// the last newline may be a write still in flight); a line that is not one JSON object is kept as TORN and §R names it — the
// pre-fix fake wrote `"at":000` when the keeper's stop killed its `date` child mid-record, and every later section threw
// "Unexpected number in JSON" instead (3/10 under a 2-cpu load); a `clock_unknown` line (at 0) is the fixed fake's shape
const readRecord = (file) => {
  const rows = [], torn = [], clockless = [];
  const parts = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
  parts.pop();
  for (const l of parts.filter(Boolean)) {
    let r = null; try { r = JSON.parse(l); } catch { /* torn: named below */ }
    if (!r || typeof r !== 'object' || Array.isArray(r)) { torn.push(l); continue; }
    if (r.clock_unknown) clockless.push(l);
    rows.push(r);
  }
  return { rows, torn, clockless };
};
const recSeen = { torn: new Set(), clockless: new Set() };
const recRows = () => { const x = readRecord(recFile); for (const l of x.torn) recSeen.torn.add(l); for (const l of x.clockless) recSeen.clockless.add(l); return x.rows; };
const fakeSaw = (pid) => recRows().filter((r) => r.pid === pid);
const baseEnv = (extra = {}) => () => ({ PATH: `${path.dirname(FAKE)}:/usr/bin:/bin`, HOME: home, VS_FAKE_RDP_RECORD: recFile, VS_FAKE_RDP_WINDOW: '0', VS_FAKE_RDP_SERVER_FP: FP, VS_FAKE_RDP_PASSWORD_SHA256: sha(PW), ...extra });

let setupCalls = 0;
let setup = { user: 'someone', domain: '', certFp: FP, pw: () => PW };
const rdpSetup = async () => { setupCalls++; return setup ? { user: setup.user, domain: setup.domain, certFp: setup.certFp, password: setup.pw } : null; };
const frames = [];
let keeper = null;
const acc = A.create({ hosts, local: () => keeper.machine, install: false, rdpSetup, log: spyLog });
const dataDir = path.join(root, 'data');
keeper = K.create({ dataDir, env: baseEnv(), broadcast: (m) => frames.push(JSON.stringify(m)), display: stubDisplay({ xfreerdp: FAKE }), access: () => acc, log: spyLog, serverSetting: () => undefined });
R.setup({ keeper, access: acc, vnc: {} });
const app = express(); app.use(express.json()); app.use(R.router);
const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${srv.address().port}`;
const post = async (url, body, headers = {}) => { const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, text: await r.text() }; };
const get = async (url) => { const r = await fetch(base + url); return { status: r.status, text: await r.text() }; };
const live = (id) => keeper.get(id);
const settle = (id, ms = 10000) => until(() => { const r = live(id); return r && r.state !== 'launching' ? r : null; }, ms);
const ended = (id, ms = 10000) => until(() => { const r = live(id); return r && !['launching', 'ready'].includes(r.state) ? r : null; }, ms);
// lane one-browser-b1-mirror-fix (the .290 mirror's red): an app exit flips the state at once (fail()) and writes the
// client's own reason (rdp.ended + lastError) only after rdpEndOf's async read of its app.log — a leg judging the REASON
// waits for the reason, never for the state alone (a loaded runner read the record between the two)
const endedWhy = (get, ms = 10000) => until(() => { const r = get(); return r && !['launching', 'ready'].includes(r.state) && r.rdp && r.rdp.ended ? r : null; }, ms);
const PROGRAM = 'C:\\Windows\\System32\\notepad.exe';
const cleanup = () => { try { srv.close(); machineSrv.close(); } catch { /* down */ } for (const r of keeper.machine.listApps()) { for (const pid of Object.values(r.pids || {})) if (pid) { try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ } } } };
process.on('exit', cleanup);

let rec1 = null, fakePid = null;
await section('§1 the launch — through the route, the access layer and the keeper to the real spawn', async () => {
  const r = await post('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: PROGRAM, name: 'Notepad' });
  const v = JSON.parse(r.text);
  ok(r.status === 200 && v.id && v.backend === 'remoteapp' && v.via === 'xpra+xfreerdp' && v.recipe === 'xpra-seamless' && v.label === 'Notepad', 'POST remoteapp ⇒ a record on the remoteapp rung via xpra+xfreerdp (xpra-seamless)', v);
  const LATER = ['§1 ready', '§1 the ONE stdin line', '§1 its argv', '§1 its own XDG_CONFIG_HOME', '§1 ONE forward reference', '§1 the record\'s FACTS', '§1 launched by a person'];
  if (!v.id) return notRun(`the POST made no record (${r.status} ${v.code || ''}: ${String(v.error || r.text).slice(0, 240)})`, LATER);
  rec1 = await settle(v.id);
  if (!rec1) return notRun(`record ${v.id} never left launching in 10 s`, LATER);
  fakePid = rec1 && rec1.pids.app;
  ok(rec1 && rec1.state === 'ready' && fakePid > 0, `ready; the app part is the fake xfreerdp (pid ${fakePid}) — lastError ${rec1 && rec1.lastError}`, rec1);
  const saw = fakePid ? await until(() => { const s = fakeSaw(fakePid); return s.some((x) => x.phase === 'connected') ? s : null; }, 8000) : null;
  const st = saw && saw.find((x) => x.phase === 'stdin');
  const start = saw && saw.find((x) => x.phase === 'start');
  ok(st && st.lines === 1 && st.domainFromStdin === false && st.password && st.password.sha256 === sha(PW) && st.password.length === PW_BYTES.length, 'the fake read exactly ONE stdin line, not as a domain (/d: present), and it IS the password (sha256 + length)', st);
  ok(start && rec1.rdp && start.argv.includes('/from-stdin') && start.argv.includes('/d:') && start.argv.includes(`/cert:deny,fingerprint:sha256:${FP}`) && start.argv.includes('/gfx') && start.argv[0] === `/v:127.0.0.1:${rec1.rdp.port}`, 'its argv: /v: = the hub\'s loopback forward, /d:, /from-stdin, the pinned cert with deny, /gfx (the fake reports no H.264)', start && start.argv);
  const cfg = path.join(keeper.logRoot, v.id, 'rdp-config');
  ok(start && start.env.XDG_CONFIG_HOME === cfg && fs.existsSync(cfg) && (fs.statSync(cfg).mode & 0o777) === 0o700 && fs.readdirSync(cfg).length === 0, 'the client\'s own XDG_CONFIG_HOME: <appDir>/rdp-config, 0700, empty (a stored TOFU certificate cannot beat the pin)', start && start.env);
  const fw = acc.forwards();
  ok(fw.length === 1 && fw[0].hostId === HOST && fw[0].remotePort === 3389 && fw[0].refs === 1 && rec1.rdp && fw[0].localPort === rec1.rdp.port && tcpOpened.filter((p) => p === 3389).length >= 1 && machineHellos === 1 && saw && saw.find((x) => x.phase === 'connected').reply === 'VS-FAKE-MACHINE 3389', 'ONE forward reference to the machine\'s 3389 through its agent\'s tcpForward; the fake reached the "machine" through it and heard its answer', { fw, tcpOpened, machineHellos });
  ok(rec1.rdp && rec1.rdp.forwardId === `${HOST}:3389` && rec1.rdp.certFp === FP && rec1.rdp.client === '3.32.1' && rec1.remoteapp.hostId === HOST && rec1.remoteapp.program === PROGRAM && rec1.starts.app > 0 && rec1.display === ':4242' && rec1.hostId === 'local', 'the record\'s FACTS: rdp {forwardId, certFp, port, client}, remoteapp {machine, program}, pid + starttime, display — the record is THIS machine\'s (hostId local)', { rdp: rec1.rdp, remoteapp: rec1.remoteapp });
  ok(rec1.launchedBy && rec1.launchedBy.kind === 'person' && rec1.caps && rec1.caps.perWindow === true && rec1.stream === 'xpra', 'launched by a person; its caps are the row\'s (per-window, xpra stream)', { launchedBy: rec1.launchedBy, caps: rec1.caps });
});

await section('§2 THE SINKS — the password\'s bytes nowhere but the child\'s stdin', async () => {
  if (!rec1 || !fakePid) return notRun('§1 left no running fake xfreerdp to look into', ['§2 the password in 0 of 14 sinks', '§2 the sinks were live', '§2 no `password` field']);
  const holds = (b) => Buffer.isBuffer(b) ? b.includes(PW_BYTES) : String(b).includes(PW);
  const sinks = [];
  const look = (name, data) => sinks.push([name, holds(data)]);
  look('the record\'s argv', JSON.stringify(rec1.args));
  look('/proc/<pid>/cmdline', fs.readFileSync(`/proc/${fakePid}/cmdline`));
  look('/proc/<pid>/environ', fs.readFileSync(`/proc/${fakePid}/environ`));
  look('the fake\'s env names', JSON.stringify(fakeSaw(fakePid).find((x) => x.phase === 'start').env));
  look('the fake\'s own record (sha only)', fs.readFileSync(recFile));
  look('console', said.join('\n'));
  look('keeper + access logs', logs.join('\n'));
  look('desktop-apps.json', fs.readFileSync(path.join(dataDir, 'desktop-apps.json')));
  look('app.log', fs.readFileSync(path.join(keeper.logRoot, rec1.id, 'app.log')));
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.isFile() ? [path.join(d, e.name)] : []));
  const files = walk(dataDir);
  look(`every file under the data dir (${files.length})`, Buffer.concat(files.map((f) => fs.readFileSync(f))));
  look(`every WS broadcast (${frames.length})`, frames.join('\n'));
  const gl = await get('/api/desktop/apps'); const gi = await get(`/api/desktop/apps/${rec1.id}`);
  look('GET /api/desktop/apps', gl.text); look('GET /api/desktop/apps/:id', gi.text);
  look('the access layer\'s forwards()', JSON.stringify(acc.forwards()));
  const leaked = sinks.filter(([, h]) => h).map(([n]) => n);
  ok(leaked.length === 0 && sinks.length === 14, `the password in 0 of ${sinks.length} sinks (${sinks.map(([n]) => n).join(' · ')})`, leaked);
  ok(frames.some((f) => f.includes(rec1.id)) && gl.status === 200 && gl.text.includes(rec1.id) && gi.status === 200, 'the sinks were live: the broadcasts and both GETs carry the record');
  // the checkout's own path is not the record's content (lane vault-e2e-password: its worktree is …/wt-vault-e2e-password, and the fixture exec path rides the record)
  ok(!/"password"/i.test(fs.readFileSync(path.join(dataDir, 'desktop-apps.json'), 'utf8')) && !/password/i.test(JSON.stringify(rec1).split(repo).join('<repo>')), 'no `password` field anywhere in the record');
});

await section('§3 stop — the forward goes with the session', async () => {
  if (!rec1) return notRun('§1 left no record to stop', ['§3 stopped', '§3 the forward\'s reference dropped', '§3 the fake xfreerdp was signalled']);
  const r = await post(`/api/desktop/apps/${rec1.id}/stop`, {});
  const end = await ended(rec1.id);
  ok(r.status === 200 && end && !['launching', 'ready'].includes(end.state), `stopped (${end && end.state})`, r.text.slice(0, 200));
  ok(await until(() => acc.forwards().length === 0 && machineConns.size === 0), 'the forward\'s reference dropped: no listener left, the machine-side connection closed', { fw: acc.forwards(), conns: machineConns.size });
  ok(await until(() => fakeSaw(fakePid).some((x) => x.phase === 'signal')), 'the fake xfreerdp was signalled (SIGTERM) by the keeper\'s teardown');
});

const launchAndEnd = async (body, ms = 10000) => { const r = await post('/api/desktop/machine-desktop/remoteapp', body); const v = JSON.parse(r.text); if (!v.id) return { r, v }; return { r, v, end: await endedWhy(() => live(v.id), ms) }; };
await section('§4 why it ended — the client\'s own words through the real chain', async () => {
  setup = { ...setup, certFp: randFp() };
  const c = await launchAndEnd({ host: HOST, program: PROGRAM });
  ok(c.end && c.end.exitCode === 143 && c.end.rdp.ended === 'rdp_cert_changed' && /Lab PC|dev-w1n/.test(c.end.lastError) && /certificate is not the one pinned/.test(c.end.lastError), 'a wrong pin ⇒ exit 143, rdp.ended rdp_cert_changed, the record\'s lastError says so', c.end ? { exitCode: c.end.exitCode, rdp: c.end.rdp, lastError: c.end.lastError } : c.v);
  ok(await until(() => acc.forwards().length === 0), 'its forward closed');
  setup = { ...setup, certFp: FP, pw: () => PW + 'x' };
  const a = await launchAndEnd({ host: HOST, program: PROGRAM });
  ok(a.end && a.end.exitCode === 134 && a.end.rdp.ended === 'rdp_auth_failed' && /refused the Windows sign-in/.test(a.end.lastError), 'a wrong password ⇒ exit 134, rdp_auth_failed', a.end ? { exitCode: a.end.exitCode, rdp: a.end.rdp, lastError: a.end.lastError } : a.v);
  ok(await until(() => acc.forwards().length === 0), 'its forward closed');
  // the measured hole: a TOFU certificate stored for 127.0.0.1:<port> in the hub user's config — hold a forward reference
  // first so the launch's port is known, plant the certificate there, then launch with a WRONG pin
  setup = { ...setup, pw: () => PW, certFp: randFp() };
  const hold = await acc.forwardPort(HOST, 3389);
  const storeDir = path.join(home, '.config', 'freerdp', 'server'); fs.mkdirSync(storeDir, { recursive: true });
  fs.writeFileSync(path.join(storeDir, `127.0.0.1_${hold.localPort}.pem`), '-----BEGIN CERTIFICATE-----\nstored-by-an-earlier-tofu\n-----END CERTIFICATE-----\n');
  const s = await launchAndEnd({ host: HOST, program: PROGRAM });
  ok(s.end && s.end.rdp.ended === 'rdp_cert_changed' && s.end.rdp.port === hold.localPort, 'a TOFU certificate stored in ~/.config/freerdp for that very port + a wrong pin ⇒ STILL refused (the client reads only its own empty XDG_CONFIG_HOME)', s.end ? { rdp: s.end.rdp, lastError: s.end.lastError } : s.v);
  hold.close();
  setup = { ...setup, certFp: FP };
});

await section('§5 the door\'s refusals — by name, nothing opened', async () => {
  ok(await until(() => acc.forwards().length === 0), '§4 left no forward behind once its sessions\' teardowns ran (the state turns before the teardown drops the reference)', acc.forwards());
  setup = null;
  const ns = await post('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: PROGRAM });
  const nv = JSON.parse(ns.text);
  ok(ns.status === 409 && nv.code === 'remoteapp_needs_setup' && JSON.stringify(nv.missing) === JSON.stringify(['user', 'password', 'certificate']) && /needs its Windows user name, its Windows password and its Remote Desktop certificate fingerprint — give them once on its RemoteApp settings card/.test(nv.error) && /Lab PC/.test(nv.error), 'no setup ⇒ 409 remoteapp_needs_setup naming every missing part, the machine by its name, and its door (the RemoteApp settings card, r1b)', nv);
  setup = { user: 'someone', domain: '', certFp: FP, pw: () => PW };
  platform = 'darwin';
  const mac = await post('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: PROGRAM });
  ok(mac.status === 409 && JSON.parse(mac.text).code === 'remoteapp_not_windows', 'a Mac ⇒ 409 remoteapp_not_windows', mac.text);
  platform = 'win32';
  const ag = await post('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: PROGRAM }, { authorization: 'Bearer ' + 'x'.repeat(8) });
  ok(ag.status === 403 && JSON.parse(ag.text).code === 'human_only', 'an agent token ⇒ 403 human_only (design §1.6 fence 4: an agent never starts a RemoteApp)', ag.text);
  const bp = await post('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: 'notepad' });
  ok(bp.status === 400 && JSON.parse(bp.text).code === 'remoteapp_bad_program', 'a program that is no path / alias / .exe ⇒ 400 remoteapp_bad_program', bp.text);
  const first = await post('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: PROGRAM });
  const fv = JSON.parse(first.text);
  await settle(fv.id);
  const second = await post('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: 'calc.exe' });
  ok(second.status === 409 && JSON.parse(second.text).code === 'rdp_session_busy' && JSON.parse(second.text).error.includes(fv.id), 'a second session on the same machine ⇒ 409 rdp_session_busy naming the first', second.text);
  await post(`/api/desktop/apps/${fv.id}/stop`, {}); await ended(fv.id); await until(() => acc.forwards().length === 0);
  // a hub whose client is FreeRDP 2 / a hub without the client: their own keepers (the build facts are read per binary)
  const old = path.join(root, 'old-bin'); fs.mkdirSync(old, { recursive: true }); fs.copyFileSync(FAKE, path.join(old, 'xfreerdp')); fs.chmodSync(path.join(old, 'xfreerdp'), 0o755);
  const k2 = K.create({ dataDir: path.join(root, 'data-old'), env: baseEnv({ VS_FAKE_RDP_VERSION: '2.11.7' }), broadcast: () => { }, display: stubDisplay({ xfreerdp: path.join(old, 'xfreerdp') }), access: () => acc, log: spyLog });
  const e2 = await k2.machine.launch({ remoteapp: { hostId: HOST, program: PROGRAM } }, { remoteappDoor: true }).then(() => null, (e) => e);
  ok(e2 && e2.code === 'rdp_client_too_old' && /FreeRDP 2\.11\.7/.test(e2.message) && k2.machine.listApps().length === 0, 'FreeRDP 2 on the hub ⇒ rdp_client_too_old, no record', e2 && e2.message);
  const k3 = K.create({ dataDir: path.join(root, 'data-none'), env: baseEnv(), broadcast: () => { }, display: stubDisplay({ xfreerdp: null }), access: () => acc, log: spyLog });
  const e3 = await k3.machine.launch({ remoteapp: { hostId: HOST, program: PROGRAM } }, { remoteappDoor: true }).then(() => null, (e) => e);
  ok(e3 && e3.code === 'no-backend' && /xpra\+xfreerdp not on PATH; xpra\+xfreerdp3 not on PATH\) — apt install freerdp3-x11$/.test(e3.message), 'no client on the hub ⇒ no-backend naming both spellings and the package', e3 && e3.message);
  // design §1.6 fence 4: the GENERIC launch never starts a RemoteApp — the route an agent token reaches, and the `launch` op
  const S = require(path.join(repo, 'src/desktop-serve.js'));
  const gen = await post('/api/desktop/apps', { remoteapp: { hostId: HOST, program: PROGRAM } });
  const genTok = await post('/api/desktop/apps', { remoteapp: { hostId: HOST, program: PROGRAM } }, { authorization: 'Bearer ' + 'y'.repeat(8) });
  const op = await S.runDesktopServeOp(keeper.machine, 'launch', { body: { remoteapp: { hostId: HOST, program: PROGRAM } } });
  ok(gen.status === 403 && JSON.parse(gen.text).code === 'remoteapp_door' && genTok.status >= 400 && op.ok === false && op.code === 'remoteapp_door' && keeper.machine.listApps().every((r) => !r.remoteapp || !['launching', 'ready'].includes(r.state)), 'the generic POST /api/desktop/apps (with or without an agent token) and the `launch` op refuse a RemoteApp body BY NAME (remoteapp_door) — only its own door starts one', { gen: gen.text.slice(0, 160), genTok: genTok.status, op });
  ok(acc.forwards().length === 0, 'no refusal left a forward behind', acc.forwards());
});

await section('§6 the relaunch reconnects (the Scale ▸ seat)', async () => {
  const r = await post('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: PROGRAM });
  const v = JSON.parse(r.text);
  const a = v.id ? await settle(v.id) : null;
  if (!a || a.state !== 'ready') return notRun(`its first session is not ready (${a ? `${a.state}: ${a.lastError}` : `${r.status} ${v.code || ''}: ${String(v.error || r.text).slice(0, 200)}`})`, ['§6 the successor ready', '§6 the forward shared', '§6 the old record ended']);
  const calls0 = setupCalls, port0 = a.rdp.port;
  const rl = await keeper.relaunch(v.id, { scale: 1 });
  const b = await settle(rl.app.id);
  ok(b && b.state === 'ready' && b.id !== v.id && b.remoteapp.program === PROGRAM && setupCalls === calls0 + 1, 'the successor is ready, the same app of the same machine, its setup READ AGAIN (never carried)', { state: b && b.state, calls: setupCalls - calls0 });
  ok(await until(() => { const f = acc.forwards(); return f.length === 1 && f[0].refs === 1 && f[0].localPort === port0 && b.rdp.port === port0 ? f : null; }), 'the successor shared the forward; the old session let go of its reference (refs back to 1, same port)', acc.forwards());
  const old = live(v.id);
  ok(old && !['launching', 'ready'].includes(old.state) && old.replacedBy === b.id, `the old record ended (${old && old.state}) naming its successor`);
  await post(`/api/desktop/apps/${b.id}/stop`, {}); await ended(b.id); await until(() => acc.forwards().length === 0);
});

await section('§7 a spawn PATH without node (the hosted runner\'s — master .288 red) — the sh fake launches; an `#!/usr/bin/env node` fake cannot say its version', async () => {
  // the runner's shape: every program of /usr/bin + /bin but node (setup-node's node lives in the tool cache, never there)
  const farm = path.join(root, 'no-node-bin'); fs.mkdirSync(farm, { recursive: true });
  const names = new Set();
  for (const d of ['/usr/bin', '/bin']) { let list = []; try { list = fs.readdirSync(d); } catch { /* not on this box */ } for (const n of list) if (!/^node(js)?$/.test(n) && !names.has(n)) { names.add(n); fs.symlinkSync(path.join(d, n), path.join(farm, n)); } }
  const onPath = (p, bin) => p.split(':').some((d) => { try { fs.accessSync(path.join(d, bin), fs.constants.X_OK); return true; } catch { return false; } });
  const NO_NODE = `${path.dirname(FAKE)}:${farm}`;
  ok(names.size > 100 && !onPath(NO_NODE, 'node') && onPath(NO_NODE, 'sh'), `the control PATH: ${names.size} programs of /usr/bin + /bin, no node (this suite's own is ${process.execPath})`);
  // a copy per leg: the build facts are memoised per binary (path + size + mtime), never per PATH
  const copy = (dir, text) => { const f = path.join(root, dir, 'xfreerdp'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text, { mode: 0o755 }); return f; };
  const shFake = copy('sh-fake', fs.readFileSync(FAKE));
  const k4 = K.create({ dataDir: path.join(root, 'data-no-node'), env: baseEnv({ PATH: NO_NODE }), broadcast: () => { }, display: stubDisplay({ xfreerdp: shFake }), access: () => acc, log: spyLog });
  const g = await k4.machine.launch({ remoteapp: { hostId: HOST, program: PROGRAM } }, { remoteappDoor: true }).then((x) => x, (e) => ({ error: `${e.code}: ${e.message}` }));
  const r4 = g.id ? await until(() => { const x = k4.get(g.id); return x && x.state !== 'launching' ? x : null; }) : null;
  const pid4 = r4 && r4.pids.app;
  const saw4 = pid4 ? await until(() => { const x = fakeSaw(pid4); return x.some((y) => y.phase === 'connected') ? x : null; }, 8000) : null;
  const env4 = pid4 ? String(fs.readFileSync(`/proc/${pid4}/environ`)).split('\0') : [];
  ok(r4 && r4.state === 'ready' && r4.rdp.client === '3.32.1' && saw4 && saw4.find((x) => x.phase === 'connected').reply === 'VS-FAKE-MACHINE 3389' && env4.includes(`PATH=${NO_NODE}`), 'the sh fake under it: its version read (3.32.1), the launch READY, the "machine" reached through the forward — its environ\'s PATH is the node-less one', r4 ? { state: r4.state, lastError: r4.lastError, client: r4.rdp && r4.rdp.client } : g.error);
  if (g.id) { await k4.stop(g.id).catch(() => { }); await until(() => { const x = k4.get(g.id); return x && !['launching', 'ready'].includes(x.state); }); }
  ok(await until(() => acc.forwards().length === 0), 'its stop closed the forward', acc.forwards());
  // the .288 fake's first line + its /version + /buildconfig answers (the whole file ran under node)
  const ENV_NODE = "#!/usr/bin/env node\nconst a = process.argv[2];\nif (a === '/version') console.log('This is FreeRDP version 3.32.1 (fake)');\nelse if (a === '/buildconfig') console.log('Build configuration: WITH_GFX_H264=OFF');\n";
  const k5 = K.create({ dataDir: path.join(root, 'data-env-node'), env: baseEnv({ PATH: NO_NODE }), broadcast: () => { }, display: stubDisplay({ xfreerdp: copy('env-node-fake', ENV_NODE) }), access: () => acc, log: spyLog });
  const e5 = await k5.machine.launch({ remoteapp: { hostId: HOST, program: PROGRAM } }, { remoteappDoor: true }).then(() => null, (e) => e);
  ok(e5 && e5.code === 'rdp_client_unknown' && /env: .node.: No such file or directory/.test(e5.message) && k5.machine.listApps().length === 0 && acc.forwards().length === 0, 'RED CONTROL: an `#!/usr/bin/env node` fake under the same PATH ⇒ rdp_client_unknown in the runner\'s words ("/usr/bin/env: \'node\': No such file or directory"), no record, no forward', e5 && e5.message);
  const f6 = await D.rdpBuildFacts(copy('env-node-fake-2', ENV_NODE), { env: { PATH: `${path.dirname(process.execPath)}:${NO_NODE}` } });
  ok(/^This is FreeRDP version 3\.32\.1 \(fake\)/.test(f6.version), '…and with node put back on that PATH the same fake answers its version — the red is a fake that needs node, not the runner', f6);
});

await section('CONTROLS — each sink / rule proven able to fail', async () => {
  const S = fs.readFileSync(path.join(repo, 'src/desktop-serve.js'), 'utf8');
  const RAsrc = fs.readFileSync(path.join(repo, 'src/remoteapp.js'), 'utf8');
  const cut = (src, from, to) => { if (src.split(from).length !== 2) throw new Error(`anchor not unique: ${from.slice(0, 70)}`); return src.replace(from, to); };
  const runMutant = async (tag, src, { setupOver = {}, envOver = {} } = {}) => {
    const DSm = MUT.load('src/desktop-serve.js', src, tag);
    let dsm = null;
    const accm = A.create({ hosts, local: () => dsm, install: false, rdpSetup: async () => ({ user: 'someone', domain: '', certFp: FP, password: () => PW, ...setupOver }), log: spyLog });
    dsm = DSm.install({ dataDir: path.join(root, `mut-${tag}`), env: baseEnv(envOver), display: stubDisplay({ xfreerdp: FAKE }), log: spyLog, remoteapp: { setup: (h) => accm.remoteappSetup(h), forward: (h) => accm.remoteappForward(h) } });
    const v = await accm.launchRemoteApp(HOST, { program: PROGRAM });
    const r = await until(() => { const x = dsm.get(v.id); return x && x.state !== 'launching' ? x : null; }, 10000);
    const saw = await until(() => { const s = fakeSaw(r && r.pids.app); return s.some((x) => ['connected', 'end'].includes(x.phase)) ? s : null; }, 6000);
    return { dsm, accm, rec: dsm.get(v.id), saw: saw || [], stop: async () => { await dsm.stop(v.id).catch(() => { }); await until(() => accm.forwards().length === 0, 5000); } };
  };
  const n0 = said.length;
  const c1 = await runMutant('log', cut(S, '        seat.password = null;', "        seat.password = null; console.log('[desktop] RemoteApp sign-in', stdinLine);"));
  ok(said.slice(n0).join('\n').includes(PW), 'CONTROL: a planted console.log of the password ⇒ the console sink sees it (§2 would be red)');
  await c1.stop();
  const c2 = await runMutant('argv', cut(S, "rec = M.newRecord({ id, label: rq.name, exec, args: av.argv,", "rec = M.newRecord({ id, label: rq.name, exec, args: [...av.argv, '/p:' + String(setup.password())],"));
  const cmd2 = c2.rec && c2.rec.pids.app ? fs.readFileSync(`/proc/${c2.rec.pids.app}/cmdline`) : Buffer.alloc(0);
  ok(JSON.stringify(c2.rec && c2.rec.args).includes(PW) && cmd2.includes(PW_BYTES), 'CONTROL: an argv `/p:` mutant ⇒ the record\'s argv and /proc cmdline sinks see the password (§2 would be red)');
  await c2.stop();
  // the stored-certificate hole, with the client's own XDG_CONFIG_HOME removed
  const S3 = cut(S, 'env: seat ? { ...appEnv, XDG_CONFIG_HOME: seat.configDir } : appEnv,', 'env: appEnv,');
  const DS3 = MUT.load('src/desktop-serve.js', S3, 'noxdg');
  let ds3 = null;
  const acc3 = A.create({ hosts, local: () => ds3, install: false, rdpSetup: async () => ({ user: 'someone', domain: '', certFp: randFp(), password: () => PW }), log: spyLog });
  ds3 = DS3.install({ dataDir: path.join(root, 'mut-noxdg'), env: baseEnv(), display: stubDisplay({ xfreerdp: FAKE }), log: spyLog, remoteapp: { setup: (h) => acc3.remoteappSetup(h), forward: (h) => acc3.remoteappForward(h) } });
  const h3 = await acc3.forwardPort(HOST, 3389);
  const storeDir = path.join(home, '.config', 'freerdp', 'server'); fs.mkdirSync(storeDir, { recursive: true });
  fs.writeFileSync(path.join(storeDir, `127.0.0.1_${h3.localPort}.pem`), '-----BEGIN CERTIFICATE-----\nstored-by-an-earlier-tofu\n-----END CERTIFICATE-----\n');
  const v3 = await acc3.launchRemoteApp(HOST, { program: PROGRAM });
  const r3 = await until(() => { const x = ds3.get(v3.id); return x && x.state !== 'launching' ? x : null; });
  const saw3 = await until(() => { const s = fakeSaw(r3 && r3.pids.app); return s.some((x) => ['connected', 'end'].includes(x.phase)) ? s : null; }, 6000);
  ok(saw3 && saw3.some((x) => x.phase === 'connected'), 'CONTROL: without the client\'s own XDG_CONFIG_HOME a stored TOFU certificate beats a wrong pin — it CONNECTS (§4\'s stored-certificate leg would be red)', saw3 && saw3.map((x) => x.phase));
  await ds3.stop(v3.id).catch(() => { }); h3.close(); await until(() => acc3.forwards().length === 0, 5000);
  // `/d:` dropped (the design's optional [/d:]) — the copy of desktop-serve requires a patched remoteapp
  const raNoD = MUT.write('src/remoteapp.js', cut(RAsrc, "`/d:${d.value || ''}`, '/from-stdin'", "...(d.value ? [`/d:${d.value}`] : []), '/from-stdin'"), 'nod');
  const c4 = await runMutant('nod', cut(S, "const RA = require('./remoteapp');", `const RA = require(${JSON.stringify(raNoD)});`));
  const st4 = c4.saw.find((x) => x.phase === 'stdin');
  const end4 = await endedWhy(() => c4.dsm.get(c4.rec.id), 6000);
  ok(st4 && st4.domainFromStdin === true && st4.password === null && end4 && end4.rdp.ended === 'rdp_cancelled', 'CONTROL: without `/d:` the fake reads the password line as the DOMAIN, has no password, and the session ends cancelled (§1 would be red)', { st4, ended: end4 && end4.rdp });
  await c4.stop();
});

await section('CONTROLS — the door check', async () => {
  const S0 = fs.readFileSync(path.join(repo, 'src/desktop-serve.js'), 'utf8');
  const noDoorSrc = S0.split("      if (opts.remoteappDoor !== true) throw namedError('remoteapp_door',");
  if (noDoorSrc.length !== 2) throw new Error('door anchor not unique');
  const DSd = MUT.load('src/desktop-serve.js', noDoorSrc[0] + "      if (false) throw namedError('remoteapp_door'," + noDoorSrc[1], 'nodoor');
  let dsd = null;
  const accd = A.create({ hosts, local: () => dsd, install: false, rdpSetup: async () => ({ user: 'someone', domain: '', certFp: FP, password: () => PW }), log: spyLog });
  dsd = DSd.install({ dataDir: path.join(root, 'mut-nodoor'), env: baseEnv(), display: stubDisplay({ xfreerdp: FAKE }), log: spyLog, remoteapp: { setup: (h) => accd.remoteappSetup(h), forward: (h) => accd.remoteappForward(h) } });
  const vd = await dsd.launch({ remoteapp: { hostId: HOST, program: PROGRAM } }).then((v) => v, (e) => e);
  ok(vd && vd.id && vd.backend === 'remoteapp', 'CONTROL: without the door check the GENERIC launch starts a RemoteApp (the fence-4 leg would be red)', vd && (vd.id || vd.message));
  if (vd && vd.id) { await until(() => { const x = dsd.get(vd.id); return x && x.state !== 'launching' ? x : null; }); await dsd.stop(vd.id).catch(() => { }); await until(() => accd.forwards().length === 0, 5000); }
});

// ═══ LANE REMOTEAPP-R1B — the sealed row (§8) + its sinks (§9) ═══
const IS = require(path.join(repo, 'src/server/integration-store.js'));
const RAm = require(path.join(repo, 'src/remoteapp.js'));
const PEM_A = path.join(repo, 'scripts/fixtures/remoteapp/server-a.pem'), PEM_B = path.join(repo, 'scripts/fixtures/remoteapp/server-b.pem');
const fpOf = (f) => new crypto.X509Certificate(fs.readFileSync(f)).fingerprint256.toLowerCase();
const PW2 = ['Kp', crypto.randomBytes(5).toString('hex'), '!z9'].join('');
const sealedDir = path.join(root, 'data-sealed');
const sFrames = [], audits = [];
let serverPem = PEM_A, leak = '0';
const storeS = IS.create({ dataDir: sealedDir, env: {}, broadcast: (m) => sFrames.push(JSON.stringify(m)), log: spyLog });
let factsAnswer = null;
const dmS = { ...dm, remoteappFacts: async () => { if (factsAnswer === 'old') { const e = new Error('daemon lacks remoteapp-facts (capabilities gate)'); e.code = 'host_needs_daemon'; e.daemonVersion = '2.369.250'; throw e; } return factsAnswer; } };
const hostsS = { ...hosts, deviceBounded: async () => dmS };
let keeperS = null;
const accS = A.create({ hosts: hostsS, local: () => keeperS.machine, install: false, integrations: storeS, audit: (line) => { audits.push(JSON.stringify(line)); return line; }, log: spyLog });
// the server's fingerprint is PASSED (the sh fake parses no certificate); its PEM is only what `/cert:tofu` stores
const sealedEnv = (over = {}) => () => ({ ...baseEnv()(), VS_FAKE_RDP_SERVER_FP: fpOf(serverPem), VS_FAKE_RDP_SERVER_PEM: serverPem, VS_FAKE_RDP_PASSWORD_SHA256: sha(PW2), VS_FAKE_RDP_LEAK: leak, ...over });
keeperS = K.create({ dataDir: sealedDir, env: sealedEnv(), broadcast: (m) => frames.push(JSON.stringify(m)), display: stubDisplay({ xfreerdp: FAKE }), access: () => accS, log: spyLog, serverSetting: () => undefined });
R.setup({ keeper: keeperS, access: accS, vnc: {} });
const answers = [];
const postS = async (url, body, headers) => { const r = await post(url, body, headers); answers.push(r.text); return { ...r, json: (() => { try { return JSON.parse(r.text); } catch { return null; } })() }; };
const getS = async (url, headers = {}) => { const r = await fetch(base + url, { headers }); const text = await r.text(); answers.push(text); return { status: r.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() }; };
const startOf = (pid) => (fakeSaw(pid).find((x) => x.phase === 'start') || {});
const lastTrustRun = () => { const all = recRows(); const st = all.filter((x) => x.phase === 'start' && x.argv.includes('/auth-only')).pop(); return st ? all.filter((x) => x.pid === st.pid) : []; };
let sealedRec = null;
const settleS = (id, ms = 10000) => until(() => { const r = keeperS.get(id); return r && r.state !== 'launching' ? r : null; }, ms);
const endedS = (id, ms = 10000) => until(() => { const r = keeperS.get(id); return r && !['launching', 'ready'].includes(r.state) ? r : null; }, ms);
await section('§8 the sealed row — the card\'s doors, the first connection, the launch reads the store', async () => {
  const AG = { authorization: 'Bearer ' + 'v'.repeat(8) };
  const ag = [await getS(`/api/desktop/machine-desktop/remoteapp/setup?host=${HOST}`, AG), await getS(`/api/desktop/machine-desktop/remoteapp/facts?host=${HOST}`, AG), await postS('/api/desktop/machine-desktop/remoteapp/setup', { host: HOST, user: 'x', password: PW2 }, AG), await postS('/api/desktop/machine-desktop/remoteapp/trust', { host: HOST }, AG)];
  ok(ag.every((r) => r.status === 403 && r.json.code === 'human_only') && storeS.machineView('remoteapp', HOST).hasValues === false, 'an agent token on every door of the card (setup GET / POST, facts, trust) ⇒ 403 human_only, nothing stored — no agent turn can carry a sign-in (the transcript sink)', ag.map((r) => r.status));
  const sv = await postS('/api/desktop/machine-desktop/remoteapp/setup', { host: HOST, user: 'someone', password: PW2, certFp: 'aa:' + 'bb:'.repeat(30) + 'cc' });
  ok(sv.status === 200 && sv.json.setup.set.password === true && sv.json.setup.values.user === 'someone' && sv.json.setup.values.certFp === '' && !sv.text.includes(PW2), 'save: the password SEALED (the answer says "set", never its bytes); a certFp in the body is NOT taken (only the first connection pins one)', sv.json);
  const file = fs.readFileSync(path.join(sealedDir, 'integrations.json'), 'utf8');
  ok(file.includes(`remoteapp/${HOST}`) && !file.includes(PW2) && storeS.resolveMachine('remoteapp', HOST).values.password === PW2, 'integrations.json holds remoteapp/<hostId> with the password as ciphertext; the store opens it for its consumer');
  const bad = await postS('/api/desktop/machine-desktop/remoteapp/setup', { host: HOST, password: 'two\nlines' });
  ok(bad.status === 400 && bad.json.code === 'invalid-values' && /password: one line/.test(bad.json.error), 'a password with a line break (it is ONE stdin line) ⇒ 400 invalid-values by name, nothing changed', bad.json);
  const nopin = await postS('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: PROGRAM });
  ok(nopin.status === 409 && nopin.json.code === 'remoteapp_needs_setup' && JSON.stringify(nopin.json.missing) === '["certificate"]' && /press First connection on its RemoteApp settings card/.test(nopin.json.error) && accS.forwards().length === 0, 'saved but not pinned ⇒ the launch is refused naming First connection; nothing opened', nopin.json);
  // the first connection
  const tr = await postS('/api/desktop/machine-desktop/remoteapp/trust', { host: HOST });
  const run = lastTrustRun();
  const st = run.find((x) => x.phase === 'start'), stdin = run.find((x) => x.phase === 'stdin');
  ok(tr.status === 200 && tr.json?.setup?.values?.certFp === fpOf(PEM_A) && tr.json.setup.missing.length === 0 && tr.json.setup.changed === false, 'the first connection PINS the machine certificate\'s sha256 (the fixture server-a\'s) on the sealed row', tr.json);
  ok(st && JSON.stringify(st.argv.slice(1)) === JSON.stringify(['/u:someone', '/d:', '/from-stdin:force', '/cert:tofu', '/auth-only', '/log-level:WARN']) && /^\/v:127\.0\.0\.1:\d+$/.test(st.argv[0]) && !st.argv.some((x) => /\/app:/.test(x)) && st.env.DISPLAY === null, 'its argv: the forward, /u:, /d:, /from-stdin:force, /cert:tofu, /auth-only — NO app, no display', st && st.argv);
  ok(stdin && stdin.lines === 1 && stdin.password.sha256 === sha(PW2) && run.some((x) => x.why === 'auth-only-ok'), 'it read ONE stdin line = the sealed password (sha256), and signed in', stdin);
  ok(st && /\/rdp-trust-da-[\w-]+$/.test(st.env.XDG_CONFIG_HOME) && st.env.XDG_CONFIG_HOME.startsWith(keeperS.logRoot) && !fs.existsSync(st.env.XDG_CONFIG_HOME) && accS.forwards().length === 0, 'its OWN fresh config dir (under the keeper\'s dir) is gone after; the forward closed', st && st.env.XDG_CONFIG_HOME);
  ok(audits.some((a) => /"verb":"remoteapp-trust"/.test(a) && a.includes(fpOf(PEM_A)) && /"ok":true/.test(a)) && audits.some((a) => /"verb":"remoteapp-setup"/.test(a) && /"fields":\["user","password"\]/.test(a)), 'one audit line per change: the setup (the field NAMES) and the first connection (the pin) — never a value', audits);
  // the launch reads the sealed row
  const l = await postS('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: PROGRAM });
  sealedRec = l.json && l.json.id ? await settleS(l.json.id) : null;
  const pid = sealedRec && sealedRec.pids.app;
  const saw = await until(() => { const sw = fakeSaw(pid); return sw.some((x) => x.phase === 'connected') ? sw : null; }, 8000);
  const ls = saw && saw.find((x) => x.phase === 'stdin');
  ok(sealedRec && sealedRec.state === 'ready' && sealedRec.rdp.certFp === fpOf(PEM_A) && startOf(pid).argv.includes(`/cert:deny,fingerprint:sha256:${fpOf(PEM_A)}`) && ls && ls.password.sha256 === sha(PW2), 'the launch reads the SEALED row: the pinned certificate in its argv, the sealed password on its stdin', { state: sealedRec && sealedRec.state, ls });
  const busy = await postS('/api/desktop/machine-desktop/remoteapp/trust', { host: HOST });
  ok(busy.status === 409 && busy.json?.code === 'rdp_session_busy' && !!sealedRec && busy.json.error.includes(sealedRec.id), 'a first connection while a session runs ⇒ 409 rdp_session_busy naming it', busy.json);
  const fw = accS.forwards();
  ok(fw.length === 1 && fw[0].localPort === sealedRec?.rdp?.port && fw[0].remotePort === 3389, 'one loopback forward to the machine\'s 3389 (the hub side 127.0.0.1 only)');
  // a relaunch reads the row AGAIN: a password changed meanwhile is the one handed over
  const PW3 = PW2 + 'Q';
  await postS('/api/desktop/machine-desktop/remoteapp/setup', { host: HOST, password: PW3 });
  const rl = sealedRec ? await keeperS.relaunch(sealedRec.id, { scale: 1 }).catch(() => null) : null;
  const b = rl && rl.app ? await until(() => { const x = keeperS.get(rl.app.id); return x && x.state !== 'launching' ? x : null; }) : null;
  const sawB = await until(() => { const sw = fakeSaw(b && b.pids.app); return sw.some((x) => ['connected', 'end'].includes(x.phase)) ? sw : null; }, 8000);
  const stB = sawB && sawB.find((x) => x.phase === 'stdin');
  ok(stB && stB.password.sha256 === sha(PW3), 'the relaunch read the sealed row AGAIN — the password saved meanwhile is the one on its stdin (never carried from the first launch)', stB);
  if (b) await keeperS.machine.stop(b.id).catch(() => { }); await until(() => accS.forwards().length === 0);
  await postS('/api/desktop/machine-desktop/remoteapp/setup', { host: HOST, password: PW2 });
  // a changed certificate
  serverPem = PEM_B;
  const c = await postS('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: PROGRAM });
  const ce = c.json && c.json.id ? await endedS(c.json.id) : null;
  const gv = await getS(`/api/desktop/machine-desktop/remoteapp/setup?host=${HOST}`);
  ok(ce && ce.rdp.ended === 'rdp_cert_changed' && gv.json?.setup?.refused?.code === 'rdp_cert_changed' && gv.json.setup.refused.id === ce.id, 'the machine shows ANOTHER certificate ⇒ the launch ends rdp_cert_changed, and the card\'s view says refused (under the pin still in force)', { ended: ce && ce.rdp, refused: gv.json?.setup?.refused });
  await until(() => accS.forwards().length === 0);
  const re = await postS('/api/desktop/machine-desktop/remoteapp/trust', { host: HOST });
  ok(re.status === 200 && re.json?.setup?.values?.certFp === fpOf(PEM_B) && re.json.setup.changed === true && re.json.setup.refused === null && audits.some((a) => a.includes(`"replaced":"${fpOf(PEM_A)}"`)), '「重新信任」 pins the new certificate (changed, the old one named in the audit line), and the refusal no longer stands', re.json && re.json.setup && { fp: re.json.setup.values.certFp, changed: re.json.setup.changed, refused: re.json.setup.refused, audit: audits.slice(-1) });
  const l2 = await postS('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: PROGRAM });
  const r2 = l2.json && l2.json.id ? await settleS(l2.json.id) : null;
  ok(r2 && r2.state === 'ready' && r2.rdp.certFp === fpOf(PEM_B), 'the next launch connects under the new pin');
  if (r2) await keeperS.machine.stop(r2.id).catch(() => { }); await until(() => accS.forwards().length === 0);
  // a wrong password at the first connection pins nothing
  await postS('/api/desktop/machine-desktop/remoteapp/setup', { host: HOST, password: PW2 + 'x' });
  serverPem = PEM_A;
  const wp = await postS('/api/desktop/machine-desktop/remoteapp/trust', { host: HOST });
  ok(wp.status === 409 && wp.json.code === 'rdp_auth_failed' && /nothing was pinned/.test(wp.json.error) && storeS.machineView('remoteapp', HOST).values.certFp === fpOf(PEM_B) && accS.forwards().length === 0, 'a wrong password ⇒ 409 rdp_auth_failed, the pin unchanged (the certificate it was shown is NOT taken), the forward closed', wp.json);
  await postS('/api/desktop/machine-desktop/remoteapp/setup', { host: HOST, password: PW2 });
  serverPem = PEM_B;
  // the facts door
  factsAnswer = RAm.parseRemoteappFacts(JSON.stringify({ t: 'remoteapp-facts', edition: 'Core', product: 'Windows 11 Home', deny: '1', listening: 0, allowList: null, gpu: null }));
  const fh = await getS(`/api/desktop/machine-desktop/remoteapp/facts?host=${HOST}`);
  ok(fh.status === 200 && fh.json.ok && fh.json.ready === false && JSON.stringify(fh.json.rows.map((r) => r.code)) === '["edition_home","rdp_off","allowlist_off","gpu_off"]', 'the facts door: a Home machine with Remote Desktop off ⇒ its rows, each unmet with its sentence code, not ready', fh.json);
  factsAnswer = 'old';
  const fo = await getS(`/api/desktop/machine-desktop/remoteapp/facts?host=${HOST}`);
  ok(fo.status === 200 && fo.json.code === 'agent_too_old' && fo.json.have === '2.369.250' && fo.json.need === require(path.join(repo, 'package.json')).version, 'an agent that predates the op ⇒ agent_too_old naming the version it has and the one it needs (this hub\'s), never asked', fo.json);
  // verify r1 (RED low): two first connections at ONCE while the client's build read is cold (a boot's first pair of clicks) ⇒ ONE
  // `/auth-only` run and one rdp_trust_busy — the mark is taken with the check, before any await. CONTROL: the pre-fix order
  // (the mark after the build read + the sign-in) runs the client twice.
  const authStarts = () => (fs.existsSync(recFile) ? fs.readFileSync(recFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.phase === 'start' && x.argv.includes('/auth-only')).length : 0);
  const slowBuild = { rdpBuildFacts: async (...a) => { await sleep(200); return D.rdpBuildFacts(...a); } };
  const racePair = async (DSmod, tag) => {
    let ds = null;
    const accR = A.create({ hosts: hostsS, local: () => ds, install: false, integrations: storeS, log: spyLog });
    ds = DSmod.install({ dataDir: path.join(root, `race-${tag}`), env: sealedEnv(), display: { ...stubDisplay({ xfreerdp: FAKE }), ...slowBuild }, log: spyLog, remoteapp: { setup: (h) => accR.remoteappSetup(h), forward: (h) => accR.remoteappForward(h), signin: (h) => accR.remoteappSignin(h) } });
    const before = authStarts();
    const codes = await Promise.all([accR.trustRemoteApp(HOST).then(() => 'ok', (e) => e.code), accR.trustRemoteApp(HOST).then(() => 'ok', (e) => e.code)]);
    await until(() => accR.forwards().length === 0, 5000);
    return { codes, runs: authStarts() - before };
  };
  const DSreal = require(path.join(repo, 'src/desktop-serve.js'));
  const fixed = await racePair(DSreal, 'fixed');
  ok(fixed.runs === 1 && fixed.codes.includes('rdp_trust_busy') && fixed.codes.includes('ok'), 'two first connections at once with a COLD build read ⇒ one runs, the other is refused rdp_trust_busy — ONE /auth-only sign-in to the machine', fixed);
  const Ssrc = fs.readFileSync(path.join(repo, 'src/desktop-serve.js'), 'utf8');
  const cutR = (src, from, to) => { if (src.split(from).length !== 2) throw new Error(`anchor not unique: ${from.slice(0, 70)}`); return src.replace(from, to); };
  const markLine = "    rdpTrusting.add(hostId); // taken with the check, BEFORE any await (verify r1: two clicks during a cold build read both ran /auth-only)\n";
  const signLine = "      const signin = await remoteapp.signin(hostId); // refuses a missing user / password BY NAME\n";
  const preFix = MUT.load('src/desktop-serve.js', cutR(cutR(Ssrc, markLine, ''), signLine, signLine + '      rdpTrusting.add(hostId);\n'), 'trust-race');
  const ctl = await racePair(preFix, 'prefix');
  ok(ctl.runs === 2 && !ctl.codes.includes('rdp_trust_busy'), 'CONTROL: with the mark taken after the build read + the sign-in (the pre-fix order) BOTH clicks run /auth-only — the leg above would be red', ctl);
});

await section('§9 THE SINKS of the sealed chain — the password only in the sealed record and the child\'s stdin', async () => {
  // a client that PRINTS the password (VS_FAKE_RDP_LEAK) — its app.log is scrubbed at the session's teardown
  leak = '1';
  const l = await postS('/api/desktop/machine-desktop/remoteapp', { host: HOST, program: PROGRAM });
  const r = await settleS(l.json.id);
  const pid = r && r.pids.app;
  await until(() => fakeSaw(pid).some((x) => x.phase === 'connected'), 8000);
  const logFile = path.join(keeperS.logRoot, r.id, 'app.log');
  const printed = await until(() => fs.readFileSync(logFile, 'utf8').includes(`password=${PW2}`), 4000);
  const holds = (b) => Buffer.isBuffer(b) ? b.includes(Buffer.from(PW2)) : String(b).includes(PW2);
  const sinks = [];
  const look = (name, data) => sinks.push([name, holds(data)]);
  look('/proc/<pid>/cmdline', fs.readFileSync(`/proc/${pid}/cmdline`));
  look('/proc/<pid>/environ', fs.readFileSync(`/proc/${pid}/environ`));
  look('the record\'s argv', JSON.stringify(r.args));
  await post(`/api/desktop/apps/${r.id}/stop`, {}); const end = await endedS(r.id);
  await until(() => accS.forwards().length === 0);
  leak = '0';
  look('app.log (after its teardown)', fs.readFileSync(logFile));
  look('the record (lastError included)', JSON.stringify(end));
  const gv = await getS(`/api/desktop/machine-desktop/remoteapp/setup?host=${HOST}`);
  look('the machine view (GET …/remoteapp/setup)', gv.text);
  look('the store\'s machineView', JSON.stringify(storeS.machineView('remoteapp', HOST)));
  look(`every answer of the card's routes (${answers.length})`, answers.join('\n'));
  look('console', said.join('\n'));
  look('keeper + access + store logs', logs.join('\n'));
  look('desktop-apps.json', fs.readFileSync(path.join(sealedDir, 'desktop-apps.json')));
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.isFile() ? [path.join(d, e.name)] : []));
  const files = walk(sealedDir);
  look(`every file under the data dir (${files.length}, integrations.json included)`, Buffer.concat(files.map((f) => fs.readFileSync(f))));
  look(`every WS broadcast — keeper + store (${frames.length + sFrames.length})`, frames.join('\n') + sFrames.join('\n'));
  look(`every audit row (${audits.length})`, audits.join('\n'));
  const gl = await get('/api/desktop/apps'); const gi = await get(`/api/desktop/apps/${r.id}`);
  look('GET /api/desktop/apps', gl.text); look('GET /api/desktop/apps/:id', gi.text);
  look('the access layer\'s forwards()', JSON.stringify(accS.forwards()));
  const leaked = sinks.filter(([, h]) => h).map(([n]) => n);
  ok(printed && leaked.length === 0 && sinks.length === 17, `the client PRINTED it (app.log held it while it ran) — and the password is in 0 of ${sinks.length} sinks after (${sinks.map(([n]) => n).join(' · ')})`, { printed, leaked });
  ok(files.some((f) => f.endsWith('integrations.json')) && sFrames.length >= 4 && audits.length >= 4 && answers.length >= 10, 'the sinks were live: the sealed file, the store broadcasts, the audit rows and the route answers exist');
  ok(storeS.resolveMachine('remoteapp', HOST).values.password === PW2, 'the ONE readable place: the sealed record, opened by its consumer\'s resolveMachine');
  // CONTROLS
  const cut = (src, from, to) => { if (src.split(from).length !== 2) throw new Error(`anchor not unique: ${from.slice(0, 70)}`); return src.replace(from, to); };
  const ISsrc = fs.readFileSync(path.join(repo, 'src/server/integration-store.js'), 'utf8');
  const leakView = MUT.load('src/server/integration-store.js', cut(ISsrc, '      if (!f.secret) values[f.key] = set[f.key] ? String(v) : \'\';', '      values[f.key] = set[f.key] ? String(v) : \'\';'), 'viewleak');
  const ctlStore = leakView.create({ dataDir: sealedDir, env: {}, broadcast: () => { }, log: spyLog });
  ok(holds(JSON.stringify(ctlStore.machineView('remoteapp', HOST))), 'CONTROL: a machine view that draws the secret field like a plain one ⇒ the view sink sees the password (§8 would be red)');
  const Ssrc = fs.readFileSync(path.join(repo, 'src/desktop-serve.js'), 'utf8');
  const DSn = MUT.load('src/desktop-serve.js', cut(Ssrc, '    if (rec.rdp) await scrubRdpLogFile(rec.id); // lane remoteapp-r1b: its log at rest holds no password shape', '    // (no scrub)'), 'noscrub');
  let dsn = null;
  const accN = A.create({ hosts: hostsS, local: () => dsn, install: false, integrations: storeS, log: spyLog });
  dsn = DSn.install({ dataDir: path.join(root, 'mut-noscrub'), env: sealedEnv({ VS_FAKE_RDP_SERVER_FP: fpOf(PEM_B), VS_FAKE_RDP_SERVER_PEM: PEM_B, VS_FAKE_RDP_LEAK: '1' }), display: stubDisplay({ xfreerdp: FAKE }), log: spyLog, remoteapp: { setup: (h) => accN.remoteappSetup(h), forward: (h) => accN.remoteappForward(h), signin: (h) => accN.remoteappSignin(h) } });
  const vn = await accN.launchRemoteApp(HOST, { program: PROGRAM });
  const rn = await until(() => { const x = dsn.get(vn.id); return x && x.state !== 'launching' ? x : null; });
  const logN = path.join(root, 'mut-noscrub', 'desktop-apps', vn.id, 'app.log');
  await until(() => fakeSaw(rn && rn.pids.app).some((x) => x.phase === 'connected'), 8000);
  await until(() => fs.existsSync(logN) && fs.readFileSync(logN, 'utf8').includes('password='), 4000);
  await dsn.stop(vn.id).catch(() => { }); await until(() => { const x = dsn.get(vn.id); return x && !['launching', 'ready'].includes(x.state); }); await until(() => accN.forwards().length === 0, 5000);
  ok(fs.existsSync(logN) && holds(fs.readFileSync(logN)), 'CONTROL: without the teardown scrub the printed password stays in app.log (§8\'s app.log sink would be red)', fs.existsSync(logN) ? fs.readFileSync(logN, 'utf8').slice(-300) : 'no log at ' + logN);
});

await section('§R the fake\'s record — every line ONE JSON object, even when a stop kills its clock mid-line (lane race-sweep)', async () => {
  recRows();
  ok(recSeen.torn.size === 0, `every record line the fake wrote in §1–§9 is ONE JSON object (${recSeen.torn.size} torn)`, [...recSeen.torn].slice(0, 3));
  if (recSeen.clockless.size) console.log(`  · the fake's clock failed ${recSeen.clockless.size}× (a stop's SIGTERM met its date child) — those lines say at 0: ${[...recSeen.clockless].map((l) => l.slice(0, 90)).join(' | ')}`);
  // the moment, made deterministic: a `date` that dies of SIGTERM before it prints (what the keeper's group stop does to it)
  const bin = path.join(root, 'clock-dies'); fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'date'), '#!/bin/sh\nkill -TERM $$\n', { mode: 0o755 });
  const runFake = (exe, file) => spawnSync(exe, ['/v:127.0.0.1:9', '/d:x', '/from-stdin'], { env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, VS_FAKE_RDP_RECORD: file, VS_FAKE_RDP_WINDOW: '0' }, input: '', encoding: 'utf8', timeout: 10000 });
  const fixedFile = path.join(root, 'clock-dies-fixed.jsonl');
  runFake(FAKE, fixedFile);
  const fx = readRecord(fixedFile);
  ok(fx.rows.length >= 2 && fx.torn.length === 0 && fx.rows.every((r) => r.at === 0 && r.clock_unknown === 'date exit 143'), `the fake with a clock killed by SIGTERM: ${fx.rows.length} lines, every one JSON — at 0 + clock_unknown "date exit 143" (phases ${fx.rows.map((r) => r.phase).join(' · ')})`, fx);
  const fakeSrc = fs.readFileSync(FAKE, 'utf8');
  const pre = fakeSrc.replace(/^record\(\) \{\n[\s\S]*?\n\}\n/m, () => 'record() { [ -z "$REC" ] || printf \'{"pid":%s,"at":%s000,%s}\\n\' "$$" "$(date +%s)" "$1" >>"$REC"; }\n');   // a function: `$$` in a replacement STRING is one `$`
  ok(pre !== fakeSrc && pre.includes('"at":%s000,%s}\\n\' "$$" "$(date +%s)"') && !/^record\(\) \{$/m.test(pre), 'PATCH LANDED: the control fake writes the record line the pre-fix way (`"at":$(date +%s)000`)');
  const preExe = path.join(root, 'xfreerdp-pre-race-sweep'); fs.writeFileSync(preExe, pre, { mode: 0o755 });
  const preFile = path.join(root, 'clock-dies-pre.jsonl');
  runFake(preExe, preFile);
  const px = readRecord(preFile);
  ok(px.torn.length >= 2 && px.torn.every((l) => /"at":000,/.test(l)) && px.rows.length === 0, `CONTROL: the pre-fix fake under the same dying clock writes ${px.torn.length} TORN lines (\`"at":000\` — invalid JSON) and the reader names them, never throws (the pre-fix suite threw "Unexpected number in JSON" in every later section)`, px);
  // THE MEASURED MOMENT, made deterministic: the keeper's stop SIGTERMs the fake's whole group (sid == pid) while record()
  // waits on its clock — a `date` that blocks until that signal (the first call only; a later one is the real date)
  const slow = path.join(root, 'clock-blocks'); fs.mkdirSync(slow, { recursive: true });
  fs.writeFileSync(path.join(slow, 'date'), '#!/bin/sh\nif [ -e "$VS_RS_CLOCK_MARK" ]; then exec /usr/bin/date "$@"; fi\n: > "$VS_RS_CLOCK_MARK"\nexec sleep 30\n', { mode: 0o755 });
  const stopMidClock = async (exe, tag) => {
    const file = path.join(root, `stop-mid-clock-${tag}.jsonl`), mark = path.join(root, `stop-mid-clock-${tag}.mark`);
    const ch = spawn(exe, ['/v:127.0.0.1:9', '/d:x', '/from-stdin'], { detached: true, stdio: ['pipe', 'ignore', 'ignore'], env: { PATH: `${slow}:/usr/bin:/bin`, HOME: home, VS_FAKE_RDP_RECORD: file, VS_FAKE_RDP_WINDOW: '0', VS_RS_CLOCK_MARK: mark } });
    const exited = new Promise((r) => ch.on('exit', (code, sig) => r({ code, sig })));
    const inClock = await until(() => fs.existsSync(mark), 10000, 5);   // its first record is waiting on the clock NOW
    if (inClock) process.kill(-ch.pid, 'SIGTERM');                        // the keeper's stop: the group first
    const how = await Promise.race([exited, sleep(10000).then(() => ({ code: 'no exit' }))]);
    try { process.kill(-ch.pid, 'SIGKILL'); } catch { /* gone */ }
    return { inClock: !!inClock, ...how, ...readRecord(file) };
  };
  const mf = await stopMidClock(FAKE, 'fixed');
  ok(mf.inClock && mf.code === 145 && mf.torn.length === 0 && mf.rows.length >= 1 && mf.rows[mf.rows.length - 1].phase === 'signal',
    `THE MOMENT (the stop's group SIGTERM while record() waits on its clock): the fixed fake writes NO torn line — its TERM trap runs before the line, it ends on its "signal" line (exit ${mf.code}; phases ${mf.rows.map((r) => r.phase).join(' · ') || 'none'})`, mf);
  const mp = await stopMidClock(preExe, 'pre');
  ok(mp.inClock && mp.torn.length === 1 && /^\{"pid":\d+,"at":000,"phase":"start"/.test(mp.torn[0] || ''), `CONTROL: the pre-fix fake at the same moment writes the TORN line the runner saw (${(mp.torn[0] || 'none').slice(0, 40)}…) — the date died inside the printf that wrote it`, { inClock: mp.inClock, code: mp.code, torn: mp.torn.map((l) => l.slice(0, 80)), phases: mp.rows.map((r) => r.phase) });
});

for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 7 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

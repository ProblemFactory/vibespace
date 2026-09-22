#!/usr/bin/env node
// DESKTOP-APP KEEPER — end to end on a REAL Xvfb + x11vnc (docs/design-desktop-apps
// §6 row 3, P8-1, 2026-09-13): launch → the port listens → an RFB handshake
// over `net` → the record is on disk → the keeper PROCESS is SIGKILLed and a
// new keeper on the same data dir ADOPTS the session (pid+starttime+port) →
// stop is clean (every recorded pid gone, the /proc census of processes on
// this keeper's display equal before and after, no orphan X) — plus the ONE
// ws bridge (401 without the cookie, 404 for an unknown id, 501 by name for an
// xpra target, bytes relayed, input reported), the routes (host refusal),
// the idle timeout, keep-alive, the cap, and the runaway guard tripped by a
// CPU burner with the shared limits shrunk. §8 (r2, 2026-09-14) reproduces
// the round-1 verifier's findings on the REAL keeper and closes each with a
// control: a picture server whose binary vanished after the probe (a spawn
// `error` used to be an UNCAUGHT exception and the X it had started an
// unrecorded orphan), a wrapper that forks (stop used to signal three pids
// and leave the child), a port whose 127.0.0.1 listener is a stranger that
// speaks RFB (x11vnc keeps the number on [::1]; the record used to turn
// `ready` on somebody else's display), a burner in a CHILD (the guard used
// to sample one pid), the shared desktop's cached `running:false` at boot
// (used to reap a live app), the keeper's bring-up as a TABLE LOOKUP (a
// fourth rung = one row, driven end to end), and this suite's OWN exit
// sweep, which used to SIGKILL by bare pid — including the pid it had
// recorded as a fixture: this process (ALL PASS, then exit 137). SKIPs with
// the reason when Xvfb/x11vnc are absent. Per-pid scratch, free ports, no
// fixed names; the patched keeper copies (negative controls) are siblings of
// the real module, gitignored (src/server/vs-dak-mut-*.js), swept by PID.
// Run: node scripts/test-desktop-app-keeper.mjs
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const skip = (why) => { skipped++; console.log(`  ⚠ SKIP: ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 100) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await fn(); if (v) return v; await sleep(step); } return null; };

const D = require('../src/desktop-display.js');
const K = require('../src/server/desktop-app-keeper.js');
const S = require('../src/server/desktop-stream.js');
const M = require('../src/desktop-apps.js');
const ident = require('../src/cli-identity.js');
const alive = (p) => D.pidAlive(p);

// THIS BOX's xpra verdict (2.369.131): absent ⇒ 'xpra not on PATH'; present ⇒ passed over as unwired until P8-2 — never a literal
const XPRA_WHY = D.binOnPath('xpra', { env: process.env }) ? 'xpra present (xpra) but not wired until P8-2' : 'xpra not on PATH';
// 2.369.137 (tigervnc-standalone-server landed on this box for the vnc-fit work):
// with an Xvnc on PATH the keeper takes the `x-serves-rfb` recipe (X IS the
// picture server), so every leg that pins the Xvfb+x11vnc recipe hands the
// keeper display FACTS with Xvnc/Xtigervnc hidden — the leg tests the recipe,
// not this box's inventory (the .131 lesson: judge by presence, never a literal).
const NO_XVNC = { ...D, hostFacts: async (o) => { const f = await D.hostFacts(o); return { ...f, bins: { ...f.bins, Xvnc: null, Xtigervnc: null } }; } };
const root = scratch('desktop-keeper');
fs.mkdirSync(root, { recursive: true });
const keepers = [];
const children = [];
/** The exit sweep's RULE (r2): a recorded pid is a target only when it is
 *  STILL the recorded process (pid AND starttime — §3 deliberately records a
 *  recycled one), never this process, and a verified leader takes its whole
 *  session with it. A bare `alive(p)` used to SIGKILL the suite itself. */
function sweepTargets(apps) {
  const out = new Set();
  for (const rec of Object.values(apps)) for (const part of Object.keys(rec.pids || {})) {
    const p = rec.pids[part];
    if (!p || p === process.pid) continue;
    if (!D.sameProcess(p, (rec.starts || {})[part])) continue;
    out.add(p);
    for (const m of ident.sessionMembers(p)) if (m !== process.pid) out.add(m);
  }
  return [...out];
}
const mutants = [];
const cleanup = () => {
  for (const k of keepers) { try { k.shutdown(); } catch {} }
  for (const c of children) { try { c.kill('SIGKILL'); } catch {} }
  // reap anything still on a display of ours (a failed leg must not leave an X server) — by the RULE above
  try { for (const p of sweepTargets(readStoreAll())) { try { process.kill(p, 'SIGKILL'); } catch {} } } catch {}
  for (const f of mutants) { try { fs.unlinkSync(f); } catch {} }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
};
/** A PATCHED COPY of the real keeper beside it (relative requires), each
 *  replacement asserted to hit exactly once — the negative controls of §8. */
function mutant(tag, replacements) {
  const src = fs.readFileSync(path.join(repo, 'src/server/desktop-app-keeper.js'), 'utf8');
  let out = src;
  for (const [from, to] of replacements) { const n = out.split(from).length - 1; if (n !== 1) throw new Error(`mutant ${tag}: expected exactly one hit for ${JSON.stringify(from)}, got ${n}`); out = out.replace(from, to); }
  const file = path.join(repo, 'src/server', `vs-dak-mut-${process.pid}-${tag}.js`);
  fs.writeFileSync(file, out); mutants.push(file);
  return { mod: require(file), file };
}
// stranded copies of DEAD runs are swept (never a live run's — two checkouts may run this suite at once)
for (const f of fs.readdirSync(path.join(repo, 'src/server'))) { const m = /^vs-dak-mut-(\d+)-/.exec(f); if (m && !alive(Number(m[1]))) { try { fs.unlinkSync(path.join(repo, 'src/server', f)); } catch {} } }
// The r4 (2026-09-14) layers as mutant replacements — §10's own controls, and the OLDER pre-fix controls of
// §8(b)/§9(a) remove them too: those keepers predate the layers, and the marker belt at the end of every
// teardown would otherwise reap the very orphans those controls exist to show. Each anchor is asserted to
// hit exactly once by mutant().
const NO_CAPTURE = [
  ['      const inflightP = inflight.get(id) || null;', '      const inflightP = null; // pre-fix (r3): nothing captured before the first teardown'],
  ['      if (inflightP) {', '      if (inflight.has(id)) { // pre-fix (r3): asked AFTER the first teardown'],
];
const NO_BELT = [['    const escaped = markerLeftovers(rec);', '    const escaped = []; // pre-fix (r3): the sid table was the session']];
const NO_GUARD_UNION = [['        const pids = sessionPids(rec, escapedOf(rec.id));', '        const pids = sessionPids(rec); // pre-fix (r3): the sid table alone']];
function readStoreAll() {
  const out = {};
  for (const d of fs.readdirSync(root)) { try { Object.assign(out, JSON.parse(fs.readFileSync(path.join(root, d, 'desktop-apps.json'), 'utf8')).apps); } catch {} }
  return out;
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

const facts = await D.hostFacts({});
const APP = ['xmessage', 'xterm', 'xlogo'].map((n) => [n, D.binOnPath(n, { env: process.env })]).find(([, p]) => p);
if (!facts.bins.Xvfb || !facts.bins.x11vnc) { skip(`Xvfb (${!!facts.bins.Xvfb}) and x11vnc (${!!facts.bins.x11vnc}) are both needed — this machine lacks one, nothing to drive`); console.log(`\nALL PASS (0, ${skipped} skipped)`); process.exit(0); }
if (!APP) { skip('none of xmessage/xterm/xlogo on PATH — no X application to launch'); console.log(`\nALL PASS (0, ${skipped} skipped)`); process.exit(0); }
const [appName, appBin] = APP;
const appArgs = appName === 'xmessage' ? ['-geometry', '400x200+10+10', 'vibespace desktop-app keeper'] : appName === 'xterm' ? ['-geometry', '80x24', '-T', 'vs-keeper'] : [];
const baseEnv = () => ({ PATH: process.env.PATH, HOME: process.env.HOME, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || 'wayland-0', XDG_SESSION_TYPE: 'wayland' });
const mk = (name, extra = {}) => {
  const dataDir = path.join(root, name); fs.mkdirSync(dataDir, { recursive: true });
  const events = [];
  // every keeper in this suite runs the Xvfb+x11vnc recipe unless a leg asks for the Xvnc rung (display: D)
  const k = K.create({ dataDir, env: baseEnv, display: NO_XVNC, broadcast: (m) => events.push(m), serverSetting: () => undefined, log: { log() {}, warn() {}, error() {} }, ...extra });
  k._events = events; keepers.push(k);
  return k;
};
/** pids on this box whose cmdline names `needle` (our per-app dirs) — the /proc census. */
function procCensus(needle) {
  const hits = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try { if (fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').includes(needle)) hits.push(Number(d)); } catch {}
  }
  return hits;
}
/** A real RFB client: read the banner, answer the version, read the security types. */
function rfbHandshake(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    let buf = Buffer.alloc(0), stage = 0, banner = null;
    const t = setTimeout(() => { s.destroy(); resolve({ banner, security: null }); }, 4000);
    s.on('data', (b) => {
      buf = Buffer.concat([buf, b]);
      if (stage === 0 && buf.length >= 12) { banner = buf.slice(0, 12).toString('latin1'); buf = buf.slice(12); stage = 1; s.write('RFB 003.008\n'); }
      if (stage === 1 && buf.length >= 1) { const n = buf[0]; if (buf.length >= 1 + n) { const types = [...buf.slice(1, 1 + n)]; clearTimeout(t); s.destroy(); resolve({ banner, security: types }); } }
    });
    s.on('error', () => { clearTimeout(t); resolve({ banner, security: null }); });
  });
}

console.log('§1 launch → listening → handshake → record → stop clean');
{
  const k = mk('k1');
  await k.adoptAll(); k.start();
  const before = procCensus(k.logRoot);
  const t0 = Date.now();
  const rec = await k.launch({ exec: appBin, args: appArgs, label: 'first' });
  ok(rec.state === 'launching' && rec.backend === 'vnc-display' && rec.via === 'Xvfb+x11vnc' && rec.fallbackWhy === XPRA_WHY, `launch answers a launching record on vnc-display via Xvfb+x11vnc with fallbackWhy "${XPRA_WHY}" (this box)`, rec);
  const ready = await until(() => { const r = k.get(rec.id); return r.state === 'ready' ? r : r.state === 'failed' ? r : null; });
  ok(ready && ready.state === 'ready', `ready in ${Date.now() - t0} ms`, ready && ready.lastError);
  ok(/^:\d+$/.test(ready.display) && ready.port > 0 && ready.pids.x > 0 && ready.pids.server > 0 && ready.pids.app > 0 && ready.starts.x > 0 && ready.starts.server > 0 && ready.starts.app > 0, 'the record carries display, port, three pids AND three starttimes (facts only)', ready);
  ok(ready.pids.x !== ready.pids.server && ready.pids.server !== ready.pids.app, 'X, picture server and app are three processes');
  const hs = await rfbHandshake(ready.port);
  ok(hs.banner === 'RFB 003.008\n' && Array.isArray(hs.security) && hs.security.includes(1), `a real RFB client completes the version handshake and is offered security type None (${JSON.stringify(hs)})`);
  const disk = JSON.parse(fs.readFileSync(k.storeFile, 'utf8'));
  ok(disk.apps[rec.id] && disk.apps[rec.id].state === 'ready' && disk.apps[rec.id].pids.app === ready.pids.app, 'the record is on disk (writeJsonAtomic) with the same pids');
  ok(fs.existsSync(path.join(k.logRoot, rec.id, 'app.log')) && fs.existsSync(path.join(k.logRoot, rec.id, 'Xauthority')), 'per-app dir holds app.log + the Xauthority cookie file');
  ok((fs.statSync(path.join(k.logRoot, rec.id, 'Xauthority')).mode & 0o777) === 0o600, 'the cookie file is 0600');
  const states = k._events.map((e) => (e.apps.find((a) => a.id === rec.id) || {}).state);
  ok(k._events.every((e) => e.type === 'desktop-apps-updated') && states.includes('launching') && states.includes('ready'), 'every change was broadcast as desktop-apps-updated (launching → ready)', states);
  ok(k.streamTarget(rec.id) && k.streamTarget(rec.id).kind === 'rfb' && k.streamTarget(rec.id).port === ready.port, 'streamTarget names the rfb port for the bridge');
  const enumd = await D.enumerateWindows({ display: ready.display, authFile: path.join(k.logRoot, rec.id, 'Xauthority'), env: baseEnv() });
  ok(enumd.ok && enumd.windows.some((w) => w.mapped !== false && w.w > 0), `the app's window is really on the private display (${enumd.windows.length} window(s))`, enumd);
  const during = procCensus(k.logRoot);
  ok(during.length >= 2, `census while running: ${during.length} process(es) name this keeper's dir (X + x11vnc at least)`);
  const pids = [ready.pids.x, ready.pids.server, ready.pids.app];
  const stopped = await k.stop(rec.id);
  ok(stopped.state === 'exited' && stopped.stoppedBy === 'user' && stopped.lastError === null, 'stop ⇒ exited, by user, no error', stopped);
  ok(pids.every((p) => !alive(p)), 'every recorded pid is gone after stop (app → server → X, each verified)');
  const after = procCensus(k.logRoot);
  ok(after.length === before.length, `/proc census equal before (${before.length}) and after (${after.length}) — no orphan X server or picture server`);
  ok(k.streamTarget(rec.id) === null, 'no stream target after stop');
  const l = await k.list();
  ok(l.cap.used === 0 && l.availability.backend === 'vnc-display' && Array.isArray(l.availability.ladder) && l.availability.ladder.length === 3 && l.registry.some((r) => r.id === 'xterm'), 'list(): cap back to 0, the ladder with all three rungs, the presence-checked registry');
  k.shutdown();
}

console.log('§2 the ONE ws bridge');
{
  const k = mk('k2');
  await k.adoptAll(); k.start();
  const rec = await k.launch({ exec: appBin, args: appArgs, label: 'bridge' });
  await until(() => k.get(rec.id).state !== 'launching');
  ok(k.get(rec.id).state === 'ready', 'a session for the bridge is ready');
  const inputs = [];
  let authed = true;
  const stream = S.create({ auth: { requestAuthed: () => authed }, resolveTarget: (id) => (id === 'xpra-one' ? { kind: 'xpra', port: 1 } : k.streamTarget(id)), onInput: (id) => inputs.push(id), log: { warn() {} } });
  ok(S.upgradeId('/api/vnc') === M.DESKTOP_SINGLETON_ID && S.upgradeId(`/api/desktop/${rec.id}/stream`) === rec.id && S.upgradeId('/api/desktop/../x/stream') === null && S.upgradeId('/ws') === null, 'upgradeId: /api/vnc is the singleton, /api/desktop/<id>/stream is the id, anything else is not ours');
  ok(S.streamPath(M.DESKTOP_SINGLETON_ID) === '/api/vnc' && S.streamPath('abc') === '/api/desktop/abc/stream', 'streamPath is the inverse');
  const srv = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => { const id = S.upgradeId(req.url.split('?')[0]); if (!id) { socket.destroy(); return; } stream.handleUpgrade(req, socket, head, id); });
  const port = await freePort();
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  const WebSocket = require('ws');
  const tryWs = (p) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${p}`);
    const chunks = [];
    const t = setTimeout(() => { try { ws.close(); } catch {} resolve({ status: 'timeout', chunks }); }, 3000);
    ws.on('unexpected-response', (req, res) => { clearTimeout(t); resolve({ status: res.statusCode, chunks }); });
    ws.on('error', (e) => { clearTimeout(t); resolve({ status: 'error:' + e.message, chunks }); });
    ws.on('message', (m) => { chunks.push(Buffer.from(m)); if (Buffer.concat(chunks).length >= 12) { clearTimeout(t); ws.send(Buffer.from('RFB 003.008\n')); ws.send(Buffer.from([1])); ws.send(Buffer.from([1])); ws.send(Buffer.from([5, 0, 0, 10, 0, 20])); setTimeout(() => { ws.close(); resolve({ status: 'open', chunks }); }, 300); } });
  });
  const good = await tryWs(`/api/desktop/${rec.id}/stream`);
  ok(good.status === 'open' && Buffer.concat(good.chunks).slice(0, 12).toString('latin1') === 'RFB 003.008\n', 'an authed client on /api/desktop/<id>/stream receives the RFB banner through the bridge');
  ok(inputs.includes(rec.id), 'the handshake then a PointerEvent ⇒ INPUT reported to the keeper (the idle clock)');
  {
    // r2: a client that only ever asks for framebuffer updates is nobody at the keyboard
    const n0 = inputs.length;
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/api/desktop/${rec.id}/stream`);
    ws2.on('error', (e) => ok(false, `the second bridge client errored: ${e.message}`));
    await new Promise((r) => ws2.on('open', r));
    ws2.send(Buffer.from('RFB 003.008\n')); ws2.send(Buffer.from([1])); ws2.send(Buffer.from([1]));
    for (let i = 0; i < 3; i++) { ws2.send(Buffer.from([3, 1, 0, 0, 0, 0, 0x04, 0x00, 0x03, 0x00])); await sleep(2100); }
    ok(inputs.length === n0, `a handshake + 3 FramebufferUpdateRequests over 6 s report NO input (noVNC sends those on every repaint; ${inputs.length - n0} reported)`);
    ws2.send(Buffer.concat([Buffer.from([3, 1, 0, 0, 0, 0, 0x04, 0x00, 0x03, 0x00]), Buffer.from([4, 1, 0, 0, 0, 0, 0, 0x61])]));
    await sleep(200);
    ok(inputs.length === n0 + 1, 'ONE frame carrying an update request AND a KeyEvent ⇒ input (the sieve walks messages, not frames)');
    ws2.close();
  }
  authed = false;
  const noAuth = await tryWs(`/api/desktop/${rec.id}/stream`);
  ok(noAuth.status === 401, `without the cookie the upgrade is refused 401 (${noAuth.status})`);
  authed = true;
  const unknown = await tryWs('/api/desktop/no-such-id/stream');
  ok(unknown.status === 404, `an unknown id is 404 (${unknown.status})`);
  const xpra = await tryWs('/api/desktop/xpra-one/stream');
  ok(xpra.status === 501, `an xpra target is refused BY NAME with 501 until P8-2 (${xpra.status})`);
  const st = stream.stats();
  ok(st.opened === 2 && st.refused === 3, `stats: 2 opened, 3 refused (${JSON.stringify(st)})`);
  await new Promise((r) => srv.close(r));
  await k.stop(rec.id);
  k.shutdown();
}

console.log('§3 SIGKILL the keeper PROCESS and rebuild ⇒ ADOPTED');
{
  const dataDir = path.join(root, 'k3'); fs.mkdirSync(dataDir, { recursive: true });
  const child = path.join(root, 'k3-child.mjs');
  fs.writeFileSync(child, `
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const K = require(${JSON.stringify(path.join(repo, 'src/server/desktop-app-keeper.js'))});
const k = K.create({ dataDir: ${JSON.stringify(dataDir)}, env: () => (${JSON.stringify(baseEnv())}), broadcast: () => {}, log: { log() {}, warn() {}, error() {} } });
k.start();
const rec = await k.launch({ exec: ${JSON.stringify(appBin)}, args: ${JSON.stringify(appArgs)}, label: 'survivor' });
for (let i = 0; i < 200; i++) { const r = k.get(rec.id); if (r.state !== 'launching') { console.log(JSON.stringify(r)); break; } await new Promise((r) => setTimeout(r, 100)); }
setInterval(() => {}, 1000); // stay alive until SIGKILLed — the apps must outlive US
`);
  const proc = spawn(process.execPath, [child], { stdio: ['ignore', 'pipe', 'inherit'] });
  children.push(proc);
  let out = '';
  const first = await new Promise((resolve) => { proc.stdout.on('data', (b) => { out += b; const line = out.split('\n').find((l) => l.startsWith('{')); if (line) resolve(JSON.parse(line)); }); setTimeout(() => resolve(null), 20000); });
  ok(first && first.state === 'ready', 'the child keeper launched and reached ready', first && first.lastError);
  proc.kill('SIGKILL');
  await sleep(500);
  ok(!alive(proc.pid), 'the keeper process is dead (SIGKILL — no cleanup ran)');
  ok(first && alive(first.pids.x) && alive(first.pids.server) && alive(first.pids.app), 'X, picture server and app SURVIVED their keeper (detached, setsid)');
  const k = mk('k3');
  await k.adoptAll();
  const adopted = k.get(first.id);
  ok(adopted && adopted.state === 'ready' && adopted.adoptedAt > 0 && adopted.pids.app === first.pids.app && adopted.starts.app === first.starts.app, 'the new keeper ADOPTS it: ready, same pids, same starttimes, adoptedAt stamped', adopted);
  ok(k.streamTarget(first.id) && k.streamTarget(first.id).port === first.port && (await D.rfbBanner(first.port, 3000)), 'the adopted session still streams (banner on the recorded port)');
  k.start();
  // a record whose pids are recycled/dead is exited-with-reason, never adopted
  const store = JSON.parse(fs.readFileSync(k.storeFile, 'utf8'));
  store.apps['da-ghost'] = { ...M.newRecord({ id: 'da-ghost', label: 'ghost', exec: appBin, args: [], cwd: null, source: 'adhoc', backend: 'vnc-display', via: 'Xvfb+x11vnc', fallbackWhy: null, idleTimeoutMs: 0, now: Date.now() - 60000 }), state: 'ready', display: ':999', port: 1, pids: { x: 999999, app: 999998, server: 999997, wm: null }, starts: { x: 1, app: 1, server: 1, wm: null } };
  // a record whose APP pid is RECYCLED — pid alive (a throwaway `sleep` this suite owns; r2: NEVER this process — the
  // exit sweep used to SIGKILL every live recorded pid, i.e. the suite itself, ALL PASS then exit 137), starttime not
  // its own — on a display of its own that is gone
  const recycledProc = spawn('sleep', ['3600'], { stdio: 'ignore' }); children.push(recycledProc); await sleep(100);
  store.apps['da-recycled'] = { ...M.newRecord({ id: 'da-recycled', label: 'recycled', exec: appBin, args: [], cwd: null, source: 'adhoc', backend: 'vnc-display', via: 'Xvfb+x11vnc', fallbackWhy: null, idleTimeoutMs: 0, now: Date.now() - 60000 }), state: 'ready', display: ':998', port: 2, pids: { x: 999996, app: recycledProc.pid, server: 999995, wm: null }, starts: { x: 1, app: 12345, server: 1, wm: null }, lastError: 'kept-from-before' };
  fs.writeFileSync(k.storeFile, JSON.stringify(store));
  const k4 = mk('k3');
  await k4.adoptAll();
  const ghost = k4.get('da-ghost'), recycled = k4.get('da-recycled');
  ok(ghost && ghost.state === 'exited' && /X display gone/.test(ghost.lastError), 'a record whose X pid is dead ⇒ exited, lastError says the display is gone', ghost);
  ok(recycled && recycled.state === 'exited' && recycled.lastError === 'kept-from-before', 'a dead record\'s earlier lastError is KEPT through adoption', recycled);
  ok(alive(recycledProc.pid) && !D.sameProcess(recycledProc.pid, 12345) && M.adoptVerdict({ state: 'ready' }, { x: true, server: true, app: D.sameProcess(recycledProc.pid, 12345) }, true).state === 'exited', 'a RECYCLED app pid (alive, starttime differs — a throwaway sleep) is not "alive" to the adoption verdict, and the reap never signalled it (it is still running)');
  ok(!sweepTargets(JSON.parse(fs.readFileSync(k.storeFile, 'utf8')).apps).includes(recycledProc.pid), 'the exit sweep\'s rule does not target the recycled pid either (pid+starttime, never a bare pid)');
  recycledProc.kill('SIGKILL');
  ok(alive(first.pids.app) && alive(first.pids.x), 'reaping the ghost/recycled records did NOT touch the real survivor (pid+starttime identity, never a bare pid)');
  ok(k4.get(first.id).state === 'ready', 'the real survivor is adopted again by the second keeper');
  const s2 = await k4.stop(first.id);
  ok(s2.state === 'exited' && !alive(first.pids.x) && !alive(first.pids.server) && !alive(first.pids.app), 'stop on an ADOPTED session (no child handles) kills all three, verified');
  k.shutdown(); k4.shutdown();
}

console.log('§4 idle timeout, keep-alive, input, the cap');
{
  const k = mk('k4', { serverSetting: (key) => (key === 'desktop.idleTimeoutMin' ? 0.02 : undefined), tickMs: 150 }); // 1.2 s
  await k.adoptAll(); k.start();
  const a = await k.launch({ exec: appBin, args: appArgs, label: 'idle' });
  await until(() => k.get(a.id).state !== 'launching');
  ok(k.get(a.id).state === 'ready' && k.get(a.id).idleTimeoutMs === 1200, 'launched with the setting\'s idle timeout (0.02 min = 1200 ms)');
  const idleStop = await until(() => (k.get(a.id).state === 'exited' ? k.get(a.id) : null), 6000);
  ok(idleStop && idleStop.stoppedBy === 'idle' && /idle timeout/.test(idleStop.lastError) && !alive(idleStop.pids.app), 'no input ⇒ stopped by the idle timeout, lastError says so, processes gone', idleStop);
  const b = await k.launch({ exec: appBin, args: appArgs, label: 'kept-by-input' });
  await until(() => k.get(b.id).state !== 'launching');
  for (let i = 0; i < 20; i++) { k.noteInput(b.id); await sleep(100); }
  ok(k.get(b.id).state === 'ready', 'input reported by the bridge keeps it alive past the timeout (2 s of input vs a 1.2 s limit)');
  const kept = k.keepAlive(b.id);
  ok(kept.idleTimeoutMs === 0, 'keepAlive sets the timeout to 0 (never)');
  await sleep(2000);
  ok(k.get(b.id).state === 'ready' && k.get(b.id).idle && k.get(b.id).idle.remainingMs === null, 'a kept-alive app survives silence; the idle view says "never"');
  const k5 = mk('k5', { limits: { ...M.LIMITS, CONCURRENT_CAP: 1 } });
  await k5.adoptAll(); k5.start();
  const c = await k5.launch({ exec: appBin, args: appArgs, label: 'holder' });
  await until(() => k5.get(c.id).state !== 'launching');
  let refused = null;
  try { await k5.launch({ exec: appBin, args: appArgs, label: 'second' }); } catch (e) { refused = e; }
  ok(refused && refused.code === 'cap' && /holder \(/.test(refused.message) && /stop one first/.test(refused.message), 'at the cap a launch is REFUSED naming the holder (loud, never an OOM)', refused && refused.message);
  let badExec = null;
  try { await k.launch({ exec: 'no-such-binary-vs', args: [] }); } catch (e) { badExec = e; }
  ok(badExec && badExec.code === 'exec-not-found', 'an exec that is not on PATH is refused by code', badExec && badExec.message);
  let badCwd = null;
  try { await k.launch({ exec: appBin, cwd: path.join(root, 'nope') }); } catch (e) { badCwd = e; }
  ok(badCwd && badCwd.code === 'cwd-missing', 'a missing cwd is refused by code');
  await k5.stop(c.id); await k.stop(b.id);
  k.shutdown(); k5.shutdown();
}

console.log('§5 the runaway guard (shared limits shrunk) + the registry park');
{
  const burner = { id: 'burner', label: 'CPU burner', exec: 'sh', args: ['-c', 'while :; do :; done'], category: 'test' };
  const limits = { ...M.LIMITS, GUARD_CPU_PCT: 50, GUARD_CPU_SUSTAIN_MS: 1500, RUNAWAY_COOLDOWN_MS: 60000 };
  const telemetry = [];
  const k = mk('k6', { limits, registryRows: [burner], guardSampleMs: 400, tickMs: 200, getTelemetry: () => ({ record: (e) => telemetry.push(e) }) });
  await k.adoptAll(); k.start();
  const r = await k.launch({ appId: 'burner' });
  await until(() => k.get(r.id).state !== 'launching');
  ok(k.get(r.id).state === 'ready' && k.get(r.id).appId === 'burner', 'the burner launched from the registry');
  const tripped = await until(() => (k.get(r.id).state === 'failed' ? k.get(r.id) : null), 15000);
  ok(tripped && /stopped as a runaway: \d+% CPU sustained/.test(tripped.lastError) && tripped.stoppedBy === 'runaway', 'sustained CPU over the (shrunk) limit ⇒ stopped as a runaway, state failed, the sentence names the numbers', tripped && tripped.lastError);
  ok(tripped && !alive(tripped.pids.app) && !alive(tripped.pids.x), 'the burner and its display are gone');
  ok(telemetry.some((e) => e.name === 'desktop-app-runaway'), 'telemetry desktop-app-runaway emitted');
  const reg = (await k.list()).registry.find((x) => x.id === 'burner');
  ok(reg && reg.parkedUntil > Date.now() && /not launching it again/.test(reg.reason), 'the registry row is PARKED with the reason and its until');
  let parked = null;
  try { await k.launch({ appId: 'burner' }); } catch (e) { parked = e; }
  ok(parked && parked.code === 'runaway-parked', 'relaunching a parked row is refused by code');
  const disk = JSON.parse(fs.readFileSync(k.storeFile, 'utf8'));
  ok(disk.runawayParkedUntil && disk.runawayParkedUntil.burner > Date.now(), 'the park survives on disk');
  k.shutdown();
}

console.log('§6 the routes (express) — host refusal, launch, stop, keep-alive, 404');
{
  const express = require('express');
  const { router, setup } = require('../src/routes/desktop-apps.js');
  const k = mk('k7');
  await k.adoptAll(); k.start();
  setup({ keeper: k, vnc: { status: async () => ({ available: false, running: false, port: 0 }), ensureRunning: async () => { throw new Error('no VNC server installed (test)'); } } });
  const app = express(); app.use(express.json()); app.use(router);
  const port = await freePort();
  const srv = await new Promise((r) => { const s = app.listen(port, '127.0.0.1', () => r(s)); });
  const j = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, body: await res.json() }; };
  const list = await j('GET', '/api/desktop/apps');
  ok(list.status === 200 && list.body.availability.backend === 'vnc-display' && Array.isArray(list.body.registry) && list.body.cap.cap === M.LIMITS.CONCURRENT_CAP, 'GET /api/desktop/apps: registry + availability ladder + cap');
  const remote = await j('GET', '/api/desktop/apps?host=box-2');
  ok(remote.status === 400 && remote.body.code === 'unsupported-host' && /local-only/.test(remote.body.error), 'a non-local host is refused BY NAME (400 unsupported-host) — v1');
  const remotePost = await j('POST', '/api/desktop/apps', { host: 'box-2', exec: appBin });
  ok(remotePost.status === 400 && remotePost.body.code === 'unsupported-host', 'POST with a host is refused the same way');
  const bad = await j('POST', '/api/desktop/apps', { exec: '' });
  ok(bad.status === 400 && bad.body.code === 'bad-request', 'an empty exec is 400 bad-request with the reason');
  const missing = await j('POST', '/api/desktop/apps', { exec: 'no-such-binary-vs' });
  ok(missing.status === 400 && missing.body.code === 'exec-not-found', 'an exec not on PATH is 400 exec-not-found');
  const launched = await j('POST', '/api/desktop/apps', { exec: appBin, args: appArgs, label: 'via-route' });
  ok(launched.status === 200 && launched.body.id && launched.body.state === 'launching', 'POST launches and answers the record');
  await until(() => k.get(launched.body.id).state !== 'launching');
  const one = await j('GET', `/api/desktop/apps/${launched.body.id}`);
  ok(one.status === 200 && one.body.state === 'ready', 'GET /api/desktop/apps/:id answers the live record');
  const keep = await j('POST', `/api/desktop/apps/${launched.body.id}/keep-alive`, {});
  ok(keep.status === 200 && keep.body.idleTimeoutMs === 0, 'keep-alive ⇒ idleTimeoutMs 0');
  const stop = await j('POST', `/api/desktop/apps/${launched.body.id}/stop`, {});
  ok(stop.status === 200 && stop.body.state === 'exited', 'stop ⇒ exited');
  const nf = await j('GET', '/api/desktop/apps/da-nope');
  ok(nf.status === 404 && nf.body.code === 'not-found', 'an unknown id is 404 not-found');
  const vs = await j('GET', '/api/vnc/status');
  ok(vs.status === 200 && vs.body.available === false, 'GET /api/vnc/status still answers through the desktop routes (moved from server.js, same shape)');
  const vst = await j('POST', '/api/vnc/start');
  ok(vst.status === 500 && /no VNC server installed/.test(vst.body.error), 'POST /api/vnc/start still surfaces the server\'s own error text');
  await new Promise((r) => srv.close(r));
  k.shutdown();
}

console.log('§7 the Xvnc SPELLING of vnc-display (the fleet image\'s rung) — one process that is both X and picture server');
{
  // Xvnc is not installable here (apt is held by a running release upgrade), so
  // the rung is driven through a SHIM that honours the exact argv the keeper
  // builds for it: a node process (shebang = this suite's own interpreter — the
  // r7 lesson) that owns an Xvfb + an x11vnc, forwards the display number on
  // `-displayfd`, serves `-rfbport`, refuses argv without `-localhost`, and dies
  // WITH its children on SIGTERM — the property the keeper leans on when
  // `pids.server === pids.x`. What this proves: the Xvnc recipe, the one-pid
  // record, the `server === x` branches of adoption and teardown, and that
  // stopping the one pid leaves nothing behind. What it cannot prove: the real
  // TigerVNC binary's behaviour — the fleet image owes that measurement.
  const fakeBin = path.join(root, 'fakebin'); fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, 'Xvnc'), `#!${process.execPath}
'use strict';
const { spawn } = require('child_process'); const fs = require('fs');
const a = process.argv.slice(2);
const opt = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null; };
const fd = Number(opt('-displayfd')), port = opt('-rfbport'), geom = opt('-geometry') || '1024x768', depth = opt('-depth') || '24', auth = opt('-auth');
if (!Number.isInteger(fd) || !port || !auth || !a.includes('-localhost') || opt('-SecurityTypes') !== 'None') { process.stderr.write('fake Xvnc: unexpected argv ' + JSON.stringify(a) + '\\n'); process.exit(2); }
const kids = [];
let dying = false;
const die = (code) => { if (dying) return; dying = true; for (const k of kids) { try { k.kill('SIGTERM'); } catch {} } setTimeout(() => process.exit(code), 150); };
process.on('SIGTERM', () => die(0)); process.on('SIGINT', () => die(0));
const xv = spawn(${JSON.stringify(facts.bins.Xvfb)}, ['-displayfd', '3', '-auth', auth, '-nolisten', 'tcp', '-screen', '0', geom + 'x' + depth], { stdio: ['ignore', 'inherit', 'inherit', 'pipe'] });
kids.push(xv); xv.on('exit', () => die(1));
let buf = '';
xv.stdio[3].on('data', (b) => {
  buf += b; const m = /^\\s*(\\d+)\\s*\\n/.exec(buf); if (!m || kids.length > 1) return;
  const vnc = spawn(${JSON.stringify(facts.bins.x11vnc)}, ['-display', ':' + m[1], '-auth', auth, '-localhost', '-rfbport', port, '-forever', '-shared', '-nopw', '-quiet'], { stdio: 'inherit' });
  kids.push(vnc); vnc.on('exit', () => die(1));
  fs.writeSync(fd, m[1] + '\\n');
});
setInterval(() => {}, 1000);
`, { mode: 0o755 });
  const envWithShim = () => ({ ...baseEnv(), PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` });
  D.resetBinMemo(); // a NO for `Xvnc` is memoised for 60 s by the probes above — the shim must be SEEN
  const k = mk('k7', { env: envWithShim, display: D }); // this leg WANTS the Xvnc rung (the shim on PATH)
  await k.adoptAll(); k.start();
  const before = procCensus(k.logRoot);
  const l0 = await k.list();
  ok(l0.availability.backend === 'vnc-display' && l0.availability.via === 'Xvnc' && l0.availability.bins.Xvnc === path.join(fakeBin, 'Xvnc'), 'with an Xvnc on PATH the ladder picks vnc-display via Xvnc (the fleet spelling), not Xvfb+x11vnc', l0.availability);
  const rec = await k.launch({ exec: appBin, args: appArgs, label: 'xvnc-spelling' });
  ok(rec.via === 'Xvnc' && rec.backend === 'vnc-display' && rec.fallbackWhy === XPRA_WHY, 'launch records via Xvnc with the same fallbackWhy', rec);
  const ready = await until(() => { const r = k.get(rec.id); return r.state === 'ready' ? r : r.state === 'failed' ? r : null; });
  ok(ready && ready.state === 'ready', 'ready through the Xvnc recipe', ready && ready.lastError);
  ok(ready.pids.x > 0 && ready.pids.x === ready.pids.server && ready.starts.x === ready.starts.server && ready.pids.app !== ready.pids.x, 'the record says X and the picture server are ONE process (pid AND starttime), the app another', ready);
  let argv = [];
  try { argv = fs.readFileSync(`/proc/${ready.pids.x}/cmdline`, 'utf8').split('\0').filter(Boolean); } catch {}
  const has = (f, v) => { const i = argv.indexOf(f); return i >= 0 && (v === undefined || argv[i + 1] === v); };
  ok(has('-displayfd', '3') && has('-localhost') && has('-SecurityTypes', 'None') && has('-UseBlacklist', '0') && has('-rfbport', String(ready.port)) && has('-auth', path.join(k.logRoot, rec.id, 'Xauthority')) && has('-nolisten', 'tcp'), 'the Xvnc argv is the recipe src/vnc.js learned: -displayfd, -localhost, SecurityTypes None, UseBlacklist 0 (our own probes must not lock localhost out), the rfbport, the cookie file', argv);
  const hs = await rfbHandshake(ready.port);
  ok(hs.banner === 'RFB 003.008\n' && Array.isArray(hs.security) && hs.security.includes(1), 'a real RFB client handshakes on the recorded port', hs);
  const during = procCensus(k.logRoot);
  ok(during.length >= 3, `census while running: ${during.length} process(es) name this keeper's dir (the shim + its X + its picture server)`);
  // ADOPTION of a one-pid record: a second keeper on the same store
  const k2 = mk('k7', { env: envWithShim });
  await k2.adoptAll();
  const adopted = k2.get(rec.id);
  ok(adopted && adopted.state === 'ready' && adopted.adoptedAt > 0 && adopted.pids.x === ready.pids.x && adopted.pids.server === ready.pids.x, 'a second keeper ADOPTS the one-pid record (the server === x branch of adoptAll)', adopted);
  const stopped = await k2.stop(rec.id);
  ok(stopped.state === 'exited' && stopped.lastError === null, 'stop through the adopting keeper ⇒ exited, clean (the server === x branch of teardown signals the one pid once)', stopped);
  await sleep(400);
  ok(!alive(ready.pids.x) && !alive(ready.pids.app), 'the shim and the app are gone');
  const after = procCensus(k.logRoot);
  ok(after.length === before.length, `/proc census equal before (${before.length}) and after (${after.length}) — the shim took its Xvfb and x11vnc with it, no orphan`);
  k.shutdown(); k2.shutdown();
  D.resetBinMemo(); // never let the shim answer for `Xvnc` after this leg
}

console.log('§8 r2 — the round-1 verifier\'s findings, each reproduced on the real keeper and closed with a control');
{ // (a) a picture server whose binary vanished after the probe
  const fakeBin = path.join(root, 'r2bin'); fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, 'x11vnc'), `#!/bin/sh\nexec ${facts.bins.x11vnc} "$@"\n`, { mode: 0o755 });
  D.resetBinMemo();
  const k = mk('r2a', { env: () => ({ ...baseEnv(), PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` }) });
  await k.adoptAll(); k.start();
  const l0 = await k.list();
  ok(l0.availability.bins.x11vnc === path.join(fakeBin, 'x11vnc'), 'the shim x11vnc was probed (a YES, memoised for good — and cached in the keeper\'s facts for 60 s)');
  fs.unlinkSync(path.join(fakeBin, 'x11vnc'));
  let uncaught = null; const onU = (e) => { uncaught = e; }; process.on('uncaughtException', onU);
  const rec = await k.launch({ exec: appBin, args: appArgs, label: 'vanished' });
  const done = await until(() => { const r = k.get(rec.id); return r.state === 'failed' || r.state === 'exited' ? r : null; }, 10000);
  await sleep(200);
  process.off('uncaughtException', onU);
  ok(uncaught === null, 'the keeper PROCESS survived the spawn failure (no uncaught ENOENT — round 1 died here)', uncaught && uncaught.message);
  ok(done && done.state === 'failed' && /x11vnc/.test(done.lastError) && /exec-vanished/.test(done.lastError), 'the record is `failed` and names the vanished binary by name (exec-vanished)', done && done.lastError);
  const seen = k._events.map((e) => e.apps.find((a) => a.id === rec.id)).filter(Boolean);
  ok(seen.some((a) => a.state === 'launching' && a.pids.x > 0 && a.pids.server === null), 'the X server\'s pid was COMMITTED (broadcast) while still launching — before the picture server was even tried');
  ok(done.pids.x > 0 && !alive(done.pids.x), 'the X server it had started is RECORDED and REAPED (round 1 left it alive and unrecorded)');
  ok(procCensus(k.logRoot).length === 0, 'nothing names this keeper\'s dir any more');
  ok(D.binOnPath('x11vnc', { env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` } }) === facts.bins.x11vnc, 'the refuted memo was FORGOTTEN: the next probe finds the real x11vnc again');
  D.resetBinMemo(); k.shutdown();
  // CONTROL — Node semantics, the round-1 shape: a spawn with only an `exit` listener kills the process on a missing binary
  const ctl = spawnSync(process.execPath, ['-e', `const c=require('child_process').spawn(${JSON.stringify(path.join(fakeBin, 'x11vnc'))},[],{stdio:'ignore'}); c.once('exit',()=>{}); setTimeout(()=>process.exit(0),500);`], { encoding: 'utf8' });
  ok(ctl.status !== 0 && /ENOENT/.test(ctl.stderr), `CONTROL: a bare spawn of a missing binary with only an 'exit' listener kills node (status ${ctl.status}, ENOENT on stderr)`);
}
{ // (b) stop takes the application's CHILDREN with it — a session, not three pids
  const k = mk('r2b'); await k.adoptAll(); k.start();
  const rec = await k.launch({ exec: 'sh', args: ['-c', 'sleep 3600 & exec sleep 3600'], label: 'forks' });
  await until(() => k.get(rec.id).state !== 'launching');
  const r = k.get(rec.id);
  ok(r.state === 'ready', 'a wrapper that forks a child is ready');
  ident.resetProcTables();
  const sid = ident.readSid(r.pids.app);
  const before = ident.sessionMembers(sid);
  ok(sid === r.pids.app && before.length >= 2 && before.includes(r.pids.app), `the app is a session leader (sid == pid) and its session holds ${before.length} processes (the wrapper + the child it forked)`, before);
  const child = before.find((p) => p !== r.pids.app);
  ok(child && !Object.values(r.pids).includes(child), 'the forked child is NOT a recorded pid — a teardown that signals only recorded pids cannot see it');
  ok(D.environHas(child, `${K.SESSION_ENV}=${rec.id}`), 'the child INHERITED the session marker VIBESPACE_DESKTOP_APP=<id> — the identity a straggler is recognised by');
  const s = await k.stop(rec.id);
  await sleep(300); ident.resetProcTables();
  ok(s.state === 'exited' && s.lastError === null, 'stop ⇒ exited, clean');
  ok(ident.sessionMembers(sid).length === 0 && !alive(child), `the whole session is gone after stop — the forked child too (pid ${child})`);
  k.shutdown();
  // NEGATIVE CONTROL: the round-1 teardown (recorded pids only) on the same shape leaves the child running
  const { mod: K1 } = mutant('b', [
    ["    let members = display.sessionMembers(pid, { fresh }).filter((p) => p !== pid);", "    let members = [];"],
    ["    if (leaderPid) { try { process.kill(-leaderPid, 'SIGTERM'); } catch { /* the group is already gone */ } }", "    /* pre-fix: no group signal */"],
    ["    if (leaderPid) { try { process.kill(-leaderPid, 'SIGKILL'); } catch { /* gone */ } }", "    /* pre-fix: no group signal */"],
    ...NO_BELT, // r4: the round-1 keeper had no marker belt either
  ]);
  const dataDir = path.join(root, 'r2b-ctl'); fs.mkdirSync(dataDir, { recursive: true });
  const k1 = K1.create({ dataDir, env: baseEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } }); keepers.push(k1);
  await k1.adoptAll(); k1.start();
  const rec1 = await k1.launch({ exec: 'sh', args: ['-c', 'sleep 3600 & exec sleep 3600'], label: 'forks-ctl' });
  await until(() => k1.get(rec1.id).state !== 'launching');
  ident.resetProcTables();
  const child1 = ident.sessionMembers(k1.get(rec1.id).pids.app).find((p) => p !== k1.get(rec1.id).pids.app);
  const s1 = await k1.stop(rec1.id);
  await sleep(300);
  ok(s1.state === 'exited' && s1.lastError === null && alive(child1), `CONTROL: the pre-fix teardown reports "exited, clean" while the forked child ${child1} is STILL RUNNING (the round-1 orphan)`);
  try { process.kill(child1, 'SIGKILL'); } catch {}
  k1.shutdown();
}
{ // (c) the picture port is a MEASURED fact: a stranger on 127.0.0.1:<port> that speaks RFB never becomes "ready"
  const impostor = net.createServer((sock) => { sock.write('RFB 003.008\n'); }); await new Promise((r) => impostor.listen(0, '127.0.0.1', r));
  const port = impostor.address().port;
  const k = mk('r2c', { display: { ...NO_XVNC, freePort: async () => port } }); await k.adoptAll(); k.start();
  const rec = await k.launch({ exec: appBin, args: appArgs, label: 'impostor' });
  const done = await until(() => { const r = k.get(rec.id); return r.state !== 'launching' ? r : null; }, 20000);
  ok(done && done.state === 'failed' && /not held by the picture server/.test(done.lastError) && /taken by another process/.test(done.lastError), 'the record FAILS naming the port and the pid instead of turning ready on a stranger\'s display', done && done.lastError);
  await until(() => !alive(done.pids.server) && !alive(done.pids.x), 8000);
  ok(done.pids.server > 0 && !alive(done.pids.server) && !alive(done.pids.x), 'the x11vnc that had bound [::1] on the same number, and its X, are reaped');
  ok(!!(await D.rfbBanner(port, 1000)), 'the stranger still answers: the keeper signalled only its own sessions');
  await new Promise((r) => impostor.close(r)); k.shutdown();
  // CONTROL: on a free port the same launch turns ready and the 127.0.0.1 listener IS the recorded picture server
  const k2 = mk('r2c2'); await k2.adoptAll(); k2.start();
  const rec2 = await k2.launch({ exec: appBin, args: appArgs, label: 'own-port' });
  const r2 = await until(() => { const r = k2.get(rec2.id); return r.state !== 'launching' ? r : null; });
  ok(r2 && r2.state === 'ready' && D.listenerHeldBy(r2.port, D.sessionCensus([r2.pids.server])) === r2.pids.server, 'CONTROL: on a free port the record is ready and the 127.0.0.1 listener is held by the recorded x11vnc pid');
  // NEGATIVE CONTROL: the round-1 keeper (banner only) turns READY on the impostor's port
  const impostor2 = net.createServer((sock) => { sock.write('RFB 003.008\n'); }); await new Promise((r) => impostor2.listen(0, '127.0.0.1', r));
  const { mod: K1 } = mutant('c', [["        const holder = display.listenerHeldBy(up.port, display.sessionCensus([serverPid], { fresh: true }));", "        const holder = serverPid; // pre-fix: the banner was the whole proof"]]);
  const dataDir = path.join(root, 'r2c-ctl'); fs.mkdirSync(dataDir, { recursive: true });
  const k3 = K1.create({ dataDir, env: baseEnv, broadcast: () => {}, display: { ...NO_XVNC, freePort: async () => impostor2.address().port }, log: { log() {}, warn() {}, error() {} } }); keepers.push(k3);
  await k3.adoptAll(); k3.start();
  const rec3 = await k3.launch({ exec: appBin, args: appArgs, label: 'impostor-ctl' });
  const r3 = await until(() => { const r = k3.get(rec3.id); return r.state !== 'launching' ? r : null; }, 20000);
  ok(r3 && r3.state === 'ready' && r3.port === impostor2.address().port && D.listenerHeldBy(r3.port, [r3.pids.server]) === null, `CONTROL: the pre-fix keeper records READY on port ${r3 && r3.port} whose 127.0.0.1 listener is NOT its x11vnc (the bridge would relay the stranger)`);
  await k3.stop(rec3.id); await new Promise((r) => impostor2.close(r)); k3.shutdown();
  await k2.stop(rec2.id); k2.shutdown();
}
{ // (d) the runaway guard samples the SESSION SET — a launcher whose work is in a child
  const burner = { id: 'childburner', label: 'child burner', exec: 'sh', args: ['-c', 'yes > /dev/null'], category: 'test' };
  const limits = { ...M.LIMITS, GUARD_CPU_PCT: 50, GUARD_CPU_SUSTAIN_MS: 1500, RUNAWAY_COOLDOWN_MS: 60000 };
  const k = mk('r2d', { limits, registryRows: [burner], guardSampleMs: 400, tickMs: 200 }); await k.adoptAll(); k.start();
  const rec = await k.launch({ appId: 'childburner' });
  await until(() => k.get(rec.id).state !== 'launching');
  const r = k.get(rec.id);
  ident.resetProcTables();
  const pids = k.sessionPids(r);
  const a0 = D.procSample(r.pids.app), s0 = D.sessionSample(pids); await sleep(1000);
  const a1 = D.procSample(r.pids.app), s1 = D.sessionSample(pids);
  ok(a0 && a1 && s0 && s1 && a1.cpuTicks - a0.cpuTicks < 20 && s1.cpuTicks - s0.cpuTicks >= 50, `CONTROL: over one second the recorded pid burned ${a1 && a0 ? a1.cpuTicks - a0.cpuTicks : '?'} ticks (the round-1 sample — blind) while its session (${pids.length} pids) burned ${s1 && s0 ? s1.cpuTicks - s0.cpuTicks : '?'}`);
  const liveNow = k.get(rec.id).live;
  ok(liveNow && liveNow.pids >= 2 && liveNow.cpuPct > 50, `the broadcast live sample counts the session's pids and their CPU (${liveNow && liveNow.pids} pids, ${liveNow && Math.round(liveNow.cpuPct)} %)`, liveNow);
  const tripped = await until(() => (k.get(rec.id).state === 'failed' ? k.get(rec.id) : null), 15000);
  ok(tripped && /stopped as a runaway: \d+% CPU sustained/.test(tripped.lastError) && tripped.stoppedBy === 'runaway', 'a burner in a CHILD trips the guard (the whole session is sampled)', tripped && tripped.lastError);
  await sleep(300); ident.resetProcTables();
  ok(tripped && k.sessionPids(tripped).length === 0, 'and the stop emptied every session (the `yes` child too)');
  k.shutdown();
}
{ // (e) the shared desktop is RE-ASKED before a record on it is judged
  const rfb = net.createServer((sock) => { sock.write('RFB 003.008\n'); }); await new Promise((r) => rfb.listen(0, '127.0.0.1', r));
  const mkShared = (dataDir, id) => {
    const app = spawn('sleep', ['3600'], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH, [K.SESSION_ENV]: id } }); app.unref(); children.push(app);
    return app;
  };
  const rec = (id, app) => ({ ...M.newRecord({ id, label: 'shared', exec: 'sleep', args: ['3600'], cwd: null, source: 'adhoc', backend: 'desktop-singleton', via: 'Xtigervnc', fallbackWhy: null, idleTimeoutMs: 0, now: Date.now() - 60000 }), state: 'ready', display: ':7', port: rfb.address().port, pids: { x: null, app: app.pid, server: null, wm: null }, starts: { x: null, app: D.procStart(app.pid), server: null, wm: null } });
  const dataDir = path.join(root, 'r2e'); fs.mkdirSync(dataDir, { recursive: true });
  const app = mkShared(dataDir, 'da-shared'); await sleep(200);
  fs.writeFileSync(path.join(dataDir, 'desktop-apps.json'), JSON.stringify({ apps: { 'da-shared': rec('da-shared', app) }, runawayParkedUntil: {} }));
  let refreshes = 0;
  const facts = { running: false, display: ':7', port: rfb.address().port, authFile: null }; // vnc.js's `_running` before any status() ran
  const singleton = () => ({ ...facts, refresh: async () => { refreshes++; facts.running = true; return { available: true, running: true, port: rfb.address().port }; } });
  const k = mk('r2e', { singleton });
  await k.adoptAll();
  const r = k.get('da-shared');
  ok(refreshes >= 1 && r.state === 'ready' && r.adoptedAt > 0 && alive(app.pid), `adoptAll REFRESHED the singleton fact (${refreshes}×) and ADOPTED the app that lives on the shared desktop`, r && { state: r.state, lastError: r.lastError });
  ok(k.streamTarget('da-shared') && k.streamTarget('da-shared').port === rfb.address().port, 'and it streams (the refreshed `running` reaches streamTarget too)');
  const s = await k.stop('da-shared');
  ok(s.state === 'exited' && !alive(app.pid), 'stop on a shared-desktop record kills the app only (its own session), verified');
  k.shutdown();
  // NEGATIVE CONTROL: the round-1 judgement — the cached boolean, never refreshed — reaps the live app as "X display gone"
  const { mod: K1 } = mutant('e', [
    ["    const shared = await singletonLive(); // rule 6: asked, not remembered", "    const shared = singleton?.() || null; // pre-fix: the cached answer"],
    ["    const s = await singletonLive();\n    const out = { ...f, singletonRunning: !!(s && s.running) };", "    const s = singleton?.() || null; // pre-fix\n    const out = { ...f, singletonRunning: !!(s && s.running) };"],
  ]);
  const dataDir2 = path.join(root, 'r2e-ctl'); fs.mkdirSync(dataDir2, { recursive: true });
  const app2 = mkShared(dataDir2, 'da-shared2'); await sleep(200);
  fs.writeFileSync(path.join(dataDir2, 'desktop-apps.json'), JSON.stringify({ apps: { 'da-shared2': rec('da-shared2', app2) }, runawayParkedUntil: {} }));
  const facts2 = { running: false, display: ':7', port: rfb.address().port, authFile: null };
  const k1 = K1.create({ dataDir: dataDir2, env: baseEnv, broadcast: () => {}, singleton: () => ({ ...facts2, refresh: async () => { facts2.running = true; return { available: true, running: true, port: rfb.address().port }; } }), log: { log() {}, warn() {}, error() {} } }); keepers.push(k1);
  await k1.adoptAll();
  const r1 = k1.get('da-shared2');
  ok(r1.state === 'exited' && /X display gone/.test(r1.lastError) && !alive(app2.pid), 'CONTROL: judged by the cached `running:false`, the pre-fix adoption REAPS a live app on the shared desktop at every boot');
  k1.shutdown();
  await new Promise((r) => rfb.close(r));
}
{ // (f) the bring-up is a TABLE LOOKUP: a fourth rung = one row + one recipe, driven end to end with the keeper UNCHANGED
  const src = fs.readFileSync(path.join(repo, 'src/server/desktop-app-keeper.js'), 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '');
  ok(!/rec\.via ===|'Xvfb\+x11vnc'|'Xvnc'|unknown bring-up/.test(src), 'the keeper source spells no rung (no `rec.via ===`, no Xvnc / Xvfb+x11vnc literal, no "unknown bring-up")');
  ok(/display\.RECIPES\[/.test(src) && /M\.recipeFor|resolved\.recipe/.test(src), 'it looks the recipe UP by the name the PURE table gives it');
  const fourth = Object.freeze({ id: 'fake-rung', label: 'fake', perWindow: true, adaptive: false, stream: 'rfb', needs: Object.freeze([Object.freeze(['Xvfb', 'x11vnc'])]), recipes: Object.freeze({ 'Xvfb+x11vnc': 'x-then-server-copy' }), wired: true });
  const display = { ...NO_XVNC, RECIPES: Object.freeze({ ...D.RECIPES, 'x-then-server-copy': D.RECIPES['x-then-server'] }) };
  const k = mk('r2f', { display, backends: [fourth, ...M.DISPLAY_BACKENDS] }); await k.adoptAll(); k.start();
  const l = await k.list();
  ok(l.availability.backend === 'fake-rung' && l.availability.recipe === 'x-then-server-copy' && l.availability.ladder.length === 4, 'the ladder resolves to the fourth rung and names ITS recipe');
  const rec = await k.launch({ exec: appBin, args: appArgs, label: 'fourth-rung' });
  const r = await until(() => { const x = k.get(rec.id); return x.state !== 'launching' ? x : null; });
  ok(r && r.state === 'ready' && r.backend === 'fake-rung' && r.recipe === 'x-then-server-copy' && r.pids.x > 0 && r.pids.server > 0, 'a session comes up through a recipe name the keeper has never heard of — the record says the rung and the recipe', r && { state: r.state, lastError: r.lastError });
  const hs = await rfbHandshake(r.port);
  ok(hs.banner === 'RFB 003.008\n', 'and it streams');
  await k.stop(rec.id); k.shutdown();
  // a pair the table cannot name is refused BY NAME at launch, nothing spawned
  const broken = Object.freeze({ ...M.backendById('vnc-display'), recipes: Object.freeze({}) });
  const k2 = mk('r2f2', { backends: [broken] }); await k2.adoptAll();
  let refused = null;
  try { await k2.launch({ exec: appBin, args: appArgs, label: 'no-recipe' }); } catch (e) { refused = e; }
  ok(refused && refused.code === 'no-recipe' && /names no bring-up recipe/.test(refused.message) && k2.listApps().length === 0, 'a rung whose via names no recipe is refused by code (no-recipe) before anything is spawned', refused && refused.message);
  k2.shutdown();
}
{ // (g) this suite's own exit sweep — the rule, pinned
  const bogus = { apps: { 'da-me': { pids: { app: process.pid, x: null, server: null, wm: null }, starts: { app: 12345, x: null, server: null, wm: null } }, 'da-me2': { pids: { app: process.pid }, starts: { app: D.procStart(process.pid) } } } };
  ok(sweepTargets(bogus.apps).length === 0, 'a fixture naming THIS process — wrong starttime or even the right one — is never a sweep target');
  ok(alive(process.pid), 'CONTROL: the round-1 predicate (`alive(p)`) would have selected it — this process is alive');
  const rel = path.relative(repo, path.join(repo, 'src/server', `vs-dak-mut-${process.pid}-x.js`));
  const ign = spawnSync('git', ['-C', repo, 'check-ignore', '-q', rel], { env: gitEnvFrom(process.env), stdio: 'ignore' });
  ok(ign.status === 0, `the patched-copy path ${rel} is GITIGNORED (a SIGKILLed run may never dirty the tree and block the release gate)`);
}

console.log('§9 r3 — the round-2 verifier\'s findings, each reproduced on the real keeper and closed with a control');
/** Every live pid carrying `VIBESPACE_DESKTOP_APP=<id>` — the census the verifier used (one /proc walk). */
function markerPids(id) {
  const out = [];
  for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; if (D.environHas(Number(d), `${K.SESSION_ENV}=${id}`)) out.push(Number(d)); }
  return out;
}
{ // (a) a stop that lands DURING the bring-up leaves nothing behind
  const k = mk('r3a'); await k.adoptAll(); k.start();
  const rec = await k.launch({ exec: '/bin/sleep', args: ['3600'], label: 'stop-in-flight' });
  const t0 = Date.now();
  const s = await k.stop(rec.id); // 0 ms after launch: the recipe has not even spawned Xvfb yet
  const stopMs = Date.now() - t0;
  ok(s.state === 'exited' && s.stoppedBy === 'user', `stop() 0 ms after launch answers exited/user (took ${stopMs} ms — it WAITED for the bring-up it cancelled)`, s);
  ok(s.pids.x > 0 && s.pids.server > 0, 'the answer already names the X and picture-server pids the recipe minted meanwhile (the bring-up was settled, not raced)', s.pids);
  await sleep(5000);
  const later = k.get(rec.id);
  const census = markerPids(rec.id);
  ok(census.length === 0, `5 s later NOTHING carries VIBESPACE_DESKTOP_APP=${rec.id} (the verifier measured 2: an Xvfb and a -nopw x11vnc under an exited record)`, census);
  ok(later.state === 'exited' && Object.values(later.pids).filter(Boolean).every((p) => !alive(p)), 'the record is still exited and every recorded pid is dead', later.pids);
  ok(procCensus(k.logRoot).length === 0, 'nothing names this keeper\'s dir any more');
  // a stop landing INSIDE the RFB wait (every part recorded, the port not yet answering) is the other window
  const rec2 = await k.launch({ exec: '/bin/sleep', args: ['3600'], label: 'stop-in-wait' });
  await until(() => (k.get(rec2.id).pids.app ? true : null), 8000);
  const s2 = await k.stop(rec2.id);
  await sleep(1500);
  ok(s2.state === 'exited' && markerPids(rec2.id).length === 0 && k.get(rec2.id).state === 'exited', 'a stop landing after the app spawned but before ready: exited, nothing left carrying the marker');
  k.shutdown();
  // NEGATIVE CONTROL: the round-2 keeper — the bring-up never asks whether its record died, stop() never waits for it,
  // and (r4) no marker belt after the teardown
  const { mod: K2 } = mutant('a', [
    ['    const gone = () => !M.isLiveState(rec.state) || stopping.has(id);', '    const gone = () => false; // pre-fix: the bring-up never looked'],
    ['    const dead = () => !M.isLiveState(rec.state);', '    const dead = () => false; // pre-fix: no late reap, no reap at exit'],
    ['      if (inflightP) {\n        await settleBringUp(id, SETTLE_BRINGUP_MS, inflightP);', '      if (false) {\n        await settleBringUp(id, SETTLE_BRINGUP_MS, inflightP); // pre-fix: stop() did not wait'],
    ...NO_BELT,
  ]);
  const dataDir = path.join(root, 'r3a-ctl'); fs.mkdirSync(dataDir, { recursive: true });
  const k2 = K2.create({ dataDir, env: baseEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } }); keepers.push(k2);
  await k2.adoptAll(); k2.start();
  const c = await k2.launch({ exec: '/bin/sleep', args: ['3600'], label: 'stop-in-flight-ctl' });
  const sc = await k2.stop(c.id);
  await sleep(5000);
  const leftover = markerPids(c.id);
  const lc = k2.get(c.id);
  ok(sc.state === 'exited' && Object.values(sc.pids).every((p) => !p) && lc.state === 'exited' && leftover.length >= 2, `CONTROL: the pre-fix keeper answers exited with NO pids, then ${leftover.length} process(es) carry the marker under that exited record 5 s later (the orphans)`, { sc: sc.pids, later: lc.pids, leftover });
  // the pre-fix leftovers are exactly what the BOOT BELT reaps: a fresh keeper on the same store finds them by marker
  const warned = [];
  const k3b = K.create({ dataDir, env: baseEnv, broadcast: () => {}, log: { log() {}, warn: (m) => warned.push(m), error() {} } }); keepers.push(k3b);
  await k3b.adoptAll();
  await sleep(300);
  ok(markerPids(c.id).length === 0 && leftover.every((p) => !alive(p)), `the next BOOT's marker census reaped the ${leftover.length} leftover(s) of the exited record (${leftover.join(', ')})`);
  ok(warned.some((m) => new RegExp(`${c.id} \\(exited\\) still has ${leftover.length} process\\(es\\) carrying its marker at boot`).test(m)), 'and said so, naming the record, its state and the pids', warned);
  k2.shutdown(); k3b.shutdown();
}
{ // (b) the boot belt is scoped to OUR store: a marker for an id we do not hold is never signalled
  const dataDir = path.join(root, 'r3b'); fs.mkdirSync(dataDir, { recursive: true });
  const ours = spawn('sleep', ['3600'], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH, [K.SESSION_ENV]: 'da-r3b-ours' } }); ours.unref(); children.push(ours);
  const foreign = spawn('sleep', ['3600'], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH, [K.SESSION_ENV]: 'da-r3b-other-instance' } }); foreign.unref(); children.push(foreign);
  const liveRec = spawn('sleep', ['3600'], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH, [K.SESSION_ENV]: 'da-r3b-live' } }); liveRec.unref(); children.push(liveRec);
  await sleep(200);
  const term = { ...M.newRecord({ id: 'da-r3b-ours', label: 'ours', exec: 'sleep', args: [], cwd: null, source: 'adhoc', backend: 'vnc-display', via: 'Xvfb+x11vnc', fallbackWhy: null, idleTimeoutMs: 0, now: Date.now() - 60000 }), state: 'exited', endedAt: Date.now() - 1000, pids: { x: null, app: null, server: null, wm: null }, starts: { x: null, app: null, server: null, wm: null } };
  const rfb = net.createServer((sock) => { sock.write('RFB 003.008\n'); }); await new Promise((r) => rfb.listen(0, '127.0.0.1', r));
  const liveOne = { ...M.newRecord({ id: 'da-r3b-live', label: 'live', exec: 'sleep', args: ['3600'], cwd: null, source: 'adhoc', backend: 'desktop-singleton', via: 'Xtigervnc', fallbackWhy: null, idleTimeoutMs: 0, now: Date.now() - 60000 }), state: 'ready', display: ':7', port: rfb.address().port, pids: { x: null, app: liveRec.pid, server: null, wm: null }, starts: { x: null, app: D.procStart(liveRec.pid), server: null, wm: null } };
  fs.writeFileSync(path.join(dataDir, 'desktop-apps.json'), JSON.stringify({ apps: { 'da-r3b-ours': term, 'da-r3b-live': liveOne }, runawayParkedUntil: {} }));
  const k = K.create({ dataDir, env: baseEnv, broadcast: () => {}, singleton: () => ({ running: true, display: ':7', port: rfb.address().port, authFile: null, refresh: async () => ({ available: true, running: true, port: rfb.address().port }) }), log: { log() {}, warn() {}, error() {} } }); keepers.push(k);
  await k.adoptAll();
  await sleep(300);
  ok(!alive(ours.pid), 'a process carrying a TERMINAL record\'s marker (no pid recorded at all — the SIGKILL-mid-stop shape) is reaped at boot');
  ok(alive(foreign.pid), 'a process carrying a marker for an id NOT in this store (another instance under this uid) is left alone');
  ok(alive(liveRec.pid) && k.get('da-r3b-live').state === 'ready', 'a process carrying a LIVE record\'s marker is adopted, never reaped by the belt');
  ok(k.get('da-r3b-ours').state === 'exited', 'the terminal record stays terminal (the belt reaps, it does not re-judge)');
  await k.stop('da-r3b-live'); k.shutdown(); await new Promise((r) => rfb.close(r));
  try { process.kill(foreign.pid, 'SIGKILL'); } catch {}
}
{ // (c) an identity nobody recorded is NOT proven: null starttimes never make a recycled pid a verified leader
  const strangers = [0, 1, 2].map(() => { const c = spawn('sleep', ['3600'], { detached: true, stdio: 'ignore' }); c.unref(); children.push(c); return c; });
  await sleep(200);
  const mkRec = (id, starts) => ({ ...M.newRecord({ id, label: 'f4', exec: 'sleep', args: [], cwd: null, source: 'adhoc', backend: 'vnc-display', via: 'Xvfb+x11vnc', fallbackWhy: null, idleTimeoutMs: 0, now: Date.now() - 60000 }), state: 'ready', display: ':997', port: 1, pids: { x: strangers[0].pid, server: strangers[1].pid, app: strangers[2].pid, wm: null }, starts });
  const nullStarts = { x: null, server: null, app: null, wm: null };
  const dataDir = path.join(root, 'r3c'); fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'desktop-apps.json'), JSON.stringify({ apps: { 'da-r3c': mkRec('da-r3c', nullStarts) }, runawayParkedUntil: {} }));
  const k = K.create({ dataDir, env: baseEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } }); keepers.push(k);
  await k.adoptAll(); await sleep(300);
  const r = k.get('da-r3c');
  ok(r.state === 'exited' && /X display gone/.test(r.lastError), 'a record whose starttimes are null is not adopted — nothing about it is proven — and is recorded as ended', r && { state: r.state, lastError: r.lastError });
  ok(strangers.every((c) => alive(c.pid)), `the three strangers whose pids the record names are ALL still running (verifier measured [false,false,false]: SIGKILLed via the leader branch)`, strangers.map((c) => alive(c.pid)));
  ok(D.sameProcess(strangers[0].pid, null) === false && D.sameProcess(strangers[0].pid, D.procStart(strangers[0].pid)) === true, 'sameProcess(pid, null) is false for a LIVE pid; with its real starttime it is true (the rule, not liveness)');
  k.shutdown();
  // NEGATIVE CONTROL: the round-2 identity rule (no starttime ⇒ liveness) injected into the FIXED keeper still kills the strangers
  const preFixSame = (pid, starttime) => { if (!D.pidAlive(pid)) return false; const st = D.procStart(pid); if (st == null || starttime == null) return D.pidAlive(pid); return st === starttime; };
  const victims = [0, 1, 2].map(() => { const c = spawn('sleep', ['3600'], { detached: true, stdio: 'ignore' }); c.unref(); children.push(c); return c; });
  await sleep(200);
  const dataDir2 = path.join(root, 'r3c-ctl'); fs.mkdirSync(dataDir2, { recursive: true });
  const rec2 = { ...mkRec('da-r3c2', nullStarts), pids: { x: victims[0].pid, server: victims[1].pid, app: victims[2].pid, wm: null } };
  fs.writeFileSync(path.join(dataDir2, 'desktop-apps.json'), JSON.stringify({ apps: { 'da-r3c2': rec2 }, runawayParkedUntil: {} }));
  const k2 = K.create({ dataDir: dataDir2, env: baseEnv, broadcast: () => {}, display: { ...NO_XVNC, sameProcess: preFixSame }, log: { log() {}, warn() {}, error() {} } }); keepers.push(k2);
  await k2.adoptAll(); await sleep(300);
  ok(victims.every((c) => !alive(c.pid)), 'CONTROL: with the pre-fix sameProcess (null starttime ⇒ liveness) the same adoption SIGKILLs all three strangers', victims.map((c) => alive(c.pid)));
  for (const c of [...strangers, ...victims]) { try { process.kill(c.pid, 'SIGKILL'); } catch {} }
}
{ // (d) the runaway guard counts the work of children the application has already REAPED
  const churn = { id: 'churn', label: 'churning burner', exec: 'sh', args: ['-c', 'while :; do yes | head -c 30000000 >/dev/null; done'], category: 'test' };
  const limits = { ...M.LIMITS, GUARD_CPU_PCT: 50, GUARD_CPU_SUSTAIN_MS: 1500, RUNAWAY_COOLDOWN_MS: 60000 };
  const k = mk('r3d', { limits, registryRows: [churn], guardSampleMs: 400, tickMs: 200 }); await k.adoptAll(); k.start();
  const rec = await k.launch({ appId: 'churn' });
  await until(() => k.get(rec.id).state !== 'launching');
  const t0 = Date.now();
  const tripped = await until(() => (k.get(rec.id).state === 'failed' ? k.get(rec.id) : null), 15000);
  ok(tripped && /stopped as a runaway: \d+% CPU sustained/.test(tripped.lastError) && tripped.stoppedBy === 'runaway', `a burner whose work runs in short-lived children (yes | head, ~30 MB each) trips the guard in ${Date.now() - t0} ms (the verifier measured 20 s of 'ready' at 0 %)`, tripped && tripped.lastError);
  await sleep(300); ident.resetProcTables();
  ok(tripped && k.sessionPids(tripped).length === 0, 'and the stop emptied the session');
  k.shutdown();
  // NEGATIVE CONTROL: the round-2 sample (the LIVE pids' own ticks only) on the same shape stays `ready`
  const liveOnly = (pids) => { let cpuTicks = 0, rssBytes = 0, n = 0; for (const pid of pids || []) { const s = D.procSample(pid); if (!s) continue; cpuTicks += s.cpuTicks; rssBytes += s.rssBytes; n++; } return n ? { cpuTicks, rssBytes, pids: n } : null; };
  const k2 = mk('r3d-ctl', { limits, registryRows: [churn], guardSampleMs: 400, tickMs: 200, display: { ...NO_XVNC, sessionSample: liveOnly } }); await k2.adoptAll(); k2.start();
  const rec2 = await k2.launch({ appId: 'churn' });
  await until(() => k2.get(rec2.id).state !== 'launching');
  const trippedCtl = await until(() => (k2.get(rec2.id).state === 'failed' ? k2.get(rec2.id) : null), 6000);
  const liveCtl = k2.get(rec2.id).live;
  ok(!trippedCtl && k2.get(rec2.id).state === 'ready', `CONTROL: sampling live pids only, the same burner is still 'ready' after 6 s (live.cpuPct ${liveCtl && Math.round(liveCtl.cpuPct)} %)`);
  await k2.stop(rec2.id); k2.shutdown();
  // BOUNDARY, CONSTRUCTED not sampled (2.369.125 r5): the one case no reader over the session's own /proc entries can
  // see is a burner whose parent is DEAD before the burner is reaped — init (the subreaper) reaps it and its ticks land
  // in nobody's cutime inside the session. The earlier shape, coreutils `timeout`'s group kill of `sh -c yes`, only
  // SOMETIMES produced that ordering: in 4 of 6 standalone runs the intermediate sh reaped `yes` before its own signal
  // landed and one iteration's 70 ticks rode cutime up into the loop — the heavy tier went red on the race twice
  // (2026-09-21). So the leg kills the parent FIRST (`kill -9 $$` right after the fork) and the burner 0.7 s later.
  const pidFile = path.join(root, 'orphan-burner.pid');
  const loop = spawn('sh', ['-c', `while :; do sh -c 'yes >/dev/null & echo $! > "${pidFile}"; kill -9 $$'; sleep 0.7; kill -9 "$(cat "${pidFile}")" 2>/dev/null; done`], { detached: true, stdio: 'ignore' }); loop.unref(); children.push(loop);
  await sleep(2500);
  const parent = D.procSample(loop.pid);
  ok(parent && parent.reapedTicks < 20 && parent.cpuTicks < 5, `BOUNDARY: after 2.5 s of orphaned-burner churn (~3 × 70 ticks burned) the loop's own reaped ticks are ${parent && parent.reapedTicks} (init reaped every yes — its parent was dead first; a per-session cgroup odometer is the only reader that would see it — deferred, named in the kb)`, parent);
  try { process.kill(-loop.pid, 'SIGKILL'); } catch {}
  try { const op = Number(fs.readFileSync(pidFile, 'utf8').trim()); if (op > 1) process.kill(op, 'SIGKILL'); } catch {}
}
{ // (e) an EnableContinuousUpdates from the shipped client does not blind the idle clock (through the real bridge)
  const k = mk('r3e'); await k.adoptAll(); k.start();
  const rec = await k.launch({ exec: appBin, args: appArgs, label: 'ecu' });
  await until(() => k.get(rec.id).state !== 'launching');
  const inputs = [];
  const stream = S.create({ auth: { requestAuthed: () => true }, resolveTarget: (id) => k.streamTarget(id), onInput: (id) => inputs.push(id), log: { warn() {} } });
  const srv = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => { const id = S.upgradeId(req.url.split('?')[0]); if (!id) { socket.destroy(); return; } stream.handleUpgrade(req, socket, head, id); });
  const port = await freePort();
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  const WebSocket = require('ws');
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/desktop/${rec.id}/stream`);
  await new Promise((r) => ws.on('open', r));
  ws.send(Buffer.from('RFB 003.008\n')); ws.send(Buffer.from([1])); ws.send(Buffer.from([1]));
  // noVNC's exact 10-byte EnableContinuousUpdates (type, enable, x, y, w, h), then a KeyEvent
  ws.send(Buffer.from([150, 1, 0, 0, 0, 0, 0x05, 0x00, 0x03, 0x20]));
  ws.send(Buffer.from([4, 1, 0, 0, 0, 0, 0, 0x61]));
  await sleep(300);
  ok(inputs.length === 1, `after a 10-byte EnableContinuousUpdates the next KeyEvent is still counted as INPUT (${inputs.length} reported; the round-2 table read 4 bytes and stayed misaligned for the rest of the connection)`);
  ws.close();
  await new Promise((r) => srv.close(r));
  await k.stop(rec.id); k.shutdown();
}

console.log('§10 r4 — the round-3 verifier\'s findings, each reproduced on the real keeper and closed with a control that fails alone');
/** A stop INJECTED at the moment the keeper asks the display module for its next part — the verifier's
 *  reproduction: `startApp` = X and picture server recorded, the app's spawn in flight; `freePort` = X
 *  recorded, the x11vnc spawn ahead. Returns the stop's answer, the record, and the census 5 s later. */
async function stopBetweenParts(Kmod, dataDir, at, label) {
  fs.mkdirSync(dataDir, { recursive: true });
  let k, cur = null, stopP = null;
  const display = { ...NO_XVNC,
    startApp: (o) => { if (at === 'startApp' && !stopP) stopP = k.stop(cur).catch((e) => ({ err: e.message })); return D.startApp(o); },
    freePort: () => { if (at === 'freePort' && !stopP) stopP = k.stop(cur).catch((e) => ({ err: e.message })); return D.freePort(); },
  };
  const warned = [];
  k = Kmod.create({ dataDir, env: baseEnv, broadcast: () => {}, display, log: { log() {}, warn: (m) => warned.push(m), error() {} } }); keepers.push(k);
  await k.adoptAll(); k.start();
  const rec = await k.launch({ exec: '/bin/sleep', args: ['3600'], label }); cur = rec.id;
  await until(() => stopP, 10000);
  const s = stopP ? await stopP : null;
  await sleep(5000);
  const later = k.get(rec.id);
  const census = markerPids(rec.id);
  k.shutdown();
  return { id: rec.id, s, later, census, warned };
}
{ // (a) rule 9 — a stop that lands BETWEEN parts settles on the bring-up it CAPTURED, so the part recorded meanwhile is torn down
  const a = await stopBetweenParts(K, path.join(root, 'r4a-startApp'), 'startApp', 'stop-at-app-spawn');
  ok(a.s && a.s.state === 'exited' && a.s.stoppedBy === 'user', 'a stop injected at the app\'s spawn (X + picture server recorded, the app in flight) answers exited/user', a.s && { state: a.s.state, err: a.s.err });
  ok(a.s && a.s.pids.x > 0 && a.s.pids.server > 0 && a.s.pids.app > 0, 'the answer names all three pids — the app that was recorded DURING the first teardown included', a.s && a.s.pids);
  ok(a.census.length === 0, `5 s later NOTHING carries VIBESPACE_DESKTOP_APP=${a.id} (the verifier measured /bin/sleep 3600 alive under the exited record at 1.5 s and 5.5 s)`, a.census);
  ok(a.later.state === 'exited' && Object.values(a.later.pids).filter(Boolean).every((p) => !alive(p)), 'the record is still exited and every recorded pid — the app too — is dead', a.later.pids);
  const b = await stopBetweenParts(K, path.join(root, 'r4a-freePort'), 'freePort', 'stop-at-free-port');
  ok(b.s && b.s.state === 'exited' && b.s.pids.x > 0 && b.s.pids.server > 0 && b.census.length === 0, 'the other window (X recorded, the x11vnc spawn ahead): exited, the listener recorded, nothing carries the marker 5 s later', b.s && { pids: b.s.pids, census: b.census });
  // THE CAPTURE HOLDS ALONE: with the marker belt REMOVED the same injection is still clean — the order is a mechanism,
  // not the belt's timing accident (on this box the app spawns within ms, so teardown #1's census would also have found it)
  const { mod: Kb } = mutant('r4a-belt-off', NO_BELT);
  const c = await stopBetweenParts(Kb, path.join(root, 'r4a-belt-off'), 'startApp', 'stop-at-app-spawn-no-belt');
  ok(c.s && c.s.state === 'exited' && c.s.pids.app > 0 && c.census.length === 0 && !c.warned.some((m) => /still carry its marker after the session teardown/.test(m)), 'with the marker belt removed the captured bring-up ALONE still leaves nothing (no belt line was printed — the second teardown reaped the app)', { pids: c.s && c.s.pids, census: c.census, belt: c.warned.filter((m) => /marker/.test(m)) });
  // NEGATIVE CONTROL: the round-3 keeper (nothing captured, no belt) — the app survives under `exited`
  const { mod: K3 } = mutant('r4a-r3', [...NO_CAPTURE, ...NO_BELT]);
  const d = await stopBetweenParts(K3, path.join(root, 'r4a-ctl'), 'startApp', 'stop-at-app-spawn-ctl');
  ok(d.s && d.s.state === 'exited' && d.s.pids.app > 0 && d.census.length === 1 && d.census[0] === d.s.pids.app && alive(d.s.pids.app), `CONTROL: the round-3 keeper answers exited with pids.app set and that very pid still carries the marker 5 s later (${d.census.join(', ')})`, { pids: d.s && d.s.pids, census: d.census });
  ok(!d.warned.some((m) => /reaping|still running|leftover/.test(m)), 'CONTROL: and it printed no reap / still-running line — nothing knew', d.warned);
  for (const p of d.census) { try { process.kill(p, 'SIGKILL'); } catch {} }
}
{ // (b) rule 10 — a member that setsid()s itself is found by the marker at EVERY terminal path, not only at boot
  const daemonise = 'setsid sleep 3600 </dev/null >/dev/null 2>&1 & exec sleep 3600';
  const warned = [];
  const k = mk('r4b', { log: { log() {}, warn: (m) => warned.push(m), error() {} } }); await k.adoptAll(); k.start();
  const rec = await k.launch({ exec: 'sh', args: ['-c', daemonise], label: 'daemonising app' });
  await until(() => (k.get(rec.id).state === 'ready' ? true : null), 20000);
  const whileReady = markerPids(rec.id);
  const sidSet = new Set(k.sessionPids(k.get(rec.id)));
  const escaped = whileReady.filter((p) => !sidSet.has(p));
  ok(k.get(rec.id).state === 'ready' && escaped.length === 1, `while ready ${whileReady.length} processes carry the marker and exactly ONE of them (${escaped.join(', ')}) is in no recorded leader's session — the escape is real, the sid table cannot see it`, { whileReady, sidSet: [...sidSet] });
  const s = await k.stop(rec.id);
  await sleep(1500);
  const after = markerPids(rec.id);
  ok(s.state === 'exited' && s.lastError == null && after.length === 0 && escaped.every((p) => !alive(p)), 'stop() ⇒ exited, lastError null, and 1.5 s later NOTHING carries the marker — the setsid\'d worker included (the verifier measured it alive)', { state: s.state, lastError: s.lastError, after });
  ok(warned.some((m) => new RegExp(`${rec.id}: 1 process\\(es\\) still carry its marker after the session teardown .*${escaped[0]} — reaping`).test(m)), 'and the teardown SAID so, naming the pid it found outside every session', warned.filter((m) => /marker/.test(m)));
  // the SAME class through a terminal path that is NOT stop(): the app exits after daemonising a worker
  const rec2 = await k.launch({ exec: 'sh', args: ['-c', 'setsid sleep 3600 </dev/null >/dev/null 2>&1 & sleep 1; exit 0'], label: 'exit-after-daemonising' });
  const ended = await until(() => (!M.isLiveState(k.get(rec2.id).state) ? k.get(rec2.id) : null), 25000);
  await sleep(1500);
  ok(ended && ended.state === 'exited' && /application exited \(code 0\)/.test(ended.lastError) && markerPids(rec2.id).length === 0, 'an app that EXITS after daemonising a worker: the app-exit teardown reaps the worker too (record exited, nothing carries the marker)', ended && { state: ended.state, lastError: ended.lastError, census: markerPids(rec2.id) });
  k.shutdown();
  // NEGATIVE CONTROL: the belt removed — the round-3 teardown (sid table only) leaves the worker under `exited`, and the BOOT belt is what reaps it
  const { mod: Kb } = mutant('r4b-belt-off', NO_BELT);
  const dataDir = path.join(root, 'r4b-ctl'); fs.mkdirSync(dataDir, { recursive: true });
  const kb = Kb.create({ dataDir, env: baseEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } }); keepers.push(kb);
  await kb.adoptAll(); kb.start();
  const c = await kb.launch({ exec: 'sh', args: ['-c', daemonise], label: 'daemonising app ctl' });
  await until(() => (kb.get(c.id).state === 'ready' ? true : null), 20000);
  const sc = await kb.stop(c.id);
  await sleep(1500);
  const leftover = markerPids(c.id);
  ok(sc.state === 'exited' && sc.lastError == null && leftover.length === 1 && alive(leftover[0]), `CONTROL: with the marker belt removed the same stop answers exited/lastError null and the setsid'd worker (${leftover.join(', ')}) still carries the marker 1.5 s later`, { state: sc.state, leftover });
  kb.shutdown();
  const k3 = K.create({ dataDir, env: baseEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } }); keepers.push(k3);
  await k3.adoptAll(); await sleep(300);
  ok(markerPids(c.id).length === 0 && leftover.every((p) => !alive(p)), 'the next boot\'s census reaps it (the layer the verifier measured — a restart was the only thing that ever found it)');
  k3.shutdown();
}
{ // (c) rule 10 for the runaway guard — a burner that setsid()'d out of every leader's session is still counted
  const esc = { id: 'esc', label: 'escaped burner', exec: 'sh', args: ['-c', 'setsid sh -c "exec yes >/dev/null" </dev/null >/dev/null 2>&1 & exec sleep 3600'], category: 'test' };
  const limits = { ...M.LIMITS, GUARD_CPU_PCT: 50, GUARD_CPU_SUSTAIN_MS: 1500, RUNAWAY_COOLDOWN_MS: 60000 };
  const k = mk('r4c', { limits, registryRows: [esc], guardSampleMs: 400, tickMs: 200 }); await k.adoptAll(); k.start();
  const rec = await k.launch({ appId: 'esc' });
  await until(() => (k.get(rec.id).state !== 'launching' ? true : null), 20000);
  const t0 = Date.now();
  const tripped = await until(() => (k.get(rec.id).state === 'failed' ? k.get(rec.id) : null), 15000);
  ok(tripped && /stopped as a runaway: \d+% CPU sustained/.test(tripped.lastError) && tripped.stoppedBy === 'runaway', `a burner in a setsid'd child trips the guard in ${Date.now() - t0} ms (the verifier measured 0 % for 20 s while ready)`, tripped && tripped.lastError);
  await sleep(500); ident.resetProcTables();
  ok(tripped && markerPids(rec.id).length === 0, 'and the runaway stop emptied the session, escaped burner included');
  k.shutdown();
  // NEGATIVE CONTROL: the guard over the sid table alone stays `ready` at 0 %
  const { mod: Kg } = mutant('r4c-sid-only', NO_GUARD_UNION);
  const dataDir = path.join(root, 'r4c-ctl'); fs.mkdirSync(dataDir, { recursive: true });
  const k2 = Kg.create({ dataDir, env: baseEnv, broadcast: () => {}, limits, registryRows: [esc], guardSampleMs: 400, tickMs: 200, log: { log() {}, warn() {}, error() {} } }); keepers.push(k2);
  await k2.adoptAll(); k2.start();
  const rec2 = await k2.launch({ appId: 'esc' });
  await until(() => (k2.get(rec2.id).state !== 'launching' ? true : null), 20000);
  const trippedCtl = await until(() => (k2.get(rec2.id).state === 'failed' ? k2.get(rec2.id) : null), 6000);
  const liveCtl = k2.get(rec2.id).live;
  ok(!trippedCtl && k2.get(rec2.id).state === 'ready' && liveCtl && liveCtl.cpuPct < 25, `CONTROL: sampling the sid table alone, the same burner is still 'ready' after 6 s at cpuPct ${liveCtl && Math.round(liveCtl.cpuPct)} % over ${liveCtl && liveCtl.pids} pids`);
  await k2.stop(rec2.id); k2.shutdown();
  await sleep(300);
  ok(markerPids(rec2.id).length === 0, 'CONTROL cleanup: the fixed stop of the mutant keeper (its belt intact) reaped the escaped burner');
}

console.log(`${fail ? `\n${fail} FAILED (${pass} passed` : `\nALL PASS (${pass}`}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);

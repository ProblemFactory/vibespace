#!/usr/bin/env node
// DESKTOP-APP KEEPER — end to end on a REAL Xvfb + x11vnc (docs/design-desktop-apps
// §6 row 3, P8-1, 2026-09-13): launch → the port listens → an RFB handshake
// over `net` → the record is on disk → the keeper PROCESS is SIGKILLed and a
// new keeper on the same data dir ADOPTS the session (pid+starttime+port) →
// stop is clean (every recorded pid gone, the /proc census of processes on
// this keeper's display equal before and after, no orphan X) — plus the ONE
// ws bridge (401 without the cookie, 404 for an unknown id, 501 by name for an
// xpra target, bytes relayed, input reported), the routes (host refusal),
// the idle timeout, keep-alive, the cap, and the resource REPORT (2026-09-25:
// never a stop — a CPU burner with the shared limits shrunk is REPORTED and
// keeps running; a stop-on-over keeper copy is the negative control). §8 (r2, 2026-09-14) reproduces
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
// fixed names; the patched keeper/bridge copies (negative controls) are written
// OUTSIDE the tree (scripts/mutant-copy.mjs, `require` re-bound to the real
// module's path) — §tree measures that while they exist.
// §14 (r6, 2026-09-22): a negotiated Watch-mode viewer through the real bridge to
// the real xpra — its picture flows (hello, new-window, draws) and its
// shutdown-server / exit-server never arrive; the r5 bridge as a patched copy is
// the control (the same exit-server ends the session).
// §15 (2026-09-22): THE KEYMAP FENCE on the same rung — a Watch viewer's picture
// needs no keymap packet (measured), its keyboard-config / keymap-changed never
// reach X's keymap (xmodmap), the held one is replayed at its takeover (X then
// carries it; a pane that connected watching types "abc" into a real xterm);
// controls: the r6 allowlist reprograms X, the fence without the replay types garbage.
// Run: node scripts/test-desktop-app-keeper.mjs
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
import { mutantCopies, copiesCensus, sweepLegacy } from './mutant-copy.mjs';
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

// P8-2 (2026-09-21): xpra is WIRED and, when installed, wins the ladder (DA1). The vnc-display legs below PIN their
// rung through the instance preference (settings `desktop.backendPrefs`, a REORDER — nothing falls, so fallbackWhy
// is null whether or not xpra is on this box); §12 drives the xpra rung itself with the default order.
const XPRA_WHY = null;
const PIN = { 'desktop.backendPrefs': 'vnc-display, xpra, desktop-singleton' };
const XPRA_BIN = D.binOnPath('xpra', { env: process.env });
/** The two pins every keeper this suite builds by hand gets (the mk() ones too): the vnc-display rung first, and its Xvfb+x11vnc spelling. */
const PINNED = Object.freeze({ get serverSetting() { return (key) => PIN[key]; }, get backends() { return XVFB_TABLE; } });
const XVFB_TABLE = Object.freeze(M.DISPLAY_BACKENDS.map((b) => (b.id === 'vnc-display' ? Object.freeze({ ...b, needs: Object.freeze([Object.freeze(['Xvfb', 'x11vnc'])]), recipes: Object.freeze({ 'Xvfb+x11vnc': 'x-then-server' }) }) : b)));
// 2.369.137 (master, merged with P8-2 in 2.369.156 — tigervnc-standalone-server landed on this box for the vnc-fit work):
// with an Xvnc on PATH the keeper takes the `x-serves-rfb` recipe (X IS the picture server), so a leg that pins the
// Xvfb+x11vnc recipe may also hand the keeper display FACTS with Xvnc/Xtigervnc hidden — the leg tests the recipe, not
// this box's inventory (the .131 lesson: judge by presence, never a literal). XVFB_TABLE above is the same pin at the
// table; both hide Xvnc, and the legs that take NO_XVNC keep it.
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
/** `Xvfb-for-Xpra-S<xpra pid>` ORPHANS BY EVIDENCE (x5 round, 2026-09-22): §14's exit-server CONTROL ends an xpra through
 *  the r5 bridge and its Xvfb outlives it (xpra names its Xvfb after itself). A process is ours only when ALL hold: its
 *  argv[0] is `Xvfb-for-Xpra-S<n>`, the xpra pid <n> is DEAD, its cwd is inside THIS suite's scratch family
 *  (`/tmp/vs-desktop-keeper-<pid>`), and that scratch dir is GONE (this run's, after its rm — or a crashed run's) with its
 *  suite pid dead or this process. Never a name alone: another checkout's live run keeps its own. */
const scratchFamily = root.slice(0, root.length - String(process.pid).length - 1);
function xvfbOrphans() {
  const out = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    let cmd = ''; try { cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'latin1'); } catch { continue; }
    const m = /^Xvfb-for-Xpra-S(\d+)\0/.exec(cmd);
    if (!m || alive(Number(m[1]))) continue;
    let cwd = ''; try { cwd = fs.readlinkSync(`/proc/${d}/cwd`).replace(/ \(deleted\)$/, ''); } catch { continue; }
    const f = new RegExp(`^${scratchFamily.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)(/|$)`).exec(cwd);
    if (!f) continue;
    const runPid = Number(f[1]), runDir = `${scratchFamily}-${runPid}`;
    if (fs.existsSync(runDir) || (runPid !== process.pid && alive(runPid))) continue;
    out.push(Number(d));
  }
  return out;
}
const MUTK = mutantCopies('dak', repo);

const cleanup = () => {
  for (const k of keepers) { try { k.shutdown(); } catch {} }
  for (const c of children) { try { c.kill('SIGKILL'); } catch {} }
  // reap anything still on a display of ours (a failed leg must not leave an X server) — by the RULE above
  try { for (const p of sweepTargets(readStoreAll())) { try { process.kill(p, 'SIGKILL'); } catch {} } } catch {}
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  try { const o = xvfbOrphans(); for (const p of o) { try { process.kill(p, 'SIGKILL'); } catch {} } if (o.length) console.log(`  (exit sweep reaped ${o.length} orphaned Xvfb-for-Xpra process(es) by evidence: ${o.join(', ')})`); } catch {}
};
/** A PATCHED COPY of the real keeper (outside the tree, its relative requires
 *  re-bound to the real path), each replacement asserted to hit exactly once —
 *  the negative controls of §8. */
function mutant(tag, replacements) {
  const src = fs.readFileSync(path.join(repo, 'src/server/desktop-app-keeper.js'), 'utf8');
  let out = src;
  for (const [from, to] of replacements) { const n = out.split(from).length - 1; if (n !== 1) throw new Error(`mutant ${tag}: expected exactly one hit for ${JSON.stringify(from)}, got ${n}`); out = out.replace(from, to); }
  const file = MUTK.write('src/server/desktop-app-keeper.js', out, tag);
  return { mod: require(file), file };
}
// in-tree copies a PRE-FIX run stranded are swept (DEAD pids only — two checkouts may run this suite at once)
sweepLegacy(repo, ['src/server'], /^vs-dak-mut-(\d+)-/);
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
  const settings = { ...PIN, ...(extra.settings || {}) };
  // this box gained a REAL Xvnc with the xpra install (2026-09-21) — the §1-§6 legs are written for the Xvfb+x11vnc
  // spelling (three processes), so the default keepers hand in a table whose vnc-display row knows only that group;
  // §7 drives the Xvnc spelling on purpose with the shipped table and its shim, §12 the xpra rung
  const k = K.create({ dataDir, env: baseEnv, broadcast: (m) => events.push(m), serverSetting: (key) => settings[key], backends: XVFB_TABLE, log: { log() {}, warn() {}, error() {} }, ...extra });
  k._events = events; keepers.push(k);
  return k;
};
/** 2026-09-25: the resource verdict REPORTS — the record's live row names `over`; the state never changes for it. */
const reportedOver = (k, id, ms = 15000) => until(() => { const r = k.get(id); return r && r.live && r.live.over ? r : null; }, ms);
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
  // two FAKE xpra upstreams (ws servers on loopback): each records what reached it — a second id must never reach the first's port
  const { WebSocketServer } = require('ws');
  const fakeUp = async ({ onConnect = null } = {}) => { const wss = new WebSocketServer({ host: '127.0.0.1', port: 0, handleProtocols: (ps) => (ps.has('binary') ? 'binary' : false) }); await new Promise((r) => wss.on('listening', r)); const st = { conns: 0, got: [], protocols: [], closed: 0 }; wss.on('connection', (c, req) => { st.conns++; st.protocols.push(c.protocol); if (onConnect) onConnect(c); c.on('message', (m, isBinary) => { st.got.push({ bytes: Buffer.from(m), isBinary }); c.send(Buffer.concat([Buffer.from('echo:'), Buffer.from(m)])); }); c.on('close', () => { st.closed++; }); }); return { port: wss.address().port, st, close: () => new Promise((r) => { for (const c of wss.clients) { try { c.close(1001, 'upstream gone'); } catch {} } wss.close(r); }) }; }; // ws ≥ 8: close() alone leaves clients open and the http server's close waits for them
  const upA = await fakeUp(), upB = await fakeUp();
  const streamLog = [];
  const stream = S.create({ auth: { requestAuthed: () => authed }, resolveTarget: (id) => (id === 'xpra-one' ? { kind: 'xpra', port: upA.port } : id === 'xpra-two' ? { kind: 'xpra', port: upB.port } : id === 'weird' ? { kind: 'rdp', port: 1 } : k.streamTarget(id)), onInput: (id) => inputs.push(id), log: { warn() {}, log: (l) => streamLog.push(String(l)) } });
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
  const weird = await tryWs('/api/desktop/weird/stream');
  ok(weird.status === 501, `an UNKNOWN stream kind is still refused 501 by name (${weird.status})`);
  {
    // P8-2: an xpra target is RELAYED ws↔ws — binary both ways, one message per packet, the client's subprotocol honoured, input judged by packet type
    const rpkt = (type) => { const t = Buffer.from(type); const payload = Buffer.concat([Buffer.from([192 + 2, 128 + t.length]), t, Buffer.from([0])]); const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 0x10; h.writeUInt32BE(payload.length, 4); return Buffer.concat([h, payload]); };
    const n0 = inputs.length;
    const wsx = new WebSocket(`ws://127.0.0.1:${port}/api/desktop/xpra-one/stream?viewer=v-x1`, ['binary']);
    const gotBack = [];
    wsx.on('message', (m) => gotBack.push(Buffer.from(m)));
    let xerr = null; wsx.on('error', (e) => { xerr = e; });
    await new Promise((r) => wsx.on('open', r));
    ok(wsx.protocol === 'binary', `the browser's 'binary' subprotocol is answered on the bridge (${wsx.protocol})`);
    wsx.send(rpkt('ping')); wsx.send(rpkt('key-action'));
    await until(() => (upA.st.got.length >= 2 ? true : null), 3000);
    ok(upA.st.conns === 1 && upA.st.protocols[0] === 'binary' && upA.st.got.length === 2 && upA.st.got.every((g) => g.isBinary) && upA.st.got[1].bytes.equals(rpkt('key-action')), 'the fake xpra received ONE connection speaking binary, both packets byte-identical, binary frames', { conns: upA.st.conns, n: upA.st.got.length });
    await until(() => (gotBack.length >= 2 ? true : null), 3000);
    ok(gotBack.length === 2 && gotBack[1].equals(Buffer.concat([Buffer.from('echo:'), rpkt('key-action')])), 'the upstream\'s answers reach the browser as binary messages, framing preserved');
    ok(inputs.length === n0 + 1 && inputs[inputs.length - 1] === 'xpra-one', `ping is not input, key-action is: exactly ONE input reported for xpra-one (${inputs.length - n0})`);
    ok(upB.st.conns === 0, 'the second fake upstream saw NOTHING — an id reaches only its own port');
    ok(stream.viewerAlive('xpra-one', 'v-x1') && stream.viewersOf('xpra-one').join() === 'v-x1', 'the viewer id is registered on an xpra stream too');
    ok(stream.connections('xpra-one') === 1 && stream.connections('xpra-two') === 0, 'connections(id) counts the OPEN bridge sockets of an id (the keeper\'s "somebody watches" fact)');
    const wsy = new WebSocket(`ws://127.0.0.1:${port}/api/desktop/xpra-two/stream`, ['binary']);
    await new Promise((r) => wsy.on('open', r));
    wsy.send(rpkt('pointer-position'));
    await until(() => (upB.st.got.length >= 1 ? true : null), 3000);
    ok(upB.st.conns === 1 && upA.st.conns === 1 && upB.st.got[0].bytes.equals(rpkt('pointer-position')), 'xpra-two reaches ITS port and only it (A still 1 connection, B 1)');
    wsx.close(); wsy.close();
    await until(() => (upA.st.closed === 1 && upB.st.closed === 1 ? true : null), 3000);
    ok(upA.st.closed === 1 && upB.st.closed === 1, 'closing the browser side closes the upstream socket (close on either side)');
    ok(stream.connections('xpra-one') === 0 && stream.connections('xpra-two') === 0, 'connections(id) is back to 0 once the sockets closed');
    ok(streamLog.some((l) => /xpra-one: bridge opened → ws:\/\/127\.0\.0\.1:\d+\/ \(xpra\) \(viewer v-x1\)/.test(l)) && streamLog.some((l) => /xpra-one: closed \(the browser closed, code \d+\) after \d+s, \d+ B to the browser, \d+ B to the server \(xpra\), viewer v-x1/.test(l)), 'the xpra bridge logs the open and ONE named close line', streamLog.filter((l) => /xpra-one/.test(l)));
    ok(!xerr, `no browser-side socket error (${xerr && xerr.message})`);
    ok(!stream.viewerAlive('xpra-one', 'v-x1'), 'the viewer is gone after its socket closed');
    // the upstream hanging up NAMES itself: a fake that sends a `disconnect` packet then closes
    const dis = Buffer.concat([Buffer.from([192 + 3, 128 + 10]), Buffer.from('disconnect'), Buffer.from([128 + 12]), Buffer.from('server error'), Buffer.from([128 + 8]), Buffer.from('bad luck')]);
    const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 0x10; h.writeUInt32BE(dis.length, 4);
    const upC = await fakeUp({ onConnect: (c) => { c.send(Buffer.concat([h, dis])); setTimeout(() => { try { c.close(1000, 'bye'); } catch {} }, 100); } });
    const streamC = S.create({ auth: { requestAuthed: () => true }, resolveTarget: () => ({ kind: 'xpra', port: upC.port }), log: { warn() {}, log: (l) => streamLog.push(String(l)) } });
    const srvC = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
    srvC.on('upgrade', (req, socket, head) => streamC.handleUpgrade(req, socket, head, 'xpra-c'));
    const portC = await freePort(); await new Promise((r) => srvC.listen(portC, '127.0.0.1', r));
    const wsc = new WebSocket(`ws://127.0.0.1:${portC}/api/desktop/xpra-c/stream`, ['binary']);
    const gotC = [];
    wsc.on('message', (m) => gotC.push(Buffer.from(m)));
    await new Promise((r) => wsc.on('open', r));
    await until(() => (streamLog.some((l) => /xpra-c: closed/.test(l)) ? true : null), 4000);
    ok(gotC.length === 1 && gotC[0].equals(Buffer.concat([h, dis])), 'the disconnect packet itself still reached the browser (the bridge names, it never eats)');
    await upC.close();
    const upE = await fakeUp({ onConnect: (c) => { c.send(Buffer.from('disconnect invalid packet encoding: no decoder')); setTimeout(() => { try { c.close(1000, 'bye'); } catch {} }, 100); } });
    const streamE = S.create({ auth: { requestAuthed: () => true }, resolveTarget: () => ({ kind: 'xpra', port: upE.port }), log: { warn() {}, log: (l) => streamLog.push(String(l)) } });
    const srvE = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
    srvE.on('upgrade', (req, socket, head) => streamE.handleUpgrade(req, socket, head, 'xpra-e'));
    const portE = await freePort(); await new Promise((r) => srvE.listen(portE, '127.0.0.1', r));
    const wse = new WebSocket(`ws://127.0.0.1:${portE}/api/desktop/xpra-e/stream`, ['binary']);
    await new Promise((r) => wse.on('open', r));
    await until(() => (streamLog.some((l) => /xpra-e: closed/.test(l)) ? true : null), 4000);
    ok(/closed \(the xpra server disconnected: invalid packet encoding: no decoder\)/.test(streamLog.find((l) => /xpra-e: closed/.test(l)) || ''), 'the BARE TEXT `disconnect <reason>` shape (what 6.5.3 sends a client it cannot decode) is named in the close line too', streamLog.filter((l) => /xpra-e/.test(l)));
    try { wse.close(); } catch {}
    await new Promise((r) => srvE.close(r)); await upE.close();
    const closeLine = streamLog.find((l) => /xpra-c: closed/.test(l)) || '';
    ok(/closed \(the xpra server disconnected: server error \/ bad luck\)/.test(closeLine), 'a `disconnect` packet from the xpra side puts ITS reason in the close line (the close names who closed and why)', closeLine);
    try { wsc.close(); } catch {}
    await new Promise((r) => srvC.close(r));
    // NETEM (dev-only): with the gate ON and ?netem=rtt:120 an echo round trip takes ≥ 120 ms; with the gate OFF the same url is plain
    const upD = await fakeUp();
    for (const [gate, min] of [[true, 115], [false, 0]]) {
      const streamD = S.create({ auth: { requestAuthed: () => true }, resolveTarget: () => ({ kind: 'xpra', port: upD.port }), netemEnabled: gate, log: { warn() {}, log() {} } });
      const srvD = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
      srvD.on('upgrade', (req, socket, head) => streamD.handleUpgrade(req, socket, head, 'xpra-d'));
      const portD = await freePort(); await new Promise((r) => srvD.listen(portD, '127.0.0.1', r));
      const wsd = new WebSocket(`ws://127.0.0.1:${portD}/api/desktop/xpra-d/stream?netem=rtt:120`, ['binary']);
      await new Promise((r) => wsd.on('open', r));
      await sleep(150); // the upstream open
      const t0 = Date.now();
      const rt = await new Promise((resolve) => { wsd.once('message', () => resolve(Date.now() - t0)); wsd.send(rpkt('ping')); });
      ok(gate ? rt >= min && rt < 1000 : rt < 100, `netem gate ${gate ? 'ON' : 'OFF'}: an echo round trip through the bridge took ${rt} ms (${gate ? '≥ 120 ms — rtt/2 each way' : 'no delay: the parameter is IGNORED off the gate'})`);
      ok(streamD.stats().netem === (gate ? 1 : 0) && streamD.netemEnabled === gate, `stats.netem counts ${gate ? 'the one' : 'no'} shaped bridge`);
      ok(streamD.setNetem('any', 'rtt:50') === (gate ? null : null) || true, 'setNetem exists'); // shape asserted below
      ok((gate ? JSON.stringify(streamD.setNetem('z', 'rtt:50,kbps:2000')) === '{"rttMs":50,"kbps":2000}' : streamD.setNetem('z', 'rtt:50') === null) && (gate ? JSON.stringify(streamD.netemOf('z')) === '{"rttMs":50,"kbps":2000}' : streamD.netemOf('z') === null), `setNetem/netemOf ${gate ? 'remember a spec per id' : 'answer null off the gate'}`);
      wsd.close(); await new Promise((r) => srvD.close(r));
    }
    await upD.close();
    // THE POLICY PER PACKET on the xpra kind (2026-09-22, the verifier's 09-policy repro): a REFUSED viewer (Watch
    // mode / held) still gets its hello, ping echoes, damage acks and window packets through — only its INPUT packets
    // are cut out. Pre-fix the refused CHUNK was dropped whole: the hello never reached xpra and the pane timed out.
    {
      const upP = await fakeUp();
      let relay = false;
      const pInputs = [];
      const streamP = S.create({ auth: { requestAuthed: () => true }, resolveTarget: () => ({ kind: 'xpra', port: upP.port }), inputPolicy: () => (relay ? { relay: true } : { relay: false, code: 'watch-mode' }), onInput: (id) => pInputs.push(id), log: { warn: (l) => streamLog.push(String(l)), log: (l) => streamLog.push(String(l)) } });
      const srvP = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
      srvP.on('upgrade', (req, socket, head) => streamP.handleUpgrade(req, socket, head, 'xpra-p'));
      const portP = await freePort(); await new Promise((r) => srvP.listen(portP, '127.0.0.1', r));
      const wsp = new WebSocket(`ws://127.0.0.1:${portP}/api/desktop/xpra-p/stream?viewer=v-watch`, ['binary']);
      const backP = [];
      wsp.on('message', (m) => backP.push(Buffer.from(m)));
      await new Promise((r) => wsp.on('open', r));
      const talk = ['hello', 'ping_echo', 'damage-sequence', 'map-window', 'buffer-refresh']; // x5: configure-window is the ACTIVE viewer's (held, never relayed for a refused one)
      const human = ['key-action', 'button-action', 'clipboard-token', 'pointer-position', 'focus'];
      for (const t of ['hello', 'key-action', 'ping_echo', 'button-action', 'damage-sequence', 'clipboard-token', 'map-window', 'pointer-position', 'configure-window', 'focus', 'keyboard-config', 'buffer-refresh']) wsp.send(rpkt(t));
      await until(() => (upP.st.got.length >= talk.length ? true : null), 3000);
      await sleep(150);
      const typesUp = upP.st.got.map((g) => S.xpraPacketType(g.bytes.subarray(8)));
      ok(JSON.stringify(typesUp) === JSON.stringify(talk) && upP.st.got.every((g, i) => g.bytes.equals(rpkt(talk[i]))), `a REFUSED viewer's hello / ping_echo / damage-sequence / map-window / buffer-refresh reach xpra byte-identical, in order — and nothing else, its keyboard-config (the keymap fence) and configure-window (x5, the geometry fence) included (${typesUp.join(', ')})`);
      ok(backP.length === talk.length && backP[0].equals(Buffer.concat([Buffer.from('echo:'), rpkt('hello')])), `…so the upstream's answers (its hello first) reach the refused viewer: ${backP.length} message(s) back — the picture flows in Watch mode`);
      const stP = streamP.stats();
      ok(stP.dropped === human.length + 2 && stP.relayed === talk.length, `stats: dropped counts the ${human.length} input packets + the fenced keyboard-config + configure-window (${stP.dropped}), relayed the ${talk.length} messages that went through (${stP.relayed})`, stP);
      ok(pInputs.length === 0, 'a refused input is nobody at the keyboard: no input reported to the idle clock');
      // several packets in ONE message: the input is cut out of the middle, the rest relayed as one write
      const n0 = upP.st.got.length;
      wsp.send(Buffer.concat([rpkt('damage-sequence'), rpkt('key-action'), rpkt('ping_echo')]));
      await until(() => (upP.st.got.length > n0 ? true : null), 3000);
      ok(upP.st.got.length === n0 + 1 && upP.st.got[n0].bytes.equals(Buffer.concat([rpkt('damage-sequence'), rpkt('ping_echo')])), 'ONE message carrying damage-sequence + key-action + ping_echo ⇒ the key-action cut out, the other two relayed together');
      // the takeover flips the verdict: the same viewer's input now goes through and counts
      // round 2 of the verify: a refused viewer's CONTROL packets (not input) never reach xpra — the allowlist; a relayed
      // `shutdown-server` from a Watch viewer ended the real session. `control` / `info-request` are the same class.
      const n1 = upP.st.got.length;
      wsp.send(Buffer.concat([rpkt('shutdown-server'), rpkt('exit-server'), rpkt('control'), rpkt('info-request'), rpkt('ping_echo')]));
      await until(() => (upP.st.got.length > n1 ? true : null), 3000);
      await sleep(150);
      ok(upP.st.got.length === n1 + 1 && upP.st.got[n1].bytes.equals(rpkt('ping_echo')) && streamP.stats().lifecycle === 2, 'a REFUSED viewer\'s shutdown-server / exit-server / control / info-request are cut out, its ping_echo relayed alone (stats.lifecycle names the two)', streamP.stats());
      relay = true;
      const n2 = upP.st.got.length;
      wsp.send(rpkt('key-action'));
      await until(() => (upP.st.got.length > n2 ? true : null), 3000);
      ok(upP.st.got.length === n2 + 1 && upP.st.got[n2].bytes.equals(Buffer.concat([rpkt('keyboard-config'), rpkt('configure-window'), rpkt('key-action')])) && pInputs.length === 1 && streamLog.some((l) => /xpra-p: viewer v-watch may type now — the keymap and the window geometry it sent while refused reach xpra first/.test(l)), 'the policy relaying again (a takeover) ⇒ the keyboard-config and (x5) the configure-window it sent while refused reach xpra FIRST, then the next key-action, in one write; the key-action IS input (reported once), the replay is named');
      const n3 = upP.st.got.length;
      wsp.send(Buffer.concat([rpkt('shutdown-server'), rpkt('control')]));
      await until(() => (upP.st.got.length > n3 ? true : null), 3000);
      await sleep(150);
      ok(upP.st.got.length === n3 + 1 && upP.st.got[n3].bytes.equals(rpkt('control')) && streamP.stats().lifecycle === 3 && streamLog.some((l) => /xpra-p: 1 server-lifecycle packet\(s\).*viewer v-watch dropped — the keeper owns/.test(l)), 'an ALLOWED viewer\'s shutdown-server is cut too (the keeper owns the server\'s lifecycle, a warn line names it); its control packet passes', streamP.stats());
      wsp.close();
      await until(() => (streamLog.some((l) => /xpra-p: closed/.test(l)) ? true : null), 3000);
      ok(/xpra-p: closed .*, viewer v-watch, 13 packet\(s\) refused \(server lifecycle\)/.test(streamLog.find((l) => /xpra-p: closed/.test(l)) || ''), 'the close line counts every refused packet (6 input + 1 keymap + 1 geometry (x5) + 4 control + 1 lifecycle) and names the last verdict', streamLog.filter((l) => /xpra-p/.test(l)));
      await new Promise((r) => srvP.close(r)); await upP.close();
    }
    await upA.close(); await upB.close();
  }
  const st = stream.stats();
  ok(st.opened === 4 && st.refused === 3, `stats: 4 opened (2 rfb + 2 xpra), 3 refused (${JSON.stringify(st)})`);
  ok(st.relayed >= 3 + 3 && st.dropped === 0, `stats.relayed counts the relayed client messages on BOTH kinds — it was never incremented (${st.relayed})`);
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
const M = require(${JSON.stringify(path.join(repo, 'src/desktop-apps.js'))});
const XVFB_TABLE = M.DISPLAY_BACKENDS.map((b) => (b.id === 'vnc-display' ? { ...b, needs: [['Xvfb', 'x11vnc']], recipes: { 'Xvfb+x11vnc': 'x-then-server' } } : b));
const k = K.create({ dataDir: ${JSON.stringify(dataDir)}, env: () => (${JSON.stringify(baseEnv())}), broadcast: () => {}, serverSetting: (key) => (${JSON.stringify(PIN)})[key], backends: XVFB_TABLE, log: { log() {}, warn() {}, error() {} } });
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
  const k = mk('k4', { settings: { 'desktop.idleTimeoutMin': 0.02 }, tickMs: 150 }); // 1.2 s
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

console.log('§5 the resource REPORT (shared limits shrunk): an app a person uses is never stopped, parked or refused for a sample');
{
  const burner = { id: 'burner', label: 'CPU burner', exec: 'sh', args: ['-c', 'while :; do :; done'], category: 'test' };
  const limits = { ...M.LIMITS, GUARD_CPU_PCT: 50, GUARD_CPU_SUSTAIN_MS: 1500 };
  const telemetry = [], notices = [];
  const k = mk('k6', { limits, registryRows: [burner], guardSampleMs: 400, tickMs: 200, getTelemetry: () => ({ record: (e) => telemetry.push(e) }), serverNotice: (key, text, o) => notices.push({ key, text, o }) });
  await k.adoptAll(); k.start();
  const r = await k.launch({ appId: 'burner' });
  await until(() => k.get(r.id).state !== 'launching');
  ok(k.get(r.id).state === 'ready' && k.get(r.id).appId === 'burner', 'the burner launched from the registry');
  const rep1 = await reportedOver(k, r.id);
  await sleep(1500); // several more samples while over
  const now1 = k.get(r.id);
  ok(rep1 && /^\d+% CPU sustained for \d+ min \(limit 50%\)$/.test(rep1.live.over) && now1.state === 'ready' && alive(now1.pids.app) && alive(now1.pids.x) && !now1.stoppedBy && !now1.lastError, 'NO KILL: sustained CPU over the (shrunk) limit is REPORTED on the live row — the app and its display keep running, nothing on the record', { over: rep1 && rep1.live.over, state: now1.state, lastError: now1.lastError });
  const mine = notices.filter((n) => n.key.startsWith(`desktop-app-resource:${r.id}:`));
  ok(mine.length === 1 && /^CPU burner has been using \d+% CPU for \d+ min — Stop it from the Desktop panel if that is not what you expect$/.test(mine[0].text) && mine[0].o && mine[0].o.level === 'warn', 'ONE notice for the crossing (not one per sample), naming the app and the user\'s own lever', mine);
  ok(telemetry.some((e) => e.name === 'desktop-app-resource') && !telemetry.some((e) => e.name === 'desktop-app-runaway'), 'telemetry desktop-app-resource (the fleet still sees a hot app)');
  const reg = (await k.list()).registry.find((x) => x.id === 'burner');
  ok(reg && reg.available && !reg.reason && !('parkedUntil' in reg), 'the registry row is NOT parked (no reason, no until)', reg);
  const second = await k.launch({ appId: 'burner' });
  ok(second && second.id !== r.id && second.state === 'launching', 'a second launch of the same row is served — a past sample never refuses a launch');
  const disk = JSON.parse(fs.readFileSync(k.storeFile, 'utf8'));
  ok(!('runawayParkedUntil' in disk), 'nothing parked on disk');
  const st = await k.stop(r.id); await k.stop(second.id);
  ok(st.state === 'exited' && st.stoppedBy === 'user' && !alive(st.pids.app), 'the user\'s OWN Stop (the lever the notice names) ends it, verified');
  k.shutdown();
  // the Chrome shape on a REAL session: the sampler hands a 6.2 GB PSS footprint (what a busy Chrome legitimately
  // reaches) — reported, never stopped; a keeper COPY that stops on `over` (the pre-ruling policy) is the control
  const bigMem = async (pids) => ({ cpuTicks: 0, memBytes: 6.2 * 2 ** 30, memMetric: 'pss', rssBytes: 40 * 2 ** 30, pids: (pids || []).length });
  const n2 = [];
  const k2 = mk('k6-mem', { guardSampleMs: 300, tickMs: 150, display: { ...NO_XVNC, sessionSample: bigMem }, serverNotice: (key, text) => n2.push({ key, text }) });
  await k2.adoptAll(); k2.start();
  const m = await k2.launch({ exec: appBin, args: appArgs, label: 'Google Chrome' });
  await until(() => k2.get(m.id).state !== 'launching');
  const rep2 = await reportedOver(k2, m.id, 8000);
  await sleep(1000);
  const cur2 = k2.get(m.id);
  const noKill = !!rep2 && cur2.state === 'ready' && alive(cur2.pids.app);
  ok(noKill && /^memory \(PSS\) 6\.2 GB \(limit 2\.0 GB\)$/.test(rep2.live.over) && cur2.live.memBytes === 6.2 * 2 ** 30 && cur2.live.memMetric === 'pss', 'NO KILL: a 6.2 GB (PSS) footprint is reported (memBytes + memMetric on the view), the app keeps running', cur2.live);
  ok(n2.filter((x) => x.key.startsWith(`desktop-app-resource:${m.id}:`)).length === 1 && n2[0].text === 'Google Chrome is using 6.2 GB (PSS) — Stop it from the Desktop panel if that is not what you expect', 'the notice: "Google Chrome is using 6.2 GB (PSS) — Stop it from the Desktop panel if that is not what you expect"', n2);
  await k2.stop(m.id); k2.shutdown();
  // r2 (the oscillation review, reproduced on this REAL keeper before the fix: a sampler alternating 6.2 GB / 0.9 GB
  // PSS filed notices :1…:5 in ten samples): the report level's hysteresis + floor hold on the real tick — ONE notice
  let flip = 0;
  const osc = async (pids) => ({ cpuTicks: 0, memBytes: (flip++ % 2 ? 0.9 : 6.2) * 2 ** 30, memMetric: 'pss', rssBytes: 1, pids: (pids || []).length });
  const n3 = [];
  const k3 = mk('k6-osc', { guardSampleMs: 250, tickMs: 120, display: { ...NO_XVNC, sessionSample: osc }, serverNotice: (key) => n3.push(key) });
  await k3.adoptAll(); k3.start();
  const o3 = await k3.launch({ exec: appBin, args: appArgs, label: 'Google Chrome' });
  await until(() => k3.get(o3.id).state !== 'launching');
  await until(() => (flip >= 10 ? true : null), 10000);
  ok(flip >= 10 && k3.get(o3.id).state === 'ready' && JSON.stringify(n3) === JSON.stringify([`desktop-app-resource:${o3.id}:1`]), `OSCILLATION on the real keeper: ${flip} samples alternating over / under ⇒ exactly ONE notice (the pre-r2 level filed one per crossing)`, n3);
  await k3.stop(o3.id); k3.shutdown();
  // …and a crossing nobody received (serverNotice → 0: a restart with no browser connected) is re-sent under the SAME
  // key on the next sample still over, until somebody gets it — then nothing more
  const n4 = []; let reach = 0;
  const k4 = mk('k6-deliver', { guardSampleMs: 250, tickMs: 120, display: { ...NO_XVNC, sessionSample: bigMem }, serverNotice: (key) => { n4.push(key); return n4.length >= 3 ? 1 : reach; } });
  await k4.adoptAll(); k4.start();
  const o4 = await k4.launch({ exec: appBin, args: appArgs, label: 'Google Chrome' });
  await until(() => k4.get(o4.id).state !== 'launching');
  await until(() => (n4.length >= 3 ? true : null), 8000);
  await sleep(1200); // several more over samples after the delivered one
  const k4key = `desktop-app-resource:${o4.id}:1`;
  ok(JSON.stringify(n4) === JSON.stringify([k4key, k4key, k4key]), 'DELIVERY on the real keeper: two undelivered attempts re-sent under the SAME key, the third delivered, then silence', n4);
  await k4.stop(o4.id); k4.shutdown();
  const { mod: Kstop } = mutant('stops-on-over', [["        if (lvl.fire) {", "        if (lvl.fire) { stop(rec.id, { why: 'runaway' }).catch(() => { });"]]);
  const dataDirC = path.join(root, 'k6-ctl'); fs.mkdirSync(dataDirC, { recursive: true });
  const kc = Kstop.create({ ...PINNED, dataDir: dataDirC, env: baseEnv, broadcast: () => {}, guardSampleMs: 300, tickMs: 150, display: { ...NO_XVNC, sessionSample: bigMem }, log: { log() {}, warn() {}, error() {} } }); keepers.push(kc);
  await kc.adoptAll(); kc.start();
  const mc = await kc.launch({ exec: appBin, args: appArgs, label: 'Google Chrome' });
  await until(() => kc.get(mc.id).state !== 'launching');
  await until(() => (kc.get(mc.id).state !== 'ready' ? true : null), 8000);
  const curC = kc.get(mc.id);
  ok(!(curC.state === 'ready' && alive(curC.pids.app)), 'CONTROL: the stop-on-over copy ENDS the same session — the NO KILL assertion is red against it (it judges the branch, not a quiet sampler)', { state: curC.state });
  await kc.stop(mc.id).catch(() => { }); kc.shutdown();
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
  const k = mk('k7', { env: envWithShim, backends: M.DISPLAY_BACKENDS }); // the shipped table: Xvnc is a group of the vnc-display rung there
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
  const k2 = mk('k7', { env: envWithShim, backends: M.DISPLAY_BACKENDS });
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
  const k1 = K1.create({ ...PINNED, dataDir, env: baseEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } }); keepers.push(k1);
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
  const k3 = K1.create({ ...PINNED, dataDir, env: baseEnv, broadcast: () => {}, display: { ...D, freePort: async () => impostor2.address().port }, log: { log() {}, warn() {}, error() {} } }); keepers.push(k3);
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
  const a0 = D.procSample(r.pids.app), s0 = await D.sessionSample(pids); await sleep(1000);
  const a1 = D.procSample(r.pids.app), s1 = await D.sessionSample(pids);
  ok(a0 && a1 && s0 && s1 && a1.cpuTicks - a0.cpuTicks < 20 && s1.cpuTicks - s0.cpuTicks >= 50, `CONTROL: over one second the recorded pid burned ${a1 && a0 ? a1.cpuTicks - a0.cpuTicks : '?'} ticks (the round-1 sample — blind) while its session (${pids.length} pids) burned ${s1 && s0 ? s1.cpuTicks - s0.cpuTicks : '?'}`);
  const liveNow = await until(() => { const l = k.get(rec.id).live; return l && l.cpuPct > 50 ? l : null; }, 5000);
  ok(liveNow && liveNow.pids >= 2 && liveNow.cpuPct > 50 && liveNow.memMetric === 'pss' && liveNow.memBytes > 0, `the broadcast live sample counts the session's pids, their CPU and their footprint (${liveNow && liveNow.pids} pids, ${liveNow && Math.round(liveNow.cpuPct)} %, ${liveNow && Math.round(liveNow.memBytes / 2 ** 20)} MB PSS)`, liveNow);
  const tripped = await reportedOver(k, rec.id);
  ok(tripped && /^\d+% CPU sustained/.test(tripped.live.over) && k.get(rec.id).state === 'ready', 'a burner in a CHILD is REPORTED (the whole session is sampled) — and left running', tripped && tripped.live);
  await k.stop(rec.id); await sleep(300); ident.resetProcTables();
  ok(k.sessionPids(k.get(rec.id)).length === 0, 'and the user\'s stop empties every session (the `yes` child too)');
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
  const k1 = K1.create({ ...PINNED, dataDir: dataDir2, env: baseEnv, broadcast: () => {}, singleton: () => ({ ...facts2, refresh: async () => { facts2.running = true; return { available: true, running: true, port: rfb.address().port }; } }), log: { log() {}, warn() {}, error() {} } }); keepers.push(k1);
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
  const display = { ...D, RECIPES: Object.freeze({ ...D.RECIPES, 'x-then-server-copy': D.RECIPES['x-then-server'] }) };
  const k = mk('r2f', { display, backends: [fourth, ...M.DISPLAY_BACKENDS], settings: { 'desktop.backendPrefs': '' } }); await k.adoptAll(); k.start(); // table order: a preference names only rungs it knows, and this one is new
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
  // (the patched copies' placement: no longer a gitignored path in src/ — §tree measures they never touch the tree)
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
  const k2 = K2.create({ ...PINNED, dataDir, env: baseEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } }); keepers.push(k2);
  await k2.adoptAll(); k2.start();
  const c = await k2.launch({ exec: '/bin/sleep', args: ['3600'], label: 'stop-in-flight-ctl' });
  const sc = await k2.stop(c.id);
  await sleep(5000);
  const leftover = markerPids(c.id);
  const lc = k2.get(c.id);
  ok(sc.state === 'exited' && Object.values(sc.pids).every((p) => !p) && lc.state === 'exited' && leftover.length >= 2, `CONTROL: the pre-fix keeper answers exited with NO pids, then ${leftover.length} process(es) carry the marker under that exited record 5 s later (the orphans)`, { sc: sc.pids, later: lc.pids, leftover });
  // the pre-fix leftovers are exactly what the BOOT BELT reaps: a fresh keeper on the same store finds them by marker
  const warned = [];
  const k3b = K.create({ ...PINNED, dataDir, env: baseEnv, broadcast: () => {}, log: { log() {}, warn: (m) => warned.push(m), error() {} } }); keepers.push(k3b);
  await k3b.adoptAll();
  await sleep(300);
  ok(markerPids(c.id).length === 0 && leftover.every((p) => !alive(p)), `the next BOOT's marker census reaped the ${leftover.length} leftover(s) of the exited record (${leftover.join(', ')})`);
  ok(warned.some((m) => new RegExp(`${c.id} \\(exited\\) still has ${leftover.length} process\\(es\\) carrying its marker or its per-app XAUTHORITY at boot`).test(m)), 'and said so, naming the record, its state and the pids', warned);
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
  const k = K.create({ ...PINNED, dataDir, env: baseEnv, broadcast: () => {}, singleton: () => ({ running: true, display: ':7', port: rfb.address().port, authFile: null, refresh: async () => ({ available: true, running: true, port: rfb.address().port }) }), log: { log() {}, warn() {}, error() {} } }); keepers.push(k);
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
  const k = K.create({ ...PINNED, dataDir, env: baseEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } }); keepers.push(k);
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
  const k2 = K.create({ ...PINNED, dataDir: dataDir2, env: baseEnv, broadcast: () => {}, display: { ...D, sameProcess: preFixSame }, log: { log() {}, warn() {}, error() {} } }); keepers.push(k2);
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
  const tripped = await reportedOver(k, rec.id);
  ok(tripped && /^\d+% CPU sustained/.test(tripped.live.over), `a burner whose work runs in short-lived children (yes | head, ~30 MB each) is REPORTED over in ${Date.now() - t0} ms (the verifier measured 20 s of 'ready' at 0 %)`, tripped && tripped.live);
  await k.stop(rec.id); await sleep(300); ident.resetProcTables();
  ok(k.sessionPids(k.get(rec.id)).length === 0, 'and the user\'s stop empties the session');
  k.shutdown();
  // NEGATIVE CONTROL: the round-2 sample (the LIVE pids' own ticks only) on the same shape stays `ready`
  const liveOnly = (pids) => { let cpuTicks = 0, rssBytes = 0, n = 0; for (const pid of pids || []) { const s = D.procSample(pid); if (!s) continue; cpuTicks += s.cpuTicks; rssBytes += s.rssBytes; n++; } return n ? { cpuTicks, rssBytes, pids: n } : null; };
  const k2 = mk('r3d-ctl', { limits, registryRows: [churn], guardSampleMs: 400, tickMs: 200, display: { ...NO_XVNC, sessionSample: liveOnly } }); await k2.adoptAll(); k2.start();
  const rec2 = await k2.launch({ appId: 'churn' });
  await until(() => k2.get(rec2.id).state !== 'launching');
  const trippedCtl = await reportedOver(k2, rec2.id, 6000);
  const liveCtl = k2.get(rec2.id).live;
  ok(!trippedCtl && k2.get(rec2.id).state === 'ready', `CONTROL: sampling live pids only, the same burner is never reported over in 6 s (live.cpuPct ${liveCtl && Math.round(liveCtl.cpuPct)} %)`);
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
  k = Kmod.create({ ...PINNED, dataDir, env: baseEnv, broadcast: () => {}, display, log: { log() {}, warn: (m) => warned.push(m), error() {} } }); keepers.push(k);
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
  const kb = Kb.create({ ...PINNED, dataDir, env: baseEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } }); keepers.push(kb);
  await kb.adoptAll(); kb.start();
  const c = await kb.launch({ exec: 'sh', args: ['-c', daemonise], label: 'daemonising app ctl' });
  await until(() => (kb.get(c.id).state === 'ready' ? true : null), 20000);
  const sc = await kb.stop(c.id);
  await sleep(1500);
  const leftover = markerPids(c.id);
  ok(sc.state === 'exited' && sc.lastError == null && leftover.length === 1 && alive(leftover[0]), `CONTROL: with the marker belt removed the same stop answers exited/lastError null and the setsid'd worker (${leftover.join(', ')}) still carries the marker 1.5 s later`, { state: sc.state, leftover });
  kb.shutdown();
  const k3 = K.create({ ...PINNED, dataDir, env: baseEnv, broadcast: () => {}, log: { log() {}, warn() {}, error() {} } }); keepers.push(k3);
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
  const tripped = await reportedOver(k, rec.id);
  ok(tripped && /^\d+% CPU sustained/.test(tripped.live.over) && k.get(rec.id).state === 'ready', `a burner in a setsid'd child is REPORTED over in ${Date.now() - t0} ms (the verifier measured 0 % for 20 s while ready) — and left running`, tripped && tripped.live);
  await k.stop(rec.id); await sleep(500); ident.resetProcTables();
  ok(markerPids(rec.id).length === 0, 'and the user\'s stop empties the session, escaped burner included');
  k.shutdown();
  // NEGATIVE CONTROL: the guard over the sid table alone stays `ready` at 0 %
  const { mod: Kg } = mutant('r4c-sid-only', NO_GUARD_UNION);
  const dataDir = path.join(root, 'r4c-ctl'); fs.mkdirSync(dataDir, { recursive: true });
  const k2 = Kg.create({ ...PINNED, dataDir, env: baseEnv, broadcast: () => {}, limits, registryRows: [esc], guardSampleMs: 400, tickMs: 200, log: { log() {}, warn() {}, error() {} } }); keepers.push(k2);
  await k2.adoptAll(); k2.start();
  const rec2 = await k2.launch({ appId: 'esc' });
  await until(() => (k2.get(rec2.id).state !== 'launching' ? true : null), 20000);
  const trippedCtl = await reportedOver(k2, rec2.id, 6000);
  const liveCtl = k2.get(rec2.id).live;
  ok(!trippedCtl && k2.get(rec2.id).state === 'ready' && liveCtl && liveCtl.cpuPct < 25, `CONTROL: sampling the sid table alone, the same burner is never reported over in 6 s at cpuPct ${liveCtl && Math.round(liveCtl.cpuPct)} % over ${liveCtl && liveCtl.pids} pids`);
  await k2.stop(rec2.id); k2.shutdown();
  await sleep(300);
  ok(markerPids(rec2.id).length === 0, 'CONTROL cleanup: the fixed stop of the mutant keeper (its belt intact) reaped the escaped burner');
}

console.log('§12 THE XPRA RUNG (P8-2): the default ladder picks it, one xpra per session, the real bridge relays to it, stop/adopt/no-migration');
{
  const XAUTH = D.binOnPath('xauth', { env: process.env });
  if (!XPRA_BIN) skip('xpra is not on PATH — the xpra rung cannot be driven on this box (apt install xpra; the fleet image adds the package)');
  else if (!XAUTH) skip('xauth is not on PATH — the xpra recipe refuses by name without it');
  else {
    // (a) the DEFAULT order (no pin): xpra wins; the record's facts
    const k = mk('k12', { settings: { 'desktop.backendPrefs': '' } });
    await k.adoptAll(); k.start();
    const l0 = await k.list();
    ok(l0.availability.backend === 'xpra' && l0.availability.via === 'xpra' && l0.availability.recipe === 'xpra-seamless' && l0.availability.stream === 'xpra' && l0.availability.fallbackWhy === null && Array.isArray(l0.availability.prefs) && l0.availability.prefs.length === 0, 'list(): with no preference the ladder picks xpra (DA1), stream xpra, nothing fell, prefs empty', l0.availability);
    const t0 = Date.now();
    const rec = await k.launch({ exec: appBin, args: appArgs, label: 'seamless' });
    ok(rec.state === 'launching' && rec.backend === 'xpra' && rec.via === 'xpra' && rec.recipe === 'xpra-seamless' && rec.stream === 'xpra' && rec.fallbackWhy === null, 'launch answers a launching record on xpra via xpra-seamless, stream xpra', rec);
    await until(() => (k.get(rec.id).state !== 'launching' ? true : null), 30000);
    const r1 = k.get(rec.id);
    const readyMs = Date.now() - t0;
    ok(r1.state === 'ready' && r1.probe === 'http' && /^:\d+$/.test(r1.display) && r1.port > 0, `ready in ${readyMs} ms on ${r1.display} port ${r1.port} (probe http) — lastError ${r1.lastError}`, r1);
    ok(r1.pids.x > 0 && r1.pids.server === r1.pids.x && r1.starts.server === r1.starts.x && r1.pids.app > 0 && r1.pids.app !== r1.pids.x && r1.pids.wm === null, 'ONE xpra pid is recorded as x AND server (one process owns the Xvfb and the picture socket), the app is its own pid, no WM of ours (xpra is the WM)', r1.pids);
    ok(D.listenerHeldBy(r1.port, D.sessionCensus([r1.pids.x], { fresh: true })) === r1.pids.x, 'the 127.0.0.1 listener is held by the xpra pid itself (rule 3 on this rung)');
    const members = D.sessionMembers(r1.pids.x, { fresh: true });
    ok(members.length >= 2 && members.includes(r1.pids.x), `xpra's session holds its Xvfb too (${members.length} members) — the sid identity that survives xpra's environ rewrite`);
    ok(!D.environHas(r1.pids.x, `${K.SESSION_ENV}=${rec.id}`) && D.environHas(r1.pids.app, `${K.SESSION_ENV}=${rec.id}`), 'MEASURED FACT the belt rests on: xpra rewrites its own environ (the marker is invisible on the xpra pid) while the app we spawned still carries it');
    ok(fs.existsSync(path.join(k.logRoot, rec.id, 'Xauthority')) && fs.statSync(path.join(k.logRoot, rec.id, 'Xauthority')).size > 0 && fs.existsSync(path.join(k.logRoot, rec.id, 'xpra')), 'the per-app dir holds the Xauthority xpra wrote into (pinned, never ~/.Xauthority) and xpra\'s own socket/session dir');
    ok(k.streamTarget(rec.id) && k.streamTarget(rec.id).kind === 'xpra' && k.streamTarget(rec.id).port === r1.port, 'streamTarget: kind xpra on the recorded port');
    // (b) per-window facts: the app's window, no xpra wrapper rows
    const w = await until(async () => { const r = await k.windows(rec.id); return r.ok && r.windows.length ? r : null; }, 10000, 300);
    ok(w && w.windows.length === 1 && w.windows.every((x) => !/^Xpra/.test(x.title || '')) && (w.windows[0].cls || w.windows[0].instance), `windows(): exactly the app's own window (${w && JSON.stringify(w.windows.map((x) => [x.title, x.cls, x.w, x.h]))}) — xpra's Corral wrappers and 1x1 leaders filtered`, w);
    ok(await k.windows('no-such').then(() => false, (e) => e.code === 'not-found'), 'windows() of an unknown id is a named not-found');
    // (c) the REAL bridge to the REAL xpra: bytes both ways — a bencode hello is answered by xpra's own `disconnect` naming the reason
    const stream = S.create({ auth: { requestAuthed: () => true }, resolveTarget: (id) => k.streamTarget(id), onInput: (id) => k.noteInput(id), log: { warn() {}, log: (l) => xlog.push(String(l)) } });
    const xlog = [];
    const srv = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
    srv.on('upgrade', (req, socket, head) => { const id = S.upgradeId(req.url.split('?')[0]); if (!id) { socket.destroy(); return; } stream.handleUpgrade(req, socket, head, id); });
    const port = await freePort(); await new Promise((r) => srv.listen(port, '127.0.0.1', r));
    const WebSocket = require('ws');
    const wsx = new WebSocket(`ws://127.0.0.1:${port}/api/desktop/${rec.id}/stream`, ['binary']);
    const back = [];
    wsx.on('message', (m) => back.push(Buffer.from(m)));
    await new Promise((r) => wsx.on('open', r));
    const hello = Buffer.from('l5:hellod0:0:ee'); const hh = Buffer.alloc(8); hh[0] = 0x50; hh.writeUInt32BE(hello.length, 4);
    wsx.send(Buffer.concat([hh, hello]));
    await until(() => (back.length ? true : null), 5000);
    // MEASURED on 6.5.3: a client whose hello xpra cannot decode is answered with a BARE TEXT line
    // `disconnect <reason>` (no header) — "invalid packet encoding: 'bencode' decoder is not available." — and closed;
    // a decodable hello without encoder capabilities gets "disconnect protocol error failed to negotiate a packet encoder."
    const first = back[0] ? back[0].toString('latin1') : '';
    const bare = /^disconnect /.test(first);
    const packet = back[0] && back[0][0] === 0x50 && S.xpraStrings(back[0].subarray(8))[0] === 'disconnect';
    ok(back.length >= 1 && (bare || packet), `the real xpra answered through the bridge: ${back.length} message(s), the first a disconnect (${bare ? 'bare text' : packet ? 'packet' : 'neither'}: ${JSON.stringify(first.replace(/[^\x20-\x7e]/g, '.').slice(0, 90))})`, back.map((b) => b.length));
    await until(() => (xlog.some((l) => new RegExp(`${rec.id}: closed`).test(l)) ? true : null), 5000);
    const cl = xlog.find((l) => new RegExp(`${rec.id}: closed`).test(l)) || '';
    ok(/closed \(the xpra server disconnected: (invalid packet encoding|protocol error)/.test(cl), 'the close line names xpra\'s own reason (the bare-text shape read by the bridge)', cl);
    try { wsx.close(); } catch {}
    await new Promise((r) => srv.close(r));
    // the SAME hello from a viewer the window-live policy REFUSES (Watch mode on an agent-held window) still reaches the
    // real xpra and is answered — pre-fix the refused chunk was dropped whole and the pane waited 15 s for a hello
    const streamW = S.create({ auth: { requestAuthed: () => true }, resolveTarget: (id) => k.streamTarget(id), inputPolicy: () => ({ relay: false, code: 'watch-mode' }), log: { warn() {}, log() {} } });
    const srvW = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
    srvW.on('upgrade', (req, socket, head) => { const id = S.upgradeId(req.url.split('?')[0]); if (!id) { socket.destroy(); return; } streamW.handleUpgrade(req, socket, head, id); });
    const portW = await freePort(); await new Promise((r) => srvW.listen(portW, '127.0.0.1', r));
    const wsw = new WebSocket(`ws://127.0.0.1:${portW}/api/desktop/${rec.id}/stream?viewer=v-watch`, ['binary']);
    const backW = [];
    wsw.on('message', (m) => backW.push(Buffer.from(m)));
    await new Promise((r) => wsw.on('open', r));
    wsw.send(Buffer.concat([hh, hello]));
    await until(() => (backW.length ? true : null), 5000);
    ok(backW.length >= 1 && /^disconnect /.test(backW[0].toString('latin1')) && streamW.stats().dropped === 0 && streamW.stats().relayed === 1, `a REFUSED (watch-mode) viewer's hello reaches the REAL xpra and is answered (${backW.length} message(s) back; dropped ${streamW.stats().dropped})`, streamW.stats());
    try { wsw.close(); } catch {}
    await new Promise((r) => srvW.close(r));
    // (d) ADOPTION keeps the backend a record was BORN with: a vnc-display record (pinned keeper) + the xpra record survive a rebuild under the DEFAULT order
    const kv = mk('k12-vnc');
    await kv.adoptAll(); kv.start();
    const vrec = await kv.launch({ exec: appBin, args: appArgs, label: 'born-vnc' });
    await until(() => (kv.get(vrec.id).state !== 'launching' ? true : null), 20000);
    ok(kv.get(vrec.id).state === 'ready' && kv.get(vrec.id).backend === 'vnc-display', 'a pinned keeper brings a vnc-display session up beside the xpra one');
    kv.shutdown(); k.shutdown();
    const kv2 = mk('k12-vnc', { settings: { 'desktop.backendPrefs': '' } }); // SAME dataDir, default order
    await kv2.adoptAll();
    const va = kv2.get(vrec.id);
    ok(va.state === 'ready' && va.adoptedAt > 0 && va.backend === 'vnc-display' && va.via === 'Xvfb+x11vnc' && va.stream === 'rfb', 'DA1: the vnc-display record is ADOPTED as vnc-display under a ladder that would now pick xpra — never migrated', { state: va.state, backend: va.backend });
    const k2 = mk('k12', { settings: { 'desktop.backendPrefs': '' } }); // SAME dataDir as k
    await k2.adoptAll();
    const xa = k2.get(rec.id);
    ok(xa.state === 'ready' && xa.adoptedAt > 0 && xa.backend === 'xpra' && xa.pids.x === r1.pids.x && xa.starts.x === r1.starts.x && xa.port === r1.port, 'the xpra record is ADOPTED after a rebuild: same pid + starttime, its HTTP port answering (the probe kind is the record\'s own)', { state: xa.state, lastError: xa.lastError });
    // (e) stop: app → xpra (+ its Xvfb), verified; nothing carries the marker, the xpra pid is gone
    const stopped = await k2.stop(rec.id, { why: 'user' });
    ok(stopped.state === 'exited' && stopped.stoppedBy === 'user' && stopped.lastError === null, `stop ⇒ exited, clean (${stopped.lastError})`);
    await sleep(300);
    ok(!D.pidAlive(r1.pids.x) && !D.pidAlive(r1.pids.app) && members.every((p) => !D.pidAlive(p)) && markerPids(rec.id).length === 0, 'the xpra pid, its Xvfb and the app are gone; nothing carries the marker');
    await kv2.stop(vrec.id); kv2.shutdown(); k2.shutdown();
    // (f) THE BOOT BELT BY IDENTITY: a TERMINAL record whose recorded x pid+starttime is still alive is reaped by that identity (xpra's environ carries no marker)
    const kb = mk('k12-belt', { settings: { 'desktop.backendPrefs': '' } });
    const stray = spawn('sleep', ['3600'], { detached: true, stdio: 'ignore' }); stray.unref(); children.push(stray);
    await sleep(150);
    const trec = { ...M.newRecord({ id: 'da-belt-x', label: 'belt', exec: 'sleep', args: [], cwd: null, source: 'adhoc', backend: 'xpra', via: 'xpra', fallbackWhy: null, idleTimeoutMs: 0, now: Date.now() }), state: 'exited', endedAt: Date.now(), probe: 'http' };
    trec.pids.x = stray.pid; trec.pids.server = stray.pid; trec.starts.x = D.procStart(stray.pid); trec.starts.server = trec.starts.x;
    kb._store().apps['da-belt-x'] = trec;
    const stray2 = spawn('sleep', ['3600'], { detached: true, stdio: 'ignore' }); stray2.unref(); children.push(stray2);
    await sleep(150);
    const trec2 = { ...M.newRecord({ id: 'da-belt-y', label: 'belt-recycled', exec: 'sleep', args: [], cwd: null, source: 'adhoc', backend: 'xpra', via: 'xpra', fallbackWhy: null, idleTimeoutMs: 0, now: Date.now() }), state: 'exited', endedAt: Date.now(), probe: 'http' };
    trec2.pids.x = stray2.pid; trec2.pids.server = stray2.pid; trec2.starts.x = D.procStart(stray2.pid) - 12345; trec2.starts.server = trec2.starts.x; // a WRONG starttime = a recycled pid
    kb._store().apps['da-belt-y'] = trec2;
    await kb.adoptAll();
    await sleep(200);
    ok(!D.pidAlive(stray.pid), 'a terminal record\'s recorded x (pid AND starttime match) is reaped at boot by IDENTITY — the marker was never needed');
    ok(D.pidAlive(stray2.pid), 'CONTROL: the same shape with a WRONG starttime (a recycled pid) is never signalled');
    try { process.kill(stray2.pid, 'SIGKILL'); } catch {}
    kb.shutdown();
    // (g) A CRASHED xpra LEAKS NOTHING (2026-09-22, the verifier's xvfb-leak repro): xpra's own Xvfb inherits a
    // SANITISED env — no session marker — so a DEAD xpra's Xvfb (sid = that dead pid) was proven by nothing and
    // outlived the teardown AND every later boot (~100-190 MB each). It carries the per-app XAUTHORITY, whose path
    // holds the record id: that is its proof now (needlesOf), in the teardown, the leftover census and the boot belt.
    const xvfbOf = (xpraPid) => fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number).filter((p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, 'latin1').startsWith(`Xvfb-for-Xpra-S${xpraPid}\0`); } catch { return false; } });
    const launchReady = async (kk, label) => { const r0 = await kk.launch({ exec: appBin, args: appArgs, label }); await until(() => (kk.get(r0.id).state !== 'launching' ? true : null), 30000); return kk.get(r0.id); };
    const kg = mk('k12-crash', { settings: { 'desktop.backendPrefs': '' } });
    await kg.adoptAll(); kg.start();
    const g1 = await launchReady(kg, 'crash-live');
    const xv1 = xvfbOf(g1.pids.x);
    const authG1 = `XAUTHORITY=${path.join(kg.logRoot, g1.id, 'Xauthority')}`;
    ok(g1.state === 'ready' && g1.backend === 'xpra' && xv1.length === 1 && !D.environHas(xv1[0], `${K.SESSION_ENV}=${g1.id}`) && D.environHas(xv1[0], authG1) && D.sessionMembers(g1.pids.x, { fresh: true }).includes(xv1[0]), `MEASURED: xpra's Xvfb (pid ${xv1[0]}, in xpra's session) carries NO session marker, and DOES carry the per-app XAUTHORITY`);
    process.kill(g1.pids.x, 'SIGKILL');
    await until(() => (kg.get(g1.id).state === 'failed' ? true : null), 15000);
    await until(() => (xv1.every((p) => !D.pidAlive(p)) ? true : null), 8000);
    ok(kg.get(g1.id).state === 'failed' && /X display :\d+ exited/.test(kg.get(g1.id).lastError || '') && xv1.every((p) => !D.pidAlive(p)) && !D.pidAlive(g1.pids.app), `SIGKILL of a ready session's xpra ⇒ failed (${kg.get(g1.id).lastError}), the app reaped AND Xvfb-for-Xpra-S${g1.pids.x} reaped by the teardown`);
    kg.shutdown();
    // the keeper PROCESS DOWN when xpra dies (§3's shape: a child keeper SIGKILLed — the suite's own keepers still hold
    // live child handles, so they would see the exit): the next boot's adoption reaps the Xvfb
    const downDir = path.join(root, 'k12-crash-down'); fs.mkdirSync(downDir, { recursive: true });
    const downChild = path.join(root, 'k12-crash-down-child.mjs');
    fs.writeFileSync(downChild, `
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const K = require(${JSON.stringify(path.join(repo, 'src/server/desktop-app-keeper.js'))});
const k = K.create({ dataDir: ${JSON.stringify(downDir)}, env: () => (${JSON.stringify(baseEnv())}), broadcast: () => {}, serverSetting: () => '', log: { log() {}, warn() {}, error() {} } });
k.start();
const rec = await k.launch({ exec: ${JSON.stringify(appBin)}, args: ${JSON.stringify(appArgs)}, label: 'crash-down' });
for (let i = 0; i < 300; i++) { const r = k.get(rec.id); if (r.state !== 'launching') { console.log(JSON.stringify(r)); break; } await new Promise((r) => setTimeout(r, 100)); }
setInterval(() => {}, 1000);
`);
    const downProc = spawn(process.execPath, [downChild], { stdio: ['ignore', 'pipe', 'inherit'] });
    children.push(downProc);
    let downOut = '';
    const g2 = await new Promise((resolve) => { downProc.stdout.on('data', (b) => { downOut += b; const line = downOut.split('\n').find((l) => l.startsWith('{')); if (line) resolve(JSON.parse(line)); }); setTimeout(() => resolve(null), 30000); });
    const xv2 = g2 && g2.pids.x ? xvfbOf(g2.pids.x) : [];
    downProc.kill('SIGKILL');
    await sleep(300);
    if (g2 && g2.pids.x) process.kill(g2.pids.x, 'SIGKILL');
    await sleep(400);
    ok(g2 && g2.state === 'ready' && g2.backend === 'xpra' && !alive(downProc.pid) && xv2.length === 1 && D.pidAlive(xv2[0]) && !D.pidAlive(g2.pids.x), `keeper process SIGKILLed, then its xpra: the Xvfb outlives both (pid ${xv2[0]} alive — nothing has looked yet)`, g2 && g2.lastError);
    const kg2 = mk('k12-crash-down', { settings: { 'desktop.backendPrefs': '' } });
    await kg2.adoptAll();
    await until(() => (xv2.every((p) => !D.pidAlive(p)) ? true : null), 8000);
    ok(!M.isLiveState(kg2.get(g2.id).state) && xv2.every((p) => !D.pidAlive(p)) && !D.pidAlive(g2.pids.app), `after a reboot, adoptAll judges the record ${kg2.get(g2.id).state} and its Xvfb is reaped too (proven by its XAUTHORITY, its leader long dead)`);
    // the boot belt: a TERMINAL record's leftover proven ONLY by its XAUTHORITY (no marker, in no recorded session) is reaped; a foreign path is not
    const strayA = spawn('sleep', ['3600'], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH, XAUTHORITY: path.join(kg2.logRoot, g2.id, 'Xauthority') } }); strayA.unref(); children.push(strayA);
    const strayB = spawn('sleep', ['3600'], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH, XAUTHORITY: path.join(kg2.logRoot, 'da-not-ours', 'Xauthority') } }); strayB.unref(); children.push(strayB);
    await sleep(150);
    kg2.shutdown();
    const kg3 = mk('k12-crash-down', { settings: { 'desktop.backendPrefs': '' } });
    await kg3.adoptAll();
    await until(() => (!D.pidAlive(strayA.pid) ? true : null), 6000);
    ok(!D.pidAlive(strayA.pid), 'the boot belt reaps a terminal record\'s leftover that carries only its XAUTHORITY (the Xvfb shape: sanitised env, own session)');
    ok(D.pidAlive(strayB.pid), 'CONTROL: the same shape naming ANOTHER id\'s Xauthority path is never signalled');
    try { process.kill(strayB.pid, 'SIGKILL'); } catch {}
    kg3.shutdown();
    // CONTROL: the pre-fix keeper (the marker was the only evidence) leaks the Xvfb on the same crash
    const { mod: KX } = mutant('xvfb', [["  const needlesOf = (rec) => (rec.backend === 'desktop-singleton' ? [sessionMarker(rec.id)] : [sessionMarker(rec.id), `XAUTHORITY=${path.join(logRoot, rec.id, 'Xauthority')}`]);", "  const needlesOf = (rec) => [sessionMarker(rec.id)]; // pre-fix: the marker was the only evidence"]]);
    const cdir = path.join(root, 'k12-crash-ctl'); fs.mkdirSync(cdir, { recursive: true });
    const kc = KX.create({ dataDir: cdir, env: baseEnv, broadcast: () => {}, serverSetting: () => '', log: { log() {}, warn() {}, error() {} } }); keepers.push(kc);
    await kc.adoptAll(); kc.start();
    const gc = await launchReady(kc, 'crash-ctl');
    const xvc = xvfbOf(gc.pids.x);
    process.kill(gc.pids.x, 'SIGKILL');
    await until(() => (kc.get(gc.id).state === 'failed' ? true : null), 15000);
    await sleep(1500);
    ok(gc.backend === 'xpra' && xvc.length === 1 && D.pidAlive(xvc[0]), `CONTROL: the pre-fix keeper (marker-only evidence) leaves Xvfb-for-Xpra-S${gc.pids.x} alive after the same crash (${xvc.join(', ')})`);
    for (const p of xvc) { try { process.kill(p, 'SIGKILL'); } catch {} }
    kc.shutdown();
  }
}

console.log('§13 P8-2 x4 — THE PICTURE IS THE APP on the vnc-display rung: fitted after ready, FOLLOWING a real SetDesktopSize through the real bridge, the tick belt, the FIXED spelling, a refusal by name');
{
  const XVNC = D.binOnPath('Xvnc', { env: process.env });
  const XDO = D.binOnPath('xdotool', { env: process.env }), XDPY = D.binOnPath('xdpyinfo', { env: process.env });
  if (!XVNC) skip('Xvnc is not on PATH — the follow leg cannot be driven on this box (tigervnc-standalone-server; the fleet image has it)');
  else if (!XDO || !XDPY) skip(`xdotool (${!!XDO}) / xdpyinfo (${!!XDPY}) missing — the fit act cannot run`);
  else {
    const WebSocket = require('ws');
    /** a real RFB client through the bridge: handshake, then SetDesktopSize on demand (what noVNC does with resizeSession) */
    const rfbClient = (wsUrl) => new Promise((resolve) => {
      const ws = new WebSocket(wsUrl); let buf = Buffer.alloc(0), stage = 0;
      ws.on('message', (d) => { buf = Buffer.concat([buf, d]); for (;;) {
        if (stage === 0) { if (buf.length < 12) return; ws.send('RFB 003.008\n'); buf = buf.slice(12); stage = 1; }
        else if (stage === 1) { if (buf.length < 1) return; const n = buf[0]; if (buf.length < 1 + n) return; buf = buf.slice(1 + n); ws.send(Buffer.from([1])); stage = 2; }
        else if (stage === 2) { if (buf.length < 4) return; buf = buf.slice(4); ws.send(Buffer.from([1])); stage = 3; }
        else if (stage === 3) { if (buf.length < 24) return; const nl = buf.readUInt32BE(20); if (buf.length < 24 + nl) return; buf = buf.slice(24 + nl); stage = 4;
          const enc = [0, -308, -223]; const se = Buffer.alloc(4 + 4 * enc.length); se[0] = 2; se.writeUInt16BE(enc.length, 2); enc.forEach((e, i) => se.writeInt32BE(e, 4 + 4 * i)); ws.send(se);
          resolve({ ws, setSize: (w, h) => { const sd = Buffer.alloc(24); sd[0] = 251; sd.writeUInt16BE(w, 2); sd.writeUInt16BE(h, 4); sd[6] = 1; sd.writeUInt16BE(w, 16); sd.writeUInt16BE(h, 18); ws.send(sd); }, pointer: (x, y) => ws.send(Buffer.from([5, 0, x >> 8, x & 255, y >> 8, y & 255])), close: () => { try { ws.close(); } catch {} } }); }
        else return; } });
      ws.on('error', () => resolve(null));
    });
    const top = async (k, id, wid) => (await k.windows(id)).windows.find((w) => w.depth === 1 && (wid == null || w.id === wid)) || null;
    // (a) the REAL table pinned to vnc-display ⇒ via Xvnc, fitMode follows; the app is fitted the moment it has a window
    const klog = [];
    const k = mk('k13', { backends: M.DISPLAY_BACKENDS, tickMs: 1000, log: { log: (l) => klog.push(String(l)), warn: (l) => klog.push('WARN ' + l), error() {} } });
    await k.adoptAll(); k.start();
    const t0 = Date.now();
    const rec = await k.launch({ exec: appBin, args: appArgs, label: 'fit' });
    ok(rec.backend === 'vnc-display' && rec.via === 'Xvnc' && rec.fitMode === 'follows' && rec.fitBy === 'keeper' && rec.fb === null && rec.fit === null, 'the launching record: vnc-display via Xvnc, fitMode follows (by the keeper), no fb/fit fact yet', { via: rec.via, fitMode: rec.fitMode });
    const ready = await until(() => (k.get(rec.id).state === 'ready' ? k.get(rec.id) : null), 20000);
    ok(ready && ready.state === 'ready', `ready in ${Date.now() - t0} ms (${ready && ready.lastError})`);
    const fitted = await until(() => { const r = k.get(rec.id); return r.fit && r.fit.ok ? r : null; }, 15000, 100);
    const fitMs = Date.now() - t0;
    ok(!!fitted && fitted.fb && fitted.fb.w === 1280 && fitted.fb.h === 800 && fitted.fit.w === 1280 && fitted.fit.h === 800 && fitted.fit.why === 'ready', `fitted ${fitMs} ms after launch: fb 1280x800 measured, fit {wid, 1280x800, why:'ready'} recorded as facts`, fitted && { fb: fitted.fb, fit: fitted.fit });
    const w1 = fitted && await top(k, rec.id, fitted.fit.wid);
    ok(!!w1 && w1.w === 1280 && w1.h === 800 && w1.x === 0 && w1.y === 0, `the app's top-level IS the framebuffer: ${w1 && `${w1.w}x${w1.h}+${w1.x}+${w1.y}`} (windows(id) carries depth; the picture is the app, no black root)`);
    ok(!!fitted && !!w1 && typeof fitted.appTitle === 'string' && fitted.appTitle.length > 0 && fitted.appTitle === w1.title, `the record carries the fitted window's OWN title as a fact: appTitle ${JSON.stringify(fitted && fitted.appTitle)} = X's name for it (the window shows it instead of the label ${JSON.stringify(rec.label)})`, fitted && { appTitle: fitted.appTitle, x: w1 && w1.title });
    ok(klog.some((l) => /fitted fit's window 0x[0-9a-f]+ \d+x\d+\+\d+\+\d+ → 1280x800\+0\+0 \(ready, \d+ ms\)/.test(l)), 'the keeper logged the act once, with the before/after geometry and its cost');
    // (b) the follow: a real client's SetDesktopSize through the real bridge ⇒ the sieve reports ⇒ noteDesktopSize ⇒ the fb + the fit follow within 2 s
    const reports = [];
    const stream = S.create({ auth: { requestAuthed: () => true }, resolveTarget: (id) => k.streamTarget(id), onInput: (id) => k.noteInput(id), onDesktopSize: (id, w, h, viewer) => { reports.push([id, w, h, viewer]); k.noteDesktopSize(id, w, h); }, log: { warn() {}, log() {} } });
    const srv = http.createServer(); srv.on('upgrade', (req, sock, head) => stream.handleUpgrade(req, sock, head, stream.upgradeId(new URL(req.url, 'http://x').pathname)));
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const c = await rfbClient(`ws://127.0.0.1:${srv.address().port}/api/desktop/${rec.id}/stream?viewer=v13`);
    ok(!!c, 'a real RFB client handshook through the bridge to the keeper\'s Xvnc');
    const followed = [];
    for (const [W, H] of [[900, 600], [1024, 700]]) {
      const inputsBefore = k.get(rec.id).lastInputAt;
      const t1 = Date.now(); c.setSize(W, H);
      const r = await until(() => { const r = k.get(rec.id); return r.fb && r.fb.w === W && r.fb.h === H && r.fit && r.fit.ok && r.fit.w === W && r.fit.h === H ? r : null; }, 5000, 50);
      const ms = Date.now() - t1;
      const wv = r && await top(k, rec.id, r.fit.wid);
      followed.push({ W, H, ms, win: wv && `${wv.w}x${wv.h}+${wv.x}+${wv.y}` });
      ok(!!r && ms < 2000 && wv && wv.w === W && wv.h === H && wv.x === 0 && wv.y === 0, `SetDesktopSize ${W}x${H} ⇒ fb ${W}x${H} and the app's window ${wv && `${wv.w}x${wv.h}+${wv.x}+${wv.y}`} in ${ms} ms (< 2 s; the fit's why "${r && r.fit.why}")`);
      ok(k.get(rec.id).lastInputAt === inputsBefore, 'a SetDesktopSize moved the idle clock by NOTHING (it is not input)');
    }
    ok(reports.length === 2 && reports.every((x) => x[0] === rec.id && x[3] === 'v13') && reports[0][1] === 900 && reports[1][1] === 1024, `the bridge reported both asks with the viewer (${reports.map((x) => `${x[1]}x${x[2]}`).join(', ')})`);
    console.log(`    measured: ${followed.map((f) => `${f.W}x${f.H} in ${f.ms} ms → ${f.win}`).join('; ')}`);
    // (b2) r8 (2026-09-22, the twin of the xpra display-size fence, §16): a REFUSED viewer's SetDesktopSize never resizes the
    // holder's shared Xvnc display and is never reported; the x4 strip as a patched copy is the control (it resizes)
    {
      const sizeX = () => { const m = /dimensions:\s+(\d+)x(\d+) pixels/.exec(execFileSync(XDPY, [], { env: k.x11EnvFor(rec.id) }).toString()); return m ? `${m[1]}x${m[2]}` : null; };
      const watchBridge = async (Smod) => {
        const rep = [];
        const st = Smod.create({ auth: { requestAuthed: () => true }, resolveTarget: (id) => k.streamTarget(id), inputPolicy: () => ({ relay: false, code: 'watch-mode' }), onInput: () => {}, onDesktopSize: (id, w, h) => rep.push([w, h]), log: { warn() {}, log() {} } });
        const sv = http.createServer(); sv.on('upgrade', (req, sock, head) => st.handleUpgrade(req, sock, head, st.upgradeId(new URL(req.url, 'http://x').pathname)));
        await new Promise((r) => sv.listen(0, '127.0.0.1', r));
        const cl = await rfbClient(`ws://127.0.0.1:${sv.address().port}/api/desktop/${rec.id}/stream?viewer=v13w`);
        return { st, rep, cl, close: () => new Promise((r) => { try { cl && cl.close(); } catch {} sv.close(r); }) };
      };
      const before = sizeX();
      const wb = await watchBridge(S);
      wb.cl && wb.cl.setSize(640, 480);
      await sleep(1500);
      ok(!!wb.cl && sizeX() === before && wb.rep.length === 0 && wb.st.stats().dropped >= 1, `a Watch viewer's SetDesktopSize 640x480 never reaches Xvnc: the display stays ${sizeX()} (was ${before}), nothing reported to the keeper, counted refused (${wb.st.stats().dropped})`);
      await wb.close();
      const srcR = fs.readFileSync(path.join(repo, 'src/server/desktop-stream.js'), 'utf8');
      const fromR = 'if ((input || type === 251) && !allowInput) dropped++;';
      ok(srcR.split(fromR).length === 2, 'the rfb strip decision is spelled once (the control patches exactly it)');
      const rfile = MUTK.write('src/server/desktop-stream.js', srcR.replace(fromR, 'if (input && !allowInput) /* pre-fix (x4) */ dropped++;'), 'rfbsize13');
      const wc = await watchBridge(require(rfile));
      wc.cl && wc.cl.setSize(640, 480);
      const moved = await until(() => (sizeX() === '640x480' ? '640x480' : null), 5000, 100);
      ok(!!moved, `CONTROL: through the x4 strip the same Watch viewer resizes the holder's Xvnc display (${before} ⇒ ${sizeX()}) — the hole`);
      await wc.close();
      c.setSize(1024, 700); // the holder's size back for the legs below
      await until(() => { const r = k.get(rec.id); return sizeX() === '1024x700' && r.fb && r.fb.w === 1024 && r.fb.h === 700 && r.fit && r.fit.ok && r.fit.w === 1024 && r.fit.h === 700 ? true : null; }, 8000, 100);
      await sleep(1500); // settled again before (c) reads "two ticks re-recorded nothing"
    }
    // (c) the belt: somebody is ACTING in the window (input through the bridge — an app resizes itself because a key was
    // pressed, the calculator's mode switch) and the window is moved and shrunk ⇒ re-fitted within a tick or two, why
    // 'tick'; a settled plan is never touched (the fit's `at` stays)
    const wid = k.get(rec.id).fit.wid; const xenv = k.x11EnvFor(rec.id);
    const settledAt = k.get(rec.id).fit.at; await sleep(2500);
    ok(k.get(rec.id).fit.at === settledAt, 'two ticks over a SETTLED window re-recorded nothing (the belt only acts when the plan is not settled)');
    c.pointer(10, 10);
    await until(() => (k.get(rec.id).lastInputAt > settledAt ? true : null), 3000, 50);
    execFileSync(XDO, ['windowmove', '--sync', String(wid), '40', '40', 'windowsize', '--sync', String(wid), '300', '200'], { env: xenv });
    const t2 = Date.now();
    const belt = await until(async () => { const w = await top(k, rec.id, wid); return w && w.w === 1024 && w.h === 700 && w.x === 0 && w.y === 0 ? w : null; }, 6000, 100);
    ok(!!belt && k.get(rec.id).fit.why === 'tick', `with input through the bridge, the belt re-fitted a hand-moved 300x200+40+40 window to 1024x700+0+0 in ${Date.now() - t2} ms (why 'tick')`);
    // (d) the view carries fb/fit/fitMode as COPIES (a reader cannot mutate the store)
    const v = k.get(rec.id); v.fb.w = 1; v.fit.w = 1;
    ok(k.get(rec.id).fb.w === 1024 && k.get(rec.id).fit.w === 1024, 'the view copies fb/fit');
    c.close(); srv.close();
    await k.stop(rec.id); k.shutdown();
    ok(!(await k.fitApp(rec.id, 'after stop')).ok, 'fitApp on a stopped record is refused (not applicable)');
    // (c2) THE BELT'S COST (2026-09-22, the verifier's 10-spawns: xdpyinfo + xwininfo + xdotool for EVERY settled
    // session EVERY 5 s tick — 3.0 forks per session per tick, linear in sessions, ≈72 ms of blocked loop each at a
    // 1.5 GB RSS). Counted through logging wrappers first on the keeper's own PATH; the tick driven by hand.
    const XWI = D.binOnPath('xwininfo', { env: process.env });
    const wrapDir = path.join(root, 'k13-wrap'); fs.mkdirSync(wrapDir, { recursive: true });
    const spawnLog = path.join(root, 'k13-spawns.log');
    for (const [b, real] of [['xdpyinfo', XDPY], ['xwininfo', XWI], ['xdotool', XDO]]) fs.writeFileSync(path.join(wrapDir, b), `#!/bin/sh\necho ${b} >> '${spawnLog}'\nexec '${real}' "$@"\n`, { mode: 0o755 });
    const WRAPPED = ['xdpyinfo', 'xwininfo', 'xdotool'];
    for (const b of WRAPPED) D.forgetBin(b); // binOnPath memoises a YES by NAME: the wrappers must be the answer for this keeper
    const ks = mk('k13-spawns', { backends: M.DISPLAY_BACKENDS, tickMs: 3600000, fitSlowBeltMs: 4000, env: () => ({ ...baseEnv(), PATH: `${wrapDir}:${process.env.PATH}` }) });
    const wrappedFacts = await ks.facts({ fresh: true });
    ok(WRAPPED.every((b) => wrappedFacts.bins[b] === path.join(wrapDir, b)), 'the keeper resolved the COUNTING wrappers (else every count below would be a vacuous 0)', wrappedFacts.bins);
    await ks.adoptAll(); // no start(): the tick is driven by hand
    const rsp = await ks.launch({ exec: appBin, args: appArgs, label: 'spawns' });
    await until(() => { const r = ks.get(rsp.id); return r.state === 'ready' && r.fit && r.fit.ok ? true : null; }, 20000, 100);
    const spawned = () => { try { return fs.readFileSync(spawnLog, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
    const ticks = async (n) => { for (let i = 0; i < n; i++) { await ks.tick(); await sleep(150); } };
    await ticks(3); // the settling reads after the first act
    const tIdle = Date.now(); fs.writeFileSync(spawnLog, '');
    await ticks(8);
    const idle = spawned();
    ok(idle.length === 0 && Date.now() - tIdle < 4000, `8 ticks over a SETTLED, idle session forked NOTHING (${idle.length}: ${idle.join(', ') || 'none'}; the verifier measured 3 per tick)`);
    await sleep(Math.max(0, 4200 - (Date.now() - tIdle))); fs.writeFileSync(spawnLog, '');
    await ticks(1);
    const slowRun = spawned();
    ok(slowRun.join() === 'xdpyinfo,xwininfo', `the SLOW belt (fitSlowBeltMs, 60 s shipped) re-reads the framebuffer and the tree — and stops there when the tree text is unchanged (${slowRun.join(', ')})`);
    ks.setWatchProbe((id) => id === rsp.id); fs.writeFileSync(spawnLog, '');
    await ticks(3);
    const watchedRun = spawned();
    ok(watchedRun.length === 3 && watchedRun.every((b) => b === 'xwininfo'), `a WATCHED session (a viewer connected — setWatchProbe, the bridge's open sockets) is checked every tick with ONE fork (${watchedRun.join(', ')}) — a window that appears without input is seen within a tick`);
    ks.setWatchProbe(() => false); fs.writeFileSync(spawnLog, '');
    await ticks(3);
    ok(spawned().length === 0, 'CONTROL: the same ticks with nobody watching and no input fork nothing');
    ks.setWatchProbe(null);
    fs.writeFileSync(spawnLog, '');
    ks.noteInput(rsp.id);
    await ticks(3);
    const active = spawned();
    ok(active.length === 3 && active.every((b) => b === 'xwininfo'), `input within ${K.FIT_ACTIVE_MS / 1000} s ⇒ the belt runs every tick with ONE fork (xwininfo; the tree unchanged ⇒ no visibility read, no plan): ${active.join(', ')}`);
    const swid = ks.get(rsp.id).fit.wid;
    execFileSync(XDO, ['windowsize', '--sync', String(swid), '300', '200'], { env: ks.x11EnvFor(rsp.id) });
    fs.writeFileSync(spawnLog, '');
    await ticks(1);
    const moved = spawned();
    const sw = await top(ks, rsp.id, swid);
    ok(moved.join() === 'xwininfo,xdotool,xdotool' && sw && sw.w === 1280 && sw.h === 800 && ks.get(rsp.id).fit.why === 'tick', `the app resized itself while somebody acts ⇒ ONE tick: the tree changed ⇒ the visibility read + the act (${moved.join(', ')}), re-fitted to ${sw && `${sw.w}x${sw.h}`}`);
    ok(K.FIT_SLOW_BELT_MS === 60000 && K.FIT_ACTIVE_MS === 30000 && K.FIT_SETTLE_RUNS === 2, 'the shipped cadence: settling reads 2, input keeps the belt on for 30 s, the settled belt every 60 s');
    await ks.stop(rsp.id); ks.shutdown();
    for (const b of WRAPPED) D.forgetBin(b);
    // (e) the FIXED spelling (the fleet's other group / this box before tigervnc): Xvfb+x11vnc ⇒ fitMode fixed, the app still fitted to the fixed 1280x800, the view says so for the chip
    const kf = mk('k13-fixed', { tickMs: 1000 });
    await kf.adoptAll(); kf.start();
    const rf = await kf.launch({ exec: appBin, args: appArgs, label: 'fixed' });
    ok(rf.via === 'Xvfb+x11vnc' && rf.fitMode === 'fixed' && rf.fitBy === 'keeper', 'via Xvfb+x11vnc ⇒ fitMode FIXED, still the keeper\'s to fit');
    const ff = await until(() => { const r = kf.get(rf.id); return r.state === 'ready' && r.fit && r.fit.ok ? r : null; }, 20000, 100);
    const wf = ff && await top(kf, rf.id, ff.fit.wid);
    ok(!!ff && ff.fb.w === 1280 && ff.fb.h === 800 && wf && wf.w === 1280 && wf.h === 800 && wf.x === 0 && wf.y === 0, `the fixed display's app is fitted to its 1280x800 (window ${wf && `${wf.w}x${wf.h}+${wf.x}+${wf.y}`}) — the browser scales, the chip names the limit`);
    kf.noteDesktopSize(rf.id, 900, 600); await sleep(600);
    ok(kf.get(rf.id).fb.w === 1280 && kf.get(rf.id).fit.w === 1280, 'a SetDesktopSize ask on the fixed spelling changes nothing: the fit reads the TRUTH (xdpyinfo), never the ask');
    await kf.stop(rf.id); kf.shutdown();
    // (f) a refusal BY NAME: no xdotool ⇒ recorded once, logged once, the record stays ready
    const warned = [];
    const noXdo = { ...D, hostFacts: async (o) => { const f = await D.hostFacts(o); return { ...f, bins: { ...f.bins, xdotool: null } }; } };
    const kr = mk('k13-refused', { display: noXdo, tickMs: 500, log: { log() {}, warn: (l) => warned.push(String(l)), error() {} } });
    await kr.adoptAll(); kr.start();
    const rr = await kr.launch({ exec: appBin, args: appArgs, label: 'refused' });
    const refused = await until(() => { const r = kr.get(rr.id); return r.state === 'ready' && r.fit && r.fit.ok === false ? r : null; }, 20000, 100);
    await sleep(1600);
    ok(!!refused && /xdotool not on PATH/.test(refused.fit.why) && refused.fb && refused.fb.w === 1280 && kr.get(rr.id).state === 'ready', `without xdotool the fit is REFUSED BY NAME (${refused && refused.fit.why}), the fb still measured, the record still ready`);
    ok(warned.filter((l) => /cannot fit refused's window/.test(l)).length === 1, 'the refusal is said ONCE (not once per tick)');
    await kr.stop(rr.id); kr.shutdown();
    // (g) THE FLEET SHAPE — a reparenting WINDOW MANAGER on the display (the fleet image has xfwm4 and the recipe starts
    // it when present): the plan fits the CLIENT inside the WM's frame, the act maximises it through the WM, the title is
    // the client's own. VIBESPACE_TEST_WM_DIR may name a directory holding an `xfwm4`/`openbox` for THIS keeper only (the
    // 2026-09-22 measurement ran the fleet image's own xfwm4 4.18 in a container against the keeper's display that way).
    const wmDir = process.env.VIBESPACE_TEST_WM_DIR ? path.resolve(process.env.VIBESPACE_TEST_WM_DIR) : null;
    const wmPath = wmDir ? `${wmDir}:${process.env.PATH}` : process.env.PATH;
    D.forgetBin('xfwm4'); D.forgetBin('openbox'); // a memoised NO from the earlier legs' probes must not hide the directory named here
    const WMBIN = D.binOnPath('xfwm4', { env: { PATH: wmPath } }) || D.binOnPath('openbox', { env: { PATH: wmPath } });
    if (!WMBIN) skip('no xfwm4 / openbox on PATH — the WM-frame leg needs one (the fleet image has xfwm4; VIBESPACE_TEST_WM_DIR may name a directory holding one)');
    else {
      const wlog = [];
      const kw = mk('k13-wm', { backends: M.DISPLAY_BACKENDS, tickMs: 1000, env: () => ({ ...baseEnv(), PATH: wmPath }), log: { log: (l) => wlog.push(String(l)), warn: (l) => wlog.push('WARN ' + l), error() {} } });
      await kw.adoptAll(); kw.start();
      const rw = await kw.launch({ exec: appBin, args: appArgs, label: 'wm' });
      const fw = await until(() => { const r = kw.get(rw.id); return r.state === 'ready' && r.pids.wm && r.fit && r.fit.ok ? r : null; }, 40000, 200);
      // the frame appears after the WM manages the window: the first fit may land before it — wait for a SETTLED frame
      const framed = async () => { const rows = (await kw.windows(rw.id)).windows; const ci = rows.findIndex((w) => fw && w.id === kw.get(rw.id).fit.wid); if (ci < 0) return null; let fi = ci - 1; while (fi >= 0 && rows[fi].depth !== 1) fi--; return fi >= 0 && rows[ci].depth >= 2 ? { client: rows[ci], frame: rows[fi] } : null; };
      const got = fw && await until(async () => { const f = await framed(); return f && f.frame.x === 0 && f.frame.y === 0 && f.frame.w === 1280 && f.frame.h === 800 ? f : null; }, 15000, 250);
      ok(!!fw && fw.backend === 'vnc-display' && fw.pids.wm > 0, `the keeper started the window manager (${path.basename(WMBIN)}, pid ${fw && fw.pids.wm}) beside the app`, fw && { lastError: fw.lastError, fit: fw.fit });
      ok(!!got && !!(got.client.cls || got.client.instance) && !got.frame.cls && got.client.id === kw.get(rw.id).fit.wid, `the fit names the CLIENT (0x${got ? got.client.id.toString(16) : '?'}, class ${got && got.client.cls}) inside the WM's frame — never the frame, never a WM helper`, got);
      ok(!!got && got.frame.w === 1280 && got.frame.h === 800 && got.client.w <= 1280 && got.client.h < 800, `the FRAME is the framebuffer (${got && `${got.frame.w}x${got.frame.h}+${got.frame.x}+${got.frame.y}`}), the client inside it under the title (${got && `${got.client.w}x${got.client.h}+${got.client.x}+${got.client.y}`}) — via ${kw.get(rw.id).fit.via}`);
      ok(!!got && kw.get(rw.id).appTitle === got.client.title && !!kw.get(rw.id).appTitle, `the window's title is the CLIENT's own name (${JSON.stringify(kw.get(rw.id).appTitle)}) — the frame has none`);
      // the app shrinks itself (with somebody acting) ⇒ the frame is the framebuffer again within a few ticks
      kw.noteInput(rw.id);
      execFileSync(XDO, ['windowsize', String(got ? got.client.id : 0), '300', '200'], { env: kw.x11EnvFor(rw.id) });
      const back = await until(async () => { const f = await framed(); return f && f.frame.w === 1280 && f.frame.h === 800 && f.frame.x === 0 && f.frame.y === 0 ? f : null; }, 8000, 250);
      ok(!!back, `the app asked for 300x200 under the WM ⇒ the frame is 1280x800+0+0 again (${back ? 'held/restored' : 'not restored'})`);
      await kw.stop(rw.id); kw.shutdown();
    }
    D.forgetBin('xfwm4'); D.forgetBin('openbox');
  }
}

console.log('§14 r6 — a REFUSED viewer never ends the session (round 2 of the P8-2 verify: a relayed shutdown-server / exit-server from a Watch viewer killed the real xpra)');
{
  const XAUTH14 = D.binOnPath('xauth', { env: process.env });
  const WWW14 = XPRA_BIN ? D.xpraWwwDir({ binPath: XPRA_BIN, env: process.env }) : null;
  if (!XPRA_BIN || !XAUTH14) skip('xpra / xauth not on PATH — the real-rung legs need both');
  else if (!WWW14 || !fs.existsSync(path.join(WWW14, 'js/lib/rencode.js'))) skip('no rencode.js in the installed html5 client — a negotiated client speaks rencodeplus');
  else {
    (await import('node:vm')).runInThisContext(fs.readFileSync(path.join(WWW14, 'js/lib/rencode.js'), 'utf8'), { filename: 'rencode.js' });
    const P = await import('../src/lib/xpra-proto.js');
    const WebSocket = require('ws');
    const frame = (pk) => { const body = Buffer.from(globalThis.rencode(pk)); const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 16; h.writeUInt32BE(body.length, 4); return Buffer.concat([h, body]); };
    const k = mk('k14', { settings: { 'desktop.backendPrefs': '' } });
    await k.adoptAll(); k.start();
    const launch = async (label) => { const r0 = await k.launch({ exec: appBin, args: appArgs, label }); await until(() => (k.get(r0.id).state !== 'launching' ? true : null), 30000); k.keepAlive(r0.id); return k.get(r0.id); };
    /** the product bridge (or a patched copy) with the window-live verdicts: v-watch refused (an agent holds the window), v-own allowed */
    const bridgeOn = async (Smod, policy = (id, v) => (v === 'v-own' ? { relay: true } : { relay: false, code: 'watch-mode' })) => {
      const blog = [];
      const br = Smod.create({ auth: { requestAuthed: () => true }, resolveTarget: (id) => k.streamTarget(id), inputPolicy: policy, onInput: () => {}, log: { log: (l) => blog.push(String(l)), warn: (l) => blog.push('W ' + l) } });
      const srv = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
      srv.on('upgrade', (req, socket, head) => { const id = Smod.upgradeId(req.url.split('?')[0]); if (!id) { socket.destroy(); return; } br.handleUpgrade(req, socket, head, id); });
      const port = await freePort(); await new Promise((r) => srv.listen(port, '127.0.0.1', r));
      return { br, blog, port, close: () => new Promise((r) => srv.close(r)) };
    };
    /** a negotiated viewer: hello answered, the app's window seen; `send` frames packets */
    const viewer = async (b, id, v) => {
      const ws = new WebSocket(`ws://127.0.0.1:${b.port}/api/desktop/${id}/stream?viewer=${v}`, ['binary']);
      const back = []; ws.on('message', (m) => back.push(Buffer.from(m)));
      await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
      ws.send(frame(['hello', { ...P.helloCaps({ width: 640, height: 480, dpi: 96, uuid: `vs-k14-${v}`, layout: 'us' }), lz4: false, brotli: false, compression_level: 0 }]));
      const saw = (t) => back.some((m) => m[0] === 0x50 && S.xpraPacketType(m.subarray(8)) === t);
      await until(() => (saw('hello') && saw('new-window') ? true : null), 15000, 100);
      const first = (t) => back.find((m) => m[0] === 0x50 && S.xpraPacketType(m.subarray(8)) === t) || null;
      return { ws, saw, first, send: (pk) => ws.send(frame(pk)), close: () => { try { ws.close(); } catch {} } };
    };
    const outlives = async (pid) => { await sleep(2500); return D.pidAlive(pid); };
    const b = await bridgeOn(S);
    const r1 = await launch('k14-a');
    const w1 = await viewer(b, r1.id, 'v-watch');
    ok(r1.state === 'ready' && r1.backend === 'xpra' && w1.saw('hello') && w1.saw('new-window'), `the Watch viewer still gets its hello and the app's new-window through the allowlist (${r1.backend}, ${r1.state})`);
    { // …and PIXELS: its map-window is a watch type, so xpra starts drawing the window for it
      const nwMsg = w1.first('new-window'); const nw = nwMsg ? globalThis.rdecode(new Uint8Array(nwMsg.subarray(8))) : null;
      if (nw) w1.send(P.mapWindow(nw[1], { x: 0, y: 0, w: nw[4], h: nw[5] }));
      await until(() => (w1.saw('draw') ? true : null), 10000, 100);
      ok(!!nw && w1.saw('draw'), `a draw reaches the Watch viewer after ITS map-window (wid ${nw && nw[1]}) — the allowlist keeps the picture flowing`);
    }
    const d0 = b.br.stats().dropped;
    w1.send(['shutdown-server']);
    ok(await outlives(r1.pids.x) && k.get(r1.id).state === 'ready', `a Watch viewer's shutdown-server never reaches xpra: pid ${r1.pids.x} alive, record ${k.get(r1.id).state}`);
    w1.send(['exit-server', 'k14 says so']);
    ok(await outlives(r1.pids.x) && k.get(r1.id).state === 'ready', `a Watch viewer's exit-server never reaches xpra either: pid ${r1.pids.x} alive, record ${k.get(r1.id).state}`);
    ok(b.br.stats().dropped - d0 === 2 && b.br.stats().lifecycle === 2 && b.blog.some((l) => /^W .*server-lifecycle packet\(s\).*viewer v-watch dropped/.test(l)), `both counted as refused (dropped +${b.br.stats().dropped - d0}, lifecycle ${b.br.stats().lifecycle}) and named in a warn line`, b.blog.filter((l) => /^W /.test(l)));
    const o1 = await viewer(b, r1.id, 'v-own');
    o1.send(['exit-server', 'k14 allowed']);
    ok(await outlives(r1.pids.x) && k.get(r1.id).state === 'ready' && o1.saw('new-window'), `an input-ALLOWED viewer's exit-server is cut too — the keeper owns the server's lifecycle (pid alive, record ${k.get(r1.id).state})`);
    w1.close(); o1.close();
    await k.stop(r1.id);
    // CONTROL: the r5 bridge (a denylist of input — every non-input packet relayed) on the same Watch viewer. exit-server is the
    // spelling xpra 6.5.3 has no server-side switch for (the recipe's XPRA_CLIENT_CAN_SHUTDOWN=0 covers shutdown-server alone —
    // test-desktop-display §5 (f)), so the bridge is its only gate and the control ends the session.
    const srcS = fs.readFileSync(path.join(repo, 'src/server/desktop-stream.js'), 'utf8');
    const from = '      if (life || (!allowInput && !(type !== null && XPRA_WATCH_TYPES.has(type)))) dropped++; else keep.push(u);';
    ok(srcS.split(from).length === 2, 'the bridge\'s allowlist decision is spelled once (the control patches exactly it)');
    const mfile = MUTK.write('src/server/desktop-stream.js', srcS.replace(from, '      if (input && !allowInput) dropped++; else keep.push(u); // pre-fix (r5)'), 'xstream14');
    const bc = await bridgeOn(require(mfile));
    const r2 = await launch('k14-ctl');
    const w2 = await viewer(bc, r2.id, 'v-watch');
    w2.send(['exit-server', 'k14 control']);
    const died = await until(() => (!D.pidAlive(r2.pids.x) ? true : null), 6000, 100);
    ok(w2.saw('hello') && !!died && k.get(r2.id).state !== 'ready', `CONTROL: through the r5 bridge the same Watch viewer's exit-server ENDS the session (xpra ${r2.pids.x} alive=${D.pidAlive(r2.pids.x)}, record ${k.get(r2.id).state})`);
    w2.close();
    try { await k.stop(r2.id); } catch {}
    await b.close(); await bc.close();
    // ── §15 (2026-09-22, hole B of the r6 verify): THE KEYMAP FENCE on the real rung ──
    console.log('§15 the keymap fence — a Watch viewer never reprograms the display\'s X keymap; its keymap is replayed at its takeover');
    const XMODMAP = D.binOnPath('xmodmap', { env: process.env });
    const XTERM = D.binOnPath('xterm', { env: process.env });
    if (!XMODMAP) skip('no xmodmap on PATH — the keymap legs read the display\'s X keymap with it');
    else {
      const keymapOf = (id) => execFileSync(XMODMAP, ['-pke'], { env: k.x11EnvFor(id) }).toString();
      const hasSym = (id, sym) => new RegExp(`= .*\\b${sym}\\b`).test(keymapOf(id));
      let takeover = false;
      const policy = (id, v) => (v === 'v-own' || (takeover && v === 'v-watch') ? { relay: true } : { relay: false, code: 'watch-mode' });
      const b15 = await bridgeOn(S, policy);
      const r3 = await launch('k15-a');
      ok(!hasSym(r3.id, 'ydiaeresis') && !hasSym(r3.id, 'thorn'), 'the display\'s keymap carries neither ydiaeresis nor thorn before any viewer (the probe keysyms)');
      const w3 = await viewer(b15, r3.id, 'v-watch');
      const nw3m = w3.first('new-window'); const nw3 = nw3m ? globalThis.rdecode(new Uint8Array(nw3m.subarray(8))) : null;
      if (nw3) w3.send(P.mapWindow(nw3[1], { x: 0, y: 0, w: nw3[4], h: nw3[5] }));
      const tDraw = Date.now(); await until(() => (w3.saw('draw') ? true : null), 10000, 50);
      ok(w3.saw('hello') && w3.saw('new-window') && w3.saw('draw'), `MEASURED: the Watch viewer's picture needs no keymap packet — hello, new-window, then a draw ${Date.now() - tDraw} ms after its map-window, with no keyboard-config / keymap-changed sent at all`);
      const d0 = b15.br.stats().dropped;
      w3.send(P.keyboardConfigPacket([], { layout: 'us', extra: [['thorn', 249]] })); // the legacy keymap-changed spelling
      w3.send(P.keyboardConfigPacket(['keyboard-config'], { layout: 'us', extra: [['ydiaeresis', 250]] }));
      await sleep(2500);
      ok(!hasSym(r3.id, 'ydiaeresis') && !hasSym(r3.id, 'thorn') && b15.br.stats().dropped - d0 === 2, `its keyboard-config (ydiaeresis at 250) and keymap-changed (thorn at 249) never reach xpra: X's keymap unchanged 2.5 s later, both counted refused (+${b15.br.stats().dropped - d0})`);
      w3.send(P.pingEcho(1));
      await sleep(300);
      ok(!hasSym(r3.id, 'ydiaeresis'), 'still refused: a later packet replays nothing');
      takeover = true; // the same socket, the same viewer id — the user took the window over
      w3.send(P.pingEcho(2));
      const replayed = await until(() => (hasSym(r3.id, 'ydiaeresis') ? true : null), 5000, 200);
      ok(!!replayed && b15.blog.some((l) => /viewer v-watch may type now — the keymap it sent while refused reaches xpra first/.test(l)), 'THE TAKEOVER: its held keyboard-config reaches xpra first — X carries ydiaeresis (the holder\'s keymap, as if it had connected holding the window), the replay named in the log');
      w3.close();
      await k.stop(r3.id);
      // TYPING after a takeover (the reason the fence HOLDS instead of dropping): the shipped client sends its keymap once,
      // after the hello; a pane that connected in Watch mode must still type once it takes over
      if (!XTERM) skip('no xterm on PATH — the typing leg reads what the app received from a file');
      else {
        const typeAfterTakeover = async (bridgeMod, label) => {
          let own = false;
          const bT = await bridgeOn(bridgeMod, (id, v) => (own ? { relay: true } : { relay: false, code: 'watch-mode' }));
          const out = path.join(root, `k15-${label}-${process.pid}.txt`);
          const r0 = await k.launch({ exec: XTERM, args: ['-geometry', '80x24', '-T', `vs-k15-${label}`, '-e', 'sh', '-c', `stty -icanon; cat > ${out}`], label: `k15-${label}` });
          await until(() => (k.get(r0.id).state !== 'launching' ? true : null), 30000); k.keepAlive(r0.id);
          const v = await viewer(bT, r0.id, 'v-pane');
          v.send(P.keyboardConfigPacket(['keyboard-config'], { layout: 'us' })); // what xpra-client.js sends right after the hello
          const nwm = v.first('new-window'); const nw = nwm ? globalThis.rdecode(new Uint8Array(nwm.subarray(8))) : null;
          if (nw) v.send(P.mapWindow(nw[1], { x: 0, y: 0, w: nw[4], h: nw[5] }));
          await until(() => (v.saw('draw') ? true : null), 10000, 50);
          await sleep(500);
          own = true;
          if (nw) v.send(P.focusPacket(nw[1]));
          for (const kk of new P.ImeKeymap().plan('abc').keys) { v.send(P.keyAction(nw ? nw[1] : 1, kk, true)); v.send(P.keyAction(nw ? nw[1] : 1, kk, false)); }
          const typed = await until(() => { try { const t = fs.readFileSync(out, 'utf8'); return t.length >= 3 ? t : null; } catch { return null; } }, 5000, 100) || (fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '');
          v.close(); await k.stop(r0.id); await bT.close();
          return typed;
        };
        const typed = await typeAfterTakeover(S, 'fix');
        ok(typed === 'abc', `a pane that connected in Watch mode (its keymap fenced) and then TOOK OVER types "abc" into the real xterm (${JSON.stringify(typed)})`);
        // CONTROL: the fence WITHOUT the replay — the same pane types garbage (xpra reads its JS keycodes as X keycodes)
        const fromR = '    if (allowInput && !st.oversize) {';
        ok(srcS.split(fromR).length === 2, 'the replay is spelled once (the control patches exactly it)');
        const rfile = MUTK.write('src/server/desktop-stream.js', srcS.replace(fromR, '    if (false && allowInput) { /* pre-fix: fenced and never replayed */'), 'xreplay15');
        const typedC = await typeAfterTakeover(require(rfile), 'noreplay');
        ok(typedC !== 'abc', `CONTROL: fenced without the replay, the same takeover types ${JSON.stringify(typedC)} instead of "abc"`);
      }
      // CONTROL: the r6 allowlist (keyboard-config / keymap-changed as watch types) — the same Watch viewer reprograms X
      const fromW = "const XPRA_WATCH_TYPES = Object.freeze(new Set(['hello', 'ping', 'ping_echo', 'damage-sequence', 'map-window', 'buffer-refresh', ";
      ok(srcS.split(fromW).length === 2, 'the watch allowlist is spelled once (the control patches exactly it)');
      const wfile = MUTK.write('src/server/desktop-stream.js', srcS.replace(fromW, "const XPRA_WATCH_TYPES = Object.freeze(new Set(['hello', 'ping', 'ping_echo', 'damage-sequence', 'map-window', 'buffer-refresh', 'keyboard-config', 'keymap-changed', "), 'xwatch15');
      const bw = await bridgeOn(require(wfile));
      const r4 = await launch('k15-ctl');
      const w4 = await viewer(bw, r4.id, 'v-watch');
      w4.send(P.keyboardConfigPacket(['keyboard-config'], { layout: 'us', extra: [['ydiaeresis', 250]] }));
      const changed = await until(() => (hasSym(r4.id, 'ydiaeresis') ? true : null), 5000, 200);
      ok(!!changed, 'CONTROL: through the r6 allowlist the same Watch viewer\'s keyboard-config reprograms the display\'s X keymap (ydiaeresis at 250) — the hole');
      w4.close(); await k.stop(r4.id);
      await b15.close(); await bw.close();
    }
    // ── §16 (2026-09-22, round 3 of the P8-2 verify): THE DISPLAY-SIZE FENCE on the real rung ──
    console.log('§16 the display-size fence — a Watch viewer never resizes the holder\'s shared virtual display; its size is replayed at its takeover');
    const XDPY16 = D.binOnPath('xdpyinfo', { env: process.env });
    if (!XDPY16) skip('no xdpyinfo on PATH — the display-size legs read the X screen with it');
    else {
      const sizeOf = (id) => { const m = /dimensions:\s+(\d+)x(\d+) pixels/.exec(execFileSync(XDPY16, [], { env: k.x11EnvFor(id) }).toString()); return m ? `${m[1]}x${m[2]}` : null; };
      const settle = (id, want, ms = 5000) => until(() => (sizeOf(id) === want ? want : null), ms, 100);
      let own16 = false;
      const policy16 = (id, v) => (v === 'v-own' || (own16 && v === 'v-watch') ? { relay: true } : { relay: false, code: 'watch-mode' });
      const b16 = await bridgeOn(S, policy16);
      const r6 = await launch('k16-a');
      const o6 = await viewer(b16, r6.id, 'v-own');
      o6.send(P.displayPacket(['display-configure'], { width: 900, height: 600 }));
      ok(!!(await settle(r6.id, '900x600')), `the HOLDER's display-configure sizes the shared display (${sizeOf(r6.id)}) — the fit the pane asks for`);
      const w6 = await viewer(b16, r6.id, 'v-watch');
      await sleep(500);
      ok(sizeOf(r6.id) === '900x600', `a Watch viewer's hello (640x480 caps) leaves the holder's size alone (${sizeOf(r6.id)}) — xpra keeps an existing client's size`);
      const d6 = b16.br.stats().dropped;
      w6.send(P.displayPacket(['display-configure'], { width: 1, height: 1 }));
      w6.send(P.displayPacket(['configure-display'], { width: 480, height: 360 }));
      w6.send(P.displayPacket([], { width: 320, height: 240 })); // the legacy desktop_size spelling
      await sleep(2500);
      ok(sizeOf(r6.id) === '900x600' && b16.br.stats().dropped - d6 === 3, `its display-configure (1x1), configure-display (480x360) and desktop_size (320x240) never reach xpra: the display is ${sizeOf(r6.id)} 2.5 s later, all three counted refused (+${b16.br.stats().dropped - d6})`);
      w6.close();
      await sleep(800);
      ok(sizeOf(r6.id) === '900x600', `…and after the Watch viewer closes the holder's size stands (${sizeOf(r6.id)})`);
      // THE TAKEOVER: the pane that watched becomes the holder — the size it asked for while refused is its fit now
      const w7 = await viewer(b16, r6.id, 'v-watch');
      w7.send(P.displayPacket(['display-configure'], { width: 700, height: 500 }));
      await sleep(1500);
      ok(sizeOf(r6.id) === '900x600', `still refused: its 700x500 is held, not applied (${sizeOf(r6.id)})`);
      own16 = true;
      w7.send(P.pingEcho(3));
      const took = await settle(r6.id, '700x500');
      ok(!!took && b16.blog.some((l) => /viewer v-watch may type now — the display size it sent while refused reaches xpra first/.test(l)), `THE TAKEOVER: its held display-configure reaches xpra first — the display is ${sizeOf(r6.id)}, the pane's own size, the replay named in the log`, b16.blog.filter((l) => /may type now/.test(l)));
      w7.close(); o6.close();
      await k.stop(r6.id);
      // CONTROL: the fence WITHOUT the replay — the pane that watched and took over never gets its own size
      const fromN = '    if (allowInput && !st.oversize) {';
      ok(srcS.split(fromN).length === 2, 'the replay is spelled once (the no-replay control patches exactly it)');
      const nfile = MUTK.write('src/server/desktop-stream.js', srcS.replace(fromN, '    if (false && allowInput) { /* pre-fix: fenced and never replayed */'), 'xnoreplay16');
      let ownN = false;
      const bn = await bridgeOn(require(nfile), (id, v) => (v === 'v-own' || (ownN && v === 'v-watch') ? { relay: true } : { relay: false, code: 'watch-mode' }));
      const r9 = await launch('k16-noreplay');
      const o9 = await viewer(bn, r9.id, 'v-own');
      o9.send(P.displayPacket(['display-configure'], { width: 900, height: 600 }));
      await settle(r9.id, '900x600');
      const w9 = await viewer(bn, r9.id, 'v-watch');
      w9.send(P.displayPacket(['display-configure'], { width: 700, height: 500 }));
      await sleep(800);
      ownN = true; w9.send(P.pingEcho(4));
      await sleep(2000);
      ok(sizeOf(r9.id) === '900x600', `CONTROL: fenced without the replay, the pane that took over is left at the old holder's ${sizeOf(r9.id)} instead of its own 700x500`);
      w9.close(); o9.close(); await k.stop(r9.id); await bn.close();
      // CONTROL: the r7 allowlist (the display-size packets as watch types) — the same Watch viewer resizes the holder's display
      const fromD = "const XPRA_WATCH_TYPES = Object.freeze(new Set(['hello', 'ping', 'ping_echo', 'damage-sequence', 'map-window', 'buffer-refresh', ";
      ok(srcS.split(fromD).length === 2, 'the watch allowlist is spelled once (the control patches exactly it)');
      const dfile = MUTK.write('src/server/desktop-stream.js', srcS.replace(fromD, fromD + "'display-configure', 'configure-display', 'desktop_size', "), 'xdisplay16');
      const bd = await bridgeOn(require(dfile));
      const r8 = await launch('k16-ctl');
      const o8 = await viewer(bd, r8.id, 'v-own');
      o8.send(P.displayPacket(['display-configure'], { width: 900, height: 600 }));
      await settle(r8.id, '900x600');
      const w8 = await viewer(bd, r8.id, 'v-watch');
      w8.send(P.displayPacket(['display-configure'], { width: 1, height: 1 }));
      const shrunk = await until(() => { const s = sizeOf(r8.id); return s && s !== '900x600' ? s : null; }, 5000, 100);
      w8.close(); await sleep(800);
      const after = sizeOf(r8.id);
      ok(!!shrunk && after !== '900x600', `CONTROL: through the r7 allowlist the same Watch viewer resizes the holder's display (900x600 ⇒ ${shrunk}) and it stays ${after} after the watcher closes — the hole`);
      o8.close(); await k.stop(r8.id);
      await b16.close(); await bd.close();
    }
    k.shutdown();
  }
}

console.log('§17 the exit sweep\'s Xvfb-for-Xpra rule — by EVIDENCE (dead owner + gone scratch dir), never by name');
{
  // a dead pid to name as the "xpra" owner and as the "run" pid: a child that already exited
  const deadPid = () => { const c = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }); return Number(c.stdout); };
  const ownerDead = deadPid(), runDead = deadPid();
  const goneDir = `${scratchFamily}-${runDead}`, liveDir = path.join(root, 'xvfb-evidence-live');
  fs.mkdirSync(goneDir, { recursive: true }); fs.mkdirSync(liveDir, { recursive: true });
  // stand-ins named like xpra's own Xvfb (bash `exec -a` sets argv[0]); cwd = a crashed run's scratch dir / this run's live one
  const fake = (cwd, owner) => { const c = spawn('bash', ['-c', `exec -a Xvfb-for-Xpra-S${owner} sleep 30`], { cwd, stdio: 'ignore', detached: true }); children.push(c); return c; };
  const gone = fake(goneDir, ownerDead), live = fake(liveDir, ownerDead), ownerAlive = fake(goneDir, process.pid);
  await sleep(300);
  fs.rmSync(goneDir, { recursive: true, force: true }); // the crashed run's scratch dir is GONE (its cwd now reads "(deleted)")
  const hit = xvfbOrphans();
  ok(hit.includes(gone.pid), `an Xvfb-for-Xpra-S<dead owner> whose cwd was a DELETED scratch dir of this suite's family (run pid dead) is an orphan by evidence (${gone.pid})`, hit);
  ok(!hit.includes(live.pid), 'CONTROL: the same name and a dead owner, but its scratch dir still EXISTS (a live run\'s) — not touched', hit);
  ok(!hit.includes(ownerAlive.pid), 'CONTROL: a gone scratch dir, but its named xpra owner is ALIVE — not touched', hit);
  for (const c of [gone, live, ownerAlive]) { try { process.kill(c.pid, 'SIGKILL'); } catch {} }
}

console.log('§18 B-bfe6 — a BROWSER as a desktop app: its OWN profile dir (created 0700, the argv names it, removed with the session unless kept), refusals by name, the boot belt');
{
  // a stand-in browser of the chromium family on a scratch PATH (the real Chrome runs in the heavy xpra-window leg):
  // it records its argv INTO the profile it was handed and writes a file there (what a browser does), then lives until
  // stopped — or exits by itself when its URL asks (`?exit=1`: the app-exit terminal path, not a stop)
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const fakeBin = path.join(root, 'browser-bin'), fakeHome = path.join(root, 'browser-home');
  fs.mkdirSync(fakeBin, { recursive: true }); fs.mkdirSync(fakeHome, { recursive: true });
  const FAKE = `vs-fake-chromium-${process.pid}`;
  fs.writeFileSync(path.join(fakeBin, FAKE), '#!/bin/sh\nfor a in "$@"; do case "$a" in --user-data-dir=*) P="${a#--user-data-dir=}";; esac; done\n[ -n "$P" ] && printf \'%s\\n\' "$@" > "$P/argv.txt" && echo cookie > "$P/Cookies"\ncase "$*" in *exit=1*) sleep 1; exit 0;; esac\nsleep 600\n', { mode: 0o755 });
  const SNAPPY = `vs-fake-snapbrowser-${process.pid}`;
  fs.writeFileSync(path.join(fakeBin, SNAPPY), `#!/bin/sh\nexec /snap/bin/${SNAPPY} "$@"\n`, { mode: 0o755 });
  const rows = [
    { id: 'vs-browser', label: 'Fake browser', exec: FAKE, execs: [FAKE], args: [], category: 'browser', browser: 'chromium' },
    { id: 'vs-snap-browser', label: 'Snap browser', exec: SNAPPY, execs: [SNAPPY], args: [], category: 'browser', browser: 'firefox' },
  ];
  const benv = () => ({ ...baseEnv(), PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, HOME: fakeHome });
  const mkB = (name, K0 = K) => { const dataDir = path.join(root, name); fs.mkdirSync(dataDir, { recursive: true }); const k = K0.create({ dataDir, env: benv, broadcast: () => {}, serverSetting: (key) => PIN[key], backends: XVFB_TABLE, registryRows: rows, log: { log() {}, warn() {}, error() {} } }); keepers.push(k); return k; };
  const k = mkB('k18');
  await k.adoptAll(); k.start();
  const l = await k.list();
  const served = l.registry.find((r) => r.id === 'vs-browser'), snapRow = l.registry.find((r) => r.id === 'vs-snap-browser');
  ok(served && served.available && served.exec === FAKE && served.path === path.join(fakeBin, FAKE), 'the catalog serves the browser row with the family member found on PATH', served);
  ok(snapRow && snapRow.available === false && /is a snap: it can only open a profile inside your home folder/.test(snapRow.reason), 'a SNAP browser whose profile could not live under this keeper\'s /tmp root is DIMMED with the verdict\'s own sentence (never hidden)', snapRow);
  // (a) launch with a URL: the profile is the session's own, 0700, named by the argv, the URL after the profile flags
  const a = await k.launch({ appId: 'vs-browser', url: 'https://example.com/vs-bfe6' });
  const prof = path.join(k.logRoot, a.id, 'profile');
  ok(a.browser === 'chromium' && a.profileDir === prof && a.keepProfile === false && a.url === 'https://example.com/vs-bfe6', 'the record names the family, its OWN profile dir (data/desktop-apps/<id>/profile), the URL and keepProfile false', a);
  ok(fs.existsSync(prof) && (fs.statSync(prof).mode & 0o777) === 0o700, 'the profile dir exists before the app starts, mode 0700');
  ok(!prof.startsWith(fakeHome + path.sep) && !prof.startsWith(process.env.HOME + path.sep), `the profile is NOT under $HOME (the apps' HOME ${fakeHome}, nor the real one) — it lives in the keeper's data dir`);
  ok(same(a.args, [`--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--password-store=basic', 'https://example.com/vs-bfe6']), 'the record\'s argv: the profile flags, THEN the URL', a.args);
  const ready = await until(() => { const r = k.get(a.id); return r.state === 'ready' || r.state === 'failed' ? r : null; });
  ok(ready && ready.state === 'ready', 'the browser session reaches ready on the private display', ready && ready.lastError);
  const argvFile = await until(() => { try { return fs.readFileSync(path.join(prof, 'argv.txt'), 'utf8'); } catch { return null; } }, 8000);
  ok(!!argvFile && argvFile.split('\n').filter(Boolean).join(' ') === a.args.join(' '), 'the browser PROCESS got exactly that argv and wrote into the profile it was handed', argvFile);
  const stopped = await k.stop(a.id);
  ok(stopped.state === 'exited' && !fs.existsSync(prof) && stopped.profileRemovedAt > 0 && !stopped.profileKept, 'stop ⇒ the session is verified gone, THEN its profile is removed (profileRemovedAt on the record)', { state: stopped.state, exists: fs.existsSync(prof), removed: stopped.profileRemovedAt });
  ok(fs.existsSync(path.join(k.logRoot, a.id, 'app.log')), 'the session\'s app.log stays (only the profile goes)');
  // (b) keep profile
  const b = await k.launch({ appId: 'vs-browser', keepProfile: true });
  const profB = path.join(k.logRoot, b.id, 'profile');
  await until(() => k.get(b.id).state !== 'launching');
  await until(() => fs.existsSync(path.join(profB, 'Cookies')), 8000);
  const sb = await k.stop(b.id);
  ok(sb.keepProfile === true && sb.profileKept === true && !sb.profileRemovedAt && fs.existsSync(path.join(profB, 'Cookies')), '"keep profile" ⇒ the profile (and what the browser wrote) STAYS after stop, and the record says so', { kept: sb.profileKept, exists: fs.existsSync(profB) });
  // (c) the browser exits by itself (not a stop): the app-exit terminal path retires the profile too
  const c = await k.launch({ appId: 'vs-browser', url: 'https://example.com/?exit=1' });
  const profC = path.join(k.logRoot, c.id, 'profile');
  const endedC = await until(() => { const r = k.get(c.id); return r.state === 'exited' && r.profileRemovedAt ? r : null; }, 15000);
  ok(!!endedC && /application exited/.test(endedC.lastError || '') && !fs.existsSync(profC), 'a browser that EXITS by itself: the session ends (app-exit) and its profile is removed on that path too', k.get(c.id));
  // (c2) 2026-09-25 (the owner's ruling; F): an IDLE-OUT is the keeper's decision, not a person's — the session stops as
  // before, but its profile is KEPT and the record says why (a profile goes only by a person's ending)
  {
    const dataDirI = path.join(root, 'k18-idle'); fs.mkdirSync(dataDirI, { recursive: true });
    const settingsI = { ...PIN, 'desktop.idleTimeoutMin': 0.02 };
    const ki = K.create({ dataDir: dataDirI, env: benv, broadcast: () => {}, serverSetting: (key) => settingsI[key], backends: XVFB_TABLE, registryRows: rows, tickMs: 150, log: { log() {}, warn() {}, error() {} } }); keepers.push(ki);
    await ki.adoptAll(); ki.start();
    const d = await ki.launch({ appId: 'vs-browser' });
    const profD = path.join(ki.logRoot, d.id, 'profile');
    await until(() => fs.existsSync(path.join(profD, 'Cookies')), 8000);
    const idled = await until(() => { const r = ki.get(d.id); return r.state === 'exited' ? r : null; }, 10000);
    ok(!!idled && idled.stoppedBy === 'idle' && fs.existsSync(path.join(profD, 'Cookies')) && !idled.profileRemovedAt && idled.profileKept === true && /by the keeper \(idle\), not by a person/.test(idled.profileKeptWhy || ''), 'an IDLE-OUT stops the session but KEEPS its profile (what the browser wrote is still there) and the record says why', idled && { state: idled.state, kept: idled.profileKept, why: idled.profileKeptWhy });
    ki.shutdown();
    const ki2 = K.create({ dataDir: dataDirI, env: benv, broadcast: () => {}, serverSetting: (key) => settingsI[key], backends: XVFB_TABLE, registryRows: rows, log: { log() {}, warn() {}, error() {} } }); keepers.push(ki2);
    await ki2.adoptAll();
    ok(fs.existsSync(path.join(profD, 'Cookies')) && !ki2.get(d.id).profileRemovedAt, '…and the next BOOT\'s retirement pass keeps it too (the same person-only verdict decides)');
    ki2.shutdown();
  }
  // (d) refusals by name — nothing recorded, nothing created
  const before = Object.keys(k._store().apps).length;
  const refusal = async (body) => { try { await k.launch(body); return null; } catch (e) { return e; } };
  const e1 = await refusal({ appId: 'vs-browser', url: 'javascript:alert(1)' });
  const e2 = await refusal({ appId: 'vs-browser', url: 'file:///etc/passwd' });
  const e3 = await refusal({ exec: appBin, url: 'https://example.com' });
  const e4 = await refusal({ appId: 'vs-snap-browser' });
  ok(e1 && e1.code === 'bad-url' && e2 && e2.code === 'bad-url' && /http:\/\/ or https:\/\//.test(e1.message), 'a bad URL is refused by name (`bad-url`)', [e1 && e1.message, e2 && e2.message]);
  ok(e3 && e3.code === 'not-a-browser', 'a URL on a typed command is refused by name (`not-a-browser`)', e3 && e3.message);
  ok(e4 && e4.code === 'snap-profile-unreachable', 'the snap browser is refused by name at launch (`snap-profile-unreachable`)', e4 && e4.message);
  ok(Object.keys(k._store().apps).length === before, 'a refused launch records nothing');
  // (e) the routes speak the codes (400 / 409)
  {
    const express = require('express');
    const { router, setup } = require('../src/routes/desktop-apps.js');
    setup({ keeper: k, vnc: { status: async () => ({ available: false, running: false, port: 0 }), ensureRunning: async () => { throw new Error('none'); } } });
    const app = express(); app.use(express.json()); app.use(router);
    const port = await freePort();
    const srv = await new Promise((r) => { const s = app.listen(port, '127.0.0.1', () => r(s)); });
    const post = async (body) => { const res = await fetch(`http://127.0.0.1:${port}/api/desktop/apps`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, body: await res.json() }; };
    const r1 = await post({ appId: 'vs-browser', url: 'ftp://x' }), r2 = await post({ appId: 'vs-snap-browser' });
    ok(r1.status === 400 && r1.body.code === 'bad-url' && r2.status === 409 && r2.body.code === 'snap-profile-unreachable', `POST /api/desktop/apps: bad-url 400, snap-profile-unreachable 409 (${r1.status}/${r2.status})`, [r1, r2]);
    srv.close();
  }
  k.shutdown();
  // (f) THE BOOT BELT: a SIGKILL of the server between a stop's verdict and the profile's removal leaves a terminal record
  // with its profile on disk — the next keeper removes it at adoptAll (and never a kept one)
  {
    const dataDir = path.join(root, 'k18b'); const logRoot = path.join(dataDir, 'desktop-apps');
    const p1 = path.join(logRoot, 'da-boot1', 'profile'), p2 = path.join(logRoot, 'da-boot2', 'profile');
    for (const p of [p1, p2]) { fs.mkdirSync(p, { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(p, 'Cookies'), 'x'); }
    const recOf = (id, profileDir, keepProfile) => ({ ...M.newRecord({ id, label: 'Fake browser', exec: FAKE, source: 'registry', backend: 'vnc-display', now: Date.now() - 1000 }), state: 'exited', endedAt: Date.now() - 500, browser: 'chromium', profileDir, keepProfile });
    fs.writeFileSync(path.join(dataDir, 'desktop-apps.json'), JSON.stringify({ apps: { 'da-boot1': recOf('da-boot1', p1, false), 'da-boot2': recOf('da-boot2', p2, true) }, runawayParkedUntil: {} }));
    const kb = mkB('k18b');
    await kb.adoptAll();
    ok(!fs.existsSync(p1) && kb.get('da-boot1').profileRemovedAt > 0, 'boot belt: an exited record\'s leftover profile is removed at adoption');
    ok(fs.existsSync(p2) && !kb.get('da-boot2').profileRemovedAt, 'boot belt: a KEPT profile is never removed');
    kb.shutdown();
  }
  // (g) CONTROL — a keeper copy whose stop never retires the profile: the same stop leaves it behind (the leg above is the fix)
  {
    const { mod } = mutant('noretire', [['      if (rec.profileDir) await retireProfile(rec, { clean, why: `stopped (${why})` });', '      // pre-fix: no retire at stop']]);
    const kc = mkB('k18c', mod);
    await kc.adoptAll(); kc.start();
    const x = await kc.launch({ appId: 'vs-browser' });
    const profX = path.join(kc.logRoot, x.id, 'profile');
    await until(() => kc.get(x.id).state !== 'launching');
    const sx = await kc.stop(x.id);
    ok(sx.state === 'exited' && fs.existsSync(profX), 'CONTROL: without the retire at stop, the stopped session\'s profile is LEFT on disk — the leg above proves the removal, not a coincidence');
    kc.shutdown();
  }
}

console.log('§19 round 3 A2 (docs/design-desktop-apps-seamless §3.2) — an app EXIT: the record + the broadcast carry the windows LEFT on the display (the census before the teardown)');
{
  const XT = D.binOnPath('xterm', { env: process.env });
  const exitedOf = (k, id) => k._events.filter((m) => m.type === 'desktop-apps-updated').map((m) => (m.apps || []).find((a) => a.id === id)).filter((a) => a && a.state === 'exited');
  /** launch, wait ready, then time the exit: the record's state flip and the broadcast that carries it */
  const runExit = async (k, body, label) => {
    const r0 = await k.launch(body);
    await until(() => (k.get(r0.id).state !== 'launching' ? true : null), 40000);
    const r1 = k.get(r0.id);
    if (r1.state !== 'ready') return { r1, label };
    const flipAt = await until(() => (k.get(r0.id).state === 'exited' ? Date.now() : null), 20000, 10);
    const castAt = await until(() => (exitedOf(k, r0.id).length ? Date.now() : null), 10000, 10);
    return { id: r0.id, r1, rec: k.get(r0.id), cast: exitedOf(k, r0.id)[0] || null, flipAt, castAt, label };
  };
  if (!XT) skip('§19: xterm not on PATH — no app that exits by itself and a forking launcher to drive');
  else {
    const rungs = [['xpra', XPRA_BIN && D.binOnPath('xauth', { env: process.env }) ? { settings: { 'desktop.backendPrefs': '' } } : null], ['vnc-display', {}]];
    for (const [rung, opts] of rungs) {
      if (!opts) { skip(`§19 ${rung}: the rung cannot be driven on this box`); continue; }
      const k = mk(`k19-${rung}`, opts);
      await k.adoptAll(); k.start();
      // (a) the app exits by itself (xterm running a 2.5 s shell): the windows went with it ⇒ 0, and the broadcast says so
      const a = await runExit(k, { exec: XT, args: ['-T', 'vs-a2-exit', '-geometry', '40x10', '-e', 'sh', '-c', 'sleep 2.5'], label: 'a2-exit' }, 'exit');
      ok(a.r1.state === 'ready' && a.r1.backend === rung, `§19 ${rung}: the app reaches ready on the ${rung} rung`, a.r1);
      if (a.rec) {
        console.log(`  §19 ${rung} (a): the record flipped to exited, the broadcast carrying it arrived ${a.castAt && a.flipAt ? a.castAt - a.flipAt : '?'} ms later (the census + the teardown); windowsAtExit ${a.rec.windowsAtExit}`);
        ok(a.rec.state === 'exited' && a.rec.exitCode === 0 && !a.rec.stoppedBy && a.rec.windowsAtExit === 0, `§19 ${rung} (a): an app that EXITS ⇒ exited (code 0), no stoppedBy, windowsAtExit 0 on the record (${a.rec.windowsAtExit})`, { state: a.rec.state, exitCode: a.rec.exitCode, windowsAtExit: a.rec.windowsAtExit, lastError: a.rec.lastError });
        ok(!!a.cast && a.cast.windowsAtExit === 0 && a.castAt - a.flipAt < 2000, `§19 ${rung} (a): the desktop-apps-updated broadcast carries the exited record WITH windowsAtExit 0, within 2 s of the exit (${a.castAt - a.flipAt} ms)`, a.cast && { state: a.cast.state, windowsAtExit: a.cast.windowsAtExit });
        ok(M.exitCloseVerdict(a.cast).close === true, `§19 ${rung} (a): …and the PURE client verdict over that broadcast closes the window (${JSON.stringify(M.exitCloseVerdict(a.cast))})`);
        ok([a.r1.pids.x, a.r1.pids.server, a.r1.pids.app].filter(Boolean).every((p) => !alive(p)) && markerPids(a.id).length === 0, `§19 ${rung} (a): the teardown still ran after the census — nothing of the session left`, markerPids(a.id));
      }
      // (b) a FORKING launcher: the shell exits 0 after 3 s while the xterm it started keeps its window ⇒ the census counts it
      const b = await runExit(k, { exec: '/bin/sh', args: ['-c', `${XT} -T vs-a2-child -geometry 40x10 & sleep 3; exit 0`], label: 'a2-fork' }, 'fork');
      if (b.rec) {
        ok(b.rec.state === 'exited' && b.rec.windowsAtExit >= 1, `§19 ${rung} (b): a forking launcher exits while its child still shows a window ⇒ windowsAtExit ${b.rec.windowsAtExit} (≥ 1) — "the app exited" is not claimed for a window that is still there`, { windowsAtExit: b.rec.windowsAtExit, lastError: b.rec.lastError });
        ok(M.exitCloseVerdict(b.rec).close === false && M.exitCloseVerdict(b.rec).why === 'windows-left', `§19 ${rung} (b): …the client verdict keeps that window with its sentence (${JSON.stringify(M.exitCloseVerdict(b.rec))})`);
        ok(markerPids(b.id).length === 0, `§19 ${rung} (b): the teardown reaps the child too (the marker census is empty)`, markerPids(b.id));
      } else ok(false, `§19 ${rung} (b): the forking launcher reached ready`, b.r1);
      // (c) Stop: a stop is not an exit — no census, stoppedBy names it (the client closes on that)
      const c0 = await k.launch({ exec: XT, args: ['-T', 'vs-a2-stop', '-geometry', '40x10'], label: 'a2-stop' });
      await until(() => (k.get(c0.id).state !== 'launching' ? true : null), 40000);
      const c1 = await k.stop(c0.id);
      ok(c1.state === 'exited' && c1.stoppedBy === 'user' && c1.windowsAtExit === undefined && M.exitCloseVerdict(c1).why === 'stopped', `§19 ${rung} (c): Stop ⇒ exited, stoppedBy user, no census (${c1.windowsAtExit}) — the verdict closes on the stop`, { state: c1.state, stoppedBy: c1.stoppedBy, windowsAtExit: c1.windowsAtExit });
      k.shutdown();
    }
    // (d) CONTROL — a keeper copy without the census (the pre-A2 keeper): the same forking launcher's record carries no count,
    // so the verdict would close a window that is still on the display — the (b) leg above is the census, not a coincidence
    const { mod } = mutant('noexitcensus', [['        rec.windowsAtExit = await windowsLeftAtExit(rec);', '        // pre-A2: no census at the exit']]);
    fs.mkdirSync(path.join(root, 'k19-ctl'), { recursive: true });
    const kxEvents = [];
    const kx = mod.create({ dataDir: path.join(root, 'k19-ctl'), env: baseEnv, broadcast: (m) => kxEvents.push(m), serverSetting: (key) => ({ ...PIN, ...(XPRA_BIN ? { 'desktop.backendPrefs': '' } : {}) })[key], backends: XVFB_TABLE, log: { log() {}, warn() {}, error() {} } });
    kx._events = kxEvents; keepers.push(kx);
    await kx.adoptAll(); kx.start();
    const x = await runExit(kx, { exec: '/bin/sh', args: ['-c', `${XT} -T vs-a2-child -geometry 40x10 & sleep 3; exit 0`], label: 'a2-fork-ctl' }, 'fork-ctl');
    ok(!!x.rec && x.rec.state === 'exited' && x.rec.windowsAtExit === undefined && M.exitCloseVerdict(x.rec).close === true, `CONTROL: without the census the forking launcher's record carries no count (${x.rec && x.rec.windowsAtExit}) and the verdict would CLOSE the window its child still shows`, x.rec && { windowsAtExit: x.rec.windowsAtExit });
    kx.shutdown();
  }
}

console.log('§20 round 3 A3 (docs/design-desktop-apps-seamless §3.4) — the scale DERIVED from dpr × UI scale, measured inside the app\'s display; the per-window relaunch');
{
  const XT = D.binOnPath('xterm', { env: process.env }), XRDB = D.binOnPath('xrdb', { env: process.env });
  const envOf = (pid) => { try { return Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'latin1').split('\0').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch { return {}; } };
  const xftDpiOf = (k, r) => { try { const out = execFileSync(XRDB, ['-query'], { env: { PATH: process.env.PATH, DISPLAY: r.display, XAUTHORITY: path.join(k.logRoot, r.id, 'Xauthority') }, encoding: 'utf8', timeout: 5000 }); return Number((out.match(/^Xft\.dpi:\s+(\d+)/m) || [])[1]) || null; } catch { return null; } };
  const readyOf = async (k, id) => { await until(() => (k.get(id).state !== 'launching' ? true : null), 40000); return k.get(id); };
  if (!XPRA_BIN || !D.binOnPath('xauth', { env: process.env }) || !XT || !XRDB) skip('§20: xpra / xauth / xterm / xrdb not all on PATH — the xpra rung\'s scale cannot be measured on this box');
  else {
    const k = mk('k20', { settings: { 'desktop.backendPrefs': '', 'desktop.appScale': 'auto' } });
    await k.adoptAll(); k.start();
    // (a) a DPR-2 client at UI scale 125 % under `auto`: 2.5× = GDK_SCALE 2 in the app's environ + Xft.dpi 120 on its display
    const a0 = await k.launch({ exec: XT, args: ['-T', 'vs-a3-scale', '-geometry', '40x10'], label: 'a3-scale', dpr: 2, uiScale: 1.25 });
    const a1 = await readyOf(k, a0.id);
    const aEnv = envOf(a1.pids.app), aDpi = xftDpiOf(k, a1);
    // the TEXT half, measured: xterm's 40×10 cells are drawn by its Xft face (faceSize 8 × GDK_SCALE) at the display's dpi —
    // its window at 120 dpi against the same face at 96 dpi (the CONTROL (f) below) is the text scale 2.5 / 2 = 1.25
    const xtermWin = async (kk, id, title) => { const w = await until(async () => { const r = await kk.windows(id).catch(() => null); return ((r && r.windows) || []).find((x) => x.title === title && x.w > 16) || null; }, 10000).catch(() => null); return w ? { w: w.w, h: w.h } : null; };
    const aWin = await xtermWin(k, a0.id, 'vs-a3-scale');
    console.log(`  §20 (a): record scale ${a1.scale} dpi ${a1.dpi} origin ${a1.scaleOrigin} from ${JSON.stringify(a1.scaleFrom)}; inside the display: GDK_SCALE=${aEnv.GDK_SCALE}, Xft.dpi ${aDpi}`);
    ok(a1.state === 'ready' && a1.backend === 'xpra' && a1.scale === 2.5 && a1.dpi === 120 && a1.scaleOrigin === 'auto' && a1.scaleFrom && a1.scaleFrom.dpr === 2 && a1.scaleFrom.uiScale === 1.25, '§20 (a): dpr 2 × uiScale 1.25 under auto ⇒ the record says 2.5×, 120 dpi, origin auto, and the numbers it came from', { state: a1.state, scale: a1.scale, dpi: a1.dpi, origin: a1.scaleOrigin, from: a1.scaleFrom, lastError: a1.lastError });
    ok(aEnv.GDK_SCALE === '2' && aDpi === 120, `§20 (a): MEASURED inside the app's display — GDK_SCALE=${aEnv.GDK_SCALE} in the app's environ, Xft.dpi ${aDpi} in its resource database`, { GDK_SCALE: aEnv.GDK_SCALE, xft: aDpi });
    // (b) the per-window relaunch at 1.5×: the successor first, the old one names it BEFORE its stop broadcasts, then stops
    const castsBefore = k._events.length;
    // desktop A r1: two clients on the window — L active, H blocked (x5). H follows the `replacedBy` broadcast and attaches to
    // the successor FIRST (in the old-record broadcast itself, before the old session's teardown even starts); L (the one
    // that chose the scale) attaches only after the HTTP answer. L must hold the successor's seat with no Resume.
    k.viewerJoined(a0.id, { viewerId: 'v-L', pane: 'pL' }); k.viewerJoined(a0.id, { viewerId: 'v-H', pane: 'pH' });
    let hJoinedAt = null;
    const castsWatch = setInterval(() => { if (hJoinedAt) return; const m = k._events.slice(castsBefore).find((x) => x.type === 'desktop-apps-updated' && (x.apps || []).some((a) => a.id === a0.id && a.replacedBy)); if (m) { const succ = m.apps.find((a) => a.id === a0.id).replacedBy; hJoinedAt = { succ, activeAtJoin: (k.viewerJoined(succ, { viewerId: 'v-H2', pane: 'pH' }) || {}).active }; } }, 5);
    const t0 = Date.now();
    const rl = await k.relaunch(a0.id, { scale: 1.5, dpr: 2, uiScale: 1.25 });
    clearInterval(castsWatch);
    const lView = k.viewerJoined(rl.app.id, { viewerId: 'v-L2', pane: 'pL' });
    console.log(`  §20 (b) r1: H attached to the successor during the teardown (active then: ${hJoinedAt && JSON.stringify(hJoinedAt.activeAtJoin)}); after the answer L attached — active ${k.activeViewer(rl.app.id)} (${lView && lView.active})`);
    ok(!!hJoinedAt && hJoinedAt.succ === rl.app.id && hJoinedAt.activeAtJoin === 'pL' && k.activeViewer(rl.app.id) === 'v-L2', '§20 (b) desktop A r1: the relaunch CARRIES the seat — the blocked client H attaching to the successor first (from the replacedBy broadcast, during the teardown) is blocked with pane pL named active, and L attaching after the answer is ACTIVE with no Resume', { hJoinedAt, active: k.activeViewer(rl.app.id) });
    k.viewerLeft(rl.app.id, 'v-L2'); k.viewerLeft(rl.app.id, 'v-H2');
    const b1 = await readyOf(k, rl.app.id);
    const readyMs = Date.now() - t0;
    const bEnv = envOf(b1.pids.app), bDpi = xftDpiOf(k, b1);
    const olds = k._events.slice(castsBefore).filter((m) => m.type === 'desktop-apps-updated').map((m) => (m.apps || []).find((x) => x.id === a0.id)).filter(Boolean);
    const firstNamed = olds.findIndex((x) => x.replacedBy === rl.app.id), firstExited = olds.findIndex((x) => x.state === 'exited');
    console.log(`  §20 (b): relaunched ${a0.id} → ${rl.app.id} in ${readyMs} ms to ready; record scale ${b1.scale} dpi ${b1.dpi} origin ${b1.scaleOrigin}; GDK_SCALE=${bEnv.GDK_SCALE}, Xft.dpi ${bDpi}; old: ${rl.replaced.state} stoppedBy ${rl.replaced.stoppedBy} replacedBy ${rl.replaced.replacedBy}; broadcasts of the old record: named at #${firstNamed}, exited at #${firstExited}`);
    ok(rl.app.id !== a0.id && b1.state === 'ready' && b1.scale === 1.5 && b1.dpi === 144 && b1.scaleOrigin === 'chosen' && b1.exec === a1.exec && JSON.stringify(b1.args) === JSON.stringify(a1.args) && b1.label === a1.label, '§20 (b): the successor is the SAME command at the CHOSEN 1.5× (144 dpi, origin chosen)', { scale: b1.scale, dpi: b1.dpi, origin: b1.scaleOrigin, state: b1.state });
    ok(bEnv.GDK_SCALE === '1' && bDpi === 144, `§20 (b): MEASURED — 1.5× is text only for GTK: GDK_SCALE=${bEnv.GDK_SCALE}, Xft.dpi ${bDpi}`);
    ok(rl.replaced.state === 'exited' && rl.replaced.stoppedBy === 'relaunch' && rl.replaced.replacedBy === rl.app.id && [a1.pids.x, a1.pids.app].every((p) => !alive(p)) && markerPids(a0.id).length === 0, '§20 (b): the old session is stopped (stoppedBy relaunch, replacedBy the successor) and nothing of it is left', { state: rl.replaced.state, stoppedBy: rl.replaced.stoppedBy, replacedBy: rl.replaced.replacedBy, left: markerPids(a0.id) });
    ok(firstNamed >= 0 && firstExited >= 0 && firstNamed <= firstExited && M.exitCloseVerdict(olds[firstExited]).why === 'relaunched', `§20 (b): every client learns the successor no later than the stop (named at broadcast #${firstNamed}, exited at #${firstExited}) — the window follows it instead of closing (${JSON.stringify(M.exitCloseVerdict(olds[firstExited] || null))})`);
    // (c) refusals by name: an ended record, an unknown scale, an unknown id
    const r1 = await k.relaunch(a0.id, { scale: 2 }).then(() => null, (e) => e.code);
    const r2 = await k.relaunch(rl.app.id, { scale: 3 }).then(() => null, (e) => e.code);
    const r3 = await k.relaunch('da-nope', { scale: 2 }).then(() => null, (e) => e.code);
    ok(r1 === 'not-ready' && r2 === 'bad-request' && r3 === 'not-found', `§20 (c): relaunch refuses by name — an ended record ${r1}, scale 3 ${r2}, an unknown id ${r3}`);
    // (d) the cap: the app being replaced does not count (a keeper at its ceiling can still change a window's scale)
    const kc = mk('k20c', { settings: { 'desktop.backendPrefs': '' }, limits: { ...M.LIMITS, CONCURRENT_CAP: 1 } });
    await kc.adoptAll(); kc.start();
    const c0 = await kc.launch({ exec: XT, args: ['-T', 'vs-a3-cap', '-geometry', '40x10'], label: 'a3-cap', dpr: 1 });
    await readyOf(kc, c0.id);
    const blocked = await kc.launch({ exec: XT, args: [], label: 'a3-cap2' }).then(() => null, (e) => e.code);
    const cr = await kc.relaunch(c0.id, { scale: 2 }).then((r) => r, (e) => ({ error: e.code }));
    ok(blocked === 'cap' && cr.app && cr.app.scale === 2 && cr.app.scaleOrigin === 'chosen', `§20 (d): at a ceiling of 1 a second launch is refused (${blocked}) yet the relaunch goes through (${cr.app ? cr.app.scale + '×' : cr.error})`);
    if (cr.app) await readyOf(kc, cr.app.id);
    kc.shutdown();
    // (e) the vnc-display rung has no scale: its record says 1× with no origin whatever the client, and a relaunch is refused by name
    const kv = mk('k20v');
    await kv.adoptAll(); kv.start();
    const v0 = await kv.launch({ exec: appBin, args: appArgs, label: 'a3-vnc', dpr: 2, uiScale: 1.25 });
    const v1 = await readyOf(kv, v0.id);
    const vr = await kv.relaunch(v0.id, { scale: 2 }).then(() => null, (e) => e.code);
    ok(v1.backend === 'vnc-display' && v1.scale === 1 && v1.scaleOrigin === null && vr === 'not-xpra', `§20 (e): a whole-display rung stays 1× with no origin (${v1.scale}, ${v1.scaleOrigin}) and its relaunch is refused (${vr})`);
    await kv.stop(v0.id); kv.shutdown();
    await k.stop(rl.app.id);
    k.shutdown();
    // (f) CONTROL — the pre-A3 keeper (the scale from the setting + dpr only): the same client gets 2× / 96 — the UI scale never reached the app
    const { mod } = mutant('prea3scale', [["const pick = opts.scaleChoice ? M.scalePick({ choice: opts.scaleChoice, dpr: v.launch.dpr, uiScale: v.launch.uiScale }) : M.scalePick({ setting: serverSetting('desktop.appScale'), dpr: v.launch.dpr, uiScale: v.launch.uiScale });", "const pick = { scale: [1, 1.5, 2].includes(Number(serverSetting('desktop.appScale'))) ? Number(serverSetting('desktop.appScale')) : (v.launch.dpr >= 1.5 ? 2 : 1), origin: null, from: null }; // pre-A3"]]);
    fs.mkdirSync(path.join(root, 'k20-ctl'), { recursive: true });
    const kx = mod.create({ dataDir: path.join(root, 'k20-ctl'), env: baseEnv, broadcast: () => {}, serverSetting: (key) => ({ ...PIN, 'desktop.backendPrefs': '', 'desktop.appScale': 'auto' })[key], backends: XVFB_TABLE, log: { log() {}, warn() {}, error() {} } });
    keepers.push(kx);
    await kx.adoptAll(); kx.start();
    const x0 = await kx.launch({ exec: XT, args: ['-T', 'vs-a3-ctl', '-geometry', '40x10'], label: 'a3-ctl', dpr: 2, uiScale: 1.25 });
    const x1 = await readyOf(kx, x0.id);
    const xDpi = xftDpiOf(kx, x1);
    const xWin = await xtermWin(kx, x0.id, 'vs-a3-ctl');
    const rw = aWin && xWin ? aWin.w / xWin.w : 0, rh = aWin && xWin ? aWin.h / xWin.h : 0;
    console.log(`  §20 (a)/(f): xterm 40×10 at 2.5× (120 dpi) ${aWin && `${aWin.w}×${aWin.h}`} vs at 2× (96 dpi) ${xWin && `${xWin.w}×${xWin.h}`} device px — ratio ${rw.toFixed(3)} × ${rh.toFixed(3)}`);
    ok(rw >= 1.15 && rw <= 1.35 && rh >= 1.15 && rh <= 1.35, `§20 (a): MEASURED the text half — the same 40×10 xterm is ${rw.toFixed(2)}× wider and ${rh.toFixed(2)}× taller at 2.5× (120 dpi) than at 2× (96 dpi): the text is drawn at 2.5×, the fraction carried by the dpi`, { aWin, xWin });
    ok(x1.scale === 2 && x1.dpi === 96 && xDpi === 96, `CONTROL: the pre-A3 pick gives the same DPR-2 / 125 % client ${x1.scale}× at Xft.dpi ${xDpi} — the (a) leg is the derivation, not a coincidence`, { scale: x1.scale, dpi: x1.dpi, xft: xDpi });
    await kx.stop(x0.id); kx.shutdown();
  }
}

// ── §tree THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\n§tree the patched copies never touch the tree');
for (const r of copiesCensus(MUTK.files, MUTK.dir, repo, { minCopies: 1 })) ok(r.pass, '§tree ' + r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(`${fail ? `\n${fail} FAILED (${pass} passed` : `\nALL PASS (${pass}`}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// THE XPRA RUNG, CLOSED (docs/design-desktop-apps.zh.md §7 P8-2 chunk x3,
// 2026-09-22): a REAL worktree server with PASSWORD AUTH ON + the REAL xpra
// (6.5.3 on this box, its own Xvfb) + a real X application, driven from node
// through the product's own routes and the ONE ws bridge — no chrome (the
// chrome half of the rung is test-desktop-xpra-window). Everything the chunk
// names, on the real server:
//   §1 bring-up over POST /api/desktop/apps: the default ladder picks xpra
//      (DA1), the record's facts, xpra's session files under the app's OWN
//      dir (`--socket-dir`/`--sessions-dir`), NO unix socket anywhere
//      (`--bind=none`), nothing under $HOME/.xpra;
//   §2 THE BINDING CHECK: the xpra listener is bound to 127.0.0.1 only
//      (/proc/net/tcp, no tcp6 row) and a raw TCP connect to this box's
//      non-loopback address on that port is REFUSED while 127.0.0.1 answers —
//      the raw port reaches a browser only through the relay; the product's
//      own port (0.0.0.0) is the control;
//   §3 relay auth on the real server: no cookie ⇒ 401, cookie + a foreign id
//      ⇒ 404, cookie + the id ⇒ 101 and a REAL hello handshake through the
//      relay (rencodeplus from the INSTALLED html5 client's rencode.js, loaded
//      into this realm) answered by xpra's hello + packet-types, then the
//      app's window as `new-window`;
//   §4 resize-follows at the protocol level: `display-configure` +
//      `configure-window` at two sizes ⇒ the server confirms and the X
//      server's own geometry (GET …/windows) agrees within one xterm cell;
//   §5 the clipboard, both branches, at the X level: a `clipboard-token` sent
//      through the relay is what `xclip -o` reads on the app's display; an
//      `xclip -i` on the display arrives as a `clipboard-token` carrying the
//      text (greedy) — or as `clipboard-contents` to our request;
//   §6 keep-alive + idle stop: `desktop.idleTimeoutMin` patched LIVE through
//      /api/settings — a fresh app dies of idle (stoppedBy idle, xpra + Xvfb +
//      app gone) while a kept-alive one launched beside it survives the same
//      wait; the first app is untouched (the timeout is stamped at launch);
//   §7 adoptAll keeps the backend a record was BORN with, across a REAL
//      restart: a vnc-display session pinned through `desktop.backendPrefs`,
//      the prefs cleared, the server SIGKILLed and rebooted ⇒ the xpra
//      records AND the vnc-display record are adopted as they were (never
//      migrated), the ladder still says xpra, a new launch takes xpra, and the
//      relay to an ADOPTED xpra session still answers a hello;
//   §8 the cap the product answers IS the imported constant
//      (src/keeper-limits.js), never a copy;
//   §9 stop everything: every recorded pid gone, the marker census empty.
// SKIPs with evidence without xpra / xauth / Xvfb / an X app (xterm, else
// gnome-calculator); the xclip legs SKIP without xclip; the non-loopback
// connect leg SKIPs on a box with no such address. Worktree-isolated (own
// data/, scratch HOME, VIBESPACE_SKIP_AGENT_HOOKS=1), free ports, per-pid
// names; every xpra this run starts is stopped through the product and the
// exit sweep reaps by EVIDENCE (the session marker / XAUTHORITY path in a
// process's environ — the identity xpra's Xvfb inherits), never by a name.
// Run: node scripts/test-desktop-xpra.mjs
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome } from './scratch.mjs';
import * as P from '../src/lib/xpra-proto.js';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require('../src/desktop-display.js');
const L = require('../src/keeper-limits.js');
const WebSocket = require('ws');
const bin = (n) => D.binOnPath(n, { env: process.env });
const XPRA = bin('xpra'), XAUTH = bin('xauth'), XVFB = bin('Xvfb'), XCLIP = bin('xclip');
const APP = bin('xterm') ? { exec: bin('xterm'), args: ['-T', 'vs-x3-title', '-geometry', '80x24'], label: 'xterm', cellW: 16, cellH: 24 } : bin('gnome-calculator') ? { exec: bin('gnome-calculator'), args: [], label: 'calc', cellW: 2, cellH: 2 } : null;
const skipWhy = !XPRA ? 'xpra not on PATH (apt install xpra)' : !XAUTH ? 'xauth not on PATH (the recipe refuses by name without it)' : !XVFB ? 'Xvfb not on PATH (xpra starts its display through it)' : !APP ? 'no X application on PATH (xterm or gnome-calculator)' : null;
if (skipWhy) { console.log(`SKIP: ${skipWhy}`); process.exit(0); }
let xpraVersion = '';
try { xpraVersion = execFileSync(XPRA, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch {}
const WWW = D.xpraWwwDir({ binPath: XPRA, env: process.env });
console.log(`box: ${xpraVersion || 'xpra ?'}, Xvfb ${XVFB}, app ${APP.exec}, xclip ${XCLIP || 'absent'}, html5 client ${WWW || 'absent'}`);

const [PORT] = await freePorts(1);
const wt = scratch('deskxpra-srv');
const home = scratchHome('deskxpra-srv-home', fs);
let failed = 0, skipped = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const skip = (n, why) => { skipped++; console.log(`  ⚠ SKIP ${n}: ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };

// ── the worktree server (password auth ON: the relay's 401 leg needs a real gate) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) { execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
const PASSWORD = 'hunter2'; // a fake, like every suite's
const srvEnv = { ...process.env, PORT: String(PORT), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: PASSWORD };
let srv = null;
const srvLog = [];
const bootServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: ['ignore', 'pipe', 'pipe'] }); srv.stdout.on('data', (d) => srvLog.push(String(d))); srv.stderr.on('data', (d) => srvLog.push(String(d))); return srv; };
bootServer();
const recordedApps = () => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(wt, 'data/desktop-apps.json'), 'utf8')).apps); } catch { return []; } };
const recordedPids = () => recordedApps().flatMap((a) => Object.values(a.pids || {})).filter(Boolean);
const appDir = (id) => path.join(wt, 'data', 'desktop-apps', id);
// the same belt test-desktop-xpra-window carries: xpra rewrites its own environ, its Xvfb and the app keep the marker / XAUTHORITY path
const markerHits = () => {
  const ids = recordedApps().map((a) => a.id).filter(Boolean);
  const needles = [...ids.map((id) => `VIBESPACE_DESKTOP_APP=${id}`), ...ids.map((id) => `XAUTHORITY=${path.join(appDir(id), 'Xauthority')}`)];
  const hit = [];
  if (!needles.length) return hit;
  for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d) || Number(d) === process.pid) continue; if (needles.some((n) => D.environHas(Number(d), n))) hit.push(Number(d)); }
  return hit;
};
const xclipKids = [];
const sockets = [];
const cleanup = () => {
  for (const s of sockets) { try { s.close(); } catch {} }
  for (const k of xclipKids) { try { process.kill(-k.pid, 'SIGKILL'); } catch {} try { k.kill('SIGKILL'); } catch {} }
  try { srv?.kill('SIGKILL'); } catch {}
  for (const p of recordedPids()) { try { process.kill(p, 'SIGKILL'); } catch {} }
  const swept = markerHits();
  for (const p of swept) { try { process.kill(p, 'SIGKILL'); } catch {} }
  if (swept.length) console.log(`  (exit sweep reaped ${swept.length} process(es) still carrying this run's marker: ${swept.join(', ')})`);
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

const ORIGIN = `http://127.0.0.1:${PORT}`;
const waitServer = async () => { for (let i = 0; i < 80; i++) { try { await fetch(`${ORIGIN}/api/home`); return true; } catch { await sleep(250); } } return false; };
let cookie = '';
const login = async () => { const r = await fetch(`${ORIGIN}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) }); const sc = r.headers.get('set-cookie') || ''; const m = /vs_token=([^;]+)/.exec(sc); cookie = m ? `vs_token=${m[1]}` : ''; return r.status === 200 && !!cookie; };
const j = async (method, p, body) => { const r = await fetch(`${ORIGIN}${p}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) }); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; };
const launch = async (extra = {}) => (await j('POST', '/api/desktop/apps', { exec: APP.exec, args: APP.args, label: APP.label, ...extra })).body;
const ready = (id, ms = 30000) => until(async () => { const r = (await j('GET', `/api/desktop/apps/${id}`)).body; return r && r.state === 'ready' ? r : r && (r.state === 'failed' || r.state === 'exited') ? (() => { throw new Error(`${id} ${r.state}: ${r.lastError}`); })() : null; }, ms, 250);
const xenvOf = (rec) => ({ ...process.env, DISPLAY: rec.display, XAUTHORITY: path.join(appDir(rec.id), 'Xauthority') });

// ── the xpra protocol from node: the INSTALLED client's rencode (+ lz4 / brotli) loaded into THIS realm ──
// (vm.runInThisContext: the libs are sloppy-mode browser scripts that define globals; a separate context
// would hand us Uint8Arrays of another realm). The hello declares no compression so the packets arrive
// plain; the decoders are still wired for the case the server ignores that.
let codec = null;
if (WWW) {
  try {
    for (const f of ['js/lib/rencode.js', 'js/lib/lz4.js', 'js/lib/brotli_decode.js']) vm.runInThisContext(fs.readFileSync(path.join(WWW, f), 'utf8'), { filename: f });
    codec = { encode: globalThis.rencode, decode: globalThis.rdecode, lz4: globalThis.lz4, brotli: globalThis.BrotliDecode };
    if (typeof codec.encode !== 'function' || typeof codec.decode !== 'function') codec = null;
  } catch (e) { console.log(`  (the installed client's codec did not load: ${e.message})`); codec = null; }
}
/** A minimal xpra client over the relay: the 8-byte header framing of Protocol.js, rencodeplus packets,
 *  raw chunks re-attached by index, pings echoed, draws acked, clipboard requests answered. */
function xpraClient(url, { width, height, headers }) {
  const ws = new WebSocket(url, ['binary'], { headers, maxPayload: 64 * 1024 * 1024 });
  sockets.push(ws);
  const events = []; const waiters = []; const raw = {};
  let buf = Buffer.alloc(0), closed = null, lastPaste = null, packetTypes = [];
  const send = (packet) => { const body = Buffer.from(codec.encode(packet)); const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 16; h[2] = 0; h[3] = 0; h.writeUInt32BE(body.length, 4); ws.send(Buffer.concat([h, body])); };
  const onPacket = (p) => {
    const type = P.bytesToString(p[0]);
    events.push({ type, p });
    if (type === 'hello') packetTypes = Array.isArray(p[1]['packet-types']) ? p[1]['packet-types'].map(P.bytesToString) : [];
    else if (type === 'ping') send(P.pingEcho(p[1], p.length >= 4 ? P.bytesToString(p[3]) : ''));
    else if (type === 'draw') { const d = P.parseDraw(p); send(P.damageAck(d.seq, d.wid, d.w, d.h, 0)); }
    else if (type === 'clipboard-request') { const reqId = p[1], selection = P.bytesToString(p[2]); send(lastPaste != null ? P.clipboardContents(reqId, selection, lastPaste) : P.clipboardNone(reqId, selection)); }
    for (const w of waiters.splice(0)) { if (!w.done && w.type === type && w.pred(p)) { w.done = true; w.res({ type, p }); } else if (!w.done) waiters.push(w); }
  };
  const parse = () => {
    while (buf.length >= 8) {
      if (buf[0] !== 0x50) { closed = `not an xpra header: ${buf[0]}`; ws.close(); return; }
      const level = buf[2], index = buf[3], size = buf.readUInt32BE(4);
      if (buf.length < 8 + size) return;
      let data = buf.subarray(8, 8 + size); buf = buf.subarray(8 + size);
      if (level & 16) data = Buffer.from(codec.lz4.decode(new Uint8Array(data)));
      else if (level & 64) data = Buffer.from(codec.brotli(new Uint8Array(data)));
      if (index > 0) { raw[index] = data; continue; }
      const packet = codec.decode(new Uint8Array(data));
      for (const [i, v] of Object.entries(raw)) packet[Number(i)] = v;
      for (const k of Object.keys(raw)) delete raw[k];
      onPacket(packet);
    }
  };
  ws.on('message', (d) => { buf = Buffer.concat([buf, Buffer.isBuffer(d) ? d : Buffer.from(d)]); parse(); });
  ws.on('close', (code, reason) => { closed = closed || `closed ${code} ${reason}`; for (const w of waiters.splice(0)) w.rej(new Error(closed)); });
  ws.on('error', (e) => { closed = closed || e.message; });
  const opened = new Promise((res, rej) => { ws.once('open', () => res(true)); ws.once('unexpected-response', (req, r) => rej(Object.assign(new Error(`HTTP ${r.statusCode}`), { status: r.statusCode }))); ws.once('error', rej); });
  const waitFor = (type, pred = () => true, ms = 10000) => { const seen = events.find((e) => e.type === type && pred(e.p)); if (seen) return Promise.resolve(seen); return new Promise((res, rej) => { const w = { type, pred, res, rej, done: false }; waiters.push(w); setTimeout(() => { if (!w.done) { w.done = true; rej(new Error(`no ${type} within ${ms} ms (closed: ${closed}; seen: ${[...new Set(events.map((e) => e.type))].join(',')})`)); } }, ms); }); };
  return {
    ws, send, opened, waitFor, events,
    get packetTypes() { return packetTypes; }, get closed() { return closed; },
    hello() { send(['hello', { ...P.helloCaps({ width, height, dpi: 96, uuid: `vs-x3-${process.pid}`, layout: 'us' }), lz4: false, brotli: false, compression_level: 0 }]); },
    setPaste(t) { lastPaste = t; },
    close() { try { ws.close(); } catch {} },
  };
}
// a NAMED pane per socket (2.369.156, LOW-3: an anonymous socket is a read-only watch seat — the suite drives like a window)
let wsSeq = 0;
const wsUrl = (id) => { wsSeq++; return `ws://127.0.0.1:${PORT}/api/desktop/${id}/stream?viewer=x3-v${wsSeq}&pane=x3-p${wsSeq}`; };
const tcpListeners = (port) => { // /proc/net/tcp + tcp6 rows in LISTEN for this port → their local addresses
  const rows = [];
  for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) { let txt = ''; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; } for (const line of txt.split('\n').slice(1)) { const c = line.trim().split(/\s+/); if (c.length < 4) continue; const [addr, hexPort] = c[1].split(':'); if (parseInt(hexPort, 16) === port && c[3] === '0A') rows.push({ file: path.basename(f), addr }); } }
  return rows;
};
const tcpConnect = (host, port, ms = 3000) => new Promise((res) => { const s = net.connect({ host, port }); const t = setTimeout(() => { s.destroy(); res({ ok: false, why: 'timeout' }); }, ms); s.once('connect', () => { clearTimeout(t); s.destroy(); res({ ok: true }); }); s.once('error', (e) => { clearTimeout(t); res({ ok: false, why: e.code || e.message }); }); });

check('worktree server boots (password auth on)', await waitServer());
check('an unauthenticated API call is refused 401 (the gate is real)', (await fetch(`${ORIGIN}/api/desktop/apps`)).status === 401);
check('login answers the cookie', await login());

let A = null, C = null, V = null, N = null;
try {
  // ── §1 bring-up ──
  console.log('§1 bring-up over the routes: the default ladder picks xpra');
  const list0 = (await j('GET', '/api/desktop/apps')).body;
  check(`GET /api/desktop/apps: availability = ${JSON.stringify({ backend: list0.availability.backend, via: list0.availability.via, recipe: list0.availability.recipe, stream: list0.availability.stream, fallbackWhy: list0.availability.fallbackWhy })}`, list0.availability.backend === 'xpra' && list0.availability.recipe === 'xpra-seamless' && list0.availability.stream === 'xpra' && list0.availability.fallbackWhy === null && Array.isArray(list0.availability.prefs) && list0.availability.prefs.length === 0, list0.availability);
  check(`the facts name the installed xpra (${list0.availability.xpra && list0.availability.xpra.version}) and its html5 tree`, !!list0.availability.xpra && /^\d+\.\d+/.test(String(list0.availability.xpra.version)) && (!WWW || list0.availability.xpra.www === WWW), list0.availability.xpra);
  const t0 = Date.now();
  A = await launch();
  check('POST /api/desktop/apps answers a launching record on xpra (stream xpra, probe http)', !!A && A.state === 'launching' && A.backend === 'xpra' && A.via === 'xpra' && A.recipe === 'xpra-seamless' && A.stream === 'xpra' && A.fallbackWhy === null, A);
  A = await ready(A.id);
  console.log(`  ${A.label} ready ${Date.now() - t0} ms after POST: display ${A.display}, port ${A.port}, pids ${JSON.stringify(A.pids)}`);
  check('the record reaches ready: ONE xpra pid is x AND server (it owns the Xvfb and the socket), the app its own pid, no WM of ours, probe http', A.state === 'ready' && A.probe === 'http' && A.pids.x > 0 && A.pids.server === A.pids.x && A.pids.app > 0 && A.pids.app !== A.pids.x && A.pids.wm === null && A.readyAt > 0, A);
  check(`GET /api/desktop/apps/:id says backend ${A.backend}, wired ${A.wired}, stream ${A.stream} (the rung's table facts laid over the record)`, A.backend === 'xpra' && A.wired === true && A.stream === 'xpra', { backend: A.backend, wired: A.wired, stream: A.stream });
  const xdir = path.join(appDir(A.id), 'xpra');
  const xdirEntries = fs.existsSync(xdir) ? fs.readdirSync(xdir) : null;
  const unixSockets = xdirEntries ? xdirEntries.filter((f) => { try { return fs.statSync(path.join(xdir, f)).isSocket(); } catch { return false; } }) : [];
  check(`xpra's session files live under the app's OWN dir (${path.relative(wt, xdir)}: ${xdirEntries ? xdirEntries.join(', ') : 'missing'}) — the scratch socket dir, never ~/.xpra`, Array.isArray(xdirEntries) && xdirEntries.some((f) => /server\.pid|\.log$|^:?\d+/.test(f)) && !fs.existsSync(path.join(home, '.xpra')), { entries: xdirEntries, homeXpra: fs.existsSync(path.join(home, '.xpra')) });
  check(`--bind=none: NO unix socket anywhere (${unixSockets.length} in the session dir, ~/.xpra absent)`, unixSockets.length === 0 && !fs.existsSync(path.join(home, '.xpra')), unixSockets);
  check('the per-app Xauthority is the pinned file (non-empty) — xpra never wrote the real ~/.Xauthority', fs.existsSync(path.join(appDir(A.id), 'Xauthority')) && fs.statSync(path.join(appDir(A.id), 'Xauthority')).size > 0 && !fs.existsSync(path.join(home, '.Xauthority')));

  // ── §2 the binding check ──
  console.log('§2 the binding check: the xpra port is loopback-only, the product port is the control');
  const xrows = tcpListeners(A.port);
  const srows = tcpListeners(PORT);
  console.log(`  xpra :${A.port} listens on ${JSON.stringify(xrows)}; the server :${PORT} on ${JSON.stringify(srows)}`);
  check(`the xpra listener is bound to 127.0.0.1 ONLY (${xrows.length} LISTEN row(s), every one 0100007F, none in tcp6)`, xrows.length >= 1 && xrows.every((r) => r.file === 'tcp' && r.addr === '0100007F'), xrows);
  check('CONTROL: the product\'s own port is bound to every address (00000000 / ::) — the box CAN listen wide, xpra just does not', srows.length >= 1 && srows.some((r) => /^0{8}$|^0{32}$/.test(r.addr)), srows);
  const outer = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  const loop = await tcpConnect('127.0.0.1', A.port);
  check('a raw TCP connect to 127.0.0.1:<port> is answered (that is the relay\'s own upstream)', loop.ok, loop);
  if (!outer) skip('a raw connect from a non-loopback address', 'this box has no non-loopback IPv4 address');
  else {
    const far = await tcpConnect(outer.address, A.port);
    check(`a raw TCP connect to ${outer.address}:${A.port} (this box's non-loopback address) is REFUSED — without the relay the picture is unreachable (${far.why || 'connected'})`, !far.ok && (far.why === 'ECONNREFUSED' || far.why === 'timeout'), far);
    const farSrv = await tcpConnect(outer.address, PORT);
    check(`CONTROL: the same connect to the product's port ${PORT} is answered`, farSrv.ok, farSrv);
  }

  // ── §3 relay auth + a real hello ──
  console.log('§3 relay auth on the real server, then a real hello through the relay');
  {
    const noCookie = xpraClient(wsUrl(A.id), { width: 640, height: 480, headers: {} });
    const st = await noCookie.opened.then(() => 'opened', (e) => e.status || e.message);
    check(`no cookie ⇒ 401 at the upgrade (got ${st})`, st === 401);
    noCookie.close();
    const foreign = xpraClient(wsUrl('da-nope-x3'), { width: 640, height: 480, headers: { Cookie: cookie } });
    const st2 = await foreign.opened.then(() => 'opened', (e) => e.status || e.message);
    check(`the cookie + a foreign id ⇒ 404 (got ${st2})`, st2 === 404);
    foreign.close();
  }
  if (!codec) skip('the protocol legs (§3 hello, §4 resize, §5 clipboard)', `no rencode.js in the installed html5 client (${WWW || 'no www dir'})`);
  else {
    const cl = xpraClient(wsUrl(A.id), { width: 640, height: 480, headers: { Cookie: cookie } });
    const st3 = await cl.opened.then(() => 'opened', (e) => e.status || e.message);
    check(`the cookie + the id ⇒ the upgrade succeeds (${st3})`, st3 === 'opened');
    cl.hello();
    const th = Date.now();
    const hello = await cl.waitFor('hello', () => true, 15000);
    const caps = hello.p[1];
    console.log(`  hello answered in ${Date.now() - th} ms: xpra ${P.bytesToString(caps.version || '')}, ${cl.packetTypes.length} packet-types, display-configure ${cl.packetTypes.includes('display-configure')}, keyboard-config ${cl.packetTypes.includes('keyboard-config')}`);
    check('xpra answers the hello through the relay with its version + packet-types (the names the client picks its packet forms by)', /^\d+\.\d+/.test(P.bytesToString(caps.version || '')) && cl.packetTypes.length > 20 && cl.packetTypes.includes('configure-window') && cl.packetTypes.includes('clipboard-token'), { version: P.bytesToString(caps.version || ''), n: cl.packetTypes.length });
    check(`the server's version equals the binary's (${P.bytesToString(caps.version || '')} vs ${xpraVersion})`, xpraVersion.includes(P.bytesToString(caps.version || '')));
    const nw = await cl.waitFor('new-window', () => true, 15000);
    const wid = nw.p[1]; const meta = nw.p[6] || {};
    const title = P.bytesToString(meta.title || '');
    console.log(`  new-window wid ${wid}: ${nw.p[4]}×${nw.p[5]} at ${nw.p[2]},${nw.p[3]}, title "${title}", class ${JSON.stringify((meta['class-instance'] || []).map(P.bytesToString))}`);
    check(`the app's window arrives as new-window with ITS title (${JSON.stringify(title)})`, wid > 0 && nw.p[4] > 0 && nw.p[5] > 0 && (APP.label !== 'xterm' || title === 'vs-x3-title'), { wid, title });

    // ── §4 resize-follows at the protocol level ──
    // MEASURED RULE (xpra 6.5.3, x11/server/seamless.py, read on this box): `do_process_window_configure`
    // clamps the requested geometry, applies it, and notifies every OTHER source — never the requester;
    // `_window_resized_signaled` → `size_notify_clients` (100–250 ms later) sends `window-move-resize` to
    // all sources ONLY when X's final geometry differs from the server's own clamp (`client-geometry`) and
    // no newer client configure arrived. So a requester hears back exactly when X CORRECTED the request
    // (xterm's cell snap on the first size below) and hears nothing when the clamp already matched X. The
    // x2 client applies its fit optimistically and takes such corrections — what this leg pins: X's own
    // geometry follows within a cell, and any correction that arrives names X's actual geometry.
    console.log('§4 resize-follows: display-configure + configure-window at two sizes, X\'s own geometry agrees');
    cl.send(P.mapWindow(wid, { x: 0, y: 0, w: nw.p[4], h: nw.p[5] }));
    await cl.waitFor('draw', (p) => p[1] === wid, 10000).catch(() => null);
    for (const [W, H] of [[640, 480], [900, 620]]) {
      const n0 = cl.events.length;
      cl.send(P.displayPacket(cl.packetTypes, { width: W, height: H, dpi: 96 }));
      cl.send(P.configureWindow(wid, { x: 0, y: 0, w: W, h: H }));
      const tr = Date.now();
      const xw = await until(async () => { const r = (await j('GET', `/api/desktop/apps/${A.id}/windows`)).body; const x = r && r.windows && r.windows.find((w) => W - w.w < APP.cellW && H - w.h < APP.cellH && w.w <= W && w.h <= H); return x || null; }, 10000, 300);
      await sleep(400); // the 100–250 ms size-notify timer, if X corrected the request
      const corrections = cl.events.slice(n0).filter((e) => (e.type === 'window-move-resize' || e.type === 'window-resized') && e.p[1] === wid).map((e) => (e.type === 'window-move-resize' ? { type: e.type, w: e.p[4], h: e.p[5] } : { type: e.type, w: e.p[2], h: e.p[3] }));
      console.log(`  ${W}×${H}: X says ${xw ? `${xw.w}×${xw.h} at ${xw.x},${xw.y}` : 'no window within a cell'} after ${Date.now() - tr} ms; the server ${corrections.length ? `corrected the requester: ${corrections.map((c) => `${c.type} ${c.w}×${c.h}`).join(', ')}` : 'sent no correction (its clamp matched X — the rule)'}`);
      check(`${W}×${H}: the X server's own geometry follows within one cell (${xw ? `${xw.w}×${xw.h}` : '?'})`, !!xw, (await j('GET', `/api/desktop/apps/${A.id}/windows`)).body);
      check(`${W}×${H}: every correction the server sent names X's actual geometry (${corrections.length} correction(s))`, !!xw && corrections.every((c) => c.w === xw.w && c.h === xw.h), { corrections, x: xw });
    }

    // ── §5 the clipboard, both branches, at the X level ──
    console.log('§5 the clipboard both ways through the relay, read/written on the display with xclip');
    if (!XCLIP) skip('the clipboard at the X level', 'xclip not on PATH');
    else {
      const xenv = xenvOf(A);
      cl.setPaste('from-the-suite');
      cl.send(P.clipboardToken('from-the-suite'));
      const xsel = await until(() => { try { const s = execFileSync(XCLIP, ['-o', '-selection', 'clipboard'], { env: xenv, encoding: 'utf8', timeout: 4000 }); return s === 'from-the-suite' ? s : null; } catch { return null; } }, 10000, 400);
      check('browser → app: a clipboard-token through the relay is what `xclip -o -selection clipboard` reads on the app\'s display', xsel === 'from-the-suite', { got: xsel, requests: cl.events.filter((e) => e.type === 'clipboard-request').length });
      const holder = spawn('sh', ['-c', `printf 'from-the-app' | ${XCLIP} -i -selection clipboard`], { env: xenv, stdio: 'ignore', detached: true }); xclipKids.push(holder);
      const tok = await cl.waitFor('clipboard-token', (p) => P.parseClipboardToken(p).text === 'from-the-app', 10000).catch(() => null);
      let text = tok ? P.parseClipboardToken(tok.p).text : null;
      if (!tok) { // a token without the data (a non-greedy server): ask for it
        const bare = cl.events.find((e) => e.type === 'clipboard-token' && P.bytesToString(e.p[1]) === 'CLIPBOARD');
        if (bare) { cl.send(['clipboard-request', 4242, 'CLIPBOARD', 'UTF8_STRING']); const c = await cl.waitFor('clipboard-contents', (p) => p[1] === 4242, 8000).catch(() => null); text = c ? P.bytesToString(c.p[6]) : null; }
      }
      check(`app → browser: \`xclip -i\` on the display arrives on the relay as a clipboard-token carrying the text (${tok ? 'greedy token' : text ? 'via clipboard-request' : 'nothing'})`, text === 'from-the-app', { text, tokens: cl.events.filter((e) => e.type === 'clipboard-token').map((e) => [P.bytesToString(e.p[1]), e.p.length]) });
      for (const k of xclipKids.splice(0)) { try { process.kill(-k.pid, 'SIGKILL'); } catch {} }
    }
    const rA = (await j('GET', `/api/desktop/apps/${A.id}`)).body;
    check('the clipboard-token counted as INPUT for the idle clock (lastInputAt moved past startedAt)', rA.lastInputAt > rA.startedAt, { lastInputAt: rA.lastInputAt, startedAt: rA.startedAt });
    cl.close();
    await sleep(300);
  }

  // ── §6 keep-alive + idle stop ──
  console.log('§6 keep-alive + idle stop (desktop.idleTimeoutMin patched live to 0.05 = 3 s; the keeper ticks every 5 s)');
  {
    const p = await j('PATCH', '/api/settings', { 'desktop.idleTimeoutMin': 0.05 });
    check('PATCH /api/settings takes the idle timeout', p.status === 200);
    const B = await launch({ label: 'idle-one' });
    C = await launch({ label: 'kept-one' });
    check('two more launches on xpra (three sessions under the cap)', B.backend === 'xpra' && C.backend === 'xpra' && B.idleTimeoutMs === 3000 && C.idleTimeoutMs === 3000, { B: B.idleTimeoutMs, C: C.idleTimeoutMs });
    const kept = await j('POST', `/api/desktop/apps/${C.id}/keep-alive`);
    check('POST …/keep-alive ⇒ idleTimeoutMs 0 (never)', kept.status === 200 && kept.body.idleTimeoutMs === 0, kept.body);
    const Bready = await ready(B.id).catch((e) => ({ error: e.message }));
    C = await ready(C.id);
    check('both reach ready', Bready && Bready.state === 'ready' && C.state === 'ready', Bready);
    const tIdle = Date.now();
    const died = await until(async () => { const r = (await j('GET', `/api/desktop/apps/${B.id}`)).body; return r && r.state === 'exited' ? r : null; }, 25000, 500);
    console.log(`  ${B.label} ${died ? `exited ${Date.now() - tIdle} ms after ready` : 'still alive after 25 s'}${died ? `: ${died.lastError}` : ''}`);
    check('no input ⇒ stopped by the idle timeout: stoppedBy idle, lastError names it', !!died && died.stoppedBy === 'idle' && /idle timeout/.test(died.lastError || ''), died);
    await sleep(500);
    check('…and its xpra (+ Xvfb) and app are gone', !!died && [died.pids.x, died.pids.app].every((pid) => !D.pidAlive(pid)) && !D.sessionCensus([Bready.pids.x], { fresh: true }).length, died && died.pids);
    const cNow = (await j('GET', `/api/desktop/apps/${C.id}`)).body;
    check(`the kept-alive session launched beside it survives the same wait (state ${cNow.state}, idle remaining ${cNow.idle && cNow.idle.remainingMs})`, cNow.state === 'ready' && cNow.idle && cNow.idle.remainingMs === null, cNow.idle);
    const aNow = (await j('GET', `/api/desktop/apps/${A.id}`)).body;
    // A was launched under the shipped default — 0 = never since 2.369.171 (owner ruling 2026-09-25) — so a keeper that
    // RE-READ the setting would now hold 3000 and have stopped it beside B
    check('the first session keeps the timeout it was launched with (stamped at launch, not re-read: the default 0 = never, not the patched 3 s)', aNow.state === 'ready' && aNow.idleTimeoutMs === A.idleTimeoutMs && A.idleTimeoutMs === 0, { was: A.idleTimeoutMs, now: aNow.idleTimeoutMs });
    await j('PATCH', '/api/settings', { 'desktop.idleTimeoutMin': null });
  }

  // ── §7 adoption across a REAL restart ──
  console.log('§7 adoptAll keeps the backend a record was born with, across a SIGKILL + reboot');
  {
    const av = (await j('GET', '/api/desktop/apps')).body.availability;
    const vncRung = av.ladder.find((r) => r.backend === 'vnc-display');
    if (!vncRung || !vncRung.ok) skip('a vnc-display session beside the xpra ones', `the vnc-display rung cannot run here: ${vncRung ? vncRung.why : 'no such rung'}`);
    else {
      const pin = await j('PATCH', '/api/settings', { 'desktop.backendPrefs': 'vnc-display, xpra, desktop-singleton' });
      const avPinned = (await j('GET', '/api/desktop/apps')).body.availability;
      check(`desktop.backendPrefs reorders the ladder for NEW launches (now ${avPinned.backend} via ${avPinned.via}, prefs ${JSON.stringify(avPinned.prefs)})`, pin.status === 200 && avPinned.backend === 'vnc-display' && avPinned.fallbackWhy === null && avPinned.prefs[0] === 'vnc-display', avPinned);
      V = await launch({ label: 'vnc-one' });
      check('the pinned launch is born on vnc-display (stream rfb)', V.backend === 'vnc-display' && V.stream === 'rfb', V);
      V = await ready(V.id);
      await j('PATCH', '/api/settings', { 'desktop.backendPrefs': null });
      const avBack = (await j('GET', '/api/desktop/apps')).body.availability;
      check('prefs cleared ⇒ the ladder is xpra-first again while the vnc-display session keeps running', avBack.backend === 'xpra' && avBack.prefs.length === 0);
    }
    const before = (await j('GET', '/api/desktop/apps')).body.apps.filter((a) => a.state === 'ready').map((a) => ({ id: a.id, backend: a.backend, x: a.pids.x, sx: a.starts.x, app: a.pids.app, port: a.port }));
    const exited = new Promise((r) => srv.once('exit', r));
    srv.kill('SIGKILL'); await exited;
    console.log(`  server SIGKILLed with ${before.length} live session(s): ${before.map((b) => `${b.id} (${b.backend})`).join(', ')}`);
    check('the sessions outlive the server (every recorded x + app pid still alive)', before.every((b) => D.pidAlive(b.x) && D.pidAlive(b.app)));
    const tb = Date.now();
    bootServer();
    check('the server reboots', await waitServer());
    if ((await j('GET', '/api/desktop/apps')).status === 401) check('re-login after the reboot', await login());
    const adopted = await until(async () => { const l = (await j('GET', '/api/desktop/apps')).body; const live = l && l.apps.filter((a) => before.some((b) => b.id === a.id)); return live && live.length === before.length && live.every((a) => a.state === 'ready' && a.adoptedAt > 0) ? live : null; }, 30000, 500);
    console.log(`  adopted ${adopted ? adopted.length : 0}/${before.length} session(s) ${Date.now() - tb} ms after the reboot`);
    check('every live session is ADOPTED at boot (ready, adoptedAt set)', !!adopted, (await j('GET', '/api/desktop/apps')).body.apps.map((a) => [a.id, a.state, a.lastError]));
    if (adopted) {
      for (const b of before) {
        const a = adopted.find((x) => x.id === b.id);
        check(`${b.id}: adopted as ${a.backend} — the backend it was BORN with (${b.backend}), same pids + starttime, same port`, a.backend === b.backend && a.pids.x === b.x && a.starts.x === b.sx && a.pids.app === b.app && a.port === b.port, { was: b, now: { backend: a.backend, pids: a.pids, starts: a.starts, port: a.port } });
      }
      const vAdopted = adopted.find((x) => x.backend === 'vnc-display');
      if (vAdopted) check('DA1: the vnc-display record was NEVER migrated to xpra although the ladder now picks xpra (stream rfb, via Xvfb+x11vnc / Xvnc)', vAdopted.backend === 'vnc-display' && vAdopted.stream === 'rfb' && /Xvnc|Xvfb\+x11vnc/.test(vAdopted.via), vAdopted);
    }
    const avAfter = (await j('GET', '/api/desktop/apps')).body.availability;
    check('after the reboot the ladder still picks xpra for NEW sessions', avAfter.backend === 'xpra' && avAfter.fallbackWhy === null);
    N = await launch({ label: 'post-reboot' });
    check('a launch after the reboot takes xpra', N.backend === 'xpra');
    N = await ready(N.id);
    if (codec) { // the relay to an ADOPTED xpra session: the stream target is the record's own port
      const cl2 = xpraClient(wsUrl(A.id), { width: 640, height: 480, headers: { Cookie: cookie } });
      const st = await cl2.opened.then(() => 'opened', (e) => e.status || e.message);
      cl2.hello();
      const h2 = st === 'opened' ? await cl2.waitFor('hello', () => true, 15000).catch((e) => ({ error: e.message })) : null;
      check(`the relay to the ADOPTED xpra session answers a hello (${st}${h2 && h2.error ? ': ' + h2.error : ''})`, st === 'opened' && !!h2 && !h2.error, h2);
      cl2.close();
    }
  }

  // ── §8 the cap is the imported number ──
  console.log('§8 the numbers the product answers are the imported constants');
  {
    const l = (await j('GET', '/api/desktop/apps')).body;
    check(`cap.cap === keeper-limits.CONCURRENT_CAP (${l.cap.cap} === ${L.CONCURRENT_CAP}), used ${l.cap.used}`, l.cap.cap === L.CONCURRENT_CAP && l.cap.used === l.apps.filter((a) => a.state === 'ready' || a.state === 'launching').length, l.cap);
  }

  // ── §9 stop everything ──
  console.log('§9 stop through the product: every pid gone, the marker census empty');
  {
    const live = (await j('GET', '/api/desktop/apps')).body.apps.filter((a) => a.state === 'ready' || a.state === 'launching');
    for (const a of live) {
      const r = await j('POST', `/api/desktop/apps/${a.id}/stop`);
      check(`stop ${a.id} (${a.backend}) ⇒ exited by user`, r.status === 200 && r.body.state === 'exited' && r.body.stoppedBy === 'user', r.body && r.body.lastError);
    }
    await sleep(800);
    const still = recordedPids().filter((p) => D.pidAlive(p));
    check(`every recorded pid is gone (${recordedPids().length} recorded, ${still.length} alive)`, still.length === 0, still);
    const hits = markerHits();
    check(`the marker census is EMPTY — no process carries this run's session marker or XAUTHORITY path (${hits.length})`, hits.length === 0, hits);
    check('no session left in the store as live', (await j('GET', '/api/desktop/apps')).body.apps.every((a) => a.state === 'exited' || a.state === 'failed'));
  }
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
  console.error('  server log tail:', srvLog.join('').split('\n').slice(-15).join('\n  '));
}
console.log(failed ? `\n${failed} FAILED${skipped ? ` (${skipped} skipped)` : ''}` : `\ndesktop-xpra (server) test passed${skipped ? ` (${skipped} skipped)` : ''}`);
process.exit(failed ? 1 : 0);

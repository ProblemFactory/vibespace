#!/usr/bin/env node
// THE BROWSERS REACH A TAILNET HOST BY NAME (lane tailnet-names, 2026-11-05 — userW: «装了 Tailscale 插件，https://<host>:8006/
// 无法解析»). In-process, a MINTED table (two peers + Self; no real tailnet, no real Tailscale), loopback servers on port 0,
// the suite's own name/address seams (`lookup`, `dial` — nothing leaves loopback, no real DNS). ROUND 2: THE ROAD IS ADDED,
// NEVER A GATE — only a current device goes through Tailscale; the words only explain a failure, by its cause:
//   ① THE DOOR (src/server/tailnet-door.js): the PAC served LIVE (evaluated) — the devices + Self (+ their addresses in
//      userspace), everything else DIRECT; served to a loopback Host only, nosniff; the kernel door — a device's NAME from the
//      table (Self too), a name it does not list dialled by DNS (never a 403), an address / loopback refused, once in the
//      console for 50 tries; an upstream failure answered by its cause (the refused port); launch() and its kept port;
//   ② THE REAL KEEPER over the fake agent-browser (the driver's road): the launch config + EVERY later call carry the switch,
//      the stamp; the plugin off; a profile's own proxy, the person's config proxy AND an ENV proxy WIN (no PAC beside them);
//      a conversation's own browser; the attach road's builder;
//   ③ THE IN-PAGE BROWSER (/proxy — the real node-unblocker, the door's keep-alive agents): kernel ⇒ the device's name from the
//      table; userspace ⇒ the plugin's HTTP proxy (a stub sees ONLY the device); the acceptance's FOUR cases load as on the
//      base (no plugin: a Funnel name, 100.70.1.2; the plugin stopped: a LAN short name; kernel + the row off: a 100.x
//      address) and a Funnel name while up; the person's own device while the road is down and a name no device holds ⇒
//      LAW 2's page AFTER the ordinary road failed (the owner's language, the error's own text under it); a self-signed device
//      ⇒ the certificate sentence, a refused port ⇒ the port sentence; a public host's failure ⇒ the base's own error; 5
//      requests ⇒ ONE upstream connection;
//   ④ the agent's navigate answer (the audit route, the CLI: the net::ERR_* cause, never the device list) + the console (a
//      flapping plugin: one line per profile + reason);
//   ROUND 3: THE DOOR IS NEVER A WAY BACK INTO THE HUB — a name resolving to loopback (localhost.localdomain, GET and CONNECT),
//      to the metadata address, to this hub's own address, a name with ONE loopback answer among public ones: refused, the
//      hub-bound server never reached; IT LISTENS ONLY WHILE THE ROAD IS ON — absent at a boot with the plugin down, open on its
//      kept port + token when the plugin starts, closed with the row off, closed at the first request after a silent death;
//      the PAC 404 without its token (the token never in a console line); a launch while signed out carries no PAC; a launch
//      and its PAC share ONE wait for a hung status read (fresh() once); the certificate page's detail line is a person's (the
//      code + plain words — no Node hint); a bare label in the in-page browser keeps the base's error;
//   ROUND 4: a PAC asked while the road is off is ANSWERED (a clean 404), then the door closes; a verdict still pending when its
//      client resets / the door is cut dials nothing (no upstream, no fd left); the PAC token in no keeper view (list(),
//      statusFor) nor the profile route; the detail line keeps a host's own «node» / «--» and drops Node's hint by its words;
//      the wiring is ONE follow(plugins) (its runs: test-tailscale-dns ④b over the real settings store);
//   ROUND 5: a request the road went off under while its name was looked up is ANSWERED — the 403 in the person's words (the
//      owner's language, the input that is off), nothing dialled — and the door closes AFTER it; a GET whose client leaves
//      after the dial ends its upstream and is never the device's failure (the words keep the browser's own code; the shared
//      proxy counts no error); the road-off words are plain («reaching Tailscale devices from browsers is off»);
//   ⑤ MUTANTS (copies outside the tree): the system resolver · every host through the HTTP proxy · THE r1 GATE · keep-alive
//      off · the refusing door · a console line per request · the keeper's calls without the stamp · the env proxy ignored ·
//      r3: no vet · a boot blind to the road · a door that never closes · a guessable PAC path · a second wait · Node's raw
//      detail · r4: the PAC reset by the door's own cut · a dial for a client that is gone · r3's «node» filter · the token in
//      a keeper view · r5: the cut before the refusal · no re-read after the lookup · a cancelled request booked as the
//      device's failure · the upstream left when its client goes — each turns its leg RED.
// Run: node scripts/test-tailnet-browsers.mjs   (in-process; the shared fake agent-browser; no real browser)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1400) : ''}`); } return !!cond; };
let fake = null;
const done = () => { try { fake && fake.reap(); } catch { } console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }; // reaped BEFORE exit: the scratch dir (its launch log) goes first at exit
let DOOR = null, TR = null;
try { DOOR = require('../src/server/tailnet-door.js'); TR = require('../src/tailnet-reach.js'); } catch (e) { DOOR = null; }
if (!DOOR) { ok('src/server/tailnet-door.js + src/tailnet-reach.js exist (the browsers\' road to a tailnet host)', false, 'missing — a tailnet name opened in a browser here cannot be resolved'); done(); }
const V = require('../src/browser-verbs.js');
const AT = require('../src/browser-attach.js');

const ROOT = scratch('tailnet-browsers');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const servers = new Set();
fake = writeFakeAgentBrowser(path.join(ROOT, 'bin'), path.join(ROOT, 'ab-state'));
process.on('exit', () => { try { fake.reap(); } catch { } for (const s of servers) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
const listen = (srv) => new Promise((r) => { servers.add(srv); srv.listen(0, '127.0.0.1', () => r(srv.address().port)); });
const quietLog = { log() { }, warn() { }, error() { } };

// ── the minted tailnet: a «device» served on loopback (Self shares it), a «public» host, a self-signed device, a closed port,
//    the plugin's HTTP proxy as a CONNECT stub ──
const SUF = 'tail-mint.ts.net', PEER_IP = '100.101.1.2', SELF_IP = '100.101.1.1', FUNNEL = 'app.tail9999.ts.net', FUNNEL_D = 'web.tail9999.ts.net', CGNAT = '100.70.1.2';
const peerHits = [];
const PEER_PORT = await listen(http.createServer((req, res) => { peerHits.push(req.headers.host); res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(`PEER-OK ${req.headers.host}`); }));
let pubConns = 0;
const pubSrv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('PUBLIC-OK'); });
pubSrv.on('connection', () => { pubConns++; });
const PUB_PORT = await listen(pubSrv);
let TLS_PORT = 0, tlsConns = 0;
try {
  const key = path.join(ROOT, 'k.pem'), crt = path.join(ROOT, 'c.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=peer-alpha', '-addext', 'subjectAltName=DNS:peer-alpha'], { stdio: 'ignore', timeout: 10000 });
  const ts = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => { res.end('TLS-OK'); });
  ts.on('connection', () => { tlsConns++; });
  TLS_PORT = await listen(ts);
} catch { TLS_PORT = 0; }
const CLOSED = await (async () => { const s = net.createServer(); const p = await new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port))); await new Promise((r) => s.close(r)); return p; })();
const stubSeen = [];
const stub = http.createServer((req, res) => { res.writeHead(405); res.end(); });
stub.on('connect', (req, sock) => { stubSeen.push(req.url); const up = net.connect(PEER_PORT, '127.0.0.1', () => { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.pipe(sock); sock.pipe(up); }); up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy()); });
const HTTP_PROXY_PORT = await listen(stub);
const PEERS = [{ name: `peer-alpha.${SUF}`, short: 'peer-alpha', ips: [PEER_IP] }, { name: `peer-beta.${SUF}`, short: 'peer-beta', ips: ['100.101.1.3'] }];
const SELF = { name: `hub.${SUF}`, short: 'hub', ips: [SELF_IP] };
const R = { up: true, mode: 'userspace', state: 'Running', loggedIn: true, browsers: true, peers: PEERS, self: SELF, suffix: SUF, known: [...PEERS, SELF], at: 1, stale: false, ports: { socks: 1055, http: HTTP_PROXY_PORT } };
const KERNEL = { ...R, mode: 'kernel' };
const STOPPED = { ...R, up: false, mode: null, loggedIn: false, peers: [], self: null };
let reachNow = { ...R };
// THE SUITE'S SEAMS (production has neither): `lookup` = DNS — the in-page browser's ordinary-road names (a Funnel name, a LAN
// name) answer loopback; the door's names answer public TEST-NET addresses (an unlisted *.<suffix> name, a door Funnel name) and
// the attack names loopback / the metadata address / this hub's own address / a mixed answer; `dial` = the network: EVERY
// address or name the door / the in-page road is handed ends on loopback (the port picks the server) — even an older door or a
// mutant that dials what it should have refused never leaves this machine, and no name reaches a real resolver
const ADDR = { [FUNNEL]: '127.0.0.1', nas: '127.0.0.1', [FUNNEL_D]: '203.0.113.10', [`ghost.${SUF}`]: '203.0.113.11', 'localhost.localdomain': '127.0.0.1', 'meta.example.test': '169.254.169.254', 'mine.example.test': '10.88.0.5', 'mixed.example.test': ['203.0.113.12', '127.0.0.1'] };
const OWN = ['10.88.0.5']; // «this hub's own interface addresses» (the ownAddrs seam)
const dial = () => '127.0.0.1';
const lookup = (h, o, cb) => { const v = ADDR[String(h).toLowerCase()]; if (!v) return cb(Object.assign(new Error(`getaddrinfo ENOTFOUND ${h}`), { code: 'ENOTFOUND', hostname: h })); const as = [].concat(v); return o && o.all ? cb(null, as.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))) : cb(null, as[0], 4); };
const mkDoor = (dataDir, extra = {}, D = DOOR) => D.create({ dataDir, reach: () => reachNow, dial, lookup, ownAddrs: () => OWN, cacheMs: 0, log: quietLog, ...extra });
// THE HUB: a server bound to 127.0.0.1 the door must never reach through a name
let hubHits = 0;
const HUB_PORT = await listen(http.createServer((req, res) => { hubHits++; res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('HUB-SECRET-PAGE'); }));
const get = (port, { method = 'GET', pathName = '/', host } = {}) => new Promise((resolve) => { const r = http.request({ host: '127.0.0.1', port, method, path: pathName, headers: host ? { host } : {} }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], headers: res.headers, body: b })); }); r.on('error', (e) => resolve({ status: 0, body: e.message })); r.end(); });
const connectVia = (port, target) => new Promise((resolve) => { const s = net.connect(port, '127.0.0.1', () => s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`)); let b = ''; s.on('data', (d) => { b += d; if (/\r\n\r\n/.test(b)) { if (/^HTTP\/1\.1 200/.test(b)) { s.write(`GET / HTTP/1.1\r\nHost: ${target}\r\nConnection: close\r\n\r\n`); s.on('end', () => resolve(b)); } else { s.destroy(); resolve(b); } s.removeAllListeners('data'); s.on('data', (d2) => { b += d2; }); } }); s.on('error', (e) => resolve('ERR ' + e.message)); setTimeout(() => { s.destroy(); resolve(b); }, 4000); });
/** the PAC evaluated (a broken / missing one — a base without the door's PAC — is a named ✗, never a crash) */
function evalPac(text) {
  const ip4 = (s) => s.split('.').map(Number);
  try { return new Function('dnsDomainIs', 'isInNet', `${text}\nreturn FindProxyForURL;`)((h, d) => String(h).endsWith(d), (h, n, m) => { const a = ip4(h), b = ip4(n), c = ip4(m); return a.every((x, i) => (x & c[i]) === (b[i] & c[i])); }); } catch (e) { return () => `NO PAC (${String(text).slice(0, 60)})`; }
}
/** the door's PAC path (its token — a base / r2 door has none: its old path, so it reds by name) */
const pacPathOf = (d) => { try { return new URL(d.url()).pathname; } catch { return '/tailnet.pac'; } };
const pacOf = async (d) => evalPac((await get(d.port(), { pathName: pacPathOf(d) })).body);
/** the kernel door's N2 facts (the refusing-door mutant reuses it): Self, a name it does not list, a Funnel name, an address */
async function driveDoor(d) {
  reachNow = { ...KERNEL };
  await d.ensure();
  const out = { self: await connectVia(d.port(), `hub.${SUF}:${PEER_PORT}`), ghost: await connectVia(d.port(), `ghost.${SUF}:${PUB_PORT}`), funnel: await connectVia(d.port(), `${FUNNEL_D}:${PUB_PORT}`), addr: await connectVia(d.port(), `127.0.0.1:${PEER_PORT}`) };
  reachNow = { ...R };
  return out;
}
/** r3 N2: the names that would lead back into the hub (the no-vet mutant reuses it) */
async function driveAttack(d) {
  reachNow = { ...KERNEL };
  await d.ensure();
  const h0 = hubHits;
  const out = { get: await get(d.port(), { pathName: `http://localhost.localdomain:${HUB_PORT}/x`, host: `localhost.localdomain:${HUB_PORT}` }), connect: await connectVia(d.port(), `localhost.localdomain:${HUB_PORT}`),
    meta: await connectVia(d.port(), `meta.example.test:${HUB_PORT}`), mine: await connectVia(d.port(), `mine.example.test:${HUB_PORT}`), mixed: await connectVia(d.port(), `mixed.example.test:${HUB_PORT}`), funnel: await connectVia(d.port(), `${FUNNEL_D}:${PUB_PORT}`) };
  out.hubHits = hubHits - h0;
  reachNow = { ...R };
  return out;
}
/** r3 N2: the door's life follows the road (the boot-blind / never-closes mutants reuse it) */
async function driveLife(D) {
  const DL = fs.mkdtempSync(path.join(ROOT, 'life-'));
  reachNow = { ...R };
  const d1 = mkDoor(DL, {}, D); await d1.launch({ label: 'Life' }); const port0 = d1.port(), url0 = d1.url(), p0 = pacPathOf(d1); await d1.close();
  const reach = async (port, pathName) => (await get(port, { pathName })).status;
  reachNow = { ...STOPPED };
  const d2 = mkDoor(DL, {}, D); const b = d2.boot();
  if (b && b.then) await b; else for (let i = 0; i < 100 && !d2.port(); i++) await new Promise((r) => setTimeout(r, 5)); // r2's boot() listens in the background
  const out = { port0, bootDown: d2.port(), bootDownGet: await reach(port0, p0) };
  reachNow = { ...R }; if (d2.sync) await d2.sync();
  out.up = d2.port(); out.upUrl = d2.url(); out.url0 = url0; out.upGet = await reach(port0, p0);
  reachNow = { ...R, browsers: false }; if (d2.sync) await d2.sync();
  out.rowOff = d2.port(); out.rowOffGet = await reach(port0, p0);
  reachNow = { ...R }; if (d2.sync) await d2.sync();
  out.again = d2.port();
  reachNow = { ...STOPPED }; // the daemon died without a word: no sync — the first request finds the road off
  out.silent = await connectVia(port0, `peer-alpha:${PEER_PORT}`);
  if (d2.sync) await d2.sync();
  out.silentAfter = d2.port();
  await d2.close();
  reachNow = { ...R };
  return out;
}
/** r3 N5: a stale table whose status read hangs → the launch + the PAC its Chrome fetches right after (the second-wait mutant reuses it) */
const SETTLE_MS = 120;
async function driveHung(D) {
  let calls = 0;
  const d = mkDoor(null, { reach: () => ({ ...R, stale: true, at: Date.UTC(2026, 10, 5, 9, 30) }), fresh: () => { calls++; return new Promise(() => { }); }, settleMs: SETTLE_MS }, D);
  const t0 = Date.now();
  const v = await d.launch({ label: 'Hung' });
  const pac = d.port() ? await get(d.port(), { pathName: pacPathOf(d) }) : { status: 0, body: '' };
  const took = Date.now() - t0;
  await d.close();
  return { v, pac, took, calls };
}
/** 50 tries at a refused target → the door's console lines (the per-request mutant reuses it) */
async function floodLines(D) {
  const lines = [];
  const d = mkDoor(null, { log: { log: (l) => lines.push(l) } }, D);
  await d.ensure();
  await Promise.all(Array.from({ length: 50 }, () => connectVia(d.port(), `127.0.0.1:${PEER_PORT}`))); // a page's 50 resources at once
  await d.close();
  return lines.filter((l) => /refused/.test(l));
}

/** r4 N3: a PAC asked while the road is off (a daemon that died without a word) → its answer + the door after it (the reset-PAC
 *  mutant reuses it) */
async function drivePacOff(D) {
  const d = mkDoor(null, {}, D);
  reachNow = { ...R }; await d.launch({ label: 'PAC off' });
  const pathName = pacPathOf(d), port0 = d.port();
  reachNow = { ...STOPPED };
  const g = await get(port0, { pathName });
  for (let i = 0; i < 100 && d.port(); i++) await new Promise((r) => setTimeout(r, 5)); // it closes once the answer is out
  const out = { status: g.status, body: g.body, after: d.port(), port0 };
  reachNow = { ...R }; await d.close();
  return out;
}
// r4 N2: an upstream that only counts its live connections (a leaked dial stays in it)
const upLive = new Set();
let upSeen = 0;
const upSrv = net.createServer((c) => { upSeen++; upLive.add(c); c.on('close', () => upLive.delete(c)); c.on('error', () => { }); });
const UP_PORT = await listen(upSrv);
const fdCount = () => { try { return fs.readdirSync('/proc/self/fd').length; } catch { return -1; } };
const turns = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
/** r4 N2: a verdict still pending (its name's lookup held) when its client resets (CONNECT, absolute GET) or the door is cut →
 *  the dials made after the verdict + the upstream's live connections + this process's fds (the dial-gone mutant reuses it) */
async function driveGone(D) {
  const out = {};
  for (const how of ['connect-reset', 'get-reset', 'connect-cut']) {
    let release = null, asked = 0;
    const dials = [];
    const d = mkDoor(null, { dial: (to) => { dials.push(to); return '127.0.0.1'; }, lookup: (h, o, cb) => { if (String(h) === 'slow.example.test') { asked++; release = () => cb(null, [{ address: '203.0.113.13', family: 4 }]); return undefined; } return lookup(h, o, cb); } }, D);
    reachNow = { ...KERNEL };
    await d.ensure();
    const live0 = upLive.size, seen0 = upSeen, fd0 = fdCount();
    const s = net.connect(d.port(), '127.0.0.1', () => s.write(how === 'get-reset' ? `GET http://slow.example.test:${UP_PORT}/ HTTP/1.1\r\nHost: slow.example.test:${UP_PORT}\r\n\r\n` : `CONNECT slow.example.test:${UP_PORT} HTTP/1.1\r\nHost: slow.example.test:${UP_PORT}\r\n\r\n`));
    s.on('error', () => { });
    for (let i = 0; i < 100 && !asked; i++) await new Promise((r) => setTimeout(r, 2)); // the verdict is being asked (the lookup held; an older door asks none)
    // an older door's close() has no cut — it would wait on the open tunnel for ever: bounded (the tip's resolves at once)
    if (how === 'connect-cut') await Promise.race([d.close(), new Promise((r) => setTimeout(r, 300))]); else { s.resetAndDestroy(); await turns(4); } // the door's side has read the reset
    if (release) release();
    await turns(4);
    if (dials.length) { for (let i = 0; i < 100 && upSeen === seen0; i++) await new Promise((r) => setTimeout(r, 2)); await turns(4); } // a dial made: its upstream arrives
    out[how] = { asked, dials: dials.length, arrived: upSeen - seen0, live: upLive.size - live0, fds: fdCount() - fd0 };
    try { s.destroy(); } catch { }
    await Promise.race([d.close(), new Promise((r) => setTimeout(r, 300))]);
  }
  reachNow = { ...R };
  return out;
}
const until = async (cond, ms = 200) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 1)); return cond(); };
/** r5 m2: the road goes off WITHOUT a word (a daemon that died; the row off, unheard) while a name the PAC listed is looked up →
 *  what the client reads + the dials + the door after it (the refusal-cut / no-reread mutants reuse it) */
async function driveMidLookup(D) {
  const out = {};
  for (const [how, off, lang] of [['get', STOPPED, 'en'], ['connect', { ...KERNEL, browsers: false }, 'zh']]) {
    let release = null, asked = 0;
    const dials = [], name = `left.${SUF}`;
    const d = mkDoor(null, { lang: () => lang, dial: (to) => { dials.push(to); return '127.0.0.1'; }, lookup: (h, o, cb) => { if (String(h) === name) { asked++; release = () => cb(null, [{ address: '203.0.113.14', family: 4 }]); return undefined; } return lookup(h, o, cb); } }, D);
    reachNow = { ...KERNEL };
    await d.ensure();
    let b = '', closed = false;
    const s = net.connect(d.port(), '127.0.0.1', () => s.write(how === 'get' ? `GET http://${name}:${UP_PORT}/ HTTP/1.1\r\nHost: ${name}:${UP_PORT}\r\n\r\n` : `CONNECT ${name}:${UP_PORT} HTTP/1.1\r\nHost: ${name}:${UP_PORT}\r\n\r\n`));
    s.on('data', (x) => { b += x; }); s.on('error', () => { }); s.on('close', () => { closed = true; });
    await until(() => asked > 0); // its name is being looked up (held)
    reachNow = { ...off }; // no sync(): nothing said it
    if (release) release();
    await until(() => closed || dials.length > 0); // the answer reaches the client (or the cut, or a dial)
    await until(() => !d.port() || dials.length > 0, 100); // then the door closes
    out[how] = { asked, status: b.split('\r\n')[0] || '(nothing)', body: b.split('\r\n\r\n').slice(1).join(''), dials: dials.length, after: d.port() };
    try { s.destroy(); } catch { }
    reachNow = { ...R };
    await Promise.race([d.close(), new Promise((r) => setTimeout(r, 300))]);
  }
  return out;
}
// r5 m1: a device that holds every request (never answers); '/drop' ends it unanswered — the device's own failure (the control)
const held = new Set();
let heldGot = 0;
const HOLD_PORT = await listen(http.createServer((req, res) => { heldGot++; if (req.url === '/drop') { req.socket.destroy(); return; } held.add(res); res.on('close', () => held.delete(res)); }));
/** r5 m1: an absolute GET to a device through the door, its client gone AFTER the dial and before the device answered (the browser
 *  cancelled it) → the upstream left + the words the door then gives for that device's tunnel error; '/drop' = the device
 *  failing (the control); the shared proxy as the engine's egress (no failed hook) → its error count (the gone-failure /
 *  get-upstream mutants reuse it). `patience` = how long an upstream may take to end after its client left: the real proxy
 *  ends it in ~2 ms (given 200); the get-upstream mutant has no path that ever ends it (judged after 20) */
async function driveCancel(D, EP, patience = 200) {
  const out = {};
  const cancel = async (port, host, how) => {
    const got0 = heldGot;
    let b = '';
    const s = net.connect(port, '127.0.0.1', () => s.write(`GET http://${host}:${HOLD_PORT}/${how === 'drop' ? 'drop' : 'slow'} HTTP/1.1\r\nHost: ${host}:${HOLD_PORT}\r\n\r\n`));
    s.on('data', (x) => { b += x; }); s.on('error', () => { });
    await until(() => heldGot > got0); // the device has the request
    if (how === 'leave') { s.destroy(); await until(() => held.size === 0, patience); } else await until(() => /^HTTP/.test(b));
    await turns(4);
    const live = held.size;
    for (const r of held) { try { r.socket.destroy(); } catch { } }
    try { s.destroy(); } catch { }
    return { got: heldGot - got0, live, said: b.split('\r\n')[0] || '(nothing)' };
  };
  for (const how of ['leave', 'drop']) {
    const d = mkDoor(null, {}, D);
    reachNow = { ...KERNEL };
    await d.ensure();
    const c = await cancel(d.port(), 'peer-alpha', how);
    const m = d.missFor(`https://peer-alpha:${HOLD_PORT}/`, { failed: true, cause: 'ERR_TUNNEL_CONNECTION_FAILED', launched: { arg: 'x', mode: 'kernel', why: null } });
    out[how] = { ...c, words: m && m.text };
    reachNow = { ...R };
    await Promise.race([d.close(), new Promise((r) => setTimeout(r, 300))]);
  }
  const px = EP.create({ allow: () => ({ allow: true }), resolve: () => '127.0.0.1', log: quietLog });
  const c = await cancel(await px.listen(), 'dev.example.test', 'leave');
  out.engine = { ...c, errors: px.stats.errors, allowed: px.stats.allowed };
  await px.close({ cut: true });
  return out;
}
/** r4 N5: an error's detail line for a person — a host's own «node» / «--» kept, Node's hint dropped (the hint-filter mutant reuses it) */
const detailsOf = (D) => {
  const pd = typeof D.plainDetail === 'function' ? D.plainDetail : null;
  if (!pd) return null;
  return [
    pd({ code: 'ERR_TLS_CERT_ALTNAME_INVALID', message: "Hostname/IP does not match certificate's altnames: Host: pve-node-2. is not in the cert's altnames: DNS:pve" }),
    pd({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND node-3' }),
    pd({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND xn--bcher-kva.tail-mint.ts.net' }),
    pd({ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: 'unable to verify the first certificate; if the root CA is installed locally, try running Node.js with --use-system-ca' }),
  ];
};

console.log('① the tailnet door (the PAC, the kernel door, its kept port)');
const D1 = path.join(ROOT, 'data-door'); fs.mkdirSync(D1, { recursive: true });
const doorLines = [];
const door = mkDoor(D1, { log: { log: (l) => doorLines.push(l) } });
let ARG = null;
{
  const off0 = await mkDoor(path.join(ROOT, 'never')).launch({ explicit: true, label: 'Own' });
  ok('launch(): an EXPLICIT proxy wins — off:explicit-proxy, no switch, no door started for it', off0.on === false && off0.why === 'explicit-proxy' && off0.arg === null && !fs.existsSync(path.join(ROOT, 'never', DOOR.STATE_FILE)), off0);
  const v = await door.launch({ label: 'Work' });
  ARG = v.arg;
  ok('launch(): plugin up ⇒ on, its mode, THE switch --proxy-pac-url=http://127.0.0.1:<the door>/tailnet-<token>.pac (comma-free; r3: a random 128-bit token)', v.on && v.mode === 'userspace' && !!v.arg && v.arg === `--proxy-pac-url=${door.url()}` && new RegExp(`^--proxy-pac-url=http://127\\.0\\.0\\.1:${door.port()}/tailnet-[0-9a-f]{32}\\.pac$`).test(v.arg) && !v.arg.includes(','), v);
  const token = (/tailnet-([0-9a-f]{32})\.pac/.exec(String(v.arg)) || [])[1] || 'none';
  const guess = await Promise.all(['/tailnet.pac', `/tailnet-${'0'.repeat(32)}.pac`, '/', `/tailnet-${token}.pac/x`].map((p) => get(door.port(), { pathName: p })));
  const st = (() => { try { return fs.statSync(path.join(D1, DOOR.STATE_FILE)); } catch { return null; } })();
  ok('r3 N2 — the PAC is on its TOKEN path only: /tailnet.pac, a wrong token, any other path ⇒ 404 (no device name); the token kept with the port in data/tailnet-door.json 0600, never in a console line',
    guess.every((g) => g.status === 404 && !/peer-alpha/.test(g.body)) && !!st && (st.mode & 0o777) === 0o600 && doorLines.length > 0 && !doorLines.some((l) => l.includes(token)), { guess: guess.map((g) => g.status), lines: doorLines });
  const so = await (async () => { const was = reachNow; reachNow = { ...R, loggedIn: false, state: 'NeedsLogin' }; const x = await door.launch({ label: 'Signed out' }); reachNow = was; return x; })();
  ok('r3 N3 — a launch while Tailscale is signed out carries NO PAC (Chrome would keep an empty one for its life): off, why signed-out, no switch', so.on === false && so.why === 'signed-out' && so.arg === null, so);
  const pac = await get(door.port(), { pathName: pacPathOf(door) });
  const F = evalPac(pac.body);
  ok('GET /tailnet.pac (userspace): served LIVE — the devices\' names + addresses AND Self ⇒ SOCKS5 127.0.0.1:1055; nosniff (never a script a page can include)',
    pac.status === 200 && /x-ns-proxy-autoconfig/.test(pac.type) && pac.headers['x-content-type-options'] === 'nosniff' && F('', 'peer-alpha') === 'SOCKS5 127.0.0.1:1055' && F('', `peer-beta.${SUF}`) === 'SOCKS5 127.0.0.1:1055' && F('', PEER_IP) === 'SOCKS5 127.0.0.1:1055' && F('', `hub.${SUF}`) === 'SOCKS5 127.0.0.1:1055', pac);
  ok('GET /tailnet.pac (userspace): N2 — a Funnel / other-tailnet name, an unlisted *.<suffix> name, a CGNAT non-device, a public host, a loopback ⇒ DIRECT (no blanket *.ts.net rule)',
    F('', FUNNEL) === 'DIRECT' && F('', `ghost.${SUF}`) === 'DIRECT' && F('', CGNAT) === 'DIRECT' && F('', 'example.com') === 'DIRECT' && F('', '127.0.0.1') === 'DIRECT', [F('', FUNNEL), F('', `ghost.${SUF}`)]);
  const rebind = await get(door.port(), { pathName: pacPathOf(door), host: 'attacker.example' });
  ok('the PAC is served to a loopback Host only (a DNS-rebinding page asking as attacker.example gets 421, no names)', rebind.status === 421 && !/peer-alpha/.test(rebind.body), rebind);
  reachNow = { ...KERNEL };
  const KF = await pacOf(door);
  ok('GET /tailnet.pac (kernel): the devices\' NAMES (Self too) ⇒ PROXY 127.0.0.1:<this door>; an address and a Funnel name ⇒ DIRECT', KF('', 'peer-alpha') === `PROXY 127.0.0.1:${door.port()}` && KF('', `hub.${SUF}`) === `PROXY 127.0.0.1:${door.port()}` && KF('', PEER_IP) === 'DIRECT' && KF('', FUNNEL) === 'DIRECT');
  const h0 = peerHits.length;
  const g = await get(door.port(), { pathName: `http://peer-alpha:${PEER_PORT}/x`, host: `peer-alpha:${PEER_PORT}` });
  const c = await connectVia(door.port(), `peer-alpha.${SUF}:${PEER_PORT}`);
  ok('the kernel door: a device NAME (bare, absolute GET; FQDN, CONNECT) is resolved from the plugin\'s table and dialled — the device answers', g.status === 200 && g.body === `PEER-OK peer-alpha:${PEER_PORT}` && /200 Connection Established[\s\S]*PEER-OK/.test(c) && peerHits.length === h0 + 2, { g, c });
  const dd = await driveDoor(door);
  ok('N2 — the kernel door: THIS machine\'s own name (Self) is a device and loads; a name the table does not list (a PAC older than a table change) and a Funnel name are dialled by DNS — never a 403; an address / loopback target is refused by name',
    /200 Connection Established[\s\S]*PEER-OK hub\./.test(dd.self) && /200 Connection Established[\s\S]*PUBLIC-OK/.test(dd.ghost) && /200 Connection Established[\s\S]*PUBLIC-OK/.test(dd.funnel) && /^HTTP\/1\.1 403/.test(dd.addr) && /not a tailnet name/.test(dd.addr), dd);
  const at = await driveAttack(door);
  ok('r3 N2 — NEVER A WAY BACK INTO THE HUB: a name that resolves to loopback (localhost.localdomain — absolute GET and CONNECT), to the metadata address, to this hub\'s own address, a name with ONE loopback answer among public ones ⇒ 403 by name; the hub-bound server never reached; a public (Funnel) name still loads',
    at.get.status === 403 && /resolves to 127\.0\.0\.1 — a loopback address/.test(at.get.body) && /^HTTP\/1\.1 403/.test(at.connect) && /a loopback address/.test(at.connect) && /^HTTP\/1\.1 403/.test(at.meta) && /a cloud metadata address/.test(at.meta)
      && /^HTTP\/1\.1 403/.test(at.mine) && /this machine's own addresses/.test(at.mine) && /^HTTP\/1\.1 403/.test(at.mixed) && at.hubHits === 0 && /200 Connection Established[\s\S]*PUBLIC-OK/.test(at.funnel),
    { get: at.get.status + ' ' + at.get.body.slice(0, 120), connect: at.connect.slice(0, 160), meta: at.meta.slice(0, 120), mine: at.mine.slice(0, 120), mixed: at.mixed.slice(0, 120), hub: at.hubHits });
  const life = await driveLife(DOOR);
  ok('r3 N2 — THE DOOR LISTENS ONLY WHILE THE ROAD IS ON: a boot with the plugin DOWN opens nothing (its kept port refuses); the plugin\'s start (its broadcast) opens it on the kept port with the SAME token; the row off closes it, on opens it; a daemon that died without a word ⇒ the first request is refused in the person\'s words («peer-alpha is a Tailscale name — the Tailscale plugin is off: start it…») and the door closes',
    !!life.port0 && life.bootDown === null && life.bootDownGet === 0 && life.up === life.port0 && life.upUrl === life.url0 && life.upGet === 200 && life.rowOff === null && life.rowOffGet === 0 && life.again === life.port0 && /^HTTP\/1\.1 403/.test(life.silent) && life.silent.includes('peer-alpha is a Tailscale name — the Tailscale plugin is off: start it in ⚙ → Plugins → Tailscale') && !/road/.test(life.silent) && life.silentAfter === null,
    { ...life, silent: String(life.silent).slice(0, 120) });
  const hg = await driveHung(DOOR);
  ok('r3 N5 — ONE WAIT PER LAUNCH + ITS PAC: a stale table whose status read hangs ⇒ the launch waits its bound once and the PAC right after serves the persisted table AT ONCE (fresh() called once; launch + PAC under two bounds) — «names as of» in it',
    hg.v.on === true && hg.pac.status === 200 && /\/\/ names as of 2026-11-05T09:30/.test(hg.pac.body) && hg.calls === 1 && hg.took >= SETTLE_MS && hg.took < 2 * SETTLE_MS, { took: hg.took, calls: hg.calls, on: hg.v.on, pac: hg.pac.status });
  const po = await drivePacOff(DOOR);
  ok('r4 N3 — A PAC ASKED WHILE THE ROAD IS OFF IS ANSWERED, NEVER RESET: a daemon that died without a word ⇒ the PAC on its token path gets a clean 404 «reaching Tailscale devices from browsers is off» (a failed fetch: Chrome asks again in 8 s / 32 s / 2 min — an empty 200 would be a success it keeps 12 h), and THEN the door closes',
    po.status === 404 && /^reaching Tailscale devices from browsers is off/.test(po.body) && !/road|peer-alpha/.test(po.body) && po.after === null, po);
  const gone = await driveGone(DOOR);
  ok('r4 N2 — NO DIAL FOR A CLIENT THAT IS GONE: a verdict still pending (its name\'s lookup held) when the client resets (CONNECT, absolute GET) or the door is cut ⇒ nothing dialled after the verdict, no upstream connection, no fd left',
    ['connect-reset', 'get-reset', 'connect-cut'].every((k) => gone[k].asked === 1 && gone[k].dials === 0 && gone[k].arrived === 0 && gone[k].live === 0 && gone[k].fds <= 0), gone);
  const mid = await driveMidLookup(DOOR);
  ok('r5 m2 — THE REFUSAL REACHES THE CLIENT: the road off without a word while a name the PAC listed is looked up ⇒ the client READS the 403 in the person\'s words, in the owner\'s language, by the input that is off (absolute GET, the plugin stopped, en: «left.… is a Tailscale name — the Tailscale plugin is off: start it…»; CONNECT, the row off, zh: «…从浏览器访问 Tailscale 设备已关闭：…打开「从浏览器访问 tailnet 里的机器」») — nothing dialled — and the door closes AFTER it',
    mid.get && mid.get.asked === 1 && mid.get.status === 'HTTP/1.1 403 Forbidden' && mid.get.body === `left.${SUF} is a Tailscale name — the Tailscale plugin is off: start it in ⚙ → Plugins → Tailscale\n` && mid.get.dials === 0 && mid.get.after === null
      && mid.connect.asked === 1 && mid.connect.status === 'HTTP/1.1 403 Forbidden' && mid.connect.body === `left.${SUF} 是 Tailscale 里的名字 — 从浏览器访问 Tailscale 设备已关闭：在 ⚙ → 插件 → Tailscale 打开「从浏览器访问 tailnet 里的机器」\n` && mid.connect.dials === 0 && mid.connect.after === null, mid);
  const EP0 = require('../src/server/egress-proxy.js');
  const cn = await driveCancel(DOOR, EP0);
  ok('r5 m1 — A CLIENT THAT LEAVES IS NOT A DEVICE FAILURE: a GET dialled to a device, its client gone before the device answered (a cancelled request) ⇒ its upstream ends (none left), the door\'s words for that device keep the browser\'s own code («…failed (ERR_TUNNEL_CONNECTION_FAILED)…», never ECONNRESET), the shared proxy (the engine\'s egress) counts no error; CONTROL: the device itself dropping the request ⇒ a 502, its ECONNRESET remembered',
    cn.leave.got === 1 && cn.leave.live === 0 && /\(ERR_TUNNEL_CONNECTION_FAILED\)/.test(String(cn.leave.words)) && cn.engine.got === 1 && cn.engine.live === 0 && cn.engine.allowed === 1 && cn.engine.errors === 0
      && cn.drop.got === 1 && cn.drop.said === 'HTTP/1.1 502 Bad Gateway' && /\(ECONNRESET\)/.test(String(cn.drop.words)), cn);
  const dt = detailsOf(DOOR);
  ok('r4 N5 — THE HINT FILTER NAMES THE HINT: a host pve-node-2 / node-3 / xn--… keeps its own text in the detail line; Node\'s «if the root CA is installed locally, try running Node.js with --use-system-ca» is dropped by its own words',
    !!dt && dt[0].includes('Host: pve-node-2.') && dt[1] === 'ENOTFOUND — getaddrinfo ENOTFOUND node-3' && dt[2].includes('xn--bcher-kva.tail-mint.ts.net') && dt[3] === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE — unable to verify the first certificate', dt || 'DOOR.plainDetail missing');
  reachNow = { ...KERNEL };
  const down = await get(door.port(), { pathName: `http://peer-alpha:${CLOSED}/`, host: `peer-alpha:${CLOSED}` });
  const tun = await connectVia(door.port(), `peer-alpha:${CLOSED}`);
  const told = door.missFor(`https://peer-alpha:${CLOSED}/`, { failed: true, cause: 'ERR_TUNNEL_CONNECTION_FAILED', launched: { arg: ARG, mode: 'kernel', why: null } });
  reachNow = { ...R };
  ok('N5 — a device that refuses the port: the door\'s http answer is LAW 2\'s page by the cause («peer-alpha answered through Tailscale, but refused the connection on port N»); a CONNECT\'s 502 (Chrome: ERR_TUNNEL_CONNECTION_FAILED) is named by the failure the door saw',
    down.status === 502 && /text\/html/.test(down.type) && down.body.includes(`peer-alpha answered through Tailscale, but refused the connection on port ${CLOSED}`) && /^HTTP\/1\.1 502/.test(tun) && !!told && told.why === 'refused' && told.text.includes(`port ${CLOSED}`), { down, tun: tun.slice(0, 80), told });
  const flood = await floodLines(DOOR);
  ok('N6 h — the door\'s console: 50 refused tries at one target ⇒ ONE line (once per target + reason per 10 minutes — never per request)', flood.length === 1, flood);
  const kept = JSON.parse(fs.readFileSync(path.join(D1, DOOR.STATE_FILE), 'utf8')).port;
  const p0 = door.port(), u0 = door.url(); await door.close();
  reachNow = { ...R };
  const again = mkDoor(D1); again.boot();
  for (let i = 0; i < 200 && !again.port(); i++) await new Promise((r) => setTimeout(r, 5)); // boot() listens in the background
  ok('the port is KEPT (data/tailnet-door.json) with its token: after a restart (the road on) the door listens on the SAME port and the SAME PAC url at boot — a browser that outlived the hub still finds its PAC', kept === p0 && again.port() === p0 && again.url() === u0, { kept, p0, now: again.port() });
  await again.close();
}

console.log('② the REAL keeper over the fake agent-browser (the driver\'s road)');
const K = require('../src/server/browser-keeper.js');
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const cdpSrv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ Browser: 'Chrome/151.0.7922.34' })); });
const CDP_PORT = await listen(cdpSrv);
const PATH_ENV = `${path.join(ROOT, 'bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
const KEY_A = 'bk-0000a0a1', KEY_E = 'bk-0000e0e1';
const D2 = path.join(ROOT, 'data-k'); fs.mkdirSync(D2, { recursive: true });
const kdoor = mkDoor(D2);
const KENV = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(CDP_PORT) };
const FACTS = require('../src/browser-facts.js').createBrowserFacts({ env: KENV }); // ONE warmed facts for every keeper here (the binary's version probed once)
const mkKeeper = (KM, dataDir, extraEnv = {}) => KM.create({ dataDir, homeDir: HOME, env: () => ({ ...KENV, ...extraEnv }), facts: FACTS, serverSetting: () => undefined, liveKeys: () => new Set([KEY_A, KEY_E]), install: false, tickMs: 3600e3,
  log: quietLog, hostKnown: () => false, userTodos: { add: () => ({ id: 'u1' }) }, tailnet: kdoor });
const callsOf = (ns, from) => fake.calls().slice(from).filter((c) => c.ns === ns && (!c.session || c.session === ns) && c.verb !== 'session info');
const argsOf = (cfg) => V.driverArgsList(cfg && cfg.args);
const stampOf = (k, id) => (typeof k.tailnetOf === 'function' ? k.tailnetOf(id) : { missing: 'k.tailnetOf — the keeper keeps no tailnet stamp' });
/** one profile's start + a later call + its stop → the facts (the mutants reuse it); `stop: false` = the launch + its stamp only
 *  (the fake's daemon is reaped at the end) */
async function driveProfile(k, input, { stop = true } = {}) {
  const p = k.createProfile(input);
  const c0 = fake.calls().length, n0 = fake.launches().length;
  await k.start(p.id, { why: 'test' });
  const la = fake.launches().length > n0 ? fake.launches().at(-1) : null;
  if (stop) await k.stop(p.id, { why: 'user' });
  const cs = callsOf('vs-' + p.id, c0);
  const files = [...new Set(cs.map((c) => c.cfg))];
  const fileArgs = files.map((f) => { try { return argsOf(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { return null; } });
  return { p, la, cs, files, fileArgs, stamp: stampOf(k, p.id) || {} };
}
const hasPac = (w) => !!w.la && argsOf(w.la.config).some((a) => /proxy-pac-url/.test(a));
/** r4 N4: the PAC token in the keeper's views? (list() — every owner route + the broadcast; statusFor — an agent's answer) */
const tokenViews = (k, profileId, arg) => {
  const token = (/tailnet-([0-9a-f]{32})\.pac/.exec(String(arg)) || [])[1] || null;
  const list = JSON.stringify(k.list()), status = JSON.stringify(k.statusFor(KEY_E));
  const st = k.statusFor(KEY_E), lease = (st.leases || []).find((l) => l.browser && l.browser.tailnet);
  return { token, list: !!token && list.includes(token), status: !!token && status.includes(token), view: ((k.list().browsers || {})[profileId] || {}).tailnet, agent: !!lease && lease.browser.tailnet.on === true };
};
let kk;
{
  reachNow = { ...R };
  const k = mkKeeper(K, D2); kk = k;
  const w = await driveProfile(k, { label: 'Work' });
  const arg = `--proxy-pac-url=${kdoor.url()}`;
  ok('a profile\'s LAUNCH config carries the switch, read back whole from the driver\'s ONE line (the person\'s switches kept before it)', !!w.la && argsOf(w.la.config).at(-1) === arg && argsOf(w.la.config).filter((a) => /proxy-pac-url/.test(a)).length === 1, w.la && w.la.config);
  ok('EVERY call of its session (the launch, cdp-url, the stop) names the SAME config file, which carries it — the launch view never differs (a differing one relaunches Chrome)', w.cs.length >= 3 && w.files.length === 1 && w.fileArgs[0] && w.fileArgs[0].includes(arg), { calls: w.cs.map((c) => c.verb), files: w.files });
  ok('the record\'s stamp: {arg, mode: userspace} (the audit\'s words read it)', w.stamp.arg === arg && w.stamp.mode === 'userspace' && w.stamp.why === null, w.stamp);
  reachNow = { ...STOPPED };
  const off = await driveProfile(k, { label: 'Off' });
  ok('the plugin OFF ⇒ no switch on any call; stamped {arg: null, why: plugin-off}', !!off.la && !hasPac(off) && off.fileArgs.every((a) => a && !a.some((x) => /proxy-pac-url/.test(x))) && off.stamp.arg === null && off.stamp.why === 'plugin-off', off.stamp);
  reachNow = { ...R };
  const own = await driveProfile(k, { label: 'Own proxy', proxy: 'socks5://127.0.0.1:9' }, { stop: false });
  ok('a profile with its OWN proxy keeps it: no PAC beside it (Chromium ranks a PAC above --proxy-server), stamped explicit-proxy', !!own.la && !hasPac(own) && own.stamp.why === 'explicit-proxy', own.stamp);
  fs.writeFileSync(path.join(HOME, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox', proxy: 'http://127.0.0.1:9' }));
  const cfgp = await driveProfile(k, { label: 'Config proxy' }, { stop: false });
  fs.rmSync(path.join(HOME, '.agent-browser', 'config.json'));
  ok('the person\'s browser config naming a proxy WINS too: their proxy rides the launch, no PAC', !!cfgp.la && cfgp.la.config.proxy === 'http://127.0.0.1:9' && !hasPac(cfgp) && cfgp.stamp.why === 'explicit-proxy', cfgp.la && cfgp.la.config);
  const D4 = path.join(ROOT, 'data-env'); fs.mkdirSync(D4, { recursive: true });
  const envp = await driveProfile(mkKeeper(K, D4, { HTTPS_PROXY: 'http://127.0.0.1:9' }), { label: 'Env proxy' }, { stop: false });
  ok('N6 j — an ENV proxy (HTTPS_PROXY in the launch env — Chrome on Linux honours it) is EXPLICIT: no PAC beside it, stamped explicit-proxy (the person\'s proxy keeps every host)', !!envp.la && !hasPac(envp) && envp.stamp.why === 'explicit-proxy', { stamp: envp.stamp, la: envp.la && envp.la.config });
  // a conversation's own browser + the agent's commands
  const BPR = require('../src/browser-profiles.js');
  const pairs = BPR.browserEnvFor({ browserKey: KEY_E, variant: BPR.VARIANTS.N, idleMs: 600000 });
  const n0 = fake.launches().length;
  let ephErr = null; try { await k.ensureEphemeral({ browserKey: KEY_E, sessionId: 'sess-e', envPairs: pairs, sessionName: 'tn', variant: 'N' }); } catch (e) { ephErr = e; }
  const la = fake.launches().length > n0 ? fake.launches().at(-1) : null;
  const cf = k.configFileFor({ ephemeral: true, pairs });
  let cfg = null; try { cfg = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch { cfg = null; }
  const ev = k.ephemeralFor(KEY_E);
  ok('a CONVERSATION\'s own browser (ensureEphemeral) launches with it, and the file the agent\'s own commands are named (/resolve) carries the same switch', !ephErr && !!la && argsOf(la.config).includes(arg) && !!cfg && argsOf(cfg).includes(arg) && ev && (stampOf(k, ev.profileId) || {}).arg === arg, ephErr ? ephErr.message : { la: la && la.config, cfg });
  const av = AT.attachArgv({ profileDir: '/p', mark: '--vibespace-keeper=x', extra: [arg] });
  const ks = read('src/server/browser-keeper.js');
  const attachFn = ks.slice(ks.indexOf('  async function attachStart('), ks.indexOf('  async function stop(profileId'));
  ok('the ATTACH road: the switch goes IN through the builder (its census passes, the argv carries it whole) — the keeper pushes the stamp\'s switch into engineArgs, never beside the builder',
    av.ok && av.argv.includes(arg) && /\n {4}if \(rec\.tailnet && rec\.tailnet\.arg\) engineArgs\.push\(rec\.tailnet\.arg\);/.test(attachFn) && attachFn.indexOf('engineArgs.push(rec.tailnet.arg)') < attachFn.indexOf('AT.attachArgv('), av);
  const tv = tokenViews(k, w.p.id, arg);
  const rt0 = read('src/routes/browser.js');
  ok('r4 N4 — THE TOKEN NEVER IN AN ANSWER: the keeper\'s list() (the owner\'s routes + the browser-profiles-updated broadcast) and statusFor (an agent\'s `vibespace-browser status`, the agent\'s profiles `me`) carry the stamp as {on, mode, why} — the PAC token in none; GET /api/browser/profiles/:id strips it the same way',
    !!tv.token && !tv.list && !tv.status && JSON.stringify(tv.view) === JSON.stringify({ on: true, mode: 'userspace', why: null }) && tv.agent === true
      && rt0.includes("browser: k.browserOf(p.id) ? { ...k.browserOf(p.id), cdpUrl: undefined, tailnet: require('../tailnet-reach.js').stampView(k.browserOf(p.id).tailnet) } : null });"), tv);
}

console.log('③ the in-page browser (/proxy: the real node-unblocker with the door\'s agents)');
const express = require('express');
const Unblocker = require('unblocker');
/** one embedded app over a door (the mutants hand a patched one); a base-shaped error handler («STACK» = the base's own error) */
async function embeddedApp(d) {
  const app = express();
  const ub = new Unblocker({ prefix: '/proxy/', ...d.agents() });
  app.use(d.embedded(ub));
  app.use((err, req, res, next) => { res.writeHead(500); res.end('STACK ' + (err && err.message)); });
  return listen(http.createServer(app));
}
const P = (port, u) => get(port, { pathName: `/proxy/${u}` });
/** the in-page facts (`only` = the legs a mutant needs) */
async function driveEmbedded(d, only = null) {
  const want = (k) => !only || only.includes(k);
  const port = await embeddedApp(d);
  const out = {};
  if (want('kernel')) { reachNow = { ...KERNEL }; const h0 = peerHits.length; out.kernel = await P(port, `http://peer-alpha:${PEER_PORT}/k`); out.kernelHit = peerHits.length > h0; }
  if (want('user')) { reachNow = { ...R }; const s0 = stubSeen.length; out.user = await P(port, `http://peer-beta.${SUF}:${PEER_PORT}/u`); out.userSeen = stubSeen.slice(s0); }
  if (want('pub')) { reachNow = { ...R }; const s1 = stubSeen.length; out.pub = await P(port, `http://127.0.0.1:${PUB_PORT}/`); out.pubSeen = stubSeen.slice(s1); }
  if (want('four')) {
    const s2 = stubSeen.length;
    out.four = [];
    for (const [tag, re, u] of [['no plugin · a Funnel name', null, `http://${FUNNEL}:${PUB_PORT}/`], ['no plugin · a CGNAT address', null, `http://${CGNAT}:${PUB_PORT}/`],
      ['the plugin stopped · a LAN short name it once knew', { ...STOPPED, known: [{ name: `nas.${SUF}`, short: 'nas', ips: ['100.101.1.9'] }] }, `http://nas:${PUB_PORT}/`],
      ['kernel + the row off · a 100.x address', { ...KERNEL, browsers: false }, `http://${CGNAT}:${PUB_PORT}/`], ['up · a Funnel name', { ...R }, `http://${FUNNEL}:${PUB_PORT}/`]]) {
      reachNow = re; const r = await P(port, u); out.four.push([tag, r.status, r.body.slice(0, 80)]);
    }
    out.fourSeen = stubSeen.slice(s2);
  }
  if (want('keep')) { reachNow = { ...R }; const kp = await embeddedApp(d); const c0 = pubConns; for (let i = 0; i < 5; i++) await P(kp, `http://127.0.0.1:${PUB_PORT}/k${i}`); out.conns = pubConns - c0; } // its own app: fresh agents
  if (want('miss')) {
    reachNow = { ...STOPPED, known: [...PEERS, SELF] };
    out.off = await P(port, 'https://peer-alpha:8006/');
    reachNow = { ...R };
    out.ghost = await P(port, 'https://ghost-two.tail-mint.ts.net/');
    out.base = await P(port, 'http://down.example.test:9/');
    out.bare = await P(port, 'http://intranet:8080/'); // a bare label no device holds (a LAN name, a compose service) — the road UP
    reachNow = { ...KERNEL };
    if (TLS_PORT) { const t0 = tlsConns; out.cert = await P(port, `https://peer-alpha:${TLS_PORT}/`); out.certConns = tlsConns - t0; }
    out.refused = await P(port, `http://peer-alpha:${CLOSED}/`);
    reachNow = { ...R };
  }
  return out;
}
const ed = mkDoor(path.join(ROOT, 'data-e'), { lang: () => 'zh' });
const emb = await driveEmbedded(ed);
{
  ok('kernel: a device\'s NAME is answered from the plugin\'s table (never the system resolver) — the page comes back', emb.kernel.status === 200 && emb.kernel.body === `PEER-OK peer-alpha:${PEER_PORT}` && emb.kernelHit, emb.kernel);
  ok('userspace: through the plugin\'s HTTP proxy — the CONNECT stub saw the device\'s name (and only it), the page comes back', emb.user.status === 200 && /^PEER-OK /.test(emb.user.body) && JSON.stringify(emb.userSeen) === JSON.stringify([`peer-beta.${SUF}:${PEER_PORT}`]), { u: emb.user, seen: emb.userSeen });
  ok('a public host goes DIRECT — nothing reaches the plugin\'s proxy', emb.pub.status === 200 && emb.pub.body === 'PUBLIC-OK' && emb.pubSeen.length === 0, { p: emb.pub, seen: emb.pubSeen });
  ok('N1 — THE ROAD IS ADDED, NEVER A GATE: the acceptance\'s four cases load AS ON THE BASE (no plugin: a Funnel name, a CGNAT address; the plugin stopped: a LAN short name; kernel + the row off: a 100.x address) + a Funnel name while up — the ordinary road, nothing through the plugin\'s proxy',
    emb.four.every(([, st, b]) => st === 200 && b === 'PUBLIC-OK') && emb.fourSeen.length === 0, emb.four);
  ok('N4 — keep-alive stays: 5 sequential requests through /proxy ⇒ ONE upstream connection (the door\'s agents keep Node\'s own options)', emb.conns === 1, emb.conns);
  ok('the person\'s OWN device while the plugin is off, after the ordinary road failed ⇒ LAW 2\'s page in the owner\'s language (zh) — «peer-alpha 是 Tailscale 里的名字 — Tailscale 插件没有开…» — the error\'s own text under it',
    emb.off.status === 502 && emb.off.body.includes('data-tailnet="plugin-off"') && emb.off.body.includes('peer-alpha 是 Tailscale 里的名字 — Tailscale 插件没有开') && emb.off.body.includes('data-error="ENOTFOUND"') && !/STACK|无法解析/.test(emb.off.body), emb.off);
  ok('a *.ts.net name no device holds, after the ordinary road failed ⇒ «… 不是你 tailnet 里的设备（已知：peer-alpha, peer-beta, hub）» (the list: the owner\'s own page)', emb.ghost.status === 502 && emb.ghost.body.includes('ghost-two.tail-mint.ts.net 不是你 tailnet 里的设备（已知：peer-alpha, peer-beta, hub）'), emb.ghost);
  ok('a public host\'s failure keeps the BASE\'s own error (never replaced on the base\'s road)', emb.base.status === 500 && /^STACK getaddrinfo ENOTFOUND down\.example\.test/.test(emb.base.body), emb.base);
  ok('r3 N4 — a bare label no device holds (intranet — a LAN name, a compose service) while the road is UP keeps the BASE\'s own error (no Tailscale page)', emb.bare.status === 500 && /^STACK getaddrinfo ENOTFOUND intranet/.test(emb.bare.body), emb.bare);
  if (TLS_PORT) ok('N5 + r3 N6 — a device with a SELF-SIGNED certificate (the user\'s :8006 shape) answered: «peer-alpha 经 Tailscale 有回应，但用的是页内浏览器不信任的证书（自签名？）— 在这里打不开它…（tailscale cert）» — never «offline»; the detail line a person\'s: the code + plain words (no Node hint, no backticks); the device saw the connection',
    emb.cert.status === 502 && emb.cert.body.includes('data-tailnet="untrusted-cert"') && emb.cert.body.includes('peer-alpha 经 Tailscale 有回应，但用的是页内浏览器不信任的证书（自签名？）— 在这里打不开它：给那台设备换一张可信的证书（tailscale cert）') && emb.cert.body.includes('data-error="DEPTH_ZERO_SELF_SIGNED_CERT"')
      && emb.cert.body.includes('>DEPTH_ZERO_SELF_SIGNED_CERT — self-signed certificate</p>') && !/use-system-ca|Node\.js|`/.test(emb.cert.body) && emb.certConns >= 1 && !/在线吗/.test(emb.cert.body), { cert: emb.cert, conns: emb.certConns });
  else ok('openssl present (the self-signed device leg)', false, 'no openssl');
  ok('N5 — a refused port ⇒ «peer-alpha 经 Tailscale 有回应，但拒绝了端口 N 上的连接…»', emb.refused.status === 502 && emb.refused.body.includes(`拒绝了端口 ${CLOSED} 上的连接`) && emb.refused.body.includes('data-tailnet="refused"'), emb.refused);
}

console.log('④ the agent\'s navigate answer (the audit route, the CLI) + the console');
{
  const rt = read('src/routes/browser.js'), cli = read('data/bin/vibespace-browser'), sv = read('server.js'), wiring = read('src/server/mounts-plugins-wiring.js');
  ok('the audit route: a FAILED navigation\'s url + its NETWORK cause (the CLI\'s net::ERR_* only — r3: a CDP timeout `timedOut` is never one) → the door\'s missFor with the browser\'s launch stamp, audience agent → `tailnet: {why, text}`; no network cause ⇒ no tailnet words',
    /const netCause = typeof req\.body\?\.netError === 'string' \? req\.body\.netError\.slice\(0, 80\) : null;/.test(rt) && !/timedOut === true \? 'TIMEOUT'/.test(rt) && /if \(req\.body\?\.ok === false && typeof req\.body\?\.url === 'string' && netCause\)/.test(rt)
      && /missFor\(req\.body\.url\.slice\(0, 4096\), \{ failed: true, cause: netCause, audience: 'agent', launched: profileId && typeof k\.tailnetOf === 'function' \? k\.tailnetOf\(profileId\) : undefined \}\)/.test(rt) && /\.\.\.\(tailnet \? \{ tailnet \} : \{\}\)/.test(rt));
  ok('the CLI: a failed navigation sends its net::ERR_* (`netError`) and prints the answer: `note: <words> [tailnet]`', /const navErr = navVerb && navUrl && code !== 0 \? \(\(\/net::\(ERR_\[A-Z0-9_\]\+\)\/\.exec\(outText \+ '\\n' \+ errText\) \|\| \[\]\)\[1\] \|\| null\) : null;/.test(cli) && cli.includes('...(navErr ? { netError: navErr } : {})') && /if \(navVerb && au && !au\._failed && au\.tailnet && au\.tailnet\.text\) console\.error\(`note: \$\{au\.tailnet\.text\} \[tailnet\]`\);/.test(cli));
  ok('r4 N1 — the wiring: ONE follow(plugins) (the door\'s every input through plugins.watch — its runs are test-tailscale-dns ④b, the real settings store) and no second road into the door (no broadcast hook, no bare configure); server.js\'s settings write hook hands every write to plugins.onSettingsWrite',
    wiring.split("require('./tailnet-door.js').follow(plugins, { dataDir: path.join(rootDir, 'data'), lang: () => require('./owner-facts.js').tray().lang });").length === 2 && !wiring.includes('roadChanged') && !wiring.includes("tailnet-door.js').configure(") && typeof DOOR.follow === 'function'
      && /onSettingsWrite: \(next, prev\) => \{[\s\S]{0,1500}?try \{ plugins\.onSettingsWrite\(next, prev\); \} catch \{ \}/.test(sv));
  ok('the wiring: server.js hands the unblocker the door\'s agents + its LAW 2 middleware', sv.includes("prefix: '/proxy/', ...require('./src/server/tailnet-door.js').agents(),") && sv.includes("app.use(require('./src/server/tailnet-door.js').embedded(unblocker));"));
  const ownProf = typeof kk.list === 'function' ? kk.list().profiles.find((p) => p.label === 'Own proxy') : null;
  const st = ownProf ? stampOf(kk, ownProf.id) : null;
  const f = (u, o) => door.missFor(u, { failed: true, ...o });
  const words = [f('https://peer-alpha:8006/', { launched: st, cause: 'ERR_TUNNEL_CONNECTION_FAILED' }), f('https://peer-alpha:8006/', { launched: null, cause: 'ERR_NAME_NOT_RESOLVED' }), f('https://peer-alpha:8006/', { launched: { arg: ARG }, cause: 'ERR_CONNECTION_TIMED_OUT' }), f('https://peer-alpha:8006/', { launched: { arg: ARG }, cause: 'ERR_CERT_AUTHORITY_INVALID' })];
  ok('the words by the stamp AND the cause: its own proxy won · started before Tailscale was up · no answer (a timeout) · a certificate Chrome does not trust (r3: «Chrome shows a certificate warning: accept it in the live view») — never «cannot resolve», never «offline» for an answered host',
    words.map((m) => m && m.why).join() === 'explicit-proxy,started-before,no-answer,cert-warning' && words.every((m) => /Tailscale|tailnet/.test(m.text) && !/cannot resolve/i.test(m.text)) && /Chrome shows a certificate warning: accept it in the live view/.test(words[3].text), words);
  const agent = f('https://ghost.tail-mint.ts.net/', { cause: 'ERR_NAME_NOT_RESOLVED' }), dialog = f('https://peer-alpha:8006/', { cause: null });
  ok('N6 g — an AGENT\'s answer never lists the person\'s devices: «ghost.… is not a device on your tailnet» (no «known:»); a failure with no network cause (a dialog, a prompt) says nothing of Tailscale', !!agent && agent.text === `ghost.${SUF} is not a device on your tailnet` && !/peer-alpha|peer-beta|hub/.test(agent.text) && dialog === null, { agent, dialog });
  const lines = [];
  const fd = mkDoor(null, { log: { log: (l) => lines.push(l) } });
  for (let i = 0; i < 60; i++) { reachNow = i % 2 ? { ...R } : { ...STOPPED }; await fd.launch({ label: 'Flappy' }); await fd.launch({ label: 'Work' }); }
  reachNow = { ...R }; await fd.close();
  const offLines = lines.filter((l) => /starts without tailnet reach/.test(l));
  ok('N6 h — a FLAPPING plugin (60 up/down launches × 2 profiles) ⇒ ONE console line per profile + reason (10-minute window)', offLines.length === 2 && offLines.some((l) => l.includes('"Flappy"')) && offLines.some((l) => l.includes('"Work"')), offLines);
}

console.log('⑤ MUTANTS (copies outside the tree)');
{
  const MC = mutantCopies('tailnet-browsers', REPO);
  const dsrc = read('src/server/tailnet-door.js');
  const dm = (pairs, tag) => { let s = dsrc; for (const [a, b] of pairs) { if (!s.includes(a)) { ok(`mutant ${tag}: its anchor is in the door`, false, a); return null; } s = s.replace(a, b); } return MC.load('src/server/tailnet-door.js', s, tag); };
  const run = async (D, only) => (D ? driveEmbedded(mkDoor(null, {}, D), only) : null);
  const m1 = await run(dm([["if (route.startsWith('resolve:')) { const ip = route.slice(8); return base({ ...options, host: dial ? dial(ip) : ip, ...(secure ? { servername: options.servername || host } : {}) }, cb); }", "if (route.startsWith('resolve:')) return base({ ...options, lookup }, cb);"]], 'system-resolver'), ['kernel']);
  ok('MUTANT the in-page road on the SYSTEM resolver ⇒ ③ kernel RED (the device\'s name never reaches it)', !!m1 && !(m1.kernel.status === 200 && m1.kernelHit), m1 && m1.kernel);
  const m2 = await run(dm([["    const route = TR.routeFor(host, r, { via: 'embedded' });\n    if (route.startsWith('resolve:'))", "    const route0 = TR.routeFor(host, r, { via: 'embedded' }); const route = route0 === 'direct' && r && r.up ? 'http-proxy' : route0;\n    if (route.startsWith('resolve:'))"]], 'all-proxy'), ['pub']);
  ok('MUTANT every host through the plugin\'s HTTP proxy ⇒ ③\'s public leg RED (the stub sees the public host)', !!m2 && m2.pubSeen.length > 0, m2 && m2.pubSeen);
  const m3 = await run(dm([["      if (!TR.maybeTailnet(target, reachNow())) return go();", "      if (TR.tailnetKind(target, reachNow()) && TR.routeFor(target, reachNow(), { via: 'embedded' }) === 'direct') return page(res, TR.wordsFor(TR.downWhy(reachNow()) || 'not-a-peer', { host: TR.hostOf(target) }));\n      if (!TR.maybeTailnet(target, reachNow())) return go();"]], 'r1-gate'), ['four']);
  ok('MUTANT THE r1 GATE (a miss page before trying, for every tailnet-looking host off the road) ⇒ ③\'s four-cases leg RED', !!m3 && !m3.four.every(([, st, b]) => st === 200 && b === 'PUBLIC-OK'), m3 && m3.four);
  const m4 = await run(dm([['return { ...o, keepAlive: true };', 'return { ...o, keepAlive: false };']], 'no-keepalive'), ['keep']);
  ok('MUTANT keep-alive off on the door\'s agents ⇒ ③\'s keep-alive leg RED (5 connections)', !!m4 && m4.conns > 1, m4 && m4.conns);
  const D5 = dm([["    return lookupAll(h).then((addrs) => {", "    return refusal(`${h} is not a device on your tailnet`);\n    return lookupAll(h).then((addrs) => {"]], 'refusing-door');
  const m5 = D5 ? await driveDoor(mkDoor(null, {}, D5)) : null;
  ok('MUTANT the r1 refusing door (only the table\'s names admitted) ⇒ ①\'s N2 leg RED (a name it does not list gets a 403)', !!m5 && /^HTTP\/1\.1 403/.test(m5.ghost), m5 && m5.ghost.slice(0, 120));
  const D6 = dm([['    if (at !== undefined && t - at < sayWindowMs) return;\n', '']], 'per-request-lines');
  const m6 = D6 ? await floodLines(D6) : null;
  ok('MUTANT a console line per request ⇒ ①\'s N6 h leg RED (50 lines)', !!m6 && m6.length > 1, m6 && m6.length);
  const D7 = dm([['      if (bad) return refusal(', '      if (bad && false) return refusal(']], 'no-vet');
  const m7 = D7 ? await driveAttack(mkDoor(null, {}, D7)) : null;
  ok('MUTANT r3 N2: the door dials a name WITHOUT vetting its answer (r2) ⇒ ①\'s never-back leg RED (the hub-bound server answered through the door)', !!m7 && m7.hubHits > 0 && /HUB-SECRET-PAGE/.test(m7.get.body), m7 && { hub: m7.hubHits, get: m7.get.status });
  const D8 = dm([['  function boot() { return stateFile ? sync() : Promise.resolve(); }', '  function boot() { if (stateFile && kept().port) ensure().catch(() => { }); }']], 'boot-blind');
  const m8 = D8 ? await driveLife(D8) : null;
  ok('MUTANT r3 N2: a boot blind to the road (r2: the kept port listens whatever the plugin\'s state) ⇒ ①\'s life leg RED (open at a boot with the plugin down)', !!m8 && m8.bootDown !== null, m8 && { bootDown: m8.bootDown });
  const D9 = dm([['      if (px) { await close();', '      if (px && false) { await close();']], 'never-closes');
  const m9 = D9 ? await driveLife(D9) : null;
  ok('MUTANT r3 N2: a door that never closes with the road ⇒ ①\'s life leg RED (open with the row off)', !!m9 && m9.rowOff !== null, m9 && { rowOff: m9.rowOff });
  const D10 = dm([['  const isPac = (p) => {', "  const isPac = (p) => p === '/tailnet.pac' || isPac0(p);\n  const isPac0 = (p) => {"]], 'guessable');
  const m10 = D10 ? await (async () => { const d = mkDoor(null, {}, D10); reachNow = { ...R }; await d.launch({ label: 'G' }); const g = await get(d.port(), { pathName: '/tailnet.pac' }); await d.close(); return g; })() : null;
  ok('MUTANT r3 N2: the PAC on a guessable path (/tailnet.pac) ⇒ ①\'s token leg RED (the device list served)', !!m10 && m10.status === 200 && /peer-alpha/.test(m10.body), m10 && m10.status);
  const D11 = dm([['      hungAt = !f || f.stale ? Date.now() : 0;', '      hungAt = 0; inflight = null;']], 'second-wait');
  const m11 = D11 ? await driveHung(D11) : null;
  ok('MUTANT r3 N5: a second wait (the PAC asks fresh() again, as r2) ⇒ ①\'s one-wait leg RED (fresh() twice, two bounds)', !!m11 && (m11.calls > 1 || m11.took >= 2 * SETTLE_MS), m11 && { calls: m11.calls, took: m11.took });
  const D12 = dm([['    const detail = plainDetail(err);', "    const detail = err ? `${err.code ? err.code + ': ' : ''}${err.message || ''}`.slice(0, 500) : '';"]], 'raw-detail');
  const m12 = D12 && TLS_PORT ? await driveEmbedded(mkDoor(null, {}, D12), ['miss']) : null;
  // what turns ③'s certificate leg red under the mutant on EVERY Node: the person's line («code — plain words») is gone and Node's
  // own «code: message» stands — Node 24's message adds its developer hint (use-system-ca), Node 22's (the CI runner's) has none
  ok('MUTANT r3 N6: Node\'s raw message under the sentence ⇒ ③\'s certificate leg RED (the person\'s detail line gone, Node\'s own «code: message» shown)', !!m12 && m12.cert.body.includes('data-error="DEPTH_ZERO_SELF_SIGNED_CERT"') && !m12.cert.body.includes('>DEPTH_ZERO_SELF_SIGNED_CERT — self-signed certificate</p>') && />DEPTH_ZERO_SELF_SIGNED_CERT: [^<]+<\/p>/.test(m12.cert.body), m12 && m12.cert.body.slice(-300));
  const D13 = dm([["    if (!TR.roadOn(reachNow())) { res.once('close', () => sync()); head(404,", '    if (!TR.roadOn(reachNow())) sync(); if (false) { head(404,']], 'reset-pac');
  const m13 = D13 ? await drivePacOff(D13) : null;
  ok('MUTANT r4 N3: r3\'s order (the door cut BEFORE the PAC is answered) ⇒ ①\'s road-off PAC leg RED (the request reset)', !!m13 && m13.status !== 404, m13 && { status: m13.status, body: String(m13.body).slice(0, 60) });
  const esrc = read('src/server/egress-proxy.js'), eA = '      if (sock.destroyed) return;\n';
  ok('the dial-gone mutant\'s anchor is in egress-proxy.js', esrc.split(eA).length === 2);
  const EM = esrc.includes(eA) ? MC.load('src/server/egress-proxy.js', esrc.replace(eA, ''), 'dial-gone-proxy') : null;
  const D14 = EM ? dm([["const EgressProxy = require('./egress-proxy.js');", `const EgressProxy = require(${JSON.stringify(MC.files[MC.files.length - 1])});`]], 'dial-gone') : null;
  const m14 = D14 ? await driveGone(D14) : null;
  ok('MUTANT r4 N2: the CONNECT dialled after its client is gone (r3) ⇒ ①\'s client-gone leg RED (a dial after the verdict, a live upstream left)', !!m14 && m14['connect-reset'].dials > 0 && m14['connect-reset'].live > 0, m14);
  const D16 = dm([['    return { ...refusal(TR.wordsFor(', '    sync(); return { ...refusal(TR.wordsFor(']], 'refusal-cut');
  const m16 = D16 ? await driveMidLookup(D16) : null;
  ok('MUTANT r5 m2: r4\'s order (the door cut BEFORE the refusal is written) ⇒ ①\'s mid-lookup leg RED (the client reads nothing)', !!m16 && m16.get.status === '(nothing)' && m16.connect.status === '(nothing)', m16);
  const D17 = dm([['      const r2 = reachNow({ now: true });\n      if (!TR.roadOn(r2)) return offRoad(r2, h);', '      const r2 = null;\n      if (false) return offRoad(r2, h);']], 'no-reread');
  const m17 = D17 ? await driveMidLookup(D17) : null;
  ok('MUTANT r5 m2: no re-read of the road after the lookup (r3) ⇒ ①\'s mid-lookup leg RED (dialled on a road that is off)', !!m17 && m17.get.dials > 0 && m17.connect.dials > 0, m17 && { get: m17.get.dials, connect: m17.connect.dials });
  const eA2 = 'const upFailed = (e) => { if (left) return; stats.errors++;', eA3 = "      res.on('close', () => { if (!res.writableFinished) { left = true; try { up.destroy(); } catch { /* gone */ } } }); // r4: the client gone ⇒ the upstream too\n";
  ok('the r5 egress mutants\' anchors are in egress-proxy.js', esrc.split(eA2).length === 2 && esrc.split(eA3).length === 2);
  const viaProxy = (src, tag) => { const em = MC.load('src/server/egress-proxy.js', src, `${tag}-proxy`); const dd = dm([["const EgressProxy = require('./egress-proxy.js');", `const EgressProxy = require(${JSON.stringify(MC.files[MC.files.length - 1])});`]], tag); return dd ? { D: dd, EP: em } : null; };
  const G18 = esrc.includes(eA2) ? viaProxy(esrc.replace(eA2, 'const upFailed = (e) => { stats.errors++;'), 'gone-failure') : null;
  const m18 = G18 ? await driveCancel(G18.D, G18.EP) : null;
  ok('MUTANT r5 m1: r4\'s proxy (a cancelled request booked as the upstream\'s failure) ⇒ ①\'s client-leaves leg RED (the door\'s words say ECONNRESET; the engine\'s egress counts an error)', !!m18 && /\(ECONNRESET\)/.test(String(m18.leave.words)) && m18.engine.errors > 0, m18 && { words: m18.leave.words, errors: m18.engine.errors });
  const G19 = esrc.includes(eA3) ? viaProxy(esrc.replace(eA3, ''), 'get-upstream') : null;
  const m19 = G19 ? await driveCancel(G19.D, G19.EP, 20) : null;
  ok('MUTANT r4 N2 / r5: the GET\'s upstream left when its client goes (r3) ⇒ ①\'s client-leaves leg RED (an upstream still open at the device)', !!m19 && m19.leave.live > 0 && m19.engine.live > 0, m19 && { door: m19.leave.live, engine: m19.engine.live });
  const D15 = dm([["  const said = NODE_HINTS.reduce((t, re) => t.replace(re, ''), String(err.message || '')).replace(/[;\\s]+$/, '').trim();", "  const said = String(err.message || '').split(/;\\s*/).filter((c) => c.trim() && !/\\bnode(\\.js)?\\b|--[a-z]/i.test(c)).join('; ').trim();"]], 'hint-filter');
  const m15 = D15 ? detailsOf(D15) : null;
  ok('MUTANT r4 N5: r3\'s clause filter (any clause with «node» or «--») ⇒ ①\'s detail leg RED (pve-node-2 / node-3 / xn--… lose their text)', !!m15 && !m15[0].includes('pve-node-2') && m15[1] === 'ENOTFOUND', m15);
  const ksrc = read('src/server/browser-keeper.js');
  const kA3 = "tailnet: require('../tailnet-reach.js').stampView(rec.tailnet), ";
  ok('the token-view mutant\'s anchor is in browser-keeper.js', ksrc.split(kA3).length === 2);
  const KT = ksrc.includes(kA3) ? MC.load('src/server/browser-keeper.js', ksrc.replace(kA3, ''), 'token-view') : null;
  const D6k = path.join(ROOT, 'data-ktok'); fs.mkdirSync(D6k, { recursive: true });
  reachNow = { ...R };
  const kt = KT ? mkKeeper(KT, D6k) : null;
  const mt = kt ? await driveProfile(kt, { label: 'Token mutant' }, { stop: false }) : null;
  const mtv = mt ? tokenViews(kt, mt.p.id, mt.stamp.arg) : null;
  ok('MUTANT r4 N4: the keeper\'s view spreading the whole stamp (r3) ⇒ ②\'s token leg RED (the PAC token in list())', !!mtv && mtv.list === true, mtv);
  const kA1 = 'const eff = rec && rec.tailnet && rec.tailnet.arg ? displays.tailnetFileFor(eff1, rec.tailnet) : eff1;', kA2 = ' || !!require(\'../tailnet-reach.js\').envProxyOf(env)';
  ok('the keeper mutants\' anchors are in browser-keeper.js', ksrc.includes(kA1) && ksrc.includes(kA2));
  reachNow = { ...R };
  const D3 = path.join(ROOT, 'data-km'); fs.mkdirSync(D3, { recursive: true });
  const KM = ksrc.includes(kA1) ? MC.load('src/server/browser-keeper.js', ksrc.replace(kA1, 'const eff = eff1;'), 'no-stamp-calls') : null;
  const mw = KM ? await driveProfile(mkKeeper(KM, D3), { label: 'Mutant' }) : null;
  ok('MUTANT the keeper\'s calls without the stamp\'s file ⇒ ②\'s every-call leg RED (a call names a file without the switch — Chrome would be relaunched)', !!mw && !(mw.files.length === 1 && mw.fileArgs[0] && mw.fileArgs[0].some((a) => /proxy-pac-url/.test(a))), mw && { files: mw.files, la: mw.la && mw.la.config });
  const D5k = path.join(ROOT, 'data-kenv'); fs.mkdirSync(D5k, { recursive: true });
  const KE = ksrc.includes(kA2) ? MC.load('src/server/browser-keeper.js', ksrc.replace(kA2, ''), 'env-ignored') : null;
  const me = KE ? await driveProfile(mkKeeper(KE, D5k, { HTTPS_PROXY: 'http://127.0.0.1:9' }), { label: 'Env mutant' }, { stop: false }) : null;
  ok('MUTANT the env proxy ignored ⇒ ②\'s N6 j leg RED (the PAC rides beside the person\'s proxy)', !!me && hasPac(me), me && me.stamp);
  ok('the copies live outside the tree', MC.files.length === 25 && MC.files.every((f) => !f.startsWith(path.join(REPO, 'src'))), MC.files);
}
await kdoor.close(); await ed.close();
done();

#!/usr/bin/env node
// THE FRAMING UNIT (the separation, M1 — lane B; 主开发 r922, shape (A): its laws 2, 3, 5, 6 and the framing halves of 8 and
// 9). The interface (src/interface/) on a loopback port; today's hub joined through its OWN road (src/server/interface-party.js
// join, over a REAL link — the tree's frame code on a unix socket) and serving a real http.Server:
//   ② ONE CHANNEL IS ONE EXCHANGE, at the hub (leg 2): raw bytes on ONE channel — two requests, a request then an upgrade, two
//     HTTP/1.0 keep-alive requests, a head after a chunked body's last chunk, a head after an Expect exchange — each serve
//     exactly ONE head, the refusal read by its name in the hub's journal. RED CONTROL: the count cut ⇒ the second head is served.
//   ③ IN REQUEST ORDER, AND NOTHING LEFT (leg 3): K requests pipelined on ONE page socket, whose hub handlers finish in
//     reverse order, come back in request order, each with its own marker, over one accept, K open lines and K distinct
//     channels; 1 000 requests over six kept-alive sockets leave zero channels in the interface and zero sockets in the
//     hub's router; a page reset mid-answer shows the hub's handler its socket gone; an answer before the page's body ended
//     drops the rest and the connection's next request is answered; a link that dies with an upgraded channel open throws
//     nothing in the hub. RED CONTROLS: the channel's end cut ⇒ the counts stay at 1 000; the drop cut ⇒ the next request
//     is never answered; the party's channel listener cut ⇒ the dead link's error is thrown out of the hub. And (r1057 items
//     2–4): an open line with NO address is refused by the hub (RED: read as the local one); pipelined requests the hub holds
//     leave no channel when the page resets (RED: the page socket's close cut); an old link's late close never removes the
//     new link's channel of the same number (RED: the map keyed by the number).
//   ④ THE HUB OBEYS NO CLASS (leg 4): an open line that CLAIMS a class, and a page header that claims a stamp, on a cookie-less
//     head for /api/sessions, are answered 401 by the hub's own gate (src/auth.js); the open line's keys and the stamp's
//     keys are exactly the declared ones. RED CONTROL: a hub whose gate reads the claimed class serves the request.
//   ⑥ FAITHFUL BOTH WAYS (leg 6): a seeded, replayable differential — each generated request through the interface and
//     straight to a plain server with the same echo handler: what the handler saw (method, target, version, every header line
//     with its order, duplicates, case and bytes, the trailers, the body's digest, the door class) and what the page got back
//     (the informational answers, the status line, every header line, the body's digest, the trailers) are EQUAL but for
//     src/interface/relay.js DECLARED, by name — or the same refusal by Node; the door class at the interface's end equals
//     the hub's; a head inside a body opens no channel; the interface answers after every case. RED CONTROLS: a forwarder
//     that joins duplicate lines; one that re-encodes the target; the channel socket left to Node's Expect flush (UTF-8).
//   ⑧ EVERY CLOCK ON A PAGE SOCKET IS THE INTERFACE'S (leg 8, its framing half): each named clock is no shorter than the
//     plain form's, and each fires in its own case — a silent head, a slow body, an idle kept-alive connection, a head over
//     the size bound, an upgraded socket whose channel ended; three poll-period requests of one tab ride ONE accept; a reset
//     inside an upgrade head leaves the interface answering. RED CONTROL: the page server never told it listens ⇒ the head
//     and request clocks never fire (the silent head stays open).
//   ⑨ A REQUEST WITH NO OWNER IS ANSWERED BY NAME (law 9's framing half): no link ⇒ 503 «no-owner», never a closed socket.
//   ⑩ NO PAGE BYTE IS A CONTROL LINE (leg 10): a relay seeded just under the last channel number never opens channel 0 and
//     ends the link's numbers by name; the relay holds ONE control() call and no data() call (the channel socket's write is
//     the one). RED CONTROL: the guard cut ⇒ a page body's JSON line reaches the hub as a control line (a forged open line).
// The suite prints its Node; the ruling asks the differential on the gates' Node and production's (both majors) — the line
// names each run. in-process; a scratch dir under os.tmpdir().
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import https from 'node:https';
import tls from 'node:tls';
import { Duplex } from 'node:stream';
import { execFileSync } from 'node:child_process';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 1500) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lapAt = performance.now(), lapName = 'the start';
const lap = (name) => { const now = performance.now(); console.log(`    (${lapName}: ${Math.round(now - lapAt)} ms)`); lapAt = now; lapName = name; };   // printed for the row's time, never judged
const until = async (f, ms = 5000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await sleep(5); } return true; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iface-framing-'));
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
function compileAt(rel, src) { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; }
/** `rel`'s source with ONE piece swapped — the needle must occur exactly once, or the control is void (it throws) */
function mutant(rel, needle, into) { const src = read(rel); if (src.split(needle).length !== 2) throw new Error(`CONTROL needle not found exactly once in ${rel}: ${needle.slice(0, 80)}`); return compileAt(rel, src.replace(needle, into)); }
const { Mux } = require(path.join(REPO, 'src/agentd/mux.js'));
const RELAY = require(path.join(REPO, 'src/interface/relay.js'));
const FRONT = require(path.join(REPO, 'src/interface/front.js'));
const D = require(path.join(REPO, 'src/door.js'));
const secretPair = () => { const s = crypto.randomBytes(32).toString('hex'); return { secret: s, digest: crypto.createHash('sha256').update(s).digest('hex') }; };
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
console.log(`  (Node ${process.version}; the hub's own clocks here: Node's — it sets none)`);

/** the interface (index.js, a relay or front swapped in if asked) + today's hub party joined over a real link, serving `hub` */
let nBoot = 0;
async function pair(handler, { relayMod = null, frontMod = null, partyMod = null, clocks, firstChan, link = true } = {}) {
  let idx = read('src/interface/index.js');
  if (relayMod) { globalThis.__vsRelayF = relayMod; idx = idx.replace("require('./relay.js')", 'globalThis.__vsRelayF'); }
  if (frontMod) { globalThis.__vsFrontF = frontMod; idx = idx.replace("require('./front.js')", 'globalThis.__vsFrontF'); }
  const iface = compileAt('src/interface/index.js', idx).create({ clocks, firstChan });
  const where = await iface.listen(0, '127.0.0.1');
  const sockPath = path.join(T, `p${++nBoot}.sock`);
  const linkSrv = net.createServer((s) => iface.attachLink(s)).listen(sockPath);
  await new Promise((r) => linkSrv.once('listening', r));
  const hub = handler && typeof handler.listen === 'function' ? handler : http.createServer(handler);
  const journal = [];
  let party = null;
  if (link) {
    const k = secretPair(); iface.admit({ party: 'hub', digest: k.digest });
    const P = partyMod || require(path.join(REPO, 'src/server/interface-party.js'));
    party = await P.join({ start: { party: 'hub', secret: k.secret, link: sockPath }, server: hub, log: { error: (l) => journal.push(String(l)), log: () => { } } });
  }
  return { iface, port: where.port, hub, party, journal, close: async () => { try { party && party.mux.destroy(); } catch { } await iface.close(); linkSrv.close(); try { hub.close(); } catch { } } };
}
/** a raw page socket: write bytes, collect what comes back */
function rawPage(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => resolve(s)); s.got = Buffer.alloc(0); s.ended = false;
    s.on('data', (b) => { s.got = Buffer.concat([s.got, b]); }); s.on('error', () => { }); s.on('close', () => { s.ended = true; });
  });
}
const get = (port, p, { agent = false, headers = {} } = {}) => new Promise((resolve) => {
  const q = http.get({ host: '127.0.0.1', port, path: p, headers, agent }, (res) => { const parts = []; res.on('data', (c) => parts.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts).toString() })); });
  q.on('error', (e) => resolve({ status: 0, error: e.code || e.message }));
});
/** a fake INTERFACE side of a link: it admits the hub's hello, then hands the test the link to write open lines and bytes */
async function fakeInterface(server, partyMod, { onData, onClose } = {}) {
  const sockPath = path.join(T, `x${++nBoot}.sock`), k = secretPair(), journal = [];
  let side = null;
  const srv = net.createServer((s) => { side = new Mux(s, { heartbeat: false, closeAfterQueue: true, onControl: (m) => { if (m && m.op === 'hello') side.control({ op: 'hello-ack', protoVersion: 1, party: 'interface', capabilities: [] }); }, onData: (c, b) => { if (onData) onData(c, b); side.credit(c, b.length); }, onClose: (c) => { if (onClose) onClose(c); } }); }).listen(sockPath);
  await new Promise((r) => srv.once('listening', r));
  const party = await (partyMod || require(path.join(REPO, 'src/server/interface-party.js'))).join({ start: { party: 'hub', secret: k.secret, link: sockPath }, server, log: { error: (l) => journal.push(String(l)) } });
  return { side: () => side, party, journal, close: () => { try { party.mux.destroy(); } catch { } srv.close(); } };
}

lap('② ');
console.log('— ② ONE CHANNEL IS ONE EXCHANGE, at the hub: raw bytes on ONE channel serve exactly one head');
{
  async function oneChannel(bytes, partyMod) {
    const heads = [];
    const hub = http.createServer((req, res) => { heads.push(`${req.method} ${req.url}`); req.on('data', () => { }); req.on('end', () => res.end('ok')); });
    hub.on('upgrade', (req, socket) => { heads.push(`UPGRADE ${req.url}`); socket.end('HTTP/1.1 101 Switching Protocols\r\n\r\n'); });
    hub.on('checkContinue', (req, res) => { heads.push(`EXPECT ${req.url}`); res.writeContinue(); req.on('data', () => { }); req.on('end', () => res.end('ok')); });
    const F = await fakeInterface(hub, partyMod);
    F.side().control({ op: 'open', chan: 7, to: 'hub', trace: 't', stamp: { secure: false, addr: '203.0.113.9', port: 4100 } });
    F.side().data(7, Buffer.from(bytes, 'latin1'));
    await until(() => heads.length >= 2 || F.journal.length > 0, 1500); await sleep(50);
    F.close(); hub.close();
    return { heads, journal: F.journal };
  }
  const H = 'Host: hub.example\r\n';
  const CASES = [
    ['two requests', `GET /a HTTP/1.1\r\n${H}\r\nGET /b HTTP/1.1\r\n${H}\r\n`],
    ['a request then an upgrade', `GET /a HTTP/1.1\r\n${H}\r\nGET /ws HTTP/1.1\r\n${H}Connection: Upgrade\r\nUpgrade: websocket\r\n\r\n`],
    ['two HTTP/1.0 keep-alive requests', `GET /a HTTP/1.0\r\n${H}Connection: keep-alive\r\n\r\nGET /b HTTP/1.0\r\n${H}Connection: keep-alive\r\n\r\n`],
    ['a head after a chunked body\'s last chunk', `POST /a HTTP/1.1\r\n${H}Transfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n0\r\n\r\nGET /b HTTP/1.1\r\n${H}\r\n`],
    ['a head after an Expect exchange', `POST /a HTTP/1.1\r\n${H}Expect: 100-continue\r\nContent-Length: 3\r\n\r\nabcGET /b HTTP/1.1\r\n${H}\r\n`],
  ];
  const rows = [];
  for (const [name, bytes] of CASES) rows.push([name, await oneChannel(bytes)]);
  for (const [name, r] of rows) console.log(`    ${name}: served ${JSON.stringify(r.heads)} · journal ${JSON.stringify(r.journal)}`);
  ok(rows.every(([, r]) => r.heads.length === 1 && r.journal.some((l) => l.includes('a second head on one channel (chan 7) is never served'))), 'every case served exactly ONE head, and the second was refused by its name in the hub\'s journal');
  const counting = mutant('src/server/interface-party.js', '    if (x && x.heads++ > 0) {\n', '    if (x && false) {\n');
  const red = await oneChannel(CASES[0][1], counting);
  ok(red.heads.length === 2, `RED CONTROL — the count cut: the second head is served (${JSON.stringify(red.heads)})`, red);
  /** an open line with NO address (r1057 item 2): the channel socket would read it as the local one, which two doors trust */
  async function noAddress(partyMod) {
    const handed = []; const closed = [];
    const hub = http.createServer((req, res) => { handed.push(req.socket.remoteAddress); res.end('ok'); });
    const F = await fakeInterface(hub, partyMod, { onClose: (c) => closed.push(c) });
    F.side().control({ op: 'open', chan: 5, to: 'hub', trace: 't', stamp: { secure: false } });
    F.side().data(5, Buffer.from('GET /x HTTP/1.1\r\nHost: hub.example\r\n\r\n'));
    await until(() => handed.length > 0 || (F.journal.length > 0 && closed.includes(5)), 1500); await sleep(30);
    F.close(); hub.close();
    return { handed, closed, journal: F.journal };
  }
  const na = await noAddress();
  ok(na.handed.length === 0 && na.closed.includes(5) && na.journal.some((l) => l.includes('an open line with no address (chan 5) is refused')), `an open line with no address: never handed to the hub's server, its channel closed, refused by name («${na.journal[0] || ''}»)`, na);
  const trusting = mutant('src/server/interface-party.js', "          if (!m.stamp || typeof m.stamp.addr !== 'string' || !m.stamp.addr) {", '          if (false) {');
  const naRed = await noAddress(trusting);
  ok(naRed.handed.length === 1 && naRed.handed[0] === '127.0.0.1', `RED CONTROL — the check cut: the hub's handler reads that channel as the LOCAL address (${JSON.stringify(naRed.handed)})`, naRed);
}

lap('③ ');
console.log('— ③ IN REQUEST ORDER, AND NOTHING LEFT');
{
  const K = 6, socks = new Set();
  const handler = (req, res) => {
    socks.add(req.socket);
    const q = new URL(req.url, 'http://x').searchParams.get('i');
    if (q === null) { res.end('n'); return; }
    const i = Number(q); setTimeout(() => res.end(`answer ${i};`), (K - i) * 25);   // the FIRST waits longest
  };
  const P = await pair(handler);
  const s = await rawPage(P.port);
  const before = P.iface.stats().opened;
  s.write(Array.from({ length: K }, (_, i) => `GET /order?i=${i} HTTP/1.1\r\nHost: hub.example\r\n\r\n`).join(''));
  await until(() => (s.got.toString().match(/answer \d;/g) || []).length === K, 4000);
  const order = (s.got.toString().match(/answer \d;/g) || []).map((x) => Number(x.slice(7, 8)));
  const opened = P.iface.stats().opened - before;
  ok(JSON.stringify(order) === JSON.stringify([...Array(K).keys()]) && opened === K && socks.size === K, `${K} requests pipelined on ONE page socket, the first answered LAST by the hub: back in request order ${JSON.stringify(order)} · ${opened} open lines · ${socks.size} distinct channel sockets at the hub`, { order, opened, socks: socks.size });
  s.destroy();
  /** 1 000 requests over six kept-alive sockets → what is left on each side, and how many sockets the page side opened */
  async function thousand(Px, waitMs = 3000) {
    let accepts = 0; const agent = new http.Agent({ keepAlive: true, maxSockets: 6 });
    const cc = agent.createConnection.bind(agent); agent.createConnection = (...a) => { accepts++; return cc(...a); };
    const rs = await Promise.all(Array.from({ length: 1000 }, (_, i) => get(Px.port, `/n${i}`, { agent })));
    agent.destroy();
    await until(() => Px.iface.stats().channels === 0 && Px.party.router.size === 0, waitMs);
    return { ok: rs.filter((r) => r.status === 200).length, accepts, channels: Px.iface.stats().channels, router: Px.party.router.size };
  }
  const law = await thousand(P);
  ok(law.ok === 1000 && law.accepts <= 6 && law.channels === 0 && law.router === 0, `1 000 requests over ${law.accepts} kept-alive sockets: ${law.ok} answered · ${law.channels} channels left in the interface, ${law.router} sockets in the hub's router`, law);
  const kept = mutant('src/interface/relay.js', '    stats.exchanges++; Object.assign(live.get(keyOf(sock)) || {}, { req, res, out });', '    stats.exchanges++; Object.assign(live.get(keyOf(sock)) || {}, { req, res, out }); sock.destroySoon = () => { sock.writable = false; };');   // the client's end of the exchange does nothing (writable false: Node asserts it after destroySoon)
  const PK = await pair(handler, { relayMod: kept });
  const red = await thousand(PK, 200);   // read before the hub's own idle clock (Node's 5 s) lets a kept channel go
  ok(red.ok === 1000 && red.channels >= 990 && red.router >= 990, `RED CONTROL — the channel's end cut (the client's end of each exchange ends nothing): ${red.channels} channels stay in the interface, ${red.router} in the hub's router`, red);
  await PK.close();
  // a page reset mid-answer: the hub's handler sees its request's socket gone
  let sawGone = false;
  const P2 = await pair((req, res) => { req.socket.once('close', () => { sawGone = true; }); res.write('part'); });
  const s2 = await rawPage(P2.port); s2.write('GET /long HTTP/1.1\r\nHost: hub.example\r\n\r\n');
  await until(() => s2.got.includes('part'), 2000); s2.resetAndDestroy();
  await until(() => sawGone && P2.party.router.size === 0, 2000);
  ok(sawGone && P2.party.router.size === 0, `a page reset mid-answer: the hub's handler sees its request's socket gone (${sawGone}), its router empty (${P2.party.router.size})`);
  await P.close(); await P2.close();
  /** an answer BEFORE the page's body ended (a 401 to an upload): the rest of the body is dropped, the page connection's next request answered */
  async function early(relayMod) {
    const P3 = await pair((req, res) => { if (req.url === '/early') { res.writeHead(401, ['Content-Length', '2']); res.end('no'); return; } res.writeHead(200, ['Content-Length', '4']); res.end('next'); }, { relayMod });
    const s3 = await rawPage(P3.port);
    s3.write('POST /early HTTP/1.1\r\nHost: hub.example\r\nContent-Length: 200000\r\n\r\n'); s3.write(Buffer.alloc(65536, 1));
    await until(() => s3.got.includes('no'), 2000);
    s3.write(Buffer.alloc(200000 - 65536, 2)); s3.write('GET /next HTTP/1.1\r\nHost: hub.example\r\n\r\n');
    await until(() => s3.got.toString().endsWith('next'), 2000);
    const r = { first: s3.got.toString().split('\r\n')[0], next: s3.got.toString().endsWith('next'), opened: P3.iface.stats().opened };
    s3.destroy(); await P3.close(); return r;
  }
  /** pipelined requests the hub holds, then the page resets: the queued answers' channels go too (r1057 item 4) */
  async function pipelinedReset(relayMod) {
    const P5 = await pair(() => { }, { relayMod });   // a hub that answers nothing
    const s5 = await rawPage(P5.port);
    s5.write(Array.from({ length: 4 }, (_, i) => `GET /hold${i} HTTP/1.1\r\nHost: hub.example\r\n\r\n`).join(''));
    await until(() => P5.iface.stats().channels === 4 && P5.party.router.size === 4, 2000);
    const before = { channels: P5.iface.stats().channels, router: P5.party.router.size };
    s5.resetAndDestroy();
    await until(() => P5.iface.stats().channels === 0 && P5.party.router.size === 0, 2000);
    const r = { before, channels: P5.iface.stats().channels, router: P5.party.router.size }; await P5.close(); return r;
  }
  const pr = await pipelinedReset();
  ok(pr.before.channels === 4 && pr.channels === 0 && pr.router === 0, `four pipelined requests the hub holds, then the page resets: ${pr.before.channels} channels → ${pr.channels} in the interface, ${pr.router} in the hub's router (the three waiting their turn go with the first)`, pr);
  const HOOK = "    const page = req.socket; page.once('close', gone); res.once('finish', () => page.removeListener('close', gone));";
  const prRed = await pipelinedReset(mutant('src/interface/relay.js', HOOK, ''));
  ok(prRed.channels >= 1, `RED CONTROL — the page socket's own close cut: ${prRed.channels} channels of answers waiting their turn stay behind (Node never closes a response that has no socket yet)`, prRed);
  /** the late close of an OLD link's channel never empties the NEW link's entry of the same number (r1057 item 3) */
  const lateClose = (mod) => {
    const R = mod.create({ ownerOf: () => 'hub' });
    const fake = () => ({ closesAfterQueue: true, control: () => { }, data: () => true, credit: () => { }, closeChan: () => { } });
    const head = { method: 'GET', url: '/ws', httpVersion: '1.1', rawHeaders: ['Host', 'hub.example', 'Connection', 'Upgrade', 'Upgrade', 'x'] };
    const pageOf = () => { const d = new Duplex({ read() { }, write(c, e, cb) { cb(); } }); d.on('error', () => { }); return d; };
    const A = fake(), B = fake(); R.handlersFor(A); R.attach(A);
    const pA = pageOf(); R.upgrade(head, pA, Buffer.alloc(0), { secure: false, addr: '203.0.113.1', port: 1 });   // channel 1 of link A
    R.handlersFor(B); R.attach(B);   // a re-attach: numbers start again at 1
    const pB = pageOf(); R.upgrade(head, pB, Buffer.alloc(0), { secure: false, addr: '203.0.113.2', port: 2 });   // channel 1 of link B
    const before = R.stats().channels;
    pA.destroy();   // the old link's page goes LATE: its channel 1 closes now
    return new Promise((resolve) => setTimeout(() => { const r = { before, after: R.stats().channels }; pB.destroy(); resolve(r); }, 30));
  };
  const lc = await lateClose(RELAY);
  ok(lc.before === 2 && lc.after === 1, `a re-attached link's channel 1 beside the old link's channel 1: ${lc.before} channels; the old one closes late: ${lc.after} left — the map names a channel by its link and its number`, lc);
  const lcRed = await lateClose(mutant('src/interface/relay.js', '  const keyOf = (sock) => sock;', '  const keyOf = (sock) => sock.chan;'));
  ok(!(lcRed.before === 2 && lcRed.after === 1), `RED CONTROL — the map keyed by the number alone: ${lcRed.before} channels before, ${lcRed.after} after (the new link's entry lost)`, lcRed);
  const e1 = await early();
  ok(/^HTTP\/1\.1 401/.test(e1.first) && e1.next && e1.opened === 2, `an answer before the page's body ended («${e1.first}» after 64 KiB of 200 000): the rest is read and dropped, and the same page connection's next request is answered (${e1.next}, ${e1.opened} exchanges)`, e1);
  /** the link dies while an UPGRADED channel is open at the hub (Node detaches an upgraded socket from its server's listeners) */
  async function deathWithUpgrade(partyMod) {
    const uncaught = []; const onU = (e) => uncaught.push(String(e && e.message)); process.on('uncaughtException', onU);
    const P4 = await pair((req, res) => res.end('x'), { partyMod });
    let held = null; P4.hub.on('upgrade', (req, socket) => { held = socket; socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: x\r\nConnection: Upgrade\r\n\r\n'); });   // kept open, no listener of its own
    const u = await rawPage(P4.port); u.write('GET /ws HTTP/1.1\r\nHost: hub.example\r\nConnection: Upgrade\r\nUpgrade: x\r\n\r\n');
    await until(() => held && u.got.includes('101'), 2000);
    P4.party.mux.destroy(); await sleep(50);   // the link dies
    process.off('uncaughtException', onU);
    const r = { upgraded: !!held, uncaught: uncaught.length, why: uncaught[0] || null }; u.destroy(); await P4.close(); return r;
  }
  const lives = await deathWithUpgrade();
  ok(lives.upgraded && lives.uncaught === 0, `the link dies while an upgraded channel is open at the hub: nothing thrown in the hub (${lives.uncaught} uncaught) — the death is said by name, never thrown`, lives);
  const PARTY = read('src/server/interface-party.js'), ERR = "          s.on('error', () => { });";
  if (PARTY.split(ERR).length !== 2) throw new Error('CONTROL needle not found exactly once: the party\'s channel error listener');
  const dies = await deathWithUpgrade(compileAt('src/server/interface-party.js', PARTY.replace(ERR, '')));
  ok(dies.uncaught >= 1, `RED CONTROL — the party's listener cut: the dead link's «${dies.why}» is thrown out of the hub (${dies.uncaught} uncaught)`, dies);
  const RS = read('src/interface/relay.js');
  const D1 = "        if (!req.complete) { req.unpipe(out); req.resume(); }   // answered before the page's body ended: the rest is read and dropped, as the plain form's Node dumps it — the page connection goes on\n";
  const D2 = "      req.unpipe(out); req.resume();   // nobody takes the rest of the page's body now\n";
  if (RS.split(D1).length !== 2 || RS.split(D2).length !== 2) throw new Error('CONTROL needle not found exactly once: the relay drops an unanswered body');
  const e2 = await early(compileAt('src/interface/relay.js', RS.replace(D1, '').replace(D2, '')));
  ok(!e2.next, `RED CONTROL — the drop cut: the rest of the body is never read, and the page connection's next request is never answered (${e2.next})`, e2);
}

lap('④ ');
console.log('— ④ THE HUB OBEYS NO CLASS');
{
  const express = require('express');
  /** the hub's own gate (src/auth.js, sign-in ON) in front of /api/sessions; `AuthClass` may be a copy */
  const gated = (AuthClass) => { const app = express(); const auth = new AuthClass(fs.mkdtempSync(path.join(T, 'auth-')), {}); auth.setPassword('pw-framing-81'); app.use(auth.middleware()); app.get('/api/sessions', (req, res) => res.json({ served: true })); return http.createServer(app); };
  const { Auth } = require(path.join(REPO, 'src/auth.js'));
  const P = await pair(gated(Auth));
  const r1 = await get(P.port, '/api/sessions', { headers: { 'x-vs-stamp': JSON.stringify({ secure: true, class: 'door', who: 'owner' }), 'x-vs-class': 'door' } });
  ok(r1.status === 401, `a cookie-less head for /api/sessions through the interface, carrying a page header that CLAIMS a stamp and a class: ${r1.status} — the hub's own gate`, r1);
  await P.close();
  /** an open line that CLAIMS a class (and a who, and a class inside its stamp), written straight onto the hub's link */
  async function claimed(server, partyMod) {
    let got = '';
    const F = await fakeInterface(server, partyMod, { onData: (c, b) => { got += b.toString(); } });
    F.side().control({ op: 'open', chan: 3, to: 'hub', trace: 't', class: 'door', who: 'owner', stamp: { secure: true, addr: '203.0.113.9', port: 1, class: 'door', who: 'owner' } });
    F.side().data(3, Buffer.from('GET /api/sessions HTTP/1.1\r\nHost: hub.example\r\nAccept: application/json\r\n\r\n'));
    await until(() => /HTTP\/1\.1 \d{3}/.test(got), 2000);
    F.close(); server.close();
    return Number((/HTTP\/1\.1 (\d{3})/.exec(got) || [])[1]);
  }
  const law = await claimed(gated(Auth));
  ok(law === 401, `an OPEN LINE that claims a class («door») and a who («owner») on a cookie-less head for /api/sessions: ${law} — the hub judged the head itself`);
  // the keys of what the interface writes: a far party that records every open line
  const lines = [], k = secretPair(), recSock = path.join(T, `r${++nBoot}.sock`);
  const I = require(path.join(REPO, 'src/interface/index.js')).create(); const where = await I.listen(0, '127.0.0.1');
  const recSrv = net.createServer((s) => I.attachLink(s)).listen(recSock); await new Promise((r) => recSrv.once('listening', r));
  I.admit({ party: 'hub', digest: k.digest });
  const ls = net.connect(recSock); const mx = new Mux(ls, { heartbeat: false, closeAfterQueue: true, onControl: (m) => { if (m && m.op === 'open') lines.push(m); }, onData: (c, b) => mx.credit(c, b.length) });
  ls.on('connect', () => mx.control({ op: 'hello', protoVersion: 1, party: 'hub', secret: k.secret }));
  await until(() => I.stats().linked, 2000);
  const q = http.get({ host: '127.0.0.1', port: where.port, path: '/api/x', agent: false, headers: { 'x-vs-stamp': '{"class":"door","secure":true}' } }); q.on('error', () => { });
  await until(() => lines.length > 0, 2000); q.destroy();
  const keys = lines[0] ? Object.keys(lines[0]).sort().join(',') : '', skeys = lines[0] && lines[0].stamp ? Object.keys(lines[0].stamp).sort().join(',') : '';
  ok(keys === 'chan,op,stamp,to,trace' && skeys === 'addr,port,secure' && lines[0].stamp.secure === false, `the open line's keys: ${keys}; the stamp's: ${skeys} (secure: ${lines[0] && lines[0].stamp.secure}) — no class, no who, nothing a page wrote`, lines[0]);
  try { mx.destroy(); } catch { } await I.close(); recSrv.close();
  // RED CONTROL: a hub whose gate READS the claimed class — the party puts it on the socket, the gate obeys it
  const OPEN = 'const s = router.open(m.chan, m.stamp || {}); s[EXCHANGE] = { heads: 0, chan: m.chan };';
  const tells = mutant('src/server/interface-party.js', OPEN, OPEN + ' s.claimedClass = m.class;');
  const GATE = '      const d = doorClassOf({ method: req.method, path: req.path, headers: req.headers, encrypted: !!(req.socket && req.socket.encrypted) }, { enabled: this.enabled });';
  const obeys = mutant('src/auth.js', GATE, GATE.replace('const d = doorClassOf(', 'const d = req.socket && req.socket.claimedClass ? { kind: req.socket.claimedClass } : doorClassOf(')).Auth;
  const red = await claimed(gated(obeys), tells);
  ok(red === 200, `RED CONTROL — a hub whose gate reads the claimed class: ${red} (it served the cookie-less head)`);
}

lap('⑥ ');
console.log('— ⑥ FAITHFUL BOTH WAYS: a seeded differential against the plain form (src/interface/relay.js DECLARED only)');
{
  const pathOf = (u) => { const i = u.indexOf('?'); return i < 0 ? u : u.slice(0, i); };
  const classOf = (req, secure) => { try { return D.doorClassOf({ method: req.method, path: pathOf(req.url), headers: req.headers, encrypted: !!secure }, { enabled: true }).kind; } catch { return 'threw'; } };
  /** the echo: what it saw, and an answer of the kind the request asks for */
  const makeEcho = (sink, tlsOpts = null) => {
    const echo = (req, res) => {
      const parts = []; req.on('data', (c) => parts.push(c));
      req.on('end', () => {
        const seen = { method: req.method, url: req.url, version: req.httpVersion, raw: req.rawHeaders, trailers: req.rawTrailers, digest: digest(Buffer.concat(parts)), cls: classOf(req, req.socket.encrypted), addr: req.socket.remoteAddress, port: req.socket.remotePort, tls: !!req.socket.encrypted };   // the stamp's three facts, as the handler sees them
        sink.push(seen);
        res.sendDate = false;
        const out = Buffer.from(JSON.stringify({ url: req.url, digest: seen.digest }));   // not the lines: a declared difference must show once, where it is declared
        const mode = req.headers['x-answer'] || 'length';
        try { answerAs(mode, res, out); } catch { res.destroy(); }
      });
    };
    const answerAs = (mode, res, out) => {
        if (mode === 'chunked') { res.writeHead(200, ['X-Mode', 'chunked', 'Set-Cookie', 'a=1', 'Set-Cookie', 'b=2']); res.write(out.subarray(0, 10)); res.end(out.subarray(10)); }
        else if (mode === 'streamed') { res.writeHead(200, ['X-Mode', 'streamed']); res.write(out.subarray(0, 5)); setImmediate(() => { res.write(out.subarray(5, 20)); setImmediate(() => res.end(out.subarray(20))); }); }
        else if (mode === 'trailers') { res.writeHead(200, ['X-Mode', 'trailers', 'Trailer', 'X-Sum']); res.write(out); res.addTrailers([['X-Sum', digest(out)]]); res.end(); }
        else if (mode === 'close') { res.removeHeader('content-length'); res.removeHeader('transfer-encoding'); res.writeHead(200, ['X-Mode', 'close']); res.end(out); }
        else if (mode === '204') { res.writeHead(204, ['X-Mode', '204']); res.end(); }
        else if (mode === '304') { res.writeHead(304, ['X-Mode', '304', 'ETag', '"v1"']); res.end(); }
        else if (mode === '1xx') { res.writeProcessing(); res.writeEarlyHints({ link: '</a.css>; rel=preload' }); res.writeHead(200, ['Content-Type', 'application/json', 'Content-Length', String(out.length)]); res.end(out); }
        else res.writeHead(200, ['Content-Type', 'application/json', 'X-Dup', 'one', 'X-Dup', 'two', 'Content-Length', String(out.length)]).end(out);
    };
    const server = tlsOpts ? https.createServer(tlsOpts, echo) : http.createServer(echo);
    server.on('upgrade', (req, socket, head) => { sink.push({ method: req.method, url: req.url, version: req.httpVersion, raw: req.rawHeaders, upgrade: true, head: digest(head), cls: classOf(req, socket.encrypted), addr: socket.remoteAddress, port: socket.remotePort, tls: !!socket.encrypted }); socket.end(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: ${req.headers.upgrade}\r\nConnection: Upgrade\r\nX-Head: ${digest(head)}\r\n\r\n`); socket.on('error', () => { }); socket.resume(); });   // read to its end, so its close is seen
    return server;
  };
  const plainSeen = [], hubSeen = [], ifaceCls = [];
  const plain = makeEcho(plainSeen); await new Promise((r) => plain.listen(0, '127.0.0.1', r));
  // AN ENCRYPTED PAGE: a throwaway pair (openssl, as test-interface-relay makes its own); the plain form's TLS twin, and the same pair pushed to the interface
  const keyF = path.join(T, 'f.key.pem'), certF = path.join(T, 'f.cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', keyF, '-out', certF, '-days', '2', '-subj', '/CN=framing'], { stdio: 'ignore' });
  const PEM = { key: fs.readFileSync(keyF), cert: fs.readFileSync(certF) };
  const plainTls = makeEcho(plainSeen, PEM); await new Promise((r) => plainTls.listen(0, '127.0.0.1', r));
  // the interface's own end of the door class: the head ITS Node parsed, before the relay hands it on
  const tapped = { ...RELAY, create: (o) => { const r = RELAY.create(o); return { ...r, exchange: (req, res, f) => { ifaceCls.push(classOf(req, f.secure)); return r.exchange(req, res, f); }, upgrade: (req, s, h, f) => { ifaceCls.push(classOf(req, f.secure)); return r.upgrade(req, s, h, f); } }; } };
  const P = await pair(makeEcho(hubSeen), { relayMod: tapped });
  P.iface.useCertificate(PEM);
  const SEED = (Number(process.env.FRAMING_SEED) || 20261121) >>> 0;
  let st = SEED; const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  // a SECOND stream picks the arms (an encrypted page, a kept-alive connection), so the seeded heads are the ones the first stream made
  let st2 = (SEED ^ 0x9E3779B9) >>> 0; const rnd2 = () => { st2 = (st2 + 0x6D2B79F5) >>> 0; let t = st2; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const SECOND = 'GET /second HTTP/1.1\r\nHost: hub.example\r\nX-Answer: length\r\nConnection: close\r\n\r\n';   // the kept-alive arm's next request on the same connection
  const TARGETS = ['/', '/api/home', '/api/sessions', '//a//b', '/a/./b/../c', '/%2e%2e/x', '/x?q=1&q=2', '/café', '/p%20q', '*', 'http://hub.example/abs', '/dav/a.txt', '/hook/abc'];
  const HEADERS = [['Cookie', 'a=1'], ['cookie', 'b=2'], ['Authorization', 'Bearer x'], ['Origin', 'https://elsewhere.example'], ['Origin', 'http://hub.example'], ['Sec-Fetch-Site', 'same-origin'], ['Sec-Fetch-Site', 'cross-site'], ['X-Forwarded-For', '198.51.100.1'], ['X-Forwarded-Proto', 'https'], ['X-Forwarded-Host', 'other.example'], ['Accept', 'text/html'], ['X-Weird', 'vé'], ['X-Empty', ''], ['Host', 'other.example'], ['Keep-Alive', 'timeout=9'], ['Proxy-Connection', 'keep-alive'], ['Trailer', 'X-Sum']];
  const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD', 'PROPFIND'];
  const ANSWERS = ['length', 'chunked', 'streamed', 'trailers', 'close', '204', '304', '1xx'];
  const BODIES = ['none', 'length', 'chunked', 'chunked+trailers', 'both', 'expect', 'inner-head'];
  /** raw requests to `port` (plain or TLS), read until the server closes (the last generated head ends `Connection: close`, or upgrades) */
  const ask = (port, bytes, secure = false) => new Promise((resolve) => {
    let got = Buffer.alloc(0), localPort = null;
    const onConn = () => { localPort = s.localPort; s.write(Buffer.from(bytes, 'latin1')); };
    const s = secure ? tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false }, onConn) : net.connect(port, '127.0.0.1', onConn);
    const t = setTimeout(() => { s.destroy(); resolve({ text: got.toString('latin1'), timedOut: true, localPort }); }, 3000);
    s.on('data', (b) => { got = Buffer.concat([got, b]); });
    s.on('close', () => { clearTimeout(t); resolve({ text: got.toString('latin1'), timedOut: false, localPort }); }); s.on('error', () => { });
  });
  /** an answer stream, read as a client reads it, answer after answer: each one's informational heads, its final head, its
   *  body (de-chunked, by its own framing), its trailers — `methods` names each request's method (a HEAD's answer has no body) */
  const viewAll = (text, methods) => {
    const out = []; let rest = text;
    for (let k = 0; k < methods.length && rest.length; k++) {
      const infos = []; let head, code;
      for (;;) {
        const h = rest.indexOf('\r\n\r\n'); if (h < 0) { out.push({ infos, status: rest.split('\r\n')[0] || '(nothing)', lines: [], body: '', trailers: [] }); return out; }
        head = rest.slice(0, h).split('\r\n'); rest = rest.slice(h + 4);
        code = Number((/^HTTP\/1\.[01] (\d{3})/.exec(head[0]) || [])[1]);
        if (code >= 100 && code < 200 && code !== 101) { infos.push(head); continue; }
        break;
      }
      const lines = head.slice(1), lower = lines.map((l) => l.toLowerCase()); let body = '', trailers = [];
      if (methods[k] === 'HEAD' || code === 204 || code === 304) body = '';
      else if (code === 101) { body = rest; rest = ''; }
      else if (lower.some((l) => /^transfer-encoding:.*chunked/.test(l))) {
        let o = '', i = 0;
        for (;;) {
          const e = rest.indexOf('\r\n', i); if (e < 0) { i = rest.length; break; }
          const n = parseInt(rest.slice(i, e), 16);
          if (!(n > 0)) { const t = rest.indexOf('\r\n\r\n', e); trailers = rest.slice(e + 2, t < 0 ? rest.length : t).split('\r\n').filter(Boolean); i = t < 0 ? rest.length : t + 4; break; }
          o += rest.slice(e + 2, e + 2 + n); i = e + 4 + n;
        }
        body = o; rest = rest.slice(i);
      } else { const cl = lower.find((l) => l.startsWith('content-length:')); if (cl) { const n = Number(cl.split(':')[1]); body = rest.slice(0, n); rest = rest.slice(n); } else { body = rest; rest = ''; } }
      out.push({ infos, status: head[0], lines, body: digest(Buffer.from(body, 'latin1')), trailers });
    }
    return out;
  };
  const lc = (n) => String(n).split(':')[0].toLowerCase();
  /** the plain form's answer and the interface's, reduced by the declared list only (relay.js DECLARED, by name) */
  const declared = (v, old) => (old ? { ...v, lines: v.lines.filter((l) => !RELAY.OLD_PAGE_DROPS.has(lc(l))) } : v);   // DECLARED.oldPage — its own lines only (a length line is compared)
  const dropOrphan = (raw) => { const out = []; for (let i = 0; i + 1 < raw.length; i += 2) if (lc(raw[i]) !== 'trailer') out.push(raw[i], raw[i + 1]); return out; };
  // DECLARED.orphanTrailer; and the port read as the fact it must be — the page's own (the plain form's connection and the interface's are two)
  const seenView = (x, old, chunked, pagePort) => (x ? { ...x, version: old ? '(DECLARED.version)' : x.version, raw: chunked ? x.raw : dropOrphan(x.raw), port: x.port === pagePort ? 'the page\'s own' : x.port } : null);
  const N = 300, diffs = [], tally = {}, declaredSeen = {}, arms = { tls: 0, kept: 0 }; let inner = 0, innerOpened = 0, alive = 0;
  // after the seeded N, FIXED cases: one for each declared entry a seed meets rarely (an HTTP/1.0 head with no Host line)
  const FIXED = [{ method: 'GET', target: '/api/home', old: true, up: false, answer: 'length', hs: [], bodyKind: 'none', pad: '', host: '', tokens: false }];
  for (let i = 0; i < N + FIXED.length; i++) {
    const F = i >= N ? FIXED[i - N] : null;
    const method = F ? F.method : pick(METHODS), target = F ? F.target : pick(TARGETS), old = F ? F.old : rnd() < 0.12, up = F ? F.up : !old && rnd() < 0.08;
    const answer = F ? F.answer : pick(old || method === 'HEAD' ? ANSWERS.filter((x) => x !== 'trailers') : ANSWERS);   // trailers need a chunked answer: Node's own writer refuses them to HTTP/1.0 and to HEAD, in either form
    const hs = F ? F.hs : Array.from({ length: Math.floor(rnd() * 6) }, () => pick(HEADERS));
    const bodyKind = F ? F.bodyKind : up ? pick(['none', 'length']) : method === 'GET' || method === 'HEAD' ? pick(['none', 'none', 'length']) : pick(BODIES);
    const pad = F ? F.pad : rnd() < 0.06 ? 'X-Pad: ' + 'p'.repeat(16384 - 400 + Math.floor(rnd() * 600)) + '\r\n' : '';   // heads at the size limit: some just under, some over
    const payload = bodyKind === 'inner-head' ? 'GET /inner HTTP/1.1\r\nHost: hub.example\r\n\r\n' : 'x'.repeat(1 + Math.floor((F ? 0.5 : rnd()) * 80));
    let framing = '', body = '';
    if (bodyKind === 'length' || bodyKind === 'inner-head') { framing = `Content-Length: ${payload.length}\r\n`; body = payload; }
    else if (bodyKind === 'chunked') { framing = 'Transfer-Encoding: chunked\r\n'; body = `${payload.length.toString(16)};ext=1\r\n${payload}\r\n0\r\n\r\n`; }
    else if (bodyKind === 'chunked+trailers') { framing = 'Transfer-Encoding: chunked\r\nTrailer: X-Sum\r\n'; body = `${payload.length.toString(16)}\r\n${payload}\r\n0\r\nX-Sum: ${digest(payload)}\r\n\r\n`; }
    else if (bodyKind === 'both') { framing = `Content-Length: ${payload.length}\r\nTransfer-Encoding: chunked\r\n`; body = `${payload.length.toString(16)}\r\n${payload}\r\n0\r\n\r\n`; }
    else if (bodyKind === 'expect') { framing = `Expect: 100-continue\r\nContent-Length: ${payload.length}\r\n`; body = payload; }
    const secure = F ? false : rnd2() < 0.15, keep = F ? false : !old && !up && rnd2() < 0.25;   // the arms: an encrypted page; a kept-alive connection with a SECOND request
    const tokens = F ? F.tokens : rnd() < 0.3;
    const conn = up ? 'Connection: Upgrade\r\nUpgrade: websocket\r\n' : `${tokens ? 'Connection: keep-alive, X-Token\r\nX-Token: 1\r\n' : ''}${keep ? '' : 'Connection: close\r\n'}`;
    const host = F ? F.host : rnd() < 0.05 ? '' : 'Host: hub.example\r\n';
    const bytes = `${method} ${target} HTTP/1.${old ? 0 : 1}\r\n${host}X-Answer: ${answer}\r\n${hs.map(([k, v]) => `${k}: ${v}\r\n`).join('')}${pad}${framing}${conn}\r\n${body}` + (keep ? SECOND : '');
    const methods = keep ? [method, 'GET'] : [method];
    const hostless = old && !host && !hs.some(([k]) => k.toLowerCase() === 'host');   // DECLARED.oldHostless: the hub reads it as HTTP/1.1 with no Host
    const p0 = plainSeen.length, h0 = hubSeen.length, c0 = ifaceCls.length, o0 = P.iface.stats().opened;
    const a = await ask((secure ? plainTls : plain).address().port, bytes, secure), b = await ask(P.port, bytes, secure);
    const chunked = bodyKind.startsWith('chunked');
    const va = viewAll(a.text, methods).map((v) => declared(v, old)), vb = viewAll(b.text, methods).map((v) => declared(v, old));
    const sa = plainSeen.slice(p0).map((x) => seenView(x, old, chunked, a.localPort)), sb = hubSeen.slice(h0).map((x) => seenView(x, old, chunked, b.localPort));
    if (secure && sb.length) arms.tls++; if (keep && sb.length > 1) arms.kept++;
    const clsSame = hubSeen.slice(h0).every((x, j) => x.cls === ifaceCls[c0 + j]);
    const opened = P.iface.stats().opened - o0;
    if (bodyKind === 'inner-head') { inner++; if (opened === sb.length && sb.length <= 1) innerOpened++; }
    const same = hostless ? /^HTTP\/1\.1 400 /.test((vb[0] || {}).status) && sb.length === 0 && !b.timedOut   // the declared refusal, by Node at the hub
      : JSON.stringify(va) === JSON.stringify(vb) && JSON.stringify(sa) === JSON.stringify(sb) && clsSame && !a.timedOut && !b.timedOut && opened === sb.length;
    const met = (k) => { declaredSeen[k] = (declaredSeen[k] || 0) + 1; };
    if (hostless) met('oldHostless'); else if (old && sb.length) met('version'), met('oldPage');
    if (!chunked && sb.length && hs.some(([k]) => k === 'Trailer')) met('orphanTrailer');
    if (chunked && sb.length) met('chunks');
    if (answer === '1xx' && sb.length) met('informational');
    const key = `${((va[0] || {}).status || '(nothing)').split(' ').slice(0, 2).join(' ')}`; tally[key] = (tally[key] || 0) + 1;
    if (!same) diffs.push({ i, secure, keep, bytes: bytes.slice(0, 260), plain: { view: va, seen: sa, timedOut: a.timedOut }, through: { view: vb, seen: sb, timedOut: b.timedOut, opened, cls: ifaceCls.slice(c0) } });
    if ((await get(P.port, '/alive')).status === 200) alive++;
  }
  console.log(`    the seed ${SEED} (FRAMING_SEED replays another) · ${N} requests · their answers: ${Object.entries(tally).map(([k, v]) => `${k} ×${v}`).join(' · ')} · declared cases met: ${JSON.stringify(declaredSeen)} · the arms met: ${arms.tls} encrypted pages, ${arms.kept} kept-alive connections answered twice`);
  const partsOf = (d) => { const a = d.plain, b = d.through, out = []; const n = Math.max(a.view.length, b.view.length); if (a.view.length !== b.view.length) out.push(`answers ${a.view.length}/${b.view.length}`); for (let j = 0; j < n; j++) for (const k of ['infos', 'status', 'lines', 'body', 'trailers']) if (JSON.stringify((a.view[j] || {})[k]) !== JSON.stringify((b.view[j] || {})[k])) out.push(`${k}#${j}`); if (JSON.stringify(a.seen) !== JSON.stringify(b.seen)) out.push('seen'); if (a.timedOut || b.timedOut) out.push('timedOut'); if (b.opened !== b.seen.length) out.push('opened'); return out.join('+') || 'cls'; };
  for (const d of diffs) console.log(`    DIFFERS #${d.i} ${d.bytes.split('\r\n')[0]} [${partsOf(d)}] ${d.bytes.includes('Expect') ? 'expect ' : ''}${/Upgrade: /.test(d.bytes) ? 'upgrade ' : ''}${d.bytes.includes('Trailer') ? 'trailer ' : ''}${d.secure ? 'tls ' : ''}${d.keep ? 'kept ' : ''}`);
  for (const d of diffs.slice(0, 2)) console.log(`    THE FIRST, WHOLE: ${JSON.stringify(d).slice(0, 1400)}`);
  ok(diffs.length === 0, `${N} generated requests (targets absolute, «*», «//», dot segments, %2e, a byte above 0x7f; duplicated and reordered Cookie / Authorization / Origin / Sec-Fetch-Site / Host / X-Forwarded-*; no body, a length, chunked with extensions and trailers, a length AND chunked, Expect, a head inside a body; Connection tokens; upgrades with and without a body; HTTP/1.0; heads at the size limit; answers by length, chunked, streamed, with trailers, close-delimited, 204, 304, 102 + 103, to HEAD; encrypted pages; kept-alive connections answered twice; the stamp's address, port and encrypted flag as the handler sees them): what the hub's handler saw and what the page got are the plain form's but for the declared list (${Object.keys(RELAY.DECLARED).join(', ')}), the door class equal at both ends — ${diffs.length} differ`, diffs.slice(0, 2));
  ok(Object.keys(RELAY.DECLARED).every((k) => declaredSeen[k] > 0), `every entry of the declared list was MET by a case and read by its name (${Object.keys(RELAY.DECLARED).map((k) => `${k} ×${declaredSeen[k] || 0}`).join(' · ')}) — none is declared unseen`, declaredSeen);
  ok(arms.tls > 0 && arms.kept > 0, `the arms were met: ${arms.tls} encrypted pages, ${arms.kept} kept-alive connections answered twice on one connection`, arms);
  ok(inner > 0 && innerOpened === inner, `a head inside a body (${inner} cases) opens no channel of its own (${innerOpened} with one open line or none, as the plain hub served one head)`);
  ok(alive === N + FIXED.length, `the interface answered after every case (${alive} of ${N + FIXED.length})`);
  // RED CONTROLS: a forwarder that JOINS duplicate lines; one that RE-ENCODES the target
  const joins = mutant('src/interface/relay.js', 'headers: requestLines(req.rawHeaders),', 'headers: Object.entries(req.headers).flat(),');
  const reenc = mutant('src/interface/relay.js', 'path: req.url,', 'path: encodeURI(decodeURI(req.url)),');
  async function redOf(mod, bytes) {
    const p0 = plainSeen.length; const a = await ask(plain.address().port, bytes); const sa = plainSeen.slice(p0).map((x) => seenView(x, false, true, a.localPort));
    const tap2 = []; const PR = await pair(makeEcho(tap2), { relayMod: mod }); const b = await ask(PR.port, bytes); await PR.close();
    const sb = tap2.map((x) => seenView(x, false, true, b.localPort));
    return { differs: JSON.stringify(sa) !== JSON.stringify(sb) || JSON.stringify(viewAll(a.text, ['GET'])) !== JSON.stringify(viewAll(b.text, ['GET'])), plain: sa[0] && [sa[0].url, sa[0].raw], through: sb[0] && [sb[0].url, sb[0].raw] };
  }
  // and the reader's own control: the SAME relay through redOf differs on nothing (so each red above is the mutant's alone)
  const sameRelay = await redOf(RELAY, 'GET /dup HTTP/1.1\r\nHost: hub.example\r\nCookie: a=1\r\nCookie: b=2\r\nConnection: close\r\n\r\n');
  ok(!sameRelay.differs, 'the reds\' own reader, given today\'s relay, finds no difference (each red below differs by its mutant alone)', sameRelay);
  const dup = await redOf(joins, 'GET /dup HTTP/1.1\r\nHost: hub.example\r\nCookie: a=1\r\nCookie: b=2\r\nConnection: close\r\n\r\n');
  ok(dup.differs, `RED CONTROL — a forwarder that joins duplicate lines: the differential differs on two Cookie lines (${JSON.stringify(dup.plain)} → ${JSON.stringify(dup.through)})`, dup);
  const enc = await redOf(reenc, 'GET /p%7Eq/caf%C3%A9 HTTP/1.1\r\nHost: hub.example\r\nConnection: close\r\n\r\n');
  const utf8 = mutant('src/interface/relay.js', 'createConnection: () => headsAsLatin1(sock),', 'createConnection: () => sock,');   // stale-pins: kept (the red plants the relay as it was before headsAsLatin1)
  const exp = await redOf(utf8, 'POST /e HTTP/1.1\r\nHost: hub.example\r\nX-Weird: v\u00e9\r\nExpect: 100-continue\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok');
  ok(exp.differs, `RED CONTROL — the channel socket left to Node's Expect flush (no latin1): an Expect head's byte above 0x7f reaches the hub re-encoded as UTF-8 (${JSON.stringify(exp.plain && exp.plain[1][3])} → ${JSON.stringify(exp.through && exp.through[1][3])})`, exp);
  ok(enc.differs, `RED CONTROL — a forwarder that re-encodes the target: the differential differs on /p%7Eq/caf%C3%A9 (${JSON.stringify(enc.plain && enc.plain[0])} → ${JSON.stringify(enc.through && enc.through[0])})`, enc);
  await P.close(); plain.close(); plainTls.close();
}

lap('⑧ ');
console.log('— ⑧ EVERY CLOCK ON A PAGE SOCKET IS THE INTERFACE\'S, named, and each fires in its own case');
{
  const names = { PAGE_HEAD_MS: FRONT.PAGE_HEAD_MS, PAGE_REQUEST_MS: FRONT.PAGE_REQUEST_MS, PAGE_IDLE_MS: FRONT.PAGE_IDLE_MS, PAGE_MAX_HEAD: FRONT.PAGE_MAX_HEAD, PAGE_CHECK_MS: FRONT.PAGE_CHECK_MS };
  const plainForm = http.createServer();
  ok(FRONT.PAGE_HEAD_MS >= plainForm.headersTimeout && FRONT.PAGE_REQUEST_MS >= plainForm.requestTimeout && FRONT.PAGE_IDLE_MS >= plainForm.keepAliveTimeout && FRONT.PAGE_MAX_HEAD >= http.maxHeaderSize && FRONT.PAGE_CHECK_MS <= plainForm.connectionsCheckingInterval,
    `the named clocks ${JSON.stringify(names)} are no shorter than the plain form's (${plainForm.headersTimeout} / ${plainForm.requestTimeout} / ${plainForm.keepAliveTimeout} ms, ${http.maxHeaderSize} B; looked at every ${plainForm.connectionsCheckingInterval} ms)`);
  plainForm.close();
  const CLOCKS = { headMs: 150, requestMs: 300, idleMs: 150, maxHead: 2048, checkMs: 25 };   // short ones handed to the page server, each fired below
  const firstLine = (s) => s.got.toString().split('\r\n')[0] || (s.ended ? '(closed)' : '(open)');
  async function silentHead(frontMod) {
    const P = await pair((req, res) => res.end('ok'), { clocks: CLOCKS, frontMod });
    const s = await rawPage(P.port); s.write('GET / HTTP/1.1\r\nHost: hub.example\r\n');
    await until(() => s.ended, 5 * CLOCKS.headMs);
    const r = { line: firstLine(s), ended: s.ended, opened: P.iface.stats().opened }; s.destroy(); await P.close(); return r;
  }
  const head = await silentHead();
  const P = await pair((req, res) => { req.on('data', () => { }); req.on('end', () => res.end('ok')); }, { clocks: CLOCKS });
  const slow = await rawPage(P.port); slow.write('POST / HTTP/1.1\r\nHost: hub.example\r\nContent-Length: 100\r\n\r\nabc');
  await until(() => slow.ended, 2500);
  const idle = await rawPage(P.port); idle.write('GET / HTTP/1.1\r\nHost: hub.example\r\n\r\n');
  await until(() => idle.got.includes('ok'), 1000); const answered = idle.got.length; await until(() => idle.ended, 3000);
  const big = await rawPage(P.port); big.write(`GET / HTTP/1.1\r\nHost: hub.example\r\nX-Big: ${'b'.repeat(4096)}\r\n\r\n`);
  await until(() => big.ended, 2000);
  console.log(`    a silent head: «${head.line}» · a slow body: «${firstLine(slow)}» · an idle kept-alive connection: ${idle.ended ? 'closed by the interface, nothing more sent' : 'still open'} · a head over the bound: «${firstLine(big)}»`);
  ok(/^HTTP\/1\.1 408/.test(head.line) && head.opened === 0, `the head's clock (${CLOCKS.headMs} ms here): Node's 408, no channel opened`, head);
  ok(/^HTTP\/1\.1 408/.test(firstLine(slow)), `the whole request's clock (${CLOCKS.requestMs} ms here): a body that never comes whole is answered Node's 408`);
  ok(idle.ended && idle.got.length === answered && /\r\nConnection: keep-alive\r\n/i.test(idle.got.toString()), `the idle clock (${CLOCKS.idleMs} ms here): a kept-alive connection (its answer said keep-alive) that sends nothing more is closed by the interface, with no byte more written`);
  ok(/^HTTP\/1\.1 431/.test(firstLine(big)), `the head's size (${CLOCKS.maxHead} B here): Node's 431`);
  // three poll-period requests of one tab ride ONE accept
  let accepts = 0; const agent = new http.Agent({ keepAlive: true, maxSockets: 1 }); const cc = agent.createConnection.bind(agent); agent.createConnection = (...a) => { accepts++; return cc(...a); };
  const before = P.iface.stats().opened;
  for (let i = 0; i < 3; i++) { await get(P.port, `/poll${i}`, { agent }); await sleep(40); }
  agent.destroy();
  ok(P.iface.stats().opened - before === 3 && accepts === 1, `three poll-period requests of one tab: ${P.iface.stats().opened - before} channels over ${accepts} accept`);
  // a reset inside an upgrade head leaves the interface answering
  const rs = await rawPage(P.port); rs.write('GET /ws HTTP/1.1\r\nHost: hub.example\r\nConnection: Upg'); await sleep(20); rs.resetAndDestroy(); await sleep(30);
  ok((await get(P.port, '/after')).status === 200, 'a reset inside an upgrade head: the interface answers the next page');
  await P.close();
  // an upgraded socket never outlives its channel
  const P2 = await pair((req, res) => res.end('x'));
  P2.hub.on('upgrade', (req, socket) => { socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: x\r\nConnection: Upgrade\r\n\r\n'); setTimeout(() => socket.destroy(), 80); });
  const up = await rawPage(P2.port); up.write('GET /ws HTTP/1.1\r\nHost: hub.example\r\nConnection: Upgrade\r\nUpgrade: x\r\n\r\n');
  await until(() => up.ended, 3000);
  ok(/^HTTP\/1\.1 101/.test(firstLine(up)) && up.ended && P2.iface.stats().channels === 0, `an upgraded socket whose channel ended is closed with it («${firstLine(up)}», then closed: ${up.ended})`);
  await P2.close();
  // RED CONTROL: the page server never told it listens ⇒ Node never looks at the head and request clocks
  const deaf = mutant('src/interface/front.js', "  pages.emit('listening');\n", '');
  const red = await silentHead(deaf);
  ok(!red.ended, `RED CONTROL — the page server never told it listens: the silent head is still open after five times its clock («${red.line}»)`, red);
}

lap('⑨ ');
console.log('— ⑨ A REQUEST WITH NO OWNER IS ANSWERED BY NAME');
{
  const P = await pair(() => { }, { link: false });
  const r = await get(P.port, '/api/home');
  let body = {}; try { body = JSON.parse(r.body); } catch { }
  ok(r.status === 503 && body.error === 'no-owner', `no link: ${r.status} ${JSON.stringify(body)} — answered by name, never a closed socket`, r);
  const u = await rawPage(P.port); u.write('GET /ws HTTP/1.1\r\nHost: hub.example\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  await until(() => u.ended, 2000);
  ok(/^HTTP\/1\.1 503/.test(u.got.toString()) && u.got.toString().includes('"no-owner"'), `an upgrade with no link: «${u.got.toString().split('\r\n')[0]}» by name, then closed`);
  await P.close();
}

lap('⑩ ');
console.log('— ⑩ NO PAGE BYTE IS A CONTROL LINE: the channel numbers stop before 0');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(read('src/interface/relay.js')), cs = strip(read('src/agentd/chan-socket.js'));
  const controls = (src.match(/\.control\(/g) || []).length, datas = (src.match(/\.data\(/g) || []).length, csDatas = (cs.match(/\.data\(/g) || []).length;
  ok(controls === 1 && datas === 0 && csDatas === 1, `the relay holds ONE control() call (${controls}) and no data() call (${datas}): a page's bytes reach the link only through the channel socket's one write (${csDatas} data() in src/agentd/chan-socket.js)`);
  /** a hub that records the address of every channel it is handed (a forged open line shows its stamp's) */
  const hubWith = () => { const seen = []; const h = http.createServer((req, res) => { req.on('data', () => { }); req.on('end', () => res.end('ok')); }); h.on('connection', (s) => seen.push(s.remoteAddress)); return { h, seen }; };
  const FORGED = JSON.stringify({ op: 'open', chan: 99, to: 'hub', trace: 'x', stamp: { secure: true, addr: '203.0.113.66', port: 1 } }) + '\n';
  const post = (port) => new Promise((resolve) => { const q = http.request({ host: '127.0.0.1', port, path: '/three', method: 'POST', agent: false, headers: { 'content-length': Buffer.byteLength(FORGED) } }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }); q.on('error', () => resolve({ status: 0 })); q.setTimeout(1500, () => { q.destroy(); resolve({ status: 0, timedOut: true }); }); q.end(FORGED); });
  const law = hubWith();
  const P = await pair(law.h, { firstChan: RELAY.LAST_CHAN - 1 });
  const a = await get(P.port, '/one'), b = await get(P.port, '/two'), c = await post(P.port);
  let cb = {}; try { cb = JSON.parse(c.body); } catch { }
  await sleep(50);
  ok(a.status === 200 && b.status === 200 && c.status === 503 && cb.error === 'no-owner' && /spent/.test(cb.why || '') && !law.seen.includes('203.0.113.66'), `seeded under the last channel number (${RELAY.LAST_CHAN - 1}): ${a.status}, ${b.status}, then ${c.status} «${cb.why}» — channel 0 never opened, the page's JSON line never a control line (the hub was handed ${JSON.stringify(law.seen)})`, { a: a.status, b: b.status, c, seen: law.seen });
  await P.close();
  const wraps = mutant('src/interface/relay.js', '    if (next > LAST_CHAN) {', '    if (false) {');
  const redHub = hubWith();
  const R = await pair(redHub.h, { relayMod: wraps, firstChan: RELAY.LAST_CHAN - 1 });
  await get(R.port, '/one'); await get(R.port, '/two'); post(R.port);   // its answer never comes (it went out on channel 0): not waited for
  await until(() => redHub.seen.includes('203.0.113.66'), 1500);
  ok(redHub.seen.includes('203.0.113.66'), `RED CONTROL — the guard cut: the next exchange's bytes go out on channel 0 and the page's JSON line reaches the hub as a CONTROL line — a forged open line, its stamp «203.0.113.66» (${JSON.stringify(redHub.seen)})`, redHub.seen);
  await R.close();
}

lap('the end');
console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// THE INTERFACE UNDER A PAGE THAT STOPS (the separation, M1 — lane B; 主开发 r1057 items 1 and 4, on the framing unit).
// Law 8 on the ORDINARY exchange road, and law 9 for a refused upgrade, through src/interface/ with today's hub joined over a
// real link (src/server/interface-party.js, the tree's frame code on a unix socket):
//   ① AN ANSWER TO A PAGE THAT STOPS READING: a 32 MB answer to a page that stops reading — what waits in the interface stays
//     within one credit window and the streams' own marks, and the page that reads again gets every byte. RED CONTROL: the
//     answer taken with no back-pressure (each chunk written whatever write() says) holds megabytes here.
//   ② AN UPLOAD TO AN OWNER THAT STOPPED READING: 16 MB posted to a hub handler that never reads — the page socket is paused and
//     what the interface took from it stays within one window and the streams' marks. RED CONTROL: the body taken with no
//     back-pressure — megabytes taken from the page.
//   ③ A REFUSED UPGRADE'S WORDS REACH A SLOW PAGE WHOLE (law 9: by name, never a closed socket): the hub answers an upgrade
//     with a 16 MB refusal and ends; the page reads it 200 ms later and gets every byte; and in-process, deterministically, a
//     page whose writes land late gets every byte of a 1 MB refusal. RED CONTROL: the page socket destroyed the moment its
//     channel closed (the framing unit's first form) ⇒ the slow page loses the last words.
// in-process; a scratch dir under os.tmpdir().
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { Duplex } from 'node:stream';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 900) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lapAt = performance.now(), lapName = 'the start';
const lap = (name) => { const now = performance.now(); console.log(`    (${lapName}: ${Math.round(now - lapAt)} ms)`); lapAt = now; lapName = name; };   // printed for the row's time, never judged
const until = async (f, ms = 5000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await sleep(5); } return true; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iface-bp-'));
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
function compileAt(rel, src) { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; }
/** `rel`'s source with ONE piece swapped — the needle must occur exactly once, or the control is void (it throws) */
function mutant(rel, needle, into) { const src = read(rel); if (src.split(needle).length !== 2) throw new Error(`CONTROL needle not found exactly once in ${rel}: ${needle.slice(0, 80)}`); return compileAt(rel, src.replace(needle, into)); }
const { INITIAL_WINDOW } = require(path.join(REPO, 'src/agentd/mux.js'));
const secretPair = () => { const s = crypto.randomBytes(32).toString('hex'); return { secret: s, digest: crypto.createHash('sha256').update(s).digest('hex') }; };

/** the interface (index.js, a relay swapped in if asked) + today's hub party joined over a real link, serving `handler` */
let nBoot = 0;
async function pair(handler, { relayMod = null } = {}) {
  let idx = read('src/interface/index.js');
  if (relayMod) { globalThis.__vsRelayBP = relayMod; idx = idx.replace("require('./relay.js')", 'globalThis.__vsRelayBP'); }
  const iface = compileAt('src/interface/index.js', idx).create();
  const where = await iface.listen(0, '127.0.0.1');
  const sockPath = path.join(T, `p${++nBoot}.sock`);
  const linkSrv = net.createServer((s) => iface.attachLink(s)).listen(sockPath);
  await new Promise((r) => linkSrv.once('listening', r));
  const hub = http.createServer(handler);
  const k = secretPair(); iface.admit({ party: 'hub', digest: k.digest });
  const party = await require(path.join(REPO, 'src/server/interface-party.js')).join({ start: { party: 'hub', secret: k.secret, link: sockPath }, server: hub, log: { error: () => { } } });
  return { iface, port: where.port, hub, party, close: async () => { try { party.mux.destroy(); } catch { } await iface.close(); linkSrv.close(); hub.close(); } };
}
const connected = (port) => new Promise((resolve) => { const s = net.connect(port, '127.0.0.1', () => resolve(s)); s.on('error', () => { }); });
/** read a stat until it stops moving (ten 10 ms looks alike), the largest seen with it */
async function settled(read1) { let last = -1, steady = 0, max = 0; for (let i = 0; i < 300 && steady < 10; i++) { await sleep(10); const v = read1(); max = Math.max(max, v); steady = v === last && v > 0 ? steady + 1 : 0; last = v; } return { value: read1(), max }; }
const MARKS = 5 * 65536;   // the streams between page and channel (the page's response or request, the client's request or answer): each holds at most its 16 KiB mark plus one 64 KiB read

lap('① ');
console.log('— ① AN ANSWER TO A PAGE THAT STOPS READING: one window waits here, the rest in the hub');
{
  const BIG = 32 * 1024 * 1024, CH = Buffer.alloc(65536, 7);
  const big = (req, res) => { res.writeHead(200, ['Content-Length', String(BIG)]); let left = BIG; const pump = () => { while (left > 0) { left -= CH.length; if (!res.write(CH)) { res.once('drain', pump); return; } } res.end(); }; pump(); };
  async function stalled(relayMod) {
    const P = await pair(big, { relayMod });
    const s = await connected(P.port); s.pause();   // the page stops reading
    s.write('GET /big HTTP/1.1\r\nHost: hub.example\r\n\r\n');
    const h = await settled(() => P.iface.stats().held);
    let got = 0; s.on('data', (b) => { got += b.length; }); s.resume();   // the page reads again
    await until(() => got >= BIG, 15000);
    s.destroy(); await P.close();
    return { held: h.value, maxHeld: h.max, got };
  }
  const law = await stalled();
  ok(law.maxHeld > 0 && law.held <= INITIAL_WINDOW + MARKS, `a 32 MB answer to a page that stops reading: ${law.held} bytes wait in the interface (seen above zero: ${law.maxHeld}) — at most one window (${INITIAL_WINDOW}) in the channel socket and the streams' marks (${MARKS}); the rest waits in the hub`, law);
  ok(law.got >= BIG, `the page reads again: ${law.got} bytes arrive (the answer whole, its head with it)`, law);
  const greedy = mutant('src/interface/relay.js', '      a.pipe(res, { end: false });', "      a.on('data', (b) => res.write(b));");
  const red = await stalled(greedy);
  ok(red.held > 4 * INITIAL_WINDOW, `RED CONTROL — the answer taken with no back-pressure: ${red.held} bytes wait in the interface`, red);
}

lap('② ');
console.log('— ② AN UPLOAD TO AN OWNER THAT STOPPED READING: the page socket is paused');
{
  const UP = 16 * 1024 * 1024;
  const deaf = () => { };   // never reads its request, never answers
  async function upload(relayMod) {
    const P = await pair(deaf, { relayMod });
    const s = await connected(P.port);
    s.write(`POST /deaf HTTP/1.1\r\nHost: hub.example\r\nContent-Length: ${UP}\r\n\r\n`);
    const chunk = Buffer.alloc(65536, 3); let sent = 0;
    const pump = () => { while (sent < UP) { sent += chunk.length; if (!s.write(chunk)) { s.once('drain', pump); return; } } };
    pump();
    const t = await settled(() => P.iface.stats().toLink);
    const st = P.iface.stats();
    s.destroy(); await P.close();
    return { toLink: t.value, paused: st.paused, held: st.held };
  }
  const law = await upload();
  ok(law.paused >= 1 && law.toLink <= INITIAL_WINDOW + 2 * MARKS, `16 MB posted to a hub handler that never reads: the page's request is paused (${law.paused}) and ${law.toLink} bytes were taken from the page — one window at the hub and the streams' marks on both sides (${INITIAL_WINDOW + 2 * MARKS}); the rest stays in the page's own buffers`, law);
  const greedy = mutant('src/interface/relay.js', '    req.pipe(out, { end: false }); tap(req);', "    req.on('data', (b) => out.write(b)); tap(req);");
  const red = await upload(greedy);
  ok(red.toLink > 8 * INITIAL_WINDOW, `RED CONTROL — the body taken with no back-pressure: ${red.toLink} bytes taken from the page and queued here for an owner that reads nothing`, red);
}

lap('③ ');
console.log('— ③ A REFUSED UPGRADE\'S WORDS REACH A SLOW PAGE WHOLE (law 9: by name, never a closed socket)');
{
  const N = 16 * 1024 * 1024;
  const HEAD = `HTTP/1.1 401 Unauthorized\r\nContent-Length: ${N}\r\nConnection: close\r\n\r\n`;
  async function refused(relayMod) {
    const P = await pair((req, res) => res.end('x'), { relayMod });
    P.hub.on('upgrade', (req, socket) => { socket.on('error', () => { }); socket.write(HEAD); socket.end(Buffer.alloc(N, 0x61)); });   // a refusal with a long body, then its end
    const s = await connected(P.port); s.pause();   // a slow page
    s.write('GET /ws HTTP/1.1\r\nHost: hub.example\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    await sleep(200);
    let got = 0; s.on('data', (b) => { got += b.length; }); s.resume();
    await until(() => s.destroyed || got >= HEAD.length + N, 8000); await sleep(20);
    const r = { got, want: HEAD.length + N }; s.destroy(); await P.close(); return r;
  }
  const law = await refused();
  ok(law.got === law.want, `end to end: a hub's 401 with a 16 MB body to an upgrade, read 200 ms late by the page: ${law.got} of ${law.want} bytes — every word, then the close`, law);
  // the same road, in-process and deterministic: a page whose every write lands 2 ms late still holds unwritten words when its
  // channel closes (over a real socket the kernel takes them first, so a destroy there loses nothing a run can see)
  const RELAY = require(path.join(REPO, 'src/interface/relay.js'));
  async function slowPage(mod) {
    const R = mod.create({ ownerOf: () => 'hub' });
    const fake = { closesAfterQueue: true, control: () => { }, data: () => true, credit: () => { }, closeChan: () => { } };
    const h = R.handlersFor(fake); R.attach(fake);
    let delivered = 0;
    const page = new Duplex({ read() { }, write(c, e, cb) { setTimeout(() => { delivered += c.length; cb(); }, 2); } }); page.on('error', () => { });
    R.upgrade({ method: 'GET', url: '/ws', httpVersion: '1.1', rawHeaders: ['Host', 'hub.example', 'Connection', 'Upgrade', 'Upgrade', 'websocket'] }, page, Buffer.alloc(0), { secure: false, addr: '203.0.113.5', port: 5 });   // channel 1
    const words = Buffer.concat([Buffer.from(HEAD.replace(String(N), String(1 << 20))), Buffer.alloc(1 << 20, 0x61)]);   // a 1 MB refusal
    for (let i = 0; i < words.length; i += 65536) h.onData(1, words.subarray(i, i + 65536));
    h.onClose(1);   // then the hub's CLOSE
    await until(() => delivered >= words.length || page.destroyed, 5000); await sleep(30);
    return { delivered, want: words.length, destroyed: page.destroyed };
  }
  const slow = await slowPage(RELAY);
  ok(slow.delivered === slow.want, `a page whose writes land late: all ${slow.delivered} of ${slow.want} bytes of the refusal reach it before its socket goes`, slow);
  const LINGER = "    sock.once('close', () => {   // an upgraded socket never outlives its channel — but its last words (a 401, a 404) are written first\n";
  const hasty = mutant('src/interface/relay.js', LINGER, "    sock.once('close', () => { socket.destroy(); return;   // the first form: destroyed at once\n");
  const red = await slowPage(hasty);
  ok(red.delivered < red.want, `RED CONTROL — the page socket destroyed the moment its channel closed: ${red.delivered} of ${red.want} bytes — the last words lost`, red);
}

lap('the end');
console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

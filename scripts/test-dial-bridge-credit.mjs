#!/usr/bin/env node
// THE DIAL BRIDGE FOLLOWS CREDIT (主开发 2026-11-17 — a master defect the separation's skeptic confirmed on the release, with a
// twin): src/dial-session-bridge.js stands between a DIALLED device's link and the attach client of one session. The hub
// credited the device as it DELIVERED the session's output while the bridge threw away the attach link's answer, so a stalled
// attach client made the HUB hold the session's whole output; the input road credited the attach client at once whatever the
// device link took. In process, by a stall PLACED in the reader (never by load): the device link is an in-memory pair that
// delivers each turn's writes as ONE read (as a socket does) to a fake device answering the hub's hello and its opens; the
// hub's side is the REAL DeviceManager (a `stream` transport) and the REAL bridge on a loopback port; the attach side a Mux
// that credits nothing until told. Chunks are NUMBERED (each 64 KiB chunk filled with its index): content, order and exact
// counts are asserted.
//   §1 output — sixteen chunks, the attach side never credits: the device is credited for exactly one window, eight chunks
//      wait AT THE DEVICE; the attach side reads and all sixteen arrive in order, every byte credited. RED: the release's
//      output road — every chunk credited.
//   §2 input — sixteen chunks from the attach side, the device never credits: the attach side is credited for exactly one
//      window, the hub queues one window toward the device; the device reads and all sixteen arrive in order. RED: the
//      release's input road — credited at once.
//   §3 THE GAP — the device answers the open and sends a whole window in ONE read: every byte arrives in order and the device
//      is credited for all of it. RED: the gap as reviewed (no handler there) — the window is lost and never credited.
//   §4 THE ORPHAN — an attach closed in mid-stall: the device is credited for what was owed and for every later byte (the
//      release's road), nothing waits at the device; a new attach on the same session reads its own chunks in order. RED: no
//      orphan road — eight chunks stay queued at the device for good.
//   §5 the terminal road (open-session) holds one window the same way (RED: the release's output road).
//   §6 a client that did not opt in still credits as it delivers (the release's road), the bridge untouched.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new Error('ok(name, cond): a swapped call');   /* the release's §7b swap guard (restack-411) */ if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// waits on an EFFECT with a deadline, never a fixed sleep
const until = async (f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(2); } return !!f(); };
const quiet = async (f, ms = 3000, n = 15) => { const t0 = Date.now(); let last, same = 0; while (Date.now() - t0 < ms) { const v = f(); if (v === last) { if (++same >= n) return v; } else { same = 0; last = v; } await sleep(3); } return f(); };
const { Mux, PROTO_VERSION, INITIAL_WINDOW } = require(path.join(REPO, 'src/agentd/mux.js'));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const BRF = 'src/dial-session-bridge.js';
const MUT = mutantCopies('dial-bridge-credit', REPO);
const real = require(path.join(REPO, BRF));
const mutant = (pairs, tag) => { let out = fs.readFileSync(path.join(REPO, BRF), 'utf8'); for (const [a, b] of pairs) { if (!out.includes(a)) return null; out = out.split(a).join(b); } return require(MUT.write(BRF, out, tag)); };
const releaseOutput = mutant([['manualCredit: true', 'manualCredit: false'], ['if (ok) { try { handle.credit(buf.length); } catch { } } else owedDevice += buf.length;', 'void ok;']], 'release-output');
const releaseInput = mutant([['if (ok) { try { mux.credit(chan, buf.length); } catch { } } else owedAttach += buf.length;', 'try { mux.credit(chan, buf.length); } catch { }']], 'release-input');
const gapAsReviewed = mutant([['handle.onData = (buf) => { early.push(buf); };', 'handle.onData = null;']], 'gap');
const noOrphan = mutant([['if (!isPty && handle) orphan();', 'void orphan;']], 'no-orphan');
// a link that delivers each turn's writes as ONE read (what a socket does with frames written together)
const pair = () => {
  const a = new EventEmitter(), b = new EventEmitter();
  const side = (to) => { let q = [], sched = false; return (d) => { q.push(Buffer.from(d)); if (!sched) { sched = true; setImmediate(() => { sched = false; const all = Buffer.concat(q); q = []; to.emit('data', all); }); } return true; }; };
  a.write = side(b); b.write = side(a); return [a, b];
};
const queuedOn = (mux, c) => (mux?._sendQ?.get(c) || []).reduce((n, b) => n + b.length, 0);
const tmp = scratch('dialbridge'); fs.mkdirSync(tmp, { recursive: true });
const CHUNK = 65536, N = 16, SID = 'dial-fixture-1', ATTACH_TOKEN = 'attach-fixture-' + 'secret';
const chunk = (i) => Buffer.alloc(CHUNK, i);
// the chunks a byte stream holds, in order: each must be whole and carry its own index
const indices = (bufs) => { const all = Buffer.concat(bufs); const out = []; for (let o = 0; o + CHUNK <= all.length; o += CHUNK) { const v = all[o]; out.push(all.subarray(o, o + CHUNK).every((x) => x === v) ? v : -1); } return out; };
const seq = (n, from = 0) => Array.from({ length: n }, (_, i) => from + i);

async function world(lib, { optIn = true } = {}) {
  const [hubEnd, devEnd] = pair();
  const dev = { chans: [], credited: new Map(), got: [], credits: true, onOpen: null };
  const D = new Mux(devEnd, {
    heartbeat: false,
    onControl: (m) => {
      if (m.op === 'hello') { D.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: 'fake-device', platform: 'linux', arch: 'x64', nodeVersion: process.version, capabilities: [] }); return; }
      if (m.op === 'attach-pipe-session' || m.op === 'open-pipe-session') { dev.chans.push(m.chan); D.control({ op: 'pipe-session-open', chan: m.chan, pid: 4242, existing: true }); dev.onOpen?.(m.chan); return; }
      if (m.op === 'open-session') { dev.chans.push(m.chan); D.control({ op: 'session-open', chan: m.chan, pid: 4343 }); dev.onOpen?.(m.chan); }
    },
    onData: (c, b) => { dev.got.push(b); if (dev.credits) D.credit(c, b.length); },
  });
  const dFrame = D._onFrame.bind(D);
  D._onFrame = (type, chan, payload) => { if (type === 2 && payload.length === 4) dev.credited.set(chan, (dev.credited.get(chan) || 0) + payload.readUInt32BE(0)); return dFrame(type, chan, payload); };
  const dm = new DeviceManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'data-')), bundlePath: path.join(tmp, 'no-bundle.js'), version: '0.0.0', transport: { kind: 'stream', getStream: () => hubEnd, hostToken: 'device-fixture-' + 'secret' }, log: () => { } });
  const bridge = new lib.DialSessionBridge({ deviceForDial: async () => dm, hostTokenFor: () => ATTACH_TOKEN, log: () => { } });
  const port = await bridge.ensure({ sid: SID, deviceId: 'dev-fixture' });
  const W = { D, dev, dm, bridge, attaches: [], last: () => dev.chans[dev.chans.length - 1], credOf: (c) => dev.credited.get(c) || 0 };
  W.attach = async ({ op = 'attach-pipe-session' } = {}) => {
    const sock = net.connect(port, '127.0.0.1'); await new Promise((r) => sock.once('connect', r));
    const att = { sock, ctl: [], got: [], credited: 0, credits: false };
    const A = new Mux(sock, { heartbeat: false, onControl: (m) => att.ctl.push(m), onData: (c, b) => { att.got.push(b); if (att.credits) A.credit(c, b.length); } });
    const aFrame = A._onFrame.bind(A);
    A._onFrame = (type, chan, payload) => { if (type === 2 && chan === 1 && payload.length === 4) att.credited += payload.readUInt32BE(0); return aFrame(type, chan, payload); };
    att.A = A; att.bytes = () => att.got.reduce((n, b) => n + b.length, 0);
    A.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: ATTACH_TOKEN });
    await until(() => att.ctl.some((m) => m.op === 'hello-ack'));
    const before = dev.chans.length;
    A.control(op === 'open-session' ? { op, chan: 1, cmd: '/bin/sh', args: [], cols: 80, rows: 24 } : { op, chan: 1, sid: SID, offset: 0 });
    att.opened = await until(() => att.ctl.some((m) => m.op === 'pipe-session-open' || m.op === 'session-open') && dev.chans.length > before);
    W.attaches.push(att); return att;
  };
  W.end = () => { for (const a of W.attaches) { try { a.sock.destroy(); } catch { } } try { bridge.close(SID); } catch { } try { dm.stop?.(); } catch { } try { hubEnd.emit('close'); devEnd.emit('close'); } catch { } };
  return W;
}

console.log('§1 output: a stalled attach client leaves the session\'s bytes at the device, not in the hub');
for (const [name, lib, want] of [['the bridge', real, true], ['RED CONTROL (the release\'s output road)', releaseOutput, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = await world(lib); const att = await W.attach(); const c = W.last();
  for (let i = 0; i < N; i++) W.D.data(c, chunk(i));          // sixteen numbered chunks; the device's own window paces them
  if (want) {
    const credited = await quiet(() => W.credOf(c));
    const atDevice = queuedOn(W.D, c), atAttach = att.bytes();
    ok(`${name}: the attach side credits nothing — the device is credited for exactly one window (${credited} B), ${atDevice / CHUNK} chunks wait AT THE DEVICE, the attach side holds chunks ${JSON.stringify(indices(att.got))}`, att.opened && credited === INITIAL_WINDOW && atDevice === 8 * CHUNK && atAttach === INITIAL_WINDOW && JSON.stringify(indices(att.got)) === JSON.stringify(seq(4)), { credited, atDevice, atAttach });
    att.credits = true; att.A.credit(1, atAttach);          // the attach side reads again
    await until(() => att.bytes() >= N * CHUNK && W.credOf(c) >= N * CHUNK);
    ok(`${name}: …the attach side reads again — all sixteen chunks arrive whole and in order, and the device is credited for every byte (${W.credOf(c)} of ${N * CHUNK})`, JSON.stringify(indices(att.got)) === JSON.stringify(seq(N)) && W.credOf(c) === N * CHUNK, { got: indices(att.got) });
  } else {
    const all = await until(() => W.credOf(c) >= N * CHUNK, 2000);
    ok(`${name}: every chunk is credited (${W.credOf(c)} of ${N * CHUNK}) while the attach side took ${att.bytes()} B — the hub holds the rest`, att.opened && all && att.bytes() === INITIAL_WINDOW, { credited: W.credOf(c), atAttach: att.bytes() });
  }
  W.end();
}
console.log('§2 input: a device that stops reading stops the attach client at one window');
for (const [name, lib, want] of [['the bridge', real, true], ['RED CONTROL (the release\'s input road)', releaseInput, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = await world(lib); const att = await W.attach(); const c = W.last(); W.dev.credits = false;   // the device takes nothing
  for (let i = 0; i < N; i++) att.A.data(1, chunk(i));         // sixteen numbered chunks from the attach side
  if (want) {
    const credited = await quiet(() => att.credited);
    const hubQueued = queuedOn(W.dm._conn?.mux, c);
    ok(`${name}: the device credits nothing — the attach side is credited for exactly one window (${credited} B) and the hub queues exactly one window toward the device (${hubQueued} B)`, att.opened && credited === INITIAL_WINDOW && hubQueued === INITIAL_WINDOW, { credited, hubQueued });
    W.dev.credits = true; W.D.credit(c, W.dev.got.reduce((n, b) => n + b.length, 0));   // the device reads again
    await until(() => W.dev.got.reduce((n, b) => n + b.length, 0) >= N * CHUNK && att.credited >= N * CHUNK);
    ok(`${name}: …the device reads again — all sixteen chunks arrive whole and in order (${JSON.stringify(indices(W.dev.got))}), every byte credited to the attach side (${att.credited})`, JSON.stringify(indices(W.dev.got)) === JSON.stringify(seq(N)) && att.credited === N * CHUNK, { got: indices(W.dev.got) });
  } else {
    const all = await until(() => att.credited >= N * CHUNK, 2000);
    ok(`${name}: every chunk is credited at once (${att.credited} of ${N * CHUNK}) and the hub queues what the device never took (${queuedOn(W.dm._conn?.mux, c)} B)`, att.opened && all && queuedOn(W.dm._conn?.mux, c) === N * CHUNK - INITIAL_WINDOW, { credited: att.credited });
  }
  W.end();
}
console.log('§3 THE GAP: what the device sends right behind its open answer');
for (const [name, lib, want] of [['the bridge', real, true], ['RED CONTROL (the gap as reviewed: no handler there)', gapAsReviewed, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = await world(lib);
  W.dev.onOpen = (ch) => { for (let i = 0; i < 4; i++) W.D.data(ch, chunk(i)); };   // the open and a whole window in ONE read
  const att = await W.attach(); att.credits = true; att.A.credit(1, att.bytes());
  const c = W.last();
  if (want) {
    await until(() => att.bytes() >= INITIAL_WINDOW && W.credOf(c) >= INITIAL_WINDOW);
    ok(`${name}: the open and a whole window arrive in one read — all four chunks reach the attach side whole and in order (${JSON.stringify(indices(att.got))}) and the device is credited for every byte (${W.credOf(c)}): the ledger closes`, att.opened && JSON.stringify(indices(att.got)) === JSON.stringify(seq(4)) && W.credOf(c) === INITIAL_WINDOW && queuedOn(W.D, c) === 0, { got: indices(att.got), credited: W.credOf(c) });
  } else {
    const lost = !(await until(() => att.bytes() > 0 || W.credOf(c) > 0, 500));
    ok(`${name}: the window is thrown away (${att.bytes()} B reached the attach side) and never credited (${W.credOf(c)} B) — that channel's window is lost for good`, att.opened && lost, { got: att.bytes(), credited: W.credOf(c) });
  }
  W.end();
}
console.log('§4 THE ORPHAN: an attach closed in mid-stall, then a new attach');
for (const [name, lib, want] of [['the bridge', real, true], ['RED CONTROL (no orphan road)', noOrphan, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = await world(lib); const att = await W.attach(); const c = W.last();
  for (let i = 0; i < N; i++) W.D.data(c, chunk(i));
  await quiet(() => W.credOf(c));                            // one window credited, eight chunks waiting at the device
  const stalled = queuedOn(W.D, c);
  att.sock.destroy();                                         // the attach side dies in mid-stall (a laptop's sleep)
  if (want) {
    await until(() => W.credOf(c) >= N * CHUNK && queuedOn(W.D, c) === 0);
    ok(`${name}: the orphan goes back to the release's road — the owed and every later byte are credited (${W.credOf(c)} of ${N * CHUNK}), nothing waits at the device (${queuedOn(W.D, c)} B; ${stalled} B before)`, stalled === 8 * CHUNK && W.credOf(c) === N * CHUNK && queuedOn(W.D, c) === 0, { stalled, credited: W.credOf(c) });
    const att2 = await W.attach(); att2.credits = true; const c2 = W.last();
    for (let i = 0; i < 4; i++) W.D.data(c2, chunk(100 + i));
    await until(() => att2.bytes() >= 4 * CHUNK);
    ok(`${name}: …a new attach on the same session reads its own chunks whole and in order (${JSON.stringify(indices(att2.got))}) on a new device channel (${c} → ${c2})`, att2.opened && c2 !== c && JSON.stringify(indices(att2.got)) === JSON.stringify(seq(4, 100)), { got: indices(att2.got) });
  } else {
    const stuck = !(await until(() => queuedOn(W.D, c) === 0, 500));
    ok(`${name}: eight chunks stay queued at the device for good (${queuedOn(W.D, c)} B), the orphan credited only its first window (${W.credOf(c)} B)`, stuck && queuedOn(W.D, c) === 8 * CHUNK && W.credOf(c) === INITIAL_WINDOW, { atDevice: queuedOn(W.D, c), credited: W.credOf(c) });
  }
  W.end();
}
console.log('§5 the terminal road (open-session)');
for (const [name, lib, want] of [['the bridge', real, true], ['RED CONTROL (the release\'s output road)', releaseOutput, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = await world(lib); const att = await W.attach({ op: 'open-session' }); const c = W.last();
  for (let i = 0; i < N; i++) W.D.data(c, chunk(i));
  if (want) {
    const credited = await quiet(() => W.credOf(c));
    ok(`${name}: a terminal whose attach side stalls — the device is credited for exactly one window (${credited} B), ${queuedOn(W.D, c) / CHUNK} chunks wait at the device, the attach side holds chunks ${JSON.stringify(indices(att.got))}`, att.opened && credited === INITIAL_WINDOW && queuedOn(W.D, c) === 8 * CHUNK && JSON.stringify(indices(att.got)) === JSON.stringify(seq(4)), { credited });
  } else {
    const all = await until(() => W.credOf(c) >= N * CHUNK, 2000);
    ok(`${name}: every chunk of the terminal is credited (${W.credOf(c)} of ${N * CHUNK})`, att.opened && all, { credited: W.credOf(c) });
  }
  W.end();
}
console.log('§6 a client that did not opt in keeps the release\'s road');
{
  const W = await world(real);
  const h = await W.dm.openPipeSession({ sid: 'not-opted-in', offset: 0 });
  await h.ready; h.onData = () => { };                         // a reader that takes nothing on purpose
  const c = W.last();
  for (let i = 0; i < N; i++) W.D.data(c, chunk(i));
  const all = await until(() => W.credOf(c) >= N * CHUNK, 3000);
  ok(`a handle opened without manualCredit is credited as the hub delivers, exactly as the release does (${W.credOf(c)} of ${N * CHUNK}; nothing left at the device: ${queuedOn(W.D, c)} B)`, all && W.credOf(c) === N * CHUNK && queuedOn(W.D, c) === 0, { credited: W.credOf(c) });
  W.end();
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);

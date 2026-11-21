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
// B-beaf (on this unit as taken: the two ends it did not reach, + the per-channel detach):
//   §7 detach — the attach client of a PIPE session leaves: to a daemon that says pipe-detach the bridge detaches its handle,
//      the device gets ONE CLOSE frame on that channel (its tail ends — not at the link's death) and the hub stops routing it;
//      the CLOSE waits for the input the hub still queues there; the attach leaving mid-open settles `ready`. To an OLDER
//      daemon nothing is sent and the channel takes §4's ORPHAN road (credited as it arrives). RED CONTROLS: the orphan for
//      every daemon (no CLOSE); round 2's older-daemon detach (silenced, never credited — the device would queue every later
//      byte); a CLOSE sent at once (it overtakes the queued input).
//   §8 the attach CLI's roads (src/agentd/attach-roads.js attachRoads, which attach-cli.js wires in both modes): the device is
//      credited when stdout's write is DONE, never when it was asked; a held link pauses stdin and only that channel's
//      writable resumes it. RED CONTROL: the release's roads (credit at once, never pause).
//   §9 the device's pipe-session tail (heldPump / fileTail, which agentd.js pipeSessions.attach runs) over a REAL mux pair with
//      a reader that credits nothing: about one window + one chunk is read and queued, then nothing until the reader credits;
//      then the whole buffer arrives EXACTLY once. RED CONTROLS: the release's loop (the answer ignored) queues the whole
//      buffer; a wake without its guard re-reads bytes (the mux says writable after every flushed send). + the terminal
//      road's heldSender.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';
import { markTimedOut } from './lib/timed-out.mjs';   // a wait that runs out says so: THE ONE MARK (test-ci-gate §2p)
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new Error('ok(name, cond): a swapped call');   /* the release's §7b swap guard (restack-411) */ if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// waits on an EFFECT with a deadline, never a fixed sleep
const until = async (f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(2); } return !!f(); };
const quiet = async (f, ms = 3000, n = 15) => { const t0 = Date.now(); let last, same = 0; while (Date.now() - t0 < ms) { const v = f(); if (v === last) { if (++same >= n) return v; } else { same = 0; last = v; } await sleep(3); } return markTimedOut(f(), ms, `quiet (a value that held still for ${n} reads)`); };   // a wait that runs out says so (r1372; test-ci-gate §2p)
const { Mux, PROTO_VERSION, INITIAL_WINDOW } = require(path.join(REPO, 'src/agentd/mux.js'));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const BRF = 'src/dial-session-bridge.js';
const MUT = mutantCopies('dial-bridge-credit', REPO);
const real = require(path.join(REPO, BRF));
const mutant = (pairs, tag) => { let out = fs.readFileSync(path.join(REPO, BRF), 'utf8'); for (const [a, b] of pairs) { if (!out.includes(a)) return null; out = out.split(a).join(b); } return require(MUT.write(BRF, out, tag)); };
const releaseOutput = mutant([['manualCredit: true', 'manualCredit: false'], ['if (ok) { try { handle.credit(buf.length); } catch { } } else owedDevice += buf.length;', 'void ok;']], 'release-output');
const releaseInput = mutant([['if (ok) { try { mux.credit(chan, buf.length); } catch { } } else owedAttach += buf.length;', 'try { mux.credit(chan, buf.length); } catch { }']], 'release-input');
const gapAsReviewed = mutant([['handle.onData = (buf) => { early.push(buf); };', 'handle.onData = null;']], 'gap');
const noOrphan = mutant([['if (!isPty && handle) letGo();', 'void letGo;']], 'no-orphan');   // B-beaf: the death's line is letGo() (the orphan for an older daemon)
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

// B-beaf's harness: ONE attach on a session whose daemon says `caps`, CLOSE frames counted at the device, an open that can be held
async function worldB(lib, { caps = ['pipe-detach'], holdOpen = false, DM = DeviceManager, holdDial = false, refuse = false } = {}) {
  const [hubEnd, devEnd] = pair();
  const dev = { chan: null, credited: 0, got: 0, credits: true, closed: 0, gotAtClose: null, release: null };
  const D = new Mux(devEnd, {
    heartbeat: false,
    onControl: (m) => {
      if (m.op === 'hello') { D.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: 'fake-device', platform: 'linux', arch: 'x64', nodeVersion: process.version, capabilities: caps }); return; }
      if (m.op === 'attach-pipe-session' || m.op === 'open-pipe-session') { dev.chan = m.chan; const answer = () => D.control(refuse ? { op: 'session-error', chan: m.chan, error: 'no such session' } : { op: 'pipe-session-open', chan: m.chan, pid: 4242, existing: true }); if (holdOpen) dev.release = answer; else answer(); }
    },
    onData: (c, b) => { dev.got += b.length; if (dev.credits) D.credit(c, b.length); },
  });
  const dFrame = D._onFrame.bind(D);
  D._onFrame = (type, chan, payload) => { if (type === 2 && chan === dev.chan && payload.length === 4) dev.credited += payload.readUInt32BE(0); if (type === 1 && chan === dev.chan) { dev.closed++; if (dev.gotAtClose === null) dev.gotAtClose = dev.got; } return dFrame(type, chan, payload); };
  const dm = new DM({ dataDir: fs.mkdtempSync(path.join(tmp, 'data-')), bundlePath: path.join(tmp, 'no-bundle.js'), version: '0.0.0', transport: { kind: 'stream', getStream: () => hubEnd, hostToken: 'device-fixture-' + 'secret' }, log: () => { } });
  const seen = { handle: null };   // the bridge's device handle, seen as it is made (its `ready` untouched: no handler added)
  const op0 = dm.openPipeSession.bind(dm); dm.openPipeSession = async (...a) => { const h = await op0(...a); seen.handle = h; return h; };
  const dial = { asked: false, open: null }; const dialGate = holdDial ? new Promise((r) => { dial.open = r; }) : null;
  const bridge = new lib.DialSessionBridge({ deviceForDial: async () => { dial.asked = true; if (dialGate) await dialGate; return dm; }, hostTokenFor: () => ATTACH_TOKEN, log: () => { } });
  const port = await bridge.ensure({ sid: SID, deviceId: 'dev-fixture' });
  const sock = net.connect(port, '127.0.0.1'); await new Promise((r) => sock.once('connect', r));
  const att = { ctl: [], got: 0, credited: 0, credits: false };
  const A = new Mux(sock, { heartbeat: false, onControl: (m) => att.ctl.push(m), onData: (c, b) => { att.got += b.length; if (att.credits) A.credit(c, b.length); } });
  const aFrame = A._onFrame.bind(A);
  A._onFrame = (type, chan, payload) => { if (type === 2 && chan === 1 && payload.length === 4) att.credited += payload.readUInt32BE(0); return aFrame(type, chan, payload); };
  A.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: ATTACH_TOKEN });
  await until(() => att.ctl.some((m) => m.op === 'hello-ack'));
  A.control({ op: 'attach-pipe-session', chan: 1, sid: SID, offset: 0 });
  const opened = await until(() => holdDial ? dial.asked : ((holdOpen ? true : att.ctl.some((m) => m.op === 'pipe-session-open')) && dev.chan != null));
  const end = () => { try { sock.destroy(); } catch { } try { bridge.close(SID); } catch { } try { dm.stop?.(); } catch { } try { hubEnd.emit('close'); devEnd.emit('close'); } catch { } };
  return { D, dev, dm, A, att, opened, end, sock, seen, openDial: () => { if (dial.open) dial.open(); } };
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
console.log('§7 detach (B-beaf 3): a pipe session\'s attach client leaves — the device\'s tail on its channel ends at once');
const releaseNoDetach = mutant([["done = typeof h.detach === 'function' && h.detach() === true;", 'done = false;']], 'orphan-for-all');   // the bridge as taken: the orphan for every daemon
const CLF = 'src/agentd/client.js';
const clMutant = (pairs, tag) => { let out = fs.readFileSync(path.join(REPO, CLF), 'utf8'); for (const [a, b] of pairs) { if (!out.includes(a)) return null; out = out.split(a).join(b); } return require(MUT.write(CLF, out, tag)).DeviceManager; };
const rejections = []; process.on('unhandledRejection', (e) => rejections.push(String(e && e.message || e)));
for (const [name, lib, want] of [['the bridge', real, true], ['RED CONTROL (the bridge as taken: the orphan for every daemon)', releaseNoDetach, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = await worldB(lib);
  const chan = W.dev.chan, held0 = !!W.dm._conn?.sessions?.has(chan);
  W.sock.destroy();   // the attach client leaves (its process ended); the link to the device stays up
  if (want) {
    const closed = await until(() => W.dev.closed > 0);
    ok(`${name}: a daemon that says pipe-detach gets ONE CLOSE frame on the session's channel and the hub stops routing it (it held it: ${held0})`, W.opened && held0 && closed && W.dev.closed === 1 && !W.dm._conn.sessions.has(chan), { closed: W.dev.closed, routed: W.dm._conn?.sessions?.has(chan) });
  } else {
    await quiet(() => W.dev.closed);   // the release says nothing: the count stays still
    ok(`${name}: nothing reaches the device — its tail on that channel runs on, credited into nothing, until the link dies`, W.opened && W.dev.closed === 0 && W.dm._conn.sessions.has(chan), { closed: W.dev.closed });
  }
  W.end();
}
{ // an OLDER daemon (no pipe-detach): no CLOSE, and its channel takes §4's ORPHAN road — credited as it arrives, so the device
  // never queues that session's later bytes (a channel never credited again would: the taken unit's must 2)
  const silenced = clMutant([["      if (!handle.canDetach()) return false;\n", "      if (!handle.canDetach()) { handle.onData = null; handle.onExit = null; handle.onWritable = null; return true; }\n"]], 'r2-silenced');
  for (const [name, DM, want] of [['the hub', DeviceManager, true], ['RED CONTROL (round 2: an older daemon\'s channel silenced, never credited)', silenced, false]]) {
    if (!DM) { ok(name + ': the mutant could be made', false); continue; }
    const W = await worldB(real, { caps: [], DM });
    const chan = W.dev.chan, fwd = W.seen.handle && W.seen.handle.onData;
    W.sock.destroy();
    await until(() => W.seen.handle && W.seen.handle.onData !== fwd);   // the death road ran (the orphan's credit, or the control's silence)
    const c0 = W.dev.credited;
    for (let i = 0; i < N; i++) W.D.data(chan, Buffer.alloc(CHUNK, 0x6f));   // the older daemon's tail keeps sending
    const credited = (await quiet(() => W.dev.credited)) - c0;
    if (want) ok(`${name}: an older daemon gets no CLOSE and its channel is credited as it arrives (${credited} B of ${N * CHUNK}) — the orphan's road`, W.dev.closed === 0 && credited === N * CHUNK, { closed: W.dev.closed, credited });
    else ok(`${name}: nothing more is credited (${credited} B) — the device would queue the session's every later byte`, W.dev.closed === 0 && credited === 0, { closed: W.dev.closed, credited });
    W.end();
  }
}
{ // CLOSE only after the input the hub still queues on the channel went out (r2 #3: a CLOSE overtaking it cut a stdin line)
  const noDrain = clMutant([['      if (conn.mux.queued(chan) > 0) drainThenClose = close; else close();', '      close();']], 'no-drain');
  for (const [name, DM, want] of [['the hub', DeviceManager, true], ['RED CONTROL (CLOSE at once)', noDrain, false]]) {
    if (!DM) { ok(name + ': the mutant could be made', false); continue; }
    const W = await worldB(real, { DM }); W.dev.credits = false;
    for (let i = 0; i < N; i++) W.A.data(1, Buffer.alloc(CHUNK, 0x61));   // the attach side's input; the device takes one window
    await quiet(() => W.dev.got);
    const queuedAtHub = W.dm._conn.mux.queued(W.dev.chan), gotBefore = W.dev.got, owed = gotBefore + queuedAtHub;   // what the hub had taken
    W.sock.destroy();                                                      // …and the attach client leaves with input still queued
    await quiet(() => W.dev.closed);
    const closedEarly = W.dev.closed;
    W.dev.credits = true; W.D.credit(W.dev.chan, W.dev.got);              // the device reads again
    await until(() => W.dev.closed > 0);
    if (want) ok(`${name}: no CLOSE while ${queuedAtHub} B of input wait at the hub; it comes after the LAST of them (${W.dev.gotAtClose} B of the ${owed} B the hub had taken)`, queuedAtHub > 0 && closedEarly === 0 && W.dev.closed === 1 && W.dev.gotAtClose === owed, { queuedAtHub, closedEarly, gotAtClose: W.dev.gotAtClose, owed });
    else ok(`${name}: the CLOSE overtakes the queued input (${W.dev.gotAtClose} B of the ${owed} B the hub had taken)`, queuedAtHub > 0 && W.dev.gotAtClose !== null && W.dev.gotAtClose < owed, { gotAtClose: W.dev.gotAtClose, owed });
    W.end();
  }
}
{ // the cure of B-beaf (its readers): after a detach the device still credits the input it took before the CLOSE — those
  // CREDIT frames find the channel forgotten and never make a send window again (one stale entry per detach for the link's life)
  const MXS = fs.readFileSync(path.join(REPO, 'src/agentd/mux.js'), 'utf8');
  const fixed = "        if (!this._sendWin.has(chan)) break;\n        this._sendWin.set(chan, this._sendWin.get(chan) + n);";
  const muxCopy = MXS.split(fixed).length === 2 ? MUT.write('src/agentd/mux.js', MXS.replace(fixed, () => "        this._sendWin.set(chan, (this._sendWin.get(chan) ?? INITIAL_WINDOW) + n);"), 'stale-credit') : null;   // stale-pins: kept — the CONTROL re-creates the old mux line on purpose
  const staleDM = muxCopy ? clMutant([["require('./mux.js')", `require(${JSON.stringify(muxCopy)})`]], 'stale-credit') : null;
  for (const [name, DM, want] of [['the hub', DeviceManager, true], ['RED CONTROL (a stale credit makes the send window again)', staleDM, false]]) {
    if (!DM) { ok(name + ': the mutant could be made', false); continue; }
    const W = await worldB(real, { DM });
    const chan = W.dev.chan;
    W.A.data(1, Buffer.alloc(CHUNK, 0x61));                     // input through the bridge: the hub's mux sends on the channel
    await until(() => W.dev.got >= CHUNK);
    const had = W.dm._conn.mux._sendWin.has(chan);
    W.sock.destroy();                                            // the attach client leaves: the detach forgets the channel
    await until(() => W.dev.closed > 0);
    const gone = !W.dm._conn.mux._sendWin.has(chan);
    W.D.credit(chan, CHUNK);                                     // the device credits the input it took before the CLOSE
    await quiet(() => W.dm._conn.mux._sendWin.has(chan));
    const back = W.dm._conn.mux._sendWin.has(chan);
    if (want) ok(`${name}: the detached channel's send window is forgotten and a late credit never makes it again`, had && gone && !back, { had, gone, back });
    else ok(`${name}: the late credit makes the forgotten channel's window again (red)`, had && gone && back, { had, gone, back });
    W.end();
  }
}
{ // the attach leaves WHILE the session is being opened (r2 #6): its handle is detached, `ready` settled, no hang, no unhandled rejection
  const r0 = rejections.length;
  const W = await worldB(real, { holdOpen: true });
  const chan = W.dev.chan;
  W.sock.destroy();
  await until(() => W.dev.closed > 0);
  if (W.dev.release) W.dev.release();   // the device's late answer lands on a channel nobody routes
  await quiet(() => rejections.length);
  ok('the attach leaving mid-open: the device gets its CLOSE, the hub routes nothing, and no unhandled rejection is left behind', W.dev.closed === 1 && !W.dm._conn.sessions.has(chan) && rejections.length === r0, { closed: W.dev.closed, rejections: rejections.slice(r0) });
  W.end();
}
{ // the attach dies BEFORE the session's handle exists (the hub is still reaching the device): the handle is let go the moment
  // it exists — ONE CLOSE to a pipe-detach daemon, the orphan's road for an older one — and the device's later refusal of the
  // open (session-error) leaves no unhandled rejection either way: the bridge still awaits `ready`
  const earlyReturn = mutant([['            prewire(chan);   // B-beaf: an attach already gone is let go here; the bridge still awaits `ready` (a refusal is caught)\n', '            prewire(chan);\n            if (attachGone) return;\n']], 'early-return');
  for (const [name, lib, caps, want] of [['a pipe-detach daemon', real, ['pipe-detach'], 'close'], ['an older daemon', real, [], 'orphan'], ['RED CONTROL (an early return after prewire: `ready` never awaited) — an older daemon', earlyReturn, [], 'rejected']]) {
    if (!lib) { ok(name + ': the mutant could be made', false); continue; }
    const r0 = rejections.length;
    const W = await worldB(lib, { caps, holdDial: true, holdOpen: true, refuse: true });
    W.sock.destroy();                                  // the attach client dies while the hub still reaches the device
    await quiet(() => W.dev.chan);
    W.openDial();                                      // the hub reaches the device: the handle exists now, after the death
    await until(() => W.dev.release != null);
    W.dev.release();                                   // the device refuses the open (session-error)
    await quiet(() => rejections.length * 1000 + W.dev.closed);
    const rej = rejections.slice(r0);
    if (want === 'close') ok(`${name}: the handle is detached the moment it exists (ONE CLOSE), and the refusal leaves no unhandled rejection`, W.opened && W.dev.closed === 1 && rej.length === 0, { closed: W.dev.closed, rej });
    else if (want === 'orphan') ok(`${name}: no CLOSE (the orphan's road), and the refusal leaves no unhandled rejection — the bridge awaits ready`, W.opened && W.dev.closed === 0 && rej.length === 0, { closed: W.dev.closed, rej });
    else ok(`${name}: the refusal becomes an UNHANDLED rejection (red)`, rej.length > 0, { rej });
    W.end();
  }
}
const ARF = 'src/agentd/attach-roads.js';
const AR = require(path.join(REPO, ARF));
const arMutant = (pairs, tag) => { let out = fs.readFileSync(path.join(REPO, ARF), 'utf8'); for (const [a, b] of pairs) { if (!out.includes(a)) return null; out = out.split(a).join(b); } return require(MUT.write(ARF, out, tag)); };
console.log('§8 the attach CLI\'s roads (B-beaf 1): credited when stdout took it; a held link pauses stdin');
{
  const releaseRoads = arMutant([['try { stdout.write(buf, credit); } catch { credit(); }', 'try { stdout.write(buf); } catch { } credit();'], ['if (!ok && !held) { held = true; try { pause(); } catch { } }', 'void held;']], 'release-roads');
  for (const [name, lib, want] of [['attachRoads', AR, true], ['RED CONTROL (the release\'s roads)', releaseRoads, false]]) {
    if (!lib) { ok(name + ': the mutant could be made', false); continue; }
    const credits = [], held = [];
    let answer = true;
    const fmux = { credit: (c, n) => credits.push([c, n]), data: () => answer };
    const stdout = { write: (b, cb) => { held.push(cb); return false; } };   // a terminal that has not taken it yet
    const stdin = { paused: 0, resumed: 0, pause() { this.paused++; }, resume() { this.resumed++; } };
    const r = lib.attachRoads({ mux: fmux, chan: 2, stdin, stdout });
    r.out(Buffer.alloc(1000)); r.out(Buffer.alloc(500));
    const before = credits.length;
    for (const cb of held) if (typeof cb === 'function') cb();
    const after = JSON.stringify(credits);
    r.in(Buffer.alloc(10)); answer = false; r.in(Buffer.alloc(10)); r.in(Buffer.alloc(10));
    const pausedOnce = stdin.paused;
    r.writable(3); const stillPaused = stdin.resumed === 0;
    r.writable(2); r.writable(2);
    if (want) {
      ok(`${name}: nothing is credited while stdout holds the bytes; each write's callback credits ITS bytes (${after})`, before === 0 && after === JSON.stringify([[2, 1000], [2, 500]]), { before, after });
      ok(`${name}: a held link pauses stdin ONCE; another channel's writable leaves it paused; this channel's resumes it ONCE`, pausedOnce === 1 && stillPaused && stdin.resumed === 1, { paused: stdin.paused, resumed: stdin.resumed });
    } else ok(`${name}: the device is credited before the terminal took a byte (${before} credits) and stdin is never paused (${pausedOnce})`, before === 2 && pausedOnce === 0, { before, pausedOnce });
  }
  const cli = fs.readFileSync(path.join(REPO, 'src/agentd/attach-cli.js'), 'utf8');
  ok('attach-cli.js wires the roads in BOTH modes (terminal and pipe): out / in / writable; no direct credit or unanswered send is left', (cli.match(/roads = AR\.attachRoads\(\{ mux, chan: CHAN, stdin: process\.stdin, stdout: process\.stdout \}\);/g) || []).length === 2
    && (cli.match(/roads\.out\(buf\)/g) || []).length === 2 && (cli.match(/process\.stdin\.on\('data', \(d\) => \{ roads\.in\(d\); \}\);/g) || []).length === 2 && (cli.match(/onWritable\(chan\) \{ if \(roads\) roads\.writable\(chan\); \}/g) || []).length === 2
    && !/mux\.credit\(chan, buf\.length\)/.test(cli) && !/mux\.data\(CHAN, d\)/.test(cli));   // stale-pins: kept — absence checks: the release's direct credit and unanswered send are gone from attach-cli.js
}
console.log('§9 the device\'s pipe-session tail (B-beaf 2) over a REAL mux pair: read while the link takes it, then nothing until credit');
{
  const releasePump = arMutant([['if (send(b) === false) { held = true; break; }', 'send(b);']], 'release-pump');
  const noGuard = arMutant([['wake() { if (!held) return; held = false; pass(); }', 'wake() { held = false; pass(); }']], 'wake-no-guard');
  const FILE = Buffer.alloc(N * CHUNK); for (let i = 0; i < FILE.length; i++) FILE[i] = (i * 7 + (i >> 16)) & 0xff;   // a pattern: a duplicate or a gap is seen
  const tailWorld = (lib) => {
    const [dEnd, hEnd] = pair();
    const hub = { got: [], credits: false };
    let tail = null;
    const D = new Mux(dEnd, { heartbeat: false, onWritable: (c) => { if (c === 5 && tail) tail.wake(); } });
    const H = new Mux(hEnd, { heartbeat: false, onData: (c, b) => { hub.got.push(Buffer.from(b)); if (hub.credits) H.credit(c, b.length); } });
    tail = lib.heldPump({ pos: 0, stat: () => FILE.length, read: (p, want) => FILE.subarray(p, p + want), send: (b) => D.data(5, b) });
    return { D, H, hub, tail, end: () => { try { dEnd.emit('close'); hEnd.emit('close'); } catch { } } };
  };
  for (const [name, lib, kind] of [['heldPump', AR, 'ok'], ['RED CONTROL (the release\'s loop: the answer ignored)', releasePump, 'release'], ['RED CONTROL (a wake without its guard)', noGuard, 'noguard']]) {
    if (!lib) { ok(name + ': the mutant could be made', false); continue; }
    const T = tailWorld(lib);
    T.tail.pass(); T.tail.pass(); T.tail.pass();   // the 150 ms timer, three times, while the reader credits nothing
    const got = await quiet(() => T.hub.got.reduce((n, b) => n + b.length, 0));
    const read = T.tail.pos, queued = queuedOn(T.D, 5), heldNow = T.tail.held;   // read AT the stall (after the credit it is false again)
    T.hub.credits = true; T.H.credit(5, got);   // the reader takes what it holds
    for (let i = 0; i < 64 && T.hub.got.reduce((n, b) => n + b.length, 0) < FILE.length; i++) { T.tail.pass(); await sleep(2); }
    const all = await quiet(() => T.hub.got.reduce((n, b) => n + b.length, 0));
    const same = Buffer.concat(T.hub.got).equals(FILE);
    if (kind === 'ok') {
      ok(`${name}: with nobody crediting, the tail read ${read} B (one window ${INITIAL_WINDOW} + one chunk ${CHUNK} at most, of ${FILE.length}) and queues ${queued} B — the rest waits IN THE FILE`, read <= INITIAL_WINDOW + CHUNK && queued <= CHUNK && heldNow && !T.tail.held, { read, queued, heldNow, heldAfter: T.tail.held });
      ok(`${name}: …the reader credits and the whole buffer arrives EXACTLY once, in order (${all} B)`, all === FILE.length && same, { all, same });
    } else if (kind === 'release') ok(`${name}: the whole buffer is read and queued in the daemon at once (${read} B read, ${queued} B queued)`, read === FILE.length && queued >= FILE.length - INITIAL_WINDOW, { read, queued });
    else ok(`${name}: a wake inside a pass reads bytes twice — what arrives is NOT the buffer (${all} B for ${FILE.length})`, !same, { all, same });
    T.end();
  }
  const terms = []; let tAns = true;
  const pty = { p: 0, r: 0 };
  const hs = AR.heldSender({ send: (b) => { terms.push(b.length); return tAns; }, pause: () => pty.p++, resume: () => pty.r++ });
  hs.send(Buffer.alloc(3)); tAns = false; hs.send(Buffer.alloc(3)); hs.send(Buffer.alloc(3)); hs.writable(); hs.writable();
  ok('the terminal road\'s heldSender: a held link pauses the pty ONCE, the writable resumes it ONCE (every byte still handed to the link)', pty.p === 1 && pty.r === 1 && terms.length === 3, { pty, terms });
  // the daemon's file road, for real: fileTail over a TEMP FILE (the fd, readSync at positions, the close) and a REAL mux pair
  const tf = path.join(tmp, 'session.out'); fs.writeFileSync(tf, FILE);
  const [fdEnd, fhEnd] = pair();
  const fhub = { got: [], credits: false };
  let ft = null;
  const FD = new Mux(fdEnd, { heartbeat: false, onWritable: (c) => { if (c === 7 && ft) ft.wake(); } });
  const FH = new Mux(fhEnd, { heartbeat: false, onData: (c, b) => { fhub.got.push(Buffer.from(b)); if (fhub.credits) FH.credit(c, b.length); } });
  ft = AR.fileTail({ file: tf, offset: 0, fs, send: (b) => FD.data(7, b) });
  ft.pass(); ft.pass();
  const fgot = await quiet(() => fhub.got.reduce((n, b) => n + b.length, 0));
  const fread = ft.pos, fd0 = ft.fd;
  const MORE = Buffer.alloc(3 * CHUNK + 123, 0x7a); fs.appendFileSync(tf, MORE);   // the CLI keeps writing meanwhile
  fhub.credits = true; FH.credit(7, fgot);
  for (let i = 0; i < 64 && fhub.got.reduce((n, b) => n + b.length, 0) < FILE.length + MORE.length; i++) { ft.pass(); await sleep(2); }
  const fall = await quiet(() => fhub.got.reduce((n, b) => n + b.length, 0));
  const fsame = Buffer.concat(fhub.got).equals(Buffer.concat([FILE, MORE]));
  ft.close();
  let closedFd = false; try { fs.fstatSync(fd0); } catch (e) { closedFd = e && e.code === 'EBADF'; }
  ok(`fileTail over a real file: held at ${fread} B read (one window + one chunk at most) with nobody crediting; then the file AND what the CLI appended meanwhile arrive exactly once, in order (${fall} B); close() closes its fd`,
    fread <= INITIAL_WINDOW + CHUNK && fall === FILE.length + MORE.length && fsame && closedFd && ft.fd === null, { fread, fall, fsame, closedFd });
  try { fdEnd.emit('close'); fhEnd.emit('close'); } catch { }
  const agentd = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  const client = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  ok('agentd.js runs them: the pipe tail is fileTail (send = mux.data), woken by onWritable and closed at a detach / the link\'s end; the pty road is heldSender (pause / resume the pty); a CLOSE on a tail\'s channel detaches it; the hello-ack says pipe-detach; the hub sends the CLOSE only to a daemon that says it',
    /const tail = AR\.fileTail\(\{ file: P2\.out, offset, fs, send: \(b\) => mux\.data\(chan, b\) \}\);/.test(agentd) && /wake: tail\.wake, close: tail\.close/.test(agentd) && /clearInterval\(t\.timer\); t\.close\(\);/.test(agentd)
    && /const out = AR\.heldSender\(\{ send: \(b\) => mux\.data\(chan, b\), pause: \(\) => proc\.pause\(\), resume: \(\) => proc\.resume\(\) \}\);/.test(agentd) && /proc\.onData\(\(d\) => \{ out\.send\(Buffer\.from\(d, 'utf-8'\)\); \}\);/.test(agentd)
    && /onWritable\(chan\) \{\n\s*try \{ pipeSessions\.writable\(mux, chan\); \} catch \{ \}[^\n]*\n\s*try \{ sessions\.get\(chan\)\?\.out\?\.writable\(\); \} catch \{ \}/.test(agentd)
    && /onClose\(chan\) \{[\s\S]{0,400}if \(pipeSessions\.detach\(mux, chan\)\) return;/.test(agentd) && /capabilities: \['probe', 'transcript-op', 'transcript-picture', 'pipe-detach'/.test(agentd)
    && /handle\.canDetach = \(\) => !!conn\.info\?\.capabilities\?\.includes\?\.\('pipe-detach'\);/.test(client) && /if \(!handle\.canDetach\(\)\) return false;/.test(client) && /if \(!readySettled\) \{ handle\.ready\.catch\(\(\) => \{ \}\); rejectReady\(/.test(client) && !/mux\.data\(chan, b\.subarray\(0, n\)\);/.test(agentd));   // stale-pins: kept — an absence check: the release's unanswered pipe-tail send is gone from agentd.js
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// THE DIAL BRIDGE FOLLOWS CREDIT (主开发 2026-11-17 — a master defect the separation's skeptic confirmed on the release, with a
// twin): src/dial-session-bridge.js stands between a DIALLED device's link and the attach client of one session. The hub
// credited the device as it DELIVERED the session's output while the bridge threw away the attach link's answer, so a stalled
// attach client made the hub hold the session's whole output; the input road credited the attach client at once whatever the
// device link took. In process, by a stall PLACED in the reader (never by load): the device link is an in-memory Mux pair — a
// fake device that answers the hub's hello and opens the pipe session — the hub's side the REAL DeviceManager (a `stream`
// transport) and the REAL bridge on a loopback port, the attach side a Mux that credits nothing until told.
//   output — the fake device sends sixteen 64 KiB chunks; the attach side never credits: the device is credited for about one
//            window plus one chunk, not for all sixteen; the attach side reads again and all sixteen arrive. RED CONTROL: the
//            release's output road (the hub credits as it delivers, the answer thrown away) — every chunk is credited.
//   input  — the attach side sends sixteen chunks; the fake device never credits: the attach side is credited for about one
//            window plus one chunk; the device reads again and all sixteen arrive. RED CONTROL: the release's input road
//            (credited at once) — every chunk is credited and the hub queues what the device never took.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
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
const pair = () => { const a = new EventEmitter(), b = new EventEmitter(); a.write = (d) => { setImmediate(() => b.emit('data', Buffer.from(d))); return true; }; b.write = (d) => { setImmediate(() => a.emit('data', Buffer.from(d))); return true; }; return [a, b]; };
const queuedOn = (mux, c) => (mux?._sendQ?.get(c) || []).reduce((n, b) => n + b.length, 0);
const tmp = fs.mkdtempSync('/tmp/vs-dialbridge-');
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
const CHUNK = 65536, N = 16, SID = 'dial-fixture-1', ATTACH_TOKEN = 'attach-fixture-' + 'secret';

async function world(lib) {
  const [hubEnd, devEnd] = pair();
  const dev = { chan: null, credited: 0, got: 0, credits: true };
  const D = new Mux(devEnd, {
    heartbeat: false,
    onControl: (m) => {
      if (m.op === 'hello') { D.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: 'fake-device', platform: 'linux', arch: 'x64', nodeVersion: process.version, capabilities: [] }); return; }
      if (m.op === 'attach-pipe-session' || m.op === 'open-pipe-session') { dev.chan = m.chan; D.control({ op: 'pipe-session-open', chan: m.chan, pid: 4242, existing: true }); }
    },
    onData: (c, b) => { dev.got += b.length; if (dev.credits) D.credit(c, b.length); },
  });
  const dFrame = D._onFrame.bind(D);
  D._onFrame = (type, chan, payload) => { if (type === 2 && chan === dev.chan && payload.length === 4) dev.credited += payload.readUInt32BE(0); return dFrame(type, chan, payload); };
  const dm = new DeviceManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'data-')), bundlePath: path.join(tmp, 'no-bundle.js'), version: '0.0.0', transport: { kind: 'stream', getStream: () => hubEnd, hostToken: 'device-fixture-' + 'secret' }, log: () => { } });
  const bridge = new lib.DialSessionBridge({ deviceForDial: async () => dm, hostTokenFor: () => ATTACH_TOKEN, log: () => { } });
  const port = await bridge.ensure({ sid: SID, deviceId: 'dev-fixture' });
  const sock = net.connect(port, '127.0.0.1'); await new Promise((r) => sock.once('connect', r));
  const att = { ctl: [], got: 0, credited: 0, credits: false };
  const A = new Mux(sock, { heartbeat: false, onControl: (m) => att.ctl.push(m), onData: (c, b) => { att.got += b.length; if (att.credits) A.credit(c, b.length); } });
  const aFrame = A._onFrame.bind(A);
  A._onFrame = (type, chan, payload) => { if (type === 2 && chan === 1 && payload.length === 4) att.credited += payload.readUInt32BE(0); return aFrame(type, chan, payload); };
  A.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: ATTACH_TOKEN });
  await until(() => att.ctl.some((m) => m.op === 'hello-ack'));
  A.control({ op: 'attach-pipe-session', chan: 1, sid: SID, offset: 0 });
  const opened = await until(() => att.ctl.some((m) => m.op === 'pipe-session-open') && dev.chan != null);
  const end = () => { try { sock.destroy(); } catch { } try { bridge.close(SID); } catch { } try { dm.stop?.(); } catch { } try { hubEnd.emit('close'); devEnd.emit('close'); } catch { } };
  return { D, dev, dm, A, att, opened, end };
}

console.log('§1 output: a stalled attach client stops the device, it does not fill the hub');
for (const [name, lib, want] of [['the bridge', real, true], ['RED CONTROL (the release\'s output road)', releaseOutput, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = await world(lib);
  for (let i = 0; i < N; i++) W.D.data(W.dev.chan, Buffer.alloc(CHUNK, 0x62));   // sixteen chunks; the device's own window paces them
  const credited = await quiet(() => W.dev.credited);
  const waitingAtDevice = queuedOn(W.D, W.dev.chan), atAttach = W.att.got;
  if (want) {
    ok(`${name}: the attach side credits nothing — the device is credited for ${credited} B (one window ${INITIAL_WINDOW} + one chunk ${CHUNK} at most, of ${N * CHUNK}); ${waitingAtDevice} B wait AT THE DEVICE, ${atAttach} B reached the attach side`, W.opened && credited > 0 && credited <= INITIAL_WINDOW + CHUNK && waitingAtDevice > 0, { credited, waitingAtDevice, atAttach });
    W.att.credits = true; W.A.credit(1, W.att.got);         // the attach side reads again
    const all = await until(() => W.att.got >= N * CHUNK);
    ok(`${name}: …the attach side reads again and every chunk arrives (${W.att.got} of ${N * CHUNK})`, all, { got: W.att.got });
  } else ok(`${name}: every chunk is credited (${credited} of ${N * CHUNK}) — the hub holds what the attach side never took (${atAttach} B reached it)`, W.opened && credited >= N * CHUNK, { credited, atAttach });
  W.end();
}
console.log('§2 input: a device that stops reading stops the attach client, it does not fill the hub');
for (const [name, lib, want] of [['the bridge', real, true], ['RED CONTROL (the release\'s input road)', releaseInput, false]]) {
  if (!lib) { ok(name + ': the mutant could be made', false); continue; }
  const W = await world(lib); W.dev.credits = false;          // the device takes nothing
  for (let i = 0; i < N; i++) W.A.data(1, Buffer.alloc(CHUNK, 0x61));   // sixteen chunks from the attach side
  const credited = await quiet(() => W.att.credited);
  const hubQueued = queuedOn(W.dm._conn?.mux, W.dev.chan);
  if (want) {
    ok(`${name}: the device credits nothing — the attach side is credited for ${credited} B (one window + one chunk at most, of ${N * CHUNK}); the hub queues ${hubQueued} B toward the device`, W.opened && credited > 0 && credited <= INITIAL_WINDOW + CHUNK && hubQueued <= INITIAL_WINDOW + CHUNK, { credited, hubQueued });
    W.dev.credits = true; W.D.credit(W.dev.chan, W.dev.got);   // the device reads again
    const all = await until(() => W.dev.got >= N * CHUNK);
    ok(`${name}: …the device reads again and every chunk arrives (${W.dev.got} of ${N * CHUNK})`, all, { got: W.dev.got });
  } else ok(`${name}: every chunk is credited at once (${credited} of ${N * CHUNK}) and the hub queues what the device never took (${hubQueued} B)`, W.opened && credited >= N * CHUNK && hubQueued >= N * CHUNK - INITIAL_WINDOW, { credited, hubQueued });   // all but the one window the device's own window took
  W.end();
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);

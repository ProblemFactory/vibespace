#!/usr/bin/env node
// PICTURE PATH noDelay — the fast unit of lane picture-path-nodelay (2026-10-12). The hub's own hop of a paired
// machine's picture: the bridge's RFB relay CONNECTS to the hub forward (src/server/stream-relay-rfb.js), the forward
// ACCEPTS it (src/server/desktop-access.js forwardPort) and pipes it into the device link. Both ends of that loopback
// pipe must be noDelay (a key's release waited ~40 ms behind its press for the delayed ACK — test-picture-path-nagle
// measures it through a real daemon). The REAL bridge + the REAL forward over a fake device whose tcpForward echoes;
// a spy on net.Socket#setNoDelay names the sockets it was called on. CONTROL: a copy of desktop-access.js without its
// call ⇒ the accept assertion turns false (the spy tells the two apart). The daemon's tcp-connect is the census
// (test-architecture §90) and the heavy suite's bundle check.
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const WebSocket = require('ws');
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const S = require(path.join(REPO, 'src/server/desktop-stream.js'));
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 400) : '')); } };
const quiet = { log() { }, warn() { } };

const calls = [];
const real = net.Socket.prototype.setNoDelay;
net.Socket.prototype.setNoDelay = function (on) { calls.push({ sock: this, on }); return real.call(this, on); };

/** viewer → the real bridge → the forward of `A` → a fake device echo; answers the forward's port and the spy's view. */
async function run(A) {
  calls.length = 0;
  const handle = () => { const h = { onData: null, onClose: null, write: (b) => setImmediate(() => h.onData && h.onData(b)), close: () => { } }; return h; };
  const dm = { desktopServe: async () => ({}), tcpForward: async () => handle() }; // desktopServe: the forward asks for a desktop-capable handle
  const hosts = { get: (h) => (h === 'dev-x' ? { id: h } : null), isLocal: () => false, deviceBounded: async () => dm };
  const acc = A.create({ hosts, install: false, log: quiet });
  const bridge = S.create({ auth: { requestAuthed: () => true }, resolveTarget: () => ({ kind: 'rfb', port: 5900, hostId: 'dev-x' }), forwardPort: (h, p) => acc.forwardPort(h, p), log: quiet });
  const srv = http.createServer((q, r) => { r.writeHead(404); r.end(); });
  srv.on('upgrade', (req, sock, head) => bridge.handleUpgrade(req, sock, head, S.upgradeId(new URL(req.url, 'http://x').pathname)));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ws = new WebSocket(`ws://127.0.0.1:${srv.address().port}${S.streamPath('pn-unit')}`, ['binary']);
  let got = 0;
  const echoed = new Promise((r) => { ws.on('message', (m) => { got += m.length; if (got >= 12) r(true); }); setTimeout(() => r(false), 5000); });
  await new Promise((r) => { ws.once('open', r); ws.once('error', r); });
  ws.send(Buffer.from('RFB 003.008\n'));
  const back = await echoed;
  const fp = (acc.forwards()[0] || {}).localPort;
  const on = (pick) => calls.some((c) => c.on === true && pick(c.sock));
  const res = {
    back, fp,
    relay: on((s) => s.remotePort === fp && s.remoteAddress === '127.0.0.1'),
    accept: on((s) => s.localPort === fp && s.remotePort !== fp),
  };
  ws.close(); acc.shutdown(); srv.close();
  return res;
}

console.log('§1 both ends of the hub hop are noDelay');
const r = await run(ACC);
ok(r.back && r.fp > 0, `a viewer's bytes went through the bridge and the hub forward 127.0.0.1:${r.fp} to the device and back`);
ok(r.relay, 'the bridge\'s RFB relay set noDelay on its connect to the forward (stream-relay-rfb.js)');
ok(r.accept, 'the hub forward set noDelay on the socket it accepted (desktop-access.js forwardPort)');

console.log('§2 CONTROL: the forward without its call');
const LINE = /\n[ \t]*sock\.setNoDelay\(true\);[^\n]*/;
const src = fs.readFileSync(path.join(REPO, 'src/server/desktop-access.js'), 'utf8');
ok(LINE.test(src), 'desktop-access.js carries the accept\'s call (the control removes exactly it)');
const M = mutantCopies('picnodelay', REPO).load('src/server/desktop-access.js', src.replace(LINE, ''), 'bare');
const c = await run(M);
ok(c.back && c.relay && !c.accept, 'the copy still forwards, the relay\'s call still shows — and the accept\'s is gone: the spy tells them apart', c);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

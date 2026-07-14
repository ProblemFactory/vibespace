// ws-min.js — a MINIMAL RFC6455 WebSocket CLIENT for the agentd bundle
// (Transport B: dial-out). Zero dependencies (the daemon bundle law): plain
// http/https upgrade + hand-rolled frames. Scope: binary messages only,
// client→server masking (mandated by the RFC), ping→pong, close. No
// extensions, no compression, no fragmentation on send (we fragment nothing;
// received fragmented messages are reassembled).
// Presents the same duplex shape the Mux consumes: {write, on, destroy}.
'use strict';

const crypto = require('crypto');

function connect(url, { headers = {} } = {}) {
  const u = new URL(url);
  const isTls = u.protocol === 'wss:' || u.protocol === 'https:';
  const lib = isTls ? require('https') : require('http');
  const key = crypto.randomBytes(16).toString('base64');
  const listeners = { data: [], close: [], error: [], open: [] };
  const emit = (ev, ...a) => listeners[ev].forEach((f) => { try { f(...a); } catch { } });

  let sock = null;
  let acc = Buffer.alloc(0);
  let fragments = null; // reassembly buffer for fragmented messages
  let dead = false;

  const req = lib.request({
    host: u.hostname,
    port: u.port || (isTls ? 443 : 80),
    path: u.pathname + u.search,
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': key,
      ...headers,
    },
  });
  req.on('upgrade', (res, socket, head) => {
    const expect = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    if (res.headers['sec-websocket-accept'] !== expect) { socket.destroy(); emit('error', new Error('bad accept key')); return; }
    sock = socket;
    socket.on('data', (d) => { acc = acc.length ? Buffer.concat([acc, d]) : d; parse(); });
    socket.on('close', () => { if (!dead) { dead = true; emit('close'); } });
    socket.on('error', () => { if (!dead) { dead = true; emit('error', new Error('socket error')); emit('close'); } });
    emit('open'); // consumers register their data handlers here…
    // …THEN feed `head`: bytes that arrived WITH the 101 response (a fast
    // server's first frames land here; dropping them ate the peer's hello —
    // caught by the redial e2e where the server speaks immediately).
    if (head && head.length) { acc = acc.length ? Buffer.concat([acc, head]) : Buffer.from(head); parse(); }
  });
  req.on('error', (e) => { if (!dead) { dead = true; emit('error', e); emit('close'); } });
  req.on('response', () => { if (!dead) { dead = true; emit('error', new Error('upgrade refused')); emit('close'); } });
  req.end();

  function sendFrame(opcode, payload) {
    if (!sock || dead) return false;
    const mask = crypto.randomBytes(4);
    const len = payload.length;
    let head;
    if (len < 126) { head = Buffer.alloc(2); head[1] = 0x80 | len; }
    else if (len < 65536) { head = Buffer.alloc(4); head[1] = 0x80 | 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(len), 2); }
    head[0] = 0x80 | opcode; // FIN + opcode
    const masked = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
    try { return sock.write(Buffer.concat([head, mask, masked])); } catch { return false; }
  }

  function parse() {
    while (true) {
      if (acc.length < 2) return;
      const fin = (acc[0] & 0x80) !== 0;
      const opcode = acc[0] & 0x0f;
      const maskedBit = (acc[1] & 0x80) !== 0; // server→client MUST be unmasked
      let len = acc[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (acc.length < 4) return; len = acc.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (acc.length < 10) return; len = Number(acc.readBigUInt64BE(2)); off = 10; }
      if (maskedBit) off += 4; // tolerate (nonconforming) masked server frames
      if (acc.length < off + len) return;
      let payload = acc.subarray(off, off + len);
      if (maskedBit) {
        const mask = acc.subarray(off - 4, off);
        const un = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) un[i] = payload[i] ^ mask[i & 3];
        payload = un;
      }
      acc = acc.subarray(off + len);
      if (opcode === 0x9) { sendFrame(0xA, Buffer.from(payload)); continue; }      // ping → pong
      if (opcode === 0xA) continue;                                                // pong
      if (opcode === 0x8) { dead = true; try { sock.destroy(); } catch { } emit('close'); return; } // close
      if (opcode === 0x2 || opcode === 0x1 || opcode === 0x0) {
        if (!fin) { fragments = fragments ? Buffer.concat([fragments, payload]) : Buffer.from(payload); continue; }
        const msg = fragments ? Buffer.concat([fragments, payload]) : payload;
        fragments = null;
        emit('data', Buffer.from(msg));
      }
    }
  }

  return {
    write: (d) => sendFrame(0x2, Buffer.isBuffer(d) ? d : Buffer.from(d)),
    on: (ev, fn) => { listeners[ev]?.push(fn); },
    destroy: () => { dead = true; try { sock?.destroy(); } catch { } try { req.destroy(); } catch { } },
  };
}

module.exports = { connect };

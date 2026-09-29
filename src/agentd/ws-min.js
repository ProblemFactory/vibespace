// ws-min.js — a MINIMAL RFC6455 WebSocket CLIENT for the agentd bundle
// (Transport B: dial-out). Zero dependencies (the daemon bundle law): plain
// http/https upgrade + hand-rolled frames. Scope: binary messages only,
// client→server masking (mandated by the RFC), ping→pong, close. No
// extensions, no compression, no fragmentation on send (we fragment nothing;
// received fragmented messages are reassembled).
// Presents the same duplex shape the Mux consumes: {write, on, destroy}.
'use strict';

const crypto = require('crypto');

// lane-pairing ③ (B-7007): every failure SAYS what it was — the owner's Mac logged only "dial-out failed" while
// the server had refused it by name. A non-101 answer surfaces its status, the server's named refusal
// (`X-VibeSpace-Dial-Refusal`) and ≤ 1 KiB of its body (code UPGRADE_REFUSED); a 200 + `X-VibeSpace-Dial-Probe: ok`
// is the `--dial-check` probe's success (`probe-ok`); a bad accept key is BAD_ACCEPT; request errors keep node's own
// `e.code` (ENOTFOUND, ECONNREFUSED, EPROTO, CERT_*…); a black-holed address times out (`timeoutMs`, ETIMEDOUT)
// instead of hanging until the OS gives up. The classifier is PURE src/dial-facts.js `dialFailureOf`.
const BODY_MAX = 1024;
function connect(url, { headers = {}, timeoutMs = 15000 } = {}) {
  const u = new URL(url);
  const isTls = u.protocol === 'wss:' || u.protocol === 'https:';
  const lib = isTls ? require('https') : require('http');
  const key = crypto.randomBytes(16).toString('base64');
  const listeners = { data: [], close: [], error: [], open: [], 'probe-ok': [] };
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
  let upgraded = false;
  if (Number(timeoutMs) > 0) req.setTimeout(Number(timeoutMs), () => {
    if (upgraded || dead) return;
    const e = new Error(`no answer within ${Number(timeoutMs)} ms`); e.code = 'ETIMEDOUT';
    dead = true; emit('error', e); emit('close'); try { req.destroy(); } catch { }
  });
  req.on('upgrade', (res, socket, head) => {
    upgraded = true;
    try { socket.setTimeout(0); } catch { }
    const expect = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    if (res.headers['sec-websocket-accept'] !== expect) { socket.destroy(); if (!dead) { dead = true; emit('error', Object.assign(new Error('bad accept key'), { code: 'BAD_ACCEPT' })); emit('close'); } return; }
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
  req.on('response', (res) => {
    if (dead) { try { res.destroy(); } catch { } return; }
    let body = Buffer.alloc(0), settled = false;
    const done = () => {
      if (settled || dead) return;
      settled = true; dead = true;
      try { res.destroy(); } catch { }
      const text = body.subarray(0, BODY_MAX).toString('utf8');
      if (res.statusCode === 200 && String(res.headers['x-vibespace-dial-probe'] || '') === 'ok') {
        let parsed = null; try { parsed = JSON.parse(text); } catch { parsed = { ok: true }; }
        emit('probe-ok', parsed); emit('close'); return;
      }
      emit('error', Object.assign(new Error(`upgrade refused (HTTP ${res.statusCode})`), {
        code: 'UPGRADE_REFUSED', status: res.statusCode,
        refusal: String(res.headers['x-vibespace-dial-refusal'] || '').slice(0, 40) || null,
        probe: String(res.headers['x-vibespace-dial-probe'] || '').slice(0, 40) || null,
        body: text,
      }));
      emit('close');
    };
    res.on('data', (d) => { if (body.length < BODY_MAX) body = Buffer.concat([body, d]); if (body.length >= BODY_MAX) done(); });
    res.on('end', done);
    res.on('error', done);
    res.on('close', done);
  });
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

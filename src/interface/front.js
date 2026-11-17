'use strict';
// THE ONE LISTENER (the separation, M1 — the interface, piece B2). ONE port, as today's src/server/tls.js front: each
// connection's first byte decides — 0x16 (a TLS ClientHello) is decrypted HERE with the certificate a party pushed (the
// certificate's plan and renewal start children, so they stay with a party; this process starts none), anything else is a
// plain connection. A ClientHello while no certificate is live is closed, as today.
// THE LAW OF THE SOCKET'S OWNER (piece B1's bench): every page socket gets its options from THIS process — TCP_NODELAY and
// keep-alive per socket (half-open is the listening server's own option). A party behind the link calls setNoDelay() on a
// channel, never on this socket: with the default left on, a keystroke's echo waited on Nagle — the bench read 8.4 ms p50
// with both loops idle (against 0.2 ms), the in-process leg (scripts/test-interface-relay.mjs ③) about 41 ms.
// THE LISTENER NEVER ENDS ON ITS OWN ERROR (主开发's cure, 05:26Z): a failed accept (the file limit reached) is an 'error'
// event on the listening server; one permanent listener counts it and the server keeps listening.
// Piece B2b (主开发 13:43Z):
//   THE TLS STAGE STATES ITS OWN BOUND — a connection whose first byte was a ClientHello and whose handshake does not finish
//     in HANDSHAKE_MS is dropped (Node's own default, today's front's, now said by name and held by a leg).
//   A PUSHED CERTIFICATE THAT CANNOT BE LOADED KEEPS THE OLD CONTEXT and never throws: it is pushed on the link's control
//     channel, whose callback the frame code calls with no guard, so a malformed pair is answered { ok: false, why } and
//     TLS goes on with the certificate it had (or none).
const net = require('net');
const tls = require('tls');

const FIRST_BYTE_MS = 120000;   // a connection that never says anything is dropped (today's front: the same bound)
const HANDSHAKE_MS = 120000;    // a TLS handshake that does not finish is dropped (Node's default, today's front's — said here)

/** the options a page socket gets here — the ONE place (the law's leg reads it) */
function pageSocket(socket) {
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 0);
  return socket;
}

/** → { server, useCertificate(pem | null) → { ok, why? }, serving(), acceptErrors() } — `onPage(socket, facts)` gets every
 *  accepted page connection, plain or decrypted, with the facts this process alone knows: { secure, addr, port } */
function create({ onPage, firstByteMs: fb, handshakeMs: hb } = {}) {
  const firstByteMs = Number(fb) > 0 ? Number(fb) : FIRST_BYTE_MS;
  const handshakeMs = Number(hb) > 0 ? Number(hb) : HANDSHAKE_MS;
  let tlsServer = null, live = false, acceptErrors = 0, lastAcceptError = null;
  const sockets = new Set();   // every accepted socket until it closes — a close of the listener ends them (a half-open page never holds it)
  const plainFacts = (s) => ({ secure: false, addr: s.remoteAddress || null, port: s.remotePort || null });
  function useCertificate(pem) {
    if (!pem) { live = false; return { ok: true }; }   // serving TLS stopped: a ClientHello from now on is closed
    try { tls.createSecureContext({ cert: pem.cert, key: pem.key }); }   // judged BEFORE it replaces anything
    catch (e) { return { ok: false, why: (e && (e.code || e.message)) || 'unusable certificate' }; }   // the old context stays
    if (!tlsServer) {
      tlsServer = tls.createServer({ cert: pem.cert, key: pem.key, allowHalfOpen: true, handshakeTimeout: handshakeMs }, (t) => {
        t.on('error', () => t.destroy());
        onPage(t, { secure: true, addr: t.remoteAddress || null, port: t.remotePort || null });
      });
      tlsServer.on('tlsClientError', (e, s) => { try { s.destroy(); } catch { } });
    } else tlsServer.setSecureContext({ cert: pem.cert, key: pem.key });   // a renewal: no restart
    live = true;
    return { ok: true };
  }
  const server = net.createServer({ allowHalfOpen: true }, (socket) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    pageSocket(socket);
    const drop = () => socket.destroy();
    socket.on('error', drop);
    socket.setTimeout(firstByteMs, drop);
    socket.once('data', (chunk) => {
      socket.removeListener('error', drop); socket.removeListener('timeout', drop); socket.setTimeout(0);
      socket.on('error', () => { });
      socket.pause();
      socket.unshift(chunk);
      if (chunk[0] === 0x16) {
        if (!live) return socket.destroy();
        tlsServer.emit('connection', socket);
      } else onPage(socket, plainFacts(socket));
      process.nextTick(() => socket.resume());
    });
  });
  server.on('error', (e) => { acceptErrors++; lastAcceptError = (e && (e.code || e.message)) || 'error'; });   // the permanent listener: counted, the server keeps listening
  /** the listener closed and every socket it accepted ended — those still waiting for a first byte, half-open pages, TLS pages */
  const close = () => new Promise((resolve) => { server.close(() => resolve()); for (const s of sockets) { try { s.destroy(); } catch { } } sockets.clear(); });
  return { server, useCertificate, close, serving: () => live, acceptErrors: () => ({ count: acceptErrors, last: lastAcceptError }) };
}

module.exports = { create, pageSocket, FIRST_BYTE_MS, HANDSHAKE_MS };

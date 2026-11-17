'use strict';
// TODAY'S HUB AS ONE PARTY OF THE INTERFACE'S LINK (the separation, M1 — lane B, piece B2b; lane readings' contract v1,
// /var/tmp/vibespace-lanes/scf/cs/contract-A.md §3–§4). The supervisor starts the hub with its start pipe on fd 3; its first
// line `{op:'start', party:'hub', secret, link}` names the interface's link socket and this start's secret. join() connects
// there and says the hello `{op:'hello', protoVersion:1, party, secret}`. Only an answer `hello-ack` makes it a party.
// `auth-fail` (an unknown name, no admit, a wrong or an old generation's secret) or a link that ends first is refused,
// and the caller exits.
// THE LINK, as the contract builds it at both ends: closeAfterQueue (a channel's CLOSE leaves behind its own queued
// bytes), heartbeat off (one machine: only the stream's end ends it), maxControl 64 KiB. Each byte channel the interface
// opens (`{op:'open', chan, to, trace, stamp}`) is ONE page connection. It is handed to the hub's own http.Server as a
// socket (src/agentd/chan-socket.js: the router credits its own channels — this module never does — and onDead ⇒
// router.dead()). The stamp the interface wrote — {secure, addr, port} — rides the socket (remoteAddress / encrypted).
const net = require('net');
const { Mux } = require('../agentd/mux.js');
const { createChanSockets } = require('../agentd/chan-socket.js');

const PROTO_VERSION = 1;
const MAX_CONTROL = 64 * 1024;

/** → Promise<{ mux, router, capabilities }> once the interface admitted this party; rejects on auth-fail or a link that
 *  ended first. `server` = the hub's http.Server (each channel: server.emit('connection', socket)); `onDead(why)` once an
 *  admitted link dies (the hub has no page road left: the caller ends). */
function join({ start, server, connect = (p) => net.connect(p), onDead = () => { } } = {}) {
  if (!start || typeof start.link !== 'string' || typeof start.secret !== 'string') return Promise.reject(new Error('join: the start line names no link or secret'));
  return new Promise((resolve, reject) => {
    const sock = connect(start.link);
    let admitted = false, router = null;
    const mux = new Mux(sock, {
      heartbeat: false, closeAfterQueue: true, maxControl: MAX_CONTROL,
      onControl: (m) => {
        if (!admitted) {
          if (m && m.op === 'hello-ack') { admitted = true; resolve({ mux, router, capabilities: Array.isArray(m.capabilities) ? m.capabilities : [] }); }
          else if (m && m.op === 'auth-fail') { reject(new Error('the interface refused this party (auth-fail)')); try { mux.destroy(); } catch { } }
          return;
        }
        if (m && m.op === 'open' && Number.isInteger(m.chan)) server.emit('connection', router.open(m.chan, m.stamp || {}));
      },
      onData: (chan, buf) => { if (!router.onData(chan, buf)) mux.credit(chan, buf.length); },   // a channel the router does not hold: dropped, never owed
      onWritable: (chan) => { router.onWritable(chan); },
      onClose: (chan) => { router.onClose(chan); },
      onDead: (why) => { router.dead(); if (!admitted) reject(new Error(`the link ended before the interface answered (${why})`)); else onDead(why); },
    });
    router = createChanSockets(mux);
    sock.on('connect', () => mux.control({ op: 'hello', protoVersion: PROTO_VERSION, party: start.party || 'hub', secret: start.secret }));
  });
}

module.exports = { join, PROTO_VERSION, MAX_CONTROL };

'use strict';
// TODAY'S HUB AS ONE PARTY OF THE INTERFACE'S LINK (the separation, M1 — lane B, piece B2b; lane readings' contract v1,
// /var/tmp/vibespace-lanes/scf/cs/contract-A.md §3–§4). The supervisor starts the hub with a start pipe it names (VIBESPACE_START_FD); its first
// line `{op:'start', party:'hub', secret, link}` names the interface's link socket and this start's secret. join() connects
// there, waits for the interface's challenge, and PROVES the secret (the greeting's version 2, the contract's dated line of
// 2026-11-21: `{op:'hello', protoVersion:2, party, proof}`, a proof keyed by the secret's digest — the secret itself is on
// no link). Only an answer `hello-ack` makes it a party.
// `auth-fail` (an unknown name, no admit, a wrong proof or an old generation's) or a link that ends first is refused,
// and the caller exits. AN INTERFACE THAT ACCEPTS AND NEVER ANSWERS is refused too, by name, after JOIN_ANSWER_MS
// (主开发 00:02Z, law 3: every bad start ends by name in bounded time — the interface's own HELLO_MS bounds only the
// other direction).
// THE LINK, as the contract builds it at both ends: closeAfterQueue (a channel's CLOSE leaves behind its own queued
// bytes), heartbeat off (one machine: only the stream's end ends it), maxControl 64 KiB. Each byte channel the interface
// opens (`{op:'open', chan, to, trace, stamp}`) is ONE page connection. It is handed to the hub's own http.Server as a
// socket (src/agentd/chan-socket.js: the router credits its own channels — this module never does — and onDead ⇒
// router.dead()). The stamp the interface wrote — {secure, addr, port} — rides the socket (remoteAddress / encrypted).
// THE SIGN-IN FACT (piece B3b-1, 主开发 r1517 (A)): when the interface holds the sign-in table, the stamp carries its fact for
// that head — 'off', { alive: <a login's sha256 digest>, epoch } or null — kept on the channel's socket (signinFactOf), read by the
// piped hub's gate (src/server/piped-auth.js); a malformed fact is kept as null (no login). The table's state line
// `{op:'signin-state', …}` and its answer to a revoke (`{op:'signin-revoke-all-ack', revoked}`) go to `onSignin`.
const net = require('net');
const { Mux } = require('../agentd/mux.js');
const { createChanSockets } = require('../agentd/chan-socket.js');
const { digestOf, proofOf } = require('../link-proof.js');   // the greeting, version 2: the start value never crosses a link

const PROTO_VERSION = 2;
const MAX_CONTROL = 64 * 1024;
const JOIN_ANSWER_MS = 5000;
const SIGNIN = Symbol('the sign-in fact');
const DIGEST_RE = /^[0-9a-f]{64}$/;
/** the stamp's sign-in fact, judged: 'off' | { alive } | null — undefined when the stamp carries none (no table) */
function factOf(stamp) {
  if (!stamp || !('signin' in stamp)) return undefined;
  const f = stamp.signin;
  if (f === 'off') return 'off';
  if (!(f && typeof f === 'object' && typeof f.alive === 'string' && DIGEST_RE.test(f.alive))) return null;
  return { alive: f.alive, epoch: Number.isSafeInteger(f.epoch) && f.epoch >= 0 ? f.epoch : -1 };   // the follow: the order the stamp was made after (no epoch: before every order)
}
/** the fact the interface wrote for the head this socket carries (undefined: none — not a channel, or no table) */
const signinFactOf = (socket) => (socket ? socket[SIGNIN] : undefined);

/** → Promise<{ mux, router, capabilities }> once the interface admitted this party; rejects on auth-fail, a link that
 *  ended first, or no answer inside `answerMs` (e.code 'no-answer'). `server` = the hub's http.Server (each channel:
 *  server.emit('connection', socket)); `onDead(why)` once an admitted link dies (the hub has no page road left: the
 *  caller ends). */
const EXCHANGE = Symbol('one exchange');
const HEAD_EVENTS = new Set(['request', 'upgrade', 'checkContinue', 'checkExpectation', 'connect']);   // an http.Server's events that serve a head
/** ONE CHANNEL IS ONE EXCHANGE (the framing unit, 主开发 r922 law 2): the interface opens a channel for ONE head and its answer,
 *  so a SECOND head on a channel's socket is never served — refused by name in the hub's journal, the socket destroyed,
 *  nothing more written. Installed once on the hub's own http.Server; a socket that is no channel (the plain form) is untouched. */
function oneExchange(server, log = console) {
  if (!server || server[EXCHANGE]) return;
  const emit = server.emit;
  server.emit = function (ev, req, ...rest) {
    const x = HEAD_EVENTS.has(ev) && req && req.socket ? req.socket[EXCHANGE] : null;
    if (x && x.heads++ > 0) {
      try { log.error?.(`[interface-party] a second head on one channel (chan ${x.chan}) is never served — refused, nothing written`); } catch { }
      try { req.socket.destroy(); } catch { }
      return false;
    }
    return emit.call(this, ev, req, ...rest);
  };
  server[EXCHANGE] = true;
}

/** THE GREETING, VERSION 2 (主开发 r1087): the interface's first line is `{op:'challenge', protoVersion:2, nonce}`; this party
 *  answers `{op:'hello', protoVersion:2, party, proof}` — a proof keyed by its DIGEST (src/link-proof.js), never its start
 *  value: no start value is on any frame of any link. `start` names the link and either the start value (`secret`, the
 *  first join: its digest is derived here) or its `digest` alone (a re-join holds nothing more). */
function join({ start, server, connect = (p) => net.connect(p), onDead = () => { }, onSignin = () => { }, answerMs = JOIN_ANSWER_MS, log = console } = {}) {
  const digest = start && typeof start.digest === 'string' ? start.digest : start && typeof start.secret === 'string' ? digestOf(start.secret) : null;
  if (!start || typeof start.link !== 'string' || !digest) return Promise.reject(new Error('join: the start line names no link or secret'));
  const party = start.party || 'hub';
  oneExchange(server, log);
  return new Promise((resolve, reject) => {
    const sock = connect(start.link);
    let admitted = false, router = null, silent = null;
    const mux = new Mux(sock, {
      heartbeat: false, closeAfterQueue: true, maxControl: MAX_CONTROL,
      onControl: (m) => {
        if (!admitted) {
          if (m && m.op === 'challenge' && typeof m.nonce === 'string') { try { mux.control({ op: 'hello', protoVersion: PROTO_VERSION, party, proof: proofOf(digest, m.nonce, party) }); } catch { } return; }   // the proof, never the start value
          if (m && m.op === 'hello-ack') { clearTimeout(silent); admitted = true; resolve({ mux, router, capabilities: Array.isArray(m.capabilities) ? m.capabilities : [] }); }
          else if (m && m.op === 'auth-fail') { clearTimeout(silent); reject(new Error('the interface refused this party (auth-fail)')); try { mux.destroy(); } catch { } }
          return;
        }
        if (m && (m.op === 'signin-state' || m.op === 'signin-revoke-all-ack')) { try { onSignin(m); } catch { } return; }   // the interface's sign-in table: its state, and its answer to a revoke (B3b-1)
        if (m && m.op === 'open' && Number.isInteger(m.chan)) {
          // A CHANNEL WITH NO ADDRESS IS REFUSED: the channel socket reads a missing address as the local one, and two doors of the
          // hub trust the local address — the interface never sends one without it, and the default fails closed (r1057 item 2)
          // (a malformed address STRING is left, deliberately, to the doors that read it: this check fails closed on a missing one only)
          if (!m.stamp || typeof m.stamp.addr !== 'string' || !m.stamp.addr) {
            try { log.error?.(`[interface-party] an open line with no address (chan ${m.chan}) is refused — a channel is never read as the local one`); } catch { }
            try { mux.closeChan(m.chan); } catch { }
            return;
          }
          const s = router.open(m.chan, m.stamp); s[EXCHANGE] = { heads: 0, chan: m.chan };   // ONE exchange this channel
          s[SIGNIN] = factOf(m.stamp);   // the sign-in table's fact for this head (B3b-1)
          s.on('error', () => { });   // a dead link destroys its channels «with an error»; an UPGRADED socket has no http.Server listener left, so that error would end the hub — the death is said by name (onDead), never thrown
          server.emit('connection', s);
        }
      },
      onData: (chan, buf) => { if (!router.onData(chan, buf)) mux.credit(chan, buf.length); },   // a channel the router does not hold: dropped, never owed
      onWritable: (chan) => { router.onWritable(chan); },
      onClose: (chan) => { router.onClose(chan); },
      onDead: (why) => { clearTimeout(silent); router.dead(); if (!admitted) reject(new Error(`the link ended before the interface answered (${why})`)); else onDead(why); },
    });
    router = createChanSockets(mux);
    silent = setTimeout(() => {   // accepted, never answered: refused BY NAME, the link dropped (declared after the mux it names)
      const e = new Error(`the interface never answered this party's hello within ${answerMs / 1000} s`); e.code = 'no-answer';
      reject(e); try { mux.destroy(); } catch { }
    }, answerMs);
    // (no hello on connect: the interface speaks first, with its challenge — an interface that never does is refused at answerMs)
  });
}

module.exports = { join, oneExchange, signinFactOf, factOf, PROTO_VERSION, MAX_CONTROL, JOIN_ANSWER_MS };

'use strict';
// THE RELAY (the separation, M1 — the interface; piece B2, RE-FRAMED by the framing unit — 主开发 r922, shape (A)). A page
// connection is HTTP/1.1, and ONE EXCHANGE rides ONE byte channel of the link to the party that owns it (law 2):
//   a request  — Node's OWN parser (the page server, ./front.js) gives the head. The head goes onto its own channel as an http
//                client request — Node's own writer, told to add NO line of its own (`setDefaultHeaders: false`): the method,
//                the target as received, every header line in its order, with its duplicates and its case — and the body
//                follows under credit, its trailers after it. The party's answer is read by Node's own client parser and written
//                to the page as the party wrote it: the status, every header line in order, the body, its trailers. Each answer
//                reaches the page only from its own request's channel, in request order (the page server's own queue), on a
//                page connection that stays open across requests as in the plain form (the party's Connection line decides, as
//                it does there).
//   an upgrade — the head goes onto its channel as received (its lines re-joined), then the page socket and the channel are
//                piped RAW both ways; nothing after that head is parsed, and the upgraded socket never outlives its channel.
// IT DECIDES NOTHING (law 3): the open line carries no class — {op, chan, to, trace, stamp: {secure, addr, port}} — and the
// party's own gate judges every head it serves. It parses heads, never a body's content (the design's sentence, amended by
// r922). A request with no party to hand it to is answered BY NAME (503 «no-owner»), never by a closed socket (law 9).
// THE STAMP rides the control channel only; channel numbers count up and STOP before they could wrap to 0, the control
// channel (src/agentd/mux.js writes `chan >>> 0`): no page byte is ever read as a control line (law 5).
// THE DECLARED LIST — the only differences from the plain form (law 6; scripts/test-interface-framing.mjs ⑥'s differential
// holds it), each forced by Node's writer, none a choice: see DECLARED below.
const http = require('http');
const crypto = require('crypto');
const { createChanSockets } = require('../agentd/chan-socket.js');

const LAST_CHAN = 0xFFFFFFFF;   // the frame code's channel numbers are 32 bits (`chan >>> 0`); one more would be 0, the control channel
const NO_OWNER = { error: 'no-owner', why: 'the hub is not attached to the interface right now — the request was not handed to anyone' };
const SPENT = { error: 'no-owner', why: 'this link\'s channel numbers are spent — the hub must re-attach' };
/** THE DECLARED LIST (law 6): what differs from the plain form, and why — closed; the differential reads it by these names */
const DECLARED = Object.freeze({
  version: 'the hub reads every forwarded head as HTTP/1.1: Node\'s client writes no other version',
  oldHostless: 'so an HTTP/1.0 head with no Host line is refused 400 by the hub\'s Node, which asks every HTTP/1.1 head for one (the plain form serves it)',
  oldPage: 'an HTTP/1.0 page\'s answer was framed by the hub for HTTP/1.1, so its Transfer-Encoding, Connection, Keep-Alive and Trailer lines are dropped and the interface\'s Node frames it for HTTP/1.0: by the hub\'s Content-Length when it gave one, else by the close; and the 100 Continue the hub\'s Node says to an Expect it read as HTTP/1.1 is not forwarded (Node never says one to HTTP/1.0)',
  informational: 'an informational answer is written by Node with Node\'s reason phrase; on a Node without writeInformation (22) only 100, 102 and 103 are forwarded',
  orphanTrailer: 'a Trailer line on a request that is not chunked is dropped: no trailer can follow it, and Node\'s writer refuses to write it',
  chunks: 'a chunked body\'s chunk sizes and chunk extensions are Node\'s; the body is equal by digest',
});
const OLD_PAGE_DROPS = new Set(['transfer-encoding', 'connection', 'keep-alive', 'trailer']);   // DECLARED.oldPage
const UPGRADE_LINGER_MS = 2000;   // a refused upgrade's last words: the page socket is destroyed once they are written, or after this long (law 9: by name, never a closed socket)
const RE_TE_CHUNKED = /(?:^|\W)chunked(?:$|\W)/i;   // Node's own test of a Transfer-Encoding line (lib/_http_outgoing.js)

/** a flat [name, value, …] list without the lines whose lower-cased name is in `drop` */
const without = (raw, drop) => { const out = []; for (let i = 0; i + 1 < raw.length; i += 2) if (!drop.has(String(raw[i]).toLowerCase())) out.push(raw[i], raw[i + 1]); return out; };
const has = (raw, name) => { for (let i = 0; i + 1 < raw.length; i += 2) if (String(raw[i]).toLowerCase() === name) return true; return false; };
const pairsOf = (raw) => { const out = []; for (let i = 0; i + 1 < raw.length; i += 2) out.push([raw[i], raw[i + 1]]); return out; };
/** a request's lines for the party: every line as the page sent it, but DECLARED.orphanTrailer */
function requestLines(raw) {
  for (let i = 0; i + 1 < raw.length; i += 2) if (String(raw[i]).toLowerCase() === 'transfer-encoding' && RE_TE_CHUNKED.test(raw[i + 1])) return raw.slice();
  return has(raw, 'trailer') ? without(raw, new Set(['trailer'])) : raw.slice();
}
/** an answer's lines for the page: the party's, but DECLARED.oldPage */
const answerLines = (req, raw) => (req.httpVersion === '1.0' ? without(raw, OLD_PAGE_DROPS) : raw.slice());
/** an upgrade's head as received: its request line and its header lines, re-joined (latin1: the bytes as they came) */
const headOf = (req) => { let h = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`; for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) h += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`; return Buffer.from(h + '\r\n', 'latin1'); };
/** the channel socket as Node's client writes on it: every STRING it is handed is a head's text (a page's body comes as
 *  Buffers), and a head is latin1. Node's own Expect flush (lib/_http_outgoing.js: _storeHeader → _send('')) hands the head
 *  as a string with NO encoding, which the socket writes as UTF-8 — a byte above 0x7f would reach the party re-encoded. So a
 *  string is written as latin1, whatever it is told. */
function headsAsLatin1(sock) {
  const write = sock.write.bind(sock);
  sock.write = (data, enc, cb) => (typeof data === 'string' ? write(Buffer.from(data, 'latin1'), typeof enc === 'function' ? enc : cb) : write(data, enc, cb));
  return sock;
}
/** a 103's hints as Node's writeEarlyHints takes them (DECLARED.informational, on Node 22) */
const hintsOf = (raw) => { const h = {}; for (const [k, v] of pairsOf(raw)) { const key = String(k).toLowerCase() === 'link' ? 'link' : k; h[key] = h[key] === undefined ? v : [].concat(h[key], v); } return h; };

/** → { handlersFor(mux), attach(mux), current(), exchange(req, res, facts), upgrade(req, socket, head, facts), stats() } */
function create({ ownerOf, newTrace = () => crypto.randomBytes(8).toString('hex'), firstChan = 1, log = console } = {}) {
  let mux = null, router = null, next = Math.max(1, Number(firstChan) >>> 0 || 1), exhausted = false;
  const routers = new Map();   // a link → its channel sockets (createChanSockets), so a re-attached link's late death ends only its own
  const live = new Map();      // the channel's SOCKET → { kind, mux, sock, page | req + res + out + a } — every stream a byte waits in here
  const keyOf = (sock) => sock;   // a channel is named by its link AND its number: numbers start again at 1 on a re-attached link, its socket is its own
  const stats = { exchanges: 0, upgrades: 0, noOwner: 0, exhausted: 0, unforwardable: 0, toLink: 0, paused: 0 };
  /** what waits in THIS process now: every live channel's socket (both ways) and the page side's queue (law 8: one window a
   *  channel and direction — the channel socket credits only what its reader takes) */
  const held = () => {   // each byte counted once: a response's writableLength holds its page socket's, a client request's its channel socket's
    let n = 0;
    for (const e of live.values()) {
      if (e.kind === 'upgrade') n += e.sock.readableLength + e.sock.writableLength + (e.page ? e.page.writableLength : 0);
      else n += e.sock.readableLength + (e.out ? e.out.writableLength || 0 : e.sock.writableLength) + (e.res ? e.res.writableLength || 0 : 0) + (e.req ? e.req.readableLength : 0) + (e.a ? e.a.readableLength : 0);
    }
    return n;
  };
  /** the page side's bytes, counted as this process takes them, and each pause back-pressure puts on it */
  const tap = (from) => { from.on('data', (b) => { stats.toLink += b.length; }); from.on('pause', () => { stats.paused++; }); };
  /** a new channel on the current link with its open line, or null (no link, or the numbers are spent) */
  function openChan(kind, req, facts) {
    if (!mux) return null;
    if (next > LAST_CHAN) { if (!exhausted) { exhausted = true; try { log.error?.('[interface] the link\'s channel numbers are spent — no new exchange is opened on it (channel 0 is the control channel, never a page\'s)'); } catch { } } stats.exhausted++; return null; }
    const m = mux, rt = router, chan = next++;
    m.control({ op: 'open', chan, to: ownerOf({ kind: 'route', method: req.method, path: req.url }), trace: newTrace(), stamp: { secure: !!facts.secure, addr: facts.addr || null, port: facts.port || null } });
    const sock = rt.open(chan, {});
    const e = { kind, mux: m, sock, page: null, req: null, res: null, out: null, a: null, left: 2 };
    e.done = () => { if (--e.left === 0) live.delete(keyOf(sock)); };   // gone when the channel AND its page side have closed: a byte may wait on the page side after its channel ended
    live.set(keyOf(sock), e); sock.once('close', e.done);
    sock.on('error', () => { });
    return sock;
  }
  /** the answer this process writes ITSELF when nobody can take the request — by name, never a closed socket */
  function answerItself(res, status, body, { close = false } = {}) {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...(close ? { connection: 'close' } : {}) });   // close: the channel went mid-exchange, so what the page still sends of its body is nobody's — its connection ends
    res.end(JSON.stringify(body));
  }
  /** ONE request: its own channel, Node's writer and Node's reader, the page's answer from that channel only */
  function exchange(req, res, facts = {}) {
    if (!facts.addr) { req.socket.destroy(); return; }   // no address: the page is already gone, and is never stamped (the far side reads a null address as loopback)
    const sock = openChan('exchange', req, facts);
    if (!sock) { stats.noOwner++; answerItself(res, 503, exhausted ? SPENT : NO_OWNER); req.resume(); return; }
    res.once('close', live.get(keyOf(sock)).done);
    let out;
    // NO agent: with `agent: false` Node builds an Agent of its own, which dials TCP and never calls createConnection
    try { out = http.request({ createConnection: () => headsAsLatin1(sock), method: req.method, path: req.url, headers: requestLines(req.rawHeaders), setDefaultHeaders: false }); }
    catch (e) {   // a head Node's server read and Node's writer refuses: answered by name, the process never ends on it
      stats.unforwardable++; sock.destroy(); req.resume();
      try { log.error?.(`[interface] a head Node's writer refuses was answered 400 «unforwardable» (${String(e && e.code || e).slice(0, 60)})`); } catch { }
      answerItself(res, 400, { error: 'unforwardable', why: 'Node\'s writer refuses this head, so it cannot reach the hub as it came' }); return;
    }
    stats.exchanges++; Object.assign(live.get(keyOf(sock)) || {}, { req, res, out });
    out.on('information', (i) => {
      try {
        if (i.statusCode === 100) { if (req.httpVersion !== '1.0') res.writeContinue(); }   // DECLARED.oldPage: Node says no 100 to HTTP/1.0
        else if (typeof res.writeInformation === 'function') res.writeInformation(i.statusCode, i.rawHeaders);
        else if (i.statusCode === 102) res.writeProcessing();
        else if (i.statusCode === 103) res.writeEarlyHints(hintsOf(i.rawHeaders));
      } catch { }
    });
    out.on('response', (a) => {
      Object.assign(live.get(keyOf(sock)) || {}, { a });
      const lines = answerLines(req, a.rawHeaders);
      res.sendDate = false;   // the party's Date line, or none — never one of the interface's
      if (!has(lines, 'content-length') && !has(lines, 'transfer-encoding')) { res.removeHeader('content-length'); res.removeHeader('transfer-encoding'); }   // the party framed it by its channel's close: so is the page's
      try { res.writeHead(a.statusCode, a.statusMessage, lines); }
      catch { a.destroy(); out.destroy(); answerItself(res, 502, { error: 'owner-garbled', why: 'the hub\'s answer head cannot be written to the page' }, { close: true }); return; }
      a.pipe(res, { end: false });
      a.on('end', () => {
        if (a.rawTrailers.length) { try { res.addTrailers(pairsOf(a.rawTrailers)); } catch { } }
        res.end();
        if (!req.complete) { req.unpipe(out); req.resume(); }   // answered before the page's body ended: the rest is read and dropped, as the plain form's Node dumps it — the page connection goes on
      });
      a.on('error', () => res.destroy());
    });
    out.on('error', () => {
      req.unpipe(out); req.resume();   // nobody takes the rest of the page's body now
      if (res.writableEnded || res.destroyed) return;   // the answer was whole (a write after it failed): nothing to undo
      if (!res.headersSent) answerItself(res, 502, { error: 'owner-lost', why: 'the hub\'s channel ended before its answer' }, { close: true }); else res.destroy();
    });
    const gone = () => { if (!res.writableFinished) { out.destroy(); sock.destroy(); } };   // the page left mid-answer: the channel goes, and the party's handler sees its socket gone
    res.on('close', gone);   // Node closes a PIPELINED response that waits its turn too, when its page socket goes (measured: test-interface-framing ③)
    req.pipe(out, { end: false }); tap(req);
    req.on('end', () => { if (req.rawTrailers.length) { try { out.addTrailers(pairsOf(req.rawTrailers)); } catch { } } out.end(); });
  }
  /** ONE upgrade: its head as received on its own channel, then raw both ways — never parsed after the head */
  function upgrade(req, socket, head, facts = {}) {
    if (!facts.addr) { socket.destroy(); return; }
    const sock = openChan('upgrade', req, facts);
    if (!sock) {   // no owner: answered by name — and, as a refused upgrade's words, the socket goes once they are written, or after UPGRADE_LINGER_MS (r1097)
      stats.noOwner++;
      const t = setTimeout(() => socket.destroy(), UPGRADE_LINGER_MS); t.unref?.();
      try { socket.end('HTTP/1.1 503 Service Unavailable\r\ncontent-type: application/json; charset=utf-8\r\nconnection: close\r\n\r\n' + JSON.stringify(exhausted ? SPENT : NO_OWNER), () => { clearTimeout(t); socket.destroy(); }); } catch { socket.destroy(); }
      return;
    }
    stats.upgrades++; Object.assign(live.get(keyOf(sock)) || {}, { page: socket }); socket.once('close', live.get(keyOf(sock)).done);
    socket.on('error', () => { });
    sock.write(head && head.length ? Buffer.concat([headOf(req), head]) : headOf(req));   // ONE write: the bytes that came with the head reach the party with it, as its own 'upgrade' head
    socket.pipe(sock); sock.pipe(socket); tap(socket);
    socket.once('close', () => sock.destroy());
    sock.once('close', () => {   // an upgraded socket never outlives its channel — but its last words (a 401, a 404) are written first
      if (socket.destroyed) return;
      if (socket.writableFinished) { socket.destroy(); return; }
      const t = setTimeout(() => socket.destroy(), UPGRADE_LINGER_MS); t.unref?.();
      socket.once('finish', () => { clearTimeout(t); socket.destroy(); });
      socket.end();
    });
  }
  /** the callbacks of ONE link, bound to it (a re-attached link gets its own router) */
  function handlersFor(m) {
    const rt = createChanSockets(m); routers.set(m, rt);
    return {
      onData: (chan, buf) => { if (!rt.onData(chan, buf)) { try { m.credit(chan, buf.length); } catch { } } },   // a channel this link's router does not hold: dropped, never owed
      onWritable: (chan) => { rt.onWritable(chan); },
      onClose: (chan) => { rt.onClose(chan); },
      onDead: (why) => { rt.dead(why); routers.delete(m); if (mux === m) { mux = null; router = null; } },
    };
  }
  /** the link new exchanges open on — a re-attach replaces it (its old router's channels end with the old link) */
  function attach(m) { if (mux !== m) { next = Math.max(1, Number(firstChan) >>> 0 || 1); exhausted = false; } mux = m; router = routers.get(m) || null; }   // channel numbers are ONE link's: a new link counts from the start
  return { handlersFor, attach, current: () => mux, exchange, upgrade, stats: () => ({ ...stats, channels: live.size, held: held(), opened: stats.exchanges + stats.upgrades }), LAST_CHAN };
}

module.exports = { create, requestLines, answerLines, headOf, DECLARED, OLD_PAGE_DROPS, LAST_CHAN, NO_OWNER, SPENT, UPGRADE_LINGER_MS };

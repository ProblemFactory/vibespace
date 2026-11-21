'use strict';
// THE HUB'S PORT — THE START DECIDES, AND ONLY THE START (the separation, M1 — lane B, piece B2b; 主开发 2026-11-17 21:43Z).
//   PIPED — started by the supervisor with a start pipe it NAMES (VIBESPACE_START_FD, src/start-pipe.js; lane
//           readings' contract v1 §2: the first line {op:'start', party:'hub', secret, link}): the hub JOINS the
//           interface's link as ONE party (./interface-party.js) and NEVER listens on the port — the interface holds it.
//   PLAIN — started without the word: the hub listens on the port as today and NEVER joins a link. No descriptor is
//           looked at or read (主开发 00:02Z, law 1 AMENDED: in a hub nobody passed anything to, descriptor 3 is the
//           runtime's own — its event poll, its ring, its own pipes — and a parent may leave one there).
// The word is part of the START (no setting, nothing stores it, no door edits it). No fallback from one form to the other
// at run time: a piped hub whose link dies does not open its own listener — it ends (the supervisor starts the next one).
// THE START PIPE IS READ ONCE AND CLOSED at server.js line 5 (claim — the B2b cure 2, 主开发 r724 (A)), before any child can
// exist: the hub keeps no start pipe, so nothing it starts inherits one; its own end rides the link.
// WITH THE WORD, EVERY BAD START ENDS BY NAME IN BOUNDED TIME: one log line saying which, then the end — the word names
// no descriptor / it is not open / no pipe or socket / no line inside START_LINE_MS / the pipe ended first / the first
// line is no start / the interface never answers the join (interface-party.js JOIN_ANSWER_MS).
// THE PLAIN FORM IS A DEBT WITH A COUNT (主开发's law 3): the hub's own listener is ONE named seam, `plainListen` below. One
// assert ties it to the boot helper's census of suites that start server.js directly (test-architecture §57c); at its floor
// it goes red «delete the listener now, B2c», and B2c deletes this seam in one commit with the helper's last batch.
// THE START PIPE'S SECRET travels only on the start pipe and in memory: never argv, the environment, a log line or an error text.
// What the hub bound is ITS OWN RECORD (`bound()`), said once at boot: { form, listened, port | link } — never the secret.
const fs = require('fs');
const net = require('net');
const { START_LINE_MS, MAX_START_LINE, takeWord, firstLine, whyText } = require('../start-pipe.js');

let claimed = null;   // the boot's start, TAKEN at server.js line 5 (claim): the word, the one line, the pipe CLOSED
/** THE hub's own end: its normal SIGTERM shutdown (the stores flushed) — ONE site for every end this module makes (§85's row) */
const endSelf = () => process.kill(process.pid, 'SIGTERM');
/** A BAD START EXITS WITH ITS OWN STATUS: 2 — never 0 (a stop) nor 1 (a crash), the interface's code for a bad start too;
 *  server.js's shutdown exits with exitStatus() */
const EXIT_BAD_START = 2;
let badStart = false;
const exitStatus = () => (badStart ? EXIT_BAD_START : 0);

/** THE START PIPE IS CLOSED BEFORE ANY CHILD CAN EXIST (主开发 r724, the B2b cure 2 — ruling (A)). Node cannot mark an
 *  inherited descriptor close-on-exec (no fcntl; a socket pair cannot be reopened through /proc), so the hub reads its ONE
 *  start line where it takes the word and CLOSES the descriptor there, on every road: nothing the hub starts can inherit it,
 *  by construction. Synchronous but BOUNDED (`ms`, START_LINE_MS): libuv's pipe open (net.Socket over the descriptor, never
 *  read through) makes it non-blocking, then it is read in place with a 5 ms nap between empty reads. The hub's own end now
 *  rides the link: the supervisor going ends the interface (its end of file), and the link's death ends the hub.
 *  `w` = a taken word (start-pipe.js takeWord) → { word: true, fd, first } | { word: true, fd, why, raw?, ms? } */
function readStartSync(w, { ms = START_LINE_MS } = {}) {
  const fd = w.fd;
  if (!(fd >= 3)) return { word: true, fd: null, raw: String(w.raw).slice(0, 16), why: 'no-descriptor' };   // 0–2 are stdio, never a start pipe
  let st;
  try { st = fs.fstatSync(fd); } catch { return { word: true, fd, why: 'not-open' }; }
  if (!(st.isFIFO() || st.isSocket())) { try { fs.closeSync(fd); } catch { } return { word: true, fd, why: 'not-a-pipe' }; }   // closed too: no child inherits what the word named
  let sock;
  try { sock = new net.Socket({ fd, readable: false, writable: false }); }   // the descriptor becomes non-blocking; nothing reads through this handle
  catch { try { fs.closeSync(fd); } catch { } return { word: true, fd, why: 'not-a-pipe' }; }
  const nap = new Int32Array(new SharedArrayBuffer(4)), chunk = Buffer.alloc(4096), parts = [], until = Date.now() + ms;
  let size = 0;
  try {
    for (;;) {
      let n;
      try { n = fs.readSync(fd, chunk, 0, chunk.length, null); }
      catch (e) {
        if (!e || (e.code !== 'EAGAIN' && e.code !== 'EWOULDBLOCK')) return { word: true, fd, why: 'ended' };
        if (Date.now() >= until) return { word: true, fd, why: 'no-line', ms };
        Atomics.wait(nap, 0, 0, 5);
        continue;
      }
      if (n === 0) return { word: true, fd, why: 'ended' };
      parts.push(Buffer.from(chunk.subarray(0, n))); size += n;
      const all = Buffer.concat(parts), i = all.indexOf(0x0a);
      if (i >= 0) { let first = null; try { first = JSON.parse(all.subarray(0, i).toString('utf8')); } catch { } return { word: true, fd, first }; }   // never echoed: the line carries the secret
      if (size > MAX_START_LINE) return { word: true, fd, first: null };   // a first line this long is no start
    }
  } finally { try { sock.destroy(); } catch { } }   // THE CLOSE, on every road above
}
/** the start the environment names, read and CLOSED (readStartSync) — or { word: false } */
const takeStart = (env, ms) => { const w = takeWord(env); return w.word ? readStartSync(w, { ms }) : w; };

/** server.js line 5, before any require that can start a child: the start word leaves the environment (law 2) and the one
 *  start line is read and its pipe CLOSED (the B2b cure 2) — the boot's first children (`which dtach`, the CLI probes) see
 *  neither → the claimed start, which decide() reads */
function claim({ env = process.env, ms } = {}) { if (!claimed) claimed = takeStart(env, ms); return claimed; }

/** the claimed (or a suite's) start, judged → { form: 'plain' } | { form: 'piped', start } | { form: 'piped', start: null, why } */
function judge(s) {
  if (s.word === false) return { form: 'plain' };
  if (s.why) return { form: 'piped', start: null, why: s.why, fd: s.fd, raw: s.raw, ms: s.ms };
  const m = s.first;
  if (m && m.op === 'start' && m.party === 'hub' && typeof m.secret === 'string' && typeof m.link === 'string') return { form: 'piped', start: { party: 'hub', secret: m.secret, link: m.link } };
  return { form: 'piped', start: null, why: 'no-start' };   // a first line that is no start: piped, it cannot join (it ends)
}

/** → Promise<the judged start> — the boot's own (claimed at line 5), or the start `env` names (taken, read and closed here:
 *  `env` loses the word), or `pipe` = a suite's stream handed in AS the start pipe (its one line read, then it is let go);
 *  `ms` the start line's bound (START_LINE_MS) */
function decide({ env = process.env, pipe = null, ms } = {}) {
  if (pipe) return firstLine(pipe, { ms }).then((s) => { try { pipe.destroy(); } catch { } return judge(s); });
  return Promise.resolve(judge(env === process.env && claimed ? claimed : takeStart(env, ms)));
}

/** A BAD START ENDS AT ONCE, by name (law 3): server.js runs this on decide()'s answer (line 109), so the line and the end
 *  come as soon as the start is judged — not after the boot's restore probes (up to 25 s) let the boot call listen. wire()
 *  then says nothing more of it. → whether it ended the hub */
function endBadStart(decision, { end = endSelf, log = console } = {}) {
  if (!decision || decision.form !== 'piped' || decision.start || decision.ended) return false;
  decision.ended = true; badStart = true;
  try { log.error?.(`[hub-port] ${whyText(decision)} — this hub cannot join and ends`); } catch { }
  end();
  return true;
}

/** THE CERTIFICATE BEFORE THE WIRING (the B2b cure 2 — the pair heavy's first real run): tls.js serves the last pair at
 *  once, BEFORE listen (loadSync), so its one onCertificate came while the boot had not wired the form yet, and was dropped
 *  — a renewal of the same pair never calls again, so the interface never had a certificate and every TLS page was reset.
 *  server.js hands tls.js this; a pair that comes before wire() is held and pushed by it (after the join, as any other). */
let wired = null, earlyPem;
function certificate(pem) { if (wired) wired.pushCertificate(pem); else earlyPem = pem || null; }

/** the ONE seam of the plain form: the hub's own listener (B2c deletes it) */
function plainListen(hub, port, host, cb) { return hub.listen(port, host, cb); }

/** Wire the decided form into the hub: `hub.listen(PORT, HOST, cb)` in server.js stays the one boot call; in the PIPED form
 *  it joins the link and runs the same callback. → { bound(), form, pushCertificate(pem | null) } — the PIPED form pushes the
 *  hub's live certificate (src/server/tls.js plans and renews it, starting children; the interface starts none) over the
 *  link as {op:'certificate', cert, key}; one that comes before the join waits for it. The PLAIN form serves its own. */
function wire(decision, { hub, server, join = require('./interface-party.js').join, end = endSelf, log = console } = {}) {
  let record = { form: decision.form, listened: false }, party = null, pendingPem;
  const listenOwn = hub.listen;
  const push = (pem) => { try { party.mux.control(pem ? { op: 'certificate', cert: String(pem.cert), key: String(pem.key) } : { op: 'certificate' }); } catch { } };
  if (decision.form === 'plain') {
    hub.listen = (port, host, cb) => { record = { form: 'plain', listened: true, port: Number(port) }; return plainListen({ listen: (...a) => listenOwn.apply(hub, a) }, port, host, () => { try { log.log?.(`[hub-port] ${JSON.stringify(record)}`); } catch { } cb && cb(); }); };
  } else {
    hub.listen = (port, host, cb) => {   // PIPED: the port is the interface's — this hub never listens on it
      if (!decision.start) { if (!decision.ended) { badStart = true; try { log.error?.(`[hub-port] ${whyText(decision)} — this hub cannot join and ends`); } catch { } end(); } return hub; }   // each bad start BY NAME (never the line), once
      join({ start: decision.start, server, onDead: () => { try { log.error?.('[hub-port] the interface\'s link ended — this hub ends (never its own listener)'); } catch { } end(); } })
        .then((p) => { party = p; record = { form: 'piped', listened: false, link: decision.start.link }; try { log.log?.(`[hub-port] ${JSON.stringify(record)}`); } catch { } if (pendingPem !== undefined) push(pendingPem); cb && cb(); },
          (e) => { try { log.error?.(e && e.code === 'no-answer' ? `[hub-port] ${e.message} — this hub ends` : `[hub-port] the interface refused this hub (${(e && e.message) || 'refused'}) — it ends`); } catch { } end(); });
      return hub;
    };
  }
  const pushCertificate = (pem) => { if (decision.form !== 'piped') return; if (party) push(pem); else pendingPem = pem || null; };
  wired = { form: decision.form, bound: () => ({ ...record }), pushCertificate };
  if (earlyPem !== undefined) { const pem = earlyPem; earlyPem = undefined; pushCertificate(pem); }   // the pair tls.js served before this wiring
  return wired;
}

module.exports = { claim, decide, endBadStart, exitStatus, EXIT_BAD_START, certificate, wire, plainListen };

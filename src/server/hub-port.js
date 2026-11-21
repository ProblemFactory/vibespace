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
// the interface's modules (the link's proof, the party's join and its channel code) load in the PIPED branch only: a hub with the
// switch off loads what the release loads (主开发 r1341 6)

let claimed = null;   // the boot's start, TAKEN at server.js line 5 (claim): the word, the one line, the pipe CLOSED
let claimedDecision = null;   // that start JUDGED, once (decide): its parsed line is dropped there (主开发 r1124 1)
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
  // closed too: no child inherits what the word named — and a close that fails is KEPT in the judged start (closeCode), never
  // swallowed (test-fd-close-census: no close under an empty catch)
  if (!(st.isFIFO() || st.isSocket())) { let closeCode = null; try { fs.closeSync(fd); } catch (e) { closeCode = (e && e.code) || 'error'; } return { word: true, fd, why: 'not-a-pipe', ...(closeCode ? { closeCode } : {}) }; }
  let sock;
  try { sock = new net.Socket({ fd, readable: false, writable: false }); }   // the descriptor becomes non-blocking; nothing reads through this handle
  catch { let closeCode = null; try { fs.closeSync(fd); } catch (e) { closeCode = (e && e.code) || 'error'; } return { word: true, fd, why: 'not-a-pipe', ...(closeCode ? { closeCode } : {}) }; }
  const nap = new Int32Array(new SharedArrayBuffer(4)), chunk = Buffer.alloc(4096), parts = [], until = Date.now() + ms;
  let size = 0;
  try {
    for (;;) {
      let n;
      try { n = fs.readSync(fd, chunk, 0, chunk.length, null); }
      catch (e) {
        if (!e || (e.code !== 'EAGAIN' && e.code !== 'EWOULDBLOCK')) return { word: true, fd, why: 'read-fault', code: (e && e.code) || 'error' };   // a READ FAULT, said with its code
        if (Date.now() >= until) return { word: true, fd, why: 'no-line', ms };
        Atomics.wait(nap, 0, 0, 5);
        continue;
      }
      if (n === 0) return { word: true, fd, why: 'ended' };
      // TWO BOUNDS: the clock (`until`, START_LINE_MS) and the size (MAX_START_LINE); the newline is looked for in the NEW
      // chunk only — what came before held none
      const got = chunk.subarray(0, n), i = got.indexOf(0x0a);
      if (i >= 0) { let first = null; try { first = JSON.parse(Buffer.concat([...parts, got.subarray(0, i)]).toString('utf8')); } catch { } return { word: true, fd, first }; }   // never echoed: the line carries the secret
      parts.push(Buffer.from(got)); size += n;
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
  if (s.why) return { form: 'piped', start: null, why: s.why, fd: s.fd, raw: s.raw, ms: s.ms, code: s.code, ...(s.closeCode ? { closeCode: s.closeCode } : {}) };
  const m = s.first;
  if (m && m.op === 'start' && m.party === 'hub' && typeof m.secret === 'string' && typeof m.link === 'string') return { form: 'piped', start: { party: 'hub', secret: m.secret, link: m.link } };
  return { form: 'piped', start: null, why: 'no-start' };   // a first line that is no start: piped, it cannot join (it ends)
}

/** → Promise<the judged start> — the boot's own (claimed at line 5), or the start `env` names (taken, read and closed here:
 *  `env` loses the word), or `pipe` = a suite's stream handed in AS the start pipe (its one line read, then it is let go);
 *  `ms` the start line's bound (START_LINE_MS) */
function decide({ env = process.env, pipe = null, ms } = {}) {
  if (pipe) return firstLine(pipe, { ms }).then((s) => { try { pipe.destroy(); } catch { } return judge(s); });
  if (env === process.env && claimed) {
    // THE PARSED START LINE IS DROPPED ONCE JUDGED: from here the start value is held by the decision alone, and only until
    // wire() makes its digest — this module keeps no copy of the line (claim() answers { word, fd } after this)
    if (!claimedDecision) { claimedDecision = judge(claimed); claimed = { word: claimed.word, fd: claimed.fd }; }
    return Promise.resolve(claimedDecision);
  }
  return Promise.resolve(judge(takeStart(env, ms)));
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

/** THE HUB OUTLIVES ITS INTERFACE (主开发 r1060): when the interface's link dies, the hub waits this long for a NEW interface's
 *  link (the same path, the same admit — the supervisor writes it before the new interface starts), proving its start value
 *  again with the digest alone; past it, it ends by name exactly as before. What ends with the link: every channel (the
 *  pages reconnect, as after any start). What survives: this process, its unlocked vault, its conversations. */
const REJOIN_MS = 30000;
const REJOIN_FIRST_MS = 50;        // the first re-join try after the link's death
const REJOIN_STEP_MAX_MS = 2000;   // the longest wait between tries (the wait doubles up to it)
/** THE LAST TRY'S FLOOR (主开发 r1124 3): a try's answer bound is what is left of REJOIN_MS, never under this — what a real,
 *  slow start of a new interface meets (its challenge, this hub's proof, its ack). No try STARTS past the bound; the last one
 *  may run up to this floor past it, so the hub's end comes at most REJOIN_TRY_FLOOR_MS after REJOIN_MS. */
const REJOIN_TRY_FLOOR_MS = 1000;
const monoNow = () => performance.now();   // the re-join's clock: a wall-clock step (Date.now) never stretches nor cuts the bound

/** the ONE seam of the plain form: the hub's own listener (B2c deletes it) */
function plainListen(hub, port, host, cb) { return hub.listen(port, host, cb); }

/** Wire the decided form into the hub: `hub.listen(PORT, HOST, cb)` in server.js stays the one boot call; in the PIPED form
 *  it joins the link and runs the same callback. → { bound(), form, pushCertificate(pem | null) } — the PIPED form pushes the
 *  hub's live certificate (src/server/tls.js plans and renews it, starting children; the interface starts none) over the
 *  link as {op:'certificate', cert, key}; one that comes before the join waits for it. The PLAIN form serves its own. */
function wire(decision, { hub, server, join = null, end = endSelf, log = console, rejoinMs = REJOIN_MS } = {}) {
  let record = { form: decision.form, listened: false }, party = null, pendingPem, lastPem;
  const listenOwn = hub.listen;
  // THE PORT IS DECIDED ONCE (主开发 r1124 4): server.js makes ONE boot call; a second call is refused by name and does nothing
  // (in the piped form it would join again with no start value left; in the plain form listen on the port twice)
  let listenCalls = 0;
  const firstListen = () => { if (++listenCalls === 1) return true; try { log.error?.(`[hub-port] listen called again (call ${listenCalls}) — refused: this hub's port is decided once, at its one boot call`); } catch { } return false; };
  const push = (pem) => { try { party.mux.control(pem ? { op: 'certificate', cert: String(pem.cert), key: String(pem.key) } : { op: 'certificate' }); } catch { } };
  if (decision.form === 'plain') {
    hub.listen = (port, host, cb) => { if (!firstListen()) return hub; record = { form: 'plain', listened: true, port: Number(port) }; return plainListen({ listen: (...a) => listenOwn.apply(hub, a) }, port, host, () => { try { log.log?.(`[hub-port] ${JSON.stringify(record)}`); } catch { } cb && cb(); }); };
  } else {
    hub.listen = (port, host, cb) => {   // PIPED: the port is the interface's — this hub never listens on it
      if (!firstListen()) return hub;
      if (!decision.start) { if (!decision.ended) { badStart = true; try { log.error?.(`[hub-port] ${whyText(decision)} — this hub cannot join and ends`); } catch { } end(); } return hub; }   // each bad start BY NAME (never the line), once
      // the start value is held only until its digest is made: every join proves with the digest (src/link-proof.js), and
      // a re-join holds nothing more — the start value is on no link and, from here, in no structure of this module
      const { digestOf } = require('../link-proof.js'), joinOf = join || require('./interface-party.js').join;   // piped only (r1341 6): the digest every join proves with, the join
      const start = { party: decision.start.party || 'hub', link: decision.start.link, digest: digestOf(decision.start.secret) };
      decision.start = { party: start.party, link: start.link };
      const onDead = () => {   // the interface's link ended: every channel with it; this hub waits for a NEW interface (r1060)
        party = null;
        try { log.error?.(`[hub-port] the interface's link ended — this hub waits up to ${rejoinMs / 1000} s for a new interface (never its own listener)`); } catch { }
        const until = monoNow() + rejoinMs; let step = REJOIN_FIRST_MS, tries = 0;
        const attempt = () => {
          tries++;
          const answerMs = Math.max(REJOIN_TRY_FLOOR_MS, Math.min(require('./interface-party.js').JOIN_ANSWER_MS, until - monoNow()));   // what is left of the bound, never under the floor
          joinOf({ start, server, onDead, answerMs }).then((p) => {
            party = p;
            try { log.log?.(`[hub-port] a new interface took this hub (try ${tries}) — it goes on: the same process, its vault and conversations kept`); } catch { }
            if (lastPem !== undefined) push(lastPem);   // the new interface has no certificate until this hub pushes it again
          }, (e) => {
            if (e && /auth-fail/.test(e.message)) { try { log.error?.(`[hub-port] the new interface refused this hub (${e.message}) — it ends`); } catch { } end(); return; }   // not this generation: it never tries again
            if (monoNow() + step > until) { try { log.error?.(`[hub-port] no interface took this hub within ${rejoinMs / 1000} s — this hub ends (never its own listener)`); } catch { } end(); return; }
            setTimeout(attempt, step); step = Math.min(step * 2, REJOIN_STEP_MAX_MS);
          });
        };
        setTimeout(attempt, REJOIN_FIRST_MS);
      };
      joinOf({ start, server, onDead })
        .then((p) => { party = p; record = { form: 'piped', listened: false, link: start.link }; try { log.log?.(`[hub-port] ${JSON.stringify(record)}`); } catch { } if (pendingPem !== undefined) push(pendingPem); cb && cb(); },
          (e) => { try { log.error?.(e && e.code === 'no-answer' ? `[hub-port] ${e.message} — this hub ends` : `[hub-port] the interface refused this hub (${(e && e.message) || 'refused'}) — it ends`); } catch { } end(); });
      return hub;
    };
  }
  const pushCertificate = (pem) => { if (decision.form !== 'piped') return; lastPem = pem || null; if (party) push(pem); else pendingPem = pem || null; };
  wired = { form: decision.form, bound: () => ({ ...record }), pushCertificate };
  if (earlyPem !== undefined) { const pem = earlyPem; earlyPem = undefined; pushCertificate(pem); }   // the pair tls.js served before this wiring
  return wired;
}

module.exports = { claim, decide, endBadStart, exitStatus, EXIT_BAD_START, certificate, wire, plainListen, REJOIN_MS, REJOIN_TRY_FLOOR_MS };

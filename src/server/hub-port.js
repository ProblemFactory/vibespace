'use strict';
// THE HUB'S PORT — THE START DECIDES, AND ONLY THE START (the separation, M1 — lane B, piece B2b; 主开发 2026-11-17 21:43Z).
//   PIPED — started by the supervisor with a start pipe it NAMES (VIBESPACE_START_FD, src/interface/start-pipe.js; lane
//           readings' contract v1 §2: the first line {op:'start', party:'hub', secret, link}): the hub JOINS the
//           interface's link as ONE party (./interface-party.js) and NEVER listens on the port — the interface holds it.
//   PLAIN — started without the word: the hub listens on the port as today and NEVER joins a link. No descriptor is
//           looked at or read (主开发 00:02Z, law 1 AMENDED: in a hub nobody passed anything to, descriptor 3 is the
//           runtime's own — its event poll, its ring, its own pipes — and a parent may leave one there).
// The word is part of the START (no setting, nothing stores it, no door edits it). No fallback from one form to the other
// at run time: a piped hub whose link dies does not open its own listener — it ends (the supervisor starts the next one).
// WITH THE WORD, EVERY BAD START ENDS BY NAME IN BOUNDED TIME: one log line saying which, then the end — the word names
// no descriptor / it is not open / no pipe or socket / no line inside START_LINE_MS / the pipe ended first / the first
// line is no start / the interface never answers the join (interface-party.js JOIN_ANSWER_MS).
// THE PLAIN FORM IS A DEBT WITH A COUNT (主开发's law 3): the hub's own listener is ONE named seam, `plainListen` below. One
// assert ties it to the boot helper's census of suites that start server.js directly (test-architecture §57c); at its floor
// it goes red «delete the listener now, B2c», and B2c deletes this seam in one commit with the helper's last batch.
// THE START PIPE'S SECRET travels only on the start pipe and in memory: never argv, the environment, a log line or an error text.
// What the hub bound is ITS OWN RECORD (`bound()`), said once at boot: { form, listened, port | link } — never the secret.
const { takeWord, openStart, firstLine, whyText } = require('../interface/start-pipe.js');

let claimed = null;   // the boot's start word, TAKEN at server.js line 5 (claim)
/** THE hub's own end: its normal SIGTERM shutdown (the stores flushed) — ONE site for every end this module makes (§85's row) */
const endSelf = () => process.kill(process.pid, 'SIGTERM');
/** server.js line 5, before any require that can start a child: the start word leaves the environment (law 2 — the boot's
 *  first children, `which dtach` and the CLI probes, run long before decide()) → the taken word, which decide() reads */
function claim({ env = process.env } = {}) { if (!claimed) claimed = takeWord(env); return claimed; }

/** → Promise<{ form: 'plain' } | { form: 'piped', start, pipe } | { form: 'piped', start: null, why }> — the start the
 *  environment names (`env` loses the word: it goes no further); `pipe` = a suite's stream handed in AS the start pipe;
 *  `ms` the start line's bound (START_LINE_MS) */
function decide({ env = process.env, pipe = null, ms } = {}) {
  const taken = env === process.env ? claimed : null;   // the boot's word, taken at line 5; a suite's own env is read here
  return (pipe ? firstLine(pipe, { ms }) : openStart({ env, taken, ms })).then((s) => {
    if (s.word === false) return { form: 'plain' };
    if (s.pipe) { s.pipe.on('error', () => { }); try { s.pipe.resume(); } catch { } }   // ONE line is the hub's start: what follows is drained, never read
    if (s.why) return { form: 'piped', start: null, why: s.why, fd: s.fd, raw: s.raw, ms: s.ms };
    const m = s.first;
    if (m && m.op === 'start' && m.party === 'hub' && typeof m.secret === 'string' && typeof m.link === 'string') return { form: 'piped', start: { party: 'hub', secret: m.secret, link: m.link }, pipe: s.pipe };
    return { form: 'piped', start: null, why: 'no-start', pipe: s.pipe };   // a first line that is no start: piped, it cannot join (it ends)
  });
}

/** A BAD START ENDS AT ONCE, by name (law 3): server.js runs this on decide()'s answer (line 109), so the line and the end
 *  come as soon as the start is judged — not after the boot's restore probes (up to 25 s) let the boot call listen. wire()
 *  then says nothing more of it. → whether it ended the hub */
function endBadStart(decision, { end = endSelf, log = console } = {}) {
  if (!decision || decision.form !== 'piped' || decision.start || decision.ended) return false;
  decision.ended = true;
  try { log.error?.(`[hub-port] ${whyText(decision)} — this hub cannot join and ends`); } catch { }
  end();
  return true;
}

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
      if (!decision.start) { if (!decision.ended) { try { log.error?.(`[hub-port] ${whyText(decision)} — this hub cannot join and ends`); } catch { } end(); } return hub; }   // each bad start BY NAME (never the line), once
      join({ start: decision.start, server, onDead: () => { try { log.error?.('[hub-port] the interface\'s link ended — this hub ends (never its own listener)'); } catch { } end(); } })
        .then((p) => { party = p; record = { form: 'piped', listened: false, link: decision.start.link }; try { log.log?.(`[hub-port] ${JSON.stringify(record)}`); } catch { } if (pendingPem !== undefined) push(pendingPem); cb && cb(); },
          (e) => { try { log.error?.(e && e.code === 'no-answer' ? `[hub-port] ${e.message} — this hub ends` : `[hub-port] the interface refused this hub (${(e && e.message) || 'refused'}) — it ends`); } catch { } end(); });
      return hub;
    };
  }
  const pushCertificate = (pem) => { if (decision.form !== 'piped') return; if (party) push(pem); else pendingPem = pem || null; };
  return { form: decision.form, bound: () => ({ ...record }), pushCertificate };
}

module.exports = { claim, decide, endBadStart, wire, plainListen };

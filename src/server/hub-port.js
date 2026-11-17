'use strict';
// THE HUB'S PORT — THE START DECIDES, AND ONLY THE START (the separation, M1 — lane B, piece B2b; 主开发 2026-11-17 21:43Z).
//   PIPED — started by the supervisor with its start pipe on fd 3 (lane readings' contract v1 §2: the first line
//           {op:'start', party:'hub', secret, link}): the hub JOINS the interface's link as ONE party
//           (./interface-party.js) and NEVER listens on the port — the interface holds it.
//   PLAIN — started without a start pipe: the hub listens on the port as today and NEVER joins a link.
// No setting, no environment word, no fallback from one form to the other at run time: a piped hub whose link dies does
// not open its own listener — it ends (the supervisor starts the next one).
// THE PLAIN FORM IS A DEBT WITH A COUNT (主开发's law 3): the hub's own listener is ONE named seam, `plainListen` below. One
// assert ties it to the boot helper's census of suites that start server.js directly (test-architecture §57c); at its floor
// it goes red «delete the listener now, B2c», and B2c deletes this seam in one commit with the helper's last batch.
// THE START PIPE'S SECRET travels only on fd 3 and in memory: never argv, the environment, a log line or an error text.
// What the hub bound is ITS OWN RECORD (`bound()`), said once at boot: { form, listened, port | link } — never the secret.
const fs = require('fs');
const net = require('net');

/** → Promise<{ form: 'piped', start } | { form: 'plain' }> — fd 3 open as a pipe or socket ⇒ the first line read from it.
 *  Node's OWN IPC channel is never a start pipe: a hub forked with an 'ipc' stdio has it on fd 3, and Node names that fd in
 *  NODE_CHANNEL_FD (Node's own marker, not a setting of ours). Any other fd 3 that is a pipe or a socket was passed on
 *  purpose — child processes inherit only the stdio they are given. */
function decide({ fd = 3, pipe = null, env = process.env } = {}) {
  if (pipe) return readStart(pipe);
  if (String(env.NODE_CHANNEL_FD) === String(fd)) return Promise.resolve({ form: 'plain' });
  return new Promise((resolve) => {
    fs.fstat(fd, (err, st) => {
      if (err || !(st.isFIFO() || st.isSocket())) return resolve({ form: 'plain' });
      resolve(readStart(new net.Socket({ fd, readable: true, writable: false })));
    });
  });
}
function readStart(input) {
  return new Promise((resolve) => {
    let buf = '';
    const done = (v) => { input.removeListener('data', onData); resolve(v); };
    const onData = (chunk) => {
      buf += chunk; const i = buf.indexOf('\n'); if (i < 0) return;
      let m = null; try { m = JSON.parse(buf.slice(0, i)); } catch { }   // never echoed: the line carries the secret
      if (m && m.op === 'start' && m.party === 'hub' && typeof m.secret === 'string' && typeof m.link === 'string') done({ form: 'piped', start: { party: 'hub', secret: m.secret, link: m.link }, pipe: input });
      else done({ form: 'piped', start: null, pipe: input });   // a pipe whose first line is no start: piped, and it cannot join (it ends)
    };
    input.setEncoding?.('utf8'); input.on('data', onData);
    input.on('end', () => done({ form: 'piped', start: null, pipe: input }));
  });
}

/** the ONE seam of the plain form: the hub's own listener (B2c deletes it) */
function plainListen(hub, port, host, cb) { return hub.listen(port, host, cb); }

/** Wire the decided form into the hub: `hub.listen(PORT, HOST, cb)` in server.js stays the one boot call; in the PIPED form
 *  it joins the link and runs the same callback. → { bound(), form, pushCertificate(pem | null) } — the PIPED form pushes the
 *  hub's live certificate (src/server/tls.js plans and renews it, starting children; the interface starts none) over the
 *  link as {op:'certificate', cert, key}; one that comes before the join waits for it. The PLAIN form serves its own. */
function wire(decision, { hub, server, join = require('./interface-party.js').join, end = () => process.kill(process.pid, 'SIGTERM'), log = console } = {}) {
  let record = { form: decision.form, listened: false }, party = null, pendingPem;
  const listenOwn = hub.listen;
  const push = (pem) => { try { party.mux.control(pem ? { op: 'certificate', cert: String(pem.cert), key: String(pem.key) } : { op: 'certificate' }); } catch { } };
  if (decision.form === 'plain') {
    hub.listen = (port, host, cb) => { record = { form: 'plain', listened: true, port: Number(port) }; return plainListen({ listen: (...a) => listenOwn.apply(hub, a) }, port, host, () => { try { log.log?.(`[hub-port] ${JSON.stringify(record)}`); } catch { } cb && cb(); }); };
  } else {
    hub.listen = (port, host, cb) => {   // PIPED: the port is the interface's — this hub never listens on it
      if (!decision.start) { try { log.error?.('[hub-port] started with a start pipe whose first line is no start — this hub cannot join and ends'); } catch { } end(); return hub; }
      join({ start: decision.start, server, onDead: () => { try { log.error?.('[hub-port] the interface\'s link ended — this hub ends (never its own listener)'); } catch { } end(); } })
        .then((p) => { party = p; record = { form: 'piped', listened: false, link: decision.start.link }; try { log.log?.(`[hub-port] ${JSON.stringify(record)}`); } catch { } if (pendingPem !== undefined) push(pendingPem); cb && cb(); },
          (e) => { try { log.error?.(`[hub-port] the interface refused this hub (${(e && e.message) || 'refused'}) — it ends`); } catch { } end(); });
      return hub;
    };
  }
  const pushCertificate = (pem) => { if (decision.form !== 'piped') return; if (party) push(pem); else pendingPem = pem || null; };
  return { form: decision.form, bound: () => ({ ...record }), pushCertificate };
}

module.exports = { decide, wire, plainListen };

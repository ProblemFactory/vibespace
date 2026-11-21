'use strict';
/**
 * THE REVERSE TUNNEL'S OWN DOOR (lane lg-remote-hardening, B-7f0b — design q-042 D8b; the owner approved D8 2026-10-19).
 *
 * A remote conversation's tools reach this hub BACK through a tunnel: a dialed device's `tcp-listen` (src/spawn/dial.js),
 * an ssh `-R` (src/spawn/ssh.js, src/server/boot-restore.js). Its hub end used to be the WHOLE http server on loopback:
 * the login page, /otel (which trusts loopback), /hook and every page route. A hostile device was then a local caller of
 * all of it, its login guesses one 127.0.0.1 bucket.
 *
 * Now the tunnel ends at THIS listener on 127.0.0.1:<its own port>. It serves only what a remote session's tools call:
 *   /api/agent/…        every vibespace-* tool (data/bin), the hook, the statusline, the plugin shims;
 *   /api/editor/open    the Ctrl+G `code` helper (src/server/agent-tool-generators.js).
 * Everything else answers 404 (`not_on_the_agent_door`), and so does a path carrying a dot segment, a doubled slash, a
 * backslash, an encoded dot or backslash, or an encoded slash that decodes into a dot segment or a doubled slash (one
 * that does not is a name's own — a job name — and moves no route).
 * No upgrade listener is added, so a websocket asks like any request and is answered as one, never upgraded.
 * test-agent-door's census holds this list against every path the shipped tools name, and every tunnel end in the tree.
 * THE PORT IS KEPT (unit 6's cure): a remote ssh session survives a hub restart with its `-R` fixed in its argv, so the
 * door listens again on the port it had (data/agent-door.json, 0600 — as tailnet-door keeps its own). The port is chosen
 * OUTSIDE the default ephemeral ranges of Linux, macOS and Windows (20000–32767, never the hub's own; a box whose range
 * was widened over it is not covered), so no outgoing connection of this box can
 * hold it while the hub restarts. A kept port that is taken gets a new one, said once: a session started before the
 * restart reaches its tools again when it restarts.
 * `tunnelPort(fallback)` = this door's port once it listens. Until then (or if it could not listen) it is the hub's own
 * port, as before, said once in the journal: a remote session keeps its tools.
 */
const http = require('http');
const fsp = require('fs').promises;
const PD = require('../path-dot-segment.js'); // r1317: a path with a dot segment is never a door — the auth layer's and the push mount's door's verdict

const AGENT_PREFIX = '/api/agent/';
// unit 6's cure: /api/home is no tunnel road (the `vibespace` CLI asks the hub on its OWN box, by the local index's port),
// and the bare /api/agent is a person's route (cookie-gated) — neither crosses
const EXACT = new Set(['/api/editor/open']);
/** PURE: may this request path cross the agent door? (the query is not part of the judgement) */
function allowed(url) {
  const raw = String(url == null ? '' : url);
  const p = raw.split('?')[0];
  if (!p.startsWith('/') || /\\|%2e|%5c|\/\//i.test(p) || PD.dotSegment(p)) return false; // a dot segment, raw or once decoded: the shared verdict
  let dec; try { dec = decodeURIComponent(p); } catch { return false; }
  if (/\/\//.test(dec)) return false; // an encoded slash that makes a doubled slash
  if (EXACT.has(p)) return true;
  return p.startsWith(AGENT_PREFIX); // after the literal prefix an encoded slash is a name's own (a job name): it moves no route
}
/** the door's ports: outside Linux's (32768–60999), macOS' and Windows' (49152–65535) ephemeral ranges */
const PORT_LO = 20000, PORT_HI = 32767;
const inRange = (n, avoid) => Number.isInteger(n) && n >= PORT_LO && n <= PORT_HI && n !== Number(avoid);
/** the kept port (0 = none yet, a file that says no port, or one out of the range / the hub's own) */
async function keptPort(stateFile, avoid) {
  if (!stateFile) return 0;
  try { const j = JSON.parse(await fsp.readFile(stateFile, 'utf8')); const n = Number(j && j.port); return inRange(n, avoid) ? n : 0; } catch { return 0; }
}
async function keepPort(stateFile, port, log) {
  if (!stateFile) return;
  const tmp = `${stateFile}.${process.pid}.tmp`;
  try { await fsp.writeFile(tmp, JSON.stringify({ port }) + '\n', { mode: 0o600 }); await fsp.rename(tmp, stateFile); }
  catch (e) { try { await fsp.unlink(tmp); } catch { } log(`[agent-door] its port could not be kept (${(e && e.code) || e}) — a remote session started now loses its tools at the next restart`); }
}

let state = { server: null, port: 0, said: false };
let startP = null;
/** Start the door over the hub's own `app` (an express handler) — once per process, on its kept port when it has one
 *  (`stateFile`), never on `avoid` (the hub's own port). → Promise<port | 0> */
function start({ app, log = (...a) => console.log(...a), stateFile = null, avoid = 0 } = {}) {
  if (state.server) return startP || Promise.resolve(state.port);
  const server = http.createServer((req, res) => {
    if (!allowed(req.url)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'not on the agent door — a remote conversation\'s tunnel reaches only the agent routes', code: 'not_on_the_agent_door' }));
      return;
    }
    app(req, res);
  });
  state.server = server;
  const listen = (port) => new Promise((resolve) => {
    const onErr = (e) => resolve({ err: e });
    server.once('error', onErr);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', onErr); resolve({ port: server.address().port }); });
  });
  startP = (async () => {
    const want = await keptPort(stateFile, avoid);
    let r = want ? await listen(want) : { err: null };
    if (want && !r.port) log(`[agent-door] its kept port ${want} is taken (${(r.err && r.err.code) || r.err}) — a new one; a remote session started before this restart reaches its tools again when it restarts`);
    for (let i = 0; !r.port && i < 24; i++) { const n = PORT_LO + Math.floor(Math.random() * (PORT_HI - PORT_LO + 1)); if (inRange(n, avoid)) r = await listen(n); }
    if (!r.port) { log(`[agent-door] no free port in ${PORT_LO}–${PORT_HI} — one the system picks (an outgoing connection could hold it across a restart)`); r = await listen(0); }
    if (!r.port) { log(`[agent-door] could not listen (${(r.err && r.err.code) || r.err}) — remote tunnels end at the hub's own port, as before`); state.port = 0; return 0; }
    try { server.unref(); } catch { }
    server.on('error', (e) => log(`[agent-door] ${(e && e.code) || e} — the door keeps listening`)); // an accept error (EMFILE) is said, never an uncaught exit
    state.port = r.port;
    if (r.port !== want) await keepPort(stateFile, r.port, log);
    log(`[agent-door] remote conversations' tunnels end at 127.0.0.1:${state.port} (agent routes only${r.port === want ? ', its kept port' : ''})`);
    return state.port;
  })();
  return startP;
}
/** resolves once the door has its port (at once when it was never started): a re-adopted session waits for it */
function ready() { return startP || Promise.resolve(state.port); }
/** The port a reverse tunnel connects to: the agent door's, else (not listening) the hub's own. */
function tunnelPort(fallback) {
  if (state.port) return state.port;
  if (!state.said) { state.said = true; try { console.log('[agent-door] not listening — this tunnel ends at the hub\'s own port'); } catch { } }
  return fallback;
}
function close() { const s = state.server; state = { server: null, port: 0, said: false }; startP = null; return new Promise((r) => { if (!s) return r(); try { s.close(() => r()); } catch { r(); } }); }

module.exports = { allowed, start, ready, tunnelPort, close, AGENT_PREFIX, EXACT, PORT_LO, PORT_HI };

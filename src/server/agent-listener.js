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
 * THE RECORD IS HELD WHEN IT CANNOT BE READ (r3333 unit 1 / r3337, lane lg-group-parents, the store-read family): the release read
 * ANY failure of data/agent-door.json as «no port kept» and minted a new port OVER it — every remote conversation lost its agent
 * tools until it restarted. Now its one read goes through the family's helper (src/store-read-hold.js):
 *   · HELD (a read that failed): the door listens on a FRESH port for this run and writes NOTHING (the record is never written
 *     over); the record is read again off the loop; at its read the door ALSO listens on the kept port — ONE http server, its
 *     second listening socket hands each connection to it (the same handler and verdict, the same loopback address, never wider)
 *     — and new tunnels take the kept one. The kept port BUSY at that read: said once by name, the record KEPT as it is, tried
 *     again at the next start (the door stays on the fresh port). A record that names the fresh port: one listener, no error.
 *     The conversations whose ssh -R took the fresh port during the hold (`tunnelPort(PORT, id)`) are named in the lift's journal
 *     line: they lose their tools at the next restart (a cost told apart from a fault); nothing more is built for them — and after a
 *     lift that found the kept port BUSY each later one is named in the journal as it takes this run's port (r3764).
 *   · TORN BYTES: kept aside ONCE, then this run's port is written (as a start over no record writes one).
 */
const http = require('http');
const net = require('net');
const fsp = require('fs').promises;
const SR = require('../store-read.js');
const SRH = require('../store-read-hold.js');   // r3333 unit 1: the family's hold (one read again off the loop, torn bytes kept aside once)
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
/** the kept port of a record that READ (0 = a record that says no port, or one out of the range / the hub's own) */
const portOf = (rec, avoid) => { const n = Number(rec && rec.port); return inRange(n, avoid) ? n : 0; };
const recordValid = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const RECORD = 'agent-door.json';   // the record's base name (the wiring hands its path; the family's notice names it by this — src/lib/held-lists-words.js)
const RECORD_WORDS = `the agent door's record (${RECORD}) could not be read — a remote conversation started now reaches its tools through a port of this run; nothing is written over the record, and it is read again by itself`;
/** the record's ONE read (async, as before) → store-read's answer: data | missing | unreadable | corrupt */
async function readRecord(stateFile) {
  let read;
  try { read = { text: await fsp.readFile(stateFile, 'utf8') }; } catch (error) { read = { error }; }
  return SR.storeAnswer(read, { valid: recordValid });
}
async function keepPort(stateFile, port, log, hold = null, writer = null) {
  if (!stateFile) return;
  if (hold && !hold.writable('the agent door\'s port')) return;   // r3333 unit 1: never over a held record (said once by the helper)
  // B-574d «doors-small-state» (主开发 r4867 / r4874, lane nl-mounts): agent-door.json goes through THE STORE WRITER (src/store-writer.js: its
  // thread writes the temp, SYNCS it, renames it — a power loss never leaves the record torn or empty, which the hold would then keep
  // the next start from reading: a new port, every remote conversation's tools lost at that restart). Written once a start that needs
  // a new port and once a lift — no person presses it; THIS ASYNC ROAD WAITS ON ITS LANDING (durable), the loop never does. A refused
  // landing is SAID — truly: the record is kept in memory and the writer writes it when the storage answers (it retries); a restart
  // before then reads the old record (or none) and takes a new port
  const W = writer || require('../store-writer.js').storeWriter();
  const bytes = JSON.stringify({ port }) + '\n';
  let landed = false, code = null;
  try { W.dirty(stateFile, { name: 'agent-door.write', mode: 0o600, produce: () => bytes }); landed = (await W.durable(stateFile)) === true; } catch (e) { code = (e && e.code) || null; }
  if (!landed) { const why = (typeof W.whyNotDurable === 'function' && W.whyNotDurable(stateFile)) || null; log(`[agent-door] its port is not on disk yet (${code || (why && why.code) || 'the storage did not answer'}) — it is written when the storage answers; a restart before then gives remote conversations a new port (their tools end)`); }
}

const fresh = () => ({ server: null, port: 0, said: false, hold: null, during: null, kept: null, busyKept: 0, log: null, writer: null });
let state = fresh();   // during: the conversations whose tunnel took this run's port while the record was held; kept: the kept port's listener after the lift
let startP = null;
/** listen `srv` on 127.0.0.1:`port` (the door's one address) → { port } | { err } */
const listenOn = (srv, port) => new Promise((resolve) => {
  const onErr = (e) => resolve({ err: e });
  srv.once('error', onErr);
  srv.listen(port, '127.0.0.1', () => { srv.removeListener('error', onErr); resolve({ port: srv.address().port }); });
});
/** THE LIFT (r3337): the held record read again — after this run's port is known */
async function lifted(run, rec, facts, { log, stateFile, avoid }) {
  // r3764: the conversations that take this run's port are named UNTIL the door listens on the kept port — `during` is emptied only
  // then (a tunnel baked while the kept port's listen is answered is counted), and kept while the kept port is BUSY (each later one
  // is named as it takes the port: tunnelPort below)
  const namesOf = () => (run.during ? [...run.during.keys()] : []);
  if (run !== state || !run.server || !run.port) { run.during = null; return; }   // closed, or the door never listened (its tunnels end at the hub's own port)
  const now = run.port, kept = rec ? portOf(rec, avoid) : 0;
  const named = (during) => during.length ? `${during.length} remote conversation(s) took this run's port ${now} while it was held: ${during.join(', ')}` : `no remote conversation took this run's port ${now} while it was held`;
  if (!kept) {   // torn bytes kept aside, the file gone, or a record with no port of the door's: this run's port is kept (as a start over no record keeps one)
    const during = namesOf(); run.during = null;
    await keepPort(stateFile, now, log, null, run.writer);
    log(`[agent-door] its record read again (${facts && facts.setAside ? `torn bytes kept aside as ${facts.setAside}` : 'no port in it'}): this run's port ${now} is kept now — ${named(during)}; they keep their tools at the next restart`);
    return;
  }
  if (kept === now) { const during = namesOf(); run.during = null; log(`[agent-door] its record read again: it names this run's port ${now} — one listener; ${named(during)}`); return; }
  const keptServer = net.createServer((sock) => run.server.emit('connection', sock));   // the SAME http server answers (one handler, one verdict)
  const r = await listenOn(keptServer, kept);
  if (run !== state) { try { keptServer.close(); } catch { } run.during = null; return; }
  const during = namesOf();   // read AFTER the listen answered: a tunnel baked in that window is counted
  if (!r.port) {
    run.busyKept = kept;   // r3764: the door stays on this run's port — every later ssh -R that takes it is named as it does (tunnelPort)
    log(`[agent-door] its record read again: its kept port ${kept} is busy (${(r.err && r.err.code) || r.err}) — the door stays on ${now} for this run; the record is kept as it is (${kept}) and tried again at the next start; the conversations that lived through the restart have tunnels that end at ${kept}, a port another program holds, so their tools reach that program until they restart; ${named(during)}, and every conversation that takes ${now} from now on is named as it does — at the next start that gets ${kept} back they lose their agent tools until they restart`);
    return;
  }
  run.during = null;
  try { keptServer.unref(); } catch { }
  keptServer.on('error', (e) => log(`[agent-door] ${(e && e.code) || e} on its kept port — the door keeps listening`));
  run.kept = { server: keptServer, port: kept };
  log(`[agent-door] its record read again: the door ALSO listens on its kept port ${kept} — a remote conversation started before this run reaches its tools again, and new tunnels end there; ${named(during)}${during.length ? ` — at the next restart they lose their agent tools until they restart (the door listens on ${kept} then)` : ''}`);
}
/** Start the door over the hub's own `app` (an express handler) — once per process, on its kept port when it has one
 *  (`stateFile`), never on `avoid` (the hub's own port). → Promise<port | 0> */
function start({ app, log = (...a) => console.log(...a), stateFile = null, avoid = 0, storeWriter = null } = {}) {
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
  const run = state;   // this start's own state (a close() makes a new one)
  run.log = log;   // r3764: the conversations named as they take the port after a busy lift (tunnelPort)
  Object.assign(run, { writer: storeWriter });   // B-574d: the store writer agent-door.json is written by (a suite's; else the process's)
  const listen = (port) => listenOn(server, port);
  startP = (async () => {
    // r3333 unit 1: the record's one read through the family's helper — HELD when it cannot be read (never «no port kept»)
    const a = stateFile ? await readRecord(stateFile) : { state: 'missing' };
    let held = false;
    if (stateFile && run === state) {
      run.hold = SRH.create({ file: stateFile, valid: recordValid, aside: (mark) => `${stateFile}.corrupt-${mark}`, words: () => RECORD_WORDS, code: 'agent_door_unread', log: (m) => log(`[agent-door] ${m}`),
        onLift: (rec, facts) => { const p = startP; Promise.resolve(p).then(() => lifted(run, rec, facts, { log, stateFile, avoid })).catch((e) => log(`[agent-door] its lift failed: ${(e && e.message) || e}`)); } });
      held = run.hold.start(a) === 'held';
      if (held) run.during = new Map();
    }
    const want = !held && a.state === 'data' ? portOf(a.value, avoid) : 0;
    let r = want ? await listen(want) : { err: null };
    if (want && !r.port) log(`[agent-door] its kept port ${want} is taken (${(r.err && r.err.code) || r.err}) — a new one; a remote session started before this restart reaches its tools again when it restarts`);
    for (let i = 0; !r.port && i < 24; i++) { const n = PORT_LO + Math.floor(Math.random() * (PORT_HI - PORT_LO + 1)); if (inRange(n, avoid)) r = await listen(n); }
    if (!r.port) { log(`[agent-door] no free port in ${PORT_LO}–${PORT_HI} — one the system picks (an outgoing connection could hold it across a restart)`); r = await listen(0); }
    if (!r.port) { log(`[agent-door] could not listen (${(r.err && r.err.code) || r.err}) — remote tunnels end at the hub's own port, as before`); run.port = 0; return 0; }
    try { server.unref(); } catch { }
    server.on('error', (e) => log(`[agent-door] ${(e && e.code) || e} — the door keeps listening`)); // an accept error (EMFILE) is said, never an uncaught exit
    run.port = r.port;
    if (!held && r.port !== want) await keepPort(stateFile, r.port, log, run.hold, run.writer);
    log(held ? `[agent-door] its record could not be read — remote conversations' tunnels end at 127.0.0.1:${run.port} for this run (agent routes only; nothing written over the record — at its read the door also listens on the port it keeps)`
      : `[agent-door] remote conversations' tunnels end at 127.0.0.1:${run.port} (agent routes only${r.port === want ? ', its kept port' : ''})`);
    return run.port;
  })();
  return startP;
}
/** resolves once the door has its port (at once when it was never started): a re-adopted session waits for it */
function ready() { return startP || Promise.resolve(state.port); }
/** The port a reverse tunnel connects to: the agent door's (its kept port once a held record read and it listens there too), else
 *  (not listening) the hub's own. `who` = the conversation whose ssh -R takes it into its argv: named at the lift when it took this
 *  run's port while the record was held (r3337 (4)) — a dialed tunnel asks at each connection and names none */
function tunnelPort(fallback, who) {
  const p = state.kept ? state.kept.port : state.port;
  if (p) {
    if (state.during && who) {
      const id = String(who), isNew = !state.during.has(id);
      state.during.set(id, p);
      if (isNew && state.busyKept && state.log) { try { state.log(`[agent-door] conversation ${id} takes this run's port ${p} (its kept port ${state.busyKept} is busy): at the next start that gets ${state.busyKept} back it loses its agent tools until it restarts`); } catch { } }   // r3764
    }
    return p;
  }
  if (!state.said) { state.said = true; try { console.log('[agent-door] not listening — this tunnel ends at the hub\'s own port'); } catch { } }
  return fallback;
}
function close() {
  const { server: s, kept: k, hold: h } = state; state = fresh(); startP = null;
  if (h) h.stop();
  const shut = (x) => new Promise((r) => { if (!x) return r(); try { x.close(() => r()); } catch { r(); } });
  return Promise.all([shut(s), shut(k && k.server)]).then(() => { });
}

module.exports = { allowed, start, ready, tunnelPort, close, AGENT_PREFIX, EXACT, PORT_LO, PORT_HI };

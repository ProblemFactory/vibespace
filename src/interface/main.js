'use strict';
// THE INTERFACE AS ITS OWN PROCESS (the separation, M1 — lane B, piece B2b; lane readings' contract v1,
// /var/tmp/vibespace-lanes/scf/cs/contract-A.md §2). The supervisor starts it with ONE inherited pipe that it NAMES in the
// child's environment — VIBESPACE_START_FD=<n> (./start-pipe.js; 主开发 00:02Z, law 1 amended) — and writes, in newline JSON:
//   {op:'start', party:'interface', secret, link}   — first: `link` is the unix socket the parties join (this process listens)
//   {op:'admit', party, digest}                     — before that party starts; a later admit for the name REPLACES the
//                                                     earlier, so the previous generation's secret is refused
// END OF FILE on the start pipe = the supervisor is gone: this process closes everything and exits (law 1 of the supervisor).
// THE START PIPE'S VALUES TRAVEL ONLY ON THE START PIPE AND IN MEMORY (主开发 21:43Z): never argv, never the environment, never a log
// line, never an error text — this file prints the party's NAME and the link's path, nothing of a secret or a digest.
// WITHOUT THE WORD it reads NO descriptor and ends by name (exit 2: it runs only under its supervisor). WITH IT, every bad
// start ends by name in bounded time (exit 1): the word names no pipe / no line inside START_LINE_MS / the pipe ended first /
// the first line is no interface start.
// The hub's port: PORT / HOST with the hub's own defaults, `listenAt` — server.js's `process.env.PORT || 3456` and
// `process.env.HOST || '0.0.0.0'` (one owner of the port: the interface, in the piped form, holds the port the hub would).
// THE LAST RESORT: an uncaught error is said once (its name and message — never a start line) and the process exits 1;
// the supervisor starts the next one, and pages reconnect.
// Once it listens it makes no synchronous disk call (scripts/test-interface-process.mjs holds it as a law, with the graph).
const net = require('net');
const fsp = require('fs').promises;
const { create } = require('./index.js');
const { START_WORD, openStart, firstLine, whyText } = require('./start-pipe.js');

/** where the interface listens: the hub's own defaults (server.js lines `const PORT = process.env.PORT || 3456;` and
 *  `const HOST = process.env.HOST || '0.0.0.0';` — scripts/test-interface-process.mjs ⑥ reads both) */
const listenAt = (env = {}) => ({ port: Number(env.PORT || 3456), host: env.HOST || '0.0.0.0' });

/** → { iface, ready: Promise<{ port, link }>, stop() } — `pipe` = a suite's stream handed in AS the start pipe (else the
 *  descriptor VIBESPACE_START_FD names); `exit(code)` ends the process (a suite hands a spy); `startMs` the start line's bound. */
function main({ pipe = null, env = process.env, exit = (c) => process.exit(c), log = console, startMs } = {}) {
  const iface = create();
  let started = null, linkServer = null, stopping = null, buf = '';
  let readyResolve, readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  ready.catch(() => { });
  async function start(line) {
    started = { party: line.party, link: line.link };   // the secret of the interface's own start is not kept: it joins no link
    await fsp.rm(line.link, { force: true });          // a stale socket file of a previous start (before listen: off the loop anyway)
    linkServer = net.createServer((s) => { iface.attachLink(s); });
    await new Promise((res, rej) => { linkServer.once('error', rej); linkServer.listen(line.link, () => { linkServer.removeListener('error', rej); res(); }); });
    linkServer.on('error', (e) => { try { log.error?.(`[interface] the link socket: ${(e && e.code) || 'error'}`); } catch { } });
    const at = listenAt(env), addr = await iface.listen(at.port, at.host);
    try { log.log?.(`[interface] listening on ${addr.address}:${addr.port}; parties join at ${line.link}`); } catch { }
    readyResolve({ port: addr.port, link: line.link });
  }
  function onLine(text) {
    let m; try { m = JSON.parse(text); } catch { return; }   // a line that is not JSON is no instruction
    if (!m || typeof m !== 'object' || m.op === 'start') return;   // the start is the FIRST line only; a later one is no instruction
    else if (m.op === 'admit') iface.admit(m);
  }
  const lines = (chunk) => { buf += chunk; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) onLine(l); } };
  const ends = (why, code) => { try { log.error?.(`[interface] ${why} — it ends`); } catch { } readyReject(new Error(why)); stop(code); };
  (pipe ? firstLine(pipe, { ms: startMs }) : openStart({ env, ms: startMs })).then((s) => {
    if (s.word === false) return ends(`started without ${START_WORD}: it runs only under its supervisor, who names its start pipe`, 2);
    if (s.pipe) s.pipe.on('error', () => { });   // a read error on a pipe we are leaving is no second, unnamed end
    if (s.why) return ends(whyText(s), 1);
    const m = s.first, input = s.pipe;
    if (!(m && m.op === 'start' && m.party === 'interface' && typeof m.link === 'string')) return ends(whyText({ why: 'no-start' }), 1);
    start(m).catch((e) => { const why = `the interface could not start (${(e && e.code) || 'error'})`; try { log.error?.(`[interface] ${why} — it ends`); } catch { } readyReject(new Error(why)); stop(1); });   // said BY NAME (the link socket or the port refused)
    input.on('data', lines);
    input.on('end', () => stop(0));      // END OF FILE: the supervisor is gone
    input.on('error', () => stop(0));
    if (s.rest) lines(s.rest);
    input.resume();
  });
  function stop(code) {
    if (stopping) return stopping;
    stopping = (async () => {
      try { await iface.close(); } catch { }
      try { linkServer && linkServer.close(); } catch { }
      try { started && await fsp.rm(started.link, { force: true }); } catch { }
      exit(code);
    })();
    return stopping;
  }
  return { iface, ready, stop };
}

if (require.main === module) {
  process.on('uncaughtException', (e) => {   // THE LAST RESORT: said once, then exit 1 (never a start line in the words)
    try { console.error(`[interface] uncaught ${(e && e.name) || 'Error'}: ${(e && e.message) || e}`); } catch { }
    process.exit(1);
  });
  main();
}

module.exports = { main, listenAt };

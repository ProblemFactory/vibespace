'use strict';
// THE INTERFACE AS ITS OWN PROCESS (the separation, M1 — lane B, piece B2b; lane readings' contract v1,
// /var/tmp/vibespace-lanes/scf/cs/contract-A.md §2). The supervisor starts it with ONE inherited pipe on fd 3 and writes, in
// newline JSON:
//   {op:'start', party:'interface', secret, link}   — first: `link` is the unix socket the parties join (this process listens)
//   {op:'admit', party, digest}                     — before that party starts; a later admit for the name REPLACES the
//                                                     earlier, so the previous generation's secret is refused
// END OF FILE on fd 3 = the supervisor is gone: this process closes everything and exits (law 1 of the supervisor).
// THE START PIPE'S VALUES TRAVEL ONLY ON FD 3 AND IN MEMORY (主开发 21:43Z): never argv, never the environment, never a log
// line, never an error text — this file prints the party's NAME and the link's path, nothing of a secret or a digest.
// The hub's port: PORT / HOST as today's hub reads them (one owner of the port: the interface, in the piped form).
// THE LAST RESORT: an uncaught error is said once (its name and message — never a start line) and the process exits 1;
// the supervisor starts the next one, and pages reconnect.
// Once it listens it makes no synchronous disk call (scripts/test-interface-process.mjs holds it as a law, with the graph).
const net = require('net');
const fsp = require('fs').promises;
const { create } = require('./index.js');

/** the start pipe: fd 3 as a stream (the supervisor's inherited pipe) */
const fdPipe = (fd = 3) => new net.Socket({ fd, readable: true, writable: false });

/** → { iface, ready: Promise<{ port, link }>, stop() } — `pipe` = the start pipe's readable stream (fd 3 by default);
 *  `exit(code)` ends the process (a suite hands a spy). */
function main({ pipe = null, env = process.env, exit = (c) => process.exit(c), log = console } = {}) {
  const iface = create();
  let started = null, linkServer = null, stopping = null, buf = '';
  let readyResolve, readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  ready.catch(() => { });
  const input = pipe || fdPipe(3);
  async function start(line) {
    started = { party: line.party, link: line.link };   // the secret of the interface's own start is not kept: it joins no link
    await fsp.rm(line.link, { force: true });          // a stale socket file of a previous start (before listen: off the loop anyway)
    linkServer = net.createServer((s) => { iface.attachLink(s); });
    await new Promise((res, rej) => { linkServer.once('error', rej); linkServer.listen(line.link, () => { linkServer.removeListener('error', rej); res(); }); });
    linkServer.on('error', (e) => { try { log.error?.(`[interface] the link socket: ${(e && e.code) || 'error'}`); } catch { } });
    const addr = await iface.listen(Number(env.PORT) || 0, env.HOST || '127.0.0.1');
    try { log.log?.(`[interface] listening on ${addr.address}:${addr.port}; parties join at ${line.link}`); } catch { }
    readyResolve({ port: addr.port, link: line.link });
  }
  function onLine(text) {
    let m; try { m = JSON.parse(text); } catch { return; }   // a line that is not JSON is no instruction
    if (!m || typeof m !== 'object') return;
    if (m.op === 'start' && !started && m.party === 'interface' && typeof m.link === 'string') start(m).catch((e) => { readyReject(new Error(`the interface could not start (${(e && e.code) || 'error'})`)); stop(1); });
    else if (m.op === 'admit') iface.admit(m);
  }
  input.setEncoding?.('utf8');
  input.on('data', (chunk) => { buf += chunk; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) onLine(l); } });
  input.on('end', () => stop(0));      // END OF FILE: the supervisor is gone
  input.on('error', () => stop(0));
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

module.exports = { main };

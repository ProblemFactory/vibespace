'use strict';
// THE INTERFACE AS ITS OWN PROCESS (the separation, M1 — lane B, piece B2b; lane readings' contract v1,
// /var/tmp/vibespace-lanes/scf/cs/contract-A.md §2). The supervisor starts it with ONE inherited pipe that it NAMES in the
// child's environment — VIBESPACE_START_FD=<n> (src/start-pipe.js, the reader the hub shares; 主开发 00:02Z, law 1 amended) — and writes, in newline JSON:
//   {op:'start', party:'interface', secret, link, signin}   — first: `link` is the unix socket the parties join (this process
//                                                     listens); `signin` the sign-in table this process holds (piece B3b-1,
//                                                     the contract's dated line of 2026-11-21): { file, clerk?, password?, generate? }
//   {op:'admit', party, digest}                     — before that party starts; a later admit for the name REPLACES the
//                                                     earlier, so the previous generation's secret is refused
// END OF FILE on the start pipe = the supervisor is gone: this process closes everything and exits (law 1 of the supervisor).
// THE START PIPE'S VALUES TRAVEL ONLY ON THE START PIPE AND IN MEMORY (主开发 21:43Z): never argv, never the environment, never a log
// line, never an error text — this file prints the party's NAME and the link's path, nothing of a secret or a digest.
// WITHOUT THE WORD it reads NO descriptor and ends by name (exit 2: it runs only under its supervisor). WITH IT, every bad
// start ends by name in bounded time (exit 2, the hub's code for a bad start too): the word names no pipe / no line inside START_LINE_MS / the pipe ended first /
// the first line is no interface start.
// The hub's port: PORT / HOST with the hub's own defaults, `listenAt` — server.js's `process.env.PORT || 3456` and
// `process.env.HOST || '0.0.0.0'` (one owner of the port: the interface, in the piped form, holds the port the hub would).
// THE LAST RESORT: an uncaught error is said once (its name and message — never a start line) and the process exits 1;
// the supervisor starts the next one, and pages reconnect.
// THE LINK'S FOLDER IS THIS ACCOUNT'S ALONE (主开发 r1124 2; the contract's dated line): who may listen at the link's path
// is whoever may write its folder, so the interface starts only on a folder this account owns that no other account can
// write (no group or other write bit) — any other is a bad start, said by name (exit 2), before the path is touched.
// THE SIGN-IN TABLE IS NAMED, NEVER GUESSED (piece B3b-1, 主开发 r1060 + r1517 (A)): `signin.file` is REQUIRED — an absolute path
// whose folder is this account's alone (the link's rule: whoever may write the folder may put another table in its place); a start
// line without it, or with a relative path or a foreign folder, is a bad start by name (exit 2): an interface with no table would
// stamp no login and its hub would refuse every page. A missing FILE is a new instance (sign-in off), as in the plain form; a file
// that cannot be read HOLDS the instance (B-dc3f). `clerk` = { publishableKey, allowedEmails } — no secret, and no environment is
// read for it; `password` (the supervisor's VIBESPACE_PASSWORD) and `generate` (a container's first start) are the plain form's
// boot resolution (src/auth.js ensurePassword), held in memory only until the table is resolved. A generated password is said
// ONCE in this process's journal, as the plain form's hub says it — the one start value a log line ever holds.
// The table is loaded and resolved BEFORE the port is listened on: no head meets an unloaded table.
// Once it listens it makes no synchronous disk call (scripts/test-interface-process.mjs holds it as a law, with the graph).
const net = require('net');
const path = require('path');
const fsp = require('fs').promises;
const { create } = require('./index.js');
const signinTable = require('./signin.js');
const { START_WORD, openStart, firstLine, whyText } = require('../start-pipe.js');

/** where the interface listens: the hub's own defaults (server.js lines `const PORT = process.env.PORT || 3456;` and
 *  `const HOST = process.env.HOST || '0.0.0.0';` — scripts/test-interface-process.mjs ⑥ reads both) */
const listenAt = (env = {}) => ({ port: Number(env.PORT || 3456), host: env.HOST || '0.0.0.0' });

/** a folder judged → null (this account's alone) | the words of why not. `what` names it; `uid` = this process's account. */
async function ownFolderWhy(dir, what, uid = typeof process.getuid === 'function' ? process.getuid() : null) {
  let st; try { st = await fsp.stat(dir); } catch (e) { return `${what} ${dir} cannot be read (${(e && e.code) || 'error'})`; }
  if (!st.isDirectory()) return `${what} ${dir} is no folder`;
  if (uid !== null && st.uid !== uid) return `${what} ${dir} belongs to another account (uid ${st.uid}) — it must be this account's alone`;
  if (st.mode & 0o022) return `${what} ${dir} can be written by other accounts (mode ${(st.mode & 0o7777).toString(8)}) — it must be this account's alone`;
  return null;
}
/** the link's folder judged → null (this account's alone) | the words of why not. `uid` = this process's account. */
const linkFolderWhy = (link, uid) => ownFolderWhy(path.dirname(path.resolve(link)), "the link's folder", uid);
/** the start line's sign-in table judged → null | the words of why it is no start (piece B3b-1) */
async function signinWhy(signin, uid) {
  if (!signin || typeof signin !== 'object' || Array.isArray(signin)) return 'the start line names no sign-in table (signin.file) — the interface holds the table and never guesses its path';
  if (typeof signin.file !== 'string' || !signin.file) return 'the start line names no sign-in table (signin.file) — the interface holds the table and never guesses its path';
  if (!path.isAbsolute(signin.file)) return `the sign-in table's path is not absolute (${JSON.stringify(signin.file.slice(0, 120))})`;
  const c = signin.clerk;
  if (c != null && (typeof c !== 'object' || Array.isArray(c) || typeof c.publishableKey !== 'string' || !(c.allowedEmails == null || typeof c.allowedEmails === 'string' || Array.isArray(c.allowedEmails)))) return 'the start line\'s single sign-on settings are not { publishableKey, allowedEmails }';
  return ownFolderWhy(path.dirname(signin.file), "the sign-in table's folder", uid);
}

/** → { iface, ready: Promise<{ port, link }>, stop() } — `pipe` = a suite's stream handed in AS the start pipe (else the
 *  descriptor VIBESPACE_START_FD names); `exit(code)` ends the process (a suite hands a spy); `startMs` the start line's bound. */
function main({ pipe = null, env = process.env, exit = (c) => process.exit(c), log = console, startMs } = {}) {
  const iface = create({ log });
  let started = null, linkServer = null, stopping = null, buf = '';
  let readyResolve, readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  ready.catch(() => { });
  async function start(line) {
    const folder = await linkFolderWhy(line.link);   // BEFORE the path is touched: another account's folder is never written in
    if (folder) { const e = new Error(folder); e.badStart = true; throw e; }
    const table = await signinWhy(line.signin);       // the sign-in table is named, never guessed (piece B3b-1)
    if (table) { const e = new Error(table); e.badStart = true; throw e; }
    const t = signinTable.create({ file: line.signin.file, clerk: line.signin.clerk || null, log });
    await t.load();
    const { generated } = await t.ensure({ password: typeof line.signin.password === 'string' ? line.signin.password : '', generate: line.signin.generate === true });
    line.signin = { file: line.signin.file };   // the boot's password is not kept past its resolution
    if (generated) { try { log.log?.(`[interface] Generated workspace password: ${generated} (persisted in the sign-in table — the supervisor's VIBESPACE_PASSWORD chooses your own)`); } catch { } }
    iface.useSignin(t);
    started = { party: line.party, link: line.link };   // the secret of the interface's own start is not kept: it joins no link
    await fsp.rm(line.link, { force: true });          // a stale socket file of a previous start (before listen: off the loop anyway)
    linkServer = net.createServer((s) => { iface.attachLink(s); });
    await new Promise((res, rej) => { linkServer.once('error', rej); linkServer.listen(line.link, () => { linkServer.removeListener('error', rej); res(); }); });
    linkServer.on('error', (e) => { try { log.error?.(`[interface] the link socket: ${(e && e.code) || 'error'}`); } catch { } });
    const at = listenAt(env), addr = await iface.listen(at.port, at.host);
    try { log.log?.(`[interface] listening on ${addr.address}:${addr.port}; parties join at ${line.link}; the sign-in table ${line.signin.file} (${t.held ? 'HELD' : t.enabled ? 'sign-in on' : 'sign-in off'})`); } catch { }
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
    if (s.why) return ends(whyText(s), 2);
    const m = s.first, input = s.pipe;
    if (!(m && m.op === 'start' && m.party === 'interface' && typeof m.link === 'string')) return ends(whyText({ why: 'no-start' }), 2);   // (its `signin` is judged in start(), by name)
    start(m).catch((e) => { if (e && e.badStart) return ends(e.message, 2); const why = `the interface could not start (${(e && e.code) || 'error'})`; try { log.error?.(`[interface] ${why} — it ends`); } catch { } readyReject(new Error(why)); stop(1); });   // said BY NAME (the link socket or the port refused)
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

module.exports = { main, listenAt, linkFolderWhy, signinWhy };

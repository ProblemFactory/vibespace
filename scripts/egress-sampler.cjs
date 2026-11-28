'use strict';
// B-9dd0 — A SUITE'S SOCKETS, COUNTED BY HOST. Loaded with `--require` in a suite's node ARGV (never NODE_OPTIONS, the fast
// tier's rule). Every connect the suite's process opens past the loopback is appended, one JSON line {host, port, at} each, to
// $VIBESPACE_SUITE_EGRESS_FILE, SYNCHRONOUSLY, so a suite that is killed still leaves its lines. The first line is a SENTINEL:
// the runner reads the file when the suite ends, and a file without it is a red row («the reader did not load»). Any other
// line is a red row naming each host and its count. THE LAW: a suite reaches the loopback or a stand-in of its own, never a
// vendor's host.
// What it sees: net.Socket.prototype.connect — plain TCP, TLS (a TLSSocket is a Socket), http(s) agents and undici's fetch
// (they dial through net / tls). THE JUDGMENT (主开发 r321), `verdict()` below:
//   · an ADDRESS LITERAL is judged as it stands (net never looks a literal up): past the loopback, it is counted;
//   · a NAME with the suite's OWN `lookup` (a stand-in resolver) is judged by what that lookup ANSWERS: an address past the
//     loopback is counted (as name=address; in an `all: true` list ANY entry past the loopback counts, even beside a loopback
//     one — the connect may take either); a lookup that REFUSES the name (an error) let nothing leave the box: not counted;
//   · a NAME without a lookup of the suite's own is judged before any lookup (the box's resolver would ask the network): a name
//     past the loopback is counted, whether it resolves or not.
// The suite's own options object is never changed: the lookup is wrapped on a COPY (one options object reused for many
// connects keeps its own function, and is counted once per connect).
// THE BOX'S OWN ADDRESSES (B-9dd0's remainder, 2026-11-21): an address of one of this box's own interfaces (its LAN or tailnet
// address — a stand-in of the suite's own listening there) never leaves the box: judged as the loopback, literal or answered.
// A NODE CHILD IS READ TOO — ONLY IN A CARRIED ROW (the same remainder; 主开发 r1246's law below, `installChildren()`): every node
// child of the running node is handed a `--require` of a SHIM beside the egress file in its ARGV (never NODE_OPTIONS, never its
// env), and its own children are read the same way, down the tree. A row the census does not name as carried — the rows whose
// product judges command lines, and any new suite — keeps the reader in its OWN process, and counts every child it does not follow.
// What it does NOT watch (the runner's red words say it too): a child that is not the RUNNING node by its binary (Chrome, a
// shell command, a script started by its shebang, another node binary, a stand-in named node), one given its own node flags (a fork's or a Worker's execArgv, the permission model) or
// another reader's file, a bare DNS ask with no socket (dns.lookup / dns.resolve alone), UDP (dgram), and a name ending
// «.localhost» (taken as the loopback).
// A LOST LINE: a host line that cannot be written (a removed folder, a full disk) is said on stderr with LOST_MARK — the runner
// reads that marker as a red row (never a green whose count went missing). A CHILD's lost line is said on the CHILD's stderr: it
// reaches the runner only when the suite passes that stream on.
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const KEY = 'VIBESPACE_SUITE_EGRESS_FILE';
const FILE_OF = Symbol.for('vibespace.egress.file');   // set by a child's shim (installChildren): the suite's file
const FILE = process.env[KEY] || globalThis[FILE_OF] || '';
const LOST_MARK = '[egress-sampler] LOST';
const LOOPBACK = (h) => {
  const s = String(h || '').replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  return !s || s === 'localhost' || s.endsWith('.localhost') || (net.isIPv4(s) && s.startsWith('127.')) || s === '::1' || s === '0:0:0:0:0:0:0:1'
    || s === '0.0.0.0' || s === '::' || /^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s) || /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.test(s);
};
/** THE BOX'S OWN ADDRESSES (its interfaces', read at most once a second): a connect to one never leaves the box. */
let ownAt = 0, ownSet = new Set();
const bare = (h) => String(h || '').replace(/^\[|\]$/g, '').replace(/%.*$/, '').toLowerCase();
function ownAddresses() {
  if (Date.now() - ownAt > 1000) {
    ownAt = Date.now();
    try { ownSet = new Set(Object.values(os.networkInterfaces()).flat().filter(Boolean).map((a) => bare(a.address))); } catch { /* keep the last */ }
  }
  return ownSet;
}
/** PURE given `own`: the loopback, or an address of this box's own (`own`: a Set or list of addresses). */
const LOCAL = (h, own = ownAddresses()) => LOOPBACK(h) || (net.isIP(bare(h)) !== 0 && (own instanceof Set ? own : new Set([...own].map(bare))).has(bare(h)));
/** The options a connect call carries (net hands the method its own normalized [options, cb] array, or the caller's
 *  (options) / (port, host) / (path) forms) → {o (the options object to judge, or null), arr (net's normalized array, when it
 *  was one), port, host}, or null (a unix socket). */
function target(args) {
  let o = args[0], arr = null;
  if (Array.isArray(o)) { arr = o; o = o[0]; }
  if (o && typeof o === 'object') return o.path ? null : { o, arr, host: o.host || 'localhost', port: Number(o.port) || 0 };
  if (typeof o === 'number' || (typeof o === 'string' && /^\d+$/.test(o))) return { o: null, arr: null, host: typeof args[1] === 'string' ? args[1] : 'localhost', port: Number(o) || 0 };
  return null;   // a string path: a unix socket
}
/** THE VERDICT on one connect's target (PURE): 'skip' (the loopback, a unix socket), 'count' (an address literal past the
 *  loopback and the box's own addresses, or a name past it with no lookup of the suite's own), 'lookup' (a name past the loopback with the suite's own
 *  lookup: judged by what it answers — `answered()`). */
function verdict(t, own = ownAddresses()) {
  if (!t || LOCAL(t.host, own)) return 'skip';
  if (net.isIP(String(t.host).replace(/^\[|\]$/g, '')) !== 0) return 'count';
  return t.o && typeof t.o.lookup === 'function' ? 'lookup' : 'count';
}
/** What the suite's own lookup answered (PURE) → the first address past the loopback (counted), or null: a refusal (an error)
 *  or loopback answers only (not counted). */
function answered(err, address, own = ownAddresses()) {
  if (err) return null;
  const list = Array.isArray(address) ? address.map((a) => (a && typeof a === 'object' ? a.address : a)) : [address];
  return list.find((a) => !LOCAL(a, own)) || null;
}
let lost = 0;
const say = (file, host, port) => {
  try { fs.appendFileSync(file, JSON.stringify({ host: String(host).slice(0, 200), port, at: Date.now() }) + '\n'); }
  catch (e) {
    lost++;
    try { process.stderr.write(`${LOST_MARK} a host line could not be written (${(e && e.code) || e}): ${String(host).slice(0, 80)}:${port} — ${lost} lost\n`); } catch { /* stderr gone too: the suite is ending */ }
  }
};
function install(file = FILE) {
  if (!file || net.Socket.prototype.connect.__vsEgress) return false;
  try { fs.appendFileSync(file, JSON.stringify({ sentinel: 'egress-sampler', pid: process.pid }) + '\n'); } catch { return false; }
  const orig = net.Socket.prototype.connect;
  const wrapped = function connect(...args) {
    try {
      const t = target(args), v = verdict(t);
      if (v === 'count') say(file, t.host, t.port);
      else if (v === 'lookup') {
        // the suite's OWN resolver, on a COPY of its options: judge what it answers (a stand-in mapped to the loopback, or a
        // refusal, is no egress)
        const look = t.o.lookup;
        // the copy keeps the caller's PROTOTYPE (主开发 r468: an options object may carry its host, port or lookup by inheritance)
        const copy = Object.assign(Object.create(Object.getPrototypeOf(t.o)), t.o);
        copy.lookup = function lookup(hostname, opts, cb) {
          const done = typeof opts === 'function' ? opts : cb, o2 = typeof opts === 'function' ? {} : opts;
          return look.call(this, hostname, o2, (err, address, family) => {
            try { const a = answered(err, address); if (a) say(file, `${t.host}=${a}`, t.port); } catch { /* never the suite's */ }
            done(err, address, family);
          });
        };
        if (t.arr) t.arr[0] = copy; else args[0] = copy;
      }
    } catch { /* the count never breaks the suite's own connect */ }
    return orig.apply(this, args);
  };
  wrapped.__vsEgress = true;
  net.Socket.prototype.connect = wrapped;
  return true;
}

// ── A NODE CHILD IS READ TOO (B-9dd0's remainder (1), 主开发 r1134) — NEVER where the product judges a command line (r1246) ──
// THE LAW (主开发 r1246, round wl8qjzhxs): THE READER NEVER CHANGES WHAT THE PRODUCT UNDER TEST CAN SEE OF ITS OWN PROCESSES. The
// shim rides in a child's ARGUMENTS, and the product judges processes by their arguments (/proc/<pid>/cmdline and `ps … args`:
// process identity, the writer sweep, discovery, the device agent, the mounts, the browser facts …). So in a CENSUS ROW — a suite
// the tree's own impact scope (ci.mjs affectedSuites) says drives a product file that reads another process's command line
// — the reader stays in the suite's OWN process: a node child is handed no shim, a fork() that names no execArgv is handed the execArgv it would have with no
// reader, and each is COUNTED unread. Outside the census no product code reads a command line, and every child of the running node
// is carried, down the tree. THE LIST IS OF THE ROWS THAT MAY CARRY (scripts/egress-carried-rows.json, the rows the census
// does NOT name — derived; test-egress-census re-derives it and is red when it drifts): a row it does not name, a new suite
// included, reads its children not at all — the safe side. NODE_OPTIONS is no road either: the product reads it (agent-env and jobs drop it, job-model composes it).
// EVERY CHILD THE READER DOES NOT FOLLOW IS COUNTED — an `unread` line in the file, by reason; ci.mjs prints them on the row, green
// or red, and the suite's own process says them on stderr at its exit: 'census' · 'own-flags' (a fork or a Worker that names its own
// execArgv) · 'permission' · 'other-file' (its env names another reader's file) · 'unread-on-purpose' (an empty one) · 'other-node'
// (another node binary, or a stand-in named node) · 'shebang' (a node script started as itself) · 'shell' (a shell command that
// names node) · 'no-shim' (the shim could not be made). A child that is no node at all (git, Chrome, a shell without node) is no
// reader's to follow and is not counted.
const CARRIED_ROWS = (() => { try { return new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'egress-carried-rows.json'), 'utf8')).carried || []); } catch { return new Set(); } })();
const SUITE_PROCESS = !globalThis[FILE_OF];   // loaded by the runner's own argv (never by a child's shim)
const SUITE_NAME = SUITE_PROCESS ? path.basename(String(process.argv[1] || ''), '.mjs') : '';
const CENSUS_ROW = SUITE_PROCESS && !CARRIED_ROWS.has(SUITE_NAME);   // not named as carried ⇒ a census row (the safe side)
let execReal = null;
const realOf = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const isNodeName = (s) => /^node(js)?(\.exe)?$/i.test(path.basename(String(s || '')));
/** WHAT A CHILD'S BINARY IS (remembered per binary, search path and cwd — the round's should: no file checks again at the next
 *  spawn): 'running' (this process's own node, by its REAL path; a bare `node` first on the child's PATH included), 'other-node'
 *  (a node-named binary that is not it: another node, or a STAND-IN — the first gate's two reds were stand-in bin/node scripts
 *  answering `--version` by their first word), 'shebang' (a script whose first line names node), 'other'. */
const kindCache = new Map();
function binKind(f, { envPath = process.env.PATH, cwd = process.cwd() } = {}) {
  const s = String(f || '');
  if (!s) return 'other';
  if (s === process.execPath) return 'running';
  const key = `${s}\0${s.includes('/') ? cwd : envPath}`;
  if (kindCache.has(key)) return kindCache.get(key);
  let p = null;
  if (s.includes('/')) p = path.resolve(String(cwd || process.cwd()), s);
  else for (const d of String(envPath || '').split(':')) { if (!d) continue; const c = path.resolve(String(cwd || process.cwd()), d, s); try { fs.accessSync(c, fs.constants.X_OK); p = c; break; } catch { /* next */ } }
  let k = isNodeName(s) ? 'other-node' : 'other';
  if (p) {
    if (execReal === null) execReal = realOf(process.execPath) || process.execPath;
    if (realOf(p) === execReal) k = 'running';
    else if (k === 'other') { try { const fd = fs.openSync(p, 'r'); try { const b = Buffer.alloc(128); const n = fs.readSync(fd, b, 0, 128, 0); if (/^#![^\n]*\bnode\b/.test(b.subarray(0, n).toString('latin1'))) k = 'shebang'; } finally { fs.closeSync(fd); } } catch { /* unreadable: other */ } }
  }
  if (kindCache.size >= 1024) kindCache.clear();
  kindCache.set(key, k);
  return k;
}
const NODE_BIN = (f, o) => binKind(f, o) === 'running';
const envOfPairs = (pairs, key) => { if (!Array.isArray(pairs)) return undefined; const e = pairs.find((x) => typeof x === 'string' && x.startsWith(key + '=')); return e === undefined ? undefined : e.slice(key.length + 1); };
const envOfObj = (env, key) => (env && Object.prototype.hasOwnProperty.call(env, key) ? String(env[key]) : undefined);
const SHELLS = /^(sh|bash|dash|zsh|ksh|ash)$/;
const NODE_IN_SHELL = /(^|[\s;&|(/])node(js)?(\s|$)/;   // a shell command that names node: the reader cannot follow it
const isReaderArg = (a, shim) => a === __filename || (shim && a === shim) || /\.child\.cjs$/.test(String(a)) || /(^|\/)egress-sampler\.cjs$/.test(String(a));
/** PURE: a node child's argv (`args` = [the binary, ...], as ChildProcess.spawn holds it) → the same argv with `--require <shim>`
 *  right after the binary, or null (already carrying a reader, the permission model, another or an empty egress file, no file). */
function carry(args, { file, shim, envFile, self = __filename } = {}) {
  if (!Array.isArray(args) || !args.length || !file || !shim) return null;
  if (envFile !== undefined && envFile !== file) return null;
  if (args.some((a) => a === self || a === shim || /^--(experimental-)?permission$/.test(String(a)))) return null;
  return [args[0], '--require', shim, ...args.slice(1)];
}
/** PURE: what the reader does with one child → { carry: true } | { unread: <reason> } | {} (no node child: nothing to follow, or one
 *  already carrying a reader). `kind` = binKind's; `args` = its argv with the binary first; `envFile` = what its env names for KEY. */
function childVerdict({ kind, args = [], file, envFile, census = false, self = __filename } = {}) {
  if (kind === 'other-node' || kind === 'shebang') return { unread: kind };
  if (kind !== 'running') {
    const b = path.basename(String(args[0] || ''));
    const i = args.indexOf('-c');
    return SHELLS.test(b) && i > 0 && NODE_IN_SHELL.test(String(args[i + 1] || '')) ? { unread: 'shell' } : {};
  }
  if (args.some((a) => isReaderArg(a) || a === self)) return {};
  if (envFile !== undefined && envFile !== file) return { unread: envFile === '' ? 'unread-on-purpose' : 'other-file' };
  if (args.some((a) => /^--(experimental-)?permission$/.test(String(a)))) return { unread: 'permission' };
  if (census) return { unread: 'census' };
  return { carry: true };
}
/** argv without the reader's own `--require <this file | a shim>` (a census row's fork gets what it would have with no reader) */
function withoutReader(execArgv) {
  const out = [];
  for (let i = 0; i < execArgv.length; i++) {
    const a = String(execArgv[i]);
    if ((a === '--require' || a === '-r') && isReaderArg(execArgv[i + 1])) { i++; continue; }
    if (/^--require=/.test(a) && isReaderArg(a.slice('--require='.length))) continue;
    out.push(execArgv[i]);
  }
  return out;
}
const sayUnread = (file, reason, bin) => {
  try { fs.appendFileSync(file, JSON.stringify({ unread: reason, bin: path.basename(String(bin || '')).slice(0, 80), pid: process.pid }) + '\n'); }
  catch (e) { lost++; try { process.stderr.write(`${LOST_MARK} an unread line could not be written (${(e && e.code) || e}): ${reason}\n`); } catch { /* the suite is ending */ } }
};
/** The shim beside the egress file (made once, 0600, remembered): it names the file and loads this reader. It lives as long as the
 *  file's private folder (a child started after its runner ended would not start: only a leftover can); no env variable is set. */
let shimMade = null;
function shimFor(file) {
  if (shimMade) return shimMade;
  const p = `${file}.child.cjs`;
  try {
    fs.writeFileSync(p, `'use strict';\n// B-9dd0: a node child of a suite, read by the egress reader — it names the suite's file\nglobalThis[Symbol.for('vibespace.egress.file')] = ${JSON.stringify(file)};\nrequire(${JSON.stringify(__filename)});\n`, { flag: 'wx', mode: 0o600 });
  } catch (e) { if (!e || e.code !== 'EEXIST') return null; }
  return (shimMade = p);
}
/** Every child this process spawns is judged once (childVerdict): the async road (spawn / execFile / exec — every one goes through
 *  ChildProcess.prototype.spawn), the sync one (spawnSync / execFileSync), fork() and worker_threads' Worker. */
function installChildren(file = FILE, { census = CENSUS_ROW } = {}) {
  const cp = require('child_process');
  const CP = cp.ChildProcess && cp.ChildProcess.prototype;
  if (!file || !CP || typeof CP.spawn !== 'function' || CP.spawn.__vsEgress) return false;
  let forking = 0;
  const judge = (bin, args, envFile, envPath, cwd) => childVerdict({ kind: binKind(bin, { envPath, cwd }), args, file, envFile, census });
  const origSpawn = CP.spawn;
  const spawnW = function spawn(options) {
    try {
      if (!forking && options) {
        const ef = envOfPairs(options.envPairs, KEY);
        const v = judge(options.file, options.args || [], ef, envOfPairs(options.envPairs, 'PATH'), options.cwd);
        if (v.carry) { const shim = shimFor(file), a = shim && carry(options.args, { file, shim, envFile: ef }); if (a) options = { ...options, args: a }; else sayUnread(file, 'no-shim', options.file); }
        else if (v.unread) sayUnread(file, v.unread, options.file);
      }
    } catch { /* never the suite's spawn */ }
    return origSpawn.call(this, options);
  };
  spawnW.__vsEgress = true;
  CP.spawn = spawnW;
  const origFork = cp.fork;
  cp.fork = function fork(modulePath, args, options) {
    forking++;
    try {
      let a = args, o = options;
      if (a != null && !Array.isArray(a)) { o = a; a = undefined; }
      const named = o && Array.isArray(o.execArgv);
      try {
        if (named && !o.execArgv.some((x) => isReaderArg(x))) sayUnread(file, 'own-flags', 'fork');
        else if (!named && census) { sayUnread(file, 'census', 'fork'); return origFork.call(this, modulePath, a || [], { ...(o || {}), execArgv: withoutReader(process.execArgv) }); }
      } catch { /* never the suite's fork */ }
      return origFork.apply(this, arguments);
    } finally { forking--; }
  };
  for (const name of ['spawnSync', 'execFileSync']) {
    const orig = cp[name];
    cp[name] = function (f, args, options) {
      try {
        const opts = Array.isArray(args) || args == null ? options : args, list = Array.isArray(args) ? args : [];
        const env = (opts && opts.env) || process.env, ef = envOfObj(env, KEY);
        const v = judge(f, [f, ...list], ef, env.PATH, opts && opts.cwd);
        if (v.carry) { const shim = shimFor(file), a = shim && carry([f, ...list], { file, shim, envFile: ef }); if (a) return orig.call(this, f, a.slice(1), opts); sayUnread(file, 'no-shim', f); }
        else if (v.unread) sayUnread(file, v.unread, f);
      } catch { /* never the suite's spawn */ }
      return orig.apply(this, arguments);
    };
  }
  // execSync reaches node's own spawnSync, past both exports above: its shell command is judged here, once
  const origExecSync = cp.execSync;
  cp.execSync = function execSync(command) {
    try { if (NODE_IN_SHELL.test(String(command || ''))) sayUnread(file, 'shell', 'execSync'); } catch { /* never the suite's */ }
    return origExecSync.apply(this, arguments);
  };
  try {
    const wt = require('worker_threads'), W0 = wt.Worker;
    if (typeof W0 === 'function' && !W0.__vsEgress) {
      const W = class Worker extends W0 { constructor(f, o) { try { if (o && Array.isArray(o.execArgv) && !o.execArgv.some((x) => isReaderArg(x))) sayUnread(file, 'own-flags', 'Worker'); } catch { /* never the suite's */ } super(f, o); } };
      W.__vsEgress = true;
      wt.Worker = W;
    }
  } catch { /* no worker_threads */ }
  try { require('module').syncBuiltinESMExports(); } catch { /* an older node: CJS callers only */ }
  return true;
}
/** the suite's own process says, at its exit, every child the reader did not follow (all processes' lines: one count per reason) */
function sayUnreadAtExit(file = FILE) {
  if (!SUITE_PROCESS || !file) return;
  process.on('exit', () => {
    try {
      const by = new Map();
      for (const l of fs.readFileSync(file, 'utf8').split('\n')) { if (!l.includes('"unread"')) continue; try { const r = JSON.parse(l); if (r && r.unread) by.set(r.unread, (by.get(r.unread) || 0) + 1); } catch { /* not ours */ } }
      const n = [...by.values()].reduce((x, y) => x + y, 0);
      if (n) process.stderr.write(`[egress-sampler] ${n} child${n === 1 ? '' : 'ren'} not read by the egress reader (B-9dd0, each named): ${[...by].map(([k, v]) => `${k} ×${v}`).join(', ')}${CENSUS_ROW ? ' — a census row: its product judges command lines, so its children carry no reader' : ''}\n`);
    } catch { /* the file is gone: the runner says it */ }
  });
}

// U2 L1 (主开发 r5567): A THROW OR A REJECTION NOTHING CAUGHT, said by the suite's OWN process the moment it happens — node emits 'exit'
// BEFORE it prints its fatal report, so an exit listener that calls process.exit() would end the run with no trace at all. One line on
// stderr (fd 2, synchronous); scripts/ci.mjs placedVerdict reads it as an uncaught trace. A child carries no copy (SUITE_PROCESS).
function sayUncaught() {
  if (!SUITE_PROCESS) return;
  process.on('uncaughtExceptionMonitor', (e, origin) => { try { fs.writeSync(2, `\n[ci-uncaught] ${origin}: ${String((e && e.message) || e).split('\n')[0].slice(0, 200)}\n`); } catch { /* never the suite's */ } });
}
install();
installChildren();
sayUnreadAtExit();
sayUncaught();
module.exports = { install, installChildren, carry, childVerdict, withoutReader, binKind, NODE_BIN, LOOPBACK, LOCAL, target, verdict, answered, LOST_MARK, CENSUS_ROW, SUITE_NAME };

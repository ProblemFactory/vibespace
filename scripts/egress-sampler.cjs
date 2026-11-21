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
// A NODE CHILD IS READ TOO (the same remainder, `installChildren()` below): every node child the process spawns — a scratch hub
// through startHub, a CLI through execFile / spawnSync — is handed a `--require` of a SHIM beside the egress file in its ARGV
// (never NODE_OPTIONS, never its env); the shim names the file, so a child given a scrubbed env still writes there, and its own
// children are read the same way, down the tree. fork() and Worker threads inherit execArgv, as before.
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

// ── A NODE CHILD IS READ TOO (B-9dd0's remainder (1), 主开发 r1134) ───────────────────────────────────────────────────────
/** THE RUNNING NODE, and only it (the first gate's two reds: a STAND-IN `bin/node` — a shell script that answers `--version` by
 *  its first word — was handed the shim and answered the real node's version): the binary is this process's own node by its
 *  REAL path (an absolute or relative path, or a bare `node` found first on the child's PATH). Another node binary, or a stand-in
 *  named node, is left alone (named). */
let execReal = null;
const realOf = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
function NODE_BIN(f, { envPath = process.env.PATH, cwd = process.cwd() } = {}) {
  const s = String(f || '');
  if (!s) return false;
  if (s === process.execPath) return true;
  if (!/^node(js)?$/.test(path.basename(s))) return false;
  let p = null;
  if (s.includes('/')) p = path.resolve(String(cwd || process.cwd()), s);
  else for (const d of String(envPath || '').split(':')) { if (!d) continue; const c = path.resolve(String(cwd || process.cwd()), d, s); try { fs.accessSync(c, fs.constants.X_OK); p = c; break; } catch { /* next */ } }
  if (!p) return false;
  if (execReal === null) execReal = realOf(process.execPath) || process.execPath;
  return realOf(p) === execReal;
}
const envOfPairs = (pairs, key) => { if (!Array.isArray(pairs)) return undefined; const e = pairs.find((x) => typeof x === 'string' && x.startsWith(key + '=')); return e === undefined ? undefined : e.slice(key.length + 1); };
/** PURE: a node child's argv (`args` = [the binary, ...], as ChildProcess.spawn holds it) → the same argv with `--require <shim>`
 *  right after the binary, or null: LEFT ALONE when it already carries a reader (this file or the shim), runs under the
 *  permission model (`--permission`), or its env names ANOTHER egress file or an EMPTY one (`envFile`: what the child's env
 *  holds for KEY, undefined = nothing) — a runner that reads it itself, or runs it unread on purpose (scripts/ci.mjs's
 *  `egress: false`). */
function carry(args, { file, shim, envFile, self = __filename } = {}) {
  if (!Array.isArray(args) || !args.length || !file || !shim) return null;
  if (envFile !== undefined && envFile !== file) return null;
  if (args.some((a) => a === self || a === shim || /^--(experimental-)?permission$/.test(String(a)))) return null;
  return [args[0], '--require', shim, ...args.slice(1)];
}
const envFileOfPairs = (pairs) => { if (!Array.isArray(pairs)) return undefined; const e = pairs.find((x) => typeof x === 'string' && x.startsWith(KEY + '=')); return e === undefined ? undefined : e.slice(KEY.length + 1); };
const envFileOfObj = (env) => (env && Object.prototype.hasOwnProperty.call(env, KEY) ? String(env[KEY]) : undefined);
/** The shim beside the egress file (made once, 0600): it names the file and loads this reader. It lives as long as the file's
 *  private folder; it sets no variable in the child's env. */
function shimFor(file) {
  const p = `${file}.child.cjs`;
  try {
    fs.writeFileSync(p, `'use strict';\n// B-9dd0: a node child of a suite, read by the egress reader — it names the suite's file\nglobalThis[Symbol.for('vibespace.egress.file')] = ${JSON.stringify(file)};\nrequire(${JSON.stringify(__filename)});\n`, { flag: 'wx', mode: 0o600 });
  } catch (e) { if (!e || e.code !== 'EEXIST') return null; }
  return p;
}
/** Every node child this process spawns is handed the shim in its ARGV: the async road (spawn / execFile / exec's node — every
 *  one goes through ChildProcess.prototype.spawn) and the sync one (spawnSync / execFileSync). fork() is left alone (it inherits
 *  execArgv, or keeps the node flags it names on purpose). */
function installChildren(file = FILE) {
  const cp = require('child_process');
  const CP = cp.ChildProcess && cp.ChildProcess.prototype;
  if (!file || !CP || typeof CP.spawn !== 'function' || CP.spawn.__vsEgress) return false;
  let forking = 0;
  const origSpawn = CP.spawn;
  const spawnW = function spawn(options) {
    try {
      if (!forking && options && NODE_BIN(options.file, { envPath: envOfPairs(options.envPairs, 'PATH'), cwd: options.cwd })) {
        const shim = shimFor(file), a = shim && carry(options.args, { file, shim, envFile: envFileOfPairs(options.envPairs) });
        if (a) options = { ...options, args: a };
      }
    } catch { /* never the suite's spawn */ }
    return origSpawn.call(this, options);
  };
  spawnW.__vsEgress = true;
  CP.spawn = spawnW;
  const origFork = cp.fork;
  cp.fork = function fork(...a) { forking++; try { return origFork.apply(this, a); } finally { forking--; } };
  for (const name of ['spawnSync', 'execFileSync']) {
    const orig = cp[name];
    cp[name] = function (f, args, options) {
      try {
        const opts0 = Array.isArray(args) || args == null ? options : args;
        if (NODE_BIN(f, { envPath: ((opts0 && opts0.env) || process.env).PATH, cwd: opts0 && opts0.cwd })) {
          const list = Array.isArray(args) ? args : [], opts = opts0;
          const shim = shimFor(file), a = shim && carry([f, ...list], { file, shim, envFile: envFileOfObj((opts && opts.env) || process.env) });
          if (a) return orig.call(this, f, a.slice(1), opts);
        }
      } catch { /* never the suite's spawn */ }
      return orig.apply(this, arguments);
    };
  }
  try { require('module').syncBuiltinESMExports(); } catch { /* an older node: CJS callers only */ }
  return true;
}

install();
installChildren();
module.exports = { install, installChildren, carry, NODE_BIN, LOOPBACK, LOCAL, target, verdict, answered, LOST_MARK };

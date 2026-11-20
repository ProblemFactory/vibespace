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
// What it does NOT watch (the runner's red words say it too): a child process started without this argv (a spawned hub, a
// CLI; fork() and Worker threads inherit execArgv and load it, and write to the same file when they inherit the env), a bare
// DNS ask with no socket (dns.lookup / dns.resolve alone), UDP (dgram), and a name ending «.localhost» (taken as the loopback).
// A LOST LINE: a host line that cannot be written (a removed folder, a full disk) is said on stderr with LOST_MARK — the runner
// reads that marker as a red row (never a green whose count went missing).
const fs = require('fs');
const net = require('net');

const FILE = process.env.VIBESPACE_SUITE_EGRESS_FILE;
const LOST_MARK = '[egress-sampler] LOST';
const LOOPBACK = (h) => {
  const s = String(h || '').replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  return !s || s === 'localhost' || s.endsWith('.localhost') || (net.isIPv4(s) && s.startsWith('127.')) || s === '::1' || s === '0:0:0:0:0:0:0:1'
    || s === '0.0.0.0' || s === '::' || /^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s) || /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.test(s);
};
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
 *  loopback, or a name past it with no lookup of the suite's own), 'lookup' (a name past the loopback with the suite's own
 *  lookup: judged by what it answers — `answered()`). */
function verdict(t) {
  if (!t || LOOPBACK(t.host)) return 'skip';
  if (net.isIP(String(t.host).replace(/^\[|\]$/g, '')) !== 0) return 'count';
  return t.o && typeof t.o.lookup === 'function' ? 'lookup' : 'count';
}
/** What the suite's own lookup answered (PURE) → the first address past the loopback (counted), or null: a refusal (an error)
 *  or loopback answers only (not counted). */
function answered(err, address) {
  if (err) return null;
  const list = Array.isArray(address) ? address.map((a) => (a && typeof a === 'object' ? a.address : a)) : [address];
  return list.find((a) => !LOOPBACK(a)) || null;
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
        const copy = { ...t.o, lookup: function lookup(hostname, opts, cb) {
          const done = typeof opts === 'function' ? opts : cb, o2 = typeof opts === 'function' ? {} : opts;
          return look.call(this, hostname, o2, (err, address, family) => {
            try { const a = answered(err, address); if (a) say(file, `${t.host}=${a}`, t.port); } catch { /* never the suite's */ }
            done(err, address, family);
          });
        } };
        if (t.arr) t.arr[0] = copy; else args[0] = copy;
      }
    } catch { /* the count never breaks the suite's own connect */ }
    return orig.apply(this, args);
  };
  wrapped.__vsEgress = true;
  net.Socket.prototype.connect = wrapped;
  return true;
}

install();
module.exports = { install, LOOPBACK, target, verdict, answered, LOST_MARK };

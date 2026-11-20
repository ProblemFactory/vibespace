'use strict';
// B-9dd0 — A SUITE'S SOCKETS, COUNTED BY HOST. Loaded with `--require` in a suite's node ARGV (never NODE_OPTIONS, the fast
// tier's rule). Every connect the suite's process opens past the loopback (or to no unix socket) is appended, one JSON line
// {host, port, at} each, to $VIBESPACE_SUITE_EGRESS_FILE, SYNCHRONOUSLY, so a suite that is killed still leaves its lines. The
// first line is a SENTINEL: the runner reads the file when the suite ends, and a file without it is a red row («the reader
// did not load»). Any other line is a red row naming each host and its count. THE LAW: a suite reaches the loopback or a
// stand-in of its own, never a vendor's host.
// What it sees: net.Socket.prototype.connect — plain TCP, TLS (a TLSSocket is a Socket), http(s) agents and undici's fetch
// (they dial through net / tls). The judgment:
//   · with the suite's OWN `lookup` (a stand-in resolver), it judges the ADDRESS that lookup answers: a loopback answer is not
//     counted, another address is (name=address), and a lookup that FAILS is counted by name (nothing left the box, but the
//     suite asked for a vendor's name);
//   · without one, it judges the NAME asked before any lookup, so a refused or unresolvable host is counted too.
// What it cannot see: dns.lookup alone, UDP, and a child process started without this argv. fork() and Worker threads inherit
// execArgv, so they load it too, and write to the same file when they inherit the env.
const fs = require('fs');
const net = require('net');

const FILE = process.env.VIBESPACE_SUITE_EGRESS_FILE;
const LOOPBACK = (h) => {
  const s = String(h || '').replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  return !s || s === 'localhost' || s.endsWith('.localhost') || /^127\./.test(s) || s === '::1' || s === '0:0:0:0:0:0:0:1' || s === '0.0.0.0' || s === '::'
    || /^::ffff:127\./.test(s) || /^::ffff:7f[0-9a-f]{2}:/.test(s);
};
/** The options a connect call carries (net hands the method its own normalized [options, cb] array, or the caller's
 *  (options) / (port, host) / (path) forms) → {o (the options object to judge, or null), port, host}. */
function target(args) {
  let o = args[0];
  if (Array.isArray(o)) o = o[0];
  if (o && typeof o === 'object') return o.path ? null : { o, host: o.host || 'localhost', port: Number(o.port) || 0 };
  if (typeof o === 'number' || (typeof o === 'string' && /^\d+$/.test(o))) return { o: null, host: typeof args[1] === 'string' ? args[1] : 'localhost', port: Number(o) || 0 };
  return null;   // a string path: a unix socket
}
const say = (file, host, port) => { try { fs.appendFileSync(file, JSON.stringify({ host: String(host).slice(0, 200), port, at: Date.now() }) + '\n'); } catch { /* the runner's missing lines are its own red */ } };
function install(file = FILE) {
  if (!file || net.Socket.prototype.connect.__vsEgress) return false;
  try { fs.appendFileSync(file, JSON.stringify({ sentinel: 'egress-sampler', pid: process.pid }) + '\n'); } catch { return false; }
  const orig = net.Socket.prototype.connect;
  const wrapped = function connect(...args) {
    try {
      const t = target(args);
      // an IP literal is never looked up (net skips the resolver): judged as it stands, a custom lookup or not
      const literal = !!t && net.isIP(String(t.host).replace(/^\[|\]$/g, '')) !== 0;
      if (t && !literal && t.o && typeof t.o.lookup === 'function' && !LOOPBACK(t.host)) {
        // the suite's OWN resolver: judge what it answers (a stand-in mapped to the loopback is no egress)
        const look = t.o.lookup;
        t.o.lookup = function lookup(hostname, opts, cb) {
          const done = typeof opts === 'function' ? opts : cb, o2 = typeof opts === 'function' ? {} : opts;
          return look.call(this, hostname, o2, (err, address, family) => {
            try {
              const list = Array.isArray(address) ? address.map((a) => (a && a.address) || a) : [address];
              if (err) say(file, t.host, t.port);
              else for (const a of list) if (!LOOPBACK(a)) { say(file, `${t.host}=${a}`, t.port); break; }
            } catch { }
            done(err, address, family);
          });
        };
      } else if (t && !LOOPBACK(t.host)) say(file, t.host, t.port);
    } catch { /* the count never breaks the suite's own connect */ }
    return orig.apply(this, args);
  };
  wrapped.__vsEgress = true;
  net.Socket.prototype.connect = wrapped;
  return true;
}

install();
module.exports = { install, LOOPBACK, target };

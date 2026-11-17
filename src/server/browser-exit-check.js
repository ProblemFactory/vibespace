'use strict';
/**
 * THE EXIT CHECK'S ONE REQUEST (lane cli-update-needs-nothing; PURE rules src/browser-exit.js). ORCH. A person's press asks the
 * owner's check address THROUGH the profile's own proxy — the keeper's forwarder on this hub's loopback (src/server/egress-proxy.js,
 * the profile's proxy as its upstream): `CONNECT host:443` to the forwarder, then TLS to the check host VERIFIED AS ITSELF (its name
 * as the servername; the runtime's own trust store), then ONE GET with a fixed short header list (src/browser-exit.js
 * REQUEST_HEADERS — a generic client name, nothing naming the instance, the person, the profile or a version; no cookie, no login).
 * The NAME is resolved by the profile's proxy — never here — so the request leaves by the exit being measured. Off the loop (one
 * socket, events), DEADLINE_MS overall, a redirect never followed (its status is the answer), the body capped at BODY_CAP.
 *
 * WHY NOT src/egress-fence.js fenceFetch: the fence pins the address IT resolved and refuses loopback — this request's name is the
 * proxy's to resolve, and its first hop is the forwarder on loopback. The fence's URL rules apply to the setting itself
 * (checkUrlVerdict: https only, no login, no private literal) and its answer rules here (no redirect, a deadline, a byte cap).
 * Its ONE caller is the keeper's exitCheck (a person's press — never a timer, never a launch).
 */
const net = require('net');
const tls = require('tls');
const https = require('https');
const X = require('../browser-exit.js');

/** → { ok: true, status, contentType, body } | { ok: false, code, error }. `tlsConnect` is the TLS seam (a suite's stand-in). */
function requestThrough({ url, forwarder, deadlineMs = X.DEADLINE_MS, capBytes = X.BODY_CAP, tlsConnect = (o) => tls.connect(o) } = {}) {
  return new Promise((resolve) => {
    let u, fw;
    try { u = new URL(url); fw = new URL(forwarder); } catch { resolve({ ok: false, code: 'exit_check_failed', error: 'no check address or no forwarder' }); return; }
    const host = u.hostname.replace(/^\[|\]$/g, ''), port = Number(u.port) || 443;
    const target = net.isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`;
    let done = false, sock = null, t = null, tunneled = false;
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); for (const s of [t, sock]) { try { if (s) s.destroy(); } catch { /* gone */ } } resolve(r); };
    const secs = () => (deadlineMs >= 1000 ? `${Math.round(deadlineMs / 1000)} s` : `${deadlineMs} ms`);
    const timer = setTimeout(() => finish(tunneled ? { ok: false, code: 'exit_check_timeout', error: `the exit check address did not answer in ${secs()}` } : { ok: false, code: 'exit_proxy_timeout', error: `the profile's proxy did not open the way in ${secs()}` }), deadlineMs);
    sock = net.connect({ host: fw.hostname, port: Number(fw.port) });
    sock.once('error', (e) => finish({ ok: false, code: 'exit_check_failed', detail: String(e.message || '').slice(0, 160), error: `the profile's proxy forwarder failed — ${e.message}` }));
    sock.once('connect', () => sock.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
    sock.once('close', () => { if (!tunneled) finish({ ok: false, code: 'exit_proxy_hung_up', error: 'the profile\'s proxy closed the connection before the way to the check address was open' }); });
    let head = '';
    const onData = (d) => {
      head += d.toString('latin1');
      const i = head.indexOf('\r\n\r\n');
      if (i < 0) { if (head.length > 16384) finish({ ok: false, code: 'exit_check_failed', error: 'the forwarder answered too much before the tunnel' }); return; }
      sock.removeListener('data', onData);   // the TLS layer / the request take the socket in this same turn — nothing is read in between
      const code = Number((/^HTTP\/1\.[01] (\d{3})/.exec(head) || [])[1] || 0);
      if (code !== 200) { const why = head.slice(i + 4).trim(); tunneled = true; finish({ ok: false, code: 'exit_check_refused', detail: `${code || 'no answer'}${why ? ` — ${why.slice(0, 160)}` : ''}`, error: `the profile's proxy did not open the way to the check address (${code || 'no answer'})${why ? ` — ${why.slice(0, 240)}` : ''}` }); return; }   // detail = the proxy's own line (data after the page's sentence)
      tunneled = true;
      const rest = Buffer.from(head.slice(i + 4), 'latin1');
      if (rest.length) sock.unshift(rest);
      try { t = tlsConnect({ socket: sock, host, servername: net.isIP(host) ? undefined : host }); } /* `host`: the identity a literal is checked as (not the forwarder's loopback) */ catch (e) { finish({ ok: false, code: 'exit_check_failed', detail: String(e.message || '').slice(0, 160), error: `TLS to the check address failed — ${e.message}` }); return; }
      t.once('error', (e) => finish({ ok: false, code: 'exit_check_failed', detail: String(e.message || '').slice(0, 160), error: `TLS to the check address failed — ${e.message}` }));
      const req = https.request({ host, port, path: (u.pathname || '/') + (u.search || ''), method: 'GET', headers: { Host: u.host, ...X.REQUEST_HEADERS }, createConnection: () => t });   // NO agent: with one, Node ignores createConnection and looks the name up itself
      req.once('error', (e) => finish({ ok: false, code: 'exit_check_failed', detail: String(e.message || '').slice(0, 160), error: `the exit check request failed — ${e.message}` }));
      req.once('response', (res) => {
        const status = res.statusCode || 0, contentType = String(res.headers['content-type'] || '');
        if (status >= 300 && status < 400) { finish({ ok: true, status, contentType, body: Buffer.alloc(0) }); return; }   // never followed
        const chunks = []; let n = 0;
        res.on('data', (c) => { n += c.length; if (n > capBytes) { finish({ ok: false, code: 'exit_check_too_big', error: `the check address answered more than ${Math.round(capBytes / 1024)} KiB` }); return; } chunks.push(c); });
        res.once('end', () => finish({ ok: true, status, contentType, body: Buffer.concat(chunks) }));
        res.once('error', (e) => finish({ ok: false, code: 'exit_check_failed', detail: String(e.message || '').slice(0, 160), error: `the exit check answer broke off — ${e.message}` }));
      });
      req.end();
    };
    sock.on('data', onData);
  });
}

module.exports = { requestThrough };

'use strict';
/**
 * THE ALLOWLISTING EGRESS PROXY (agent browser P4, design §7.2.1 "make the
 * boundary enforcing rather than observed"). ORCH. A tiny HTTP forward proxy
 * on the hub's loopback: `CONNECT host:port` (TLS passes through untouched —
 * we never terminate it) and plain `GET http://host/…` are admitted ONLY when
 * the PURE `egressVerdict(host, allowlist)` says so; everything else answers
 * `403` with the verdict's own sentence as the body, so a blocked fetch is a
 * named refusal in the browser's network log rather than a hang.
 *
 * Who uses it: the cloakserve container (src/browser-profiles.cloakservePlan
 * points HTTPS_PROXY/HTTP_PROXY at it from an INTERNAL docker network — the
 * container has no other route out of the host), and any profile whose
 * `proxy` field names it. Loopback and link-local targets are refused by the
 * verdict itself — the proxy is never a way back into the hub's services.
 *
 * Not a general proxy: no auth (loopback only, like the stream port, §6.1),
 * no caching, no rewriting, a bounded header read, one upstream per client
 * socket, and a rejected CONNECT closes the socket after the 403.
 */
const http = require('http');
const net = require('net');
const B = require('../browser-profiles.js');

const MAX_HEADER_BYTES = 16 * 1024;

/**
 * @param allow  (host) => {allow, why|rule} — defaults to egressVerdict over `allowlist()`
 * @param allowlist  () => the current allowlist (string | array) — re-read per request so a setting change applies live
 */
function create({ allowlist = () => '', allow = null, log = console, connectTimeoutMs = 10000, resolve = (h) => h } = {}) {
  const verdict = (host) => (allow ? allow(host) : B.egressVerdict(host, allowlist()));
  // `resolve` maps an ADMITTED host to where the upstream connects (identity
  // in production; the gate points an allowlisted name at a loopback target).
  // The verdict is always taken on the name the client asked for.
  const upstreamHost = (h) => { try { return String(resolve(h) || h); } catch { return h; } };
  const stats = { allowed: 0, refused: 0, errors: 0 };
  let server = null;

  function refuse(res, v, host) {
    stats.refused++;
    const body = `egress refused: ${v.why || 'not allowed'}\n`;
    try { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body), Connection: 'close' }); res.end(body); } catch { /* gone */ }
    log.log?.(`[egress] refused ${host}: ${v.why}`);
  }

  function onRequest(req, res) {
    let target;
    try { target = new URL(req.url); } catch { res.writeHead(400, { Connection: 'close' }); res.end('egress proxy: absolute-form request required\n'); return; }
    if (target.protocol !== 'http:') { res.writeHead(400, { Connection: 'close' }); res.end('egress proxy: only http:// absolute-form requests or CONNECT\n'); return; }
    const v = verdict(target.hostname);
    if (!v.allow) return refuse(res, v, target.hostname);
    stats.allowed++;
    const headers = { ...req.headers };
    delete headers['proxy-connection']; delete headers['proxy-authorization'];
    headers.connection = 'close';
    const up = http.request({ host: upstreamHost(target.hostname), port: Number(target.port) || 80, method: req.method, path: target.pathname + target.search, headers, timeout: connectTimeoutMs }, (ur) => {
      res.writeHead(ur.statusCode || 502, { ...ur.headers, connection: 'close' });
      ur.pipe(res);
    });
    up.on('timeout', () => { up.destroy(new Error('upstream timeout')); });
    up.on('error', (e) => { stats.errors++; try { res.writeHead(502, { Connection: 'close' }); res.end(`egress proxy: upstream ${target.hostname} failed — ${e.message}\n`); } catch { /* gone */ } });
    req.pipe(up);
  }

  function onConnect(req, sock, head) {
    const m = /^([^:]+|\[[^\]]+\]):(\d{1,5})$/.exec(String(req.url || ''));
    const host = m ? m[1].replace(/^\[|\]$/g, '') : '';
    const port = m ? Number(m[2]) : 0;
    const v = host ? verdict(host) : { allow: false, why: 'malformed CONNECT target' };
    if (!v.allow || !port) {
      stats.refused++;
      const body = `egress refused: ${v.why}\n`;
      try { sock.write(`HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`); } catch { /* gone */ }
      try { sock.end(); } catch { /* gone */ }
      log.log?.(`[egress] refused CONNECT ${req.url}: ${v.why}`);
      return;
    }
    stats.allowed++;
    const up = net.connect({ host: upstreamHost(host), port });
    let open = false;
    const t = setTimeout(() => { if (!open) { try { up.destroy(new Error('connect timeout')); } catch { /* gone */ } } }, connectTimeoutMs);
    up.once('connect', () => {
      open = true; clearTimeout(t);
      try { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); } catch { /* gone */ }
      if (head && head.length) up.write(head);
      up.pipe(sock); sock.pipe(up);
    });
    up.on('error', (e) => { stats.errors++; clearTimeout(t); try { if (!open) sock.write(`HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\negress proxy: ${e.message}\n`); } catch { /* gone */ } try { sock.destroy(); } catch { /* gone */ } });
    up.on('close', () => { try { sock.end(); } catch { /* gone */ } });
    sock.on('error', () => { try { up.destroy(); } catch { /* gone */ } });
    sock.on('close', () => { try { up.destroy(); } catch { /* gone */ } });
  }

  /** Listen on 127.0.0.1 (port 0 = ephemeral). Returns the port. */
  async function listen({ port = 0 } = {}) {
    if (server) return server.address().port;
    server = http.createServer({ maxHeaderSize: MAX_HEADER_BYTES }, onRequest);
    server.on('connect', onConnect);
    server.on('clientError', (e, sock) => { try { sock.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); } catch { /* gone */ } });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve()); });
    return server.address().port;
  }
  function portOf() { return server ? server.address().port : null; }
  async function close() { if (!server) return; const s = server; server = null; await new Promise((r) => s.close(() => r())); }

  return { listen, close, port: portOf, stats, verdict, url: () => (server ? `http://127.0.0.1:${server.address().port}` : null) };
}

module.exports = { create, MAX_HEADER_BYTES };

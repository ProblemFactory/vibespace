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
 * Who uses it: a local wrapped ENGINE's browser (lane engine-spi-egress: the keeper starts ONE of these per profile, its
 * allowlist = the plugin's reserved row `plugin.<id>.egressAllowlist`, and the browser gets `--proxy-server` pointing here
 * with loopback NOT bypassed), and any profile whose `proxy` field names it. Loopback and link-local targets are refused by the
 * verdict itself — the proxy is never a way back into the hub's services.
 *
 * lane tailnet-names: the hub's TAILNET DOOR (src/server/tailnet-door.js) is one of these too — its `allow` admits names only
 * (r3: a PROMISE — it resolves a name first and vets the answer, naming the address to dial as `to`), its `resolve` maps that
 * address (a suite's seam), and `serve` answers its origin-form requests (the PAC). r5: a refusal may name `answered` — run once
 * its 403 is out or its client is gone (the door closes with the road only AFTER it answered: never a cut before the words).
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
function create({ allowlist = () => '', allow = null, log = console, connectTimeoutMs = 10000, resolve = (h) => h, serve = null, tag = 'egress', failed = null } = {}) {
  // lane tailnet-names: `serve(req, res)` answers an ORIGIN-form request first (true = answered); `tag` names the journal lines;
  // r2: `failed(host, port, err)` hears an admitted host's upstream failure (→ {type, body} answers an absolute-form GET's 502)
  const heard = (host, port, e) => { try { return failed ? failed(host, port, e) || null : null; } catch { return null; } };
  const refusedWord = (why) => (tag === 'egress' ? `egress refused: ${why}` : String(why));
  const verdict = (host) => (allow ? allow(host) : B.egressVerdict(host, allowlist()));
  /** lane tailnet-names r5: a verdict's `answered` — once its answer is out (or its client gone), never before */
  const answered = (v) => { if (v && typeof v.answered === 'function') { const f = v.answered; v.answered = null; try { f(); } catch { /* its own */ } } };
  // lane tailnet-names r3: a verdict may be a PROMISE and may name `to` (the address it vetted — the upstream dials it, no second
  // lookup) or `error` (the name's own lookup failed: said as the upstream failure it is); a plain verdict decides at once
  const decide = (host, then) => {
    let v;
    try { v = verdict(host); } catch (e) { v = { allow: false, why: String((e && e.message) || e) }; }
    if (v && typeof v.then === 'function') v.then((x) => then(x || { allow: false, why: 'no verdict' }), (e) => then({ allow: false, why: String((e && e.message) || e) }));
    else then(v || { allow: false, why: 'no verdict' });
  };
  // `resolve` maps an ADMITTED host to where the upstream connects (identity
  // in production; the gate points an allowlisted name at a loopback target).
  // The verdict is always taken on the name the client asked for.
  const upstreamHost = (h) => { try { return String(resolve(h) || h); } catch { return h; } };
  const stats = { allowed: 0, refused: 0, errors: 0 };
  // the last refusals by NAME (host + the verdict's sentence) — a page that stays blank behind the
  // allowlist is explained by what was refused, never guessed; bounded, no bodies, no paths, no secrets
  const RECENT_MAX = 20;
  const recentRefusals = [];
  const noteRefused = (host, why) => { recentRefusals.push({ host: String(host || '').slice(0, 253), why: String(why || '').slice(0, 300), at: Date.now() }); if (recentRefusals.length > RECENT_MAX) recentRefusals.shift(); };
  let server = null;

  function refuse(res, v, host) {
    res.once('close', () => answered(v)); // r5: written, or its client gone
    stats.refused++;
    noteRefused(host, v.why);
    const body = `${refusedWord(v.why || 'not allowed')}\n`;
    try { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body), Connection: 'close' }); res.end(body); } catch { /* gone */ }
    log.log?.(`[${tag}] refused ${host}: ${v.why}`);
  }

  function onRequest(req, res) {
    if (serve && String(req.url || '').startsWith('/')) { try { if (serve(req, res)) return; } catch { /* the proxy rule below answers */ } }
    let target;
    try { target = new URL(req.url); } catch { res.writeHead(400, { Connection: 'close' }); res.end('egress proxy: absolute-form request required\n'); return; }
    if (target.protocol !== 'http:') { res.writeHead(400, { Connection: 'close' }); res.end('egress proxy: only http:// absolute-form requests or CONNECT\n'); return; }
    decide(target.hostname, (v) => {
      if (req.socket.destroyed) return answered(v); // lane tailnet-names r4: a client gone while the verdict was asked — nothing to dial
      if (!v.allow) return refuse(res, v, target.hostname);
      stats.allowed++;
      // r5: A CLIENT THAT LEAVES IS NOT A DEVICE FAILURE — its upstream is ended by us (Node then says ECONNRESET on it): never
      // an error counted, never a failure the door remembers for the device
      let left = false;
      const upFailed = (e) => { if (left) return; stats.errors++; const said = heard(target.hostname, Number(target.port) || 80, e); try { if (said) { res.writeHead(502, { 'Content-Type': said.type, 'Content-Length': Buffer.byteLength(said.body), Connection: 'close' }); res.end(said.body); } else { res.writeHead(502, { Connection: 'close' }); res.end(`egress proxy: upstream ${target.hostname} failed — ${e.message}\n`); } } catch { /* gone */ } };
      if (v.error) return upFailed(v.error);
      const headers = { ...req.headers };
      delete headers['proxy-connection']; delete headers['proxy-authorization'];
      headers.connection = 'close';
      const up = http.request({ host: upstreamHost(v.to || target.hostname), port: Number(target.port) || 80, method: req.method, path: target.pathname + target.search, headers, timeout: connectTimeoutMs }, (ur) => {
        res.writeHead(ur.statusCode || 502, { ...ur.headers, connection: 'close' });
        ur.pipe(res);
      });
      up.on('timeout', () => { up.destroy(new Error('upstream timeout')); });
      up.on('error', upFailed);
      res.on('close', () => { if (!res.writableFinished) { left = true; try { up.destroy(); } catch { /* gone */ } } }); // r4: the client gone ⇒ the upstream too
      req.pipe(up);
    });
  }

  function onConnect(req, sock, head) {
    const m = /^([^:]+|\[[^\]]+\]):(\d{1,5})$/.exec(String(req.url || ''));
    const host = m ? m[1].replace(/^\[|\]$/g, '') : '';
    const port = m ? Number(m[2]) : 0;
    sock.on('error', () => { /* a client gone while the verdict is asked: nothing to answer */ });
    const go = (v) => {
      if (!v.allow || !port) {
        if (sock.destroyed) answered(v); else { sock.once('finish', () => answered(v)); sock.once('close', () => answered(v)); } // r5: once the 403 is out
        stats.refused++;
        noteRefused(host || req.url, v.why || 'no port');
        const body = `${refusedWord(v.why)}\n`;
        try { sock.write(`HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`); } catch { /* gone */ }
        try { sock.end(); } catch { /* gone */ }
        log.log?.(`[${tag}] refused CONNECT ${req.url}: ${v.why}`);
        return;
      }
      // lane tailnet-names r4: NO DIAL FOR A CLIENT THAT IS GONE — a reset / a cut (the door closed with the road) while the
      // verdict was asked: its 'close' already fired, nothing would ever end the upstream
      if (sock.destroyed) return;
      stats.allowed++;
      if (v.error) { stats.errors++; heard(host, port, v.error); try { sock.write(`HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\negress proxy: ${v.error.message}\n`); } catch { /* gone */ } try { sock.destroy(); } catch { /* gone */ } return; }
      const up = net.connect({ host: upstreamHost(v.to || host), port });
      let open = false;
      const t = setTimeout(() => { if (!open) { try { up.destroy(new Error('connect timeout')); } catch { /* gone */ } } }, connectTimeoutMs);
      up.once('connect', () => {
        open = true; clearTimeout(t);
        try { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); } catch { /* gone */ }
        if (head && head.length) up.write(head);
        up.pipe(sock); sock.pipe(up);
      });
      up.on('error', (e) => { stats.errors++; clearTimeout(t); if (!open) heard(host, port, e); try { if (!open) sock.write(`HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\negress proxy: ${e.message}\n`); } catch { /* gone */ } try { sock.destroy(); } catch { /* gone */ } });
      up.on('close', () => { try { sock.end(); } catch { /* gone */ } });
      sock.on('error', () => { try { up.destroy(); } catch { /* gone */ } });
      sock.on('close', () => { try { up.destroy(); } catch { /* gone */ } });
    };
    if (host) decide(host, go); else go({ allow: false, why: 'malformed CONNECT target' });
  }

  /** Listen on 127.0.0.1 (port 0 = ephemeral). Returns the port. */
  async function listen({ port = 0 } = {}) {
    if (server) return server.address().port;
    server = http.createServer({ maxHeaderSize: MAX_HEADER_BYTES }, onRequest);
    server.on('connection', (c) => { socks.add(c); c.on('close', () => socks.delete(c)); });
    server.on('connect', onConnect);
    server.on('clientError', (e, sock) => { try { sock.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); } catch { /* gone */ } });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve()); });
    return server.address().port;
  }
  function portOf() { return server ? server.address().port : null; }
  const socks = new Set();
  /** stop listening; `cut` = end the open connections too (a CONNECT tunnel is no HTTP connection: close() alone waits for it) —
   *  lane tailnet-names r3: the tailnet door closes with the road */
  async function close({ cut = false } = {}) { if (!server) return; const s = server; server = null; const done = new Promise((r) => s.close(() => r())); if (cut) for (const c of socks) { try { c.destroy(); } catch { /* gone */ } } await done; }

  return { listen, close, port: portOf, stats, verdict, recent: () => recentRefusals.map((r) => ({ ...r })), url: () => (server ? `http://127.0.0.1:${server.address().port}` : null) };
}

module.exports = { create, MAX_HEADER_BYTES };

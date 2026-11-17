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
 *
 * THROUGH A PROFILE'S PROXY (B-8b87, lane cli-update-needs-nothing): `upstream()` names the profile's own proxy (http, https
 * or socks5, with the credential the keeper read from the vault) — every admitted request then leaves THROUGH it: the
 * destination's NAME goes upstream (`CONNECT host:port`, SOCKS5's domain-name address type) and is never resolved here — the
 * only address this process dials is the upstream proxy's own (dialVia). The browser talks to this loopback port without
 * authentication; the credential never reaches its argv, its env or its pages. `upstream()` answering `{ refused }` (the vault
 * locked, the reference naming nothing) ⇒ every request is answered 502 with that sentence — never a direct connection.
 */
const http = require('http');
const net = require('net');
const tls = require('tls');
const B = require('../browser-profiles.js');

const MAX_HEADER_BYTES = 16 * 1024;

/** A small reader over a socket's first bytes: take(n) / until(marker) — the rest stays for the tunnel. */
function socketReader(sock) {
  let buf = Buffer.alloc(0), waiting = null, ended = null;
  const wake = () => { if (waiting) { const w = waiting; waiting = null; w(); } };
  sock.on('data', (d) => { buf = Buffer.concat([buf, d]); if (buf.length > MAX_HEADER_BYTES * 4) { ended = new Error('the upstream proxy answered too much before the tunnel'); } wake(); });
  sock.on('end', () => { ended = ended || new Error('the upstream proxy closed the connection'); wake(); });
  sock.on('error', (e) => { ended = ended || e; wake(); });
  const need = async (ok) => { for (;;) { const r = ok(buf); if (r >= 0) return r; if (ended) throw ended; await new Promise((res) => { waiting = res; }); } };
  return {
    async take(n) { await need((b) => (b.length >= n ? n : -1)); const out = buf.subarray(0, n); buf = buf.subarray(n); return out; },
    async until(marker) { const m = Buffer.from(marker); const at = await need((b) => { const i = b.indexOf(m); return i >= 0 ? i + m.length : (b.length > MAX_HEADER_BYTES ? (ended = new Error('the upstream proxy\'s answer has no end of headers'), -1) : -1); }); const out = buf.subarray(0, at); buf = buf.subarray(at); return out; },
    rest() { sock.pause(); sock.removeAllListeners('data'); const r = buf; buf = Buffer.alloc(0); return r; },
  };
}
const proxyErr = (code, msg) => Object.assign(new Error(msg), { code });
/** A TCP (or TLS, for an https proxy) connection to the UPSTREAM PROXY itself — the one address this process dials. */
function connectUpstream(up) {
  return up.scheme === 'https'
    ? tls.connect({ host: up.host, port: up.port, servername: net.isIP(up.host) ? undefined : up.host })
    : net.connect({ host: up.host, port: up.port });
}
/**
 * THROUGH THE PROFILE'S PROXY: a socket to `host:port` dialled via `up` = { scheme: 'http'|'https'|'socks5', host, port,
 * auth?: { user, pass } }. The NAME goes upstream and is never resolved here. Resolves { sock, rest } (`rest` = the bytes
 * that followed the proxy's answer); rejects with a coded error (proxy_auth_refused / proxy_refused / proxy_unreachable).
 */
async function dialVia(up, host, port, { timeoutMs = 10000 } = {}) {
  const s = connectUpstream(up);
  const r = socketReader(s);
  const timer = setTimeout(() => { try { s.destroy(proxyErr('proxy_unreachable', `the profile's proxy ${up.host}:${up.port} did not answer in ${Math.round(timeoutMs / 1000)} s`)); } catch { /* gone */ } }, timeoutMs);
  try {
    await new Promise((res, rej) => { s.once(up.scheme === 'https' ? 'secureConnect' : 'connect', res); s.once('error', (e) => rej(proxyErr('proxy_unreachable', `the profile's proxy ${up.host}:${up.port} cannot be reached — ${e.message}`))); });
    if (up.scheme === 'socks5') {
      const withAuth = !!(up.auth && up.auth.user != null);
      s.write(Buffer.from(withAuth ? [5, 2, 0, 2] : [5, 1, 0]));
      const [v, m] = await r.take(2);
      if (v !== 5) throw proxyErr('proxy_refused', 'the profile\'s proxy does not speak SOCKS5');
      if (m === 2) {
        const u = Buffer.from(String(up.auth.user)), p = Buffer.from(String(up.auth.pass || ''));
        if (u.length > 255 || p.length > 255) throw proxyErr('proxy_auth_refused', 'the proxy\'s user name or password is longer than SOCKS5 allows (255 bytes)');
        s.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([p.length]), p]));
        const [, st] = await r.take(2);
        if (st !== 0) throw proxyErr('proxy_auth_refused', 'the profile\'s proxy refused its user name and password');
      } else if (m !== 0) throw proxyErr('proxy_auth_refused', withAuth ? 'the profile\'s proxy accepts neither its user name and password nor no authentication' : 'the profile\'s proxy asks for a user name and password, and the profile names none');
      // the destination: an address literal as itself; a NAME as the domain-name type (0x03) — resolved by the proxy, never here
      const ip = net.isIP(host);
      const addr = ip === 4 ? Buffer.from([1, ...host.split('.').map(Number)])
        : ip === 6 ? Buffer.concat([Buffer.from([4]), Buffer.from(ipv6Bytes(host))])
        : (() => { const n = Buffer.from(host); if (n.length > 255) throw proxyErr('proxy_refused', 'a host name longer than 255 bytes'); return Buffer.concat([Buffer.from([3, n.length]), n]); })();
      s.write(Buffer.concat([Buffer.from([5, 1, 0]), addr, Buffer.from([port >> 8, port & 255])]));
      const hd = await r.take(4);
      if (hd[1] !== 0) throw proxyErr('proxy_refused', `the profile's proxy could not reach ${host}:${port} (SOCKS5 reply ${hd[1]})`);
      const alen = hd[3] === 1 ? 4 : hd[3] === 4 ? 16 : (await r.take(1))[0];
      await r.take(alen + 2);
    } else {
      const target = net.isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`;
      const auth = up.auth && up.auth.user != null ? `Proxy-Authorization: Basic ${Buffer.from(`${up.auth.user}:${up.auth.pass || ''}`).toString('base64')}\r\n` : '';
      s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${auth}\r\n`);
      const head = (await r.until('\r\n\r\n')).toString('latin1');
      const code = Number((/^HTTP\/1\.[01] (\d{3})/.exec(head) || [])[1] || 0);
      if (code === 407) throw proxyErr('proxy_auth_refused', up.auth ? 'the profile\'s proxy refused its user name and password (407)' : 'the profile\'s proxy asks for a user name and password (407), and the profile names none');
      if (code < 200 || code > 299) throw proxyErr('proxy_refused', `the profile's proxy refused ${target}${code ? ` (${code})` : ''}`);
    }
    clearTimeout(timer);
    return { sock: s, rest: r.rest() };
  } catch (e) { clearTimeout(timer); try { s.destroy(); } catch { /* gone */ } throw e.code ? e : proxyErr('proxy_unreachable', `the profile's proxy ${up.host}:${up.port} failed — ${e.message}`); }
}
/** the 16 bytes of an IPv6 literal (`::` expanded) */
function ipv6Bytes(h) {
  const [a, b = ''] = String(h).split('::');
  const pa = a ? a.split(':') : [], pb = b ? b.split(':') : [];
  const groups = [...pa, ...Array(8 - pa.length - pb.length).fill('0'), ...pb].map((g) => parseInt(g || '0', 16));
  return groups.flatMap((g) => [g >> 8, g & 255]);
}

/**
 * @param allow  (host) => {allow, why|rule} — defaults to egressVerdict over `allowlist()`
 * @param allowlist  () => the current allowlist (string | array) — re-read per request so a setting change applies live
 */
function create({ allowlist = () => '', allow = null, log = console, connectTimeoutMs = 10000, resolve = (h) => h, serve = null, tag = 'egress', failed = null, cutGraceMs = 15000, upstream = null } = {}) {
  // B-8b87: `upstream()` → null (dial directly, as before) | { scheme, host, port, auth? } (every request leaves through it) |
  // { refused: { code, sentence } } (502 with the sentence — never direct). Asked per request: an unlock applies at the next one
  const upstreamOf = () => { if (typeof upstream !== 'function') return null; try { return upstream() || null; } catch (e) { return { refused: { code: 'proxy_credential_unreadable', sentence: String((e && e.message) || e) } }; } };
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
  // B-05e8 ① (the m2 law under concurrency): a socket whose verdict is STILL ASKED (its name looked up) is never cut by a
  // close({ cut }) — it is marked, answered (a refusal read whole; an admission not dialled: the door closed) and ended then;
  // a verdict that never comes is cut after `cutGraceMs` (15 s: past a resolver's own two 5 s tries); an admission's lookup
  // FAILURE is an answer (its 502), never a cut; a refusal on a cut socket ends it once written (never a half-open wait)
  const asking = new Set(), cutAfter = new Set();
  /** B-8b87: the page a person sees when the profile's proxy cannot be used (the vault locked, the reference naming nothing) */
  const page502 = (r) => `${String((r && r.sentence) || 'the profile\'s proxy cannot be used')}\n(${String((r && r.code) || 'proxy_credential_unreadable')})\n`;

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
    const so = req.socket;
    asking.add(so);
    decide(target.hostname, (v) => {
      asking.delete(so);
      const wasCut = cutAfter.delete(so);
      if (wasCut && v.allow && !v.error) { try { so.destroy(); } catch { /* gone */ } return answered(v); } // B-05e8 ①: the door closed while it was asked — never dialled
      if (wasCut) res.once('finish', () => { try { so.destroy(); } catch { /* gone */ } }); // its answer written: the socket ends with the door
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
      const send = (opts) => {
        const up = http.request({ ...opts, method: req.method, headers, timeout: connectTimeoutMs }, (ur) => {
          res.writeHead(ur.statusCode || 502, { ...ur.headers, connection: 'close' });
          ur.pipe(res);
        });
        up.on('timeout', () => { up.destroy(new Error('upstream timeout')); });
        up.on('error', upFailed);
        res.on('close', () => { if (!res.writableFinished) { left = true; try { up.destroy(); } catch { /* gone */ } } }); // r4: the client gone ⇒ the upstream too
        req.pipe(up);
      };
      // B-8b87: THROUGH THE PROFILE'S PROXY — an http(s) proxy takes the absolute form with its credential; a SOCKS5 proxy
      // carries a tunnel to the NAME; a refusal (the vault locked) is the 502 page — never a direct dial
      const via = upstreamOf();
      if (via && via.refused) { stats.errors++; const body = page502(via.refused); try { res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body), Connection: 'close' }); res.end(body); } catch { /* gone */ } log.log?.(`[${tag}] the profile's proxy refused ${target.hostname}: ${via.refused.code}`); return; }
      if (via && via.scheme !== 'socks5') {
        if (via.auth && via.auth.user != null) headers['proxy-authorization'] = `Basic ${Buffer.from(`${via.auth.user}:${via.auth.pass || ''}`).toString('base64')}`;
        return send({ createConnection: () => connectUpstream(via), path: target.href });
      }
      if (via) {
        return dialVia(via, target.hostname, Number(target.port) || 80, { timeoutMs: connectTimeoutMs }).then(({ sock: t, rest }) => {
          if (rest.length) t.unshift(rest);
          if (req.socket.destroyed) { try { t.destroy(); } catch { /* gone */ } return; }
          send({ createConnection: () => t, path: target.pathname + target.search });
        }, upFailed);
      }
      send({ host: upstreamHost(v.to || target.hostname), port: Number(target.port) || 80, path: target.pathname + target.search });
    });
  }

  function onConnect(req, sock, head) {
    const m = /^([^:]+|\[[^\]]+\]):(\d{1,5})$/.exec(String(req.url || ''));
    const host = m ? m[1].replace(/^\[|\]$/g, '') : '';
    const port = m ? Number(m[2]) : 0;
    sock.on('error', () => { /* a client gone while the verdict is asked: nothing to answer */ });
    const go = (v) => {
      asking.delete(sock);
      const wasCut = cutAfter.delete(sock);
      if (wasCut && v.allow && port && !v.error) { try { sock.destroy(); } catch { /* gone */ } answered(v); return; } // B-05e8 ①: closed while asked — never dialled
      if (wasCut) sock.once('finish', () => { try { sock.destroy(); } catch { /* gone */ } }); // its 403 / 502 written: the socket ends with the door
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
      // B-8b87: THROUGH THE PROFILE'S PROXY — the tunnel to the NAME is opened upstream (never a local lookup, never direct)
      const via = upstreamOf();
      if (via && via.refused) {
        stats.errors++;
        const body = page502(via.refused);
        try { sock.write(`HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`); } catch { /* gone */ }
        try { sock.end(); } catch { /* gone */ }
        log.log?.(`[${tag}] the profile's proxy refused CONNECT ${req.url}: ${via.refused.code}`);
        return;
      }
      if (via) {
        dialVia(via, host, port, { timeoutMs: connectTimeoutMs }).then(({ sock: t, rest }) => {
          if (sock.destroyed) { try { t.destroy(); } catch { /* gone */ } return; }
          try { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); } catch { /* gone */ }
          if (rest.length) sock.write(rest);
          if (head && head.length) t.write(head);
          t.pipe(sock); sock.pipe(t);
          t.on('error', () => { try { sock.destroy(); } catch { /* gone */ } });
          t.on('close', () => { try { sock.end(); } catch { /* gone */ } });
          sock.on('close', () => { try { t.destroy(); } catch { /* gone */ } });
        }, (e) => {
          stats.errors++; heard(host, port, e);
          try { sock.write(`HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\negress proxy: ${e.message}\n`); } catch { /* gone */ }
          try { sock.destroy(); } catch { /* gone */ }
        });
        return;
      }
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
    if (host) { asking.add(sock); decide(host, go); } else go({ allow: false, why: 'malformed CONNECT target' });
  }

  /** Listen on 127.0.0.1 (port 0 = ephemeral). Returns the port. */
  async function listen({ port = 0 } = {}) {
    if (server) return server.address().port;
    server = http.createServer({ maxHeaderSize: MAX_HEADER_BYTES }, onRequest);
    server.on('connection', (c) => { socks.add(c); c.on('close', () => { socks.delete(c); asking.delete(c); cutAfter.delete(c); }); });
    server.on('connect', onConnect);
    server.on('clientError', (e, sock) => { try { sock.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); } catch { /* gone */ } });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve()); });
    return server.address().port;
  }
  function portOf() { return server ? server.address().port : null; }
  const socks = new Set();
  /** stop listening; `cut` = end the open connections too (a CONNECT tunnel is no HTTP connection: close() alone waits for it) —
   *  lane tailnet-names r3: the tailnet door closes with the road */
  async function close({ cut = false } = {}) {
    if (!server) return;
    const s = server; server = null;
    const done = new Promise((r) => s.close(() => r()));
    if (cut) {
      const marked = [];
      for (const c of socks) { if (asking.has(c)) { cutAfter.add(c); marked.push(c); continue; } try { c.destroy(); } catch { /* gone */ } } // B-05e8 ①: one still asked answers first
      if (marked.length) { const t = setTimeout(() => { for (const c of marked) { if (!cutAfter.has(c)) continue; cutAfter.delete(c); try { c.destroy(); } catch { /* gone */ } } }, cutGraceMs); if (t.unref) t.unref(); } // THIS close's own
    }
    await done;
  }

  return { listen, close, port: portOf, stats, verdict, recent: () => recentRefusals.map((r) => ({ ...r })), url: () => (server ? `http://127.0.0.1:${server.address().port}` : null) };
}

module.exports = { create, dialVia, MAX_HEADER_BYTES };

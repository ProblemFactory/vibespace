'use strict';
/**
 * THE CDP-MEDIATING PROXY — ORCH (docs/design-agent-browser-v2.md §6.2 / §6.5 /
 * D6, agent browser P6 "hard mediation").
 *
 * One loopback http server, started LAZILY (a fresh instance listens on
 * nothing until the first grant), serving every mediated lease its OWN url:
 *   GET /m/<token>/json/version        the upstream's answer, endpoint re-pointed
 *   GET /m/<token>/json[/list]         only the lease's targets, endpoints re-pointed
 *   WS  /m/<token>/devtools/browser    the browser endpoint, every message JUDGED
 *   WS  /m/<token>/devtools/page/<id>  a page endpoint, in scope only
 * The RULES are PURE (src/browser-mediation.js): scope over `Target.*`, the
 * typed `browser_paused` refusal while the user drives (a live callback the
 * keeper hands the grant — read PER MESSAGE, never cached), the whole-browser
 * acts refused outright. This file does the I/O only: the upstream socket is
 * opened HERE (the raw endpoint never leaves the server), a refusal is a CDP
 * error the client reads by id, an event the lease may not see is dropped.
 *
 * Invariants:
 *   · a grant is one per (profile, conversation) — the lease's own unit — and
 *     its token is minted ONCE for the lease's life in this process; the
 *     upstream is RE-POINTED when the profile's browser restarts (its live
 *     connections close 1012 `browser_restarting` — the next command
 *     reconnects through the same url) and NULLED when it stops;
 *   · revoking a grant closes its connections 1008 `lease_gone` — a session
 *     whose lease dropped keeps nothing;
 *   · an unknown token answers 404 on every path (never 403: an unknown path
 *     confirms nothing); an out-of-scope page endpoint answers 403 by name;
 *   · the client is upgraded only AFTER the upstream socket is open, so no
 *     message is ever queued into a socket that may not come — an upstream
 *     that cannot be reached answers 502 on the upgrade;
 *   · a client PARKED on that open is wired only if its grant still stands:
 *     revoke / repoint / shutdown terminate the grant's parked upstreams, and
 *     the open re-checks the grant (still granted, the mediator not closed,
 *     the url it dialed still the target's CURRENT one) — else 503 by name,
 *     never a connection no grant owns (verify r3 M3);
 *   · nothing is logged with a token or a raw url in it.
 * Gate: test-browser-mediation (fast: the real proxy over a fake CDP upstream)
 * + test-browser-mediation-chrome (heavy: the real chrome — the §6.2 exit).
 */
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const M = require('../browser-mediation.js');

const MAX_PAYLOAD = 256 * 1024 * 1024; // a Page.captureScreenshot / printToPDF answer can be tens of MB
const UPSTREAM_OPEN_MS = 8000;
const FETCH_MS = 4000;
/** The status text a PARKED client is refused with (503) when its grant moved during the upstream's open — keyed by
 *  the close reason the grant's live connections get (verify r3 M3). */
const REFUSE_TEXT = Object.freeze({ lease_gone: 'Lease Gone', browser_restarting: 'Browser Restarting', browser_stopped: 'Browser Stopped', server_shutdown: 'Server Shutting Down' });

function create({ log = console, now = Date.now } = {}) {
  const grants = new Map();   // token → grant
  const byKey = new Map();    // grantKey → token
  let server = null, wss = null, port = null, listening = null, closed = false;

  const view = (g) => M.grantView(g);
  function mintToken() { for (;;) { const t = crypto.randomBytes(24).toString('base64url'); if (M.isToken(t) && !grants.has(t)) return t; } }
  const upstreamHttp = (g) => { try { const u = new URL(String(g.upstream).replace(/^ws(s?):\/\//, 'http$1://')); return { host: u.hostname, port: Number(u.port) || 80 }; } catch { return null; } };
  const upstreamPageUrl = (g, targetId) => { try { const u = new URL(String(g.upstream)); return `${u.protocol}//${u.host}/devtools/page/${targetId}`; } catch { return null; } };

  // ── the http side ──
  function fetchJson(g, pathname) {
    return new Promise((resolve) => {
      const h = upstreamHttp(g);
      if (!h) return resolve({ ok: false, status: 502, error: 'no upstream' });
      let done = false; const fin = (r) => { if (!done) { done = true; resolve(r); } };
      try {
        const req = http.get({ host: h.host, port: h.port, path: pathname, timeout: FETCH_MS }, (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { if (body.length < 4 * 1024 * 1024) body += c; });
          res.on('end', () => { let j = null; try { j = JSON.parse(body); } catch { j = null; } fin(res.statusCode === 200 && j !== null ? { ok: true, json: j } : { ok: false, status: 502, error: `upstream answered ${res.statusCode}` }); });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', (e) => fin({ ok: false, status: 502, error: e.message }));
      } catch (e) { fin({ ok: false, status: 502, error: e.message }); }
    });
  }
  const answer = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  async function onRequest(req, res) {
    const p = M.parseMediatedPath(req.url || '');
    const g = p ? grants.get(p.token) : null;
    if (!p || !g) return answer(res, 404, { error: 'not found' });
    if (req.method !== 'GET') return answer(res, 405, { error: 'GET only' });
    if (!g.upstream) return answer(res, 503, { error: 'browser_stopped', message: 'this profile\'s browser is not running — the next attach starts it' });
    g.lastUsedAt = now();
    if (p.kind === 'version') {
      const r = await fetchJson(g, '/json/version');
      if (!r.ok) return answer(res, r.status, { error: 'upstream_unreachable', message: r.error });
      return answer(res, 200, M.versionAnswer(r.json, { port, token: g.token }));
    }
    if (p.kind === 'list') {
      const r = await fetchJson(g, '/json/list');
      if (!r.ok) return answer(res, r.status, { error: 'upstream_unreachable', message: r.error });
      return answer(res, 200, M.listAnswer(r.json, g.scope, { port, token: g.token }));
    }
    return answer(res, 404, { error: 'not found' });
  }

  // ── the websocket side ──
  const rawRefuse = (socket, status, text) => { try { socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch { /* gone */ } try { socket.destroy(); } catch { /* gone */ } };
  function onUpgrade(req, socket, head) {
    const p = M.parseMediatedPath(req.url || '');
    const g = p ? grants.get(p.token) : null;
    if (!p || !g || (p.kind !== 'browser' && p.kind !== 'page')) return rawRefuse(socket, 404, 'Not Found');
    if (!g.upstream) return rawRefuse(socket, 503, 'Browser Stopped');
    if (p.kind === 'page' && !M.inScope(g.scope, p.targetId)) return rawRefuse(socket, 403, 'Target Out Of Scope');
    const upUrl = p.kind === 'browser' ? g.upstream : upstreamPageUrl(g, p.targetId);
    if (!upUrl) return rawRefuse(socket, 502, 'Bad Upstream');
    let up;
    try { up = new WebSocket(upUrl, { maxPayload: MAX_PAYLOAD, perMessageDeflate: false, handshakeTimeout: UPSTREAM_OPEN_MS }); } catch { return rawRefuse(socket, 502, 'Bad Upstream'); }
    let settled = false;
    // THE PARK IS THE GRANT'S (verify r3 M3): revoke / repoint / shutdown end it by name (closeConns) — a connection
    // opened for a grant that is gone would be in no grant's `conns`, so no revoke, repoint or shutdown could reach it
    const park = { up, why: null };
    g.pendingUps.add(park);
    // THE CLIENT SOCKET IS PARKED while the upstream opens (up to UPSTREAM_OPEN_MS) with NO error listener of its own
    // (node's http server removed its at 'upgrade'; ws adds one only inside handleUpgrade) — a client that RESETS
    // meanwhile was an unhandled 'error' ⇒ the hub's uncaughtException exit (the desktop bridge's verify r2 F1, the
    // same shape here). Listened BEFORE the park; a client gone before the upstream opened closes that upstream
    // (it was left open — a CDP connection nobody reads), and the listener is handed to ws's own at the upgrade.
    const parkedError = () => { try { socket.destroy(); } catch { /* gone */ } };
    const parkedGone = () => { if (!settled) { settled = true; try { up.terminate(); } catch { /* none */ } } };
    socket.on('error', parkedError);
    socket.once('close', parkedGone);
    up.once('error', (e) => {
      g.pendingUps.delete(park);
      if (settled) return;
      settled = true;
      if (park.why) return rawRefuse(socket, 503, park.why); // terminated by revoke / repoint / shutdown — said by name
      log.warn?.(`[cdp-mediator] upstream refused a ${p.kind} connection for ${g.profileId}/${g.browserKey}: ${e && e.message}`);
      rawRefuse(socket, 502, 'Upstream Unreachable');
    });
    up.once('open', () => {
      g.pendingUps.delete(park);
      if (settled) { try { up.close(); } catch { /* none */ } return; }
      settled = true;
      socket.removeListener('close', parkedGone);
      const why = park.why || (closed ? REFUSE_TEXT.server_shutdown : grants.get(g.token) !== g ? REFUSE_TEXT.lease_gone : !g.upstream ? REFUSE_TEXT.browser_stopped : upUrl !== (p.kind === 'browser' ? g.upstream : upstreamPageUrl(g, p.targetId)) ? REFUSE_TEXT.browser_restarting : null);
      if (why) { try { up.close(); } catch { /* none */ } return rawRefuse(socket, 503, why); } // the grant moved while the client waited (verify r3 M3)
      if (socket.destroyed || !socket.readable || !socket.writable) { try { up.close(); } catch { /* none */ } try { socket.destroy(); } catch { /* gone */ } return; } // half-closed: ws would drop it without its callback
      socket.removeListener('error', parkedError); // ws attaches its own, synchronously, at the top of handleUpgrade
      wss.handleUpgrade(req, socket, head, (ws) => wire(g, p, ws, up));
    });
  }
  function wire(g, p, ws, up) {
    const conn = { ws, up, kind: p.kind, targetId: p.targetId, pending: new Map(), openedAt: now() };
    g.conns.add(conn);
    g.lastUsedAt = now();
    const closeBoth = (code, reason) => {
      g.conns.delete(conn);
      try { if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(code, reason); } catch { /* gone */ }
      try { if (up.readyState === WebSocket.OPEN || up.readyState === WebSocket.CONNECTING) up.close(); } catch { /* gone */ }
    };
    ws.on('message', (data) => {
      let msg = null;
      try { msg = JSON.parse(String(data)); } catch { msg = null; }
      if (!msg) { try { ws.send(JSON.stringify(M.refusal(null, 'bad_message', 'not JSON'))); } catch { /* gone */ } return; }
      g.lastUsedAt = now();
      let paused = false;
      try { paused = !!(typeof g.paused === 'function' && g.paused()); } catch (e) { paused = false; log.warn?.(`[cdp-mediator] paused() threw for ${g.profileId}/${g.browserKey}: ${e && e.message}`); }
      const v = M.judge(msg, g.scope, { paused });
      if (v.kind === 'refuse') { g.refusals = (g.refusals || 0) + 1; try { ws.send(JSON.stringify(v.reply)); } catch { /* gone */ } return; }
      if (v.kind !== 'forward') return;
      conn.pending.set(msg.id, v.pending);
      if (conn.pending.size > 10000) { const first = conn.pending.keys().next().value; conn.pending.delete(first); }
      try { up.send(String(data)); } catch (e) { conn.pending.delete(msg.id); try { ws.send(JSON.stringify(M.refusal(msg.id, 'upstream_gone', e && e.message || 'send failed', v.pending.sessionId))); } catch { /* gone */ } }
    });
    up.on('message', (data) => {
      let msg = null;
      try { msg = JSON.parse(String(data)); } catch { msg = null; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.id != null && conn.pending.has(msg.id)) {
        const pend = conn.pending.get(msg.id); conn.pending.delete(msg.id);
        const out = M.admitReply(msg, pend, g.scope);
        try { for (const ev of out.emit) ws.send(JSON.stringify(ev)); ws.send(JSON.stringify(out.reply)); } catch { /* gone */ }
        return;
      }
      if (msg.id != null) return; // a reply to nothing we forwarded
      const ev = M.filterEvent(msg, g.scope);
      if (!ev) { g.dropped = (g.dropped || 0) + 1; return; }
      try { ws.send(ev === msg ? String(data) : JSON.stringify(ev)); } catch { /* gone */ }
    });
    ws.on('close', () => closeBoth(1000, ''));
    ws.on('error', () => closeBoth(1011, 'client error'));
    up.on('close', () => closeBoth(1011, 'upstream closed'));
    up.on('error', () => closeBoth(1011, 'upstream error'));
  }

  // ── lifecycle ──
  function listen() {
    if (closed) return Promise.reject(new Error('cdp-mediator: shut down'));
    if (port) return Promise.resolve(port);
    if (listening) return listening;
    listening = new Promise((resolve, reject) => {
      server = http.createServer((req, res) => { onRequest(req, res).catch((e) => { try { answer(res, 500, { error: 'mediator_error', message: e && e.message }); } catch { /* gone */ } }); });
      wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });
      server.on('upgrade', onUpgrade);
      server.on('error', (e) => { if (!port) { listening = null; reject(e); } else log.warn?.(`[cdp-mediator] server error: ${e && e.message}`); });
      server.listen(0, '127.0.0.1', () => { port = server.address().port; log.log?.(`[cdp-mediator] listening on 127.0.0.1:${port} (per-session CDP urls, §6.5)`); resolve(port); });
    });
    return listening;
  }
  /** ONE grant per (profile, conversation): minted on first ask, re-used
   *  after (the upstream and the paused reader refreshed; the scope KEPT — a
   *  lease that re-attaches keeps its tabs; `targetIds` are ADDED). */
  async function grantFor({ profileId, browserKey, upstream = null, targetIds = [], paused = null } = {}) {
    if (!profileId || !browserKey) throw Object.assign(new Error('a grant names a profile and a conversation'), { code: 'bad-request' });
    await listen();
    const key = M.grantKey(profileId, browserKey);
    let g = byKey.has(key) ? grants.get(byKey.get(key)) : null;
    if (!g) {
      g = { token: mintToken(), key, profileId: String(profileId), browserKey: String(browserKey), upstream: null, scope: M.newScope({}), paused: null, conns: new Set(), pendingUps: new Set(), createdAt: now(), lastUsedAt: 0, refusals: 0, dropped: 0 };
      grants.set(g.token, g); byKey.set(key, g.token);
      log.log?.(`[cdp-mediator] grant minted for ${g.browserKey} on ${g.profileId}`);
    }
    for (const t of targetIds || []) M.admitTarget(g.scope, t);
    if (typeof paused === 'function') g.paused = paused;
    if (upstream !== undefined && upstream !== g.upstream) repointGrant(g, upstream);
    return { token: g.token, url: M.mediatedBrowserUrl({ port, token: g.token }), httpBase: M.mediatedHttpBase({ port, token: g.token }), view: view(g) };
  }
  function repointGrant(g, upstream) {
    const was = g.upstream;
    g.upstream = upstream ? String(upstream) : null;
    if (was && was !== g.upstream) closeConns(g, 1012, g.upstream ? 'browser_restarting' : 'browser_stopped');
  }
  function closeConns(g, code, reason) {
    for (const c of [...g.conns]) { g.conns.delete(c); try { c.ws.close(code, reason); } catch { /* gone */ } try { c.up.close(); } catch { /* gone */ } }
    // a client still PARKED on its upstream's open: that upstream is terminated and the client answered 503 by name (verify r3 M3)
    for (const pk of [...g.pendingUps]) { g.pendingUps.delete(pk); pk.why = pk.why || REFUSE_TEXT[reason] || REFUSE_TEXT.lease_gone; try { pk.up.terminate(); } catch { /* gone */ } }
  }
  /** The profile's browser restarted (a new upstream url) or stopped (null):
   *  every grant on it is re-pointed; live connections close by name. */
  function repoint(profileId, upstream) {
    let n = 0;
    for (const g of grants.values()) if (g.profileId === String(profileId)) { repointGrant(g, upstream); n++; }
    return n;
  }
  /** Close every target a grant owns IN THE BROWSER (one bounded upstream
   *  connection, `Target.closeTarget` per id): a mediated `close --all` closes
   *  the session's daemon side only — `Browser.close` is refused through a
   *  session url — so the lease's tabs would outlive the lease (measured on
   *  0.32.0 + Chrome 153). Best-effort: `{closed, failed}`, never a throw. */
  function closeTargetsOf(g, { timeoutMs = 4000 } = {}) {
    const ids = g && g.scope ? [...g.scope.targets] : [];
    if (!ids.length || !g.upstream) return Promise.resolve({ closed: 0, failed: ids.length ? ids.length : 0, why: ids.length ? 'browser stopped' : null });
    return new Promise((resolve) => {
      let done = false, closed = 0, failed = 0, up = null;
      const fin = () => { if (done) return; done = true; try { up?.close(); } catch { /* none */ } resolve({ closed, failed: failed + (ids.length - closed - failed), why: null }); };
      const timer = setTimeout(fin, timeoutMs);
      try { up = new WebSocket(g.upstream, { perMessageDeflate: false, handshakeTimeout: timeoutMs }); } catch { clearTimeout(timer); return resolve({ closed: 0, failed: ids.length, why: 'bad upstream' }); }
      up.on('error', () => { clearTimeout(timer); fin(); });
      up.on('open', () => { ids.forEach((id, i) => { try { up.send(JSON.stringify({ id: i + 1, method: 'Target.closeTarget', params: { targetId: id } })); } catch { /* gone */ } }); });
      up.on('message', (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { m = null; } if (!m || m.id == null) return; if (m.result && m.result.success !== false) closed++; else failed++; if (closed + failed >= ids.length) { clearTimeout(timer); fin(); } });
    });
  }
  /** A lease ended: its grant goes, its connections close 1008 `lease_gone`,
   *  and (by default) its tabs are closed in the browser — the answer carries
   *  that close as a promise the caller may await or let run. */
  function revoke({ profileId, browserKey, closeTargets = true } = {}) {
    const key = M.grantKey(profileId, browserKey);
    const t = byKey.get(key);
    if (!t) return { revoked: false, closing: Promise.resolve({ closed: 0, failed: 0, why: 'no grant' }) };
    const g = grants.get(t);
    byKey.delete(key); grants.delete(t);
    if (!g) return { revoked: false, closing: Promise.resolve({ closed: 0, failed: 0, why: 'no grant' }) };
    closeConns(g, 1008, 'lease_gone');
    const n = g.scope.targets.size;
    const closing = closeTargets && n ? closeTargetsOf(g).then((r) => { log.log?.(`[cdp-mediator] grant revoked for ${g.browserKey} on ${g.profileId}: ${r.closed}/${n} tab(s) closed${r.failed ? `, ${r.failed} not` : ''} (${g.refusals} refusal(s), ${g.dropped} event(s) withheld)`); return r; }) : Promise.resolve({ closed: 0, failed: 0, why: n ? 'kept' : null });
    if (!(closeTargets && n)) log.log?.(`[cdp-mediator] grant revoked for ${g.browserKey} on ${g.profileId} (${g.refusals} refusal(s), ${g.dropped} event(s) withheld)`);
    return { revoked: true, closing };
  }
  function revokeWhere(pred, opts = {}) { let n = 0; for (const g of [...grants.values()]) if (pred(view(g))) { revoke({ profileId: g.profileId, browserKey: g.browserKey, ...opts }); n++; } return n; }
  function admitTarget(profileId, browserKey, targetId) { const t = byKey.get(M.grantKey(profileId, browserKey)); const g = t ? grants.get(t) : null; if (!g || !targetId) return false; M.admitTarget(g.scope, targetId); return true; }
  function grantOf(profileId, browserKey) { const t = byKey.get(M.grantKey(profileId, browserKey)); return t ? grants.get(t) : null; }
  function urlFor(profileId, browserKey) { const g = grantOf(profileId, browserKey); return g && port ? M.mediatedBrowserUrl({ port, token: g.token }) : null; }
  function list() { return [...grants.values()].map(view); }
  function shutdown() {
    closed = true;
    for (const g of grants.values()) closeConns(g, 1001, 'server_shutdown');
    grants.clear(); byKey.clear();
    try { wss?.close(); } catch { /* none */ }
    try { server?.close(); } catch { /* none */ }
    server = null; wss = null; port = null; listening = null;
  }
  return { listen, port: () => port, grantFor, repoint, revoke, revokeWhere, admitTarget, urlFor, list, available: () => !closed, shutdown, _grant: grantOf, _closeTargetsOf: closeTargetsOf };
}

module.exports = { create, MAX_PAYLOAD, REFUSE_TEXT };

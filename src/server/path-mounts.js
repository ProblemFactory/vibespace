'use strict';
// PATH MOUNTS (2.358.0, owner request: services under the MAIN domain by
// path instead of one random frp subdomain each): /svc/<name>/* reverse-
// proxies to a forward's server-loopback port — which means it works for
// REMOTE machines' services through the tunnel too, and it sits behind
// VibeSpace's own auth (cookie/Clerk), unlike the public frp URL.
//
// HONEST LIMITATION (inherent to path-prefix proxying, documented in the UI
// hint): apps that emit ABSOLUTE paths (/assets/…) must support a base
// path (vite `base`, jupyter base_url, code-server does natively). We strip
// the prefix, rewrite Location redirects back under it, and send
// X-Forwarded-Prefix so prefix-aware apps self-configure; we deliberately do
// NOT rewrite HTML bodies (that's the embedded browser proxy's job).
// ORCH tier. create(deps) factory (拆分 discipline).
const http = require('http');
const net = require('net');

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

// AUTH MODEL (2.359.0): /svc/* is EXEMPT from the global cookie middleware
// (auth.js) so that per-mount `pathPublic` can work — which makes the checks
// HERE the only gate for private mounts. requestAuthed is injected; both the
// HTTP handler and the ws upgrade enforce it, pinned by test-path-mounts.
function create({ getPortForwards, requestAuthed = () => true }) {
  /** parse /svc/<name>[/rest] → {name, rest} or null */
  function parse(url) {
    const m = /^\/svc\/([^/?#]+)(\/[^?#]*)?([?#].*)?$/.exec(url || '');
    if (!m || !NAME_RE.test(m[1])) return null;
    return { name: m[1], rest: (m[2] || '/') + (m[3] || '') };
  }

  function resolve(name) {
    try { return getPortForwards()?.pathMountTarget(name) || null; } catch { return null; }
  }

  /** Express handler mounted at /svc (AFTER auth — that ordering is the
   *  security model: a mount is a logged-in surface). */
  function handler(req, res) {
    const p = parse(req.originalUrl || req.url);
    if (!p) return res.status(404).json({ error: 'unknown service path' });
    // /svc/<name> without the trailing slash: relative asset URLs in the app
    // would resolve against /svc/ — redirect once to the canonical form
    if (!/^\/svc\/[^/?#]+\//.test(req.originalUrl || req.url)) return res.redirect(302, `/svc/${p.name}/`);
    const t = resolve(p.name);
    if (!t) return res.status(404).json({ error: `no service mounted at /svc/${p.name} — mount one from the Ports panel` });
    if (!t.rec?.pathPublic && !requestAuthed(req)) return res.status(401).json({ error: 'this service requires a VibeSpace login (the mount is not public)' });
    if (!t.localPort) return res.status(502).json({ error: `/svc/${p.name} is mounted but its forward is not active (machine offline?)` });
    const headers = { ...req.headers };
    delete headers['content-length']; // stream re-chunks
    headers.host = `127.0.0.1:${t.localPort}`;
    headers['x-forwarded-prefix'] = `/svc/${p.name}`;
    headers['x-forwarded-proto'] = req.protocol || 'http';
    headers['x-forwarded-host'] = req.headers.host || '';
    const up = http.request({ host: '127.0.0.1', port: t.localPort, method: req.method, path: p.rest, headers }, (ur) => {
      const h = { ...ur.headers };
      // absolute-path redirects come back under the mount (fixes the classic
      // login → "/login" bounce off the prefix)
      if (h.location && /^\//.test(h.location) && !h.location.startsWith('/svc/')) h.location = `/svc/${p.name}${h.location}`;
      res.writeHead(ur.statusCode || 502, h);
      ur.pipe(res);
    });
    up.on('error', (e) => { if (!res.headersSent) res.status(502).json({ error: `service at /svc/${p.name} unreachable: ${e.message}` }); else try { res.destroy(); } catch { } });
    req.pipe(up);
  }

  /** WebSocket upgrade proxy for /svc/<name>/… — wired into server.js's
   *  single upgrade dispatcher (auth is checked THERE, same as /ws). */
  function handleUpgrade(req, socket, head) {
    const p = parse(req.url);
    const t = p && resolve(p.name);
    if (!t) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
    if (!t.rec?.pathPublic && !requestAuthed(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    if (!t.localPort) { socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); socket.destroy(); return; }
    const up = net.connect(t.localPort, '127.0.0.1', () => {
      const lines = [`GET ${p.rest} HTTP/1.1`];
      for (const [k, v] of Object.entries(req.headers)) {
        if (k === 'host') { lines.push(`host: 127.0.0.1:${t.localPort}`); continue; }
        for (const vv of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${vv}`);
      }
      lines.push(`x-forwarded-prefix: /svc/${p.name}`, '', '');
      up.write(lines.join('\r\n'));
      if (head && head.length) up.write(head);
      socket.pipe(up).pipe(socket);
    });
    up.on('error', () => { try { socket.destroy(); } catch { } });
    socket.on('error', () => { try { up.destroy(); } catch { } });
  }

  return { handler, handleUpgrade, _parse: parse };
}
module.exports = { create };

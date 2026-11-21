'use strict';
/**
 * THE PUSH MOUNT's OWN DOOR (lane lg-remote-hardening, row B-7f0b — the coordinator's r1220 (1); the pattern of the dial-back's
 * own door since 2.369.413, src/server/agent-listener.js).
 *
 * A push mount puts a folder of this hub ON a paired machine: the device listens on 127.0.0.1:<port> THERE and carries every
 * connection back here (DeviceManager.reverseForward). Its hub end used to be the WHOLE web port: anyone on that machine who
 * could reach its loopback (another account on a shared machine, a container sharing its network, a page the person opened
 * there) reached the hub's sign-in page and every route that needs no sign-in. Now each push mount's tunnel ends at ITS OWN
 * door: a listener on 127.0.0.1 here that serves /dav ONLY, and only to that mount's own pass (its reverse-mount token):
 *   - a path that is not /dav or under it: 404 `not_on_the_mount_door` (the sign-in page, the API, the pages: none is here);
 *   - a /dav request with no pass, or another mount's pass: 401 (the WebDAV challenge, so a client asks for the pass);
 *   - that mount's pass: handed to the hub's OWN app (the one express app — test-auth), whose /dav route (before the sign-in
 *     gate) checks the pass again and chroots to its root as always. The hub registers its app once (setApp, the wiring
 *     module beside the agent door's start).
 * No upgrade listener: a websocket asks like any request and is answered as one. The door's port is the system's pick: the
 * device side keeps its own port, and the hub end is asked anew at every re-own (a restart re-points the tunnel at the new door).
 */
const http = require('http');
const { bearerOf } = require('../webdav.js');

let hubApp = null;
/** the hub's own express app (src/server/mounts-plugins-wiring.js registers it once) — the /dav route a door hands a request to */
function setApp(app) { hubApp = app; }

/** PURE: may this request path cross a mount's door? /dav or under it; no backslash (raw or encoded) */
function onDoor(url) {
  const p = String(url == null ? '' : url).split('?')[0];
  return (p === '/dav' || p.startsWith('/dav/')) && !/\\|%5c/i.test(p);
}
/** Open one mount's door: → Promise<{ port, setTokenId(id), close() }>. `tokenId` (or a later setTokenId) names the ONE pass it
 *  serves; until then it serves none. */
function open({ tokens, tokenId = null, log = () => { } } = {}) {
  if (typeof hubApp !== 'function') return Promise.reject(Object.assign(new Error('the push mount\'s door has no hub to hand its requests to (the hub app is not registered)'), { code: 'mount_door_unavailable' }));
  const app = hubApp;
  let want = tokenId || null;
  const server = http.createServer((req, res) => {
    if (!onDoor(req.url)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'not on this mount\'s door — a push mount\'s tunnel reaches only that mount\'s files', code: 'not_on_the_mount_door' }));
      return;
    }
    const tok = tokens && typeof tokens.resolve === 'function' ? tokens.resolve(bearerOf(req)) : null;
    if (!tok || !want || tok.id !== want) {
      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', 'Basic realm="vibespace-dav", Bearer realm="vibespace-dav"');
      res.end();
      return;
    }
    app(req, res);
  });
  server.on('error', (e) => { try { log(`[mount-door] ${(e && e.code) || e} — the door keeps listening`); } catch { } });
  return new Promise((resolve, reject) => {
    const onErr = (e) => reject(Object.assign(new Error(`the push mount's door could not listen (${(e && e.code) || e})`), { code: 'mount_door_unavailable' }));
    server.once('error', onErr);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', onErr);
      try { server.unref(); } catch { }
      resolve({
        port: server.address().port,
        setTokenId: (id) => { want = id || null; },
        close: () => new Promise((r) => { try { server.close(() => r()); } catch { r(); } }),
      });
    });
  });
}

module.exports = { open, onDoor, setApp };

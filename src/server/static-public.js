'use strict';
// THE APP'S STATIC FILES (lane vault-chip-zone-errors): public/ through express.static — every file but a SOURCE MAP.
// The product keeps no map on disk (scripts/symbolicate.mjs rebuilds the client's map in memory to name the src/ line of
// an incident ring's stack); and should one ever land in public/, it is still served to nobody: a *.map path (judged
// DECODED: %2E is a dot) is never answered here — it falls through to the routes after this one and ends in the 404
// (test-csp-report ⑨: GET /bundle.js.map, its escaped spellings, with the file on disk). Every later route keeps its own
// .map paths (a WebDAV file under /dav, a proxied page under /proxy/).
const express = require('express');

const BUILD_ONLY_RE = /\.map$/i;

/** A request path no static file answers: a source map. */
function buildOnly(reqPath) {
  let p = String(reqPath || '');
  try { p = decodeURIComponent(p); } catch { /* a malformed escape: judged as sent (express.static refuses it too) */ }
  return BUILD_ONLY_RE.test(p);
}

/** The middleware server.js mounts: express.static(publicDir) for every path but a source map's. */
function create(publicDir, opts = { etag: true, lastModified: true, maxAge: 0 }) {
  const serve = express.static(publicDir, opts);
  return (req, res, next) => (buildOnly(req.path) ? next() : serve(req, res, next));
}

module.exports = { create, buildOnly, BUILD_ONLY_RE };

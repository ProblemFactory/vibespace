'use strict';
// THE APP'S STATIC FILES (lane vault-chip-zone-errors): public/ through express.static — every file but a SOURCE MAP.
// The product keeps no map on disk (scripts/symbolicate.mjs rebuilds the client's map in memory to name the src/ line of
// an incident ring's stack); and should one ever land in public/, it is still served to nobody: a *.map path (judged
// DECODED: %2E is a dot) is never answered here — it falls through to the routes after this one and ends in the 404
// (test-csp-report ⑨: GET /bundle.js.map, its escaped spellings, with the file on disk). Every later route keeps its own
// .map paths (a WebDAV file under /dav, a proxied page under /proxy/).
//   · A SCRIPT WITH A SANITIZER IS SERVED UNDER ITS OWN STAMP (lane csp-mermaid-sites r2): the CSP judge reads a report
//     from one of app-csp PARSE_SCRIPTS against the build its `?v=` names (src/server/csp-reports.js), and express.static
//     ignores the query — so a `?v=` that names ANOTHER build than the file on disk (a tab that stayed on an older page:
//     its lazy /mermaid.js address was stamped when the page loaded, and it imports the file on disk now) is answered
//     with a redirect to the file's own stamp (`no-store`): the address a report names is the bytes that ran, for a
//     browser that reports the query (Chrome 156 drops it from source-file — measured; the sink then reads the file on
//     disk, which is what this serves). The stamp is the index route's (server.js: the file's mtime in whole ms). Every
//     other file, and a script with no `?v=`, is served as before (test-csp-report ⑨).
//     G1's cure (unit interface-trial, A1 — a page open makes NO synchronous file call): the stamp is asked of the page's
//     copy in memory first (src/server/index-page.js `stampOf` — the files the page names: no disk call at all); one the
//     copy does not know is stated with fs.promises, off the loop. Never fs.statSync on a request.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { PARSE_SCRIPTS } = require('../app-csp.js');

const BUILD_ONLY_RE = /\.map$/i;

/** A request path no static file answers: a source map. */
function buildOnly(reqPath) {
  let p = String(reqPath || '');
  try { p = decodeURIComponent(p); } catch { /* a malformed escape: judged as sent (express.static refuses it too) */ }
  return BUILD_ONLY_RE.test(p);
}

/** A served file's build stamp, as the index route writes it (`?v=`): its mtime in whole ms — or null (no such file).
 *  ASYNC (G1's cure A1): `known(rel)` — the page's copy in memory — answers first; else fs.promises.stat, off the loop. */
async function stampOf(file, known = null, rel = null) {
  const k = typeof known === 'function' && rel ? known(rel) : undefined;
  if (k !== undefined && k !== null) return String(k);
  try { return String(Math.floor((await fs.promises.stat(file)).mtimeMs)); } catch { return null; }
}

/** a request this layer checks the stamp of: GET / HEAD of a PARSE_SCRIPTS script with a `?v=` */
const stampChecked = (req) => (req.method === 'GET' || req.method === 'HEAD') && PARSE_SCRIPTS.includes(req.path) && typeof (req.query && req.query.v) === 'string';

/** → Promise: the address a request for a PARSE_SCRIPTS script should have had — its own stamp — when its `?v=` names
 *  another build; else null (serve it). */
async function ownStamp(publicDir, req, known = null) {
  if (!stampChecked(req)) return null;
  const own = await stampOf(path.join(publicDir, req.path.slice(1)), known, req.path.slice(1));
  return own && own !== req.query.v ? `${req.path}?v=${own}` : null;
}

/** The middleware server.js mounts: express.static(publicDir) for every path but a source map's. `stampOf` = the page's
 *  copy (src/server/index-page.js) — the stamps a page open asks are answered from memory. */
function create(publicDir, opts = { etag: true, lastModified: true, maxAge: 0 }, { stampOf: known = null } = {}) {
  const files = express.static(publicDir, opts);
  const serve = (req, res, next) => {
    if (!stampChecked(req)) return files(req, res, next);
    ownStamp(publicDir, req, known).then((to) => {
      if (!to) return files(req, res, next);
      res.set('Cache-Control', 'no-store'); return res.redirect(302, to);
    }, () => files(req, res, next));
  };
  return (req, res, next) => (buildOnly(req.path) ? next() : serve(req, res, next));
}

module.exports = { create, buildOnly, BUILD_ONLY_RE, stampOf, ownStamp };

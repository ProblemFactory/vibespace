'use strict';
// THE FRAME HOST (lane design-frame-host — backlog B-8679, the first blocker of ENFORCING the app page's policy; the
// measurement: lane app-page-csp's report §3/§4). Chrome gives a srcdoc / blob: / data: frame its PARENT's
// Content-Security-Policy, report-only too — so while the Design window's artboards (canvas, print, print all) and the
// channels' mail frame were srcdoc frames, they ran under the APP page's policy (`script-src 'self'`): enforcing it would
// break them. `GET /frame-host?kind=design|mail` serves ONE static host document with THAT kind's policy as a real
// HTTP header — a frame NAVIGATED here gets its OWN policy, never the parent's (measured: 0 reports where srcdoc gave 3).
// Lane frame-host-preview (B-5b2c) added the three frames the page made for FOREIGN HTML that were still srcdoc: the
// code editor's HTML preview (`preview` — it also had `allow-same-origin`: an agent-written page ran AS THE APP), an
// .eml's HTML body (`eml`) and a Word document's embedded HTML part (`docx`). Every page-made frame for foreign HTML
// navigates here; `allow-same-origin` on one is banned (test-csp-report ⑧'s census).
//   · THE HANDSHAKE (the client half: src/lib/frame-host.js writeFrame): the parent posts `{vsFrameDoc: 1, html}` on the
//     host's load; the host's ONE inline script takes it from its PARENT only (never when unframed), ONCE, and writes it
//     with document.open / write / close — the written document keeps the host's policy (and adds its own meta, if any).
//     The writers stay the two builders (design-canvas-model.js frameSrcdoc / printSrcdoc / printAllSrcdoc over the
//     hub's inlined artboards; mail-frame.js composeSrcdoc); each builder alone knows its kind's address.
//   · ALWAYS AN OPAQUE ORIGIN: every kind's header starts with `sandbox` (the CSP directive), so even opened top-level or
//     framed without a sandbox attribute the host is never the app's origin (measured: origin 'null', no cookie, no
//     storage) — the iframe's own `sandbox` attribute narrows it further (allow-scripts only on the canvas and the mail
//     frame; + allow-modals for print). `frame-ancestors 'self'`: only the app frames it (measured: another origin's
//     frame is refused). The document lives HERE, never in public/ — express.static would serve it with no header, a
//     same-origin writer.
//   · design = a published page's rule (src/server/published-pages.js CSP: the sandbox and nothing else): an artboard is
//     agent-written HTML whose inline scripts, handlers, eval and https:// assets must run as they do when published
//     (docs/agent/design-manual.md §1). No hash list: every hash would be the agent's own script, and the wall is the
//     opaque sandbox, not the script list.
//   · mail = the mail frame's OWN strict policy (mail-frame.js cspFor — `default-src 'none'`, the per-document nonce
//     from the address, `https:` pictures only after the press) + the host's script by hash. The document keeps its
//     `<meta>` copy: both enforce, and they are the same rules — the header adds the sandbox, the ancestors and the hash.
//   · preview = the code editor's HTML preview (lane frame-host-preview): a page an agent — or a cloned repo — wrote,
//     shown as it would run, but NEVER as the app: the sandbox without `allow-same-origin` (an opaque origin: no
//     cookie, no storage, no API — measured), `default-src 'none'` and back only what a previewed page needs (measured
//     over the repo's own docs/**/*.html and the 450 .html files on the lane's box: inline scripts and styles in all of
//     them, sibling .css / .js / pictures in the repo's mockups — a module script among them — and https:// libraries,
//     fonts and pictures in about half of the box's): its own inline scripts, eval, styles, data: / blob: pictures,
//     https:, and ITS FOLDER through the host (below). Nothing else of the hub's: no `'self'`.
//   · THE PREVIEW'S FOLDER (the brief: «a `base` query bound to the file's folder, judged server-side»). A subresource
//     request from an opaque frame carries NO cookie (measured: Sec-Fetch-Site cross-site, no Cookie — SameSite=Lax), so
//     the old `<base href="/api/file/serve/<dir>/">` cannot work without `allow-same-origin`. `?kind=preview&base=<dir>`
//     is judged on the SIGNED-IN navigation (the cookie rides that one): an absolute local folder that answers (the
//     mount door, then SafeFs) is given a FOLDER TOKEN (24 random characters, idle 30 min, at most 256) and the frame is
//     redirected to `/frame-host/f/<token>/` — the host document at the FOLDER's address, so the written page's
//     relative URLs resolve inside it (document.open keeps the document's URL, measured). `GET /frame-host/f/<token>/…`
//     is a DOOR (src/auth.js — the token is the credential): a file under the folder only — no `..`, no dot-name
//     segment (.env, .git), no symlink out of it (its real path is judged), a web file's extension only — served with
//     the preview policy (a sibling page the preview navigates to is sandboxed the same way) and
//     `Access-Control-Allow-Origin: *` (a module script, a font and fetch() from the opaque frame are CORS requests,
//     measured). The policy names the folder by its full address (`<origin>/frame-host/f/<token>/`), never `'self'`.
//   · eml / docx = NOTHING RUNS: the host's own line runs by a NONCE made for that one response (never a hash a copied
//     line could match), so no script of the document can (measured: an inline script, a handler, a byte-exact copy of
//     the host's line — all blocked). The rest is the mail frame's own policy (`MF.cspFor`: no network, data: pictures —
//     https: ones only with `pictures=1`, the mail rule). The iframe's `sandbox` attribute carries `allow-scripts` for
//     that line alone (a sandbox WITHOUT it would stop the host from taking the document).
//   · NO report-uri on any: what a frame's policy blocks is the sandbox doing its job (a mail's trackers), and the app
//     page's count stays the app page's.
//   · Behind the sign-in gate like every read (measured: the frame's navigation carries the cookie, same-origin) — but
//     the preview's folder, the door above.

const crypto = require('crypto');
const path = require('path');
const MF = require('../mail-frame.js');
const DOOR = require('../mount-door'); // B-afc4: the blocked-path door — asked BEFORE a user-path read
const { ownOriginOf } = require('../write-origin.js');
const { runOp: runOpInline } = require('../safe-fs-worker');

/** The host's ONE script: the document from its parent, once, written in place. */
const HOST_JS = "(function(){var done=false;addEventListener('message',function(e){if(done||e.source!==parent||parent===window)return;var d=e.data;if(!d||d.vsFrameDoc!==1||typeof d.html!=='string')return;done=true;document.open();document.write(d.html);document.close();});})();";
const HOST_HASH = `'sha256-${crypto.createHash('sha256').update(HOST_JS).digest('base64')}'`;
const HOST_DOC = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><script>${HOST_JS}</script></head><body></body></html>`;
const ANCESTORS = "frame-ancestors 'self'";
const NONCE_MAX = 64;
const KINDS = Object.freeze(['design', 'mail', 'preview', 'eml', 'docx']);
/** The kinds whose document runs NOTHING — the host's line alone, by this response's nonce. */
const QUIET = Object.freeze(['eml', 'docx']);
/** The preview's folder: the token's alphabet + length, its idle life, how many live at once. */
const FOLDER_TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;
const FOLDER_IDLE_MS = 30 * 60 * 1000;
const FOLDER_CAP = 256;
/** What the folder serves: a web page's own files (never a key, a database, a file without an extension). */
const FOLDER_EXTS = Object.freeze(['html', 'htm', 'css', 'js', 'mjs', 'json', 'map', 'wasm', 'txt', 'csv', 'md', 'xml', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'webm', 'ogg', 'oga', 'ogv', 'wav', 'm4a', 'mov', 'glb', 'gltf']);
const FOLDER_PATH = '/frame-host/f/';

/** The preview's policy; `folder` = its folder's full address (`<origin>/frame-host/f/<token>/`) or ''. */
function previewPolicy(folder = '') {
  const f = /^https?:\/\/[^\s;,']+\/frame-host\/f\/[A-Za-z0-9_-]{24}\/$/.test(String(folder)) ? ` ${folder}` : '';
  return `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'${f} https:; style-src 'unsafe-inline'${f} https:; img-src data: blob:${f} https:; font-src data:${f} https:; media-src data: blob:${f} https:; connect-src${f} https:; base-uri 'none'; form-action 'none'; ${ANCESTORS}`;
}

/** The header for one request's query → the policy, or null (no such kind). `nonce` = a QUIET kind's host nonce (this
 *  response's), `folder` = the preview's folder address. */
function policyFor(q = {}, { nonce = '', folder = '' } = {}) {
  const kind = typeof q.kind === 'string' ? q.kind : '';
  if (kind === 'design') return `sandbox allow-scripts allow-modals; ${ANCESTORS}`;
  if (kind === 'mail') {
    const n = typeof q.n === 'string' ? q.n.slice(0, NONCE_MAX) : '';
    return `sandbox allow-scripts; ${MF.cspFor({ pictures: q.pictures === '1', nonce: n, host: HOST_HASH })}; ${ANCESTORS}`;
  }
  if (kind === 'preview') return previewPolicy(folder);
  if (QUIET.includes(kind)) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(nonce))) return null; // never a quiet host without its own nonce
    return `sandbox allow-scripts; ${MF.cspFor({ pictures: kind === 'eml' && q.pictures === '1', nonce })}; ${ANCESTORS}`;
  }
  return null;
}
/** The host document a response sends: the quiet kinds' carries this response's nonce on its one script. */
function hostDocFor(nonce = '') {
  return nonce ? HOST_DOC.replace('<script>', `<script nonce="${nonce}">`) : HOST_DOC;
}

// ── the preview's folders: token → { dir (its real path), at } — insertion order = least recently used first ──
const folders = new Map();
function folderOf(tok, now = Date.now()) {
  if (typeof tok !== 'string' || !FOLDER_TOKEN_RE.test(tok)) return null;
  const r = folders.get(tok);
  if (!r) return null;
  folders.delete(tok);
  if (now - r.at > FOLDER_IDLE_MS) return null;
  r.at = now; folders.set(tok, r);
  return r;
}
function mintFolder(dir, now = Date.now()) {
  for (const [t, r] of folders) if (r.dir === dir && now - r.at <= FOLDER_IDLE_MS) { folderOf(t, now); return t; }
  const tok = crypto.randomBytes(18).toString('base64url');
  folders.set(tok, { dir, at: now });
  while (folders.size > FOLDER_CAP) folders.delete(folders.keys().next().value);
  return tok;
}
const inside = (p, dir) => p === dir || p.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);
/** A relative path under the folder → its verdict: { rel } (a web file's path, dot-name free) or { why }. */
function folderPathVerdict(rel) {
  const r = String(rel == null ? '' : rel);
  if (!r || r.length > 1024 || r.includes('\0')) return { why: 'no-name' };
  const segs = r.split('/');
  if (segs.some((x) => x === '' || x === '.' || x === '..' || x.startsWith('.'))) return { why: 'dot-or-empty-segment' };
  const ext = (/\.([A-Za-z0-9]{1,8})$/.exec(segs[segs.length - 1]) || [])[1];
  if (!ext || !FOLDER_EXTS.includes(ext.toLowerCase())) return { why: 'not-a-web-file' };
  return { rel: segs.join('/') };
}
const sfsOf = (req) => (req.app && req.app.locals && req.app.locals.safeFs) || { call: async (op, payload) => runOpInline(op, payload).result }; // the pool (server.js) — else the same op in-main
/** The folder a `base` names, as its real path — or '' (not absolute, blocked, not a folder, unreadable). */
async function judgeBase(req, base) {
  if (typeof base !== 'string' || !base.startsWith('/') || base.length > 4096 || base.includes('\0')) return '';
  const abs = path.resolve(base);
  if (DOOR.blocked(abs)) return '';
  try {
    const safeFs = sfsOf(req);
    const real = (await safeFs.call('realpath', { path: abs }, { timeoutMs: 8000 })).path;
    return (await safeFs.call('stat', { path: real }, { timeoutMs: 8000 })).isDirectory ? real : '';
  } catch { return ''; }
}
const folderAddress = (req, tok) => { const own = ownOriginOf(req.headers, { encrypted: !!(req.socket && req.socket.encrypted) }); return own ? `${own}${FOLDER_PATH}${tok}/` : ''; };
const HOST_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

function register(app) {
  app.get('/frame-host', async (req, res) => {
    if (req.query.kind === 'preview' && req.query.base != null) { // the folder, judged on the SIGNED-IN navigation
      const dir = await judgeBase(req, req.query.base);
      if (dir) return res.set('Cache-Control', 'no-store').redirect(302, `${FOLDER_PATH}${mintFolder(dir)}/`);
    }
    const nonce = QUIET.includes(req.query.kind) ? crypto.randomBytes(18).toString('base64url') : '';
    const policy = policyFor(req.query, { nonce });
    if (!policy) return res.status(404).type('text/plain').send('no such frame kind');
    res.set({ ...HOST_HEADERS, 'Content-Security-Policy': policy });
    res.send(hostDocFor(nonce));
  });
  // THE PREVIEW'S FOLDER — a DOOR (src/auth.js): no cookie rides an opaque frame's requests; the token is the credential
  app.get(`${FOLDER_PATH}:tok/*`, async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); // the opaque frame's module scripts, fonts and fetch() are CORS requests — a refusal is its 404 too
    const f = folderOf(req.params.tok);
    if (!f) return res.status(404).type('text/plain').send('no such folder');
    const own = folderAddress(req, req.params.tok);
    const policy = previewPolicy(own);
    if (!req.params[0]) { res.set({ ...HOST_HEADERS, 'Content-Security-Policy': policy }); return res.send(HOST_DOC); }
    const v = folderPathVerdict(req.params[0]);
    if (!v.rel) return res.status(404).type('text/plain').send('not in the folder');
    const abs = path.resolve(f.dir, v.rel);
    if (!inside(abs, f.dir)) return res.status(404).type('text/plain').send('not in the folder');
    if (DOOR.blocked(abs)) return res.status(503).type('text/plain').send(DOOR.SENTENCE);
    let real = '';
    try {
      const safeFs = sfsOf(req);
      real = (await safeFs.call('realpath', { path: abs }, { timeoutMs: 8000 })).path;
      if (!inside(real, f.dir) || !(await safeFs.call('stat', { path: real }, { timeoutMs: 8000 })).isFile) real = '';
    } catch (e) { if (e && e.status === 503) return res.status(503).type('text/plain').send('Storage not responding — try again in a moment.'); real = ''; }
    if (!real) return res.status(404).type('text/plain').send('not in the folder');
    res.sendFile(path.relative(f.dir, real), { root: f.dir, dotfiles: 'deny', headers: { 'Content-Security-Policy': policy, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } }, (err) => { if (err && !res.headersSent) res.status(404).type('text/plain').send('not in the folder'); });
  });
}

module.exports = { register, policyFor, previewPolicy, hostDocFor, folderPathVerdict, mintFolder, folderOf, HOST_JS, HOST_HASH, HOST_DOC, KINDS, QUIET, NONCE_MAX, FOLDER_EXTS, FOLDER_IDLE_MS, FOLDER_CAP, FOLDER_PATH };

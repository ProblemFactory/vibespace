'use strict';
// Published pages — VibeSpace-hosted shareable HTML (2.364.0, owner request
// "接管 artifact 的部分": the /design canvas skill publishes to claude.ai
// artifacts, which the owner could not share outward; the canvas HTML is a
// self-contained local file, so the instance can host it itself).
//
// Model mirrors the 2.359.0 path-mount lock: every page is PRIVATE by default
// (VibeSpace login = the only gate), a per-page `public` flag opens it to
// anyone with the link. Serving is snapshot-based: publish COPIES the source
// file into data/published-pages/<id>.html — a later "publish" of the same
// source path UPSERTS the same id (stable share URL across design iterations).
//
// SECURITY (load-bearing, do not weaken): pages are arbitrary user HTML with
// scripts, served from the APP ORIGIN. Every /p response carries
// `Content-Security-Policy: sandbox allow-scripts …` — the sandbox directive
// gives the document an OPAQUE origin: no cookies, no same-origin /api reach,
// no frame-ancestor escape. Without that header this feature would be stored
// XSS against the owner's own session. The canvas payload's own nested
// preview iframes keep working (postMessage-only by design).
const fs = require('fs');
const path = require('path');

const ID_RE = /^pg[a-z0-9]{10}$/;
const MAX_BYTES = 25 * 1024 * 1024;
const CSP = "sandbox allow-scripts allow-popups allow-downloads allow-modals allow-forms";

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// COMPAT PRELUDE (2.366.1) — two browser capabilities a hosted page cannot
// assume, both measured against a real canvas on a real LAN address:
//
// 1. crypto.randomUUID EXISTS ONLY IN A SECURE CONTEXT. VibeSpace is normally
//    reached over plain http on a hostname/LAN IP/Tailscale address, which is
//    NOT potentially-trustworthy — so randomUUID is undefined there, and the
//    canvas editor (which mints ids with it) hangs every artboard on
//    "Loading artboard…" forever. It worked only over 127.0.0.1, which Chrome
//    treats as trustworthy — which is exactly why testing on loopback proved
//    nothing (owner: "你用的是你发给我的链接访问的吗？"). getRandomValues has no
//    such gate, so the polyfill is a real v4 UUID, not a Math.random stand-in.
// 2. An opaque-origin document (our sandbox CSP) THROWS on localStorage /
//    sessionStorage access. The editor reads UI prefs during render, so every
//    boot logged a SecurityError storm. Hosted pages are view-only, so an
//    in-memory store is the honest equivalent.
//
// Injected at serve time — the stored snapshot stays byte-faithful — and only
// where the capability is genuinely missing, so a page opened over https (or
// on loopback) still uses the browser's own implementations.
const COMPAT_PRELUDE = `<script>(function(){function mk(){var m={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(m,String(k))?m[String(k)]:null},setItem:function(k,v){m[String(k)]=String(v)},removeItem:function(k){delete m[String(k)]},clear:function(){m={}},key:function(i){var ks=Object.keys(m);return i<ks.length?ks[i]:null},get length(){return Object.keys(m).length}}}['localStorage','sessionStorage'].forEach(function(n){var ok=false;try{window[n].getItem('__vs');ok=true}catch(e){}if(!ok){try{Object.defineProperty(window,n,{value:mk(),configurable:true})}catch(e){}}});try{if(window.crypto&&typeof crypto.getRandomValues==='function'&&typeof crypto.randomUUID!=='function'){var g=function(){var b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=[];for(var i=0;i<16;i++){h.push((b[i]+256).toString(16).slice(1))}return h[0]+h[1]+h[2]+h[3]+'-'+h[4]+h[5]+'-'+h[6]+h[7]+'-'+h[8]+h[9]+'-'+h[10]+h[11]+h[12]+h[13]+h[14]+h[15]};Object.defineProperty(crypto,'randomUUID',{value:g,configurable:true,writable:true})}}catch(e){}})();</script>`;
const STORAGE_SHIM = COMPAT_PRELUDE; // pre-2.366.1 name

/** Put the prelude FIRST so it runs before any of the page's own scripts. */
function injectShim(buf) {
  const head = buf.indexOf('<head');
  const close = head < 0 ? -1 : buf.indexOf('>', head);
  if (close < 0) return Buffer.concat([Buffer.from(COMPAT_PRELUDE), buf]);
  return Buffer.concat([buf.subarray(0, close + 1), Buffer.from(COMPAT_PRELUDE), buf.subarray(close + 1)]);
}

function writeJsonAtomic(file, obj) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(obj, null, 2));
  fs.renameSync(file + '.tmp', file);
}

function create({ dataDir, requestAuthed = () => true, publicUrl = () => null, log = () => { }, onPublished = null }) {
  const storeFile = path.join(dataDir, 'published-pages.json');
  const pagesDir = path.join(dataDir, 'published-pages');
  let store = { pages: [] };
  let shimCache = { key: null, buf: null }; // one transformed copy per snapshot
  try { store = JSON.parse(fs.readFileSync(storeFile, 'utf-8')) || { pages: [] }; } catch { }
  if (!Array.isArray(store.pages)) store.pages = [];
  // srcKey (2.366.0): the upsert identity. File publishes are `local:<abs>`;
  // agent uploads are `<host|local>:<abs path on that machine>` — the same
  // design re-published from the same working file keeps its URL anywhere.
  for (const p of store.pages) if (!p.srcKey && p.srcPath) p.srcKey = 'local:' + p.srcPath;
  const save = () => { try { writeJsonAtomic(storeFile, store); } catch (e) { log('[pages] store save failed:', e.message); } };
  const mintId = () => 'pg' + Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  // An absolute share URL needs an origin the server does NOT know by itself.
  // Exactly two sources are legitimate:
  //   1. agentd.publicUrl — the address the OWNER declared for this instance;
  //   2. the Host of the request ASKING for the URL — correct only because
  //      that same browser is the one that will open/copy it.
  // NEVER a remembered origin: 2.366.0 stored "the last browser origin" and
  // handed it to an AGENT, which put `http://<this box's hostname>:3456/p/…`
  // in a chat reply — that hostname is a 127.0.1.1 /etc/hosts entry, so it
  // resolved here and nowhere else, and the owner got "can't load" on their
  // own laptop. A stored origin is a guess about a device that is not asking.
  // With no request and no publicUrl the honest answer is the RELATIVE path;
  // browsers join it with location.origin, and the CLI says so out loud.
  const originOf = (req) => {
    try {
      if (!req) return '';
      const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      if (!host || !/^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9][A-Za-z0-9.\-]*)(:\d{1,5})?$/.test(host) || !/^https?$/.test(proto)) return '';
      return `${proto}://${host}`;
    } catch { return ''; }
  };
  const urlFor = (id, req) => {
    const base = String(publicUrl() || originOf(req) || '').replace(/\/+$/, '');
    return base + '/p/' + id;
  };

  const pub = (p, req) => ({ id: p.id, name: p.name, srcPath: p.srcPath, srcKey: p.srcKey, public: !!p.public, size: p.size, createdAt: p.createdAt, updatedAt: p.updatedAt, url: urlFor(p.id, req), path: '/p/' + p.id, sessionId: p.sessionId || null, conversationId: p.conversationId || null });
  const notify = (page, extra) => { try { onPublished && onPublished(page, extra || {}); } catch (e) { log('[pages] onPublished failed:', e.message); } };

  /** Copy-in publish; upserts by srcPath so a re-published design keeps its
   *  share URL. Returns the public record or {error}. */
  function publish({ srcPath, name, makePublic, req }) {
    const abs = path.resolve(String(srcPath || ''));
    let st;
    try { st = fs.statSync(abs); } catch { return { error: 'file not found: ' + abs }; }
    if (!st.isFile()) return { error: 'not a file: ' + abs };
    if (st.size > MAX_BYTES) return { error: `file too large (${Math.round(st.size / 1024 / 1024)}MB > ${MAX_BYTES / 1024 / 1024}MB)` };
    if (!/\.html?$/i.test(abs)) return { error: 'only .html pages can be published' };
    const srcKey = 'local:' + abs;
    let rec = store.pages.find((p) => p.srcKey === srcKey);
    const replaced = !!rec; // decided BEFORE the upsert (rec === draft afterwards — review-caught)
    const draft = rec || { id: mintId(), srcPath: abs, srcKey, public: false, createdAt: Date.now() };
    // snapshot FIRST — a failed copy must not mutate flags/store (a broken
    // republish otherwise flipped a private page public; review-caught)
    try {
      fs.mkdirSync(pagesDir, { recursive: true });
      fs.copyFileSync(abs, path.join(pagesDir, draft.id + '.html'));
    } catch (e) { return { error: 'copy failed: ' + e.message }; }
    if (!rec) { rec = draft; store.pages.push(rec); }
    rec.name = String(name || rec.name || path.basename(abs, path.extname(abs))).slice(0, 120);
    if (makePublic !== undefined) rec.public = !!makePublic;
    rec.size = st.size;
    rec.updatedAt = Date.now();
    save();
    notify(pub(rec), { replaced });
    return { page: { ...pub(rec, req), replaced } };
  }

  /** Content upload publish (agent CLI / remote hosts, 2.366.0): the HTML
   *  arrives in the request — the source file may live on another machine.
   *  Upserts by srcKey; attributes the page to the publishing session. */
  function publishContent({ html, name, srcKey, makePublic, sessionId = null, conversationId = null, req = null }) {
    const buf = Buffer.isBuffer(html) ? html : Buffer.from(String(html || ''), 'utf8');
    if (!buf.length) return { error: 'empty page body' };
    if (buf.length > MAX_BYTES) return { error: `page too large (${Math.round(buf.length / 1024 / 1024)}MB > ${MAX_BYTES / 1024 / 1024}MB)` };
    const key = String(srcKey || '').slice(0, 1024);
    if (!key) return { error: 'missing srcKey' };
    let rec = store.pages.find((p) => p.srcKey === key);
    const replaced = !!rec;
    const draft = rec || { id: mintId(), srcKey: key, srcPath: key.replace(/^[^:]*:/, ''), public: false, createdAt: Date.now() };
    try {
      fs.mkdirSync(pagesDir, { recursive: true });
      const fp = path.join(pagesDir, draft.id + '.html');
      fs.writeFileSync(fp + '.tmp', buf); fs.renameSync(fp + '.tmp', fp);
    } catch (e) { return { error: 'store failed: ' + e.message }; }
    if (!rec) { rec = draft; store.pages.push(rec); }
    rec.name = String(name || rec.name || path.basename(rec.srcPath || 'page', path.extname(rec.srcPath || ''))).slice(0, 120);
    if (makePublic !== undefined) rec.public = !!makePublic;
    rec.size = buf.length;
    rec.updatedAt = Date.now();
    if (sessionId) rec.sessionId = sessionId;
    if (conversationId) rec.conversationId = conversationId;
    save();
    notify(pub(rec), { replaced });
    return { page: { ...pub(rec, req), replaced } };
  }

  function setFlags(id, { makePublic, name, req }) {
    const rec = store.pages.find((p) => p.id === id);
    if (!rec) return { error: 'no such page' };
    if (makePublic !== undefined) rec.public = !!makePublic;
    if (name !== undefined) rec.name = String(name).slice(0, 120);
    rec.updatedAt = Date.now();
    save();
    notify(pub(rec), { changed: 'flags' }); // visibility/name changes reach every client (multi-client law)
    return { page: pub(rec, req) };
  }

  function remove(id) {
    const i = store.pages.findIndex((p) => p.id === id);
    if (i < 0) return { error: 'no such page' };
    const [rec] = store.pages.splice(i, 1);
    const snap = { ...pub(rec), removed: true };
    try { fs.unlinkSync(path.join(pagesDir, rec.id + '.html')); } catch { }
    save();
    notify(snap, { removed: true }); // an unpublished page must leave every client's list
    return { ok: true };
  }

  const list = ({ sessionId, conversationId, req } = {}) => store.pages
    .filter((p) => (!sessionId && !conversationId) || (sessionId && p.sessionId === sessionId) || (conversationId && p.conversationId === conversationId))
    .map((p) => pub(p, req));
  // by LOCAL path = srcKey 'local:<abs>' — a remote host's page for the same absolute path is a different page (review-caught: identical home layouts across hosts)
  const bySrcPath = (p, req) => { const key = 'local:' + path.resolve(String(p || '')); const rec = store.pages.find((r) => r.srcKey === key); return rec ? pub(rec, req) : null; };

  /** Gate + record lookup shared by the shell and the raw content. */
  function gate(req, res) {
    const id = String(req.params.id || '');
    if (!ID_RE.test(id)) { res.status(404).send('not found'); return null; }
    const rec = store.pages.find((p) => p.id === id);
    if (!rec) { res.status(404).send('not found'); return null; }
    if (!rec.public && !requestAuthed(req)) {
      // browsers get the login form (mirrors auth.js), not a dead-end 401
      const wantsHtml = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
      if (wantsHtml) res.redirect('/login');
      else res.status(401).send('this page requires a VibeSpace login (it is not public)');
      return null;
    }
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', rec.public ? 'no-cache' : 'no-store');
    return rec;
  }

  /** GET /p/:id — the SHELL (2.366.1). It carries NO user content: a
   *  full-viewport iframe of /p/:id/raw, where the published HTML runs
   *  sandboxed exactly as before.
   *
   *  WHY. Until 2.366.1 the published HTML WAS the top-level document, so the
   *  sandbox CSP gave that document an OPAQUE origin — and everything a
   *  browser ties to an origin broke in the user's face: the canvas editor's
   *  localStorage reads threw SecurityError on every boot, and extensions that
   *  postMessage into the page died on targetOrigin 'null' (owner: "打开后无法
   *  加载" — two different error storms, one cause). Framing keeps the
   *  isolation IDENTICAL (the content still runs under the same sandbox CSP,
   *  opaque origin, no cookies, no same-origin reach into /api) while the
   *  top-level document — the thing the browser and its extensions talk to —
   *  is our own trivial HTML on the real origin. NEVER add allow-same-origin
   *  to the iframe and never drop the CSP on the raw route: either hands the
   *  app origin to arbitrary user HTML. */
  function serve(req, res) {
    const rec = gate(req, res);
    if (!rec) return;
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    res.type('html');
    const title = escapeHtml(rec.name || 'Published page');
    res.send('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + title + '</title>'
      + '<style>html,body{margin:0;height:100%;background:#faf9f5}iframe{border:0;display:block;width:100%;height:100%}</style></head>'
      + '<body><iframe src="/p/' + rec.id + '/raw" sandbox="allow-scripts allow-popups allow-downloads allow-modals allow-forms allow-popups-to-escape-sandbox" allow="clipboard-write" title="' + title + '"></iframe></body></html>');
  }

  /** GET /p/:id/raw — the published HTML itself: sandbox CSP (opaque origin)
   *  + the storage shim. Directly reachable on purpose — the protection is
   *  the header, not the framing. */
  function serveRaw(req, res) {
    const rec = gate(req, res);
    if (!rec) return;
    const fp = path.join(pagesDir, rec.id + '.html');
    let st;
    try { st = fs.statSync(fp); } catch { return res.status(410).send('page content missing — republish it'); }
    res.setHeader('Content-Security-Policy', CSP);
    res.type('html');
    const key = rec.id + ':' + st.mtimeMs + ':' + st.size;
    if (shimCache.key !== key) {
      try { shimCache = { key, buf: injectShim(fs.readFileSync(fp)) }; }
      catch (e) { log('[pages] shim injection failed:', e.message); return res.sendFile(fp); }
    }
    res.send(shimCache.buf);
  }

  /** All routes in one place — /p/:id (self-gated, middleware-exempt) plus
   *  the cookie-authed /api/pages management family. */
  function registerRoutes(app) {
    app.get('/p/:id', serve);
    app.get('/p/:id/raw', serveRaw);
    app.get('/api/pages', (req, res) => (res.json({ pages: list({ sessionId: req.query.sessionId ? String(req.query.sessionId) : undefined, conversationId: req.query.conversationId ? String(req.query.conversationId) : undefined, req }) })));
    app.get('/api/pages/by-path', (req, res) => res.json({ page: bySrcPath(String(req.query.path || ''), req) }));
    app.post('/api/pages/publish', (req, res) => {
      const b = req.body || {};
      const r = publish({ srcPath: b.path, name: b.name, makePublic: b.public, req });
      if (r.error) return res.status(400).json(r);
      res.json(r);
    });
    app.post('/api/pages/:id', (req, res) => {
      const b = req.body || {};
      const r = setFlags(String(req.params.id), { makePublic: b.public, name: b.name, req });
      if (r.error) return res.status(404).json(r);
      res.json(r);
    });
    app.delete('/api/pages/:id', (req, res) => {
      const r = remove(String(req.params.id));
      if (r.error) return res.status(404).json(r);
      res.json(r);
    });
  }

  return { publish, publishContent, setFlags, remove, list, bySrcPath, serve, serveRaw, urlFor, originOf, registerRoutes, STORAGE_SHIM, injectShim };
}

module.exports = { create, injectShim, COMPAT_PRELUDE, STORAGE_SHIM };

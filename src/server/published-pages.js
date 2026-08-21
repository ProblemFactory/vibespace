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

function writeJsonAtomic(file, obj) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(obj, null, 2));
  fs.renameSync(file + '.tmp', file);
}

function create({ dataDir, requestAuthed = () => true, publicUrl = () => null, log = () => { }, onPublished = null }) {
  const storeFile = path.join(dataDir, 'published-pages.json');
  const pagesDir = path.join(dataDir, 'published-pages');
  let store = { pages: [] };
  try { store = JSON.parse(fs.readFileSync(storeFile, 'utf-8')) || { pages: [] }; } catch { }
  if (!Array.isArray(store.pages)) store.pages = [];
  // srcKey (2.366.0): the upsert identity. File publishes are `local:<abs>`;
  // agent uploads are `<host|local>:<abs path on that machine>` — the same
  // design re-published from the same working file keeps its URL anywhere.
  for (const p of store.pages) if (!p.srcKey && p.srcPath) p.srcKey = 'local:' + p.srcPath;
  const save = () => { try { writeJsonAtomic(storeFile, store); } catch (e) { log('[pages] store save failed:', e.message); } };
  const mintId = () => 'pg' + Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  // Absolute share URLs need an origin the server cannot know by itself:
  // agentd.publicUrl when set, else the origin the user's BROWSER last used
  // (noted on every management call — the status-bar popover hits one before
  // any agent publishes). Relative '/p/<id>' is the honest last resort; the
  // client joins it with location.origin.
  const urlFor = (id) => {
    const base = String(publicUrl() || store.lastBrowserOrigin || '').replace(/\/+$/, '');
    return (base ? base : '') + '/p/' + id;
  };
  function noteBrowserOrigin(req) {
    try {
      const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      // only a plausible host[:port] — never a path, scheme or junk (the value ends up in share links)
      if (!host || !/^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9][A-Za-z0-9.\-]*)(:\d{1,5})?$/.test(host) || !/^https?$/.test(proto)) return;
      const origin = `${proto}://${host}`;
      if (store.lastBrowserOrigin !== origin) { store.lastBrowserOrigin = origin; save(); }
    } catch { }
  }
  const pub = (p) => ({ id: p.id, name: p.name, srcPath: p.srcPath, srcKey: p.srcKey, public: !!p.public, size: p.size, createdAt: p.createdAt, updatedAt: p.updatedAt, url: urlFor(p.id), path: '/p/' + p.id, sessionId: p.sessionId || null, conversationId: p.conversationId || null });
  const notify = (page, extra) => { try { onPublished && onPublished(page, extra || {}); } catch (e) { log('[pages] onPublished failed:', e.message); } };

  /** Copy-in publish; upserts by srcPath so a re-published design keeps its
   *  share URL. Returns the public record or {error}. */
  function publish({ srcPath, name, makePublic }) {
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
    return { page: { ...pub(rec), replaced } };
  }

  /** Content upload publish (agent CLI / remote hosts, 2.366.0): the HTML
   *  arrives in the request — the source file may live on another machine.
   *  Upserts by srcKey; attributes the page to the publishing session. */
  function publishContent({ html, name, srcKey, makePublic, sessionId = null, conversationId = null }) {
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
    return { page: { ...pub(rec), replaced } };
  }

  function setFlags(id, { makePublic, name }) {
    const rec = store.pages.find((p) => p.id === id);
    if (!rec) return { error: 'no such page' };
    if (makePublic !== undefined) rec.public = !!makePublic;
    if (name !== undefined) rec.name = String(name).slice(0, 120);
    rec.updatedAt = Date.now();
    save();
    notify(pub(rec), { changed: 'flags' }); // visibility/name changes reach every client (multi-client law)
    return { page: pub(rec) };
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

  const list = ({ sessionId, conversationId } = {}) => store.pages
    .filter((p) => (!sessionId && !conversationId) || (sessionId && p.sessionId === sessionId) || (conversationId && p.conversationId === conversationId))
    .map(pub);
  // by LOCAL path = srcKey 'local:<abs>' — a remote host's page for the same absolute path is a different page (review-caught: identical home layouts across hosts)
  const bySrcPath = (p) => { const key = 'local:' + path.resolve(String(p || '')); const rec = store.pages.find((r) => r.srcKey === key); return rec ? pub(rec) : null; };

  /** GET /p/:id — the ONLY render path. Mounted with an auth exemption; the
   *  gate lives HERE (private ⇒ cookie required), same doctrine as /svc. */
  function serve(req, res) {
    const id = String(req.params.id || '');
    if (!ID_RE.test(id)) return res.status(404).send('not found');
    const rec = store.pages.find((p) => p.id === id);
    if (!rec) return res.status(404).send('not found');
    if (!rec.public && !requestAuthed(req)) {
      // browsers get the login form (mirrors auth.js), not a dead-end 401
      const wantsHtml = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
      if (wantsHtml) return res.redirect('/login');
      return res.status(401).send('this page requires a VibeSpace login (it is not public)');
    }
    const fp = path.join(pagesDir, rec.id + '.html');
    if (!fs.existsSync(fp)) return res.status(410).send('page content missing — republish it');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', rec.public ? 'no-cache' : 'no-store');
    res.type('html');
    res.sendFile(fp);
  }

  /** All routes in one place — /p/:id (self-gated, middleware-exempt) plus
   *  the cookie-authed /api/pages management family. */
  function registerRoutes(app) {
    app.get('/p/:id', serve);
    app.get('/api/pages', (req, res) => { noteBrowserOrigin(req); res.json({ pages: list({ sessionId: req.query.sessionId ? String(req.query.sessionId) : undefined, conversationId: req.query.conversationId ? String(req.query.conversationId) : undefined }) }); });
    app.get('/api/pages/by-path', (req, res) => { noteBrowserOrigin(req); res.json({ page: bySrcPath(String(req.query.path || '')) }); });
    app.post('/api/pages/publish', (req, res) => {
      noteBrowserOrigin(req);
      const b = req.body || {};
      const r = publish({ srcPath: b.path, name: b.name, makePublic: b.public });
      if (r.error) return res.status(400).json(r);
      res.json(r);
    });
    app.post('/api/pages/:id', (req, res) => {
      noteBrowserOrigin(req);
      const b = req.body || {};
      const r = setFlags(String(req.params.id), { makePublic: b.public, name: b.name });
      if (r.error) return res.status(404).json(r);
      res.json(r);
    });
    app.delete('/api/pages/:id', (req, res) => {
      const r = remove(String(req.params.id));
      if (r.error) return res.status(404).json(r);
      res.json(r);
    });
  }

  return { publish, publishContent, setFlags, remove, list, bySrcPath, serve, urlFor, registerRoutes, noteBrowserOrigin };
}

module.exports = { create };

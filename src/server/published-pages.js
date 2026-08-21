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

function create({ dataDir, requestAuthed = () => true, publicUrl = () => null, log = () => { } }) {
  const storeFile = path.join(dataDir, 'published-pages.json');
  const pagesDir = path.join(dataDir, 'published-pages');
  let store = { pages: [] };
  try { store = JSON.parse(fs.readFileSync(storeFile, 'utf-8')) || { pages: [] }; } catch { }
  if (!Array.isArray(store.pages)) store.pages = [];
  const save = () => { try { writeJsonAtomic(storeFile, store); } catch (e) { log('[pages] store save failed:', e.message); } };
  const mintId = () => 'pg' + Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  const urlFor = (id) => {
    const base = String(publicUrl() || '').replace(/\/+$/, '');
    return (base ? base : '') + '/p/' + id;
  };
  const pub = (p) => ({ id: p.id, name: p.name, srcPath: p.srcPath, public: !!p.public, size: p.size, createdAt: p.createdAt, updatedAt: p.updatedAt, url: urlFor(p.id) });

  /** Copy-in publish; upserts by srcPath so a re-published design keeps its
   *  share URL. Returns the public record or {error}. */
  function publish({ srcPath, name, makePublic }) {
    const abs = path.resolve(String(srcPath || ''));
    let st;
    try { st = fs.statSync(abs); } catch { return { error: 'file not found: ' + abs }; }
    if (!st.isFile()) return { error: 'not a file: ' + abs };
    if (st.size > MAX_BYTES) return { error: `file too large (${Math.round(st.size / 1024 / 1024)}MB > ${MAX_BYTES / 1024 / 1024}MB)` };
    if (!/\.html?$/i.test(abs)) return { error: 'only .html pages can be published' };
    let rec = store.pages.find((p) => p.srcPath === abs);
    const draft = rec || { id: mintId(), srcPath: abs, public: false, createdAt: Date.now() };
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
    return { page: pub(rec) };
  }

  function setFlags(id, { makePublic, name }) {
    const rec = store.pages.find((p) => p.id === id);
    if (!rec) return { error: 'no such page' };
    if (makePublic !== undefined) rec.public = !!makePublic;
    if (name !== undefined) rec.name = String(name).slice(0, 120);
    rec.updatedAt = Date.now();
    save();
    return { page: pub(rec) };
  }

  function remove(id) {
    const i = store.pages.findIndex((p) => p.id === id);
    if (i < 0) return { error: 'no such page' };
    const [rec] = store.pages.splice(i, 1);
    try { fs.unlinkSync(path.join(pagesDir, rec.id + '.html')); } catch { }
    save();
    return { ok: true };
  }

  const list = () => store.pages.map(pub);
  const bySrcPath = (p) => { const rec = store.pages.find((r) => r.srcPath === path.resolve(String(p || ''))); return rec ? pub(rec) : null; };

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
    app.get('/api/pages', (req, res) => res.json({ pages: list() }));
    app.get('/api/pages/by-path', (req, res) => res.json({ page: bySrcPath(String(req.query.path || '')) }));
    app.post('/api/pages/publish', (req, res) => {
      const b = req.body || {};
      const r = publish({ srcPath: b.path, name: b.name, makePublic: b.public });
      if (r.error) return res.status(400).json(r);
      res.json(r);
    });
    app.post('/api/pages/:id', (req, res) => {
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

  return { publish, setFlags, remove, list, bySrcPath, serve, urlFor, registerRoutes };
}

module.exports = { create };

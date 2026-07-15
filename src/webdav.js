/**
 * WebDAV bridge — serve a directory of THIS VibeSpace instance over standard
 * WebDAV so another VibeSpace (or any WebDAV client: rclone, Finder, phone
 * file managers) can mount it. Collaboration P1 "VibeSpace互挂".
 *
 * Security model: authorization lives in SCOPED MOUNT TOKENS, not the
 * protocol — each token carries {root directory, ro|rw} enforced server-side
 * on every request:
 *   - the request path is resolved UNDER the token's root (chroot semantics;
 *     traversal and symlink escapes rejected via realpath containment)
 *   - ro tokens get 403 on every write method
 *   - tokens are random 256-bit values, stored HASHED (sha256) — a leaked
 *     data/mount-tokens.json cannot be replayed; revoke = delete
 * Auth: `Authorization: Bearer vsmt_…` (rclone webdav bearer_token). The /dav
 * route bypasses cookie auth — the token IS the credential.
 *
 * Implemented verbs (the subset rclone + common clients need): OPTIONS,
 * PROPFIND (Depth 0/1), HEAD, GET (with Range), PUT, MKCOL, DELETE, MOVE,
 * COPY, plus ADVISORY (fake) LOCK/UNLOCK + accept-and-ignore PROPPATCH —
 * DAV class 2, required for macOS Finder to mount read-write.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TOKEN_PREFIX = 'vsmt_';
const LINK_PREFIX = 'vibespace-mount:v1:';

class MountTokens {
  constructor({ dataDir }) {
    this._file = path.join(dataDir, 'mount-tokens.json');
    this._state = { tokens: [] };
    try { this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8')); } catch { /* fresh */ }
    if (!Array.isArray(this._state.tokens)) this._state.tokens = [];
  }

  _save() {
    const tmp = this._file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this._file);
  }

  static _hash(raw) { return crypto.createHash('sha256').update(raw).digest('hex'); }

  /** Mint a scoped token. Returns the RAW token — shown once, stored hashed.
   *  kind: 'share' (a user-created share link, default) | 'reverse-mount'
   *  (minted by a machine push-mount). owner: for reverse-mount, the hostId
   *  it belongs to — so orphan GC + UI classification key off STRUCTURED
   *  fields, never a name-prefix hack (user directive). */
  mint({ name, root, mode, kind, owner }) {
    if (!root || !path.isAbsolute(root)) throw new Error('root must be an absolute path');
    let real;
    try { real = fs.realpathSync(root); } catch { throw new Error('root does not exist'); }
    if (!fs.statSync(real).isDirectory()) throw new Error('root must be a directory');
    const raw = TOKEN_PREFIX + crypto.randomBytes(24).toString('hex');
    const rec = {
      id: 'mtk-' + crypto.randomBytes(4).toString('hex'),
      name: String(name || 'unnamed').slice(0, 60),
      kind: kind === 'reverse-mount' ? 'reverse-mount' : 'share',
      owner: owner ? String(owner) : null,
      tokenHash: MountTokens._hash(raw),
      root: real,
      mode: mode === 'rw' ? 'rw' : 'ro',
      createdAt: Date.now(),
      lastUsedAt: null,
    };
    this._state.tokens.push(rec);
    this._save();
    return { raw, rec };
  }

  revoke(id) {
    const before = this._state.tokens.length;
    this._state.tokens = this._state.tokens.filter(t => t.id !== id);
    if (this._state.tokens.length === before) throw new Error('token not found');
    this._save();
  }

  list() {
    return this._state.tokens.map(t => ({
      id: t.id, name: t.name, kind: this._kindOf(t), owner: t.owner || this._ownerOf(t),
      root: t.root, mode: t.mode, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt,
    }));
  }

  /** Structured kind, back-filling pre-2.162.2 records from the old
   *  'host:<hostId>' name convention (one migration, no data rewrite needed —
   *  derived on read). */
  _kindOf(t) {
    if (t.kind) return t.kind;
    return /^host:/.test(String(t.name || '')) ? 'reverse-mount' : 'share';
  }
  _ownerOf(t) {
    if (t.owner) return t.owner;
    const m = /^host:(.+)$/.exec(String(t.name || ''));
    return m ? m[1] : null;
  }

  /** True when this raw token was minted BY this instance (no lastUsedAt
   *  bump) — the self-mount guard asks this: mounting your own /dav back
   *  onto yourself is a fuse→HTTP→self loop that deadlocks the threadpool. */
  has(raw) {
    if (!raw || !String(raw).startsWith(TOKEN_PREFIX)) return false;
    const h = MountTokens._hash(String(raw));
    return this._state.tokens.some(x => x.tokenHash === h);
  }

  /** Resolve a Bearer value to its token record (or null). */
  resolve(raw) {
    if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;
    const h = MountTokens._hash(raw);
    const t = this._state.tokens.find(x => x.tokenHash === h);
    if (t) { t.lastUsedAt = Date.now(); this._saveSoon(); }
    return t || null;
  }

  _saveSoon() { // lastUsedAt is telemetry — debounce writes
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => { try { this._save(); } catch {} }, 5000);
    this._saveTimer.unref?.();
  }

  buildLink({ url, raw, rec }) {
    const payload = { url: String(url).replace(/\/+$/, ''), token: raw, name: rec.name, mode: rec.mode };
    return LINK_PREFIX + Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  static parseLink(link) {
    if (!link || !String(link).startsWith(LINK_PREFIX)) return null;
    try { return JSON.parse(Buffer.from(String(link).slice(LINK_PREFIX.length), 'base64url').toString('utf-8')); }
    catch { return null; }
  }
}

// ── WebDAV request handling ──

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function hrefFor(base, rel, isDir) {
  const parts = rel.split('/').filter(Boolean).map(encodeURIComponent);
  let h = base + (parts.length ? '/' + parts.join('/') : '');
  if (isDir && !h.endsWith('/')) h += '/';
  return h;
}

function propfindEntry(href, name, st) {
  const isDir = st.isDirectory();
  return `<D:response>
<D:href>${esc(href)}</D:href>
<D:propstat><D:prop>
<D:displayname>${esc(name)}</D:displayname>
<D:resourcetype>${isDir ? '<D:collection/>' : ''}</D:resourcetype>
${isDir ? '' : `<D:getcontentlength>${st.size}</D:getcontentlength>`}
<D:getlastmodified>${new Date(st.mtimeMs).toUTCString()}</D:getlastmodified>
</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
</D:response>`;
}

/**
 * Register the /dav route on an Express app. Must be registered BEFORE any
 * body parser (PUT bodies stream straight to disk).
 */
function registerWebdav(app, { tokens }) {
  const WRITE_METHODS = new Set(['PUT', 'MKCOL', 'DELETE', 'MOVE', 'COPY', 'PROPPATCH', 'LOCK']);

  app.use('/dav', (req, res) => {
    // ── auth: Bearer mount token (rclone) OR Basic with the token as the
    // password (macOS Finder / Windows Explorer WebDAV clients only speak
    // Basic — Cmd+K → https://…/dav, any username, password = vsmt_…). Same
    // scoped-token model, different framing. ──
    const auth = req.headers.authorization || '';
    let bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    if (!bearer && auth.startsWith('Basic ')) {
      try {
        const dec = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8');
        const i = dec.indexOf(':');
        const user = i >= 0 ? dec.slice(0, i) : dec;
        const pass = i >= 0 ? dec.slice(i + 1) : '';
        bearer = pass.startsWith('vsmt_') ? pass : (user.startsWith('vsmt_') ? user : null);
      } catch {}
    }
    const tok = tokens.resolve(bearer);
    if (!tok) {
      // Basic first: Finder needs a Basic challenge to show its login prompt.
      res.set('WWW-Authenticate', 'Basic realm="vibespace-dav", Bearer realm="vibespace-dav"');
      return res.status(401).end();
    }
    if (tok.mode === 'ro' && WRITE_METHODS.has(req.method)) return res.status(403).end();

    // ── path resolution under the token's root (chroot) ──
    const rel = decodeURIComponent(req.path).replace(/\/+$/, '');
    const target = path.resolve(tok.root, '.' + (rel || '/'));
    if (target !== tok.root && !target.startsWith(tok.root + path.sep)) return res.status(403).end();
    // symlink escape: the closest EXISTING ancestor's realpath must stay inside
    const containedReal = (p) => {
      let probe = p;
      for (;;) {
        try {
          const real = fs.realpathSync(probe);
          return real === tok.root || real.startsWith(tok.root + path.sep);
        } catch { const up = path.dirname(probe); if (up === probe) return false; probe = up; }
      }
    };
    if (!containedReal(target)) return res.status(403).end();

    const davBase = '/dav';
    const relFromRoot = path.relative(tok.root, target);

    try {
      switch (req.method) {
        case 'OPTIONS': {
          // DAV class 2 (locking) is REQUIRED for macOS Finder to mount
          // read-write — with class 1 only, Finder silently mounts the volume
          // READ-ONLY no matter what the token allows (real report: walter's
          // Mac couldn't write into an rw share). Locks below are advisory
          // fakes (single-writer semantics don't matter for this bridge —
          // same approach as nginx dav_ext / many minimal servers).
          res.set({ DAV: '1, 2', Allow: 'OPTIONS, PROPFIND, PROPPATCH, HEAD, GET, PUT, MKCOL, DELETE, MOVE, COPY, LOCK, UNLOCK', 'MS-Author-Via': 'DAV' });
          return res.status(200).end();
        }
        case 'LOCK': {
          const lockToken = 'opaquelocktoken:' + crypto.randomUUID();
          const timeout = /Second-\d+/.exec(req.headers.timeout || '')?.[0] || 'Second-3600';
          res.set('Lock-Token', `<${lockToken}>`);
          res.type('application/xml');
          return res.status(200).send(`<?xml version="1.0" encoding="utf-8"?>\n<D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock><D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope><D:depth>infinity</D:depth><D:timeout>${timeout}</D:timeout><D:locktoken><D:href>${lockToken}</D:href></D:locktoken><D:lockroot><D:href>${req.baseUrl}${req.path}</D:href></D:lockroot></D:activelock></D:lockdiscovery></D:prop>`);
        }
        case 'UNLOCK':
          return res.status(204).end();
        case 'PROPPATCH': {
          // Accept-and-ignore (Finder sets mod times / Finder-info props on
          // every copy; failing this makes it roll back the whole write).
          res.type('application/xml');
          return res.status(207).send(`<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:"><D:response><D:href>${req.baseUrl}${req.path}</D:href><D:propstat><D:prop/><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`);
        }
        case 'PROPFIND': {
          let st;
          try { st = fs.statSync(target); } catch { return res.status(404).end(); }
          const depth = req.headers.depth === '0' ? 0 : 1;
          const out = [propfindEntry(hrefFor(davBase, relFromRoot, st.isDirectory()), path.basename(target) || '/', st)];
          if (depth === 1 && st.isDirectory()) {
            for (const name of fs.readdirSync(target)) {
              try {
                const cst = fs.statSync(path.join(target, name));
                out.push(propfindEntry(hrefFor(davBase, path.join(relFromRoot, name), cst.isDirectory()), name, cst));
              } catch { /* dangling entry */ }
            }
          }
          res.status(207).set('Content-Type', 'application/xml; charset=utf-8');
          return res.end(`<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">${out.join('\n')}</D:multistatus>`);
        }
        case 'HEAD':
        case 'GET': {
          let st;
          try { st = fs.statSync(target); } catch { return res.status(404).end(); }
          if (st.isDirectory()) return res.status(403).end(); // clients list via PROPFIND
          res.set({ 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Last-Modified': new Date(st.mtimeMs).toUTCString() });
          const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          let start = 0, end = st.size - 1;
          if (range && (range[1] || range[2])) {
            if (range[1]) { start = parseInt(range[1]); if (range[2]) end = Math.min(parseInt(range[2]), st.size - 1); }
            else { start = Math.max(0, st.size - parseInt(range[2])); } // suffix range
            if (start > end || start >= st.size) { res.set('Content-Range', `bytes */${st.size}`); return res.status(416).end(); }
            res.status(206).set('Content-Range', `bytes ${start}-${end}/${st.size}`);
          } else res.status(200);
          res.set('Content-Length', String(end - start + 1));
          if (req.method === 'HEAD') return res.end();
          const stream = fs.createReadStream(target, { start, end });
          stream.on('error', () => { try { res.destroy(); } catch {} });
          return stream.pipe(res);
        }
        case 'PUT': {
          let st = null;
          try { st = fs.statSync(target); } catch { /* new file */ }
          if (st?.isDirectory()) return res.status(409).end();
          if (!fs.existsSync(path.dirname(target))) return res.status(409).end(); // WebDAV: parent must exist
          const tmp = target + '.vsdav-' + crypto.randomBytes(4).toString('hex');
          const w = fs.createWriteStream(tmp, { mode: 0o644 });
          req.pipe(w);
          w.on('finish', () => {
            try { fs.renameSync(tmp, target); res.status(st ? 204 : 201).end(); }
            catch (e) { try { fs.unlinkSync(tmp); } catch {} res.status(500).end(); }
          });
          w.on('error', () => { try { fs.unlinkSync(tmp); } catch {} res.status(500).end(); });
          req.on('aborted', () => { try { w.destroy(); fs.unlinkSync(tmp); } catch {} });
          return;
        }
        case 'MKCOL': {
          if (fs.existsSync(target)) return res.status(405).end();
          if (!fs.existsSync(path.dirname(target))) return res.status(409).end();
          fs.mkdirSync(target);
          return res.status(201).end();
        }
        case 'DELETE': {
          if (!fs.existsSync(target)) return res.status(404).end();
          fs.rmSync(target, { recursive: true, force: true });
          return res.status(204).end();
        }
        case 'MOVE':
        case 'COPY': {
          const destHdr = req.headers.destination || '';
          let destPath;
          try { destPath = decodeURIComponent(new URL(destHdr, 'http://x').pathname); } catch { return res.status(400).end(); }
          if (!destPath.startsWith(davBase + '/') && destPath !== davBase) return res.status(502).end();
          const destRel = destPath.slice(davBase.length).replace(/\/+$/, '');
          const dest = path.resolve(tok.root, '.' + (destRel || '/'));
          if (dest !== tok.root && !dest.startsWith(tok.root + path.sep)) return res.status(403).end();
          if (!containedReal(dest)) return res.status(403).end();
          if (!fs.existsSync(target)) return res.status(404).end();
          const overwrite = (req.headers.overwrite || 'T').toUpperCase() !== 'F';
          const existed = fs.existsSync(dest);
          if (existed && !overwrite) return res.status(412).end();
          if (existed) fs.rmSync(dest, { recursive: true, force: true });
          if (req.method === 'MOVE') fs.renameSync(target, dest);
          else fs.cpSync(target, dest, { recursive: true });
          return res.status(existed ? 204 : 201).end();
        }
        case 'LOCK':
        case 'UNLOCK':
          return res.status(501).end();
        default:
          return res.status(405).end();
      }
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { MountTokens, registerWebdav, LINK_PREFIX };

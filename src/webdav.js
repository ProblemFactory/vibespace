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
 * COPY. Locks are not implemented (rclone doesn't use them); LOCK/UNLOCK
 * return 501 with DAV:1 compliance only.
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

  /** Mint a scoped token. Returns the RAW token — shown once, stored hashed. */
  mint({ name, root, mode }) {
    if (!root || !path.isAbsolute(root)) throw new Error('root must be an absolute path');
    let real;
    try { real = fs.realpathSync(root); } catch { throw new Error('root does not exist'); }
    if (!fs.statSync(real).isDirectory()) throw new Error('root must be a directory');
    const raw = TOKEN_PREFIX + crypto.randomBytes(24).toString('hex');
    const rec = {
      id: 'mtk-' + crypto.randomBytes(4).toString('hex'),
      name: String(name || 'unnamed').slice(0, 60),
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
      id: t.id, name: t.name, root: t.root, mode: t.mode,
      createdAt: t.createdAt, lastUsedAt: t.lastUsedAt,
    }));
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
  const WRITE_METHODS = new Set(['PUT', 'MKCOL', 'DELETE', 'MOVE', 'COPY', 'PROPPATCH']);

  app.use('/dav', (req, res) => {
    // ── auth: Bearer mount token ──
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    const tok = tokens.resolve(bearer);
    if (!tok) {
      res.set('WWW-Authenticate', 'Bearer realm="vibespace-dav"');
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
          res.set({ DAV: '1', Allow: 'OPTIONS, PROPFIND, HEAD, GET, PUT, MKCOL, DELETE, MOVE, COPY', 'MS-Author-Via': 'DAV' });
          return res.status(200).end();
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

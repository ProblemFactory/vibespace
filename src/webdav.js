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
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const FC = require('./fd-close.js');   // B-ddf3 unit 3 (r4634): a sync the file system does not do lands, said once (syncUnsupportedLands)
const DOOR = require('./mount-door'); // B-afc4: the blocked-path door — asked BEFORE a user-path read
const SR = require('./store-read.js');
const HOLD = require('./store-read-hold.js');   // B-f276 family unit 1: mount-tokens.json under the store-read law

const TOKEN_PREFIX = 'vsmt_';
const TOKENS_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && (v.tokens === undefined || Array.isArray(v.tokens));
const LINK_PREFIX = 'vibespace-mount:v1:';

class MountTokens {
  constructor({ dataDir, log }) {
    this._file = path.join(dataDir, 'mount-tokens.json');
    this._state = { tokens: [] };
    // B-f276 family unit 1 (lane bl-jobs, 主开发 r2930): THE STORE-READ LAW (src/store-read-hold.js). The release read ANY failure as
    // «no tokens» and the next mint wrote over the file — every folder link and every push mount's token gone. HELD: no token
    // resolves (a folder link is refused until the file reads), nothing is minted or revoked by name, nothing is written over it,
    // and it is read again off the loop; torn bytes are kept aside once per content, then the list starts empty
    this._hold = HOLD.create({
      file: this._file, valid: TOKENS_SHAPE, code: 'tokens_unread', aside: (mark) => this._file + '.corrupt-' + mark,
      words: (h) => `mount-tokens.json in VibeSpace's data folder could not be read (${h.code}); VibeSpace reads it again every few minutes. No token is lost: nothing is written over it, folder links to this computer are refused and new ones wait until it reads.`,
      log: log || ((s) => console.warn('[mount-tokens] ' + s)),
      onLift: (v) => { this._state = v || { tokens: [] }; if (!Array.isArray(this._state.tokens)) this._state.tokens = []; },
    });
    let read; try { read = { text: fs.readFileSync(this._file, 'utf-8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: TOKENS_SHAPE });
    if (this._hold.start(a) === 'data') this._state = a.value;
    if (!Array.isArray(this._state.tokens)) this._state.tokens = [];
  }
  /** the words a person reads while mount-tokens.json is held (the tokens list, a refused change) — null when it reads */
  unreadWords() { return this._hold.words(); }
  /** a lift from torn bytes in this run: the copy's base name (every machine's push mount needs its push again — the Bridge tokens
   *  section says so and where the old bytes are) — null when none */
  tornCopy() { const t = this._hold.torn(); return t ? t.copy : null; }
  /** a caller's guard over the tokens (the hub's rename guard): throws the refusal by name while held */
  refuseIfHeld(what) { this._hold.refuse(what); }

  _save() {
    if (!this._hold.writable('a token change')) return;   // held: nothing is written over the file
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
    this._hold.refuse('making a folder link');
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
    this._hold.refuse('revoking a folder link');
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
    this._hold.refuse('connecting a VibeSpace folder link');   // held: whether it is OURS is unknown — never a self-mount by default
    const h = MountTokens._hash(String(raw));
    return this._state.tokens.some(x => x.tokenHash === h);
  }

  /** Resolve a Bearer value to its token record (or null). */
  resolve(raw) {
    if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;
    const h = MountTokens._hash(raw);
    if (this._hold.held()) return null;   // held: no token is known — refused, never resolved against an empty list
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
/** A /dav request's pass: a Bearer mount token (rclone), or Basic with the token as the password or the user (macOS Finder /
 *  Windows Explorer speak only Basic). → the raw token, or null. ONE reader: the /dav route and the push mount's own door. */
function bearerOf(req) {
  const auth = (req && req.headers && req.headers.authorization) || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim() || null;
  if (!auth.startsWith('Basic ')) return null;
  try {
    const dec = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8');
    const i = dec.indexOf(':');
    const user = i >= 0 ? dec.slice(0, i) : dec, pass = i >= 0 ? dec.slice(i + 1) : '';
    return pass.startsWith('vsmt_') ? pass : (user.startsWith('vsmt_') ? user : null);
  } catch { return null; }
}

// B-ddf3 unit 3 (lane bl-vault, r4361): A DAV UPLOAD LANDS SYNCED — the temp synced ONCE at its end through the thread pool, then renamed
// over its name; a failed sync is a failed upload, said by name (a 500 whose text body names it), the temp removed. Its own function at
// the module's level: its rename is judged in its own scope (the MOVE verb's rename in the route stays a move)
// r4634: a file system that does not do a sync at all lands, said once (src/fd-close.js syncUnsupportedLands). ONE ANSWER (small c): the
// stream's own error (a close that fails after its finish) may have answered already — then nothing more is sent, and nothing renamed
async function landUpload(tmp, target, existed, res, streamFailed = () => null) {
  let h = null, fault = null;
  try { h = await fsp.open(tmp, 'r+'); } catch (oe) { fault = oe; }
  if (h) { try { await h.sync(); } catch (se) { if (!FC.syncUnsupportedLands(se, 'a WebDAV upload', (l) => console.warn(`[webdav] ${l}`))) fault = se; } }
  if (h) { const c = await h.close().then(() => null, (x) => x); if (!fault && c) fault = c; }
  if (!fault && streamFailed()) fault = streamFailed();   // the stream's own write or close failed meanwhile: a failed upload
  if (fault) { await fsp.unlink(tmp).catch(() => {}); if (res.headersSent) return; return res.status(500).type('text/plain').send(`${path.basename(target)} could not be put on disk (${(fault && fault.code) || 'failed'}) — not saved`); }
  return fsp.rename(tmp, target).then(() => { if (!res.headersSent) res.status(existed ? 204 : 201).end(); },
    async () => { await fsp.unlink(tmp).catch(() => {}); if (!res.headersSent) res.status(500).end(); });
}

function registerWebdav(app, { tokens }) {
  const WRITE_METHODS = new Set(['PUT', 'MKCOL', 'DELETE', 'MOVE', 'COPY', 'PROPPATCH', 'LOCK']);

  // lane hub-fuse-sync-guard: the share is any folder a person picked — a storage mount too — and a mounted client asks
  // continuously: every read and write below is ASYNC fs (a slow mount holds this request, never the server's loop)
  const exists = (p) => fsp.access(p).then(() => true, () => false);
  app.use('/dav', async (req, res) => {
    // ── auth: Bearer mount token (rclone) OR Basic with the token as the
    // password (macOS Finder / Windows Explorer WebDAV clients only speak
    // Basic — Cmd+K → https://…/dav, any username, password = vsmt_…). Same
    // scoped-token model, different framing. ──
    const tok = tokens.resolve(bearerOf(req));
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
    if (DOOR.blocked(target)) return res.status(503).type('text/plain').send(DOOR.sentenceFor(target));   // B-afc4: answered, never read
    // B-fcc7 (主开发's small 1): what a WebDAV request ADDS — a PUT, a MKCOL here, a COPY's or a MOVE's destination below — into a
    // machine's pull folder that is not mounted is stranded under the next mount: refused with the row's state (the files route's words)
    // B-02f6 remainder: the writers' door (ASYNC — every caller awaits it): a write refused under a record whose real folder never
    // resolved waits for the proof (the record's real folder by the starter, kept per record)
    const pullRefusal = async (p) => { let s = null; try { s = await require('./machine-mounts.js').pullShadowOfReal(p, { writer: true }); } catch { s = null; } return s ? require('./machine-mounts.js').pullShadowBody(s).error : null; };
    if (req.method === 'PUT' || req.method === 'MKCOL') { const w = await pullRefusal(target); if (w) return res.status(503).type('text/plain').send(w); }
    // symlink escape: the closest EXISTING ancestor's realpath must stay inside
    const containedReal = async (p) => {
      let probe = p;
      for (;;) {
        try {
          const real = await fsp.realpath(probe);
          return real === tok.root || real.startsWith(tok.root + path.sep);
        } catch { const up = path.dirname(probe); if (up === probe) return false; probe = up; }
      }
    };
    if (!(await containedReal(target))) return res.status(403).end();

    const davBase = '/dav';
    const relFromRoot = path.relative(tok.root, target);

    try {
      switch (req.method) {
        case 'OPTIONS': {
          // DAV class 2 (locking) is REQUIRED for macOS Finder to mount
          // read-write — with class 1 only, Finder silently mounts the volume
          // READ-ONLY no matter what the token allows (real report: userW's
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
          try { st = await fsp.stat(target); } catch { return res.status(404).end(); }
          const depth = req.headers.depth === '0' ? 0 : 1;
          const out = [propfindEntry(hrefFor(davBase, relFromRoot, st.isDirectory()), path.basename(target) || '/', st)];
          if (depth === 1 && st.isDirectory()) {
            for (const name of await fsp.readdir(target)) {
              try {
                const cst = await fsp.stat(path.join(target, name));
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
          try { st = await fsp.stat(target); } catch { return res.status(404).end(); }
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
          try { st = await fsp.stat(target); } catch { /* new file */ }
          if (st?.isDirectory()) return res.status(409).end();
          if (!(await exists(path.dirname(target)))) return res.status(409).end(); // WebDAV: parent must exist
          const tmp = target + '.vsdav-' + crypto.randomBytes(4).toString('hex');
          const w = fs.createWriteStream(tmp, { mode: 0o644 });
          req.pipe(w);
          let wFailed = null;   // the stream's own failure (r4634 small c): one answer, and nothing renamed after it
          w.on('finish', () => { w.landing = landUpload(tmp, target, !!st, res, () => wFailed); });   // B-ddf3 unit 3: synced, then renamed (landUpload, above); its own promise kept on the stream (its end is a fact a reader can wait for)
          w.on('error', (e) => { wFailed = wFailed || e || new Error('write failed'); fsp.unlink(tmp).catch(() => {}); if (!res.headersSent) res.status(500).end(); });
          req.on('aborted', () => { try { w.destroy(); } catch {} fsp.unlink(tmp).catch(() => {}); });
          return;
        }
        case 'MKCOL': {
          if (await exists(target)) return res.status(405).end();
          if (!(await exists(path.dirname(target)))) return res.status(409).end();
          await fsp.mkdir(target);
          return res.status(201).end();
        }
        case 'DELETE': {
          if (!(await exists(target))) return res.status(404).end();
          await fsp.rm(target, { recursive: true, force: true });
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
          { const w = await pullRefusal(dest); if (w) return res.status(503).type('text/plain').send(w); }   // B-fcc7: a destination in a pull folder that is not mounted
          if (!(await containedReal(dest))) return res.status(403).end();
          if (!(await exists(target))) return res.status(404).end();
          const overwrite = (req.headers.overwrite || 'T').toUpperCase() !== 'F';
          const existed = await exists(dest);
          if (existed && !overwrite) return res.status(412).end();
          if (existed) await fsp.rm(dest, { recursive: true, force: true });
          if (req.method === 'MOVE') await fsp.rename(target, dest);
          else await fsp.cp(target, dest, { recursive: true });
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

module.exports = { MountTokens, registerWebdav, LINK_PREFIX, bearerOf };

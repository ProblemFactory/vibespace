'use strict';
/**
 * THE DESIGN WINDOW'S HUB (ORCH, lane design-core — docs/design-design-window.md §3.3).
 *
 * The canvas is plain-HTML artboards in a conversation's working folder (`designs/<slug>/`, src/design-model.js);
 * this module is everything the hub does about them:
 *
 *   REGISTRY   data/designs.json `{designs: [{id, sessionId, conversationId, host, dir, title, createdAt, openedAt}]}`,
 *              one row per (host, dir), written through writeJsonAtomic (async, serialized), a `designs-updated`
 *              broadcast on every write. `host` null = this machine (a PARAMETER, never a branch above the reader).
 *   READ       `read(host, dir)` = ONE operation per machine: this machine = async, bounded fs reads (readdir, then
 *              each file through an O_NOFOLLOW handle — a symlink is never followed out of the folder); an ssh host =
 *              ONE remote command (RemoteFs.runScript) that lists and base64-cats the folder's artboards, manifest and
 *              images under the same caps — never 40 ssh round trips. Caps: 40 artboards, 2 MiB a file, 24 MB a read
 *              ⇒ `too_big` by name. The result is the model's: the manifest (or its refusals), every frame laid out
 *              with its verdict, the artboards inlined by THE ONE bundler.
 *   THE WATCH  a refcount of open windows per (host, dir), per socket (a socket's close unwatches it). This machine:
 *              an async `lstat` sweep of the manifest + the listed files every 2 s, ONLY while watched — never
 *              fs.watch / inotify (the owner's working folder is NFS, where inotify is silent; and three whole-instance
 *              outages were sync fs in this class). One stat at a time (a hung mount holds at most one threadpool
 *              thread), a per-sweep budget, no overlapping sweeps. A moved mtime ⇒ the existing `file-changed
 *              {host, path, mtime, by:'design'}` broadcast per file. A remote folder is not polled (P1: a daemon op)
 *              — the agent's `vibespace-design sync` is its notify rung (`changed`).
 *   COMMENT    the user's click on an element + their words → `[Design comment] <quote>: <text>`, the WHOLE line
 *              through THE belt (src/peer-text.js toAgentText — the quoted element text is an artboard's, and an
 *              artboard may be another agent's of a shared Task Group) → THE typing sender (src/server/user-input.js:
 *              the user's own message; mid-turn it queues like chat input). No live chat process ⇒ the durable stash
 *              (conversation-deliver's stashFor, source `design-comment`) — drained into the conversation's next
 *              turn, and the strip above its composer says a design comment waits (src/stash-summary.js).
 *   PUBLISH    read → every frame must pass → bundleCanvas (the standalone runtime public/design-viewer.js when the
 *              build made it, else the model's placeholder) → the existing published-pages store, srcKey
 *              `<host|local>:<dir>` (same URL on republish; private by default, visibility kept unless asked).
 *
 * Gate: scripts/test-design-routes.mjs (fast).
 */
const fs = require('fs');
const path = require('path');
const M = require('../design-model.js');
const { toAgentText: agentText } = require('../peer-text.js');
const { addressableId } = require('../claude-lock-capture.js');

const MiB = 1024 * 1024;
const POLL_MS = 2000;
const SWEEP_BUDGET = 128;          // stats per sweep, across every watched folder
const DIR_STATS = 48;              // stats per folder per sweep (the manifest + 40 artboards + a few images)
const WATCH_PER_SOCKET = 16;
const WATCH_TOTAL = 32;
const REMOTE_TIMEOUT_MS = 30000;
const REMOTE_MAX_BUFFER = 40 * MiB; // 24 MB of files as base64 + the frame lines
const ASSETS_PER_READ = 200;
const COMMENT_LINE_MAX = 6000;
const DESIGN_COMMENT_FROM = 'Design comment';
const RUNTIME_MAX = 4 * MiB;
const REGISTRY_MAX = 1000;         // rows kept (the least recently opened go first) — agents mint designs, nothing else bounds them
const LAST_READ_MAX = 200;         // folders whose last read's mtimes are remembered (to prime a watch)

/** Status per refusal code (the routes answer `{error, code}` with it). */
const STATUS = Object.freeze({
  bad_dir: 400, not_registered: 404, not_found: 404, not_a_dir: 400, too_big: 413, read_failed: 502, host_unreachable: 502,
  no_remote: 503, not_publishable: 409, empty: 400, too_long: 400, bad_files: 400, no_conversation: 409, input_rejected: 400,
  too_large: 400, send_failed: 500, publish_failed: 500, no_pages: 503, page_not_found: 404, page_forbidden: 403,
  watch_limit: 429, agent_forbidden: 403, no_session: 409,
});
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });

async function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp-' + process.pid;
  await fs.promises.writeFile(tmp, JSON.stringify(obj, null, 2));
  await fs.promises.rename(tmp, file);
}

/** A folder as the caller names it → its normalized absolute posix path, or null. */
function dirOf(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 1024 || /[\u0000\n\r]/.test(s) || !s.startsWith('/')) return null;
  const n = path.posix.normalize(s).replace(/\/+$/, '');
  return n && n !== '/' ? n : null;
}
const hostOf = (h) => (h && h !== 'local' ? String(h) : null);
const keyOf = (host, dir) => `${host || 'local'}\u0000${dir}`;
const cleanTitle = (t) => String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, M.LIMITS.title);
const mintId = () => 'dg' + Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
const isWatchable = (n) => n === M.MANIFEST_FILE || M.isArtboardName(n) || M.isAssetName(n);

// ── the remote read: ONE command ────────────────────────────────────────────────────────────────────────────────────
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const HTML_GLOB = '*.[hH][tT][mM][lL]';
const IMAGE_GLOBS = ['*.[pP][nN][gG]', '*.[jJ][pP][gG]', '*.[jJ][pP][eE][gG]', '*.[gG][iI][fF]', '*.[wW][eE][bB][pP]', '*.[sS][vV][gG]'];
/** The one remote command: list the folder, base64-cat the manifest + every artboard (then the images) under the
 *  per-file and per-read caps, frame lines naming each file (its name base64'd — any byte is safe). POSIX sh. */
function remoteReadScript(dir) {
  return [
    `cd -- ${shq(dir)} 2>/dev/null || { printf '@@NODIR\\n'; exit 0; }`,
    `[ -d . ] || { printf '@@NODIR\\n'; exit 0; }`,
    `printf '@@VSD1\\n'; t=0; h=0; a=0`,
    `emit() { s=$(wc -c < "$1" 2>/dev/null | tr -d ' '); [ -n "$s" ] || return 0; m=$(stat -c %Y -- "$1" 2>/dev/null || stat -f %m -- "$1" 2>/dev/null || echo 0); nb=$(printf '%s' "$1" | base64 | tr -d '\\n'); if [ "$s" -le ${M.LIMITS.artboardBytes} ] && [ $((t + s)) -le ${M.LIMITS.readBytes} ]; then t=$((t + s)); printf '@@F %s %s %s 1\\n' "$s" "$m" "$nb"; base64 < "$1"; printf '@@E\\n'; else printf '@@F %s %s %s 0\\n' "$s" "$m" "$nb"; fi; }`,
    `for f in design.json ${HTML_GLOB}; do [ -f "$f" ] && [ ! -L "$f" ] || continue; [ "$f" = design.json ] || h=$((h + 1)); [ $h -le ${M.LIMITS.artboards} ] && emit "$f"; done`,
    `for f in ${IMAGE_GLOBS.join(' ')}; do [ -f "$f" ] && [ ! -L "$f" ] || continue; a=$((a + 1)); [ $a -le ${ASSETS_PER_READ} ] && emit "$f"; done`,
    `printf '@@HTML %s\\n@@END\\n' "$h"`,
  ].join('\n');
}
/** The command's output → {ok, files: Map(name → {size, mtime, bytes|null}), html} | a refusal. */
function parseRemoteRead(out) {
  const text = Buffer.isBuffer(out) ? out.toString('latin1') : String(out || '');
  const lines = text.split('\n');
  if (lines[0] === '@@NODIR') return fail('not_found', 'the folder does not exist on that machine');
  if (lines[0] !== '@@VSD1') return fail('read_failed', 'the machine answered something that is not a design read');
  const files = new Map();
  let html = null, ended = false, cur = null, body = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (cur) {
      if (l === '@@E') { cur.bytes = Buffer.from(body.join(''), 'base64'); files.set(cur.name, cur); cur = null; body = []; } else body.push(l);
      continue;
    }
    let m;
    if ((m = /^@@F (\d+) (\d+) ([A-Za-z0-9+/=]*) ([01])$/.exec(l))) {
      const name = Buffer.from(m[3], 'base64').toString('utf8');
      const rec = { name, size: Number(m[1]), mtime: Number(m[2]) * 1000, bytes: null };
      if (m[4] === '1') cur = rec; else files.set(name, rec);
    } else if ((m = /^@@HTML (\d+)$/.exec(l))) html = Number(m[1]);
    else if (l === '@@END') { ended = true; break; }
  }
  if (!ended || cur) return fail('read_failed', 'the read was cut short (the link to that machine carries a bounded answer) — try again, or make the design smaller');
  return { ok: true, files, html };
}

function create({
  dataDir, rootDir = path.join(__dirname, '..', '..'),
  activeSessions = new Map(),
  getRemoteFs = () => null, getPublishedPages = () => null, getDeliver = () => null,
  sendUserInput = null,
  broadcastAll = () => { }, broadcastToSession = () => { },
  log = () => { }, now = () => Date.now(),
  timers = { setInterval, clearInterval },
  pollMs = POLL_MS,
} = {}) {
  const fsp = fs.promises;
  const storeFile = path.join(dataDir, 'designs.json');
  let store = { designs: [] };
  try { store = JSON.parse(fs.readFileSync(storeFile, 'utf8')) || { designs: [] }; } catch { /* first boot */ }
  if (!Array.isArray(store.designs)) store.designs = [];
  store.designs = store.designs.filter((r) => r && typeof r === 'object' && dirOf(r.dir));
  let saving = Promise.resolve();
  const save = () => {
    const snap = { designs: store.designs.map((r) => ({ ...r })) };
    saving = saving.then(() => writeJsonAtomic(storeFile, snap)).catch((e) => log('[design] registry save failed:', e.message));
    return saving;
  };
  const pub = (r) => ({ id: r.id, sessionId: r.sessionId || null, conversationId: r.conversationId || null, host: r.host || null, dir: r.dir, title: r.title || '', createdAt: r.createdAt, openedAt: r.openedAt });
  const find = (host, dir) => store.designs.find((r) => (r.host || null) === (host || null) && r.dir === dir) || null;
  const notify = (row, extra = {}) => { try { broadcastAll({ type: 'designs-updated', design: pub(row), ...extra }); } catch (e) { log('[design] designs-updated broadcast failed:', e.message); } };
  const lastRead = new Map();   // key → {at, mtimes:{name: ms}} — primes a new watch, so a change after the read is seen

  // ── registry ──
  function register({ host = null, dir, title = '', sessionId = null, conversationId = null } = {}) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path (vibespace-design new prints it)');
    const h = hostOf(host);
    let row = find(h, d);
    const created = !row;
    if (!row) {
      row = { id: mintId(), sessionId: null, conversationId: null, host: h, dir: d, title: '', createdAt: now(), openedAt: now() };
      store.designs.push(row);
      if (store.designs.length > REGISTRY_MAX) {   // the bound: the least recently opened rows leave (their folders stay on disk; `open` registers again)
        const order = new Map(store.designs.map((r, i) => [r, i]));   // a tie on the clock: the later row is the newer (the one just added stays)
        store.designs.sort((a, b) => ((Number(b.openedAt) || 0) - (Number(a.openedAt) || 0)) || (order.get(b) - order.get(a)));
        store.designs.length = REGISTRY_MAX;
      }
    }
    if (sessionId) row.sessionId = String(sessionId);
    if (conversationId) row.conversationId = String(conversationId);
    const t = cleanTitle(title);
    if (t) row.title = t; else if (!row.title) row.title = path.posix.basename(d);
    row.openedAt = now();
    save();
    notify(row, { created });
    return { ok: true, design: pub(row), created };
  }
  const list = ({ sessionId = null, conversationId = null } = {}) => store.designs
    .filter((r) => (!sessionId && !conversationId) || (sessionId && r.sessionId === sessionId) || (conversationId && r.conversationId === conversationId))
    .map(pub);
  const pageOf = (row) => {
    const pages = getPublishedPages();
    if (!pages || !row) return null;
    const key = `${row.host || 'local'}:${row.dir}`;
    const p = pages.list({}).find((x) => x.srcKey === key);
    return p ? { id: p.id, path: p.path, public: !!p.public, updatedAt: p.updatedAt } : null;
  };

  // ── reads ──
  /** This machine: readdir, then every needed file through an O_NOFOLLOW handle (fstat judged before the read). */
  async function readLocal(dir) {
    let ents;
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); }
    catch (e) { return e.code === 'ENOENT' ? fail('not_found', 'the folder does not exist') : e.code === 'ENOTDIR' ? fail('not_a_dir', 'that path is a file, not a folder') : fail('read_failed', `the folder could not be read (${e.code || e.message})`); }
    const names = ents.filter((e) => e.isFile()).map((e) => e.name);   // a symlink entry is not a file here: never followed
    const html = names.filter((n) => /\.html$/i.test(n));
    if (html.length > M.LIMITS.artboards) return fail('too_big', M.readCapsVerdict({ artboards: html.length }).why);
    const files = new Map();
    let total = 0;
    const take = async (name, cap) => {
      let fh = null;
      try {
        fh = await fsp.open(path.join(dir, name), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        const st = await fh.stat();
        if (!st.isFile()) return null;
        const rec = { name, size: st.size, mtime: Math.round(st.mtimeMs), bytes: null };
        if (st.size <= cap && total + st.size <= M.LIMITS.readBytes) { rec.bytes = await fh.readFile(); total += rec.bytes.length; }
        else if (st.size <= cap) rec.over = true;   // within its own cap, past the read's budget
        return rec;
      } catch { return null; } finally { if (fh) await fh.close().catch(() => { }); }
    };
    for (const n of [M.MANIFEST_FILE, ...html.sort()]) {
      if (n === M.MANIFEST_FILE && !names.includes(n)) continue;
      const rec = await take(n, M.LIMITS.artboardBytes);
      if (rec) files.set(n, rec);
    }
    // only the images the artboards use
    const want = new Set();
    for (const n of html) { const r = files.get(n); if (r && r.bytes) for (const a of M.assetRefsOf(r.bytes.toString('utf8'))) want.add(a); }
    const wanted = [...want];
    for (const a of wanted.slice(0, ASSETS_PER_READ)) {
      if (!names.includes(a)) continue;
      const rec = await take(a, M.LIMITS.assetBytes);
      if (rec) files.set(a, rec);
    }
    // past the per-read image cap: the file IS in the folder and is NOT read — its artboard is refused as the cap, by
    // name, never as "missing" (L4 B③: 300 images read "not in the design folder")
    for (const a of wanted.slice(ASSETS_PER_READ)) if (names.includes(a)) files.set(a, { name: a, size: 0, mtime: null, bytes: null, capped: true });
    return { ok: true, files, html: html.length };
  }
  /** An ssh host: ONE command through RemoteFs. */
  async function readRemote(host, dir) {
    const rfs = getRemoteFs();
    if (!rfs || typeof rfs.runScript !== 'function') return fail('no_remote', 'reading another machine is not available on this server');
    let out;
    try { out = await rfs.runScript(host, remoteReadScript(dir), { timeoutMs: REMOTE_TIMEOUT_MS, maxBuffer: REMOTE_MAX_BUFFER }); }
    catch (e) { return fail('host_unreachable', `the machine did not answer (${String(e && e.message || e).slice(0, 200)})`); }
    const r = parseRemoteRead(out);
    if (!r.ok) return r;
    if (r.html > M.LIMITS.artboards) return fail('too_big', M.readCapsVerdict({ artboards: r.html }).why);
    // a file within its own cap that came without bytes = the read's budget ran out
    for (const f of r.files.values()) if (!f.bytes && f.size <= M.LIMITS.artboardBytes) f.over = true;
    return r;
  }
  /** The raw listing → the model's answer for the window / the agent / publish. */
  function compose(host, dir, raw) {
    const files = raw.files;
    let manifest = M.emptyManifest(), refusals = [];
    const mf = files.get(M.MANIFEST_FILE);
    if (mf) {
      if (!mf.bytes) refusals = [{ code: 'too_big', where: M.MANIFEST_FILE, why: 'design.json is too large to read' }];
      else { const v = M.validateManifest(mf.bytes.toString('utf8')); if (v.ok) manifest = v.manifest; else refusals = v.refusals; }
    }
    const htmlNames = [...files.keys()].filter((n) => /\.html$/i.test(n));
    const lay = M.layoutOf(manifest, htmlNames);
    const assets = new Map();
    for (const [n, f] of files) if (M.isAssetName(n)) assets.set(n, f.bytes ? f.bytes.length : (f.capped ? -2 : f.over ? -1 : f.size));
    const usedAssets = new Set();
    let total = 0, overBudget = false;
    const frames = lay.frames.map((f) => {
      const rec = files.get(f.file);
      const out = { ...f, bytes: rec ? rec.size : 0, mtime: rec ? rec.mtime : null };
      if (f.missing || !rec) return { ...out, verdict: { ok: false, code: 'missing', why: `${f.file} is listed in design.json but is not in the folder` } };
      if (f.dup) return { ...out, verdict: { ok: false, code: 'duplicate', why: `${f.file} differs from another artboard only by case — rename one` } };
      if (rec.over) { overBudget = true; return { ...out, verdict: { ok: false, code: 'too_big', why: `${f.file} did not fit in one read (24 MB) — shrink or remove images` } }; }
      if (!rec.bytes) return { ...out, verdict: M.artboardVerdict(f.file, '', { bytes: rec.size }) };
      const html = rec.bytes.toString('utf8');
      const v = M.artboardVerdict(f.file, html, { assets, bytes: rec.bytes.length });
      if (!v.ok) return { ...out, verdict: v };
      if (v.assets.some((a) => assets.get(a) === -2)) return { ...out, verdict: { ok: false, code: 'too_big', why: `${f.file} needs an image past the ${ASSETS_PER_READ}-image cap of one read — a design inlines at most ${ASSETS_PER_READ} images in all (use fewer, or split the design)` } };
      if (v.assets.some((a) => assets.get(a) === -1)) { overBudget = true; return { ...out, verdict: { ok: false, code: 'too_big', why: `${f.file}'s images did not fit in one read (24 MB) — shrink or remove images` } }; }
      total += rec.bytes.length;
      for (const a of v.assets) if (!usedAssets.has(a)) { usedAssets.add(a); total += assets.get(a) || 0; }
      const inl = M.inlineAssets(html, (name) => { const r = files.get(name); return r && r.bytes ? r.bytes.toString('base64') : null; });
      return { ...out, verdict: { ok: true }, html: inl.html };
    });
    const mtimes = {};
    for (const [n, f] of files) if (!f.capped) mtimes[n] = f.mtime;   // an unread image is not watched
    const row = find(host, dir);
    // `artboards` = the window's read normaliser's shape (L2, design §3.7): the html + the verdict per file, beside `frames`
    const artboards = frames.map((f) => (f.verdict.ok ? { file: f.file, html: f.html, ok: true } : { file: f.file, ok: false, code: f.verdict.code, why: f.verdict.why }));
    return {
      ok: true, host: host || null, dir, design: row ? pub(row) : null,
      title: manifest.title || (row && row.title) || path.posix.basename(dir),
      manifest, refusals, warnings: lay.warnings, frames, artboards, pages: manifest.pages, notes: manifest.notes, launch: manifest.launch,
      totalBytes: total, overBudget, readAt: now(), mtimes,
    };
  }
  /** `read(host, dir)` — ONE operation for the machine that holds the folder (the registry is asked by the callers). */
  async function read(host, dir) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    const h = hostOf(host);
    const raw = h ? await readRemote(h, d) : await readLocal(d);
    if (!raw.ok) return raw;
    const r = compose(h, d, raw);
    const k = keyOf(h, d);
    lastRead.delete(k);
    lastRead.set(k, { at: r.readAt, mtimes: r.mtimes });
    if (lastRead.size > LAST_READ_MAX) lastRead.delete(lastRead.keys().next().value);   // the oldest read is forgotten first
    primeWatch(k, r.mtimes);
    return r;
  }
  /** A watch that started before a read of its folder finished (the window asks to watch, THEN reads) is primed by what
   *  that read saw — never by its own first sweep: a write landing between the read and that sweep would become the
   *  baseline and never be shown (L4 run 0: a write within 2 s of opening the window was missed until the next edit). */
  function primeWatch(key, mtimes) {
    const w = watches.get(key);
    if (!w || w.primed) return;
    for (const [n, m] of Object.entries(mtimes || {})) if (isWatchable(n)) { w.names.add(n); w.mtimes.set(n, m); }
    w.primed = true; w.listed = true;
  }
  /** The registered folder's read (every route goes through this one). */
  async function readDesign(host, dir) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    if (!find(hostOf(host), d)) return fail('not_registered', `${d} is not a registered design — vibespace-design new (or open <dir>) registers it`);
    return read(host, d);
  }

  // ── the watch ──
  const watches = new Map();        // key → {host, dir, sockets:Set, names:Set, mtimes:Map, primed, listed}
  const bySocket = new Map();       // ws → Set(key)
  let ticker = null, sweeping = null, rr = 0;
  const ensureTicker = () => {
    const any = [...watches.values()].some((w) => !w.host);
    if (any && !ticker) { ticker = timers.setInterval(() => { sweepOnce().catch((e) => log('[design] sweep failed:', e.message)); }, pollMs); if (ticker && ticker.unref) ticker.unref(); }
    else if (!any && ticker) { timers.clearInterval(ticker); ticker = null; }
  };
  function watch(ws, host, dir) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    const h = hostOf(host);
    if (!find(h, d)) return fail('not_registered', `${d} is not a registered design`);
    const key = keyOf(h, d);
    const mine = bySocket.get(ws) || new Set();
    if (!mine.has(key)) {
      if (mine.size >= WATCH_PER_SOCKET) return fail('watch_limit', `one window set watches at most ${WATCH_PER_SOCKET} designs`);
      if (!watches.has(key) && watches.size >= WATCH_TOTAL) return fail('watch_limit', `this server watches at most ${WATCH_TOTAL} designs at once`);
    }
    let w = watches.get(key);
    if (!w) {
      w = { key, host: h, dir: d, sockets: new Set(), names: new Set(), mtimes: new Map(), primed: false, listed: false };
      const lr = lastRead.get(key);
      if (lr) { for (const [n, m] of Object.entries(lr.mtimes)) if (isWatchable(n)) { w.names.add(n); w.mtimes.set(n, m); } w.primed = true; w.listed = true; }
      watches.set(key, w);
    }
    w.sockets.add(ws);
    mine.add(key);
    bySocket.set(ws, mine);
    ensureTicker();
    return { ok: true, watchers: w.sockets.size, polled: !h };
  }
  function unwatch(ws, host, dir) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    const key = keyOf(hostOf(host), d);
    const w = watches.get(key);
    if (w) { w.sockets.delete(ws); if (!w.sockets.size) watches.delete(key); }
    const mine = bySocket.get(ws);
    if (mine) { mine.delete(key); if (!mine.size) bySocket.delete(ws); }
    ensureTicker();
    return { ok: true, watchers: w ? w.sockets.size : 0 };
  }
  function unwatchSocket(ws) {
    const mine = bySocket.get(ws);
    if (!mine) return 0;
    for (const key of mine) { const w = watches.get(key); if (w) { w.sockets.delete(ws); if (!w.sockets.size) watches.delete(key); } }
    bySocket.delete(ws);
    ensureTicker();
    return mine.size;
  }
  async function relist(w) {
    try {
      const ents = await fsp.readdir(w.dir, { withFileTypes: true });
      const names = ents.filter((e) => e.isFile() && isWatchable(e.name)).map((e) => e.name).sort((a, b) => (a === M.MANIFEST_FILE ? -1 : b === M.MANIFEST_FILE ? 1 : 0));
      for (const n of names.slice(0, DIR_STATS)) w.names.add(n);
    } catch { /* the folder is gone: every stat below says so */ }
    w.listed = true;
  }
  async function sweepDir(w, budget) {
    if (!w.listed) await relist(w);
    const names = [M.MANIFEST_FILE, ...[...w.names].filter((n) => n !== M.MANIFEST_FILE)].slice(0, Math.max(1, Math.min(DIR_STATS, budget)));
    const changed = [];
    for (const n of names) {
      let m = null;
      try { const st = await fsp.lstat(path.join(w.dir, n)); m = st.isFile() ? Math.round(st.mtimeMs) : null; } catch { m = null; }
      const had = w.mtimes.has(n);
      const prev = had ? w.mtimes.get(n) : null;
      if (w.primed && prev !== m && (had || m !== null)) changed.push([n, m]);
      w.mtimes.set(n, m);
    }
    w.primed = true;
    if (changed.some(([n]) => n === M.MANIFEST_FILE)) await relist(w);
    for (const [n, m] of changed) {
      if (!watches.has(w.key)) break;   // unwatched mid-sweep
      try { broadcastAll({ type: 'file-changed', host: w.host, path: path.posix.join(w.dir, n), mtime: m, by: 'design' }); } catch { }
    }
    return names.length;
  }
  /** ONE sweep over the watched folders of this machine (the ticker's body; never two at once). */
  function sweepOnce() {
    if (sweeping) return sweeping;
    sweeping = (async () => {
      const keys = [...watches.keys()].filter((k) => !watches.get(k).host);
      if (!keys.length) return 0;
      let budget = SWEEP_BUDGET, swept = 0;
      const start = rr % keys.length;
      rr += 1;
      for (let i = 0; i < keys.length && budget > 0; i++) {
        const w = watches.get(keys[(start + i) % keys.length]);
        if (!w) continue;
        const used = await sweepDir(w, budget);
        budget -= used; swept += 1;
      }
      return swept;
    })().finally(() => { sweeping = null; });
    return sweeping;
  }
  /** The notify rung (`vibespace-design sync` / `add`): the named files changed. */
  async function changed(host, dir, files) {
    const d = dirOf(dir);
    if (!d) return fail('bad_dir', 'name the design folder by its absolute path');
    const h = hostOf(host);
    if (!find(h, d)) return fail('not_registered', `${d} is not a registered design — vibespace-design open ${d} registers it`);
    const list = Array.isArray(files) ? files : [];
    if (list.length > M.LIMITS.artboards + 20 || list.some((f) => !isWatchable(f))) return fail('bad_files', 'files must be the design folder\'s own artboards, images or design.json, by name (at most 60)');
    const names = list.length ? [...new Set(list)] : [M.MANIFEST_FILE];
    const w = watches.get(keyOf(h, d));
    for (const n of names) {
      let m = null;
      if (!h) { try { const st = await fsp.lstat(path.join(d, n)); m = st.isFile() ? Math.round(st.mtimeMs) : null; } catch { m = null; } }
      if (w) { w.names.add(n); w.mtimes.set(n, m); }   // the poll has seen it now — no second broadcast
      try { broadcastAll({ type: 'file-changed', host: h, path: path.posix.join(d, n), mtime: m, by: 'design' }); } catch { }
    }
    return { ok: true, notified: names.length, watchers: w ? w.sockets.size : 0 };
  }

  // ── the comment ──
  /** The conversation a design comment waits for when no live chat process can take it. */
  function conversationFor(sessionId, host, dir) {
    const s = activeSessions.get(sessionId);
    const own = s ? addressableId(s) : null;
    if (own) return own;
    const d = dirOf(dir);
    const row = d ? find(hostOf(host), d) : null;
    if (row && row.conversationId && (!row.sessionId || row.sessionId === sessionId || !s)) return row.conversationId;
    return null;
  }
  /** The user's comment on an element → THE typing sender, else the stash. → {ok, delivered:'sent'|'stashed', …}. */
  function comment({ sessionId, host = null, dir = '', quote = {}, text } = {}) {
    const v = M.commentVerdict(text);
    if (!v.ok) return fail(v.code, v.why);
    if (typeof sessionId !== 'string' || !sessionId) return fail('no_session', 'name the conversation the comment is for');
    const line = agentText(M.commentText(M.pickQuote(quote), v.text), { kind: 'block', max: COMMENT_LINE_MAX });
    const r = typeof sendUserInput === 'function' ? sendUserInput(sessionId, line, { msgId: now() + '-design', origin: 'design-comment' }) : { ok: false, code: 'no_session' };
    if (r && r.ok) return { ok: true, delivered: 'sent', msgId: r.msgId, text: line };
    if (!r || (r.code !== 'no_session' && r.code !== 'not_chat')) return fail((r && r.code) || 'send_failed', (r && r.error) || 'the comment was not sent');
    const cid = conversationFor(sessionId, host, dir);
    if (!cid) return fail('no_conversation', 'this conversation is not running and has no id yet — open its chat and send the comment there');
    const deliver = getDeliver();
    if (!deliver || typeof deliver.stashFor !== 'function') return fail('send_failed', 'the conversation is not running and its waiting queue is unavailable');
    let st;
    try { st = deliver.stashFor(cid, { source: 'design-comment', kind: 'peer', fromName: DESIGN_COMMENT_FROM, text: line }); }
    catch (e) { return fail('send_failed', e.message); }
    return { ok: true, delivered: 'stashed', stored: !st || st.stored !== false, why: (st && st.why) || null, conversationId: cid, text: line };
  }

  // ── publish ──
  let runtimeCache = { at: 0, js: '' };
  async function runtimeJs() {
    const fp = path.join(rootDir, 'public', 'design-viewer.js');
    try {
      const st = await fsp.stat(fp);
      if (st.size > RUNTIME_MAX) return '';
      if (runtimeCache.at === st.mtimeMs) return runtimeCache.js;
      const js = await fsp.readFile(fp, 'utf8');
      runtimeCache = { at: st.mtimeMs, js };
      return js;
    } catch { return ''; }
  }
  /** read → every frame passes → bundleCanvas → the published-pages store (srcKey `<host|local>:<dir>`, or the
   *  existing page `pageId` the caller may write). */
  async function publish({ host = null, dir, title = '', makePublic, sessionId = null, conversationId = null, req = null, pageId = null } = {}) {
    const pages = getPublishedPages();
    if (!pages || typeof pages.publishContent !== 'function') return fail('no_pages', 'published pages are not available on this server');
    const r = await readDesign(host, dir);
    if (!r.ok) return r;
    if (r.refusals.length) return fail('not_publishable', `design.json is refused: ${r.refusals[0].why}`, { refusals: r.refusals });
    if (!r.frames.length) return fail('not_publishable', 'the folder holds no artboard (write Main.html first)');
    const bad = r.frames.find((f) => !f.verdict.ok);
    if (bad) return fail('not_publishable', `artboard refused: ${bad.verdict.why}`);
    let srcKey = `${r.host || 'local'}:${r.dir}`;
    if (pageId) {
      const rec = pages.list({}).find((p) => p.id === pageId);
      if (!rec) return fail('page_not_found', `no published page ${pageId}`);
      const mine = (sessionId && rec.sessionId === sessionId) || (conversationId && rec.conversationId === conversationId);
      if (!mine) return fail('page_forbidden', `page ${pageId} was not published by this conversation — publish without --page for its own URL`);
      srcKey = rec.srcKey;
    }
    const files = {};
    for (const f of r.frames) files[f.file] = f.html;
    const html = M.bundleCanvas({ manifest: r.manifest, files, runtimeJs: await runtimeJs() });
    const size = M.sizeVerdict(Buffer.byteLength(html, 'utf8'));
    if (!size.ok) return fail('too_big', size.why);
    const p = pages.publishContent({ html, name: cleanTitle(title) || r.title, srcKey, srcPath: r.dir, makePublic, sessionId, conversationId, req });
    if (!p || p.error) return fail('publish_failed', (p && p.error) || 'the page store refused it');
    return { ok: true, page: p.page, size, frames: r.frames.length };
  }

  // ── the agent's view of a read: every string a file of the folder wrote, through THE belt ──
  const line = (v, max = 400) => agentText(v == null ? '' : v, { kind: 'line', max });
  const block = (v, max = M.LIMITS.noteText) => agentText(v == null ? '' : v, { kind: 'block', max });
  /** An agent never gets the inlined HTML (it has the files): the verdicts, the layout, the words — belted. */
  function agentView(r) {
    if (!r || !r.ok) return r;
    const size = M.sizeVerdict(r.totalBytes);
    return {
      ok: true, host: r.host, dir: r.dir, title: line(r.title, M.LIMITS.title),
      refusals: r.refusals.map((x) => ({ code: x.code, where: line(x.where, 120), why: line(x.why) })),
      warnings: r.warnings.map((x) => ({ code: x.code, where: line(x.where, 120), why: line(x.why) })),
      pages: r.pages.map((p) => ({ id: p.id, name: line(p.name, M.LIMITS.pageName) })),
      frames: r.frames.map((f) => ({ file: f.file, title: line(f.title, M.LIMITS.title), x: f.x, y: f.y, w: f.w, h: f.h, page: f.page, placed: f.placed, bytes: f.bytes, ok: !!f.verdict.ok, ...(f.verdict.ok ? {} : { code: f.verdict.code, why: line(f.verdict.why) }) })),
      notes: r.notes.map((n) => ({ id: n.id, color: n.color, page: n.page || null, text: block(n.text) })),
      launch: r.launch, totalBytes: r.totalBytes, size: { ok: size.ok, warn: !!size.warn, why: size.why || null },
    };
  }

  /** The window opens (or comes to the front) on a session's clients: the openSpec rides a `design-open` push. */
  function openOn(session, sessionId, d) {
    broadcastToSession(session, sessionId, { type: 'design-open', sessionId, design: d, openSpec: { action: 'openDesign', host: d.host || null, dir: d.dir, sessionId } });
  }
  /** A registry row for an agent: its title is the registrant's words (another session of a shared folder) — belted. */
  const agentRow = (d) => ({ id: d.id, host: d.host, dir: d.dir, title: line(d.title, M.LIMITS.title), openedAt: d.openedAt });

  return {
    register, list, openOn, agentRow, find: (host, dir) => { const d = dirOf(dir); const r = d ? find(hostOf(host), d) : null; return r ? pub(r) : null; }, pageOf: (host, dir) => pageOf(find(hostOf(host), dirOf(dir))),
    read, readDesign, watch, unwatch, unwatchSocket, sweepOnce, changed, comment, publish, agentView,
    flush: () => saving, _watches: watches, STATUS,
  };
}

module.exports = { create, STATUS, DESIGN_COMMENT_FROM, remoteReadScript, parseRemoteRead, dirOf };

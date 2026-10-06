'use strict';
// THE SEARCH INDEX WORKER (lane global-search, .221). The second file that
// names node:sqlite (test-architecture §73 holds the census): it owns the only
// connection to ~/.vibespace/db/<hash of data/'s real path>/search.db and runs
// every statement — and every transcript parse — on its own thread. Messages
// are {id, op, payload} → {id, ok, result | error}, one FIFO in arrival order.
//
// The transcripts and files stay the record; this database is a REBUILDABLE
// INDEX on local disk (design 011's storage ruling): a schema mismatch drops
// and rebuilds it, a corrupt file is deleted and rebuilt, a full disk turns it
// off by name. HARNESS-NEUTRAL: a transcript is read through its descriptor's
// own reader (store.locate / store.createReader) and the registry's normalizer
// (createMessageManager) — this file names no harness and parses no raw shape.
//
// RESUME: cursor(file) = {size, mtime, lines}. A conversation whose transcript
// matches its cursor is not read again; a file is committed together with its
// cursor in ONE transaction, so a kill anywhere loses at most that file. A file
// is marked `trying` (committed) before its parse — a worker that dies on it
// (its heap cap) finds the mark at the next start and skips that file by name.
const fs = require('fs');
const path = require('path');
const { parentPort, workerData, isMainThread } = require('worker_threads');
const M = require('./search-model.js');

if (isMainThread) throw new Error('search-index-worker runs only in a worker thread — the main thread never opens the search index');

const { dbDir, dataReal, buffersDir = null } = workerData;
const ctl = new Int32Array(workerData.ctl); // [0] CLOSED (set here) · [1] CLOSE asked
const DB_FILE = path.join(dbDir, 'search.db');
const SCHEMA_VERSION = 1;
const TOKENIZE = "tokenize = 'unicode61 remove_diacritics 2'";
const SCHEMA = [
  'CREATE TABLE msg (id INTEGER PRIMARY KEY, sid TEXT NOT NULL, host TEXT NOT NULL DEFAULT \'\', backend TEXT, mid TEXT NOT NULL, ts INTEGER, role TEXT, body TEXT NOT NULL, UNIQUE (host, sid, mid))',
  `CREATE VIRTUAL TABLE msg_fts USING fts5 (body, content = 'msg', content_rowid = 'id', ${TOKENIZE}, detail = full)`,
  'CREATE TABLE art (id INTEGER PRIMARY KEY, sessionId TEXT, host TEXT NOT NULL DEFAULT \'\', path TEXT NOT NULL, mtime INTEGER, kind TEXT, skipped TEXT, body TEXT NOT NULL DEFAULT \'\', UNIQUE (host, path))',
  `CREATE VIRTUAL TABLE art_fts USING fts5 (body, content = 'art', content_rowid = 'id', ${TOKENIZE}, detail = full)`,
  'CREATE TABLE cursor (file TEXT PRIMARY KEY, sid TEXT, host TEXT, size INTEGER, mtime INTEGER, lines INTEGER, state TEXT)',
  'CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)',
];

const post = (m) => { try { parentPort.postMessage(m); } catch { } };
const state = (s, extra = {}) => post({ ev: 'state', state: s, ...extra });
const closing = () => Atomics.load(ctl, 1) === 1;
const SQLITE = { 5: 'SQLITE_BUSY', 6: 'SQLITE_LOCKED', 8: 'SQLITE_READONLY', 10: 'SQLITE_IOERR', 11: 'SQLITE_CORRUPT', 13: 'SQLITE_FULL', 14: 'SQLITE_CANTOPEN', 26: 'SQLITE_NOTADB' };
const codeOf = (e) => (e && typeof e.errcode === 'number' ? (SQLITE[e.errcode & 0xff] || `SQLITE_${e.errcode}`) : (e && e.code) || 'ERROR');

let DatabaseSync;
try {
  const emit = process.emitWarning; // node:sqlite's ExperimentalWarning is expected here (the usage index's rule)
  process.emitWarning = function (w, ...rest) { if (/SQLite is an experimental feature/.test(String((w && w.message) || w))) return; return emit.call(this, w, ...rest); };
  try { ({ DatabaseSync } = require('node:sqlite')); } finally { process.emitWarning = emit; }
} catch (e) { state('disabled', { reason: 'no-node-sqlite', code: e && e.code, detail: process.version }); }

let db = null, S = null, disabled = !DatabaseSync;
const removeDbFiles = () => { for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) { try { fs.unlinkSync(f); } catch { } } };

function openOnce() {
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA locking_mode = EXCLUSIVE');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  try { fs.chmodSync(DB_FILE, 0o600); } catch { }
  return db.prepare('PRAGMA user_version').get().user_version;
}

function open() {
  fs.mkdirSync(dbDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dbDir, 'owner.json'), JSON.stringify({ dataDir: dataReal, at: Date.now() }) + '\n');
  let uv, rebuilt = null;
  try { uv = openOnce(); } catch (e) {
    const code = codeOf(e);
    if (code !== 'SQLITE_CORRUPT' && code !== 'SQLITE_NOTADB') throw e;
    try { db.close(); } catch { }
    removeDbFiles(); rebuilt = 'corrupt';
    uv = openOnce();
  }
  if (uv !== SCHEMA_VERSION) {
    const fresh = uv === 0 && db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n === 0;
    if (!fresh) { db.close(); removeDbFiles(); openOnce(); rebuilt = `schema ${uv} → ${SCHEMA_VERSION}`; }
    db.exec('BEGIN');
    for (const s of SCHEMA) db.exec(s);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  }
  S = {
    insMsg: db.prepare('INSERT OR IGNORE INTO msg (sid, host, backend, mid, ts, role, body) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    ftsMsg: db.prepare('INSERT INTO msg_fts (rowid, body) VALUES (?, ?)'),
    delMsgFts: db.prepare("INSERT INTO msg_fts (msg_fts, rowid, body) VALUES ('delete', ?, ?)"),
    msgsOf: db.prepare('SELECT id, body FROM msg WHERE sid = ? AND host = ?'),
    delMsgs: db.prepare('DELETE FROM msg WHERE sid = ? AND host = ?'),
    artOf: db.prepare('SELECT id, body, mtime FROM art WHERE host = ? AND path = ?'),
    insArt: db.prepare('INSERT INTO art (sessionId, host, path, mtime, kind, skipped, body) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    ftsArt: db.prepare('INSERT INTO art_fts (rowid, body) VALUES (?, ?)'),
    delArtFts: db.prepare("INSERT INTO art_fts (art_fts, rowid, body) VALUES ('delete', ?, ?)"),
    delArt: db.prepare('DELETE FROM art WHERE id = ?'),
    cursor: db.prepare('SELECT size, mtime, lines, state FROM cursor WHERE file = ?'),
    putCursor: db.prepare('INSERT OR REPLACE INTO cursor (file, sid, host, size, mtime, lines, state) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    delCursors: db.prepare('DELETE FROM cursor WHERE sid = ? AND host = ?'),
    putMeta: db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)'),
    getMeta: db.prepare('SELECT v FROM meta WHERE k = ?'),
  };
  return rebuilt;
}

const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch { } throw e; } };
const coreMid = (id) => { const s = String(id || ''); const i = s.indexOf(':'); return i >= 0 ? s.slice(i + 1) : s; }; // a card id is `<normalizer's session id>:<record key>` — the record key is the stable part

/** Rows (normalized cards) → inserted rows; a mid already indexed is skipped (UNIQUE). */
function insertMessages(sid, host, backend, msgs) {
  let n = 0;
  for (const m of msgs) {
    const body = M.textOf(m);
    const mid = coreMid(m.mid || m.id);
    if (!body || !mid) continue;
    const r = S.insMsg.run(sid, host || '', backend || null, mid, Number(m.ts) || 0, m.role, body);
    if (r.changes) { S.ftsMsg.run(r.lastInsertRowid, M.segment(body)); n++; }
  }
  return n;
}

function appendMessages({ sid, host = '', backend = null, msgs = [] } = {}) {
  if (!sid || !Array.isArray(msgs)) return { rows: 0 };
  return { rows: tx(() => insertMessages(String(sid), host, backend, msgs)) };
}

/** Clear a conversation's rows (its transcript is gone; a rebuild of one). */
function clearConversation({ sid, host = '' } = {}) {
  return tx(() => {
    const rows = S.msgsOf.all(String(sid), host || '');
    for (const r of rows) S.delMsgFts.run(r.id, M.segment(r.body));
    S.delMsgs.run(String(sid), host || '');
    S.delCursors.run(String(sid), host || '');
    return { removed: rows.length };
  });
}

/** THE BACKFILL STEP: one conversation through its harness's own reader. */
async function indexConversation({ sid, host = '', backend, cwd = '', live = false, maxBytes = 512 * 1024 * 1024 } = {}) {
  const harnesses = require('./harnesses');
  const h = harnesses.get(backend);
  const store = h && h.store;
  if (!store || typeof store.locate !== 'function' || typeof store.createReader !== 'function') return { skipped: 'no-reader' };
  let file = null;
  try { file = store.locate(sid, cwd); } catch { file = null; }
  if (!file) return { skipped: 'no-transcript' };
  let st; try { st = fs.statSync(file); } catch { return { skipped: 'no-transcript' }; }
  const cur = S.cursor.get(file);
  const mtime = Math.floor(st.mtimeMs);
  if (cur && cur.size === st.size && cur.mtime === mtime) return { skipped: cur.state === 'trying' || cur.state === 'failed' ? 'failed-before' : 'same', file };
  if (live && cur && cur.state === 'done') return { skipped: 'live', file }; // a live conversation's new cards arrive through appendMessages
  if (cur && cur.state === 'trying') { S.putCursor.run(file, sid, host, st.size, mtime, 0, 'failed'); return { skipped: 'failed-before', file }; }
  if (st.size > maxBytes) { S.putCursor.run(file, sid, host, st.size, mtime, 0, 'too-large'); return { skipped: 'too-large', file }; }
  S.putCursor.run(file, sid, host, st.size, mtime, cur ? cur.lines : 0, 'trying'); // committed (autocommit): a death on this file is remembered
  const shape = { backend, backendSessionId: sid, cwd, host: host || null, buffer: '' };
  const reader = store.createReader(shape, sid, { buffersDir });
  if (typeof reader.prepare === 'function') { S.putCursor.run(file, sid, host, st.size, mtime, 0, 'serve-backed'); return { skipped: 'serve-backed', file }; }
  const mm = require('./normalizers').createMessageManager(backend, 'ix', { threadId: sid });
  await mm.convertHistoryAsync(reader.raw() || []);
  const msgs = mm.messages || [];
  const rows = tx(() => { const n = insertMessages(sid, host, backend, msgs); S.putCursor.run(file, sid, host, st.size, mtime, msgs.length, 'done'); return n; });
  return { rows, parsed: true, cards: msgs.length, file, bytes: st.size };
}

function removeArtifactRow(host, p) {
  const old = S.artOf.get(host || '', p);
  if (!old) return false;
  if (old.body) S.delArtFts.run(old.id, M.segment(old.body));
  S.delArt.run(old.id);
  return true;
}

/** (Re)index one file a conversation produced. Local files only (host ''):
 *  a remote file is never fetched for the index's sake. */
async function indexArtifact({ sessionId = null, host = '', path: p } = {}) {
  if (typeof p !== 'string' || !p.startsWith('/')) return { skipped: 'bad-path' };
  if (host) return { skipped: 'remote' };
  let st; try { st = fs.statSync(p); } catch { return { removed: tx(() => removeArtifactRow(host, p)) }; }
  if (!st.isFile()) return { skipped: 'not-a-file' };
  const old = S.artOf.get('', p);
  const mtime = Math.floor(st.mtimeMs);
  if (old && old.mtime === mtime) return { skipped: 'same' };
  const k = M.kindOf(p);
  let r;
  if (!k.kind) r = k;
  else if (k.kind === 'docx') {
    let text = null;
    try { if (st.size <= 16 * M.MAX_ARTIFACT_BYTES) text = (await require('mammoth').extractRawText({ path: p })).value; } catch { text = null; }
    r = M.artifactTextOf({ path: p, text });
  } else {
    const fd = fs.openSync(p, 'r');
    try { const b = Buffer.alloc(Math.min(st.size, M.MAX_ARTIFACT_BYTES)); const n = fs.readSync(fd, b, 0, b.length, 0); r = M.artifactTextOf({ path: p, bytes: b.subarray(0, n) }); } finally { fs.closeSync(fd); }
  }
  return tx(() => {
    removeArtifactRow('', p);
    const body = r.text || '';
    const ins = S.insArt.run(sessionId, '', p, mtime, r.kind || null, r.skipped || null, body);
    if (body) S.ftsArt.run(ins.lastInsertRowid, M.segment(body));
    return { kind: r.kind || null, skipped: r.skipped || null, bytes: Buffer.byteLength(body) };
  });
}

function removeArtifact({ host = '', path: p } = {}) { return { removed: tx(() => removeArtifactRow(host, p)) }; }

/** The backfill's housekeeping: a local file gone since it was indexed leaves the index. */
function sweepArtifacts() {
  const gone = db.prepare("SELECT path FROM art WHERE host = ''").all().filter((r) => !fs.existsSync(r.path)).map((r) => r.path);
  if (gone.length) tx(() => { for (const p of gone) removeArtifactRow('', p); });
  return { removed: gone.length };
}

/** THE QUERY: the index answers whole — a query never reads a transcript. */
function search({ q = '', scope = 'all', limit = 50, offset = 0 } = {}) {
  const t0 = Date.now();
  const match = M.queryFor(q);
  const terms = M.highlightTerms(q);
  const lim = Math.max(1, Math.min(200, Number(limit) || 50)), off = Math.max(0, Number(offset) || 0);
  const out = { hits: [], total: 0, groups: [] };
  if (!match) return { ...out, took: Date.now() - t0, empty: 'no-words' };
  // conversations first (GROUP BY: one dominant conversation never hides the others), best bm25 then recency;
  // then ≤ PER hits of each chosen conversation
  const PER = 20, SCORED = 200000; // a LIMITed subquery: bm25() cannot sit inside an aggregate, and the bound caps one query's work
  const groups = [];
  if (scope === 'all' || scope === 'chats') {
    for (const g of db.prepare('SELECT sid, host, MIN(score) AS best, MAX(ts) AS ts, COUNT(*) AS n FROM (SELECT m.sid AS sid, m.host AS host, m.ts AS ts, bm25(msg_fts) AS score FROM msg_fts JOIN msg m ON m.id = msg_fts.rowid WHERE msg_fts MATCH ? LIMIT ' + SCORED + ') GROUP BY sid, host').iterate(match)) groups.push({ kind: 'message', ...g });
  }
  if (scope === 'all' || scope === 'artifacts') {
    for (const g of db.prepare("SELECT sid, host, MIN(score) AS best, MAX(ts) AS ts, COUNT(*) AS n FROM (SELECT COALESCE(a.sessionId, '') AS sid, a.host AS host, a.mtime AS ts, bm25(art_fts) AS score FROM art_fts JOIN art a ON a.id = art_fts.rowid WHERE art_fts MATCH ? LIMIT " + SCORED + ') GROUP BY sid, host').iterate(match)) groups.push({ kind: 'artifact', ...g });
  }
  groups.sort((x, y) => (x.best - y.best) || (y.ts - x.ts));
  out.total = groups.reduce((n, g) => n + g.n, 0);
  const msgHits = db.prepare('SELECT m.sid, m.host, m.backend, m.mid, m.ts, m.role, m.body, bm25(msg_fts) AS score FROM msg_fts JOIN msg m ON m.id = msg_fts.rowid WHERE msg_fts MATCH ? AND m.sid = ? AND m.host = ? ORDER BY score, m.ts DESC LIMIT ?');
  const artHits = db.prepare("SELECT a.sessionId, a.host, a.path, a.mtime, a.kind, a.body, bm25(art_fts) AS score FROM art_fts JOIN art a ON a.id = art_fts.rowid WHERE art_fts MATCH ? AND COALESCE(a.sessionId, '') = ? AND a.host = ? ORDER BY score, a.mtime DESC LIMIT ?");
  for (const g of groups.slice(off, off + lim)) {
    out.groups.push({ kind: g.kind, sid: g.sid || null, host: g.host, count: g.n });
    if (g.kind === 'message') for (const r of msgHits.iterate(match, g.sid, g.host, PER)) out.hits.push({ kind: 'message', sid: r.sid, host: r.host, backend: r.backend, uuid: r.mid, ts: r.ts, role: r.role, snippet: M.snippetOf(r.body, terms) });
    else for (const r of artHits.iterate(match, g.sid, g.host, PER)) out.hits.push({ kind: 'artifact', sessionId: r.sessionId, host: r.host, path: r.path, mtime: r.mtime, fileKind: r.kind, snippet: M.snippetOf(r.body, terms) });
  }
  return { ...out, took: Date.now() - t0 };
}

function status() {
  const n = (sql) => db.prepare(sql).get().n;
  let bytes = 0;
  for (const f of [DB_FILE, DB_FILE + '-wal']) { try { bytes += fs.statSync(f).size; } catch { } }
  const lb = S.getMeta.get('lastBuild');
  return {
    rows: n('SELECT COUNT(*) AS n FROM msg'), artifacts: n("SELECT COUNT(*) AS n FROM art WHERE body != ''"), conversations: n("SELECT COUNT(*) AS n FROM cursor WHERE state = 'done'"),
    textBytes: n('SELECT COALESCE(SUM(LENGTH(CAST(body AS BLOB))), 0) AS n FROM msg') + n('SELECT COALESCE(SUM(LENGTH(CAST(body AS BLOB))), 0) AS n FROM art'),
    bytes, lastBuild: lb ? Number(lb.v) : null, skipped: db.prepare("SELECT state, COUNT(*) AS n FROM cursor WHERE state != 'done' GROUP BY state").all(), userVersion: SCHEMA_VERSION,
  };
}

/** Rebuild: every row and cursor dropped; the owner walks again. */
function drop() {
  tx(() => { for (const t of ['msg', 'art', 'cursor']) db.exec(`DELETE FROM ${t}`); db.exec("INSERT INTO msg_fts (msg_fts) VALUES ('delete-all')"); db.exec("INSERT INTO art_fts (art_fts) VALUES ('delete-all')"); });
  try { db.exec('VACUUM'); } catch { }
  return { dropped: true };
}

function closeDb() {
  if (db) { try { db.close(); } catch { } db = null; }
  Atomics.store(ctl, 0, 1);
  Atomics.notify(ctl, 0);
}

function failed(e) {
  const code = codeOf(e);
  disabled = true;
  if (db) { try { db.close(); } catch { } db = null; }
  if (code === 'SQLITE_FULL' || code === 'ENOSPC' || code === 'EDQUOT') removeDbFiles();
  state('disabled', { reason: code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' ? 'locked-by-another-server' : 'write-failed', code, detail: String((e && e.message) || e).slice(0, 200) });
}

if (!disabled) {
  try { const rebuilt = open(); state('ready', { rebuilt, ...status() }); } catch (e) { failed(e); }
}

const OPS = { appendMessages, clearConversation, indexConversation, indexArtifact, removeArtifact, sweepArtifacts, search, status, drop,
  noteBuild: ({ at } = {}) => { S.putMeta.run('lastBuild', String(Number(at) || Date.now())); return { ok: true }; } };

// ONE FIFO: an async op (a parse) holds the queue until it is done.
let chain = Promise.resolve();
parentPort.on('message', (msg) => {
  const { id, op, payload } = msg || {};
  // close at once, between two statements (this thread runs one thing at a time): an op still queued finds no db and says so
  if (op === 'close') { closeDb(); post({ id, ok: true, result: { closed: true } }); return; }
  chain = chain.then(async () => {
    if (disabled || !db || closing()) { post({ id, ok: false, error: { message: 'search index unavailable', reason: disabled ? 'disabled' : 'closing' } }); return; }
    try {
      if (!OPS[op]) throw Object.assign(new Error(`unknown op ${op}`), { code: 'EBADOP' });
      post({ id, ok: true, result: await OPS[op](payload || {}) });
    } catch (e) {
      const code = codeOf(e);
      if (/^SQLITE_(FULL|IOERR|READONLY|CANTOPEN|BUSY|LOCKED|CORRUPT|NOTADB)/.test(code) || e.code === 'ENOSPC' || e.code === 'EDQUOT') failed(e);
      post({ id, ok: false, error: { message: String((e && e.message) || e).slice(0, 300), code } });
    }
  });
});

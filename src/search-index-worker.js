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
//
// A CLEARED GROUP MESSAGE (B-b291): the owner hands the cleared records' card
// keys and witnesses (setCleared — the FIRST op of every worker; addCleared at a
// clear). They live in this thread's memory only. Every row is judged at its
// write (judgeRow: a card of the cleared record is the sentence; a line that
// carries its witness, in a card of that group or a report naming it, is the
// sentence line); a clear rewrites the rows already written (sweepCleared).
// Schema 2 keeps each row's group (`grp`, the card's peerGroup) for that sweep.
const fs = require('fs');
const path = require('path');
const { parentPort, workerData, isMainThread } = require('worker_threads');
const { answerMemory } = require('./worker-memory.js');
const M = require('./search-model.js');
const RC = require('./record-clear.js'); // PURE: the cleared sentence + the witness rule the ladder's judge uses (B-b291)
const AN = require('./assistant-note.js'); // PURE (B-19bd): THE verdict «did the person type this record?» — personRow
const crypto = require('crypto');

if (isMainThread) throw new Error('search-index-worker runs only in a worker thread — the main thread never opens the search index');

const { dbDir, dataReal, buffersDir = null } = workerData;
const ctl = new Int32Array(workerData.ctl); // [0] CLOSED (set here) · [1] CLOSE asked
const DB_FILE = path.join(dbDir, 'search.db');
const SCHEMA_VERSION = 3; // 2 (B-b291): msg.grp — a schema change drops and rebuilds the index, so the rows written before it are judged too; 3 (B-19bd): msg.who
const TOKENIZE = "tokenize = 'unicode61 remove_diacritics 2'";
const SCHEMA = [
  'CREATE TABLE msg (id INTEGER PRIMARY KEY, sid TEXT NOT NULL, host TEXT NOT NULL DEFAULT \'\', backend TEXT, mid TEXT NOT NULL, ts INTEGER, role TEXT, body TEXT NOT NULL, grp TEXT, who TEXT, UNIQUE (host, sid, mid))',
  'CREATE INDEX msg_grp ON msg (grp) WHERE grp IS NOT NULL',
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
  db.exec('PRAGMA secure_delete = ON'); // B-b291: a cleared message's rewritten row leaves no old bytes in the table's free pages (the FTS segments keep their tokens until they merge — declared)
  try { fs.chmodSync(DB_FILE, 0o600); } catch { }
  return db.prepare('PRAGMA user_version').get().user_version;
}

// THE STEP THAT KEEPS THE ROWS (B-b291 cure r2, the reader's N1): a release's index is MIGRATED, never dropped — a
// conversation the backfill cannot read again (a harness with no transcript reader: its rows came from the live door) would
// otherwise leave search for good. The step adds its columns; every conversation the backfill CAN read is marked to be read
// again (its rows are replaced then — `migrated` cursors), and every user row is held as a possible peer card (grp '': the
// whole-message rule judges it) until it is. A table set this release does not know is dropped and rebuilt as before.
const ADDED_COLUMNS = [['grp', 'TEXT'], ['who', 'TEXT']]; // who (B-19bd): a migrated row says nothing until its transcript is read again
const KNOWN_TABLES = ['msg', 'msg_fts', 'art', 'art_fts', 'cursor', 'meta'];
function migrate() {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  if (!KNOWN_TABLES.every((t) => tables.has(t))) return false;
  const have = new Set(db.prepare('PRAGMA table_info(msg)').all().map((c) => c.name));
  db.exec('BEGIN');
  try {
    for (const [c, ty] of ADDED_COLUMNS) if (!have.has(c)) db.exec(`ALTER TABLE msg ADD COLUMN ${c} ${ty}`);
    db.exec('CREATE INDEX IF NOT EXISTS msg_grp ON msg (grp) WHERE grp IS NOT NULL');
    if (!have.has('grp')) db.exec("UPDATE msg SET grp = '' WHERE role = 'user'");
    db.exec("UPDATE cursor SET state = 'migrated' WHERE state = 'done'");
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
    return true;
  } catch { try { db.exec('ROLLBACK'); } catch { } return false; }
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
  let migrated = null;
  if (uv !== SCHEMA_VERSION) {
    const fresh = uv === 0 && db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n === 0;
    if (!fresh && uv > 0 && uv < SCHEMA_VERSION && migrate()) migrated = `schema ${uv} → ${SCHEMA_VERSION}, rows kept`;
    else {
      if (!fresh) { db.close(); removeDbFiles(); openOnce(); rebuilt = `schema ${uv} → ${SCHEMA_VERSION}`; }
      db.exec('BEGIN');
      for (const s of SCHEMA) db.exec(s);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      db.exec('COMMIT');
    }
  }
  S = {
    insMsg: db.prepare('INSERT OR IGNORE INTO msg (sid, host, backend, mid, ts, role, body, grp, who) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    setBody: db.prepare('UPDATE msg SET body = ? WHERE id = ?'),
    ofGroup: db.prepare('SELECT id, mid, body, grp FROM msg WHERE grp = ?'),
    namingFts: db.prepare('SELECT m.id, m.mid, m.body, m.grp FROM msg_fts JOIN msg m ON m.id = msg_fts.rowid WHERE msg_fts MATCH ? AND instr(m.body, ?) > 0'),
    wordsFts: db.prepare('SELECT m.id, m.mid, m.body, m.grp FROM msg_fts JOIN msg m ON m.id = msg_fts.rowid WHERE msg_fts MATCH ?'),
    wordsScan: db.prepare('SELECT id, mid, body, grp FROM msg WHERE instr(body, ?) > 0'),
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
  return { rebuilt, migrated };
}

const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch { } throw e; } };
const coreMid = (id) => { const s = String(id || ''); const i = s.indexOf(':'); return i >= 0 ? s.slice(i + 1) : s; }; // a card id is `<normalizer's session id>:<record key>` — the record key is the stable part

// ── B-b291: THE CLEARED GROUP MESSAGES (this thread's memory only) ──
// gid → {keys: Set('<gid>:<record instant>'), ws: witnesses ≥ SUBSTRING_FLOOR units (looked for inside a line), short: the
// shorter ones (a whole line only), wholes: Map(digest of a whole folded form → its length)}
let CL = new Map();
let partial = false, insertedWhilePartial = 0; // a worker's first set may be the owner's cache only — the whole set follows (addCleared whole)
const WHOLE_LENS = new Set();
const SUBSTRING_FLOOR = 12; // the reader's F6: a 4-unit witness («done», «👍👍») inside every line of a group cleared too much
const WHOLE_FLOOR = 12;     // a row that names no group is cleared whole only by a message at least this long
const GID_RE = /^g-[0-9a-f]{8}$/;
// the group a row is of: a card's peerGroup; '' = a PEER card that names no group (a harness that drops it); null = any
// other row (the person's, an agent's) — never judged as a whole cleared message (the readers' should: no false hide)
const groupOfCard = (m) => { const id = m && m.peerGroup && m.peerGroup.id; if (typeof id === 'string' && GID_RE.test(id)) return id; return m && (m.peerCard === true || m.originKind === 'peer-message') ? '' : null; };
const fold = (s) => String(s).replace(/\s+/g, ' ').trim();
const digest = (f) => crypto.createHash('sha256').update(f).digest('base64').slice(0, 22); // the groups engine's wholeDigest
/** Merge the owner's copies into the set → {gid: the NEW facts of it} (what a sweep looks for). */
function takeCleared(groups) {
  const fresh = {};
  for (const [gid, c] of Object.entries(groups && typeof groups === 'object' ? groups : {})) {
    if (!GID_RE.test(gid) || !c) continue;
    const ws = (Array.isArray(c.witnesses) ? c.witnesses : []).map((w) => RC.clearWitness(w)).filter(Boolean);
    const prev = CL.get(gid) || { keys: new Set(), ws: [], short: [], wholes: new Map() };
    const nw = ws.filter((w) => !prev.ws.includes(w) && !prev.short.includes(w));
    const nh = (Array.isArray(c.wholes) ? c.wholes : []).filter((x) => x && typeof x.h === 'string' && Number(x.n) > 0 && !prev.wholes.has(x.h));
    for (const x of nh) { prev.wholes.set(x.h, Number(x.n)); WHOLE_LENS.add(Number(x.n)); }
    for (const k of Array.isArray(c.keys) ? c.keys : []) prev.keys.add(String(k));
    prev.ws.push(...nw.filter((w) => w.length >= SUBSTRING_FLOOR)); prev.short.push(...nw.filter((w) => w.length < SUBSTRING_FLOOR));
    CL.set(gid, prev);
    fresh[gid] = { ws: nw, wholes: nh };
  }
  return fresh;
}
/** THE JUDGE every row passes before it is written: `body` as the index may hold it. */
function judgeRow(mid, body, grp) {
  if (!body || !CL.size) return body;
  if (typeof mid === 'string' && mid.startsWith('gm:')) { const k = mid.slice(3), c = CL.get(k.slice(0, k.indexOf(':'))); if (c && c.keys.has(k)) return RC.CLEARED_TEXT; } // a group card IS its record (GC.cardId)
  if (WHOLE_LENS.size) {
    // a row that IS one cleared message (a card holding its words as written — several lines, a harness's PEER card that
    // names no group): whole; a row of another group never, a row that is no peer card never
    const f = fold(body);
    if (WHOLE_LENS.has(f.length)) { const h = digest(f); for (const [gid, c] of CL) if ((grp === '' || grp === gid) && c.wholes.get(h) === f.length && (grp === gid || f.length >= WHOLE_FLOOR)) return RC.CLEARED_TEXT; }
  }
  let out = body;
  for (const [gid, c] of CL) {
    if (grp !== gid && !out.includes(`(${gid})`)) continue; // a report names its group in its head; a card says it in peerGroup
    const r = RC.redactWitnessLines(out, c.ws, c.short, { floor: SUBSTRING_FLOOR }); // a short one only as a whole line (or its «Name: » tail)
    if (r !== null) out = r;
  }
  return out;
}
/** A witness's words as FTS terms (AND), a cut witness (40 code points) without its cut last word; '' = none. */
function wordsQuery(w) {
  const words = M.segment(w).toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);
  if (Array.from(w).length >= 40) words.pop();
  return words.slice(0, 12).map((x) => '"' + x + '"').join(' ');
}
/** Rewrite the rows already written that hold a cleared message — `fresh` = {gid: the new facts} (in one transaction). */
function sweepCleared(fresh) {
  let n = 0;
  const seen = new Set();
  const judge = (r) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    const nb = judgeRow(r.mid, r.body, r.grp);
    if (nb === r.body) return;
    S.delMsgFts.run(r.id, M.segment(r.body)); S.setBody.run(nb, r.id); S.ftsMsg.run(r.id, M.segment(nb)); n++;
  };
  for (const [gid, f] of Object.entries(fresh)) {
    if (!CL.has(gid)) continue;
    for (const r of S.ofGroup.all(gid)) judge(r); // every card of the group (msg_grp)
    for (const r of S.namingFts.all(`"g ${gid.slice(2)}"`, `(${gid})`)) judge(r); // every report naming it (its head's id, the reader's F5)
    // a row of NO group that is one whole cleared message (a harness card that carries no group): found by the words
    if (f.wholes.some((x) => x.n >= WHOLE_FLOOR)) for (const w of f.ws) { if (w.length < WHOLE_FLOOR) continue; const q = wordsQuery(w); for (const r of (q ? S.wordsFts.all(q) : S.wordsScan.all(w))) judge(r); }
  }
  return n;
}
const clearedSig = () => crypto.createHash('sha256').update([...CL].map(([g, c]) => g + ':' + [...c.keys].sort().join(',') + ':' + c.ws.length + ':' + c.short.length + ':' + c.wholes.size).sort().join('\n')).digest('hex').slice(0, 32);
const everything = () => Object.fromEntries([...CL].map(([g, c]) => [g, { ws: [...c.ws, ...c.short], wholes: [...c.wholes].map(([h, n]) => ({ h, n })) }]));
/** The owner's first op. `whole` = the whole set (swept unless it is the set last swept); else the owner's cache only —
 *  the whole set follows as addCleared({whole: true}), and a row written in between is swept then. */
function setCleared({ groups, whole = true } = {}) {
  CL = new Map(); WHOLE_LENS.clear();
  takeCleared(groups);
  partial = !whole; insertedWhilePartial = 0;
  return whole ? sweepIfMoved() : { groups: CL.size, partial: true };
}
function sweepIfMoved(force = false) {
  const sig = clearedSig(), was = S.getMeta.get('clearedSig');
  if (!force && was && was.v === sig) return { groups: CL.size, swept: 0, same: true };
  const out = { groups: CL.size, swept: tx(() => { const n = sweepCleared(everything()); S.putMeta.run('clearedSig', sig); return n; }) };
  checkpointAfter(out.swept);
  return out;
}
/** A clear (that group's new facts swept), or the whole set after a cache-only start (`whole`). */
function addCleared({ groups, whole = false } = {}) {
  const fresh = takeCleared(groups);
  if (whole) { const force = partial && insertedWhilePartial > 0; partial = false; insertedWhilePartial = 0; return sweepIfMoved(force); }
  const out = { groups: Object.keys(fresh).length, swept: tx(() => { const n = sweepCleared(fresh); S.putMeta.run('clearedSig', clearedSig()); return n; }) };
  checkpointAfter(out.swept);
  return out;
}
/** A sweep that rewrote rows: the WAL's older page images (the words before) are folded into the file and dropped. */
function checkpointAfter(n) { if (n > 0) { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { } } }

/** B-19bd: WHO WROTE A USER ROW — null = the person typed it; else the person-row verdict's why (a peer, a notice, a
 *  compaction summary…). The live door hands it (`who`: it judged the whole card); the backfill judges the card here. */
const whoOf = (m) => { if (m.role !== 'user') return null; if (Object.prototype.hasOwnProperty.call(m, 'who')) return typeof m.who === 'string' && m.who ? m.who : null; const v = AN.personRow(m); return v.person ? null : v.why; };
/** Rows (normalized cards) → inserted rows; a mid already indexed is skipped (UNIQUE). */
function insertMessages(sid, host, backend, msgs) {
  let n = 0;
  for (const m of msgs) {
    const mid = coreMid(m.mid || m.id);
    const grp = groupOfCard(m);
    const body = judgeRow(mid, M.textOf(m), grp);
    if (!body || !mid) continue;
    if (partial) insertedWhilePartial++;
    const r = S.insMsg.run(sid, host || '', backend || null, mid, Number(m.ts) || 0, m.role, body, grp, whoOf(m));
    if (r.changes) { S.ftsMsg.run(r.lastInsertRowid, M.segment(body)); n++; }
  }
  return n;
}

function appendMessages({ sid, host = '', backend = null, msgs = [] } = {}) {
  if (!sid || !Array.isArray(msgs)) return { rows: 0 };
  return { rows: tx(() => insertMessages(String(sid), host, backend, msgs)) };
}

/** A conversation's rows out of the table and its FTS (the caller holds the transaction). */
function dropRowsOf(sid, host) { const rows = S.msgsOf.all(String(sid), host || ''); for (const r of rows) S.delMsgFts.run(r.id, M.segment(r.body)); S.delMsgs.run(String(sid), host || ''); return rows.length; }
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
  const reread = !!cur && cur.state === 'migrated'; // B-b291 cure r2: written by the release before the schema step — read again, its rows replaced
  if (cur && !reread && cur.size === st.size && cur.mtime === mtime) return { skipped: cur.state === 'trying' || cur.state === 'failed' ? 'failed-before' : 'same', file };
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
  const rows = tx(() => { if (reread) dropRowsOf(sid, host); const n = insertMessages(sid, host, backend, msgs); S.putCursor.run(file, sid, host, st.size, mtime, msgs.length, 'done'); return n; });
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
  const msgHits = db.prepare('SELECT m.sid, m.host, m.backend, m.mid, m.ts, m.role, m.body, m.who, bm25(msg_fts) AS score FROM msg_fts JOIN msg m ON m.id = msg_fts.rowid WHERE msg_fts MATCH ? AND m.sid = ? AND m.host = ? ORDER BY score, m.ts DESC LIMIT ?');
  const artHits = db.prepare("SELECT a.sessionId, a.host, a.path, a.mtime, a.kind, a.body, bm25(art_fts) AS score FROM art_fts JOIN art a ON a.id = art_fts.rowid WHERE art_fts MATCH ? AND COALESCE(a.sessionId, '') = ? AND a.host = ? ORDER BY score, a.mtime DESC LIMIT ?");
  for (const g of groups.slice(off, off + lim)) {
    out.groups.push({ kind: g.kind, sid: g.sid || null, host: g.host, count: g.n });
    if (g.kind === 'message') for (const r of msgHits.iterate(match, g.sid, g.host, PER)) out.hits.push({ kind: 'message', sid: r.sid, host: r.host, backend: r.backend, uuid: r.mid, ts: r.ts, role: r.role, ...(r.role === 'user' && r.who ? { other: r.who } : {}), snippet: M.snippetOf(r.body, terms) }); // other (B-19bd): nobody typed it — whose words it is
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
  try { const { rebuilt, migrated } = open(); state('ready', { rebuilt, migrated, ...status() }); } catch (e) { failed(e); }
}

const OPS = { appendMessages, clearConversation, indexConversation, indexArtifact, removeArtifact, sweepArtifacts, search, status, drop, setCleared, addCleared,
  noteBuild: ({ at } = {}) => { S.putMeta.run('lastBuild', String(Number(at) || Date.now())); return { ok: true }; } };

// ONE FIFO: an async op (a parse) holds the queue until it is done.
let chain = Promise.resolve();
parentPort.on('message', (msg) => {
  if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js) — answered at once, never queued behind the FIFO
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

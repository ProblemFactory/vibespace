'use strict';
// THE USAGE INDEX WORKER (design 011 lane 3, L1). The ONE file that names
// node:sqlite (scripts/test-architecture.mjs §73 holds the census): it owns
// the only connection to ~/.vibespace/db/<hash of data/'s real path>/usage.db
// and runs every statement on its own thread, so the main thread never calls
// DatabaseSync. Messages are {id, op, payload} → {id, ok, result | error},
// taken strictly in arrival order — one FIFO — so a query posted after a push
// is answered after that push is in (read-your-writes, design 011 §2).
//
// The shards stay the record; this database is an index that can be deleted
// and rebuilt at any time. Recovery is by SHARD MARK (size, inode, a hash of
// the first ≤ 4 KiB, the bytes consumed): at start, after a repair rewrote a
// shard, or when a push does not start exactly at the mark, the worker reads
// the shard from its mark (or re-reads it whole). Every chunk commits its rows
// together with its mark, so a kill -9 anywhere loses at most an uncommitted
// chunk and the next start resumes from the last mark.
//
// locking_mode=EXCLUSIVE + journal_mode=WAL on local disk: no -shm file, and a
// second server on the same data/ is refused at once ("database is locked") —
// it reports that by name and never fights for the lock.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parentPort, workerData, isMainThread, threadId } = require('worker_threads');
const { answerMemory } = require('./worker-memory.js');
const M = require('./usage-index-model.js');

if (isMainThread) throw new Error('usage-index-worker runs only in a worker thread — the main thread never opens the usage index');

const { dbDir, ledgerDir, dataReal, maxPages = 0 } = workerData;
const ctl = new Int32Array(workerData.ctl); // [0] CLOSED (set here, waited on by the owner's exit hook) · [1] CLOSE asked
const CHUNK = 16 * 1024 * 1024;
const DB_FILE = path.join(dbDir, 'usage.db');

const post = (m) => { try { parentPort.postMessage(m); } catch { } };
const state = (s, extra = {}) => post({ ev: 'state', state: s, ...extra });
const closing = () => Atomics.load(ctl, 1) === 1;

// SQLite result codes by their primary byte (an extended code such as
// SQLITE_IOERR_WRITE keeps the primary in its low 8 bits).
const SQLITE = { 5: 'SQLITE_BUSY', 6: 'SQLITE_LOCKED', 8: 'SQLITE_READONLY', 10: 'SQLITE_IOERR', 11: 'SQLITE_CORRUPT', 13: 'SQLITE_FULL', 14: 'SQLITE_CANTOPEN', 26: 'SQLITE_NOTADB' };
const codeOf = (e) => (e && typeof e.errcode === 'number' ? (SQLITE[e.errcode & 0xff] || `SQLITE_${e.errcode}`) : (e && e.code) || 'ERROR');

let DatabaseSync;
try {
  // node:sqlite prints an ExperimentalWarning on first load (stability 1.1 on
  // 22.x / 24.x); it is expected here and would only be noise in the log.
  const emit = process.emitWarning;
  process.emitWarning = function (w, ...rest) { if (/SQLite is an experimental feature/.test(String((w && w.message) || w))) return; return emit.call(this, w, ...rest); };
  try { ({ DatabaseSync } = require('node:sqlite')); } finally { process.emitWarning = emit; }
} catch (e) {
  // Node below 22.13 (or 22.5–22.12 without --experimental-sqlite): the shadow
  // is off BY NAME; the server never notices.
  state('disabled', { reason: 'no-node-sqlite', code: e && e.code, detail: process.version });
}

let db = null, stmt = null, disabled = !DatabaseSync;
const removeDbFiles = () => { for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) { try { fs.unlinkSync(f); } catch { } } };

function openOnce() {
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA locking_mode = EXCLUSIVE');
  db.exec('PRAGMA journal_mode = WAL'); // the first access: takes and keeps the exclusive lock (BUSY = another server holds it)
  db.exec('PRAGMA synchronous = NORMAL');
  const uv = db.prepare('PRAGMA user_version').get().user_version;
  return uv;
}

function open() {
  fs.mkdirSync(dbDir, { recursive: true });
  // owner.json names the data/ this index belongs to — scripts/ci.mjs's sweep
  // removes an index directory whose data/ is gone (scratch servers).
  fs.writeFileSync(path.join(dbDir, 'owner.json'), JSON.stringify({ dataDir: dataReal, ledgerDir, at: Date.now() }) + '\n');
  let uv;
  try { uv = openOnce(); } catch (e) {
    const code = codeOf(e);
    if (code !== 'SQLITE_CORRUPT' && code !== 'SQLITE_NOTADB') throw e;
    try { db.close(); } catch { }
    removeDbFiles(); // not a database any more: it is only an index — start over
    uv = openOnce();
  }
  if (uv !== M.SCHEMA_VERSION) {
    const fresh = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n === 0 && uv === 0;
    if (!fresh) { db.close(); removeDbFiles(); openOnce(); } // another schema version, newer or older: delete and rebuild
    db.exec('BEGIN');
    for (const s of M.SCHEMA) db.exec(s);
    db.exec(`PRAGMA user_version = ${M.SCHEMA_VERSION}`);
    db.exec('COMMIT');
  }
  if (maxPages > 0) db.exec(`PRAGMA max_page_count = ${Number(maxPages) | 0}`); // the suite's stand-in for a full disk: SQLite answers SQLITE_FULL exactly as on ENOSPC
  // aggregate's local-time buckets, computed by the same JS Date calls
  db.function('vs_lhour', { deterministic: true }, (ts) => String(new Date(ts).getHours()));
  db.function('vs_lwday', { deterministic: true }, (ts) => String(new Date(ts).getDay()));
  stmt = {
    insert: db.prepare(`INSERT OR IGNORE INTO usage_event (${M.COLS.join(', ')}) VALUES (${M.COLS.map(() => '?').join(', ')})`),
    mark: db.prepare('SELECT shard, size, ino, head_len, head_hash, offset FROM shard_mark WHERE shard = ?'),
    marks: db.prepare('SELECT shard FROM shard_mark'),
    putMark: db.prepare('INSERT OR REPLACE INTO shard_mark (shard, size, ino, head_len, head_hash, offset) VALUES (?, ?, ?, ?, ?, ?)'),
    dropShard: db.prepare('DELETE FROM usage_event WHERE shard = ?'),
    dropMark: db.prepare('DELETE FROM shard_mark WHERE shard = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM usage_event'),
  };
}

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
function readAt(fp, pos, len) {
  const fd = fs.openSync(fp, 'r');
  try { const b = Buffer.alloc(len); const n = fs.readSync(fd, b, 0, len, pos); return n === len ? b : b.subarray(0, n); } finally { fs.closeSync(fd); }
}

/** Insert the complete lines of `buf` (it ends at a newline) — the same line
 *  rule as _loadEvents: split on \n, skip empty and unparsable lines. */
function insertLines(buf, shard) {
  let n = 0;
  for (const line of buf.toString('utf-8').split('\n')) {
    if (!line) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    const row = M.rowOf(ev, shard);
    if (row) { stmt.insert.run(...row); n++; }
  }
  return n;
}

/** Read a shard from `mark.offset` to its end in chunks, each committed with
 *  its advanced mark. Only whole lines are consumed — a torn tail (a crash
 *  mid-append) waits, exactly as memory leaves it. */
function readShard(shard, st, mark) {
  const fp = path.join(ledgerDir, shard);
  let { offset, head_len: headLen, head_hash: headHash } = mark;
  let rows = 0;
  while (offset < st.size) {
    if (closing()) return { rows, aborted: true };
    const buf = readAt(fp, offset, Math.min(CHUNK, st.size - offset));
    const nl = buf.lastIndexOf(10);
    if (nl < 0) break; // a torn last line and nothing after it
    const whole = buf.subarray(0, nl + 1);
    if (!headLen && offset === 0) { headLen = Math.min(M.HEAD_BYTES, whole.length); headHash = sha1(whole.subarray(0, headLen)); }
    db.exec('BEGIN');
    try {
      rows += insertLines(whole, shard);
      offset += whole.length;
      stmt.putMark.run(shard, st.size, st.ino, headLen || 0, headHash || null, offset);
      db.exec('COMMIT');
    } catch (e) { try { db.exec('ROLLBACK'); } catch { } throw e; }
    post({ ev: 'progress', shard, offset }); // a heartbeat: a long read is not a wedged worker
  }
  // nothing whole to read (an empty shard, a torn line alone): still mark it,
  // or every recovery would take an unmarked shard for a new one and re-read it
  if (offset === mark.offset) stmt.putMark.run(shard, st.size, st.ino, headLen || 0, headHash || null, offset);
  return { rows };
}

/** One shard brought level with its file: the mark's verdict, then nothing,
 *  the appended tail, or the whole shard again. */
function recoverShard(shard) {
  const fp = path.join(ledgerDir, shard);
  const mark = stmt.mark.get(shard) || null;
  let st = null;
  try { const s = fs.statSync(fp); st = { size: s.size, ino: s.ino }; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let headHash = null;
  if (st && mark && mark.head_len > 0 && st.size >= mark.head_len) headHash = sha1(readAt(fp, 0, mark.head_len));
  const verdict = M.shardMarkVerdict(st && { ...st, headHash }, mark);
  if (verdict === 'same') return { verdict, rows: 0 };
  if (verdict === 'gone' || verdict === 'rebuild') {
    db.exec('BEGIN');
    try { stmt.dropShard.run(shard); stmt.dropMark.run(shard); db.exec('COMMIT'); } catch (e) { try { db.exec('ROLLBACK'); } catch { } throw e; }
    if (verdict === 'gone') return { verdict, rows: 0 };
    return { verdict, ...readShard(shard, st, { offset: 0, head_len: 0, head_hash: null }) };
  }
  return { verdict, ...readShard(shard, st, mark) };
}

/** Every shard on disk in name order (the order _loadEvents reads them, so
 *  "first row of a rid wins" means the same thing), then marks whose file left. */
function recoverAll(only = null) {
  let files = [];
  try { files = fs.readdirSync(ledgerDir).filter((f) => M.SHARD_RE.test(f)).sort(); } catch { }
  const known = new Set(stmt.marks.all().map((r) => r.shard));
  const todo = only ? [only] : [...new Set([...files, ...known])].sort();
  const out = { shards: 0, rows: 0, rebuilt: [] };
  for (const shard of todo) {
    if (closing()) { out.aborted = true; break; }
    const r = recoverShard(shard);
    if (r.verdict !== 'same') out.shards++;
    if (r.verdict === 'rebuild' || r.verdict === 'gone') out.rebuilt.push(shard);
    out.rows += r.rows || 0;
    if (r.aborted) { out.aborted = true; break; }
  }
  return out;
}

/** THE PUSH (design 011 §2): the rows a commit point just appended, posted in
 *  the same synchronous step. Taken as-is only when they start exactly at the
 *  shard's mark and the file is the one the mark describes; anything else (a
 *  push that never arrived, a rewrite in between, a torn tail before it, the
 *  first build having read past it) re-reads that shard from its mark. */
function ingest({ shard, offset, ino, text }) {
  if (!M.SHARD_RE.test(String(shard))) return { mode: 'refused' };
  const mark = stmt.mark.get(shard) || null;
  const buf = Buffer.from(String(text), 'utf-8');
  const fits = mark ? (mark.offset === offset && Number(mark.ino) === Number(ino)) : offset === 0;
  if (!fits || !buf.length || buf[buf.length - 1] !== 10) { const r = recoverAll(shard); return { mode: 'recovered', rows: r.rows }; }
  const headLen = mark && mark.head_len ? mark.head_len : Math.min(M.HEAD_BYTES, buf.length);
  const headHash = mark && mark.head_len ? mark.head_hash : sha1(buf.subarray(0, headLen));
  db.exec('BEGIN');
  try {
    const rows = insertLines(buf, shard);
    stmt.putMark.run(shard, offset + buf.length, ino, headLen, headHash, offset + buf.length);
    db.exec('COMMIT');
    return { mode: 'push', rows };
  } catch (e) { try { db.exec('ROLLBACK'); } catch { } throw e; }
}

function aggregate(opts = {}) {
  const { sql, params } = M.aggregateSql(opts);
  return M.foldAggregate(db.prepare(sql).iterate(...params), opts.pivots); // streamed: .all() held every grouped row at once (the capped heap)
}

function stats({ check = false } = {}) {
  const out = { threadId, rows: stmt.count.get().n, marks: db.prepare('SELECT shard, size, ino, head_len, offset FROM shard_mark ORDER BY shard').all(), userVersion: db.prepare('PRAGMA user_version').get().user_version };
  if (check) out.integrity = db.prepare('PRAGMA quick_check').get().quick_check;
  out.heapLimitMb = Math.round(require('v8').getHeapStatistics().heap_size_limit / 1048576);
  try { out.bytes = fs.statSync(DB_FILE).size + (fs.existsSync(DB_FILE + '-wal') ? fs.statSync(DB_FILE + '-wal').size : 0); } catch { }
  return out;
}

function closeDb() {
  if (db) { try { db.close(); } catch { } db = null; }
  Atomics.store(ctl, 0, 1);
  Atomics.notify(ctl, 0);
}

// A write that fails for want of room or rights turns the shadow off BY NAME
// (the local disk is 91 % full on the dev box); the server is unaffected. For
// want of ROOM the files go too (verify r1: a build stopped by a full disk left
// 146 MB of a disabled index on it) — they are only an index, the room is the
// server's, and the next start rebuilds. The state is posted LAST: "off" is a
// fact about the disk, so the files are gone before the owner can say so
// (mirror-green-213: posted first, a loaded runner read usage.db + -wal after it).
function failed(e) {
  const code = codeOf(e);
  disabled = true;
  if (db) { try { db.close(); } catch { } db = null; }
  if (code === 'SQLITE_FULL' || code === 'ENOSPC' || code === 'EDQUOT') removeDbFiles();
  state('disabled', { reason: code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' ? 'locked-by-another-server' : 'write-failed', code, detail: String((e && e.message) || e).slice(0, 200) });
}

if (!disabled) {
  const t0 = Date.now();
  try {
    open();
    state('building');
    const r = recoverAll();
    if (!r.aborted) {
      try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { }
      state('ready', { ms: Date.now() - t0, rows: stmt.count.get().n, shards: r.shards, bytes: stats().bytes });
    }
  } catch (e) { failed(e); }
}

parentPort.on('message', (msg) => {
  if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js)
  const { id, op, payload } = msg || {};
  if (op === 'close') { closeDb(); post({ id, ok: true, result: { closed: true } }); return; }
  if (disabled || !db || closing()) { post({ id, ok: false, error: { message: 'usage index unavailable', reason: disabled ? 'disabled' : 'closing' } }); return; }
  try {
    let result;
    if (op === 'ingest') result = ingest(payload);
    else if (op === 'recover') result = recoverAll(payload && payload.shard ? payload.shard : null);
    else if (op === 'aggregate') result = aggregate(payload || {});
    else if (op === 'stats') result = stats(payload || {});
    else throw Object.assign(new Error(`unknown op ${op}`), { code: 'EBADOP' });
    post({ id, ok: true, result });
  } catch (e) {
    const code = codeOf(e);
    if (/^SQLITE_(FULL|IOERR|READONLY|CANTOPEN|BUSY|LOCKED|CORRUPT|NOTADB)/.test(code) || e.code === 'ENOSPC' || e.code === 'EDQUOT') failed(e);
    post({ id, ok: false, error: { message: String((e && e.message) || e).slice(0, 300), code } });
  }
});

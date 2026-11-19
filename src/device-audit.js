'use strict';
/**
 * THE HUB'S DEVICE-ACT AUDIT (lane device-act-audit, design q-042 §3 D4 + D10, 2026-10-19) — ORCH (fs).
 *
 * Every act / code op the hub sends to a device through src/agentd/client.js (THE ONE send point) is ONE line here —
 * src/device-acts.js `lineOf`: {at, id, hostId, machine, op, layer, by, summary, ok, code, outHead, ms}. The 2026-10-19
 * incident showed why: what a stolen hub did on the paired machines was in no record at all (exit-audit holds an agent's
 * exit runs only — 18 pods, 0 lines). The file is data/device-audit.jsonl, a RING of two files (→ .1 at maxBytes,
 * exit-audit's shape: the history is the last ~2 × 10 MiB of lines). Every line is broadcast (`onLine` — the Machines
 * card's 「活动…」 list patches its keyed rows in place) and read back BACKWARDS in chunks, a line parsed only after a raw
 * mark check, and every row judged again on the way out (device-acts `rowOf`: bounded, re-redacted).
 *
 * WHO READS IT: the owner every line (GET /api/hosts/:id/device-acts, the card); an agent only the lines `by` itself
 * (`vibespace-remote audit` — src/server/exit-routes.js; another subject's lines are `human_only`).
 * `byOfReq(req)` = the subject of a cookie request: `human:<a handle of its sign-in>` (12 hex of the cookie's sha256 —
 * never the cookie), `human:local` on an instance nobody signs in to.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DA = require('./device-acts.js');
const { Auth } = require('./auth.js');

const AUDIT_FILE = 'device-audit.jsonl';
const AUDIT_MAX_BYTES = 10 * 1024 * 1024;
const READ_CHUNK = 512 * 1024;
const LIMIT_DEFAULT = 50;
const LIMIT_MAX = 500;
const OLD_RUN = 1000; // consecutive lines older than `since` that end a read

/** The subject of a cookie-authenticated request (never the cookie itself). */
function byOfReq(req) {
  let h = null;
  try { h = Auth.signInHandle(req); } catch { h = null; } // src/auth.js stays the ONE cookie reader (test-auth)
  return h ? 'human:' + h : 'human:local';
}

/** "15m" / "2h" / "3d" / "90s" / a bare number of ms → ms, or null. */
function durationMs(s) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?\s*$/i.exec(String(s == null ? '' : s));
  if (!m) return null;
  const n = Number(m[1]), u = (m[2] || 'ms').toLowerCase();
  return Math.round(n * ({ ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 })[u]);
}

/** B-48a4 (the owner's incident inc-mwlgtu4o-uosz, 2026-11-18: ~1.5 exit commands a second held the hub's loop 200 s in an hour)
 *  — THE ONE APPENDER of the hub's two audit rings (this file's device-audit.jsonl and exit-proxy's exit-audit.jsonl). A line
 *  costs the main loop NO synchronous file call: before, each line was mkdirSync + statSync + appendFileSync (+ renameSync at
 *  the bound) on the data dir, on the main thread — 6 such calls per exit command (measured, hub-loop-stalls/exc/u1), each a
 *  FUSE round trip on the owner's data mount. Now a line is QUEUED here, in order, and THE STORE WRITER's own thread appends
 *  the queue (src/store-writer.js — an append job: the bytes written whole, fsync'd, truncated back on a failure; a burst of
 *  lines is ONE append of at most half the bound). THE RING is the same thread's (`rotateAt`: past the bound the live file
 *  moves to `.1` before the append — store-writer-worker.js), so nothing here stats or renames, on the loop or the threadpool,
 *  and `produce()` hands every queued line to the writer whenever it asks — the hub's exit flush writes the queue, a stop
 *  loses nothing.
 *  WHAT A CRASH CAN LOSE (a SIGKILL, an OOM kill — a stop writes the queue): the lines queued since the last landed append — the writer's pace for the ring (at least 0.5 s, store-pace's floor; on a slow mount its last measured write), up to QUEUE_MAX (4 MB) while the storage does not answer; the run route answers the agent before its line is on disk, so a kill right after a command can drop that command's line from the owner's Commands list (its card and the agent's reply said it ran).
 *  A failed append keeps its lines for the writer's retry; the writer says the failure (its own law, every store); past QUEUE_MAX the oldest unwritten lines go — never one an
 *  append in flight carries, never the newest — said once until a line lands. `pending()` = the lines not known on disk yet
 *  (oldest first): every reader judges them FIRST (the newest) and judges each record ONCE by its own id (a line that landed
 *  but whose answer is not back, a rotation between two reads of the ring). `whenWritten()` = every line queued before it on
 *  disk NOW (the writer's `durable`, its pace set aside) — a reader of the FILE itself (a suite); the hub never waits on it.
 *  ONE journal per file (a second manager on the same data dir gets the same one). `ask(opts)` = the owner's own hand-off to
 *  the store writer, under its timed-sync row's LITERAL name (test-architecture §72) — never a name computed here.
 *  → { append(text, {id}), pending(), whenWritten(), lost(), file } */
const QUEUE_MAX = 4 * 1024 * 1024;   // the unwritten lines' bound (a storage that never answers keeps at most this much in memory)
const JOURNALS = new Map();          // file → its one journal: a SECOND journal() of a file gets the FIRST one (its ask, durable and bound — a second caller's are not used; the hub has one manager of each file, only a suite could build two)
function journal({ file, bound = AUDIT_MAX_BYTES, mode = null, ask, durable, log = () => {} } = {}) {
  if (JOURNALS.has(file)) return JOURNALS.get(file);
  const batchMax = Math.max(1, Math.floor(bound / 2));
  const q = [];                       // {seq, text, bytes, id} not known on disk, oldest first
  let seq = 0, queuedBytes = 0, inFlight = null, dropped = 0;
  let lostTotal = 0, lostAt = null;   // B-f7a6: every line DROPPED since the hub started — a person reads it on the machine's Commands (exit audit) or Activity (device audit) list
  const opts = { produce, onWritten, ...(mode == null ? {} : { mode }), allowEmpty: false, rotateAt: bound, makeDir: true };   // a data dir not made yet is made on the writer's thread (the old code's mkdir per line)
  function produce() {
    if (!q.length) return null;       // nothing queued: equal to the disk — the ONLY null
    let n = 0, bytes = 0;
    while (n < q.length && (n === 0 || bytes + q[n].bytes <= batchMax)) { bytes += q[n].bytes; n++; }
    inFlight = { n };
    return { append: q.slice(0, n).map((x) => x.text).join('') };
  }
  function onWritten(ok) {
    const w = inFlight; inFlight = null;
    if (ok && w) {
      for (const x of q.splice(0, w.n)) queuedBytes -= x.bytes;
      if (dropped) { log(`[audit] ${path.basename(file)}: written again — ${dropped} line${dropped === 1 ? ' was' : 's were'} dropped while the storage did not answer`); dropped = 0; }
    }
    if (q.length) ask(opts);          // the rest (a batch past half the bound, or a failed append's lines for the retry)
  }
  function append(text, { id = null } = {}) {
    const t = String(text);
    const bytes = Buffer.byteLength(t);
    q.push({ seq: ++seq, text: t, bytes, id });
    queuedBytes += bytes;
    while (queuedBytes > QUEUE_MAX) {
      const at = inFlight ? inFlight.n : 0;   // never a line an append in flight carries
      if (q.length <= at + 1) break;          // the newest line always stays
      const [x] = q.splice(at, 1); queuedBytes -= x.bytes; lostTotal++; lostAt = Date.now();
      if (dropped++ === 0) log(`[audit] ${path.basename(file)}: the storage has not answered — the oldest unwritten lines are dropped (bound ${Math.round(QUEUE_MAX / 1048576)} MB; said once until a line lands)`);
    }
    ask(opts);
  }
  const pending = () => q.map((x) => x.text);
  /** every line queued before the call on disk NOW (the writer's pace set aside); false = an append failed (its lines kept) */
  async function whenWritten() {
    const upTo = seq;
    for (let i = 0; i < 64 && q.length && q[0].seq <= upTo; i++) if (!(await durable())) return false;
    return !(q.length && q[0].seq <= upTo);
  }
  /** B-f7a6: the lines dropped since the hub started (the queue's bound, a storage that did not answer) → { total, lastAt } */
  const lost = () => ({ total: lostTotal, lastAt: lostAt });
  const jr = { append, pending, whenWritten, lost, file };
  JOURNALS.set(file, jr);
  return jr;
}
/** A record's OWN id in a raw line, for reading each record once: `own` = 'first' (exit-proxy writes {at, id, …}) or 'last'
 *  (this file writes {…line, at, id}); a field inside a JSON string has its quotes escaped, so it never matches. TOP-LEVEL ONLY
 *  (B-e6c1): an older line with no top-level id never answers a NESTED one (two records sharing it would read as one) — 'first'
 *  takes the match only when no object or list opened before it, 'last' only when nothing but the record's closing brace
 *  follows it; else null (the line is read, not deduplicated) */
function idIn(raw, own = 'last') {
  const k = '"id":"', i = own === 'first' ? raw.indexOf(k) : raw.lastIndexOf(k);
  if (i < 0) return null;
  const j = raw.indexOf('"', i + k.length);
  if (!(j > i)) return null;
  if (own === 'first' ? /[{[]/.test(raw.slice(1, i)) : raw.slice(j + 1).trim() !== '}') return null;   // a nested id: not the record's own
  return raw.slice(i + k.length, j);
}

function create({ dataDir = null, maxBytes = AUDIT_MAX_BYTES, now = () => Date.now(), log = () => {}, onLine = null, writer = null } = {}) {
  const bound = Math.max(64 * 1024, Number(maxBytes) || AUDIT_MAX_BYTES);
  let listener = typeof onLine === 'function' ? onLine : null;
  const W = () => writer || require('./store-writer.js').storeWriter();
  const file = dataDir ? path.join(dataDir, AUDIT_FILE) : null;
  /** B-48a4: this ring's hand-off to the store writer, under its timed-sync row's name */
  function askDevice(o) { return W().dirty(file, { name: 'device-audit.write', ...o }); }
  const jr = dataDir ? journal({ file, bound, mode: 0o600, ask: askDevice, durable: () => W().durable(file), log }) : null;
  /** One line (a device-acts lineOf) → stored + broadcast. Never throws. → the stored record */
  function append(line) {
    const rec = { ...(line && typeof line === 'object' ? line : {}), at: Number(line && line.at) || now(), id: crypto.randomBytes(6).toString('hex') };
    if (jr) { try { jr.append(JSON.stringify(rec) + '\n', { id: rec.id }); } catch (e) { log(`[device-audit] line not queued: ${e.message}`); } }   // B-48a4: off the main loop (journal)
    if (listener) { try { listener(rec); } catch { } }
    return rec;
  }
  /** The newest `limit` rows that match, newest FIRST: `hostId`, `bys` (a list of exact subjects — an agent's own),
   *  `kind` (human | agent | job | system), `layer`, `since` (ms epoch). Read backwards over the ring, stopped at `limit`. */
  function tail({ hostId = null, bys = null, kind = null, layer = null, since = null, limit = LIMIT_DEFAULT } = {}) {
    if (!dataDir) return [];
    const n = Math.max(1, Math.min(LIMIT_MAX, Number(limit) || LIMIT_DEFAULT));
    const hostMark = hostId ? `"hostId":${JSON.stringify(String(hostId))}` : null;
    const byList = Array.isArray(bys) ? bys.filter(DA.validBy) : null;
    if (byList && !byList.length) return [];
    const byMarks = byList ? byList.map((b) => `"by":${JSON.stringify(b)}`) : null;
    const kindMark = kind && DA.BY_KINDS.includes(kind) ? `"by":"${kind}:` : null;
    const sinceAt = Number(since) || 0;
    const out = [];
    // the ring is in append order, which is time order but for a clock that stepped back: the read ends after OLD_RUN
    // consecutive lines older than `since` (a stepped clock's few lines never hide what came after them)
    let old = false, olds = 0;
    const judge = (raw) => {
      if (!raw || (hostMark && !raw.includes(hostMark)) || (byMarks && !byMarks.some((m) => raw.includes(m))) || (kindMark && !raw.includes(kindMark))) return;
      let j = null; try { j = JSON.parse(raw); } catch { return; }
      const r = DA.rowOf(j);
      if (!r) return;
      if (sinceAt && r.at < sinceAt) { if (++olds >= OLD_RUN) old = true; return; }
      olds = 0;
      if ((hostId && r.hostId !== String(hostId)) || (byList && !byList.includes(r.by)) || (kind && DA.kindOf(r.by) !== kind) || (layer && r.layer !== layer)) return;
      out.push(r);
    };
    // B-48a4: the lines not on disk yet are the NEWEST — judged first; every record is judged ONCE by its own id (a line that
    // landed but whose answer is not back, a rotation between the reads of the two ring files)
    const judged = new Set();
    const judgeFile = (raw) => { const id = raw ? idIn(raw, 'last') : null; if (id) { if (judged.has(id)) return; judged.add(id); } judge(raw); };
    const pend = jr ? jr.pending() : [];
    for (let i = pend.length - 1; i >= 0 && out.length < n && !old; i--) judgeFile(pend[i].replace(/\n$/, ''));
    for (const name of [AUDIT_FILE, AUDIT_FILE + '.1']) {
      if (out.length >= n || old) break;
      const f = path.join(dataDir, name);
      let fd = null;
      try {
        const st = fs.statSync(f); fd = fs.openSync(f, 'r');
        let pos = st.size, carry = Buffer.alloc(0);
        while (pos > 0 && out.length < n && !old) {
          const len = Math.min(READ_CHUNK, pos); pos -= len;
          const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, pos);
          const buf = carry.length ? Buffer.concat([b, carry]) : b;
          const nl = buf.indexOf(0x0a);
          if (nl < 0) { carry = buf; continue; }
          const lines = buf.subarray(nl + 1).toString('utf8').split('\n');
          for (let i = lines.length - 1; i >= 0 && out.length < n && !old; i--) judgeFile(lines[i]);
          carry = buf.subarray(0, nl);
        }
        if (pos === 0 && out.length < n && !old && carry.length) judgeFile(carry.toString('utf8'));
      } catch { /* no such file: the next ring file, or nothing */ }
      finally { if (fd !== null) { try { fs.closeSync(fd); } catch { } } }
    }
    return out;
  }
  const whenWritten = () => (jr ? jr.whenWritten() : Promise.resolve(true));
  const lost = () => (jr ? jr.lost() : { total: 0, lastAt: null });   // B-f7a6: the route hands it to the Activity list
  return { append, tail, whenWritten, lost, set onLine(f) { listener = typeof f === 'function' ? f : null; }, get onLine() { return listener; }, file: dataDir ? path.join(dataDir, AUDIT_FILE) : null };
}

module.exports = { create, journal, idIn, byOfReq, durationMs, AUDIT_FILE, AUDIT_MAX_BYTES, LIMIT_DEFAULT, LIMIT_MAX, QUEUE_MAX };

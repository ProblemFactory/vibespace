'use strict';
// THE HOLD ROAD OF THE USAGE LEDGER (lane ledger-dedup-law, B-7f9e): the remote ingest split by month, the growth alarm's
// pause, a month out of shape HELD beside the ledger — its generations, set files, read-backs, drain and count — the
// methods of UsageHistory (src/usage-history.js) only a hub's own instance runs. Moved here VERBATIM from usage-history.js
// in r11 (test-cache-bounds §30: the usage fold worker requires usage-history.js and its baseline heap grew 0.32 MB with
// this code); the first UsageHistory constructed puts them on its prototype (`holdRoadInstall`) — the fold worker never
// constructs one. `this` is the UsageHistory: these are its methods. The names from holdRoadScope are usage-history.js's.
const fs = require('fs');
const path = require('path');
const LD = require('./usage-ledger-dedup.js'); // a shard's sampled shape + the streaming dedup
const { timedSync, WARM_SLICE_BYTES, REMEDY_STATES, ackOf, LIVE } = require('./usage-history.js').holdRoadScope;
// F1 THE LEDGER LAW (a re-emission costs zero bytes): the ingest's own rid index per shard — the `h:` rids it holds, read
// once (streaming; inline while the unread part is ≤ INGEST_IX_INLINE_BYTES, else a step per turn while the batch waits),
// kept current by every append. F4 THE GROWTH ALARM: a shard over SHAPE_MAX_BYTES, or whose sampled rows / unique rids is
// over SHAPE_MAX_RATIO (from SHAPE_RATIO_MIN_BYTES — a small file costs nothing), PAUSES the host that ingests into it.
const INGEST_IX_INLINE_BYTES = 8 * WARM_SLICE_BYTES;
const SHAPE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const SHAPE_MAX_RATIO = 2;
const SHAPE_RATIO_MIN_BYTES = 64 * 1024 * 1024;
const SHAPE_RESAMPLE_BYTES = 64 * 1024 * 1024, SHAPE_RESAMPLE_MS = 10 * 60e3; // a shard's sampled shape is read again past either
const DUP_LOG_MS = 10 * 60e3; // the ingest's duplicates line: once per host per this, with the counts since the last line
const REMEDY_RETRY_MS = 10 * 60e3, REMEDY_RETRY_MAX_MS = 6 * 3600e3; // r2: a paused shard's dedup that did not bring it back in shape runs again at a later pause past this (doubling per try)
// r4: A PAUSE IS A FACT ABOUT ONE SHARD (host × month), never about a host — the batch is split by month at the ingest; a
// month out of shape is HELD beside the ledger (`_held/<month>~<host>.<seq>.ndjson`: the rows as they would be appended)
// and ingested IN ORDER through the ingest's own law once it is back in shape; every other month ingests as usual and the
// hub's copy of the device cursor moves past the whole batch — nothing is refused whole. Bounded: ≤ HOLD_MAX_BYTES per
// host × month, in segments of ≤ HOLD_SEG_BYTES; past the bound the OLDEST segment goes and every row it held is COUNTED
// (`dropped`: the notice and the Usage window say how many; a marker line keeps the count across a restart).
// r5: that count is a SET, never an increment — the dropped segments' ids (`s<seq>` → the rows it held) and the rows a batch
// alone past the bound lost (`c<seq>@<offset>` → how many); every marker line carries the WHOLE set and is written BEFORE
// the segments it names are unlinked, so a crash between the two leaves a segment the read-back drops WITHOUT counting it
// again (an increment replayed after such a crash said 24 dropped for 20 sent, and called 4 recorded rows «never recorded»)
// r6: the set is a set of ROWS — the dropped rows' rids, never a position (r5 keyed a cut by `c<seq>@<offset>` and a
// segment by its seq: a window over the bound RE-SENT by an older daemon was held again while its old entry still counted
// it — 30 → 45 → … → 125 «never recorded» for 30 sent). It lives beside the hold (`<month>~<host>.<gen>.dropped`: lines
// `{"gone":[rid…]}` / `{"back":[rid…]}`, appended BEFORE the rows and the unlinks, compacted by a rename); a re-sent row
// the set holds is held again only where the append fits without dropping another (it then leaves the set — recorded
// after all), else it stays dropped, counted once and never re-written. A hold's GENERATION is in its segments' numbers
// (gen × HOLD_GEN_SPAN + i) and minted only once the previous hold of the month drained — a drained hold whose unlinks
// failed (EBUSY on the NFS data dir) is a stale generation: its files are unlinked at the read-back, never read, and never
// name the new hold's rows (r5 restarted the numbers at 0: the stale set dropped the new segments at the read-back).
// r7: THE DISK NEVER SAYS «DROPPED» ABOUT A ROW MEMORY STILL HOLDS — an append's order is the rows, then the set's lines
// naming only what the rows' append confirmed (`gone`, `back`, `below`: every segment numbered under it is done), then
// the unlinks; an append that throws (ENOSPC, EDQUOT, EMFILE — a part of it may have landed) is cut back to the length
// it had, and the hold is as it was on disk AND in memory (r6 wrote the set first: a rows append that threw left a set
// naming live, acked segments, and a restart deleted them as «dropped»; a torn set line glued the next one to it). A
// drained row leaves the segment it was read from and the bound counts UNDRAINED bytes (r6 counted a draining segment's
// recorded rows as dropped when a harvest pushed it out mid-drain). What is done is RECORDED before its files can be left
// behind — `below` when a drained segment's unlink fails, `retired` before a hold's last unlink — so a read-back unlinks
// them unread whether or not a newer generation exists (r6 told a stale generation only by a newer one). A listing of
// `_held/` that fails (EIO) is no empty disk: the month's batch waits, unacked, never a hold minted on the live one.
// r8: A RECORD OUTLIVES EVERY FILE IT DESCRIBES — a set file (its `retired`, its `below`) is swept only once no file of its
// generation is left (r7 swept a retired generation's record at boot while its segments stayed: the next restart read them
// back as a live hold). DEDUP AND THE DRAIN CURSOR ARE TWO THINGS — a segment keeps every rid until it is unlinked (the
// duplicate check), the drain's progress is its cursor (`at`, `done`, and `below` written before each drained segment's
// unlink) — r7 pruned drained rids and a re-send mid-drain was held twice, pushing out undrained acked rows. A DROPPED COUNT
// IS A FACT OF THE SET FILE AND IS ALWAYS SAID — a hold ends (`retired`) only once the notice that says its count is on
// disk; a generation read back with a count and nothing live says it; a re-word never loses it; a row the month's index
// holds is never held, and the count a hold ends with is filtered against the index the drain loads. The listing of
// `_held/` that FAILED is a STATE with a backoff (said once, retried on a timer, the answer's `retryAfter`), and a month
// that needs no hold never waits for it. THE LOOP LAW: the hold's every file call past its listing runs on its async road.
const HOLD_MAX_BYTES = 64 * 1024 * 1024, HOLD_SEG_BYTES = 16 * 1024 * 1024;
const HOLD_NAME_RE = /^(events-\d{4}-\d{2})~([A-Za-z0-9_-]+)\.(\d+)\.ndjson$/;
const HOLD_DROP_RE = /^(events-\d{4}-\d{2})~([A-Za-z0-9_-]+)\.(\d+)\.dropped$/; // r6: a hold generation's dropped set
const HOLD_DROP_TMP_RE = /^(events-\d{4}-\d{2})~([A-Za-z0-9_-]+)\.(\d+)\.dropped\.tmp$/; // r7: a compaction killed before its rename (swept at the listing)
// r6: a hold's segments are numbered gen × 10⁶ + i. r7: a rotation past a generation's last number is REFUSED, loudly
// (`HOLD_SEQ_BOUND`) — never read back as the next generation's; unreachable: a segment closes only when the next append
// does not fit, so two neighbours hold > 16 MiB and 10⁶ of them are ≥ 8 TB through ONE machine × month
const HOLD_GEN_SPAN = 1e6, HOLD_SEQ_BOUND = 'hold-seq-bound';
// r10: the newest generation a hold may be (gen × 10⁶ + i stays a safe integer, written in digits) — a name or a stored item
// past it is not ours (acceptance r9: a forged «1e15» minted segment names in exponent form the listing never read back)
const HOLD_GEN_MAX = 1e9;
// r8: the hold's async road — a file call waiting past HOLD_SLOW_MS is said (again every HOLD_SLOW_AGAIN_MS); a batch whose
// hold jobs run past HOLD_ANSWER_MS is answered unacked (`hold-slow`); a hold with HOLD_QUEUE_MAX jobs waiting refuses the
// next at once (`hold-busy`); a listing that failed is tried again after HOLD_LIST_RETRY_MS, doubling to HOLD_LIST_RETRY_MAX_MS
const HOLD_SLOW_MS = 10e3, HOLD_SLOW_AGAIN_MS = 60e3, HOLD_ANSWER_MS = 30e3, HOLD_QUEUE_MAX = 8, HOLD_LIST_RETRY_MS = 5e3, HOLD_LIST_RETRY_MAX_MS = 60e3;
const holdGenOf = (seq) => Math.floor(Number(seq) / HOLD_GEN_SPAN);
const DROP_LINE_RIDS = 4096, DROP_COMPACT_MIN = 64 * 1024; // r6: rids per set line (≪ a MiB line); the set file rewritten past 4× its set (≥ 64 KiB)
const dropLines = (tag, rids) => { let out = ''; for (let i = 0; i < rids.length; i += DROP_LINE_RIDS) out += JSON.stringify({ [tag]: rids.slice(i, i + DROP_LINE_RIDS) }) + '\n'; return out; };
// r12: THE SET'S WRITER'S GRAMMAR — each record it writes is JSON.stringify of ONE kind, no spaces: {"gone":[rid,…]},
// {"back":[rid,…]}, {"below":N}, {"retired":G}, {"checked":N}. A line is one of them, a record a write CUT (any proper
// prefix of one — `setRecordCut`), a hole a crash left (NUL bytes), or NO RECORD: set aside (`_setAsideFile`), never a
// throw (r11 threw `set-garbage`: a live generation's read-back failed for ever and its month waited, unacked).
const SET_KINDS = new Map([['gone', 'rids'], ['back', 'rids'], ['below', 'n'], ['retired', 'n'], ['checked', 'n']]);
const SET_ASIDE_DIR = '_set-aside'; // r12: data/usage-history/_set-aside — set files as they were, a line in them no record
const SET_ASIDE_MAX = 64; // r12: files kept there; past it a set's bad lines are said (their first bytes), not copied
const SET_BAD_MAX = 8; // r12: bad lines named per file (the rest counted)
// r14: THE ERROR'S CLASS DECIDES, NEVER THE FILE'S AGE — ONE classifier for a set file whose read THROWS, on both roads (the
// live generation's read-back, an older one's at `_dropStale`): what passes (the fd table, memory, a link that timed out, a
// busy file) is KEPT and read again — the live one by its own timer (r9), an older one at the next start, its count said
// then; only «the disk will not read this file» SETS IT ASIDE unread; an EIO — or a code neither list knows — may pass:
// kept the first time and MARKED (`<set>.unread` in _held/), set aside unread at a later start that still cannot read it.
// r12 set aside EVERY older set whose read threw (one EMFILE at a boot lost its count for good) while the live one's same
// error was retried.
const SET_READ_PASSES = new Set(['EMFILE', 'ENFILE', 'ENOMEM', 'ESTALE', 'ETIMEDOUT', 'EAGAIN', 'EBUSY']);
const SET_READ_REFUSED = new Set(['EACCES', 'EISDIR', 'ENOTDIR', 'ENXIO']);
const HOLD_UNREAD_RE = /^(events-\d{4}-\d{2})~([A-Za-z0-9_-]+)\.(\d+)\.dropped\.unread$/; // r14: a set whose read failed once (EIO …) — its mark
/** r14: a set file's read error → 'passes' (kept, read again) | 'refused' (the disk will not read it: set aside unread) |
 *  'once' (EIO, or a code neither list knows: kept and marked the first time — refused at a later start) (PURE). */
const setReadClass = (code) => (SET_READ_REFUSED.has(code) ? 'refused' : SET_READ_PASSES.has(code) ? 'passes' : 'once');
/** r15: a read ERROR's class — one with no code is no answer of the disk (V8's «Array buffer allocation failed»: memory; a
 *  fault of ours) and PASSES (r14 classed its message as a code neither list knows — 'once': two starts under memory
 *  pressure set the set aside unread, its count lost) (PURE). */
const readClassOf = (e) => (e && typeof e.code === 'string' && e.code ? setReadClass(e.code) : 'passes');
const errCode = (e) => String((e && e.code) || (e && e.message) || e).slice(0, 40);
/** r12: is `t` a record the set's writer could have CUT — a proper prefix of one of its records, read by its grammar («{»,
 *  «{"go», «{"gone":["h:x:a","h:x:», «{"below":1» …), never by two magic bytes (r11 took only «{"»: a record cut after its
 *  first byte was garbage) (PURE). */
function setRecordCut(t) {
  const L = t.length; let i = 0;
  if (t[i] !== '{') return false; if (++i === L) return true;
  if (t[i] !== '"') return false; i++;
  const q = t.indexOf('"', i);
  if (q < 0) { const k = t.slice(i); for (const n of SET_KINDS.keys()) if (n.startsWith(k)) return true; return false; }
  const kind = SET_KINDS.get(t.slice(i, q)); if (!kind) return false;
  if ((i = q + 1) === L) return true;
  if (t[i] !== ':') return false; if (++i === L) return true;
  if (kind === 'n') { while (i < L && t[i] >= '0' && t[i] <= '9') i++; return i === L; }
  if (t[i] !== '[') return false; i++;
  for (let first = true; ; first = false) {
    if (i === L) return true;
    if (t[i] === ']') return i + 1 === L; // only its «}» missing
    if (!first) { if (t[i] !== ',') return false; if (++i === L) return true; }
    if (t[i] !== '"') return false; i++;
    for (;;) { // a string's body, JSON.stringify's escapes
      if (i === L) return true;
      const c = t.charCodeAt(i);
      if (c === 0x22) { i++; break; }
      if (c < 0x20) return false;
      if (c !== 0x5c) { i++; continue; }
      if (++i === L) return true;
      if (t[i] === 'u') { for (let k = 1; k <= 4; k++) { if (i + k === L) return true; if (!/[0-9a-fA-F]/.test(t[i + k])) return false; } i += 5; } else if ('"\\/bfnrt'.includes(t[i])) i++; else return false;
    }
  }
}
// r7: the bytes the set takes as its compacted lines (its compaction's bound is 4× that — r6 took 4× the FILE read back)
const dropBytesOf = (set) => { let n = 0; for (const r of set) n += r.length + 3; return n + 12 * Math.ceil(set.size / DROP_LINE_RIDS); };
// r7: a held row is a WHOLE line — the drain's own test, at the read-back too (a line torn by a crash mid-append is no row)
const rowStart = (buf, a, b) => { while (a < b && buf[a] === 0) a++; return buf[a] === 0x7b && buf[b - 1] === 0x7d ? a : -1; };
// a host id in a file name, reversibly: [A-Za-z0-9-] kept, every other byte `_` + its two hex digits
const holdHostKey = (host) => Array.from(Buffer.from(String(host), 'utf8')).map((b) => (b < 128 && /[A-Za-z0-9-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : '_' + b.toString(16).padStart(2, '0'))).join('');
const holdHostOf = (key) => { const out = []; for (let i = 0; i < key.length; i++) { if (key[i] === '_') { out.push(parseInt(key.slice(i + 1, i + 3), 16)); i += 2; } else out.push(key.charCodeAt(i)); } return Buffer.from(out).toString('utf8'); };
const NO_HOLD = Object.freeze({ segs: Object.freeze([]), gone: new Set(), none: true }); // a month with nothing held (no record kept)

class UsageHoldRoad {
  /** The parsed batch (its rows by month) → the answer — r8: a promise when a month of it goes to a hold (its jobs run on the
   *  hold's async road and are awaited, ≤ HOLD_ANSWER_MS) or waits for a hold being read back; the answer itself otherwise.
   *  r9: A MONTH THAT NEEDS NO HOLD NEVER WAITS — the months that go are appended NOW, before any wait (r8 deferred the whole
   *  batch while one month's hold was read back, and a read-back that failed was started again at every try: every month
   *  answered `deferred`, 0 of 6 November batches recorded); a month whose hold is being read back waits for it, bounded
   *  (HOLD_ANSWER_MS ⇒ `hold-slow`; HOLD_QUEUE_MAX batches waiting ⇒ `hold-busy` at once); one whose read-back FAILED answers
   *  `holdFailed` with its code and `retryAfter` (the read-back's own timer reads it again — never an ingest). */
  _ingestBatch(hostId, hostName, shardBuffers, added, { cursors = null, since = null } = {}) {
    const b = { hostId, hostName, shardBuffers, added, cursors, since, appended: 0, duplicates: 0, lastTs: 0, lastRid: null, held: false, jobs: [], holdFailed: [], retry: [], waits: [] };
    let deferred;
    // r11: EVERY COUNTER COMES DOWN ON EVERY ROAD — a pass that throws (the ledger append's ENOSPC) gives its waits back too
    // (r10 gave them back only on the deferred return: 8 such batches and the hold answered `hold-busy` with nobody waiting)
    try { deferred = this._ingestPass(b, Object.keys(shardBuffers), true); } catch (e) { this._unwait(b.waits); throw e; }
    if (deferred) { this._unwait(b.waits); return deferred; } // a big shard's index still loading in steps — nothing appended, the device keeps the batch (r10: its waits undone — r9 leaked `waiting`, the hold refused `hold-busy` for ever after 8)
    if (b.waits.length) {
      const waited = b.waits.map((w) => w.shard);
      return this._track(this._loadsBounded(b.waits).then(() => { this._ingestPass(b, waited, false); return Promise.all(b.jobs); }).then((r) => this._ingestEnd(b, r)));
    }
    return b.jobs.length ? this._track(Promise.all(b.jobs).then((r) => this._ingestEnd(b, r))) : this._ingestEnd(b, []);
  }
  /** r9: one pass of a batch over some of its months (`first`: the batch's own; else the months that waited for their hold's
   *  read-back) — each judged, then held or appended → a `deferred` answer (the first pass only: a big shard's index still
   *  loading) | null. */
  _ingestPass(b, shards, first) {
    const { hostId, hostName, shardBuffers } = b, go = [], hold = [];
    // F4, r4: THE BATCH SPLIT BY MONTH — a month out of shape is never appended to nor streamed for its index: its rows are
    // HELD (its hold, in order) and that month paused and said; a month back in shape drains its hold first (these rows
    // then queued in the hold behind it); every other month ingests as usual
    for (const shard of shards) {
      const v = this._shapeVerdict(shard), paused = this._pausedShards.has(this._pauseKey(hostId, shard));
      // r7 (e5): a hold listing that FAILS (EIO) is no empty disk — r8: a month that needs its hold (out of shape, paused)
      // waits, unacked (`holdFailed` + `retryAfter`), until the listing's own retry works; one in shape and not paused needs
      // no hold — it goes (r7 refused every month of the batch, the in-shape November too). r9: a hold whose read-back
      // FAILED is the same state — that hold's own (`_readFailed`)
      let h; try { h = this._holdOf(shard, hostId); } catch (e) { if (v.ok && !paused) go.push(shard); else this._holdFailedOf(b, shard, e); continue; }
      if (!h) {
        // r9: a hold being read back — this month waits for it (bounded); past the bound, or with too many batches waiting
        // already, it is answered unacked (the device keeps its rows)
        const r = this._holds.get(this._holdKey(shard, hostId));
        if (!first || !r) this._holdFailedOf(b, shard, { code: 'hold-slow' });
        else if (r.waiting + r.pending >= (this.holdQueueMax || HOLD_QUEUE_MAX)) this._holdFailedOf(b, shard, { code: 'hold-busy' });
        else { r.waiting++; const until = Date.now() + (this.holdAnswerMs || HOLD_ANSWER_MS); r.waitEnds.push(until); b.waits.push({ shard, h: r, until }); }
        continue;
      }
      if (v.ok && this._holdBusy(h)) { if (paused) this._resume(hostId, shard); else this._drainHold(h); h = this._holdOf(shard, hostId) || h; }
      if (!v.ok || this._holdBusy(h)) hold.push({ shard, v }); else go.push(shard);
    }
    // F1 — every appended shard's rid index ready (a big one loads in steps; the batch waits, the device keeps it — r9: a month
    // that waited for its hold meets it as that month's answer: the rest of the batch is appended already)
    for (const shard of [...go]) if (!this._ingestIndex(shard)) { if (first) return { added: 0, appended: 0, duplicates: 0, deferred: 'ledger-index-loading', retryAfter: 1, ack: false }; go.splice(go.indexOf(shard), 1); this._holdFailedOf(b, shard, { code: 'ledger-index-loading' }); }
    // r8: the held months' rows go on their hold's road (r5: a hold that could not be written is THAT month's — its notice,
    // the answer's `holdFailed` — never stamped on the batch's other months); r8 (residual 3): the month's rid index, when it
    // is in memory, tells the rows the ledger already has
    if (hold.length) b.held = true;
    for (const { shard, v } of hold) {
      let h; try { h = this._holdOf(shard, hostId, true); } catch (e) { b.jobs.push(Promise.resolve({ shard, v, e })); continue; }
      const ix = this._ingestIx.get(shard), use = ix && !ix.loading && !ix.over ? ix : null;
      const job = this._holdRows(h, shardBuffers[shard], hostName, { ix: use, checked: !!(use && use.ino && v.size != null && use.size === v.size) }).then((r) => ({ shard, v, r }), (e) => ({ shard, v, e }));
      b.jobs.push(this._bounded(job, { shard, v }));
    }
    if (first) {
      // r4: this machine's other paused months judged again at its every ingest (a month split by hand, a bound raised, a
      // dedup that ended) — a month with no new rows is never left paused for want of a batch; r5: a month whose drain failed
      // is tried again here (any month's batch of the machine), and one out of shape again is a shape pause again
      for (const rec of this._pausedOf(hostId)) {
        const shard = this._shardPath(rec.shard);
        if (shardBuffers[shard]) continue;
        let v; try { v = this._shapeVerdict(shard); } catch { continue; }
        if (v.ok) this._resume(hostId, shard); else if (rec.drain) this._pause(hostId, hostName || rec.hostName, shard, v);
      }
      // r9: a hold whose count could not be put on disk at its end (the notice store refused its write: `unsaid`) is said
      // again at its machine's every ingest (r8 wrote `unsaid` and never read it)
      for (const h of [...this._holds.values()]) if (h.unsaid && h.host === String(hostId)) this._sayUnsaid(h);
    }
    const a = this._appendRemote(shardBuffers, go);
    b.appended += a.appended; b.duplicates += a.duplicates; if (a.lastRid && a.lastTs >= b.lastTs) { b.lastTs = a.lastTs; b.lastRid = a.lastRid; }
    // r8 (e5's stuck pause): a month in shape whose pause holds nothing resumes at its first ingest that recorded it (a pause
    // with no hold — its write refused, its listing failed at boot — was never resumed while the month took rows)
    for (const shard of go) if (this._pausedShards.has(this._pauseKey(hostId, shard))) this._resume(hostId, shard);
    return null;
  }
  /** r9: a month of the batch that is not acked → its entry (its code; a failed listing or read-back also tells the answer
   *  when it is tried again — `retryAfter`). */
  _holdFailedOf(b, shard, e) {
    const f = { month: path.basename(shard).slice(7, 14), shard: path.basename(shard), error: (e && e.code) || String((e && e.message) || e).slice(0, 80) };
    b.holdFailed.push(f);
    const key = this._holdKey(shard, b.hostId);
    let ra = this._retryAfter(key);
    // r10: EVERY DEFERRED ANSWER CARRIES ITS retryAfter (r9: only a failed read-back's or listing's did — the 9th batch got
    // `hold-busy` and nothing to pace by): `hold-slow` — the bound itself; `hold-busy` — what is left of the bound of the
    // first batch waiting; an index still loading — the next second
    if (f.error === 'hold-slow') ra = Math.max(ra, Math.ceil((this.holdAnswerMs || HOLD_ANSWER_MS) / 1000));
    else if (f.error === 'hold-busy') ra = Math.max(ra, this._busyFor(this._holds.get(key)));
    else if (f.error === 'ledger-index-loading') ra = Math.max(ra, 1);
    if (ra) b.retry.push(ra);
    return f;
  }
  /** r10: seconds until a hold refusing more batches (`hold-busy`) has room — its first waiting batch's bound ends (none
   *  waiting: its writes queued — one bound). */
  _busyFor(h) {
    const ends = (h && h.waitEnds) || [], left = ends.length ? Math.min(...ends) - Date.now() : this.holdAnswerMs || HOLD_ANSWER_MS;
    return Math.max(1, Math.ceil(left / 1000));
  }
  /** r10: batches no longer waiting for a hold's read-back (answered, or the batch deferred whole). */
  _unwait(waits) { for (const w of waits) { w.h.waiting--; const i = w.h.waitEnds.indexOf(w.until); if (i >= 0) w.h.waitEnds.splice(i, 1); } waits.length = 0; }
  /** r9: the batch's answer once its holds answered (`results` = [{shard, v, r | e}]). */
  _ingestEnd(b, results) {
    const { hostId, hostName } = b;
    let held = 0, heldDup = 0; const paused = [];
    for (const { shard, v, r, e } of results) {
      let holdError = null;
      if (e) { const f = this._holdFailedOf(b, shard, e); holdError = f.error; this._sayAgain(`held\n${hostId}\n${f.shard}\n${holdError}`, (n) => `[usage] the rows of ${f.shard} from ${hostName || hostId} could not be held (${holdError}) — this batch is not acked: its device sends it again${n ? ` (${n} more batch(es) since the last such line)` : ''}`); }
      else { held += r.held; heldDup += r.duplicates; }
      if (!v.ok) paused.push(this._pause(hostId, hostName, shard, v, holdError));
    }
    const duplicates = b.duplicates + heldDup, holdFailed = b.holdFailed;
    if (duplicates) this._noteDuplicates(hostId, b.appended, duplicates);
    const retryAfter = holdFailed.length && b.retry.length ? Math.max(...b.retry) : 0;
    const answer = { added: b.appended, appended: b.appended, duplicates, ...(b.held ? { held } : {}), ...(paused.length ? { paused: paused[0], pausedMonths: paused } : {}), ...(holdFailed.length ? { holdFailed } : {}), ...(retryAfter ? { retryAfter } : {}) };
    answer.ack = ackOf(answer);
    // F2 — r5: THE ACK commits the hub's copy of the device cursor (every row appended or held beside the ledger)
    if (b.cursors && typeof b.cursors === 'object' && answer.ack) this._writeHostCursor(hostId, { cursors: b.cursors, since: b.since || 'hub', lastTs: b.lastTs || null, lastRid: b.lastRid, events: b.added });
    return answer;
  }
  /** r9: the read-backs a batch waits for, BOUNDED (HOLD_ANSWER_MS — a disk that does not answer: the batch answered
   *  `hold-slow`, the read-back running on; r8 waited for it with no bound and no line) → Promise (settled either way). */
  _loadsBounded(waits) {
    let t = null;
    const late = new Promise((resolve) => { t = setTimeout(resolve, this.holdAnswerMs || HOLD_ANSWER_MS); t.unref?.(); });
    return Promise.race([Promise.all(waits.map((w) => Promise.resolve(w.h.loading).catch(() => { }))), late]).finally(() => { clearTimeout(t); this._unwait(waits.slice()); });
  }
  /** r9: ONE line for a state many batches meet (r8: a stalled hold said 127 identical lines in one millisecond) — said, then
   *  at most once a minute, with how many met it since. r10: A COUNT IS SAID EVEN WHEN ITS KEY NEVER COMES BACK — the
   *  window's count is flushed at its end (one timer per key, bounded with the keys; r9 said it only with the key's next
   *  line: 7 hold-slow batches per machine stayed unsaid). → true when the line was said now, false when only counted.
   *  r11: a LINE only — nothing acts on it (a retry is `_retryPaced`'s: r10 gated the unsaid count's retry on this and its
   *  flush restarted the window, so under steady ingests the retry never ran again). */
  _sayAgain(key, words) {
    const now = Date.now(), s = this._lines.get(key), win = this.sayAgainMs || HOLD_SLOW_AGAIN_MS;
    if (s && now - s.at < win) {
      s.n++; s.words = words;
      if (!s.timer) { s.timer = setTimeout(() => this._sayFlush(key), Math.max(0, s.at + win - now)); s.timer.unref?.(); }
      return false;
    }
    if (s && s.timer) clearTimeout(s.timer);
    console.warn(words(s ? s.n : 0));
    this._lines.set(key, { at: now, n: 0, words, timer: null });
    if (this._lines.size > 256) { const old = this._lines.keys().next().value; this._sayFlush(old); this._lines.delete(old); }
    return true;
  }
  /** r10: a window's count said at its end (or when its key leaves the bounded map). */
  _sayFlush(key) {
    const s = this._lines.get(key); if (!s) return;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    if (!s.n) return;
    console.warn(s.words(s.n)); s.at = Date.now(); s.n = 0;
  }
  /** r11: A RETRY IS A RETRY — `act` runs at most once a window, on its own clock: at once when its last run is a window
   *  old, else ONCE at that window's end (a timer, armed by the first call inside it). The line is said only when a try
   *  ran (`act()` not false; its count = the calls inside the window that did not try) — the words never claim a try
   *  that did not happen. An act that finds nothing to try ends its key (no line). Bounded with the keys (256: the oldest
   *  leaves, its pending try run first). r10 counted the calls inside the window and its flush restarted it: with a
   *  machine pushing more often than once a minute the unsaid count was never tried again while the journal said
   *  «tried again at most once a minute» every minute. → true when it tried now. */
  _retryPaced(key, act, words) {
    const now = Date.now(), win = this.sayAgainMs || HOLD_SLOW_AGAIN_MS;
    let s = this._retries.get(key);
    if (!s) {
      s = { at: -Infinity, n: 0, timer: null, act, words }; this._retries.set(key, s);
      if (this._retries.size > 256) this._retryRun(this._retries.keys().next().value, true);
    }
    s.act = act; s.words = words;
    if (now - s.at >= win) return this._retryRun(key);
    s.n++;
    if (!s.timer) { s.timer = setTimeout(() => this._retryRun(key), Math.max(0, s.at + win - now)); s.timer.unref?.(); }
    return false;
  }
  /** r11: the try of `_retryPaced`'s key, now (its window's end, its first call after the window, or its key leaving the
   *  map — `leave`: only when a call waits for it) → true when it tried. */
  _retryRun(key, leave = false) {
    const s = this._retries.get(key); if (!s) return false;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    if (leave) { this._retries.delete(key); if (!s.n) return false; }
    const n = s.n; s.n = 0; s.at = Date.now();
    let tried = false; try { tried = s.act() !== false; } catch { tried = false; }
    if (!tried) { this._retries.delete(key); return false; }
    console.warn(s.words(n));
    return true;
  }
  /** r8: a hold job's answer, BOUNDED — past HOLD_ANSWER_MS its batch is answered unacked (`hold-slow`: the device keeps it);
   *  the job runs on (what it lands is in memory and on disk; the device's re-send of it is a duplicate). */
  _bounded(job, { shard, v }) {
    let t = null;
    const late = new Promise((resolve) => { t = setTimeout(() => resolve({ shard, v, e: Object.assign(new Error('the hold\'s disk did not answer'), { code: 'hold-slow' }) }), this.holdAnswerMs || HOLD_ANSWER_MS); t.unref?.(); });
    return Promise.race([job, late]).finally(() => clearTimeout(t));
  }
  // ── F1 THE INGEST'S RID INDEX (lane ledger-dedup-law) ───────────────────────────────────────────────────────────────────
  // Why not `ledgerKnowsId`: the ledger cache holds only the hot rows' ids in a Set — a cold row is a hash whose every hit
  // costs a disk read, and the cache may be mid-warm or stale (a false "new" there would append the window again). This
  // index holds exactly what the ingest needs: the `h:` (remote) rids of one shard (a remote rid never equals a local one),
  // read once — the unread part inline when it is ≤ INGEST_IX_INLINE_BYTES, else a step per loop turn while the batch is
  // deferred — and kept current by every append (ours directly; anyone else's by reading the shard's new bytes). A shard
  // rewritten under it (another inode, or shorter) is read again. Bounded: past LD.MAX_IDS ids the shard is out of shape.
  /** true = the index of `shard` is current (an empty one when the shard does not exist yet); false = loading in steps. */
  _ingestIndex(shard) {
    let st = null; try { st = fs.statSync(shard); } catch { }
    let ix = this._ingestIx.get(shard);
    if (!st) { if (!ix || ix.ino) this._ingestIx.set(shard, { ino: 0, size: 0, rids: new Set(), loading: null, over: false }); return true; }
    if (ix && !ix.loading && ((ix.ino && ix.ino !== st.ino) || st.size < ix.size)) ix = null; // rewritten: read it again
    if (!ix) { ix = { ino: st.ino, size: 0, rids: new Set(), loading: null, over: false }; this._ingestIx.set(shard, ix); }
    if (!ix.ino) ix.ino = st.ino;
    if (ix.loading) return false;
    if (st.size === ix.size) return true;
    if (st.size - ix.size <= (this.ingestIndexInlineBytes || INGEST_IX_INLINE_BYTES)) { ix.size = this._readRids(shard, ix, ix.size, st.size); return true; }
    const gen = (function* (self) { while (ix.size < st.size) { const end = self._readRids(shard, ix, ix.size, st.size, WARM_SLICE_BYTES); if (end === ix.size) break; ix.size = end; yield; } })(this);
    ix.loading = LD.runStepped(gen, { sliceMs: 20 }).catch((e) => { console.warn(`[usage] the ingest index of ${path.basename(shard)} could not be read: ${(e && e.message) || e} — read again at the next ingest`); this._ingestIx.delete(shard); })
      .finally(() => { ix.loading = null; });
    return false;
  }
  /** The `h:` rids of [from, to) of a shard into `ix` (≤ `limit` bytes read) → the place after the last whole line. */
  _readRids(shard, ix, from, to, limit = Infinity) {
    return LD.eachLine(shard, from, to, (buf, a, b) => {
      const rid = LD.ridAt(buf, a, b);
      if (rid && rid.startsWith('h:') && !ix.over) { ix.rows = (ix.rows || 0) + 1; ix.rids.add(rid); if (ix.rids.size > LD.MAX_IDS) ix.over = true; }
    }, { limit });
  }
  /** Resolves when no index is loading in steps (a suite; a caller that wants the batch it was deferred for in). */
  ingestIndexSettled() { return Promise.all([...this._ingestIx.values()].map((ix) => ix.loading || null).filter(Boolean)).then(() => { }); }
  _noteDuplicates(hostId, appended, duplicates) {
    const d = this._dupLog.get(hostId) || { at: 0, appended: 0, duplicates: 0, calls: 0 };
    d.appended += appended; d.duplicates += duplicates; d.calls++;
    const now = Date.now();
    if (now - d.at >= DUP_LOG_MS) {
      console.log(`[usage] ingest ${hostId}: ${d.appended} appended, ${d.duplicates} duplicate(s) not written (already in the ledger) over ${d.calls} batch(es)`);
      d.at = now; d.appended = 0; d.duplicates = 0; d.calls = 0;
    }
    this._dupLog.set(hostId, d);
  }
  // ── F4 THE GROWTH ALARM (lane ledger-dedup-law) ─────────────────────────────────────────────────────────────────────────
  _shapeMaxBytes() { return this.shapeMaxBytes || SHAPE_MAX_BYTES; }
  _shapeRatioMinBytes() { return this.shapeRatioMinBytes != null ? this.shapeRatioMinBytes : SHAPE_RATIO_MIN_BYTES; }
  /** Is a shard in shape for an append? → {ok: true} | {ok: false, why: 'size' | 'ratio' | 'ids', size, ratio, shard, exact?,
   *  proven?, judging?}. The size is a stat per ingest; the ratio is the ingest index's own count once it read the shard
   *  (every `h:` row against the distinct ones — r2: a sample of windows, head to tail, cannot see a repeat that lies far
   *  from its first copy, and the incident's re-sent windows are exactly that), before it LD.shapeOf's sample (16 windows
   *  from the head to the tail, ≤ 16 MiB read), read again only past SHAPE_RESAMPLE_BYTES of growth or SHAPE_RESAMPLE_MS.
   *  r3: a shard over the bound is out of shape even when a dedup pass proved it free of repeats (`proven` — keyed by the
   *  inode the pass read, `_isProven`: a file rewritten since is unproven and gets its dedup); a pause the INDEX judged
   *  before a restart (`_judging`, restorePause) is judged by the index again, never by the sample (`judging` until it is
   *  read — after the ledger loads). */
  _shapeVerdict(shard) {
    let st; try { st = fs.statSync(shard); } catch { this._judging.delete(shard); return { ok: true }; }
    const ix = this._ingestIx.get(shard), j = this._judging.get(shard);
    if (j && j.ino == null) j.ino = st.ino; // the file the boot found (restorePause judges at once)
    // the ids bound and the size are exact rules of their own: either one judging it out ends a «judging» wait
    if (ix && ix.over && ix.ino === st.ino) { this._judging.delete(shard); return { ok: false, why: 'ids', size: st.size, ratio: null, shard, exact: true }; }
    if (st.size > this._shapeMaxBytes()) { this._judging.delete(shard); return { ok: false, why: 'size', size: st.size, ratio: (this._shapes.get(shard) || {}).ratio ?? null, shard, proven: this._isProven(shard, st) }; }
    if (j && j.ino !== st.ino) this._judging.delete(shard); // rewritten since: judged afresh, like any file
    else if (j) {
      if (!(ix && !ix.loading && ix.ino === st.ino && ix.size > 0)) { this._judgeByIndex(shard); return { ok: false, why: j.why, size: st.size, ratio: j.ratio, shard, exact: true, judging: true }; }
      this._judging.delete(shard); // the index read it: its count judges below
    }
    if (st.size < this._shapeRatioMinBytes()) return { ok: true, size: st.size };
    if (ix && !ix.loading && ix.ino === st.ino && ix.size > 0 && ix.rids.size) {
      const ratio = (ix.rows || 0) / ix.rids.size;
      if (ratio > SHAPE_MAX_RATIO) return { ok: false, why: 'ratio', size: st.size, ratio, shard, exact: true };
    }
    let s = this._shapes.get(shard);
    if (!s || s.ino !== st.ino || Math.abs(st.size - s.size) >= SHAPE_RESAMPLE_BYTES || (st.size !== s.size && Date.now() - s.at >= SHAPE_RESAMPLE_MS)) {
      try { s = { ...LD.shapeOf(shard), at: Date.now() }; } catch { return { ok: true, size: st.size }; }
      this._shapes.set(shard, s);
    }
    if (s.ratio != null && s.ratio > SHAPE_MAX_RATIO) return { ok: false, why: 'ratio', size: st.size, ratio: s.ratio, shard, hosts: s.hosts };
    return { ok: true, size: st.size, ratio: s.ratio };
  }
  /** Pause ONE month of a host's ingest (r4: host × month — its other months record as usual; this month's rows are held
   *  until its shard is back in shape) → the paused record ({…, month, held, dropped, holdMax}; `held` null while a big
   *  hold is still being read). A pause is said (one line + `onShape`) when it starts, when its remedy starts, when the
   *  remedy ends without the shard back in shape and when its held / dropped counts move — the notice says what HAPPENED
   *  (r2), never a promise. THE REMEDY = the shard's streaming dedup (`_remedy`). */
  _pause(hostId, hostName, shard, v, holdError = null) {
    const key = this._pauseKey(hostId, shard), prev = this._pausedShards.get(key), now = Date.now(), base = path.basename(shard);
    const ratio = v.ratio == null || !Number.isFinite(Number(v.ratio)) ? null : Math.round(Number(v.ratio) * 10) / 10;
    let h; try { h = this._holdOf(shard, hostId); } catch { h = null; } // r7: a listing that fails counts nothing (said «counting»)
    // r8: a hold not read yet (or a listing that failed) counts NOTHING — `dropped` null, never 0 (the notice keeps the count
    // it said: r7 re-worded it to «0 held» and lost its «Past the bound» line); `unchecked`: its dropped rows may be in the
    // ledger (held while the month's index was not in memory, or read back after a restart)
    const rec = { host: hostId, hostName: hostName || (prev && prev.hostName) || hostId, shard: base, month: base.slice(7, 14), size: v.size, ratio, why: v.why, exact: !!v.exact, since: prev ? prev.since : now, lastAt: now, held: h ? this._heldCount(h) : null, dropped: h ? this._droppedOf(h) : (prev && prev.dropped != null ? prev.dropped : null), unchecked: h ? !!h.unchecked : !!(prev && prev.unchecked), gen: h && !h.none ? h.gen : (prev && prev.gen != null ? prev.gen : null), holdMax: this._holdMax(), ...(holdError ? { holdError } : {}), remedy: null, drain: null };
    this._pausedShards.set(key, rec);
    const first = !prev;
    const started = this._remedy(shard, v);
    rec.remedy = this._remedyOf(shard);
    // r3: said again when what it says changes (the rule, the remedy's state) — e.g. «judging» → the index's verdict; r4:
    // and the counts it says (held, dropped)
    const changed = !first && (prev.why !== rec.why || !prev.remedy || prev.remedy.state !== rec.remedy.state || prev.held !== rec.held || prev.dropped !== rec.dropped || prev.holdError !== rec.holdError || !!prev.drain || prev.hostName !== rec.hostName);
    if (first) console.warn(`[usage] ${rec.shard} is out of shape (${(rec.size / 2 ** 30).toFixed(2)} GiB${rec.ratio ? `, ~${rec.ratio}× its distinct rows` : ''}) — the usage of ${rec.hostName} for ${rec.month} is HELD beside it until it is back in shape (≤ ${Math.round(rec.holdMax / 2 ** 20)} MiB, then recorded in order; its other months are recorded as usual)${started ? '; removing the repeated rows now' : v.judging ? '; judged again by its index after the ledger loads' : ''}`);
    if (first || started || changed) this._emitShape({ kind: 'paused', ...rec });
    return { ...rec };
  }
  _pauseKey(hostId, shard) { return `${hostId}\n${path.basename(shard)}`; }
  /** The paused months of one machine (r4). */
  _pausedOf(hostId) { return [...this._pausedShards.values()].filter((r) => r.host === hostId); }
  // ── r4 THE HOLD of a paused month (host × month, beside the ledger) ────────────────────────────────────────────────────
  // r8 THE LOOP LAW: every file call of a hold past its first listing — its read-back, its rows' and its set's appends, a
  // cut back, the compaction, the records, the unlinks — runs on the hold's ASYNC road (fs.promises: libuv's pool, never
  // the main thread), ONE job at a time per hold (`_holdJob`: an append, a drain's step, the end — each sees what the one
  // before it left on disk and in memory); the ingest awaits its months' jobs (its answer is a promise then), bounded: a
  // job still running past HOLD_ANSWER_MS answers its batch unacked (`hold-slow`), and a file call waiting past
  // HOLD_SLOW_MS is SAID while it waits. What stays synchronous, and why: the ONE listing per process (at its first use,
  // like every store's load — a directory of a few names per held month), the ledger's own appends (`_appendRemote`
  // — the in-shape road, a drained slice of ≤ 1 MiB) and the ingest index's reads — the ledger's, not the hold's.
  _holdMax() { return this.holdMaxBytes || HOLD_MAX_BYTES; }
  _holdFile(h, seq) { return path.join(this.heldDir, `${h.key}.${seq}.ndjson`); }
  _dropFile(key, gen) { return path.join(this.heldDir, `${key}.${gen}.dropped`); }
  /** The holds on disk not yet read back (`_held/`) → Map(key → [seq]). r6: every generation a file names is seen
   *  (`_holdGens` — the next hold of that month is a newer one, even when an old file could not be unlinked). r7: a
   *  listing that FAILS (EIO, not ENOENT) throws — an empty disk is a fact, never a guess. r8: the listing is read once,
   *  at its first use (`_listHeldNow`); one that failed is a STATE (`_listFail`): this throws its error until a retry on
   *  its own timer works — never a readdir per ingest. */
  _heldOnDisk() {
    if (this._heldList) return this._heldList;
    if (this._listFail) throw this._listFail.error;
    return this._listHeldNow();
  }
  /** The names of `_held/` → the listing (the segments not read back, the set files, the generations seen; a
   *  `.dropped.tmp` — a compaction killed before its rename, the old file whole — swept). r9: A SET FILE IS LISTED ON ITS
   *  OWN — a generation is a set file with or without segments: a key whose every segment was drained and unlinked is in
   *  the listing too (an empty list of segments), read back and said (r8 listed segments only: a drained generation's
   *  count — its set, no segment left — was never read back, the boot re-worded its notice to «0 dropped» and swept the
   *  set: 33 rows said nowhere). */
  _listOf(names) {
    const m = new Map(), marks = [];
    for (const n of names) {
      let x = HOLD_NAME_RE.exec(n);
      if (x && !(Number.isSafeInteger(Number(x[3])) && holdGenOf(x[3]) <= HOLD_GEN_MAX)) continue; // r10: not a name of ours (past HOLD_GEN_MAX): never read, never unlinked
      if (x) { const k = `${x[1]}~${x[2]}`; if (!m.has(k)) m.set(k, []); m.get(k).push(Number(x[3])); this._holdGenSeen(k, holdGenOf(x[3])); this._diskFiles.add(path.join(this.heldDir, n)); continue; }
      x = HOLD_DROP_RE.exec(n);
      if (x && !(Number.isSafeInteger(Number(x[3])) && Number(x[3]) <= HOLD_GEN_MAX)) continue;
      if (x) { const k = `${x[1]}~${x[2]}`; if (!m.has(k)) m.set(k, []); if (!this._dropFiles.has(k)) this._dropFiles.set(k, []); if (!this._dropFiles.get(k).includes(Number(x[3]))) this._dropFiles.get(k).push(Number(x[3])); this._holdGenSeen(k, Number(x[3])); continue; }
      if (HOLD_DROP_TMP_RE.test(n)) this._track(this._heldUnlink(path.join(this.heldDir, n)));
      else if (HOLD_UNREAD_RE.test(n)) marks.push(n);
    }
    // r14: a set's mark of a read that failed once (EIO …) — kept while its set is listed: a start that still cannot read the
    // set takes the error for the disk's answer (`_setUnread`); one whose set is gone is swept. A mark this process made is
    // never one of an earlier start
    for (const n of marks) {
      const set = n.slice(0, -'.unread'.length), p = path.join(this.heldDir, set);
      if (this._marksMade && this._marksMade.has(p)) continue;
      if (names.includes(set)) (this._unreadMarks || (this._unreadMarks = new Set())).add(p); else this._track(this._heldUnlink(p + '.unread'));
    }
    return m;
  }
  /** r8: the listing — synchronous, ONCE per process (a directory of a few names per held month, like every store's
   *  load): a failure becomes the listing's state, retried on the async road (`_listHeld`). */
  _listHeldNow() {
    let names = [];
    try { names = fs.readdirSync(this.heldDir); } catch (e) { if (!e || e.code !== 'ENOENT') { this._listFailed(e); throw e; } }
    return (this._heldList = this._listOf(names));
  }
  /** r8: a retry of the listing, on the async road (one in flight) → the listing. */
  _listHeld() {
    if (this._heldList) return Promise.resolve(this._heldList);
    if (!this._listing) {
      if (this._listFail) this._listFail.retrying = true; // r9: `holdListFailed` says a retry is in flight
      this._listing = this._track(this._holdIO('listing', this.heldDir, fs.promises.readdir(this.heldDir)).catch((e) => { if (e && e.code === 'ENOENT') return []; throw e; }).then((names) => {
        this._listing = null;
        this._heldList = this._listOf(names);
        if (this._listFail) this._listBack();
        return this._heldList;
      }, (e) => { this._listing = null; this._listFailed(e); throw e; }));
    }
    return this._listing;
  }
  /** r8: THE LISTING FAILED — a state of the instance, said ONCE (a journal line, a For-you notice: `hold-list`), retried on
   *  its own timer (HOLD_LIST_RETRY_MS, doubling to HOLD_LIST_RETRY_MAX_MS), never per ingest (r7: a readdir and a warn line
   *  per month per batch — an 84-min outage ≈ 10³ of each per machine); a month that needs its hold waits, unacked, told
   *  `retryAfter`; one in shape and not paused needs none and goes. */
  _listFailed(e) {
    const prev = this._listFail, now = Date.now(), tries = (prev ? prev.tries : 0) + 1;
    const wait = Math.min(this.holdListRetryMaxMs || HOLD_LIST_RETRY_MAX_MS, (this.holdListRetryMs || HOLD_LIST_RETRY_MS) * 2 ** (tries - 1));
    const code = String((e && e.code) || (e && e.message) || e).slice(0, 40);
    if (prev && prev.timer) clearTimeout(prev.timer);
    const f = { error: e, code, since: prev ? prev.since : now, tries, nextAt: now + wait, nextWait: Math.min(this.holdListRetryMaxMs || HOLD_LIST_RETRY_MAX_MS, wait * 2), retrying: false, timer: null };
    f.timer = setTimeout(() => { if (this._listFail === f) this._listHeld().catch(() => { }); }, wait); f.timer.unref?.();
    this._listFail = f;
    if (prev) return;
    console.warn(`[usage] the held months (data/usage-history/_held) could not be listed (${code}) — a month that needs its hold waits, unacked (its machine sends it again), until a listing works; listed again in ${Math.round(wait / 1000)} s, then less often (every ${Math.round((this.holdListRetryMaxMs || HOLD_LIST_RETRY_MAX_MS) / 1000)} s at most)`);
    this._emitShape({ kind: 'hold-list', state: 'failed', code, since: f.since });
  }
  _listBack() {
    const f = this._listFail; this._listFail = null; if (f.timer) clearTimeout(f.timer);
    console.log(`[usage] the held months are listed again (${f.code} for ${Math.round((Date.now() - f.since) / 1000)} s, ${f.tries} tr${f.tries === 1 ? 'y' : 'ies'}) — every hold is read back`);
    this._emitShape({ kind: 'hold-list', state: 'ok', code: f.code, since: f.since });
    setImmediate(() => { try { this.restoreHolds(); } catch (e) { console.warn(`[usage] the holds could not be read back: ${(e && e.message) || e}`); } });
  }
  /** r8: the listing's failure state (the notice's reconcile; the Usage window) → {code, since, tries, retryAfter, retrying}
   *  | null. r9: `retrying` — its retry is in flight now (r8 said the old state, and `retryAfter: 1`, for as long as a slow
   *  retry waited). */
  holdListFailed() { const f = this._listFail; return f ? { code: f.code, since: f.since, tries: f.tries, retryAfter: this._retryAfter(), retrying: !!f.retrying } : null; }
  /** r8: seconds until a failed listing — r9: or the read-back of the hold `key` — is tried again (the answer's
   *  `retryAfter`; 0 = neither is failing). A retry in flight answers the wait the next one would have. */
  _retryAfter(key = null) {
    const now = Date.now(), waits = [this._listFail, key ? this._readFail.get(key) : null].filter(Boolean).map((f) => (f.retrying ? f.nextWait : f.nextAt - now));
    return waits.length ? Math.max(1, Math.ceil(Math.max(...waits) / 1000)) : 0;
  }
  /** r9: A HOLD'S READ-BACK THAT FAILED (EACCES, EIO …) — a state of that hold, like the listing's: said ONCE (a journal line,
   *  the For-you notice `hold-read` naming the file), read again on its own timer (HOLD_LIST_RETRY_MS doubling to
   *  …_MAX_MS), never at an ingest (r8 started a new read-back at every try of every batch and answered every month of it
   *  `deferred` — 2 warn lines a batch, 0 of 6 November batches recorded); while it fails `_holdOf` throws its error: a
   *  month that needs that hold answers `holdFailed` + `retryAfter`, one in shape and not paused goes. r16: WHAT BLOCKS
   *  THE MONTH IS NAMED, RE-JUDGED AT EVERY TRY — `blocks` (`_unreadHold`: every file that keeps the month waiting, in the
   *  order read); the same blockers say nothing again (r9's once), a change (a file fixed, another still in the way) is
   *  said once more (`again`: the same notice re-worded in place, never a second). r15 said the first error once and never
   *  again: beside a refused segment it named the set, the owner fixed it, and the notice kept naming a file that read. */
  _readFailed(key, shard, host, e) {
    const prev = this._readFail.get(key), now = Date.now(), tries = (prev ? prev.tries : 0) + 1;
    const wait = Math.min(this.holdListRetryMaxMs || HOLD_LIST_RETRY_MAX_MS, (this.holdListRetryMs || HOLD_LIST_RETRY_MS) * 2 ** (tries - 1));
    const blocks = e && Array.isArray(e.blocks) && e.blocks.length ? e.blocks : [{ file: path.basename(String((e && e.path) || key)), code: errCode(e) }];
    const { code, file } = blocks[0], said = blocks.map((b) => `${b.code}: ${b.file}`).join(', ');
    if (prev && prev.timer) clearTimeout(prev.timer);
    const f = { error: e, code, file, blocks, said, shard, host: String(host), since: prev ? prev.since : now, tries, nextAt: now + wait, nextWait: Math.min(this.holdListRetryMaxMs || HOLD_LIST_RETRY_MAX_MS, wait * 2), retrying: false, timer: null };
    f.timer = setTimeout(() => { if (this._readFail.get(key) !== f) return; f.retrying = true; try { this._holdOf(shard, host); } catch { } }, wait); f.timer.unref?.();
    this._readFail.set(key, f);
    if (prev && prev.said === said) return;
    const base = path.basename(shard);
    if (prev) console.warn(`[usage] the hold ${key} still cannot be read — now (${said}), no longer (${prev.said}); ${base.slice(7, 14)} of ${host} waits for those`);
    else console.warn(`[usage] the hold ${key} could not be read (${said}) — ${base.slice(7, 14)} of ${host} waits, unacked (its machine sends it again) unless its file is in shape; every other month is recorded; read again in ${Math.round(wait / 1000)} s, then less often (every ${Math.round((this.holdListRetryMaxMs || HOLD_LIST_RETRY_MAX_MS) / 1000)} s at most)`);
    this._emitShape({ kind: 'hold-read', state: 'failed', host: String(host), hostName: String(host), shard: base, month: base.slice(7, 14), file, code, files: blocks, since: f.since, again: !!prev });
  }
  /** r9: the read-back that failed works now — its state gone, its notice closed. r10: A NOTICE CLOSES WHEN WHAT IT NAMES IS
   *  READ — across a restart too: EVERY read-back that works says so (`hold-read` ok), whether or not this process saw it
   *  fail (r9 said it only after its own failure: a notice filed before a restart read «cannot be read» for ever while
   *  its month was acked); the notice closes its item by its key, and a key with no item costs a lookup. */
  _readBack(key, h = null) {
    const f = this._readFail.get(key);
    if (f) {
      this._readFail.delete(key); if (f.timer) clearTimeout(f.timer);
      console.log(`[usage] the hold ${key} is read again (${f.code} for ${Math.round((Date.now() - f.since) / 1000)} s, ${f.tries} tr${f.tries === 1 ? 'y' : 'ies'})`);
    }
    const base = f ? path.basename(f.shard) : h ? h.base + '.ndjson' : null;
    if (!base) return;
    this._emitShape({ kind: 'hold-read', state: 'ok', host: f ? f.host : h.host, shard: base, month: base.slice(7, 14), file: f ? f.file : null, code: f ? f.code : null, since: f ? f.since : null });
  }
  /** r10: the read-back of (host, file) settled, either way → Promise (now, when none is in flight) — the notice's reconcile
   *  judges its item after it, never at the instant it started it. */
  holdReadSettled(host, shardName) { const h = this._holds.get(this._holdKey(this._shardPath(shardName), host)); return h && h.loading ? h.loading.then(() => { }, () => { }) : Promise.resolve(); }
  /** r9: is the hold of (host, file) still to be read (its read-back failing, in flight, or listed)? (the notice's reconcile) */
  holdReadPending(host, shardName) { const k = this._holdKey(this._shardPath(shardName), host), h = this._holds.get(k); if (this._readFail.has(k) || (h && h.loading)) return true; try { return this._heldOnDisk().has(k); } catch { return true; } }
  _holdGenSeen(key, gen) { if (!(this._holdGens.get(key) >= gen)) this._holdGens.set(key, gen); }
  /** r9: a generation a notice names (ledger-shape-notice's `wire`, every item it holds) — the next hold of that month is a
   *  newer one, even when no file of it is left on disk (a restart minted generation 0 again, and the item read the new
   *  hold's count as the same generation's: the ended hold's «36» lost when the month's next hold re-worded it). */
  holdGenSeen(host, shardName, gen) { const g = Number(gen); if (host && shardName && Number.isSafeInteger(g) && g >= 0 && g <= HOLD_GEN_MAX) this._holdGenSeen(this._holdKey(this._shardPath(String(shardName)), host), g); }
  /** r6: a NEW hold of (month, host) — a generation newer than any this process or its disk has seen. */
  _holdGenNext(key) {
    this._heldOnDisk();
    const g = this._holdGens.has(key) ? this._holdGens.get(key) + 1 : 0;
    // r11: ONE BOUND — a generation is 0 … HOLD_GEN_MAX wherever it is read or made (the listing, a notice's item, here): past
    // it the month's new hold is REFUSED by name (`hold-gen-max`: unacked, the device keeps its rows), never minted under a
    // name the listing skips (r10 minted 1e9 + 1 after a stored 1e9: its acked rows were never read back)
    if (g > HOLD_GEN_MAX) throw Object.assign(new Error(`${key}: no generation is left — the newest seen is ${g - 1} (HOLD_GEN_MAX ${HOLD_GEN_MAX}); a notice item naming it ends that`), { code: 'hold-gen-max' });
    this._holdGens.set(key, g); return g;
  }
  /** r6: the set files of the hold's key other than its own generation's — a stale hold's — unlinked (an error leaves them).
   *  r8: A RECORD OUTLIVES EVERY FILE IT DESCRIBES — never the set of a generation one of whose segment files is still on
   *  disk (`_diskFiles`: the listing, our own appends, our unlinks — r7 passed an empty «stuck» set here and in
   *  restoreHolds, and unlinked a retired generation's record while its segments stayed: a later restart read them back
   *  as a live hold of rows the ledger had). r10: NOTHING IS UNLINKED UNREAD — each older set is read first (oldest first)
   *  and its count, unless its end retired it (said then), SAID — an older generation's count is its notice's «Earlier»
   *  line — and only once it is on disk does the file go (r9 deleted it unread: with two set files at a boot the older
   *  one's 33 was said only if an item already named it); a set that cannot be read, or whose count the notice store
   *  refused, stays for the next start. A job of the hold's road. r16: NOTHING OF IT IS SAID OR DECIDED BEFORE THE HOLD IS
   *  READ WHOLE — the load job runs it after `_holdRead` (a hold that cannot be read whole never reaches it: the older set
   *  kept as it is, unread, unmarked, read again with the hold). r15 queued only its decisions (`later`) and said its count
   *  first — at every retry of a hold that kept failing: an owner-closed month item reopened each time. r17: AFTER THE LIVE
   *  GENERATION IS DECIDED (`_holdLoad`: its set judged first — the last _set-aside slot is the live set's; a live set that
   *  cannot be moved fails the hold before an older set is said or moved). r16 ran it before `_holdLoad`: an older set took
   *  the last slot, the live set could not be moved, and the month waited beside a «nothing waits» notice. Its count is
   *  still said before this one's (r10's order: the live count is said once the load job ends, `_afterHoldLoad`). */
  async _dropStale(h) {
    const key = h.key, gens = this._dropFiles.get(key) || [];
    if (!gens.length) return;
    const left = new Set();
    for (const p of this._diskFiles) { const x = HOLD_NAME_RE.exec(path.basename(p)); if (x && `${x[1]}~${x[2]}` === key) left.add(holdGenOf(x[3])); }
    const base = h.base + '.ndjson';
    for (const g of gens.filter((x) => x !== h.gen && !left.has(x)).sort((a, b) => a - b)) {
      const df = this._dropFile(key, g);
      const gone = () => this._dropFiles.set(key, (this._dropFiles.get(key) || []).filter((x) => x !== g));
      // r12: AN OLDER GENERATION'S SET NEVER BECOMES THE MONTH'S LIVE ONE — one the disk will not read (EACCES, a directory)
      // is SET ASIDE unread (moved, its bytes intact) and said; only one that cannot be moved either stays for the next start
      // (r11 kept every unreadable one, garbage too: once the newer generation ended, the next start read it back as the
      // month's live hold, failed for ever, and every batch of that month was answered unacked). r14: THE ERROR'S CLASS
      // DECIDES (`_setUnread`, the live road's own): one that passes (EMFILE, ESTALE …) is KEPT, said once, read again at
      // the next start and its count said then (r12 moved every one aside unread: one EMFILE at a boot lost its count)
      let st; try { st = await this._readSet(df); } catch (e) {
        const v = await this._setUnread(df, e);
        if (!v.aside) { this._saidKept(h, g, df, v); continue; }
        const a = await this._setAsideFile(df, true);
        if (a.copy) { gone(); await this._unmark(df); }
        this._saidAside(h, g, df, a, { code: v.code, twice: v.twice, stale: true, did: a.copy ? 'moved' : 'kept' });
        continue;
      }
      if (this._marked(df)) await this._unmark(df); // r14: read — its mark of a failed read goes
      if (st.torn) console.warn(`[usage] the hold ${key}: the set of its generation ${g} ends in a torn line (a write a crash cut — the rows it named were still held then) — read as no line`);
      const n = st.retired ? 0 : st.gone.size;
      if (n && this._emitShape({ kind: 'dropped', host: h.host, hostName: h.hostName || h.host, shard: base, month: base.slice(7, 14), dropped: n, gen: g, unchecked: !st.checked, holdMax: this._holdMax() }) === false) continue;
      // r12: lines that are no record — the file SET ASIDE (moved whole, its bytes intact; the count said above is its
      // records'), said once; past the bound it goes as a readable one does, its lines' first bytes said; one that
      // cannot be moved stays (read past again at the next start — never a throw). r14: said as what was DONE — past the
      // bound it is unlinked FIRST, then said removed (or kept, its unlink failed); r12 said it before the unlink, as
      // «kept every other record … removed the line» for a file that was then deleted
      if (st.bad.length) {
        const a = await this._setAsideFile(df, true);
        if (a.copy) { gone(); this._saidAside(h, g, df, a, { st, stale: true, did: 'moved' }); continue; }
        if (!a.over) { this._saidAside(h, g, df, a, { st, stale: true, did: 'kept' }); continue; }
        const err = await this._heldUnlinkCode(df);
        if (!err) gone();
        this._saidAside(h, g, df, err ? { ...a, error: err } : a, { st, stale: true, did: err ? 'kept' : 'removed' });
        continue;
      }
      if (await this._heldUnlink(df)) gone();
    }
  }
  /** r10: a generation's set file read → {gone, retired, checked, below, end, lineEnd, torn} — the read-back's own parse
   *  (`gone` adds, `back` removes, in their order; `checked`: the last `checked` record came after the last `gone` line).
   *  r11: every line is one of its records, a record a write cut, or a hole a crash left (NUL bytes, rowStart's rule).
   *  r12: A LINE THAT IS NO RECORD NEVER BLOCKS — read BY THE WRITER'S GRAMMAR: a record of a kind it writes is used; a
   *  proper prefix of one is a record a write CUT (`setRecordCut` — «{», a NUL run then «{», «{"go» …; r11 knew only «{"») and
   *  is no line (`torn`: its rows were still held when it was cut — r7's order is the rows, then the set's line, then the
   *  unlinks); NUL runs at either end of a line are a hole a crash left; ANYTHING ELSE (binary bytes, a line whose start a
   *  crash zeroed, {"gone":"33"}, a kind a newer build writes) is listed in `bad` — {n: its line number, at: its offset,
   *  why, head: its first bytes} — and read past: the caller SETS THE FILE ASIDE and says it (r11 threw `set-garbage` and
   *  the live generation's read-back failed for ever: its acked rows never recorded, its month unacked). `records`: the
   *  records read. Throws only what the disk throws (EACCES, EIO …). */
  async _readSet(df, gone = new Set()) {
    const r = { gone, retired: false, checked: false, below: 0 };
    let n = 0, next = 0, cut = 0, records = 0;
    const bad = [];
    const line = (buf, a, b, off) => {
      n += 1 + Math.max(0, off - next); next = off + (b - a) + 1; // its line number: the empty lines before it counted (one byte each)
      const a0 = a;
      while (a < b && buf[a] === 0) a++; // a hole a crash left before the line
      while (b > a && buf[b - 1] === 0) b--; // … or after it (a length a crash extended)
      if (a === b) return;
      const t = buf.toString('utf8', a, b);
      let j; try { j = JSON.parse(t); } catch { j = undefined; }
      if (j && typeof j === 'object') {
        if (Array.isArray(j.gone)) { for (const x of j.gone) r.gone.add(String(x)); r.checked = false; records++; return; }
        if (Array.isArray(j.back)) { for (const x of j.back) r.gone.delete(String(x)); records++; return; }
        if (Number.isFinite(j.below)) { r.below = Math.max(r.below, j.below); records++; return; }
        if (j.retired != null) { r.retired = true; records++; return; }
        if (Number.isFinite(j.checked)) { r.checked = true; records++; return; }
      }
      if (j === undefined && setRecordCut(t)) { cut++; return; } // a record a write cut: no line
      if (bad.length >= SET_BAD_MAX) { bad.more = (bad.more || 0) + 1; return; }
      bad.push({ n, at: off + (a - a0), why: j === undefined ? 'no record' : 'a record of no kind this build writes', head: JSON.stringify(buf.toString('latin1', a, Math.min(b, a + 48))) });
    };
    const s = await LD.eachLineAsync(df, 0, line, { io: this._ioOf('read-back'), tail: line });
    return { ...r, end: s.end, lineEnd: s.lineEnd, torn: cut > 0, cut, bad, records };
  }
  /** r14: a set file whose read threw → {code, cls, aside, twice} — THE ONE CLASSIFIER's verdict (`readClassOf`) for this file,
   *  on both roads: `aside` = set it aside unread (the disk refused it, or an EIO-like error that a mark from an earlier
   *  start names too: `twice`); else it is KEPT and read again — marked the first time an EIO-like error meets it (a mark
   *  that cannot be written leaves it unmarked: kept, never set aside on a guess). */
  async _setUnread(df, e) {
    const v = this._setVerdict(df, e);
    if (v.cls !== 'once' || v.aside) return v;
    const made = this._marksMade || (this._marksMade = new Set());
    if (!made.has(df)) { try { await this._holdIO('mark', df, fs.promises.writeFile(df + '.unread', JSON.stringify({ unread: v.code, at: new Date().toISOString() }) + '\n')); made.add(df); } catch { } }
    return v;
  }
  /** r16: the classifier's verdict on the set `df` whose read threw — `_setUnread`'s, with nothing written (no mark) →
   *  {code, cls, aside, twice}: what a hold not read whole yet asks of its set (does the set itself keep the month waiting?). */
  _setVerdict(df, e) {
    const code = errCode(e), cls = readClassOf(e);
    if (cls !== 'once') return { code, cls, aside: cls === 'refused', twice: false };
    const twice = !!(this._unreadMarks && this._unreadMarks.has(df));
    return { code, cls, aside: twice, twice };
  }
  /** r14: does a mark of a failed read name the set `df` (one an earlier start left, or this one's)? */
  _marked(df) { return !!((this._unreadMarks && this._unreadMarks.has(df)) || (this._marksMade && this._marksMade.has(df))); }
  /** r14: the set `df` read or set aside — its mark of a failed read goes. */
  async _unmark(df) {
    if (!this._marked(df)) return;
    if (this._unreadMarks) this._unreadMarks.delete(df); if (this._marksMade) this._marksMade.delete(df);
    await this._heldUnlink(df + '.unread');
  }
  /** r14: an older generation's set whose read failed with an error that passes — KEPT, said ONCE (a journal line per file ×
   *  error in a process; nothing waits on it: no notice), read again at the next start (its count said then). */
  _saidKept(h, g, df, { code, cls }) {
    const said = this._keptSaid || (this._keptSaid = new Set()), k = `${df}\n${code}`;
    if (said.has(k)) return; said.add(k);
    console.warn(`[usage] the hold ${h.key}: the set of its generation ${g} (an older one) could not be read (${code}: ${path.basename(df)}) — kept, read again at the next start (${cls === 'once' ? 'an error that may pass: a next start that cannot read it either sets it aside' : 'an error that passes'})`);
  }
  /** r14: the LIVE generation's set whose read threw (`e`) — judged by THE ONE CLASSIFIER (`_setUnread`, an older one's
   *  too): one that passes throws on (`_readFailed`: kept, read again by its own timer — r9); the disk's refusal SETS IT
   *  ASIDE unread and the hold goes on with no set (its count not known — said; the notice keeps the count it said as
   *  «Earlier», whether recorded not known); one that cannot be moved throws on. r12 retried every live error and set aside
   *  every older one: the rule changed with the file's age. r15: judged only once its hold is READ WHOLE (`_holdLoad` —
   *  r14's `_readLive` judged it before the hold's segments were read). */
  async _judgeLive(h, df, e) {
    const v = await this._setUnread(df, e);
    if (!v.aside) throw e;
    const a = await this._setAsideFile(df, true);
    if (!a.copy) throw e;
    await this._unmark(df);
    this._saidAside(h, h.gen, df, a, { code: v.code, twice: v.twice, did: 'moved' });
  }
  /** r12: the set file `df` SET ASIDE as it is — moved (`move`: an older generation's, it goes) or copied (the live one's,
   *  rewritten after) into data/usage-history/_set-aside, named `<file>.<UTC stamp>`, its bytes intact; past SET_ASIDE_MAX
   *  files there none is made (`over`) → {copy} (the copy's file name) | {copy: null, over} | {copy: null, error}. On the hold's async road. */
  async _setAsideFile(df, move) {
    const dir = path.join(path.dirname(this.heldDir), SET_ASIDE_DIR);
    try {
      await this._holdIO('folder', dir, fs.promises.mkdir(dir, { recursive: true }));
      const names = await this._holdIO('listing', dir, fs.promises.readdir(dir));
      if (names.length >= SET_ASIDE_MAX) return { copy: null, over: names.length };
      const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
      let copy = `${path.basename(df)}.${stamp}`;
      for (let i = 2; names.includes(copy); i++) copy = `${path.basename(df)}.${stamp}-${i}`;
      const to = path.join(dir, copy);
      if (move) { await this._holdIO('set-aside', df, fs.promises.rename(df, to)); this._diskFiles.delete(df); }
      else await this._holdIO('set-aside', df, fs.promises.copyFile(df, to, fs.constants.COPYFILE_EXCL));
      return { copy };
    } catch (e) { return { copy: null, error: String((e && e.code) || (e && e.message) || e).slice(0, 40) }; }
  }
  /** r12: the LIVE generation's set read with lines that are no record (`s.bad`): the file COPIED aside as it is (its bytes
   *  intact), then REWRITTEN from what was read — the writer's own lines (`gone`, `below`, `retired`, `checked`; tmp +
   *  rename, `_dropCompact`'s road) — and the hold goes on with it: its held rows drain, its batches are acked. A copy
   *  that fails leaves the file as it is (read past again; never a rewrite that loses the bytes); past the bound it is
   *  rewritten, the lines' first bytes said. Said once (`_saidAside`). */
  async _setAsideLive(h, df, s) {
    const a = await this._setAsideFile(df, false);
    let did = 'kept'; // r14: what was done, said as it (`_saidAside`)
    if (a.copy || a.over) {
      const text = dropLines('gone', [...h.gone]) + (s.below ? JSON.stringify({ below: s.below }) + '\n' : '') + (s.retired ? JSON.stringify({ retired: h.gen }) + '\n' : '') + (s.checked ? JSON.stringify({ checked: h.gone.size }) + '\n' : '');
      try {
        if (!text) { if (!(await this._heldUnlink(df))) throw Object.assign(new Error('unlink'), { code: 'unlink' }); h.goneBytes = 0; }
        else { await this._holdIO('compaction', df, fs.promises.writeFile(df + '.tmp', text)); await this._holdIO('compaction', df, fs.promises.rename(df + '.tmp', df)); h.goneBytes = Buffer.byteLength(text); }
        h.goneTorn = false; h.compactAt = Math.max(DROP_COMPACT_MIN, 4 * h.goneBytes); did = 'rewritten';
      } catch (e) { await this._heldUnlink(df + '.tmp'); a.rewrite = String((e && e.code) || e).slice(0, 40); }
    }
    this._saidAside(h, h.gen, df, a, { st: s, did });
  }
  /** r12: a set file's lines that are no record — or an older generation's set that could not be read — SAID ONCE: a
   *  journal line (the file, its lines, what was done) and the owner's notice (`set-aside`: the file, the line, the rest
   *  kept and the line set aside — never «permissions»; r11 said «check the file's permissions» and waited for ever). An
   *  unread set that could not be moved either is a journal line only (read again at the next start, as r10). */
  _saidAside(h, g, df, a, { st = null, code = null, stale = false, did = null, twice = false } = {}) {
    const file = path.basename(df), base = h.base + '.ndjson', bad = st ? st.bad : [], nBad = bad.length + (bad.more || 0);
    const lines = bad.map((x) => x.n).join(', ') + (bad.more ? ` (+${bad.more} more)` : '');
    const what = st ? `line${nBad === 1 ? '' : 's'} ${lines} of ${file} (generation ${g}${stale ? ', an older one' : ''}) ${nBad === 1 ? 'is' : 'are'} no record of a set (${bad[0].why}, byte ${bad[0].at}: ${bad[0].head})` : `the set of its generation ${g}${stale ? ' (an older one)' : ''} could not be read (${code}${twice ? ' — at a start before this one too: the disk\'s answer' : ''}: ${file})`;
    const done = a.copy ? `set aside, its bytes intact, as ${SET_ASIDE_DIR}/${a.copy}` : a.over ? `not copied (${SET_ASIDE_DIR} holds ${a.over} files, its bound)` : `it could not be set aside (${a.error})`;
    const then = !st ? (a.copy ? `its count is not known${stale ? '' : ' — the hold goes on'}` : 'kept, read again at the next start')
      : stale ? (did === 'moved' ? `its ${st.records} other record(s) read and said` : did === 'removed' ? `its ${st.records} other record(s) read and said; the file removed` : a.over ? `its ${st.records} other record(s) read and said; its removal failed (${a.error}) — kept, read again at the next start` : 'read past those lines; the file kept, set aside at the next start')
        : did === 'rewritten' ? `the set rewritten from its ${st.records} record(s) — the hold goes on` : `read past those lines (the file kept as it is${a.rewrite ? `: its rewrite failed, ${a.rewrite}` : ''}; set aside at its next read) — the hold goes on`;
    console.warn(`[usage] the hold ${h.key}: ${what} — ${done}; ${then}`);
    if (!st && !a.copy) return;
    const one = { file, gen: g, lines: lines || null, aside: a.copy || null, over: a.over || null, code, error: a.error || a.rewrite || null, stale, read: st ? st.records : null, did: did || (a.copy ? 'moved' : 'kept'), twice: !!twice }; // r14: `did` — what was done to the file, the words' one source
    if (h.asides) { h.asides.push(one); return; } // r16: one of the read's (`_asidePass`)
    this._emitShape({ kind: 'set-aside', host: h.host, hostName: h.hostName || h.host, shard: base, month: base.slice(7, 14), ...one });
  }
  /** r16: EVERY FILE SET ASIDE IN ONE READ OF A HOLD IS NAMED — a job of its road (`fn`) collects them (`h.asides`) and they
   *  are said as ONE event once it ends, however it ends: the live generation's first, then the older ones in the order
   *  judged (`files`; its first one's fields at the top, r14's shape). The journal said each as it was done. r12–r15 said
   *  one event per file into the hold's ONE notice, each re-wording it in place: only the last one judged was named
   *  (f3027952 the live set, r15 the older one — the live set's copy named nowhere). */
  async _asidePass(h, fn) {
    h.asides = [];
    try { return await fn(); } finally {
      const all = h.asides || [], base = h.base + '.ndjson'; h.asides = null;
      const files = [...all.filter((x) => !x.stale), ...all.filter((x) => x.stale)];
      if (files.length) this._emitShape({ kind: 'set-aside', host: h.host, hostName: h.hostName || h.host, shard: base, month: base.slice(7, 14), ...files[0], files });
    }
  }
  /** The hold of (shard, host) → its record | NO_HOLD (nothing held; `create` makes the record) | null (a hold on disk is
   *  being read back — `.loading` on the record; the caller waits for it). A hold on disk is read back ONCE, on the async
   *  road (r8: r7 read ≤ 8 MiB inline): its rows' rids (a re-sent row is held once), counts and the dropped set (its
   *  generation's set file). r6 (R1): the hold's generation is its newest segment's — an OLDER one's segment is a
   *  drained hold's file whose unlink failed: unlinked, never read, never counted. r7: the newest generation itself may
   *  be done — `retired` (r8: honoured only when its `below` covers every one of its segments): its files unlinked
   *  unread, nothing held. Throws when the listing failed (the caller's batch waits) — r9: and while its own read-back
   *  fails (`_readFailed`: retried on its timer, never here). r9: a generation is its newest file's — a segment's or a
   *  set file's (a drained generation: its set alone). */
  _holdOf(shard, host, create = false) {
    const key = this._holdKey(shard, host);
    let h = this._holds.get(key);
    if (h) return h.loading ? null : h;
    const rf = this._readFail.get(key);
    if (rf && !rf.retrying) throw rf.error;
    const onDisk = this._heldOnDisk().get(key);
    if (!onDisk && !create) return NO_HOLD;
    const listed = (onDisk || []).slice().sort((a, b) => a - b);
    this._heldOnDisk().delete(key);
    const top = Math.max(listed.length ? holdGenOf(listed[listed.length - 1]) : -1, ...(onDisk ? this._dropFiles.get(key) || [] : []));
    const gen = top >= 0 ? top : this._holdGenNext(key);
    const seqs = listed.filter((q) => holdGenOf(q) === gen), old = listed.filter((q) => holdGenOf(q) !== gen);
    h = { key, gen, base: path.basename(shard, '.ndjson'), host: String(host), hostName: null, segs: [], nextSeq: gen * HOLD_GEN_SPAN, gone: new Set(), goneBytes: 0, goneTorn: false, below: 0, retired: false, stale: false, unchecked: false, unsaid: false, compactAt: DROP_COMPACT_MIN, loading: null, draining: null, ending: null, io: Promise.resolve(), pending: 0, waiting: 0, waitEnds: [], step: null };
    this._holds.set(key, h);
    if (!onDisk) { this._holdJob(h, () => this._asidePass(h, () => this._dropStale(h))); return h; }
    h.loading = this._holdJob(h, () => this._asidePass(h, async () => {
      for (const q of old) await this._heldUnlink(path.join(this.heldDir, `${key}.${q}.ndjson`));
      // r16: READ WHOLE FIRST (or it throws, naming what blocks, having said and decided nothing). r17: then THIS
      // generation's decisions (its set's slot first), then each older generation's set read, said and gone (r10: its
      // count before this one's — said once the job ends)
      const r = await this._holdRead(h, seqs);
      await this._holdLoad(h, seqs, r); // r9: a set-only generation too (its count)
      await this._dropStale(h);
    })).then(() => {
      h.loading = null;
      this._readBack(key, h);
      if (this._holds.get(key) !== h) return;
      if (h.retired) { this._holds.delete(key); return; }
      this._afterHoldLoad(h);
    }, (e) => {
      h.loading = null;
      if (this._holds.get(key) === h) this._holds.delete(key);
      if (this._heldList) this._heldList.set(key, listed); // still on disk, unread — r9: read again by its own timer
      this._readFailed(key, shard, host, e);
    });
    return null;
  }
  _holdKey(shard, host) { return `${path.basename(shard, '.ndjson')}~${holdHostKey(host)}`; }
  /** Is anything of (shard, host) held — in memory or on disk, not yet read back? (r5: a resume waits for it) */
  _holdsAny(shard, host) { const k = this._holdKey(shard, host), h = this._holds.get(k); if (h) return !!(h.loading || this._holdBusy(h)); try { return this._heldOnDisk().has(k); } catch { return true; } } // r7: a listing that fails — held, as far as anyone knows
  /** The dropped count — the SET's size (r6: the dropped ROWS, each rid once — however often it was re-sent or dropped). */
  _droppedOf(h) { return (h && h.gone && h.gone.size) || 0; }
  /** r8: the count a hold ENDS with — its set less every row the month's index holds (the drain loads it; a row the hold
   *  could not check when it took it — read back after a restart, held while the index was not in memory — may be in the
   *  ledger after all: residual 3 counted 8 recorded rows «never recorded»). */
  _droppedFinal(h, shard) {
    if (!h || h.none) return 0;
    const ix = this._ingestIx.get(shard);
    if (ix && !ix.loading && !ix.over && ix.ino) {
      const back = [...h.gone].filter((r) => ix.rids.has(r)), was = h.unchecked;
      for (const r of back) h.gone.delete(r);
      h.unchecked = false;
      // r9: WHAT THE INDEX TOLD IS A RECORD — the rows it found leave the set on disk too (`back`), and the set is `checked`
      // (the rest are not in the ledger), one job before the end's own: a restart reads back the count the end said (c2:
      // a restart with the index not in memory re-said 8 recorded rows «never recorded»)
      if (back.length || (was && h.gone.size)) this._holdJob(h, () => this._holdMark(h, dropLines('back', back) + JSON.stringify({ checked: h.gone.size }) + '\n'));
    }
    return this._droppedOf(h);
  }
  /** r8: a hold being read back — the generation's set first (`gone` adds, `back` removes — in their order; `below`: every
   *  segment numbered under it is done; `retired`: the whole generation is), then each live segment's rows. On the async
   *  road: a slice per read (≤ LD.STEP_BYTES), the loop free between them. r15: THE HOLD IS READ WHOLE BEFORE ANYTHING IS
   *  DECIDED — its set and every live segment are READ first (`_holdRead`); only then is anything set aside, rewritten,
   *  marked or unlinked (`_holdLoad`). r14 set a refused set aside BEFORE the segments were read: in the common EACCES (a
   *  root-run server's 0600 files — the set and its segments alike) the segment then failed the hold, the set was gone for
   *  good while the month still waited, and the owner read «set aside unread; nothing waits» beside «that month waits».
   *  r16: WHAT BLOCKS THE MONTH IS JUDGED OVER THE WHOLE HOLD — every live segment is read whatever another one threw;
   *  any that cannot be, or a set the classifier KEEPS (an error that passes; EIO-like at its first start), fails the hold
   *  NAMING THEM (`_unreadHold` → `_readFailed`: ONE notice, read again by its timer) with nothing decided — the set kept
   *  as it is, unmarked; a set the disk REFUSED blocks nothing (set aside once the hold reads whole: its own notice), so
   *  beside a refused segment the segment is named (r15 threw the set's error first: the owner fixed the file named and
   *  the month still waited). Read whole with the set alone in the way, it is judged as r14 (`_setUnread`: kept, marked
   *  the first time an EIO-like error meets it) → {df, s, setErr, read}. r17: A SET THAT READS LOSES ITS MARK AT ONCE,
   *  whatever its segments do — a mark is a fact about the SET's reads (its last one failed), never the hold's: r16 unmarked
   *  it only once the hold read whole, so a segment that failed the hold kept the mark of a set that had read, and the
   *  set's next EIO was taken for its «second start» (set aside unread, its count not known). */
  async _holdRead(h, seqs) {
    const df = this._dropFile(h.key, h.gen);
    let s, setErr = null;
    try { s = await this._readSet(df, h.gone); } catch (e) { setErr = e; h.gone.clear(); s = { gone: h.gone, retired: false, checked: false, below: 0, end: 0, lineEnd: 0, torn: false, cut: 0, bad: [], records: 0 }; } // r15: judged once the hold is read whole; what a read cut short had added cleared
    if (!setErr && this._marked(df)) await this._unmark(df); // r14: read — its mark of a failed read goes (r17: now, as r15)
    h.below = Math.max(h.below, s.below); if (s.retired) h.retired = true;
    h.goneBytes = s.end; h.goneTorn = s.end > s.lineEnd; // a crash mid-append: the next line starts on a line of its own
    const live = seqs.filter((q) => q >= h.below);
    // r8: a `retired` line is honoured only when `below` covers every segment of the generation (nothing live is left: its
    // end wrote `below` before each drained segment's unlink) — else it is no record of ours: the generation reads back
    // LIVE (r7 honoured it blindly: an injected line deleted 12 held + 8 dropped rows, 0/20 recorded)
    if (h.retired && live.length) { console.warn(`[usage] the hold ${h.key}: its set says «retired» while ${live.length} of its segment(s) are past its \`below\` (${h.below}) — not a record its end wrote; read back as a live hold`); h.retired = false; }
    // r15: every live segment READ — nothing is decided before the last one is (r16: each read whatever another one threw —
    // what blocks is named whole; a retired generation has none live: its files are unlinked unread by `_holdLoad`)
    const read = [], unread = [];
    for (const seq of live) {
      const seg = { seq, rows: 0, bytes: 0, at: 0, rids: new Set(), done: new Set(), torn: false, sealed: false };
      let r;
      try {
        r = await LD.eachLineAsync(this._holdFile(h, seq), 0, (buf, a, b) => {
          const x = rowStart(buf, a, b); // r7: a torn line is no row
          const rid = x < 0 ? null : LD.ridAt(buf, x, b);
          if (rid) { seg.rows++; seg.rids.add(rid); }
        }, { io: this._ioOf('read-back') });
      } catch (e) { unread.push({ seq, e }); continue; }
      seg.bytes = r.end; seg.torn = r.end > r.lineEnd;
      read.push(seg);
    }
    const keeps = !!setErr && !this._setVerdict(df, setErr).aside;
    if (unread.length || keeps) {
      if (!unread.length) await this._setUnread(df, setErr); // read whole, the set alone in the way: r14's judgement (its mark)
      throw this._unreadHold(h, df, keeps ? setErr : null, unread);
    }
    return { df, s, setErr, read };
  }
  /** r16: a hold that cannot be read whole → the error it fails with (the first blocker's), naming EVERY file that keeps
   *  its month waiting (`blocks`: [{file, code}] in the order read — the set only when `setErr` is given: one the
   *  classifier keeps, then each segment that could not be read). */
  _unreadHold(h, df, setErr, unread) {
    const blocks = [...(setErr ? [{ file: path.basename(df), code: errCode(setErr) }] : []), ...unread.map((u) => ({ file: path.basename(this._holdFile(h, u.seq)), code: errCode(u.e) }))];
    return Object.assign(setErr || unread[0].e, { blocks });
  }
  /** r16: the hold read whole (`_holdRead`'s `r`) — DECIDED (r15's `_holdLoad`, its second half): a retired generation's
   *  files unlinked unread; else its set judged (`_judgeLive`: a set the disk refused is set aside unread and the hold goes
   *  on), its lines that are no record set aside (`_setAsideLive`), the segments' own unlinks, what is held. r17: before
   *  any older generation's set (`_dropStale` runs after it); the mark of a set that read went with its read. */
  async _holdLoad(h, seqs, { df, s, setErr, read }) {
    const checked = s.checked; // r9: `checked` — every dropped row checked (r10: `_readSet`, the one parse)
    // r7: a RETIRED generation (its end recorded; an unlink failed — EBUSY): every file of it unlinked unread, nothing held,
    // nothing counted (its count was said before it retired); r8: its set stays while one of its segments does
    if (h.retired) {
      if (s.bad.length) await this._setAsideLive(h, df, s); // r12 — r15: a retired generation's segments are not read: read whole
      let all = true;
      for (const seq of seqs) all = (await this._holdUnlink(h, seq)) && all;
      if (all) await this._heldUnlink(df);
      h.gone.clear();
      return;
    }
    // read whole: the set judged (one that cannot be moved throws on — `_readFailed` names it), its lines that are no record
    // set aside (r12: the hold goes on — r11: the read-back threw, for ever), then the segments' own unlinks
    if (setErr) await this._judgeLive(h, df, setErr);
    if (s.bad.length) await this._setAsideLive(h, df, s);
    for (const seq of seqs) {
      h.nextSeq = Math.max(h.nextSeq, seq + 1);
      // r7: a segment under `below` is DONE — dropped (its rows are in the set) or drained (its rows are in the ledger):
      // unlinked unread, never counted, never drained
      if (seq < h.below) await this._holdUnlink(h, seq);
    }
    for (const seg of read) if (seg.rids.size) h.segs.push(seg); else await this._holdUnlink(h, seg.seq); // r7: no whole row — nothing to hold or drain
    h.nextSeq = Math.max(h.nextSeq, h.below); // a number `below` names is never used again
    if (!h.segs.length) {
      // r7: a generation read back with NO live row and nothing dropped is done — retired silently. r8: one whose set still
      // counts dropped rows was never retired — its count may never have reached the owner (its notice in the store's
      // debounce at a crash): it is KEPT (empty), said and ended by `_afterHoldLoad`
      if (!h.gone.size) { h.retired = true; if (!h.stale) await this._heldUnlink(df); }
      h.unchecked = h.gone.size > 0 && !checked; // r9: a count the end checked (its `checked` record) is said as checked
      return;
    }
    // a row in a live segment is HELD (it will be recorded), never in the set — r7: whatever a line said (a crash between
    // the rows and their `back` line); the segments the set dropped are the ones `below` names, never guessed from rows
    for (const seg of h.segs) for (const r of seg.rids) h.gone.delete(r);
    h.unchecked = true; // rows read back: nobody checked them against the ledger in this process (r8: «may already be recorded»)
    h.compactAt = Math.max(DROP_COMPACT_MIN, 4 * dropBytesOf(h.gone)); // r7: 4× the set (r6: 4× the file — a file 31× its set was kept)
  }
  _holdBusy(h) { return !!(h && (h.draining || h.segs.length || h.pending)); }
  _heldCount(h) { return h.segs.reduce((a, s) => a + s.rows, 0); }
  /** r8: ONE job on a hold's road — after every job queued before it (whatever it ended with) → its promise. */
  _holdJob(h, fn) {
    const p = h.io.then(fn);
    h.io = p.then(() => { }, () => { });
    return this._track(p);
  }
  /** r8: a promise the hold's road has in flight (`holdsSettled` waits for every one). */
  _track(p) {
    this._inflight.add(p);
    const off = () => { this._inflight.delete(p); };
    p.then(off, off);
    return p;
  }
  /** r8: every job of every hold, the listing, the drains and the ingests awaiting them — settled (a suite; a caller that
   *  wants what it asked for on disk). */
  async holdsSettled() {
    for (let i = 0; i < 10000 && this._inflight.size; i++) await Promise.allSettled([...this._inflight]);
  }
  /** r8: a file call of the hold's road, SAID while it waits (HOLD_SLOW_MS — the main thread is free to say it; r7's
   *  timedSync recorded a call only once it returned, and a hung one never). r9: EVERY WAIT IS BOUNDED AND SAID — every
   *  call of the road past its one listing goes through here (the read-back's opens and reads, the drain's, the unlinks,
   *  the stats, the cuts, the renames, the listing's retry; r8 wrapped the appends and the compaction only: a hung
   *  read-back was silent, and its batch waited with no bound — `_loadsBounded` now). */
  _holdIO(what, file, p) {
    const t0 = Date.now();
    let t = null;
    const say = () => { const ms = Date.now() - t0; console.warn(`[usage] the hold's ${what} of ${path.basename(file)} has waited ${ms < 10e3 ? (ms / 1000).toFixed(1) : Math.round(ms / 1000)} s — the disk of the data folder is not answering; its batch waits, unacked`); t = setTimeout(say, HOLD_SLOW_AGAIN_MS); t.unref?.(); };
    t = setTimeout(say, this.holdSlowMs || HOLD_SLOW_MS); t.unref?.();
    return p.finally(() => clearTimeout(t));
  }
  /** r9: LD.eachLineAsync's `io` — each of its file calls through `_holdIO`. */
  _ioOf(what) { return (file, p) => this._holdIO(what, file, p); }
  /** Rows of a paused month into its hold: a row the hold already has is a duplicate (an older daemon re-sends its window),
   *  so is one the month's rid index holds (r8 — residual 3: the ledger has it; consulted when the index is in memory), the
   *  rest appended in their order → Promise({held, duplicates}). r6: a re-sent row the hold DROPPED that stays dropped (no
   *  room without dropping another) is one too — the set already counts it. r8: a job of the hold's road; a hold that
   *  ended before its turn hands the rows to the month's next hold. A hold with HOLD_QUEUE_MAX jobs waiting refuses at
   *  once (`hold-busy`, unacked: the device keeps the rows) — a stalled disk never queues a machine's every batch. */
  _holdRows(h, rows, hostName, opts = {}) {
    if (h.pending >= (this.holdQueueMax || HOLD_QUEUE_MAX)) return Promise.reject(Object.assign(new Error(`the hold ${h.key} has too many writes waiting`), { code: 'hold-busy' }));
    h.pending++;
    const once = () => this._holdJob(h, async () => {
      let r = null;
      try {
        if (this._holds.get(h.key) !== h) { const cur = this._holdOf(this._shardPath(h.base + '.ndjson'), h.host, true); if (cur && cur !== h) return (r = await this._holdRows(cur, rows, hostName, opts)); }
        if (hostName) h.hostName = hostName;
        return (r = await this._holdAppend(h, rows, opts));
      } finally { if (!(r && r.wait)) h.pending--; } // r10: a write that waits for the drain's next step stays pending (the drain goes on for it)
    });
    // r10: the wait is OFF the hold's road (a job that waited on it would hold up the very step it waits for)
    return this._track((async () => { for (;;) { const r = await once(); if (!(r && r.wait)) return r; await r.wait; } })());
  }
  /** r10: the drain's next step (or its end) → Promise — what an append that would push out a row not drained yet waits for. */
  _nextStep(h) { if (!h.step) { let res; const p = new Promise((r) => { res = r; }); h.step = { p, res }; } return h.step.p; }
  _stepped(h) { const st = h.step; if (st) { h.step = null; st.res(); } }
  /** One append to a hold, BOUNDED: a batch alone past the bound keeps its newest rows; a segment past HOLD_SEG_BYTES starts
   *  the next; past the bound the oldest segments go — every row dropped COUNTED and said in one line. r5: the count is the
   *  dropped SET — r6: the dropped ROWS' rids (`h.gone`), never a position. A re-sent row the set holds is held again only
   *  when every row of the append fits without dropping another (it leaves the set: recorded after all); else it stays
   *  dropped — counted once, never re-written. r7 THE ORDER: the rows, then the set's lines (`gone` / `back` and `below` —
   *  the first segment kept) naming only what the rows' append confirmed, then the unlinks; an append that throws is cut
   *  back and the hold is as it was, on disk and in memory (a set line that cannot be written cuts the rows back too). The
   *  bound counts UNDRAINED bytes (`at`, the drain's cursor); r8: DEDUP AND THE DRAIN CURSOR ARE TWO THINGS — a segment
   *  keeps every rid until it is unlinked (r7 pruned a drained row from `rids`, which is also the duplicate check: a
   *  re-send mid-drain was held twice and pushed out undrained acked rows — 12 of 16 recorded); a pushed-out segment's
   *  dropped rows are its rows NOT DRAINED (`done`). An unverified cut (the truncate and the stat both failed) SEALS its
   *  segment: the next rows go to a new one until a stat re-establishes its length. → {held, duplicates, again}. */
  async _holdAppend(h, rows, { ix = null, checked = false } = {}) {
    const kept = [], seen = new Set(); let duplicates = 0;
    for (const e of rows) {
      if (seen.has(e.rid) || h.segs.some((s) => s.rids.has(e.rid)) || (ix && ix.rids.has(e.rid))) { duplicates++; continue; }
      seen.add(e.rid); kept.push(e);
    }
    if (!kept.length) return { held: 0, duplicates, again: 0 };
    if (!checked) h.unchecked = true;
    const max = this._holdMax(), segMax = Math.min(max, this.holdSegBytes || HOLD_SEG_BYTES);
    const lenOf = (e) => Buffer.byteLength(e.line) + 1, leftOf = (s) => s.bytes - s.at, total0 = h.segs.reduce((a, s) => a + leftOf(s), 0);
    const back = kept.filter((e) => h.gone.has(e.rid));
    const fits = !back.length || total0 + kept.reduce((a, e) => a + lenOf(e), 0) <= max;
    const take = fits ? kept : kept.filter((e) => !h.gone.has(e.rid)), again = kept.length - take.length;
    if (!take.length) return { held: 0, duplicates: duplicates + again, again };
    const len = take.map(lenOf);
    let bytes = len.reduce((a, b) => a + b, 0), cut = 0;
    while (bytes > max && cut < take.length) bytes -= len[cut++]; // a batch alone over the bound: its oldest rows go
    let last = h.segs[h.segs.length - 1];
    if (last && last.sealed) { const n = await this._heldSize(this._holdFile(h, last.seq)); if (n >= 0) { last.bytes = Math.max(n, last.at); last.torn = true; last.sealed = false; } } // r8: its length known again
    const fresh = !last || last.sealed || (last.bytes && last.bytes + bytes > segMax);
    if (fresh && holdGenOf(h.nextSeq) !== h.gen) { // r7 (unreachable — see HOLD_SEQ_BOUND): never numbered as the next generation's
      console.warn(`[usage] the hold ${h.key} would rotate past its generation's ${HOLD_GEN_SPAN} segment numbers — refused (${HOLD_SEQ_BOUND}): this batch is not acked`);
      throw Object.assign(new Error(`the hold ${h.key} is past its generation's segment numbers`), { code: HOLD_SEQ_BOUND });
    }
    const seg = fresh ? { seq: h.nextSeq, rows: 0, bytes: 0, at: 0, rids: new Set(), done: new Set(), torn: false, sealed: false } : last;
    const segs = fresh ? [...h.segs, seg] : h.segs, gone = [];
    for (let total = segs.reduce((a, s) => a + leftOf(s), 0); segs.length - gone.length > 1 && total + bytes > max;) { const old = segs[gone.length]; gone.push(old); total -= leftOf(old); }
    // r10: A ROW THAT FITS IS NEVER PUSHED OUT BY THE ROWS THAT ARRIVED WITH THE DRAIN — while the hold drains (its month back
    // in shape) rows that would push out a segment not drained yet wait for the drain's next step, which empties the hold
    // a slice per loop turn: the bound drops only what a hold that does not drain cannot keep (r4–r9: the batch that
    // started the drain was appended before its first step — 15 held rows dropped, 3 of 18 recorded; a drain that fails
    // or ends lets it go at once, the bound judged then)
    if (h.draining && gone.some((g) => g.rids.size > g.done.size)) return { wait: this._nextStep(h) };
    const keep = cut ? take.slice(cut) : take;
    // the rows dropped: this batch's oldest past the bound + the pushed-out segments' rows NOT DRAINED (r8: `done`, the
    // drain's own record — never by shrinking `rids`)
    const dropRids = [...take.slice(0, cut).map((e) => e.rid), ...gone.flatMap((g) => [...g.rids].filter((r) => !g.done.has(r)))], backRids = fits ? back.map((e) => e.rid) : [];
    const below = gone.length ? segs[gone.length].seq : 0; // r7: every segment numbered under it is done (its rows in the set)
    const setText = dropRids.length || backRids.length || below ? (h.goneTorn ? '\n' : '') + dropLines('gone', dropRids) + dropLines('back', backRids) + (below ? JSON.stringify({ below }) + '\n' : '') : '';
    const text = keep.length ? (seg.torn ? '\n' : '') + keep.map((e) => e.line).join('\n') + '\n' : '';
    await this._holdIO('folder', this.heldDir, fs.promises.mkdir(this.heldDir, { recursive: true }));
    // r7 THE ORDER — the rows first: one that throws is cut back, the hold as it was (disk and memory)
    const file = this._holdFile(h, seg.seq);
    if (text) {
      if (fresh) this._diskFiles.add(file);
      const f = await this._holdWrite(file, text, seg.bytes);
      if (f) { this._holdTorn(h, seg, fresh, f.at); throw f.error; }
    }
    // … then the set's lines, naming only what the rows' append confirmed: one that throws is cut back and the rows with it
    // (rows that cannot be cut back are on disk whole — then they are held, and nothing is dropped)
    if (setText) {
      const f = await this._holdWrite(this._dropFile(h.key, h.gen), setText, h.goneBytes);
      if (f) {
        this._goneTorn(h, f.at);
        const at = text ? await this._holdCut(file, seg.bytes) : seg.bytes;
        if (at !== seg.bytes) { if (fresh) { h.segs.push(seg); h.nextSeq++; } seg.torn = at !== seg.bytes + Buffer.byteLength(text); seg.sealed = at < 0; seg.bytes = at < 0 ? seg.bytes + Buffer.byteLength(text) : at; seg.rows += keep.length; for (const e of keep) seg.rids.add(e.rid); for (const r of backRids) h.gone.delete(r); }
        throw f.error;
      }
      h.goneBytes += Buffer.byteLength(setText); h.goneTorn = false;
    }
    // … both landed: the memory …
    if (fresh && text) { h.segs.push(seg); h.nextSeq++; }
    if (text) { seg.torn = false; seg.bytes += Buffer.byteLength(text); seg.rows += keep.length; for (const e of keep) seg.rids.add(e.rid); }
    for (const r of dropRids) h.gone.add(r);
    for (const r of backRids) h.gone.delete(r);
    if (below) h.below = Math.max(h.below, below);
    // … and only now the files go (a crash before their unlink: `below` names them)
    for (const old of gone) { h.segs.splice(h.segs.indexOf(old), 1); await this._holdUnlink(h, old.seq); }
    if (h.goneBytes > h.compactAt) await this._dropCompact(h);
    if (dropRids.length) console.warn(`[usage] the rows of ${h.base} held for ${h.hostName || h.host} passed the hold's ${Math.round(max / 2 ** 20)} MiB: its ${dropRids.length} oldest held row(s) were dropped — ${this._droppedOf(h)} dropped so far, counted in its notice${h.unchecked ? ' (some may be in the ledger already: checked when the month is back in shape)' : ', never recorded'}`);
    return { held: keep.length, duplicates: duplicates + again, again };
  }
  /** r7: ONE append to a hold's file (a segment's rows, its generation's set lines) — whole or not at all: one that throws
   *  (ENOSPC, EDQUOT, EMFILE — a part of it may have landed) is cut back to the length it had (`before`). r8: on the
   *  async road. → null (landed) | {error, at} (`at`: its length now — `before`, else the real one: the cut failed too,
   *  see `_holdTorn`; −1: not even its length could be read). */
  async _holdWrite(file, text, before) {
    try { await this._holdIO('append', file, fs.promises.appendFile(file, text)); return null; } catch (error) { return { error, at: await this._holdCut(file, before) }; }
  }
  /** r7: a hold's file cut back to `before` bytes → its length now (`before`; the real one when the cut fails; −1 unknown).
   *  A file the append created (`before` 0) is unlinked — never an empty file left beside the hold. */
  async _holdCut(file, before) {
    try { if (before > 0 || !(await this._heldUnlink(file))) await this._holdIO('cut', file, fs.promises.truncate(file, before)); return before; }
    catch (e) { if (e && e.code === 'ENOENT') return 0; return this._heldSize(file); }
  }
  /** r8: a hold file's length (−1: unknown). */
  async _heldSize(file) { try { return (await this._holdIO('stat', file, fs.promises.stat(file))).size; } catch { return -1; } }
  /** r7: a segment an append left torn (its cut failed too) — known in-process: its next line on a line of its own, its
   *  length the real one, a fresh one's number used. r8: a length that could not be read SEALS it (r7 kept the old one,
   *  and a later cut back truncated rows an append between had landed and acked — 2 of 10 lost, counted nowhere). */
  _holdTorn(h, seg, fresh, at) {
    if (at === seg.bytes) return;
    seg.torn = true;
    if (at < 0) seg.sealed = true; else if (at > seg.bytes) seg.bytes = at;
    if (fresh) { h.segs.push(seg); h.nextSeq++; }
  }
  /** r7: the set file an append left torn (its cut failed too): its next line on a line of its own, and the set rewritten
   *  whole (from memory) at the next append — the fragment's whole lines never read back as the set's. */
  _goneTorn(h, at) {
    if (at === h.goneBytes) return;
    h.goneTorn = true; if (at > h.goneBytes) h.goneBytes = at;
    h.compactAt = 0;
  }
  /** r7: one RECORD line in the generation's set file (`below`, `retired`; r9: or the lines themselves — `back` + `checked`)
   *  → whether it landed. */
  async _holdMark(h, line) {
    const text = (h.goneTorn ? '\n' : '') + (typeof line === 'string' ? line : JSON.stringify(line) + '\n');
    const f = await this._holdWrite(this._dropFile(h.key, h.gen), text, h.goneBytes);
    if (f) { this._goneTorn(h, f.at); return false; }
    h.goneBytes += Buffer.byteLength(text); h.goneTorn = false;
    if (line && line.below) h.below = Math.max(h.below, line.below);
    return true;
  }
  /** r6: the set file rewritten as the set (tmp + rename) once its lines pass 4× it — an error leaves the old one (valid).
   *  r7: `below` rides it; 4× from growth alone rewrites it at 64 KiB, 256 KiB, 1 MiB, … (≈ 1.33× its final size in all).
   *  r8: on the async road (r7 wrote the whole set — uncapped — on the main thread). */
  async _dropCompact(h) {
    const f = this._dropFile(h.key, h.gen), text = dropLines('gone', [...h.gone]) + (h.below ? JSON.stringify({ below: h.below }) + '\n' : '');
    try {
      if (!text) { if (await this._heldUnlink(f)) h.goneBytes = 0; }
      else { await this._holdIO('compaction', f, fs.promises.writeFile(f + '.tmp', text)); await this._holdIO('compaction', f, fs.promises.rename(f + '.tmp', f)); h.goneBytes = Buffer.byteLength(text); }
      h.goneTorn = false;
    } catch { await this._heldUnlink(f + '.tmp'); }
    h.compactAt = Math.max(DROP_COMPACT_MIN, 4 * h.goneBytes);
  }
  /** r8: THE END of a hold — every row of it recorded or dropped: its count SAID first (`said`: the notice store has it on
   *  disk — `_resumed` / `_sayDropped`), then its `retired` record (a generation with a file on disk — r7), then its set's
   *  unlink (r7 wrote `retired` while the notice carrying the count sat in the store's 500 ms debounce: a restart read
   *  nothing back and said nothing — 33 drops never said). A count not said keeps the hold, empty, its set on disk: the
   *  month's next episode continues it, a read-back says it again. One job of the hold's road. → Promise(ended) | null. */
  _holdEnd(h, said = true) {
    if (!h || h.none) return null;
    if (!said) { h.unsaid = true; return null; } // r9: said again at its machine's every ingest (`_sayUnsaid`) and, after a restart, by its read-back (its set)
    if (h.ending) return h.ending;
    const p = h.ending = this._holdJob(h, async () => {
      if (h.segs.length || h.pending > 0) return false; // rows arrived meanwhile: not over
      if (h.goneBytes || h.stale || h.goneTorn) await this._holdMark(h, { retired: h.gen });
      if (!h.stale) await this._heldUnlink(this._dropFile(h.key, h.gen));
      if (this._holds.get(h.key) === h) this._holds.delete(h.key);
      return true;
    }).finally(() => { if (h.ending === p) h.ending = null; });
    return p;
  }
  /** r8: a count said where no pause carries it (a hold drained at boot with no open notice; one read back with nothing
   *  live) — the notice files one when it holds none that says it (`dropped`) → whether it is said (on disk). */
  _sayDropped(h, dropped) {
    if (!dropped) return true;
    const base = h.base + '.ndjson';
    return this._emitShape({ kind: 'dropped', host: h.host, hostName: h.hostName || h.host, shard: base, month: base.slice(7, 14), dropped, gen: h.gen, unchecked: !!h.unchecked, holdMax: this._holdMax() }) !== false;
  }
  /** r7: ONE unlink of a hold's file → whether it is gone (an error — EBUSY on the NFS data dir — leaves it: `stale`). */
  async _heldUnlink(p) { return (await this._heldUnlinkCode(p)) === null; }
  /** r14: an unlink of the hold's road → null (gone) | the code of the error it met (said as what was done). */
  async _heldUnlinkCode(p) { try { await this._holdIO('unlink', p, fs.promises.unlink(p)); this._diskFiles.delete(p); return null; } catch (e) { if (e && e.code === 'ENOENT') { this._diskFiles.delete(p); return null; } return errCode(e); } }
  async _holdUnlink(h, seq) { const done = await this._heldUnlink(this._holdFile(h, seq)); if (!done) h.stale = true; return done; }
  /** r4: a month back in shape — its held rows ingested IN ORDER (the oldest segment first) through the ingest's own law (the
   *  shard's rid index: a row the ledger already holds costs zero bytes), a slice at a time. One drain per hold; a failed
   *  append leaves the rest held. r5: its end (`_drained`) is what ends the month's pause; its failure (`_drainFailed`)
   *  keeps it, `drain-failed`, tried again at the machine's every ingest and at a restart. r8: every step a job of the
   *  hold's road (r7 drained a hold ≤ 8 MiB inline) — the rows the month gets meanwhile queued in the hold behind it.
   *  r9: a hold with nothing held left and a count goes this road too (r8 ended it at once): the month's index is loaded
   *  first, so its count is judged against the ledger — never «never recorded» for rows a restart could not check.
   *  → its promise | null. */
  _drainHold(h) {
    if (!h || h.none || h.loading) return null;
    if (h.draining) return h.draining;
    h.unsaid = false;
    const shard = this._shardPath(h.base + '.ndjson'), sum = { rows: 0, appended: 0, duplicates: 0 };
    h.draining = this._track((async () => {
      for (let waits = 0; ;) {
        await new Promise((r) => setImmediate(r)); // a slice per loop turn — the first one too (`draining` is set before any work)
        if (!this._ingestIndex(shard)) { if (++waits > 3) throw new Error('the month\'s index could not be read'); const ix = this._ingestIx.get(shard); await (ix && ix.loading); continue; }
        const more = await this._holdJob(h, () => this._drainStep(h, shard, sum));
        this._stepped(h); // r10: an append waiting for room tries again (before the next step: its job is queued first)
        if (!more) break;
      }
      h.draining = null; this._stepped(h);
      this._drained(h, sum);
      return sum;
    })().catch((e) => { h.draining = null; this._stepped(h); this._drainFailed(h, e); return sum; }));
    return h.draining;
  }
  /** One slice of a drain (≤ WARM_SLICE_BYTES of the oldest segment) → true while there is more. r8 (residual 1): a segment
   *  read to its end is RECORDED done (`below`) BEFORE its unlink, in the same job — r7 left a loop turn between its last
   *  slice and its unlink and wrote `below` only when the unlink failed: a crash there read its recorded rows back as
   *  held, and a drop counted them «never recorded». */
  async _drainStep(h, shard, sum) {
    const seg = h.segs[0];
    if (!seg) return h.pending > 0;
    const rows = [];
    const r = await LD.eachLineAsync(this._holdFile(h, seg.seq), seg.at, (buf, a, b) => {
      const x = rowStart(buf, a, b); // a line torn by a crash mid-append is no row
      const rid = x < 0 ? null : LD.ridAt(buf, x, b);
      if (rid) rows.push({ rid, line: buf.toString('utf8', x, b) });
    }, { limit: WARM_SLICE_BYTES, io: this._ioOf('drain') });
    if (rows.length) {
      const a = this._appendRemote({ [shard]: rows }, [shard]); sum.rows += rows.length; sum.appended += a.appended; sum.duplicates += a.duplicates; seg.rows = Math.max(0, seg.rows - rows.length);
      for (const x of rows) seg.done.add(x.rid); // r8: the drain's own record — `rids` stays whole (the duplicate check)
    }
    if (!r.eof && r.end > seg.at) { seg.at = r.end; return true; }
    seg.at = Math.max(seg.at, r.end);
    // read to its end: every row of it is in the ledger — its end recorded, then its file unlinked
    await this._holdMark(h, { below: seg.seq + 1 });
    h.segs.splice(h.segs.indexOf(seg), 1);
    await this._holdUnlink(h, seg.seq);
    return h.segs.length > 0 || h.pending > 0;
  }
  /** A hold drained to its end — r5: and only NOW its month's pause ends (the shard judged again first: in shape ⇒ resumed,
   *  its notice closed with the count it ended with — r8: filtered against the index the drain loaded — then the hold
   *  ended; out of shape again ⇒ a shape pause, the hold (empty) going on with its count). A resume follows a drain, never
   *  precedes it. */
  _drained(h, sum) {
    if (h.segs.length || h.pending) return;
    const shard = this._shardPath(h.base + '.ndjson'), rec = this._pausedShards.get(this._pauseKey(h.host, shard));
    const dropped = this._droppedFinal(h, shard);
    if (sum.rows) console.log(`[usage] ${h.base}: the ${sum.rows} row(s) held for ${h.hostName || h.host} are in the ledger, in order — ${sum.appended} appended, ${sum.duplicates} it already held${dropped ? `; ${dropped} older held row(s) had been dropped past the hold's ${Math.round(this._holdMax() / 2 ** 20)} MiB` : ''}`);
    else if (dropped) console.log(`[usage] ${h.base}: the hold of ${h.hostName || h.host} ends with nothing left to record — ${dropped} held row(s) had been dropped past its ${Math.round(this._holdMax() / 2 ** 20)} MiB (said in its notice)`);
    if (!rec) { this._holdEnd(h, this._sayDropped(h, dropped)); return; }
    let v; try { v = this._shapeVerdict(shard); } catch { v = { ok: true }; }
    if (v.ok) this._holdEnd(h, this._resumed(h.host, shard, rec, { drained: sum.rows, dropped, gen: h.gen }));
    else this._pause(h.host, rec.hostName, shard, v);
  }
  /** r5: A DRAIN THAT FAILED (ENOSPC …) — the rest stays held and the month stays PAUSED, in state `drain-failed` (its own
   *  notice words and Usage-window row: «N held events could not be recorded: <code> — retrying»), tried again at every
   *  ingest of that machine (any month) and at a restart. Said when it starts and when its error or its counts move. */
  _drainFailed(h, e) {
    const code = String((e && e.code) || (e && e.message) || e).slice(0, 80);
    const shard = this._shardPath(h.base + '.ndjson'), key = this._pauseKey(h.host, shard), prev = this._pausedShards.get(key), now = Date.now();
    const base = path.basename(shard), ix = this._ingestIx.get(shard);
    const rec = { ...(prev || { host: h.host, shard: base, month: base.slice(7, 14), size: ix ? ix.size : 0, ratio: null, why: 'size', exact: false, since: now, remedy: { state: 'none' } }), hostName: h.hostName || (prev && prev.hostName) || h.host, lastAt: now, held: this._heldCount(h), dropped: this._droppedOf(h), unchecked: !!h.unchecked, gen: h.gen, holdMax: this._holdMax(), drain: { state: 'failed', code, tries: ((prev && prev.drain && prev.drain.tries) || 0) + 1, at: now } };
    delete rec.holdError;
    this._pausedShards.set(key, rec);
    if (prev && prev.drain && prev.drain.state === 'failed' && prev.drain.code === code && prev.held === rec.held && prev.dropped === rec.dropped) return;
    console.warn(`[usage] the ${rec.held} row(s) of ${base} held for ${rec.hostName} could not be recorded (${code}) — they stay held and ${rec.month} stays paused; tried again at the machine's next harvest and at a restart`);
    this._emitShape({ kind: 'paused', ...rec });
  }
  /** r9: a hold whose count its end could not put on disk (`unsaid`) — said again: its month in shape ⇒ its end again (the
   *  drain's road: the index, the count, the notice, the end); out of shape ⇒ it goes on (its next pause says it). */
  _sayUnsaid(h) {
    if (!this._unsaidNow(h)) return;
    // r10: tried again at most once a minute (r9 re-sent the event at every ingest while the store refused writes: 4 a life,
    // a wire line each). r11: A RETRY IS A RETRY — `_retryPaced`: the first ingest after the window, or the window's end
    // while the machine keeps sending (r10's `_sayAgain` gate never tried again under ingests closer than its window); the
    // line only when a try ran
    this._retryPaced(`unsaid\n${h.key}`, () => { if (!this._unsaidNow(h)) return false; this._drainHold(h); return true; },
      (n) => `[usage] ${h.base}: the ${this._droppedOf(h)} dropped row(s) of ${h.hostName || h.host}'s hold are not on disk in their notice yet (the store refused the write) — tried again now; at most once a minute while its machine sends${n ? ` (${n} ingest(s) since the last try did not try)` : ''}`);
  }
  /** r11: is the unsaid count of hold `h` to be tried now? (its month in shape, nothing of its road running) */
  _unsaidNow(h) {
    if (!h.unsaid || h.ending || h.loading || h.draining || this._holdBusy(h) || this._holds.get(h.key) !== h) return false;
    let v; try { v = this._shapeVerdict(this._shardPath(h.base + '.ndjson')); } catch { return false; }
    return !!v.ok;
  }
  /** A hold read back (a restart, an ingest's first touch): its month in shape ⇒ drained (its pause, if any, resumed); out
   *  of shape ⇒ that month paused and said with its counts (a hold with no notice gets its one). r8: a hold read back
   *  with nothing live and a count (never retired: its count may never have reached the owner) — said (`dropped`) and,
   *  its month in shape, ended. */
  _afterHoldLoad(h) {
    if (h.retired) { if (this._holds.get(h.key) === h) this._holds.delete(h.key); return; } // r7: a retired generation — nothing held, nothing said
    const shard = this._shardPath(h.base + '.ndjson'), rec = this._pausedShards.get(this._pauseKey(h.host, shard));
    let v; try { v = this._shapeVerdict(shard); } catch { return; }
    if (v.ok) { if (rec) this._resume(h.host, shard); else this._drainHold(h); }
    else if (rec || h.segs.length) this._pause(h.host, (rec && rec.hostName) || h.hostName, shard, v);
    else this._sayDropped(h, this._droppedOf(h));
  }
  /** Boot (r4): every hold on disk read back and judged (`_afterHoldLoad`, once its read-back ends — r8: on the async road)
   *  → how many; then (r5) a month the boot kept paused for its hold (restorePause) whose hold is read is resumed. r9: no
   *  sweep of set files (r6–r8 unlinked a set whose hold had no segment left — the drained generation's count, never
   *  said): a set file IS a generation (`_listOf`), read back like any — a retired or empty one unlinked by its read-back,
   *  one with a count said, then ended; an older generation's set goes with `_dropStale` (its count said before a newer
   *  generation could be minted). */
  restoreHolds() {
    let n = 0, keys;
    // r7: a listing that fails (EIO) reads nothing back now — r8: its retry reads every hold back (`_listBack`)
    try { keys = [...this._heldOnDisk().keys()]; } catch (e) { return 0; }
    const loads = [];
    for (const key of keys) {
      const x = /^(events-\d{4}-\d{2})~([A-Za-z0-9_-]+)$/.exec(key);
      if (!x) continue;
      n++;
      const shard = this._shardPath(x[1] + '.ndjson'), host = holdHostOf(x[2]);
      let h; try { h = this._holdOf(shard, host); } catch { continue; } // r9: its read-back failing — its own timer reads it
      const r = h === null ? this._holds.get(this._holdKey(shard, host)) : null;
      if (r && r.loading) loads.push(r.loading); else if (h && !h.none) this._afterHoldLoad(h);
    }
    this._track(Promise.allSettled(loads).then(() => {
      for (const rec of [...this._pausedShards.values()]) if (rec.drain && rec.drain.state === 'pending') this._resume(rec.host, this._shardPath(rec.shard));
    }));
    return n;
  }
  /** The holds now (a suite; the Usage window reads them through `ingestPaused`) → [{shard, host, held, dropped, bytes}]. */
  holdsNow() { return [...this._holds.values()].map((h) => ({ shard: h.base + '.ndjson', host: h.host, held: this._heldCount(h), dropped: this._droppedOf(h), bytes: h.segs.reduce((a, s) => a + s.bytes, 0), loading: !!h.loading, draining: !!h.draining })); }
  /** THE REMEDY of a paused shard (r2): its streaming dedup — one in flight; one that did not bring the shard back in shape
   *  (failed, not rewritten, still out of shape) runs again at a LATER pause once its backoff passed (REMEDY_RETRY_MS,
   *  doubling per try, ≤ REMEDY_RETRY_MAX_MS). r3: a dedup is a remedy for REPEATED rows only — a shard over the bound that
   *  a pass proved free of them (`proven-over`) and a month with more distinct rows than the index keeps (`ids`) get none:
   *  the remedy STOPS and says so (`_remedyStops`), never a dedup loop; a pause «judging» by the index waits for it. → true
   *  when it started a run. */
  _remedy(shard, v) {
    if (v.judging) return false;
    if (v.why === 'ids') { this._remedyStops(shard, 'ids', v); return false; }
    if (v.why === 'size' && v.proven) { this._remedyStops(shard, 'proven-over', v); return false; }
    if (this._dedupJobs.has(shard)) return false;
    const r = this._remedies.get(shard);
    if (r && !r.stopped && Date.now() < r.nextAt) return false;
    this.dedupShard(shard, { why: r ? `the growth alarm, try ${r.tries + 1}` : 'the growth alarm' }).catch(() => { });
    return true;
  }
  /** A paused shard's remedy as the notice and the Usage window say it: {state: one of REMEDY_STATES, tries, nextAt (null
   *  once it stopped), stopped?, …the last outcome (code, error, removed, after, verdict)}. */
  _remedyOf(shard) {
    shard = this._shardPath(shard);
    if (this._dedupJobs.has(shard)) return { state: 'running' };
    if (this._judging.has(shard)) return { state: 'judging' };
    const r = this._remedies.get(shard);
    return r ? { ...r.last, state: r.last.outcome, tries: r.tries, nextAt: r.stopped ? null : r.nextAt, ...(r.stopped ? { stopped: true } : {}) } : { state: 'none' };
  }
  /** Has a dedup pass proved THIS file (the inode it read) free of repeated rows? The one notion `_shapeVerdict` and
   *  `_remedy` share (r3: the inode-blind check left a file rewritten since paused with no remedy for the process's life). */
  _isProven(shard, st) {
    const p = this._proven.get(shard);
    return !!(p && st && p.ino === st.ino);
  }
  /** r3: THE REMEDY STOPS — nothing VibeSpace does brings the shard back in shape (no repeated rows to remove): the state
   *  kept (`proven-over` | `ids`), no retry, one line. → true when it is new. */
  _remedyStops(shard, outcome, v) {
    const prev = this._remedies.get(shard);
    if (prev && prev.stopped && prev.last.outcome === outcome) return false;
    this._remedies.set(shard, { tries: prev ? prev.tries : 0, nextAt: Infinity, stopped: true, last: { outcome, after: v.size == null ? null : v.size, at: Date.now() } });
    const held = [...this._pausedShards.values()].filter((x) => x.shard === path.basename(shard)).map((h) => h.hostName);
    console.warn(`[usage] ${path.basename(shard)}: ${outcome === 'ids' ? `the month holds more distinct rows than the ingest index keeps (${LD.MAX_IDS})` : `${((v.size || 0) / 2 ** 30).toFixed(2)} GiB and already free of repeated rows`} — removing rows cannot bring it back in shape, so VibeSpace stops trying; the usage of ${held.join(', ') || 'its machines'} for this month stays held (the month's file needs splitting or its bound raising, by hand)`);
    return true;
  }
  /** r3: judge a «judging» shard by its index — read once the ledger is warm (a step per turn, the ingest's own loader),
   *  then every paused host of the shard judged again (`_rejudge`). One read in flight per shard. */
  _judgeByIndex(shard) {
    if (this._judgeKick.has(shard)) return;
    const p = this.whenWarm().then(() => { if (this._ingestIndex(shard)) return null; const ix = this._ingestIx.get(shard); return ix && ix.loading; })
      .then(() => { this._judgeKick.delete(shard); this._rejudge(shard); }, (e) => { this._judgeKick.delete(shard); console.warn(`[usage] ${path.basename(shard)} could not be judged by its index: ${(e && e.message) || e} — judged again at the next ingest`); });
    this._judgeKick.set(shard, p);
  }
  /** Every paused host of a shard judged again now: in shape ⇒ resumed (its notice closes), else paused by the verdict. */
  _rejudge(shard) {
    const base = path.basename(shard);
    for (const rec of [...this._pausedShards.values()]) {
      if (rec.shard !== base) continue;
      let v; try { v = this._shapeVerdict(shard); } catch { continue; }
      if (v.ok) this._resume(rec.host, shard); else this._pause(rec.host, rec.hostName, shard, v);
    }
  }
  /** A remedy that ended without its shard back in shape: the outcome kept, the next try past the backoff, every paused host
   *  of the shard said again (its notice re-worded in place). `err` = the run threw (ENOSPC, EACCES …). */
  _remedyMissed(shard, r, err = null) {
    shard = this._shardPath(shard);
    const base = path.basename(shard), held = [...this._pausedShards.values()].filter((x) => x.shard === base && !x.drain);
    if (!held.length) { this._remedies.delete(shard); return; }
    let v; try { v = this._shapeVerdict(shard); } catch { v = { ok: false }; }
    // r3: the run proved there is nothing left to remove (over the bound with no repeats; more distinct rows than the index
    // keeps) ⇒ the remedy stops, said once — never retried
    if (!err && !(r && r.why) && !v.ok && (v.why === 'ids' || (v.why === 'size' && v.proven))) {
      this._remedyStops(shard, v.why === 'ids' ? 'ids' : 'proven-over', v);
      for (const h of held) { const was = h.remedy && h.remedy.state; h.size = v.size; h.why = v.why; h.remedy = this._remedyOf(shard); if (was !== h.remedy.state) this._emitShape({ kind: 'paused', ...h }); }
      return;
    }
    const prev = this._remedies.get(shard), tries = (prev && !prev.stopped ? prev.tries : 0) + 1, now = Date.now();
    const last = err ? { outcome: 'failed', code: (err && err.code) || null, error: String((err && err.message) || err).slice(0, 200) }
      : r && r.why ? { outcome: 'not-rewritten', code: null, error: String(r.why).slice(0, 200) }
      : { outcome: 'insufficient', removed: r ? r.removed : 0, after: v.size == null ? null : v.size, verdict: v.why || null, ratio: v.ratio == null ? null : Math.round(v.ratio * 10) / 10 };
    const base0 = this.remedyRetryMs != null ? this.remedyRetryMs : REMEDY_RETRY_MS;
    const backoff = Math.min(this.remedyRetryMaxMs || REMEDY_RETRY_MAX_MS, base0 * 2 ** (tries - 1));
    this._remedies.set(shard, { tries, nextAt: now + backoff, last: { ...last, at: now } });
    const said = last.outcome === 'failed' ? `removing its repeated rows failed (${last.code || last.error})` : last.outcome === 'not-rewritten' ? `it was not rewritten (${last.error})` : `it is still out of shape after the dedup (${((v.size || 0) / 2 ** 30).toFixed(2)} GiB${v.ratio ? `, ~${Math.round(v.ratio * 10) / 10}×` : ''})`;
    console.warn(`[usage] ${base}: ${said} — the usage of ${held.map((h) => h.hostName).join(', ')} stays paused; tried again at a pause after ${Math.round(backoff / 60e3)} min`);
    for (const h of held) { if (!v.ok && v.size != null) { h.size = v.size; h.why = v.why; h.ratio = v.ratio == null ? null : Math.round(v.ratio * 10) / 10; } h.remedy = this._remedyOf(shard); this._emitShape({ kind: 'paused', ...h }); }
  }
  /** Boot (r2): a pause said before a restart (its notice still open), judged again now → the paused record (out of shape:
   *  the host paused again, its ONE notice kept and re-worded in place) or null (in shape: the notice closes). r3: judged
   *  by THE RULE THAT OPENED IT (`why`, `exact`) — a pause the index judged (an exact ratio, the ids bound) waits for the
   *  index (`judging`, read after the ledger loads): the sample cannot see what the index counted, so it never closes it. */
  restorePause(hostId, hostName, shardName, { why = null, exact = false, ratio = null } = {}) {
    if (!hostId || !shardName || !/^events-\d{4}-\d{2}\.ndjson$/.test(path.basename(String(shardName)))) return null;
    const shard = this._shardPath(shardName);
    if (why === 'ids' || (why === 'ratio' && exact)) this._judging.set(shard, { ino: null, why, ratio: Number(ratio) || null }); // its inode: the verdict's own stat below
    let v; try { v = this._shapeVerdict(shard); } catch { v = { ok: true }; }
    if (!v.ok) return this._pause(hostId, hostName, shard, v);
    // r5: in shape again, but the month's hold is still there — the pause stays, QUIETLY (its notice as it was), until the
    // hold is drained (`restoreHolds` → `_afterHoldLoad` → `_resume`): a resume follows a drain, never precedes it
    if (!this._holdsAny(shard, hostId)) return null;
    const key = this._pauseKey(hostId, shard), base = path.basename(shard), now = Date.now();
    const rec = this._pausedShards.get(key) || { host: hostId, hostName: hostName || hostId, shard: base, month: base.slice(7, 14), size: v.size || 0, ratio: Number(ratio) || null, why: why || 'size', exact: !!exact, since: now, lastAt: now, held: null, dropped: null, holdMax: this._holdMax(), remedy: { state: 'none' }, drain: { state: 'pending' } }; // r8: counts unknown until its hold is read
    this._pausedShards.set(key, rec);
    return { ...rec };
  }
  /** One month of a host back in shape (r4: per shard). r5: THE DRAIN FIRST — a month with rows held is drained (in order),
   *  and its pause ends only when the drain has (`_drained` → `_resumed`); while it runs the month stays paused
   *  (`drain: {state: 'draining'}`, the rows it gets meanwhile queued behind), a failed one keeps it (`_drainFailed`). A
   *  big hold still being read waits for its read (`_afterHoldLoad`). */
  _resume(hostId, shard) {
    const key = this._pauseKey(hostId, shard), rec = this._pausedShards.get(key);
    if (!rec) return;
    let h; try { h = this._holdOf(this._shardPath(rec.shard), hostId); } catch { return; } // r7: its hold unknown (a listing failed) — it stays paused
    if (!h) return;
    if (this._holdBusy(h) || (!h.none && h.gone.size)) { // r9: nothing held but a count — said through the drain's road (the index first)
      this._drainHold(h);
      const now = this._pausedShards.get(key);
      if (now && h.draining && (!now.drain || now.drain.state !== 'failed')) now.drain = { ...(now.drain || {}), state: 'draining' };
      return;
    }
    // r6: nothing left to drain (a crash survivor dropped at the read-back was its last segment) — r8: its count said (the
    // notice on disk), then the hold ended
    const dropped = h.none ? rec.dropped || 0 : this._droppedFinal(h, this._shardPath(rec.shard));
    this._holdEnd(h, this._resumed(hostId, shard, rec, { drained: 0, dropped, gen: h.none ? null : h.gen }));
  }
  /** The pause of a month that is back in shape with nothing held: gone, said once, its notice closed ('resumed') → r8:
   *  whether its count is said (the notice store has it on disk — the hold's end waits for that). */
  _resumed(hostId, shard, rec, { drained = 0, dropped = 0, gen = null } = {}) {
    const key = this._pauseKey(hostId, shard);
    if (this._pausedShards.get(key) !== rec) return true;
    this._pausedShards.delete(key);
    if (![...this._pausedShards.values()].some((x) => x.shard === rec.shard)) { this._remedies.delete(this._shardPath(rec.shard)); this._judging.delete(this._shardPath(rec.shard)); }
    console.log(`[usage] ${rec.shard} is back in shape — the usage of ${rec.hostName} for ${rec.month} is recorded again${drained ? `; its ${drained} held event(s) are in the ledger, in order` : ''}${dropped ? ` (${dropped} older held event(s) had been dropped past the hold's bound)` : ''}`);
    return this._emitShape({ kind: 'resumed', ...rec, held: 0, drained, dropped, gen, at: Date.now() }) !== false;
  }
  /** One event to `onShape` → what it answered (r8: false = a count it could not put on disk). */
  _emitShape(ev) { try { return this.onShape?.(ev); } catch { return false; } }
  /** The paused months — host × shard, r4 (the Usage panel's ledger note, /api/usage-stats `ingestPaused`). */
  ingestPaused() { return [...this._pausedShards.values()].map((r) => ({ ...r })); }
  /** THE STREAMING DEDUP of one shard (src/usage-ledger-dedup.js) on the loop in slices — the one door the boot migration
   *  and the growth alarm share: one job per shard in flight (a second ask joins it). After a rewrite the ledger cache
   *  rebuilds off the loop (the new inode), the index re-reads its marks, the ingest index and the shape are read again,
   *  and every paused host of that shard is re-judged. → the job's result (LD.dedupSteps). */
  dedupShard(file, { why = 'asked', archiveDir = path.join(path.dirname(this.dir), 'archive'), sliceMs = LD.SLICE_MS } = {}) {
    file = this._shardPath(file);
    const key = file;
    if (this._dedupJobs.has(key)) return this._dedupJobs.get(key);
    const t0 = Date.now();
    const p = LD.runStepped(LD.dedupSteps(file, { archiveDir }), { sliceMs }).then((r) => {
      this._dedupJobs.delete(key);
      console.log(`[usage] ledger dedup ${r.shard} (${why}): ${r.before} → ${r.after} B, ${r.removed} repeated row(s) removed of ${r.rows}${r.archived ? `, ${r.archived} differing cop(ies) archived` : ''}${r.why ? ` — not rewritten: ${r.why}` : ''} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      this._afterDedup(file, r);
      this._emitShape({ kind: 'dedup', shard: r.shard, before: r.before, after: r.after, removed: r.removed, renamed: r.renamed, why: r.why || null });
      return r;
    }, (e) => {
      this._dedupJobs.delete(key);
      console.warn(`[usage] ledger dedup of ${path.basename(file)} failed (${why}): ${(e && e.message) || e} — the shard is left as it was`);
      this._remedyMissed(file, null, e); // r2: a paused host's notice says what happened (never only this line)
      throw e;
    }).finally(() => { this._dedupJobs.delete(key); });
    this._dedupJobs.set(key, p);
    return p;
  }
  _afterDedup(file, r) {
    const shard = this._shardPath(file);
    if (r.renamed) { this._ingestIx.delete(shard); this._shapes.delete(shard); this.reloadEvents(); }
    // the file the pass leaves holds no repeated row (nothing to remove, or a rewrite that kept no differing copy) — proven,
    // for THIS inode (r3: a rewrite proves the new file; a later rewrite by anyone else is unproven again)
    if (!r.why && (r.removed === 0 || (r.renamed && !r.keptDiffering))) { try { this._proven.set(shard, { ino: fs.statSync(shard).ino }); } catch { } }
    for (const rec of [...this._pausedShards.values()]) {
      if (rec.shard !== path.basename(shard)) continue;
      if (this._shapeVerdict(shard).ok) this._resume(rec.host, shard);
    }
    // r2: still paused after the run ⇒ the notice says what happened (not rewritten / still out of shape), retried later
    if ([...this._pausedShards.values()].some((x) => x.shard === path.basename(shard) && !x.drain)) this._remedyMissed(shard, r); else this._remedies.delete(shard);
  }
  /** A shard's path as the ingest keys it (`_shardFor`'s spelling: this.dir + the name). */
  _shardPath(file) { return path.join(this.dir, path.basename(file)); }
  // ── F2 THE HUB-KEPT DEVICE CURSOR (lane ledger-dedup-law) ──────────────────────────────────────────────────────────────
  // The usage harvest read a machine's events since its cursor, then wrote the cursor back ON THE DEVICE — a `files` act the
  // hub-act gate held for the owner on a cluster instance; nobody answered, so every harvest re-sent the whole window. The
  // hub keeps the cursor now: `_host-cursors/<host>.json` beside the ledger = the device walker's own cursor map (per-file
  // byte offsets) as of the last batch the hub made durable + the newest ts / rid it held. Written by ingestRemoteEvents
  // after the appends; read by src/hosts.js harvestUsage, which hands it to the device's usage scan.
  _hostCursorFile(hostId) { return path.join(this.hostCursorsDir, String(hostId).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160) + '.json'); }
  /** The hub's copy of a machine's usage cursor → {v, host, cursors, since, lastTs, lastRid, events, at} | null. */
  hostCursorOf(hostId) {
    if (this._hostCursors.has(hostId)) return this._hostCursors.get(hostId);
    let rec = null;
    try { const j = JSON.parse(fs.readFileSync(this._hostCursorFile(hostId), 'utf-8')); if (j && j.v === 1 && j.cursors && typeof j.cursors === 'object') rec = j; } catch { }
    this._hostCursors.set(hostId, rec);
    return rec;
  }
  _writeHostCursor(hostId, { cursors, since, lastTs, lastRid, events }) {
    const prev = this.hostCursorOf(hostId);
    const rec = { v: 1, host: String(hostId), cursors, since, lastTs: lastTs || (prev && prev.lastTs) || null, lastRid: lastRid || (prev && prev.lastRid) || null, events, at: Date.now() };
    timedSync('usage-host-cursors.write', () => { fs.mkdirSync(this.hostCursorsDir, { recursive: true }); this._writeAtomic(this._hostCursorFile(hostId), JSON.stringify(rec)); });
    this._hostCursors.set(hostId, rec);
    return rec;
  }
  /** The warm still loading past the takeover bound → {bytesLeft, at}, else null. A sync reader meanwhile answers from the
   *  rows loaded so far — so (lane ledger-dedup-law r2, NO MONEY DECISION FROM A PARTIAL LEDGER) costBetweenMulti says
   *  `partial` and memoizes nothing, the estimator learns and writes no rate and answers no estimate, and the pool engine's
   *  anchor sweep waits for the warm while its automatic decision is skipped (usage-estimator `wholeLedgerGate`). */
  ledgerLoading() { const left = this._pendingLeft(); return left > this._takeoverMax() ? { ...this._evCache.loading } : null; }
  /** Resolves when the stepped boot warm (if any) has ended. Never rejects. */
  warmSettled() { return this._warmP ? this._warmP.then(() => { }, () => { }) : Promise.resolve(); }
  /** THE WHOLE LEDGER (lane ledger-dedup-law r2): resolves at once when a reader may load what is left in its own tick, else
   *  when the stepped warm ends — a warm that a reload restarted is the same warm. Never rejects. */
  whenWarm() { return this._waitBigWarm() || Promise.resolve(); }
  /** An async reader's wait: the warm has more left than a takeover may parse ⇒ wait for it, else nothing. */
  _waitBigWarm() { return this._pendingLeft() > this._takeoverMax() ? this.warmSettled() : null; }
}

module.exports = { UsageHoldRoad, setRecordCut, setReadClass, readClassOf, SET_ASIDE_DIR, SET_ASIDE_MAX, SET_READ_PASSES, SET_READ_REFUSED };

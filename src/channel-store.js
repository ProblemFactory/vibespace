'use strict';
/**
 * THE CHANNEL STORE — persistence primitives for `data/channels/`
 * (docs/design-communication-panel.zh.md §5 + §5.1).
 *
 * SHARED tier: `fs` and `path` only. It knows how bytes are laid out and
 * nothing at all about adapters, ACLs, policy or money.
 *
 *   data/channels/
 *     adapters.json                  atomic JSON — one record per connected adapter
 *     index.json                     atomic JSON — ONE in-process owner (§5.1)
 *     msgs/<adapterId>/<convId>.ndjson   APPEND-ONLY log, one ChannelRecord per line
 *     groups.json                    atomic JSON — agent groups (§22.5), ONE serialized owner
 *     msgs/groups/<groupId>.ndjson   a group's log: an ordinary append-only conversation log
 *     wake-pace.json                 atomic JSON — the groups' WAKE PACE ledger (r2): who woke whom
 *                                    when, pruned to its windows, so a restart forgets no floor
 *     dispatch-ledger.json           atomic JSON — THE DISPATCH LEDGER (lane worker-dispatch verify r1 ②): what each
 *                                    brief (sha256 of sender | worker | text) already did — compactAt / deliveredAt —
 *                                    so a retry after a restart replays instead of compacting and waking again
 *     poll-stamps.json               atomic JSON — each row's poll stamps (design 011 lane 2): the JOURNAL's
 *                                    COMPACTION (B-360d), written past the journal's bound, on a failed line and at
 *                                    close; poll-stamps.log = APPEND-ONLY, one line per stamp set (a kill -9 keeps
 *                                    every stamp), folded by the compaction that lands
 *     <file>.corrupt-<ts>            a JSON store that could not be read at boot, SET ASIDE with its
 *                                    bytes intact (r2) — never unlinked, never overwritten
 *     audit.ndjson                   APPEND-ONLY, rolled by DATE into archive/
 *     attachments/<adapterId>/<convId>/<sha1>  an attachment fetched ON DEMAND (2026-09-26,
 *                                    the aggregated IM): 0600, never executed, beside its
 *                                    `<sha1>.json` meta; attachments/<adapterId>/lru.json = the
 *                                    ACCOUNT's LRU ledger, evicted down to the budget the
 *                                    caller hands in (`channels.attachmentBudgetMB`)
 *     archive/                       archive-never-destroy
 *
 * THE INVARIANTS, each with its reason:
 *
 * 1. APPENDING IS O(1). The message log is NDJSON because rewriting a JSON
 *    array per arriving message turns a busy group into an I/O problem. The
 *    index — small, read on every render — stays atomic JSON.
 *
 * 2. DEDUP BY `(adapterId, convId, vendorId)`, held as a bounded in-memory set
 *    per OPEN conversation and rebuilt from the log's tail when needed. A
 *    replayed page (Lark's anchor semantics guarantee one at a boundary; a
 *    Gmail history replay produces them too) MUST be a no-op, never a
 *    duplicate row.
 *
 *    THE SET REMEMBERS A RECORD ONLY AFTER ITS BYTES ARE DURABLE (r2). This
 *    set's whole meaning is "the log already holds this", so adding to it
 *    before `appendFileSync` returns makes ONE transient write failure
 *    (ENOSPC, EIO, EDQUOT, or ENAMETOOLONG from a long percent-encoded vendor
 *    convId) a PERMANENT claim: the next pass reports `appended:0,
 *    duplicates:N`, the engine reads that as a complete pass and advances the
 *    anchor PAST messages that were never written. Silent, permanent message
 *    loss with no crash and no error — the exact opposite of invariant 4's
 *    promise that a crash costs at most a re-read. Duplicates WITHIN one batch
 *    are held in a local set that dies with the call.
 *
 *    AND A FAILED APPEND DROPS THE CACHED SET (r4 — the half of that rule r2
 *    stated backwards). "A failed append leaves no trace at all" was false:
 *    the write that threw may have landed a PREFIX of the batch, and those
 *    bytes are durable. The seal (r3, `appendLines`) recovers a prefix that
 *    stopped MID-record, but a prefix that stopped exactly on a record
 *    boundary — after a record's `}` (sealed into a valid line) or after its
 *    `\n` (nothing to seal) — is a complete record the log now holds while
 *    the live set still says "absent". So the SAME process re-offered the
 *    batch, appended that record again, and the append-only log served it
 *    twice for ever (`unread`/paging carrying a phantom message; no reader
 *    removes a line). A restart was already correct — the set is rebuilt
 *    from disk and `readTail` parses a final line without `\n` — which is
 *    exactly what says the mechanism is the stale LIVE set. Measured on the
 *    real store with `fs.writeSync` landing the prefix then throwing ENOSPC
 *    once: cut after `\n` and cut after `}` both served `v1,v2,v3,v4,v4,v5`
 *    and `countSince(0) === 6` for five records; the mid-record cut (the
 *    only shape r3's suite drove) was fine. Now `appendRecords` DELETES the
 *    conversation's cached set when the write throws, so the retry re-derives
 *    it from the log — byte-identical to the restart. The log is the ONLY
 *    witness to what a failed write landed; a set that outlives the throw is
 *    a guess dressed as a fact.
 *
 *    AND THE REBUILD REFUSES A LOG IT CANNOT READ (r5). `dedupSet` is the
 *    one reader whose answer writes bytes, and `readTail` answered every
 *    open/read error — EMFILE, EIO, EACCES, not only ENOENT — with an empty
 *    read; the empty set was CACHED, the next append wrote the re-offered
 *    batch as fresh, and a replayed boundary record (the shape Lark's anchor
 *    semantics guarantee) landed twice for ever. The rebuild runs on every
 *    conversation's first append after a boot, so the post-restart pass of
 *    every tracked conversation went through it. Now the rebuild asks
 *    `readTail(…, { strict: true })`: ENOENT is "no log yet", anything else
 *    throws out of `appendRecords` (the pass fails, the anchor stays, the
 *    retry re-reads) and nothing is cached. `countSince` stays lenient on
 *    purpose — it is a DERIVED number re-computed on the next pass, and it is
 *    asked inside the index owner's `update()` after the anchor has already
 *    moved in memory, where a throw would leave a half-applied update.
 *
 * 3. ONE WRITER, ONE ORDER (§5.1), FOR *BOTH* ATOMIC JSON FILES. Every mutable
 *    per-conversation fact lives in ONE index, and two adapter passes are
 *    OVERLAPPING BY DESIGN (the scheduler is per-adapter single-flight, not a
 *    global mutex). `writeJsonAtomic` is atomic at the FILESYSTEM layer only;
 *    the read-modify-write AROUND it is not, so two passes that each read a
 *    snapshot and each write it back lose whichever landed first. That is
 *    verbatim the round-4 `codex-zst` delta defect — *read-then-write with a
 *    size taken before the read is a lost update waiting for the second
 *    caller* — and it is WORSE here, because a clobbered ANCHOR advance makes
 *    the next pass SKIP messages rather than re-read them. Hence
 *    `index.update(fn)`: ONE door, serialized on a promise chain, and there is
 *    deliberately NO "write the whole index back" call for anyone else to
 *    reach for.
 *
 *    `adapters.json` GETS THE SAME TREATMENT AND FOR THE SAME REASON (r2).
 *    It was the exact shape this invariant exists to eliminate — every caller
 *    re-parsed the file, mutated its own private copy and wrote the whole
 *    array back — so a failing adapter's persisted health (`lastPass`,
 *    `consecutiveFailures`) was wiped by a healthy neighbour's pass landing
 *    second, and the panel then drew a token-expired adapter as healthy. That
 *    row is the ONE honesty signal compensating for a static freshness chip,
 *    and in P1 the same file also holds `push.demotedAt` / `push.missRate` /
 *    `scan.hostFacts` — a clobbered demotion is §6.4's "a lane that lies about
 *    being active turns the fallback OFF". So: read ONCE at construction,
 *    `adapters.live()` hands back THAT object (never a fresh parse), and
 *    `adapters.update(fn)` is the only way bytes reach the disk.
 *
 * 4. THE CURSOR ADVANCES ONLY AFTER A COMPLETE PASS, inside the SAME
 *    serialized update that describes that batch. A crash mid-pass re-reads;
 *    it never skips. The order INSIDE that update is fixed: records land in
 *    the durable append-only log FIRST, the anchor moves in the index SECOND,
 *    the coalesced index flush LAST — so a crash anywhere costs at most a
 *    re-read, which invariant 2 absorbs.
 *
 *    r2's rule is about what the set may CLAIM; r4's is about what it must
 *    FORGET (see invariant 2's r4 paragraph): the two throw shapes it guards
 *    are a throw BEFORE the write (nothing landed — the set stays, r2) and a
 *    throw INSIDE it (a prefix landed — the set is dropped, r4).
 *
 * 5. RETENTION IS PER CONVERSATION AND DOUBLY BOUNDED: the last N records or
 *    M days, WHICHEVER IS SMALLER, with a 7-DAY FLOOR because the estimator is
 *    defined over the last 7 days. Trimming streams to a temp file and
 *    renames — never edits in place.
 *
 * 7. A DERIVED VALUE NEVER BECOMES A STORED FACT. `unread` / `hits7d` /
 *    `msgs7d` are cached in the index for render speed and are always
 *    re-derivable from the log and the read mark. (`convCaps` and
 *    `scan.hostFacts` are the two NAMED exceptions and they pay for it with a
 *    TTL — see src/channel-caps.js.)
 *
 * 8. A SIDE RECORD IS EVIDENCE ABOUT A MESSAGE, NEVER A MESSAGE (lane
 *    channel-threads, 2026-09-28). A reaction added or removed, a vendor's
 *    thread count — facts that CHANGE after a message was written — land in
 *    the conversation's SIDE log (`msgs/<adapterId>/~side/<convId>.ndjson`,
 *    one `validateSide` record per line, append-only, deduped by `sideKey`
 *    with the same remember-after-the-bytes / drop-on-a-throw / strict-rebuild
 *    discipline as the message log) and are FOLDED at read time
 *    (src/channel-reactions.js). The side log is not in `readTail`, not in
 *    `countSince` (unread), not in `search`, not in paging, not in the message
 *    log's dedup set — by construction: it is another FILE in a SUBDIRECTORY
 *    whose name (`~side`) no vendor id can spell (`safeSeg` escapes `~`), so a
 *    conversation named `x.side` can never collide with conversation `x`'s side
 *    log. The two logs share the account's directory and `trim()`, nothing
 *    else. SHARED tier: fs + path + the PURE record / reactions modules (the
 *    side key and the compaction fold are theirs).
 */
const fs = require('fs');
const path = require('path');
const FC = require('./fd-close.js');   // B-15ac: the ONE close of a written file (a failed close said in the journal)
const { timedSync } = require('./timed-sync.js'); // PURE: the store-write clock (design 011 lane 1, store-timing)
const SR = require('./store-read.js'); // PURE: what ONE read of a store answers (B-f276 — a failed read is held, never set aside)
const SRH = require('./store-read-hold.js');   // B-f276 family (主开发 r3188): the store-read law's helper — each account's people memo
const SH = require('./store-hold.js'); // B-f276 1b (主开发 r809): THE STORE HOLD — one per family: the read, the hold, the ladder, the lift
const crypto = require('crypto');
const { sideKey, validateSide, isSystemRecord, asSystemRecord, isDraftRecord, asDraftRecord } = require('./channel-record.js');   // + the system pair: lane lark-system-records; + the draft pair: lane gmail-draft-not-a-message
// lane lark-threads (A1): THE PLACE PATCH's PURE rules (widen-only, the fold, the compaction) — imports only channel-record
const Thr = require('./channel-thread.js');
const { compactSide } = require('./channel-reactions.js');
// lane message-facts (B-f066): a message's `fx` lines (facts learned after it was stored) compact into ONE folded line
const { compactFactLines } = require('./channel-facts.js');
const { compactVersionLines } = require('./channel-revisions.js');   // PURE: a message's versions through the trim (lane channel-record-revisions)

/** Side-log dedup set bound per conversation (rebuilt from the whole side log on demand). */
const SIDE_DEDUP_MAX = 20000;
/** A reader stops after this many matching side lines (newest first). */
const SIDE_READ_MAX = 2000;
/** verify r1 (MONEY / the event loop): a side READ is the newest SIDE_READ_BYTES of the file, never the whole file
 *  (it used to read it whole, synchronously, on every page read and every broadcast fold — a 20 000-event storm on
 *  ONE message made every page read two 2.8 MiB reads on the loop, and nothing ever compacted the file: the
 *  compaction ran only inside a MESSAGE trim, which a reaction storm never causes). Past SIDE_COMPACT_BYTES an
 *  append COMPACTS the log in place (each message's lines folded into one snapshot + its newest thread stat — the
 *  same `compactSide` the trim uses), so the newest window holds every message's whole state. */
const SIDE_READ_BYTES = 2 * 1024 * 1024;
const SIDE_COMPACT_BYTES = 1024 * 1024;
/** verify r1 (continued, MONEY / the event loop): a compaction's OUTPUT is bounded too — at most SIDE_KEEP_BYTES, the
 *  most recently changed messages kept (last in the file, inside the read window), the least recently changed
 *  FORGOTTEN (a list adapter re-reads them when a window shows them; the fold of what is kept stays exact). Before:
 *  a compacted log past SIDE_COMPACT_BYTES (5 000 messages' snapshots = 5.4 MiB) was re-read, re-parsed and
 *  re-written WHOLE on every append (43 ms per reaction event, 10.8 MiB read + 5.4 MiB written each), and every
 *  message whose lines sat before the newest SIDE_READ_BYTES was invisible to every read. Half the trigger, so the
 *  next compaction is ≥ SIDE_KEEP_BYTES of appends away (amortized O(1) per event) and the window always holds it all. */
const SIDE_KEEP_BYTES = SIDE_COMPACT_BYTES / 2;
/** The side log's subdirectory under an account's message directory — `~` is never in a `safeSeg` output. */
const SIDE_DIR = '~side';
/** lane lark-threads (A1): conversations whose folded place patches stay cached (least recently read first out). */
const PLACE_CACHE_MAX = 500;
/** lane lark-threads (A1): place lines a side compaction keeps per conversation (the newest — they are folded into the
 *  message log at its next trim, so this bounds only a conversation that grows patches faster than it is trimmed). */
const PLACE_KEEP_MAX = 3000;

/** Decision 14: 90 days or 5,000 records, whichever is SMALLER, floor 7 days. */
const RETENTION_DAYS = 90;
const RETENTION_MAX_RECORDS = 5000;
const RETENTION_FLOOR_DAYS = 7;

/** Per-conversation dedup set bound. Rebuilt from the log tail on demand. */
const DEDUP_MAX = 8000;
/** Bytes per WINDOW of a backward read (`readTail` seeks one window at a time
 *  until it has enough — r3; it used to read exactly one and stop). */
const TAIL_BYTES = 2 * 1024 * 1024;

/** Coalesced flush (the `JobManager` shape: memory is authoritative, disk is
 *  debounced, and SIGINT/SIGTERM flush). */
const FLUSH_DEBOUNCE_MS = 500;
const FLUSH_INTERVAL_MS = 2000;
// The outbox keeps at most this many proposals on disk (terminal ones fall
// off oldest-first at write time; the audit log is the permanent record).
const OUTBOX_KEEP = 500;
// THE STATES THE BOUND MAY DROP (verify r3, 2026-09-27): every TERMINAL state of
// the outbox table — the same set src/channel-policy.js declares as
// TERMINAL_STATES (this store imports only fs/path, so the set is spelled here
// and test-channel-outbox pins the two equal). `withdrawn` was missing: an
// agent's withdrawals / replaces never left the file, and once they were all
// it held the bound dropped the owner's DECIDED records instead (540 withdrawn
// on disk, the ten rejections gone; the whole file rewritten on every write).
const OUTBOX_PRUNABLE = Object.freeze(['sent', 'failed', 'rejected', 'expired', 'withdrawn']);
// …AND THE ORDER THEY GO IN (verify r4, 2026-09-27): oldest-first ALONE let one
// agent's replace loop (each `--replaces` = one `withdrawn` record) push every
// OTHER drafter's decided records — the owner's own sent / rejected history —
// out of the store before a single withdrawal left it (measured: 520 replaces,
// the other drafter's 10 decided records all gone, 499 withdrawn kept). A
// record nobody decided goes first: an agent's own retraction, then a TTL
// expiry; what the owner decided (sent / failed / rejected) only after both
// are exhausted. Oldest-first within a rank; the audit log keeps every one.
const OUTBOX_PRUNE_RANK = Object.freeze({ withdrawn: 0, expired: 1, sent: 2, failed: 2, rejected: 2 });

const EMPTY_INDEX = () => ({ v: 1, conversations: {}, updatedAt: 0 });
// THE INCREMENTAL INDEX WRITE (lane channel-index-copy, B-f32b, 2026-10-03): index.json is written from cached
// chunks of INDEX_CHUNK rows; a write re-serializes only the chunks whose rows an update touched. Measured on a
// generated 50 274-conversation index (62 MB; userW's was 45 MB): the whole-file stringify cost 0.40–0.52 s of main
// thread every 2 s while anything changed. SWEEP_CHUNKS = the chunks re-checked per interval tick (a row changed
// outside `update()` reaches the disk within chunks / SWEEP_CHUNKS ticks, and is said — once, then at most every
// DRIFT_SAY_MS, so a hot writer past the door cannot flood the log).
const INDEX_CHUNK = 256;
const SWEEP_CHUNKS = 2;
const DRIFT_SAY_MS = 10 * 60 * 1000;
// B-dfa4 cut 3: THE ONE BUDGETED WALK. A first build over a big store's rows (the index's layout here; an account's due index
// and the boot's sweep in the engine) walked every row in ONE turn of the loop: 1.6 s / 1.2 s / 0.4 s on a store of 96 500
// rows (measured by the tree's loop-hold reader). A walk over at most WALK_SYNC_ROWS rows still runs in its caller's turn;
// a bigger one walks its items in SLICES of at most WALK_SLICE_MS by its own clock, a macrotask (setImmediate) between two
// slices, so the loop answers between them. Each caller states its snapshot and says what a reader gets before it lands.
const WALK_SYNC_ROWS = 4000;
const WALK_SLICE_MS = 25;
/** Walk `items` (the caller's STATED SNAPSHOT — an array) in slices, the first one a turn after the call: `fn(item, i)` for
 *  each; `alive()` is asked after each yield — false stops the walk (the caller knows why: closed, replaced, stale). `stats` (optional) counts the slices and
 *  keeps the longest (what a leg prints); `onSlice(i, what)` (a suite's) runs between two slices, awaited (`what` names the walk).
 *  → Promise<{ done, rows, slices, maxSliceMs, walkMs }>. */
async function walkSliced(items, fn, { sliceMs = WALK_SLICE_MS, alive = () => true, stats = null, onSlice = null, what = 'walk' } = {}) {
  const t0 = Date.now();
  let i = 0, slices = 0, maxSliceMs = 0;
  if (items.length) { await new Promise((r) => setImmediate(r)); if (!alive()) return { done: false, rows: 0, slices, maxSliceMs, walkMs: Date.now() - t0 }; }   // nothing of it in the caller's turn (a tick starting several)
  while (i < items.length) {
    const s0 = Date.now();
    do { fn(items[i], i); i++; } while (i < items.length && Date.now() - s0 < sliceMs);
    const ms = Date.now() - s0;
    slices++; if (ms > maxSliceMs) maxSliceMs = ms;
    if (stats) { stats.slices = (stats.slices || 0) + 1; if (ms > (stats.maxSliceMs || 0)) stats.maxSliceMs = ms; }
    if (i < items.length) {
      await new Promise((r) => setImmediate(r));
      if (onSlice) await onSlice(i, what);   // a suite's seam: what happens between two slices (a write placed there, awaited)
      if (!alive()) return { done: false, rows: i, slices, maxSliceMs, walkMs: Date.now() - t0 };
    }
  }
  return { done: true, rows: i, slices, maxSliceMs, walkMs: Date.now() - t0 };
}
/** `_`-prefixed keys are runtime-only — never on disk (both index writers use this replacer). */
const RUNTIME_KEYS = (k, v) => (k.startsWith('_') ? undefined : v);
// THE POLL STAMPS LEAVE THE ROW (design 011 lane 2, 2026-10-03): a pass that brought nothing changed nothing but these
// three instants, and stamping them into the row kept the index dirty on every poll — userW's 87 MB file rewritten whole
// about every 2.3 s. They live in a side file (poll-stamps.json, one line per conversation) flushed at most every
// the journal's compaction (B-360d: past its bound, on a failed journal line, at close), and the index's serializer omits them. They must still PERSIST: a row is due at
// `lastPollAt + cadence`, so losing them makes every conversation due at once after a restart (a long, metered re-poll
// — the vendor's budget paces it, and the store says it). A row that still carries them (an index written before this
// lane, or a write past the door) is read, and loses them where it is next serialized — no migration.
// THE JOURNAL (2026-10-03, the 2.369.203 heavy run's test-channels-e2e ⑰): a stamp a kill -9 took before its 120 s write
// read as "never polled" after the restart, and a restored window's open fetches such a row at once as the owner's —
// ahead of discovery (drain rule 12) — so a vendor refusing that first fetch (Retry-After 20 s) held every NEW
// conversation back for the whole wait. Each set appends ONE line to poll-stamps.log — `[key, lastPollAt, lastScanAt,
// walkStartedAt]`, the key's whole triple (null = none): O(the change), never the index; the side file's write folds it
// (truncated after the rename), a start replays it over the side file in order (the last line per key wins). A kill
// keeps every stamp, as the row did; a line a kill cut short is counted and said.
const STAMP_KEYS = Object.freeze(['lastPollAt', 'lastScanAt', 'walkStartedAt']);
// THE COMPACTION (B-360d, the coordinator's r1319 / r4414 — QUIET IS FREE): the journal is the record of every change; the side
// file is written only when the journal's bytes pass HALF the side file's bytes (at least `min`, at most `max`), when a journal
// line fails, and at close. Was: the whole side file every 120 s while any stamp moved — measured at the release 2.369.419 on a
// stand-in of 200 000 stamped keys: the bytes' build held the loop 170 ms at the median and 287 ms at the worst write (the write
// itself on the writer's thread, 18–23 ms there), every 120 s, growing with the keys. `max` bounds a start's replay. Its bytes are
// made in SLICES of at most STAMPS_SLICE keys, each its own turn. A journal append that FAILS asks the compaction at once: the
// side file is then behind by at most the writer's paced gap (store-pace's 30 s ceiling) and the slices — STAMPS_FAIL_BEHIND_MS.
const STAMPS_BOUND = Object.freeze({ min: 64 * 1024, max: 2 * 1024 * 1024 });
const STAMPS_SLICE = 20000;
const STAMPS_FAIL_BEHIND_MS = 30 * 1000;   // = src/store-pace.js MIN_GAP_CEIL_MS, the writer's longest paced gap (the SHARED store imports no pace module: test-channel-store-pins)
const NO_STAMPS = Object.freeze({});
/** The index's replacer: RUNTIME_KEYS, and a row's `lane` without the poll stamps (the belt — `serializeChunk` heals a
 *  row of them first; this catches one written between two serializations). */
const INDEX_KEYS = (k, v) => {
  if (k.startsWith('_')) return undefined;
  if (k === 'lane' && v && typeof v === 'object' && STAMP_KEYS.some((f) => hasOwn(v, f))) { const o = { ...v }; for (const f of STAMP_KEYS) delete o[f]; return o; }
  return v;
};

/** Atomic JSON write (tmp + rename). `_`-prefixed keys are runtime-only. */
function writeJsonAtomic(file, obj, { mode = null } = {}) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, RUNTIME_KEYS, 1), mode == null ? undefined : { mode });
  // `mode` only applies when the tmp file is CREATED; a leftover tmp from a
  // crashed write keeps its old bits, so the file that lands is chmod-ed too.
  if (mode != null) { try { fs.chmodSync(tmp, mode); } catch { /* a filesystem without modes */ } }
  fs.renameSync(tmp, file);
}

/** Two lists of buffers joined with `,\n` (the chunk separator) — the same byte stream? (a whole rebuild's equal-bytes
 *  check: chunk boundaries may move, the bytes are what is compared; no concatenated copy is made) */
function sameJoined(a, b) {
  const SEP = Buffer.from(',\n');
  const flat = (l) => { const o = []; l.forEach((x, i) => { if (i) o.push(SEP); o.push(x); }); return o; };
  const x = flat(a), y = flat(b);
  let i = 0, j = 0, oi = 0, oj = 0;
  for (;;) {
    while (i < x.length && oi >= x[i].length) { i++; oi = 0; }
    while (j < y.length && oj >= y[j].length) { j++; oj = 0; }
    if (i >= x.length || j >= y.length) return i >= x.length && j >= y.length;
    const n = Math.min(x[i].length - oi, y[j].length - oj);
    if (x[i].compare(y[j], oj, oj + n, oi, oi + n) !== 0) return false;
    oi += n; oj += n;
  }
}

/** One row of `conversations` exactly as `JSON.stringify(ix, RUNTIME_KEYS, 1)` prints it (depth 2), or null when the
 *  whole-file write would omit it. A JSON string never holds a raw newline, so re-indenting on '\n' is exact (a string
 *  pattern, never a /g regex: same bytes, one linear pass). */
function rowLine(key, value) {
  if (key.startsWith('_')) return null;
  const s = JSON.stringify(value, INDEX_KEYS, 1);
  return s === undefined ? null : `  ${JSON.stringify(key)}: ${s.replaceAll('\n', '\n  ')}`;
}
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** B-360d unit 1: a row's FINGERPRINT — a 53-bit print (cyrb53, below) of its printed line (rowLine): what the store last PERSISTED of the row
 *  (the base's layout, or its last journal line), compared at every update's end (law 3: QUIET IS FREE — measured against
 *  the persisted bytes, never a «before» taken at the first touch: a road that changes a row and touches it after would
 *  read as unchanged and the change would never reach the journal). */
// B-360d unit 1: a row's PRINT — 53 bits (cyrb53, public domain): a false «quiet» is a 2⁻⁵³ chance a changed row
function fpOf(line) { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < line.length; i++) { const c = line.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return 4294967296 * (2097151 & h2) + (h1 >>> 0); }

/** An adapter/conversation id may not escape its directory. Channel ids come
 *  from vendors, so this is a boundary, not a formality. */
function safeSeg(s) {
  const v = String(s == null ? '' : s);
  if (!v || v === '.' || v === '..' || /[/\\\u0000]/.test(v)) throw new Error(`channel-store: unsafe id segment ${JSON.stringify(s)}`);
  return v.replace(/[^A-Za-z0-9._@:+-]/g, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}

const dayStamp = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Build the store. `dir` is `<dataDir>/channels`. `now` is injectable so the
 * retention and audit-roll rules are testable without a clock.
 */
/** B-360d unit 1 (law 8): THE ONE READER of the index family — the journal's lines replayed over a parsed index (`ix`, changed
 *  in place): the lines past its `actsSeq` (`held`), in seq order, a row not whole said, a top-level table of another type
 *  kept as the index's. The store's load uses it; so does every reader outside the store (readIndexFamily). → the lines
 *  applied ({seq, text}), the last seq, and the counts the load says. */
function replayIndexJournal(ix, text, held) {
  let seq = held, replayed = 0;
  const lines = [];
  let skippedHeld = 0, unreadable = 0, wrongShape = 0, backwards = 0, last = held, partialRows = 0, wrongTop = 0;
  const kindOf = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);
  const all = (text || '').split('\n');
  for (let i = 0; i < all.length; i++) {
    const line = all[i];
    if (!line) continue;
    let o = null; try { o = JSON.parse(line); } catch { o = null; }
    if (!o) { unreadable++; continue; }   // not JSON: a line cut short
    if (!Number.isInteger(o.seq) || !o.rows || typeof o.rows !== 'object' || Array.isArray(o.rows) || Object.values(o.rows).some((row) => row !== null && (typeof row !== 'object' || Array.isArray(row)))) { wrongShape++; continue; }   // round 3 (smaller 7): JSON, but not an act's line — said as such
    if (o.seq <= held) { skippedHeld++; continue; }   // the index holds it already
    if (o.seq <= last) { backwards++; continue; }      // out of order: never applied over a later act
    // round 4 (true words 5): the load SAYS a row that is not a whole conversation row (no key of its own — applied as
    // written, over the whole one) and a top-level table of another type than the index's own (NOT applied: the index's kept)
    for (const [k, row] of Object.entries(o.rows)) { if (row === null) delete ix.conversations[k]; else if (row && typeof row === 'object') { if (row.key !== k) partialRows++; ix.conversations[k] = row; } }
    if (o.top && typeof o.top === 'object') for (const [k, v] of Object.entries(o.top)) if (k !== 'conversations' && !k.startsWith('_')) { if (ix[k] !== undefined && kindOf(ix[k]) !== kindOf(v)) { wrongTop++; continue; } ix[k] = v; }
    lines.push({ seq: o.seq, text: line + '\n' }); last = seq = Math.max(seq, o.seq); replayed++;
  }
  return { lines, seq, replayed, skippedHeld, unreadable, wrongShape, backwards, partialRows, wrongTop };
}
/** B-360d unit 1 (law 8): the index family READ WHOLE by a reader outside the store (a migration, a census): index.json
 *  parsed, then its journal replayed — never index.json alone (it lags its journal by up to the bound). → the index object
 *  (null when neither index.json nor its journal is there). */
function readIndexFamily(dir) {
  let text = null;
  const named = (e, file) => { try { e.file = file; } catch { } return e; };   // the refusal names the file that failed (r1542 (6))
  try { text = fs.readFileSync(path.join(dir, 'index.json'), 'utf8'); } catch (e) { if (!(e && e.code === 'ENOENT')) throw named(e, 'index.json'); }
  let acts = null;
  try { acts = fs.readFileSync(path.join(dir, 'index-acts.ndjson'), 'utf8'); } catch (e) { if (!(e && e.code === 'ENOENT')) throw named(e, 'index-acts.ndjson'); }
  if (text === null && acts === null) return null;   // no index family at all
  let ix;
  try { ix = text === null ? { v: 1, conversations: {} } : JSON.parse(text); } catch (e) { throw named(e, 'index.json'); }   // a store whose index was never written whole: its journal alone
  if (!ix || typeof ix !== 'object' || !ix.conversations || typeof ix.conversations !== 'object') return ix;
  replayIndexJournal(ix, acts || '', Number(ix.actsSeq) > 0 ? Number(ix.actsSeq) : 0);
  return ix;
}

/** B-92fc follow (主开发 r3021 (1)): THE STORE's OWN FOLDERS under data/channels — ONE list, and every one of them is made from it
 *  (never an account's id: a purge mark naming one is a bad id, L6). The staged outbox files' folder is its module's own name, pinned equal. */
const OWN_FOLDERS = Object.freeze({ msgs: 'msgs', archive: 'archive', attachments: 'attachments', outboxFiles: 'outbox-files' });   // outboxFiles = src/channel-outbox-files.js DIR (a SHARED store imports no such module: test-channel-store-forget ⑫ pins them equal)
function createChannelStore({ dir, now = () => Date.now(), log = console, onWrite = null, writer = null, actsMaxBytes = 8 * 1024 * 1024, stampsBound = STAMPS_BOUND, stampsSlice = STAMPS_SLICE, stampsDebounceMs = undefined, walk = null, heldRetry = null } = {}) {
  // lane hub-loop-stalls commit 2: the index reaches the disk through THE STORE WRITER (its own thread; a pace stated for
  // the index's size) — a 21.7 MB index's rename held the owner's main loop 1.3 s median, 58 times in six hours
  const W = () => writer || require('./store-writer.js').storeWriter();
  /** lane channel-threads: ONE hook every log writer calls AFTER its bytes are durable — `(adapterId, convId,
   *  {kind:'append'|'prepend'|'trim'|'side', fresh?, msgs?})` — so the engine's derived caches (the thread index,
   *  the message → conversation map) follow every writer, never a list of call sites. A throwing hook is logged. */
  const wrote = (adapterId, convId, what) => { if (typeof onWrite !== 'function') return; try { onWrite(adapterId, convId, what); } catch (e) { try { (log.warn || console.warn)('[channels] store write hook threw:', (e && e.message) || e); } catch { } } };
  if (!dir) throw new Error('channel-store: dir is required');
  const warn = (...a) => { try { (log.warn || log.log || console.warn).apply(log, a); } catch { } };
  const msgsDir = path.join(dir, OWN_FOLDERS.msgs);
  const archiveDir = path.join(dir, OWN_FOLDERS.archive);
  const indexFile = path.join(dir, 'index.json');
  const adaptersFile = path.join(dir, 'adapters.json');
  const auditFile = path.join(dir, 'audit.ndjson');

  const madeFirst = fs.mkdirSync(msgsDir, { recursive: true, mode: 0o700 });   // B-f276 1b: the first folder it made (undefined: every one was there)
  fs.mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
  // THE STORE IS THE OWNING ACCOUNT'S ALONE (the owner, 2026-11-17): channel content — heads, bodies, attachments — stays
  // PLAIN at rest, as transcripts and the search index are; only an account's sign-in token and app secret are sealed (the
  // vault's channels key). So the store's folder is CLOSED to other OS accounts: the ROOT alone loses its group / other bits,
  // which closes everything under it — never a walk (an instance holds some 200 000 conversation files; a walk at the store's
  // start would hold the main loop). It only TAKES bits away (mode & 0o700): an owner's own bits are never granted, so a
  // read-only root stays read-only and the BLOCKED rung still holds. Asynchronous, never awaited by the open; already closed
  // = no chmod; a filesystem without modes (or one that refuses) is one line, never an error.
  const rootClosed = fs.promises.stat(dir)
    .then((s) => ((s.mode & 0o077) ? fs.promises.chmod(dir, s.mode & 0o700).then(() => true) : true))
    .catch((e) => { warn(`[channels] the store's folder was not closed to other accounts (${(e && e.code) || (e && e.message) || e}) — its files keep the modes they have`); return false; });

  // ── FAIL CLOSED ON AN UNREADABLE STORE FILE (r2, 2026-09-23 verifier: a truncated groups.json read as EMPTY with no log
  // line, and the first group verb overwrote it). A MISSING file is an empty store. THE STORE-READ LAW (B-f276, lane
  // bl-windows, through src/store-read.js storeAnswer): a READ that FAILED (EIO, EACCES, ETIMEDOUT, …) is NO ANSWER — the
  // family is HELD: nothing is set aside, nothing is written over, its door refuses every write by name (`blocked`), and
  // it is READ AGAIN off the loop (SR.retryDelay). A family whose caller hands an `adopt` (the six small ones) takes the
  // bytes in place when they read and its hold LIFTS by itself; the index and the poll stamps (the acts journal's replay,
  // the engine's live readers) are never swapped under a running hub: the read again SAYS the file reads now and it is
  // loaded at the next start. Only bytes that were READ and do not parse (or have the wrong shape) are corrupt: renamed
  // beside themselves as `<name>.corrupt-<ts>` — never unlinked — with ONE named log line, and the family starts empty (SUPERSEDED by
  // B-f276 1b: a file that cannot be read, torn bytes included, is HELD by its store hold — never renamed at a start; the one rename is
  // the damaged door's, a person's, under `<name>.damaged-<ts>`)
  // only once the bytes are safe; if even the rename fails the family is BLOCKED (its door refuses every write rather
  // than overwrite the only copy). `quarantined` names each (the channels engine files ONE "For you" item per entry).
  const quarantined = [];
  const holds = new Map();  // file → { fam } — the families held now (each its own store hold, read again by its ladder)
  const GROUP_FILES = new Set(['groups.json', 'wake-pace.json', 'dispatch-ledger.json']);   // the agent groups' families (their pause is the groups engine's, 1c)
  const famByFile = new Map();   // file → its family (filled at each family's read — before any write can run)
  let heldStopped = false;  // close() ran (its own flag: the index loads before `closed` is declared)
  const heldHooks = [];     // fn({ file, state: 'loaded' | 'reads-again' | 'emptied' | 'appeared', q }) — the engine's words and start passes
  const heldSay = (ev) => { for (const fn of heldHooks) { try { fn(ev); } catch (e) { warn(`[channels] a held-file hook threw: ${(e && e.message) || e}`); } } };
  // a held ledger read again: per key, the file's entries and this life's — arrays joined (a stamp in the file's window kept), else memory wins
  const unionBy = (file, mem) => { const out = { ...(file || {}) }; for (const [k, v] of Object.entries(mem || {})) out[k] = Array.isArray(v) && Array.isArray(out[k]) ? [...new Set([...out[k], ...v])].sort((x, y) => (x > y ? 1 : x < y ? -1 : 0)) : v; return out; };
  // B-f276 1b (主开发 r809): a BIG family (the index ~22 MB, the poll stamps) is never PARSED on the loop at a read again — the read
  // answered and its ends look like an object ⇒ «reads again», loaded at the next start (its whole parse runs there, as at any start)
  const cheapParse = (t) => { const x = String(t); if (/^\s*\{/.test(x.slice(0, 64)) && /\}\s*$/.test(x.slice(-64))) return {}; throw new SyntaxError('its ends are not one JSON object'); };
  const heldWords = (name, h, big) => (h.kind === 'damaged'
    ? `${name} could not be read as itself (damaged: its bytes are not the store) — it is held: nothing was set aside or written over, and every change to it is refused until a person starts it empty (For you) or puts a good copy back${big ? ' and restarts VibeSpace' : ''}`
    : `${name} could not be read (${h.kind}${h.code ? `, ${h.code}` : ''}) — it is held: nothing was set aside or written over, and every change to it is refused until it reads again${big ? ' (it is then loaded at the next start)' : ''}`);
  /** ONE FAMILY'S READ AT THE START, through its store hold (src/store-hold.js). `adopt` (the six small families) takes a read-again value
   *  in place; none (the index, the stamps) = loaded at the next start. → { value, blocked, held, missing, H, q, big, name, file } */
  function loadJsonFamily(file, valid, empty, adopt = null) {
    const name = path.basename(file), big = !adopt;
    let startRead = false;
    const fam = { value: undefined, blocked: null, held: false, missing: false, file, name, big, empty, adopt, valid, q: null, H: null, appearing: null };
    famByFile.set(file, fam);
    fam.H = SH.create({
      file, now, log: { warn: (m) => warn(m) },
      parse: (t) => (big && startRead ? cheapParse(t) : JSON.parse(t)),
      valid: (v) => (big && startRead ? true : valid(v)),
      ...(heldRetry ? { silentMs: [], ladder: { firstMs: Number(heldRetry.firstMs) || 30000, maxMs: Number(heldRetry.maxMs) || 300000 } } : {}),
      onLift: (v) => liftFamily(fam, v),
    });
    let st;
    try { st = fam.H.readAtStart(); } finally { startRead = true; }
    fam.H.takeText();   // 主开发 r2542: the start read's TEXT is not kept — the hold keeps it «until the caller takes it», and the store reads the value alone (index.json's whole text stayed for the store's life: twice the file's bytes a row of heap, measured)
    if (st === 'data') { fam.value = fam.H.answer(); return fam; }
    fam.readMissing = st === 'missing';   // B-f276 1c (r1143 (1)): own-only for the life until a read of this life saw the file
    if (st === 'missing') { fam.value = empty(); fam.missing = true; return fam; }
    const h = fam.H.held();
    fam.value = empty(); fam.held = true; fam.blocked = heldWords(name, h, big);
    fam.q = { file: name, to: null, why: `${h.kind}${h.code ? ` (${h.code})` : ''}`, kind: h.kind, at: now(), held: true, lifts: h.kind === 'damaged' ? 'a-person' : big ? 'next-start' : 'by-itself', groups: GROUP_FILES.has(name), readsAt: null, loadedAt: null };
    quarantined.push(fam.q);
    holds.set(file, { fam });
    // B-f276 1b (its read r1 M1): a DAMAGED big family lifts only by a person — the cheap parse after the start cannot tell its own torn
    // bytes from a good copy (ends that look like one object lifted it a second later, and the door answered «none» for ever)
    if (big && h.kind === 'damaged') fam.H.stop();
    warn(`[channels] ${fam.blocked}`);
    return fam;
  }
  /** the store hold's lift: the family reads again (a small one is taken in place; a big one is SAID, loaded at the next start) */
  function liftFamily(fam, v) {
    fam.H.takeText();   // r2542: a read again's text is not kept either (the hold set it before this lift)
    if (heldStopped || !holds.has(fam.file)) return;
    if (fam.big) {
      fam.q.readsAt = now(); fam.q.readsAs = 'data';
      warn(`[channels] ${fam.name} reads again — it is loaded at the next start of VibeSpace (never swapped under the running engine); until then it stays held`);
      heldSay({ file: fam.name, state: 'reads-again', q: fam.q });
      return;
    }
    holds.delete(fam.file);
    fam.value = v; fam.blocked = null; fam.held = false;   // the door opens FIRST: the adopt may write (pace / dispatch)
    try { fam.adopt(v); } catch (e) { warn(`[channels] ${fam.name}: its read-again value was not taken in: ${(e && e.message) || e}`); }
    fam.q.readsAt = fam.q.loadedAt = now();
    warn(`[channels] ${fam.name} reads again — loaded; its hold is lifted, changes to it are written again`);
    heldSay({ file: fam.name, state: 'loaded', q: fam.q });
  }
  /** THE MISSING LAW (主开发 r809) — ONE DOOR, THE WRITER'S: a family that read MISSING hands its whole writes as EXCLUSIVE creates until
   *  one lands (on the writer's thread: a link that refuses an existing file — src/store-writer-worker.js). A file that APPEARED since
   *  (a mount that came late) is never written over: the writer drops the change and says so; the family reads the file and KEEPS it
   *  (tookAppeared); a durable change's promise rejects by name (landed: store-appeared). → the writer's options for `file` */
  function firstWrite(file, onWritten) {
    const fam = famByFile.get(file);
    if (!fam) return onWritten ? { onWritten } : {};
    return { exclusive: !!fam.missing, ownOnly: !!fam.readMissing, onWritten: (ok, err) => {   // ownOnly: B-f276 1c (主开发 r1143 (1)) — never a rename over a file it has not read
      if (ok && fam.missing && !fam.appearing) fam.missing = false;
      else if (!ok && err && err.code === 'EEXIST' && (fam.missing || fam.readMissing)) tookAppeared(fam);
      if (onWritten) onWritten(ok, err);
    } };
  }
  /** a file that appeared since the start: read and KEPT (a small family takes it in place — its writes go again; a big one is held,
   *  «loaded at the next start», its writes refused — AT ONCE, no read of a file it will not load: its read r1 S5). ONE read a family (a
   *  second EEXIST while it runs waits for the same read). The folder changed under the store: a first start's empty copies list is
   *  listed again (its read r1 S4) */
  /** B-f276 1c (主开发 r1143 (2)): a family's COMPANION (the index's acts journal, the stamps' journal) that could not be read — any
   *  failure but «not there» — HOLDS its family, as its own file's failed read does (a big family: loaded at the next start) */
  function holdCompanion(fam, name, e) {
    if (fam.held) return;
    const code = (e && e.code) || 'EIO';
    fam.held = true; fam.blocked = `${name} (beside ${fam.name}) could not be read (${code}) — ${fam.name} is held: nothing was set aside or written over, and every change to it is refused until it reads at the next start`;
    fam.q = { file: fam.name, to: null, why: `unreadable (${name}: ${code})`, kind: 'unreadable', at: now(), held: true, lifts: 'next-start', readsAt: null, loadedAt: null };
    quarantined.push(fam.q);
    holds.set(fam.file, { fam });
    warn(`[channels] ${fam.blocked}`);
  }
  function holdAppeared(fam, came = null) {   // `came`: its round wp3niroz5 (2) — the COMPANION that came (the journal, the stamps log), named in every word
    fam.held = true; fam.blocked = came
      ? `${came} (beside ${fam.name}) appeared since the start (it is not the file this store made — or its storage does not keep file numbers stable) — ${fam.name} is kept as it is and loaded at the next start; every change to it is refused until then`
      : `${fam.name} appeared since the start (it was not there when it was read — or its storage does not keep file numbers stable) — it is kept as it is and loaded at the next start; every change to it is refused until then`;
    fam.q = { file: fam.name, ...(came ? { came } : {}), to: null, why: came ? `appeared since the start (${came})` : 'appeared since the start', kind: 'appeared', at: now(), held: true, lifts: 'next-start', readsAt: null, loadedAt: null };
    quarantined.push(fam.q);
  }
  function tookAppeared(fam, came = null) {
    if (fam.appearing) return fam.appearing;
    relistAside();
    if (fam.big) {
      holdAppeared(fam, came);
      fam.appearedAt = now();
      warn(`[channels] ${came ? `${came} (beside ${fam.name})` : fam.name} appeared since the start — kept as it is, ${fam.name} loaded at the next start; the change that found it was not made`);
      heldSay({ file: fam.name, state: 'appeared', q: fam.q });
      fam.appearing = Promise.resolve();
      return fam.appearing;
    }
    // B-f276 1c (round wwlskwphv): HELD for the length of its read — a change in that moment is refused by name, never taken in memory
    // and then dropped under the value that came
    const was = { blocked: fam.blocked, held: fam.held };
    fam.held = true; fam.blocked = `${fam.name} appeared since the start — it is being read now; this change was not made`;
    fam.appearing = (async () => {
      let read;
      try { read = { text: await fs.promises.readFile(fam.file, 'utf-8') }; } catch (error) { read = { error }; }
      const a = SR.storeAnswer(read, { valid: fam.valid });
      fam.held = was.held; fam.blocked = was.blocked;   // the read answered: taken in, or held below
      if (a && a.state === 'data') {
        fam.value = a.value;
        fam.missing = false; fam.readMissing = false;   // its own now (read in this life) — BEFORE the adopt (its read r1 S6: the pace's union is the adopt's own write; the writer hears `exclusive: false`)
        try { fam.adopt(a.value); } catch (e) { warn(`[channels] ${fam.name}: the file that appeared was not taken in: ${(e && e.message) || e}`); }
      } else holdAppeared(fam);
      fam.appearedAt = now();
      warn(`[channels] ${fam.name} appeared since the start — read and kept; the change that found it was not made`);
      heldSay({ file: fam.name, state: 'appeared', q: fam.q });
    })();
    return fam.appearing;
  }
  const appearedError = (fam) => Object.assign(new Error(`${fam.q && fam.q.came ? `${fam.q.came} (beside ${fam.name})` : fam.name} appeared since the start (or its storage does not keep file numbers stable) — ${fam.big ? 'it is kept as it is and loaded at the next start' : 'it is read and kept'}; this change was not made`), { code: 'store-appeared', status: 409 });
  /** THE DAMAGED DOOR (主开发 r809: torn bytes follow the store hold — held, ONE door): a person's choice to start a damaged family EMPTY:
   *  its bytes are set aside under a dated name (never deleted), the family starts empty IN PLACE (nothing of it was loaded — empty for
   *  empty, the index too), and its first write is the exclusive create. → { ok, state: 'pass' | 'none', aside? } */
  // THE FAMILY'S OTHER FILES (its read r1 M2 / S1): a family is more than its one file — the index's acts journal, the stamps' journal,
  // the outbox's attachment folders. The door sets them aside WITH it, under the same dated name (nothing deleted): a journal left
  // behind takes this life's acts (dropped as «backwards» at the next start, or its lines deleted by a compaction), and the files sweep
  // discards every folder of the proposals in the copy
  const COMPANIONS = Object.freeze({ 'index.json': ['index-acts.ndjson'], 'poll-stamps.json': ['poll-stamps.log'], 'outbox.json': [OWN_FOLDERS.outboxFiles] });
  const emptying = new Map();   // file → the press in flight (ONE at a time: a second press waits for the first's answer)
  async function startDamagedEmpty(fileName) {
    const fam = [...holds.values()].map((x) => x.fam).find((f) => f.name === String(fileName || ''));
    const h = fam ? fam.H.held() : null;
    if (!fam || !h || h.kind !== 'damaged') return { ok: true, state: 'none' };
    if (emptying.has(fam.file)) return emptying.get(fam.file);
    const run = (async () => {
      fam.H.stop();   // nothing lifts under the press: the person chose to start it empty
      const when = now(), suffix = `.damaged-${new Date(when).toISOString().replace(/[:.]/g, '-')}`;   // the hold's own dated name (src/store-hold.js setAside)
      const moved = [];   // the other files set aside so far — renamed BACK if the press cannot finish (its read r2 S1: never a split family)
      const back = async () => { for (const c of moved.reverse()) { try { await fs.promises.rename(path.join(dir, c + suffix), path.join(dir, c)); } catch (e) { warn(`[channels] ${fam.name}: its ${c} could not be put back from ${c + suffix} (${(e && e.code) || (e && e.message) || e}) — move it back by hand`); } } };
      for (const c of COMPANIONS[fam.name] || []) {
        try { await fs.promises.rename(path.join(dir, c), path.join(dir, c + suffix)); moved.push(c); }
        catch (e) {
          if (e && e.code === 'ENOENT') continue;
          warn(`[channels] ${fam.name}: its ${c} could not be set aside (${(e && e.code) || (e && e.message) || e}) — nothing was started empty; it stays held`);
          await back();
          return { ok: false, state: 'failed', code: (e && e.code) || 'EIO' };
        }
      }
      let aside;
      try { aside = await fam.H.setAsideAsync(when); }   // B-f276 1c (r1143 (3)): off the loop, the same dated name
      catch (e) {
        warn(`[channels] ${fam.name} could not be set aside (${(e && e.code) || (e && e.message) || e}) — nothing was started empty; it stays held, its other files put back`);
        await back();
        return { ok: false, state: 'failed', code: (e && e.code) || 'EIO' };
      }
      if (fam.name === 'adapters.json' && !asideNames.includes(path.basename(aside))) asideNames.push(path.basename(aside));   // B-f276 1b: the accounts' copy COUNTS in the key check (it may hold sealed sign-ins — never a value made over them)
      holds.delete(fam.file);
      fam.value = fam.empty(); fam.blocked = null; fam.held = false; fam.missing = true; fam.readMissing = true; fam.appearing = null;   // its first write: the exclusive create
      fam.readMissing = true; if (fam === psLoad) journalWas = false;   // B-f276 1c: its first write (and the stamps' first journal open) is an exclusive create again
      if (fam === ixLoad) actsAtStart = false;   // B-f276 1c follow (judged): the index's journal moved aside with it — its next one is own-only too
      if (fam.adopt) { try { fam.adopt(fam.value); } catch (e) { warn(`[channels] ${fam.name}: its empty store was not taken in: ${(e && e.message) || e}`); } }
      if (fam.q) { fam.q.to = path.basename(aside); fam.q.loadedAt = now(); fam.q.done = true; }
      warn(`[channels] ${fam.name} was damaged — a person started it empty; its bytes were set aside as ${path.basename(aside)}${(COMPANIONS[fam.name] || []).length ? ` (its ${COMPANIONS[fam.name].join(', ')} beside it, under the same name)` : ''} — nothing deleted`);
      heldSay({ file: fam.name, state: 'emptied', q: fam.q });
      return { ok: true, state: 'pass', aside: path.basename(aside) };
    })().finally(() => { emptying.delete(fam.file); });
    emptying.set(fam.file, run);
    return run;
  }

  // THE ACCOUNTS' SET-ASIDE COPIES (主开发 r459, B-f276 unit 1): torn bytes of adapters.json set aside may hold sealed
  // sign-ins the store's value opens — the key-file law's check counts them (never a value made over them). Listed ONCE
  // at the start, off the loop, only beside the file (never a walk); `null` until listed = unknown (the check: holds).
  const asideNames = [];
  // B-f276 1b: a store whose MESSAGE folder this start made has never run in this folder — and a copy is made only by a store that ran
  // there (its own start's set-aside in a release before 1b, or the damaged door): its list is KNOWN EMPTY at once, by the start's own
  // mkdir answer (no read) — a first start's sign-in is never refused as «unknown»; any other start lists them off the loop (r459)
  const firstStart = !!madeFirst;
  let asideListed = firstStart;
  let asideTries = 0;
  const listAside = () => fs.promises.readdir(dir).then((names) => { for (const n of names) if ((n.startsWith('adapters.json.corrupt-') || n.startsWith('adapters.json.damaged-')) && !asideNames.includes(n)) asideNames.push(n); asideListed = true; })   // B-f276 1b: + the damaged door's copies
    .catch((e) => {
      if (e && e.code === 'ENOENT') { asideListed = true; return; }
      if (!asideTries) warn(`[channels] the accounts' set-aside copies were not listed (${(e && e.code) || (e && e.message) || e}) — no store value is made until they are; listed again`);
      if (heldStopped) return;
      const t = setTimeout(listAside, SR.retryDelay(++asideTries, heldRetry || undefined)); if (t.unref) t.unref();
    });
  if (!firstStart) listAside();
  let relisted = false;
  function relistAside() { if (!firstStart || relisted || heldStopped) return; relisted = true; asideListed = false; listAside(); }   // B-f276 1b (its read r1 S4): unknown again until listed — it holds

  /** A BLOCKED family's refusal (r3): a typed Error the routes answer as
   *  `503 {error, code:'store-blocked'}` — the panel words the code, the
   *  message names the file. */
  const blockedError = (msg) => { const e = new Error(msg); e.code = 'store-blocked'; e.status = 503; return e; };

  const ixLoad = timedSync('channels-index.read', () => loadJsonFamily(indexFile, (v) => v && typeof v === 'object' && v.conversations && typeof v.conversations === 'object', EMPTY_INDEX));
  let ix = ixLoad.value;

  let dirty = false;
  // lane lg-group-parents (B-526c r937, MUST 1): the conversation rows BORN since the index file last LANDED — rows the disk's
  // index does not list yet. A person's or an agent's grain write on such a conversation keeps the index's durable write before
  // its answer (the act's journal line carries the row whole), so a stop inside the pace never leaves an act whose row the
  // boot's completion cannot find. `landed(key)` asks; a landing clears what it carried (the set at the write's produce)
  // B-360d FOUND HOLDER 1 (lane bl-loop-b, 主开发 r4598 / r4690): each birth carries a GENERATION in place of the set a produce copied
  // (a pass over every row born since the last landing, in the produce's turn) and the landing walked (a second pass). The produce
  // notes the generation it carries (`carriedGen`, one number); a landing that SUCCEEDS moves the landed mark to it (`landedGen`, one
  // number); a failed one moves nothing, so nothing is merged back. A row born after the produce has a later generation, so the next
  // produce carries it; a row purged and born again after the produce is a new birth (r1040, r1850 (1): it stays unlanded); a row gone
  // meanwhile is judged by the map's own key, as landed() did. The entries a landing covered are dropped by a sliced sweep (counted)
  const unlanded = new Map();   // key → its birth's generation (the rows born since the index file last LANDED)
  let bornGen = 0, carriedGen = null, landedGen = 0;
  const isUnlanded = (k) => { const g = unlanded.get(k); return g !== undefined && g > landedGen; };
  const landedStats = { sweeps: 0, dropped: 0 };
  let sweepIt = null;   // the sweep's live iterator over `unlanded` (a Map's own: entries deleted or added meanwhile are safe)
  const UNLANDED_SWEEP_STEP = 2000;
  let sweepAgain = false;   // a landing came while the sweep ran
  function sweepLanded() {
    if (closed) return;
    if (sweepIt) { sweepAgain = true; return; }   // r4885: a landing while the sweep runs — it starts again at its end (the slice already past held entries this landing covered)
    sweepIt = unlanded.entries(); landedStats.sweeps++;
    const step = () => {
      if (closed) { sweepIt = null; return; }
      for (let n = 0; n < UNLANDED_SWEEP_STEP; n++) {
        const r = sweepIt.next();
        if (r.done) { sweepIt = null; if (sweepAgain) { sweepAgain = false; sweepLanded(); } return; }
        const [k, g] = r.value;
        if (g <= landedGen) { unlanded.delete(k); bornSeq.delete(k); landedStats.dropped++; }
      }
      setImmediate(step);
    };
    setImmediate(step);
  }
  // B-360d unit 1 × B-526c (主开发 r1765): a born row rides its journal line — `bornSeq` = the seq of the FIRST line that carried
  // this birth; the row lands when an append or a compaction holding that line lands (actsWritten), or a whole write that carried
  // it lands (indexWritten). A row born again (purged inside the pace) needs its NEW line: a birth resets it
  const bornSeq = new Map();

  // ── A PERSON'S ACTS LIVE IN A SMALL FILE OF THEIR OWN (lane hub-loop-stalls commit 2, the coordinator's freeze item 2) ──
  // The index (22 MB at the owner's scale) is written at the pace stated for its size (~11 s apart); a person's act, a
  // decision or a billing record must not wait that long, nor cost 22 MB a click. A durable update journals ONLY what it
  // touched — its rows (as the index would print them) and the top-level tables when they changed — as one line of
  // index-acts.ndjson, `{seq, rows: {key: row | null}, top?}`, written NOW through the store writer (a small whole-file
  // write: temp + rename, off the loop); its promise resolves when that line is on disk. The index records the last act
  // it holds (`actsSeq`); the load replays the lines past it, in order; a written index drops its acts from the journal.
  // An act that reached the WHOLE map (an account's policy, a removal) writes the index itself, durable.
  const actsFile = path.join(dir, 'index-acts.ndjson');
  let actsAtStart = false;   // B-f276 1c: the journal was there at the start (an index read missing writes it own-only only when it was not)
  const actsOwn = () => ({ ownOnly: !!ixLoad.readMissing && !actsAtStart, onWritten: actsWritten });   // B-f276 1c (r1143 (1)): the journal under the index's law
  // THE JOURNAL IS APPEND-ONLY (round 2, law C iii): an act appends ITS line (fsynced, through the writer's thread) — the
  // bytes an act writes never grow with the acts before it; several acts in flight ride one append. A written index that
  // holds them makes the journal owe a COMPACTION (one small whole-file rewrite keeping only the lines past it). The
  // journal has a stated bound (ACTS_MAX_BYTES): reaching it is said and makes the index's own write urgent (it folds the
  // journal); while the index cannot be written the journal keeps growing by each act's own bytes — linear, said.
  const ACTS_MAX_BYTES = actsMaxBytes;   // 8 MB (a suite states a smaller one)
  // B-360d unit 1 (the ruling wi1q6956v, 主开发 r1312): EVERY change rides this journal; index.json is owed only by the
  // journal's bound, a change that reached the whole map, a BURST (law 4: one update whose changed rows pass the same bound —
  // past BURST_ROWS touched rows it is not even compared: a whole write, as `whole` is) or a stop
  // law 4's bounds: the changed rows' lines past the journal's bound (8 MB), or more TOUCHED rows than BURST_ROWS — never
  // compared (the update's end compares each touched row's line in its own turn; measured on the test machine at ~800-byte
  // rows: 1 536 rows 31 ms quiet / 43 ms changed, 4 096 rows 89 / 149 ms, 16 384 rows 317 ms — over the loop's 250 ms law;
  // past the bound the road is the whole write, as the release made for every update)
  // r1542 (7): THE ROW BOUND COUNTS ROWS, NOT BYTES — a row of several KB (big watcher maps) weighs more than the ~800 bytes
  // measured, so the compare of 4 096 such rows can take longer than the 149 ms above; and a change that touches more rows than
  // the bound is a whole write — a sign-in change on an account past 4 096 rows whose caps all change (rejudgeConvCaps) is one:
  // lawful (the release made every update one). The loop's 250 ms law is per MACROTASK: updates chained without I/O between
  // them run their ends in one turn, and their compares add up.
  const BURST_BYTES = ACTS_MAX_BYTES, BURST_ROWS = Math.max(64, Math.min(4096, Math.floor(ACTS_MAX_BYTES / 512)));
  const rowFp = new Map();   // key → fingerprint of its persisted line (set by serializeChunk and by a journaled line)
  let fpReady = false;       // every row's fingerprint known (the layout landed once): before, a touched row counts as changed
  let actSeq = Number(ix.actsSeq) > 0 ? Number(ix.actsSeq) : 0, actLines = [], pendingActsSeq = 0, actsReplayed = 0;
  let appendedSeq = 0, journalBytes = 0, compactOwed = false, actsOverSaid = 0;
  // B-360d unit 1 (law 10): WHAT IS OWED IN MEMORY IS A STATED NUMBER — the lines not on disk yet (`owedBytes`, kept as they
  // come and land); past ACTS_MAX_BYTES with the storage not answering it is said ONCE an episode (linear in the changed rows)
  let owedBytes = 0, owedEpisode = false;
  const lb = (x) => (x.bytes === undefined ? (x.bytes = Buffer.byteLength(x.text)) : x.bytes);   // a line's bytes, counted once
  const owedOf = () => { let b = 0; for (const x of actLines) if (x.seq > appendedSeq) b += lb(x); return b; };
  if (!ixLoad.blocked && ix.conversations && typeof ix.conversations === 'object') {
    let text = null;
    // B-f276 1c (主开发 r1143 (2)): the index's COMPANION is read under the index's own hold — any failure but «not there» HOLDS the index
    try { text = timedSync('channels-acts.read', () => fs.readFileSync(actsFile, 'utf8')); actsAtStart = true; } catch (e) { text = null; if (e && e.code !== 'ENOENT') holdCompanion(ixLoad, 'index-acts.ndjson', e); }
    const held = actSeq;
    const rj = replayIndexJournal(ix, text, held);   // B-360d unit 1 (law 8): the ONE reader
    const { skippedHeld, unreadable, wrongShape, backwards, partialRows, wrongTop } = rj;
    for (const l of rj.lines) actLines.push(l);
    actSeq = rj.seq; actsReplayed = rj.replayed;
    appendedSeq = actSeq; journalBytes = text ? Buffer.byteLength(text) : 0;
    // ROUND 4 (MUST 1): THE TAIL IS UNKNOWN UNTIL IT ENDS IN A NEWLINE — ALSO AT THE LOAD. A failed append cut exactly at its
    // newline (with the truncate-back failing too, or a kill between them) leaves a whole JSON line with no '\n': whatever
    // it parses as, its state is unknown, and an act appended straight onto it would GLUE to it (both gone at the next
    // load). So the next journal write re-establishes a whole tail first — the compaction — before any act is appended.
    const openTail = !!text && text.length > 0 && text[text.length - 1] !== '\n';
    // 主开发 r2455 (5): this is also what makes a purge's owed compaction survive a restart — the purged rows' older lines are
    // lines the index holds (seq ≤ actsSeq): skipped here, never read back, and the journal's NEXT write is the compaction that drops them
    if (skippedHeld || unreadable || wrongShape || backwards || openTail || wrongTop) compactOwed = true;   // the next journal write is a compaction (what is not applied is never kept)
    // B-360d unit 1: replayed acts owe NO whole write — the journal holds them (the bound or a stop folds them)
    if (actsReplayed || unreadable || wrongShape || backwards || openTail || partialRows || wrongTop) warn(`[channels] index-acts.ndjson: ${actsReplayed} act${actsReplayed === 1 ? '' : 's'} the index did not hold yet replayed${openTail ? '; its last line had no newline (a write that may not have finished) — the journal is written whole before the next act' : ''}${partialRows ? `; ${partialRows} row${partialRows === 1 ? '' : 's'} not a whole conversation row (no key of its own) applied as written` : ''}${wrongTop ? `; ${wrongTop} top-level table${wrongTop === 1 ? '' : 's'} of another type than the index's own not applied (the index's kept)` : ''}${unreadable ? `; ${unreadable} line${unreadable === 1 ? '' : 's'} not readable dropped (a line cut short — a write that did not finish)` : ''}${wrongShape ? `; ${wrongShape} line${wrongShape === 1 ? '' : 's'} of JSON that is not an act's (no seq, no rows of rows) dropped` : ''}${backwards ? `; ${backwards} out of order dropped` : ''}${skippedHeld ? `; ${skippedHeld} the index already holds skipped` : ''}`);
  }
  let interval = null;
  let closed = false;
  const dedup = new Map(); // `${adapterId}/${convId}` -> Set<vendorId>

  // ── THE POLL STAMPS' SIDE FILE (design 011 lane 2): `{v, fields, stamps: {key: [lastPollAt, lastScanAt,
  // walkStartedAt]}}`, memory authoritative, written as the journal's COMPACTION (B-360d) and at close; a key whose row left
  // the index leaves with the next write; an unreadable file is set aside like every family here ──
  const stampsFile = path.join(dir, 'poll-stamps.json');
  const stampsLog = path.join(dir, 'poll-stamps.log');   // THE JOURNAL (above): every set since the side file's last write
  // verify r1 (A10): a file this build cannot read as ITS shape (another `v`, the columns renamed or gone) is set aside
  // and said like every family here — never read as "no stamps", a silent re-poll of every conversation
  const psLoad = loadJsonFamily(stampsFile, (v) => v && typeof v === 'object' && v.v === 1 && Array.isArray(v.fields) && v.fields.includes('lastPollAt') && v.stamps && typeof v.stamps === 'object' && !Array.isArray(v.stamps), () => null);
  const stampMap = new Map();   // key -> { lastPollAt?, lastScanAt?, walkStartedAt? } (an instant > 0, or absent)
  let unreadStamps = 0;        // entries of a readable file that are not a row of instants — said by count below
  if (psLoad.value) {
    const at = psLoad.value.fields.map((f) => STAMP_KEYS.indexOf(f));
    for (const [k, arr] of Object.entries(psLoad.value.stamps)) {
      if (!Array.isArray(arr)) { unreadStamps++; continue; }
      const st = {};
      at.forEach((x, i) => { if (x >= 0 && Number(arr[i]) > 0) st[STAMP_KEYS[x]] = Number(arr[i]); });
      if (Object.keys(st).length) stampMap.set(k, st);
    }
  }
  let stampsDirty = false;
  // channel-store-off-loop (commit 1): the side file is the WRITER's (paced); `stampSeq` counts the sets, so its write folds
  // the journal only when no stamp was set since its bytes were made. A row's OWN stamps taken into the map (a heal) are
  // JOURNALED at once — the kill keeps them whichever of the index and the side file lands first (was: the side file
  // written synchronously before the index, inside the index's produce)
  let stampSeq = 0, stampsMadeSeq = -1, healing = null;
  const stampsSince = new Set();   // cure r1 (C2): the keys set after the side file's bytes were made — what a fold keeps
  // B-360d THE COMPACTION's state: owed once until it lands; `Now` = a failed journal line asks it at once; the journal's bytes
  // since its last fold against the side file's own (its bound); the bytes being made, a slice a turn
  let stampsCompactOwed = false, stampsCompactNow = false, stampsJournalLen = 0, stampsBuild = null, stampsMadeBytes = 0;
  // B-360d (r4642, must 2 + (2)): THE PURGE's ONE DOOR — the purges asked so far; the asks the bytes being made cover (taken when they
  // are MADE); the asks a LANDED compaction covered. A purge's «done» is true only once bytes made after its ask have landed
  let stampsPurgeAsks = 0, stampsMadeAfter = 0, stampsLandedAfter = 0;
  let stampsHanded = false;   // r4676: bytes handed to the writer that have no answer yet (landed or failed) — a thread lost in flight never answers
  let stampsSideBytes = (() => { try { return fs.statSync(stampsFile).size; } catch { return -1; } })();   // -1: no side file (its first write once the journal holds a line)
  const stampStats = { writes: 0, healed: 0, lostAtLoad: 0, compactions: 0, slices: 0 };
  let journalFd = null, journalTorn = false, journalSaidAt = 0, journalWas = false;   // journalWas: a journal there at the start (or opened since)
  const journalStats = { replayed: 0, torn: 0, lines: 0, bytes: 0, folds: 0 };
  {   // the journal replayed over the side file, in order — a kill since its last write lost no stamp
    let text = '';
    try { text = fs.readFileSync(stampsLog, 'utf8'); journalWas = true; } catch (e) { if (e && e.code !== 'ENOENT') holdCompanion(psLoad, 'poll-stamps.log', e); /* «not there»: the side file is the whole truth */ }
    if (text && !text.endsWith('\n')) journalTorn = true;   // a tail a kill cut short: the next line starts on its own
    stampsJournalLen = text.length;   // B-360d: the journal's bytes at the start count toward its bound
    for (const ln of text.split('\n')) {
      if (!ln) continue;
      let a = null;
      try { a = JSON.parse(ln); } catch { /* a line a kill cut short */ }
      if (!Array.isArray(a) || a.length !== 1 + STAMP_KEYS.length || typeof a[0] !== 'string') { journalStats.torn++; continue; }
      const st = {};
      STAMP_KEYS.forEach((f, i) => { if (Number(a[i + 1]) > 0) st[f] = Number(a[i + 1]); });
      if (Object.keys(st).length) stampMap.set(a[0], st); else stampMap.delete(a[0]);
      journalStats.replayed++;
    }
    if (journalStats.replayed) stampsDirty = true;   // the side file's next write folds them (armed below)
    if (journalStats.torn) warn(`[channels] poll-stamps.log: ${journalStats.torn} line(s) unreadable (a write cut short) — skipped; the conversation(s) they stamped keep their older poll time`);
  }
  /** Take a row's own stamps into the side map — the NEWER instant wins per key — and strip them from the row (a legacy
   *  row, or one written past the door). Returns whether the map took one. */
  function healRow(key, en) {
    if (HELD_WALLS.healRow && psLoad && psLoad.blocked) return false;   // B-f276 wall: the poll times stay in the row while their side file is held
    const l = en && en.lane;
    if (!l || typeof l !== 'object') return false;
    let took = false;
    for (const f of STAMP_KEYS) {
      if (!hasOwn(l, f)) continue;
      const v = Number(l[f]) || 0;
      delete l[f];
      if (!v) continue;
      let st = stampMap.get(key);
      if (st && Number(st[f]) >= v) continue;
      if (!st) stampMap.set(key, st = {});
      st[f] = v; took = true;
    }
    if (took) { stampsDirty = true; stampSeq++; stampsSince.add(key); stampStats.healed++; if (healing) healing.push(key); else journal(key); }
    return took;
  }
  {
    const conv = ix.conversations;
    let healed = 0;
    healing = [];
    for (const k of Object.keys(conv)) if (healRow(k, conv[k])) healed++;
    const took = healing; healing = null;
    if (took.length) journal(took);   // channel-store-off-loop: ONE append for the load's heal (the index on disk still holds them)
    if (!psLoad.value) {
      const lost = healed ? 0 : Object.keys(conv).filter((k) => !stampMap.has(k)).length;
      stampStats.lostAtLoad = lost;
      if (healed) warn(`[channels] poll-stamps.json: ${healed} conversation(s)' poll times taken out of index.json (an index written before the side file) — journaled now, and carried by the side file's next compaction`);
      else if (lost) warn(`[channels] poll-stamps.json was not read (${psLoad.blocked ? 'blocked' : 'missing or set aside'}) — ${lost} conversation(s) carry no last-poll time: each is due at once, and the vendor's budget paces the re-poll`);
    } else if (unreadStamps) warn(`[channels] poll-stamps.json: ${unreadStamps} entr${unreadStamps === 1 ? 'y is' : 'ies are'} not a list of instants — that many conversation(s) carry no last-poll time: each is due at once, and the vendor's budget paces the re-poll`);
    // B-360d: nothing is written at the open (QUIET IS FREE) — a journal replayed here is compacted by the next set past its bound
  }
  // lane lark-threads (A1): the STORED place of every record the dedup set holds that carries one (sparse:
  // vendorId → {threadKey, root, replyTo}) — what the place door judges an offer against; REBUILT with the set (every
  // reader of it asks `dedupSet` first, so a set dropped on a failed write takes this map's next rebuild with it)
  const basePlaces = new Map();
  const dropDedup = (k) => { dedup.delete(k); basePlaces.delete(k); };

  // ── WHICH ROWS CHANGED (lane channel-index-copy): the incremental write and the engine's kept totals read it ──
  // A row is touched by `entry()` (the door every row write goes through). Reaching the WHOLE map inside an update —
  // the update's `ix.conversations`, or `live()` — touches every row (conservative: the next write is a full one).
  let curTouch = null;         // the running update's touched keys (a Set; `.all` once it reached the whole map)
  let allDirty = true;         // the next write re-serializes every row (boot, a whole-map update, a verify drift)
  const dirtyKeys = new Set();
  let layout = null;           // { chunks: [{ keys, buf, n }], chunkOf: Map<key, chunk> } — the cached rows
  // B-dfa4 cut 3: A BIG INDEX'S LAYOUT IS BUILT IN SLICES (walkSliced). The first write after a boot (and after a whole-map
  // touch, or a mass of touched rows: a boot's passes) laid out EVERY row on the loop: 1.6 s for 96 500 rows. An index of at
  // most LAYOUT_SYNC_ROWS rows still builds in the write's own turn; a bigger one in slices over a STATED SNAPSHOT of the
  // keys taken at its start: a row written since is in dirtyKeys (the write that follows re-serializes its chunk), a row
  // born since joins the last chunk, a removed one leaves its chunk there; a whole touch makes it stale and it STARTS AGAIN.
  // So what the first write lays down equals a whole layout at the instant it is written. Until it lands the writer is
  // answered LATER (src/store-writer.js: nothing written, the index stays owed, every durable() waiter WAITS — never a
  // partial file, never «on disk» before it is); the landing dirties it again. A synchronous flush (close, the exit, a
  // suite: the writer's flushSync asks produce({sync: true})) lays out in its own turn, as before.
  const LAYOUT_SYNC_ROWS = (walk && Number.isFinite(walk.syncRows)) ? walk.syncRows : WALK_SYNC_ROWS;
  const LAYOUT_SLICE_MS = (walk && Number.isFinite(walk.sliceMs)) ? walk.sliceMs : WALK_SLICE_MS;
  const layoutSeam = (walk && typeof walk.onSlice === 'function') ? walk.onSlice : null;   // a suite's: between two slices
  const NOT_READY = Symbol('layout not ready');
  const LATER = Symbol.for('vibespace.store-writer.later');   // the writer's NOT READY answer (src/store-writer.js)
  let warm = null, warmFailed = false;   // warm: { stale, promise } while a sliced layout is built; warmFailed: the next layout is built whole
  // THE BOUND ON LATER: a write answered LATER waits for at most LATER_MAX sliced builds (a whole touch restarting the layout,
  // rows touched faster than their chunks are re-made) — then the next write is made in its own turn, said once: the index
  // always lands, never a durable() waiting out its 60 s
  const LATER_MAX = 3;
  let laterJobs = 0, laterOwed = false;
  // a mass of touched rows is re-made in slices once its CHUNKS (the cost: ~4 ms each, measured) pass this many
  const APPLY_SYNC_CHUNKS = 6;
  let sweepAt = 0;
  const touchHooks = [];
  const flushStats = { full: 0, incremental: 0, fallback: 0, swept: 0, drift: 0, lastFull: 'boot', writes: 0, skipped: 0, layoutSliced: 0, applySliced: 0, layoutSlices: 0, layoutMaxSliceMs: 0, layoutRestarts: 0 };
  let driftSaidAt = 0;         // the sweep's line: the first drift, then at most one per DRIFT_SAY_MS
  // VIBESPACE_CHANNELS_INDEX_VERIFY=1|<file> (the gates' census): every incremental write is compared with the
  // whole-file serialization; a difference is said (and appended to <file>) and the whole file is written instead
  const verifyTo = String((process.env && process.env.VIBESPACE_CHANNELS_INDEX_VERIFY) || '');
  // ── EACH ACCOUNT'S ROW KEYS, KEPT (B-dfa4 U2): a walk of ONE account's rows (the recheck, the revisions, the feed's
  // describe, the due index's build) read the whole flat map — every account's rows — at each turn. Kept off the touch
  // signal every row write already gives: a touched key moves to its account's set (a birth, a removal, an account that
  // changed); a whole-map touch drops the sets (rebuilt at the next read). A row whose key does not begin with its own
  // account (only a damaged act line applied as written) is kept in `oddKeys` and handed to EVERY account — each walk
  // still judges every key it is handed by its own test, so the kept keys are a superset of what any walk read before.
  let byAcct = null;              // Map<adapterId, Map<key, slot>> — null = build at the next read (boot, a whole-map touch)
  const acctOfKey = new Map();    // key → the account whose set holds it ('' = oddKeys)
  const oddKeys = new Map();      // key → slot
  // B-360d item 4 (lane bl-loop-a): each kept key's SLOT { place, at, dm } — its PLACE in the map's own order (the order `live()`
  // walks: a key placed at a build in Object.keys order, a birth after every key there is, a key that moves account keeps its
  // place: the channel walks by account break a tie of two accounts' rows by it exactly as the release's walk over every row did),
  // and (主开发 r4520 / r4526) the TWO FACTS the agents' list drops a row by — `at` = the row's `lastAt || 0` and `dm` = it is a
  // single chat (`kind === 'dm'`, the directory's test) — so the list reads a row from the index only when it can be listed. The
  // facts are refreshed by the very touch that moves the place (`fire(key)` → acctPlace: ONE slot, never an account's rows); no
  // other field of a row is copied. Every writer of a row's lastAt or kind writes it through `entry()` inside an update (the
  // touch): scripts/test-channel-walks.mjs ⑧ is the census of those writers.
  let acctSeq = 0;
  const acctStats = { builds: 0, moves: 0, sliced: 0, refreshes: 0 };
  const slotFacts = (slot, row) => { slot.at = row.lastAt || 0; slot.dm = row.kind === 'dm'; return slot; };
  // B-dfa4 cut 3: A BIG INDEX'S PER-ACCOUNT KEYS ARE BUILT IN SLICES FROM THE LOAD (walkSliced) — the first keysOf() of a
  // 96 500-row index built them in the boot's held turn (acctPlace ← keysOf, measured). The stated snapshot: the keys at the
  // load, placed in the map's order; a key touched meanwhile is placed again at the landing (a birth joins its account's
  // end, as ever); a whole-map touch voids the build (the next read builds them whole, as before). A reader before it
  // lands (keysOf) FINISHES the rest in its own turn — never a partial set.
  let acctWarm = null;            // { map, keys, i, touched } while the per-account keys are built in slices
  function acctPlace(key, byAcct = byAcctNow()) {
    const prev = acctOfKey.get(key);
    const row = hasOwn(ix.conversations, key) ? ix.conversations[key] : null;
    const a = row && typeof row.adapterId === 'string' ? row.adapterId : null;
    const next = !row ? undefined : (a !== null && key.startsWith(`${a}/`) ? a : '');
    if (prev === next) {   // the same account (or both absent): the row's two kept facts, read again — this key's slot only
      if (row) { const m = next === '' ? oddKeys : byAcct.get(next), slot = m && m.get(key); if (slot) { slotFacts(slot, row); acctStats.refreshes++; } }
      return;
    }
    let slot;
    if (prev === '') { slot = oddKeys.get(key); oddKeys.delete(key); }
    else if (prev !== undefined) { const set = byAcct.get(prev); if (set) { slot = set.get(key); set.delete(key); if (!set.size) byAcct.delete(prev); } }
    acctStats.moves++;
    if (next === undefined) { acctOfKey.delete(key); return; }
    if (slot === undefined) slot = { place: ++acctSeq, at: 0, dm: false };   // a key new to the map: after every key there is (a move keeps its place)
    slotFacts(slot, row);
    acctOfKey.set(key, next);
    if (next === '') oddKeys.set(key, slot);
    else { let set = byAcct.get(next); if (!set) byAcct.set(next, (set = new Map())); set.set(key, slot); }
  }
  /** B-dfa4 U2: the keys of ONE account's rows (with any row whose key and account disagree) — a fresh array, in the
   *  map's own order (a birth joins both at the end); the caller reads each row from `live()` and keeps its own test.
   *  B-dfa4 cut 1: INSIDE an update a row may be born, moved or gone before its touch fires — there the kept set as it
   *  stood at the update's start PLUS every key the update touched so far (a born or moved row is touched; a gone one
   *  reads undefined), and every key once the update reached the whole map: a superset, never a missed row. */
  function keysOf(adapterId) {
    if (curTouch && curTouch.all) return Object.keys(ix.conversations);
    if (acctWarm) acctFinish();   // B-dfa4 cut 3: the rest of the sliced build, in this turn
    if (!byAcct) { byAcct = new Map(); acctOfKey.clear(); oddKeys.clear(); acctStats.builds++; for (const k of Object.keys(ix.conversations)) acctPlace(k); }
    const set = byAcct.get(String(adapterId));
    const out = oddKeys.size ? [...(set ? set.keys() : []), ...oddKeys.keys()] : (set ? [...set.keys()] : []);
    if (curTouch) for (const k of curTouch) if (!(set && set.has(k)) && !oddKeys.has(k)) out.push(k);
    return out;
  }
  /** B-dfa4 cut 1: ONE account's rows for a READ-ONLY scan — keysOf's keys read off the map: the account's own rows in the
   *  map's order, a row whose key is not its account's (only a damaged act line) and, inside an update, a row it touched
   *  after them (a key gone meanwhile is skipped). Never a touch: a caller that CHANGES a row inside an update walks
   *  `keysOf` + `rows()` and touches the MAP key, as a `rows()` scan does. Each caller keeps its own test. */
  function byAcctNow() { return byAcct; }
  function acctLand(job) { acctWarm = null; byAcct = job.map; for (const k of job.touched) acctPlace(k); acctStats.sliced++; if (job.resolve) job.resolve(); }
  /** An ASYNC reader WAITS for the per-account keys being built (a synchronous keysOf finishes them in its turn). */
  const keysReady = () => (acctWarm ? acctWarm.ready : Promise.resolve());
  function acctFinish() { const job = acctWarm; for (let i = job.i; i < job.keys.length; i++) acctPlace(job.keys[i], job.map); acctLand(job); }
  function acctWarmStart() {
    if (byAcct || acctWarm || closed || !plainRows(ix.conversations)) return;
    const keys = Object.keys(ix.conversations);
    if (keys.length <= LAYOUT_SYNC_ROWS) return;   // a small index: built at its first read, as before
    acctOfKey.clear(); oddKeys.clear(); acctStats.builds++;
    const job = acctWarm = { map: new Map(), keys, i: 0, touched: new Set(), resolve: null };
    job.ready = new Promise((r) => { job.resolve = r; });
    walkSliced(keys, (k, i) => { acctPlace(k, job.map); job.i = i + 1; }, { what: 'account-keys', sliceMs: LAYOUT_SLICE_MS, onSlice: layoutSeam, alive: () => acctWarm === job && !closed })
      .then((r) => { if (r.done && acctWarm === job) acctLand(job); else job.resolve(); }, (e) => { job.resolve(); if (acctWarm === job) acctWarm = null; warn('[channels] the per-account keys build failed:', (e && e.message) || e, '— the next read builds them whole'); });
  }
  /** B-360d item 4 (lane bl-loop-a, 主开发 r4317 / r4325): THE CHANNEL WALKS' READ of ONE account's keys — a road (the agents' reach
   *  count, list and search) NEVER builds the per-account map whole in its own turn. → { keys: the KEPT Map itself, key → its slot { place, at,
   *  dm } (read-only: the caller reads it within one synchronous run and never changes it), odd: the keys whose row and account
   *  disagree (every account's, as keysOf answers them; key → slot) } — or null while the map is VOID or being built in slices on a big index: the road then
   *  answers by the release's walk (slow and right, never by a partial map). A void map's sliced build is started here (the roads'
   *  need, nothing more: keysOf and the index's writers keep their own road); a small index (≤ LAYOUT_SYNC_ROWS rows) is built at
   *  once, as keysOf builds it. Inside an update: null (the kept set may not hold a row the update touched yet). */
  function keysKept(adapterId) {
    if (curTouch || closed || acctWarm) return null;
    if (!byAcct) {
      acctWarmStart();   // a big index: its slices start now; a small one, or rows that are not plain, start nothing
      if (acctWarm) return null;
      if (Object.keys(ix.conversations).length > LAYOUT_SYNC_ROWS) return null;   // not plain rows on a big index: the release's walk
      keysOf(adapterId);   // a small index: built at once (≤ LAYOUT_SYNC_ROWS keys), as keysOf builds it
      if (!byAcct) return null;
    }
    return { keys: byAcct.get(String(adapterId)) || NO_KEYS, odd: oddKeys };
  }
  const NO_KEYS = new Map();
  function rowsOf(adapterId) {
    const out = [];
    for (const k of keysOf(adapterId)) { const en = ix.conversations[k]; if (en) out.push(en); }
    return out;
  }
  const fire = (key) => {
    if (acctWarm) { if (key === null) acctWarm = null; else acctWarm.touched.add(key); }   // B-dfa4 cut 3: placed at its landing / void (byAcct is null until it lands)
    if (byAcct) { if (key === null) byAcct = null; else acctPlace(key); }   // B-dfa4 U2: before the hooks (a hook may walk an account)
    for (const h of touchHooks) { try { h(key); } catch (e) { warn('[channels] index touch hook threw:', (e && e.message) || e); } }
  };
  let outsideTouched = new Set(), outsideArmed = false;
  // r1763 (1): while the index is HELD a change outside an update asks no write at all — the refusal said ONCE (the family is held
  // for the life: a big one is loaded at the next start), never a line a batch
  let heldSaid = false;
  const sayHeldOnce = () => { if (heldSaid) return; heldSaid = true; warn(`[channels] index-acts.ndjson and index.json not written while the index is held: ${ixLoad.blocked} — changes made now are kept in memory only`); };
  function touchKey(key) {
    dirtyKeys.add(key);
    if (curTouch) { curTouch.add(key); }   // B-360d unit 1: no «before» kept (the end compares the persisted print)
    else { fire(key); outsideTouched.add(key); if (!outsideArmed) { outsideArmed = true; Promise.resolve().then(() => { outsideArmed = false; const o = outsideTouched; outsideTouched = new Set(); if (closed || !o.size) return; if (ixLoad.blocked) { sayHeldOnce(); return; } try { const k = actOf(o, false); if (k === 'whole') oweWhole(); } catch (e) { warn('[channels] index-acts.ndjson: a touch outside an update was not journaled:', (e && e.message) || e); oweWhole(); } }); } }   // B-360d unit 1: a row touched outside an update rides the journal too
  }
  // B-360d unit 1: a census's tap — fn(why) AT the whole touch, in the scope that made it (its stack names it; the hooks
  // above hear it after the update ended, its scope gone). Nothing is kept: no tap, no cost.
  const wholeTaps = [];
  function touchAll(why) { for (const h of wholeTaps) { try { h(why); } catch { } } if (!allDirty) flushStats.lastFull = why; allDirty = true; if (warm) warm.stale = true; if (curTouch) curTouch.all = true; else { fire(null); if (!closed && !ixLoad.blocked) oweWhole(); } }
  // the view an update's fn receives: the live root, except that reaching `conversations` through it is a whole-map touch
  const touchView = new Proxy(ix, {
    get(t, p) { if (p === 'conversations') touchAll('update reached ix.conversations'); else if (curTouch) curTouch.top = true; return t[p]; },   // B-360d unit 1: a top-level table reached — the end compares the top
    set(t, p, v) { if (p === 'conversations') touchAll('update replaced ix.conversations'); else if (curTouch) curTouch.top = true; t[p] = v; return true; },
    deleteProperty(t, p) { if (p === 'conversations') touchAll('update deleted ix.conversations'); else if (curTouch) curTouch.top = true; return delete t[p]; },
  });

  const logPath = (adapterId, convId) => path.join(msgsDir, safeSeg(adapterId), `${safeSeg(convId)}.ndjson`);

  // B-360d unit 1: THE FOLD IS ASKED ONCE A BOUND (the read of c6ec90b73: every act during its in-flight write re-asked it —
  // a second whole write after the landing); cleared when an index write ends, landed or failed (a failed one stays owed)
  let foldAsked = false;
  function askFold() { if (foldAsked || closed || ixLoad.blocked) return; foldAsked = true; markDirty(true); W().durable(indexFile).catch(() => { }); }
  // B-360d unit 1 (S5): EVERY road that owes index.json for rows no journal line holds — a whole / burst update, a fn that
  // threw after a whole touch, a touch outside an update that reached the whole map, the sweep's drift — owes it HERE, so
  // index.durable() waits on that write (never the journal's) until it lands
  function oweWhole(act = false) { if (!closed) wholeOwed = ++wholeAsked; markDirty(act); }
  // the journal's write asked now (its owed lines, or the compaction owed — a journal read at open with lines the index
  // already held is compacted only when asked: law 11's purge asks it)
  function askActs() { if (closed || ixLoad.blocked) return; if (compactOwed || actSeq > appendedSeq) W().dirty(actsFile, { name: 'channels-acts.write', produce: produceActs, debounceMs: FLUSH_DEBOUNCE_MS, mode: 0o600, rank: 0, allowEmpty: true, ...actsOwn() }); }   // B-f276 1c (the meeting with B-360d unit 1): every journal write under the index's law
  function markDirty(act = false) {
    dirty = true;
    // R4 verify r4: a change that lands AFTER close() (a wake queued behind one
    // in flight when the engine stopped holds its hits pending) is written
    // NOW — the debounce is gone, and an unflushed hold was a lost message
    if (closed) { try { flush(); } catch (e) { warn('[channels] index.json not written after close:', (e && e.message) || e); } return; }
    W().dirty(indexFile, { name: 'channels-index.write', produce: produceIndex, debounceMs: FLUSH_DEBOUNCE_MS, mode: 0o600, ...firstWrite(indexFile, indexWritten), ...(act ? { rank: 0 } : {}) });   // B-f276 1b: a missing index's first write is the exclusive create
  }

  // THE WRITER ASKS FOR THE BYTES when the index is due (lane hub-loop-stalls commit 2): the serialization runs HERE on
  // the main thread (measured: 12 ms after one changed row, 107 ms for a whole rebuild of a 22 MB index — under the boot
  // law's 250 ms; the index's SHAPE — one 22 MB file rewritten whole — is the named follow-up), the syscalls on the
  // writer's thread. A failed write keeps the index dirty and the writer retries (1 s … 60 s) — said, never thrown
  // (lane-dead-bridge: a server whose table was full died in this write's timer).
  let fullOwed = false, pendingTop = null;
  function produceIndex(o) {
    if (!dirty && !fullOwed) return null;
    // every refusal is said (r3: a once-only line went silent after the first)
    if (ixLoad.blocked) {
      // B-f276 1c (its read r1 M3): an index held because a file of its came that is NOT its own answers BY NAME — never null («equal to
      // the disk»: a durable act waiting on the index would be told done for a change nothing will write)
      if (ixLoad.q && ixLoad.q.kind === 'appeared') throw Object.assign(new Error('index.json held: ' + ixLoad.blocked), { code: 'EEXIST', familyHeld: true });
      warn('[channels] index.json not written: ' + ixLoad.blocked); dirty = false; return null;
    }
    const full = fullOwed; fullOwed = false;
    if (actSeq > 0 && ix.actsSeq !== actSeq) ix.actsSeq = actSeq;   // the last act this write holds (the load replays past it)
    pendingActsSeq = actSeq;
    pendingTopCmp = topCmp(); pendingTopSeq = actSeq; pendingWhole = wholeAsked;   // B-360d unit 1: what this write holds (M4, S5)
    const p = prepareIndex(full, !!(o && o.sync));
    if (p === NOT_READY) { dirty = true; if (full) fullOwed = true; return LATER; }   // B-dfa4 cut 3: the layout is being built in slices — the index stays owed, its waiters wait (the landing re-marks it)
    dirty = false;   // handed to the writer — a failed write dirties it again (indexWritten)
    if (!p) { if (pendingWhole >= wholeOwed) wholeOwed = 0; return null; }   // nothing to write: the disk holds memory (topText holds actsSeq)
    pendingTop = p.top;
    carriedGen = bornGen;   // B-526c r937 / r1040: what this write carries of the rows born since the last landing — B-360d found holder 1: every birth up to here, ONE number (the release copied the set in this turn)
    // B-360d found holder 1: the parts BY REFERENCE (the writer's own road, src/store-writer.js byRef: copied 4 MB a turn, never joined
    // whole in this turn). No part is written into once built: assemble() makes the top and the separators fresh each write, and a
    // layout chunk's bytes are REPLACED, never written into (serializeChunk, the one place a part's buffer is made) — each stays as
    // handed until its landing has ended
    return require('./store-writer.js').byRef(p.parts);
  }
  function indexWritten(ok) {
    foldAsked = false;
    if (ok && carriedGen !== null && carriedGen > landedGen) { landedGen = carriedGen; sweepLanded(); }   // B-526c r937: those rows are on disk now (the whole write carried them) — B-360d found holder 1: one number; the covered entries dropped in slices
    carriedGen = null;
    if (ok) {
      bytesOwed = false; lastTop = pendingTop; flushStats.writes++;
      actsOverSaid = 0;   // round 4 (true words 5): the index LANDED — a later bound is a new episode, never «not landed since»
      // the acts this index holds leave the journal: a COMPACTION is owed (one small whole-file rewrite at its own pace — a
      // line the index holds is skipped at load anyway)
      const before = actLines.length; actLines = actLines.filter((x) => x.seq > pendingActsSeq);
      owedBytes = owedOf();   // law 10: the fold took the rest
      journalBytes = actLines.reduce((n, x) => n + lb(x), 0);   // S6: what the compaction keeps — the bound never re-fires before it lands
      if (topLineSeq <= pendingTopSeq && pendingTopCmp !== null) persistedTop = pendingTopCmp;   // M4: the top this index holds
      if (pendingWhole >= wholeOwed) wholeOwed = 0;   // S5: a whole update's write landed
      if (actLines.length !== before || compactOwed) { compactOwed = true; W().dirty(actsFile, { name: 'channels-acts.write', produce: produceActs, debounceMs: FLUSH_DEBOUNCE_MS, mode: 0o600, allowEmpty: true, ...actsOwn() }); }   // B-f276 1c: the compaction under the index's law (own-only while it read missing)
      return;
    }
    bytesOwed = true; lastTop = null; dirty = true;   // owed: the writer has kept it dirty and retries
  }

  /** THE SYNCHRONOUS WRITE (close, a suite, a change after close): through the writer — a write of the index in flight
   *  settles first (never two writes of one file at once), then the index's bytes are written on this thread. During the
   *  hub's exit the writer only keeps it dirty: its exit flush writes every store once, bounded. */
  function flush({ full = false } = {}) {
    if (ixLoad.blocked) { if (dirty) warn('[channels] index.json not written: ' + ixLoad.blocked); return false; }   // B-f276 1c: a held index is never written — refused before its producer is asked (it answers a held «appeared» by name)
    // B-360d unit 1: a change the JOURNAL alone holds is not in index.json yet — the synchronous write (close, a suite, a
    // change after close) writes the index whole, so index.json alone holds every change (law 7's clean stop)
    if (!dirty && actLines.length) dirty = true;
    if (!dirty && !W().pending(indexFile)) return false;   // a clean index is not rewritten (`full` = HOW, when there is something to write)
    if (full) fullOwed = true;
    W().dirty(indexFile, { name: 'channels-index.write', produce: produceIndex, debounceMs: FLUSH_DEBOUNCE_MS, mode: 0o600, ...firstWrite(indexFile, indexWritten) });
    const r = W().flushSync([indexFile]);
    // a failed write THROWS, as the inline write did (the writer keeps it owed and retries): a caller ordering a cursor
    // after the rows never advances it past rows that are not on disk
    const miss = r.left.find((x) => x.file === indexFile);
    if (miss && ixLoad.blocked) return false;   // its round wp3niroz5 (6): a write the writer refused as «appeared» held the index by name (its hold says why) — not written, never a throw at a close
    if (miss) throw Object.assign(new Error(`index.json not written: ${miss.why}`), { code: 'EINDEXWRITE' });
    return r.written.length > 0;
  }
  /** THE INDEX ON DISK BEFORE WHAT FOLLOWS — an ordering write (a listing's cursor advances only past rows on disk; a cut
   *  walk's stop lands before its page) AWAITED, never a hold of the loop: the writer writes the index now and the promise
   *  says whether it landed (false: the write failed and stays owed — the caller keeps its cursor where it was). */
  function durableIndex() {
    // its round wy3zr6ym5 (主开发 r2285 (1)): ON A CLOSED STORE the flush RETURNS false for a write the writer refused «appeared» (it held
    // the index by name): the HOLD after it answers — never «done» over an index not written (a throw: a write that failed, false too)
    if (closed) { try { flush(); } catch { return Promise.resolve(false); } return Promise.resolve(!ixLoad.blocked); }
    if (ixLoad.blocked) {   // r1542's law: held — the train's road for a whole write (its produce refuses by name)
      // B-f276 1c moved (its read r1 M3, the meeting): a paced change rides the journal now, so a held index need not be dirty — an index held
      // «appeared» answers FALSE by its hold (what this life changed since is never written), never «done» because nothing is pending;
      // its round wp3niroz5 (5): so does EVERY hold (unreadable, damaged, a companion's) — never «done» while the index is not written
      return Promise.resolve(false);
    }
    // B-360d unit 1 (law 2): the index's state is on disk once ITS JOURNAL'S LINES are — a whole write only when the index
    // itself is owed (a whole-map change, a burst, the journal's bound)
    if (wholeOwed) { if (dirty) markDirty(true); return W().durable(indexFile); }   // S5: a whole / burst update's rows are in no journal line — its write (one in flight: that one — never a second)
    askActs();
    return W().durable(actsFile);
  }

  // ── THE INCREMENTAL WRITE (B-f32b): the same bytes as `writeJsonAtomic(indexFile, ix)`, from cached chunks ──
  const plainRows = (c) => !!c && typeof c === 'object' && !Array.isArray(c);
  /** Re-serialize one chunk (each row healed of its own poll stamps first); returns whether its bytes changed. */
  function serializeChunk(c, conv, into = layout) {   // `into`: the layout the chunk belongs to (a sliced build's own, B-dfa4 cut 3)
    const lines = [], kept = [];
    for (const k of c.keys) {
      if (!hasOwn(conv, k)) { if (into && into.chunkOf.get(k) === c) into.chunkOf.delete(k); rowFp.delete(k); continue; }
      kept.push(k);
      healRow(k, conv[k]);
      const line = rowLine(k, conv[k]);
      // the print is taken when a write is PRODUCED: a row changed and touched in the same synchronous turn is safe; one changed,
      // then touched only after an await inside which a produce ran, reads as quiet and waits for the next fold (every
      // rows()-then-touch site of the engine is synchronous today — r1542 (7))
      if (line !== null) { lines.push(line); if (curTouch && curTouch.has(k)) rowFp.delete(k); else rowFp.set(k, fpOf(line)); }   // B-360d unit 1: a row an update in flight touched is not «persisted» by this write — its end journals it
    }
    const old = c.buf;
    c.keys = kept; c.n = lines.length; c.buf = Buffer.from(lines.join(',\n'), 'utf8');
    return !old || !old.equals(c.buf);
  }
  /** B-dfa4 cut 3: the layout in slices (see LAYOUT_SYNC_ROWS) → a promise that lands it (or starts again on a whole touch). */
  function warmLayout({ atOpen = false, keys: given = null } = {}) {   // `keys`: a snapshot taken in THIS turn (the size test's), the first round's own — B-360d found holder 1
    if (warm && !warm.stale) return warm.promise;
    const job = { stale: false, promise: null, restarts: 0, atOpen };
    warm = job; layout = null; if (!atOpen) laterJobs++;   // B-360d unit 1: the open's warm-up is no write's LATER
    job.promise = (async () => {
      for (;;) {
        job.stale = false;
        const conv = ix.conversations;
        const keys = given || Object.keys(conv); given = null;   // THE STATED SNAPSHOT: the rows as they are now; a write after it is in dirtyKeys
        allDirty = false; dirtyKeys.clear();
        rowFp.clear(); fpReady = false;   // B-360d unit 1 (S11): rebuilt by this walk; meanwhile a touched row counts as changed
        const next = { chunks: [], chunkOf: new Map() };
        const spans = [];
        for (let i = 0; i < keys.length; i += INDEX_CHUNK) spans.push(i);
        const st = { slices: 0, maxSliceMs: 0 };
        await walkSliced(spans, (i) => {
          const c = { keys: keys.slice(i, i + INDEX_CHUNK), buf: null, n: 0 };
          next.chunks.push(c);
          for (const k of c.keys) next.chunkOf.set(k, c);
          serializeChunk(c, conv, next);
        }, { what: 'layout', sliceMs: LAYOUT_SLICE_MS, stats: st, onSlice: layoutSeam, alive: () => !closed && warm === job && !job.stale });
        if (st.maxSliceMs > flushStats.layoutMaxSliceMs) flushStats.layoutMaxSliceMs = st.maxSliceMs;
        flushStats.layoutSlices += st.slices;
        if (closed || warm !== job) return;
        if (job.stale) { flushStats.layoutRestarts++; if (++job.restarts >= LATER_MAX) { if (warm === job) warm = null; allDirty = true; laterOwed = true; warn(`[channels] the index layout was started again ${job.restarts} times by whole-map writes — the next write lays it out in one turn`); markDirty(); return; } continue; }   // a whole touch during the build: it STARTS AGAIN from a new snapshot (LATER_MAX times, then the next write lays out in its turn)
        layout = next; warm = null; bytesOwed = true; fpReady = true; if (!job.atOpen) flushStats.full++; flushStats.layoutSliced++;
        if (dirty) markDirty();   // the write owed since it began, now from the landed layout (+ the rows touched meanwhile) — B-360d unit 1: only an OWED write (a layout warmed at open owes none)
        return;
      }
    })().catch((e) => { if (warm === job) warm = null; allDirty = true; warmFailed = true; warn('[channels] the index layout build failed:', (e && e.message) || e, '— the next write lays it out whole'); markDirty(); });
    return job.promise;
  }
  /** B-dfa4 cut 3: A MASS OF TOUCHED ROWS on a laid-out index (their chunks more than APPLY_SYNC_CHUNKS since the last write —
   *  a boot's passes, a complete discovery, any ordinary write that reaches that many chunks) → their CHUNKS re-serialized in slices, the rest kept: the stated snapshot is the rows touched
   *  until now (a row touched later is in dirtyKeys again, the next write takes it); a row born joins the last chunk, as
   *  applyTouched; a whole touch makes it stale (the next write lays out whole); a synchronous write meanwhile takes its
   *  rows back (never lost). The writer is answered LATER until it lands. */
  /** Do the rows touched since the last write fall in more than `limit` chunks (a row born counts as the last one)? */
  function touchedChunksOver(limit) {
    const seen = new Set();
    for (const k of dirtyKeys) { seen.add(layout.chunkOf.get(k) || null); if (seen.size > limit) return true; }
    return false;
  }
  function warmApply() {
    if (warm && !warm.stale) return warm.promise;
    const job = { stale: false, promise: null, keys: [...dirtyKeys] };
    warm = job; dirtyKeys.clear(); laterJobs++;
    job.promise = (async () => {
      const conv = ix.conversations;
      const stale = new Set();
      for (const k of job.keys) {
        let c = layout.chunkOf.get(k);
        if (!c) {
          if (!hasOwn(conv, k)) continue;
          c = layout.chunks[layout.chunks.length - 1];
          if (!c || c.keys.length >= INDEX_CHUNK) { c = { keys: [], buf: null, n: 0 }; layout.chunks.push(c); }
          c.keys.push(k); layout.chunkOf.set(k, c);
        }
        stale.add(c);
      }
      const st = { slices: 0, maxSliceMs: 0 };
      // a chunk whose bytes changed owes them AT ONCE: a synchronous write taking the job over writes them
      await walkSliced([...stale], (c) => { if (serializeChunk(c, conv)) bytesOwed = true; }, { what: 'layout', sliceMs: LAYOUT_SLICE_MS, stats: st, onSlice: layoutSeam, alive: () => !closed && warm === job && !job.stale });
      if (st.maxSliceMs > flushStats.layoutMaxSliceMs) flushStats.layoutMaxSliceMs = st.maxSliceMs;
      flushStats.layoutSlices += st.slices;
      if (closed || warm !== job) return;
      warm = null;
      if (job.stale) { flushStats.layoutRestarts++; markDirty(); return; }   // a whole touch meanwhile: the next write lays out whole
      flushStats.incremental++; flushStats.applySliced++;
      markDirty();   // the write owed since it began (+ the rows touched meanwhile)
    })().catch((e) => { if (warm === job) warm = null; for (const k of job.keys) dirtyKeys.add(k); allDirty = true; warmFailed = true; warn('[channels] the index chunks build failed:', (e && e.message) || e, '— the next write lays it out whole'); markDirty(); });
    return job.promise;
  }
  function buildLayout(conv) {
    const keys = Object.keys(conv);
    layout = { chunks: [], chunkOf: new Map() };
    rowFp.clear();   // B-360d unit 1 (S11): rebuilt below, row by row
    for (let i = 0; i < keys.length; i += INDEX_CHUNK) {
      const c = { keys: keys.slice(i, i + INDEX_CHUNK), buf: null, n: 0 };
      layout.chunks.push(c);
      for (const k of c.keys) layout.chunkOf.set(k, c);
      serializeChunk(c, conv);
    }
    fpReady = true;   // B-360d unit 1: every row's fingerprint known
  }
  /** The touched rows only: a known row re-serializes its chunk; a row born since the last write (`entry()` appends
   *  it to the map, so it is LAST in key order) joins the last chunk — the file keeps the map's own order. */
  function applyTouched(conv) {
    const stale = new Set();
    for (const k of dirtyKeys) {
      let c = layout.chunkOf.get(k);
      if (!c) {
        if (!hasOwn(conv, k)) continue;
        c = layout.chunks[layout.chunks.length - 1];
        if (!c || c.keys.length >= INDEX_CHUNK) { c = { keys: [], buf: null, n: 0 }; layout.chunks.push(c); }
        c.keys.push(k); layout.chunkOf.set(k, c);
      }
      stale.add(c);
    }
    for (const c of stale) if (serializeChunk(c, conv)) bytesOwed = true;
  }
  function assemble() {
    const parts = [], top = [];
    const flushTop = () => { if (top.length) { parts.push(Buffer.from(top.join(''), 'utf8')); top.length = 0; } };
    let first = true;
    for (const k of Object.keys(ix)) {
      if (k.startsWith('_')) continue;
      if (k === 'conversations') {
        top.push(first ? '{\n' : ',\n'); first = false;
        const full = layout.chunks.filter((c) => c.n > 0);
        if (!full.length) { top.push(' "conversations": {}'); continue; }
        top.push(' "conversations": {\n'); flushTop();
        full.forEach((c, i) => { if (i) parts.push(Buffer.from(',\n')); parts.push(c.buf); });
        top.push('\n }');
        continue;
      }
      const s = JSON.stringify(ix[k], RUNTIME_KEYS, 1);
      if (s === undefined) continue;
      top.push(first ? '{\n' : ',\n', ` ${JSON.stringify(k)}: ${s.replaceAll('\n', '\n ')}`); first = false;
    }
    top.push(first ? '{}' : '\n}');
    flushTop();
    return parts;
  }
  // QUIET IS FREE (design 011 lane 2): a write whose bytes equal the last one is skipped — `bytesOwed` says a chunk's
  // bytes changed since (a touched chunk compared with its cached bytes, a whole rebuild with the previous layout), and
  // the top-level tables are compared as text; `updatedAt` moves only with a real write
  let bytesOwed = true;
  let lastTop = null;
  const topText = () => { let t = ''; for (const k of Object.keys(ix)) { if (k === 'conversations' || k === 'updatedAt' || k.startsWith('_')) continue; t += JSON.stringify(k) + ':' + JSON.stringify(ix[k], INDEX_KEYS) + ','; } return t; };
  const liveBufs = () => layout.chunks.filter((c) => c.n > 0).map((c) => c.buf);
  /** The index's bytes for ONE write (the writer's `produce`): the touched chunks re-serialized (a whole rebuild when
   *  `full`, after a touch of everything, or with no cache) — null when they equal the last write (QUIET IS FREE). The
   *  poll stamps' side file lands FIRST (a row's own stamps taken into the map reach it before the index that no longer
   *  holds them). → {parts, top} */
  function prepareIndex(full, sync = false) {
    const conv = ix.conversations;
    if (!sync && (laterOwed || laterJobs >= LATER_MAX)) { if (!laterOwed) warn(`[channels] the index's write waited for ${laterJobs} sliced builds (rows touched faster than they are laid out) — this write is made in one turn`); laterOwed = false; laterJobs = 0; sync = true; }
    if (!plainRows(conv)) { flushStats.fallback++; layout = null; allDirty = true; ix.updatedAt = now(); const s0 = JSON.stringify(ix, INDEX_KEYS, 1); allDirty = false; dirtyKeys.clear(); bytesOwed = true; lastTop = null; return { parts: [Buffer.from(s0, 'utf8')], top: null }; }
    if (sync && warm) { if (warm.keys) for (const k of warm.keys) dirtyKeys.add(k); warm.stale = true; warm = null; }   // B-dfa4 cut 3: a synchronous write takes over a sliced build (its rows back in dirtyKeys)
    if (full || allDirty || !layout) {
      if (!sync && !full && !warmFailed) { const keys0 = Object.keys(conv); if (keys0.length > LAYOUT_SYNC_ROWS) { warmLayout({ keys: keys0 }); return NOT_READY; } }   // B-dfa4 cut 3 — B-360d found holder 1: the size test's snapshot IS the build's (one pass over the map, not two)
      warmFailed = false;
      if (warm) { warm.stale = true; warm = null; }   // the synchronous write lays out in its own turn (a warm in flight yields to it)
      const before = layout ? liveBufs() : null;
      buildLayout(conv); flushStats.full++;
      if (!before || !sameJoined(before, liveBufs())) bytesOwed = true;
    } else if (!sync && !warmFailed && (warm || (layout.chunks.length * INDEX_CHUNK > LAYOUT_SYNC_ROWS && touchedChunksOver(APPLY_SYNC_CHUNKS)))) {   // B-dfa4 cut 3: a mass of touched rows (a boot's passes): their chunks in slices
      warmApply(); return NOT_READY;
    } else { applyTouched(conv); flushStats.incremental++; }
    const wasFull = full || allDirty;
    laterJobs = 0;   // a write made: the LATER run ends
    allDirty = false; dirtyKeys.clear();   // the cache now holds memory; a failed disk write stays owed (indexWritten)
    const top = topText();
    if (!bytesOwed && top === lastTop) { flushStats.skipped++; return null; }
    ix.updatedAt = now();
    let parts = assemble();
    if (verifyTo && !wasFull) {
      const want = JSON.stringify(ix, INDEX_KEYS, 1);
      const got = Buffer.concat(parts).toString('utf8');
      if (got !== want) {
        let at = 0; while (at < want.length && want[at] === got[at]) at++;
        const line = `[channels] index.json incremental write DRIFTED from the whole-file serialization (a row changed without entry()) near: ${JSON.stringify(want.slice(Math.max(0, at - 120), at + 60))}`;
        warn(line);
        if (verifyTo !== '1') { try { fs.appendFileSync(verifyTo, line + '\n'); } catch { } }
        buildLayout(conv); parts = [Buffer.from(want, 'utf8')];
      }
    }
    return { parts, top };
  }
  /** THE SWEEP (every interval tick): re-serialize the next SWEEP_CHUNKS cached chunks and compare. A difference is a
   *  row changed OUTSIDE `update()`/`entry()` (the one-door rule broken somewhere): it is written, and said once per
   *  sweep with its first key. Returns the drifted chunk count. */
  function sweep(n = SWEEP_CHUNKS) {
    if (!layout || allDirty || closed || warm || !plainRows(ix.conversations)) return 0;   // B-dfa4 cut 3: a sliced build holds the touched rows (no false drift)
    const conv = ix.conversations;
    let drift = 0, firstKey = null;
    for (let i = 0; i < n && layout.chunks.length; i++) {
      if (sweepAt >= layout.chunks.length) sweepAt = 0;
      const c = layout.chunks[sweepAt++];
      if (c.keys.some((k) => dirtyKeys.has(k))) continue;   // owed to the next write already
      const old = c.buf;
      flushStats.swept++;
      serializeChunk(c, conv);
      if (old && c.buf.equals(old)) continue;
      drift++; bytesOwed = true;
      if (!firstKey) {
        const a = old ? old.toString('utf8').split(/,\n(?=  ")/) : [], b = c.buf.toString('utf8').split(/,\n(?=  ")/);
        const j = b.findIndex((row, x) => row !== a[x]);
        const m = /^  ("(?:[^"\\]|\\.)*")/.exec(b[Math.max(0, j)] || '');
        try { firstKey = m ? JSON.parse(m[1]) : (c.keys[0] || '?'); } catch { firstKey = c.keys[0] || '?'; }
      }
      for (const k of c.keys) fire(k);
    }
    // verify r1: a row BORN outside `entry()` sits in no chunk — each cycle's end counts the map against the cache
    const bornOutside = !drift && sweepAt >= layout.chunks.length ? Object.keys(conv).find((k) => !layout.chunkOf.has(k) && !dirtyKeys.has(k)) : undefined;   // B-360d unit 1: dirtyKeys lives until the next fold now — a row in it is owed, never «born outside»
    if (bornOutside !== undefined) {
      drift = 1; firstKey = bornOutside;
      touchAll('sweep: a row born outside entry()'); bytesOwed = true;
    }
    if (drift) {
      flushStats.drift += drift;
      const t = now();
      if (!driftSaidAt || t - driftSaidAt >= DRIFT_SAY_MS) { driftSaidAt = t; warn(`[channels] index.json: a conversation row changed outside update() (first: ${firstKey}; ${flushStats.drift} chunk(s) so far) — written now; find the writer`); }
      oweWhole();   // B-360d unit 1: a drifted row is in no journal line
    }
    return drift;
  }

  // ── §5.1 THE SERIALIZED INDEX OWNER ─────────────────────────────────────
  // `update(fn)` mutates LIVE memory inside a promise chain, so overlapping
  // Lark and Gmail passes QUEUE rather than race. A rejected update must not
  // break the chain for everyone behind it — the chain swallows the rejection
  // and hands it to THIS caller only.
  let chain = Promise.resolve();
  /** `{durable: true}` — A PERSON'S ACT, A DECISION OR A BILLING RECORD (lane hub-loop-stalls commit 2): the caller's
   *  promise resolves only once the index holding it is ON DISK (the writer writes it now, off the loop — its pace set
   *  aside for that write; the next update never waits for it). Everything else is written at the index's pace (a lost
   *  change re-derives at the next walk). */
  function update(fn, { durable = false } = {}) {
    // r3: a BLOCKED index refuses the ACTION, not only the write — an update
    // that resolved while the flush was refused was a user action that
    // succeeded on screen and vanished at the next restart
    if (ixLoad.blocked) return Promise.reject(blockedError(ixLoad.blocked));
    let whole = false, none = false;   // this act reached the whole map (the index itself is written durable) / changed nothing
    const run = chain.then(() => {
      const t = curTouch = new Set();   // B-360d unit 1: no «before» kept — the end compares each touched row with its PERSISTED line (rowFp)
      // verify r1: the rows are marked again at the update's END — a write inside an async fn's await cleared their
      // marks, and the fn may change them after it (a no-op for a sync fn: no write can run inside it)
      const done = () => { curTouch = null; if (t.all) { touchAll('update reached the whole map'); } else for (const k of t) { dirtyKeys.add(k); fire(k); } };
      const end = (v) => { done(); if (closed) whole = true; else { const k = actOf(t, durable); whole = k === 'whole'; none = k === 'none'; } return v; };   // B-360d unit 1: EVERY update rides the journal (a change after close: markDirty → flush, the release's road)
      let r;
      const afterThrow = () => { done(); if (!closed) { const k = actOf(t, false); if (k === 'whole') oweWhole(); } };   // B-360d unit 1: what it changed before it threw is persisted
      try { r = fn(touchView); } catch (e) { afterThrow(); throw e; }
      if (r && typeof r.then === 'function') return Promise.resolve(r).then(end, (e) => { afterThrow(); throw e; });
      return end(r);
    }).then((r) => { if (whole) oweWhole(durable); return r; });   // B-360d unit 1 (law 2): index.json owed only by a whole-map change / a burst (the bound's fold is actOf's)
    chain = run.then(() => {}, () => {});
    if (!durable) return run;
    return run.then(async (r) => {
      const viaIndex = whole || (none && !!wholeOwed);   // B-360d unit 1: a durable act that changed nothing is on disk once what is OWED is (a retry of a failed act)
      const ok = closed ? !ixLoad.blocked : none ? await durableIndex() : await W().durable(whole ? indexFile : actsFile);   // r2285 (1): a straggler act after close — its own flush refused «appeared» holds the index: told by the hold, never «done»
      if (ok) return r;
      // A FAILED ACT REACHES THE PERSON (round 2, law F): it IS in memory and the writer keeps retrying — the caller's
      // answer says so, never {ok: true}
      // round 3 (smaller 7): ONE line per cause — an outage fails every act; the first is said, the rest counted until a write lands
      const fileN = viaIndex ? 'index.json' : 'index-acts.ndjson';
      // round 4 (true words 4): WHY, by the writer's own record — a write still QUEUED at durable()'s bound is waiting, never «failed»
      const wn = (() => { try { return W().whyNotDurable(viaIndex ? indexFile : actsFile); } catch { return null; } })();
      if ((wn && wn.code === 'EEXIST') || (ixLoad.q && ixLoad.q.kind === 'appeared')) throw Object.assign(appearedError(ixLoad), { applied: true });   // B-f276 1c moved (the meeting, r1568 (2a)): the act's words by the HOLD, never «retried»   // B-f276 1b (its read r1 S5): the index APPEARED — held for the life, never «written when the storage can»
      const why = wn && wn.why === 'queued' ? `its write is still queued${wn.ahead > 0 ? ` behind at least ${wn.ahead} other write${wn.ahead === 1 ? '' : 's'}` : ''} — the storage is slow${wn.lastMs ? ` (its last write took ${(wn.lastMs / 1000).toFixed(1)} s)` : ''}; kept, written in its turn` : 'its write failed — kept, retried';
      if (!notDurableSaid[fileN]) { notDurableSaid[fileN] = 1; warn(`[channels] ${fileN}: an act is in memory but not on disk yet (${why}; the next acts not on disk the same way are counted, said when a write lands)`); }
      else notDurableSaid[fileN]++;
      throw Object.assign(new Error('Saved, but not on disk yet — the storage has not written it (it is slow or failing). It stays in memory and is written when the storage can; a restart before then loses it.'), { code: 'not-durable', status: 503, applied: true, result: r });
    });
  }
  /** ONE durable update's journal line — ONLY the rows it CHANGED (as the index prints them; null = removed) and the
   *  top-level tables when they changed — appended through the writer. → 'line' | 'none' (it changed nothing: nothing is
   *  written, round 2, law C iv) | 'whole' (it reached the whole map: the caller writes the index itself, durable) */
  // B-360d unit 1: THE PERSISTED TOP (the top-level tables as the base or the journal last holds them, `actsSeq` aside)
  const topCmp = () => { let t = ''; for (const k of Object.keys(ix)) { if (k === 'conversations' || k === 'updatedAt' || k === 'actsSeq' || k.startsWith('_')) continue; t += JSON.stringify(k) + ':' + JSON.stringify(ix[k], INDEX_KEYS) + ','; } return t; };
  let persistedTop = null, topLineSeq = 0, pendingTopCmp = null, pendingTopSeq = 0, wholeOwed = 0, wholeAsked = 0, pendingWhole = 0;
  function actOf(t, durable = false) {
    // B-360d unit 1 × B-f276 1b (主开发 r1542's law): WHILE THE INDEX IS HELD NOTHING OF ITS FAMILY IS WRITTEN — no journal line
    // is made: the change is owed to the index's OWN whole write, which the hold refuses by name (the train's road — an update
    // is refused at its door; one in flight when the index APPEARED is refused at its exclusive write: appearedError)
    if (ixLoad.blocked) return 'whole';
    if (t.all || ixLoad.missing) return 'whole';   // B-f276 1b (its read r1 M2): an index that never landed (read missing, or started empty) journals NOTHING — the act writes the index itself, through its exclusive create
    if (t.size > BURST_ROWS) { flushStats.bursts = (flushStats.bursts || 0) + 1; return 'whole'; }   // law 4: never even compared
    const conv = ix.conversations, rows = [], fps = [];
    let bytes = 0;
    // 主开发 r2287 (2): the update's heals are ONE append to poll-stamps.log, as the load's (healRow pushes to `healing`) — taken
    // on every road out of the loop, a burst's included (the rows healed before it keep their stamps in the journal)
    const healBatch = healing === null; if (healBatch) healing = [];
    try { for (const k of t) {
      if (String(k).startsWith('_')) continue;
      // ↑ a key beginning with '_' is RUNTIME ONLY: the index file never holds it (rowLine and INDEX_KEYS drop it), so its journal
      // drops it too — the release's durable line wrote one, and its replay brought it back only until the next whole write
      // dropped it again (r1542 (4): the reason said)
      const has = hasOwn(conv, k);
      // 主开发 r2081: a poll stamp written INTO the row (a write past the door) is healed into the side map — and its journal — HERE,
      // at the update's end, as the chunk's serializer does: the row's print omits stamps, so it may never be serialized before a fold
      if (has) healRow(k, conv[k]);
      const line = has ? rowLine(k, conv[k]) : null;
      const f = line === null ? null : fpOf(line);
      const prev = rowFp.has(k) ? rowFp.get(k) : undefined;
      if (prev !== undefined && prev === f) continue;             // QUIET IS FREE (law 3): its persisted bytes, unchanged
      if (prev === undefined && f === null && fpReady) continue;  // never persisted, absent now
      const s0 = has ? JSON.stringify(conv[k], INDEX_KEYS) : null;   // the journal's form (the release's replay reads it)
      if (has && s0 === undefined) continue;
      bytes += Buffer.byteLength(k) + (s0 === null ? 4 : Buffer.byteLength(s0)) + 4;
      if (bytes > BURST_BYTES) { flushStats.bursts = (flushStats.bursts || 0) + 1; return 'whole'; }   // law 4: a burst is one whole write
      rows.push(`${JSON.stringify(k)}:${s0 === null ? 'null' : s0}`);
      fps.push([k, f]);
    } } finally { if (healBatch) { const took = healing; healing = null; if (took.length) journal(took); } }
    if (persistedTop === null) persistedTop = topCmp();   // the top as loaded (base + journal)
    // the top (every top-level table stringified) compared only when the update reached one (its view, table()) or for a
    // durable act (the release's own compare) — never per quiet poll update (the read of c6ec90b73)
    const top = t.top || durable ? topCmp() : persistedTop;
    let topPart = '';
    if (top !== persistedTop) {
      const f = [];
      for (const k of Object.keys(ix)) { if (k === 'conversations' || k === 'updatedAt' || k === 'actsSeq' || k.startsWith('_')) continue; const v = JSON.stringify(ix[k], INDEX_KEYS); if (v !== undefined) f.push(`${JSON.stringify(k)}:${v}`); }
      topPart = `,"top":{${f.join(',')}}`;
    }
    if (!rows.length && !topPart) return 'none';
    for (const [k, f] of fps) { if (f === null) rowFp.delete(k); else rowFp.set(k, f); }
    if (topPart) { persistedTop = top; topLineSeq = actSeq + 1; }
    const seq = ++actSeq;
    // r1850 (4): a row purged and born again inside ONE update with the same bytes gets no line (its print equals the persisted
    // one) and reads unlanded until the next whole write — safe: those bytes are on disk already
    for (const [k, f] of fps) if (f !== null && isUnlanded(k) && !bornSeq.has(k)) bornSeq.set(k, seq);   // r1765: the line that carries this birth
    const lineText = `{"seq":${seq},"rows":{${rows.join(',')}}${topPart}}\n`;
    const line = { seq, text: lineText }; actLines.push(line);
    owedBytes += lb(line);
    if (owedBytes > ACTS_MAX_BYTES && !owedEpisode) { owedEpisode = true; warn(`[channels] index-acts.ndjson: ${Math.round(owedBytes / 1048576)} MB of changes are kept in memory, not on disk yet — the storage has not taken them (the next writes carry at most ${ACTS_MAX_BYTES / 1048576} MB each; the index's whole write folds the rest)`); }
    flushStats.journaled = (flushStats.journaled || 0) + rows.length;
    W().dirty(actsFile, { name: 'channels-acts.write', produce: produceActs, debounceMs: FLUSH_DEBOUNCE_MS, mode: 0o600, rank: durable ? 0 : 1, allowEmpty: true, ...actsOwn() });   // B-f276 1c: the append under the index's law
    if (journalBytes > ACTS_MAX_BYTES) {   // THE BOUND: said, and the index's own write made urgent (it folds the journal)
      if (actsOverSaid++ % 100 === 0) warn(`[channels] index-acts.ndjson is past its bound (${Math.round(journalBytes / 1048576)} MB of ${ACTS_MAX_BYTES / 1048576}) — the index is written now to fold it${actsOverSaid > 1 ? ` (still past it: the index has not landed since — ${flushStats.writes} index write${flushStats.writes === 1 ? '' : 's'} so far; the acts keep coming faster than its paced turn)` : ''}`);
      if (!closed) askFold();
    }
    return 'line';
  }
  /** the journal's bytes for ONE write: a COMPACTION when owed (the lines past the written index, whole), else an APPEND
   *  of the lines not on disk yet — never the whole journal per act */
  let actsWriting = null;
  const notDurableSaid = {};   // file → acts that failed since the first was said (round 3, smaller 7)
  const sayLanded = (fileN) => { const n = notDurableSaid[fileN]; if (n > 1) warn(`[channels] ${fileN}: written again — ${n - 1} more act${n - 1 === 1 ? '' : 's'} had failed the same way meanwhile (each kept in memory, now on disk)`); delete notDurableSaid[fileN]; };
  function produceActs() {
    // B-f276 1c (its read r1 M3, the meeting): an index held because a file of its came that is NOT its own answers BY NAME (EEXIST) — never
    // null: a durable act waits on THIS file now, and null would tell it «done»
    if (ixLoad.blocked && ixLoad.q && ixLoad.q.kind === 'appeared') throw Object.assign(new Error('index-acts.ndjson held: ' + ixLoad.blocked), { code: 'EEXIST', familyHeld: true });   // familyHeld (its round wp3niroz5 (1)): FINAL at the writer, whatever the journal's own law (a journal read at the start is not own-only)
    // 主开发 r2455 (6): no leg reaches this LATER — the index family is big (no adopt): a hold lasts the process's life and is
    // set at the start (before any waiter) or as «appeared» (answered by name above); no reachable scene queues a waiter, THEN holds
    if (ixLoad.blocked) { sayHeldOnce(); return (LATER); }   // r1763 (2): never «nothing to write» — the writer would read it as settled and tell a waiter done; its waiters wait (the writer's bound answers them «not on disk yet»)   // r1542's law: the journal stands behind the index's hold
    // law 10: NO JOURNAL JOB CARRIES MORE THAN THE BOUND — past it (the storage did not take the lines in time) the index's
    // whole write FOLDS them (its landing drops the lines it holds) and this file waits (LATER: its waiters wait — a job
    // must never be cut short, the writer answers every waiter of the version it wrote)
    if (!closed) { let all = 0; for (const x of actLines) if (compactOwed || x.seq > appendedSeq) all += lb(x); if (all > ACTS_MAX_BYTES) { askFold(); return (LATER); } }   // the fold asked ONCE, urgent (its waiters wait for it, never a 60 s timeout behind its pace)
    if (compactOwed) { actsWriting = { compact: true, upTo: actSeq }; return actLines.map((x) => x.text).join(''); }
    const fresh = actLines.filter((x) => x.seq > appendedSeq);
    if (!fresh.length) return null;
    actsWriting = { compact: false, upTo: fresh[fresh.length - 1].seq };
    return { append: fresh.map((x) => x.text).join('') };
  }
  function actsWritten(ok, err) {
    if (!ok && err && err.code === 'EEXIST' && ixLoad.readMissing) { actsWriting = null; tookAppeared(ixLoad, err.familyHeld ? null : 'index-acts.ndjson'); return; }   // B-f276 1c: the journal there is not the one this store made — the index held, the journal kept
    const w = actsWriting; actsWriting = null;
    // round 3 (law 4): THE JOURNAL'S TAIL IS ALWAYS A WHOLE LINE BEFORE THE NEXT APPEND — after ANY failed append its tail is
    // unknown (the thread truncates back, but a truncate can fail too: ENOSPC after 4 KB + ftruncate EIO left a fragment the
    // retried act was glued to), so the next write is a COMPACTION through the whole-file road: every act not yet held by
    // the index, whole lines, temp + rename — the act promised «written when the storage answers» is on disk then
    if (!ok) { if (w && !w.compact) compactOwed = true; return; }
    sayLanded('index-acts.ndjson');
    if (!w) return;
    const prev = appendedSeq;
    if (w.upTo > appendedSeq) appendedSeq = w.upTo;
    for (const [k, sq] of bornSeq) if (sq <= w.upTo) { unlanded.delete(k); bornSeq.delete(k); }   // r1765: a born row LANDS with its line's sync (an append or the compaction that holds it) — never at its making, never after a failed append
    if (w.compact) { compactOwed = false; journalBytes = actLines.filter((x) => x.seq <= w.upTo).reduce((n, x) => n + lb(x), 0); }
    else journalBytes += actLines.filter((x) => x.seq > prev && x.seq <= w.upTo).reduce((n, x) => n + lb(x), 0);
    owedBytes = owedOf();   // law 10: what is still owed (its bytes)
    if (owedEpisode && owedBytes <= ACTS_MAX_BYTES / 2) owedEpisode = false;
  }

  /**
   * A snapshot read for rendering. IT IS NOT A LOCK: compute from it, then
   * apply inside `update()`. Nothing needs more — the ACL, the filter and the
   * policy are all PURE and take their inputs as arguments.
   */
  function snapshot() { return JSON.parse(JSON.stringify(ix)); }
  // B-f32b (lane channel-index-copy): `snapshot()` is the WHOLE index — 0.56 s at 50 274 conversations, and opening one
  // Channel window called it up to five times through known()/convFor(). A read of ONE conversation is `has(key)` (no
  // copy) or `peek(key)` (that row only); a scan reads `live()`. The engine calls `snapshot()` nowhere (its census).
  /** Is there a row for `key`? No copy (the engine's `known()`). */
  function has(key) { return !!ix.conversations[key]; }
  /** ONE entry, cloned (2026-09-26): the per-conversation read of a pass.
   *  `snapshot()` deep-clones the WHOLE index — measured 2.8 ms at 873
   *  entries, i.e. ~2.5 s of main thread per pass when a pass asked it once
   *  per conversation. Same rule as a snapshot: compute from it, apply inside
   *  `update()`. */
  function peek(key) { const e = ix.conversations[key]; return e ? JSON.parse(JSON.stringify(e)) : null; }
  /** The LIVE conversations map, for READ-ONLY iteration on the render and
   *  scheduling paths (the digest, the tick's due scan). Never mutate it
   *  outside `update()` — the one-door rule (§5.1) is unchanged. */
  function liveConversations() { if (curTouch) touchAll('update read live()'); return ix.conversations; }
  /** B-f32b: the live rows for a READ-ONLY scan INSIDE an update that marks each row it changes with `touch(key)` (or
   *  re-fetches it through `entry()`) — the scan itself marks nothing, where `live()` there marks every row. */
  function rows() { return ix.conversations; }
  /** Mark ONE row changed (the row a `rows()` scan wrote) — the incremental write re-serializes its chunk. */
  function touch(key) { const k = String(key); if (hasOwn(ix.conversations, k)) touchKey(k); else touchAll('touch of a row not in the map'); }   // verify r1: a removal / a touch before the birth moves the map's order
  /** The LIVE top-level table `name` (accountAssignments / patternAssignments
   *  — each grain record `{…, access:[], watchers:[]}` since R4 — /
   *  accountGrants / filters / rotations), READ-ONLY outside `update()`. */
  function liveTable(name) { if (curTouch) curTouch.top = true; return ix[name]; }   // B-360d unit 1: inside an update, a top-level table reached

  /**
   * The live entry, created on first touch. ONLY call inside `update()`.
   *
   * `{ create: false }` is the LOOKUP form (r2). "Create on first touch" is
   * right for the ingest pass — discovery is where a conversation is born —
   * and wrong everywhere else: a route that mutates an unknown id used to mint
   * a permanent, invisible row in `index.json` (which is read on every render
   * and deep-cloned by `digest()` on every broadcast), and a `tracked:true`
   * orphan resumes ingesting the day its adapter id is reused.
   */
  function entry(adapterId, convId, { create = true } = {}) {
    const key = `${adapterId}/${convId}`;
    let e = ix.conversations[key];
    if (!e && !create) return null;
    if (!e) {
      unlanded.set(key, ++bornGen); bornSeq.delete(key);   // B-526c r937: not on the disk's index until a write that carries it lands (B-360d: its NEW line, or a whole write) — r1850 (1): a whole write produced BEFORE this birth carries the old row, never this one
      if (layout && layout.chunkOf.has(key)) touchAll('a row re-born before its old place was rewritten');   // verify r1: the file keeps the map's order
      if (stampMap.delete(key)) { stampsDirty = true; stampSeq++; stampsSince.add(key); journal(key); }   // design 011 lane 2: a row born under a key that left keeps none of its stamps — B-360d (r4642 (3)): a change of that key for the compaction's window (its removal line kept by the fold)
      e = ix.conversations[key] = {
        key, id: convId, adapterId, vendorId: convId, title: '', kind: 'group',
        participants: '', lastAt: null, unread: 0, tracked: false, anchor: null,
        access: [], watchers: [], filterId: null, policy: null, pendingTodoId: null,
        reachEntries: [], stats: { hits7d: 0, msgs7d: 0 },
        convCaps: null,
        lane: { via: 'poll', lastPushAt: null, firstSeenByPoll: 0, firstSeenTotal: 0 },   // the poll stamps: `stamps` (design 011 lane 2)
        readAt: 0, createdAt: now(),
      };
    }
    touchKey(key);
    return e;
  }

  // ── the append-only message log ──────────────────────────────────────────
  function dedupSet(adapterId, convId) {
    const key = `${adapterId}/${convId}`;
    let s = dedup.get(key);
    if (s) return s;
    s = new Set();
    const bp = new Map();
    // STRICT (r5): this is the WRITE-side reader. A log that cannot be read
    // is not a log that holds nothing — an EMFILE/EIO/EACCES here used to be
    // an EMPTY set, CACHED, so the next append wrote the whole re-offered
    // batch as "fresh" and a replayed boundary record landed twice for ever
    // (the r4 class one layer over: a witness that cannot be heard read as a
    // witness saying "nothing"). Only ENOENT is "no log yet"; anything else
    // throws out of `appendRecords`, the pass fails with the anchor unmoved,
    // and the retry re-reads — a re-read costs a page, a guess costs a
    // phantom message nobody removes. The set is NOT cached on the throw.
    for (const r of readTail(adapterId, convId, { limit: DEDUP_MAX, strict: true })) { s.add(r.vendorId); notePlace(bp, r); }
    dedup.set(key, s);
    basePlaces.set(key, bp);
    return s;
  }

  /** lane lark-threads: a stored record's own place, kept only when it has one (the door's `cur`). */
  function notePlace(bp, r) {
    if (!bp || !r || !r.vendorId) return;
    if (r.threadKey || r.root || r.replyTo) bp.set(String(r.vendorId), { threadKey: r.threadKey || null, root: r.root || null, replyTo: r.replyTo || null });
    else bp.delete(String(r.vendorId));
    if (bp.size > DEDUP_MAX) bp.delete(bp.keys().next().value);
  }
  function rememberVendorId(set, vendorId) {
    set.add(vendorId);
    if (set.size > DEDUP_MAX) { const it = set.values(); for (let i = set.size - DEDUP_MAX; i > 0; i--) set.delete(it.next().value); }
  }

  /**
   * Append records, dropping the ones already in the log (invariant 2).
   * Returns `{ appended, duplicates, lastAt }` — the caller applies those to
   * the index INSIDE its own `update()` (invariant 4's order: log first).
   *
   * THE TWO STEPS ARE SEPARATE ON PURPOSE (r2): SELECT against the durable
   * set, WRITE, and only THEN remember. The dedup set is a claim about what
   * the LOG holds, so a record may not enter it until the bytes are there —
   * see invariant 2. The whole batch is offered again on the next pass either
   * way (the engine never advances an anchor for a pass that threw), and the
   * two throw sites are handled differently BECAUSE they leave different
   * bytes: a throw from `mkdirSync` lands nothing, so the set is still true
   * and stays; a throw from INSIDE the write may have landed a prefix, so the
   * cached set is DROPPED (r4) and the retry rebuilds it from the log —
   * `dedupSet` reads the tail, a complete final line without `\n` parses,
   * the seal closes it, and only what really is missing is written.
   */
  function appendRecords(adapterId, convId, records) {
    if (goneAccounts.has(adapterId)) return { appended: 0, duplicates: 0, lastAt: null, lastText: null, healed: false, freshAt: [], fresh: [], widened: [], gone: true };   // 主开发 r2819 (B-92fc): a purged account's late write makes nothing
    const list = Array.isArray(records) ? records : [];
    const set = dedupSet(adapterId, convId);
    const fresh = [];
    // A batch may legally carry the same vendorId twice (a vendor page and its
    // replayed boundary in one call). This set dies with the call, so it can
    // never outlive a failed write the way the durable one would.
    const inBatch = new Set();
    let duplicates = 0;
    const offers = [];   // lane lark-threads (A1): a duplicate that names a place — offered to the place door
    for (const r of list) {
      if (!r || !r.vendorId) continue;
      if (set.has(r.vendorId) || inBatch.has(r.vendorId)) { duplicates++; if (set.has(r.vendorId) && (r.threadKey || r.root)) offers.push(r); continue; }
      inBatch.add(r.vendorId);
      fresh.push(r);
    }
    const widened = offers.length ? widenQuiet(adapterId, convId, offers, { src: placeSrcOf(records) }) : [];
    if (!fresh.length) return { appended: 0, duplicates, lastAt: null, lastText: null, healed: false, freshAt: [], fresh: [], widened };
    const fp = logPath(adapterId, convId);
    fs.mkdirSync(path.dirname(fp), { recursive: true, mode: 0o700 });
    let healed;
    try {
      healed = appendLines(fp, fresh.map((r) => JSON.stringify(r)).join('\n') + '\n');
    } catch (e) {
      dedup.delete(`${adapterId}/${convId}`);   // r4: the log is the only witness now
      throw e;
    }
    // DURABLE NOW — and only now may the set claim to hold them.
    for (const r of fresh) rememberVendorId(set, r.vendorId);
    { const bp = basePlaces.get(`${adapterId}/${convId}`); if (bp) for (const r of fresh) notePlace(bp, r); }
    let lastAt = null, lastText = null;
    // lane lark-system-records: a vendor notice never moves the row's last line / instant (the preview is the newest MESSAGE)
    // lane gmail-draft-not-a-message: nor does an unsent draft (nobody received it — a row sorted by a draft's date read as new mail)
    for (const r of fresh) if (!isSystemRecord(r) && !isDraftRecord(r) && Number.isFinite(r.at) && (lastAt === null || r.at > lastAt)) { lastAt = r.at; lastText = typeof r.text === 'string' ? r.text : null; }
    // `freshAt`: each appended record's instant (P1 push — the exclusivity
    // measurement judges only records stamped after the lane began carrying
    // content, so a first ingest's backlog is never a "miss").
    // `fresh`: the appended records THEMSELVES (P2): the filter runs over
    // exactly what became durable, on every lane, which is what makes the
    // wake count a property of the corpus and not of the lane (fence 12).
    // `lastText` (2.369.159, the IM-first group list — design §22): the newest
    // appended record's text, so the index can cache the row's LAST LINE beside
    // its `lastAt` (a derived, re-derivable cache like `unread`, never a fact).
    wrote(adapterId, convId, { kind: 'append', fresh });
    return { appended: fresh.length, duplicates, lastAt, lastText, healed, freshAt: fresh.map((r) => (Number.isFinite(r.at) ? r.at : 0)), fresh: fresh.slice(), widened };
  }

  /**
   * THE LOG SEALS A PARTIAL LAST LINE BEFORE IT GROWS (r3 — the other half of
   * invariant 2's r2 fix). An append is not atomic: node's `writeFileSync` /
   * `writeFileUtf8` loop over `write(2)` and throw AFTER earlier chunks have
   * landed, and a SIGKILL, an OOM kill or a power loss does the same — so the
   * three errnos the header names (ENOSPC, EIO, EDQUOT) are exactly the
   * documented short-write producers, and the log can be left ending in HALF
   * A LINE. The r2 fix correctly left the dedup set untouched on that throw,
   * so the batch was re-offered — and appended straight onto the fragment,
   * which made its FIRST record one unparseable line `readTail` skips while
   * the durable set now (correctly) remembered it: every later pass reported
   * it as a duplicate. One message, silently, for ever. Measured on the real
   * store: v1..v5 offered, `v4` unreadable on disk, a later pass `duplicates:2`.
   *
   * So: ONE 1-byte pread of the last byte, only when the file is non-empty,
   * and a `\n` first if it is not one. The fragment then stays as ONE
   * unparseable line the readers already skip and no subsequent record is
   * swallowed. The write itself LOOPS until every byte is out — `fs.writeSync`
   * returns a byte count and does not retry a short write, which is the very
   * shape this function exists to recover from. Returns whether it healed.
   */
  function appendLines(fp, payload) {
    const fd = fs.openSync(fp, 'a+', 0o600);   // a new log is the owning account's alone (an existing one keeps its bits; the root's 0700 closes it)
    let healed = false;
    try {
      const size = fs.fstatSync(fd).size;
      if (size > 0) {
        const last = Buffer.alloc(1);
        fs.readSync(fd, last, 0, 1, size - 1);
        if (last[0] !== 0x0a) {
          writeAll(fd, '\n');
          healed = true;
          console.warn(`[channels] ${path.basename(fp)}: the log ended in a partial line (an interrupted append) — sealed it before appending, so no record is swallowed`);
        }
      }
      writeAll(fd, payload);
    } finally { fs.closeSync(fd); }
    return healed;
  }
  function writeAll(fd, str) {
    const buf = Buffer.from(str, 'utf-8');
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
  }

  /**
   * THE PAGING ORDER IS `(at, vendorId)` — A TOTAL ORDER, NOT A TIMESTAMP (r2).
   *
   * `at` alone is NOT unique: Lark bursts share a millisecond and Gmail's
   * `internalDate` is second-derived, so a group of records sharing one
   * instant is the ROUTINE shape for the first real adapter. Paging on `at`
   * with a strict `<` then makes every record of such a group at or after a
   * page boundary PERMANENTLY UNREACHABLE — the bytes are on disk and the user
   * can never scroll back to them. That is the `slice(offset, limit)` class
   * this repo names as the machine behind three paging incidents.
   *
   * `vendorId` is unique per conversation BY INVARIANT 2 (it is the dedup
   * key), so `(at, vendorId)` is a genuine strict total order and the caller
   * pages by handing back the boundary record's BOTH halves. The sort makes
   * the order the store SERVES identical to the order it PAGES by — ranking on
   * one and slicing by another is how the boundary became ambiguous.
   */
  const cmpRecord = (a, b) => {
    const d = (Number(a.at) || 0) - (Number(b.at) || 0);
    if (d) return d;
    const x = String(a.vendorId || ''), y = String(b.vendorId || '');
    return x < y ? -1 : x > y ? 1 : 0;
  };
  /** Is `r` strictly before the boundary `(before, beforeId)`? With no
   *  `beforeId` the whole equal-`at` group is at-or-after — the old, lossy
   *  behaviour, kept ONLY so a caller that cannot name a boundary record still
   *  gets a terminating page rather than an infinite one. */
  function ordersBefore(r, before, beforeId) {
    const a = Number(r.at) || 0, b = Number(before) || 0;
    if (a !== b) return a < b;
    if (beforeId === null || beforeId === undefined || beforeId === '') return false;
    return String(r.vendorId || '') < String(beforeId);
  }

  /**
   * The newest `limit` records, oldest-first by `(at, vendorId)`, optionally
   * strictly BEFORE a boundary record (the window's paging).
   *
   * IT SEEKS BACKWARD, ONE `TAIL_BYTES` WINDOW AT A TIME, UNTIL IT HAS ENOUGH
   * (r3). The r2 reader read the LAST window once and filtered by the
   * boundary, so once the window's paging walked past 2 MiB every page came
   * back empty and the window just stopped — while `trim()` deliberately kept
   * the records (5,000 / 90 days), so at the retention cap the oldest were
   * unreachable BY CONSTRUCTION for any average record over ~419 bytes.
   * Measured: 3,000 ordinary chat lines, 2.28 MiB, `trim` keeps all 3,000,
   * the window reaches 2,625. That is the r2 ⑤ class one layer down ("the
   * bytes are on disk and the user can never scroll back to them"), and it
   * also meant the DEDUP SET, rebuilt from the same reader, forgot everything
   * older than the window — a replayed old page past 2 MiB would have been
   * appended twice.
   *
   * A window's bytes are read at a byte offset, so its first line may be the
   * TAIL of a line that began in the earlier window: those bytes are carried
   * as BYTES (never decoded alone — a UTF-8 sequence can straddle the cut) and
   * joined onto the earlier window before it is decoded. The walk stops as
   * soon as `limit` candidates are in hand or byte 0 is reached, so the
   * window's own page (no boundary, 50 records) still costs one window, and
   * the whole file is read only by a caller that asks for more than a window
   * holds — the dedup rebuild and `countSince`, whose answer is about the
   * whole log. Ordering is exact within what was read; a record filed more
   * than a window out of `at` order is the one shape this cannot see, and
   * the r2 reader could not either.
   */
  function readTail(adapterId, convId, { limit = 50, before = null, beforeId = null, strict = false } = {}) {
    const fp = logPath(adapterId, convId);
    const want = Math.max(1, limit);
    const out = [];
    let fd;
    // For a READER a log that cannot be read is an EMPTY read (ENOENT is the
    // routine "no log yet", and a render that shows nothing for one tick
    // self-heals). Under `strict` (r5 — the dedup rebuild, the one caller
    // whose answer WRITES bytes) only ENOENT is empty; every other error is
    // thrown, because an unreadable log is not an empty one.
    try { fd = fs.openSync(fp, 'r'); } catch (e) { if (strict && e.code !== 'ENOENT') throw e; return []; }
    try {
      const size = fs.fstatSync(fd).size;
      let end = size;
      let carry = Buffer.alloc(0);   // the head fragment of the LATER window's first line
      while (end > 0 && out.length < want) {
        const start = Math.max(0, end - TAIL_BYTES);
        const buf = Buffer.allocUnsafe(end - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        let chunk = carry.length ? Buffer.concat([buf, carry]) : buf;
        if (start > 0) {
          // never serve half a line: everything before the first newline may
          // continue a line that began earlier — hand it to the next window
          const nl = chunk.indexOf(0x0a);
          carry = nl < 0 ? chunk : chunk.subarray(0, nl);
          chunk = nl < 0 ? Buffer.alloc(0) : chunk.subarray(nl + 1);
        } else carry = Buffer.alloc(0);
        for (const line of chunk.toString('utf-8').split('\n')) {
          if (!line) continue;
          let r; try { r = JSON.parse(line); } catch { continue; }
          if (before !== null && !ordersBefore(r, before, beforeId)) continue;
          out.push(r);
        }
        end = start;
      }
    } catch (e) { if (strict) throw e; return []; } finally { try { fs.closeSync(fd); } catch {} }
    out.sort(cmpRecord);
    // lane lark-threads (A1): every READ serves the record as its place patches make it; the strict reader (the dedup
    // rebuild) reads the bytes as written — the door judges an offer against the stored copy AND the patches apart
    return strict ? out.slice(-want) : patched(adapterId, convId, out.slice(-want));
  }

  /** readTail's ASYNC twin (lane queued-is-not-woke laws 2 + 3, shape C — the wait reading's log read, OFF THE LOOP): the same backward window
   *  walk, order and patches, through a FileHandle — no synchronous call. An unreadable log throws (never an empty read):
   *  its caller says nothing until it can read. `maxBytes` bounds what it reads and `windowBytes` each window (the wait
   *  reading: 64 KB windows, 256 KB in all — every parse a small slice of the loop). → {records, whole: it reached the start} */
  async function readTailAsync(adapterId, convId, { limit = 50, maxBytes = Infinity, windowBytes = TAIL_BYTES } = {}) {
    const fp = logPath(adapterId, convId);
    const want = Math.max(1, limit);
    const out = [];
    let fh;
    try { fh = await fs.promises.open(fp, 'r'); } catch (e) { if (e && e.code === 'ENOENT') return { records: [], whole: true }; throw e; }
    let end = 0;
    try {
      end = (await fh.stat()).size;
      let carry = Buffer.alloc(0), read = 0;
      while (end > 0 && out.length < want && read < maxBytes) {
        const start = Math.max(0, end - Math.max(1, Math.min(windowBytes, maxBytes - read)));
        read += end - start;
        const buf = Buffer.allocUnsafe(end - start);
        await fh.read(buf, 0, buf.length, start);
        let chunk = carry.length ? Buffer.concat([buf, carry]) : buf;
        if (start > 0) {
          const nl = chunk.indexOf(0x0a);
          carry = nl < 0 ? chunk : chunk.subarray(0, nl);
          chunk = nl < 0 ? Buffer.alloc(0) : chunk.subarray(nl + 1);
        } else carry = Buffer.alloc(0);
        for (const line of chunk.toString('utf-8').split('\n')) {
          if (!line) continue;
          let r; try { r = JSON.parse(line); } catch { continue; }
          out.push(r);
        }
        end = start;
      }
    } finally { try { await fh.close(); } catch {} }
    out.sort(cmpRecord);
    return { records: patched(adapterId, convId, out.slice(-want)), whole: end <= 0 };
  }

  /**
   * ONE record by its `vendorId` (R3 §23 — the attachment route names the
   * message that carries the picture): the same backward window walk as
   * `readTail`, but it stops at the FIRST window that holds the id and parses
   * only the line whose bytes name it — so a picture in the visible tail
   * costs one window, and one older than the newest 5000 records is still
   * found. `null` when no line names it (or the log is unreadable: a reader).
   */
  /** lane webhook-l1-server: THE ONE REWRITE OF STORED RECORDS (record-clear's `channel-webhook` door) — `fn(record)`
   *  answers the replacement (or null = unchanged) for each record whose vendorId is named; the log is rewritten whole
   *  (tmp + rename, like `trim`). `{changed: [ids], unknown: [ids]}`. */
  function rewriteRecords(adapterId, convId, vendorIds, fn) {
    if (goneAccounts.has(adapterId)) return { changed: 0, unknown: [], gone: true };   // 主开发 r2878: a purged account's log is never renamed back
    const want = new Set((Array.isArray(vendorIds) ? vendorIds : []).map(String));
    const fp = logPath(adapterId, convId);
    let lines;
    try { lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean); } catch { return { changed: [], unknown: [...want] }; }
    const seen = new Set(), changed = [];
    const out = lines.map((l) => {
      const id = recVendorId(l);
      if (!id || !want.has(id)) return l;
      seen.add(id);
      let r; try { r = JSON.parse(l); } catch { return l; }
      const next = fn(r);
      if (!next) return l;
      changed.push(id);
      return JSON.stringify(next);
    });
    if (changed.length) {
      const tmp = `${fp}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, out.join('\n') + '\n');
      fs.renameSync(tmp, fp);
      wrote(adapterId, convId, { kind: 'rewrite' });
    }
    return { changed, unknown: [...want].filter((x) => !seen.has(x)) };
  }
  function findRecord(adapterId, convId, vendorId) {
    const id = String(vendorId || '');
    if (!id) return null;
    const needle = Buffer.from(`"vendorId":${JSON.stringify(id)}`, 'utf-8');
    const fp = logPath(adapterId, convId);
    let fd;
    try { fd = fs.openSync(fp, 'r'); } catch { return null; }
    try {
      const size = fs.fstatSync(fd).size;
      let end = size;
      let carry = Buffer.alloc(0);
      while (end > 0) {
        const start = Math.max(0, end - TAIL_BYTES);
        const buf = Buffer.allocUnsafe(end - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        let chunk = carry.length ? Buffer.concat([buf, carry]) : buf;
        if (start > 0) {
          const nl = chunk.indexOf(0x0a);
          carry = nl < 0 ? chunk : chunk.subarray(0, nl);
          chunk = nl < 0 ? Buffer.alloc(0) : chunk.subarray(nl + 1);
        } else carry = Buffer.alloc(0);
        let at = chunk.lastIndexOf(needle);
        while (at >= 0) {
          const ls = chunk.lastIndexOf(0x0a, at) + 1;
          let le = chunk.indexOf(0x0a, at); if (le < 0) le = chunk.length;
          try { const r = JSON.parse(chunk.subarray(ls, le).toString('utf-8')); if (r && String(r.vendorId) === id) return patchedOne(adapterId, convId, r); } catch {}
          at = ls > 0 ? chunk.lastIndexOf(needle, ls - 1) : -1;
        }
        end = start;
      }
    } catch { return null; } finally { try { fs.closeSync(fd); } catch {} }
    return null;
  }

  /** How many records in the log are newer than `sinceAt` (the unread
   *  re-derivation — invariant 7: cached in the index, never only there).
   *  `keep` (lane channel-self-unread): the caller's predicate — the engine
   *  passes "not the owner's own message" (src/channel-focus.js selfRead). */
  function countSince(adapterId, convId, sinceAt, keep = null) {
    let n = 0;
    for (const r of readTail(adapterId, convId, { limit: DEDUP_MAX })) if (Number(r.at) > Number(sinceAt || 0) && (!keep || keep(r))) n++;
    return n;
  }

  /**
   * Retention (invariant 5). Streams the survivors to a temp file and renames.
   * Returns `{ removed, kept }`; a log that does not exist is `{0,0}`.
   */
  function trim(adapterId, convId, { days = RETENTION_DAYS, maxRecords = RETENTION_MAX_RECORDS, floorDays = RETENTION_FLOOR_DAYS } = {}) {
    if (goneAccounts.has(adapterId)) return { removed: 0, kept: 0, side: null, gone: true };   // r2878
    const fp = logPath(adapterId, convId);
    let lines;
    try { lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean); } catch (e) {
      // B-f276 (unknown is never an orphan): only a MISSING log is «no log» — a read that failed trims nothing (said)
      if (!e || e.code !== 'ENOENT') { warn(`[channels] ${adapterId}/${convId}: its message log could not be read (${(e && e.code) || (e && e.message)}) — nothing trimmed, its side log kept`); return { removed: 0, kept: 0, side: null, unread: true }; }
      // no message log: a side line for a conversation that never got one is "message gone" (attack 13)
      let side = null;
      try { side = trimSide(adapterId, convId, { liveIds: new Set() }); } catch { }
      return { removed: 0, kept: 0, side };
    }
    const cutoff = retentionCutoff(lines, { days, maxRecords, floorDays });
    const kept = lines.filter((l) => recAtKept(l) >= cutoff);   // B-f276 (s1126): a line that does not parse is kept through any cutoff
    // lane lark-threads (A1): THE PLACE PATCHES ARE FOLDED INTO THE LINES the trim keeps (the rewrite this trim may do
    // anyway) — the message line then carries the place itself and its side line goes (after the rename, never before:
    // a crash between the two leaves the patch applied twice, which is a no-op)
    const pm = placesOf(adapterId, convId);
    const folded = new Set();
    let refolded = 0;
    const keep = pm.size ? kept.map((l) => {
      const id = recVendorId(l);
      const pl = id ? pm.get(id) : null;
      if (!pl) return l;
      folded.add(id);
      try { const r = JSON.parse(l); const a = Thr.applyPlace(r, pl); if (a === r) return l; refolded++; return JSON.stringify(a); } catch { return l; }
    }) : kept;
    // lane channel-threads: the SIDE log shares the trim — a message dropped here drops its side lines, and each kept
    // message's side lines are compacted (invariant 8: ≤ 2 lines per message after a trim)
    const liveIds = new Set();
    for (const l of keep) { const id = recVendorId(l); if (id) liveIds.add(id); }
    const sideTrim = () => { try { return trimSide(adapterId, convId, { liveIds, folded }); } catch (e) { warn('[channels] side-log trim failed:', (e && e.message) || e); return null; } };
    if (keep.length === lines.length && !refolded) { const side = sideTrim(); if (side && side.removed) wrote(adapterId, convId, { kind: 'trim' }); return { removed: 0, kept: keep.length, side, folded: folded.size }; }
    const tmp = `${fp}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, keep.length ? keep.join('\n') + '\n' : '');
    fs.renameSync(tmp, fp);
    dropDedup(`${adapterId}/${convId}`);
    const side = sideTrim();
    wrote(adapterId, convId, { kind: 'trim' });
    return { removed: lines.length - keep.length, kept: keep.length, side, folded: folded.size };
  }
  /** the retention cutoff over a log's lines: a record older than it is dropped */
  function retentionCutoff(lines, { days, maxRecords, floorDays }) {
    const t = now();
    const byDays = t - days * 86400e3;
    // "whichever is smaller" = the LATER cutoff of the two bounds…
    const byCount = lines.length > maxRecords ? recAt(lines[lines.length - maxRecords]) : -Infinity;
    // …and the floor then pulls it back: nothing newer than `floorDays` is ever dropped.
    return Math.min(Math.max(byDays, byCount), t - floorDays * 86400e3);
  }
  /** B-0248 row 8 (主开发 r3322): THE TRIM's READ OFF THE LOOP — the engine's two roads (the poll's ingest, the push batch) ask
   *  this one. The message log is read on the thread pool. Under both bounds with no place patch to fold, nothing is dropped and
   *  the log is not rewritten: only the side log's compaction runs (its bounded tail window), every message's lines kept (a
   *  message appended after the read may already have its reactions there). Past a bound, or with a patch to fold, the rewrite is
   *  `trim`'s (it reads the log again under the loop, so what was appended meanwhile is kept), at most once every TRIM_EVERY_MS a
   *  conversation by the engine's gate. A read that fails trims nothing and is said; a missing log is `trim`'s own case. */
  async function trimAsync(adapterId, convId, { days = RETENTION_DAYS, maxRecords = RETENTION_MAX_RECORDS, floorDays = RETENTION_FLOOR_DAYS } = {}) {
    const fp = logPath(adapterId, convId);
    let text;
    try { text = await fs.promises.readFile(fp, 'utf-8'); } catch (e) {
      if (e && e.code === 'ENOENT') return closed ? { removed: 0, kept: 0, side: null } : trim(adapterId, convId, { days, maxRecords, floorDays });
      warn(`[channels] ${adapterId}/${convId}: its message log could not be read off the loop (${(e && e.code) || (e && e.message)}) — not trimmed now, its side log kept`);   // its own words: trim's sentence is the store census's anchor (once)
      return { removed: 0, kept: 0, side: null, unread: true };
    }
    if (closed) return { removed: 0, kept: 0, side: null };
    const lines = text.split('\n').filter(Boolean);
    const cutoff = retentionCutoff(lines, { days, maxRecords, floorDays });
    if (placesOf(adapterId, convId).size || lines.some((l) => recAtKept(l) < cutoff)) return trim(adapterId, convId, { days, maxRecords, floorDays });   // a torn line asks no trim (kept by it)
    let side = null;
    try { side = trimSide(adapterId, convId, { liveIds: null }); } catch (e) { warn('[channels] side-log trim failed:', (e && e.message) || e); }
    if (side && side.removed) wrote(adapterId, convId, { kind: 'trim' });
    return { removed: 0, kept: lines.length, side, folded: 0 };
  }
  function recVendorId(line) { try { const v = JSON.parse(line).vendorId; return v ? String(v) : null; } catch { return null; } }
  function recAt(line) { try { const n = Number(JSON.parse(line).at); return Number.isFinite(n) ? n : 0; } catch { return 0; } }
  /** B-f276 (lane bl-loop-a, s1126): a line's time for the RETENTION's keep — a line that does not parse is kept by every cutoff
   *  (Infinity): the trim never drops what it cannot read */
  function recAtKept(line) { try { const n = Number(JSON.parse(line).at); return Number.isFinite(n) ? n : 0; } catch { return Infinity; } }

  /**
   * BACKFILL (2026-09-26, history on demand): records OLDER than the log's
   * oldest, fetched when the window scrolls past the local start. Appending
   * them at the end would file them out of `(at, vendorId)` order — the one
   * shape `readTail`'s backward walk cannot page past a 2 MiB window — so the
   * log is REWRITTEN once (temp + rename, the `trim` shape) with the new
   * records merged in order. Dedup as always; the dedup set learns them only
   * after the rename (invariant 2). Bounded by retention, so the rewrite is
   * a few MB at most. Returns `{appended, duplicates}`.
   */
  function prependRecords(adapterId, convId, records) {
    if (goneAccounts.has(adapterId)) return { appended: 0, duplicates: 0, widened: [], gone: true };   // B-92fc
    const list = Array.isArray(records) ? records : [];
    const set = dedupSet(adapterId, convId);
    const inBatch = new Set();
    const fresh = [];
    let duplicates = 0;
    const offers = [];   // lane lark-threads (A1): an older page's copy of a stored message that names a place
    for (const r of list) {
      if (!r || !r.vendorId) continue;
      if (set.has(r.vendorId) || inBatch.has(r.vendorId)) { duplicates++; if (set.has(r.vendorId) && (r.threadKey || r.root)) offers.push(r); continue; }
      inBatch.add(r.vendorId);
      fresh.push(r);
    }
    const widened = offers.length ? widenQuiet(adapterId, convId, offers, { src: placeSrcOf(records) }) : [];
    if (!fresh.length) return { appended: 0, duplicates, widened };
    const fp = logPath(adapterId, convId);
    fs.mkdirSync(path.dirname(fp), { recursive: true, mode: 0o700 });
    // B-f276 family (lane bl-loop-a, slice s1126, 主开发 r4781 / r4906): THE REWRITE KEEPS EVERY LINE — a read that fails (an EIO) throws:
    // held, the log untouched; a line that does not parse (a crash mid-write, a bad byte) is KEPT AS IT IS IN ITS PLACE: right after the
    // parsed line that stood before it in the file (before any parsed line: first), several in their own order, its text as the log
    // reads it (UTF-8, as every reader) — so the only copy of a message stays beside the neighbours that date it; the readers skip it,
    // as before. The retention trim keeps it in its place too (recAtKept). Never dropped (the decision journal's rule, r3739)
    let lines = [];
    try { lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }
    const head = [], olds = [];   // each parsed line with the lines that do not parse right after it; before any parsed line: head
    for (const l of lines) { let r; try { r = JSON.parse(l); } catch { (olds.length ? olds[olds.length - 1].torn : head).push(l); continue; } olds.push({ r, torn: [] }); }
    const merged = olds.concat(fresh.map((r) => ({ r, torn: [] }))).sort((a, b) => cmpRecord(a.r, b.r));
    const out = head.slice();
    for (const x of merged) { out.push(JSON.stringify(x.r)); for (const t of x.torn) out.push(t); }
    const tmp = `${fp}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, out.join('\n') + '\n');
    fs.renameSync(tmp, fp);
    for (const r of fresh) rememberVendorId(set, r.vendorId);
    { const bp = basePlaces.get(`${adapterId}/${convId}`); if (bp) for (const r of fresh) notePlace(bp, r); }
    wrote(adapterId, convId, { kind: 'prepend', fresh });
    return { appended: fresh.length, duplicates, widened };
  }

  // ── THE SIDE LOG (invariant 8, lane channel-threads) ─────────────────────
  const sidePath = (adapterId, convId) => path.join(msgsDir, safeSeg(adapterId), SIDE_DIR, `${safeSeg(convId)}.ndjson`);
  const sideDedup = new Map();   // `${adapterId}/${convId}` -> Set<sideKey>
  /** verify r2 (MONEY / the event loop): a compaction that FAILED (its temp write or rename refused) is not retried per
   *  event — `${adapterId}/${convId}` → the file size it failed at; the next attempt waits for SIDE_KEEP_BYTES more
   *  appends (amortized O(1), like a working one). Before: every append re-read the whole growing file for another
   *  doomed attempt (measured with the temp path refused: 6 ms / 2 MiB per event at 1 MiB, 21 ms / 6 MiB at 4 MiB). */
  const sideCompactFailedAt = new Map();
  /** The side lines of a conversation in its READ WINDOW (the newest SIDE_READ_BYTES — verify r2: every side read is
   *  a bounded window, never the whole file; a line before the window is invisible to every reader, so the dedup set
   *  and a compaction fold exactly what readers see), parsed (a line that does not parse is skipped, like `readTail`).
   *  STRICT (the dedup rebuild — the one reader whose answer writes bytes): only ENOENT is empty (invariant 2's r5). */
  function sideWindow(adapterId, convId, { strict = false } = {}) {
    let tail;
    try { tail = sideTail(sidePath(adapterId, convId), SIDE_READ_BYTES, { strict }); } catch (e) { if (strict) throw e; return { lines: [], cut: false }; }
    if (!tail) return { lines: [], cut: false };
    const out = [];
    for (const line of tail.text.split('\n')) { if (!line) continue; try { out.push(JSON.parse(line)); } catch { } }
    return { lines: out, cut: !!tail.cut };
  }
  function sideLines(adapterId, convId, opts = {}) { return sideWindow(adapterId, convId, opts).lines; }
  function sideDedupSet(adapterId, convId) {
    const k = `${adapterId}/${convId}`;
    let s = sideDedup.get(k);
    if (s) return s;
    s = new Set();
    for (const r of sideLines(adapterId, convId, { strict: true })) s.add(sideKey(r));
    sideDedup.set(k, s);
    return s;
  }
  /**
   * APPEND side records (each already `validateSide`d by the caller), dropping the ones the side log holds
   * (`sideKey` — a vendor's redelivered event is a no-op). The set remembers only AFTER the bytes are durable
   * (invariant 2's r2) and is DROPPED when the write throws (r4). → `{appended, duplicates, msgs}`.
   */
  function appendSide(adapterId, convId, sides) {
    if (goneAccounts.has(adapterId)) return { appended: 0, duplicates: 0, msgs: [], gone: true };   // B-92fc
    const list = Array.isArray(sides) ? sides : [];
    const set = sideDedupSet(adapterId, convId);
    const inBatch = new Set();
    const fresh = [];
    let duplicates = 0;
    for (const x of list) {
      if (!x || typeof x !== 'object' || !x.msg) continue;
      const k = sideKey(x);
      if (set.has(k) || inBatch.has(k)) { duplicates++; continue; }
      inBatch.add(k);
      fresh.push(x);
    }
    if (!fresh.length) return { appended: 0, duplicates, msgs: [] };
    const fp = sidePath(adapterId, convId);
    fs.mkdirSync(path.dirname(fp), { recursive: true, mode: 0o700 });
    try { appendLines(fp, fresh.map((x) => JSON.stringify(x)).join('\n') + '\n'); }
    catch (e) { sideDedup.delete(`${adapterId}/${convId}`); throw e; }
    for (const x of fresh) { set.add(sideKey(x)); if (set.size > SIDE_DEDUP_MAX) { const it = set.values(); for (let i = set.size - SIDE_DEDUP_MAX; i > 0; i--) set.delete(it.next().value); } }
    const msgs = [...new Set(fresh.map((x) => String(x.msg)))];
    // GROWTH IS BOUNDED WHERE IT HAPPENS (verify r1): past SIDE_COMPACT_BYTES the log is compacted in place — every
    // message's lines fold into one snapshot (+ its newest thread stat), whatever storm wrote them. verify r2: a
    // compaction that failed is re-attempted only SIDE_KEEP_BYTES of appends later (never once per event)
    let compacted = null;
    const ck = `${adapterId}/${convId}`;
    let size = 0;
    try { size = fs.statSync(fp).size; } catch { size = 0; }
    const failedAt = sideCompactFailedAt.get(ck);
    if (size > SIDE_COMPACT_BYTES && !(failedAt !== undefined && size < failedAt + SIDE_KEEP_BYTES)) {
      try { compacted = trimSide(adapterId, convId, { liveIds: null }); sideCompactFailedAt.delete(ck); }
      catch (e) { sideCompactFailedAt.set(ck, size); warn(`[channels] side-log compaction of ${ck} failed at ${Math.round(size / 1024)} KiB (retried after ${Math.round(SIDE_KEEP_BYTES / 1024)} KiB more): ${(e && e.message) || e}`); }
    }
    wrote(adapterId, convId, { kind: 'side', msgs });
    return { appended: fresh.length, duplicates, msgs, ...(compacted ? { compacted } : {}) };
  }
  // ── THE PLACE DOOR (lane lark-threads A1, 2026-10-01) ──────────────────────────────────────────────────────
  // The owner's post: a Lark message stored before anyone answered it IN A THREAD carries no thread id, and the log's
  // dedup keeps that first copy for ever — a later vendor copy that names the thread (the chat listing re-read, the
  // thread walk's repeated root, a by-id read) was thrown away, so the root never headed its topic. THE ONE DOOR that
  // WIDENS a stored record's place: `threadKey` null → the vendor's key, `root` null → the vendor's root — never the
  // reverse, never any other field (src/channel-thread.js P1–P4). Written like a reaction: ONE side line per widening
  // (`{k:'pl', msg, threadKey, root}`, deduped by its content), folded on EVERY read (`readTail`, `findRecord`,
  // `oldestRecord`, `search`), folded INTO the message line at the log's own trim (then the side line goes), kept by the
  // side compaction (never forgotten like an old reaction). The write hook says `{kind:'place', patched}` so the
  // engine's caches and windows re-derive.
  const placeCache = new Map();   // `${adapterId}/${convId}` → Map<vendorId, {threadKey, root}> (the folded pl lines)
  /** verify r1 F5: the conversations whose door already SAID a conflicting thread id once (bounded). */
  const saidConflict = new Set();
  /** The conversation's folded place patches (cached; an empty map when it has none). */
  function placesOf(adapterId, convId) {
    const k = `${adapterId}/${convId}`;
    let m = placeCache.get(k);
    if (m) { placeCache.delete(k); placeCache.set(k, m); return m; }
    let lines = [];
    try { lines = sideLines(adapterId, convId).filter((x) => x && x.k === 'pl'); } catch { lines = []; }
    m = Thr.foldPlaces(lines);
    placeCache.set(k, m);
    while (placeCache.size > PLACE_CACHE_MAX) placeCache.delete(placeCache.keys().next().value);
    return m;
  }
  /** A page of records as their patches make them (a new object only where a patch widens one). */
  function patched(adapterId, convId, recs) {
    if (!recs.length) return recs;
    recs = recs.map(asSystemRecord).map(asDraftRecord);   // lane lark-system-records: a notice stored before `kind` existed, re-judged at read (no migration); a Gmail draft likewise (lane gmail-draft-not-a-message)
    const m = placesOf(adapterId, convId);
    if (!m.size) return recs;
    return recs.map((r) => (r && r.vendorId && m.has(String(r.vendorId)) ? Thr.applyPlace(r, m.get(String(r.vendorId))) : r));
  }
  const patchedOne = (adapterId, convId, r) => (r ? patched(adapterId, convId, [r])[0] : r);
  /** Where a batch of offers came from (the side line's `src`): the caller's word, else the chat listing. */
  const placeSrcOf = (records) => (records && typeof records === 'object' && typeof records.placeSrc === 'string' ? records.placeSrc : 'history');
  /**
   * THE DOOR. `offers` = vendor copies of messages (records, or `{vendorId, threadKey, root}`) — only a message the
   * log holds (the dedup set: its newest DEDUP_MAX) is judged, against its STORED place and its patches (the effective
   * place); a widening is ONE validated side line. → `{widened: [{vendorId, threadKey, root}], unknown: [vendorId],
   * conflicts: [{vendorId, stored, offered}]}` (`unknown` = not a stored message — the caller ingests it normally;
   * `conflicts` = a copy naming another thread than the stored one, refused and said once). Throws only when the side write fails (the
   * offer is then made again by the next copy the vendor answers).
   */
  function widenPlaces(adapterId, convId, offers, { src = 'history' } = {}) {
    const set = dedupSet(adapterId, convId);
    const k = `${adapterId}/${convId}`;
    const bp = basePlaces.get(k) || new Map();
    const pm = placesOf(adapterId, convId);
    const sides = [], widened = [], unknown = [], conflicts = [];
    const inCall = new Map();   // a message offered twice in one call: the second judged against the first's widening
    const at = now();
    for (const o of Array.isArray(offers) ? offers : []) {
      const vid = String((o && o.vendorId) || '');
      if (!vid) continue;
      if (!set.has(vid)) { if (!unknown.includes(vid)) unknown.push(vid); continue; }
      const base = bp.get(vid) || { threadKey: null, root: null, replyTo: null };
      const p = inCall.get(vid) || pm.get(vid);
      const cur = { threadKey: base.threadKey || (p && p.threadKey) || null, root: base.root || (p && p.root) || null, replyTo: base.replyTo || null };
      const w = Thr.widenPlace(cur, { threadKey: o.threadKey || null, root: o.root || null }, vid);
      if (!w) {
        // verify r1 F5: a copy naming ANOTHER thread for a message that already heads one is refused (P1: never changed) and
        // SAID — once per conversation per process, never silently: a vendor correction nobody can apply, or a foreign copy
        if (cur.threadKey && Thr.placeIdOk(o.threadKey) && o.threadKey !== cur.threadKey) conflicts.push({ vendorId: vid, stored: cur.threadKey, offered: o.threadKey });
        continue;
      }
      const v = validateSide({ k: 'pl', msg: vid, at, src, threadKey: w.threadKey, root: w.root });
      if (!v.ok) continue;
      sides.push(v.side);
      widened.push({ vendorId: vid, threadKey: v.side.threadKey, root: v.side.root });
      inCall.set(vid, { threadKey: cur.threadKey || v.side.threadKey, root: cur.root || v.side.root });
    }
    if (conflicts.length && !saidConflict.has(k)) {
      saidConflict.add(k); if (saidConflict.size > 2000) saidConflict.delete(saidConflict.values().next().value);
      warn(`[channels] ${k}: ${conflicts.length} stored message(s) were offered a DIFFERENT thread id than the one they head (e.g. ${conflicts[0].vendorId}: stored ${String(conflicts[0].stored).slice(0, 64)}, offered ${String(conflicts[0].offered).slice(0, 64)}, src ${src}) — a stored place is never changed (widen-only); said once per conversation`);
    }
    if (!sides.length) return { widened: [], unknown, conflicts };
    appendSide(adapterId, convId, sides);   // durable first (it throws on a failed write — nothing below runs)
    const m = placesOf(adapterId, convId);  // re-read after a compaction the append may have run; then folded in place
    for (const x of widened) { const c = m.get(x.vendorId) || { threadKey: null, root: null }; m.set(x.vendorId, { threadKey: c.threadKey || x.threadKey, root: c.root || x.root }); }
    wrote(adapterId, convId, { kind: 'place', patched: widened.map((x) => ({ ...x })) });
    return { widened, unknown, conflicts };
  }
  /** The append paths' use of the door: a failed side write is LOGGED, never the append's failure (its records are
   *  durable already; the next vendor copy offers the widening again). */
  function widenQuiet(adapterId, convId, offers, opts) {
    try { return widenPlaces(adapterId, convId, offers, opts).widened; } catch (e) { warn(`[channels] ${adapterId}/${convId}: a place patch could not be written (offered again by the next copy): ${(e && e.message) || e}`); return []; }
  }

  /** The newest `maxBytes` of a side log as text (a partial first line dropped) — never the whole file. `strict`: an
   *  open error other than ENOENT throws (the dedup rebuild's r5 rule); otherwise it reads as no log. */
  function sideTail(fp, maxBytes, { strict = false } = {}) {
    let fd;
    try { fd = fs.openSync(fp, 'r'); } catch (e) { if (strict && e.code !== 'ENOENT') throw e; return null; }
    try {
      const size = fs.fstatSync(fd).size;
      if (size <= maxBytes) { const b = Buffer.allocUnsafe(size); const n = fs.readSync(fd, b, 0, size, 0); return { text: b.toString('utf-8', 0, n), cut: false }; }
      const b = Buffer.allocUnsafe(maxBytes);
      const n = fs.readSync(fd, b, 0, maxBytes, size - maxBytes);
      const t = b.toString('utf-8', 0, n);
      const nl = t.indexOf('\n');
      return { text: nl >= 0 ? t.slice(nl + 1) : '', cut: true };
    } finally { try { fs.closeSync(fd); } catch { } }
  }
  /** The `"msg":"<id>"` of a side line, read off its head without parsing the body (the line begins
   *  `{"k":"rx","msg":` — `validateSide` builds it in that order). Linear: one bounded string match. */
  const SIDE_HEAD_RE = /^\{"k":"(?:rx|th|pl|fx|rv)","msg":("(?:[^"\\]|\\.){1,1100}")/;   // + fx (lane message-facts); + rv (lane channel-record-revisions)
  /**
   * The side records naming `msgs` (a Set of vendorIds), in FILE order (append order), at most `limit` — the
   * newest are kept when there are more. A line naming another message is skipped WITHOUT parsing its body.
   */
  function readSide(adapterId, convId, { msgs = null, limit = SIDE_READ_MAX, maxBytes = SIDE_READ_BYTES } = {}) {
    const tail = sideTail(sidePath(adapterId, convId), Math.max(64 * 1024, Number(maxBytes) || SIDE_READ_BYTES));
    if (!tail) return [];
    const text = tail.text;
    const want = msgs instanceof Set ? msgs : (Array.isArray(msgs) ? new Set(msgs.map(String)) : null);
    const out = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      if (want) {
        const m = SIDE_HEAD_RE.exec(line);
        if (!m) continue;
        let id; try { id = JSON.parse(m[1]); } catch { continue; }
        if (!want.has(id)) continue;
      }
      try { out.push(JSON.parse(line)); } catch { }
    }
    return out.length > limit ? out.slice(out.length - limit) : out;
  }
  /**
   * THE SIDE LOG'S TRIM (inside `trim()`, and the growth compaction past SIDE_COMPACT_BYTES): the lines of a message
   * no longer in the message log are DROPPED, and each kept message's lines are COMPACTED by the PURE `compactSide`
   * (its reactions folded into ONE snapshot, its newest thread stat kept). verify r1 (continued): the OUTPUT is
   * ordered by each message's LAST line (the most recently changed last — the read window is the file's tail) and
   * bounded to SIDE_KEEP_BYTES: the least recently changed messages are forgotten (`forgotten`), so a compacted log
   * never outgrows the read window and the next compaction is SIDE_KEEP_BYTES of appends away. Temp + rename.
   */
  function trimSide(adapterId, convId, { liveIds, folded = null } = {}) {
    if (goneAccounts.has(adapterId)) return { removed: 0, kept: 0, forgotten: 0, gone: true };   // r2878
    const { lines, cut } = sideWindow(adapterId, convId);
    if (!lines.length && !cut) return { removed: 0, kept: 0, forgotten: 0 };
    const byMsg = new Map();
    const last = new Map();   // message → the index of its newest line (its last change)
    const places = [];        // lane lark-threads (A1): place lines — never forgotten like a reaction (folded into the log at its trim)
    lines.forEach((x, i) => {
      if (!x || !x.msg || (liveIds && !liveIds.has(String(x.msg)))) return;
      if (x.k === 'pl') { if (!(folded && folded.has(String(x.msg)))) places.push(x); return; }
      const k = String(x.msg);
      if (!byMsg.has(k)) byMsg.set(k, []);
      byMsg.get(k).push(x);
      last.set(k, i);
    });
    const order = [...byMsg.keys()].sort((a, b) => last.get(a) - last.get(b));
    const groups = order.map((k) => compactSide(byMsg.get(k)).concat(compactFactLines(byMsg.get(k))).concat(compactVersionLines(byMsg.get(k))).map((x) => JSON.stringify(x)));   // + a message's facts, folded (lane message-facts)
    // the newest groups first, until the bound (one group is always kept — a single message's lines are ≤ 8 KiB each)
    let from = groups.length, bytes = 0;
    for (let i = groups.length - 1; i >= 0; i--) {
      const b = groups[i].reduce((n, t) => n + Buffer.byteLength(t) + 1, 0);
      if (from < groups.length && bytes + b > SIDE_KEEP_BYTES) break;
      bytes += b; from = i;
    }
    // the place lines LAST (the newest bytes of the file — the read window is its tail), one per message, bounded
    const keep = groups.slice(from).flat().concat(Thr.compactPlaces(places, PLACE_KEEP_MAX).map((x) => JSON.stringify(x)));
    // (a file longer than the read window is always rewritten — its head is invisible to every reader: verify r2)
    if (keep.length === lines.length && from === 0 && !cut) return { removed: 0, kept: keep.length, forgotten: 0 };
    const fp = sidePath(adapterId, convId);
    const tmp = `${fp}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, keep.length ? keep.join('\n') + '\n' : '');
    fs.renameSync(tmp, fp);
    sideDedup.delete(`${adapterId}/${convId}`);
    placeCache.delete(`${adapterId}/${convId}`);
    if (from > 0) log.log && log.log(`[channels] ${adapterId}/${convId}: the side log keeps the ${groups.length - from} most recently changed messages' reactions (${Math.round(bytes / 1024)} KiB); ${from} older folds forgotten — a window that shows them reads them again`);
    return { removed: lines.length - keep.length, kept: keep.length, forgotten: from };
  }
  /**
   * WHICH CONVERSATION HOLDS A MESSAGE (lane channel-threads: Lark's reaction event names the message, never the
   * chat — vendor fact L10). Reads the account's logs off the event loop with a byte cap, like `search`; parses
   * only a line whose bytes name the id. → convId | null.
   */
  async function locateMessage(adapterId, vendorId, { maxBytes = 64 * 1024 * 1024 } = {}) {
    const id = String(vendorId || '');
    if (!id) return null;
    const needle = `"vendorId":${JSON.stringify(id)}`;
    const dirA = path.join(msgsDir, safeSeg(adapterId));
    let names = [];
    try { names = await fs.promises.readdir(dirA); } catch { return null; }
    let scanned = 0;
    for (const n of names) {
      if (!n.endsWith('.ndjson')) continue;
      const fp = path.join(dirA, n);
      let st; try { st = await fs.promises.stat(fp); } catch { continue; }
      if (scanned + st.size > maxBytes) break;
      let text; try { text = await fs.promises.readFile(fp, 'utf-8'); } catch { continue; }
      scanned += st.size;
      const at = text.indexOf(needle);
      if (at < 0) continue;
      const ls = text.lastIndexOf('\n', at) + 1;
      let le = text.indexOf('\n', at); if (le < 0) le = text.length;
      try { const r = JSON.parse(text.slice(ls, le)); if (r && String(r.vendorId) === id && r.convId) return String(r.convId); } catch { }
    }
    return null;
  }
  /** The oldest stored record of a conversation (the backfill boundary). */
  function oldestRecord(adapterId, convId) {
    const fp = logPath(adapterId, convId);
    let fd;
    try { fd = fs.openSync(fp, 'r'); } catch { return null; }
    try {
      const size = fs.fstatSync(fd).size;
      const buf = Buffer.allocUnsafe(Math.min(size, 64 * 1024));
      fs.readSync(fd, buf, 0, buf.length, 0);
      for (const line of buf.toString('utf-8').split('\n')) { if (!line) continue; try { return patchedOne(adapterId, convId, JSON.parse(line)); } catch { continue; } }
      return null;
    } catch { return null; } finally { try { fs.closeSync(fd); } catch {} }
  }

  /**
   * SEARCH ONE ACCOUNT'S LOGS (2026-09-26): async, chunked by file, with a
   * BYTE cap and a result cap — never a synchronous read of a mailbox's
   * worth of NDJSON on the event loop. A line is parsed only when its raw
   * bytes already contain the query (lower-cased), then the record's text /
   * author is checked for real. Newest first; `truncated` when a cap was hit.
   *
   * design 010 (B-c9be, lane channels-full-search): the logs are visited NEWEST CONVERSATION FIRST (the index's
   * `lastAt`; a log the index does not name goes last) — the byte cap used to cut in `readdir` order, so on a big
   * account WHICH conversations were searched was chance; now the cap cuts the oldest. The answer says what it
   * covered: `coverage = {scanned, total, capped, oldestAt}` (conversations read / eligible, whether the BYTE cap
   * cut, the oldest instant the read logs reach — each log's first line is its oldest record).
   *
   * EVERY WORD (lane channels-search-says-hidden, a field miss 2026-10-21: «Wren NID» found nothing while each word
   * alone hit — the whole query was ONE substring): the query's words (split on white space) match a record holding
   * EVERY one of them, each ANYWHERE — its text, its author's name, an attachment's name, or its conversation's TITLE
   * (the index's; a mail thread's subject). One word = the substring it always was, the title now beside the text.
   */
  // B-360d FOUND HOLDER 3 (lane bl-loop-b, 主开发 r4581 / r4582): THE SEARCH's ORDER AND ITS WANTED TEST FROM THE ACCOUNT's LOG FILES.
  // The release made two passes over the whole ACCOUNT in one turn before it read a log: every id it was handed mapped to a file
  // name, and every row of the account mapped to its file for the newest-first order (lane bl-loop-a's heavy stand-in, 173 306 rows
  // and 50 logs: one turn of 325 to 379 ms on the box). Here each log file finds its own row. A log's name is its conversation id run
  // through safeSeg, which escapes every character outside [A-Za-z0-9._@:+-] as % and its hex (the % sign too): a name with no % IS
  // its id, and a name with % is read back to EVERY id that escapes to it (an escape is 2, 3 or 4 hex digits by its character's size,
  // so one name can have several readings; each is kept only if it escapes back to the same name). The read-back is exact for ANY id;
  // what makes it cheap is that most kinds' ids carry no such character — Slack's ([A-Z0-9_]), a webhook's slug ([a-z0-9-]) and the
  // fake's names are held to the safe set by their own code; Lark's chat ids, Gmail's thread ids and the agents' session ids are taken
  // as the vendor sends them (its format, never a check here: a Lark search hit may carry «=»), so a name of theirs that escapes costs
  // its readings, or the counted fallback (holder 3's follow: test-channel-search §H's census pins each kind's line). Its row is the key
  // `adapterId/id` (entry()'s own key), and then the rows whose key is
  // not their account's (oddKeys, as keysOf answers them: after the account's own, as the release read them). The caller's list is
  // read into a Set once and each file asks it once; a file outside it is never opened. The loop is given back every LOG_STEP files
  // and every WANT_STEP ids; the per-account map (for the odd rows) is awaited in its slices, never built whole here on a big index.
  // A name with more than SEG_IDS_MAX readings, or one log two rows of the account escape to, takes the release's pass for this
  // search, counted (searchStats.fallback). Nothing else of the search changed: its directory read, its order, its scan, its answer
  // (holder 3's follow, the round's shoulds): an id in the CALLER's list that safeSeg refuses ('', '.', '..', a slash, a backslash,
  // a NUL, null) rejects the whole search by safeSeg's own words, as the release's name map did; a ROW whose id safeSeg refuses (only
  // a damaged act line makes one, and it has no log) is passed over on EVERY road — the release's pass threw on it and refused the
  // account's whole search; here the main road, the fallback and the odd rows agree
  const LOG_STEP = 2000, WANT_STEP = 10000, SEG_IDS_MAX = 64;
  const searchStats = { searches: 0, files: 0, rowsRead: 0, fallback: 0 };
  const SAFE_CH = /^[A-Za-z0-9._@:+-]$/, HEX_DIGITS = /^[0-9a-f]+$/;
  /** every id `x` with safeSeg(x) === seg (null when there are more than SEG_IDS_MAX) */
  function segIds(seg) {
    const out = [];
    const walk = (i, acc) => {
      if (out.length > SEG_IDS_MAX) return;
      if (i === seg.length) { if (acc !== '' && acc !== '.' && acc !== '..') out.push(acc); return; }
      const c = seg[i];
      if (c !== '%') { if (SAFE_CH.test(c)) walk(i + 1, acc + c); return; }
      for (let L = 2; L <= 4; L++) {
        const h = seg.slice(i + 1, i + 1 + L);
        if (h.length !== L || !HEX_DIGITS.test(h)) break;
        const code = parseInt(h, 16);
        if ((L === 3 && code < 0x100) || (L === 4 && code < 0x1000)) continue;   // its digits are its character's size (padStart(2) below 0x100)
        if (code === 0 || code === 0x2f || code === 0x5c) continue;   // a NUL, a slash or a backslash is no id safeSeg takes
        const ch = String.fromCharCode(code);
        if (SAFE_CH.test(ch)) continue;   // a safe character is never escaped
        walk(i + 1 + L, acc + ch);
      }
    };
    walk(0, '');
    return out.length > SEG_IDS_MAX ? null : out;
  }
  const turnBack = () => new Promise((r) => setImmediate(r));
  const segName = (id) => { try { return `${safeSeg(id)}.ndjson`; } catch { return null; } };   // a row's log name; null for an id safeSeg refuses (a damaged row: passed over on every road)
  async function logFilesOf(adapterId, all, convIds) {
    searchStats.searches++;
    let want = null;
    if (convIds) { want = new Set(); let i = 0; for (const c of convIds) { safeSeg(c); want.add(String(c)); if (++i % WANT_STEP === 0) await turnBack(); } }   // safeSeg(c): the release's refusal of an unsafe id, kept (O(list))
    if (!byAcct) { acctWarmStart(); await keysReady(); if (!byAcct) keysOf(adapterId); }   // the odd rows: a big index's map in its slices; a small one at once, as keysOf builds it
    const conv = ix.conversations, lastAtOf = new Map(), titleOf = new Map(), names = [];
    let fallback = false, wantNames = null;
    const wanted = (n) => { if (!wantNames) wantNames = new Set([...want].map((c) => `${safeSeg(c)}.ndjson`)); return wantNames.has(n); };   // the release's test (only for a fallback name)
    for (let i = 0; i < all.length; i++) {
      if (i && i % LOG_STEP === 0) await turnBack();
      const n = all[i];
      if (!n.endsWith('.ndjson')) continue;
      const ids = segIds(n.slice(0, -'.ndjson'.length));
      if (ids === null) { fallback = true; if (!want || wanted(n)) names.push(n); continue; }
      if (want && !ids.some((c) => want.has(c))) continue;   // not the caller's: never opened
      names.push(n); searchStats.files++;
      let rows = 0;
      for (const c of ids) {
        const key = `${adapterId}/${c}`, en = hasOwn(conv, key) ? conv[key] : null;
        searchStats.rowsRead++;
        if (!en || en.adapterId !== adapterId || en.id == null || String(en.id) !== c) continue;
        if (++rows > 1) { fallback = true; break; }
        lastAtOf.set(n, Number(en.lastAt) || 0); if (en.title) titleOf.set(n, String(en.title).toLowerCase());
      }
    }
    if (fallback) {   // the release's pass, counted: every row of the account mapped to its file
      searchStats.fallback++; lastAtOf.clear(); titleOf.clear();
      for (const k of keysOf(adapterId)) { const en = ix.conversations[k]; const n = en && en.adapterId === adapterId && en.id != null ? segName(en.id) : null; if (n) { lastAtOf.set(n, Number(en.lastAt) || 0); if (en.title) titleOf.set(n, String(en.title).toLowerCase()); } }
      return { names, lastAtOf, titleOf };
    }
    for (const k of oddKeys.keys()) { const en = conv[k]; if (en && en.adapterId === adapterId && en.id != null) { searchStats.rowsRead++; const n = segName(en.id); if (!n) continue; lastAtOf.set(n, Number(en.lastAt) || 0); if (en.title) titleOf.set(n, String(en.title).toLowerCase()); } }   // after the account's own (the release's order); .keys(): the odd keys' Set, or a Map of their slots, read alike
    return { names, lastAtOf, titleOf };
  }
  async function search(adapterId, q, { limit = 100, maxBytes = 64 * 1024 * 1024, convIds = null, match = null } = {}) {
    // lane notify-rules-r2 (the Notify… dialog's preview): `match` = a RECORD predicate (a watcher rule, judged by the
    // PURE filter) in place of the text check — `q`, when given beside it, stays the raw-bytes pre-check; `matched`
    // counts every hit inside the bytes read (the dialog's "showing 10 of N"), not only the kept ones
    const needle = String(q || '').trim().toLowerCase();
    const pred = typeof match === 'function' ? match : null;
    const words = [...new Set(needle.split(/\s+/).filter(Boolean))];
    const none = { results: [], scannedBytes: 0, truncated: false, files: 0, matched: 0, coverage: { scanned: 0, total: 0, capped: false, oldestAt: null } };
    if (!needle && !pred) return none;
    const dir = path.join(msgsDir, safeSeg(adapterId));
    let names = [];
    try { names = await fs.promises.readdir(dir); } catch { return none; }
    // NEWEST CONVERSATION FIRST (design 010): the index's lastAt per log file, read-only (no copy, no touch) — B-360d found holder 3:
    // the order and the caller's wanted test both read from the account's LOG FILES, never from its rows (logFilesOf, above)
    const lf = await logFilesOf(adapterId, names, convIds);
    names = lf.names;
    const { lastAtOf, titleOf } = lf;
    names.sort((a, b) => (lastAtOf.has(b) - lastAtOf.has(a)) || ((lastAtOf.get(b) || 0) - (lastAtOf.get(a) || 0)) || (a < b ? -1 : a > b ? 1 : 0));
    let scanned = 0, truncated = false, files = 0, capped = false, oldestAt = null, matched = 0;
    const hits = [];
    for (const n of names) {
      const fp = path.join(dir, n);
      let st; try { st = await fs.promises.stat(fp); } catch { continue; }
      if (scanned + st.size > maxBytes) { truncated = true; capped = true; break; }
      let text; try { text = await fs.promises.readFile(fp, 'utf-8'); } catch { continue; }
      scanned += st.size; files++;
      { const nl = text.indexOf('\n'); try { const r0 = JSON.parse(nl < 0 ? text : text.slice(0, nl)); const a0 = Number(r0 && r0.at); if (a0 > 0 && (oldestAt === null || a0 < oldestAt)) oldestAt = a0; } catch { } }
      // EVERY WORD: the ones the conversation's title already holds need not be on the line (the raw-bytes pre-check)
      const title = titleOf.get(n) || '';
      const rest = pred ? [] : words.filter((w) => !title.includes(w));
      for (const line of text.split('\n')) {
        if (!line) continue;
        if (pred ? needle && !line.toLowerCase().includes(needle) : rest.length && !((low) => rest.every((w) => low.includes(w)))(line.toLowerCase())) continue;
        let r; try { r = JSON.parse(line); } catch { continue; }
        if (pred) { const rr = r.convId ? patchedOne(adapterId, String(r.convId), r) : r; let ok = false; try { ok = !!pred(rr); } catch { ok = false; } if (ok) { matched++; hits.push(rr); } continue; }
        const hay = `${r.text || ''}\n${(r.author && (r.author.name || '')) || ''}\n${(r.attachments || []).map((a) => (a && a.role !== 'body' ? a.name : '')).join(' ')}`.toLowerCase();
        if (rest.every((w) => hay.includes(w))) { matched++; hits.push(r.convId ? patchedOne(adapterId, String(r.convId), r) : r); }
      }
      if (hits.length > limit * 4) { hits.sort((a, b) => cmpRecord(b, a)); hits.length = limit * 2; }
    }
    hits.sort((a, b) => cmpRecord(b, a));
    if (hits.length > limit) truncated = true;
    return { results: hits.slice(0, limit), scannedBytes: scanned, truncated, files, matched, coverage: { scanned: files, total: names.length, capped, oldestAt } };
  }

  // ── ATTACHMENTS, fetched on demand, LRU per ACCOUNT (2026-09-26) ─────────
  const attRoot = path.join(dir, OWN_FOLDERS.attachments);
  const attHash = (id) => crypto.createHash('sha1').update(String(id)).digest('hex');
  const attDir = (adapterId, convId) => path.join(attRoot, safeSeg(adapterId), safeSeg(convId));
  const lruFile = (adapterId) => path.join(attRoot, safeSeg(adapterId), 'lru.json');
  const lruCache = new Map();   // adapterId -> ledger (read once, written atomically)
  // 主开发 r2819: the accounts purged in THIS process — every late write of theirs refuses (an ask, a fetch or a pass that began
  // before the purge and lands after it makes nothing again); cleared when an adapter record with that id is written again
  const goneAccounts = new Set();
  const purging = new Map();   // 主开发 r2878: id → its purge's promise (a re-add clears the gone mark only after it settles)
  const purgeSeq = new Map();   // adapterId -> how many times its local copy was purged (主开发 r2557 (2): an async read across a purge answers nothing)
  // B-f276 family (主开发 r3183 / r3188): THE LEDGER IS REBUILT FROM THE FOLDER. It decides the account's size bound (the eviction sums the
  // LEDGER) and the card's footprint; the release read any failure as «nothing stored» and the next put wrote it over — every file it
  // counted orphaned for good (never evicted, never counted). The folder is the truth (each cached file has its `<hash>.json` meta:
  // bytes, at). A ledger that cannot be read, does not parse, or was written by an earlier version (no `v: 2` — the release's
  // written-over ledgers among them) is REBUILT once at its first use: OFF the loop, over that one account's folder, LRU_REBUILD_READS
  // metas read at a time. Meanwhile a new file is admitted and counted in memory, the ledger is NOT saved and NOTHING is evicted
  // (under-evicting for a minute is fine, evicting from a part of the truth is not); at its landing what the folder holds is merged in
  // (what was admitted meanwhile wins) and the ledger saved once. A meta that is missing or does not parse is counted by its file's own
  // size, said once, never removed by the rebuild. THE REBUILD REMOVES NO FILE (r2943). r3279: a WHOLE walk is the truth (an entry
  // whose file is not there leaves); a walk that could not list every folder is UNFINISHED (lruUnfinished below)
  const LRU_V = 2;
  const LRU_REBUILD_READS = 8;
  const LRU_RETRY_MS = 30e3, LRU_RETRY_MAX_MS = 15 * 60e3;   // r3279 (7): a walk that did not end whole is tried again after a wait that doubles
  const lruRebuilding = new Map();   // adapterId → its rebuild in flight (one an account)
  // r3279 (6) + (7): an account whose ledger is NOT its folder's whole truth (a rebuild owed or in flight, a walk that could not list every
  // folder): nothing is evicted from it, it is saved without its `v: 2`, it is walked again at a later use once its wait passed, and a
  // failed walk is said ONCE an account
  const lruUnfinished = new Map();   // adapterId → { tries, retryAt, said, why }
  const lruAdmitted = new Map();     // adapterId → Set(key) admitted while its rebuild ran (they win at the merge, never pruned by it)
  const lruOk = (v) => !!v && typeof v === 'object' && !!v.items && typeof v.items === 'object' && !Array.isArray(v.items);
  /** the ledger from its read's answer (`{text}` | `{error}`), cached; a rebuild started when it cannot be taken as it is */
  function lruAnswer(adapterId, read) {
    let v = null;
    if (read && typeof read.text === 'string') { try { v = JSON.parse(read.text); } catch { v = null; } }
    const good = lruOk(v);
    const l = good ? v : { v: 1, items: {} };
    lruCache.set(adapterId, l);
    if (!good || Number(v.v) !== LRU_V) {
      const why = read && read.error ? (read.error.code === 'ENOENT' ? 'missing' : `unreadable (${read.error.code || 'error'})`) : good ? 'written by an earlier version' : 'torn';
      lruUnfinished.set(adapterId, { tries: 0, retryAt: 0, said: false, why }); lruStartRebuild(adapterId, why);
    }
    return l;
  }
  /** r3279 (7): a later use of an unfinished ledger walks it again once its wait passed (never at every hit) */
  function lruRetry(adapterId) {
    const u = lruUnfinished.get(adapterId);
    if (u && !closed && !lruRebuilding.has(adapterId) && now() >= u.retryAt) lruStartRebuild(adapterId, u.why || 'unfinished');
  }
  const lruAdmit = (adapterId, key) => { const a = lruAdmitted.get(adapterId); if (a) a.add(key); };
  function lruOf(adapterId) {
    const l = lruCache.get(adapterId);
    if (l) { lruRetry(adapterId); return l; }
    let read;
    try { read = { text: fs.readFileSync(lruFile(adapterId), 'utf-8') }; } catch (error) { read = { error }; }
    return lruAnswer(adapterId, read);
  }
  /** the account's cached files from its folder, off the loop → { found: { key: {bytes, usedAt} }, bad, failed } | null (purged / closed
   *  meanwhile). `failed`: a conversation's folder that could not be listed (r3279 (6): the walk is UNFINISHED, never the truth) */
  async function lruWalk(adapterId, ep) {
    const root = path.join(attRoot, safeSeg(adapterId));
    let convs = [];
    try { convs = (await fs.promises.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }
    const jobs = [];
    let failed = null;
    for (const c of convs) {
      let names = [];
      try { names = await fs.promises.readdir(path.join(root, c)); } catch (e) { if (!e || e.code !== 'ENOENT') failed = failed || (e && e.code) || 'error'; continue; }
      for (const nm of names) if (!nm.endsWith('.json') && !nm.includes('.tmp-')) jobs.push([c, nm]);
    }
    const found = {};
    let bad = 0;
    for (let i = 0; i < jobs.length; i += LRU_REBUILD_READS) {
      if (closed || (purgeSeq.get(adapterId) || 0) !== ep) return null;
      await Promise.all(jobs.slice(i, i + LRU_REBUILD_READS).map(async ([c, nm]) => {
        const f = path.join(root, c, nm);
        let meta = null;
        try { meta = JSON.parse(await fs.promises.readFile(f + '.json', 'utf-8')); } catch { meta = null; }
        if (meta && typeof meta === 'object' && Number.isFinite(Number(meta.bytes))) { found[`${c}/${nm}`] = { bytes: Number(meta.bytes), usedAt: Number(meta.at) || 0 }; return; }
        try { const st = await fs.promises.stat(f); if (st.isFile()) { found[`${c}/${nm}`] = { bytes: st.size, usedAt: Math.round(st.mtimeMs) || 0 }; bad++; } } catch (e) { if (!e || e.code !== 'ENOENT') failed = failed || (e && e.code) || 'error'; }   // line 743's should: a file that could not be ASKED is no gone file — the walk is unfinished (item 6's rule), its entry never pruned
      }));
    }
    return { found, bad, failed };
  }
  function lruStartRebuild(adapterId, why) {
    if (lruRebuilding.has(adapterId)) return lruRebuilding.get(adapterId);
    const ep = purgeSeq.get(adapterId) || 0;
    if (!lruUnfinished.has(adapterId)) lruUnfinished.set(adapterId, { tries: 0, retryAt: 0, said: false, why });
    lruAdmitted.set(adapterId, new Set());
    const p = lruWalk(adapterId, ep).then((r) => {
      if (lruRebuilding.get(adapterId) !== p) return;   // r3279 (10): the account was forgotten meanwhile — a later rebuild owns its state
      lruRebuilding.delete(adapterId);   // ended, whatever it found
      const admitted = lruAdmitted.get(adapterId) || new Set();
      lruAdmitted.delete(adapterId);
      if (!r || closed || (purgeSeq.get(adapterId) || 0) !== ep) return;
      const l = lruCache.get(adapterId);
      if (!l) return;
      let added = 0, pruned = 0;
      for (const [k, x] of Object.entries(r.found)) if (!l.items[k]) { l.items[k] = x; added++; }   // in place: what was admitted meanwhile wins
      // r3279 (9): the only strays are the store's own — a blob whose meta write never landed (a crash between its rename and its meta)
      if (r.bad) warn(`[channels] ${adapterId}: ${r.bad} cached attachment(s) have a meta that is missing or does not parse — counted by their own size, evictable like any cached file`);
      if (r.failed) { lruLater(adapterId, `${r.failed}: a conversation's folder could not be listed`); return; }   // r3279 (6): UNFINISHED — counted what could be read
      // r3279 (8): a WHOLE walk — the folder is the truth: an entry whose file is not there leaves (never one admitted meanwhile)
      for (const k of Object.keys(l.items)) if (!r.found[k] && !admitted.has(k)) { delete l.items[k]; pruned++; }
      lruUnfinished.delete(adapterId);
      l.v = LRU_V;
      if (added || pruned || why !== 'missing') warn(`[channels] ${adapterId}: the attachment ledger (lru.json) ${why} — rebuilt from the folder: ${Object.keys(r.found).length} cached file(s), ${added} put back in the count${pruned ? `, ${pruned} entry(ies) with no file left` : ''}`);
      if (Object.keys(l.items).length || pruned) { lruDirty.add(adapterId); lruTouch(adapterId); }   // saved ONCE, by the ledger's own coalesced flush (never a second synchronous write site)
    }).catch((e) => { if (lruRebuilding.get(adapterId) === p) lruRebuilding.delete(adapterId); if ((purgeSeq.get(adapterId) || 0) !== ep) return; lruAdmitted.delete(adapterId); lruLater(adapterId, (e && e.code) || (e && e.message) || String(e)); });
    lruRebuilding.set(adapterId, p);
    return p;
  }
  /** r3279 (6) + (7): a walk that did not end WHOLE — the ledger stays unfinished (what it holds kept, nothing evicted, saved without its
   *  mark), its next walk after a wait that doubles (30 s → 15 min), said ONCE an account */
  function lruLater(adapterId, why) {
    const u = lruUnfinished.get(adapterId) || { tries: 0, retryAt: 0, said: false, why: 'unfinished' };
    u.tries++;
    u.retryAt = now() + Math.min(LRU_RETRY_MAX_MS, LRU_RETRY_MS * 2 ** (u.tries - 1));
    if (!u.said) { u.said = true; warn(`[channels] ${adapterId}: the attachment ledger could not be rebuilt whole from its folder (${why}) — what could be read is counted, nothing is evicted and it is not saved as the truth until a walk lists every folder (tried again later)`); }
    lruUnfinished.set(adapterId, u);
    const l = lruCache.get(adapterId);
    if (l && Object.keys(l.items).length) lruDirty.add(adapterId);
  }
  // r3188: never saved while it is rebuilt (its landing saves once) — but at the store's CLOSE a ledger still being rebuilt is
  // saved UNFINISHED (no `v: 2`): what was admitted meanwhile is kept, and the next first use rebuilds it again (never taken as the truth)
  // B-0248 row 5 (主开发 r3322; lane bl-loop-b's page): THE LEDGER IS OWED TO THE STORE WRITER — it was a rewrite through a rename on
  // the main thread at each mail with an HTML body and 5 s after a picture was shown. Now its thread makes the account's folder (0700)
  // and writes the ledger (0600, temp + rename) off the loop; a failed write is the writer's (said, retried, never a throw here); the
  // store's close writes what is owed at once (owe's writeNow). The BYTES are made when the writer takes them: the ledger as it is
  // then, its «unfinished» mark (no `v: 2`) read at that moment; a forgotten account's answers nothing (its write forgotten too)
  function lruSave(adapterId) {
    lruOf(adapterId);
    if (lruRebuilding.has(adapterId) && !closed) { lruDirty.add(adapterId); return; }
    lruDirty.delete(adapterId);
    if (goneAccounts.has(adapterId)) return;   // 主开发 r2819: a purged account's ledger is never written again
    const file = lruFile(adapterId);
    owe(file, { name: 'channels-lru.write', produce: () => lruBytes(adapterId), mode: 0o600, makeDir: true });
  }
  /** the ledger's bytes for ONE write (the writer's `produce`, on the main thread): null = nothing to write (a forgotten account) */
  function lruBytes(adapterId) {
    if (goneAccounts.has(adapterId)) return null;
    const l = lruCache.get(adapterId);
    if (!l) return null;
    l.v = lruUnfinished.has(adapterId) ? 1 : LRU_V;   // UNFINISHED (a rebuild in flight at a close, a walk that failed): saved without its mark
    return JSON.stringify(l, RUNTIME_KEYS, 1);   // writeJsonAtomic's own bytes
  }
  /** A cache HIT only moves a recency stamp (R3 §23): the ledger is written
   *  COALESCED — once per LRU_TOUCH_MS per account, and on close — never once
   *  per thumbnail drawn (a window of 40 pictures was 40 sync atomic writes on
   *  data/, which may sit on a slow mount). A lost stamp costs only eviction
   *  order, never a file. */
  const LRU_TOUCH_MS = 5000;
  const lruDirty = new Set();
  let lruTimer = null;
  function lruFlush() {
    if (lruTimer) { clearTimeout(lruTimer); lruTimer = null; }
    for (const id of [...lruDirty]) { if (lruRebuilding.has(id) && !closed) continue; try { lruSave(id); } catch (e) { warn('[channels] attachment LRU write failed:', (e && e.message) || e); } }
  }
  function lruTouch(adapterId) {
    lruDirty.add(adapterId);
    if (closed) { lruFlush(); return; }
    if (!lruTimer) { lruTimer = setTimeout(lruFlush, LRU_TOUCH_MS); if (lruTimer.unref) lruTimer.unref(); }
  }
  // lane channel-avatars (B-5fe1): A PERSON'S PICTURE, memoised beside the account — data/channels/<account>/avatars/
  // <sha1(author)> (the bytes, 0600) + .json (`{at, mime, bytes}` for a picture, `{code, error, until}` for a refusal
  // the vendor answered: "no picture", a refused scope). ONE fetch per author per account per channel-avatars REFRESH_MS;
  // bounded by its route (≤ 256 KiB each) — no LRU: one small file per person the account's messages name.
  const avDir = (adapterId) => path.join(dir, safeSeg(adapterId), 'avatars');
  function avatarGet(adapterId, author) {
    const file = path.join(avDir(adapterId), attHash(author));
    let meta;
    try { meta = JSON.parse(fs.readFileSync(file + '.json', 'utf-8')); } catch { return null; }
    if (!meta || typeof meta !== 'object') return null;
    if (meta.code) return { file: null, meta };
    try { fs.statSync(file); } catch { return null; }
    return { file, meta };
  }
  async function avatarPut(adapterId, author, { data, mime }) {
    // B-92fc (主开发 r2819): a picture fetch that began before a purge and lands after it makes nothing — refused at its start
    // and after each wait, what it made taken away again
    const gone = async () => { if (!goneAccounts.has(adapterId)) return false; try { await fs.promises.rm(path.join(dir, safeSeg(adapterId)), { recursive: true, force: true }); } catch { } return true; };
    if (goneAccounts.has(adapterId)) return null;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data || '');
    const d = avDir(adapterId);
    await fs.promises.mkdir(d, { recursive: true, mode: 0o700 });
    if (await gone()) return null;
    const file = path.join(d, attHash(author));
    const tmp = `${file}.tmp-${process.pid}-${++attSeq}`;
    await fs.promises.writeFile(tmp, buf, { mode: 0o600 });
    if (await gone()) return null;
    await fs.promises.rename(tmp, file);
    if (await gone()) return null;
    const meta = { at: now(), mime: String(mime || '').slice(0, 64), bytes: buf.length };
    writeJsonAtomic(file + '.json', meta, { mode: 0o600 });
    return { file, meta };
  }
  function avatarRefuse(adapterId, author, { code, error = '', until }) {
    if (goneAccounts.has(adapterId)) return null;   // B-92fc
    const d = avDir(adapterId);
    fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    const meta = { code: String(code).slice(0, 64), error: String(error || '').slice(0, 300), until: Number(until) || 0, at: now() };
    writeJsonAtomic(path.join(d, attHash(author)) + '.json', meta, { mode: 0o600 });
    return { file: null, meta };
  }
  /** lane channels-list-polish: THE ACCOUNT'S PEOPLE MEMO (`<account>/people.json`, beside `avatars/`) — who the account
   *  IS (`self`, a resolved id) and what each author was named by (`people[id]` = {name, member, sender, alt, at, until,
   *  why}) — so a restart does not forget them. Written whole by the adapter (bounded there), read through a cache. */
  const peopleCache = new Map();
  // B-f276 family (主开发 r3183 / r3188): THE PEOPLE MEMO UNDER THE STORE-READ LAW (src/store-read-hold.js), one hold an account. Its
  // own id and the names it learned are no cache: a read that FAILED is HELD — read as UNKNOWN (never «nobody»), nothing written over
  // it (peopleWrite asks writable; a read-modify-write waits — peopleUpdate), read again off the loop, and at its LIFT taken in and
  // handed to the account's hooks (the adapter's copy merges, the engine settles what it indexed meanwhile). Torn bytes are kept aside
  // once, then it starts empty: nobody removes by its silence (avatars are keyed by the author, never by the memo)
  const peopleShape = (v) => (v && typeof v === 'object' ? { self: typeof v.self === 'string' && v.self.length <= 128 ? v.self : null, people: v.people && typeof v.people === 'object' && !Array.isArray(v.people) ? v.people : {} } : { self: null, people: {} });
  const PEOPLE_OK = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const peopleHolds = new Map();     // adapterId → its hold (made at the account's first read)
  const peopleQueued = new Map();    // adapterId → [fn] the read-modify-writes waiting for its lift, in order
  const peopleLiftHooks = new Map(); // adapterId → Set(fn(memo)) told at its lift
  function peopleRead(adapterId) {
    if (peopleCache.has(adapterId)) return peopleCache.get(adapterId);
    const file = path.join(dir, safeSeg(adapterId), 'people.json');
    const H = SRH.create({ file, valid: PEOPLE_OK, code: 'channel_people_unread', aside: (mark) => `${file}.corrupt-${mark}`, now,
      words: (h) => `the account's people memo could not be read (${h.code}) — its own id and the names it learned are unknown until it reads; nothing is written over it, and it is read again by itself`,
      log: (m) => warn(`[channels] ${adapterId}: ${m}`), onLift: (v) => peopleLifted(adapterId, v) });
    peopleHolds.set(adapterId, H);
    let read;
    try { read = { text: fs.readFileSync(file, 'utf-8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: PEOPLE_OK });
    const out = H.start(a) === 'data' ? peopleShape(a.value) : { self: null, people: {} };
    peopleCache.set(adapterId, out);
    return out;
  }
  /** the account's people memo is HELD now (its read failed): its own id is UNKNOWN, not absent */
  function peopleHeld(adapterId) { const H = peopleHolds.get(adapterId); return !!(H && H.held()); }
  /** a READ-MODIFY-WRITE of the memo (the webhook's caller names): held, it WAITS and lands merged at the lift — never written from the
   *  held stand-in over the file's other entries. → true applied now, false waiting */
  function peopleUpdate(adapterId, fn) {
    const cur = peopleRead(adapterId);
    if (peopleHeld(adapterId)) { const q = peopleQueued.get(adapterId) || []; q.push(fn); peopleQueued.set(adapterId, q); return false; }
    peopleWrite(adapterId, fn({ self: cur.self, people: { ...cur.people } }));
    return true;
  }
  /** a hook told at the memo's lift with the memo taken in (the adapter's copy, the engine's settle) → its remover */
  function onPeopleLift(adapterId, fn) {
    if (typeof fn !== 'function') return () => { };
    let s = peopleLiftHooks.get(adapterId);
    if (!s) { s = new Set(); peopleLiftHooks.set(adapterId, s); }
    s.add(fn);
    return () => s.delete(fn);
  }
  function peopleLifted(adapterId, v) {
    if (closed) return;
    let out = peopleShape(v);
    peopleCache.set(adapterId, out);
    const q = peopleQueued.get(adapterId) || [];
    peopleQueued.delete(adapterId);
    for (const fn of q) { try { out = peopleShape(fn({ self: out.self, people: { ...out.people } })); } catch (e) { warn(`[channels] ${adapterId}: a people-memo change waiting for its read was not applied: ${(e && e.message) || e}`); } }
    if (q.length) peopleWrite(adapterId, out);
    for (const fn of [...(peopleLiftHooks.get(adapterId) || [])]) { try { fn(peopleCache.get(adapterId)); } catch (e) { warn(`[channels] ${adapterId}: a people-memo lift hook threw: ${(e && e.message) || e}`); } }
  }
  // channel-store-off-loop (commit 1): PACED — the names an adapter learned (re-learned after a loss); the writer's thread
  // makes the account's directory (0700) when it is new — the field's 75 s were that mkdir on the main thread. Cure r1: ONLY
  // the doors that ask for it (`makeDir`: this one, and since B-360d r1360 the vendor-search and feed-miss memos) — every other
  // store whose directory is gone fails its write ENOENT, said, as before
  const peopleFile = (adapterId) => path.join(dir, safeSeg(adapterId), 'people.json');
  function peopleWrite(adapterId, memo) {
    if (goneAccounts.has(adapterId)) return { self: null, people: {} };   // B-92fc: nothing owed for a purged account
    peopleRead(adapterId);   // its first read made (the hold known before any write)
    const H = peopleHolds.get(adapterId);
    if (H && !H.writable(`the people memo of ${adapterId}`)) return null;   // r3188: HELD — nothing written over it (the caller keeps its copy; the lift takes it in)
    const out = { self: memo && typeof memo.self === 'string' ? memo.self : null, people: memo && memo.people && typeof memo.people === 'object' ? memo.people : {} };
    peopleCache.set(adapterId, out);
    const file = peopleFile(adapterId);
    owe(file, { name: 'channels-people.write', produce: () => (peopleCache.has(adapterId) ? JSON.stringify(peopleCache.get(adapterId), RUNTIME_KEYS, 1) : null), mode: 0o600, makeDir: true });
    return out;
  }
  /** lane search-card-open (.233): THE ACCOUNT'S VENDOR-SEARCH MEMO (`<account>/search-memo.json`, beside people.json) —
   *  what the vendor's own search answered (SR.memoToDisk's shape, bounded there: 64 entries / 2 MiB), so a restart
   *  does not forget it. Written whole (0600, atomic) by the engine on each remembered answer; read once at its first
   *  use; DROPPED with the account (a disconnect, a removal — the engine's dropLive). */
  const searchMemoFile = (adapterId) => path.join(dir, safeSeg(adapterId), 'search-memo.json');
  // B-360d r1360 (the owner's hub's loop-hold digest, 2026-11-21: 3 holds were this door's mkdir at a vendor search, on
  // the data folder's network share): THE TWO MEMOS ARE OWED TO THE STORE WRITER (its thread makes the account's directory
  // — `makeDir`, the people door's road), their truth in memory meanwhile (a read answers the owed memo); a drop forgets
  // an owed write (one in flight lands, then the file is unlinked again on the writer's thread — a dropped memo never
  // comes back), then unlinks, as before. The first read of an account's memo is still the file's (once a process).
  // its read (M6): a DROP leaves a TOMBSTONE (null) — a write in flight may land its rename after the unlink and before the
  // writer's own unlink: a read meanwhile answers null (never the dropped memo), and a new memo replaces the tombstone
  const memoHeld = new Map();   // file → the memo object the writer owes (or wrote) · null = dropped
  const memoBytes = (file) => () => { const v = memoHeld.get(file); return v ? JSON.stringify(v, RUNTIME_KEYS, 1) : null; };
  // B-f276 family (主开发 r3183 / r3188: THE TWO MEMOS ARE DERIVED — lost, the next vendor answer rebuilds them and nothing of the
  // person's is lost; lane bl-loop-a, slice s1126, r4781): a MISSING memo is none (the first answer writes it); an UNREADABLE or TORN
  // one is none too — the next remembered answer writes a fresh memo, as the ruling allows — but SAID, once a failing stretch of a
  // file, with its code (a good read clears the mark: the next failure is said again, r4906)
  const memoSaid = new Set();
  const memoSay = (file, why) => { if (memoSaid.has(file)) return; memoSaid.add(file); warn(`[channels] ${path.basename(path.dirname(file))}/${path.basename(file)} could not be read (${why}) — a derived memo: read as none, the next answer writes it again`); };
  function memoRead(file) {
    if (memoHeld.has(file)) return memoHeld.get(file);
    let text;
    try { text = fs.readFileSync(file, 'utf-8'); } catch (e) { if (!e || e.code !== 'ENOENT') memoSay(file, (e && e.code) || 'unreadable'); return null; }
    try { const v = JSON.parse(text); memoSaid.delete(file); return v; } catch { memoSay(file, 'torn'); return null; }   // read again: a later failure is said again (r4906)
  }
  const memoForget = (file) => { memoHeld.set(file, null); try { W().forget(file); } catch { } };   // before the unlink
  function searchMemoRead(adapterId) {
    if (!safeSeg(adapterId)) return null;
    return memoRead(searchMemoFile(adapterId));
  }
  function searchMemoWrite(adapterId, obj) {
    if (!safeSeg(adapterId)) return false;
    if (goneAccounts.has(adapterId)) return false;   // B-92fc
    const file = searchMemoFile(adapterId);
    memoHeld.set(file, obj);
    owe(file, { name: 'channels-search-memo.write', produce: memoBytes(file), mode: 0o600, makeDir: true });
    return true;
  }
  function searchMemoDrop(adapterId) {
    if (!safeSeg(adapterId)) return false;
    memoForget(searchMemoFile(adapterId));
    try { fs.unlinkSync(searchMemoFile(adapterId)); return true; } catch { return false; }
  }
  /** lane lark-search-miss: THE CHANGE FEED'S MISS MEMO (`<account>/feed-misses.json`, beside search-memo.json) — the
   *  named misses (src/channel-feed.js `memoAdd`'s rows, ≤ 500, no text). Written whole (0600, atomic) when a miss is
   *  named; read once at first use (`Feed.memoFromDisk` bounds it); DROPPED with the account. */
  const feedMissFile = (adapterId) => path.join(dir, safeSeg(adapterId), 'feed-misses.json');
  function feedMissRead(adapterId) {
    if (!safeSeg(adapterId)) return null;
    return memoRead(feedMissFile(adapterId));
  }
  function feedMissWrite(adapterId, obj) {   // B-360d r1360, ALSO CURED: the search memo's twin (the same mkdir + atomic write)
    if (!safeSeg(adapterId)) return false;
    if (goneAccounts.has(adapterId)) return false;   // B-92fc
    const file = feedMissFile(adapterId);
    memoHeld.set(file, obj);
    owe(file, { name: 'channels-feed-miss.write', produce: memoBytes(file), mode: 0o600, makeDir: true });
    return true;
  }
  function feedMissDrop(adapterId) {
    if (!safeSeg(adapterId)) return false;
    memoForget(feedMissFile(adapterId));
    try { fs.unlinkSync(feedMissFile(adapterId)); return true; } catch { return false; }
  }
  /** A cached attachment: `{file, meta}` or null. A hit refreshes its LRU stamp. */
  // verify r1 (lane channel-attach-read): `msg` names the message whose part it is (a Gmail `part:N` repeats per mail)
  const attSlot = (attId, msg) => attHash(msg ? `${msg}\n${attId}` : attId);
  function attachmentGet(adapterId, convId, attId, msg = null) {
    const d = attDir(adapterId, convId);
    const h = attSlot(attId, msg);
    const file = path.join(d, h);
    let meta;
    try { meta = JSON.parse(fs.readFileSync(file + '.json', 'utf-8')); } catch { return null; }
    try { fs.statSync(file); } catch { return null; }
    const l = lruOf(adapterId);
    const k = `${safeSeg(convId)}/${h}`;
    if (l.items[k]) { l.items[k].usedAt = now(); lruTouch(adapterId); }
    if (!l.items[k] && lruRebuilding.has(adapterId) && meta && Number.isFinite(Number(meta.bytes))) { l.items[k] = { bytes: Number(meta.bytes), usedAt: now() }; lruAdmit(adapterId, k); }   // r3188: a hit while it is rebuilt counts in memory (a statement of its own: a control's cut of the line above leaves it whole)
    return { file, meta };
  }
  /** B-360d r1360 (the loop-hold digest: 2 holds were ingest's held bodies asking attachmentGet — a synchronous open of a
   *  meta on the network share, per attachment): THE SAME ANSWER OFF THE LOOP — the meta and the bytes' stat on the thread
   *  pool, the account's LRU ledger read the same way at its first use. For ingest's road (persistHeldBodies). */
  async function lruOfAsync(adapterId) {
    if (lruCache.has(adapterId)) { lruRetry(adapterId); return lruCache.get(adapterId); }
    const ep = purgeSeq.get(adapterId) || 0;
    let read;
    try { read = { text: await fs.promises.readFile(lruFile(adapterId), 'utf-8') }; } catch (error) { read = { error }; }
    if ((purgeSeq.get(adapterId) || 0) !== ep) return null;   // 主开发 r2557 (2): the account was purged during the read — its ledger is never put back (a hit would make its folder again)
    if (lruCache.has(adapterId)) return lruCache.get(adapterId);   // a synchronous first read won meanwhile
    return lruAnswer(adapterId, read);   // r3188: rebuilt from the folder when it cannot be taken as it is
  }
  async function attachmentGetAsync(adapterId, convId, attId, msg = null) {
    const ep = purgeSeq.get(adapterId) || 0;
    const file = path.join(attDir(adapterId, convId), attSlot(attId, msg));
    let meta;
    try { meta = JSON.parse(await fs.promises.readFile(file + '.json', 'utf-8')); } catch { return null; }
    try { await fs.promises.stat(file); } catch { return null; }
    const l = await lruOfAsync(adapterId);
    if (!l || (purgeSeq.get(adapterId) || 0) !== ep) return null;   // 主开发 r2557 (2): purged during the wait — no answer, no touch
    const hit = l.items[`${safeSeg(convId)}/${attSlot(attId, msg)}`];
    if (hit) { hit.usedAt = now(); lruTouch(adapterId); }   // attachmentGet's touch on the async road, in words of its own (test-channels-images anchors the synchronous one)
    if (!l.items[`${safeSeg(convId)}/${attSlot(attId, msg)}`] && lruRebuilding.has(adapterId) && meta && Number.isFinite(Number(meta.bytes))) { l.items[`${safeSeg(convId)}/${attSlot(attId, msg)}`] = { bytes: Number(meta.bytes), usedAt: now() }; lruAdmit(adapterId, `${safeSeg(convId)}/${attSlot(attId, msg)}`); }   // r3188: a hit while it is rebuilt counts in memory (a statement of its own)
    return { file, meta };
  }

  /** Store ONE attachment (0600, beside its meta) and evict the account's
   *  least-recently-used files down to `budgetBytes` — never the one just
   *  written. Returns (a Promise of) `{file, meta, evicted:[keys], totalBytes}`.
   *  The BLOB is written and the evicted files unlinked asynchronously — an
   *  attachment may be 100 MB and data/ may sit on a slow mount (the
   *  never-block-the-event-loop law); the meta + ledger stay the store's small
   *  atomic writes. The temp name is unique per call, so two concurrent
   *  fetches of the same attachment never write into one temp file. */
  let attSeq = 0;
  async function attachmentPut(adapterId, convId, attId, { data, name = null, mime = null, msg = null } = {}, { budgetBytes = 5120 * 1024 * 1024 } = {}) {
    // 主开发 r2819 (line 510's small): A PURGED ACCOUNT's write refuses — at its start and after each wait (a purge that lands
    // inside it): what it made is taken away again, and it answers null (ingest's held-bodies road reads «nothing» as «not
    // kept yet» and asks this write next: it writes nothing back)
    const gone = async () => { if (!goneAccounts.has(adapterId)) return false; lruCache.delete(adapterId); lruDirty.delete(adapterId); try { await fs.promises.rm(path.join(attRoot, safeSeg(adapterId)), { recursive: true, force: true }); } catch { } return true; };   // r2878 (c): its ledger leaves memory too
    if (goneAccounts.has(adapterId)) return null;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data || '');
    const d = attDir(adapterId, convId);
    await fs.promises.mkdir(d, { recursive: true, mode: 0o700 });
    if (await gone()) return null;
    const h = attSlot(attId, msg);
    const file = path.join(d, h);
    const tmp = `${file}.tmp-${process.pid}-${++attSeq}`;
    await fs.promises.writeFile(tmp, buf, { mode: 0o600 });
    try { await fs.promises.chmod(tmp, 0o600); } catch {}
    if (await gone()) return null;
    await fs.promises.rename(tmp, file);
    if (await gone()) return null;
    const meta = { id: String(attId), ...(msg ? { msg: String(msg).slice(0, 512) } : {}), name: name ? String(name).slice(0, 256) : null, mime: mime ? String(mime).slice(0, 128) : null, bytes: buf.length, at: now() };
    writeJsonAtomic(file + '.json', meta, { mode: 0o600 });
    const l = lruOf(adapterId);
    const key = `${safeSeg(convId)}/${h}`;
    l.items[key] = { bytes: buf.length, usedAt: now() };
    lruAdmit(adapterId, key);   // r3279: admitted while its rebuild runs (never pruned by it)
    const evicted = [];
    let total = Object.values(l.items).reduce((n, x) => n + (Number(x && x.bytes) || 0), 0);
    if (total > budgetBytes && !lruRebuilding.has(adapterId) && !lruUnfinished.has(adapterId)) {   // r3188 + r3279: NEVER from a part of the truth (a rebuild in flight, a walk unfinished)
      const order = Object.entries(l.items).filter(([k]) => k !== key).sort((a, b) => (Number(a[1].usedAt) || 0) - (Number(b[1].usedAt) || 0));
      for (const [k, x] of order) {
        if (total <= budgetBytes) break;
        const f = path.join(attRoot, safeSeg(adapterId), k);
        try { await fs.promises.unlink(f); } catch {}
        try { await fs.promises.unlink(f + '.json'); } catch {}
        total -= Number(x.bytes) || 0;
        delete l.items[k];
        evicted.push(k);
      }
    }
    if (await gone()) return null;   // a purge during the evictions' waits: the meta written above goes with the folder
    lruSave(adapterId);
    return { file, meta, evicted, totalBytes: total };
  }
  /** The account's cache footprint (the card may say it). */
  function attachmentUsage(adapterId) {
    const l = lruOf(adapterId);
    const items = Object.values(l.items);
    return { files: items.length, bytes: items.reduce((n, x) => n + (Number(x && x.bytes) || 0), 0) };
  }
  /** r3188: the account's ledger rebuild settled (resolves at once when none is in flight) — a suite's wait; the card's footprint
   *  keeps its shape meanwhile (it under-counts for a moment) */
  function attachmentLedgerSettled(adapterId) {
    const p = lruRebuilding.get(adapterId);
    return p ? p.then(() => true, () => true) : Promise.resolve(true);
  }

  // ── the audit log: append-only, rolled by DATE, ARCHIVED never deleted ──
  // WHICH DAY THE OPEN FILE BELONGS TO IS READ FROM ITS OWN LAST LINE, never
  // from mtime: mtime is a fact about the filesystem (a backup, an rsync or a
  // restore rewrites it) while `at` is the stamp WE wrote beside the entry.
  // Bounded tail read — one day of audit lines is small, but "small" is not a
  // reason to read a file whole.
  let auditDay = null;
  function auditDayOnDisk() {
    try {
      const fd = fs.openSync(auditFile, 'r');
      try {
        const size = fs.fstatSync(fd).size;
        const start = Math.max(0, size - 4096);
        const buf = Buffer.allocUnsafe(size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        const last = buf.toString('utf-8').trimEnd().split('\n').pop();
        const at = Number(JSON.parse(last).at);
        return Number.isFinite(at) ? dayStamp(at) : null;
      } finally { fs.closeSync(fd); }
    } catch { return null; }
  }
  function audit(rec) {
    const t = now();
    const today = dayStamp(t);
    if (auditDay === null) auditDay = auditDayOnDisk();
    if (auditDay && auditDay !== today) {
      // APPEND to the archive shard, never overwrite: two rolls naming the
      // same day must not erase each other (the slot-transitions lesson — a
      // rotation that clobbers its own shard loses the reason it exists).
      try {
        fs.appendFileSync(path.join(archiveDir, `audit-${auditDay}.ndjson`), fs.readFileSync(auditFile));
        fs.unlinkSync(auditFile);
      } catch (e) { console.warn('[channels] audit roll failed:', e && e.message); }
    }
    fs.appendFileSync(auditFile, JSON.stringify({ at: t, ...rec }) + '\n');
    auditDay = today;
  }

  // ── channel-store-off-loop (commit 1): THE FIELD-NAMED DOORS HAND THEIR BYTES TO THE STORE WRITER, as the index does ──
  // On the owner's hub (24 h of the witness's lines) 562 holds and 2221 s were this file's writeJsonAtomic (adapters.json
  // 549, groups.json 12), 19 holds and 75 s an account directory's mkdir (peopleWrite), 15 holds and 51 s the poll-stamps
  // snapshot's open — a data directory on a mount where a create costs ~4 s. These doors keep their truth in memory and
  // `owe` the file to the writer (its thread does the mkdir, temp, write and rename); the bytes are made by `produce` when
  // the write is due (several changes ⇒ one write). TWO COLUMNS, as the index's: a DURABLE door's promise means on disk
  // (`landed` — only a FAILED write rejects, with its code; a write still QUEUED at the writer's bound is still owed and
  // waited for again, never a rejection); a PACED door (a bookkeeping stamp) resolves after the change in memory. After
  // close() — and for a synchronous caller — the bytes go through the writer at once and are waited for (`writeNow`).
  // NOT MOVED here, rows that only fall (scripts/test-store-write-census.mjs): lru, the
  // attachment metas (search-memo and feed-miss moved by B-360d r1360), the message-log and audit appends, the outbox files' removal; and the
  // poll-stamps JOURNAL's append and fold (a named exception: a kill must keep every stamp — see the journal's note).
  const moved = new Set();   // the files this store handed to the writer (close() flushes them through it)
  function owe(file, { name, produce, mode, act = false, onWritten, makeDir = false, debounceMs } = {}) {
    moved.add(file);
    W().dirty(file, { name, produce, ...(mode !== undefined ? { mode } : {}), ...(act ? { rank: 0 } : {}), ...firstWrite(file, onWritten), ...(makeDir ? { makeDir: true } : {}), ...(debounceMs !== undefined ? { debounceMs } : {}) });   // B-f276 1b (r809): a family read missing — its first write is the exclusive create
    if (closed) writeNow(file);
  }
  /** the file's bytes through the writer NOW, waited for (bounded by the writer's synchronous bound) — close(), a change
   *  after close, a suite's synchronous flush; a write that did not land THROWS, as the synchronous write did */
  function writeNow(file) {
    const r = W().flushSync([file]);
    const miss = r.left.find((x) => x.file === file);
    if (miss) throw Object.assign(new Error(`${path.basename(file)} not written: ${miss.why}`), { code: 'EWRITE' });
    return r.written.length > 0;
  }
  /** A DURABLE door's promise: resolves when the file's bytes holding the change are on disk; rejects ONLY when that
   *  write FAILED (its own code — the caller's unsaved road, as the synchronous write's throw was). «queued» at the
   *  writer's bound = still owed: the promise waits on (a channel on a stalled storage pauses; it raises no alarm). */
  async function landed(file) {
    for (;;) {
      if (await W().durable(file)) return;
      const why = W().whyNotDurable(file);
      if (why && why.why === 'queued') continue;
      if (why && why.code === 'EEXIST') {   // B-f276 1b (r809): the family's file APPEARED since its read — read and kept, this change not made
        const fam = famByFile.get(file);
        if (fam && fam.appearing) await fam.appearing.catch(() => { });
        throw appearedError(fam || { name: path.basename(file) });
      }
      const code = (why && why.code) || 'EWRITE';
      throw Object.assign(new Error(`${path.basename(file)} not written (${code})`), { code });
    }
  }
  const jsonOf = (obj) => () => JSON.stringify(obj(), RUNTIME_KEYS, 1);   // the same bytes writeJsonAtomic wrote

  // ── adapter records: THE SAME SINGLE OWNER AS THE INDEX (invariant 3, r2) ──
  // Their tokens are encrypted by the caller, never here. Read ONCE, mutated
  // LIVE inside a serialized door, and written by that door only — there is
  // deliberately no `writeAdapters(obj)` for a caller to hand a private copy
  // to, for the same reason there is no `writeIndex`.
  const adLoad = loadJsonFamily(adaptersFile, (v) => v && typeof v === 'object' && Array.isArray(v.adapters), () => ({ v: 1, adapters: [] }), (v) => { ad = v; });
  let ad = adLoad.value;
  let adChain = Promise.resolve();
  // channel-store-off-loop (commit 1): `{paced: true}` = a bookkeeping stamp (a pass's time, a counter, a cursor after
  // its rows are durable) — resolves after the change in memory; every other update (a sign-in, a credential, an owner's
  // act) is DURABLE — its promise means on disk. The chain serializes the change in memory only, never the disk.
  function adaptersUpdate(fn, { paced = false } = {}) {
    if (adLoad.blocked) return Promise.reject(blockedError(adLoad.blocked));
    // 0600 (2.369.165): the records carry sealed tokens AND an account's own
    // client secret (`credential.appSecretEnc`) — owner-only like the key file.
    // r2878 + r2943 (L3): an account added again under a gone or MARKED id — its gone mark cleared and its purge mark ENDED (readded);
    // a re-add DURING its purge only after that purge settles
    // r3021 (2) + (3): never the record being REMOVED now (its fresh mark is the removal's), and the mark ends only once this write LANDED;
    // r3131 (1): only while the record in the list IS the one being removed — a record under that id after it left is a re-add (it waits
    // for the purge, then its gone mark is cleared and its purge mark ended)
    const run = adChain.then(() => fn(ad)).then((r) => { const back = []; for (const a of (ad && ad.adapters) || []) if (a && !(removing.has(a.id) && removingRec.get(a.id) === a) && (goneAccounts.has(a.id) || (pending && pending.ids[a.id]))) back.push(a.id); owe(adaptersFile, { name: 'channels-adapters.write', produce: jsonOf(() => ad), mode: 0o600, act: !paced }); for (const id of back) readded(id); return r; });
    adChain = run.then(() => {}, () => {});
    return paced ? run : run.then((r) => landed(adaptersFile).then(() => r));
  }

  // ── the outbox (design §9, P3): proposals + their state machine, THE SAME
  // SINGLE-OWNER SHAPE (invariant 3). Read once, mutated live inside a
  // serialized door, written by that door only — atomic JSON, because the
  // approval card and the Outbox window render from ONE store and must never
  // disagree (§9.2). Bounded: terminal proposals past OUTBOX_KEEP fall off
  // oldest-first at write time (the audit log keeps the record for ever).
  const outboxFile = path.join(dir, 'outbox.json');
  const obLoad = loadJsonFamily(outboxFile, (v) => v && typeof v === 'object' && v.proposals && typeof v.proposals === 'object', () => ({ v: 1, proposals: {}, seq: 0 }), (v) => { ob = v; if (!Number.isFinite(ob.seq)) ob.seq = 0; obSnap = null; });
  let ob = obLoad.value;
  if (!Number.isFinite(ob.seq)) ob.seq = 0;
  let obChain = Promise.resolve();
  function outboxPrune() {
    const all = Object.values(ob.proposals);
    if (all.length <= OUTBOX_KEEP) return;
    const rank = (p) => (Number.isFinite(OUTBOX_PRUNE_RANK[p.state]) ? OUTBOX_PRUNE_RANK[p.state] : 2);
    const done = all.filter((p) => p && OUTBOX_PRUNABLE.includes(p.state)).sort((a, b) => (rank(a) - rank(b)) || ((a.updatedAt || a.at || 0) - (b.updatedAt || b.at || 0)));
    for (const p of done.slice(0, all.length - OUTBOX_KEEP)) { delete ob.proposals[p.id]; dropOutboxFiles(p.id); }
  }
  // design 005 §2.B (B-fd1f): a pruned proposal takes its attachments' folder with it (src/channel-outbox-files.js layout)
  function dropOutboxFiles(id) {
    if (!/^p-[a-z0-9]+-[a-z0-9]+$/.test(String(id))) return;
    try { fs.rmSync(path.join(dir, OWN_FOLDERS.outboxFiles, String(id)), { recursive: true, force: true }); } catch { /* the sweep tries again */ }
  }
  // channel-store-off-loop (commit 1): the outbox is the send's WRITE-AHEAD (the attempt on disk before the send, the
  // vendor's handle after it) — every update is DURABLE: its promise resolves only once the bytes holding it are on disk
  function outboxUpdate(fn) {
    if (obLoad.blocked) return Promise.reject(blockedError(obLoad.blocked));
    const run = obChain.then(() => fn(ob)).then((r) => { outboxPrune(); obSnap = null; owe(outboxFile, { name: 'channels-outbox.write', produce: jsonOf(() => ob), act: true }); return r; }, (err) => { obSnap = null; throw err; });
    obChain = run.then(() => {}, () => {});
    return run.then((r) => landed(outboxFile).then(() => r));
  }
  // ONE COPY PER WRITE, NOT PER READ (verify r5, 2026-09-27): every reader took a deep copy of the WHOLE outbox to
  // read one record (34 sites in the engine — an approve is ~8 of them), so at the bound with 16 KB texts (16.6 MB on
  // disk) one agent's `--replaces` held the main thread ~836 ms (45 ms per copy; the write itself 58 ms). The copy
  // is made once after a write and shared by every reader until the next write, DEEP-FROZEN so a reader that
  // mutates it throws (strict mode) instead of poisoning the next reader — the live `ob` is written only inside
  // `update(fn)`. A record read through it is the same object twice in a row (test-channel-outbox pins it).
  let obSnap = null;
  const deepFreeze = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) deepFreeze(v[k]); } return v; };
  function outboxSnapshot() { if (!obSnap) obSnap = deepFreeze(JSON.parse(JSON.stringify(ob))); return obSnap; }
  /** A new proposal id — a sequence under the owner, so two proposals born
   *  in the same millisecond cannot share one. */
  function outboxNextId() { ob.seq = (Number(ob.seq) || 0) + 1; return `p-${now().toString(36)}-${ob.seq.toString(36)}`; }

  // ── agent groups (design §22.5): groups.json, THE SAME SINGLE-OWNER SHAPE
  // (invariant 3). Read once, mutated LIVE inside a serialized door, written
  // by that door only — atomic JSON; there is no `writeGroups(obj)` for a
  // caller to hand a private copy to. The group LOG is not here: it is an
  // ordinary conversation log (`appendRecords(GROUP_ADAPTER_ID, groupId, …)`),
  // append-only like every channel's, so a group's history gets invariants
  // 1/2/5 for free and a busy group never rewrites this file per message
  // beyond its `lastAt`/`lastText` summary.
  const groupsFile = path.join(dir, 'groups.json');
  const grLoad = loadJsonFamily(groupsFile, (v) => v && typeof v === 'object' && v.groups && typeof v.groups === 'object' && !Array.isArray(v.groups), () => ({ v: 1, groups: {} }), (v) => { gr = v; });
  let gr = grLoad.value;
  let grChain = Promise.resolve();
  // channel-store-off-loop (commit 1): a group verb and a report's marker are acts — DURABLE, the promise means on disk
  function groupsUpdate(fn) {
    if (grLoad.blocked) return Promise.reject(blockedError(grLoad.blocked));
    const run = grChain.then(() => fn(gr)).then((r) => { owe(groupsFile, { name: 'channels-groups.write', produce: jsonOf(() => gr), act: true }); return r; });
    grChain = run.then(() => {}, () => {});
    return run.then((r) => landed(groupsFile).then(() => r));
  }
  function groupsSnapshot() { return JSON.parse(JSON.stringify(gr)); }

  // ── lane lark-threads (B3): THE OWNER'S NAMES FOR AUTHORS (the VibeSpace 备注) — `aliases.json`
  //    `{v:1, aliases: {[adapterId]: {[authorId]: {alias, at}}}}`, ONE serialized owner like groups.json, set aside
  //    (never overwritten) when unreadable
  const aliasesFile = path.join(dir, 'aliases.json');
  const alLoad = loadJsonFamily(aliasesFile, (v) => v && typeof v === 'object' && v.aliases && typeof v.aliases === 'object' && !Array.isArray(v.aliases), () => ({ v: 1, aliases: {} }), (v) => { al = v; });
  let al = alLoad.value;
  let alChain = Promise.resolve();
  // channel-store-off-loop (commit 1): the owner's names — an owner's act, DURABLE
  function aliasesUpdate(fn) {
    if (alLoad.blocked) return Promise.reject(blockedError(alLoad.blocked));
    const run = alChain.then(() => fn(al)).then((r) => { owe(aliasesFile, { name: 'channels-aliases.write', produce: jsonOf(() => al), act: true }); return r; });
    alChain = run.then(() => {}, () => {});
    return run.then((r) => landed(aliasesFile).then(() => r));
  }

  // ── the groups' WAKE PACE ledger (r2): who woke whom when — the PURE rules
  // are src/channel-groups.js paceVerdict/paceGrant/paceRefund, the engine
  // owns the calls. Held LIVE, written atomically a moment after a change
  // (a burst of grants is one write) and on close — a restart keeps every
  // floor (the in-memory Map it replaces forgot them all). Small by
  // construction: the engine prunes it to its windows on every change.
  // lane lg-store-writes (B-0248 U3): its bytes go to THE STORE WRITER (owe — PACED, ≥ 0.5 s: a lost last write is one
  // floor a restart forgets — one possibly earlier, billed wake, which spend-guard still gates); a flush asked (close, a
  // suite) lands what is owed through the writer, waited for. A BLOCKED ledger keeps its old road: never overwritten, said
  // a moment after each change. After close() owe() writes at once: a failed write is SAID here, never thrown into the
  // groups engine (as the release's flush did).
  const paceFile = path.join(dir, 'wake-pace.json');
  // a held ledger read again: the file's floors, with every floor this life granted kept over them (memory wins per key)
  const pcLoad = loadJsonFamily(paceFile, (v) => v && typeof v === 'object' && !Array.isArray(v), () => ({ v: 1, pairs: {}, senders: {} }), (v) => { paceSet({ ...v, pairs: unionBy(v.pairs, pc.pairs), senders: unionBy(v.senders, pc.senders) }); });
  let pc = pcLoad.value;
  let paceDirty = false;   // the BLOCKED rung's change not said yet
  let paceTimer = null;
  function paceRefusedSay() { if (paceDirty) { paceDirty = false; warn('[channels] wake-pace.json not written: ' + pcLoad.blocked); } }
  function paceFlush() {
    if (paceTimer) { clearTimeout(paceTimer); paceTimer = null; }
    // a BLOCKED ledger is never overwritten (the floors live in memory; said each time)
    if (pcLoad.blocked) { paceRefusedSay(); return; }
    if (W().pending(paceFile)) { try { writeNow(paceFile); } catch (e) { warn('[channels] wake-pace.json not written:', (e && e.message) || e); } }
  }
  function paceSet(next) {
    pc = next;
    if (pcLoad.blocked) { paceDirty = true; if (closed) paceRefusedSay(); else if (!paceTimer) { paceTimer = setTimeout(paceFlush, 100); if (paceTimer.unref) paceTimer.unref(); } return; }
    try { owe(paceFile, { name: 'channels-wake-pace.write', produce: jsonOf(() => pc) }); } catch (e) { warn('[channels]', (e && e.message) || e); }   // «wake-pace.json not written: …» (writeNow's own words)
  }

  // ── THE DISPATCH LEDGER (lane worker-dispatch verify r1 ②): the same shape as the pace ledger — held LIVE, written
  // atomically a moment after a change and on close, a BLOCKED file never overwritten (said each time). The PURE rules
  // are src/dispatch-model.js replayVerdict; the groups engine owns the calls and prunes it to the model's windows.
  // lane lg-store-writes (B-0248 U3): through THE STORE WRITER as an ACT (rank 0, its durable() asked — urgent, not
  // awaited): the entry a restart mid-wait replays from (`compactAt`) is handed to the writer before the frame and lands
  // after the write in flight and at most one paced write (2K + 1 writes for K acts owed) — a kill in that gap re-compacts
  // once on the retry (spend-guard gates the wake). After close() a failed write is said, never thrown.
  const dispatchFile = path.join(dir, 'dispatch-ledger.json');
  const dlLoad = loadJsonFamily(dispatchFile, (v) => v && typeof v === 'object' && !Array.isArray(v) && v.entries && typeof v.entries === 'object', () => ({ v: 1, entries: {} }), (v) => { dispatchSet({ ...v, entries: { ...(v.entries || {}), ...(dl.entries || {}) } }); });
  let dl = dlLoad.value;
  let dlDirty = false;   // the BLOCKED rung's change not said yet
  let dlTimer = null;
  function dispatchRefusedSay() { if (dlDirty) { dlDirty = false; warn('[channels] dispatch-ledger.json not written: ' + dlLoad.blocked); } }
  function dispatchFlush() {
    if (dlTimer) { clearTimeout(dlTimer); dlTimer = null; }
    if (dlLoad.blocked) { dispatchRefusedSay(); return; }
    if (W().pending(dispatchFile)) { try { writeNow(dispatchFile); } catch (e) { warn('[channels] dispatch-ledger.json not written:', (e && e.message) || e); } }
  }
  function dispatchSet(next) {
    dl = next;
    if (dlLoad.blocked) { dlDirty = true; if (closed) dispatchRefusedSay(); else if (!dlTimer) { dlTimer = setTimeout(dispatchFlush, 100); if (dlTimer.unref) dlTimer.unref(); } return; }
    try { owe(dispatchFile, { name: 'channels-dispatch.write', act: true, produce: jsonOf(() => dl) }); } catch (e) { warn('[channels]', (e && e.message) || e); return; }   // «dispatch-ledger.json not written: …» (writeNow after close; or a stand-in writer's dirty — the real one never throws) — never handed over ⇒ no durable() asked for it
    if (!closed) W().durable(dispatchFile).catch(() => { });   // urgent (a failure is the writer's said line)
  }

  /** The audit log's LIVE tail (today's file), newest last, bounded. A
   *  reader for THIS instance's own record — it never leaves the instance. */
  function auditTail({ limit = 200 } = {}) {
    let text = '';
    try { text = fs.readFileSync(auditFile, 'utf-8'); } catch { return []; }
    const out = [];
    for (const line of text.split('\n')) { if (!line) continue; try { out.push(JSON.parse(line)); } catch {} }
    return out.slice(-Math.max(1, limit));
  }

  // ── THE POLL STAMPS' DOOR (design 011 lane 2): `set` is the ONE writer, `lane(row)` the ONE merged read (the engine's
  // `laneOf`; channel-caps is handed that view) — the row's lane with the side map's stamps over it, the newer instant
  // winning per key where a row still carries its own (as at its heal) ──
  function stampsGet(key) { return stampMap.get(String(key)) || NO_STAMPS; }
  function stampsLane(en) {
    const out = { ...(en && en.lane && typeof en.lane === 'object' ? en.lane : {}) };
    const st = en && en.key != null ? stampMap.get(String(en.key)) : null;
    if (st) for (const f of STAMP_KEYS) if (st[f] && !(Number(out[f]) >= st[f])) out[f] = st[f];
    return out;
  }
  /** `patch` = some of the three keys; an instant ≤ 0 / null removes that stamp. */
  function stampsSet(key, patch) {
    const k = String(key);
    let st = stampMap.get(k);
    for (const f of STAMP_KEYS) {
      if (!patch || !hasOwn(patch, f)) continue;
      const v = Number(patch[f]) || 0;
      if (v > 0) { if (!st) stampMap.set(k, st = {}); st[f] = v; } else if (st) delete st[f];
    }
    if (st && !Object.keys(st).length) stampMap.delete(k);
    stampsDirty = true; stampSeq++; stampsSince.add(k);
    if (closed) { stampsFlush(); return; }
    journal(k);
    stampsCompactIfDue();   // B-360d: QUIET IS FREE — the side file is written only past the journal's bound (or on a failed line)
  }
  /** THE JOURNAL'S ONE WRITER: the key's whole triple after a change (null = none), one line, appended now (a kept fd,
   *  O_APPEND) — a list of keys is ONE append (the load's heal). Never throws — a failure is said at most once a minute,
   *  and the side file's next write still carries the stamp; the next line after a failed one starts on its own line. A
   *  BLOCKED family is never written.
   *  channel-store-off-loop (commit 1): A NAMED EXCEPTION — this append (and its fold below) STAYS ON THE MAIN THREAD: a
   *  stamp a kill took read as «never polled» (the 2.369.203 incident above), and an append on the kept descriptor survives
   *  a process kill in the page cache the moment it returns; the writer's queue would lose it. The field never named it
   *  (the 15 holds were the snapshot's open). Pinned by test-channel-store-loop-free and its census row. */
  function journal(keys) {
    if (closed || psLoad.blocked || ixLoad.blocked) return;
    const lineOf = (k) => { const st = stampMap.get(k); return `${JSON.stringify([k, ...STAMP_KEYS.map((f) => (st && st[f]) || null)])}\n`; };
    const b = Buffer.from(`${journalTorn ? '\n' : ''}${Array.isArray(keys) ? keys.map(lineOf).join('') : lineOf(keys)}`, 'utf8');
    try {
      // B-f276 1b (its read r2 S3): the stamps read missing with no journal at the start — the journal's first open is an EXCLUSIVE create:
      // a journal that APPEARED (a mount that came late) is kept as it is, never appended to
      if (journalFd === null) { journalFd = fs.openSync(stampsLog, psLoad.readMissing && !journalWas ? 'ax' : 'a'); journalWas = true; }   // B-f276 1c (its read r1 S3): readMissing, the whole life
      let o = 0;
      while (o < b.length) o += fs.writeSync(journalFd, b, o, b.length - o);
      journalTorn = false; journalStats.lines += Array.isArray(keys) ? keys.length : 1; journalStats.bytes += b.length;
      stampsJournalLen += b.length;   // B-360d: toward the compaction's bound
    } catch (e) {
      if (e && e.code === 'EEXIST' && (psLoad.missing || psLoad.readMissing)) { tookAppeared(psLoad, 'poll-stamps.log'); return; }   // B-f276 1c follow (r1588 (2)): the life-long flag the open asks — never a once-a-minute retry nobody hears of   // the journal APPEARED: the stamps held at once (loaded at the next start)
      journalTorn = true;
      stampsCompactNow = true;   // B-360d: a line that could not be written asks the compaction at once (the side file carries the change)
      if (now() - journalSaidAt >= 60e3) { journalSaidAt = now(); warn(`[channels] poll-stamps.log not written (${(e && e.code) || (e && e.message) || e}) — the stamp is kept in memory and in the side file's next write`); }
    }
  }
  /** the journal FOLDED once the side file is on disk (the named exception's second call: the kept descriptor truncated).
   *  Cure r1 (C2) — THE JOURNAL STAYS BOUNDED: after a snapshot lands the journal holds at most the stamps set since its
   *  bytes were made. Every key set after them (`keep`) is written back as ONE line each in the same synchronous step as
   *  the truncate (its current triple = its newest line); every line before is in the file just renamed. Was: the fold
   *  skipped whenever a stamp came during the write's flight (~4 s on the field's mount), and a steady account never
   *  folded — the journal grew for the life of the process and the next boot replayed all of it on the main thread. The
   *  window a kill can hit is between these two calls of one fold: the keys set during that one write's flight. */
  function foldJournal(keep) {
    if (journalFd === null && psLoad.readMissing && !journalWas) return;   // B-f276 1c (its read r1 S3): a journal this life never read nor opened is never truncated by name while the stamps read missing
    try { if (journalFd !== null) fs.ftruncateSync(journalFd, 0); else fs.truncateSync(stampsLog, 0); journalTorn = false; }
    catch (e) { if (e && e.code !== 'ENOENT') warn(`[channels] poll-stamps.log not folded (${e.code || e.message || e}) — replayed over the side file at the next start`); return; }
    journalStats.folds++;
    stampsJournalLen = 0;   // B-360d: the kept keys' lines are appended again below and counted there
    if (keep && keep.length) journal(keep);
  }
  // ── B-360d THE COMPACTION (the coordinator's r1319 / r4414): the side file is written when the journal passes its bound, never
  // on a clock — a quiet hour appends its few lines and writes nothing else. `max` bounds what a start replays. ──
  function stampsBoundBytes() { return stampsSideBytes < 0 ? 0 : Math.min(stampsBound.max, Math.max(stampsBound.min, Math.floor(stampsSideBytes / 2))); }
  function stampsCompactIfDue() {
    if (closed || !stampsDirty || stampsCompactOwed || psLoad.blocked || ixLoad.blocked) return;
    if (stampsCompactNow || (stampsJournalLen > 0 && stampsJournalLen >= stampsBoundBytes())) oweStamps();   // a line in the journal (or a failed one) is what a compaction carries
  }
  const lineOfStamp = (k, st) => `${JSON.stringify(k)}:${JSON.stringify(STAMP_KEYS.map((f) => st[f] || null))}`;
  /** one key's side-file line, or null: a key whose row left the index leaves with this write (the sliced and the whole road) */
  function sideLineOf(conv, k, st) {
    if (!hasOwn(conv, k)) { stampMap.delete(k); return null; }
    return lineOfStamp(k, st);
  }
  const sideTextOf = (lines) => `{"v":1,"fields":${JSON.stringify(STAMP_KEYS)},"stamps":{${lines.length ? `\n${lines.join(',\n')}\n` : ''}}}\n`;
  /** the moment the compaction's bytes are MADE (its first slice, or the one synchronous turn): every key set after it is kept
   *  by the fold (stampsSince — cure r1 C2's rule) */
  const handed = (text) => { stampsHanded = true; return text; };   // r4676: the bytes go to the writer now — owed an answer
  function stampsMadeNow() { stampsDirty = false; stampsMadeSeq = stampSeq; stampsSince.clear(); stampsCompactNow = false; stampsMadeAfter = stampsPurgeAsks; }
  const stampsPaceOpt = () => (stampsDebounceMs !== undefined ? { debounceMs: stampsDebounceMs } : {});   // a suite may state its own debounce (the hub: the writer's)
  const stampsAsk = () => ({ name: 'channels-stamps.write', produce: produceStamps, ...stampsPaceOpt(), ...firstWrite(stampsFile, stampsWritten) });   // B-f276 1b: a missing side file's first write is the exclusive create, on every road
  /** B-360d (the coordinator's MUST of r1556, kept at the move): A PURGE's «done» waits for a compaction MADE AFTER it to land — the
   *  side file rewritten without the account's names, the journal folded down to the keys set since (none of the account's). It is
   *  the writer's own durable(): the store's NEXT write after this ask, urgent (its pace set aside), the process kept up until it
   *  lands; a compaction being made before the purge is begun again (its bytes may hold the names). → Promise<boolean> */
  function stampsOwePurge() {
    stampsBuild = null;
    const ask = ++stampsPurgeAsks;
    stampSeq++; stampsDirty = true; stampsCompactNow = true; stampsCompactOwed = true;
    owe(stampsFile, { name: 'channels-stamps.write', produce: produceStamps, onWritten: stampsWritten, ...stampsPaceOpt() });
    // r4642 (2): the writer's answer alone is not the door — a family held between this ask and its turn writes nothing (produce
    // answers null, «equal to the disk») and a write lost with its thread is settled the same way: true only when bytes MADE after
    // this ask LANDED. BOTH gates are needed: a synchronous make during an older write's flight can carry a newer count to that older
    // landing — only the writer's version gate (a write produced after this ask) keeps it from answering early
    return W().durable(stampsFile).then((ok) => ok !== false && stampsLandedAfter >= ask, () => false);
  }
  /** the whole side file in ONE turn — a synchronous flush only (close, the exit, a suite's flush) */
  function wholeStamps() {
    const conv = ix.conversations, lines = [];
    for (const [k, st] of stampMap) { const ln = sideLineOf(conv, k, st); if (ln) lines.push(ln); }
    stampsMadeNow();
    const text = sideTextOf(lines); stampsMadeBytes = text.length;
    return text;
  }
  /** one slice of the compaction: at most `stampsSlice` keys, then the next turn; the last hands the bytes to the writer */
  function stampsBuildSlice() {
    const b = stampsBuild;
    if (!b || closed || b !== stampsBuild) return;
    const conv = ix.conversations, end = Math.min(b.keys.length, b.i + stampsSlice);
    for (; b.i < end; b.i++) {
      const k = b.keys[b.i], st = stampMap.get(k);
      if (!st) continue;   // removed since the compaction began (its removal is a journal line, kept by the fold)
      const ln = sideLineOf(conv, k, st); if (ln) b.lines.push(ln);
    }
    stampStats.slices++;
    if (b.i < b.keys.length) { const im = setImmediate(() => { if (stampsBuild === b) stampsBuildSlice(); }); if (im && im.unref) im.unref(); return; }
    b.ready = sideTextOf(b.lines); b.lines = null; stampsMadeBytes = b.ready.length;
    // the bytes are ready: a compaction made over LATER turns asks the writer to take them (its LATER answer is still owed);
    // one made inside its own produce returns them there — it never asks again (round wv1mi5o6j's MUST: A WRITE NEVER SCHEDULES
    // THE NEXT WRITE — a one-slice compaction that re-dirtied itself from its own produce sent the side file out at the writer's pace)
    if (!b.inProduce) W().dirty(stampsFile, stampsAsk());
  }
  /** the side file's bytes when the writer's turn comes: a compaction not begun BEGINS (its first slice now) and answers LATER —
   *  the writer waits for the store to ask again when its bytes are ready (the index's road, B-dfa4 cut 3); a synchronous flush
   *  makes them in this turn. null = nothing to write. A BLOCKED family or index is never written (said each time). */
  function produceStamps(o) {
    if (psLoad.blocked || ixLoad.blocked) { stampsBuild = null; stampsCompactOwed = false; warn('[channels] poll-stamps.json not written: ' + (psLoad.blocked || ixLoad.blocked)); return null; }
    if (o && o.sync) {   // close, the exit, a suite's flush: the whole file in this turn (a compaction being made is begun again whole)
      if (stampsBuild) { stampsBuild = null; stampsDirty = true; }
      if (!stampsDirty) { stampsCompactOwed = false; return null; }
      return handed(wholeStamps());
    }
    if (stampsBuild && stampsBuild.ready != null) { const text = stampsBuild.ready; stampsBuild = null; return handed(text); }
    if (stampsBuild) return LATER;   // still being made, a slice a turn
    // r4676 (r4666: the compaction STAYS owed): bytes HANDED that never got their answer — the writer's thread lost in flight; its
    // requeue asks again with no onWritten — are made again, never answered «equal to the disk»
    if (!stampsDirty && !(stampsCompactOwed && stampsHanded)) { stampsCompactOwed = false; return null; }
    if (!stampsCompactOwed) return null;   // the writer asking on its own (a stray dirty): the side file is written ONLY when its compaction is owed (the bound, a failed line)
    stampsMadeNow();
    stampsBuild = { keys: [...stampMap.keys()], i: 0, lines: [], ready: null, inProduce: true };
    stampsBuildSlice();
    if (stampsBuild) stampsBuild.inProduce = false;
    if (stampsBuild && stampsBuild.ready != null) { const text = stampsBuild.ready; stampsBuild = null; return handed(text); }   // a small map: one slice was the whole
    return LATER;
  }
  function stampsWritten(ok) {
    stampsHanded = false;   // r4676: the handed bytes have their answer
    if (!ok) { stampsDirty = true; stampsCompactOwed = true; return; }   // owed: the writer keeps it and retries (its failure said there) — the compaction stays OWED
    stampsLandedAfter = Math.max(stampsLandedAfter, stampsMadeAfter);
    stampsCompactOwed = false;
    stampStats.writes++; stampStats.compactions++;
    stampsSideBytes = stampsMadeBytes;
    foldJournal(stampSeq === stampsMadeSeq ? null : [...stampsSince]);   // cure r1 (C2): every line before the bytes is in the file just renamed; the keys set since are kept, one line each
    stampsCompactIfDue();   // a journal that grew past the bound during the write's flight (rare) is compacted again — by the store, never by the writer's own produce
  }
  /** the compaction handed to the WRITER (paced by its rules) — once until it lands */
  function oweStamps() {
    if (!stampsDirty || stampsCompactOwed) return;
    stampsCompactOwed = true;
    owe(stampsFile, { name: 'channels-stamps.write', produce: produceStamps, onWritten: stampsWritten, ...stampsPaceOpt() });   // owe(): a missing stamps file's first write is the exclusive create
  }
  /** THE SYNCHRONOUS WRITE of the side file (close, a suite): through the writer, waited for. → whether it was written;
   *  never throws (a failure is said, kept in memory and retried) */
  function stampsFlush() {
    if (!stampsDirty && !W().pending(stampsFile)) return false;
    if (psLoad.blocked || ixLoad.blocked) { warn('[channels] poll-stamps.json not written: ' + (psLoad.blocked || ixLoad.blocked)); return false; }
    moved.add(stampsFile);
    W().dirty(stampsFile, { name: 'channels-stamps.write', produce: produceStamps, ...stampsPaceOpt(), ...firstWrite(stampsFile, stampsWritten) });   // B-f276 1b: a missing side file's first write is the exclusive create
    try { return writeNow(stampsFile); }
    catch (e) { warn(`[channels] poll-stamps.json not written (${(e && e.code) || (e && e.message) || e}) — kept in memory, retried`); return false; }   // the writer keeps it owed and retries
  }

  interval = setInterval(() => {   // every tick sweeps (B-f32b); a dirty index is the writer's (its pace, its retries)
    try { sweep(); } catch (e) { warn('[channels] index sweep failed:', (e && e.message) || e); }
    if (dirty) markDirty();
  }, FLUSH_INTERVAL_MS);
  if (interval.unref) interval.unref();

  // B-f276 A2 (主开发 r487): THE ONE PAUSE — every reader of this store's families asks HERE, never a rule of its own (the channels
  // engine, the groups engine). `heldOf(names)` = the families among `names` that are HELD (their read failed) or BLOCKED (torn
  // bytes that could not be set aside): a reader of any of them PAUSES. `whenRead(names, fn)` = fn() ONCE when none of them is held
  // any more (at once when none is): a small family's read again takes its bytes in place BEFORE fn runs — no adoption under a
  // running reader. The index and the poll stamps stay held for the life (loaded at the next start): their readers start then.
  const FAMILIES = { 'index.json': () => ixLoad, 'poll-stamps.json': () => psLoad, 'adapters.json': () => adLoad, 'outbox.json': () => obLoad, 'groups.json': () => grLoad, 'aliases.json': () => alLoad, 'wake-pace.json': () => pcLoad, 'dispatch-ledger.json': () => dlLoad };
  function heldOf(names) { return (Array.isArray(names) ? names : Object.keys(FAMILIES)).filter((n) => { const f = FAMILIES[n] && FAMILIES[n](); return !!(f && f.blocked); }); }
  const readWaiters = [];
  function whenRead(names, fn) {
    if (typeof fn !== 'function') return;
    if (!heldOf(names).length) { fn(); return; }
    readWaiters.push({ names, fn });
  }
  heldHooks.push(() => {
    for (let i = 0; i < readWaiters.length;) {
      const w = readWaiters[i];
      if (heldOf(w.names).length) { i++; continue; }
      readWaiters.splice(i, 1);
      try { w.fn(); } catch (e) { warn(`[channels] a reader's start after its families read threw: ${(e && e.message) || e}`); }
    }
  });

  function close() {
    closed = true;
    heldStopped = true;
    for (const h of holds.values()) { try { h.fam.H.stop(); } catch { } }
    for (const H of peopleHolds.values()) { try { H.stop(); } catch { } }   // r3188: the people memos' holds
    if (interval) { clearInterval(interval); interval = null; }
    flush({ full: true });   // B-f32b: the last write is the whole serialization, not the cache
    stampsFlush();
    // channel-store-off-loop (commit 1): every file this store handed to the writer, through it now (a suite that reads
    // the file after close reads its last bytes)
    for (const f of moved) { if (f === stampsFile) continue; try { writeNow(f); } catch (e) { warn(`[channels] ${path.basename(f)} not written at close: ${(e && e.message) || e}`); } }
    journalFd = FC.closeWritten(journalFd, 'the channels journal', (l) => warn(`[channels] ${l}`));   // B-15ac: said, never swallowed; the number forgotten
    paceFlush();
    dispatchFlush();
    lruFlush();
  }

  /** design 012 (Slack S1, `caps.retention: 'purge-on-remove'`): ONE account's LOCAL COPY goes — its message logs and
   *  side logs (msgs/<id>/), its fetched files (attachments/<id>/) and every cache this store keeps for it. Called by
   *  the engine AFTER the account's index rows and record left (nothing reads the account any more). → {logs, files}. */
  // 主开发 r2878 → r2943 (round wv0o00cct, THE NEW SHAPE): THE PURGES NOT FINISHED — data/channels/purge-pending.json ({ v, ids: { <id>:
  // { at, left, codes } } }). It only REMEMBERS (L1): written before the record leaves (purgeBegin) and by each purge (what COULD NOT BE
  // REMOVED, by kind), read by the panel's line (pendingList) so the person is shown what is left and can press «Try again» (the remove
  // road's purgeAgain). NOTHING removes an account's data at a start or on a timer. A small FAMILY under the store-read law (L4): «not
  // there» = nothing pending; any other failed read, or bytes that do not parse, HOLD it — nothing is written over it, said once (the
  // held-file notice), read again by its hold and then taken in place
  const pendingFile = path.join(dir, 'purge-pending.json');
  const pdLoad = loadJsonFamily(pendingFile, (v) => v && typeof v === 'object' && v.ids && typeof v.ids === 'object' && !Array.isArray(v.ids), () => ({ v: 1, ids: {} }), (v) => { pending = v; });
  let pending = pdLoad.value;
  // L6: an id in the mark is an ACCOUNT's (a kind, or a kind and its minted suffix) — never a name of the folder's own (a hand edit
  // naming «msgs» would be every account's message logs) nor a file's: a bad one is skipped, said once, dropped from the mark
  const OWN_NAMES = new Set(Object.values(OWN_FOLDERS));   // r3021 (1): every folder of the store's own, the staged outbox files' too
  // r3131 (3): no «_» either — src/server/channel-api.js makes <root>/<credential with every unsafe character made «_»>/ (a mount's
  // mount_<id>, an account kind:hex's kind_hex): a name of that shape is an API log's folder, and no minted account id holds «_»
  const accountIdOk = (id) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9@:+-]{0,79}$/.test(id) && !OWN_NAMES.has(id);
  const badSaid = new Set();
  // L2: the accounts' records READ — not held, not blocked (a file that appeared since is HELD for the length of its read: tookAppeared);
  // a held read's empty stand-in is never «no record»
  const recordsRead = () => !adLoad.held && !adLoad.blocked;
  const recordOf = (id) => ((ad && ad.adapters) || []).some((a) => a && a.id === id);
  // r3131 (2): the accounts' file holds no change still owed or failed (the writer's own answer, asked in this turn)
  const adaptersOnDisk = () => { try { const w = W(); if (typeof w.pending === 'function' && w.pending(adaptersFile)) return false; return !(typeof w.whyNotDurable === 'function' && w.whyNotDurable(adaptersFile)); } catch { return false; } };
  const removing = new Set();   // the ids between their mark and their purge's end (the remove road): never listed, never ended
  const removingRec = new Map();   // r3131 (1): id → the record purgeBegin met in the list (the one being removed; null = none)
  const notRemoving = (id) => { removing.delete(id); removingRec.delete(id); };
  function pendingWrite() {
    if (pdLoad.blocked) return Promise.reject(blockedError(pdLoad.blocked));   // L4: HELD — nothing is written over a mark that could not be read
    owe(pendingFile, { name: 'channels-purge-pending.write', produce: () => JSON.stringify(pending, null, 1), mode: 0o600, act: true });
    return landed(pendingFile);
  }
  /** before the record leaves (the remove road): the account in the mark → true; false = NOT marked (a bad id, the mark held, its write
   *  failed) — the remove road tells the person when something is left */
  // r3033: the mark keeps the removed account's NAME as a person knows it — its service and the label they gave it, never its login —
  // so the panel's line names it (the record is gone by then); it goes with the entry
  const markName = (who) => (who && typeof who === 'object' && (who.service || who.label) ? { service: String(who.service || '').slice(0, 80), label: String(who.label || '').slice(0, 80) } : null);
  async function purgeBegin(adapterId, who = null) {
    if (!accountIdOk(adapterId)) return false;
    removing.add(adapterId); removingRec.set(adapterId, ((ad && ad.adapters) || []).find((a) => a && a.id === adapterId) || null);
    if (pdLoad.blocked) return false;
    const name = markName(who);
    pending.ids[adapterId] = { at: now(), left: null, ...(name ? { name } : {}) };
    try { await pendingWrite(); return true; } catch (e) { warn(`[channels] ${adapterId}: the purge's mark was not written (${(e && e.code) || (e && e.message) || e})`); return false; }
  }
  /** the remove road's record write failed after purgeBegin: the id leaves `removing` (its mark, if written, is listed as not known) */
  function purgeNotBegun(adapterId) { notRemoving(adapterId); }
  /** THE PERSON's VIEW of the mark (the panel's line, L1): each removed account whose local copy is not all removed — its id, when, what
   *  is left by kind (null = not known: a removal cut in its middle). Never a bad id (L6: dropped, said once); never an id a record
   *  carries (L3: its mark ended, said once) — decided only while the accounts' records are read (L2) */
  function pendingList() {
    const out = [];
    let dropped = false;
    for (const [id, e] of Object.entries(pending.ids)) {
      if (!accountIdOk(id)) {
        if (!badSaid.has(id)) { badSaid.add(id); warn(`[channels] purge-pending.json names ${JSON.stringify(id).slice(0, 80)}, which is no account's id — skipped and dropped from the mark (nothing was removed for it)`); }
        if (!pdLoad.blocked) { delete pending.ids[id]; dropped = true; }
        continue;
      }
      if (removing.has(id) || purging.has(id)) continue;
      if (!recordsRead()) continue;   // r3021 (6): the accounts' records not read — the id is left off until they read (it may be a live account's)
      if (recordOf(id)) { if (!ending.has(id) && adaptersOnDisk()) endMark(id, 'an account with this id has a record'); continue; }   // r3131 (2): only once its record is on disk
      out.push({ id, at: Number(e && e.at) || null, left: e && Array.isArray(e.left) ? e.left.filter((k) => typeof k === 'string') : null, name: markName(e && e.name) });
    }
    if (dropped) pendingWrite().catch((x) => warn(`[channels] purge-pending.json not written (${(x && x.code) || (x && x.message) || x}) — its bad ids are dropped in memory`));
    return out;
  }
  /** L3: a record written again under a marked id ENDS its mark: what was left of the account removed under that id is now part of this
   *  one — said ONCE in the journal; the add's answer takes it once (joinedOf) */
  const joined = new Map();   // id → { left } of the account removed under it (left null = not known)
  const ending = new Map();   // id → the end waiting for a purge of it in flight to settle
  function endMark(id, why, { readd = false } = {}) {
    const e = pending.ids[id];
    if (!e || pdLoad.blocked) return;
    delete pending.ids[id];
    const left = Array.isArray(e.left) ? e.left.filter((k) => typeof k === 'string') : null;
    if (readd) joined.set(id, { left });   // r3021 (2): the add's note on the re-add road only
    warn(`[channels] ${id}: ${why} — the purge noted under this id ends (left of the removed account: ${left ? left.join(', ') || 'nothing' : 'not known, its removal was cut in its middle'}); what is on disk under it is now that account's, and it is no longer listed to try again`);
    pendingWrite().catch((x) => warn(`[channels] purge-pending.json not written (${(x && x.code) || (x && x.message) || x}) — ${id}'s mark is ended in memory`));
  }
  /** a record written under a gone or marked id (adaptersUpdate, its write owed): the gone mark cleared once a purge of it in flight
   *  settled (resolved or rejected: never an unhandled rejection); the purge mark ended only once the record's write LANDED (r3021 (3):
   *  a record write that fails leaves the mark, said) — never for an id being removed now (r3021 (2)) */
  function readded(id) {
    if (ending.has(id)) return;
    const pp = purging.get(id);
    if (!pp) goneAccounts.delete(id);
    const q = (async () => {
      if (pp) { try { await pp; } catch { } if (!removing.has(id)) goneAccounts.delete(id); }
      try { await landed(adaptersFile); } catch (e) { if (pending.ids[id]) warn(`[channels] ${id}: an account was added again under its id, but its record's write failed (${(e && e.code) || (e && e.message) || e}) — the purge noted under the id is kept`); return; }
      if (removing.has(id)) return;
      endMark(id, 'an account was added again under its id', { readd: true });
    })().catch((e) => warn(`[channels] ${id}: its re-add's mark not ended: ${(e && e.message) || e}`));
    ending.set(id, q);
    q.then(() => { if (ending.get(id) === q) ending.delete(id); });
  }
  /** r3021 (5): a purge of the id running now (a second press joins it) */
  const purgeRunning = (id) => purging.has(String(id));
  /** the add's answer (connect, duplicate): what was left of an account removed under the same id, ONCE → { left } | null */
  async function joinedOf(id) {
    const q = ending.get(id);
    if (q) await q;
    if (!joined.has(id)) return null;
    const v = joined.get(id); joined.delete(id);
    return v;
  }
  const refusedPurge = (code, error) => ({ refused: code, error, logs: false, files: false, own: false, states: {}, left: [], done: false });
  /** ONE account's purge — the removal's own (after its record left) and a person's «Try again». L2: NEVER ON A GUESS about the records:
   *  refused by name, nothing touched, while the accounts' records are not read or while a record carries the id; L6: never a bad id */
  async function purgeAccount(adapterId) {
    if (!accountIdOk(adapterId)) return refusedPurge('bad-id', `${JSON.stringify(String(adapterId)).slice(0, 80)} is no account's id — nothing was removed`);
    if (!recordsRead()) { notRemoving(adapterId); return refusedPurge('records-held', 'the accounts\' records (adapters.json) could not be read now — nothing was removed; it can be tried again once they read'); }
    if (recordOf(adapterId)) { notRemoving(adapterId); return refusedPurge('record-stands', `an account with the id ${adapterId} exists — the data under it is that account's; nothing was removed`); }
    if (purging.has(adapterId)) return purging.get(adapterId);   // a second press while one runs: its answer
    const p = purgeOne(adapterId);   // its marks are set synchronously, before any wait
    purging.set(adapterId, p);
    try { return await p; } finally { if (purging.get(adapterId) === p) purging.delete(adapterId); }
  }
  async function purgeOne(adapterId) {
    if (!accountIdOk(adapterId)) return refusedPurge('bad-id', `${JSON.stringify(String(adapterId)).slice(0, 80)} is no account's id — nothing was removed`);
    const seg = safeSeg(adapterId);
    const pre = `${adapterId}/`;
    for (const m of [dedup, sideDedup, placeCache, basePlaces, sideCompactFailedAt]) for (const k of [...m.keys()]) if (String(k).startsWith(pre)) m.delete(k);
    let purgedStamps = false;
    for (const k of [...stampMap.keys()]) if (String(k).startsWith(pre)) { stampMap.delete(k); stampsDirty = true; purgedStamps = true; }
    // B-360d (r1556's MUST, kept at the move): the compaction is owed AT ONCE — with no clock the account's names would stay in the
    // side file and the journal until the next bound; `stamps` resolves when a compaction made after this lands (false: that write
    // failed, or the family is held — the remove road says it, never a silent «done»)
    // r4642 must 2: owed whenever a stamps file is ON DISK (the side file or the journal), not only when the account's keys are in
    // memory — a compaction made before the purge may have dropped them (their rows left first) while its bytes are owed, being
    // made, in flight or waiting on a retry: memory cannot tell what an older write still holds
    const stampsOnDisk = stampsSideBytes >= 0 || journalWas || journalFd !== null;
    const stampsGone = !(purgedStamps || stampsOnDisk) ? Promise.resolve(true) : (psLoad.blocked || ixLoad.blocked) ? Promise.resolve(false) : stampsOwePurge();
    lruCache.delete(adapterId);
    lruDirty.delete(adapterId);
    lruRebuilding.delete(adapterId); lruUnfinished.delete(adapterId); lruAdmitted.delete(adapterId);   // r3279 (10): a rebuild in flight ends with the account
    purgeSeq.set(adapterId, (purgeSeq.get(adapterId) || 0) + 1);
    goneAccounts.add(adapterId);
    // B-92fc (主开发 r2819): THE ACCOUNT'S OWN FOLDER goes too (data/channels/<account>/: its pictures, the people memo, the memos) —
    // its owed writes forgotten first (synchronously, before any wait: a late write of this account refuses from here on)
    peopleCache.delete(adapterId);
    memoForget(searchMemoFile(adapterId)); memoForget(feedMissFile(adapterId));
    try { W().forget(peopleFile(adapterId)); } catch { }
    try { W().forget(lruFile(adapterId)); } catch { }   // B-0248 row 5: the ledger's owed write too
    // off the loop (B-92fc: nothing synchronous). 主开发 r2878: each folder says ONE OF THREE — removed, was not there, or COULD NOT
    // BE REMOVED (its error's code) — never a swallowed error
    // r2943 (L5): THREE-WAY AT THE LOOK TOO — not there (or not a folder on its way) is absent, found is present; ANY other code leaves
    // the folder «could not be removed» with that code: done is never said on a look that failed
    const look = async (q) => { try { await fs.promises.access(q); return 'present'; } catch (e) { const c = e && e.code; return c === 'ENOENT' || c === 'ENOTDIR' ? 'absent' : { code: c || 'error' }; } };
    const removeOne = async (q) => {
      const l0 = await look(q);
      if (l0 === 'absent') return { state: 'absent' };
      if (l0 !== 'present') return { state: 'left', code: l0.code };
      try { await fs.promises.rm(q, { recursive: true, force: true }); } catch (e) { return { state: 'left', code: (e && e.code) || 'error' }; }
      const l1 = await look(q);
      return l1 === 'absent' ? { state: 'removed' } : { state: 'left', code: l1 === 'present' ? 'still-there' : l1.code };
    };
    const own = path.join(dir, seg);
    const folders = { logs: path.join(msgsDir, seg), files: path.join(attRoot, seg), own };
    const r = {};
    for (const [k, q] of Object.entries(folders)) r[k] = await removeOne(q);
    // THE SETTLE: a write of the own folder — or of the account's ATTACHMENTS folder (its ledger, owed to the writer since B-0248 row 5:
    // line 877's required follow, 主开发 r3958) — already IN FLIGHT on the writer's thread may land its rename after that removal (its
    // makeDir makes the folder again; its forgotten file is unlinked after it lands) — once no write of either folder flies, they go again
    const roots = [own, folders.files].map((q) => q + path.sep);
    const flying = () => { try { return W().stats().some((x) => x.inflight && roots.some((q) => String(x.file || '').startsWith(q))); } catch { return false; } };
    for (let k = 0; k < 600 && flying(); k++) await new Promise((z) => setTimeout(z, 50));
    // the truth at the end: a folder still there is LEFT (one more removal tried for a folder that came back)
    for (const [k, q] of Object.entries(folders)) {
      const l = await look(q);
      if (l === 'absent') continue;
      if (l !== 'present') { if (r[k].state !== 'left') r[k] = { state: 'left', code: l.code }; continue; }
      const again = await removeOne(q);
      if (again.state === 'left') r[k] = r[k].state === 'left' ? r[k] : again; else if (r[k].state === 'left') r[k] = { state: 'removed' };
    }
    const NAMES = { logs: `msgs/${seg}`, files: `attachments/${seg}`, own: seg };
    const left = Object.keys(folders).filter((k) => r[k].state === 'left').map((k) => ({ what: k, folder: NAMES[k], code: r[k].code }));
    // the mark REMEMBERS what is left (by kind and code) for the panel's line — or ends; never written while it is held (L4), and a
    // failed write is ANSWERED (markUnwritten), never a rejection after the record and folders are gone
    notRemoving(adapterId);
    let markUnwritten = null;
    if (pdLoad.blocked) markUnwritten = 'held';
    else {
      const was = pending.ids[adapterId] || null, name = markName(was && was.name);
      if (left.length) pending.ids[adapterId] = { at: (was && was.at) || now(), left: left.map((x) => x.what), codes: Object.fromEntries(left.map((x) => [x.what, x.code])), ...(name ? { name } : {}) };
      else delete pending.ids[adapterId];
      try { await pendingWrite(); } catch (e) { markUnwritten = (e && e.code) || 'error'; }
    }
    if (markUnwritten) warn(`[channels] ${adapterId}: purge-pending.json not written (${markUnwritten}) — ${left.length ? 'what is left of it is not noted on disk' : 'its finished purge is not noted on disk'}`);
    return { logs: r.logs.state === 'removed', files: r.files.state === 'removed', own: r.own.state === 'removed', states: r, left, done: !left.length, stamps: stampsGone, ...(markUnwritten ? { markUnwritten } : {}) };
  }

  acctWarmStart();   // B-dfa4 cut 3: a big index's per-account keys, in slices from the load (keysOf finishes them if it asks first)
  // B-360d unit 1: AT OPEN the layout is built (in slices on a big store) for the fingerprints law 3 compares against — it owes
  // no write; until it lands a touched row counts as changed (journaled)
  try { persistedTop = topCmp(); } catch { persistedTop = null; }   // B-360d unit 1 (M4): the top as loaded (base + journal)
  // B-360d found holder 1: one snapshot at the open, the size test's and the build's
  if (!ixLoad.blocked && plainRows(ix.conversations)) { try { const keys0 = Object.keys(ix.conversations); if (keys0.length > LAYOUT_SYNC_ROWS) warmLayout({ atOpen: true, keys: keys0 }); else buildLayout(ix.conversations); } catch (e) { warn('[channels] the index layout at open failed:', (e && e.message) || e); } }
  return {
    rootClosed,   // the root closed to other accounts: resolves true once it is (or already was), false when the filesystem refused (said once)
    dir, indexFile, adaptersFile, auditFile, archiveDir, outboxFile, groupsFile, aliasesFile, logPath, purgeAccount, purgeBegin, purgeNotBegun, pendingList, joinedOf, purgeRunning,
    // `blocked()` = the refusal sentence while a family's file could not be set aside (null = writable)
    index: {
      // B-526c × B-360d unit 1 (主开发 r1765): a row has LANDED exactly when its own change is on disk by the road that carries it —
      // its journal line synced, or the whole write that carried it landed; while the family is HELD nothing is said landed
      landed: (key) => !ixLoad.blocked && hasOwn(ix.conversations, key) && !isUnlanded(key),
      // landedStats(): the GATES' read only — its «owed» walks every kept entry once (a suite's count, never a road of the product)
      landedStats: () => ({ ...landedStats, entries: unlanded.size, owed: [...unlanded.values()].filter((g) => g > landedGen).length, sweeping: !!sweepIt }),   // B-360d found holder 1: the generations' counts (the gates')
      // B-360d unit 1 (law 11): `journalDurable()` — the journal as it stands written (a compaction owed: landed), for a purge
      update, snapshot, peek, has, live: liveConversations, rows, touch, table: liveTable, entry, flush, durable: durableIndex, journalStats: () => ({ journalBytes, owedBytes, lines: actLines.length, actSeq, appendedSeq, compactOwed, wholeOwed, indexOwed: dirty }), journalDurable: () => { if (closed) return Promise.resolve(true); if (ixLoad.blocked) return Promise.reject(blockedError(ixLoad.blocked)); askActs(); return W().durable(actsFile); },   // r1542's law: held — refused by name
      // B-360d unit 1: `fold()` — the index written WHOLE now (the journal folded into it), as the bound asks it — its promise
      // resolves when that write landed (a suite's whole write; the bound's own road)
      fold: () => { if (closed) { try { flush(); } catch { return Promise.resolve(false); } return Promise.resolve(!ixLoad.blocked); } if (ixLoad.blocked) return Promise.reject(blockedError(ixLoad.blocked)); markDirty(true); return W().durable(indexFile); }, isDirty: () => dirty, blocked: () => ixLoad.blocked || null, held: () => !!ixLoad.held,   // fold: r1542's law — held, refused by name
      // B-dfa4 U2: `keysOf(adapterId)` = that account's row keys, kept (a walk of one account reads its own rows); `keysStats()` for the gates
      keysOf, rowsOf, keysReady, keysKept, keysStats: () => ({ ...acctStats, kept: !!byAcct, warming: !!acctWarm, odd: oddKeys.size }),   // B-dfa4 cut 1: `rowsOf(adapterId)` = those rows, read-only
      // B-f32b: `onTouch(fn)` = fn(key) after an update touched that row, fn(null) after it reached the whole map (the
      // engine's kept unread total); `sweep()` / `flushStats()` for the gates
      onTouch: (fn) => { if (typeof fn === 'function') touchHooks.push(fn); }, onWholeTouch: (fn) => { if (typeof fn === 'function') wholeTaps.push(fn); }, sweep, flushStats: () => ({ ...flushStats, chunks: layout ? layout.chunks.length : 0 }),
    },
    // design 011 lane 2: the poll stamps (lastPollAt / lastScanAt / walkStartedAt) — `set` writes, `lane(row)` reads
    stamps: { get: stampsGet, set: stampsSet, lane: stampsLane, flush: stampsFlush, file: stampsFile, log: stampsLog, isDirty: () => stampsDirty, stats: () => ({ ...stampStats, keys: stampMap.size, journal: { ...journalStats } }) },
    adapters: { update: adaptersUpdate, live: () => ad, blocked: () => adLoad.blocked || null, landed: () => landed(adaptersFile), held: () => !!adLoad.held,
      // B-f276 (主开发 r459): the set-aside copies of adapters.json beside it (names), null until listed (unknown)
      asideCopies: () => (asideListed ? asideNames.slice() : null) },
    outbox: { update: outboxUpdate, snapshot: outboxSnapshot, nextId: outboxNextId, live: () => ob },
    groups: { update: groupsUpdate, snapshot: groupsSnapshot, live: () => gr },
    groupFamilies: Object.freeze([...GROUP_FILES]),   // B-f276 1c: the agent groups' families BY NAME — the store owns the names (record-clear)
    aliases: { update: aliasesUpdate, live: () => al, blocked: () => alLoad.blocked || null },
    pace: { live: () => pc, set: paceSet, flush: paceFlush },
    dispatch: { live: () => dl, set: dispatchSet, flush: dispatchFlush },
    quarantined,
    heldOf, whenRead,   // B-f276 A2: THE ONE PAUSE (both engines)
    // B-f276 A3: what lifts a family's pause — null (not held) | 'by-itself' (a small family, read again) | 'next-start' (the index, the
    // poll stamps) | 'blocked' (torn bytes that could not be set aside: fixed or moved by hand)
    familyKind: (n) => { const f = FAMILIES[n] && FAMILIES[n](); return f && f.blocked && f.q ? f.q.kind || null : null; },
    familyCame: (n) => { const f = FAMILIES[n] && FAMILIES[n](); return f && f.blocked && f.q ? f.q.came || null : null; },   // its round wp3niroz5 (2): the companion that came, by name   // B-f276 1b (its read r1 N1): damaged | appeared | unreadable
    familyState: (n) => { const f = FAMILIES[n] && FAMILIES[n](); if (!f || !f.blocked) return null; return (f.q && f.q.lifts) || (f.big ? 'next-start' : 'by-itself'); },   // B-f276 1b: 'by-itself' | 'next-start' | 'a-person' (damaged: the one door)
    wallHeld: (name) => heldOf(HELD_WALLS[name] || Object.keys(FAMILIES)).length > 0,   // a cleanup's own wall (an unknown name = every family)
    // B-f276: fn({ file, state: 'loaded' | 'reads-again', q }) after a held family read again (the engine's words + start passes)
    onHeldRead: (fn) => { if (typeof fn === 'function') heldHooks.push(fn); },
    startDamagedEmpty,   // B-f276 1b: the damaged family's one door (a person's choice — the engine's route asks it)
    appendRecords, readTail, readTailAsync, countSince, trim, audit, auditTail, close,
    // 2026-09-26 (the aggregated IM): backfill, search, attachments
    searchStats: () => ({ ...searchStats }),   // B-360d found holder 3: the search's own counts (files, rows read, fallbacks)
    prependRecords, oldestRecord, search, attachmentGet, attachmentGetAsync, attachmentPut, attachmentUsage, attachmentLedgerSettled, avatarGet, avatarPut, avatarRefuse, peopleRead, peopleWrite, peopleHeld, peopleUpdate, onPeopleLift,
    searchMemoRead, searchMemoWrite, searchMemoDrop,
    feedMissRead, feedMissWrite, feedMissDrop,
    // R3 (§23): one record by its vendorId (the attachment's owner), the LRU ledger's coalesced flush
    findRecord, rewriteRecords, lruFlush, trimAsync,
    // lane channel-threads: the side log (invariant 8) + which conversation holds a message
    appendSide, readSide, trimSide, sidePath, locateMessage,
    // lane lark-threads (A1): THE PLACE DOOR (widen-only) + the folded patches a reader applies
    widenPlaces, placesOf,
  };
}

/** B-f276 A2 (主开发 r487): A CLEANUP DELETES ONLY WHAT IT KNOWS IS AN ORPHAN; UNKNOWN IS NEVER AN ORPHAN. Every sweep / reaper /
 *  pass that deletes a file or a folder, closes a For-you item or drops a waiting delivery on the strength of what a family holds
 *  is a row: the families it trusts. Each asks `store.wallHeld(name)` ITSELF (the wall behind the pause) and does nothing while one
 *  is held. scripts/test-channel-store.mjs ⑮'s census: every row asked exactly once in the product, none asked without a row. */
const HELD_WALLS = Object.freeze({
  filesSweep: ['outbox.json'],                                    // channels-outbound.js — deletes outbox-files/<id> folders with no proposal
  stashGate: ['index.json', 'adapters.json'],                     // channels-outbound.js — drops / rewrites an agent's waiting channel entry
  clientSwapCheck: ['adapters.json'],                             // channels-engine.js — closes client-swap For-you items as out of date
  removeAccount: ['index.json', 'adapters.json', 'outbox.json'],  // channels-auth.js — the reference check and the purge
  heldPass: ['index.json', 'adapters.json'],                      // channels-engine.js — drops kept deliveries
  owedPass: ['index.json', 'adapters.json'],                      // channels-engine.js — drops owed deliveries
  healRow: ['poll-stamps.json'],                                  // channel-store.js — moves the poll times out of the rows (lost while the side file is held)
});
/** B-f276 A3 (主开发 r566): THE ONE DOOR WRAPPER both engines call (the channels engine, the groups engine) over THE ONE PAUSE (a
 *  store's heldOf) — never the rule written twice. WHILE PAUSED EVERY FUNCTION DOOR IS REFUSED BY NAME UNLESS A ROW ALLOWS IT, so a door
 *  added later is refused until someone allows it (the census is the allow list). A row `table[key] = [class, kind, why]`:
 *  'allow'  → answers while paused (its why says what it answers when the reply depends on the held file);
 *  'paused' → does nothing while paused: say() (the caller's, once), answer() (a promise of it for an 'async' door) — a timer / boot
 *             door whose caller expects an answer, never a throw;
 *  anything else, or NO row → refused: error() thrown (sync) or rejected (async; an AsyncFunction without a row counts as async). → api. */
function pauseDoorsOf(api, table, { held, error, answer, say = () => {} }) {
  for (const name of Object.keys(api)) {
    const v = api[name];
    if (typeof v !== 'function') continue;
    const row = table[name];
    const cls = row ? row[0] : 'refused';
    if (cls === 'allow') continue;
    const kind = row ? row[1] : (v.constructor && v.constructor.name === 'AsyncFunction' ? 'async' : 'sync');
    if (cls === 'paused') api[name] = (...a) => { if (!held()) return v(...a); say(name); return kind === 'async' ? Promise.resolve(answer()) : answer(); };
    else api[name] = (...a) => { if (!held()) return v(...a); const e = error(); if (kind === 'async') return Promise.reject(e); throw e; };
  }
  return api;
}

module.exports = {
  createChannelStore, OWN_FOLDERS, readIndexFamily, replayIndexJournal, pauseDoorsOf, HELD_WALLS, writeJsonAtomic, safeSeg, INDEX_CHUNK, SWEEP_CHUNKS, WALK_SYNC_ROWS, WALK_SLICE_MS, walkSliced, STAMP_KEYS, STAMPS_BOUND, STAMPS_SLICE, STAMPS_FAIL_BEHIND_MS,
  RETENTION_DAYS, RETENTION_MAX_RECORDS, RETENTION_FLOOR_DAYS, DEDUP_MAX, TAIL_BYTES, OUTBOX_KEEP, OUTBOX_PRUNABLE, OUTBOX_PRUNE_RANK,
  SIDE_DEDUP_MAX, SIDE_READ_MAX, SIDE_DIR, SIDE_READ_BYTES, SIDE_COMPACT_BYTES, SIDE_KEEP_BYTES, PLACE_CACHE_MAX, PLACE_KEEP_MAX,
};

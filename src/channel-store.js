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
const crypto = require('crypto');
const { sideKey, validateSide } = require('./channel-record.js');
// lane lark-threads (A1): THE PLACE PATCH's PURE rules (widen-only, the fold, the compaction) — imports only channel-record
const Thr = require('./channel-thread.js');
const { compactSide } = require('./channel-reactions.js');

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
/** `_`-prefixed keys are runtime-only — never on disk (both index writers use this replacer). */
const RUNTIME_KEYS = (k, v) => (k.startsWith('_') ? undefined : v);

/** Atomic JSON write (tmp + rename). `_`-prefixed keys are runtime-only. */
function writeJsonAtomic(file, obj, { mode = null } = {}) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, RUNTIME_KEYS, 1), mode == null ? undefined : { mode });
  // `mode` only applies when the tmp file is CREATED; a leftover tmp from a
  // crashed write keeps its old bits, so the file that lands is chmod-ed too.
  if (mode != null) { try { fs.chmodSync(tmp, mode); } catch { /* a filesystem without modes */ } }
  fs.renameSync(tmp, file);
}

/** Atomic write of pre-serialized parts (tmp + rename) — the incremental index write's door. */
function writeBuffersAtomic(file, parts) {
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, 'w');
  try { for (const b of parts) { let o = 0; while (o < b.length) o += fs.writeSync(fd, b, o, b.length - o); } } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

/** One row of `conversations` exactly as `JSON.stringify(ix, RUNTIME_KEYS, 1)` prints it (depth 2), or null when the
 *  whole-file write would omit it. A JSON string never holds a raw newline, so re-indenting on '\n' is exact (a string
 *  pattern, never a /g regex: same bytes, one linear pass). */
function rowLine(key, value) {
  if (key.startsWith('_')) return null;
  const s = JSON.stringify(value, RUNTIME_KEYS, 1);
  return s === undefined ? null : `  ${JSON.stringify(key)}: ${s.replaceAll('\n', '\n  ')}`;
}
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

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
function createChannelStore({ dir, now = () => Date.now(), log = console, onWrite = null } = {}) {
  /** lane channel-threads: ONE hook every log writer calls AFTER its bytes are durable — `(adapterId, convId,
   *  {kind:'append'|'prepend'|'trim'|'side', fresh?, msgs?})` — so the engine's derived caches (the thread index,
   *  the message → conversation map) follow every writer, never a list of call sites. A throwing hook is logged. */
  const wrote = (adapterId, convId, what) => { if (typeof onWrite !== 'function') return; try { onWrite(adapterId, convId, what); } catch (e) { try { (log.warn || console.warn)('[channels] store write hook threw:', (e && e.message) || e); } catch { } } };
  if (!dir) throw new Error('channel-store: dir is required');
  const warn = (...a) => { try { (log.warn || log.log || console.warn).apply(log, a); } catch { } };
  const msgsDir = path.join(dir, 'msgs');
  const archiveDir = path.join(dir, 'archive');
  const indexFile = path.join(dir, 'index.json');
  const adaptersFile = path.join(dir, 'adapters.json');
  const auditFile = path.join(dir, 'audit.ndjson');

  fs.mkdirSync(msgsDir, { recursive: true });
  fs.mkdirSync(archiveDir, { recursive: true });

  // ── FAIL CLOSED ON AN UNREADABLE STORE FILE (r2, 2026-09-23 verifier: a
  // truncated groups.json read as EMPTY with no log line, and the first group
  // verb overwrote it — every group, membership, notify mode and report
  // marker gone). A MISSING file is an empty store; a file that exists but
  // cannot be parsed (or has the wrong shape) is RENAMED beside itself as
  // `<name>.corrupt-<ts>` — never unlinked — with ONE named log line, and the
  // store starts empty only once the bytes are safe. If even the rename fails
  // the family is BLOCKED: its door refuses every write rather than overwrite
  // the only copy. `quarantined` names what was set aside (the channels
  // engine files ONE "For you" item per entry).
  const quarantined = [];
  function loadJsonFamily(file, valid, empty) {
    const name = path.basename(file);
    const setAside = (why) => {
      const to = `${name}.corrupt-${new Date(now()).toISOString().replace(/[:.]/g, '-')}`;
      try { fs.renameSync(file, path.join(dir, to)); } catch (e) {
        warn(`[channels] ${name} is ${why} and could NOT be set aside (${(e && e.code) || (e && e.message)}) — writes to it are REFUSED until the file is fixed or moved by hand`);
        quarantined.push({ file: name, to: null, why, at: now(), blocked: true });
        return { value: empty(), blocked: `${name} is ${why} and could not be set aside — refusing to overwrite it (fix or move the file, then restart)` };
      }
      warn(`[channels] ${name} was ${why} — set aside as ${to} (its bytes kept, never overwritten); that store starts empty`);
      quarantined.push({ file: name, to, why, at: now() });
      return { value: empty(), blocked: null };
    };
    let text;
    try { text = fs.readFileSync(file, 'utf-8'); } catch (e) {
      if (e && e.code === 'ENOENT') return { value: empty(), blocked: null };
      return setAside(`unreadable (${(e && e.code) || (e && e.message)})`);
    }
    let v;
    try { v = JSON.parse(text); } catch (e) { return setAside(`corrupt JSON (${String((e && e.message) || e).slice(0, 80)})`); }
    if (!valid(v)) return setAside('not the expected shape');
    return { value: v, blocked: null };
  }

  /** A BLOCKED family's refusal (r3): a typed Error the routes answer as
   *  `503 {error, code:'store-blocked'}` — the panel words the code, the
   *  message names the file. */
  const blockedError = (msg) => { const e = new Error(msg); e.code = 'store-blocked'; e.status = 503; return e; };

  const ixLoad = loadJsonFamily(indexFile, (v) => v && typeof v === 'object' && v.conversations && typeof v.conversations === 'object', EMPTY_INDEX);
  let ix = ixLoad.value;
  const ixBlocked = ixLoad.blocked;

  let dirty = false;
  let debounce = null;
  let interval = null;
  let closed = false;
  const dedup = new Map(); // `${adapterId}/${convId}` -> Set<vendorId>
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
  let sweepAt = 0;
  const touchHooks = [];
  const flushStats = { full: 0, incremental: 0, fallback: 0, swept: 0, drift: 0, lastFull: 'boot' };
  let driftSaidAt = 0;         // the sweep's line: the first drift, then at most one per DRIFT_SAY_MS
  // VIBESPACE_CHANNELS_INDEX_VERIFY=1|<file> (the gates' census): every incremental write is compared with the
  // whole-file serialization; a difference is said (and appended to <file>) and the whole file is written instead
  const verifyTo = String((process.env && process.env.VIBESPACE_CHANNELS_INDEX_VERIFY) || '');
  const fire = (key) => { for (const h of touchHooks) { try { h(key); } catch (e) { warn('[channels] index touch hook threw:', (e && e.message) || e); } } };
  function touchKey(key) { dirtyKeys.add(key); if (curTouch) curTouch.add(key); else fire(key); }
  function touchAll(why) { if (!allDirty) flushStats.lastFull = why; allDirty = true; if (curTouch) curTouch.all = true; else fire(null); }
  // the view an update's fn receives: the live root, except that reaching `conversations` through it is a whole-map touch
  const touchView = new Proxy(ix, {
    get(t, p) { if (p === 'conversations') touchAll('update reached ix.conversations'); return t[p]; },
    set(t, p, v) { if (p === 'conversations') touchAll('update replaced ix.conversations'); t[p] = v; return true; },
    deleteProperty(t, p) { if (p === 'conversations') touchAll('update deleted ix.conversations'); return delete t[p]; },
  });

  const logPath = (adapterId, convId) => path.join(msgsDir, safeSeg(adapterId), `${safeSeg(convId)}.ndjson`);

  function markDirty() {
    dirty = true;
    // R4 verify r4: a change that lands AFTER close() (a wake queued behind one
    // in flight when the engine stopped holds its hits pending) is written
    // NOW — the debounce is gone, and an unflushed hold was a lost message
    if (closed) { try { flush(); } catch (e) { warn('[channels] index.json not written after close:', (e && e.message) || e); } return; }
    if (debounce) return;
    debounce = setTimeout(flushFromTimer, FLUSH_DEBOUNCE_MS);
    if (debounce.unref) debounce.unref();
  }

  // THE DEBOUNCED WRITE MAY NOT THROW (lane-dead-bridge, measured: a server whose table was full died HERE —
  // `EMFILE … index.json.tmp-…` from this timer — the same death session-status's timer caused at 12:03:17).
  // A failed write keeps the index dirty and retries (1 s … 60 s); a refusal is said, the server keeps running.
  let failures = 0;
  function flushFromTimer() {
    debounce = null;
    try { flush(); failures = 0; }
    catch (e) {
      failures++;
      const retryMs = Math.min(60000, 1000 * 2 ** Math.min(6, failures - 1));
      if (failures === 1 || failures % 10 === 0) warn(`[channels] index.json not written (${(e && e.code) || (e && e.message) || e}; attempt ${failures}) — kept in memory, retrying in ${Math.round(retryMs / 1000)} s`);
      if (!debounce && !closed) { debounce = setTimeout(flushFromTimer, retryMs); if (debounce.unref) debounce.unref(); }
    }
  }

  function flush({ full = false } = {}) {
    if (!dirty) return false;
    // every refusal is said (r3: a once-only line went silent after the first)
    if (ixBlocked) { warn('[channels] index.json not written: ' + ixBlocked); return false; }
    ix.updatedAt = now();
    writeIndex(full);
    dirty = false;   // only once it is on disk — a failed write stays owed (lane-dead-bridge)
    return true;
  }

  // ── THE INCREMENTAL WRITE (B-f32b): the same bytes as `writeJsonAtomic(indexFile, ix)`, from cached chunks ──
  const plainRows = (c) => !!c && typeof c === 'object' && !Array.isArray(c);
  function serializeChunk(c, conv) {
    const lines = [], kept = [];
    for (const k of c.keys) {
      if (!hasOwn(conv, k)) { if (layout && layout.chunkOf.get(k) === c) layout.chunkOf.delete(k); continue; }
      kept.push(k);
      const line = rowLine(k, conv[k]);
      if (line !== null) lines.push(line);
    }
    c.keys = kept; c.n = lines.length; c.buf = Buffer.from(lines.join(',\n'), 'utf8');
  }
  function buildLayout(conv) {
    const keys = Object.keys(conv);
    layout = { chunks: [], chunkOf: new Map() };
    for (let i = 0; i < keys.length; i += INDEX_CHUNK) {
      const c = { keys: keys.slice(i, i + INDEX_CHUNK), buf: null, n: 0 };
      layout.chunks.push(c);
      for (const k of c.keys) layout.chunkOf.set(k, c);
      serializeChunk(c, conv);
    }
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
    for (const c of stale) serializeChunk(c, conv);
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
  function writeIndex(full) {
    const conv = ix.conversations;
    if (!plainRows(conv)) { flushStats.fallback++; layout = null; allDirty = true; writeJsonAtomic(indexFile, ix); allDirty = false; dirtyKeys.clear(); return; }
    if (full || allDirty || !layout) { buildLayout(conv); flushStats.full++; } else { applyTouched(conv); flushStats.incremental++; }
    const wasFull = full || allDirty;
    allDirty = false; dirtyKeys.clear();   // the cache now holds memory; a failed disk write below stays owed via `dirty`
    let parts = assemble();
    if (verifyTo && !wasFull) {
      const want = JSON.stringify(ix, RUNTIME_KEYS, 1);
      const got = Buffer.concat(parts).toString('utf8');
      if (got !== want) {
        let at = 0; while (at < want.length && want[at] === got[at]) at++;
        const line = `[channels] index.json incremental write DRIFTED from the whole-file serialization (a row changed without entry()) near: ${JSON.stringify(want.slice(Math.max(0, at - 120), at + 60))}`;
        warn(line);
        if (verifyTo !== '1') { try { fs.appendFileSync(verifyTo, line + '\n'); } catch { } }
        buildLayout(conv); parts = [Buffer.from(want, 'utf8')];
      }
    }
    writeBuffersAtomic(indexFile, parts);
  }
  /** THE SWEEP (every interval tick): re-serialize the next SWEEP_CHUNKS cached chunks and compare. A difference is a
   *  row changed OUTSIDE `update()`/`entry()` (the one-door rule broken somewhere): it is written, and said once per
   *  sweep with its first key. Returns the drifted chunk count. */
  function sweep(n = SWEEP_CHUNKS) {
    if (!layout || allDirty || closed || !plainRows(ix.conversations)) return 0;
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
      drift++;
      if (!firstKey) {
        const a = old ? old.toString('utf8').split(/,\n(?=  ")/) : [], b = c.buf.toString('utf8').split(/,\n(?=  ")/);
        const j = b.findIndex((row, x) => row !== a[x]);
        const m = /^  ("(?:[^"\\]|\\.)*")/.exec(b[Math.max(0, j)] || '');
        try { firstKey = m ? JSON.parse(m[1]) : (c.keys[0] || '?'); } catch { firstKey = c.keys[0] || '?'; }
      }
      for (const k of c.keys) fire(k);
    }
    // verify r1: a row BORN outside `entry()` sits in no chunk — each cycle's end counts the map against the cache
    if (!drift && sweepAt >= layout.chunks.length && !dirtyKeys.size && Object.keys(conv).length !== layout.chunkOf.size) {
      drift = 1; firstKey = Object.keys(conv).find((k) => !layout.chunkOf.has(k)) || '?';
      touchAll('sweep: a row born outside entry()');
    }
    if (drift) {
      flushStats.drift += drift;
      const t = now();
      if (!driftSaidAt || t - driftSaidAt >= DRIFT_SAY_MS) { driftSaidAt = t; warn(`[channels] index.json: a conversation row changed outside update() (first: ${firstKey}; ${flushStats.drift} chunk(s) so far) — written now; find the writer`); }
      markDirty();
    }
    return drift;
  }

  // ── §5.1 THE SERIALIZED INDEX OWNER ─────────────────────────────────────
  // `update(fn)` mutates LIVE memory inside a promise chain, so overlapping
  // Lark and Gmail passes QUEUE rather than race. A rejected update must not
  // break the chain for everyone behind it — the chain swallows the rejection
  // and hands it to THIS caller only.
  let chain = Promise.resolve();
  function update(fn) {
    // r3: a BLOCKED index refuses the ACTION, not only the write — an update
    // that resolved while the flush was refused was a user action that
    // succeeded on screen and vanished at the next restart
    if (ixBlocked) return Promise.reject(blockedError(ixBlocked));
    const run = chain.then(() => {
      const t = curTouch = new Set();
      // verify r1: the rows are marked again at the update's END — a write inside an async fn's await cleared their
      // marks, and the fn may change them after it (a no-op for a sync fn: no write can run inside it)
      const done = () => { curTouch = null; if (t.all) { touchAll('update reached the whole map'); } else for (const k of t) { dirtyKeys.add(k); fire(k); } };
      let r;
      try { r = fn(touchView); } catch (e) { done(); throw e; }
      if (r && typeof r.then === 'function') return Promise.resolve(r).finally(done);
      done();
      return r;
    }).then((r) => { markDirty(); return r; });
    chain = run.then(() => {}, () => {});
    return run;
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
  function liveTable(name) { return ix[name]; }

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
      if (layout && layout.chunkOf.has(key)) touchAll('a row re-born before its old place was rewritten');   // verify r1: the file keeps the map's order
      e = ix.conversations[key] = {
        key, id: convId, adapterId, vendorId: convId, title: '', kind: 'group',
        participants: '', lastAt: null, unread: 0, tracked: false, anchor: null,
        access: [], watchers: [], filterId: null, policy: null, pendingTodoId: null,
        reachEntries: [], stats: { hits7d: 0, msgs7d: 0 },
        convCaps: null,
        lane: { via: 'poll', lastPushAt: null, lastPollAt: null, lastScanAt: null, firstSeenByPoll: 0, firstSeenTotal: 0 },
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
    fs.mkdirSync(path.dirname(fp), { recursive: true });
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
    for (const r of fresh) if (Number.isFinite(r.at) && (lastAt === null || r.at > lastAt)) { lastAt = r.at; lastText = typeof r.text === 'string' ? r.text : null; }
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
    const fd = fs.openSync(fp, 'a+');
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

  /**
   * ONE record by its `vendorId` (R3 §23 — the attachment route names the
   * message that carries the picture): the same backward window walk as
   * `readTail`, but it stops at the FIRST window that holds the id and parses
   * only the line whose bytes name it — so a picture in the visible tail
   * costs one window, and one older than the newest 5000 records is still
   * found. `null` when no line names it (or the log is unreadable: a reader).
   */
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
   *  re-derivation — invariant 7: cached in the index, never only there). */
  function countSince(adapterId, convId, sinceAt) {
    let n = 0;
    for (const r of readTail(adapterId, convId, { limit: DEDUP_MAX })) if (Number(r.at) > Number(sinceAt || 0)) n++;
    return n;
  }

  /**
   * Retention (invariant 5). Streams the survivors to a temp file and renames.
   * Returns `{ removed, kept }`; a log that does not exist is `{0,0}`.
   */
  function trim(adapterId, convId, { days = RETENTION_DAYS, maxRecords = RETENTION_MAX_RECORDS, floorDays = RETENTION_FLOOR_DAYS } = {}) {
    const fp = logPath(adapterId, convId);
    let lines;
    try { lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean); } catch {
      // no message log: a side line for a conversation that never got one is "message gone" (attack 13)
      let side = null;
      try { side = trimSide(adapterId, convId, { liveIds: new Set() }); } catch { }
      return { removed: 0, kept: 0, side };
    }
    const t = now();
    const byDays = t - days * 86400e3;
    // "whichever is smaller" = the LATER cutoff of the two bounds…
    const byCount = lines.length > maxRecords ? recAt(lines[lines.length - maxRecords]) : -Infinity;
    // …and the floor then pulls it back: nothing newer than `floorDays` is ever dropped.
    const cutoff = Math.min(Math.max(byDays, byCount), t - floorDays * 86400e3);
    const kept = lines.filter((l) => recAt(l) >= cutoff);
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
  function recVendorId(line) { try { const v = JSON.parse(line).vendorId; return v ? String(v) : null; } catch { return null; } }
  function recAt(line) { try { const n = Number(JSON.parse(line).at); return Number.isFinite(n) ? n : 0; } catch { return 0; } }

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
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    let lines = [];
    try { lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const parsed = [];
    for (const l of lines) { try { parsed.push(JSON.parse(l)); } catch { /* an unparseable line stays unparseable: dropped from the rewrite like readTail skips it */ } }
    const merged = parsed.concat(fresh).sort(cmpRecord);
    const tmp = `${fp}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, merged.map((r) => JSON.stringify(r)).join('\n') + '\n');
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
    fs.mkdirSync(path.dirname(fp), { recursive: true });
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
  const SIDE_HEAD_RE = /^\{"k":"(?:rx|th|pl)","msg":("(?:[^"\\]|\\.){1,1100}")/;
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
    const groups = order.map((k) => compactSide(byMsg.get(k)).map((x) => JSON.stringify(x)));
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
   */
  async function search(adapterId, q, { limit = 100, maxBytes = 64 * 1024 * 1024, convIds = null } = {}) {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) return { results: [], scannedBytes: 0, truncated: false, files: 0 };
    const dir = path.join(msgsDir, safeSeg(adapterId));
    let names = [];
    try { names = await fs.promises.readdir(dir); } catch { return { results: [], scannedBytes: 0, truncated: false, files: 0 }; }
    names = names.filter((n) => n.endsWith('.ndjson'));
    const wanted = convIds ? new Set([...convIds].map((c) => `${safeSeg(c)}.ndjson`)) : null;
    let scanned = 0, truncated = false, files = 0;
    const hits = [];
    for (const n of names) {
      if (wanted && !wanted.has(n)) continue;
      const fp = path.join(dir, n);
      let st; try { st = await fs.promises.stat(fp); } catch { continue; }
      if (scanned + st.size > maxBytes) { truncated = true; break; }
      let text; try { text = await fs.promises.readFile(fp, 'utf-8'); } catch { continue; }
      scanned += st.size; files++;
      for (const line of text.split('\n')) {
        if (!line || !line.toLowerCase().includes(needle)) continue;
        let r; try { r = JSON.parse(line); } catch { continue; }
        const hay = `${r.text || ''}\n${(r.author && (r.author.name || '')) || ''}\n${(r.attachments || []).map((a) => (a && a.role !== 'body' ? a.name : '')).join(' ')}`.toLowerCase();
        if (hay.includes(needle)) hits.push(r.convId ? patchedOne(adapterId, String(r.convId), r) : r);
      }
      if (hits.length > limit * 4) { hits.sort((a, b) => cmpRecord(b, a)); hits.length = limit * 2; }
    }
    hits.sort((a, b) => cmpRecord(b, a));
    if (hits.length > limit) truncated = true;
    return { results: hits.slice(0, limit), scannedBytes: scanned, truncated, files };
  }

  // ── ATTACHMENTS, fetched on demand, LRU per ACCOUNT (2026-09-26) ─────────
  const attRoot = path.join(dir, 'attachments');
  const attHash = (id) => crypto.createHash('sha1').update(String(id)).digest('hex');
  const attDir = (adapterId, convId) => path.join(attRoot, safeSeg(adapterId), safeSeg(convId));
  const lruFile = (adapterId) => path.join(attRoot, safeSeg(adapterId), 'lru.json');
  const lruCache = new Map();   // adapterId -> ledger (read once, written atomically)
  function lruOf(adapterId) {
    let l = lruCache.get(adapterId);
    if (l) return l;
    try { l = JSON.parse(fs.readFileSync(lruFile(adapterId), 'utf-8')); } catch { l = null; }
    if (!l || typeof l !== 'object' || !l.items || typeof l.items !== 'object') l = { v: 1, items: {} };
    lruCache.set(adapterId, l);
    return l;
  }
  function lruSave(adapterId) {
    lruDirty.delete(adapterId);
    fs.mkdirSync(path.join(attRoot, safeSeg(adapterId)), { recursive: true, mode: 0o700 });
    writeJsonAtomic(lruFile(adapterId), lruOf(adapterId), { mode: 0o600 });
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
    for (const id of [...lruDirty]) { try { lruSave(id); } catch (e) { warn('[channels] attachment LRU write failed:', (e && e.message) || e); } }
  }
  function lruTouch(adapterId) {
    lruDirty.add(adapterId);
    if (closed) { lruFlush(); return; }
    if (!lruTimer) { lruTimer = setTimeout(lruFlush, LRU_TOUCH_MS); if (lruTimer.unref) lruTimer.unref(); }
  }
  /** A cached attachment: `{file, meta}` or null. A hit refreshes its LRU stamp. */
  function attachmentGet(adapterId, convId, attId) {
    const d = attDir(adapterId, convId);
    const h = attHash(attId);
    const file = path.join(d, h);
    let meta;
    try { meta = JSON.parse(fs.readFileSync(file + '.json', 'utf-8')); } catch { return null; }
    try { fs.statSync(file); } catch { return null; }
    const l = lruOf(adapterId);
    const k = `${safeSeg(convId)}/${h}`;
    if (l.items[k]) { l.items[k].usedAt = now(); lruTouch(adapterId); }
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
  async function attachmentPut(adapterId, convId, attId, { data, name = null, mime = null } = {}, { budgetBytes = 5120 * 1024 * 1024 } = {}) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data || '');
    const d = attDir(adapterId, convId);
    await fs.promises.mkdir(d, { recursive: true, mode: 0o700 });
    const h = attHash(attId);
    const file = path.join(d, h);
    const tmp = `${file}.tmp-${process.pid}-${++attSeq}`;
    await fs.promises.writeFile(tmp, buf, { mode: 0o600 });
    try { await fs.promises.chmod(tmp, 0o600); } catch {}
    await fs.promises.rename(tmp, file);
    const meta = { id: String(attId), name: name ? String(name).slice(0, 256) : null, mime: mime ? String(mime).slice(0, 128) : null, bytes: buf.length, at: now() };
    writeJsonAtomic(file + '.json', meta, { mode: 0o600 });
    const l = lruOf(adapterId);
    const key = `${safeSeg(convId)}/${h}`;
    l.items[key] = { bytes: buf.length, usedAt: now() };
    const evicted = [];
    let total = Object.values(l.items).reduce((n, x) => n + (Number(x && x.bytes) || 0), 0);
    if (total > budgetBytes) {
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
    lruSave(adapterId);
    return { file, meta, evicted, totalBytes: total };
  }
  /** The account's cache footprint (the card may say it). */
  function attachmentUsage(adapterId) {
    const l = lruOf(adapterId);
    const items = Object.values(l.items);
    return { files: items.length, bytes: items.reduce((n, x) => n + (Number(x && x.bytes) || 0), 0) };
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

  // ── adapter records: THE SAME SINGLE OWNER AS THE INDEX (invariant 3, r2) ──
  // Their tokens are encrypted by the caller, never here. Read ONCE, mutated
  // LIVE inside a serialized door, and written by that door only — there is
  // deliberately no `writeAdapters(obj)` for a caller to hand a private copy
  // to, for the same reason there is no `writeIndex`.
  const adLoad = loadJsonFamily(adaptersFile, (v) => v && typeof v === 'object' && Array.isArray(v.adapters), () => ({ v: 1, adapters: [] }));
  let ad = adLoad.value;
  let adChain = Promise.resolve();
  function adaptersUpdate(fn) {
    if (adLoad.blocked) return Promise.reject(blockedError(adLoad.blocked));
    // 0600 (2.369.165): the records carry sealed tokens AND an account's own
    // client secret (`credential.appSecretEnc`) — owner-only like the key file.
    const run = adChain.then(() => fn(ad)).then((r) => { writeJsonAtomic(adaptersFile, ad, { mode: 0o600 }); return r; });
    adChain = run.then(() => {}, () => {});
    return run;
  }

  // ── the outbox (design §9, P3): proposals + their state machine, THE SAME
  // SINGLE-OWNER SHAPE (invariant 3). Read once, mutated live inside a
  // serialized door, written by that door only — atomic JSON, because the
  // approval card and the Outbox window render from ONE store and must never
  // disagree (§9.2). Bounded: terminal proposals past OUTBOX_KEEP fall off
  // oldest-first at write time (the audit log keeps the record for ever).
  const outboxFile = path.join(dir, 'outbox.json');
  const obLoad = loadJsonFamily(outboxFile, (v) => v && typeof v === 'object' && v.proposals && typeof v.proposals === 'object', () => ({ v: 1, proposals: {}, seq: 0 }));
  let ob = obLoad.value;
  if (!Number.isFinite(ob.seq)) ob.seq = 0;
  let obChain = Promise.resolve();
  function outboxPrune() {
    const all = Object.values(ob.proposals);
    if (all.length <= OUTBOX_KEEP) return;
    const rank = (p) => (Number.isFinite(OUTBOX_PRUNE_RANK[p.state]) ? OUTBOX_PRUNE_RANK[p.state] : 2);
    const done = all.filter((p) => p && OUTBOX_PRUNABLE.includes(p.state)).sort((a, b) => (rank(a) - rank(b)) || ((a.updatedAt || a.at || 0) - (b.updatedAt || b.at || 0)));
    for (const p of done.slice(0, all.length - OUTBOX_KEEP)) delete ob.proposals[p.id];
  }
  function outboxUpdate(fn) {
    if (obLoad.blocked) return Promise.reject(blockedError(obLoad.blocked));
    const run = obChain.then(() => fn(ob)).then((r) => { outboxPrune(); obSnap = null; writeJsonAtomic(outboxFile, ob); return r; }, (err) => { obSnap = null; throw err; });
    obChain = run.then(() => {}, () => {});
    return run;
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
  const grLoad = loadJsonFamily(groupsFile, (v) => v && typeof v === 'object' && v.groups && typeof v.groups === 'object' && !Array.isArray(v.groups), () => ({ v: 1, groups: {} }));
  let gr = grLoad.value;
  let grChain = Promise.resolve();
  function groupsUpdate(fn) {
    if (grLoad.blocked) return Promise.reject(blockedError(grLoad.blocked));
    const run = grChain.then(() => fn(gr)).then((r) => { writeJsonAtomic(groupsFile, gr); return r; });
    grChain = run.then(() => {}, () => {});
    return run;
  }
  function groupsSnapshot() { return JSON.parse(JSON.stringify(gr)); }

  // ── lane lark-threads (B3): THE OWNER'S NAMES FOR AUTHORS (the VibeSpace 备注) — `aliases.json`
  //    `{v:1, aliases: {[adapterId]: {[authorId]: {alias, at}}}}`, ONE serialized owner like groups.json, set aside
  //    (never overwritten) when unreadable
  const aliasesFile = path.join(dir, 'aliases.json');
  const alLoad = loadJsonFamily(aliasesFile, (v) => v && typeof v === 'object' && v.aliases && typeof v.aliases === 'object' && !Array.isArray(v.aliases), () => ({ v: 1, aliases: {} }));
  let al = alLoad.value;
  let alChain = Promise.resolve();
  function aliasesUpdate(fn) {
    if (alLoad.blocked) return Promise.reject(blockedError(alLoad.blocked));
    const run = alChain.then(() => fn(al)).then((r) => { writeJsonAtomic(aliasesFile, al); return r; });
    alChain = run.then(() => {}, () => {});
    return run;
  }

  // ── the groups' WAKE PACE ledger (r2): who woke whom when — the PURE rules
  // are src/channel-groups.js paceVerdict/paceGrant/paceRefund, the engine
  // owns the calls. Held LIVE, written atomically a moment after a change
  // (a burst of grants is one write) and on close — a restart keeps every
  // floor (the in-memory Map it replaces forgot them all). Small by
  // construction: the engine prunes it to its windows on every change.
  const paceFile = path.join(dir, 'wake-pace.json');
  const pcLoad = loadJsonFamily(paceFile, (v) => v && typeof v === 'object' && !Array.isArray(v), () => ({ v: 1, pairs: {}, senders: {} }));
  let pc = pcLoad.value;
  let paceDirty = false;
  let paceTimer = null;
  function paceFlush() {
    if (paceTimer) { clearTimeout(paceTimer); paceTimer = null; }
    if (!paceDirty) return;
    paceDirty = false;
    // a BLOCKED ledger is never overwritten (the floors live in memory; said each time)
    if (pcLoad.blocked) { warn('[channels] wake-pace.json not written: ' + pcLoad.blocked); return; }
    try { writeJsonAtomic(paceFile, pc); } catch (e) { warn('[channels] wake-pace.json not written:', (e && e.message) || e); }
  }
  function paceSet(next) {
    pc = next;
    paceDirty = true;
    if (closed) { paceFlush(); return; }
    if (!paceTimer) { paceTimer = setTimeout(paceFlush, 100); if (paceTimer.unref) paceTimer.unref(); }
  }

  // ── THE DISPATCH LEDGER (lane worker-dispatch verify r1 ②): the same shape as the pace ledger — held LIVE, written
  // atomically a moment after a change and on close, a BLOCKED file never overwritten (said each time). The PURE rules
  // are src/dispatch-model.js replayVerdict; the groups engine owns the calls and prunes it to the model's windows.
  const dispatchFile = path.join(dir, 'dispatch-ledger.json');
  const dlLoad = loadJsonFamily(dispatchFile, (v) => v && typeof v === 'object' && !Array.isArray(v) && v.entries && typeof v.entries === 'object', () => ({ v: 1, entries: {} }));
  let dl = dlLoad.value;
  let dlDirty = false;
  let dlTimer = null;
  function dispatchFlush() {
    if (dlTimer) { clearTimeout(dlTimer); dlTimer = null; }
    if (!dlDirty) return;
    dlDirty = false;
    if (dlLoad.blocked) { warn('[channels] dispatch-ledger.json not written: ' + dlLoad.blocked); return; }
    try { writeJsonAtomic(dispatchFile, dl); } catch (e) { warn('[channels] dispatch-ledger.json not written:', (e && e.message) || e); }
  }
  function dispatchSet(next) {
    dl = next;
    dlDirty = true;
    if (closed) { dispatchFlush(); return; }
    if (!dlTimer) { dlTimer = setTimeout(dispatchFlush, 100); if (dlTimer.unref) dlTimer.unref(); }
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

  interval = setInterval(() => {   // every tick sweeps (B-f32b), then the same guarded write (lane-dead-bridge)
    try { sweep(); } catch (e) { warn('[channels] index sweep failed:', (e && e.message) || e); }
    if (dirty && !debounce) flushFromTimer();
  }, FLUSH_INTERVAL_MS);
  if (interval.unref) interval.unref();

  function close() {
    closed = true;
    if (debounce) { clearTimeout(debounce); debounce = null; }
    if (interval) { clearInterval(interval); interval = null; }
    flush({ full: true });   // B-f32b: the last write is the whole serialization, not the cache
    paceFlush();
    dispatchFlush();
    lruFlush();
  }

  return {
    dir, indexFile, adaptersFile, auditFile, archiveDir, outboxFile, groupsFile, aliasesFile, logPath,
    // `blocked()` = the refusal sentence while a family's file could not be set aside (null = writable)
    index: {
      update, snapshot, peek, has, live: liveConversations, rows, touch, table: liveTable, entry, flush, isDirty: () => dirty, blocked: () => ixBlocked || null,
      // B-f32b: `onTouch(fn)` = fn(key) after an update touched that row, fn(null) after it reached the whole map (the
      // engine's kept unread total); `sweep()` / `flushStats()` for the gates
      onTouch: (fn) => { if (typeof fn === 'function') touchHooks.push(fn); }, sweep, flushStats: () => ({ ...flushStats, chunks: layout ? layout.chunks.length : 0 }),
    },
    adapters: { update: adaptersUpdate, live: () => ad, blocked: () => adLoad.blocked || null },
    outbox: { update: outboxUpdate, snapshot: outboxSnapshot, nextId: outboxNextId, live: () => ob },
    groups: { update: groupsUpdate, snapshot: groupsSnapshot, live: () => gr },
    aliases: { update: aliasesUpdate, live: () => al, blocked: () => alLoad.blocked || null },
    pace: { live: () => pc, set: paceSet, flush: paceFlush },
    dispatch: { live: () => dl, set: dispatchSet, flush: dispatchFlush },
    quarantined,
    appendRecords, readTail, countSince, trim, audit, auditTail, close,
    // 2026-09-26 (the aggregated IM): backfill, search, attachments
    prependRecords, oldestRecord, search, attachmentGet, attachmentPut, attachmentUsage,
    // R3 (§23): one record by its vendorId (the attachment's owner), the LRU ledger's coalesced flush
    findRecord, lruFlush,
    // lane channel-threads: the side log (invariant 8) + which conversation holds a message
    appendSide, readSide, trimSide, sidePath, locateMessage,
    // lane lark-threads (A1): THE PLACE DOOR (widen-only) + the folded patches a reader applies
    widenPlaces, placesOf,
  };
}

module.exports = {
  createChannelStore, writeJsonAtomic, safeSeg, INDEX_CHUNK, SWEEP_CHUNKS,
  RETENTION_DAYS, RETENTION_MAX_RECORDS, RETENTION_FLOOR_DAYS, DEDUP_MAX, TAIL_BYTES, OUTBOX_KEEP, OUTBOX_PRUNABLE, OUTBOX_PRUNE_RANK,
  SIDE_DEDUP_MAX, SIDE_READ_MAX, SIDE_DIR, SIDE_READ_BYTES, SIDE_COMPACT_BYTES, SIDE_KEEP_BYTES, PLACE_CACHE_MAX, PLACE_KEEP_MAX,
};

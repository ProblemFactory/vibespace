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
 *     <file>.corrupt-<ts>            a JSON store that could not be read at boot, SET ASIDE with its
 *                                    bytes intact (r2) — never unlinked, never overwritten
 *     audit.ndjson                   APPEND-ONLY, rolled by DATE into archive/
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
 */
const fs = require('fs');
const path = require('path');

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

const EMPTY_INDEX = () => ({ v: 1, conversations: {}, updatedAt: 0 });

/** Atomic JSON write (tmp + rename). `_`-prefixed keys are runtime-only. */
function writeJsonAtomic(file, obj, { mode = null } = {}) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, (k, v) => (k.startsWith('_') ? undefined : v), 1), mode == null ? undefined : { mode });
  // `mode` only applies when the tmp file is CREATED; a leftover tmp from a
  // crashed write keeps its old bits, so the file that lands is chmod-ed too.
  if (mode != null) { try { fs.chmodSync(tmp, mode); } catch { /* a filesystem without modes */ } }
  fs.renameSync(tmp, file);
}

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
function createChannelStore({ dir, now = () => Date.now(), log = console } = {}) {
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

  const logPath = (adapterId, convId) => path.join(msgsDir, safeSeg(adapterId), `${safeSeg(convId)}.ndjson`);

  function markDirty() {
    dirty = true;
    if (debounce || closed) return;
    debounce = setTimeout(() => { debounce = null; flush(); }, FLUSH_DEBOUNCE_MS);
    if (debounce.unref) debounce.unref();
  }

  function flush() {
    if (!dirty) return false;
    // every refusal is said (r3: a once-only line went silent after the first)
    if (ixBlocked) { warn('[channels] index.json not written: ' + ixBlocked); return false; }
    dirty = false;
    ix.updatedAt = now();
    writeJsonAtomic(indexFile, ix);
    return true;
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
    const run = chain.then(() => fn(ix)).then((r) => { markDirty(); return r; });
    chain = run.then(() => {}, () => {});
    return run;
  }

  /**
   * A snapshot read for rendering. IT IS NOT A LOCK: compute from it, then
   * apply inside `update()`. Nothing needs more — the ACL, the filter and the
   * policy are all PURE and take their inputs as arguments.
   */
  function snapshot() { return JSON.parse(JSON.stringify(ix)); }

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
      e = ix.conversations[key] = {
        key, id: convId, adapterId, vendorId: convId, title: '', kind: 'group',
        participants: '', lastAt: null, unread: 0, tracked: false, anchor: null,
        assignment: null, filterId: null, policy: null, pendingTodoId: null,
        reachEntries: [], stats: { hits7d: 0, msgs7d: 0 },
        convCaps: null,
        lane: { via: 'poll', lastPushAt: null, lastPollAt: null, lastScanAt: null, firstSeenByPoll: 0, firstSeenTotal: 0 },
        readAt: 0, createdAt: now(),
      };
    }
    return e;
  }

  // ── the append-only message log ──────────────────────────────────────────
  function dedupSet(adapterId, convId) {
    const key = `${adapterId}/${convId}`;
    let s = dedup.get(key);
    if (s) return s;
    s = new Set();
    // STRICT (r5): this is the WRITE-side reader. A log that cannot be read
    // is not a log that holds nothing — an EMFILE/EIO/EACCES here used to be
    // an EMPTY set, CACHED, so the next append wrote the whole re-offered
    // batch as "fresh" and a replayed boundary record landed twice for ever
    // (the r4 class one layer over: a witness that cannot be heard read as a
    // witness saying "nothing"). Only ENOENT is "no log yet"; anything else
    // throws out of `appendRecords`, the pass fails with the anchor unmoved,
    // and the retry re-reads — a re-read costs a page, a guess costs a
    // phantom message nobody removes. The set is NOT cached on the throw.
    for (const r of readTail(adapterId, convId, { limit: DEDUP_MAX, strict: true })) s.add(r.vendorId);
    dedup.set(key, s);
    return s;
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
    for (const r of list) {
      if (!r || !r.vendorId) continue;
      if (set.has(r.vendorId) || inBatch.has(r.vendorId)) { duplicates++; continue; }
      inBatch.add(r.vendorId);
      fresh.push(r);
    }
    if (!fresh.length) return { appended: 0, duplicates, lastAt: null, lastText: null, healed: false, freshAt: [], fresh: [] };
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
    return { appended: fresh.length, duplicates, lastAt, lastText, healed, freshAt: fresh.map((r) => (Number.isFinite(r.at) ? r.at : 0)), fresh: fresh.slice() };
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
    return out.slice(-want);
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
    try { lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean); } catch { return { removed: 0, kept: 0 }; }
    const t = now();
    const byDays = t - days * 86400e3;
    // "whichever is smaller" = the LATER cutoff of the two bounds…
    const byCount = lines.length > maxRecords ? recAt(lines[lines.length - maxRecords]) : -Infinity;
    // …and the floor then pulls it back: nothing newer than `floorDays` is ever dropped.
    const cutoff = Math.min(Math.max(byDays, byCount), t - floorDays * 86400e3);
    const keep = lines.filter((l) => recAt(l) >= cutoff);
    if (keep.length === lines.length) return { removed: 0, kept: keep.length };
    const tmp = `${fp}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, keep.length ? keep.join('\n') + '\n' : '');
    fs.renameSync(tmp, fp);
    dedup.delete(`${adapterId}/${convId}`);
    return { removed: lines.length - keep.length, kept: keep.length };
  }
  function recAt(line) { try { const n = Number(JSON.parse(line).at); return Number.isFinite(n) ? n : 0; } catch { return 0; } }

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
    const done = all.filter((p) => p && ['sent', 'failed', 'rejected', 'expired'].includes(p.state)).sort((a, b) => (a.updatedAt || a.at || 0) - (b.updatedAt || b.at || 0));
    for (const p of done.slice(0, all.length - OUTBOX_KEEP)) delete ob.proposals[p.id];
  }
  function outboxUpdate(fn) {
    if (obLoad.blocked) return Promise.reject(blockedError(obLoad.blocked));
    const run = obChain.then(() => fn(ob)).then((r) => { outboxPrune(); writeJsonAtomic(outboxFile, ob); return r; });
    obChain = run.then(() => {}, () => {});
    return run;
  }
  function outboxSnapshot() { return JSON.parse(JSON.stringify(ob)); }
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

  /** The audit log's LIVE tail (today's file), newest last, bounded. A
   *  reader for THIS instance's own record — it never leaves the instance. */
  function auditTail({ limit = 200 } = {}) {
    let text = '';
    try { text = fs.readFileSync(auditFile, 'utf-8'); } catch { return []; }
    const out = [];
    for (const line of text.split('\n')) { if (!line) continue; try { out.push(JSON.parse(line)); } catch {} }
    return out.slice(-Math.max(1, limit));
  }

  interval = setInterval(flush, FLUSH_INTERVAL_MS);
  if (interval.unref) interval.unref();

  function close() {
    closed = true;
    if (debounce) { clearTimeout(debounce); debounce = null; }
    if (interval) { clearInterval(interval); interval = null; }
    flush();
    paceFlush();
  }

  return {
    dir, indexFile, adaptersFile, auditFile, archiveDir, outboxFile, groupsFile, logPath,
    index: { update, snapshot, entry, flush, isDirty: () => dirty },
    adapters: { update: adaptersUpdate, live: () => ad },
    outbox: { update: outboxUpdate, snapshot: outboxSnapshot, nextId: outboxNextId, live: () => ob },
    groups: { update: groupsUpdate, snapshot: groupsSnapshot, live: () => gr },
    pace: { live: () => pc, set: paceSet, flush: paceFlush },
    quarantined,
    appendRecords, readTail, countSince, trim, audit, auditTail, close,
  };
}

module.exports = {
  createChannelStore, writeJsonAtomic, safeSeg,
  RETENTION_DAYS, RETENTION_MAX_RECORDS, RETENTION_FLOOR_DAYS, DEDUP_MAX, TAIL_BYTES, OUTBOX_KEEP,
};

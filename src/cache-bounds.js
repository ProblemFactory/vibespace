'use strict';
// THE RESIDENT CACHES' CEILINGS (B-9428). The owner's production heap snapshot (2026-10-09, 1.17 GB used):
// the WHOLE usage ledger parsed and resident (406 MB), a transcript-tail cache bounded only by COUNT
// (328 MB), the estimator's anchor lines (46 MB). Each cache now has a ceiling and a name; the boot census
// reads them back (cacheCensus). PURE: no fs, no clock — the owners pass both in.
//
// The ledger's split, read by every reader of UsageHistory:
//  · HOT  = full rows with ts ≥ the cutoff (ledgerCutoff: the later of now − the window and the edge where
//    the newest rows pass the byte ceiling). The Usage window's default views and the pool's 7-day taint
//    read here.
//  · COLD = everything older, kept ONLY as the columns the sync money readers price (ColdSlab: ts, five
//    token counts, five interned names, three 53-bit id hashes, the row's shard + byte offset, and a sorted
//    hash index per id kind ≈ 92 bytes a row, not ~560): the estimator's learnRates pairs and costBetween
//    stay synchronous and exact. A reader that needs a cold row's other fields reads THAT line (shard,
//    offset) — the All-time pivots in a worker (usage-cold-worker.js), the meta popup one line at a time.

const MB = 1024 * 1024;
const DAY_MS = 86400e3;
// Full rows for the last 45 days: the Usage window's today / 7 d / 30 d views and the pool's 7-day dark
// taint answer from memory with two weeks of slack; older pivots stream from the shards.
const LEDGER_WINDOW_DAYS = 45;
// …and never more than 96 MB of row bytes: the owner's ledger writes ~10 MB a day, so there the ceiling,
// not the days, is the bound (~9 days of full rows).
const LEDGER_HOT_MAX_BYTES = 96 * MB;
// The transcript-tail cache's entries ARE the parsed tails its readers return (messages + line starts):
// 48 MB of tail bytes keeps the dozen conversations an owner switches between; one 32 MiB tail still fits.
// r2 (verify #7): the WORKING SET is never evicted — every tail touched in the last 10 min stays (a WS
// reconnect re-attaches every live session through the sync readers); idle tails go past a 128 MB floor.
const JSONL_CACHE_MAX_BYTES = 128 * MB;
const JSONL_CACHE_IDLE_MS = 10 * 60e3;
const JSONL_CACHE_MAX_ENTRIES = 30; // the old count bound — r3: it evicts IDLE tails only
// r3 (verify #3/#19): the live set has a ceiling too — past 512 MB of live tails the oldest-touched go and
// the census says so (50 conversations × the snapshot's 11 MB mean fit; 30 × the 32 MiB worst case do not).
const JSONL_LIVE_MAX_BYTES = 512 * MB;
// The estimator's anchor lines: the owner's whole anchor set is 29 MB of files and each sweep reads every
// identity — a ceiling under the working set re-parses on the loop every sweep, so this bounds growth.
// r2 (verify #3/#11): every identity asked for in the last 30 min (a sweep reads each one) stays; the
// 32 MB floor applies only to identities idle longer — a byte LRU under the live set thrashed every sweep.
const ESTIMATOR_LINES_MAX_BYTES = 32 * MB;
const ESTIMATOR_LINES_IDLE_MS = 30 * 60e3;
const ESTIMATOR_LIVE_MAX_BYTES = 128 * MB; // r3: the live identities' ceiling (4× the owner's whole anchor set today)
// r3 (verify #2): one fold may not hold the queue for ever — the 10× (4.9 GB) ledger's All-time folds in
// 129 s, so 10 min is ~4× that; past it the worker is terminated and every waiter told.
const COLD_FOLD_DEADLINE_MS = 10 * 60e3;
// r3 (verify #14): at most 4 distinct folds wait (the Usage window asks ≤ 2 at a time); a 5th is refused.
const COLD_QUEUE_MAX = 4;
// r4 (verify #5): the fold worker materialises a group ≈ 3.4× its raw bytes; a group is read in chunks of
// 100 000 rows (≈ 40 MB raw at the fixture's 400 B/row ⇒ ~140 MB in the worker), whatever the month's size.
const COLD_ROW_BUDGET = 100000;
// r4 (verify #2): a terminated fold worker that has not exited 5 s later is STUCK (blocked in a sync read —
// the storage is not answering); no new worker starts while one is.
const COLD_TERMINATE_DEADLINE_MS = 5000;
// The cold columns' DECLARED ceiling (verify #2): 256 MB ≈ 2.8 M cold rows, ~2.3× the owner's ledger. Past
// it the rows still load (the money readers' numbers never change) and the census says OVER.
const COLD_COLUMNS_MAX_BYTES = 256 * MB;

/** LRU by bytes: drop the OLDEST entries (Map insertion order) until bytes ≤ maxBytes and size ≤
 *  maxEntries. The NEWEST entry always stays: one oversized entry is still cached (a sync re-read on every
 *  call would cost more than its bytes). → {bytes, evicted}. */
function evictLru(map, { maxBytes = Infinity, maxEntries = Infinity, sizeOf }) {
  let bytes = 0;
  for (const v of map.values()) bytes += sizeOf(v) || 0;
  let evicted = 0;
  while (map.size > 1 && (bytes > maxBytes || map.size > maxEntries)) {
    const k = map.keys().next().value;
    bytes -= sizeOf(map.get(k)) || 0;
    map.delete(k);
    evicted++;
  }
  return { bytes, evicted };
}

/** WORKING-SET eviction: entries touched within idleMs (usedAt) are the live set. IDLE entries go
 *  oldest-first while bytes > floorBytes or the count > maxEntries (r3: the count never evicts a live
 *  entry). The LIVE set has its own ceiling liveMaxBytes — r4 (verify #3): ADMISSION, not cyclic eviction:
 *  past it the NEWEST entry (the one just put) is served but not kept (notAdmitted), so a cyclic working set
 *  larger than the ceiling keeps hitting on the kept part; only if still over (an entry grew) do the
 *  oldest-touched live entries go (liveEvicted). → {bytes, evicted, live, liveBytes, liveEvicted, notAdmitted}. */
function evictIdle(map, { floorBytes = Infinity, maxEntries = Infinity, idleMs = Infinity, liveMaxBytes = Infinity, now = 0, sizeOf, usedAt }) {
  // (the newest entry is admitted unless the live set would pass its ceiling — see below)
  let bytes = 0, live = 0, liveBytes = 0;
  const isLive = (v) => now - (usedAt(v) || 0) < idleMs;
  for (const v of map.values()) { const b = sizeOf(v) || 0; bytes += b; if (isLive(v)) { live++; liveBytes += b; } }
  let evicted = 0, liveEvicted = 0, notAdmitted = 0;
  for (const [k, v] of [...map]) { // idle first, oldest first
    if (map.size <= 1) break;
    if (isLive(v)) continue;
    if (bytes > floorBytes || map.size > maxEntries) { map.delete(k); bytes -= sizeOf(v) || 0; evicted++; }
  }
  if (liveBytes > liveMaxBytes && map.size > 1) { // admission: the newcomer is not kept
    const k = [...map.keys()].pop(), v = map.get(k);
    if (isLive(v)) { const b = sizeOf(v) || 0; map.delete(k); bytes -= b; liveBytes -= b; live--; notAdmitted++; }
  }
  if (liveBytes > liveMaxBytes) {
    const order = [...map].filter(([, v]) => isLive(v)).sort((x, y) => (usedAt(x[1]) || 0) - (usedAt(y[1]) || 0));
    for (const [k, v] of order) {
      if (liveBytes <= liveMaxBytes || map.size <= 1) break;
      const b = sizeOf(v) || 0;
      map.delete(k); bytes -= b; liveBytes -= b; live--; evicted++; liveEvicted++;
    }
  }
  return { bytes, evicted, live, liveBytes, liveEvicted, notAdmitted };
}

/** The ledger's hot cutoff over the hot rows' (ts, bytes): the later of now − window and the ts where the
 *  newest rows pass maxBytes — a tie group at the edge goes whole, so the kept bytes never pass the
 *  ceiling. Never earlier than `prev`: the window only slides forward. */
function ledgerCutoff({ nowMs, tss, sizes, windowMs = LEDGER_WINDOW_DAYS * DAY_MS, maxBytes = LEDGER_HOT_MAX_BYTES, prev = -Infinity }) {
  let cut = Math.max(prev, nowMs - windowMs);
  const idx = [];
  for (let i = 0; i < tss.length; i++) if (tss[i] >= cut) idx.push(i);
  idx.sort((a, b) => tss[b] - tss[a]);
  let bytes = 0;
  for (let k = 0; k < idx.length; k++) {
    bytes += sizes[idx[k]];
    if (bytes > maxBytes) { cut = Math.max(cut, tss[idx[k]] + 1); break; }
  }
  return cut;
}

/** A row the cold columns hold EXACTLY: a finite ts and each token count a whole number below 2³²−1, null
 *  or absent (null prices as 0, absent as NaN — the same arithmetic the full row gets). Anything else stays hot. */
const ABSENT = 0xFFFFFFFF; // a token count the row did not carry (reads back as NaN)
/** THE LOC FENCE (r3, verify #17): a row's place = shard index × 2³² + byte offset, exact in a double while
 *  the index < 255 (the Uint8 column) and the offset < 2³²; anything past it is NOT a place (the row stays
 *  hot, read from memory) — never decomposed into another shard's offset. */
function locOk(sh, off) { return Number.isInteger(sh) && sh >= 0 && sh < 255 && Number.isInteger(off) && off >= 0 && off < 4294967296; }
function locOf(sh, off) { return locOk(sh, off) ? sh * 4294967296 + off : NaN; }
const TOKEN_FIELDS = ['i', 'o', 'cw5', 'cw1', 'cr'];
const NAME_FIELDS = ['acct', 'be', 'host', 'atype', 'model'];
function coldable(ev, sh = 0, off = 0) {
  if (!ev || typeof ev.ts !== 'number' || !Number.isFinite(ev.ts) || !locOk(sh, off)) return false;
  for (const f of TOKEN_FIELDS) { const v = ev[f]; if (v !== undefined && v !== null && !(Number.isInteger(v) && v >= 0 && v < ABSENT)) return false; }
  for (const f of NAME_FIELDS) { const v = ev[f]; if (v !== undefined && v !== null && typeof v !== 'string') return false; }
  return true;
}

/** 53-bit hash of an id (two 32-bit FNV/murmur lanes) — the cold rows' rid, compared only among rows of
 *  the SAME ts (a duplicate rid is the same request, the same record, the same ts). */
function idHash(s) {
  s = String(s);
  let h1 = 0x811c9dc5, h2 = 0x9747b28c ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995); h2 ^= h2 >>> 13;
  }
  return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 0x1fffff);
}

/** The cold rows as columns, ts-ordered on read (a stable merge of the appended tail: on equal ts the row
 *  loaded first stays first — the order the old whole-ledger sort gave). */
class ColdSlab {
  constructor(cap = 1024) {
    this.n = 0; this.sortedN = 0; this.cap = 0;
    this.names = NAME_FIELDS.map(() => ({ vals: [], ix: new Map() }));
    this.idx = { rid: new HashIndex(), mid: new HashIndex(), bare: new HashIndex() };
    this._grow(cap);
  }
  _grow(cap) {
    const f64 = (old) => { const a = new Float64Array(cap); if (old) a.set(old.subarray(0, this.n)); return a; };
    const u32 = (old) => { const a = new Uint32Array(cap); if (old) a.set(old.subarray(0, this.n)); return a; };
    this.ts = f64(this.ts); this.rh = f64(this.rh);
    this.tok = TOKEN_FIELDS.map((_, k) => u32(this.tok && this.tok[k]));
    this.nm = NAME_FIELDS.map((_, k) => u32(this.nm && this.nm[k]));
    const u8 = (old) => { const a = new Uint8Array(cap); if (old) a.set(old.subarray(0, this.n)); return a; };
    this.sh = u8(this.sh); this.off = u32(this.off);
    this.cap = cap;
  }
  _intern(k, v) {
    const t = this.names[k];
    let i = t.ix.get(v);
    if (i === undefined) { i = t.vals.length; t.vals.push(v); t.ix.set(v, i); }
    return i;
  }
  /** Append one coldable row (load order) living at byte `off` of shard number `sh`. */
  push(ev, sh = 0, off = 0, lineHash = NaN) {
    if (this.n === this.cap) this._grow(Math.max(1024, Math.ceil(this.cap * 1.5)));
    const j = this.n++;
    this.sh[j] = sh; this.off[j] = off;
    this.ts[j] = ev.ts;
    this.rh[j] = lineHash; // r4 (verify #0): the WHOLE line's hash — any field edited in place ⇒ STALE on the next read
    const loc = sh * 4294967296 + off; // fenced by coldable()
    if (ev.rid) this.idx.rid.put(idHash(ev.rid), loc);
    if (ev.mid) this.idx.mid.put(idHash(ev.mid), loc);
    if (typeof ev.rid === 'string' && ev.rid.startsWith('h:')) this.idx.bare.put(idHash(ev.rid.replace(/^h:[^:]*:/, '')), loc); // a host row's own request id
    for (let k = 0; k < TOKEN_FIELDS.length; k++) { const v = ev[TOKEN_FIELDS[k]]; this.tok[k][j] = v === undefined ? ABSENT : v === null ? 0 : v; }
    for (let k = 0; k < NAME_FIELDS.length; k++) this.nm[k][j] = this._intern(k, ev[NAME_FIELDS[k]]);
  }
  /** Sort the appended tail and merge it behind equal-ts rows already in order. */
  settle() {
    const n = this.n, s = this.sortedN;
    if (s === n) return;
    const ts = this.ts;
    const tail = new Uint32Array(n - s);
    for (let k = 0; k < tail.length; k++) tail[k] = s + k;
    tail.sort((a, b) => (ts[a] - ts[b]) || (a - b));
    let inOrder = true;
    for (let k = 0; k < tail.length; k++) if (tail[k] !== s + k) { inOrder = false; break; }
    if (inOrder && (s === 0 || ts[s - 1] <= ts[s])) { this.sortedN = n; if (this.cap > Math.ceil(n * 1.5) && this.cap > 1024) this._grow(Math.max(1024, Math.ceil(n * 1.125))); return; }
    const perm = new Uint32Array(n);
    let i = 0, j = 0, k = 0;
    while (i < s && j < tail.length) perm[k++] = ts[tail[j]] < ts[i] ? tail[j++] : i++;
    while (i < s) perm[k++] = i++;
    while (j < tail.length) perm[k++] = tail[j++];
    const cap = Math.max(1024, Math.ceil(n * 1.125)); // right-sized on every merge (the doubling's slack is not kept)
    const remap = (col) => { const a = new col.constructor(cap); for (let q = 0; q < n; q++) a[q] = col[perm[q]]; return a; };
    this.cap = cap;
    this.ts = remap(this.ts); this.rh = remap(this.rh); this.sh = remap(this.sh); this.off = remap(this.off);
    this.tok = this.tok.map(remap); this.nm = this.nm.map(remap);
    this.sortedN = n;
  }
  _lower(t) { let lo = 0, hi = this.n; while (lo < hi) { const m = (lo + hi) >> 1; if (this.ts[m] < t) lo = m + 1; else hi = m; } return lo; }
  /** Rows with ts ≤ t (the anchors' memo version). */
  countUpTo(t) { this.settle(); let lo = 0, hi = this.n; while (lo < hi) { const m = (lo + hi) >> 1; if (this.ts[m] <= t) lo = m + 1; else hi = m; } return lo; }
  /** The places (loc = shard × 2³² + offset) of the cold rows whose `kind` hash equals id's — O(log n) on the
   *  sorted index (r3, verify #18). A hash hit is a CANDIDATE: the caller reads the line and compares the
   *  string before it treats it as that id (verify #4/#15). */
  locs(kind, id) { return this.idx[kind].find(idHash(id)); }
  /** Every place a lookup's hashes name (rid, host-stripped rid, mid). */
  candidates(id) { const h = idHash(id); return [...this.idx.rid.find(h), ...this.idx.bare.find(h), ...this.idx.mid.find(h)]; }
  /** First ordered position with ts ≥ t / > t (the walk's range). */
  lowerBound(t) { this.settle(); return this._lower(t); }
  upperBound(t) { this.settle(); let lo = 0, hi = this.n; while (lo < hi) { const m = (lo + hi) >> 1; if (this.ts[m] <= t) lo = m + 1; else hi = m; } return lo; }
  row(q) {
    const ev = { ts: this.ts[q] };
    for (let k = 0; k < TOKEN_FIELDS.length; k++) { const t = this.tok[k][q]; ev[TOKEN_FIELDS[k]] = t === ABSENT ? NaN : t; }
    for (let k = 0; k < NAME_FIELDS.length; k++) ev[NAME_FIELDS[k]] = this.names[k].vals[this.nm[k][q]];
    return ev;
  }
  /** Rows in [from, to] in ts order, as light rows carrying ONLY the priced columns. */
  * rows(from, to) {
    this.settle();
    for (let q = from ? this._lower(from) : 0; q < this.n; q++) {
      if (to && this.ts[q] > to) break;
      yield this.row(q);
    }
  }
  /** Resident bytes: the typed columns + the hash indexes + the intern tables (2 B/char + 40 B a slot). */
  bytes() {
    let b = this.cap * (8 * 2 + 4 * (TOKEN_FIELDS.length + NAME_FIELDS.length) + 1 + 4);
    for (const k of Object.keys(this.idx)) b += this.idx[k].bytes();
    for (const t of this.names) for (const v of t.vals) b += 40 + (typeof v === 'string' ? v.length * 2 : 0);
    return b;
  }
}

/** A sorted multimap of 53-bit hashes → places (loc): sorted Float64Arrays (keys, locs) + an unsorted tail,
 *  merged when the tail passes a QUARTER of the sorted part (geometric: O(n log n) over a whole boot) by an
 *  LSD radix sort of the tail on the hash's four 16-bit digits (O(n), the place carried) + a linear merge.
 *  `merges` counts them (verify #16). */
class HashIndex {
  constructor() { this.keys = new Float64Array(0); this.vals = new Float64Array(0); this.tk = new Float64Array(4096); this.tv = new Float64Array(4096); this.tn = 0; this.merges = 0; }
  put(h, loc) {
    if (this.tn === this.tk.length) {
      if (this.tn >= 4096 + (this.keys.length >> 2)) this.settle();
      else { const k = new Float64Array(this.tk.length * 2), v = new Float64Array(this.tk.length * 2); k.set(this.tk); v.set(this.tv); this.tk = k; this.tv = v; }
    }
    this.tk[this.tn] = h; this.tv[this.tn] = loc; this.tn++;
  }
  settle() {
    const n = this.tn;
    if (!n) return;
    let ord = new Uint32Array(n), tmp = new Uint32Array(n);
    for (let i = 0; i < n; i++) ord[i] = i;
    const lo = new Uint32Array(n), hi = new Uint32Array(n);
    for (let i = 0; i < n; i++) { const h = this.tk[i]; lo[i] = h % 4294967296; hi[i] = Math.floor(h / 4294967296); }
    const cnt = new Uint32Array(65537);
    for (const [arr, shift] of [[lo, 0], [lo, 16], [hi, 0], [hi, 16]]) {
      cnt.fill(0);
      for (let i = 0; i < n; i++) cnt[((arr[ord[i]] >>> shift) & 0xffff) + 1]++;
      for (let d = 0; d < 65536; d++) cnt[d + 1] += cnt[d];
      for (let i = 0; i < n; i++) tmp[cnt[(arr[ord[i]] >>> shift) & 0xffff]++] = ord[i];
      [ord, tmp] = [tmp, ord];
    }
    const A = this.keys, AV = this.vals, K = new Float64Array(A.length + n), V = new Float64Array(A.length + n);
    let i = 0, j = 0, k = 0;
    while (i < A.length && j < n) { if (A[i] <= this.tk[ord[j]]) { K[k] = A[i]; V[k++] = AV[i++]; } else { K[k] = this.tk[ord[j]]; V[k++] = this.tv[ord[j++]]; } }
    while (i < A.length) { K[k] = A[i]; V[k++] = AV[i++]; }
    while (j < n) { K[k] = this.tk[ord[j]]; V[k++] = this.tv[ord[j++]]; }
    this.keys = K; this.vals = V; this.tn = 0; this.tk = new Float64Array(4096); this.tv = new Float64Array(4096); this.merges++;
  }
  _lower(h) { const a = this.keys; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < h) lo = m + 1; else hi = m; } return lo; }
  /** The sorted part only (the loader's pass checks its own rows with its own set). */
  findSorted(h) { const out = []; for (let q = this._lower(h); q < this.keys.length && this.keys[q] === h; q++) out.push(this.vals[q]); return out; }
  find(h) {
    if (this.tn > 4096) this.settle();
    const out = this.findSorted(h);
    for (let q = 0; q < this.tn; q++) if (this.tk[q] === h) out.push(this.tv[q]);
    return out;
  }
  bytes() { return this.keys.byteLength + this.vals.byteLength + this.tk.byteLength + this.tv.byteLength; }
}

/** A census row. bytes in the CEILING's unit (unit says which); kind = where it lives: 'heap' (counted in
 *  the main heap) or 'arraybuffers' (typed-array stores, counted in External). over = past the ceiling. */
function cacheRow(name, { bytes = 0, count = 0, unit = 'entries', ceiling = null, kind = 'heap', basis = 'bytes', live = null } = {}) {
  const b = Math.max(0, Math.round(Number(bytes) || 0));
  return { name: String(name), bytes: b, count: Math.max(0, Number(count) || 0), unit, ceiling, kind, basis, live, over: !!(ceiling && b > ceiling) };
}

module.exports = {
  MB, DAY_MS, LEDGER_WINDOW_DAYS, LEDGER_HOT_MAX_BYTES, JSONL_CACHE_MAX_BYTES, JSONL_CACHE_IDLE_MS, JSONL_CACHE_MAX_ENTRIES, JSONL_LIVE_MAX_BYTES, ESTIMATOR_LINES_MAX_BYTES,
  ESTIMATOR_LINES_IDLE_MS, ESTIMATOR_LIVE_MAX_BYTES, COLD_COLUMNS_MAX_BYTES, COLD_FOLD_DEADLINE_MS, COLD_QUEUE_MAX, COLD_ROW_BUDGET, COLD_TERMINATE_DEADLINE_MS, locOk, locOf, evictLru, evictIdle, ledgerCutoff, coldable, idHash, ColdSlab, HashIndex, cacheRow, TOKEN_FIELDS, NAME_FIELDS,
};

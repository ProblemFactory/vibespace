'use strict';
/**
 * THE LEDGER'S SHAPE + THE STREAMING DEDUP (lane ledger-dedup-law, B-7f9e). A fleet instance's monthly shard reached
 * 23.8 GiB, an estimated ≥ 95 % of it the same harvest window appended again at every harvest (its device cursor was never
 * committed). The readers deduplicate by rid at READ time, so the totals stayed right while the file grew without bound —
 * and a probe that read it whole took the container down. One module owns the two things that look at a shard as a FILE,
 * so the boot migration, the growth alarm (src/usage-history.js F4) and their suite share one spelling:
 *
 *   · shapeOf(file) — THE SAMPLED SHAPE: size, and the rows / unique-rid ratio over SAMPLES windows of SAMPLE_BYTES spread
 *     evenly across the file, counted as ONE union (a re-emitted window repeats its rids far apart: every sample of the
 *     23.8 GiB shard began at the same ts, while the rows inside one sample were unique — a per-window count reads ~1.0 on
 *     a file that is 20× its unique rows). Bounded: ≤ SAMPLES × SAMPLE_BYTES read, never the whole file; one reused buffer.
 *   · dedupSteps(file) — THE STREAMING DEDUP by rid, keeping the FIRST row (the ledger cache's read-time rule, so every
 *     reader's totals are unchanged): one read step per next(), the caller drives it (runStepped: slices of ≤ SLICE_MS on
 *     the loop — the boot law). It writes `<file>.dedup-tmp` and renames it in; a stale tmp (a restart mid-way) is
 *     discarded at the start, so the run resumes from the beginning of the shard it was on. Rows without a rid are kept.
 *     The rid map is bounded (MAX_IDS): past it the pass starts over as two passes over the halves of the shard's ts range
 *     (a re-emitted row keeps its ts, so every copy of a rid lies in the same half), halving again as needed. Appends that
 *     land during the pass are caught up, and the last catch-up + the rename are ONE synchronous step: every append to a
 *     shard is a synchronous appendFileSync on the same loop, so none can land between the last read and the rename.
 *     NEVER DESTROY: a removed copy whose bytes differ from the row kept for its rid (an ingest that baked another account
 *     into a later copy) goes to `<archiveDir>/usage-ledger-dedup-<shard>.ndjson` first; byte-identical copies carry nothing
 *     the kept row does not.
 * Imports only fs + path (the suite drives it on a sparse fixture; the cold worker never loads it).
 */
const fs = require('fs');
const path = require('path');

const STEP_BYTES = 1024 * 1024;        // one read step (the warm's MiB)
const LINE_MAX = STEP_BYTES;           // no ledger row is near a MiB: bytes with no newline within it are no row (a sparse /
                                       // zero-filled region) — stepped over, never read whole (the allocation stays ≤ a step)
const SAMPLES = 16;                    // shapeOf: windows across the file…
const SAMPLE_BYTES = 1024 * 1024;      // …of a MiB each
const MAX_IDS = 5e6;                   // the rid map's bound (≈ 10⁵ unique rids a month in practice)
const SLICE_MS = 40;                   // runStepped: the most one loop turn spends (the boot law is 250 ms)
const CATCHUP_SYNC_MAX = 8 * STEP_BYTES; // the last catch-up (rows appended during the pass) is read in ONE step when ≤ this
const ARCHIVE_MAX_BYTES = 256 * 1024 * 1024; // differing copies archived per shard; past it a differing copy is KEPT in the shard (never destroyed, never unbounded)
const TMP_SUFFIX = '.dedup-tmp';
const SHARD_RE = /^events-\d{4}-\d{2}\.ndjson$/;
const RID_HEAD = Buffer.from('{"rid":"');

/** The rid of one ledger line [a, b) of `buf` (no newline), or null (no rid / not JSON). The rows are JSON.stringify of an
 *  object whose first key is `rid` (both writers), so the fast path reads it without parsing; anything else is parsed. */
function ridAt(buf, a, b) {
  while (a < b && buf[a] === 0) a++; // a zero-filled gap (a sparse or crash-truncated file) glued to the row's start
  if (b - a > RID_HEAD.length && buf.compare(RID_HEAD, 0, RID_HEAD.length, a, a + RID_HEAD.length) === 0) {
    const s = a + RID_HEAD.length, line = buf.subarray(s, b);
    const q = line.indexOf(34); // the closing quote
    if (q > 0) { const bs = line.indexOf(92); if (bs < 0 || bs > q) return buf.toString('utf8', s, s + q); }
  }
  if (buf.subarray(a, b).indexOf('"rid"') < 0) return null;
  try { const r = JSON.parse(buf.toString('utf8', a, b)); return r && typeof r.rid === 'string' && r.rid ? r.rid : null; } catch { return null; }
}
const TS_KEY = Buffer.from('"ts":');
/** The ts of one ledger line, NaN when unreadable: the `"ts":<number>` key near the row's head (both writers put it
 *  among the first keys), else the row parsed. */
function tsAt(buf, a, b) {
  while (a < b && buf[a] === 0) a++;
  const head = buf.subarray(a, Math.min(b, a + 512)), k = head.indexOf(TS_KEY);
  if (k >= 0) {
    let n = 0, i = k + TS_KEY.length, digits = 0;
    for (; i < head.length && head[i] >= 48 && head[i] <= 57; i++, digits++) n = n * 10 + (head[i] - 48);
    if (digits && (i >= head.length || head[i] === 44 || head[i] === 125)) return n; // an integer ms value, then , or }
  }
  try { const r = JSON.parse(buf.toString('utf8', a, b)); return Number(r && r.ts); } catch { return NaN; }
}
/** FNV-1a of a line's bytes — a removed copy is compared with the kept row by length + this. */
function lineHash(buf, a, b) {
  let h = 0x811c9dc5;
  for (let i = a; i < b; i++) { h ^= buf[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** The host a row came from: `h:<host>:…` rids are a remote machine's, every other row is this machine's (`local`). */
function hostOfRid(rid) {
  if (typeof rid !== 'string' || !rid.startsWith('h:')) return 'local';
  const c = rid.indexOf(':', 2);
  return c > 2 ? rid.slice(2, c) : rid.slice(2);
}
const shapeRow = (out, seen, perHost, rid) => { out.rows++; seen.add(rid); const h = hostOfRid(rid); perHost.set(h, (perHost.get(h) || 0) + 1); };
const shapeEnd = (out, seen, perHost) => {
  out.unique = seen.size;
  out.ratio = out.unique ? out.rows / out.unique : null;
  out.hosts = [...perHost.entries()].map(([host, rows]) => ({ host, rows })).sort((x, y) => y.rows - x.rows);
  return out;
};

/**
 * THE SAMPLED SHAPE of one shard → { file, size, ino, mtimeMs, rows, unique, ratio, hosts: [{host, rows}], sampled,
 * windows } — `ratio` = rows / unique over the union of the windows (null when they held no row: a sparse or empty file);
 * `windows` = where each window starts, evenly from the head (0) to the tail (size − a window). A file of at most
 * SAMPLES × SAMPLE_BYTES is counted whole (exactly). Throws only when the file cannot be stat'ed. A sample of windows sees
 * a repeat only when both copies fall in it — a re-sent window far from its first copy reads ≈ 1× here, so the ingest
 * judges by its index's exact count once it has read the shard (usage-history `_shapeVerdict`, lane ledger-dedup-law r2).
 */
function shapeOf(file, { samples = SAMPLES, sampleBytes = SAMPLE_BYTES } = {}) {
  const st = fs.statSync(file);
  const out = { file, size: st.size, ino: st.ino, mtimeMs: st.mtimeMs, rows: 0, unique: 0, ratio: null, hosts: [], sampled: 0, windows: [] }; // windows: where each sample starts (the head, the middle, the tail)
  const seen = new Set(), perHost = new Map();
  if (!st.size) return out;
  if (st.size <= samples * sampleBytes) {
    eachLine(file, 0, st.size, (buf, a, b) => { const rid = ridAt(buf, a, b); if (rid) shapeRow(out, seen, perHost, rid); });
    out.sampled = st.size; out.windows.push(0);
    return shapeEnd(out, seen, perHost);
  }
  const buf = Buffer.alloc(sampleBytes);
  const fd = fs.openSync(file, 'r');
  try {
    for (let k = 0; k < samples; k++) {
      const at = Math.floor(k * (st.size - sampleBytes) / (samples - 1));
      const got = fs.readSync(fd, buf, 0, sampleBytes, at);
      if (got <= 0) continue;
      out.sampled += got; out.windows.push(at);
      // a window that does not start the file starts mid-row: its first (cut) line is skipped, and so is its last
      let a = 0;
      if (at > 0) { const nl = buf.subarray(0, got).indexOf(10); if (nl < 0) continue; a = nl + 1; }
      const end = buf.subarray(0, got).lastIndexOf(10);
      for (let p = a; p < end;) {
        const nl = buf.indexOf(10, p);
        if (nl < 0 || nl > end) break;
        if (nl > p) { const rid = ridAt(buf, p, nl); if (rid) shapeRow(out, seen, perHost, rid); }
        p = nl + 1;
      }
    }
  } finally { fs.closeSync(fd); }
  return shapeEnd(out, seen, perHost);
}
/** Every whole line of [from, to) of a file, read in `step`-byte slices (one reused buffer; a line longer than a slice is
 *  read whole on its own) → the place after the last whole line. `fn(buf, a, b, offset)` sees the line [a, b) of `buf`.
 *  `limit`: stop after the slice that took the read past `from + limit` (a stepped caller's step). */
function eachLine(file, from, to, fn, { step = STEP_BYTES, limit = Infinity } = {}) {
  if (to <= from) return from;
  const fd = fs.openSync(file, 'r');
  let buf = Buffer.alloc(Math.max(1, Math.min(step, to - from)));
  try {
    let pos = from;
    while (pos < to) {
      const want = Math.min(buf.length, to - pos);
      const got = fs.readSync(fd, buf, 0, want, pos);
      if (got <= 0) break;
      const last = buf.subarray(0, got).lastIndexOf(10);
      if (last < 0) {
        if (pos + got >= to) break; // an unfinished last line
        if (buf.length < LINE_MAX) { buf = Buffer.alloc(Math.min(LINE_MAX, buf.length * 2)); continue; } // a line longer than the slice
        pos += got; if (pos - from >= limit) break; continue; // a MiB with no newline is no row: stepped over
      }
      for (let p = 0; p <= last;) { const nl = buf.indexOf(10, p); if (nl > p) fn(buf, p, nl, pos + p); p = nl + 1; }
      pos += last + 1;
      if (pos - from >= limit) break;
      if (buf.length > step) buf = Buffer.alloc(step);
    }
    return pos;
  } finally { fs.closeSync(fd); }
}

/** r8 (lane ledger-dedup-law): eachLine on the ASYNC road (fs.promises — libuv's pool, never the main thread: a hold's
 *  read-back and its drain) — every whole line from `from` to the end of the file, read in `step`-byte slices (a line
 *  longer than a slice is read whole, up to LINE_MAX; bytes with no newline past it are no line) → {end, lineEnd, eof}:
 *  `lineEnd` = the place after the last whole line, `end` = where a next read starts (the file's end once `eof` — a torn
 *  tail included; else `lineEnd`). `limit`: stop at the first line end past `from + limit` (a drain's slice). A file that
 *  does not exist → {end: from, lineEnd: from, eof: true, missing: true}. `fn(buf, a, b, offset)` as eachLine's. */
async function eachLineAsync(file, from, fn, { step = STEP_BYTES, limit = Infinity, io = null } = {}) {
  const on = io || ((f, p) => p); // r9 (ledger-dedup-law): the caller's wrapper of each file call (usage-history `_holdIO`: bounded and said)
  // r10: an error names the FILE it read — FileHandle.read's errors carry no `path` (a read-back that failed mid-read was
  // said by its hold's key, no file of it)
  const named = (e) => { if (e && typeof e === 'object' && !e.path) { try { e.path = file; } catch { } } return e; };
  let fh;
  try { fh = await on(file, fs.promises.open(file, 'r')); } catch (e) { if (e && e.code === 'ENOENT') return { end: from, lineEnd: from, eof: true, missing: true }; throw named(e); }
  try {
    let buf = Buffer.alloc(step), pos = from, lineEnd = from, carry = 0; // buf[0, carry) = an unfinished line read at `pos`
    for (;;) {
      if (carry === buf.length) {
        if (buf.length >= LINE_MAX) { pos += carry; carry = 0; } // a MiB with no newline is no row: stepped over
        else { const b2 = Buffer.alloc(Math.min(LINE_MAX, buf.length * 2)); buf.copy(b2, 0, 0, carry); buf = b2; }
      }
      const { bytesRead } = await on(file, fh.read(buf, carry, buf.length - carry, pos + carry));
      if (bytesRead <= 0) return { end: pos + carry, lineEnd, eof: true };
      const n = carry + bytesRead, last = buf.subarray(0, n).lastIndexOf(10);
      if (last < 0) { carry = n; continue; }
      for (let p = 0; p <= last;) { const nl = buf.indexOf(10, p); if (nl > p) fn(buf, p, nl, pos + p); p = nl + 1; }
      lineEnd = pos + last + 1;
      carry = n - (last + 1);
      if (carry) buf.copy(buf, 0, last + 1, n);
      pos = lineEnd;
      if (lineEnd - from >= limit) return { end: lineEnd, lineEnd, eof: false };
      if (buf.length > step && carry < step) { const b2 = Buffer.alloc(step); buf.copy(b2, 0, 0, carry); buf = b2; }
    }
  } catch (e) { throw named(e); } finally { await on(file, fh.close()).catch(() => { }); } // r10: the close is a file call of the road too — bounded and said like the open and the read
}

/** A tmp file written in batches of ≥ `step` bytes → { keep(buf, a, b), flush(), bytes, close() }. */
function writerOf(file, step) {
  const fd = fs.openSync(file, 'w');
  const parts = []; let n = 0;
  const w = {
    bytes: 0, fd,
    keep(buf, a, b) { const piece = Buffer.allocUnsafe(b - a + 1); buf.copy(piece, 0, a, b); piece[b - a] = 10; parts.push(piece); n += piece.length; if (n >= step) w.flush(); },
    raw(b) { w.flush(); fs.writeSync(fd, b); w.bytes += b.length; },
    flush() { if (!parts.length) return; const b = Buffer.concat(parts, n); fs.writeSync(fd, b); w.bytes += b.length; parts.length = 0; n = 0; },
    close() { try { fs.closeSync(fd); } catch { } },
  };
  return w;
}
/** `from`'s bytes appended to `to` (a rename when `to` does not exist yet), a step at a time. */
function appendFile(to, from, step) {
  if (!fs.existsSync(to)) { fs.renameSync(from, to); fs.writeFileSync(from, ''); return; }
  const src = fs.openSync(from, 'r'), dst = fs.openSync(to, 'a'), buf = Buffer.alloc(step);
  try { for (let pos = 0; ;) { const n = fs.readSync(src, buf, 0, buf.length, pos); if (n <= 0) break; fs.writeSync(dst, buf, 0, n); pos += n; } fs.fsyncSync(dst); }
  finally { fs.closeSync(src); fs.closeSync(dst); }
}
/** One ts range of a split pass holds the row? A row whose ts cannot be read belongs to the first range. */
function inRange(range, buf, a, b, first) {
  const ts = tsAt(buf, a, b);
  return Number.isFinite(ts) ? ts >= range[0] && ts < range[1] : first;
}
/** The next split: every range in two at its middle — the middle of the ts the pass SAW inside it (`span` = [min, max]
 *  over the rows read), so rows clustered in an hour split as surely as rows spread over the month. */
function halves(ranges, span) {
  const out = [];
  for (const [lo, hi] of ranges) {
    const a = Math.max(lo, span[0]), b = Math.min(hi, span[1] + 1);
    if (!(b - a > 1)) { out.push([lo, hi]); continue; } // one instant: no ts split can separate it
    const mid = Math.floor((a + b) / 2); out.push([lo, mid], [mid, hi]);
  }
  return out;
}

/**
 * THE STREAMING DEDUP of one shard — a generator: each next() reads one step (or, at the end, does the catch-up's last
 * read + the rename in ONE step). Its value when done = { shard, before, after, rows, kept, removed, archived, passes,
 * renamed, why? } — `renamed: false` when nothing was repeated (the tmp is discarded, the shard stays as it is) or when the
 * shard changed under the pass in a way an append does not explain (`why` names it; nothing is touched).
 */
function* dedupSteps(file, { step = STEP_BYTES, maxIds = MAX_IDS, archiveDir = null, now = () => Date.now() } = {}) {
  const tmp = file + TMP_SUFFIX;
  const shard = path.basename(file);
  const archFile = archiveDir ? path.join(archiveDir, `usage-ledger-dedup-${shard.replace(/\.ndjson$/, '')}.ndjson`) : null;
  const archTmp = archFile ? archFile + '.part' : null;
  for (const f of [tmp, archTmp]) if (f) { try { fs.unlinkSync(f); } catch { } } // a restart mid-way: the tmp is discarded, the run starts over
  const st0 = fs.statSync(file);
  const res = { shard, before: st0.size, after: st0.size, rows: 0, kept: 0, removed: 0, archived: 0, passes: 0, renamed: false };
  let ranges = null; // null = ONE pass over every row; else [[lo, hi), …] — passes over parts of the shard's ts range
  let span = null;   // [min, max] ts of the shard's rows — read by one pass of its own at the first split
  for (;;) {
    const w = writerOf(tmp, step);
    let arch = null;
    const archive = (buf, a, b) => { // → true when the copy is kept in the archive (then it may leave the shard)
      if (!archTmp || (arch && arch.bytes + (b - a) > ARCHIVE_MAX_BYTES)) return false;
      if (!arch) { fs.mkdirSync(archiveDir, { recursive: true }); arch = writerOf(archTmp, step); }
      arch.keep(buf, a, b); arch.flush(); res.archived++;
      return true;
    };
    let end = st0.size, seen = null, split = false;
    res.rows = 0; res.kept = 0; res.removed = 0; res.archived = 0; res.keptDiffering = 0; res.skipped = 0;
    // one row: kept when its rid is new to the pass (or it has none), dropped as a repeat otherwise — archived first when
    // its bytes differ from the row kept for that rid
    const take = (buf, a, b) => {
      while (a < b && buf[a] === 0) a++;
      if (a >= b) return;
      res.rows++;
      const rid = ridAt(buf, a, b);
      if (!rid) { res.kept++; w.keep(buf, a, b); return; }
      const sig = lineHash(buf, a, b) * 65536 + ((b - a) & 0xffff);
      const had = seen.get(rid);
      if (had === undefined) { seen.set(rid, sig); res.kept++; w.keep(buf, a, b); if (seen.size > maxIds) split = true; return; }
      if (had !== sig && !archive(buf, a, b)) { res.kept++; res.keptDiffering++; w.keep(buf, a, b); return; } // differs from the kept row and no archive room: it stays
      res.removed++;
    };
    try {
      const passes = ranges || [null];
      for (let k = 0; k < passes.length && !split; k++) {
        const range = passes[k];
        seen = new Map(); res.passes++;
        const fd = fs.openSync(file, 'r');
        let buf = Buffer.alloc(step);
        try {
          for (let pos = 0; pos < end && !split;) {
            const got = fs.readSync(fd, buf, 0, Math.min(buf.length, end - pos), pos);
            if (got <= 0) { end = pos; break; }
            const last = buf.subarray(0, got).lastIndexOf(10);
            if (last < 0) {
              if (pos + got >= end) { end = pos; break; }
              if (buf.length < LINE_MAX) { buf = Buffer.alloc(Math.min(LINE_MAX, buf.length * 2)); continue; } // a row longer than a step
              pos += got; res.skipped = (res.skipped || 0) + got; yield { phase: 'pass', shard, pos, size: end, pass: res.passes }; continue; // no row: a sparse / zero-filled MiB, stepped over (not copied)
            }
            for (let p = 0; p <= last && !split;) {
              const nl = buf.indexOf(10, p);
              if (nl > p && (!range || inRange(range, buf, p, nl, k === 0))) take(buf, p, nl);
              p = nl + 1;
            }
            pos += last + 1;
            if (pos >= end) end = pos;
            if (buf.length > step) buf = Buffer.alloc(step);
            yield { phase: 'pass', shard, pos, size: end, pass: res.passes };
          }
        } finally { fs.closeSync(fd); }
      }
      if (split) {
        // past MAX_IDS distinct rids: start over as passes over halves of the ts range (a rid's copies share its ts)
        w.close(); if (arch) arch.close();
        for (const f of [tmp, archTmp]) if (f) { try { fs.unlinkSync(f); } catch { } }
        const before = ranges ? ranges.length : 1;
        if (!span) { // the shard's ts range, read once (a step at a time) — the halves are cut inside it
          span = [Infinity, -Infinity];
          const fd = fs.openSync(file, 'r'); let buf = Buffer.alloc(step);
          try {
            for (let pos = 0; pos < end;) {
              const got = fs.readSync(fd, buf, 0, Math.min(buf.length, end - pos), pos);
              if (got <= 0) break;
              const last = buf.subarray(0, got).lastIndexOf(10);
              if (last < 0) { if (pos + got >= end) break; if (buf.length < LINE_MAX) { buf = Buffer.alloc(Math.min(LINE_MAX, buf.length * 2)); continue; } pos += got; continue; }
              for (let q = 0; q <= last;) { const nl = buf.indexOf(10, q); if (nl > q) { const ts = tsAt(buf, q, nl); if (ts < span[0]) span[0] = ts; if (ts > span[1]) span[1] = ts; } q = nl + 1; }
              pos += last + 1;
              if (buf.length > step) buf = Buffer.alloc(step);
              yield { phase: 'span', shard, pos, size: end };
            }
          } finally { fs.closeSync(fd); }
        }
        ranges = halves(ranges || [[-Infinity, Infinity]], span);
        if (ranges.length === before || ranges.length > 1024) throw new Error(`${shard}: more than ${maxIds} distinct rids that no ts split separates — not deduplicated`);
        continue;
      }
      // THE CATCH-UP: rows the hub appended while the pass ran. One pass ⇒ judged by its map; split passes ⇒ copied as
      // they are (the remote rows among them were deduplicated at write time — lane ledger-dedup-law F1)
      const tail = (buf, a, b) => { if (!ranges) take(buf, a, b); else { while (a < b && buf[a] === 0) a++; if (a < b) { res.rows++; res.kept++; w.keep(buf, a, b); } } };
      for (;;) {
        let st;
        try { st = fs.statSync(file); } catch (e) { return Object.assign(res, { why: `the shard went away during the pass (${e.code || e.message})` }); }
        if (st.ino !== st0.ino || st.size < end) return Object.assign(res, { why: st.ino !== st0.ino ? 'the shard was replaced during the pass' : 'the shard shrank during the pass' });
        if (st.size - end > CATCHUP_SYNC_MAX) { end = eachLine(file, end, end + CATCHUP_SYNC_MAX, tail, { step }); yield { phase: 'catch-up', shard, pos: end, size: st.size }; continue; }
        // THE LAST STEP — synchronous from this read to the rename (no append can land in between)
        end = eachLine(file, end, st.size, tail, { step });
        w.flush();
        if (!res.removed && !res.skipped) return Object.assign(res, { after: st.size }); // nothing repeated (and no hole): the shard stays as it is
        if (end < st.size) { // an unfinished last row (its newline not written yet) rides over verbatim
          const rest = Buffer.alloc(st.size - end); const fd = fs.openSync(file, 'r'); try { fs.readSync(fd, rest, 0, rest.length, end); } finally { fs.closeSync(fd); }
          w.raw(rest);
        }
        fs.fsyncSync(w.fd);
        if (arch) { arch.flush(); fs.fsyncSync(arch.fd); arch.close(); arch = null; appendFile(archFile, archTmp, step); fs.unlinkSync(archTmp); } // the differing copies are kept BEFORE the rewrite
        w.close();
        try { fs.chmodSync(tmp, st.mode & 0o777); } catch { }
        fs.renameSync(tmp, file);
        return Object.assign(res, { after: w.bytes, renamed: true, at: now() });
      }
    } finally {
      w.close(); if (arch) arch.close();
      if (!res.renamed && !split) for (const f of [tmp, archTmp]) if (f) { try { fs.unlinkSync(f); } catch { } }
    }
  }
}

/** Drive a generator in slices of ≤ sliceMs per loop turn (`next` = the turn) → Promise of its return value. The slice is
 *  timed on the real clock; a step that throws rejects the promise (the caller names it). */
function runStepped(gen, { sliceMs = SLICE_MS, next = (fn) => setImmediate(fn), onStep = null } = {}) {
  return new Promise((resolve, reject) => {
    let steps = 0, maxMs = 0;
    const tick = () => {
      const t0 = performance.now();
      try {
        for (;;) {
          const t1 = performance.now();
          const r = gen.next();
          const d = performance.now() - t1; if (d > maxMs) maxMs = d;
          steps++;
          if (r.done) { const v = r.value; if (v && typeof v === 'object') Object.defineProperty(v, 'drive', { value: { steps, maxStepMs: Math.round(maxMs * 10) / 10 }, enumerable: false }); return resolve(v); }
          if (onStep) { try { onStep(r.value); } catch { } }
          if (performance.now() - t0 >= sliceMs) break;
        }
      } catch (e) { return reject(e); }
      next(tick);
    };
    next(tick);
  });
}
/** Drive a generator to its end in the calling turn (a suite; a tool on a stopped instance). */
function runNow(gen) { let r; do { r = gen.next(); } while (!r.done); return r.value; }

module.exports = { shapeOf, dedupSteps, runStepped, runNow, ridAt, eachLine, eachLineAsync, hostOfRid, STEP_BYTES, LINE_MAX, SAMPLES, SAMPLE_BYTES, MAX_IDS, SLICE_MS, TMP_SUFFIX, SHARD_RE };

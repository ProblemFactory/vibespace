'use strict';
// THE ANTIGRAVITY STORE, OPENED — the ONE gate every read of an agy store passes (lane agy-subagent-cards; moved out of
// data/bin/agy-wrapper.js by the cards' addendum so the hub's reader of a sub that already ran, src/agy-backfill.js,
// opens files through the SAME gate): src/agy-store.js's verdict on the RELATIVE path (THE TOKEN LAW — the login file
// is refused by its name), then no link anywhere past the store root (the path must resolve to itself under the real
// root) and O_NOFOLLOW on the file itself. A link planted in the store can never make a reader open the login file or
// anything outside (test-vault-law ⑩ + its RED copy). node builtins + the PURE agy-store; the wrapper (where agy runs)
// and the hub both read through it. No sqlite here: a db is opened only by the wrapper (its own process — the hub's
// main thread never opens one, test-architecture §73), at the path this gate answers.
const fs = require('fs');
const path = require('path');
const AS = require('./agy-store');

const parseJson = (t, f = null) => { try { return JSON.parse(t); } catch { return f; } };
const SAYS_NO = new Set(['ENOENT', 'ENOTDIR', 'ELOOP']); // the store's own «no»: not there (yet), or a link refused
/** The agy store under `home` (<home>/.gemini/antigravity-cli) — `log(line)` hears every refusal; `onError(e)` every read
 *  that FAILED (B-299b A1 r2: an EIO / EMFILE / EACCES is no answer — the cards' worker never keeps it as «not found»). */
function storeReader(home, { log = () => { }, onError = () => { } } = {}) {
  const root = path.join(String(home || ''), '.gemini', 'antigravity-cli');
  const failed = (e) => { if (!(e && SAYS_NO.has(e.code))) { try { onError(e); } catch { } } };
  /** THE GATE: the verdict on the RELATIVE path, then the path must resolve to itself under the real root — the
   *  absolute path, or null. */
  function storePath(rel, why) {
    if (!AS.storeReadable(rel)) { log(`store ${why} refused: ${rel}`); return null; }
    const abs = path.join(root, ...String(rel).split('/'));
    try {
      const want = path.join(fs.realpathSync(root), ...String(rel).split('/'));
      if (fs.realpathSync(abs) !== want) { log(`store ${why} refused (a link in the store): ${rel}`); return null; }
    } catch (e) { failed(e); return null; } // not there (yet)
    return abs;
  }
  /** A store FILE opened for reading (O_NOFOLLOW: the last component is never a link) — fd | null. */
  function open(rel, why) {
    const abs = storePath(rel, why);
    if (!abs) return null;
    try {
      const fd = fs.openSync(abs, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      if (!fs.fstatSync(fd).isFile()) { fs.closeSync(fd); return null; }
      return fd;
    } catch (e) { failed(e); return null; }
  }
  function read(rel) {
    const fd = open(rel, 'read');
    if (fd == null) return null;
    try { return fs.readFileSync(fd, 'utf8'); } catch (e) { failed(e); return null; } finally { try { fs.closeSync(fd); } catch { } }
  }
  function list(rel) {
    const abs = storePath(rel, 'list');
    if (!abs) return [];
    try { return fs.readdirSync(abs).filter((n) => /\.json$/.test(n) && n !== 'read.json').slice(0, 400); } catch (e) { failed(e); return []; }
  }
  const rows = (rel, of) => list(rel).map((n) => of(parseJson(read(`${rel}/${n}`)))).filter(Boolean);
  /** A store FOLDER's listing as a SIGNAL (B-299b A1): `name:mtimeMs:size` of each .json in it (the SAME ≤ 400 list() reads,
   *  sorted) — a file written into the folder late, or one whose bytes changed, moves it whatever the folder's own time says.
   *  '' = none / refused. */
  function listing(rel) {
    const abs = storePath(rel, 'list');
    if (!abs) return '';
    try { return fs.readdirSync(abs).filter((n) => /\.json$/.test(n) && n !== 'read.json').slice(0, 400).sort().map((n) => { try { const st = fs.lstatSync(path.join(abs, n)); return `${n}:${st.mtimeMs}:${st.size}`; } catch (e) { failed(e); return `${n}:-`; } }).join('|'); } catch (e) { failed(e); return ''; }
  }
  /** The complete lines appended to a store file since `offset` (≤ 512 KB a call): {lines, next} | null (no such file). */
  function lines(rel, offset) {
    const fd = open(rel, 'tail');
    if (fd == null) return null;
    try {
      const size = fs.fstatSync(fd).size;
      if (size <= offset) return { lines: [], next: Math.min(offset, size) };
      const n = Math.min(size - offset, 512 * 1024), buf = Buffer.alloc(n);
      fs.readSync(fd, buf, 0, n, offset);
      const end = buf.lastIndexOf(10);
      if (end < 0) return { lines: [], next: offset };
      return { lines: buf.subarray(0, end).toString('utf8').split('\n').filter((l) => l.trim()), next: offset + end + 1 };
    } catch (e) { failed(e); return null; } finally { try { fs.closeSync(fd); } catch { } }
  }
  /** Every complete line of a store file, ≤ `maxBytes` read — [] | null (no such file). */
  function allLines(rel, maxBytes = 8 * 1024 * 1024) {
    const out = [];
    let off = 0;
    for (;;) {
      const t = lines(rel, off);
      if (!t) return off ? out : null;
      if (!t.lines.length || t.next <= off) return out;
      out.push(...t.lines); off = t.next;
      if (off >= maxBytes) return out;
    }
  }
  /** THE ASYNC READ (lane agy-harness-fixes — a conversation's whole transcript, read for the history the hub rebuilds:
   *  never a synchronous read on the loop): the SAME gate (verdict, no link past the root, O_NOFOLLOW) through awaited
   *  calls, then the complete lines from `offset` in awaited 512 KB chunks, ≤ `maxBytes` → {lines, next, size, capped}
   *  | null (no such file / refused). `capped` = the budget stopped the read before the end. */
  async function linesFrom(rel, offset = 0, maxBytes = 16 * 1024 * 1024) {
    if (!AS.storeReadable(rel)) { log(`store read refused: ${rel}`); return null; }
    const abs = path.join(root, ...String(rel).split('/'));
    let fh = null;
    try {
      const want = path.join(await fs.promises.realpath(root), ...String(rel).split('/'));
      if (await fs.promises.realpath(abs) !== want) { log(`store read refused (a link in the store): ${rel}`); return null; }
      fh = await fs.promises.open(abs, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const st = await fh.stat();
      if (!st.isFile()) return null;
      const out = [];
      let off = Math.max(0, Math.min(Number(offset) || 0, st.size)), carry = Buffer.alloc(0);
      const stop = Math.min(st.size, off + maxBytes);
      let next = off;
      while (off < stop) {
        const n = Math.min(stop - off, 512 * 1024), buf = Buffer.alloc(n);
        const { bytesRead } = await fh.read(buf, 0, n, off);
        if (!bytesRead) break;
        off += bytesRead;
        const chunk = carry.length ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
        const end = chunk.lastIndexOf(10);
        if (end < 0) { carry = chunk; continue; }
        for (const l of chunk.subarray(0, end).toString('utf8').split('\n')) if (l.trim()) out.push(l);
        carry = chunk.subarray(end + 1);
        next = off - carry.length;
      }
      return { lines: out, next, size: st.size, capped: stop < st.size };
    } catch { return null; } finally { if (fh) { try { await fh.close(); } catch { } } }
  }
  return { home: String(home || ''), root, path: storePath, open, read, list, rows, listing, lines, allLines, linesFrom };
}

// THE CARDS' BATCH (B-299b A1): the store under `home` asked for a batch of spawns — run by the hub's «agy-cards» worker
// (src/agy-cards-worker.js through src/agy-cards.js, never on the hub's loop), and in place by a process that ships no such
// worker (the device agent's bundle: its own loop, as the release read it there). Each answer carries its SIGNAL — the parent's
// subagents listing + the sub id the ask named — and `clean` (no read failed); an ask naming the signal its «not found» was
// answered on is answered «not found» without reading the store.
/** [{parentId, toolCallId, step, subId, notFoundOn}] → [{toolCallId, snap | null, sig, clean | skipped}] */
function snapshotsOf({ home, asks = [], now = Date.now() } = {}) {
  let failed = 0;
  const read = storeReader(home, { onError: () => { failed++; } });
  return asks.map((a) => {
    failed = 0;
    try {
      const pp = AS.storePaths(a.parentId), sig = `${pp ? read.listing(pp.subagents) : ''}#${(a.subId && String(a.subId)) || ''}`;
      if (a.notFoundOn != null && a.notFoundOn === sig) return { toolCallId: a.toolCallId, snap: null, sig, skipped: true };
      const snap = AS.snapshotOf(read, { parentId: a.parentId, toolCallId: a.toolCallId, step: a.step, now, subId: a.subId || null });
      return { toolCallId: a.toolCallId, snap: snap || null, sig, clean: failed === 0 };
    } catch (e) { return { toolCallId: a.toolCallId, snap: null, sig: null, clean: false, error: String((e && e.message) || e).slice(0, 200) }; }
  });
}

module.exports = { storeReader, snapshotsOf };

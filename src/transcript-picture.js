'use strict';
/**
 * A PICTURE IS READ FROM THE RECORD IT CAME IN (lane chat-attachments-persist, the cut — 主开发 2026-11-13 08:54Z: «the
 * record is the store»). SHARED: the hub's transcript worker AND the device agent run this file (src/transcript-worker.js
 * op `picture`; the agent's transcript-op method `picture`), so a remote machine answers with the same reader.
 *
 * A PLACE = {key, n}: the record's own key (Claude: its `uuid` — measured on 2.1.322, the live stream's user record carries
 * the same uuid as its transcript line, a sub-agent's in <session>/subagents/agent-<id>.jsonl; Codex: the `call_id` of the
 * function output) and the picture's ordinal among the record's image blocks in document order (the normalizers count the
 * same way: message-manager.js pictureOrdinalsOf, codex-message-manager.js's view_image lift).
 *
 * THE INDEX (one per transcript file, held by the process that reads it): key → [byte offset, length] of each line that
 * holds a picture. ONE pass finds them (a native indexOf for the marker; a line without one is never parsed). When the file
 * only GREW (a live conversation appends all day) the pass goes on from where it stopped — never from the start. A file
 * that shrank or was REPLACED (another inode: the owner's «rescue» swaps a rewritten copy in) is indexed again. INDEX_MAX
 * files are held; the least recently asked one goes.
 *
 * THE READ: the line at its offset is read ONCE into one buffer; a structural scan (strings are skipped by indexOf, never
 * materialized) finds the n-th picture's base64 span. The hub's answer is that span as a byte RANGE of the file (the route
 * streams and decodes it block by block); a device answers its base64 text. A record that is gone, shortened, or stubbed
 * by the rescue answers why — never a broken picture.
 */
const fsp = require('fs').promises;

const INDEX_MAX = 16;                       // transcript indexes held at once (each ≈ 100 bytes per picture line)
const CHUNK = 4 * 1024 * 1024;              // one pass reads the file this much at a time
const CARRY_MAX = 64 * 1024 * 1024;         // a line longer than this holds no picture (it is skipped, never held)
// WHERE A PICTURE SITS IN A HARNESS'S RECORD is the harness's own fact: its descriptor's `store.pictures` (src/harnesses/
// claude.js, codex.js) — {marks: the bytes a line holding one carries, subagents, keyOf(r), picturesOf(r), rescued?(r)}, read
// over the scan below (`r` = the line's root node + the helpers). This file names no harness.
const SHAPES = new Map();   // harness id → {marks: [Buffer], …the descriptor's shape}
function shapeOf(backend) {
  if (typeof backend !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(backend)) return null;
  if (SHAPES.has(backend)) return SHAPES.get(backend);
  let shape = null;
  try {
    const h = require('./harnesses').list().find((x) => x && x.id === backend);
    const p = h && h.store && h.store.pictures;
    if (p && Array.isArray(p.marks) && p.marks.length && typeof p.keyOf === 'function' && typeof p.picturesOf === 'function') shape = { ...p, marks: p.marks.map((m) => Buffer.from(String(m))) };
  } catch { shape = null; }
  SHAPES.set(backend, shape);
  return shape;
}
/** the first marker at or after `from` (-1: none) — each marker's next place is remembered for the buffer, so a rare
 *  marker is searched once per buffer, not once per picture line */
function markFinder(buf, marks) {
  const at = marks.map(() => -2);   // -2: not looked yet; -1: none left in this buffer
  return (from) => {
    let m = -1;
    for (let k = 0; k < marks.length; k++) {
      if (at[k] !== -1 && at[k] < from) at[k] = buf.indexOf(marks[k], from);
      if (at[k] >= 0 && (m < 0 || at[k] < m)) m = at[k];
    }
    return m;
  };
}
const KEY_RE = /^[A-Za-z0-9_-]{1,128}$/;    // a uuid / a call_id

// ── a structural scan of one JSON line in a Buffer: objects / arrays as nodes, strings as SPANS (never copied) ──
const isWs = (c) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
function skipWs(b, i, e) { while (i < e && isWs(b[i])) i++; return i; }
/** the closing quote of the string whose opening quote is at i */
function strEnd(b, i, e) {
  let j = i + 1;
  for (;;) {
    const q = b.indexOf(0x22, j);
    if (q < 0 || q >= e) throw new Error('an unterminated string');
    let k = q - 1, bs = 0;
    while (k > i && b[k] === 0x5c) { bs++; k--; }
    if (bs % 2 === 0) return q;
    j = q + 1;
  }
}
function textOf(b, s, e) {
  const raw = b.toString('utf8', s, e);
  return raw.includes('\\') ? JSON.parse('"' + raw + '"') : raw;
}
function parse(b, i, e, depth = 0) {
  if (depth > 64) throw new Error('nested too deep');
  i = skipWs(b, i, e);
  const c = b[i];
  if (c === 0x22) { const q = strEnd(b, i, e); return { node: { t: 's', s: i + 1, e: q }, next: q + 1 }; }
  if (c === 0x7b || c === 0x5b) {
    const obj = c === 0x7b, close = obj ? 0x7d : 0x5d;
    const node = obj ? { t: 'o', keys: new Map() } : { t: 'a', items: [] };
    let j = skipWs(b, i + 1, e);
    if (b[j] === close) return { node, next: j + 1 };
    for (;;) {
      let k = null;
      if (obj) {
        j = skipWs(b, j, e);
        if (b[j] !== 0x22) throw new Error('a key expected');
        const q = strEnd(b, j, e); k = textOf(b, j + 1, q);
        j = skipWs(b, q + 1, e);
        if (b[j] !== 0x3a) throw new Error('a colon expected');
        j++;
      }
      const v = parse(b, j, e, depth + 1);
      if (obj) node.keys.set(k, v.node); else node.items.push(v.node);
      j = skipWs(b, v.next, e);
      if (b[j] === 0x2c) { j++; continue; }
      if (b[j] === close) return { node, next: j + 1 };
      throw new Error('a separator expected');
    }
  }
  let j = i;
  while (j < e && b[j] !== 0x2c && b[j] !== 0x7d && b[j] !== 0x5d && !isWs(b[j])) j++;
  if (j === i) throw new Error('a value expected');
  return { node: { t: 'v', s: i, e: j }, next: j };
}
const get = (n, k) => (n && n.t === 'o' ? n.keys.get(k) || null : null);
const sval = (b, n) => (n && n.t === 's' ? textOf(b, n.s, n.e) : null);

/** the helpers a harness's shape reads a line with (strings stay spans; `head` reads a string's first bytes) */
function lineView(b, root) {
  return {
    root,
    get,
    str: (n) => sval(b, n),
    isStr: (n) => !!(n && n.t === 's'),
    items: (n) => (n && n.t === 'a' ? n.items : []),
    head: (n, k) => (n && n.t === 's' ? b.toString('latin1', n.s, Math.min(n.e, n.s + k)) : ''),
    from: (n, k) => (n && n.t === 's' ? { t: 's', s: n.s + k, e: n.e } : null),
  };
}
/** The record's pictures in document order, as the harness's shape finds them: [{mediaType, s, e} | null] — s / e = the
 *  base64 span inside the line; null = a picture block without bytes (it still takes its place in the count). */
function picturesOf(shape, b, root) {
  const out = [];
  for (const p of shape.picturesOf(lineView(b, root)) || []) {
    out.push(p && p.span && p.span.t === 's' ? { mediaType: String(p.mediaType || '').toLowerCase(), s: p.span.s, e: p.span.e } : null);
  }
  return out;
}
const keyOf = (shape, b, root) => { try { const k = shape.keyOf(lineView(b, root)); return typeof k === 'string' ? k : null; } catch { return null; } };
const rescuedOf = (shape, b, root) => { try { return typeof shape.rescued === 'function' && !!shape.rescued(lineView(b, root)); } catch { return false; } };

function create({ fs = fsp, indexMax = INDEX_MAX, chunk = CHUNK } = {}) {
  const indexes = new Map();   // fp → {fp, backend, dev, ino, to, keys: Map(key → [off, len]), chain, passes, rebuilt}
  const stats = { passes: 0, rebuilt: 0, extended: 0, bytesScanned: 0 };
  function indexFor(fp, backend, shape) {
    let ix = indexes.get(fp);
    if (ix && ix.backend === backend) { indexes.delete(fp); indexes.set(fp, ix); return ix; }
    ix = { fp, backend, shape, dev: null, ino: null, to: 0, keys: new Map(), chain: Promise.resolve() };
    indexes.set(fp, ix);
    while (indexes.size > indexMax) indexes.delete(indexes.keys().next().value);   // the least recently asked goes
    return ix;
  }
  /** Index what the file holds past `ix.to` (from the start when the file was replaced or shrank). */
  async function extend(ix) {
    const fh = await fs.open(ix.fp, 'r');
    try {
      const st = await fh.stat();
      if (st.ino !== ix.ino || st.dev !== ix.dev || st.size < ix.to) {
        if (ix.ino !== null) { stats.rebuilt++; }
        ix.keys.clear(); ix.to = 0; ix.ino = st.ino; ix.dev = st.dev;
      }
      if (st.size <= ix.to) return;
      if (ix.to > 0) stats.extended++; else stats.passes++;
      const marks = ix.shape.marks;
      let pos = ix.to, lineAt = ix.to, skipping = false;
      // ONE work buffer for the pass: an unfinished line is moved to its front and the next read lands right after it
      // (no buffer per read, no concatenation); it grows only for a line longer than a read
      let work = Buffer.allocUnsafe(Math.min(2 * chunk, Math.max(1, st.size - pos))), have = 0;
      while (pos < st.size) {
        const want = Math.min(chunk, st.size - pos);
        if (work.length < have + want) { const w2 = Buffer.allocUnsafe(have + want); work.copy(w2, 0, 0, have); work = w2; }
        const { bytesRead } = await fh.read(work, have, want, pos);
        if (!bytesRead) break;
        pos += bytesRead; stats.bytesScanned += bytesRead;
        let s0 = 0, end = have + bytesRead, base = lineAt;
        if (skipping) {   // inside a line too long to hold a picture: drop bytes until it ends
          const nl = work.indexOf(0x0a, 0);
          if (nl < 0 || nl >= end) { have = 0; lineAt = pos; continue; }
          skipping = false; s0 = nl + 1; base = pos - bytesRead + nl + 1; lineAt = base;
        }
        const buf = work.subarray(s0, end);
        let ls = 0, open = -1;
        const nextMark = markFinder(buf, marks);
        for (;;) {
          const m = nextMark(ls);
          if (m < 0) break;
          const s = buf.lastIndexOf(0x0a, m) + 1;
          const nl = buf.indexOf(0x0a, m);
          if (nl < 0) { open = s; break; }   // its line goes on in the next read
          try {
            const { node } = parse(buf, s, nl);
            const key = keyOf(ix.shape, buf, node);
            if (key && KEY_RE.test(key)) ix.keys.set(key, [base + s, nl - s]);
          } catch { /* not a record: nothing indexed */ }
          ls = nl + 1;
        }
        const restAt = open >= 0 ? open : buf.lastIndexOf(0x0a) + 1;
        lineAt = base + restAt;
        have = 0;
        if (restAt < buf.length) {
          if (buf.length - restAt > CARRY_MAX) { skipping = true; lineAt = pos; }
          else { work.copyWithin(0, s0 + restAt, end); have = end - (s0 + restAt); }
        }
      }
      ix.to = lineAt;   // the start of the last, unfinished line: read again at the next extension
    } finally { await fh.close(); }
  }
  /** one pass at a time per file; a failed pass is said to its asker and the next asker indexes again */
  const settle = (ix) => { const p = ix.chain.then(() => extend(ix)); ix.chain = p.catch(() => { ix.ino = null; }); return p; };
  /**
   * The n-th picture of the record `key` in the transcript `fp` →
   *   {ok, mediaType, start, end, dev, ino, b64}  (start / end: the base64 span's bytes in the file; b64 only when the span
   *                                                holds an escape — never for the CLI's own JSON — or `withText`)
   *   | {gone: 'missing' | 'shortened' | 'rescued' | 'no-bytes' | 'compressed'}
   */
  async function find({ fp, backend, key, n, withText = false }) {
    const shape = shapeOf(backend);
    if (!shape) return { gone: 'missing' };
    if (typeof key !== 'string' || !KEY_RE.test(key) || !Number.isInteger(n) || n < 0 || n > 1000) return { gone: 'missing' };
    if (/\.zst$/.test(String(fp))) return { gone: 'compressed' };   // a Codex rollout the CLI compressed: its lines are not readable here
    const ix = indexFor(fp, backend, shape);
    for (let attempt = 0; attempt < 2; attempt++) {
      await settle(ix);
      const at = ix.keys.get(key);
      if (!at) return { gone: 'missing' };
      const [off, len] = at;
      const fh = await fs.open(fp, 'r');
      let buf;
      try {
        const st = await fh.stat();
        if (st.ino !== ix.ino || st.dev !== ix.dev || st.size < off + len) { ix.ino = null; continue; }   // replaced meanwhile: index again
        buf = Buffer.allocUnsafe(len);
        const { bytesRead } = await fh.read(buf, 0, len, off);
        if (bytesRead !== len) { ix.ino = null; continue; }
      } finally { await fh.close(); }
      let root;
      try { root = parse(buf, 0, len).node; } catch { ix.ino = null; continue; }
      if (keyOf(shape, buf, root) !== key) { ix.ino = null; continue; }   // another record at that place now: index again
      let pics; try { pics = picturesOf(shape, buf, root); } catch { pics = []; }
      if (n >= pics.length) return { gone: rescuedOf(shape, buf, root) ? 'rescued' : 'shortened' };
      const p = pics[n];
      if (!p || p.e <= p.s) return { gone: 'no-bytes' };
      const escaped = buf.indexOf(0x5c, p.s) >= 0 && buf.indexOf(0x5c, p.s) < p.e;
      const out = { ok: true, mediaType: p.mediaType, start: off + p.s, end: off + p.e, dev: ix.dev, ino: ix.ino };
      if (escaped || withText) out.b64 = escaped ? textOf(buf, p.s, p.e) : buf.toString('latin1', p.s, p.e);
      return out;
    }
    return { gone: 'missing' };
  }
  /** what is held: the files indexed, their picture lines, an estimate of their memory (bytes) */
  function held() {
    let keys = 0, bytes = 0;
    for (const ix of indexes.values()) { keys += ix.keys.size; for (const k of ix.keys.keys()) bytes += 2 * k.length + 64; bytes += 2 * ix.fp.length + 200; }
    return { files: indexes.size, keys, bytes, ...stats };
  }
  return { find, held, indexMax };
}

/**
 * WHERE A PLACE'S RECORD LIVES, through what this machine knows — never a path from the asker: the conversation's transcript
 * by its id (the harness's own `locate`), and a sub-agent's file only when `agent-<id>.jsonl` is AMONG that conversation's
 * own sub-agent files (Claude: <session>/subagents/). → the file, or null.
 */
async function placeFile({ backend, tx, cwd = '', agent = null }, { locate, fs = fsp, path = require('path') } = {}) {
  const shape = shapeOf(backend);
  if (!shape || typeof tx !== 'string' || !KEY_RE.test(tx) || typeof locate !== 'function') return null;
  if (agent !== null && agent !== undefined && agent !== '' && (typeof agent !== 'string' || !KEY_RE.test(agent) || shape.subagents !== true)) return null;
  const fp = await locate(tx, cwd || '');
  if (!fp || typeof fp !== 'string') return null;
  if (!agent) return fp;
  const dir = path.join(path.dirname(fp), tx, 'subagents');
  let names = []; try { names = await fs.readdir(dir); } catch { return null; }
  const want = `agent-${agent}.jsonl`;
  return names.includes(want) ? path.join(dir, want) : null;
}

let shared = null;
/** The process's reader (one per worker thread / per agent): its indexes are this process's. */
const reader = () => (shared || (shared = create()));

/** does this harness's record hold pictures this reader can find? (its descriptor declares the shape) */
const hasPictures = (backend) => !!shapeOf(backend);

module.exports = { create, reader, placeFile, picturesOf, parse, lineView, shapeOf, hasPictures, KEY_RE, INDEX_MAX, CHUNK, CARRY_MAX };

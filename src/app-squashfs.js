'use strict';
/**
 * AN APPIMAGE'S FILE SYSTEM, READ WITHOUT RUNNING IT (design 009 §2 A step 4 + S2). An AppImage (type 2) is an ELF
 * runtime followed by a SquashFS 4.0 image; this module reads that image directly — node builtins only, every read an
 * async fs call, every block an async zlib call (the hub's event loop is never held):
 *   · open(file, offset)      → the image's handle (superblock checked; gzip / zstd / uncompressed blocks — any other
 *                               compressor answers `unsupported` BY NAME)
 *   · root()                  → the root directory's entries [{name, type, ref}] (the AppImage spec puts the app's
 *                               one .desktop and its icon there)
 *   · readFile(entry, max)    → a regular file's bytes (≤ max; a symlink at the root is followed once, by name, within it)
 *   · walk() / extract(dest)  → every entry; the whole tree unpacked under `dest` — names are judged (no `..`, no `/`,
 *                               no NUL), every file is created O_EXCL (never through a link), a directory is made only
 *                               by us, symlinks are made as links and never followed, devices / fifos skipped; bounded
 *                               by entries, depth and bytes. Nothing the archive says can write outside `dest`.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const inflate = promisify(zlib.inflate);
const zstd = typeof zlib.zstdDecompress === 'function' ? promisify(zlib.zstdDecompress) : null;
const COMPRESSORS = Object.freeze({ 1: 'gzip', 2: 'lzma', 3: 'lzo', 4: 'xz', 5: 'lz4', 6: 'zstd' });
const LIMITS = Object.freeze({ entries: 200000, depth: 64, bytes: 16 * 1024 * 1024 * 1024 });
const named = (code, msg) => { const e = new Error(msg); e.code = code; return e; };
const TYPES = { 1: 'dir', 2: 'file', 3: 'symlink', 8: 'dir', 9: 'file', 10: 'symlink' };

async function open(file, offset = 0) {
  const fh = await fsp.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const rd = async (pos, len) => { const b = Buffer.alloc(len); const { bytesRead } = await fh.read(b, 0, len, offset + pos); if (bytesRead !== len) throw named('unreadable', 'the AppImage is cut short'); return b; };
  let S;
  try {
    const sb = await rd(0, 96);
    if (sb.readUInt32LE(0) !== 0x73717368 || sb.readUInt16LE(28) !== 4) throw named('unreadable', 'no SquashFS 4 image where the AppImage\'s runtime ends');
    S = { blockSize: sb.readUInt32LE(12), comp: sb.readUInt16LE(20), root: sb.readBigUInt64LE(32), bytesUsed: Number(sb.readBigUInt64LE(40)), inodeTable: Number(sb.readBigUInt64LE(64)), dirTable: Number(sb.readBigUInt64LE(72)), fragTable: Number(sb.readBigUInt64LE(80)) };
    if (S.comp !== 1 && !(S.comp === 6 && zstd)) throw named('unsupported', `the AppImage is packed with ${COMPRESSORS[S.comp] || `compressor ${S.comp}`}, which VibeSpace cannot open (gzip and zstd only)`);
    if (S.blockSize < 4096 || S.blockSize > 1048576) throw named('unreadable', 'a SquashFS block size out of range');
  } catch (e) { await fh.close(); throw e; }
  const unpack = (buf, max) => (S.comp === 1 ? inflate(buf, { maxOutputLength: max }) : zstd(buf, { maxOutputLength: max })).catch(() => { throw named('unreadable', 'a damaged block in the AppImage'); });
  const metaCache = new Map();
  async function metaBlock(pos) {
    if (metaCache.has(pos)) return metaCache.get(pos);
    const h = (await rd(pos, 2)).readUInt16LE(0);
    const size = h & 0x7fff;
    if (!size || size > 8192) throw named('unreadable', 'a damaged metadata block');
    const raw = await rd(pos + 2, size);
    const out = { data: h & 0x8000 ? raw : await unpack(raw, 8192), next: pos + 2 + size };
    if (metaCache.size > 4096) metaCache.clear();
    metaCache.set(pos, out);
    return out;
  }
  /** a cursor over a metadata table: `take(n)` crosses blocks */
  function cursor(start, block, off) {
    let pos = start + block, o = off;
    return {
      async take(n) {
        const parts = []; let need = n;
        while (need > 0) {
          const b = await metaBlock(pos);
          if (o >= b.data.length) { pos = b.next; o = 0; continue; }
          const k = Math.min(need, b.data.length - o);
          parts.push(b.data.subarray(o, o + k)); o += k; need -= k;
        }
        return Buffer.concat(parts);
      },
    };
  }
  const refOf = (ref) => ({ block: Number(BigInt(ref) >> 16n), off: Number(BigInt(ref) & 0xffffn) });
  async function inode(block, off) {
    const c = cursor(S.inodeTable, block, off);
    const h = await c.take(16);
    const t = h.readUInt16LE(0), mode = h.readUInt16LE(2);
    const out = { t, type: TYPES[t] || 'other', mode };
    if (t === 1) { const b = await c.take(16); Object.assign(out, { dirBlock: b.readUInt32LE(0), dirSize: b.readUInt16LE(8), dirOff: b.readUInt16LE(10) }); }
    else if (t === 8) { const b = await c.take(24); Object.assign(out, { dirSize: b.readUInt32LE(4), dirBlock: b.readUInt32LE(8), dirOff: b.readUInt16LE(18) }); }
    else if (t === 2 || t === 9) {
      if (t === 2) { const b = await c.take(16); Object.assign(out, { start: b.readUInt32LE(0), frag: b.readUInt32LE(4), fragOff: b.readUInt32LE(8), size: b.readUInt32LE(12) }); }
      else { const b = await c.take(40); Object.assign(out, { start: Number(b.readBigUInt64LE(0)), size: Number(b.readBigUInt64LE(8)), frag: b.readUInt32LE(28), fragOff: b.readUInt32LE(32) }); }
      const n = out.frag === 0xffffffff ? Math.ceil(out.size / S.blockSize) : Math.floor(out.size / S.blockSize);
      if (n > 1 << 22) throw named('unreadable', 'a file larger than the archive');
      const sizes = await c.take(4 * n);
      out.blocks = Array.from({ length: n }, (_, i) => sizes.readUInt32LE(4 * i));
    } else if (t === 3 || t === 10) { const b = await c.take(8); const n = b.readUInt32LE(4); if (n > 4096) throw named('unreadable', 'a link target too long'); out.target = (await c.take(n)).toString('utf8'); }
    return out;
  }
  async function list(dirNode) {
    const out = [];
    if (dirNode.dirSize <= 3) return out;
    const c = cursor(S.dirTable, dirNode.dirBlock, dirNode.dirOff);
    let left = dirNode.dirSize - 3;
    while (left > 0) {
      const h = await c.take(12); left -= 12;
      const count = h.readUInt32LE(0) + 1, start = h.readUInt32LE(4);
      if (count > 256) throw named('unreadable', 'a damaged directory');
      for (let i = 0; i < count; i++) {
        const e = await c.take(8); const n = e.readUInt16LE(6) + 1;
        const name = (await c.take(n)).toString('utf8'); left -= 8 + n;
        out.push({ name, type: TYPES[e.readUInt16LE(4)] || 'other', block: start, off: e.readUInt16LE(0) });
      }
    }
    return out;
  }
  async function fragment(idx) {
    const ptr = Number((await rd(S.fragTable + 8 * Math.floor(idx / 512), 8)).readBigUInt64LE(0));
    const e = await cursor(ptr, 0, (idx % 512) * 16).take(16);
    const start = Number(e.readBigUInt64LE(0)), w = e.readUInt32LE(8), size = w & 0xffffff;
    const raw = await rd(start, size);
    return w & 0x1000000 ? raw : unpack(raw, S.blockSize);
  }
  /** a regular file's bytes, block by block, to `sink(buf)` */
  async function stream(node, sink) {
    let pos = node.start, left = node.size;
    for (const w of node.blocks) {
      const size = w & 0xffffff, n = Math.min(left, S.blockSize);
      const buf = size === 0 ? Buffer.alloc(n) : w & 0x1000000 ? await rd(pos, size) : await unpack(await rd(pos, size), S.blockSize);
      pos += size; left -= n;
      await sink(buf.subarray(0, n));
    }
    if (left > 0 && node.frag !== 0xffffffff) { const f = await fragment(node.frag); await sink(f.subarray(node.fragOff, node.fragOff + left)); left = 0; }
  }
  const rootRef = refOf(S.root);
  const rootNode = () => inode(rootRef.block, rootRef.off);
  async function root() { return list(await rootNode()); }
  async function readFile(entry, max = 256 * 1024, { follow = true } = {}) {
    let node = await inode(entry.block, entry.off);
    if (node.type === 'symlink' && follow && /^[A-Za-z0-9@._+-]{1,120}$/.test(node.target)) { const e2 = (await root()).find((x) => x.name === node.target); if (e2) return readFile(e2, max, { follow: false }); }
    if (node.type !== 'file') return null;
    if (node.size > max) throw named('too_large', `a file the AppImage names is larger than ${max} bytes`); // never the archive's own words in a sentence
    const parts = [];
    await stream(node, async (b) => { parts.push(Buffer.from(b)); });
    return Buffer.concat(parts);
  }
  const nameOk = (n) => typeof n === 'string' && n !== '' && n !== '.' && n !== '..' && !/[/\0]/.test(n) && Buffer.byteLength(n) <= 255;
  /** every entry (depth-first) → visit({rel, node, entry}); bounded */
  async function walk(visit, { limits = LIMITS } = {}) {
    let count = 0, bytes = 0;
    const seen = new Set();
    async function dir(node, rel, depth) {
      if (depth > limits.depth) throw named('hostile', 'the AppImage nests directories too deep');
      const key = `${node.dirBlock}:${node.dirOff}`; if (seen.has(key)) throw named('hostile', 'a directory loop in the AppImage'); seen.add(key);
      for (const e of await list(node)) {
        if (!nameOk(e.name)) throw named('hostile', 'the AppImage holds a file name that is `..`, empty or has a slash — it could write outside its directory');
        if (++count > limits.entries) throw named('hostile', 'the AppImage holds too many files');
        const n = await inode(e.block, e.off);
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (n.type === 'file') { bytes += n.size; if (bytes > limits.bytes) throw named('too_large', 'the AppImage unpacks larger than VibeSpace allows'); }
        await visit({ rel: r, node: n, entry: e });
        if (n.type === 'dir') await dir(n, r, depth + 1);
      }
    }
    await dir(await rootNode(), '', 0);
    return { count, bytes };
  }
  /** the whole tree under `dest` (which must not exist yet) */
  async function extract(dest, { limits = LIMITS } = {}) {
    const base = path.resolve(dest);
    await fsp.mkdir(base, { mode: 0o700 });
    const inside = (rel) => { const p = path.resolve(base, rel); if (p !== base && !p.startsWith(base + path.sep)) throw named('hostile', `the AppImage would write outside its directory (${rel.slice(0, 80)})`); return p; };
    const dirs = [];
    const r = await walk(async ({ rel, node }) => {
      const p = inside(rel);
      const mode = node.mode & 0o777 & ~0o022;
      if (node.type === 'dir') { await fsp.mkdir(p, { mode: 0o700 }); dirs.push([p, mode | 0o700]); }
      else if (node.type === 'file') {
        const fh2 = await fsp.open(p, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
        try { await stream(node, async (b) => { await fh2.write(b); }); } finally { await fh2.close(); }
        await fsp.chmod(p, mode | 0o400);
      } else if (node.type === 'symlink') await fsp.symlink(node.target, p);
    }, { limits });
    for (const [p, m] of dirs.reverse()) await fsp.chmod(p, m);
    return r;
  }
  return { super: S, root, readFile, walk, extract, close: () => fh.close() };
}

module.exports = { open, COMPRESSORS, LIMITS };

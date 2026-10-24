'use strict';
/**
 * WHERE A PATH LIVES — on this machine's own disk, or on a mount that can hold the hub (lane hub-fuse-sync-guard,
 * 2026-10-23). PURE: imports nothing; the mountinfo text, the storage rows and the instance's own dirs are handed in.
 *
 * 21:56–22:02 PT the production hub answered nothing for 6.5 min: its MAIN thread sat in the kernel's FUSE wait
 * (request_wait_answer) inside a synchronous fs call whose path was on an rclone storage mount that three orphaned
 * `bfs` walks of `/` were crawling. The witness and the guard (src/server/sync-fs-witness.js) ask this module, before
 * every synchronous fs call of the main thread, whether its path is on such a mount.
 *   · parseMountinfo(text) — /proc/self/mountinfo's rows { mountpoint, fstype, source, dev } (octal escapes undone)
 *   · rootsOf({ mounts, registry, rootDir, dataDir }) — THE ROOTS, longest first: every network or FUSE mount (fuse,
 *     fuse.*, nfs*, cifs, smb*, sshfs, davfs*; never fuseblk / fusectl) UNION the product's storage rows, each with
 *     its kind —
 *       'storage' — a product storage row (mounted or not: an unmounted one is the bare folder the shadow rule guards),
 *                   or any FUSE / SMB / WebDAV mount a person made by hand: the main thread never waits there
 *       'home'    — the mount the instance itself lives on (it holds rootDir or dataDir — on the owner's box the
 *                   workspace bindfs over NFS): witnessed, never refused — refusing it would stop the product
 *       'network' — any other kernel NFS mount: witnessed, never refused
 *   · pathClass(p, ctx) → 'mount' | 'local' | 'unknown'; rootOf(p, ctx) → the root row holding p, or null.
 * THE EXEMPTION: the instance's own rootDir / dataDir subtree is 'local' even when it sits on a network mount — its
 * stores, its session meta, its atomic writes are the product (they are witnessed like everything else).
 * A path is resolved with path-resolve rules only, never realpath (a realpath is itself a synchronous walk into the
 * mount): a symlink into a mount reads as where it stands — the witness still times it.
 */

const NET_FSTYPE = /^(?:fuse(?:\..+)?|nfs4?|cifs|smb3?|smbfs|sshfs|davfs2?)$/;
const STORAGE_FSTYPE = /^(?:fuse(?:\..+)?|cifs|smb3?|smbfs|sshfs|davfs2?)$/;

const unescape = (s) => String(s).replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));

/** /proc/self/mountinfo → [{ mountpoint, fstype, source, dev }]. A line it cannot read is skipped. */
function parseMountinfo(text) {
  const out = [];
  for (const ln of String(text || '').split('\n')) {
    const f = ln.split(' ');
    const dash = f.indexOf('-', 6);
    if (f.length < 7 || dash < 0 || f.length < dash + 3) continue;
    out.push({ mountpoint: unescape(f[4]), fstype: f[dash + 1], source: unescape(f[dash + 2]), dev: f[2] });
  }
  return out;
}

// the path-resolve rules this module needs (POSIX; no import): collapse '.', '..' and repeated slashes
function normAbs(p) {
  const parts = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return '/' + parts.join('/');
}

/** The absolute form of `p` (a string, a Buffer, a file: URL), or null when it cannot be known without the disk
 *  (a descriptor, a relative path with no cwd handed in). `~` / `~/x` resolve against `home`. */
function resolvePath(p, { cwd = null, home = null } = {}) {
  let s = p;
  if (s && typeof s === 'object' && typeof s.href === 'string' && s.protocol === 'file:') { try { s = decodeURIComponent(s.pathname); } catch { return null; } }
  else if (s && typeof s === 'object' && typeof s.toString === 'function' && typeof s.length === 'number' && !Array.isArray(s)) s = s.toString();
  if (typeof s !== 'string' || !s || s.includes('\0')) return null;
  if (home && (s === '~' || s.startsWith('~/'))) s = home + s.slice(1);
  if (s[0] !== '/') { if (!cwd || cwd[0] !== '/') return null; s = cwd + '/' + s; }
  // already in normal form (the hot case: every main-thread sync call asks) — no split
  if (s.indexOf('/.') < 0 && s.indexOf('//') < 0) return s.length > 1 && s[s.length - 1] === '/' ? s.slice(0, -1) : s;
  return normAbs(s);
}

const under = (p, root) => root === '/' || p === root || p.startsWith(root + '/');

/**
 * THE ROOTS. `mounts` = parseMountinfo rows; `registry` = the product's storage rows [{ mountpoint, name, id }].
 * → [{ root, kind: 'storage'|'home'|'network', name, fstype, id }] longest root first.
 */
function rootsOf({ mounts = [], registry = [], rootDir = null, dataDir = null } = {}) {
  const own = [rootDir, dataDir].map((d) => (typeof d === 'string' && d[0] === '/' ? normAbs(d) : null)).filter(Boolean);
  const byRoot = new Map();
  for (const m of Array.isArray(mounts) ? mounts : []) {
    if (!m || typeof m.mountpoint !== 'string' || m.mountpoint[0] !== '/' || !NET_FSTYPE.test(String(m.fstype || ''))) continue;
    const root = normAbs(m.mountpoint);
    if (root === '/') continue;
    const home = own.some((d) => under(d, root));
    byRoot.set(root, { root, kind: home ? 'home' : STORAGE_FSTYPE.test(m.fstype) ? 'storage' : 'network', name: null, fstype: m.fstype, id: null });
  }
  for (const r of Array.isArray(registry) ? registry : []) {
    if (!r || typeof r.mountpoint !== 'string' || r.mountpoint[0] !== '/') continue;
    const root = normAbs(r.mountpoint);
    if (root === '/') continue;
    const had = byRoot.get(root);
    const home = own.some((d) => under(d, root));
    byRoot.set(root, { root, kind: home ? 'home' : 'storage', name: r.name || null, fstype: had ? had.fstype : null, id: r.id || null });
  }
  return [...byRoot.values()].sort((a, b) => b.root.length - a.root.length);
}

// the roots of one list, bucketed by their first path segment (longest first in each): built once per list (a WeakMap
// on the array the caller hands in — the witness keeps one array per refresh), so a judge costs one bucket's scan
const BUCKETS = new WeakMap();
const firstSeg = (p) => { const i = p.indexOf('/', 1); return i < 0 ? p : p.slice(0, i); };
function bucketsOf(list) {
  let b = BUCKETS.get(list);
  if (b) return b;
  b = new Map();
  for (const r of list) {
    const row = typeof r === 'string' ? { root: normAbs(r), kind: 'storage', name: null, fstype: null, id: null } : r;
    if (!row || typeof row.root !== 'string' || row.root[0] !== '/') continue;
    const k = firstSeg(row.root);
    if (!b.has(k)) b.set(k, []);
    b.get(k).push({ row, root: row.root, slash: row.root + '/' });
  }
  for (const rows of b.values()) rows.sort((x, y) => y.root.length - x.root.length);
  BUCKETS.set(list, b);
  return b;
}
const clean = (d) => (typeof d === 'string' && d[0] === '/' ? normAbs(d) : null);
// the instance's own dirs of one ctx, normalized once (a WeakMap on the ctx the caller keeps)
const OWN = new WeakMap();
function ownOf(ctx) {
  let o = OWN.get(ctx);
  if (o) return o;
  o = [clean(ctx.dataDir), clean(ctx.rootDir)].filter(Boolean).map((d) => ({ d, slash: d === '/' ? '/' : d + '/' }));
  OWN.set(ctx, o);
  return o;
}

/** The root row holding `p` (after resolve), or null: a local path, an unknown one, or the instance's own subtree. */
function rootOf(p, ctx = {}) {
  const abs = resolvePath(p, ctx);
  if (!abs) return null;
  for (const o of ownOf(ctx)) if (abs === o.d || abs.startsWith(o.slash)) return null;
  if (!Array.isArray(ctx.mountRoots) || !ctx.mountRoots.length) return null;
  const rows = bucketsOf(ctx.mountRoots).get(firstSeg(abs));
  if (rows) for (const e of rows) if (abs === e.root || abs.startsWith(e.slash)) return e.row;
  return null;
}

/** pathClass(p, { mountRoots, rootDir, dataDir, home, cwd }) → 'mount' | 'local' | 'unknown'. `mountRoots` = rootsOf()'s
 *  rows (or bare root strings, read as storage). */
function pathClass(p, ctx = {}) {
  const abs = resolvePath(p, ctx);
  if (!abs) return 'unknown';
  return rootOf(abs, ctx) ? 'mount' : 'local';
}

module.exports = { parseMountinfo, rootsOf, rootOf, pathClass, resolvePath, NET_FSTYPE, STORAGE_FSTYPE };

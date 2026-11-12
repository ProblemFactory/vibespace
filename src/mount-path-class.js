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
 *       'disk'    — a passthrough view (fuse.bindfs) of a file system that is neither network nor FUSE (a local disk,
 *                   tmpfs, an NTFS stick, squashfs …; its words name the type): witnessed (a stopped FUSE daemon holds
 *                   every reader, whatever it shows), never refused
 *     A passthrough VIEW (fuse.bindfs) the instance does not live on is classed by WHAT IT SHOWS — over NFS 'network',
 *     over a storage mount 'storage', over anything else 'disk'; a source that cannot be told 'storage': only the REFUSAL
 *     follows the source, the WATCH follows the daemon; a storage mount BELOW the source is storage through the view too
 *     (lane mount-class-by-source, below rootsOf).
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
 * A VIEW IS CLASSED BY WHAT IT SHOWS (lane mount-class-by-source, 2026-11-12). The owner's workspace is a fuse.bindfs view
 * of a kernel NFS mount: while the instance lived on it, it was 'home'; the day the instance moved to the local disk the
 * SAME mount read 'storage' (every fuse.* does) and the guard refused every project path — where the hub lives changed
 * what it may touch. A passthrough view (VIEW_FSTYPE) takes the class of the mount its source lives on: over NFS
 * 'network', over a storage mount 'storage', over anything that is neither (a local disk, tmpfs …) 'disk' — still a
 * root, witnessed and never refused (主开发's ruling on the first post: «no root» would word a hold under a stopped daemon «not under a mount»);
 * a source that cannot be told from the rows handed in stays 'storage'.
 *   THE SOURCE: bindfs passes its source through realpath(3) at start and shows it as the row's source (fsname) — an
 *   absolute path as of mount time, octal-escaped (parseMountinfo undoes it). A source that is not absolute (an fsname
 *   given by hand) cannot be told. A rename never crosses a mount, so a source renamed since still names its mount.
 *   THE MATCH (no disk touched): the longest mount point holding the source among the rows handed in — never the view
 *   itself nor a row listed after it at or under its own mount point (on top of it or inside it: the source was
 *   resolved before the view existed, so `bindfs /d /d` shows what lies beneath); equal mount points ⇒ the row listed
 *   last (it is on top; LINE order is mount order, mount ids are reused). '/' holds a source though it is never a root.
 *   Equal mount points ⇒ the last row listed BEFORE the view (what it entered when it started: a mount put over its
 *   source afterwards does not change what it serves), none before ⇒ the last listed. A view over a view is followed (a
 *   loop ⇒ 'storage'); a source under a product storage row ⇒ 'storage'.
 *   BELOW THE SOURCE (law 3 made exact, round 2 — a path is refused when what it REACHES is storage, by whichever spelling):
 *   bindfs crosses into every mount below its source, so each mount listed below a view's source — and each product
 *   storage row there — is a DERIVED root at the view's spelling, with the class it has when reached (an rclone below the
 *   NFS source is storage through the view as at its own spelling); its row carries `shows` (the mount reached) and
 *   `through` (the view). A view that is storage already refuses all of it; a view the instance lives on derives nothing
 *   (home wins, as on the release — the storage mount is refused at its own spelling); a real row at the same spelling wins.
 *   NOT FOLLOWED (said): a source mount lazily unmounted while the view still serves its detached folder (the table
 *   names the parent mount); a view that started BEFORE its source's mount was mounted reads that mount though it serves
 *   the folder beneath (indistinguishable from a remount by the rows — both watched, never refused, unless storage).
 */
const VIEW_FSTYPE = /^fuse\.bindfs$/;

/** The index of the row a view's source lives on (module doc), or -1 when it cannot be told. Equal mount points ⇒ the
 *  last row listed BEFORE the view (the one it entered when it started: a mount put over its source later does not change
 *  what it serves); none before ⇒ the last row listed. */
function sourceRowOf(list, i) {
  const v = list[i];
  const src = sourceOf(v);
  if (!src) return -1;
  const vroot = normAbs(v.mountpoint);
  let best = -1, bestLen = -1, bestBefore = false;
  for (let j = 0; j < list.length; j++) {
    const m = list[j];
    if (j === i || !m || typeof m.mountpoint !== 'string' || m.mountpoint[0] !== '/') continue;
    const mp = normAbs(m.mountpoint);
    if (j > i && under(mp, vroot)) continue;   // on top of the view or inside it: never what it shows
    if (!under(src, mp)) continue;
    const before = j < i;
    if (mp.length > bestLen || (mp.length === bestLen && (before || !bestBefore))) { best = j; bestLen = mp.length; bestBefore = before; }
  }
  return best;
}
const sourceOf = (v) => (v && typeof v.source === 'string' && v.source[0] === '/' && !v.source.includes('\0') ? normAbs(v.source) : null);

/** The class a row has when it is REACHED — as a view's source, or below one: a view ⇒ what it shows; a storage fstype ⇒
 *  storage; NFS ⇒ network; anything that is not a network or FUSE type ⇒ disk. → { kind, shows: { root, fstype } | null } */
function reachedClassOf(list, j, storageRoots, seen) {
  const s = list[j], fstype = String(s.fstype || ''), shows = { root: normAbs(s.mountpoint), fstype };
  if (VIEW_FSTYPE.test(fstype)) return seen.has(j) ? { kind: 'storage', shows: null } : viewClassOf(list, j, storageRoots, seen);   // a loop cannot be told
  if (!NET_FSTYPE.test(fstype)) return { kind: 'disk', shows };
  return { kind: STORAGE_FSTYPE.test(fstype) ? 'storage' : 'network', shows };
}

/** What a view at list[i] shows → { kind: 'network'|'storage'|'disk', shows: { root, fstype } | null }. */
function viewClassOf(list, i, storageRoots, seen = new Set()) {
  seen.add(i);
  const src = sourceOf(list[i]);
  const prod = src ? storageRoots.find((r) => under(src, r)) : null;
  if (prod) return { kind: 'storage', shows: { root: prod, fstype: null } };
  const j = sourceRowOf(list, i);
  return j < 0 ? { kind: 'storage', shows: null } : reachedClassOf(list, j, storageRoots, seen);
}

/**
 * THE ROOTS. `mounts` = parseMountinfo rows; `registry` = the product's storage rows [{ mountpoint, name, id }].
 * → [{ root, kind: 'storage'|'home'|'network'|'disk', name, fstype, id }] longest root first; a view's row also carries
 * `shows` — { root, fstype } of the mount its source lives on, null when that cannot be told.
 */
function rootsOf({ mounts = [], registry = [], rootDir = null, dataDir = null } = {}) {
  const own = [rootDir, dataDir].map((d) => (typeof d === 'string' && d[0] === '/' ? normAbs(d) : null)).filter(Boolean);
  const byRoot = new Map();
  const list = Array.isArray(mounts) ? mounts : [];
  const storageRoots = (Array.isArray(registry) ? registry : []).filter((r) => r && typeof r.mountpoint === 'string' && r.mountpoint[0] === '/').map((r) => normAbs(r.mountpoint)).filter((r) => r !== '/');
  const views = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m || typeof m.mountpoint !== 'string' || m.mountpoint[0] !== '/' || !NET_FSTYPE.test(String(m.fstype || ''))) continue;
    const root = normAbs(m.mountpoint);
    if (root === '/') continue;
    const home = own.some((d) => under(d, root));
    if (VIEW_FSTYPE.test(m.fstype)) {
      const v = viewClassOf(list, i, storageRoots);
      byRoot.set(root, { root, kind: home ? 'home' : v.kind, name: null, fstype: m.fstype, id: null, shows: v.shows });
      views.push({ i, root, kind: home ? 'home' : v.kind, fstype: m.fstype, src: sourceOf(m) });
      continue;
    }
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
  // BELOW A VIEW'S SOURCE (module doc): what bindfs reaches under its source, at the view's spelling
  const derived = new Map();
  for (const v of views) {
    if (v.kind === 'storage' || v.kind === 'home' || !v.src || v.root === '/') continue;   // storage refuses all of it; home wins (as on the release)
    const spell = (mp) => v.root + (v.src === '/' ? mp : mp.slice(v.src.length));
    const keep = (kind) => kind !== v.kind;
    const through = { root: v.root, fstype: v.fstype };
    for (let j = 0; j < list.length; j++) {
      const m = list[j];
      if (j === v.i || !m || typeof m.mountpoint !== 'string' || m.mountpoint[0] !== '/') continue;
      const mp = normAbs(m.mountpoint);
      if (mp === v.src || !under(mp, v.src) || (j > v.i && under(mp, v.root))) continue;
      const at = spell(mp), c = reachedClassOf(list, j, storageRoots, new Set([v.i]));
      const kind = own.some((d) => under(d, at)) ? 'home' : c.kind;
      if (keep(kind)) derived.set(at, { root: at, kind, name: null, fstype: m.fstype || null, id: null, shows: c.shows || { root: mp, fstype: m.fstype || null }, through });
    }
    for (const r of Array.isArray(registry) ? registry : []) {
      if (!r || typeof r.mountpoint !== 'string' || r.mountpoint[0] !== '/') continue;
      const rp = normAbs(r.mountpoint);
      if (rp === v.src || !under(rp, v.src)) continue;
      const at = spell(rp), had = derived.get(at);
      const kind = own.some((d) => under(d, at)) ? 'home' : 'storage';
      if (keep(kind)) derived.set(at, { root: at, kind, name: r.name || null, fstype: had ? had.fstype : null, id: r.id || null, shows: { root: rp, fstype: had ? had.fstype : null }, through });
    }
  }
  for (const [at, row] of derived) if (!byRoot.has(at)) byRoot.set(at, row);
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

/** PURE: the words a view's row adds to a line that names its mount — '' for any other row (their words stay as they
 *  were): «— a fuse.bindfs view of the nfs4 mount «/mnt/x»» (or of a storage folder, or one whose source cannot be told);
 *  a root derived below a view's source: «— the fuse.rclone mount «/mnt/x/r» reached through the fuse.bindfs view «/v»». */
function viewWords(row) {
  if (!row || row.shows === undefined || row.kind === 'home') return '';   // a product row on a view is named as itself
  const s = row.shows;
  if (row.through) return ` — ${s && s.fstype ? `the ${s.fstype} mount` : 'the storage folder'} «${s ? s.root : '?'}» reached through the ${row.through.fstype} view «${row.through.root}»`;
  if (!VIEW_FSTYPE.test(String(row.fstype || ''))) return '';
  if (!s || typeof s.root !== 'string') return ` — a ${row.fstype} view whose source the mount table does not show (refused until it can be told)`;
  return s.fstype ? ` — a ${row.fstype} view of the ${s.fstype} mount «${s.root}»` : ` — a ${row.fstype} view of the storage folder «${s.root}»`;
}

module.exports = { parseMountinfo, rootsOf, rootOf, pathClass, resolvePath, viewWords, NET_FSTYPE, STORAGE_FSTYPE, VIEW_FSTYPE };

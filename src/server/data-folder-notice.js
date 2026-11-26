'use strict';
/**
 * B-8797 (lane hub-loop-stalls, 主开发 r5195) — VIBESPACE'S OWN DATA FOLDER ON A NETWORK OR USER-SPACE DRIVE IS SAID, ONCE.
 * VibeSpace reads and writes its own records (the install's data folder) on its main thread, and the sync-fs witness and its
 * guard read that folder as the instance's OWN tree: witnessed, never refused (src/mount-path-class.js, THE EXEMPTION). When the
 * folder sits on a FUSE file system (rclone, sshfs, a bindfs view …) or a network one (NFS, SMB, WebDAV), a drive that stops
 * answering freezes the whole hub — and nobody was told where the folder lives. This module tells it:
 *   · THE LOOK — once a start, LOOK_MS after the listen, on an unref'd timer (never in the start's path): the kernel's mount
 *     table (/proc/self/mountinfo, read off the loop, bounded) and nothing else. The folder lands by src/local-index.js
 *     landedPathOf, which asks the table before it touches a component and never touches one on a network or FUSE mount; the
 *     mount it stops on is named by THE ONE VERDICT, src/local-index.js netMountOf — the question the sync-fs witness asks for
 *     the same folder (its refresh's own mount). A table that cannot be read, or a symlink loop, says nothing: the next start
 *     looks again.
 *   · THE NOTICE — ONE For-you item (origin server, «This machine», session name Storage), keyed by the mount and its type;
 *     said ONCE: the store's own record is the memory (filedEver — open, resolved, dismissed or CLEARED: a person's ✕ or Clear
 *     stays final; a record pruned past the ledger's cap may be said once more — accepted by the ruling). While For you is
 *     held unread the look waits for its read (a held list reads empty). The folder back on a local disk ⇒ an open item is
 *     resolved (done).
 *   · THE WORDS name the folder, the install's folder, the kind (network / user space) and the type — NEVER the mount's source
 *     (an rclone remote or an sshfs user@host names an account) nor its options. They say what and why and STOP: the tree's
 *     docs hold no procedure for moving an install (the ruling's word (1): nothing is invented).
 *   · THE SETTINGS FACT — GET /api/data-folder answers the same verdict (looked at once when the start's look has not run yet);
 *     the Settings row «Never let the server wait on a storage mount» draws it as words — no press on it (word (2)). No setting
 *     silences the notice (word (3)).
 */
const fs = require('fs');
const path = require('path');
const LI = require('../local-index.js');
const MPC = require('../mount-path-class.js');

const i18nKey = (s) => s;   // a DECLARED human-visible string (scripts/i18n-extract.mjs): zh + ja in src/lib/i18n-zh.js / i18n-ja.js
const ITEM_KEY = 'data-folder';   // the For-you key (its own: nothing else files under it)
const LOOK_MS = 30000;            // after the listen: the start's own work first
const READ_BOUND_MS = 5000;       // the mount table's read: an answer later than this is no answer (the next start looks again)
// a NETWORK file system (the kernel's own client) — every other type the hub calls network-or-FUSE (local-index NET_FSTYPE) is
// served by a program in user space (FUSE: rclone, sshfs, bindfs …)
const NETWORK_FSTYPE = /^(?:nfs4?|cifs|smb3?|smbfs|davfs2?)$/;
// each kind its WHOLE sentence (translated as one — never a kind word filled into a zh / ja sentence)
const TEXT_NETWORK = i18nKey('VibeSpace keeps its own records in {folder}, which is on a network drive ({type}): if that drive stops answering, VibeSpace stops answering with it');
const TEXT_USER_SPACE = i18nKey('VibeSpace keeps its own records in {folder}, which is on a drive served by a program in user space ({type}): if that program or its connection stops answering, VibeSpace stops answering with it');
const WHY = i18nKey('VibeSpace reads and writes these records all the time, so a slow or lost connection to that drive holds the whole hub.');
const INSTALL = i18nKey('The records are the data folder of VibeSpace\'s own folder, {install}.');
const VIEW = i18nKey('The folder reaches that drive through a {view} view.');
// r5244 (the coordinator's word): a VIEW over a file system that is not a network one — the user-space program IS the view
// ({type} = fuse.bindfs, never the shown «ext4», which would read as the drive a program serves); the shown file system is said here
const VIEW_LOCAL = i18nKey('The folder is a {view} view of a {shows} file system: the program that serves the view is what can stop answering.');

/** THE VERDICT (PURE): where the data folder lives, from the mount table and a landing walk over LOCAL components only.
 *  → { state: 'local', folder, install } | { state: 'remote', folder, install, mount, type, view, kind: 'network'|'user-space' }
 *    | { state: 'unknown', folder, install, why } */
function verdictOf({ dataDir, rootDir = null, mountinfo = null, lstat = null, readlink = null } = {}) {
  const folder = path.resolve(String(dataDir || '.'));
  const install = rootDir ? path.resolve(String(rootDir)) : path.dirname(folder);
  if (typeof mountinfo !== 'string' || !mountinfo.includes(' - ')) return { state: 'unknown', folder, install, why: 'no mount table' };
  const land = LI.landedPathOf(folder, { lstat, readlink, mountinfo });
  if (land && land.loop) return { state: 'unknown', folder, install, why: 'a symlink loop' };
  const at = land && land.blocked ? land.blocked.at : land && land.path ? land.path : folder;
  const m = LI.netMountOf(at, mountinfo);   // THE ONE VERDICT (the sync-fs witness's own question for this folder)
  if (!m) return { state: 'local', folder, install };
  // a passthrough VIEW (fuse.bindfs) is told by what it shows (src/mount-path-class.js rootsOf: the row's `shows`): over a NETWORK
  // file system the drive is that one (its type named, the view said); over anything else the user-space drive IS the view (r5244:
  // its type stays fuse.bindfs, what it shows said beside)
  let view = null, shows = null, type = m.fstype;
  if (MPC.VIEW_FSTYPE.test(m.fstype)) {
    view = m.fstype;
    let row = null;
    try { row = MPC.rootsOf({ mounts: MPC.parseMountinfo(mountinfo), rootDir: install, dataDir: folder }).find((r) => r.root === path.resolve(m.target)) || null; } catch { row = null; }
    if (row && row.shows && typeof row.shows.fstype === 'string' && row.shows.fstype) shows = row.shows.fstype;
    if (shows && NETWORK_FSTYPE.test(shows)) type = shows;
  }
  return { state: 'remote', folder, install, mount: m.target, type, view, shows, kind: NETWORK_FSTYPE.test(type) ? 'network' : 'user-space' };
}

/** a view's own line (PURE): through a view to a network drive, or a view over another file system (r5244) — [] for no view */
const viewLinesOf = (v) => (!v || !v.view ? [] : v.kind === 'network' ? [{ key: VIEW, params: { view: v.view } }] : v.shows ? [{ key: VIEW_LOCAL, params: { view: v.view, shows: v.shows } }] : []);

/** The item's words (PURE) for a remote verdict: {text, detail, i18n}. Folder, install, kind, type — never the source. */
function wordsOf(v) {
  const key = v.kind === 'network' ? TEXT_NETWORK : TEXT_USER_SPACE;
  const fill = (k, p) => k.replace(/\{(\w+)\}/g, (_, n) => String(p[n]));
  const params = { folder: v.folder, type: v.type };
  const lines = [{ key: WHY }, { key: INSTALL, params: { install: v.install } }, ...viewLinesOf(v)];
  return { text: fill(key, params), detail: lines.map((l) => fill(l.key, l.params || {})).join('\n'), i18n: { text: { key, params }, detail: lines } };
}

/** The item's own key: the mount and its type (a folder moved to another remote drive is said again). */
const itemKeyOf = (v) => `data-folder:${v.mount}:${v.type}`;

function create({ dataDir, rootDir = null, getUserTodos = () => null, readMountinfo = () => fs.promises.readFile('/proc/self/mountinfo', 'utf8'),
  lstat = (p) => { try { return { symlink: fs.lstatSync(p).isSymbolicLink() }; } catch (e) { if (e && e.code === 'ENOENT') return null; throw e; } },
  readlink = (p) => fs.readlinkSync(p), log = (l) => console.warn(l), lookMs = LOOK_MS, boundMs = READ_BOUND_MS, app = null } = {}) {
  let last = null;        // the last verdict (null: not looked yet)
  let looking = null;     // the look in flight (one at a time)
  let timer = null;
  const todos = () => { try { return getUserTodos(); } catch { return null; } };
  /** the mount table, off the loop, bounded → its text | null */
  const tableOf = async () => {
    let to = null;
    try {
      const bound = new Promise((resolve) => { to = setTimeout(() => resolve(null), boundMs); to.unref?.(); });
      const t = await Promise.race([Promise.resolve().then(() => readMountinfo()).catch(() => null), bound]);
      return typeof t === 'string' ? t : null;
    } finally { clearTimeout(to); }
  };
  /** say it (once) or settle it, by the verdict — For you held unread: at its read. Never throws (the round's should: a store that
   *  throws is a journal line, never an unhandled rejection) */
  function tell(v) {
    try { tellOnce(v); } catch (e) { log(`[data-folder] the notice could not be told: ${(e && e.message) || e}`); }
  }
  /** an open notice of ANOTHER key (an earlier start's folder on another drive, or now local) is over → how many settled */
  function settleOthers(t, keep) {
    let n = 0;
    for (const i of (typeof t.forSession === 'function' ? t.forSession([ITEM_KEY]) : []) || []) {
      if (!i || i.status !== 'open' || (keep && i.itemKey === keep)) continue;
      try { t.setStatus(i.id, 'done', 'agent'); n++; } catch (e) { log(`[data-folder] the notice ${i.id} was not resolved: ${(e && e.message) || e}`); }
    }
    return n;
  }
  function tellOnce(v) {
    const t = todos();
    if (!t || typeof t.add !== 'function') return;
    if (typeof t.isHeldUnread === 'function' && t.isHeldUnread()) { if (typeof t.whenRead === 'function') t.whenRead(() => tell(v), 'the data folder notice'); return; }
    if (v.state === 'remote') {
      const key = itemKeyOf(v);
      settleOthers(t, key);   // the round's should: a folder now on ANOTHER drive — the earlier drive's open notice is over
      if (typeof t.filedEver === 'function' && t.filedEver(ITEM_KEY, key)) return;   // SAID ONCE: open, resolved, dismissed or cleared
      const w = wordsOf(v);
      try { t.add(ITEM_KEY, { origin: 'server', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Storage', text: w.text, detail: w.detail, i18n: w.i18n, facts: { dataFolder: v.folder, fstype: v.type, kind: v.kind }, itemKey: key }); }
      catch (e) { log(`[data-folder] the notice was not filed: ${(e && e.message) || e}`); }
      return;
    }
    if (v.state === 'local') settleOthers(t, null);   // the folder is on a local disk now: an open notice of an earlier start is over
  }
  /** ONE judgment: the table, the verdict (kept for the Settings fact) → the verdict | null. (A Settings read before the start's
   *  look judges once, and the look judges again: two reads of /proc, never of the folder — the look's verdict is the fresh one) */
  function judge() {
    if (looking) return looking;
    looking = (async () => {
      const mountinfo = await tableOf();
      const v = verdictOf({ dataDir, rootDir, mountinfo, lstat, readlink });
      last = v;
      return v;
    })().catch((e) => { log(`[data-folder] the look failed: ${(e && e.message) || e}`); return null; }).finally(() => { looking = null; });
    return looking;
  }
  /** THE START's LOOK: a judgment, then the notice said (once) or settled → the verdict | null */
  async function look() {
    const v = await judge();
    if (!v) return null;
    if (v.state === 'unknown') log(`[data-folder] where ${v.folder} lives is not known (${v.why}) — nothing said; the next start looks again`);
    else tell(v);
    return v;
  }
  /** the start's look, LOOK_MS after the listen (an unref'd timer: it never holds the start, nor the exit) */
  function arm() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; look().catch((e) => log(`[data-folder] the look failed: ${(e && e.message) || e}`)); }, lookMs);
    timer.unref?.();
  }
  /** the Settings fact (the same verdict): {state, folder, install, mount?, type?, view?, kind?} — never the source */
  const status = () => last;
  if (app && typeof app.get === 'function') {
    app.get('/api/data-folder', async (req, res) => {
      try { const v = last || (await judge()); res.json(v || { state: 'unknown', folder: path.resolve(String(dataDir || '.')), why: 'not looked' }); }
      catch (e) { res.status(500).json({ error: (e && e.message) || String(e) }); }
    });
  }
  return { arm, look, judge, status, stop: () => { if (timer) clearTimeout(timer); timer = null; } };
}

module.exports = { create, verdictOf, wordsOf, viewLinesOf, itemKeyOf, ITEM_KEY, LOOK_MS, NETWORK_FSTYPE, TEXT_NETWORK, TEXT_USER_SPACE, WHY, INSTALL, VIEW, VIEW_LOCAL };

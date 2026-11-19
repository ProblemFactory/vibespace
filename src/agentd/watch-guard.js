'use strict';
/**
 * THE DEVICE AGENT'S WATCHES NEVER END IT (主开发 2026-11-19, found by the readers of the hub's watch hotfix). An fs.watch can
 * fail AFTER it was armed (the machine's limit of file watches), and an 'error' event with no listener ends the process.
 * Every watcher the agent arms goes through armWatch: the listener is on it at once. A watch LOST (an error after arming, a
 * refusal at arming for any cause but a missing folder) is closed and dropped from its feature's list, and the feature falls
 * back to a SWEEP — its own kick every sweepMs (the hub has no sweep of its own for these pushes) — said ONCE per feature for
 * the agent's PROCESS (the said-set lives as long as the process). A lost root watch is armed again only at the next link
 * (a lifted limit is noticed at the next dial); on the tree road a refused subfolder is tried again when a 'rename' in its
 * parent names it (or its parent is read whole again), while the sweep keeps running. endWatches ends a feature on purpose:
 * no word, no sweep.
 * ON LINUX THE TREE IS WALKED HERE, never by node's own recursive watch: node arms one watch per subfolder inside its own
 * code, and a subfolder refused later THROWS from node's callback past every listener (node 24: internal/fs/recursive_watch
 * #scanFolder → #watch rethrows, no try on that road; the agent has no last-resort handler) or is SWALLOWED at arming
 * (node 22: kFSWatchStart keeps only ENOENT). So on Linux: one plain watch per folder, each armed in a try with its own
 * listener; a 'rename' looks at the entry it names (a new folder armed, a folder gone dropped with every watch under it, a
 * folder made again armed again — told by its inode in its parent's event, or by its OWN event while a folder stands at its
 * path, the root included). THE WALK IS CAPPED AND BREADTH-FIRST: at most WALK_CAP watches a feature (the walk reads the
 * folders in one tick and each holds one of the user's watches — the limit the incident was about), shallow folders first;
 * past it the folders are not watched, said once a process for the feature, and the sweep stands in. A drop finds the
 * watches under a folder through its own index (kids), never by walking every watch.
 * Only macOS and Windows keep the native recursive watch (every other platform's recursive watch is node's own walker).
 * Not followed: a symbolic link (node watched its target one level deep).
 * PURE over its arguments (fs, log, the timers and the platform injected; no import): the bundle carries it as is.
 */
const SWEEP_MS = 60000;
const WALK_CAP = 2048;   // folders watched by ONE feature on the tree road, every root of it (ctx.walkCap for a suite)
const why = (e) => (e && (e.code || e.message)) || 'error';
function sweep(ctx, list, onChange) {
  if (list.ended || list.sweep) return;
  list.sweep = (ctx.setInterval || setInterval)(() => { if (!list.ended) { try { onChange(); } catch { } } }, ctx.sweepMs || SWEEP_MS);
  try { list.sweep.unref && list.sweep.unref(); } catch { }
}
function lost(ctx, list, onChange, what, text) {
  if (list.ended) return;
  const { log, said } = ctx;
  if (said && !said.has(what)) { said.add(what); try { log(`${what}: ${text} — it falls back to a sweep every ${Math.round((ctx.sweepMs || SWEEP_MS) / 1000)} s`); } catch { } }
  sweep(ctx, list, onChange);
}
/** Linux: the tree walked here — one plain watch per folder (a symbolic link is not followed), each in a try with its own
 *  listener; a 'rename' looks at the entry it names; a folder that is gone drops its watch and every watch under it. */
function armTree(ctx, list, root, onChange, what) {
  const { fs } = ctx;
  const cap = ctx.walkCap || WALK_CAP;   // counted over the FEATURE's list (every root of it): one budget of the user's watches
  const byDir = new Map();   // folder → { w, ino } (its inode when armed: a folder made again under the same name is another)
  const kids = new Map();    // folder → the set of its watched subfolders (a drop walks the folder's own, never the whole map)
  const parentOf = (dir) => { const i = dir.lastIndexOf('/'); return i > 0 ? dir.slice(0, i) : '/'; };
  const unhook = (dir, e) => { byDir.delete(dir); const i = list.indexOf(e.w); if (i >= 0) list.splice(i, 1); try { e.w.close(); } catch { } };
  const collect = (dir, out) => {
    const ks = kids.get(dir);
    if (ks) { kids.delete(dir); for (const k of ks) collect(k, out); }
    const e = byDir.get(dir); if (e) { byDir.delete(dir); out.add(e.w); }
  };
  const drop = (dir) => {   // the folder AND every watch under it (a folder moved or deleted takes its subfolders' watches with it)
    if (!byDir.has(dir) && !kids.has(dir)) return;   // a file, or a folder never watched: nothing to walk
    const out = new Set(); collect(dir, out);
    const s = kids.get(parentOf(dir)); if (s) s.delete(dir);   // (a folder that comes and goes leaves no name behind — its parent read off its path)
    let j = 0; for (let i = 0; i < list.length; i++) if (!out.has(list[i])) list[j++] = list[i];
    list.length = j;   // the feature's list compacted ONCE for the whole subtree
    for (const w of out) { try { w.close(); } catch { } }
  };
  const dropOne = (dir, w) => { const e = byDir.get(dir); if (e && e.w === w) unhook(dir, e); };   // one watcher's own error: that watch alone
  const gone = (e) => !!e && (e.code === 'ENOENT' || e.code === 'ENOTDIR');
  // THE WALK IS BREADTH-FIRST: every shallow folder is armed before any deeper one, so the cap's slots go to the folders where new
  // transcripts appear (a project's own), never to the first project's deep session folders
  const queue = []; let qi = 0, pumping = false;
  const pump = () => { if (pumping) return; pumping = true; try { while (qi < queue.length) scan(queue[qi++]); } finally { pumping = false; queue.length = 0; qi = 0; } };
  const scan = (dir) => {
    if (list.ended) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) {
      if (gone(e)) drop(dir);
      else lost(ctx, list, onChange, what, `the folder ${dir} could not be read (${why(e)}); its subfolders are not watched`);
      return;
    }
    for (const d of ents) if (d.isDirectory() && !d.isSymbolicLink()) add(`${dir}/${d.name}`, dir);   // add() arms in its own try
  };
  const named = (dir, name) => {   // a 'rename' names ONE entry: look at it alone (a busy folder never pays a whole readdir per file)
    if (list.ended) return;
    if (name == null) { queue.push(dir); pump(); return; }
    const p = `${dir}/${name}`;
    let st = null;
    try { st = fs.lstatSync(p); } catch (e) {
      if (!gone(e)) return;
      drop(p);
      let dirGone = false;
      try { fs.lstatSync(dir); } catch (e2) { if (gone(e2)) { drop(dir); dirGone = true; } }   // the event may be the folder's own (its name, itself gone)
      // the folder's OWN event while a folder stands at its path again: the one that stands is another (made again — the root too,
      // which no parent watches; an inode number given out again too): the dead watch goes, the folder is armed anew (a child of
      // the folder's own name removed costs one re-walk of the folder, never a watch)
      if (!dirGone && name === dir.slice(dir.lastIndexOf('/') + 1) && byDir.has(dir)) { drop(dir); add(dir, dir === top ? null : parentOf(dir)); }
      return;
    }
    if (!st.isDirectory() || st.isSymbolicLink()) { drop(p); return; }   // a watched folder replaced by a file or a link: its watches go
    const had = byDir.get(p);
    if ((had && had.ino != null && st.ino != null && had.ino !== st.ino) || (!had && kids.has(p))) drop(p);   // made again before its event was read (or after its own watch ended): the old watches are dead
    add(p, dir, st.ino);
  };
  const add = (dir, parent = null, ino0 = null) => {
    if (list.ended || byDir.has(dir)) return null;
    if (list.length >= cap) { lost(ctx, list, onChange, what, `its watches reached ${cap} folders, the most it keeps; the ones past it under ${top} are not watched`); return null; }
    let ino = ino0;
    if (ino == null) { try { ino = fs.statSync(dir).ino; } catch { } }   // BEFORE the watch: a folder replaced between the two is re-armed at its next event, never kept
    let w;
    try { w = fs.watch(dir, (ev, name) => { try { onChange(); } catch { } if (ev === 'rename') named(dir, name); }); } catch (e) {
      if (!gone(e)) lost(ctx, list, onChange, what, `the watch on ${dir} could not be armed (${why(e)})`);
      return null;
    }
    w.on('error', (e) => { dropOne(dir, w); if (!gone(e)) lost(ctx, list, onChange, what, `the watch on ${dir} ended (${why(e)})`); });
    byDir.set(dir, { w, ino }); list.push(w);
    if (parent != null) { let s = kids.get(parent); if (!s) kids.set(parent, (s = new Set())); s.add(dir); }
    queue.push(dir); pump();
    return w;
  };
  const top = String(root).replace(/\/+$/, '') || '/';
  let rs = null;
  try { rs = fs.statSync(top); } catch (e) { if (!gone(e)) lost(ctx, list, onChange, what, `the watch on ${top} could not be armed (${why(e)})`); return null; }
  if (!rs.isDirectory()) return null;   // the feeds watch folders; a file at the root is not one
  return add(top, null, rs.ino);
}
function armWatch(ctx, list, dir, onChange, what) {
  if (list.ended) return null;   // a feature ended on purpose arms nothing more
  const platform = ctx.platform || process.platform;
  if (platform !== 'darwin' && platform !== 'win32') return armTree(ctx, list, dir, onChange, what);
  const { fs } = ctx;
  let w = null;
  try { w = fs.watch(dir, { recursive: true }, onChange); } catch (r) {
    try { w = fs.watch(dir, onChange); } catch (e) {
      if (!(e && e.code === 'ENOENT')) lost(ctx, list, onChange, what, `the watch on ${dir} could not be armed (${why(e)})`);
      return null;
    }
    // the recursive watch refused for a cause other than «not on this platform» (the limit, a permission): the plain watch
    // sees the top folder only, its subfolders are lost — said, and swept
    if (r && r.code && r.code !== 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM' && r.code !== 'ENOENT') lost(ctx, list, onChange, what, `the recursive watch on ${dir} could not be armed (${r.code}); its subfolders are not watched`);
  }
  w.on('error', (e) => {
    try { w.close(); } catch { }
    const i = list.indexOf(w); if (i >= 0) list.splice(i, 1);
    lost(ctx, list, onChange, what, `the watch on ${dir} ended (${why(e)})`);
  });
  list.push(w);
  return w;
}
function endWatches(ctx, list) {
  if (!list) return;
  list.ended = true;
  if (list.sweep) { try { (ctx.clearInterval || clearInterval)(list.sweep); } catch { } list.sweep = null; }
  for (const w of list.splice(0)) { try { w.close(); } catch { } }
}
module.exports = { armWatch, endWatches, SWEEP_MS, WALK_CAP };

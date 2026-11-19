'use strict';
/**
 * THE DEVICE AGENT'S WATCHES NEVER END IT (主开发 2026-11-19, found by the readers of the hub's watch hotfix). An fs.watch can
 * fail AFTER it was armed (the machine's limit of file watches), and an 'error' event with no listener ends the process.
 * Every watcher the agent arms goes through armWatch: the listener is on it at once. A watch LOST (an error after arming, a
 * refusal at arming for any cause but a missing folder) is closed and dropped from its feature's list, and the feature falls
 * back to a SWEEP — its own kick every sweepMs (the hub has no sweep of its own for these pushes) — said ONCE per feature for
 * the agent's PROCESS (the said-set lives as long as the process). A lost root watch is armed again only at the next link
 * (a lifted limit is noticed at the next dial); on the tree road a refused subfolder is tried again at the next 'rename' in
 * its parent, while the sweep keeps running. endWatches ends a feature on purpose: no word, no sweep.
 * ON LINUX THE TREE IS WALKED HERE, never by node's own recursive watch: node arms one watch per subfolder inside its own
 * code, and a subfolder refused later THROWS from node's callback past every listener (node 24: internal/fs/recursive_watch
 * #scanFolder → #watch rethrows, no try on that road; the agent has no last-resort handler) or is SWALLOWED at arming
 * (node 22: kFSWatchStart keeps only ENOENT). So on Linux: one plain watch per folder, each armed in a try with its own
 * listener; a 'rename' looks at the entry it names (a new folder armed, a folder gone dropped with every watch under it).
 * Only macOS and Windows keep the native recursive watch (every other platform's recursive watch is node's own walker).
 * Not followed: a symbolic link (node watched its target one level deep). A folder deleted and made again before its own
 * event is read keeps its dead watch until the next link (node does the same).
 * PURE over its arguments (fs, log, the timers and the platform injected; no import): the bundle carries it as is.
 */
const SWEEP_MS = 60000;
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
 *  listener; a 'rename' in a folder rescans it, a folder that is gone drops its watch. */
function armTree(ctx, list, root, onChange, what) {
  const { fs } = ctx;
  const byDir = new Map();
  const drop = (dir) => {   // the folder AND every watch under it (a folder moved or deleted takes its subfolders' watches with it)
    for (const [d, w] of [...byDir]) {
      if (d !== dir && !d.startsWith(`${dir}/`)) continue;
      byDir.delete(d); const i = list.indexOf(w); if (i >= 0) list.splice(i, 1); try { w.close(); } catch { }
    }
  };
  const dropOne = (dir, w) => { byDir.delete(dir); const i = list.indexOf(w); if (i >= 0) list.splice(i, 1); try { w.close(); } catch { } };   // one watcher's own error: that watch alone
  const gone = (e) => !!e && (e.code === 'ENOENT' || e.code === 'ENOTDIR');
  const scan = (dir) => {
    if (list.ended) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) {
      if (gone(e)) drop(dir);
      else lost(ctx, list, onChange, what, `the folder ${dir} could not be read (${why(e)}); its subfolders are not watched`);
      return;
    }
    for (const d of ents) if (d.isDirectory() && !d.isSymbolicLink()) add(`${dir}/${d.name}`);   // add() arms in its own try
  };
  const named = (dir, name) => {   // a 'rename' names ONE entry: look at it alone (a busy folder never pays a whole readdir per file)
    if (list.ended) return;
    if (name == null) { scan(dir); return; }
    const p = `${dir}/${name}`;
    let st = null;
    try { st = fs.lstatSync(p); } catch (e) {
      if (!gone(e)) return;
      drop(p);
      try { fs.lstatSync(dir); } catch (e2) { if (gone(e2)) drop(dir); }   // the event may be the folder's own (its name, itself gone)
      return;
    }
    if (st.isDirectory() && !st.isSymbolicLink()) add(p);
  };
  const add = (dir) => {
    if (list.ended || byDir.has(dir)) return null;
    let w;
    try { w = fs.watch(dir, (ev, name) => { try { onChange(); } catch { } if (ev === 'rename') named(dir, name); }); } catch (e) {
      if (!gone(e)) lost(ctx, list, onChange, what, `the watch on ${dir} could not be armed (${why(e)})`);
      return null;
    }
    w.on('error', (e) => { dropOne(dir, w); if (!gone(e)) lost(ctx, list, onChange, what, `the watch on ${dir} ended (${why(e)})`); });
    byDir.set(dir, w); list.push(w);
    scan(dir);
    return w;
  };
  const top = String(root).replace(/\/+$/, '') || '/';
  let rs = null;
  try { rs = fs.statSync(top); } catch (e) { if (!gone(e)) lost(ctx, list, onChange, what, `the watch on ${top} could not be armed (${why(e)})`); return null; }
  if (!rs.isDirectory()) return null;   // the feeds watch folders; a file at the root is not one
  return add(top);
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
module.exports = { armWatch, endWatches, SWEEP_MS };

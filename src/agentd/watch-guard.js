'use strict';
/**
 * THE DEVICE AGENT'S WATCHES NEVER END IT (主开发 2026-11-19, found by the readers of the hub's watch hotfix). An fs.watch can
 * fail AFTER it was armed: on Linux a recursive watch adds one watch per new subfolder, so at the machine's limit of file
 * watches the failure arrives later as the watcher's own 'error' event, and an 'error' event with no listener ends the
 * process. Every watcher the agent arms goes through armWatch: the listener is on it at once. A watch lost (an error after
 * arming, or refused at arming for any cause but a missing folder) is closed and dropped from its feature's list, and the
 * feature falls back to a SWEEP: its own kick every sweepMs (the hub has no sweep of its own for these pushes), said ONCE
 * per feature in the agent's log. endWatches ends a feature on purpose: no word, no sweep. PURE over its arguments (fs,
 * log and the timers injected, no import): the bundle carries it as is.
 */
const SWEEP_MS = 60000;
function sweep(ctx, list, onChange) {
  if (list.ended || list.sweep) return;
  const every = ctx.sweepMs || SWEEP_MS;
  list.sweep = (ctx.setInterval || setInterval)(() => { if (!list.ended) { try { onChange(); } catch { } } }, every);
  try { list.sweep.unref && list.sweep.unref(); } catch { }
}
function lost(ctx, list, onChange, what, why) {
  if (list.ended) return;
  const { log, said } = ctx;
  if (said && !said.has(what)) { said.add(what); try { log(`${what}: ${why} — it falls back to a sweep every ${Math.round((ctx.sweepMs || SWEEP_MS) / 1000)} s`); } catch { } }
  sweep(ctx, list, onChange);
}
function armWatch(ctx, list, dir, onChange, what) {
  if (list.ended) return null;   // a feature ended on purpose arms nothing more
  const { fs } = ctx;
  let w = null;
  try { w = fs.watch(dir, { recursive: true }, onChange); } catch (r) {
    try { w = fs.watch(dir, onChange); } catch (e) {
      if (!(e && e.code === 'ENOENT')) lost(ctx, list, onChange, what, `the watch on ${dir} could not be armed (${(e && (e.code || e.message)) || 'error'})`);
      return null;
    }
    // the recursive watch refused for a cause other than «not on this platform» (the limit, a permission): the plain watch
    // sees the top folder only, its subfolders are lost — said, and swept
    if (r && r.code && r.code !== 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM' && r.code !== 'ENOENT') lost(ctx, list, onChange, what, `the recursive watch on ${dir} could not be armed (${r.code}); its subfolders are not watched`);
  }
  w.on('error', (e) => {
    try { w.close(); } catch { }
    const i = list.indexOf(w); if (i >= 0) list.splice(i, 1);
    lost(ctx, list, onChange, what, `the watch on ${dir} ended (${(e && (e.code || e.message)) || 'error'})`);
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

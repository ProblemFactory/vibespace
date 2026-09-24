// THE APP'S RECONNECT QUEUE (perf lane ⑤b — inc-mtndq0vb's third layer).
// DOM-free, timers injected; the App owns ONE instance (app.js), every ChatView
// asks it, the verdict is `reconnectSlot` in the PURE view-visibility.js.
//
// On a socket transition to `connected` every ChatView's state handler runs in
// the same synchronous pass (WsManager._notifyState). A DISPLAYED view calls
// `_reattach(true)` at once (the 2.369.119 socket jitter already decorrelates
// tabs); a SUSPENDED one (any hider in its reason set — desktop / mobile / tab /
// minimized) enqueues here instead. The queue collects the pass in a microtask,
// orders it by the App's rank (active desktop first, then the other desktops in
// their order, windows in their order within one) and arms slot k at
// `reconnectSlot({suspended:true, index:k})` ms. The view's `_runQueuedReattach`
// is what fires, and `_reattach` stamps `reattachAt` at THAT send — queue time
// is never counted as server silence (2.234.1).
//   · take(view)   — the view was un-hidden before its slot: remove it and let
//                    the caller attach NOW (no displayed window waits);
//   · cancel(view) — dispose: remove silently;
//   · reset()      — the socket dropped again: every pending slot is superseded
//                    (the next `connected` pass re-enqueues whoever is still
//                    hidden, exactly like `_reattachGen` supersedes a ladder).
// Order-independent: the App's own state handler may run before or after the
// views' (registration order) — a pass is whatever enqueued before the
// microtask, and a new pass supersedes every older slot.
import { reconnectSlot } from './view-visibility.js';

export function createReconnectQueue({
  rankOf = () => [0],
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
  defer = (fn) => queueMicrotask(fn),
  slot = reconnectSlot,
} = {}) {
  let pending = [];                 // enqueued in the current pass, not yet ordered
  let flushArmed = false;
  let gen = 0;
  const armed = new Map();          // view → { timer, index, delayMs }
  const cancelArmed = () => { for (const a of armed.values()) clearTimer(a.timer); armed.clear(); };
  const cmp = (a, b) => {
    for (let i = 0; i < Math.max(a.r.length, b.r.length); i++) {
      const x = a.r[i] ?? 0, y = b.r[i] ?? 0;
      if (x !== y) return x - y;
    }
    return a.seq - b.seq;
  };
  function flush() {
    flushArmed = false;
    const batch = pending; pending = [];
    if (!batch.length) return;
    gen++;
    cancelArmed();                  // a new pass supersedes every older slot
    const myGen = gen;
    const ordered = batch.map((view, seq) => {
      let r; try { r = rankOf(view); } catch { r = null; }
      return { view, seq, r: Array.isArray(r) ? r.map((n) => (Number.isFinite(n) ? n : 0)) : [0] };
    }).sort(cmp);
    ordered.forEach(({ view }, index) => {
      const delayMs = slot({ suspended: true, index });
      const timer = setTimer(() => {
        if (myGen !== gen || !armed.has(view)) return;
        armed.delete(view);
        try { view._runQueuedReattach?.('slot'); } catch { }
      }, delayMs);
      armed.set(view, { timer, index, delayMs });
      try { view._trace?.('reconnect:queued', { slot: index, delay: delayMs }); } catch { }
    });
  }
  function enqueue(view) {
    if (!view) return;
    const a = armed.get(view);
    if (a) { clearTimer(a.timer); armed.delete(view); }
    if (!pending.includes(view)) pending.push(view);
    if (!flushArmed) { flushArmed = true; defer(flush); }
  }
  /** Remove `view` if it is waiting; true ⇔ it was (the caller attaches now). */
  function take(view) {
    const i = pending.indexOf(view);
    if (i >= 0) { pending.splice(i, 1); return true; }
    const a = armed.get(view);
    if (!a) return false;
    clearTimer(a.timer); armed.delete(view);
    return true;
  }
  function cancel(view) { take(view); }
  function reset() { gen++; pending = []; cancelArmed(); }
  function has(view) { return pending.includes(view) || armed.has(view); }
  function snapshot() { return [...armed.values()].map(({ index, delayMs }) => ({ index, delayMs })).concat(pending.map(() => ({ index: null, delayMs: null }))); }
  return { enqueue, take, cancel, reset, has, snapshot, get size() { return pending.length + armed.size; } };
}

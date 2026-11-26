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
//   · landed(view) — B-a26e: the view's attach landed (or its hold ended): its held retry no longer counts
//                    toward the cap. A HELD view (the attach hold) rides the same pass as a hidden one (never a
//                    slot of its own: the pass would cancel it); its slot is jittered and, when it fires, waits
//                    while the cap is in flight (below);
//   · reset()      — the socket dropped again: every pending slot is superseded
//                    (the next `connected` pass re-enqueues whoever is still
//                    hidden, exactly like `_reattachGen` supersedes a ladder).
// Order-independent: the App's own state handler may run before or after the
// views' (registration order) — a pass is whatever enqueued before the
// microtask, and a new pass supersedes every older slot.
import { reconnectSlot } from './view-visibility.js';

// B-a26e (主开发 r4686): A HELD window's retry after a reconnect rides the reconnect PASS (enqueue — never cancelled by its own pass);
// its slot is JITTERED and waits while `cap` attaches are in flight across the page: the larger of the held retries released
// and not landed yet (`landed(view)`; each bounded by `flightMs`, so a retry the hub never answers cannot starve the queue) and
// the socket's own count (`pageInFlight`, which forgets an attach after 15 s). A view that is not held keeps its slot exactly.
export const HELD_CAP = 4, HELD_JITTER_MS = 2000, HELD_RETRY_MS = 750, HELD_FLIGHT_MS = 120000;
export function createReconnectQueue({
  rankOf = () => [0],
  random = Math.random,
  now = () => Date.now(),
  pageInFlight = () => 0,
  cap = HELD_CAP,
  jitterMs = HELD_JITTER_MS,
  retryMs = HELD_RETRY_MS,
  flightMs = HELD_FLIGHT_MS,
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
  const released = new Map();       // a HELD view whose retry went → when (until it lands, or flightMs)
  const inFlight = () => { const t = now(); let n = 0; for (const [v, at] of released) { if (t - at < flightMs) n++; else released.delete(v); } let p = 0; try { p = Number(pageInFlight()) || 0; } catch { } return Math.max(n, p); };
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
      const heldAtPass = !!view._attachHold;   // B-a26e: a held window's retry — jittered, capped
      const arm = (delayMs) => {
        const timer = setTimer(() => {
          if (myGen !== gen || !armed.has(view)) return;
          const held = !!view._attachHold;   // read when the slot fires (r4708's read: a hold may begin while the slot waits)
          if (held && inFlight() >= cap) { arm(retryMs + Math.floor(random() * jitterMs)); return; }   // the cap: wait, jittered, never pile on
          armed.delete(view);
          let asked; try { asked = view._runQueuedReattach?.('slot'); } catch { }
          if (held && asked !== false) released.set(view, now());   // counted only when it asked (a declined slot — a closing socket, a closed view — is no attach in flight)
        }, delayMs);
        armed.set(view, { timer, index, delayMs });
      };
      const delayMs = slot({ suspended: true, index }) + (heldAtPass ? Math.floor(random() * jitterMs) : 0);
      arm(delayMs);
      try { view._trace?.('reconnect:queued', { slot: index, delay: delayMs, held: heldAtPass }); } catch { }
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
  function reset() { gen++; pending = []; cancelArmed(); released.clear(); }   // a drop: the hub lost every retry in flight
  /** B-a26e: `view`'s attach landed (or its hold ended): its released retry no longer counts toward the cap. */
  function landed(view) { released.delete(view); }
  function has(view) { return pending.includes(view) || armed.has(view); }
  function snapshot() { return [...armed.values()].map(({ index, delayMs }) => ({ index, delayMs })).concat(pending.map(() => ({ index: null, delayMs: null }))); }
  return { enqueue, take, cancel, reset, has, snapshot, landed, get inFlight() { return inFlight(); }, get size() { return pending.length + armed.size; } };
}

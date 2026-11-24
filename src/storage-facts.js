'use strict';
/**
 * A STORAGE PATH IS ANSWERED FROM ITS LAST KNOWN FACT (lane hub-fuse-sync-guard). A synchronous caller on the main
 * thread's hot path (the Task Group context table, asked on every prompt of every member session) asks here for a path
 * src/storage-path.js calls `storage`: the answer is the fact the last OFF-THREAD read gave — SafeFs, its own worker with
 * a per-call deadline — and a fact older than ttlMs is read again in the background (one read per key in flight). The
 * main thread never waits on the mount. A path never read yet answers { pending: true }; the caller words it.
 *   get(op, payload) → { pending: true } | { ok: true, result } | { ok: false, code, timedOut[, noWorker] }
 * (`noWorker: true` only when SafeFs's deadline met NO worker ever taken — the reader restarting, row B-422c's line 834 round)
 * `onLanded(op, payload, fact)` runs when a read lands with a fact that differs from the one kept.
 *   askedAt(op, payload) → when the read whose fact is kept BEGAN (ms), or null before one landed — the fact's own time, for a
 *   reader that says how old what it shows is (row B-422c's line 834 follow, 主开发 r3809: never the time it was taken)
 */
function create({ safeFs = () => null, ttlMs = 4000, max = 512, timeoutMs = 5000, onLanded = () => {} } = {}) {
  const facts = new Map(); // key → { at, value, inflight }
  const keyOf = (op, payload) => `${op}\u0000${JSON.stringify(payload)}`;
  function read(op, payload) {
    let sf = null;
    try { sf = safeFs(); } catch { }
    if (!sf || typeof sf.call !== 'function') return Promise.reject(Object.assign(new Error('no off-thread reader'), { code: 'no-reader' }));
    return sf.call(op, payload, { timeoutMs });
  }
  function get(op, payload) {
    const k = keyOf(op, payload), now = Date.now();
    let f = facts.get(k);
    if (!f) {
      if (facts.size >= max) facts.delete(facts.keys().next().value);
      f = { at: 0, value: null, inflight: null };
      facts.set(k, f);
    }
    if (!f.inflight && (!f.value || now - f.at >= ttlMs)) {
      const asked = Date.now();
      f.inflight = read(op, payload)
        .then((result) => ({ ok: true, result }), (e) => ({ ok: false, code: (e && e.code) || (e && e.safeFsTimeout ? 'timeout' : 'error'), timedOut: !!(e && e.safeFsTimeout), ...(e && e.noWorker === true ? { noWorker: true } : {}) }))
        .then((v) => {
          const was = f.value ? JSON.stringify(f.value) : null;
          f.value = v; f.at = Date.now(); f.from = asked; f.inflight = null;
          if (was !== JSON.stringify(v)) { try { onLanded(op, payload, v); } catch { } }
          return v;
        });
    }
    return f.value || { pending: true };
  }
  /** every read in flight landed (suites; a clean shutdown) */
  const settled = () => Promise.all([...facts.values()].map((f) => f.inflight).filter(Boolean));
  const askedAt = (op, payload) => { const f = facts.get(keyOf(op, payload)); return f && f.value && typeof f.from === 'number' ? f.from : null; };
  return { get, settled, askedAt, size: () => facts.size, clear: () => facts.clear() };
}

module.exports = { create };

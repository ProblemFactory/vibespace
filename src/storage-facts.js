'use strict';
/**
 * A STORAGE PATH IS ANSWERED FROM ITS LAST KNOWN FACT (lane hub-fuse-sync-guard). A synchronous caller on the main
 * thread's hot path (the Task Group context table, asked on every prompt of every member session) asks here for a path
 * src/storage-path.js calls `storage`: the answer is the fact the last OFF-THREAD read gave — SafeFs, its own worker with
 * a per-call deadline — and a fact older than ttlMs is read again in the background (one read per key in flight). The
 * main thread never waits on the mount. A path never read yet answers { pending: true }; the caller words it.
 *   get(op, payload) → { pending: true } | { ok: true, result } | { ok: false, code, timedOut }
 * `onLanded(op, payload, fact)` runs when a read lands with a fact that differs from the one kept.
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
      f.inflight = read(op, payload)
        .then((result) => ({ ok: true, result }), (e) => ({ ok: false, code: (e && e.code) || (e && e.safeFsTimeout ? 'timeout' : 'error'), timedOut: !!(e && e.safeFsTimeout) }))
        .then((v) => {
          const was = f.value ? JSON.stringify(f.value) : null;
          f.value = v; f.at = Date.now(); f.inflight = null;
          if (was !== JSON.stringify(v)) { try { onLanded(op, payload, v); } catch { } }
          return v;
        });
    }
    return f.value || { pending: true };
  }
  /** every read in flight landed (suites; a clean shutdown) */
  const settled = () => Promise.all([...facts.values()].map((f) => f.inflight).filter(Boolean));
  return { get, settled, size: () => facts.size, clear: () => facts.clear() };
}

module.exports = { create };

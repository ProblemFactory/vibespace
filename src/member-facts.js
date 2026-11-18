/**
 * THE MEMBERSHIP ANSWER'S FILE FACTS, READ OFF THE LOOP (B-55dc). Who is a member of a Task Group depends on three file
 * facts: a 'discover' Context row's kind (a FILE is no folder), where a RELATIVE row resolves (the first candidate that
 * exists), and a session cwd's realpath. The release read them with fs.statSync / fs.realpathSync on the main loop at
 * every ask (a group's resolution re-ran every 4 s) — on a slow mount each stat was a hold. Here each fact is the last
 * OFF-LOOP read: SafeFs's worker when the hub has one (`reader()`), else fs.promises (`fallback`) — never a sync call.
 *
 *   kind(abs)  → 'reading' (never read yet) | 'dir' | 'file' | 'missing'        (the drawing door's answer)
 *   real(p)    → undefined (never read yet) | null (unreadable) | '<realpath>'
 *   need(keys) → the keys of these that were never read (each read started)  (the deciding door asks, then waits)
 *   wait(keys, ms) → resolves when every one of these keys has its first fact, or when `ms` passed — whichever is first
 *   busy()     → the reads in flight now
 *
 * A stat older than ttlMs is read again in the background when it is ASKED (one read per key in flight) — nothing reads
 * when nobody asks; a realpath is read ONCE per folder and kept, as the release kept it (until it is dropped unasked). A key not asked for keepMs is dropped (the bound follows the rows asked about in the last minutes).
 * `onMoved()` runs when a read lands with a value that differs from the one kept (a first read included): the store
 * decides whether a membership moved and says so once. Imports nothing (the readers are injected).
 */
function create({ reader = () => null, fallback = null, ttlMs = 4000, keepMs = 10 * 60 * 1000, timeoutMs = 5000, onMoved = () => {}, now = () => Date.now() } = {}) {
  const facts = new Map();   // key → { value, at, asked, inflight, waiters }
  let gen = 0;               // bumped on every landed change (a derived cache keys on it)
  let pruneAt = 0;
  const keyOf = (op, p) => op + '\u0000' + p;
  function readOnce(op, p) {
    let sf = null;
    try { sf = reader(); } catch { sf = null; }
    if (sf && typeof sf.call === 'function') return sf.call(op, { path: p }, { timeoutMs });
    if (fallback && typeof fallback[op] === 'function') return fallback[op](p);
    return Promise.reject(Object.assign(new Error('no off-loop reader'), { code: 'no-reader' }));
  }
  const valueOf = (op, r) => (op === 'stat' ? (r && r.isDirectory ? 'dir' : r && r.isFile ? 'file' : 'missing') : (r && typeof r.path === 'string' ? r.path : null));
  const failedOf = (op) => (op === 'stat' ? 'missing' : null);   // the release: a stat that throws ⇒ missing; a realpath that throws ⇒ the cwd alone
  function prune(t) {
    if (t < pruneAt) return;
    pruneAt = t + Math.min(keepMs, 60 * 1000);
    for (const [k, f] of facts) if (!f.inflight && t - f.asked > keepMs) facts.delete(k);
  }
  function start(k, f, op, p) {
    f.inflight = Promise.resolve().then(() => readOnce(op, p)).then((r) => valueOf(op, r), () => failedOf(op)).then((v) => {
      const had = f.at > 0, was = f.value;
      f.value = v; f.at = now(); f.inflight = null;
      const ws = f.waiters; f.waiters = [];
      for (const w of ws) { try { w(); } catch { } }
      if (!had || was !== v) { gen++; try { onMoved(op, p, v); } catch { } }
      return v;
    });
    return f.inflight;
  }
  function get(op, p) {
    const t = now(), k = keyOf(op, p);
    let f = facts.get(k);
    if (!f) { f = { value: undefined, at: 0, asked: t, inflight: null, waiters: [] }; facts.set(k, f); }
    f.asked = t;
    if (!f.inflight && (f.at === 0 || (op === 'stat' && t - f.at >= ttlMs))) start(k, f, op, p);
    prune(t);
    return f;
  }
  function kind(abs) { const f = get('stat', abs); return f.at === 0 ? 'reading' : f.value; }
  function real(p) { const f = get('realpath', p); return f.at === 0 ? undefined : f.value; }
  /** keys = [[op, path], …]: the ones never read yet (their reads started by the ask) */
  function need(keys) { return keys.filter(([op, p]) => get(op, p).at === 0); }
  function wait(keys, ms) {
    const open = keys.map(([op, p]) => facts.get(keyOf(op, p))).filter((f) => f && f.at === 0);
    if (!open.length) return Promise.resolve(true);
    return new Promise((resolve) => {
      let left = open.length, done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve(false); } }, Math.max(0, ms));
      if (timer && typeof timer.unref === 'function') timer.unref();
      const one = () => { if (--left === 0 && !done) { done = true; clearTimeout(timer); resolve(true); } };
      for (const f of open) f.waiters.push(one);
    });
  }
  const settled = () => Promise.all([...facts.values()].map((f) => f.inflight).filter(Boolean));
  /** reads in flight now (the store sends its settle signal only once none is left) */
  const busy = () => { let n = 0; for (const f of facts.values()) if (f.inflight) n++; return n; };
  return { kind, real, need, wait, settled, busy, gen: () => gen, size: () => facts.size, clear: () => { facts.clear(); gen++; } };
}

module.exports = { create };

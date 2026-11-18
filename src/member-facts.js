/**
 * THE MEMBERSHIP ANSWER'S FILE FACTS, READ OFF THE LOOP (B-55dc). Who is a member of a Task Group depends on three file
 * facts: a 'discover' Context row's kind (a FILE is no folder), where a RELATIVE row resolves (the first candidate that
 * exists), and a session cwd's realpath. The release read them with fs.statSync / fs.realpathSync on the main loop at
 * every ask (a group's resolution re-ran every 4 s) — on a slow mount each stat was a hold. Here each fact is the last
 * OFF-LOOP read: SafeFs's worker when the hub has one (`reader()`, asked `noInline` — never run on the main thread when no
 * worker is live), else fs.promises (`fallback`, a store with no SafeFs at all: suites, an embedded store).
 *
 *   kind(abs)  → 'reading' (no fact yet, or the read failed) | 'dir' | 'file' | 'missing'   (the drawing door's answer)
 *   real(p)    → undefined (no fact yet, or the read failed) | null (no realpath) | '<realpath>'
 *   need(keys) → the keys of these with no fact yet (each read started)       (the deciding door asks, then waits)
 *   wait(keys, ms) → true when every one of these keys with a read in flight was answered (a fact, or a failure), false
 *                    when `ms` passed first, null AT ONCE when none of the open ones has a read in flight (each waits its
 *                    back-off: UNKNOWN now — nothing lands before a later ask, so nobody waits a bound for it; cure r2)
 *   pending()  → FIRST reads in flight now (a re-read of a known fact does not count: the store's settle waits only for these)
 *
 * A FAILED READ IS NOT A FACT (cure r1, the readers' MUST 1): only an fs code that states a fact — ENOENT / ENOTDIR /
 * ELOOP / EACCES / EPERM / ENAMETOOLONG / EINVAL — answers 'missing' / null, as the release's throwing sync call did; a
 * worker timeout, no live worker, a refused (blocked) mount or any other failure leaves the key UNKNOWN: it is read again
 * with a back-off (backoffMs doubling to backoffMaxMs), the first failure and the recovery said in the journal by name.
 * A stat older than ttlMs is read again in the background when it is ASKED (one read per key in flight) — nothing reads
 * when nobody asks; a realpath is read ONCE per folder and kept, as the release kept it (until it is dropped unasked).
 * A key not asked for keepMs is dropped (the bound follows the rows asked about in the last minutes). `onMoved()` runs
 * when a read lands with a value that differs from the one kept (a first read included), AND when a read of a key with
 * no fact FAILS (`v` undefined: nothing moved, but an answer handed out «still being read» is now as read as it will be
 * until the back-off — the store's settle goes out, the keeping sites re-judge; cure r2). Imports nothing.
 */
const FACT_CODES = new Set(['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM', 'ENAMETOOLONG', 'EINVAL']);
function create({ reader = () => null, fallback = null, ttlMs = 4000, keepMs = 10 * 60 * 1000, timeoutMs = 5000, backoffMs = 1000, backoffMaxMs = 60000,
  onMoved = () => {}, log = () => {}, now = () => Date.now() } = {}) {
  const facts = new Map();   // key → { value, at, asked, inflight, waiters, fails, retryAt }
  let gen = 0;               // bumped on every landed change (a derived cache keys on it)
  let pruneAt = 0;
  const keyOf = (op, p) => op + '\u0000' + p;
  function readOnce(op, p) {
    let sf = null;
    try { sf = reader(); } catch { sf = null; }
    if (sf && typeof sf.call === 'function') return sf.call(op, { path: p }, { timeoutMs, noInline: true });
    if (fallback && typeof fallback[op] === 'function') return fallback[op](p);
    return Promise.reject(Object.assign(new Error('no off-loop reader'), { code: 'no-reader' }));
  }
  const valueOf = (op, r) => (op === 'stat' ? (r && r.isDirectory ? 'dir' : r && r.isFile ? 'file' : 'missing') : (r && typeof r.path === 'string' ? r.path : null));
  const codeOf = (e) => (e && (e.code || (e.safeFsTimeout ? 'timeout' : ''))) || 'error';
  function prune(t) {
    if (t < pruneAt) return;
    pruneAt = t + Math.min(keepMs, 60 * 1000);
    for (const [k, f] of facts) if (!f.inflight && !f.waiters.length && t - f.asked > keepMs) facts.delete(k);
  }
  function start(f, op, p) {
    f.inflight = Promise.resolve().then(() => readOnce(op, p)).then((r) => ({ v: valueOf(op, r) }), (e) => {
      if (FACT_CODES.has(e && e.code)) return { v: op === 'stat' ? 'missing' : null };
      return { unknown: codeOf(e) };
    }).then((o) => {
      f.inflight = null;
      const ws = f.waiters; f.waiters = [];
      if (o.unknown) {
        f.fails++;
        const back = Math.min(backoffMaxMs, backoffMs * 2 ** (f.fails - 1));
        f.retryAt = now() + back;
        if (f.fails === 1) { try { log(`membership: the ${op} of ${p} could not be read (${o.unknown}) — UNKNOWN, not a fact; read again in ${Math.round(back / 1000)} s, backing off`); } catch { } }
        for (const w of ws) { try { w(); } catch { } }
        // a key with no fact whose read FAILED: the store's settle goes out too (cure r2 — it waited for the next ask)
        if (f.at === 0) { try { onMoved(op, p, undefined); } catch { } }
        return undefined;
      }
      if (f.fails) { try { log(`membership: the ${op} of ${p} read again after ${f.fails} failure(s) — ${o.v === null ? 'none' : o.v}`); } catch { } }
      f.fails = 0; f.retryAt = 0;
      const had = f.at > 0, was = f.value;
      f.value = o.v; f.at = now();
      for (const w of ws) { try { w(); } catch { } }
      if (!had || was !== o.v) { gen++; try { onMoved(op, p, o.v); } catch { } }
      return o.v;
    });
    return f.inflight;
  }
  function get(op, p) {
    const t = now(), k = keyOf(op, p);
    let f = facts.get(k);
    if (!f) { f = { value: undefined, at: 0, asked: t, inflight: null, waiters: [], fails: 0, retryAt: 0 }; facts.set(k, f); }
    f.asked = t;
    if (!f.inflight && t >= f.retryAt && (f.at === 0 || (op === 'stat' && t - f.at >= ttlMs))) start(f, op, p);
    prune(t);
    return f;
  }
  function kind(abs) { const f = get('stat', abs); return f.at === 0 ? 'reading' : f.value; }
  function real(p) { const f = get('realpath', p); return f.at === 0 ? undefined : f.value; }
  /** keys = [[op, path], …]: the ones with no fact yet (their reads started by the ask, a failed one after its back-off) */
  function need(keys) { return keys.filter(([op, p]) => get(op, p).at === 0); }
  function wait(keys, ms) {
    const all = keys.map(([op, p]) => facts.get(keyOf(op, p))).filter((f) => f && f.at === 0);
    if (!all.length) return Promise.resolve(true);
    // only a read IN FLIGHT can land: a key waiting its back-off answers «unknown» now (cure r2 — every deciding ask
    // waited its whole bound on it); the ones in flight are waited for (their landing may make it matter no more)
    const open = all.filter((f) => f.inflight);
    if (!open.length) return Promise.resolve(null);
    return new Promise((resolve) => {
      let left = open.length, done = false, timer = null;
      const one = () => { if (--left === 0 && !done) { done = true; clearTimeout(timer); resolve(true); } };
      // a wait that met its bound takes its waiters with it (a fact that never lands keeps no closure per ask)
      timer = setTimeout(() => { if (done) return; done = true; for (const f of open) { const i = f.waiters.indexOf(one); if (i >= 0) f.waiters.splice(i, 1); } resolve(false); }, Math.max(0, ms));
      if (timer && typeof timer.unref === 'function') timer.unref();
      for (const f of open) f.waiters.push(one);
    });
  }
  const settled = () => Promise.all([...facts.values()].map((f) => f.inflight).filter(Boolean));
  /** reads in flight now (any) */
  const busy = () => { let n = 0; for (const f of facts.values()) if (f.inflight) n++; return n; };
  /** FIRST reads in flight now — a re-read of a known fact is not counted (cure r1, MUST 3: the settle waits only for these) */
  const pending = () => { let n = 0; for (const f of facts.values()) if (f.inflight && f.at === 0) n++; return n; };
  /** keys whose last read failed and that wait their back-off (UNKNOWN) */
  const unknown = () => { let n = 0; for (const f of facts.values()) if (f.at === 0 && f.fails > 0 && !f.inflight) n++; return n; };
  return { kind, real, need, wait, settled, busy, pending, unknown, gen: () => gen, size: () => facts.size, clear: () => { facts.clear(); gen++; } };
}

module.exports = { create };

/**
 * shared-gets.js — THE PAGE ASKS EACH ROUTE ONCE (B-360d part 1, 主开发 r2197; PURE: no import, the fetch handed in).
 *
 * WHY: the page's own load asked SIXTEEN routes TWICE (the same caller run by two boot roads: 32 of its 54 requests on a
 * stand-in of the owner's order, one doubled answer a quarter megabyte), and the load was the one clear hold of the hub's loop
 * over fifty milliseconds. `sharedGets(fetch)` answers a fetch that SHARES a read WHILE IT IS IN FLIGHT:
 *   (a) one read in flight a route: a second caller that asks the SAME read before the first has landed gets the SAME answer —
 *       its own copy of the response (`clone()`, made the moment it lands, before the first caller reads a byte), never a second
 *       request. NOTHING is kept after it lands: a later ask is a new request (no stale answer, ever);
 *   (b) a refusal (an error status) reaches every caller that shared it as its own copy of that response, and a failure (the
 *       request rejected) rejects every one of them, each as it would have alone;
 *   (c) a caller that asks with OTHER WORDS is another read: the whole URL (its query), the headers, `credentials`, `cache`
 *       are the read's key; a body, a signal (one caller's abort is never another's), a Request object or any other option is
 *       never shared at all;
 *   (d) WRITES ARE NEVER SHARED: only GET is.
 * The first caller gets the response itself; a joiner gets a copy — so a read nobody joined costs nothing (no copy, no tee).
 * Installed once, at the page's boot (src/client.js), over `window.fetch`: every fetch, fetchJson and api() of the page goes
 * through it. Gated by scripts/test-shared-gets.mjs.
 */

const SHAREABLE = new Set(['method', 'headers', 'credentials', 'cache']);

/** the read's key, or null when this ask is never shared (a write, a body, a signal, a Request, an option outside the key) */
export function readKeyOf(input, init, base) {
  if (!(typeof input === 'string' || (typeof URL !== 'undefined' && input instanceof URL))) return null;
  const o = init || {};
  for (const k of Object.keys(o)) if (o[k] !== undefined && !SHAREABLE.has(k)) return null;
  const method = String(o.method || 'GET').toUpperCase();
  if (method !== 'GET') return null;
  let url;
  try { url = new URL(String(input), base).href; } catch { return null; }
  let heads = [];
  const h = o.headers;
  if (h) {
    if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach((v, k) => heads.push([String(k).toLowerCase(), String(v)]));
    else if (Array.isArray(h)) heads = h.map(([k, v]) => [String(k).toLowerCase(), String(v)]);
    else if (typeof h === 'object') heads = Object.entries(h).map(([k, v]) => [String(k).toLowerCase(), String(v)]);
    else return null;
    heads.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  return JSON.stringify([url, heads, o.credentials || '', o.cache || '']);
}

/** → a fetch that shares a GET while it is in flight (laws a–d above). `base` resolves a relative URL (the page's location). */
export function sharedGets(fetchImpl, { base = (typeof location !== 'undefined' ? location.href : 'http://localhost/') } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('sharedGets: the fetch handed in is not a function');   // never «name(» in a string: the bundle check reads it as a call
  const inflight = new Map();   // key → { joiners: [{ resolve, reject }] } — only while the read is in flight
  const shared = function fetchShared(input, init) {
    const key = readKeyOf(input, init, base);
    if (key === null) return fetchImpl(input, init);
    const had = inflight.get(key);
    if (had) return new Promise((resolve, reject) => { had.joiners.push({ resolve, reject }); });
    const entry = { joiners: [] };
    inflight.set(key, entry);
    return Promise.resolve().then(() => fetchImpl(input, init)).then((res) => {
      if (inflight.get(key) === entry) inflight.delete(key);   // (a) nothing kept after it lands
      for (const j of entry.joiners) { try { j.resolve(res.clone()); } catch (e) { j.reject(e); } }   // each joiner its own copy, made before the first reads
      return res;
    }, (err) => {
      if (inflight.get(key) === entry) inflight.delete(key);
      for (const j of entry.joiners) j.reject(err);   // (b) a failure reaches every caller that shared it
      throw err;
    });
  };
  shared.inflightCount = () => inflight.size;   // for its suite: what is in flight now
  return shared;
}

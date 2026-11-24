/**
 * shared-gets.js — A GET IN FLIGHT IS SHARED (B-360d part 1, 主开发 r2197; PURE: no import, the fetch handed in).
 *
 * WHY: the page's own load asked SIXTEEN routes TWICE (the same caller run by two boot roads: 32 of its 54 requests on a
 * stand-in, one doubled answer a quarter megabyte), and the load was the one clear hold of the hub's loop
 * over fifty milliseconds. `sharedGets(fetch)` answers a fetch that SHARES a read WHILE IT IS IN FLIGHT:
 *   (a) one read in flight a route: a second caller that asks the SAME read before the first has landed gets the SAME answer —
 *       its own copy of the response (`clone()`, made the moment it lands, before the first caller reads a byte), never a second
 *       request. NOTHING is kept after it lands: a later ask is a new request (no stale answer, ever);
 *   (b) a refusal (an error status) reaches every caller that shared it as its own copy of that response, and a failure (the
 *       request rejected) rejects every one of them, each as it would have alone;
 *   (c) a caller that asks with OTHER WORDS is another read: the whole URL (its query), the headers, `credentials`, `cache`
 *       are the read's key; a body, a signal (one caller's abort is never another's), a Request object or any other option is
 *       never shared at all;
 *   (d) WRITES ARE NEVER SHARED: only GET is;
 *   (e) A READ IS JOINED ONLY WHILE YOUNG (JOIN_MS below): a read in flight longer is never joined — an ask again is its own request;
 *   (f) A READ ASKED AFTER A WRITE OF THIS PAGE NEVER JOINS A READ THAT BEGAN BEFORE THAT WRITE WAS ANSWERED (主开发 r3697): a write
 *       is any ask through this fetch whose method is not GET; while one is out no read joins, and a read that began before its
 *       answer is never joined after it (a page that saves and reads its list again gets the list after its change). Reads with no
 *       write between them join as before. A change made over the socket, or by the explorer's upload (an XMLHttpRequest, never
 *       this fetch), is outside this law. HEAD and OPTIONS count as writes (harmless: a read after one is its own request). A write
 *       that never replies leaves sharing off for the page until it does (the release's behaviour: the safe side).
 * The first caller gets the response itself; a joiner gets a copy — so a read nobody joined costs nothing (no copy, no tee).
 * Installed once, at the page's boot (src/client.js), over `window.fetch`: every fetch, fetchJson and api() from then on goes
 * through it. The page's imports run BEFORE it: a fetch at a module's top level goes unshared. A relative URL is resolved
 * against the page's address AS THE KEY IS MADE (a history move changes it), never the one at install.
 * MEASURED (the stand-in's figures): the page's load sent 54 API requests before, 42–43 after; FOUR routes are still asked twice,
 * because their two asks are not one read in flight (docs/kb-file-structure.md, its essay). Gated by scripts/test-shared-gets.mjs.
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

/** (e) A READ IS JOINED ONLY WHILE IT IS YOUNG (主开发 r3683 — the candidate's find: a read that HANGS was joined by every later
 *  ask of it: the retry press, the arrow, the next send's tail read all waited on the stuck request). An ask that finds the same
 *  read in flight for JOIN_MS or longer is its OWN request (and later asks join that newer one). The figure: on the stand-in the
 *  load's slowest doubled read answered in 356 ms (B-360d's measure), so every double the load sends joins inside it, while a
 *  read past it is already slow — never one a person's ask again should wait on; it is well under the 2.5 s a send's landing
 *  allows its tail read (test-chat-send-landing leg 4). */
export const JOIN_MS = 1000;
const clock = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
/** the method of an ask: the init's, else a Request's own, else GET */
function methodOf(input, init) {
  const m = (init && init.method) || (input && typeof input === 'object' && typeof input.method === 'string' ? input.method : '') || 'GET';
  return String(m).toUpperCase();
}

/** → a fetch that shares a GET while it is in flight AND YOUNG, with no write of the page since it began (laws a–f). `base` resolves a relative URL; none given = the page's
 *  address read as each key is made (never the one at install); `joinMs` / `now` = the window and its clock (a suite's) */
export function sharedGets(fetchImpl, { base = null, joinMs = JOIN_MS, now = clock } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('sharedGets: the fetch handed in is not a function');   // never «name(» in a string: the bundle check reads it as a call
  const inflight = new Map();   // key → { joiners: [{ resolve, reject }] } — only while the read is in flight
  const baseNow = () => base || (typeof location !== 'undefined' ? location.href : 'http://localhost/');
  let era = 0, writesOut = 0;   // (f) era moves at every write's send AND its answer; writesOut = this page's writes not yet answered
  const writeAnswered = () => { writesOut--; era++; };
  const shared = function fetchShared(input, init) {
    const key = readKeyOf(input, init, baseNow());
    if (key === null) {
      if (methodOf(input, init) === 'GET') return fetchImpl(input, init);   // an unshared READ (a signal, an option outside the key): no write
      writesOut++; era++;   // (f) a WRITE: no read asked from now on joins a read begun before its answer
      let p;
      try { p = Promise.resolve(fetchImpl(input, init)); } catch (e) { writeAnswered(); throw e; }
      p.then(writeAnswered, writeAnswered);   // registered before the caller's own: the caller's next read already sees the answer
      return p;
    }
    const had = inflight.get(key), age = had ? now() - had.at : -1;
    if (had && age >= 0 && age < joinMs && had.era === era && writesOut === 0) return new Promise((resolve, reject) => { had.joiners.push({ resolve, reject }); });   // (e) young, (f) no write since it began: joined
    const entry = { joiners: [], at: now(), era };   // none in flight, or not young (a negative age too), or a write since it began: a NEW request (later asks join it)
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

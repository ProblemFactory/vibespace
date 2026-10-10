'use strict';
/**
 * THE WEBHOOK INBOUND DOOR'S VERDICTS — PURE (imports nothing; lane webhook-l1-server, docs/design-webhook.zh.md §4 / §10
 * fences 2-4). The route (src/routes/webhook.js) walks the steps IN THIS ORDER and stops at the first refusal; every
 * refusal BEFORE ⑦ means the body was never read (a 300 KB request with a bad token reads 0 bytes):
 *
 *   ① method    POST only — 405 for ANY slug (known or not)
 *   ② ip        the STRANGER gate per client address (30 refusals / min before auth, 1 000 addresses) — 429 the same for every
 *               slug; only a request refused at ①–⑤ is counted (verify r1 #4): a caller that proved who it is pays its own rate
 *   ③ slug      the slug's grammar; a reserved name is a miss (never its own answer)
 *   ④ caller    this slug's callers (a disabled path, a path with no caller, an unknown slug and an address outside the
 *               path's allow-list are ALL "no callers" — the auth step still runs one dummy compare: same answer, same work);
 *               the allow-list is `allowVerdict` over `clientIp` — the SAME check on the replies poll and the pair completion
 *   ⑤ auth      Bearer (the caller's token hash, constant time) or the HMAC headers whole + the timestamp within 5 min
 *   ⑥ length    Content-Length over 256 KB — 413
 *   ⑦ read      the raw body (the route's own bounded read) — a body carrying a `vswh_` token or a `vswp_` pairing code is the
 *               same-shape 401, and so is a DECODED one (`credentialVerdict` after ⑫: a `\u`- or %-escaped spelling)
 *   ⑧ signature v1 = HMAC(token, ts + '.POST./hook/' + slug + '.' + body), constant time
 *   ⑨ replay    the (caller, signature) memo — a signature ACCEPTED within the window is refused; ⑨ and ⑩ only CHECK, the
 *               route COMMITS both after the record is persisted (verify r1 #9: a refused call never burns its signature)
 *   ⑩ idempotency  eventId = <callerId>:<Idempotency-Key> (else <callerId>:<sha256(body)[:32]>); one key, another body = 409
 *   ⑪ rate      the caller's own rate (429 + Retry-After), judged only after it proved who it is
 *   ⑫ parse     JSON or a form — 415 for anything else, 400 for one that does not parse
 *
 * SAME SHAPE: 401 is ONE answer for a wrong token, an unknown slug, a disabled path and a path with no caller; 405 is one
 * answer for any slug; the per-IP 429 is one answer for existing and unknown slugs. BOUNDED: every memo has a capacity and
 * an OVERFLOW FAILS CLOSED (the request is refused and counted), never evicts a live entry an attacker could then replay.
 * The crypto is handed in (`tokenMatches`, `hmacHex`, `sha256Hex`, `safeEqual`) — this module only decides.
 */

const STEPS = Object.freeze(['method', 'ip', 'slug', 'caller', 'auth', 'length', 'read', 'signature', 'replay', 'idempotency', 'rate', 'parse']);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const RESERVED_SLUGS = Object.freeze(['groups', 'side', 'pair', 'replies']);
/** THE SLUG RULE AS ONE VERDICT (lane webhook-l2-ui): `null` (a good slug) | 'grammar' | 'reserved'. The create route
 *  refuses by it and the owner's "New path" wizard words it live, so there is one rule and no second regex. */
function slugProblem(slug) { const s = String(slug == null ? '' : slug); return !SLUG_RE.test(s) ? 'grammar' : RESERVED_SLUGS.includes(s) ? 'reserved' : null; }
const BODY_MAX = 256 * 1024;
const SKEW_MS = 5 * 60 * 1000;
const MEMO_WINDOW_MS = 10 * 60 * 1000;
const IP_PER_MIN = 30, IP_WINDOW_MS = 60 * 1000, IP_MAX = 1000;
const RATE_DEFAULT = 60, RATE_MAX = 600;
const KEY_RE = /^[\x21-\x7e]{1,200}$/;
const CALLER_ID_RE = /^c-[0-9a-f]{8}$/;
const SIG_RE = /^v1=([0-9a-f]{64})$/;
const PAIR_TOKEN_PREFIX = 'vswh_';
/** verify r1 #1 (int248 r2): a pairing CODE (`vswp_`) carries a caller token — at the door it is a credential like one. */
const CREDENTIAL_PREFIXES = Object.freeze([PAIR_TOKEN_PREFIX, 'vswp_']);
const carriesCredential = (s) => CREDENTIAL_PREFIXES.some((x) => s.includes(x));
const HEADERS = Object.freeze({ caller: 'x-webhook-caller', ts: 'x-webhook-timestamp', sig: 'x-webhook-signature', key: 'idempotency-key', replyTo: 'x-in-reply-to', thread: 'x-thread-key', event: 'x-event' });

/** THE FIXED ANSWERS — status + body + headers; nothing in them depends on the slug, the caller or the cause. */
const ANSWERS = Object.freeze({
  'method-not-allowed': Object.freeze({ status: 405, body: Object.freeze({ ok: false, error: 'method-not-allowed' }), headers: Object.freeze({ Allow: 'POST' }) }),
  'rate-limited': Object.freeze({ status: 429, body: Object.freeze({ ok: false, error: 'rate-limited' }), headers: Object.freeze({ 'Retry-After': '60' }) }),
  unauthorized: Object.freeze({ status: 401, body: Object.freeze({ ok: false, error: 'unauthorized' }), headers: Object.freeze({}) }),
  'too-large': Object.freeze({ status: 413, body: Object.freeze({ ok: false, error: 'too-large' }), headers: Object.freeze({}) }),
  conflict: Object.freeze({ status: 409, body: Object.freeze({ ok: false, error: 'idempotency-conflict' }), headers: Object.freeze({}) }),
  'unsupported-type': Object.freeze({ status: 415, body: Object.freeze({ ok: false, error: 'unsupported-media-type' }), headers: Object.freeze({}) }),
  'bad-body': Object.freeze({ status: 400, body: Object.freeze({ ok: false, error: 'bad-body' }), headers: Object.freeze({}) }),
});
const refuse = (answer, step, extra = {}) => ({ ok: false, step, answer, ...extra });
const OK = Object.freeze({ ok: true });

// ── ① – ⑥: before the body ────────────────────────────────────────────────────────────────────────────────────────
function methodVerdict({ method } = {}) { return String(method || '').toUpperCase() === 'POST' ? OK : refuse('method-not-allowed', 'method'); }
/** ③ — a malformed or reserved slug is a MISS (`miss: true`): the walk continues to the dummy compare and answers 401. */
function slugVerdict({ slug } = {}) { const s = String(slug || ''); return SLUG_RE.test(s) && !RESERVED_SLUGS.includes(s) ? OK : { ok: true, miss: true }; }
/** THE PATH ALLOW-LIST — ONE check for EVERY caller-facing route (verify r1 #2: /hook, the replies poll, the pair
 *  completion): `true` when the path lists no address, or lists `addr` = the client address `clientIp` judged (the same
 *  address the stranger gate counts — verify r1 #10). */
function allowVerdict(path, addr) {
  const allow = path && typeof path === 'object' && Array.isArray(path.ipAllow) ? path.ipAllow.filter((x) => typeof x === 'string' && x) : [];
  return !allow.length || allow.includes(String(addr || '').replace(/^::ffff:(?=\d+\.)/, ''));
}
/** ④ — the callers this request may be: `[]` for every kind of miss (the route reads the path row + callers.json).
 *  `remote` = the CLIENT address (`clientIp`), judged by `allowVerdict`. */
function callerVerdict({ path = null, callers = [], remote = '' } = {}) {
  const p = path && typeof path === 'object' ? path : null;
  if (!p || p.disabled === true) return { ok: true, callers: [] };
  if (!allowVerdict(p, remote)) return { ok: true, callers: [] };
  return { ok: true, callers: (Array.isArray(callers) ? callers : []).filter((c) => c && CALLER_ID_RE.test(String(c.id)) && !c.revokedAt) };
}
/**
 * ⑤ — WHO: `{ok:true, caller, scheme, ts?, sig?}` | 401. `bearer` = the Authorization header's token as src/channels/
 * index.js `bearerOf` read it (sliced, never a regex over a credential). `deps.tokenMatches(token, hash)` (constant time) runs over EVERY
 * bearer caller of the path, and once over `deps.dummyHash` when there is none — a miss costs what a hit costs.
 */
function authVerdict({ bearer = null, headers = {}, callers = [], now = 0 } = {}, deps = {}) {
  const hv = (k) => { const v = headers[k]; return typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] || '') : ''; };
  const tm = typeof deps.tokenMatches === 'function' ? deps.tokenMatches : () => false;
  const tok = typeof bearer === 'string' && bearer && bearer.length <= 512 ? bearer : null;
  if (tok) {
    const bearers = callers.filter((c) => c.auth === 'bearer' && typeof c.tokenHash === 'string');
    let hit = null;
    if (!bearers.length) tm(tok, deps.dummyHash || '0'.repeat(64));
    for (const c of bearers) if (tm(tok, c.tokenHash) && !hit) hit = c;
    return hit ? { ok: true, caller: hit, scheme: 'bearer' } : refuse('unauthorized', 'auth');
  }
  const id = hv(HEADERS.caller).trim(), ts = hv(HEADERS.ts).trim(), sig = hv(HEADERS.sig).trim();
  if (!id && !ts && !sig) { tm('', deps.dummyHash || '0'.repeat(64)); return refuse('unauthorized', 'auth', { why: 'no-credential' }); }
  const m = SIG_RE.exec(sig);
  const sec = /^\d{9,11}$/.test(ts) ? Number(ts) * 1000 : NaN;
  const c = callers.find((x) => x.auth === 'hmac' && x.id === id) || null;
  if (!c) tm(id, deps.dummyHash || '0'.repeat(64));
  if (!c || !m || !Number.isFinite(sec) || Math.abs(Number(now) - sec) > SKEW_MS) return refuse('unauthorized', 'auth');
  return { ok: true, caller: c, scheme: 'hmac', ts, sig: m[1] };
}
/** ⑥ — the declared length (a missing one is read with the same bound and refused at it). */
function lengthVerdict({ contentLength } = {}) {
  if (contentLength === undefined || contentLength === null || contentLength === '') return OK;
  const n = Number(contentLength);
  return Number.isFinite(n) && n >= 0 && n <= BODY_MAX ? OK : refuse('too-large', 'length');
}

// ── ⑦ – ⑫: after the read ────────────────────────────────────────────────────────────────────────────────────────
/** ⑦ — the bytes read; a pairing token or a pairing code anywhere in them is refused like a wrong token (a pairing frame
 *  NEVER lands, and neither does a code — verify r1 #1). */
function readVerdict({ body } = {}) {
  const s = Buffer.isBuffer(body) ? body.toString('latin1') : String(body == null ? '' : body);
  if (s.length > BODY_MAX) return refuse('too-large', 'read');
  return carriesCredential(s) ? refuse('unauthorized', 'read', { why: 'pair-token' }) : OK;
}
/** After ⑫ (verify r1 #1 / #12, int248 r2) — the DECODED value: any string (a key or a value, at any depth) carrying a
 *  credential prefix is the same-shape 401 — the `\u`-escaped or %-encoded spelling the raw check cannot see. Bounded
 *  (depth 32, 20 000 strings): a value we could not finish judging is refused, never landed. */
const CRED_DEPTH_MAX = 32, CRED_STRINGS_MAX = 20000;
function credentialVerdict({ value } = {}) {
  let n = 0;
  const stack = [[value, 0]];
  while (stack.length) {
    const [v, d] = stack.pop();
    if (typeof v === 'string') {
      if (++n > CRED_STRINGS_MAX) return refuse('unauthorized', 'read', { why: 'credential-bound' });
      if (carriesCredential(v)) return refuse('unauthorized', 'read', { why: 'credential' });
      continue;
    }
    if (!v || typeof v !== 'object') continue;
    if (d >= CRED_DEPTH_MAX) return refuse('unauthorized', 'read', { why: 'credential-bound' });
    for (const k of Object.keys(v)) { stack.push([k, d + 1]); stack.push([v[k], d + 1]); }
  }
  return OK;
}
/** The string a caller signs (and the reply POST is signed with, its path in place of /hook/<slug>). */
function signatureBase(ts, pathPart, body) { return `${ts}.POST.${pathPart}.${Buffer.isBuffer(body) ? body.toString('utf-8') : String(body == null ? '' : body)}`; }
/** ⑧ — `deps.hmacHex(token, text)` + `deps.safeEqual(a, b)` (constant time). A bearer caller has no signature step. */
function signatureVerdict({ scheme, token, ts, sig, slug, body } = {}, deps = {}) {
  if (scheme !== 'hmac') return OK;
  if (typeof token !== 'string' || !token) return refuse('unauthorized', 'signature');
  const want = deps.hmacHex(token, signatureBase(ts, `/hook/${slug}`, body));
  return deps.safeEqual(want, String(sig || '')) ? OK : refuse('unauthorized', 'signature');
}
/** The eventId (= the record's vendorId): the caller's key, else the body's digest — always in the caller's namespace. */
function eventIdOf(callerId, key, bodySha) { return `${callerId}:${key && KEY_RE.test(key) ? key : String(bodySha || '').slice(0, 32)}`; }
/** ⑫ — `{ok:true, value, form}` | 415 / 400. JSON (any `+json`) or `application/x-www-form-urlencoded`. */
function parseVerdict({ contentType = '', body = '' } = {}) {
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim();
  const s = Buffer.isBuffer(body) ? body.toString('utf-8') : String(body == null ? '' : body);
  if (ct === 'application/json' || /^application\/[a-z0-9.+-]*\+json$/.test(ct)) {
    try { return { ok: true, value: JSON.parse(s), form: false }; } catch { return refuse('bad-body', 'parse'); }
  }
  if (ct === 'application/x-www-form-urlencoded') {
    const out = {};
    for (const [k, v] of new URLSearchParams(s)) if (!Object.prototype.hasOwnProperty.call(out, k) && k !== '__proto__') out[k] = v;
    return { ok: true, value: out, form: true };
  }
  return refuse('unsupported-type', 'parse');
}

// ── THE BOUNDED MEMOS (② ⑨ ⑩ ⑪) ───────────────────────────────────────────────────────────────────────────────────
/** ② THE STRANGER GATE (verify r1 #4, int248 r2): a fixed one-minute window per client address, ≤ `max` addresses. It
 *  stops enumeration and floods BEFORE auth: the route asks `blocked` (never counts) and `charge`s only a request refused at
 *  ①–⑤ — a caller that proved who it is pays its own rate (⑪), and its own poll is never metered here. A FULL table of
 *  live windows refuses a new address (fail closed, `overflow` counted) — an expired window is the only thing forgotten.
 *  `allowed` = the counting form (charge, then judge) for a door that has no auth step of its own. */
function createIpGate({ perMin = IP_PER_MIN, max = IP_MAX, windowMs = IP_WINDOW_MS } = {}) {
  const hits = new Map();
  const stats = { overflow: 0 };
  const live = (h, t) => !!h && !(t - h.at >= windowMs || t < h.at);
  const roomy = (t) => { if (hits.size >= max) for (const [ik, iv] of hits) { if (!live(iv, t)) hits.delete(ik); if (hits.size < max) break; } return hits.size < max; };
  function slot(ip, t, make) {
    const k = String(ip || '');
    let h = hits.get(k);
    if (h && !live(h, t)) { hits.delete(k); h = null; }
    if (!h && make) { if (!roomy(t)) { stats.overflow++; return null; } h = { at: t, n: 0 }; hits.set(k, h); }
    return h;
  }
  function blocked(ip, t) { const h = slot(ip, t, false); if (h) return h.n >= perMin; if (!roomy(t)) { stats.overflow++; return true; } return false; }
  function charge(ip, t) { const h = slot(ip, t, true); if (h) h.n++; }
  function allowed(ip, t) { const h = slot(ip, t, true); return h ? ++h.n <= perMin : false; }
  return { blocked, charge, allowed, stats, size: () => hits.size };
}
/** ⑨ ⑩ ⑪ per caller: the replay memo `(signature → at)` and the idempotency memo `(key → body sha256)`, each ≤
 *  rateLimit × 10 (the window is 10 min), and the per-minute rate. Overflow = refused + counted (fail closed).
 *  verify r1 #9 (int248 r2): `replay` and `idempotency` only CHECK — `commit` records the signature and the key once the
 *  call is ACCEPTED (the record persisted), so a call refused at ⑩–⑫ or by the store (a 415, a 429, a 503) never burns
 *  its signature: the identical retry is judged afresh, and a replay of an ACCEPTED call is still 401. */
function createCallerMemos() {
  const by = new Map();
  const stats = { replayOverflow: 0, idemOverflow: 0 };
  const of = (id) => { let m = by.get(id); if (!m) { m = { replay: new Map(), idem: new Map(), rate: { at: 0, n: 0 } }; by.set(id, m); } return m; };
  const cap = (rate) => Math.max(10, Math.min(RATE_MAX, Number(rate) > 0 ? Math.floor(Number(rate)) : RATE_DEFAULT) * 10);
  const prune = (map, t) => { for (const [k, v] of map) { if (t - (v.at || 0) < MEMO_WINDOW_MS && t >= (v.at || 0)) break; map.delete(k); } };
  function replay(callerId, sig, t, rate) {
    const m = of(callerId).replay;
    prune(m, t);
    if (m.has(sig)) return refuse('unauthorized', 'replay', { why: 'replayed' });
    if (m.size >= cap(rate)) { stats.replayOverflow++; return refuse('unauthorized', 'replay', { why: 'overflow' }); }
    return OK;
  }
  function idempotency(callerId, key, bodySha, t, rate) {
    const m = of(callerId).idem;
    prune(m, t);
    const k = String(key);
    const seen = m.get(k);
    if (seen) return seen.sha === bodySha ? { ok: true, repeat: true } : refuse('conflict', 'idempotency');
    if (m.size >= cap(rate)) { stats.idemOverflow++; return refuse('rate-limited', 'idempotency', { why: 'overflow' }); }
    return OK;
  }
  /** The ACCEPTED call's signature (an HMAC caller's) and idempotency key, recorded only now. */
  function commit(callerId, { sig = null, key = null, sha = '' } = {}, t = 0) {
    const m = of(callerId);
    if (sig) m.replay.set(String(sig), { at: t });
    if (key !== null && key !== undefined && !m.idem.has(String(key))) m.idem.set(String(key), { at: t, sha });
  }
  function rate(callerId, t, perMin) {
    const r = of(callerId).rate;
    const lim = Math.max(1, Math.min(RATE_MAX, Number(perMin) > 0 ? Math.floor(Number(perMin)) : RATE_DEFAULT));
    if (t - r.at >= 60000 || t < r.at) { r.at = t; r.n = 0; }
    if (++r.n <= lim) return OK;
    return refuse('rate-limited', 'rate', { retryAfter: Math.max(1, Math.ceil((r.at + 60000 - t) / 1000)) });
  }
  function forget(callerId) { by.delete(callerId); }
  return { replay, idempotency, commit, rate, forget, stats, sizes: (id) => { const m = by.get(id); return m ? { replay: m.replay.size, idem: m.idem.size } : { replay: 0, idem: 0 }; } };
}

/** THE CLIENT ADDRESS — the ONE the stranger gate counts AND a path's allow-list judges (verify r1 #10): the socket's, or —
 *  the `webhook.trustProxyHops` setting > 0 — the Nth X-Forwarded-For hop from the right (proxies the owner says are theirs:
 *  1 behind the Helm chart's ingress). Fewer hops than declared ⇒ the socket (a forged header cannot shorten the walk). */
function clientIp(remote, xff, hops = 0) {
  const n = Math.max(0, Math.min(5, Math.floor(Number(hops) || 0)));
  if (!n) return String(remote || '');
  const list = String(xff || '').split(',').map((x) => x.trim()).filter(Boolean);
  return list.length >= n ? list[list.length - n] : String(remote || '');
}

/** The receipt — `{ok, receiptId, path, reply: {mode, pollUrl?}}` and NOTHING else (no counter, no internal id, no word
 *  about a wake, a rule or an agent). `receiptId` = HMAC(callerToken, recordId)[:16] — opaque, per caller. */
function receiptOf({ receiptId, slug, mode, pollUrl = null }) {
  const m = ['none', 'reply-url', 'poll'].includes(mode) ? mode : 'none';
  return { ok: true, receiptId: String(receiptId || '').slice(0, 16), path: String(slug), reply: m === 'poll' && pollUrl ? { mode: m, pollUrl: String(pollUrl) } : { mode: m } };
}

/** THE STEP TABLE — `verdict(step, input, deps)`: the suite drives every step through this one door. */
const BY_STEP = Object.freeze({ method: methodVerdict, slug: slugVerdict, caller: callerVerdict, auth: authVerdict, length: lengthVerdict, read: readVerdict, signature: signatureVerdict, parse: parseVerdict, credential: credentialVerdict });
function verdict(step, input = {}, deps = {}) {
  const f = BY_STEP[step];
  if (!f) throw new Error(`webhook-auth: ${step} is a memo step (createIpGate / createCallerMemos) or no step`);
  return f(input, deps);
}

module.exports = {
  STEPS, SLUG_RE, RESERVED_SLUGS, slugProblem, BODY_MAX, SKEW_MS, MEMO_WINDOW_MS, IP_PER_MIN, IP_MAX, RATE_DEFAULT, RATE_MAX, CALLER_ID_RE, HEADERS, ANSWERS, PAIR_TOKEN_PREFIX, CREDENTIAL_PREFIXES,
  verdict, methodVerdict, slugVerdict, allowVerdict, callerVerdict, authVerdict, lengthVerdict, readVerdict, signatureVerdict, parseVerdict, credentialVerdict,
  signatureBase, eventIdOf, createIpGate, createCallerMemos, clientIp, receiptOf,
};

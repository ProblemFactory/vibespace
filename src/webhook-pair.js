'use strict';
/**
 * THE INSTANCE PAIRING — PURE (lane webhook-l3-cli-pair; docs/design-webhook.zh.md §12, fence 7 of §10). Two VibeSpace
 * instances become each other's `peer` caller; no token ever travels in a record.
 *
 *   ① A's owner mints a ONE-TIME CODE (CODE_TTL_MS = 10 min, single use): A's hook URL (instanceUrl + /hook/<slug>), the
 *      caller id A keeps for B, the token A issues to B, a nonce, the expiry, A's name — `vswp_` + base64url(JSON).
 *   ② B's owner pastes it on B: B judges it (decodeCode + hookUrlVerdict), mints the token it issues to A and POSTs the
 *      COMPLETION FRAME (B's hook URL, the caller id B keeps for A, that token, B's name, the nonce) to A's DEDICATED
 *      endpoint `/api/channels/webhook/<slug>/pair`, HMAC-signed with A's token — never to /hook/ (a frame carries a
 *      `vswh_` token, so /hook answers it with the same-shape 401 and records nothing).
 *   ③ A judges the frame (completionVerdict — BEFORE any write; `complete` holds that order), stores B as a `peer`
 *      caller (delivery reply-url = B's hook URL) and the code is spent. A code minted for an existing peer re-pairs:
 *      both rows rotate IN PLACE (same id, generation + 1) and the old tokens stop working.
 * A peer's payload is the canonical record JSON `{ text, threadKey, inReplyTo, attachments: [{name, url, sha256}],
 * from: { name } }` with `X-VibeSpace-Peer-Version: 1` — read without configuration (peerRecordValue; phase 1: the
 * attachment URLs are links in the text, the artifact hand-over is phase 2).
 */
const { SLUG_RE, HEADERS, signatureBase } = require('./webhook-auth.js');

const CODE_PREFIX = 'vswp_';
const CODE_TTL_MS = 10 * 60e3;
const CODE_MAX = 2048;
const FRAME_MAX = 4096;
const SKEW_S = 300;
const PENDING_MAX = 32;
const PEER_VERSION = '1';
const PEER_HEADER = 'x-vibespace-peer-version';
const TOKEN_RE = /^vswh_[0-9a-f]{48}$/;
const CALLER_RE = /^c-[0-9a-f]{8}$/;
const NONCE_RE = /^[0-9a-f]{32}$/;
/** The fixed mapping a peer's canonical payload is read with (no owner configuration). */
const PEER_MAPPING = Object.freeze({ textPath: 'text', senderKey: 'from.name', titleKey: null, facts: [] });

const no = (why, error, answer = 'bad-body') => ({ ok: false, why, error, answer });
const cleanName = (x, n = 80) => String(x == null ? '' : x).replace(/[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g, ' ').trim().slice(0, n);
const oneLine = (x) => (typeof x === 'string' && x.trim() ? cleanName(x, 200) : null);
const pairPathOf = (slug) => `/api/channels/webhook/${slug}/pair`;

/** A hook URL as a pairing may store it → `{ok, url, origin, slug, pairUrl}`: https (http only with allowPrivate), no
 *  credentials / query / fragment, ending in /hook/<slug> (a path prefix in front is kept). */
function hookUrlVerdict(raw, { allowPrivate = false } = {}) {
  let u; try { u = new URL(String(raw == null ? '' : raw)); } catch { return no('bad-url', 'the hook URL is not an absolute address'); }
  if (u.username || u.password || u.search || u.hash) return no('bad-url', 'a hook URL carries no credentials, query or fragment');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && allowPrivate === true)) return no('https-required', 'pairing needs an https hook URL (http only where webhook.allowPrivateReplyUrl is on)');
  const m = /^((?:\/[^/]+)*)\/hook\/([^/]+)$/.exec(u.pathname);
  if (!m || !SLUG_RE.test(m[2])) return no('bad-url', 'a hook URL ends in /hook/<path>');
  return { ok: true, url: `${u.origin}${u.pathname}`, origin: u.origin, slug: m[2], pairUrl: `${u.origin}${m[1]}${pairPathOf(m[2])}` };
}

/** THE CODE (shown ONCE to A's owner; pasted on B). */
function encodeCode({ hook, caller, token, nonce, exp, name }) {
  return CODE_PREFIX + Buffer.from(JSON.stringify({ v: 1, u: String(hook), c: caller, t: token, n: nonce, e: exp, m: cleanName(name) || 'VibeSpace' }), 'utf-8').toString('base64url');
}
/** B's read of a pasted code → `{ok, hook, caller, token, nonce, exp, name}` | a refusal by name (malformed / expired). */
function decodeCode(code, now) {
  const s = String(code == null ? '' : code).trim();
  const bad = no('bad-code', 'that is not a VibeSpace pairing code (it starts vswp_ — copy the whole code again)');
  if (!s.startsWith(CODE_PREFIX) || s.length > CODE_MAX) return bad;
  let o; try { o = JSON.parse(Buffer.from(s.slice(CODE_PREFIX.length), 'base64url').toString('utf-8')); } catch { return bad; }
  if (!o || o.v !== 1 || typeof o.u !== 'string' || !TOKEN_RE.test(String(o.t)) || !CALLER_RE.test(String(o.c)) || !NONCE_RE.test(String(o.n)) || !Number.isFinite(o.e)) return bad;
  if (!(Number(now) <= o.e)) return no('expired', 'that pairing code has expired (a code lives 10 minutes) — ask the other side for a new one');
  return { ok: true, hook: o.u, caller: o.c, token: o.t, nonce: o.n, exp: o.e, name: cleanName(o.m) || 'VibeSpace' };
}

/** THE COMPLETION FRAME B posts to A's pair endpoint, and its signature (A's token over ts.POST.<pair path>.body). */
function frameOf({ nonce, hookUrl, caller, token, name }) {
  return JSON.stringify({ v: 1, nonce, hook: hookUrl, caller, token, name: cleanName(name) || 'VibeSpace' });
}
function frameHeaders({ slug, callerId, token, body, now }, { hmacHex }) {
  const ts = String(Math.floor(Number(now) / 1000));
  return { 'Content-Type': 'application/json', [HEADERS.caller]: callerId, [HEADERS.ts]: ts, [HEADERS.sig]: `v1=${hmacHex(token, signatureBase(ts, pairPathOf(slug), body))}`, [PEER_HEADER]: PEER_VERSION };
}

/**
 * A's VERDICT on a completion frame — PURE, before anything is written. `pending` = the code A minted for (slug, the
 * frame's X-Webhook-Caller), or null. Every failure before the signature holds is the same-shape 401 (`unauthorized`);
 * a signed frame with a bad hook URL / token is a 400 by name. → `{ok:true, frame:{hookUrl, slug, caller, token, name}}`.
 */
function completionVerdict(input = {}, deps = {}) {
  const { slug = '', headers = {}, body = null, now = 0, pending = null, allowPrivate = false } = input;
  const unauth = (why) => ({ ok: false, why, answer: 'unauthorized' });
  const callerId = String(headers[HEADERS.caller] || '');
  if (!SLUG_RE.test(String(slug)) || !CALLER_RE.test(callerId)) return unauth('unknown');
  if (!pending || pending.slug !== slug || pending.callerId !== callerId) return unauth('unknown');
  if (pending.spent === true) return unauth('spent');
  if (!(Number(now) <= Number(pending.exp))) return unauth('expired');
  const ts = String(headers[HEADERS.ts] || ''), sig = String(headers[HEADERS.sig] || '');
  if (!/^[0-9]{1,12}$/.test(ts) || Math.abs(Number(now) / 1000 - Number(ts)) > SKEW_S) return unauth('stale');
  const text = Buffer.isBuffer(body) ? body.toString('utf-8') : String(body == null ? '' : body);
  if (!text || text.length > FRAME_MAX) return unauth('size');
  const want = `v1=${deps.hmacHex(pending.token, signatureBase(ts, pairPathOf(slug), text))}`;
  if (!deps.safeEqual(want, sig)) return unauth('signature');
  let f; try { f = JSON.parse(text); } catch { return unauth('parse'); }
  if (!f || typeof f !== 'object' || f.v !== 1 || f.nonce !== pending.nonce) return unauth('nonce');
  const hv = hookUrlVerdict(f.hook, { allowPrivate });
  if (!hv.ok) return hv;
  if (!TOKEN_RE.test(String(f.token)) || !CALLER_RE.test(String(f.caller))) return no('bad-frame', 'the completion frame names no caller id / token of the expected shape');
  return { ok: true, frame: { hookUrl: hv.url, slug: hv.slug, caller: f.caller, token: f.token, name: cleanName(f.name) || 'VibeSpace' } };
}
/** THE ORDER fence 7 names: the verdict, THEN the one write (`deps.write(frame)`) — a refused frame writes nothing. */
function complete(input, deps) {
  const v = completionVerdict(input, deps);
  if (!v.ok) return v;
  deps.write(v.frame);
  return v;
}

/** The codes A minted and nobody has spent yet — bounded, in memory (a restart voids them: mint a new one). */
function createPending({ max = PENDING_MAX, ttl = CODE_TTL_MS } = {}) {
  const m = new Map();
  const k = (slug, id) => `${slug}\n${id}`;
  const prune = (t) => { for (const [key, e] of m) if (!(t <= e.exp)) m.delete(key); };
  return {
    put(e, t) {
      prune(t);
      m.delete(k(e.slug, e.callerId));
      while (m.size >= max) m.delete(m.keys().next().value);
      const row = { slug: e.slug, callerId: e.callerId, token: e.token, nonce: e.nonce, name: e.name || null, repair: e.repair === true, exp: t + ttl, spent: false };
      m.set(k(e.slug, e.callerId), row);
      return row;
    },
    get(slug, id, t) { prune(t); return m.get(k(slug, id)) || null; },
    spend(slug, id) { m.delete(k(slug, id)); },
    size() { return m.size; },
    clear() { m.clear(); },
  };
}

/** THE CANONICAL PEER PAYLOAD → what the record reader maps (PEER_MAPPING): the text with each attachment as a LINK
 *  line (phase 1), `from.name` (a fact only — the record's author stays the registered caller), threadKey, inReplyTo. */
function peerRecordValue(value) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const linkOf = (u) => { try { const x = new URL(String(u)); return (x.protocol === 'https:' || x.protocol === 'http:') && !x.username && !x.password ? x.href.slice(0, 2000) : null; } catch { return null; } };
  const atts = (Array.isArray(v.attachments) ? v.attachments : []).slice(0, 20)
    .map((a) => (a && typeof a === 'object' ? { name: cleanName(a.name) || 'attachment', url: linkOf(a.url) } : null)).filter((a) => a && a.url);
  const text = [typeof v.text === 'string' ? v.text : '', ...atts.map((a) => `${a.name}: ${a.url}`)].filter(Boolean).join('\n');
  return { text, from: { name: cleanName(v.from && v.from.name) || null }, threadKey: oneLine(v.threadKey), inReplyTo: oneLine(v.inReplyTo) };
}
/** What this side POSTs to a peer's hook (the same canonical shape; no attachments in phase 1). */
function peerBody({ text, threadKey = null, inReplyTo = null, name }) {
  return JSON.stringify({ text: String(text == null ? '' : text), threadKey: threadKey || null, inReplyTo: inReplyTo || null, attachments: [], from: { name: cleanName(name) || 'VibeSpace' } });
}

module.exports = {
  CODE_PREFIX, CODE_TTL_MS, FRAME_MAX, SKEW_S, PENDING_MAX, PEER_VERSION, PEER_HEADER, PEER_MAPPING, TOKEN_RE, CALLER_RE, NONCE_RE,
  hookUrlVerdict, encodeCode, decodeCode, frameOf, frameHeaders, pairPathOf, completionVerdict, complete, createPending, peerRecordValue, peerBody,
};

'use strict';
// AGENT FEEDBACK — THE FORWARD (lane feedback-forward, the owner 2026-10-20: 「这个功能本来就是给你用的，你自己开发个处理流程」).
// `vibespace-feedback` files into THIS instance's data/feedback.json; the maintainer reads ONE inbox on the maintainer hub.
// An instance with a telemetry forward target (telemetry.forwardUrl / forwardToken, else VIBESPACE_TELEMETRY_FORWARD_URL /
// _TOKEN — the fleet pods carry the env) forwards every NEW report to the target's POST /api/feedback/forward; the hub
// keeps it beside its own with `origin`; the maintainer's mark comes back as a PULL (the origin has no inbound door from
// the hub): the origin asks GET /api/feedback/forward/marks?since= at boot and every 6 h. The I/O is
// src/server/feedback-forward.js (the origin's outbox + pull) and src/routes/feedback.js (the hub's two doors); this file
// is the rules both sides share:
//   · forwardDoors(url)          → { forward, marks } off the telemetry forward URL (…/api/telemetry/ingest ⇒ the same hub)
//   · wireBody(row, origin)      → what rides the forward: the public row (no reporter list) + `origin {instance, id, version}`
//   · validateForward(body)      → the RECEIVER's judgment of a forwarded body — the agent's three fields through the same
//                                  validate as a local report, the facts as the store keeps them, the origin's id shape
//   · outboxPush(queue, item)    → the bounded outbox (≤ LIMITS.outboxMax unsent; the OLDEST goes, counted)
//   · backoffMs(fails)           → the outbox's hold after consecutive failed passes: 1 min, 2, 4 … 1 h
//   · sendVerdict(status)        → sent | drop (the hub refused THIS record for good) | retry
//   · admit(list, record)        → the hub's bound per origin (LIMITS.perOrigin) and the ring (the model's)
//   · marksAnswer(records, key, since) → the marks ONE origin may read (its own forwarded records), paged by `markedAt`
//   · markOf(record) / applyMark(record, mark) → the mark the hub answers / the origin's record with it applied
// The origin is known by its KEY (an origin key minted on the origin, sent as a header; the hub keeps its hash only): the
// fleet shares ONE forward token (deploy/helm values: «ONE shared token»), so the token cannot name an instance — the key
// does, and a hub answers an origin only the marks of the records forwarded with its key. PURE: imports only the model.
const M = require('./feedback-model.js');

const LIMITS = Object.freeze({
  outboxMax: 200,               // unsent reports an instance holds (data/feedback-outbox.json); past it the OLDEST goes, counted
  backoffMinMs: 60e3,           // a failed pass holds the outbox 1 min, then 2, 4, 8 … (consecutive failures; an answer resets)
  backoffMaxMs: 3600e3,         // … never more than 1 h between two passes
  sendTimeoutMs: 10e3,          // one forward / one marks page
  marksEveryMs: 6 * 3600e3,     // the mark-back pull: every 6 h …
  marksBootMs: 60e3,            // … and 1 min after the boot
  marksPage: 200,               // marks per answer (the origin asks again while `more`) …
  marksPages: 10,               // … at most 10 pages per pull
  perOrigin: 200,               // forwarded reports the hub keeps per origin (past it THAT origin's least recently reported goes)
  bodyMax: 64 * 1024,           // the forward door's body, read only after the token is judged
});
/** an origin key: `fk_` + 32 random bytes base64url — minted once on the origin (data/feedback-outbox.json) */
const KEY_RE = /^fk_[A-Za-z0-9_-]{43}$/;
/** the hub's name for an origin: the key's sha256, 16 hex digits (the key itself is never stored on the hub) */
const KEY_ID_RE = /^[0-9a-f]{16}$/;
/** a report id as a store mints it */
const ID_RE = /^fb-[0-9a-f]{10}$/;
const INGEST_TAIL = '/api/telemetry/ingest';

/** the hub's two doors off the telemetry forward URL — the collector's ingest path names the hub (a prefix before it is
 *  kept: a hub behind /vs/…); any other path ⇒ the URL's own origin. Not http(s) / not a URL ⇒ null (nothing forwards) */
function forwardDoors(url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const p = u.pathname.replace(/\/+$/, '');
  const base = u.origin + (p.endsWith(INGEST_TAIL) ? p.slice(0, -INGEST_TAIL.length) : '');
  return { forward: base + '/api/feedback/forward', marks: base + '/api/feedback/forward/marks' };
}

/** what rides the forward: the public row (never the reporter list) + who the origin is */
function wireBody(row, origin) {
  const r = row || {};
  return {
    text: r.text, about: r.about || '', kind: r.kind || 'other', at: r.at, count: Number(r.count) || 1,
    session: { id: (r.session && r.session.id) || null, name: (r.session && r.session.name) || null },
    group: r.group ? { id: r.group.id || null, name: r.group.name || null } : null,
    harness: r.harness || null,
    origin: { instance: (origin && origin.instance) || null, id: r.id, version: (origin && origin.version) || null },
  };
}

const lineOf = (s, n) => { const v = M.cleanLine(s); return v ? Array.from(v).slice(0, n).join('') : null; };
/** the RECEIVER's judgment of a forwarded body → { ok, value: {text, about, kind, at, count, facts, origin} } | a refusal */
function validateForward(body, now) {
  const b = body && typeof body === 'object' ? body : {};
  const v = M.validate({ text: b.text, about: b.about, kind: b.kind });
  if (!v.ok) return v;
  const o = b.origin && typeof b.origin === 'object' ? b.origin : {};
  if (typeof o.id !== 'string' || !ID_RE.test(o.id)) return { ok: false, code: 'origin_id_bad', error: 'origin.id is the report id the origin minted (fb- and 10 hex digits)' };
  const instance = lineOf(o.instance, M.LIMITS.name);
  if (!instance) return { ok: false, code: 'origin_instance_missing', error: 'origin.instance names the instance the report was filed on' };
  const v0 = o.version == null ? '' : String(o.version).trim();
  const version = M.RELEASE_RE.test(v0) ? v0 : null;   // a build that names no release (a dev checkout) forwards all the same
  const at = Number(b.at);
  const s = b.session && typeof b.session === 'object' ? b.session : {};
  const g = b.group && typeof b.group === 'object' ? b.group : null;
  return {
    ok: true,
    value: {
      ...v.value,
      at: Number.isFinite(at) && at > 0 && at <= now ? at : now,   // a report from the future is filed now
      count: Math.max(1, Math.min(1e6, Math.floor(Number(b.count)) || 1)),
      facts: { session: { id: s.id, name: s.name }, group: g && g.id ? { id: g.id, name: g.name } : null, harness: b.harness, instance: { name: instance, version } },
      origin: { instance, id: o.id, version },
    },
  };
}

/** the bounded outbox: an item already queued (same report id) is kept as it is; past outboxMax the OLDEST unsent goes */
function outboxPush(queue, item) {
  const Q = Array.isArray(queue) ? queue.slice() : [];
  if (Q.some((x) => x && x.id === item.id)) return { queue: Q, dropped: 0 };
  Q.push(item);
  let dropped = 0;
  while (Q.length > LIMITS.outboxMax) { Q.shift(); dropped++; }
  return { queue: Q, dropped };
}

/** the hold after the `fails`-th consecutive failed pass: 1 min doubling, capped at 1 h */
function backoffMs(fails) {
  const n = Math.max(1, Math.floor(Number(fails)) || 1);
  return Math.min(LIMITS.backoffMaxMs, LIMITS.backoffMinMs * 2 ** Math.min(n - 1, 20));
}

/** an answer's status → 'sent' | 'drop' (400 / 413 / 422: the hub judged THIS report and refused it — a retry is the same
 *  answer) | 'retry' (no answer, 403 a token being fixed, 404 a hub before this door or its collector off, 429, 5xx) */
function sendVerdict(status) {
  const s = Number(status) || 0;
  if (s >= 200 && s < 300) return 'sent';
  if (s === 400 || s === 413 || s === 422) return 'drop';
  return 'retry';
}

const lastOf = (r) => Number(r && (r.lastAt || r.at)) || 0;
/** the hub admits a forwarded record: past LIMITS.perOrigin reports from its origin THAT origin's least recently reported
 *  goes, then the ring (M.LIMITS.ring) as the model drops — a forwarded report never folds into another (its mark goes
 *  back by its own id). → { list, dropped: [ids] } */
function admit(list, record) {
  const L = Array.isArray(list) ? list.slice() : [];
  L.push(record);
  const dropped = [];
  const key = record.origin && record.origin.key;
  const mine = () => L.filter((r) => r.origin && r.origin.key === key);
  for (let m = mine(); key && m.length > LIMITS.perOrigin; m = mine()) {
    const old = m.reduce((a, b) => (lastOf(b) < lastOf(a) ? b : a));
    dropped.push(old.id); L.splice(L.indexOf(old), 1);
  }
  while (L.length > M.LIMITS.ring) {
    let k = 0;
    for (let j = 1; j < L.length; j++) if (lastOf(L[j]) < lastOf(L[k])) k = j;
    dropped.push(L[k].id); L.splice(k, 1);
  }
  return { list: L, dropped };
}

/** the mark the hub answers for one forwarded record (the origin's id, never the hub's) */
function markOf(r) {
  return { id: r.origin.id, status: r.status === 'handled' ? 'handled' : 'open', version: r.handledVersion || null, note: r.handledNote || null, by: r.handledBy || null, at: Number(r.markedAt) || 0 };
}
/** the marks ONE origin may read: its own forwarded records marked after `since`, oldest mark first, a page at a time */
function marksAnswer(records, keyId, since) {
  const s = Number(since) || 0;
  const hits = (records || []).filter((r) => r && r.origin && r.origin.key === keyId && Number(r.markedAt) > s)
    .sort((a, b) => a.markedAt - b.markedAt);
  const page = hits.slice(0, LIMITS.marksPage).map(markOf);
  return { marks: page, next: page.length ? page[page.length - 1].at : s, more: hits.length > page.length };
}

/** the origin applies one mark to its own record → { ok, record, changed } | a refusal by name (the model's) */
function applyMark(record, mark, now) {
  const m = mark && typeof mark === 'object' ? mark : {};
  const status = m.status === 'handled' ? 'handled' : 'open';
  const same = record.status === status && (status === 'open' || ((record.handledVersion || null) === (m.version || null) && (record.handledNote || null) === (m.note || null)));
  if (same) return { ok: true, record, changed: false };
  const s = M.setStatus(record, status, { by: m.by || 'the maintainers', now, version: m.version, note: m.note });
  return s.ok ? { ok: true, record: s.record, changed: true } : s;
}

module.exports = { LIMITS, KEY_RE, KEY_ID_RE, ID_RE, forwardDoors, wireBody, validateForward, outboxPush, backoffMs, sendVerdict, admit, markOf, marksAnswer, applyMark };

'use strict';
/**
 * A WEBHOOK CALL AS A CHANNEL RECORD — PURE (imports only src/channel-record.js; lane webhook-l1-server,
 * docs/design-webhook.zh.md §5). The path's declared MAPPING is evaluated on the whole parsed body (≤ 256 KB) at ingest:
 *
 *   · `textPath`  → the record's text (a string, a number, a boolean); no hit ⇒ the body as a pretty-printed JSON block
 *   · `senderKey` → the `sender` fact (a party: the value is a WORD the caller wrote — the author never moves)
 *   · `titleKey`  → the `subject` fact; the `X-Event` header → the `event` fact
 *   · `facts[]`   → `{key, path}` rows → ONE `fields` fact (a party per row: id = the declared key, name = the value)
 *
 * A path is dot-separated keys / array indexes: depth ≤ 16, length ≤ 256, no wildcard, no filter, no script — judged when
 * the path is DECLARED (`validateMapping`) and again here. Every peer string goes through channel-record's belt
 * (`makeRecord`: the text's frames inerted, the facts through the name door). The author is ALWAYS the registered caller
 * (`caller:<id>`, its registered name, isBot, external) — a payload can name a sender, never become one. `raw` keeps the
 * first 8 KiB of the body and says when it was cut. The record id is the repo's `${adapterId}:${convId}:${vendorId}`.
 */
const R = require('./channel-record.js');

const PATH_MAX = 256;
const DEPTH_MAX = 16;
const FACT_KEYS_MAX = 16;
const FACT_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const SEGMENT_RE = /^(?:[A-Za-z0-9_$@-]{1,64}|\d{1,6})$/;
const RAW_KEEP = R.MAX_RAW_BYTES - 512;   // the cut body + its two notes stay under channel-record's raw bound

/** `{ok:true, segments}` | `{ok:false, error}` — one declared path. */
function pathVerdict(p) {
  if (p === undefined || p === null || p === '') return { ok: true, segments: null };
  const s = String(p);
  if (s.length > PATH_MAX) return { ok: false, error: `a path is at most ${PATH_MAX} characters` };
  const segs = s.split('.');
  if (segs.length > DEPTH_MAX) return { ok: false, error: `a path is at most ${DEPTH_MAX} keys deep` };
  if (!segs.every((x) => SEGMENT_RE.test(x)) || segs.some((x) => x === '__proto__' || x === 'constructor' || x === 'prototype')) return { ok: false, error: `${JSON.stringify(s.slice(0, 80))} is not a plain key path (keys and indexes joined by dots — no wildcard, filter or script)` };
  return { ok: true, segments: segs };
}
/** The path's MAPPING options, judged once at declare time → `{ok:true, mapping}` | `{ok:false, error, field}`. */
function validateMapping(o = {}) {
  const m = o && typeof o === 'object' ? o : {};
  const out = {};
  for (const k of ['textPath', 'senderKey', 'titleKey']) {
    const v = pathVerdict(m[k]);
    if (!v.ok) return { ok: false, field: k, error: `${k}: ${v.error}` };
    out[k] = v.segments ? String(m[k]) : null;
  }
  const facts = Array.isArray(m.facts) ? m.facts : [];
  if (facts.length > FACT_KEYS_MAX) return { ok: false, field: 'facts', error: `at most ${FACT_KEYS_MAX} declared facts` };
  const seen = new Set();
  out.facts = [];
  for (const f of facts) {
    const key = f && typeof f.key === 'string' ? f.key : '';
    if (!FACT_KEY_RE.test(key) || seen.has(key)) return { ok: false, field: 'facts', error: `fact key ${JSON.stringify(key.slice(0, 40))} must be a short word (letters, digits, - _), once` };
    const v = pathVerdict(f.path);
    if (!v.ok || !v.segments) return { ok: false, field: 'facts', error: `fact ${key}: ${v.ok ? 'a path is required' : v.error}` };
    seen.add(key);
    out.facts.push({ key, path: String(f.path) });
  }
  return { ok: true, mapping: out };
}
/** The value at a judged path, or undefined (an own property only — never the prototype chain). */
function at(value, path) {
  const v = pathVerdict(path);
  if (!v.ok || !v.segments) return undefined;
  let cur = value;
  for (const k of v.segments) {
    if (cur === null || typeof cur !== 'object') return undefined;
    if (Array.isArray(cur) ? !/^\d+$/.test(k) : !Object.prototype.hasOwnProperty.call(cur, k)) return undefined;
    cur = cur[k];
  }
  return cur;
}
const scalar = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'boolean' ? String(v) : null);
const oneLine = (v) => { const s = scalar(v); return s === null ? null : s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 200) || null; };

/** The first 8 KiB of the body as `raw` — `{callText, bytes, cut?}` (`cut: true` = the card says "raw cut at 8 KiB"). */
function rawOf(text) {
  const s = String(text == null ? '' : text);
  const bytes = Buffer.byteLength(s, 'utf-8');
  let keep = s;
  while (JSON.stringify(keep).length > RAW_KEEP) keep = keep.slice(0, Math.max(0, Math.floor(keep.length * 0.8)));
  return keep.length < s.length ? { callText: keep, bytes, cut: true } : { callText: keep, bytes };
}

/**
 * THE RECORD. `input`: `{adapterId, slug, caller: {id, name}, value (the parsed body), bodyText, eventId, at, replyTo?,
 * threadKey?, event?, mapping}` → a channel-record (makeRecord's — every bound and the belt applied there).
 */
function toRecord(input = {}) {
  const i = input && typeof input === 'object' ? input : {};
  const mp = validateMapping(i.mapping || {});
  const mapping = mp.ok ? mp.mapping : { textPath: null, senderKey: null, titleKey: null, facts: [] };
  const value = i.value;
  const hit = mapping.textPath ? scalar(at(value, mapping.textPath)) : null;
  let text = hit;
  if (text === null) {
    let pretty;
    try { pretty = JSON.stringify(value, null, 2); } catch { pretty = String(i.bodyText || ''); }
    text = '```json\n' + String(pretty === undefined ? '' : pretty).slice(0, R.MAX_TEXT - 16) + '\n```';
  }
  const facts = [];
  const sender = mapping.senderKey ? oneLine(at(value, mapping.senderKey)) : null;
  if (sender) facts.push({ k: 'sender', v: { id: sender, name: sender } });
  const subject = mapping.titleKey ? oneLine(at(value, mapping.titleKey)) : null;
  if (subject) facts.push({ k: 'subject', v: subject });
  const event = oneLine(i.event);
  if (event) facts.push({ k: 'event', v: event });
  const fields = mapping.facts.map((f) => ({ id: f.key, name: oneLine(at(value, f.path)) })).filter((x) => x.name);
  if (fields.length) facts.push({ k: 'fields', v: fields });
  const c = i.caller && typeof i.caller === 'object' ? i.caller : {};
  return R.makeRecord({
    adapterId: i.adapterId, convId: i.slug, vendorId: i.eventId, at: i.at,
    author: { id: `caller:${c.id}`, name: c.name || c.id, isBot: true, external: true },
    text, mentions: [], attachments: [],
    replyTo: i.replyTo ? String(i.replyTo).slice(0, 200) : null,
    threadKey: i.threadKey ? String(i.threadKey).slice(0, 200) : null,
    raw: rawOf(i.bodyText),
    facts,
  }, { resolveMentions: false });
}

/** The caller id a record's author names (`caller:<id>`), or null — the reply door's one reader. */
function callerOfRecord(rec) {
  const id = rec && rec.author && typeof rec.author.id === 'string' ? rec.author.id : '';
  return /^caller:c-[0-9a-f]{8}$/.test(id) ? id.slice(7) : null;
}

module.exports = { PATH_MAX, DEPTH_MAX, FACT_KEYS_MAX, FACT_KEY_RE, pathVerdict, validateMapping, at, rawOf, toRecord, callerOfRecord };

'use strict';
/**
 * WHAT VIBESPACE ITSELF SENT INTO A CONVERSATION — the PURE half (B-9a2e + B-3d90 item 2, the coordinator's ruling
 * 2026-11-18 «BUILD IT SO»). Imports nothing: the normalizers (message-manager userRecordOf, codex-message-manager
 * userItemOf — both ride the device agent's bundle), the hub's store (src/server/sent-record.js) and the two worker
 * roads (the search backfill, the huge-session scan) share every rule here.
 *
 * A transcript cannot say who typed a user record: claude strips every mark VibeSpace puts on a frame, and a codex rollout
 * carries none. So VibeSpace keeps its OWN act, written when it acted: per conversation, rows {at, n, h, k} — the send's
 * instant, the folded text's length and digest, the kind — NEVER the words.
 *
 * THE MATCH (the ruling's bound 1 — no match is today's answer): a record is stamped only when a row's digest AND length
 * equal the record's folded text and the record's instant lies inside the window after that send (WINDOW_MS, a SKEW_MS
 * before it for clocks). Never a text shape, never a nearest match. Two equal texts inside the window (bound 5): the NEWER
 * send at or before the record wins — its kind is the answer (a send inside the skew after it counts only when none came before).
 */
const KINDS = Object.freeze(['typed', 'auto-resume', 'dispatch', 'peer', 'notice']);   // notice: VibeSpace's own notification frame on the rpc road (the batch's readers)
const WINDOW_MS = 60 * 60 * 1000;   // a send the CLI takes later (queued behind a running turn) is still its own within an hour
const SKEW_MS = 5000;               // the transcript's clock may run a little ahead of the hub's

const fold = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
/** PURE 64-bit FNV-1a over the folded text's UTF-16 units (two 32-bit halves) — the digest a row keeps. */
function digestOf(text) {
  const f = fold(text);
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ f.length;
  for (let i = 0; i < f.length; i++) {
    const c = f.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
/** A send as the store keeps it — never the words. */
function rowOf(text, kind, at) {
  if (!KINDS.includes(kind)) return null;
  const f = fold(text);
  if (!f) return null;
  return { at: Number(at) || 0, n: f.length, h: digestOf(f), k: kind };
}
/** THE MATCH: the kind of the newest row equal to `text` whose window holds `at`; null = no match (today's answer). */
function matchKind(rows, { at, text } = {}) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const t = Number(at);
  if (!Number.isFinite(t) || t <= 0) return null;
  const f = fold(text);
  if (!f) return null;
  let h = null, before = null, after = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.n !== f.length || !(t >= r.at - SKEW_MS && t <= r.at + WINDOW_MS)) continue;
    if (h === null) h = digestOf(f);
    if (r.h !== h) continue;
    if (r.at <= t) { if (!before || r.at >= before.at) before = r; }   // the newest send at or before the record (a later row of the same instant wins)
    else if (!after || r.at < after.at) after = r;                     // only a send inside the skew AFTER it, the nearest — when none came before
  }
  const best = before || after;
  return best ? best.k : null;
}

// THE SOURCE: the hub installs its store's reader (conversation id → rows); a worker scopes the rows it was HANDED for the
// one conversation it reads (bound 4 — no worker opens the store). Scoped rows win over the source.
let source = null, scoped = null;
const setSource = (fn) => { source = typeof fn === 'function' ? fn : null; };
// THE HANDED ROWS (B-9a2e part 1 — a stopped conversation read ON ITS PAIRED MACHINE): the device has no record of its own. The hub
// hands each transcript op {id: rows} — the rows of every id the read may consult that the hub can name, built by ONE helper
// (sentFor, below; src/transcript-service.js tryDevice sends it to an agent naming 'sent-rows') — and the device keeps them HERE for
// THAT OP ALONE (hand → release, src/agentd/agentd.js): ops run concurrently, so each id's rows are counted by the ops holding them
// and dropped when the last one ends — a later op never reads rows an earlier one was handed. Checked row by row, bounded.
const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;   // a conversation id (the hub's store keys by the same shape)
const HAND_IDS_MAX = 16, HAND_ROWS_MAX = 100;
const okRow = (r) => !!r && Number.isFinite(r.at) && Number.isInteger(r.n) && r.n > 0 && typeof r.h === 'string' && /^[0-9a-f]{16}$/.test(r.h) && KINDS.includes(r.k);
const handed = new Map();   // id → { rows, refs } — refs = the ops holding it
/** An op's `params.sent` ({id: rows}) kept for that op's reads on this side → release() (call once the op ended; a second call does nothing). */
function hand(sent) {
  const ids = [];
  if (sent && typeof sent === 'object' && !Array.isArray(sent)) {
    for (const [id, rows] of Object.entries(sent)) {
      if (ids.length >= HAND_IDS_MAX) break;
      if (!ID_RE.test(id) || !Array.isArray(rows)) continue;
      const ok = rows.filter(okRow).slice(-HAND_ROWS_MAX).map((r) => ({ at: r.at, n: r.n, h: r.h, k: r.k }));
      if (!ok.length) continue;
      const e = handed.get(id);
      if (e) { e.rows = ok; e.refs++; } else handed.set(id, { rows: ok, refs: 1 });   // the newest hand's rows (the hub's newest)
      ids.push(id);
    }
  }
  let done = false;
  return () => { if (done) return; done = true; for (const id of ids) { const e = handed.get(id); if (e && --e.refs <= 0) handed.delete(id); } };
}
const handedOf = (conv) => { const e = typeof conv === 'string' ? handed.get(conv) : null; if (e) return e.rows; noteUnhanded(conv); return null; };
// THE IDS READ WITH NOTHING HANDED (the device's side of the parity): a read may consult an id the hub could not name (a fork made
// outside VibeSpace, or before the links were kept). The device notes each such id; an op's answer names those noted since it began
// (unhandedSince(mark)) and the hub hands the ones it holds rows for in ONE more ask (src/transcript-service.js tryDevice). An op
// running beside it may add an id of its own — the hub then hands rows its read never consults: never a different answer.
const UNHANDED_MAX = 256;
const unhanded = new Map();   // id → the note's sequence number (the newest last)
let unhandedSeq = 0;
function noteUnhanded(conv) {
  if (typeof conv !== 'string' || !ID_RE.test(conv)) return;
  unhanded.delete(conv); unhanded.set(conv, ++unhandedSeq);
  while (unhanded.size > UNHANDED_MAX) unhanded.delete(unhanded.keys().next().value);
}
/** The mark an op takes when it begins → unhandedSince(mark): the ids read with nothing handed since (≤ HAND_IDS_MAX, the newest). */
const unhandedMark = () => unhandedSeq;
const unhandedSince = (mark) => [...unhanded].filter(([, n]) => n > mark).map(([id]) => id).slice(-HAND_IDS_MAX);
function rowsFor(conv) {
  if (scoped) return scoped;
  if (typeof conv !== 'string' || !conv) return null;
  if (!source) return handedOf(conv);   // a device: what the hub handed for this conversation
  try { return source(conv); } catch { return null; }
}
/** The kind VibeSpace recorded for this record (`conv` its conversation, `at` its instant, `text` its words), or null. */
const kindFor = ({ conv, at, text } = {}) => matchKind(rowsFor(conv), { at, text });
/** The source's rows for a conversation (the hub thread; on a device the rows the hub handed for it) — never the scoped rows. */
const rowsOf = (conv) => { if (typeof conv !== 'string' || !conv) return null; if (!source) return handedOf(conv); try { return source(conv); } catch { return null; } };
// THE LINKS (the hub's store installs them — B-9a2e part 2): a conversation id → the ids it was adopted from (the resume / fork
// that minted it, as the session recorded it). A read may consult those ids too (a codex fork's read prepends its parent's records,
// each read under its own file's id; a claude record is read under the session id it carries), so the helper names them.
let links = null;
const setLinks = (fn) => { links = typeof fn === 'function' ? fn : null; };
/** The ids a read of `conv` may consult that the hub can name: the conversation, `from` (a live session's own chain), then the ids
 *  each of them was adopted from (the links, oldest parents too) — breadth first, each once, ≤ HAND_IDS_MAX. */
function idsFor(conv, from = []) {
  const out = [];
  const add = (id) => { if (out.length < HAND_IDS_MAX && typeof id === 'string' && ID_RE.test(id) && !out.includes(id)) out.push(id); };
  add(conv);
  if (!out.length) return out;
  for (const id of Array.isArray(from) ? from : []) add(id);
  for (let i = 0; links && i < out.length; i++) { let l = null; try { l = links(out[i]); } catch { l = null; } if (Array.isArray(l)) for (const id of l) add(id); }
  return out;
}
/** THE ONE HELPER (the hub side, B-9a2e part 1): what a device transcript op's params carry — {id: rows}, the source's newest
 *  HAND_ROWS_MAX rows of each id idsFor names; an id with no rows is left out ({} when none: the device then holds nothing). */
function sentFor(conv, from = []) {
  const out = {};
  for (const id of idsFor(conv, from)) { const rows = rowsOf(id); if (Array.isArray(rows) && rows.length) out[id] = rows.slice(-HAND_ROWS_MAX); }
  return out;
}
/** Run `fn` with `rows` as the ONLY rows (a worker's one conversation); restored after, sync or async. */
function withRows(rows, fn) {
  const prev = scoped;
  scoped = Array.isArray(rows) ? rows : null;
  let r;
  try { r = fn(); } catch (e) { scoped = prev; throw e; }
  if (r && typeof r.then === 'function') return r.finally(() => { scoped = prev; });
  scoped = prev;
  return r;
}
/** The rows' signature (a scan's cache key): what changes when a row is added or leaves. */
const sigOf = (rows) => (Array.isArray(rows) && rows.length ? `${rows.length}:${rows[rows.length - 1].at}:${rows[0].at}` : '');

module.exports = { KINDS, WINDOW_MS, SKEW_MS, ID_RE, HAND_IDS_MAX, HAND_ROWS_MAX, fold, digestOf, rowOf, okRow, matchKind, setSource, setLinks, rowsOf, kindFor, withRows, sigOf, hand, idsFor, sentFor, unhandedMark, unhandedSince };

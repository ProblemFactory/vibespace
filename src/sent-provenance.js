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
const KINDS = Object.freeze(['typed', 'auto-resume', 'dispatch', 'peer']);
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
function rowsFor(conv) {
  if (scoped) return scoped;
  if (!source || typeof conv !== 'string' || !conv) return null;
  try { return source(conv); } catch { return null; }
}
/** The kind VibeSpace recorded for this record (`conv` its conversation, `at` its instant, `text` its words), or null. */
const kindFor = ({ conv, at, text } = {}) => matchKind(rowsFor(conv), { at, text });
/** The source's rows for a conversation (the hub thread; null on a device or before install) — never the scoped rows. */
const rowsOf = (conv) => { if (!source || typeof conv !== 'string' || !conv) return null; try { return source(conv); } catch { return null; } };
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

module.exports = { KINDS, WINDOW_MS, SKEW_MS, fold, digestOf, rowOf, matchKind, setSource, rowsOf, kindFor, withRows, sigOf };

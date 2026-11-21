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
// (sentFor, below; src/transcript-service.js tryDevice sends it to an agent naming 'sent-rows') — and the device keeps them in THAT
// OP'S OWN TABLE (holdFor; round ww0zvz7tw's third small): the agent runs the op inside an async scope whose getter it installs here
// (setScope, src/agentd/agentd.js), so two ops at once — two hubs handing one id — never read each other's rows, and a table dies
// with its op. An id the read consulted with nothing handed (a fork the hub could not name) is noted in that op's table (`unhanded`):
// the op's ack names them and the hub may hand them in ONE more ask. Checked row by row, bounded.
const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;   // a conversation id (the hub's store keys by the same shape)
const HAND_IDS_MAX = 16, HAND_ROWS_MAX = 100;
const okRow = (r) => !!r && Number.isFinite(r.at) && Number.isInteger(r.n) && r.n > 0 && typeof r.h === 'string' && /^[0-9a-f]{16}$/.test(r.h) && KINDS.includes(r.k);
let scopeOf = null;
/** THE DEVICE: the getter of the running op's table (holdFor's) — an AsyncLocalStorage's getStore. */
const setScope = (fn) => { scopeOf = typeof fn === 'function' ? fn : null; };
/** An op's `params.sent` ({id: rows}) as THAT op's own table → { rows: Map id → rows, unhanded: Set of ids read with nothing handed }. */
function holdFor(sent) {
  const rows = new Map(), unhanded = new Set();
  if (sent && typeof sent === 'object' && !Array.isArray(sent)) {
    for (const [id, list] of Object.entries(sent)) {
      if (rows.size >= HAND_IDS_MAX) break;
      if (!ID_RE.test(id) || !Array.isArray(list)) continue;
      const ok = list.filter(okRow).slice(-HAND_ROWS_MAX).map((r) => ({ at: r.at, n: r.n, h: r.h, k: r.k }));
      if (ok.length) rows.set(id, ok);
    }
  }
  return { rows, unhanded };
}
/** The running op's rows for `conv` (null outside an op, or none handed — then the id is noted in the op's table). */
function handedOf(conv) {
  let t = null;
  try { t = scopeOf ? scopeOf() : null; } catch { t = null; }
  if (!t || !(t.rows instanceof Map) || !(t.unhanded instanceof Set) || typeof conv !== 'string') return null;
  const r = t.rows.get(conv);
  if (r) return r;
  if (ID_RE.test(conv) && t.unhanded.size < HAND_IDS_MAX) t.unhanded.add(conv);
  return null;
}
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
// THE ONE MORE ASK's GATE (the hub side, round ww0zvz7tw's first small): an id the agent names as read with nothing handed is handed
// only if the hub links it to THIS conversation (idsFor), or never noted it for a conversation of ANOTHER machine (the hub's store
// installs where each conversation's sends were noted — setPlaces: '' = this hub, a machine id, undefined = never noted) — an agent's
// mistake (a bad parse of a parent id) never fetches another machine's conversation's rows.
let places = null;
const setPlaces = (fn) => { places = typeof fn === 'function' ? fn : null; };
function mayHandMore(id, conv, host) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return false;
  if (idsFor(conv).includes(id)) return true;
  let p;
  try { p = places ? places(id) : undefined; } catch { p = undefined; }
  return p === undefined || p === null || p === String(host || '');
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

module.exports = { KINDS, WINDOW_MS, SKEW_MS, ID_RE, HAND_IDS_MAX, HAND_ROWS_MAX, fold, digestOf, rowOf, okRow, matchKind, setSource, setLinks, setPlaces, setScope, rowsOf, kindFor, withRows, sigOf, holdFor, idsFor, sentFor, mayHandMore };

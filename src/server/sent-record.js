'use strict';
/**
 * WHAT VIBESPACE ITSELF SENT — the hub's store (B-9a2e + B-3d90 item 2; the PURE rules: src/sent-provenance.js).
 *
 * `data/sent-record.json` = {v: 1, byConv: {<conversation id>: [row…]}, from?: {<conversation id>: [the ids it was adopted
 * from]}}, a row = {at, n, h, k} (the send's instant, the folded text's length and digest, the kind) — NEVER the words.
 * Written at each harness's ONE send door: the typed door
 * (src/server/user-input.js — typed, or a dispatch), the auto-resume continue (src/server/auto-resume.js), the rpc-queue
 * road's frame (src/server/conversation-deliver.js — a peer's, or VibeSpace's own notice). It lives on the hub beside the conversations' own metadata, so a
 * conversation on a paired machine is covered by the hub's send.
 *
 * MEMORY IS AUTHORITATIVE; every change is ONE `dirty()` of the store writer (src/store-writer.js — off the main loop).
 * BOUNDED: the PER_CONV_MAX newest rows of a conversation, the CONV_MAX conversations whose last send is newest. Read ONCE
 * at boot; a file that could not be read is never written over in that run; one read but not a record is kept beside it
 * (FILE.bad — a parse failure, or JSON that is not a v1 record) and a fresh record starts. A send re-encodes only its own
 * conversation (the others' JSON is kept). The hub has no conversation deletion: a
 * conversation leaves the record by the bound (the record-clear census declares it — digests, never words).
 */
const path = require('path');
const SP = require('../sent-provenance.js');

const FILE = 'sent-record.json';
const STORE_NAME = 'sent-record.write';
const STORE_NAME_BAD = 'sent-record.bad.write';
const PER_CONV_MAX = 100;
const CONV_MAX = 1000;
const LINKS_MAX = 8;   // B-9a2e part 2: the ids one conversation was adopted from, kept
const ID_RE = SP.ID_RE, okRow = SP.okRow;   // the PURE module's one shape of an id and of a row

function create({ dataDir, writer = null, readFile = null, log = () => { }, now = () => Date.now() } = {}) {
  const file = path.join(dataDir, FILE);
  const storeWriter = () => writer || require('../store-writer.js').storeWriter();
  const byConv = new Map();   // insertion order = the order of the last send (a send moves its conversation to the end)
  const fromIds = new Map();  // B-9a2e part 2: conversation → the ids it was adopted from (the record's optional `from`; a v1 reader ignores it)
  const enc = new Map();      // a conversation's rows as JSON, kept until its next send: a send re-encodes ONE conversation (the batch's readers)
  let unread = false, raw = null, encodes = 0, badOwed = false, persistHeld = false;   // B-a09e: the damaged file's copy owed / a write held behind it
  try {
    raw = typeof readFile === 'function' ? readFile(file) : require('fs').readFileSync(file, 'utf8');
    const j = JSON.parse(raw);
    if (!j || j.v !== 1 || !j.byConv || typeof j.byConv !== 'object' || Array.isArray(j.byConv)) throw new Error(`not a v1 record (v ${j && j.v})`);   // valid JSON that is not a record is kept aside too (the readers' L2)
    const by = j.byConv;
    for (const [cid, list] of Object.entries(by)) if (ID_RE.test(cid) && Array.isArray(list)) byConv.set(cid, list.filter(okRow).slice(-PER_CONV_MAX));
    while (byConv.size > CONV_MAX) byConv.delete(byConv.keys().next().value);
    if (j.from && typeof j.from === 'object' && !Array.isArray(j.from)) {
      for (const [cid, ids] of Object.entries(j.from)) {
        const l = ID_RE.test(cid) && Array.isArray(ids) ? ids.filter((x, i) => typeof x === 'string' && ID_RE.test(x) && x !== cid && ids.indexOf(x) === i).slice(-LINKS_MAX) : [];
        if (l.length) fromIds.set(cid, l);
      }
      while (fromIds.size > CONV_MAX) fromIds.delete(fromIds.keys().next().value);
    }
  } catch (e) {
    if (e && e.code === 'ENOENT') { /* no record yet */ }
    else if (typeof raw === 'string') {
      // the batch's readers: a file that was READ but is not a record is kept beside it (through the store writer — no write of
      // its own) and a fresh record starts; before, the record stayed off in every run with one boot line as its only sign
      byConv.clear(); fromIds.clear();
      let bad = raw;   // dropped once written (the readers: a damaged file's text is not held for the rest of the run)
      // B-a09e: the record is never written over the damaged file before its copy is ON DISK (badOwed holds persist(); the copy's
      // landing lets a held write through) — a .bad write that fails keeps the damaged file as it is, never only in memory
      badOwed = true;
      try { storeWriter().dirty(file + '.bad', { name: STORE_NAME_BAD, debounceMs: 0, allowEmpty: true, produce: () => bad || '', onWritten: (ok) => { if (ok) { bad = null; badOwed = false; if (persistHeld) { persistHeld = false; persist(); } } } }); log(`[sent-record] ${file} is not a record (${(e && e.message) || e}) — kept as ${FILE}.bad, a fresh record starts`); }
      catch (e2) { unread = true; log(`[sent-record] ${file} is not a record and could not be kept aside (${(e2 && e2.message) || e2}) — nothing is written over it in this run`); }
    } else { unread = true; log(`[sent-record] ${file} could not be read (${(e && (e.code || e.message)) || e}) — nothing is written over it in this run`); }
  }
  raw = null;
  const encOf = (cid, list) => { let s = enc.get(cid); if (s === undefined) { s = JSON.stringify(list); enc.set(cid, s); encodes++; } return s; };
  /** The store's text, from each conversation's kept encoding: the same record as one JSON.stringify of the whole (the same
   *  bytes for every id that is not all digits — an object puts integer-like keys first; real ids are UUIDs). */
  let fromEnc = null;   // the links' JSON, kept until a link changes (a send re-encodes only its own conversation)
  const produceAll = () => '{"v":1,"byConv":{' + [...byConv].map(([cid, list]) => JSON.stringify(cid) + ':' + encOf(cid, list)).join(',') + '}'
    + (fromIds.size ? ',"from":' + (fromEnc === null ? (fromEnc = JSON.stringify(Object.fromEntries(fromIds))) : fromEnc) : '') + '}';
  const evictOldest = () => { const k = byConv.keys().next().value; byConv.delete(k); enc.delete(k); };
  function persist() {
    if (unread) return;   // a store that has not read its file never writes it
    if (badOwed) { persistHeld = true; return; }   // B-a09e: the damaged file's copy first
    try { storeWriter().dirty(file, { name: STORE_NAME, debounceMs: 200, allowEmpty: true, produce: produceAll }); }
    catch (e) { log('[sent-record] the record was not handed to the store writer:', e && e.message); }
  }
  /** A send door's note: `conv` the conversation id, `text` what was sent, `kind` one of SP.KINDS. Never throws. */
  function note({ conv, text, kind, at = null } = {}) {
    try {
      if (typeof conv !== 'string' || !ID_RE.test(conv)) return null;
      const row = SP.rowOf(text, kind, at == null ? now() : at);
      if (!row) return null;
      const list = byConv.get(conv) || [];
      byConv.delete(conv); enc.delete(conv);
      list.push(row);
      if (list.length > PER_CONV_MAX) list.splice(0, list.length - PER_CONV_MAX);
      byConv.set(conv, list);
      while (byConv.size > CONV_MAX) evictOldest();
      persist();
      return row;
    } catch (e) { log('[sent-record] a send was not recorded:', e && e.message); return null; }
  }
  /** READ ONLY: the store keeps each conversation's encoding until its next send — a caller that changed the list would part the
   *  bytes on disk from memory (every reader today only reads: a worker call copies it, SP.kindFor reads it). */
  const rowsFor = (conv) => (typeof conv === 'string' ? byConv.get(conv) || null : null);
  /** B-9a2e part 2: ready rows (SP.rowOf's) filed under `conv`, each in the place of its instant (a held send is older than the
   *  rows noted since); the conversation becomes the newest. Never throws; → how many were filed. */
  function fileRows(conv, rows) {
    try {
      if (typeof conv !== 'string' || !ID_RE.test(conv) || !Array.isArray(rows)) return 0;
      const take = rows.filter(okRow);
      if (!take.length) return 0;
      const list = byConv.get(conv) || [];
      byConv.delete(conv); enc.delete(conv);
      for (const r of take) { let i = list.length; while (i > 0 && list[i - 1].at > r.at) i--; list.splice(i, 0, r); }
      if (list.length > PER_CONV_MAX) list.splice(0, list.length - PER_CONV_MAX);
      byConv.set(conv, list);
      while (byConv.size > CONV_MAX) evictOldest();
      persist();
      return take.length;
    } catch (e) { log('[sent-record] rows were not filed:', e && e.message); return 0; }
  }
  /** B-9a2e part 2: `rows` (each one of `from`'s own, by identity) move to `to`; `from` keeps its place in the eviction order.
   *  Never throws; → how many moved. */
  function move(from, to, rows) {
    try {
      if (!ID_RE.test(String(from)) || !ID_RE.test(String(to)) || from === to || !Array.isArray(rows) || !rows.length) return 0;
      const src = byConv.get(from) || [];
      const take = src.filter((r) => rows.includes(r));
      if (!take.length) return 0;
      const left = src.filter((r) => !take.includes(r));
      enc.delete(from);
      if (left.length) byConv.set(from, left); else byConv.delete(from);
      return fileRows(to, take);
    } catch (e) { log('[sent-record] rows were not moved:', e && e.message); return 0; }
  }
  /** B-9a2e part 2: `to` was adopted from `ids` (a resume / fork that minted it) — kept (newest last, LINKS_MAX) for the helper
   *  that names the ids a read consults (SP.idsFor). → how many were new */
  function link(to, ids) {
    try {
      if (typeof to !== 'string' || !ID_RE.test(to) || !Array.isArray(ids)) return 0;
      const cur = fromIds.get(to) || [];
      const add2 = ids.filter((x, i) => typeof x === 'string' && ID_RE.test(x) && x !== to && !cur.includes(x) && ids.indexOf(x) === i);
      if (!add2.length) return 0;
      fromIds.delete(to);
      fromIds.set(to, cur.concat(add2).slice(-LINKS_MAX));
      while (fromIds.size > CONV_MAX) fromIds.delete(fromIds.keys().next().value);
      fromEnc = null;
      persist();
      return add2.length;
    } catch (e) { log('[sent-record] a link was not kept:', e && e.message); return 0; }
  }
  const fromOf = (conv) => (typeof conv === 'string' ? fromIds.get(conv) || null : null);
  return { note, fileRows, move, link, rowsFor, fromOf, now, file, isUnread: () => unread, encodes: () => encodes };
}

// THE HUB'S ONE STORE: installed once (by the typed door's creation), it is the PURE module's source on the hub thread
let installed = null;
function install(opts) { installed = opts ? create(opts) : null; SP.setSource(installed ? installed.rowsFor : null); SP.setLinks(installed ? installed.fromOf : null); return installed; }
const note = (o) => (installed ? installed.note(o) : null);
const rowsFor = (conv) => (installed ? installed.rowsFor(conv) : null);
const isInstalled = () => !!installed;
/** The conversation a live session writes into (the transcript's id). */
const convOf = (session) => (session && (session.backendSessionId || session.claudeSessionId)) || null;

// B-9a2e part 2 — A SESSION'S OWN SENDS FOLLOW ITS ID. A resume or a fork that mints a new conversation id is known only at the
// session's FIRST ID REPORT (codex's wrapper_meta threadId, claude's first id line, ACP's session id, the lock capture, the codex
// thread match at create or at boot); a send made before it was noted under the old id — or, before any id, not at all — so the
// person's rows in the new conversation lost their origin. The send doors note THROUGH the session (noteFor): the rows a session
// notes BEFORE its first report are remembered (by identity, never a field on the session) and a send before any id is held (its
// row, never the words). Every report calls adoptFor: at the FIRST one those rows move to the reported id and the held ones are
// filed; a later report moves nothing (a mid-life fork's earlier sends went to the old id and stay there). Each report also keeps
// the ids the session records it was adopted from (session.forkedFrom) as the new id's links — the helper hands their rows too.
const MINE_MAX = 20;
const early = new WeakMap();     // session → [{ conv, row }] — the rows it noted before its first id report
const held = new WeakMap();      // session → [row] — sends made before it had any id
const reported = new WeakMap();  // session → the id its last report named (present = reported at least once)
/** A send door's note for a SESSION (`kind` one of SP.KINDS): under its conversation now, or held until its first id report. */
function noteFor(session, { text, kind, at = null } = {}) {
  if (!installed || !session || typeof session !== 'object') return null;
  const conv = convOf(session);
  if (!conv) {
    const row = SP.rowOf(text, kind, at == null ? installed.now() : at);
    if (row) { const h = held.get(session) || []; h.push(row); if (h.length > MINE_MAX) h.shift(); held.set(session, h); }
    return null;
  }
  const row = installed.note({ conv, text, kind, at });
  if (row && !reported.has(session)) { const m = early.get(session) || []; m.push({ conv, row }); if (m.length > MINE_MAX) m.shift(); early.set(session, m); }
  return row;
}
// A BORROWED ID is no report: a pending fork still carries its SOURCE's id (src/claude-lock-capture.js liveForkPending — the one
// predicate; a codex wrapper may echo it in a wrapper_meta before the fork answers) — its sends stay remembered until its own id
const borrowed = (session) => { try { return require('../claude-lock-capture.js').liveForkPending(session); } catch { return false; } };
/** AN ID REPORT — every road that learns the id a live session writes into, a new one or the same: see above. → rows moved / filed */
function adoptFor(session) {
  try {
    const to = convOf(session);
    if (!installed || !session || typeof session !== 'object' || !to || reported.get(session) === to) return 0;   // the same id again: nothing (claude repeats it on every line)
    if (borrowed(session)) return 0;
    const first = !reported.has(session);
    reported.set(session, to);
    let n = 0;
    const olds = [];
    if (first) {
      const byFrom = new Map();
      for (const x of early.get(session) || []) if (x.conv !== to) { const l = byFrom.get(x.conv) || []; l.push(x.row); byFrom.set(x.conv, l); }
      for (const [from, rows] of byFrom) { n += installed.move(from, to, rows); olds.push(from); }
      n += installed.fileRows(to, held.get(session) || []);
    }
    early.delete(session); held.delete(session);
    installed.link(to, (Array.isArray(session.forkedFrom) ? session.forkedFrom : []).concat(olds));
    return n;
  } catch { return 0; }
}
/** A session the boot RESTORED (its id read from its meta): its id was reported before the restart — unless it may still change at
 *  the harness's first line (a fork still carrying its source's id, a claude resume whose first id line has not come). Such a resume
 *  had its early rows in the record's memory only: the rows of its id since its spawn (`createdAt`) are taken as its own again (a
 *  resume is the one session writing that id — but for a pending fork of the same id, rare: its rows would follow the resume's new
 *  id). A pending fork's early sends are not known after a restart (its parent may write the same id). */
function restoredFor(session) {
  try {
    const to = convOf(session);
    if (!installed || !session || typeof session !== 'object' || !to || reported.has(session) || borrowed(session)) return 0;
    if (session._resumeSpawn && !session._sawFirstId) {
      const since = Number(session.createdAt) || 0;
      const mine = (installed.rowsFor(to) || []).filter((r) => since > 0 && r.at >= since).slice(-MINE_MAX).map((row) => ({ conv: to, row }));
      if (mine.length) early.set(session, mine);
      return mine.length;
    }
    reported.set(session, to);
    return 0;
  } catch { return 0; }
}

module.exports = { create, install, isInstalled, note, noteFor, adoptFor, restoredFor, rowsFor, convOf, FILE, STORE_NAME, PER_CONV_MAX, CONV_MAX, LINKS_MAX, MINE_MAX };

'use strict';
/**
 * WHAT VIBESPACE ITSELF SENT — the hub's store (B-9a2e + B-3d90 item 2; the PURE rules: src/sent-provenance.js).
 *
 * `data/sent-record.json` = {v: 1, byConv: {<conversation id>: [row…]}}, a row = {at, n, h, k} (the send's instant, the
 * folded text's length and digest, the kind) — NEVER the words. Written at each harness's ONE send door: the typed door
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
const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const okRow = (r) => !!r && Number.isFinite(r.at) && Number.isInteger(r.n) && r.n > 0 && typeof r.h === 'string' && /^[0-9a-f]{16}$/.test(r.h) && SP.KINDS.includes(r.k);

function create({ dataDir, writer = null, readFile = null, log = () => { }, now = () => Date.now() } = {}) {
  const file = path.join(dataDir, FILE);
  const storeWriter = () => writer || require('../store-writer.js').storeWriter();
  const byConv = new Map();   // insertion order = the order of the last send (a send moves its conversation to the end)
  const enc = new Map();      // a conversation's rows as JSON, kept until its next send: a send re-encodes ONE conversation (the batch's readers)
  let unread = false, raw = null, encodes = 0, badOwed = false, persistHeld = false;   // B-a09e: the damaged file's copy owed / a write held behind it
  try {
    raw = typeof readFile === 'function' ? readFile(file) : require('fs').readFileSync(file, 'utf8');
    const j = JSON.parse(raw);
    if (!j || j.v !== 1 || !j.byConv || typeof j.byConv !== 'object' || Array.isArray(j.byConv)) throw new Error(`not a v1 record (v ${j && j.v})`);   // valid JSON that is not a record is kept aside too (the readers' L2)
    const by = j.byConv;
    for (const [cid, list] of Object.entries(by)) if (ID_RE.test(cid) && Array.isArray(list)) byConv.set(cid, list.filter(okRow).slice(-PER_CONV_MAX));
    while (byConv.size > CONV_MAX) byConv.delete(byConv.keys().next().value);
  } catch (e) {
    if (e && e.code === 'ENOENT') { /* no record yet */ }
    else if (typeof raw === 'string') {
      // the batch's readers: a file that was READ but is not a record is kept beside it (through the store writer — no write of
      // its own) and a fresh record starts; before, the record stayed off in every run with one boot line as its only sign
      byConv.clear();
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
  const produceAll = () => '{"v":1,"byConv":{' + [...byConv].map(([cid, list]) => JSON.stringify(cid) + ':' + encOf(cid, list)).join(',') + '}}';
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
  return { note, rowsFor, file, isUnread: () => unread, encodes: () => encodes };
}

// THE HUB'S ONE STORE: installed once (by the typed door's creation), it is the PURE module's source on the hub thread
let installed = null;
function install(opts) { installed = opts ? create(opts) : null; SP.setSource(installed ? installed.rowsFor : null); return installed; }
const note = (o) => (installed ? installed.note(o) : null);
const rowsFor = (conv) => (installed ? installed.rowsFor(conv) : null);
const isInstalled = () => !!installed;
/** The conversation a live session writes into (the transcript's id). */
const convOf = (session) => (session && (session.backendSessionId || session.claudeSessionId)) || null;

module.exports = { create, install, isInstalled, note, rowsFor, convOf, FILE, STORE_NAME, PER_CONV_MAX, CONV_MAX };

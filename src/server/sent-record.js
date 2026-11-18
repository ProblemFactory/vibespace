'use strict';
/**
 * WHAT VIBESPACE ITSELF SENT — the hub's store (B-9a2e + B-3d90 item 2; the PURE rules: src/sent-provenance.js).
 *
 * `data/sent-record.json` = {v: 1, byConv: {<conversation id>: [row…]}}, a row = {at, n, h, k} (the send's instant, the
 * folded text's length and digest, the kind) — NEVER the words. Written at each harness's ONE send door: the typed door
 * (src/server/user-input.js — typed, or a dispatch), the auto-resume continue (src/server/auto-resume.js), the rpc-queue
 * road's peer frame (src/server/conversation-deliver.js). It lives on the hub beside the conversations' own metadata, so a
 * conversation on a paired machine is covered by the hub's send.
 *
 * MEMORY IS AUTHORITATIVE; every change is ONE `dirty()` of the store writer (src/store-writer.js — off the main loop).
 * BOUNDED: the PER_CONV_MAX newest rows of a conversation, the CONV_MAX conversations whose last send is newest. Read ONCE
 * at boot; a file that could not be read is never written over in that run. The hub has no conversation deletion: a
 * conversation leaves the record by the bound (the record-clear census declares it — digests, never words).
 */
const path = require('path');
const SP = require('../sent-provenance.js');

const FILE = 'sent-record.json';
const STORE_NAME = 'sent-record.write';
const PER_CONV_MAX = 100;
const CONV_MAX = 1000;
const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const okRow = (r) => !!r && Number.isFinite(r.at) && Number.isInteger(r.n) && r.n > 0 && typeof r.h === 'string' && /^[0-9a-f]{16}$/.test(r.h) && SP.KINDS.includes(r.k);

function create({ dataDir, writer = null, readFile = null, log = () => { }, now = () => Date.now() } = {}) {
  const file = path.join(dataDir, FILE);
  const storeWriter = () => writer || require('../store-writer.js').storeWriter();
  const byConv = new Map();   // insertion order = the order of the last send (a send moves its conversation to the end)
  let unread = false;
  try {
    const raw = typeof readFile === 'function' ? readFile(file) : require('fs').readFileSync(file, 'utf8');
    const j = JSON.parse(raw);
    const by = j && j.byConv && typeof j.byConv === 'object' && !Array.isArray(j.byConv) ? j.byConv : {};
    for (const [cid, list] of Object.entries(by)) if (ID_RE.test(cid) && Array.isArray(list)) byConv.set(cid, list.filter(okRow).slice(-PER_CONV_MAX));
    while (byConv.size > CONV_MAX) byConv.delete(byConv.keys().next().value);
  } catch (e) {
    if (!(e && e.code === 'ENOENT')) { unread = true; log(`[sent-record] ${file} could not be read (${(e && (e.code || e.message)) || e}) — nothing is written over it in this run`); }
  }
  function persist() {
    if (unread) return;   // a store that has not read its file never writes it
    try { storeWriter().dirty(file, { name: STORE_NAME, debounceMs: 200, allowEmpty: true, produce: () => JSON.stringify({ v: 1, byConv: Object.fromEntries(byConv) }) }); }
    catch (e) { log('[sent-record] the record was not handed to the store writer:', e && e.message); }
  }
  /** A send door's note: `conv` the conversation id, `text` what was sent, `kind` one of SP.KINDS. Never throws. */
  function note({ conv, text, kind, at = null } = {}) {
    try {
      if (typeof conv !== 'string' || !ID_RE.test(conv)) return null;
      const row = SP.rowOf(text, kind, at == null ? now() : at);
      if (!row) return null;
      const list = byConv.get(conv) || [];
      byConv.delete(conv);
      list.push(row);
      if (list.length > PER_CONV_MAX) list.splice(0, list.length - PER_CONV_MAX);
      byConv.set(conv, list);
      while (byConv.size > CONV_MAX) byConv.delete(byConv.keys().next().value);
      persist();
      return row;
    } catch (e) { log('[sent-record] a send was not recorded:', e && e.message); return null; }
  }
  const rowsFor = (conv) => (typeof conv === 'string' ? byConv.get(conv) || null : null);
  return { note, rowsFor, file, isUnread: () => unread };
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

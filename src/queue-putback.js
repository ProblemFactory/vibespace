'use strict';
// STOP PUTS THE DROPPED QUEUE BACK (lane stop-refills-composer — the owner, 2026-10-24: «可以丢弃但是把内容回填到输入框»,
// amending the 2026-09-07 law «Stop clears the queue, every harness»). Stop still DROPS the queue — nothing queued runs
// after it (the 2026-09-07 reason holds: queued items ran the instant Stop landed = the agent kept working) — and what it
// dropped comes back into the input box, once, on every open client:
//   · the WRAPPER says what it dropped: ONE `queue_dropped` record per Stop, between the per-item `queue_op_result
//     {reason:'stopped'}` results and the emptied `queue_changed` (acp / agy / codex; each carries an inline TWIN of
//     droppedRecordFor below — a wrapper cannot require src/ — and test-queue-putback pins every twin to this one);
//   · the SERVER's ONE writer (src/server/queue-putback.js, at session-stdout's feedLive gate) prepends the texts to the
//     session's draft as an ABSOLUTE value whose op carries `prepended` (the prefix's length);
//   · every CLIENT lands that op as a prefix over its LIVE box (landDraftPrepend — unsaved typing kept, caret shifted)
//     and the arrival rule always applies it (src/sync-arrival.js, the delta row); a toast says how many (putbackNotice).
// The person's rows only: a peer / nudge / retry / system row goes back through its own ladder. Attachments are named
// (descriptors), never restored — the draft is a string. PURE — imports nothing: the bundle (src/lib/chat-input.js),
// the server door, ws-handler's belt and the normalizer base (src/message-window.js) share it.

const PUTBACK_ITEM_MAX_CHARS = 20000;    // = the wrappers' QUEUE_EDIT_MAX_CHARS (the edit control refuses at the same bound)
const PUTBACK_TOTAL_MAX_CHARS = 100000;  // text carried in ONE record; rows past it are counted (`omitted`), not carried
const PUTBACK_SEP = '\n\n';              // between put-back rows, and between the put-back and the draft it lands on
const PUTBACK_MAX_ITEMS = 500;           // a record's rows, bounded (a reader never walks an unbounded array)
const PUTBACK_BELT_MAX = 4;              // the put-backs a session remembers for the server belt (beltValue)

const isVersion = (v) => Number.isSafeInteger(v) && v > 0;
const IMAGE_TYPES = new Set(['image', 'localImage']);

/** THE RECORD's payload — the person's rows Stop removed, oldest first, each text cut at 20000 (never inside a
 *  surrogate pair), rows past 100000 chars of text in one record counted as `omitted`, attachments as descriptors.
 *  Each wrapper carries a BYTE-IDENTICAL inline twin of this function (they cannot require src/); test-queue-putback
 *  pins every twin's text to this one and drives them on one fixture. */
function droppedRecordFor(rows, { dropId, turnId } = {}) {
  const ITEM_MAX = 20000, TOTAL_MAX = 100000;
  const items = []; let total = 0, omitted = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object') continue;
    const full = typeof r.text === 'string' ? r.text : '';
    let text = full.length > ITEM_MAX ? full.slice(0, ITEM_MAX) : full;
    if (text.length < full.length && /[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
    if (total + text.length > TOTAL_MAX) { omitted++; continue; }
    total += text.length;
    const attachments = (Array.isArray(r.attachments) ? r.attachments : []).filter((a) => a && typeof a.type === 'string' && a.type).slice(0, 32)
      .map((a) => ({ type: a.type.slice(0, 32), mime: typeof a.mime === 'string' && a.mime ? a.mime.slice(0, 100) : null, name: typeof a.name === 'string' && a.name ? a.name.slice(0, 200) : null }));
    items.push({ id: String(r.id || ''), msgId: String(r.msgId || ''), ts: Number.isFinite(r.ts) ? r.ts : null, text, cut: text.length < full.length, attachments });
  }
  return { dropId: String(dropId || ''), by: 'stop', turnId: typeof turnId === 'string' && turnId ? turnId : null, items, omitted };
}

/** The ONE extractor: a wrapper record → its QueueDropped payload, validated, or null. Three envelopes — acp / agy
 *  `{type:'acp', kind:'queue_dropped', …}` (recognised by `kind`, NEVER by the harness id: 'acp' is a FAMILIES row of
 *  the id-branch census), codex `{type:'event_msg', payload:{type:'queue_dropped', …}}` and its bare payload (the codex
 *  normalizer hands the payload), and a top-level `{type:'queue_dropped', …}` (a claude wrapper line, should one ever be
 *  measured in). O(1) miss for every other record. A malformed row is dropped, never thrown on (a wrapper of another
 *  version must not break the door or the normalizer). */
function queueDroppedOf(record) {
  if (!record || typeof record !== 'object') return null;
  let p = null;
  if (record.kind === 'queue_dropped') p = record;
  else if (record.type === 'queue_dropped') p = record;
  else if (record.type === 'event_msg' && record.payload && typeof record.payload === 'object' && record.payload.type === 'queue_dropped') p = record.payload;
  if (!p) return null;
  const dropId = typeof p.dropId === 'string' ? p.dropId.slice(0, 128) : '';
  if (!dropId) return null;
  const items = [];
  for (const it of Array.isArray(p.items) ? p.items.slice(0, PUTBACK_MAX_ITEMS) : []) {
    if (!it || typeof it !== 'object') continue;
    const raw = typeof it.text === 'string' ? it.text : '';
    const text = raw.length > PUTBACK_ITEM_MAX_CHARS ? raw.slice(0, PUTBACK_ITEM_MAX_CHARS) : raw;
    const attachments = [];
    for (const a of Array.isArray(it.attachments) ? it.attachments.slice(0, 32) : []) {
      if (!a || typeof a !== 'object' || typeof a.type !== 'string' || !a.type) continue;
      attachments.push({ type: a.type.slice(0, 32), mime: typeof a.mime === 'string' && a.mime ? a.mime.slice(0, 100) : null, name: typeof a.name === 'string' && a.name ? a.name.slice(0, 200) : null });
    }
    if (!text && !attachments.length) continue;
    items.push({ id: typeof it.id === 'string' ? it.id : '', msgId: typeof it.msgId === 'string' ? it.msgId : '', ts: Number.isFinite(it.ts) ? it.ts : null, text, cut: it.cut === true || text.length < raw.length, attachments });
  }
  const omitted = Number.isSafeInteger(p.omitted) && p.omitted > 0 ? p.omitted : 0;
  return { dropId, by: typeof p.by === 'string' && p.by ? p.by.slice(0, 32) : 'stop', turnId: typeof p.turnId === 'string' && p.turnId ? p.turnId : null, items, omitted };
}

/** THE MERGE (the server door's one rule): the put-back texts, oldest first, blank-line separated, IN FRONT of the draft
 *  the store holds. `prepended` = the prefix's length, INCLUDING the trailing separator — always present, so whatever a
 *  client still has unsaved lands on its own line. An attachment-only row contributes no text. count 0 ⇒ nothing to
 *  write (text = the existing draft, prepended 0). */
function mergeDraft(existing, items) {
  const base = typeof existing === 'string' ? existing : '';
  const texts = (Array.isArray(items) ? items : []).map((it) => (it && typeof it.text === 'string' ? it.text : '')).filter((s) => s.trim() !== '');
  if (!texts.length) return { text: base, count: 0, prepended: 0 };
  const prefix = texts.join(PUTBACK_SEP) + PUTBACK_SEP;
  return { text: prefix + base, count: texts.length, prepended: prefix.length };
}

/** THE LANDING RULE (every client, src/lib/chat-input.js): the op's prefix = value.slice(0, prepended), put in front of
 *  the LIVE box — never the op's whole value, which the server merged against a store that may be seconds stale (the
 *  300 ms autosave never fires while a person keeps typing; codex's Stop sweep takes up to 6 s). Every character in
 *  the box survives; both caret ends move by exactly the prefix. */
function landDraftPrepend({ current, selStart, selEnd, value, prepended } = {}) {
  const cur = typeof current === 'string' ? current : '';
  const v = typeof value === 'string' ? value : '';
  const n = Number.isSafeInteger(prepended) ? Math.max(0, Math.min(prepended, v.length)) : 0;
  const prefix = v.slice(0, n);
  const at = (x) => (Number.isSafeInteger(x) && x >= 0 && x <= cur.length ? x : cur.length);
  return { value: prefix + cur, selStart: at(selStart) + prefix.length, selEnd: at(selEnd) + prefix.length };
}

/** The toast's facts: n = rows whose text came back, images / others = attachments named but not restored, cut = rows
 *  shortened to 20000, omitted = rows past the record's 100000 chars (not carried at all). */
function putbackNotice(d) {
  const items = d && Array.isArray(d.items) ? d.items : [];
  let n = 0, images = 0, others = 0, cut = 0;
  for (const it of items) {
    if (!it) continue;
    if (typeof it.text === 'string' && it.text.trim()) n++;
    if (it.cut) cut++;
    for (const a of Array.isArray(it.attachments) ? it.attachments : []) { if (a && IMAGE_TYPES.has(a.type)) images++; else if (a) others++; }
  }
  return { n, images, others, cut, omitted: d && Number.isSafeInteger(d.omitted) && d.omitted > 0 ? d.omitted : 0 };
}

/** THE SERVER BELT (ws-handler's `state-set` on drafts/chat:<id>): a client set whose `basedOn` is BELOW a put-back's
 *  version PROVES that client never saw it — its autosave was already in flight — so the stored value keeps the
 *  put-back in front: every remembered prefix newer than basedOn (newest first, as the merges stacked them) + the
 *  value. An emptied box (a send, a clear) with a stale basedOn keeps the prefixes too: it was not a decision about
 *  words the person had not seen come back. A set with basedOn ≥ every put-back (or no basedOn) is stored as-is — no
 *  double prefix. belt = [{version, prefix}] (noteBelt). */
function beltValue(belt, value, basedOn) {
  if (!Array.isArray(belt) || !belt.length || !Number.isSafeInteger(basedOn) || basedOn < 0) return value;
  const newer = belt.filter((e) => e && isVersion(e.version) && e.version > basedOn && typeof e.prefix === 'string' && e.prefix)
    .sort((a, b) => b.version - a.version);
  if (!newer.length) return value;
  return newer.map((e) => e.prefix).join('') + (typeof value === 'string' ? value : '');
}

/** The session's belt after one more put-back (bounded to the newest PUTBACK_BELT_MAX). */
function noteBelt(belt, entry) {
  const out = (Array.isArray(belt) ? belt : []).filter((e) => e && isVersion(e.version));
  if (entry && isVersion(entry.version) && typeof entry.prefix === 'string' && entry.prefix) out.push({ version: entry.version, prefix: entry.prefix });
  return out.slice(-PUTBACK_BELT_MAX);
}

module.exports = {
  PUTBACK_ITEM_MAX_CHARS, PUTBACK_TOTAL_MAX_CHARS, PUTBACK_SEP, PUTBACK_MAX_ITEMS, PUTBACK_BELT_MAX,
  droppedRecordFor, queueDroppedOf, mergeDraft, landDraftPrepend, putbackNotice, beltValue, noteBelt,
};

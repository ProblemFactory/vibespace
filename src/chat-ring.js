'use strict';
// THE HUB'S RING OF A CLAUDE CHAT'S RECORDS (B-5a4d remainder, lane bl-keys-misc — the coordinator's law 2026-11-21: A RECORD
// THAT CHANGES WHAT A CONVERSATION IS — A HELD COPY, ITS QUEUE RECORD — IS NEVER TRIMMED WHILE IT IS STILL OWED). PURE.
//
// The hub keeps a claude chat's lines in memory (`session.buffer`): the restore seeds it with the wrapper's file (which holds
// the copy of a message the person HELD behind a running turn — `webui_copy`, data/bin/chat-wrapper.js — a line that never
// rides stdout), then every stdout chunk and the hub's own lines (the person's send, a permission answer, an auto-allow mark)
// are appended. Until this module, four writers cut it with `.slice(-500000)` (the stream parser past 750 000 chars, each
// appender on every append): a long turn's output pushed the held copy, its `queued_input` and the queue's last
// `queue_changed` out, and a page that attached then drew no bubble and no strip row for a message still waiting to run.
//
// THE ONE TRIM: past RING_MAX the ring keeps its last RING_KEEP chars cut AT A LINE (never a torn first record), and the
// cut part's OWED records go back in front of the kept tail, in their order:
//   · OWED = a msgId the LAST `queue_changed` still lists (held), or whose last hand-over word is `input_handover` 'handed'
//     (written to the CLI inside a turn, not yet landed / kept / its own turn) — the ring's own words, read at the cut;
//   · carried: the person's records of an owed msgId (`_fromWebui` — the wrapper's copy, the hub's own send record), its
//     `queued_input`, its 'handed' record, and the last `queue_changed` itself when the cut took it and it lists anything.
// A settled record is never carried (a copy carried past its witness would sit before the transcript's own record of the
// same words and draw twice). The carry is bounded (CARRY_MAX chars, the newest first; a line that does not fit is left and
// an older one that fits still goes): the records left go as they always did, and the answer says how many (`dropped`).
//
// session-store's history merge (bufferRecordsOf) re-parses a ring whose head changed; the carried lines precede the
// kept tail, so they anchor before its first transcript match — they are older than every kept line, as in the ring.

const RING_MAX = 750000;   // the ring is trimmed past this many chars (the stream parser's number since the start)
const RING_KEEP = 500000;  // and keeps at most this many of its newest chars, cut at a line
const CARRY_MAX = 250000;  // the owed records carried in front of the kept tail, at most (the newest kept)

// a line that may change what the conversation is — only these are parsed (a cut of ~250 KB of stream lines parses none)
const MARKS = ['"_fromWebui":true', '"type":"queue_changed"', '"type":"queued_input"', '"type":"input_handover"', '"type":"queue_dropped"'];
const marked = (line) => MARKS.some((m) => line.includes(m));
const parse = (line) => { try { const r = JSON.parse(line.replace(/\r/g, '').trim()); return r && typeof r === 'object' ? r : null; } catch { return null; } };
const idsOf = (a) => (Array.isArray(a) ? a.map((x) => String(x || '')).filter(Boolean) : []);
/** The msgIds a record speaks for — and how: 'held' (queue), 'handed', 'settled' (any other hand-over word / a Stop's drop). */
function wordsOf(r) {
  if (!r) return null;
  if (r.type === 'queue_changed') return { queue: idsOf((Array.isArray(r.items) ? r.items : []).map((it) => it && it.msgId)) };
  if (r.type === 'input_handover') return { ids: idsOf(r.msg_ids), state: r.state === 'handed' ? 'handed' : 'settled' };
  if (r.type === 'queue_dropped') return { ids: [...idsOf(r.keptIds), ...idsOf(r.landedIds), ...idsOf((Array.isArray(r.items) ? r.items : []).map((it) => it && it.msgId))], state: 'settled' };
  return null;
}
/** The record's own msgId when it is a person's record or a held frame's notice (the lines that draw a held message). */
const ownIdOf = (r) => (r && r._fromWebui && r.msgId ? String(r.msgId) : r && r.type === 'queued_input' && r.msg_id ? String(r.msg_id) : '');

/** The owed msgIds after reading `lines` (records in the ring's order): held by the last queue, or handed and not settled. */
function owedOf(records) {
  let queue = null;
  const hand = new Map();
  for (const r of records) {
    const w = wordsOf(r);
    if (!w) continue;
    if (w.queue) queue = w.queue;
    else for (const id of w.ids) hand.set(id, w.state);
  }
  const owed = new Set(queue || []);
  for (const [id, st] of hand) if (st === 'handed') owed.add(id);
  return owed;
}

/** → { buffer, carried, dropped } — the ring after its trim (the same string when it is not past `max`). */
function trimRingOf(buffer, { max = RING_MAX, keep = RING_KEEP, carryMax = CARRY_MAX } = {}) {
  const s = String(buffer || '');
  if (s.length <= max) return { buffer: s, carried: 0, dropped: 0 };
  const nl = s.indexOf('\n', s.length - keep);
  const cutAt = nl >= 0 ? nl + 1 : s.length - keep;   // at a line; one line longer than the ring is cut as before
  const gone = s.slice(0, cutAt), tail = s.slice(cutAt);
  if (!MARKS.some((m) => gone.includes(m))) return { buffer: tail, carried: 0, dropped: 0 };
  const goneLines = gone.split('\n');
  goneLines.pop();   // what follows the cut part's last newline is the start of the kept tail's first line (or nothing)
  const goneRecs = goneLines.map((l) => (marked(l) ? parse(l) : null));
  const tailRecs = MARKS.some((m) => tail.includes(m)) ? tail.split('\n').filter(marked).map(parse) : [];
  const owed = owedOf([...goneRecs, ...tailRecs]);
  const tailHasQueue = tailRecs.some((r) => r && r.type === 'queue_changed');
  let lastQueue = -1;
  if (!tailHasQueue) for (let i = goneRecs.length - 1; i >= 0; i--) if (goneRecs[i] && goneRecs[i].type === 'queue_changed') { lastQueue = i; break; }
  const pick = [];
  for (let i = 0; i < goneRecs.length; i++) {
    const r = goneRecs[i];
    if (!r) continue;
    const own = ownIdOf(r);
    if (own && owed.has(own)) pick.push(i);
    else if (i === lastQueue && wordsOf(r).queue.length) pick.push(i);
    else if (r.type === 'input_handover' && r.state === 'handed' && idsOf(r.msg_ids).some((id) => owed.has(id))) pick.push(i);
  }
  // the bound: the newest first; a line that does not fit is left (counted) and an older one that fits still goes
  const keepIdx = new Set();
  let size = 0;
  for (let j = pick.length - 1; j >= 0; j--) { const len = goneLines[pick[j]].length + 1; if (size + len <= carryMax) { keepIdx.add(pick[j]); size += len; } }
  const carry = pick.filter((i) => keepIdx.has(i)).map((i) => goneLines[i] + '\n').join('');
  return { buffer: carry + tail, carried: keepIdx.size, dropped: pick.length - keepIdx.size };
}
/** The ring after its trim — THE call of every writer of a claude chat's `session.buffer`. */
const trimRing = (buffer, opts) => trimRingOf(buffer, opts).buffer;

module.exports = { RING_MAX, RING_KEEP, CARRY_MAX, MARKS, owedOf, trimRingOf, trimRing };

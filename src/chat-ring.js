'use strict';
// THE HUB'S RING OF A CLAUDE CHAT'S RECORDS (B-5a4d remainder, lane bl-keys-misc — the coordinator's law 2026-11-21: A RECORD
// THAT CHANGES WHAT A CONVERSATION IS — A HELD COPY, ITS QUEUE RECORD — IS NEVER TRIMMED WHILE IT IS STILL OWED).
//
// The hub keeps a claude chat's lines in memory (`session.buffer`): the restore seeds it with the wrapper's file (which holds
// the copy of a message the person HELD behind a running turn — `webui_copy`, data/bin/chat-wrapper.js — a line that never
// rides stdout), then every stdout chunk and the hub's own lines (the person's send, a permission answer, an auto-allow mark,
// the automatic resume's send) are appended. Until this module, five writers cut it with `.slice(-500000)`: a long turn's
// output pushed the held copy, its `queued_input` and the queue's last `queue_changed` out, and a page that attached then drew
// no bubble and no strip row for a message still waiting to run.
//
// THE ONE TRIM (every writer of a session's ring: the census in scripts/test-chat-ring.mjs walks every write in the tree):
//   · it runs only when the text that is NOT owed passes RING_MAX: the ring past RING_MAX + what the last trim carried. It
//     then keeps the last RING_KEEP chars of the stream, cut AT A LINE (never a torn first record), and puts the cut part's
//     OWED records back in front of that tail, in their order — so after a trim the next one is RING_MAX - RING_KEEP
//     (250 000) chars of stream away, however much is owed (r1488 (2): never a trim at every chunk while a picture is held)
//   · OWED = a msgId the LAST `queue_changed` still lists (held), or whose last hand-over word is `input_handover` 'handed'
//     (written to the CLI inside a turn, not yet landed / kept / its own turn) — the ring's own words, read at the cut;
//   · carried: the person's records of an owed msgId (`_fromWebui` — the wrapper's copy, the hub's own send record, which
//     carries a frame's pictures INLINE: one or two screenshots are 180 to 250 KB), its `queued_input`, its 'handed' record,
//     and the last `queue_changed` itself when the cut took it and it lists any item (a frame VibeSpace typed included);
//   · AN OWED RECORD IS NEVER DROPPED BY A TRIM, WHATEVER ITS SIZE (r1488 (1)): the bound falls on the text that is not owed.
//     What bounds the ring is RING_MAX + what is owed, and the queue bounds what is owed only loosely (the wrapper caps no count
//     of held frames; a frame is bounded by the socket's 100 MiB): so OWED_MAX (32 MiB) is the ring's last guard — past it the
//     OLDEST owed records go, and the trim SAYS it in the journal by msgId and count (`dropped`, `droppedIds`).
// A settled record is never carried (a copy carried past its witness would sit before the transcript's own record of the same
// words and draw twice). Only lines carrying one of MARKS are parsed (a cut of stream lines parses none).
//
// session-store's history merge (bufferRecordsOf) re-parses a ring whose kept span changed (its tail probe decides: a carried
// head may keep the first chars the same across trims); the carried lines precede the kept tail, so they anchor before its
// first transcript match — they are older than every kept line, as in the ring.

const RING_MAX = 750000;            // the text that is not owed passes this ⇒ a trim (the stream parser's number since the start)
const RING_KEEP = 500000;           // a trim keeps at most this many of the stream's newest chars, cut at a line
const OWED_MAX = 32 * 1024 * 1024;  // the ring's last guard on what is owed (past it the oldest owed records go, SAID)

// a line that may change what the conversation is — only these are parsed (a cut of ~250 KB of stream lines parses none)
const MARKS = ['"_fromWebui":true', '"type":"queue_changed"', '"type":"queued_input"', '"type":"input_handover"', '"type":"queue_dropped"'];
const marked = (line) => MARKS.some((m) => line.includes(m));
const parse = (line) => { try { const r = JSON.parse(line.replace(/\r/g, '').trim()); return r && typeof r === 'object' ? r : null; } catch { return null; } };
const idsOf = (a) => (Array.isArray(a) ? a.map((x) => String(x || '')).filter(Boolean) : []);
const itemsOf = (r) => (Array.isArray(r.items) ? r.items : []);
/** The msgIds a record speaks for — and how: 'held' (queue), 'handed', 'settled' (any other hand-over word / a Stop's drop). */
function wordsOf(r) {
  if (!r) return null;
  if (r.type === 'queue_changed') return { queue: idsOf(itemsOf(r).map((it) => it && it.msgId)) };
  if (r.type === 'input_handover') return { ids: idsOf(r.msg_ids), state: r.state === 'handed' ? 'handed' : 'settled' };
  if (r.type === 'queue_dropped') return { ids: [...idsOf(r.keptIds), ...idsOf(r.landedIds), ...idsOf(itemsOf(r).map((it) => it && it.msgId))], state: 'settled' };
  return null;
}
/** The record's own msgId when it is a person's record or a held frame's notice (the lines that draw a held message). */
const ownIdOf = (r) => (r && r._fromWebui && r.msgId ? String(r.msgId) : r && r.type === 'queued_input' && r.msg_id ? String(r.msg_id) : '');

/** The owed msgIds after reading `records` (in the ring's order): held by the last queue, or handed and not settled. */
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

/** → { buffer, cut, carried, carriedChars, dropped, droppedIds } — the ring after its trim (the same string when the text that
 *  is not owed is within `max`). `owedChars` = what the last trim of this ring carried (the caller's memory, trimRing below). */
function trimRingOf(buffer, { max = RING_MAX, keep = RING_KEEP, owedMax = OWED_MAX, owedChars = 0 } = {}) {
  const s = String(buffer || '');
  if (s.length <= max + Math.max(0, owedChars)) return { buffer: s, cut: false, carried: 0, carriedChars: owedChars, dropped: 0, droppedIds: [] };
  const nl = s.indexOf('\n', s.length - keep);
  const cutAt = nl >= 0 ? nl + 1 : s.length - keep;   // at a line; one line longer than the ring is cut as before
  const gone = s.slice(0, cutAt), tail = s.slice(cutAt);
  if (!MARKS.some((m) => gone.includes(m))) return { buffer: tail, cut: true, carried: 0, carriedChars: 0, dropped: 0, droppedIds: [] };
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
    else if (i === lastQueue && itemsOf(r).length) pick.push(i);   // the strip's record: any item (a frame VibeSpace typed has no msgId)
    else if (r.type === 'input_handover' && r.state === 'handed' && idsOf(r.msg_ids).some((id) => owed.has(id))) pick.push(i);
  }
  // THE LAST GUARD (OWED_MAX): the newest first; what does not fit goes — and is SAID (trimRing), never silently
  const keepIdx = new Set(), droppedIds = [];
  let size = 0;
  for (let j = pick.length - 1; j >= 0; j--) {
    const len = goneLines[pick[j]].length + 1;
    if (size + len <= owedMax) { keepIdx.add(pick[j]); size += len; } else { const id = ownIdOf(goneRecs[pick[j]]); if (id) droppedIds.push(id); }
  }
  const carry = pick.filter((i) => keepIdx.has(i)).map((i) => goneLines[i] + '\n').join('');
  return { buffer: carry + tail, cut: true, carried: keepIdx.size, carriedChars: carry.length, dropped: pick.length - keepIdx.size, droppedIds: [...new Set(droppedIds)] };
}

// what the last trim of each ring carried (by its session) — the trim's memory, so it runs only past RING_MAX + what is owed
const _carried = new WeakMap();
/** The ring after its trim — THE call of every writer of a session's ring: trimRing(session.buffer + text, session, id).
 *  A dropped owed record (past OWED_MAX) is said in the journal by its msgIds and count. */
function trimRing(buffer, session = null, id = null, opts = {}) {
  const key = session && typeof session === 'object' ? session : null;
  const r = trimRingOf(buffer, { ...opts, owedChars: key ? _carried.get(key) || 0 : 0 });
  if (key && r.cut) _carried.set(key, r.carriedChars);
  if (r.dropped) {
    try { console.warn(`[ring] ${id || 'a conversation'}: ${r.dropped} owed record(s) past OWED_MAX (${opts.owedMax || OWED_MAX} chars) left by a trim — held message(s) ${r.droppedIds.join(', ') || '(no id)'} will draw no bubble at the next attach`); } catch { }
    try { global.__vsEvent?.('ring-owed-dropped', String(r.dropped)); } catch { }
  }
  return r.buffer;
}

module.exports = { RING_MAX, RING_KEEP, OWED_MAX, MARKS, owedOf, trimRingOf, trimRing };

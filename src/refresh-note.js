'use strict';
/**
 * 「刷新所有活着的会话」 — ONE NOTE INTO EVERY LIVE CONVERSATION'S NEXT TURN (lane refresh-live-sessions, userW's ask
 * inc-mv8jk9wy-35s1; the owner 2026-10-15: manual only — automatic skill detection is "too intrusive, depends on
 * Claude Code's implementation of the day"). PURE (imports nothing; CJS so the server's route and the bundle's
 * confirm share ONE rule).
 *
 * The user changed a shared skill, a CLAUDE.md or a context folder; a conversation already running read its copy
 * when it started. One press of the session list's ⋯ menu queues a note through the delivery ladder's STASH (the
 * next-turn door the browser handback uses — src/server/stash-handover.js `refreshLive`), so it rides each live
 * conversation's NEXT turn, whoever starts it: free, never a wake, never a spend-guard call.
 *
 * `refreshPlan(sessions, note)` → `{ queue, replace, skipped, text, error }`
 *   - a row is `{ id, conversationId, state, queued }`: `state` 'live' | 'stopped' | 'read-only' (anything that is not
 *     'live' is not live); `queued` = an earlier press's note still waits in that conversation's stash
 *   - ONCE PER CONVERSATION: rows that share a conversation (its live session and a history view of it, two rows of
 *     one list) are one; a conversation that is live in ANY row is live — a read-only view of a running conversation
 *     never skips it
 *   - a row with no conversation id is not in the plan (a session still starting has none yet — it reads its
 *     skills fresh when it starts)
 *   - `queue` = the first row id of each live conversation; `replace` ⊆ `queue` = the ones whose waiting note is
 *     taken back first (replaced, never doubled); `skipped` = the first row id of each stopped / read-only one
 *   - THE TEXT (`noteText`): CRLF / CR → LF, a TAB → a space, every other control character removed (C0, DEL, C1),
 *     trimmed; empty ⇒ `error: 'empty'`, more than REFRESH_NOTE_MAX characters (code points) ⇒ `error: 'too-long'`
 *     — a plan with an error queues nothing
 *
 * Gate: scripts/test-refresh-note.mjs (the plan table + the bound + a RED control).
 */

const REFRESH_NOTE_MAX = 2000;
/** The name the note speaks under on the ladder — a VibeSpace notification SENDER (src/notification-senders.js lists it). */
const REFRESH_FROM = 'VibeSpace refresh';
/** The stash entry's `ref`: how a later press finds the note it replaces. */
const REFRESH_REF = 'refresh-note';
const LIVE = 'live';

// every control character but LF (CR and TAB are rewritten before this runs)
const CONTROL_RE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;

/** The note's words, cleaned and judged: `{ text, error }` (`error` null | 'empty' | 'too-long'). */
function noteText(raw) {
  const text = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(CONTROL_RE, '').trim();
  if (!text) return { text: '', error: 'empty' };
  if ([...text].length > REFRESH_NOTE_MAX) return { text, error: 'too-long' };
  return { text, error: null };
}

/** Is this stash entry a refresh note (the one a later press replaces)? */
function isRefreshEntry(e) {
  return !!e && typeof e === 'object' && e.fromName === REFRESH_FROM && e.ref === REFRESH_REF;
}

function refreshPlan(sessions, note) {
  const { text, error } = noteText(note);
  const convs = new Map();   // conversationId → { id, live, queued } — insertion order = the rows' order
  for (const r of Array.isArray(sessions) ? sessions : []) {
    if (!r || typeof r !== 'object') continue;
    const cid = typeof r.conversationId === 'string' ? r.conversationId.trim() : '';
    if (!cid || r.id == null) continue;
    const live = r.state === LIVE;
    const c = convs.get(cid);
    if (!c) { convs.set(cid, { id: String(r.id), live, queued: live && r.queued === true }); continue; }
    if (live && !c.live) { c.id = String(r.id); c.live = true; }   // a live row outranks a stopped / read-only one
    if (live && r.queued === true) c.queued = true;
  }
  const queue = [], replace = [], skipped = [];
  for (const c of convs.values()) {
    if (!c.live) { skipped.push(c.id); continue; }
    if (error) continue;
    queue.push(c.id);
    if (c.queued) replace.push(c.id);
  }
  return { queue, replace, skipped, text, error };
}

module.exports = { REFRESH_NOTE_MAX, REFRESH_FROM, REFRESH_REF, noteText, isRefreshEntry, refreshPlan };

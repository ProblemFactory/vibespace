'use strict';
/**
 * THE DOC WINDOW'S HUB (lane doc-window, 2.369.215; docs/design-artifacts.zh.md §Doc window). Two things a user does
 * in the Doc window reach the conversation that owns the markdown file:
 *   COMMENTS   the strip's notes → ONE `[Doc comments] <path>\n① "quote" — note…` message (src/doc-model.js spells and
 *              bounds it: a quote ≤ 200, ≤ 20 notes, ≤ 4 KB), the WHOLE block through THE belt (src/peer-text.js
 *              toAgentText — the quotes are a file's words, the notes the user's), then exactly the Design window's
 *              comment path: THE typing sender (src/server/user-input.js — the user's own message; mid-turn it queues
 *              like chat input), else the durable stash (source `doc-comment`, drained into the next turn).
 *   THE EDIT   a save from the window → `artifacts.noteEdit({sessionId, host, path, summary})` — a FREE next-turn note
 *              (src/server/artifact-registry.js; a registry-owned row is `touch`ed first: by: user, edits+1, the card patched).
 * THE OWNER = `artifacts.ownerOf({host, path})` (the registry's row) else the window's `from` chat (a live session);
 * none ⇒ `no_owner` by name (the strip says "open this document from a chat") — never a silent drop.
 * Gate: scripts/test-doc-model.mjs §6 (the engine over stub senders) + scripts/test-doc-window.mjs (heavy).
 */
const M = require('../doc-model.js');
const { toAgentText: agentText } = require('../peer-text.js');
const { addressableId } = require('../claude-lock-capture.js');

const DOC_COMMENT_FROM = 'Doc comments';
const SUMMARY_MAX = 400;
const STATUS = Object.freeze({ bad_path: 400, empty: 400, too_many: 400, bad_summary: 400, no_owner: 409, no_conversation: 409, send_failed: 502 });
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
const hostOf = (h) => (h && h !== 'local' ? String(h) : null);
const docPath = (p) => typeof p === 'string' && p.startsWith('/') && M.isDocPath(p);

function create({ activeSessions = new Map(), getDeliver = () => null, sendUserInput = null, artifacts = null, now = () => Date.now(), log = () => { } } = {}) {
  /** The conversation that owns the file: the registry's row, else the window's `from` chat. → {sessionId, conversationId, via} | null */
  function ownerOf({ host = null, path, from = '' } = {}) {
    let row = null;
    try { row = artifacts && typeof artifacts.ownerOf === 'function' ? artifacts.ownerOf({ host: hostOf(host), path }) : null; } catch (e) { log('[doc] ownerOf failed:', e.message); }
    if (row && (row.sessionId || row.conversationId)) return { sessionId: row.sessionId ? String(row.sessionId) : null, conversationId: row.conversationId ? String(row.conversationId) : null, via: 'registry' };
    const s = from ? activeSessions.get(String(from)) : null;
    return s ? { sessionId: String(from), conversationId: addressableId(s) || null, via: 'from' } : null;
  }
  /** The session to type into: the owner's while it lives, else (a resume mints a new id) the conversation's live one, a chat first. */
  function liveSessionFor(owner) {
    if (owner.sessionId && activeSessions.has(owner.sessionId)) return owner.sessionId;
    let any = null;
    if (owner.conversationId) for (const [id, s] of activeSessions) if (s && addressableId(s) === owner.conversationId) { if (s.mode === 'chat') return id; any = any || id; }
    return any || owner.sessionId;
  }
  /** The strip's notes → the fewest messages (M.commentsBatches), IN ORDER through ONE door: THE typing sender (one call
   *  per message; the CLI queues them mid-turn), else the stash (one entry per message; the drain keeps insertion order).
   *  → {ok, delivered:'sent'|'stashed', count, messages, sent, clipped, …} | fail(code, why, {sent}) — `sent` = the items
   *  that went out before the message that failed, so the strip keeps only the rest. */
  function comments({ host = null, path, from = '', items } = {}) {
    const v = M.commentsBatches(path, items);
    if (!v.ok) return fail(v.code, v.why);
    const owner = ownerOf({ host, path, from });
    if (!owner) return fail('no_owner', 'open this document from a chat to send comments to it');
    const lines = v.batches.map((b) => agentText(b.text, { kind: 'block', max: M.LIMITS.messageBytes }));
    const done = { count: v.count, messages: lines.length, sent: v.count, clipped: v.clipped };
    const sessionId = liveSessionFor(owner);
    const msgIds = [];
    let sent = 0;
    for (let k = 0; k < lines.length; k++) {
      const r = sessionId && typeof sendUserInput === 'function' ? sendUserInput(sessionId, lines[k], { msgId: `${now()}-doc${lines.length > 1 ? '-' + (k + 1) : ''}`, origin: 'doc-comment' }) : { ok: false, code: 'no_session' };
      if (r && r.ok) { msgIds.push(r.msgId); sent += v.batches[k].count; continue; }
      if (k > 0 || !r || (r.code !== 'no_session' && r.code !== 'not_chat')) return fail((r && r.code) || 'send_failed', (r && r.error) || 'the comments were not sent', { sent });
      break;   // the first message found no typing session ⇒ every message waits in the stash
    }
    if (msgIds.length === lines.length) return { ok: true, delivered: 'sent', msgId: msgIds[0], msgIds, ...done, text: lines.join('\n\n') };
    const s = sessionId ? activeSessions.get(sessionId) : null;
    const cid = owner.conversationId || (s ? addressableId(s) : null);
    if (!cid) return fail('no_conversation', 'this conversation is not running and has no id yet — open its chat and send the comments there');
    const deliver = getDeliver();
    if (!deliver || typeof deliver.stashFor !== 'function') return fail('send_failed', 'the conversation is not running and its waiting queue is unavailable');
    let stored = true;
    for (let k = 0; k < lines.length; k++) {
      let st;
      try { st = deliver.stashFor(cid, { source: 'doc-comment', kind: 'peer', fromName: DOC_COMMENT_FROM, text: lines[k] }); }
      catch (e) { return fail('send_failed', e.message, { sent }); }
      if (st && st.stored === false) stored = false;
      sent += v.batches[k].count;
    }
    return { ok: true, delivered: 'stashed', stored, conversationId: cid, ...done, text: lines.join('\n\n') };
  }
  /** A save from the window → the registry's free next-turn note to the owner. */
  function edited({ host = null, path, from = '', summary } = {}) {
    if (!docPath(path)) return fail('bad_path', 'name the markdown file by its absolute path');
    const sum = String(summary == null ? '' : summary).replace(/\s+/g, ' ').trim().slice(0, SUMMARY_MAX);
    if (!sum) return fail('bad_summary', 'say what changed');
    const owner = ownerOf({ host, path, from });
    if (!owner) return fail('no_owner', 'open this document from a chat so it learns about your edits');
    if (!artifacts || typeof artifacts.noteEdit !== 'function') return fail('send_failed', 'the edit note is unavailable');
    try {
      const a = { sessionId: liveSessionFor(owner), host: hostOf(host), path, summary: sum };
      // the registry owns the row ⇒ its user save (by: user, edits+1, the card patched in place) carries the note; else the note alone
      const t = owner.via === 'registry' && typeof artifacts.touch === 'function' ? artifacts.touch(a) : null;
      const noted = t && t.ok ? t.noted : artifacts.noteEdit(a);
      return noted === false || (noted && noted.ok === false) ? fail((noted && noted.code) || 'send_failed', (noted && noted.error) || 'the edit note was not kept') : { ok: true, delivered: 'stashed', row: !!(t && t.ok) };
    } catch (e) { return fail('send_failed', e.message); }
  }
  return { ownerOf, comments, edited, STATUS };
}

module.exports = { create, STATUS, DOC_COMMENT_FROM };

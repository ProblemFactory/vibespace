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
 * THE OWNER = `artifacts.ownerOf({host, path})` (the registry's row) else the window's `from` chat (a live session),
 * else (lane doc-comments-stopped-owner, B-b51a) the conversation either of those named while it lived — a STOPPED
 * owner is an addressee: its comments wait in its stash and land at its next turn (ownerMemo below);
 * none ⇒ `no_owner` by name, which now means no conversation at all (the strip says so) — never a silent drop.
 * Gate: scripts/test-doc-model.mjs §6 (the engine over stub senders) + scripts/test-doc-stopped-owner.mjs (a stopped
 * owner, the memo on disk, the drain) + scripts/test-doc-window.mjs (heavy).
 */
const fs = require('fs');
const nodePath = require('path');
const M = require('../doc-model.js');
const { toAgentText: agentText } = require('../peer-text.js');
const { addressableId } = require('../claude-lock-capture.js');

const DOC_COMMENT_FROM = 'Doc comments';
const SUMMARY_MAX = 400;
const STATUS = Object.freeze({ bad_path: 400, empty: 400, too_many: 400, bad_summary: 400, no_owner: 409, no_conversation: 409, send_failed: 502 });
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
const hostOf = (h) => (h && h !== 'local' ? String(h) : null);
const docPath = (p) => typeof p === 'string' && p.startsWith('/') && M.isDocPath(p);
const NO_OWNER = 'no conversation goes with this document — open it from a chat to comment';
const MEMO_CAP = 500;

/** THE OWNERS A STOP OUTLIVES (lane doc-comments-stopped-owner, B-b51a — measured: an exit takes the session out of
 *  activeSessions AND unlinks its data/session-meta file, src/server/session-stdout.js onExit, so a window opened from a
 *  chat that later stopped named a session nobody knew and its comments were refused as `no_owner`). Every owner the
 *  engine resolves while it lives is remembered: the window's `from` session → its conversation, a registry-owned
 *  document → its conversation. Durable in data/doc-owners.json (tmp+rename, written only when a mapping is new or
 *  moves; the oldest fall off past MEMO_CAP each), so a stop — or a restart after it — keeps the addressee. Ids and
 *  paths only, never words. A session never seen live stays unknown ⇒ `no_owner`. */
function ownerMemo({ dataDir = null, log = () => { } } = {}) {
  const file = dataDir ? nodePath.join(dataDir, 'doc-owners.json') : null;
  let m = null;
  const load = () => {
    if (m) return m;
    m = { s: {}, d: {} };
    if (file) try { const j = JSON.parse(fs.readFileSync(file, 'utf-8')); if (j && typeof j === 'object') m = { s: j.s && typeof j.s === 'object' ? j.s : {}, d: j.d && typeof j.d === 'object' ? j.d : {} }; } catch (e) { if (e.code !== 'ENOENT') log('[doc] doc-owners.json unreadable:', e.message); }
    return m;
  };
  const trim = (o) => { const k = Object.keys(o); if (k.length > MEMO_CAP) k.sort((a, b) => (o[a].at || 0) - (o[b].at || 0)).slice(0, k.length - MEMO_CAP).forEach((x) => delete o[x]); };
  const save = () => {
    if (!file) return;
    try { fs.mkdirSync(nodePath.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(m)); fs.renameSync(file + '.tmp', file); }
    catch (e) { log('[doc] doc-owners.json not written:', e.message); }
  };
  /** A live owner → remembered (sid → cid; docKey → {cid, sid}). Writes only when something moved. */
  function note({ sessionId, conversationId }, docKey = null, at = Date.now()) {
    if (!conversationId) return;
    load();
    let moved = false;
    if (sessionId && (!m.s[sessionId] || m.s[sessionId].cid !== conversationId)) { m.s[sessionId] = { cid: conversationId, at }; trim(m.s); moved = true; }
    if (docKey && (!m.d[docKey] || m.d[docKey].cid !== conversationId || m.d[docKey].sid !== (sessionId || null))) { m.d[docKey] = { cid: conversationId, sid: sessionId || null, at }; trim(m.d); moved = true; }
    if (moved) save();
  }
  /** The conversation a stopped owner had: the document's registry owner first (the live order), else the window's `from`. */
  function of({ from = '', docKey = null } = {}) {
    load();
    const d = docKey && m.d[docKey];
    if (d && d.cid) return { sessionId: d.sid || null, conversationId: d.cid };
    const s = from && m.s[from];
    return s && s.cid ? { sessionId: String(from), conversationId: s.cid } : null;
  }
  return { note, of, file };
}

function create({ activeSessions = new Map(), getDeliver = () => null, sendUserInput = null, artifacts = null, dataDir = null, now = () => Date.now(), log = () => { } } = {}) {
  const memo = ownerMemo({ dataDir, log });
  const docKeyOf = (host, path) => (hostOf(host) || 'local') + '\u0001' + String(path || '');
  /** The conversation that owns the file: the registry's row, else the window's `from` chat, else (stopped) the one
   *  either of those named while it lived. → {sessionId, conversationId, via: 'registry'|'from'|'stopped'} | null */
  function ownerOf({ host = null, path, from = '' } = {}) {
    let row = null;
    try { row = artifacts && typeof artifacts.ownerOf === 'function' ? artifacts.ownerOf({ host: hostOf(host), path }) : null; } catch (e) { log('[doc] ownerOf failed:', e.message); }
    if (row && (row.sessionId || row.conversationId)) {
      const o = { sessionId: row.sessionId ? String(row.sessionId) : null, conversationId: row.conversationId ? String(row.conversationId) : null, via: 'registry' };
      memo.note({ sessionId: o.sessionId, conversationId: o.conversationId || addressableId(o.sessionId && activeSessions.get(o.sessionId)) }, docKeyOf(host, path), now());
      return o;
    }
    const s = from ? activeSessions.get(String(from)) : null;
    if (s) { const o = { sessionId: String(from), conversationId: addressableId(s) || null, via: 'from' }; memo.note(o, null, now()); return o; }
    const was = memo.of({ from: from ? String(from) : '', docKey: docKeyOf(host, path) });
    return was ? { ...was, via: 'stopped' } : null;
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
    if (!owner) return fail('no_owner', NO_OWNER);
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
    if (!owner) return fail('no_owner', NO_OWNER);
    if (!artifacts || typeof artifacts.noteEdit !== 'function') return fail('send_failed', 'the edit note is unavailable');
    try {
      const a = { sessionId: liveSessionFor(owner), conversationId: owner.conversationId, host: hostOf(host), path, summary: sum }; // conversationId: a stopped owner's note goes to its stash
      // the registry owns the row ⇒ its user save (by: user, edits+1, the card patched in place) carries the note; else the note alone
      const t = owner.via === 'registry' && typeof artifacts.touch === 'function' ? artifacts.touch(a) : null;
      const noted = t && t.ok ? t.noted : artifacts.noteEdit(a);
      return noted === false || (noted && noted.ok === false) ? fail((noted && noted.code) || 'send_failed', (noted && noted.error) || 'the edit note was not kept') : { ok: true, delivered: 'stashed', row: !!(t && t.ok) };
    } catch (e) { return fail('send_failed', e.message); }
  }
  return { ownerOf, comments, edited, STATUS, memoFile: memo.file };
}

module.exports = { create, ownerMemo, STATUS, DOC_COMMENT_FROM, NO_OWNER };

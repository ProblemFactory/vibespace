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
 * THE OWNER = `artifacts.ownerOf({host, path, prefer: from})` (the registry's row — the window's own `from` conversation when
 * ITS registry holds the file, else the newest holder: B-b0e3, two writers) else the window's `from` chat (a live session),
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
const SR = require('../store-read.js');
const HOLD = require('../store-read-hold.js');   // r3332: data/doc-owners.json under the store-read law (the family's helper)

const DOC_COMMENT_FROM = 'Doc comments';
const SUMMARY_MAX = 400;
const STATUS = Object.freeze({ bad_path: 400, empty: 400, too_many: 400, bad_summary: 400, no_owner: 409, no_conversation: 409, rewind_out: 409, send_failed: 502, doc_owners_unread: 503 });
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
const hostOf = (h) => (h && h !== 'local' ? String(h) : null);
const docPath = (p) => typeof p === 'string' && p.startsWith('/') && M.isDocPath(p);
const NO_OWNER = 'no conversation goes with this document — open it from a chat to comment';
const MEMO_CAP = 500;
const HOLDERS_CAP = 20;   // B-b0e3's remainder: the conversations remembered holding one document
// THE STORE-READ LAW (主开发 r3332; the family's helper src/store-read-hold.js): the release read ANY failure of data/doc-owners.json as an
// empty memo and the next note — every new holder a lookup sees — wrote it over: who owned each document window was lost, and a
// comment on a stopped owner's window was refused `no_owner`. Now the memo makes its ONE read at its start: unreadable ⇒ HELD
// (nothing is written over it; no note, no holder, no trim reaches it; it is read again off the main loop and lifts with no restart);
// torn bytes ⇒ kept aside ONCE as doc-owners.json.corrupt-<mark>, then it starts empty and says so where a person looks. A lookup
// that would fall to the memo while it is held answers THE HOLD by name (`doc_owners_unread`, 503), never «no owner».
// WHO REMOVES BY ITS SILENCE: nobody — the memo's own trim drops its oldest rows past its caps (by age, never by the file's
// silence), and no other reader of the tree reads this file (searched: src/ names doc-owners.json in this module alone).
const OWNERS_CODE = 'doc_owners_unread';
const OWNERS_KEY = 'VibeSpace cannot read the list of who owns each document window right now — nothing was changed and no comment was sent. It reads the list again by itself every few minutes: send again then.';
const OWNERS_TORN_KEY = 'The list of who owns each document window was damaged; its damaged bytes are kept beside it as {name}. Open this document from its chat again to comment on it.';
const memoShape = (j) => !!j && typeof j === 'object' && !Array.isArray(j);

/** THE OWNERS A STOP OUTLIVES (lane doc-comments-stopped-owner, B-b51a — measured: an exit takes the session out of
 *  activeSessions AND unlinks its data/session-meta file, src/server/session-stdout.js onExit, so a window opened from a
 *  chat that later stopped named a session nobody knew and its comments were refused as `no_owner`). Every owner the
 *  engine resolves while it lives is remembered: the window's `from` session → its conversation, a registry-owned
 *  document → its conversation. Durable in data/doc-owners.json (the store writer's, written only when a mapping is new or
 *  moves; the oldest fall off past MEMO_CAP each), so a stop — or a restart after it — keeps the addressee. Ids and
 *  paths only, never words. A session never seen live stays unknown ⇒ `no_owner`. */
function ownerMemo({ dataDir = null, log = () => { }, writer = null } = {}) {
  const file = dataDir ? nodePath.join(dataDir, 'doc-owners.json') : null;
  const fromRaw = (j) => ({ s: j.s && typeof j.s === 'object' ? j.s : {}, d: j.d && typeof j.d === 'object' ? j.d : {}, h: j.h && typeof j.h === 'object' ? j.h : {} });
  let m = { s: {}, d: {}, h: {} };
  // THE ONE READ, at the memo's start (r3332): answered through the store-read law, handed to the family's hold
  const hold = file ? HOLD.create({
    file, valid: memoShape, code: 'doc_owners_unread', aside: (mark) => file + '.corrupt-' + mark,
    words: (h) => `VibeSpace cannot read the list of who owns each document window right now (${h.code}); it reads it again by itself every few minutes — nothing is written over it, and a comment waits for it`,
    log: (s) => log('[doc] ' + s),
    onLift: (v) => { m = v ? fromRaw(v) : { s: {}, d: {}, h: {} }; },   // lifted with no restart: the file's rows (torn: empty, its bytes kept aside)
  }) : null;
  if (file) { let read; try { read = { text: fs.readFileSync(file, 'utf-8') }; } catch (error) { read = { error }; }
    const a0 = SR.storeAnswer(read, { valid: memoShape });
    if (hold.start(a0) === 'data') m = fromRaw(a0.value); }
  const isHeld = () => !!(hold && hold.held());
  const load = () => m;
  const trim = (o) => { const k = Object.keys(o); if (k.length > MEMO_CAP) k.sort((a, b) => (o[a].at || 0) - (o[b].at || 0)).slice(0, k.length - MEMO_CAP).forEach((x) => delete o[x]); };
  // B-574d (r4725, lane lg-group-parents): data/doc-owners.json through THE STORE WRITER (src/store-writer.js: queued, off the main
  // loop, atomic, synced) — its own unsynced temp + rename on the loop is gone. Written at a cadence (every lookup that sees an owner
  // or a holder move); the bytes are made AT THE WRITE from memory (the latest memo: a burst is one write). A failed write is the
  // writer's own line and stays owed (written again). Held: nothing is asked (nothing written over the unread file).
  const W = () => writer || require('../store-writer.js').storeWriter();
  function save() {
    if (!file || (hold && !hold.writable('a document owner noted'))) return;   // held: nothing is written over the unread file
    try { W().dirty(file, { name: 'doc-owners.write', makeDir: true, produce: () => JSON.stringify(m) }); }   // store-timing's row (src/timed-sync.js)
    catch (e) { log('[doc] doc-owners.json not written:', e.message); }
  }
  /** A live owner → remembered (sid → cid; docKey → {cid, sid}). Writes only when something moved. */
  function note({ sessionId, conversationId }, docKey = null, at = Date.now()) {
    if (!conversationId || isHeld()) return;   // held: no note reaches the memo (its lift loads the file's own rows)
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
  /** B-b0e3's remainder: every conversation SEEN holding a document while it lived (docKey → {at, c: {cid: at}}), so a window whose
   *  own conversation stopped still reaches it when that conversation held the file. Bounded: MEMO_CAP documents, HOLDERS_CAP each. */
  function noteHolders(docKey, cids = [], at = Date.now()) {
    const list = (cids || []).filter(Boolean).map(String);
    if (!docKey || !list.length || isHeld()) return;   // held: the holders a lookup sees are not noted over the unread file
    load();
    const e = m.h[docKey] || (m.h[docKey] = { at, c: {} });
    let moved = false;
    for (const c of list) if (!e.c[c]) { e.c[c] = at; moved = true; }
    const ks = Object.keys(e.c);
    if (ks.length > HOLDERS_CAP) { ks.sort((a, b) => e.c[a] - e.c[b]).slice(0, ks.length - HOLDERS_CAP).forEach((k) => delete e.c[k]); moved = true; }
    if (moved) { e.at = at; trim(m.h); save(); }
  }
  /** The conversation a session id named while it lived (a window's `from`), if this memo saw it. */
  const convOf = (sid) => { load(); const s = sid && m.s[sid]; return s && s.cid ? s.cid : null; };
  const held = (docKey, cid) => { load(); const e = docKey && m.h[docKey]; return !!(e && cid && e.c[cid]); };
  /** THE HOLD where a person looks (r3332): null while the memo reads; held ⇒ { code, words, i18n }; after a torn lift ⇒ { torn, copy, i18n } */
  function hold_() {
    if (isHeld()) return { code: OWNERS_CODE, words: hold.words(), i18n: { key: OWNERS_KEY } };
    const tn = hold && typeof hold.torn === 'function' ? hold.torn() : null;
    return tn && tn.copy ? { torn: true, copy: nodePath.basename(String(tn.copy)), i18n: { key: OWNERS_TORN_KEY, params: { name: nodePath.basename(String(tn.copy)) } } } : null;
  }
  return { note, of, noteHolders, convOf, held, file, hold: hold_, stop: () => { if (hold && typeof hold.stop === 'function') hold.stop(); } };
}

function create({ activeSessions = new Map(), getDeliver = () => null, sendUserInput = null, artifacts = null, dataDir = null, now = () => Date.now(), log = () => { }, writer = null } = {}) {
  const memo = ownerMemo({ dataDir, log, writer });
  const docKeyOf = (host, path) => (hostOf(host) || 'local') + '\u0001' + String(path || '');
  /** The conversation that owns the file: the registry's row, else the window's `from` chat, else (stopped) the one
   *  either of those named while it lived. → {sessionId, conversationId, via: 'registry'|'from'|'stopped'} | null */
  function ownerOf({ host = null, path, from = '' } = {}) {
    const docKey = docKeyOf(host, path);
    // B-b0e3's remainder: every LIVE holder of the document is remembered by its conversation, so a window whose own conversation
    // STOPPED reaches it (its stash, or its resumed session) when that conversation held the file — before the newest live holder
    try {
      const sids = artifacts && typeof artifacts.holdersOf === 'function' ? artifacts.holdersOf({ host: hostOf(host), path }) || [] : [];
      memo.noteHolders(docKey, sids.map((sid) => addressableId(activeSessions.get(String(sid)))).filter(Boolean), now());
    } catch (e) { log('[doc] holdersOf failed:', e.message); }
    if (from && !activeSessions.has(String(from))) {
      const cid = memo.convOf(String(from));
      if (cid && memo.held(docKey, cid)) return { sessionId: String(from), conversationId: cid, via: 'stopped' };
    }
    let row = null;
    try { row = artifacts && typeof artifacts.ownerOf === 'function' ? artifacts.ownerOf({ host: hostOf(host), path, prefer: from ? String(from) : null }) : null; } catch (e) { log('[doc] ownerOf failed:', e.message); }
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
  /** NO OWNER FOUND (r3332): while the memo is HELD the hold BY NAME (503 — the stopped owner may be in the unread file: nothing is
   *  sent, the strip keeps its notes), never «no owner»; after a torn lift «no owner» says where the damaged bytes are kept */
  function noOwner() {
    const h = memo.hold();
    if (h && h.code) return fail(h.code, h.words, { i18n: h.i18n });
    if (h && h.torn) return fail('no_owner', `${NO_OWNER} (the list of who owns each document window was damaged; its damaged bytes are kept as ${h.copy})`, { i18n: h.i18n });
    return fail('no_owner', NO_OWNER);
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
    if (!owner) return noOwner();
    const lines = v.batches.map((b) => agentText(b.text, { kind: 'block', max: M.LIMITS.messageBytes }));
    const done = { count: v.count, messages: lines.length, sent: v.count, clipped: v.clipped };
    const sessionId = liveSessionFor(owner);
    const msgIds = [];
    let sent = 0;
    for (let k = 0; k < lines.length; k++) {
      const r = sessionId && typeof sendUserInput === 'function' ? sendUserInput(sessionId, lines[k], { msgId: `${now()}-doc${lines.length > 1 ? '-' + (k + 1) : ''}`, origin: 'doc-comment', door: 'enter' }) : { ok: false, code: 'no_session' };
      if (r && r.ok) { msgIds.push(r.msgId); sent += v.batches[k].count; continue; }
      if (k > 0 || !r || (r.code !== 'no_session' && r.code !== 'not_chat' && r.code !== 'attach_failed')) return fail((r && r.code) || 'send_failed', (r && r.error) || 'the comments were not sent', { sent, ...(r && r.i18n ? { i18n: r.i18n } : {}) });
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
    if (!owner) return noOwner();
    if (!artifacts || typeof artifacts.noteEdit !== 'function') return fail('send_failed', 'the edit note is unavailable');
    try {
      const a = { sessionId: liveSessionFor(owner), conversationId: owner.conversationId, host: hostOf(host), path, summary: sum }; // conversationId: a stopped owner's note goes to its stash
      // the registry owns the row ⇒ its user save (by: user, edits+1, the card patched in place) carries the note; else the note alone
      const t = owner.via === 'registry' && typeof artifacts.touch === 'function' ? artifacts.touch(a) : null;
      const noted = t && t.ok ? t.noted : artifacts.noteEdit(a);
      return noted === false || (noted && noted.ok === false) ? fail((noted && noted.code) || 'send_failed', (noted && noted.error) || 'the edit note was not kept') : { ok: true, delivered: 'stashed', row: !!(t && t.ok) };
    } catch (e) { return fail('send_failed', e.message); }
  }
  return { ownerOf, comments, edited, STATUS, memoFile: memo.file, ownersHold: () => memo.hold(), stop: () => memo.stop() };
}

module.exports = { create, ownerMemo, STATUS, DOC_COMMENT_FROM, NO_OWNER };

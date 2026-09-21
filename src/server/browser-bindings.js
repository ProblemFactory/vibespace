'use strict';
/**
 * THE CONVERSATION → BROWSER KEY BINDING, IN A STORE THAT OUTLIVES THE WEBUI
 * SESSION (docs/design-agent-browser-v2.zh.md §3.2.1, P0 r5) — ORCH.
 *
 * WHY THIS FILE EXISTS. §3.2.1's continuity ladder promises that a RESUMED
 * conversation keeps its browser key (`vs-<browserKey>` survives resume), and
 * rounds 1–4 recovered that key from `data/session-meta` — the join
 * `reading-repair._sessionKeyMap` already offered. That join reads exactly the
 * files the product's OWN Terminate → Resume flow deletes: ws-handler's kill
 * case and session-stdout's pty-exit path both UNLINK the meta file (with an
 * in-memory tombstone only), so every resume of a STOPPED conversation found
 * nothing, minted a new key, warned `resume-unknown` and orphaned the previous
 * namespace's daemon and chromium until the idle timeout — MEASURED on a real
 * worktree server (session 1 `bk-c4de4a0c`, ws kill ⇒ 0 meta files name the
 * conversation, resume ⇒ `bk-fa78e54c`). The rung fired only while the
 * previous webui session's meta still existed, i.e. never in the flow it was
 * written for.
 *
 * THE FIX IS A RECORD WHOSE LIFETIME IS THE CONVERSATION'S, not the session's:
 * `data/browser-env/bindings.json` = `{ v: 1, byConversation: { <sid>: { key,
 * at } } }`, written at the ONE meta choke point (`session-stdout.
 * writeSessionMeta` — every producer of a meta record passes through it, so a
 * conversation id that arrives late through an init frame or a lock file is
 * bound the moment the record carries both facts), never deleted by a kill,
 * and consulted FIRST by `browser-env.priorKeyFor` (the meta join stays as the
 * second rung for a store that predates this file).
 *
 * A RECORD MAY NOT BIND THE CONVERSATION IT WAS FORKED FROM (r6, the round-5
 * verifier's HIGH, reproduced end to end). A claude fork is created with
 * `claudeSessionId` = the PARENT's id (ws-create resumes the parent with
 * `--fork-session`; the fork's own id is announced by the CLI's init frame
 * later and adopted then), and a codex fork the same way (the wrapper's
 * `thread/fork` reports the new thread id in a later `wrapper_meta`). Both
 * mint a NEW browser key (D15). So the fork's FIRST meta write carries
 * {<parent id>, <fork key>} — and r5's hook, which asked only "does this
 * record carry a conversation id and a key", bound the PARENT to the FORK's
 * browser. Measured on a real worktree server: resume X → `bk-46105b3b`, kill,
 * fork X → `bk-7f667dbf`, and 500 ms later `bindings[X].key` = `bk-7f667dbf`;
 * kill the fork, resume X → the parent's process carries the FORK's
 * `AGENT_BROWSER_SESSION` (two conversations on one browser — `close --all`
 * from either closes the other's tabs, the incident P0 exists to stop, D15
 * reversed), the parent's own daemon + chromium orphaned under its old
 * namespace, and NOT ONE journal line (rung 1 answered confidently). Note the
 * claim r5 made here — "a fork binds under ITS OWN new id" — was true of the
 * ADOPTION write and false of every write before it; and `forkRequested` is
 * not the fact to ask, because it stays `true` in the file after a claude
 * adoption (the adoption write spreads the old record and never re-lists it)
 * and for ever on a codex or opencode fork (nothing clears it).
 *
 * TWO LAYERS, each with its own control (test-browser-profiles §⑳,
 * test-browser-continuity §②):
 *   ① THE RULE, at the choke point: the record SAYS which conversation it was
 *     forked from (`forkSourceId`, written by ws-create's first meta write and
 *     carried by every later write's spread — `data.forkedFromId || data.
 *     resumeId` under `data.fork`, harness-neutral: an opencode fork is minted
 *     BEFORE the spawn so its record names the fork's own id ≠ the source and
 *     binds at once, exactly as today), and `bindableIdOf(meta)` answers ''
 *     while the record's conversation id IS that source. After the harness
 *     adopts the fork's own id the record names a different id and binds it.
 *   ② THE BELT, in the store: a binding is written ONCE per conversation. A
 *     different key for a conversation that already has one is REFUSED and
 *     journalled (once per pair; counted as `browser-binding-move-refused`).
 *     A refusal is never a lost binding: the conversation keeps the key it
 *     had.
 *
 * A KEY IS BOUND TO THE CONVERSATION IT WAS DECIDED FOR (r7, the round-6
 * verifier's MEDIUM — the IMPLICIT fork). A `claude --resume X` whose
 * conversation is LOCKED by another live claude silently forks to a NEW id Y
 * (claude's own double-writer protection; codex/ACP can re-mint on resume
 * too), and the consumers ADOPT it: the record now names Y beside the key K
 * that `browserKeyFor` decided for X, and r6's rule — which asks only "is
 * this the conversation you were forked FROM" — bound Y → K. Two
 * conversations on one browser for ever, with no fork flag and no journal
 * line. So the origin meta write also states `browserKeyFor` = the
 * conversation the key was DECIDED for (a resume's resumeId; a fork NEVER —
 * its key belongs to the id the harness will announce; a new session NONE —
 * the first announced id is the one), `bindableIdOf` refuses any other id,
 * and the store's belt refuses to bind a NEW conversation to a key already
 * bound to a different one (`browser-binding-share-refused`, once per pair).
 * The choke point SAYS it once per (session, id): the running process keeps
 * the browser it spawned with (a spawn env is immutable) and Y's next resume
 * mints its own key instead of inheriting X's cookies.
 *
 * SHAPE RULES. The key is `claudeSessionId || backendSessionId` — the same
 * rule `_sessionKeyMap` uses, so the two rungs can never disagree about which
 * id a conversation is filed under. Bounded: `MAX_BINDINGS` newest
 * conversations survive a prune, because the file is read on every resume and
 * a conversation that has not been resumed in a thousand others is not the one
 * being resumed now. Atomic (tmp + rename), 0600 like every file its sibling
 * module writes. The recorder keeps a change-detection cache so the ~dozens of
 * meta writes a session makes per turn cost NO disk write once the binding is
 * on disk; the reader re-reads the file per lookup (one resume = one read).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE_NAME = 'bindings.json';
const DIR_REL = 'browser-env';           // the same directory browser-env.js owns (its ENV_DIR)
const MAX_BINDINGS = 4096;
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const KEY_RE = /^bk-[0-9a-f]{8}$/;
const REFUSAL_METRIC = 'browser-binding-move-refused';
const SHARE_METRIC = 'browser-binding-share-refused';   // r7: a NEW conversation offered a key another one holds
const IMPLICIT_FORK_METRIC = 'browser-binding-implicit-fork'; // r7: the harness announced an id the key was not decided for

/** The one rule for "which id is this conversation filed under" — shared in
 *  spirit with `reading-repair._sessionKeyMap` (claude first, then the
 *  backend's own id), spelled here so a meta record can be asked directly. */
function conversationIdOf(meta) {
  if (!meta || typeof meta !== 'object') return '';
  const sid = meta.claudeSessionId || meta.backendSessionId;
  return typeof sid === 'string' && sid ? sid : '';
}

/** The id a meta record may BIND (r6): its conversation id, unless that id is
 *  the one the session was asked to fork FROM. A claude/codex fork carries the
 *  PARENT's id until the harness announces the fork's own, so the record names
 *  a conversation that is not this session's — and a binding written from it
 *  would move the parent onto the fork's browser. `forkSourceId` is the
 *  record's own statement; a record that makes none binds as before. */
function bindableIdOf(meta) {
  const sid = conversationIdOf(meta);
  if (!sid) return '';
  const src = meta.forkSourceId;
  if (typeof src === 'string' && src && src === sid) return '';
  // r7: the key was DECIDED for one conversation; a record that names another
  // (an implicit fork adopted by the consumer) may not bind it to that key.
  const decided = keyDecidedFor(meta);
  if (decided && decided !== sid) return '';
  return sid;
}

/** The conversation a record's browser key was DECIDED for (r7): ws-create's
 *  origin write states it for a RESUME (`browserKeyFor` = resumeId) and every
 *  later write spreads it. '' when the record makes no statement — a new
 *  session (its first announced id is the one) or a fork (its key belongs to
 *  the id the harness will announce; `forkSourceId` guards the parent). */
function keyDecidedFor(meta) {
  const v = meta && typeof meta === 'object' ? meta.browserKeyFor : '';
  return typeof v === 'string' && v ? v : '';
}

function create({ dataDir, log = console } = {}) {
  if (!dataDir) throw new Error('browser-bindings: dataDir required');
  const dir = path.join(dataDir, DIR_REL);
  const file = path.join(dir, FILE_NAME);
  // Change-detection cache for the RECORDER: sid → key last known on disk (as
  // written by this process). A miss means "read the file and compare".
  const known = new Map();
  // Refusals already journalled, `sid\0key` — the fork session that would have
  // moved a binding writes its meta dozens of times per turn, and one line per
  // pair says everything the next one would.
  const refused = new Set();
  // Implicit forks already journalled, `tag\0sid` (r7) — the adopted record is
  // re-written dozens of times per turn and says the same thing each time.
  const announced = new Set();

  function readAll() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw && typeof raw === 'object' && raw.byConversation && typeof raw.byConversation === 'object') return raw;
    } catch { }
    return { v: 1, byConversation: {} };
  }
  function writeAll(obj) {
    fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    try { if ((fs.statSync(dir).mode & 0o777) !== DIR_MODE) fs.chmodSync(dir, DIR_MODE); } catch { }
    const tmp = file + '.tmp-' + crypto.randomBytes(4).toString('hex');
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: FILE_MODE });
    fs.renameSync(tmp, file);
  }
  function prune(byConversation) {
    const entries = Object.entries(byConversation);
    if (entries.length <= MAX_BINDINGS) return byConversation;
    entries.sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    return Object.fromEntries(entries.slice(0, MAX_BINDINGS));
  }
  /** The belt (r6): a bound conversation keeps its key. Journalled once per
   *  (conversation, offered key), counted, never written. */
  function refuseMove(sid, cur, key) {
    const tag = sid + '\0' + key;
    if (!refused.has(tag)) {
      refused.add(tag);
      try { log.warn?.(`[browser] refused to move the browser binding of conversation ${sid.slice(0, 8)} from ${cur.key} to ${key} — a conversation's browser key is written once; the record that offered ${key} describes another conversation (a fork's, before its own id was announced) or a bug, and the parent keeps its browser`); } catch { }
      try { global.__vsMetric?.(REFUSAL_METRIC, 1); } catch { }
    }
    return false;
  }
  /** The belt's other half (r7): a key is bound to ONE conversation. A NEW
   *  conversation offered a key another one already holds is refused —
   *  journalled once per (conversation, key), counted, never written. */
  function refuseShare(sid, holder, key) {
    const tag = sid + '\0' + key;
    if (!refused.has(tag)) {
      refused.add(tag);
      try { log.warn?.(`[browser] refused to bind conversation ${sid.slice(0, 8)} to browser key ${key} — that key is already the browser of conversation ${holder.slice(0, 8)}; a key belongs to the conversation it was decided for (the record that offered it was adopted from an implicit fork or is a bug), and ${sid.slice(0, 8)} will mint its own key when it is next resumed`); } catch { }
      try { global.__vsMetric?.(SHARE_METRIC, 1); } catch { }
    }
    return false;
  }
  function holderOf(byConversation, key) {
    for (const [sid, v] of Object.entries(byConversation)) if (v && v.key === key) return sid;
    return '';
  }

  /**
   * SAY that a record named a conversation its key was not decided for (r7,
   * the implicit fork): once per (session tag, conversation), counted. Called
   * by the choke point when `bindableIdOf` answered '' — the fork-source case
   * is expected and transient (the harness announces the fork's id next), so
   * only the `browserKeyFor` mismatch is journalled. Returns true on the
   * first announcement.
   */
  function noteUnbound(meta, tag) {
    const sid = conversationIdOf(meta);
    const decided = keyDecidedFor(meta);
    if (!sid || !decided || decided === sid) return false;
    const k = String(tag || '') + '\0' + sid;
    if (announced.has(k)) return false;
    announced.add(k);
    try { log.warn?.(`[browser] ${tag || 'session'}: the harness announced conversation ${sid.slice(0, 8)} while its browser key ${String(meta.browserKey || '')} was decided for ${decided.slice(0, 8)} (an implicit fork — the resumed conversation was locked elsewhere, so the harness minted a new one). ${sid.slice(0, 8)} is NOT bound to that key: this process keeps the browser it spawned with, and the next resume of ${sid.slice(0, 8)} mints its own`); } catch { }
    try { global.__vsMetric?.(IMPLICIT_FORK_METRIC, 1); } catch { }
    return true;
  }

  /**
   * Bind `conversationId` → `key`. Returns true when the file was written,
   * false when nothing changed (or the inputs are not a conversation + key, or
   * the conversation is already bound to a DIFFERENT key — refused, r6 — or
   * the key is already another conversation's — refused, r7).
   * Never throws: a binding that cannot be written is journalled, and the
   * session it describes goes on — the meta write it rides is not held up.
   */
  function record(conversationId, key, { at = Date.now() } = {}) {
    const sid = typeof conversationId === 'string' ? conversationId : '';
    if (!sid || !KEY_RE.test(String(key || ''))) return false;
    if (known.get(sid) === key) return false;
    try {
      const all = readAll();
      const cur = all.byConversation[sid];
      if (cur && cur.key === key) { known.set(sid, key); return false; }
      if (cur && KEY_RE.test(String(cur.key || '')) && cur.key !== key) return refuseMove(sid, cur, key);
      const holder = holderOf(all.byConversation, String(key));
      if (holder && holder !== sid) return refuseShare(sid, holder, String(key));
      all.byConversation[sid] = { key: String(key), at };
      all.byConversation = prune(all.byConversation);
      writeAll(all);
      known.set(sid, key);
      return true;
    } catch (e) {
      try { log.warn?.(`[browser] could not record the browser key for conversation ${sid.slice(0, 8)}: ${e && e.message} — a later resume of it will mint a new key`); } catch { }
      return false;
    }
  }

  /** The bound key for a conversation, or '' — read off the FILE every time,
   *  because the writer may be another module instance (session-stdout's). */
  function lookup(conversationId) {
    const sid = typeof conversationId === 'string' ? conversationId : '';
    if (!sid) return '';
    const cur = readAll().byConversation[sid];
    return cur && KEY_RE.test(String(cur.key || '')) ? String(cur.key) : '';
  }

  /** Every bound key (for a sweeper that wants to know which keys a stopped
   *  conversation could still come back for). */
  function keys() {
    const out = new Set();
    for (const v of Object.values(readAll().byConversation)) if (v && KEY_RE.test(String(v.key || ''))) out.add(String(v.key));
    return out;
  }

  /** How many distinct (conversation, key) offers this instance refused — moves
   *  (r6) and shares (r7) — the production census of the shapes the choke-point
   *  rule exists to stop. */
  function refusals() { return refused.size; }
  /** How many (session, conversation) implicit-fork announcements were journalled (r7). */
  function implicitForks() { return announced.size; }

  return { record, lookup, keys, refusals, implicitForks, noteUnbound, conversationIdOf, bindableIdOf, keyDecidedFor, file, dir, MAX_BINDINGS };
}

module.exports = { create, conversationIdOf, bindableIdOf, keyDecidedFor, FILE_NAME, DIR_REL, MAX_BINDINGS, REFUSAL_METRIC, SHARE_METRIC, IMPLICIT_FORK_METRIC };

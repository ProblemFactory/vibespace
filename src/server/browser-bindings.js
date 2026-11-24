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
 * not the fact to ask, because it stayed `true` in the file after a claude
 * adoption (the adoption write spread the old record and never re-listed it —
 * re-listed `false` since the fork-group round 2, but older records keep it)
 * and stays `true` for ever on a codex or opencode fork (nothing clears it).
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

const SR = require('../store-read.js');
const HOLD = require('../store-read-hold.js');   // r3585 (B-f276 family's leftover): a failed or torn read engages the family's hold
const FILE_NAME = 'bindings.json';
const DIR_REL = 'browser-env';           // the same directory browser-env.js owns (its ENV_DIR)
const MAX_BINDINGS = 4096;
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const KEY_RE = /^bk-[0-9a-f]{8}$/;
const REFUSAL_METRIC = 'browser-binding-move-refused';
const SHARE_METRIC = 'browser-binding-share-refused';   // r7: a NEW conversation offered a key another one holds
const IMPLICIT_FORK_METRIC = 'browser-binding-implicit-fork'; // r7: the harness announced an id the key was not decided for
// ── r3585: THE STORE-READ LAW for the bindings (the family's leftover, its second file) ──
// The healthy road is as before: every call reads the file (this module's other instances in the hub write it — session-stdout's,
// the keeper's, the kept store's …), so no read is added. A read that FAILS or bytes that do not parse ENGAGE ONE HOLD for the file,
// shared by every instance (HELD below): while it stands no call reads the file again on the hub's loop — each answers «unknown» as
// r3054 made it (nothing ends, nothing is written over it, readers show no rows) — and the helper reads it again OFF the loop. LIFTED
// with a list: the calls read the file again, with no restart. LIFTED with NO list (torn bytes kept aside once, or the file gone after
// a failed read): the map is REBUILT from the conversations' own records (data/session-meta/*.json: browserKey + the conversation it
// was decided for — the resume's rung 2), read by ONE child with a bound, never on the loop; the rebuilt file carries `recoveredAt`
// (the per-row rule of r3590: a kept browser that STOOD at the recovery and that no rebuilt binding names never ends by that silence).
// A rebuild that does not finish holds the file again — never «rebuilt empty».
const BINDINGS_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !!v.byConversation && typeof v.byConversation === 'object' && !Array.isArray(v.byConversation);
const HELD = new Map();   // file → { hold, dataDir, rebuilding, recovered } — one per file, every instance's
const META_TIMEOUT_MS = 30 * 1000;
/** the child's script: every data/session-meta/*.json's binding facts → [[browserKey, claudeSessionId, backendSessionId, forkSourceId, browserKeyFor, mtimeMs]] */
const META_SRC = "const fs=require('fs'),p=require('path');const d=process.argv[1];let n=[];try{n=fs.readdirSync(d)}catch(e){if(e&&e.code==='ENOENT'){process.stdout.write('[]');process.exit(0)}process.stderr.write(String((e&&e.code)||'unreadable'));process.exit(3)}const o=[];const s=(v)=>typeof v==='string'?v.slice(0,200):'';for(const x of n){if(!x.endsWith('.json'))continue;try{const f=p.join(d,x);const m=JSON.parse(fs.readFileSync(f,'utf8'));if(m&&typeof m.browserKey==='string')o.push([s(m.browserKey),s(m.claudeSessionId),s(m.backendSessionId),s(m.forkSourceId),s(m.browserKeyFor),fs.statSync(f).mtimeMs])}catch(e){}}process.stdout.write(JSON.stringify(o))";
/** THE ONE WRITER of the file (every instance's record, and the rebuild): its folder 0700, the file 0600, tmp + rename */
function writeBindingsFile(file, obj) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  try { if ((fs.statSync(dir).mode & 0o777) !== DIR_MODE) fs.chmodSync(dir, DIR_MODE); } catch { }
  const tmp = file + '.tmp-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: FILE_MODE });
  fs.renameSync(tmp, file);
}
/** the hold of `file` (made once, at its first failed or torn read) */
function heldOf(file, { dataDir, log, listMetas, execFileImpl }) {
  let H = HELD.get(file);
  if (H) return H;
  H = { hold: null, dataDir, rebuilding: null, recovered: null, log, listMetas, execFileImpl, owed: new Map(), gen: 0 };   // owed: r3717 — the offers refused while held (sid → {key, at}, bounded)
  H.hold = HOLD.create({
    file, valid: BINDINGS_SHAPE, code: 'bindings_unread', aside: (mark) => file + '.corrupt-' + mark,
    words: (h) => `VibeSpace cannot read which browser belongs to which conversation right now (${h.code}); it reads it again by itself every few minutes. Nothing ends and nothing is written over it until it reads`,
    log: (s) => { try { log.warn?.('[browser] ' + s); } catch { } },
    onLift: (v, facts) => { if (!v) rebuildBindings(file, H, (facts && facts.setAside) || null); else if (H.owed.size) writeOwed(file, H, v); },   // r3717 (MUST 2): the refused offers written at a lift with data
  });
  HELD.set(file, H);
  return H;
}
function listMetaFacts(H) {
  const dir = path.join(H.dataDir, 'session-meta');
  if (typeof H.listMetas === 'function') { try { return Promise.resolve(H.listMetas(dir)).catch((e) => ({ ok: false, why: String((e && e.code) || 'failed') })); } catch (e) { return Promise.resolve({ ok: false, why: String((e && e.code) || 'failed') }); } }
  return new Promise((resolve) => {
    try {
      (H.execFileImpl || require('child_process').execFile)(process.execPath, ['-e', META_SRC, dir], { timeout: META_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
        if (err) return resolve({ ok: false, why: err.killed ? 'the records\' listing passed its bound' : String(err.code || 'failed') });
        try { const a = JSON.parse(String(stdout || '[]')); resolve(Array.isArray(a) ? { ok: true, rows: a } : { ok: false, why: 'no listing' }); } catch { resolve({ ok: false, why: 'no listing' }); }
      });
    } catch (e) { resolve({ ok: false, why: String((e && e.code) || 'spawn failed') }); }
  });
}
/** r3717 (MUST 2): the offers a held file refused, laid over `doc` by record()'s own rules (a conversation keeps its key; a key is ONE
 *  conversation's — the first holder keeps it) → the number laid; `doc` is changed in place */
function layOwed(H, doc) {
  let n = 0;
  for (const [sid, o] of H.owed) {
    const cur = doc.byConversation[sid];
    if (cur && KEY_RE.test(String(cur.key || ''))) continue;   // bound already (to it, or to another key: the first stays)
    if (Object.entries(doc.byConversation).some(([s2, v]) => s2 !== sid && v && v.key === o.key)) continue;   // another conversation's key
    doc.byConversation[sid] = { key: o.key, at: o.at }; n++;
  }
  H.owed.clear();
  return n;
}
function pruneDoc(doc) {
  const e = Object.entries(doc.byConversation);
  if (e.length > MAX_BINDINGS) { e.sort((a, b) => (b[1].at || 0) - (a[1].at || 0)); doc.byConversation = Object.fromEntries(e.slice(0, MAX_BINDINGS)); }
  return doc;
}
/** a lift WITH data after refused offers: they are written now (nothing ends by a binding refused while the file was held) */
function writeOwed(file, H, v) {
  const doc = { ...v, byConversation: { ...v.byConversation } };
  const n = layOwed(H, doc);
  if (!n) return;
  try { writeBindingsFile(file, pruneDoc(doc)); H.gen++; try { H.log.warn?.(`[browser] ${FILE_NAME} read again: ${n} binding(s) offered while it was held written now`); } catch { } }
  catch (e) { try { H.log.warn?.(`[browser] the bindings offered while ${FILE_NAME} was held could not be written (${(e && e.code) || 'failed'}) — each is offered again at its conversation's next record`); } catch { } }
}
/** THE REBUILD from the conversations' own records: each record's key bound to the conversation it may bind (bindableIdOf — a fork
 *  source or an implicit fork binds nothing), the newest record winning a key two name; written with `recoveredAt` */
function rebuildBindings(file, H, copy) {
  if (H.rebuilding && H.rebuilding.busy) return H.rebuilding.busy;
  H.rebuilding = { since: (H.rebuilding && H.rebuilding.since) || Date.now(), copy: copy || (H.rebuilding && H.rebuilding.copy) || null, busy: null };
  const r0 = H.rebuilding;
  r0.busy = (async () => {
    const r = await listMetaFacts(H);
    if (!r || !r.ok) {
      try { H.log.warn?.(`[browser] the conversations' records could not be listed to rebuild ${FILE_NAME} (${(r && r.why) || 'failed'}) — it stays HELD: nothing ends and nothing is written; it is tried again at its next read`); } catch { }
      H.rebuilding = null;
      H.hold.start({ state: 'unreadable', error: { code: 'rebuild-unfinished' } });
      return false;
    }
    const at = Date.now(), byKey = new Map();
    for (const row of r.rows) {
      if (!Array.isArray(row)) continue;
      const meta = { browserKey: row[0], claudeSessionId: row[1] || undefined, backendSessionId: row[2] || undefined, forkSourceId: row[3] || undefined, browserKeyFor: row[4] || undefined };
      const key = String(meta.browserKey || ''), sid = bindableIdOf(meta), t = Math.round(Number(row[5])) || at;
      if (!sid || !KEY_RE.test(key)) continue;
      const prev = byKey.get(key);
      if (!prev || t < prev.at) byKey.set(key, { sid, at: t });   // r3717: the FIRST holder keeps a key (record()'s rule)
    }
    const byConversation = {};
    for (const [key, v] of byKey) if (!byConversation[v.sid] || v.at < byConversation[v.sid].at) byConversation[v.sid] = { key, at: v.at };   // a conversation keeps its first key
    const doc = { v: 1, byConversation, recoveredAt: at };
    layOwed(H, doc); pruneDoc(doc);   // r3717: the offers refused meanwhile are true facts; bounded as record() bounds it
    try { writeBindingsFile(file, doc); } catch (e) {
      try { H.log.warn?.(`[browser] the rebuilt ${FILE_NAME} could not be written (${(e && e.code) || 'failed'}) — it stays HELD`); } catch { }
      H.rebuilding = null; H.hold.start({ state: 'unreadable', error: { code: 'rebuild-unwritten' } }); return false;
    }
    H.gen++;   // r3717: every instance's memory of «already recorded» is cleared (a binding the rebuild dropped is offered again)
    H.recovered = { n: Object.keys(doc.byConversation).length, copy: r0.copy ? path.basename(String(r0.copy)) : null, at };
    H.rebuilding = null;
    try { H.log.warn?.(`[browser] ${FILE_NAME} was rebuilt from the conversations' records: ${H.recovered.n} binding(s)${H.recovered.copy ? ` — the damaged copy is kept as ${H.recovered.copy}` : ''}`); } catch { }
    return true;
  })().finally(() => { r0.busy = null; });
  return r0.busy;
}

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

function create({ dataDir, log = console, listMetas = null, execFileImpl = null } = {}) {
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
  let knownGen = 0;   // r3717: the file's generation `known` was filled at
  const opts = { dataDir, log, listMetas, execFileImpl };   // r3585: the hold's and the rebuild's (shared per file)

  // r3054 (主开发 — the kept browsers' second door): UNKNOWN IS NOT EMPTY. The file's read in three states: 'ok' (its rows),
  // 'absent' (no file: a fresh instance — truly empty) and 'unknown' (a read that FAILED, or bytes that do not parse or are not the
  // store's shape). `readAll` keeps answering what a READER may show (unknown ⇒ no rows: a name, a resume's rung 1, the fresh-key
  // rule); every road that ENDS by «no binding names it» asks `boundKeys` (unknown ⇒ a throw), and nothing is WRITTEN over it.
  function readState() {
    // r3585: HELD — no read of a file that failed on the hub's loop (the helper reads it again off the loop); a rebuild in flight: unknown
    { const H = HELD.get(file); if (H && (H.hold.held() || H.rebuilding)) return { state: 'unknown', kind: H.hold.held() ? String(H.hold.held().code) : 'rebuilding' }; }
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
      if (e && e.code === 'ENOENT') return { state: 'absent', all: { v: 1, byConversation: {} } };
      heldOf(file, opts).hold.start(SR.storeAnswer({ error: e }, { valid: BINDINGS_SHAPE }));   // r3585: the hold engaged (read again off the loop)
      return { state: 'unknown', kind: String((e && e.code) || 'read-failed') };
    }
    try { const raw = JSON.parse(text); if (BINDINGS_SHAPE(raw)) return { state: 'ok', all: raw }; } catch { }
    heldOf(file, opts).hold.start(SR.storeAnswer({ text }, { valid: BINDINGS_SHAPE }));   // r3585: torn bytes — kept aside once off the loop, then rebuilt from the records
    return { state: 'unknown', kind: 'unparsable' };
  }
  function readAll() { const r = readState(); return r.all || { v: 1, byConversation: {} }; }
  // said ONCE per kind of failure (the error's code, or «unparsable»), the file's base name only
  const unknownSaid = new Set();
  function sayUnknown(kind) {
    if (unknownSaid.has(kind)) return;
    unknownSaid.add(kind);
    try { log.warn?.(`[browser] ${FILE_NAME} could not be read (${kind}) — no browser binding is written while it is unknown; each is offered again at its conversation's next record, and nothing ends by «no binding names it»`); } catch { }
  }
  function writeAll(obj) { writeBindingsFile(file, obj); }
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
    { const H0 = HELD.get(file), g = H0 ? H0.gen : 0; if (g !== knownGen) { known.clear(); knownGen = g; } }   // r3717: a rebuild / a lift's write clears it
    if (known.get(sid) === key) return false;
    try {
      // r3054 (2): NOTHING IS WRITTEN OVER AN UNREAD FILE — the record (and the prune it carries) writes nothing when its own read
      // is unknown; `known` stays unset, so the conversation's next record offers the binding again
      const rs = readState();
      if (rs.state === 'unknown') {
        sayUnknown(rs.kind);
        // r3717 (MUST 2): HELD — the offer is KEPT (bounded) and written at the lift: nothing ends by a binding refused while the file was held
        const H1 = HELD.get(file);
        if (H1) { H1.owed.delete(sid); H1.owed.set(sid, { key: String(key), at }); while (H1.owed.size > MAX_BINDINGS) H1.owed.delete(H1.owed.keys().next().value); }
        return false;
      }
      const all = rs.all;
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

  /** THE REVERSE READ ("Who can use it", 2026-09-27): the conversation a key is bound to, or '' — a STOPPED
   *  conversation's chip in the Agent browser panel is named by the client from its own session rows through this
   *  id. One file read per call; `conversationsByKey()` = the whole map, read ONCE (a panel with many rows). */
  function conversationsByKey() {
    const out = new Map();
    for (const [sid, v] of Object.entries(readAll().byConversation)) if (v && KEY_RE.test(String(v.key || '')) && !out.has(String(v.key))) out.set(String(v.key), sid);
    return out;
  }
  function conversationOf(key) {
    const k = String(key || '');
    if (!KEY_RE.test(k)) return '';
    for (const [sid, v] of Object.entries(readAll().byConversation)) if (v && v.key === k) return sid;
    return '';
  }

  /** r3054 (1): every bound key for a road that ENDS by «no binding names it» (the kept store's sweep) — a THROW when the file is
   *  UNKNOWN (a failed read, torn bytes), so the caller's guard ends NOTHING that pass; an absent file is truly empty. */
  function boundKeys() {
    const rs = readState();
    if (rs.state === 'unknown') { sayUnknown(rs.kind); throw Object.assign(new Error(`${FILE_NAME} could not be read (${rs.kind})`), { code: 'bindings_unknown' }); }
    const out = new Set();
    for (const v of Object.values(rs.all.byConversation)) if (v && KEY_RE.test(String(v.key || ''))) out.add(String(v.key));
    out.recoveredAt = Number(rs.all.recoveredAt) || 0;   // r3585: the same read says when the file was rebuilt (r3590's per-row rule)
    return out;
  }
  /** 'ok' | 'absent' | 'unknown' — the file's read now (r3054: a one-shot step that would MOVE by «no binding names it» waits). */
  function state() { return readState().state; }
  /** r3585: the time the file was rebuilt from the conversations' records (0: never) — a kept browser older than it that no binding
   *  names never ends by that silence (r3590's per-row rule) */
  function recoveredAt() { const r = readState(); return r.state === 'ok' ? (Number(r.all.recoveredAt) || 0) : 0; }
  /** r3585: the file's hold facts ({ file, code, since } — null: it reads) and this run's rebuild ({ n, copy, at }: a count and the copy's base name) */
  function heldFacts() { const H = HELD.get(file); if (!H) return null; const h = H.hold.held(); return h ? { file: h.file, code: h.code, since: h.since } : H.rebuilding ? { file: FILE_NAME, code: 'rebuilding', since: H.rebuilding.since } : null; }
  function recoveredFacts() { const H = HELD.get(file); return H && H.recovered ? { ...H.recovered } : null; }

  /** Every bound key (for a sweeper that wants to know which keys a stopped
   *  conversation could still come back for). r3054: an UNKNOWN file names none here — kept for the fresh-key rule, whose other
   *  rungs (the env directory, the scratch profile, the meta, the kept store) name every key with a browser on disk; a road that
   *  ENDS asks `boundKeys`. */
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

  return { record, lookup, conversationOf, conversationsByKey, keys, boundKeys, state, refusals, implicitForks, noteUnbound, conversationIdOf, bindableIdOf, keyDecidedFor, file, dir, MAX_BINDINGS,
    recoveredAt, heldFacts, recoveredFacts, _hold: () => (HELD.get(file) || {}).hold || null, _rebuild: () => { const H = HELD.get(file); return H ? rebuildBindings(file, H, null) : Promise.resolve(false); } };   // r3585
}

module.exports = { create, conversationIdOf, bindableIdOf, keyDecidedFor, FILE_NAME, DIR_REL, MAX_BINDINGS, REFUSAL_METRIC, SHARE_METRIC, IMPLICIT_FORK_METRIC };

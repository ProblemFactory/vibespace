'use strict';
// THE INJECTION IS MARKED WHEN THE TURN CARRIED IT (lane report-mark-on-ack, 2026-11-09 — the owner: «我看它不是回你了吗？»
// … «没送进你上下文，那不是你的问题吗？自己看一看。»). A peer's reply was stamped «read by» the conversation that never saw
// it: the hook routes (src/agent-routes.js task-context / prompt-context) moved every mark AS THEY COMPOSED the answer, and
// the turn that asked may never carry it. MEASURED on claude 2.1.321 (lane report-mark-on-ack measure/): the product hook
// aborts its fetch at 3 s, far inside the CLI's 10 s — a hub that answers later (its main loop stalled, a slow route) is
// answered into a closed socket while the CLI says `hook_response {outcome:'success', stdout:''}` and the turn's record has
// no hook context at all; a Stop during the hook makes the CLI SIGTERM it (`cancelled`). The hub cannot see either from its
// side (the request is parsed before the FIN — the socket looks alive at route time). So a mark moves only when the caller
// that hands the injection to the turn says it did: the answer carries a DELIVERY id, the caller returns it after its own
// write (the hook: its stdout written; codex-chat: thread/inject_items answered; acp / agy: the prompt on the wire). Until
// then nothing moved — the next call composes the SAME content again (at-least-once) and says so in one line (AGAIN_LINE).
// ONE helper for every rider: a rider stages its mark (stage(kind, apply)); `close` keeps the staged applies under a fresh
// id for a caller that confirms, or applies them at once for one that does not (LEGACY); `confirm` is the door.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** THE CENSUS (law 2): every rider of the hook injection that advances a mark when it is composed — the mark, and what a
 *  dropped injection lost before this lane. scripts/test-seen-marks.mjs reds on a state write in the two hook routes that
 *  is not staged through one of these kinds, and on a kind with no write. */
// `store` (acceptance r1, law A — WHAT IS MARKED IS EXACTLY WHAT WAS TOLD, BY IDENTITY): what may change in the rider's store
// between the stage and the confirm, and so how its apply names what it marks — `append-only: <why a later write cannot shift
// what was told>` (the apply moves a mark to a value captured as told), or `by identity: <the records>` (the apply removes the
// very records that were rendered, nothing else — a store a replace / withdraw / cap can reorder is never consumed by count)
const RIDERS = Object.freeze({
  'group-report': { mark: "groups-engine commitReports: each group's reportedUpTo / reportedAt, and the group cards in the chat", lost: 'the message read «read by» and was never told again (the incident)', store: 'append-only: the group log only appends (a clear appends a replacement); the marker moves to the told record\'s instant and never back, so a record posted after the stage stays above it; the cards are the ones composed' },
  'task-full': { mark: '_groupSeenAt / _ctxSig / _groupSnap per group (+ the meta seenMarks)', lost: "a group's whole context — later turns got deltas against a snapshot never seen", store: 'append-only: the marks move to the content instant, signature and snapshot CAPTURED when told, and only forward — an edit after the stage is newer than them and is told as a delta' },
  'task-delta': { mark: '_groupSeenAt / _ctxSig / _groupSnap per changed group (the snapshot taken as told)', lost: 'the delta, for good («everything else you already know still stands»)', store: 'append-only: as task-full — the captured snapshot, only forward' },
  'task-unchanged': { mark: '_marksRestored (the restart\'s one «unchanged» line)', lost: 'the line naming the groups a restart did not repeat', store: 'append-only: a flag set once at a restore; nothing else writes it' },
  'tools-intro': { mark: '_toolsIntroSeen', lost: 'the tools intro, for the life of the process', store: 'append-only: a flag only ever set' },
  'manager-intro': { mark: '_mgrIntroSeen', lost: "the manager's admin verbs, for the life of the process", store: 'append-only: a flag only ever set' },
  'jobs-update': { mark: '_jobsEventsSeenTs', lost: 'the background-job events of that turn', store: 'append-only: the events ring appends by ts; the marker moves to the last ts told and only forward (a late confirm of an older delivery never rolls it back)' },
  'notices': { mark: 'sessionStatus.dropNotices of the very records rendered (the persisted notice queue)', lost: 'a takeover / status-override / browser-profile notice', store: 'by identity: the queue is NOT append-only — a replace-of-the-same-kind push, a withdraw (dropNotices) and the cap of 8 reorder its head — so the confirm removes exactly the records that rode, nothing else' },
  'jobs-stash': { mark: "the jobs engine's drainNotifs + the retry park (retryTake via 'prompt') + the cards of what was TAKEN", lost: 'job notifications stashed while the conversation was away', store: 'by identity: drainNotifs / retryTake take the very entry objects rendered (the engine hands out the same objects); CLAIMED while staged (claimNotifs / claimRetry) so a hand-over or a retry wake never sends them beside the answer' },
  'msg-stash': { mark: "deliver.drainStash + the retry park (retryTake via 'prompt') + the cards of what was TAKEN", lost: 'stashed peer messages and receipts', store: 'by identity: drainStash / retryTake take the very entry objects rendered (stashEntries hands out the same objects); CLAIMED while staged (claimStash / claimRetry) — a hand-over, a retry wake or the cap passes them by; a second confirm of the same entries takes nothing and draws no card' },
  'preamble': { mark: '_preambleSeen (+ the order it was told in, kept beside the route)', lost: "the user's standing instructions, until they are edited", store: 'append-only: the hash of the text told is what is stored, with WHEN it was told, and only forward — an edit after the stage is a new hash told next turn; a late confirm of an older delivery never rolls it back' },
  'cwd-notice': { mark: '_cwdRecreated', lost: 'the user-mandated «your working directory was recreated EMPTY» notice', store: 'append-only: a flag set once by a resume' },
});
/** THE LEGACY ROW (ruling 3): a caller that does not send CONFIRM_HEADER keeps mark-on-send — the marks move as the answer
 *  is composed, exactly as before this lane. Recognised by the header's ABSENCE on a hook-route call; who that is: a
 *  vibespace-hook.mjs older than this lane on a REMOTE host (the helper is pushed by the remote install / refresh, so a
 *  host not refreshed since keeps its old copy), an older wrapper, a hand-made curl. The row can go once every caller of
 *  the two routes sends the header (a remote helper refresh has reached every host) — then a missing header is refused. */
const LEGACY = Object.freeze({ who: 'a caller without X-VibeSpace-Confirm (an older vibespace-hook.mjs on a remote host until its helper refresh; an older wrapper)', marks: 'at compose, as before' });
const CONFIRM_HEADER = 'x-vibespace-confirm';
const SENT_HEADER = 'x-vibespace-hook-sent';
const CONFIRM_ROUTE = '/api/agent/prompt-context/carried';
const HOOK_FETCH_MS = 3000;   // data/bin/vibespace-hook.mjs and the three wrappers abort their fetch at 3 s
/** (addition a, 主开发 2026-11-10) at-least-once means a REPEAT is possible — the line above content composed again */
const AGAIN_LINE = '<vibespace-sent-again>sent again — the previous turn did not confirm it: if you already acted on something below (a job notice, a status notice, a message), do not act twice</vibespace-sent-again>';
/** (acceptance r1, law B) the FIRST answer a conversation gets from a NEW hub process: a delivery the previous process staged
 *  lived in its memory, so its confirm can never land (404 unknown) and what it carried may be composed again */
const RESTART_LINE = '<vibespace-sent-again>the hub restarted — what follows may have been sent to you before; do not act twice</vibespace-sent-again>';
// A DELIVERY'S OWNER IS THE CONVERSATION'S SESSION OBJECT (acceptance r2, item 3c): its status key can change between the stage
// and the confirm (the conversation id arriving: webui:<id> → claude:<cid>) — the ledger names the object, never the key
/** TEST SEAM (acceptance r3, item 2b — «pin it with a throw planted at each of the carry's doors»): `_fault.at` =
 *  'open' | 'stage' | 'close' | 'write' makes that door throw; production never sets it */
const FAULT = { at: null };
const ownerIds = new WeakMap();
let ownerSeq = 0;
const ownerIdOf = (s) => { if (!s || typeof s !== 'object') return null; let v = ownerIds.get(s); if (!v) { v = 'o' + (++ownerSeq); ownerIds.set(s, v); } return v; };
/** OUTSTANDING DELIVERIES, by CONVERSATION (acceptance r2, item 2): THE RESTART IS A FACT ABOUT THE CONVERSATION. A delivery
 *  handed out and not yet confirmed is written here under the conversation's key; a NEW process reads what a dead one left,
 *  and the first answer that CARRIES anything to such a conversation (however its record was made — restored, resumed)
 *  says RESTART_LINE and retires the row. A conversation made here, or one whose delivery was confirmed before the
 *  restart, has no row and gets no line. One small JSON file (data/turn-carry-outstanding.json), written whole
 *  (tmp + rename) only when a row changes; with no dir (an in-process test) it lives in memory.
 *  ROUND 4 (acceptance r3, items 2a + 3): the load takes an OBJECT OF ROWS and nothing else (an array, a primitive, a
 *  corrupt or unreadable file ⇒ an empty table, SAID once); the table is BOUNDED — a row older than OUTSTANDING_MAX_AGE_MS
 *  or past the newest OUTSTANDING_MAX_ROWS leaves (a conversation that ends unconfirmed and never returns no longer stays
 *  in every later process); a failed write is SAID once and never thrown — the file only serves the restart line, so a
 *  read-only data dir loses that line (said), never an answer or the confirm law. */
const OUTSTANDING_MAX_ROWS = 1000;
const OUTSTANDING_MAX_AGE_MS = 48 * 3600 * 1000;
/** the tidy after acceptance r4 (item 3): the writer keeps the file near 170 KB (1 000 rows) — a file beyond this is not this
 *  writer's, and is REFUSED BY NAME before it is read (a 56 MB planted file held route setup 1.2 s while it was parsed) */
const OUTSTANDING_MAX_BYTES = 1024 * 1024;
function createOutstanding(dir = null, { log = (...a) => console.log(...a), now = Date.now } = {}) {   // log resolved at each line (a store outlives the call that made it)
  const file = dir ? path.join(dir, 'turn-carry-outstanding.json') : null;
  const saidOnce = new Set();
  const sayOnce = (cause, words) => { if (saidOnce.has(cause)) return; saidOnce.add(cause); try { log(`[inject] the outstanding-deliveries file ${file || '(memory)'}: ${words}`); } catch { } };
  const isRow = (r) => !!r && typeof r === 'object' && !Array.isArray(r) && Number.isFinite(Number(r.at));
  const bound = (t) => {
    const cut = now() - OUTSTANDING_MAX_AGE_MS;
    const keep = Object.entries(t).filter(([k, r]) => k && isRow(r) && Number(r.at) >= cut).sort((a, b) => Number(b[1].at) - Number(a[1].at)).slice(0, OUTSTANDING_MAX_ROWS);
    return Object.fromEntries(keep);
  };
  let rows = {};
  if (file) {
    let raw = null, fd = null;
    try {
      fd = fs.openSync(file, 'r');
      const size = fs.fstatSync(fd).size;   // the size FIRST: a file past the bound is never read, let alone parsed
      if (size > OUTSTANDING_MAX_BYTES) sayOnce('size', `is ${size} B, beyond its ${OUTSTANDING_MAX_BYTES} B bound (this writer keeps it near 170 KB) — not read; started empty; the restart line cannot be said for what it held`);
      else raw = fs.readFileSync(fd, 'utf8');
    } catch (e) { if (e && e.code !== 'ENOENT') sayOnce('read', `could not be read (${e.code || e.message}) — started empty; the restart line cannot be said for what it held`); }
    finally { if (fd != null) { try { fs.closeSync(fd); } catch { } } }
    if (raw != null) {
      let v; try { v = JSON.parse(raw); } catch { v = undefined; sayOnce('parse', 'is not JSON — started empty; the restart line cannot be said for what it held'); }
      if (v !== undefined) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          rows = bound(v);
          const held = Object.keys(v).length, kept = Object.keys(rows).length;
          if (kept < held) sayOnce('bound', `held ${held} row(s) — ${held - kept} past its bound (${OUTSTANDING_MAX_AGE_MS / 3600000} h, the newest ${OUTSTANDING_MAX_ROWS}) left at the load; a restart line is said only for the ${kept} kept`);
        } else sayOnce('shape', `holds ${Array.isArray(v) ? 'an array' : v === null ? 'null' : 'a ' + typeof v}, not a table of rows — started empty; the restart line cannot be said for what it held`);
      }
    }
  }
  const before = new Set(Object.keys(rows));   // what previous processes left outstanding
  const save = () => {
    if (!file) return true;
    try {
      if (FAULT.at === 'write') throw new Error('planted at the file write');
      rows = bound(rows);
      fs.writeFileSync(file + '.tmp', JSON.stringify(rows)); fs.renameSync(file + '.tmp', file);
      return true;
    } catch (e) { sayOnce('write', `could not be written (${(e && (e.code || e.message)) || e}) — a restart before a confirm will not be said for the conversations it should hold`); return false; }
  };
  return {
    file,
    fromBefore: (key) => !!key && before.has(key),
    mark(key, info) { if (!key) return true; rows[key] = info; return save(); },
    /** retire the row only if it is still the one `at` wrote (a newer delivery may have marked it since) */
    clearIf(key, at) { if (!key || !rows[key] || (at != null && Number(rows[key].at) !== Number(at))) return; delete rows[key]; before.delete(key); save(); },
    clear(key) { if (!key || !(key in rows)) return; delete rows[key]; before.delete(key); save(); },
    said(key) { if (before.delete(key)) { delete rows[key]; save(); } },
    /** the conversation's key changed (its id arrived): its row follows it */
    rekey(from, to) { if (!from || !to || from === to || !rows[from]) return; rows[to] = rows[from]; delete rows[from]; if (before.delete(from)) before.add(to); save(); },
    size: () => Object.keys(rows).length,
  };
}
const MEMORY_OUTSTANDING = createOutstanding(null);
/** a claim's own bound (acceptance r3, item 1): released by whichever comes first — the conversation's next answer, the
 *  claim's confirm, or CLAIM_BOUND_MS (a session that ended, a conversation nobody asks again). Mutable for tests only. */
const LIMITS = { claimBoundMs: 5 * 60 * 1000, clearAfterMs: 2000 };
/** the stamp a carry's claim puts on a stash record (`ho`) — the loaders release it at boot, named «an unconfirmed answer's claim» */
const CLAIM_TAG = 'carry';
/** THE CLAIM BOOK of ONE answer (the tidy after acceptance r4, item 1 — «every claim has its bound from the instant it is
 *  stamped, and a failing claim call is said»). The routes' drains claim the records they render through `carry.claim(kind,
 *  call, records)`, never by calling claimStash / claimRetry / claimNotifs themselves: the bound is ARMED BEFORE THE STAMP, so
 *  whatever happens to the answer after (closed, confirmed, dropped, a throw on its way to the close, a route that never
 *  closes) the claim ends; a call that THROWS breaks the carry (`onFail`: one journal line, the legacy answer), and what it
 *  stamped before throwing — its release never returned — is UNSTAMPED by the records' own tag. Ending is idempotent. */
const liveBooks = new Set();   // books with an armed bound (a new process starts with none — the loaders released the stamps)
function claimBook(who, log, onFail) {
  const list = [];
  const book = { who, timer: null };
  const releaseOne = (c) => {
    if (c.done) return 0;
    c.done = true;
    if (c.release) { try { c.release(); } catch { } return 1; }
    for (const x of c.records) { const e = x && x._retry ? x._retry : x; if (e && typeof e === 'object' && e.ho === CLAIM_TAG) delete e.ho; }   // in memory: the file follows at its next write, and a boot releases a stamp it finds
    return 1;
  };
  book.claim = (kind, call, records = []) => {
    const c = { kind, records: Array.isArray(records) ? records.slice() : [], release: null, done: false };
    list.push(c);
    if (!book.timer) { book.timer = setTimeout(() => book.end('bound'), LIMITS.claimBoundMs); if (book.timer.unref) book.timer.unref(); liveBooks.add(book); }
    try { const r = call(); if (typeof r === 'function') c.release = r; } catch (e) { try { onFail('claim', e); } catch { } }
    return () => { releaseOne(c); };
  };
  /** release every claim not yet released, disarm the bound; `why` = 'bound' says it (the claims nobody ended in time) */
  book.end = (why = null) => {
    if (book.timer) { clearTimeout(book.timer); book.timer = null; }
    liveBooks.delete(book);
    let n = 0;
    for (const c of list) n += releaseOne(c);
    if (why === 'bound' && n) { try { log(`[inject] ${book.who}: an unconfirmed answer's claim on stashed records ended at its ${Math.round(LIMITS.claimBoundMs / 60000)}-minute bound — they wait again (the next answer carries them under «sent again»)`); } catch { } }
  };
  /** a NEW process (the test seam): the old process's memory is gone — nothing runs, nothing is said */
  book.stop = () => { if (book.timer) { clearTimeout(book.timer); book.timer = null; } liveBooks.delete(book); };
  return book;
}
// THE CONVERSATION'S UNCONFIRMED DELIVERIES, whichever session object holds them (acceptance r3, item 1): a resumed record
// or a second session of the conversation is a NEW object — its next answer releases what any of them claimed
const byConversation = new Map();   // owner key → Set of pending deliveries

const confirmable = (req) => !!(req && req.headers && String(req.headers[CONFIRM_HEADER] || '') === '1');
const sentAt = (req) => { const v = Number(req && req.headers && req.headers[SENT_HEADER]); return Number.isFinite(v) && v > 0 ? v : null; };

// every delivery handed out, by id — so a confirm is refused BY NAME (another conversation's, already used, replaced),
// bounded; the staged applies themselves live on the session object (only its own bearer reaches them)
const ledger = new Map();   // id → { owner, state: 'pending' | 'carried' | 'replaced' }
const LEDGER_MAX = 4000;
function note(id, owner, state) {
  ledger.delete(id); ledger.set(id, { owner, state });
  while (ledger.size > LEDGER_MAX) ledger.delete(ledger.keys().next().value);
}
const kindsOf = (staged) => [...new Set(staged.map((x) => x.kind))];
function runAll(staged, after, log) {
  for (const x of staged) { try { x.apply(); } catch (e) { log(`[inject] a staged ${x.kind} mark failed: ${e && e.message}`); } }
  for (const x of staged) if (typeof x.release === 'function') { try { x.release(); } catch { } }   // what was not taken waits again
  if (typeof after === 'function') { try { after(); } catch (e) { log(`[inject] the marks' persist failed: ${e && e.message}`); } }
}
/** a delivery that will not be confirmed by THIS answer: its claims on stash entries go (they may be composed again) */
function releaseClaims(p) {
  if (!p || p.released) return;
  p.released = true;
  for (const x of p.staged || []) if (typeof x.release === 'function') { try { x.release(); } catch { } }
  if (p.claims) p.claims.end();
}
/** off the conversation's list (a confirm, a drop, a key change) — its claims' bound is the claim book's, never touched here */
function forget(p) {
  if (!p) return;
  const set = byConversation.get(p.owner);
  if (set) { set.delete(p); if (!set.size) byConversation.delete(p.owner); }
}
/** «[inject] not carried» (law 3 / ruling 4): the hub journal line for an answer that was never confirmed — the turn kind,
 *  why, how late, which riders and how many bytes; never its content */
function notCarriedLine(p, why) {
  const late = p.waitedMs != null && p.waitedMs > HOOK_FETCH_MS ? `; its request had waited ${(p.waitedMs / 1000).toFixed(1)} s for the hub — the caller gives up at ${HOOK_FETCH_MS / 1000} s` : '';
  return `[inject] not carried: ${p.owner} — the ${p.turn} turn's ${p.route} answer (${p.bytes} B: ${p.kinds.join(', ')}) ${why}${late}; nothing it staged moved — it is composed again`;
}
/** THE LEGACY ANSWER (acceptance r3, item 2b): what a caller that does not confirm gets — every mark applied as the answer is
 *  closed — and what ANY failure inside the carry falls back to: no exception in this machinery empties or fails a hook
 *  answer. `why` = the failure (said once, in ONE journal line) or null for a plain legacy caller. */
function legacyCarry({ owner = '', route = '', why = null, log = console.log } = {}) {
  let said = !!why;
  const failed = (where, e) => { if (said) return; said = true; try { log(`[inject] ${owner}: the ${route} carry failed (${where}: ${(e && e.message) || e}) — this answer is composed and marked at send, as for a caller that does not confirm`); } catch { } };
  if (why) { try { log(`[inject] ${owner}: the ${route} carry failed (${why}) — this answer is composed and marked at send, as for a caller that does not confirm`); } catch { } }
  const staged = [];
  const book = claimBook(owner, log, failed);
  return {
    dropped: null, again: false, againBytes: 0, legacy: true,
    stage(kind, apply, { release = null } = {}) { staged.push({ kind, apply, release }); },
    claim: (kind, call, records) => book.claim(kind, call, records),
    staged: () => kindsOf(staged),
    wrap: (text) => text,
    close(text, after) { runAll(staged, after, log); book.end(); return null; },
  };
}

/** ONE answer of a hook route. `owner` = the session's status key; `turn` = 'person' | 'machine' | 'session start';
 *  `confirm` = the caller will return the delivery id (CONFIRM_HEADER); `sent` = when the caller sent the request.
 *  Each ROUTE keeps its own unconfirmed delivery (acceptance r1, law B): a SessionStart answer never silently cancels a
 *  prompt's unconfirmed riders (or the other way round) — this route's previous one is dropped (said, composed again); the
 *  other route's stays confirmable. The DEBTS and the CLAIMS are the CONVERSATION's (acceptance r3, item 1): any session
 *  object of it (a resumed record, a second session) releases what an unconfirmed answer claimed, and owes its repeat line.
 *  THROWS only at its own first line (the route guards the call and falls back to legacyCarry). */
function open(s, { owner, route, turn, confirm = false, sent = null, store = MEMORY_OUTSTANDING, log = console.log, now = Date.now } = {}) {
  if (FAULT.at === 'open') throw new Error('planted at open');
  // the conversation's key changed since this session object staged (its id arrived): its deliveries and row follow it
  for (const p of Object.values((s && s._carry) || {})) if (p && p.owner !== owner) { forget(p); if (store) store.rekey(p.owner, owner); p.owner = owner; if (p.claims) p.claims.who = owner; if (!byConversation.has(owner)) byConversation.set(owner, new Set()); byConversation.get(owner).add(p); }
  const mine = s && s._carry ? s._carry[route] : null;
  let dropped = null;
  if (mine) {
    delete s._carry[route];
    forget(mine);
    note(mine.id, mine.ownerId, 'replaced');
    log(notCarriedLine(mine, 'was not confirmed before the next call'));
    dropped = { kinds: mine.kinds, route: mine.route, turn: mine.turn };
    releaseClaims(mine);
  }
  // THE DEBTS (acceptance r2, item 3a): what an unconfirmed delivery carried may be composed again by THIS answer — this
  // route's dropped one, and every other unconfirmed delivery of the CONVERSATION (another route; another session object of
  // it) unless a repeat line already paid for it. Their claims are released (this answer may take the same records); they
  // stay confirmable by their own session.
  const others = [...(byConversation.get(owner) || [])];
  for (const p of others) releaseClaims(p);
  const debts = [...(dropped ? [{ kinds: dropped.kinds, pending: null }] : []), ...others.filter((p) => !p.retired).map((p) => ({ kinds: p.kinds, pending: p }))];
  // THE RESTART (item 2): a previous process left this CONVERSATION a delivery it never confirmed — only a caller that
  // confirms can be told (a legacy caller marks as it composes: nothing can repeat for it)
  const restarted = !!confirm && !!store && store.fromBefore(owner);
  const staged = [];
  const at = now();
  const reserve = debts.length || restarted ? Math.max(Buffer.byteLength(AGAIN_LINE, 'utf-8'), Buffer.byteLength(RESTART_LINE, 'utf-8')) + 2 : 0;
  let broken = null;   // a failure inside the carry: this answer falls back to the legacy answer (said once)
  const breakOn = (where, e) => { if (broken) return; broken = `${where}: ${(e && e.message) || e}`; try { log(`[inject] ${owner}: the ${route} carry failed (${broken}) — this answer is composed and marked at send, as for a caller that does not confirm`); } catch { } };
  const book = claimBook(owner, log, breakOn);   // this answer's claims: bounded from the stamp, a throw said (the legacy answer)
  const carry = {
    dropped,
    /** the content may repeat: reserve a line's bytes while composing */
    again: !!reserve,
    againBytes: reserve,
    /** `release` (optional): undo what the stage claimed (stash entries held for this delivery) — run when it is dropped */
    stage(kind, apply, { release = null } = {}) {
      try {
        if (FAULT.at === 'stage') throw new Error('planted at stage');
        if (!Object.prototype.hasOwnProperty.call(RIDERS, kind)) throw new Error(`turn-carry: no census row for the rider "${kind}"`);
      } catch (e) { breakOn('stage', e); }
      staged.push({ kind, apply, release });
    },
    /** CLAIM the records this answer renders (`call` = claimStash / claimRetry / claimNotifs → its release) — see claimBook.
     *  Returns the claim's release (idempotent; stage it as the rider's `release`). Never throws. */
    claim: (kind, call, records) => book.claim(kind, call, records),
    staged: () => kindsOf(staged),
    /** the final text with ONE repeat line above it — said only when this answer actually composes again what an unconfirmed
     *  delivery carried (a rider kind it staged too), which retires that debt; else, once per conversation, the restart */
    wrap(text) {
      try {
        if (broken || !(staged.length && text)) return text;
        const kinds = new Set(kindsOf(staged));
        const owed = debts.filter((d) => d.kinds.some((k) => kinds.has(k)));
        if (owed.length) { for (const d of owed) if (d.pending) d.pending.retired = true; return AGAIN_LINE + '\n\n' + text; }
        if (restarted) {
          store.said(owner);
          log(`[inject] ${owner}: the first ${route} answer from this hub process that carries anything (${kindsOf(staged).join(', ')}) — said «the hub restarted» (a delivery a previous process handed out was never confirmed: its id answers 404 unknown)`);
          return RESTART_LINE + '\n\n' + text;
        }
        return text;
      } catch (e) { breakOn('wrap', e); return text; }
    },
    /** the answer is final: stage it under a fresh id (a confirming caller with something to carry) or apply now.
     *  Returns the delivery id, or null. `after` runs once the marks moved (persist). NEVER throws. */
    close(text, after) {
      try {
        if (FAULT.at === 'close') throw new Error('planted at close');
        if (!staged.length) { book.end(); if (typeof after === 'function') after(); return null; }
        if (broken || !confirm || !text) { runAll(staged, after, log); book.end(); return null; }   // LEGACY (no header), a failed carry, or nothing to carry
        const id = 'dl_' + crypto.randomBytes(18).toString('base64url');
        const p = { id, owner, ownerId: ownerIdOf(s), route, turn, staged, after, kinds: kindsOf(staged), bytes: Buffer.byteLength(text, 'utf-8'), at, waitedMs: sent ? at - sent : null, store, claims: book };
        if (store) store.mark(owner, { at, route, kinds: p.kinds });   // outlives this process (a failed write is said by the store, never thrown)
        s._carry = s._carry || {};
        s._carry[route] = p;
        if (!byConversation.has(owner)) byConversation.set(owner, new Set());
        byConversation.get(owner).add(p);
        note(id, ownerIdOf(s), 'pending');   // its claims' bound has run since their stamp (the claim book) — never re-armed here
        return id;
      } catch (e) {
        breakOn('close', e);
        if (s && s._carry && s._carry[route] && s._carry[route].staged === staged) { forget(s._carry[route]); delete s._carry[route]; }
        runAll(staged, after, log);
        book.end();
        return null;
      }
    },
  };
  return carry;
}
/** THE DOOR (addition b): the session's own bearer reached `s`; `id` must be the delivery staged on THIS session, unused.
 *  It runs the staged applies of that delivery and nothing else. → {ok, kinds} | {ok:false, status, code, error} */
function confirm(s, owner, id, { log = console.log } = {}) {
  const me = ownerIdOf(s);
  const v = String(id || '');
  if (!/^dl_[A-Za-z0-9_-]{24}$/.test(v)) return { ok: false, status: 400, code: 'bad-id', error: 'not a delivery id (the hook route\'s answer names it: dl_…)' };
  const e = ledger.get(v);
  const p = s && s._carry ? Object.values(s._carry).find((x) => x && x.id === v) || null : null;
  if (!e && !p) return { ok: false, status: 404, code: 'unknown', error: 'no such delivery — it was never handed out, or it is too old to be known' };
  if (e && e.owner !== me) return { ok: false, status: 403, code: 'not-yours', error: 'this delivery was handed to another conversation — a confirm moves only the marks staged for its own' };
  if (e && e.state === 'carried') return { ok: false, status: 409, code: 'already', error: 'this delivery was already confirmed — a delivery id is single-use' };
  if (!p) return { ok: false, status: 409, code: 'replaced', error: 'not confirmed before the next call — its content was composed again, and that answer is the one to confirm' };
  delete s._carry[p.route];
  forget(p);
  note(v, me, 'carried');
  runAll(p.staged, p.after, log);
  if (p.claims) p.claims.end();   // what the confirm did not take waits again; the bound is disarmed
  // the row is retired once what it guards is DURABLE (acceptance r3, item 4): the notice store persists a consume ~500 ms
  // later, so the row goes LIMITS.clearAfterMs after the confirm — and only if no newer delivery marked it meanwhile
  if (p.store && !byConversation.has(p.owner)) { const t = setTimeout(() => p.store.clearIf(p.owner, p.at), LIMITS.clearAfterMs); if (t.unref) t.unref(); }
  return { ok: true, kinds: p.kinds };
}
/** TEST SEAM: what a NEW process starts with — no unconfirmed delivery in memory, no ledger (an in-process test stands for
 *  two processes on one data dir; production never calls it) */
function _newProcess() { for (const b of [...liveBooks]) b.stop(); byConversation.clear(); ledger.clear(); }
/** the session's delivery still waiting for its confirm (tests, the census) */
const pendingOf = (s, route = 'UserPromptSubmit') => { const p = s && s._carry ? s._carry[route] : null; return p ? { id: p.id, kinds: p.kinds.slice(), route: p.route, turn: p.turn } : null; };

module.exports = { RIDERS, LEGACY, CONFIRM_HEADER, SENT_HEADER, CONFIRM_ROUTE, HOOK_FETCH_MS, AGAIN_LINE, RESTART_LINE, OUTSTANDING_MAX_ROWS, OUTSTANDING_MAX_AGE_MS, OUTSTANDING_MAX_BYTES, LIMITS, CLAIM_TAG, createOutstanding, legacyCarry, confirmable, sentAt, open, confirm, pendingOf, notCarriedLine, _fault: FAULT, _newProcess };

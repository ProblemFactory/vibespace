'use strict';
/**
 * THE QUEUED WAKE (lane queued-is-not-woke, law 1 — 主开发's brief 2026-11-11, row B-580f; round 2 2026-11-12).
 *
 * A peer frame written to an rpc-queue wrapper (antigravity, codex) while its
 * conversation is IN A TURN is not a wake: the wrapper puts it in its queue and
 * answers `mode:'queued'`, and nothing reads it until that turn ends. On master
 * the hub said «woke» and stamped the group's read mark at the stdin write (the
 * 2026-11-11 incident: three wakes «woke + read + charged» sat six hours behind
 * a turn that never ended).
 *
 * ONE entry per such frame, from the write until a turn CARRIES it or it is
 * HANDED BACK:
 *   pending   — written; the wrapper has not answered yet
 *   queued    — the wrapper said 'queued'; bound to the queue item id(s) that
 *               appeared in its `queue_changed` after the write
 *   restashed — handed back (Stop / remove / the wrapper's exit, or BY THE HUB
 *               when the wrapper is gone): the words ride the conversation's
 *               stash (the next-turn road) and its next turn start carries them
 * CARRIED = the bound item LEFT the queue and a turn STARTED since the bind (an
 * item that could not be bound: the first turn start after the running turn
 * ended). A 'turn' answer is carried at once.
 *
 * THE MONEY — A RESERVATION (round 2, 主开发's ruling: «an owed charge is money
 * the gate has already promised»): the unit is TAKEN at the write — the ladder's
 * authorization becomes a guard stamp named by this entry's id (`reservation`),
 * counted by every authorize in the hour and the day exactly like a spent turn,
 * so queueing never takes a conversation past the owner's ceiling (a send past it
 * is refused at the send). The turn that carries the frame IS that unit (nothing
 * more is charged; a stamp for an id already stamped is no second unit — the
 * guard is idempotent by the id, so a crash between a carry and its persist never
 * charges twice). A hand-back RETURNS it (release({reservation})). An unreadable
 * record fails closed: the stamp stays, counted.
 *
 * Persisted (msg-queued.json, through the store writer — the frame's words with
 * it: a frame whose wrapper is gone is handed back BY THE HUB to the next-turn
 * road). After a restart the hub ASKS each live wrapper for its queue
 * (queue-resync) and settles each entry from the answer; a bound item already
 * gone from the queue the hub reads is carried.
 */
const crypto = require('crypto');
const path = require('path');

const FILE = 'msg-queued.json';
const STORE_NAME = 'msg-queued.write';
const PER_CONVERSATION_MAX = 50;   // a bound on a money record refuses at the send (by name) — it never forgets
const MAX_ENTRIES = 500;
const STATES = Object.freeze(['pending', 'queued', 'restashed']);
const REF = 'queued-wake:';   // the stash ref a hand-back carries: its drain names the frame
const RESTASHED_MAX_AGE_MS = 7 * 24 * 3600 * 1000;   // a handed-back entry whose words never drained leaves by age (round 3)
const REPEAT_HEAD = '(This may repeat an earlier message.)\n';   // round 3: a marked repeat beats a loss — never an unmarked second copy (round 4: short, true on every road)
const LIVE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;   // round 4: a live entry kept at boot whose wrapper never attaches leaves by age too (its unit long aged out)
// B-0a33 (the owner's word via 主开发 2026-11-17 — the gate may count MORE or refuse, never loosen):
//  (2) a frame already waiting when a cap is lowered below it is TAKEN BACK OUT of its wrapper's queue (the wrapper's own
//      `remove`, the person's queue edit): the wrapper hands its words back, they ride the conversation's stash (held, said —
//      never dropped) and its unit is returned (known not run); the frames left run inside every cap;
//  (1) a frame the hub GAVE UP on (aged out, its process judged gone or replaced, its conversation archived) is remembered
//      (`gone`, 7 days, bounded): seen again in that process's queue ⇒ taken back out (it does not run); seen leaving it after
//      a turn started there ⇒ it ran — counted where it ran.
const PULL_RETRY_MS = 60 * 1000;   // a take-back nobody answered is asked again after this
const PULL_WHY = 'held — a spending cap is now lower than the messages waiting; it rides the conversation\'s next turn';

const digestOf = (text) => crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 24);
const idsOf = (items) => (Array.isArray(items) ? items.map((it) => (it && typeof it === 'object' ? it.id : it)).filter((x) => typeof x === 'string' && x) : []);
const live = (e) => e.state === 'pending' || e.state === 'queued';

function create({ dataDir, noteSpend = null, releaseSpend = null, reservationState = null, waitingReservations = null, waitingOverCap = null, pull = null, stashHas = null, log = () => { }, now = () => Date.now(), writer = null, readFile = null, rand = () => crypto.randomBytes(4).toString('hex') } = {}) {
  const file = path.join(dataDir, FILE);
  const storeWriter = () => writer || require('../store-writer.js').storeWriter();
  const boot = rand();   // ids never repeat across processes: a reservation is idempotent by its id
  let seq = 0;
  let entries = [];
  let gone = [];   // B-0a33 (1): frames the hub gave up on, still watched in their process's queue (see PULL_WHY's head)
  // cid -> { ids: Set|null, starts, ends, fresh, seq, idsSeq, idsFresh, idsBy, startSeq } — this process only. `seq` orders the
  // conversation's events: a queue listing is EVIDENCE only if it is fresh (the wrapper read it now) and newer than every turn start
  const mirror = new Map();
  const mirrorOf = (cid) => { let m = mirror.get(cid); if (!m) { m = { ids: null, starts: 0, ends: 0, fresh: false, seq: 0, idsSeq: 0, idsFresh: false, idsBy: null, startSeq: 0 }; mirror.set(cid, m); } return m; };
  const listeners = { carried: new Set(), back: new Set(), dropped: new Set() };
  const droppedAtLoad = [];   // round 4: what left at boot is said to the first listener (the row reads «not delivered»)
  // a handed-back entry whose words still WAIT in the stash is not old: its row («waiting for the next turn») is true — it
  // leaves when they drain (read) or are evicted (said); by age only once the words are gone (round 4)
  const wordsWait = (e) => { try { return !!stashHas && stashHas(e.cid, REF + e.id) === true; } catch { return false; } };
  const isOld = (e, t) => (e.state === 'restashed' ? t - Number(e.backAt || e.at || 0) > RESTASHED_MAX_AGE_MS && !wordsWait(e) : t - Number(e.at || 0) > LIVE_MAX_AGE_MS);
  const emit = (kind, e, extra) => { for (const fn of listeners[kind]) { try { fn(e.cid, publicOf(e), extra || {}); } catch (err) { log('[queued] listener failed:', err.message); } } };
  const publicOf = (e) => ({ id: e.id, cid: e.cid, at: e.at, kind: e.kind, state: e.state, since: e.since, mark: e.mark || null, peerName: e.peerName || null, reserved: !!e.reserved });

  // ── boot: what the previous process held ────────────────────────────────
  let unread = false;   // B-0a33 follow-up: the file was there and could not be read — the reconcile holds off
  try {
    const raw = typeof readFile === 'function' ? readFile(file) : require('fs').readFileSync(file, 'utf8');
    const j = JSON.parse(raw);
    if (j && Array.isArray(j.entries)) {
      entries = j.entries.filter((e) => e && typeof e.cid === 'string' && typeof e.id === 'string' && STATES.includes(e.state))
        .filter((e) => { const old = isOld(e, now()); if (old) droppedAtLoad.push(e); return !old; })   // by age (rounds 3–4) — said
        .map((e) => ({ ...e, bind: Array.isArray(e.bind) ? e.bind.filter((x) => typeof x === 'string') : [], startsAt: 0, endsAt: 0, rebooted: true }));
    }
    if (j && Array.isArray(j.gone)) gone = j.gone.filter((g) => g && typeof g.cid === 'string' && typeof g.id === 'string' && Array.isArray(g.bind) && typeof g.bind[0] === 'string' && now() - Number(g.at || 0) <= LIVE_MAX_AGE_MS).map((g) => ({ ...g, seenSeq: 0, pulledAt: 0 })).slice(-MAX_ENTRIES);   // a sequence is this process's
  } catch (err) {
    // none (ENOENT), or UNREADABLE: the guard's stamps stand (counted) — never free. B-0a33 follow-up: the two are told apart —
    // an unreadable or unparsable file holds frames this process cannot see, so the reconcile holds off for its life
    if (!(err && err.code === 'ENOENT')) { unread = true; log('[queued] msg-queued.json could not be read — its waiting reservations stand (counted, never given up by this process): ' + (err && err.message)); }
  }

  function persist() {
    try {
      storeWriter().dirty(file, { name: STORE_NAME, debounceMs: 200, allowEmpty: true, produce: () => JSON.stringify({ v: 2, entries, ...(gone.length ? { gone } : {}) }) });
    } catch (e) { log('[queued] persist failed:', e.message); }
  }
  const remove = (e) => { entries = entries.filter((x) => x !== e); };
  /** BY AGE, IN A RUNNING HUB TOO (round 4, small): a live entry whose wrapper never came back, or a handed-back one whose words
   *  are gone from the stash, leaves after 7 days — at load, at every send's bound check, every turn start, every read, and hourly
   *  (the ladder's timer). Its unit aged out of every window days ago; the row says «not delivered» (the 'dropped' event). */
  function ageOut() {
    const t = now();
    reconcile();   // B-0a33 round 1: every sweep, the guard's waiting reservations against the live entries
    rejudge();   // B-0a33 (2): every sweep, the waiting frames against the caps as they are now
    const old = entries.filter((e) => isOld(e, t));
    if (!old.length) return 0;
    for (const e of old) remove(e);
    // B-0a33 (1): its unit is COUNTED where the hub stopped waiting (it may still run) — a waiting stamp past 7 days counts in
    // no window, so one the ledger already let go is taken again now (under its id); then ENDED there, so a run the record
    // sees later moves it to that run
    for (const e of old) {
      if (!live(e) || !e.reserved) continue;
      // idempotent by its id while the stamp stands; the note's own prune lets a 7-day stamp go first — then it is taken again now
      try { if (noteSpend) noteSpend({ reason: e.reason || 'peer-message', identity: e.identity || null, hold: null, reservation: e.id }); } catch (err) { log('[queued] counting an aged-out frame failed:', err.message); }
      endUnit(e);
    }
    for (const e of old) if (live(e)) giveUp(e, 'aged out (7 days)');   // B-0a33 (1): its process may still hold it (after the removal: a take-back answered at once finds the record, never the entry)
    log(`[queued] ${old.length} held entr${old.length === 1 ? 'y' : 'ies'} aged out (7 days) — not delivered`);
    persist();
    for (const e of old) emit('dropped', e, { why: 'aged out' });
    return old.length;
  }

  /** B-0a33: THE HUB STOPS WAITING for this frame (its process gone or replaced, its conversation archived, its entry aged out)
   *  and cannot tell whether it ran: the unit stays counted — never returned — in the hour the hub stopped waiting, and no
   *  longer holds the hour of every later authorize (a frame that can no longer run there is no turn that may run now). */
  function endUnit(e) {
    if (!e.reserved || !noteSpend) return;
    try { noteSpend({ reason: e.reason || 'peer-message', identity: e.identity || null, hold: null, reservation: e.id, ended: true }); } catch (err) { log('[queued] settling the reservation failed:', err.message); }
  }
  /** B-0a33 round 1: A WAITING STAMP NOBODY HOLDS IS LET GO, AND SAID TRULY. The guard's waiting reservations are this ladder's
   *  frames; one that no live entry holds (the release's unknown hand-backs read at the update, a crash between a carry and
   *  the guard's write, msg-queued.json lost) can no longer run through this hub's books: it ends as «given up» NOW, once —
   *  counted where the hub stopped waiting, never returned, and no longer said to wait. At load and at each sweep — never in a
   *  process whose msg-queued.json could not be READ (unread ≠ empty: it may hold the very frames those stamps pay for). */
  function reconcile() {
    if (unread || typeof waitingReservations !== 'function' || !noteSpend) return 0;   // a ledger this process could not read is no proof a frame is gone
    let rids = [];
    try { rids = waitingReservations() || []; } catch { return 0; }
    if (!rids.length) return 0;
    const held = new Set(entries.filter((e) => live(e) && e.reserved).map((e) => String(e.id)));
    let n = 0;
    for (const rid of rids) {
      if (held.has(String(rid))) continue;
      try { noteSpend({ reason: 'peer-message', identity: null, hold: null, reservation: String(rid), ended: true }); n++; } catch (err) { log('[queued] settling an unheld reservation failed:', err.message); }
    }
    if (n) log(`[queued] ${n} waiting reservation(s) held by no queued entry — given up now (counted here, never returned)`);
    return n;
  }
  /** B-0a33 (1): THE HUB GIVES UP ON A FRAME it cannot account for — it is remembered, bound to its queue item in the process
   *  that held it: seen there again ⇒ taken back out; seen leaving after a turn started there ⇒ counted where it ran.
   *  `stashed` = its words already ride the stash (a marked repeat): a take-back then delivers nothing twice. */
  function giveUp(e, why, { stashed = false } = {}) {
    if (!e || !Array.isArray(e.bind) || !e.bind.length) return;   // no queue item known: nothing to watch (said in its own log line)
    const m = mirrorOf(e.cid);
    const listed = !!m.ids && m.ids.has(e.bind[0]) && (!e.holder || !m.idsBy || m.idsBy === e.holder);
    const g = { id: e.id, cid: e.cid, bind: [e.bind[0]], holder: e.holder || null, reason: e.reason || null, identity: e.identity || null, at: now(), why: String(why || '').slice(0, 120), digest: e.digest, text: stashed ? null : e.text, fromName: e.fromName || null, kind: e.kind, stashed: !!stashed, seenSeq: listed ? m.idsSeq : 0, pulledAt: 0 };
    gone = [...gone.filter((x) => x.id !== e.id), g].slice(-MAX_ENTRIES);
    // its process's queue lists it right now: it still waits there — taken back out at once (it does not run)
    if (listed) { g.pulledAt = now(); if (pullSafely(e.cid, g.bind[0], g.holder)) log(`[queued] ${e.cid}: ${e.id}, given up (${g.why}), still waits in its agent's queue — asked back out, it does not run`); }
  }
  const pullSafely = (cid, item, holder) => { if (typeof pull !== 'function' || !item) return false; try { return pull(cid, item, holder || null) === true; } catch (err) { log('[queued] taking a frame back out failed:', err.message); return false; } };
  /** B-0a33 (1): the given-up frames of `cid` against what its process says now (a queue listing, a turn start). */
  function watchGone(cid) {
    if (!gone.length) return;
    const m = mirrorOf(cid);
    const t = now();
    let changed = false;
    for (const g of gone.slice()) {
      if (g.cid !== cid) continue;
      if (t - Number(g.at || 0) > LIVE_MAX_AGE_MS) { gone = gone.filter((x) => x !== g); changed = true; continue; }
      if (!m.ids || (g.holder && m.idsBy && m.idsBy !== g.holder)) continue;   // another process's queue never had it
      if (m.ids.has(g.bind[0])) {
        // STILL WAITING where the hub gave up on it: it does not run — taken back out (its words come back: noteHandedBack)
        if (g.seenSeq !== m.idsSeq) { g.seenSeq = m.idsSeq; changed = true; }
        if (!g.pulledAt || t - g.pulledAt >= PULL_RETRY_MS) { g.pulledAt = t; changed = true; if (pullSafely(cid, g.bind[0], g.holder)) log(`[queued] ${cid}: ${g.id}, given up (${g.why}), still waits in its agent's queue — asked back out, it does not run`); }
      } else if (g.seenSeq && m.startSeq > g.seenSeq && m.idsSeq > m.startSeq) {
        // it LEFT that queue after a turn started there: it ran — counted where it ran (its unit's instant moves to the run)
        gone = gone.filter((x) => x !== g); changed = true;
        if (noteSpend) { try { noteSpend({ reason: g.reason || 'peer-message', identity: g.identity || null, hold: null, reservation: g.id, carried: true }); } catch (err) { log('[queued] counting a given-up frame failed:', err.message); } }
        log(`[queued] ${cid}: ${g.id}, given up (${g.why}), ran in its agent after all — counted where it ran`);
      }
    }
    if (changed) persist();
  }
  /** B-0a33 (2): A CAP LOWERED BELOW WHAT ALREADY WAITS. The guard names the waiting reservations no cap holds now (the newest
   *  first); each one bound to its wrapper's queue item is TAKEN BACK OUT (see PULL_WHY's head). One that cannot be (no item
   *  known yet, no wrapper here that serves `remove`) is asked again at the next sweep, and said once. → how many were asked */
  function rejudge() {
    const verdict = typeof waitingOverCap === 'function' ? waitingOverCap : typeof waitingReservations === 'function' ? () => { const r = waitingReservations(); return r && Array.isArray(r.overCap) ? r.overCap : []; } : null;   // the guard's answer carries it
    if (!verdict) return 0;
    let rids = [];
    try { rids = verdict() || []; } catch { return 0; }
    if (!rids.length) return 0;
    const all = rids.includes('*');   // the ledger could not be read (B-3b0f): no wait can be judged — every waiting frame is held
    const over = new Set(rids.map(String));
    const t = now();
    let n = 0, changed = false;
    for (const e of entries) {
      if (!live(e) || !e.reserved || !(all || over.has(String(e.id)))) continue;
      if (e.pulled && t - Number(e.pulled.at || 0) < PULL_RETRY_MS) continue;
      e.pulled = { at: t, asked: true }; changed = true;   // marked BEFORE the ask: the wrapper's answer may arrive inside it
      const asked = pullSafely(e.cid, e.bind[0] || null, e.holder);
      if (asked) { e.pulled.asked = true; n++; continue; }
      delete e.pulled;   // never asked ⇒ no pause: asked again the moment it can be (its bind, its attach)
      if (!e.pullSaid) { e.pullSaid = true; log(`[queued] ${e.cid}: ${e.id} waits past a spending cap lowered below it and could not be asked back out now (${e.bind.length ? 'no agent here serves «remove» for it' : 'its queue item is not known yet'}) — asked again at the next sweep`); }
    }
    if (n) log(`[queued] ${n} waiting frame(s) asked back out of their agent's queue — a spending cap is now lower than what waits; they ride their conversation's next turn`);
    if (changed) persist();
    return n;
  }
  function returnUnit(e) {
    if (!e.reserved) return;
    e.reserved = false;
    if (!releaseSpend) return;
    try { releaseSpend({ reservation: e.id }); } catch (err) { log('[queued] returning the reservation failed:', err.message); }
  }
  function carry(e, how) {
    // the reservation is CONVERTED in the guard (round 3: marked, on disk at once — a later return of this id returns nothing)
    // hold: none — a carry converts the RESERVATION (its hold became the stamp at the write)
    // a STASH DRAIN rides somebody else's turn: it converts a stamp still there and never adds one; a LIVE carry (an unattended
    // turn ran it) whose stamp is gone (aged out, the file lost) is stamped now — counted in the window it runs in (round 4)
    if (noteSpend && (e.reserved || how !== 'stash')) { try { noteSpend({ reason: e.reason || 'peer-message', identity: e.identity || null, hold: null, reservation: e.id, carried: true, drain: how === 'stash' }); } catch (err) { log('[queued] the conversion mark failed (the unit stays counted):', err.message); } }
    e.reserved = false;
    remove(e); persist();   // the unit was taken at the write (the reservation) — a carry charges nothing more
    emit('carried', e, { how });
  }
  function handBack(e, reason) {
    returnUnit(e);
    if (e.mark) { e.state = 'restashed'; e.startsAt = mirrorOf(e.cid).starts; e.backAt = now(); e.backWhy = String(reason || '').slice(0, 200); }
    else remove(e);
    persist();
    emit('back', e, { reason: reason || null });
  }

  /** KNOWN NOT RUN — THE ONE PREDICATE every exit that returns a unit reads (round 4, MUST 1): the frame's item is in a queue
   *  listing that is FRESH (the wrapper read it now — never a cached re-statement, never an old wrapper's unmarked list), stated
   *  by the process that holds the frame, and NEWER than every turn start the hub has seen for that conversation. Anything else
   *  is unknown: the unit stays, the words are marked. */
  function knownNotRun(e) {
    const m = mirrorOf(e.cid);
    return e.bind.length > 0 && !!m.ids && m.idsFresh === true && m.idsSeq > m.startSeq && (!e.holder || !m.idsBy || m.idsBy === e.holder) && e.bind.every((id) => m.ids.has(id));
  }
  /** before a marked copy: the guard may KNOW it ran (converted) — then it is simply carried, no second copy (round 4, small) */
  const ranPerGuard = (e) => { try { return !!reservationState && reservationState(e.id) === 'converted'; } catch { return false; } };
  /** THE HUB CANNOT TELL whether the frame ran (a restart with no queue seen and no process to ask): unknown counts as
   *  OWED — the reservation stays (it ages out of the windows), and the words ride the next turn ONCE, marked as a
   *  possible repeat. Carried (read) when that stash entry drains. */
  function unknownBack(e, reason, stash) {
    if (ranPerGuard(e)) { carry(e, 'converted'); return; }
    endUnit(e);   // B-0a33: it may have run, it will not run there now — counted in this hour, no longer in every later one
    let stashed = false;
    try { if (typeof stash === 'function' && e.text) { stash(publicOf(e), { text: REPEAT_HEAD + e.text, fromName: e.fromName, kind: e.kind, ref: REF + e.id }); stashed = true; } } catch (err) { log('[queued] the hand-back stash failed:', err.message); }
    if (e.mark) { e.state = 'restashed'; e.repeat = true; e.backAt = now(); e.backWhy = String(reason || '').slice(0, 200); }
    else { e.reserved = false; remove(e); }   // nothing to mark: the unit stays in the guard (counted), the words ride the stash
    giveUp(e, reason, { stashed });   // B-0a33 (1): «gone» may be wrong — watched in its process's queue (after the entry left the live set)
    persist();
    emit('back', e, { reason: reason || null, unknown: true });
  }
  // ── the ladder's side ───────────────────────────────────────────────────
  /** Refused at the send, by name, before any frame is written: a money record is bounded, never forgotten. */
  function full(cid) {
    ageOut();
    const n = entries.filter((e) => e.cid === cid && live(e)).length;
    if (n >= PER_CONVERSATION_MAX) return `${n} messages already wait behind this conversation's running turn (the bound is ${PER_CONVERSATION_MAX}) — this one is not sent now`;
    if (entries.filter(live).length >= MAX_ENTRIES) return `${entries.length} messages already wait behind running turns on this hub (the bound is ${MAX_ENTRIES}) — this one is not sent now`;
    return null;
  }
  /** A peer frame was just written to a wrapper whose conversation is in a turn. `charged` = the ladder's authorization
   *  ({reason, identity, hold, session}) — it becomes the RESERVATION here (its hold converted into a stamp named by this
   *  entry's id). `mark` = what a group wake must move when it is carried ({gid, upTo}) or null. */
  function noteWritten(cid, { charged = null, text = '', kind = 'peer', fromName = null, mark = null, since = null, peerName = null, holder = null, waitKey = null } = {}) {
    const m = mirrorOf(cid);
    const e = {
      id: `qw-${boot}-${++seq}`, cid, at: now(), kind, text: String(text || ''), fromName: fromName || null, digest: digestOf(text), state: 'pending', reserved: false,
      reason: charged && charged.reason ? charged.reason : null, identity: charged && charged.identity ? { key: charged.identity.key, name: charged.identity.name || charged.identity.key } : null,
      mark: mark && mark.gid ? { gid: mark.gid, upTo: Number(mark.upTo) } : null, since: Number.isFinite(since) ? since : null, peerName, holder: holder || null,
      idsAtWrite: m.ids ? [...m.ids] : null, bind: [], startsAt: m.starts, endsAt: m.ends,
    };
    if (charged && noteSpend) {
      try { noteSpend({ reason: charged.reason || 'peer-message', identity: charged.identity || null, hold: charged.hold || null, session: charged.session || null, reservation: e.id, behind: waitKey ? { key: waitKey, name: peerName || '' } : null }); e.reserved = true; }
      catch (err) { log('[queued] the reservation was not recorded (its authorization hold stands until it expires):', err.message); }
    }
    entries.push(e);
    persist();
    return publicOf(e);
  }
  /** The wrapper's verdict about the frame `id` (the ladder's FIFO settle found it). → 'carried' | 'queued' | 'back' | null */
  function answer(id, { ok = true, mode = null } = {}) {
    const e = entries.find((x) => x.id === id);
    if (!e || e.state !== 'pending') return null;
    if (ok === false) { handBack(e, 'the wrapper did not take it'); return 'back'; }
    if (mode === 'queued') {
      const m = mirrorOf(e.cid);
      e.state = 'queued'; e.startsAt = m.starts; e.endsAt = m.ends;
      bindNew(e.cid);
      persist();
      return 'queued';
    }
    carry(e, mode || 'turn');   // 'turn' (or a mode this module does not know): a turn took it now — the reservation is its unit
    return 'carried';
  }
  /** No answer within the settle window: the entry stays (reserved, waiting — law 2's bound speaks for it), unbound. */
  function unanswered(id) {
    const e = entries.find((x) => x.id === id);
    if (!e) return;
    if (e.state === 'pending') e.state = 'queued';
    persist();
  }

  // ── the wrapper's records (src/server/stdout/acp-events.js, codex-events.js) ──
  /** A RECORD'S STATE IS WHAT ITS ADDRESSEE DID WITH THAT FRAME (law 1; follow-up 2026-11-13): an entry binds only an item
   *  that CAN be its frame — the listing says a peer frame (its kind), from its sender (its `from`), where the listing states
   *  them — and the EARLIEST such in queue order (the wrapper queues in write order). Never «the newest unseen id»: a person's
   *  line or another peer's frame listed first is not this frame. Nothing that can be it ⇒ unbound (the turn-order fallback). */
  function bindNew(cid) {
    const m = mirrorOf(cid);
    if (!m.ids) return;
    const meta = m.meta || new Map();
    const canBe = (id, e) => { const it = meta.get(id); if (!it) return true; if (it.kind && it.kind !== 'peer') return false; return !(it.from && e.fromName && it.from !== e.fromName); };
    const taken = new Set(entries.filter((x) => x.cid === cid).flatMap((x) => x.bind));
    for (const e of entries) {
      if (e.cid !== cid || e.state !== 'queued' || e.bind.length) continue;
      const before = new Set(e.idsAtWrite || []);
      const fresh = [...m.ids].filter((id) => !before.has(id) && !taken.has(id) && canBe(id, e));
      if (!fresh.length) break;   // oldest first: a later entry never takes an earlier one's item
      e.bind = [fresh[0]];
      taken.add(e.bind[0]);
    }
  }
  function sweep(cid) {
    const m = mirrorOf(cid);
    let carriedFallback = false;
    for (const e of entries.slice()) {
      if (e.cid !== cid) continue;
      if (e.state === 'restashed') continue;   // carried when the stash entry holding its words is drained (noteStashDrained)
      if (e.state !== 'queued') continue;
      if (e.bind.length) {
        const gone = !!m.ids && e.bind.every((id) => !m.ids.has(id));
        if (gone && (m.starts > e.startsAt || (e.rebooted && m.fresh))) carry(e, 'its-turn');
      } else if (!carriedFallback && m.starts > e.startsAt && m.ends > e.endsAt) {
        carriedFallback = true;   // nothing bound: one queued frame per turn start after the running turn ended, oldest first
        carry(e, 'fifo');
      }
    }
  }
  function noteQueue(cid, items, holder = undefined, { fresh = false } = {}) {
    const m = mirrorOf(cid);
    m.ids = new Set(idsOf(items)); m.fresh = true; m.idsSeq = ++m.seq; m.idsFresh = fresh === true; m.idsBy = holder || null;
    // what each listed item IS, as the wrapper states it (agy / codex: kind 'peer' | 'user' | 'system', `from` = a peer's name) —
    // what bindNew matches a frame by (follow-up 2026-11-13: never «the newest», whatever it is)
    m.meta = new Map((Array.isArray(items) ? items : []).filter((it) => it && typeof it === 'object' && typeof it.id === 'string' && it.id).map((it) => [it.id, { kind: typeof it.kind === 'string' ? it.kind : null, from: typeof it.from === 'string' && it.from ? it.from : null }]));
    bindNew(cid); sweep(cid); watchGone(cid);
    m.fresh = false;
    rejudge();   // B-0a33 (2): a frame bound just now may be one a lowered cap no longer holds
  }
  function noteTurnStarted(cid) { ageOut(); const m = mirrorOf(cid); m.starts++; m.startSeq = ++m.seq; sweep(cid); }
  function noteTurnEnded(cid) { mirrorOf(cid).ends++; }
  /** A mode-less `ok:false` answer with the words (Stop / remove / the wrapper's exit handed an EARLIER queued item
   *  back): matched by its text to the oldest entry still held for it. → true when one was ours */
  function noteHandedBack(cid, text, reason = null, stash = null) {
    const d = digestOf(text);
    const e = entries.find((x) => x.cid === cid && live(x) && x.digest === d);
    if (!e) {
      // B-0a33 (1): a frame the hub had given up on, taken back out of its process's queue — it did not run; its words ride the
      // stash now, unless a marked repeat of them already does (never twice, never dropped)
      const g = gone.find((x) => x.cid === cid && x.digest === d);
      if (!g) return false;
      gone = gone.filter((x) => x !== g);
      try { if (!g.stashed && typeof stash === 'function' && g.text) stash({ id: g.id, cid: g.cid, kind: g.kind }, { text: g.text, fromName: g.fromName, kind: g.kind, ref: REF + g.id }); } catch (err) { log('[queued] the hand-back stash failed:', err.message); }
      log(`[queued] ${cid}: ${g.id}, given up (${g.why}), came back out of its agent's queue unrun — ${g.stashed ? 'its marked copy already waits for the next turn' : 'its words wait for the next turn'}`);
      persist();
      return true;
    }
    // B-0a33 (2): a frame taken back for a lowered cap is HELD — said as the spending ceiling's in the stash, and kept there
    // past the stash's cap (bounded by PER_CONVERSATION_MAX): never dropped
    const capHeld = !!(e.pulled && e.pulled.asked);
    try { if (typeof stash === 'function' && e.text) stash(publicOf(e), { text: e.text, fromName: e.fromName, kind: e.kind, ref: REF + e.id, ...(capHeld ? { held: { kind: 'spend-cap', why: 'cap-lowered', capHeld: true } } : {}) }); } catch (err) { log('[queued] the hand-back stash failed:', err.message); }
    handBack(e, capHeld ? PULL_WHY : (reason || 'handed back'));   // B-0a33 (2): a take-back says why it was held (asked = marked before the ask)
    return true;
  }
  /** The stash HANDED a held-back frame's words to a turn (its `drained` event names the ref): that record is read now. */
  function noteStashDrained(cid, refs) {
    for (const r of refs || []) {
      if (typeof r !== 'string' || !r.startsWith(REF)) continue;
      const e = entries.find((x) => x.cid === cid && x.state === 'restashed' && x.id === r.slice(REF.length));
      if (e) carry(e, 'stash');
    }
  }
  /** THE PROCESS THAT HOLDS THE FRAME (round 2): a turn start or a queue from ANOTHER wrapper process (a resume, a new pid)
   *  — or from none — never carries a frame the old one held: the hub hands it back instead. `holder` null = no process;
   *  undefined = unknown (nothing is judged). → the entries handed back */
  function noteHolder(cid, holder, stash) {
    if (holder === undefined || holder === null) return [];   // round 3: «not attached yet» / a re-attach's null pty is not a fact about the process
    const m = mirrorOf(cid);
    const gone = entries.filter((e) => e.cid === cid && live(e) && e.holder && e.holder !== holder);
    for (const e of gone) {
      if (knownNotRun(e)) {   // the OLD process's last fresh queue, newer than every turn start, held it
        try { if (typeof stash === 'function' && e.text) stash(publicOf(e), { text: e.text, fromName: e.fromName, kind: e.kind, ref: REF + e.id }); } catch (err) { log('[queued] the hand-back stash failed:', err.message); }
        handBack(e, 'its process was replaced (the new one never got it)');
      } else unknownBack(e, 'its process was replaced — whether it ran is not known', stash);
    }
    return gone.map(publicOf);
  }
  /** The stash EVICTED a held-back frame's words (its cap) — or the conversation was archived / deleted: the entry leaves
   *  (said), so it never fills the hub's bound or reloads at every boot. The unit: returned only if KNOWN not run. */
  function noteStashEvicted(cid, refs) {
    for (const r of refs || []) {
      if (typeof r !== 'string' || !r.startsWith(REF)) continue;
      const e = entries.find((x) => x.cid === cid && x.state === 'restashed' && x.id === r.slice(REF.length));
      if (e) { log(`[queued] ${cid}: the stash dropped the words of ${e.id} (its cap) — the entry leaves`); remove(e); persist(); emit('dropped', e, { why: 'evicted' }); }
    }
  }
  function dropConversation(cid, why = 'archived') {
    const m = mirrorOf(cid);
    const mine = entries.filter((e) => e.cid === cid);
    for (const e of mine) {
      // its unit is returned only when KNOWN not run (the last queue its process published held it); else it stays counted
      const watch = live(e) && !knownNotRun(e);
      if (live(e) && knownNotRun(e)) returnUnit(e);
      else if (live(e)) endUnit(e);   // B-0a33: unknown — counted, placed in this hour
      remove(e); emit('dropped', e, { why });
      if (watch) giveUp(e, `its conversation was ${why}`);   // B-0a33 (1): watched in its process's queue
    }
    if (mine.length) { log(`[queued] ${cid}: ${mine.length} held entr${mine.length === 1 ? 'y' : 'ies'} dropped — the conversation was ${why} (its units stay counted; they age out)`); persist(); }
    return mine.length;
  }
  /** THE WRAPPER IS GONE (its process ended — a crash, a kill, an exit while the hub was down): the hub holds the words,
   *  so the HUB hands each held frame back to the next-turn road (`stash(entry)` — delivered once, at the conversation's
   *  next turn) and returns its reservation. → the entries handed back */
  function handBackGone(cid, stash, reason = 'its process is gone') {
    const m = mirrorOf(cid);
    const mine = entries.filter((e) => e.cid === cid && live(e));
    for (const e of mine) {
      if (knownNotRun(e)) {
        try { if (typeof stash === 'function' && e.text) stash(publicOf(e), { text: e.text, fromName: e.fromName, kind: e.kind, ref: REF + e.id }); } catch (err) { log('[queued] the hand-back stash failed:', err.message); }
        handBack(e, reason);
      } else unknownBack(e, reason + ' — whether it ran is not known', stash);
    }
    return mine.map(publicOf);
  }
  /** AT BOOT, for a held entry whose conversation has no attached process: `alive(pid)` true ⇒ kept (asked at its attach —
   *  absence is not a fact); dead ⇒ the guard's word decides (converted = it ran: carried, no second copy), else unknown. */
  function bootSettle(cid, { alive = () => undefined, converted = () => null, stash } = {}) {
    const out = [];
    for (const e of entries.filter((x) => x.cid === cid && live(x) && x.rebooted)) {
      const a = e.holder ? alive(e.holder) : undefined;
      if (a !== false) continue;   // alive, or cannot be told: kept, the unit counted
      if (converted(e.id) === 'converted') { carry(e, 'converted'); out.push('carried'); continue; }
      unknownBack(e, 'its process ended while VibeSpace was restarting', stash); out.push('unknown');
    }
    return out;
  }

  reconcile();   // B-0a33 round 1: at load — a ledger's waiting stamps no entry on disk holds end now
  return {
    noteWritten, answer, unanswered, noteQueue, noteTurnStarted, noteTurnEnded, noteHandedBack, handBackGone, noteStashDrained, noteHolder, bootSettle, noteStashEvicted, dropConversation, full,
    onDropped: (fn) => { listeners.dropped.add(fn); for (const e of droppedAtLoad.splice(0)) { try { fn(e.cid, publicOf(e), { why: 'aged out' }); } catch (err) { log('[queued] listener failed:', err.message); } } return () => listeners.dropped.delete(fn); },
    knownNotRun: (id) => { const e = entries.find((x) => x.id === id); return !!e && knownNotRun(e); },
    onCarried: (fn) => { listeners.carried.add(fn); return () => listeners.carried.delete(fn); },
    onHandedBack: (fn) => { listeners.back.add(fn); return () => listeners.back.delete(fn); },
    entriesFor: (cid) => { ageOut(); return entries.filter((e) => !cid || e.cid === cid).map(publicOf); },
    heldCids: () => { ageOut(); return [...new Set(entries.filter(live).map((e) => e.cid))]; },
    ageOut, reconcile, rejudge,
    goneFor: (cid) => gone.filter((g) => !cid || g.cid === cid).map((g) => ({ id: g.id, cid: g.cid, why: g.why, at: g.at, stashed: !!g.stashed })),   // B-0a33 (1)
    count: () => entries.length,
  };
}

module.exports = { create, digestOf, FILE, STORE_NAME, STATES, MAX_ENTRIES, PER_CONVERSATION_MAX, REF, REPEAT_HEAD, RESTASHED_MAX_AGE_MS, LIVE_MAX_AGE_MS, PULL_RETRY_MS, PULL_WHY };

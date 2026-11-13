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

const digestOf = (text) => crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 24);
const idsOf = (items) => (Array.isArray(items) ? items.map((it) => (it && typeof it === 'object' ? it.id : it)).filter((x) => typeof x === 'string' && x) : []);
const live = (e) => e.state === 'pending' || e.state === 'queued';

function create({ dataDir, noteSpend = null, releaseSpend = null, reservationState = null, stashHas = null, log = () => { }, now = () => Date.now(), writer = null, readFile = null, rand = () => crypto.randomBytes(4).toString('hex') } = {}) {
  const file = path.join(dataDir, FILE);
  const storeWriter = () => writer || require('../store-writer.js').storeWriter();
  const boot = rand();   // ids never repeat across processes: a reservation is idempotent by its id
  let seq = 0;
  let entries = [];
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
  try {
    const raw = typeof readFile === 'function' ? readFile(file) : require('fs').readFileSync(file, 'utf8');
    const j = JSON.parse(raw);
    if (j && Array.isArray(j.entries)) {
      entries = j.entries.filter((e) => e && typeof e.cid === 'string' && typeof e.id === 'string' && STATES.includes(e.state))
        .filter((e) => { const old = isOld(e, now()); if (old) droppedAtLoad.push(e); return !old; })   // by age (rounds 3–4) — said
        .map((e) => ({ ...e, bind: Array.isArray(e.bind) ? e.bind.filter((x) => typeof x === 'string') : [], startsAt: 0, endsAt: 0, rebooted: true }));
    }
  } catch { /* none, or unreadable: the guard's stamps stand (counted) — never free */ }

  function persist() {
    try {
      storeWriter().dirty(file, { name: STORE_NAME, debounceMs: 200, allowEmpty: true, produce: () => JSON.stringify({ v: 2, entries }) });
    } catch (e) { log('[queued] persist failed:', e.message); }
  }
  const remove = (e) => { entries = entries.filter((x) => x !== e); };
  /** BY AGE, IN A RUNNING HUB TOO (round 4, small): a live entry whose wrapper never came back, or a handed-back one whose words
   *  are gone from the stash, leaves after 7 days — at load, at every send's bound check, every turn start, every read, and hourly
   *  (the ladder's timer). Its unit aged out of every window days ago; the row says «not delivered» (the 'dropped' event). */
  function ageOut() {
    const t = now();
    const old = entries.filter((e) => isOld(e, t));
    if (!old.length) return 0;
    for (const e of old) remove(e);
    log(`[queued] ${old.length} held entr${old.length === 1 ? 'y' : 'ies'} aged out (7 days) — not delivered`);
    persist();
    for (const e of old) emit('dropped', e, { why: 'aged out' });
    return old.length;
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
    try { if (typeof stash === 'function' && e.text) stash(publicOf(e), { text: REPEAT_HEAD + e.text, fromName: e.fromName, kind: e.kind, ref: REF + e.id }); } catch (err) { log('[queued] the hand-back stash failed:', err.message); }
    if (e.mark) { e.state = 'restashed'; e.repeat = true; e.backAt = now(); e.backWhy = String(reason || '').slice(0, 200); }
    else { e.reserved = false; remove(e); }   // nothing to mark: the unit stays in the guard (counted), the words ride the stash
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
  function noteWritten(cid, { charged = null, text = '', kind = 'peer', fromName = null, mark = null, since = null, peerName = null, holder = null } = {}) {
    const m = mirrorOf(cid);
    const e = {
      id: `qw-${boot}-${++seq}`, cid, at: now(), kind, text: String(text || ''), fromName: fromName || null, digest: digestOf(text), state: 'pending', reserved: false,
      reason: charged && charged.reason ? charged.reason : null, identity: charged && charged.identity ? { key: charged.identity.key, name: charged.identity.name || charged.identity.key } : null,
      mark: mark && mark.gid ? { gid: mark.gid, upTo: Number(mark.upTo) } : null, since: Number.isFinite(since) ? since : null, peerName, holder: holder || null,
      idsAtWrite: m.ids ? [...m.ids] : null, bind: [], startsAt: m.starts, endsAt: m.ends,
    };
    if (charged && noteSpend) {
      try { noteSpend({ reason: charged.reason || 'peer-message', identity: charged.identity || null, hold: charged.hold || null, session: charged.session || null, reservation: e.id }); e.reserved = true; }
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
    bindNew(cid); sweep(cid);
    m.fresh = false;
  }
  function noteTurnStarted(cid) { ageOut(); const m = mirrorOf(cid); m.starts++; m.startSeq = ++m.seq; sweep(cid); }
  function noteTurnEnded(cid) { mirrorOf(cid).ends++; }
  /** A mode-less `ok:false` answer with the words (Stop / remove / the wrapper's exit handed an EARLIER queued item
   *  back): matched by its text to the oldest entry still held for it. → true when one was ours */
  function noteHandedBack(cid, text, reason = null, stash = null) {
    const d = digestOf(text);
    const e = entries.find((x) => x.cid === cid && live(x) && x.digest === d);
    if (!e) return false;
    try { if (typeof stash === 'function' && e.text) stash(publicOf(e), { text: e.text, fromName: e.fromName, kind: e.kind, ref: REF + e.id }); } catch (err) { log('[queued] the hand-back stash failed:', err.message); }
    handBack(e, reason || 'handed back');
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
      if (live(e) && knownNotRun(e)) returnUnit(e);
      remove(e); emit('dropped', e, { why });
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

  return {
    noteWritten, answer, unanswered, noteQueue, noteTurnStarted, noteTurnEnded, noteHandedBack, handBackGone, noteStashDrained, noteHolder, bootSettle, noteStashEvicted, dropConversation, full,
    onDropped: (fn) => { listeners.dropped.add(fn); for (const e of droppedAtLoad.splice(0)) { try { fn(e.cid, publicOf(e), { why: 'aged out' }); } catch (err) { log('[queued] listener failed:', err.message); } } return () => listeners.dropped.delete(fn); },
    knownNotRun: (id) => { const e = entries.find((x) => x.id === id); return !!e && knownNotRun(e); },
    onCarried: (fn) => { listeners.carried.add(fn); return () => listeners.carried.delete(fn); },
    onHandedBack: (fn) => { listeners.back.add(fn); return () => listeners.back.delete(fn); },
    entriesFor: (cid) => { ageOut(); return entries.filter((e) => !cid || e.cid === cid).map(publicOf); },
    heldCids: () => { ageOut(); return [...new Set(entries.filter(live).map((e) => e.cid))]; },
    ageOut,
    count: () => entries.length,
  };
}

module.exports = { create, digestOf, FILE, STORE_NAME, STATES, MAX_ENTRIES, PER_CONVERSATION_MAX, REF, REPEAT_HEAD, RESTASHED_MAX_AGE_MS, LIVE_MAX_AGE_MS };

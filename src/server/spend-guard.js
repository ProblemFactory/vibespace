'use strict';
// THE SPEND AUTHORIZER'S ORCH HALF (docs/design-account-hardening.md §4.4c,
// P9). The decision is PURE (src/spend-authorizer.js); this module is the only
// thing that reads the ledger off disk, names the identity, asks the usage
// cache about paid overage, writes the journal line, files the inbox item and
// persists the counters across a restart.
//
// TWO PHASE, exactly like the loop breaker's canFire/noteFired: `authorize()`
// answers, `note()` charges. An authorization that never becomes a turn (the
// session died between the gate and the write, the pty refused the frame) must
// not consume budget — and, symmetrically, a turn that DID happen must be
// charged even if the caller then fails to render a card.
//
// …AND THE TWO PHASES ARE NOT ONE INSTANT (r5, reproduced). Whatever a producer
// does in between is invisible to the ledger, so five deliveries dispatched in
// one synchronous pass all read the same pre-charge counts and all five are
// authorized against a cap of two. `authorize()` therefore HOLDS what it
// authorized (`v.hold`, an in-memory reservation that binds exactly like a
// charge) until `note()` converts it, `release()` gives it back, or it times
// out at A.RESERVE_TTL_MS. A hold is deliberately not a stamp: the ladder's
// stash rung — its normal fallback for an unreachable conversation — opens no
// turn, and a charge there would be a turn that never happened.
// HOLDS ARE NOT PERSISTED, on purpose: a restart kills the in-flight
// deliveries they stand for, and a hold that outlived its producer would refuse
// real turns for its whole TTL after every boot.
//
// PERSISTENCE IS THE POINT. `data/spend-budget.json` survives a restart for the
// same reason the armed auto-resume waits do: a release restart that hands the
// automatic spenders a fresh hourly budget is not a ceiling, it is a
// scheduling detail. This instance restarts several times a day.
//
// NO NEW VENDOR SURFACE (§ban-safety): every input is a file we already hold —
// the usage cache the passive capture writes, the credential state reader the
// pool already asks, and our own ledger. scripts/test-vendor-whitelist.mjs
// must stay unchanged by this module.
const fs = require('fs');
const path = require('path');
const A = require('../spend-authorizer.js');

function writeJsonAtomic(file, obj) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(obj));
  fs.renameSync(file + '.tmp', file);
}

const REFUSE_LOG_MS = 5 * 60 * 1000;      // one journal line per (reason, identity, why)
const REFUSE_INBOX_MS = 6 * 60 * 60 * 1000; // one "For you" item per (identity, why)
const INBOX_KEY = 'accounts';
const LEDGER_RECHECK_MS = 60 * 1000;     // B-3b0f: an unreadable ledger is read again at most this often
const LEDGER_ITEM = 'spend-ledger-unreadable';   // B-3b0f: the notice's identity (one For-you item, across restarts)
const WAIT_CAPS = Object.freeze({ 'hour-cap': 1, 'day-cap': 1, 'instance-cap': 1 });   // B-0a33 round 1: the caps waiting frames can hold             // the same inbox row login-expiry-watch files under
// WHAT A NOTICE IS ABOUT DECIDES WHEN IT DIES (2.369.152, "SPEND NOTICES LIVED
// FOREVER AS ACTIONS"): every inbox item this module files carries the end of
// the window it talks about as `expiresAt`, and the store resolves it
// 'expired' then. 13 warnings about hour/day windows that had closed 137–288 h
// earlier were still open on the owner's instance.
const NOTICE_TTL_MS = {
  hour: 60 * 60 * 1000,        // "… this hour (83%)" — the rolling hour it counts
  day: 24 * 60 * 60 * 1000,    // "… today (80%)" (per identity, and the instance's day)
  refusal: REFUSE_INBOX_MS,    // a refusal is re-filed at most every 6 h — its own cadence
};
/** @param about 'hour' | 'day' | 'instance' | 'refusal' */
function noticeExpiry(about, now = Date.now()) {
  const ttl = about === 'hour' ? NOTICE_TTL_MS.hour : about === 'refusal' ? NOTICE_TTL_MS.refusal : NOTICE_TTL_MS.day;
  return now + ttl;
}

/**
 * @param deps.dataDir            data/ root
 * @param deps.serverSetting      (key) => value  — the four D6 numbers + policies
 * @param deps.identityOf         (session) => {key,name}|null — the engine's OWN answer
 *        (fireIdentityFor = wallSlotFor's key): the credential slot a turn started
 *        right now would bill. NEVER a derivation of this module's own.
 * @param deps.readCacheFor       (key) => raw usage-cache object|null (overage)
 * @param deps.credentialStateOf  (key) => {usable:boolean, state:string}|null
 * @param deps.getUserTodos       () => UserTodoManager — where a refusal reaches the
 *        user. LAZY: this module is constructed with the pool engine, and the
 *        inbox is created further down the boot (TDZ otherwise).
 * @param deps.log                console.log
 */
function create({ dataDir, serverSetting = () => undefined, identityOf = null, readCacheFor = null, credentialStateOf = null, getUserTodos = () => null, log = () => { }, schedule = (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; }, unschedule = (t) => clearTimeout(t) } = {}) {
  const file = path.join(dataDir, 'spend-budget.json');
  let state = A.emptyBudget();
  let nudge = {};   // sessionKey -> {at, n, everSeenStatus} (the Stop nudge's PERSISTED cooldown)
  // B-3b0f: THE LEDGER FAILS CLOSED ON ITS OWN RECORD. A file that is there and cannot be read (torn JSON, a directory, a
  // read error) used to start an EMPTY budget — the count restarted and unattended turns were authorized as if none had
  // been spent; and the next persist renamed that empty ledger OVER the file, so one restart made it permanent. Now ENOENT
  // (nothing spent yet) is told apart from UNREADABLE: unreadable ⇒ every unattended reason is refused by name
  // ('ledger-unreadable'), the file is never written over, and it is read again at most once a LEDGER_RECHECK_MS — it
  // reads again ⇒ its stamps and the ones made meanwhile both count; it is gone (the owner removed it) ⇒ the count starts over
  let unreadable = null;     // {error, since} while the file is there and cannot be read
  let recheckAt = 0;
  // the ONE read of the file (the load and the re-read): its text, `missing` (ENOENT), or the error that kept it unread
  const readText = () => { try { return { text: fs.readFileSync(file, 'utf-8') }; } catch (e) { return e && e.code === 'ENOENT' ? { missing: true } : { error: String((e && e.code) || 'read failed') }; } };
  const parseLedger = (t) => {
    if (t.text === undefined) return t;
    let raw; try { raw = JSON.parse(t.text); } catch { return { error: 'not JSON' }; }
    // a ledger is an object holding a `budget` object (what writeNow writes) or, an older build's, the budget itself
    const obj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
    return obj(raw) && (obj(raw.budget) || (!('budget' in raw) && (obj(raw.identities) || Array.isArray(raw.instance)))) ? { raw } : { error: 'not a ledger object' };
  };
  const loaded = parseLedger(readText());
  if (loaded.error) {
    unreadable = { error: loaded.error, since: Date.now() };
    recheckAt = unreadable.since;
    log(`[spend] data/spend-budget.json could not be read (${loaded.error}) — unattended turns are refused until it reads again or is removed; it is not written over`);
  }
  {
    const raw = loaded.raw;
    if (raw) {
      // PRUNE WIDE AT LOAD (r5, reproduced) — see A.LOAD_RETENTION. Retention is
      // a function of the caps (r2), but HERE THE CAPS ARE NOT KNOWABLE:
      // server.js builds this guard ~318 lines before `setupPersistence()`
      // assigns `persistenceRouter.readSettings`, so `serverSetting` answers
      // `undefined` for every key and `A.budgetLimits()` hands back the
      // DEFAULTS. With an owner day cap of 500 and 400 same-day stamps on disk,
      // that cut the ledger to 264 on EVERY BOOT and forgave 136 unattended
      // turns each time. Dropping a stamp is irreversible and forgives money;
      // keeping one costs bounded memory. The first `note()` re-prunes with the
      // live limits.
      state = A.pruneBudget(raw.budget || raw, Date.now(), A.LOAD_RETENTION);
      if (raw.nudge && typeof raw.nudge === 'object') nudge = raw.nudge;
    }
  }
  /** B-3b0f: read an unreadable ledger again (bounded). true when it reads again or is gone — the refusal ends. */
  function recheckLedger(now) {
    if (!unreadable || now - recheckAt < LEDGER_RECHECK_MS) return false;
    recheckAt = now;
    const r = parseLedger(readText());
    if (r.error) { unreadable.error = r.error; return false; }
    // stamps made meanwhile (an attended press, a carried frame) are KEPT beside the file's: a stamp is never dropped (a frame
    // carried meanwhile may then count twice — its file stamp and its fresh one — for a day: the safe direction)
    if (r.raw) {
      state = A.mergeBudget(A.pruneBudget(r.raw.budget || r.raw, now, A.LOAD_RETENTION), state);
      if (r.raw.nudge && typeof r.raw.nudge === 'object') nudge = { ...r.raw.nudge, ...nudge };
    }
    log(r.raw ? '[spend] data/spend-budget.json reads again — unattended turns are counted and allowed again' : '[spend] data/spend-budget.json was removed — the count starts over from the turns since the hub started');
    unreadable = null;
    try { const ut = getUserTodos(); if (ut && typeof ut.idsWhere === 'function') for (const id of ut.idsWhere((i) => i && i.itemKey === LEDGER_ITEM && i.status === 'open')) ut.setStatus(id, 'done', 'agent'); } catch { }   // its notice is no longer true
    return true;
  }
  const spoke = new Map();   // journal dedup: `${reason}|${key}|${why}` -> {at, more, line, timer} (`more` = refusals the window swallowed)
  // r2 (measured: five refusals in a minute ⇒ ONE line, and with no later refusal the other four were never journaled):
  // a window that SWALLOWED refusals is FLUSHED when it ends — one bounded timer per signature, armed at the first
  // swallowed refusal for the window's end, unref'd; a refusal after the end still carries the count on its own line
  const flushSpoke = (sig) => {
    const sp = spoke.get(sig);
    if (!sp) return;
    if (sp.timer) { try { unschedule(sp.timer); } catch { } sp.timer = null; }
    if (sp.more > 0) { log(`${sp.line} — (+${sp.more} more in the last 5 min)`); sp.more = 0; }
  };
  let chargesUnhinted = 0;   // charges that made this module resolve the identity itself (see identityFor)
  let lastUnhintedLog = 0;
  let pending = [];          // the live HOLDS (see the header) — in memory only
  let holdSeq = 0;
  let holdsExpired = 0;      // CENSUS: holds nobody converted or gave back
  let lastHoldLog = 0;
  let timer = null;
  const writeNow = () => {
    if (unreadable) recheckLedger(Date.now());
    if (unreadable) {   // B-3b0f: never written over while it cannot be read — the empty count must not become the record
      if (!unreadable.saidWrite) { unreadable.saidWrite = true; log('[spend] data/spend-budget.json is not written while it cannot be read'); }
      return;
    }
    try { writeJsonAtomic(file, { v: 1, budget: state, nudge }); }
    catch (e) { log('[spend] persist failed: ' + e.message); }
  };
  const persist = () => { if (timer) return; timer = setTimeout(() => { timer = null; writeNow(); }, 500); if (timer.unref) timer.unref(); };
  const flush = () => { if (timer) { clearTimeout(timer); timer = null; } writeNow(); };

  const limits = () => A.budgetLimits(serverSetting);
  // B-0a33 (2) × B-3b0f: while the ledger cannot be read no wait can be judged — '*' = every waiting frame is held
  const overCapNow = (now) => (unreadable ? ['*'] : A.waitingOverCap(state, limits(), now));
  const overagePolicy = () => (serverSetting('spend.allowOverageTurns') === true ? 'allow' : 'refuse');

  /** Retire the holds whose producer never came back. THE COUNT IS A CENSUS,
   *  not garbage collection: a hold that timed out is a site that authorized a
   *  spend and never said whether it happened — the shape a grep over the call
   *  sites cannot see, and the same kind of production counter as
   *  `chargesUnhinted`. scripts/test-spend-paths.mjs §5d drives all five
   *  producers and asserts it stays 0. */
  function sweepHolds(now) {
    if (!pending.length) return;
    const { live, expired } = A.expirePending(pending, now);
    if (!expired.length) return;
    pending = live;
    holdsExpired += expired.length;
    if (now - lastHoldLog > REFUSE_LOG_MS) {
      lastHoldLog = now;
      log(`[spend] ${expired.length} authorization hold(s) expired with no charge and no release (${holdsExpired} so far) — a producer authorized a turn and never said what happened`);
    }
    try { global.__vsEvent?.('spend-hold-expired', String(expired.length)); } catch { }
  }

  /** THE ONE READER of `cache.overage` / `cache.spend` (design §1.4: both had
   *  zero consumers). Everything that asks "is real money being spent on this
   *  account right now" — the authorizer, the pool's voluntary-target rule and
   *  the two panels — resolves through this. */
  function overageFor(key) {
    if (!key || !readCacheFor) return null;
    let cache = null;
    try { cache = readCacheFor(key); } catch { cache = null; }
    return A.overageState(cache);
  }

  /** THE ONE READER of `cache.spendControlReached` — the third field the §1.4
   *  row names. It rides the same cache read and the same PURE module as
   *  `overageFor`, so the row's CLOSED verdict is true of all three fields
   *  rather than of two (r4: `grep -rn spendControlReached src/` used to
   *  return only its writer). */
  function spendControlFor(key) {
    if (!key || !readCacheFor) return null;
    let cache = null;
    try { cache = readCacheFor(key); } catch { cache = null; }
    return A.spendControlState(cache);
  }

  function credentialFor(key) {
    if (!key || !credentialStateOf) return null;
    try {
      const st = credentialStateOf(key);
      if (!st) return null;                                   // no reader / not an account key ⇒ unknown (P6)
      return { serves: st.usable === false ? 'no' : 'yes', state: st.state || null };
    } catch { return null; }
  }

  /** Resolve WHO pays. `identityHint` lets a caller that already resolved the
   *  slot (auto-resume re-resolves it after its pre-fire gate) hand the same
   *  object in instead of asking twice and getting two answers.
   *
   *  AUTHORIZE MAY RESOLVE; CHARGE MAY NOT (r4, reproduced). This is the ONE
   *  resolution — `authorize()` is entitled to make it, and the verdict then
   *  CARRIES it (`v.identity`) precisely so the charge can name the same slot.
   *  A `note()` that arrives with no hint asks the question a second time,
   *  against state our own handlers are free to have moved in between: the
   *  delivery ladder deferred its charge by up to 120 s and debited an account
   *  that was never asked, while the authorized one — debited nothing — never
   *  reached its ceiling. `chargesUnhinted` counts that shape in PRODUCTION;
   *  scripts/test-spend-paths.mjs §5c drives all four producers and asserts it
   *  stays 0, which is the census a grep over five call sites cannot be. */
  function identityFor(session, identityHint) {
    if (identityHint && identityHint.key) return { key: String(identityHint.key), name: String(identityHint.name || identityHint.key) };
    if (!identityOf || !session) return null;
    try {
      const r = identityOf(session);
      if (!r) return null;
      if (typeof r === 'string') return { key: r, name: r };
      return r.key ? { key: String(r.key), name: String(r.name || r.key) } : null;
    } catch { return null; }
  }

  function fileInbox(text, detail, urgency, expiresAt, i18n = null, about = null, itemKey = null) {
    let userTodos = null;
    try { userTodos = getUserTodos(); } catch { userTodos = null; }
    if (!userTodos) return false;
    // kind 'notice' (2.369.118): a spend ceiling is FOR THE USER'S INFORMATION —
    // it sits in the popup's own Notices section and never in the red badge
    // …and it dies with the window it is about (`expiresAt`, see NOTICE_TTL_MS)
    // `i18n` (lane owner-press-attended): the refusal as STRUCTURE — the client says the next free slot in the viewer's
    // zone from its epoch (A.refusalI18n), never a time string this hub rendered
    // B-0a33 round 1: `about` = the conversation waiting frames wait behind — the notice is filed under ITS key, so it opens it
    try { userTodos.add(about && about.key ? about.key : INBOX_KEY, { ...(i18n ? { i18n } : {}), ...(itemKey ? { itemKey } : {}), origin: 'spend', text: String(text).slice(0, 300), detail, urgency, by: 'agent', sessionName: 'Spending', kind: 'notice', expiresAt }); return true; }
    catch (e) { log('[spend] could not file the inbox item: ' + e.message); return false; }
  }

  /** THE GATE. Every producer of a turn nobody typed calls this BEFORE it
   *  spends, and nothing else may decide. Returns the PURE verdict; the side
   *  effects of a refusal (journal + telemetry + inbox) happen here, once. */
  function authorize({ reason, session = null, sessionId = null, sessionName = null, cid = null, identity: identityHint = null, hold: takeHold = true, now = Date.now() } = {}) {
    sweepHolds(now);
    if (recheckLedger(now)) persist();
    const identity = identityFor(session, identityHint);
    const key = identity && identity.key;
    const v = A.authorizeUnattendedSpend({
      reason, identity, state, limits: limits(),
      overage: overageFor(key), overagePolicy: overagePolicy(),
      credential: credentialFor(key), spendControl: spendControlFor(key),
      pending, ledger: unreadable ? { unreadable: true, error: unreadable.error } : null, now,
    });
    // AN "ALLOWED" ANSWER HOLDS ITS SLOT (r5). The caller carries `hold` back
    // to `note()` (it became a turn) or to `release()` (it did not); an answer
    // nobody carries back expires at A.RESERVE_TTL_MS and is counted.
    // A PROBE MUST NOT HOLD (r5, reproduced). `hold: false` asks whether this
    // spend WOULD be allowed without taking a slot for it. auto-resume asks the
    // ceiling TWICE per fire — once before its pre-fire gate, so a spent budget
    // stops us before we pay for the gate's quota probe, and once after, on the
    // identity the continue actually lands on. Measured with the real module at
    // cap 1/hour: with the first call reserving, the second refused its own
    // request and NOTHING ever fired. The charging call is the one that holds.
    // AN ATTENDED VERDICT HOLDS NOTHING (lane owner-press-attended): a person's press is never a slot of the ceiling —
    // `note()` turns it into the attended tally, never a stamp
    if (v.ok && v.attended) return v;
    if (v.ok && key && takeHold) {
      const hold = `h${++holdSeq}`;
      pending = A.reservePending(pending, { id: hold, key, at: now });
      return { ...v, hold };
    }
    if (v.ok) return v;
    return sayRefusal({ reason, session, sessionId, sessionName, cid, identity, key, v, now });
  }

  /** A refusal's side effects, ONCE: the journal line (deduped), the telemetry event and the "For you" notice (one per
   *  identity per why per 6 h). Shared by the single gate and the batch gate so a batch refusal reads like any other. */
  function sayRefusal({ reason, session = null, sessionId = null, sessionName = null, cid = null, identity = null, key = null, v, now = Date.now(), inbox = true }) {
    const sig = `${reason}|${key || '?'}|${v.why}`;
    const last = spoke.get(sig) || { at: 0, more: 0 };
    // r2: THE NOTICE NAMES THE CONVERSATION — the delivery ladder passes the session, not its name (its refusals said
    // «in» nothing); the name the session carries is the conversation the owner reads
    const convName = sessionName || (session && typeof session.name === 'string' && session.name) || null;
    // B-0a33 round 1: what the waiting reservations wait behind (the refusal names them; the notice opens the first)
    const behind = v.why in WAIT_CAPS ? A.waitingBehind(state, key, now) : [];
    const text = A.refusalText(v, { sessionName: convName, behind });
    // THE LINE NAMES THE CONVERSATION and SAYS WHAT IT COLLAPSED (lane owner-press-attended: userW's five refused presses
    // showed as three lines «for a session» — the ladder passes the cid, the 5-min dedupe hid two with no word)
    if (now - last.at > REFUSE_LOG_MS) {
      if (last.timer) { try { unschedule(last.timer); } catch { } }
      if (spoke.size >= 400) { for (const k of [...spoke.keys()]) flushSpoke(k); spoke.clear(); }
      const who = sessionId || (cid ? `conversation ${cid}` : 'a session');
      const more = last.more > 0 ? ` (+${last.more} more in the 5 min after the previous line)` : '';
      const line = `[spend] refused ${reason} for ${who} on ${identity ? identity.name : 'an unknown identity'} — ${v.why}`;
      spoke.set(sig, { at: now, more: 0, line, timer: null });
      log(`${line}: ${v.detail}${more}`);
    } else {
      last.more++;
      if (!last.timer && spoke.get(sig) === last) last.timer = schedule(() => { const sp = spoke.get(sig); if (sp) sp.timer = null; flushSpoke(sig); }, Math.max(1, last.at + REFUSE_LOG_MS - now));
    }
    try { global.__vsEvent?.('spend-refused', `${reason}:${v.why}`); } catch { }
    // NO SILENT FAILURES: a refused automatic turn is a promise the product
    // stops keeping, so the user is told once per (identity, why) per 6h. The
    // inbox is the surface, because the conversation it would have spent on is
    // by definition one nobody is watching.
    // B-0a33 round 1: when WAITING frames hold the cap, the notice is keyed by the PLACE they wait (account, cap, conversation) and filed
    // under the conversation they wait behind so it opens it. Follow-up (主开发 08:35Z): while the wait still refuses, exactly
    // ONE notice of it is open — filed again at the first refusal after the previous one expired (its expiry IS
    // REFUSE_INBOX_MS), never two at once; a person's dismissal stands until that mark. Else as before, per 6 h
    const promisedHere = v.counts ? Number(v.why === 'hour-cap' ? v.counts.promisedHour : v.why === 'day-cap' ? v.counts.promisedDay : v.why === 'instance-cap' ? v.counts.promisedInstanceDay : 0) || 0 : 0;
    const wait = promisedHere > 0 && behind.length ? behind[0] : null;
    // THE KEY IS THE PLACE (follow-up 2): the account, the cap, the conversation the frames wait behind — never the oldest frame
    // (a queue that drains one frame a turn would mint a new key, and a new notice, at every carry)
    const inboxSig = wait ? `inbox|${key || '?'}|${v.why}|at|${wait.key || '?'}` : v.why === 'ledger-unreadable' ? 'inbox|*|ledger-unreadable' : `inbox|${key || '?'}|${v.why}`;   // B-3b0f: ONE notice for the instance, not one per account
    const lastInbox = Number(state.notices[inboxSig]) || 0;
    // THE SEAM WITH LAWS 2 + 3 (shape C — 主开发 2026-11-13 15:30Z): while a «messages waiting» For-you item stands for the
    // conversation these frames wait behind (src/server/wait-watch.js, the same key `<backend>:<cid>`), IT speaks: the spending
    // notice for that conversation is not filed — one owner item per stuck turn; filed as before once that item is gone.
    // Its journal line keeps the notice's cadence under its OWN stamp (主开发 17:45Z): one line per REFUSE_INBOX_MS while the item
    // stands — never one per refusal — and never the notice's stamp, so the notice is filed at once when the item goes
    const waitItemStands = !!(wait && wait.key) && (() => { try { const ut = getUserTodos(); const sn = ut && typeof ut.snapshot === 'function' ? ut.snapshot() : null; return !!sn && (sn.open || []).some((i) => i && i.sessionKey === wait.key && String(i.itemKey || '').startsWith('messages-waiting:')); } catch { return false; } })();
    const heldSig = 'held|' + inboxSig;
    if (waitItemStands && now - lastInbox > REFUSE_INBOX_MS && now - (Number(state.notices[heldSig]) || 0) > REFUSE_INBOX_MS) { state.notices[heldSig] = now; persist(); log(`[spend-guard] ${v.why}: the spending notice at ${wait.key} is not filed — its «messages waiting» item stands and speaks for that turn`); }
    if (inbox && now - lastInbox > REFUSE_INBOX_MS && !waitItemStands) {   // inbox:false = a batch, answered in the person's own dialog (U2 cure)
      const filed = fileInbox(text,
        `Reason: ${reason}\nIdentity: ${identity ? identity.name : 'unknown'}\nRefusal: ${v.why}\n`
        + (v.why === 'ledger-unreadable' ? `The ledger data/spend-budget.json could not be read (${unreadable ? unreadable.error : '?'}): no count can be said, so none run until it reads again or is removed.\n\n`   // B-3b0f
          : `Unattended turns used: ${v.counts.hour}/${v.limits.perIdentityHour} this hour, ${v.counts.day}/${v.limits.perIdentityDay} today `
          + `(instance ${v.counts.instanceDay}/${v.limits.perInstanceDay}).\n\n`)
        + (wait ? `${promisedHere} of them are messages waiting behind running turns — in ${behind.slice(0, 3).map((b) => `«${b.name || '?'}»`).join(', ')}${behind.length > 3 ? ` and ${behind.length - 3} more` : ''}. They run when that turn ends, or when you stop it there.\n\n` : '')
        + 'These ceilings bound every turn VibeSpace starts without you — the auto-continue after a usage limit, the Stop bookkeeping nudge, '
        + `Background Work notifications and messages from other sessions. ${A.spendRowOf(v) ? `Adjust this one in Settings → Spending — vibespace://settings/${A.spendRowOf(v)} — or act on the account named above.` : 'Adjust them in Settings → Spending, or act on the account named above.'}`,   // lane setting-doors pick 1: the row, as its link
        v.why === 'overage-in-use' || v.why === 'ledger-unreadable' ? 'high' : 'normal', noticeExpiry('refusal', now), A.refusalI18n(v, { sessionName: convName, behind }), wait && wait.key ? { key: wait.key } : null, v.why === 'ledger-unreadable' ? LEDGER_ITEM : null);   // B-3b0f: ONE item across restarts, resolved when the file reads again
      if (filed) { state.notices[inboxSig] = now; persist(); }
    }
    return v;
  }

  /** THE GATE FOR A BATCH (lane auto-resume-bulk): ONE owner action that opens N billed turns — the resume of every
   *  conversation a wall stopped — is ONE authorization. `items` = [{session, sessionId, sessionName, identity}] where
   *  `identity` is the slot each turn would bill as the caller resolved it (the engine's fireIdentityFor, as every
   *  auto-resume). The PURE batch decision checks every slot's share and the instance's total against charges AND live
   *  holds; a refusal refuses the WHOLE batch (named: its bucket, its slot) and reserves nothing. An ALLOWED batch holds
   *  one slot per item — each converted by `note()` when its turn is delivered or given back by `release()` when not,
   *  exactly like a single authorization. FAIL CLOSED: an item whose slot cannot be named refuses the batch. */
  function authorizeBatch({ reason, items = [], now = Date.now() } = {}) {
    sweepHolds(now);
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    const resolved = list.map((it) => ({ ...it, identity: identityFor(it.session || null, it.identity || null) }));
    const unnamed = resolved.find((it) => !(it.identity && it.identity.key));
    if (!list.length || unnamed) {
      const v = { ok: false, why: list.length ? 'identity-unknown' : 'empty-batch', detail: list.length ? `the credential slot ${(unnamed && unnamed.sessionName) || 'one conversation'} would bill could not be resolved` : 'the batch names no turn to authorize', retryAfter: 0, identity: null, reason, n: list.length, groups: [], counts: { hour: 0, day: 0, instanceDay: 0 }, limits: limits() };
      if (list.length) sayRefusal({ reason, sessionId: unnamed && unnamed.sessionId, sessionName: unnamed && unnamed.sessionName, identity: null, key: null, v, now, inbox: false });
      return v;
    }
    const byKey = new Map();
    for (const it of resolved) {
      const g = byKey.get(it.identity.key) || { identity: it.identity, n: 0 };
      g.n++; byKey.set(it.identity.key, g);
    }
    const v = A.authorizeUnattendedBatch({
      reason, groups: [...byKey.values()], state, limits: limits(), overagePolicy: overagePolicy(), pending, now,
      ofKey: (k) => ({ overage: overageFor(k), credential: credentialFor(k), spendControl: spendControlFor(k) }),
    });
    if (!v.ok) {
      const g0 = (v.groups && v.groups[0]) || v;
      return sayRefusal({ reason, sessionId: `a batch of ${list.length}`, identity: g0.identity || null, key: g0.identity && g0.identity.key, v: { ...g0, ...v, counts: g0.counts || { hour: 0, day: 0, instanceDay: 0 }, limits: g0.limits || limits(), identity: g0.identity || null }, now, inbox: false });
    }
    const holds = resolved.map((it) => {
      const hold = `h${++holdSeq}`;
      pending = A.reservePending(pending, { id: hold, key: it.identity.key, at: now });
      return { sessionId: it.sessionId || null, identity: it.identity, hold };
    });
    return { ...v, holds };
  }

  /** Renew the batch's holds it has not reached yet (spend-authorizer renewPending) — see authorizeBatch. */
  function renewHolds(holds, now = Date.now()) { pending = A.renewPending(pending, holds, now); return true; }

  /** Charge a spend that actually happened. The identity is the one
   *  `authorize()` resolved and put on its verdict — see identityFor; `hold` is
   *  the reservation that verdict opened, converted here into the stamp. */
  function note({ reason = null, identity: identityHint = null, session = null, hold = null, reservation = null, carried = false, drain = false, ended = false, behind = null, now = Date.now() } = {}) {   // carried: a queued frame's reservation CONVERTED (round 3) — marked; durable like any spend (the guard's debounce, round 4)   // drain: a stash drain never stamps   // reservation: a queued frame's id (lane queued-is-not-woke) — its unit taken once, returnable by release
    sweepHolds(now);
    // convert, never double-count: the stamp below IS this hold's outcome
    if (hold) pending = A.releasePending(pending, hold);
    if (!(identityHint && identityHint.key) && session) {
      // The charge is re-deriving the slot. Not fatal (the answer is usually
      // the same one), so it charges — a dropped charge is the money-unsafe
      // direction — but it is NEVER silent: this is the exact shape that
      // debited an account nobody asked.
      chargesUnhinted++;
      if (now - lastUnhintedLog > REFUSE_LOG_MS) {
        lastUnhintedLog = now;
        log(`[spend] charge for ${reason || 'an unattended turn'} arrived with no identity — resolving it a second time (${chargesUnhinted} so far)`);
      }
      try { global.__vsEvent?.('spend-charge-unhinted', String(reason || 'unknown')); } catch { }
    }
    const identity = identityFor(session, identityHint);
    // the stamp carries its producer (5b ②) so a later reader can say who spent the slot
    // ended (B-0a33): queued-wakes stopped waiting for the frame and cannot tell whether it ran — the unit stays, placed in this hour
    const r = A.noteUnattendedSpend(state, { identity, at: now, limits: limits(), reason, rid: reservation, carried: !!carried, drain: !!drain, ended: !!ended, behind });
    state = r.state;
    persist();   // round 4: a reservation and a conversion are as durable as any spent turn — the guard's own debounce, never a write inside the send call or the carry callback
    if (r.warn) {
      const text = A.noticeText(r.warn);
      log(`[spend] ${text}`);
      try { global.__vsEvent?.('spend-budget-notice', `${r.warn.scope}:${r.warn.pct}`); } catch { }
      fileInbox(text, `Reason of the latest turn: ${reason || 'unattended'}\nScope: ${r.warn.scope}\nUsed: ${r.warn.used} of ${r.warn.limit}\n\nThe limit, to raise or lower it: vibespace://settings/${A.warnRowOf(r.warn)}`, 'normal', noticeExpiry(r.warn.scope, now));   // lane setting-doors pick 1: the warning names its row
    }
    return r.warn;
  }

  /** GIVE BACK an authorization that did not become a turn — the ladder's
   *  stash rung, a send that failed, a steer the wrapper confirmed was folded
   *  into a turn already running. Idempotent, and a `hold` this guard never
   *  issued is a no-op: releasing is the money-SAFE half of the pair, so it
   *  must never be able to throw its way into a producer's error path.
   *  @returns true when a live hold was actually given back */
  function release({ hold = null, reservation = null, now = Date.now() } = {}) {
    sweepHolds(now);
    // A RESERVATION RETURNED (lane queued-is-not-woke): the queued frame it was taken for was handed back before a turn
    // carried it — its stamp leaves the windows (an id this guard never stamped returns nothing: still money-safe)
    if (reservation) { const r = A.returnReservation(state, { rid: reservation, now }); if (!r.returned) return false; state = r.state; persist(); return true; }   // the largest caps' retention (round 4); a converted id returns nothing
    if (!hold) return false;
    const before = pending.length;
    pending = A.releasePending(pending, hold);
    return pending.length !== before;
  }

  // ── The Stop nudge's PERSISTED cooldown (D8) ───────────────────────────────
  // `s._lastStopNudge` was in-memory only, so every release restart handed the
  // largest measured automatic spender a fresh cooldown. It now lives here (and
  // the session field is a mirror, registered in src/session-schema.js with
  // this file as its home). `n` counts nudges this session answered with NO
  // status record — the exit condition a session that never reports needs.
  function nudgeRec(sessionKey) { return (sessionKey && nudge[sessionKey]) || null; }
  function noteNudge(sessionKey, { at = Date.now(), sawStatus = false } = {}) {
    if (!sessionKey) return;
    const prev = nudge[sessionKey] || { at: 0, n: 0, everSeenStatus: false };
    nudge[sessionKey] = {
      at,
      n: sawStatus ? 0 : (prev.n || 0) + 1,
      everSeenStatus: prev.everSeenStatus || !!sawStatus,
    };
    // bounded: a long-lived instance must not grow one row per dead session
    const keys = Object.keys(nudge);
    if (keys.length > 400) {
      const cut = at - 7 * 24 * 3600 * 1000;
      for (const k of keys) if ((nudge[k]?.at || 0) < cut) delete nudge[k];
    }
    persist();
  }

  return {
    authorize, authorizeBatch, renewHolds, note, release, overageFor, spendControlFor, nudgeRec, noteNudge, flush,
    reservationState: (rid) => A.reservationState(state, rid),   // lane queued-is-not-woke round 3: 'converted' | 'reserved' | null
    // B-0a33 round 1: queued-wakes ends the ones no live entry holds. B-0a33 (2): the answer also carries `overCap` (read
    // lazily) — the waiting reservations no cap holds now: server.js wires this ONE function into the ladder, so the
    // re-judge rides it (no new wiring line in server.js)
    waitingReservations: () => { const rids = A.waitingRids(state); Object.defineProperty(rids, 'overCap', { get: () => overCapNow(Date.now()) }); return rids; },
    waitingOverCap: (now = Date.now()) => overCapNow(now),   // B-0a33 (2): the waiting frames a lowered cap no longer holds
    limits, overagePolicy,
    snapshot: () => ({
      budget: A.pruneBudget(state, Date.now(), A.LOAD_RETENTION), nudge: { ...nudge },   // round 4: every prune keeps what the largest caps could count
      chargesUnhinted, holdsOpen: A.expirePending(pending, Date.now()).live.length, holdsExpired,
      ledgerUnreadable: unreadable ? { error: unreadable.error, since: unreadable.since } : null,   // B-3b0f
      // lane owner-press-attended: the presses the ceiling neither refused nor counted, by reason (the last 24 h)
      attended: A.producerCounts(A.pruneBudget(state, Date.now(), A.LOAD_RETENTION).attended),
    }),
    _file: file,
  };
}

// B-0a33 (2): THE SETTINGS WRITE SAYS THE CAPS MOVED — src/routes/persistence.js writeSettings calls noteLimitsWritten(prev,
// next) (budgetLimits of the file before and after); the delivery ladder listens and re-judges the frames already waiting at
// once, before the running turn can end and let its wrapper run them past a cap just lowered. One registry for the process.
const limitsListeners = new Set();
function onLimitsWritten(fn) { limitsListeners.add(fn); return () => limitsListeners.delete(fn); }
function noteLimitsWritten(prev, next) { for (const fn of [...limitsListeners]) { try { fn(prev || null, next || null); } catch { } } }

module.exports = { create, onLimitsWritten, noteLimitsWritten, REFUSE_LOG_MS, REFUSE_INBOX_MS, INBOX_KEY, NOTICE_TTL_MS, LEDGER_RECHECK_MS, noticeExpiry };

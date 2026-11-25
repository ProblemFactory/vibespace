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
const os = require('os');
const path = require('path');
const A = require('../spend-authorizer.js');
const UW = require('../usage-cache-write.js');   // r3136: the reading's own unknowns (the door's mark; after torn bytes, the facts not stated again)
const READING_ITEM = 'spend-reading-unread:';   // r3136: the For-you item a held reading's refusal files — ONE an account, closed when the reading lands
// B-ef83: a pid is never an identity — the lock's holder is proven by its start tick. Bound under names of their OWN: in this file
// «identityOf» is a BILLING resolver (the engine's answer, handed in), and the billing-slot census (B-87fd) reads names
const { identityOf: procIdentityOf, aliveIdentity: procAliveIdentity } = require('../proc-identity.js');

function writeJsonAtomic(file, obj) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(obj));
  fs.renameSync(file + '.tmp', file);
}

const REFUSE_LOG_MS = 5 * 60 * 1000;      // one journal line per (reason, identity, why)
const REFUSE_INBOX_MS = 6 * 60 * 60 * 1000; // one "For you" item per (identity, why)
const INBOX_KEY = 'accounts';
const LEDGER_RECHECK_MS = 60 * 1000;     // B-3b0f: an unreadable ledger is read again at most this often
const LEDGER_ITEM = 'spend-ledger-unreadable';   // B-3b0f: the notice's identity (one For-you item, across restarts)
/** a DECLARED human-visible string is a KEY (scripts/i18n-extract.mjs collects i18nKey(…) beside t(…)) — B-23c3's notice */
const i18nKey = (str) => str;
const RESET_ITEM = 'spend-ledger-reset';         // B-23c3: the record of turns nobody typed went (removed, or an older copy put back)
// B-ef83: ONE HUB PROCESS KEEPS THE LEDGER. Two hub processes on one data folder (a restart whose old process is still ending, a
// second server started by hand) each kept their own count from the same file — each allowed the caps in full, and each wrote its
// own count over the other's. The keeper holds data/spend-budget.lock ({pid, host, ident: src/proc-identity.js identityOf, at}); a
// process that meets a LIVE holder never writes the ledger and starts no unattended turn, by name ('ledger-held-elsewhere'), and
// asks again until the lock is its own — then reads the record the other kept. A holder is live while proc-identity proves its
// pid is still the process the lock recorded (a recycled pid, a reboot, a zombie: gone); a holder nothing can prove (another
// machine on a shared folder, no /proc and no ps) is live while its heartbeat — the lock's mtime, touched every LOCK_BEAT_MS — is fresh.
const LOCK_RETRY_MS = 5 * 1000;           // the holder is most often the previous hub, still ending: asked again this often
// THE BOUND OF ONE RETRY (round wfm9rn69h; the save itself stays a synchronous atomic write, 主开发 r1293): against a live holder ONE
// round of 5 synchronous calls on data/ — the temp's write, the link refused EEXIST, the temp's unlink, the lock's read and stat —
// and 1–2 /proc identity reads (this process's own at every try, the holder's when it lives in this pid space); at most 3 rounds
// (15 calls) while other takers contend; only while another process keeps the ledger
const LOCK_UNMADE_RETRY_MS = LEDGER_RECHECK_MS;   // a lock the folder refuses (EACCES / EROFS / ENOSPC …) and nobody holds: asked again this often
const LOCK_BEAT_MS = 30 * 1000;           // the keeper's heartbeat (async, unref'd)
const LOCK_STALE_MS = 3 * LOCK_BEAT_MS;   // a holder only its heartbeat can vouch for is gone past this silence
const HELD_ITEM = 'spend-ledger-held';    // the For-you item while another process keeps the ledger (resolved when it is this one's)
const UNLOCKED_ITEM = 'spend-ledger-unlocked';   // B-ef83 r1648 (d): the For-you item while the ledger is kept WITHOUT its lock (since boot), once an episode
const SETTINGS_ITEM = 'spend-settings-unread';   // B-225b (round wyzvr7567's cure 3): the For-you item while the settings are held — resolved at their lift
const heldLocks = new Map();   // lock file → the token of the guard that keeps it — removed at exit when it still holds that token (ONE listener)
let exitHooked = false;
function releaseAtExit(f, token) {
  heldLocks.set(f, token);
  if (exitHooked) return;
  exitHooked = true;
  process.on('exit', () => { for (const [x, tok] of heldLocks) { try { const h = JSON.parse(fs.readFileSync(x, 'utf-8')); if (h && h.token === tok) fs.unlinkSync(x); } catch { } } });
}
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
function create({ dataDir, serverSetting = () => undefined, identityOf = null, listHeld = null, readCacheFor = null, readingItemOpen = null, credentialStateOf = null, getUserTodos = () => null, log = () => { }, schedule = (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; }, unschedule = (t) => clearTimeout(t) , readLedgerSync = null, readLedgerAsync = null, lockSchedule = null, lockUnschedule = null } = {}) {
  // B-ef83: the LOCK's own timers (its heartbeat and its retry), apart from the guard's — a suite that counts the guard's timers
  // never meets them
  const lsched = typeof lockSchedule === 'function' ? lockSchedule : (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; };
  const lunsched = typeof lockUnschedule === 'function' ? lockUnschedule : (t) => clearTimeout(t);
  const file = path.join(dataDir, 'spend-budget.json');
  const markerFile = path.join(dataDir, 'spend-budget.born.json');   // B-23c3: the ledger's birth and its last write, beside it
  // B-ef83: THE LOCK FIRST — a process that does not keep the ledger never judges it, never writes it, starts no unattended turn
  const lockFile = path.join(dataDir, 'spend-budget.lock');
  let heldBy = null;          // {pid, host, since} while another live hub process keeps the ledger
  let lockOurs = false, lockTimer = null, beatTimer = null, staleTaken = null;
  // a lock this process CANNOT MAKE (the folder refuses it) while no live process holds one: {error, since} — this process keeps the
  // ledger WITHOUT it (no stricter than the release: every road the same, said by its code) and asks again every LOCK_UNMADE_RETRY_MS
  let lockUnmade = null, unmadeTimer = null;
  // r1648 (d): the episode's For-you item is filed ONCE; at boot it is OWED until the guard is built (fileInbox's state is not yet)
  let unlockedFiled = false, unlockedOwed = false, building = true, unlockedCloseOwed = false;
  let unlockedFailSaid = false;   // round w7yapjt1r: a failed filing of the episode's item is said in the journal ONCE an episode
  // THIS guard's lock: a token of its own (two guards of one process, or two containers whose hubs are both pid 1 with one hostname,
  // never take each other's lock for their own) and its pid space (a pid's identity proves a holder only inside the same one)
  const myToken = require('crypto').randomBytes(9).toString('hex');
  let myNs = null; try { myNs = fs.readlinkSync('/proc/self/ns/pid'); } catch { myNs = null; }
  // A HEARTBEAT IS JUDGED BY THIS PROCESS'S CLOCK: a lock is silent when its mtime has not CHANGED for LOCK_STALE_MS of this clock
  // (another machine's clock may be ahead or behind — an absolute mtime proves nothing across machines)
  let seen = null;   // {text, mtime, since}
  const silentFor = (text, mtime, now) => {
    if (!seen || seen.text !== text || seen.mtime !== mtime) { seen = { text, mtime, since: now }; return false; }
    return now - seen.since > LOCK_STALE_MS;
  };
  const holderLive = (h, text, mtime, now) => {
    const silent = silentFor(text, mtime, now);
    if (!h || typeof h !== 'object') return !silent;                 // content that does not read (a hand edit, an O_EXCL write in flight): live while it beats
    if (h.token && h.token === myToken) return false;                // this guard's own
    const pid = Number(h.pid);
    if (!Number.isInteger(pid) || pid <= 0) return !silent;
    // proc-identity proves a holder only in THIS pid space on THIS machine: the very process the lock recorded (true), gone /
    // recycled / a zombie (false), unprovable (null). Another machine or another pid space: only its heartbeat can say it lives
    const here = (!h.host || h.host === os.hostname()) && !!h.ns && !!myNs && h.ns === myNs;
    if (!here) return !silent;
    const alive = procAliveIdentity(h.ident && typeof h.ident === 'object' ? { ...h.ident, pid } : { pid });
    if (alive === null) return !silent;
    if (alive && pid === process.pid) return false;                  // this very process, another guard of it (its token differs): taken
    return alive;
  };
  const takeLock = (now = Date.now()) => {
    const mine = JSON.stringify({ pid: process.pid, host: os.hostname(), ns: myNs, token: myToken, ident: procIdentityOf(process.pid), at: now });
    for (let i = 0; i < 3; i++) {
      const tmp = `${lockFile}.${process.pid}-${myToken}-${i}.tmp`;
      try {
        fs.writeFileSync(tmp, mine, { mode: 0o644 });   // readable by every user of the folder: another user's process can see it is held
        try { fs.linkSync(tmp, lockFile); return { took: true }; }   // created WHOLE
        catch (le) {
          if (!le || le.code === 'EEXIST') throw le;
          // a folder with no hard links (EPERM / ENOTSUP / EXDEV): created exclusively and written — a reader meeting it half-written
          // judges it by its heartbeat, never as gone
          const fd = fs.openSync(lockFile, 'wx', 0o644);
          try { fs.writeSync(fd, mine); } finally { fs.closeSync(fd); }
          return { took: true };
        } finally { try { fs.unlinkSync(tmp); } catch { } }
      } catch (e) {
        // a lock this process cannot MAKE (EACCES / EROFS / ENOSPC …) is not a free one: the lock that is there is read and judged
        // like any other (a live holder is named); only when none lives behind it is the error the answer
        const cannot = !e || e.code !== 'EEXIST' ? String((e && e.code) || 'lock failed') : null;
        let text = null, mt = 0;
        try { text = fs.readFileSync(lockFile, 'utf-8'); mt = fs.statSync(lockFile).mtimeMs; }
        catch (e2) { if (e2 && e2.code === 'ENOENT') { if (cannot) return { took: false, error: cannot }; continue; } return { took: false, holder: { unreadable: String(e2.code || 'unreadable'), ...(cannot ? { lockUnreadable: String(e2.code || 'unreadable') } : {}) } }; }   // there and not readable: HELD, never stale
        let h = null; try { h = JSON.parse(text); } catch { h = null; }
        if (holderLive(h, text, mt, now)) return { took: false, holder: h || { torn: true } };
        if (cannot) return { took: false, error: cannot };   // a lock nobody lives behind, and this process cannot make one
        // STALE: set aside under a name of this guard's own and read back — the very lock judged is the one removed (a fresh lock
        // another process made meanwhile is put back; if a third took the place meanwhile, the put-back fails and that fresh
        // lock's own heartbeat finds it no longer names it), then taken over and said
        const aside = `${lockFile}.stale-${process.pid}-${myToken}-${i}`;
        try { fs.renameSync(lockFile, aside); } catch { continue; }
        let got = null; try { got = fs.readFileSync(aside, 'utf-8'); } catch { }
        if (got !== text) { try { fs.linkSync(aside, lockFile); } catch { } }
        try { fs.unlinkSync(aside); } catch { }
        if (got === text) { staleTaken = h || { torn: true }; seen = null; }
      }
    }
    return { took: false, holder: { contended: true } };   // three rounds lost to other takers: held, asked again
  };
  // B-ef83 r1648: `lockUnwritable` = NO holder, the lock cannot be written (its code) — held by the TRUE reason, healed by the retry
  const heldOf = (h, now) => ({ pid: Number(h && h.pid) || null, host: (h && h.host) ? String(h.host).slice(0, 120) : null, since: now, lockUnwritable: h && h.lockUnwritable ? String(h.lockUnwritable) : null, lockUnreadable: h && h.lockUnreadable ? String(h.lockUnreadable) : null });
  {
    const now0 = Date.now();
    const lk = takeLock(now0);
    if (lk.took) {
      lockOurs = true; releaseAtExit(lockFile, myToken);
      unlockedCloseOwed = true;   // r1801 (4): an earlier run's «kept without the lock» item closes (the store answers later in boot)
      if (staleTaken) log(`[spend] data/spend-budget.lock named a process that is gone (pid ${staleTaken.pid || '?'}${staleTaken.host ? ' on ' + staleTaken.host : ''}) — this process keeps the ledger now`);
    } else if (lk.holder) {
      heldBy = heldOf(lk.holder, now0);
      log(heldBy.lockUnreadable ? `[spend] data/spend-budget.lock is there and cannot be read (${heldBy.lockUnreadable}), and the folder refuses a new one — it may be a live keeper's: this process never writes the ledger and starts no turn nobody typed until the lock reads or can be made (asked again every ${LOCK_RETRY_MS / 1000} s)`
        : `[spend] data/spend-budget.json is kept by another VibeSpace process on this data folder (pid ${heldBy.pid || '?'}${heldBy.host ? ' on ' + heldBy.host : ''}) — this one never writes it and starts no turn nobody typed until the lock is its own (asked again every ${LOCK_RETRY_MS / 1000} s)`);
    } else keepUnmade(lk.error, now0);
  }
  let state = A.emptyBudget();
  let nudge = {};   // sessionKey -> {at, n, everSeenStatus} (the Stop nudge's PERSISTED cooldown)
  // B-3b0f: THE LEDGER FAILS CLOSED ON ITS OWN RECORD. A file that is there and cannot be read (torn JSON, a directory, a
  // read error) used to start an EMPTY budget — the count restarted and unattended turns were authorized as if none had
  // been spent; and the next persist renamed that empty ledger OVER the file, so one restart made it permanent. Now ENOENT
  // (nothing spent yet) is told apart from UNREADABLE: unreadable ⇒ every unattended reason is refused by name
  // ('ledger-unreadable'), the file is never written over, and it is read again by ITSELF once a LEDGER_RECHECK_MS (the
  // readers' round: an unref'd timer — an idle hub un-sticks within a minute of the repair, a clock that steps back changes
  // nothing — and that re-read is ASYNC, never a synchronous read on the main loop of the file a sick mount just failed) —
  // it reads again ⇒ its stamps and the ones made meanwhile both count; it is gone (the owner removed it) ⇒ the count starts over
  let unreadable = null;     // {error, since} while the file is there and cannot be read
  let recheckTimer = null;
  const syncRead = typeof readLedgerSync === 'function' ? readLedgerSync : (f) => fs.readFileSync(f, 'utf-8');   // the seams: a suite's EACCES never depends on who runs it
  // (r2, the follow-up's read S4) the default re-read never opens what is not a regular file — a FIFO in the ledger's place would
  // hold the read (and a thread of the pool) for ever; it is unreadable, by name
  const asyncRead = typeof readLedgerAsync === 'function' ? readLedgerAsync
    : async (f) => { const st = await fs.promises.lstat(f); if (!st.isFile()) throw Object.assign(new Error('not a regular file'), { code: 'not a regular file' }); return fs.promises.readFile(f, 'utf-8'); };
  let readInFlight = false;   // (r2) ONE re-read at a time: a read a hung mount holds is never joined by another
  const readError = (e) => (e && e.code === 'ENOENT' ? { missing: true } : { error: String((e && e.code) || 'read failed') });
  // the boot's ONE read of the file (sync, as the release): its text, `missing` (ENOENT), or the error that kept it unread
  const readText = () => { try { return { text: syncRead(file) }; } catch (e) { return readError(e); } };
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
  // B-ef83: a process that does not keep the ledger counts only what it notes MEANWHILE — the file is the keeper's; at the takeover it
  // is read again and these stamps merged beside it (never the file twice)
  if (heldBy) { state = A.emptyBudget(); nudge = {}; }
  // B-23c3: A FIRST START IS TOLD APART FROM A RECORD THAT WENT. ENOENT read as «nothing spent yet» made a first boot, an rm, a
  // cleanup script and a restore without the file look the same: the count of turns nobody typed went back to zero in silence. The
  // MARKER beside the ledger (data/spend-budget.born.json: {born, seq, resets, lastReset}) is written with every ledger write, and the
  // ledger carries the same `seq`. The ledger gone while the marker stands = REMOVED; a ledger whose seq is below the marker's = AN
  // OLDER COPY put back. The reset stays possible — removing the file is the stated door for an unreadable ledger (B-3b0f) — but it
  // is never silent: SAID (the journal and ONE For-you item) and COUNTED (the marker's `resets`, the snapshot's `ledgerResets`), and
  // the record is written at once so the next boot reads it whole. Neither file there = a first start, silent as before.
  const seqOf = (raw) => (raw && raw.seq !== undefined ? Math.max(0, Math.floor(Number(raw.seq)) || 0) : null);   // null = written before the marker
  let seq = loaded.raw ? seqOf(loaded.raw) || 0 : 0;
  let marker = null;            // {born, seq, resets, lastReset, noticeOwed} once a ledger was written on this data folder
  let markerUnreadable = null;  // the marker is there and cannot be read: HELD — never set aside, never read as empty and written over (the store-read law)
  let resetNotice = null;       // the For-you item a reset owes — kept in the marker too (noticeOwed) until the store takes it
  let resetWriteOwed = false;
  let noticeTimer = null, lastNoticeTry = 0;
  const iso = (ms) => (Number.isFinite(Number(ms)) && Math.abs(Number(ms)) < 8.64e15 ? new Date(Number(ms)).toISOString() : String(ms));
  const markerOf = (m) => ({ born: Number(m.born) || null, seq: Math.max(0, Math.floor(Number(m.seq)) || 0), resets: Math.max(0, Math.floor(Number(m.resets)) || 0), lastReset: m.lastReset || null, noticeOwed: m.noticeOwed || null,
    // B-ef83: `counted` null = the record counted no turn; ABSENT (undefined) = a marker with no count at all (written before this
    // field, or by hand) — it proves no loss
    counted: !('counted' in m) ? undefined : m.counted && Number(m.counted.newestAt) > 0 && Number(m.counted.until) > 0 ? { newestAt: Number(m.counted.newestAt), until: Number(m.counted.until) } : null });
  const readMarker = () => {
    let t; try { t = syncRead(markerFile); } catch (e) { return e && e.code === 'ENOENT' ? { missing: true } : { error: String((e && e.code) || 'read failed') }; }
    let m; try { m = JSON.parse(t); } catch { return { error: 'not JSON' }; }
    return m && typeof m === 'object' && !Array.isArray(m) ? { mark: m } : { error: 'not a marker object' };
  };
  const writeMarker = () => {
    if (markerUnreadable) {   // HELD (the store-read law): read again at each write; written only once it reads, its history adopted
      const again = readMarker();
      if (again.error) { markerUnreadable = again.error; return; }
      markerUnreadable = null;
      if (again.mark) marker = { ...marker, born: Number(again.mark.born) || marker.born, resets: Math.max(Number(marker.resets) || 0, Math.floor(Number(again.mark.resets)) || 0), lastReset: again.mark.lastReset || marker.lastReset };
      log('[spend] data/spend-budget.born.json reads again — its count of resets is kept and it is written again');
    }
    try { writeJsonAtomic(markerFile, marker); } catch (e) { log('[spend] the ledger\'s marker could not be written: ' + e.message); }
  };
  const noticeOf = (kind, n) => {
    const text = kind === 'removed' ? i18nKey('The record of turns nobody typed was removed — the count started over') : i18nKey('An older copy of the record of turns nobody typed was put back');
    const detail = kind === 'removed'
      ? i18nKey('It is gone, so the hourly and daily limits count from zero again. If nobody here removed it, a cleanup or a restore did. Resets of this record so far: {n}.')
      : i18nKey('The turns nobody typed that were counted after that copy are not in it, so the hourly and daily limits count fewer than ran. Resets of this record so far: {n}.');
    return { text, detail: detail.replace('{n}', String(n)), i18n: { text: { key: text }, detail: [{ key: detail, params: { n } }] } };
  };
  // the notice is FILED when the store answers (at boot it does not: it is built later) — tried at each authorize (once a minute at
  // most), on a minute's timer, and kept in the marker (noticeOwed) so a restart before any of those files it at the next boot
  const fileResetNotice = (now = Date.now()) => {
    if (!resetNotice || heldBy) return;   // B-ef83: only the keeper of the ledger speaks for it
    lastNoticeTry = now;
    const r = resetNotice;
    // B-ef83: THE NOTICE HAS AN END, as every spend notice: it dies with what it is about — the instant the last turn it lost stops
    // counting in every window. A notice whose turns no longer count by the time the store can take it is not filed: it is untrue
    const until = Number(r.until) || 0;
    if (until && until <= now) {
      log('[spend] the reset of the record of turns nobody typed is no longer said — the turns it lost no longer count in any window');
      resetNotice = null;
      if (marker && marker.noticeOwed) { marker = { ...marker, noticeOwed: null }; writeMarker(); }
      return;
    }
    if (!fileInbox(r.text, r.detail, 'high', until || null, r.i18n, null, RESET_ITEM)) return;
    resetNotice = null;
    if (noticeTimer) { try { unschedule(noticeTimer); } catch { } noticeTimer = null; }
    if (marker && marker.noticeOwed) { marker = { ...marker, noticeOwed: null }; writeMarker(); }
  };
  const armNoticeRetry = () => {
    if (!resetNotice || noticeTimer) return;
    noticeTimer = schedule(() => { noticeTimer = null; fileResetNotice(); armNoticeRetry(); }, 60 * 1000);
  };
  function ledgerReset(kind, facts = {}, now = Date.now()) {
    const prev = marker || {};
    const until = Number(prev.counted && prev.counted.until) || null;   // B-ef83: the last lost turn stops counting then — the notice's end
    // B-ef83: what the record counts NOW (the loss taken: nothing, or the older copy's) — the record a crash before the ledger's
    // write leaves beside a missing ledger proves no second loss, so no second notice
    marker = { born: Number(prev.born) || now, seq: Math.max(seq, Number(prev.seq) || 0), resets: (Number(prev.resets) || 0) + 1, lastReset: { at: now, kind, ...facts }, noticeOwed: null, counted: A.countedOf(state, now) };
    seq = marker.seq;
    const n = marker.resets;
    log(kind === 'removed'
      ? `[spend] data/spend-budget.json was removed — the count starts over (this data folder has kept one since ${iso(marker.born)}); reset #${n} of this record, said in For you`
      : kind === 'unnumbered'
        ? `[spend] data/spend-budget.json carries no write number (a VibeSpace before the marker wrote it, or a copy from before it was put back) — the turns nobody typed counted after it may not be in it; reset #${n} of this record, said in For you`
        : `[spend] data/spend-budget.json is an OLDER copy (write ${facts.fileSeq} of ${facts.lastSeq}) — the turns nobody typed counted after it are not in it; reset #${n} of this record, said in For you`);
    resetNotice = { ...noticeOf(kind === 'removed' ? 'removed' : 'older', n), until };
    marker.noticeOwed = { kind: kind === 'removed' ? 'removed' : 'older', n, at: now, until };
    resetWriteOwed = true;
    return marker;
  }
  // the record the ledger meets at load (and again when an unreadable ledger reads again): older, unnumbered, or as written
  // B-ef83 (主开发's law 2026-11-19 19:20Z: A RESET NOTICE ONLY FOR A REAL LOSS): a write number below the marker's, or none, is
  // not a loss by itself — an older build writes no number (a downgrade and back), a marker repaired by hand can name any. A loss
  // is a turn that still counts which the marker recorded and the ledger does not hold (A.countLost) — whatever the numbers say:
  // a ledger NEWER than its marker that lacks the marker's turns is a reset whose marker never landed (a crash between the boot's
  // two writes), said once now; anything else is said in the journal only, and the ledger is numbered on
  const judgeAgainstMarker = (raw, now, facts = {}) => {
    if (!raw || !marker) return false;
    const fileSeq = seqOf(raw);
    if (A.countLost(marker.counted, raw.budget || raw, now)) {
      if (fileSeq === null) ledgerReset('unnumbered', facts, now);
      else if (fileSeq < marker.seq) ledgerReset('older', { fileSeq, lastSeq: marker.seq, ...facts }, now);
      else ledgerReset('removed', { fileSeq, lastSeq: marker.seq, ...facts }, now);
      return true;
    }
    if (fileSeq !== null && fileSeq >= marker.seq) return false;
    const why = marker.counted === undefined ? 'its marker records no count to compare' : 'every turn nobody typed that still counts is in it';
    log(fileSeq === null
      ? `[spend] data/spend-budget.json carries no write number (an older VibeSpace wrote it, or a copy from before the marker) — ${why}: nothing is lost, it is numbered on`
      : `[spend] data/spend-budget.json is write ${fileSeq} of ${marker.seq} — ${why}: nothing is lost, it is numbered on`);
    seq = Math.max(seq, Number(marker.seq) || 0);
    return false;
  };
  // the ledger GONE: a loss only when the marker recorded a turn that still counts (a crash between the boot's two writes leaves the
  // marker's own record of the restarted count — nothing — beside a missing ledger)
  const judgeGone = (facts, now) => {
    if (marker && A.countLost(marker.counted, null, now)) { ledgerReset('removed', facts, now); return true; }
    const why = !marker ? (facts.markerError ? `its marker cannot be read (${facts.markerError})` : 'no marker stands beside it') : marker.counted === undefined ? 'its marker records no count to compare' : 'its marker records no turn nobody typed that still counts';
    log(`[spend] data/spend-budget.json was removed — the count starts over; ${why}: no turn that still counts is lost, so For you is not told`);
    if (marker) seq = Math.max(seq, Number(marker.seq) || 0);
    return false;
  };
  {
    const mk = readMarker();   // read even while the ledger cannot be: its history must outlive B-3b0f's road
    if (mk.mark) marker = markerOf(mk.mark);
    if (mk.error) { markerUnreadable = mk.error; log(`[spend] data/spend-budget.born.json could not be read (${mk.error}) — it is held: not written until it reads again, never read as empty and written over`); }
    if (!heldBy) judgeLoaded(loaded, mk, Date.now());   // B-ef83: judged by the keeper only — at the takeover when another keeps it now
  }
  // the ledger as met (at boot, or at the takeover from another process) judged against its marker; an owed notice taken up
  function judgeLoaded(ld, mk, now) {
    if (ld.missing && mk.mark) judgeGone({}, now);
    else if (ld.missing && mk.error) judgeGone({ markerError: mk.error }, now);
    else if (ld.raw) judgeAgainstMarker(ld.raw, now);
    // a notice an earlier boot owed (the store never took it): owed still, with its end
    if (!resetNotice && marker && marker.noticeOwed && marker.noticeOwed.kind) resetNotice = { ...noticeOf(marker.noticeOwed.kind, Number(marker.noticeOwed.n) || marker.resets || 1), until: Number(marker.noticeOwed.until) || null };
  }
  /** B-3b0f: read an unreadable ledger again — ASYNC (the readers' round). → true when it reads again or is gone (the
   *  refusal ends; the ledger is written at once), false while it still cannot be read. */
  async function recheckLedger(now = Date.now()) {
    if (!unreadable || readInFlight || heldBy) return false;   // B-ef83: only the keeper reads the record again
    let t;
    readInFlight = true;
    try { t = { text: await asyncRead(file) }; } catch (e) { t = readError(e); } finally { readInFlight = false; }
    if (!unreadable) return false;   // another re-read settled it meanwhile
    const r = parseLedger(t);
    if (r.error) { unreadable.error = r.error; return false; }
    // stamps made meanwhile (an attended press, a carried frame) are KEPT beside the file's: a stamp is never dropped (a frame
    // carried meanwhile may then count twice — its file stamp and its fresh one — for a day: the safe direction)
    if (r.raw) {
      state = A.mergeBudget(A.pruneBudget(r.raw.budget || r.raw, now, A.LOAD_RETENTION), state);
      if (r.raw.nudge && typeof r.raw.nudge === 'object') nudge = { ...r.raw.nudge, ...nudge };
    }
    if (r.raw) {
      log('[spend] data/spend-budget.json reads again — unattended turns are counted and allowed again');
      if (!judgeAgainstMarker(r.raw, now, { afterUnreadable: true })) seq = Math.max(seq, seqOf(r.raw) || 0);   // B-23c3: a repair from an older copy is said too
    } else judgeGone({ afterUnreadable: true }, now);   // B-23c3: the owner's door (B-3b0f) — said and counted when it lost a turn that counts
    resetWriteOwed = false;   // the recheck road writes at once below (persist)
    fileResetNotice(); armNoticeRetry();
    unreadable = null;
    { // its notice is no longer true — B-44f3 (主开发 03:57Z, a should; the sibling of the held notice's close): For you held unread ⇒ closed at ITS read
      const closeLedger = () => { try { const ut = getUserTodos(); if (ut && typeof ut.idsWhere === 'function') for (const id of ut.idsWhere((i) => i && i.itemKey === LEDGER_ITEM && i.status === 'open')) ut.setStatus(id, 'done', 'agent'); } catch { } };
      let ut0 = null; try { ut0 = getUserTodos(); } catch { ut0 = null; }
      if (ut0 && typeof ut0.isHeldUnread === 'function' && ut0.isHeldUnread() && typeof ut0.whenRead === 'function') ut0.whenRead(closeLedger, "the spend ledger's unreadable notice"); else closeLedger();
    }
    if (recheckTimer) { try { unschedule(recheckTimer); } catch { } recheckTimer = null; }
    persist();
    noteGateFree(['ledger-unreadable'], now);   // B-ef83 unit 1: the ledger's own hold lifted
    return true;
  }
  /** the self-recheck: armed while the ledger cannot be read, one re-read per LEDGER_RECHECK_MS (unref'd), never two at once */
  function armRecheck() {
    if (!unreadable || recheckTimer) return;
    // (r2, S4) re-armed at every tick, never only when the read settled: a read that never settles (a hung mount) no longer
    // ends the self-recheck — the next tick finds it in flight and waits for it, and a read that settles is the repair's
    recheckTimer = schedule(() => { recheckTimer = null; recheckLedger().catch(() => false); if (unreadable) armRecheck(); }, LEDGER_RECHECK_MS);
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
    if (heldBy) {   // B-ef83: another process keeps the ledger — this one's count is not the record, and never written over it
      if (!heldBy.saidWrite) { heldBy.saidWrite = true; log(heldBy.lockUnwritable ? `[spend] data/spend-budget.json is not written by this process while its lock cannot be written (${heldBy.lockUnwritable})` : heldBy.lockUnreadable ? `[spend] data/spend-budget.json is not written by this process while its lock is there and cannot be read (${heldBy.lockUnreadable})` : '[spend] data/spend-budget.json is not written by this process while another keeps it'); }
      return;
    }
    if (unreadable) {   // B-3b0f: never written over while it cannot be read — the empty count must not become the record
      if (!unreadable.saidWrite) { unreadable.saidWrite = true; log('[spend] data/spend-budget.json is not written while it cannot be read'); }
      return;
    }
    try {
      seq += 1;
      writeJsonAtomic(file, { v: 1, seq, budget: state, nudge });
      marker = { born: (marker && marker.born) || Date.now(), seq, resets: (marker && marker.resets) || 0, lastReset: (marker && marker.lastReset) || null, noticeOwed: (marker && marker.noticeOwed) || null, counted: A.countedOf(state) };   // B-ef83: what this write counts
      writeMarker();   // B-23c3: after the ledger — a crash between leaves the ledger AHEAD of the marker, never behind
    }
    catch (e) { log('[spend] persist failed: ' + e.message); }
  };
  const persist = () => { if (timer) return; timer = setTimeout(() => { timer = null; writeNow(); }, 500); if (timer.unref) timer.unref(); };
  const flush = () => { if (timer) { clearTimeout(timer); timer = null; } writeNow(); };

  const limits = () => A.budgetLimits(serverSetting);
  // B-225b R11 (the persistence holds): data/settings.json HELD — the caps are not known (every row reads its default): NOT NOW, a
  // refusal that uses nothing up, judged against the real caps at the lift (persistence's settingsAgain → noteLimitsWritten)
  const SETTINGS_HELD = Symbol.for('vibespace.settings-held');
  const settingsHeld = () => { try { const h = serverSetting(SETTINGS_HELD); return h && typeof h === 'object' && typeof h.kind === 'string' ? h : null; } catch { return null; } };   // ONLY the hold's own fact (a reader that answers every key is no hold)
  // (cure 3) its notice waits out the hold's SILENT rungs like the page's strip (a read that answers on its next try is no news), and
  // the LIFT resolves it: settingsAgain says the limits moved (noteLimitsWritten) — the item closed, its stamp cleared (a later hold
  // is told again), a notice still owed to For you's read dropped
  const SETTINGS_SIG = 'inbox|*|settings-unread';
  const settingsSilent = () => { const h = settingsHeld(); return !h || h.rung !== 'said'; };
  let offSettingsLift = null;
  const closeSettingsItem = () => { try { const ut = getUserTodos(); if (ut && typeof ut.idsWhere === 'function') for (const id of ut.idsWhere((i) => i && i.itemKey === SETTINGS_ITEM && i.status === 'open')) ut.setStatus(id, 'done', 'agent'); } catch { } };
  const watchSettingsLift = () => {
    if (offSettingsLift) return;
    offSettingsLift = onLimitsWritten(() => {
      if (settingsHeld()) return;
      const off = offSettingsLift; offSettingsLift = null; if (off) off();
      noteGateFree(['settings-unread']);   // B-ef83 unit 1: the settings' hold lifted
      owedInbox.delete(SETTINGS_SIG);
      if (state.notices[SETTINGS_SIG]) { delete state.notices[SETTINGS_SIG]; persist(); }
      let ut0 = null; try { ut0 = getUserTodos(); } catch { ut0 = null; }
      if (ut0 && typeof ut0.isHeldUnread === 'function' && ut0.isHeldUnread() && typeof ut0.whenRead === 'function') ut0.whenRead(closeSettingsItem, "the held settings' spending notice"); else closeSettingsItem();
    });
  };
  // B-0a33 (2) × B-3b0f: while the ledger cannot be read no wait can be judged — '*' = every waiting frame is held
  const overCapNow = (now) => (heldBy ? [] : unreadable || settingsHeld() ? ['*'] : A.waitingOverCap(state, limits(), now));   // (B-225b: the settings HELD — no cap is known either: every waiting frame is held, none judged on the defaults)   // B-ef83: a process that does not keep the ledger judges no waiting frame (the keeper counted them) — none pulled
  const overagePolicy = () => (serverSetting('spend.allowOverageTurns') === true ? 'allow' : 'refuse');
  const ledgerFact = () => { if (heldBy) return heldBy.lockUnwritable ? { lockUnwritable: true, error: heldBy.lockUnwritable } : heldBy.lockUnreadable ? { lockUnreadable: true, error: heldBy.lockUnreadable } : { held: true, pid: heldBy.pid, host: heldBy.host }; if (unreadable) return { unreadable: true, error: unreadable.error }; const sh = settingsHeld(); return sh ? { settingsUnread: true, kind: sh.kind || null, code: sh.code || null } : null; };   // B-3b0f / B-ef83, handed to every layer (the batch too)

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
  // r3136 (主开发 r3146): a fact the reading cannot tell — the file could not be read (the door's mark), or after torn bytes the
  // fact is not stated again — is UNKNOWN BY NAME (`unread`): the authorizer refuses an unattended turn on it, never «no overage»
  const untold = (cache, fact) => !!(cache && typeof cache === 'object' && (cache.held === 'unread' || UW.restartUnknowns(cache).includes(fact)));
  function overageFor(key) {
    if (!key || !readCacheFor) return null;
    let cache = null;
    try { cache = readCacheFor(key); } catch { cache = null; }
    if (untold(cache, 'overage')) return { ...A.overageState(null), unread: true };
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
    if (untold(cache, 'spendControl')) return { ...A.spendControlState(null), unread: true };
    return A.spendControlState(cache);
  }
  // r3136: the accounts a «reading unread» notice was filed for — each closed when its reading tells again (a write lands, or the
  // file reads again): checked at each of those moments, only while one stands (a sync read of that account's file each)
  const readingHeld = new Set();
  let offReadingLift = null;
  const closeReadingItem = (k) => { try { const ut = getUserTodos(); if (ut && typeof ut.idsWhere === 'function') for (const id of ut.idsWhere((i) => i && i.itemKey === READING_ITEM + k && i.status === 'open')) ut.setStatus(id, 'done', 'agent'); } catch { } };
  const checkReadingLift = () => {
    for (const k of [...readingHeld]) {
      const o = overageFor(k), sc = spendControlFor(k);
      if ((o && o.unread) || (sc && sc.unread)) continue;
      readingHeld.delete(k);
      const sig = `inbox|${k}|reading-unread`;
      if (state.notices[sig]) { delete state.notices[sig]; persist(); }
      closeReadingItem(k);
    }
    if (!readingHeld.size && offReadingLift) { const off = offReadingLift; offReadingLift = null; off(); }
  };
  // r3285 (7): a write lifts only ITS account — the held accounts' files are read again at writes of a held account, never of any
  const heldByFile = (file) => { const b = path.basename(String(file || '')); for (const k of readingHeld) if (UW.cacheFileName(k) === b) return k; return null; };
  const watchReadingLift = (k) => {
    if (!k) return;
    readingHeld.add(k);
    if (offReadingLift) return;
    const a = UW.onUnreadLifted((k0) => { if (readingHeld.has(String(k0))) checkReadingLift(); }), b = UW.onWritten((file) => { if (heldByFile(file)) checkReadingLift(); });
    offReadingLift = () => { try { a(); } catch { } try { b(); } catch { } };
  };

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

  // B-44f3 (主开发 05:00Z, 2): a refusal's NOTICE while For you is held unread is OWED — the refusal stands (the gate decided, nothing
  // here waits on For you), the person reads why at the read: filed ONCE then (the newest words of its key), its cadence stamp the
  // refusal's own instant. At the read the seam with the «messages waiting» item is judged again over the READ list (the shape-C
  // seam: one owner item per stuck turn — that item speaks), and a notice whose expiry passed meanwhile is not filed. In memory: a
  // restart while held forgets it — the next refusal (it refuses again) files it as before
  const owedInbox = new Map();   // the notice's key (inboxSig) → { args, at, waitKey }
  let owedInboxAtRead = false;
  const waitItemOpen = (key) => { try { const ut = getUserTodos(); const sn = ut && typeof ut.snapshot === 'function' ? ut.snapshot() : null; return !!sn && (sn.open || []).some((i) => i && i.sessionKey === key && String(i.itemKey || '').startsWith('messages-waiting:')); } catch { return false; } };
  function fileOwedInbox() {
    owedInboxAtRead = false;
    let stamped = false;
    const t = Date.now();
    for (const [sig, o] of [...owedInbox]) {
      owedInbox.delete(sig);
      if (Number(o.args[3]) > 0 && Number(o.args[3]) <= t) continue;   // its expiry passed while held: the window it named is over
      if (o.waitKey && waitItemOpen(o.waitKey)) { if (!(Number(state.notices['held|' + sig]) > o.at)) { state.notices['held|' + sig] = o.at; stamped = true; log(`[spend-guard] at For you's read: the spending notice at ${o.waitKey} is not filed — its «messages waiting» item stands and speaks for that turn`); } continue; }   // the waiting item speaks (the live path's seam, its line said)
      if (fileInbox(...o.args) && !(Number(state.notices[sig]) > o.at)) { state.notices[sig] = o.at; stamped = true; }
    }
    if (stamped) persist();
  }
  function fileInbox(text, detail, urgency, expiresAt, i18n = null, about = null, itemKey = null, owe = null) {
    let userTodos = null;
    try { userTodos = getUserTodos(); } catch { userTodos = null; }
    if (!userTodos) return false;
    if (owe && owe.sig && typeof userTodos.isHeldUnread === 'function' && userTodos.isHeldUnread() && typeof userTodos.whenRead === 'function') {
      owedInbox.set(owe.sig, { args: [text, detail, urgency, expiresAt, i18n, about, itemKey], at: owe.at, waitKey: about && about.key ? about.key : null });
      if (!owedInboxAtRead) { owedInboxAtRead = true; userTodos.whenRead(fileOwedInbox, "a spend refusal's notice"); }
      return false;
    }
    // kind 'notice' (2.369.118): a spend ceiling is FOR THE USER'S INFORMATION —
    // it sits in the popup's own Notices section and never in the red badge
    // …and it dies with the window it is about (`expiresAt`, see NOTICE_TTL_MS)
    // `i18n` (lane owner-press-attended): the refusal as STRUCTURE — the client says the next free slot in the viewer's
    // zone from its epoch (A.refusalI18n), never a time string this hub rendered
    // B-0a33 round 1: `about` = the conversation waiting frames wait behind — the notice is filed under ITS key, so it opens it
    try { userTodos.add(about && about.key ? about.key : INBOX_KEY, { ...(i18n ? { i18n } : {}), ...(itemKey ? { itemKey } : {}), origin: 'spend', text: String(text).slice(0, 300), detail, urgency, by: 'agent', sessionName: 'Spending', kind: 'notice', expiresAt }); return true; }
    catch (e) {
      // the episode's item is asked again each minute while its add keeps throwing (a full list): its first failure is said, the rest
      // are the same episode (round w7yapjt1r) — every other notice says each failure, as before
      if (itemKey !== UNLOCKED_ITEM || !unlockedFailSaid) log('[spend] could not file the inbox item: ' + e.message);
      if (itemKey === UNLOCKED_ITEM) unlockedFailSaid = true;
      return false;
    }
  }

  /** THE GATE. Every producer of a turn nobody typed calls this BEFORE it
   *  spends, and nothing else may decide. Returns the PURE verdict; the side
   *  effects of a refusal (journal + telemetry + inbox) happen here, once. */
  /** r3060 / r3088 / r3197: THE ACCOUNTS LIST UNREAD — the engine's fact (`listHeld`), asked; a throw is held (fail closed) */
  function heldNow() { if (typeof listHeld !== 'function') return null; try { return listHeld() || null; } catch { return { code: 'held-unknown' }; } }
  function heldFact() { const lh = heldNow(); return lh ? { accountsHeld: { code: lh.code || 'unread', at: Number(lh.at) || null } } : {}; }
  /** an identity-unknown refusal while the list is unread NAMES its cause (the engine named no identity: never a pool's own id as a
   *  fresh name whose counts start at zero); no counter of any real identity is touched */
  function heldWords(v) {
    if (!v || v.ok || v.why !== 'identity-unknown') return v;
    const f = heldFact();
    if (f.accountsHeld) { v.accountsHeld = f.accountsHeld; v.detail = 'the accounts list could not be read, so the account this turn would bill cannot be named — no turn nobody typed is spent until it reads'; }
    return v;
  }
  function authorize({ reason, session = null, sessionId = null, sessionName = null, cid = null, identity: identityHint = null, hold: takeHold = true, now = Date.now() } = {}) {
    if (resetNotice && now - lastNoticeTry > 60 * 1000) fileResetNotice(now);   // B-23c3: a reset's notice the store could not take at boot (tried once a minute at most)
    sweepHolds(now);
    const identity = identityFor(session, identityHint);
    const key = identity && identity.key;
    const v = A.authorizeUnattendedSpend({
      reason, identity, state, limits: limits(),
      overage: overageFor(key), overagePolicy: overagePolicy(),
      credential: credentialFor(key), spendControl: spendControlFor(key),
      pending, ledger: ledgerFact(), now,
    });
    // r3060 / r3088: THE ACCOUNTS LIST UNREAD — the engine names NO identity (never a pool's own id as a fresh name whose counts
    // start at zero), so the authorizer refuses; the refusal NAMES its cause, and no counter of any real identity is touched
    heldWords(v);
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
    const inboxSig = wait ? `inbox|${key || '?'}|${v.why}|at|${wait.key || '?'}` : v.why === 'ledger-unreadable' || v.why === 'ledger-held-elsewhere' || v.why === 'ledger-lock-unwritable' || v.why === 'ledger-lock-unreadable' || v.why === 'settings-unread' ? `inbox|*|${v.why}` : `inbox|${key || '?'}|${v.why}`;   // B-3b0f: ONE notice for the instance, not one per account
    const lastInbox = Number(state.notices[inboxSig]) || 0;
    // THE SEAM WITH LAWS 2 + 3 (shape C — 主开发 2026-11-13 15:30Z): while a «messages waiting» For-you item stands for the
    // conversation these frames wait behind (src/server/wait-watch.js, the same key `<backend>:<cid>`), IT speaks: the spending
    // notice for that conversation is not filed — one owner item per stuck turn; filed as before once that item is gone.
    // Its journal line keeps the notice's cadence under its OWN stamp (主开发 17:45Z): one line per REFUSE_INBOX_MS while the item
    // stands — never one per refusal — and never the notice's stamp, so the notice is filed at once when the item goes
    const waitItemStands = !!(wait && wait.key) && waitItemOpen(wait.key);   // the ONE predicate (B-44f3: the owed notice judges the seam with it again at For you's read)
    const heldSig = 'held|' + inboxSig;
    if (waitItemStands && now - lastInbox > REFUSE_INBOX_MS && now - (Number(state.notices[heldSig]) || 0) > REFUSE_INBOX_MS) { state.notices[heldSig] = now; persist(); log(`[spend-guard] ${v.why}: the spending notice at ${wait.key} is not filed — its «messages waiting» item stands and speaks for that turn`); }
    if (v.why === 'settings-unread') watchSettingsLift();   // (cure 3: armed at the first refusal — the lift resolves what this hold said)
    if (v.why === 'reading-unread') watchReadingLift(key);   // r3136: ONE notice an account per hold, closed when its reading tells again
    // r3200: an account whose reading FILE cannot be read has its own For-you item with the person's way out (Set it aside —
    // src/server/usage-reading-for-you.js): IT speaks, one item an account; this notice is filed for the hold after torn bytes only
    // r3285 (1): ONLY while that item is truly OPEN (asked of the producer, which files it when it is not) — else this notice is filed
    const fileItemSpeaks = v.why === 'reading-unread' && !!key && typeof readingItemOpen === 'function' && readingItemOpen(key, UW.readingUnread(key) ? 'unread' : 'restart') === true;
    if (inbox && now - lastInbox > REFUSE_INBOX_MS && !waitItemStands && !fileItemSpeaks && !(v.why === 'settings-unread' && settingsSilent())) {   // inbox:false = a batch, answered in the person's own dialog (U2 cure); the held settings' notice only past the silent rungs (cure 3)
      const filed = fileInbox(text,
        `Reason: ${reason}\nIdentity: ${identity ? identity.name : 'unknown'}\nRefusal: ${v.why}\n`
        + (v.why === 'settings-unread' ? 'The settings data/settings.json could not be read: the spending limits are not known, so none run until it reads again. Nothing was used up; every waiting turn is judged again against your limits the moment it reads.\n\n'   // B-225b
          : v.why === 'reading-unread' ? "This account's usage reading cannot be told: its file started again after damaged bytes and has not yet said whether paid overage (or, for Codex, its spend control) is in use. Turns nobody typed on it wait until a reading says so; your own messages are not held. Nothing was used up.\n\n"   // r3136
          : v.why === 'ledger-unreadable' ? `The ledger data/spend-budget.json could not be read (${unreadable ? unreadable.error : '?'}): no count can be said, so none run until it reads again or is removed.\n\n`   // B-3b0f
          : v.why === 'ledger-lock-unwritable' ? `VibeSpace cannot write data/spend-budget.lock (${heldBy && heldBy.lockUnwritable ? heldBy.lockUnwritable : '?'}: the folder refuses it), and no other process keeps the ledger: it starts no turn nobody typed until it can. It asks again every ${LOCK_RETRY_MS / 1000} s, by itself; your own typed turns are not affected.\n\n`   // B-ef83 r1648 (b)/(c)
          : v.why === 'ledger-lock-unreadable' ? `data/spend-budget.lock is there and VibeSpace cannot read it (${heldBy && heldBy.lockUnreadable ? heldBy.lockUnreadable : '?'}), and the folder refuses a new one: it may be a live keeper's, so this process starts no turn nobody typed until the lock reads or can be made. It asks again every ${LOCK_RETRY_MS / 1000} s, by itself; your own typed turns are not affected.\n\n`   // r1801 (1)
          : v.why === 'ledger-held-elsewhere' ? `Another VibeSpace process on this data folder keeps the ledger data/spend-budget.json (pid ${heldBy ? heldBy.pid : '?'}${heldBy && heldBy.host ? ' on ' + heldBy.host : ''}): this one counts none, so none run until that process ends (or data/spend-budget.lock is removed, if none runs).\n\n`   // B-ef83
          : `Unattended turns used: ${v.counts.hour}/${v.limits.perIdentityHour} this hour, ${v.counts.day}/${v.limits.perIdentityDay} today `
          + `(instance ${v.counts.instanceDay}/${v.limits.perInstanceDay}).\n\n`)
        + (wait ? `${promisedHere} of them are messages waiting behind running turns — in ${behind.slice(0, 3).map((b) => `«${b.name || '?'}»`).join(', ')}${behind.length > 3 ? ` and ${behind.length - 3} more` : ''}. They run when that turn ends, or when you stop it there.\n\n` : '')
        + 'These ceilings bound every turn VibeSpace starts without you — the auto-continue after a usage limit, the Stop bookkeeping nudge, '
        + `Background Work notifications and messages from other sessions. ${A.spendRowOf(v) ? `Adjust this one in Settings → Spending — vibespace://settings/${A.spendRowOf(v)} — or act on the account named above.` : 'Adjust them in Settings → Spending, or act on the account named above.'}`,   // lane setting-doors pick 1: the row, as its link
        v.why === 'overage-in-use' || v.why === 'ledger-unreadable' || v.why === 'ledger-held-elsewhere' || v.why === 'ledger-lock-unwritable' || v.why === 'ledger-lock-unreadable' || v.why === 'settings-unread' ? 'high' : 'normal', noticeExpiry('refusal', now), A.refusalI18n(v, { sessionName: convName, behind }), wait && wait.key ? { key: wait.key } : null, v.why === 'ledger-unreadable' ? LEDGER_ITEM : v.why === 'ledger-held-elsewhere' || v.why === 'ledger-lock-unwritable' || v.why === 'ledger-lock-unreadable' ? HELD_ITEM : v.why === 'settings-unread' ? SETTINGS_ITEM : v.why === 'reading-unread' ? READING_ITEM + (key || '?') : null, { sig: inboxSig, at: now });   // B-3b0f: ONE item across restarts, resolved when the file reads again
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
    // A CONVERSATION WITH NO BILLING SLOT never refuses the whole PRESS (the cure's should): an attended batch skips it by
    // name and goes on with the named ones; a gated batch (the twin) still fails closed whole
    const pressBatch = !!(A.SPEND_REASONS[reason] && A.SPEND_REASONS[reason].attended === true);
    const named = resolved.filter((it) => it.identity && it.identity.key);
    if (!list.length || (unnamed && (!pressBatch || !named.length))) {
      const v = { ok: false, why: list.length ? 'identity-unknown' : 'empty-batch', detail: list.length ? `the credential slot ${(unnamed && unnamed.sessionName) || 'one conversation'} would bill could not be resolved` : 'the batch names no turn to authorize', retryAfter: 0, identity: null, reason, n: list.length, groups: [], counts: { hour: 0, day: 0, instanceDay: 0 }, limits: limits() };
      heldWords(v);   // 主开发 r3197: an unnamed slot while the accounts list is unread says so, as the single turn's refusal does
      if (list.length) sayRefusal({ reason, sessionId: unnamed && unnamed.sessionId, sessionName: unnamed && unnamed.sessionName, identity: null, key: null, v, now, inbox: false });
      return v;
    }
    const byKey = new Map();
    for (const it of named) {
      const g = byKey.get(it.identity.key) || { identity: it.identity, n: 0 };
      g.n++; byKey.set(it.identity.key, g);
    }
    const v = A.authorizeUnattendedBatch({
      reason, groups: [...byKey.values()], state, limits: limits(), overagePolicy: overagePolicy(), pending, now, ledger: ledgerFact(),
      ofKey: (k) => ({ overage: overageFor(k), credential: credentialFor(k), spendControl: spendControlFor(k) }),
    });
    if (!v.ok) {
      const g0 = (v.groups && v.groups[0]) || v;
      // a re-ask of ONE continue (the batch's loop, before each deliver) names ITS conversation in the journal, never «a batch of
      // 1» (U2 cure's should)
      const one = list.length === 1 ? list[0] : null;
      return sayRefusal({ reason, sessionId: one ? one.sessionId || 'a batch of 1' : `a batch of ${list.length}`, sessionName: one ? one.sessionName || null : null, identity: g0.identity || null, key: g0.identity && g0.identity.key, v: { ...g0, ...v, counts: g0.counts || { hour: 0, day: 0, instanceDay: 0 }, limits: g0.limits || limits(), identity: g0.identity || null }, now, inbox: false });
    }
    // AN ATTENDED BATCH HOLDS NOTHING (the owner's ruling 2026-11-18 — the bulk press is the person's own act): one row per
    // item, no hold — `note()` turns each delivered continue into the attended tally, never a stamp
    // …and an account it refused (form two — 主开发 16:20Z) hands back its items as SKIPPED rows, by name: the rest go on
    if (v.attended) {
      const off = new Map((v.refusedSlots || []).filter((r) => r && r.identity && r.identity.key).map((r) => [String(r.identity.key), r]));
      for (const r of off.values()) log(`[spend] bulk-resume: ${r.n} on ${r.identity.name || r.identity.key} left stopped — ${r.why}: ${r.detail || ''}`);
      return { ...v, holds: named.filter((it) => !off.has(it.identity.key)).map((it) => ({ sessionId: it.sessionId || null, identity: it.identity, hold: null })),
        skipped: [...named.filter((it) => off.has(it.identity.key)).map((it) => ({ sessionId: it.sessionId || null, identity: it.identity, why: off.get(it.identity.key).why })),
          ...resolved.filter((it) => !(it.identity && it.identity.key)).map((it) => ({ sessionId: it.sessionId || null, identity: null, why: 'identity-unknown' }))] };
    }
    const holds = named.map((it) => {
      const hold = `h${++holdSeq}`;
      pending = A.reservePending(pending, { id: hold, key: it.identity.key, at: now });
      return { sessionId: it.sessionId || null, identity: it.identity, hold };
    });
    return { ...v, holds };
  }

  /** THE RECORD OF A PRESS (the cure, 主开发 20:16Z): one row in the attended tally — when, how many, the batch id. */
  function notePress({ reason, press, n = 0, now = Date.now() } = {}) { state = A.notePressRow(state, { at: now, reason, press, n }); persist(); return true; }
  /** …its end (主开发 21:04Z (b)): how many it delivered. And the presses of the day, for the owner's spending view (a). */
  function notePressEnd({ press, delivered = 0, now = Date.now() } = {}) { state = A.notePressEnd(state, { at: now, press, delivered }); persist(); return true; }
  function pressesToday(now = Date.now()) { return unreadable ? null : A.pressesOf(state, { now }); }   // the record unreadable ⇒ null (never «no presses»)

  /** A QUIET LOOK at what a batch's authorization WOULD answer, per account (the bulk dialog's plan, BEFORE the press — 主开发
   *  16:20Z: «… 10 on account B are left stopped: B is billing paid overage» is said before as well as after): nothing held,
   *  nothing journalled, nothing filed, nothing granted. `refusedSlots` = [{identity, why, detail, n}]. */
  function previewBatch({ reason, items = [], now = Date.now() } = {}) {
    const resolved = (Array.isArray(items) ? items.filter(Boolean) : []).map((it) => ({ ...it, identity: identityFor(it.session || null, it.identity || null) })).filter((it) => it.identity && it.identity.key);
    if (!resolved.length) return { refusedSlots: [], ...heldFact() };   // 主开发 r3197: the preview says the list could not be read (its unnamed conversations stay stopped)
    const byKey = new Map();
    for (const it of resolved) { const g = byKey.get(it.identity.key) || { identity: it.identity, n: 0 }; g.n++; byKey.set(it.identity.key, g); }
    const v = A.authorizeUnattendedBatch({ reason, groups: [...byKey.values()], state, limits: limits(), overagePolicy: overagePolicy(), pending, now, ledger: ledgerFact(),
      ofKey: (k) => ({ overage: overageFor(k), credential: credentialFor(k), spendControl: spendControlFor(k) }) });
    const refusedSlots = Array.isArray(v.refusedSlots) ? v.refusedSlots : v.ok ? [] : [{ identity: v.identity || null, why: v.why, detail: v.detail, n: resolved.length }];
    // THE OVERAGE SENTENCE IS TRUE ON EVERY INSTANCE (the cure, 主开发 20:16Z): where the instance allows turns in paid overage,
    // the accounts the press would BILL as overage — named for the dialog's cost box
    const overageAllowed = overagePolicy() === 'allow';
    const off = new Set(refusedSlots.map((r) => r && r.identity && r.identity.key).filter(Boolean));
    const overageBilled = overageAllowed ? [...byKey.values()].filter((g) => !off.has(g.identity.key)).filter((g) => { const o = overageFor(g.identity.key); return !!o && o.inUse === 'yes'; }).map((g) => ({ identity: g.identity, n: g.n })) : [];
    return { refusedSlots, overageAllowed, overageBilled, ...heldFact() };
  }

  /** Renew the batch's holds it has not reached yet (spend-authorizer renewPending) — see authorizeBatch. */
  function renewHolds(holds, now = Date.now()) { pending = A.renewPending(pending, holds, now); return true; }

  /** Charge a spend that actually happened. The identity is the one
   *  `authorize()` resolved and put on its verdict — see identityFor; `hold` is
   *  the reservation that verdict opened, converted here into the stamp. */
  function note({ reason = null, identity: identityHint = null, session = null, hold = null, reservation = null, carried = false, drain = false, ended = false, behind = null, press = null, unheld = null, now = Date.now() } = {}) {   // carried: a queued frame's reservation CONVERTED (round 3) — marked; durable like any spend (the guard's debounce, round 4)   // drain: a stash drain never stamps   // reservation: a queued frame's id (lane queued-is-not-woke) — its unit taken once, returnable by release
    // B-0a33 (2), the readers' round: queued-wakes could not hold this waiting frame (its agent serves no «remove») — no stamp
    // changes; the person is told ONCE per frame, under the conversation it waits behind
    if (unheld && reservation) { fileUnheld(String(reservation), unheld, now, behind); return null; }
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
    const r = A.noteUnattendedSpend(state, { identity, at: now, limits: limits(), reason, rid: reservation, carried: !!carried, drain: !!drain, ended: !!ended, behind, press });
    state = r.state;
    persist();   // round 4: a reservation and a conversion are as durable as any spent turn — the guard's own debounce, never a write inside the send call or the carry callback
    if (r.warn && !heldBy) {   // B-ef83: never a warning from a count that is not the record
      const text = A.noticeText(r.warn);
      log(`[spend] ${text}`);
      try { global.__vsEvent?.('spend-budget-notice', `${r.warn.scope}:${r.warn.pct}`); } catch { }
      fileInbox(text, `Reason of the latest turn: ${reason || 'unattended'}\nScope: ${r.warn.scope}\nUsed: ${r.warn.used} of ${r.warn.limit}\n\nThe limit, to raise or lower it: vibespace://settings/${A.warnRowOf(r.warn)}`, 'normal', noticeExpiry(r.warn.scope, now));   // lane setting-doors pick 1: the warning names its row
    }
    return r.warn;
  }

  function fileUnheld(rid, why, now, behind = null) {
    const sig = `unheld|${rid}`;
    if (Number(state.notices[sig]) > 0) return;
    let wb = null;
    for (const list of Object.values(state.identities || {})) for (const t of list || []) if (t && t.rid === rid && t.wb) wb = t.wb;
    // (r2, S3) the stamp is not there while the ledger cannot be read — the caller names the conversation it waits behind
    if (!wb && behind && behind.key) wb = { key: String(behind.key).slice(0, 200), name: String(behind.name || '').slice(0, 120) };
    const i18n = A.unheldI18n(why, { conversation: wb && wb.name ? wb.name : '' });
    const text = (wb && wb.name ? `A message waiting behind «${wb.name}» could not be held` : 'A waiting message could not be held') + `: its agent is too old to give a queued message back, so it may run ${why === 'ledger' ? 'while the record of turns nobody typed cannot be read' : 'past the limit for turns nobody typed'}.`;
    const filed = fileInbox(text, `Reservation: ${rid}\nRestart that conversation so it runs on this VibeSpace’s agent — then a waiting message can be held.`, 'normal', noticeExpiry('refusal', now), i18n, wb && wb.key ? { key: wb.key } : null, `spend-unheld:${rid}`);   // (r2) its own item per frame — never merged by its words
    if (filed) { state.notices[sig] = now; persist(); }
    log(`[spend] a waiting frame (${rid}) could not be held — its agent serves no remove; ${filed ? 'said in For you' : 'For you not reachable'}`);
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

  // B-ef83: the keeper's heartbeat (async, unref'd) — it also finds a lock that no longer names this process (taken by another
  // after a long stall, or removed by hand) and acts on it
  function armBeat() {
    if (!lockOurs || beatTimer) return;
    beatTimer = lsched(() => {
      beatTimer = null;
      fs.promises.readFile(lockFile, 'utf-8').then((t) => {
        let h = null; try { h = JSON.parse(t); } catch { h = null; }
        if (!h || h.token !== myToken) return lockLost(h);
        const at = new Date(); return fs.promises.utimes(lockFile, at, at);
      }).catch((e) => { if (e && e.code === 'ENOENT') return lockLost(null); }).finally(() => { if (unlockedCloseOwed && closeItemsNow(UNLOCKED_ITEM)) unlockedCloseOwed = false; if (lockOurs) armBeat(); });   // r1801 (4): the owed close rides the beat (no new timer)
    }, LOCK_BEAT_MS);
  }
  function lockLost(h) {
    lockOurs = false;
    if (!h) {   // removed (or unreadable) while this process keeps the ledger: taken again — its record is still the record, never read again
      const lk = takeLock();
      if (lk.took) { lockOurs = true; log('[spend] data/spend-budget.lock was removed — this process, which keeps the ledger, made it again'); return; }
      // nobody holds it and it cannot be written (r1648 (b)): the release's direction — this process stops writing and starts no turn
      // nobody typed — by the TRUE reason (never «another process»), healed by the held retry the moment the folder writes again
      h = lk.holder || { lockUnwritable: lk.error };
    }
    heldBy = heldOf(h, Date.now());
    // the record is the other's now: what this process notes from here on is its own delta (a write still pending is not written —
    // at most half a second of stamps, which the other process's count does not hold)
    state = A.emptyBudget(); nudge = {};
    log(heldBy.lockUnwritable ? `[spend] data/spend-budget.lock was removed and cannot be written again (${heldBy.lockUnwritable}: the folder refuses it) — this process stops writing the ledger and starts no turn nobody typed until it can (asked again every ${LOCK_RETRY_MS / 1000} s)`
      : `[spend] data/spend-budget.lock names another VibeSpace process now (pid ${heldBy.pid || '?'}) — this one stops writing the ledger and starts no turn nobody typed until the lock is its own`);
    armLockRetry();
  }
  // B-ef83 (round wfm9rn69h; r1648 (a)): AT BOOT a lock that cannot be made while nobody holds one: the ledger is kept WITHOUT it (the
  // release's road), said once per cause by its code, SHOWN to the owner (one For-you item an episode + the usage meter's note),
  // asked again every LOCK_UNMADE_RETRY_MS; made ⇒ the heartbeat, the item closed; another process made it meanwhile ⇒ held
  function keepUnmade(error, now = Date.now(), how = '') {
    const same = !!lockUnmade && lockUnmade.error === error;
    lockUnmade = { error, since: same ? lockUnmade.since : now };
    if (!same) log(`[spend] data/spend-budget.lock ${how}could not be made (${error}: the folder refuses it) and no other process holds it — this process keeps the ledger without it, and asks again every ${LOCK_UNMADE_RETRY_MS / 1000} s`);
    if ((!same || unlockedOwed) && !unlockedFiled) { if (building) unlockedOwed = true; else unlockedOwed = !fileUnlocked(error); }   // ONCE an episode; owed until the store answers (r1801's must: the 60 s ask files it)
    armUnmadeRetry();
  }
  /** THE EPISODE's ITEM, filed → true when FILED or OWED to For you's read, false when it FAILED. r2047 (1)'s three outcomes:
   *  'filed' (a real add), 'owed' (to For you's read: fileInbox's own owed road files it there), 'failed' (no store yet, or the add
   *  threw — a full list; said in the journal once an episode): only the first two set the filed mark; a failed one is asked again
   *  at the next 60 s ask */
  function fileUnlocked(error) {
    let ut = null; try { ut = getUserTodos(); } catch { ut = null; }
    if (!ut || typeof ut.add !== 'function') return false;   // the store comes later in boot: the 60 s ask files it then
    const owedToRead = !!ut && typeof ut.isHeldUnread === 'function' && ut.isHeldUnread() && typeof ut.whenRead === 'function';
    const words = i18nKey('VibeSpace counts turns nobody typed without the lock of their record — the data folder refuses it ({code}). A second VibeSpace process on this folder would count its own; VibeSpace asks again every minute.');
    const filed = fileInbox(words.replace('{code}', error), `data/spend-budget.lock could not be made (${error}) and no other process holds it: this process keeps the ledger data/spend-budget.json without the lock. It asks again every ${LOCK_UNMADE_RETRY_MS / 1000} s; this notice closes when the lock is made.`,
      'normal', null, { text: { key: words, params: { code: error } } }, null, UNLOCKED_ITEM, { sig: 'unlocked|' + error, at: Date.now() });
    if (!filed && !owedToRead) return false;   // the add threw: NOT filed — asked again at the next 60 s ask
    unlockedFiled = true;   // filed — or owed to the store's read (fileInbox's own owed road files it there)
    return true;
  }
  // r1801 (4)'s OWED close (a boot that made the lock at once): only when the store answers and is READ — never a wait registered at
  // the read for an item that may not be there (the beat asks again); → true when closed (or nothing to close)
  function closeItemsNow(itemKey) {
    let ut = null; try { ut = getUserTodos(); } catch { ut = null; }
    if (!ut || (typeof ut.isHeldUnread === 'function' && ut.isHeldUnread())) return false;
    // a status write that THROWS closed nothing: said, and → false — the owed close stays, the next beat or retry asks again
    // (round w7yapjt1r: it answered true, the owed mark cleared and an untrue item stayed open for good)
    try { if (typeof ut.idsWhere === 'function') for (const id of ut.idsWhere((i) => i && i.itemKey === itemKey && i.status === 'open')) ut.setStatus(id, 'done', 'agent'); }
    catch (e) { log(`[spend] could not close the inbox item ${itemKey}: ${(e && e.message) || e} — asked again at the next beat`); return false; }
    return true;
  }
  // the episode's notice closes when its state ends — and, For you held unread, at its read (its list reads empty until then)
  function closeItems(itemKey) {
    const close = () => { try { const ut = getUserTodos(); if (ut && typeof ut.idsWhere === 'function') for (const id of ut.idsWhere((i) => i && i.itemKey === itemKey && i.status === 'open')) ut.setStatus(id, 'done', 'agent'); } catch (e) { log(`[spend] could not close the inbox item ${itemKey}: ${(e && e.message) || e}`); } };
    let ut0 = null; try { ut0 = getUserTodos(); } catch { ut0 = null; }
    if (!ut0) return false;   // no store yet: the close stays owed
    if (ut0 && typeof ut0.isHeldUnread === 'function' && ut0.isHeldUnread() && typeof ut0.whenRead === 'function') ut0.whenRead(close, "the spend ledger's unlocked notice"); else close();
    return true;
  }
  function armUnmadeRetry() {
    if (!lockUnmade || unmadeTimer) return;
    unmadeTimer = lsched(() => { unmadeTimer = null; lockRemake(); if (lockUnmade) armUnmadeRetry(); }, LOCK_UNMADE_RETRY_MS);
  }
  function lockRemake(now = Date.now()) {
    if (!lockUnmade || lockOurs || heldBy) return;
    staleTaken = null;
    const lk = takeLock(now);
    if (lk.took) {
      const was = lockUnmade; lockUnmade = null; lockOurs = true; releaseAtExit(lockFile, myToken);
      log(`[spend] data/spend-budget.lock is made now (it could not be since ${new Date(was.since).toISOString()}: ${was.error}) — this process keeps the ledger under it`);
      unlockedFiled = false; unlockedOwed = false; unlockedFailSaid = false; if (!closeItems(UNLOCKED_ITEM)) unlockedCloseOwed = true;   // the episode is over: its notice is no longer true
      armBeat(); return;
    }
    if (lk.holder) { lockUnmade = null; unlockedFiled = false; unlockedOwed = false; unlockedFailSaid = false; if (!closeItems(UNLOCKED_ITEM)) unlockedCloseOwed = true; lockLost(lk.holder); return; }   // another process made it meanwhile: the record is that one's
    keepUnmade(lk.error, now);
  }
  function armLockRetry() {
    if (!heldBy || lockTimer) return;
    lockTimer = lsched(() => { lockTimer = null; lockAgain(); if (unlockedCloseOwed && closeItemsNow(UNLOCKED_ITEM)) unlockedCloseOwed = false; if (heldBy) armLockRetry(); }, LOCK_RETRY_MS);   // r2047 (2): a lock lost before the store answered — the held retry closes the earlier item
  }
  /** B-ef83: ask for the lock again; taken ⇒ the record the other process kept IS the record: read again (beside the stamps made
   *  here meanwhile), judged against its marker, written. → true when this process keeps the ledger now */
  function lockAgain(now = Date.now()) {
    if (lockOurs) return true;
    if (lockUnmade && !heldBy) { lockRemake(now); return !heldBy; }   // it keeps the ledger already, without the lock — unless the remake met a holder
    staleTaken = null;
    const lk = takeLock(now);
    if (!lk.took && lk.holder) { heldBy = { ...heldOf(lk.holder, now), since: heldBy ? heldBy.since : now, saidWrite: heldBy ? heldBy.saidWrite : false }; return false; }
    // r1648 (c): the holder is gone and the lock cannot be written (the folder refuses it): STILL HELD (the release's direction), by
    // the TRUE reason — never in the gone holder's name — and asked again; the moment the folder writes, the lock is taken below
    if (!lk.took) {
      const sameCause = !!heldBy && heldBy.lockUnwritable === lk.error;
      heldBy = { ...heldOf({ lockUnwritable: lk.error }, now), since: heldBy ? heldBy.since : now, saidWrite: heldBy ? heldBy.saidWrite : false };
      if (!sameCause) log(`[spend] the process that kept data/spend-budget.json is gone, and data/spend-budget.lock cannot be written (${lk.error}: the folder refuses it) — this one starts no turn nobody typed until it can (asked again every ${LOCK_RETRY_MS / 1000} s)`);
      return false;
    }
    const was = heldBy;
    const wasUnreadable = !!unreadable;   // B-ef83 unit 1: the lift below names the ledger's own hold too when this read ends it
    heldBy = null; lockOurs = true; releaseAtExit(lockFile, myToken);
    unlockedCloseOwed = true;   // r2047 (2): a boot that started HELD takes the lock — an earlier run's «kept without the lock» item is no longer true
    if (lockTimer) { try { lunsched(lockTimer); } catch { } lockTimer = null; }
    log(`[spend] this process keeps data/spend-budget.json now${was && was.lockUnwritable ? ` (its lock could be written again: it could not since ${new Date(was.since).toISOString()}, ${was.lockUnwritable})` : was ? ` (the process that kept it, pid ${was.pid || '?'}, ended)` : ''}${staleTaken ? ` — its lock named a process that is gone (pid ${staleTaken.pid || '?'})` : ''}: the record is read again, and turns nobody typed are counted and allowed`);
    const ld = parseLedger(readText());
    if (ld.error) { unreadable = { error: ld.error, since: now }; log(`[spend] data/spend-budget.json could not be read (${ld.error}) — unattended turns are refused until it reads again or is removed; it is not written over`); armRecheck(); }
    else if (ld.raw) {
      if (unreadable) { unreadable = null; if (recheckTimer) { try { unschedule(recheckTimer); } catch { } recheckTimer = null; } }   // it reads now
      state = A.mergeBudget(A.pruneBudget(ld.raw.budget || ld.raw, now, A.LOAD_RETENTION), state);   // the file + the delta noted meanwhile
      if (ld.raw.nudge && typeof ld.raw.nudge === 'object') nudge = { ...ld.raw.nudge, ...nudge };
      seq = Math.max(seq, seqOf(ld.raw) || 0);
    }
    const mk = readMarker();
    markerUnreadable = null;
    if (mk.mark) marker = markerOf(mk.mark);
    if (mk.error) markerUnreadable = mk.error;
    judgeLoaded(ld, mk, now);
    { // B-44f3 (the meeting on the stores tip): For you held unread — its list reads empty, so the held notice's close waits for its read
      const closeHeld = () => { try { const ut = getUserTodos(); if (ut && typeof ut.idsWhere === 'function') for (const id of ut.idsWhere((i) => i && i.itemKey === HELD_ITEM && i.status === 'open')) ut.setStatus(id, 'done', 'agent'); } catch { } };
      let ut0 = null; try { ut0 = getUserTodos(); } catch { ut0 = null; }
      if (ut0 && typeof ut0.isHeldUnread === 'function' && ut0.isHeldUnread() && typeof ut0.whenRead === 'function') ut0.whenRead(closeHeld, "the spend ledger's held notice"); else closeHeld();
    }   // its notice is no longer true
    armBeat();
    if (!unreadable) flush();
    fileResetNotice(); armNoticeRetry();
    // B-ef83 unit 1: the lock's holds lifted (an owed turn refused by another hold that still stands is refused held again: owed to ITS lift)
    noteGateFree(['ledger-held-elsewhere', 'ledger-lock-unwritable', 'ledger-lock-unreadable', ...(wasUnreadable && !unreadable ? ['ledger-unreadable'] : [])], now);
    return true;
  }
  if (heldBy) armLockRetry(); else armBeat();
  building = false; if (unlockedOwed && lockUnmade && !unlockedFiled) unlockedOwed = !fileUnlocked(lockUnmade.error);   // r1648 (d): the boot's episode, said now — or by the 60 s ask once the store answers
  if (unlockedCloseOwed && closeItemsNow(UNLOCKED_ITEM)) unlockedCloseOwed = false;   // r1801 (4): never a wait at For you's read
  armRecheck();   // B-3b0f, the readers' round: an unreadable ledger re-reads itself (async, unref'd, once a minute)
  if (resetWriteOwed) { resetWriteOwed = false; flush(); }   // B-23c3: the record a reset left is written at once — the next boot reads it whole
  fileResetNotice(); armNoticeRetry();
  return {
    // r1648 (d): the ledger's lock state for the usage meter's note — 'unlocked' (kept without it since boot) | 'refused' (turns nobody
    // typed held: the lock cannot be written) | null
    ledgerNotice: () => (heldBy && heldBy.lockUnwritable ? { state: 'refused', error: heldBy.lockUnwritable, since: heldBy.since } : heldBy && heldBy.lockUnreadable ? { state: 'unreadable', error: heldBy.lockUnreadable, since: heldBy.since } : lockUnmade ? { state: 'unlocked', error: lockUnmade.error, since: lockUnmade.since } : null),
    authorize, authorizeBatch, previewBatch, notePress, notePressEnd, pressesToday, renewHolds, note, release, recheckLedger, lockAgain, overageFor, spendControlFor, nudgeRec, noteNudge, flush,
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
      ledgerResets: marker ? marker.resets : 0, ledgerLastReset: marker ? marker.lastReset : null, ledgerSeq: seq,   // B-23c3
      ledgerHeldBy: heldBy ? { pid: heldBy.pid, host: heldBy.host, since: heldBy.since, cause: heldBy.lockUnwritable ? 'lock-unwritable' : heldBy.lockUnreadable ? 'lock-unreadable' : 'another-process' } : null,   // B-ef83 (r1801 (5): which state a hold is)
      ledgerLockUnmade: lockUnmade ? { error: lockUnmade.error, since: lockUnmade.since } : null,   // B-ef83 smalls: kept WITHOUT the lock (the folder refuses it)
      ledgerLockUnwritable: heldBy && heldBy.lockUnwritable ? { error: heldBy.lockUnwritable, since: heldBy.since } : null,   // r1648 (b)/(c): held, no holder
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
// B-ef83 unit 1 (主开发 r4320 / r4323): THE GATE IS FREE AGAIN — one registry for the process (as onLimitsWritten: no wiring in
// server.js). A turn refused ONLY because the gate could not judge (A.HELD_WHYS) is owed to the lift of the hold that refused it;
// each hold says its OWN lift here, ONCE per held→free transition — the lock taken (its three whys), the ledger read again, the
// settings read at their lift. Never a timer of a producer's: the retries that end a hold are the guard's own (the lock's 5 s,
// the ledger's 60 s, the settings' write). → fn({ whys: [...], at })
const gateFreeListeners = new Set();
function onGateFree(fn) { gateFreeListeners.add(fn); return () => gateFreeListeners.delete(fn); }
function noteGateFree(whys, at = Date.now()) {
  const w = [...new Set((whys || []).filter((x) => A.isHeldWhy(x)))];
  if (!w.length) return;
  for (const fn of [...gateFreeListeners]) { try { fn({ whys: w, at }); } catch { } }
}
function noteLimitsWritten(prev, next) {
  // (r2, the follow-up's read S1) only a write that MOVED the limits re-judges the waiting frames: every settings write (an
  // autosave of any row) used to ask every waiting frame back out again — each ask a sidecar read on the main thread
  try { if (prev && next && JSON.stringify(prev) === JSON.stringify(next)) return; } catch { }
  for (const fn of [...limitsListeners]) { try { fn(prev || null, next || null); } catch { } }
}

module.exports = { create, onLimitsWritten, noteLimitsWritten, onGateFree, noteGateFree, REFUSE_LOG_MS, REFUSE_INBOX_MS, INBOX_KEY, NOTICE_TTL_MS, LEDGER_RECHECK_MS, noticeExpiry, LOCK_RETRY_MS, LOCK_UNMADE_RETRY_MS, LOCK_BEAT_MS, LOCK_STALE_MS, HELD_ITEM, SETTINGS_ITEM };

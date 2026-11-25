'use strict';
/**
 * THE KEPT BROWSERS — ORCH (lane browser-resume, §3.9 of docs/design-agent-browser-v2.zh.md; the owner's ruling 1,
 * 2026-09-30: "state survives the process"). The decisions are PURE (src/browser-kept.js); this module is the half that
 * TOUCHES things: the store `data/browser-kept.json`, the live tab list in memory, the size measurement (`du`, a child
 * process with a timeout — never on the loop), the hourly sweep that trims caches and removes what the bound or the
 * conversation's end says, and the user's Forget.
 *
 * WHO FEEDS IT. The keeper (src/server/browser-keeper.js) is the ONE caller for a browser's life: `noteStart` when a
 * conversation's own browser becomes ready, `noteStop` at every stop (its own stop(), the daemon's idle-out, a record
 * found dead at boot), `noteTabs` with the live list (the bridge's relay `tabs` record, or a CDP read at the stop), and
 * `noteDeliberate` for the agent's own `close` / `detach` (heard through its audit line / the detach). Nothing here
 * starts, stops or signals a browser: a RUNNING browser is never trimmed or removed (keepers report, never kill a used
 * session), and a Forget of a running one is refused `kept_live`.
 *
 * THE DIRECTORY IS NAMED BY THE KEY, NEVER READ FROM THE FILE: `data/browser-profiles/<bk>` (browser-env's
 * `scratchDirFor`). A removal re-derives it and refuses a directory a registered profile names (an agent's in-place
 * `new --adopt` of its own directory made it a profile: the entry goes, the directory stays).
 *
 * MULTI-CLIENT: every change broadcasts `{type:'browser-kept-updated'}` (debounced) — the Agent browser panel reloads.
 *
 * r3786 (主开发, line 821's second form — LAW 5: nothing that protects a sign-in is born in memory during a hold): THE FACT LIVES WITH
 * THE FOLDER. Before a conversation's own browser starts on its folder, the folder holds its NOTE (src/server/browser-kept-note.js:
 * the key, the conversation, the first time) — `startGate`; a note that cannot be written ⇒ that start is not kept, both told. At
 * every start of this store and every lift (the list's, the bindings'), ONE bounded child lists the folders and reads their notes, and
 * the store RECONCILES: a folder whose true note has no row gets one (ordinary: it ends with its conversation by the release's rules),
 * and a note's conversation that no binding names, on a key no binding names, gets its binding made again (only into an EMPTY place).
 * A reconcile that does not finish is UNKNOWN: that pass removes nothing (LAW 2), the next start, lift or sweep asks again, said once
 * (`kept_reconcile_unfinished`). The four memory states it replaces are gone: the owed offers, the stood set, the planned mark, and the
 * found-again protection of any folder with a note — `recovered` stays only for a folder with NO note.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const K = require('../browser-kept.js');
const SR = require('../store-read.js');
const HOLD = require('../store-read-hold.js');   // r3585 (B-f276 family's leftover): the list under the store-read law
const KN = require('./browser-kept-note.js');      // r3786: the note in each kept folder, its bounded child, its start gate's write

const FILE_MODE = 0o600;
const SWEEP_EVERY_MS = 60 * 60 * 1000;
const THERE_FRESH_MS = 10 * 1000; // B-7a30: a kept folder's presence bit is checked again (off the loop) when a read finds it this old
const THERE_ACT_MS = 5 * 1000; // B-7a30 r2: an act's fresh check waits at most this long — past it the act is refused by name
const UNANSWERED = Symbol('unanswered');
const PERSIST_TABS_MS = 30 * 1000;
const DU_TIMEOUT_MS = 120 * 1000;
const BROADCAST_DEBOUNCE_MS = 250;
/** r3585: the store the hold keeps, by its name (K.KEPT_FILE — said in the journal; the family's census reads it here) */
const STORE = 'browser-kept.json';
/** r3585: the list's shape (an object whose entries, when present, are an object) — anything else is torn bytes */
const KEPT_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && (v.entries === undefined || (!!v.entries && typeof v.entries === 'object' && !Array.isArray(v.entries)));
/** r3786 (hold 3): a start waits for its reconcile at most this long — the reconcile's own bound (its child's), and one second more */
const RECONCILE_WAIT_MS = KN.LIST_TIMEOUT_MS + 1000;
/** r3786: the codes a start of a conversation's browser is told by (once, in the agent's answer; on its card while they stand) */
const RECONCILE_CODE = 'kept_reconcile_unfinished';
// r4099: a browser handed PAST the doors' bound is NOT KEPT too (RECONCILE_CODE) — said by hold 5's own words
const NOT_KEPT_CODES = Object.freeze(['kept_note_unwritten', 'kept_note_timeout', 'kept_note_unreadable', RECONCILE_CODE]);

const namedError = (code, msg, extra = {}) => { const e = new Error(msg); e.code = code; Object.assign(e, extra); return e; };
/** tmp + rename, 0600 at create (a url or a title can be a secret) — the tree's one persistence rule. */
function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: FILE_MODE });
  fs.renameSync(tmp, file);
}

/**
 * @param deps
 *   dataDir         — the instance's data/
 *   keeper          — the browser keeper, or a getter (it is built after this store): `ephemeralFor(bk)` answers whether
 *                     a conversation's browser is live / starting; `list().profiles` which directories are registered
 *   liveKeys        — () => Set of the browser keys live sessions carry (a carried key never ends)
 *   liveConversations — () => Set of the conversations live sessions run (r4145: a kept folder BOUND to one counts as live for the size bound)
 *   bindings        — the durable conversation → key store (browser-bindings; built here over dataDir when absent)
 *   serverSetting / broadcast / log / now / execFileImpl / sweepEveryMs — injectable for the gate
 *   endsAtTerminate — D1's flag (default false: a Terminate is not an end)
 */
function create({ dataDir, keeper = null, liveKeys = () => new Set(), bindings = null, serverSetting = () => undefined, broadcast = null, log = console, now = Date.now,
  liveConversations = () => new Set(),   // r4145 (1)
  mono = () => performance.now(),   // r4094: the doors' bound is counted on a clock that never steps back (placed by a leg)
  execFileImpl = execFile, sweepEveryMs = SWEEP_EVERY_MS, endsAtTerminate = false, graceMs = K.KEPT_END_GRACE_MS,
  // B-7a30: the folder check (injectable: the gate PLACES a stall in it) and the acts' bound / the tick's period
  checkDir = null, thereActMs = THERE_ACT_MS, thereEveryMs = THERE_FRESH_MS,
  // lane B: the browser FACT carries what is kept (the live view's Resume) — a change here re-computes the facts (debounced)
  onChange = null,
  // B-50e7 (r3747 must 1): the settings HELD? (the hub's persistence router — the door the keeper has): while held the retention
  // sweep reads no limit (its total would be the default's, never the person's) and removes nothing
  settingsHeld = () => null,
  // r3585 / r3786: the kept folders' listing with their notes (injectable: the gate stands one in) → KN.listFolders's answer
  listFolders = null,
  // r3786: the note's write at a start — its bound, and the fs.promises it writes through (a leg plants a failing or a stalled one);
  // the listing child's execFile (a leg spies on it or cuts it at its bound — `execFileImpl` stays the size measure's alone)
  noteWriteMs = KN.NOTE_WRITE_MS, noteFs = null, listExec = null } = {}) {
  if (!dataDir) throw new Error('browser-kept: dataDir is required');
  const file = path.join(dataDir, K.KEPT_FILE);
  const PROFILE_DIR = path.join(dataDir, 'browser-profiles');
  /** THE directory of a kept browser — derived from its key, never read from the store. */
  const dirOf = (bk) => path.join(PROFILE_DIR, String(bk));
  const kp = () => { try { return typeof keeper === 'function' ? keeper() : keeper; } catch { return null; } };
  let bindingsMemo = null;
  const bindingsOf = () => bindings || (bindingsMemo = bindingsMemo || require('./browser-bindings.js').create({ dataDir, log }));
  const setting = (k) => { try { return serverSetting(k); } catch { return undefined; } };

  // ── state ──
  let store = null;                // the judged store (lazily loaded)
  // r3585 (THE STORE-READ LAW, the family's leftover «the kept browsers' list»): a read that FAILS holds the list — nothing is written
  // over it, nothing ends, nothing is removed, and it is read again OFF the loop and LIFTED with no restart (the panel, Resume and
  // the keep come back by themselves). A lift with NO LIST (torn bytes kept aside once by the helper, or the file gone after a failed
  // read) is NEVER «empty» here: the rows are REBUILT from the kept folders themselves (each named by its key), marked `recovered`;
  // a rebuild that does not finish holds the list again (never «rebuilt empty»). browser-env's boot sweep reads the file itself and
  // fails closed (r3006): a torn or unreadable file spares every key-named folder until the rebuilt list is written.
  let rebuilding = null, recovered = null;   // rebuilding: { since, copy } while the rows are rebuilt; recovered: { n, copy, at } (this run's rebuild — counts only)
  const hold = HOLD.create({
    file, valid: KEPT_SHAPE, code: 'kept_unread', aside: (mark) => file + '.corrupt-' + mark,
    words: (h) => `VibeSpace cannot read its list of kept browsers right now (${h.code}); it reads it again by itself every few minutes. No kept browser is lost: none is removed and nothing is written over the list until it reads`,
    log: (s) => log.warn?.('[browser-kept] ' + s),
    onLift: (v, facts) => lifted(v, facts),
  });
  const isHeld = () => !!hold.held() || !!rebuilding;
  // r3786: THE RECONCILE's state — 'none' (not asked yet this run) | 'done' | 'unknown' (it did not finish: nothing is removed)
  let recState = 'none', recBusy = null, recStart = null, recFacts = null, recSaid = false;
  // r4094: THE FLIGHT — a reconcile in the air: its number, its start on the monotonic clock (the doors' bound counts from it), the last one ended
  let recFlight = 0, recFlightEnded = 0, recBusySince = 0;
  const lateAsked = new WeakMap();   // r4094: a live session the LATE DOOR refused → the flight it waits for (its re-ask is the same wait)
  /** r3786: what a START of a key's browser is told by — bk → { code, at, said } (NOT_KEPT_CODES: not kept; RECONCILE_CODE: a
   *  resume handed a new browser past the start's reconcile's bound). Memory only, and that is the safe side: lost at a restart, the
   *  folder is what the release keeps (a note never written leaves no row by a note; nothing is removed by this map) */
  const startNotes = new Map();
  // r3786: the BINDINGS' lift (read again, or rebuilt from the records) reconciles too — a binding the rebuild could not know is made again
  // from its folder's note (this data folder's file only)
  let offBindingsLift = () => { };
  try { offBindingsLift = require('./browser-bindings.js').onLift(path.join(dataDir, 'browser-env', 'bindings.json'), () => { reconcile('bindings-lift').catch(() => { }); }) || offBindingsLift; } catch { /* the bindings' module says its own */ }
  const latest = new Map();        // bk → { tabs: [{targetId, url, title, active, type}], at, source } — the live list
  const deliberate = new Map();    // bk → { why: 'user'|'agent', at } — a stop the user / the agent asked for
  let flushTimer = null, bcTimer = null, sweepTimer = null, sweeping = null, lastSweep = null, thereTimer = null;

  function load() {
    if (store) return store;
    // r3585: the ONE sync read at the start, as before, answered through the family's law (held ⇒ the helper reads it again off the loop)
    let read; try { read = { text: fs.readFileSync(file, 'utf8') }; } catch (error) { read = { error }; }
    const a0 = SR.storeAnswer(read, { valid: KEPT_SHAPE });
    store = K.normalizeKeptStore(hold.start(a0) === 'data' ? a0.value : null);
    return store;
  }
  // THE SWEEP'S FAIL-CLOSED LAW (主开发 r3006, lane bl-windows), which the hold keeps: a store that could not be read — a read refused OR
  // bytes that do not parse — is NEVER «empty» to the boot sweep. The release SET IT ASIDE: the file became «not there», browser-env's own
  // read (keptKeySet) then answered an EMPTY set, and the boot sweep removed every kept browser's profile folder, its sign-ins. Now the
  // file stays where it is while held (torn bytes: COPIED aside, the original left until the rebuilt list is written): browser-env reads
  // it itself (a read that still fails ⇒ unknown ⇒ every key-named directory spared), and NOTHING is written over it (save() below)
  function save() {
    if (!store) return;
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (isHeld()) { hold.writable('a change of the kept browsers'); return; }   // r3006 / r3585: an unread (or not yet rebuilt) list is never written over
    try { fs.mkdirSync(dataDir, { recursive: true }); writeJsonAtomic(file, store); }
    catch (e) { log.warn?.(`[browser-kept] the store could not be written (${e && e.message}) — kept in memory, retried at the next change`); }
  }
  /** A tab list moving while the browser runs is persisted at most every PERSIST_TABS_MS (a crash keeps the last). */
  function saveSoon() { if (flushTimer) return; flushTimer = setTimeout(() => { flushTimer = null; save(); }, PERSIST_TABS_MS); if (flushTimer.unref) flushTimer.unref(); }
  function changed() {
    if (bcTimer) return;
    bcTimer = setTimeout(() => { bcTimer = null; try { broadcast?.({ type: 'browser-kept-updated' }); } catch (e) { log.warn?.(`[browser-kept] broadcast failed: ${e && e.message}`); } try { onChange?.(); } catch (e) { log.warn?.(`[browser-kept] change hook failed: ${e && e.message}`); } }, BROADCAST_DEBOUNCE_MS);
    if (bcTimer.unref) bcTimer.unref();
  }
  const convOf = (bk) => { try { return bindingsOf().conversationOf(bk) || null; } catch { return null; } };
  /** Is this conversation's browser running or starting right now (the keeper's record) — unknown ⇒ treated live. */
  function liveOf(bk) {
    const k = kp();
    if (!k || typeof k.ephemeralFor !== 'function') return true;
    if (typeof k.held === 'function' && k.held()) return true;   // the B-f276 remainder: a HELD registry knows no browser — treated live (nothing removed under it)
    try { const e = k.ephemeralFor(bk); return !!(e && (e.live || e.state === 'starting')); } catch { return true; }
  }
  /** Does a LIVE SESSION carry this key right now (its conversation runs, even while its browser is stopped)? Asked at
   *  the act, never from a list read before an await (verify F2). Unknown ⇒ carried (nothing is removed on a guess). */
  function carriedNow(bk) {
    try { const v = liveKeys(); return (v instanceof Set ? v : new Set(v || [])).has(bk); } catch { return true; }
  }
  /** A directory a REGISTERED (named) profile names — never removed through here. Unknown ⇒ treated registered. */
  function registeredDir(dir) {
    const k = kp();
    if (!k || typeof k.profileDirRegistered !== 'function') return true;
    try { return !!k.profileDirRegistered(dir); } catch { return true; }
  }
  const rowTabs = (tabs) => (Array.isArray(tabs) ? tabs : []).filter((t) => t && typeof t === 'object').slice(0, 64)
    .map((t) => ({ targetId: typeof t.targetId === 'string' ? t.targetId.slice(0, 64) : '', url: typeof t.url === 'string' ? t.url.slice(0, K.KEPT_URL_MAX * 4) : '', title: typeof t.title === 'string' ? t.title.slice(0, 1000) : '', active: t.active === true, type: typeof t.type === 'string' ? t.type : 'page' }));

  // ── the browser's life (the keeper's calls) ──
  /** The conversation's browser is ready: its entry exists (live — `stoppedAt: null`) with what it keeps. */
  function noteStart(bk, { hasDir = false, fenced = false, label = '', sessionId = null } = {}) {
    if (!K.isParentKey(bk)) return null;
    if (KN.isNotKept(bk)) return null;   // r4145 (2): a browser handed past the bound is NOT KEPT — it leaves no row and no tabs
    const s = load();
    const prev = s.entries[bk] || null;
    const t = now();
    if (hasDir) setThere(bk, true); // B-7a30: the keeper starts it ON its folder — the kept bit is that fact
    // lane B (D2): the STOPPED browser's kept tabs are moved aside as `waiting` — the live list starts empty (a fresh
    // browser's about:blank must never overwrite them); a reopen consumes them (`afterReopen`), `vibespace-browser
    // resume` / the user's Resume reopen them later, the next stop keeps them when the run opened nothing
    const wasStopped = !!(prev && prev.stoppedAt != null);
    const waiting = wasStopped ? (prev.tabs.length ? { tabs: prev.tabs, stoppedWhy: prev.stoppedWhy, stoppedAt: prev.stoppedAt } : null) : (prev ? prev.waiting : null);
    if (wasStopped) latest.delete(bk);
    s.entries[bk] = K.normalizeEntry(bk, { ...(prev || {}), hasDir, fenced, label: label || (prev && prev.label) || '', sessionId: sessionId || (prev && prev.sessionId) || null,
      conversationId: convOf(bk) || (prev && prev.conversationId) || null, tabs: wasStopped ? [] : (prev ? prev.tabs : []), waiting, startedAt: t, stoppedAt: null, stoppedWhy: null, lastUsedAt: t, recovered: null });   // r3585: its next real use makes a found-again row ordinary
    save(); changed();
    return { ...s.entries[bk] };
  }
  /** The live list (a relay's `tabs` record, or a CDP read). In memory at once; persisted (throttled) while it runs. */
  function noteTabs(bk, tabs, source = 'relay') {
    if (!K.isParentKey(bk) || !Array.isArray(tabs)) return false;
    if (KN.isNotKept(bk)) return false;   // r4145 (2): not kept — its tabs' addresses and titles are written nowhere
    const rows = rowTabs(tabs);
    latest.set(bk, { tabs: rows, at: now(), source });
    const s = load(); const e = s.entries[bk];
    if (e && e.stoppedAt == null) {
      const next = K.keptTabsOf(rows);
      if (JSON.stringify(next) !== JSON.stringify(e.tabs)) { e.tabs = next; e.tabsAt = now(); e.lastUsedAt = now(); saveSoon(); }
    }
    return true;
  }
  const latestOf = (bk) => { const l = latest.get(String(bk)); return l ? { tabs: l.tabs.map((t) => ({ ...t })), at: l.at, source: l.source } : null; };
  /** The agent's own `close` / `detach`, the user's detach — a DELIBERATE stop (D2: its tabs are not reopened by
   *  themselves). Heard before the stop (remembered for DELIBERATE_WINDOW_MS) or just after it (the stop re-worded). */
  function noteDeliberate(bk, why = 'agent') {
    if (!K.isParentKey(bk)) return false;
    const w = why === 'user' ? 'user' : 'agent';
    deliberate.set(bk, { why: w, at: now() });
    const e = load().entries[bk];
    if (e && e.stoppedAt != null && now() - e.stoppedAt < K.DELIBERATE_WINDOW_MS && K.AUTO_RESTORE_WHYS.includes(e.stoppedWhy)) {
      e.stoppedWhy = w;
      if (e.restore && e.restore.by === 'auto') e.restore = null;
      deliberate.delete(bk);
      save(); changed();
      log.log?.(`[browser-kept] ${bk}: its browser's stop was ${w === 'agent' ? 'the agent\'s own close' : 'the user\'s'} — its tabs are kept, not reopened by themselves`);
    }
    return true;
  }
  /**
   * The conversation's browser STOPPED (why = the keeper's own word). The last live list becomes the kept tabs (a tab
   * list handed in wins — the CDP read made at the stop), D2 decides `restore`, and an entry that keeps nothing (no
   * directory, no tab) is not written.
   */
  function noteStop(bk, { why = 'idle', hasDir = undefined, fenced = undefined, label = '', sessionId = null, tabs = undefined } = {}) {
    if (!K.isParentKey(bk)) return null;
    if (KN.isNotKept(bk)) return null;   // r4145 (2): not kept — no row
    const s = load();
    const prev = s.entries[bk] || null;
    const t = now();
    let w = K.stopWhyOf(why);
    const d = deliberate.get(bk);
    // a deliberate act heard just before names this stop (the detach's retire stops with the generic `user`; the daemon's
    // exit after the agent's own `close` is seen as an idle-out) — whose act it was is what D2 and the panel need
    if (d && t - d.at < K.DELIBERATE_WINDOW_MS && (K.AUTO_RESTORE_WHYS.includes(w) || w === 'user')) w = d.why;
    deliberate.delete(bk);
    const lt = latest.get(bk) || null;
    let kept = tabs !== undefined ? K.keptTabsOf(tabs) : (lt ? K.keptTabsOf(lt.tabs) : (prev ? prev.tabs : []));
    // lane B: a run that opened no web page keeps the tabs still WAITING from the stop before it (nothing is lost to an empty start)
    if (!kept.length && prev && prev.stoppedAt == null && prev.waiting && prev.waiting.tabs.length) kept = prev.waiting.tabs.map((x) => ({ ...x }));
    const dirKept = hasDir !== undefined ? !!hasDir : !!(prev && prev.hasDir);
    if (dirKept && w !== 'restart') setThere(bk, true); // B-7a30: it ran on its folder until now — the kept bit is that fact (a stop found at a boot saw no folder: the first check says)
    if (!prev && !dirKept && !kept.length) { latest.delete(bk); return null; }
    const auto = K.restoreKindFor(w) === 'auto' && kept.length > 0;
    // lane B: a restore the USER wrote (a Resume, "Hand back and continue") is STICKY until the agent's next command is told
    // — an automatic stop after it never replaces it (its note would be lost); else D2 decides
    const restore = prev && prev.restore && prev.restore.by === 'user' ? prev.restore : (auto ? { mode: 'auto', by: 'auto', at: t, id: 'bres-' + crypto.randomBytes(4).toString('hex') } : null);
    s.entries[bk] = K.normalizeEntry(bk, { ...(prev || {}), hasDir: dirKept, fenced: fenced !== undefined ? !!fenced : !!(prev && prev.fenced), label: label || (prev && prev.label) || '', sessionId: sessionId || (prev && prev.sessionId) || null,
      conversationId: convOf(bk) || (prev && prev.conversationId) || null, tabs: kept, tabsAt: tabs !== undefined ? t : (lt ? lt.at : (prev ? prev.tabsAt : 0)),
      stoppedAt: t, stoppedWhy: w, restore, waiting: null, lastUsedAt: t });
    latest.delete(bk);
    save(); changed();
    const e = s.entries[bk];
    log.log?.(`[browser-kept] ${bk}: its browser stopped (${w}) — kept: ${e.hasDir ? 'its logins and ' : ''}${e.tabs.length} tab(s)${e.fenced ? ' (fenced: tabs only)' : (!e.hasDir ? ' (tabs only)' : '')}${e.restore && e.restore.mode === 'auto' ? '; its next start reopens them' : ''}`);
    return { ...e };
  }

  // ── reads ──
  const has = (bk) => !!load().entries[String(bk || '')];
  const keys = () => new Set(Object.keys(load().entries));
  /** verify r2 (Y1c): an entry that says `hasDir` over a directory that is gone (removed out of band) answers tabs-only (its
   *  words: "not its logins"), so no surface says "its logins are kept" over nothing and a Resume never answers "resumed" as if
   *  they were. Said once per key.
   *  B-7a30 (the owner's hub witness: 17.2 s held in 13 holds — a statSync per ephemeral profile on every active-sessions
   *  broadcast): the directory's PRESENCE is a KEPT FACT, no longer read off the disk at every read (Y1c's «every read» is reversed,
   *  its bound said). The store's own acts set it (noteStart / noteStop — the keeper hands the fact); the tick checks every kept
   *  folder again OFF the loop each THERE_FRESH_MS (10 s). A VIEW reads what the last check found — «checking…» for one never
   *  checked since the boot — and a check that moves it notifies once; an ACT (Resume, the waiting tabs' reopen, forget) asks the
   *  folder fresh through checkThere, bounded at THERE_ACT_MS (5 s), and is refused by name past it. A read never touches the disk. */
  const saidGone = new Set();
  const there = new Map(); // bk → {ok, at, seq} — the kept bit; pruned with its entry (removeEntry / adopted)
  const checking = new Map(); // bk → the check in flight {p, since, seq} (the newest; an act's fresh check replaces the tick's)
  const told = new Map(); // bk → the answer the last read gave (true / false / null = checking): a check notifies only when it moves it
  let checkSeq = 0;
  const statDir = typeof checkDir === 'function' ? checkDir : (p) => fs.promises.stat(p).then((st) => st.isDirectory(), () => false);
  const setThere = (bk, ok) => { there.set(String(bk), { ok: !!ok, at: now(), seq: ++checkSeq }); };
  // a check's age is REAL time (a hang is a wall-clock fact; the store's own `now` may be a gate's stepped clock)
  const hung = (c) => !!c && (c.hung || Date.now() - c.since >= 3 * thereActMs); // `hung`: an act waited it out (its own bound), or nobody did and it is 3 bounds old
  const hungCheck = () => { for (const c of checking.values()) if (hung(c)) return c; return null; };
  /** ONE check of a key's folder, off the loop. A newer answer is never overwritten by an older check that lands after it. → the
   *  check's record ({p: the promise of the presence}). */
  function startCheck(k) {
    const rec = { p: null, since: Date.now(), seq: ++checkSeq };
    rec.p = Promise.resolve().then(() => statDir(dirOf(k))).then((ok) => !!ok, () => false).then((ok) => {
      if (checking.get(k) === rec) checking.delete(k);
      if (!load().entries[k]) return ok; // forgotten / adopted meanwhile: never re-added
      const t = there.get(k);
      if (!t || t.seq < rec.seq) there.set(k, { ok, at: now(), seq: rec.seq });
      const v = there.get(k).ok;
      if (told.has(k) && told.get(k) !== v) { told.set(k, v); changed(); } // it moved what a view drew: said once (debounced)
      return ok;
    }).catch((e) => { if (checking.get(k) === rec) checking.delete(k); log.warn?.(`[browser-kept] ${k}: its folder check failed: ${e && e.message}`); return false; });
    checking.set(k, rec);
    return rec;
  }
  /** THE TICK (B-7a30): every kept folder checked again OFF the loop, ONE at a time (a hung mount holds one thread, never the pool);
   *  a tick still waiting on a check starts no other. → the promise of the pass (the boot's first pass; the gate awaits it). */
  let thereTick = null;
  function recheckAll() {
    if (thereTick && !thereTick.done) return thereTick.p;
    // the pass is an OBJECT that ends itself (B-7a30: a pass finished without an await is never handed out again in the same run)
    const pass = { done: false, p: null };
    thereTick = pass;
    pass.p = (async () => {
      try {
        for (const k of Object.keys(load().entries)) {
          const e = load().entries[k];
          if (!e || !e.hasDir) continue;
          const c = checking.get(k);
          await (c ? c.p : startCheck(k).p); // a check already in flight is the pass's own (never a second stat of one folder)
        }
      } finally { pass.done = true; if (thereTick === pass) thereTick = null; }
    })();
    return pass.p;
  }
  /** WHAT A VIEW READS for a key's folder (B-7a30, 主开发's ruling: a VIEW reads what the last check found): true / false, or null =
   *  STILL CHECKING — never checked since the boot, a check of it unanswered past THERE_ACT_MS, or the disk not answering (a check
   *  hangs) while its bit is past THERE_FRESH_MS: a hung mount is never read as «present». A read never touches the disk; a read of
   *  a key never checked (or past its bound) asks for THE pass (recheckAll: one folder at a time, so a list of fifty never starts
   *  fifty stats on one disk) — none while a check hangs — and the tick runs it each THERE_FRESH_MS. */
  function presenceFor(bk) {
    const k = String(bk); const t = there.get(k);
    const old = !t || now() - t.at >= THERE_FRESH_MS;
    const stuck = hungCheck();
    if (old && !checking.has(k) && !stuck) recheckAll().catch(() => { }); // THE pass (one folder at a time) — never a check per key read
    const v = !t || hung(checking.get(k)) || (stuck && old) ? null : t.ok;
    told.set(k, v);
    return v;
  }
  /** THE ACTS' DOOR (B-7a30 r2): a Resume, the reopen of waiting tabs, a forget ask the folder FRESH — a new check, never one already
   *  in flight that may predate a removal — and wait at most THERE_ACT_MS (5 s). Past the bound, or while a folder check already
   *  hangs past it (no second one is stacked on a hung disk), the act is REFUSED by name `kept_unconfirmed`: never «resumed» over a
   *  folder nobody confirmed. → the presence (true / false). */
  async function checkThere(bk) {
    const k = String(bk || '');
    const e = k ? load().entries[k] : null;
    if (!e) return false;
    if (!e.hasDir) return false; // no folder is kept for it (fenced / tabs only): nothing to confirm, nothing refused
    const bound = thereActMs >= 1000 ? Math.round(thereActMs / 1000) + ' s' : thereActMs + ' ms';
    const unconfirmed = (other) => {
      log.warn?.(`[browser-kept] ${k}: ${other ? `the kept folders' disk is not answering (another folder's check has waited past ${thereActMs} ms)` : `its kept folder did not answer within ${thereActMs} ms`} — the act is refused (kept_unconfirmed)`);
      return namedError('kept_unconfirmed', other ? `the disk that holds the kept browsers is not answering (a check has waited more than ${bound}) — nothing was done; try again in a moment` : `its kept folder did not answer within ${bound} — nothing was done; try again in a moment`);
    };
    if (hungCheck()) throw unconfirmed(true);
    let timer = null;
    const rec = startCheck(k);
    // the bound is REF'D (an act in flight keeps the process up to its answer) and, when it fires, yields ONCE so a check that
    // finished while the loop was held answers first — never «unanswered» for a stat that did answer
    const r = await Promise.race([rec.p, new Promise((res) => { timer = setTimeout(() => setImmediate(() => res(UNANSWERED)), thereActMs); })]);
    clearTimeout(timer);
    if (r === UNANSWERED) { rec.hung = true; throw unconfirmed(false); }
    return r;
  }
  function judged(e) {
    if (!e || !e.hasDir) return e;
    const v = presenceFor(e.browserKey);
    if (v === null) return { ...e, checking: true }; // B-7a30: never «its logins» over a folder not checked since the boot
    if (v) { saidGone.delete(e.browserKey); return e; }
    if (!saidGone.has(e.browserKey)) { saidGone.add(e.browserKey); log.log?.(`[browser-kept] ${e.browserKey} "${e.label}": its entry says its logins are kept, but ${dirOf(e.browserKey)} is gone — read as tabs only (${e.tabs.length} tab(s)); its next start makes a fresh directory`); }
    return { ...e, hasDir: false };
  }
  function get(bk) { const e = judged(load().entries[String(bk || '')]); return e ? { ...e, dir: e.hasDir && !e.checking ? dirOf(e.browserKey) : null, kind: K.keptKindOf(e) } : null; }
  /** The one-line fact a keeper row / the browser fact carries. */
  function brief(bk) {
    const k = String(bk || ''), e = judged(load().entries[k]);
    // r3786 (hold 5): a start that is NOT kept says so where the person looks at that conversation's browser (its card reads this fact)
    const sn = startNotes.get(k), notKept = sn && NOT_KEPT_CODES.includes(sn.code) ? sn.code : null, unstarted = !!(notKept && sn.unstarted);
    if (!e) return notKept ? { tabs: 0, kind: 'not-kept', fenced: false, stoppedAt: null, stoppedWhy: null, restore: false, restoreBy: null, handedBack: false, waiting: 0, notKept, ...(unstarted ? { unstarted } : {}) } : null;
    return { tabs: e.tabs.length, kind: notKept ? 'not-kept' : K.keptKindOf(e), fenced: e.fenced, stoppedAt: e.stoppedAt, stoppedWhy: e.stoppedWhy, restore: !!e.restore, restoreBy: e.restore ? e.restore.by : null, handedBack: !!(e.restore && e.restore.handedBack), waiting: e.waiting ? e.waiting.tabs.length : 0, notKept };
  }
  // ── lane B (§3.9, ruling 2): the restore record + the waiting tabs (the keeper's calls) ──
  /** The user's Resume / "Hand back and continue" wrote what the agent's next command is told (sticky until then). */
  function setRestore(bk, r = {}) {
    const s = load(); const e = s.entries[String(bk || '')];
    if (!e) return null;
    e.restore = K.normalizeRestore({ mode: 'user', by: 'user', at: now(), id: r.id || ('bres-' + crypto.randomBytes(4).toString('hex')), tabs: r.tabs, note: r.note, handedBack: !!r.handedBack, drove: !!r.drove });
    e.lastUsedAt = now();
    save(); changed();
    return e.restore ? { ...e.restore } : null;
  }
  /** The agent's command was told (or the start reopened the tabs): the restore is gone. → the record it held, or null. */
  function consumeRestore(bk) {
    const s = load(); const e = s.entries[String(bk || '')];
    if (!e || !e.restore) return null;
    const r = e.restore; e.restore = null;
    save(); changed();
    return { ...r };
  }
  /** A reopen ran: what it did NOT reopen stays waiting (bounded by the plan — a slow page past the bound), the rest is gone. */
  function afterReopen(bk, leftover = []) {
    const s = load(); const e = s.entries[String(bk || '')];
    if (!e) return false;
    const w = K.keptTabsOf(leftover);
    e.waiting = w.length && e.stoppedAt == null ? { tabs: w, stoppedWhy: e.waiting ? e.waiting.stoppedWhy : null, stoppedAt: e.waiting ? e.waiting.stoppedAt : null } : null;
    save(); changed();
    return true;
  }
  /** The panel's rows (newest use first): what is kept, how big, whether its browser runs, whether a live session
   *  carries it (`carried` — lane B's Resume needs one). Titles / urls ride as data; the panel draws them as text. */
  function list() {
    const s = load();
    let carried = new Set(); try { const v = liveKeys(); carried = v instanceof Set ? v : new Set(v || []); } catch { carried = new Set(); }
    return Object.values(s.entries).sort((a, b) => b.lastUsedAt - a.lastUsedAt || (a.browserKey < b.browserKey ? -1 : 1)).map(judged).map((e) => ({
      browserKey: e.browserKey, label: e.label, kind: K.keptKindOf(e), hasDir: e.hasDir, checking: !!e.checking, fenced: e.fenced, tabs: e.tabs.map((t) => ({ ...t })), tabsAt: e.tabsAt,
      startedAt: e.startedAt, stoppedAt: e.stoppedAt, stoppedWhy: e.stoppedWhy, restore: e.restore ? { mode: e.restore.mode, by: e.restore.by, at: e.restore.at } : null, waiting: e.waiting ? e.waiting.tabs.length : 0,
      lastUsedAt: e.lastUsedAt, bytes: e.bytes, cacheBytes: e.cacheBytes, bytesAt: e.bytesAt, trimmedAt: e.trimmedAt,
      live: liveOf(e.browserKey), carried: carried.has(e.browserKey), sessionId: e.sessionId, recovered: !!e.recovered, conversationKnown: !!e.conversationId,
      unmeasuredSince: Number(e.unmeasuredSince) || 0, notKept: (() => { const sn = startNotes.get(e.browserKey); return sn && NOT_KEPT_CODES.includes(sn.code) ? sn.code : null; })(),   // r3786: «not measured» with its age; a start not kept
    }));
  }
  // B-50e7 (r3747 must 1): while the settings are held the bounds are the defaults, never the person's — said unread (the panel says the
  // hold, no number as the person's) and the sweep below waits
  const settingsHeldNow = () => { try { return settingsHeld() || null; } catch { return null; } };
  // r3941 (the follow): the sweep's wait is said ONCE a hold (the journal), never once a pass; a read pass clears it
  let heldSaid = false;
  const sayHeld = () => { if (heldSaid) return; heldSaid = true; log.warn?.('[browser-kept] the sweep waits while VibeSpace\'s settings cannot be read (its limits are unread) — no kept browser is removed until they read; said once a hold'); };
  const limits = () => { const l = K.keptLimits(setting); return settingsHeldNow() ? { ...l, unread: true, code: 'browser_settings_unread' } : l; };

  // ── ends ──
  /** Rename `p` beside itself (`<p>.<tag>-<ms>`) → the new path; null when there was nothing there; false when it could
   *  not be moved (never removed in place). The name is never a browser key, so browser-env's sweep never reads it as one. */
  async function moveAside(p, tag) {
    const to = `${p}.${tag}-${now()}-${crypto.randomBytes(2).toString('hex')}`;
    try { await fs.promises.rename(p, to); return to; }
    catch (e) { if (e && e.code === 'ENOENT') return null; log.warn?.(`[browser-kept] ${p} could not be moved aside: ${e && e.message}`); return false; }
  }
  /** Remove ONE entry and its directory (re-derived; a registered profile's directory stays). Never a live one; with
   *  `unlessCarried` (the sweep's two rules) never one a live session carries, re-asked here at the act (verify F2). */
  async function removeEntry(bk, why, { unlessCarried = false, byPerson = false } = {}) {
    const s = load(); const e = s.entries[bk];
    if (!e) return { removed: false, why: 'not kept' };
    // r3717 (THE BELT): a row found again after a damage (r3786: a folder with NO note — a noted one is ordinary, its fact the note) leaves
    // ONLY by the person's own Forget — never by an end, a bound or any other clock's act, whatever its caller computed
    if (!byPerson && e.recovered) return { removed: false, why: 'found again after a damage — removed only by the person\'s Forget' };
    if (liveOf(bk)) return { removed: false, why: 'its browser runs' };
    if (unlessCarried && carriedNow(bk)) return { removed: false, why: 'its conversation runs' };
    let dirGone = false, dirKept = null;
    const d = dirOf(bk);
    if (registeredDir(d)) dirKept = 'a registered profile names this directory now — left in place';
    else {
      // RENAMED FIRST (atomic), then removed: a start that begins while a big directory is being walked lands on a FRESH
      // directory, never inside the half-deleted one
      const aside = await moveAside(d, 'removing');
      if (aside === false) { dirKept = 'could not be moved aside — the entry stays'; log.warn?.(`[browser-kept] ${bk}: ${d} ${dirKept}`); return { removed: false, why: dirKept }; }
      if (aside) { try { await fs.promises.rm(aside, { recursive: true, force: true }); } catch (err) { log.warn?.(`[browser-kept] ${bk}: ${aside} could not be removed (${err && err.message}) — it is left beside the kept browsers`); } }
      dirGone = true;
    }
    // re-read after the await: a start that began meanwhile keeps its entry (it will write it again at its stop)
    if (liveOf(bk)) { log.log?.(`[browser-kept] ${bk}: its browser started while it was being removed (${why}) — its entry is kept`); return { removed: false, why: 'its browser started meanwhile' }; }
    delete s.entries[bk]; there.delete(String(bk)); told.delete(String(bk)); // B-7a30 r2: the bit goes with its entry
    latest.delete(bk); deliberate.delete(bk);
    save(); changed();
    log.log?.(`[browser-kept] ${bk} "${e.label}": removed (${why})${dirGone ? ` — ${d} deleted` : ''}${dirKept ? ` — its directory: ${dirKept}` : ''}`);
    return { removed: true, dirGone, dirKept };
  }
  /** The user's Forget (the panel row). Refused by name while the browser runs; a missing entry ⇒ not_kept. */
  async function forget(bk, why = 'forgotten by the user') {
    const key = String(bk || '');
    load(); hold.refuse('Forget');   // r3585: held ⇒ refused by name (503 kept_unread) — nothing was removed
    if (rebuilding) throw namedError('kept_unread', 'Forget: VibeSpace is finding its kept browsers again from their folders — nothing was removed; try again in a moment', { status: 503 });
    if (!K.isParentKey(key) || !load().entries[key]) throw namedError('not_kept', 'nothing is kept for that browser');
    if (liveOf(key)) throw namedError('kept_live', 'this browser is running — stop it first, then forget it');
    await checkThere(key); // B-7a30 r2: the act's door — its folder asked fresh (5 s), refused by name past it, never a removal on an unanswered disk
    const r = await removeEntry(key, why, { byPerson: true });
    if (!r.removed) throw namedError(/runs|started/.test(r.why) ? 'kept_live' : 'forget_failed', `the browser was not forgotten: ${r.why}`);
    return { ok: true, browserKey: key, dirGone: !!r.dirGone, dirKept: r.dirKept || null };
  }
  /** An adopt MOVED the directory into a named profile: the entry ends (the directory is the profile's now). */
  function adopted(bk) {
    const s = load(); if (!s.entries[bk]) return false;
    delete s.entries[bk]; latest.delete(bk); deliberate.delete(bk); there.delete(String(bk)); told.delete(String(bk)); // B-7a30 r2: the bit goes with its entry
    save(); changed();
    log.log?.(`[browser-kept] ${bk}: its directory became a named profile (adopted) — no longer kept here`);
    fs.promises.unlink(path.join(dirOf(bk), KN.NOTE_NAME)).catch(() => { });   // r3786: its note goes (off the loop; if it stays, a registered folder is never made a kept row by a note)
    return true;
  }

  // ── sizes + the sweep ──
  /** `du -sbl` over every path at once (a child process with a timeout; a missing path is simply absent). → {path: bytes} */
  function duBatch(paths, { timeoutMs = DU_TIMEOUT_MS } = {}) {
    if (!paths.length) return Promise.resolve({});
    return new Promise((resolve) => {
      let done = false;
      const finish = (o) => { if (!done) { done = true; resolve(o); } };
      try {
        execFileImpl('du', ['-sbl', '--', ...paths], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
          const out = {};
          for (const line of String(stdout || '').split('\n')) { const m = /^(\d+)\s+(.+)$/.exec(line.trim()); if (m) out[m[2]] = Number(m[1]); }
          if (err && !Object.keys(out).length) log.warn?.(`[browser-kept] du failed: ${err.message}`);
          finish(out);
        });
      } catch (e) { log.warn?.(`[browser-kept] du unavailable: ${e && e.message}`); finish({}); }
    });
  }
  /** r3786 (the unmeasured-row rule): ONLY «not found» is nothing — any other failed look is «not measured» (null), never 0 →
   *  { there: 'yes' | 'no' | 'unknown', size } */
  const look = async (p) => { try { return { there: 'yes', size: (await fs.promises.lstat(p)).size }; } catch (e) { return { there: e && e.code === 'ENOENT' ? 'no' : 'unknown', size: 0 }; } };
  let measureTurn = 0;
  /** Measure every kept directory: `{bk: {bytes, cacheBytes, caches:[path]}}` (a directory NOT FOUND = 0 / its entry keeps tabs
   *  only; a folder, a cache or its note whose look failed otherwise = `bytes: null`, not measured this pass). r3786: the folder's
   *  NOTE is never counted (its bytes leave the sum); the measure starts at a different row each pass, in turn, so a `du` cut at its
   *  bound does not leave the same end unmeasured pass after pass. */
  async function measure(entries) {
    const want = [], cachesOf = new Map(), noteBytes = new Map(), unsure = new Set();
    const rows = entries.filter((e) => e.hasDir);
    const from = rows.length ? (measureTurn++ % rows.length) : 0;
    for (const e of rows.slice(from).concat(rows.slice(0, from))) {
      const d = dirOf(e.browserKey);
      const w = await look(d);
      if (w.there === 'no') continue;
      if (w.there === 'unknown') { unsure.add(e.browserKey); continue; }
      const cs = [];
      for (const rel of K.CACHE_SUBDIRS) { const c = path.join(d, rel); const x = await look(c); if (x.there === 'yes') cs.push(c); else if (x.there === 'unknown') unsure.add(e.browserKey); }
      const n = await look(path.join(d, KN.NOTE_NAME));
      if (n.there === 'unknown') unsure.add(e.browserKey); else noteBytes.set(e.browserKey, n.there === 'yes' ? n.size : 0);
      if (unsure.has(e.browserKey)) continue;
      want.push(d); cachesOf.set(e.browserKey, cs); want.push(...cs);
    }
    const sizes = await duBatch(want);
    const out = {};
    for (const e of entries) {
      if (!e.hasDir) { out[e.browserKey] = { bytes: 0, cacheBytes: 0, caches: [] }; continue; }
      if (unsure.has(e.browserKey)) { out[e.browserKey] = { bytes: null, cacheBytes: 0, caches: [] }; continue; }
      const d = dirOf(e.browserKey);
      const cs = cachesOf.get(e.browserKey);
      if (!cs) { out[e.browserKey] = { bytes: 0, cacheBytes: 0, caches: [] }; continue; }   // not found: nothing kept on disk
      const b = sizes[d];
      out[e.browserKey] = { bytes: Number.isFinite(b) ? Math.max(0, b - (noteBytes.get(e.browserKey) || 0)) : null, cacheBytes: cs.reduce((n, c) => n + (Number.isFinite(sizes[c]) ? sizes[c] : 0), 0), caches: cs };
    }
    return out;
  }
  /**
   * THE SWEEP (boot + hourly + the panel's own): (1) every entry whose conversation ENDED goes (D1), (2) the sizes are
   * measured, (3) the PURE plan says which STOPPED directories lose their caches and which stopped entries go whole
   * (oldest first) — every act re-asks "is it running" right before it; (4) one journal line per rule that acted, the
   * store written, the panel told. Single flight.
   */
  function sweep() {
    if (sweeping) return sweeping;
    load();
    if (isHeld()) { log.warn?.('[browser-kept] the sweep waits — the list of kept browsers is held (nothing ends, nothing is removed, no cache is trimmed)'); return Promise.resolve({ held: true }); }   // r3585
    // the B-f276 remainder (bl-jobs): while the profile registry is HELD the kept sweep reads nothing as «gone» — no pass (a folder a
    // named profile holds, a running browser's caches); the keeper's read runs the boot's steps, this boot sweep among them
    { const k = kp(); if (k && typeof k.held === 'function' && k.held()) { log.warn?.('[browser-kept] the sweep waits — the profile registry is held'); return Promise.resolve({ held: true }); } }
    // B-50e7 (r3747 must 1): while the SETTINGS are held its limits are unread — the default total is never the person's bound: the sweep
    // removes nothing (no kept browser loses its sign-ins on a default); the next sweep after the lift applies the person's bound
    if (settingsHeldNow()) { sayHeld(); return Promise.resolve({ held: true, settings: true }); }
    heldSaid = false;
    sweeping = (async () => {
      const t0 = now();
      // r3786 (LAW 2, hold 4): the folders' notes are read to their end FIRST — a pass whose reconcile did not finish removes NOTHING
      // (nothing ends, the bound removes nothing, no cache is trimmed); the next start, lift or sweep reads them again
      if (recState !== 'done' && !(await reconcile('sweep'))) { log.warn?.(`[browser-kept] the sweep waits — ${RECONCILE_CODE}: the kept folders' notes were not read to their end (nothing ends, nothing is removed, no cache is trimmed)`); return { held: true, reconcile: RECONCILE_CODE }; }
      if (isHeld()) return { held: true };
      const s = load();
      let carried = new Set(); try { const v = liveKeys(); carried = v instanceof Set ? v : new Set(v || []); } catch (e) { log.warn?.(`[browser-kept] the live sessions could not be listed (${e && e.message}) — nothing ends this pass`); carried = null; }
      // r3054: the read that SAYS unknown (`boundKeys` throws on a failed read or torn bytes) — the guard below then ends nothing
      let bound = null; try { const bb = bindingsOf(); bound = typeof bb.boundKeys === 'function' ? bb.boundKeys() : bb.keys(); } catch (e) { log.warn?.(`[browser-kept] the bindings could not be read (${e && e.message}) — nothing ends this pass`); bound = null; }
      const ended = [];
      if (carried && bound) {
        for (const e of Object.values(s.entries)) {
          const v = K.keptEndVerdict({ entry: e, live: liveOf(e.browserKey), carried: carried.has(e.browserKey), bound: bound.has(e.browserKey), endsAtTerminate, now: now(), graceMs });
          if (v.end) { const r = await removeEntry(e.browserKey, v.why === 'conversation-ended' ? 'its conversation ended' : 'its conversation can never come back to it (no live session carries it and no binding names it)', { unlessCarried: true }); if (r.removed) ended.push({ key: e.browserKey, why: v.why }); }
        }
      }
      const entries = Object.values(load().entries);
      const sizes = await measure(entries);
      const lim = limits();
      // r3941 (1): a hold that BEGAN while the sizes were measured — asked again after the measure's await: nothing is removed on the default bounds
      if (lim.unread) { sayHeld(); return { held: true, settings: true }; }
      // r4145 (1): A RUNNING CONVERSATION's OWN KEPT FOLDER IS NOT IN THE SIZE BOUND's LINE — a kept folder BOUND to a conversation that is
      // running counts as live while it runs (after a door past its bound the conversation runs a browser that is not kept, while its
      // binding names its own folder); the running conversations unread ⇒ the live sessions are lacking (LAW 2: nothing removed)
      let liveConvs = null; try { const v = liveConversations(); liveConvs = v instanceof Set ? v : new Set(v || []); } catch (e) { log.warn?.(`[browser-kept] the running conversations could not be listed (${e && e.message}) — no kept browser is removed by the bound this pass`); liveConvs = null; }
      let ownerOf = new Map(); if (liveConvs && liveConvs.size) { try { const bb = bindingsOf(); ownerOf = typeof bb.conversationsByKey === 'function' ? bb.conversationsByKey() : new Map(); } catch { liveConvs = null; } }   // one synchronous read of the bindings a pass, only while a conversation runs
      const liveNow = new Map(entries.map((e) => [e.browserKey, liveOf(e.browserKey) || !!(liveConvs && ownerOf.has(e.browserKey) && liveConvs.has(ownerOf.get(e.browserKey)))]));
      // carried = a live session carries the key (its conversation runs): read AFTER the measure's await, fail closed
      let carriedSet = null; try { const v = liveKeys(); carriedSet = v instanceof Set ? v : new Set(v || []); } catch (e) { log.warn?.(`[browser-kept] the live sessions could not be listed (${e && e.message}) — no kept browser is removed by the bound this pass`); carriedSet = null; }
      const carriedAt = new Map(entries.map((e) => [e.browserKey, carriedSet ? carriedSet.has(e.browserKey) : true]));
      let plan = K.keptRetentionPlan({ entries: entries.map((e) => ({ key: e.browserKey, bytes: sizes[e.browserKey] ? sizes[e.browserKey].bytes : null, cacheBytes: sizes[e.browserKey] ? sizes[e.browserKey].cacheBytes : 0, lastUsedAt: e.lastUsedAt, live: liveNow.get(e.browserKey), carried: carriedAt.get(e.browserKey), recovered: !!e.recovered })), perConversation: lim.perConversation, total: lim.total });   // r3717 (ruling 3): the found-again mark reaches the plan
      // r3786 (LAW 2): A PASS LACKING A FACT REMOVES NOTHING, the bound included — the live sessions or the bindings unread ⇒ no plan acts
      const lacking = !carried || !carriedSet || !liveConvs ? 'the live sessions' : !bound ? 'the bindings' : null;
      if (lacking) { if (plan.trimCaches.length || plan.remove.length) log.warn?.(`[browser-kept] sweep: ${lacking} could not be read — the size bound removes nothing and no cache is trimmed this pass`); plan = { ...plan, trimCaches: [], remove: [] }; }
      const trimmed = [], removed = [];
      for (const tc of plan.trimCaches) {
        if (liveOf(tc.key)) continue; // re-asked right before the act
        let freed = 0;
        // each cache moved aside first (a start meanwhile makes a fresh one), then removed
        for (const c of (sizes[tc.key] && sizes[tc.key].caches) || []) { const aside = await moveAside(c, 'trim'); if (aside) { try { await fs.promises.rm(aside, { recursive: true, force: true }); } catch (e) { log.warn?.(`[browser-kept] ${tc.key}: ${aside} not trimmed — ${e && e.message}`); } } }
        freed = tc.frees;
        const e = load().entries[tc.key]; if (e) { e.trimmedAt = now(); if (sizes[tc.key]) { sizes[tc.key].bytes = Math.max(0, (sizes[tc.key].bytes || 0) - freed); sizes[tc.key].cacheBytes = 0; } }
        trimmed.push({ key: tc.key, frees: freed });
      }
      for (const rm of plan.remove) { const r = await removeEntry(rm.key, rm.why, { unlessCarried: true }); if (r.removed) removed.push({ key: rm.key, frees: rm.frees }); }
      // the sizes land on the entries still here (the panel's "{size}")
      const s2 = load();
      for (const [k, v] of Object.entries(sizes)) { const e = s2.entries[k]; if (!e) continue; if (v.bytes === null) { if (!e.unmeasuredSince) e.unmeasuredSince = now(); } else { e.bytes = v.bytes; e.cacheBytes = v.cacheBytes; e.bytesAt = now(); e.unmeasuredSince = 0; } }   // r3786: «not measured» keeps its age (the panel says it)
      save(); changed();
      lastSweep = { at: now(), ms: now() - t0, ended: ended.length, trimmed: trimmed.length, trimmedBytes: trimmed.reduce((n, x) => n + x.frees, 0), removed: removed.length, removedBytes: removed.reduce((n, x) => n + x.frees, 0), used: plan.used, limit: plan.limit, reported: plan.kept.map((x) => ({ key: x.key, overBy: x.overBy, why: x.why })), unmeasured: plan.unmeasured.length, lacking, outside: plan.outside || 0 };
      if (ended.length) log.log?.(`[browser-kept] sweep: ${ended.length} kept browser(s) ended with their conversation (${ended.map((x) => x.key).join(', ')})`);
      if (trimmed.length) log.log?.(`[browser-kept] sweep: the caches of ${trimmed.length} kept browser(s) over their own bound (${Math.round(lim.perConversation / K.MB)} MB) were removed — their logins stay (${trimmed.map((x) => x.key).join(', ')})`);
      if (removed.length) log.log?.(`[browser-kept] sweep: ${removed.length} kept browser(s) removed, least recently used first — the kept browsers were over their total bound (${Math.round(lim.total / K.MB)} MB) (${removed.map((x) => x.key).join(', ')})`);
      for (const r of plan.kept) log.log?.(`[browser-kept] sweep: ${r.key || 'all kept browsers'} over by ${r.overBy} bytes — ${r.why}`);
      return lastSweep;
    })().finally(() => { sweeping = null; });
    return sweeping;
  }
  function boot() {
    load();
    if (!recStart) recStart = reconcile('start');   // r3786: THE START's reconcile — the first sweep waits for it (and so does a create: reconciled)
    const first = sweep().catch((e) => { log.warn?.(`[browser-kept] boot sweep failed: ${e && e.message}`); return null; });
    if (!sweepTimer && sweepEveryMs > 0) { sweepTimer = setInterval(() => { sweep().catch((e) => log.warn?.(`[browser-kept] sweep failed: ${e && e.message}`)); }, sweepEveryMs); if (sweepTimer.unref) sweepTimer.unref(); }
    // B-7a30: every kept folder's presence checked at once (off the loop; the views say «checking…» until it lands), then on its tick
    recheckAll().catch(() => {});
    if (!thereTimer && thereEveryMs > 0) { thereTimer = setInterval(() => { recheckAll().catch(() => {}); }, thereEveryMs); if (thereTimer.unref) thereTimer.unref(); }
    return first;
  }
  /** SIGINT / SIGTERM: a throttled tab list is written now (the crash path this feature exists for). */
  function shutdown() {
    try { offBindingsLift(); } catch { }
    if (sweepTimer) clearInterval(sweepTimer); sweepTimer = null;
    if (thereTimer) clearInterval(thereTimer); thereTimer = null;
    if (bcTimer) { clearTimeout(bcTimer); bcTimer = null; }
    if (flushTimer) save();
  }

  // ── r3585: the lift, the rebuild from the folders, the facts the panel and the notice read ──
  /** LIFTED (the helper's read again answered). A list: loaded, with what this run noted while held laid over it (a row noted then is a
   *  true fact of a browser that ran meanwhile — newer than the file's). NO list: the rows are rebuilt from the kept folders. */
  /** r3717: a row noted while the list was held, laid over the file's row: the noted facts win, and what only the file held stays — its
   *  label, its restore, and its kept tabs (as `waiting` when the noted browser runs again, as its tabs when it stopped with none) */
  function mergeNoted(f, n) {
    if (!f) return n;
    const out = { ...f, ...n, label: n.label || f.label, restore: n.restore || f.restore || null };
    const fTabs = Array.isArray(f.tabs) ? f.tabs : [];
    if (n.stoppedAt == null) { if (!n.waiting && f.stoppedAt != null && fTabs.length) out.waiting = { tabs: fTabs, stoppedWhy: f.stoppedWhy, stoppedAt: f.stoppedAt }; }
    else if (!(Array.isArray(n.tabs) && n.tabs.length)) out.tabs = fTabs;
    return K.normalizeEntry(n.browserKey || f.browserKey, out);
  }
  function lifted(v, facts) {
    if (!v) { Promise.resolve(rebuildFromFolders((facts && facts.setAside) || null)).then((ok) => { if (ok) reconcile('lift').catch(() => { }); }, () => { }); return; }   // r3786: the rows rebuilt, then the notes' bindings
    const noted = store ? store.entries : {};
    store = K.normalizeKeptStore(v);
    let laid = 0;
    for (const [k, e] of Object.entries(noted)) if (!store.entries[k] || (Number(e.lastUsedAt) || 0) > (Number(store.entries[k].lastUsedAt) || 0)) { store.entries[k] = mergeNoted(store.entries[k], e); laid++; }
    if (laid) save();
    changed(); recheckAll().catch(() => {});
    reconcile('lift').catch(() => { });   // r3786: every lift reconciles from the notes (a row a note names, a binding made again)
  }
  /** r3786: the profile registry's folders, from the keeper (its registry held, or no keeper ⇒ null: unknown — the pass does not finish) */
  function registeredNow() { const k = kp(); if (!k || typeof k.registeredDirs !== 'function') return null; try { const v = k.registeredDirs(); return Array.isArray(v) ? v.map(String) : null; } catch { return null; } }
  /** THE ONE CHILD of a reconcile and of a rebuild (src/server/browser-kept-note.js listFolders: bounded in time and output, the
   *  allowlisted environment): the key-named folders, their notes, and the registered folders' identities — off the hub's loop →
   *  KN.listFolders's answer + `registered(dir)` | { ok: false, why } */
  function listNotes() {
    const regs = registeredNow();
    if (!regs) return Promise.resolve({ ok: false, why: 'the profile registry is not read' });
    const ask = typeof listFolders === 'function' ? Promise.resolve().then(() => listFolders(PROFILE_DIR, { registered: regs })) : KN.listFolders(PROFILE_DIR, { registered: regs, ...(listExec ? { execFileImpl: listExec } : {}) });
    return ask.then((r) => {
      if (!r || !r.ok) return r || { ok: false, why: 'failed' };
      if ((r.regs || []).some((x) => !x.id && x.why !== 'ENOENT')) return { ok: false, why: 'a registered profile\'s folder could not be compared' };
      const ids = new Set((r.regs || []).filter((x) => x.id).map((x) => x.id)), paths = new Set((r.regs || []).map((x) => path.resolve(x.dir)));
      return { ...r, registered: (d) => (!!d.id && ids.has(d.id)) || paths.has(path.join(PROFILE_DIR, d.name)) };
    }, (e) => ({ ok: false, why: String((e && e.code) || 'failed') }));
  }
  const bounded = (p, ms, late) => { let tm = null; return Promise.race([p, new Promise((res) => { tm = setTimeout(() => res(late), ms); })]).finally(() => clearTimeout(tm)); };
  /** r3786 (hold 4): A RECONCILE THAT DOES NOT FINISH IS UNKNOWN — never «nothing found»: that pass removes nothing; said once by its code */
  function unfinished(why, reason) {
    recState = 'unknown';
    if (!recSaid) { recSaid = true; log.warn?.(`[browser-kept] ${RECONCILE_CODE}: the kept browsers' folders and their notes were not read to their end (${why}: ${reason}) — this pass removes nothing; the next start, lift or sweep reads them again`); }
    return false;   // nothing a view draws moved (the panel's rows are the list's), so no broadcast
  }
  /**
   * r3786: THE RECONCILE (every start, every lift, a sweep after one that did not finish). From the notes TRUE TO THEIR FOLDERS (hold 1:
   * another folder's note is ignored; a registered profile's folder is never made a kept row by a note):
   *   · a folder whose note has no row gets one — ORDINARY: its conversation and first time from the note; it ends with its conversation
   *     by the release's rules (a found-again row whose folder has a note is ordinary now). While the list is held the rows wait for its
   *     lift (whose reconcile lays them); the bindings' half runs anyway.
   *   · hold 2: a note's conversation gets its BINDING MADE AGAIN only into an EMPTY place — no binding names that conversation AND none
   *     names that browser (browser-bindings restoreFromNotes, record()'s own rule). A conversation whose binding names ANOTHER browser
   *     has MOVED ON: the older folder is then an ordinary row with no holder, and it ends by the release's rules (no binding names it).
   * → true (done) | false (unknown: nothing is removed by this pass; the next start, lift or sweep asks again)
   */
  function reconcile(why = 'start') {
    if (recBusy) return recBusy;
    recBusySince = mono(); const flight = ++recFlight;   // r4094: a new flight (single flight: a door that arrives now shares it)
    const p = (async () => {
      const r = await listNotes();
      if (!r || !r.ok) return unfinished(why, (r && r.why) || 'failed');
      if (r.dirs.some((d) => d.note === 'unreadable')) return unfinished(why, 'a folder\'s note could not be read');
      const noted = new Map();
      for (const d of r.dirs) if (d.note === 'true' && !r.registered(d)) noted.set(d.name, { ...d.doc, mtimeMs: d.mtimeMs });
      // r3963 (item 6): the bindings must READ for a reconcile to finish (a standing binding is a fact on disk) — unknown removes nothing
      let bb0 = null; try { bb0 = bindingsOf(); } catch { bb0 = null; }
      if (!bb0 || (typeof bb0.state === 'function' && bb0.state() === 'unknown')) return unfinished(why, 'the bindings could not be read');
      load();
      let added = 0, ordinary = 0, fromBinding = 0, notWritten = 0;
      const repaired = new Set();   // r4094: the rows the repair makes are stamped at the repair (below)
      if (!isHeld()) {
        // r3963 (item 6): a key-named folder a STANDING BINDING names, with no true note and no row (a folder of before the upgrade whose
        // row lived in memory only, or a list that is gone), is not left a folder with no row: its NOTE is written now — true to its folder
        // (its own name), the binding's conversation, the folder's time — and its row follows below. Nothing is bound by it (the binding
        // stands). A note that cannot be written leaves the folder to the boot sweep's rule (a binding names it: never removed by age),
        // tried again at the next reconcile
        const s0 = load();
        // r4094: the bindings' whole map is read (one more synchronous read of the file) ONLY when a folder is a candidate for the repair
        const cand = r.dirs.filter((d) => !(d.note === 'true' || noted.has(d.name) || s0.entries[d.name] || r.registered(d)));
        const owners = cand.length && typeof bb0.conversationsByKey === 'function' ? bb0.conversationsByKey() : new Map();
        for (const d of cand) {
          const sid = owners.get(d.name);
          if (!sid) continue;
          const w = await KN.ensureNote(path.join(PROFILE_DIR, d.name), d.name, sid, { timeoutMs: noteWriteMs, now: () => d.mtimeMs || now(), ...(noteFs ? { fsp: noteFs } : {}) });
          if (w && w.ok && w.doc) { noted.set(d.name, { ...w.doc, mtimeMs: d.mtimeMs }); repaired.add(d.name); fromBinding++; } else notWritten++;
        }
        if (notWritten) log.warn?.(`[browser-kept] ${notWritten} key-named folder(s) a binding names could not get their note now — each stays (a binding names it), tried again at the next reconcile`);
      }
      if (!isHeld()) {
        const s = load();
        for (const [k, n] of noted) {
          // r4094 (the ruling): a row the REPAIR makes is last used at the repair — never first in the size bound's line by its folder's old time
          const e = s.entries[k], last = repaired.has(k) ? now() : Math.max(n.firstAt, n.mtimeMs || 0);
          if (!e) { s.entries[k] = K.normalizeEntry(k, { hasDir: true, label: '', startedAt: n.firstAt, stoppedAt: last, lastUsedAt: last, conversationId: n.conversation || null }); setThere(k, true); added++; }
          else if (e.recovered) { e.recovered = null; if (!e.conversationId && n.conversation) e.conversationId = n.conversation; ordinary++; }
        }
        if (added || ordinary) save();
      }
      // r3961 (2): TWO TRUE NOTES THAT NAME ONE CONVERSATION are ordered by ONE stated rule — the bindings' own rebuild's
      // (browser-bindings rebuildBindings: «a conversation keeps its FIRST key»): the earliest first time first, ties by the key's name —
      // so restoreFromNotes binds the same folder whatever the listing's order; the other is an ordinary row with no holder (hold 2)
      const pairs = [];
      for (const [k, n] of noted) if (n.conversation) pairs.push([n.conversation, k, n.firstAt]);
      pairs.sort((a, b) => (a[2] - b[2]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
      let b = { made: 0, movedOn: 0, taken: 0 };
      if (pairs.length) {
        let bb = null; try { bb = bindingsOf(); } catch { bb = null; }
        b = bb && typeof bb.restoreFromNotes === 'function' ? bb.restoreFromNotes(pairs, { at: now(), protect: new Set(pairs.map((x) => x[1])) }) : { unknown: true };   // r3961 (4): stamped NOW, the noted keys never pruned for it
        if (!b || b.unknown) return unfinished(why, 'the bindings could not be read');
      }
      recFacts = { at: now(), noted: new Set(pairs.map((x) => x[1])), trueKeys: new Set(noted.keys()) };
      recState = 'done'; recSaid = false;
      // r4099: a browser handed past the bound stays NOT KEPT while it stands (its card says so): a reconcile that finishes later binds the
      // conversation's OWN folder into its empty place, and the next start finds its own browser
      if (added || ordinary || b.made) changed();   // a broadcast only when a row or a binding moved
      if (added || ordinary || b.made || b.movedOn) log.log?.(`[browser-kept] the kept folders' notes were read (${why}): ${added} row(s) made from their notes${fromBinding ? ` (${fromBinding} of them a folder a binding named, its note written now)` : ''}, ${ordinary} found-again row(s) ordinary now, ${b.made} binding(s) made again into an empty place${b.movedOn ? `; ${b.movedOn} folder(s) whose conversation has moved on to another browser — ordinary rows with no holder, ended by the release's rules` : ''}`);
      return true;
    })().catch((e) => unfinished(why, (e && e.message) || 'failed')).finally(() => { if (recBusy === p) recBusy = null; recFlightEnded = Math.max(recFlightEnded, flight); });
    recBusy = p;
    return p;
  }
  /** r3786 / r3961 / r4094 (hold 3, THE START's ORDER, at every door): asked BEFORE a conversation is handed a browser. ONE BOUND A
   *  FLIGHT: the door waits for the reconcile IN FLIGHT when it arrives (the START's, or one a LIFT or a sweep began) — or, when none is
   *  in the air and the last one did not end done, the one it BEGINS (an unknown is asked again, never the run's last word) — up to the
   *  bound (RECONCILE_WAIT_MS, the reconcile's own) counted from THAT flight's start on the monotonic clock: every door that arrives
   *  during a flight shares its one bound (a start of many conversations pays it once), and a door after a flight that ended unknown
   *  begins a new flight and waits for it → { done, code } (code RECONCILE_CODE: the door goes on and tells by name) */
  function reconciled(ms = RECONCILE_WAIT_MS) {
    if (recState === 'done' && !recBusy) return Promise.resolve({ done: true, code: null });
    const p = recBusy || reconcile(recStart ? 'a start of a conversation\'s browser' : 'start');
    if (!recStart) recStart = p;
    const left = Math.min(ms, RECONCILE_WAIT_MS - (mono() - recBusySince));   // what is left of THIS flight's bound
    if (left <= 0) return Promise.resolve({ done: false, code: RECONCILE_CODE });
    return bounded(p, left, null).then((v) => (v === true ? { done: true, code: null } : { done: false, code: RECONCILE_CODE }));
  }
  /** r3961 / r4094 (hold 3 (b), THE LATE DOOR — synchronous): a live session's first browser use mints its key on the loop (browser-key.js).
   *  It cannot wait, so it REFUSES BY NAME («ask again in a moment») while the flight it waits for is in the air inside its bound, and the
   *  session's re-ask is THE SAME WAIT (`holder`, the session: the flight it was refused for): a flight that ended done ⇒ done; one that
   *  ended unknown ⇒ that wait is over: the door goes on and tells by name (never a refusal for good while every reconcile ends unknown);
   *  no flight in the air and none waited for ⇒ it begins one (the reconcile asked again) and waits for it →
   *  { done } | { done: false, waiting, code } */
  function startOrder(holder = null) {
    const h = holder && typeof holder === 'object' ? holder : null;
    if (recState === 'done' && !recBusy) { if (h) lateAsked.delete(h); return { done: true }; }
    if (!recBusy) {
      const asked = h ? lateAsked.get(h) : undefined;
      if (asked !== undefined && asked <= recFlightEnded) { lateAsked.delete(h); return { done: false, waiting: false, code: RECONCILE_CODE }; }   // its flight ended unknown: its wait is over
      reconciled().catch(() => { });   // the flight this door begins
    }
    const waiting = mono() - recBusySince < RECONCILE_WAIT_MS;   // inside THIS flight's bound
    if (h) { if (!waiting) lateAsked.delete(h); else if (!lateAsked.has(h)) lateAsked.set(h, recFlight); }
    return { done: false, waiting, code: RECONCILE_CODE };
  }
  /**
   * r3786 (hold 5): THE START's GATE — the keeper asks it before a conversation's own browser STARTS on its folder. The folder's note must
   * be there and true (KN.ensureNote: off the loop, whole, 0600, bounded at noteWriteMs; its conversation the one the choke point decided
   * this run, else the one the bindings name, else none yet). → { kept: true } | { kept: false, code } — not kept: the keeper starts the
   * browser WITHOUT its folder; the agent is told in its answer, the person on that conversation's browser card (brief().notKept)
   */
  async function startGate(bk) {
    const k = String(bk || '');
    if (!K.isParentKey(k)) return { kept: true };
    // r4099: a key a door handed PAST its bound is NOT KEPT: no note is written in its folder (nothing names the conversation there), and
    // the keeper starts it without its folder — hold 5's road and words
    if (KN.isNotKept(k)) { const sn0 = startNotes.get(k); setStartNote(k, { code: RECONCILE_CODE, at: now(), said: false, unstarted: !!(sn0 && sn0.unstarted) }); changed(); return { kept: false, code: RECONCILE_CODE }; }
    const conv = KN.conversationDecided(k) || convOf(k) || '';
    const r = await KN.ensureNote(dirOf(k), k, conv, { timeoutMs: noteWriteMs, now, ...(noteFs ? { fsp: noteFs } : {}) });
    if (r.ok) { const sn = startNotes.get(k); if (sn && NOT_KEPT_CODES.includes(sn.code)) { startNotes.delete(k); changed(); } return { kept: true, wrote: !!r.wrote }; }
    setStartNote(k, { code: r.code, at: now(), said: false });
    log.warn?.(`[browser-kept] ${k}: ${r.code} — its folder's note could not be written (${r.why || 'past its bound'}): its browser starts WITHOUT its folder this time (not kept: a sign-in made in it ends with it)`);
    changed();
    return { kept: false, code: r.code };
  }
  /** r4145: the start notes are bounded by the not-kept list's one rule (KN.NOT_KEPT_MAX, the oldest first out) */
  function setStartNote(k, v) { startNotes.delete(k); startNotes.set(k, v); if (startNotes.size > KN.NOT_KEPT_MAX) startNotes.delete(startNotes.keys().next().value); }
  /** r3786: a start's code, told ONCE in the agent's answer (the card keeps saying it while it stands) → the code | null */
  function takeStartNote(bk) { const sn = startNotes.get(String(bk || '')); if (!sn || sn.said) return null; sn.said = true; return sn.code; }
  /** r3786 / r4099 (hold 3): a door that handed a conversation a NEW browser past its reconcile's bound — that browser is NOT KEPT (no note,
   *  no binding: the conversation's place stays empty for its own folder), said by hold 5's words (the agent once, the card while it stands) */
  function noteStartCode(bk, code) {
    const k = String(bk || ''); if (!K.isParentKey(k) || code !== RECONCILE_CODE) return false;
    KN.markNotKept(k);   // the note module's one list (the choke point and the start gate read it)
    setStartNote(k, { code, at: now(), said: false }); changed(); return true;
  }
  /** r4145 (3): the keeper could not start a browser handed past the bound (rung C: its link IS its folder) — the card says what is true:
   *  not started, and not in this run of the conversation (its next resume gets its own) */
  function startRefused(bk) {
    const k = String(bk || ''); if (!K.isParentKey(k) || !KN.isNotKept(k)) return false;
    setStartNote(k, { code: RECONCILE_CODE, at: now(), said: true, unstarted: true }); changed(); return true;
  }
  /** r3786 (LAW 4, the boot sweep's first rule): THE STORE's VERDICT of the list — the keys it names (a row, or a true note read at the
   *  last reconcile); null = UNKNOWN (held, rebuilding, or the reconcile not finished): the boot sweep spares every key-named folder */
  function keyVerdict() {
    load();
    if (!recStart) recStart = reconcile('start');
    if (isHeld() || recState !== 'done' || !recFacts) return null;
    const out = new Set(Object.keys(store.entries));
    for (const k of recFacts.trueKeys) out.add(k);
    return out;
  }
  /** r3786 (LAW 4, the boot sweep's second rule): the keys whose true note names a conversation (null = unknown) */
  const notedKeys = () => (recState === 'done' && recFacts ? new Set(recFacts.noted) : null);
  /** THE REBUILD: every folder data/browser-profiles/<key> whose name is a parent browser key becomes a row — r3786: a folder whose note
   *  is TRUE TO IT an ORDINARY row from its note (its conversation, its first time; a registered profile's folder is never made a row by
   *  a note), and a folder with NO true note a row FOUND AGAIN (`recovered`: its last use the folder's change time; its tabs, its waiting
   *  restore and its label are in the copy kept aside only). Until it lands the list is held (nothing written, nothing ends); one that
   *  does not finish holds it again. */
  function rebuildFromFolders(copy) {
    if (rebuilding && rebuilding.busy) return rebuilding.busy;
    rebuilding = { since: (rebuilding && rebuilding.since) || now(), copy: copy || (rebuilding && rebuilding.copy) || null, busy: null };
    const r0 = rebuilding;
    r0.busy = (async () => {
      const r = await listNotes();   // r3786: the one child — the folders, their notes, the registered folders' identities
      if (!r || !r.ok || r.dirs.some((d) => d.note === 'unreadable')) {
        log.warn?.(`[browser-kept] the kept browsers' folders could not be listed to rebuild ${STORE} (${(r && r.ok ? 'a folder\'s note could not be read' : (r && r.why)) || 'failed'}) — the list stays HELD: nothing is written and no kept browser is removed; it is tried again at the list's next read`);
        rebuilding = null;
        hold.start({ state: 'unreadable', error: { code: 'rebuild-unfinished' } });   // HELD again by the helper: its ladder reads the file again (the same torn bytes lift once more → rebuilt then)
        return false;
      }
      const at = now(), entries = {};
      for (const d of r.dirs) {
        const name = d.name;
        if (!K.isParentKey(name)) continue;
        // r3786 (hold 1): a TRUE note makes an ordinary row — never for a registered profile's folder (the registered rule wins)
        if (d.note === 'true') { if (r.registered(d)) continue; const last = Math.max(d.doc.firstAt, d.mtimeMs || 0); entries[name] = { hasDir: true, label: '', startedAt: d.doc.firstAt, stoppedAt: last, lastUsedAt: last, conversationId: d.doc.conversation || null }; continue; }
        // r3717 (ruling 4), for a folder with NO true note: a folder a registered profile adopted in place becomes a found-again row: it never
        // ends and is never removed by the bound (src/browser-kept.js keptEndVerdict and keptRetentionPlan, the recovered guards), its caches
        // are not trimmed, and Forget leaves a registered folder in place (removeEntry)
        const t = d.mtimeMs || at;
        entries[name] = { hasDir: true, label: '', startedAt: t, stoppedAt: t, lastUsedAt: t, recovered: at };
      }
      const noted = store ? store.entries : {};
      store = K.normalizeKeptStore({ entries });
      const n = Object.keys(store.entries).length, nFound = Object.values(store.entries).filter((e) => e.recovered).length;
      for (const [k, e] of Object.entries(noted)) store.entries[k] = e;   // a row noted while it was rebuilt is a true fact: it wins
      for (const k of Object.keys(entries)) setThere(k, true);
      recovered = { n, found: nFound, copy: r0.copy ? path.basename(String(r0.copy)) : null, at };
      rebuilding = null;
      log.warn?.(`[browser-kept] ${STORE}, the list of kept browsers, was rebuilt from their folders: ${n} row(s) — ${n - nFound} from their notes, ${nFound} found again (no note)${recovered.copy ? ` — the damaged copy is kept as ${recovered.copy}` : ''}`);
      save(); changed(); recheckAll().catch(() => {});
      return true;
    })().finally(() => { if (r0) r0.busy = null; });
    return r0.busy;
  }
  /** the panel's and the view's facts while held: { file, code, since } (null: it reads); the words a person reads */
  const heldFacts = () => { load(); const h = hold.held(); return h ? { file: h.file, code: h.code, since: h.since } : rebuilding ? { file: path.basename(file), code: 'rebuilding', since: rebuilding.since } : null; };
  const heldWords = () => { load(); return hold.words() || (rebuilding ? 'VibeSpace is finding its kept browsers again from their folders — none is removed meanwhile' : null); };
  /** this run's rebuild: { n, copy, at } — a count and the copy's base name only (never a key, a folder or a conversation) */
  const recoveredFacts = () => (recovered ? { ...recovered } : null);
  /** r3585: the bindings' hold (memory only, no read of the file) and their rebuild's count — for the panel */
  const bindingsHeld = () => { try { const bb = bindingsOf(); return typeof bb.heldFacts === 'function' ? bb.heldFacts() : null; } catch { return null; } };
  const bindingsRecovered = () => { try { const bb = bindingsOf(); return typeof bb.recoveredFacts === 'function' ? bb.recoveredFacts() : null; } catch { return null; } };
  return { noteStart, noteTabs, noteStop, noteDeliberate, latestOf, has, keys, get, brief, list, limits, forget, adopted, sweep, checkThere /* B-7a30 r2: the acts' door */, recheckAll /* B-7a30 r2: the tick's pass */, boot, shutdown, dirOf, file, lastSweep: () => lastSweep, _load: load, _measure: measure,
    heldFacts, heldWords, recoveredFacts, bindingsHeld, bindingsRecovered, _hold: hold, _rebuild: rebuildFromFolders,   // r3585
    reconcile, reconciled, startOrder, startGate, takeStartNote, noteStartCode, startRefused, keyVerdict, notedKeys, _reconcileState: () => recState,   // r3786 / r3961
    setRestore, consumeRestore, afterReopen }; // lane B
}

module.exports = { create, SWEEP_EVERY_MS, PERSIST_TABS_MS, writeJsonAtomic, KEPT_SHAPE };

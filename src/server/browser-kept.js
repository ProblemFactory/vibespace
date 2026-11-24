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
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const K = require('../browser-kept.js');
const SR = require('../store-read.js');
const HOLD = require('../store-read-hold.js');   // r3585 (B-f276 family's leftover): the list under the store-read law

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
/** r3585: the kept folders are listed for a rebuild by a CHILD with a bound — never on the hub's loop (a hung disk ends with the child) */
const LIST_TIMEOUT_MS = 30 * 1000;
const LIST_SRC = "const fs=require('fs'),p=require('path');const d=process.argv[1];let n=[];try{n=fs.readdirSync(d)}catch(e){if(e&&e.code==='ENOENT'){process.stdout.write('[]');process.exit(0)}process.stderr.write(String((e&&e.code)||'unreadable'));process.exit(3)}const o=[];for(const x of n){try{const s=fs.lstatSync(p.join(d,x));if(s.isDirectory())o.push([x,s.mtimeMs])}catch(e){}}process.stdout.write(JSON.stringify(o))";

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
 *   bindings        — the durable conversation → key store (browser-bindings; built here over dataDir when absent)
 *   serverSetting / broadcast / log / now / execFileImpl / sweepEveryMs — injectable for the gate
 *   endsAtTerminate — D1's flag (default false: a Terminate is not an end)
 */
function create({ dataDir, keeper = null, liveKeys = () => new Set(), bindings = null, serverSetting = () => undefined, broadcast = null, log = console, now = Date.now,
  execFileImpl = execFile, sweepEveryMs = SWEEP_EVERY_MS, endsAtTerminate = false, graceMs = K.KEPT_END_GRACE_MS,
  // B-7a30: the folder check (injectable: the gate PLACES a stall in it) and the acts' bound / the tick's period
  checkDir = null, thereActMs = THERE_ACT_MS, thereEveryMs = THERE_FRESH_MS,
  // lane B: the browser FACT carries what is kept (the live view's Resume) — a change here re-computes the facts (debounced)
  onChange = null,
  // B-50e7 (r3747 must 1): the settings HELD? (the hub's persistence router — the door the keeper has): while held the retention
  // sweep reads no limit (its total would be the default's, never the person's) and removes nothing
  settingsHeld = () => null,
  // r3585: the kept folders' listing for a rebuild (injectable: the gate stands one in) → Promise<{ ok, dirs: [[name, mtimeMs]] } | { ok: false, why }>
  listFolders = null } = {}) {
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
  function brief(bk) { const e = judged(load().entries[String(bk || '')]); return e ? { tabs: e.tabs.length, kind: K.keptKindOf(e), fenced: e.fenced, stoppedAt: e.stoppedAt, stoppedWhy: e.stoppedWhy, restore: !!e.restore, restoreBy: e.restore ? e.restore.by : null, handedBack: !!(e.restore && e.restore.handedBack), waiting: e.waiting ? e.waiting.tabs.length : 0 } : null; }
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
  async function removeEntry(bk, why, { unlessCarried = false } = {}) {
    const s = load(); const e = s.entries[bk];
    if (!e) return { removed: false, why: 'not kept' };
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
    const r = await removeEntry(key, why);
    if (!r.removed) throw namedError(/runs|started/.test(r.why) ? 'kept_live' : 'forget_failed', `the browser was not forgotten: ${r.why}`);
    return { ok: true, browserKey: key, dirGone: !!r.dirGone, dirKept: r.dirKept || null };
  }
  /** An adopt MOVED the directory into a named profile: the entry ends (the directory is the profile's now). */
  function adopted(bk) {
    const s = load(); if (!s.entries[bk]) return false;
    delete s.entries[bk]; latest.delete(bk); deliberate.delete(bk); there.delete(String(bk)); told.delete(String(bk)); // B-7a30 r2: the bit goes with its entry
    save(); changed();
    log.log?.(`[browser-kept] ${bk}: its directory became a named profile (adopted) — no longer kept here`);
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
  const exists = async (p) => { try { await fs.promises.lstat(p); return true; } catch { return false; } };
  /** Measure every kept directory: `{bk: {bytes, cacheBytes, caches:[path]}}` (a missing directory = 0 / its entry
   *  keeps tabs only). */
  async function measure(entries) {
    const want = [], cachesOf = new Map();
    for (const e of entries) {
      if (!e.hasDir) continue;
      const d = dirOf(e.browserKey);
      if (!(await exists(d))) continue;
      want.push(d);
      const cs = [];
      for (const rel of K.CACHE_SUBDIRS) { const c = path.join(d, rel); if (await exists(c)) cs.push(c); }
      cachesOf.set(e.browserKey, cs); want.push(...cs);
    }
    const sizes = await duBatch(want);
    const out = {};
    for (const e of entries) {
      if (!e.hasDir) { out[e.browserKey] = { bytes: 0, cacheBytes: 0, caches: [] }; continue; }
      const d = dirOf(e.browserKey);
      const cs = cachesOf.get(e.browserKey);
      if (!cs) { out[e.browserKey] = { bytes: 0, cacheBytes: 0, caches: [] }; continue; }
      const b = sizes[d];
      out[e.browserKey] = { bytes: Number.isFinite(b) ? b : null, cacheBytes: cs.reduce((n, c) => n + (Number.isFinite(sizes[c]) ? sizes[c] : 0), 0), caches: cs };
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
      const liveNow = new Map(entries.map((e) => [e.browserKey, liveOf(e.browserKey)]));
      // carried = a live session carries the key (its conversation runs): read AFTER the measure's await, fail closed
      let carriedSet = null; try { const v = liveKeys(); carriedSet = v instanceof Set ? v : new Set(v || []); } catch (e) { log.warn?.(`[browser-kept] the live sessions could not be listed (${e && e.message}) — no kept browser is removed by the bound this pass`); carriedSet = null; }
      const carriedAt = new Map(entries.map((e) => [e.browserKey, carriedSet ? carriedSet.has(e.browserKey) : true]));
      const plan = K.keptRetentionPlan({ entries: entries.map((e) => ({ key: e.browserKey, bytes: sizes[e.browserKey] ? sizes[e.browserKey].bytes : null, cacheBytes: sizes[e.browserKey] ? sizes[e.browserKey].cacheBytes : 0, lastUsedAt: e.lastUsedAt, live: liveNow.get(e.browserKey), carried: carriedAt.get(e.browserKey) })), perConversation: lim.perConversation, total: lim.total });
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
      for (const [k, v] of Object.entries(sizes)) { const e = s2.entries[k]; if (e) { e.bytes = v.bytes; e.cacheBytes = v.cacheBytes; e.bytesAt = now(); } }
      save(); changed();
      lastSweep = { at: now(), ms: now() - t0, ended: ended.length, trimmed: trimmed.length, trimmedBytes: trimmed.reduce((n, x) => n + x.frees, 0), removed: removed.length, removedBytes: removed.reduce((n, x) => n + x.frees, 0), used: plan.used, limit: plan.limit, reported: plan.kept.map((x) => ({ key: x.key, overBy: x.overBy, why: x.why })), unmeasured: plan.unmeasured.length };
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
    const first = sweep().catch((e) => { log.warn?.(`[browser-kept] boot sweep failed: ${e && e.message}`); return null; });
    if (!sweepTimer && sweepEveryMs > 0) { sweepTimer = setInterval(() => { sweep().catch((e) => log.warn?.(`[browser-kept] sweep failed: ${e && e.message}`)); }, sweepEveryMs); if (sweepTimer.unref) sweepTimer.unref(); }
    // B-7a30: every kept folder's presence checked at once (off the loop; the views say «checking…» until it lands), then on its tick
    recheckAll().catch(() => {});
    if (!thereTimer && thereEveryMs > 0) { thereTimer = setInterval(() => { recheckAll().catch(() => {}); }, thereEveryMs); if (thereTimer.unref) thereTimer.unref(); }
    return first;
  }
  /** SIGINT / SIGTERM: a throttled tab list is written now (the crash path this feature exists for). */
  function shutdown() {
    if (sweepTimer) clearInterval(sweepTimer); sweepTimer = null;
    if (thereTimer) clearInterval(thereTimer); thereTimer = null;
    if (bcTimer) { clearTimeout(bcTimer); bcTimer = null; }
    if (flushTimer) save();
  }

  // ── r3585: the lift, the rebuild from the folders, the facts the panel and the notice read ──
  /** LIFTED (the helper's read again answered). A list: loaded, with what this run noted while held laid over it (a row noted then is a
   *  true fact of a browser that ran meanwhile — newer than the file's). NO list: the rows are rebuilt from the kept folders. */
  function lifted(v, facts) {
    if (!v) { rebuildFromFolders((facts && facts.setAside) || null); return; }
    const noted = store ? store.entries : {};
    store = K.normalizeKeptStore(v);
    let laid = 0;
    for (const [k, e] of Object.entries(noted)) if (!store.entries[k] || (Number(e.lastUsedAt) || 0) > (Number(store.entries[k].lastUsedAt) || 0)) { store.entries[k] = e; laid++; }
    if (laid) save();
    changed(); recheckAll().catch(() => {});
  }
  /** the kept folders listed by a CHILD with a bound (never the hub's loop) → { ok, dirs } | { ok: false, why } */
  function listDirs() {
    if (typeof listFolders === 'function') { try { return Promise.resolve(listFolders(PROFILE_DIR)).catch((e) => ({ ok: false, why: String((e && e.code) || 'failed') })); } catch (e) { return Promise.resolve({ ok: false, why: String((e && e.code) || 'failed') }); } }
    return new Promise((resolve) => {
      try {
        execFileImpl(process.execPath, ['-e', LIST_SRC, PROFILE_DIR], { timeout: LIST_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
          if (err) return resolve({ ok: false, why: err.killed ? 'the listing passed its bound' : String(err.code || 'failed') });
          try { const a = JSON.parse(String(stdout || '[]')); resolve(Array.isArray(a) ? { ok: true, dirs: a } : { ok: false, why: 'no listing' }); } catch { resolve({ ok: false, why: 'no listing' }); }
        });
      } catch (e) { resolve({ ok: false, why: String((e && e.code) || 'spawn failed') }); }
    });
  }
  /** THE REBUILD: every folder data/browser-profiles/<key> whose name is a parent browser key and that no registered profile names
   *  becomes a row FOUND AGAIN (`recovered`: its last use the folder's change time; its tabs, its waiting restore and its label are in the
   *  copy kept aside only). Until it lands the list is held (nothing written, nothing ends); one that does not finish holds it again. */
  function rebuildFromFolders(copy) {
    if (rebuilding && rebuilding.busy) return rebuilding.busy;
    rebuilding = { since: (rebuilding && rebuilding.since) || now(), copy: copy || (rebuilding && rebuilding.copy) || null, busy: null };
    const r0 = rebuilding;
    r0.busy = (async () => {
      const r = await listDirs();
      if (!r || !r.ok) {
        log.warn?.(`[browser-kept] the kept browsers' folders could not be listed to rebuild ${STORE} (${(r && r.why) || 'failed'}) — the list stays HELD: nothing is written and no kept browser is removed; it is tried again at the list's next read`);
        rebuilding = null;
        hold.start({ state: 'unreadable', error: { code: 'rebuild-unfinished' } });   // HELD again by the helper: its ladder reads the file again (the same torn bytes lift once more → rebuilt then)
        return false;
      }
      const at = now(), entries = {};
      for (const row of r.dirs) {
        const name = Array.isArray(row) ? String(row[0] || '') : '';
        if (!K.isParentKey(name)) continue;
        // a folder a REGISTERED profile names is that profile's (adopted in place): left out only when the keeper ANSWERS so — an unknown
        // keeper (not built yet, held) leaves it a row: a found-again row is removed only by a Forget, which refuses a registered folder
        { const kk = kp(); let reg = false; if (kk && typeof kk.profileDirRegistered === 'function' && !(typeof kk.held === 'function' && kk.held())) { try { reg = !!kk.profileDirRegistered(dirOf(name)); } catch { reg = false; } } if (reg) continue; }
        const t = Math.round(Number(row[1])) || at;
        entries[name] = { hasDir: true, label: '', startedAt: t, stoppedAt: t, lastUsedAt: t, recovered: at };
      }
      const noted = store ? store.entries : {};
      store = K.normalizeKeptStore({ entries });
      const n = Object.keys(store.entries).length;
      for (const [k, e] of Object.entries(noted)) store.entries[k] = e;   // a row noted while it was rebuilt is a true fact: it wins
      for (const k of Object.keys(entries)) setThere(k, true);
      recovered = { n, copy: r0.copy ? path.basename(String(r0.copy)) : null, at };
      rebuilding = null;
      log.warn?.(`[browser-kept] ${STORE}, the list of kept browsers, was rebuilt from their folders: ${n} found again${recovered.copy ? ` — the damaged copy is kept as ${recovered.copy}` : ''}`);
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
  return { noteStart, noteTabs, noteStop, noteDeliberate, latestOf, has, keys, get, brief, list, limits, forget, adopted, sweep, checkThere /* B-7a30 r2: the acts' door */, recheckAll /* B-7a30 r2: the tick's pass */, boot, shutdown, dirOf, file, lastSweep: () => lastSweep, _load: load, _measure: measure,
    heldFacts, heldWords, recoveredFacts, _hold: hold, _rebuild: rebuildFromFolders,   // r3585
    setRestore, consumeRestore, afterReopen }; // lane B
}

module.exports = { create, SWEEP_EVERY_MS, PERSIST_TABS_MS, writeJsonAtomic };

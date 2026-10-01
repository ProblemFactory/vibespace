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

const FILE_MODE = 0o600;
const SWEEP_EVERY_MS = 60 * 60 * 1000;
const PERSIST_TABS_MS = 30 * 1000;
const DU_TIMEOUT_MS = 120 * 1000;
const BROADCAST_DEBOUNCE_MS = 250;

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
  // lane B: the browser FACT carries what is kept (the live view's Resume) — a change here re-computes the facts (debounced)
  onChange = null } = {}) {
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
  const latest = new Map();        // bk → { tabs: [{targetId, url, title, active, type}], at, source } — the live list
  const deliberate = new Map();    // bk → { why: 'user'|'agent', at } — a stop the user / the agent asked for
  let flushTimer = null, bcTimer = null, sweepTimer = null, sweeping = null, lastSweep = null;

  function load() {
    if (store) return store;
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) {
      if (e && e.code !== 'ENOENT') {
        // an unreadable store is SET ASIDE with its bytes (the channel-store rule), never silently replaced — and until
        // the first write, browser-env reads the unreadable file and spares every key-named directory (fail closed)
        const aside = `${file}.corrupt-${now()}`;
        try { fs.renameSync(file, aside); log.warn?.(`[browser-kept] ${file} could not be read (${e.message}) — set aside as ${path.basename(aside)}; starting from an empty store (no directory is removed for it)`); }
        catch (e2) { log.warn?.(`[browser-kept] ${file} could not be read (${e.message}) and could not be set aside (${e2.message})`); }
      }
    }
    store = K.normalizeKeptStore(raw);
    return store;
  }
  function save() {
    if (!store) return;
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
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
    // lane B (D2): the STOPPED browser's kept tabs are moved aside as `waiting` — the live list starts empty (a fresh
    // browser's about:blank must never overwrite them); a reopen consumes them (`afterReopen`), `vibespace-browser
    // resume` / the user's Resume reopen them later, the next stop keeps them when the run opened nothing
    const wasStopped = !!(prev && prev.stoppedAt != null);
    const waiting = wasStopped ? (prev.tabs.length ? { tabs: prev.tabs, stoppedWhy: prev.stoppedWhy, stoppedAt: prev.stoppedAt } : null) : (prev ? prev.waiting : null);
    if (wasStopped) latest.delete(bk);
    s.entries[bk] = K.normalizeEntry(bk, { ...(prev || {}), hasDir, fenced, label: label || (prev && prev.label) || '', sessionId: sessionId || (prev && prev.sessionId) || null,
      conversationId: convOf(bk) || (prev && prev.conversationId) || null, tabs: wasStopped ? [] : (prev ? prev.tabs : []), waiting, startedAt: t, stoppedAt: null, stoppedWhy: null, lastUsedAt: t });
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
  /** verify r2 (Y1c): the directory's EXISTENCE is read off the disk at every read — an entry that says `hasDir` over a
   *  directory that is gone (removed out of band) answers tabs-only (its words: "not its logins"), so no surface says
   *  "its logins are kept" over nothing and a Resume never answers "resumed" as if they were. Said once per key. */
  const saidGone = new Set();
  const dirThere = (bk) => { try { return fs.statSync(dirOf(bk)).isDirectory(); } catch { return false; } };
  function judged(e) {
    if (!e || !e.hasDir) return e;
    if (dirThere(e.browserKey)) { saidGone.delete(e.browserKey); return e; }
    if (!saidGone.has(e.browserKey)) { saidGone.add(e.browserKey); log.log?.(`[browser-kept] ${e.browserKey} "${e.label}": its entry says its logins are kept, but ${dirOf(e.browserKey)} is gone — read as tabs only (${e.tabs.length} tab(s)); its next start makes a fresh directory`); }
    return { ...e, hasDir: false };
  }
  function get(bk) { const e = judged(load().entries[String(bk || '')]); return e ? { ...e, dir: e.hasDir ? dirOf(e.browserKey) : null, kind: K.keptKindOf(e) } : null; }
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
      browserKey: e.browserKey, label: e.label, kind: K.keptKindOf(e), hasDir: e.hasDir, fenced: e.fenced, tabs: e.tabs.map((t) => ({ ...t })), tabsAt: e.tabsAt,
      startedAt: e.startedAt, stoppedAt: e.stoppedAt, stoppedWhy: e.stoppedWhy, restore: e.restore ? { mode: e.restore.mode, by: e.restore.by, at: e.restore.at } : null, waiting: e.waiting ? e.waiting.tabs.length : 0,
      lastUsedAt: e.lastUsedAt, bytes: e.bytes, cacheBytes: e.cacheBytes, bytesAt: e.bytesAt, trimmedAt: e.trimmedAt,
      live: liveOf(e.browserKey), carried: carried.has(e.browserKey), sessionId: e.sessionId,
    }));
  }
  const limits = () => K.keptLimits(setting);

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
    delete s.entries[bk];
    latest.delete(bk); deliberate.delete(bk);
    save(); changed();
    log.log?.(`[browser-kept] ${bk} "${e.label}": removed (${why})${dirGone ? ` — ${d} deleted` : ''}${dirKept ? ` — its directory: ${dirKept}` : ''}`);
    return { removed: true, dirGone, dirKept };
  }
  /** The user's Forget (the panel row). Refused by name while the browser runs; a missing entry ⇒ not_kept. */
  async function forget(bk, why = 'forgotten by the user') {
    const key = String(bk || '');
    if (!K.isParentKey(key) || !load().entries[key]) throw namedError('not_kept', 'nothing is kept for that browser');
    if (liveOf(key)) throw namedError('kept_live', 'this browser is running — stop it first, then forget it');
    const r = await removeEntry(key, why);
    if (!r.removed) throw namedError(/runs|started/.test(r.why) ? 'kept_live' : 'forget_failed', `the browser was not forgotten: ${r.why}`);
    return { ok: true, browserKey: key, dirGone: !!r.dirGone, dirKept: r.dirKept || null };
  }
  /** An adopt MOVED the directory into a named profile: the entry ends (the directory is the profile's now). */
  function adopted(bk) {
    const s = load(); if (!s.entries[bk]) return false;
    delete s.entries[bk]; latest.delete(bk); deliberate.delete(bk);
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
    sweeping = (async () => {
      const t0 = now();
      const s = load();
      let carried = new Set(); try { const v = liveKeys(); carried = v instanceof Set ? v : new Set(v || []); } catch (e) { log.warn?.(`[browser-kept] the live sessions could not be listed (${e && e.message}) — nothing ends this pass`); carried = null; }
      let bound = null; try { bound = bindingsOf().keys(); } catch (e) { log.warn?.(`[browser-kept] the bindings could not be read (${e && e.message}) — nothing ends this pass`); bound = null; }
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
    return first;
  }
  /** SIGINT / SIGTERM: a throttled tab list is written now (the crash path this feature exists for). */
  function shutdown() {
    if (sweepTimer) clearInterval(sweepTimer); sweepTimer = null;
    if (bcTimer) { clearTimeout(bcTimer); bcTimer = null; }
    if (flushTimer) save();
  }

  return { noteStart, noteTabs, noteStop, noteDeliberate, latestOf, has, keys, get, brief, list, limits, forget, adopted, sweep, boot, shutdown, dirOf, file, lastSweep: () => lastSweep, _load: load, _measure: measure,
    setRestore, consumeRestore, afterReopen }; // lane B
}

module.exports = { create, SWEEP_EVERY_MS, PERSIST_TABS_MS, writeJsonAtomic };

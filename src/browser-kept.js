'use strict';
/**
 * THE CONVERSATION'S KEPT BROWSER — PURE (lane browser-resume, the owner's ruling 1, 2026-09-30: "state survives the
 * process"; docs/design-agent-browser-v2.zh.md §3.9). Imports only src/channel-record.js (the ONE door for a string a
 * page chose: `peerText` / `peerName`).
 *
 * WHAT IS KEPT. A conversation's own managed browser (rung D / C — the ephemeral record, never a named profile: those
 * persist by being profiles) now runs on a directory NAMED BY ITS BROWSER KEY, `data/browser-profiles/<bk>` (0700,
 * browser-env's `scratchDirFor`, the rung-C name used on rung D too). When that browser closes — the release after the
 * turn, the daemon's idle-out, a heal, a restart, the user's Stop, the agent's own `close` — the DIRECTORY (cookies,
 * localStorage: the logins) and the LIST OF ITS TABS (url + title + which one was current) stay, until the conversation
 * ENDS or a size bound is reached. No process is ever kept alive to preserve anything: the state is captured at the
 * stop and given back at the next start.
 *
 *   · A FENCED conversation (`allowedDomains` in the effective config) keeps its TABS only: the CLI refuses a profile
 *     beside a fence (measured, EPHEMERAL_DENY in browser-profiles) — `hasDir: false, fenced: true`, said by name.
 *   · Rung N (the names alone — no config of ours) and a conversation that started while the setting was off keep their
 *     tabs only too (`hasDir: false, fenced: false`).
 *   · A HELPER's browser (a child key) is never kept (D6): helpers are throw-away by design.
 *
 * THE STORE (`data/browser-kept.json`, 0600 — a url or a title can carry a secret) is keyed by the PARENT browser key.
 * The directory is NEVER read from the file: it is derived from the key (`data/browser-profiles/<bk>`) where it is used,
 * so a hand-edited store can never point a removal at another path. Every string is judged on the way in AND on the way
 * out (`normalizeKeptStore` re-runs the same doors).
 *
 * WHEN DOES IT END (D1, flippable in ONE place — `keptEndVerdict`'s `endsAtTerminate`): a Terminate is NOT an end — the
 * kept state is keyed by the conversation's browser key, which survives Terminate → Resume by design (browser-bindings,
 * `priorKeyFor` rung 1). The end is (a) the user's Forget, (b) the conversation can never come back to its key (no live
 * session carries it and the durable binding no longer names it — pruned past MAX_BINDINGS, or never written; after a
 * one-hour grace), (c) the size bound, oldest first, (d) an adopt that MOVED the directory into a named profile.
 *
 * WHICH RESTARTS REOPEN THE TABS BY THEMSELVES (D2, `restoreKindFor`): an AUTOMATIC stop (the turn-idle release, the
 * daemon's idle-out, a heal, a VibeSpace restart, the conversation's session going away) ⇒ `restore: {mode:'auto'}` —
 * the agent's next start reopens them; a DELIBERATE one (the user's Stop / Quit, the agent's own `close` / `detach`) ⇒
 * the logins are kept, the tabs are not reopened by themselves (the user's Resume does that).
 *
 * THE BOUND (`keptRetentionPlan`, the action trace's style — by SIZE, never by a short timer): per conversation over its
 * bound ⇒ its CACHES first (`CACHE_SUBDIRS`: never Cookies / Local Storage / IndexedDB / Login Data — `NEVER_TRIMMED`),
 * its logins never; all kept browsers over the total ⇒ whole entries, the LEAST RECENTLY USED first. A browser that is
 * RUNNING is never trimmed or removed (keepers report, never kill a used session) — it is reported in `kept[]`; nor is
 * the kept browser of a conversation that is RUNNING (a live session carries its key) removed whole (verify F2).
 */
const CR = require('./channel-record.js');

const KEPT_VERSION = 1;
const KEPT_FILE = 'browser-kept.json';
const KEPT_TABS_MAX = 20;
const KEPT_TITLE_MAX = 200;
const KEPT_URL_MAX = 2048;
const KEPT_LABEL_MAX = 120;
// settings (src/lib/settings-schema.js, the Agent browser category) — read server-side through serverSetting only
const KEEP_SETTING = 'browser.keepConversationBrowser';
const PER_CONVERSATION_SETTING = 'browser.keptBytesPerConversation';
const TOTAL_SETTING = 'browser.keptBytesTotal';
const KEPT_PER_DEFAULT_MB = 512, KEPT_PER_FLOOR_MB = 64;
const KEPT_TOTAL_DEFAULT_MB = 4096, KEPT_TOTAL_FLOOR_MB = 256;
const MB = 1024 * 1024;
/** (b)'s grace: a key no binding names is ended only this long after its browser stopped (a binding written late —
 *  the conversation id arrives with the CLI's init frame — is never raced). The browser-env sweep's own floor. */
const KEPT_END_GRACE_MS = 60 * 60 * 1000;
/** The agent's own `close` is heard through its audit line, which may land a moment after the tick already recorded
 *  the daemon gone ("idle"): a deliberate close within this window re-words that stop (`amendStop`). */
const DELIBERATE_WINDOW_MS = 2 * 60 * 1000;

/** The mirror of browser-profiles' BROWSER_KEY_RE / CHILD_KEY_RE (this module imports neither; the suite pins that the
 *  two spellings agree). */
const KEY_RE = /^bk-[0-9a-f]{8}$/;
const CHILD_RE = /^bk-[0-9a-f]{8}\.\d{1,4}$/;
const isParentKey = (k) => KEY_RE.test(String(k || ''));
const RESTORE_ID_RE = /^bres-[0-9a-f]{8,16}$/;

/** The closed vocabulary of why a kept browser stopped. */
const STOP_WHYS = Object.freeze(['turn-idle', 'idle', 'heal', 'restart', 'conversation-gone', 'user', 'agent']);
/** D2: the automatic stops — their next start reopens the kept tabs by itself. */
const AUTO_RESTORE_WHYS = Object.freeze(['turn-idle', 'idle', 'heal', 'restart', 'conversation-gone']);
/** The keeper's own `why` strings (its stop() allow-list + the idle-out) → the closed vocabulary. An unknown why is the
 *  keeper's own act (a heal, a failed launch) — AUTOMATIC, never the user's. */
function stopWhyOf(raw) {
  const s = String(raw == null ? '' : raw);
  if (STOP_WHYS.includes(s)) return s;
  if (s === 'conversation gone') return 'conversation-gone';
  if (s === 'switch') return 'user';
  return 'heal';
}
/** D2: 'auto' (the next start reopens the tabs) | null (kept, reopened only by a Resume). */
function restoreKindFor(why) { return AUTO_RESTORE_WHYS.includes(stopWhyOf(why)) ? 'auto' : null; }

/** A kept url: http(s) only (a browser page, a file, a data: blob are never reopened), user:password stripped, bounded;
 *  anything else ⇒ null (NOT kept). */
function keptUrl(u) {
  if (typeof u !== 'string' || !u || u.length > KEPT_URL_MAX * 4) return null;
  let x; try { x = new URL(u); } catch { return null; }
  if (x.protocol !== 'http:' && x.protocol !== 'https:') return null;
  x.username = ''; x.password = '';
  const s = x.href;
  if (s.length > KEPT_URL_MAX) return null;
  return CR.peerText(s, KEPT_URL_MAX);
}
/** A kept title: a page chose it ⇒ the name door (bounded, bidi / invisibles gone, frames inert). */
function keptTitle(t) { return CR.peerName(typeof t === 'string' ? t : '', KEPT_TITLE_MAX) || ''; }
/** The session name a kept row is labelled with (the record's `(ephemeral) <name>` without its prefix). */
function keptLabel(l) { return CR.peerName(String(l == null ? '' : l).replace(/^\(ephemeral\)\s*/, ''), KEPT_LABEL_MAX) || ''; }

/**
 * The tab list worth keeping, from a daemon `tabs` record (`[{tabId, targetId, title, url, active}]`) or CDP page
 * targets: web pages only, in order, at most `max`, one current tab at most (the first marked). → `[{url, title,
 * active}]` — nothing else survives (no targetId, no tab id: they die with the browser).
 */
function keptTabsOf(tabs, { max = KEPT_TABS_MAX } = {}) {
  const out = [];
  for (const t of Array.isArray(tabs) ? tabs : []) {
    if (!t || typeof t !== 'object') continue;
    if (t.type && t.type !== 'page') continue;
    const url = keptUrl(t.url);
    if (!url || out.length >= max) continue;
    out.push({ url, title: keptTitle(t.title), active: t.active === true });
  }
  let seen = false;
  for (const t of out) { if (t.active && !seen) seen = true; else t.active = false; }
  return out;
}
/** The index of the current tab (-1 when there are none; the first when none is marked). */
function currentIndexOf(tabs) { const a = Array.isArray(tabs) ? tabs : []; if (!a.length) return -1; const i = a.findIndex((t) => t && t.active); return i < 0 ? 0 : i; }

/**
 * The live list at a stop, from the two readings a keeper has: the last `tabs` record the relay mirrored (ordered like
 * the daemon's own `tab list`, carrying which tab was on show) and a CDP `Target.getTargets` read made at the stop (the
 * pages that exist NOW, with their titles). CDP decides WHICH pages (a tab closed since the relay's list is gone, a new
 * one is there); the relay decides their ORDER and the current one; a page the relay never listed goes last. No CDP
 * reading ⇒ the relay's list as it was.
 */
function mergeTabs(relayTabs, cdpTargets) {
  const relay = Array.isArray(relayTabs) ? relayTabs.filter((t) => t && typeof t === 'object') : [];
  if (!Array.isArray(cdpTargets)) return relay.map((t) => ({ ...t }));
  const pages = cdpTargets.filter((t) => t && typeof t === 'object' && (!t.type || t.type === 'page'));
  const idx = new Map(relay.map((t, i) => [String(t.targetId || ''), i]));
  const act = relay.find((t) => t.active && t.targetId);
  const known = pages.filter((p) => idx.has(String(p.targetId || ''))).sort((a, b) => idx.get(String(a.targetId)) - idx.get(String(b.targetId)));
  const fresh = pages.filter((p) => !idx.has(String(p.targetId || '')));
  const rows = [...known, ...fresh].map((p) => {
    const r = relay[idx.get(String(p.targetId || ''))] || null;
    return { targetId: String(p.targetId || ''), url: typeof p.url === 'string' && p.url ? p.url : (r ? r.url : ''), title: typeof p.title === 'string' && p.title ? p.title : (r ? r.title : ''), active: !!(act && String(act.targetId) === String(p.targetId)) };
  });
  if (rows.length && !rows.some((r) => r.active)) rows[0].active = true;
  return rows;
}

/** 'full' (logins + tabs) · 'fenced' (tabs only: a fence refuses a profile) · 'tabs-only' (rung N / the setting was off). */
function keptKindOf(entry) { return entry && entry.hasDir ? 'full' : (entry && entry.fenced ? 'fenced' : 'tabs-only'); }

const num0 = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const numOrNull = (v) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
function normalizeRestore(r) {
  if (!r || typeof r !== 'object') return null;
  const mode = r.mode === 'auto' || r.mode === 'user' ? r.mode : null;
  if (!mode) return null;
  const out = { mode, by: r.by === 'user' ? 'user' : 'auto', at: num0(r.at), id: RESTORE_ID_RE.test(String(r.id || '')) ? String(r.id) : null };
  // a restore the USER wrote (Resume / hand back, lane B) carries the list he left; the automatic one reads the entry's
  if (Array.isArray(r.tabs)) { out.tabs = keptTabsOf(r.tabs); out.currentIndex = currentIndexOf(out.tabs); }
  if (typeof r.note === 'string' && r.note) { const n = continueNote(r.note); if (n) out.note = n; }
  // lane B: `handedBack` = the user's "Hand back and continue" (a stash entry carries the words); absent = a plain Resume
  if (r.handedBack === true) { out.handedBack = true; if (r.drove === true) out.drove = true; } // verify r2: whether a takeover ended with it (the resolve note's words)
  return out;
}
/** lane B: the tabs a conversation's STOPPED browser had, moved aside when its next start did not reopen them (a
 *  deliberate stop, D2) \u2014 kept until the agent's `vibespace-browser resume`, the user's Resume, or the next stop. */
function normalizeWaiting(w) {
  if (!w || typeof w !== 'object') return null;
  const tabs = keptTabsOf(w.tabs);
  if (!tabs.length) return null;
  return { tabs, stoppedWhy: STOP_WHYS.includes(w.stoppedWhy) ? w.stoppedWhy : null, stoppedAt: numOrNull(w.stoppedAt) };
}
/** One entry, judged: every string through its door, every number a number, the directory NEVER carried (derived). */
function normalizeEntry(key, e) {
  const src = e && typeof e === 'object' ? e : {};
  const tabs = keptTabsOf(src.tabs);
  return {
    browserKey: key,
    hasDir: src.hasDir === true && src.fenced !== true,
    fenced: src.fenced === true,
    label: keptLabel(src.label),
    conversationId: typeof src.conversationId === 'string' && /^[\w.:-]{1,160}$/.test(src.conversationId) ? src.conversationId : null,
    sessionId: typeof src.sessionId === 'string' && /^[\w.:-]{1,160}$/.test(src.sessionId) ? src.sessionId : null,
    tabs, tabsAt: num0(src.tabsAt),
    startedAt: num0(src.startedAt), stoppedAt: numOrNull(src.stoppedAt),
    stoppedWhy: STOP_WHYS.includes(src.stoppedWhy) ? src.stoppedWhy : null,
    restore: normalizeRestore(src.restore),
    waiting: src.stoppedAt === null || src.stoppedAt === undefined ? normalizeWaiting(src.waiting) : null, // lane B: only a RUNNING entry has tabs waiting
    lastUsedAt: num0(src.lastUsedAt),
    bytes: numOrNull(src.bytes), cacheBytes: numOrNull(src.cacheBytes), bytesAt: num0(src.bytesAt), trimmedAt: numOrNull(src.trimmedAt),
  };
}
/** The whole store, judged on the way out: `{version, entries: {<bk>: entry}}` — a child key or a malformed key is never
 *  an entry (D6). */
function normalizeKeptStore(doc) {
  const out = { version: KEPT_VERSION, entries: {} };
  const src = doc && typeof doc === 'object' && doc.entries && typeof doc.entries === 'object' && !Array.isArray(doc.entries) ? doc.entries : {};
  for (const [k, e] of Object.entries(src)) if (isParentKey(k)) out.entries[k] = normalizeEntry(k, e);
  return out;
}

/** The three settings as bytes (MB with floors; an absent / bad value is the default). `on: false` ⇒ today's ephemerality. */
function keptLimits(read = () => undefined) {
  const get = (k) => { try { return read(k); } catch { return undefined; } };
  const mb = (v, d, floor) => { const n = Number(v); const x = v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n : d; return Math.max(floor, Math.round(x)) * MB; };
  const on = get(KEEP_SETTING);
  return {
    on: on !== false && on !== 'false',
    perConversation: mb(get(PER_CONVERSATION_SETTING), KEPT_PER_DEFAULT_MB, KEPT_PER_FLOOR_MB),
    total: mb(get(TOTAL_SETTING), KEPT_TOTAL_DEFAULT_MB, KEPT_TOTAL_FLOOR_MB),
  };
}

/**
 * D1: has the conversation behind this kept browser ENDED? `live` = its browser runs (never ends then), `carried` = a
 * live session carries its key, `bound` = the durable binding still names the key (a Terminate → Resume finds it
 * again). `endsAtTerminate` (default false) is the literal reading of the ruling ("its session is killed"): any entry no
 * live session carries ends. → `{end, why}`.
 */
function keptEndVerdict({ entry, live = false, carried = false, bound = false, endsAtTerminate = false, now = 0, graceMs = KEPT_END_GRACE_MS } = {}) {
  if (!entry) return { end: false, why: 'no-entry' };
  if (live) return { end: false, why: 'live' };
  if (carried) return { end: false, why: 'carried' };
  if (endsAtTerminate) return { end: true, why: 'conversation-ended' };
  if (bound) return { end: false, why: 'bound' };
  const since = Number(entry.stoppedAt) || Number(entry.lastUsedAt) || 0;
  if (graceMs > 0 && now - since < graceMs) return { end: false, why: 'grace' };
  return { end: true, why: 'conversation-gone' };
}

/** Caches a kept directory may lose (Chromium's own layout, relative to the user-data-dir) — each one rebuilt by the
 *  browser on demand. */
const CACHE_SUBDIRS = Object.freeze(['Default/Cache', 'Default/Code Cache', 'Default/GPUCache', 'Default/Service Worker/CacheStorage', 'Default/Service Worker/ScriptCache',
  'Default/DawnGraphiteCache', 'Default/DawnWebGPUCache', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache', 'component_crx_cache']);
/** …and what it never loses: the logins and the sites' own storage. The suite pins that no cache path touches these. */
const NEVER_TRIMMED = Object.freeze(['Default/Cookies', 'Default/Local Storage', 'Default/IndexedDB', 'Default/Login Data', 'Default/Session Storage', 'Default/Web Data', 'Default/Network', 'Default/Preferences', 'Local State']);

/**
 * THE BOUND. `entries` = `[{key, bytes, cacheBytes, lastUsedAt, live, carried}]` (bytes null = not measured: counted as
 * 0 and named), `perConversation` / `total` in bytes. → `{trimCaches:[{key, frees, why}], remove:[{key, frees, why}],
 * kept:[{key, used, overBy, why}], unmeasured:[key], used, limit}` where `used` = the total after the plan.
 *   · per conversation over its bound ⇒ its caches (never while it runs); still over ⇒ REPORTED (its logins are never
 *     trimmed);
 *   · the total over ⇒ whole STOPPED entries of ENDED-OR-IDLE conversations, least recently used first (ties by key —
 *     deterministic), until it fits; still over ⇒ REPORTED.
 *   · `live` = its browser runs; `carried` = a LIVE SESSION carries its key (the conversation runs — only its browser
 *     stopped, e.g. the turn-idle release whose resolve answer promised "reopened at its next start"). Neither is ever
 *     removed whole (verify F2: "never a live conversation's profile" — LIVE is the conversation, not the process); a
 *     carried entry's caches may still go (it is not running), its logins and tabs never. A carried entry the bound
 *     passed over is reported by key.
 */
function keptRetentionPlan({ entries = [], perConversation = KEPT_PER_DEFAULT_MB * MB, total = KEPT_TOTAL_DEFAULT_MB * MB } = {}) {
  const rows = (Array.isArray(entries) ? entries : []).filter((e) => e && isParentKey(e.key));
  const est = new Map();
  const trimCaches = [], remove = [], kept = [], unmeasured = [];
  for (const e of rows) {
    if (e.bytes === null || e.bytes === undefined || !Number.isFinite(Number(e.bytes))) unmeasured.push(e.key);
    let b = num0(e.bytes);
    const cache = Math.min(b, num0(e.cacheBytes));
    if (b > perConversation) {
      if (!e.live && cache > 0) { trimCaches.push({ key: e.key, frees: cache, why: `over its own bound (${b} of ${perConversation} bytes) — its caches go first, its logins never` }); b -= cache; }
      if (b > perConversation) kept.push({ key: e.key, used: b, overBy: b - perConversation, why: e.live ? 'running — over its own bound, reported; nothing of a running browser is trimmed' : 'over its own bound even without its caches — its logins are never trimmed; reported' });
    }
    est.set(e.key, b);
  }
  let used = [...est.values()].reduce((s, x) => s + x, 0);
  if (used > total) {
    const order = rows.filter((e) => !e.live).sort((a, b) => (num0(a.lastUsedAt) - num0(b.lastUsedAt)) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (const e of order) {
      if (used <= total) break;
      if (e.carried) { kept.push({ key: e.key, used: est.get(e.key) || 0, overBy: used - total, why: 'its conversation is running (a live session carries it; only its browser stopped) — its logins and tabs are never removed while it runs; reported' }); continue; }
      remove.push({ key: e.key, frees: num0(e.bytes), why: 'the kept browsers passed their total bound — the least recently used goes first' });
      used -= est.get(e.key) || 0;
    }
    // a removed entry's caches are not trimmed first (it goes whole)
    for (let i = trimCaches.length - 1; i >= 0; i--) if (remove.some((r) => r.key === trimCaches[i].key)) trimCaches.splice(i, 1);
    if (used > total) kept.push({ key: null, used, overBy: used - total, why: 'the running browsers (and the kept browsers of running conversations) alone are over the total bound — reported; neither is ever removed' });
  }
  return { trimCaches, remove, kept, unmeasured, used, limit: total };
}

// ═══ lane browser-resume B (§3.9, the owner's ruling 2): RESUME + "HAND BACK AND CONTINUE" ═══════════════════════════
// A Resume RELAUNCHES the conversation's own browser on its kept directory and reopens its kept tabs (same order, the same
// tab on show); the live view follows by itself. "Hand back and continue" is the between-turns twin of the mid-turn
// handback: the user's one-line note + the tab list ride the conversation's NEXT turn (the stash — nothing is sent now,
// nothing is billed), and the agent's next command opens the SAME browser. No process is kept alive for either.

/** The user's note, as the agent will read it: ONE line (controls and line breaks folded, bidi overrides and invisible
 *  characters gone), ≤ 500 characters, every frame marker inert — the name door (a note is the user's own words, but it
 *  rides the agent's prompt like a peer's text: a pasted `<system-reminder>` must never be a live frame there). */
const CONTINUE_NOTE_MAX = 500;
/** The hand-back frame's whole size (it rides the agent's next prompt under the injection's 9600-byte cap). */
const FRAME_MAX = 2400;
function continueNote(note) { return CR.peerName(typeof note === 'string' ? note : '', CONTINUE_NOTE_MAX) || ''; }

/** The closed set of a Resume's refusals (each a sentence the route carries by name). */
const RESUME_REFUSALS = Object.freeze(['not_kept', 'child_not_kept', 'resume_adopted', 'no_live_session']);
/** How long a start the AGENT's command waits on may spend reopening kept tabs (the rest are named, and kept for
 *  `vibespace-browser resume`); a Resume the user pressed waits longer (the button says "Resuming…"). Per step: one
 *  `open` / `tab new` (it waits for the page's load). */
const RESUME_BOUND_AGENT_MS = 30 * 1000;
const RESUME_BOUND_USER_MS = 90 * 1000;
const RESUME_STEP_MS = 20 * 1000;

/** The tabs a Resume reopens: a RUNNING entry's tabs waiting from its last stop (D2 — a deliberate stop's tabs, moved
 *  aside at the start), else a STOPPED entry's kept tabs. → `{tabs, currentIndex}` (the list re-judged: web pages only). */
function resumeTabsOf(entry) {
  const e = entry && typeof entry === 'object' ? entry : null;
  const src = e ? (e.stoppedAt === null || e.stoppedAt === undefined ? (e.waiting && Array.isArray(e.waiting.tabs) ? e.waiting.tabs : []) : e.tabs) : [];
  const tabs = keptTabsOf(src);
  return { tabs, currentIndex: currentIndexOf(tabs) };
}

/**
 * MAY THIS RESUME RUN? (the one verdict; the keeper asks it with the facts it read). `entry` = the conversation's kept
 * entry (the store's `get`), `child` = the view names a helper's browser (D6: never kept), `sessionLive` = a live session
 * carries the key (a stopped conversation is resumed by resuming the conversation), `running` = its browser runs or is
 * starting (the view just reconnects — `already`), `adoptedLabel` = its directory became a named profile (attach that).
 * → `{ok:true, already, tabs, currentIndex}` | `{ok:false, code, error}` (codes: RESUME_REFUSALS).
 */
function resumeVerdict({ entry = null, child = false, sessionLive = true, running = false, adoptedLabel = null } = {}) {
  if (child) return { ok: false, code: 'child_not_kept', error: 'a helper\'s browser is not kept — only the conversation\'s own browser can be resumed' };
  if (adoptedLabel) return { ok: false, code: 'resume_adopted', error: `this browser became the profile "${String(adoptedLabel).slice(0, KEPT_LABEL_MAX)}" — attach that profile instead`, label: String(adoptedLabel).slice(0, KEPT_LABEL_MAX) };
  if (!sessionLive) return { ok: false, code: 'no_live_session', error: 'the conversation is not running — resume the conversation, then its browser' };
  if (running) return { ok: true, already: true, tabs: [], currentIndex: -1 };
  const { tabs, currentIndex } = resumeTabsOf(entry);
  if (!entry || (!entry.hasDir && !tabs.length)) return { ok: false, code: 'not_kept', error: 'nothing is kept for this browser — the agent\'s next browser command starts a fresh one' };
  return { ok: true, already: false, tabs, currentIndex };
}

/**
 * THE RESUME PLAN (argv steps the keeper runs under the browser's own pairs — never a `tab close`: the tab-release census
 * has no new site). `intoCurrent` = the browser was JUST launched (its launch tab takes the first page: `open`); a browser
 * that already runs gets every page in a NEW tab (`tab new` — the page the agent is on is never navigated away). MEASURED
 * on 0.38.1 (lane browser-resume B): `open --json` / `tab new --json` answer the tab's CDP `targetId`, a `tab new` makes
 * the new tab the active one, and a CDP target id is a tab ref — so the tab that was on show is switched back to BY ITS
 * TARGET ID (never a `t<N>` guess). → `{steps:[{argv, url, title}], current, n}`.
 */
function resumePlan({ tabs = [], currentIndex = 0, intoCurrent = true } = {}) {
  const list = keptTabsOf(tabs);
  const steps = list.map((t, i) => ({ i, argv: i === 0 && intoCurrent ? ['open', t.url, '--json'] : ['tab', 'new', t.url, '--json'], url: t.url, title: t.title }));
  const n = list.length;
  const ci = Number.isInteger(currentIndex) ? currentIndex : currentIndexOf(list);
  return { steps, current: n ? Math.min(Math.max(ci, 0), n - 1) : -1, n };
}
/** The CDP target id a step's `--json` answer names (`data.targetId`), or null. Bounded, never throws. */
function targetIdOf(stdout) {
  const s = String(stdout == null ? '' : stdout).slice(0, 64 * 1024);
  for (const line of s.split('\n').reverse()) {
    const x = line.trim(); if (!x.startsWith('{') || !x.includes('targetId')) continue; // verify r2 (the census): a parse only where an id can be — 32 K `{` lines threw 88 ms of JSON errors
    try { const j = JSON.parse(x); const id = j && j.data && typeof j.data.targetId === 'string' ? j.data.targetId : null; if (id && /^[0-9A-Fa-f]{16,64}$/.test(id)) return id; } catch { /* the next line */ }
  }
  return null;
}
/** A failed step's reason in a few words (the binary's own error, bounded; a page's url never quoted twice). */
function stepWhyOf(r) {
  const raw = r ? (r.json && r.json.error) || r.stderr || r.error || r.stdout || '' : 'no answer';
  const one = String(raw).replace(/\s+/g, ' ').trim();
  return CR.peerText(one || 'the step failed', 160);
}

// ── the words (English, agent-facing / the journal; the client words its own chips) ──
const clip = (s, n) => { const x = String(s == null ? '' : s); return x.length > n ? x.slice(0, n - 1) + '…' : x; };
const tabLine = (t) => `${t.title ? clip(t.title, 80) + ' — ' : ''}${clip(t.url, 200)}`;
/** Why the conversation's browser stopped, in the agent's words (the closed vocabulary). */
function stopWhyWords(w) {
  return ({ 'turn-idle': 'released after the turn ended', idle: 'it idled out', heal: 'it was restarted', restart: 'VibeSpace restarted', 'conversation-gone': 'its session ended', user: 'the user stopped it', agent: 'you closed it' }[w] || 'it stopped');
}
/** ≤ 8 tabs, each bounded, and the whole within `budget` characters — a frame that rides a prompt stays small (the
 *  injection's 9600-byte cap); the CURRENT tab is always named (past the list when it did not fit), the rest counted. */
function tabsListText(tabs, currentIndex, { max = 8, budget = 1800 } = {}) {
  const list = keptTabsOf(tabs);
  const ci = Number.isInteger(currentIndex) && currentIndex >= 0 ? currentIndex : currentIndexOf(list);
  const curLine = list[ci] ? `current: ${tabLine(list[ci])}` : '';
  const room = Math.max(0, budget - curLine.length - 24);
  const shown = [];
  let used = 0;
  for (let i = 0; i < list.length && shown.length < max; i++) {
    const line = `${i + 1}) ${tabLine(list[i])}${i === ci ? ' (current)' : ''}`;
    if (used + line.length + 3 > room && shown.length) break;
    shown.push(line); used += line.length + 3;
  }
  const numbered = shown.length;
  const curPast = ci >= numbered && !!curLine; // the current tab did not fit the list: named after it
  if (curPast) shown.push(curLine);
  const more = list.length - numbered - (curPast ? 1 : 0);
  return shown.join(' · ') + (more > 0 ? ` · (+${more} more)` : '');
}
/**
 * THE HAND-BACK FRAME (what the agent reads at its next turn — ONE stash entry, the one carrier): the user's note (their
 * own words, belted), the tabs as they are now (the current one marked), that the next command runs in the SAME browser,
 * and — when the hand-back closed a takeover — what that takeover interrupted (the handback's own re-run sentence).
 */
function continueFrame({ note = '', tabs = [], currentIndex = -1, rerun = [], rerunSentence = null, userActs = [], actsSentence = null, drove = true } = {}) {
  const n = continueNote(note);
  const list = keptTabsOf(tabs);
  // verify r2 (Y5): `drove` = a takeover ended with this hand-back; without one the user RESUMED the browser (the offer's
  // other leg) — the head says which (a frame that says "drove" over a browser nobody drove is a lie the agent acts on)
  const head = `The user ${drove ? 'drove your browser' : 'resumed your browser'} and handed it back for your next turn${n ? ` with a note: “${n}”` : ' (no note)'}.`;
  const next = ' Your next browser command runs in this same browser (the same logins, the same tabs) on the current tab — re-read the page first (`vibespace-browser snapshot -i`).';
  // lane browser-resume C: what the user did to its tabs while driving (src/browser-tabs.js userActsSentence), then the re-run list
  const acts = Array.isArray(userActs) && userActs.length && typeof actsSentence === 'function' ? String(actsSentence(userActs) || '').slice(0, 700) : '';
  const again = (acts ? ' ' + acts : '') + (Array.isArray(rerun) && rerun.length && typeof rerunSentence === 'function' ? ' ' + String(rerunSentence(rerun)).slice(0, 400) : '');
  // the fixed words first; the tab list gets what is left of the frame's budget (never cut mid-sentence at the end)
  const budget = FRAME_MAX - head.length - next.length - again.length - 16;
  const where = list.length ? ` Its tabs now: ${tabsListText(list, currentIndex, { budget })}.` : ' It has no web page open now.';
  return head + where + next + again;
}
/** The card in the user's own chat (display only): the same facts from the user's side, and that nothing was sent now. */
function continueCardText({ note = '', tabs = [], currentIndex = -1 } = {}) {
  const n = continueNote(note);
  const list = keptTabsOf(tabs);
  const cur = list.length ? list[Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < list.length ? currentIndex : currentIndexOf(list)] : null;
  return (`You handed the browser back for the agent's next turn${n ? `: “${n}”` : ''}.` + (list.length ? ` ${list.length} tab(s); on show: ${tabLine(cur)}.` : '') + ' The agent reads this with its next message — nothing was sent now.').slice(0, 1200);
}
/** The resolve answer's note when the USER resumed (or handed back) the browser: what runs now and their note. */
function resumedNoteText({ note = '', tabs = [], currentIndex = -1, handedBack = false, drove = false } = {}) {
  const n = continueNote(note);
  const list = keptTabsOf(tabs);
  const cur = list.length ? list[currentIndex >= 0 && currentIndex < list.length ? currentIndex : currentIndexOf(list)] : null;
  return `${handedBack ? (drove ? 'the user drove your browser and handed it back' : 'the user resumed your browser and handed it back') : 'the user resumed your browser'} — ${list.length} tab(s)${cur ? `, current: ${tabLine(cur)}` : ''}${n ? `; their note: “${n}”` : ''}. This command runs on the current tab — re-read the page first`;
}
/** …when the agent's own start reopened the kept tabs by itself (D2: an automatic stop). */
function restoredNoteText({ why = null, opened = 0, skipped = [], current = null } = {}) {
  const sk = Array.isArray(skipped) ? skipped : [];
  return `your browser was closed (${stopWhyWords(why)}) and started again with its ${opened} kept tab(s)${current ? ` — current: ${tabLine(current)}` : ''}${sk.length ? `; ${sk.length} not reopened (${clip(sk.map((x) => x.why).join('; '), 200)}) — \`vibespace-browser resume\` tries them again` : ''}`;
}
/** verify r2 (D6): a HELPER's browser (a child key) keeps nothing — said in its own first answer, not only in the manual
 *  (a helper that logs in somewhere learns from its own result that the login ends with its browser). */
function helperNotKeptText() {
  return 'this helper\'s browser keeps nothing: a login made in it ends with it (only the conversation\'s own browser — a command without a handle — keeps its logins and tabs after it closes)';
}
/** …when its tabs are kept and were NOT reopened (a deliberate stop, D2): the verb that reopens them. */
function keptNoteText({ why = null, tabs = 0 } = {}) {
  return `your browser was closed (${stopWhyWords(why)}); its ${tabs} tab(s) are kept — \`vibespace-browser resume\` reopens them (its logins are still there either way)`;
}

module.exports = {
  CONTINUE_NOTE_MAX, RESUME_REFUSALS, RESUME_BOUND_AGENT_MS, RESUME_BOUND_USER_MS, RESUME_STEP_MS,
  continueNote, resumeTabsOf, resumeVerdict, resumePlan, targetIdOf, stepWhyOf, stopWhyWords, tabsListText, continueFrame, continueCardText,
  resumedNoteText, restoredNoteText, keptNoteText, helperNotKeptText, normalizeWaiting,
  KEPT_VERSION, KEPT_FILE, KEPT_TABS_MAX, KEPT_TITLE_MAX, KEPT_URL_MAX, KEPT_LABEL_MAX,
  KEEP_SETTING, PER_CONVERSATION_SETTING, TOTAL_SETTING, KEPT_PER_DEFAULT_MB, KEPT_PER_FLOOR_MB, KEPT_TOTAL_DEFAULT_MB, KEPT_TOTAL_FLOOR_MB, MB,
  KEPT_END_GRACE_MS, DELIBERATE_WINDOW_MS, KEY_RE, CHILD_RE, RESTORE_ID_RE, STOP_WHYS, AUTO_RESTORE_WHYS, CACHE_SUBDIRS, NEVER_TRIMMED,
  isParentKey, stopWhyOf, restoreKindFor, keptUrl, keptTitle, keptLabel, keptTabsOf, currentIndexOf, mergeTabs, keptKindOf,
  normalizeEntry, normalizeRestore, normalizeKeptStore, keptLimits, keptEndVerdict, keptRetentionPlan,
};

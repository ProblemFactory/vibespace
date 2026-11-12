/**
 * Sidebar state management mixin — star/archive/rename/groups,
 * server sync, session key migration, localStorage cache.
 *
 * Installed on Sidebar.prototype via installSidebarState(Sidebar).
 * All methods use `this` (Sidebar instance context).
 */
import { getSessionKey, backendFeatureCaps } from './agent-meta.js';
import { showToast, showInputDialog } from './utils.js';
import { t as tr } from './i18n.js';
import { reportOwnerPage } from './owner-facts.js'; // lane agent-context-owner-facts (B-7960 b): what this page tells the hub about the owner's screen
import { sessionRowOf, placeOf, settingsPolicy } from '../attention-model.js'; // PURE: THE attention list (lane attention-predicate-shared) — the rank reads a session's band
import { diffOps, viewOf, createSync } from '../user-state-ops.js'; // PURE CJS (lane sidebar-echo-order, inc-mwbn2xp8-ks0b): the page's user state = the server's newest + its own acts not yet confirmed; a push carries the person's ops

export function installSidebarState(SidebarClass) {
  const proto = SidebarClass.prototype;

  // ── Server State Sync ──

  proto._fetchUserState = async function({ tries, signal } = {}) {
    // Retry on failure (2.223.4, userW incident): this used to be a
    // ONE-SHOT fetch — a tab loading during a server-restart window came up
    // with names/stars/archives ALL unapplied (renames "gone", archived
    // sessions resurfacing) and never healed. Worse, _userStateFetched was
    // set even on failure, so a later star/rename POSTed the EMPTY full doc
    // back over the server's real state (silent fleet-wide clobber bomb).
    // Now: retries with backoff, the fetched flag is set only after a
    // SUCCESSFUL apply (writes stay blocked until then), and the app's
    // reconnect path calls this again (idempotent).
    // lane sidebar-echo-order r11–12: ONE try when the user-state engine paces its own asks for the server's state — one in flight,
    // given up by the engine's own timer through `signal` (15 s, doubling with its pace); the first fetch and a reconnect: four tries
    for (const wait of (tries === 1 ? [0] : [0, 2000, 5000, 15000])) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        const res = await fetch('/api/user-state', signal ? { signal } : undefined);
        if (!res.ok) continue;
        const state = await res.json();
        const again = this._userStateFetched;
        this._applyServerState(state);
        // lane sidebar-echo-order: the connection is BACK (a later fetch) — what is in flight or failing goes again, AFTER this
        // state says which server answers (round 6, MUST 3: ops only to a server that said it takes them); the first fetch
        // re-sends nothing (an act made before it is sent ONCE, when this state names the server)
        if (again) this._userSync().resend();
        this._render();
        this.app.updateTaskbar();
        // Only after the authoritative server state has been applied may
        // migration-triggered pushes write back (see _migrateUserStateKeys).
        this._userStateFetched = true;
        // B-7960 b: the owner's LAST page names their tray for the agents — its language (the label they read) and whether
        // it is the phone layout (the tray is in the top bar there); written only when user-state does not already say so
        reportOwnerPage(state, { phone: !!this.app.isMobile });
        return;
      } catch {}
    }
    if (tries !== 1) console.warn('[user-state] initial fetch failed after retries — stars/names read-only until reconnect');
  };

  proto._writeUserStateToLocalStorage = function(state) {
    localStorage.setItem('starredSessions', JSON.stringify(state.starredSessions || []));
    localStorage.setItem('archivedSessions', JSON.stringify(state.archivedSessions || []));
    localStorage.setItem('archivedFolders', JSON.stringify(state.archivedFolders || []));
    localStorage.setItem('sessionCustomNames', JSON.stringify(state.customNames || {}));
    localStorage.setItem('sessionModes', JSON.stringify(state.sessionModes || {}));
    localStorage.setItem('sessionConfigs', JSON.stringify(state.sessionConfigs || {}));
    localStorage.setItem('sessionGroups', JSON.stringify(state.sessionGroups || {}));
    localStorage.setItem('groupFolders', JSON.stringify(state.groupFolders || {}));
  };

  proto._getLegacySessionId = function(sessionOrKey, fallback = null) {
    if (sessionOrKey && typeof sessionOrKey === 'object') {
      if (typeof sessionOrKey.sessionKey === 'string' && sessionOrKey.sessionKey.includes(':')) {
        return sessionOrKey.sessionKey.split(':').slice(1).join(':') || '';
      }
      return sessionOrKey.sessionId || sessionOrKey.backendSessionId || sessionOrKey.claudeSessionId || sessionOrKey.webuiId || sessionOrKey.id || '';
    }
    if (typeof sessionOrKey === 'string' && !sessionOrKey.includes(':')) return sessionOrKey;
    if (fallback && typeof fallback === 'object') {
      return fallback.sessionId || fallback.backendSessionId || fallback.claudeSessionId || fallback.webuiId || fallback.id || '';
    }
    return '';
  };

  proto._lookupTransientSessionKey = function(rawKey, sessions = this._allSessions) {
    const key = String(rawKey || '');
    if (!key) return null;
    let backend = '', transientId = '';
    if (key.includes(':')) {
      const idx = key.indexOf(':');
      backend = key.slice(0, idx) || 'claude';
      transientId = key.slice(idx + 1);
    } else {
      transientId = key;
    }
    if (!transientId.startsWith('sess-')) return null;
    const match = (sessions || []).find((session) => {
      const sessionBackend = session.backend || 'claude';
      if (backend && sessionBackend !== backend) return false;
      return session.webuiId === transientId || session.id === transientId;
    });
    if (!match) return null;
    const nextKey = match.sessionKey || getSessionKey(match) || '';
    return nextKey && nextKey !== key ? nextKey : null;
  };

  proto._lookupLegacySessionKey = function(legacyId, sessions = this._allSessions) {
    if (!legacyId) return null;
    const transient = this._lookupTransientSessionKey(legacyId, sessions);
    if (transient) return transient;
    const matches = (sessions || []).filter((session) => {
      const ids = [session.sessionId, session.backendSessionId, session.claudeSessionId, session.webuiId, session.id, this._getLegacySessionId(session)].filter(Boolean);
      return ids.includes(legacyId);
    });
    if (matches.length !== 1) return null;
    return this._getSessionStateKey(matches[0]) || null;
  };

  proto._getSessionStateKey = function(sessionOrKey, fallback = null) {
    if (sessionOrKey && typeof sessionOrKey === 'object') {
      return sessionOrKey.sessionKey || getSessionKey(sessionOrKey) || this._getLegacySessionId(sessionOrKey);
    }
    const transient = this._lookupTransientSessionKey(sessionOrKey, fallback && typeof fallback === 'object' ? [fallback] : this._allSessions);
    if (transient) return transient;
    if (typeof sessionOrKey === 'string' && sessionOrKey.includes(':')) return sessionOrKey;
    const fallbackKey = fallback && typeof fallback === 'object' ? getSessionKey(fallback) : '';
    if (fallbackKey) return fallbackKey;
    return this._lookupLegacySessionKey(sessionOrKey) || String(sessionOrKey || '');
  };

  proto._stateSetHas = function(set, sessionOrKey, fallback = null) {
    const stateKey = this._getSessionStateKey(sessionOrKey, fallback);
    if (stateKey && set.has(stateKey)) return true;
    const legacyId = this._getLegacySessionId(sessionOrKey, fallback);
    return !!(legacyId && set.has(legacyId));
  };

  proto._stateMapGet = function(map, sessionOrKey, fallback = null) {
    const stateKey = this._getSessionStateKey(sessionOrKey, fallback);
    if (stateKey && Object.hasOwn(map, stateKey)) return map[stateKey];
    const legacyId = this._getLegacySessionId(sessionOrKey, fallback);
    if (legacyId && Object.hasOwn(map, legacyId)) return map[legacyId];
    return null;
  };

  proto._migrateStateArray = function(items, sessions = this._allSessions) {
    const next = [], seen = new Set();
    let changed = false;
    for (const raw of Array.isArray(items) ? items : []) {
      const mapped = this._lookupTransientSessionKey(raw, sessions)
        || ((typeof raw === 'string' && raw.includes(':')) ? raw : (this._lookupLegacySessionKey(raw, sessions) || raw));
      if (mapped !== raw) changed = true;
      if (seen.has(mapped)) { changed = true; continue; }
      seen.add(mapped);
      next.push(mapped);
    }
    return { next, changed };
  };

  proto._migrateStateMap = function(map, sessions = this._allSessions) {
    const next = {};
    let changed = false;
    for (const [rawKey, value] of Object.entries(map || {})) {
      const mappedKey = this._lookupTransientSessionKey(rawKey, sessions)
        || (rawKey.includes(':') ? rawKey : (this._lookupLegacySessionKey(rawKey, sessions) || rawKey));
      if (mappedKey !== rawKey) changed = true;
      if (!Object.hasOwn(next, mappedKey)) next[mappedKey] = value;
      else if (next[mappedKey] !== value) {
        // TWO raw keys mapped onto ONE session with DIFFERENT values — one of
        // them is about to be DROPPED silently. That is how a session ends up
        // wearing another session's custom name (and how the rightful owner
        // loses its own): user-visible state disappearing with no trace.
        // Never silent again — breadcrumb + telemetry so a recurrence is
        // provable from an incident bundle (2026-08-11 field report).
        try { window.__vsOp?.('state-key-collision', { key: String(mappedKey).slice(0, 40), kept: String(next[mappedKey]).slice(0, 30), dropped: String(value).slice(0, 30) }); } catch {}
        try { window.__vsTelemetry?.event?.('state-key-collision'); } catch {}
        changed = true;
      }
    }
    return { next, changed };
  };

  proto._migrateUserStateKeys = function(sessions = this._allSessions) {
    let changed = false;
    const starred = this._migrateStateArray([...this._starredIds], sessions);
    const archived = this._migrateStateArray([...this._archivedIds], sessions);
    const customNames = this._migrateStateMap(this._customNames, sessions);
    const sessionModes = this._migrateStateMap(this._sessionModes, sessions);
    const sessionConfigs = this._migrateStateMap(this._sessionConfigs, sessions);
    const nextGroups = {};
    for (const [groupName, sessionKeys] of Object.entries(this._sessionGroups || {})) {
      const migrated = this._migrateStateArray(sessionKeys, sessions);
      nextGroups[groupName] = migrated.next;
      if (migrated.changed) changed = true;
    }
    if (starred.changed || archived.changed || customNames.changed || sessionModes.changed || sessionConfigs.changed) changed = true;
    if (!changed) return false;
    this._starredIds = new Set(starred.next);
    this._archivedIds = new Set(archived.next);
    this._customNames = customNames.next;
    this._sessionModes = sessionModes.next;
    this._sessionConfigs = sessionConfigs.next;
    this._sessionGroups = nextGroups;
    this._writeUserStateToLocalStorage({
      starredSessions: [...this._starredIds], archivedSessions: [...this._archivedIds],
      archivedFolders: [...(this._archivedFolders || [])],
      customNames: this._customNames, sessionModes: this._sessionModes, sessionConfigs: this._sessionConfigs,
      sessionGroups: this._sessionGroups, groupFolders: this._groupFolders,
    });
    return true;
  };

  // ── THE PAGE'S USER STATE (lane sidebar-echo-order — the owner's incident inc-mwbn2xp8-ks0b, 2026-11-11: «我的批量操作一直在回滚»).
  // 122 Archive clicks in 55 s on a hub whose loop lagged ~1.9 s: the first user-state-updated echo came 44 s after the first
  // click, and every echo REPLACED this page's whole sets with what the server held when THAT echo was made (its own echo
  // included); the next click then PATCHed the rolled-back list WHOLE (B-b87b's belt diffed top-level keys only), erasing on
  // the server what the echo had rolled back on the screen. NOW: the page keeps a BASE — the newest server state by its
  // stateRev, the write counter the server gives; an echo at or below it is the past and changes nothing — and its own PENDING
  // acts (src/user-state-ops.js createSync), and shows base + pending. A push carries what the person changed, per item (and
  // per member / per field inside a group / a conversation's config), handed to the network AT THE ACT in a request that carries
  // every batch of this page not yet confirmed (round 5 — a later act carries an earlier one whose request failed), each applied
  // once by its batch id; a failing write stays shown while the page lives and rides the next act or a paced re-send — nothing is
  // said about it (round 9: the page speaks only when it takes something back on the screen, and only after its rows show it).
  proto._userStateView = function() {
    return {
      starredSessions: [...(this._starredIds || [])], archivedSessions: [...(this._archivedIds || [])],
      archivedFolders: [...(this._archivedFolders || [])],
      customNames: this._customNames || {}, sessionModes: this._sessionModes || {}, sessionConfigs: this._sessionConfigs || {},
      sessionGroups: this._sessionGroups || {}, groupFolders: this._groupFolders || {},
    };
  };

  proto._userSync = function() {
    if (this.__userSync) return this.__userSync;
    const rnd = () => { try { const a = new Uint8Array(9); globalThis.crypto.getRandomValues(a); return Array.from(a, (x) => x.toString(36)).join(''); } catch { return Math.random().toString(36).slice(2, 14); } };
    const doors = this.__doors || {};   // a TEST SEAM only (a harness's virtual clock); production never sets it
    // this page's unconfirmed acts live and die with this PAGE — its id is made per page LOAD, in memory; nothing about an act in
    // flight is stored or shared with another page. EVERY ACT IS ON THE WIRE AT THE ACT (round 4), in a request that carries every
    // batch this page has not seen confirmed, oldest first (round 5 — a later act carries an earlier one whose request failed)
    const sync = createSync({
      ...doors,
      pageId: ('pg' + rnd()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24),
      refetch: (o) => { try { return this._fetchUserState(o && o.paced ? { tries: 1, signal: o.signal } : undefined); } catch { return null; } },   // the server's state (an answer from another life confirms nothing; round 11: the engine's paced asks, one GET each)
      initial: this._userStateDisplayCopy(),   // what the page last SHOWED: replaced by the first server state, NEVER sent
      send: async (body, { signal } = {}) => {
        // round 7, C1: ops only, to the OPS DOOR — a server without it answers 404, a failure like any other (kept, retried; round 14:
        // said once a page — the engine's 'older-server')
        const res = await fetch('/api/user-state/batches', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
        let j = null;
        try { j = await res.json(); } catch { }
        const list = (k) => (j && Array.isArray(j[k]) ? j[k] : []);
        if (res.ok && j && j.success) return { ok: true, rev: j.rev, epoch: j.epoch, refused: list('refused'), old: list('old'), superseded: list('superseded') };   // a batch refused on its own, or too old to keep, is named — with a CODE the page words (round 9)
        // a REFUSAL of the ops themselves (400 / 413 / 422) is undone here and said (its code worded by this page); 401 / 403 waits
        // for the next answered state; anything else (a 5xx — the server could not write it —, a 404, no answer in 15 s) keeps them
        // shown and pending, sent again, with no word
        return { ok: false, refused: [400, 413, 422].includes(res.status), status: res.status, code: (j && typeof j.code === 'string' && j.code) || null };
      },
      onView: (v, why) => this._showUserStateView(v, why),
      say: (kind, info) => this._sayUserStateWrite(kind, info),
    });
    this.__userSync = sync;
    return sync;
  };

  /** what this page last SHOWED — its localStorage display copy (every shown view is written there, and an act changes the
   *  in-memory sets FIRST): so an engine made at the first act still starts from the view BEFORE it (the constructor makes it
   *  earlier anyway) */
  proto._userStateDisplayCopy = function() {
    const rd = (raw, d) => { try { const v = JSON.parse(raw || 'null'); return v == null ? d : v; } catch { return d; } };
    return {
      starredSessions: rd(localStorage.getItem('starredSessions'), []), archivedSessions: rd(localStorage.getItem('archivedSessions'), []),
      archivedFolders: rd(localStorage.getItem('archivedFolders'), []), customNames: rd(localStorage.getItem('sessionCustomNames'), {}),
      sessionModes: rd(localStorage.getItem('sessionModes'), {}), sessionConfigs: rd(localStorage.getItem('sessionConfigs'), {}),
      sessionGroups: rd(localStorage.getItem('sessionGroups'), {}), groupFolders: rd(localStorage.getItem('groupFolders'), {}),
    };
  };

  /** the engine's view → this page's sets / maps (copies: an in-place edit never touches the engine's base) + the display copy */
  proto._showUserStateView = function(v, why) {
    const c = viewOf(v);
    // round 10, MUST 1: an ANSWER that changes what the page shows (a refusal, the 7-day rule, a superseded act, a later state taking an
    // act back) repaints the rows in this same task — a word is said only after (an act and a state are painted by their callers)
    const changed = why === 'answer' && JSON.stringify(c) !== JSON.stringify(viewOf(this._userStateView()));
    this._starredIds = new Set(c.starredSessions);
    this._archivedIds = new Set(c.archivedSessions);
    this._archivedFolders = new Set(c.archivedFolders);
    this._customNames = c.customNames;
    this._sessionModes = c.sessionModes;
    this._sessionConfigs = c.sessionConfigs;
    this._sessionGroups = c.sessionGroups;
    this._groupFolders = c.groupFolders;
    this._writeUserStateToLocalStorage(c);
    if (changed) { try { this._render(); this.app?.updateTaskbar?.(); } catch { } }
  };

  /** round 9: the page SPEAKS ONLY WHEN IT TAKES SOMETHING BACK ON THE SCREEN — a refusal, worded from its CODE in the person's
   *  language, and the 7-day rule; no word about waiting, none about arriving (a 401 is the app's: it sends a signed-out person to
   *  sign in, as on master) */
  const REFUSAL_REASONS = {
    'unknown-key': 'a kind of change it does not keep', 'not-a-name': 'a name it does not keep', 'bad-value': 'a value it does not take',
    'not-an-op': 'a change it could not read', malformed: 'a change it could not read', 'no-ops': 'an empty change',
    'too-many-ops': 'too many changes at once', 'too-large': 'too large to take at once', 'too-deep': 'a value nested too deep', 'too-large-value': 'a value larger than any setting',
    'reused-id': 'the id of an earlier change', 'too-large-group': 'a group larger than 20 000 conversations', 'too-large-values': 'more changed values than one request carries',
  };
  proto._sayUserStateWrite = function(kind, info) {
    if (kind === 'refused') {
      const reason = info && REFUSAL_REASONS[info.code];
      // round 13: what THIS page refused never left it — never «the server refused»
      if (info && info.local) showToast(reason ? tr('This page did not keep a change ({reason})', { reason: tr(reason) }) : tr('This page did not keep a change.'), { type: 'error' });
      else showToast(reason ? tr('The server refused a change ({reason}), so it was undone here', { reason: tr(reason) }) : tr('The server refused a change, so it was undone here.'), { type: 'error' });   // (the rows were repainted before it — round 10)
    } else if (kind === 'older-server') {
      // round 14: the ops door answered 404 — a server older than this page (a downgrade, the minute of a rolling update): its acts
      // never land there, and a reload shows that server's state; said once a page (the engine's)
      showToast(tr('This server is older than this page, so changes made here are not saved — reload the page'), { type: 'error' });
    } else if (kind === 'old') {
      // one sentence, true whether the act was never applied or applied once and beaten since — said only where what the page
      // shows changed because of it; the count agrees with its noun
      const n = (info && info.count) || 1;
      showToast(n === 1 ? tr("A change made more than 7 days ago was not kept — this page now shows the server's") : tr("{n} changes made more than 7 days ago were not kept — this page now shows the server's", { n }), { type: 'error' });
    }
  };

  /** a server state (the GET, a broadcast) → false when it is not newer than the one this page holds (an echo of the past
   *  never undoes a later act); else the page shows it + its own acts not yet confirmed */
  proto._applyServerState = function(state) {
    return this._userSync().apply(state);
  };

  /** the person's acts since the page last showed its state: per item / member / field, never a whole key (lane sidebar-echo-order) */
  proto._pushUserState = async function() {
    const sync = this._userSync();
    // (round 13: the diff reads the engine's view as it stands — no copy of either side — and copies only the values it changed)
    const ops = diffOps(sync.peek(), this._userStateView(), undefined, false).map((o) => (o.value !== null && typeof o.value === 'object' ? { ...o, value: JSON.parse(JSON.stringify(o.value)) } : o));
    if (!ops.length) return;
    await sync.record(ops);
  };

  // ── Star / Archive / Rename ──

  // Waiting-key set (OSC-idle sessions), cached for one synchronous render pass
  // so a card grid + its sort don't each re-scan every window.
  proto._waitingSet = function() {
    if (this.__waitingCache) return this.__waitingCache;
    const w = this.app?.getWaitingSessionKeys?.() || new Set();
    this.__waitingCache = w;
    try { queueMicrotask(() => { this.__waitingCache = null; }); } catch { this.__waitingCache = null; }
    return w;
  };

  // Urgency + attention rank for a session (higher floats to the top). The
  // agent sets urgency via vibespace-status; blocked/needs-input/OSC-waiting
  // also bump it so sessions that need you surface without an explicit urgency.
  proto._sessionSortRank = function(s, waiting) {
    const URG = { urgent: 3, high: 2, normal: 1, low: 0 };
    const st = this.getSessionStatus?.(s);
    const isLive = s.status === 'live' || s.status === 'tmux';
    // Finished work sinks below everything — done is a result, not a demand.
    if (st?.state === 'done') return -1;
    let r = st?.urgency ? (URG[st.urgency] ?? 0) : 0;
    // Attention bumps only for RUNNING sessions — a stopped session's stale
    // blocked/needs-input declaration describes a process that no longer runs.
    if (isLive && st?.state === 'blocked') r = Math.max(r, 2);
    else if (isLive && st?.state === 'needs-input') r = Math.max(r, 1);
    const key = `${s.backend || 'claude'}:${s.backendSessionId || s.claudeSessionId || ''}`;
    if (waiting.has(key)) r = Math.max(r, 1);
    return r;
  };

  // lane attention-predicate-shared (design q-044 §2 「侧栏会话序」 — the owner accepted it 2026-10-19): THE RANK READS THE
  // ATTENTION LIST'S BAND FIRST — the session's status as a row (src/attention-model.js sessionRowOf: urgent ⇒ 1, a running
  // agent blocked ⇒ 2, a running agent asking ⇒ 5, 7 days ⇒ 搁置) placed by the same placeOf as the tray and the Channels
  // first screen, under the owner's band switches; a session not in the list after every one that is; then the old rank
  // (urgency / attention) as the tie order inside a band.
  proto._sessionBand = function(s, waiting, now = Date.now(), policy = null) {
    const st = this.getSessionStatus?.(s);
    const isLive = s.status === 'live' || s.status === 'tmux';
    const key = `${s.backend || 'claude'}:${s.backendSessionId || s.claudeSessionId || ''}`;
    const row = sessionRowOf(st, { key, live: isLive, waiting: waiting.has(key), now });
    const p = row ? placeOf(row, now, policy) : 0;
    return p > 0 ? p : 7; // 1–5, 6 = 搁置; 7 = not in the list
  };

  proto._sortSessions = function(arr) {
    const waiting = this._waitingSet();
    const now = Date.now();
    const policy = settingsPolicy((k) => this.app?.settings?.get?.(k));
    const rankOf = new Map(), bandOf = new Map();
    for (const s of arr) { rankOf.set(s, this._sessionSortRank(s, waiting)); bandOf.set(s, this._sessionBand(s, waiting, now, policy)); }
    arr.sort((a, b) => {
      const ab = bandOf.get(a), bb = bandOf.get(b);
      if (ab !== bb) return ab - bb; // the attention list's band first (lane attention-predicate-shared)
      const ar = rankOf.get(a), br = rankOf.get(b);
      if (ar !== br) return br - ar; // urgency/attention first (user: 决定排列优先级)
      const as = this._stateSetHas(this._starredIds, a) ? 1 : 0;
      const bs = this._stateSetHas(this._starredIds, b) ? 1 : 0;
      if (as !== bs) return bs - as;
      return (b.startedAt || 0) - (a.startedAt || 0);
    });
  };

  proto.toggleStar = function(sessionOrKey) {
    const stateKey = this._getSessionStateKey(sessionOrKey);
    if (this._stateSetHas(this._starredIds, sessionOrKey)) {
      this._starredIds.delete(stateKey);
      const legacyId = this._getLegacySessionId(sessionOrKey);
      if (legacyId) this._starredIds.delete(legacyId);
    } else if (stateKey) {
      this._starredIds.add(stateKey);
    }
    this._pushUserState(); this._render(); this.app.updateTaskbar();
  };

  proto.isStarred = function(sessionOrKey) { return this._stateSetHas(this._starredIds, sessionOrKey); };

  proto.toggleArchive = function(sessionOrKey) {
    const stateKey = this._getSessionStateKey(sessionOrKey);
    if (this._stateSetHas(this._archivedIds, sessionOrKey)) {
      this._archivedIds.delete(stateKey);
      const legacyId = this._getLegacySessionId(sessionOrKey);
      if (legacyId) this._archivedIds.delete(legacyId);
      // If its folder is still folder-archived the session would just re-archive
      // on the next render — dissolve the folder rule into individual archives
      // (minus this session) so unarchiving one card actually sticks.
      this._dissolveFolderArchive(sessionOrKey, stateKey);
    } else if (this._isFolderArchived(sessionOrKey)) {
      // Archived only via the folder rule (e.g. created after Archive project):
      // unarchive = dissolve the rule, keep the rest archived individually.
      this._dissolveFolderArchive(sessionOrKey, stateKey);
    } else if (stateKey) {
      this._archivedIds.add(stateKey);
    }
    this._pushUserState(); this._render(); this.app.updateTaskbar();
  };

  // Folder-level archive key for a session — host-scoped so archiving a local
  // folder never swallows a remote session that happens to share the path.
  proto._archiveFolderKey = function(sessionOrKey, host) {
    if (sessionOrKey && typeof sessionOrKey === 'object') {
      const cwd = sessionOrKey.cwd || '(unknown)';
      return (sessionOrKey.host ? sessionOrKey.host + '::' : '') + cwd;
    }
    if (typeof sessionOrKey === 'string' && sessionOrKey) return (host ? host + '::' : '') + sessionOrKey;
    return null;
  };

  proto._isFolderArchived = function(sessionOrKey) {
    const fkey = this._archiveFolderKey(sessionOrKey);
    return !!(fkey && this._archivedFolders?.has(fkey));
  };

  proto._dissolveFolderArchive = function(sessionOrKey, exceptKey) {
    const fkey = this._archiveFolderKey(sessionOrKey);
    if (!fkey || !this._archivedFolders?.has(fkey)) return;
    this._archivedFolders.delete(fkey);
    for (const s of this._allSessions || []) {
      if (this._archiveFolderKey(s) !== fkey) continue;
      const k = this._getSessionStateKey(s);
      if (k && k !== exceptKey) this._archivedIds.add(k);
    }
  };

  // A session is archived when explicitly archived OR its folder is archived.
  // The folder rule is what makes "Archive project" cover FUTURE sessions in
  // that folder too (previously only then-existing sessions were archived, so
  // new ones popped back and the archive looked like it didn't stick).
  proto.isArchived = function(sessionOrKey) {
    if (this._stateSetHas(this._archivedIds, sessionOrKey)) return true;
    return this._isFolderArchived(sessionOrKey);
  };

  proto.isFolderArchived = function(cwd, host) { return !!this._archivedFolders?.has(this._archiveFolderKey(cwd, host)); };

  // Archive a whole project: record the FOLDER (future sessions start archived)
  // + archive every current session under it individually.
  proto.archiveProject = function(cwd, sessions, host) {
    const fkey = this._archiveFolderKey(cwd, host);
    if (fkey) this._archivedFolders.add(fkey);
    let n = 0;
    for (const s of sessions || []) {
      const stateKey = this._getSessionStateKey(s);
      if (stateKey && !this._archivedIds.has(stateKey)) { this._archivedIds.add(stateKey); n++; }
    }
    this._pushUserState(); this._render(); this.app.updateTaskbar();
    showToast(tr('Archived {n} sessions — new sessions here start archived', { n }));
  };

  proto.unarchiveProject = function(cwd, host) {
    const fkey = this._archiveFolderKey(cwd, host);
    if (fkey) this._archivedFolders.delete(fkey);
    let n = 0;
    for (const s of this._allSessions || []) {
      if (this._archiveFolderKey(s) !== fkey) continue;
      const k = this._getSessionStateKey(s);
      if (k && this._archivedIds.delete(k)) n++;
      const legacy = this._getLegacySessionId(s);
      if (legacy) this._archivedIds.delete(legacy);
    }
    this._pushUserState(); this._render(); this.app.updateTaskbar();
    showToast(tr('Unarchived project ({n} sessions)', { n }));
  };

  // Bulk archive (folder header context menu) — one state push + render for
  // the whole batch instead of per-session toggles.
  proto.archiveSessions = function(sessions) {
    let n = 0;
    for (const s of sessions || []) {
      const stateKey = this._getSessionStateKey(s);
      if (stateKey && !this._archivedIds.has(stateKey)) { this._archivedIds.add(stateKey); n++; }
    }
    if (!n) return;
    this._pushUserState(); this._render(); this.app.updateTaskbar();
    showToast(tr('Archived {n} sessions', { n }));
  };

  proto.getCustomName = function(sessionOrKey) { return this._stateMapGet(this._customNames, sessionOrKey); };

  // Programmatic custom-name setter (no prompt) — used e.g. to persist a fork's
  // chosen title once its session id is known. Mirrors renameSession's persist
  // + broadcast + open-window title sync.
  proto.setCustomName = function(sessionOrKey, name) {
    const stateKey = this._getSessionStateKey(sessionOrKey);
    if (!stateKey) return;
    const trimmed = (name || '').trim();
    // lane sidebar-echo-order r14: what this page will not send is refused BEFORE any road carries it — here the window's title too
    if (trimmed) { const no = this._userSync().refuses([{ key: 'customNames', item: stateKey, value: trimmed }]); if (no) { this._sayUserStateWrite('refused', { code: no, local: true }); return; } }
    if (trimmed) this._customNames[stateKey] = trimmed;
    else delete this._customNames[stateKey];
    const legacyId = this._getLegacySessionId(sessionOrKey);
    if (legacyId && legacyId !== stateKey) delete this._customNames[legacyId];
    this._pushUserState(); this._render();
    if (trimmed) this.app.syncSessionName?.(sessionOrKey, trimmed);
  };
  proto.getSessionMode = function(sessionOrKey) { return this._stateMapGet(this._sessionModes, sessionOrKey); };

  proto.setSessionMode = function(sessionOrKey, mode) {
    const stateKey = this._getSessionStateKey(sessionOrKey);
    if (!stateKey) return;
    this._sessionModes[stateKey] = mode;
    const legacyId = this._getLegacySessionId(sessionOrKey);
    if (legacyId && legacyId !== stateKey) delete this._sessionModes[legacyId];
    this._pushUserState();
  };

  // Per-session parameter overrides: { model, effort, permission, account }
  // (only non-empty keys stored)
  proto.getSessionConfig = function(sessionOrKey) { return this._stateMapGet(this._sessionConfigs, sessionOrKey); };

  proto.setSessionConfig = function(sessionOrKey, config) {
    const stateKey = this._getSessionStateKey(sessionOrKey);
    if (!stateKey) return;
    const clean = {};
    // NOTE: this whitelist silently dropped 'account' when it was added in
    // 2.43.0 (the gear's Account pick never saved), 'groupManager' in 2.132.0
    // (the Session Properties toggle never saved), AND 'outputStyle'/'autoResume'
    // in 2.368.0 (the status-bar style pick vanished on resume — FOURTH strike,
    // owner-caught within hours) — keep it in sync with EVERY per-session
    // config writer. Since lane-pool-pin verify r2 this is a CENSUS, not a
    // comment: src/session-schema.js declares every key a resume carries
    // (`config: {key, example}` / SESSION_CONFIG_ONLY) and test-session-schema
    // drives THIS function with each example — a key it drops is red. (Owner ruling 9's
    // 'worktree' is one of the TRI-STATE keys below, not this truthy list.)
    for (const k of ['model', 'effort', 'permission', 'account', 'groupManager', 'modelLock', 'lockModel', 'outputStyle']) {
      if (config?.[k]) clean[k] = config[k];
    }
    // autoResume is TRI-STATE: an explicit false must persist (its whole point
    // is that a per-session OFF beats the global default being ON) — the
    // truthy filter above would erase it.
    if (config?.autoResume === true || config?.autoResume === false) clean.autoResume = config.autoResume;
    // worktree is TRI-STATE for the SAME reason (owner ruling 9, round-2
    // verifier): absent = "no pick on record, the live run answers"
    // (worktreePick), so a truthy-only filter made an explicit UNTICK
    // indistinguishable from never having chosen — the Session Properties box
    // re-checked itself on the next render while the run was isolated, and a
    // fork kept inheriting a preference the user had just revoked.
    if (config?.worktree === true || config?.worktree === false) clean.worktree = config.worktree;
    // tools is OBJECT-valued (lane new-session-form): the conversation's 「可用工具」 pick — claude {allow, deny} lists or
    // codex {sandbox, approval} words — kept by SHAPE (the spawn re-judges it against the harness row on every resume)
    if (config?.tools && typeof config.tools === 'object' && !Array.isArray(config.tools)) {
      const tl = config.tools, words = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);
      const tc = { ...(words(tl.allow).length ? { allow: words(tl.allow) } : {}), ...(words(tl.deny).length ? { deny: words(tl.deny) } : {}), ...(typeof tl.sandbox === 'string' && tl.sandbox ? { sandbox: tl.sandbox } : {}), ...(typeof tl.approval === 'string' && tl.approval ? { approval: tl.approval } : {}) };
      if (Object.keys(tc).length) clean.tools = tc;
    }
    // poolPin is OBJECT-valued ({memberId, at}) — THE CONVERSATION'S POOL PIN (2026-09-28).
    // This map is the pin's RESUME CARRIER (session-lifecycle's billing submenu writes it,
    // resumeSession reads `savedCfg.poolPin`), and the whitelist above dropped it (verify r1,
    // the FIFTH strike of this list): a stopped conversation's pin was never saved while the
    // toast said "Pinned to … — applies when the conversation resumes", and a live one lost
    // its pin at its next resume. Kept by SHAPE, never by truthiness: a pin without a member
    // id is no pin.
    if (config?.poolPin && typeof config.poolPin === 'object' && typeof config.poolPin.memberId === 'string' && config.poolPin.memberId) {
      clean.poolPin = { memberId: config.poolPin.memberId, at: Number(config.poolPin.at) || null, ...(typeof config.poolPin.poolId === 'string' && config.poolPin.poolId ? { poolId: config.poolPin.poolId } : {}) }; // poolId = the pool the pin was MADE on (a resume onto another pool carries no pin)
    }
    if (Object.keys(clean).length) this._sessionConfigs[stateKey] = clean;
    else delete this._sessionConfigs[stateKey];
    const legacyId = this._getLegacySessionId(sessionOrKey);
    if (legacyId && legacyId !== stateKey) delete this._sessionConfigs[legacyId];
    this._pushUserState();
  };

  proto.renameSession = async function(sessionOrKey, currentName) {
    const stateKey = this._getSessionStateKey(sessionOrKey);
    const name = await showInputDialog({
      title: tr('Rename Session'), label: tr('Session name'),
      value: this.getCustomName(sessionOrKey) || currentName || '',
      confirmText: tr('Rename'),
    });
    if (name === null) return;
    if (!stateKey) return;
    // lane sidebar-echo-order r13: what this page will not send is refused BEFORE any road carries it — the ops door's bounds; a harness's
    // ws rename (master's road, no bound) would otherwise store what the page has just said it did not keep
    if (name.trim()) { const no = this._userSync().refuses([{ key: 'customNames', item: stateKey, value: name.trim() }]); if (no) { this._sayUserStateWrite('refused', { code: no, local: true }); return; } }
    if (name.trim()) this._customNames[stateKey] = name.trim();
    else delete this._customNames[stateKey];
    const legacyId = this._getLegacySessionId(sessionOrKey);
    if (legacyId && legacyId !== stateKey) delete this._customNames[legacyId];
    this._pushUserState(); this._render();
    const newName = name.trim() || currentName || (legacyId ? legacyId.substring(0, 12) + '...' : tr('Session'));
    // Write the new name back into the AGENT's own store only where the
    // harness HAS one (§2.13 `renameWriteback` — codex's thread name; claude's
    // JSONL carries no title, so a rename stays ours). This is the TRIGGER half
    // of the capability and the ws case is the action half (ws-handler.js
    // `rename-session`, which also writes session.name + session-meta and
    // broadcasts): both must read the same row, or the first harness whose row
    // flips to true gets a server ready to write and a client that never asks
    // — the mirror image of the round-2 fork defect (button on caps, handler on
    // an id). Never a backend id.
    if (backendFeatureCaps(sessionOrKey?.backend).renameWriteback && name.trim()) this.app.renameBackendSession?.(sessionOrKey, name.trim());
    this.app.syncSessionName(sessionOrKey, newName);
  };

}

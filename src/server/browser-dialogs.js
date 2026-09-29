'use strict';
/**
 * THE DIALOG WATCH — ORCH (lane browser-stuck, 2026-09-28; the owner's ruling "让agent知道这个对话框的存在和交互能力").
 *
 * ONE browser-endpoint CDP socket per LIVE LOCAL browser the keeper runs (a named profile or a managed ephemeral one),
 * attached to EVERY page tab (`Target.setDiscoverTargets` + `Target.attachToTarget {flatten}` + `Page.enable`) BEFORE
 * any dialog opens — measured on 0.38.1 + Chrome 153 (scripts/measure-dialog-hold.mjs): only a client whose Page domain
 * was enabled WHEN a dialog opened can see or answer it (a newcomer's Page.enable never answers, and its
 * handleJavaScriptDialog says "No dialog is showing"); a daemon that restarts under an open dialog never recovers
 * ("tab is not responding" after 16 s, for good) — this socket can still answer it. Armed at `/resolve` (before the
 * verb spawns — bounded) and by the live view's relay; the raw endpoint never leaves the server.
 *
 * What it does with a dialog (PURE src/browser-stuck.js decides): an alert is ACCEPTED at once and the conversation's
 * next result mentions it; confirm / prompt / beforeunload (and any newer kind) are HELD — `open` for the routes (the
 * verb in flight returns `dialog_open` at the event, every later verb repeats it), the live view (Accept / Dismiss),
 * the browser fact (the chip), and, when the conversation runs no verb, ONE free next-turn notice (never a wake).
 * An answer is `Page.handleJavaScriptDialog` on THIS socket's session for that tab (`answer`), stamped with WHO
 * answered (agent / user / auto); an answer by the user or an auto-accept is told to the conversation ONCE.
 *
 * Which conversation a tab's dialog is FOR (`scopeFor`): the tab its live-view relay shows as active (the stream's own
 * `tabs` record, via the injected `tabsOf`), else every tab of its own ephemeral browser, else every tab of a named
 * profile only ONE conversation holds; a shared profile with no known tab attributes nothing (the page's message is
 * that page's content — never another conversation's; the CLI then falls back to the browser CLI's own lines).
 *
 * THE STUCK VERDICT (the brief's step 4): the routes note every verb's outcome (`noteOutcome`); 3 consecutive timeouts
 * on one browser — or a tab whose Page.enable this watch never got answered (`heldAt`) — ⇒ `unresponsive`, a FACT the
 * keeper's `factFor` carries (`setStuckSource`); a restart / stop of the browser clears it. Never an automatic kill
 * (the keepers-report-never-kill law): the Restart is the user's.
 */
const ST = require('../browser-stuck.js');
let WS = null; try { WS = require('ws').WebSocket; } catch { WS = null; }

const ANSWERED_KEEP = 32;
const OUTCOMES_KEEP = 16;
const VERB_RUNNING_MAX_MS = 5 * 60 * 1000;   // a /resolve without its audit is forgotten after this (a crashed CLI)
const RE_ENABLE_MS = 30 * 1000;              // a held tab's Page.enable is asked again (it answers once the hold ends)

function create({ keeper = null, WebSocketImpl = WS, log = console, now = Date.now,
  enableTimeoutMs = ST.ENABLE_TIMEOUT_MS, connectTimeoutMs = 3000, callTimeoutMs = 5000,
  tabsOf = null, holdersOf = null, leaseCountOf = null, labelOf = null, notice = null, withdraw = null } = {}) {
  const watches = new Map();       // profileId → watch
  const listeners = new Set();
  const waiters = new Set();       // long-polls: {profileId, scope(), resolve}
  const told = new Map();          // browserKey → Set(answered id) — a note is told once
  const noticed = new Map();       // browserKey → Set(dialog id) — the idle notice is queued once
  const noticedSessions = new Map(); // dialog id → Set(sessionId) — verify r1: a notice whose dialog closed before the agent's turn is withdrawn
  const running = new Map();       // browserKey → {n, at} — verbs between /resolve and /audit (rule 6's idle test)
  const outcomes = new Map();      // `${profileId}|${browserKey}` → [{at, state}] — verify r1: a conversation's OWN run (a shared
                                   // profile's other conversation timing out is not "your last 3 commands")
  const okey = (pid, bk) => `${pid}|${bk || ''}`;
  const dropOutcomes = (pid) => { let n = 0; for (const k of [...outcomes.keys()]) if (k.startsWith(pid + '|')) { outcomes.delete(k); n++; } return n; };
  /** The worst run on a browser across its conversations (the panel row / the chip of a browser, kinds only). */
  const browserVerdict = (pid, tabHeld) => { let best = ST.stuckVerdict([], { tabHeld }); if (best.state === 'unresponsive') return best; for (const [k, list] of outcomes) if (k.startsWith(pid + '|')) { const v = ST.stuckVerdict(list); if (v.state === 'unresponsive' && (best.state !== 'unresponsive' || v.count > best.count)) best = v; } return best; };
  let tabsFn = typeof tabsOf === 'function' ? tabsOf : null;
  const sayOnce = new Set();
  const say = (key, line) => { if (sayOnce.has(key)) return; sayOnce.add(key); try { log.warn?.(`[browser-dialog] ${line}`); } catch { /* */ } };

  function emit(ev) { for (const fn of [...listeners]) { try { fn(ev); } catch (e) { say('listener:' + (e && e.message), `a listener threw: ${e && e.message}`); } } }
  /** verify r1 (lane browser-stuck, A3/A6): the idle notice of a dialog that closed is withdrawn — the agent's next verb
   *  says how it was answered instead; a stale "the page will not move" never rides its next turn. */
  function withdrawNotices(ids) {
    for (const id of ids) {
      const ss = noticedSessions.get(id); if (!ss) continue;
      noticedSessions.delete(id);
      if (withdraw) for (const sid of ss) { try { withdraw(sid, id); } catch (e) { say('withdraw:' + (e && e.message), `a dialog notice was not withdrawn — ${e && e.message}`); } }
    }
    if (noticedSessions.size > 512) for (const k of [...noticedSessions.keys()].slice(0, 256)) noticedSessions.delete(k);
  }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  // ── the socket ──
  function newWatch(profileId, url) {
    const w = { profileId, url, holds: true, ws: null, state: 'connecting', id: 0, waiting: new Map(), sessions: new Map(), targets: new Map(), open: new Map(), pendingBy: new Map(), answered: [], seq: 0, readyP: null };
    let readyResolve;
    w.readyP = new Promise((r) => { readyResolve = r; });
    w.ready = () => readyResolve();
    return w;
  }
  function call(w, method, params = {}, sessionId = null, timeoutMs = callTimeoutMs) {
    return new Promise((resolve) => {
      if (!w.ws || w.ws.readyState !== 1) return resolve({ error: { message: 'the watch is not connected' } });
      const id = ++w.id;
      const t = setTimeout(() => { if (w.waiting.delete(id)) resolve({ timeout: true }); }, timeoutMs);
      if (t.unref) t.unref();
      w.waiting.set(id, (m) => { clearTimeout(t); resolve(m); });
      try { w.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); } catch (e) { w.waiting.delete(id); clearTimeout(t); resolve({ error: { message: String(e && e.message) } }); }
    });
  }
  function connect(w) {
    if (!WebSocketImpl) { w.state = 'down'; w.ready(); return; }
    let ws;
    try { ws = new WebSocketImpl(w.url, { perMessageDeflate: false, handshakeTimeout: connectTimeoutMs, maxPayload: 16 * 1024 * 1024 }); } catch (e) { w.state = 'down'; w.ready(); say('connect:' + w.profileId, `${w.profileId}: the watch could not connect — ${e && e.message}`); return; }
    w.ws = ws;
    ws.on('open', async () => {
      w.state = 'open';
      await call(w, 'Target.setDiscoverTargets', { discover: true });
      const r = await call(w, 'Target.getTargets');
      const infos = (r && r.result && Array.isArray(r.result.targetInfos)) ? r.result.targetInfos : [];
      await Promise.all(infos.map((t) => track(w, t)));
      w.ready();
    });
    ws.on('message', (d) => onMessage(w, d));
    ws.on('error', (e) => { say('err:' + w.profileId + ':' + (e && e.code), `${w.profileId}: the watch's socket failed — ${e && e.message}`); });
    ws.on('close', () => down(w, 'the browser\'s CDP socket closed'));
  }
  function down(w, why, { keepNotices = false } = {}) {
    if (w.state === 'down') return;
    w.state = 'down';
    w.ready();
    for (const fn of w.waiting.values()) { try { fn({ error: { message: why } }); } catch { /* */ } }
    w.waiting.clear();
    const open = [...w.open.values()];
    w.open.clear();
    if (watches.get(w.profileId) === w) watches.delete(w.profileId);
    for (const e of w.targets.values()) if (e.reEnable) { clearTimeout(e.reEnable); e.reEnable = null; }
    emit({ kind: 'down', profileId: w.profileId, why, closed: open.map((d) => d.id) });
    if (!keepNotices) withdrawNotices(open.map((d) => d.id)); // a VibeSpace shutdown keeps them: the dialog is still open in Chrome
  }
  /** One page tab: attach (flat session) + Page.enable — the enable bounded; a tab that never answers is HELD. */
  function track(w, info) {
    if (!info || info.type !== 'page' || !info.targetId) return Promise.resolve();
    const tid = String(info.targetId);
    const known = w.targets.get(tid);
    if (known) { known.url = String(info.url || known.url || ''); known.title = String(info.title || known.title || ''); return known.enabling || Promise.resolve(); }
    const e = { targetId: tid, url: String(info.url || ''), title: String(info.title || ''), sid: null, enabled: false, heldAt: 0, enabling: null, reEnable: null };
    w.targets.set(tid, e);
    e.enabling = (async () => {
      const a = await call(w, 'Target.attachToTarget', { targetId: tid, flatten: true });
      if (!a || !a.result || !a.result.sessionId) return;
      e.sid = String(a.result.sessionId);
      w.sessions.set(e.sid, tid);
      await enable(w, e);
    })();
    return e.enabling;
  }
  async function enable(w, e) {
    const en = await call(w, 'Page.enable', {}, e.sid, enableTimeoutMs);
    if (en && !en.timeout && !en.error) {
      const was = e.heldAt;
      e.enabled = true; e.heldAt = 0;
      if (was) emit({ kind: 'held-cleared', profileId: w.profileId, targetId: e.targetId });
      return;
    }
    if (en && en.timeout && w.state === 'open' && w.targets.get(e.targetId) === e) {
      // measured: a tab whose dialog opened before this socket was enabled never answers Page.enable — nothing in
      // VibeSpace can see or answer that dialog; the page is HELD (the unresponsive fact, the user's Restart)
      if (!e.heldAt) { e.heldAt = now(); emit({ kind: 'held', profileId: w.profileId, targetId: e.targetId }); }
      e.reEnable = setTimeout(() => { e.reEnable = null; if (w.state === 'open' && w.targets.get(e.targetId) === e && !e.enabled) enable(w, e); }, RE_ENABLE_MS);
      if (e.reEnable.unref) e.reEnable.unref();
    }
  }
  function onMessage(w, d) {
    let m; try { m = JSON.parse(typeof d === 'string' ? d : d.toString()); } catch { return; }
    if (m.id && w.waiting.has(m.id)) { const fn = w.waiting.get(m.id); w.waiting.delete(m.id); fn(m); return; }
    const p = m.params || {};
    switch (m.method) {
      case 'Target.targetCreated': case 'Target.targetInfoChanged': track(w, p.targetInfo); return;
      case 'Target.targetDestroyed': {
        const tid = String(p.targetId || '');
        const e = w.targets.get(tid);
        if (!e) return;
        w.targets.delete(tid); if (e.sid) w.sessions.delete(e.sid); if (e.reEnable) clearTimeout(e.reEnable);
        const dlg = w.open.get(tid);
        if (dlg) { w.open.delete(tid); emit({ kind: 'closed', profileId: w.profileId, targetId: tid, answered: { id: dlg.id, dialog: dlg, how: 'dismissed', by: 'tab-closed', at: now(), targetId: tid } }); withdrawNotices([dlg.id]); }
        return;
      }
      case 'Target.detachedFromTarget': { const sid = String(p.sessionId || ''); const tid = w.sessions.get(sid); w.sessions.delete(sid); const e = tid && w.targets.get(tid); if (e && e.sid === sid) { e.sid = null; e.enabled = false; } return; }
      // verify r1 A7: a main-frame navigation IN FLIGHT (started, not committed) — a timeout then is the network's
      // verify r2 #5: `navFirst` = the first start of a RUN of navigations none of which committed (a page that starts a new
      // one every 20 s is ONE run — a per-start clock never reached the grace: never hung, never told), `navCount` its size
      case 'Page.frameStartedNavigating': { const e = tabOf(w, m); if (e && String(p.frameId || '') === e.targetId && !/samedocument/i.test(String(p.navigationType || ''))) { const t = now(); if (!e.navSince) { e.navFirst = t; e.navCount = 0; } e.navSince = t; e.navCount = (e.navCount || 0) + 1; e.navUrl = String(p.url || ''); } return; }
      case 'Page.frameNavigated': { const e = tabOf(w, m); if (e && p.frame && String(p.frame.id || '') === e.targetId && !p.frame.parentId) endNav(e); return; }
      case 'Page.navigatedWithinDocument': case 'Page.frameStoppedLoading': { const e = tabOf(w, m); if (e && String(p.frameId || '') === e.targetId) endNav(e); return; }
      case 'Page.javascriptDialogOpening': return onOpen(w, w.sessions.get(String(m.sessionId || '')) || null, p);
      case 'Page.javascriptDialogClosed': return onClosed(w, w.sessions.get(String(m.sessionId || '')) || null, p);
      default: return;
    }
  }
  function tabOf(w, m) { const tid = w.sessions.get(String(m.sessionId || '')); return tid ? w.targets.get(tid) || null : null; }
  function endNav(e) { e.navSince = 0; e.navFirst = 0; e.navCount = 0; }
  /** verify r1 A7: a navigation in flight on a tab in scope → {url, since, last, count, over}. verify r2 #5: `since` = the
   *  run's FIRST start and the grace is measured from it (`over` past it — the timeouts count again); the words with the
   *  time so far reach the agent at every timeout during the run (never silence). */
  function loadingIn(profileId, scope) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open') return null;
    const t = now();
    for (const e of w.targets.values()) if (e.navSince && inScope(scope, e.targetId)) { const since = e.navFirst || e.navSince; return { url: ST.pageText(e.navUrl, 300), since, last: e.navSince, count: e.navCount || 1, over: t - since >= ST.LOADING_GRACE_MS, at: t }; }
    return null;
  }
  function onOpen(w, tid, params) {
    if (!tid) return;
    const t = now();
    const d = ST.dialogFromCdp(params, { targetId: tid, now: t, seq: ++w.seq });
    const e = w.targets.get(tid); if (e && !d.url) d.url = ST.pageText(e.url, 300);
    w.open.set(tid, d);
    // a browser whose daemons still auto-accept (launched before the lane): alert + beforeunload are theirs to close in
    // ms — never a held dialog for the verb or the view; its close is told as the browser's (the typed draft is gone)
    if (!w.holds && (d.type === 'alert' || d.type === 'beforeunload')) { d.byBrowser = true; w.pendingBy.set(tid, { by: 'browser', accept: true }); return; }
    // verify r2 #2 (b): while the USER drives this browser an alert is theirs to read and release — held for them (the live
    // view's OK), never accepted under their hands (their own click's "card declined" was answered in ms, the text unseen)
    if (d.type === 'alert' && userDrives(w.profileId)) { d.forUser = true; held(w, tid, d); return; }
    // verify r1 A3: the tab's auto-accept budget (a sliding window) — past it the alert is held and said
    const recent = e ? (e.autoAt = (e.autoAt || []).filter((x) => t - x < ST.AUTO_ACCEPT_WINDOW_MS)).length : 0;
    const v = ST.autoAnswerVerdict(d, { recent });
    if (v.auto) {
      if (e) e.autoAt.push(t);
      // verify r1 A3: an alert being accepted is never "open" to a verb or a view for the ms it takes (a 20 MiB alert
      // took long enough that its own click answered [dialog_open]); an accept that FAILS leaves it held, and said
      d.autoPending = true;
      answerOn(w, tid, { accept: true, by: 'auto' }).then((r) => {
        d.autoPending = false;
        if (!r.ok && w.open.get(tid) === d) { say('auto:' + r.code, `${w.profileId}: an alert could not be accepted — ${r.error}`); held(w, tid, d); }
      });
      return;
    }
    if (v.storm) { d.storm = v.storm; say('storm:' + w.profileId + ':' + tid, `${w.profileId}: a page opened ${v.storm} alerts within ${ST.AUTO_ACCEPT_WINDOW_MS / 1000} s on tab ${tid} — the next is held (the page's script stops until it is answered)`); }
    held(w, tid, d);
  }
  /** verify r2 #2 (b): does the user drive this browser now (a takeover on any lease of it)? The keeper's own input state
   *  per holder — the route's `browser_interrupted` question, asked of every conversation on the browser. */
  function userDrives(pid) {
    if (!keeper || typeof keeper.inputStateFor !== 'function' || !holdersOf) return false;
    let hs = []; try { hs = holdersOf(pid) || []; } catch { hs = []; }
    // the .197 integration: the user's own browsing row (browse-yourself) carries its own side — his input is not a lease's
    return hs.some((h) => { try { if (h && h.human) return h.input === 'user'; const st = h && keeper.inputStateFor(h.browserKey, h.ephemeral ? null : pid); return !!(st && st.input === 'user'); } catch { return false; } });
  }
  /** A dialog that waits for a decision: the event (the view, the fact), the waiting verbs, the idle notices. */
  function held(w, tid, d) {
    emit({ kind: 'open', profileId: w.profileId, targetId: tid, dialog: d });
    for (const x of [...waiters]) if (x.profileId === w.profileId && inScope(x.scope(), tid)) { waiters.delete(x); x.resolve({ dialog: d, via: 'event', at: now() }); }
    idleNotices(w, tid, d);
  }
  function onClosed(w, tid, params) {
    if (!tid) return;
    const d = w.open.get(tid) || null;
    w.open.delete(tid);
    const pend = w.pendingBy.get(tid) || null; w.pendingBy.delete(tid);
    const a = { id: d ? d.id : `dlg-closed-${++w.seq}`, dialog: d, how: params && params.result ? 'accepted' : 'dismissed', by: pend ? pend.by : 'unknown', at: now(), targetId: tid };
    if (d) { w.answered.push(a); if (w.answered.length > ANSWERED_KEEP) w.answered.splice(0, w.answered.length - ANSWERED_KEEP); }
    emit({ kind: 'closed', profileId: w.profileId, targetId: tid, answered: a });
    if (d) withdrawNotices([d.id]);
  }
  async function answerOn(w, tid, { accept, text = null, by }) {
    const d = w.open.get(tid);
    if (!d) return { ok: false, code: 'no_dialog', error: ST.NO_DIALOG_TEXT };
    const e = w.targets.get(tid);
    if (!e || !e.sid) return { ok: false, code: 'not_watched', error: 'VibeSpace is not attached to that tab' };
    w.pendingBy.set(tid, { by, accept: !!accept });
    const r = await call(w, 'Page.handleJavaScriptDialog', { accept: !!accept, ...(accept && text != null ? { promptText: String(text) } : {}) }, e.sid);
    if (!r || r.timeout || r.error) { w.pendingBy.delete(tid); return { ok: false, code: 'answer_failed', error: r && r.error ? String(r.error.message || 'refused') : 'the browser did not answer' }; }
    return { ok: true, dialog: d };
  }

  // ── arming ──
  /** Arm the watch on a LOCAL live browser (idempotent; a down watch re-resolves the endpoint — the browser may have
   *  restarted on a new port). Waits at most `budgetMs` for the tabs to be enabled — never holds a verb longer. */
  async function arm(profileId, { budgetMs = 800 } = {}) {
    const pid = String(profileId || '');
    if (!pid || !keeper || typeof keeper.cdpEndpointFor !== 'function') return { ok: false, code: 'not_watched', error: 'no keeper' };
    let w = watches.get(pid);
    if (!w || w.state === 'down') {
      let ep = null;
      try { ep = await keeper.cdpEndpointFor(pid, { fresh: !!w }); } catch (e) { ep = { ok: false, error: e && e.message }; }
      if (!ep || !ep.ok || !ep.url) return { ok: false, code: 'not_watched', error: (ep && ep.error) || 'no CDP endpoint' };
      w = watches.get(pid);
      if (!w || w.state === 'down') { w = newWatch(pid, ep.url); watches.set(pid, w); connect(w); }
    }
    // does this browser HOLD dialogs? (a browser launched before the lane: its daemons still accept alert + beforeunload
    // themselves — those are left to them and said after, never reported open for the few ms they are)
    try { w.holds = typeof keeper.holdsDialogsFor === 'function' ? keeper.holdsDialogsFor(pid) !== false : true; } catch { w.holds = true; }
    let t = null;
    await Promise.race([w.readyP, new Promise((r) => { t = setTimeout(r, budgetMs); if (t.unref) t.unref(); })]);
    if (t) clearTimeout(t);
    return { ok: w.state === 'open', code: w.state === 'open' ? null : 'not_watched', watched: w.state === 'open' };
  }
  function disarm(profileId, why = 'the browser stopped') {
    const w = watches.get(String(profileId || ''));
    dropOutcomes(String(profileId || ''));
    if (!w) return;
    try { w.ws && w.ws.close(1000); } catch { /* closing */ }
    down(w, why);
  }

  // ── which conversation a tab's dialog is for ──
  function inScope(scope, tid) { return scope === null || (scope instanceof Set && scope.has(tid)); }
  /** null = every tab of that browser; a Set = these tabs only (empty = none attributed). */
  function scopeFor({ profileId, browserKey = null, sessionId = null, ephemeral = false } = {}) {
    let tabs = null;
    if (tabsFn) { try { tabs = tabsFn({ sessionId, browserKey, profileId }); } catch { tabs = null; } }
    if (Array.isArray(tabs) && tabs.filter(Boolean).length) return new Set(tabs.filter(Boolean).map(String));
    if (ephemeral) return null;
    let n = 1; if (leaseCountOf) { try { n = Number(leaseCountOf(profileId)) || 0; } catch { n = 1; } }
    return n <= 1 ? null : new Set();
  }
  function openIn(profileId, scope) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open') return null;
    let best = null;
    for (const [tid, d] of w.open) if (!d.byBrowser && !d.autoPending && inScope(scope, tid) && (!best || d.openedAt < best.openedAt)) best = d;
    return best;
  }
  /** The live view's question: the dialog open on these tabs (null = any tab of that browser), as a block. */
  function openOn(profileId, targets = null) {
    const d = openIn(profileId, Array.isArray(targets) ? new Set(targets.filter(Boolean).map(String)) : null);
    return d ? ST.dialogBlock(d, { now: now() }) : null;
  }
  /** verify r1 A5: a tab in scope this watch has NOT seen into (its Page.enable not answered yet, or never — a dialog
   *  that opened before the watch attached, e.g. across a VibeSpace restart: measured, a newcomer's Page.enable never
   *  answers under an open dialog). The watch cannot see a dialog there; the lease's own daemon may have. */
  function blindIn(profileId, scope) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open') return null;
    for (const e of w.targets.values()) if (!e.enabled && inScope(scope, e.targetId)) return { targetId: e.targetId, held: !!e.heldAt };
    return null;
  }
  function heldIn(profileId, scope) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open') return null;
    for (const e of w.targets.values()) if (e.heldAt && inScope(scope, e.targetId)) return { at: e.heldAt, targetId: e.targetId };
    return null;
  }

  /**
   * THE FACT a conversation's verb reads (the /resolve answer, the audit answer, `dialog status`): the open dialog in
   * its scope (with the sentence), the notes it was not told yet (an alert accepted, a user's answer) — CONSUMED here,
   * told once — and the unresponsive words. `consume:false` = look without telling.
   */
  function factFor({ profileId, browserKey = '', sessionId = null, ephemeral = false, consume = true } = {}) {
    const pid = String(profileId || '');
    const w = watches.get(pid);
    const watched = !!(w && w.state === 'open');
    const scope = scopeFor({ profileId: pid, browserKey, sessionId, ephemeral });
    const d = watched ? openIn(pid, scope) : null;
    const t = now();
    const notes = [];
    if (watched && browserKey) {
      let seen = told.get(browserKey); if (!seen) { seen = new Set(); told.set(browserKey, seen); }
      const alerts = [];
      for (const a of w.answered) {
        if (seen.has(a.id) || !inScope(scope, a.targetId)) continue;
        if (consume) seen.add(a.id);
        if (a.dialog && a.dialog.type === 'alert' && (a.by === 'auto' || a.by === 'browser')) { alerts.push(a); continue; } // verify r1 A3: said together below
        const words = ST.answeredNote(a);
        if (words) notes.push(words);
      }
      // verify r1 A3: a few alerts are told one by one (the ruling's mention); a storm is ONE line, never 32
      if (alerts.length > ST.ALERT_NOTES_MAX) notes.unshift(ST.alertsNote(alerts));
      else notes.unshift(...alerts.map((a) => ST.answeredNote(a)).filter(Boolean));
      if (seen.size > 256) { const keep = [...seen].slice(-128); told.set(browserKey, new Set(keep)); }
    }
    const verdict = ST.stuckVerdict(outcomes.get(okey(pid, browserKey)) || [], { tabHeld: watched ? heldIn(pid, scope) : null });
    return {
      watched,
      // verify r1 A5: what the watch CANNOT say — a tab in scope it has not seen into (`blind`), or a shared browser
      // whose conversation's tab it does not know (`unattributed`); then a dialog may be open that only the lease's own
      // daemon saw — the routes hand the dialog verbs to it, the CLI reads its lines
      blind: watched && !d ? !!blindIn(pid, scope) : false,
      loading: watched && !d ? loadingIn(pid, scope) : null, // verify r1 A7
      unattributed: watched && !d && scope instanceof Set && scope.size === 0,
      open: d ? ST.dialogBlock(d, { now: t }) : null,
      text: d ? ST.dialogText(d, { now: t, repeat: true }) : '',
      targetId: d ? d.targetId : null,
      notes,
      stuck: !d && verdict.state === 'unresponsive' ? { ...verdict, text: ST.stuckAgentText(verdict) } : null,
    };
  }
  /** The conversation-level stuck fact (the keeper's `factFor` → the chip / the row): across its browsers. */
  function stuckForKey(browserKey) {
    if (!keeper || !browserKey) return null;
    const bk = String(browserKey);
    let set = null; try { set = keeper.setFor(bk); } catch { set = null; }
    const cands = [];
    for (const a of (set && set.attachments) || []) cands.push({ profileId: a.profileId, ephemeral: false });
    let e = null; try { e = keeper.ephemeralFor ? keeper.ephemeralFor(bk) : null; } catch { e = null; }
    if (e && e.profileId) cands.push({ profileId: e.profileId, ephemeral: true, sessionId: e.sessionId || null });
    for (const c of cands) {
      const f = factFor({ ...c, browserKey: bk, consume: false });
      const fact = ST.stuckFact({ dialog: f.open ? { ...f.open, id: f.open.id } : null, verdict: f.stuck, now: now() });
      if (fact) return { ...fact, profileId: c.profileId };
    }
    return null;
  }

  // ── the verb in flight (rule 1) ──
  /** Resolve at the first HELD dialog that opens in the conversation's scope (or is already open) — the long-poll the
   *  CLI keeps while its verb runs; null at `ms`. The bound is the event, never a clock. */
  function waitForOpen({ profileId, browserKey = '', sessionId = null, ephemeral = false } = {}, ms = 20000, { signal = null } = {}) {
    const pid = String(profileId || '');
    const scope = () => scopeFor({ profileId: pid, browserKey, sessionId, ephemeral });
    const d = openIn(pid, scope());
    if (d) return Promise.resolve({ dialog: d, via: 'already-open', at: now() });
    return new Promise((resolve) => {
      let t = null;
      const x = { profileId: pid, scope, resolve: (v) => { if (t) clearTimeout(t); resolve(v); } };
      waiters.add(x);
      t = setTimeout(() => { if (waiters.delete(x)) resolve(null); }, Math.max(0, Math.min(Number(ms) || 0, 60000)));
      if (t.unref) t.unref();
      // the asker went away (the CLI's verb ended, its request aborted) ⇒ the waiter goes too
      if (signal) { if (signal.aborted) { waiters.delete(x); clearTimeout(t); resolve(null); } else signal.addEventListener('abort', () => { if (waiters.delete(x)) { clearTimeout(t); resolve(null); } }, { once: true }); }
    });
  }
  function verbStarted(browserKey) { if (!browserKey) return; const r = running.get(browserKey) || { n: 0, at: 0 }; running.set(browserKey, { n: r.n + 1, at: now() }); }
  function verbEnded(browserKey) { if (!browserKey) return; const r = running.get(browserKey); if (!r) return; if (r.n <= 1) running.delete(browserKey); else running.set(browserKey, { n: r.n - 1, at: r.at }); }
  function verbRunning(browserKey) { const r = running.get(browserKey); if (!r) return false; if (now() - r.at > VERB_RUNNING_MAX_MS) { running.delete(browserKey); return false; } return r.n > 0; }

  /** Rule 6: a dialog that opened while a holder of this browser ran NO verb ⇒ ONE free next-turn notice (never a wake). */
  function idleNotices(w, tid, d) {
    if (!notice || !holdersOf) return;
    let hs = []; try { hs = holdersOf(w.profileId) || []; } catch { hs = []; }
    for (const h of hs) {
      if (!h || !h.browserKey || !h.sessionId || verbRunning(h.browserKey)) continue;
      if (!inScope(scopeFor({ profileId: w.profileId, browserKey: h.browserKey, sessionId: h.sessionId, ephemeral: !!h.ephemeral }), tid)) continue;
      let seen = noticed.get(h.browserKey); if (!seen) { seen = new Set(); noticed.set(h.browserKey, seen); }
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      let label = null; try { label = labelOf ? labelOf(w.profileId) : null; } catch { label = null; }
      try { notice(h.sessionId, { kind: 'browser-dialog', dialog: ST.dialogBlock(d, { now: now() }), label: h.ephemeral ? null : label }); let ss = noticedSessions.get(d.id); if (!ss) { ss = new Set(); noticedSessions.set(d.id, ss); } ss.add(h.sessionId); } catch (e) { say('notice:' + (e && e.message), `the idle dialog notice was not queued — ${e && e.message}`); }
    }
  }

  // ── answers ──
  /** Answer the dialog open in the conversation's scope (the agent's `dialog accept|dismiss`, the live view's buttons). */
  async function answer({ profileId, browserKey = '', sessionId = null, ephemeral = false, targetId = null, dialogId = null } = {}, { accept, text = null, by = 'agent' } = {}) {
    const pid = String(profileId || '');
    const w = watches.get(pid);
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    let tid = targetId ? String(targetId) : null;
    if (!tid && dialogId) for (const [t, d] of w.open) if (d.id === dialogId) tid = t;
    if (!tid) { const d = openIn(pid, scopeFor({ profileId: pid, browserKey, sessionId, ephemeral })); tid = d ? d.targetId : null; }
    if (!tid) return { ok: false, code: 'no_dialog', error: ST.NO_DIALOG_TEXT };
    if (dialogId) { const d = w.open.get(tid); if (!d || d.id !== dialogId) return { ok: false, code: 'no_dialog', error: 'that dialog is no longer open' }; }
    const r = await answerOn(w, tid, { accept, text, by });
    if (r.ok && by === 'agent' && browserKey) { let seen = told.get(browserKey); if (!seen) { seen = new Set(); told.set(browserKey, seen); } seen.add(r.dialog.id); }
    return r.ok ? { ok: true, dialog: ST.dialogBlock(r.dialog, { now: now() }), text: ST.answerDoneText(r.dialog, { accept: !!accept, text }) } : r;
  }

  // ── outcomes (the stuck verdict) ──
  function noteOutcome(profileId, { state, at = now(), browserKey = '' } = {}) {
    const pid = String(profileId || ''); if (!pid || !state) return;
    const k = okey(pid, browserKey);
    const list = outcomes.get(k) || [];
    const before = ST.stuckVerdict(list).state;
    list.push({ at, state }); if (list.length > OUTCOMES_KEEP) list.splice(0, list.length - OUTCOMES_KEEP);
    outcomes.set(k, list);
    if (outcomes.size > 1024) outcomes.delete(outcomes.keys().next().value);
    if (ST.stuckVerdict(list).state !== before) emit({ kind: 'stuck', profileId: pid, state: ST.stuckVerdict(list).state });
  }
  function resetOutcomes(profileId) { if (dropOutcomes(String(profileId || ''))) emit({ kind: 'stuck', profileId: String(profileId), state: 'ok' }); }

  /** The Agent browser panel's per-browser row fact (the keeper's digest extra): a HELD dialog on any of its tabs, else
   *  the unresponsive verdict. Kinds and reasons only — never a page's message (the digest also reaches agents). */
  function pageStuckMap() {
    const out = {};
    for (const [pid, w] of watches) {
      if (w.state !== 'open') continue;
      const d = openIn(pid, null);
      if (d) { out[pid] = { state: 'dialog', type: d.type, since: d.openedAt }; continue; }
      const v = browserVerdict(pid, heldIn(pid, null));
      if (v.state === 'unresponsive') out[pid] = { state: 'unresponsive', why: v.why, count: v.count || 0, since: v.since || 0 };
    }
    return out;
  }
  function setTabsOf(fn) { tabsFn = typeof fn === 'function' ? fn : null; }
  function stats() { return [...watches.values()].map((w) => ({ profileId: w.profileId, state: w.state, tabs: w.targets.size, enabled: [...w.targets.values()].filter((e) => e.enabled).length, held: [...w.targets.values()].filter((e) => e.heldAt).length, open: [...w.open.values()].map((d) => ({ id: d.id, type: d.type })), answered: w.answered.length })); }
  function shutdown() { for (const w of [...watches.values()]) { try { w.ws && w.ws.close(1001); } catch { /* */ } down(w, 'the server is restarting', { keepNotices: true }); } for (const x of waiters) x.resolve(null); waiters.clear(); }

  // the keeper's own lease seam: a browser that starts again or stops starts a fresh watch and a fresh verdict
  let unsubLease = null;
  if (keeper && typeof keeper.onLease === 'function') {
    unsubLease = keeper.onLease((ev) => {
      if (!ev || !ev.profileId) return null;
      if (ev.kind === 'browser-stopped') disarm(ev.profileId, 'the browser stopped');
      else if (ev.kind === 'browser-ready') { resetOutcomes(ev.profileId); const w = watches.get(String(ev.profileId)); if (w) { try { w.ws && w.ws.close(1000); } catch { /* */ } down(w, 'the browser started again'); } }
      return null;
    });
  }

  return { arm, disarm, factFor, openOn, stuckForKey, pageStuckMap, waitForOpen, answer, noteOutcome, resetOutcomes, verbStarted, verbEnded, verbRunning, scopeFor, onChange, setTabsOf, stats,
    shutdown: () => { shutdown(); try { unsubLease?.(); } catch { /* */ } }, _watches: watches };
}

module.exports = { create, ANSWERED_KEEP, OUTCOMES_KEEP, VERB_RUNNING_MAX_MS, RE_ENABLE_MS };

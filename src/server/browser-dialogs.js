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
 * verify r2 (site-reset): + THE CREATION WITNESS — a tab born of NO page (its `tab new`, the page it gets on attach) while
 * exactly ONE conversation's verb is in flight on the browser is that conversation's (`e.owner`, `witnessedTabs`); verify r3
 * #1: a tab a PAGE opened (`openerId` on the CDP event — set even under `noopener`, measured on 0.38.1) is its OPENER's
 * holder's (`openerOwner`: the keeper's naming of the opener, else the opener's witness, else nobody's) — never the verb in
 * flight (a stranger's popup, born during A's verb, was A's); the keeper's own naming of a tab for another holder wins at
 * every read.
 *
 * THE STUCK VERDICT (the brief's step 4): the routes note every verb's outcome (`noteOutcome`); 3 consecutive timeouts
 * on one browser — or a tab whose Page.enable this watch never got answered (`heldAt`) — ⇒ `unresponsive`, a FACT the
 * keeper's `factFor` carries (`setStuckSource`); a restart / stop of the browser clears it. Never an automatic kill
 * (the keepers-report-never-kill law): the Restart is the user's.
 *
 * THE NAVIGATION LOOP (lane site-reset, 2026-09-30 — userW's pod: a stale login bounced a bank's login page and its app
 * for ever and every verb timed out): the same socket records every tab's MAIN-FRAME navigations (the last ST.LOOP_KEEP,
 * each with the renderer's own request reason — `frameRequestedNavigation` — or none for a browser-initiated one) and asks
 * PURE `ST.navigationLoopVerdict` at every hop. A loop JUDGED wakes the verb in flight exactly like a held dialog (the
 * CLI's long-poll, `loop: {after}` — a navigation verb only by a loop that began after its own hop), stands in the
 * conversation's fact (the chip, the live view, the panel row) and is told on every page-waiting verb while it stands; it
 * ends at the agent's own navigation, at a `stop` (`stopTab`: Page.stopLoading on the agent's tab, answered in ms —
 * measured) or after ST.LOOP_QUIET_MS of quiet. The agent's page-acting commands are stamped per browser
 * (`verbStarted(key, {profileId, verb})`): a page turn soon after one is the agent's, never the page's loop. The same
 * socket clears one site's stored login (`clearSite` — lane site-reset step 2): the cookies that reach the host
 * (`Storage.getCookies` + `Network.deleteCookies` per cookie, never `clearBrowserCookies`), `Storage.clearDataForOrigin`
 * for its origins, and session storage in the tabs at those origins.
 *
 * THE PASSKEY CEREMONY (lane browser-passkey, 2026-10-05 — owner inc-muuvthv9-g69w: Chrome's own WebAuthn window sat on the
 * box's desktop, invisible in the live view, and the page took no input): on every tab this socket enables, ONE
 * `Runtime.addBinding` (a random name per watch) + PURE PK.installHook injected in the MAIN world
 * (`Page.addScriptToEvaluateOnNewDocument {runImmediately}`) — the page's own `navigator.credentials.get / .create` report
 * `start` / `end` here; PK.passkeyVerdict names a ceremony pending PK.PENDING_SAID_MS `passkey_open` (the routes' fact, the
 * verb in flight woken like a dialog, the chip / live-view banner, ONE For-you item per (profile, rpId) after
 * PK.FOR_YOU_AFTER_MS, resolved when it ends). `cancelPasskey` = `Runtime.evaluate` of PK.cancelExpression in the
 * ceremony's own execution context: the hooked closure aborts its AbortControllers — the page's promise rejects AbortError.
 * A tab whose hook never armed is `unknown`, never `passkey_open`.
 */
const ST = require('../browser-stuck.js');
const PK = require('../browser-passkey.js');
const crypto = require('crypto');
let WS = null; try { WS = require('ws').WebSocket; } catch { WS = null; }

const ANSWERED_KEEP = 32;
const OUTCOMES_KEEP = 16;
const VERB_RUNNING_MAX_MS = 5 * 60 * 1000;   // a /resolve without its audit is forgotten after this (a crashed CLI)
const RE_ENABLE_MS = 30 * 1000;              // a held tab's Page.enable is asked again (it answers once the hold ends)
const STOP_RETRIES = 4, STOP_RETRY_MS = 120; // verify r4 #5: Page.stopLoading under "Not attached to an active page" (a page mid-swap) is asked again — ≤ 0.5 s

function create({ keeper = null, WebSocketImpl = WS, log = console, now = Date.now,
  enableTimeoutMs = ST.ENABLE_TIMEOUT_MS, connectTimeoutMs = 3000, callTimeoutMs = 5000, captureTimeoutMs = ST.LOOP_SCREENSHOT_MS, quietMs = ST.LOOP_QUIET_MS, // verify r1: the quiet rule is a clock a fast gate shortens
  tabsOf = null, holdersOf = null, leaseCountOf = null, labelOf = null, notice = null, withdraw = null, forYou = null } = {}) {
  const watches = new Map();       // profileId → watch
  const listeners = new Set();
  const waiters = new Set();       // long-polls: {profileId, scope(), resolve}
  const told = new Map();          // browserKey → Set(answered id) — a note is told once
  const noticed = new Map();       // browserKey → Set(dialog id) — the idle notice is queued once
  const noticedSessions = new Map(); // dialog id → Set(sessionId) — verify r1: a notice whose dialog closed before the agent's turn is withdrawn
  const running = new Map();       // browserKey → {n, at, on: {profileId → {n, at}}} — verbs between /resolve and /audit (rule 6's idle test; verify r2: the creation witness, per browser)
  const WITNESS_MS = ST.CLI_ACTION_TIMEOUT_MS + 5000; // verify r2: a verb witnesses a tab's birth only this long after its /resolve (a CLI that exited without its audit — an early refusal — is forgotten here long before VERB_RUNNING_MAX_MS)
  const LOOP_COMMANDS_KEEP = 16;   // lane site-reset: the agent's page-acting command instants kept per browser
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
    const w = { profileId, url, holds: true, ws: null, state: 'connecting', id: 0, waiting: new Map(), sessions: new Map(), targets: new Map(), open: new Map(), pendingBy: new Map(), answered: [], seq: 0, readyP: null, commands: [],
      pkBinding: 'vs' + crypto.randomBytes(12).toString('hex'), pkKey: crypto.randomBytes(16).toString('hex'), pkForYou: new Map(), headed: null }; // lane browser-passkey
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
      // lane browser-passkey: a HEADED browser's passkey window is on this computer's desktop (the banner says so) — the browser's own word
      call(w, 'Browser.getVersion').then((v) => { const ua = v && v.result ? String(v.result.userAgent || '') : ''; w.headed = ua ? !/HeadlessChrome/.test(ua) : null; }).catch(() => { /* unknown */ });
      await call(w, 'Target.setDiscoverTargets', { discover: true });
      const r = await call(w, 'Target.getTargets');
      const infos = (r && r.result && Array.isArray(r.result.targetInfos)) ? r.result.targetInfos : [];
      await Promise.all(infos.map((t) => track(w, t)));
      // verify r4 #3: the persisted witness is pruned to the tabs this browser HAS — a healed browser's or a restart's dead ids
      // named nothing (a ghost-only scope read as attributed: the named refusal never fired, `stop` said "nothing of yours")
      if (keeper && typeof keeper.pruneOwnTabs === 'function') { try { const n = keeper.pruneOwnTabs(w.profileId, infos.filter((t) => t && t.type === 'page' && t.targetId).map((t) => String(t.targetId))); if (n) say('prune:' + w.profileId + ':' + now(), `${w.profileId}: ${n} persisted tab witness(es) named tabs this browser does not have — dropped`); } catch (err) { say('prune-err:' + (err && err.message), `${w.profileId}: the persisted tab witness was not pruned — ${err && err.message}`); } }
      w.readySeen = true; // lane site-reset: tabs tracked from here on appeared while watched
      // lane mirror-green-222: ready = the tabs enabled here carry the passkey hook — `arm` resolved between Page.enable and
      // the hook's last CDP answer, so a verb's first fact read the tab as `unknown` (the mirror's red, run 37419676410)
      await Promise.allSettled([...w.targets.values()].map((e) => e.pk.arming));
      w.ready();
    });
    ws.on('message', (d) => onMessage(w, d));
    ws.on('error', (e) => { say('err:' + w.profileId + ':' + (e && e.code), `${w.profileId}: the watch's socket failed — ${e && e.message}`); });
    ws.on('close', () => down(w, 'the browser\'s CDP socket closed'));
  }
  function down(w, why, { keepNotices = false } = {}) {
    if (w.state === 'down') return;
    w.state = 'down';
    for (const id of w.pkForYou.values()) { try { forYou?.resolve?.(id); } catch { /* the tray's own failure */ } } w.pkForYou.clear(); // lane browser-passkey
    w.ready();
    for (const fn of w.waiting.values()) { try { fn({ error: { message: why } }); } catch { /* */ } }
    w.waiting.clear();
    const open = [...w.open.values()];
    w.open.clear();
    if (watches.get(w.profileId) === w) watches.delete(w.profileId);
    for (const e of w.targets.values()) { if (e.reEnable) { clearTimeout(e.reEnable); e.reEnable = null; } if (e.quiet) { clearTimeout(e.quiet); e.quiet = null; } }
    emit({ kind: 'down', profileId: w.profileId, why, closed: open.map((d) => d.id) });
    if (!keepNotices) withdrawNotices(open.map((d) => d.id)); // a VibeSpace shutdown keeps them: the dialog is still open in Chrome
  }
  /** One page tab: attach (flat session) + Page.enable — the enable bounded; a tab that never answers is HELD. */
  function track(w, info) {
    if (!info || info.type !== 'page' || !info.targetId) return Promise.resolve();
    const tid = String(info.targetId);
    const known = w.targets.get(tid);
    if (known) { known.url = String(info.url || known.url || ''); known.title = String(info.title || known.title || ''); return known.enabling || Promise.resolve(); }
    const e = { targetId: tid, url: String(info.url || ''), title: String(info.title || ''), sid: null, enabled: false, heldAt: 0, enabling: null, reEnable: null, hops: [], loop: null, req: null, hopStart: null, quiet: null,
      seenAt: w.state === 'open' && w.readySeen ? now() : 0, agentHopAt: 0, owner: null, opener: info.openerId ? String(info.openerId) : null, pk: { armed: false, records: [] } }; // lane site-reset: a tab that appeared while watched (the agent's `tab new`), the last browser-initiated hop on it
    // verify r2: the ONE conversation whose verb was in flight when it appeared (null = nobody / unclear) — verify r3 #1: only for
    // a tab born of NO page (the CLI's `tab new`, the page it gets on attach: measured, no `openerId`); a tab a PAGE opened
    // (`window.open`, a `target=_blank` link — `openerId` set even under `noopener`, measured) is its OPENER's, whoever's verb
    // runs: before, a stranger's popup born during A's verb was A's — A's verb was cut with the stranger's addresses and A's
    // `stop` stopped the stranger's page (the kill + credential shape: that popup carried the stranger's session)
    if (e.seenAt) e.owner = e.opener ? openerOwner(w, e.opener) : createdOwner(w);
    // verify r3 #2: the witness is WRITTEN on the lease record (the keeper's registry is on disk) — a VibeSpace restart read it
    // back through `tabsOf`; before, in memory per watch, the restart made the conversation's own tab nobody's again
    if (e.owner && keeper && typeof keeper.noteOwnTab === 'function') { try { keeper.noteOwnTab(w.profileId, e.owner, tid); } catch (err) { say('note-tab:' + (err && err.message), `${w.profileId}: a witnessed tab was not recorded on its lease — ${err && err.message}`); } }
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
      armPasskey(w, e);
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
        if (e.quiet) clearTimeout(e.quiet);
        if (PK.endPending(e.pk.records, { now: now() }).length) passkeyChanged(w, e); // lane browser-passkey: a closed tab waits for nothing
        if (e.owner && keeper && typeof keeper.forgetOwnTab === 'function') { try { keeper.forgetOwnTab(w.profileId, e.owner, tid); } catch { /* the keeper's own failure */ } } // verify r3 #2: the persisted witness goes with the tab
        if (e.loop) { e.loop = null; emit({ kind: 'loop-cleared', profileId: w.profileId, targetId: tid, why: 'tab-closed' }); } // lane site-reset: a closed tab's loop is over
        const dlg = w.open.get(tid);
        if (dlg) { w.open.delete(tid); emit({ kind: 'closed', profileId: w.profileId, targetId: tid, answered: { id: dlg.id, dialog: dlg, how: 'dismissed', by: 'tab-closed', at: now(), targetId: tid } }); withdrawNotices([dlg.id]); }
        return;
      }
      case 'Target.detachedFromTarget': { const sid = String(p.sessionId || ''); const tid = w.sessions.get(sid); w.sessions.delete(sid); const e = tid && w.targets.get(tid); if (e && e.sid === sid) { e.sid = null; e.enabled = false; } return; }
      // verify r1 A7: a main-frame navigation IN FLIGHT (started, not committed) — a timeout then is the network's
      // verify r2 #5: `navFirst` = the first start of a RUN of navigations none of which committed (a page that starts a new
      // one every 20 s is ONE run — a per-start clock never reached the grace: never hung, never told), `navCount` its size
      case 'Page.frameStartedNavigating': { const e = tabOf(w, m); if (e && String(p.frameId || '') === e.targetId && !/samedocument/i.test(String(p.navigationType || ''))) { const t = now(); if (!e.navSince) { e.navFirst = t; e.navCount = 0; } e.navSince = t; e.navCount = (e.navCount || 0) + 1; e.navUrl = String(p.url || ''); startHop(e, t); } return; }
      // lane site-reset: the renderer's OWN request (script / meta refresh / reload / a click's link or form) — measured on
      // 0.38.1: it precedes frameStartedNavigating by ≤ 2 ms; a browser-initiated navigation (the agent's open) has none
      case 'Page.frameRequestedNavigation': { const e = tabOf(w, m); if (e && String(p.frameId || '') === e.targetId) e.req = { reason: String(p.reason || 'other').slice(0, 40), at: now() }; return; }
      case 'Page.frameNavigated': { const e = tabOf(w, m); if (e && p.frame && String(p.frame.id || '') === e.targetId && !p.frame.parentId) { endNav(e); hop(w, e, { url: String(p.frame.url || '') }); } return; }
      case 'Page.navigatedWithinDocument': case 'Page.frameStoppedLoading': {
        const e = tabOf(w, m);
        if (e && m.method === 'Page.navigatedWithinDocument' && String(p.frameId || '') === e.targetId) hop(w, e, { url: String(p.url || ''), same: true });
        if (e && String(p.frameId || '') === e.targetId) endNav(e);
        // verify r4 #4: the main frame STOPPED LOADING — this page loaded before the next hop (measured on 0.38.1: every hop of a
        // <meta refresh> dashboard and of the fast bounce, none of the incident's pending shape); the standing loop is re-judged
        // so its `readable` / `period` follow (the reading verbs run on a readable loop)
        if (e && m.method === 'Page.frameStoppedLoading' && String(p.frameId || '') === e.targetId) { const last = e.hops[e.hops.length - 1]; if (last && !last.stop && !last.same && !last.loaded) { last.loaded = true; if (e.loop) judgeLoop(w, e); } }
        return;
      }
      case 'Page.javascriptDialogOpening': return onOpen(w, w.sessions.get(String(m.sessionId || '')) || null, p);
      case 'Page.javascriptDialogClosed': return onClosed(w, w.sessions.get(String(m.sessionId || '')) || null, p);
      // lane browser-passkey: the hook's report; a document that went ends its pending ceremonies (the page no longer waits)
      case 'Runtime.bindingCalled': { if (p.name !== w.pkBinding) return; const e = tabOf(w, m); const ev = e && PK.parseEvent(p.payload); if (ev && PK.applyEvent(e.pk.records, ev, { tab: e.targetId, ctx: p.executionContextId, now: now() })) passkeyChanged(w, e, ev.ev === 'start'); return; }
      case 'Runtime.executionContextDestroyed': { const e = tabOf(w, m); if (e && PK.endPending(e.pk.records, { now: now(), ctx: Number(p.executionContextId) }).length) passkeyChanged(w, e); return; }
      case 'Runtime.executionContextsCleared': { const e = tabOf(w, m); if (e && PK.endPending(e.pk.records, { now: now() }).length) passkeyChanged(w, e); return; }
      default: return;
    }
  }
  function tabOf(w, m) { const tid = w.sessions.get(String(m.sessionId || '')); return tid ? w.targets.get(tid) || null : null; }
  const parentKey = (bk) => String(bk || '').replace(/\.\d+$/, '');
  /** verify r2 (site-reset): THE CREATION WITNESS — a tab that appears in a watched browser while EXACTLY ONE conversation's
   *  verb is in flight on it (between its /resolve and its /audit) and the user does not drive is THAT conversation's: its
   *  `tab new`, its `click --new-tab`, its page's popup. On the real 0.38.1 a cooperative session's own page (the `t1` it
   *  gets on attach, the tabs its `tab new` opens) is otherwise nobody's on a shared profile: the keeper pins no tab there, no
   *  live view may be open — and verify r1's "an unattributed scope admits nothing" then left the conversation's OWN looping
   *  tab out of its scope (measured: its `snapshot` answered "(empty page)" with no loop word, its `stop` was refused
   *  `not_watched`). Two verbs in flight, or the user driving ⇒ null (never a guess); the keeper's own naming of a tab for
   *  another holder wins over this witness at every read (scopeFor / ownsTab). */
  function createdOwner(w) {
    // verify r3 #1: the user's driving no longer unattributes it — the user's input reaches a PAGE (the live view's CDP input,
    // the user's own browsing tab), and a page's new tab has an opener (judged by openerOwner); the keeper's own opener-less
    // tabs (a pin, the user's own tab) are named by the keeper, which wins at every read. Before, A's own `tab new` during a
    // takeover of ANOTHER holder's view was nobody's for good.
    const t = now(); const parents = new Set(); let key = null;
    for (const [bk, r] of running) { const o = r && r.on ? r.on[w.profileId] : null; if (!o || !(o.n > 0) || t - (o.at || 0) > WITNESS_MS) continue; parents.add(parentKey(bk)); key = bk; }
    return parents.size === 1 ? key : null;
  }
  /** verify r3 #1: a tab a PAGE opened is that page's holder's — the keeper's naming of the opener (a pinned tab, a mediated
   *  grant, the user's own tab) first, else the opener's own witness (a popup of a popup follows the chain), else nobody's.
   *  Never the conversation whose verb happened to be in flight. */
  function openerOwner(w, openerId) {
    const o = w.targets.get(String(openerId || ''));
    if (!o) return null;
    let hs = []; try { hs = holdersOf ? holdersOf(w.profileId) || [] : []; } catch { hs = []; }
    for (const h of hs) {
      if (!h || !h.browserKey) continue;
      let tabs = null; try { tabs = tabsFn ? tabsFn({ sessionId: h.sessionId || null, browserKey: h.browserKey, profileId: w.profileId }) : null; } catch { tabs = null; }
      if (Array.isArray(tabs) && tabs.map(String).includes(o.targetId)) return String(h.browserKey);
    }
    return o.owner || null;
  }
  /** The tabs the watch itself attributed to `browserKey` on this browser (the creation witness), minus any tab another
   *  holder's own set (the injected `tabsOf`: a pinned tab, a mediated grant, the user's own) names — the keeper's fact wins. */
  function witnessedTabs(w, browserKey) {
    const mine = parentKey(browserKey);
    if (!w || !mine) return [];
    const out = [];
    for (const e of w.targets.values()) if (e.owner && parentKey(e.owner) === mine && !namedByAnother(w, e.targetId, mine)) out.push(e.targetId);
    return out;
  }
  /** verify r4 #2 (site-reset): THE ORPHAN TABS of a browser — named to NOBODY: not the keeper's naming of any holder (the
   *  injected `tabsOf`), not the witness's (`e.owner`): born while two conversations' commands ran at once, before this watch
   *  attached (a VibeSpace restart's first look, a healed browser's first tabs) or opened by the browser itself. Such a tab may
   *  be the asker's own, so what happens there is told as a KIND (never its address) — r1's `loopShared` / `unattributed` fired
   *  only for a conversation whose scope was EMPTY, so one holding other tabs heard nothing (reproduced on the real 0.38.1: its
   *  `open` in the orphan sat the 25 s timeout with no loop word, its `stop` said "nothing of yours was loading"). */
  function orphanTabs(w) {
    const out = new Set();
    if (!w) return out;
    const named = new Set();
    let hs = []; try { hs = holdersOf ? holdersOf(w.profileId) || [] : []; } catch { hs = []; }
    for (const h of hs) {
      if (!h || !h.browserKey) continue;
      let tabs = null; try { tabs = tabsFn ? tabsFn({ sessionId: h.sessionId || null, browserKey: h.browserKey, profileId: w.profileId }) : null; } catch { tabs = null; }
      if (Array.isArray(tabs)) for (const t of tabs) if (t) named.add(String(t));
    }
    for (const e of w.targets.values()) if (!e.owner && !named.has(e.targetId)) out.add(e.targetId);
    return out;
  }
  /** r4 #2: is an orphan tab of this browser looping, loading or holding a dialog? → the orphan set + what it holds. */
  function orphanBusy(w, scope) {
    if (!w || w.state !== 'open' || !(scope instanceof Set) || scope.size === 0) return { orphans: null, loop: null, busy: false };
    const orphans = orphanTabs(w);
    if (!orphans.size) return { orphans, loop: null, busy: false };
    const loop = loopIn(w.profileId, orphans);
    return { orphans, loop, busy: !!(loop || openIn(w.profileId, orphans) || loadingIn(w.profileId, orphans)) };
  }
  /** verify r4 #1 (site-reset): THE ACK BINDS. A `tab new` that succeeded NAMES its tab — the binary's own `--json` ack
   *  (`data.targetId`) or the session's `tab list --json` active tab (0.38.1: a new tab is the session's active one) — and
   *  the CLI hands the id over with the audit. That tab is this conversation's whatever the creation witness guessed:
   *  reproduced on the real 0.38.1 — B's `tab new` while A's slow `open` was in flight (two verbs ⇒ nobody's) left B's own
   *  looping tab out of B's scope: its `open` sat the 25 s timeout with no loop word, its `stop` said "nothing of yours".
   *  The keeper's naming of a tab for ANOTHER holder (a pinned tab, a mediated grant, the user's own) still wins. */
  function bindTab(t, targetId) {
    const w = watches.get(String((t && t.profileId) || ''));
    const tid = String(targetId || '').slice(0, 64);
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched' };
    const e = w.targets.get(tid);
    if (!e) return { ok: false, code: 'not-found' };
    if (t.ephemeral) return { ok: true, own: true }; // its own browser: every tab is its already
    const mine = parentKey(t.browserKey);
    if (!mine) return { ok: false, code: 'bad-request' };
    if (namedByAnother(w, tid, mine)) return { ok: false, code: 'not_your_tab' };
    const was = e.owner || null;
    if (was && parentKey(was) === mine) return { ok: true, was };
    e.owner = String(t.browserKey);
    if (keeper) {
      if (was && typeof keeper.forgetOwnTab === 'function') { try { keeper.forgetOwnTab(w.profileId, was, tid); } catch { /* the keeper's own failure */ } }
      if (typeof keeper.noteOwnTab === 'function') { try { keeper.noteOwnTab(w.profileId, e.owner, tid); } catch (err) { say('bind-tab:' + (err && err.message), `${w.profileId}: a tab the ack named was not recorded on its lease — ${err && err.message}`); } }
    }
    return { ok: true, was, rebound: !!was };
  }
  function namedByAnother(w, tid, mine) {
    let hs = []; try { hs = holdersOf ? holdersOf(w.profileId) || [] : []; } catch { hs = []; }
    for (const h of hs) {
      if (!h || !h.browserKey || parentKey(h.browserKey) === mine) continue;
      let tabs = null; try { tabs = tabsFn ? tabsFn({ sessionId: h.sessionId || null, browserKey: h.browserKey, profileId: w.profileId }) : null; } catch { tabs = null; }
      if (Array.isArray(tabs) && tabs.map(String).includes(String(tid))) return true;
    }
    return false;
  }
  function endNav(e) { e.navSince = 0; e.navFirst = 0; e.navCount = 0; }
  // ── lane site-reset: THE NAVIGATION LOOP ──
  /** A navigation started: whose was it? The renderer's own request seen just before (≤ 2 s) names it; none = browser-initiated. */
  function startHop(e, t) { const r = e.req && t - e.req.at <= 2000 ? e.req : null; e.hopStart = { at: t, reason: r ? r.reason : null, reqAt: r ? r.at : t }; e.req = null; }
  /** A main-frame commit (or a same-document move): recorded (bounded), then judged. */
  function hop(w, e, { url, same = false }) {
    const t = now();
    let h;
    if (same) h = { at: t, url, reason: 'sameDocument', reqAt: t, same: true };
    else { const st = e.hopStart || (e.req && t - e.req.at <= 2000 ? { at: e.req.at, reason: e.req.reason, reqAt: e.req.at } : null); h = { at: t, url, reason: st ? st.reason : null, reqAt: st ? st.reqAt : t }; e.hopStart = null; e.req = null; }
    // verify r1: a hop while the USER drives this browser (a takeover on any holder of it) is the user's own click, never
    // the page's loop — stamped on the record (PURE navigationLoopVerdict resets the run on it)
    if (!h.same) { let u = false; try { u = userDrivesTab(w, e.targetId); } catch { u = false; } if (u) h.user = true; } // verify r2: the stamp reaches the tabs the user DRIVES, not every tab of the browser
    e.hops.push(h); if (e.hops.length > ST.LOOP_KEEP) e.hops.splice(0, e.hops.length - ST.LOOP_KEEP);
    if (!h.same && (h.reason == null || h.reason === '')) e.agentHopAt = t; // a browser-initiated hop: the agent (or the user) navigated THIS tab
    judgeLoop(w, e);
  }
  /** Re-judge one tab: a loop that begins is EMITTED and wakes the verbs that asked for it; one that ends is emitted too.
   *  While it stands, a quiet timer re-judges it after LOOP_QUIET_MS (a loop that stops by itself is over). */
  function judgeLoop(w, e) {
    const t = now();
    const v = ST.navigationLoopVerdict(e.hops, { now: t, commands: w.commands, quietMs });
    const was = e.loop;
    e.loop = v ? { ...v, targetId: e.targetId, judgedAt: was ? was.judgedAt : t } : null;
    if (e.quiet) { clearTimeout(e.quiet); e.quiet = null; }
    if (e.loop) { e.quiet = setTimeout(() => { e.quiet = null; if (w.targets.get(e.targetId) === e) judgeLoop(w, e); }, quietMs + 50); if (e.quiet.unref) e.quiet.unref(); }
    if (e.loop && !was) {
      say('loop:' + w.profileId + ':' + e.targetId + ':' + e.loop.runStart, `${w.profileId}: tab ${e.targetId.slice(0, 8)} is in a navigation loop — ${e.loop.hops} loads in ${Math.round(e.loop.sinceMs / 1000)} s over ${e.loop.urls.length} address(es)`);
      emit({ kind: 'loop', profileId: w.profileId, targetId: e.targetId, loop: ST.loopBlock(e.loop) });
      for (const x of [...waiters]) if (x.profileId === w.profileId && x.loop && inScope(x.scope(), e.targetId) && Number(e.loop.runStart) >= Number(x.loop.after || 0) && !movedOn(w, x.scope(), e)) { waiters.delete(x); x.resolve({ loop: e.loop, via: 'event', at: t }); }
    } else if (!e.loop && was) emit({ kind: 'loop-cleared', profileId: w.profileId, targetId: e.targetId });
  }
  /** The loop standing on a tab in scope (re-judged now: the quiet rule is a clock), or null. */
  /** Has the agent MOVED ON from looping tab `e` — another tab in `scope` appeared while watched, or the agent navigated one,
   *  after the loop began? Then its verbs are that tab's: the loop is still a fact (the chip, the live view), never a
   *  refusal or a cut of a verb that runs elsewhere. */
  function movedOn(w, scope, e) {
    const since = Number(e && e.loop && e.loop.runStart) || 0;
    for (const x of w.targets.values()) { if (x === e || !inScope(scope, x.targetId)) continue; if ((x.seenAt || 0) > since || (x.agentHopAt || 0) > since) return true; }
    return false;
  }
  function loopIn(profileId, scope, { after = 0, current = false } = {}) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open') return null;
    for (const e of w.targets.values()) {
      if (!e.loop || !inScope(scope, e.targetId)) continue;
      if (current && movedOn(w, scope, e)) continue;
      const v = ST.navigationLoopVerdict(e.hops, { now: now(), commands: w.commands, quietMs });
      if (v && Number(v.runStart) >= Number(after || 0)) return { ...v, targetId: e.targetId };
    }
    return null;
  }
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
  /** verify r2 (site-reset): does the user drive THIS tab? The takeover is a holder's (the live view they took it from, or the
   *  user's own browsing row): their tabs — the injected `tabsOf` (that view's active target, the lease's pinned tab, the
   *  user's own + adopted) — are the ones under their hands. A driving holder whose tabs are unknown ⇒ every tab (as before:
   *  the stamp fails safe); before, the stamp reached every tab of the browser, so a loop in the agent's OWN background tab
   *  was hidden for the whole takeover and re-raised only after a full new window. */
  function userDrivesTab(w, tid) {
    if (!keeper || typeof keeper.inputStateFor !== 'function' || !holdersOf) return false;
    let hs = []; try { hs = holdersOf(w.profileId) || []; } catch { hs = []; }
    const blind = []; // the driving holders whose tabs are unknown
    for (const h of hs) {
      let drives = false;
      try { if (h && h.human) drives = h.input === 'user'; else { const st = h && keeper.inputStateFor(h.browserKey, h.ephemeral ? null : w.profileId); drives = !!(st && st.input === 'user'); } } catch { drives = false; }
      if (!drives) continue;
      let tabs = null; try { tabs = tabsFn ? tabsFn({ sessionId: h.sessionId || null, browserKey: h.browserKey, profileId: w.profileId }) : null; } catch { tabs = null; }
      const known = Array.isArray(tabs) ? tabs.filter(Boolean).map(String) : [];
      if (known.includes(String(tid))) return true;
      if (!known.length) blind.push(String(h.browserKey || ''));
    }
    if (!blind.length) return false;
    // verify r3 #4: a driving holder whose tabs are UNKNOWN (a live view before its first `tabs` record names a target, the user's
    // own row with its tab unnamed) stamps every tab — EXCEPT a tab the keeper's naming or the witness gives to a holder who is
    // not driving: that is not the tab under the user's hands, and its own loop stays reported (before: hidden for the whole
    // takeover). A tab named to nobody is still stamped (fail safe).
    const named = tabOwners(w, tid);
    if (!named.length) return true;
    return blind.some((bk) => named.includes(parentKey(bk)));
  }
  /** The holders a tab is named to — the keeper's naming (`tabsOf` over every holder) and the witness (`e.owner`); parent keys. */
  function tabOwners(w, tid) {
    const out = new Set();
    let hs = []; try { hs = holdersOf ? holdersOf(w.profileId) || [] : []; } catch { hs = []; }
    for (const h of hs) {
      if (!h || !h.browserKey) continue;
      let tabs = null; try { tabs = tabsFn ? tabsFn({ sessionId: h.sessionId || null, browserKey: h.browserKey, profileId: w.profileId }) : null; } catch { tabs = null; }
      if (Array.isArray(tabs) && tabs.map(String).includes(String(tid))) out.add(parentKey(h.browserKey));
    }
    const e = w.targets.get(String(tid));
    if (e && e.owner) out.add(parentKey(e.owner));
    return [...out];
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
   *  restarted on a new port). Waits at most `budgetMs` for the tabs to be enabled and their passkey hook armed — never holds a verb longer. */
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
    tabs = (Array.isArray(tabs) ? tabs : []).filter(Boolean).map(String);
    // verify r2: + the tabs its own verbs CREATED (the creation witness) — they WIDEN an attributed scope and give a shared
    // browser's holder one; they never narrow the every-tab scope of a browser only this conversation holds
    const witnessed = !ephemeral && browserKey ? witnessedTabs(watches.get(String(profileId || '')), browserKey) : [];
    if (tabs.length) { for (const t of witnessed) if (!tabs.includes(t)) tabs.push(t); return new Set(tabs); }
    if (ephemeral) return null;
    let n = 1; if (leaseCountOf) { try { n = Number(leaseCountOf(profileId)) || 0; } catch { n = 1; } }
    return n <= 1 ? null : new Set(witnessed);
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
    // lane site-reset: a page that will not settle, named — `loop` = on the tab the agent still works in (what its verbs are
    // answered with), `loopAny` = on any tab of its (the chip, the live view)
    const loopAny = watched && !d ? loopIn(pid, scope) : null;
    const loop = loopAny ? loopIn(pid, scope, { current: true }) : null;
    // verify r1: an UNATTRIBUTED conversation (a shared browser, no live view, no pinned tab) is told that SOME tab of the
    // browser loops — a kind only, never an address (another conversation's page, maybe the user's own) — so a timed-out
    // verb is never the silent incident again; the panel's digest already said as much (`pageStuckMap`)
    // verify r4 #2: …and a conversation that HOLDS tabs hears of a loop on an ORPHAN tab (named to nobody — maybe its own) the
    // same way; a loop on a tab named to another holder is that holder's alone
    const orphan = watched && !d ? orphanBusy(w, scope) : { busy: false, loop: null };
    const loopShared = watched && !d && !loopAny && scope instanceof Set ? (scope.size === 0 ? !!loopIn(pid, null) : !!orphan.loop) : false;
    return {
      watched,
      // verify r1 A5: what the watch CANNOT say — a tab in scope it has not seen into (`blind`), or a shared browser
      // whose conversation's tab it does not know (`unattributed`); then a dialog may be open that only the lease's own
      // daemon saw — the routes hand the dialog verbs to it, the CLI reads its lines
      blind: watched && !d ? !!blindIn(pid, scope) : false,
      loading: watched && !d && !loop ? loadingIn(pid, scope) : null, // verify r1 A7 (lane site-reset: a loop explains a timeout better — the loop is said instead)
      unattributed: watched && !d && scope instanceof Set && (scope.size === 0 || orphan.busy), // r4 #2: an orphan tab with a fact — the dialog verbs fall back to the browser's own view
      open: d ? ST.dialogBlock(d, { now: t }) : null,
      text: d ? ST.dialogText(d, { now: t, repeat: true }) : '',
      targetId: d ? d.targetId : null,
      notes,
      stuck: !d && !loop && verdict.state === 'unresponsive' ? { ...verdict, text: ST.stuckAgentText(verdict) } : null,
      loop: loop ? { ...ST.loopBlock(loop), runStart: loop.runStart, text: ST.loopText(loop) } : null,
      loopAny: loopAny ? { ...ST.loopBlock(loopAny), runStart: loopAny.runStart } : null,
      loopShared, // verify r1: kinds only
      passkey: watched ? PK.passkeyBlock(passkeyIn(pid, scope)) : null, // lane browser-passkey: `passkey_open` with THE SENTENCE, `unknown` where no hook armed
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
      // lane browser-unresponsive: the WHOLE browser judged hung (the keeper's fact) is said before any page's state
      let br = null; try { br = typeof keeper.browserOf === 'function' ? keeper.browserOf(c.profileId) : null; } catch { br = null; }
      if (br && br.unresponsive && Number.isFinite(br.unresponsive.since)) { let p = null; try { p = keeper.profile(c.profileId); } catch { p = null; } return { state: 'unresponsive', why: 'browser', count: Number(br.unresponsive.asks) || 0, since: br.unresponsive.since, label: (p && p.label) || c.profileId, profileId: c.profileId }; }
      const f = factFor({ ...c, browserKey: bk, consume: false });
      // lane browser-passkey: a page waiting for a passkey (after a held dialog — that is answered first)
      if (!f.open && f.passkey && f.passkey.state === PK.PASSKEY_OPEN_CODE) return { state: 'passkey', passkey: f.passkey, headed: onDesktop(c.profileId), since: f.passkey.startedAt, profileId: c.profileId };
      const fact = ST.stuckFact({ dialog: f.open ? { ...f.open, id: f.open.id } : null, verdict: f.stuck, loop: f.loopAny, now: now() });
      if (fact) return { ...fact, profileId: c.profileId };
    }
    return null;
  }

  // ── the verb in flight (rule 1) ──
  /** Resolve at the first HELD dialog that opens in the conversation's scope (or is already open) — the long-poll the
   *  CLI keeps while its verb runs; null at `ms`. The bound is the event, never a clock. */
  // lane site-reset: `loop: {after}` — the verb also ends at a navigation loop judged in its scope whose run began at or
  // after `after` (a navigation verb passes its own start: the old page's loop is not its; the new page's is)
  function waitForOpen({ profileId, browserKey = '', sessionId = null, ephemeral = false } = {}, ms = 20000, { signal = null, loop = null, passkey = false } = {}) {
    const pid = String(profileId || '');
    const scope = () => scopeFor({ profileId: pid, browserKey, sessionId, ephemeral });
    const d = openIn(pid, scope());
    if (d) return Promise.resolve({ dialog: d, via: 'already-open', at: now() });
    if (loop) { const l = loopIn(pid, scope(), { after: Number(loop.after) || 0, current: true }); if (l) return Promise.resolve({ loop: l, via: 'already-looping', at: now() }); }
    if (passkey) { const v = passkeyIn(pid, scope()); if (v.state === PK.PASSKEY_OPEN_CODE) return Promise.resolve({ passkey: PK.passkeyBlock(v), via: 'already-waiting', at: now() }); } // lane browser-passkey
    return new Promise((resolve) => {
      let t = null;
      const x = { profileId: pid, scope, loop: loop ? { after: Number(loop.after) || 0 } : null, passkey: !!passkey, resolve: (v) => { if (t) clearTimeout(t); resolve(v); } };
      waiters.add(x);
      t = setTimeout(() => { if (waiters.delete(x)) resolve(null); }, Math.max(0, Math.min(Number(ms) || 0, 60000)));
      if (t.unref) t.unref();
      // the asker went away (the CLI's verb ended, its request aborted) ⇒ the waiter goes too
      if (signal) { if (signal.aborted) { waiters.delete(x); clearTimeout(t); resolve(null); } else signal.addEventListener('abort', () => { if (waiters.delete(x)) { clearTimeout(t); resolve(null); } }, { once: true }); }
    });
  }
  function verbStarted(browserKey, { profileId = null, verb = null } = {}) {
    if (!browserKey) return;
    const r = running.get(browserKey) || { n: 0, at: 0, on: {} }; const on = { ...(r.on || {}) }; if (profileId) { const o = on[String(profileId)] || { n: 0, at: 0 }; on[String(profileId)] = { n: o.n + 1, at: now() }; } running.set(browserKey, { n: r.n + 1, at: now(), on });
    // lane site-reset: a page-ACTING command's instant — a page turn right after it is the agent's, never the page's loop
    const w = profileId ? watches.get(String(profileId)) : null;
    if (w && verb && ST.loopActing(verb)) { w.commands.push(now()); if (w.commands.length > LOOP_COMMANDS_KEEP) w.commands.splice(0, w.commands.length - LOOP_COMMANDS_KEEP); }
  }
  function verbEnded(browserKey, { profileId = null } = {}) { if (!browserKey) return; const r = running.get(browserKey); if (!r) return; const on = { ...(r.on || {}) }; if (profileId && on[String(profileId)]) { const o = on[String(profileId)]; if (o.n <= 1) delete on[String(profileId)]; else on[String(profileId)] = { n: o.n - 1, at: o.at }; } if (r.n <= 1) running.delete(browserKey); else running.set(browserKey, { n: r.n - 1, at: r.at, on }); }
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

  // ── lane site-reset step 1b: A LOOPING TAB NEVER DISABLES THE BROWSER — `stop` ──
  /** Is tab `targetId` this conversation's to act on? One of its own browser's tabs, or on a shared profile a tab
   *  ATTRIBUTED to it (its live view's, its pinned tab, its mediated lease's — the injected `tabsOf`) that no OTHER holder's
   *  set names. verify r1 (site-reset): an UNATTRIBUTED conversation (a shared browser, nobody's live view open, no tab
   *  pinned — the unattended case) owns NO tab here: before, `pickTab` admitted every tab then and a conversation's `stop`
   *  stopped another conversation's looping page and the user's own loading one, `ownTabs` read strangers' addresses. */
  function ownsTab(t, targetId) {
    const w = watches.get(String((t && t.profileId) || ''));
    const tid = String(targetId || '');
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    if (!tid || !w.targets.has(tid)) return { ok: false, code: 'not-found', error: 'that tab is not open in your browser' };
    if (t.ephemeral) return { ok: true };
    const scope = scopeFor(t);
    if (scope instanceof Set && scope.has(tid)) return { ok: true };
    const mine = String(t.browserKey || '').replace(/\.\d+$/, '');
    let hs = []; try { hs = holdersOf ? holdersOf(t.profileId) || [] : []; } catch { hs = []; }
    for (const h of hs) {
      if (!h || !h.browserKey || String(h.browserKey).replace(/\.\d+$/, '') === mine) continue;
      let tabs = null; try { tabs = tabsFn ? tabsFn({ sessionId: h.sessionId || null, browserKey: h.browserKey, profileId: t.profileId }) : null; } catch { tabs = null; }
      if (Array.isArray(tabs) && tabs.map(String).includes(tid)) return { ok: false, code: 'not_your_tab', error: h.human ? 'that tab is the user\'s own (they browse in it) — nothing was stopped' : 'that tab is another conversation\'s — nothing was stopped' };
    }
    const e = w.targets.get(tid);
    if (e && e.owner && parentKey(e.owner) !== mine) return { ok: false, code: 'not_your_tab', error: /^hu-/.test(String(e.owner)) ? 'that tab is the user\'s own (their page opened it) — nothing was stopped' : 'that tab is another conversation\'s (it opened it) — nothing was stopped' }; // verify r2: the creation witness; verify r3 #1: the opener's holder
    return { ok: true };
  }
  /** The tab a DIRECT act names: the conversation's looping tab (the newest loop), else — for `stop` — one still loading;
   *  never a tab another holder's live view shows. → the target entry, or null. */
  function pickTab(t, { loading = false, current = false } = {}) {
    const w = watches.get(String((t && t.profileId) || ''));
    if (!w || w.state !== 'open') return null;
    const scope = scopeFor(t);
    const cands = [...w.targets.values()].filter((e) => (t.ephemeral || scope === null || (scope instanceof Set && scope.has(e.targetId))) && ownsTab(t, e.targetId).ok);
    const looping = cands.filter((e) => e.loop).sort((a, b) => (b.loop.lastAt || 0) - (a.loop.lastAt || 0));
    // `current` (a bare `tab close`, a `screenshot`): only while the looping tab is still the agent's CURRENT one by evidence —
    // another tab of its that appeared, or that it navigated, after the loop began means it moved on (its own verbs then
    // go to the browser CLI, whose queue is free again)
    if (looping.length && current) { const L = looping[0]; const since = Number(L.loop.runStart) || 0; if (cands.some((e) => e !== L && ((e.seenAt || 0) > since || (e.agentHopAt || 0) > since))) return null; }
    if (looping.length) return looping[0];
    if (loading) { const l = cands.filter((e) => e.navSince).sort((a, b) => (b.navSince || 0) - (a.navSince || 0)); if (l.length) return l[0]; }
    return null;
  }
  /** `stop`: `Page.stopLoading` on the looping (else the loading) tab through THIS socket — answered in ≤ 6 ms and never
   *  queued behind the browser CLI's own command (measured: a verb the loop cut keeps the session's daemon busy until its
   *  own 25 s timeout, and a `stop` or a close does not shorten it) — then a STOP marker in its hops (the run ends there).
   *  → `{ok, url, title, was, targetId}` | `{ok:true, nothing:true}` (no tab of yours was loading). */
  async function stopTab(t, { targetId = null } = {}) {
    const w = watches.get(String((t && t.profileId) || ''));
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    let e = null;
    if (targetId) { const own = ownsTab(t, targetId); if (!own.ok) return own; e = w.targets.get(String(targetId)); } else e = pickTab(t, { loading: true });
    // verify r1 (site-reset): a shared browser whose tab of this conversation VibeSpace cannot tell (no live view, no pinned
    // tab, no mediated lease) — said by name with the way out, never a stop on a stranger's page, never a quiet "nothing"
    if (!e && !t.ephemeral) {
      const sc = scopeFor(t);
      if (sc instanceof Set && sc.size === 0) return { ok: false, code: 'not_watched', why: 'unattributed', error: 'VibeSpace does not know which tab of this shared browser is yours (no live view of this conversation is open and no tab of its is pinned) — nothing was stopped', remedy: 'vibespace-browser tab close (closes your current tab through the browser\'s own view), then tab new <url>' };
      // verify r4 #2: an ORPHAN tab (named to nobody) loops or loads — maybe this conversation's own: refused BY NAME, never "nothing"
      const ob = orphanBusy(w, sc);
      if (ob.orphans && ob.orphans.size && (ob.loop || loadingIn(w.profileId, ob.orphans))) return { ok: false, code: 'not_watched', why: 'unattributed', error: 'a tab of this shared browser that is named to no conversation is looping or loading, and VibeSpace cannot tell whether it is yours (it appeared while two commands ran at once, or before VibeSpace watched this browser) — nothing was stopped', remedy: 'vibespace-browser tab close (closes your current tab through the browser\'s own view), then tab new <url>' };
    }
    if (!e) return { ok: true, nothing: true };
    if (!e.sid) return { ok: false, code: 'not_watched', error: 'VibeSpace is not attached to that tab' };
    const was = e.loop ? { ...ST.loopBlock(e.loop) } : null;
    // verify r4 #5 (LOW): Chrome answers "Not attached to an active page" to a session whose page is mid-swap (a cross-document
    // commit in flight — measured twice on the real 0.38.1: the fast bounce, a healed browser's loop); a transient, so the stop is
    // asked again, briefly, before it is called failed (the owner's addendum: the agent must always be able to stop the page)
    let r = null;
    for (let i = 0; i < STOP_RETRIES; i++) {
      r = await call(w, 'Page.stopLoading', {}, e.sid, 3000);
      if (!(r && r.error && /not attached to an active page/i.test(String(r.error.message || '')))) break;
      await new Promise((res) => { const tm = setTimeout(res, STOP_RETRY_MS); if (tm.unref) tm.unref(); });
    }
    if (!r || r.timeout || r.error) return { ok: false, code: 'stop_failed', error: r && r.error ? String(r.error.message || 'refused') : 'the tab did not answer' };
    e.hops.push({ at: now(), stop: true }); if (e.hops.length > ST.LOOP_KEEP) e.hops.splice(0, e.hops.length - ST.LOOP_KEEP);
    endNav(e);
    judgeLoop(w, e);
    return { ok: true, url: ST.pageText(e.url, 300), title: ST.pageText(e.title, 120), was, targetId: e.targetId };
  }
  /** `tab close` while a loop stands: `Target.closeTarget` on the LOOPING tab through this socket (never the daemon's queue);
   *  the browser's only page gets a blank one first (a browser with no page is not one the CLI can drive again). */
  async function closeTab(t) {
    const w = watches.get(String((t && t.profileId) || ''));
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    const e = pickTab(t, { current: true });
    if (!e) return { ok: false, code: 'no_loop', error: 'no tab of yours is looping' };
    const was = e.loop ? { ...ST.loopBlock(e.loop) } : null;
    const pages = [...w.targets.values()].length;
    let opened = false;
    if (pages <= 1) { const c = await call(w, 'Target.createTarget', { url: 'about:blank' }, null, 3000); opened = !!(c && c.result && c.result.targetId); }
    const r = await call(w, 'Target.closeTarget', { targetId: e.targetId }, null, 3000);
    if (!r || r.timeout || r.error || (r.result && r.result.success === false)) return { ok: false, code: 'close_failed', error: r && r.error ? String(r.error.message || 'refused') : 'the browser did not close it' };
    return { ok: true, url: ST.pageText(e.url, 300), title: ST.pageText(e.title, 120), was, targetId: e.targetId, opened };
  }
  /** `screenshot` while a loop stands: `Page.captureScreenshot` on the looping tab through this socket, bounded (measured:
   *  a page that navigates away before it paints has no frame to take — the capture then never answers). → `{ok, data}` |
   *  `{ok:false, code:'no_picture'}`. */
  async function captureTab(t, { timeoutMs = captureTimeoutMs } = {}) {
    const w = watches.get(String((t && t.profileId) || ''));
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    const e = pickTab(t, { current: true });
    if (!e) return { ok: false, code: 'no_loop', error: 'no tab of yours is looping' };
    if (!e.sid) return { ok: false, code: 'not_watched', error: 'VibeSpace is not attached to that tab' };
    const loop = e.loop ? { ...ST.loopBlock(e.loop) } : null;
    const r = await call(w, 'Page.captureScreenshot', { format: 'png' }, e.sid, timeoutMs);
    if (!r || r.timeout || r.error || !(r.result && typeof r.result.data === 'string')) return { ok: false, code: 'no_picture', error: ST.noPictureText(loop), loop };
    return { ok: true, data: r.result.data, url: ST.pageText(e.url, 300), title: ST.pageText(e.title, 120), loop, targetId: e.targetId };
  }
  // ── lane site-reset step 2: CLEARING ONE SITE'S STORED LOGIN ──
  /** The conversation's own tabs (in scope, never another holder's), the looping one first — `{targetId, url}`. */
  function ownTabs(t) {
    const w = watches.get(String((t && t.profileId) || ''));
    if (!w || w.state !== 'open') return [];
    const scope = scopeFor(t);
    const cands = [...w.targets.values()].filter((e) => (t.ephemeral || scope === null || (scope instanceof Set && scope.has(e.targetId))) && ownsTab(t, e.targetId).ok);
    cands.sort((a, b) => (b.loop ? 1 : 0) - (a.loop ? 1 : 0) || (Number(b.navSince) || 0) - (Number(a.navSince) || 0));
    return cands.map((e) => ({ targetId: e.targetId, url: e.url }));
  }
  /**
   * Clear ONE site's stored login in this browser through THIS socket (never `clearBrowserCookies` — every site):
   *   · the cookies that REACH `host` (`Storage.getCookies` → ST.cookieReaches → `Network.deleteCookies` each, on a tab's
   *     session), re-read after: what is left is said;
   *   · `Storage.clearDataForOrigin` (local storage, IndexedDB, Cache Storage, service workers, file systems …) for every
   *     origin of `host` — https / http and each port a tab of this browser has open there;
   *   · session storage of each open tab at those origins (`DOMStorage.clear`).
   * The HTTP cache is shared by every site in Chrome and holds no login — left. → `{ok, host, cookies, cookieDomains,
   * origins, sessionTabs, remaining}` | `{ok:false, code, error}`.
   */
  async function clearSite(profileId, { host } = {}) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    const h = ST.hostWord(host);
    if (!h) return { ok: false, code: 'bad-host', error: 'not a host name' };
    const tabSid = [...w.targets.values()].find((e) => e.sid && e.enabled)?.sid || [...w.targets.values()].find((e) => e.sid)?.sid || null;
    if (!tabSid) return { ok: false, code: 'clear_failed', error: 'the browser has no page VibeSpace is attached to' };
    const all = await call(w, 'Storage.getCookies', {}, null, 5000);
    if (!all || all.timeout || all.error || !all.result) return { ok: false, code: 'clear_failed', error: `the browser did not list its cookies${all && all.error ? ': ' + all.error.message : ''}` };
    const hits = (all.result.cookies || []).filter((c) => ST.cookieReaches(c, h));
    const doms = new Map();
    let deleted = 0;
    for (const c of hits) {
      const r = await call(w, 'Network.deleteCookies', { name: c.name, domain: c.domain, path: c.path, ...(c.partitionKey ? { partitionKey: c.partitionKey } : {}) }, tabSid, 5000);
      if (r && !r.timeout && !r.error) { deleted++; doms.set(c.domain, (doms.get(c.domain) || 0) + 1); }
    }
    const after = await call(w, 'Storage.getCookies', {}, null, 5000);
    const remaining = after && after.result ? (after.result.cookies || []).filter((c) => ST.cookieReaches(c, h)).length : hits.length - deleted;
    // the origins: https / http of the host, and every origin (with its port) a tab of this browser has open there
    const origins = new Set(ST.originsOf(h));
    for (const e of w.targets.values()) { try { const u = new URL(String(e.url || '')); if (/^https?:$/.test(u.protocol) && u.hostname.toLowerCase() === h) origins.add(u.origin); } catch { /* not a URL */ } }
    // measured (0.38.1's Chrome): on the BROWSER endpoint clearDataForOrigin answers "Internal error" — it needs a page's
    // session (the storage partition is the page's); any tab of this browser clears any origin of it
    const cleared = [], storageFailed = [];
    for (const origin of origins) {
      const r = await call(w, 'Storage.clearDataForOrigin', { origin, storageTypes: 'local_storage,indexeddb,cache_storage,service_workers,file_systems' }, tabSid, 5000);
      if (r && !r.timeout && !r.error) cleared.push(origin); else storageFailed.push(origin);
    }
    let sessionTabs = 0;
    for (const e of w.targets.values()) {
      let o = null; try { o = new URL(String(e.url || '')).origin; } catch { o = null; }
      if (!o || !origins.has(o) || !e.sid) continue;
      const r = await call(w, 'DOMStorage.clear', { storageId: { securityOrigin: o, isLocalStorage: false } }, e.sid, 3000);
      if (r && !r.timeout && !r.error) sessionTabs++;
    }
    say('clear:' + profileId + ':' + h + ':' + now(), `${profileId}: cleared ${h}'s stored login — ${deleted} cookie(s) (${[...doms].map(([d, n]) => d + ': ' + n).join(', ') || 'none'}), storage of ${cleared.join(', ') || 'no origin'}${sessionTabs ? `, session storage in ${sessionTabs} tab(s)` : ''}${remaining ? `; ${remaining} could not be deleted` : ''}${storageFailed.length ? `; storage NOT cleared for ${storageFailed.join(', ')}` : ''}`);
    return { ok: true, host: h, cookies: deleted, cookieDomains: [...doms].map(([domain, count]) => ({ domain, count })), origins: cleared, storageFailed, sessionTabs, remaining };
  }

  // the session a loop CUT: its daemon keeps waiting on the cut verb until 0.38.1's own action timeout (25 s, measured) —
  // page commands queue behind it; said to the agent, never a surprise
  const busy = new Map(); // browserKey → until
  function noteCut(browserKey, since) { if (!browserKey || !(Number(since) > 0)) return; busy.set(String(browserKey), Number(since) + ST.CLI_ACTION_TIMEOUT_MS); if (busy.size > 256) busy.delete(busy.keys().next().value); }
  function busyFor(browserKey) { const u = busy.get(String(browserKey || '')); if (!u) return 0; const left = u - now(); if (left <= 0) { busy.delete(String(browserKey)); return 0; } return left; }

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
      const lp = loopIn(pid, null); // lane site-reset: kinds only here (the digest reaches agents — never a page's address)
      if (lp) { out[pid] = { state: 'loop', since: lp.runStart || 0 }; continue; }
      const v = browserVerdict(pid, heldIn(pid, null));
      if (v.state === 'unresponsive') out[pid] = { state: 'unresponsive', why: v.why, count: v.count || 0, since: v.since || 0 };
    }
    return out;
  }
  // ── lane browser-passkey: the ceremony hook ──
  function armPasskey(w, e) {
    if (!e.pk.armed && !e.pk.arming && e.sid) e.pk.arming = armHook(w, e, e.sid).finally(() => { e.pk.arming = null; });
    return e.pk.arming || null;
  }
  async function armHook(w, e, sid) {
    const r1 = await call(w, 'Runtime.addBinding', { name: w.pkBinding }, sid);
    const r2 = r1 && r1.result ? await call(w, 'Page.addScriptToEvaluateOnNewDocument', { source: PK.hookSource({ binding: w.pkBinding, key: w.pkKey }), runImmediately: true }, sid) : null;
    const r3 = r2 && r2.result ? await call(w, 'Runtime.enable', {}, sid) : null; // the documents that go (a navigation ends its ceremonies)
    e.pk.armed = !!(r3 && r3.result) && e.sid === sid;
    if (!e.pk.armed) say('pk-arm:' + w.profileId, `${w.profileId}: the passkey hook did not arm on a tab — its passkey requests read as unknown (${(r1 && r1.error && r1.error.message) || (r2 && r2.error && r2.error.message) || (r3 && r3.error && r3.error.message) || 'no answer'})`);
  }
  /** lane browser-passkey-chrome (MEASURED on 0.38.1): Chrome draws its passkey dialog TAB-MODAL in the browser's own window —
   *  on this computer's desktop only when that window is. The hidden-window rung's window is on the CLI's own Xvfb, which
   *  nobody sees: the banner's desktop note there sent the user looking for a window that is not on any screen. */
  function onDesktop(profileId) {
    if ((watches.get(String(profileId)) || {}).headed !== true) return false;
    let rec = null; try { rec = keeper && typeof keeper.browserOf === 'function' ? keeper.browserOf(String(profileId)) : null; } catch { rec = null; }
    const fb = rec && rec.display && rec.display.fallback;
    return !(fb && fb.rung === 'hidden-window');
  }
  function passkeyTabs(w, scope) { return w ? [...w.targets.values()].filter((e) => inScope(scope, e.targetId)) : []; }
  /** The verdict over a conversation's tabs (`unknown` when none of them carries the hook). */
  function passkeyIn(profileId, scope) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open') return { state: 'unknown' };
    const tabs = passkeyTabs(w, scope);
    const armed = tabs.filter((e) => e.pk.armed);
    if (!armed.length) return { state: tabs.length ? 'unknown' : 'none' };
    return PK.passkeyVerdict(armed.flatMap((e) => e.pk.records), now());
  }
  /** A ceremony started / ended on tab `e`: the chip + live view re-read, the verb in flight woken at `passkey_open`, the
   *  For-you items filed / resolved; a start re-asks itself when it is due to be said and when the For-you item is. */
  function passkeyChanged(w, e, started = false) {
    if (started) for (const ms of [PK.PENDING_SAID_MS, PK.FOR_YOU_AFTER_MS]) { const t = setTimeout(() => { if (w.state === 'open') passkeyChanged(w, e); }, ms + 20); if (t.unref) t.unref(); }
    const v = PK.passkeyVerdict(e.pk.records, now());
    emit({ kind: 'passkey', profileId: w.profileId, targetId: e.targetId, state: v.state });
    if (v.state === PK.PASSKEY_OPEN_CODE) for (const x of [...waiters]) if (x.profileId === w.profileId && x.passkey && inScope(x.scope(), e.targetId)) { waiters.delete(x); x.resolve({ passkey: PK.passkeyBlock(v), via: 'event', at: now() }); }
    if (!forYou) return;
    const open = new Map(); // rpId → the oldest pending record on this browser past the For-you bound
    for (const t of w.targets.values()) for (const r of t.pk.records) if (r.outcome === 'pending' && now() - r.startedAt >= PK.FOR_YOU_AFTER_MS && !open.has(r.rpId)) open.set(r.rpId, r);
    for (const [rp, id] of [...w.pkForYou]) if (!open.has(rp)) { w.pkForYou.delete(rp); try { forYou.resolve?.(id); } catch (err) { say('pk-fy:' + (err && err.message), `the passkey For-you item was not resolved — ${err && err.message}`); } }
    for (const [rp, r] of open) if (!w.pkForYou.has(rp)) {
      let label = null; try { label = labelOf ? labelOf(w.profileId) : null; } catch { label = null; }
      let id = null; try { id = forYou.add?.(w.profileId, PK.forYouItem(r, { label: label || '' })); } catch (err) { say('pk-fy:' + (err && err.message), `the passkey For-you item was not filed — ${err && err.message}`); }
      if (id) w.pkForYou.set(rp, id);
    }
  }
  /** Cancel every pending ceremony of the conversation's tabs (the agent's `passkey cancel`, the live view's Cancel). */
  async function cancelPasskey(t, { by = 'agent' } = {}) {
    const pid = String(t && t.profileId || '');
    const w = watches.get(pid);
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    const v = passkeyIn(pid, scopeFor(t));
    if (v.state === 'unknown') return { ok: true, n: 0, state: 'unknown', text: PK.UNKNOWN_TEXT };
    let n = 0, rpId = '';
    for (const e of passkeyTabs(w, scopeFor(t))) {
      const ctxs = [...new Set(e.pk.records.filter((r) => r.outcome === 'pending').map((r) => r.ctx))];
      for (const ctx of ctxs) {
        const r = await call(w, 'Runtime.evaluate', { expression: PK.cancelExpression(w.pkKey), contextId: ctx, returnByValue: true }, e.sid);
        const k = r && r.result && r.result.result ? Number(r.result.result.value) || 0 : 0;
        if (k > 0) { n += k; for (const rec of e.pk.records) if (rec.outcome === 'pending' && rec.ctx === ctx) { rec.outcome = 'cancelled'; rec.endedAt = now(); rec.by = by; rpId = rpId || rec.rpId; } }
      }
      if (n) passkeyChanged(w, e);
    }
    return { ok: true, n, rpId, text: PK.cancelText({ n, rpId }) };
  }
  function setTabsOf(fn) { tabsFn = typeof fn === 'function' ? fn : null; }
  /** r4 #2: the orphan tabs of a browser and what they hold (a diagnostic read — the suites, `stats`). */
  function orphansOf(profileId, scope = new Set(['-'])) { const w = watches.get(String(profileId || '')); const ob = orphanBusy(w, scope); return { orphans: ob.orphans ? [...ob.orphans] : [], loop: ob.loop ? ob.loop.targetId : null, busy: ob.busy, loading: w && ob.orphans ? (loadingIn(w.profileId, ob.orphans) || null) : null, open: w && ob.orphans ? !!openIn(w.profileId, ob.orphans) : false }; }
  function stats() { return [...watches.values()].map((w) => ({ profileId: w.profileId, state: w.state, tabs: w.targets.size, enabled: [...w.targets.values()].filter((e) => e.enabled).length, held: [...w.targets.values()].filter((e) => e.heldAt).length, open: [...w.open.values()].map((d) => ({ id: d.id, type: d.type })), answered: w.answered.length, loops: [...w.targets.values()].filter((e) => e.loop).length })); }
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

  return { arm, disarm, factFor, openOn, stuckForKey, pageStuckMap, waitForOpen, answer, noteOutcome, resetOutcomes, verbStarted, verbEnded, verbRunning, scopeFor, onChange, setTabsOf, stats, bindTab, orphansOf, // verify r4 #1: the `tab new` ack binds
    ownsTab, pickTab, stopTab, closeTab, captureTab, noteCut, busyFor, // lane site-reset: a looping tab never disables the browser
    ownTabs, clearSite, // lane site-reset step 2: one site's stored login, cleared
    passkeyIn, cancelPasskey, // lane browser-passkey: a page waiting for a passkey, named and cancellable
    shutdown: () => { shutdown(); try { unsubLease?.(); } catch { /* */ } }, _watches: watches };
}

module.exports = { create, ANSWERED_KEEP, OUTCOMES_KEEP, VERB_RUNNING_MAX_MS, RE_ENABLE_MS };

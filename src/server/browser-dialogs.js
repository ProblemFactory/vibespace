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
 * `Runtime.addBinding` (a random name per ARM) + PURE PK.installHook injected in the MAIN world of every new document
 * (`Page.addScriptToEvaluateOnNewDocument`; the documents already there reached by identity — pkReach, lane
 * passkey-prewrap-fix) — the page's own `navigator.credentials.get / .create` report
 * `start` / `end` here; PK.passkeyVerdict names a ceremony pending PK.PENDING_SAID_MS `passkey_open` (the routes' fact, the
 * verb in flight woken like a dialog, the chip / live-view banner, ONE For-you item per (profile, rpId) after
 * PK.FOR_YOU_AFTER_MS, resolved when it ends). `cancelPasskey` = `Runtime.callFunctionOn` of PK.CTL_FN on the hook's
 * own `ctl` in the ceremony's execution context (found by identity, never through the page's slot): the hooked closure
 * aborts its AbortControllers — the page's promise rejects AbortError.
 * A tab whose hook never armed is `unknown`, never `passkey_open`.
 *
 * ONE BROWSER = ONE SOURCE (lane browser-surfaces, 2026-10-25 — P1 of the custom browser kernel, design-custom-browser-plugin
 * §2): at every socket's open the watch asks `VibeSpace.getVersion` FIRST (before any tab is tracked). No such method (standard
 * Chrome) ⇒ today's road, one journal line, never asked again for that browser. A kernel whose `features` list `surfaces` ⇒ on
 * every page session `VibeSpace.enable {surfaces:true}` then `VibeSpace.listSurfaces {targetId}` (the three-touch rule, at every
 * (re)attach: ① enable ② align `w.surf` — a surface the kernel no longer lists is closed `navigated` by the kernel, a new one is
 * opened ③ the CLI's long-poll is module-wide, so it re-arms by itself) — and the page's own prompts are READ FROM SURFACES:
 * the file-chooser intercept, the Fetch sign-in hook and the deny-ahead permission plan are never installed there, and a
 * `Page.javascriptDialogOpening` / `fileChooserOpened` / `Fetch.authRequired` the kernel sends anyway is ignored by name (the
 * kernel suppresses them once enabled — Q3/Q10; this is the belt). Events are routed by `m.sessionId || params.targetId` (Q2:
 * every VibeSpace.* event rides the flattened PAGE session). PURE src/browser-surfaces.js makes the block (dialogBlock's shape —
 * no reader changes its read), the class (HELD ⇒ `w.open` + the waiters + the idle notice, exactly a dialog's road; NOTED ⇒ one
 * line in the next result + the live view's bar; SILENT ⇒ a journal line), the policy answer (P — answered at once over THIS
 * socket) and the answer verdict; `VibeSpace.answerSurface` answers, its six error codes mapped by name. A HELD surface only
 * the owner can answer files ONE For-you card (`action.type: 'browser-surface'`) after PROMPT_ASK_MS, resolved when it closes.
 */
const ST = require('../browser-stuck.js');
const PK = require('../browser-passkey.js');
const PS = require('../browser-passkey-store.js'); // lane passkey-store-core: the sealed per-profile table + THE GATE (this file is its one writer)
const crypto = require('crypto');
let WS = null; try { WS = require('ws').WebSocket; } catch { WS = null; }
// lane browser-surfaces: the kernel's surfaces (PURE) and the agent belt are asked only on a kernel that HAS surfaces — required
// at first use, so a copy of this file beside the three dialog modules alone (test-browser-passkey's controls) runs unchanged
let SFm = null, PTm = null;
const SF = () => SFm || (SFm = require('../browser-surfaces.js'));
const PT = () => PTm || (PTm = require('../peer-text.js'));
let BLm = null;
const BL = () => BLm || (BLm = require('../browser-login.js')); // lane browser-login: lazily (two passkey suites copy this file beside three modules only)
// lane passkey-sink: the PURE passkey signer — asked only on a kernel with `webauthn` (required at first use, like SF / PT)
let WAm = null;
const WA = () => WAm || (WAm = require('../webauthn-sign.js'));
const PK_ORPHAN_MS = 1500; // a webauthn surface whose request never comes (it began before this socket) is cancelled after this — never a page left waiting
const NATIVE_ON_KERNEL = new Set(['Page.javascriptDialogOpening', 'Page.javascriptDialogClosed', 'Page.fileChooserOpened', 'Fetch.authRequired']); // one source: never read where surfaces are on
const KERNEL_PROBE_MS = 2000; // VibeSpace.getVersion — standard Chrome refuses it in ms (-32601); a socket that never answers is today's road

const ANSWERED_KEEP = 32;
const OUTCOMES_KEEP = 16;
const VERB_RUNNING_MAX_MS = 5 * 60 * 1000;   // a /resolve without its audit is forgotten after this (a crashed CLI)
const SAW_SETTLE_MS = 2000;                  // int347: the audit's wait for a dialog the verb's daemon saw (waitSettled) — bounds only a watch that never sees it
/** lane browser-x-in-window (B2) — MEASURED (Chrome 154, the watch's Fetch hook answering `Default`; tools/probe-auth2.sh): Chrome
 *  shows its own sign-in sheet over a main-frame commit of THIS page (401 → loadingFailed ERR_INVALID_AUTH_CREDENTIALS →
 *  frameNavigated chrome-error://chromewebdata/); an answer is a NEW navigation — the right password commits the page, a wrong
 *  one raises authRequired again (a new sheet), Cancel re-requests and commits the 401's own body. So the sheet stands until a
 *  main-frame commit of any OTHER url. */
const NATIVE_SHEET_PAGE_RE = /^chrome-error:\/\/chromewebdata\//;
const RE_ENABLE_MS = 30 * 1000;              // a held tab's Page.enable is asked again (it answers once the hold ends)
const STOP_RETRIES = 4, STOP_RETRY_MS = 120; // verify r4 #5: Page.stopLoading under "Not attached to an active page" (a page mid-swap) is asked again — ≤ 0.5 s

function create({ keeper = null, WebSocketImpl = WS, log = console, now = Date.now,
  enableTimeoutMs = ST.ENABLE_TIMEOUT_MS, connectTimeoutMs = 3000, callTimeoutMs = 5000, pageAnswerMs = ST.PAGE_ANSWER_MS, closeGoneMs = 2000 /* lane browser-shared-profile-freeze */, captureTimeoutMs = ST.LOOP_SCREENSHOT_MS, quietMs = ST.LOOP_QUIET_MS, reEnableMs = RE_ENABLE_MS, // verify r1: the quiet rule is a clock a fast gate shortens (lane browser-held-not-hung: the re-ask too)
  tabsOf = null, holdersOf = null, leaseCountOf = null, labelOf = null, notice = null, withdraw = null, forYou = null,
  promptAskMs = ST.PROMPT_ASK_MS, authHoldMaxMs = ST.AUTH_HOLD_MAX_MS,
  passkeys = null, takeoverOf = null, vaultUse = null /* lane passkey-sink: (entry, use, o) → {receipt} — the vault's ONE use writer (a kernel signature is a USE of the passkeys' key) */, passkeyOrphanMs = PK_ORPHAN_MS, downloadsDirOf = null /* lane browser-surfaces: profileId → the browser's downloads directory (a file answer is handed from there only) */,
  logins = null /* lane browser-login: src/server/browser-logins.js — the web logins' ONE writer, its grants and its use lines (the watch hands the kernel the values and keeps none) */, conversationOf = null /* lane browser-login: sessionId → {cid, name} (the conversation a submission is told for) */ } = {}) { // lane passkey-store-core: `passkeys` = {read, write, cipher} (the wiring: data/browser-passkeys.json 0600 + the key file); none ⇒ today's tab-native passkeys // lane browser-ui-prompts: the sign-in's two clocks (a fast gate shortens them)
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
  // lane browser-held-not-hung: a held tab is judged against EVERY conversation's answers on this browser (an ok from any
  // of them within OK_RECENT_MS = the page answers) — a blind watch is the row's quiet `blind`, never "not responding"
  const browserVerdict = (pid, tabHeld) => {
    const all = []; for (const [k, list] of outcomes) if (k.startsWith(pid + '|')) all.push(...list);
    let best = ST.stuckVerdict(tabHeld ? all.sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0)) : [], { tabHeld, now: now() });
    if (best.state === 'unresponsive' && best.why === 'tab-held') return best;
    if (best.state !== 'blind' && !best.held) best = { state: 'ok', count: 0 };
    for (const [k, list] of outcomes) if (k.startsWith(pid + '|')) { const v = ST.stuckVerdict(list); if (v.state === 'unresponsive' && (best.state !== 'unresponsive' || v.count > best.count)) best = v; }
    return best;
  };
  let tabsFn = typeof tabsOf === 'function' ? tabsOf : null;
  // lane passkey-store-core: the store handle (ONE writer: here), the profile's hook SLOT name kept across the watch's sockets
  // (a re-arm finds the closure already in the page by it — P0 ④; lane passkey-prewrap-fix: a locator, never a credential —
  // the binding + the key are minted per ARM), the open cards (`pk-…`), the approved registration grants
  const pks = passkeys && typeof passkeys.read === 'function' && typeof passkeys.write === 'function' && passkeys.cipher ? passkeys : null;
  let pkCache = null;
  const pkIds = new Map(), pkAsks = new Map(), pkGrants = new Map();
  const pkIdsFor = (pid) => { if (!pkIds.has(pid)) pkIds.set(pid, { slot: 'vs' + crypto.randomBytes(16).toString('hex'), world: 'vspw' + crypto.randomBytes(10).toString('hex'), chan: 'vspc' + crypto.randomBytes(16).toString('hex') }); return pkIds.get(pid); }; // lane passkey-binding-isolated: + the hook's ISOLATED WORLD name + the SECRET CustomEvent channel (128-bit: the page can neither enter the world nor forge a report)
  const pkDisplacedAt = new Map(); // lane passkey-prewrap-fix: profileId → the episodes a page replaced the credentials API (the Passkeys card's line)
  const sayOnce = new Set();
  const kernelOf = new Map();      // lane browser-surfaces: profileId → false (standard Chrome: never asked again) | {protocol, kinds, features}
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
      pkSlot: pkIdsFor(profileId).slot, pkWorld: pkIdsFor(profileId).world, pkChan: pkIdsFor(profileId).chan, pkForYou: new Map(), pkSeq: 0 /* lane passkey-sink: the kernel ceremonies' numbers */, headed: null, bornAt: now(), // lane browser-passkey; lane passkey-binding-isolated: the isolated world + the secret channel, kept across sockets
      prompts: new Map(), authReq: new Map(), promptNotes: [], promptTimers: new Map(), promptForYou: new Map(), // lane browser-ui-prompts (authReq: prompt id → the paused request — never in a record)
      permCtx: new Map(), grants: new Map(), printing: new Set(), // lane browser-ui-prompts-r2
      kernel: null, surf: new Map(), surfTimers: new Map(), surfForYou: new Map(), nativeIgnored: 0, autoSurf: 0 }; // lane browser-surfaces: null = not asked yet; the open surfaces by id; the owner's card clock + item; the belt's count: contexts decided ahead (ctx → the decision's promise), the agent's per-origin flips, previews being released
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
      await probeKernel(w); // lane browser-surfaces: ONE source per browser — known before the first tab is tracked
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
    ws.on('message', (d) => { try { onMessage(w, d); } catch (err) { say('msg:' + (err && err.message), `${w.profileId}: a CDP event was not handled — ${err && err.message}`); } }); // key-file-law-fix: a throw never leaves the listener (uncaughtException = the hub's exit)
    ws.on('error', (e) => { say('err:' + w.profileId + ':' + (e && e.code), `${w.profileId}: the watch's socket failed — ${e && e.message}`); });
    ws.on('close', () => down(w, 'the browser\'s CDP socket closed'));
  }
  function down(w, why, { keepNotices = false } = {}) {
    if (w.state === 'down') return;
    w.state = 'down';
    for (const id of w.pkForYou.values()) { try { forYou?.resolve?.(id); } catch { /* the tray's own failure */ } } w.pkForYou.clear(); // lane browser-passkey
    for (const rec of [...w.prompts.values()]) dropPrompt(w, rec, 'down'); // lane browser-ui-prompts: a gone socket's paused sign-in is Chrome's again
    w.ready();
    for (const fn of w.waiting.values()) { try { fn({ error: { message: why } }); } catch { /* */ } }
    w.waiting.clear();
    const open = [...w.open.values()];
    for (const rec of w.surf.values()) { surfaceAskDone(w, rec); if (!open.includes(rec)) open.push(rec); } w.surf.clear(); // lane browser-surfaces: a NOTED one is in the live view's bar too
    w.open.clear();
    if (watches.get(w.profileId) === w) watches.delete(w.profileId);
    for (const e of w.targets.values()) { if (e.reEnable) { clearTimeout(e.reEnable); e.reEnable = null; } if (e.quiet) { clearTimeout(e.quiet); e.quiet = null; } }
    emit({ kind: 'down', profileId: w.profileId, why, closed: open.map((d) => d.id) });
    if (!keepNotices) withdrawNotices(open.map((d) => d.id)); // a VibeSpace shutdown keeps them: the dialog is still open in Chrome
  }
  /** One page tab: attach (flat session) + Page.enable — the enable bounded; a tab that never answers is HELD. */
  function track(w, info) {
    if (ST.printTargetVerdict(info)) return releasePrint(w, info); // lane browser-ui-prompts-r2: the print preview is never a tab — it is released
    if (!info || info.type !== 'page' || !info.targetId) return Promise.resolve();
    // lane browser-swiftshader-cpu: thawPaint's own blank tab (opened and closed in ~20 ms) is nobody's — never tracked
    if (w.flipping && !info.openerId && /^(about:blank)?$/.test(String(info.url || ''))) return Promise.resolve();
    if (!w.kernel) decideAhead(w, info.browserContextId || null); // lane browser-surfaces: a kernel's permission asks are surfaces (P deny unless allowed ahead) // lane browser-ui-prompts-r2: no permission prompt ever pends (browser-wide per context: never awaited by the tab's enable)
    const tid = String(info.targetId);
    const known = w.targets.get(tid);
    if (known) { known.url = String(info.url || known.url || ''); known.title = String(info.title || known.title || ''); return known.enabling || Promise.resolve(); }
    const e = { targetId: tid, url: String(info.url || ''), title: String(info.title || ''), sid: null, enabled: false, heldAt: 0, enabling: null, reEnable: null, hops: [], loop: null, req: null, hopStart: null, quiet: null,
      seenAt: w.state === 'open' && w.readySeen ? now() : 0, agentHopAt: 0, owner: null, opener: info.openerId ? String(info.openerId) : null, pk: { armed: false, records: [], binding: '', key: '', ctxs: new Set(), ctl: new Map(), seen: new Set(), frameOf: new Map(), mainCtxOf: new Map() } }; // lane site-reset: a tab that appeared while watched (the agent's `tab new`), the last browser-initiated hop on it
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
    if (w.kernel) await armSurfaces(w, e); // lane browser-surfaces: ① VibeSpace.enable ② listSurfaces — before Page.enable (a held page's enable never answers; its surfaces still list)
    const en = await call(w, 'Page.enable', {}, e.sid, enableTimeoutMs);
    if (en && !en.timeout && !en.error) {
      const was = e.heldAt;
      e.enabled = true; e.heldAt = 0;
      armPasskey(w, e);
      if (!w.kernel) armPrompts(w, e); // lane browser-ui-prompts (lane browser-surfaces: a kernel's chooser / sign-in are surfaces — never hooked twice)
      if (was) emit({ kind: 'held-cleared', profileId: w.profileId, targetId: e.targetId });
      return;
    }
    if (en && en.timeout && w.state === 'open' && w.targets.get(e.targetId) === e) {
      // measured: a tab whose dialog opened before this socket was enabled never answers Page.enable — nothing in
      // VibeSpace can see or answer that dialog; the page is HELD (the unresponsive fact, the user's Restart)
      if (!e.heldAt) { e.heldAt = now(); w.rowJudged = JSON.stringify(rowFact(w.profileId, w) || null); emit({ kind: 'held', profileId: w.profileId, targetId: e.targetId }); }
      // lane browser-held-not-hung: the hold is RE-JUDGED at every re-ask — an `ok` that aged past OK_RECENT_MS moves the
      // verdict without any event of its own (the panel row's digest is re-published only when the row's fact moved)
      else { const row = JSON.stringify(rowFact(w.profileId, w) || null); emit(row !== w.rowJudged ? { kind: 'stuck', profileId: w.profileId, why: 'held-rejudged' } : { kind: 'held-rejudged', profileId: w.profileId, targetId: e.targetId }); w.rowJudged = row; }
      e.reEnable = setTimeout(() => { e.reEnable = null; if (w.state === 'open' && w.targets.get(e.targetId) === e && !e.enabled) enable(w, e); }, reEnableMs);
      if (e.reEnable.unref) e.reEnable.unref();
    }
  }
  function onMessage(w, d) {
    let m; try { m = JSON.parse(typeof d === 'string' ? d : d.toString()); } catch { return; }
    if (m.id && w.waiting.has(m.id)) { const fn = w.waiting.get(m.id); w.waiting.delete(m.id); fn(m); return; }
    const p = m.params || {};
    if (w.kernel && NATIVE_ON_KERNEL.has(m.method)) { w.nativeIgnored++; say('native:' + w.profileId + ':' + m.method, `${w.profileId}: the kernel sent ${m.method} on a session with surfaces on — ignored (one source: its surface is the prompt)`); return; } // lane browser-surfaces: the belt
    switch (m.method) {
      case 'VibeSpace.surfaceOpened': return onSurfaceOpened(w, surfaceTab(w, m), p); // lane browser-surfaces (Q2: routed by the page session, else params.targetId)
      case 'VibeSpace.surfaceUpdated': return onSurfaceUpdated(w, surfaceTab(w, m), p);
      case 'VibeSpace.surfaceClosed': return onSurfaceClosed(w, surfaceTab(w, m), p);
      case 'VibeSpace.webauthnRequest': return pkRequest(w, surfaceTab(w, m), p); // lane passkey-sink: a kernel with `webauthn` — the ceremony's data (its surface is the held card)
      case 'VibeSpace.credentialFormDetected': return onLoginForm(w, surfaceTab(w, m), p); // lane browser-login: a kernel with `credentials` — a form the `login` verb may fill
      case 'VibeSpace.credentialSubmitted': return onLoginSubmitted(w, surfaceTab(w, m), p); // lane browser-login: the page took a form — the vault saves what it should (the ONE writer)
      case 'Target.targetCreated': case 'Target.targetInfoChanged': track(w, p.targetInfo); return;
      case 'Target.targetDestroyed': {
        const tid = String(p.targetId || '');
        const e = w.targets.get(tid);
        if (!e) return;
        w.targets.delete(tid); if (e.sid) w.sessions.delete(e.sid); if (e.reEnable) clearTimeout(e.reEnable);
        if (e.quiet) clearTimeout(e.quiet);
        if (PK.endPending(e.pk.records, { now: now() }).length) passkeyChanged(w, e); // lane browser-passkey: a closed tab waits for nothing
        if (w.prompts.has(tid)) dropPrompt(w, w.prompts.get(tid), 'tab-closed'); // lane browser-ui-prompts
        if (e.owner && keeper && typeof keeper.forgetOwnTab === 'function') { try { keeper.forgetOwnTab(w.profileId, e.owner, tid); } catch { /* the keeper's own failure */ } } // verify r3 #2: the persisted witness goes with the tab
        if (e.loop) { e.loop = null; emit({ kind: 'loop-cleared', profileId: w.profileId, targetId: tid, why: 'tab-closed' }); } // lane site-reset: a closed tab's loop is over
        if (e.heldAt) emit({ kind: 'held-cleared', profileId: w.profileId, targetId: tid, why: 'tab-closed' }); // lane browser-held-not-hung: a closed tab holds nothing (the fact moves)
        for (const rec of [...w.surf.values()]) if (rec.targetId === tid) onSurfaceClosed(w, tid, { surfaceId: rec.id, how: 'tab-closed', by: 'tab-closed' }); // lane browser-surfaces
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
      case 'Page.frameNavigated': { const e = tabOf(w, m); if (e && p.frame && String(p.frame.id || '') === e.targetId && !p.frame.parentId && w.prompts.get(e.targetId)?.type === 'file') dropPrompt(w, w.prompts.get(e.targetId), 'navigated');
        if (e && p.frame && String(p.frame.id || '') === e.targetId && !p.frame.parentId && w.prompts.get(e.targetId)?.native && !NATIVE_SHEET_PAGE_RE.test(String(p.frame.url || ''))) settleNative(w, w.prompts.get(e.targetId)); /* lane browser-x-in-window: Chrome's own sheet answered (or cancelled) — the tab committed a real page (MEASURED: the sheet itself stands over a `chrome-error://chromewebdata/` commit) */ if (e && p.frame && String(p.frame.id || '') === e.targetId && !p.frame.parentId) { endNav(e); hop(w, e, { url: String(p.frame.url || '') }); e.forms = []; /* lane browser-login: a new document — its forms are new too */ } return; }
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
      // lane browser-ui-prompts: the browser's own prompts — a file chooser (intercepted: no window, the page runs on), an HTTP
      // sign-in (paused until the user answers in the live view), every other paused Document request continued at once
      case 'Page.fileChooserOpened': return onPrompt(w, m, 'file', p);
      case 'Fetch.authRequired': return onPrompt(w, m, 'http-auth', p);
      case 'Fetch.requestPaused': { call(w, 'Fetch.continueRequest', { requestId: String(p.requestId || '') }, m.sessionId ? String(m.sessionId) : null); return; }
      case 'Page.javascriptDialogOpening': return onOpen(w, w.sessions.get(String(m.sessionId || '')) || null, p);
      case 'Page.javascriptDialogClosed': return onClosed(w, w.sessions.get(String(m.sessionId || '')) || null, p);
      // lane browser-passkey: the hook's report; a document that went ends its pending ceremonies (the page no longer waits)
      case 'Runtime.bindingCalled': {
        const e = tabOf(w, m); if (!e || !e.pk.binding || p.name !== e.pk.binding) return; // lane passkey-prewrap-fix: this arm's binding
        // lane passkey-binding-isolated: the report comes from the document's ISOLATED-WORLD reporter — key the record by the
        // document's MAIN-world context (where `ctl` lives, so cancel / hold reach it), resolved by frame.
        const fid = e.pk.frameOf.get(Number(p.executionContextId));
        const ctx = fid != null && e.pk.mainCtxOf.has(fid) ? e.pk.mainCtxOf.get(fid) : Number(p.executionContextId);
        const ev = PK.parseEvent(p.payload);
        const rec = ev && PK.applyEvent(e.pk.records, ev, { tab: e.targetId, ctx, now: now() });
        if (!rec) return;
        passkeyChanged(w, e, ev.ev === 'start');
        if (pks) (ev.ev === 'start' ? pkGate(w, e, rec).catch((err) => pkFailed(w, e, rec, err)) : pkEnd(w, e, rec).catch((err) => say('pk-flow:' + (err && err.message), `${w.profileId}: a passkey ceremony step failed — ${err && err.message}`))); // lane passkey-store-core // key-file-law-fix: a failed gate releases
        return;
      }
      case 'WebAuthn.credentialAdded': case 'WebAuthn.credentialAsserted': { const e = tabOf(w, m); if (e && pks) { try { pkHarvest(w, e, m.method, p); } catch (err) { pkFailed(w, e, null, err); } } return; } // lane passkey-store-core: the harvest
      // lane passkey-prewrap-fix: the main-world documents a (re-)arm reaches by identity
      case 'Runtime.executionContextCreated': { const e = tabOf(w, m); const c = p.context; if (e && c) { const fid = c.auxData && c.auxData.frameId ? String(c.auxData.frameId) : ''; e.pk.frameOf.set(Number(c.id), fid); if (c.auxData && c.auxData.isDefault) { e.pk.ctxs.add(Number(c.id)); if (fid) e.pk.mainCtxOf.set(fid, Number(c.id)); } } return; } // lane passkey-binding-isolated: every context's frame (an isolated reporter's report maps back to the main world by it)
      case 'Runtime.executionContextDestroyed': { const e = tabOf(w, m); if (e) { const id = Number(p.executionContextId); e.pk.ctxs.delete(id); e.pk.ctl.delete(id); const fid = e.pk.frameOf.get(id); e.pk.frameOf.delete(id); if (fid != null && e.pk.mainCtxOf.get(fid) === id) e.pk.mainCtxOf.delete(fid); } if (e && PK.endPending(e.pk.records, { now: now(), ctx: Number(p.executionContextId) }).length) passkeyChanged(w, e); return; }
      case 'Runtime.executionContextsCleared': { const e = tabOf(w, m); if (e) { e.pk.ctxs.clear(); e.pk.ctl.clear(); e.pk.frameOf.clear(); e.pk.mainCtxOf.clear(); } if (e && PK.endPending(e.pk.records, { now: now() }).length) passkeyChanged(w, e); return; }
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
    if (d.surface) { // lane browser-surfaces: the kernel's prompt — its own answers (accept → its OK / its text answer, dismiss → its dismiss)
      const pick = SF().dialogAnswerOf(d, { accept, text });
      if (!pick) return { ok: false, code: 'bad_answer', error: `that prompt has no ${accept ? 'accept' : 'dismiss'} answer — vibespace-browser surfaces names its answers` };
      const r = await answerSurfaceOn(w, d, { answerId: pick.answerId, values: pick.values, files: null, by });
      return r.ok ? { ok: true, dialog: d } : r;
    }
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

  // ── lane browser-swiftshader-cpu: IDLE PAINT (src/browser-idle.js) — the keeper's tick freezes, a verb / a viewer thaws ──
  const settle = (p) => Promise.resolve(p).then((m) => m, () => null);
  /** What the idle-paint verdict reads of one browser's watch (null = no open watch: nothing to drive). */
  function paintFacts(profileId) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open') return null;
    const loading = [...w.targets.values()].some((e) => e.navSince > 0);
    return { frozen: w.paint === 'frozen', lastVerbAt: w.lastVerbAt || w.bornAt || 0, busy: w.open.size > 0 || loading || !!w.thawing, frozenAt: w.frozenAt || 0, fronts: (w.fronts || []).length, hidden: w.hiddenFronts ? w.hiddenFronts.size : 0, title: [...w.targets.values()].map((e) => e.title).find(Boolean) || null };
  }
  /** Every tab of the browser FROZEN (measured: the only act that stops an Xvfb window drawing — IDLE_PAINT_PROOF). The tabs
   *  in front are remembered: a frozen page is hidden, and only its tab strip shows it again (thawPaint). */
  async function freezePaint(profileId) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open' || w.paint === 'frozen' || w.thawing || w.open.size) return { ok: false };
    const tabs = [...w.targets.values()].filter((e) => e.sid);
    const fronts = []; const t0 = now();
    for (const e of tabs) { const v = await settle(call(w, 'Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }, e.sid, 1000)); if (v && v.result && v.result.result && v.result.result.value === 'visible') fronts.push(e.targetId); }
    if (w.thawing || (w.lastVerbAt || 0) >= t0) return { ok: false }; // a verb arrived while the fronts were read
    // r2: a front another conversation has not shown again since the last freeze stays owed to it (it is hidden now, not visible)
    const owed = [...(w.hiddenFronts || [])].filter((tid) => w.targets.has(tid));
    w.paint = 'frozen'; w.fronts = fronts; w.hiddenFronts = new Set([...owed, ...fronts]); w.frozenAt = now();
    for (const e of tabs) await settle(call(w, 'Page.setWebLifecycleState', { state: 'frozen' }, e.sid, 1000));
    return { ok: true, tabs: tabs.length, fronts: fronts.length };
  }
  /** Undo freezePaint BEFORE a verb runs / when a live view attaches: every tab active again (a hidden page then still draws
   *  nothing), and each tab that was in front AND is the asking conversation's (`holder` = the route's dialog target / the
   *  viewer's {profileId, browserKey}; null = every tab — the sweep's own thaw) shown by its tab strip (measured: `active`
   *  alone leaves it hidden — a blank tab opened and closed, the page activated). Lane browser-swiftshader-cpu-r2 (heavy
   *  test-browser-hidden-paint e, measured red before): a thaw for A flipped B's window too, and its blank landed in the
   *  window activated LAST (WINDOWS_PROOF: a plain create lands there) — now only the asker's fronts, each activated FIRST.
   *  Another conversation's front stays owed (hiddenFronts) until ITS verb / viewer. */
  function thawPaint(profileId, { holder = null } = {}) {
    const w = watches.get(String(profileId || ''));
    if (!w) return Promise.resolve({ ok: true, thawed: false });
    if (w.thawing) return w.thawing.then(() => thawPaint(profileId, { holder }), () => thawPaint(profileId, { holder }));
    const scope = holder ? scopeFor(holder) : null;
    const need = [...(w.hiddenFronts || [])].filter((tid) => inScope(scope, tid));
    if (w.paint !== 'frozen' && !need.length) return Promise.resolve({ ok: true, thawed: false });
    w.thawing = (async () => {
      try {
        if (w.paint === 'frozen') { for (const e of w.targets.values()) if (e.sid) await settle(call(w, 'Page.setWebLifecycleState', { state: 'active' }, e.sid, 1000)); w.paint = 'active'; w.thawedAt = now(); }
        const shown = [];
        for (const tid of need) { w.hiddenFronts.delete(tid); if (w.targets.has(tid)) shown.push(await showFront(w, tid)); }
        return { ok: true, thawed: true, shown };
      } finally { w.fronts = []; w.thawing = null; }
    })();
    return w.thawing;
  }
  /** One frozen front shown again IN ITS OWN WINDOW: activated first (its window becomes the last activated one — where a
   *  plain create lands), a blank opened, its window read off Chrome (getWindowForTarget), closed, the front activated. A
   *  blank that landed elsewhere (another holder's activation raced it) is closed at once and journaled — never kept. */
  async function showFront(w, tid) {
    const winOf = async (id) => { const r = await settle(call(w, 'Browser.getWindowForTarget', { targetId: id }, null, 1000)); return r && r.result ? r.result.windowId : null; };
    w.flipping = (w.flipping || 0) + 1;
    try {
      const want = await winOf(tid);
      await settle(call(w, 'Target.activateTarget', { targetId: tid }, null, 2000));
      const b = await settle(call(w, 'Target.createTarget', { url: 'about:blank' }, null, 2000));
      const bid = b && b.result && b.result.targetId;
      const got = bid ? await winOf(bid) : null;
      if (bid) await settle(call(w, 'Target.closeTarget', { targetId: bid }, null, 2000));
      await settle(call(w, 'Target.activateTarget', { targetId: tid }, null, 2000));
      if (bid && want != null && got !== want) { try { log.warn?.(`[browser-dialogs] ${w.profileId}: the idle-paint thaw's blank tab opened in window ${got}, not the tab's window ${want} — closed at once`); } catch { /* */ } }
      return { targetId: tid, window: want, blankIn: got };
    } finally { w.flipping -= 1; }
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
    return d ? blockOf(d) : null;
  }
  /** lane browser-surfaces: the block a reader gets — a surface's own (dialogBlock's shape + its answers / fields / detail), else
   *  the dialog's. */
  function blockOf(d, { at = now() } = {}) { return d && d.surface ? SF().blockAt(d, { now: at }) : ST.dialogBlock(d, { now: at }); }
  /** THE SENTENCE of a held dialog / surface — a js-dialog surface keeps `dialog accept|dismiss`'s words; every other kind is
   *  browser-surfaces' sentence through THE BELT (src/peer-text.js — the page's words ride it). */
  function sentenceOf(d, { at = now(), repeat = false } = {}) { return d && d.surface && d.kind !== 'js-dialog' ? PT().toAgentText(SF().surfaceText(d, { now: at, repeat }), { max: SF().TEXT_MAX }) : ST.dialogText(d, { now: at, repeat }); }
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
    for (const e of w.targets.values()) if (e.heldAt && inScope(scope, e.targetId)) return { at: e.heldAt, targetId: e.targetId, title: e.title || '' };
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
      for (const a of w.promptNotes) { if (seen.has(a.id) || !inScope(scope, a.targetId)) continue; if (consume) seen.add(a.id); const words = a.kind === 'print' ? ST.printNote(a) : a.kind === 'surface' ? PT().toAgentText(SF().surfaceNote(a), { max: SF().TEXT_MAX }) : ST.promptAnsweredNote(a); if (words) notes.push(words); } // lane browser-surfaces: + a kernel prompt's one line (noted / policy / answered by the user) // lane browser-ui-prompts (+ r2: the page tried to print, once per occurrence): who answered a sign-in, never what
      if (alerts.length > ST.ALERT_NOTES_MAX) notes.unshift(ST.alertsNote(alerts));
      else notes.unshift(...alerts.map((a) => ST.answeredNote(a)).filter(Boolean));
      if (seen.size > 256) { const keep = [...seen].slice(-128); told.set(browserKey, new Set(keep)); }
    }
    const verdict = ST.stuckVerdict(outcomes.get(okey(pid, browserKey)) || [], { tabHeld: watched ? heldIn(pid, scope) : null, now: t }); // lane browser-held-not-hung: the page's answers outrank a hold
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
      open: d ? blockOf(d, { at: t }) : null, // lane browser-surfaces: a surface's own block
      text: d ? sentenceOf(d, { at: t, repeat: true }) : '',
      targetId: d ? d.targetId : null,
      notes,
      stuck: !d && !loop && verdict.state === 'unresponsive' ? { ...verdict, text: ST.stuckAgentText(verdict) } : null,
      // lane browser-held-not-hung: a held tab in scope while the page answers (or nothing was asked yet) — the watch's own
      // `blind` fact (the chip / the live view's quiet line), never the agent's "not responding"
      held: !d && !loop && (verdict.state === 'blind' || verdict.held) ? ST.stuckFact({ verdict }) : null,
      loop: loop ? { ...ST.loopBlock(loop), runStart: loop.runStart, text: ST.loopText(loop) } : null,
      loopAny: loopAny ? { ...ST.loopBlock(loopAny), runStart: loopAny.runStart } : null,
      loopShared, // verify r1: kinds only
      passkey: watched ? PK.passkeyBlock(passkeyIn(pid, scope)) : null, // lane browser-passkey: `passkey_open` with THE SENTENCE, `unknown` where no hook armed
      prompt: watched ? ST.promptBlock(promptIn(pid, scope), { now: t }) : null, // lane browser-ui-prompts: a file chooser / an HTTP sign-in, with THE SENTENCE
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
      // lane passkey-ui: + `passkey_ask` — the page waits for the OWNER's card: the fact carries that card (the live banner's buttons)
      if (!f.open && f.passkey && f.passkey.state === PK.PASSKEY_ASK_CODE) { const a = f.passkey.proposal ? pkAsks.get(String(f.passkey.proposal)) : null; return { state: 'passkey', passkey: f.passkey, ...(a && a.state === 'open' ? { card: a.card } : {}), headed: false, since: f.passkey.startedAt, profileId: c.profileId }; }
      if (!f.open && f.passkey && f.passkey.state === PK.PASSKEY_OPEN_CODE) return { state: 'passkey', passkey: f.passkey, headed: onDesktop(c.profileId), since: f.passkey.startedAt, profileId: c.profileId };
      const fact = ST.stuckFact({ dialog: f.open ? { ...f.open, id: f.open.id } : null, prompt: f.prompt, verdict: f.stuck || (f.held && !f.loopAny ? f.held : null), loop: f.loopAny, now: now() }); // lane browser-ui-prompts: + the browser's own prompt
      if (fact) return { ...fact, profileId: c.profileId };
    }
    return null;
  }

  // ── the verb in flight (rule 1) ──
  /** Resolve at the first HELD dialog that opens in the conversation's scope (or is already open) — the long-poll the
   *  CLI keeps while its verb runs; null at `ms`. The bound is the event, never a clock. */
  // lane site-reset: `loop: {after}` — the verb also ends at a navigation loop judged in its scope whose run began at or
  // after `after` (a navigation verb passes its own start: the old page's loop is not its; the new page's is)
  function waitForOpen({ profileId, browserKey = '', sessionId = null, ephemeral = false } = {}, ms = 20000, { signal = null, loop = null, passkey = false, prompt = false } = {}) {
    const pid = String(profileId || '');
    const scope = () => scopeFor({ profileId: pid, browserKey, sessionId, ephemeral });
    const d = openIn(pid, scope());
    if (d) return Promise.resolve({ dialog: d, via: 'already-open', at: now() });
    if (loop) { const l = loopIn(pid, scope(), { after: Number(loop.after) || 0, current: true }); if (l) return Promise.resolve({ loop: l, via: 'already-looping', at: now() }); }
    if (passkey) { const v = passkeyIn(pid, scope()); if (v.state === PK.PASSKEY_OPEN_CODE || v.state === PK.PASSKEY_ASK_CODE) return Promise.resolve({ passkey: PK.passkeyBlock(v), via: 'already-waiting', at: now() }); } // lane browser-passkey
    if (prompt) { const r = promptIn(pid, scope()); if (r && r.type === 'http-auth') return Promise.resolve({ prompt: ST.promptBlock(r, { now: now() }), via: 'already-waiting', at: now() }); } // lane browser-ui-prompts-r2
    return new Promise((resolve) => {
      let t = null;
      const x = { profileId: pid, scope, loop: loop ? { after: Number(loop.after) || 0 } : null, passkey: !!passkey, prompt: !!prompt, resolve: (v) => { if (t) clearTimeout(t); resolve(v); } };
      waiters.add(x);
      t = setTimeout(() => { if (waiters.delete(x)) resolve(null); }, Math.max(0, Math.min(Number(ms) || 0, 60000)));
      if (t.unref) t.unref();
      // the asker went away (the CLI's verb ended, its request aborted) ⇒ the waiter goes too
      if (signal) { if (signal.aborted) { waiters.delete(x); clearTimeout(t); resolve(null); } else signal.addEventListener('abort', () => { if (waiters.delete(x)) { clearTimeout(t); resolve(null); } }, { once: true }); }
    });
  }
  /** int347 (the alert race, test-browser-dialog-chrome ⑤ / test-browser-hidden-paint d): the verb's OWN daemon printed a
   *  page dialog (its «… dialog is blocking the page» line) — resolve once THIS watch has that dialog's fact in the
   *  conversation's scope: a dialog of that type opened at or after this verb's start (`verbKey`'s running record, on
   *  THIS watch's clock — call it before the verb is ended), held open or closed and not yet told. The watch's own open / closed event ends the wait (an alert is accepted, then recorded at
   *  Page.javascriptDialogClosed — one CDP round trip after the daemon already saw it open, the window the audit used to
   *  read an empty fact in, the note then told to the NEXT verb). `ms` bounds only a watch that never sees it. */
  function waitSettled({ profileId, browserKey = '', sessionId = null, ephemeral = false } = {}, { type = null, verbKey = '' } = {}, ms = SAW_SETTLE_MS) {
    const pid = String(profileId || '');
    const rv = running.get(String(verbKey || browserKey || ''));
    const since = (rv && rv.on && rv.on[pid] && Number(rv.on[pid].at)) || 0; // the verb's own start (verbStarted at its /resolve)
    const fits = (d) => !!d && (!type || d.type === type) && (Number(d.openedAt) || 0) >= since;
    const has = () => {
      const w = watches.get(pid);
      if (!w || w.state !== 'open') return true; // no watch ⇒ nothing to wait for (the CLI reads its daemon's line)
      const scope = scopeFor({ profileId: pid, browserKey, sessionId, ephemeral });
      if ((scope instanceof Set && scope.size === 0) || blindIn(pid, scope)) return true; // what this watch cannot see is never awaited
      if (fits(openIn(pid, scope))) return true;
      const seen = told.get(browserKey);
      return w.answered.some((a) => fits(a.dialog) && inScope(scope, a.targetId) && !(seen && seen.has(a.id)));
    };
    if (has()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let t = null;
      const off = onChange((ev) => { if (ev && ev.profileId === pid && (ev.kind === 'open' || ev.kind === 'closed' || ev.kind === 'down') && has()) { off(); if (t) clearTimeout(t); resolve(true); } });
      t = setTimeout(() => { off(); resolve(false); }, Math.max(0, Math.min(Number(ms) || 0, SAW_SETTLE_MS)));
      if (t.unref) t.unref();
    });
  }
  function verbStarted(browserKey, { profileId = null, verb = null } = {}) {
    if (verb === 'upload' && profileId) { const w = watches.get(String(profileId)); if (w) for (const rec of [...w.prompts.values()]) if (rec.type === 'file') dropPrompt(w, rec, 'uploaded'); } // lane browser-ui-prompts: the agent's upload answers the chooser
    if (!browserKey) return;
    if (profileId && watches.get(String(profileId))) watches.get(String(profileId)).lastVerbAt = now(); // lane browser-swiftshader-cpu
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
      try { notice(h.sessionId, { kind: 'browser-dialog', dialog: blockOf(d), ...(d.surface && d.kind !== 'js-dialog' ? { text: sentenceOf(d) } : {}), label: h.ephemeral ? null : label }); let ss = noticedSessions.get(d.id); if (!ss) { ss = new Set(); noticedSessions.set(d.id, ss); } ss.add(h.sessionId); } catch (e) { say('notice:' + (e && e.message), `the idle dialog notice was not queued — ${e && e.message}`); } // lane browser-surfaces: a kernel prompt's own sentence rides the notice
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
    return r.ok ? { ok: true, dialog: blockOf(r.dialog), text: r.dialog.surface && r.dialog.kind !== 'js-dialog' ? `the browser prompt was ${accept ? 'accepted' : 'dismissed'}` : ST.answerDoneText(r.dialog, { accept: !!accept, text }) } : r;
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
  async function closeTab(t, { targetId = null } = {}) {
    const w = watches.get(String((t && t.profileId) || ''));
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    // lane browser-shared-profile-freeze: a tab NAMED by id (page_busy's way out — a popup holding a dialog nobody can answer):
    // the conversation's own only (ownsTab — a popup of its page is its opener's), closed through this socket (the driver's own
    // `tab close` reads the tab list through the very driver the held page holds: measured tabs_unreadable after 13–19 s)
    if (targetId) {
      // only a tab NOBODY can answer (held — its Page domain never answered — or silent to one bounded ask now): a tab that
      // answers is closed by the conversation's own `tab close`, with its bookkeeping and its fence's words (the CLI falls
      // through on `tab_answers` / `not_your_tab`); then the conversation's own only
      const e0 = w.targets.get(String(targetId).toUpperCase());
      if (!e0) return { ok: false, code: 'not-found', error: 'that tab is not open in your browser' };
      if (!e0.heldAt) { const a = e0.sid ? await call(w, 'Runtime.evaluate', { expression: '1', returnByValue: true }, e0.sid, Math.min(1500, pageAnswerMs)) : null; if (a && !a.timeout && !a.error && a.result) return { ok: false, code: 'tab_answers', error: 'that tab answers — it is closed through your browser as usual' }; }
      const own = ownsTab(t, String(targetId).toUpperCase()); if (!own.ok) return own;
    }
    const e = targetId ? w.targets.get(String(targetId).toUpperCase()) : pickTab(t, { current: true });
    if (!e) return { ok: false, code: 'no_loop', error: 'no tab of yours is looping' };
    const was = e.loop ? { ...ST.loopBlock(e.loop) } : null;
    const pages = [...w.targets.values()].length;
    let opened = false;
    if (pages <= 1) { const c = await call(w, 'Target.createTarget', { url: 'about:blank' }, null, 3000); opened = !!(c && c.result && c.result.targetId); }
    const r = await call(w, 'Target.closeTarget', { targetId: e.targetId }, null, 3000);
    if (!r || r.timeout || r.error || (r.result && r.result.success === false)) return { ok: false, code: 'close_failed', error: r && r.error ? String(r.error.message || 'refused') : 'the browser did not close it' };
    // lane browser-shared-profile-freeze: a close BY ID is said CLOSED only once the tab is gone — measured: Chrome answers
    // closeTarget `success` at once, but a page holding its main thread outlives the ask until its script lets go
    if (targetId) { const until = now() + closeGoneMs; while (w.targets.get(e.targetId) === e && now() < until) await new Promise((res) => setTimeout(res, 50)); if (w.targets.get(e.targetId) === e) return { ok: false, code: 'close_pending', error: ST.closePendingText({ url: e.url, title: e.title, ms: closeGoneMs }) }; }
    return { ok: true, url: ST.pageText(e.url, 300), title: ST.pageText(e.title, 120), was, targetId: e.targetId, opened };
  }
  /**
   * lane browser-shared-profile-freeze: DOES THE TAB A VERB ACTS ON ANSWER? One `Runtime.evaluate` per tab on THIS socket's
   * own session (never the conversation's driver — its queue is what a silent page holds), all at once, each bounded by
   * `boundMs`. `targets` = the tab(s) the verb acts on (a named lease's own tab), else every tab of the conversation (its
   * ephemeral browser — the current one is the driver's), of those only the ones the agent worked in when there are any; the
   * ask settles at the FIRST answer (`answered: null` = not waited for). A silent tab carries the tabs IT opened that this socket holds
   * (`popups`: their Page domain never answered — a dialog that opened before anything saw it); `worked` = a tab the agent
   * navigated (its keeper-bound blank and its pages' popups are not). → ST.pageBusyVerdict's
   * `ask` (`{asked:false}` when nothing is watched). Never throws.
   */
  async function pageAnswers(t, { targets = null, boundMs = pageAnswerMs } = {}) {
    const w = watches.get(String((t && t.profileId) || ''));
    if (!w || w.state !== 'open') return { asked: false };
    const scope = t && t.ephemeral ? null : scopeFor(t);
    const want = Array.isArray(targets) && targets.length ? targets.map((x) => String(x).toUpperCase()) : [...w.targets.keys()].filter((tid) => inScope(scope, tid));
    const rows = want.map((tid) => w.targets.get(tid)).filter((e) => e && e.sid);
    if (!rows.length) return { asked: false };
    // only the tabs the verb can act on are asked — the ones the agent worked in (navigated), else every one — and the ask
    // SETTLES at the first answer (the verb then runs): a silent sibling never costs a healthy page's verb the bound
    const worked = rows.filter((e) => (e.agentHopAt || 0) > 0), judged = worked.length ? worked : rows;
    const pages = judged.map((e) => ({ targetId: e.targetId, url: e.url, title: e.title, answered: null, ms: null, popups: [], worked: (e.agentHopAt || 0) > 0 }));
    await new Promise((resolve) => {
      let left = judged.length;
      judged.forEach((e, i) => {
        const t0 = now();
        call(w, 'Runtime.evaluate', { expression: '1', returnByValue: true }, e.sid, boundMs).then((r) => {
          const answered = !!(r && !r.timeout && !r.error && r.result);
          pages[i].answered = answered; pages[i].ms = now() - t0;
          if (!answered) pages[i].popups = [...w.targets.values()].filter((q) => q.opener === e.targetId && q.heldAt).map((q) => ({ targetId: q.targetId, url: q.url, title: q.title }));
          if (answered || --left === 0) resolve();
        });
      });
    });
    return { asked: true, boundMs, pages };
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
    return cands.map((e) => ({ targetId: e.targetId, url: e.url, title: e.title || '' })); // lane browser-takeover-queue: + the title (a takeover request names the tab it is about)
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
    // lane browser-held-not-hung: judged WITH the browser's hold — an ok over a held tab moves the verdict too
    const judge = () => ST.stuckVerdict(list, { tabHeld: heldIn(pid, null), now: now() }).state;
    const before = judge();
    list.push({ at, state }); if (list.length > OUTCOMES_KEEP) list.splice(0, list.length - OUTCOMES_KEEP);
    outcomes.set(k, list);
    if (outcomes.size > 1024) outcomes.delete(outcomes.keys().next().value);
    const after = judge();
    if (after !== before) emit({ kind: 'stuck', profileId: pid, state: after });
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
      const r = rowFact(pid, w);
      if (r) out[pid] = r;
    }
    return out;
  }
  /** One browser's row fact after its dialog (kinds only). lane browser-held-not-hung: a blind watch is `blind` (no tab
   *  title — the digest reaches agents). */
  function rowFact(pid, w) {
    if (!w || w.state !== 'open') return null;
    const lp = loopIn(pid, null); // lane site-reset: kinds only here (the digest reaches agents — never a page's address)
    if (lp) return { state: 'loop', since: lp.runStart || 0 };
    const v = browserVerdict(pid, heldIn(pid, null));
    if (v.state === 'unresponsive') return { state: 'unresponsive', why: v.why, count: v.count || 0, since: v.since || 0 };
    if (v.state === 'blind' || v.held) return { state: 'blind', why: 'held', since: Number(v.since || (v.held && v.held.since)) || 0 };
    return null;
  }
  // ── lane browser-passkey: the ceremony hook ──
  function armPasskey(w, e) {
    if (pkSinks(w)) return null; // lane passkey-sink: a kernel with `webauthn` — no hook, no virtual authenticator (both stay for standard Chrome)
    if (!e.pk.armed && !e.pk.arming && e.sid) e.pk.arming = armHook(w, e, e.sid).finally(() => { e.pk.arming = null; });
    return e.pk.arming || null;
  }
  // lane passkey-prewrap-fix (passkey-verify lens ②): a binding + a key minted for THIS arm (never the profile's); new
  // documents get the hook from the script, the documents already here are reached by identity (pkReach) — never
  // `runImmediately`, which ran the hook over whatever the page had put in the slot by then
  const pkSource = (w, e) => PK.hookSource({ chan: w.pkChan, key: e.pk.key, slot: w.pkSlot, hold: !!pks });
  const pkReporter = (w, e) => PK.reporterSource({ binding: e.pk.binding, chan: w.pkChan }); // lane passkey-binding-isolated: the isolated-world forwarder (holds the binding)
  async function armHook(w, e, sid) {
    e.pk.binding = 'vs' + crypto.randomBytes(12).toString('hex'); e.pk.key = crypto.randomBytes(16).toString('hex'); e.pk.ctl.clear();
    // lane passkey-binding-isolated (B-7c9a): the binding is armed with `executionContextName` so it lands ONLY in the hook's
    // isolated world (never the page's main-world global); the main-world hook reports through the secret-named CustomEvent,
    // and the isolated-world reporter (a second script in the same world) holds the binding and forwards each report.
    const r1 = await call(w, 'Runtime.addBinding', { name: e.pk.binding, executionContextName: w.pkWorld }, sid);
    const r2 = r1 && r1.result ? await call(w, 'Page.addScriptToEvaluateOnNewDocument', { source: pkSource(w, e) }, sid) : null;
    const rr = r2 && r2.result ? await call(w, 'Page.addScriptToEvaluateOnNewDocument', { source: pkReporter(w, e), worldName: w.pkWorld }, sid) : null;
    const r3 = rr && rr.result ? await call(w, 'Runtime.enable', {}, sid) : null; // the documents that go (a navigation ends its ceremonies) + the ones here
    e.pk.armed = !!(r3 && r3.result) && e.sid === sid;
    if (e.pk.armed) for (const ctx of [...e.pk.ctxs]) await pkReach(w, e, ctx, { arm: true });
    if (e.pk.armed && pks) e.pk.auth = await pairAuthenticator(w, e, sid); // lane passkey-store-core: the tab's EMPTY authenticator, re-paired on every attach
    if (!e.pk.armed) say('pk-arm:' + w.profileId, `${w.profileId}: the passkey hook did not arm on a tab — its passkey requests read as unknown (${(r1 && r1.error && r1.error.message) || (r2 && r2.error && r2.error.message) || (rr && rr.error && rr.error.message) || (r3 && r3.error && r3.error.message) || 'no answer'})`);
  }
  /** lane browser-passkey-chrome (MEASURED on 0.38.1): Chrome draws its passkey dialog TAB-MODAL in the browser's own window —
   *  on this computer's desktop only when that window is. The hidden-window rung's window is on the CLI's own Xvfb, which
   *  nobody sees: the banner's desktop note there sent the user looking for a window that is not on any screen. */
  function onDesktop(profileId) {
    if (pkSinks(watches.get(String(profileId)))) return false; // lane passkey-sink: the kernel draws no passkey window — VibeSpace answers
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
    if (v.state === PK.PASSKEY_OPEN_CODE || v.state === PK.PASSKEY_ASK_CODE) for (const x of [...waiters]) if (x.profileId === w.profileId && x.passkey && inScope(x.scope(), e.targetId)) { waiters.delete(x); x.resolve({ passkey: PK.passkeyBlock(v), via: 'event', at: now() }); }
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
    let n = 0, kn = 0, rpId = '';
    for (const e of passkeyTabs(w, scopeFor(t))) {
      for (const rec of e.pk.records.filter((r) => r.kernel && r.outcome === 'pending')) if (await pkKernelCancel(w, e, rec, by)) { n++; kn++; rpId = rpId || rec.rpId; } // lane passkey-sink: the kernel ends it (cancelSurface) — the page sees NotAllowedError
      const ctxs = [...new Set(e.pk.records.filter((r) => r.outcome === 'pending' && !r.kernel).map((r) => r.ctx))];
      for (const ctx of ctxs) {
        const r = await pkCall(w, e, ctx, 'cancel');
        const k = r && r.result && r.result.result ? Number(r.result.result.value) || 0 : 0;
        if (k > 0) { n += k; for (const rec of e.pk.records) if (rec.outcome === 'pending' && rec.ctx === ctx) { rec.outcome = 'cancelled'; rec.endedAt = now(); rec.by = by; rpId = rpId || rec.rpId; } }
      }
      if (n) passkeyChanged(w, e);
    }
    return { ok: true, n, rpId, text: PK.cancelText({ n, rpId, kernel: kn > 0 }) };
  }
  // ── lane passkey-store-core: THE PASSKEY STORE'S CEREMONIES (docs/design-passkey-store.zh.md; P0's corrections) ──
  // The tab's virtual authenticator is EMPTY between ceremonies; a held ceremony is judged by PURE PS.gateVerdict and only
  // the rows it may use are loaded for it; `end` unloads everything. THIS file is the store's ONE writer.
  const pkRead = () => { if (!pkCache) { let raw = null; try { raw = pks.read(); } catch (e) { say('pk-read:' + (e && e.message), `the passkey store could not be read — ${e && e.message}`); } pkCache = PS.normalizeStore(raw); } return pkCache; };
  const pkWrite = (next) => { pkCache = PS.normalizeStore(next); try { pks.write(pkCache); return true; } catch (e) { say('pk-write:' + (e && e.message), `the passkey store was not written — ${e && e.message}`); return false; } }; // lane passkey-sink: → on disk?
  const b64 = (u) => { const s = String(u || '').replace(/-/g, '+').replace(/_/g, '/'); return s + '='.repeat((4 - (s.length % 4)) % 4); };
  const b64u = (s) => String(s || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  /** P0 (b): `enable` and the authenticator are ONE step — an enabled domain with no authenticator hangs every get. */
  async function pairAuthenticator(w, e, sid) {
    const en = await call(w, 'WebAuthn.enable', { enableUI: false }, sid);
    if (!en || !en.result) { say('pk-auth:' + w.profileId, `${w.profileId}: the passkey authenticator was not attached — ${(en && en.error && en.error.message) || 'no answer'}`); return null; }
    const a = await call(w, 'WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: false, automaticPresenceSimulation: true } }, sid);
    const id = a && a.result && a.result.authenticatorId ? String(a.result.authenticatorId) : null;
    if (!id) { await call(w, 'WebAuthn.disable', {}, sid); say('pk-auth:' + w.profileId, `${w.profileId}: the passkey authenticator was not attached — ${(a && a.error && a.error.message) || 'no answer'}`); }
    return id;
  }
  const pkCtl = (w, e, rec, verb) => (rec && rec.kernel ? pkKernelCtl(w, e, rec, verb) : pkCall(w, e, rec ? rec.ctx : null, verb, rec ? rec.n : 0)); // lane passkey-sink: a kernel's ceremony is answered over VibeSpace.*
  /** lane passkey-prewrap-fix (passkey-verify lens ②): OUR closure in a document, by OBJECT IDENTITY — the private field the
   *  hook stamped on CredentialsContainer.prototype under the profile's slot name (page script can neither read one nor make
   *  one without that name). On an ARM: found ⇒ REARM (this arm's binding + key; a slot the page took is taken back —
   *  `hook-displaced`); none ⇒ the hook evaluated into the document as it is; two ⇒ neither is called. Nothing is ever
   *  handed to whatever sits in the slot. */
  async function pkFind(w, sid, ctx) {
    const P = await call(w, 'Runtime.evaluate', { expression: 'CredentialsContainer.prototype', contextId: ctx }, sid);
    const id = P && P.result && P.result.result && P.result.result.objectId;
    if (!id) return { n: -1, ctl: null };
    const g = await call(w, 'Runtime.getProperties', { objectId: String(id), ownProperties: true }, sid);
    const hit = ((g && g.result && g.result.privateProperties) || []).filter((x) => x && x.name === '#' + w.pkSlot && x.value && x.value.objectId);
    return { n: hit.length, ctl: hit.length === 1 ? String(hit[0].value.objectId) : null };
  }
  /** lane passkey-binding-isolated: (re)install the ISOLATED-WORLD reporter for the document whose main-world context is
   *  `ctx` — a live document armed on this socket (new documents get it at document start from the worldName script). The
   *  world is (re)created; the binding (armed with executionContextName) lands in it and the reporter grabs it. */
  async function pkArmReporter(w, e, ctx, sid) {
    const fid = e.pk.frameOf.get(Number(ctx));
    if (!sid || !fid) return;
    const iso = await call(w, 'Page.createIsolatedWorld', { frameId: fid, worldName: w.pkWorld }, sid);
    const isoCtx = iso && iso.result && iso.result.executionContextId;
    if (isoCtx) await call(w, 'Runtime.evaluate', { expression: pkReporter(w, e), contextId: Number(isoCtx) }, sid);
  }
  async function pkReach(w, e, ctx, { arm = false } = {}) {
    const sid = e.sid;
    if (!sid || !Number.isFinite(Number(ctx))) return null;
    if (!arm && e.pk.ctl.has(ctx)) return e.pk.ctl.get(ctx);
    let f = await pkFind(w, sid, ctx);
    if (arm && f.n === 0) {
      const r = await call(w, 'Runtime.evaluate', { expression: pkSource(w, e), contextId: ctx, returnByValue: true }, sid);
      f = r && r.result && r.result.result && r.result.result.value === true ? await pkFind(w, sid, ctx) : { n: 0, ctl: null };
    } else if (arm && f.n === 1) {
      const r = await call(w, 'Runtime.callFunctionOn', { objectId: f.ctl, functionDeclaration: PK.REARM_FN, arguments: [{ value: e.pk.key }], returnByValue: true }, sid);
      const v = r && r.result && r.result.result ? r.result.result.value : null;
      if (v && Array.isArray(v.displaced) && v.displaced.length) pkDisplaced(w, e, ctx, v);
    }
    if (f.n !== 1) {
      if (f.n > 1) say('pk-twin:' + w.profileId, `${w.profileId}: two passkey hooks answered in one document — neither was armed`);
      return null;
    }
    e.pk.ctl.set(ctx, f.ctl);
    if (arm) await pkArmReporter(w, e, ctx, sid); // lane passkey-binding-isolated: the live document's isolated-world reporter (this arm's binding)
    return f.ctl;
  }
  async function pkCall(w, e, ctx, verb, id = 0) {
    const ctl = ctx == null ? null : await pkReach(w, e, Number(ctx));
    if (!ctl || !e.sid) return null;
    return call(w, 'Runtime.callFunctionOn', { objectId: ctl, functionDeclaration: PK.CTL_FN, arguments: [{ value: e.pk.key }, { value: String(verb) }, { value: Number(id) || 0 }], returnByValue: true }, e.sid);
  }
  /** A page replaced the credentials API in a watched document: said ONCE per (tab, document) — the trace row, the log line
   *  and the Passkeys card's line (`passkeyList().displaced`). */
  function pkDisplaced(w, e, ctx, v) {
    const k = e.targetId + ':' + ctx;
    if (e.pk.seen.has(k)) return;
    e.pk.seen.add(k);
    const kept = Array.isArray(v.kept) && v.kept.length > 0;
    const list = pkDisplacedAt.get(w.profileId) || []; list.push(now()); pkDisplacedAt.set(w.profileId, list.slice(-8));
    say('pk-displaced:' + w.profileId + ':' + k, `${w.profileId}: a page replaced its credentials API (${v.displaced.join(', ')}) — ${kept ? 'it made the slot fixed: its requests no longer reach the passkey store' : 'the hook took it back'}`);
    pkTrace(w, e, { kind: v.displaced[0] === 'create' ? 'create' : 'get', rpId: '', by: 'page' }, 'hook-displaced', kept ? { kept: true } : {});
  }
  /** The conversation a tab's ceremony is for (the witness, else the one holder whose scope has the tab). */
  function pkOwner(w, e) {
    if (e.owner) return e.owner;
    const hs = (holdersOf ? holdersOf(w.profileId) : []).filter((h) => h && !h.human);
    const hit = hs.filter((h) => { try { return inScope(scopeFor({ profileId: w.profileId, browserKey: h.browserKey, ephemeral: !!h.ephemeral }), e.targetId); } catch { return false; } });
    return hit.length === 1 ? hit[0].browserKey : hs.length === 1 ? hs[0].browserKey : null;
  }
  /** The person operates this tab NOW (a takeover of its conversation's view, Browse yourself). */
  function pkTakeover(w, e) {
    if (typeof takeoverOf === 'function') { try { return !!takeoverOf(w.profileId, e.targetId, pkOwner(w, e)); } catch { return false; } }
    try {
      const bk = pkOwner(w, e);
      if (bk && keeper && typeof keeper.inputStateFor === 'function') for (const p of [w.profileId, null]) { const st = keeper.inputStateFor(bk, p); if (st && st.input === 'user') return true; }
      return (holdersOf ? holdersOf(w.profileId) : []).some((h) => h && h.human && h.input === 'user' && (!bk || h.browserKey === bk));
    } catch { return false; }
  }
  function pkTrace(w, e, rec, outcome, extra = {}) {
    emit({ kind: 'passkey-trace', profileId: w.profileId, targetId: e.targetId, owner: pkOwner(w, e), act: { kind: rec.kind, rpId: rec.rpId, user: (rec.user && rec.user.name) || rec.userName || '', outcome, by: rec.by || 'agent', ...extra } });
  }
  // key-file-law-fix (verify r1 F1): THE KEY FILE REFUSED — a VALUE at every door (src/key-file.js codes). ONE For-you line per
  // refusal (the key file is the instance's, not a profile's), resolved when a seal / open works again; the open ceremony's
  // sentence carries the restore words; the server log says it once.
  let pkKeyFy = null;
  function pkKeyRefused(w, rec, r) {
    if (rec) rec.keyWords = r.words;
    say('pk-key:' + r.code, `${w.profileId}: the passkey store is locked — ${r.words}`);
    if (pkKeyFy && pkKeyFy.code === r.code) return;
    pkKeyOk();
    let id = null; try { id = forYou ? forYou.add?.(w.profileId, PK.keyForYouItem(r)) || null : null; } catch (err) { say('pk-key-fy:' + (err && err.message), `the passkey key line was not filed — ${err && err.message}`); }
    pkKeyFy = { code: r.code, id };
  }
  function pkKeyOk() {
    if (!pkKeyFy) return;
    const { code, id } = pkKeyFy; pkKeyFy = null; sayOnce.delete('pk-key:' + code);
    if (id && forYou) { try { forYou.resolve?.(id); } catch { /* the tray's own failure */ } }
  }
  /** A gate step that THREW (anything unexpected; a key refusal is a value) never holds the page: said, the ceremony released. */
  function pkFailed(w, e, rec, err) {
    say('pk-flow:' + (err && err.message), `${w.profileId}: a passkey ceremony step failed — ${err && err.message}`);
    const r = PS.keyRefusal(err); if (r) pkKeyRefused(w, rec, r);
    if (rec && rec.outcome === 'pending') pkCtl(w, e, rec, 'release').catch(() => {});
  }
  /** ① a held ceremony starts → ② the gate → release (load ONLY its rows) | ask (a card) | refuse (the hook rejects in-page). */
  async function pkGate(w, e, rec) {
    if (rec && rec.kernel) return pkKernelGate(w, e, rec); // lane passkey-sink: the kernel road (no authenticator, VibeSpace signs)
    if (!e.pk.auth) return pkCtl(w, e, rec, 'release'); // no authenticator on this tab: Chrome's own behaviour (said passkey_open if it never ends)
    if (e.pk.draining) await e.pk.draining.catch(() => {}); // ONE ceremony per tab at a time: the last one's unload first
    const pid = w.profileId, part = PS.profileOf(pkRead(), pid);
    if (!rec.by) rec.by = pkTakeover(w, e) ? 'human' : 'agent'; // the operator at the START (a takeover never lifts an agent's ceremony)
    const owner = pkOwner(w, e);
    const gk = pid + ' ' + PS.grantKey(rec.rpId, owner || '');
    const grant = pkGrants.get(gk) || null;
    const v = PS.gateVerdict({ kind: rec.conditional ? 'conditional' : rec.kind, rpId: rec.rpId, origin: rec.origin || e.url, rows: part.rows, grant, input: { allow: rec.allow || [] }, answer: rec.answer || null, profileSwitch: part.agentsOff, takeover: rec.by === 'human', now: now() });
    if (v.verdict === 'refuse') { rec.refused = true; rec.why = v.why; if (v.why !== 'none') pkTrace(w, e, rec, 'refused', { why: v.why }); await pkCtl(w, e, rec, 'refuse'); passkeyChanged(w, e); return v; }
    if (v.verdict === 'ask') return pkAsk(w, e, rec, v.rows);
    if (v.consumeGrant) pkGrants.delete(gk);
    rec.createdBy = v.createdBy || null;
    let store = pkRead(); const loaded = [];
    for (const cid of v.load) {
      const row = PS.profileOf(store, pid).rows.find((r) => r.credentialId === cid); if (!row) continue;
      const key = PS.open(pks.cipher, row), refused = PS.keyRefusal(key);
      if (refused) { pkKeyRefused(w, rec, refused); break; } // key-file-law-fix: the key file cannot open the store — NOTHING loads; the ceremony is released below like "no passkey"
      pkKeyOk();
      if (!key) { say('pk-open:' + cid.slice(0, 8), `${pid}: a stored passkey (${cid.slice(0, 8)}) could not be unsealed — the key file changed?`); continue; }
      const b = PS.bumpSignCount(row); store = PS.withRow(store, pid, b.row); loaded.push({ row, key, loadAs: b.loadAs });
    }
    if (loaded.length) pkWrite(store); // the count on disk BEFORE the release
    for (const l of loaded) {
      const r = await call(w, 'WebAuthn.addCredential', { authenticatorId: e.pk.auth, credential: { credentialId: b64(l.row.credentialId), isResidentCredential: true, rpId: l.row.rpId, privateKey: l.key, ...(l.row.userHandle ? { userHandle: b64(l.row.userHandle) } : {}), signCount: l.loadAs, ...(l.row.userName ? { userName: l.row.userName } : {}), ...(l.row.displayName ? { userDisplayName: l.row.displayName } : {}) } }, e.sid);
      if (r && r.error) say('pk-add:' + pid, `${pid}: a stored passkey was not loaded — ${r.error.message}`);
    }
    if (v.uv) await call(w, 'WebAuthn.setUserVerified', { authenticatorId: e.pk.auth, isUserVerified: true }, e.sid);
    rec.loaded = loaded.map((l) => l.row.credentialId); rec.uvSet = !!v.uv;
    await pkCtl(w, e, rec, 'release');
    return v;
  }
  /** ⑤ the ceremony ended: EVERYTHING leaves the authenticator (getCredentials is [] between ceremonies), UV off, the hook told. */
  async function pkEnd(w, e, rec) {
    const a = rec.ask && pkAsks.get(rec.ask); if (a && a.state === 'open') pkClose(a, 'withdrawn');
    if (!e.pk.auth || !e.sid) return;
    const job = pkUnload(w, e, rec); e.pk.draining = job;
    try { await job; } finally { if (e.pk.draining === job) e.pk.draining = null; }
  }
  async function pkUnload(w, e, rec) {
    if (rec.loaded || rec.uvSet) {
      const g = await call(w, 'WebAuthn.getCredentials', { authenticatorId: e.pk.auth }, e.sid);
      for (const c of (g && g.result && g.result.credentials) || []) await call(w, 'WebAuthn.removeCredential', { authenticatorId: e.pk.auth, credentialId: c.credentialId }, e.sid);
      if (rec.uvSet) await call(w, 'WebAuthn.setUserVerified', { authenticatorId: e.pk.auth, isUserVerified: false }, e.sid);
      if (!rec.refused) pkTrace(w, e, rec, rec.outcome, rec.harvested ? { harvested: true } : {});
    }
    await pkCtl(w, e, rec, 'drained');
  }
  /** ④ the harvest: a new key sealed + stored (`credentialAdded`), a sign count reconciled (`credentialAsserted`). */
  function pkHarvest(w, e, method, p) {
    const c = p && p.credential; if (!c || !c.credentialId) return;
    const pid = w.profileId, cid = b64u(c.credentialId);
    const rec = [...e.pk.records].reverse().find((r) => r.outcome === 'pending' && !r.refused) || [...e.pk.records].reverse().find((r) => r.kind === (method === 'WebAuthn.credentialAdded' ? 'create' : 'get')) || null;
    const store = pkRead(), row = PS.profileOf(store, pid).rows.find((r) => r.credentialId === cid);
    if (method === 'WebAuthn.credentialAsserted') { if (row) { pkWrite(PS.withRow(store, pid, PS.reconcile(row, c.signCount, now()))); if (rec) rec.userName = row.userName; } return; }
    if (row || !c.privateKey) return; // a stored key we loaded ourselves
    const sealed = PS.seal(pks.cipher, c.privateKey), refused = PS.keyRefusal(sealed);
    if (refused) return pkKeyRefused(w, rec, refused); // key-file-law-fix: the key file cannot open the store — the new passkey is NOT kept, said once
    pkKeyOk();
    const nr = PS.normalizeRow({ credentialId: cid, rpId: c.rpId, userHandle: b64u(c.userHandle), userName: c.userName, displayName: c.userDisplayName, keySealed: sealed, signCount: c.signCount, createdBy: rec && rec.createdBy === 'human' ? 'human' : 'agent', bySession: pkOwner(w, e), createdAt: now(), policy: PS.NEW_KEY_POLICY });
    if (!nr) return say('pk-harvest:' + pid, `${pid}: a new passkey was not stored (its fields did not read)`);
    pkWrite(PS.withRow(store, pid, nr));
    if (rec) { rec.harvested = true; rec.userName = nr.userName; }
    emit({ kind: 'passkeys', profileId: pid });
  }
  /** `ask`: ONE card (the For-you item + the chat card's event; P2 draws it) — the hook kept waiting by a heartbeat. */
  function pkAsk(w, e, rec, rowIds) {
    const rows = PS.profileOf(pkRead(), w.profileId).rows.filter((r) => rowIds.includes(r.credentialId));
    const a = pkNewAsk({ kind: 'sign-in', profileId: w.profileId, rpId: rec.rpId, user: rows[0] ? { name: rows[0].userName, displayName: rows[0].displayName } : null, rows, browserKey: pkOwner(w, e) });
    Object.assign(a, { w, e, rec }); rec.ask = a.id;
    a.beat = setInterval(() => {
      if (rec.outcome !== 'pending' || w.state !== 'open') return pkClose(a, 'withdrawn');
      if (rec.by === 'agent' && pkTakeover(w, e)) { pkClose(a, 'withdrawn'); rec.ask = null; rec.refused = true; rec.why = 'withdrawn'; pkTrace(w, e, rec, 'refused', { why: 'withdrawn' }); pkCtl(w, e, rec, 'refuse'); passkeyChanged(w, e); return; }
      if (now() > a.card.expiresAt) { pkClose(a, 'expired'); rec.ask = null; rec.answer = 'expired'; pkGate(w, e, rec).catch((err) => pkFailed(w, e, rec, err)); return; }
      pkCtl(w, e, rec, 'wait');
    }, 1000);
    if (a.beat.unref) a.beat.unref();
    pkCtl(w, e, rec, 'wait'); passkeyChanged(w, e);
    return { verdict: 'ask', id: a.id };
  }
  function pkNewAsk({ kind, profileId, rpId, user = null, rows = [], browserKey = null, sessionId = null }) {
    let label = null; try { label = labelOf ? labelOf(profileId) : null; } catch { label = null; }
    const id = 'pk-' + crypto.randomBytes(4).toString('hex');
    const card = PS.proposalCard({ id, kind, profileId, profileLabel: label || '', rpId, user, rows, expiresAt: now() + PS.ASK_MS });
    const a = { id, card, profileId, browserKey, sessionId, state: 'open', waiters: [], itemId: null, beat: null, at: now() };
    pkAsks.set(id, a);
    if (forYou) { try { a.itemId = forYou.add?.(profileId, PS.proposalItem(card)) || null; } catch (err) { say('pk-card:' + (err && err.message), `the passkey card was not filed — ${err && err.message}`); } }
    emit({ kind: 'passkey-proposal', profileId, card, browserKey, sessionId, block: PS.cardBlock(card, a.at) });
    if (pkAsks.size > 64) for (const [k, x] of pkAsks) { if (x.state !== 'open') pkAsks.delete(k); if (pkAsks.size <= 32) break; }
    return a;
  }
  function pkClose(a, state, answer = null) {
    if (a.state !== 'open') return;
    a.state = state; a.card.state = state; a.card.answer = answer;
    if (a.beat) clearInterval(a.beat);
    if (a.itemId && forYou) { try { forYou.resolve?.(a.itemId, state === 'answered' ? 'done' : 'dismissed'); } catch { /* the tray's own failure */ } }
    emit({ kind: 'passkey-proposal', profileId: a.profileId, card: a.card, browserKey: a.browserKey, sessionId: a.sessionId, block: PS.cardBlock(a.card, a.at) });
    for (const fn of a.waiters.splice(0)) { try { fn(a.card); } catch { /* */ } }
  }
  /** THE OWNER's answer (the approve / reject routes for a `pk-` id): register ⇒ a ONE-TIME grant (10 min); sign-in ⇒ the
   *  key's policy remembered (always / never) and the held ceremony decided. → {ok, proposal} | {ok:false, code, error}. */
  function answerPasskey(id, { choice = 'once', shown = null } = {}) {
    const a = pkAsks.get(String(id || ''));
    if (!a) return { ok: false, code: 'not-found', error: `no passkey request ${id}` };
    if (a.state !== 'open') return { ok: false, code: 'proposal_state', error: `that passkey request was already ${a.state}` };
    if (shown != null && shown !== a.card.shown) return { ok: false, code: 'proposal_changed', error: 'that card changed after it was shown — nothing ran; read it again' };
    const choices = PS.CHOICES[a.card.kind] || [];
    if (!choices.includes(choice)) return { ok: false, code: 'bad-request', error: `this card's choices are ${choices.join(' | ')}` };
    pkClose(a, 'answered', choice);
    if (a.card.kind === 'register') {
      if (choice === 'once') pkGrants.set(a.profileId + ' ' + PS.grantKey(a.card.rpId, a.browserKey || ''), PS.grantOf({ rpId: a.card.rpId, browserKey: a.browserKey, user: a.card.user.name, now: now() }));
      return { ok: true, proposal: a.card };
    }
    if (choice === 'always' || choice === 'never') { let s = pkRead(); for (const k of a.card.keys) { const r = PS.profileOf(s, a.profileId).rows.find((x) => x.credentialId.startsWith(k.id)); if (r) s = PS.setPolicy(s, a.profileId, r.credentialId, choice === 'always' ? 'yes' : 'no'); } pkWrite(s); emit({ kind: 'passkeys', profileId: a.profileId }); }
    if (a.rec && a.rec.outcome === 'pending') { a.rec.ask = null; a.rec.answer = choice; pkGate(a.w, a.e, a.rec).catch((err) => pkFailed(a.w, a.e, a.rec, err)); }
    return { ok: true, proposal: a.card };
  }
  /** The agent's `passkey register <rpId>`: ONE card; `waitMs` > 0 waits for its answer. → {ok, proposal, state}. */
  async function passkeyRegister({ profileId, browserKey, sessionId = null, rpId, user = '' }, { waitMs = 0 } = {}) {
    const pid = String(profileId || ''), rp = PS.hostWord(rpId);
    if (!pks) return { ok: false, code: 'not_watched', error: 'VibeSpace keeps no passkeys on this server' };
    if (!rp || (!rp.includes('.') && rp !== 'localhost')) return { ok: false, code: 'bad-request', error: `"${rpId}" is not a site name (e.g. github.com)` };
    if (PS.profileOf(pkRead(), pid).agentsOff) return { ok: false, code: 'passkeys_off', error: PK.refusedText('profile-switch', rp) };
    const bk = String(browserKey || '').replace(/\.\d+$/, '');
    const live = [...pkAsks.values()].find((x) => x.state === 'open' && x.card.kind === 'register' && x.profileId === pid && x.card.rpId === rp && x.browserKey === bk);
    const a = live || pkNewAsk({ kind: 'register', profileId: pid, rpId: rp, user: user ? { name: user, displayName: user } : null, browserKey: bk, sessionId });
    if (!live) { a.beat = setTimeout(() => pkClose(a, 'expired'), PS.ASK_MS); if (a.beat.unref) a.beat.unref(); }
    if (waitMs > 0 && a.state === 'open') await new Promise((res) => { const t = setTimeout(() => { a.waiters = a.waiters.filter((f) => f !== done); res(); }, waitMs); if (t.unref) t.unref(); const done = () => { clearTimeout(t); res(); }; a.waiters.push(done); });
    return { ok: true, proposal: a.card, state: a.state === 'answered' ? (a.card.answer === 'once' ? 'approved' : 'rejected') : a.state };
  }
  /** The table as it may leave the server (publicRow only) + the profile's switch. */
  function passkeyList(profileId) { const p = PS.profileOf(pkRead(), String(profileId || '')); return { agentsOff: p.agentsOff, keys: p.rows.map(PS.publicRow), displaced: (pkDisplacedAt.get(String(profileId || '')) || []).filter((at) => now() - at < 3600e3).length, asks: [...pkAsks.values()].filter((a) => a.state === 'open' && a.profileId === String(profileId || '')).map((a) => a.card) }; }
  /** lane vault-contents-window: THE VAULT WINDOW's rows of the passkey store — one per stored private key (its site and
   *  user; the sealed key rides only to the length class); `passkeyVaultReveal` opens ONE (entry = `<profile>/<credential
   *  id's first 40 characters>`). */
  function passkeyVaultRows() {
    if (!pks) return [];
    const out = [];
    for (const [pid, p] of Object.entries(pkRead().profiles || {})) for (const r of p.rows || []) out.push({ entry: `${pid}/${String(r.credentialId).slice(0, 40)}`, field: 'privateKey', kind: 'private-key', label: r.userName ? `${r.rpId} · ${r.userName}` : r.rpId, detail: pid, createdAt: r.createdAt || null, cipher: r.keySealed });
    return out;
  }
  function passkeyVaultReveal(entry, field) {
    const i = String(entry || '').indexOf('/');
    if (!pks || field !== 'privateKey' || i < 1) return null;
    const pid = String(entry).slice(0, i), cid = String(entry).slice(i + 1);
    const rows = (PS.profileOf(pkRead(), pid).rows || []).filter((r) => String(r.credentialId).slice(0, 40) === cid);
    if (rows.length !== 1) return null;
    const v = pks.cipher.open(rows[0].keySealed);
    if (v && typeof v === 'object' && v.ok === false) throw Object.assign(new Error(v.words || v.code), { code: v.code });
    return typeof v === 'string' ? v : null;
  }
  /** `forget`: an agent removes only keys an AGENT registered; the owner removes any. */
  function passkeyForget(profileId, ref, { by = 'agent' } = {}) {
    const pid = String(profileId || ''); const rows = PS.findRows(PS.profileOf(pkRead(), pid).rows, ref);
    if (!rows.length) return { ok: false, code: 'not-found', error: `this profile holds no passkey "${String(ref || '').slice(0, 80)}" — \`vibespace-browser passkey list\`` };
    if (by !== 'user' && rows.some((r) => r.createdBy === 'human')) return { ok: false, code: 'owner_key', error: 'a passkey the owner registered is removed only by the owner (the Agent browser panel)' };
    const ids = new Set(rows.map((r) => r.credentialId));
    const d = PS.dropRows(pkRead(), pid, (r) => ids.has(r.credentialId)); pkWrite(d.store); emit({ kind: 'passkeys', profileId: pid });
    return { ok: true, removed: d.rows.map(PS.publicRow) };
  }
  function passkeyPolicy(profileId, id, policy) {
    const pid = String(profileId || ''); const rows = PS.findRows(PS.profileOf(pkRead(), pid).rows, id);
    if (rows.length !== 1 || !PS.POLICIES.includes(policy)) return { ok: false, code: rows.length ? 'bad-request' : 'not-found', error: rows.length ? `policy is ${PS.POLICIES.join(' | ')}` : `no passkey ${id}` };
    pkWrite(PS.setPolicy(pkRead(), pid, rows[0].credentialId, policy)); emit({ kind: 'passkeys', profileId: pid });
    return { ok: true, key: PS.publicRow(PS.profileOf(pkRead(), pid).rows.find((r) => r.credentialId === rows[0].credentialId)) };
  }
  /** lane passkey-ui: each profile's passkey count (the panel's "Passkeys (n)…") — counts only, never a row. */
  /** int258: the chat cards of ONE conversation's browser key, open and decided (a rebuild draws each with its latest state,
   *  like the keeper's proposal cards) — in memory, as the asks are: a server stop ends them. */
  function passkeyCards(browserKey) { const k = String(browserKey || ''); return k ? [...pkAsks.values()].filter((a) => String(a.browserKey || '').replace(/\.\d+$/, '') === k).sort((x, y) => x.at - y.at).map((a) => PS.cardBlock(a.card, a.at)) : []; }
  function passkeyCounts() { if (!pks) return {}; const s = pkRead(); const out = {}; for (const pid of Object.keys(s.profiles || {})) out[pid] = PS.profileOf(s, pid).rows.length; return out; }
  function passkeySwitch(profileId, on) { const pid = String(profileId || ''); pkWrite(PS.setAgentsOff(pkRead(), pid, !!on)); emit({ kind: 'passkeys', profileId: pid }); return { ok: true, agentsOff: !!on }; }
  /** `removeProfile`: the profile's keys go with it (said in the removal answer). */
  function dropPasskeys(profileId) { if (!pks) return 0; const d = PS.dropProfile(pkRead(), String(profileId || '')); if (d.removed || pkRead().profiles[String(profileId || '')]) pkWrite(d.store); return d.removed; }
  function setTabsOf(fn) { tabsFn = typeof fn === 'function' ? fn : null; }
  /** r4 #2: the orphan tabs of a browser and what they hold (a diagnostic read — the suites, `stats`). */
  function orphansOf(profileId, scope = new Set(['-'])) { const w = watches.get(String(profileId || '')); const ob = orphanBusy(w, scope); return { orphans: ob.orphans ? [...ob.orphans] : [], loop: ob.loop ? ob.loop.targetId : null, busy: ob.busy, loading: w && ob.orphans ? (loadingIn(w.profileId, ob.orphans) || null) : null, open: w && ob.orphans ? !!openIn(w.profileId, ob.orphans) : false }; }
  function stats() { return [...watches.values()].map((w) => ({ profileId: w.profileId, state: w.state, tabs: w.targets.size, enabled: [...w.targets.values()].filter((e) => e.enabled).length, held: [...w.targets.values()].filter((e) => e.heldAt).length, open: [...w.open.values()].map((d) => ({ id: d.id, type: d.type })), answered: w.answered.length, loops: [...w.targets.values()].filter((e) => e.loop).length, kernel: w.kernel ? { protocol: w.kernel.protocol, features: w.kernel.features } : w.kernel, surfaces: [...w.surf.values()].map((x) => ({ id: x.id, kind: x.kind, cls: x.cls })), nativeIgnored: w.nativeIgnored })); } // lane browser-surfaces
  function shutdown() { for (const w of [...watches.values()]) { try { w.ws && w.ws.close(1001); } catch { /* */ } down(w, 'the server is restarting', { keepNotices: true }); } for (const x of waiters) x.resolve(null); waiters.clear(); }

  // ── lane browser-ui-prompts (B-ebfc): THE BROWSER'S OWN PROMPTS — hooked on every enabled tab of this socket ──
  // MEASURED (0.38.1 + Chrome 154, headless and the hidden window): intercepted, a chooser reports `Page.fileChooserOpened` in
  // ≤ 5 ms and the page runs on; the CLI's own `upload` (DOM.setFileInputFiles on ITS session) still lands while we intercept.
  // Fetch pauses DOCUMENT requests only (a sub-resource never waits on this socket; on '*' a 100-image page cost +12 ms); a
  // sign-in on a sub-resource is not caught (named in the kb table).
  function armPrompts(w, e) {
    if (!e.sid) return;
    call(w, 'Page.setInterceptFileChooserDialog', { enabled: true }, e.sid).then((r) => { if (r && r.error) say('fc:' + r.error.message, `${w.profileId}: the file chooser was not hooked — ${r.error.message}`); });
    call(w, 'Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }], handleAuthRequests: true }, e.sid).then((r) => { if (r && r.error) say('auth:' + r.error.message, `${w.profileId}: HTTP sign-ins were not hooked — ${r.error.message}`); });
    const geo = [...w.grants.values()].find((g) => g.kind === 'geolocation' && g.setting === 'granted'); if (geo) call(w, 'Emulation.setGeolocationOverride', geo.position || {}, e.sid); // lane browser-ui-prompts-r2
  }
  function onPrompt(w, m, type, p) {
    const sid = String(m.sessionId || ''); const tid = w.sessions.get(sid); const e = tid ? w.targets.get(tid) : null;
    if (type === 'http-auth' && !e) { call(w, 'Fetch.continueWithAuth', { requestId: String(p.requestId || ''), authChallengeResponse: { response: 'Default' } }, sid || null); return; }
    if (!e) return;
    const rec = ST.promptFromCdp(type, p, { targetId: tid, now: now(), seq: ++w.seq });
    if (!rec) return;
    // lane browser-x-in-window (B2): ON THE X ROAD the sign-in is CHROME'S — answered `Default`, Chrome draws its own sheet in the
    // window the live view shows (measured: inside the browser's one X top-level) and the person who takes over types into it;
    // the watch only says it stands (`native`), never holds the request, never asks for the credential
    if (type === 'http-auth' && xRoad(w.profileId)) { rec.native = true; call(w, 'Fetch.continueWithAuth', { requestId: String(p.requestId || ''), authChallengeResponse: { response: 'Default' } }, sid || null); }
    const old = w.prompts.get(tid);
    if (old && old.type === 'http-auth') settleAuth(w, old, { how: 'cancelled', by: 'superseded' }); // one prompt per tab: an older sign-in gets its 401
    else if (old) dropPrompt(w, old, 'superseded');
    w.prompts.set(tid, rec);
    if (type === 'http-auth') {
      if (!rec.native) w.authReq.set(rec.id, { requestId: String(p.requestId || ''), sid });
      const ask = setTimeout(() => promptAsk(w, rec), promptAskMs); const end = setTimeout(() => { if (w.prompts.get(tid) === rec) { if (rec.native) dropPrompt(w, rec, 'expired'); else settleAuth(w, rec, { how: 'expired', by: 'watch' }); } }, authHoldMaxMs); // a native sheet is Chrome's: never cancelled by the watch, only forgotten
      for (const x of [ask, end]) if (x.unref) x.unref();
      w.promptTimers.set(rec.id, [ask, end]);
    }
    emit({ kind: 'prompt', profileId: w.profileId, targetId: tid, state: 'open', type });
    // lane browser-ui-prompts-r2: a sign-in holds the navigating verb — the verb's long-poll hears it NOW (the dialog's seam)
    if (type === 'http-auth') for (const x of [...waiters]) if (x.profileId === w.profileId && x.prompt && inScope(x.scope(), tid)) { waiters.delete(x); x.resolve({ prompt: ST.promptBlock(rec, { now: now() }), via: 'event', at: now() }); }
  }
  /** A sign-in unanswered PROMPT_ASK_MS ⇒ ONE For-you item (a human must type it); resolved when it ends. */
  function promptAsk(w, rec) {
    if (!forYou || w.prompts.get(rec.targetId) !== rec || w.promptForYou.has(rec.id)) return;
    let label = null; try { label = labelOf ? labelOf(w.profileId) : null; } catch { label = null; }
    const host = ST.hostOf(rec.origin) || rec.origin;
    const text = 'A page in the agent browser asks you to sign in ({host})'; const detail = 'Open its live view and type the username and password there — the agent never sees them.';
    let id = null; try { id = forYou.add?.(w.profileId, { text: text.replace('{host}', host) + (label ? ` — ${String(label).slice(0, 80)}` : ''), detail, i18n: { text: { key: text, params: { host } }, detail: { key: detail } } }); } catch (err) { say('prm-fy:' + (err && err.message), `the sign-in For-you item was not filed — ${err && err.message}`); }
    if (id) w.promptForYou.set(rec.id, id);
  }
  function dropPrompt(w, rec, why) {
    if (!rec) return;
    if (w.prompts.get(rec.targetId) === rec) w.prompts.delete(rec.targetId);
    for (const x of w.promptTimers.get(rec.id) || []) clearTimeout(x); w.promptTimers.delete(rec.id);
    const fy = w.promptForYou.get(rec.id); if (fy) { w.promptForYou.delete(rec.id); try { forYou?.resolve?.(fy); } catch { /* the tray's own failure */ } }
    if (why !== 'down') emit({ kind: 'prompt', profileId: w.profileId, targetId: rec.targetId, state: 'cleared', why });
  }
  function promptIn(profileId, scope) {
    const w = watches.get(String(profileId || ''));
    if (!w) return null;
    let best = null; for (const r of w.prompts.values()) if (inScope(scope, r.targetId) && (!best || r.openedAt >= best.openedAt)) best = r;
    return best;
  }
  /** lane browser-x-in-window: Chrome's own sheet closed — its tab committed a page (signed in, or the 401 after a Cancel): the
   *  prompt goes, and the conversation's next result says so ONCE (who typed what is never known here — Chrome had it). */
  function settleNative(w, rec) {
    if (!rec || !rec.native) return;
    dropPrompt(w, rec, 'answered');
    w.promptNotes.push({ id: rec.id, prompt: rec, how: 'window', by: 'user', at: now(), targetId: rec.targetId }); if (w.promptNotes.length > ANSWERED_KEEP) w.promptNotes.shift();
  }
  /** Is this profile's browser on the X road (the keeper's Chrome on its display session — B2's picture switch)? */
  function xRoad(profileId) { try { return !!(keeper && typeof keeper.pictureSourceFor === 'function' && keeper.pictureSourceFor(profileId).source === 'x'); } catch { return false; } }
  /** The credential goes to Chrome and nowhere else: never logged, never in a record, a note or an answer. */
  async function settleAuth(w, rec, { how, by, username = '', password = '' }) {
    const q = w.authReq.get(rec.id); w.authReq.delete(rec.id);
    dropPrompt(w, rec, how);
    if (!q) return { ok: false, code: 'gone', error: 'the sign-in already ended' };
    const r = await call(w, 'Fetch.continueWithAuth', { requestId: q.requestId, authChallengeResponse: how === 'signed-in' ? { response: 'ProvideCredentials', username: String(username).slice(0, 512), password: String(password).slice(0, 1024) } : { response: 'CancelAuth' } }, q.sid || null);
    w.promptNotes.push({ id: rec.id, prompt: rec, how, by, at: now(), targetId: rec.targetId }); if (w.promptNotes.length > ANSWERED_KEEP) w.promptNotes.shift();
    return r && (r.error || r.timeout) ? { ok: false, code: 'gone', error: 'the page no longer waits for that sign-in' } : { ok: true };
  }
  /** The live view's answer: a sign-in (username + password, or Cancel), or a file chooser dismissed (the page got nothing). */
  async function answerPrompt({ profileId, browserKey = '', sessionId = null, ephemeral = false, promptId = null } = {}, { cancel = false, username = '', password = '', by = 'user' } = {}) {
    const pid = String(profileId || ''); const w = watches.get(pid);
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    const scope = scopeFor({ profileId: pid, browserKey, sessionId, ephemeral });
    const rec = [...w.prompts.values()].find((r) => inScope(scope, r.targetId) && (!promptId || r.id === String(promptId)));
    if (!rec) return { ok: false, code: 'no_prompt', error: 'no browser prompt is open there' };
    if (rec.type === 'file') { dropPrompt(w, rec, 'dismissed'); return { ok: true }; }
    if (rec.native) return { ok: false, code: 'native_sheet', error: 'Chrome shows its own sign-in sheet in the window — take over and answer it there' }; // lane browser-x-in-window
    if (!cancel && (typeof username !== 'string' || !username || typeof password !== 'string')) return { ok: false, code: 'bad_request', error: 'a username is needed' };
    return settleAuth(w, rec, cancel ? { how: 'cancelled', by } : { how: 'signed-in', by, username, password });
  }

  // ── lane browser-ui-prompts-r2 (B-ebfc): THE TWO MEASURED HANGS, decided before they hold (the table: ST.PERMISSION_KINDS) ──
  /** Every permission kind DENIED for one browser context before its first tab is enabled (measured: a decision set while a
   *  prompt pends never answers it — so it comes first), then the agent's own per-origin flips put back. Once per context. */
  function decideAhead(w, ctxId) {
    const key = ctxId ? String(ctxId) : '';
    if (w.permCtx.has(key)) return w.permCtx.get(key);
    const p = (async () => {
      const rows = ST.permissionPlan(w.headed === false ? 'headless' : 'headed', { browserContextId: ctxId });
      const got = await Promise.all(rows.map((row) => call(w, 'Browser.setPermission', row.params)));
      const bad = rows.filter((row, i) => got[i] && (got[i].error || got[i].timeout)).map((row) => row.kind);
      if (bad.length) say('perm:' + w.profileId + ':' + bad.join(','), `${w.profileId}: ${bad.length} permission kind(s) were not decided ahead (${bad.join(', ')}) — a page asking for them may wait`);
      for (const g of [...w.grants.values()]) await call(w, 'Browser.setPermission', { permission: g.permission, setting: g.setting, origin: g.origin, ...(ctxId ? { browserContextId: String(ctxId) } : {}) });
    })();
    w.permCtx.set(key, p);
    return p;
  }
  /** The agent's (or the user's) per-origin decision on this conversation's browser: every context decided, a granted
   *  geolocation answered with a position (measured: without one it pends), the lease record, the event the live view +
   *  the trace read. The origin defaults to the conversation's current tab's. */
  async function setPermission({ profileId, browserKey = '', sessionId = null, ephemeral = false } = {}, { kind, setting, origin = '', at = null, by = 'agent' } = {}) {
    const pid = String(profileId || ''); const w = watches.get(pid);
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    const scope = scopeFor({ profileId: pid, browserKey, sessionId, ephemeral });
    const tabs = [...w.targets.values()].filter((e) => inScope(scope, e.targetId));
    const cur = tabs.filter((e) => /^https?:/.test(e.url)).sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0))[0];
    const v = ST.permissionVerdict({ kind, setting, origin: origin || (cur ? cur.url : ''), at });
    if (!v.ok) return v;
    const ctxs = [...w.permCtx.keys()];
    for (const c of ctxs.length ? ctxs : ['']) { const r = await call(w, 'Browser.setPermission', { permission: v.permission, setting: v.setting, origin: v.origin, ...(c ? { browserContextId: c } : {}) }); if (r && (r.error || r.timeout)) return { ok: false, code: 'cdp', error: `Chrome did not take the decision — ${r.error ? r.error.message : 'timed out'}` }; }
    if (v.kind === 'geolocation') for (const e of [...w.targets.values()]) if (e.sid) await call(w, v.setting === 'granted' ? 'Emulation.setGeolocationOverride' : 'Emulation.clearGeolocationOverride', v.setting === 'granted' ? (v.position || {}) : {}, e.sid);
    const rec = { kind: v.kind, permission: v.permission, setting: v.setting, origin: v.origin, position: v.position, by: by === 'user' ? 'user' : 'agent', at: now() };
    w.grants.set(v.kind + ' ' + v.origin, rec);
    if (keeper && typeof keeper.notePermission === 'function') { try { keeper.notePermission(pid, browserKey, rec); } catch (err) { say('perm-note:' + (err && err.message), `${pid}: the permission was not recorded on its lease — ${err && err.message}`); } }
    emit({ kind: 'permission', profileId: pid, targetId: cur ? cur.targetId : null, permission: { kind: rec.kind, setting: rec.setting, origin: rec.origin, by: rec.by, at: rec.at } });
    return { ok: true, permission: { kind: rec.kind, setting: rec.setting, origin: rec.origin, position: rec.position }, text: ST.permissionNote(rec) };
  }
  function permissionsOf(profileId) { const w = watches.get(String(profileId || '')); return w ? [...w.grants.values()].map((g) => ({ kind: g.kind, setting: g.setting, origin: g.origin, by: g.by, at: g.at })) : []; }
  /** The print preview (`chrome://print/`) the hidden window opened: ITS OWN Cancel is pressed (measured: closing the target
   *  leaves the opener held; the WebUI's cancel frees it in ≤ 25 ms), the opener's conversation is told ONCE. */
  async function releasePrint(w, info) {
    const tid = String(info.targetId || '');
    if (!tid || w.printing.has(tid)) return;
    w.printing.add(tid);
    const opener = info.openerId && w.targets.has(String(info.openerId)) ? String(info.openerId) : ([...w.targets.values()].filter((e) => !/^chrome:/.test(e.url)).sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0))[0] || {}).targetId || null;
    const a = await call(w, 'Target.attachToTarget', { targetId: tid, flatten: true });
    const sid = a && a.result ? String(a.result.sessionId || '') : '';
    const r = sid ? await call(w, 'Runtime.evaluate', { expression: ST.PRINT_RELEASE_EXPR, returnByValue: true }, sid) : null;
    const ok = !!(r && r.result && r.result.result && r.result.result.value === 'released');
    if (!ok) { say('print:' + w.profileId, `${w.profileId}: a print preview was not released — ${JSON.stringify((r && (r.error || r.result)) || a).slice(0, 160)}`); await call(w, 'Target.closeTarget', { targetId: tid }); }
    const n = { id: `prn-${tid.slice(0, 8).toLowerCase()}-${++w.seq}`, kind: 'print', at: now(), targetId: opener, released: ok };
    w.promptNotes.push(n); if (w.promptNotes.length > ANSWERED_KEEP) w.promptNotes.shift();
    emit({ kind: 'print', profileId: w.profileId, targetId: opener, released: ok });
    setTimeout(() => w.printing.delete(tid), 60000).unref?.();
  }

  // ── lane passkey-sink (P2 of the custom browser kernel, design-custom-browser-plugin §3): THE CEREMONY SINKS TO VIBESPACE ──
  // On a kernel whose `features` list `webauthn` there is no hook and no virtual authenticator: the kernel TRANSPORTS the ceremony
  // (`VibeSpace.webauthnRequest`), VibeSpace signs it (PURE src/webauthn-sign.js, the key sealed in the passkey store) and answers
  // (`VibeSpace.webauthnAnswer`). The RECORD is today's (PK.applyEvent: the verdict, the chip, the card, `passkey status|cancel`)
  // — its source is the request. The webauthn SURFACE (P1) is only the held card's existence: it stands as this record (never a
  // second dialog_open, never a browser-surface card); the request carries the ceremony's data. UV = the owner decided THIS
  // ceremony (PS.kernelFlags — never auto); the sign count is written BEFORE the answer leaves; every signature and every new
  // key is a USE of the passkeys' key (the vault's writer: purpose + receipt, never the bytes).
  function pkSinks(w) { return !!(w && w.kernel && Array.isArray(w.kernel.features) && w.kernel.features.includes('webauthn')); }
  /** The record (and its tab) of a kernel ceremony by its surface id. */
  function pkRecOf(w, surfaceId) { for (const e of w.targets.values()) for (const r of e.pk.records) if (r.kernel && r.kernel.surfaceId === surfaceId) return { e, r }; return null; }
  /** `VibeSpace.webauthnRequest` — the ceremony's start (the record), then the gate. */
  function pkRequest(w, tid, p) {
    const e = tid ? w.targets.get(tid) : null;
    if (!e || !pkSinks(w)) { say('pk-req-tab:' + w.profileId, `${w.profileId}: a passkey request ${e ? 'from a browser that does not list the webauthn feature' : 'for a tab this watch does not know'} was not taken`); return; }
    const ev = PK.kernelEvent(p, { n: ++w.pkSeq });
    if (!ev) { say('pk-req:' + w.profileId, `${w.profileId}: a passkey request without a usable surfaceId / requestId was not taken`); return; }
    if (e.pk.records.some((r) => r.kernel && r.kernel.requestId === ev.req.requestId)) return; // the same request twice
    if (!e.pk.armed) { e.pk.armed = true; e.pk.sink = true; } // the request itself proves the road
    const rec = PK.applyEvent(e.pk.records, ev, { tab: e.targetId, ctx: 0, now: now() });
    passkeyChanged(w, e, true);
    pkGate(w, e, rec).catch((err) => pkFailed(w, e, rec, err));
  }
  /** THE KERNEL ROAD'S GATE: the request re-checked (never trusting the kernel), then PS.gateVerdict exactly as the hook road
   *  asks it (the rows of its rpId, the grant, the takeover, the card's answer) → sign | create | ask (the card; the kernel's
   *  request waits) | refuse (the page is told NotAllowedError, the reason on the record). */
  async function pkKernelGate(w, e, rec) {
    if (rec.outcome !== 'pending' || rec.answering) return null;
    const q = rec.kernel, pid = w.profileId;
    if (!rec.by) rec.by = pkTakeover(w, e) ? 'human' : 'agent'; // the operator at the START (a takeover never lifts an agent's ceremony)
    if (q.clientDataHash.length !== 43) { say('pk-req-hash:' + pid, `${pid}: a passkey request came without a 32-byte clientDataHash — answered not allowed`); await pkKernelAnswer(w, e, rec, { error: 'NotAllowedError' }); return pkKernelEnd(w, e, rec, 'error', 'NotAllowedError'); }
    const pre = WA().requestVerdict({ crypto, req: q, rpMatches: PS.rpMatches });
    if (pre) return pkKernelRefuse(w, e, rec, pre);
    if (!pks) return pkKernelRefuse(w, e, rec, 'none'); // no store wired: nothing in VibeSpace holds a passkey
    const part = PS.profileOf(pkRead(), pid), owner = pkOwner(w, e);
    const gk = pid + ' ' + PS.grantKey(rec.rpId, owner || '');
    const v = PS.gateVerdict({ kind: rec.conditional ? 'conditional' : rec.kind, rpId: rec.rpId, origin: q.origin, rows: part.rows, grant: pkGrants.get(gk) || null, input: { allow: rec.allow || [] }, answer: rec.answer || null, profileSwitch: part.agentsOff, takeover: rec.by === 'human', now: now() });
    if (v.verdict === 'refuse') return pkKernelRefuse(w, e, rec, v.why);
    if (v.verdict === 'ask') return pkAsk(w, e, rec, v.rows);
    const f = PS.kernelFlags(v, { kind: rec.kind, answer: rec.answer || null, takeover: rec.by === 'human', userVerification: q.userVerification });
    if (f.ask) return pkAsk(w, e, rec, v.load); // the page REQUIRES UV and nobody decided this ceremony: the owner's card is the verification
    if (v.consumeGrant) pkGrants.delete(gk);
    return rec.kind === 'create' ? pkKernelCreate(w, e, rec, v, f) : pkKernelSign(w, e, rec, v, f);
  }
  /** A sign-in: the row (the page's allow list order, else the latest used), its key unsealed for ONE signature, the count bumped
   *  and WRITTEN before the answer leaves (a crash between = one count the site refuses once, never a reused one), the use noted,
   *  the answer. No row opens ⇒ the page meets an empty authenticator (NotAllowedError, as standard Chrome's). */
  async function pkKernelSign(w, e, rec, v, f) {
    const q = rec.kernel, pid = w.profileId;
    for (const row of PS.signOrder(PS.profileOf(pkRead(), pid).rows, v.load, rec.allow)) {
      const key = PS.open(pks.cipher, row), refused = PS.keyRefusal(key);
      if (refused) { pkKeyRefused(w, rec, refused); return pkKernelRefuse(w, e, rec, 'webauthn_key_locked'); }
      pkKeyOk();
      if (!key) { say('pk-open:' + row.credentialId.slice(0, 8), `${pid}: a stored passkey (${row.credentialId.slice(0, 8)}) could not be unsealed — the key file changed?`); continue; }
      const used = PS.reconcile(PS.bumpSignCount(row).row, 0, now());
      if (!pkWrite(PS.withRow(pkRead(), pid, used))) { await pkKernelAnswer(w, e, rec, { error: 'NotAllowedError' }); return pkKernelEnd(w, e, rec, 'error', 'NotAllowedError'); } // the count is not on disk: never signed with
      const ad = WA().authenticatorData({ crypto, rpId: row.rpId, flags: f, signCount: used.signCount });
      const { signature } = WA().assertion({ crypto, privateKeyPkcs8: key, clientDataHash: q.clientDataHash, authenticatorData: ad });
      rec.userName = row.userName; rec.uv = f.uv;
      pkUse(w, e, rec, `sign in to ${row.rpId} with a passkey`);
      const r = await pkKernelAnswer(w, e, rec, { get: { credentialId: row.credentialId, authenticatorData: WA().b64u(ad), signature: WA().b64u(signature), userHandle: row.userHandle || null } });
      pkKernelEnd(w, e, rec, r.ok ? 'ok' : 'aborted-by-page', r.ok ? null : r.code);
      emit({ kind: 'passkeys', profileId: pid }); // the table's uses / last used
      return v;
    }
    await pkKernelAnswer(w, e, rec, { error: 'NotAllowedError' });
    pkKernelEnd(w, e, rec, 'error', 'NotAllowedError');
    return v;
  }
  /** A registration: a P-256 pair made HERE, sealed under the passkeys' key BEFORE the answer leaves (a key VibeSpace cannot keep
   *  is never handed to a site), the row written (signCount 0, NEW_KEY_POLICY), the use noted, the answer; a page that is gone
   *  by then never got it — its row is dropped again. */
  async function pkKernelCreate(w, e, rec, v, f) {
    const q = rec.kernel, pid = w.profileId;
    const m = WA().makeCredential({ crypto, rpId: rec.rpId, user: q.userId ? { id: q.userId } : null, flags: f });
    const sealed = PS.seal(pks.cipher, m.privateKeyPkcs8.toString('base64')), refused = PS.keyRefusal(sealed);
    m.privateKeyPkcs8.fill(0);
    if (refused) { pkKeyRefused(w, rec, refused); return pkKernelRefuse(w, e, rec, 'webauthn_key_locked'); }
    pkKeyOk();
    const row = PS.normalizeRow({ credentialId: WA().b64u(m.credentialId), rpId: rec.rpId, userHandle: q.userId, userName: rec.user && rec.user.name, displayName: rec.user && rec.user.displayName, keySealed: sealed, signCount: 0, createdBy: v.createdBy === 'human' ? 'human' : 'agent', bySession: pkOwner(w, e), createdAt: now(), policy: PS.NEW_KEY_POLICY });
    if (!row || !pkWrite(PS.withRow(pkRead(), pid, row))) { say('pk-new:' + pid, `${pid}: a new passkey was not stored — the page was told it was not allowed`); await pkKernelAnswer(w, e, rec, { error: 'NotAllowedError' }); return pkKernelEnd(w, e, rec, 'error', 'NotAllowedError'); }
    rec.createdBy = row.createdBy; rec.userName = row.userName; rec.uv = f.uv; rec.harvested = true;
    pkUse(w, e, rec, `register a passkey on ${rec.rpId}`);
    const r = await pkKernelAnswer(w, e, rec, { create: { credentialId: row.credentialId, attestationObject: WA().b64u(m.attestationObject) } });
    if (!r.ok) { rec.harvested = false; pkWrite(PS.dropRows(pkRead(), pid, (x) => x.credentialId === row.credentialId).store); }
    pkKernelEnd(w, e, rec, r.ok ? 'ok' : 'aborted-by-page', r.ok ? null : r.code);
    emit({ kind: 'passkeys', profileId: pid });
    return v;
  }
  /** Refused by name: the page is told NotAllowedError, the reason stays on the record (said to the next verbs for a minute). */
  async function pkKernelRefuse(w, e, rec, why) {
    rec.refused = true; rec.why = why;
    if (why !== 'none') pkTrace(w, e, rec, 'refused', { why });
    await pkKernelAnswer(w, e, rec, { error: 'NotAllowedError' });
    pkKernelEnd(w, e, rec, 'refused', 'NotAllowedError');
    return { verdict: 'refuse', why };
  }
  /** The hook verbs the shared code asks (pkAsk's heartbeat, a failed step's release, a withdrawal) on the kernel road. */
  async function pkKernelCtl(w, e, rec, verb) {
    if (verb === 'wait' || verb === 'drained' || rec.outcome !== 'pending') return null; // the kernel's request simply waits
    if (verb === 'cancel') return pkKernelCancel(w, e, rec);
    const r = await pkKernelAnswer(w, e, rec, { error: 'NotAllowedError' }); // refuse · a failed step's release: never a signature
    pkKernelEnd(w, e, rec, rec.refused ? 'refused' : 'error', 'NotAllowedError');
    return r;
  }
  /** `passkey cancel` / the live view's Cancel on the kernel: `VibeSpace.cancelSurface` — the page sees NotAllowedError (Q4). */
  async function pkKernelCancel(w, e, rec, by = 'agent') {
    if (rec.outcome !== 'pending' || rec.answering) return false;
    rec.answering = true;
    const r = await call(w, 'VibeSpace.cancelSurface', { surfaceId: rec.kernel.surfaceId }, e.sid);
    rec.answering = false;
    if (!r || r.error || r.timeout || (r.result && r.result.ok === false)) { if (r && ((r.result && r.result.code === 'no_such_surface') || /no_such_surface/.test(String(r.error && r.error.message)))) pkKernelEnd(w, e, rec, 'aborted-by-page'); return false; }
    rec.by = by;
    pkKernelEnd(w, e, rec, 'cancelled', 'NotAllowedError');
    return true;
  }
  /** ONE answer on the ceremony's page session — `VibeSpace.webauthnAnswer {surfaceId, requestId, get | create | error}` →
   *  {ok} | {ok:false, code} (the kernel's refusal by name — `no_such_request`: the page or the kernel ended it first). */
  async function pkKernelAnswer(w, e, rec, body) {
    const q = rec.kernel;
    rec.answering = true;
    const r = await call(w, 'VibeSpace.webauthnAnswer', { surfaceId: q.surfaceId, requestId: q.requestId, ...body }, e.sid);
    rec.answering = false;
    const code = r && r.error ? String((r.error.data && r.error.data.code) || (String(r.error.message || '').match(/\b(no_such_request|no_such_surface|invalid_values|eval_failed)\b/) || [])[1] || 'eval_failed').slice(0, 40)
      : r && r.timeout ? 'timeout' : r && r.result && r.result.ok === false ? String(r.result.code || 'eval_failed').slice(0, 40) : null;
    if (code) say('pk-answer:' + w.profileId + ':' + code, `${w.profileId}: the kernel did not take a passkey answer — ${code}`);
    return code ? { ok: false, code } : { ok: true };
  }
  /** The ceremony is over: the record ends (an open card withdrawn), its trace row, the chip / waiters re-read. */
  function pkKernelEnd(w, e, rec, outcome, name = null) {
    if (rec.outcome !== 'pending') return;
    const a = rec.ask && pkAsks.get(rec.ask); if (a && a.state === 'open') pkClose(a, 'withdrawn');
    PK.applyEvent(e.pk.records, { ev: 'end', id: rec.n, outcome, ...(name && /^[A-Za-z_]{1,40}$/.test(name) ? { name } : {}) }, { tab: e.targetId, ctx: 0, now: now() });
    if (!rec.refused) pkTrace(w, e, rec, rec.outcome, rec.harvested ? { harvested: true } : {});
    passkeyChanged(w, e);
  }
  /** THE USE LAW (lane vault-use-law): a signature or a new key is a USE of the passkeys' sealed key — ONE line through the
   *  vault's writer (purpose + receipt; the key's bytes never leave this process). → the receipt (kept on the record) or null. */
  function pkUse(w, e, rec, purpose) {
    if (typeof vaultUse !== 'function') return null;
    const owner = pkOwner(w, e);
    const h = owner ? (holdersOf ? holdersOf(w.profileId) : []).find((x) => x && x.browserKey === owner && x.sessionId) : null;
    let label = null; try { label = labelOf ? labelOf(w.profileId) : null; } catch { label = null; }
    try { const r = vaultUse('passkeys', { by: rec.by === 'human' ? 'human' : 'agent', door: 'passkey', conv: h ? h.sessionId : null }, { outcome: 'ok', purpose, actor: `the agent browser ${label || w.profileId}`.slice(0, 80) }); rec.receipt = r && r.receipt ? String(r.receipt) : null; } catch (err) { say('pk-use:' + (err && err.message), `${w.profileId}: the passkey use was not noted — ${err && err.message}`); }
    return rec.receipt || null;
  }
  /** The webauthn surface on a kernel with `webauthn`: the record stands for it. One whose request never comes (it began before
   *  this socket — a reconnect's listSurfaces; the request is not sent again) is cancelled: nothing could sign it. */
  function pkSurface(w, srec) {
    const t = setTimeout(() => {
      if (w.state !== 'open' || w.surf.get(srec.id) !== srec || pkRecOf(w, srec.id)) return;
      say('pk-orphan:' + w.profileId, `${w.profileId}: a passkey request the kernel holds came with no request this watch saw (it began before this socket) — cancelled, the page is told it was not allowed`);
      const e = w.targets.get(srec.targetId);
      call(w, 'VibeSpace.cancelSurface', { surfaceId: srec.id }, e ? e.sid : null);
    }, passkeyOrphanMs);
    if (t.unref) t.unref();
  }
  /** The kernel closed a ceremony's surface that VibeSpace was not answering: the page went (aborted, timed out, navigated), or
   *  the agent's / the person's dismiss through the surface doors (`answer <id> cancel`). */
  function pkSurfaceGone(w, srec) {
    const hit = pkRecOf(w, srec.id);
    if (!hit || hit.r.outcome !== 'pending' || hit.r.answering) return;
    const by = srec.pendingBy ? srec.pendingBy.by : null;
    if (by) hit.r.by = by;
    pkKernelEnd(w, hit.e, hit.r, by ? 'cancelled' : 'aborted-by-page');
  }
  // ── lane browser-surfaces (P1 of the custom browser kernel): A KERNEL'S SURFACES — the dialog pipeline's ONE source there ──
  /** `VibeSpace.getVersion` on the browser session, ONCE per browser (the answer is kept per profile until it starts again): no
   *  method / no `surfaces` ⇒ today's road (one journal line); `{protocol: 1, features: [… 'surfaces' …]}` ⇒ the kernel road. */
  async function probeKernel(w) {
    if (kernelOf.has(w.profileId)) { w.kernel = kernelOf.get(w.profileId); return; }
    const v = await call(w, 'VibeSpace.getVersion', {}, null, Math.min(callTimeoutMs, KERNEL_PROBE_MS));
    const r = v && v.result && typeof v.result === 'object' ? v.result : null;
    const feats = r && Array.isArray(r.features) ? r.features.map((x) => String(x).slice(0, 40)).slice(0, 16) : [];
    if (r && Number(r.protocol) === 1 && feats.includes('surfaces')) {
      w.kernel = { protocol: 1, kinds: Array.isArray(r.kinds) ? r.kinds.map((x) => String(x).slice(0, 40)).slice(0, 64) : [], features: feats };
      say('kernel:' + w.profileId, `${w.profileId}: a browser kernel with VibeSpace surfaces (protocol 1, ${feats.join(' + ')}) — its page prompts are read from its surfaces`);
      const unknown = w.kernel.kinds.filter((k) => !SF().SURFACE_KINDS.includes(k));
      if (unknown.length) say('kinds:' + w.profileId, `${w.profileId}: the kernel names ${unknown.length} surface kind(s) VibeSpace does not know (${unknown.slice(0, 4).join(', ')}) — each is a generic card`);
    } else {
      w.kernel = false;
      say('kernel:' + w.profileId, `${w.profileId}: no VibeSpace surfaces on this browser (${v && v.error ? 'VibeSpace.getVersion is not a method here' : v && v.timeout ? 'VibeSpace.getVersion did not answer' : r && Number(r.protocol) !== 1 ? `protocol ${String(r.protocol).slice(0, 8)}` : 'no surfaces feature'}) — today's dialog road`);
    }
    if (!(v && v.timeout)) kernelOf.set(w.profileId, w.kernel); // never asked again for this browser (a silent socket is asked on the next one)
    crossCheckEngine(w);
  }
  /** P0's hand-over (design §1.2): a profile whose browser is an ENGINE plugin has TWO answers about its kernel — the engine's own
   *  probe (the registry) and the live `VibeSpace.getVersion` — a disagreement is ONE journal line; the live answer rules. */
  function crossCheckEngine(w) {
    let choice = null; try { const b = keeper && typeof keeper.browserOf === 'function' ? keeper.browserOf(w.profileId) : null; choice = b && b.browserChoice && b.browserChoice.kind === 'plugin' ? b.browserChoice : null; } catch { choice = null; }
    if (!choice || typeof keeper.engineFactOf !== 'function') return;
    Promise.resolve(keeper.engineFactOf(String(choice.id || ''))).then((fact) => {
      if (!fact || fact.code) return;
      const pf = Array.isArray(fact.features) ? fact.features.map((x) => String(x).slice(0, 40)).sort() : [], lf = w.kernel ? [...w.kernel.features].sort() : [];
      const pk = Array.isArray(fact.kinds) ? fact.kinds.length : 0, lk = w.kernel ? w.kernel.kinds.length : 0;
      if (JSON.stringify(pf) !== JSON.stringify(lf) || pk !== lk) say('engine-x:' + w.profileId, `${w.profileId}: the engine ${String(choice.id).slice(0, 80)}'s probe says features [${pf.join(', ')}] and ${pk} kinds, its live kernel [${lf.join(', ')}] and ${lk} — the live answer rules`);
    }).catch(() => { /* the probe's own refusal is the keeper's to say */ });
  }
  /** THE THREE-TOUCH RULE on one page session (every attach, every re-ask of a held tab): ① `VibeSpace.enable {surfaces:true}`
   *  ② `VibeSpace.listSurfaces {targetId}` aligns `w.surf` (③ the CLI's long-poll is module-wide — it re-arms by itself). */
  async function armSurfaces(w, e) {
    if (!e.sid) return;
    const en = await call(w, 'VibeSpace.enable', { surfaces: true }, e.sid);
    if (!en || en.timeout || en.error || (en.result && en.result.ok === false)) { say('senable:' + w.profileId + ':' + (en && en.error ? en.error.message : en && en.timeout ? 'timeout' : 'refused'), `${w.profileId}: VibeSpace.enable was not taken on tab ${e.targetId} — ${en && en.error ? en.error.message : en && en.timeout ? 'it did not answer' : String((en.result && en.result.code) || 'refused').slice(0, 40)}`); return; }
    e.surfaces = true;
    if (pkSinks(w)) { e.pk.armed = true; e.pk.sink = true; } // lane passkey-sink: the kernel's requests ARE this tab's ceremonies (no hook, no virtual authenticator)
    const ls = await call(w, 'VibeSpace.listSurfaces', { targetId: e.targetId }, e.sid);
    const list = ls && ls.result && Array.isArray(ls.result.surfaces) ? ls.result.surfaces : null;
    if (list && w.targets.get(e.targetId) === e) alignSurfaces(w, e.targetId, list);
  }
  /** ② — what the kernel lists is what stands: a known one it no longer lists closed `navigated` by the kernel, a new one opened. */
  function alignSurfaces(w, tid, list) {
    const listed = new Set();
    for (const s of list.slice(0, 64)) {
      if (!s || typeof s !== 'object' || (s.targetId && String(s.targetId) !== tid)) continue;
      const id = String(s.surfaceId || ''); listed.add(id);
      if (!w.surf.has(id)) onSurfaceOpened(w, tid, s);
    }
    for (const rec of [...w.surf.values()]) if (rec.targetId === tid && !listed.has(rec.id)) onSurfaceClosed(w, tid, { surfaceId: rec.id, how: 'navigated', by: 'kernel' });
  }
  /** The tab an event is FOR (Q2): the page session it rode, else its `params.targetId` when this watch knows that tab. */
  function surfaceTab(w, m) {
    const tid = w.sessions.get(String(m.sessionId || ''));
    if (tid) return tid;
    const pt = m.params && m.params.targetId ? String(m.params.targetId) : '';
    return pt && w.targets.has(pt) ? pt : null;
  }
  function onSurfaceOpened(w, tid, p) {
    if (!tid) { say('surf-tab:' + w.profileId, `${w.profileId}: a surface for a tab this watch does not know was not taken (${String((p && p.kind) || '?').slice(0, 32)})`); return; }
    const t = now();
    const b = SF().surfaceBlock(p, { now: t, pageText: ST.pageText });
    if (!b) { say('surf-id:' + w.profileId, `${w.profileId}: a surface without a usable id was not taken`); return; }
    if (w.surf.has(b.id)) return; // listSurfaces after an event that already opened it
    const rec = { ...b, targetId: tid, surface: true };
    w.surf.set(rec.id, rec);
    if (w.surf.size > 256) { const old = w.surf.keys().next().value; const x = w.surf.get(old); w.surf.delete(old); surfaceAskDone(w, x); }
    const sink = SF().sinkOf(rec.kind, w.kernel);
    if (sink === 'webauthn') { rec.passkey = true; return pkSurface(w, rec); } // lane passkey-sink: the passkey record stands for it — never a second dialog_open, never a browser-surface card
    if (sink === 'credentials' || (rec.kind === 'http-auth' && loginSinks(w))) { if (sink) rec.sink = sink; else rec.logins = true; } // lane browser-login: the login road fills it — the agent's line names `vibespace-browser login`
    if (rec.cls === 'silent') { // SILENT: one journal line per kind, never a card, never a note
      say('supp:' + w.profileId + ':' + ((rec.detail && rec.detail.suppressedKind) || rec.kind), `${w.profileId}: surface:${rec.kind} ${(rec.detail && rec.detail.suppressedKind) || ''}${rec.detail && rec.detail.reason ? ` (${rec.detail.reason})` : ''}`);
      emit({ kind: 'surface', state: 'trace', profileId: w.profileId, targetId: tid, surface: { id: rec.id, kind: rec.kind, suppressedKind: (rec.detail && rec.detail.suppressedKind) || null } });
      return;
    }
    // P — the policy answers at once over this socket (each row's RED control lives in test-browser-surfaces)
    const pv = SF().policyVerdict(rec, { grants: [...w.grants.values()] });
    if (pv) {
      rec.policy = pv;
      answerSurfaceOn(w, rec, { answerId: pv.answerId, values: null, files: null, by: 'policy' }).then((r) => { if (!r.ok && w.surf.get(rec.id) === rec) { say('policy:' + w.profileId + ':' + r.code, `${w.profileId}: a ${rec.kind} surface was not answered by policy — ${r.error}`); rec.policy = null; standSurface(w, rec); } });
      return;
    }
    // a js-dialog alert: today's rule — accepted at once (the tab's budget), held for the user while they drive
    if (rec.kind === 'js-dialog' && rec.type === 'alert') {
      const e = w.targets.get(tid);
      if (userDrives(w.profileId)) { rec.forUser = true; return standSurface(w, rec); }
      const recent = e ? (e.autoAt = (e.autoAt || []).filter((x) => t - x < ST.AUTO_ACCEPT_WINDOW_MS)).length : 0;
      const v = ST.autoAnswerVerdict(rec, { recent });
      if (v.auto) {
        if (e) e.autoAt.push(t);
        rec.autoPending = true; w.autoSurf++;
        const pick = SF().dialogAnswerOf(rec, { accept: true });
        answerSurfaceOn(w, rec, { answerId: pick ? pick.answerId : '', values: null, files: null, by: 'auto' }).then((r) => { rec.autoPending = false; if (!r.ok && w.surf.get(rec.id) === rec) { say('sauto:' + r.code, `${w.profileId}: an alert surface could not be accepted — ${r.error}`); standSurface(w, rec); } });
        return;
      }
      if (v.storm) rec.storm = v.storm;
    }
    standSurface(w, rec);
  }
  /** A surface that waits: HELD ⇒ the dialog road (`w.open` for its tab, the waiters, the idle notice, the owner's card later);
   *  NOTED ⇒ one line in the next result + the live view's bar. */
  function standSurface(w, rec) {
    if (rec.cls === 'held') {
      const cur = w.open.get(rec.targetId);
      if (!cur || cur.surface !== true || !w.surf.has(cur.id)) { w.open.set(rec.targetId, rec); held(w, rec.targetId, rec); }
      surfaceAskLater(w, rec);
      return;
    }
    noteSurface(w, rec, { state: 'open' });
    emit({ kind: 'surface', state: 'open', profileId: w.profileId, targetId: rec.targetId, surface: rec });
  }
  function noteSurface(w, rec, { state, how = '', by = '', answer = null, why = '' }) {
    w.promptNotes.push({ id: `${rec.id}:${state}`, kind: 'surface', state, block: SF().blockAt(rec, { now: now() }), how, by, answer, why, at: now(), targetId: rec.targetId });
    if (w.promptNotes.length > ANSWERED_KEEP) w.promptNotes.shift();
  }
  function onSurfaceUpdated(w, tid, p) {
    const rec = w.surf.get(String((p && p.surfaceId) || ''));
    if (!rec || (tid && rec.targetId !== tid)) return;
    const n = SF().applySurfacePatch(rec, p.patch, { now: now(), pageText: ST.pageText });
    const next = { ...n, targetId: rec.targetId, surface: true, ...(rec.policy ? { policy: rec.policy } : {}), ...(rec.forUser ? { forUser: true } : {}) };
    w.surf.set(rec.id, next);
    if (w.open.get(rec.targetId) === rec) w.open.set(rec.targetId, next);
    if (rec.cls !== 'held' && next.cls === 'held') { standSurface(w, next); return; } // a download turned dangerous: now the owner's
    emit({ kind: 'surface', state: 'updated', profileId: w.profileId, targetId: rec.targetId, surface: next });
  }
  function onSurfaceClosed(w, tid, p) {
    const id = String((p && p.surfaceId) || '');
    const rec = w.surf.get(id);
    if (!rec) return;
    w.surf.delete(id);
    surfaceAskDone(w, rec);
    if (rec.passkey) return pkSurfaceGone(w, rec); // lane passkey-sink: its ceremony ends with it (the record says so — no surface note)
    const a = SF().closedBlock(rec, { how: String(p.how || ''), by: String(p.by || ''), answeredBy: rec.pendingBy ? rec.pendingBy.by : null, answerId: rec.pendingBy ? rec.pendingBy.answerId : null, at: now() });
    if (w.open.get(rec.targetId) === rec) {
      w.open.delete(rec.targetId);
      // the next held surface on that tab (if any) stands in its place
      const next = [...w.surf.values()].filter((x) => x.targetId === rec.targetId && x.cls === 'held' && !x.policy && !x.autoPending).sort((x, y) => x.openedAt - y.openedAt)[0];
      if (next) { w.open.set(next.targetId, next); held(w, next.targetId, next); }
    }
    if (rec.kind === 'js-dialog') { // the dialog road's own record (alertsNote / answeredNote / waitSettled read it)
      const dismissed = a.how === 'dismissed' || (a.answer && a.answer.kind === 'dismiss') || (a.how !== 'answered');
      w.answered.push({ id: rec.id, dialog: rec, how: dismissed ? 'dismissed' : 'accepted', by: a.by === 'kernel' || a.by === 'page' ? 'unknown' : a.by, at: a.at, targetId: rec.targetId, surface: true });
      if (w.answered.length > ANSWERED_KEEP) w.answered.splice(0, w.answered.length - ANSWERED_KEEP);
    } else if (rec.cls !== 'silent' && a.by !== 'agent') noteSurface(w, rec, { state: 'closed', how: a.how, by: a.by, answer: a.answer || null, why: rec.policy ? rec.policy.why : '' });
    emit({ kind: 'closed', profileId: w.profileId, targetId: rec.targetId, answered: { ...a, dialog: SF().blockAt(rec, { now: a.at }) } });
    withdrawNotices([rec.id]);
  }
  /** ONE answer over THIS socket's session for the surface's tab — `VibeSpace.answerSurface {surfaceId, answerId, values?, files?}`;
   *  the kernel's refusal (a CDP error naming its code, or `{ok:false, code}`) mapped BY NAME. Who answered is kept on the
   *  record for its close. */
  async function answerSurfaceOn(w, rec, { answerId, values = null, files = null, by }) {
    const e = w.targets.get(rec.targetId);
    if (!e || !e.sid) return { ok: false, code: 'not_watched', error: 'VibeSpace is not attached to that tab' };
    rec.pendingBy = { by, answerId: String(answerId || '') };
    const params = { surfaceId: rec.id, answerId: String(answerId || ''), ...(values && Object.keys(values).length ? { values } : {}), ...(files && files.length ? { files } : {}) };
    const r = await call(w, 'VibeSpace.answerSurface', params, e.sid);
    const kerr = r && r.error ? (String((r.error.data && r.error.data.code) || '').match(/^[a-z_]{3,40}$/) ? r.error.data.code : (String(r.error.message || '').match(/\b(no_such_surface|invalid_action|stale_origin|no_such_request|invalid_values|eval_failed)\b/) || [])[1] || 'eval_failed') : r && r.result && r.result.ok === false ? String(r.result.code || 'eval_failed') : null;
    if (!r || r.timeout || kerr) {
      if (rec.pendingBy && rec.pendingBy.answerId === String(answerId || '')) rec.pendingBy = null;
      const code = r && r.timeout ? 'answer_failed' : SF().kernelErrorToCode(kerr);
      if (code === 'no_dialog' && w.surf.get(rec.id) === rec) onSurfaceClosed(w, rec.targetId, { surfaceId: rec.id, how: 'navigated', by: 'kernel' }); // the kernel no longer has it: it is gone here too
      return { ok: false, code, error: r && r.timeout ? 'the browser did not answer' : `the browser refused that answer (${String(kerr).slice(0, 40)})` };
    }
    return { ok: true, surface: rec };
  }
  /** The profile's downloads directory, REAL (a symlink never moves the sandbox), or null — async: a path an agent names may sit
   *  on a mount, never read synchronously on the hub's loop. */
  async function sandboxOf(pid) {
    let d = null; try { d = typeof downloadsDirOf === 'function' ? downloadsDirOf(pid) : null; } catch { d = null; }
    return typeof d === 'string' && d[0] === '/' ? realOf(d) : null;
  }
  const realOf = (p) => { const s = String(p || ''); return s && s[0] === '/' ? require('fs').promises.realpath(s).catch(() => null) : Promise.resolve(null); };
  /** THE ANSWER DOOR (the agent's `vibespace-browser answer <id> <answerId> [--value k=v] [--file p]`, the live view's buttons,
   *  the For-you card's Approve / Reject): the surface in the conversation's scope, the verdict (who may pick what, the values,
   *  the files inside the downloads directory, the card the user saw), then the kernel. */
  async function answerSurface({ profileId, browserKey = '', sessionId = null, ephemeral = false } = {}, { surfaceId, answerId, values = null, files = null, by = 'agent', shown = null } = {}) {
    const pid = String(profileId || ''); const w = watches.get(pid);
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    if (!w.kernel) return { ok: false, code: 'no_dialog', error: 'this browser has no VibeSpace surfaces (standard Chrome) — a page dialog is answered with vibespace-browser dialog accept|dismiss' };
    const scope = by === 'user-card' ? null : scopeFor({ profileId: pid, browserKey, sessionId, ephemeral });
    const rec = w.surf.get(String(surfaceId || ''));
    if (!rec || !inScope(scope, rec.targetId) || rec.cls === 'silent') return { ok: false, code: 'no_dialog', error: 'no such browser prompt is open on your browser — vibespace-browser surfaces lists them' };
    if (shown !== null && shown !== undefined && String(shown) !== SF().digestOf(rec)) return { ok: false, code: 'surface_changed', error: 'that prompt changed after it was shown — nothing was answered; read it again' };
    const who = by === 'user-card' ? 'user' : by;
    const list = Array.isArray(files) ? await Promise.all(files.slice(0, SF().FILES_MAX + 1).map(async (f) => ({ asked: String(f || '').slice(0, 300), real: await realOf(f) }))) : null;
    const v = SF().answerVerdict({ block: rec, by: who, answerId, values, files: list, sandbox: list && list.length ? await sandboxOf(pid) : null });
    if (!v.ok) return v;
    const r = await answerSurfaceOn(w, rec, { answerId: v.answer.id, values: v.values, files: v.files, by: who });
    if (!r.ok) return r;
    if (who === 'agent' && browserKey) { let seen = told.get(browserKey); if (!seen) { seen = new Set(); told.set(browserKey, seen); } seen.add(rec.id); }
    return { ok: true, surface: SF().blockAt(rec, { now: now() }), answer: v.answer, text: `the browser prompt was answered: ${JSON.stringify(v.answer.label)} — ${SF().kindWord(rec)}${rec.url ? ` from ${rec.url}` : ''}` };
  }
  /** Every surface standing in the conversation's scope (`vibespace-browser surfaces`, the live view's bar) — blocks, oldest first. */
  function surfacesIn(profileId, scope = null) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open' || !w.kernel) return [];
    return [...w.surf.values()].filter((x) => x.cls !== 'silent' && !x.policy && !x.autoPending && inScope(scope, x.targetId)).sort((a, b) => a.openedAt - b.openedAt).map((x) => SF().blockAt(x, { now: now() }));
  }
  /** The live view's relay question: does a BLOCKING surface stand on these tabs (null = any)? Input to the page is dropped then. */
  function blockingOn(profileId, targets = null) {
    const w = watches.get(String(profileId || ''));
    if (!w || !w.kernel) return null;
    const set = Array.isArray(targets) && targets.length ? new Set(targets.map(String)) : null;
    for (const x of w.surf.values()) if (x.blocking && x.cls !== 'silent' && !x.policy && (!set || set.has(x.targetId))) return { id: x.id, kind: x.kind };
    return null;
  }
  /** The For-you card's door: the surface by its id on any watched browser (the owner's card names no conversation). */
  function surfaceById(surfaceId) {
    for (const w of watches.values()) { const rec = w.surf.get(String(surfaceId || '')); if (rec && w.state === 'open') return { profileId: w.profileId, block: SF().blockAt(rec, { now: now() }) }; }
    return null;
  }
  /** A HELD surface only the OWNER can answer (some answer is not the agent's), unanswered PROMPT_ASK_MS ⇒ ONE For-you card
   *  (`browser-surface`: Approve presses its first answer that needs no typing, Reject its dismiss — the card's `shown` digest
   *  guards both); resolved when it closes. */
  function surfaceAskLater(w, rec) {
    if (!forYou || w.surfTimers.has(rec.id) || !(rec.answers || []).some((a) => !SF().agentMay(rec, a))) return;
    const x = setTimeout(() => { w.surfTimers.delete(rec.id); surfaceAsk(w, rec.id); }, promptAskMs);
    if (x.unref) x.unref();
    w.surfTimers.set(rec.id, x);
  }
  function surfaceAsk(w, id) {
    const rec = w.surf.get(id);
    if (!rec || w.surfForYou.has(id) || !forYou) return;
    let label = null; try { label = labelOf ? labelOf(w.profileId) : null; } catch { label = null; }
    const what = SF().kindTitle(rec.kind, (k) => k); // the kind's title KEY (worded in the device's language: a param may be words)
    const site = rec.url || '';
    const text = site ? 'A page in the agent browser asks you ({site}): {what}' : 'A page in the agent browser asks you: {what}'; const detail = 'Open its live view to answer it there — or Approve / Reject here.';
    const approve = SF().approveOf(rec); const reject = (rec.answers || []).find((a) => a.kind === 'dismiss') || null;
    let fy = null;
    try { fy = forYou.add?.(w.profileId, { kind: 'action', urgency: 'high', text: text.replace('{site}', site).replace('{what}', what) + (label ? ` — ${String(label).slice(0, 80)}` : ''), detail, i18n: { text: { key: text, params: { what: { key: what }, ...(site ? { site } : {}) } }, detail: [{ key: detail }] },
      ...(approve || reject ? { action: { type: 'browser-surface', id: rec.id, shown: SF().digestOf(rec), ...(approve ? { approve: approve.id, approveLabel: approve.label } : {}), ...(reject ? { reject: reject.id } : {}) } } : {}) }); } catch (err) { say('surf-fy:' + (err && err.message), `the browser prompt's For-you item was not filed — ${err && err.message}`); }
    if (fy) w.surfForYou.set(id, fy);
  }
  function surfaceAskDone(w, rec) {
    if (!rec) return;
    const x = w.surfTimers.get(rec.id); if (x) { clearTimeout(x); w.surfTimers.delete(rec.id); }
    const fy = w.surfForYou.get(rec.id); if (fy) { w.surfForYou.delete(rec.id); try { forYou?.resolve?.(fy); } catch { /* the tray's own failure */ } }
  }
  // ── lane browser-login (P3 of the custom browser kernel, design §4): WEB LOGINS — on a kernel whose features list
  // `credentials` the kernel reports a page's login forms (`VibeSpace.credentialFormDetected` → the tab's `e.forms`, ≤ 8, a new
  // document clears them), fills what the VAULT holds (`VibeSpace.fillCredential` — the values ride this loopback socket and
  // nothing here keeps them) and says when the page took a form (`VibeSpace.credentialSubmitted` → the ONE writer,
  // src/server/browser-logins.js, saves what it should). The agent's door is `fillLogin` (`vibespace-browser login`): the
  // verdict, the grant, the two-step code and every use line are the logins module's; an http-auth surface is answered the same
  // way (its credential answer, the same phishing rule and grant).
  function loginSinks(w) { return !!(w && w.kernel && Array.isArray(w.kernel.features) && w.kernel.features.includes('credentials')); }
  function onLoginForm(w, tid, p) {
    const e = tid ? w.targets.get(tid) : null;
    if (!e || !loginSinks(w)) { say('login-form:' + w.profileId, `${w.profileId}: a login form ${e ? 'from a browser that does not list the credentials feature' : 'for a tab this watch does not know'} was not kept`); return; }
    const f = BL().formOf(p, { now: now() });
    if (!f) { say('login-form-bad:' + w.profileId, `${w.profileId}: a login form the kernel reported had no field VibeSpace can fill — not kept`); return; }
    e.forms = BL().keepForm(e.forms, { ...f, targetId: e.targetId });
    emit({ kind: 'login-form', profileId: w.profileId, targetId: e.targetId, form: { id: f.id, kind: f.kind, origin: f.pageOrigin } });
  }
  /** The conversation a tab's page is for — its id and its name (the notice's words, the entry's provenance). */
  function loginConv(w, e) {
    const bk = pkOwner(w, e);
    const h = (holdersOf ? holdersOf(w.profileId) || [] : []).find((x) => x && !x.human && bk && parentKey(x.browserKey) === parentKey(bk));
    let c = null; try { c = h && h.sessionId && typeof conversationOf === 'function' ? conversationOf(h.sessionId) : null; } catch { c = null; }
    return { conv: (c && c.cid) || (h && h.sessionId) || null, name: (c && c.name) || null };
  }
  function onLoginSubmitted(w, tid, p) {
    const e = tid ? w.targets.get(tid) : null;
    if (!e || !loginSinks(w) || !logins) { say('login-sub:' + w.profileId, `${w.profileId}: a login submission ${e ? 'on a browser VibeSpace keeps no logins for' : 'for a tab this watch does not know'} was not saved`); return; }
    const filled = e.filled && e.filled.formId === String(p.surfaceId || p.formId || '') && now() - e.filled.at < 10 * 60e3 ? e.filled : null;
    const by = pkTakeover(w, e) ? 'human' : 'agent';
    const who = filled ? { conv: filled.conv, name: filled.actor } : loginConv(w, e);
    let r;
    try { r = logins.submitted({ origin: p.pageOrigin || p.origin, usernameHint: p.usernameHint, password: typeof p.password === 'string' ? p.password : null, outcome: p.outcome, by, name: filled ? filled.name : null, conv: who.conv, convName: who.name, profileId: w.profileId }); }
    catch (err) { r = { state: 'none', why: err && err.message }; }
    p.password = undefined; // the loopback socket's bytes go nowhere else
    if (filled && r && r.state !== 'held') e.filled = null;
    say('login-saved:' + w.profileId + ':' + Date.now(), `${w.profileId}: a login submission on ${BL().originOf(p.pageOrigin || p.origin) || 'a page'} — ${r ? r.state : 'none'}${r && r.why ? ` (${String(r.why).slice(0, 60)})` : ''}`);
    emit({ kind: 'login-saved', profileId: w.profileId, targetId: e.targetId, state: r ? r.state : 'none', name: (r && r.name) || null });
  }
  /** The forms standing on the conversation's tabs (a kernel's) — ids, kinds, origins and field types only. */
  function loginForms(profileId, scope = null) {
    const w = watches.get(String(profileId || ''));
    if (!w || !loginSinks(w)) return [];
    const out = [];
    for (const e of w.targets.values()) if (inScope(scope, e.targetId)) for (const f of e.forms || []) out.push({ id: f.id, targetId: e.targetId, kind: f.kind, origin: f.pageOrigin, fields: f.fields.map((x) => x.type) });
    return out;
  }
  /** THE `login` DOOR: the conversation's own tabs' forms (+ a held http-auth surface) → the logins module's plan → the kernel
   *  fills (or the surface is answered) → ONE use line → the agent's answer: what was filled, never a value. */
  async function fillLogin({ profileId, browserKey = '', sessionId = null, ephemeral = false } = {}, { origin = null, user = null, newUser = null, generate = false, submit = false, facts = {}, conv = null, actor = null } = {}) {
    const pid = String(profileId || ''); const w = watches.get(pid);
    if (!logins) return { ok: false, code: 'not_watched', error: 'VibeSpace keeps no web logins on this server' };
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    if (!loginSinks(w)) return { ok: false, code: 'login_no_form', error: 'this browser does not report login forms (standard Chrome) — only the custom browser kernel does; the owner can sign in by hand in the live view' };
    const scope = scopeFor({ profileId: pid, browserKey, sessionId, ephemeral });
    const forms = [];
    for (const e of w.targets.values()) if (inScope(scope, e.targetId)) for (const f of e.forms || []) forms.push(f);
    for (const rec of w.surf.values()) if (rec.kind === 'http-auth' && inScope(scope, rec.targetId)) { const f = BL().formOfSurface(SF().blockAt(rec, { now: now() }), { now: rec.openedAt || 0 }); if (f) forms.push({ ...f, targetId: rec.targetId }); }
    forms.sort((a, b) => (a.at || 0) - (b.at || 0));
    const plan = logins.planFill({ forms, origin, user, newUser, generate, facts, conv, actor });
    if (!plan.ok) return plan;
    const e = w.targets.get(String(plan.form.targetId || ''));
    let r = null, kerr = null;
    if (!e || !e.sid) kerr = 'not_attached';
    else if (plan.form.surface) { const rec = w.surf.get(plan.form.id); const a = rec ? await answerSurfaceOn(w, rec, { answerId: plan.form.answerId, values: plan.values, by: 'agent' }) : { ok: false, code: 'no_dialog' }; if (!a.ok) kerr = a.code === 'surface_stale' ? 'stale_origin' : a.code; }
    else {
      r = await call(w, 'VibeSpace.fillCredential', { surfaceId: plan.form.id, values: plan.values, expectedOrigin: plan.origin, submit: !!submit }, e.sid);
      kerr = !r || r.timeout ? 'timeout' : r.error ? (String((r.error.data && r.error.data.code) || '').match(/^[a-z_]{3,40}$/) ? r.error.data.code : (String(r.error.message || '').match(/\b(stale_origin|invalid_values|no_such_surface|eval_failed)\b/) || [])[1] || 'eval_failed') : r.result && r.result.ok === false ? String(r.result.code || 'eval_failed') : null;
    }
    plan.values = null; // handed to the kernel — kept by no one here
    const u = logins.noteFill(plan, { conv, actor, outcome: kerr ? 'login_failed' : 'ok' });
    if (kerr) return { ok: false, code: kerr === 'stale_origin' ? 'login_phishing' : 'login_failed', error: kerr === 'stale_origin' ? `the page is no longer ${plan.origin} (the kernel checked it again) — nothing was filled` : kerr === 'not_attached' ? 'VibeSpace is not attached to that tab — nothing was filled' : `the browser did not fill the form (${String(kerr).slice(0, 40)})${plan.mode === 'login' ? '' : ' — the new login stays in the vault, pending, so no password is lost'}` };
    if (!plan.form.surface) e.filled = { formId: plan.form.id, name: plan.name, mode: plan.mode, at: now(), conv, actor };
    return { ok: true, mode: plan.mode, origin: plan.origin, user: plan.user, filled: plan.filled, submitted: !!submit || !!plan.form.surface, receipt: u && u.receipt, otpMissing: !!plan.otpMissing, ...(plan.length ? { length: plan.length } : {}) };
  }
  /** The kernel road's facts for one browser (the routes' `surfaces` answer, the suites): null = not asked yet. */
  function kernelFactOf(profileId) { const w = watches.get(String(profileId || '')); return w ? w.kernel : kernelOf.has(String(profileId || '')) ? kernelOf.get(String(profileId || '')) : null; }

  // the keeper's own lease seam: a browser that starts again or stops starts a fresh watch and a fresh verdict
  let unsubLease = null;
  if (keeper && typeof keeper.onLease === 'function') {
    unsubLease = keeper.onLease((ev) => {
      if (!ev || !ev.profileId) return null;
      if (ev.kind === 'browser-stopped' || ev.kind === 'browser-ready') kernelOf.delete(String(ev.profileId)); // lane browser-surfaces: a browser started again may be another engine (Change build…) — asked again
      if (ev.kind === 'browser-stopped') disarm(ev.profileId, 'the browser stopped');
      else if (ev.kind === 'browser-ready') { resetOutcomes(ev.profileId); const w = watches.get(String(ev.profileId)); if (w) { try { w.ws && w.ws.close(1000); } catch { /* */ } down(w, 'the browser started again'); } }
      return null;
    });
  }

  return { arm, disarm, factFor, openOn, stuckForKey, pageStuckMap, waitForOpen, waitSettled /* int347: the alert race */, answer, noteOutcome, resetOutcomes, verbStarted, verbEnded, verbRunning, scopeFor, onChange, setTabsOf, stats, bindTab, orphansOf, // verify r4 #1: the `tab new` ack binds
    ownsTab, pickTab, stopTab, closeTab, captureTab, noteCut, busyFor, // lane site-reset: a looping tab never disables the browser
    pageAnswers, // lane browser-shared-profile-freeze: the verb's own tab asked first, bounded (a silent page answered page_busy by name)
    ownTabs, clearSite, // lane site-reset step 2: one site's stored login, cleared
    passkeyIn, cancelPasskey, // lane browser-passkey: a page waiting for a passkey, named and cancellable
    passkeyVaultRows, passkeyVaultReveal, // lane vault-contents-window: the Vault window's masked rows + its one-value reveal
    answerPasskey, passkeyRegister, passkeyList, passkeyForget, passkeyPolicy, passkeySwitch, dropPasskeys, passkeyCounts, passkeyCards, // lane passkey-ui: + the counts // int258: + the chat cards a rebuild draws // lane passkey-store-core: the store, its cards, its grants
    paintFacts, freezePaint, thawPaint, // lane browser-swiftshader-cpu: a browser nobody watches and nobody drives paints nothing
    promptIn, answerPrompt, // lane browser-ui-prompts: a file chooser / an HTTP sign-in, named and answerable
    setPermission, permissionsOf, // lane browser-ui-prompts-r2: every permission decided ahead; the agent's per-origin flip
    answerSurface, surfacesIn, blockingOn, surfaceById, blockOf, kernelFactOf, // lane browser-surfaces: a kernel's surfaces — the answer door, the list, the relay's drop, the owner's card, the readers' block
    fillLogin, loginForms, // lane browser-login: the `login` verb's door (the vault's values to the kernel, never to anyone else) + the forms a tab reports
    shutdown: () => { shutdown(); try { unsubLease?.(); } catch { /* */ } }, _watches: watches };
}

module.exports = { create, ANSWERED_KEEP, OUTCOMES_KEEP, VERB_RUNNING_MAX_MS, RE_ENABLE_MS };

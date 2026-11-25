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
 * EVERY ROAD IS WATCHED (lane passkey-browse-yourself, 2026-10-30 — the owner in «自己浏览» on a headed attach-road browser, a page
 * at /challenge/pk, «还是没有 passkey 提示»; measured on 43d0f8d2d: nothing opened this socket for a browser HIS press launched,
 * his window's relay named no profile, and `stuckForKey` of his key was null even when watched): a browser the person browses
 * himself is watched like any other — opened at `human-start` (bounded: his press waits for it like a verb's /resolve), again
 * at `browser-ready` while he holds it (a heal), and a socket that CLOSED under him is opened again after REARM_MS; his
 * key (`hu-…`) has a stuck fact like a conversation's (his tabs: the wiring's holderTabs); `passkeyFactOf` = ONE passkey fact per
 * live view (his window reads it from its relay); an unwatched browser's block is `unknown` + UNKNOWN_TEXT, never null.
 * THE PERSON'S WATCH OBSERVES (acceptance r1 of the lane): WHO holds the browser decides the watch's MODE (`w.mode`, from the
 * holder rows). A conversation holds it ⇒ 'agent' — the agent browser's policies (every permission decided ahead, the print
 * preview released, the file chooser + HTTP sign-in hooked, the tab's EMPTY virtual authenticator, a kernel's surfaces). Only the
 * person ⇒ 'person' — the hooks that REPORT (dialogs, the passkey ceremony) and nothing else: Chrome asks him as always (his
 * saved grants, his print preview, its own sign-in sheet, its own passkey window with the phone's QR). A vault passkey is used
 * only when he chose it (a stored key whose card he answered or set to always, a registration he approved): its authenticator
 * is paired for that ceremony only, Chrome's UI on. Re-decided at `human-start` / `human-end` / a conversation's `attach` /
 * `detach` — in place on standard Chrome (the policies put on or taken off over the same socket), a new socket on a kernel. A
 * (re)armed document's pending ceremonies are asked of the hook (`pending`) and recorded with their age, so a page that was
 * already waiting is said too. A socket that keeps failing is re-armed with a backoff, REARM_TRIES at most, and then its fact
 * says the watch stopped; a paired machine's browser says the true cause (it runs there; the hub cannot watch it).
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
const FENCE_LAND_MS = 10000;   // lane lg-store-writes, the moved2 cure 2: a login fill waits this long for its tab's fence record to land, else types nothing
const PS = require('../browser-passkey-store.js'); // lane passkey-store-core: the sealed per-profile table + THE GATE (this file is its one writer)
let SRm = null;   // r3261: lazily, as the lines below (two passkey suites copy this file beside three modules only)
const SR = () => SRm || (SRm = require('../store-read.js'));   // r3261: the passkey store under the store-read law
const crypto = require('crypto');
let WS = null; try { WS = require('ws').WebSocket; } catch { WS = null; }
// lane browser-surfaces: the kernel's surfaces (PURE) and the agent belt are asked only on a kernel that HAS surfaces — required
// at first use, so a copy of this file beside the three dialog modules alone (test-browser-passkey's controls) runs unchanged
let SFm = null, PTm = null;
const SF = () => SFm || (SFm = require('../browser-surfaces.js'));
const PT = () => PTm || (PTm = require('../peer-text.js'));
let BLm = null, LFm = null, VRm = null, BMm = null;
const BL = () => BLm || (BLm = require('../browser-login.js')); // lane browser-login: lazily (two passkey suites copy this file beside three modules only)
const LF = () => LFm || (LFm = require('./browser-login-fill.js')); // lane browser-login r22: hub-side isolated-world element fill + wipe
const VR = () => VRm || (VRm = require('../vault-run.js')); // lane browser-login: value-based scrubber over filled secrets
const BM = () => BMm || (BMm = require('../browser-mediation.js')); // lane vault-login r29: pure mediated-channel judgment
// lane passkey-sink: the PURE passkey signer — asked only on a kernel with `webauthn` (required at first use, like SF / PT)
let WAm = null;
const WA = () => WAm || (WAm = require('../webauthn-sign.js'));
// lane passkey-browse-yourself: the user's own key (`hu-…`) → its profile — required at first use (only a human key asks it)
let HMm = null;
const HM = () => HMm || (HMm = require('../browser-human.js'));
// rows B-98f5 / B-bcf8: the idle-paint flip tab's address and the driver's filter (PURE) — required at first use, like SF / PT
let BIm = null;
const BI = () => BIm || (BIm = require('../browser-idle.js'));
const FLIP_RECHECK_MS = 60 * 1000;   // r4058: an UNREAD flip-tab birth is asked again at the first freeze this long after
const FLIP_LATE_MS = 60 * 1000;      // r4058 (1): a flip create with no reply owes its late tab's close this long
const RETRY_FIRST_MS = 5 * 1000;    // r4186 (3): the sweep's retry of a failed show waits this after its first failure — doubled at each
const RETRY_MAX_MS = 60 * 1000;     // failure, to this at most; reset when the front is shown
const SHOW_TRIES = 3;                // r4176: a frozen front whose flip tab lands in ANOTHER window is tried this many thaws in a row, then left
const PROMPT_FY_KEY = 'prompt-auth:'; // B-ebb7: a sign-in's For-you item is keyed — a past hub life's open ones are swept when a watch starts
const REARM_MS = 2000; // a watch whose socket closed under the person's own browsing is opened again after this — doubled at each failed try (acceptance r1: a refused port looped every 2 s)
const REARM_TRIES = 5; // then the watch stops trying and his fact says so (`gave-up`) until the next arm (his window, his press, a verb)
const REARM_HEALTHY = 10; // a socket that stayed open this many REARM_MS was healthy: its close starts the backoff over
const PK_ORPHAN_MS = 1500; // a webauthn surface whose request never comes (it began before this socket) is cancelled after this — never a page left waiting
const PK_DRAIN_MS = 1000; // r6 → r7 (acceptance r6): the SLOW mark — a wait on the tab's clean-up longer than this is said, once per episode; never a cap (the gate waits while the CDP session answers)
const PK_HOLD_BEAT_MS = 1000; // r7 (acceptance r6 BREAK 6): a sign-in waiting on that clean-up keeps its page's hold — the hook's `wait` at this pace, under its HOOK_HOLD_MS 1.5 s …
const PK_HOLD_MAX_MS = 5000; // … for this long at most (a clean-up that never ends still lets the page's request end on its own)
const NATIVE_ON_KERNEL = new Set(['Page.javascriptDialogOpening', 'Page.javascriptDialogClosed', 'Page.fileChooserOpened', 'Fetch.authRequired']); // one source: never read where surfaces are on
const KERNEL_GONE_CODES = Object.freeze(['no_such_request', 'no_such_surface', 'invalid_values']); // B-d981: a kernel answer refused as these never reached the page
const KERNEL_PROBE_MS = 2000; // VibeSpace.getVersion — standard Chrome refuses it in ms (-32601); a socket that never answers is today's road

const ANSWERED_KEEP = 32;
/** B-b56d's ONE SWITCH (the person's sign-in hook). It was OFF in 2.369.412 (the coordinator, 2026-11-18 23:56Z: its box leg was red
 *  — the box runs the DISPLAY road, where the watch answers a sign-in `Default` by B2's law and Chrome draws its own sheet, and the
 *  keeper said the open «did not go through»). ON again (2.369.413, the coordinator's ruling 2026-11-19 01:42Z) with the open's
 *  verdict said as the sheet (browser-human openSignInVerdict) and its box leg proving BOTH roads by name. */
const PERSON_SIGNIN_HOOK = true;
const AUTH_FETCH_MODES = new Set(['doc-auth', 'all-auth', 'fill-auth']); // B-b56d: the Fetch modes that hook an HTTP sign-in
const ENDED_SHOW_MS = 60 * 60 * 1000; // B-b56d (its read, S2): a sign-in cancelled at its bound is said in the person's window for an hour at most
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
const SOCKET_CLOSED = 'the browser\'s CDP socket closed'; // lane passkey-browse-yourself: the one `down` reason a re-arm answers (a stop / a restart / a shutdown never)

/** B-97ae round 3: ONE NAME FOR A TAB, the server log and the For-you tray alike — the page's title through ST.pageText (no invisible
 *  or bidi characters, no line breaks, frames folded) unless that title IS AN ADDRESS: the tab's own (measured on real Chrome,
 *  test-browser-passkey-chrome S14: an untitled page's TargetInfo.title is its address, query and all), or one that parses as an
 *  address (a page naming itself as another site). Then, and with no title, the tab's ORIGIN — never its path or query (a
 *  sign-in address can carry a code or an e-mail address); else «this tab». PURE. */
function tabName({ title = '', url = '' } = {}) {
  const raw = String(title == null ? '' : title).trim(), href = String(url == null ? '' : url);
  let origin = ''; try { const u = new URL(href); if (u.origin && u.origin !== 'null') origin = u.origin; } catch { /* no address */ }
  const bare = (x) => String(x).replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
  const isAddress = (x) => {
    if (!x) return false;
    if (href && (x === href || bare(x) === bare(href) || (bare(x).length > 3 && bare(href).startsWith(bare(x))))) return true;
    try { if (/^(https?|file|ftp|wss?|chrome|chrome-extension|about|data|blob|javascript):$/i.test(new URL(x).protocol)) return true; } catch { /* not one */ }
    return /^[\w.-]+\.[a-z]{2,}(:\d+)?\/\S*$/i.test(x) || /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?\/\S*$/i.test(x);
  };
  const t = ST.pageText(raw, 80).trim();
  if (t && !isAddress(raw) && !isAddress(t)) return t;
  return origin || 'this tab';
}

function create({ keeper = null, WebSocketImpl = WS, log = console, now = Date.now,
  enableTimeoutMs = ST.ENABLE_TIMEOUT_MS, connectTimeoutMs = 3000, callTimeoutMs = 5000, pageAnswerMs = ST.PAGE_ANSWER_MS, closeGoneMs = 2000 /* lane browser-shared-profile-freeze */, captureTimeoutMs = ST.LOOP_SCREENSHOT_MS, quietMs = ST.LOOP_QUIET_MS, reEnableMs = RE_ENABLE_MS, // verify r1: the quiet rule is a clock a fast gate shortens (lane browser-held-not-hung: the re-ask too)
  tabsOf = null, holdersOf = null, leaseCountOf = null, labelOf = null, notice = null, withdraw = null, forYou = null, rearmMs = REARM_MS /* lane passkey-browse-yourself */,
  promptAskMs = ST.PROMPT_ASK_MS, authHoldMaxMs = ST.AUTH_HOLD_MAX_MS,
  boundScale = 1, // r4176 (c): a fast gate's seam — every call bound of this watch × this, so a leg judges the product's own lines in milliseconds
  passkeys = null, takeoverOf = null, vaultUse = null /* lane passkey-sink: (entry, use, o) → {receipt} — the vault's ONE use writer (a kernel signature is a USE of the passkeys' key) */, passkeyOrphanMs = PK_ORPHAN_MS, drainMs = PK_DRAIN_MS /* r6; r7: the slow mark */, holdBeatMs = PK_HOLD_BEAT_MS, holdMaxMs = PK_HOLD_MAX_MS /* r7 */, leftMax = 3 /* B-97ae round 2: per browser, the leftover items past which ONE counts the rest */, downloadsDirOf = null /* lane browser-surfaces: profileId → the browser's downloads directory (a file answer is handed from there only) */,
  logins = null /* lane browser-login: src/server/browser-logins.js — the web logins' ONE writer, its grants and its use lines */, conversationOf = null /* lane browser-login: sessionId → {cid, name} */,
  liveFillMaxMs = 10 * 60 * 1000 /* ceiling before an un-navigated live-fill fence wipes inputs and lifts */,
  scrubWalkBudgetMs = 250 /* time bound (ms) for walking a parsed CDP JSON frame */, scrubWorkerFile = null /* 主开发 r2445: the frame scrub's worker (a suite's stand-in) */, scrubFigures = null /* its figures (a suite's seam) */,
  wipeMaxScanPositions = 524288 /* per-eval window-position work bound before failing closed with 'too much text to check' */,
  axMaxPayloadBytes = 4 * 1024 * 1024 /* max frame bytes on the dedicated short-lived queryAXTree socket (N2) */,
  axQueryTimeoutMs = 2500 /* hard timeout (ms) for on-demand @ref queryAXTree resolution (N2) */,
  axMaxNodes = 8192 /* max AX nodes accepted from a single queryAXTree call (N2) */,
  interceptTimeoutMs = 1500 /* hard timeout (ms) for Fetch.enable / Network.enable fence confirmation (r27) */ } = {}) { // lane passkey-store-core: `passkeys` = {read, write, cipher} (the wiring: data/browser-passkeys.json 0600 + the key file); none ⇒ today's tab-native passkeys // lane browser-ui-prompts: the sign-in's two clocks (a fast gate shortens them)
  const watches = new Map();       // profileId → watch
  const scrubByProfile = new Map();       // profileId → [{label, value, bytes, at}] (survives watch reconnects and navigations; cleared when the browser stops)
  const scrubNamesByProfile = new Map();  // profileId → [{name, at, id}] (persisted through keeper's ONE writer until the browser stops)
  const scrubCheckByProfile = new Map();  // lane chrome-157: profileId → [{label, value}] — values UNDER the mask floor, for the one check only (never masked)
  const scrubMissingByProfile = new Map(); // lane chrome-157: profileId → Set of names whose entry gave no value at the last re-hydration (gone)
  const scrubCompiledByProfile = new Map(); // profileId → compiled scrubber fn | null
  const activeTabByProfile = new Map();   // profileId → Map(parentKey → {tid, at})
  const stashedSnapshotsByProfile = new Map(); // profileId → Map(targetId → {url, specs, at, seq})
  // B-21cc (主开发 r2760 → r2849): THE TAB EPOCH and THE SNAPSHOT SLOT. A snapshot's note makes NO read (no spawn, no browser call —
  // the release's N2); the FILL, which reads the conversation's current tab anyway, decides whether the kept references are THAT
  // tab's. `tabMoves`: the newest mover of a browser (a page born or gone, the watch blind, the person's tab act) and of a
  // conversation (its own tab verbs, a takeover, a handback) — one global count, so an epoch never repeats. `snapSlots`: each
  // conversation's NEWEST snapshot on a browser (references and counts only), replaced by a newer note, gone with the conversation.
  const tabMoves = { byProfile: new Map(), byConv: new Map() };
  let tabMoveSeq = 0;
  // r2992 (5): ONE CLOCK — a mover's and a navigation's instant are stamped on the KEEPER's clock, the one the route stamps a verb's
  // /resolve instant (`since`) with (routes/browser.js resolvedAt); the dialogs' own `now` only where the keeper has none
  const clockNow = () => { try { const c = keeper && typeof keeper.clock === 'function' ? Number(keeper.clock()) : NaN; return Number.isFinite(c) ? c : now(); } catch { return now(); } };
  const snapSlots = new Map(); // `${profileId}\0${parentKey}` → { seq, at, tid, epoch, navSeqs, specs, unknown }
  let snapSeq = 0;
  // lane chrome-157 (round 32, the owner's sentence): A FENCE AND A GUARD BELONG TO THE DOCUMENT — Chrome's own id of it (the top
  // frame's loaderId: kept across a move inside the document, new with every new document, a reload included), never to its
  // address. Unknown ⇒ the same (the safe side). A watch answers its fences from the RECORD until they are re-armed.
  let docSeq = 0;
  const sameDocument = (a, b) => !a || !b || String(a) === String(b);
  const fencesLive = (w) => Boolean(w && w.state === 'open' && w.fencesRearmed);
  const FAILED_CHECKS_BOUND = 3;   // a check that cannot look this many times in a row on one document ⇒ the hold that names both doors
  const stashedTabFencesByProfile = new Map(); // profileId → {browserId, tabs: Map(targetId → {url, liveFill, postLiftGuards})} (same-process reconnect only)
  const fillEpochsByProfile = new Map();  // profileId → Map(targetId → number)
  const credSigsByProfile = new Map();    // profileId → Array<{len, sha256, rHash, rPow}>
  const scrubValuesVer = new Map();       // profileId → n: THE VALUES' COUNTER (主开发 r3342 (4)) — moved by both writers (recordScrubSecret, recordProfileCredSigs); the frame scrub's worker is handed the values again when it moved
  const credRequestIdsByProfile = new Map(); // profileId → Set<string>
  const knownFenceProfiles = new Set();   // profileIds whose live/persisted login fences this watch instance tracks
  const fenceAuditLines = [];             // bounded journal of fences ended by ceiling / browser-stop / target-gone / url-changed
  let postLiftGuardSeq = 0;
  let unparseableScrubFrames = 0;
  let cutScrubFrames = 0;
  let disposed = false, unsubVaultOpen = null, unsubVaultLock = null, unsubFenceRefSource = null, unsubProfileDrop = null;
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
  // r3261 (主开发; lane bl-machines-b's census of the stores, «37 more», item 1): THE PASSKEY STORE UNDER THE STORE-READ LAW. The release
  // read ANY failure of browser-passkeys.json as an EMPTY store, cached it for the process's life, and the next write (a switch, a
  // removal, a sign-in's count, a registration) wrote the file over: every passkey a person registered in an agent browser lost.
  // Now the store's ONE read at its first ask answers through src/store-read.js and the tree's ONE hold (src/store-read-hold.js):
  // HELD, no passkey is known (an empty view each ask, never cached), nothing is written over the file, every writer is refused BY
  // NAME before any side effect, a registration and a sign-in are refused at the gate BEFORE the ceremony answers the site (the site
  // is never left holding a passkey we did not store; an agent is told the hold, never «no passkey»), and the file is read again off
  // the loop; LIFTED with no restart. Torn bytes are kept aside once (`browser-passkeys.json.corrupt-<mark>`, 0600 from its create:
  // they hold sealed keys), then it starts empty with the DAMAGED mark in the new file (`damaged {copy, at}`, read back at a start,
  // gone when a store without it is read). A stand-in store without the file's road (a suite's own {read, write, cipher}) reads as before.
  const PK_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && (v.profiles === undefined || (!!v.profiles && typeof v.profiles === 'object' && !Array.isArray(v.profiles)));
  const pkHoldable = !!(pks && typeof pks.readText === 'function' && typeof pks.file === 'string' && pks.file);
  const pkDamagedOf = (v) => (v && v.damaged && typeof v.damaged === 'object' && typeof v.damaged.copy === 'string' && v.damaged.copy ? { copy: v.damaged.copy, at: Number(v.damaged.at) || null } : null);
  let pkDamaged = null, pkStarted = false;
  const pkStoreHold = pkHoldable ? require('../store-read-hold.js').create({   // r3261: the tree's ONE hold, required INLINE — only a holdable store loads it (the copying suites' stand-ins never do), a create test-held-lists counts
    file: pks.file, valid: PK_SHAPE, code: 'passkeys_unread', aside: (mark) => pks.file + '.corrupt-' + mark, now,
    words: (h) => `the passkeys could not be read (browser-passkeys.json in VibeSpace's data folder: ${h.code}); VibeSpace reads them again every few minutes. No passkey is lost: nothing is written over them, no passkey is offered to a site or registered, and changes wait until they read`,
    log: (l) => { try { log.warn?.('[browser-dialogs] ' + l); } catch { /* a log is never the store's */ } },
    onLift: (v, f) => {
      pkCache = PS.normalizeStore(v);
      pkDamaged = !v && f && f.setAside ? { copy: String(f.setAside), at: now() } : pkDamagedOf(v);
      if (!v && pkDamaged) pkWrite(pkCache);   // the new empty store carries the damaged mark at once (a restart still says it)
      for (const pid of Object.keys(pkCache.profiles || {})) emit({ kind: 'passkeys', profileId: pid });
      emit({ kind: 'passkeys', profileId: null, lifted: true });
    },
  }) : null;
  const pkHeld = () => !!(pkStoreHold && pkStoreHold.held());
  /** the hold's refusal BY NAME (503 passkeys_unread) — the answer every writer gives while the store is unread */
  const pkHeldRefusal = (what) => ({ ok: false, code: 'passkeys_unread', status: 503, error: `${what}: ${pkStoreHold.words()}` });
  const pkHeldFacts = () => { const h = pkStoreHold && pkStoreHold.held(); return h ? { file: 'browser-passkeys.json', code: h.code, since: h.since, words: pkStoreHold.words() } : null; };
  const pkIds = new Map(), pkAsks = new Map(), pkGrants = new Map();
  const pkGrantAsk = new WeakMap(); // r10 (acceptance r9 MINOR 1): a grant → the card whose «Allow once» made it — told when a later answer takes it back unused (pkGrantWithdrawn)
  const pkSpend = (g) => { if (g) g.used = true; }; // r11 (acceptance r10 MAJOR): a registration grant SPENT is marked `used` on EVERY road — the hook road at its release, the kernel road at its verdict (it makes the key at once, nothing waits) — so a later answer takes nothing back and its card is never told «withdrawn… nothing was registered»
  const pkAnswered = new Map(); // r9 (acceptance r8 MAJOR): the owner's LATEST answer to a register card per grant key — the grant itself for «once», a dated mark for «no»; a grant taken by a waiting ceremony comes back only while it is still that answer (back() in pkGateOn)
  // lane passkey-binding-isolated: + the hook's ISOLATED WORLD name + the SECRET CustomEvent channel (128-bit: the page can neither
  // enter the world nor forge a report). Acceptance r2 of lane passkey-browse-yourself: the three names are DERIVED from the
  // browser's devtools id (`…/devtools/browser/<uuid>` — 122 random bits Chrome mints per launch; no page can read it) — a hub that
  // restarts derives the same names, finds the hook of a document that was open across the restart and asks it `pending` (the
  // same road as a socket re-arm); a relaunched browser has a new id ⇒ new names. A URL without that id ⇒ random names, as before.
  const DEVTOOLS_ID = /\/devtools\/browser\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  // lane chrome-157 (vault-login round 32, ruling Q8): the same-browser identity is the KEEPER's (browserIdentityOf, beside its
  // browserOf) — one place; a watch hands its url for a browser the keeper has no record of. Same = equal and not null.
  const browserIdentityOf = (w) => {
    if (!w || !w.profileId || !keeper || typeof keeper.browserIdentityOf !== 'function') return null;
    try { return keeper.browserIdentityOf(w.profileId, { url: w.url }); } catch { return null; }
  };
  const sameBrowserInstance = (a, b) => typeof a === 'string' && a !== '' && a === b;
  const pkIdsFor = (pid, url = '') => {
    const m = DEVTOOLS_ID.exec(String(url || '')), id = m ? m[1].toLowerCase() : '', k = pid + '|' + id;
    const hash = (what, hex) => crypto.createHash('sha256').update(`vs-passkey-hook|${what}|${pid}|${id}`).digest('hex').slice(0, hex);
    if (!pkIds.has(k)) pkIds.set(k, id ? { slot: 'vs' + hash('slot', 32), world: 'vspw' + hash('world', 20), chan: 'vspc' + hash('chan', 32) } : { slot: 'vs' + crypto.randomBytes(16).toString('hex'), world: 'vspw' + crypto.randomBytes(10).toString('hex'), chan: 'vspc' + crypto.randomBytes(16).toString('hex') });
    return pkIds.get(k);
  };
  const pkDisplacedAt = new Map(); // lane passkey-prewrap-fix: profileId → the episodes a page replaced the credentials API (the Passkeys card's line)
  const sayOnce = new Set();
  const kernelOf = new Map();      // lane browser-surfaces: profileId → false (standard Chrome: never asked again) | {protocol, kinds, features}
  const say = (key, line) => { if (sayOnce.has(key)) return; sayOnce.add(key); try { log.warn?.(`[browser-dialog] ${line}`); } catch { /* */ } };
  // lane passkey-browse-yourself (rule 1): does the person browse this profile himself (the wiring's holder row `human: true`)?
  const humanHolds = (pid) => { if (typeof holdersOf !== 'function') return false; try { return (holdersOf(String(pid)) || []).some((h) => h && h.human); } catch { return false; } };
  // acceptance r1 (MAJOR 1): WHO holds it decides the watch's mode — a conversation ⇒ 'agent' (the agent browser's policies);
  // only the person ⇒ 'person' (observation only: his own Chrome asks him, as on a browser no agent touched)
  // B-346d: a live view is watching this browser now (the keeper's viewer count) — its watch re-arms by itself after a socket that
  // failed (a daemon restart, a relaunched Chrome on a new port): the view never says «not watching» of a browser that runs
  const viewed = (pid) => { try { return !!(keeper && typeof keeper.viewersFor === 'function' && keeper.viewersFor(String(pid)) > 0); } catch { return false; } };
  const agentHolds = (pid) => { if (typeof holdersOf !== 'function') return false; try { return (holdersOf(String(pid)) || []).some((h) => h && !h.human); } catch { return false; } };
  const modeOf = (pid) => (humanHolds(pid) && !agentHolds(pid) ? 'person' : 'agent');
  // B-b56d (the owner's ruling B, 2026-11-18): profileId → how many of the PERSON'S OWN live windows show that browser (the live view
  // says it as they open and close). The person's watch hooks HTTP sign-ins only while one is open — law 6: a browser nobody watches
  // or drives changes nothing beyond what the watch already does
  const personViews = new Map();
  const rearms = new Map(); // profileId → {t: the one pending re-arm, n: the tries so far} of a socket that closed under his browsing
  const gaveUp = new Map(); // profileId → when the re-arms stopped (REARM_TRIES failed) — his fact says so until the next arm
  // acceptance r2 (MINOR): profileId → WHO opened its watch — 'agent' (a conversation's verb), 'viewer' (a live view's own arm),
  // 'person' (his press); the first opener stands, an agent's verb makes it the agent's. Kept across sockets; his Close ends only
  // a watch HE opened — an agent's stays until the browser stops (the idle-paint freeze, the open-dialog notices)
  const openers = new Map();
  // acceptance r2: profileId → the machine handle's own answer when it gave no endpoint ({code, error} — keeper.cdpEndpointFor);
  // the unwatched fact says THAT cause (never a branch on the record's hostId — CS separation)
  const refusals = new Map();
  function rearmLater(pid) {
    const r = rearms.get(pid) || { t: null, n: 0 };
    if (r.t) return;
    rearms.set(pid, r);
    if (r.n >= REARM_TRIES) { gaveUp.set(pid, now()); try { log.warn?.(`[browser-dialog] ${pid}: the watch's socket failed ${r.n} re-arms in a row — stopped trying (the next arm of this browser starts again)`); } catch { /* */ } emit({ kind: 'passkey', profileId: pid, state: 'unwatched', why: 'gave-up' }); return; }
    // B-346d (the rest of law 1): a re-arm whose ENDPOINT is refused (a daemon between runs answers no CDP url yet) while the browser
    // still RUNS keeps the backoff — before, the tries ended there and the view said «cannot watch» of a browser that came back
    const t = setTimeout(() => { r.t = null; if (!(humanHolds(pid) || viewed(pid))) return; r.inFlight = true; arm(pid, { budgetMs: 0, rearm: true }).then(() => { r.inFlight = false; if (rearms.get(pid) === r && !watches.get(pid) && browserRuns(pid) && (humanHolds(pid) || viewed(pid))) rearmLater(pid); }, () => { r.inFlight = false; /* the watch says why in its own journal line */ }); }, rearmMs * 2 ** r.n);
    r.n++;
    if (t.unref) t.unref();
    r.t = t;
  }

  // B-346d: a re-arm is COMING for this browser (one pending, or one asking its endpoint now) and its tries have not run out
  const rearmPending = (pid) => { const r = rearms.get(String(pid)); return !!(r && (r.t || r.inFlight)) && !gaveUp.has(String(pid)); };
  // B-346d: the keeper's record says the browser RUNS (browser-profiles' LIVE_BROWSER_STATES: this file is copied beside few modules)
  const browserRuns = (pid) => { try { const b = keeper && typeof keeper.browserOf === 'function' ? keeper.browserOf(String(pid)) : null; return !!b && (b.state === 'starting' || b.state === 'ready'); } catch { return false; } };
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
    if (profileId) knownFenceProfiles.add(String(profileId));
    const w = { profileId, url, holds: true, ws: null, state: 'connecting', mode: modeOf(profileId) /* acceptance r1: 'agent' | 'person' (WHO holds it) */, openedAt: 0, fencesRearmed: false, id: 0, waiting: new Map(), sessions: new Map(), targets: new Map(), open: new Map(), pendingBy: new Map(), answered: [], seq: 0, readyP: null, commands: [],
      pkSlot: pkIdsFor(profileId, url).slot, pkWorld: pkIdsFor(profileId, url).world, pkChan: pkIdsFor(profileId, url).chan, pkForYou: new Map(), pkLeft: { tabs: new Map(), more: new Set(), moreId: null } /* B-97ae round 2 */, pkSeq: 0 /* lane passkey-sink: the kernel ceremonies' numbers */, headed: null, bornAt: now(), // lane browser-passkey; lane passkey-binding-isolated: the isolated world + the secret channel, kept across sockets
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
      const t = setTimeout(() => { if (w.waiting.delete(id)) resolve({ timeout: true }); }, timeoutMs * boundScale);
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
      w.state = 'open'; w.openedAt = now(); w.fencesRearmed = false;
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
      try {
        await rearmLoginFences(w);
      } finally {
        if (w.state === 'open') w.fencesRearmed = true;
      }
      w.readySeen = true; // lane site-reset: tabs tracked from here on appeared while watched
      // lane mirror-green-222: ready = the tabs enabled here carry the passkey hook — `arm` resolved between Page.enable and
      // the hook's last CDP answer, so a verb's first fact read the tab as `unknown` (the mirror's red, run 37419676410)
      await Promise.allSettled([...w.targets.values()].map((e) => e.pk.arming));
      w.ready();
      emit({ kind: 'watched', profileId: w.profileId }); // lane passkey-browse-yourself: a live view's passkey fact is read again (unknown → none)
    });
    ws.on('message', (d) => { try { onMessage(w, d); } catch (err) { say('msg:' + (err && err.message), `${w.profileId}: a CDP event was not handled — ${err && err.message}`); } }); // key-file-law-fix: a throw never leaves the listener (uncaughtException = the hub's exit)
    ws.on('error', (e) => { say('err:' + w.profileId + ':' + (e && e.code), `${w.profileId}: the watch's socket failed — ${e && e.message}`); });
    ws.on('close', () => { down(w, SOCKET_CLOSED); regrantPlace(w.profileId); });   // r2311 (i): its leaving reset the context's overrides (the hold's grants too)
  }
  function down(w, why, { keepNotices = false } = {}) {
    if (w.state === 'down') return;
    w.state = 'down';
    moveTab('watch-down', { profileId: w.profileId }); // B-21cc (r2849): the hub is blind to every mover until it watches again
    w.fencesRearmed = false;
    for (const id of w.pkForYou.values()) { try { forYou?.resolve?.(id); } catch { /* the tray's own failure */ } } w.pkForYou.clear(); // lane browser-passkey
    for (const e of w.targets.values()) pkLeftEnd(w, e, 'down'); // B-97ae round 2: the socket (the browser, the hub) went — its sessions took their authenticators (S12)
    for (const rec of [...w.prompts.values()]) dropPrompt(w, rec, 'down'); // lane browser-ui-prompts: a gone socket's paused sign-in is Chrome's again
    w.ready();
    for (const fn of w.waiting.values()) { try { fn({ error: { message: why } }); } catch { /* */ } }
    w.waiting.clear();
    const open = [...w.open.values()];
    for (const rec of w.surf.values()) { surfaceAskDone(w, rec); if (!open.includes(rec)) open.push(rec); } w.surf.clear(); // lane browser-surfaces: a NOTED one is in the live view's bar too
    w.open.clear();
    if (watches.get(w.profileId) === w) watches.delete(w.profileId);
    const canStashReconnect = !disposed
      && why !== 'the browser stopped'
      && why !== 'the browser started again'
      && why !== 'the server is restarting'
      && (!keeper || typeof keeper.profile !== 'function' || Boolean(keeper.profile(w.profileId)));
    const stashedLiveTids = new Set();
    if (canStashReconnect) {
      let stashMap = null;
      const browserId = browserIdentityOf(w);
      const prevFenceStash = browserId ? stashedTabFencesByProfile.get(w.profileId) : null;
      const tabFenceMap = prevFenceStash && sameBrowserInstance(prevFenceStash.browserId, browserId) && prevFenceStash.tabs instanceof Map
        ? new Map(prevFenceStash.tabs)
        : new Map();
      for (const e of w.targets.values()) {
        const curU = stripHash(tabLoginUrlOf(e));
        const hasLf = Boolean(e.liveFill);
        const guards = Array.isArray(e.postLiftGuards)
          ? e.postLiftGuards
            .filter((g) => g && g.lfSnap && g.prebuiltTargets && Array.isArray(g.prebuiltTargets.targets) && g.prebuiltTargets.targets.length > 0)
            .map((g) => ({
              id: g.id || (++postLiftGuardSeq),
              lfSnap: {
                ...g.lfSnap,
                credSigs: Array.isArray(g.lfSnap.credSigs) ? [...g.lfSnap.credSigs] : [],
                also: Array.isArray(g.lfSnap.also) ? g.lfSnap.also.map((a) => ({ ...a })) : [],
              },
              prebuiltTargets: g.prebuiltTargets,
            }))
          : [];
        if (browserId && curU && (hasLf || guards.length > 0)) {
          tabFenceMap.delete(e.targetId);
          tabFenceMap.set(e.targetId, {
            url: curU,
            docId: e.docId || '',
            liveFill: hasLf ? {
              ...e.liveFill,
              credSigs: Array.isArray(e.liveFill.credSigs) ? [...e.liveFill.credSigs] : [],
              stepOtpValues: Array.isArray(e.liveFill.stepOtpValues) ? [...e.liveFill.stepOtpValues] : [],
              also: Array.isArray(e.liveFill.also) ? e.liveFill.also.map((a) => ({ ...a })) : [],
              heldGuardIds: Array.isArray(e.liveFill.heldGuardIds) ? [...e.liveFill.heldGuardIds] : [],
              wiping: false,
            } : null,
            postLiftGuards: guards.slice(-4),
          });
          if (hasLf) stashedLiveTids.add(String(e.targetId));
          while (tabFenceMap.size > 32) {
            const oldestTid = tabFenceMap.keys().next().value;
            tabFenceMap.delete(oldestTid);
            stashedLiveTids.delete(String(oldestTid));
          }
        } else {
          tabFenceMap.delete(e.targetId);
        }
        if (!e.snapshotRefs || !e.snapshotRefs.specs || (e.snapshotRefs.navSeq ?? 0) !== (e.navSeq || 0)) continue;
        if (!curU) continue;
        if (!stashMap) stashMap = stashedSnapshotsByProfile.get(w.profileId) || new Map();
        stashMap.set(e.targetId, { url: curU, specs: e.snapshotRefs.specs, at: e.snapshotRefs.at || now(), seq: e.snapshotRefs.seq ?? null });
      }
      if (stashMap && stashMap.size) stashedSnapshotsByProfile.set(w.profileId, stashMap);
      if (browserId && tabFenceMap.size > 0) {
        stashedTabFencesByProfile.delete(w.profileId);
        stashedTabFencesByProfile.set(w.profileId, { browserId, tabs: tabFenceMap });
        while (stashedTabFencesByProfile.size > 64) {
          const oldestPid = stashedTabFencesByProfile.keys().next().value;
          stashedTabFencesByProfile.delete(oldestPid);
          try { LF().clearFilledSecretsForProfile(oldestPid); } catch { /* */ }
        }
      } else {
        stashedTabFencesByProfile.delete(w.profileId);
      }
    } else {
      stashedSnapshotsByProfile.delete(w.profileId);
      stashedTabFencesByProfile.delete(w.profileId);
    }
    for (const e of w.targets.values()) { if (e.reEnable) { clearTimeout(e.reEnable); e.reEnable = null; } if (e.quiet) { clearTimeout(e.quiet); e.quiet = null; } if (e.liveFillTimer) { clearTimeout(e.liveFillTimer); e.liveFillTimer = null; } if (e.postLiftTimer) { clearTimeout(e.postLiftTimer); e.postLiftTimer = null; } }
    try {
      if (canStashReconnect && stashedLiveTids.size > 0) {
        LF().clearFilledSecretsForProfileExcept(w.profileId, stashedLiveTids);
      } else {
        LF().clearFilledSecretsForProfile(w.profileId);
      }
    } catch { /* */ }
    emit({ kind: 'down', profileId: w.profileId, why, closed: open.map((d) => d.id) });
    if (!keepNotices) withdrawNotices(open.map((d) => d.id)); // a VibeSpace shutdown keeps them: the dialog is still open in Chrome
    if (why === SOCKET_CLOSED && w.openedAt && now() - w.openedAt >= REARM_HEALTHY * rearmMs) { const r = rearms.get(w.profileId); if (r && !r.t) rearms.delete(w.profileId); } // a healthy socket's close starts the backoff over
    if (why === SOCKET_CLOSED && (humanHolds(w.profileId) || viewed(w.profileId))) rearmLater(w.profileId); // lane passkey-browse-yourself (rule 1): re-opened on reconnect — acceptance r1: with a backoff, REARM_TRIES at most; B-346d: while a live view watches too (each re-arm reads the endpoint FRESH from the live daemon — arm's down road)
  }
  /** One page tab: attach (flat session) + Page.enable — the enable bounded; a tab that never answers is HELD. */
  function track(w, info) {
    if (ST.printTargetVerdict(info)) return releasePrint(w, info); // lane browser-ui-prompts-r2: the print preview is never a tab — it is released
    if (!info || info.type !== 'page' || !info.targetId) return Promise.resolve();
    // lane browser-swiftshader-cpu: thawPaint's own flip tab (opened and closed in ~20 ms) is nobody's — never tracked. Rows B-98f5 /
    // B-bcf8: while a flip runs, each page's BIRTH address is kept — the guard reads the address Chrome itself reported (showFront)
    // r4058 (1): a create whose reply came after its bound left its tab open — born at the flip address while no flip runs and a late
    // flip is owed, it is the hub's own: closed by its id when its event arrives (the address read last: the idle module is required
    // only while a late flip is owed — a suite's copy of this file in a folder of its own has none, test-browser-passkey's mutant)
    if (!w.flipping && w.flipLate && w.flipLate.n > 0 && now() < w.flipLate.until && !info.openerId && !(w.flipMade && w.flipMade.has(String(info.targetId))) && String(info.url || '') === BI().FLIP_TAB_URL) { w.flipLate.n -= 1; closeLateFlip(w, String(info.targetId)); return Promise.resolve(); }
    if (w.flipping) { if (!w.flipBirths) w.flipBirths = new Map(); const tb = String(info.targetId); if (!w.flipBirths.has(tb) && w.flipBirths.size < 64) w.flipBirths.set(tb, String(info.url == null ? '' : info.url)); }
    if (w.flipping && !info.openerId && (/^(about:blank)?$/.test(String(info.url || '')) || String(info.url || '') === BI().FLIP_TAB_URL)) return Promise.resolve();
    if (!w.kernel && w.mode !== 'person') decideAhead(w, info.browserContextId || null); // acceptance r1: never on the person's watch (Chrome asks him, his saved grants stand) // lane browser-surfaces: a kernel's permission asks are surfaces (P deny unless allowed ahead) // lane browser-ui-prompts-r2: no permission prompt ever pends (browser-wide per context: never awaited by the tab's enable)
    const tid = String(info.targetId);
    const known = w.targets.get(tid);
    if (known) { known.url = String(info.url || known.url || ''); if (info.url) known.loginNavUrl = String(info.url); known.title = String(info.title || known.title || ''); known.navTextsStale = false; return known.enabling || Promise.resolve(); }
    let restoredRefs = null, expiredByNav = false;
    const stashMap = stashedSnapshotsByProfile.get(w.profileId);
    if (stashMap && stashMap.has(tid)) {
      const stashed = stashMap.get(tid);
      stashMap.delete(tid);
      if (!stashMap.size) stashedSnapshotsByProfile.delete(w.profileId);
      if (stashed && stashed.url && stripHash(String(info.url || '')) === stashed.url) {
        restoredRefs = { specs: stashed.specs, resolved: new Map(), map: null, at: stashed.at, navSeq: 0, seq: stashed.seq ?? null };
      } else {
        expiredByNav = true;
      }
    }
    const e = { targetId: tid, bctx: info.browserContextId ? String(info.browserContextId) : '', url: String(info.url || ''), loginNavUrl: String(info.url || ''), navSeq: 0, snapshotRefs: restoredRefs, snapshotExpiredByNav: expiredByNav, inflightCredReqs: null, activeFill: null, activeFills: null, fetchMode: 'off', fetchSyncP: null, credPreArming: false, credFetchAll: false, credNetEnabled: false, title: String(info.title || ''), sid: null, enabled: false, heldAt: 0, enabling: null, reEnable: null, hops: [], loop: null, req: null, hopStart: null, quiet: null,
      seenAt: w.state === 'open' && w.readySeen ? now() : 0, agentHopAt: 0, owner: null, opener: info.openerId ? String(info.openerId) : null, pk: { armed: false, againQ: [], records: [], binding: '', key: '', ctxs: new Set(), ctl: new Map(), seen: new Set(), frameOf: new Map(), mainCtxOf: new Map(), holds: new Map() /* r7: ceremony → what IT loaded {auth, ids, uv} */ } }; // lane site-reset: a tab that appeared while watched (the agent's `tab new`), the last browser-initiated hop on it
    // verify r2: the ONE conversation whose verb was in flight when it appeared (null = nobody / unclear) — verify r3 #1: only for
    // a tab born of NO page (the CLI's `tab new`, the page it gets on attach: measured, no `openerId`); a tab a PAGE opened
    // (`window.open`, a `target=_blank` link — `openerId` set even under `noopener`, measured) is its OPENER's, whoever's verb
    // runs: before, a stranger's popup born during A's verb was A's — A's verb was cut with the stranger's addresses and A's
    // `stop` stopped the stranger's page (the kill + credential shape: that popup carried the stranger's session)
    // B-e674 follow (r694 (2)): while the person drives THEIR OWN browsing window they are a possible parent of a tab no page opened —
    // with an agent's verb in flight too, such a birth is UNCLEAR: nobody's (never the verb's by the witness, never the person's)
    const personOwn = !!(e.seenAt && !e.opener && keeper && typeof keeper.personBrowsing === 'function' && (() => { try { return keeper.personBrowsing(w.profileId) === true; } catch { return false; } })());
    const inFlight = e.seenAt && !e.opener ? verbsInFlight(w) : 0;
    if (e.seenAt) e.owner = e.opener ? openerOwner(w, e.opener) : personOwn ? null : createdOwner(w);
    // verify r3 #2: the witness is WRITTEN on the lease record (the keeper's registry is on disk) — a VibeSpace restart read it
    // back through `tabsOf`; before, in memory per watch, the restart made the conversation's own tab nobody's again
    // B-e674 unit 2: THE BIRTH STAMP — the keeper is told of every page tab born while this watch is open (with its opener and
    // the agent's verb this witness saw in flight): who drove the browser at that instant is the keeper's fact to stamp
    if (e.seenAt && keeper && typeof keeper.noteTabBorn === 'function') {
      const fail = (err) => say('tab-born:' + (err && err.message), `${w.profileId}: a new tab's birth was not stamped — ${err && err.message}`);
      try { Promise.resolve(keeper.noteTabBorn(w.profileId, tid, { opener: e.opener, witness: !e.opener ? e.owner : null, unclear: !e.opener && !e.owner && (personOwn ? inFlight >= 1 : inFlight > 1) })).catch(fail); } catch (err) { fail(err); }
    }
    if (e.owner && keeper && typeof keeper.noteOwnTab === 'function') { try { keeper.noteOwnTab(w.profileId, e.owner, tid); } catch (err) { say('note-tab:' + (err && err.message), `${w.profileId}: a witnessed tab was not recorded on its lease — ${err && err.message}`); } }
    w.targets.set(tid, e);
    if (e.seenAt) moveTab('page-born', { profileId: w.profileId }); // B-21cc (r2849): a page born while watched can become the driver's tab (a popup it follows)
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
      if (!w.kernel && w.mode !== 'person') armPrompts(w, e); // acceptance r1: never on the person's watch (his own file chooser, Chrome's own sign-in sheet) // lane browser-ui-prompts (lane browser-surfaces: a kernel's chooser / sign-in are surfaces — never hooked twice)
      else syncTabFetchMode(w, e); // N1: if a live credential signature stands on this tab, keep '*' Request interception active
      if (was) emit({ kind: 'held-cleared', profileId: w.profileId, targetId: e.targetId });
      if (!e.docId) {   // (lane chrome-157, round 32: the document's id — after the hooks arm, never between Page.enable and them)
        try { const ft = await call(w, 'Page.getFrameTree', {}, e.sid, 1500); const lid = ft && ft.result && ft.result.frameTree && ft.result.frameTree.frame ? ft.result.frameTree.frame.loaderId : ''; if (lid && !e.docId) e.docId = String(lid); seedChildFrames(e, ft && ft.result ? ft.result.frameTree : null); } catch { /* unknown ⇒ the same document */ } }
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
    if (w.kernel && NATIVE_ON_KERNEL.has(m.method)) { if (w.mode !== 'person') { w.nativeIgnored++; say('native:' + w.profileId + ':' + m.method, `${w.profileId}: the kernel sent ${m.method} on a session with surfaces on — ignored (one source: its surface is the prompt)`); return; } } // lane browser-surfaces: the belt (acceptance r1: not on the person's watch — no surfaces there, the native event is the only source)
    switch (m.method) {
      case 'VibeSpace.surfaceOpened': return onSurfaceOpened(w, surfaceTab(w, m), p); // lane browser-surfaces (Q2: routed by the page session, else params.targetId)
      case 'VibeSpace.surfaceUpdated': return onSurfaceUpdated(w, surfaceTab(w, m), p);
      case 'VibeSpace.surfaceClosed': return onSurfaceClosed(w, surfaceTab(w, m), p);
      case 'VibeSpace.webauthnRequest': return pkRequest(w, surfaceTab(w, m), p); // lane passkey-sink: a kernel with `webauthn` — the ceremony's data (its surface is the held card)
      case 'VibeSpace.credentialFormDetected': return; // r22 pivot: kernel form pushes retired (agent locates, hub fills)
      case 'VibeSpace.credentialSubmitted': return onOwnerTakeoverSubmit(w, surfaceTab(w, m), p); // human takeover save-login card only
      case 'Target.targetCreated': case 'Target.targetInfoChanged': if (p.targetInfo && p.targetInfo.type === 'iframe') { noteFrameTarget(w, p.targetInfo); return; } track(w, p.targetInfo); return; // B-5f2e: a frame of another site is kept, never tracked as a tab
      case 'Target.targetDestroyed': {
        const tid = String(p.targetId || '');
        if (w.frameTargets) w.frameTargets.delete(tid); // B-5f2e: a gone frame is no longer said
        const e = w.targets.get(tid);
        if (!e) return;
        moveTab('page-gone', { profileId: w.profileId }); // B-21cc (r2849): the driver's tab closed moves it to another
        w.targets.delete(tid); if (e.sid) w.sessions.delete(e.sid); if (e.reEnable) clearTimeout(e.reEnable);
        if (e.quiet) clearTimeout(e.quiet);
        const closedCtxId = e.liveFill ? (e.liveFill.isoContextId || 0) : 0;
        clearPostLiftOnTab(e);
        if (e.liveFill) clearLiveFillOnTab(w, e, 'tab-closed', { audit: false });
        try { LF().clearFilledSecretsForTarget(tid, closedCtxId); } catch { /* */ }
        if (e.liveFillTimer) { clearTimeout(e.liveFillTimer); e.liveFillTimer = null; }
        dropActiveTarget(w.profileId, tid);
        e.snapshotRefs = null;
        if (e.activeFill) { e.activeFill.contextGone = true; e.activeFill.heldRequests = []; e.activeFill.abort?.(); }
        if (e.inflightCredReqs) e.inflightCredReqs.clear();
        if (PK.endPending(e.pk.records, { now: now() }).length) passkeyChanged(w, e); // lane browser-passkey: a closed tab waits for nothing
        pkLeftEnd(w, e, 'closed'); // B-97ae walk (b): the closed tab took the key it kept
        if (w.prompts.has(tid)) dropPrompt(w, w.prompts.get(tid), 'tab-closed'); // lane browser-ui-prompts
        if (e.owner && keeper && typeof keeper.forgetOwnTab === 'function') { try { keeper.forgetOwnTab(w.profileId, e.owner, tid); } catch { /* the keeper's own failure */ } } // verify r3 #2: the persisted witness goes with the tab
        if (e.loop) { e.loop = null; emit({ kind: 'loop-cleared', profileId: w.profileId, targetId: tid, why: 'tab-closed' }); } // lane site-reset: a closed tab's loop is over
        if (e.heldAt) emit({ kind: 'held-cleared', profileId: w.profileId, targetId: tid, why: 'tab-closed' }); // lane browser-held-not-hung: a closed tab holds nothing (the fact moves)
        for (const rec of [...w.surf.values()]) if (rec.targetId === tid) onSurfaceClosed(w, tid, { surfaceId: rec.id, how: 'tab-closed', by: 'tab-closed' }); // lane browser-surfaces
        const dlg = w.open.get(tid);
        if (dlg) { w.open.delete(tid); emit({ kind: 'closed', profileId: w.profileId, targetId: tid, answered: { id: dlg.id, dialog: dlg, how: 'dismissed', by: 'tab-closed', at: now(), targetId: tid } }); withdrawNotices([dlg.id]); }
        return;
      }
      case 'Target.detachedFromTarget': { const sid = String(p.sessionId || ''); const tid = w.sessions.get(sid); w.sessions.delete(sid); const e = tid && w.targets.get(tid); if (e && e.sid === sid) { e.sid = null; e.enabled = false; pkLeftEnd(w, e, 'detached'); if (e.activeFill) { e.activeFill.contextGone = true; e.activeFill.heldRequests = []; e.activeFill.abort?.(); } } return; } // B-97ae round 2: the session took its authenticator (S12)
      // verify r1 A7: a main-frame navigation IN FLIGHT (started, not committed) — a timeout then is the network's
      // verify r2 #5: `navFirst` = the first start of a RUN of navigations none of which committed (a page that starts a new
      // one every 20 s is ONE run — a per-start clock never reached the grace: never hung, never told), `navCount` its size
      case 'Page.frameStartedNavigating': { const e = tabOf(w, m); if (e && String(p.frameId || '') === e.targetId && !/samedocument/i.test(String(p.navigationType || ''))) { const t = now(); if (!e.navSince) { e.navFirst = t; e.navCount = 0; } e.navSince = t; e.navCount = (e.navCount || 0) + 1; e.navUrl = String(p.url || ''); startHop(e, t); if (e.activeFill) { const navOrigin = BL().originOf(e.navUrl); if (!navOrigin || (e.activeFill.wantOrigin && navOrigin !== e.activeFill.wantOrigin)) e.activeFill.crossNav = navOrigin || 'an unverified page'; else e.activeFill.contextGone = true; e.activeFill.abort?.(); } } return; }
      // lane site-reset: the renderer's OWN request (script / meta refresh / reload / a click's link or form) — measured on
      // 0.38.1: it precedes frameStartedNavigating by ≤ 2 ms; a browser-initiated navigation (the agent's open) has none
      case 'Page.frameRequestedNavigation': { const e = tabOf(w, m); if (e && String(p.frameId || '') === e.targetId) { e.req = { reason: String(p.reason || 'other').slice(0, 40), at: now() }; if (e.activeFill && p.url) { const reqOrigin = BL().originOf(String(p.url)); if (!reqOrigin || (e.activeFill.wantOrigin && reqOrigin !== e.activeFill.wantOrigin)) { e.activeFill.crossNav = reqOrigin || 'an unverified page'; e.activeFill.abort?.(); } } } return; }
      case 'Page.frameNavigated': { const e = tabOf(w, m); if (e && p.frame && String(p.frame.id || '') === e.targetId && !p.frame.parentId) dropTabFrames(w, e); /* B-5f2e: a new document ⇒ the old one's frames are not said */ if (e && p.frame && String(p.frame.id || '') === e.targetId && !p.frame.parentId && w.prompts.get(e.targetId)?.type === 'file') dropPrompt(w, w.prompts.get(e.targetId), 'navigated');
        if (e && p.frame && String(p.frame.id || '') === e.targetId && !p.frame.parentId && w.prompts.get(e.targetId)?.native && !NATIVE_SHEET_PAGE_RE.test(String(p.frame.url || ''))) settleNative(w, w.prompts.get(e.targetId)); { const hr = e && p.frame && String(p.frame.id || '') === e.targetId && !p.frame.parentId ? w.prompts.get(e.targetId) : null; if (hr && hr.type === 'http-auth' && !hr.native && w.authReq.has(hr.id)) dropHeldAuth(w, e, hr); } /* B-b56d (its read, S1): the person's tab committed another page — its held sign-in was abandoned (Chrome dropped that request): dropped, its hook read again, never said as «cancelled»; B-1327: a conversation's tab too (it was held to its bound, its For-you item open, then noted «expired») */ /* lane browser-x-in-window: Chrome's own sheet answered (or cancelled) — the tab committed a real page (MEASURED: the sheet itself stands over a `chrome-error://chromewebdata/` commit) */ if (e && p.frame && String(p.frame.id || '') === e.targetId && !p.frame.parentId) { const navUrl = String(p.frame.url || '') + String(p.frame.urlFragment || ''); /* lane chrome-157 (the real-browser claim, scene 16): Chrome sends the fragment APART (frame.urlFragment) — the address the page shows, and the one check reads, is both */ if (navUrl) e.loginNavUrl = navUrl; e.navTextsStale = true; /* lane chrome-157 (the cure of 2026-11-15, 主开发's GO 18:22Z): the tab's url and title stay the browser's own target info for every reader (a busy verdict, site-reset, a takeover card name the tab as the browser names it); the old document's url and title are only marked STALE for the fence's one check, which reads the navigation's own address until the next target info clears the mark (tabCheckTexts) */ e.navSeq = (e.navSeq || 0) + 1; e.navAt = clockNow(); /* B-21cc r2992 (3): its instant, on the /resolve's clock */ e.docId = String(p.frame.loaderId || '') || ('nav:' + (++docSeq)); if (e.activeFill) { const navOrigin = BL().originOf(navUrl); if (!navOrigin || (e.activeFill.wantOrigin && navOrigin !== e.activeFill.wantOrigin)) e.activeFill.crossNav = navOrigin || 'an unverified page'; else e.activeFill.contextGone = true; e.activeFill.abort?.(); } if (e.snapshotRefs) e.snapshotExpiredByNav = true; e.snapshotRefs = null; if (e.inflightCredReqs) e.inflightCredReqs.clear(); clearPostLiftOnTab(e, w); endNav(e); hop(w, e, { url: navUrl }); if (e.liveFill) clearLiveFillOnTab(w, e, 'navigated'); } return; }
      // B-5f2e (line 2): the tab's OWN child frames as its page attaches them — a frame later moved to a process of its own keeps its
      // id (its `iframe` target's id), so the tab knows it even where Chrome gives the target no parentFrameId; 'swap' = moved, kept
      case 'Page.frameAttached': { const e = tabOf(w, m); if (e && p.frameId) { if (!e.childFrames) e.childFrames = new Set(); if (e.childFrames.size < 256) e.childFrames.add(String(p.frameId).slice(0, 64)); } return; }
      case 'Page.frameDetached': { const e = tabOf(w, m); if (e && e.childFrames && p.reason !== 'swap') e.childFrames.delete(String(p.frameId || '')); return; }
      case 'Page.navigatedWithinDocument': case 'Page.frameStoppedLoading': {
        const e = tabOf(w, m);
        if (e && m.method === 'Page.navigatedWithinDocument' && String(p.frameId || '') === e.targetId) {
          const navUrl = String(p.url || '');
          if (navUrl) e.loginNavUrl = navUrl;
          hop(w, e, { url: navUrl, same: true });
          if (e.liveFill) {
            if (!e.liveFill.postLiftHeld && !e.liveFill.unknownTyped && e.liveFill.holdReason !== BL().HOLD_UNKNOWN_TYPED && stripHash(navUrl) !== stripHash(e.liveFill.urlAtFill)) {
              wipeAfterSameOriginSubmit(w, e, 'same-doc-nav');
            } else {
              syncPersistedLoginFences(w.profileId);
            }
          } else if (Array.isArray(e.postLiftGuards) && e.postLiftGuards.length) {
            syncPersistedLoginFences(w.profileId);
          }
        }
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
      case 'Fetch.requestPaused': { onCredFetchPaused(w, m, p); return; }
      case 'Network.loadingFinished': case 'Network.loadingFailed': { const e = tabOf(w, m); if (e && e.inflightCredReqs && e.inflightCredReqs.delete(String(p.requestId || ''))) wipeAfterSameOriginSubmit(w, e, 'submitted'); return; }
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
      case 'Runtime.executionContextDestroyed': { const e = tabOf(w, m); if (e) { const id = Number(p.executionContextId); if (e.activeFill && e.activeFill.isoContextId && id === Number(e.activeFill.isoContextId)) { e.activeFill.contextGone = true; e.activeFill.abort?.(); } e.pk.ctxs.delete(id); e.pk.ctl.delete(id); const fid = e.pk.frameOf.get(id); e.pk.frameOf.delete(id); if (fid != null && e.pk.mainCtxOf.get(fid) === id) e.pk.mainCtxOf.delete(fid); } if (e) pkPageGone(w, e, PK.endPending(e.pk.records, { now: now(), ctx: Number(p.executionContextId) })); return; }
      // B-97ae round 2 MUST 3(i): A CRASHED PAGE IS A PAGE THAT WENT — (a)'s road. MEASURED on real Chrome (test-browser-passkey-
      // chrome S13): a renderer crash during a lend says Target.targetCrashed (the browser's discovery — this watch's) and
      // Inspector.targetCrashed (a session with Inspector on), and NO context event until a reload; the lent authenticator — its
      // key and UV — SURVIVES the crash AND the reload (the reloaded page signed with it in 2 ms). So the crash itself ends the
      // tab's pending ceremonies through THE ONE END; its documents are dead — the context maps cleared, and the records it ends
      // are marked page-gone (pkPageGone), so the drain sends no call that would look for a dead context and wait out callTimeoutMs.
      case 'Target.targetCrashed': case 'Inspector.targetCrashed': { const e = m.method === 'Target.targetCrashed' ? w.targets.get(String(p.targetId || '')) : tabOf(w, m); if (e) { if (e.activeFill) { e.activeFill.contextGone = true; e.activeFill.heldRequests = []; e.activeFill.abort?.(); } e.pk.ctxs.clear(); e.pk.ctl.clear(); e.pk.frameOf.clear(); e.pk.mainCtxOf.clear(); pkPageGone(w, e, PK.endPending(e.pk.records, { now: now() })); } return; }
      case 'Runtime.executionContextsCleared': { const e = tabOf(w, m); if (e) { if (e.activeFill) { e.activeFill.contextGone = true; e.activeFill.abort?.(); } e.pk.ctxs.clear(); e.pk.ctl.clear(); e.pk.frameOf.clear(); e.pk.mainCtxOf.clear(); } if (e) pkPageGone(w, e, PK.endPending(e.pk.records, { now: now() })); return; }
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
  /** B-e674 unit 2's cure (r683 (c)): how many conversations' verbs are in flight on this browser now (a birth with no opener while
   *  two are is UNCLEAR — never read as nobody's, never as the person's) — the same reading as createdOwner's. */
  function verbsInFlight(w) {
    const t = now(); const parents = new Set();
    for (const [bk, r] of running) { const o = r && r.on ? r.on[w.profileId] : null; if (!o || !(o.n > 0) || t - (o.at || 0) > WITNESS_MS) continue; parents.add(parentKey(bk)); }
    return parents.size;
  }
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
    if (t.ephemeral) { noteActiveTab(t, tid); return { ok: true, own: true }; } // its own browser: every tab is its already
    const mine = parentKey(t.browserKey);
    if (!mine) return { ok: false, code: 'bad-request' };
    if (namedByAnother(w, tid, mine)) return { ok: false, code: 'not_your_tab' };
    const was = e.owner || null;
    if (was && parentKey(was) === mine) { noteActiveTab(t, tid); return { ok: true, was }; }
    e.owner = String(t.browserKey);
    if (keeper) {
      if (was && typeof keeper.forgetOwnTab === 'function') { try { keeper.forgetOwnTab(w.profileId, was, tid); } catch { /* the keeper's own failure */ } }
      if (typeof keeper.noteOwnTab === 'function') { try { keeper.noteOwnTab(w.profileId, e.owner, tid); } catch (err) { say('bind-tab:' + (err && err.message), `${w.profileId}: a tab the ack named was not recorded on its lease — ${err && err.message}`); } }
    }
    noteActiveTab(t, tid);
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
    { const lfOpen = e ? effectiveLiveFillOf(e) : null; if (lfOpen) d.fencedAt = { urlAtFill: String(lfOpen.urlAtFill || tabLoginUrlOf(e) || '') }; }   // lane chrome-157 (round 32): its words are the fenced document's
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
  async function arm(profileId, { budgetMs = 800, rearm = false, by = 'agent' } = {}) {
    const pid = String(profileId || '');
    if (!rearm) { gaveUp.delete(pid); const r = rearms.get(pid); if (r && !r.t) rearms.delete(pid); } // acceptance r1: any arm but a re-arm's own starts the tries over
    const rm = remode(pid); // acceptance r1: an arm (a verb, the person's press, the person's window) re-reads WHO holds it
    if (rm && !rearm && budgetMs > 0) {
      let tr = null;
      await Promise.race([rm, new Promise((r) => { tr = setTimeout(r, budgetMs); if (tr.unref) tr.unref(); })]);
      if (tr) clearTimeout(tr);
    }
    if (!pid || !keeper || typeof keeper.cdpEndpointFor !== 'function') return { ok: false, code: 'not_watched', error: 'no keeper' };
    let w = watches.get(pid);
    if (!w || w.state === 'down') {
      let ep = null;
      try { ep = await keeper.cdpEndpointFor(pid, { fresh: !!w }); } catch (e) { ep = { ok: false, error: e && e.message }; }
      if (!ep || !ep.ok || !ep.url) { refusals.set(pid, { code: (ep && ep.code) || null, error: String((ep && ep.error) || 'no CDP endpoint') }); return { ok: false, code: 'not_watched', error: (ep && ep.error) || 'no CDP endpoint' }; }
      refusals.delete(pid);
      w = watches.get(pid);
      if (!w || w.state === 'down') { w = newWatch(pid, ep.url); watches.set(pid, w); connect(w); }
    }
    if (!rearm && (by === 'agent' || !openers.has(pid))) openers.set(pid, by === 'person' || by === 'viewer' ? by : 'agent');
    // does this browser HOLD dialogs? (a browser launched before the lane: its daemons still accept alert + beforeunload
    // themselves — those are left to them and said after, never reported open for the few ms they are)
    try { w.holds = typeof keeper.holdsDialogsFor === 'function' ? keeper.holdsDialogsFor(pid) !== false : true; } catch { w.holds = true; }
    let t = null;
    await Promise.race([w.readyP, new Promise((r) => { t = setTimeout(r, budgetMs); if (t.unref) t.unref(); })]);
    if (t) clearTimeout(t);
    return { ok: w.state === 'open', code: w.state === 'open' ? null : 'not_watched', watched: w.state === 'open' };
  }
  function disarm(profileId, why = 'the browser stopped') {
    const pid = String(profileId || '');
    const w = watches.get(pid);
    if (why === 'the browser stopped' && pid) {
      clearProfileLoginFencesOnStop(pid, w);
    }
    dropOutcomes(String(profileId || ''));
    openers.delete(String(profileId || ''));
    refusals.delete(String(profileId || '')); gaveUp.delete(String(profileId || '')); // acceptance r3: a refusal is the stopped browser's — never said of the next one (r5: nor the given-up socket's)
    { const r = rearms.get(String(profileId || '')); if (r && r.t) clearTimeout(r.t); rearms.delete(String(profileId || '')); } // B-346d (its adversarial read): a stopped browser's pending re-arm and its tries are not the next browser's
    if (!w) return;
    try { w.ws && w.ws.close(1000); } catch { /* closing */ }
    down(w, why);
  }
  /** acceptance r1 (MAJOR 1): THE WATCH'S MODE re-read from the holder rows — 'person' (only he holds it: observation only) /
   *  'agent' (a conversation holds it: the agent browser's policies). Standard Chrome flips in place over the same socket; a
   *  kernel's surfaces are per socket, so it gets a new one. → a promise (a conversation's `attach` waits for its policies). */
  function remode(profileId) {
    const pid = String(profileId || '');
    const w = watches.get(pid);
    if (!w || w.state === 'down') return null;
    const want = modeOf(pid);
    if (w.mode === want) return null;
    w.mode = want;
    if (w.state !== 'open') return null; // still connecting: its tabs are tracked in the mode it has now
    try { log.log?.(`[browser-dialog] ${pid}: the watch is now ${want === 'person' ? "the person's own (observation only — Chrome asks him)" : "the agent's (its permission plan, prompt hooks and passkey authenticator)"}`); } catch { /* */ }
    emit({ kind: 'mode', profileId: pid, mode: want });
    if (w.kernel) { try { w.ws && w.ws.close(1000); } catch { /* closing */ } down(w, 'the watch changed hands', { keepNotices: true }); return arm(pid, { budgetMs: knownFenceProfiles.has(pid) ? 800 : 0, rearm: true }); }
    return (want === 'person' ? toPerson(w) : toAgent(w)).catch((e) => say('mode:' + pid + ':' + (e && e.message), `${pid}: the watch's mode did not move cleanly — ${e && e.message}`));
  }
  /** agent → person: every policy off over the same socket — a paused sign-in handed back to Chrome's own sheet, the file chooser +
   *  sign-in hooks off, each tab's authenticator removed, the permission overrides reset (his saved grants stand again). */
  async function toPerson(w) {
    const tabs = [...w.targets.values()].filter((e) => e.sid);
    for (const rec of [...w.prompts.values()]) {
      if (PERSON_SIGNIN_HOOK && rec.type === 'http-auth' && w.authReq.has(rec.id) && !w.kernel && (personViews.get(w.profileId) || 0) > 0) continue; // B-b56d: a window of the person shows it — the person answers it there
      const ar = w.authReq.get(rec.id); if (ar) { w.authReq.delete(rec.id); await call(w, 'Fetch.continueWithAuth', { requestId: ar.requestId, authChallengeResponse: { response: 'Default' } }, ar.sid || null); } dropPrompt(w, rec, 'person');
    }
    await Promise.all(tabs.map(async (e) => {
      if (e.enabled) { await syncTabFetchMode(w, e); await call(w, 'Page.setInterceptFileChooserDialog', { enabled: false }, e.sid); }
      if (e.pk.auth) { const id = e.pk.auth; e.pk.auth = null; e.pk.once = false; const x = await call(w, 'WebAuthn.removeVirtualAuthenticator', { authenticatorId: id }, e.sid), d = await call(w, 'WebAuthn.disable', {}, e.sid); const xa = pkAnswer(w, e, x), da = pkAnswer(w, e, d); if ((xa === 'refused' || xa === 'silent') && (da === 'refused' || da === 'silent')) { const uvHeld = [...e.pk.holds.values()].some((h) => h.auth === id && h.uv); const seen = await pkLook(w, e, id, [], uvHeld, { anyKey: true }); if (seen) pkLeftSet(w, e, id, seen, [pkWhy('WebAuthn.removeVirtualAuthenticator', x, xa), pkWhy('WebAuthn.disable', d, da)]); } } // round 3: the same look as the others (its UV too) // B-97ae round 2 MUST 3(ii): the handover's removal judged and said as (b)'s
    }));
    if (!placeHeld(w.profileId) && [...w.grants.values()].some((g) => g.kind === 'geolocation' && g.setting === 'granted')) await Promise.all(tabs.map((e) => call(w, 'Emulation.clearGeolocationOverride', {}, e.sid)));   // B-9584 U2c (r1264 must 1): the hand-over never clears a place the person set
    const ctxs = [...w.permCtx.keys()]; w.permCtx.clear();
    for (const k of ctxs) await call(w, 'Browser.resetPermissions', k ? { browserContextId: k } : {});
    if (ctxs.length) regrantPlace(w.profileId);   // r2311 (i): the reset took the place hold's grants too — it grants again
  }
  /** person → agent: the agent browser's policies on, as a fresh agent watch puts them (each context's plan first). */
  async function toAgent(w) {
    await Promise.all([...new Set([...w.targets.values()].map((e) => e.bctx || ''))].map((k) => decideAhead(w, k || null))); // the plan stands before the conversation's verb runs (`attach` waits for this)
    for (const e of [...w.targets.values()]) {
      if (!e.sid || !e.enabled) continue;
      armPrompts(w, e);
      await syncTabFetchMode(w, e);
      if (pks && e.pk.armed && !e.pk.auth) e.pk.auth = await pairAuthenticator(w, e, e.sid);
      else if (e.pk.once) e.pk.once = false; // a vault ceremony in flight keeps its authenticator — the agent's from now on
    }
  }

  // ── lane browser-swiftshader-cpu: IDLE PAINT (src/browser-idle.js) — the keeper's tick freezes, a verb / a viewer thaws ──
  const settle = (p) => Promise.resolve(p).then((m) => m, () => null);
  /** What the idle-paint verdict reads of one browser's watch (null = no open watch: nothing to drive). */
  function paintFacts(profileId) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open') return null;
    const loading = [...w.targets.values()].some((e) => e.navSince > 0);
    // (a verb of any holder still RUNNING on this browser is busy: the idle stop never freezes a page under a verb — an agent's
    // feedback 2026-11-18: a fresh profile's first open of a large web app froze 30 s after its verb STARTED and waited out the
    // verb's own timeout, ~2 min, with nothing said; the next verb's thaw recovered it at once)
    return { frozen: w.paint === 'frozen', lastVerbAt: w.lastVerbAt || w.bornAt || 0, busy: w.open.size > 0 || loading || !!w.thawing || verbRunningOn(profileId), frozenAt: w.frozenAt || 0, fronts: (w.fronts || []).length, hidden: w.hiddenFronts ? w.hiddenFronts.size : 0, flipTaken: w.flipTaken || null, frontUnread: w.frontUnread ? w.frontUnread.passes : 0, thawUnread: w.thawUnread ? w.thawUnread.tabs : 0, owedShows: w.showOwed ? [...w.showOwed].filter((tid) => w.hiddenFronts && w.hiddenFronts.has(tid)).length : 0, title: [...w.targets.values()].map((e) => e.title).find(Boolean) || null };
  }
  /** Every tab of the browser FROZEN (measured: the only act that stops an Xvfb window drawing — IDLE_PAINT_PROOF). The tabs
   *  in front are remembered: a frozen page is hidden, and only its tab strip shows it again (thawPaint). */
  async function freezePaint(profileId) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open' || w.paint === 'frozen' || w.thawing || w.open.size) return { ok: false };
    // rows B-98f5 / B-bcf8: a browser whose flip tab a driver would take is never frozen — nothing could show its pages again safely.
    // r4058: an UNREAD verdict (one slow moment) is asked again at a later sweep, never kept for the watch's life; one freeze at a time
    if (w.flipTaken === 'unread' && now() - (w.flipTakenAt || 0) >= FLIP_RECHECK_MS) { w.flipTaken = null; w.flipChecked = false; }
    if (w.flipTaken) return { ok: false, why: 'flip_tab_taken' };
    if (w.freezing) return { ok: false };
    w.freezing = true;
    try { return await freezeNow(w); } finally { w.freezing = false; }
  }
  async function freezeNow(w) {
    if (!w.flipChecked) { const tc = now(); if (!(await flipCheck(w))) return { ok: false, why: 'flip_tab_taken' }; if (w.state !== 'open' || w.paint === 'frozen' || w.thawing || w.open.size || (w.lastVerbAt || 0) >= tc) return { ok: false }; }
    const tabs = [...w.targets.values()].filter((e) => e.sid);
    const fronts = []; const t0 = now(); let unread = 0;
    // r4095 (2): the visibility reads at once, each its own 1 s bound (as the window reads below): a tab that never replies costs the
    // pass about a second, never a second per tab (the keeper's tick awaits its sweep)
    const vr = await Promise.all(tabs.map((e) => settle(call(w, 'Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }, e.sid, 1000))));
    tabs.forEach((e, i) => { const v = vr[i]; const vis = v && v.result && v.result.result ? v.result.result.value : undefined; if (vis === 'visible') fronts.push(e.targetId); else if (typeof vis !== 'string') unread += 1; });
    // r4088 (B-98f5): a tab whose visibility read did not answer is UNKNOWN, never «not in front» — frozen unremembered it would stay
    // hidden (no thaw shows a front it was not told of: the live view blank). The freeze remembers every front or freezes nothing:
    // this pass acts on nothing, by its reason, and the next sweep asks again (the family's law: a pass that lacks a fact acts on nothing)
    if (unread) frontUnread(w, unread);   // r4095 (2): said once a stretch — the browser's id and a count, never an address or a title
    if (unread) return { ok: false, why: 'front_unread', unread };
    // B-1626 cure 3 (its readers): each front's window, read ONCE here — a viewer's thaw then knows at once whether a front sits in
    // its holder's own window (no round of window reads for a front that is another holder's)
    // (cure 4: the reads at once — each its own 1 s cap, so the freeze waits at most ~1 s for them, never a second per front)
    const wins = new Map(); (await Promise.all(fronts.map((tid) => windowOfTarget(w, tid)))).forEach((win, i) => wins.set(fronts[i], win));
    if (w.thawing || (w.lastVerbAt || 0) >= t0) return { ok: false }; // a verb arrived while the fronts were read
    // r2: a front another conversation has not shown again since the last freeze stays owed to it (it is hidden now, not visible)
    const owed = [...(w.hiddenFronts || [])].filter((tid) => w.targets.has(tid));
    w.frontWin = new Map([...[...(w.frontWin || new Map())].filter(([tid]) => owed.includes(tid)), ...wins]);
    w.paint = 'frozen'; w.fronts = fronts; w.hiddenFronts = new Set([...owed, ...fronts]); w.frozenAt = now(); w.frontUnread = null;
    // r4176 (the round's should): the freeze's lifecycle calls at once too, each its own bound; the show marks of tabs gone are dropped
    await Promise.all(tabs.map((e) => settle(call(w, 'Page.setWebLifecycleState', { state: 'frozen' }, e.sid, 1000))));
    for (const m of [w.showOwed, w.otherWin]) if (m) for (const tid of [...m.keys()]) if (!w.targets.has(tid)) m.delete(tid);
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
    // B-1626 / K23 (its cure 2, 主开发 13:03Z): a hidden front in the holder's OWN window (`holder.windowId`, the keeper's answer
    // — one window per holder) is its own whatever a scope names yet: the bridge names a viewer's tab only after its relay has
    // read a tabs record, and the witness and the grant can miss a tab. Its window is read off Chrome at the thaw; a front in
    // another holder's window stays owed (heavy test-browser-hidden-paint e)
    const ownWin = holder && holder.windowId != null ? holder.windowId : null;
    if (!w.frontWin) w.frontWin = new Map();
    const fw = w.frontWin;
    // B-1626 cure 4 (its verdict's must): a window Chrome did not report at the freeze (null) is UNKNOWN, never «not yours» — it is
    // read again at this thaw (below); a missed read never blanks every later visit
    const byWindow = ownWin == null ? [] : [...(w.hiddenFronts || [])].filter((tid) => !need.includes(tid) && (fw.get(tid) == null || fw.get(tid) === ownWin));
    if (w.paint !== 'frozen' && !need.length && !byWindow.length) return Promise.resolve({ ok: true, thawed: false });
    w.thawing = (async () => {
      try {
        // r4095 (3): the activations at once, each its own 1 s bound; one with no reply is UNKNOWN — the watch says «active» only when
        // every tab answered (a tab left frozen under an «active» watch had nothing to thaw it: a verb's thaw found nothing to do). Until
        // then it stays «frozen», said once: this thaw still shows the fronts, and the next thaw (a verb, a viewer, the sweep) asks again
        let unthawed = 0;
        // r4176 (a): while a tab has not answered, the next thaw asks ONLY the tabs that did not (a verb no longer waits out every tab's bound)
        if (w.paint === 'frozen') { const ts = [...w.targets.values()].filter((e) => e.sid && (!w.unthawed || w.unthawed.has(e.targetId))); const ar = await Promise.all(ts.map((e) => settle(call(w, 'Page.setWebLifecycleState', { state: 'active' }, e.sid, 1000)))); const left = ts.filter((e, i) => !cdpReplied(ar[i])).map((e) => e.targetId); unthawed = left.length; if (unthawed) { w.unthawed = new Set(left); thawUnread(w, unthawed); } else { w.unthawed = null; w.paint = 'active'; w.thawedAt = now(); w.thawUnread = null; } }
        // B-1626 cure 3 (its readers): the stamp is never trusted alone — a mediated lease keeps a previous run's windowId, and a
        // window id is a small number per Chrome run (it can name ANOTHER holder's window now). The window is the holder's only
        // while a tab the keeper names the holder's (its scope: its root, its witnessed tabs) sits in it at this thaw
        // (the restack's small, 主开发 14:28Z: EVERY tab the keeper names the holder's is read, at once — each read its own 1 s cap,
        // so the whole probe is a second however many tabs; a cap could judge a holder whose first tabs sit in another window
        // (pop-ups, its root closed) «not in its window» though a later one is, and leave its front owed: blank)
        if (byWindow.length) {
          const probe = (scope instanceof Set ? [...scope] : []).filter((t) => w.targets.has(t));
          const mine = probe.length > 0 && (await Promise.all(probe.map((t) => windowOfTarget(w, t)))).includes(ownWin);
          if (mine) {
            const unknown = byWindow.filter((tid) => w.targets.has(tid) && fw.get(tid) == null);
            (await Promise.all(unknown.map((tid) => windowOfTarget(w, tid)))).forEach((win, i) => { if (win != null) fw.set(unknown[i], win); });
            for (const tid of byWindow) if (w.targets.has(tid) && fw.get(tid) === ownWin) need.push(tid);
          }
        }
        return { ok: true, thawed: true, ...(await showNeed(w, need)), ...(unthawed ? { unthawed } : {}) };
      } finally { w.fronts = []; w.thawing = null; }
    })();
    return w.thawing;
  }
  /** Show each front of `need` again. r4095 (3): a front is forgotten once it IS shown, or its tab is gone — a show that failed (no flip
   *  tab, the front's last activation unanswered, its window or the flip tab's unread, the flip tab in another window) keeps it owed
   *  and the next thaw shows it, with NO cap (主开发 r4176: it ends when it is shown or its tab is gone) — but for the ONE reason the hub
   *  measures itself at that show: the flip tab landed in ANOTHER window than the front's, both known (a front in a popup window, as
   *  the measure shows it). SHOW_TRIES of that in a row for one front and it is left as it is, said once a watch. A front whose earlier
   *  show failed is read first (r4176, the round's should; r4186 (2), on every road that shows it — a verb's thaw and the sweep's retry):
   *  «visible» ⇒ that show did happen; ANOTHER tab of its window reads «visible» ⇒ it is no longer its window's front (the agent or the
   *  person brought that tab forward since) — either way forgotten, never shown over it; an unanswered read ⇒ kept owed, nothing shown. */
  async function showNeed(w, need) {
    const shown = [], failed = [], already = [], moved = [], unread = [];
    for (const tid of need) {
      if (w.targets.has(tid) && w.showOwed && w.showOwed.has(tid)) {
        const o = await owedFrontState(w, tid);
        if (o === 'shown') { already.push(tid); forgetFront(w, tid); continue; }
        if (o === 'moved') { moved.push(tid); forgetFront(w, tid); continue; }
        if (o === 'unknown') { unread.push(tid); continue; }
      }
      const s = w.targets.has(tid) ? await showFront(w, tid) : null;
      if (s && s.failed) { failed.push(s); if (showFailed(w, tid, s.failed)) continue; } else if (s) shown.push(s);
      forgetFront(w, tid);
    }
    return { shown, ...(failed.length ? { failed } : {}), ...(already.length ? { already } : {}), ...(moved.length ? { moved } : {}), ...(unread.length ? { unread } : {}) };
  }
  /** r4186 (2): an owed front's state before it is shown again — its own visibility, every tab's window and every other tab's
   *  visibility, read at once (each its own bound): 'shown' (it reads visible), 'moved' (another tab of its window reads visible),
   *  'unknown' (a read that decides it did not answer), 'hidden' (still its window's front, hidden: show it). */
  async function owedFrontState(w, tid) {
    const others = [...w.targets.values()].filter((e) => e.sid && e.targetId !== tid);
    const [own, wins, vis] = await Promise.all([visibilityOf(w, tid), Promise.all([tid, ...others.map((e) => e.targetId)].map((t) => windowOfTarget(w, t))), Promise.all(others.map((e) => visibilityOf(w, e.targetId)))]);
    if (own === 'visible') return 'shown';
    const winA = wins[0] != null ? wins[0] : w.frontWin && w.frontWin.get(tid) != null ? w.frontWin.get(tid) : null;
    const near = others.map((e, i) => ({ win: wins[i + 1], vis: vis[i] })).filter((x) => winA == null || x.win == null || x.win === winA);
    if (winA != null && near.some((x) => x.win === winA && x.vis === 'visible')) return 'moved';
    if (winA == null || typeof own !== 'string' || near.some((x) => x.win == null || typeof x.vis !== 'string')) return 'unknown';
    return 'hidden';
  }
  function forgetFront(w, tid) { if (w.hiddenFronts) w.hiddenFronts.delete(tid); if (w.frontWin) w.frontWin.delete(tid); if (w.showOwed) w.showOwed.delete(tid); if (w.otherWin) w.otherWin.delete(tid); if (w.retryAt) w.retryAt.delete(tid); }
  /** A tab's document.visibilityState, its own bound; undefined = unread. */
  async function visibilityOf(w, tid) { const e = w.targets.get(tid); if (!e || !e.sid) return undefined; const v = await settle(call(w, 'Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }, e.sid, 1000)); return v && v.result && v.result.result ? v.result.result.value : undefined; }
  /** r4176 (b): a person watching a front whose show failed does not wait for the agent's next verb — while a viewer is there the
   *  keeper's sweep asks this. It tries again EVERY failed show of this browser, whichever holder's (each in its own window, its front
   *  activated first), and nothing that never failed (a front still owed to another holder waits for that holder's verb or viewer).
   *  r4186: (1) never while the browser is busy — a verb running, a dialog open, a page loading: the same busy that keeps the freeze
   *  from acting; the show then waits for the next idle tick or the verb's own thaw. (2) a front no longer its window's front is
   *  forgotten (showNeed). (3) a front whose retry fails is tried again after a wait that doubles, RETRY_FIRST_MS up to RETRY_MAX_MS,
   *  reset when it is shown — a sick Chrome gets no flip tab born in the person's window at every tick. */
  function retryOwedShows(profileId) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open' || w.paint === 'frozen' || w.thawing || !w.showOwed || !w.showOwed.size) return Promise.resolve({ ok: true, shown: [] });
    if (w.open.size > 0 || [...w.targets.values()].some((e) => e.navSince > 0) || verbRunningOn(profileId)) return Promise.resolve({ ok: true, shown: [], busy: true });
    for (const tid of [...w.showOwed]) if (!(w.hiddenFronts && w.hiddenFronts.has(tid))) forgetFront(w, tid);
    if (!w.retryAt) w.retryAt = new Map();
    const t = now(), need = [...w.showOwed].filter((tid) => !w.retryAt.has(tid) || w.retryAt.get(tid).next <= t);
    if (!need.length) return Promise.resolve({ ok: true, shown: [], waiting: w.showOwed.size });
    w.thawing = (async () => {
      try {
        const r = await showNeed(w, need);
        for (const s of r.failed || []) if (w.showOwed && w.showOwed.has(s.targetId)) { const g = w.retryAt.has(s.targetId) ? Math.min(RETRY_MAX_MS, w.retryAt.get(s.targetId).gap * 2) : RETRY_FIRST_MS; w.retryAt.set(s.targetId, { gap: g, next: now() + g }); }
        return { ok: true, retried: need.length, ...r };
      } finally { w.thawing = null; }
    })();
    return w.thawing;
  }
  /** The CDP window a tab sits in (Browser.getWindowForTarget), null when Chrome does not say. */
  async function windowOfTarget(w, id) { const r = await settle(call(w, 'Browser.getWindowForTarget', { targetId: id }, null, 1000)); return r && r.result && r.result.windowId != null ? r.result.windowId : null; }
  /** One frozen front shown again IN ITS OWN WINDOW: activated first (its window becomes the last activated one — where a
   *  plain create lands), a blank opened, its window read off Chrome (getWindowForTarget), closed, the front activated. A
   *  blank that landed elsewhere (another holder's activation raced it) is closed at once and journaled — never kept. */
  /** Rows B-98f5 / B-bcf8 — the address Chrome reported at the BIRTH of a tab the hub made: the watch's own targetCreated, kept while
   *  a flip runs; read off Chrome (Target.getTargetInfo) when the event has not come within 50 ms. null = unread. */
  async function flipBirthUrl(w, id) {
    const k = String(id), t0 = Date.now();   // a real 50 ms (the watch's own clock may be a leg's, standing still)
    while (!(w.flipBirths && w.flipBirths.has(k)) && Date.now() - t0 < 50) await new Promise((r) => setTimeout(r, 5));
    if (w.flipBirths && w.flipBirths.has(k)) return w.flipBirths.get(k);
    const r = await settle(call(w, 'Target.getTargetInfo', { targetId: k }, null, 1000));
    return r && r.result && r.result.targetInfo && typeof r.result.targetInfo.url === 'string' ? r.result.targetInfo.url : null;
  }
  /** Was this flip tab born where the driver leaves it? false ⇒ flipTaken (said once). */
  async function flipBirthLeft(w, id) { const u = await flipBirthUrl(w, id); if (BI().driverLeavesUrl(u)) return true; flipTaken(w, u); return false; }
  /** A flip tab born at an address a browser driver would take (another browser family, a policy, a later build): this browser is
   *  never frozen again — it keeps drawing, as before the freeze existed — said ONCE in the journal by its code, never silently. */
  function flipTaken(w, url) {
    if (w.flipTaken) return;
    w.flipTaken = url == null ? 'unread' : url === '' ? 'empty' : 'taken'; w.flipTakenAt = now();
    if (!w.flipSaid) w.flipSaid = new Set();
    if (w.flipSaid.has(w.flipTaken)) return;
    w.flipSaid.add(w.flipTaken);
    const said = w.flipTaken === 'unread' ? 'an address Chrome did not report' : w.flipTaken === 'empty' ? 'an empty address' : 'an address a browser driver takes';
    try { log.warn?.(`[browser-dialogs] ${w.profileId}: [idle_paint_flip_tab_taken] the idle-paint flip tab was born at ${said} — this browser is not frozen again (it keeps drawing)`); } catch { /* */ }
  }
  /** r4095 (2): a browser not frozen because a tab did not answer its visibility read, sweep after sweep, is SAID once a stretch (until
   *  it freezes): its id and the count of tabs, never an address or a title; the passes are counted in paintFacts (frontUnread). */
  function frontUnread(w, n) {
    if (!w.frontUnread) { w.frontUnread = { since: now(), passes: 0, tabs: n }; try { log.warn?.(`[browser-dialogs] ${w.profileId}: [idle_paint_front_unread] ${n} tab(s) did not answer the visibility read — not frozen (it keeps drawing); asked again at each sweep, said once until it freezes`); } catch { /* */ } }
    w.frontUnread.passes += 1; w.frontUnread.tabs = n;
  }
  /** r4095 (3): a thaw where a tab's activation did not answer leaves the browser «frozen» (asked again at the next thaw) — said once
   *  a stretch (until a thaw where every tab answered): its id and the count of tabs. */
  function thawUnread(w, n) {
    if (!w.thawUnread) { try { log.warn?.(`[browser-dialogs] ${w.profileId}: [idle_paint_thaw_unread] ${n} tab(s) did not answer the thaw — still marked frozen; the next verb, viewer or sweep asks again, said once until every tab answers`); } catch { /* */ } }
    w.thawUnread = { tabs: n };
  }
  /** r4095 (3) / r4176: a front whose show failed stays owed (true), whatever the reason — but SHOW_TRIES shows in a row whose flip tab
   *  landed in ANOTHER window (measured at the show, both windows known) leave it as it is (false), said once a watch by its code. */
  function showFailed(w, tid, why) {
    if (!w.showOwed) w.showOwed = new Set();
    if (!w.otherWin) w.otherWin = new Map();
    if (why !== 'another window') { w.showOwed.add(tid); w.otherWin.delete(tid); return true; }
    const n = (w.otherWin.get(tid) || 0) + 1;
    if (n < SHOW_TRIES) { w.showOwed.add(tid); w.otherWin.set(tid, n); return true; }
    if (!w.showGaveUp) { w.showGaveUp = true; try { log.warn?.(`[browser-dialogs] ${w.profileId}: [idle_paint_show_failed] a frozen front's flip tab landed in another window ${SHOW_TRIES} thaws in a row — left as it is; said once`); } catch { /* */ } }
    return false;
  }
  /** A CDP call Chrome answered (a result, or its own error reply) — not a timeout, not a watch that is down. */
  function cdpReplied(m) { return !!m && !m.timeout && (m.result !== undefined || !!(m.error && typeof m.error.code === 'number')); }
  /** r4058 (1): a flip create with no reply within its bound may still make its tab: a late flip is owed for a minute; a birth at the
   *  flip address this flip has seen and not claimed is closed at once, a later one when its event comes (track). */
  function noteLateFlip(w) {
    const was = w.flipLate && now() < w.flipLate.until ? w.flipLate.n : 0;
    w.flipLate = { n: Math.min(8, was + 1), until: now() + FLIP_LATE_MS };
    // r4186 (its small): never while ANOTHER flip runs (a freeze's check and a verb's show at once) — that flip's own birth may be in the
    // births before its reply names it; the scan then waits for the count to reach zero (flipEnd), when every flip's own id is known
    if (w.flipping <= 1) closeLateBirths(w);
  }
  /** Every birth still at the flip address that no flip of this watch made, while a late flip is owed: the hub's own late tab —
   *  closed by its id (r4058 (1)). */
  function closeLateBirths(w) {
    if (!w.flipLate || !(w.flipLate.n > 0) || now() >= w.flipLate.until || !w.flipBirths) return;
    for (const [tid, u] of [...w.flipBirths]) if (w.flipLate.n > 0 && !(w.flipMade && w.flipMade.has(tid)) && u === BI().FLIP_TAB_URL) { w.flipLate.n -= 1; w.flipBirths.delete(tid); closeLateFlip(w, tid); }
  }
  /** A flip ends. r4176 (its must): a late birth can arrive WHILE a flip runs (Chrome answers in order: a create's birth before the
   *  reply to the next call) — kept in the births, never closed by track. So when the count reaches zero and a late flip is owed,
   *  every birth still at the flip address is closed by its id BEFORE the births are cleared. */
  function flipEnd(w) {
    w.flipping -= 1;
    if (w.flipping) return;
    closeLateBirths(w);   // r4176: before the clear
    if (w.flipBirths) w.flipBirths.clear();
  }
  /** The ids this watch's own flips made (the last 16): never taken for a late tab. */
  function madeFlip(w, id) {
    if (!id) return;
    if (!w.flipMade) w.flipMade = new Set();
    w.flipMade.add(String(id));
    if (w.flipMade.size > 16) w.flipMade.delete(w.flipMade.values().next().value);
  }
  /** The flip's own birth: read and claimed; a create with no reply within its bound owes a late flip (r4058 (1)). */
  async function flipBorn(w, b, bid) { if (bid) { madeFlip(w, bid); await flipBirthLeft(w, bid); if (w.flipBirths) w.flipBirths.delete(String(bid)); } else if (b && b.timeout) noteLateFlip(w); }
  function closeLateFlip(w, tid) { w.flipLateClosed = (w.flipLateClosed || 0) + 1; settle(call(w, 'Target.closeTarget', { targetId: tid }, null, 2000)); }
  /** Before a browser's FIRST freeze: the flip tab born once in a window of its own (unfocused: no window's front moves), its birth
   *  address read, the tab closed. false ⇒ flipTaken: the browser is never frozen. */
  function flipCheck(w) {
    if (w.flipChecked) return Promise.resolve(true);
    if (!w.flipChecking) w.flipChecking = flipCheckOnce(w).finally(() => { w.flipChecking = null; });
    return w.flipChecking;
  }
  async function flipCheckOnce(w) {
    w.flipping = (w.flipping || 0) + 1;
    let id = null;
    try {
      const c = await settle(call(w, 'Target.createTarget', { url: BI().FLIP_TAB_URL, newWindow: true, focus: false }, null, 2000));
      id = c && c.result && c.result.targetId ? c.result.targetId : null;
      madeFlip(w, id);
      if (!id) { if (c && c.timeout) noteLateFlip(w); flipTaken(w, null); return false; }
      const left = await flipBirthLeft(w, id);   // its birth read first, then claimed
      if (w.flipBirths) w.flipBirths.delete(String(id));
      if (!left) return false;
      w.flipChecked = true;
      return true;
    } finally {
      if (id) await settle(call(w, 'Target.closeTarget', { targetId: id }, null, 2000));
      flipEnd(w);
    }
  }
  async function showFront(w, tid) {
    const winOf = (id) => windowOfTarget(w, id);
    w.flipping = (w.flipping || 0) + 1;
    try {
      // rows B-98f5 / B-bcf8: the flip tab is born at an address no browser driver takes (browser-idle.js FLIP_TAB_URL); its birth read
      const want = await winOf(tid);
      await settle(call(w, 'Target.activateTarget', { targetId: tid }, null, 2000));
      const b = await settle(call(w, 'Target.createTarget', { url: BI().FLIP_TAB_URL }, null, 2000));
      const bid = b && b.result && b.result.targetId;
      await flipBorn(w, b, bid);
      const got = bid ? await winOf(bid) : null;
      if (bid) await settle(call(w, 'Target.closeTarget', { targetId: bid }, null, 2000));
      const back = await settle(call(w, 'Target.activateTarget', { targetId: tid }, null, 2000));
      if (bid && want != null && got != null && got !== want) { try { log.warn?.(`[browser-dialogs] ${w.profileId}: the idle-paint thaw's blank tab opened in window ${got}, not the tab's window ${want} — closed at once`); } catch { /* */ } }
      const failed = !bid ? 'no flip tab' : !cdpReplied(back) ? 'activation unanswered' : want == null || got == null ? 'window unread' : got !== want ? 'another window' : null;
      return { targetId: tid, window: want, blankIn: got, ...(failed ? { failed } : {}) };
    } finally { flipEnd(w); }
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
  // lane chrome-157 (vault-login round 32, 主开发 2026-11-15 item 2): A DIALOG THAT OPENED ON A FENCED TAB IS TOLD TO AN AGENT WITHOUT ITS
  // WORDS — its message, default value, title and address are the fenced document's (a page can alert what was typed). The person's
  // own view keeps them; every agent road (the fact, its notes, the held-dialog notice, the long-poll) reads agentDialogOf.
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
    for (const e of w.targets.values()) if (e.heldAt && inScope(scope, e.targetId)) return { at: e.heldAt, targetId: e.targetId, title: effectiveLiveFillOf(e) ? '' : (e.title || '') };   // (round 32: a fenced tab's title is its document's)
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
        if (a.dialog && a.dialog.type === 'alert' && (a.by === 'auto' || a.by === 'browser')) { alerts.push(a.dialog.fencedAt ? { ...a, dialog: agentDialogOf(a.dialog) } : a); continue; } // verify r1 A3: said together below
        const words = ST.answeredNote(a.dialog && a.dialog.fencedAt ? { ...a, dialog: agentDialogOf(a.dialog) } : a);
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
      open: d ? blockOf(agentDialogOf(d), { at: t }) : null, // lane browser-surfaces: a surface's own block
      text: d ? sentenceOf(agentDialogOf(d), { at: t, repeat: true }) : '',
      targetId: d ? d.targetId : null,
      notes,
      stuck: !d && !loop && verdict.state === 'unresponsive' ? { ...verdict, text: ST.stuckAgentText(verdict) } : null,
      // lane browser-held-not-hung: a held tab in scope while the page answers (or nothing was asked yet) — the watch's own
      // `blind` fact (the chip / the live view's quiet line), never the agent's "not responding"
      held: !d && !loop && (verdict.state === 'blind' || verdict.held) ? ST.stuckFact({ verdict }) : null,
      loop: loop ? { ...ST.loopBlock(loop), runStart: loop.runStart, text: ST.loopText(loop) } : null,
      loopAny: loopAny ? { ...ST.loopBlock(loopAny), runStart: loopAny.runStart } : null,
      loopShared, // verify r1: kinds only
      passkey: watched ? PK.passkeyBlock(passkeyIn(pid, scope)) : unknownBlock(pid), // lane browser-passkey: `passkey_open` with THE SENTENCE, `unknown` where no hook armed — lane passkey-browse-yourself: an unwatched browser too (UNKNOWN_TEXT), never null
      prompt: watched ? ST.promptBlock(promptIn(pid, scope), { now: t }) : null, // lane browser-ui-prompts: a file chooser / an HTTP sign-in, with THE SENTENCE
    };
  }
  /** lane passkey-browse-yourself: THE PASSKEY FACT a view renders out of a facts block — `passkey_open` (a headed browser's
   *  desktop, and the virtual display it is on: the sentence names it) / `passkey_ask` (the owner's card: the banner's buttons);
   *  null for any other state. ONE shape on every road (a conversation's session row, his window's relay). */
  function passkeyFactFrom(pk, pid) {
    if (!pk) return null;
    if (pk.state === PK.PASSKEY_ASK_CODE) { const a = pk.proposal ? pkAsks.get(String(pk.proposal)) : null; return { state: 'passkey', passkey: pk, ...(a && a.state === 'open' ? { card: a.card } : {}), headed: false, since: pk.startedAt, profileId: pid }; }
    if (pk.state === PK.PASSKEY_OPEN_CODE) { const headed = onDesktop(pid); const display = headed ? displayOf(pid) : null; return { state: 'passkey', passkey: pk, headed, ...(display ? { display } : {}), since: pk.startedAt, profileId: pid }; }
    return null;
  }
  /** lane passkey-browse-yourself (rules 2 + 4): the passkey fact of ONE live view (its relay's profile + holder) — the window
   *  with no session row (browse yourself) reads its banner from here. A browser the watch does not see — or a web page of the
   *  view whose hook never armed — ⇒ `unknown` with UNKNOWN_TEXT (the view's quiet line): never silence. null = nothing to say. */
  function passkeyFactOf({ profileId, browserKey = '', sessionId = null, ephemeral = false } = {}) {
    const pid = String(profileId || '');
    if (!pid) return null;
    const unknown = (b = PK.passkeyBlock({ state: 'unknown' })) => ({ state: 'passkey', passkey: b, headed: false, since: 0, profileId: pid });
    const w = watches.get(pid);
    if (w && w.state === 'connecting') return null; // its `watched` / `down` comes next — never a flash of the unknown line
    // B-346d (the rest of law 1): THE VIEW NEVER SAYS «NOT WATCHING» OF A BROWSER IT WILL REACH AGAIN — while a re-arm is coming
    // (a socket that closed under a view or the person's own browsing; its tries not run out) nothing is said, as while connecting; its
    // `watched` follows, or after REARM_TRIES the given-up line (with its Retry door)
    if (!w && rearmPending(pid)) return null;
    if (!w || w.state !== 'open') return unknown(unknownBlock(pid));
    const scope = scopeFor({ profileId: pid, browserKey, sessionId, ephemeral });
    const b = PK.passkeyBlock(passkeyIn(pid, scope));
    if (b && b.state === 'unknown') return passkeyTabs(w, scope).some((e) => !e.pk.armed && /^https?:/i.test(e.url || '')) ? unknown() : null; // a blank / chrome:// tab holds no ceremony
    return passkeyFactFrom(b, pid);
  }
  /** acceptance r1: an unwatched browser's block with its TRUE cause when the watch knows one — `gave-up` (its socket failed
   *  REARM_TRIES re-arms), the machine handle's own refusal (acceptance r2: its answer — `remote` = it runs on a paired machine,
   *  any other cause in the handle's words), else not watched right now (acceptance r3: NOT_WATCHED_TEXT — before the first arm the
   *  cause is not known, so none is claimed). */
  function unknownBlock(pid) {
    const k = String(pid), r = refusals.get(k);
    if (gaveUp.has(k)) return PK.passkeyBlock({ state: 'unknown', why: 'gave-up' });
    if (r) return PK.passkeyBlock(r.code === 'remote' ? { state: 'unknown', why: 'remote' } : { state: 'unknown', why: 'refused', cause: r.error });
    return PK.passkeyBlock({ state: 'unknown', why: 'not-watched' });
  }
  /** The virtual display an attach-road browser runs on (`:N` — the keeper's record), or null. */
  function displayOf(profileId) {
    let rec = null; try { rec = keeper && typeof keeper.browserOf === 'function' ? keeper.browserOf(String(profileId)) : null; } catch { rec = null; }
    const d = rec && rec.displaySession && rec.displaySession.display;
    return d ? String(d).slice(0, 40) : null;
  }
  /** The conversation-level stuck fact (the keeper's `factFor` → the chip / the row): across its browsers — or, given
   *  `{profileId}` (lane browsers-stop: the stop asks about ONE browser), that browser's own fact only. */
  function stuckForKey(browserKey, { profileId = null } = {}) {
    if (!keeper || !browserKey) return null;
    const bk = String(browserKey);
    // lane passkey-browse-yourself (rule 2): the user's OWN browsing (`hu-…`: no lease, no set) — its profile, his tabs (the
    // wiring's holderTabs: his own tab + the ones he took) — the fact his window renders, the same as a conversation's
    const humanPid = /^hu-/.test(bk) ? HM().profileOfHumanKey(bk) : null;
    let set = null; if (!humanPid) { try { set = keeper.setFor(bk); } catch { set = null; } }
    const cands = humanPid ? [{ profileId: humanPid, ephemeral: false }] : [];
    for (const a of (set && set.attachments) || []) cands.push({ profileId: a.profileId, ephemeral: false });
    let e = null; if (!humanPid) { try { e = keeper.ephemeralFor ? keeper.ephemeralFor(bk) : null; } catch { e = null; } }
    if (e && e.profileId) cands.push({ profileId: e.profileId, ephemeral: true, sessionId: e.sessionId || null });
    for (const c of cands) {
      if (profileId && String(c.profileId) !== String(profileId)) continue;
      // lane browser-unresponsive: the WHOLE browser judged hung (the keeper's fact) is said before any page's state
      let br = null; try { br = typeof keeper.browserOf === 'function' ? keeper.browserOf(c.profileId) : null; } catch { br = null; }
      if (br && br.unresponsive && Number.isFinite(br.unresponsive.since)) { let p = null; try { p = keeper.profile(c.profileId); } catch { p = null; } return { state: 'unresponsive', why: 'browser', count: Number(br.unresponsive.asks) || 0, since: br.unresponsive.since, label: (p && p.label) || c.profileId, profileId: c.profileId }; }
      const f = factFor({ ...c, browserKey: bk, consume: false });
      // lane browser-passkey: a page waiting for a passkey (after a held dialog — that is answered first)
      // lane passkey-ui: + `passkey_ask` — the page waits for the OWNER's card: the fact carries that card (the live banner's buttons)
      { const pf = !f.open ? passkeyFactFrom(f.passkey, c.profileId) : null; if (pf) return pf; } // lane passkey-browse-yourself: ONE shape (passkeyFactFrom)
      const fact = ST.stuckFact({ dialog: f.open ? { ...f.open, id: f.open.id } : null, prompt: f.prompt, verdict: f.stuck || (f.held && !f.loopAny ? f.held : null), loop: f.loopAny, now: now() }); // lane browser-ui-prompts: + the browser's own prompt
      if (fact) return { ...fact, profileId: c.profileId };
    }
    return null;
  }

  /** B-b56d (the owner's ruling B, 2026-11-18): WHAT THE PERSON'S OWN WINDOW SAYS BESIDE ITS PROMPT FACT — PURE over the watch's
   *  state, never a typed value. `ended`: the newest sign-in of the person's tabs that VibeSpace cancelled because nobody answered it
   *  within its bound (law 4: said, never a silent refusal). `hook`: while a window of the person shows the browser, whether its
   *  sign-ins are hooked — `armed: false` with why when a tab's hook was refused, or on a kernel (law 5: never a silent dead end);
   *  `x`: the browser is on the X road (Chrome's own sheet stands in its window there). */
  function personPromptStateOf(browserKey) {
    const bk = String(browserKey || '');
    if (!/^hu-/.test(bk) || !PERSON_SIGNIN_HOOK) return null; // B-b56d OUT: no hook, so nothing to say beside the prompt fact
    let pid = null; try { pid = HM().profileOfHumanKey(bk); } catch { pid = null; }
    if (!pid) return null;
    const views = (personViews.get(String(pid)) || 0) > 0;
    const w = watches.get(String(pid));
    // its read (S3): NO open watch while a window of the person shows the browser (refused, another machine, the re-arms given up) —
    // its sign-ins cannot be seen there: said (a watch still connecting is `null`: nothing said yet)
    if (!w || w.state === 'down') return views ? { ended: null, hook: { armed: false, why: 'unwatched', x: xRoad(pid) } } : null;
    const scope = scopeFor({ profileId: pid, browserKey: bk });
    const t = now();
    // its read (S2): only a note made on the PERSON'S road (never a conversation's), and only within the hour
    const note = [...w.promptNotes].reverse().find((n) => n && n.person && n.how === 'expired' && n.prompt && n.prompt.type === 'http-auth' && t - (Number(n.at) || 0) < ENDED_SHOW_MS && inScope(scope, n.targetId)) || null;
    const ended = note ? { id: String(note.id), how: 'expired', origin: note.prompt.origin, realm: note.prompt.realm || '', proxy: !!note.prompt.proxy, at: note.at, boundMs: Number(note.boundMs) || authHoldMaxMs } : null; // the cure: the bound the note was armed with
    let hook = null;
    if (w.mode === 'person' && views) {
      const x = xRoad(pid);
      if (w.kernel) hook = { armed: false, why: 'kernel', x };
      else if (w.state !== 'open') hook = { armed: null, why: 'connecting', x };
      else if ([...w.targets.values()].some((e) => e.sid && e.enabled && e.authHookOff && inScope(scope, e.targetId))) hook = { armed: false, why: 'refused', x };
      else hook = { armed: true, x };
    }
    return { ended, hook };
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
    const r = running.get(browserKey) || { n: 0, at: 0, on: {} }; const on = { ...(r.on || {}) }; if (profileId) { const o = on[String(profileId)] || { n: 0, at: 0 }; on[String(profileId)] = { n: o.n + 1, at: now(), verb: verb ? String(verb) : (o.verb || null) }; } running.set(browserKey, { n: r.n + 1, at: now(), on });
    // lane site-reset: a page-ACTING command's instant — a page turn right after it is the agent's, never the page's loop
    const w = profileId ? watches.get(String(profileId)) : null;
    if (w && verb && ST.loopActing(verb)) { w.commands.push(now()); if (w.commands.length > LOOP_COMMANDS_KEEP) w.commands.splice(0, w.commands.length - LOOP_COMMANDS_KEEP); }
  }
  // (the idle paint clock restarts when a verb ENDS — it was stamped only at its start, so a long verb's end read as long idle)
  function verbEnded(browserKey, { profileId = null } = {}) { if (!browserKey) return; if (profileId && watches.get(String(profileId))) watches.get(String(profileId)).lastVerbAt = now(); const r = running.get(browserKey); if (!r) return; const on = { ...(r.on || {}) }; if (profileId && on[String(profileId)]) { const o = on[String(profileId)]; if (o.n <= 1) delete on[String(profileId)]; else on[String(profileId)] = { n: o.n - 1, at: o.at, verb: o.verb || null }; } if (r.n <= 1) running.delete(browserKey); else running.set(browserKey, { n: r.n - 1, at: r.at, on }); }
  /** Is a verb of ANY holder running on this browser now (between its /resolve and its /audit — a crashed CLI's forgotten past
   *  VERB_RUNNING_MAX_MS)? The idle paint stop reads it (paintFacts' `busy`). */
  function verbRunningOn(profileId) {
    const pid = String(profileId || ''), t = now();
    for (const r of running.values()) { const o = r && r.on ? r.on[pid] : null; if (o && o.n > 0 && t - (Number(o.at) || 0) <= VERB_RUNNING_MAX_MS) return true; }
    return false;
  }
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
      try { notice(h.sessionId, { kind: 'browser-dialog', dialog: blockOf(agentDialogOf(d)), ...(d.surface && d.kind !== 'js-dialog' ? { text: sentenceOf(agentDialogOf(d)) } : {}), label: h.ephemeral ? null : label }); let ss = noticedSessions.get(d.id); if (!ss) { ss = new Set(); noticedSessions.set(d.id, ss); } ss.add(h.sessionId); } catch (e) { say('notice:' + (e && e.message), `the idle dialog notice was not queued — ${e && e.message}`); } // lane browser-surfaces: a kernel prompt's own sentence rides the notice
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
    return r.ok ? { ok: true, dialog: blockOf(agentDialogOf(r.dialog)), text: r.dialog.surface && r.dialog.kind !== 'js-dialog' ? `the browser prompt was ${accept ? 'accepted' : 'dismissed'}` : ST.answerDoneText(agentDialogOf(r.dialog), { accept: !!accept, text }) } : r;
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
    if (lp) return { state: 'loop', since: lp.runStart || 0, ...(lp.targetId ? { targetId: String(lp.targetId).slice(0, 64) } : {}) }; // ui-needs-a-button (reader #2): WHICH tab loops (a CDP id, never an address)
    const v = browserVerdict(pid, heldIn(pid, null));
    if (v.state === 'unresponsive') return { state: 'unresponsive', why: v.why, count: v.count || 0, since: v.since || 0 };
    if (v.state === 'blind' || v.held) return { state: 'blind', why: 'held', since: Number(v.since || (v.held && v.held.since)) || 0 };
    return null;
  }
  // ── lane browser-passkey: the ceremony hook ──
  function armPasskey(w, e) {
    if (pkSinks(w) && w.mode !== 'person') return null; // acceptance r1: the person's watch on a kernel hooks like standard Chrome (no surfaces there) // lane passkey-sink: a kernel with `webauthn` — no hook, no virtual authenticator (both stay for standard Chrome)
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
    if (e.pk.armed && pks && w.mode !== 'person') e.pk.auth = await pairAuthenticator(w, e, sid); // lane passkey-store-core: the tab's EMPTY authenticator, re-paired on every attach — acceptance r1: never on the person's watch (an empty one fails his passkey in < 1 s, no Chrome window)
    if (e.pk.armed) pkPendingAgain(w, e); // acceptance r1: a ceremony this document was ALREADY waiting on (the watch reconnected; acceptance r2: the hub restarted — the hook's names are the browser's, see pkIdsFor) is recorded with its age
    if (!e.pk.armed) say('pk-arm:' + w.profileId, `${w.profileId}: the passkey hook did not arm on a tab — its passkey requests read as unknown (${(r1 && r1.error && r1.error.message) || (r2 && r2.error && r2.error.message) || (rr && rr.error && rr.error.message) || (r3 && r3.error && r3.error.message) || 'no answer'})`);
    if (w.readySeen && w.state === 'open') emit({ kind: 'passkey', profileId: w.profileId, targetId: e.targetId, state: e.pk.armed ? 'armed' : 'unarmed', hook: true }); // acceptance r1: a hook that armed (or failed) after the socket's first pass — a held tab, a new tab — moves the view's fact
  }
  /** lane browser-passkey-chrome (MEASURED on 0.38.1): Chrome draws its passkey dialog TAB-MODAL in the browser's own window —
   *  on this computer's desktop only when that window is. The hidden-window rung's window is on the CLI's own Xvfb, which
   *  nobody sees: the banner's desktop note there sent the user looking for a window that is not on any screen. */
  function onDesktop(profileId) {
    { const w0 = watches.get(String(profileId)); if (pkSinks(w0) && w0.mode !== 'person') return false; } // lane passkey-sink: the kernel draws no passkey window — VibeSpace answers (acceptance r1: not on the person's watch — no surfaces there)
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
    for (const t of w.targets.values()) for (const r of t.pk.records) if (PK.waitsSaid(r) && now() - r.startedAt >= PK.FOR_YOU_AFTER_MS && !open.has(r.rpId)) open.set(r.rpId, r); // acceptance r2: the verdict's rule (an autofill get he keeps open is no wait to file)
    for (const [rp, id] of [...w.pkForYou]) if (!open.has(rp)) { w.pkForYou.delete(rp); try { forYou.resolve?.(id); } catch (err) { say('pk-fy:' + (err && err.message), `the passkey For-you item was not resolved — ${err && err.message}`); } }
    for (const [rp, r] of open) if (!w.pkForYou.has(rp)) {
      let label = null; try { label = labelOf ? labelOf(w.profileId) : null; } catch { label = null; }
      let id = null; try { id = forYou.add?.(w.profileId, PK.forYouItem(r, { label: label || '', display: onDesktop(w.profileId) ? displayOf(w.profileId) : null })); } catch (err) { say('pk-fy:' + (err && err.message), `the passkey For-you item was not filed — ${err && err.message}`); }
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
    let n = 0, kn = 0, rpId = '', failed = 0, frp = '';
    for (const e of passkeyTabs(w, scopeFor(t))) {
      for (const rec of e.pk.records.filter((r) => r.kernel && r.outcome === 'pending')) if (await pkKernelCancel(w, e, rec, by)) { n++; kn++; rpId = rpId || rec.rpId; } // lane passkey-sink: the kernel ends it (cancelSurface) — the page sees NotAllowedError
      const ctxs = [...new Set(e.pk.records.filter((r) => r.outcome === 'pending' && !r.kernel).map((r) => r.ctx))];
      for (const ctx of ctxs) {
        const asked = e.pk.records.filter((x) => x.outcome === 'pending' && !x.kernel && x.ctx === ctx); // B-97ae walk (c): what the cancel is sent FOR — a start that lands in the same socket read as its answer (ws runs both frames before the await continues) is a new sign-in, never this cancel's
        const rp0 = (asked[0] || {}).rpId || ''; // acceptance r3: the site read BEFORE the await (the page's own end can land first)
        const r = await pkCall(w, e, ctx, 'cancel');
        const k = r && r.result && r.result.result ? Number(r.result.result.value) || 0 : 0;
        if (k <= 0 && asked.some((x) => x.outcome === 'pending')) { failed++; frp = frp || rp0; } // round 2: the page did not take the cancel — said as it is, never «nothing is waiting»
        // lane passkey-lend-cleanup (B-97ae, HIGH): a ceremony the Cancel ENDS here goes through THE ONE END (pkEnd → the tab's
        // drain → pkUnload: its keys, its UV and the once-authenticator leave). The page reports its end too, but which lands
        // first is Chrome's: once this marks the record ended, that report matches no pending record (PK.applyEvent) — before
        // this, the cleanup then NEVER ran and the person's key stayed on the tab after their «no» (6 of 10 on .390)
        if (k > 0) { n += k; rpId = rpId || rp0; for (const rec of asked) if (rec.outcome === 'pending') { rec.outcome = 'cancelled'; rec.endedAt = now(); rec.by = by; rpId = rpId || rec.rpId; pkEnd(w, e, rec).catch((err) => say('pk-flow:' + (err && err.message), `${w.profileId}: a passkey ceremony step failed — ${err && err.message}`)); } }
      }
      if (n) passkeyChanged(w, e);
    }
    return { ok: true, n, rpId, ...(failed ? { failed } : {}), text: PK.cancelText({ n, rpId: rpId || frp, kernel: kn > 0, failed }) };
  }
  // ── lane passkey-store-core: THE PASSKEY STORE'S CEREMONIES (docs/design-passkey-store.zh.md; P0's corrections) ──
  // The tab's virtual authenticator is EMPTY between ceremonies; a held ceremony is judged by PURE PS.gateVerdict and only
  // the rows it may use are loaded for it; `end` unloads everything. THIS file is the store's ONE writer.
  const pkRead = () => {
    if (pkCache) return pkCache;
    if (pkHoldable) {
      if (!pkStarted) {   // r3261: the store's ONE read, at its first ask, through the store-read law
        pkStarted = true;
        let read; try { read = { text: pks.readText() }; } catch (error) { read = { error }; }
        const a = SR().storeAnswer(read, { valid: PK_SHAPE });
        if (pkStoreHold.start(a) === 'data') { pkCache = PS.normalizeStore(a.value); pkDamaged = pkDamagedOf(a.value); return pkCache; }
      }
      if (pkHeld()) return PS.normalizeStore(null);   // HELD: no passkey is known — an empty view each ask, NEVER cached as the store
      pkCache = PS.normalizeStore(null); return pkCache;   // no file yet: empty, as before
    }
    let raw = null; try { raw = pks.read(); } catch (e) { say('pk-read:' + (e && e.message), `the passkey store could not be read — ${e && e.message}`); } pkCache = PS.normalizeStore(raw); return pkCache;
  };
  const pkWrite = (next) => { if (pkStoreHold && !pkStoreHold.writable('a passkey change')) return false; /* r3261: HELD — nothing is written over the file */ pkCache = PS.normalizeStore(next); try { pks.write(pkDamaged ? { ...pkCache, damaged: { ...pkDamaged } } : pkCache); return true; } catch (e) { say('pk-write:' + (e && e.message), `the passkey store was not written — ${e && e.message}`); return false; } }; // lane passkey-sink: → on disk?
  const b64 = (u) => { const s = String(u || '').replace(/-/g, '+').replace(/_/g, '/'); return s + '='.repeat((4 - (s.length % 4)) % 4); };
  const b64u = (s) => String(s || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  /** P0 (b): `enable` and the authenticator are ONE step — an enabled domain with no authenticator hangs every get. */
  async function pairAuthenticator(w, e, sid, { ui = false } = {}) {
    const en = await call(w, 'WebAuthn.enable', { enableUI: !!ui }, sid); // acceptance r1: `ui` = a vault ceremony the person chose (Chrome's own window stays usable)
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
      const q = await call(w, 'Runtime.callFunctionOn', { objectId: f.ctl, functionDeclaration: PK.CTL_FN, arguments: [{ value: e.pk.key }, { value: 'pending' }, { value: 0 }], returnByValue: true }, sid); // acceptance r1: what this document is ALREADY waiting on (its hook is from before this arm)
      const list = q && q.result && q.result.result && Array.isArray(q.result.result.value) ? q.result.result.value : [];
      for (const p of list.slice(0, 8)) if (p && typeof p === 'object') e.pk.againQ.push({ ...p, ctx: Number(ctx) });
    }
    if (f.n !== 1) {
      if (f.n > 1) say('pk-twin:' + w.profileId, `${w.profileId}: two passkey hooks answered in one document — neither was armed`);
      return null;
    }
    e.pk.ctl.set(ctx, f.ctl);
    if (arm) await pkArmReporter(w, e, ctx, sid); // lane passkey-binding-isolated: the live document's isolated-world reporter (this arm's binding)
    return f.ctl;
  }
  /** acceptance r1 (rule 4): the ceremonies a (re)armed document was ALREADY waiting on, recorded with the age the hook gives
   *  (a page at /challenge/pk across a reconnect or a hub restart is said like any other); one still HELD is gated now.
   *  Acceptance r2: the hook answers the WHOLE start event the live road said (mediation, origin, allow) and it goes through the
   *  same parseEvent — an autofill get open across a re-arm stays an autofill get (never passkey_open, no For-you item). */
  function pkPendingAgain(w, e) {
    let n = 0;
    for (const p of e.pk.againQ.splice(0)) {
      const ev = PK.parseEvent(JSON.stringify({ ...p, ev: 'start' }));
      if (!ev || e.pk.records.some((r) => r.n === ev.id && r.ctx === p.ctx && r.outcome === 'pending')) continue;
      const age = Math.min(Math.max(0, Number(p.age) || 0), 24 * 3600e3);
      const rec = PK.applyEvent(e.pk.records, ev, { tab: e.targetId, ctx: p.ctx, now: now() - age });
      if (!rec) continue;
      rec.again = true; n++;
      if (p.held === true && pks) pkGate(w, e, rec).catch((err) => pkFailed(w, e, rec, err));
    }
    if (n) passkeyChanged(w, e, true);
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
    const h = { stop: null }; // r7: the page's hold kept while the gate waits on the tab's clean-up (pkHold) — let go however the gate ends
    try { return await pkGateOn(w, e, rec, h); } finally { if (h.stop) h.stop(); }
  }
  async function pkGateOn(w, e, rec, h) {
    if (rec && rec.kernel) return pkKernelGate(w, e, rec); // lane passkey-sink: the kernel road (no authenticator, VibeSpace signs)
    const person = w.mode === 'person'; // acceptance r1: HIS own ceremony — the vault only when he chose it, else Chrome's own window
    const drained = async () => { if (!h.stop) h.stop = pkHold(w, e, rec); await pkDrained(w, e); return rec.outcome === 'pending'; }; // r7 (acceptance r6): the wait has NO cap — the page's hold is kept meanwhile (BREAK 6); over while it waited (its page's own hold ran out) ⇒ nothing passed, paired, loaded or released
    if (person && e.pk.once && e.pk.auth && !(e.pk.onceFor && e.pk.onceFor.outcome === 'pending')) { const stale = e.pk.onceFor; pkDrain(w, e, () => pkOnceGone(w, e, stale)).catch(() => {}); } // r5 belt: a once-authenticator whose ceremony is over never meets the next one (Chrome's own window for it) — r6: its remove is a drain like every other
    if (person && e.pk.draining && !(await drained())) return; // r6: his autofill too meets no clean-up in flight (a disable after its pass drops the environment Chrome holds it in)
    if (pks) pkRead();   // r3261: the store's first read happens HERE, before any verdict over its rows
    if (pkHeld()) { if (person) return pkCtl(w, e, rec, 'release'); /* the PERSON's own ceremony: Chrome's own window — the vault offers nothing it cannot read */ rec.refused = true; rec.why = 'passkeys_unread'; pkTrace(w, e, rec, 'refused', { why: rec.why }); await pkCtl(w, e, rec, 'refuse'); passkeyChanged(w, e); return { verdict: 'refuse', why: rec.why }; }   // r3261 (a)/(b): HELD — refused BEFORE the ceremony answers the site: nothing paired, nothing loaded, no key made; the agent told the hold
    if (person && rec.conditional) { rec.passed = true; return pkCtl(w, e, rec, 'pass'); } // acceptance r2: his AUTOFILL get (the page's, at load — a pick by nature, open as long as the page) goes to Chrome as is: no vault key, and it holds no queue — acceptance r3: Chrome takes ONE WebAuthn request per page (a modal one beside it is refused with OperationError — measured), so the hook ends it when his «Sign in with a passkey» starts (installHook's `supersede`)
    if (!e.pk.auth && !person) return pkCtl(w, e, rec, 'release'); // no authenticator on this tab: Chrome's own behaviour (said passkey_open if it never ends)
    if (e.pk.draining && !(await drained())) return; // ONE ceremony per tab at a time: the last one's unload first (r7: no cap — a slow browser is waited for)
    const pid = w.profileId, part = PS.profileOf(pkRead(), pid);
    if (!rec.by) rec.by = person || pkTakeover(w, e) ? 'human' : 'agent'; // the operator at the START (a takeover never lifts an agent's ceremony)
    const owner = pkOwner(w, e);
    const gk = pid + ' ' + PS.grantKey(rec.rpId, owner || '');
    const grant = pkGrants.get(gk) || null;
    const v = PS.gateVerdict({ kind: rec.conditional ? 'conditional' : rec.kind, rpId: rec.rpId, origin: rec.origin || e.url, rows: part.rows, grant, input: { allow: rec.allow || [] }, answer: rec.answer || null, profileSwitch: !person && part.agentsOff, takeover: !person && rec.by === 'human', now: now() }); // acceptance r1: his own ceremony is ASKED (or his `always`), never taken over
    if (person && (v.verdict === 'refuse' || (v.verdict === 'release' && !(v.load && v.load.length) && !v.consumeGrant))) return pkCtl(w, e, rec, 'release'); // nothing of the vault he chose ⇒ Chrome's own window (never refused for the vault's sake)
    if (v.verdict === 'refuse') { rec.refused = true; rec.why = v.why; if (v.why !== 'none') pkTrace(w, e, rec, 'refused', { why: v.why }); await pkCtl(w, e, rec, 'refuse'); passkeyChanged(w, e); return v; }
    if (v.verdict === 'ask') return pkAsk(w, e, rec, v.rows);
    const taken = v.consumeGrant ? pkGrants.get(gk) || null : null; if (taken) pkGrants.delete(gk); // r8 (acceptance r7 MAJOR): the one-use registration grant is READ, JUDGED and CONSUMED as one step, here at the verdict — never in the job, which may wait behind the tab's drain while another tab or frame of the conversation reads the same grant (it finds none: no-grant)
    const latest = () => !taken || pkAnswered.get(gk) === taken; // r10 (acceptance r9 MAJOR): the owner's LATEST answer at that key is still the grant this ceremony took — read where the job acts, not only where it gives back
    const stands = () => { // r11 (acceptance r10 MINOR 2): the job's check tells the three cases apart → null (go) | the refusal's reason
      if (!taken) return null;
      const x = pkAnswered.get(gk);
      if (x && x !== taken) return 'answered-again'; // a NEWER answer stands («no», or a newer «once»)
      return x && now() <= taken.expiresAt ? null : 'expired-waiting'; // the entry GONE (pruned past its 10 min — by an answer anywhere) or past them now: the owner's 10 minutes are the law, never a newer answer
    };
    const outranked = async (why) => { // r10: a newer answer stands («no», or a newer «once») — nothing of the vault for this ceremony: no load, no release with the grant; the taken grant is DROPPED (never given back). r11: or the grant's 10 minutes ran out while it waited (`why`)
      // B-d981 (4): only while the watch is STILL the person's — a window handed to an agent between the checks (toAgent keeps this
      // ceremony's authenticator as the agent's, e.pk.once off) never releases the person's «no»'d registration into it: the agent's
      // road below refuses it, and what went in leaves at its end (the marks stay for pkUnload)
      if (person && w.mode === 'person') { e.pk.holds.delete(rec); rec.createdBy = null; rec.loaded = rec.uvSet = null; await pkOnceGone(w, e, rec); return pkCtl(w, e, rec, 'release'); } // the person's own ceremony: the authenticator paired for it goes, Chrome's own window — as with no grant (never refused for the vault's sake)
      rec.refused = true; rec.why = why; pkTrace(w, e, rec, 'refused', { why: rec.why }); await pkCtl(w, e, rec, 'refuse'); passkeyChanged(w, e); // the page gets its own refusal — r11: what it loaded leaves at its end (rec.loaded / rec.uvSet were marked as the calls went out)
    };
    const back = () => { if (taken && latest()) pkGrants.set(gk, taken); }; // r8: a job that lets its ceremony go WITHOUT the vault (over before its turn, over while the authenticator paired, no authenticator) gives the grant back as it was — its own 10-min clock, never extended. r9 (acceptance r8 MAJOR): only while the owner's LATEST answer at that key is still this grant — a «no» or a newer «once» answered meanwhile (standing or already spent) outranks it, and it is dropped
    await pkDrain(w, e, async () => { // r7: the gate's touch of the authenticator is ONE drain — his pairing (r6: with the gate race's remove), the load, the release; an end that lands meanwhile unloads after it, what it loaded
      if (rec.outcome !== 'pending') return back(); // over before its turn: nothing paired, nothing loaded (r8: its grant back)
      let why = stands(); if (why) return outranked(why); // r10 (acceptance r9 MAJOR): the owner answered again while it waited its turn — before anything is paired or loaded (r11: or its grant ran out meanwhile)
      if (person && !e.pk.auth) { // the vault key he chose: an authenticator for THIS ceremony only, Chrome's UI on (acceptance r3: `onceFor` — only ITS end removes it; r5: an end that landed while it was paired found no authenticator in pkEnd — it goes here, no key loaded)
        e.pk.pairs = (e.pk.pairs || 0) + 1; e.pk.auth = await pairAuthenticator(w, e, e.sid, { ui: true }); e.pk.once = !!e.pk.auth; e.pk.onceFor = e.pk.auth ? rec : null;
        if (rec.outcome !== 'pending') { back(); return pkOnceGone(w, e, rec); }
      }
      if (!e.pk.auth) { back(); return pkCtl(w, e, rec, 'release'); } // Chrome's own window: the vault registers nothing (r8: its grant back)
      // r8: the authenticator is there for it — the grant (consumed at the verdict) is spent from here
      rec.createdBy = person ? 'human' : v.createdBy || null;
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
      const own = { auth: e.pk.auth, ids: loaded.map((l) => l.row.credentialId), uv: !!v.uv }; // r7 (acceptance r6 MAJOR): what THIS ceremony loads, captured before it loads — its clean-up acts on this alone (pkUnload)
      for (const r of e.pk.holds.keys()) if (!e.pk.records.includes(r)) e.pk.holds.delete(r); // (a record the tab let go of holds nothing)
      e.pk.holds.set(rec, own);
      rec.loaded = own.ids; rec.uvSet = own.uv; // r11 (acceptance r10 MINOR 1): marked as the CDP calls go out, before any later check — a refusal after the load (outranked) unloads what went in and turns UV off at its end (pkUnload)
      for (const l of loaded) {
        const r = await call(w, 'WebAuthn.addCredential', { authenticatorId: own.auth, credential: { credentialId: b64(l.row.credentialId), isResidentCredential: true, rpId: l.row.rpId, privateKey: l.key, ...(l.row.userHandle ? { userHandle: b64(l.row.userHandle) } : {}), signCount: l.loadAs, ...(l.row.userName ? { userName: l.row.userName } : {}), ...(l.row.displayName ? { userDisplayName: l.row.displayName } : {}) } }, e.sid);
        if (r && r.error && !/already registered/i.test(String(r.error.message || ''))) say('pk-add:' + pid, `${pid}: a stored passkey was not loaded — ${r.error.message}`); // round 2: «its id is already registered» = the key IS in the authenticator (a leftover's or an heir's) — usable, nothing untrue said
      }
      if (own.uv) await call(w, 'WebAuthn.setUserVerified', { authenticatorId: own.auth, isUserVerified: true }, e.sid);
      why = stands(); if (why) return outranked(why); // r10: … and right before the release — an answer that came while it paired or loaded
      pkSpend(taken); // r10: the grant went with its release — a later answer takes nothing back (its card is not told)
      await pkCtl(w, e, rec, 'release');
    });
    return v;
  }
  /** ⑤ the ceremony ended: EVERYTHING leaves the authenticator (getCredentials is [] between ceremonies), UV off, the hook told. */
  async function pkEnd(w, e, rec) {
    const a = rec.ask && pkAsks.get(rec.ask); if (a && a.state === 'open') pkClose(a, 'withdrawn');
    if (rec.passed) return; // acceptance r3: a request handed to Chrome as is holds no authenticator and no drain — its end touches neither
    if (!e.pk.auth || !e.sid) { e.pk.holds.delete(rec); return; } // r7: no authenticator left — what it loaded went with it
    await pkDrain(w, e, () => pkUnload(w, e, rec)); // r6: chained onto a clean-up in flight, never written over it
  }
  /** r6 (acceptance r5 MAJOR): ONE rule — every unload, every pairing of the person's once-authenticator and every remove of it
   *  is a DRAIN: chained onto the tab's drain in flight (begun at once when there is none), and the next gate waits for it
   *  (pkDrained). An old ceremony's WebAuthn.disable — Chrome drops the tab's whole virtual environment, the new authenticator
   *  and his key in it — never lands after the next ceremony's enable. r7: the gate's load and release are one too (pkGate). */
  function pkDrain(w, e, fn) {
    const prev = e.pk.draining;
    const job = prev ? pkDrained(w, e, prev).then(fn) : fn();
    e.pk.draining = job;
    const done = () => { if (e.pk.draining === job) { e.pk.draining = null; sayOnce.delete(pkSlowKey(w, e)); } }; // r7: the tab's drain over — a later slow one is a new episode, said again
    job.then(done, done);
    return job;
  }
  /** The ONE wait on a drain — r7 (acceptance r6): NO cap. The gate waits while the CDP session answers: a slow browser is waited
   *  for (r6's 1-s cap let a clean-up it went past act on the next ceremony's authenticator); a closed socket answers every call
   *  at once (down()), a silent one each call at its own timeout. A wait past drainMs is said, once per episode (pkDrain clears it) —
   *  r8: whatever job is the slow one (a gate's pairing / load / release or an unload), whatever waits on it (a gate or the next job). */
  async function pkDrained(w, e, d = e.pk.draining) {
    if (!d) return;
    const t = setTimeout(() => say(pkSlowKey(w, e), `${w.profileId}: a passkey sign-in's set-up or clean-up on this tab is still running after ${drainMs} ms — the next step on this tab waits for it`), drainMs);
    if (t.unref) t.unref();
    await d.then(() => {}, () => {});
    clearTimeout(t);
  }
  const pkSlowKey = (w, e) => 'pk-drain:' + w.profileId + ':' + e.targetId;
  /** r7 (acceptance r6 BREAK 6): a sign-in that waits on the tab's clean-up keeps its page's hold — the hook's `wait` (its timer
   *  re-armed, as a card's heartbeat does) at once and every holdBeatMs while the gate waits and then pairs / loads, for holdMaxMs
   *  at most (then the page's own hold ends its request: the gate loads nothing for it). → stop. */
  function pkHold(w, e, rec) {
    let t = null, n = 0;
    const beat = () => { t = null; if (rec.outcome !== 'pending' || w.state !== 'open' || n * holdBeatMs >= holdMaxMs) return; n++; pkCtl(w, e, rec, 'wait').catch(() => {}); t = setTimeout(beat, holdBeatMs); if (t.unref) t.unref(); };
    beat();
    return () => { n = Infinity; if (t) clearTimeout(t); };
  }
  /** r5 (acceptance r4 MAJOR 1): the person's once-authenticator (and the vault key loaded in it) leaves with ITS ceremony however
   *  that ceremony ended — its end (pkUnload), its document gone (pkPageGone), an end that landed while the gate was pairing it
   *  (pkGate), or found stale when the next ceremony starts (pkGate's belt). Any other ending record touches it not (7.1).
   *  r6: always inside a drain (pkDrain); no disable once a newer pairing began (`pairs` — r7: no gate goes past a drain now; kept as a belt).
   *  r7: never while another ceremony still pending holds a key in it — it passes to that one (its clean-up removes it). */
  /** B-97ae walk (b) + round 2: WHAT A CLEAN-UP COULD NOT TAKE BACK. Every step's answer is one of four: 'ok' · 'refused' (the
   *  browser answered an error while the tab's session is LIVE) · 'silent' (no answer in callTimeoutMs on a live session) ·
   *  'gone' (the socket or the session went, or the error names a gone session — measured on real Chrome, S12: a session that
   *  goes takes its virtual authenticators, keys and UV with it, so nothing is left there and nothing is said). */
  const PK_GONE_RE = /session with given id not found|no session with given id|target closed|not connected|session closed/i;
  const PK_NO_AUTH_RE = /could not find a virtual authenticator/i;
  const pkAnswer = (w, e, r) => { const live = w.state === 'open' && !!e.sid && w.sessions.has(e.sid); if (!r) return live ? 'silent' : 'gone'; if (!r.error && !r.timeout) return 'ok'; if (!live || (r.error && PK_GONE_RE.test(String(r.error.message || '')))) return 'gone'; return r.timeout ? 'silent' : 'refused'; };
  const pkWhy = (method, r, a) => `${method.replace(/^WebAuthn\./, '')}: ${a === 'silent' ? 'did not answer' : 'refused (' + String((r && r.error && r.error.message) || '?').slice(0, 120) + ')'}`;
  const pkTabName = (e) => tabName({ title: e.title, url: e.url }); // ONE name for a tab, in the server log and the tray alike (module-level tabName)
  /** THE LOOK (round 2): after a missed step, what the authenticator HOLDS NOW is read on the live session — what is said is what
   *  was seen. `ids` = the LENT keys it may hold (round 3: a key the page made itself is never counted as lent); `anyKey` = every
   *  key in it is a lent one (the agent's authenticator at the handover). Round 3: the user verification is a leftover too — a
   *  missed UV-off is tried once more and judged, whatever the keys. → null (nothing lent left: nothing to say) |
   *  { keys, uv: false | true | 'unchecked', unchecked: false | 'silent' | 'refused', why } — `unchecked` when the look itself
   *  got no answer ('silent') or an error ('refused'): two facts, two words. */
  async function pkLook(w, e, auth, ids, uvMissed, { anyKey = false } = {}) {
    const g = await call(w, 'WebAuthn.getCredentials', { authenticatorId: auth }, e.sid), a = pkAnswer(w, e, g);
    if (a === 'gone' || (a === 'refused' && PK_NO_AUTH_RE.test(String(g.error.message || '')))) return null; // the session or the authenticator went — it took them
    if (a !== 'ok') return { keys: ids.slice(), uv: uvMissed ? 'unchecked' : false, unchecked: a, why: [pkWhy('WebAuthn.getCredentials', g, a)] };
    const there = ((g.result && g.result.credentials) || []).map((c) => b64u(c.credentialId)).filter((id) => anyKey || ids.includes(id));
    let uv = false; const why = [];
    if (uvMissed) { const u = await call(w, 'WebAuthn.setUserVerified', { authenticatorId: auth, isUserVerified: false }, e.sid), b = pkAnswer(w, e, u); if (b === 'refused') uv = true; else if (b === 'silent') uv = 'unchecked'; if (b === 'refused' || b === 'silent') why.push(pkWhy('WebAuthn.setUserVerified', u, b)); }
    if (!there.length && uv === false) return null;
    return { keys: there, uv, unchecked: false, why };
  }
  /** A LEFTOVER (e.pk.left: its authenticator, the keys seen in it): said ONCE by name — the server log names the tab and each
   *  missed step — and the tab named to the person in the For-you tray. Round 2's law: the item lives EXACTLY as long as the
   *  leftover — ended by a later look that finds the tab clean (pkLeftCheck), the session or the browser going (detach, down()),
   *  the tab closing, the hub stopping (shutdown → down) or starting (create's sweep: an item whose tab this hub does not hold is
   *  not kept). Past PK_LEFT_MAX tabs of one browser, ONE item counts the rest. */
  const PK_LEFT_MAX = Math.max(1, Number(leftMax) || 3);
  const pkLeftKey = (w, e) => 'pk-left:' + w.profileId + ':' + e.targetId;
  function pkLeftSet(w, e, auth, seen, why) {
    const pid = w.profileId, name = pkTabName(e), was = e.pk.left;
    e.pk.left = { auth, keys: [...new Set([...(was && was.auth === auth ? was.keys : []), ...seen.keys])], uv: seen.uv, unchecked: seen.unchecked };
    const n = e.pk.left.keys.length, steps = [...new Set([...why, ...(seen.why || [])])].join('; ');
    say(pkLeftKey(w, e), seen.unchecked
      ? `${pid}: whether the passkey lent to the tab «${name}» was taken back could not be checked — the browser ${seen.unchecked === 'refused' ? 'refused to show what the tab holds' : 'did not answer'} (${steps})`
      : !n && seen.uv === 'unchecked'
        ? `${pid}: whether user verification on the tab «${name}» was turned off could not be checked — the browser did not answer (${steps})` // round 3: no key left, the UV unknown
        : `${pid}: the passkey lent to the tab «${name}» could not be taken back (${n} key${n === 1 ? '' : 's'}${seen.uv === true ? ', user verification on' : seen.uv === 'unchecked' ? ', user verification not checked' : ''}) — ${steps}`);
    pkLeftFile(w, e);
  }
  function pkLeftFile(w, e) {
    if (!forYou) return;
    const pid = w.profileId, L = w.pkLeft, tid = e.targetId;
    try {
      if (L.tabs.has(tid) || (!L.more.has(tid) && L.tabs.size < PK_LEFT_MAX)) L.tabs.set(tid, forYou.add?.(pid, PK.leftForYouItem({ tab: pkTabName(e), unchecked: e.pk.left.unchecked || (!e.pk.left.keys.length && e.pk.left.uv === 'unchecked' ? 'silent' : false), uvOnly: !e.pk.left.keys.length && e.pk.left.uv === true, itemKey: pkLeftKey(w, e) })) || null);
      else { L.more.add(tid); L.moreId = forYou.add?.(pid, PK.leftMoreItem({ n: L.more.size, itemKey: 'pk-left:' + pid + ':more' })) || null; }
    } catch (err) { say('pk-left-fy:' + (err && err.message), `the passkey line was not filed — ${err && err.message}`); }
  }
  /** The leftover ended (`how`: clean · closed · detached · down): its item resolved (or the count of the rest lowered), its
   *  once-key let go — a later leftover on this tab is a new one, said again. */
  function pkLeftEnd(w, e, how) {
    if (!e.pk.left) return;
    e.pk.left = null; sayOnce.delete(pkLeftKey(w, e));
    const L = w.pkLeft, tid = e.targetId;
    try {
      if (L.tabs.has(tid)) { const id = L.tabs.get(tid); L.tabs.delete(tid); if (id && forYou) forYou.resolve?.(id); }
      else if (L.more.delete(tid) && forYou) { if (!L.more.size) { if (L.moreId) forYou.resolve?.(L.moreId); L.moreId = null; } else L.moreId = forYou.add?.(w.profileId, PK.leftMoreItem({ n: L.more.size, itemKey: 'pk-left:' + w.profileId + ':more' })) || L.moreId; }
    } catch { /* the tray's own failure */ }
    if (how === 'clean') say('pk-left-clean:' + w.profileId + ':' + tid + ':' + now(), `${w.profileId}: the passkey left on the tab «${pkTabName(e)}» is gone now (a later clean-up found the tab clean)`);
  }
  /** A later clean-up on the tab LOOKS at the leftover's authenticator: none of its keys there (or the authenticator gone) ⇒
   *  the leftover ended; no answer ⇒ kept (nothing is said it is not known). */
  async function pkLeftCheck(w, e) {
    const L = e.pk.left; if (!L) return;
    const seen = await pkLook(w, e, L.auth, L.keys, L.uv === true || L.uv === 'unchecked'); // round 3: a UV left on is looked at (UV off once more) like the keys
    if (!seen) pkLeftEnd(w, e, pkAnswer(w, e, null) === 'gone' ? 'detached' : 'clean');
  }
  async function pkOnceGone(w, e, rec, left = null) {
    if (!(e.pk.once && e.pk.auth && w.mode === 'person' && e.pk.onceFor === rec)) return false;
    const heir = [...e.pk.holds].find(([r, x]) => r !== rec && r.outcome === 'pending' && x.auth === e.pk.auth);
    if (heir) { e.pk.onceFor = heir[0]; return false; }
    const id = e.pk.auth, pairs = e.pk.pairs; e.pk.auth = null; e.pk.once = false; e.pk.onceFor = null;
    const x = await call(w, 'WebAuthn.removeVirtualAuthenticator', { authenticatorId: id }, e.sid);
    const d = e.pk.pairs === pairs ? await call(w, 'WebAuthn.disable', {}, e.sid) : null; // r6: never the environment a newer ceremony paired in
    if (left) { const xa = pkAnswer(w, e, x), da = d ? pkAnswer(w, e, d) : null; if (xa === 'ok' || xa === 'gone' || da === 'ok' || da === 'gone') left.removed = true; else { left.auth = id; left.why.push(pkWhy('WebAuthn.removeVirtualAuthenticator', x, xa), ...(d ? [pkWhy('WebAuthn.disable', d, da)] : [])); } } // B-97ae walk (b): its removal (or the environment's) takes whatever a missed step left; round 2: a «did not answer» is never a «refused»
    return true;
  }
  /** A document went (a navigation, its contexts cleared): its pending ceremonies ended with it (PK.endPending) — no end of theirs
   *  will reach pkEnd (applyEvent matches only a pending record), so each goes through THE ONE END here. B-97ae walk (a): on BOTH
   *  roads — the agent's tab keeps its authenticator, never the key or the UV an ended ceremony loaded into it (before, only the
   *  person's once-authenticator left here: the agent's loaded key and UV stayed until that tab's next ceremony ended). */
  function pkPageGone(w, e, ended) {
    if (!ended.length) return;
    passkeyChanged(w, e);
    for (const rec of ended) { rec.pageGone = true; pkEnd(w, e, rec).catch((err) => say('pk-flow:' + (err && err.message), `${w.profileId}: a passkey ceremony step failed — ${err && err.message}`)); } // round 3: its drain tells no dead page
  }
  /** r7 (acceptance r6 MAJOR, both roads): a clean-up acts only on what ITS ceremony owns — the authenticator and the keys
   *  captured when it loaded (e.pk.holds), never the tab's live state. Its authenticator gone or replaced ⇒ nothing more (its
   *  keys went with it); on it everything goes (a key it made too) but a key or the UV another ceremony still PENDING holds there. */
  async function pkUnload(w, e, rec) {
    const own = e.pk.holds.get(rec); e.pk.holds.delete(rec);
    const prior = e.pk.left; // round 2: a leftover from before — this clean-up looks at it when it is done
    const left = { auth: own ? own.auth : null, ids: [], uvMissed: false, why: [], removed: false }; // B-97ae walk (b): the steps the browser did not do
    if (rec.loaded || rec.uvSet) {
      if (own && own.auth === e.pk.auth) {
        const kept = [...e.pk.holds].filter(([r, x]) => r.outcome === 'pending' && x.auth === own.auth).map(([, x]) => x), keptId = (id) => kept.some((x) => x.ids.includes(id));
        const g = await call(w, 'WebAuthn.getCredentials', { authenticatorId: own.auth }, e.sid), ga = pkAnswer(w, e, g);
        if (ga === 'refused' || ga === 'silent') { left.ids.push(...own.ids.filter((id) => !keptId(id))); left.why.push(pkWhy('WebAuthn.getCredentials', g, ga)); }
        for (const c of (g && g.result && g.result.credentials) || []) if (!keptId(b64u(c.credentialId))) { const cid = b64u(c.credentialId), x = await call(w, 'WebAuthn.removeCredential', { authenticatorId: own.auth, credentialId: c.credentialId }, e.sid), xa = pkAnswer(w, e, x); if (xa === 'refused' || xa === 'silent') { if (own.ids.includes(cid)) { left.ids.push(cid); left.why.push(pkWhy('WebAuthn.removeCredential', x, xa)); } else say('pk-page-key:' + w.profileId + ':' + e.targetId + ':' + cid, `${w.profileId}: a passkey the page made on the tab «${pkTabName(e)}» could not be removed from it — ${pkWhy('WebAuthn.removeCredential', x, xa)}`); } } // round 3: a key the PAGE made is never «the passkey VibeSpace lent» — said as what it is
        if (own.uv && !kept.some((x) => x.uv)) { const u = await call(w, 'WebAuthn.setUserVerified', { authenticatorId: own.auth, isUserVerified: false }, e.sid), ua = pkAnswer(w, e, u); if (ua === 'refused' || ua === 'silent') { left.uvMissed = true; left.why.push(pkWhy('WebAuthn.setUserVerified', u, ua)); } }
      }
      if (!rec.refused) pkTrace(w, e, rec, rec.outcome, rec.harvested ? { harvested: true } : {});
    }
    await pkOnceGone(w, e, rec, left); // acceptance r1: the vault ceremony's authenticator leaves with it — Chrome's own window for their next one
    if (left.why.length && !left.removed && left.auth) { const seen = await pkLook(w, e, left.auth, left.ids, left.uvMissed); if (seen) pkLeftSet(w, e, left.auth, seen, left.why); } // B-97ae walk (b) + round 2: a missed step is LOOKED at — what is said is what was seen
    if (prior && e.pk.left === prior) await pkLeftCheck(w, e); // round 2: a leftover from before ends when a later clean-up finds the tab clean
    if (!rec.pageGone) await pkCtl(w, e, rec, 'drained'); // round 3: a page that went (a document destroyed, cleared, crashed) has no hook to tell — a call would look for its dead context and wait out callTimeoutMs before the next sign-in on the tab
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
    if (!pkWrite(PS.withRow(store, pid, nr))) return say('pk-harvest-unstored:' + pid, pkHeld() ? `${pid}: a new passkey was NOT stored — the passkey store could not be read; the site may hold a passkey VibeSpace does not` : `${pid}: a new passkey is kept in memory but NOT saved to disk yet — the store's write failed`);   // r3632 (should): the belt says it; r3702 MUST: never the site in the journal
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
  /** r10 (acceptance r9 MINOR 1): a later answer took back this card's «Allow once» before it was used — the card says so («withdrawn
   *  by your later answer at HH:MM»: `withdrawnAt` on the card the chat, the live banner and a rebuild draw) and its For-you item's
   *  record carries the end (`ended` = the store's noteFact: {endedAt, endedBy 'later-answer'}; the tray row words it). */
  function pkGrantWithdrawn(a, t) {
    if (a.card.withdrawnAt) return;
    a.card.withdrawnAt = t;
    if (a.itemId && forYou) { try { forYou.ended?.(a.itemId, { endedAt: t, endedBy: 'later-answer' }); } catch { /* the tray's own failure */ } }
    emit({ kind: 'passkey-proposal', profileId: a.profileId, card: a.card, browserKey: a.browserKey, sessionId: a.sessionId, block: PS.cardBlock(a.card, a.at) });
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
      const gk = a.profileId + ' ' + PS.grantKey(a.card.rpId, a.browserKey || ''), t = now();
      for (const [k, x] of pkAnswered) if (x.expiresAt <= t) pkAnswered.delete(k); // (an answer past its 10 min outranks only grants that are expired themselves)
      const prev = pkAnswered.get(gk), told = prev && !prev.used ? pkGrantAsk.get(prev) : null; // r10 (acceptance r9 MINOR 1): an «Allow once» neither used nor past its 10 min (pruned above) — standing, or taken by a ceremony still waiting — is taken back by this answer
      const last = choice === 'once' ? PS.grantOf({ rpId: a.card.rpId, browserKey: a.browserKey, user: a.card.user.name, now: t }) : { choice, at: t, expiresAt: t + PS.GRANT_MS };
      if (choice === 'once') { pkGrants.set(gk, last); pkGrantAsk.set(last, a); } else pkGrants.delete(gk); // r9 (acceptance r8 MAJOR): the owner's LATEST answer for that site and conversation stands — a «no» ends a grant still standing at the key too
      pkAnswered.set(gk, last);
      if (told) pkGrantWithdrawn(told, t);
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
    pkRead(); if (pkHeld()) return { ok: false, code: 'passkeys_unread', status: 503, error: PK.refusedText('passkeys_unread', rp) };   // r3261: HELD — no registration is proposed over a store that could not be read
    if (PS.profileOf(pkRead(), pid).agentsOff) return { ok: false, code: 'passkeys_off', error: PK.refusedText('profile-switch', rp) };
    const bk = String(browserKey || '').replace(/\.\d+$/, '');
    const live = [...pkAsks.values()].find((x) => x.state === 'open' && x.card.kind === 'register' && x.profileId === pid && x.card.rpId === rp && x.browserKey === bk);
    const a = live || pkNewAsk({ kind: 'register', profileId: pid, rpId: rp, user: user ? { name: user, displayName: user } : null, browserKey: bk, sessionId });
    if (!live) { a.beat = setTimeout(() => pkClose(a, 'expired'), PS.ASK_MS); if (a.beat.unref) a.beat.unref(); }
    if (waitMs > 0 && a.state === 'open') await new Promise((res) => { const t = setTimeout(() => { a.waiters = a.waiters.filter((f) => f !== done); res(); }, waitMs); if (t.unref) t.unref(); const done = () => { clearTimeout(t); res(); }; a.waiters.push(done); });
    return { ok: true, proposal: a.card, state: a.state === 'answered' ? (a.card.answer === 'once' ? 'approved' : 'rejected') : a.state };
  }
  /** The table as it may leave the server (publicRow only) + the profile's switch. */
  function passkeyList(profileId) { if (pks) pkRead(); if (pkHeld()) return { held: pkHeldFacts(), keys: null, agentsOff: null, displaced: 0, asks: [] }; /* r3261: HELD — said in place, never an empty list */ const p = PS.profileOf(pkRead(), String(profileId || '')); return { ...(pkDamaged ? { damaged: { ...pkDamaged } } : {}), agentsOff: p.agentsOff, keys: p.rows.map(PS.publicRow), displaced: (pkDisplacedAt.get(String(profileId || '')) || []).filter((at) => now() - at < 3600e3).length, asks: [...pkAsks.values()].filter((a) => a.state === 'open' && a.profileId === String(profileId || '')).map((a) => a.card) }; }
  /** lane vault-contents-window: THE VAULT WINDOW's rows of the passkey store — one per stored private key (its site and
   *  user; the sealed key rides only to the length class); `passkeyVaultReveal` opens ONE (entry = `<profile>/<credential
   *  id's first 40 characters>`). */
  function passkeyVaultRows() {
    if (!pks) return [];
    pkRead(); if (pkHeld()) throw Object.assign(new Error(pkStoreHold.words()), { code: 'passkeys_unread' });   // r3261: HELD — the Vault window says the store's error, never «no passkey»
    const out = [];
    for (const [pid, p] of Object.entries(pkRead().profiles || {})) for (const r of p.rows || []) out.push({ entry: `${pid}/${String(r.credentialId).slice(0, 40)}`, field: 'privateKey', kind: 'private-key', label: r.userName ? `${r.rpId} · ${r.userName}` : r.rpId, detail: pid, createdAt: r.createdAt || null, cipher: r.keySealed });
    return out;
  }
  function passkeyVaultReveal(entry, field) {
    const i = String(entry || '').indexOf('/');
    if (!pks || field !== 'privateKey' || i < 1) return null;
    pkRead(); if (pkHeld()) throw Object.assign(new Error(pkStoreHold.words()), { code: 'passkeys_unread' });   // r3261: HELD — never «no such key»
    const pid = String(entry).slice(0, i), cid = String(entry).slice(i + 1);
    const rows = (PS.profileOf(pkRead(), pid).rows || []).filter((r) => String(r.credentialId).slice(0, 40) === cid);
    if (rows.length !== 1) return null;
    const v = pks.cipher.open(rows[0].keySealed);
    if (v && typeof v === 'object' && v.ok === false) throw Object.assign(new Error(v.words || v.code), { code: v.code });
    return typeof v === 'string' ? v : null;
  }
  /** `forget`: an agent removes only keys an AGENT registered; the owner removes any. */
  function passkeyForget(profileId, ref, { by = 'agent' } = {}) {
    const pid = String(profileId || ''); pkRead(); if (pkHeld()) return pkHeldRefusal('removing a passkey');   // r3261: HELD — never «not-found»
    const rows = PS.findRows(PS.profileOf(pkRead(), pid).rows, ref);
    if (!rows.length) return { ok: false, code: 'not-found', error: `this profile holds no passkey "${String(ref || '').slice(0, 80)}" — \`vibespace-browser passkey list\`` };
    if (by !== 'user' && rows.some((r) => r.createdBy === 'human')) return { ok: false, code: 'owner_key', error: 'a passkey the owner registered is removed only by the owner (the Agent browser panel)' };
    const ids = new Set(rows.map((r) => r.credentialId));
    const d = PS.dropRows(pkRead(), pid, (r) => ids.has(r.credentialId)); pkWrite(d.store); emit({ kind: 'passkeys', profileId: pid });
    return { ok: true, removed: d.rows.map(PS.publicRow) };
  }
  function passkeyPolicy(profileId, id, policy) {
    pkRead(); if (pkHeld()) return pkHeldRefusal('changing a passkey\'s policy');   // r3261: HELD — never «no passkey»
    const pid = String(profileId || ''); const rows = PS.findRows(PS.profileOf(pkRead(), pid).rows, id);
    if (rows.length !== 1 || !PS.POLICIES.includes(policy)) return { ok: false, code: rows.length ? 'bad-request' : 'not-found', error: rows.length ? `policy is ${PS.POLICIES.join(' | ')}` : `no passkey ${id}` };
    pkWrite(PS.setPolicy(pkRead(), pid, rows[0].credentialId, policy)); emit({ kind: 'passkeys', profileId: pid });
    return { ok: true, key: PS.publicRow(PS.profileOf(pkRead(), pid).rows.find((r) => r.credentialId === rows[0].credentialId)) };
  }
  /** lane passkey-ui: each profile's passkey count (the panel's "Passkeys (n)…") — counts only, never a row. */
  /** int258: the chat cards of ONE conversation's browser key, open and decided (a rebuild draws each with its latest state,
   *  like the keeper's proposal cards) — in memory, as the asks are: a server stop ends them. */
  function passkeyCards(browserKey) { const k = String(browserKey || ''); return k ? [...pkAsks.values()].filter((a) => String(a.browserKey || '').replace(/\.\d+$/, '') === k).sort((x, y) => x.at - y.at).map((a) => PS.cardBlock(a.card, a.at)) : []; }
  function passkeyCounts() { if (!pks) return {}; pkRead(); if (pkHeld()) return null; /* r3261: HELD — the count is UNKNOWN, never 0 */ const s = pkRead(); const out = {}; for (const pid of Object.keys(s.profiles || {})) out[pid] = PS.profileOf(s, pid).rows.length; return out; }
  function passkeySwitch(profileId, on) { if (pks) { pkRead(); if (pkHeld()) return pkHeldRefusal('turning passkeys on or off for agents'); } /* r3261: HELD — refused by name, nothing written */ const pid = String(profileId || ''); pkWrite(PS.setAgentsOff(pkRead(), pid, !!on)); emit({ kind: 'passkeys', profileId: pid }); return { ok: true, agentsOff: !!on }; }
  /** `removeProfile`: the profile's keys go with it (said in the removal answer). */
  function dropPasskeys(profileId) { const pid = String(profileId || ''); if (pid) clearProfileLoginFencesOnStop(pid, watches.get(pid)); if (!pks) return 0; pkRead(); if (pkHeld()) throw Object.assign(new Error(pkStoreHold.words()), { code: 'passkeys_unread' }); /* r3261: HELD — a removed profile's keys are never «dropped» over an unread store (the keeper asks passkeysHeld first) */ const d = PS.dropProfile(pkRead(), pid); if (d.removed || pkRead().profiles[pid]) pkWrite(d.store); return d.removed; }
  function setTabsOf(fn) { tabsFn = typeof fn === 'function' ? fn : null; }
  /** r4 #2: the orphan tabs of a browser and what they hold (a diagnostic read — the suites, `stats`). */
  function orphansOf(profileId, scope = new Set(['-'])) { const w = watches.get(String(profileId || '')); const ob = orphanBusy(w, scope); return { orphans: ob.orphans ? [...ob.orphans] : [], loop: ob.loop ? ob.loop.targetId : null, busy: ob.busy, loading: w && ob.orphans ? (loadingIn(w.profileId, ob.orphans) || null) : null, open: w && ob.orphans ? !!openIn(w.profileId, ob.orphans) : false }; }
  function stats() { return [...watches.values()].map((w) => ({ profileId: w.profileId, state: w.state, tabs: w.targets.size, enabled: [...w.targets.values()].filter((e) => e.enabled).length, held: [...w.targets.values()].filter((e) => e.heldAt).length, open: [...w.open.values()].map((d) => ({ id: d.id, type: d.type })), answered: w.answered.length, loops: [...w.targets.values()].filter((e) => e.loop).length, kernel: w.kernel ? { protocol: w.kernel.protocol, features: w.kernel.features } : w.kernel, surfaces: [...w.surf.values()].map((x) => ({ id: x.id, kind: x.kind, cls: x.cls })), nativeIgnored: w.nativeIgnored })); } // lane browser-surfaces
  function shutdown() { if (pkStoreHold) pkStoreHold.stop(); for (const w of [...watches.values()]) { try { w.ws && w.ws.close(1001); } catch { /* */ } down(w, 'the server is restarting', { keepNotices: true }); } stashedTabFencesByProfile.clear(); stashedSnapshotsByProfile.clear(); snapSlots.clear(); try { LF().clearAllFilledSecrets?.(); } catch { /* */ } for (const x of waiters) x.resolve(null); waiters.clear(); }

  // ── lane browser-ui-prompts (B-ebfc): THE BROWSER'S OWN PROMPTS — hooked on every enabled tab of this socket ──
  // MEASURED (0.38.1 + Chrome 154, headless and the hidden window): intercepted, a chooser reports `Page.fileChooserOpened` in
  // ≤ 5 ms and the page runs on; the CLI's own `upload` (DOM.setFileInputFiles on ITS session) still lands while we intercept.
  // Fetch pauses DOCUMENT requests only (a sub-resource never waits on this socket; on '*' a 100-image page cost +12 ms); a
  // sign-in on a sub-resource is not caught (named in the kb table).
  /** B-9584 U2c: the place the keeper's hold keeps on this browser's every tab (a place, or «blocked»), or null — never replaced here. */
  /** r2311 (i): the place hold grants again (the keeper's door; a profile with no held place, or a hold not held, does nothing). */
  function regrantPlace(pid) { try { if (keeper && typeof keeper.geoRegrant === 'function') Promise.resolve(keeper.geoRegrant(String(pid || ''))).catch(() => { }); } catch { /* the hold's own */ } }
  function placeHeld(pid) { try { return keeper && typeof keeper.geoHeldFor === 'function' ? keeper.geoHeldFor(String(pid || '')) : null; } catch { return null; } }
  function armPrompts(w, e) {
    if (!e.sid) return;
    call(w, 'Page.setInterceptFileChooserDialog', { enabled: true }, e.sid).then((r) => { if (r && r.error) say('fc:' + r.error.message, `${w.profileId}: the file chooser was not hooked — ${r.error.message}`); });
    syncTabFetchMode(w, e);
    const geo = [...w.grants.values()].find((g) => g.kind === 'geolocation' && g.setting === 'granted'); if (geo && !placeHeld(w.profileId)) call(w, 'Emulation.setGeolocationOverride', geo.position || {}, e.sid); // lane browser-ui-prompts-r2 · B-9584 U2c: a held place is never replaced
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
  /** A sign-in unanswered PROMPT_ASK_MS ⇒ ONE For-you item (a human must type it); resolved when it ends. B-ebb7: the detail is
   *  an ARRAY of lines (user-todos' normalizeI18n refuses an object — the item was never filed from 2.369.237 to this cure). */
  function promptAsk(w, rec) {
    if (!forYou || w.prompts.get(rec.targetId) !== rec || w.promptForYou.has(rec.id)) return;
    if (w.mode === 'person') return; // B-b56d (its read): the person's own browsing — the person's window shows the form (and says the bound); a tray item there is noise
    let label = null; try { label = labelOf ? labelOf(w.profileId) : null; } catch { label = null; }
    const host = ST.hostOf(rec.origin) || rec.origin;
    const text = 'A page in the agent browser asks you to sign in ({host})'; const detail = 'Open its live view and type the username and password there — the agent never sees them.';
    let id = null; try { id = forYou.add?.(w.profileId, { text: text.replace('{host}', host) + (label ? ` — ${String(label).slice(0, 80)}` : ''), detail, i18n: { text: { key: text, params: { host } }, detail: [{ key: detail }] }, itemKey: `${PROMPT_FY_KEY}${w.profileId}:${rec.id}:${rec.openedAt}` }); } catch (err) { say('prm-fy:' + (err && err.message), `the sign-in For-you item was not filed — ${err && err.message}`); }
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
  /** B-b56d (its read, S1): a held sign-in of the person's that the page itself abandoned (its tab committed another document): the
   *  record goes and the tab's hook is read again — no CancelAuth (that request is gone), no note, never «VibeSpace cancelled it».
   *  B-1327: a conversation's held sign-in alike (the agent's watch keeps its hook: the read changes nothing there) */
  function dropHeldAuth(w, e, rec) { w.authReq.delete(rec.id); dropPrompt(w, rec, 'gone'); if (e && e.sid && e.enabled) syncTabFetchMode(w, e); }
  /** The credential goes to Chrome and nowhere else: never logged, never in a record, a note or an answer. */
  async function settleAuth(w, rec, { how, by, username = '', password = '' }) {
    const q = w.authReq.get(rec.id); w.authReq.delete(rec.id);
    dropPrompt(w, rec, how);
    if (!q) return { ok: false, code: 'gone', error: 'the sign-in already ended' };
    const r = await call(w, 'Fetch.continueWithAuth', { requestId: q.requestId, authChallengeResponse: how === 'signed-in' ? { response: 'ProvideCredentials', username: String(username).slice(0, 512), password: String(password).slice(0, 1024) } : { response: 'CancelAuth' } }, q.sid || null);
    const took = !(r && (r.error || r.timeout)); // B-b56d (its read, S1): did Chrome take the answer? (a request the page abandoned did not)
    if (took || w.mode !== 'person') { w.promptNotes.push({ id: rec.id, prompt: rec, how, by, at: now(), targetId: rec.targetId, person: w.mode === 'person', boundMs: authHoldMaxMs }); if (w.promptNotes.length > ANSWERED_KEEP) w.promptNotes.shift(); } // the agent's road as before; the person's: a note only for an answer Chrome took
    if (w.mode === 'person') { const e = w.targets.get(rec.targetId); if (e && e.sid && e.enabled) syncTabFetchMode(w, e); } // B-b56d: after Chrome has the answer — the hook it held for goes when no window of the person shows the browser
    if (how === 'expired' && took) emit({ kind: 'prompt-ended', profileId: w.profileId, targetId: rec.targetId, how }); // B-b56d (law 4): the person's window SAYS it (its note is kept by now) — whatever the mode now
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
    // B-9584 U2c: a profile whose location the PERSON set (a place, or «blocked») — the profile's own stored denial, the keeper's hold
    // adding the place. NOBODY here allows a site the location there (an agent's verb, a press in the live view): a grant beside a hold
    // that drops, or beside a tab left unplaced, would read this machine's REAL position. Refused by name; a deny is a denial and stands;
    // the place's own road (the person lets a site know it) is a later step. Nothing here replaces or clears the place
    const held = v.kind === 'geolocation' ? placeHeld(pid) : null;
    if (held && v.setting === 'granted') return { ok: false, code: 'place_held', error: held.kind === 'blocked' ? "this profile's location is blocked (its Environment, set by the person) — a site is never allowed the location here" : "this profile's location is set by the person (its Environment) — no site is allowed the location here by an agent: only the sites the person lists in its Environment read the place, every other site reads it as blocked" };
    const ctxs = [...w.permCtx.keys()];
    for (const c of ctxs.length ? ctxs : ['']) { const r = await call(w, 'Browser.setPermission', { permission: v.permission, setting: v.setting, origin: v.origin, ...(c ? { browserContextId: c } : {}) }); if (r && (r.error || r.timeout)) return { ok: false, code: 'cdp', error: `Chrome did not take the decision — ${r.error ? r.error.message : 'timed out'}` }; }
    if (v.kind === 'geolocation' && !held) for (const e of [...w.targets.values()]) if (e.sid) await call(w, v.setting === 'granted' ? 'Emulation.setGeolocationOverride' : 'Emulation.clearGeolocationOverride', v.setting === 'granted' ? (v.position || {}) : {}, e.sid);
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
    if (w.mode === 'person') return; // acceptance r1 of lane passkey-browse-yourself: on the agent's watch only — the person's own print preview is his
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
    pkRead(); if (pkHeld()) return pkKernelRefuse(w, e, rec, 'passkeys_unread');   // r3261 (a)/(b): HELD — no key is made and none signs: the page told not allowed, the agent told the hold
    const part = PS.profileOf(pkRead(), pid), owner = pkOwner(w, e);
    const gk = pid + ' ' + PS.grantKey(rec.rpId, owner || '');
    const v = PS.gateVerdict({ kind: rec.conditional ? 'conditional' : rec.kind, rpId: rec.rpId, origin: q.origin, rows: part.rows, grant: pkGrants.get(gk) || null, input: { allow: rec.allow || [] }, answer: rec.answer || null, profileSwitch: part.agentsOff, takeover: rec.by === 'human', now: now() });
    if (v.verdict === 'refuse') return pkKernelRefuse(w, e, rec, v.why);
    if (v.verdict === 'ask') return pkAsk(w, e, rec, v.rows);
    const f = PS.kernelFlags(v, { kind: rec.kind, answer: rec.answer || null, takeover: rec.by === 'human', userVerification: q.userVerification });
    if (f.ask) return pkAsk(w, e, rec, v.load); // the page REQUIRES UV and nobody decided this ceremony: the owner's card is the verification
    let taken = null; if (v.consumeGrant) { taken = pkGrants.get(gk) || null; pkSpend(taken); pkGrants.delete(gk); } // r11 (acceptance r10 MAJOR): spent here — the key is made at once
    // B-d981: a failure AFTER the verdict that provably reached the site with nothing (the key not made, not stored, the kernel refused
    // the answer as gone) gives the owner's «once» back as it was — while it is still the owner's latest answer and inside its 10 minutes
    const giveBack = () => { if (taken && pkAnswered.get(gk) === taken && now() <= taken.expiresAt) { taken.used = false; pkGrants.set(gk, taken); } };
    return rec.kind === 'create' ? pkKernelCreate(w, e, rec, v, f, giveBack) : pkKernelSign(w, e, rec, v, f);
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
  async function pkKernelCreate(w, e, rec, v, f, giveBack = () => {}) {
    const q = rec.kernel, pid = w.profileId;
    const m = WA().makeCredential({ crypto, rpId: rec.rpId, user: q.userId ? { id: q.userId } : null, flags: f });
    const sealed = PS.seal(pks.cipher, m.privateKeyPkcs8.toString('base64')), refused = PS.keyRefusal(sealed);
    m.privateKeyPkcs8.fill(0);
    if (refused) { pkKeyRefused(w, rec, refused); giveBack(); return pkKernelRefuse(w, e, rec, 'webauthn_key_locked'); } // B-d981: no key made — the grant back
    pkKeyOk();
    const row = PS.normalizeRow({ credentialId: WA().b64u(m.credentialId), rpId: rec.rpId, userHandle: q.userId, userName: rec.user && rec.user.name, displayName: rec.user && rec.user.displayName, keySealed: sealed, signCount: 0, createdBy: v.createdBy === 'human' ? 'human' : 'agent', bySession: pkOwner(w, e), createdAt: now(), policy: PS.NEW_KEY_POLICY });
    if (!row || !pkWrite(PS.withRow(pkRead(), pid, row))) { if (row) pkCache = PS.normalizeStore(PS.dropRows(pkRead(), pid, (x) => x.credentialId === row.credentialId).store); say('pk-new:' + pid, `${pid}: a new passkey was not stored — the page was told it was not allowed`); giveBack(); await pkKernelAnswer(w, e, rec, { error: 'NotAllowedError' }); return pkKernelEnd(w, e, rec, 'error', 'NotAllowedError'); }
    rec.createdBy = row.createdBy; rec.userName = row.userName; rec.uv = f.uv; rec.harvested = true;
    pkUse(w, e, rec, `register a passkey on ${rec.rpId}`);
    const r = await pkKernelAnswer(w, e, rec, { create: { credentialId: row.credentialId, attestationObject: WA().b64u(m.attestationObject) } });
    if (!r.ok) { rec.harvested = false; pkWrite(PS.dropRows(pkRead(), pid, (x) => x.credentialId === row.credentialId).store); if (KERNEL_GONE_CODES.includes(r.code)) giveBack(); } // B-d981: the kernel said the request was gone ⇒ the site never got the key (a timeout stays spent: it may have)
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
      w.kernelWhy = null;
      say('kernel:' + w.profileId, `${w.profileId}: a browser kernel with VibeSpace surfaces (protocol 1, ${feats.join(' + ')}) — its page prompts are read from its surfaces`);
      const unknown = w.kernel.kinds.filter((k) => !SF().SURFACE_KINDS.includes(k));
      if (unknown.length) say('kinds:' + w.profileId, `${w.profileId}: the kernel names ${unknown.length} surface kind(s) VibeSpace does not know (${unknown.slice(0, 4).join(', ')}) — each is a generic card`);
    } else {
      w.kernel = false;
      // B-cf42: WHY it is today's road — «not a method» ONLY by CDP's own code (-32601: standard Chrome); any other error (the watch
      // not connected, a send that failed) is no answer about the kernel; `kernelSaid` = what a kernel that DID answer offers
      w.kernelWhy = v && v.error ? (Number(v.error.code) === -32601 ? 'no-method' : 'error') : v && v.timeout ? 'timeout' : r && Number(r.protocol) !== 1 ? 'protocol' : 'no-surfaces';
      w.kernelSaid = r && Number(r.protocol) === 1 ? feats : [];
      say('kernel:' + w.profileId, `${w.profileId}: no VibeSpace surfaces on this browser (${v && v.error ? 'VibeSpace.getVersion is not a method here' : v && v.timeout ? 'VibeSpace.getVersion did not answer' : r && Number(r.protocol) !== 1 ? `protocol ${String(r.protocol).slice(0, 8)}` : 'no surfaces feature'}) — today's dialog road`);
    }
    if (!(v && v.timeout)) kernelOf.set(w.profileId, w.kernel); // never asked again for this browser (a silent socket is asked on the next one)
    crossCheckEngine(w);
  }
  /** P0's hand-over (design §1.2): a profile whose browser is an ENGINE plugin has TWO answers about its kernel — the engine's own
   *  probe (the registry) and the live `VibeSpace.getVersion` — a disagreement is ONE journal line; the live answer rules.
   *  B-cf42: and said where the owner looks — every answer is handed to the keeper (`noteEngineLive`: a disagreement marks the
   *  profile — its Agent browser panel row, its engine's card — and files ONE For-you item per engine version; an agreeing
   *  answer clears the mark). A socket that never answered is no answer (nothing handed). */
  function crossCheckEngine(w) {
    let choice = null; try { const b = keeper && typeof keeper.browserOf === 'function' ? keeper.browserOf(w.profileId) : null; choice = b && b.browserChoice && b.browserChoice.kind === 'plugin' ? b.browserChoice : null; } catch { choice = null; }
    if (!choice || typeof keeper.engineFactOf !== 'function') return;
    Promise.resolve(keeper.engineFactOf(String(choice.id || ''))).then((fact) => {
      if (!fact || fact.code) return;
      const pf = Array.isArray(fact.features) ? fact.features.map((x) => String(x).slice(0, 40)).sort() : [], lf = w.kernel ? [...w.kernel.features].sort() : [];
      const pk = Array.isArray(fact.kinds) ? fact.kinds.length : 0, lk = w.kernel ? w.kernel.kinds.length : 0;
      if (JSON.stringify(pf) !== JSON.stringify(lf) || pk !== lk) say('engine-x:' + w.profileId, `${w.profileId}: the engine ${String(choice.id).slice(0, 80)}'s probe says features [${pf.join(', ')}] and ${pk} kinds, its live kernel [${lf.join(', ')}] and ${lk} — the live answer rules`);
      if (w.kernelWhy !== 'timeout' && w.kernelWhy !== 'error' && typeof keeper.noteEngineLive === 'function') keeper.noteEngineLive(w.profileId, { engine: String(choice.id || ''), version: fact.measuredVersion || fact.version || null, label: fact.label || null, why: w.kernel ? null : w.kernelWhy || null, probe: pf, live: w.kernel ? lf : [...(w.kernelSaid || [])].sort() });
    }).catch(() => { /* the probe's own refusal is the keeper's to say */ });
  }
  /** THE THREE-TOUCH RULE on one page session (every attach, every re-ask of a held tab): ① `VibeSpace.enable {surfaces:true}`
   *  ② `VibeSpace.listSurfaces {targetId}` aligns `w.surf` (③ the CLI's long-poll is module-wide — it re-arms by itself). */
  async function armSurfaces(w, e) {
    if (!e.sid || w.mode === 'person') return; // acceptance r1 of lane passkey-browse-yourself: the person's watch never turns his prompts into surfaces (a kernel's policy answers are the agent's)
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
    { const eS = w.targets.get(tid); const lfS = eS ? effectiveLiveFillOf(eS) : null; if (lfS) rec.fencedAt = { urlAtFill: String(lfS.urlAtFill || tabLoginUrlOf(eS) || '') }; }   // lane chrome-157 (round 32): a kernel's dialog on a fenced tab — its words are the fenced document's
    w.surf.set(rec.id, rec);
    if (w.surf.size > 256) { const old = w.surf.keys().next().value; const x = w.surf.get(old); w.surf.delete(old); surfaceAskDone(w, x); }
    const sink = SF().sinkOf(rec.kind, w.kernel);
    if (sink === 'webauthn') { rec.passkey = true; return pkSurface(w, rec); } // lane passkey-sink: the passkey record stands for it — never a second dialog_open, never a browser-surface card
    if (sink === 'credentials') rec.sink = sink; // m1: DOM credential notes only; http-auth stays owner-answered like standard Chrome
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
  // ── lane browser-login r22 («agent locates, hub fills»): ONE CDP PRIMITIVE FOR STANDARD CHROME & CUSTOM KERNEL ──
  function loginSinks(w) { return !!(w && w.kernel && Array.isArray(w.kernel.features) && w.kernel.features.includes('credentials')); }
  const stripHash = (u) => String(u || '').split('#')[0];
  const tabLoginUrlOf = (e) => String((e && (e.loginNavUrl || e.url)) || '');

  function onOwnerTakeoverSubmit(w, tid, p) {
    const e = tid ? w.targets.get(tid) : null;
    const rawPw = p && typeof p.password === 'string' ? p.password : null;
    if (p) p.password = undefined;
    if (!e || !loginSinks(w) || !logins || typeof logins.offerOwnerSaveCard !== 'function') return;
    if (!pkTakeover(w, e)) return;
    const pageOrigin = (p && (p.pageOrigin || p.origin)) || tabLoginUrlOf(e);
    const uname = p && p.usernameHint !== undefined && p.usernameHint !== null ? p.usernameHint : (p && p.username);
    if (!rawPw) {
      say('takeover-save-dropped:' + w.profileId + ':missing_secret', `${w.profileId}: takeover credentialSubmitted dropped (bad_request: missing credential)`);
      try { logins.noticeTakeoverSaveDropped?.({ origin: pageOrigin, code: 'bad_request', why: 'missing credential', profileId: w.profileId }); } catch { /* */ }
      return;
    }
    try {
      const r = logins.offerOwnerSaveCard({ origin: pageOrigin, username: uname, password: rawPw, profileId: w.profileId });
      if (!r || !r.ok) {
        const code = (r && r.code) || 'bad_request';
        const why = (r && r.error) || code;
        say('takeover-save-dropped:' + w.profileId + ':' + code, `${w.profileId}: takeover save-login card not offered (${code}: ${why})`);
        try { logins.noticeTakeoverSaveDropped?.({ origin: pageOrigin, code, why, profileId: w.profileId }); } catch { /* */ }
      }
    } catch (err) {
      say('takeover-save-err:' + w.profileId, `${w.profileId}: takeover save-login card failed — ${err && err.message}`);
    }
  }

  function resolveKnownTargetId(w, rawTid) {
    if (!rawTid) return null;
    const s = String(rawTid).trim().slice(0, 64);
    if (!s) return null;
    if (!w) return s;
    if (w.targets.has(s)) return s;
    const up = s.toUpperCase();
    for (const k of w.targets.keys()) if (k.toUpperCase() === up) return k;
    if (/^[0-9A-F]{4,}$/i.test(s)) {
      const hits = [];
      for (const k of w.targets.keys()) if (k.toUpperCase().startsWith(up)) hits.push(k);
      if (hits.length === 1) return hits[0];
    }
    return null;
  }
  function noteActiveTarget(profileId, browserKey = null, targetId = null) {
    const pid = String(profileId || '');
    if (!pid || !targetId) return;
    const w = watches.get(pid);
    const tid = w ? resolveKnownTargetId(w, targetId) : String(targetId).trim().slice(0, 64);
    if (!tid) return;
    let m = activeTabByProfile.get(pid);
    if (!m) { m = new Map(); activeTabByProfile.set(pid, m); }
    m.set(parentKey(browserKey) || '*', { tid, at: now(), moveSeq: tabMoveSeq }); // r2992 (5): the movers' count at the ack — a later mover outranks it by number
  }
  function noteActiveTab(target, targetId) {
    if (!target || !target.profileId || !targetId) return;
    noteActiveTarget(target.profileId, target.browserKey, targetId);
  }
  function activeTabEntryOfProfile(profileId, browserKey = null) {
    const m = activeTabByProfile.get(String(profileId || ''));
    if (!m) return null;
    const bk = parentKey(browserKey);
    const v = bk ? m.get(bk) : m.get('*');
    return v && v.tid ? v : null;
  }
  function activeTabOfProfile(profileId, browserKey = null) {
    const v = activeTabEntryOfProfile(profileId, browserKey);
    return v ? v.tid : null;
  }
  function dropActiveTarget(profileId, targetId) {
    const m = activeTabByProfile.get(String(profileId || ''));
    if (!m || !targetId) return;
    const up = String(targetId).toUpperCase();
    for (const [k, v] of [...m.entries()]) if (v && String(v.tid || '').toUpperCase() === up) m.delete(k);
  }
  function extractArgvTab(argv) {
    if (!Array.isArray(argv)) return null;
    for (let i = 0; i < argv.length; i++) {
      const a = String(argv[i] || '');
      if ((a === '--tab' || a === '--target') && argv[i + 1] && !String(argv[i + 1]).startsWith('-')) return String(argv[i + 1]).slice(0, 64);
      const eq = /^--(?:tab|target)=(.+)$/.exec(a);
      if (eq && eq[1]) return eq[1].slice(0, 64);
    }
    return null;
  }
  function allowVerbInFlight(profileId, browserKey = null) {
    const pid = String(profileId || '');
    if (!pid) return null;
    const t = now();
    const want = browserKey ? parentKey(browserKey) : null;
    for (const [bk, r] of running) {
      if (want && parentKey(bk) !== want) continue;
      const o = r && r.on ? r.on[pid] : null;
      if (!o || !(o.n > 0) || t - (o.at || 0) > WITNESS_MS) continue;
      if (o.verb && BL().liveFillAllowsVerb(o.verb)) return String(o.verb);
    }
    return null;
  }
  function recordFenceAudit(profileId, fence, why) {
    const pid = String(profileId || '');
    const row = {
      at: now(), profileId: pid,
      targetId: (fence && fence.targetId) || null,
      loginId: (fence && fence.loginId) || null,
      origin: (fence && fence.origin) || null,
      why: String(why || 'ended').slice(0, 48),
    };
    fenceAuditLines.push(row);
    if (fenceAuditLines.length > 64) fenceAuditLines.splice(0, fenceAuditLines.length - 64);
    try { log.warn?.(`[browser-dialog] ${pid}: live-fill fence on tab ${String(row.targetId || '?').slice(0, 12)} (${row.origin || '?'}) ended by ${row.why}`); } catch { /* */ }
    try { keeper?.audit?.({ sessionId: null, browserKey: (fence && fence.browserKey) || null, profileId: pid, verb: (`login-fence-ended:${row.why}`).slice(0, 32), ok: false }); } catch { /* optional */ }
    emit({ kind: 'login-fence-ended', ...row });
  }
  function syncPersistedLoginFences(profileId) {
    const pid = String(profileId || '');
    if (pid) knownFenceProfiles.add(pid);
    if (!pid || !keeper || typeof keeper.saveLoginFenceState !== 'function') return;
    const w = watches.get(pid);
    let fences = [];
    // lane chrome-157 (round 32): written from memory only once the watch's fences are re-armed — before that, the record stands
    // (a navigation in the window would otherwise write an EMPTY list over it); the record keeps the address AT THE FILL (never the
    // present one: an address can carry what was typed) and the DOCUMENT the fence belongs to
    if (fencesLive(w)) {
      for (const e of w.targets.values()) {
        if (e.liveFill) {
          const lf = e.liveFill;
          const lfOrigin = String(lf.origin || '');
          fences.push({
            targetId: e.targetId,
            urlAtFill: addressToKeep(w, e, lf, lf.urlAtFill, lfOrigin),
            docId: String(lf.docId || ''),
            origin: lfOrigin,
            at: Number(lf.at) || now(),
            ...(lf.browserKey ? { browserKey: String(lf.browserKey) } : {}),
            hold: holdWordOf(lf),
            refs: refsOfTab(pid, e),
          });
          continue;
        }
        if (Array.isArray(e.postLiftGuards) && e.postLiftGuards.length) {
          const activeGuard = e.postLiftGuards.find((g) => g && g.lfSnap && g.lfSnap.origin);   // (a guard belongs to its document)
          if (activeGuard) {
            const snap = activeGuard.lfSnap;
            fences.push({
              targetId: e.targetId,
              urlAtFill: addressToKeep(w, e, snap, snap.urlAtFill, snap.origin),
              docId: String(snap.docId || ''),
              origin: String(snap.origin || ''),
              at: Number(snap.at) || now(),
              ...(snap.browserKey ? { browserKey: String(snap.browserKey) } : {}),
              hold: 'guard',
              refs: refsOfTab(pid, e),
            });
          }
        }
      }
    } else if (typeof keeper.loginFenceStateOf === 'function') {
      try {
        const st = keeper.loginFenceStateOf(pid) || {};
        fences = st.fences || [];
      } catch { fences = []; }
    }
    const scrubs = [...(scrubNamesByProfile.get(pid) || [])];
    try { keeper.saveLoginFenceState(pid, { fences, scrubs }); } catch { /* optional */ }
  }
  function recordProfileCredSigs(profileId, sigs) {
    const pid = String(profileId || '');
    if (!pid || !Array.isArray(sigs) || !sigs.length) return;
    let list = credSigsByProfile.get(pid);
    if (!list) { list = []; credSigsByProfile.set(pid, list); }
    let moved = 0;
    for (const sg of sigs) {
      if (!sg || !sg.len || !sg.sha256) continue;
      const idx = list.findIndex((x) => x.len === sg.len && x.sha256 === sg.sha256);
      if (idx !== -1) list.splice(idx, 1);
      list.push(sg);
      moved++;
    }
    if (list.length > 128) list.splice(0, list.length - 128);
    if (moved) bumpScrubValues(pid);   // r3342 (4): at the cap an add can leave the list's length and its last element as they were — the counter moves
  }
  function bumpScrubValues(pid) { scrubValuesVer.set(pid, (scrubValuesVer.get(pid) || 0) + 1); }
  function noteCredRequestId(profileId, reqId) {
    const pid = String(profileId || '');
    const id = reqId != null ? String(reqId).trim() : '';
    if (!pid || !id) return;
    let set = credRequestIdsByProfile.get(pid);
    if (!set) { set = new Set(); credRequestIdsByProfile.set(pid, set); }
    set.delete(id);
    set.add(id);
    while (set.size > 512) set.delete(set.values().next().value);
  }
  function isCredRequestId(profileId, reqId) {
    const set = credRequestIdsByProfile.get(String(profileId || ''));
    return Boolean(set && reqId != null && set.has(String(reqId).trim()));
  }
  function bodyCarriesCred(profileId, bodyText) {
    const sigs = credSigsByProfile.get(String(profileId || ''));
    if (!sigs || !sigs.length || typeof bodyText !== 'string' || !bodyText) return false;
    return valueCarriesCredential(bodyText, sigs) || Boolean(inspectRequestBody(bodyText, sigs, '', { hasPostData: true }).carries);
  }
  function bumpFillEpoch(profileId, targetId) {
    const pid = String(profileId || '');
    const tid = String(targetId || '');
    if (!pid || !tid) return 0;
    let m = fillEpochsByProfile.get(pid);
    if (!m) { m = new Map(); fillEpochsByProfile.set(pid, m); }
    const next = (m.get(tid) || 0) + 1;
    m.set(tid, next);
    try { keeper?.mediator?.()?.interruptForFill?.({ profileId: pid, targetId: tid }); } catch { /* optional */ }
    return next;
  }
  function fillEpochOf(profileId, targetId = null) {
    const m = fillEpochsByProfile.get(String(profileId || ''));
    if (!m) return 0;
    if (targetId) {
      const w = watches.get(String(profileId || ''));
      const tid = w ? resolveKnownTargetId(w, targetId) : String(targetId);
      return tid ? (m.get(tid) || 0) : 0;
    }
    let sum = 0;
    for (const v of m.values()) sum += v;
    return sum;
  }
  function effectiveLiveFillOf(e) {
    if (!e) return null;
    if (e.liveFill) return e.liveFill;
    const af = e.activeFill || (e.activeFills && e.activeFills.size > 0 ? e.activeFills.values().next().value : null);
    if (!af) return null;
    return {
      targetId: e.targetId,
      origin: af.wantOrigin || BL().originOf(tabLoginUrlOf(e)) || '',
      at: Number(af.at) || now(),
      active: true,
      holdReason: '',
    };
  }
  function hasActiveFillOnProfile(profileId) {
    const w = watches.get(String(profileId || ''));
    if (w && w.state === 'open') {
      for (const e of w.targets.values()) if (effectiveLiveFillOf(e)) return true;
    }
    return Boolean(liveFillOnTarget(profileId, null));
  }
  function recordScrubSecret(profileId, label, val, { persist = true, at = now(), hydrated = false } = {}) {
    const pid = String(profileId || '');
    if (!pid || typeof val !== 'string' || !val) return;
    const sg = credSigOf(val);
    if (sg) recordProfileCredSigs(pid, [sg]);
    const minB = VR().MIN_MASK_BYTES || 8;
    const bytes = Buffer.byteLength(val, 'utf8');
    const lbl = String(label || 'login');
    if (bytes < minB) {
      // lane chrome-157 (round 32's persisted hold): a value under the mask floor is NEVER masked. At the fill only its entry's NAME
      // joins the names list (the fill's own memory has the value); at a re-hydration after a restart the value comes back for the
      // one check only — never into the masking list
      if (hydrated) {
        let cm = scrubCheckByProfile.get(pid);
        if (!cm) { cm = []; scrubCheckByProfile.set(pid, cm); }
        if (!cm.some((x) => x.label === lbl && x.value === val)) cm.push({ label: lbl, value: val });
        if (cm.length > 64) cm.splice(0, cm.length - 64);
      }
      noteScrubName(pid, lbl, at, persist);
      return;
    }
    let list = scrubByProfile.get(pid);
    if (!list) { list = []; scrubByProfile.set(pid, list); }
    const idx = list.findIndex((x) => x.value === val);
    if (idx !== -1) list.splice(idx, 1);
    list.push({ label: lbl, value: val, bytes, at });
    if (list.length > 32) list.splice(0, list.length - 32);
    scrubCompiledByProfile.delete(pid);
    bumpScrubValues(pid);   // r3342 (4): the values' counter, the other writer
    noteScrubName(pid, lbl, at, persist);
  }
  /** The names list: one entry per filled vault entry `{name, at, id}` — the id is what a held row refers to (a row never holds a
   *  name); an entry a standing hold refers to is never trimmed. */
  function noteScrubName(pid, lbl, at, persist) {
    let names = scrubNamesByProfile.get(pid);
    if (!names) { names = []; scrubNamesByProfile.set(pid, names); }
    const ni = names.findIndex((x) => x.name === lbl);
    const id = ni !== -1 && names[ni].id ? names[ni].id : 'n' + crypto.randomBytes(4).toString('hex');
    if (ni !== -1) names.splice(ni, 1);
    names.push({ name: lbl, at, id });
    if (names.length > 32) {
      const needed = refsInUse(pid);
      for (let i = 0; names.length > 32 && i < names.length;) { if (needed.has(names[i].id)) { i++; continue; } names.splice(i, 1); }
    }
    if (persist) syncPersistedLoginFences(pid);
  }
  const loginIdsOf = (lf) => (lf ? [lf.loginId, ...(Array.isArray(lf.also) ? lf.also.map((a) => a && a.loginId) : [])].filter(Boolean).map(String) : []);
  function refsOfLogins(pid, lf) {
    if (lf && Array.isArray(lf.refs) && lf.refs.length) return lf.refs.slice(0, 8);
    const ids = new Set(loginIdsOf(lf));
    return (scrubNamesByProfile.get(pid) || []).filter((n) => ids.has(n.name) && n.id).map((n) => n.id).slice(0, 8);
  }
  /** Every name a tab's hold may need (its fill's, and EACH guard's — two guards of two logins are two names). */
  function refsOfTab(pid, e) {
    const out = new Set(e && e.liveFill ? refsOfLogins(pid, e.liveFill) : []);
    for (const g of (e && Array.isArray(e.postLiftGuards) ? e.postLiftGuards : [])) for (const r of refsOfLogins(pid, g && g.lfSnap)) out.add(r);
    return [...out].slice(0, 8);
  }
  function refsInUse(pid) {
    const out = new Set();
    const w = watches.get(pid);
    if (w) for (const e of w.targets.values()) {
      if (e.liveFill) for (const r of refsOfLogins(pid, e.liveFill)) out.add(r);
      for (const g of (Array.isArray(e.postLiftGuards) ? e.postLiftGuards : [])) for (const r of refsOfLogins(pid, g && g.lfSnap)) out.add(r);
    }
    try { for (const f of ((keeper && keeper.loginFenceStateOf && keeper.loginFenceStateOf(pid)) || {}).fences || []) for (const r of f.refs || []) out.add(r); } catch { /* */ }
    return out;
  }
  function hydratePersistedScrubs(profileId) {
    const pid = String(profileId || '');
    if (!pid || !logins || typeof logins.scrubSecretsOf !== 'function') return;
    const names = scrubNamesByProfile.get(pid) || [];
    const missing = new Set();
    for (const s of [...names]) {
      if (!s || !s.name) continue;
      let vals = [];
      try {
        const res = logins.scrubSecretsOf(s.name, { minBytes: 1 });
        vals = Array.isArray(res) ? res : (res && Array.isArray(res.values) ? res.values : []);
      } catch { vals = []; }
      if (!vals.length) missing.add(s.name);   // (lane chrome-157: the entry is gone — a hold that needs it can never be checked)
      for (const v of vals) recordScrubSecret(pid, s.name, v, { persist: false, at: s.at || now(), hydrated: true });
    }
    scrubMissingByProfile.set(pid, missing);
  }
  function hasScrubSecrets(profileId) {
    const pid = String(profileId || '');
    let list = scrubByProfile.get(pid);
    if ((!list || !list.length) && scrubNamesByProfile.has(pid)) {
      hydratePersistedScrubs(pid);
      list = scrubByProfile.get(pid);
    }
    const sigs = credSigsByProfile.get(pid);
    return !!((list && list.length > 0) || (sigs && sigs.length > 0));
  }
  /** ONE selection of a profile's masked values (at or past the mask floor): the loop's compiled scrubber and the frame scrub's
   *  worker are built from it (主开发 r2445 law 1) */
  function scrubPairsOf(pid) {
    const minB = VR().MIN_MASK_BYTES || 8;
    const pairs = [];
    for (const b of scrubByProfile.get(pid) || []) if (b.bytes >= minB) pairs.push({ label: b.label, value: b.value });
    return pairs;
  }
  function scrubberForProfile(profileId) {
    const pid = String(profileId || '');
    if (!hasScrubSecrets(pid)) {
      scrubCompiledByProfile.delete(pid);
      return null;
    }
    if (scrubCompiledByProfile.has(pid)) return scrubCompiledByProfile.get(pid);
    const pairs = scrubPairsOf(pid);
    const fn = pairs.length ? VR().compileTextScrubber(pairs) : null;
    scrubCompiledByProfile.set(pid, fn);
    return fn;
  }
  function scrubText(profileId, text) {
    if (typeof text !== 'string' || !text) return text;
    const fn = scrubberForProfile(profileId);
    return fn ? fn(text) : text;
  }
  function scrubValuesForLogin(profileId, loginId = null, also = null) {
    const out = [];
    const wantIds = new Set();
    if (loginId) wantIds.add(String(loginId));
    if (Array.isArray(also)) {
      for (const a of also) if (a && a.loginId) wantIds.add(String(a.loginId));
    }
    const list = [...(scrubByProfile.get(String(profileId || '')) || []), ...(scrubCheckByProfile.get(String(profileId || '')) || [])];   // (+ the check-only values under the floor)
    for (const b of list) {
      if (!b || typeof b.value !== 'string' || !b.value) continue;
      if (wantIds.size > 0 && b.label && !wantIds.has(String(b.label))) continue;
      out.push(b.value);
    }
    return [...new Set(out)];
  }
  function sanitizeRequestHeadersInPlace(headers, sigs) { return CS().sanitizeRequestHeadersInPlace(headers, sigs); }   // moved: src/cdp-frame-scrub.js
  function redactCredentialUrl(rawUrl) { return CS().redactCredentialUrl(rawUrl); }
  function sanitizeRequestFrame(pid, parsed, sigs) {   // the module's sanitize; the request ids it found carrying a credential are noted HERE (the loop's state)
    const noted = [];
    const did = CS().sanitizeFrame(noted, parsed, sigs);
    for (const id of noted) noteCredRequestId(pid, id);
    return did;
  }
  // lane chrome-157 (vault-login round 32, 主开发's ruling Q3): A LISTING SHOWS A FENCED TAB BY ITS ID AND ITS ADDRESS AT THE FILL —
  // never its title, never its present address (a page can copy what was typed into either). Every target info a mediated lease
  // is sent (Target.getTargets / getTargetInfo answers, targetCreated / targetInfoChanged / attachedToTarget events) is rewritten
  // for a tab of this profile that carries a fill, a hold or a post-lift guard; the rest of the frame is the scrubber's as before.
  function fencedListingUrlOf(pid, tid) {
    const id = String(tid || '');
    if (!id) return null;
    const w = watches.get(pid);
    if (fencesLive(w)) {
      const e = w.targets.get(id) || w.targets.get(id.toUpperCase()) || null;
      if (!e) return null;
      const lf = effectiveLiveFillOf(e);
      if (lf) return String(lf.urlAtFill || tabLoginUrlOf(e) || '');
      const g = Array.isArray(e.postLiftGuards) ? e.postLiftGuards.find((x) => x && x.lfSnap) : null;
      return g ? String(g.lfSnap.urlAtFill || '') : null;
    }
    const lf = liveFillOnTarget(pid, id);
    return lf ? String(lf.urlAtFill || '') : null;
  }
  function maskFencedTargetInfos(pid, frameStr) {
    if (!frameStr.includes('"targetInfo')) return frameStr;
    let o; try { o = JSON.parse(frameStr); } catch { return frameStr; }
    let changed = false;
    const mask = (info) => {
      if (!info || typeof info !== 'object' || !info.targetId) return;
      const at = fencedListingUrlOf(pid, info.targetId);
      if (at === null) return;
      if (info.title !== '') { info.title = ''; changed = true; }
      if (info.url !== at) { info.url = at; changed = true; }
    };
    const r = o && o.result, prm = o && o.params;
    if (r && Array.isArray(r.targetInfos)) r.targetInfos.forEach(mask);
    if (r && r.targetInfo) mask(r.targetInfo);
    if (prm && prm.targetInfo) mask(prm.targetInfo);
    return changed ? JSON.stringify(o) : frameStr;
  }
  /** ONE frame on the loop → the frame to send, or null: withheld WHOLE (the raw frame never leaves — 主开发 r1915 (c)) */
  function scrubCdpFrame(profileId, frameStr) { const a = scrubOnLoop(profileId, frameStr); return a.withheld ? null : a.out; }
  /** ONE frame on the loop → { out } | { withheld }: the fence's listing mask (its state is the loop's), then src/cdp-frame-scrub.js scrubFrame */
  function scrubOnLoop(profileId, frameStr) {
    if (typeof frameStr !== 'string' || !frameStr) return { out: frameStr };
    const pid = String(profileId || '');
    frameStr = maskFencedTargetInfos(pid, frameStr);
    const fn = scrubberForProfile(pid);
    const sigs = credSigsByProfile.get(pid);
    if (!fn && !(sigs && sigs.length > 0)) return { out: frameStr };   // nothing to scrub: no module is loaded (the passkey suites' copies)
    const budgetMs = Number(scrubWalkBudgetMs) > 0 ? Number(scrubWalkBudgetMs) : 250;
    return frameDone(pid, CS().scrubFrame(frameStr, { fn, sigs, budgetMs, minB: fn ? (VR().MIN_MASK_BYTES || 8) : 8 }), budgetMs);
  }
  /** the loop's side of ONE frame's answer (the loop's scrub, or the worker's) → { out } | { withheld }: the ids it noted, its
   *  counters, a cut said once; a frame withheld whole is counted for the journal (the profile's label and a count) */
  function frameDone(pid, r, budgetMs) {
    for (const id of (Array.isArray(r.noted) ? r.noted : [])) noteCredRequestId(pid, id);
    if (r.unparseable) unparseableScrubFrames++;
    if (r.cut) {
      cutScrubFrames++;
      say('scrub-cut:' + pid, `${pid}: CDP frame scrub walk exceeded ${budgetMs} ms budget; remaining strings redacted with [vault:scrub-cut]`);
    }
    if (r.withheld || typeof r.out !== 'string') return withheldFor(pid, String(r.withheld || 'no answer'));
    return { out: r.out };
  }

  // ── THE FRAME SCRUB'S WORKER (lane lg-vault-file, 主开发 r1915 (b) + r2445) ──
  // A frame past THE ON-LOOP FIGURE (64 KiB: the worst lawful scrub of that size holds the loop under 50 ms by the measure) is
  // scrubbed by the profile's worker (src/server/browser-scrub-worker.js: the same scrubber, the same frame scrub); a smaller one stays
  // on the loop. The worker gets the values by MESSAGE only: it starts at the first frame that needs it and ends at the profile's end,
  // a lock (endScrubWorkers) or an idle stretch. THE WORKER's COPY ENDS AT A LOCK; THE LOOP's COPY IS THE BOUNDARY AND STANDS UNTIL
  // THE PROFILE ENDS (主开发 r3342 (2)): the next large frame after a lock starts a worker again with the loop's values. A worker
  // silent past its BOUND on the frame it is on ENDS — every frame it held is withheld WHOLE, by name — and the next large frame
  // starts a new one past a floor between starts (inside the floor: withheld by name). The bound is timed from the frame's TURN (主开发
  // r3342 (3)): the worker scrubs one frame at a time and answers each once, in order, so a frame's turn starts when the one before it
  // is answered (or at its post, to an idle worker) — a healthy worker in a burst is never ended. Each frame also has one CEILING
  // from its post (60 s: one connection's queue bound, 64 MiB, at the worst lawful scrub's rate, 4 MiB in 3.5 s, is 56 s): past it
  // that frame alone is withheld by name, so nothing waits without end. The journal gets the profile's label and a count — never a
  // value, a page's text or an address. The ORDER of a socket's frames is the mediator's (src/server/cdp-mediator.js: one ordered
  // sender a connection).
  const SCRUB_FIG = Object.freeze({ onLoopMax: 64 * 1024, walkMs: 5000, boundMs: 10000, ceilingMs: 60000, idleMs: 30000, floorMs: 5000, ...(scrubFigures && typeof scrubFigures === 'object' ? scrubFigures : {}) });
  const scrubWorkers = new Map();     // pid → { w, pend: Map(seq → { resolve, timer: its ceiling }), seq, answered, turn, fn, ver, idle }
  const scrubStartedAt = new Map();   // pid → when its last worker started (the floor between starts)
  const scrubWithheld = new Map();    // pid → { n, total, saidAt } — the journal's count
  let WTm = null, WMm = null;
  const WT = () => WTm || (WTm = require('worker_threads'));
  const WM = () => WMm || (WMm = require('../worker-memory.js'));   // the memory census (lazily: the passkey suites' copies)
  const scrubLabel = (pid) => { try { return String((typeof labelOf === 'function' && labelOf(pid)) || pid).slice(0, 80); } catch { return String(pid); } };
  /** a CDP frame for a profile's agent → the scrubbed frame (a string: scrubbed on the loop) or a promise of { out } | { withheld } */
  function scrubCdpFrameAsync(profileId, frameStr) {
    if (typeof frameStr !== 'string' || !frameStr) return frameStr;
    if (Buffer.byteLength(frameStr, 'utf8') <= SCRUB_FIG.onLoopMax) { const a = scrubOnLoop(profileId, frameStr); return a.withheld ? Promise.resolve(a) : a.out; }
    const pid = String(profileId || '');
    const masked = maskFencedTargetInfos(pid, frameStr);
    const fn = scrubberForProfile(pid);
    const sigs = credSigsByProfile.get(pid) || [];
    if (!fn && !sigs.length) return masked;   // nothing to scrub
    return scrubOffLoop(pid, masked, fn, sigs);
  }
  function scrubOffLoop(pid, frameStr, fn, sigs) {
    let s = scrubWorkers.get(pid);
    if (!s) {
      const last = scrubStartedAt.get(pid);
      if (last != null && now() - last < SCRUB_FIG.floorMs) return Promise.resolve(withheldFor(pid, 'the scrub worker restarts after a floor'));
      s = startScrubWorker(pid);
      if (!s) return Promise.resolve(withheldFor(pid, 'no scrub worker could start'));
    }
    const ver = scrubValuesVer.get(pid) || 0;
    if (s.fn !== fn || s.ver !== ver) {   // the values changed since the worker last got them (the counter both writers move, r3342 (4)): by message, before the frame
      s.fn = fn; s.ver = ver;
      try { s.w.postMessage({ type: 'values', pairs: fn ? scrubPairsOf(pid) : [], sigs, minB: VR().MIN_MASK_BYTES || 8, budgetMs: SCRUB_FIG.walkMs }); } catch { endScrubWorker(pid, 'the values could not be handed over'); return Promise.resolve(withheldFor(pid, 'the values could not be handed over')); }
    }
    const seq = ++s.seq;
    armScrubIdle(pid, s);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { const p = s.pend.get(seq); if (!p) return; s.pend.delete(seq); p.resolve(withheldFor(pid, `no answer within ${SCRUB_FIG.ceilingMs} ms of its post`)); }, SCRUB_FIG.ceilingMs);   // THE CEILING: this frame alone
      timer.unref?.();
      s.pend.set(seq, { resolve, timer });
      if (s.answered === seq - 1) armScrubTurn(pid, s);   // the worker was idle: this frame's turn starts at its post
      try { s.w.postMessage({ type: 'frame', seq, frame: frameStr }); } catch { endScrubWorker(pid, 'the frame could not be handed over', s); }
    });
  }
  /** THE BOUND (r2445 law 5, timed from the TURN — 主开发 r3342 (3)): the frame the worker is on has boundMs; silent past it, the worker is ENDED */
  function armScrubTurn(pid, s) {
    if (s.turn) clearTimeout(s.turn);
    s.turn = setTimeout(() => endScrubWorker(pid, `no answer within ${SCRUB_FIG.boundMs} ms`, s), SCRUB_FIG.boundMs);
    s.turn.unref?.();
  }
  function startScrubWorker(pid) {
    const { Worker } = WT();
    let w;
    try { w = new Worker(scrubWorkerFile || require('path').join(__dirname, 'browser-scrub-worker.js')); } catch (e) { say('scrub-worker-start:' + pid, `${scrubLabel(pid)}: the frame scrub's worker could not start (${(e && e.code) || 'error'}) — its large frames are withheld by name`); return null; }
    try { WM().trackWorker('browser-scrub', w); } catch { /* the census's own */ }
    scrubStartedAt.set(pid, now());
    const s = { w, pend: new Map(), seq: 0, answered: 0, turn: null, fn: undefined, ver: -1, idle: null };
    scrubWorkers.set(pid, s);
    w.on('message', (msg) => {
      if (msg && msg.ev === 'memory') return;   // the memory census's answer, not ours
      if (!msg || msg.type !== 'done') return;
      if (Number(msg.seq) > s.answered) s.answered = Number(msg.seq);   // answered in order, each once: the next frame's turn starts now
      if (s.answered < s.seq) armScrubTurn(pid, s); else if (s.turn) { clearTimeout(s.turn); s.turn = null; }
      const p = s.pend.get(msg.seq);
      if (!p) return;   // its ceiling withheld it already
      s.pend.delete(msg.seq); clearTimeout(p.timer);
      p.resolve(msg.r && typeof msg.r === 'object' ? frameDone(pid, msg.r, SCRUB_FIG.walkMs) : withheldFor(pid, String(msg.withheld || 'no answer')));
    });
    w.on('error', () => endScrubWorker(pid, 'the scrub worker failed', s));
    w.on('exit', () => endScrubWorker(pid, 'the scrub worker ended', s));
    w.unref?.();   // never holds the hub's exit
    return s;
  }
  /** the profile's worker ends (its end, a lock, idle, past its bound, lost): every frame it held is withheld WHOLE, by name */
  function endScrubWorker(pid, why, only = null) {
    const s = scrubWorkers.get(pid);
    if (!s || (only && s !== only)) return;
    scrubWorkers.delete(pid);
    if (s.idle) clearTimeout(s.idle);
    if (s.turn) clearTimeout(s.turn);
    for (const p of s.pend.values()) { clearTimeout(p.timer); p.resolve(withheldFor(pid, why)); }
    s.pend.clear();
    try { s.w.terminate(); } catch { /* gone */ }
  }
  function endScrubWorkers(why = 'a lock') { for (const pid of [...scrubWorkers.keys()]) endScrubWorker(pid, why); }
  function armScrubIdle(pid, s) {
    if (s.idle) clearTimeout(s.idle);
    s.idle = setTimeout(() => { if (scrubWorkers.get(pid) !== s) return; if (s.pend.size) armScrubIdle(pid, s); else endScrubWorker(pid, 'idle', s); }, SCRUB_FIG.idleMs);
    s.idle.unref?.();
  }
  /** ONE frame withheld whole: counted; the journal gets the profile's label and the count (one line a minute a profile at most) */
  function withheldFor(pid, why) {
    let c = scrubWithheld.get(pid);
    if (!c) { c = { n: 0, total: 0, saidAt: -Infinity }; scrubWithheld.set(pid, c); }
    c.n++; c.total++;
    const t = now();
    if (t - c.saidAt >= 60000) { try { log.warn?.(`[browser-dialog] ${scrubLabel(pid)}: ${c.n} CDP frame(s) withheld whole — the vault scrub could not answer (${why})`); } catch { /* */ } c.n = 0; c.saidAt = t; }
    return { withheld: why };
  }
  const scrubWorkerFacts = (pid = null) => (pid == null ? { live: scrubWorkers.size } : { live: scrubWorkers.has(String(pid)), withheld: (scrubWithheld.get(String(pid)) || { total: 0 }).total, startedAt: scrubStartedAt.get(String(pid)) ?? null });
  function scrubOutput(target, raw) {
    const pid = String((target && target.profileId) || '');
    if (!pid || !raw || typeof raw !== 'object') return { out: '', err: '', changed: false };
    const o0 = typeof raw.out === 'string' ? raw.out : '';
    const e0 = typeof raw.err === 'string' ? raw.err : '';
    const out = o0 ? scrubText(pid, o0) : '';
    const err = e0 ? scrubText(pid, e0) : '';
    return { out, err, changed: out !== o0 || err !== e0 };
  }
  // lane chrome-157 (round 32, the owner's sentence — 1 and 2 as ONE CHECK): an ordinary site's GET form, or its router, can put what
  // was typed into the NEXT address (or its title) by itself. At a lift, while the hub still holds the value, the tab's present
  // address and title are compared with it — raw and in the usual URL encodings; found ⇒ the tab stays fenced, the owner told once.
  // A value a page writes in LATER, after the lift, is a said limit (the hub no longer holds it then).
  // lane chrome-157 (round 32's persisted hold): THE OWNER'S NOTICE OF A HOLD HAS A KEY THAT SURVIVES A RESTART — one per (profile,
  // tab), the For-you store's own itemKey: re-filed under it, nothing is raised again; it ends with the hold, by that key
  const HOLD_KEY = 'login-hold:';
  const holdKeyOf = (pid, tid) => `${HOLD_KEY}${pid}:${tid}|`;
  const sweepHoldNotices = (prefix) => { try { if (forYou && typeof forYou.sweep === 'function') forYou.sweep(prefix); } catch { /* the tray's own failure */ } };
  const endHoldNotice = (w, e, lf) => {
    for (const id of [lf && lf.valueShownNoticeId, lf && lf.ceilingNoticeId]) { if (id) { try { forYou?.resolve?.(id); } catch { /* */ } } }
    if (w && e) sweepHoldNotices(holdKeyOf(w.profileId, e.targetId));
  };
  /** The word the record writes for a tab's hold (browser-login HOLD_WORDS); a restored hold keeps the word it was restored from. */
  function holdWordOf(lf) {
    if (!lf) return 'guard';
    if (lf.restored || BL().HOLD_PHASES.includes(lf.holdReason)) return lf.restoredWord || 'live';   // (a restart's PHASE is not a kind: the row keeps the word of the kind it was restored from)
    if (lf.valueShown) return 'value_shown';
    if (lf.holdReason === BL().HOLD_TOO_MUCH_TEXT) return 'too_much_text';
    if (lf.unknownTyped || lf.holdReason === BL().HOLD_UNKNOWN_TYPED) return 'unknown_typed';
    return lf.postLiftHeld ? 'held' : 'live';
  }
  /** The address a row may keep: the one at the fill, never a later one, and never one that holds the value (then its origin). */
  function addressToKeep(w, e, lf, addr, origin) {
    const a = String(addr || '');
    if (!a) return String(origin || '');
    try { if (lf && checkTexts(w, e, lf, [a]) !== 'clean') return String(origin || ''); } catch { return String(origin || ''); }
    return a;
  }

  // lane chrome-157 (vault-login round 32 take-over, the owner's B — items 1 and 2 as ONE check): an ordinary site can carry what was
  // typed into its NEXT address or title by itself (a form that goes by GET, a router that writes its form there); at a lift, while
  // the hub still holds the value, the texts the agent would read next are compared with it — found ⇒ the tab stays fenced
  function checkTexts(w, e, lf, texts, heldVals = null) {
    if (!lf) return 'clean';
    // (the values the hub holds for this fill — the same set its wipe looks for: the scrub list by value and its check-only values,
    // the fill's own memory, the step's one-time codes; a wipe that verified the field empty hands over what it held)
    let vals = Array.isArray(heldVals) ? [...heldVals] : [];
    try { vals = [...vals, ...(LF().valuesForTarget?.(lf.targetId || (e && e.targetId), lf.isoContextId || 0) || [])]; } catch { /* */ }
    try { vals = [...vals, ...scrubValuesForLogin(w && w.profileId, lf.loginId, lf.also)]; } catch { /* the list's own failure */ }
    vals = [...new Set([...vals, ...(Array.isArray(lf.stepOtpValues) ? lf.stepOtpValues : [])].filter((x) => typeof x === 'string' && x.length > 0))];
    if (!vals.length) return 'clean';
    // (a page that sends the same address again and again costs one check: the last answers are kept by a digest of what was
    // compared — in memory only, never a value at rest)
    const key = crypto.createHash('sha256').update(JSON.stringify([vals, texts])).digest('hex');
    const hit = checkMemo.get(key);
    if (hit) { checkMemo.delete(key); checkMemo.set(key, hit); return hit; }
    const v = BL().valueShownVerdict(vals, texts, { floor: VR().MIN_MASK_BYTES || 8 });
    checkMemo.set(key, v);
    if (checkMemo.size > 64) checkMemo.delete(checkMemo.keys().next().value);
    return v;
  }
  const checkMemo = new Map();   // digest → the check's answer (≤ 64, the oldest goes first)
  const valueShownIn = (w, e, lf, texts, heldVals = null) => checkTexts(w, e, lf, texts, heldVals) !== 'clean';   // («cannot tell» holds)
  /** The texts the fence's one check reads for a tab: the navigation's own address, and the tab's url and title only once the
   *  browser's target info has named them after a top-frame commit — never the OLD document's (lane chrome-157, the cure of
   *  2026-11-15: a stale title had kept a clean next page held; the tab's name itself stays the browser's for every reader). */
  const tabCheckTexts = (e) => (e ? [tabLoginUrlOf(e), ...(e.navTextsStale ? [] : [e.url, e.title])] : []);
  const valueShownByTab = (w, e, lf, heldVals = null) => Boolean(e) && valueShownIn(w, e, lf, tabCheckTexts(e), heldVals);
  /** …and the same check on the event that carries the next address to the agent (the mediator asks it of a fenced tab's top-frame
   *  navigation): true ⇒ the event names the address at the fill, as the listing does. */
  function navShowsValue(profileId, targetId, url) {
    const w = watches.get(String(profileId || ''));
    const e = w && targetId ? w.targets.get(resolveKnownTargetId(w, targetId) || '') : null;
    const lf = e ? e.liveFill : null;
    return Boolean(lf) && valueShownIn(w, e, lf, [url]);
  }
  function fileValueShownNotice(w, e, lf) {
    if (!lf || lf.valueShownNoticed || !forYou || typeof forYou.add !== 'function') return;
    lf.valueShownNoticed = true;
    const origin = lf.origin || BL().originOf(tabLoginUrlOf(e)) || '';
    const tidShort = String((e && e.targetId) || lf.targetId || 'tab').slice(0, 8);
    const tabLabel = origin ? `${origin} (tab ${tidShort})` : `tab ${tidShort}`;
    const i18nText = { key: 'the page on {tab} put a filled password into its own address or title — agents cannot read that tab', params: { tab: tabLabel } };
    const i18nDetail = [{ key: 'Close the tab. Leaving that page also ends it — after a VibeSpace restart only once the vault is unlocked, and not once that login is deleted.' }];
    try {
      lf.valueShownNoticeId = forYou.add(w.profileId, { origin: 'browser', kind: 'notice', urgency: 'normal', text: i18nText.key.replace('{tab}', tabLabel), detail: i18nDetail[0].key, i18n: { text: i18nText, detail: i18nDetail }, itemKey: holdKeyOf(w.profileId, (e && e.targetId) || lf.targetId) }) || null;
    } catch { /* optional */ }
  }
  function fileCeilingWipeNotice(w, e, lf) {
    if (!lf || lf.ceilingNoticed || !forYou || typeof forYou.add !== 'function') return;
    lf.ceilingNoticed = true;
    const origin = lf.origin || BL().originOf(tabLoginUrlOf(e)) || '';
    const tidShort = String((e && e.targetId) || lf.targetId || 'tab').slice(0, 8);
    const tabLabel = origin ? `${origin} (tab ${tidShort})` : `tab ${tidShort}`;
    const holdTooMuch = lf.holdReason === BL().HOLD_TOO_MUCH_TEXT;
    const holdUnknown = Boolean(lf.unknownTyped || lf.holdReason === BL().HOLD_UNKNOWN_TYPED);
    const i18nText = holdTooMuch
      ? { key: 'a filled password could not be cleared on {tab} (too much text to check) — reload it', params: { tab: tabLabel } }
      : holdUnknown
        ? { key: 'a filled password could not be cleared on {tab} (VibeSpace can no longer verify what is on the page) — reload it', params: { tab: tabLabel } }
        : { key: 'a filled password could not be cleared on {tab} — reload it', params: { tab: tabLabel } };
    const i18nDetail = [{ key: 'Open the browser live view or reload that tab so the typed credential leaves the page.' }];
    const text = i18nText.key.replace('{tab}', tabLabel);
    const detail = i18nDetail[0].key;
    try {
      lf.ceilingNoticeId = forYou.add(w.profileId, { origin: 'browser', kind: 'notice', urgency: 'normal', text, detail, i18n: { text: i18nText, detail: i18nDetail }, itemKey: holdKeyOf(w.profileId, (e && e.targetId) || lf.targetId) }) || null;
    } catch { /* optional */ }
  }

  /** B-b56d (the owner's ruling B, 2026-11-18): IS AN HTTP SIGN-IN HOOKED ON TAB `e`? The agent's watch on a standard Chrome: always
   *  (as before). The PERSON'S watch: while a live window of the person shows this browser, or while a sign-in of that tab is held
   *  (it keeps its hook until it is answered or its bound cancels it — never left hanging). A kernel: never (its sign-in is its own).
   *  Chrome hands a challenge to DevTools only on a request it PAUSED (Fetch.enable refuses handleAuthRequests with no pattern), so
   *  the hook pauses DOCUMENT requests only and continues each at once — a sub-resource is never paused. */
  function authHookOn(w, e) {
    if (!w || w.kernel) return false;
    if (w.mode !== 'person') return true;
    if (!PERSON_SIGNIN_HOOK) return false; // B-b56d OUT: the person's watch arms no sign-in hook in this release
    if ((personViews.get(w.profileId) || 0) > 0) return true;
    const rec = e ? w.prompts.get(e.targetId) : null;
    return !!(rec && rec.type === 'http-auth' && w.authReq.has(rec.id));
  }
  /** B-b56d: the live view tells the watch how many of the person's own windows show browser `profileId`; the person's tabs follow. */
  function personWindows(profileId, n) {
    const pid = String(profileId || ''); const k = Math.max(0, Math.floor(Number(n) || 0));
    if (!pid) return;
    if (k) personViews.set(pid, k); else personViews.delete(pid);
    const w = watches.get(pid);
    if (!w || w.state !== 'open' || w.mode !== 'person' || w.kernel) return;
    for (const e of [...w.targets.values()]) if (e.sid && e.enabled) syncTabFetchMode(w, e);
  }
  /** N1 + Shape S + m2: THE ONE Fetch + Network mode driver for tab `e`.
   *  While ANY live fill fence (`e.liveFill`) or pre-insert arming (`e.credPreArming`) stands on `e` — including during EVERY hold
   *  state (`too_much_text`, `unknown_typed`), post-restart Shape S (`credSigs: []`),
   *  and across `agent ↔ person` flips — `'*'` Request interception and bounded `Network` tracking stay UP; when no fence
   *  stands on `e`, `Network.disable` runs and `Fetch` returns to `'doc-auth'` or `'off'`. */
  async function syncTabFetchMode(w, e) {
    if (!w || !e) return { ok: false, fenceErr: 'browser watch unavailable' };
    const run = async () => {
      if (!e.sid || w.state !== 'open') return { ok: false, fenceErr: 'browser CDP session is closed' };
      const wantCred = Boolean(e.liveFill || e.credPreArming);
      const wantActiveFill = Boolean(e.activeFill);
      const hookAuth = authHookOn(w, e); // B-b56d: the person's watch too, while a window of the person shows it
      const wantFetch = wantActiveFill
        ? (hookAuth ? 'fill-auth' : 'fill-noauth')
        : wantCred
          ? (hookAuth ? 'all-auth' : 'all-noauth')
          : ((e.enabled && hookAuth) ? 'doc-auth' : 'off');
      let failReason = '';
      const noteFail = (domain, r) => {
        if (!failReason) {
          failReason = r && r.timeout
            ? `${domain} timed out`
            : `${domain} failed${r && r.error && r.error.message ? `: ${String(r.error.message).slice(0, 120)}` : ''}`;
        }
      };
      const ops = [];
      if (wantCred && !e.credNetEnabled) {
        ops.push(call(w, 'Network.enable', { maxPostDataSize: 65536, maxResourceBufferSize: 65536, maxTotalBufferSize: 262144 }, e.sid, interceptTimeoutMs).then((r) => {
          if (r && !r.error && !r.timeout) e.credNetEnabled = true;
          else { e.credNetEnabled = false; noteFail('Network.enable', r); }
        }).catch((err) => { e.credNetEnabled = false; noteFail('Network.enable', { error: err }); }));
      } else if (!wantCred && e.credNetEnabled) {
        e.credNetEnabled = false;
        ops.push(call(w, 'Network.disable', {}, e.sid, interceptTimeoutMs).catch(() => {}));
      }
      if (e.fetchMode !== wantFetch) {
        const applyFetchResult = (r) => {
          if (r && !r.error && !r.timeout) {
            e.fetchMode = wantFetch;
            e.credFetchAll = wantFetch === 'all-auth' || wantFetch === 'all-noauth' || wantFetch === 'fill-auth' || wantFetch === 'fill-noauth';
          } else {
            e.fetchMode = null;
            e.credFetchAll = false;
            noteFail(wantFetch === 'off' ? 'Fetch.disable' : 'Fetch.enable', r);
          }
        };
        if (wantFetch === 'fill-auth' || wantFetch === 'fill-noauth') {
          ops.push(call(w, 'Fetch.enable', {
            patterns: [
              { urlPattern: '*', requestStage: 'Request' },
              { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' },
            ],
            handleAuthRequests: wantFetch === 'fill-auth',
          }, e.sid, interceptTimeoutMs).then(applyFetchResult).catch((err) => applyFetchResult({ error: err })));
        } else if (wantFetch === 'all-auth' || wantFetch === 'all-noauth') {
          ops.push(call(w, 'Fetch.enable', {
            patterns: [{ urlPattern: '*', requestStage: 'Request' }],
            handleAuthRequests: wantFetch === 'all-auth',
          }, e.sid, interceptTimeoutMs).then(applyFetchResult).catch((err) => applyFetchResult({ error: err })));
        } else if (wantFetch === 'doc-auth') {
          ops.push(call(w, 'Fetch.enable', {
            patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }],
            handleAuthRequests: true,
          }, e.sid, interceptTimeoutMs).then((r) => {
            if (r && r.error) say('auth:' + r.error.message, `${w.profileId}: HTTP sign-ins were not hooked — ${r.error.message}`);
            applyFetchResult(r);
          }).catch((err) => applyFetchResult({ error: err })));
        } else {
          ops.push(call(w, 'Fetch.disable', {}, e.sid, interceptTimeoutMs).then(applyFetchResult).catch((err) => applyFetchResult({ error: err })));
        }
      }
      if (ops.length) await Promise.all(ops);
      // B-b56d (law 5): a person's tab whose sign-in hook was refused (or came back) is told to the person's window — never a silent dead end
      if (w.mode === 'person' && !w.kernel) { const off = hookAuth && e.fetchMode !== wantFetch; if (off !== !!e.authHookOff) { e.authHookOff = off; emit({ kind: 'prompt-hook', profileId: w.profileId, targetId: e.targetId, armed: !off }); } }
      if (w.mode === 'person' && !w.kernel) { const armedNow = AUTH_FETCH_MODES.has(e.fetchMode); if (armedNow !== !!e.personHookArmed) { e.personHookArmed = armedNow; try { log.log?.(`[browser-dialog] ${w.profileId}: the person's sign-in hook ${armedNow ? 'armed' : 'off'} on tab ${String(e.targetId || '').slice(0, 8)}`); } catch { /* */ } } } // B-b56d cure (5): the hook's state, said once per change
      const fetchOk = e.fetchMode === wantFetch && (!wantActiveFill || (e.fetchMode === 'fill-auth' || e.fetchMode === 'fill-noauth')) && (!wantCred || e.credFetchAll);
      const netOk = !wantCred || Boolean(e.credNetEnabled);
      const ok = Boolean(e.sid && w.state === 'open' && fetchOk && netOk);
      return { ok, wantFetch, fetchMode: e.fetchMode, wantCred, credNetEnabled: Boolean(e.credNetEnabled), fenceErr: ok ? '' : (failReason || 'request interception is not active on this tab') };
    };
    const prev = e.fetchSyncP || Promise.resolve();
    const cur = prev.then(run, run);
    e.fetchSyncP = cur.then(() => {}, () => {});
    return cur;
  }

  async function ensureTabCredIntercept(w, e) {
    if (!w || !e || !e.sid || w.state !== 'open') return { ok: false, fenceErr: 'browser CDP session is closed' };
    e.credPreArming = true;
    return syncTabFetchMode(w, e);
  }

  function syncTabCredIntercept(w, e) {
    syncTabFetchMode(w, e).catch(() => {});
  }

  function extractInlinePostData(req) { return CS().extractInlinePostData(req); }   // moved: src/cdp-frame-scrub.js
  function headerValueOf(headers, wantLower) { return CS().headerValueOf(headers, wantLower); }

  function continueResponseStage(w, reqId, sid, p) {
    if (p && p.responseStatusCode != null) {
      call(w, 'Fetch.continueResponse', { requestId: reqId }, sid, 1500).then((r) => {
        if (r && r.error) call(w, 'Fetch.continueRequest', { requestId: reqId }, sid, 1500).catch(() => {});
      }).catch(() => {});
    } else {
      call(w, 'Fetch.continueRequest', { requestId: reqId }, sid, 1500).catch(() => {});
    }
  }

  function onCredFetchPaused(w, m, p) {
    const sid = m.sessionId ? String(m.sessionId) : null;
    const reqId = String(p.requestId || '');
    const e = tabOf(w, m);
    const af = e && e.activeFill;
    const isRespStage = p.responseStatusCode != null || p.responseErrorReason != null;
    const isTopDoc = p.resourceType === 'Document' && (!p.frameId || String(p.frameId) === String((af && af.topFrameId) || (e && e.targetId) || ''));
    if (af && isTopDoc && af.wantOrigin) {
      const reqUrl = String((p.request && p.request.url) || '');
      const reqOrigin = BL().originOf(reqUrl);
      let redirectOrigin = null;
      if (isRespStage && Number(p.responseStatusCode) >= 300 && Number(p.responseStatusCode) < 400) {
        const loc = headerValueOf(p.responseHeaders, 'location');
        if (loc) {
          try { redirectOrigin = BL().originOf(new URL(loc, reqUrl || af.wantOrigin).href); } catch { redirectOrigin = 'invalid'; }
        }
      }
      const crossDoc = !reqOrigin || reqOrigin !== af.wantOrigin || Boolean(redirectOrigin && redirectOrigin !== af.wantOrigin);
      if (crossDoc) {
        af.crossNav = (redirectOrigin && redirectOrigin !== af.wantOrigin && redirectOrigin !== 'invalid')
          ? redirectOrigin
          : (reqOrigin || 'an unverified page');
        af.abort?.();
        if (Array.isArray(af.heldRequests) && af.heldRequests.length < 32) {
          af.heldRequests.push({ reqId, sid, m, p, isResponse: isRespStage });
        } else {
          call(w, 'Fetch.failRequest', { requestId: reqId, errorReason: 'Aborted' }, sid);
        }
        return;
      }
    }
    if (isRespStage) {
      continueResponseStage(w, reqId, sid, p);
      return;
    }
    const lf = e && e.liveFill;
    // lane chrome-157 (主开发's L2, 2026-11-15 09:16Z): A FENCE WITH NO VALUES BLOCKS NOTHING IT CANNOT MATCH. A held tab whose values
    // are not in memory (after a hub restart, before the vault opens; a hold that no longer knows what was typed) lets its page load
    // — scripts, styles, images from other hosts; it used to fail every cross-origin request, and a site's pages broke on that tab.
    // What a live fill blocks with its values in memory (below) stays as it is.
    if (e && lf && Array.isArray(lf.credSigs) && lf.credSigs.length > 0 && p.responseStatusCode == null && !p.responseErrorReason) {
      const sigs = lf.credSigs;
      const req = p.request || {};
      const reqUrl = String(req.url || '');
      const reqOrigin = BL().originOf(reqUrl);
      const crossOrigin = !BL().credDestinationOk(lf.origin, lf.site, reqUrl);   // (主开发's L1: judged by the filled page's SITE — Chrome's own registrable domain; the exact origin when it has none)
      const contentType = headerValueOf(req.headers, 'content-type');
      const contentEncoding = headerValueOf(req.headers, 'content-encoding');
      const urlHdrCtx = { capHit: null };
      const urlCarries = urlCarriesCredential(reqUrl, sigs, urlHdrCtx);
      const hdrCarries = headersCarryCredential(req.headers, sigs, urlHdrCtx);
      const inline = extractInlinePostData(req);
      const hasPost = Boolean(req.hasPostData || inline.hasData || inline.binary);

      const finish = (bodyRes) => {
        const carries = urlCarries || hdrCarries || Boolean(bodyRes && bodyRes.carries);
        const undecodable = Boolean((bodyRes && bodyRes.undecodable) || urlHdrCtx.capHit);
        if (carries || undecodable) {
          noteCredRequestId(w.profileId, reqId);
          if (p.networkId) noteCredRequestId(w.profileId, p.networkId);
        }
        if (crossOrigin && (carries || undecodable)) {
          if (!carries && undecodable) {
            const why = (bodyRes && bodyRes.reason) || urlHdrCtx.capHit || 'unknown_encoding';
            say('undecodable-body:' + w.profileId + ':' + why, `${w.profileId}: cross-origin request to ${reqOrigin || reqUrl.slice(0, 120)} blocked fail-closed (undecodable_body:${why})`);
          }
          call(w, 'Fetch.failRequest', { requestId: reqId, errorReason: 'BlockedByClient' }, sid);
          try {
            logins?.noticeCrossOriginBlocked?.({
              origin: lf.origin,
              targetOrigin: reqOrigin || reqUrl.slice(0, 120),
              username: lf.user || '',
              profileId: w.profileId,
            });
          } catch { /* */ }
          emit({
            kind: 'login-cross-origin-blocked',
            profileId: w.profileId,
            targetId: e.targetId,
            origin: lf.origin,
            targetOrigin: reqOrigin || null,
            reason: carries ? 'credential' : ('undecodable:' + ((bodyRes && bodyRes.reason) || urlHdrCtx.capHit || 'unknown')),
          });
          return;
        }
        if (!crossOrigin && carries) {
          const netId = p.networkId ? String(p.networkId) : '';
          if (netId) {
            if (!e.inflightCredReqs) e.inflightCredReqs = new Set();
            e.inflightCredReqs.add(netId);
            while (e.inflightCredReqs.size > 32) e.inflightCredReqs.delete(e.inflightCredReqs.values().next().value);
          }
        }
        call(w, 'Fetch.continueRequest', { requestId: reqId }, sid);
      };

      if (inline.binary) {
        finish({ carries: false, undecodable: true, reason: 'binary_post_data' });
        return;
      }
      if (hasPost && !inline.hasData) {
        (async () => {
          const gpd = await call(w, 'Fetch.getRequestPostData', { requestId: reqId }, sid, 1500).catch(() => null);
          if (!gpd || typeof gpd.postData !== 'string') {
            finish({ carries: false, undecodable: true, reason: 'unreadable_post_data' });
            return;
          }
          finish(inspectRequestBody(gpd.postData, sigs, contentType, { hasPostData: true, contentEncoding }));
        })();
        return;
      }
      const bodyRes = hasPost
        ? inspectRequestBody(inline.text, sigs, contentType, { hasPostData: true, contentEncoding })
        : { carries: false, undecodable: false };
      finish(bodyRes);
      return;
    }
    call(w, 'Fetch.continueRequest', { requestId: reqId }, sid);
  }

  function clearPostLiftOnTab(e, w = null) {
    if (!e) return;
    const had = Array.isArray(e.postLiftGuards) && e.postLiftGuards.length > 0;
    if (e.postLiftTimer) { clearTimeout(e.postLiftTimer); e.postLiftTimer = null; }
    e.postLiftGuards = null;
    e.postLiftChecking = null;
    e.postLiftCheckingNavSeq = -1;
    if (had && w && w.profileId) syncPersistedLoginFences(w.profileId);
  }

  function tabNeedsPostLiftRecheck(e) {
    return Boolean(e && (!e.liveFill || e.liveFill.postLiftHeld) && Array.isArray(e.postLiftGuards) && e.postLiftGuards.length > 0);
  }

  async function recheckPostLiftOnTab(w, e) {
    if (!w || w.state !== 'open' || !e || !e.sid || !tabNeedsPostLiftRecheck(e)) return { ok: true, refilled: false };
    const startNavSeq = e.navSeq || 0;
    if (e.postLiftChecking && e.postLiftCheckingNavSeq === startNavSeq) return e.postLiftChecking;
    // THE UNKNOWN-TYPED HOLD (one road): the tab is held until it navigates, its refusal names both doors
    const holdUnknown = async (base) => {
      base = base || {};
      armLiveFillOnTab(w, e, {
        ...base,
        targetId: e.targetId,
        urlAtFill: base.urlAtFill || base.origin || BL().originOf(tabLoginUrlOf(e)) || '',   // (lane chrome-157, M4: the address AT THE FILL, never the present one)
        origin: base.origin || BL().originOf(tabLoginUrlOf(e)) || '',
        at: Number(base.at) || now(),
        credSigs: [],
        stepOtpValues: [],
        unknownTyped: true,
        postLiftHeld: false,
        heldGuardIds: [],
        holdReason: BL().HOLD_UNKNOWN_TYPED,
      }, { persist: true, noTimer: true });
      await syncTabFetchMode(w, e);
      if (e.liveFill) fileCeilingWipeNotice(w, e, e.liveFill);
      return { ok: true, refilled: true };
    };
    // lane chrome-157 (round 32, the owner's sentence — 7): A CHECK THAT CANNOT LOOK NEVER ANSWERS «TRY AGAIN» WITHOUT BOUND — the
    // failures are counted per document; at FAILED_CHECKS_BOUND in a row the tab is held until it navigates (both doors named)
    const failedLook = (base) => {
      const doc = e.docId || '';
      e.postLiftFails = (e.postLiftFailsDoc === doc ? (e.postLiftFails || 0) : 0) + 1; e.postLiftFailsDoc = doc;
      if (e.postLiftFails >= FAILED_CHECKS_BOUND) { e.postLiftFails = 0; return holdUnknown(base || {}); }
      return { ok: false, checkFailed: true, code: 'login_check_failed', error: 'VibeSpace could not check this tab — try again' };
    };
    const p = Promise.resolve().then(async () => {
      try {
        const guards = Array.isArray(e.postLiftGuards) ? [...e.postLiftGuards] : [];
        const checkedGuardIds = [];
        const refilledGuardIds = [];
        let lastSnap = null;
        let anyTooMuch = false;
        let anyNotEmpty = false;
        for (const g of guards) {
          if (!g || !g.lfSnap || !w || w.state !== 'open' || !e.sid) break;
          if ((e.navSeq || 0) !== startNavSeq) {
            return tabNeedsPostLiftRecheck(e) ? recheckPostLiftOnTab(w, e) : { ok: true, refilled: false };
          }
          if (!Array.isArray(e.postLiftGuards) || !e.postLiftGuards.includes(g)) continue;
          if (e.liveFill && !e.liveFill.postLiftHeld) return { ok: true, refilled: false };
          // (a guard belongs to its DOCUMENT: an address move inside the document keeps it — it ends with the document)
          // lane chrome-157 (vault-login round 32, ruling Q7): NO STATE ANSWERS «TRY AGAIN» WITHOUT BOUND — a guard with nothing in
          // memory to check with can never be checked, so the tab is held until it navigates (the unknown-typed hold)
          if (!g.prebuiltTargets || !Array.isArray(g.prebuiltTargets.targets) || !g.prebuiltTargets.targets.length) return holdUnknown(g.lfSnap);
          const gId = g.id || 0;
          // lane chrome-157 (round 32, law 4 — AN EXCEPTION IS COULD-NOT-LOOK): every wipe starts inside a promise, so a throw of any kind
          // is the same caught «could not look» (the fence holds, the next read checks again) — never an unhandled rejection of the hub
          const wr = await Promise.resolve().then(() => LF().wipeTabTypedInputs({
            call: (m, prm) => call(w, m, prm, e.sid, 1200),
            oopFrames: (ids, fn) => inspectOopIframes(w, ids, fn),
            targetId: e.targetId,
            contextId: g.lfSnap.isoContextId || 0,
            prebuiltTargets: g.prebuiltTargets,
            allowTypedHeuristic: false,
            maxScanPositions: wipeMaxScanPositions,
          })).catch(() => null);
          if ((e.navSeq || 0) !== startNavSeq) {
            return tabNeedsPostLiftRecheck(e) ? recheckPostLiftOnTab(w, e) : { ok: true, refilled: false };
          }
          if (!wr || !wr.ok) {
            return failedLook(g.lfSnap);
          }
          checkedGuardIds.push(gId);
          if (Number(wr.wiped) > 0 || !wr.verifiedEmpty || wr.tooMuchText) {
            refilledGuardIds.push(gId);
            lastSnap = g.lfSnap;
            if (wr.tooMuchText) anyTooMuch = true;
            if (!wr.verifiedEmpty) anyNotEmpty = true;
          }
        }
        if ((e.navSeq || 0) !== startNavSeq) {
          return tabNeedsPostLiftRecheck(e) ? recheckPostLiftOnTab(w, e) : { ok: true, refilled: false };
        }
        e.postLiftFails = 0;   // (every guard of the document was looked at: the failed looks start again from none)
        const wasHeld = Boolean(e.liveFill && e.liveFill.postLiftHeld);
        const heldGuardIds = wasHeld && Array.isArray(e.liveFill.heldGuardIds) ? e.liveFill.heldGuardIds : [];
        const verdict = BL().postLiftOutcomeVerdict({
          postLiftHeld: wasHeld,
          heldGuardIds,
          checkedGuardIds,
          refilledGuardIds,
          anyTooMuch,
        });
        if (verdict.action === 'hold_unknown') return holdUnknown(e.liveFill || lastSnap || (guards[0] && guards[0].lfSnap) || {});
        if (verdict.action === 'rearm_held' && lastSnap) {
          const prevHeldIds = wasHeld ? heldGuardIds.filter((id) => checkedGuardIds.includes(id) && refilledGuardIds.includes(id)) : [];
          const nextHeldIds = [...new Set([...prevHeldIds, ...verdict.heldGuardIds])];
          armLiveFillOnTab(w, e, {
            ...lastSnap,
            at: now(),
            holdReason: verdict.holdReason,
            postLiftHeld: true,
            heldGuardIds: nextHeldIds,
          }, { persist: true, noTimer: anyTooMuch });
          await syncTabFetchMode(w, e);
          if (e.liveFill && (anyTooMuch || anyNotEmpty)) fileCeilingWipeNotice(w, e, e.liveFill);
          return { ok: true, refilled: true };
        }
        if (verdict.action === 'lift_verified_empty' && e.liveFill && e.liveFill.postLiftHeld) {
          clearLiveFillOnTab(w, e, 'post-lift-verified-empty', { audit: false, persist: true });
        }
        return { ok: true, refilled: false };
      } catch {
        if ((e.navSeq || 0) !== startNavSeq) {
          return tabNeedsPostLiftRecheck(e) ? recheckPostLiftOnTab(w, e) : { ok: true, refilled: false };
        }
        return failedLook(e.liveFill || (Array.isArray(e.postLiftGuards) && e.postLiftGuards[0] && e.postLiftGuards[0].lfSnap) || {});
      } finally {
        if (e && e.postLiftChecking === p) e.postLiftChecking = null;
      }
    });
    e.postLiftChecking = p;
    e.postLiftCheckingNavSeq = startNavSeq;
    return p;
  }

  function clearLiveFillOnTab(w, e, why, { audit = false, persist = true, prebuiltTargets = null, heldVals = null } = {}) {
    if (!e) return;
    e.credPreArming = false;
    if (!e.liveFill) {
      if (why === 'navigated' || why === 'tab-closed' || why === 'url-changed') clearPostLiftOnTab(e, w);
      syncTabCredIntercept(w, e);
      return;
    }
    const lf = e.liveFill;
    // lane chrome-157 (主开发's amendment 1): AFTER A COLD RESTART NO HOLD LIFTS UNCHECKED — a restored hold stands through every
    // navigation until the vault is unlocked and its values are back (reviveRestoredHolds); only the tab's close ends it before
    if (lf.restored && why !== 'tab-closed' && why !== 'browser-stop' && why !== 'disarm') {
      syncTabCredIntercept(w, e);
      if (persist) syncPersistedLoginFences(w.profileId);
      return;
    }
    const cst = (why === 'navigated' || why === 'same-doc-nav' || why === 'submitted' || why === 'ceiling' || why === 'box-empty') ? checkTexts(w, e, lf, tabCheckTexts(e), heldVals) : 'clean';
    if (cst !== 'clean') {
      lf.valueShown = cst === 'shown';
      lf.holdReason = cst === 'shown' ? BL().HOLD_VALUE_SHOWN : BL().HOLD_UNKNOWN_TYPED;   // (shown: its refusal says so — a reload of this address keeps it, another page or another tab ends it; «cannot tell»: held, the next navigation checked again)
      if (e.liveFillTimer) { clearTimeout(e.liveFillTimer); e.liveFillTimer = null; }   // (no ceiling: the hold ends when the tab leaves the page)
      if (why === 'navigated') lf.docId = e.docId || lf.docId;   // (held on the document that shows it, until the tab goes on)
      if (cst === 'shown') fileValueShownNotice(w, e, lf);
      syncTabCredIntercept(w, e);
      if (persist) syncPersistedLoginFences(w.profileId);
      return;
    }
    endHoldNotice(w, e, lf);   // (its notice ends with it — by id, and by the key a past hub life filed it under)
    e.liveFill = null;
    try { LF().clearFilledSecretsForTarget(e.targetId, lf.isoContextId || 0); } catch { /* */ }
    if (Array.isArray(lf.stepOtpValues)) lf.stepOtpValues.length = 0;
    if (e.liveFillTimer) { clearTimeout(e.liveFillTimer); e.liveFillTimer = null; }
    if (lf.ceilingNoticeId) { try { forYou?.resolve?.(lf.ceilingNoticeId); } catch { /* */ } }
    if (e.inflightCredReqs) e.inflightCredReqs.clear();
    if ((why === 'submitted' || why === 'same-doc-nav' || why === 'ceiling' || why === 'box-empty') && prebuiltTargets && Array.isArray(prebuiltTargets.targets) && prebuiltTargets.targets.length > 0 && !lf.postLiftHeld) {
      const lfSnap = {
        urlAtFill: lf.urlAtFill,
        docId: lf.docId || e.docId || '',   // (lane chrome-157: a guard belongs to the fill's document — its row says which)
        origin: lf.origin,
        user: lf.user,
        loginId: lf.loginId,
        browserKey: lf.browserKey,
        mode: lf.mode || 'login',
        at: lf.at,
        isoContextId: lf.isoContextId || 0,
        credSigs: Array.isArray(lf.credSigs) ? [...lf.credSigs] : [],
        typedSlot: lf.typedSlot || null,
        rev: lf.rev ?? null,
        entryGen: lf.entryGen || null,
        typedPrevious: Boolean(lf.typedPrevious),
        unknownTyped: Boolean(lf.unknownTyped),
        also: Array.isArray(lf.also) ? lf.also.map((a) => ({ ...a })) : [],
        holdReason: '',
      };
      const nextGuards = Array.isArray(e.postLiftGuards) ? [...e.postLiftGuards] : [];
      nextGuards.push({ id: ++postLiftGuardSeq, lfSnap, prebuiltTargets });
      e.postLiftGuards = nextGuards.slice(-4);
      if (e.postLiftTimer) clearTimeout(e.postLiftTimer);
      const pt = setTimeout(() => { e.postLiftTimer = null; recheckPostLiftOnTab(w, e).catch(() => {}); }, 35);
      if (pt.unref) pt.unref();
      e.postLiftTimer = pt;
    } else if (why === 'navigated' || why === 'tab-closed' || why === 'url-changed') {
      clearPostLiftOnTab(e, w);
    }
    if (audit) recordFenceAudit(w.profileId, lf, why);
    if (persist) syncPersistedLoginFences(w.profileId);
    syncTabCredIntercept(w, e);
  }

  // lane chrome-157 (主开发's L4, 2026-11-15 09:16Z): A LIVE FILL ENDS WHEN ITS BOX NO LONGER HOLDS THE SECRET. At a READ about to be
  // refused on a plain live fill (no hold), the hub looks at THE FILLED BOXES ALONE — the ones the fill typed into, kept in the fill's
  // own isolated world — detect-only, by the wipe's hash matcher (no value goes into the page): none still in the page with a value
  // matching the fill ⇒ the fence lifts at once, as the ceiling lifts after a verified wipe (the one check on the address and title,
  // then the guard). It ends the wait for a submit the hub cannot recognise (a page that hashes the password before sending it, a
  // form that unmounts after its own request). A value a re-render moved into ANOTHER box is not seen here (a said limit). One look
  // at a time per tab: the reads that come while it runs share it; every read after it looks again (one evaluate in the fill's world).
  function plainLiveFill(e) {
    const lf = e && e.liveFill;
    return Boolean(lf && !lf.wiping && !lf.holdReason && !lf.postLiftHeld && !lf.restored && !lf.valueShown && !lf.unknownTyped && Number(lf.isoContextId) > 0);
  }
  function filledBoxLookDue(profileId, targetId) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open' || !targetId) return false;
    const tid = resolveKnownTargetId(w, targetId);
    const e = tid ? w.targets.get(tid) : null;
    return Boolean(e && e.sid && plainLiveFill(e));
  }
  function lookAtFilledBox(w, e) {
    if (!w || w.state !== 'open' || !e || !e.sid || !plainLiveFill(e)) return Promise.resolve({ looked: false });
    if (e.boxLook) return e.boxLook;
    const lf = e.liveFill;
    const p = Promise.resolve().then(async () => {
      const inMemVals = (LF().valuesForTarget?.(e.targetId, lf.isoContextId || 0) || []).filter((x) => typeof x === 'string' && x);
      const guardVals = (Array.isArray(e.postLiftGuards) ? e.postLiftGuards : []).flatMap((g) => (g && g.lfSnap ? scrubValuesForLogin(w.profileId, g.lfSnap.loginId, g.lfSnap.also) : []));   // (any secret the hub holds for this tab counts — an earlier fill's too)
      const svs = [...new Set([...scrubValuesForLogin(w.profileId, lf.loginId, lf.also), ...inMemVals, ...guardVals])];
      const otpVals = [...new Set(Array.isArray(lf.stepOtpValues) ? lf.stepOtpValues : [])];
      if (!svs.length && !otpVals.length) return { looked: false };
      const r = await Promise.resolve().then(() => LF().filledBoxHolds({ call: (m, prm) => call(w, m, prm, e.sid, 1200), contextId: lf.isoContextId, secretValues: svs, wholeOnlyValues: otpVals.length ? otpVals : null })).catch(() => null);
      if (e.liveFill !== lf || !plainLiveFill(e) || !r || !r.ok || r.holding > 0) return { looked: true, lifted: false };
      let preTargets = null;
      try { preTargets = LF().targetsForTab(e.targetId, lf.isoContextId || 0, svs, e.sid, { wholeOnlyValues: otpVals.length ? otpVals : null }); } catch { preTargets = null; }
      clearLiveFillOnTab(w, e, 'box-empty', { audit: true, persist: true, prebuiltTargets: preTargets, heldVals: [...svs, ...otpVals] });
      return { looked: true, lifted: e.liveFill !== lf };
    }).catch(() => ({ looked: true, lifted: false })).finally(() => { e.boxLook = null; });
    e.boxLook = p;
    return p;
  }
  function lookAtFilledBoxOn(profileId, targetId) {
    const w = watches.get(String(profileId || ''));
    const tid = w && targetId ? resolveKnownTargetId(w, targetId) : null;
    return lookAtFilledBox(w, tid ? w.targets.get(tid) : null);
  }

  function wipeAfterSameOriginSubmit(w, e, why = 'submitted') {
    const lf = e && e.liveFill;
    if (!lf || lf.wiping || lf.postLiftHeld || lf.unknownTyped || lf.holdReason === BL().HOLD_UNKNOWN_TYPED) return;
    lf.wiping = true;
    (async () => {
      let wipedEmpty = false, wipeTooMuch = false, wipeUnknownHold = false, preTargets = null, heldVals = [];
      try {
        if (w.state === 'open' && e.sid) {
          const inMemVals = (LF().valuesForTarget?.(e.targetId, lf.isoContextId || 0) || []).filter((x) => typeof x === 'string' && x);
          const svs = [...new Set([...scrubValuesForLogin(w.profileId, lf.loginId, lf.also), ...inMemVals])];
          const otpVals = [...new Set([...(Array.isArray(lf.stepOtpValues) ? lf.stepOtpValues : [])])];
          heldVals = [...svs, ...otpVals];
          const sigs = Array.isArray(lf.credSigs) ? lf.credSigs : [];
          const valSigs = [...svs, ...otpVals].map(credSigOf).filter(Boolean);
          const lacksAllSigs = sigs.length === 0 || !sigs.every((sg) => sg && valSigs.some((vs) => vs.len === sg.len && vs.sha256 === sg.sha256));
          if (svs.length > 0 || otpVals.length > 0) {
            if (!lacksAllSigs) {
              try { preTargets = LF().targetsForTab(e.targetId, lf.isoContextId || 0, svs, e.sid, { wholeOnlyValues: otpVals.length ? otpVals : null }); } catch { preTargets = null; }
            }
            const wr = await Promise.resolve().then(() => LF().wipeTabTypedInputs({
              call: (m, p) => call(w, m, p, e.sid, 1500),
              oopFrames: (ids, fn) => inspectOopIframes(w, ids, fn),
              targetId: e.targetId,
              contextId: lf.isoContextId || 0,
              secretValues: svs,
              wholeOnlyValues: otpVals.length ? otpVals : null,
              maxScanPositions: wipeMaxScanPositions,
            })).catch(() => null);
            wipedEmpty = !lacksAllSigs && Boolean(wr && wr.ok === true && wr.verifiedEmpty === true);
            wipeTooMuch = Boolean(wr && wr.tooMuchText);
          }
          if (lacksAllSigs) wipeUnknownHold = true;
        }
      } finally {
        if (e.liveFill === lf) {
          lf.wiping = false;
          const hadTooMuch = wipeTooMuch || lf.holdReason === BL().HOLD_TOO_MUCH_TEXT;
          if (wipedEmpty && !hadTooMuch) {
            clearLiveFillOnTab(w, e, why, { audit: false, persist: true, prebuiltTargets: preTargets, heldVals });
          } else if (wipeUnknownHold) {
            lf.unknownTyped = true;
            lf.holdReason = BL().HOLD_UNKNOWN_TYPED;
            lf.credSigs = [];
            if (e.liveFillTimer) { clearTimeout(e.liveFillTimer); e.liveFillTimer = null; }
            syncTabCredIntercept(w, e);
            fileCeilingWipeNotice(w, e, lf);
            syncPersistedLoginFences(w.profileId);
          } else if (hadTooMuch) {
            lf.holdReason = BL().HOLD_TOO_MUCH_TEXT;
            syncTabCredIntercept(w, e);
            fileCeilingWipeNotice(w, e, lf);
            syncPersistedLoginFences(w.profileId);
          }
        }
      }
    })().catch(() => { /* law 4: an exception is could-not-look — the fence stays (the finally above did not lift it) */ });
  }

  function expireLiveFillCeiling(w, e) {
    const lf = e && e.liveFill;
    if (!lf || lf.wiping || lf.valueShown || lf.restored) return;   // (a page that shows the value: no wipe can end that — the hold ends when the tab leaves the page; a restored hold waits for the vault)
    if (lf.unknownTyped || lf.holdReason === BL().HOLD_UNKNOWN_TYPED) {
      if (e.liveFillTimer) { clearTimeout(e.liveFillTimer); e.liveFillTimer = null; }
      lf.unknownTyped = true;
      lf.holdReason = BL().HOLD_UNKNOWN_TYPED;
      syncTabCredIntercept(w, e);
      fileCeilingWipeNotice(w, e, lf);
      syncPersistedLoginFences(w.profileId);
      return;
    }
    lf.wiping = true;
    if (e.liveFillTimer) { clearTimeout(e.liveFillTimer); e.liveFillTimer = null; }
    (async () => {
      let wipedEmpty = false, wipeTooMuch = false, wipeUnknownHold = false, preTargets = null, heldVals = [];
      try {
        if (w.state === 'open' && e.sid) {
          const activeGuards = lf.postLiftHeld && Array.isArray(e.postLiftGuards)
            ? e.postLiftGuards.filter((g) => g && g.lfSnap && g.prebuiltTargets && Array.isArray(g.prebuiltTargets.targets) && g.prebuiltTargets.targets.length > 0)
            : [];
          const heldIds = lf.postLiftHeld && Array.isArray(lf.heldGuardIds) ? lf.heldGuardIds : [];
          const missingHeldGuard = lf.postLiftHeld && (activeGuards.length === 0 || heldIds.some((id) => !activeGuards.some((g) => g.id === id)));
          if (missingHeldGuard) {
            wipeUnknownHold = true;
          } else {
            const guardPreTargets = activeGuards.length > 0
              ? { targets: activeGuards.flatMap((g) => g.prebuiltTargets.targets) }
              : null;
            if (lf.postLiftHeld) {
              if (!guardPreTargets) {
                wipeUnknownHold = true;
              } else {
                preTargets = guardPreTargets;
                const wr = await Promise.resolve().then(() => LF().wipeTabTypedInputs({
                  call: (m, p) => call(w, m, p, e.sid, 1500),
                  oopFrames: (ids, fn) => inspectOopIframes(w, ids, fn),
                  targetId: e.targetId,
                  contextId: lf.isoContextId || 0,
                  prebuiltTargets: guardPreTargets,
                  maxScanPositions: wipeMaxScanPositions,
                })).catch(() => null);
                wipedEmpty = Boolean(wr && wr.ok === true && wr.verifiedEmpty === true);
                wipeTooMuch = Boolean(wr && wr.tooMuchText);
              }
            } else {
              const inMemVals = (LF().valuesForTarget?.(e.targetId, lf.isoContextId || 0) || []).filter((x) => typeof x === 'string' && x);
              const svs = [...new Set([...scrubValuesForLogin(w.profileId, lf.loginId, lf.also), ...inMemVals])];
              const otpVals = [...new Set([...(Array.isArray(lf.stepOtpValues) ? lf.stepOtpValues : [])])];
              heldVals = [...svs, ...otpVals];
              const sigs = Array.isArray(lf.credSigs) ? lf.credSigs : [];
              const valSigs = [...svs, ...otpVals].map(credSigOf).filter(Boolean);
              const lacksAllSigs = sigs.length === 0 || !sigs.every((sg) => sg && valSigs.some((vs) => vs.len === sg.len && vs.sha256 === sg.sha256));
              if (svs.length > 0 || otpVals.length > 0) {
                if (!lacksAllSigs) {
                  try { preTargets = LF().targetsForTab(e.targetId, lf.isoContextId || 0, svs, e.sid, { wholeOnlyValues: otpVals.length ? otpVals : null }); } catch { preTargets = null; }
                }
                const wr = await Promise.resolve().then(() => LF().wipeTabTypedInputs({
                  call: (m, p) => call(w, m, p, e.sid, 1500),
                  oopFrames: (ids, fn) => inspectOopIframes(w, ids, fn),
                  targetId: e.targetId,
                  contextId: lf.isoContextId || 0,
                  secretValues: svs,
                  wholeOnlyValues: otpVals.length ? otpVals : null,
                  maxScanPositions: wipeMaxScanPositions,
                })).catch(() => null);
                wipedEmpty = !lacksAllSigs && Boolean(wr && wr.ok === true && wr.verifiedEmpty === true);
                wipeTooMuch = Boolean(wr && wr.tooMuchText);
              }
              if (lacksAllSigs) wipeUnknownHold = true;
            }
          }
        }
      } finally {
        if (e.liveFill === lf) {
          lf.wiping = false;
          if (wipedEmpty) {
            clearLiveFillOnTab(w, e, 'ceiling', { audit: true, persist: true, prebuiltTargets: preTargets, heldVals });
          } else if (wipeUnknownHold) {
            lf.unknownTyped = true;
            lf.holdReason = BL().HOLD_UNKNOWN_TYPED;
            lf.postLiftHeld = false;
            lf.heldGuardIds = [];
            lf.credSigs = [];
            syncTabCredIntercept(w, e);
            fileCeilingWipeNotice(w, e, lf);
            recordFenceAudit(w.profileId, lf, 'ceiling-hold:' + BL().HOLD_UNKNOWN_TYPED);
            syncPersistedLoginFences(w.profileId);
          } else if (wipeTooMuch) {
            lf.holdReason = BL().HOLD_TOO_MUCH_TEXT;
            syncTabCredIntercept(w, e);
            fileCeilingWipeNotice(w, e, lf);
            recordFenceAudit(w.profileId, lf, 'ceiling-hold:' + BL().HOLD_TOO_MUCH_TEXT);
            syncPersistedLoginFences(w.profileId);
          } else {
            fileCeilingWipeNotice(w, e, lf);
            const retryMs = Math.max(1000, Math.min(liveFillMaxMs, 30000));
            const timer = setTimeout(() => { if (e.liveFill === lf) expireLiveFillCeiling(w, e); }, retryMs);
            if (timer.unref) timer.unref();
            e.liveFillTimer = timer;
          }
        }
      }
    })().catch(() => { /* law 4: an exception is could-not-look — the finally above kept the fence and set its retry */ });
  }

  function armLiveFillOnTab(w, e, info, { persist = true, noTimer = false, retryMs = null } = {}) {
    if (!w || !e) return;
    e.credPreArming = false;
    if (e.liveFill && Array.isArray(e.liveFill.stepOtpValues)) e.liveFill.stepOtpValues.length = 0;
    if (e.liveFillTimer) { clearTimeout(e.liveFillTimer); e.liveFillTimer = null; }
    const parsedLogin = info.loginId ? BL().parseName(info.loginId) : null;
    const lf = {
      targetId: e.targetId,
      urlAtFill: String(info.urlAtFill || tabLoginUrlOf(e)),
      docId: info.restored ? String(info.docId || '') : String(info.docId || e.docId || ''),   // (a restored row's unknown document stays unknown — the same document)
      origin: String(info.origin || ''),
      user: info.user ? String(info.user) : ((parsedLogin && parsedLogin.user) || ''),
      loginId: info.loginId || null,
      browserKey: info.browserKey || null,
      mode: info.mode || 'login',
      at: Number(info.at) || now(),
      isoContextId: Number(info.isoContextId) || 0,
      credSigs: Array.isArray(info.credSigs) ? info.credSigs : [],
      typedSlot: BL().TYPED_SLOTS.includes(info.typedSlot) ? info.typedSlot : null,
      rev: Number.isInteger(info.rev) && info.rev >= 1 ? info.rev : null,
      entryGen: typeof info.entryGen === 'string' && BL().ENTRY_GEN_RE.test(info.entryGen) ? info.entryGen : null,
      stepOtpValues: Array.isArray(info.stepOtpValues) ? [...info.stepOtpValues] : [],
      typedPrevious: Boolean(info.typedPrevious),
      unknownTyped: Boolean(info.unknownTyped),
      also: Array.isArray(info.also) ? info.also.slice(-8).map((a) => ({ ...a })) : [],
      holdReason: info.holdReason ? String(info.holdReason) : '',
      site: typeof info.site === 'string' ? info.site.slice(0, 253) : '',   // (主开发's L1: Chrome's registrable domain of the filled document — where the value may go)
      postLiftHeld: Boolean(info.postLiftHeld),
      heldGuardIds: Array.isArray(info.heldGuardIds) ? [...info.heldGuardIds] : [],
      valueShown: Boolean(info.valueShown),
      restored: Boolean(info.restored),   // (lane chrome-157: a hold a cold restart brought back from the record — it waits for the vault)
      restoredWord: info.restoredWord ? String(info.restoredWord) : null,
      refs: Array.isArray(info.refs) ? info.refs.slice(0, 8).map(String) : null,
      wiping: false,
      ceilingNoticed: false,
      ceilingNoticeId: null,
    };
    e.liveFill = lf;
    bumpFillEpoch(w.profileId, e.targetId);
    if (!noTimer && !lf.unknownTyped && lf.holdReason !== BL().HOLD_UNKNOWN_TYPED) {
      const left = retryMs != null ? Math.max(0, Number(retryMs) || 0) : Math.max(0, liveFillMaxMs - (now() - lf.at));
      const timer = setTimeout(() => { if (e.liveFill === lf) expireLiveFillCeiling(w, e); }, left);
      if (timer.unref) timer.unref();
      e.liveFillTimer = timer;
    }
    if (persist) syncPersistedLoginFences(w.profileId);
    syncTabCredIntercept(w, e);
  }

  async function rearmLoginFences(w) {
    if (!w || !keeper || typeof keeper.loginFenceStateOf !== 'function') return;
    let st = { fences: [], scrubs: [] };
    try { st = keeper.loginFenceStateOf(w.profileId) || st; } catch { return; }
    if (Array.isArray(st.scrubs) && st.scrubs.length) {
      let names = scrubNamesByProfile.get(w.profileId);
      if (!names) { names = []; scrubNamesByProfile.set(w.profileId, names); }
      for (const s of st.scrubs) {
        if (!s || !s.name || names.some((x) => x.name === s.name)) continue;
        names.push({ name: s.name, at: Number(s.at) || now(), ...(s.id ? { id: s.id } : {}) });   // (its id: what a held row refers to)
      }
      hydratePersistedScrubs(w.profileId);
    }
    const prevStash = stashedTabFencesByProfile.get(w.profileId) || null;
    stashedTabFencesByProfile.delete(w.profileId);
    const curBrowserId = browserIdentityOf(w);
    const profileAlive = !keeper || typeof keeper.profile !== 'function' || Boolean(keeper.profile(w.profileId));
    const sameBrowser = Boolean(prevStash && curBrowserId && profileAlive && sameBrowserInstance(prevStash.browserId, curBrowserId) && prevStash.tabs instanceof Map);
    const handledTids = new Set();
    if (sameBrowser) {
      const keepLfTids = new Set();
      for (const [stashedTid, entry] of prevStash.tabs.entries()) {
        if (!entry) continue;
        const tid = resolveKnownTargetId(w, stashedTid);
        const e = tid ? w.targets.get(tid) : null;
        if (!e) {
          try { LF().clearFilledSecretsForTarget(stashedTid); if (tid) LF().clearFilledSecretsForTarget(tid); } catch { /* */ }
          if (entry.liveFill) recordFenceAudit(w.profileId, entry.liveFill, 'target-gone');
          sweepHoldNotices(holdKeyOf(w.profileId, stashedTid));   // (the tab closed while the watch was away: its notice with it)
          continue;
        }
        handledTids.add(e.targetId);
        if (!sameDocument(entry.docId, e.docId)) {
          // a NEW document while the watch was away: released — unless the hub, which still holds what was typed, finds it in the
          // new address or title (the one check), then the tab stays held
          const shownAfter = entry.liveFill ? valueShownByTab(w, e, { ...entry.liveFill, targetId: stashedTid }) : false;
          if (!shownAfter) {
            try { LF().clearFilledSecretsForTarget(stashedTid); LF().clearFilledSecretsForTarget(e.targetId); } catch { /* */ }
            if (entry.liveFill) recordFenceAudit(w.profileId, entry.liveFill, 'new-document');
            sweepHoldNotices(holdKeyOf(w.profileId, stashedTid));   // (released, checked clean: its notice ends with it)
            continue;
          }
          entry.liveFill = { ...entry.liveFill, valueShown: true, holdReason: BL().HOLD_VALUE_SHOWN, docId: e.docId || '' }; entry.postLiftGuards = [];
        }
        if (Array.isArray(entry.postLiftGuards) && entry.postLiftGuards.length) {
          e.postLiftGuards = entry.postLiftGuards.map((g) => ({
            id: g.id || (++postLiftGuardSeq),
            lfSnap: { ...g.lfSnap, isoContextId: 0 },
            prebuiltTargets: g.prebuiltTargets,
          })).slice(-4);
          const bk = entry.postLiftGuards[0]?.lfSnap?.browserKey || null;
          if (bk && !activeTabOfProfile(w.profileId, bk)) noteActiveTarget(w.profileId, bk, e.targetId);
          if (!entry.liveFill) {
            if (e.postLiftTimer) clearTimeout(e.postLiftTimer);
            const pt = setTimeout(() => { e.postLiftTimer = null; recheckPostLiftOnTab(w, e).catch(() => {}); }, 35);
            if (pt.unref) pt.unref();
            e.postLiftTimer = pt;
          }
        }
        if (entry.liveFill) {
          const lf0 = { ...entry.liveFill, targetId: e.targetId, isoContextId: 0 };
          keepLfTids.add(String(e.targetId));
          const isUnknown = Boolean(lf0.unknownTyped || lf0.holdReason === BL().HOLD_UNKNOWN_TYPED);
          const isTooMuch = lf0.holdReason === BL().HOLD_TOO_MUCH_TEXT;
          const alreadyExpired = !isUnknown && !isTooMuch && (now() - (Number(lf0.at) || 0) >= liveFillMaxMs);
          armLiveFillOnTab(w, e, isUnknown ? { ...lf0, credSigs: [], unknownTyped: true, holdReason: BL().HOLD_UNKNOWN_TYPED } : lf0, {
            persist: false,
            noTimer: isUnknown || isTooMuch || alreadyExpired || Boolean(lf0.valueShown),
          });
          await syncTabFetchMode(w, e);
          // (主开发 2026-11-15 item 3: a reconnect files nothing again — the notice it stood under stands, by its key; a notice the
          // owner marked done stays done)
          if (e.liveFill) { if (lf0.ceilingNoticed || isTooMuch) { e.liveFill.ceilingNoticed = true; e.liveFill.ceilingNoticeId = lf0.ceilingNoticeId || null; } if (lf0.valueShownNoticed) { e.liveFill.valueShownNoticed = true; e.liveFill.valueShownNoticeId = lf0.valueShownNoticeId || null; } }
          if (lf0.browserKey && !activeTabOfProfile(w.profileId, lf0.browserKey)) noteActiveTarget(w.profileId, lf0.browserKey, e.targetId);
          if (alreadyExpired) expireLiveFillCeiling(w, e);
        }
      }
      try {
        if (keepLfTids.size > 0) LF().clearFilledSecretsForProfileExcept(w.profileId, keepLfTids);
        else LF().clearFilledSecretsForProfile(w.profileId);
      } catch { /* */ }
    } else {
      stashedSnapshotsByProfile.delete(w.profileId);
      try { LF().clearFilledSecretsForProfile(w.profileId); } catch { /* */ }
    }
    for (const f of Array.isArray(st.fences) ? st.fences : []) {
      if (!f || !f.targetId || !f.origin) continue;
      const tid = resolveKnownTargetId(w, f.targetId);
      if (tid && handledTids.has(tid)) continue;
      const e = tid ? w.targets.get(tid) : null;
      if (!e) {
        recordFenceAudit(w.profileId, f, 'target-gone');
        sweepHoldNotices(holdKeyOf(w.profileId, f.targetId));   // (the tab is gone: its notice with it)
        continue;
      }
      // lane chrome-157 (主开发's amendment 1, 2026-11-15): AFTER A COLD RESTART NO HOLD LIFTS UNCHECKED — every row comes back
      // HELD, whatever its document is now, keeping its kind's word; it waits for the vault (the values come back with the names'
      // re-hydration), then reviveRestoredHolds checks it and each kind follows its ordinary rules
      armLiveFillOnTab(w, e, {
        targetId: e.targetId,
        urlAtFill: f.urlAtFill || f.origin,
        docId: f.docId || '',
        origin: f.origin,
        browserKey: f.browserKey || null,
        at: Number(f.at) || now(),
        credSigs: [],
        stepOtpValues: [],
        unknownTyped: true,
        holdReason: BL().HOLD_AWAIT_VAULT,
        restored: true,
        restoredWord: f.hold,
        refs: Array.isArray(f.refs) ? f.refs : [],
      }, { persist: false, noTimer: true });
      await syncTabFetchMode(w, e);
      recordFenceAudit(w.profileId, e.liveFill, 'rearm-hold:' + BL().HOLD_AWAIT_VAULT);
      if (f.hold === 'value_shown' && e.liveFill) e.liveFill.valueShownNoticed = true;   // (主开发 2026-11-15 item 3: never filed again — the notice of the hub's past life stands under its key, and one the owner marked done stays done)
      if (f.browserKey && !activeTabOfProfile(w.profileId, f.browserKey)) noteActiveTarget(w.profileId, f.browserKey, e.targetId);
    }
    if (w.state === 'open') w.fencesRearmed = true;   // (the fences are back: from here the memory is the record's source)
    syncPersistedLoginFences(w.profileId);
    if (logins && typeof logins.isLocked === 'function' && !logins.isLocked()) { hydratePersistedScrubs(w.profileId); await reviveRestoredHolds(w); }
  }

  /** lane chrome-157 (amendment 1): THE VAULT IS OPEN AND THE VALUES ARE BACK — each restored hold is checked at once (its present
   *  address and title against ITS entries' values, found by the row's refs), then follows its kind's ordinary rules: shown ⇒ the
   *  value-shown hold; a new document, clean ⇒ lifted; the same document ⇒ live / held / guard / too_much_text / unknown_typed
   *  as before. An entry that is gone (or a row with no refs) can never be checked: the tab stays held until it is closed. */
  async function reviveRestoredHolds(w) {
    if (!w || w.state !== 'open') return;
    const pid = w.profileId;
    const names = scrubNamesByProfile.get(pid) || [];
    const missing = scrubMissingByProfile.get(pid) || new Set();
    for (const e of [...w.targets.values()]) {
      const lf = e.liveFill;
      if (!lf || !lf.restored) continue;
      const refNames = (lf.refs || []).map((r) => names.find((n) => n.id === r)).filter(Boolean).map((n) => n.name);
      const gone = !refNames.length || refNames.length !== (lf.refs || []).length || refNames.some((n) => missing.has(n));
      const vals = gone ? [] : refNames.flatMap((n) => scrubValuesForLogin(pid, n));
      if (gone || !vals.length) {
        if (lf.holdReason !== BL().HOLD_ENTRY_GONE) { lf.holdReason = BL().HOLD_ENTRY_GONE; recordFenceAudit(pid, lf, 'rearm-hold:' + BL().HOLD_ENTRY_GONE); }
        continue;
      }
      const word = lf.restoredWord || 'live';
      const base = { targetId: e.targetId, urlAtFill: lf.urlAtFill, docId: lf.docId, origin: lf.origin, browserKey: lf.browserKey, at: lf.at, loginId: refNames[0], also: refNames.slice(1).map((n) => ({ loginId: n })), credSigs: vals.map(credSigOf).filter(Boolean), stepOtpValues: [], isoContextId: 0 };
      const st = checkTexts(w, e, base, tabCheckTexts(e), vals);
      if (st !== 'clean') {
        armLiveFillOnTab(w, e, st === 'shown' ? { ...base, valueShown: true, holdReason: BL().HOLD_VALUE_SHOWN } : { ...base, unknownTyped: true, holdReason: BL().HOLD_UNKNOWN_TYPED }, { persist: false, noTimer: true });
        if (st === 'shown' && word === 'value_shown' && e.liveFill) e.liveFill.valueShownNoticed = true;   // (the same hold as before the restart: its notice stands — never filed again)
        else if (st === 'shown') fileValueShownNotice(w, e, e.liveFill);
      } else if (!sameDocument(lf.docId, e.docId)) {
        e.liveFill = null; endHoldNotice(w, e, lf);   // (a new document, checked clean: lifted)
        recordFenceAudit(pid, lf, 'revived-clean-new-document');
      } else if (word === 'guard' || word === 'held') {
        const g = { id: ++postLiftGuardSeq, lfSnap: { ...base }, prebuiltTargets: (() => { try { return LF().targetsForTab(e.targetId, 0, vals, e.sid, {}); } catch { return null; } })() };
        e.postLiftGuards = [g];
        if (word === 'held') armLiveFillOnTab(w, e, { ...base, at: now(), postLiftHeld: true, heldGuardIds: [g.id] }, { persist: false });
        else { e.liveFill = null; endHoldNotice(w, e, lf); }
      } else if (word === 'too_much_text') {
        armLiveFillOnTab(w, e, { ...base, holdReason: BL().HOLD_TOO_MUCH_TEXT }, { persist: false, noTimer: true });
        if (e.liveFill) e.liveFill.ceilingNoticed = true;   // (as before the restart: its ceiling has run, its notice stands — it waits for the tab to go on)
      } else if (word === 'unknown_typed') {
        armLiveFillOnTab(w, e, { ...base, unknownTyped: true, holdReason: BL().HOLD_UNKNOWN_TYPED }, { persist: false, noTimer: true });
      } else {
        armLiveFillOnTab(w, e, { ...base, at: now() }, { persist: false });   // (live, or a value no longer shown on the same document: a live fill AGAIN — its ceiling from now — with its guard to come)
      }
      await syncTabFetchMode(w, e);
    }
    syncPersistedLoginFences(pid);
  }

  function clearProfileLoginFencesOnStop(pid, w) {
    const active = [];
    if (w) {
      for (const e of w.targets.values()) {
        if (e.inflightCredReqs) e.inflightCredReqs.clear();
        clearPostLiftOnTab(e);
        e.snapshotRefs = null;
        if (!e.liveFill) continue;
        active.push(e.liveFill);
        if (Array.isArray(e.liveFill.stepOtpValues)) e.liveFill.stepOtpValues.length = 0;
        if (e.liveFill.ceilingNoticeId) { try { forYou?.resolve?.(e.liveFill.ceilingNoticeId); } catch { /* */ } }
        if (e.liveFillTimer) { clearTimeout(e.liveFillTimer); e.liveFillTimer = null; }
        e.liveFill = null;
      }
    } else if (keeper && typeof keeper.loginFenceStateOf === 'function') {
      try { active.push(...(keeper.loginFenceStateOf(pid).fences || [])); } catch { /* */ }
    }
    for (const f of active) recordFenceAudit(pid, f, 'browser-stop');
    try { LF().clearFilledSecretsForProfile(pid); } catch { /* */ }
    knownFenceProfiles.delete(String(pid));
    scrubByProfile.delete(pid);
    scrubNamesByProfile.delete(pid);
    scrubCheckByProfile.delete(pid);
    scrubMissingByProfile.delete(pid);
    scrubCompiledByProfile.delete(pid);
    endScrubWorker(String(pid), 'the profile ended');   // 主开发 r2445 law 4: the frame scrub's worker ends with the profile
    scrubStartedAt.delete(String(pid)); scrubWithheld.delete(String(pid)); scrubValuesVer.delete(pid);   // r3342 (6): its per-profile facts leave with it
    sweepHoldNotices(`${HOLD_KEY}${pid}:`);   // (lane chrome-157: every hold notice of the profile ends with its holds, a past hub life's too)
    activeTabByProfile.delete(pid);
    stashedSnapshotsByProfile.delete(pid);
    dropSnapSlots(pid); // B-21cc (r2849 (4)): the slots go with the browser's stop
    stashedTabFencesByProfile.delete(pid);
    fillEpochsByProfile.delete(pid);
    credSigsByProfile.delete(pid);
    credRequestIdsByProfile.delete(pid);
    if (keeper && typeof keeper.saveLoginFenceState === 'function') {
      try { keeper.saveLoginFenceState(pid, { fences: [], scrubs: [] }); } catch { /* optional */ }
    }
  }

  function fencedTargetsFor(target) {
    const pid = String((target && target.profileId) || '');
    const w = watches.get(pid);
    if (!w || w.state !== 'open') {
      if (keeper && typeof keeper.loginFenceStateOf === 'function') {
        // round wm6qxcqcw (3): a HELD profile registry is no «no fences» — fail CLOSED (the answer says held; its caller checks the tab)
        let st = null; try { st = keeper.loginFenceStateOf(pid); } catch (e) { if (e && e.code === 'store_unread') return Object.assign([], { held: true }); st = null; }
        const fences = st && Array.isArray(st.fences) ? st.fences : [];
        return fences.filter((f) => f && f.targetId && f.origin).map((f) => ({ targetId: String(f.targetId), origin: String(f.origin) }));
      }
      return [];
    }
    const scope = scopeFor(target);
    const out = [];
    for (const e of w.targets.values()) {
      const lf = effectiveLiveFillOf(e);
      if (lf && inScope(scope, e.targetId)) out.push({ targetId: e.targetId, origin: lf.origin });
    }
    return out;
  }

  function unwatchedHoldReasonOf(pid, targetId) {
    const stash = stashedTabFencesByProfile.get(pid);
    if (stash && stash.tabs instanceof Map && targetId) {
      const entry = stash.tabs.get(String(targetId));
      if (entry) {
        if (entry.liveFill) return entry.liveFill.holdReason || '';
        return BL().HOLD_UNKNOWN_TYPED;
      }
    }
    return BL().HOLD_UNKNOWN_TYPED;
  }

  function liveFillVerdictFor(target, { verb = '', argv = null, batchVerbs = null, targetId = null } = {}) {
    const pid = String((target && target.profileId) || '');
    const w = watches.get(pid);
    const explicitTarget = targetId || extractArgvTab(argv);
    if (!fencesLive(w)) {   // (lane chrome-157, round 32: until the fences are re-armed every road answers from the record)
      if (keeper && typeof keeper.loginFenceStateOf === 'function') {
        // the B-f276 remainder (bl-jobs): the fences of a HELD registry are unread — the verb is refused (it read «none»: fail OPEN)
        let st = null; try { st = keeper.loginFenceStateOf(pid); } catch (e) { if (e && e.code === 'store_unread') return { ok: false, code: 'store_unread', error: e.message }; st = null; }
        const fences = st && Array.isArray(st.fences) ? st.fences : [];
        if (fences.length) {
          const bk = parentKey(target && target.browserKey);
          const act = activeTabOfProfile(pid, bk);
          const wantTid = explicitTarget ? String(explicitTarget).toUpperCase() : (act ? String(act).toUpperCase() : null);
          const pf = wantTid && wantTid !== '__UNKNOWN__'
            ? fences.find((f) => String(f.targetId || '').toUpperCase() === wantTid || (wantTid.length >= 4 && String(f.targetId || '').toUpperCase().startsWith(wantTid)))
            : fences.find((f) => !f.browserKey || !bk || parentKey(f.browserKey) === bk);
          if (pf) {
            return BL().liveFillVerdict({ verb, argv, batchVerbs, origin: pf.origin, holdReason: unwatchedHoldReasonOf(pid, pf.targetId) });
          }
        }
      }
      return { ok: true };
    }
    let maxFillAt = 0, any = false;
    const scope = scopeFor(target);
    for (const e of w.targets.values()) {
      const lf = effectiveLiveFillOf(e);
      if (!lf) continue;
      any = true;
      if (inScope(scope, e.targetId) && (lf.at || 0) > maxFillAt) maxFillAt = lf.at || 0;
    }
    if (!any) return { ok: true };
    const batchSwitchesTab = verb === 'batch' && Array.isArray(batchVerbs) && batchVerbs.some((v) => String(v || '').trim().split(/\s+/)[0] === 'tab');
    let cands = null;
    if (explicitTarget) {
      const tid = resolveKnownTargetId(w, explicitTarget);
      if (tid) {
        const e = w.targets.get(tid);
        cands = e && inScope(scope, e.targetId) ? [e] : [];
      }
    } else if (!batchSwitchesTab) {
      const actEntry = activeTabEntryOfProfile(pid, target && target.browserKey);
      const actE = actEntry && actEntry.tid ? w.targets.get(actEntry.tid) : null;
      if (actE && inScope(scope, actE.targetId) && (effectiveLiveFillOf(actE) || (actEntry.at || 0) >= maxFillAt)) {
        cands = [actE];
      }
    }
    if (!cands) cands = [...w.targets.values()].filter((e) => effectiveLiveFillOf(e) && inScope(scope, e.targetId));
    const t = now();
    for (const e of cands) {
      if (!e) continue;
      if (e.liveFill && t - (Number(e.liveFill.at) || 0) >= liveFillMaxMs && !e.liveFill.wiping && !e.liveFill.ceilingNoticed) expireLiveFillCeiling(w, e);
      const lf = effectiveLiveFillOf(e);
      if (lf) return BL().liveFillVerdict({ verb, argv, batchVerbs, origin: lf.origin, holdReason: lf.holdReason || '' });
    }
    return { ok: true };
  }

  function liveFillOnTarget(profileId, targetId = null) {
    const pid = String(profileId || '');
    const w = watches.get(pid);
    if (!fencesLive(w)) {   // (lane chrome-157, round 32: until the fences are re-armed every road answers from the record)
      if (keeper && typeof keeper.loginFenceStateOf === 'function') {
        // round wm6qxcqcw (3): a HELD profile registry is no «no live fill» — fail CLOSED: a held fence (its callers scrub, mask, refuse)
        let st = null; try { st = keeper.loginFenceStateOf(pid); } catch (e) { if (e && e.code === 'store_unread') return { targetId: targetId ? String(targetId) : null, origin: null, held: true, holdReason: 'store_unread' }; st = null; }
        const fences = st && Array.isArray(st.fences) ? st.fences : [];
        if (fences.length) {
          const hit = targetId
            ? fences.find((f) => String(f.targetId || '').toUpperCase() === String(targetId).toUpperCase()) || null
            : (fences[0] || null);
          return hit ? { ...hit, holdReason: unwatchedHoldReasonOf(pid, hit.targetId) } : null;
        }
      }
      return null;
    }
    const check = (e) => {
      if (!e) return null;
      if (e.liveFill && now() - (Number(e.liveFill.at) || 0) >= liveFillMaxMs && !e.liveFill.wiping && !e.liveFill.ceilingNoticed) expireLiveFillCeiling(w, e);
      return effectiveLiveFillOf(e);
    };
    if (targetId) {
      const tid = resolveKnownTargetId(w, targetId);
      return check(tid ? w.targets.get(tid) : null);
    }
    for (const e of w.targets.values()) { const lf = check(e); if (lf) return lf; }
    return null;
  }

  function hasPostLiftGuard(profileId, targetId = null) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open') return false;
    if (targetId) {
      const tid = resolveKnownTargetId(w, targetId);
      const e = tid ? w.targets.get(tid) : null;
      return tabNeedsPostLiftRecheck(e);
    }
    for (const e of w.targets.values()) {
      if (tabNeedsPostLiftRecheck(e)) return true;
    }
    return false;
  }

  async function recheckPostLift(profileId, targetId = null) {
    const w = watches.get(String(profileId || ''));
    if (!w || w.state !== 'open') return { ok: true, refilled: false };
    if (targetId) {
      const tid = resolveKnownTargetId(w, targetId);
      const e = tid ? w.targets.get(tid) : null;
      return e ? recheckPostLiftOnTab(w, e) : { ok: true, refilled: false };
    }
    let anyRefilled = false;
    for (const e of [...w.targets.values()]) {
      if (tabNeedsPostLiftRecheck(e)) {
        const r = await recheckPostLiftOnTab(w, e);
        if (r && r.checkFailed) return r;
        if (r && r.refilled) anyRefilled = true;
      }
    }
    return { ok: true, refilled: anyRefilled };
  }

  async function recheckPostLiftFor(target, { verb = '', argv = null, batchVerbs = null, targetId = null } = {}) {
    const pid = String((target && target.profileId) || '');
    const w = watches.get(pid);
    if (!w || w.state !== 'open') return { ok: true, refilled: false };
    if (BL().liveFillVerdict({ verb, argv, batchVerbs, origin: 'https://x.test' }).ok) return { ok: true, refilled: false };
    const explicitTarget = targetId || extractArgvTab(argv);
    const batchSwitchesTab = verb === 'batch' && Array.isArray(batchVerbs) && batchVerbs.some((v) => String(v || '').trim().split(/\s+/)[0] === 'tab');
    const scope = scopeFor(target);
    {   // (主开发's L4) a read about to be refused on a plain live fill looks at the filled box first — it lifts at once when the box no longer holds the secret
      const xTid = explicitTarget ? resolveKnownTargetId(w, explicitTarget) : null;
      for (const e of [...w.targets.values()]) if (plainLiveFill(e) && e.sid && inScope(scope, e.targetId) && (!xTid || e.targetId === xTid)) await lookAtFilledBox(w, e);
    }
    let maxGuardAt = 0, anyGuard = false;
    for (const e of w.targets.values()) {
      if (!tabNeedsPostLiftRecheck(e)) continue;
      anyGuard = true;
      if (inScope(scope, e.targetId)) {
        for (const g of (e.postLiftGuards || [])) {
          if (g && g.lfSnap && (g.lfSnap.at || 0) > maxGuardAt) maxGuardAt = g.lfSnap.at || 0;
        }
      }
    }
    if (!anyGuard) return { ok: true, refilled: false };
    let cands = null;
    if (explicitTarget) {
      const tid = resolveKnownTargetId(w, explicitTarget);
      const e = tid ? w.targets.get(tid) : null;
      cands = e && inScope(scope, e.targetId) ? [e] : [];
    } else if (!batchSwitchesTab) {
      const actEntry = activeTabEntryOfProfile(pid, target && target.browserKey);
      const actE = actEntry && actEntry.tid ? w.targets.get(actEntry.tid) : null;
      if (actE && inScope(scope, actE.targetId) && (tabNeedsPostLiftRecheck(actE) || (actEntry.at || 0) >= maxGuardAt)) {
        cands = [actE];
      }
    }
    if (!cands) cands = [...w.targets.values()].filter((e) => tabNeedsPostLiftRecheck(e) && inScope(scope, e.targetId));
    let anyRefilled = false;
    for (const e of cands) {
      if (tabNeedsPostLiftRecheck(e)) {
        const r = await recheckPostLiftOnTab(w, e);
        if (r && r.checkFailed) return r;
        if (r && r.refilled) anyRefilled = true;
      }
    }
    return { ok: true, refilled: anyRefilled };
  }

  // B-5f2e (the coordinator's ruling 2026-11-19 20:18Z, line 2): A FRAME OF ANOTHER SITE — the browser runs it in its own
  // process, the driver sees nothing in it (measured). Its `iframe` target arrives with the watch's discovered targets (no call
  // of ours): kept per watch (bounded), dropped at targetDestroyed; read by otherSiteFramesFor at ZERO calls (the snapshot's N2)
  const FRAME_TARGETS_MAX = 256;
  function noteFrameTarget(w, info) {
    const tid = String((info && info.targetId) || '').slice(0, 64);
    if (!tid) return;
    if (!w.frameTargets) w.frameTargets = new Map();
    const m = w.frameTargets;
    if (!m.has(tid) && m.size >= FRAME_TARGETS_MAX) m.delete(m.keys().next().value);
    m.set(tid, { url: String(info.url || '').slice(0, 4096), parent: String(info.parentFrameId || '').slice(0, 64) });
  }
  /** B-5f2e: the frames of another site on the conversation's tab (the scoped tab a verb ran on) ⇒ `{origins, text}`, else null.
   *  From the kept targets only — never a CDP call (a snapshot stays at zero calls); a frame is the tab's by its parent chain. */
  /** B-5f2e: the child frame ids a tab already holds when the watch meets it (Page.enable replays no frameAttached) — from the
   *  frame tree the enable reads anyway (no call of its own); bounded as frameAttached is */
  function seedChildFrames(e, tree) {
    if (!e || !tree || typeof tree !== 'object') return;
    const walk = (t, d) => { for (const c of Array.isArray(t && t.childFrames) ? t.childFrames : []) { const id = c && c.frame && c.frame.id ? String(c.frame.id).slice(0, 64) : ''; if (!id) continue; if (!e.childFrames) e.childFrames = new Set(); if (e.childFrames.size < 256) e.childFrames.add(id); if (d < 8) walk(c, d + 1); } };
    walk(tree, 0);
  }
  /** B-5f2e: the tab's top document changed ⇒ its kept frames (and the child ids its page attached) belong to the old document */
  function dropTabFrames(w, e) {
    if (w.frameTargets && w.frameTargets.size) for (const f of ST.tabFrameTargets(w.frameTargets, e.targetId, e.childFrames || null)) w.frameTargets.delete(f.targetId);
    e.childFrames = null;
  }
  function otherSiteFramesFor(target, { targetId = null, kind = 'selector' } = {}) {   // r150: `kind` = which true sentence (browser-stuck otherSiteFrameText)
    const w = watches.get(String((target && target.profileId) || ''));
    if (!w || w.state !== 'open' || !w.frameTargets || !w.frameTargets.size) return null;
    const e = pickScopedTabFor(w, target, { targetId });
    if (!e) return null;
    const origins = ST.otherSiteFrameOrigins({ tabUrl: e.url, frames: ST.tabFrameTargets(w.frameTargets, e.targetId, e.childFrames || null) });
    return origins.length ? { origins, text: ST.otherSiteFrameText(origins, null, { kind }) } : null;
  }

  async function inspectOopIframes(w, treeFrameIds, visit) {
    if (!w || w.state !== 'open' || !(treeFrameIds instanceof Set) || !treeFrameIds.size || typeof visit !== 'function') return;
    const tgRes = await call(w, 'Target.getTargets', {}, null, 2000);
    const infos = tgRes && !tgRes.timeout && !tgRes.error && tgRes.result && Array.isArray(tgRes.result.targetInfos) ? tgRes.result.targetInfos : [];
    for (const ti of infos.slice(0, 64)) {
      if (!ti || ti.type !== 'iframe' || !ti.targetId) continue;
      const pFid = ti.parentFrameId ? String(ti.parentFrameId) : '';
      if (!pFid || !treeFrameIds.has(pFid)) continue;
      const att = await call(w, 'Target.attachToTarget', { targetId: String(ti.targetId), flatten: true }, null, 2000);
      const oopSid = att && !att.timeout && !att.error && att.result && att.result.sessionId ? String(att.result.sessionId) : '';
      if (!oopSid) continue;
      try {
        await visit({ targetId: String(ti.targetId), url: String(ti.url || ''), call: (m, p) => call(w, m, p, oopSid, 2000) });
      } finally {
        await settle(call(w, 'Target.detachFromTarget', { sessionId: oopSid }, null, 1500));
      }
    }
  }

  /** B-21cc (r2491; round w41hvnm5h): THE CONVERSATION's CURRENT TAB for every road that feeds a vault fill — the fill itself and
   *  its snapshot's references (`noteSnapshot`): a tab an in-process caller names, else the keeper's own read (`currentTabOf`: the
   *  session's own `tab list`, the row marked active). A conversation with no tab of its own in scope is refused before its session
   *  is asked (a never-used session's `tab list` would bind a tab); unreadable ⇒ refused by name. Never the old pick.
   *  → { ok: true, targetId } | { ok: false, code, error } */
  async function currentTabFor(w, target, targetId = null) {
    if (targetId) return { ok: true, targetId };
    if (!hasScopedTab(w, target)) return { ok: false, code: 'target_not_found', error: 'no active tab in scope to fill — open a page first' };
    let cur = null;
    try { cur = keeper && typeof keeper.currentTabOf === 'function' ? await keeper.currentTabOf({ profileId: String((target && target.profileId) || ''), browserKey: (target && target.browserKey) || '', ephemeral: Boolean(target && target.ephemeral) }) : null; } catch { cur = null; }
    if (!cur || !cur.ok || !cur.targetId) return { ok: false, code: 'current_tab_unreadable', error: (cur && cur.error) || 'VibeSpace could not read which tab this conversation is on — nothing was filled; try again' };
    if (w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    return { ok: true, targetId: cur.targetId };
  }
  /** B-21cc (r2491): whether the conversation has ANY tab of its own in scope here (asked before its session is). */
  function hasScopedTab(w, target) {
    const scope = scopeFor(target);
    for (const x of w.targets.values()) if (inScope(scope, x.targetId) && x.sid) return true;
    return false;
  }
  function pickScopedTabFor(w, target, { targetId = null } = {}) {
    const pid = w.profileId;
    const scope = scopeFor(target);
    if (targetId) {
      const tid = resolveKnownTargetId(w, targetId);
      const e = tid ? w.targets.get(tid) : null;
      return e && inScope(scope, e.targetId) && e.sid ? e : null;
    }
    const actEntry = activeTabEntryOfProfile(pid, target && target.browserKey);
    const actE = actEntry && actEntry.tid ? w.targets.get(actEntry.tid) : null;
    if (actE && inScope(scope, actE.targetId) && actE.sid) return actE;
    const tabs = [...w.targets.values()].filter((x) => inScope(scope, x.targetId) && x.sid);
    return tabs.filter((x) => /^https?:/.test(tabLoginUrlOf(x))).sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0))[0] || tabs[0] || null;
  }

  /** B-21cc (主开发 r2849 (2)): THE MOVERS, IN ONE LIST — every event the hub sees that can move the tab a conversation's driver is
   *  on; EVERY bump of the tab epoch goes through here (test-browser-login's census walks the callers). `profileId` alone = the whole
   *  browser (a page born or gone, the watch blind, the person's tab act — it fails closed for every conversation on it); with
   *  `browserKey` = that conversation, on every browser (its own tab verbs on both roads, at their start and at their end; a
   *  takeover; a handback). A mover the hub cannot see (the raw driver run outside `vibespace-browser`; a click on Chrome's own tab
   *  strip; the driver following a popup SOME TIME AFTER its birth — the birth's bump came before the snapshot's /resolve, the follow
   *  after the snapshot) costs a refusal by name, or a reference resolved on the read tab by its own role and name — never a wrong
   *  site: the site is judged there. A browser-wide mover on a SHARED profile (another conversation's `tab new`, a page it opened or
   *  closed, a re-armed watch) refuses THIS conversation's next fill by reference too: it fails closed, and the refusal names the
   *  cure (a fresh `snapshot -i`, or a CSS selector). */
  const TAB_MOVERS = Object.freeze(['tab-verb', 'tab-route', 'page-born', 'page-gone', 'watch-down', 'person-tab-act', 'takeover', 'handback']);
  function moveTab(why, { profileId = null, browserKey = null } = {}) {
    if (!TAB_MOVERS.includes(why)) return { ok: false, error: `not a tab mover: ${why}` };
    const bk = browserKey ? parentKey(browserKey) : '';
    const pid = profileId ? String(profileId) : '';
    if (!bk && !pid) return { ok: false, error: 'a tab mover names a browser or a conversation' };
    const rec = { seq: ++tabMoveSeq, at: clockNow(), why };
    if (bk) tabMoves.byConv.set(bk, rec); else tabMoves.byProfile.set(pid, rec);
    return { ok: true, seq: rec.seq };
  }
  /** The epoch a conversation's tab stands at on one browser: the newest mover of the browser or of the conversation. */
  function tabEpochOf(profileId, browserKey) {
    const P = tabMoves.byProfile.get(String(profileId || ''));
    const C = browserKey ? tabMoves.byConv.get(parentKey(browserKey)) : null;
    return { seq: Math.max(P ? P.seq : 0, C ? C.seq : 0), at: Math.max(P ? P.at : 0, C ? C.at : 0) };
  }
  const slotKeyOf = (profileId, browserKey) => `${String(profileId || '')}\0${String(browserKey || '') || '*'}`; // r2992 (2): one per DRIVER — the browser's own key, a helper's apart from its parent's
  /** r2849 (4): a browser's slots (its stop, a fresh start), or one driver's (its lease ended) — never another's. r3159 (1): a MOVER
   *  IS NEVER FORGOTTEN WHILE A LIVE SLOT MAY BE JUDGED AGAINST IT — dropping one makes a later note read «no mover since the
   *  /resolve», which is NOT failing closed. So a conversation's moves entry goes only when it holds no lease on ANY browser (a keeper
   *  that cannot say keeps it), and a browser's own mover STAYS at its stop (a stop between a snapshot's /resolve and its note is a
   *  mover; one entry a browser, bounded by the profiles). */
  function dropSnapSlots(profileId, browserKey = null) {
    const pid = String(profileId || '');
    if (!pid) return;
    if (browserKey) {
      snapSlots.delete(slotKeyOf(pid, browserKey));
      if (parentKey(browserKey) === String(browserKey) && !holdsAnyLease(browserKey)) tabMoves.byConv.delete(String(browserKey));
      return;
    }
    for (const k of [...snapSlots.keys()]) if (k.startsWith(`${pid}\0`)) snapSlots.delete(k);
  }
  /** r3159 (1): whether a conversation still holds a lease on any browser (the keeper's registry; unknown ⇒ it does). */
  function holdsAnyLease(browserKey) { try { return !(keeper && typeof keeper.leasesFor === 'function') || (keeper.leasesFor(String(browserKey)) || []).length > 0; } catch { return true; } }
  /** A suite's look at the moves' two maps (r2992 (4)): their keys only. */
  function tabMovesOf() { return { conversations: [...tabMoves.byConv.keys()], browsers: [...tabMoves.byProfile.keys()] }; }
  function writeSnapshotRefs(w, e, specs, { seq, at }) {
    e.snapshotRefs = { specs, resolved: new Map(), map: null, at, navSeq: e.navSeq || 0, seq };
    e.snapshotExpiredByNav = false;
    const sm = stashedSnapshotsByProfile.get(w.profileId);
    if (sm) { sm.delete(e.targetId); if (!sm.size) stashedSnapshotsByProfile.delete(w.profileId); }
  }

  /** Record lightweight `@ref` descriptors after a successful `snapshot` — B-21cc (主开发 r2849 (1)): NO READ (no spawn, no browser
   *  call: the release's N2). The driver's snapshot read its session's CURRENT tab, which the note cannot know without a read: it keeps
   *  the conversation's NEWEST snapshot in ONE slot — the references, the tab epoch, each in-scope tab's navigation count (r2849 (4):
   *  nothing more) — and the FILL, which reads the current tab anyway, decides (`snapshotForFill`). A mover at or after the verb's own
   *  /resolve instant (`since`, the server's clock: the route passes it; 0 = unknown) leaves the slot UNKNOWN — a fill by reference
   *  then refuses by name. An in-process caller that NAMES its tab writes there (no read either). */
  async function noteSnapshot(target, opts = {}) {
    const pid = String((target && target.profileId) || '');
    const w = watches.get(pid);
    const normOpts = typeof opts === 'string'
      ? { parsedRefs: require('../browser-verbs.js').parseSnapshotRefs(opts), targetId: null }
      : (Array.isArray(opts) ? { parsedRefs: opts, targetId: null } : (opts || {}));
    const parsedRefs = normOpts.parsedRefs;
    const targetId = normOpts.targetId || null;
    const hasSince = Object.prototype.hasOwnProperty.call(normOpts, 'since');
    const since = Number(normOpts.since) || 0;
    if (!Array.isArray(parsedRefs)) return { ok: false, count: 0 };
    // r2992 (1): a snapshot the watch could not see (not open — a blackout) still REPLACES the slot, as UNKNOWN: the next fill by
    // reference refuses by name — never the OLDER snapshot a stash restores on its tab when the watch returns
    if (!w || w.state !== 'open') { if (pid) snapSlots.set(slotKeyOf(pid, target && target.browserKey), { seq: ++snapSeq, at: now(), tid: null, epoch: null, navSeqs: null, specs: null, unknown: 'blackout' }); return { ok: false, count: 0, code: 'not_watched' }; }
    const specs = new Map();
    for (const pr of parsedRefs.slice(0, 16384)) {
      if (!pr || typeof pr.ref !== 'string' || !pr.ref) continue;
      const rawKey = pr.ref.startsWith('@') ? pr.ref : `@${pr.ref}`;
      const key = rawKey.slice(0, 64);
      if (!/^@[A-Za-z0-9_-]+$/.test(key)) continue;
      specs.set(key, {
        ref: key,
        role: String(pr.role || '').slice(0, 128),
        name: String(pr.name || '').slice(0, 2048),
        nth: Number.isInteger(pr.nth) && pr.nth >= 0 ? pr.nth : 0,
      });
    }
    const slotKey = slotKeyOf(pid, target && target.browserKey);
    const seq = ++snapSeq;
    const at = now();
    if (targetId) {
      const e = pickScopedTabFor(w, target, { targetId });
      if (!e || !e.sid) return { ok: false, count: 0 };
      writeSnapshotRefs(w, e, specs, { seq, at });
      snapSlots.set(slotKey, { seq, at, tid: e.targetId, epoch: null, navSeqs: null, specs: null, unknown: false });
      noteActiveTarget(pid, target && target.browserKey, e.targetId);
      return { ok: true, targetId: e.targetId, count: specs.size };
    }
    const ep = tabEpochOf(pid, target && target.browserKey);
    if (hasSince && (!since || ep.at >= since)) {
      snapSlots.set(slotKey, { seq, at, tid: null, epoch: null, navSeqs: null, specs: null, unknown: true });
      return { ok: false, count: 0, code: 'tab_moved' };
    }
    const scope = scopeFor(target);
    const navSeqs = new Map();
    // r2992 (3): the count the snapshot RAN under — a tab that navigated at or after the verb's own /resolve instant is recorded as
    // unknown (-1: a fill there refuses by name), never as the document it is on by the time of the note
    for (const x of w.targets.values()) if (inScope(scope, x.targetId) && x.sid) navSeqs.set(x.targetId, hasSince && (Number(x.navAt) || 0) >= since ? -1 : (x.navSeq || 0));
    snapSlots.set(slotKey, { seq, at, tid: null, epoch: ep.seq, navSeqs, specs, unknown: false });
    return { ok: true, targetId: null, count: specs.size, pending: true };
  }
  /** B-21cc (r2849): the conversation's NEWEST snapshot, and only when it is of the tab the fill READ (`e`): the epoch the same
   *  before and after the fill's read and the slot's own, the tab in scope at the note and not navigated since ⇒ ADOPTED there (the
   *  tab's own references, as a note wrote them before); else refused by name (`why`). Never an older snapshot. r2849 (3): the SITE is
   *  judged on `e` whatever this says. → { ok: true, refs } | { ok: false, why } */
  function snapshotForFill(w, target, e, { ep0, ep1 }) {
    const s = snapSlots.get(slotKeyOf(target && target.profileId, target && target.browserKey));
    const moved = '— the tab changed since the last snapshot (a tab opened, closed or switched)';
    if (!s) return { ok: true, refs: null }; // no snapshot noted: the gate's own words
    if (s.unknown) return { ok: false, why: s.unknown === 'blackout' ? '— VibeSpace was not watching this browser when that snapshot was taken' : moved }; // r3159 (3): the true reason
    if (s.tid) {
      if (s.tid !== e.targetId) return { ok: false, why: moved };
      return { ok: true, refs: e.snapshotRefs && e.snapshotRefs.seq === s.seq ? e.snapshotRefs : null };
    }
    if (s.epoch !== ep0 || ep0 !== ep1 || !s.navSeqs || !s.navSeqs.has(e.targetId)) return { ok: false, why: moved };
    if (s.navSeqs.get(e.targetId) !== (e.navSeq || 0)) return { ok: false, why: 'expired because the page navigated since the last snapshot' };
    writeSnapshotRefs(w, e, s.specs, { seq: s.seq, at: s.at });
    s.tid = e.targetId; s.epoch = null; s.navSeqs = null; s.specs = null;
    noteActiveTarget(w.profileId, target && target.browserKey, e.targetId);
    return { ok: true, refs: e.snapshotRefs };
  }
  /** B-21cc (r2849 (5)): the tab a snapshot's frame note may describe WITHOUT a read — the conversation's only tab in scope, else the
   *  tab its last tab ack (or the fill's own read) named while no mover came after it; else none: silent rather than wrong. */
  function rememberedTabOf(target) {
    const pid = String((target && target.profileId) || '');
    const w = watches.get(pid);
    if (!w || w.state !== 'open') return null;
    const scope = scopeFor(target);
    const all = [...w.targets.values()].filter((x) => inScope(scope, x.targetId)); // r2992: a tab born and not yet attached counts too
    const tabs = all.filter((x) => x.sid);
    if (all.length === 1) return tabs.length === 1 ? tabs[0].targetId : null;
    const m = activeTabEntryOfProfile(pid, target && target.browserKey);
    // r2992 (5): by number — no mover of this browser or conversation came after the ack (a same-millisecond tie is no tie)
    return m && m.tid && Number.isInteger(m.moveSeq) && tabEpochOf(pid, target && target.browserKey).seq <= m.moveSeq && tabs.some((x) => x.targetId === m.tid) ? m.tid : null;
  }
  /** A suite's look at a conversation's slot (r2849 (4): references and counts only) — a copy, never the slot itself. */
  function snapshotSlotOf(target) {
    const s = snapSlots.get(slotKeyOf(target && target.profileId, target && target.browserKey));
    if (!s) return null;
    return { keys: Object.keys(s).sort(), seq: s.seq, tid: s.tid, epoch: s.epoch, unknown: s.unknown, navSeqs: s.navSeqs ? [...s.navSeqs.entries()] : null, specs: s.specs ? [...s.specs.values()].map((x) => ({ ...x })) : null };
  }

  /** R29 Law 1 + R30 #3: THE ONE channel judgment (`keeper.loginChannelFor`); a keeper without it refuses closed by name. */
  function checkLoginChannelFor({
    profileId = '',
    ephemeral = false,
    browserKey = '',
    ownerKey = '',
    handle = '',
    subagent = false,
    remoteSession = false,
    agentFacts = null,
    action = 'fill',
  } = {}) {
    if (keeper && typeof keeper.loginChannelFor === 'function') {
      return keeper.loginChannelFor({
        profileId,
        ephemeral,
        browserKey,
        ownerKey,
        handle,
        subagent,
        remoteSession,
        agentFacts,
        action,
      });
    }
    return BM().loginFillChannelVerdict({ mode: null, why: 'unmediated' }, { action });
  }

  /** Pre-CDP gate check (M1 + R29 Law 1: channel -> vault lock -> spec/entry/grant/slot BEFORE opening or touching the browser). */
  function precheckVaultFill({
    target: elemTarget = '',
    spec = '',
    generate = false,
    user = null,
    facts = {},
    conv = null,
    actor = null,
    owners = [],
    profileId = '',
    ephemeral = false,
    browserKey = '',
    ownerKey = '',
    handle = '',
    subagent = false,
    remoteSession = false,
    agentFacts = null,
  } = {}) {
    if (!logins || typeof logins.resolveFill !== 'function') return { ok: false, code: 'not_watched', error: 'VibeSpace keeps no web logins on this server' };
    const tgtStr = String(elemTarget || '').trim();
    if (!tgtStr) return { ok: false, code: 'bad_request', error: 'missing target (@ref or CSS selector)' };
    const ch = checkLoginChannelFor({ profileId, ephemeral, browserKey, ownerKey, handle, subagent, remoteSession, agentFacts, action: 'fill' });
    if (!ch || !ch.ok) return ch || { ok: false, code: BM().LOGIN_CHANNEL_CODE, error: 'vault login fill requires a local mediated named profile' };
    const pre = logins.resolveFill({
      tabOrigin: '',
      inFrame: false,
      skipOrigin: true,
      spec,
      generate: !!generate,
      user,
      facts,
      conv,
      actor,
      owners,
      profileId: String(ch.profileId || profileId || ''),
      checkOnly: true,
    });
    return pre || { ok: false, code: 'bad_request', error: 'invalid vault fill request' };
  }

  /** THE `fill --vault` PRIMITIVE DOOR (identical on standard Chrome and custom kernel over `e.sid`). */
  async function fillVaultField(target, {
    target: elemTarget = '',
    spec = '',
    generate = false,
    user = null,
    targetId = null,
    checkOnly = false,
    prechecked = false,
    facts = {},
    conv = null,
    actor = null,
    owners = [],
    ownerKey = '',
    handle = '',
    subagent = false,
    remoteSession = false,
    agentFacts = null,
    judged = null, // B-21cc (round w41hvnm5h): an object the caller passes; `targetId` = the tab this fill judged
  } = {}) {
    const pid = String((target && target.profileId) || '');
    const tgtStr = String(elemTarget || '').trim();
    // R29 Law 1: BOTH `precheckVaultFill` and `fillVaultField` ask `checkLoginChannelFor` (even when `prechecked: true`).
    const ch = checkLoginChannelFor({
      profileId: pid,
      ephemeral: Boolean(target && target.ephemeral),
      browserKey: (target && target.browserKey) || '',
      ownerKey,
      handle,
      subagent,
      remoteSession,
      agentFacts,
      action: 'fill',
    });
    if (!ch || !ch.ok) return ch || { ok: false, code: BM().LOGIN_CHANNEL_CODE, error: 'vault login fill requires a local mediated named profile' };
    // M1: Check vault lock + spec + entry + grant BEFORE touching the browser over CDP.
    if (!prechecked) {
      const early = precheckVaultFill({ target: tgtStr, spec, generate, user, facts, conv, actor, owners, profileId: pid, ephemeral: Boolean(target && target.ephemeral), browserKey: (target && target.browserKey) || '', ownerKey, handle, subagent, remoteSession, agentFacts });
      if (!early || !early.ok) return early || { ok: false, code: 'bad_request', error: 'invalid vault fill request' };
    }
    const w = watches.get(pid);
    if (!logins || typeof logins.resolveFill !== 'function') return { ok: false, code: 'not_watched', error: 'VibeSpace keeps no web logins on this server' };
    if (!w || w.state !== 'open') return { ok: false, code: 'not_watched', error: 'VibeSpace is not watching this browser' };
    if (!tgtStr) return { ok: false, code: 'bad_request', error: 'missing target (@ref or CSS selector)' };
    const isRef = /^@[A-Za-z0-9_-]+$/.test(tgtStr);
    // B-21cc (the coordinator's r2491; report fb-03ae550a21): ONE TAB, NO GUESS. The fill acts on the conversation's CURRENT tab —
    // the row its own session's `tab list` marks active, the tab its `get url` and `snapshot` read — through `currentTabFor` (the
    // keeper's own read, the SAME one the snapshot's references are written through). THAT one tab is judged and filled; there is
    // no second resolution and no «most recently seen» pick: unreadable ⇒ refused by name. The read comes BEFORE the judgment: a tab
    // switch during it leaves the value for the tab that was current at the read — still the one judged, still in scope.
    const ep0 = tabEpochOf(pid, target && target.browserKey).seq; // B-21cc (r2849): the tab epoch around the read — a mover during it refuses a fill by reference
    const ct = await currentTabFor(w, target, targetId);
    const ep1 = tabEpochOf(pid, target && target.browserKey).seq;
    if (!ct.ok) return ct;
    const e = pickScopedTabFor(w, target, { targetId: ct.targetId });
    if (!e || !e.sid) return { ok: false, code: 'target_not_found', error: targetId ? 'no active tab in scope to fill — open a page first' : 'the tab this conversation is on is not one of its own pages here (a page opened a moment ago may not be watched yet: try again in a moment) — nothing was filled' };
    if (judged && typeof judged === 'object') judged.targetId = e.targetId; // round w41hvnm5h: the tab judged, for the refusal's frame sentence

    const trackedTabOrigin = BL().originOf(tabLoginUrlOf(e));
    const parsedEarlySpec = BL().parseVaultFillSpec(spec, { user, generate: !!generate, tabOrigin: trackedTabOrigin });
    const earlyWantOrigin = (parsedEarlySpec && parsedEarlySpec.ok && parsedEarlySpec.origin) || trackedTabOrigin || null;
    const myQueueEntry = !checkOnly ? { wantOrigin: earlyWantOrigin, at: now() } : null;
    if (myQueueEntry) {
      if (!e.activeFills) e.activeFills = new Set();
      e.activeFills.add(myQueueEntry);
      bumpFillEpoch(pid, e.targetId);
    }

    const prevQueue = !checkOnly ? e.fillQueue : null;
    let releaseQueue = null;
    let myQueue = null;
    if (!checkOnly) {
      myQueue = new Promise((r) => { releaseQueue = r; });
      e.fillQueue = myQueue;
    }
    if (prevQueue) {
      await prevQueue.then(() => {}, () => {});
      if (!w || w.state !== 'open' || !e.sid) {
        if (myQueueEntry) e.activeFills?.delete(myQueueEntry);
        if (releaseQueue) {
          const rq = releaseQueue;
          releaseQueue = null;
          if (e.fillQueue === myQueue) e.fillQueue = null;
          rq();
        }
        return { ok: false, code: 'target_not_found', error: 'no active tab in scope to fill — open a page first' };
      }
    }

    let abortPreInsert = null;
    const abortPreInsertP = !checkOnly ? new Promise((r) => { abortPreInsert = r; }) : null;
    const myActiveFill = !checkOnly ? {
      wantOrigin: earlyWantOrigin,
      at: myQueueEntry ? myQueueEntry.at : now(),
      topFrameId: e.targetId,
      navSeqAtStart: e.navSeq || 0,
      isoContextId: 0,
      crossNav: null,
      contextGone: false,
      insertStarted: false,
      aborted: false,
      abortP: abortPreInsertP,
      abort() {
        if (!this.insertStarted && !this.aborted) {
          this.aborted = true;
          if (abortPreInsert) abortPreInsert({ timeout: true, crossNavAborted: true });
        }
      },
      heldRequests: [],
    } : null;

    const releaseActiveFill = async () => {
      try {
        if (myQueueEntry && e.activeFills) e.activeFills.delete(myQueueEntry);
        if (e.credPreArming) e.credPreArming = false;
        const af = e.activeFill === myActiveFill ? myActiveFill : null;
        if (af) e.activeFill = null;
        await syncTabFetchMode(w, e);
        if (af && Array.isArray(af.heldRequests) && af.heldRequests.length) {
          const held = af.heldRequests.splice(0);
          for (const h of held) {
            if (!h || !h.reqId) continue;
            if (h.isResponse) {
              continueResponseStage(w, h.reqId, h.sid, h.p);
            } else {
              try { onCredFetchPaused(w, h.m, h.p); } catch {
                call(w, 'Fetch.continueRequest', { requestId: h.reqId }, h.sid, 1500).catch(() => {});
              }
            }
          }
        }
      } finally {
        if (releaseQueue) {
          const rq = releaseQueue;
          releaseQueue = null;
          if (e.fillQueue === myQueue) e.fillQueue = null;
          rq();
        }
      }
    };

    const fenceConfirmed = (fm, needCred = false) => Boolean(
      fm && fm.ok && e.sid && w.state === 'open'
      && (!myActiveFill || e.fetchMode === 'fill-auth' || e.fetchMode === 'fill-noauth')
      && (!needCred || (e.credNetEnabled && e.credFetchAll))
    );

    const runActiveFill = async () => {
    if (myActiveFill) {
      e.activeFill = myActiveFill;
      const fm = await syncTabFetchMode(w, e);
      if (!fenceConfirmed(fm, false)) {
        return {
          ok: false,
          code: 'login_fence_unavailable',
          error: `refused to fill without active browser request interception (${(fm && fm.fenceErr) || 'Fetch.enable not confirmed'}) — nothing was filled`,
        };
      }
    }
    const fillCallMs = Math.min(callTimeoutMs, 1500);
    const callForFill = (m, p, sid) => {
      if (myActiveFill && !myActiveFill.insertStarted && m !== 'Input.insertText') {
        if (myActiveFill.aborted || myActiveFill.crossNav || myActiveFill.contextGone) {
          return Promise.resolve({ timeout: true, crossNavAborted: true });
        }
        return Promise.race([call(w, m, p, sid, fillCallMs), myActiveFill.abortP]);
      }
      return call(w, m, p, sid, fillCallMs);
    };
    const iso = await LF().openIsolatedOrigin({
      call: (m, p) => callForFill(m, p, e.sid),
      browserCall: (m, p) => callForFill(m, p, null),
      targetId: e.targetId,
      trackedUrl: () => tabLoginUrlOf(e),
    });
    if (!iso.ok) {
      if (myActiveFill && myActiveFill.crossNav) return { ok: false, code: 'login_phishing', error: `the tab started navigating to ${myActiveFill.crossNav} — nothing was filled` };
      if (iso.mismatch) return { ok: false, code: 'login_phishing', error: `the browser target URL (${iso.browserOrigin || 'none'}) and the page origin disagree — nothing was filled` };
      return { ok: false, code: 'target_not_found', error: 'no top-level document is available on the current tab' };
    }

    // Gate 3: Browser-truth origin check (`login_phishing`) BEFORE page/frame/ref inspection.
    const pre = logins.resolveFill({
      tabOrigin: iso.origin,
      inFrame: false,
      skipOrigin: false,
      spec,
      generate: !!generate,
      user,
      facts,
      conv,
      actor,
      owners,
      profileId: pid,
      checkOnly: true,
    });
    if (!pre || !pre.ok) return pre || { ok: false, code: 'bad_request', error: 'invalid vault fill request' };
    if (myActiveFill) {
      myActiveFill.wantOrigin = pre.origin;
      myActiveFill.topFrameId = iso.topFrameId || e.targetId;
      myActiveFill.isoContextId = Number(iso.contextId) || 0;
    }

    // Gate 4 (L4 + N2 + 5b): `@ref` belongs ONLY to the active tab's latest snapshot and resolves on demand via bounded `queryAXTree`.
    let refEntry = null;
    if (isRef) {
      // B-21cc (r2849): the conversation's NEWEST snapshot, and only if it is of THIS tab (the one the fill read and judged)
      const sv = snapshotForFill(w, target, e, { ep0, ep1 });
      if (!sv.ok) return { ok: false, code: 'target_not_found', error: `Element not found: ${tgtStr} ${sv.why} — run \`vibespace-browser snapshot -i\` and retry` };
      const snapAtCall = sv.refs;
      const snapFresh = Boolean(snapAtCall && (snapAtCall.navSeq ?? 0) === (e.navSeq || 0));
      if (snapFresh && snapAtCall.resolved && snapAtCall.resolved.has(tgtStr)) {
        refEntry = snapAtCall.resolved.get(tgtStr) || null;
      } else if (snapFresh && snapAtCall.map && snapAtCall.map.has(tgtStr)) {
        refEntry = snapAtCall.map.get(tgtStr) || null;
      } else if (snapFresh && snapAtCall.specs && snapAtCall.specs.has(tgtStr)) {
        const specItem = snapAtCall.specs.get(tgtStr);
        const rr = await LF().resolveSnapshotRef({
          wsUrl: w.url || '',
          WebSocketImpl,
          targetId: e.targetId,
          frameTree: iso.frameTree,
          parsedRef: specItem,
          maxPayloadBytes: axMaxPayloadBytes,
          timeoutMs: axQueryTimeoutMs,
          maxNodes: axMaxNodes,
        });
        if (!rr || !rr.ok || !rr.entry) {
          return {
            ok: false,
            code: 'target_not_found',
            error: (rr && rr.error) || `Element not found: ${tgtStr} is not in the current tab's latest snapshot — run \`vibespace-browser snapshot -i\` and retry`,
          };
        }
        if (e.snapshotRefs === snapAtCall && (snapAtCall.navSeq ?? 0) === (e.navSeq || 0) && snapAtCall.resolved) {
          snapAtCall.resolved.set(tgtStr, rr.entry);
        }
        refEntry = rr.entry;
      }
      if (!refEntry) {
        return {
          ok: false,
          code: 'target_not_found',
          error: e.snapshotExpiredByNav
            ? `Element not found: ${tgtStr} expired because the page navigated since the last snapshot — run \`vibespace-browser snapshot -i\` and retry`   // B-21cc: a stale ref is refused by the name the plain fill's driver uses («Element not found»)
            : `Element not found: ${tgtStr} is not in the current tab's latest snapshot — run \`vibespace-browser snapshot -i\` and retry`,
        };
      }
      const preInFrame = Boolean(refEntry.inFrame || (refEntry.frameId && String(refEntry.frameId) !== iso.topFrameId));
      if (preInFrame) {
        return {
          ok: false,
          code: 'login_in_frame',
          error: "the target element is inside a frame — Vault fill only fills the top page's fields; ask the user to sign in there in the live view",
        };
      }
    }
    if (checkOnly) return pre;

    const prevLf = e.liveFill ? { ...e.liveFill } : null;
    let resolved = null;
    const res = await LF().fillVaultElement({
      call: (m, p) => callForFill(m, p, e.sid),
      browserCall: (m, p) => callForFill(m, p, null),
      oopFrames: (ids, fn) => inspectOopIframes(w, ids, fn),
      targetId: e.targetId,
      trackedUrl: () => tabLoginUrlOf(e),
      iso,
      profileId: pid,
      origin: pre.origin,
      target: tgtStr,
      refEntry,
      slot: pre.slot,
      secret: pre.field !== 'user',
      preArmIntercept: async () => {
        const arm = await ensureTabCredIntercept(w, e);
        if (!fenceConfirmed(arm, pre.field !== 'user')) {
          return {
            ok: false,
            code: 'login_fence_unavailable',
            error: `refused to fill without active browser request interception (${(arm && arm.fenceErr) || 'interception not confirmed'}) — nothing was filled`,
          };
        }
        return { ok: true };
      },
      guardBeforeInsert: (info) => {
        if (myActiveFill) {
          if (myActiveFill.crossNav) {
            return { ok: false, code: 'login_phishing', error: `the tab started navigating to ${myActiveFill.crossNav}, not ${pre.origin} — nothing was filled` };
          }
          if (!fenceConfirmed({ ok: true }, pre.field !== 'user')) {
            return { ok: false, code: 'login_fence_unavailable', error: 'refused to fill because browser request interception dropped before typing — nothing was filled' };
          }
          if (e.navSince && e.navUrl) {
            const inFlightOrigin = BL().originOf(e.navUrl);
            if (!inFlightOrigin || inFlightOrigin !== pre.origin) {
              return { ok: false, code: 'login_phishing', error: `the tab started navigating to ${inFlightOrigin || 'an unverified page'}, not ${pre.origin} — nothing was filled` };
            }
          }
          const curTabOrigin = BL().originOf(tabLoginUrlOf(e));
          if (curTabOrigin && curTabOrigin !== pre.origin) {
            return { ok: false, code: 'login_phishing', error: `the tab is on ${curTabOrigin}, not ${pre.origin} — nothing was filled` };
          }
          if (myActiveFill.contextGone || e.navSince || (e.navSeq || 0) !== myActiveFill.navSeqAtStart) {
            return { ok: false, code: 'login_form_changed', error: 'the page navigated during typing preparation — nothing was filled' };
          }
          if (info && info.stage === 'before-insert') {
            myActiveFill.insertStarted = true;
          }
        }
        return { ok: true };
      },
      resolveValue: () => {
        resolved = logins.resolveFill({
          tabOrigin: iso.origin,
          inFrame: false,
          spec,
          generate: !!generate,
          user,
          facts,
          conv,
          actor,
          owners,
          profileId: pid,
          checkOnly: false,
        });
        if (!resolved || !resolved.ok) return resolved || { ok: false, code: 'not_written', error: 'vault value unavailable' };
        const val = resolved.value;
        resolved.value = '';
        return { ok: true, value: val, extraSecrets: resolved.scrubSecrets || [] };
      },
      onBeforeInsert: ({ contextId }) => {
        if (!resolved || !resolved.secret) return;
        const scList = Array.isArray(resolved.scrubSecrets) ? resolved.scrubSecrets : [];
        for (const sv of scList) recordScrubSecret(pid, resolved.name, sv, { persist: false });
        const sigs = scList.map(credSigOf).filter(Boolean);
        // Merge with any already-live secret sigs on the same tab (e.g., filling `password` then `pending` on a change form).
        const prevSigs = e.liveFill && Array.isArray(e.liveFill.credSigs) ? e.liveFill.credSigs : [];
        const mergedSigs = [...prevSigs];
        for (const sg of sigs) {
          if (!mergedSigs.some((x) => x.len === sg.len && x.sha256 === sg.sha256)) mergedSigs.push(sg);
        }
        recordProfileCredSigs(pid, mergedSigs);
        const prevOtps = e.liveFill && Array.isArray(e.liveFill.stepOtpValues) ? e.liveFill.stepOtpValues : [];
        const otpVals = resolved.slot === 'otp' ? [...new Set([...prevOtps, ...scList.filter((s) => s.length <= 12)])] : [...prevOtps];
        const mode = resolved.pending === 'register' ? 'signup' : (resolved.pending === 'change' ? 'change' : 'login');
        const typedSlot = BL().TYPED_SLOTS.includes(resolved.slot) ? resolved.slot : 'password';
        const keepUnknown = Boolean(prevLf && (prevLf.unknownTyped || prevLf.holdReason === BL().HOLD_UNKNOWN_TYPED));
        const keepHold = keepUnknown
          ? BL().HOLD_UNKNOWN_TYPED
          : ((prevLf && prevLf.holdReason) ? String(prevLf.holdReason) : '');
        const prevAlso = prevLf && Array.isArray(prevLf.also) ? [...prevLf.also] : [];
        if (prevLf && prevLf.loginId && (prevLf.loginId !== resolved.name || prevLf.typedSlot !== typedSlot || prevLf.rev !== resolved.rev || prevLf.entryGen !== resolved.entryGen)) {
          if (!prevAlso.some((a) => a.loginId === prevLf.loginId && a.typedSlot === prevLf.typedSlot && a.rev === prevLf.rev)) {
            prevAlso.push({
              loginId: prevLf.loginId,
              typedSlot: prevLf.typedSlot || null,
              rev: prevLf.rev ?? null,
              entryGen: prevLf.entryGen || null,
              typedPrevious: Boolean(prevLf.typedPrevious),
              at: Number(prevLf.at) || now(),
            });
          }
        }
        armLiveFillOnTab(w, e, {
          urlAtFill: iso.url || tabLoginUrlOf(e),
          origin: resolved.origin,
          site: (prevLf && prevLf.site) || (iso.frameTree && iso.frameTree.frame && typeof iso.frameTree.frame.domainAndRegistry === 'string' ? iso.frameTree.frame.domainAndRegistry : ''),
          user: resolved.user,
          loginId: resolved.name,
          browserKey: (target && target.browserKey) || null,
          mode,
          at: now(),
          isoContextId: contextId,
          credSigs: mergedSigs,
          typedSlot,
          rev: resolved.rev,
          entryGen: resolved.entryGen,
          stepOtpValues: otpVals,
          typedPrevious: resolved.slot === 'previous' || Boolean(prevLf && prevLf.typedPrevious),
          unknownTyped: keepUnknown,
          also: prevAlso,
          holdReason: keepHold,
        }, { persist: true });
        noteActiveTarget(pid, target && target.browserKey, e.targetId);
        // lane lg-store-writes (the moved2 cure 2's hunt (5) — THE STEP THAT CANNOT BE UNDONE RIDES THE LANDING): the vault value is
        // typed into a page that outlives a hub restart ONLY once the tab's fence record is on disk (a kill in between left the tab
        // unheld and its reads unscrubbed after the restart); not on disk inside the bound ⇒ nothing is typed, said by its code
        if (keeper && typeof keeper.whenLanded === 'function') {
          return keeper.whenLanded({ timeoutMs: FENCE_LAND_MS }).then((L) => (L && L.landed ? null : { ok: false, code: 'login_fence_not_on_disk', error: 'nothing was typed: this tab\'s login fence is not on disk yet (the storage is slow or failing) — fill again once it answers' }));
        }
      },
    });

    if (!res || !res.ok) {
      if (!res?.attemptedInsert) {
        if (resolved && resolved.secret && e.liveFill) {
          if (prevLf) armLiveFillOnTab(w, e, prevLf, { persist: true });
          else clearLiveFillOnTab(w, e, 'fill-aborted', { audit: false, persist: true });
        }
        if (resolved && resolved.generated && typeof resolved.rollbackGenerate === 'function') {
          resolved.rollbackGenerate();
        }
      } else if (!res.insUncertain && w.state === 'open' && e.sid && !(e.inflightCredReqs && e.inflightCredReqs.size > 0)) {
        const svs = [
          ...(Array.isArray(resolved && resolved.scrubSecrets) ? resolved.scrubSecrets : []),
          ...(prevLf && prevLf.loginId ? scrubValuesForLogin(pid, prevLf.loginId) : []),
        ];
        const wr = await Promise.resolve().then(() => LF().wipeTabTypedInputs({
          call: (m, p) => call(w, m, p, e.sid, 1500),
          oopFrames: (ids, fn) => inspectOopIframes(w, ids, fn),
          targetId: e.targetId,
          contextId: Number(res && res.contextId) || (e.liveFill && e.liveFill.isoContextId) || 0,
          secretValues: svs,
          wholeOnlyValues: e.liveFill && Array.isArray(e.liveFill.stepOtpValues) ? e.liveFill.stepOtpValues : null,
          maxScanPositions: wipeMaxScanPositions,
        })).catch(() => null);
        if (wr && wr.ok === true && wr.verifiedEmpty === true) {
          if (prevLf && (prevLf.unknownTyped || prevLf.holdReason)) armLiveFillOnTab(w, e, prevLf, { persist: true });
          else clearLiveFillOnTab(w, e, 'fill-failed-wiped', { audit: false, persist: true });
          if (resolved && resolved.generated && typeof resolved.rollbackGenerate === 'function') {
            resolved.rollbackGenerate();
          }
        }
      }
      if (!res?.attemptedInsert && myActiveFill && myActiveFill.crossNav) {
        return { ok: false, code: 'login_phishing', error: `the tab started navigating to ${myActiveFill.crossNav}, not ${pre.origin} — nothing was filled` };
      }
      return {
        ok: false,
        code: (res && res.code) || 'login_form_changed',
        error: (res && res.error) || 'vault fill failed',
        ...(res && res.retryInMs != null ? { retryInMs: res.retryInMs } : {}),
        ...(res && res.secondsLeft != null ? { secondsLeft: res.secondsLeft } : {}),
      };
    }

    const u = resolved && typeof resolved.noteFillUse === 'function' ? resolved.noteFillUse() : null;
    const receipt = (u && u.receipt) || null;
    const out = {
      ok: true,
      entry: resolved.name,
      origin: resolved.origin,
      user: resolved.user,
      field: resolved.field,
      slot: resolved.slot,
      target: tgtStr,
      generated: !!resolved.generated,
      pending: resolved.pending || null,
      receipt,
    };
    return out;
    };
    try {
      return await runActiveFill();
    } finally {
      await releaseActiveFill();
    }
  }

  function loginFenceStats() {
    return {
      fencedProfiles: knownFenceProfiles.size,
      auditCount: fenceAuditLines.length,
      unparseableScrubFrames,
      cutScrubFrames,
    };
  }

  function collectLiveFenceRefs() {
    const liveTargetIds = new Set();
    const liveContextIds = new Set();
    for (const w of watches.values()) {
      if (!w || w.state !== 'open') continue;
      for (const e of w.targets.values()) {
        if (!e.liveFill) continue;
        liveTargetIds.add(String(e.targetId));
        if (e.liveFill.isoContextId > 0) liveContextIds.add(`${e.targetId}:${e.liveFill.isoContextId}`);
      }
    }
    for (const stash of stashedTabFencesByProfile.values()) {
      if (!stash || !(stash.tabs instanceof Map)) continue;
      for (const [tid, entry] of stash.tabs.entries()) {
        if (entry && entry.liveFill) liveTargetIds.add(String(tid));
      }
    }
    return { liveTargetIds, liveContextIds };
  }

  /** The kernel road's facts for one browser (the routes' `surfaces` answer, the suites): null = not asked yet. */
  function kernelFactOf(profileId) { const w = watches.get(String(profileId || '')); return w ? w.kernel : kernelOf.has(String(profileId || '')) ? kernelOf.get(String(profileId || '')) : null; }

  // the keeper's own lease seam: a browser that starts again or stops starts a fresh watch and a fresh verdict
  // B-21cc (r2849 (2)): a takeover and a handback move the tab a conversation's driver is on — movers of the list (the person's
  // own browsing window is nobody's conversation; a desktop window's takeover is no browser's)
  if (keeper && typeof keeper.onInput === 'function') {
    keeper.onInput((ev) => { if (!ev || ev.human || ev.target === 'window' || (ev.kind !== 'takeover' && ev.kind !== 'handback')) return; moveTab(ev.kind, { profileId: ev.profileId || null, browserKey: ev.browserKey || null }); });
  }
  let unsubLease = null;
  if (keeper && typeof keeper.onLease === 'function') {
    unsubLease = keeper.onLease((ev) => {
      if (!ev || !ev.profileId) return null;
      const pid = String(ev.profileId);
      if (ev.kind === 'browser-stopped' || (ev.kind === 'browser-ready' && !ev.adopted)) dropSnapSlots(pid); // B-21cc (r2849 (4)): a browser stopped or started fresh keeps no snapshot of the old one
      if (ev.kind === 'browser-stopped' || ev.kind === 'browser-ready') kernelOf.delete(pid); // lane browser-surfaces: a browser started again may be another engine (Change build…) — asked again
      if (ev.kind === 'browser-stopped') { clearProfileLoginFencesOnStop(pid, watches.get(pid)); disarm(ev.profileId, 'the browser stopped'); }
      else if (ev.kind === 'browser-ready') { if (!ev.adopted) { stashedSnapshotsByProfile.delete(pid); stashedTabFencesByProfile.delete(pid); try { LF().clearFilledSecretsForProfile(pid); } catch { /* */ } } resetOutcomes(ev.profileId); openers.delete(pid); refusals.delete(pid); gaveUp.delete(pid); const w = watches.get(pid); if (w) { try { w.ws && w.ws.close(1000); } catch { /* */ } down(w, 'the browser started again'); } if (humanHolds(ev.profileId)) return arm(ev.profileId, { by: 'person' }); if (viewed(ev.profileId)) return arm(ev.profileId, { by: 'viewer' }); } // B-346d: a browser started again under an open live view is watched again at once (its url read for THIS run) // lane passkey-browse-yourself: a heal under the person's own browsing is watched again (acceptance r2: a new browser — its opener is asked again)
      // lane passkey-browse-yourself (rule 1): the person's own browsing starts (his press launched or joined the browser) ⇒ the
      // watch opens now — before any agent verb, before his window connects (the keeper's settleArming bounds the wait)
      else if (ev.kind === 'human-start') return arm(ev.profileId, { by: 'person' }); // (arm re-reads WHO holds it: his alone ⇒ the person's watch)
      // acceptance r1: WHO holds it moved — his browsing ended (nobody left: the watch HE opened goes, as on a browser no agent
      // touched — acceptance r2: only his; a conversation's or a viewer's watch flips back to the agent's and stays until the
      // browser stops), a conversation took the browser (its policies BEFORE its verb runs: `attach` is awaited by settleArming) or let it go
      else if (ev.kind === 'human-end') { const w = watches.get(pid); if (w && openers.get(pid) === 'person' && !agentHolds(ev.profileId) && !humanHolds(ev.profileId)) disarm(ev.profileId, 'the person stopped browsing it'); else return remode(ev.profileId); }
      else if (ev.kind === 'attach') return remode(ev.profileId);
      else if (ev.kind === 'detach' || ev.kind === 'lease-dropped') { if (ev.browserKey) dropSnapSlots(pid, ev.browserKey); /* B-21cc (r2849 (4), r2992 (2)): a driver's slot goes with ITS lease — a helper's end drops the helper's own, never its parent's */ const t = setTimeout(() => remode(ev.profileId), 0); if (t.unref) t.unref(); }
      return null;
    });
  }
  // THE CLEAR OF A PROFILE'S LOGIN VALUES IN MEMORY hangs on BOTH of the keeper's doors (主开发 r221 + r346 — the law: every road that
  // cleared it at the release still clears it; the removal clears it at the press, never behind a write):
  //  · onProfileDropNow — the removal, AT THE PRESS (a stalled storage never keeps a removed profile's login values alive);
  //  · onProfileDrop — the lease-tabs drop (a profile's browser READY AGAIN and not adopted: a fresh Chrome after a crash; a browser
  //    REPLACED), where the keeper deletes the persisted fence state — and the removal's landing once more (the clear is safe twice)
  const clearLoginMemory = (profileId) => { const pid = String(profileId || ''); if (pid) clearProfileLoginFencesOnStop(pid, watches.get(pid)); };
  const unsubDrops = [];
  if (keeper && typeof keeper.onProfileDropNow === 'function') unsubDrops.push(keeper.onProfileDropNow(clearLoginMemory));
  if (keeper && typeof keeper.onProfileDrop === 'function') unsubDrops.push(keeper.onProfileDrop(clearLoginMemory));
  if (unsubDrops.length) unsubProfileDrop = () => { for (const u of unsubDrops) { try { u(); } catch { /* its own */ } } };

  // B-44f3 (the first read's MUST): the two sweeps of a PAST hub life's items below run at For you's read when it is held unread (the
  // held list is empty — a sweep now closes nothing, and never runs again); no item of THIS life can be filed before that read
  const sweepPastLife = () => {
    // B-97ae round 2: a leftover's For-you item a PAST hub life filed names a tab this hub does not hold — and the hub that held it
    // took its sessions (and, measured — S12 — the authenticators in them) when it went: it is not kept
    try { const n = forYou && typeof forYou.sweep === 'function' ? forYou.sweep('pk-left:') : 0; if (n) log.log?.(`[browser-dialog] ${n} passkey «could not be taken back» item(s) of a past hub life resolved — that hub's sessions took the authenticators with them`); } catch { /* the tray's own failure */ }
    // B-ebb7: a sign-in a PAST hub life asked the person to type — its paused request was held on that hub's watch socket, which
    // closed with it: no answer typed now could reach it, so the item is closed here, said once — DISMISSED by «the hub restarted»
    // (never «done»: in the tray's history an ask nobody answered must not read as answered). RIGHT ONLY WHILE THIS MODULE IS
    // CREATED ONCE PER HUB LIFE (src/server/mounts-plugins-wiring.js makes the one): a second create in the same life — a reload —
    // would close this life's LIVE asks too
    try { const n = forYou && typeof forYou.sweepAs === 'function' ? forYou.sweepAs(PROMPT_FY_KEY, 'dismissed', 'hub-restart') : 0; if (n) log.log?.(`[browser-dialog] ${n} sign-in For-you item(s) of a past hub life resolved — that hub's sign-in requests ended with it`); } catch { /* the tray's own failure */ }
  };
  if (forYou && typeof forYou.isHeldUnread === 'function' && forYou.isHeldUnread() && typeof forYou.whenRead === 'function') forYou.whenRead(sweepPastLife, "a past hub life's browser items"); else sweepPastLife();

  if (logins && typeof logins.onVaultOpen === 'function') {
    unsubVaultOpen = logins.onVaultOpen(() => {
      if (disposed) return;
      for (const [pid, w] of watches) {
        if (!w || w.state !== 'open') continue;
        hydratePersistedScrubs(pid);
        reviveRestoredHolds(w).catch(() => { /* law 4: a check that could not look leaves the hold standing */ });
      }
    });
  }
  if (logins && typeof logins.onVaultLock === 'function') {
    try { unsubFenceRefSource = LF().registerFenceRefSource?.(collectLiveFenceRefs) || null; } catch { unsubFenceRefSource = null; }
    unsubVaultLock = logins.onVaultLock(() => {
      if (disposed) return;
      try { LF().clearUnfencedFilledSecrets(); } catch { /* */ }
    });
  }
  try { keeper?.mediator?.()?.setLoginFence?.({ liveFillTarget: liveFillOnTarget, allowVerbInFlight, noteActiveTarget, scrubText, scrubCdpFrame, scrubCdpFrameAsync, fillEpochOf, isCredRequestId, bodyCarriesCred, hasActiveFillOnProfile, hasPostLiftGuard, recheckPostLift, navShowsValue, filledBoxLookDue, lookAtFilledBox: lookAtFilledBoxOn }); } catch { /* optional */ }
  return { arm, disarm, factFor, openOn, stuckForKey, pageStuckMap, waitForOpen, waitSettled /* int347: the alert race */, answer, noteOutcome, resetOutcomes, verbStarted, verbEnded, verbRunning, scopeFor, onChange, setTabsOf, stats, bindTab, orphansOf, // verify r4 #1: the `tab new` ack binds
    ownsTab, pickTab, stopTab, closeTab, captureTab, noteCut, busyFor, // lane site-reset: a looping tab never disables the browser
    pageAnswers, // lane browser-shared-profile-freeze: the verb's own tab asked first, bounded (a silent page answered page_busy by name)
    ownTabs, clearSite, // lane site-reset step 2: one site's stored login, cleared
    passkeyIn, cancelPasskey, // lane browser-passkey: a page waiting for a passkey, named and cancellable
    passkeyVaultRows, passkeyVaultReveal, // lane vault-contents-window: the Vault window's masked rows + its one-value reveal
    answerPasskey, passkeyRegister, passkeyList, passkeyForget, passkeyPolicy, passkeySwitch, dropPasskeys, passkeyCounts, passkeyCards, // lane passkey-ui: + the counts // int258: + the chat cards a rebuild draws // lane passkey-store-core: the store, its cards, its grants
    passkeysHeld: () => { if (pks) pkRead(); return pkHeldFacts(); }, _passkeyHold: pkStoreHold, // r3261: the store's hold, asked by the keeper (a profile's removal) and the digest; the suite's read again
    paintFacts, freezePaint, thawPaint, // lane browser-swiftshader-cpu: a browser nobody watches and nobody drives paints nothing
    promptIn, answerPrompt, // lane browser-ui-prompts: a file chooser / an HTTP sign-in, named and answerable
    retryOwedShows, // r4176 (b): the idle-paint thaw's failed shows tried again — the keeper's sweep asks it while a viewer watches
    personWindows, personPromptStateOf, // B-b56d (the owner's ruling B, 2026-11-18): the person's own windows hook a sign-in; what they say beside it
    setPermission, permissionsOf, // lane browser-ui-prompts-r2: every permission decided ahead; the agent's per-origin flip
    answerSurface, surfacesIn, blockingOn, surfaceById, blockOf, kernelFactOf, // lane browser-surfaces: a kernel's surfaces — the answer door, the list, the relay's drop, the owner's card, the readers' block
    fillVaultField, precheckVaultFill, checkLoginChannelFor, noteSnapshot, moveTab, rememberedTabOf, snapshotSlotOf, tabMovesOf /* B-21cc (r2849, r2992) */, otherSiteFramesFor /* B-5f2e */, liveFillVerdictFor, liveFillOnTarget, fencedTargetsFor, allowVerbInFlight, noteActiveTab, noteActiveTarget, hasScrubSecrets, scrubOutput, scrubText, scrubCdpFrame, scrubCdpFrameAsync, endScrubWorkers, scrubWorkerFacts /* 主开发 r2445: the frame scrub's worker */, _recordScrubSecret: recordScrubSecret, _recordCredSigs: recordProfileCredSigs, _endProfileFences: clearProfileLoginFencesOnStop /* the frame scrub's legs: made-up values, a profile's end */, loginFenceStats, hasPostLiftGuard, recheckPostLift, recheckPostLiftFor, // lane browser-login r22..r29
    passkeyFactOf, // lane passkey-browse-yourself: ONE passkey fact per live view (his browsing window reads it from its relay)
    shutdown: () => { disposed = true; for (const r of rearms.values()) if (r.t) clearTimeout(r.t); rearms.clear(); shutdown(); try { unsubFenceRefSource?.(); } catch { /* */ } try { unsubProfileDrop?.(); } catch { /* */ } try { unsubLease?.(); } catch { /* */ } try { unsubVaultOpen?.(); } catch { /* */ } try { unsubVaultLock?.(); } catch { /* */ } }, _watches: watches };
}

// THE CREDENTIAL SCAN moved to src/cdp-frame-scrub.js (PURE — the loop and the frame scrub's worker load the SAME module: 主开发
// r2445 law 1); loaded LAZILY, as every module this file names past its three (two passkey suites copy it beside those only)
let CSm = null;
const CS = () => CSm || (CSm = require('../cdp-frame-scrub.js'));
function credSigOf(...a) { return CS().credSigOf(...a); }
function valueCarriesCredential(...a) { return CS().valueCarriesCredential(...a); }
function inspectRequestBody(...a) { return CS().inspectRequestBody(...a); }
function bodyCarriesCredential(...a) { return CS().bodyCarriesCredential(...a); }
function urlCarriesCredential(...a) { return CS().urlCarriesCredential(...a); }
function headersCarryCredential(...a) { return CS().headersCarryCredential(...a); }

/** lane passkey-browse-yourself r4 — THE HOLDER ROWS the watch judges WHO holds a browser on (its mode, a ceremony's owner): the
 *  keeper's holder list (the conversations' rows; lane H) + HIS row taken ONCE, flagged, from `humanOf` with his input. The keeper's
 *  list carries his row too (BROWSE YOURSELF: `human: true`, holderRows) — r2–r3's wiring copied it without the flag and appended it
 *  again, so his own browsing was counted as a conversation's and never got his watch (live ⑪ a2 / g, real Chrome). The production
 *  wiring builds the watch's `holdersOf` with THIS, and so do the suites — never a copy shaped like it. `keeper` = the keeper or a
 *  function answering it (read at each call). */
function holdersOfKeeper(keeper) {
  return (profileId) => {
    try {
      const k = typeof keeper === 'function' ? keeper() : keeper;
      const out = (k.list().leases || []).filter((l) => l && l.profileId === profileId && l.browserKey && !l.human).map((l) => ({ browserKey: l.browserKey, sessionId: l.sessionId || null, ephemeral: !!l.ephemeral }));
      const h = typeof k.humanOf === 'function' ? k.humanOf(profileId) : null;
      if (h && h.browserKey) out.push({ browserKey: h.browserKey, sessionId: null, ephemeral: false, human: true, input: h.input === 'user' ? 'user' : 'agent' });
      return out;
    } catch { return []; }
  };
}
/** lane chrome-157 (vault-login round 32, 主开发 2026-11-15 item 2): A DIALOG THAT OPENED ON A FENCED TAB IS TOLD TO AN AGENT WITHOUT ITS
 *  WORDS — its message, default value, title, fields and addresses are the fenced document's (a page can alert what was typed). The
 *  person's own view keeps them; every agent road (the fact, its notes, the held-dialog notice, the dialog answer) reads this. PURE. */
const FENCED_DIALOG_WORDS = 'a dialog of a page VibeSpace keeps fenced (a vault login was filled there) — its words are withheld until the tab reloads or navigates';
function agentDialogOf(d) { return d && d.fencedAt ? { ...d, message: FENCED_DIALOG_WORDS, title: '', defaultValue: '', fields: [], url: d.fencedAt.urlAtFill, ...(d.frameOrigin !== undefined ? { frameOrigin: d.origin || '' } : {}) } : d; }

module.exports = {
  PERSON_SIGNIN_HOOK, // B-b56d OUT: the person's sign-in hook's one switch (the legs read it)
  agentDialogOf, FENCED_DIALOG_WORDS,   // lane chrome-157 (round 32): the agent's view of a dialog on a fenced tab (pure)
  create,
  holdersOfKeeper,
  ANSWERED_KEEP,
  OUTCOMES_KEEP,
  VERB_RUNNING_MAX_MS,
  RE_ENABLE_MS,
  tabName /* B-97ae round 3 */,
  get SCAN_LIMITS() { return CS().SCAN_LIMITS; },   // moved: src/cdp-frame-scrub.js (read lazily)
  credSigOf,
  valueCarriesCredential,
  inspectRequestBody,
  bodyCarriesCredential,
  urlCarriesCredential,
  headersCarryCredential,
};

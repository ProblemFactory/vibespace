'use strict';
/**
 * A WINDOW PER HOLDER — PURE (imports nothing; CJS so the keeper, the mediator, the bridge, the bundle and the suites
 * share ONE rule set). lane browser-windows (2026-10-01), the owner: "多agent可以同时用同一个profile，只是每个agent开的是
 * 个独立窗口吗？为啥现在只允许一个agent/人类同时在操作一个profile？" — and userW's D-payments, refused for the whole of a
 * takeover the user made from ANOTHER conversation's live view (2026-10-01 18:21–18:35 PDT).
 *
 * THE MEASUREMENT (`WINDOWS_PROOF`, scripts/measure-browser-windows.mjs — the real keeper, agent-browser 0.38.1, Google
 * Chrome 154.0.8037.57, headless AND the hidden window; zero vendor calls) decided every rule below:
 *   · each conversation's session runs its OWN daemon — two conversations' commands never wait for each other (a
 *     `get title` during another session's `wait 5000` answered in 3–5 ms; inside ONE session it waited 4502–4504 ms). The
 *     90 s "one driver at a time" claim between conversations protected nothing the daemon serializes — it is deleted;
 *   · before this lane every conversation's tab sat in the profile's ONE window: the tab not on show is `hidden` — 0
 *     frames, requestAnimationFrame stopped, a `click` on it 4.6–5.0 s against 13–20 ms on a visible one, and no command
 *     brings it forward; a CDP mouse press there IS answered (1–2 ms) and the page sees it, but nothing repaints — the
 *     live view shows a frozen picture whatever the user does (userW's "卡死", inc-muqdohf0-hkjc). A tab that is the
 *     active tab of its OWN window renders at 60 fps, the window focused or not (Xvfb: hasFocus false, 60 fps);
 *   · Chrome has no "open a tab in window W": `Target.createTarget` names no window — a plain create (the CLI's `tab
 *     new`, a raw one, `background:true`) lands in Chrome's LAST FOCUSED window (headless: the newest focused window;
 *     the hidden window: the last activated — and the CLI's `tab <id>` activates), which is often ANOTHER conversation's,
 *     where the new tab takes the show and hides that conversation's page. Only a tab a PAGE opens (`window.open`,
 *     target=_blank) lands in its opener's window (both modes). So every tab VibeSpace opens for a holder opens in a
 *     NEW window of that holder (`newWindow:true, focus:false` — measured: such a window's tab renders at 60 fps
 *     without taking the focus), and a tab its pages open stays in its window by Chrome's own rule;
 *   · `Target.activateTarget` across windows leaves the other window's tab visible (within one window it hides the other
 *     tab); a background tab answers `Page.captureScreenshot` with a FRESH picture in ~30 ms — the live view watches a
 *     tab that does not paint by polling at ≤ 2 fps (`WATCH_POLL_MS`), and says so;
 *   · a minimized window does not paint (headless; the hidden window has no window manager and ignores it); a window
 *     under another one keeps painting (no occlusion in either mode).
 *
 * THE RULES:
 *   `ownWindowParams(params)`   the `Target.createTarget` a lease's own connection sends (the mediator), rewritten into a
 *                               new unfocused window of its own — unless it already asks for a window, a hidden target or
 *                               a tab-type target (left as it wrote it);
 *   `instanceOf(rec)`           which RUNNING browser a lease's window belongs to (a restarted Chrome has none of it);
 *   `hasOwnWindow(lease, inst)` its first tab in this browser was opened in a window of its own;
 *   `windowMates({…})`          the OTHER leases that share the window a takeover drives — nobody for a lease with its own
 *                               window; for a lease still in the shared window of a browser started before this lane (its
 *                               tab cannot be moved — Chrome has no CDP move), the other ones still there (they are taken
 *                               over WITH it, as before: fail closed, until that browser restarts);
 *   `watchModeVerdict({…})`     how the live view shows a tab it only WATCHES: the screencast while it paints, else
 *                               `Page.captureScreenshot` polling at ≤ 2 fps (said on the view);
 *   `maxRunningOf(v, dflt)`     `browser.maxRunning` — the machine's ceiling of running browsers, a setting (default the
 *                               keeper's CONCURRENT_CAP, 6).
 * Gates: scripts/test-browser-share-model.mjs (the tables) + scripts/test-browser-mediation.mjs (the rewrite on the real
 * proxy) + scripts/test-browser-windows-chrome.mjs (heavy: two agents in two windows on the real 0.38.1).
 */

const WINDOWS_PROOF = Object.freeze({
  status: 'measured',
  measured: '2026-10-01',
  agentBrowser: require('./browser-verbs.js').AGENT_BROWSER_CLI.table, // the table's version (one row): a table bump re-measures this proof
  // the 2.369.250 bump (0.38.1 → 0.38.2) re-measured it: both modes on 0.38.2 and on 0.38.1 the same day — every cell the same on both
  // drivers, the ms within a few (4 / 6 ms beside 4504 → 4503 ms headless) — the rows above, measured on 0.38.1, stand for the pin
  remeasured: '2026-10-10',
  chrome: 'Google Chrome 154.0.8037.57',
  modes: Object.freeze(['headless', 'hidden window (headed on the CLI\'s own Xvfb)']),
  script: 'scripts/measure-browser-windows.mjs',
  rows: Object.freeze([
    Object.freeze({ fact: 'daemons per conversation on one profile (shared namespace / mediated)', headless: '1 each / 1 each', hidden: '1 each / 1 each' }),
    Object.freeze({ fact: 'another conversation\'s `get title` during a `wait 5000` (shared namespace / mediated)', headless: '4 ms / 4 ms', hidden: '3 ms / 3 ms' }),
    Object.freeze({ fact: 'the same conversation\'s `get title` during its own `wait 5000`', headless: '4504 ms', hidden: '4502 ms' }),
    Object.freeze({ fact: 'two conversations\' first tabs — the keeper before this lane (f9950dfc) / with it', headless: 'one window / one window each', hidden: 'one window / one window each' }),
    Object.freeze({ fact: 'the tab not on show in a shared window (fps · visibility · rAF/s)', headless: '0 · hidden · 0', hidden: '0 · hidden · 0' }),
    Object.freeze({ fact: 'an agent `click` on that hidden tab / on a visible tab', headless: '5004 ms / 16 ms', hidden: '4591 ms / 18 ms' }),
    Object.freeze({ fact: 'a command brings its hidden tab forward', headless: 'no', hidden: 'no' }),
    Object.freeze({ fact: 'a CDP mouse press on a background tab (the live view\'s takeover click)', headless: 'answered in 2 ms, the page sees it — 0 frames follow', hidden: 'answered in 1 ms, the page sees it — 0 frames follow' }),
    Object.freeze({ fact: 'the active tab of a second window (createTarget newWindow) — fps · visibility', headless: '60 · visible', hidden: '60 · visible' }),
    Object.freeze({ fact: 'the foreground tab of a window WITHOUT the focus (U0b) — fps · visibility · hasFocus', headless: '60 · visible · (headless reports every window focused)', hidden: '60 · visible · false' }),
    Object.freeze({ fact: 'a window made with focus:false — fps · visibility · hasFocus', headless: '60 · visible · false', hidden: '60 · visible · false' }),
    Object.freeze({ fact: 'a plain createTarget / the CLI\'s `tab new` lands in', headless: 'the newest focused window', hidden: 'the last activated window' }),
    Object.freeze({ fact: 'a tab a page opens (window.open) lands in', headless: 'its opener\'s window', hidden: 'its opener\'s window' }),
    Object.freeze({ fact: 'createTarget can name a window', headless: 'no (url, left, top, width, height, windowState, browserContextId, enableBeginFrameControl, newWindow, background, forTab, hidden, focus)', hidden: 'no' }),
    Object.freeze({ fact: 'activateTarget in another window — this window\'s active tab', headless: 'stays visible', hidden: 'stays visible' }),
    Object.freeze({ fact: 'activateTarget of another tab in the same window', headless: 'hides the one on show', hidden: 'hides the one on show' }),
    Object.freeze({ fact: 'a minimized window', headless: '0 fps · hidden', hidden: 'not minimized (no window manager) · 60 fps' }),
    Object.freeze({ fact: 'a window under another one', headless: '60 fps', hidden: '60 fps' }),
    Object.freeze({ fact: 'Page.captureScreenshot of a hidden tab', headless: 'fresh, 33 ms', hidden: 'fresh, 48 ms' }),
    Object.freeze({ fact: 'the daemon\'s stream while its active tab is hidden', headless: '0 fps', hidden: '0 fps' }),
    Object.freeze({ fact: 'a session switches to another window\'s tab by its CDP id (`tab <targetId>`)', headless: 'yes', hidden: 'yes' }),
    Object.freeze({ fact: 'a shared-namespace session\'s `tab list`', headless: 'every tab of every window', hidden: 'every tab of every window' }),
  ]),
  notMeasured: 'a headed browser on a REAL desktop session (the lane\'s rule: headless and the hidden window only) — there `Target.activateTarget` (the CLI\'s `tab <id>`) raises its window and can take the focus from the person\'s window',
});

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * THE CREATE A LEASE SENDS, INTO A WINDOW OF ITS OWN. → `{params, rewritten, why}`. `params` is never mutated.
 *   already a window (`newWindow: true`)     unchanged (its own `focus` kept)
 *   a hidden target (`hidden: true`)          unchanged — Chrome refuses `hidden` with `newWindow` (protocol text)
 *   anything else, a tab-type target TOO      `newWindow: true` + `focus: false` (unless it named a focus)
 * verify r1 ② (2026-10-01): the first build left `forTab: true` as written ("not a page") — MEASURED on Chrome 154 (headless
 * and the hidden window): a `forTab` create lands its tab in the LAST FOCUSED window exactly like a page create, i.e. in
 * ANOTHER holder's window (its page target too). A tab-type target is placed like a page; the protocol forbids `hidden`
 * with `forTab`/`newWindow`, never `forTab` with `newWindow`.
 */
function ownWindowParams(params) {
  const p = isObj(params) ? params : {};
  if (p.newWindow === true) return { params: p, rewritten: false, why: 'already a window' };
  if (p.hidden === true) return { params: p, rewritten: false, why: 'a hidden target has no window' };
  const out = { ...p, newWindow: true };
  if (out.focus === undefined) out.focus = false;
  return { params: out, rewritten: true, why: 'a window of its own' };
}
/** The params VibeSpace itself opens a holder's tab with (the keeper: attach, `tab new`, Browse yourself, a restore). */
function windowCreateParams(url) { return ownWindowParams({ url: typeof url === 'string' && url ? url : 'about:blank' }).params; }

/** Which RUNNING browser a record is: its launch instant (a restarted Chrome is another instance — none of the old
 *  windows are in it). null for no record. */
function instanceOf(rec) {
  if (!isObj(rec)) return null;
  const at = Number(rec.startedAt);
  return Number.isFinite(at) && at > 0 ? String(at) : null;
}
/** Was this lease's first tab in THIS browser opened in a window of its own? */
function hasOwnWindow(lease, instance) {
  return isObj(lease) && !!instance && typeof lease.windowIn === 'string' && lease.windowIn === String(instance);
}
/**
 * THE LEASES A TAKEOVER OF `browserKey`'s WINDOW TAKES WITH IT — the others in that window. A lease with its own window:
 * nobody. A lease still in the shared window of a browser started before this lane: every other lease of the profile
 * that is in it too (they share one window — the user's hands on it move what they see; taken WITH it, as before).
 * Children (helpers) never: they hold their own browsers.
 */
function windowMates({ leases = [], profileId = null, browserKey = '', instance = null } = {}) {
  const list = Array.isArray(leases) ? leases.filter(isObj) : [];
  const me = list.find((l) => l.profileId === profileId && String(l.browserKey) === String(browserKey)) || null;
  if (me && hasOwnWindow(me, instance)) return [];
  return list.filter((l) => l.profileId === profileId && String(l.browserKey) !== String(browserKey) && !hasOwnWindow(l, instance));
}

// ── A LABEL ON A TAB VIBESPACE OPENED ──
// `tab new --label <name> [url]` labels the tab the BINARY creates; the tab is VibeSpace's own window now, so the label is
// the lease's (`lease.tabLabels` {label → targetId}, bounded — the oldest goes first) and the server's `tab` verbs resolve
// it before the session's own rows (its own labels still answer there).
const TAB_LABELS_MAX = 32;
function withTabLabel(labels, label, targetId) {
  const m = {};
  for (const [k, v] of Object.entries(isObj(labels) ? labels : {})) if (k !== label && typeof v === 'string' && v) m[k] = v;
  if (typeof label === 'string' && label && typeof targetId === 'string' && targetId) m[label] = targetId.toUpperCase();
  const keys = Object.keys(m);
  for (const k of keys.slice(0, Math.max(0, keys.length - TAB_LABELS_MAX))) delete m[k];
  return m;
}
/** The target a lease's label names (`null` = not one of its labels). */
function labelTargetOf(labels, ref) { return isObj(labels) && typeof ref === 'string' && typeof labels[ref] === 'string' ? labels[ref] : null; }
/** The rows of a session's `tab list` with the lease's labels laid on the tabs that carry none. */
function withLabelsOnRows(rows, labels) {
  const by = new Map(Object.entries(isObj(labels) ? labels : {}).map(([k, v]) => [String(v).toUpperCase(), k]));
  return (Array.isArray(rows) ? rows : []).map((x) => (isObj(x) && !x.label && by.has(String(x.targetId || '').toUpperCase()) ? { ...x, label: by.get(String(x.targetId).toUpperCase()) } : x));
}

// ── THE LIVE VIEW WATCHES A TAB (U3) ──
/** How long a watched tab may stay silent on the screencast before the view polls it instead. */
const WATCH_FIRST_FRAME_MS = 1000;
/** U0b: a view whose stream sent no frame for this long asks the page whether its tab is painting at all — a background
 *  tab (another tab of its window on show) is SAID on the view and its picture polled (the user must never click a frozen
 *  picture in silence: userW's inc-muqdohf0-hkjc). */
const BACKGROUND_SILENCE_MS = 2000;
/** The polling cadence of a tab that does not paint: ≤ 2 frames a second (a capture is ~30 ms — measured). */
const WATCH_POLL_MS = 500;
/** B-d635 verify r1: how long the tab on show must go WITHOUT ANSWERING before the view says it is not responding — asks
 *  in a row (a frame or an answer starts over). ONE ask that times out (2.5 s) is no proof: a page busy with JS for 3 s
 *  missed the first ask and answered the next (measured on a real Chrome) — and was told "not responding". */
const UNRESPONSIVE_MS = 8000;
/** `{mode}` — the screencast while it delivers; `polling` once it stayed silent `firstFrameMs` (a hidden tab: 0 fps). */
function watchModeVerdict({ framesSeen = 0, waitedMs = 0, firstFrameMs = WATCH_FIRST_FRAME_MS } = {}) {
  if (Number(framesSeen) > 0) return { mode: 'screencast' };
  return Number(waitedMs) >= Number(firstFrameMs) ? { mode: 'polling' } : { mode: 'screencast', waiting: true };
}

/**
 * WHAT A CLICK ON A TAB CHIP DOES (U3 + U0b) — `{act, why}`:
 *   driving the conversation's window (`driving`, its own tab):  the session's current tab ⇒ `front` (bring it forward:
 *     it may sit behind another tab of its window — userW's frozen view), another of its tabs ⇒ `switch` (the real
 *     switch, `Target.activateTarget` through the session), a mediated browser ⇒ `none` (`mediated_tabs`, as before)
 *   watching (not driving): the viewed tab again ⇒ `none`; the session's current tab while watching another ⇒ `follow`
 *     (back to the agent's); another of ITS tabs ⇒ `watch` (the view moves — the agent's tab is untouched)
 *   another conversation's / a job's / his own / nobody's tab (not driving) ⇒ `watch` (accept-fixes-strip F8: view only)
 *   his own window ⇒ `none` (the row's own verdict words it — browser-tabs)
 */
const TAB_CLICK_ACTS = Object.freeze(['front', 'switch', 'watch', 'follow', 'none']);
/** F8: the owner words of a tab he may watch that is not the viewed agent's (browser-tabs OWNER_WORDS less `agent`). */
const OWNER_SEEN = Object.freeze(['other', 'you', 'orphan']);
function tabClickVerdict({ owner = 'orphan', human = false, driving = false, mediated = false, active = false, watching = null, targetId = '' } = {}) {
  const id = String(targetId || '').toUpperCase();
  const w = watching ? String(watching).toUpperCase() : null;
  // accept-fixes-strip F8 (the owner, accepting 2.369.202: 「中间俩不能点，有俩能点的也让人困惑」): every tab of HIS browser is
  // his to WATCH from a conversation's view — another conversation's, a job's, his own, nobody's — view only (nobody's tab
  // moves); DRIVING keeps the takeover rules (the bridge refuses a watch while he drives; his own window keeps its row)
  if (!human && owner !== 'agent' && OWNER_SEEN.includes(owner)) {
    if (driving) return { act: 'none', why: 'driving-keeps-the-takeover-rules' };
    return w && w === id ? { act: 'none', why: 'already-watched' } : { act: 'watch', why: 'view-only' };
  }
  if (human || owner !== 'agent') return { act: 'none', why: 'not-the-agents' };
  if (driving) {
    if (mediated) return { act: 'none', why: 'mediated_tabs' };
    return active ? { act: 'front', why: 'its-current-tab' } : { act: 'switch', why: 'another-of-its-tabs' };
  }
  if (w && w === id) return { act: 'none', why: 'already-watched' };
  if (active) return w ? { act: 'follow', why: 'back-to-its-tab' } : { act: 'none', why: 'already-shown' };
  return { act: 'watch', why: 'another-of-its-tabs' };
}

// ── T2 ⑧ (verify r1, the owner 2026-10-01 23:20 PDT): ONE WINDOW PER HOLDER ──
// Under the first build every tab VibeSpace opened was a NEW window — an agent with N tabs had N windows (and the strip N
// entries): the accidental multi-window. The rule now: a holder's FIRST tab makes its window; every later tab the keeper
// opens for it lands IN that window. MEASURED (verify-r1 measure-place + measure-coloc, Chrome 154, headless AND the
// hidden window): `Target.createTarget` names no window; `Target.activateTarget` / `Page.bringToFront` followed by a plain
// create is NOT reliable (it followed the activation in one run and the last window.open'd window in another — state-
// dependent); a page's `window.open` lands in its OPENER's window EVERY time (3 of 3 in a row, the other holders' windows
// untouched; `noopener` too; without a user gesture the popup blocker refuses). So a later tab is opened by `window.open`
// from a page of the holder's window and VERIFIED with `Browser.getWindowForTarget` — elsewhere ⇒ closed, `window_mismatch`,
// one retry, else the window is treated as lost and ONE new window re-minted (said once). A `forTab:true` create (exempted
// by the first build) was measured to land in ANOTHER holder's window (both modes) — a tab-type target is placed like a page.
// A mediated lease drives its own CDP: the proxy cannot inject the opener rule without corrupting the agent's target map,
// so its creates stay `newWindow:true` (never another holder's window — the safety property; its window count is the
// documented carve-out). The red cell of the ownership table: a holder with MORE THAN ONE window.
const ONE_WINDOW_PER_HOLDER = Object.freeze({ since: '2026-10-01', mechanism: 'opener-rule', verified: 'Browser.getWindowForTarget', retries: 1, carveOut: 'mediated lease (newWindow per create)', rung2: 'a window-state cycle (never under a live view, never on a real display) + activate + a BACKGROUND create (verified, ≤ RUNG2_TRIES, every leak closed at once and counted; serialized per browser in the keeper; never while the user drives any window of the browser)', lost: 'only when no tab of the lease answers its window', popups: 'a page\'s popup window is the page\'s — listed as the holder\'s tab, never its second window' });
/** verify r2 T1: how many live anchors the opener rule tries before rung 2 (a dialog, a crash, a navigation or a hijacked
 *  window.open on one tab must not cost a window; a whole window of such tabs falls to activate + create, verified). */
const OPENER_ANCHORS_MAX = 4;
/** verify r3 (lane browser-windows, MEASURED on Chrome 154): a page act on an anchor that holds a dialog, crashed or is
 *  navigating never answers — the ladder cost 4 × 2.5 s (10.0 s) before rung 2 landed in 150 ms. The anchor is PROBED first
 *  (`Page.getFrameTree`, this budget): a healthy page answers in ~5 ms; one that does not answer falls to the next rung at once. */
const ANCHOR_PROBE_MS = 400;
/** verify r3 T2 ①: rung 2's tries — each verified with `Browser.getWindowForTarget`, a tab that landed elsewhere closed AT ONCE
 *  and COUNTED (a leak: it lived 6–29 ms in another holder's window — measured), the next try after the window-state cycle. */
const RUNG2_TRIES = 3;
/** verify r3 T2 ④: the note a `tab new` carries ONCE per browser run when the lease's tabs sit in windows other than its own
 *  (a lease from before r1 — the r1 bug's leftovers): said, never folded (a page is never closed on the agent's behalf). */
const STRAYS_NOTE = 'tabs_in_other_windows';
/**
 * verify r3 T2 ① — RUNG 2's PLAN from the browser's recorded display fact (lane headless-fallback's `rec.display`): MEASURED
 * on Chrome 154 — in HEADLESS the "last active window" a plain create lands in follows WINDOW-STATE changes, nothing
 * activation-shaped: once another window's tab was closed (the stray of a lost race), `Target.activateTarget`,
 * `Page.bringToFront`, a bounds nudge, maximize/normal and 3 s of waiting all left the create in the OTHER holder's window
 * (0/30, 0/15 with retries); `Browser.setWindowBounds` minimized → normal (7 ms) re-establishes the holder's window every
 * time (6/6, and the 2 ms racer then never wins). In the HIDDEN window (Xvfb, no window manager) the cycle + the activation
 * lands 6/6 (either alone 0/6). On a REAL display the cycle would minimize the agent's window in front of the user — not
 * done there (activate + create, verified, retried). → {breaker, activate, why}.
 */
function rung2Plan(fact, { viewers = 0, driven = false } = {}) {
  // verify r4 T1 (the owner's invariant): rung 2 NEVER runs while the user drives ANY window of this browser — a cycle under
  // his hands blinks his window, an activation raises another window over his on a real display; the ladder answers
  // window_busy by name and the agent tries again after the handback
  if (driven === true) return { run: false, breaker: false, activate: false, why: 'the user is driving a window of this browser', create: RUNG2_CREATE };
  // verify r4 T2 ① (MEASURED on the product's Chrome, the screencast flowing at 52 fps, 30 trials per mode): the cycle flips
  // the holder's page hidden → visible EVERY time (the page observes it: rAF stops, visibilitychange fires) and the live
  // view's picture skips 1–3 frames (≤ 66 ms headless; ≤ 83 ms hidden); the activation alone flips nothing. A window
  // somebody WATCHES gets no cycle: activate + create, verified, retried, then window_busy (the sticky state is rare)
  const watched = (Number(viewers) || 0) > 0;
  if (!isObj(fact)) return { run: true, breaker: !watched, activate: true, why: watched ? 'a live view watches this window: no cycle' : 'no display fact recorded (headless assumed)', create: RUNG2_CREATE };
  if (fact.headed !== true) return { run: true, breaker: !watched, activate: true, why: watched ? 'a live view watches this window: no cycle' : 'headless', create: RUNG2_CREATE };
  if (isObj(fact.fallback) && fact.fallback.rung === 'hidden-window') return { run: true, breaker: !watched, activate: true, why: watched ? 'a live view watches this window: no cycle' : 'hidden window', create: RUNG2_CREATE };
  return { run: true, breaker: false, activate: true, why: 'a real display: the window is never minimized in front of the user', create: RUNG2_CREATE };
}
/**
 * verify r4 T2 ③ (MEASURED on Chrome 154, 30/30 per mode): rung 2's create is a BACKGROUND one. A plain create that lost the
 * race landed in the other holder's window IN THE FOREGROUND: that holder's page went hidden for the stray's life (10–15 ms —
 * its screencast froze, its takeover's clicks went to a hidden page) and, when the stray was closed, Chrome put the LAST tab
 * of that window in front — not the one the holder had (30/30): the U0b freeze for a holder that did nothing. `background:
 * true` lands exactly as often (30/30 plain, 30/30 under a 20 ms racer, 10/10 after a sticky chain — both modes) and the
 * other holder's foreground never moves (30/30). The tab is `about:blank` until the window is VERIFIED: the keeper binds
 * (`tab <id>` — the CLI's own switch brings it forward in the holder's window) and navigates (`open <url>`) only then, so a
 * stray that lived 6–29 ms in another window was never that holder's business — a blank tab in the background, closed.
 */
const RUNG2_CREATE = Object.freeze({ url: 'about:blank', background: true });
/**
 * verify r5 ② (MEASURED on the product's Chrome: a holder refused `window_busy` (user_driving) heard NOTHING at the handback —
 * 0 events on its key over 10 takeovers and 5 Browse-yourself releases; its retry was blind): when the user's drive ENDS
 * (no window of the browser driven any more) every holder refused meanwhile is told ONCE, FREE — the zero-spend notice
 * record session-status renders under its `browser-window-free` kind (never a turn, never a card: nobody typed it).
 */
const DRIVE_ENDED_NOTICE_KIND = 'browser-window-free';
function driveEndedNotice({ label = null, n = 0, at = 0 } = {}) {
  return { kind: DRIVE_ENDED_NOTICE_KIND, label: label ? String(label).slice(0, 80) : null, n: Math.max(1, Math.floor(Number(n) || 0)), at: Number(at) || 0 };
}
function driveEndedText(n) {
  const x = isObj(n) ? n : {}; const k = Math.max(1, Math.floor(Number(x.n) || 0));
  return `The user handed ${x.label ? `"${x.label}"` : 'the browser'} back — the \`tab new\` VibeSpace refused window_busy while he drove (${k} time${k === 1 ? '' : 's'}) can run now; your window and its tabs are as they were.`;
}
function renderDriveEndedNotice(n) { return '<system-reminder>\n' + driveEndedText(n) + '\n</system-reminder>'; }
/** verify r3 T2 ④: of a lease's candidates and the windows they answered (tab → windowId | null), the ones in windows that
 *  are NOT the lease's own — `{windows:[…], tabs:[…]}` (empty = none). The red cell these make is SAID, never folded. */
function strayWindowsOf(windowsByTab, wantWin) {
  const w0 = windowIdOf(wantWin); const windows = [], tabs = [];
  if (w0 == null) return { windows, tabs };
  const entries = windowsByTab instanceof Map ? [...windowsByTab] : Object.entries(isObj(windowsByTab) ? windowsByTab : {});
  for (const [tid, w] of entries) { const wi = windowIdOf(w); if (wi == null || wi === w0) continue; tabs.push(String(tid)); if (!windows.includes(wi)) windows.push(wi); }
  return { windows, tabs };
}
/** verify r2 T1 — THE OPENER RULE MEASURED (Chrome 154.0.8037.57, headless AND the hidden window agree, 2026-10-02; the
 *  raw-CDP scripts are kept with the lane's notes: measure-opener2-r2.mjs, measure-openees-r2.mjs). Read by the fast gate
 *  as the proof behind each cell of the opener table; a changed Chrome re-measures, never re-guesses. */
const OPENER_PROOF = Object.freeze({
  chrome: '154.0.8037.57', modes: ['headless', 'hidden'],
  plain: 'lands (main world, isolated world, the product act)', hiddenAnchor: 'lands',
  noGesture: 'blocked (no tab) — the act carries userGesture',
  siteOverridesWindowOpen: 'the MAIN-world act is hijacked (the site\'s code runs, no tab); the ISOLATED-world act lands',
  strictCsp: 'lands (both worlds — CSP binds page script, not a DevTools evaluate)',
  navigating: 'the page act times out (the isolated world dies with the document); rung 2 lands',
  dialogOpen: 'the page act times out; Browser.getWindowForTarget still answers the window; rung 2 lands',
  crashed: 'the page act times out (no fast error; the target stays listed in its window); rung 2 lands',
  beforeunload: 'lands, no dialog (window.open fires none)', chromeError: 'lands',
  anchorClosedBefore: 'fails at once (the page socket answers 500); the window lives on through its other tabs',
  anchorClosedDuring: 'the tab still opens, in the window, its opener cleared — accepted by its window when the anchor is gone',
  popupFeature: 'a NEW window (300×334 vs the holder\'s own), opener = the holder\'s tab; the holder\'s next tab still lands in its own window',
  noopener: 'lands in the window; Chrome still reports openerId (ownership holds)',
  openees: 'a page that opened 1 or 4 tabs navigates in ~25 ms afterwards (no stall; a first-navigation stall of a fresh Chrome is the harness\'s, not the rule\'s)',
  // verify r3 (2026-10-02, the same Chrome, both modes; measure-r3*.mjs beside the lane's notes)
  sandbox: 'a `Content-Security-Policy: sandbox` page (allow-scripts or not) opens NO tab from the isolated world (allow-popups absent) — no_new_tab in 1.5 s; rung 2 lands',
  anchorKinds: 'chrome-error, about:blank, a PDF viewer, view-source:, data: — the isolated-world act lands from every one (~20 ms)',
  noopenerTruth: 'with noopener Chrome still reports openerId (ownership holds) but canAccessOpener:false and the page sees window.opener === null — the placement is the tab strip\'s (a window.open tab joins its opener\'s window), never the page\'s opener link',
  rung2Raced: 'activate + create raced by ANOTHER holder\'s activation: the create landed in the other holder\'s window 29/30 (headless) and 20/30 (hidden), closed at once, having lived 6–29 ms there; a 100 ms gap between activate and create was the exposure — none (0 ms) lands 30/30 plain and 29/30 raced in the hidden window',
  rung2Chain: 'HEADLESS: after one lost race + the stray\'s close, every later activate + create kept landing in the other window (0/30; retries 0/15 with 150 ms settles; 3 s later still) — the "last active window" follows WINDOW-STATE changes only',
  rung2Breaker: 'Browser.setWindowBounds minimized → normal (7 ms) re-establishes the window as the create target: headless 6/6 (then the 2 ms racer never wins, 8/8); the hidden window needs the cycle AND the activation (6/6; either alone 0/6); the cycle moves the sticky target — every rung 2 does its own, the keeper serializes them per browser',
  lastTabClosedMidAct: 'the anchor the LAST tab of its window, closed 5–250 ms into the act: the openee lands in the OLD window and keeps it alive (opener cleared, adopted); closed at 0 ms: no tab, the window gone — the ladder must re-ask the window before saying window_busy',
  ladderCost: 'four anchors each holding a dialog: 4 × 2.5 s (10.0 s) of page acts before rung 2 landed in 150 ms — hence ANCHOR_PROBE_MS',
  popupKids: 'a popup-feature window that navigated to a site and opened tabs of its own: they are the POPUP\'s (opener = the popup), in neither window of the two; the holder\'s next tab still lands in its own window',
  // verify r4 (2026-10-02, r3's additions attacked — on the PRODUCT's Chrome: a real keeper launching the real 0.38.1 on a scratch
  // HOME, headless AND the hidden window, 30 trials per cell; measure-r4-keeper.mjs beside the lane's notes. r3's "frame cost"
  // cell had read 0/0 frames — its screencast never flowed (raw google-chrome without the CLI's Playwright flags paints none)
  cycleUnderView: 'the holder\'s own window under a FLOWING screencast (52 fps): the window-state cycle (0–4 ms) flips the page hidden → visible 30/30 in HEADLESS (the page observes it: rAF stops, visibilitychange fires) and NOT AT ALL in the hidden window (no window manager to iconify: 0/30); the picture skips 1–3 frames either way (longest gap ≤ 66 ms headless, ≤ 67 ms hidden, the stream\'s own interval 19 ms); the activation alone flips nothing; a takeover\'s pointer every 10 ms through 10 cycles: 180 calls, 0 errors, ≤ 13 ms',
  cycleVsOtherDriven: 'the OTHER holder\'s driven window (its screencast flowing, its pointer every 10 ms) under 33 rungs of this one (cycle + activate + create): 212 frames in 4 s, longest gap ≤ 19 ms, 0 visibility flips, 236 pointer calls 0 errors — both modes: a rung on one window never touches another',
  racerRates: 'the other holder\'s activation every 20 / 50 / 200 ms through the product\'s rung 2: 30/30 landed at every rate in both modes on try 1 (one try-2 landing at 50 ms in the hidden window, its leak counted), 11–37 ms per rung',
  strayForeground: 'a stray in another holder\'s window: a FOREGROUND create hid that holder\'s page for its life (10–21 ms) and, closed, left its LAST tab in front — not the one it had (30/30 per mode, raw Chrome and the product\'s: the U0b freeze for a holder that did nothing); a BACKGROUND create: its page stays visible, its foreground unchanged after the close (30/30 per mode); a 5 ms poller of that holder\'s target list sees the stray either way for 7–21 ms (about:blank, 35–49 polls over 30 trials) and never a URL — the keeper navigates only after the window is verified',
  backgroundLanding: 'the background create lands as often as the foreground one: 30/30 plain, 30/30 headless / 29/30 hidden under a 20 ms racer (the retry covers it), 10/10 after a sticky chain',
  busyAnchor: 'a page busy for 2 s (a script loop): the probe is renderer-bound (Page.getFrameTree answers after the loop, 1987 ms) ⇒ anchor_unresponsive at 402–404 ms 10/10 and the ladder moves to the NEXT anchor (the cycle is last, after every anchor); busy 300 ms ⇒ the probe waits and the act lands 10/10 at ~300 ms — a slow page under the budget is never refused',
  // verify r5 (2026-10-02, r4's three parts attacked on the PRODUCT's Chrome — a real keeper + the real 0.38.1 on a scratch HOME,
  // headless AND the hidden window, 30 trials per cell per mode; measure-r5-keeper.mjs + r5-repro/ beside the lane's notes)
  planReadAtTop: 'r4 read the plan ONCE at the ladder\'s top — before the opener rung\'s probes (OPENER_ANCHORS_MAX × ANCHOR_PROBE_MS) and before the wait for the rung-2 lock: a takeover of the OTHER holder\'s window that began 150 ms into a `tab new` whose anchors were busy ran rung 2 (the cycle + the activation) under the user\'s hands at ~810 ms, 30/30 per mode; a live view that opened at 150 ms got the cycle under its first frames 30/30 per mode — in headless the watched tab flipped hidden → visible (the cycle) → hidden (the ACTIVATION of the anchor hides whatever tab was in front; r4 measured the activation on the anchor itself, which was in front), in the hidden window hidden alone. The plan is read AT rung 2, after the lock (the last await before it)',
  bindGoneWindow: 'the user closed the holder\'s window between the background create and the bind: `tab <id>` answers "No tab with label …" and the keeper fell to the binary\'s own `tab new` — the tab landed in the OTHER holder\'s window IN THE FOREGROUND and that holder\'s page stayed hidden, for good (30/30 per mode: the U0b class on the fallback path). Refused window_busy (why bind_failed) now, nothing opened; the same `tab new` once more re-asks the window and opens a new one of its own',
  bindIsAFocus: 'the CLI\'s `tab <id>` (the keeper\'s bind) focuses the holder\'s window: a plain background create with no activation right after it lands in that window 10/10 per mode — one holder\'s bind IS a racer for the other\'s rung 2; under a continuous `tab new` + `tab close` loop of the other holder rung 2 still landed 10/10 per mode (one leak closed + a try 2 in the hidden window): the cycle + activate + create leave no gap',
  bindStall: 'HELD as a named backlog case (the lane\'s last round; r4-independent — U1\'s own steps after the create): under the other holder\'s `tab new` + `tab close` loop a landed tab\'s bind + navigate (`tab <id>` + `open <url>`) took ~30 s and still SUCCEEDED in 1–4 of 10 `tab new`s (headless under a continuous loop; the hidden window 2/10 at a 300 ms cadence too; 0/10 headless at 300 ms), the landing itself at ~850 ms every time (the phases in r5-repro/measure-r5-pre-*.json) — THE STEP IS THE BIND: `agent-browser --pin-tab tab <id>` itself answers after ~30 s (the keeper\'s 30 s exec timeout fails it — "Command failed" — about as often as the CLI answers just under it; the late answer was taken pre-r5 and the tab was the holder\'s; post-r5 the failure is window_busy bind_failed, the tab closed); never seen without the other holder\'s churn',
  flipsPerTabNew: 'a `tab new` through rung 2 with no viewer: the tab in front of the holder\'s window sees hidden → visible (the cycle) → hidden (its anchor activated) = 3 events per try in HEADLESS, 1 (the activation) in the hidden window — the fleet pods\' shape, where the cycle itself flips nothing; 1 try even under a 20 ms racer in headless (10/10), 2 tries 8/10 in the hidden window (every stray closed and counted). Headless = the dev machine\'s shape only',
  refusedHolderHears: 'a holder refused user_driving heard NOTHING at the handback — 0 events on its key over 10 takeovers of the other holder\'s window + 5 Browse-yourself releases, per mode; its blind retry landed 10/10 (the announcer tells the DRIVEN conversation only). A `drive-ended` event now tells every refused holder by a free next-turn notice (browser-window-free)',
  strayHeadless: 'r4\'s "foreground stray 30/30 per mode" cell had landed 0/30 strays in HEADLESS on the product\'s Chrome (its keeper JSON; the hidden window carried the claim) — re-measured: in headless the create lands in the other holder\'s window 30/30 after its activation, after its cycle, or after both; a foreground one hides its page 30/30, a background one never; in the hidden window the cycle alone does NOT move the target (30/30 in the own window — r3\'s "the hidden window needs the cycle AND the activation" holds)',
  postFix: 'the same cells on the r5 keeper, 30 trials per mode: the mid-ladder takeover ⇒ window_busy user_driving 30/30, rung 2 run 0 times; the mid-ladder viewer ⇒ no cycle 30/30 (the activation\'s hide of the front tab remains, ~40 ms); the window closed under the bind ⇒ window_busy bind_failed 30/30, 0 tabs in the other holder\'s window, its page visible; every handback and every release of his window ⇒ ONE drive-ended naming the refused holder (n = the refusals of that drive); the bind racer ⇒ 10/10 or 9/10 + 1 bind_failed, 0 leaks',
  viewerCountLag: 'the bridge drops its count in dropViewer at the socket\'s close: a clean close and a destroyed socket within 0–1 ms (30/30 each); a half-open peer never closes by itself (17 MB buffered in 10 s, no send error, no server-side ping) — a vanished viewer keeps its window "watched" until the kernel\'s retransmission timeout: the conservative side (no cycle; activate + create, verified). The count RISES at attach before the upstream opens, so a cycle never runs under a first frame the bridge knows of',
});
/** verify r2 ⑤ — a HIDDEN tab's frames, measured (the same runs): none in 5 s under a rAF + 1 ms-timer page, exactly ONE at a
 *  visibility flip (headless; none in the hidden window). BACKGROUND_PAINT_FRAMES stays above it: no flapping, no hysteresis. */
const BACKGROUND_PAINT_PROOF = Object.freeze({ hiddenFrames5s: 0, flipFrames: 1, chrome: '154.0.8037.57' });
/** rows `[{holder, windowId}]` (one per tab) → `{holder: {windows:[…], count}}` — the per-holder window census (the heavy
 *  gate reads Chrome's own `Browser.getWindowForTarget` into it). A null windowId (a target that answered no window) is not a window. */
function windowCensus(rows) {
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!isObj(r) || !r.holder) continue;
    const h = String(r.holder);
    if (!out[h]) out[h] = { windows: [], count: 0, popupWindows: [], popups: 0 };
    const w = windowIdOf(r.windowId); // verify r3 ⑥: the one reader
    if (w == null) continue;
    // verify r2 ③ (measured): a popup-feature window.open is a NEW Chrome window whose opener is the holder's tab — the
    // PAGE's window, listed as the holder's tab and paused with its lease, never the holder's second window (the caller marks
    // the row `popup`: a tab with an opener in a window that is not the lease's own)
    if (r.popup === true) { if (!out[h].popupWindows.includes(w)) { out[h].popupWindows.push(w); out[h].popups++; } continue; }
    if (!out[h].windows.includes(w)) { out[h].windows.push(w); out[h].count++; }
    // verify r3 ④: a tab of the lease in a window that is not its own (a pre-r1 leftover) COUNTS (the red cell is honest) and is
    // listed — the product's answer is the said state (STRAYS_NOTE), never a fold
    if (r.stray === true) { if (!out[h].strayWindows) out[h].strayWindows = []; if (!out[h].strayWindows.includes(w)) out[h].strayWindows.push(w); }
  }
  return out;
}
/** verify r2 T1 (reproduced): `Number(null)` is 0, so `Number.isFinite(Number(windowId))` stamped a window that could not be
 *  read as window 0 — a window no tab ever answers, re-minted at the next tab (two windows for good). THE ONE reader of a
 *  window id: a finite number, or null (null / undefined / '' / NaN are not windows). */
function windowIdOf(v) { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
/** THE RED CELL: the holders of a census that hold more than one window (empty = the rule holds). */
function multiWindowHolders(census) { return Object.entries(isObj(census) ? census : {}).filter(([, v]) => isObj(v) && Number(v.count) > 1).map(([k]) => k); }

// ── U0b (verify r1 ④): a tab that PAINTS is not a background tab, whatever the page says ──
/** A page can lie (`document.visibilityState` overridden): a verdict that only `visible` clears would stand for ever under
 *  a 60 fps stream, polling and re-asking twice a second. The FRAME FACTS decide too: this many frames inside this window
 *  ⇒ it paints ⇒ the verdict clears (one stray frame — Chrome sends one at a visibility flip — stays a re-ask only). */
const BACKGROUND_PAINT_FRAMES = 5;
const BACKGROUND_PAINT_WINDOW_MS = 1000;
/** `{paints}` over the recent frame instants (the newest last): ≥ BACKGROUND_PAINT_FRAMES inside the last window ⇒ true. */
function paintsAgain({ frameTimes = [], now = 0, frames = BACKGROUND_PAINT_FRAMES, windowMs = BACKGROUND_PAINT_WINDOW_MS } = {}) {
  const t = Number(now) || 0;
  const n = (Array.isArray(frameTimes) ? frameTimes : []).filter((x) => Number.isFinite(Number(x)) && t - Number(x) <= Number(windowMs)).length;
  return { paints: n >= Number(frames), recent: n };
}

// ── U4: the machine's ceiling of running browsers is a SETTING ──
const MAX_RUNNING_MIN = 1;
const MAX_RUNNING_MAX = 32;
/** `browser.maxRunning` → an integer in [1, 32]; anything else (unset, junk) ⇒ the default (the keeper's CONCURRENT_CAP). */
function maxRunningOf(v, dflt = 6) {
  const d = Number.isInteger(Number(dflt)) && Number(dflt) >= MAX_RUNNING_MIN ? Math.min(MAX_RUNNING_MAX, Number(dflt)) : 6;
  if (v === null || v === undefined || v === '') return d;
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(MAX_RUNNING_MIN, Math.min(MAX_RUNNING_MAX, Math.round(n)));
}

// ── lane live-watch-polish (B-93d7, design 006 G1/G2/G5): THE WATCH'S WORDS AND THE "▾+N" MENU — PURE, `t` passed in ──
const wordsOf = (t) => (typeof t === 'function' ? (s, p) => t(s, p) : (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m)));
/** A title the watch line / menu names. A PAGE chose it (peer text): bounded BEFORE the code-point walk, whitespace folded,
 *  cut to `max` characters with "…" — the client sets it as textContent, never markup. '' for none. */
const WATCH_TITLE_MAX = 40;
function watchTitle(title, max = WATCH_TITLE_MAX) {
  const s = String(title == null ? '' : title).slice(0, max * 4).replace(/\s+/g, ' ').trim();
  const g = Array.from(s);
  return g.length > max ? g.slice(0, max - 1).join('') + '…' : s;
}
/** G2: the watch line names BOTH tabs — "Watching “X” — the agent is on “Y”" (the polling one keeps its half-second
 *  clause). A title not known (yet) keeps the unnamed sentence — never an empty pair of quotes. */
function watchLineWords({ watched = '', current = '', mode = 'screencast' } = {}, tIn) {
  const t = wordsOf(tIn);
  const w = watchTitle(watched), c = watchTitle(current), polling = mode === 'polling';
  if (w && c) return polling ? t('Watching “{watched}” — a new picture every half second; the agent is on “{current}”', { watched: w, current: c }) : t('Watching “{watched}” — the agent is on “{current}”', { watched: w, current: c });
  return polling ? t('Watching a background tab of the agent’s — a new picture every half second; the agent’s current tab is unchanged') : t('Watching another tab of the agent’s — the agent’s current tab is unchanged');
}
/** G1: the "▾+N" menu — each folded row asks the SAME click verdict as its chip (`clickOf(row)` → {act}, tabClickVerdict)
 *  and its entry says the act; his own window's rows keep the row's own switch (`canSwitch`); a row with nothing to do is
 *  NOT listed (no greyed control). → [{targetId, act, label}] in row order. */
function foldMenuRows(rows, clickOf, tIn) {
  const t = wordsOf(tIn);
  const out = [];
  for (const r of rows || []) {
    if (!r || !r.targetId) continue;
    const cv = (typeof clickOf === 'function' && clickOf(r)) || { act: 'none' };
    const act = cv.act && cv.act !== 'none' ? cv.act : r.canSwitch ? 'switch' : null;
    if (!act) continue;
    const title = watchTitle(r.title) || '—';
    const label = act === 'watch' ? t('Watch — {title}', { title }) : act === 'follow' ? t('Back to the agent’s tab — {title}', { title }) : act === 'front' ? t('Bring to the front — {title}', { title }) : t('Switch to — {title}', { title });
    out.push({ targetId: r.targetId, act, label });
  }
  return out;
}
/** G5: a refused or failed watch said BY CODE in the device's words — the bridge's `refused` (driving / not_your_tab /
 *  unavailable / unreadable) and, for unreadable, the capture's `why` (unreachable / no_screencast / no_tab). The server's
 *  English sentence never reaches the toast for a code named here; an unknown code keeps the server's words. */
const WATCH_REFUSALS = Object.freeze(['driving', 'not_your_tab', 'unavailable', 'unreadable']);
function watchRefusalWords({ refused = '', why = '', error = '' } = {}, tIn) {
  const t = wordsOf(tIn);
  switch (refused) {
    case 'driving': return t('you drive this window — its chip switches the agent’s tab');
    case 'not_your_tab': return t('Another conversation’s — open its live view to use it');
    case 'unavailable': return t('this server cannot show another tab');
    case 'unreadable': return why === 'unreachable' ? t('the tab could not be reached') : why === 'no_screencast' ? t('the tab refused a screencast') : why === 'no_tab' ? t('the tab is gone') : t('the tab could not be shown');
    default: return String(error || refused || '');
  }
}

module.exports = {
  WINDOWS_PROOF, ownWindowParams, windowCreateParams, instanceOf, hasOwnWindow, windowMates,
  TAB_LABELS_MAX, withTabLabel, labelTargetOf, withLabelsOnRows,
  WATCH_FIRST_FRAME_MS, WATCH_POLL_MS, watchModeVerdict, TAB_CLICK_ACTS, tabClickVerdict, BACKGROUND_SILENCE_MS, UNRESPONSIVE_MS,
  ONE_WINDOW_PER_HOLDER, OPENER_ANCHORS_MAX, OPENER_PROOF, BACKGROUND_PAINT_PROOF, windowIdOf, windowCensus, multiWindowHolders,
  ANCHOR_PROBE_MS, RUNG2_TRIES, STRAYS_NOTE, RUNG2_CREATE, rung2Plan, strayWindowsOf, // verify r4: the plan takes {viewers, driven}; the create is a background one // verify r3: the anchor probe, rung 2's tries + plan (the window-state cycle off a real display), the strays said once // verify r1 T2 ⑧ + r2 T1: one window per holder, the measured opener table, the census of the red cell
  DRIVE_ENDED_NOTICE_KIND, driveEndedNotice, driveEndedText, renderDriveEndedNotice, // verify r5 ②: the refused holders told, free, when the user's drive ends
  BACKGROUND_PAINT_FRAMES, BACKGROUND_PAINT_WINDOW_MS, paintsAgain, // verify r1 ④: the frame facts clear a lying page's verdict
  MAX_RUNNING_MIN, MAX_RUNNING_MAX, maxRunningOf,
  WATCH_TITLE_MAX, watchTitle, watchLineWords, foldMenuRows, WATCH_REFUSALS, watchRefusalWords, // lane live-watch-polish G1/G2/G5
};

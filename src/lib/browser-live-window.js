// THE LIVE VIEW WINDOW (agent browser P2 — docs/design-agent-browser-v2.md
// §4.2 / §4.4 / §3.7). Window type `browser-live`, registered here so the
// title-bar icon, the taskbar, the tab bar and replayOpenSpec learn it from
// ONE registration; openSpec `{action:'openBrowserLive', sessionId,
// profileId}` persists and replays across refresh, desktops and clients — a
// reload comes back in WATCH mode (a reload must never re-seize controls).
//
// What it draws: the session's browser through the cookie-authed bridge
// (`/api/browser/stream?session=…&profile=…`, src/server/browser-stream.js):
//   · the PICTURE — each `frame` is a base64 JPEG drawn through `img.src`
//     (the image-overlay law: never markup), inside a container at NET
//     ZOOM 1 (utils.js's COUNTER_ZOOM, the vnc-view rule — the literal is spelled ONCE), and
//     the ONE pointer conversion `pointerAt(ev)` maps viewport px → the
//     page's CSS px through src/browser-stream.js (`pointerToDevice`)
//     — no mixing of viewport rects with layout widths (inc-mtdrm922); the
//     picture is letterboxed by ITS OWN size (img.naturalWidth/Height) and the
//     page's size is `frameGeometry` over the bridge's `viewport` reading, the
//     metadata and the picture (lane J, inc-muhgv0fb-9i4u: 0.32.0's metadata
//     is a synthesized 1280×720 — clicks landed off by up to hundreds of px);
//     the agent cursor is placed through the SAME rect basis; lane J r2: the
//     picture is TOP-aligned (object-position 50% 0 — `LIVE_ALIGN`), so a
//     picture of a wider aspect than its pane fills the width and every spare
//     pixel sits below it, never a band above and below (the study's "a third
//     of the pane is dark bands"); every conversion passes the same `align`;
//   · the URL line (from `url` records / the active tab), the TABS pane, the
//     CONSOLE pane (from `console` records), the ACTIONS pane (P5: the trace
//     timeline of this pane, seeded by GET + the stream's `trace` records), the
//     viewer count, the recording indicator (P5: the profile's live screencast
//     from the digest; click = the Browser profiles panel), a hand-off to the
//     embedded browser window;
//   · the MODE badge + the three modes of §4.3 (P3): Watch ("Agent is
//     driving"), Take over (this viewer holds the input side — pointer,
//     wheel and keys are forwarded as the stream server's CDP-shaped records,
//     `src/browser-stream.js` builds them; the agent's commands are refused
//     `browser_paused` meanwhile), Hand back (a transition: the keeper flips
//     the lease and announces through the gated ladder); a `mode` record from
//     the bridge (another window, the idle sweep, the card's Hand back) moves
//     every viewer at once; a reload comes back in WATCH mode;
//   · THE KEYBOARD WHILE YOU DRIVE (lane J r2 — the 2026-09-25 naive-user
//     study: "tomsmithtomsmith…" typed into the live view landed in the CHAT
//     COMPOSER, one Enter from sending a password to the agent): while THIS
//     viewer drives, the view OWNS the keyboard at document level — capture-
//     phase keydown/keyup/keypress, paste, beforeinput, composition and
//     focusin listeners bound to the window's AbortController route every key
//     to the page (PURE `keyRoute`: only `RESERVED_CHORDS` stay the app's —
//     Ctrl+\ and Ctrl+Alt+←/→; Esc goes to the page, handing back is the
//     button), a paste arrives as its TEXT (lane live-input: ONE `input_text`
//     record — the bridge cuts it into the ≤ 3-unit `char` records Chromium
//     accepts, in order with the keys), an IME composes in
//     the view's own hidden sink and is forwarded at `compositionend`, and an
//     editable element elsewhere that takes focus is reclaimed at once
//     (`focusVerdict`) — UNLESS the user pressed it himself (lane takeover-keyboard,
//     userW inc-mum339id-1zsb: src/lib/keyboard-yield.js — the keys go to the text box
//     he pressed, the takeover continues, a press in the view takes them back; the bar
//     and the composer say where the keys are). The claim lives in src/lib/keyboard-owner.js: ChatInput.focus
//     (the attach/reconnect path) and TerminalSession.focus stand down while it
//     owns. Ownership is PURE `keyboardOwnership` (takeover + mine + socket
//     open + on screen + open), re-asked on every event — a dropped socket,
//     a desktop switch, a handback release it without bookkeeping. The bar
//     says "Typing goes to the browser" and the picture wears a focus ring.
//     lane live-input (2026-09-27): a Mac viewer's ⌘ chords are translated for a
//     non-Mac browser (PURE `macChord`), a keyup reaches the page only after its
//     keydown did, the sink takes the focus back after a click elsewhere in the
//     view, a drag and a double click reach the page, and the page's own copy
//     comes back to the viewer's clipboard (`onPageCopied`, picture-shell's rule).
//   · INPUT FEEDBACK (lane J r2: a lost input looked like a frozen picture):
//     every click while driving draws a RIPPLE at the mapped page point (placed
//     back through deviceToViewport — the ripple lands where the page got the
//     click), the bar echoes "input sent · n", and a small "you" marker shows
//     where the page believes your pointer is (the screencast draws no cursor);
//   · the AGENT CURSOR (§4.3 "cursor identity"): while the agent drives, a
//     labelled cursor at the last CDP input coordinates the `command` mirror
//     carried (PURE agentCursorFromCommand + deviceToViewport); hidden while
//     the user drives (the user's own pointer is the cursor);
//   · the --confirm-actions CARD (§4.3): a typed `confirmation` record draws
//     a bar with Confirm / Deny + the daemon's 60 s countdown; the answer is
//     the stream's `confirm` verb (upstream's own confirm/deny underneath);
//     r6 A-F8: each row names the action's TARGET, a Confirm carries the
//     digest of the row it was pressed on, the rows are KEYED SLOTS (a row
//     that goes never lets the next one move up under the pointer), and a
//     second record under a held id never repaints it (first write wins);
//     r6 A-F9: the Hand back button says how many conversations it wakes and
//     its press carries that count (`expectWakes`);
//   · the SWITCHER STRIP (§3.7): a session with ≥2 attachments gets one tab
//     per attachment inside THIS window, never N windows; each tab carries
//     its own activity light (the stream's `command`/`result` mirrors), the
//     title names the profile of the pane you are looking at, and clicking
//     the title opens §3.2.5's picker; P7: each strip tab carries the
//     per-session OWNER dots of its profile (who else this browser belongs to);
//   · WINDOW BINDING (P7, §4.6): ONE `toggleBind()` behind three surfaces —
//     the bar's "Snap beside <session>" / "Unbind" button, a title-bar button
//     on the standalone window, and the 'window' menu row (the title bar's own
//     menu, reachable from the tab and the phone's long-press) — binds this
//     pane beside its session's window in one tab group (wm.bindSplit,
//     announced ⇒ the 5 s Undo toast — split UX R5) or unbinds (the group
//     stays, nothing moves); the OWNERSHIP badge
//     (wm.setOwnerBadge: the session's own colour + name, N dots when the
//     profile is shared, from the digest's `leases`) rides the title bar and
//     the tab; AUTO-BIND (`browser.autoBindLiveView`, default ON): when a
//     session's browser starts (a NEW lease in the digest — since lane H a
//     managed EPHEMERAL browser's holder row too, while it runs) and its window is
//     open on this desktop, the live view is BORN inside that chain
//     (createWindow's intoChain — never created-then-merged) under a
//     deterministic syncId so two clients never open two.
//   · lane S4 — THE PAGE IS THE PANE'S SIZE (naive study 2: "实况画面只占窗格上面一截",
//     the phone's desktop-width strip, the blank-white picture): the view REPORTS
//     its pane (`fit`: the canvas's box in CSS px at net zoom 1 — never device px,
//     so a DPR-3 phone asks for a 390-wide page — plus whether it is on screen),
//     settled by a ResizeObserver; the bridge sizes the page to the ruling pane
//     (src/browser-fit.js: the driver's, else the largest visible) and says so
//     (`{type:'fit'}`); the FIT CHIP (bar item `fit`) speaks only when the page is
//     NOT this pane's size — the agent chose it ("Fit to this window" is the one
//     act that takes it back), another window's pane rules, a headed browser's
//     narrowest, or the size could not be set. PICTURE CLOCKS: no frame 2 s after
//     the stream opened / after a navigation ⇒ "Waiting for a picture…" (the stale
//     picture dimmed, a `refresh` asked once), 10 s ⇒ said with a Reconnect —
//     never a blank picture under a URL that says loaded. THE PHONE'S PINCH (watch
//     mode): two fingers zoom the picture (a transform, origin top-left, 1–4×), one
//     finger pans a zoomed one, a double tap toggles 2×; taps map through the
//     transform (the pointer reads the transformed rect); in takeover a pinch is
//     refused with a hint.
// XSS: page titles and URLs are page-controlled and sync to every client —
// textContent / escHtml only. Theme vars only, SVG icons only.
import { t, tc } from './i18n.js';
import { claimWords, backendName, dismissOutcomeWords } from './browser-switcher-model.js'; // the rebuilt switch dialog: the claim's words, a backend's name, the Dismiss answer (PURE)
import { btn as textBtn } from './channel-chrome.js'; // the house text button (mounts-btn): the blocked banner's controls say what they do
import { escHtml, fetchJson, showToast, showContextMenu, createPopover, showConfirmDialog, showInputDialog, COUNTER_ZOOM } from './utils.js';
import { MODAL_OPEN_EVENT } from './utils.js'; // lane dialog-keys: every app modal says it opened (createModalShell, app._showDialog)
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerMenuItem } from './contributions.js';
import { ownerDots, livePlacement } from './chain-layout.js'; // P7 (§4.6): the per-SESSION owner colour, never the group's; MULTIVIEW D5: where a new live view goes
import { stripOrder, stripFold, capChip, shortLabel, stoppableRows, rowStateWords, tabRowFold } from './live-strip-layout.js'; // MULTIVIEW §2 A1 / D4: the strip's order, fold and own/cap chip (PURE); lane browser-resume C: the tab row's fold
import { tabRowModel, tabRefusalText } from '../browser-tabs.js';
import { tabClickVerdict } from '../browser-windows.js'; // lane browser-windows (U3/U0b): what a chip click does — bring forward / switch (driving) · watch / follow (watching) // lane browser-resume C (§3.9, ruling 3): whose tab it is and what this viewer may do to it (PURE)
import { avatarOf } from './channel-avatar.js'; // lane browser-resume C (D3): a tab's badge = the host's initial on a stable hue (no network — never a favicon fetch)
import { UI_ICONS } from './icons.js';
import { STREAM_PATH, MAX_FPS_DEFAULT, EPHEMERAL_REF, pointerToDevice, deviceToViewport, drawnRect, liveTitle, mouseRecord, wheelRecord, keyRecord, touchRecord, modifiersOf, liveViewPlan, viewTargetRunning, browserListFor, clickCountNext } from '../browser-stream.js';
import { frameGeometry, toLocal } from '../browser-stream.js'; // lane J: the picture vs the page — two sizes, one rect basis
import { LIVE_ALIGN, inputTextRecord, textReceiptMs } from '../browser-stream.js'; // lane J r2: the picture's placement (top); lane live-input: ONE `input_text` record per paste / IME commit (the bridge cuts it into the chunks the browser accepts)
import { agentCursorFromCommand, modeBadge as modeBadgeText } from '../browser-takeover.js';
import { confirmationDigest, confirmSlots } from '../browser-takeover.js'; // r6 A-F8: the digest of what a card showed + the card's slots (PURE)
import { keyboardOwnership, keyRoute } from '../browser-takeover.js'; // lane J r2: the keyboard while you drive (PURE tables; focusVerdict is read through keyboard-yield.js since lane takeover-keyboard)
import { heldReleases } from '../browser-takeover.js'; // lane takeover-keyboard verify r1 (K4): a yield releases in the page what is still held there
import { RECLAIM_CUE_MS } from '../browser-takeover.js'; // lane takeover-keyboard verify r2 (H5): a focus taken back from a frame is said, rate-limited
import { macChord, isMacPlatform, copyChordOf, copyWriteVerdict } from '../browser-takeover.js'; // lane live-input: a Mac viewer's ⌘ chords on a non-Mac browser, the copy-out chords (PURE tables); verify: a copy is written by itself ONLY when it answers the user's own chord
import { copyViaSelection, pageIsSecure, GESTURE_WINDOW_MS } from './picture-shell.js'; // lane live-input: copy OUT = the desktop view's way (the API, the gesture copy on plain http, else the chip)
import { recordingChipWords } from '../browser-trace.js'; // lane live-input: the recording chip's three states in words a person can act on
import { claimKeyboard, releaseKeyboard, keyboardOwner, keyboardOwned, keyboardChanged } from './keyboard-owner.js'; // lane J r2: THE one keyboard owner of this client
import { onKeyboardChange } from './keyboard-owner.js'; // lane takeover-keyboard verify r2 (H1): another view's claim moving is a transition of this one too
import { createKeyboardYield, isEditable, sinkBlurVerdict } from './keyboard-yield.js'; // lane takeover-keyboard (userW inc-mum339id-1zsb): YOUR press on a text box outside the view gets the keys; a script's focus never does
import { dialogFocusTarget } from './keyboard-yield.js'; // lane dialog-keys: where a dialog that took the keys gets them when it focuses nothing itself
import { createTraceTimeline } from './browser-trace-view.js'; // agent browser P5 (§4.5 / D35): the Actions pane
import { shortModeBadge } from './live-bar-layout.js'; // lane I: the bar's never-fold badge words (the full sentence is its tooltip)
import { createBarFold } from './bar-fold.js'; // lane I: the bar folds into ⋯ by priority — never wraps, never overlaps
import { fitChipState, fitChipWords, pictureState, zoomAt, pinchStep, panStep, zoomClamp, isZoomed, transformCss, FIT_REPORT_MS, ZOOM_DOUBLE_TAP, ZOOM_NONE } from '../browser-fit.js'; // lane S4: the page is the pane's size, the picture clocks, the phone's pinch (PURE)
import { browserFactWords, liveFollowPlan } from '../browser-fact.js'; // lane S2: THE browser fact — the view's names, and a view FOLLOWS its session's browser
import { ownResumable, keptLineWords } from '../browser-fact.js'; // lane browser-resume B (§3.9): may the user Resume its own browser, and the stopped line's words
import { receiptBook, noteInputSent, noteInputReceipt, sweepInputReceipts } from '../browser-stream.js'; // lane S2: every input has a receipt
import { humanEndChoices, humanRefusalText, humanSyncId, addressVerdict, humanShareLine, LAUNCH_CODES } from '../browser-human.js'; // BROWSE YOURSELF (B-6ae8): the user's own browsing — its end buttons, its refusals, the address row (PURE)
import { dialogWords, answeredWords, stuckWords } from '../browser-stuck.js'; // lane browser-stuck: a page dialog / an unresponsive page in words (PURE)
import { createLoopBanner } from './browser-loop-banner.js'; // lane site-reset: the navigation loop, keyed + patched in place
import { displayFactOf, displayFactText } from './browser-display-words.js'; // lane headless-fallback: a headless browser (no desktop session) says so under the bar

const CONSOLE_CAP = 200;
const RECONNECT_MAX = 5;
const HIDDEN_FPS = 2;
const HINT_EVERY_MS = 8000;
/** Pointer moves are forwarded at most this often while the user drives. */
const MOVE_EVERY_MS = 33;
/** lane live-input: after a copy chord, the page's copy is expected this long; none ⇒ the echo says nothing was copied. */
const COPY_ANSWER_MS = 1500;
/** lane live-input: WHERE this view is, for the fit chip's words — `page` = this loaded page, `device` = this browser on
 *  this device (localStorage; unreadable storage ⇒ no device tag and the chip says "another window", never a guess). */
const PAGE_TAG = 'p' + Math.random().toString(36).slice(2, 12);
function placeTags() {
  let device = null;
  try { device = localStorage.getItem('vibespace.deviceTag'); if (!device || !/^[A-Za-z0-9_-]{4,40}$/.test(device)) { device = 'd' + Math.random().toString(36).slice(2, 12); localStorage.setItem('vibespace.deviceTag', device); } } catch { device = null; }
  return { page: PAGE_TAG, device };
}
/** lane live-input: is the VIEWER a Mac (its ⌘ chords are translated for a browser that is not)? */
const viewerIsMac = () => { try { return isMacPlatform((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent); } catch { return false; } };
/** The URL line's minimum width in the bar (the ONE flexible item) — public/style.css `.browser-live-bar > .browser-live-url` min-width says the same (test-live-bar-layout pins the pair). */
export const URL_MIN_PX = 120;
/** THE BAR'S FOLD PRIORITIES (lane I; src/lib/live-bar-layout.js): 0 never folds — the ONE mode toggle (Take over ↔
 *  Hand back) and Reconnect (shown only when the stream failed: then it is the one act that matters); 1 the mode badge
 *  (the LAST to go — lane I verify r1: a never-fold badge left a split pane's bar wider than the pane, the toggle cut
 *  and the ⋯ clipped out; folded, its sentence is the ⋯'s first row and the ⋯ wears its colour, and the toggle's own
 *  words still say who drives); 2 the URL + its web-view hand-off; 3 bind, viewers, recording; 4 the browser's name (the
 *  button when another browser is available, else the plain label — the rebuilt switch dialog, 2026-09-27);
 *  5 Tabs / Console / Actions (first to go — their counts ride the ⋯ rows). Equal priorities fold right-to-left. */
/*  2.369.180 (lanes I + J integrated): lane J r2's two driving-only items fold like the rest — the "Typing goes to
   *  the browser" chip with bind/viewers/recording (3; folded, its words are an info row of the ⋯), the "input sent · n"
   *  echo first (5; a transient count — the page itself shows what the input did). */
/*  lane S4: the FIT chip (shown only when the page is NOT this pane's size — the agent chose it, another pane rules …)
   *  folds with bind/viewers/recording (3); folded, its words and its act are a ⋯ row. */
/*  lane live-input: the FIT chip explains the picture on screen and offers the one act that changes it ("Fit here"),
   *  and the COPY chip ("Copied in the page — click to copy") is shown only while a copy waits for the user's click —
   *  both fold with the URL (2), AFTER bind/viewers/recording (the owner's narrow window folded the chip away first);
   *  folded, each is a ⋯ row with its act. */
/*  BROWSE YOURSELF (B-6ae8): the user's own browsing window adds its two ends — Close never folds (0: the one act that
   *  matters on that window, like the toggle), Quit the whole browser folds with the chips (3, a ⋯ row of its own words) —
   *  and the touch Keyboard button (3). */
/*  lane browser-resume B (§3.9, the owner's ruling 2): "Hand back and continue…" folds with the URL (2) — before the badge
   *  (which folds last); the toggle's own Hand back stays the never-fold act; folded, it is a ⋯ row with its own words and act. */
export const LIVE_BAR_PRIORITY = Object.freeze({ take: 0, handback: 0, reconnect: 0, close: 0, badge: 1, continue: 2, url: 2, open: 2, fit: 2, copy: 2, bind: 3, viewers: 3, rec: 3, kbd: 3, kbdBtn: 3, quit: 3, backend: 4, backendLabel: 4, tabs: 5, console: 5, trace: 5, echo: 5 });
/** lane J r2: how long the bar's "input sent · n" stays bright after an act, and a ripple lives. */
const ECHO_MS = 1600;
const RIPPLE_MS = 650;
const RIPPLE_KEEP = 8;
// (isEditable — an element a caret can live in — is src/lib/keyboard-yield.js's, ONE definition for the view and the yield.
// lane takeover-keyboard: a reclaimed focus is a focus nobody pressed for — it says nothing (no toast); the bar's chip is
// the standing statement of where typing goes.)
/** lane takeover-keyboard: the bar's words while the keys are YIELDED — where they are, and how to get them back
 *  (`kind` = src/lib/keyboard-yield.js yieldKindOf: the text box the user pressed). */
function yieldChipText(kind) {
  if (kind === 'dialog') return t('Keyboard is in the dialog — it goes back when you answer it'); // lane dialog-keys: a dialog the user opened holds the keys
  if (kind === 'none') return t('Keyboard is not in a text box — click one to type there, or the picture to use the page'); // verify r3 (r2's held): yielded, and nothing that takes keys holds the focus
  if (kind === 'chat') return t('Keyboard is in the chat box — click the picture to keep using the page');
  if (kind === 'terminal') return t('Keyboard is in the terminal — click the picture to keep using the page');
  return t('Keyboard is outside the browser — click the picture to keep using the page');
}
const KBD_SVG = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true" focusable="false"><rect x="1.5" y="4" width="13" height="8.5" rx="1.5"/><path d="M4 7h1M7.5 7h1M11 7h1M5 10h6"/></svg>';

/** The merged sidebar row for a webui id (names, pin, rung — for the picker). */
function sessionRow(app, sessionId) {
  try { return (app.sidebar?._allSessions || []).find((s) => s.webuiId === sessionId) || null; } catch { return null; }
}
/** The session's OWN window on this client (chat or terminal) — the thing a live view binds beside. */
export function sessionWindowFor(app, sessionId) {
  try {
    for (const [winId, view] of app.sessions || []) {
      if (!view || view.sessionId !== sessionId) continue;
      const w = app.wm.windows.get(winId);
      if (w && (w.type === 'chat' || w.type === 'terminal')) return w;
    }
  } catch { /* no sessions map */ }
  return null;
}
/** Is this window a pane of its chain's split? */
function isSplitPane(winInfo) {
  const c = winInfo && winInfo._tabChain;
  return !!(c && c.layout === 'split' && c.split && c.split.pair.includes(winInfo.id));
}
const BIND_SVG = svgIcon16('<rect x="1.5" y="3" width="5.5" height="10" rx="1"/><rect x="9" y="3" width="5.5" height="10" rx="1"/><path d="M7 8h2"/>');

/** Go to a live view the user named: goToWinId IS the door (§62); the bare raise is the fallback for a stub app in a suite. */
function goToWin(app, id) { if (typeof app.goToWinId === 'function') app.goToWinId(id); else app.wm.focusWindow(id); }
export function openBrowserLive(app, { sessionId, profileId = null, syncId, intoChain = null, popOut = false } = {}) {
  if (!sessionId) { showToast(t('No session to view'), { type: 'error' }); return null; }
  // naive study 2 (finding 2): ONE live view per session — a MANUAL open (the status-bar chip's "Open live view", the
  // card, the phone's switcher, Session Properties) goes to the session's existing view instead of opening another
  // (every click opened a new window); a new one takes the auto-bind's id `win-blive-<session>` (PURE liveViewPlan)
  // …EXCEPT the one deliberate second window (MULTIVIEW D3, 2.369.183): a strip tab's "Open in new window" is a POP-OUT —
  // another window of the same session (its own selection, the same strip), a free window with its own id, never the main
  // one's `win-blive-<session>` (a layout replay passes its saved syncId, which creates as before)
  const views = [...app.wm.windows.values()].filter((w) => w.type === 'browser-live' && w._browserLive).map((w) => { const s = w._browserLive.state(); return { id: w.id, sessionId: s.sessionId, profileRef: s.profileRef, connected: s.connected }; });
  const plan = liveViewPlan({ views, sessionId, profileId, syncId: syncId || null });
  if (popOut && !syncId) { plan.act = 'create'; plan.syncId = null; } // the pop-out: a fresh free window (never the focus of the session's view)
  if (plan.act === 'focus') {
    const w = app.wm.windows.get(plan.id);
    try { if (plan.switchTo) w._browserLive.switchTo(plan.switchTo); else if (plan.reconnect) w._browserLive.reconnect(); } catch { /* window going */ }
    goToWin(app, w.id);
    return w;
  }
  syncId = plan.syncId;
  app._hideWelcome?.();
  const winInfo = app.wm.createWindow({
    title: t('Agent browser (live)'), type: 'browser-live', syncId, intoChain: intoChain || undefined,
    openSpec: { action: 'openBrowserLive', sessionId, profileId: profileId || null },
  });
  const L = createLiveView(app, winInfo, { sessionId, profileId });
  winInfo._browserLive = L;
  winInfo.onClose = () => L.dispose();
  L.connect();
  return winInfo;
}

/**
 * BROWSE YOURSELF (B-6ae8, the owner 2026-09-28): the user's OWN browsing window — the SAME `browser-live` window type
 * (no new window kind) on HIS tab of the profile's browser: openSpec `{action:'openBrowserLive', profileId, human:true}`
 * (replayed in watch-or-take: the keeper decides — no agent is involved), the deterministic sync id
 * `win-bhuman-<profileId>` (two clients converge on ONE window). `fresh` = the token the press minted: the window it opens
 * takes his tab's controls at once (never persisted — a replay has none). An existing window is focused and re-attached
 * with the new token.
 */
export function openBrowserHuman(app, { profileId, key = null, fresh = null, syncId = null, label = null } = {}) {
  if (!profileId) return null;
  const id = syncId || humanSyncId(profileId);
  const existing = app.wm.windows.get(id) || [...app.wm.windows.values()].find((w) => w.type === 'browser-live' && w._browserLive && w._browserLive.state().human && w._browserLive.state().profileId === profileId) || null;
  if (existing && existing._browserLive) {
    try { existing._browserLive.rejoin({ key, fresh }); } catch { /* window going */ }
    goToWin(app, existing.id); // the user named HIS window: goToWinId IS the door (§62)
    return existing;
  }
  app._hideWelcome?.();
  const winInfo = app.wm.createWindow({ title: label ? t('{label} · you', { label }) : t('Browse yourself'), type: 'browser-live', syncId: id, openSpec: { action: 'openBrowserLive', profileId, human: true } });
  const L = createLiveView(app, winInfo, { sessionId: null, profileId, human: { key: key || ('hu-' + String(profileId).slice(3)), fresh, label } });
  winInfo._browserLive = L;
  winInfo.onClose = () => L.dispose();
  L.connect();
  return winInfo;
}
/**
 * THE BUTTON: Browse yourself (the Agent browser panel's row, the switch dialog's "Open it yourself"). ONE POST — the
 * keeper starts / joins the browser and opens HIS tab (nothing of any agent is paused: the owner, 2) — then the window.
 * A refusal is said in the device's words (PURE humanRefusalText by its code; a launch-time refusal keeps the server's).
 */
export async function browseYourself(app, profileId, { label = null } = {}) {
  const r = await fetchJson(`/api/browser/profiles/${encodeURIComponent(String(profileId || ''))}/browse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!r || r.error) {
    const code = r && r.code;
    const words = code && !LAUNCH_CODES.includes(code) ? humanRefusalText(code, { label: label || profileId, pid: r && r.holderPid, machine: r && r.machine, n: r && r.n }, t) : '';
    showToast(words || (r && r.error) || t('server unreachable'), { type: 'error', duration: 8000 });
    return null;
  }
  return openBrowserHuman(app, { profileId: r.profileId || profileId, key: r.key, fresh: r.how === 'focus' ? null : r.fresh, syncId: r.syncId, label: r.label || label });
}

/** THE WINDOW MENU'S "Agent browser — live view" (lane I, 2026-09-25 — the owner looked for it on the chat window's own
 *  menu; only the sidebar card had it): the session's live view BOUND beside `hostWin` (its chat / terminal window) in
 *  one tab group. OPEN-OR-FOCUS — a live view of this session that already exists is bound beside the host (announced ⇒
 *  the 5 s Undo toast) or, already its split partner, brought forward; never a second window (a second VIEWER). On a
 *  phone (one pane shown) it opens / focuses without binding, as the auto-bind does. */
export function openBrowserLiveBeside(app, hostWin, sessionId) {
  if (!sessionId) { showToast(t('No session to view'), { type: 'error' }); return null; }
  const existing = [...app.wm.windows.values()].find((w) => w.type === 'browser-live' && w._browserLive && w._browserLive.state().sessionId === sessionId) || null;
  const host = hostWin && app.wm.windows.get(hostWin.id) === hostWin ? hostWin : null;
  if (!host || app.isMobile) {
    if (existing) { app.goToWinId?.(existing.id); return existing; }
    return openBrowserLive(app, { sessionId });
  }
  if (existing) {
    const ch = existing._tabChain;
    const paired = !!(ch && ch.layout === 'split' && ch.split && ch.split.pair.includes(existing.id) && ch.split.pair.includes(host.id));
    if (paired) app.goToWinId?.(existing.id);
    else app.wm.bindSplit(host, existing, { side: 'right', announce: true });
    return existing;
  }
  return openBrowserLive(app, { sessionId, intoChain: { hostId: host.id, split: true, side: 'right' } });
}

function createLiveView(app, winInfo, { sessionId, profileId, human = null }) {
  // BROWSE YOURSELF (B-6ae8): `human` = {key, fresh, label} — the user's OWN browsing window (his tab of the profile's
  // browser): no session, no strip, no bind, no owner dots, no web-view hand-off; the address row; Close / Quit the whole
  // browser; his controls are his windows' (Continue browsing / Continue here), never an agent's takeover
  const H = human && typeof human === 'object' ? { key: String(human.key || ''), fresh: human.fresh || null, label: human.label || null, ended: null } : null;
  const st = {
    sessionId, profileRef: profileId || '', ws: null, closed: false, connected: false,
    frames: 0, meta: null, page: null, viewers: 0, mode: 'watch', holder: null, target: null,
    url: '', tabs: [], console: [], lastStatus: null, error: null, attachments: [], defaultId: null,
    // MULTIVIEW (design-browser-multiview §2 / D3 / D4): the session's status answer, the strip's rows in THIS
    // window's first-seen order, which tabs are folded, and whether the session itself ended
    status: null, rows: [], order: [], folded: [], sessionEnded: false,
    running: false, lastCommand: null, reconnects: 0, reconnectTimer: null, lastHintAt: 0, sidePane: null, stopped: false, claimOpen: new Set(),
    // P3 (§4.3): the input side — our viewer id, whether WE hold it, the agent cursor, the pending confirmations
    you: null, mine: false, modeSince: 0, modeCause: null, cursor: null, confirmations: new Map(), confirmSlots: [], confirmTimer: null, wakes: null, lastMoveAt: 0, buttonsDown: 0, // r6: confirmSlots = the card's keyed slots, wakes = what a Hand back wakes
    // lane browser-stuck: the page dialog on show (the bridge's record), the prompt text typed so far, an answer in flight, a Restart in flight
    dialog: null, dialogText: null, dialogAnswering: false, restarting: false,
    // lane J r2: input feedback + the keyboard — acts sent this takeover, the last ripples, the user's mapped pointer, the echo timer
    sent: 0, ripples: [], youPt: null, echoTimer: null, reclaims: 0, composing: false, claimed: false, caretMoves: 0, strayKeys: 0, cues: 0, dialogCues: 0, dialogTakes: 0, dialogReturns: 0, frameReclaims: 0, lastFrameCueAt: 0, homeless: 0,
    // lane S4: the bridge's last `fit` record, the report last sent, the picture clocks, the pinch transform + its touches
    fit: null, fitSent: null, fitTimer: null, lastFrameAt: 0, navAt: 0, openAt: 0, pictureTimer: null, refreshSent: false, picture: 'ok', pictureStale: false,
    zoom: { ...ZOOM_NONE }, touches: new Map(), pinch: null, pan: null, lastTap: null, lastPinchHintAt: 0,
    // lane S2 (naive study 2): THE session's browser fact this view last saw (it FOLLOWS it), the input receipts
    fact: null, followed: 0, receipts: receiptBook(), receiptTimer: null,
    // lane live-input: the browser's OS (hello), the keys whose keydown went to the page (a keyup is forwarded only for
    // those — an IME commit's Enter / Space keyup never reaches the page alone), the last copy gesture, the copied text
    remotePlatform: null, pressed: new Map(), copyAt: 0, copyTimer: null, copied: null, copying: false, place: placeTags(), click: null, heldButton: 0, // copyAt: the user's own copy chord — the ONE moment a delivered copy may be written by itself (verify: a click is no copy gesture)
    // lane browser-resume B: the Resume offered in place of Reconnect, one in flight, this view resumed it (the hand-back is
    // offered), the note dialog open (the keys stay out of the page), the last hand-back from here
    resumeOffer: false, resuming: false, resumedHere: false, noteOpen: false, handedBack: false,
    // lane browser-resume C: the bridge's `tab-owners` (targetId → agent|you|other|orphan), the tab row's model + fold, the acts in flight
    tabOwners: {}, tabMediated: false, tabAdoptable: false, tabRow: null, tabFolded: [], tabRid: 0, tabActs: new Map(), tabError: null, quitAsked: null,
    // lane browser-windows: the tab THIS viewer watches instead of the agent's ({targetId, mode, pending}) and the bridge's
    // "the tab on show paints nothing" verdict ({targetId, since}) — both said on the watch line
    watch: null, bg: null,
  };
  const row = () => sessionRow(app, sessionId);
  /** lane S2: THE browser fact of this view's session (active-sessions' `browserFact`, carried onto the merged row). */
  const factNow = () => { const r = row(); return r && r.browserFact && typeof r.browserFact === 'object' ? r.browserFact : null; };
  const wordsNow = () => { const f = st.fact || factNow(); return f ? browserFactWords(f, t) : null; };
  st.fact = factNow();

  // ── DOM ──
  const root = document.createElement('div'); root.className = 'browser-live';
  const strip = document.createElement('div'); strip.className = 'browser-live-strip'; strip.style.display = 'none';
  // MULTIVIEW §2 A1: the tabs (one per browser of this session), the ▾+N fold, the own/cap chip (D4)
  const stripTabs = document.createElement('div'); stripTabs.className = 'browser-live-strip-tabs';
  const stripMoreBtn = document.createElement('button'); stripMoreBtn.className = 'browser-live-strip-more'; stripMoreBtn.style.display = 'none';
  const capBtn = document.createElement('button'); capBtn.className = 'browser-live-strip-cap';
  strip.append(stripTabs, stripMoreBtn, capBtn);
  // lane browser-resume C (§3.9, the owner's ruling 3): THE TAB ROW — one keyed chip per tab of the SHOWN browser (whose it
  // is, and only the controls the PURE verdict allows: the agent's tabs while you drive it, your own always, never another
  // conversation's), a ▾+N fold, and the row's end "Close all…" = the browser's Stop / Quit, confirmed by name
  const tabRow = document.createElement('div'); tabRow.className = 'browser-live-tabrow'; tabRow.style.display = 'none';
  const tabRowList = document.createElement('div'); tabRowList.className = 'browser-live-tabrow-list';
  const tabRowMore = document.createElement('button'); tabRowMore.className = 'browser-live-tabrow-more'; tabRowMore.style.display = 'none';
  const tabRowQuit = document.createElement('button'); tabRowQuit.className = 'file-tool-btn browser-live-tabrow-quit'; tabRowQuit.style.display = 'none';
  tabRowQuit.textContent = t('Close all…'); tabRowQuit.title = t('Close all tabs (quit this browser)…'); tabRowQuit.setAttribute('aria-label', tabRowQuit.title);
  tabRow.append(tabRowList, tabRowMore, tabRowQuit);
  const bar = document.createElement('div'); bar.className = 'browser-live-bar';
  const modeBadge = document.createElement('span'); modeBadge.className = 'browser-live-mode';
  // lane I: ONE mode toggle — Take over while the agent drives, Hand back while a human does (the retired Watch button
  // was a second Hand back: its click sent `handback` too, and a no-op in Watch)
  const takeBtn = document.createElement('button'); takeBtn.className = 'file-tool-btn browser-live-mode-btn'; takeBtn.textContent = t('Take over'); takeBtn.title = t('Take over the controls — the agent pauses until you hand back');
  const handBtn = document.createElement('button'); handBtn.className = 'file-tool-btn browser-live-handback'; handBtn.textContent = t('Hand back'); handBtn.title = t('Hand the controls back to the agent — it is told the current URL'); handBtn.style.display = 'none';
  // lane browser-resume B (§3.9, the owner's ruling 2): the BETWEEN-TURNS hand-back — your note + the tabs ride the agent's
  // NEXT turn (nothing is sent now); shown while you drive this browser or after you resumed it
  const contBtn = document.createElement('button'); contBtn.className = 'file-tool-btn browser-live-continue'; contBtn.textContent = t('Hand back and continue…'); contBtn.title = t('Hand the browser back for the agent’s next turn, with a note — nothing is sent now'); contBtn.style.display = 'none';
  const urlEl = document.createElement('span'); urlEl.className = 'browser-live-url'; urlEl.textContent = '';
  // the web view's globe (UI_ICONS.globe — the web view's glyph). 2.369.134 spelled the UI set's `web` here, a key only
  // FILE_ICONS has: innerHTML = undefined printed the word "undefined" in every live view (test-architecture §58 census)
  const openBtn = document.createElement('button'); openBtn.className = 'file-tool-btn browser-live-open bar-icon-btn'; openBtn.innerHTML = UI_ICONS.globe; openBtn.setAttribute('aria-label', t('Open this URL in a web view'));
  openBtn.title = t('Open this URL in a web view');
  const viewersEl = document.createElement('span'); viewersEl.className = 'browser-live-viewers';
  // P5 (D7): the RECORDING indicator reads the profile digest (`recording[profileId]` rides `browser-profiles-updated`); click = the Browser profiles panel where the per-profile opt-in lives
  const recEl = document.createElement('button'); recEl.className = 'file-tool-btn browser-live-rec'; recEl.textContent = t('Video off');
  const tabsBtn = document.createElement('button'); tabsBtn.className = 'file-tool-btn browser-live-side-btn'; tabsBtn.dataset.pane = 'tabs';
  const consBtn = document.createElement('button'); consBtn.className = 'file-tool-btn browser-live-side-btn'; consBtn.dataset.pane = 'console';
  // P5 (§4.5 / D35): the ACTIONS pane — the timeline of the pane you are looking at
  const traceBtn = document.createElement('button'); traceBtn.className = 'file-tool-btn browser-live-side-btn'; traceBtn.dataset.pane = 'trace';
  const timeline = createTraceTimeline(app, { sessionId, browserKey: H ? H.key : null }); // BROWSE YOURSELF: his window's Actions pane = HIS recorded acts (by his key)
  const reBtn = document.createElement('button'); reBtn.className = 'file-tool-btn browser-live-reconnect'; reBtn.textContent = t('Reconnect'); reBtn.style.display = 'none';
  // P4 (§7.4) → the rebuilt switch dialog (2026-09-27): the profile's BROWSER NAME (`Chromium` / `CloakBrowser`, the digest's
  // fact in words — never a version or a plan). A BUTTON opening the switch dialog only when another browser is available
  // for this profile (`app.browserChoicesFor`), else the same words as a plain label; neither for the temporary browser.
  const backendBtn = document.createElement('button'); backendBtn.className = 'file-tool-btn browser-live-backend'; backendBtn.style.display = 'none'; backendBtn.title = t('Your agent’s browser; click to switch it'); backendBtn.dataset.baseTitle = backendBtn.title;
  const backendLabelEl = document.createElement('span'); backendLabelEl.className = 'browser-live-backend-label browser-chip'; backendLabelEl.style.display = 'none';
  // P7 (§4.6): BIND — snap this pane beside its session's window in ONE tab group, or unbind. ICON-ONLY (lane I): its
  // words carry the session's NAME (unbounded) — they are its accessible name + tooltip and the ⋯ row's label
  const bindBtn = document.createElement('button'); bindBtn.className = 'file-tool-btn browser-live-bind bar-icon-btn'; bindBtn.innerHTML = BIND_SVG;
  bindBtn.setAttribute('aria-label', t('Snap beside {name}', { name: t('its session') }));
  // lane I: the OVERFLOW menu — what the bar has no room for (src/lib/live-bar-layout.js), with the live counts
  const moreBtn = document.createElement('button'); moreBtn.className = 'file-tool-btn browser-live-more bar-icon-btn bar-folded'; moreBtn.innerHTML = UI_ICONS.more;
  moreBtn.title = t('More'); moreBtn.setAttribute('aria-label', t('More'));
  // lane J r2: "typing goes to the browser" while this view owns the keyboard, and the "input sent · n" echo
  const kbdChip = document.createElement('span'); kbdChip.className = 'browser-live-kbd-chip'; kbdChip.style.display = 'none';
  kbdChip.innerHTML = KBD_SVG; const kbdText = document.createElement('span'); kbdText.textContent = t('Typing goes to the browser'); kbdChip.appendChild(kbdText);
  kbdChip.title = t('While you drive, every key goes to the page. Press a chat box or a terminal to type there instead — the browser stays yours; click the picture to come back (Ctrl+Backslash and Ctrl+Alt+Left/Right stay the app’s).');
  const echoEl = document.createElement('span'); echoEl.className = 'browser-live-echo'; echoEl.style.display = 'none'; echoEl.setAttribute('aria-live', 'polite');
  // lane S4: the FIT chip — the page's size when it is NOT this pane's (words by kind; click = "Fit to this window" when the agent chose it)
  const fitChip = document.createElement('button'); fitChip.className = 'file-tool-btn browser-live-fit'; fitChip.style.display = 'none';
  // lane live-input: COPY OUT — shown only when text copied IN the page could not reach your clipboard by itself (plain
  // http past the key's moment, a refused API): one click copies it (the click is the gesture the browser wants)
  const copyChip = document.createElement('button'); copyChip.className = 'file-tool-btn browser-live-copy'; copyChip.style.display = 'none';
  copyChip.textContent = t('Copied in the page — click to copy');
  copyChip.title = t('Text was copied in the agent’s browser. It goes on your clipboard only by your own copy key, or by this click — click to copy it.');
  // BROWSE YOURSELF (B-6ae8): the two ends of his own browsing (the owner, 5) and the touch Keyboard button (a phone raises
  // its soft keyboard only for a focus INSIDE a tap — the sink is focused in this button's own handler)
  const closeBtn = document.createElement('button'); closeBtn.className = 'file-tool-btn browser-live-close'; closeBtn.style.display = 'none';
  const quitBtn = document.createElement('button'); quitBtn.className = 'file-tool-btn browser-live-quit'; quitBtn.style.display = 'none';
  const kbdBtn = document.createElement('button'); kbdBtn.className = 'file-tool-btn browser-live-kbd-btn'; kbdBtn.style.display = 'none'; kbdBtn.innerHTML = KBD_SVG; { const s0 = document.createElement('span'); s0.textContent = t('Keyboard'); kbdBtn.appendChild(s0); } kbdBtn.title = t('Show the keyboard to type into the page');
  bar.append(modeBadge, takeBtn, handBtn, contBtn, closeBtn, quitBtn, kbdChip, kbdBtn, echoEl, bindBtn, urlEl, openBtn, viewersEl, recEl, fitChip, copyChip, backendBtn, backendLabelEl, tabsBtn, consBtn, traceBtn, reBtn, moreBtn);
  // BROWSE YOURSELF: THE ADDRESS ROW (his windows only) — Back · Forward · Reload · the address (web addresses only); the
  // daemon's own verbs under HIS session (the screencast has no omnibox: without this a fresh profile is a blank page)
  const addrRow = document.createElement('div'); addrRow.className = 'browser-live-address'; addrRow.style.display = 'none';
  const navBtn = (cls, icon, label) => { const b = document.createElement('button'); b.className = 'file-tool-btn bar-icon-btn ' + cls; b.innerHTML = icon; b.title = label; b.setAttribute('aria-label', label); return b; };
  const backNav = navBtn('browser-live-back', UI_ICONS.chevronLeft, t('Back')), fwdNav = navBtn('browser-live-forward', UI_ICONS.chevronRight, t('Forward')), reloadNav = navBtn('browser-live-reload', UI_ICONS.refresh, t('Reload'));
  const addrInput = document.createElement('input'); addrInput.className = 'browser-live-address-input'; addrInput.type = 'text'; addrInput.placeholder = t('Type an address'); addrInput.setAttribute('aria-label', t('Type an address')); addrInput.spellcheck = false; addrInput.setAttribute('autocomplete', 'off'); addrInput.setAttribute('autocapitalize', 'off'); addrInput.setAttribute('inputmode', 'url'); addrInput.setAttribute('enterkeyhint', 'go');
  addrRow.append(backNav, fwdNav, reloadNav, addrInput);
  const endLine = document.createElement('div'); endLine.className = 'browser-live-end-line chat-status-dim'; endLine.style.display = 'none';
  // BROWSE YOURSELF (the owner, 2026-09-28 — option A "有提醒就行"): on a profile whose tabs its agents SHARE, ONE line at the
  // top of his window says they can also see and drive this tab (PURE humanShareLine) — a keyed chip built once and patched
  // in place (renderShare), never a toast; nothing on a "separate tabs" profile
  const shareLine = document.createElement('div'); shareLine.className = 'browser-live-share-line'; shareLine.dataset.key = 'share'; shareLine.style.display = 'none';
  const shareText = document.createElement('span'); shareText.className = 'browser-live-share-text';
  { const ic = document.createElement('span'); ic.className = 'browser-live-share-icon'; ic.innerHTML = UI_ICONS.info; shareLine.append(ic, shareText); }
  // …and the same act on the TITLE BAR of the standalone window (the design's affordance; hidden with the title bar once grouped)
  const titleBind = document.createElement('button'); titleBind.className = 'win-btn win-bind'; titleBind.innerHTML = BIND_SVG;
  { const controls = winInfo.titleBar?.querySelector('.window-controls'); if (controls) controls.insertBefore(titleBind, controls.firstChild); }
  // P3: the --confirm-actions cards (one row per pending confirmation)
  const confirms = document.createElement('div'); confirms.className = 'browser-live-confirms'; confirms.style.display = 'none';
  // P4 (§7.4): the agent's `blocked` CLAIMS about this profile — it says WHO claimed it (your agent); "Switch to <name>…" is
  // offered ONLY when another browser is available for the profile (the switch is the USER's act, in the dialog), Dismiss always
  const blockedBar = document.createElement('div'); blockedBar.className = 'browser-live-blocked'; blockedBar.style.display = 'none';
  // lane headless-fallback: ONE sentence when this browser runs headless because the machine has no desktop session (or the window is back)
  const displayNote = document.createElement('div'); displayNote.className = 'browser-live-display-note'; displayNote.style.display = 'none';
  const body = document.createElement('div'); body.className = 'browser-live-body';
  const canvas = document.createElement('div'); canvas.className = 'browser-live-canvas';
  // COORDINATE SPACES MUST COINCIDE (inc-mtdrm922): counter-zoom so the picture
  // lives at NET zoom 1 — the JPEG maps ~1:1 to device pixels and no reader
  // of this element mixes viewport px with layout px. var()-reactive.
  canvas.style.zoom = COUNTER_ZOOM;
  const img = document.createElement('img'); img.className = 'browser-live-img'; img.alt = ''; img.draggable = false;
  img.style.transformOrigin = '0 0'; // lane S4: the pinch transform's origin (src/browser-fit.js zoomedRect spells the same)
  const statusEl = document.createElement('div'); statusEl.className = 'browser-live-status'; statusEl.textContent = t('Connecting…');
  // P3: the labelled AGENT cursor — a child of the same net-zoom-1 canvas as the picture, so its layout px are the picture's
  const cursorEl = document.createElement('div'); cursorEl.className = 'browser-live-agent-cursor'; cursorEl.style.display = 'none';
  cursorEl.innerHTML = '<svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true"><path d="M1 1l4.5 14 2.2-5.4 5.8-1.2z" fill="var(--accent)" stroke="var(--bg)" stroke-width="1.2" stroke-linejoin="round"/></svg><span class="browser-live-agent-cursor-label"></span>';
  const cursorLabel = cursorEl.querySelector('.browser-live-agent-cursor-label');
  // lane J r2: the user's own pointer as the PAGE has it (the screencast draws no cursor), shown only while driving
  const youEl = document.createElement('div'); youEl.className = 'browser-live-you-cursor'; youEl.style.display = 'none';
  // lane J r2: THE KEYBOARD SINK — the element that holds focus while this view owns the keyboard. Keys never
  // reach it as text (the document-level capture listener sends them to the page first); an IME composes in it
  // and hands its text over at compositionend; a paste lands on it and is forwarded as text. Emptied after every use.
  const kbd = document.createElement('textarea'); kbd.className = 'browser-live-kbd'; kbd.tabIndex = -1;
  kbd.setAttribute('aria-label', t('Keyboard input for the agent’s browser')); kbd.setAttribute('autocomplete', 'off'); kbd.setAttribute('autocorrect', 'off'); kbd.setAttribute('autocapitalize', 'off'); kbd.spellcheck = false;
  canvas.append(img, cursorEl, youEl, kbd, statusEl);
  // lane takeover-keyboard (userW inc-mum339id-1zsb): THE YIELD — the user's OWN press on a text box outside this view
  // gives it the keys while the takeover continues; a press inside the view takes them back (src/lib/keyboard-yield.js
  // decides and remembers; the document capture listeners below act)
  const ky = createKeyboardYield({ root, sink: kbd, drives: () => drivesKeyboard(), mine: () => !!st.claimed && !st.closed, ownChrome: namesThisView, picture: canvas }); // verify r2 (H1): `mine` — a press while the takeover is ours but the view does not drive is judged too; lane dialog-keys: `picture` — a press there went to the page and opens no dialog of the app's
  /** verify r1 (K3): what NAMES this view outside its root — its tab in a tab strip, its taskbar button, and its own title
   *  bar while the window stands alone (in a group the title bar is the group's: the chat's tab lives there too). Measured
   *  on cf24cf01: yielded to the composer, a press on the view's own tab (split) or title bar (standalone) left the caret
   *  in the composer, and "pw" typed for the page landed in the CHAT box. */
  function namesThisView(el) {
    try {
      const named = el && typeof el.closest === 'function' ? el.closest('.tab-item[data-win-id], .taskbar-item[data-win-id]') : null;
      if (named) return named.dataset.winId === winInfo.id;
      const ch = winInfo._tabChain;
      const alone = !ch || !Array.isArray(ch.tabs) || ch.tabs.length < 2;
      return alone && !!winInfo.titleBar && winInfo.titleBar.contains(el);
    } catch { return false; }
  }
  root.tabIndex = 0;
  const side = document.createElement('div'); side.className = 'browser-live-side'; side.style.display = 'none';
  const tabsPane = document.createElement('div'); tabsPane.className = 'browser-live-tabs';
  const consPane = document.createElement('div'); consPane.className = 'browser-live-console';
  const tracePane = timeline.el; tracePane.classList.add('browser-live-tracepane');
  side.append(tabsPane, consPane, tracePane);
  body.append(canvas, side);
  // lane browser-stuck (2026-09-28): A PAGE DIALOG holds the page (the stream server says nothing of one — the bridge's
  // `dialog` record, from the dialog watch): the card says what the page asks, Accept / Dismiss answer it as the USER
  // (the agent's next verb is told); an UNRESPONSIVE page (the browser fact's `stuck`) offers the human Restart
  const dialogBar = document.createElement('div'); dialogBar.className = 'browser-live-dialog'; dialogBar.style.display = 'none'; dialogBar.setAttribute('role', 'alertdialog');
  // lane site-reset (2026-09-30): A NAVIGATION LOOP (the browser fact's `stuck.state === 'loop'`) — the cycle's addresses,
  // KEYED children patched in place (a banner rebuilt at every fact push would blink under the pointer)
  const loopBanner = createLoopBanner(document);
  const loopBar = loopBanner.el;
  // lane site-reset step 3: ONE line when the user's Approve cleared a site's stored login in THIS profile (every holder's
  // view — the user's own browsing tab included — says it once; a click hides it)
  const resetNote = document.createElement('div'); resetNote.className = 'browser-live-display-note browser-live-reset-note'; resetNote.style.display = 'none'; resetNote.setAttribute('role', 'status');
  resetNote.title = t('Click to hide'); resetNote.onclick = () => { resetNote.style.display = 'none'; };
  // lane browser-windows (U3/U0b): ONE line under the tab row — the tab this view watches, or the tab on show that paints nothing
  const watchLine = document.createElement('div'); watchLine.className = 'browser-live-watch-line'; watchLine.style.display = 'none';
  const watchLineText = document.createElement('span'); watchLineText.className = 'browser-live-watch-text';
  const watchLineBtn = document.createElement('button'); watchLineBtn.className = 'file-tool-btn browser-live-watch-btn';
  watchLine.append(watchLineText, watchLineBtn);
  root.append(strip, tabRow, watchLine, bar, addrRow, shareLine, endLine, blockedBar, displayNote, resetNote, confirms, dialogBar, loopBar, body);
  if (H) { root.classList.add('human'); addrRow.style.display = ''; urlEl.style.display = 'none'; openBtn.style.display = 'none'; bindBtn.style.display = 'none'; titleBind.style.display = 'none'; closeBtn.style.display = ''; quitBtn.style.display = ''; }
  winInfo.content.appendChild(root);

  // ── BROWSE YOURSELF (B-6ae8): his own window's words, its two ends, the address row ──
  function touchDevice() { try { return !!(window.matchMedia && window.matchMedia('(hover: none)').matches) || navigator.maxTouchPoints > 0; } catch { return false; } }
  function humanLabel() { try { const p = ((app._browserProfiles && app._browserProfiles.profiles) || []).find((x) => x && x.id === profileId); return p ? String(p.label || '') : ''; } catch { return ''; } }
  /** The conversations on his browser right now (the digest's holder rows) — their names from this client's own rows. */
  function othersOnIt() { const leases = (app._browserProfiles && app._browserProfiles.leases) || []; return leases.filter((l) => l && l.profileId === profileId && !l.human && l.sessionId).map((l) => nameOfSession(l.sessionId) || t('a conversation')); }
  function nameOfSession(id) { try { const s0 = (app.sidebar?._allSessions || []).find((x) => x.webuiId === id); return s0 ? ((app.sidebar.getCustomName && app.sidebar.getCustomName(s0)) || s0.webuiName || s0.name || '') : ''; } catch { return ''; } } // the name the sidebar shows (a rename first)
  function humanBadge() {
    if (H.ended || st.stopped) return t('You are not browsing it now');
    if (st.mode === 'takeover' && !st.mine) return t("You're browsing this in another window");
    if (st.mode === 'takeover' && st.mine) return t('You are browsing');
    return t('You were browsing it — Continue');
  }
  function renderEnds() {
    if (!H) return;
    const names = othersOnIt();
    const idleMs = Number(app.settings?.get?.('browser.idleTimeoutMs')) || 15 * 60 * 1000;
    const e = humanEndChoices({ conversations: names.length, names, idleMs }, t);
    if (closeBtn.textContent !== e.close.label) closeBtn.textContent = e.close.label;
    closeBtn.title = e.close.title;
    if (quitBtn.textContent !== e.quit.label) quitBtn.textContent = e.quit.label;
    quitBtn.title = e.quit.title;
    const line = H.ended || st.stopped ? '' : e.line;
    endLine.textContent = line; endLine.style.display = line ? '' : 'none';
    renderShare();
  }
  /** The profile's row in this client's digest (its `mediated` fact), or null before the digest arrived. */
  function profileRowOf() { try { return ((app._browserProfiles && app._browserProfiles.profiles) || []).find((x) => x && x.id === profileId) || null; } catch { return null; } }
  /** The shared-tabs line: the chip's own nodes, patched only when the words or the visibility change. */
  function renderShare() {
    if (!H) return;
    const words = H.ended || st.stopped ? null : humanShareLine(profileRowOf(), t);
    if (shareText.textContent !== (words || '')) shareText.textContent = words || '';
    const want = words ? '' : 'none';
    if (shareLine.style.display !== want) shareLine.style.display = want;
  }
  const setStatus = (text, { error = false, reconnect = false, hide = false } = {}) => {
    statusEl.textContent = text || '';
    statusEl.style.display = hide ? 'none' : '';
    statusEl.classList.toggle('error', !!error);
    reBtn.style.display = reconnect ? '' : 'none';
    renderResume(); renderCont(); // lane browser-resume B: every status move re-asks the Resume / the hand-back
  };
  // ── lane browser-resume B (§3.9, the owner's ruling 2): RESUME in place of Reconnect, and "Hand back and continue…" ──
  /** Is the shown browser idle here (stopped with its last frame / hollow / not started)? */
  const idleShown = () => !st.connected && (st.stopped === true || st.hollow || !!(st.error && (st.error.browserState === 'not-started' || st.error.code === 'browser_stopped' || st.error.code === 'browser_released')));
  /** THE Resume offer: the conversation's OWN browser when THE fact says something is kept and it does not run (PURE
   *  ownResumable — never drawn otherwise: no greyed control), or an attachment's stopped browser (the server judges
   *  "Who can use it" — a refusal is said by name). Never on a helper's view, never in the user's own browsing window. */
  function resumeOfferNow() {
    if (H || !sessionId || st.closed || !idleShown()) return false;
    const ref = curRef();
    const f = st.fact || factNow();
    // a view that never got a hello (the record was retired — a detach, a reconcile: "not started yet") shows the
    // conversation's default: its OWN browser when THE fact says that is what the conversation uses
    if (ref === EPHEMERAL_REF || (!ref && !st.target && f && f.using && f.using.kind === 'own')) return ownResumable(f);
    return !!(st.target && st.target.kind === 'attachment' && st.stopped === true);
  }
  function renderResume() {
    const offer = resumeOfferNow();
    st.resumeOffer = offer;
    if (offer) {
      if (reBtn.dataset.mode !== 'resume') { reBtn.dataset.mode = 'resume'; reBtn.innerHTML = UI_ICONS.play; const sp = document.createElement('span'); sp.textContent = t('Resume'); reBtn.appendChild(sp); }
      reBtn.title = t('Reopen this browser with its last tabs'); reBtn.setAttribute('aria-label', reBtn.title);
      reBtn.style.display = st.resuming ? 'none' : '';
      const words = st.resuming ? t('Resuming the browser…') : (!(st.target && st.target.kind === 'attachment') ? keptLineWords(st.fact || factNow(), t) : t('Stopped — Resume starts it again and reopens its tab'));
      if (words && statusEl.textContent !== words) statusEl.textContent = words;
      statusEl.style.display = ''; statusEl.classList.remove('error');
    } else if (reBtn.dataset.mode === 'resume') { reBtn.dataset.mode = ''; reBtn.textContent = H && H.ended ? t('Browse again') : t('Reconnect'); reBtn.removeAttribute('aria-label'); reBtn.title = ''; }
  }
  /** The words of a Resume refusal (its code, in the device's words; the server's own sentence for the rest). */
  function resumeWhy(r) {
    const c = r && r.code;
    if (c === 'not_kept') return t('nothing is kept for this browser');
    if (c === 'child_not_kept') return t('a helper’s browser is not kept');
    if (c === 'resume_adopted') return t('it became the profile “{label}” — attach that profile instead', { label: String((r && r.label) || '') });
    if (c === 'no_live_session') return t('the conversation is not running — resume it first');
    return String((r && r.error) || t('server unreachable'));
  }
  async function doResume() {
    if (st.resuming || st.closed) return;
    st.resuming = true; renderResume();
    const r = await fetchJson(`/api/browser/session/${encodeURIComponent(sessionId)}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: curRef() || EPHEMERAL_REF }) });
    st.resuming = false;
    if (st.closed) return;
    if (!r || r.error) { renderResume(); showToast(t('Could not resume the browser: {why}', { why: resumeWhy(r) }), { type: 'error', duration: 7000 }); return; }
    st.resumedHere = !r.already; st.handedBack = false;
    const n = Number(r.restored) || 0;
    showToast(r.already ? t('The browser is running — reconnecting') : n ? t('Resumed — {n} tab(s) reopened', { n }) : t('Resumed — the browser runs again'), { duration: 4000 });
    if (Array.isArray(r.skipped) && r.skipped.length) showToast(t('{n} tab(s) not reopened: {why}', { n: r.skipped.length, why: r.skipped.map((x) => String(x.why || '')).filter(Boolean).slice(0, 3).join('; ') }), { type: 'warn', duration: 8000 });
    st.error = null; st.stopped = false; st.stoppedHow = null; st.hollow = false; st.reconnects = 0;
    renderMode(); connect(); refreshSet();
  }
  /** "Hand back and continue…" is offered on the conversation's own browser or an attachment it holds, over an open
   *  stream, while THIS view drives it or after the user resumed it (and not handed back since) — never greyed. */
  function renderCont() {
    if (H || !sessionId) { contBtn.style.display = 'none'; return; }
    const ref = curRef();
    const kind = st.target && st.target.kind;
    const f = st.fact || factNow();
    const kept = f && f.own && f.own.kept;
    const resumed = st.resumedHere || !!(ref === EPHEMERAL_REF && kept && kept.restoreBy === 'user' && !kept.handedBack && !st.handedBack);
    const show = (ref === EPHEMERAL_REF || kind === 'attachment') && st.connected && !st.stopped && !st.hollow && ((st.mode === 'takeover' && st.mine) || resumed);
    const want = show ? '' : 'none';
    if (contBtn.style.display !== want) contBtn.style.display = want;
  }
  const renderMode = () => {
    const taken = st.mode === 'takeover';
    // lane I: the SHORT words on the bar (a never-fold item), the full sentence in the tooltip; lane H (naive study 2
    // finding 3 + verify r5/r6): a STOPPED browser's badge names why (those words are already short) — never 'driving'
    const fullBadge = modeBadge_(st.mode, st.mine, st.stopped, st.stoppedHow);
    modeBadge.textContent = t(st.stopped ? fullBadge : shortModeBadge({ mode: st.mode, mine: st.mine }));
    modeBadge.title = t(fullBadge);
    // BROWSE YOURSELF (B-6ae8): his own window's badge — "You are browsing" / "You're browsing this in another window" / he
    // is not browsing it (his browsing ended or the browser stopped: "Browse again" is the act)
    if (H) { const hb = humanBadge(); modeBadge.textContent = hb; modeBadge.title = hb; }
    modeBadge.classList.toggle('stopped', !!st.stopped);
    root.classList.toggle('stopped', !!st.stopped); // naive study 2 (finding 3): the LAST frame stays, greyed — never a blank "new" browser
    syncPast(); // running again ⇒ the picture takes its place back
    modeBadge.classList.toggle('takeover', taken && st.mine);
    modeBadge.classList.toggle('other', taken && !st.mine);
    moreBtn.dataset.mode = !taken ? 'watch' : st.mine ? 'takeover' : 'other'; // the ⋯ wears the badge's colour while the badge is folded into it (its words change ⇒ the fold re-runs ⇒ renderMore)
    // ONE toggle: Take over while the agent drives, Hand back while anybody does (any viewer may hand back, §4.3)
    takeBtn.style.display = taken ? 'none' : '';
    handBtn.style.display = taken ? '' : 'none';
    // BROWSE YOURSELF: his window never hands back (his tab is his own) — Continue browsing (nobody holds it) / Continue
    // here (another window of his holds it: the controls move here); nothing while this window drives or his browsing ended
    if (H) {
      handBtn.style.display = 'none';
      const ended = !!(H.ended || st.stopped);
      takeBtn.style.display = ended || (taken && st.mine) ? 'none' : '';
      takeBtn.textContent = taken && !st.mine ? t('Continue here') : t('Continue browsing');
      takeBtn.title = taken && !st.mine ? t("You're browsing this in another window") : t('Continue browsing');
      closeBtn.style.display = ended ? 'none' : ''; quitBtn.style.display = ended ? 'none' : '';
      renderEnds();
    }
    // r6 A-F9 (money): the control says how many conversations ONE press wakes (the keeper's count, the announcer's own
    // rule — this chat plus each chat sharing this browser that had something interrupted); the press carries the count
    const wakes = Number.isInteger(st.wakes) && st.wakes > 0 ? st.wakes : 1;
    handBtn.textContent = wakes > 1 ? t('Hand back (wakes {n})', { n: wakes }) : t('Hand back');
    const handWords = t('Hand the controls back to the agent — it is told the current URL') + ' · ' + (wakes > 1 ? t('This wakes {n} conversations = {n} billed turns: this one and each one sharing this browser that had something interrupted', { n: wakes }) : t('This wakes 1 conversation = 1 billed turn'));
    handBtn.title = taken && !st.mine ? t('Another viewer holds the controls') + ' — ' + handWords : handWords;
    handBtn.setAttribute('aria-label', handBtn.title);
    root.classList.toggle('driving', taken && st.mine);
    // lane J r2: entering a takeover of OUR OWN claims the keyboard (a re-claim moves this view to the end — the last
    // takeover on this client wins); leaving it releases, and the sink lets go of focus so nothing is typed into it
    // BROWSE YOURSELF: his first claim on a blank page puts the caret in the ADDRESS field (nothing to click yet); the address
    // being typed in is never robbed of focus by a later mode record. lane takeover-keyboard: a fresh claim clears a yield;
    // while the user's keys are YIELDED to a text box he pressed, a re-render never pulls the focus back (the .197 integration: both)
    if (taken && st.mine && !st.noteOpen) { // lane browser-resume B: the hand-back's note dialog holds the keys out of the page
      const first = !st.claimed;
      if (first) { st.claimed = true; st.sent = 0; st.pressed.clear(); ky.reset('claim'); claimKeyboard(claimRec()); watchDialogs(); }
      if (H && first && (!st.url || st.url === 'about:blank')) { try { addrInput.focus({ preventScroll: true }); } catch { /* detached */ } }
      else if (!ky.yielded && !ky.dialogHolds && !(H && document.activeElement === addrInput)) focusSink(); // lane dialog-keys: …nor while a dialog the user opened holds the keys
    }
    else if (st.claimed) { st.claimed = false; st.pressed.clear(); ky.reset('release'); releaseKeyboard(winInfo.id); watchDialogs(); if (document.activeElement === kbd) kbd.blur(); kbd.value = ''; st.youPt = null; hideCopied(); }
    renderKbd();
    renderCursor();
    keyboardChanged(); // the composers' "you are typing to the agent" line re-reads (a handback while yielded ends it)
    renderResume(); renderCont(); // lane browser-resume B
    renderTabRow(); // lane browser-resume C: taking over / handing back changes which controls the tab row draws
  };
  /** lane J r2: the live facts the PURE ownership reads (re-read every time). */
  function kbFacts() {
    const displayed = (() => { try { if (!root.isConnected) return false; if (typeof root.checkVisibility === 'function') return root.checkVisibility({ visibilityProperty: true }); return root.getClientRects().length > 0 && getComputedStyle(root).visibility !== 'hidden'; } catch { return false; } })();
    return { mode: st.mode, mine: st.mine, connected: !!(st.ws && st.ws.readyState === 1 && st.connected), displayed, closed: st.closed };
  }
  /** lane J r2: does THIS view own the keyboard now? PURE ownership over the live facts, re-asked every time.
   *  lane takeover-keyboard: a view whose keys the user gave to a text box he pressed (`yielded`) owns none. */
  function ownsKeyboard() { return keyboardOwnership({ ...kbFacts(), yielded: ky.yielded, dialog: ky.dialogHolds }).owns; } // lane dialog-keys: …nor one whose keys a dialog the user opened holds
  /** lane takeover-keyboard: does this view DRIVE a takeover of its own (claimed, the yield not counted)? */
  function drivesKeyboard() { return !!st.claimed && keyboardOwnership(kbFacts()).owns; }
  /** …and did it give the keys to a text box the user pressed (the takeover continues)? verify r2 (H1): also while the view
   *  does not drive (minimized, another desktop, reconnecting) — the takeover is still his and the composer says so */
  function yieldedKeyboard() { return !!ky.yielded && !!st.claimed && !st.closed; }
  /** THE claim this view files (lane J r2 + the yield): re-filed on a press inside the view — the last claim wins */
  const claimRec = () => ({ id: winInfo.id, owns: ownsKeyboard, yielded: yieldedKeyboard });
  /** …and is it THE owner of this client (two views driving: the last claim wins)? */
  const iOwn = () => { const o = keyboardOwner(); return !!o && o.id === winInfo.id; };
  /** verify r2 (H1): EVERY OWNERSHIP TRANSITION of this view — shown / hidden by any hider (minimize, a desktop, a tab, the
   *  stage, a chain change), the stream up / down, a claim moving between views — judged the moment it happens (PURE
   *  keyboardTransition through ky.sync): the chip and the composers' line redrawn AT ONCE, and keys moving to the page while
   *  a text box (or a frame) outside the view holds the caret move the CARET to the sink, explicitly. Measured on cd867c05:
   *  restored with the caret in the composer, the view took the keys and said nothing until the first had gone to the page. */
  let kbSyncing = false, hidersWatched = false;
  function syncKeyboard() {
    if (st.closed || kbSyncing) return;
    kbSyncing = true;
    try {
      watchHiders(!!st.claimed);
      // verify r2 (H1b'): back to driving with a yield whose home is gone (the chat box pressed on the desktop the user left)
      // — the yield ends and the caret comes to the sink, explicitly (measured: back on the view's desktop the keys went
      // nowhere while the chip said "Keyboard is in the chat box")
      if (st.claimed && ky.settle({ drives: drivesKeyboard(), active: document.activeElement }) === 'end') { claimKeyboard(claimRec()); st.homeless++; if (!st.copying) { st.caretMoves++; focusSink(); } }
      const r = ky.sync({ owns: !!(st.claimed && iOwn()), yielded: !!(st.claimed && yieldedKeyboard()), dialog: !!(st.claimed && ky.dialogHolds), active: document.activeElement });
      if (!r.changed) return;
      if (r.moveCaret && !st.copying) { st.caretMoves++; focusSink(); }
      if (r.release) releaseHeld(); // verify r2 (H3): the keys left the page — what is still held there is let go while this view can still send it
      renderKbd(); keyboardChanged();
    } finally { kbSyncing = false; }
  }
  /** Any hider writes a style / class / `hidden` on the view or one of its ancestors (the desktop manager's visibility on a
   *  group's HOST element, minimize's display, a tab's class, the phone layout on <body>) — watched only while this view
   *  holds a takeover; a mutation off the view's ancestor line is not its transition. */
  const hiderMo = typeof MutationObserver === 'function' ? new MutationObserver((recs) => {
    for (const r of recs) { const n = r.target; if (n === root || (n && typeof n.contains === 'function' && n.contains(root))) { syncKeyboard(); return; } }
  }) : null;
  // lane dialog-keys: the dialogs' watch (declared with the hiders' — renderMode arms and disarms it; see watchDialogs below)
  const dialogMo = typeof MutationObserver === 'function' ? new MutationObserver(() => settleDialogs()) : null;
  function watchHiders(on) {
    if (!hiderMo || on === hidersWatched) return;
    hidersWatched = on;
    if (on) hiderMo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'hidden'], subtree: true });
    else hiderMo.disconnect();
  }
  { const offKb = onKeyboardChange(syncKeyboard); winInfo._listenerCtl?.signal?.addEventListener?.('abort', () => { offKb(); if (hiderMo) hiderMo.disconnect(); }); }
  function focusSink() { try { if (document.activeElement !== kbd) kbd.focus({ preventScroll: true }); } catch { /* detached */ } }
  function renderKbd() {
    const own = st.claimed && iOwn();
    // lane S2 (naive study 2 T4): the bar never claims "Typing goes to the browser" while nothing reaches it — the
    // chip shows only over an OPEN stream, and after an input that was NOT DELIVERED (a receipt said so, or none came
    // in 1.5 s) it says that instead until an input lands again
    const failing = st.receipts.failing;
    // verify r3 (r2 F3): the chip claims only what the last delivered receipt PROVED — over a direct lease (`via:'stream'`)
    // VibeSpace sees its own write to the stream, not the page's answer, so it says "sent", never "goes"
    const sentOnly = st.receipts.via === 'stream';
    // lane takeover-keyboard: YIELDED — the user pressed a text box outside the view; the chip (patched in place, never a
    // toast) says where the keys are and how to get them back, and outranks the rest of the bar in the fold
    // lane dialog-keys: a dialog the user's own act opened HOLDS the keys — the chip says where they are and that they come
    // back (keyed, written on change only), at the yield's fold rank
    const dialogHeld = !own && !!st.claimed && ky.dialogHolds && !st.closed;
    const yielded = !own && st.claimed && (yieldedKeyboard() || dialogHeld);
    kbdChip.style.display = (own || yielded) && st.connected ? '' : 'none';
    kbdChip.classList.toggle('failing', !yielded && !!failing);
    kbdChip.classList.toggle('yielded', yielded);
    const text = yielded ? yieldChipText(ky.whereNow(document.activeElement)) : failing ? t('Input is not reaching the browser') : sentOnly ? t('Typing is sent to the browser') : t('Typing goes to the browser');
    const title = dialogHeld ? t('A dialog you opened has the keyboard: Enter, Escape and typing go to it. When it closes your keys go back where they were — you still drive the browser, the agent waits.')
      : yielded ? t('You pressed a text box outside the browser, so your keys go there. You still drive the browser — the agent waits. Click the picture to type into the page again; Hand back ends the takeover.')
      : failing ? receiptWhy(failing) : (sentOnly ? t('This browser streams directly: VibeSpace sees each key written to its stream, not the page’s answer.') + ' ' : '') + t('While you drive, every key goes to the page. Press a chat box or a terminal to type there instead — the browser stays yours; click the picture to come back (Ctrl+Backslash and Ctrl+Alt+Left/Right stay the app’s).');
    // verify r4: written only on CHANGE — a yielded view re-reads on every focus move (focusout + focusin), and a same-text
    // write is still a mutation record and an accessibility event (measured on 41312584: 300 focus moves over a list while
    // yielded ⇒ 1 200 records on the chip, its words never changing)
    if (kbdText.textContent !== text) kbdText.textContent = text;
    if (kbdChip.title !== title) kbdChip.title = title;
    root.classList.toggle('kbd-owned', own);
    root.classList.toggle('kbd-yielded', yielded);
    if (!(st.mode === 'takeover' && st.mine)) { echoEl.style.display = 'none'; youEl.style.display = 'none'; }
    kbdBtn.style.display = touchDevice() && st.mode === 'takeover' && st.mine && st.connected ? '' : 'none'; // BROWSE YOURSELF / every live view: a phone's soft keyboard
  }
  /** lane J r2: the bar's "input sent · n" — bright for ECHO_MS after each act, then dim (still the count). */
  function echo(ok = true, why = '', { verbatim = false } = {}) {
    echoEl.style.display = '';
    echoEl.classList.toggle('error', !ok);
    echoEl.classList.add('fresh');
    echoEl.textContent = ok ? (verbatim && why ? why : t('input sent · {n}', { n: st.sent })) : (verbatim ? why : t('not sent — {why}', { why: why || t('no connection') }));
    if (st.echoTimer) clearTimeout(st.echoTimer);
    st.echoTimer = setTimeout(() => { st.echoTimer = null; echoEl.classList.remove('fresh'); }, ECHO_MS);
  }
  /** Every input record goes through here: `act` = one user act (a press, a key, a paste) counted in the echo.
   *  lane S2: a record that carries a user act asks for a RECEIPT (`rid`) — the bridge answers `input-receipt` from
   *  the browser's own reply (a mediated lease) or the stream's write (a direct one); none in 1.5 s = NOT DELIVERED. */
  function sendInput(rec, act = false, { receipt = act, receiptMs = null } = {}) {
    if (!rec) return false;
    const open = !!(st.ws && st.ws.readyState === 1);
    if (open) { if (receipt) { rec = { ...rec, rid: noteInputSent(st.receipts, Date.now(), { ms: receiptMs }) }; armReceiptSweep(); } send(rec); }
    if (act) { if (open) st.sent++; if (!open) echo(false, t('the live view is disconnected')); else if (!st.receipts.failing) echo(true); }
    return open;
  }
  /** lane S2: the words of a failed receipt (the bridge's code, never a raw error first). */
  function receiptWhy(f) {
    const byCode = { no_answer: t('no answer from the browser'), no_reply: t('the browser has not answered it'), not_dispatched: t('the browser was never asked to act on it'), browser_refused: t('the browser refused it'), upstream_gone: t('the browser stream closed'), 'no-upstream': t('the browser stream is not connected'), 'watch-mode': t('you are not driving this browser'), no_grant: t('this conversation no longer holds that browser'),
      other_tab: t('it reached another tab than the one you are looking at and was refused there'), tab_switched: t('the browser moved to another tab while you were driving — hand back and take over again to drive it'), // verify r3
      text_too_long: t('the browser takes at most 3 characters in one key'), too_long: t('it is more text than one paste may carry'), empty: t('there was nothing to type') }; // lane live-input
    const partial = f && Number(f.landed) > 0 ? ' ' + t('({n} characters reached the page first)', { n: f.landed }) : '';
    return (byCode[f && f.code] || t('it was refused')) + (f && f.error && !byCode[f.code] ? ' — ' + String(f.error).slice(0, 160) : '') + partial;
  }
  function onReceiptsChanged() {
    const f = st.receipts.failing;
    if (f) echo(false, t('not delivered — {why}', { why: receiptWhy(f) }), { verbatim: true });
    else if (st.receipts.last && st.receipts.last.ok && st.receipts.last.dropped) echo(true, t('sent — a line break at the very end could not be typed'), { verbatim: true }); // lane live-input: said, never a silent loss
    renderKbd();
  }
  function armReceiptSweep() {
    if (st.receiptTimer) return;
    st.receiptTimer = setInterval(() => {
      if (st.closed) { clearInterval(st.receiptTimer); st.receiptTimer = null; return; }
      if (sweepInputReceipts(st.receipts, Date.now())) onReceiptsChanged();
      if (!st.receipts.pending.size) { clearInterval(st.receiptTimer); st.receiptTimer = null; }
    }, 250);
  }
  /** Where a page point is drawn, in the canvas's own layout px (the overlay basis shared with the agent cursor). */
  function pagePointToLocal(p) {
    const g = geometry();
    if (!g || !p) return null;
    const v = deviceToViewport({ x: p.x, y: p.y, elRect: rectOf(img), frameW: g.cssW, frameH: g.cssH, picW: g.picW, picH: g.picH, align: LIVE_ALIGN });
    return v ? toLocal(v, rectOf(canvas), canvas.clientWidth, canvas.clientHeight) : null;
  }
  /** lane J r2: a ripple at the page point a click was SENT to (the round trip — it lands where the page got it). */
  function ripple(p) {
    const l = pagePointToLocal(p);
    if (!l) return;
    const r = document.createElement('div'); r.className = 'browser-live-ripple';
    r.style.left = l.left + 'px'; r.style.top = l.top + 'px';
    canvas.appendChild(r);
    st.ripples.push({ x: p.x, y: p.y, left: l.left, top: l.top, at: Date.now() });
    if (st.ripples.length > RIPPLE_KEEP) st.ripples.splice(0, st.ripples.length - RIPPLE_KEEP);
    setTimeout(() => { try { r.remove(); } catch { /* gone */ } }, RIPPLE_MS);
  }
  function renderYou() {
    const show = !!(st.youPt && st.mode === 'takeover' && st.mine);
    const l = show ? pagePointToLocal(st.youPt) : null;
    youEl.style.display = l ? '' : 'none';
    if (!l) return;
    youEl.style.left = l.left + 'px'; youEl.style.top = l.top + 'px';
    kbd.style.left = l.left + 'px'; kbd.style.top = l.top + 'px'; // an IME's candidate window opens where you are pointing
  }
  // the badge's words come from the PURE tables; t() needs the literal keys below to be extractable
  const modeBadge_ = (mode, mine, stopped, unstable) => modeBadgeText({ mode, mine, stopped, unstable });
  void [t('Agent is driving'), t('You are driving — agent asked to pause'), t('Another viewer is driving — agent asked to pause'), t('You are driving'), t('Another viewer is driving'), t('Browser stopped'), t('Browser closed'), t('Browser keeps closing'), t('Browser could not start')];
  /** lane J: THE TWO SIZES — the picture as decoded (what object-fit letterboxes)
   *  and the page's CSS viewport (the space every input record is in), from the
   *  bridge's `viewport` reading / the metadata / the picture (PURE frameGeometry).
   *  `st.frameW/H` READ the page size (accessors — never a stored copy that can go stale). */
  const geometry = () => frameGeometry({ picW: img.naturalWidth || 0, picH: img.naturalHeight || 0, page: st.page, meta: st.meta });
  Object.defineProperty(st, 'frameW', { get: () => { const g = geometry(); return g ? g.cssW : 0; }, enumerable: true });
  Object.defineProperty(st, 'frameH', { get: () => { const g = geometry(); return g ? g.cssH : 0; }, enumerable: true });
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
  /** The agent cursor at the last CDP coordinates — hidden while the user drives or before a frame. */
  const renderCursor = () => {
    const c = st.cursor;
    const g = geometry();
    const show = !!(c && c.x !== null && c.y !== null && g && !(st.mode === 'takeover' && st.mine) && !st.stopped); // lane H: a stopped browser has no agent cursor
    cursorEl.style.display = show ? '' : 'none';
    if (!show) return;
    // ONE basis with the pointer path: the drawn picture off getBoundingClientRect, then into the canvas's own layout px
    const v = deviceToViewport({ x: c.x, y: c.y, elRect: rectOf(img), frameW: g.cssW, frameH: g.cssH, picW: g.picW, picH: g.picH, align: LIVE_ALIGN });
    const p = v && toLocal(v, rectOf(canvas), canvas.clientWidth, canvas.clientHeight);
    if (!p) { cursorEl.style.display = 'none'; return; }
    cursorEl.style.left = p.left + 'px'; cursorEl.style.top = p.top + 'px';
    cursorLabel.textContent = t('agent') + (c.action ? ' · ' + c.action : '');
  };
  /** The --confirm-actions cards: one row each, with the daemon's countdown. r6 A-F8 ("what you approve is what runs"):
   *  the row names the action's TARGET (whole, wrapped — never clipped), a Confirm carries the digest of exactly what the
   *  row showed (the keeper runs nothing for another), and the rows are KEYED SLOTS (PURE confirmSlots): a row that goes
   *  keeps its slot while a live row sits below it, so the row under the pointer never moves up into another Confirm. */
  const confirmRows = new Map(); // id → { row, text, target, note, ok, no }
  const renderConfirms = () => {
    const now = Date.now();
    for (const [id, c] of [...st.confirmations]) if (c.expiresAt && c.expiresAt <= now) st.confirmations.delete(id);
    st.confirmSlots = confirmSlots(st.confirmSlots || [], [...st.confirmations.keys()]);
    const want = new Set(st.confirmSlots.map((x) => x.id));
    for (const [id, r] of [...confirmRows]) if (!want.has(id)) { r.row.remove(); confirmRows.delete(id); } // only trailing slots ever go: nothing below them moves
    let prev = null;
    for (const slot of st.confirmSlots) {
      let r = confirmRows.get(slot.id);
      if (!r) {
        const id = slot.id;
        const row = document.createElement('div'); row.className = 'browser-live-confirm';
        const body = document.createElement('div'); body.className = 'browser-live-confirm-body';
        const text = document.createElement('span'); text.className = 'browser-live-confirm-text';
        const target = document.createElement('span'); target.className = 'browser-live-confirm-target';
        const note = document.createElement('span'); note.className = 'browser-live-confirm-note';
        body.append(text, target, note);
        const ok = document.createElement('button'); ok.className = 'file-tool-btn browser-live-confirm-btn'; ok.textContent = t('Confirm'); ok.onclick = () => answerConfirm(id, 'confirm');
        const no = document.createElement('button'); no.className = 'file-tool-btn browser-live-confirm-btn deny'; no.textContent = t('Deny'); no.onclick = () => answerConfirm(id, 'deny');
        row.append(body, ok, no);
        r = { row, text, target, note, ok, no };
        confirmRows.set(id, r);
      }
      if (prev ? prev.nextSibling !== r.row : confirms.firstChild !== r.row) confirms.insertBefore(r.row, prev ? prev.nextSibling : confirms.firstChild);
      prev = r.row;
      const c = st.confirmations.get(slot.id);
      if (slot.gone || !c) {
        // the slot stays (a live row sits below it) AT ITS HEIGHT (locked before its words change — a shorter tombstone
        // would still pull the rows below it up); its buttons are gone, never a greyed Confirm; the target stays readable
        if (!r.row.classList.contains('gone')) { const h = r.row.offsetHeight; if (h > 0) r.row.style.minHeight = h + 'px'; }
        r.row.classList.add('gone'); r.ok.style.visibility = 'hidden'; r.no.style.visibility = 'hidden';
        r.text.textContent = t('No longer waiting — answered, or denied by the browser');
        continue;
      }
      const left = Math.max(0, Math.round(((c.expiresAt || now) - now) / 1000));
      r.text.textContent = t('The agent wants to run {action} — confirm?', { action: String(c.action || 'an action') }) + (c.category ? ` [${c.category}]` : '') + ' · ' + t('auto-denies in {s}s', { s: left });
      r.target.textContent = c.target ? t('On: {target}', { target: String(c.target) }) : t('On: (the browser named no target — Deny unless you know what it is)');
      r.note.textContent = c.conflict ? t('A later record tried to change this to {action} — ignored; Confirm runs what is shown here', { action: String(c.conflict.action || '?') + (c.conflict.target ? ' ' + String(c.conflict.target) : '') }) : '';
    }
    confirms.style.display = st.confirmSlots.length ? '' : 'none';
    if (st.confirmations.size && !st.confirmTimer) st.confirmTimer = setInterval(renderConfirms, 1000);
    if (!st.confirmations.size && st.confirmTimer) { clearInterval(st.confirmTimer); st.confirmTimer = null; }
  };
  /** The answer names the card it was pressed on: the digest of the fields THIS row drew (PURE confirmationDigest). */
  function answerConfirm(id, decision) {
    const c = st.confirmations.get(id);
    if (!c) return; // a row that already went has no buttons; a stale click answers nothing
    send({ type: 'confirm', id, decision, shown: confirmationDigest(c) });
  }
  // ── lane browser-stuck: the dialog card + the unresponsive banner ──
  /** lane site-reset: the loop banner — the same elements, their words rewritten only where they changed. */
  const renderLoop = (loop) => loopBanner.render(loop, t);
  const renderDialog = () => {
    const d = st.dialog;
    renderLoop(!d && st.fact && st.fact.stuck && st.fact.stuck.state === 'loop' ? st.fact.stuck.loop : null);
    const stuck = !d && st.fact && st.fact.stuck && st.fact.stuck.state === 'unresponsive' ? st.fact.stuck : null;
    dialogBar.textContent = '';
    dialogBar.style.display = d || stuck ? '' : 'none';
    dialogBar.classList.toggle('stuck', !!stuck);
    if (d) {
      const w = dialogWords(d, t);
      const title = document.createElement('div'); title.className = 'browser-live-dialog-title'; title.textContent = w.title;
      const msg = document.createElement('div'); msg.className = 'browser-live-dialog-body'; msg.textContent = w.body;
      dialogBar.append(title, msg);
      if (w.consequence) { const c = document.createElement('div'); c.className = 'browser-live-dialog-note'; c.textContent = w.consequence; dialogBar.append(c); }
      let input = null;
      if (w.prompt) {
        input = document.createElement('input'); input.type = 'text'; input.className = 'browser-live-dialog-input';
        input.value = st.dialogText != null ? st.dialogText : (w.defaultValue || ''); input.setAttribute('aria-label', w.title);
        input.oninput = () => { st.dialogText = input.value; };
        input.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); answerDialog(true, input.value); } };
        dialogBar.append(input);
      }
      const acts = document.createElement('div'); acts.className = 'browser-live-dialog-actions';
      const ok = textBtn(w.accept, () => answerDialog(true, input ? input.value : null), 'browser-live-dialog-accept' + (d.type === 'beforeunload' ? ' danger' : ''));
      acts.append(ok);
      if (w.dismiss) acts.append(textBtn(w.dismiss, () => answerDialog(false, null), 'browser-live-dialog-dismiss'));
      for (const b of acts.children) b.disabled = !!st.dialogAnswering;
      const hint = document.createElement('span'); hint.className = 'browser-live-dialog-hint'; hint.textContent = w.hint;
      acts.append(hint);
      dialogBar.append(acts);
    } else if (stuck) {
      const w = stuckWords(stuck, t);
      const line = document.createElement('span'); line.className = 'browser-live-dialog-body'; line.textContent = w.line;
      const re = textBtn(w.action, () => restartBrowser(), 'browser-live-dialog-restart'); re.title = w.tooltip || '';
      re.disabled = !!st.restarting;
      dialogBar.append(line, re);
    }
  };
  function answerDialog(accept, text) {
    if (!st.dialog || st.dialogAnswering) return;
    st.dialogAnswering = true; renderDialog();
    send({ type: 'dialog-answer', id: st.dialog.id, accept: !!accept, ...(accept && text != null ? { text: String(text) } : {}) });
  }
  function onDialogRecord(m) {
    if (m.state === 'open' && m.dialog && typeof m.dialog === 'object') {
      if (!st.dialog || st.dialog.id !== m.dialog.id) { st.dialogText = null; st.dialogAnswering = false; }
      st.dialog = m.dialog; renderDialog(); return;
    }
    if (m.state !== 'closed') return;
    const ids = Array.isArray(m.ids) ? m.ids : m.id ? [m.id] : [];
    const mine = !!(st.dialog && (ids.includes(st.dialog.id) || !ids.length));
    if (mine) { st.dialog = null; st.dialogAnswering = false; st.dialogText = null; renderDialog(); }
    if (m.answered && (mine || m.answered.by === 'auto')) showToast(answeredWords(m.answered, t), { duration: 3500 });
  }
  async function restartBrowser() {
    const ref = curRef();
    if (!ref || st.restarting) return;
    st.restarting = true; renderDialog();
    const r = await fetchJson(`/api/browser/session/${encodeURIComponent(sessionId)}/restart`, { method: 'POST', body: JSON.stringify({ ref }), headers: { 'Content-Type': 'application/json' } });
    st.restarting = false; renderDialog();
    if (r?.error) showToast(t('Could not restart the browser: {why}', { why: String(r.error) }), { type: 'error' });
    else showToast(r && r.restarted ? t('The browser was restarted — its tabs open fresh') : t('The browser was stopped — the agent’s next browser command starts it fresh'), { duration: 4000 });
  }
  const renderViewers = () => { viewersEl.textContent = t('{n} viewer(s)', { n: st.viewers || 1 }); viewersEl.title = t('Windows watching this browser right now (on every client)'); };
  const renderUrl = () => { urlEl.textContent = st.url || ''; urlEl.title = st.url || ''; openBtn.disabled = !st.url; if (H && document.activeElement !== addrInput && addrInput.value !== (st.url || '')) addrInput.value = st.url && st.url !== 'about:blank' ? st.url : ''; };
  const renderTabs = () => {
    tabsBtn.textContent = `${t('Tabs')} (${st.tabs.length})`;
    tabsPane.innerHTML = '';
    for (const tab of st.tabs) {
      const d = document.createElement('div');
      d.className = 'browser-live-tab' + (tab.active ? ' active' : '');
      const title = document.createElement('div'); title.className = 'browser-live-tab-title'; title.textContent = String(tab.title || tab.url || tab.tabId || '');
      const url = document.createElement('div'); url.className = 'browser-live-tab-url'; url.textContent = String(tab.url || '');
      d.title = String(tab.url || '');
      d.append(title, url);
      // BROWSE YOURSELF (B-6ae8): on his own window a tab is clickable — his session switches to it (a login popup, a link he
      // opened in a new tab: measured on 0.38.1, his pinned session lists it at once and `tab <target>` follows it)
      if (H && !tab.active && (tab.targetId || tab.tabId)) { d.classList.add('clickable'); d.tabIndex = 0; d.onclick = () => humanNav({ tab: tab.targetId || tab.tabId }); d.onkeydown = (e) => { if (e.key === 'Enter') d.onclick(); }; }
      tabsPane.appendChild(d);
    }
  };
  // ── lane browser-resume C (§3.9, the owner's ruling 3): THE TAB ROW ──
  /** Is the browser on show stoppable from this view (the row's "Close all…")? His window: his Quit; a conversation's view:
   *  the strip's own rule (stoppableRows — never a shared profile's, never one he browses himself: those say why elsewhere). */
  function quitRowOf() {
    if (H) return H.ended || st.stopped ? null : { human: true };
    const x = stoppableRows(st.rows && st.rows.length ? st.rows : computeRows(), { browsing: ((app._browserProfiles && app._browserProfiles.leases) || []).filter((l) => l && l.human).map((l) => l.profileId) }).find((r) => r.ref === curRef());
    return x && !x.shared && !x.yours ? x : null;
  }
  let tabRaf = 0;
  function renderTabRow() {
    if (st.closed) return;
    const driving = st.mode === 'takeover' && st.mine;
    const m = tabRowModel({ tabs: st.tabs, owners: st.tabOwners, viewer: { human: !!H }, driving, mediated: st.tabMediated, adoptable: st.tabAdoptable }, t);
    st.tabRow = m;
    const show = m.rows.length > 0 && !st.stopped && !st.hollow && !st.sessionEnded;
    const want = show ? '' : 'none';
    if (tabRow.style.display !== want) tabRow.style.display = want;
    // the take-over toggle names what taking over adds here (a hint on a WORKING control, never on a greyed one)
    if (!H) { const base = t('Take over the controls — the agent pauses until you hand back'); const tip = m.anyAgent && !driving && !st.tabMediated ? base + '\n' + t('Take over to switch or close the agent’s tabs') : base; if (takeBtn.title !== tip) takeBtn.title = tip; }
    if (!show) return;
    // KEYED: one chip per target id, patched in place (a broadcast never rebuilds the chip under the pointer)
    const have = new Map([...tabRowList.children].map((el) => [el.dataset.target, el]));
    const keep = new Set();
    let prev = null;
    for (const r of m.rows) {
      keep.add(r.targetId);
      let el = have.get(r.targetId);
      if (!el) {
        el = document.createElement('div'); el.className = 'browser-live-tabchip'; el.dataset.target = r.targetId;
        const av = document.createElement('span'); av.className = 'chan-av browser-live-tabchip-av'; av.setAttribute('aria-hidden', 'true');
        const ti = document.createElement('span'); ti.className = 'browser-live-tabchip-title';
        const mk = document.createElement('span'); mk.className = 'browser-live-tabchip-mark';
        el.append(av, ti, mk);
        el.addEventListener('click', (e) => { if (e.target.closest('.browser-live-tabchip-close')) return; const row = (st.tabRow && st.tabRow.rows || []).find((x) => x.targetId === el.dataset.target); if (row) chipClick(row); });
        el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && el.getAttribute('role') === 'button') { e.preventDefault(); el.click(); } });
      }
      const av = el.querySelector('.browser-live-tabchip-av');
      const a = avatarOf({ name: r.host || r.title, key: r.host || r.url });
      if (av.textContent !== a.text) av.textContent = a.text;
      if (av.dataset.hue !== String(a.hue)) av.dataset.hue = String(a.hue);
      const ti = el.querySelector('.browser-live-tabchip-title'); if (ti.textContent !== r.title) ti.textContent = r.title;
      const mk = el.querySelector('.browser-live-tabchip-mark'); if (mk.textContent !== r.mark) mk.textContent = r.mark; mk.title = r.markTip;
      el.classList.toggle('active', r.active);
      el.dataset.owner = r.owner;
      // lane browser-windows (U3/U0b): what a click does here — the PURE verdict (bring forward / switch while driving,
      // watch / follow while watching); the row's own verdict still answers his own window and the close buttons
      const cv = clickOf(r, driving);
      const clickTip = cv.act === 'front' ? t('Bring this tab to the front of its window') : cv.act === 'switch' ? r.switchTip || t('Switch to this tab') : cv.act === 'watch' ? t('Watch this tab — the agent’s tab is not changed (take over to switch it)') : cv.act === 'follow' ? t('Back to the agent’s current tab') : (r.canSwitch ? r.switchTip : '');
      const clickable = cv.act !== 'none' || r.canSwitch;
      const tip = (clickTip ? clickTip + '\n' : '') + r.tip + '\n' + r.markTip;
      if (el.title !== tip) el.title = tip;
      if (clickable) { el.setAttribute('role', 'button'); el.tabIndex = 0; } else { el.removeAttribute('role'); el.removeAttribute('tabindex'); }
      el.classList.toggle('switchable', clickable);
      el.classList.toggle('watched', !!(st.watch && st.watch.targetId === r.targetId));
      let x = el.querySelector('.browser-live-tabchip-close');
      if (r.canClose && !x) {
        x = document.createElement('button'); x.className = 'browser-live-tabchip-close bar-icon-btn'; x.innerHTML = UI_ICONS.close;
        x.addEventListener('click', (e) => { e.stopPropagation(); const row = (st.tabRow && st.tabRow.rows || []).find((y) => y.targetId === el.dataset.target); if (row && row.canClose) tabAct('close', row); });
        el.appendChild(x);
      } else if (!r.canClose && x) { x.remove(); x = null; }
      if (x) { x.title = r.closeTip; x.setAttribute('aria-label', r.closeTip + ' — ' + r.title); x.disabled = st.tabActs.has(r.targetId); }
      // order: move a node only when it is out of place
      const want0 = prev ? prev.nextSibling : tabRowList.firstChild;
      if (want0 !== el) tabRowList.insertBefore(el, want0);
      prev = el;
    }
    for (const [id, el] of have) if (!keep.has(id)) el.remove();
    const q = quitRowOf();
    const qw = q ? '' : 'none'; if (tabRowQuit.style.display !== qw) tabRowQuit.style.display = qw;
    refoldTabs();
  }
  function refoldTabs() {
    if (tabRaf) return;
    tabRaf = requestAnimationFrame(() => {
      tabRaf = 0;
      if (st.closed || tabRow.style.display === 'none' || !st.tabRow) return;
      const chips = [...tabRowList.children];
      for (const c of chips) c.style.display = '';
      const widths = {}; for (const c of chips) widths[c.dataset.target] = c.offsetWidth + 3;
      const f = tabRowFold({ rows: st.tabRow.rows, widths, avail: tabRow.clientWidth - 12, endPx: tabRowQuit.style.display === 'none' ? 0 : tabRowQuit.offsetWidth + 6, morePx: 44 });
      st.tabFolded = f.folded;
      for (const c of chips) c.style.display = f.folded.includes(c.dataset.target) ? 'none' : '';
      tabRowMore.style.display = f.folded.length ? '' : 'none';
      tabRowMore.textContent = '▾+' + f.folded.length;
      tabRowMore.title = t('{n} more tab(s) of this browser', { n: f.folded.length });
    });
  }
  if (typeof ResizeObserver === 'function') { const ro2 = new ResizeObserver(() => refoldTabs()); ro2.observe(tabRow); winInfo._listenerCtl?.signal?.addEventListener?.('abort', () => ro2.disconnect()); }
  tabRowMore.onclick = (e) => {
    e.stopPropagation();
    const r = tabRowMore.getBoundingClientRect();
    const rows = (st.tabRow && st.tabRow.rows || []).filter((x) => st.tabFolded.includes(x.targetId));
    const items = [];
    for (const x of rows) {
      items.push({ label: `${x.title} · ${x.mark}`, ...(x.canSwitch ? { action: () => tabAct('switch', x) } : { disabled: true }) });
      if (x.canClose) items.push({ label: t('Close tab') + ' — ' + x.title, action: () => tabAct('close', x) });
    }
    showContextMenu(r.left, r.bottom + 2, items);
  };
  /** One switch / ✕ on the row: sent to the bridge (the keeper re-judges every fact), answered by ONE `tab-ack`; a refusal
   *  or a failure is a toast in the device's words (never silence). */
  /** lane browser-windows (U3): the PURE click verdict for one row of the row model (his own window keeps the row's verdict). */
  function clickOf(r, driving = st.mode === 'takeover' && st.mine) {
    if (H) return { act: 'none', why: 'his-window' };
    return tabClickVerdict({ owner: r.owner, human: false, driving, mediated: st.tabMediated, active: r.active, watching: st.watch ? st.watch.targetId : null, targetId: r.targetId });
  }
  /** A chip click: driving ⇒ the real switch (`front` = bring the agent's own current tab forward — it may sit behind
   *  another tab of its window and paint nothing); watching ⇒ THIS view moves to that tab (the agent's tab untouched). */
  function chipClick(row) {
    const cv = clickOf(row);
    if (cv.act === 'front' || cv.act === 'switch') { tabAct('switch', row); return; }
    if (cv.act === 'watch') { watchTab(row); return; }
    if (cv.act === 'follow') { watchTab(null); return; }
    if (row.canSwitch) tabAct('switch', row);
  }
  function watchTab(row) {
    if (!st.ws || st.ws.readyState !== 1) { showToast(t('Could not switch tabs: {why}', { why: t('the live view is not connected') }), { type: 'error' }); return; }
    st.watch = row ? { targetId: row.targetId, mode: 'screencast', pending: true, title: row.title } : null;
    send({ type: 'watch-tab', targetId: row ? row.targetId : null });
    renderTabRow(); renderWatchLine();
  }
  /** The watch line: the tab this view watches (with the way back), else the tab on show that paints nothing (U0b — the
   *  user never clicks a frozen picture in silence), else nothing. Patched in place. */
  function renderWatchLine() {
    if (st.closed) return;
    const driving = st.mode === 'takeover' && st.mine;
    let text = '', btn = '', act = null;
    if (st.watch) {
      text = st.watch.mode === 'polling' ? t('Watching a background tab of the agent’s — a new picture every half second; the agent’s current tab is unchanged') : t('Watching another tab of the agent’s — the agent’s current tab is unchanged');
      btn = t('Back to the agent’s tab'); act = () => watchTab(null);
    } else if (st.bg && st.bg.state === 'unresponsive') {
      // B-d635 (userW's inc-murizo36-ecri): a tab that sends no picture and does not answer is SAID — never a blank canvas with no words
      text = driving ? t('This tab is not responding — no picture, and it did not answer when asked (a busy or hung page). Reload it, or switch to another tab') : t('The agent’s tab is not responding — no picture, and it did not answer when asked (a busy or hung page). This view updates as soon as it answers');
    } else if (st.bg) {
      const row = (st.tabRow && st.tabRow.rows || []).find((x) => x.targetId === String(st.bg.targetId || '').toUpperCase() || x.active);
      if (driving) { text = t('This tab is in the background of its window and paints nothing — bring it forward to see it live (a new picture every half second meanwhile)'); if (row) { btn = t('Bring it forward'); act = () => tabAct('switch', row); } }
      else text = t('The agent’s tab is in the background of its window — a new picture every half second; take over and bring it forward to see it live');
    }
    const want = text ? '' : 'none';
    if (watchLine.style.display !== want) watchLine.style.display = want;
    if (watchLineText.textContent !== text) watchLineText.textContent = text;
    watchLineBtn.style.display = btn ? '' : 'none';
    if (watchLineBtn.textContent !== btn) watchLineBtn.textContent = btn;
    watchLineBtn.onclick = act;
  }
  function tabAct(act, row) {
    if (!st.ws || st.ws.readyState !== 1) { showToast(act === 'close' ? t('Could not close the tab: {why}', { why: t('the live view is not connected') }) : t('Could not switch tabs: {why}', { why: t('the live view is not connected') }), { type: 'error' }); return; }
    if (st.tabActs.has(row.targetId)) return;
    const rid = ++st.tabRid;
    st.tabActs.set(row.targetId, { rid, act, title: row.title, owner: row.owner });
    send({ type: 'tab-act', act, targetId: row.targetId, rid });
    renderTabRow();
  }
  function onTabAck(m) {
    let key = null, pend = null;
    for (const [k, v] of st.tabActs) if (v.rid === m.rid) { key = k; pend = v; break; }
    if (key) st.tabActs.delete(key);
    const act = (pend && pend.act) || m.act;
    if (!m.ok) {
      const why = ['not_your_tab', 'tabs_unreadable', 'no_such_tab', 'take_over_first', 'last_tab', 'mediated_tabs'].includes(m.code) ? tabRefusalText(m.code, {}, t) : String(m.error || m.code || t('server unreachable'));
      st.tabError = { act, code: m.code || null, why, at: Date.now() };
      showToast(act === 'close' ? t('Could not close the tab: {why}', { why }) : t('Could not switch tabs: {why}', { why }), { type: 'error' });
    } else if (act === 'close' && pend && pend.owner === 'agent') showToast(t('Closed “{title}” — the agent is told when you hand back', { title: pend.title }), { duration: 3500 });
    // lane browser-windows (U0b): a chip click that RAN is said (userW's clicks changed nothing visible and said nothing)
    else if (act === 'switch' && m.broughtForward) showToast(t('Brought “{title}” to the front of its window', { title: (pend && pend.title) || '' }), { duration: 3000 });
    else if (act === 'switch' && !m.noop && pend && pend.owner === 'agent') showToast(t('Switched the agent’s tab to “{title}” — the agent is told when you hand back', { title: pend.title }), { duration: 3500 });
    renderTabRow();
  }
  /** "Close all…" = the browser's own Stop (a conversation's view) / Quit (his window) — ONE confirm naming the browser. */
  async function closeAllTabs() {
    const q = quitRowOf();
    if (!q) return;
    if (q.human) {
      const names = othersOnIt();
      const e = humanEndChoices({ conversations: names.length, names }, t);
      const label = humanLabel() || String(profileId || '');
      const title = t('Close all tabs of “{name}”?', { name: label }), message = e.confirm ? e.confirm.message : t('This quits “{name}” — every tab of it closes. Its logins are kept.', { name: label });
      st.quitAsked = { title, message, at: Date.now() };
      const yes = await showConfirmDialog({ title, message, confirmText: t('Quit the browser'), danger: true });
      if (!yes) return;
      const r = await fetchJson(`/api/browser/browse/${encodeURIComponent(H.key)}/quit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!r || r.error) { showToast(t('Could not quit the browser: {why}', { why: String((r && r.error) || t('server unreachable')) }), { type: 'error' }); return; }
      showToast(t('Stopped {label}', { label }), { duration: 4000 });
      return;
    }
    const name = rowName((st.rows || []).find((x) => x.ref === q.ref) || q);
    const title = t('Close all tabs of “{name}”?', { name }), message = t('This quits “{name}” — every tab of it closes. Its logins are kept; the agent’s next browser command starts it again.', { name });
    st.quitAsked = { title, message, at: Date.now() };
    const yes = await showConfirmDialog({ title, message, confirmText: t('Quit the browser'), danger: true });
    if (!yes) return;
    const r = await fetchJson(`/api/browser/session/${encodeURIComponent(sessionId)}/stop`, { method: 'POST', body: JSON.stringify({ ref: q.ref }), headers: { 'Content-Type': 'application/json' } });
    if (!r || r.error) { showToast(r && r.code === 'browsing_yourself' ? humanRefusalText('browsing_yourself', { label: name, act: 'stop' }, t) : t('Could not quit the browser: {why}', { why: String((r && r.error) || t('server unreachable')) }), { type: 'error' }); return; }
    showToast(t('Stopped — the next command starts it again'), { duration: 3000 });
  }
  tabRowQuit.onclick = () => { closeAllTabs(); };
  const renderConsole = () => {
    consBtn.textContent = `${t('Console')} (${st.console.length})`;
    consPane.innerHTML = '';
    for (const line of st.console) {
      const d = document.createElement('div');
      d.className = 'browser-live-console-line' + (line.level ? ' level-' + escHtml(String(line.level)).replace(/[^a-z]/gi, '') : '');
      d.textContent = (line.level ? `[${line.level}] ` : '') + String(line.text || '');
      consPane.appendChild(d);
    }
    consPane.scrollTop = consPane.scrollHeight;
  };
  const sessionName = () => { const r = row(); return r ? (r.webuiName || r.name || '') : ''; };
  const renderTitle = () => {
    if (H) { const lbl = (st.target && st.target.label) || H.label || humanLabel() || ''; try { app.wm.setTitle(winInfo.id, lbl ? t('{label} · you', { label: lbl }) : t('Browse yourself')); } catch { /* window gone */ } return; }
    const name = sessionName();
    const tg = st.target;
    const row = (st.rows || []).find((x) => x.ref === curRef());
    // lane S2: the conversation's own browser is named by THE browser fact ("work" when it opens the pin, else "no profile (temporary browser)")
    const title = liveTitle({ label: tg && tg.kind === 'child' && row ? rowName(row) : (tg ? tg.label : null), alias: tg ? tg.alias : null, sessionName: name, ephemeralWord: (wordsNow() || {}).ownName || t('no profile (temporary browser)') });
    try { app.wm.setTitle(winInfo.id, title); } catch { /* window gone */ }
  };
  // ── P7 (§4.6 / §3.7): the OWNERSHIP badge + the strip's per-pane owner dots, from the digest's leases ──
  const nameOf = (id) => { const s = (app.sidebar?._allSessions || []).find((x) => x.webuiId === id); return s ? (s.webuiName || s.name || '') : ''; };
  const dotsFor = (pid) => ownerDots({ leases: (app._browserProfiles && app._browserProfiles.leases) || [], profileId: pid || null, sessionId, nameOf });
  const ownersEl = (dots) => {
    const el = document.createElement('span'); el.className = 'browser-live-strip-owners';
    for (const d of dots.slice(0, 6)) { const i = document.createElement('i'); i.className = 'win-owner-dot'; i.style.background = String(d.color || ''); el.appendChild(i); }
    el.title = dots.map((d) => String(d.name || d.sessionId)).join('\n');
    return el;
  };
  const renderOwner = () => { if (H) return; const pid = st.target && st.target.profileId ? st.target.profileId : null; try { app.wm.setOwnerBadge?.(winInfo.id, { dots: dotsFor(pid) }); } catch { /* window gone */ } };
  // ── P7 (§4.6): BIND / UNBIND — one act, three surfaces ──
  const isBound = () => isSplitPane(winInfo);
  const bindLabel = () => (isBound() ? t('Unbind') : t('Snap beside {name}', { name: sessionName() || t('its session') }));
  const bindTitle = () => (isBound() ? t('Back to two free windows — the group stays and nothing moves') : t('Show this browser side by side with its session, in one window'));
  const renderBind = () => {
    const bound = isBound();
    bindBtn.classList.toggle('bound', bound); titleBind.classList.toggle('bound', bound);
    const label = bindLabel();
    bindBtn.setAttribute('aria-label', label); bindBtn.title = label + ' — ' + bindTitle(); titleBind.title = bindTitle();
  };
  function toggleBind() {
    if (isBound()) { app.wm.unbindSplit(winInfo._tabChain); renderBind(); return true; }
    const host = sessionWindowFor(app, sessionId);
    if (!host) { showToast(t('Open the session’s window first — there is nothing to snap beside'), { type: 'warn' }); return false; }
    app.wm.bindSplit(host, winInfo, { side: 'right', announce: true }); // a user's explicit act ⇒ the 5 s Undo toast (split UX R5); the auto-bind (createWindow({intoChain})) stays silent
    renderBind();
    return true;
  }
  bindBtn.onclick = () => toggleBind();
  titleBind.onclick = (e) => { e.stopPropagation(); toggleBind(); };
  // every chain transition (bind / unbind / detach / a tab switch) ends in onResize of the displayed panes — re-read the state there
  winInfo.onResize = () => { renderBind(); syncKeyboard(); }; // verify r2 (H1): a chain transition moves the view — its ownership is re-judged there too
  // ── MULTIVIEW (design-browser-multiview §2 A1 / D3 / D4): ONE strip lists EVERY browser of this session ──
  /** The ref of the pane this window shows (a profile id, EPHEMERAL_REF, a helper's handle). */
  const curRef = () => {
    const tg = st.target;
    if (tg) return tg.ref || (tg.kind === 'attachment' ? tg.profileId : tg.kind === 'child' ? tg.handle : EPHEMERAL_REF);
    return st.profileRef || null;
  };
  /** lane S2: is this row the browser THE fact says the conversation uses now? (the strip's one marker — never the
   *  attachment set's own "default", which disagreed with the chip in the study) */
  const inUse = (r) => { const f = st.fact || factNow(); const u = f && f.using; if (!u || !r) return false; return (u.kind === 'profile' && r.kind === 'attachment' && r.profileId === u.id) || (u.kind === 'own' && r.kind === 'ephemeral'); };
  /** A row's words: a profile's label (+ in use), the session's own browser (THE fact's name for it), a helper by its witnessed name or number. */
  /** The tab's own words, WITHOUT the marker (the marker is its own element, so a long name never cuts it off). */
  // lane jobs-browser: a Background Work job's window is the conversation's helper row, named as the job (live name)
  const jobOrHelper = (r) => (r.helper && r.helper.job ? t('Job: {name}', { name: r.helper.name || String((r.helper && r.helper.n) || '?') }) : r.helper && r.helper.name ? t('Helper: {name}', { name: r.helper.name }) : t('Helper {n}', { n: (r.helper && r.helper.n) || '?' }));
  const rowBase = (r) => {
    if (!r) return '';
    if (r.kind === 'ephemeral') return String((wordsNow() || {}).ownShort || t('Temp browser')); // short on the tab; the title says it whole
    if (r.kind === 'child') return jobOrHelper(r);
    return String(r.label || r.alias || r.ref);
  };
  const rowLabel = (r) => (r ? rowBase(r) + (inUse(r) ? ' ' + t('(in use)') : '') : '');
  /** A row's full name, for a title / a menu / the window title. */
  const rowName = (r) => {
    if (!r) return '';
    if (r.kind === 'ephemeral') return t('This conversation’s browser') + ' — ' + String((wordsNow() || {}).ownName || t('no profile (temporary browser)')) + (inUse(r) ? ' ' + t('(in use)') : '');
    if (r.kind === 'child') return jobOrHelper(r);
    return String(r.label || r.alias || r.ref) + (inUse(r) ? ' ' + t('(in use)') : '');
  };
  // lane browser-windows: an entry is this conversation's WINDOW; the user driving it from another conversation's view (a
  // lease still in an older browser run's shared window) names that view's conversation (its name from this client's rows)
  const keyName = (k) => { const s = (app.sidebar?._allSessions || []).find((x) => x && x.browserKey === k); return s ? (s.webuiName || s.name || '') : ''; };
  const driverText = (r) => (r.driver === 'you' ? t('you')
    : r.driver === 'other-user' ? t('you, in {name}', { name: keyName(r.driverKey) || t('another chat') })
        : r.kind === 'child' ? '' : t('agent'));
  // lane P verify (finding 6): the words come from the PURE rowStateWords — a released own browser beside an attachment is
  // never promised "the next command" (a bare command lands on the attachment); one sentence per code
  const STATE_WORDS = {
    running: () => t('Running a command'), idle: () => t('Running'), ended: () => t('Ended'),
    released: () => t('Released — the next command starts it again'),
    'released-attached': () => t('Released — used again only when no profile is attached'),
  };
  const stateTitle = (r) => (STATE_WORDS[rowStateWords(r, st.rows)] || STATE_WORDS.released)();
  /** 2.369.183: a browser this view has no frame of is not running (a strip switch, a pop-out) — HOLLOW, the tab's own words. */
  const hollowFor = (m) => { st.error = m; st.hollow = true; const r = st.rows.find((x) => x.ref === curRef()); setStatus(stateTitle(r || { kind: st.target && st.target.kind, state: 'released' }), { reconnect: false }); syncPast(); };
  /** The rows in THIS window's first-seen order (a new browser lands at the tail — nothing shown moves). */
  const computeRows = () => {
    const cur = curRef();
    const activity = cur ? { [cur]: !!st.running } : null;
    const r = stripOrder(st.order, browserListFor(st.status, { activity }));
    st.order = r.order;
    return r.rows;
  };
  const chipNow = () => capChip({ rows: st.rows, cap: st.status && st.status.cap ? st.status.cap.cap : 3, machine: st.status && st.status.cap ? st.status.cap.machine : null });
  let foldRaf = 0;
  const refold = () => {
    if (foldRaf) return;
    foldRaf = requestAnimationFrame(() => {
      foldRaf = 0;
      if (st.closed || strip.style.display === 'none') return;
      const tabs = [...stripTabs.querySelectorAll('.browser-live-strip-tab')];
      for (const b of tabs) b.style.display = '';
      const widths = {};
      for (const b of tabs) widths[b.dataset.ref] = b.offsetWidth + 2;
      const avail = strip.clientWidth - 12;
      const f = stripFold({ rows: st.rows, widths, avail, shownRef: curRef(), chipPx: capBtn.offsetWidth + 6, morePx: 44 });
      st.folded = f.folded;
      for (const b of tabs) b.style.display = f.folded.includes(b.dataset.ref) ? 'none' : '';
      stripMoreBtn.style.display = f.folded.length ? '' : 'none';
      stripMoreBtn.textContent = '▾+' + f.folded.length;
      stripMoreBtn.title = t('{n} more browser(s) of this conversation', { n: f.folded.length });
    });
  };
  const stripMenu = (r, x, y) => {
    const items = [{ label: t('Open in new window'), action: () => app.openBrowserLive({ sessionId, profileId: r.ref, popOut: true }) }];
    if (r.ref === curRef() && otherLiveWindow(app, sessionId, winInfo.id)) items.push({ label: t('Fold back into the Agent browser window'), action: () => foldBackLive(app, winInfo) });
    showContextMenu(x, y, items);
  };
  const renderStrip = () => {
    if (H) { strip.style.display = 'none'; return; } // BROWSE YOURSELF: his window shows his tab — no strip of a conversation's browsers
    st.rows = computeRows();
    renderDisplay(); // lane headless-fallback: the shown browser may have changed (a strip switch, a new row)
    renderTabRow(); // lane browser-resume C: the row's "Close all…" reads the same rows (stoppable, driven, shared)
    const chip = chipNow();
    // ≥2 browsers ⇒ the strip (one browser keeps the single-browser look) — and a conversation AT its cap
    // shows the strip too, so the red own/cap chip the agent's refusal points at is there to click
    // owner ruling A (2): …and a SHARED profile's browser (another conversation holds it too) shows the strip, so its tab says
    // who drives it right now
    const show = st.rows.length >= 2 || (st.rows.length >= 1 && (chip.full || st.rows.some((r) => r.kind === 'attachment' && r.owners > 0)));
    strip.style.display = show ? '' : 'none';
    stripTabs.replaceChildren();
    if (!show) { stripMoreBtn.style.display = 'none'; return; }
    const cur = curRef();
    for (const r of st.rows) {
      const b = document.createElement('button');
      const current = r.ref === cur;
      b.className = 'browser-live-strip-tab' + (current ? ' active' : '') + ' state-' + r.state + (r.driver === 'you' ? ' driven' : '');
      b.dataset.ref = r.ref; b.dataset.kind = r.kind;
      if (r.profileId) b.dataset.profileId = r.profileId;
      const dot = document.createElement('span'); dot.className = 'browser-live-strip-dot'; dot.title = stateTitle(r);
      const full = rowName(r);
      const label = document.createElement('span'); label.className = 'browser-live-strip-label'; label.textContent = shortLabel(rowBase(r));
      b.append(dot, label);
      // lane S2: THE fact's "in use" marker — a CLASS (an accent underline on the name), never extra words: a wider tab
      // would fold its neighbour out of a split pane's strip; the words ride the tooltip / the menus (rowName)
      if (inUse(r)) b.classList.add('in-use');
      const dt = driverText(r);
      if (dt) { const d = document.createElement('span'); d.className = 'browser-live-strip-driver'; d.textContent = dt; b.appendChild(d); }
      if (r.kind === 'attachment') b.appendChild(ownersEl(dotsFor(r.profileId))); // §3.7: who else this profile's browser belongs to
      b.title = (current ? t('You are looking at this browser') : t('Switch this window to {name}', { name: full })) + (inUse(r) ? '\n' + t('This conversation uses this browser now') : '') + '\n' + stateTitle(r);
      b.onclick = () => { if (r.ref !== curRef()) switchTo(r.ref); };
      b.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); stripMenu(r, e.clientX, e.clientY); };
      stripTabs.appendChild(b);
    }
    capBtn.textContent = chip.text;
    capBtn.classList.toggle('full', chip.full);
    capBtn.classList.toggle('machine-full', chip.machineFull);
    capBtn.title = t('{own} of this conversation’s {cap} browsers are running — click to see them or change the limit', { own: chip.own, cap: chip.cap }) + (chip.machineFull ? '\n' + t('Machine ceiling reached') : '');
    refold();
  };
  stripMoreBtn.onclick = (e) => {
    e.stopPropagation();
    const r = stripMoreBtn.getBoundingClientRect();
    const items = st.rows.filter((x) => st.folded.includes(x.ref)).map((x) => ({ label: rowName(x), action: () => switchTo(x.ref) }));
    showContextMenu(r.left, r.bottom + 2, items);
  };
  /** D4: the chip's popover — THIS conversation's running browsers (helpers' too) with a Stop each, and its limit (1..6). */
  const openCapPopover = () => {
    const pop = createPopover(capBtn, 'browser-live-cap-pop');
    const chip = chipNow();
    const head = document.createElement('div'); head.className = 'browser-live-cap-head'; head.textContent = t('This conversation’s browsers: {own} of {cap} running', { own: chip.own, cap: chip.cap });
    pop.appendChild(head);
    if (chip.machineFull) { const m = document.createElement('div'); m.className = 'browser-live-cap-machine'; m.textContent = t('Machine ceiling reached — no browser can start until one stops, anywhere on this machine'); pop.appendChild(m); }
    // lane browser-windows (U4): the machine's count against its ceiling — a SETTING now (Settings → Agent browser)
    { const mc = st.status && st.status.cap && st.status.cap.machine; if (mc && Number.isFinite(Number(mc.cap))) { const m = document.createElement('div'); m.className = 'browser-live-cap-machine-count'; m.textContent = t('This machine: {used} of {cap} browsers running (Settings → Agent browser → Browsers running at once on this machine)', { used: Number(mc.used) || 0, cap: Number(mc.cap) }); pop.appendChild(m); } }
    const list = stoppableRows(st.rows, { browsing: ((app._browserProfiles && app._browserProfiles.leases) || []).filter((l) => l && l.human).map((l) => l.profileId) }); // verify r2: a profile the user browses himself is never stopped from here
    if (!list.length) { const n = document.createElement('div'); n.className = 'browser-live-cap-empty'; n.textContent = t('None of them is running right now'); pop.appendChild(n); }
    for (const x of list) {
      const row = document.createElement('div'); row.className = 'browser-live-cap-row';
      const name = document.createElement('span'); name.className = 'browser-live-cap-name'; name.textContent = rowName(st.rows.find((y) => y.ref === x.ref) || x);
      row.appendChild(name);
      if (x.yours) { const sh = document.createElement('span'); sh.className = 'browser-live-cap-shared'; sh.textContent = t('you are browsing it yourself — stop it from your browsing window'); row.appendChild(sh); }
      else if (x.shared) { const sh = document.createElement('span'); sh.className = 'browser-live-cap-shared'; sh.textContent = t('also used by {n} other conversation(s) — detach it instead', { n: x.owners }); row.appendChild(sh); }
      else {
        const stop = document.createElement('button'); stop.className = 'file-tool-btn browser-live-cap-stop'; stop.textContent = t('Stop');
        stop.onclick = async () => {
          stop.disabled = true;
          const r = await fetchJson(`/api/browser/session/${encodeURIComponent(sessionId)}/stop`, { method: 'POST', body: JSON.stringify({ ref: x.ref }), headers: { 'Content-Type': 'application/json' } });
          if (!r || r.error) { stop.disabled = false; showToast(r && r.code === 'browsing_yourself' ? humanRefusalText('browsing_yourself', { label: x.label || '', act: 'stop' }, t) : ((r && r.error) || t('server unreachable')), { type: 'error' }); return; }
          showToast(t('Stopped — the next command starts it again'), { duration: 3000 });
          pop.remove(); refreshSet();
        };
        row.appendChild(stop);
      }
      pop.appendChild(row);
    }
    // the limit: a stepper 1..6 (+ back to the default)
    const capRow = document.createElement('div'); capRow.className = 'browser-live-cap-limit';
    const lbl = document.createElement('span'); lbl.textContent = t('Limit for this conversation') + ': ';
    const minus = document.createElement('button'); minus.className = 'file-tool-btn browser-live-cap-minus'; minus.textContent = '−'; minus.title = t('Fewer');
    const val = document.createElement('span'); val.className = 'browser-live-cap-value'; val.textContent = String(chip.cap);
    const plus = document.createElement('button'); plus.className = 'file-tool-btn browser-live-cap-plus'; plus.textContent = '+'; plus.title = t('More');
    capRow.append(lbl, minus, val, plus);
    const explicit = st.status && st.status.cap ? st.status.cap.explicit : null;
    if (Number.isInteger(explicit)) { const d = document.createElement('button'); d.className = 'file-tool-btn browser-live-cap-default'; d.textContent = t('Use the default'); d.onclick = () => setCap(null); capRow.appendChild(d); }
    pop.appendChild(capRow);
    const setCap = async (v) => {
      const r = await setBrowserCap(sessionId, v);
      if (!r || r.error) { showToast((r && r.error) || t('server unreachable'), { type: 'error' }); return; }
      pop.remove(); refreshSet();
    };
    minus.disabled = chip.cap <= 1; plus.disabled = chip.cap >= 6;
    minus.onclick = () => setCap(chip.cap - 1);
    plus.onclick = () => setCap(chip.cap + 1);
  };
  capBtn.onclick = (e) => { e.stopPropagation(); openCapPopover(); };
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => refold()); ro.observe(strip); winInfo._listenerCtl?.signal?.addEventListener?.('abort', () => ro.disconnect()); }
  const renderSide = () => {
    side.style.display = st.sidePane ? '' : 'none';
    syncPast();
    tabsPane.style.display = st.sidePane === 'tabs' ? '' : 'none';
    consPane.style.display = st.sidePane === 'console' ? '' : 'none';
    tracePane.style.display = st.sidePane === 'trace' ? '' : 'none';
    tabsBtn.classList.toggle('active', st.sidePane === 'tabs');
    consBtn.classList.toggle('active', st.sidePane === 'console');
    traceBtn.classList.toggle('active', st.sidePane === 'trace');
  };
  const renderTraceBtn = () => { traceBtn.textContent = `${t('Actions')} (${timeline.count()})`; traceBtn.title = t('Every action the agent sent to this browser — before / after frames and where it clicked'); };
  /** P5: which scope the Actions pane shows = the pane you are looking at (a profile, or the ephemeral browser); re-seeded on every hello (a reconnect fills the gap, ids dedup). */
  const syncTrace = () => {
    const tg = st.target;
    const pid = tg && tg.kind !== 'ephemeral' && tg.profileId ? tg.profileId : null;
    timeline.load({ profileId: pid }).then(() => { renderTraceBtn(); maybeShowSessions(); }).catch(() => renderTraceBtn());
  };
  /** 2026-09-27: a STOPPED browser's view still has its past — when the browser is not running (stopped, closed, not
   *  started, released) and the pane has sessions, the Actions pane opens on its Sessions list (each with Replay);
   *  never over a pane the user chose or closed. */
  // nothing live to show: stopped / closed / released / not started, or an error before the first frame (the stream
  // could not be reached) — the past is what this view can offer then
  function idleNow() { return !!(st.stopped || st.hollow || (st.error && (st.error.browserState === 'not-started' || st.error.code === 'browser_stopped' || (!st.connected && !st.frames)))); }
  /** A phone looking at the PAST of a browser that is not running: the Sessions list takes the full width and the status
   *  sits above it (style.css `.side-past`, ≤ 768 px; the naive-user verifier, 2026-09-28). */
  function syncPast() { root.classList.toggle('side-past', st.sidePane === 'trace' && idleNow()); }
  const maybeShowSessions = () => {
    if (st.closed || st.sideUser || st.sidePane) return;
    if (!idleNow() || !timeline.sessionsCount()) return;
    st.sidePane = 'trace'; renderSide();
  };
  /** P5 (D7): the recording indicator from the digest — never fetched here. */
  const renderRec = () => {
    const pid = st.target && st.target.profileId ? st.target.profileId : null;
    const d = app._browserProfiles || {};
    const rec = pid && d.recording ? d.recording[pid] : null;
    const refused = pid && d.recordingRefused ? d.recordingRefused[pid] : null;
    recEl.classList.toggle('on', !!rec);
    // lane live-input: three states in words a person can act on (the owner read "recording refused" + a raw command)
    const w = recordingChipWords({ recording: rec, refused, hasProfile: !!pid, since: rec ? new Date(Number(rec.since) || 0).toLocaleTimeString() : '' }, { t });
    recEl.textContent = w.text; recEl.title = w.title; recEl.dataset.state = w.state; recEl.classList.toggle('refused', w.state === 'refused');
  };
  recEl.onclick = () => { const pid = st.target && st.target.profileId ? st.target.profileId : null; if (app.openBrowserProfiles) app.openBrowserProfiles({ focus: pid }); else showToast(t('Agent browser is not available'), { type: 'warn' }); };
  /** P4 (§7.4): the browser's name + the blocked-claim banner, both read from the profile digest (never fetched here). */
  /** lane headless-fallback: the shown browser's launch fact, from the digest (the row's record id — an ephemeral / a helper's too). */
  const renderDisplay = () => {
    const r = (st.rows || []).find((x) => x && x.ref === curRef()) || null;
    const txt = displayFactText(displayFactOf(app._browserProfiles, (r && r.profileId) || (st.target && st.target.profileId) || null));
    if (displayNote.textContent !== txt) displayNote.textContent = txt;
    displayNote.style.display = txt ? '' : 'none';
  };
  const renderBackend = () => {
    renderDisplay();
    const pid = st.target && st.target.profileId ? st.target.profileId : null;
    const words = pid ? ((app.browserChipFor ? app.browserChipFor(pid) : null) || t('unknown browser')) : '';
    const choices = pid && app.browserChoicesFor ? app.browserChoicesFor(pid) : [];
    const asButton = !!pid && choices.length > 0;
    backendBtn.style.display = asButton ? '' : 'none';
    backendLabelEl.style.display = pid && !asButton ? '' : 'none';
    if (backendBtn.textContent !== words) backendBtn.textContent = words;
    if (backendLabelEl.textContent !== words) backendLabelEl.textContent = words;
    // lane browser-admin 2a: the build the browser itself REPORTS rides the pill's tooltip (a pill carries no version — the
    // switch dialog's word law); the Agent browser panel row prints it
    { const rb = pid && app._browserProfiles && app._browserProfiles.browsers && app._browserProfiles.browsers[pid] ? app._browserProfiles.browsers[pid].runningBuild : null; const tip = rb ? t('Running Chrome {version}', { version: rb }) : ''; for (const n of [backendBtn, backendLabelEl]) if ((n.dataset.buildTip || '') !== tip) { n.dataset.buildTip = tip; n.title = [n.dataset.baseTitle || '', tip].filter(Boolean).join(' · '); } }
    const claims = app.browserBlockedFor ? app.browserBlockedFor({ profileId: pid, sessionId }) : [];
    blockedBar.style.display = claims.length ? '' : 'none';
    // rebuilt only when what it says changed — a digest broadcast never re-creates a button under the pointer; an opened
    // Details fold stays open across a rebuild (st.claimOpen, by the claim's id)
    const sig = JSON.stringify([pid, choices[0] || null, claims.map((b) => [b.id, b.host, b.why, b.evidence || ''])]);
    if (blockedBar.dataset.sig === sig) return;
    blockedBar.dataset.sig = sig;
    blockedBar.replaceChildren();
    for (const id of [...st.claimOpen]) if (!claims.some((b) => b.id === id)) st.claimOpen.delete(id);
    for (const b of claims) {
      const w = claimWords(b, t);
      const row = document.createElement('div'); row.className = 'browser-live-blocked-row'; row.dataset.claim = String(b.id || '');
      const text = document.createElement('span'); text.className = 'browser-live-blocked-text';
      // no other browser to switch to: the banner says what the person CAN do (the naive-user verifier, 2026-09-28 — the
      // claim + Dismiss alone was a dead end; the dialog's empty line gives the same advice)
      text.textContent = pid && choices.length ? w.text : `${w.text} ${t('Take over to get past the check yourself.')}`;
      row.appendChild(text);
      if (pid && choices.length) {
        const to = choices[0];
        row.appendChild(textBtn(t('Switch to {name}…', { name: backendName(to, t) }), () => app.openBrowserSwitcher?.({ profileId: pid, sessionId, preselect: to })));
      }
      let det = null;
      if (w.detail) {
        // the agent's evidence, behind a fold (the dialog's Details — here too, so it can be read on every build)
        det = document.createElement('div'); det.className = 'browser-live-blocked-detail'; det.textContent = w.detail; det.hidden = !st.claimOpen.has(b.id);
        const d = textBtn(det.hidden ? t('Details') : t('Hide details'), () => {
          det.hidden = !det.hidden;
          if (det.hidden) st.claimOpen.delete(b.id); else st.claimOpen.add(b.id);
          d.textContent = det.hidden ? t('Details') : t('Hide details');
        }, 'browser-live-blocked-details');
        row.appendChild(d);
      }
      row.appendChild(textBtn(tc('browser', 'Dismiss'), async () => {
        const r = await fetchJson(`/api/browser/blocked/${encodeURIComponent(b.id)}`, { method: 'DELETE' });
        if (r && r.error) console.warn('[browser-live] dismiss answered', r.code, r.error);
        const dw = dismissOutcomeWords(r, t);
        if (dw) showToast(dw.text, { type: dw.tone === 'error' ? 'error' : 'warn' });
        if (dw && dw.refresh) { blockedBar.dataset.sig = ''; app.refreshBrowserProfiles?.(); }
      }));
      if (det) row.appendChild(det);
      blockedBar.appendChild(row);
    }
  };
  backendBtn.onclick = () => { const pid = st.target && st.target.profileId; if (pid) app.openBrowserSwitcher?.({ profileId: pid, sessionId }); };
  renderMode(); renderViewers(); renderUrl(); renderTabs(); renderConsole(); renderSide(); renderBackend(); renderTraceBtn(); renderRec(); renderBind(); renderOwner();

  // ── lane I: THE FOLD — every item keeps its words on one line; what the bar has no room for goes into ⋯ by
  // LIVE_BAR_PRIORITY (PURE barLayout; the ruler + observers + rAF live in bar-fold.js, bound to this window's signal) ──
  const barItems = { badge: modeBadge, take: takeBtn, handback: handBtn, continue: contBtn, close: closeBtn, quit: quitBtn, kbd: kbdChip, kbdBtn, echo: echoEl, copy: copyChip, bind: bindBtn, url: urlEl, open: openBtn, viewers: viewersEl, rec: recEl, fit: fitChip, backend: backendBtn, backendLabel: backendLabelEl, tabs: tabsBtn, console: consBtn, trace: traceBtn, reconnect: reBtn };
  const fold = createBarFold(bar, {
    more: moreBtn,
    items: () => Object.entries(barItems).map(([key, el]) => ({ key, el, priority: key === 'kbd' && st.claimed && (ky.yielded || ky.dialogHolds) ? LIVE_BAR_PRIORITY.badge : LIVE_BAR_PRIORITY[key], flexMin: key === 'url' ? URL_MIN_PX : undefined })), // lane takeover-keyboard: where the keys went outranks the rest while yielded
    signal: winInfo._listenerCtl?.signal,
    onLayout: (v) => { renderMore(); floorPane(v); },
  });
  /** THE SPLIT FLOOR (lane I verify r1): this view's pane never narrower than its own bar's floor (the toggle + the ⋯ +
   *  Reconnect when shown, + the chrome around the bar's content) — WindowManager.setPaneMinWidth holds it while the
   *  window is a pane of a split (the divider stops there); a free window's 320 px floor is already wider. The floor
   *  never depends on the bar's width, so raising the pane cannot feed back into it. */
  function floorPane(v) {
    if (!v || !(v.floor > 0)) return;
    const chrome = Math.max(0, (winInfo.content.offsetWidth || 0) - v.widthPx); // the bar's padding + borders (layout px)
    try { app.wm.setPaneMinWidth?.(winInfo.id, v.floor + chrome); } catch { /* window gone */ }
  }
  /** The ⋯ rows: one per folded item, in bar order, each with the item's LIVE words (counts, state) and its own act. */
  const foldedRows = () => {
    const out = fold.folded();
    const rows = [];
    const check = (pane, btn) => (st.sidePane === pane ? '✓ ' : '') + btn.textContent;
    for (const key of out) {
      if (key === 'badge') rows.push({ label: modeBadge.title || modeBadge.textContent, title: modeBadge.title, disabled: true }); // who drives, in full (an info row — the toggle is the act)
      else if (key === 'kbd') rows.push({ label: kbdChip.textContent, title: kbdChip.title, disabled: true }); // lane J r2's chip, folded: an info row
      else if (key === 'kbdBtn') rows.push({ label: t('Keyboard'), title: kbdBtn.title, action: () => kbdBtn.onclick() }); // BROWSE YOURSELF: the touch keyboard, folded
      else if (key === 'continue') rows.push({ label: contBtn.textContent, title: contBtn.title, action: () => contBtn.onclick() }); // lane browser-resume B: the between-turns hand-back, folded
      else if (key === 'quit') rows.push({ label: quitBtn.textContent, title: quitBtn.title, action: () => quitBtn.onclick() }); // BROWSE YOURSELF: "Quit the whole browser", folded on a narrow bar (Close never folds)
      else if (key === 'bind') rows.push({ label: bindLabel(), title: bindTitle(), action: () => toggleBind() });
      else if (key === 'url') rows.push({ label: st.url ? (st.url.length > 90 ? st.url.slice(0, 89) + '…' : st.url) : t('Open this URL in a web view'), title: t('Open this URL in a web view'), disabled: !st.url, action: () => openBtn.onclick() });
      else if (key === 'open') { if (!out.includes('url')) rows.push({ label: t('Open this URL in a web view'), disabled: !st.url, action: () => openBtn.onclick() }); }
      else if (key === 'viewers') rows.push({ label: viewersEl.textContent, title: viewersEl.title, disabled: true });
      else if (key === 'rec') rows.push({ label: recEl.textContent, title: recEl.title, action: () => recEl.onclick() });
      else if (key === 'fit') { const c = fitChipNow(); rows.push(c.act ? { label: fitChip.textContent, title: fitChip.title, action: () => fitChip.onclick() } : { label: fitChip.textContent, title: fitChip.title, disabled: true }); } // lane S4; builder r2: folded, the row keeps the chip's own words (WHY the page looks small AND what a click does — "Fit the page to this window" alone lost the why at 360 px)
      else if (key === 'copy') rows.push({ label: copyChip.textContent, title: copyChip.title, action: () => copyChip.onclick() }); // lane live-input
      // the browser's name, folded, says WHAT it is (the naive-user verifier, 2026-09-28: a bare "Chromium" row read as nothing)
      else if (key === 'backend') rows.push({ label: t('Switch browser (now {name})…', { name: backendBtn.textContent }), title: backendBtn.title, action: () => backendBtn.onclick() });
      else if (key === 'backendLabel') rows.push({ label: t("Your agent's browser: {name}", { name: backendLabelEl.textContent }), disabled: true }); // an info row (no other browser to switch to)
      else if (key === 'tabs') rows.push({ label: check('tabs', tabsBtn), action: () => tabsBtn.onclick() });
      else if (key === 'console') rows.push({ label: check('console', consBtn), action: () => consBtn.onclick() });
      else if (key === 'trace') rows.push({ label: check('trace', traceBtn), title: traceBtn.title, action: () => traceBtn.onclick() });
    }
    return rows;
  };
  /** The ⋯ while the badge is folded into it: the badge's colour (data-badge + data-mode, style.css) and its sentence
   *  ahead of "More" in the tooltip / accessible name. */
  function renderMore() {
    const folded = fold.folded().includes('badge');
    const want = folded ? 'folded' : '';
    if ((moreBtn.dataset.badge || '') !== want) moreBtn.dataset.badge = want;
    const label = folded ? `${modeBadge.title || modeBadge.textContent} — ${t('More')}` : t('More');
    if (moreBtn.title !== label) { moreBtn.title = label; moreBtn.setAttribute('aria-label', label); }
  }
  moreBtn.onclick = (e) => {
    e.stopPropagation();
    const rows = foldedRows();
    if (!rows.length) return;
    const r = moreBtn.getBoundingClientRect();
    showContextMenu(r.left, r.bottom + 2, rows).classList.add('browser-live-more-menu');
  };

  // ── the attachment set (the strip) ──
  async function refreshSet() {
    if (st.closed || H) return; // BROWSE YOURSELF: no conversation to read
    const r = await fetchJson(`/api/browser/session/${encodeURIComponent(sessionId)}`);
    if (st.closed) return;
    if (!r || r.error) { st.attachments = []; st.status = null; renderStrip(); return; }
    st.attachments = Array.isArray(r.attachments) ? r.attachments : [];
    st.defaultId = r.defaultProfile || null;
    st.status = r;
    renderStrip();
    renderTitle();
    // MULTIVIEW §2: a pane that was RELEASED is never started by this view — but when the next
    // command started it again, the view picks it up by itself (the same pane, never another)
    // (2.369.183: the hollow `browser_stopped` of lane H's code, and a greyed helper's view — lane H's digest resume
    // reads only an attachment's / the session's own browser — resume here too; a closed / unstable one never does)
    if (st.error && !st.connected && (st.hollow || st.error.browserState === 'not-started' || (st.stopped === true && st.error.code === 'browser_stopped'))) {
      const row = st.rows.find((x) => x.ref === curRef());
      if (row && (row.state === 'idle' || row.state === 'running')) { st.error = null; st.reconnects = 0; connect(); }
    }
  }
  /** lane S2 (naive study 2, T4): A VIEW FOLLOWS ITS SESSION'S BROWSER — a moved fact (the profile recreated /
   *  adopted / detached / pinned) retargets a following view to the browser in use now (PURE liveFollowPlan: a view
   *  the user pointed at another browser that still exists, a helper's view and a view the user DRIVES stay put). */
  const viewFacts = () => ({ ref: st.profileRef, shown: st.target ? curRef() : '', errorCode: st.error ? st.error.code || null : null, sessionEnded: st.sessionEnded, driving: st.mode === 'takeover' && st.mine });
  function applyFollow(plan) {
    if (!plan || st.closed) return;
    if (plan.act === 'retarget') { st.followed++; switchTo(plan.ref); }
    else if (plan.act === 'reconnect' && !st.connected && !(st.ws && st.ws.readyState === 0)) { st.reconnects = 0; connect(); }
  }
  function onFact(next) {
    if (st.closed || !next) return;
    const prev = st.fact;
    if (prev && prev.digest === next.digest) return;
    st.fact = next;
    renderTitle(); renderStrip(); renderDialog(); // lane browser-stuck: the fact's `stuck` = the unresponsive banner
    renderResume(); renderCont(); // lane browser-resume B: what is kept moved (a Forget, a start) — the Resume follows
    applyFollow(liveFollowPlan({ view: viewFacts(), prev, next }));
  }
  const onGlobal = (msg) => {
    if (st.closed || !msg) return;
    if (msg.type === 'active-sessions' && Array.isArray(msg.sessions)) { const r = msg.sessions.find((x) => x && x.id === sessionId); if (r && r.browserFact) onFact(r.browserFact); return; }
    // 2026-09-27: a session of this conversation's browser started or ended — the Actions pane's Sessions list re-reads
    if (msg.type === 'browser-sessions-updated') { const r = row(); const bk = timeline.browserKey() || (r && r.browserKey) || null; if (bk && msg.browserKey && (msg.browserKey === bk || String(msg.browserKey).startsWith(bk + '.'))) timeline.onSessions(); return; }
    if (msg.type === 'browser-site-reset' && msg.profileId && st.target && st.target.profileId === msg.profileId) { // lane site-reset
      resetNote.textContent = t('{host}\'s stored login was cleared in this profile ({n} cookies) — you approved it; its pages need a new sign-in', { host: String(msg.host || ''), n: Number(msg.cookies) || 0 });
      resetNote.style.display = '';
      return;
    }
    if (msg.type === 'browser-profiles-updated') {
      refreshSet(); renderBackend(); renderRec(); renderOwner();
      if (H) { renderEnds(); renderTitle(); } // BROWSE YOURSELF: who else uses his browser (the line under his two ends) and its name
      // naive study 2 (finding 3): a STOPPED view resumes when the digest says its browser runs again (a view never starts one)
      if (st.stopped && !st.connected && viewTargetRunning({ target: st.target, digest: msg }) === true) { st.reconnects = 0; connect(); }
    }
  };
  app.ws?.onGlobal?.(onGlobal);

  // ── the socket ──
  function send(obj) { try { if (st.ws && st.ws.readyState === 1) st.ws.send(JSON.stringify(obj)); } catch { /* closing */ } }
  function connect() {
    if (st.closed) return;
    if (st.reconnectTimer) { clearTimeout(st.reconnectTimer); st.reconnectTimer = null; }
    try { st.ws?.close(); } catch { /* */ }
    st.connected = false; st.error = null; st.hollow = false;
    st.openAt = 0; st.navAt = 0; st.picture = 'ok'; st.pictureStale = false; st.refreshSent = false; st.fitSent = null; root.classList.remove('picture-stale'); // lane S4
    setStatus(t('Connecting…'));
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    // BROWSE YOURSELF (B-6ae8): his own window asks for HIS tab (`browse`), with the press's one-time token on its first attach
    const q = H ? new URLSearchParams({ browse: H.key }) : new URLSearchParams({ session: sessionId });
    if (H && H.fresh) { q.set('fresh', H.fresh); H.fresh = null; }
    if (!H && st.profileRef) q.set('profile', st.profileRef);
    const ws = new WebSocket(`${proto}://${location.host}${STREAM_PATH}?${q}`);
    st.ws = ws;
    ws.onopen = () => { if (ws !== st.ws) return; send({ type: 'config', maxFps: document.hidden ? HIDDEN_FPS : MAX_FPS_DEFAULT }); };
    ws.onmessage = (ev) => { if (ws !== st.ws) return; let m = null; try { m = JSON.parse(ev.data); } catch { return; } onMessage(m); };
    ws.onclose = () => {
      if (ws !== st.ws) return; st.connected = false; renderKbd(); syncKeyboard(); // lane S2: no "Typing goes to the browser" over a closed stream; verify r2 (H1): a transition
      // lane J r2: the server hands a takeover back when the holder's socket goes (`viewer-left`) — so do we: the
      // keyboard is released at once (a dead socket must never swallow what you type next)
      if (st.mine) { st.mode = 'watch'; st.mine = false; st.holder = null; renderMode(); }
      if (st.closed) return; if (!st.error) { setStatus(t('Connection lost'), { error: true, reconnect: true }); scheduleReconnect(); }
    };
    ws.onerror = () => { /* onclose follows */ };
  }
  function scheduleReconnect() {
    if (st.closed || st.reconnects >= RECONNECT_MAX) return;
    const delay = Math.min(15000, 1000 * Math.pow(2, st.reconnects));
    st.reconnects++;
    st.reconnectTimer = setTimeout(() => { st.reconnectTimer = null; connect(); }, delay);
  }
  function onMessage(m) {
    switch (m.type) {
      case 'hello':
        st.mode = m.mode || 'watch'; st.holder = m.holder || null; st.viewers = m.viewers || 1; st.target = m.target || null;
        st.you = m.you || null; st.mine = !!m.mine; st.modeSince = Number(m.since) || 0;
        st.remotePlatform = typeof m.platform === 'string' ? m.platform : null; // lane live-input: the browser's OS (⌘ chords are translated for a non-Mac one)
        renderMode(); renderViewers(); renderTitle(); renderStrip(); renderBackend(); renderRec(); syncTrace(); renderOwner(); renderBind();
        st.fitSent = null; reportFit(); renderFit(); // lane S4: this viewer's pane, at once (the bridge sizes the page to the ruling pane)
        st.dialog = null; st.dialogAnswering = false; renderDialog(); // lane browser-stuck: a (re)connected view is told again by the bridge's replay
        break;
      // P3 (§4.3): the bridge's answer to a takeover/handback — ours or anybody's
      case 'mode': {
        const was = st.mode, wasMine = st.mine;
        st.mode = m.mode || 'watch'; st.holder = m.holder || null; st.mine = !!m.mine; st.modeSince = Number(m.since) || 0; st.modeCause = m.cause || null;
        st.wakes = Number.isInteger(m.wakes) ? m.wakes : null; // r6 A-F9: what a Hand back from this view wakes
        renderMode(); renderFit(); // builder r2: the fit chip's words name who drives (a shared browser held while YOU drive)
        if (st.mode === 'takeover' && st.mine && st.watch) st.watch = null; // lane browser-windows (U3): a takeover drives the agent's tab — the bridge ended this view's watch
        renderTabRow(); renderWatchLine(); // lane browser-windows: the chips' clicks and the watch line's words follow who drives
        // lane browser-resume C: a takeover / handback moves who drives this browser — the strip's rows (and the tab row's
        // "Close all…", which is never offered on a browser somebody drives) re-read it now (an own browser's input change is
        // no digest write: without this they waited for an unrelated broadcast)
        if (was !== st.mode && !H) refreshSet();
        // the owner's ruling (2026-09-27): the takeover INTERRUPTS the agent and the handback asks it to re-run — both said here
        const rerunList = Array.isArray(m.rerun) ? m.rerun.map(String).filter(Boolean).slice(0, 8).join(', ') : '';
        st.lastRerun = rerunList;
        if (was === 'takeover' && st.mode === 'watch' && wasMine) {
          if (m.cause === 'idle') showToast(rerunList ? t('Your takeover lapsed (no input) — the agent is driving again and was told to re-run: {verbs}', { verbs: rerunList }) : t('Your takeover lapsed (no input) — the agent is driving again'), { duration: 5000 });
          else if (m.cause !== 'explicit' && m.cause !== 'continue') showToast(t('Control returned to the agent'), { duration: 3500 }); // lane browser-resume B: the hand-back says its own words
        } else if (st.mode === 'takeover' && st.mine && !wasMine && m.cause !== 'pass') { // a PASS (fold-back) says its own words
          const it = m.interrupted && Number(m.interrupted.n) > 0 ? m.interrupted : null;
          // verify r6: a script running in the page was stopped with the agent's call (Runtime.terminateExecution is page-context) — said to the human
          const stopped = it && Number(it.terminated) > 0 ? ' ' + t('A script running in the page was stopped with it.') : '';
          showToast(it ? t('You took over — {n} agent operation(s) interrupted: {verbs}. The agent waits until you hand back', { n: Number(it.n), verbs: (Array.isArray(it.verbs) ? it.verbs : []).map(String).slice(0, 8).join(', ') }) + stopped : t('You took over — the agent is paused until you hand back'), { duration: it ? 6000 : 4000 });
        }
        break;
      }
      case 'mode-ack': if (m.ok && m.mode === 'watch') showToast(st.lastRerun ? t('Control handed back to the agent — it was told to re-run: {verbs}', { verbs: st.lastRerun }) : t('Control handed back to the agent'), { duration: st.lastRerun ? 5000 : 3500 }); break;
      case 'confirmation': if (m.id) {
        // r6 A-F8: FIRST WRITE WINS here too — a record under a held id with other content never repaints the card
        const next = { id: m.id, action: m.action, category: m.category || null, target: m.target || null, expiresAt: Number(m.expiresAt) || (Date.now() + 60000) };
        const had = st.confirmations.get(m.id);
        if (had && confirmationDigest(had) !== confirmationDigest(next)) had.conflict = { action: next.action, target: next.target };
        else st.confirmations.set(m.id, had ? { ...had, expiresAt: next.expiresAt } : next);
        renderConfirms();
      } break;
      case 'confirmation-conflict': { const c = m.id && st.confirmations.get(m.id); if (c) { c.conflict = { action: (m.attempted && m.attempted.action) || '?', target: (m.attempted && m.attempted.target) || null }; renderConfirms(); } break; }
      case 'confirmation-resolved': if (m.id && st.confirmations.delete(m.id)) renderConfirms(); break;
      case 'dialog': onDialogRecord(m); break; // lane browser-stuck: a page dialog opened / closed on the tab this view shows
      case 'dialog-ack': if (!m.ok) { st.dialogAnswering = false; renderDialog(); showToast(t('The dialog could not be answered: {why}', { why: String(m.error || m.code || '') }), { type: 'error' }); } break;
      case 'confirmation-ack': if (!m.ok) showToast(t('Could not answer the confirmation: {why}', { why: String(m.error || m.code || '') }), { type: 'error' }); else st.confirmations.delete(m.id), renderConfirms(); break;
      case 'viewers': st.viewers = Number(m.n) || 1; renderViewers(); break;
      case 'handback-wakes': st.wakes = Number.isInteger(m.wakes) ? m.wakes : null; renderMode(); break; // r6 A-F9: a sibling chat joined or left
      case 'status':
        st.lastStatus = m;
        // 2.369.183 (lanes H + P on one tree): ONE code for "not running, and a view never starts it" — `browser_stopped`
        // (lane P's `browser_released` is read the same). A view that WAS showing this browser (frames) greys by name and
        // keeps its last frame (lane H, naive study 2 finding 3); a view just switched to it — a strip tab, a pop-out — has
        // no frame to keep and says the tab's own state words, HOLLOW (lane P). Either way it picks the browser up by itself.
        // BROWSE YOURSELF (B-6ae8): his browsing ended (Close, the keep ran out, the browser stopped / quit, the profile
        // deleted) or is not there any more — said by WHY, and "Browse again" is the one act (a POST: a user act)
        if (H && ((m.state === 'human-ended') || (m.state === 'error' && (m.code === 'not_browsing' || m.code === 'browser_stopped' || m.code === 'not-found')))) {
          H.ended = m.state === 'human-ended' ? (m.deleted ? 'deleted' : String(m.reason || 'released')) : (m.code === 'not-found' ? 'deleted' : m.code === 'browser_stopped' ? 'stopped' : 'left');
          st.error = m; st.stopped = H.ended === 'stopped' ? true : st.stopped; renderMode();
          const lbl = (st.target && st.target.label) || H.label || humanLabel() || '';
          const words = H.ended === 'deleted' ? t('“{label}” was deleted', { label: lbl }) : H.ended === 'stopped' ? t('Stopped — Browse again to open it') : H.ended === 'released' ? t('You closed your browsing — Browse again to open it') : t('Your browsing ended — Browse again to open it');
          reBtn.textContent = t('Browse again');
          setStatus(words, { reconnect: H.ended !== 'deleted' });
          break;
        }
        if (m.state === 'error' && m.code === 'browser_stopped') {
          if (st.frames > 0) {
            // naive study 2 (finding 3): the browser is not running and a view never starts one — say so plainly, keep the
            // LAST frame (greyed), the badge says "Browser stopped"; the view resumes by itself when the browser runs again
            st.error = m; st.stopped = true; st.stoppedHow = null; st.hollow = false; renderMode();
            setStatus(t('Stopped — the agent\'s next browser command starts it again, and this view reconnects then'), { reconnect: true });
          } else hollowFor(m); // MULTIVIEW: a released / stopped browser (lane P verify: an attachment too) is HOLLOW — the tab's own words
          maybeShowSessions(); // 2026-09-27: its past sessions, each with Replay
        } else if (m.state === 'error' && m.code === 'browser_released') {
          hollowFor(m); maybeShowSessions();
        } else if (m.state === 'error' && m.code === 'no-browser' && m.browserState === 'not-started') {
          // …or not started yet (the conversation has not opened it) — hollow too, and the view picks it up by itself
          st.error = m; setStatus(t('Not started yet — the next command starts it'), { reconnect: false }); maybeShowSessions();
        } else if (m.state === 'error' && (m.code === 'browser_closed' || m.code === 'browser_unstable')) {
          // lane H verify r5 (MINOR 2): its browser was CLOSED (the daemon lives) — a view never starts it: the last frame
          // stays greyed, the badge names why; `browser_unstable` = it kept closing and VibeSpace stopped restarting it
          // lane H verify r6 MINOR 1: `unstable: 'failing'` = every ask to start it again failed — it never came back to close
          st.error = m; st.stopped = m.code; st.stoppedHow = m.unstable || null; renderMode(); maybeShowSessions();
          setStatus(m.code === 'browser_unstable' ? (m.unstable === 'failing' ? t('This browser could not be started — VibeSpace stopped trying. Stop it in ⚙ → Tools → Agent browser…, then the next command starts it fresh') : t('This browser keeps closing — VibeSpace stopped starting it again. Stop it in ⚙ → Tools → Agent browser…, then the next command starts it fresh')) : t('Closed — the agent\'s next browser command starts it again, and this view reconnects then'), { reconnect: true, error: m.code === 'browser_unstable' });
        } else if (m.state === 'error') { st.error = m; if (m.code === 'not-found') st.sessionEnded = true; setStatus(t('Live view unavailable: {why}', { why: String(m.error || m.code || '') }), { error: true, reconnect: true }); maybeShowSessions(); }
        else if (m.state === 'connecting') setStatus(t('Starting the browser stream…'));
        else if (m.state === 'upstream-open') { st.connected = true; st.reconnects = 0; st.openAt = Date.now(); if (st.stopped) { st.stopped = false; renderMode(); } setStatus(st.frames ? '' : t('Connected — waiting for the first frame…'), { hide: !!st.frames }); renderKbd(); syncKeyboard(); }
        else if (m.state === 'upstream-closed') { st.connected = false; setStatus(t('Stream ended'), { error: true, reconnect: true }); syncKeyboard(); } // verify r2 (H1): the view stops owning — said at once
        else if (m.state === 'ended') { st.error = m; if (/session ended/.test(String(m.error || ''))) st.sessionEnded = true; setStatus(String(m.error || t('Stream ended')), { error: true, reconnect: true }); }
        else if (m.connected !== undefined) { // the upstream's own status record
          if (m.viewportWidth && m.viewportHeight && !st.meta) st.meta = { width: Number(m.viewportWidth), height: Number(m.viewportHeight) }; // lane J: a CLAIM, used only where it fits the picture
        }
        break;
      case 'input-receipt': if (noteInputReceipt(st.receipts, m)) onReceiptsChanged(); break; // lane S2: the bridge's answer for one input
      case 'clipboard': onPageCopied(m); break; // lane live-input: the page copied text while you drive — to YOUR clipboard
      case 'frame': {
        const data = typeof m.data === 'string' ? m.data : '';
        if (!data) break;
        st.frames++;
        st.lastFrameAt = Date.now(); st.refreshSent = false; // lane S4: the picture clocks restart
        // lane S2 (naive study 2, T5): a stale error never outlives the picture — a frame is proof the stream works
        if (st.error && !st.stopped && !st.hollow) { st.error = null; setStatus('', { hide: true }); }
        if (st.picture !== 'ok' || st.pictureStale) { st.picture = 'ok'; st.pictureStale = false; root.classList.remove('picture-stale'); if (!st.error && !st.stopped) setStatus('', { hide: true }); }
        if (!st.connected) { st.connected = true; st.reconnects = 0; st.openAt = Date.now(); syncKeyboard(); } // a LATE viewer of a relay already open (a tap kept it) hears no upstream-open — its first frame is the proof
        if (root.classList.contains('side-past')) syncPast(); // a picture again: the Sessions list gives the width back
        const md = m.metadata || {};
        if (Number(md.deviceWidth) > 0 && Number(md.deviceHeight) > 0) st.meta = { width: Number(md.deviceWidth), height: Number(md.deviceHeight) }; // lane J: every frame's claim, both sides
        img.src = 'data:image/jpeg;base64,' + data; // .src, never markup (the image-overlay law)
        if (st.frames === 1) setStatus('', { hide: true });
        break;
      }
      // lane browser-windows (U3): the tab THIS view watches (or null: back on the agent's), its mode, a refusal said by name
      case 'watching': {
        if (m.refused) { const why = m.refused === 'not_your_tab' ? tabRefusalText('not_your_tab', {}, t) : m.refused === 'driving' ? t('you drive this window — its chip switches the agent’s tab') : String(m.error || m.refused); showToast(t('Could not show that tab: {why}', { why }), { type: 'error' }); }
        if (m.targetId) st.watch = { targetId: String(m.targetId), mode: m.mode === 'polling' ? 'polling' : 'screencast', pending: !!m.pending, title: st.watch && st.watch.targetId === String(m.targetId) ? st.watch.title : '' };
        else { if (st.watch && m.ended) showToast(t('Back on the agent’s tab — the tab you watched is gone'), { duration: 3000 }); st.watch = null; }
        renderTabRow(); renderWatchLine();
        break;
      }
      // lane browser-windows (U0b): the tab on show paints nothing (a background tab of its window) — or it does again
      case 'tab-background':
        st.bg = m.targetId ? { targetId: String(m.targetId), since: Number(m.since) || Date.now(), state: m.state === 'unresponsive' ? 'unresponsive' : 'hidden' } : null; // B-d635: or a tab that never answers
        renderWatchLine();
        break;
      case 'tabs':
        st.tabs = Array.isArray(m.tabs) ? m.tabs.map((x) => ({ tabId: String(x.tabId || ''), targetId: String(x.targetId || ''), title: String(x.title || ''), url: String(x.url || ''), active: !!x.active })) : [];
        if (H) { const act = st.tabs.find((x) => x.active); if (act && act.url && act.url !== st.url) { st.url = act.url; renderUrl(); } } // his tab switched (a popup he opened): the address row follows
        { const act = st.tabs.find((x) => x.active); if (act && act.url && !st.url) { st.url = act.url; renderUrl(); } }
        renderTabs(); renderTabRow(); // lane browser-resume C: the row follows the browser's tabs
        break;
      // lane browser-resume C (§3.9, ruling 3): whose each tab is (the keeper's answer, replayed to a late viewer) and one act's answer
      case 'tab-owners':
        st.tabOwners = m.owners && typeof m.owners === 'object' ? { ...m.owners } : {}; st.tabMediated = !!m.mediated; st.tabAdoptable = !!m.adoptable;
        renderTabRow();
        break;
      case 'tab-ack': onTabAck(m); break;
      case 'url': { const u = String(m.url || ''); if (u && st.url && u !== st.url && st.frames > 0) { st.navAt = Date.now(); st.refreshSent = false; } st.url = u; renderUrl(); if (st.error && st.connected && !st.stopped && !st.hollow) { st.error = null; setStatus('', { hide: true }); } break; } // lane S4: a navigation starts the picture clock; lane S2: a navigation clears a stale error too
      // lane S4: the page's size and whose pane it follows (the bridge's ruling; replayed to a late viewer)
      case 'fit': st.fit = { state: m.state, width: Number(m.width) || 0, height: Number(m.height) || 0, viewerId: m.viewerId ?? null, rule: m.rule || null, drawScale: Number(m.drawScale) || 1, floor: m.floor || null, device: m.device || null, error: m.error || null, code: m.code || null, why: m.why || null, place: m.place && typeof m.place === 'object' ? { page: m.place.page || null, device: m.place.device || null } : null }; renderFit(); break; // lane live-input: `place` = where the ruling window is (the chip says which)
      // lane J: the page's own layout viewport (the bridge reads it over CDP on the first frame, a picture/tab change and a takeover)
      case 'viewport': if (m.ok && Number(m.clientWidth) > 0 && Number(m.clientHeight) > 0) { st.page = { clientWidth: Number(m.clientWidth), clientHeight: Number(m.clientHeight) }; renderCursor(); } break;
      case 'console':
        st.console.push({ level: m.level ? String(m.level).slice(0, 12) : '', text: String(m.text || m.message || '').slice(0, 2000) });
        if (st.console.length > CONSOLE_CAP) st.console.splice(0, st.console.length - CONSOLE_CAP);
        renderConsole();
        break;
      case 'command': {
        st.running = true; st.lastCommand = String(m.action || ''); renderStrip();
        const c = agentCursorFromCommand(m);
        if (c) { st.cursor = c.x === null && st.cursor ? { ...st.cursor, action: c.action, at: c.at } : c; renderCursor(); }
        break;
      }
      case 'result': st.running = false; renderStrip(); break;
      // P5 (§4.5 / D35): the recorder's entry for THIS pane, pushed by the bridge to every viewer (never the bytes)
      case 'trace': if (m.entry && timeline.push(m.entry)) renderTraceBtn(); break;
      case 'refused':
        if (m.code === 'held') showToast(t('Another viewer holds the controls'), { type: 'warn' });
        else if (m.code === 'browser_restarting') showToast(t('The browser is restarting — take over again in a few seconds, when it is back'), { type: 'warn' }); // verify r2 (H2)
        else if (m.code === 'wake_count_changed') { st.wakes = Number.isInteger(m.wakes) ? m.wakes : st.wakes; renderMode(); showToast(t('Hand back now wakes {n} conversation(s) — nothing was handed back; press it again to confirm', { n: Number(m.wakes) || 0 }), { type: 'warn' }); }
        else if (m.code !== 'watch-mode') showToast(String(m.error || m.code || 'refused'), { type: 'warn' });
        break;
      default: break;
    }
  }
  function switchTo(profileRef) {
    st.profileRef = profileRef || '';
    st.error = null; st.target = null; // the next hello names the pane (MULTIVIEW: a strip tab may name a helper's browser or EPHEMERAL_REF)
    if (st.stopped || st.hollow) { st.stopped = false; st.stoppedHow = null; st.hollow = false; renderMode(); } // a new pane has no last frame to grey
    st.frames = 0; st.url = ''; st.tabs = []; st.tabOwners = {}; st.tabActs.clear(); st.console = []; st.running = false; st.reconnects = 0;
    st.fit = null; st.fitSent = null; st.navAt = 0; st.lastFrameAt = 0; st.openAt = 0; st.picture = 'ok'; st.pictureStale = false; root.classList.remove('picture-stale'); renderFit(); setZoom(ZOOM_NONE); // lane S4: a new pane has its own size and picture
    img.removeAttribute('src');
    timeline.clear(); renderTraceBtn(); // the next hello names the pane and re-seeds
    renderUrl(); renderTabs(); renderTabRow(); renderConsole();
    try { winInfo._openSpec = { action: 'openBrowserLive', sessionId, profileId: st.profileRef || null }; app.wm._notify?.(); } catch { /* optional */ }
    renderStrip();
    connect();
  }

  // ── lane S4: THE PAGE IS THE PANE'S SIZE — report the pane, speak when the page is not ours ──
  /** Is this view on screen (its window displayed — not another desktop, not a hidden tab, not minimized) in a visible document? */
  const onScreen = () => { try { if (document.hidden || !root.isConnected) return false; if (typeof root.checkVisibility === 'function') return root.checkVisibility({ visibilityProperty: true }); return root.getClientRects().length > 0; } catch { return false; } };
  /** The pane = the canvas's box in viewport px — at NET zoom 1 that IS its CSS px (never device px: a DPR-3 phone asks for a 390-wide page). */
  function paneNow() { const r = canvas.getBoundingClientRect(); return { width: Math.round(r.width), height: Math.round(r.height) }; }
  function reportFit({ force = false, claim = false } = {}) {
    if (st.closed || !(st.ws && st.ws.readyState === 1)) return;
    const p = paneNow();
    // `browser.fitPageToView` OFF: this view never votes (a view that had voted says it is gone — the page goes back after the grace)
    const allowed = app.settings?.get('browser.fitPageToView') !== false;
    const vis = allowed && onScreen() && p.width >= 1 && p.height >= 1;
    const last = st.fitSent;
    const width = vis ? p.width : (last ? last.width : Math.max(1, p.width)), height = vis ? p.height : (last ? last.height : Math.max(1, p.height));
    if (!force && !claim && last && last.width === width && last.height === height && last.visible === vis) return;
    st.fitSent = { width, height, visible: vis };
    send({ type: 'fit', width: Math.max(1, width), height: Math.max(1, height), dpr: Number(window.devicePixelRatio) || 1, visible: vis, force, claim: claim && vis, place: st.place }); // lane live-input: `claim` = "Fit here"; `place` = where this view is (the other views' chip words)
  }
  const scheduleReport = () => { if (st.fitTimer) clearTimeout(st.fitTimer); st.fitTimer = setTimeout(() => { st.fitTimer = null; reportFit(); }, FIT_REPORT_MS); };
  // lane live-input: the ResizeObserver re-renders the fit chip too — its "smaller / larger here" follows this window's own size
  if (typeof ResizeObserver === 'function') { const cro = new ResizeObserver(() => { scheduleReport(); renderFit(); if (isZoomed(st.zoom)) setZoom(st.zoom); }); cro.observe(canvas); winInfo._listenerCtl?.signal?.addEventListener?.('abort', () => cro.disconnect()); }
  document.addEventListener('visibilitychange', scheduleReport, { signal: winInfo._listenerCtl?.signal });
  // verify r1: a DESKTOP SWITCH (and the stage) hide a window with `visibility:hidden` WRITTEN ON ITS ELEMENT'S STYLE — no
  // resize, no visibilitychange — so the view kept voting from another desktop (its pane still ruled the page, the restore
  // never came). Every hider that writes the element's style/class is watched; the report re-reads onScreen() itself.
  if (typeof MutationObserver === 'function' && winInfo.element) { const mo = new MutationObserver(scheduleReport); mo.observe(winInfo.element, { attributes: true, attributeFilter: ['style', 'class'] }); winInfo._listenerCtl?.signal?.addEventListener?.('abort', () => mo.disconnect()); }
  { const onFitSetting = () => scheduleReport(); app.settings?.on?.('browser.fitPageToView', onFitSetting); winInfo._listenerCtl?.signal?.addEventListener?.('abort', () => app.settings?.off?.('browser.fitPageToView', onFitSetting)); }
  const fitChipNow = () => fitChipState({ fit: st.fit, you: st.you, place: st.place, pane: paneNow(), mine: st.mode === 'takeover' && !!st.mine }); // lane live-input: WHERE the page's size comes from, and whether it is shown smaller or larger here (builder r2: `mine` = the words of a shared browser held while THIS view drives)
  // lane live-input: the chip's words live in PURE src/browser-fit.js `fitChipWords` (the owner could not read "Sized for another window")
  function renderFit() {
    const c = fitChipNow();
    fitChip.style.display = c.show ? '' : 'none';
    fitChip.dataset.kind = c.kind || '';
    if (!c.show) return;
    const w = fitChipWords(c, { t });
    fitChip.textContent = w.text; fitChip.title = w.title; fitChip.setAttribute('aria-label', w.title);
    fitChip.classList.toggle('actionable', !!c.act);
  }
  fitChip.onclick = () => {
    const c = fitChipNow();
    if (c.act === 'claim') { // lane live-input: the page follows THIS window from now on (the explicit act — the other window then shows it scaled)
      reportFit({ claim: true });
      showToast(c.rule === 'holder' ? t('The page will fit this window once the other window hands back') : t('The page now fits this window'), { duration: 3500 });
      return;
    }
    if (c.act !== 'force') { showToast(fitChip.title, { duration: 5000 }); return; }
    reportFit({ force: true }); // the user's explicit act: the page follows the window again (the agent's size is set aside; the rule picks the pane)
    showToast(t('Fitting the page to the window — the agent’s own size is set aside'), { duration: 3500 });
  };
  // ── lane S4: THE PICTURE CLOCKS — never a blank picture under a URL that says loaded ──
  function pictureTick() {
    if (st.closed) return;
    const ps = pictureState({ connected: st.connected, frames: st.frames, lastFrameAt: st.lastFrameAt, navAt: st.navAt, openAt: st.openAt, now: Date.now() });
    const blocking = !!(st.error || st.stopped || st.hollow);
    if (ps.state === 'ok' || blocking) {
      // only OUR words are taken back (a lost connection / an error / a stopped browser keep theirs)
      if ((st.picture !== 'ok' || st.pictureStale) && !blocking && st.connected && st.frames) setStatus('', { hide: true });
      root.classList.remove('picture-stale');
      st.picture = 'ok'; st.pictureStale = false;
      return;
    }
    if (!st.refreshSent) { st.refreshSent = true; send({ type: 'refresh' }); } // ask once for a fresh picture of this page (the bridge takes it from the page itself)
    st.pictureStale = ps.stale;
    root.classList.toggle('picture-stale', ps.stale);
    if (ps.state === 'waiting' && st.picture !== 'waiting') setStatus(ps.stale ? t('Waiting for a picture of the new page…') : t('Waiting for a picture…'));
    if (ps.state === 'none' && st.picture !== 'none') setStatus(ps.stale ? t('No picture of the new page came in 10 s — the browser’s stream sent none. Reconnect to ask again.') : t('No picture came in 10 s — the browser’s stream sent none. Reconnect to ask again.'), { error: true, reconnect: true });
    st.picture = ps.state;
  }
  st.pictureTimer = setInterval(pictureTick, 500);
  // ── lane S4: THE PHONE'S PINCH — a transform on the picture in WATCH mode; taps map through it ──
  const boxOf = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });
  const localOf = (e) => { const r = canvas.getBoundingClientRect(); const kx = r.width ? canvas.clientWidth / r.width : 1, ky = r.height ? canvas.clientHeight / r.height : 1; return { x: (e.clientX - r.left) * kx, y: (e.clientY - r.top) * ky }; };
  function setZoom(z) {
    st.zoom = zoomClamp(z, boxOf());
    img.style.transform = transformCss(st.zoom);
    root.classList.toggle('zoomed', isZoomed(st.zoom));
    renderCursor(); renderYou();
  }
  const pinchHint = () => { const n = Date.now(); if (n - st.lastPinchHintAt > HINT_EVERY_MS) { st.lastPinchHintAt = n; showToast(t('Pinch-zoom works while you watch — hand back to zoom the picture'), { duration: 3500 }); } };
  /** Handles a touch pointer for the pinch / pan / double tap; true = consumed (never forwarded, never a watch hint). */
  function touchDown(e) {
    if (e.pointerType !== 'touch') return false;
    if (driving()) {
      // takeover: the FIRST finger is the page's (forwarded as touch records, mapped through the transform); a second is refused with a hint
      if (st.touches.size >= 1) { st.touches.set(e.pointerId, { refused: true }); pinchHint(); return true; }
      st.touches.set(e.pointerId, { forwarded: true }); return false;
    }
    st.touches.set(e.pointerId, { ...localOf(e), t: Date.now(), moved: false });
    try { img.setPointerCapture(e.pointerId); } catch { /* optional */ }
    if (st.touches.size === 2) { const [a, b] = [...st.touches.values()]; st.pinch = { z0: { ...st.zoom }, a0: { x: a.x, y: a.y }, b0: { x: b.x, y: b.y } }; st.pan = null; }
    else if (st.touches.size === 1 && isZoomed(st.zoom)) { const a = st.touches.get(e.pointerId); st.pan = { z0: { ...st.zoom }, x0: a.x, y0: a.y }; }
    return true;
  }
  function touchMove(e) {
    if (e.pointerType !== 'touch' || !st.touches.has(e.pointerId)) return false;
    const rec = st.touches.get(e.pointerId);
    if (rec.refused) return true;
    if (rec.forwarded) return false;
    const p = localOf(e);
    if (Math.hypot(p.x - rec.x, p.y - rec.y) > 8) rec.moved = true;
    rec.cx = p.x; rec.cy = p.y;
    if (st.pinch && st.touches.size >= 2) { const [a, b] = [...st.touches.values()]; setZoom(pinchStep(st.pinch.z0, st.pinch.a0, st.pinch.b0, { x: a.cx ?? a.x, y: a.cy ?? a.y }, { x: b.cx ?? b.x, y: b.cy ?? b.y }, boxOf())); }
    else if (st.pan) setZoom(panStep(st.pan.z0, p.x - st.pan.x0, p.y - st.pan.y0, boxOf()));
    return true;
  }
  function touchUp(e) {
    if (e.pointerType !== 'touch' || !st.touches.has(e.pointerId)) return false;
    const rec = st.touches.get(e.pointerId); st.touches.delete(e.pointerId);
    if (rec.refused) return true;
    if (rec.forwarded) return false;
    if (st.touches.size < 2) st.pinch = null;
    if (!st.touches.size) st.pan = null;
    // a TAP (no move, short): a double tap toggles 2× at the finger; a single tap is the watch hint (as a click is)
    if (!rec.moved && Date.now() - rec.t < 350) {
      const lt = st.lastTap, n = Date.now();
      if (lt && n - lt.at < 350 && Math.hypot(lt.x - rec.x, lt.y - rec.y) < 30) { st.lastTap = null; setZoom(isZoomed(st.zoom) ? ZOOM_NONE : zoomAt(st.zoom, ZOOM_DOUBLE_TAP, rec.x, rec.y, boxOf())); }
      else { st.lastTap = { at: n, x: rec.x, y: rec.y }; if (n - st.lastHintAt > HINT_EVERY_MS) { st.lastHintAt = n; showToast(t('Watch mode — the agent is driving; pinch to zoom, press Take over to send input'), { duration: 3500 }); } }
    }
    return true;
  }

  // ── chrome actions ──
  openBtn.onclick = () => { if (st.url) app.openBrowser(st.url); };
  // lane S2 (naive study 2, T4: "Reconnect does nothing"): Reconnect RE-RESOLVES the target — a view whose browser is
  // gone (a stale refusal) moves to the browser in use now; otherwise it reconnects as before
  // ── BROWSE YOURSELF (B-6ae8): his window's acts ──
  /** One address-row act (the daemon's own verb under HIS session) — refused by name before it leaves (web only). */
  async function humanNav(body) {
    if (!H || H.ended) return false;
    if (body && body.url !== undefined) { const v = addressVerdict(body.url); if (!v.ok) { showToast(t('Only web addresses'), { type: 'warn' }); return false; } body = { url: v.url }; }
    const r = await fetchJson(`/api/browser/browse/${encodeURIComponent(H.key)}/navigate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    // verify r1 (H6): a conversation's tab in the Tabs pane is refused `not_your_tab` — said in the device's words
    if (!r || r.error) { showToast(r && r.code === 'not_web' ? t('Only web addresses') : (r && ['not_browsing', 'not_your_tab', 'tabs_unreadable'].includes(r.code) ? humanRefusalText(r.code, { label: humanLabel() }, t) : t('Could not open it: {why}', { why: String((r && r.error) || t('server unreachable')) })), { type: 'error' }); return false; }
    return true;
  }
  addrInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const u = addrInput.value.trim(); if (u) humanNav({ url: u }).then((ok) => { if (ok) { addrInput.blur(); if (driving()) focusSink(); } }); }
    else if (e.key === 'Escape') { e.preventDefault(); addrInput.value = st.url && st.url !== 'about:blank' ? st.url : ''; addrInput.blur(); if (driving()) focusSink(); }
  }, { signal: winInfo._listenerCtl?.signal });
  addrInput.addEventListener('focus', () => { try { addrInput.select(); } catch { /* */ } }, { signal: winInfo._listenerCtl?.signal });
  backNav.onclick = () => humanNav({ verb: 'back' });
  fwdNav.onclick = () => humanNav({ verb: 'forward' });
  reloadNav.onclick = () => humanNav({ verb: 'reload' });
  // the touch Keyboard: the sink is focused INSIDE this tap (a phone raises its soft keyboard only for a focus in a gesture)
  kbdBtn.onclick = () => { focusSink(); };
  closeBtn.onclick = async () => {
    if (!H || H.ended) return;
    closeBtn.disabled = true;
    const r = await fetchJson(`/api/browser/browse/${encodeURIComponent(H.key)}/close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    closeBtn.disabled = false;
    if (!r || r.error) { if (r && r.code === 'not_browsing') { try { app.wm.closeWindow(winInfo.id); } catch { /* gone */ } return; } showToast(t('Could not close your browsing: {why}', { why: String((r && r.error) || t('server unreachable')) }), { type: 'error' }); return; }
    H.ended = 'released';
    try { app.wm.closeWindow(winInfo.id); } catch { /* gone */ }
  };
  quitBtn.onclick = async () => {
    if (!H || H.ended) return;
    const names = othersOnIt();
    const e = humanEndChoices({ conversations: names.length, names }, t);
    if (e.confirm) { const yes = await showConfirmDialog({ ...e.confirm }); if (!yes) return; }   // ONE options object (lane-pairing's approval census §1b — the .197 integration)
    quitBtn.disabled = true;
    const r = await fetchJson(`/api/browser/browse/${encodeURIComponent(H.key)}/quit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    quitBtn.disabled = false;
    if (!r || r.error) { showToast(t('Could not quit the browser: {why}', { why: String((r && r.error) || t('server unreachable')) }), { type: 'error' }); return; }
    showToast(t('Stopped {label}', { label: humanLabel() || String(profileId || '') }), { duration: 4000 });
  };
  reBtn.onclick = () => {
    // lane browser-resume B: RESUME — the user's act (a POST): its own browser relaunched on the SAME directory with its tabs
    if (st.resumeOffer) { doResume(); return; }
    // BROWSE YOURSELF: "Browse again" is a new press (a POST — a user act; a view never starts a browser)
    if (H && H.ended) { if (H.ended !== 'deleted') browseYourself(app, profileId, { label: humanLabel() }); return; }
    st.reconnects = 0; const f = st.fact || factNow(); const plan = liveFollowPlan({ view: viewFacts(), prev: f, next: f, force: true }); if (plan.act === 'retarget') { st.followed++; switchTo(plan.ref); } else connect(); };
  tabsBtn.onclick = () => { st.sideUser = true; st.sidePane = st.sidePane === 'tabs' ? null : 'tabs'; renderSide(); };
  consBtn.onclick = () => { st.sideUser = true; st.sidePane = st.sidePane === 'console' ? null : 'console'; renderSide(); };
  traceBtn.onclick = () => { st.sideUser = true; st.sidePane = st.sidePane === 'trace' ? null : 'trace'; renderSide(); };
  // P3 (§4.3): the three modes behind ONE toggle (lane I). Take over asks
  // the bridge (the keeper decides, a `mode` record answers every viewer);
  // Hand back is a transition any viewer may trigger.
  takeBtn.onclick = () => {
    // BROWSE YOURSELF: Continue here (another window of his holds his tab: the controls MOVE here) / Continue browsing
    if (H) { send({ type: st.mode === 'takeover' && !st.mine ? 'claim' : 'takeover' }); focusSink(); return; }
    if (!(st.mode === 'takeover' && st.mine)) send({ type: 'takeover' });
  }; // the `mode` answer claims the keyboard (renderMode)
  handBtn.onclick = () => { if (st.claimed) releaseHeld(); send({ type: 'handback', ...(Number.isInteger(st.wakes) && st.wakes > 0 ? { expectWakes: st.wakes } : {}) }); }; // verify r2 (H3): a key held in the page is let go BEFORE the handback (after it this viewer's input is refused); r6 A-F9: the count the button said
  // lane browser-resume B: "Hand back and continue…" — the note is TYPED in an app dialog, so while this view drives the keys
  // are first let go (held keys released in the page, the claim released: a dialog must never type into the page); Cancel
  // takes them back. The POST ends the takeover (cause `continue`), stashes the note + the tabs for the next turn and shows
  // a card — nothing is delivered now
  contBtn.onclick = async () => {
    if (st.noteOpen || contBtn.disabled) return;
    st.noteOpen = true;
    if (st.claimed) { releaseHeld(); st.claimed = false; st.pressed.clear(); ky.reset('release'); releaseKeyboard(winInfo.id); if (document.activeElement === kbd) kbd.blur(); kbd.value = ''; renderKbd(); keyboardChanged(); }
    const note = await showInputDialog({ title: t('Hand the browser back for the agent’s next turn'), label: t('A note for the agent (optional)'), placeholder: t('e.g. I logged in — continue from the cart'), confirmText: t('Hand back') });
    st.noteOpen = false;
    if (note === null || st.closed) { renderMode(); return; }
    contBtn.disabled = true;
    const r = await fetchJson(`/api/browser/session/${encodeURIComponent(sessionId)}/hand-back`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: curRef() || EPHEMERAL_REF, note: String(note) }) });
    contBtn.disabled = false;
    if (st.closed) return;
    // verify r2: the previous hand-back still waits for the agent's next turn — this view folds its button like a hand-back of its own
    if (r && r.code === 'already_handed_back') { st.resumedHere = false; st.handedBack = true; renderMode(); showToast(t('Already handed back — the agent reads it with its next turn'), { duration: 5000 }); return; }
    if (!r || r.error) { renderMode(); showToast(t('Could not hand the browser back: {why}', { why: String((r && r.error) || t('server unreachable')) }), { type: 'error', duration: 7000 }); return; }
    st.resumedHere = false; st.handedBack = true;
    showToast(t('Handed back — the agent reads your note and the tabs with its next turn (nothing is sent now)'), { duration: 5000 });
    renderMode();
  };
  winInfo.titleSpan?.addEventListener?.('click', (e) => { const r = row(); if (r && app.showBrowserProfilePicker) app.showBrowserProfilePicker(r, { x: e.clientX, y: e.clientY }); }, { signal: winInfo._listenerCtl?.signal });
  // INPUT FORWARDING — only while THIS viewer drives; every record is the
  // stream server's CDP shape built by src/browser-stream.js, coordinates
  // through the ONE viewport→device conversion (pointerAt). In Watch mode a
  // click is a hint, never forwarded (the bridge would refuse it typed anyway).
  const driving = () => st.mode === 'takeover' && st.mine;
  const sig = { signal: winInfo._listenerCtl?.signal };
  img.addEventListener('pointerdown', (e) => {
    if (touchDown(e)) { e.preventDefault(); return; } // lane S4: the pinch / pan / double tap (watch), a refused second finger (takeover)
    const p = pointerAt(e);
    if (!driving()) {
      const now = Date.now();
      if (now - st.lastHintAt > HINT_EVERY_MS) { st.lastHintAt = now; showToast(H ? (st.mode === 'takeover' ? t("You're browsing this in another window — press Continue here") : t('Press Continue browsing to use the page')) : t('Watch mode — the agent is driving; press Take over to send input'), { duration: 3500 }); }
      if (p) canvas.dataset.lastPointer = `${p.x},${p.y}`;
      return;
    }
    e.preventDefault(); focusSink(); // verify (2026-09-27): a press is NO copy gesture — a page's copy after a click reaches the chip only (the bridge names the gesture)
    try { img.setPointerCapture(e.pointerId); } catch { /* optional */ }
    st.buttonsDown++;
    // lane live-input: a double / triple click is counted here (a pointerdown carries no count) and a drag holds its button
    st.click = clickCountNext(st.click, { x: e.clientX, y: e.clientY, at: Date.now(), button: e.button }); st.heldButton = e.button;
    const rec = e.pointerType === 'touch' ? touchRecord({ kind: 'start', pt: p }) : mouseRecord({ kind: 'down', pt: p, button: e.button, modifiers: modifiersOf(e), clickCount: st.click.count });
    if (rec && sendInput(rec, true)) { ripple(p); st.youPt = p; renderYou(); }
  }, sig);
  img.addEventListener('pointermove', (e) => {
    if (touchMove(e)) { e.preventDefault(); return; } // lane S4
    if (!driving()) return;
    const now = Date.now();
    if (now - st.lastMoveAt < MOVE_EVERY_MS) return;
    st.lastMoveAt = now;
    const p = pointerAt(e); if (!p) return;
    const rec = e.pointerType === 'touch' ? (st.buttonsDown ? touchRecord({ kind: 'move', pt: p }) : null) : mouseRecord({ kind: 'move', pt: p, modifiers: modifiersOf(e), held: st.buttonsDown ? st.heldButton : null }); // lane live-input: a drag selects
    if (rec) sendInput(rec);
    st.youPt = p; renderYou();
  }, sig);
  img.addEventListener('pointerleave', () => { if (!st.buttonsDown) { st.youPt = null; renderYou(); } }, sig);
  const up = (e) => {
    if (touchUp(e)) return; // lane S4
    if (!driving()) return;
    const p = pointerAt(e);
    st.buttonsDown = Math.max(0, st.buttonsDown - 1);
    const rec = e.pointerType === 'touch' ? touchRecord({ kind: 'end', pt: p || { x: 0, y: 0 } }) : (p ? mouseRecord({ kind: 'up', pt: p, button: e.button, modifiers: modifiersOf(e), clickCount: st.click ? st.click.count : 1 }) : null);
    if (rec) sendInput(rec);
  };
  img.addEventListener('pointerup', up, sig);
  img.addEventListener('pointercancel', up, sig);
  img.addEventListener('contextmenu', (e) => { if (driving()) e.preventDefault(); }, sig);
  img.addEventListener('wheel', (e) => {
    if (!driving()) return;
    e.preventDefault();
    const p = pointerAt(e); if (!p) return;
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const rec = wheelRecord({ pt: p, deltaX: e.deltaX * k, deltaY: e.deltaY * k, modifiers: modifiersOf(e) });
    if (rec) sendInput(rec);
  }, { ...sig, passive: false });
  // ── lane J r2: THE KEYBOARD WHILE YOU DRIVE — document level, capture phase, bound to this window's AbortController ──
  // Every listener first asks "do I own the keyboard?" (the PURE ownership, re-asked; the client's ONE owner) and
  // does nothing otherwise — a view that does not drive leaves every key exactly where it was going.
  const capture = { capture: true, signal: winInfo._listenerCtl?.signal };
  const appMode = () => (app._commandMode && app._commandMode._cmdMode ? 'command' : null);
  const onDocKey = (e) => {
    if (H && e.target === addrInput) return; // BROWSE YOURSELF: the address row is typed in, never sent to the page
    // lane dialog-keys: a key the APP takes — typed into a dialog the user opened (its Enter may open the next one), or a
    // reserved chord / command mode — is his own act on the app: the opener evidence of a dialog opening right after. Read in
    // EVERY view before the owner test (each view judges the next dialog by its own record); a key the page gets never is
    if (st.claimed && e.type === 'keydown' && (ky.dialogHolds || keyRoute(e, { appMode: appMode() }).to === 'app')) ky.onAppKey(e);
    if (!iOwn()) { if (document.activeElement === kbd) { kbd.blur(); kbd.value = ''; } renderKbd(); return; }
    // verify r2 (H1) THE BELT: this view owns the keys while a text box outside it still holds the caret — a transition no
    // signal reported. The same explicit move as every transition (the caret to the sink, the words redrawn), and THIS key
    // reaches neither the box the user saw the caret in nor the page he did not see it go to.
    if (e.type !== 'keyup' && !st.copying && ky.caretOutside(document.activeElement)) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      st.strayKeys++; focusSink(); renderKbd(); keyboardChanged(); return;
    }
    const route = keyRoute(e, { appMode: appMode() });
    if (route.to === 'app') return;                                       // Ctrl+\ / Ctrl+Alt+←/→ — and command mode, once armed
    if (route.to === 'compose' || route.to === 'paste') { focusSink(); return; } // the IME composes in the sink / the browser raises `paste` there
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (e.type === 'keydown') {
      // lane live-input: a Mac viewer on a non-Mac browser — ⌘A/C/X/Z/⇧Z … reach the page as the Ctrl chords (PURE table)
      const k = macChord(e, { viewerMac: viewerIsMac(), remoteMac: isMacPlatform(st.remotePlatform) });
      const cc = copyChordOf(e);
      if (cc) armCopyAnswer(cc); // the page's own copy answers it (onPageCopied); the chord still goes to the page
      const rec = keyRecord({ kind: 'down', key: k.key, code: k.code, modifiers: modifiersOf(k), keyCode: k.keyCode });
      if (rec && k.dropText) delete rec.text;
      st.pressed.set(e.code || e.key, { key: k.key, code: k.code, keyCode: k.keyCode });
      sendInput(rec, !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key));
    } else if (e.type === 'keyup') {
      // lane live-input: a keyup reaches the page only after its keydown did (an IME's commit key — Enter / Space — would
      // otherwise arrive alone; a key held down before the takeover is released where it was pressed)
      const was = st.pressed.get(e.code || e.key);
      if (was) {
        st.pressed.delete(e.code || e.key);
        const k = macChord(e, { viewerMac: viewerIsMac(), remoteMac: isMacPlatform(st.remotePlatform) });
        sendInput(keyRecord({ kind: 'up', key: was.key, code: was.code, modifiers: modifiersOf(k), keyCode: was.keyCode }));
      }
    }
    focusSink();
  };
  document.addEventListener('keydown', onDocKey, capture);
  document.addEventListener('keyup', onDocKey, capture);
  document.addEventListener('keypress', onDocKey, capture);
  /** Text the user put in without keystrokes (a paste, a composition, dictation) → the page, as text: ONE `input_text`
   *  record per act (lane live-input — the bridge cuts it into the ≤ 3-unit chunks the browser accepts, in order with the
   *  keys around it); its receipt waits as long as the act's chunk count needs. The text itself is never shown or logged. */
  function typeText(text) {
    const r = inputTextRecord(text);
    if (!r.ok) {
      if (r.code === 'too_long') showToast(t('Not pasted into the page: {n} characters is more than one paste may carry ({max})', { n: r.length, max: r.max }), { type: 'warn' });
      else if (r.dropped) echo(false, t('not sent — a lone line break cannot be typed into the page (press Enter instead)'), { verbatim: true });
      return;
    }
    sendInput(r.record, true, { receipt: true, receiptMs: textReceiptMs(r.chunks) });
  }
  document.addEventListener('paste', (e) => {
    if (!iOwn() || (H && e.target === addrInput)) return;
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    typeText(e.clipboardData ? e.clipboardData.getData('text/plain') : '');
    focusSink();
  }, capture);
  // nothing is ever INSERTED into an editable element while the view owns the keyboard: the sink's own text is
  // forwarded (dictation, an emoji picker — anything that inserts without a key), every other target is refused
  document.addEventListener('beforeinput', (e) => {
    if (!iOwn() || (H && e.target === addrInput)) return;
    if (e.target === kbd) {
      if (e.inputType === 'insertCompositionText' || e.isComposing) return;      // compositionend forwards the result
      e.preventDefault();
      if (e.inputType === 'insertText' || e.inputType === 'insertReplacementText') typeText(e.data || '');
      return;
    }
    if (isEditable(e.target)) { e.preventDefault(); focusSink(); }
  }, capture);
  document.addEventListener('compositionstart', (e) => { if (iOwn() && e.target === kbd) st.composing = true; }, capture);
  document.addEventListener('compositionend', (e) => {
    if (e.target !== kbd) return;
    st.composing = false;
    const text = String(e.data || '');
    kbd.value = '';
    if (iOwn() && text) typeText(text);
  }, capture);
  kbd.addEventListener('input', () => { if (!st.composing) kbd.value = ''; }, sig);   // the sink never keeps text
  // lane takeover-keyboard (userW inc-mum339id-1zsb): THE PRESS decides a focus. A press OUTSIDE the view is remembered —
  // the focusin that follows on THAT text box (≤ USER_PRESS_MS; a touch tap re-stamped at its release) is the user's own
  // and YIELDS the keys to it; a press INSIDE the view ends a yield and re-claims (the view the user pressed drives the
  // keys — the last claim wins), the sink taking the focus back after the press's own default
  document.addEventListener('pointerdown', (e) => {
    const r = ky.onPointerDown(e);
    // verify r1: a press on the text box that ALREADY holds the caret (no focusin follows) yields right here
    if (r === 'noted') { if (st.claimed && !st.copying && ky.onPressFocused(document.activeElement) === 'yield') { releaseHeld(); renderKbd(); keyboardChanged(); } return; }
    if (r !== 'resumed' && r !== 'press-view') return;
    claimKeyboard(claimRec());
    if (r === 'resumed') { renderKbd(); keyboardChanged(); }
    // verify r1 (K3): …and the sink takes the caret from a text box OUTSIDE the view that kept it (a tab / a title bar
    // press does not move the focus) — the user pressed the browser, the composer's caret is not his any more
    setTimeout(() => { const a = document.activeElement; if (!st.closed && !st.copying && iOwn() && a !== kbd && !(isEditable(a) && root.contains(a))) focusSink(); }, 0);
  }, { capture: true, passive: true, signal: winInfo._listenerCtl?.signal }); // §59b: a document pointerdown is capture-phase (it never cancels the press)
  document.addEventListener('pointerup', (e) => { ky.onPointerUp(e); }, { capture: true, passive: true, signal: winInfo._listenerCtl?.signal });
  /** verify r1 (K4): a yield RELEASES in the page every key still held there (PURE heldReleases, last pressed first) — its
   *  keyup would now reach the text box the user pressed and the page would hold the key down for good (measured: Shift
   *  held across a press on the composer — the page saw the keydown, never the keyup). */
  function releaseHeld() { for (const r of heldReleases([...st.pressed.values()])) sendInput(keyRecord(r)); st.pressed.clear(); }
  // verify r3 (r2's held): yielded, the focus LEAVES a text box for nothing that takes keys (a press on the message list
  // focuses its container — or <body>, with no focusin) — the chip re-reads where the keys are
  document.addEventListener('focusout', () => { if (st.claimed && ky.yielded) setTimeout(() => { if (!st.closed) renderKbd(); }, 0); }, capture);
  document.addEventListener('focusin', (e) => {
    if (!st.claimed || st.copying || (H && e.target === addrInput)) return; // lane live-input: the copy's own scratch textarea is not a place you typed into; BROWSE YOURSELF: nor his address row (his own, never a reclaim nor a yield)
    // lane takeover-keyboard: the user's OWN press on this text box (PURE userPressFocus → focusVerdict, in keyboard-yield.js)
    // YIELDS the keys to it — every driving view yields (per claim), the takeover continues; a focus NOBODY pressed for
    // (an attach, a reconnect, a message arriving — lane J r2's password case) is reclaimed by THE owner, silently as before
    const v = ky.onFocusIn(e);
    if (v === 'yield') { releaseHeld(); renderKbd(); keyboardChanged(); return; }
    if (v !== 'reclaim' || !iOwn()) { if (ky.yielded) renderKbd(); return; } // yielded: the words follow a new text box
    st.reclaims++;
    // verify r2 (Q1): the reclaim followed the user's OWN press on something else (a button of his that focused this box) —
    // still reclaimed (the password guard), but SAID, rate-limited, with advice that works: a press on the box itself yields.
    // verify r3 (F2): judged when the reclaim runs — a box already gone (a copy fallback's scratch textarea) is never announced
    const taken = e.target;
    queueMicrotask(() => { const say = ky.takeCue(taken); focusSink(); if (say) { st.cues++; showToast(t('Typing still goes to the browser — click the text box itself to type there'), { duration: 3500 }); } }); // (read before the sink's own focusin re-judges)
  }, capture);
  // lane live-input (the tracer's leftover of H4): while the view drives, a click on the bar, a side pane or empty space
  // takes focus off the sink — the next key then reached no text field, so an IME never started (its first letter went
  // to the page as a Latin key). The sink takes the focus back unless it went to a text field (that one is reclaimed
  // by the focusin rule above — or, pressed by the user, yielded to) or the window itself lost it.
  kbd.addEventListener('blur', () => {
    if (st.copying || !iOwn()) return;
    setTimeout(() => {
      if (st.closed || st.copying || !iOwn()) return;
      const a = document.activeElement;
      // verify r3 (F1): the sink leaves alone a text box (the focusin rule's) and a CHOICE control — a <select> whose list
      // the user's own press just opened (taking the focus closed the list: every dropdown of the app was dead while driving)
      const v = sinkBlurVerdict(a, { sink: kbd, root, body: document.body });
      if (v === 'keep') return;
      // verify r2 (H5): the focus LEFT this document for a FRAME (a Web view, a plugin, a preview): a script's focus there
      // is taken back like any other (measured: a cross-origin page focusing itself every 700 ms got none of "pwsecret"),
      // and so is the user's own press INTO a frame — the press is the frame's document's, so nothing here can tell it
      // from the frame's own script (a page that focuses itself when hovered would take the keys). Said, rate-limited,
      // with the one way that works (measured on cd867c05: a real press in a frame's field — reclaimed, "wv" to the page,
      // nothing said)
      const frame = v === 'frame';
      focusSink();
      if (frame) {
        st.frameReclaims++;
        const now = Date.now();
        if (!st.lastFrameCueAt || now - st.lastFrameCueAt >= RECLAIM_CUE_MS) { st.lastFrameCueAt = now; showToast(t('Typing still goes to the browser — to type in another page, hand back first'), { duration: 3500 }); }
      } // (verify r3 F4's cue here is retired by lane dialog-keys: a dialog the user opened TAKES the keys; one that opens by itself is said at its open)
    }, 0);
  }, sig);
  // ── lane dialog-keys (the owner's "ok", 2026-09-30, on takeover-keyboard r4's proposal): A DIALOG YOUR OWN ACT OPENED TAKES
  // THE KEYS. Every app modal announces its open (utils.js announceModal — createModalShell, app._showDialog) in the opening
  // act's own task; the yield judges WHO opened it (PURE dialogOpener over the user's last TRUSTED act → dialogVerdict):
  //   'take'    — his own fresh press (re-stamped at its release) or a key the app took: the dialog gets Enter, Escape, Tab
  //               and typing, the takeover goes on (the agent stays refused) and this view owns NO keys while it holds
  //               (keyboardOwnership's `dialog`: onDocKey / paste / beforeinput stand aside, the sink's blur takes nothing
  //               back, the focusin rule allows); the keys held in the page are let go (the transition's `release`); a dialog
  //               that focuses nothing itself gets its first text box, else its overlay, a tick later — never a button (an
  //               Enter it did not choose would act for him);
  //   'reclaim' — it opened BY ITSELF while the keys are the page's (a broadcast, a timer, a notification): the old rule — its
  //               own focus is taken back by the rules above (the password guard) — said once (PURE dialogReclaimCue);
  // ONE MutationObserver, armed only while a dialog holds (the body's children + each held overlay's class), sees it close —
  // answered, dismissed, a backdrop press, a script's removal alike: no orphan hold — and PURE dialogReturn gives the keys back
  // where they were: the sink (the view owned them), the text box they were yielded to, the older dialog's field.
  function watchDialogs() {
    if (!dialogMo) return;
    dialogMo.disconnect();
    if (st.closed || !ky.dialogHolds) return;
    dialogMo.observe(document.body, { childList: true });
    for (const ov of ky.dialogOverlays()) dialogMo.observe(ov, { attributes: true, attributeFilter: ['class', 'hidden'] });
  }
  /** a held dialog's OWN field gets the keys: its first visible text box, else its overlay (tabIndex -1 when it has none) —
   *  never a button (an Enter it did not choose would act for him); verify r1: ONE door for the take's focus tick and the
   *  'older' return */
  function focusDialog(ov) {
    const tgt = dialogFocusTarget(ov);
    try { if (tgt === ov && (typeof ov.hasAttribute === 'function' ? !ov.hasAttribute('tabindex') : ov.tabIndex == null)) ov.tabIndex = -1; tgt.focus({ preventScroll: true }); } catch { /* gone */ }
  }
  function settleDialogs() {
    const r = ky.settleDialogs({ active: document.activeElement }); // verify r1: the keys fallen to <body> while a dialog holds go back into it
    if (!r) return;
    watchDialogs();
    st.dialogReturns++;
    if (r.to === 'sink') { if (iOwn() && !st.copying) focusSink(); }
    else if (r.to === 'older' && r.el) focusDialog(r.el); // verify r1: the older dialog still holds but its element went (re-rendered, or in a dialog a script removed): its own field
    else if ((r.to === 'back' || r.to === 'yield') && r.el) { try { r.el.focus({ preventScroll: true }); } catch { /* gone */ } }
    syncKeyboard(); // the chip says where the keys are now (on change only), the composers' line re-reads
  }
  document.addEventListener(MODAL_OPEN_EVENT, (e) => {
    if (!st.claimed || st.closed) return;
    settleDialogs(); // a dialog replaced by its successor in one task (createModalShell's id) gives its keys back first
    const ov = e && e.detail ? e.detail.overlay : null;
    const v = ky.onDialogOpen(ov, { active: document.activeElement });
    if (v === 'take') {
      st.dialogTakes++;
      watchDialogs();
      syncKeyboard(); // the transition: the chip redrawn at once, the keys held in the page let go
      // (scheduled inside the announcement — before the dialog's own `setTimeout(focus)` — so the dialog's own choice wins)
      setTimeout(() => {
        if (st.closed || !ky.dialogHolds || !ky.dialogOverlays().includes(ov)) return;
        const a = document.activeElement;
        if (a && a !== document.body && typeof ov.contains === 'function' && ov.contains(a)) return;
        focusDialog(ov);
      }, 0);
      return;
    }
    if (v === 'reclaim' && iOwn() && ky.dialogCue(v)) { st.dialogCues++; showToast(t('Typing still goes to the browser — click the dialog’s buttons to answer it'), { duration: 3500 }); }
  }, { signal: winInfo._listenerCtl?.signal });
  // ── lane live-input: COPY OUT — what the page copied reaches YOUR clipboard ──
  /** A copy / cut chord went to the page: its copy answers within COPY_ANSWER_MS (else the echo says nothing came). */
  function armCopyAnswer(kind) {
    st.copyAt = Date.now();
    if (st.copyTimer) clearTimeout(st.copyTimer);
    st.copyTimer = setTimeout(() => { st.copyTimer = null; if (st.mode === 'takeover' && st.mine) echo(true, t('nothing was copied — the page gave no text (nothing selected, a password field, or a frame from another site)'), { verbatim: true }); }, COPY_ANSWER_MS);
    st.copyKind = kind;
  }
  /** The bridge's `clipboard` record: the text the page copied (its own copy event, read in an isolated world), which the
   *  bridge delivers only on a gesture of OURS it forwarded (`m.gesture`: 'chord' | 'click'). PURE copyWriteVerdict
   *  (verify, 2026-09-27 — a page's synthetic copy was written to the clipboard on a secure page with nothing pressed,
   *  and after any click on plain http): ONLY a copy answering the user's own copy chord, inside its window, is written by
   *  itself — the Clipboard API on a secure page, else the gesture copy on plain http (the chord left the page active);
   *  a click's copy (the page's own Copy button) and anything else is the chip — one explicit click, never a silent write. */
  function onPageCopied(m) {
    if (!(st.mode === 'takeover' && st.mine)) return;
    if (st.copyTimer) { clearTimeout(st.copyTimer); st.copyTimer = null; }
    const text = typeof m.text === 'string' ? m.text : '';
    if (!text) { if (Date.now() - st.copyAt < COPY_ANSWER_MS * 2) echo(true, t('nothing was copied — no text is selected in the page'), { verbatim: true }); return; }
    const secure = pageIsSecure();
    const cb = typeof navigator !== 'undefined' ? navigator.clipboard : null;
    const chordAge = st.copyAt ? Date.now() - st.copyAt : null;
    const how = copyWriteVerdict({ gesture: m.gesture, chordAge, secure, canWrite: !!(cb && typeof cb.writeText === 'function'), windowMs: GESTURE_WINDOW_MS });
    if (how !== 'chip') st.copyAt = 0; // the chord is spent on this copy (single-use here too)
    const said = () => echo(true, m.truncated ? t('copied the first {n} characters to your clipboard', { n: text.length }) : t('copied to your clipboard'), { verbatim: true });
    if (how === 'api') { let p = null; try { p = cb.writeText(text); } catch { showCopied(text); return; } Promise.resolve(p).then(() => { hideCopied(); said(); }, () => showCopied(text)); return; }
    if (how === 'gesture' && copyNow(text)) { hideCopied(); said(); return; }
    showCopied(text);
  }
  /** copyViaSelection moves the focus to a scratch textarea and back — the focus rules above must not read that as leaving. */
  function copyNow(text) { st.copying = true; try { return copyViaSelection(text); } finally { st.copying = false; focusSink(); } }
  function showCopied(text) { st.copied = String(text); copyChip.style.display = ''; echo(true, t('copied in the page — use the button on the bar to put it on your clipboard'), { verbatim: true }); } // builder r2: never a quote of the chip (it quoted half of it)
  function hideCopied() { st.copied = null; copyChip.style.display = 'none'; }
  copyChip.onclick = () => {
    if (st.copied == null) return;
    if (copyNow(st.copied)) { showToast(t('Copied to your clipboard')); hideCopied(); }
    else showToast(t('Could not copy — select the text in the page and press Ctrl+C again'), { type: 'error' });
  };
  const onVis = () => send({ type: 'config', maxFps: document.hidden ? HIDDEN_FPS : MAX_FPS_DEFAULT });
  document.addEventListener('visibilitychange', onVis, { signal: winInfo._listenerCtl?.signal });

  /** Viewport px → the page's CSS px (null outside the drawn picture). */
  function pointerAt(ev) {
    const g = geometry();
    if (!g) return null;
    return pointerToDevice({ clientX: ev.clientX, clientY: ev.clientY, elRect: rectOf(img), frameW: g.cssW, frameH: g.cssH, picW: g.picW, picH: g.picH, align: LIVE_ALIGN });
  }
  img.addEventListener('load', () => { renderCursor(); renderYou(); }, sig); // lane J: a picture of a new size re-places the agent cursor (and the user's)
  function dispose() {
    st.closed = true;
    if (st.claimed) releaseHeld(); // verify r2 (H3): a key held in the page is let go before the socket closes
    releaseKeyboard(winInfo.id); st.claimed = false; // lane J r2: a closed view never owns the keyboard (its listeners die with the window's AbortController)
    ky.reset('release'); keyboardChanged(); // lane takeover-keyboard: …nor holds a yield (the composers' line re-reads)
    if (dialogMo) dialogMo.disconnect(); // lane dialog-keys: …nor watches a dialog
    if (st.echoTimer) { clearTimeout(st.echoTimer); st.echoTimer = null; }
    if (st.pictureTimer) { clearInterval(st.pictureTimer); st.pictureTimer = null; } // lane S4
    if (st.fitTimer) { clearTimeout(st.fitTimer); st.fitTimer = null; }
    if (st.receiptTimer) { clearInterval(st.receiptTimer); st.receiptTimer = null; } // lane S2
    if (foldRaf) { cancelAnimationFrame(foldRaf); foldRaf = 0; }
    try { app.wm.setOwnerBadge?.(winInfo.id, null); } catch { /* window gone */ }
    if (st.confirmTimer) { clearInterval(st.confirmTimer); st.confirmTimer = null; }
    if (st.reconnectTimer) clearTimeout(st.reconnectTimer);
    try { st.ws?.close(); } catch { /* */ }
    st.ws = null;
    try { app.ws?.offGlobal?.(onGlobal); } catch { /* optional */ }
  }
  refreshSet();
  /** BROWSE YOURSELF: a new press on an existing window — its new token, attach again (the window takes his tab back). */
  function rejoin({ key = null, fresh = null } = {}) {
    if (!H || st.closed) return;
    if (key) H.key = String(key);
    H.fresh = fresh || null;
    if (H.ended) { H.ended = null; st.stopped = false; st.error = null; reBtn.textContent = t('Reconnect'); renderMode(); }
    st.reconnects = 0; connect();
  }
  return {
    connect, dispose, switchTo, pointerAt, rejoin,
    reconnect: () => { if (st.closed) return; st.reconnects = 0; connect(); }, // lane H: the auto-bind's "its browser holds again" (and the bar's Reconnect button's twin)
    isHuman: () => !!H, // BROWSE YOURSELF (B-6ae8): the user's own browsing window (no session: no bind row)
    toggleBind, bindLabel, isBound, // P7 (§4.6): the one act behind the bar button, the title-bar button and the window menu row
    refreshSet, openCapPopover, // MULTIVIEW: the suite re-reads the list / opens the chip
    el: () => root, img: () => img,
    ws: () => st.ws, // MULTIVIEW: a suite proves a switch of the OTHER pane / a new browser never rebuilt this socket
    drawn: () => { const g = geometry(); return drawnRect(rectOf(img), g ? g.picW : 0, g ? g.picH : 0, LIVE_ALIGN); },
    kbd: () => kbd, ownsKeyboard: () => !!(st.claimed && iOwn()), // lane J r2: the sink + the ownership fact (the suite types against both)
    geometry, frameClaim: () => (st.meta ? { ...st.meta } : null), pageReading: () => (st.page ? { ...st.page } : null), // lane J: {picW, picH, cssW, cssH, source}; the metadata's CLAIM and the page's own reading (the suite's control replays both)
    send, // P3: the suite drives the control verbs through the real socket
    state: () => ({ sessionId, profileId: profileId || null, human: !!H, tabRow: { shown: tabRow.style.display !== 'none', rows: st.tabRow ? st.tabRow.rows.map((r) => ({ targetId: r.targetId, owner: r.owner, active: r.active, canSwitch: r.canSwitch, canClose: r.canClose, title: r.title, mark: r.mark })) : [], folded: st.tabFolded.slice(), quit: tabRowQuit.style.display !== 'none', quitText: tabRowQuit.textContent, owners: { ...st.tabOwners }, inFlight: st.tabActs.size, error: st.tabError, quitAsked: st.quitAsked }, // lane browser-resume C
      humanKey: H ? H.key : null, humanEnded: H ? H.ended : null, endLine: H ? endLine.textContent : null, shareLine: H && shareLine.style.display !== 'none' ? shareText.textContent : null, closeText: H ? closeBtn.textContent : null, quitText: H ? quitBtn.textContent : null, address: H ? addrInput.value : null, addrShown: addrRow.style.display !== 'none', takeText: takeBtn.style.display === 'none' ? null : takeBtn.textContent, kbdBtn: kbdBtn.style.display !== 'none', profileRef: st.profileRef, connected: st.connected, stopped: !!st.stopped, frames: st.frames, frameW: st.frameW, frameH: st.frameH, viewers: st.viewers, mode: st.mode, target: st.target, url: st.url, tabs: st.tabs.slice(), console: st.console.length, attachments: st.attachments.slice(), running: st.running, lastCommand: st.lastCommand, error: st.error, lastStatus: st.lastStatus, sidePane: st.sidePane,
      backend: backendBtn.style.display !== 'none' ? backendBtn.textContent : backendLabelEl.style.display !== 'none' ? backendLabelEl.textContent : null, backendIsButton: backendBtn.style.display !== 'none', blockedShown: blockedBar.style.display !== 'none', // P4 + the rebuilt dialog: the name, and whether it opens the dialog
      trace: timeline.state(), traceBtn: traceBtn.textContent, recording: recEl.textContent, recordingOn: recEl.classList.contains('on'), // P5
      bound: isBound(), bindText: bindLabel(), owners: dotsFor(st.target && st.target.profileId ? st.target.profileId : null).map((d) => ({ sessionId: d.sessionId, name: d.name, color: d.color })), // P7
      you: st.you, mine: st.mine, holder: st.holder, modeSince: st.modeSince, modeCause: st.modeCause, cursor: st.cursor ? { ...st.cursor } : null, cursorShown: cursorEl.style.display !== 'none', confirmations: [...st.confirmations.values()].map((c) => ({ ...c })), badge: modeBadge.textContent, badgeFull: modeBadge.title,
      // lane J r2
      ownsKeyboard: !!(st.claimed && iOwn()), kbdChip: kbdChip.style.display !== 'none', sent: st.sent, caretMoves: st.caretMoves, strayKeys: st.strayKeys, cues: st.cues, dialogCues: st.dialogCues, frameReclaims: st.frameReclaims, homeless: st.homeless, // verify r2 (H1 / Q1 / H5)
      dialogHeld: !!(st.claimed && ky.dialogHolds), dialogTakes: st.dialogTakes, dialogReturns: st.dialogReturns, dialogWhy: ky.dialogWhy, // lane dialog-keys
      kbdYielded: !!(st.claimed && yieldedKeyboard()), yieldKind: ky.kind, yieldWhere: ky.whereNow(document.activeElement), // verify r3: where the yielded keys are NOW // lane takeover-keyboard: the keys given to a text box the user pressed (the takeover continues)
      dialog: st.dialog ? { ...st.dialog } : null, dialogShown: dialogBar.style.display !== 'none', dialogText: dialogBar.textContent, dialogAnswering: !!st.dialogAnswering, // lane browser-stuck
      remotePlatform: st.remotePlatform, pressed: [...st.pressed.keys()], copyChip: copyChip.style.display === 'none' ? null : copyChip.textContent, copiedLength: st.copied == null ? null : st.copied.length, recChip: { state: recEl.dataset.state || null, text: recEl.textContent, title: recEl.title }, fitTitle: fitChip.style.display === 'none' ? null : fitChip.title, // lane live-input
      // lane S2: the fact this view follows, how often it moved, the receipts (pending / delivered / failed / failing) and the chip's words
      fact: st.fact ? { digest: st.fact.digest, using: { ...(st.fact.using || {}) } } : null, followed: st.followed, receipts: { pending: st.receipts.pending.size, delivered: st.receipts.delivered, failed: st.receipts.failed, failing: st.receipts.failing ? { ...st.receipts.failing } : null }, kbdText: kbdText.textContent, echo: echoEl.style.display === 'none' ? null : echoEl.textContent, ripples: st.ripples.map((r) => ({ ...r })), youPt: st.youPt ? { ...st.youPt } : null, youShown: youEl.style.display !== 'none', reclaims: st.reclaims, align: LIVE_ALIGN,
      // MULTIVIEW (design-browser-multiview §2 / D3 / D4) — the STRIP's folds are `stripFolded` (`folded` is lane I's bar)
      currentRef: curRef(), rows: st.rows.map((r) => ({ ...r, text: rowLabel(r), name: rowName(r) })), order: st.order.slice(), stripFolded: st.folded.slice(), stripShown: strip.style.display !== 'none', capText: capBtn.textContent, capFull: capBtn.classList.contains('full'), machineFull: capBtn.classList.contains('machine-full'), sessionEnded: st.sessionEnded, released: !!(st.error && st.hollow), notStarted: !!(st.error && st.error.browserState === 'not-started'), statusText: statusEl ? statusEl.textContent : null,
      bar: fold.last(), folded: fold.folded(), foldedRows: foldedRows().map((r) => ({ label: r.label, disabled: !!r.disabled })), // lane I: the census re-runs barLayout on `bar`
      // lane S4: the page's size vs this pane, the chip, the picture clocks, the pinch
      fit: st.fit ? { ...st.fit } : null, fitSent: st.fitSent ? { ...st.fitSent } : null, fitChip: fitChip.style.display === 'none' ? null : { kind: fitChip.dataset.kind, text: fitChip.textContent }, pane: paneNow(),
      picture: st.picture, pictureStale: st.pictureStale, zoom: { ...st.zoom },
      // lane browser-resume B: the Resume offered (its words on the reconnect button), one in flight, the hand-back offered
      resumeOffer: st.resumeOffer, resumeText: reBtn.dataset.mode === 'resume' && reBtn.style.display !== 'none' ? reBtn.textContent : null, resuming: st.resuming, resumedHere: st.resumedHere, contShown: contBtn.style.display !== 'none', contText: contBtn.textContent, noteOpen: st.noteOpen }),
    layoutBar: () => fold.layoutNow(), // lane I: the census asks for the verdict NOW (never waiting a frame)
    reportFit, setZoom, // lane S4: the suite re-reports the pane / sets a zoom through the view's own path
  };
}


// ── MULTIVIEW D3 (docs/design-browser-multiview.zh.md §0.1): N Agent browser windows per session, ONE strip ──
// A popped-out window is NOT a new window type: it is another `browser-live`
// window of the same session (its own selection, the same strip). The MAIN one
// is the deterministic `win-blive-<session>` when it is open, else the oldest
// still open — so closing the main one leaves the next one as the main one,
// never an orphan state.
/** The other live window of `sessionId` a fold-back lands in (the main one), else null. */
export function otherLiveWindow(app, sessionId, excludeId = null) {
  if (!sessionId) return null; // BROWSE YOURSELF: a browsing window of the user's has no conversation — nothing to fold into
  const wins = [...(app?.wm?.windows?.values?.() || [])].filter((w) => w && w.type === 'browser-live' && w._browserLive && w.id !== excludeId && (() => { try { return w._browserLive.state().sessionId === sessionId; } catch { return false; } })());
  return wins.find((w) => w.id === 'win-blive-' + sessionId) || wins[0] || null;
}
/**
 * lane P verify (finding 3): hand THIS view's controls to `toL`'s view of the same browser before the window
 * closes — wait for `toL`'s hello on `ref` (its viewer id), send `pass`, wait until it drives. Never throws;
 * false on a timeout (the caller keeps the window open: closing it would hand the browser back to the agent).
 */
export async function passControlTo(fromL, toL, ref, { timeoutMs = 8000 } = {}) {
  const t0 = Date.now();
  const nap = () => new Promise((r) => setTimeout(r, 50));
  const onRef = () => { const s = toL.state(); return !!(s.target && s.you !== null && s.you !== undefined && (!ref || s.currentRef === ref)); };
  while (!onRef() && Date.now() - t0 < timeoutMs) await nap();
  if (!onRef()) return false;
  fromL.send({ type: 'pass', to: toL.state().you });
  while (!(toL.state().mine && toL.state().mode === 'takeover') && Date.now() - t0 < timeoutMs) await nap();
  return !!(toL.state().mine && toL.state().mode === 'takeover');
}
/**
 * FOLD BACK: close `win` and let the other window (`into`, else the main one)
 * show what `win` showed. The other window keeps the browser the user is
 * DRIVING there (a takeover is never taken away) — the folded one stays one
 * click away in its strip. lane P verify (finding 3): when the user DRIVES the
 * folded window, its control moves WITH it (a `pass` to the other window's
 * view) before it closes — a fold-back never hands the browser back to the
 * agent, files nothing, announces nothing; driving in BOTH windows is said and
 * refused (one of the two takeovers would be lost). Resolves whether it folded.
 */
export async function foldBackLive(app, win, into = null) {
  const L = win && win._browserLive;
  if (!L) return false;
  const st = L.state();
  const target = into && into._browserLive ? into : otherLiveWindow(app, st.sessionId, win.id);
  if (!target || !target._browserLive) { showToast(t('There is no other Agent browser window of this session to fold into'), { type: 'warn' }); return false; }
  const TL = target._browserLive;
  const ts = TL.state();
  const ref = st.currentRef || null;
  const carry = st.mode === 'takeover' && st.mine;
  const targetDrives = ts.mode === 'takeover' && ts.mine;
  if (ref && ts.currentRef !== ref) {
    if (targetDrives && carry) { showToast(t('You are driving in both windows — hand one back before folding them together'), { type: 'warn', duration: 5000 }); return false; }
    if (targetDrives) showToast(t('Folded back — the other window keeps the browser you are driving; this one is in its strip'), { duration: 4500 });
    else TL.switchTo(ref);
  }
  if (carry) {
    const passed = await passControlTo(L, TL, ref);
    if (!passed) { showToast(t('Could not hand your control to the other window — this window stays open'), { type: 'warn', duration: 5000 }); return false; }
  }
  try { app.wm.closeWindow(win.id); } catch { /* gone */ }
  try { app.wm.revealWindow(target.id); } catch { /* gone */ } // the window the fold named — its own tab, even when it hosts a group
  if (carry) showToast(t('Folded back — you are still driving this browser'), { duration: 3000 });
  return true;
}
/** D4: set (1..6) or clear (null) THIS conversation's browser limit — the chip's stepper and Session Properties share it. */
export function setBrowserCap(sessionId, cap) {
  return fetchJson('/api/browser/cap', { method: 'POST', body: JSON.stringify({ sessionId, cap: cap === null || cap === undefined ? null : Number(cap) }), headers: { 'Content-Type': 'application/json' } });
}
// ── the title bar's own menu (reachable from the tab and the phone's long-press) carries the window's two acts:
//    P7 (§4.6) bind / unbind, and MULTIVIEW D3 "Fold back into the Agent browser window" — only while another live
//    window of the same session is open. Self-contained so test-contributions replays it (closed over:
//    registerMenuItem, t, otherLiveWindow, foldBackLive).
export function registerLiveViewMenus() {
  // lane I: bind offered only while UNBOUND — a bound pane's menu already carries the chain's own "Unsplit" (the same unbindSplit), and two words for one act was the audit's D7
  registerMenuItem({ menu: 'window', group: '1_window', order: 35, id: 'window/browser-bind', kind: 'bind', when: (c) => !!(c.win && c.win.type === 'browser-live' && c.win._browserLive && !c.win._browserLive.isBound()) && !c.win._browserLive.isHuman?.(), label: (c) => c.win._browserLive.bindLabel(), run: (c) => { c.win._browserLive.toggleBind(); } }); // BROWSE YOURSELF: his own window has no session to snap beside
  registerMenuItem({ menu: 'window', group: '1_window', order: 36, id: 'window/browser-foldback', kind: 'foldback',
    when: (c) => { try { return !!(c.win && c.win.type === 'browser-live' && c.win._browserLive && otherLiveWindow(c.app, c.win._browserLive.state().sessionId, c.win.id)); } catch { return false; } },
    label: () => t('Fold back into the Agent browser window'), run: (c) => { foldBackLive(c.app, c.win); } });
}
registerLiveViewMenus(); // end registerLiveViewMenus

// ── P7 (§4.6): AUTO-BIND — a session's browser started (a NEW lease in the digest) and its window is open here ⇒ the live view is BORN inside that chain ──
// Lane H (2026-09-25): the digest's `leases` are the HOLDER rows (browser-profiles.holderRows) — a conversation's managed
// EPHEMERAL browser is one while it runs (`ephemeral: true`), so its start is a NEW row exactly like an attach, and the view
// opens on THAT browser (EPHEMERAL_REF — never the session's default pane). A sub-agent's ephemeral (`child`) is not its
// session's pane (the live view streams the session's own pairs) and is never auto-opened.
export function autoBindLiveViews(app, prev, digest) {
  if (!prev || !digest || !Array.isArray(digest.leases)) return [];             // the first digest is a snapshot, not an event
  if (app.settings?.get('browser.autoBindLiveView') === false) return [];
  if (app.isMobile) return autoOpenOnPhone(app, prev, digest);                   // lane S4: the phone opens it too — full screen, one tap back
  const before = new Set((prev.leases || []).map((l) => l && `${l.profileId}|${l.sessionId}`));
  const opened = [];
  for (const l of digest.leases) {
    if (!l || !l.sessionId || !l.profileId || l.child || before.has(`${l.profileId}|${l.sessionId}`)) continue;
    const host = sessionWindowFor(app, l.sessionId);
    if (!host || host._hiddenByDesktop || host.isMinimized) continue;           // "its chat window is open" = on the desktop you are looking at
    const existing = [...app.wm.windows.values()].find((w) => w.type === 'browser-live' && w._browserLive && w._browserLive.state().sessionId === l.sessionId);
    // lane H: the session's view is already here — greyed when its browser stopped (an ephemeral that idled out is
    // refused `browser_stopped`, never relaunched by a view); the browser holding again ⇒ that view reconnects
    if (existing) { try { if (!existing._browserLive.state().connected) existing._browserLive.reconnect(); } catch { /* window going */ } continue; }
    const syncId = 'win-blive-' + l.sessionId;                                   // deterministic: two clients open ONE window, layout-sync sees the same id
    if (app.wm.windows.has(syncId)) continue;
    // MULTIVIEW D5 (a)/(b): beside the chat only while the chat is NOT yet in a split (one pane ⇒ chat | browser);
    // a chat already split gets the browser as a quiet TAB (browser side, else its own) — nothing on screen moves
    const place = livePlacement(host._tabChain, host.id, (x) => app.wm._paneFacts?.(x) || {});
    const intoChain = place.mode === 'split' ? { hostId: host.id, split: true, side: 'right' } : { hostId: host.id, quiet: true, side: place.side };
    const w = openBrowserLive(app, { sessionId: l.sessionId, profileId: l.ephemeral ? EPHEMERAL_REF : l.profileId, syncId, intoChain });
    if (w) opened.push(w.id);
  }
  return opened;
}
/**
 * lane S4 (naive study 2 — "助手开始浏览时实况窗口不会自己弹出来", the phone): the PHONE auto-opens the live view as the
 * desktop does — the same NEW holder row, the same deterministic `win-blive-<session>` (two clients converge on one
 * window), born in the chat's chain as its split partner (the model the desktop keeps; ≤768 px shows ONE pane, the
 * .183 rule) — but only when that conversation's window is the one ON SCREEN (the phone's analogue of "open on the
 * desktop you are looking at": a phone never jumps away from another conversation). The live view is focused (full
 * screen) and a toast offers "Back to the chat" — the switcher lists both. A view that already exists is brought
 * forward (and reconnected when it is not connected).
 */
export function autoOpenOnPhone(app, prev, digest) {
  const before = new Set((prev.leases || []).map((l) => l && `${l.profileId}|${l.sessionId}`));
  const opened = [];
  for (const l of digest.leases) {
    if (!l || !l.sessionId || !l.profileId || l.child || before.has(`${l.profileId}|${l.sessionId}`)) continue;
    const host = sessionWindowFor(app, l.sessionId);
    if (!host || host._hiddenByDesktop || host.isMinimized) continue;
    const active = app.wm.activeWindowId;
    const onScreen = active === host.id || !!(host._tabChain && active && host._tabChain.tabs && host._tabChain.tabs.includes(active) && app.wm.windows.get(active)?.type !== 'browser-live');
    if (!onScreen) continue;                                                     // another conversation is on screen: never jump away from it
    const back = () => { try { app.goToWinId?.(host.id); } catch { /* window gone */ } }; // goToWinId IS the door (§62)
    const toast = () => showToast(t('The agent opened its browser — it is shown here'), { duration: 6000, action: { label: t('Back to the chat'), run: back } });
    const existing = [...app.wm.windows.values()].find((w) => w.type === 'browser-live' && w._browserLive && w._browserLive.state().sessionId === l.sessionId);
    if (existing) {
      try { if (!existing._browserLive.state().connected) existing._browserLive.reconnect(); } catch { /* window going */ }
      app.goToWinId?.(existing.id);
      toast(); opened.push(existing.id); continue;
    }
    const syncId = 'win-blive-' + l.sessionId;
    if (app.wm.windows.has(syncId)) continue;
    const w = openBrowserLive(app, { sessionId: l.sessionId, profileId: l.ephemeral ? EPHEMERAL_REF : l.profileId, syncId, intoChain: { hostId: host.id, split: true, side: 'right' } });
    if (w) { app.goToWinId?.(w.id); toast(); opened.push(w.id); }
  }
  return opened;
}
export function installBrowserLive(App) {
  App.prototype.onBrowserDigestChanged = function (prev, digest) { return autoBindLiveViews(this, prev, digest); };
  /** lane J r2: THE mediator question every focus-into-a-text-box path asks — true while a live view on this
   *  client drives the agent's browser (src/lib/keyboard-owner.js is the one registry). */
  App.prototype.takeoverOwnsKeyboard = function () { return keyboardOwned(); };
  // MULTIVIEW D3: the icon-merge drop between two live views of one session folds back (tab-group.js _mergeDrop asks here)
  App.prototype.foldBackLive = function (win, into) { return foldBackLive(this, win, into); };
  // BROWSE YOURSELF (B-6ae8): the button (the Agent browser panel's row, the switch dialog's "Open it yourself") and the window
  App.prototype.browseYourself = function (profileId, opts) { return browseYourself(this, profileId, opts || {}); };
  App.prototype.openBrowserHuman = function (opts) { return openBrowserHuman(this, opts || {}); };
}

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) ── one window per (session, pane); N windows = N viewers on ONE upstream
registerWindowType({
  type: 'browser-live', label: 'Agent browser (live)',
  icon: UI_ICONS.browserLive, // the ONE agent-browser glyph (icons.js; design-browser-faces direction B)
  // BROWSE YOURSELF (B-6ae8): `human:true` replays HIS own browsing window (no token: the keeper decides who holds his tab; no apostrophe here: test-window-types parses this literal string-aware)
  action: 'openBrowserLive', replay: (app, spec, { syncId } = {}) => (spec.human ? app.openBrowserHuman({ profileId: spec.profileId, syncId }) : app.openBrowserLive({ sessionId: spec.sessionId, profileId: spec.profileId || null, syncId })),
});

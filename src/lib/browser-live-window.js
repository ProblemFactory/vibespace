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
//     button), a paste arrives as its TEXT (`textRecords`), an IME composes in
//     the view's own hidden sink and is forwarded at `compositionend`, and an
//     editable element elsewhere that takes focus is reclaimed at once
//     (`focusVerdict`). The claim lives in src/lib/keyboard-owner.js: ChatInput.focus
//     (the attach/reconnect path) and TerminalSession.focus stand down while it
//     owns. Ownership is PURE `keyboardOwnership` (takeover + mine + socket
//     open + on screen + open), re-asked on every event — a dropped socket,
//     a desktop switch, a handback release it without bookkeeping. The bar
//     says "Typing goes to the browser" and the picture wears a focus ring.
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
// XSS: page titles and URLs are page-controlled and sync to every client —
// textContent / escHtml only. Theme vars only, SVG icons only.
import { t } from './i18n.js';
import { escHtml, fetchJson, showToast, showContextMenu, createPopover, COUNTER_ZOOM } from './utils.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerMenuItem } from './contributions.js';
import { ownerDots, livePlacement } from './chain-layout.js'; // P7 (§4.6): the per-SESSION owner colour, never the group's; MULTIVIEW D5: where a new live view goes
import { stripOrder, stripFold, capChip, shortLabel, stoppableRows, rowStateWords } from './live-strip-layout.js'; // MULTIVIEW §2 A1 / D4: the strip's order, fold and own/cap chip (PURE)
import { UI_ICONS } from './icons.js';
import { STREAM_PATH, MAX_FPS_DEFAULT, EPHEMERAL_REF, pointerToDevice, deviceToViewport, drawnRect, liveTitle, mouseRecord, wheelRecord, keyRecord, touchRecord, modifiersOf, liveViewPlan, viewTargetRunning, browserListFor } from '../browser-stream.js';
import { frameGeometry, toLocal } from '../browser-stream.js'; // lane J: the picture vs the page — two sizes, one rect basis
import { LIVE_ALIGN, textRecords } from '../browser-stream.js'; // lane J r2: the picture's placement (top) + text a viewer hands the page
import { agentCursorFromCommand, modeBadge as modeBadgeText } from '../browser-takeover.js';
import { keyboardOwnership, keyRoute, focusVerdict } from '../browser-takeover.js'; // lane J r2: the keyboard while you drive (PURE tables)
import { claimKeyboard, releaseKeyboard, keyboardOwner, keyboardOwned } from './keyboard-owner.js'; // lane J r2: THE one keyboard owner of this client
import { createTraceTimeline } from './browser-trace-view.js'; // agent browser P5 (§4.5 / D35): the Actions pane
import { shortModeBadge } from './live-bar-layout.js'; // lane I: the bar's never-fold badge words (the full sentence is its tooltip)
import { createBarFold } from './bar-fold.js'; // lane I: the bar folds into ⋯ by priority — never wraps, never overlaps

const CONSOLE_CAP = 200;
const RECONNECT_MAX = 5;
const HIDDEN_FPS = 2;
const HINT_EVERY_MS = 8000;
/** Pointer moves are forwarded at most this often while the user drives. */
const MOVE_EVERY_MS = 33;
/** The URL line's minimum width in the bar (the ONE flexible item) — public/style.css `.browser-live-bar > .browser-live-url` min-width says the same (test-live-bar-layout pins the pair). */
export const URL_MIN_PX = 120;
/** THE BAR'S FOLD PRIORITIES (lane I; src/lib/live-bar-layout.js): 0 never folds — the ONE mode toggle (Take over ↔
 *  Hand back) and Reconnect (shown only when the stream failed: then it is the one act that matters); 1 the mode badge
 *  (the LAST to go — lane I verify r1: a never-fold badge left a split pane's bar wider than the pane, the toggle cut
 *  and the ⋯ clipped out; folded, its sentence is the ⋯'s first row and the ⋯ wears its colour, and the toggle's own
 *  words still say who drives); 2 the URL + its web-view hand-off; 3 bind, viewers, recording; 4 the backend chip;
 *  5 Tabs / Console / Actions (first to go — their counts ride the ⋯ rows). Equal priorities fold right-to-left. */
/*  2.369.180 (lanes I + J integrated): lane J r2's two driving-only items fold like the rest — the "Typing goes to
   *  the browser" chip with bind/viewers/recording (3; folded, its words are an info row of the ⋯), the "input sent · n"
   *  echo first (5; a transient count — the page itself shows what the input did). */
export const LIVE_BAR_PRIORITY = Object.freeze({ take: 0, handback: 0, reconnect: 0, badge: 1, url: 2, open: 2, bind: 3, viewers: 3, rec: 3, kbd: 3, backend: 4, tabs: 5, console: 5, trace: 5, echo: 5 });
/** lane J r2: how long the bar's "input sent · n" stays bright after an act, and a ripple lives. */
const ECHO_MS = 1600;
const RIPPLE_MS = 650;
const RIPPLE_KEEP = 8;
/** lane J r2: the "typing goes to the browser" hint after a reclaimed focus, at most this often. */
const RECLAIM_HINT_EVERY_MS = 6000;
/** An element a caret can live in — the thing a takeover may not let the keyboard fall into. */
const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week']);
function isEditable(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return !el.readOnly && !el.disabled;
  if (el.tagName === 'INPUT') return TEXT_INPUT_TYPES.has(String(el.type || '').toLowerCase()) && !el.readOnly && !el.disabled;
  return false;
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
    if (typeof app.goToWinId === 'function') app.goToWinId(w.id); else app.wm.focusWindow(w.id);
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

function createLiveView(app, winInfo, { sessionId, profileId }) {
  const st = {
    sessionId, profileRef: profileId || '', ws: null, closed: false, connected: false,
    frames: 0, meta: null, page: null, viewers: 0, mode: 'watch', holder: null, target: null,
    url: '', tabs: [], console: [], lastStatus: null, error: null, attachments: [], defaultId: null,
    // MULTIVIEW (design-browser-multiview §2 / D3 / D4): the session's status answer, the strip's rows in THIS
    // window's first-seen order, which tabs are folded, and whether the session itself ended
    status: null, rows: [], order: [], folded: [], sessionEnded: false,
    running: false, lastCommand: null, reconnects: 0, reconnectTimer: null, lastHintAt: 0, sidePane: null, stopped: false,
    // P3 (§4.3): the input side — our viewer id, whether WE hold it, the agent cursor, the pending confirmations
    you: null, mine: false, modeSince: 0, modeCause: null, cursor: null, confirmations: new Map(), confirmTimer: null, lastMoveAt: 0, buttonsDown: 0,
    // lane J r2: input feedback + the keyboard — acts sent this takeover, the last ripples, the user's mapped pointer, the echo timer
    sent: 0, ripples: [], youPt: null, echoTimer: null, lastReclaimHintAt: 0, reclaims: 0, composing: false, claimed: false,
  };
  const row = () => sessionRow(app, sessionId);

  // ── DOM ──
  const root = document.createElement('div'); root.className = 'browser-live';
  const strip = document.createElement('div'); strip.className = 'browser-live-strip'; strip.style.display = 'none';
  // MULTIVIEW §2 A1: the tabs (one per browser of this session), the ▾+N fold, the own/cap chip (D4)
  const stripTabs = document.createElement('div'); stripTabs.className = 'browser-live-strip-tabs';
  const stripMoreBtn = document.createElement('button'); stripMoreBtn.className = 'browser-live-strip-more'; stripMoreBtn.style.display = 'none';
  const capBtn = document.createElement('button'); capBtn.className = 'browser-live-strip-cap';
  strip.append(stripTabs, stripMoreBtn, capBtn);
  const bar = document.createElement('div'); bar.className = 'browser-live-bar';
  const modeBadge = document.createElement('span'); modeBadge.className = 'browser-live-mode';
  // lane I: ONE mode toggle — Take over while the agent drives, Hand back while a human does (the retired Watch button
  // was a second Hand back: its click sent `handback` too, and a no-op in Watch)
  const takeBtn = document.createElement('button'); takeBtn.className = 'file-tool-btn browser-live-mode-btn'; takeBtn.textContent = t('Take over'); takeBtn.title = t('Take over the controls — the agent pauses until you hand back');
  const handBtn = document.createElement('button'); handBtn.className = 'file-tool-btn browser-live-handback'; handBtn.textContent = t('Hand back'); handBtn.title = t('Hand the controls back to the agent — it is told the current URL'); handBtn.style.display = 'none';
  const urlEl = document.createElement('span'); urlEl.className = 'browser-live-url'; urlEl.textContent = '';
  // the web view's globe (UI_ICONS.globe — the web view's glyph). 2.369.134 spelled the UI set's `web` here, a key only
  // FILE_ICONS has: innerHTML = undefined printed the word "undefined" in every live view (test-architecture §58 census)
  const openBtn = document.createElement('button'); openBtn.className = 'file-tool-btn browser-live-open bar-icon-btn'; openBtn.innerHTML = UI_ICONS.globe; openBtn.setAttribute('aria-label', t('Open this URL in a web view'));
  openBtn.title = t('Open this URL in a web view');
  const viewersEl = document.createElement('span'); viewersEl.className = 'browser-live-viewers';
  // P5 (D7): the RECORDING indicator reads the profile digest (`recording[profileId]` rides `browser-profiles-updated`); click = the Browser profiles panel where the per-profile opt-in lives
  const recEl = document.createElement('button'); recEl.className = 'file-tool-btn browser-live-rec'; recEl.textContent = t('not recording');
  const tabsBtn = document.createElement('button'); tabsBtn.className = 'file-tool-btn browser-live-side-btn'; tabsBtn.dataset.pane = 'tabs';
  const consBtn = document.createElement('button'); consBtn.className = 'file-tool-btn browser-live-side-btn'; consBtn.dataset.pane = 'console';
  // P5 (§4.5 / D35): the ACTIONS pane — the timeline of the pane you are looking at
  const traceBtn = document.createElement('button'); traceBtn.className = 'file-tool-btn browser-live-side-btn'; traceBtn.dataset.pane = 'trace';
  const timeline = createTraceTimeline(app, { sessionId });
  const reBtn = document.createElement('button'); reBtn.className = 'file-tool-btn browser-live-reconnect'; reBtn.textContent = t('Reconnect'); reBtn.style.display = 'none';
  // P4 (§7.4): the BACKEND CHIP — `chromium 146` / `cloak 146 (free)` from the profile digest; click = the switcher. Hidden for the ephemeral browser (a backend is a property of a PROFILE).
  const backendBtn = document.createElement('button'); backendBtn.className = 'file-tool-btn browser-live-backend'; backendBtn.style.display = 'none'; backendBtn.title = t('This profile’s backend — click to switch');
  // P7 (§4.6): BIND — snap this pane beside its session's window in ONE tab group, or unbind. ICON-ONLY (lane I): its
  // words carry the session's NAME (unbounded) — they are its accessible name + tooltip and the ⋯ row's label
  const bindBtn = document.createElement('button'); bindBtn.className = 'file-tool-btn browser-live-bind bar-icon-btn'; bindBtn.innerHTML = BIND_SVG;
  bindBtn.setAttribute('aria-label', t('Snap beside {name}', { name: t('its session') }));
  // lane I: the OVERFLOW menu — what the bar has no room for (src/lib/live-bar-layout.js), with the live counts
  const moreBtn = document.createElement('button'); moreBtn.className = 'file-tool-btn browser-live-more bar-icon-btn bar-folded'; moreBtn.innerHTML = UI_ICONS.more;
  moreBtn.title = t('More'); moreBtn.setAttribute('aria-label', t('More'));
  // lane J r2: "typing goes to the browser" while this view owns the keyboard, and the "input sent · n" echo
  const kbdChip = document.createElement('span'); kbdChip.className = 'browser-live-kbd-chip'; kbdChip.style.display = 'none';
  kbdChip.innerHTML = KBD_SVG; { const w = document.createElement('span'); w.textContent = t('Typing goes to the browser'); kbdChip.appendChild(w); }
  kbdChip.title = t('While you drive, every key goes to the page — nothing reaches a chat box. Hand back to type anywhere else (Ctrl+Backslash and Ctrl+Alt+Left/Right stay the app’s).');
  const echoEl = document.createElement('span'); echoEl.className = 'browser-live-echo'; echoEl.style.display = 'none'; echoEl.setAttribute('aria-live', 'polite');
  bar.append(modeBadge, takeBtn, handBtn, kbdChip, echoEl, bindBtn, urlEl, openBtn, viewersEl, recEl, backendBtn, tabsBtn, consBtn, traceBtn, reBtn, moreBtn);
  // …and the same act on the TITLE BAR of the standalone window (the design's affordance; hidden with the title bar once grouped)
  const titleBind = document.createElement('button'); titleBind.className = 'win-btn win-bind'; titleBind.innerHTML = BIND_SVG;
  { const controls = winInfo.titleBar?.querySelector('.window-controls'); if (controls) controls.insertBefore(titleBind, controls.firstChild); }
  // P3: the --confirm-actions cards (one row per pending confirmation)
  const confirms = document.createElement('div'); confirms.className = 'browser-live-confirms'; confirms.style.display = 'none';
  // P4 (§7.4): the agent's `blocked` CLAIMS about this profile — it says WHO claimed it; the one-click "Open with CloakBrowser" is the USER's act (it opens the switcher on the cloak row)
  const blockedBar = document.createElement('div'); blockedBar.className = 'browser-live-blocked'; blockedBar.style.display = 'none';
  const body = document.createElement('div'); body.className = 'browser-live-body';
  const canvas = document.createElement('div'); canvas.className = 'browser-live-canvas';
  // COORDINATE SPACES MUST COINCIDE (inc-mtdrm922): counter-zoom so the picture
  // lives at NET zoom 1 — the JPEG maps ~1:1 to device pixels and no reader
  // of this element mixes viewport px with layout px. var()-reactive.
  canvas.style.zoom = COUNTER_ZOOM;
  const img = document.createElement('img'); img.className = 'browser-live-img'; img.alt = ''; img.draggable = false;
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
  root.tabIndex = 0;
  const side = document.createElement('div'); side.className = 'browser-live-side'; side.style.display = 'none';
  const tabsPane = document.createElement('div'); tabsPane.className = 'browser-live-tabs';
  const consPane = document.createElement('div'); consPane.className = 'browser-live-console';
  const tracePane = timeline.el; tracePane.classList.add('browser-live-tracepane');
  side.append(tabsPane, consPane, tracePane);
  body.append(canvas, side);
  root.append(strip, bar, blockedBar, confirms, body);
  winInfo.content.appendChild(root);

  const setStatus = (text, { error = false, reconnect = false, hide = false } = {}) => {
    statusEl.textContent = text || '';
    statusEl.style.display = hide ? 'none' : '';
    statusEl.classList.toggle('error', !!error);
    reBtn.style.display = reconnect ? '' : 'none';
  };
  const renderMode = () => {
    const taken = st.mode === 'takeover';
    // lane I: the SHORT words on the bar (a never-fold item), the full sentence in the tooltip; lane H (naive study 2
    // finding 3 + verify r5/r6): a STOPPED browser's badge names why (those words are already short) — never 'driving'
    const fullBadge = modeBadge_(st.mode, st.mine, st.stopped, st.stoppedHow);
    modeBadge.textContent = t(st.stopped ? fullBadge : shortModeBadge({ mode: st.mode, mine: st.mine }));
    modeBadge.title = t(fullBadge);
    modeBadge.classList.toggle('stopped', !!st.stopped);
    root.classList.toggle('stopped', !!st.stopped); // naive study 2 (finding 3): the LAST frame stays, greyed — never a blank "new" browser
    modeBadge.classList.toggle('takeover', taken && st.mine);
    modeBadge.classList.toggle('other', taken && !st.mine);
    moreBtn.dataset.mode = !taken ? 'watch' : st.mine ? 'takeover' : 'other'; // the ⋯ wears the badge's colour while the badge is folded into it (its words change ⇒ the fold re-runs ⇒ renderMore)
    // ONE toggle: Take over while the agent drives, Hand back while anybody does (any viewer may hand back, §4.3)
    takeBtn.style.display = taken ? 'none' : '';
    handBtn.style.display = taken ? '' : 'none';
    handBtn.title = taken && !st.mine ? t('Another viewer holds the controls') + ' — ' + t('Hand the controls back to the agent — it is told the current URL') : t('Hand the controls back to the agent — it is told the current URL');
    root.classList.toggle('driving', taken && st.mine);
    // lane J r2: entering a takeover of OUR OWN claims the keyboard (a re-claim moves this view to the end — the last
    // takeover on this client wins); leaving it releases, and the sink lets go of focus so nothing is typed into it
    if (taken && st.mine) { if (!st.claimed) { st.claimed = true; st.sent = 0; claimKeyboard({ id: winInfo.id, owns: ownsKeyboard }); } focusSink(); }
    else if (st.claimed) { st.claimed = false; releaseKeyboard(winInfo.id); if (document.activeElement === kbd) kbd.blur(); kbd.value = ''; st.youPt = null; }
    renderKbd();
    renderCursor();
  };
  /** lane J r2: does THIS view own the keyboard now? PURE ownership over the live facts, re-asked every time. */
  function ownsKeyboard() {
    const displayed = (() => { try { if (!root.isConnected) return false; if (typeof root.checkVisibility === 'function') return root.checkVisibility({ visibilityProperty: true }); return root.getClientRects().length > 0 && getComputedStyle(root).visibility !== 'hidden'; } catch { return false; } })();
    return keyboardOwnership({ mode: st.mode, mine: st.mine, connected: !!(st.ws && st.ws.readyState === 1 && st.connected), displayed, closed: st.closed }).owns;
  }
  /** …and is it THE owner of this client (two views driving: the last claim wins)? */
  const iOwn = () => { const o = keyboardOwner(); return !!o && o.id === winInfo.id; };
  function focusSink() { try { if (document.activeElement !== kbd) kbd.focus({ preventScroll: true }); } catch { /* detached */ } }
  function renderKbd() {
    const own = st.claimed && iOwn();
    kbdChip.style.display = own ? '' : 'none';
    root.classList.toggle('kbd-owned', own);
    if (!(st.mode === 'takeover' && st.mine)) { echoEl.style.display = 'none'; youEl.style.display = 'none'; }
  }
  /** lane J r2: the bar's "input sent · n" — bright for ECHO_MS after each act, then dim (still the count). */
  function echo(ok = true, why = '') {
    echoEl.style.display = '';
    echoEl.classList.toggle('error', !ok);
    echoEl.classList.add('fresh');
    echoEl.textContent = ok ? t('input sent · {n}', { n: st.sent }) : t('not sent — {why}', { why: why || t('no connection') });
    if (st.echoTimer) clearTimeout(st.echoTimer);
    st.echoTimer = setTimeout(() => { st.echoTimer = null; echoEl.classList.remove('fresh'); }, ECHO_MS);
  }
  /** Every input record goes through here: `act` = one user act (a press, a key, a paste) counted in the echo. */
  function sendInput(rec, act = false) {
    if (!rec) return false;
    const open = !!(st.ws && st.ws.readyState === 1);
    if (open) send(rec);
    if (act) { if (open) st.sent++; echo(open, open ? '' : t('the live view is disconnected')); }
    return open;
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
  /** The --confirm-actions cards: one row each, with the daemon's countdown. */
  const renderConfirms = () => {
    const now = Date.now();
    for (const [id, c] of [...st.confirmations]) if (c.expiresAt && c.expiresAt <= now) st.confirmations.delete(id);
    confirms.innerHTML = '';
    confirms.style.display = st.confirmations.size ? '' : 'none';
    for (const c of st.confirmations.values()) {
      const row = document.createElement('div'); row.className = 'browser-live-confirm';
      const text = document.createElement('span'); text.className = 'browser-live-confirm-text';
      const left = Math.max(0, Math.round(((c.expiresAt || now) - now) / 1000));
      text.textContent = t('The agent wants to run {action} — confirm?', { action: String(c.action || 'an action') }) + (c.category ? ` [${c.category}]` : '') + ' · ' + t('auto-denies in {s}s', { s: left });
      const ok = document.createElement('button'); ok.className = 'file-tool-btn browser-live-confirm-btn'; ok.textContent = t('Confirm'); ok.onclick = () => answerConfirm(c.id, 'confirm');
      const no = document.createElement('button'); no.className = 'file-tool-btn browser-live-confirm-btn deny'; no.textContent = t('Deny'); no.onclick = () => answerConfirm(c.id, 'deny');
      row.append(text, ok, no);
      confirms.appendChild(row);
    }
    if (st.confirmations.size && !st.confirmTimer) st.confirmTimer = setInterval(renderConfirms, 1000);
    if (!st.confirmations.size && st.confirmTimer) { clearInterval(st.confirmTimer); st.confirmTimer = null; }
  };
  function answerConfirm(id, decision) { send({ type: 'confirm', id, decision }); }
  const renderViewers = () => { viewersEl.textContent = t('{n} viewer(s)', { n: st.viewers || 1 }); viewersEl.title = t('Windows watching this browser right now (on every client)'); };
  const renderUrl = () => { urlEl.textContent = st.url || ''; urlEl.title = st.url || ''; openBtn.disabled = !st.url; };
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
      tabsPane.appendChild(d);
    }
  };
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
    const name = sessionName();
    const tg = st.target;
    const row = (st.rows || []).find((x) => x.ref === curRef());
    const title = liveTitle({ label: tg && tg.kind === 'child' && row ? rowName(row) : (tg ? tg.label : null), alias: tg ? tg.alias : null, sessionName: name, ephemeralWord: t('ephemeral (no profile)') });
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
  const renderOwner = () => { const pid = st.target && st.target.profileId ? st.target.profileId : null; try { app.wm.setOwnerBadge?.(winInfo.id, { dots: dotsFor(pid) }); } catch { /* window gone */ } };
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
  winInfo.onResize = () => renderBind();
  // ── MULTIVIEW (design-browser-multiview §2 A1 / D3 / D4): ONE strip lists EVERY browser of this session ──
  /** The ref of the pane this window shows (a profile id, EPHEMERAL_REF, a helper's handle). */
  const curRef = () => {
    const tg = st.target;
    if (tg) return tg.ref || (tg.kind === 'attachment' ? tg.profileId : tg.kind === 'child' ? tg.handle : EPHEMERAL_REF);
    return st.profileRef || null;
  };
  /** A row's words: a profile's label (+ default), the session's own browser, a helper by its witnessed name or number. */
  const rowLabel = (r) => {
    if (!r) return '';
    if (r.kind === 'ephemeral') return t('This session'); // short on the tab (≤16 chars); the title says it whole
    if (r.kind === 'child') return r.helper && r.helper.name ? t('Helper: {name}', { name: r.helper.name }) : t('Helper {n}', { n: (r.helper && r.helper.n) || '?' });
    return String(r.label || r.alias || r.ref) + (r.isDefault ? ' ' + t('(default)') : '');
  };
  /** A row's full name, for a title / a menu / the window title. */
  const rowName = (r) => {
    if (!r) return '';
    if (r.kind === 'ephemeral') return t('This conversation’s browser');
    if (r.kind === 'child') return r.helper && r.helper.name ? t('Helper: {name}', { name: r.helper.name }) : t('Helper {n}', { n: (r.helper && r.helper.n) || '?' });
    return String(r.label || r.alias || r.ref) + (r.isDefault ? ' ' + t('(default)') : '');
  };
  const driverText = (r) => (r.driver === 'you' ? t('you') : r.kind === 'child' ? '' : t('agent'));
  // lane P verify (finding 6): the words come from the PURE rowStateWords — a released own browser beside an attachment is
  // never promised "the next command" (a bare command lands on the attachment); one sentence per code
  const STATE_WORDS = {
    running: () => t('Running a command'), idle: () => t('Running'), ended: () => t('Ended'),
    released: () => t('Released — the next command starts it again'),
    'released-attached': () => t('Released — used again only when no profile is attached'),
  };
  const stateTitle = (r) => (STATE_WORDS[rowStateWords(r, st.rows)] || STATE_WORDS.released)();
  /** 2.369.183: a browser this view has no frame of is not running (a strip switch, a pop-out) — HOLLOW, the tab's own words. */
  const hollowFor = (m) => { st.error = m; st.hollow = true; const r = st.rows.find((x) => x.ref === curRef()); setStatus(stateTitle(r || { kind: st.target && st.target.kind, state: 'released' }), { reconnect: false }); };
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
    st.rows = computeRows();
    const chip = chipNow();
    // ≥2 browsers ⇒ the strip (one browser keeps the single-browser look) — and a conversation AT its cap
    // shows the strip too, so the red own/cap chip the agent's refusal points at is there to click
    const show = st.rows.length >= 2 || (st.rows.length >= 1 && chip.full);
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
      const label = document.createElement('span'); label.className = 'browser-live-strip-label'; label.textContent = shortLabel(rowLabel(r));
      b.append(dot, label);
      const dt = driverText(r);
      if (dt) { const d = document.createElement('span'); d.className = 'browser-live-strip-driver'; d.textContent = dt; b.appendChild(d); }
      if (r.kind === 'attachment') b.appendChild(ownersEl(dotsFor(r.profileId))); // §3.7: who else this profile's browser belongs to
      b.title = (current ? t('You are looking at this browser') : t('Switch this window to {name}', { name: full })) + '\n' + stateTitle(r);
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
    const list = stoppableRows(st.rows);
    if (!list.length) { const n = document.createElement('div'); n.className = 'browser-live-cap-empty'; n.textContent = t('None of them is running right now'); pop.appendChild(n); }
    for (const x of list) {
      const row = document.createElement('div'); row.className = 'browser-live-cap-row';
      const name = document.createElement('span'); name.className = 'browser-live-cap-name'; name.textContent = rowName(st.rows.find((y) => y.ref === x.ref) || x);
      row.appendChild(name);
      if (x.shared) { const sh = document.createElement('span'); sh.className = 'browser-live-cap-shared'; sh.textContent = t('also used by {n} other conversation(s) — detach it instead', { n: x.owners }); row.appendChild(sh); }
      else {
        const stop = document.createElement('button'); stop.className = 'file-tool-btn browser-live-cap-stop'; stop.textContent = t('Stop');
        stop.onclick = async () => {
          stop.disabled = true;
          const r = await fetchJson(`/api/browser/session/${encodeURIComponent(sessionId)}/stop`, { method: 'POST', body: JSON.stringify({ ref: x.ref }), headers: { 'Content-Type': 'application/json' } });
          if (!r || r.error) { stop.disabled = false; showToast((r && r.error) || t('server unreachable'), { type: 'error' }); return; }
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
    timeline.load({ profileId: pid }).then(renderTraceBtn).catch(() => renderTraceBtn());
  };
  /** P5 (D7): the recording indicator from the digest — never fetched here. */
  const renderRec = () => {
    const pid = st.target && st.target.profileId ? st.target.profileId : null;
    const d = app._browserProfiles || {};
    const rec = pid && d.recording ? d.recording[pid] : null;
    const refused = pid && d.recordingRefused ? d.recordingRefused[pid] : null;
    recEl.classList.toggle('on', !!rec);
    if (rec) { recEl.textContent = t('recording'); recEl.title = t('Recording to {file} since {time}', { file: String(rec.file || ''), time: new Date(Number(rec.since) || 0).toLocaleTimeString() }); }
    else if (refused) { recEl.textContent = t('recording refused'); recEl.title = String(refused.error || refused.code || ''); }
    else { recEl.textContent = t('not recording'); recEl.title = pid ? t('Recording is a per-profile opt-in — turn it on in Agent browser…') : t('An ephemeral browser has no profile to record under'); }
  };
  recEl.onclick = () => { const pid = st.target && st.target.profileId ? st.target.profileId : null; if (app.openBrowserProfiles) app.openBrowserProfiles({ focus: pid }); else showToast(t('Agent browser is not available'), { type: 'warn' }); };
  /** P4 (§7.4): the chip + the blocked-claim banner, both read from the profile digest (never fetched here). */
  const renderBackend = () => {
    const pid = st.target && st.target.profileId ? st.target.profileId : null;
    const chip = pid && app.browserChipFor ? app.browserChipFor(pid) : null;
    backendBtn.style.display = pid ? '' : 'none';
    backendBtn.textContent = chip || t('backend unknown');
    const claims = app.browserBlockedFor ? app.browserBlockedFor({ profileId: pid, sessionId }) : [];
    blockedBar.replaceChildren();
    blockedBar.style.display = claims.length ? '' : 'none';
    for (const b of claims) {
      const row = document.createElement('div'); row.className = 'browser-live-blocked-row';
      const text = document.createElement('span'); text.className = 'browser-live-blocked-text';
      text.textContent = t('The agent says this page is blocked: {host}', { host: String(b.host || '') }) + (b.why ? ' (' + String(b.why) + ')' : '') + ' — ' + t('it suggests tier {tier}', { tier: b.tier });
      const open = document.createElement('button'); open.className = 'file-tool-btn'; open.textContent = t('Open with CloakBrowser');
      open.disabled = !pid; open.onclick = () => app.openBrowserSwitcher?.({ profileId: pid, sessionId, preselect: 'cloak' });
      const dismiss = document.createElement('button'); dismiss.className = 'file-tool-btn'; dismiss.textContent = t('Dismiss');
      dismiss.onclick = async () => { const r = await fetchJson(`/api/browser/blocked/${encodeURIComponent(b.id)}`, { method: 'DELETE' }); if (!r || r.error) showToast((r && r.error) || t('server unreachable'), { type: 'error' }); };
      row.append(text, open, dismiss);
      blockedBar.appendChild(row);
    }
  };
  backendBtn.onclick = () => { const pid = st.target && st.target.profileId; if (pid) app.openBrowserSwitcher?.({ profileId: pid, sessionId }); };
  renderMode(); renderViewers(); renderUrl(); renderTabs(); renderConsole(); renderSide(); renderBackend(); renderTraceBtn(); renderRec(); renderBind(); renderOwner();

  // ── lane I: THE FOLD — every item keeps its words on one line; what the bar has no room for goes into ⋯ by
  // LIVE_BAR_PRIORITY (PURE barLayout; the ruler + observers + rAF live in bar-fold.js, bound to this window's signal) ──
  const barItems = { badge: modeBadge, take: takeBtn, handback: handBtn, kbd: kbdChip, echo: echoEl, bind: bindBtn, url: urlEl, open: openBtn, viewers: viewersEl, rec: recEl, backend: backendBtn, tabs: tabsBtn, console: consBtn, trace: traceBtn, reconnect: reBtn };
  const fold = createBarFold(bar, {
    more: moreBtn,
    items: () => Object.entries(barItems).map(([key, el]) => ({ key, el, priority: LIVE_BAR_PRIORITY[key], flexMin: key === 'url' ? URL_MIN_PX : undefined })),
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
      else if (key === 'bind') rows.push({ label: bindLabel(), title: bindTitle(), action: () => toggleBind() });
      else if (key === 'url') rows.push({ label: st.url ? (st.url.length > 90 ? st.url.slice(0, 89) + '…' : st.url) : t('Open this URL in a web view'), title: t('Open this URL in a web view'), disabled: !st.url, action: () => openBtn.onclick() });
      else if (key === 'open') { if (!out.includes('url')) rows.push({ label: t('Open this URL in a web view'), disabled: !st.url, action: () => openBtn.onclick() }); }
      else if (key === 'viewers') rows.push({ label: viewersEl.textContent, title: viewersEl.title, disabled: true });
      else if (key === 'rec') rows.push({ label: recEl.textContent, title: recEl.title, action: () => recEl.onclick() });
      else if (key === 'backend') rows.push({ label: backendBtn.textContent, title: backendBtn.title, action: () => backendBtn.onclick() });
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
    if (st.closed) return;
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
  const onGlobal = (msg) => {
    if (st.closed || !msg) return;
    if (msg.type === 'browser-profiles-updated') {
      refreshSet(); renderBackend(); renderRec(); renderOwner();
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
    setStatus(t('Connecting…'));
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const q = new URLSearchParams({ session: sessionId });
    if (st.profileRef) q.set('profile', st.profileRef);
    const ws = new WebSocket(`${proto}://${location.host}${STREAM_PATH}?${q}`);
    st.ws = ws;
    ws.onopen = () => { if (ws !== st.ws) return; send({ type: 'config', maxFps: document.hidden ? HIDDEN_FPS : MAX_FPS_DEFAULT }); };
    ws.onmessage = (ev) => { if (ws !== st.ws) return; let m = null; try { m = JSON.parse(ev.data); } catch { return; } onMessage(m); };
    ws.onclose = () => {
      if (ws !== st.ws) return; st.connected = false;
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
        renderMode(); renderViewers(); renderTitle(); renderStrip(); renderBackend(); renderRec(); syncTrace(); renderOwner(); renderBind();
        break;
      // P3 (§4.3): the bridge's answer to a takeover/handback — ours or anybody's
      case 'mode': {
        const was = st.mode, wasMine = st.mine;
        st.mode = m.mode || 'watch'; st.holder = m.holder || null; st.mine = !!m.mine; st.modeSince = Number(m.since) || 0; st.modeCause = m.cause || null;
        renderMode();
        if (was === 'takeover' && st.mode === 'watch' && wasMine) {
          if (m.cause === 'idle') showToast(t('Your takeover lapsed (no input) — the agent is driving again'), { duration: 5000 });
          else if (m.cause !== 'explicit') showToast(t('Control returned to the agent'), { duration: 3500 });
        } else if (st.mode === 'takeover' && st.mine && !wasMine && m.cause !== 'pass') showToast(t('You took over — the agent is paused until you hand back'), { duration: 4000 }); // a PASS (fold-back) says its own words
        break;
      }
      case 'mode-ack': if (m.ok && m.mode === 'watch') showToast(t('Control handed back to the agent'), { duration: 3500 }); break;
      case 'confirmation': if (m.id) { st.confirmations.set(m.id, { id: m.id, action: m.action, category: m.category || null, expiresAt: Number(m.expiresAt) || (Date.now() + 60000) }); renderConfirms(); } break;
      case 'confirmation-resolved': if (m.id && st.confirmations.delete(m.id)) renderConfirms(); break;
      case 'confirmation-ack': if (!m.ok) showToast(t('Could not answer the confirmation: {why}', { why: String(m.error || m.code || '') }), { type: 'error' }); else st.confirmations.delete(m.id), renderConfirms(); break;
      case 'viewers': st.viewers = Number(m.n) || 1; renderViewers(); break;
      case 'status':
        st.lastStatus = m;
        // 2.369.183 (lanes H + P on one tree): ONE code for "not running, and a view never starts it" — `browser_stopped`
        // (lane P's `browser_released` is read the same). A view that WAS showing this browser (frames) greys by name and
        // keeps its last frame (lane H, naive study 2 finding 3); a view just switched to it — a strip tab, a pop-out — has
        // no frame to keep and says the tab's own state words, HOLLOW (lane P). Either way it picks the browser up by itself.
        if (m.state === 'error' && m.code === 'browser_stopped') {
          if (st.frames > 0) {
            // naive study 2 (finding 3): the browser is not running and a view never starts one — say so plainly, keep the
            // LAST frame (greyed), the badge says "Browser stopped"; the view resumes by itself when the browser runs again
            st.error = m; st.stopped = true; st.stoppedHow = null; st.hollow = false; renderMode();
            setStatus(t('Stopped — the agent\'s next browser command starts it again, and this view reconnects then'), { reconnect: true });
          } else hollowFor(m); // MULTIVIEW: a released / stopped browser (lane P verify: an attachment too) is HOLLOW — the tab's own words
        } else if (m.state === 'error' && m.code === 'browser_released') {
          hollowFor(m);
        } else if (m.state === 'error' && m.code === 'no-browser' && m.browserState === 'not-started') {
          // …or not started yet (the conversation has not opened it) — hollow too, and the view picks it up by itself
          st.error = m; setStatus(t('Not started yet — the next command starts it'), { reconnect: false });
        } else if (m.state === 'error' && (m.code === 'browser_closed' || m.code === 'browser_unstable')) {
          // lane H verify r5 (MINOR 2): its browser was CLOSED (the daemon lives) — a view never starts it: the last frame
          // stays greyed, the badge names why; `browser_unstable` = it kept closing and VibeSpace stopped restarting it
          // lane H verify r6 MINOR 1: `unstable: 'failing'` = every ask to start it again failed — it never came back to close
          st.error = m; st.stopped = m.code; st.stoppedHow = m.unstable || null; renderMode();
          setStatus(m.code === 'browser_unstable' ? (m.unstable === 'failing' ? t('This browser could not be started — VibeSpace stopped trying. Stop it in ⚙ → Tools → Agent browser…, then the next command starts it fresh') : t('This browser keeps closing — VibeSpace stopped starting it again. Stop it in ⚙ → Tools → Agent browser…, then the next command starts it fresh')) : t('Closed — the agent\'s next browser command starts it again, and this view reconnects then'), { reconnect: true, error: m.code === 'browser_unstable' });
        } else if (m.state === 'error') { st.error = m; if (m.code === 'not-found') st.sessionEnded = true; setStatus(t('Live view unavailable: {why}', { why: String(m.error || m.code || '') }), { error: true, reconnect: true }); }
        else if (m.state === 'connecting') setStatus(t('Starting the browser stream…'));
        else if (m.state === 'upstream-open') { st.connected = true; st.reconnects = 0; if (st.stopped) { st.stopped = false; renderMode(); } setStatus(st.frames ? '' : t('Connected — waiting for the first frame…'), { hide: !!st.frames }); }
        else if (m.state === 'upstream-closed') { st.connected = false; setStatus(t('Stream ended'), { error: true, reconnect: true }); }
        else if (m.state === 'ended') { st.error = m; if (/session ended/.test(String(m.error || ''))) st.sessionEnded = true; setStatus(String(m.error || t('Stream ended')), { error: true, reconnect: true }); }
        else if (m.connected !== undefined) { // the upstream's own status record
          if (m.viewportWidth && m.viewportHeight && !st.meta) st.meta = { width: Number(m.viewportWidth), height: Number(m.viewportHeight) }; // lane J: a CLAIM, used only where it fits the picture
        }
        break;
      case 'frame': {
        const data = typeof m.data === 'string' ? m.data : '';
        if (!data) break;
        st.frames++;
        if (!st.connected) { st.connected = true; st.reconnects = 0; } // a LATE viewer of a relay already open (a tap kept it) hears no upstream-open — its first frame is the proof
        const md = m.metadata || {};
        if (Number(md.deviceWidth) > 0 && Number(md.deviceHeight) > 0) st.meta = { width: Number(md.deviceWidth), height: Number(md.deviceHeight) }; // lane J: every frame's claim, both sides
        img.src = 'data:image/jpeg;base64,' + data; // .src, never markup (the image-overlay law)
        if (st.frames === 1) setStatus('', { hide: true });
        break;
      }
      case 'tabs':
        st.tabs = Array.isArray(m.tabs) ? m.tabs.map((x) => ({ tabId: String(x.tabId || ''), title: String(x.title || ''), url: String(x.url || ''), active: !!x.active })) : [];
        { const act = st.tabs.find((x) => x.active); if (act && act.url && !st.url) { st.url = act.url; renderUrl(); } }
        renderTabs();
        break;
      case 'url': st.url = String(m.url || ''); renderUrl(); break;
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
        else if (m.code !== 'watch-mode') showToast(String(m.error || m.code || 'refused'), { type: 'warn' });
        break;
      default: break;
    }
  }
  function switchTo(profileRef) {
    st.profileRef = profileRef || '';
    st.error = null; st.target = null; // the next hello names the pane (MULTIVIEW: a strip tab may name a helper's browser or EPHEMERAL_REF)
    if (st.stopped || st.hollow) { st.stopped = false; st.stoppedHow = null; st.hollow = false; renderMode(); } // a new pane has no last frame to grey
    st.frames = 0; st.url = ''; st.tabs = []; st.console = []; st.running = false; st.reconnects = 0;
    img.removeAttribute('src');
    timeline.clear(); renderTraceBtn(); // the next hello names the pane and re-seeds
    renderUrl(); renderTabs(); renderConsole();
    try { winInfo._openSpec = { action: 'openBrowserLive', sessionId, profileId: st.profileRef || null }; app.wm._notify?.(); } catch { /* optional */ }
    renderStrip();
    connect();
  }

  // ── chrome actions ──
  openBtn.onclick = () => { if (st.url) app.openBrowser(st.url); };
  reBtn.onclick = () => { st.reconnects = 0; connect(); };
  tabsBtn.onclick = () => { st.sidePane = st.sidePane === 'tabs' ? null : 'tabs'; renderSide(); };
  consBtn.onclick = () => { st.sidePane = st.sidePane === 'console' ? null : 'console'; renderSide(); };
  traceBtn.onclick = () => { st.sidePane = st.sidePane === 'trace' ? null : 'trace'; renderSide(); };
  // P3 (§4.3): the three modes behind ONE toggle (lane I). Take over asks
  // the bridge (the keeper decides, a `mode` record answers every viewer);
  // Hand back is a transition any viewer may trigger.
  takeBtn.onclick = () => { if (!(st.mode === 'takeover' && st.mine)) send({ type: 'takeover' }); }; // the `mode` answer claims the keyboard (renderMode)
  handBtn.onclick = () => send({ type: 'handback' });
  winInfo.titleSpan?.addEventListener?.('click', (e) => { const r = row(); if (r && app.showBrowserProfilePicker) app.showBrowserProfilePicker(r, { x: e.clientX, y: e.clientY }); }, { signal: winInfo._listenerCtl?.signal });
  // INPUT FORWARDING — only while THIS viewer drives; every record is the
  // stream server's CDP shape built by src/browser-stream.js, coordinates
  // through the ONE viewport→device conversion (pointerAt). In Watch mode a
  // click is a hint, never forwarded (the bridge would refuse it typed anyway).
  const driving = () => st.mode === 'takeover' && st.mine;
  const sig = { signal: winInfo._listenerCtl?.signal };
  img.addEventListener('pointerdown', (e) => {
    const p = pointerAt(e);
    if (!driving()) {
      const now = Date.now();
      if (now - st.lastHintAt > HINT_EVERY_MS) { st.lastHintAt = now; showToast(t('Watch mode — the agent is driving; press Take over to send input'), { duration: 3500 }); }
      if (p) canvas.dataset.lastPointer = `${p.x},${p.y}`;
      return;
    }
    e.preventDefault(); focusSink();
    try { img.setPointerCapture(e.pointerId); } catch { /* optional */ }
    st.buttonsDown++;
    const rec = e.pointerType === 'touch' ? touchRecord({ kind: 'start', pt: p }) : mouseRecord({ kind: 'down', pt: p, button: e.button, modifiers: modifiersOf(e) });
    if (rec && sendInput(rec, true)) { ripple(p); st.youPt = p; renderYou(); }
  }, sig);
  img.addEventListener('pointermove', (e) => {
    if (!driving()) return;
    const now = Date.now();
    if (now - st.lastMoveAt < MOVE_EVERY_MS) return;
    st.lastMoveAt = now;
    const p = pointerAt(e); if (!p) return;
    const rec = e.pointerType === 'touch' ? (st.buttonsDown ? touchRecord({ kind: 'move', pt: p }) : null) : mouseRecord({ kind: 'move', pt: p, modifiers: modifiersOf(e) });
    if (rec) sendInput(rec);
    st.youPt = p; renderYou();
  }, sig);
  img.addEventListener('pointerleave', () => { if (!st.buttonsDown) { st.youPt = null; renderYou(); } }, sig);
  const up = (e) => {
    if (!driving()) return;
    const p = pointerAt(e);
    st.buttonsDown = Math.max(0, st.buttonsDown - 1);
    const rec = e.pointerType === 'touch' ? touchRecord({ kind: 'end', pt: p || { x: 0, y: 0 } }) : (p ? mouseRecord({ kind: 'up', pt: p, button: e.button, modifiers: modifiersOf(e) }) : null);
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
    if (!iOwn()) { if (document.activeElement === kbd) { kbd.blur(); kbd.value = ''; } renderKbd(); return; }
    const route = keyRoute(e, { appMode: appMode() });
    if (route.to === 'app') return;                                       // Ctrl+\ / Ctrl+Alt+←/→ — and command mode, once armed
    if (route.to === 'compose' || route.to === 'paste') { focusSink(); return; } // the IME composes in the sink / the browser raises `paste` there
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (e.type !== 'keypress') {
      const rec = keyRecord({ kind: e.type === 'keyup' ? 'up' : 'down', key: e.key, code: e.code, modifiers: modifiersOf(e), keyCode: e.keyCode });
      sendInput(rec, e.type === 'keydown' && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key));
    }
    focusSink();
  };
  document.addEventListener('keydown', onDocKey, capture);
  document.addEventListener('keyup', onDocKey, capture);
  document.addEventListener('keypress', onDocKey, capture);
  /** Text the user put in without keystrokes (a paste, a composition, dictation) → the page, as text. */
  function typeText(text) {
    const r = textRecords(text);
    if (!r.ok) { if (r.code === 'too_long') showToast(t('Not pasted into the page: {n} characters is more than one paste may carry ({max})', { n: r.length, max: r.max }), { type: 'warn' }); return; }
    let okAll = true;
    for (const rec of r.records) okAll = sendInput(rec) && okAll;
    st.sent += okAll ? 1 : 0; echo(okAll, okAll ? '' : t('the live view is disconnected'));
  }
  document.addEventListener('paste', (e) => {
    if (!iOwn()) return;
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    typeText(e.clipboardData ? e.clipboardData.getData('text/plain') : '');
    focusSink();
  }, capture);
  // nothing is ever INSERTED into an editable element while the view owns the keyboard: the sink's own text is
  // forwarded (dictation, an emoji picker — anything that inserts without a key), every other target is refused
  document.addEventListener('beforeinput', (e) => {
    if (!iOwn()) return;
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
  document.addEventListener('focusin', (e) => {
    if (!iOwn()) return;
    if (focusVerdict({ owns: true, editable: isEditable(e.target), insideView: e.target === kbd }) !== 'reclaim') return;
    st.reclaims++;
    queueMicrotask(focusSink);
    const now = Date.now();
    if (now - st.lastReclaimHintAt > RECLAIM_HINT_EVERY_MS) { st.lastReclaimHintAt = now; showToast(t('Typing goes to the agent’s browser while you drive it — press Hand back to type here'), { duration: 4000 }); }
  }, capture);
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
    releaseKeyboard(winInfo.id); st.claimed = false; // lane J r2: a closed view never owns the keyboard (its listeners die with the window's AbortController)
    if (st.echoTimer) { clearTimeout(st.echoTimer); st.echoTimer = null; }
    if (foldRaf) { cancelAnimationFrame(foldRaf); foldRaf = 0; }
    try { app.wm.setOwnerBadge?.(winInfo.id, null); } catch { /* window gone */ }
    if (st.confirmTimer) { clearInterval(st.confirmTimer); st.confirmTimer = null; }
    if (st.reconnectTimer) clearTimeout(st.reconnectTimer);
    try { st.ws?.close(); } catch { /* */ }
    st.ws = null;
    try { app.ws?.offGlobal?.(onGlobal); } catch { /* optional */ }
  }
  refreshSet();
  return {
    connect, dispose, switchTo, pointerAt,
    reconnect: () => { if (st.closed) return; st.reconnects = 0; connect(); }, // lane H: the auto-bind's "its browser holds again" (and the bar's Reconnect button's twin)
    toggleBind, bindLabel, isBound, // P7 (§4.6): the one act behind the bar button, the title-bar button and the window menu row
    refreshSet, openCapPopover, // MULTIVIEW: the suite re-reads the list / opens the chip
    el: () => root, img: () => img,
    ws: () => st.ws, // MULTIVIEW: a suite proves a switch of the OTHER pane / a new browser never rebuilt this socket
    drawn: () => { const g = geometry(); return drawnRect(rectOf(img), g ? g.picW : 0, g ? g.picH : 0, LIVE_ALIGN); },
    kbd: () => kbd, ownsKeyboard: () => !!(st.claimed && iOwn()), // lane J r2: the sink + the ownership fact (the suite types against both)
    geometry, frameClaim: () => (st.meta ? { ...st.meta } : null), pageReading: () => (st.page ? { ...st.page } : null), // lane J: {picW, picH, cssW, cssH, source}; the metadata's CLAIM and the page's own reading (the suite's control replays both)
    send, // P3: the suite drives the control verbs through the real socket
    state: () => ({ sessionId, profileRef: st.profileRef, connected: st.connected, stopped: !!st.stopped, frames: st.frames, frameW: st.frameW, frameH: st.frameH, viewers: st.viewers, mode: st.mode, target: st.target, url: st.url, tabs: st.tabs.slice(), console: st.console.length, attachments: st.attachments.slice(), running: st.running, lastCommand: st.lastCommand, error: st.error, lastStatus: st.lastStatus, sidePane: st.sidePane,
      backend: backendBtn.style.display === 'none' ? null : backendBtn.textContent, blockedShown: blockedBar.style.display !== 'none', // P4
      trace: timeline.state(), traceBtn: traceBtn.textContent, recording: recEl.textContent, recordingOn: recEl.classList.contains('on'), // P5
      bound: isBound(), bindText: bindLabel(), owners: dotsFor(st.target && st.target.profileId ? st.target.profileId : null).map((d) => ({ sessionId: d.sessionId, name: d.name, color: d.color })), // P7
      you: st.you, mine: st.mine, holder: st.holder, modeSince: st.modeSince, modeCause: st.modeCause, cursor: st.cursor ? { ...st.cursor } : null, cursorShown: cursorEl.style.display !== 'none', confirmations: [...st.confirmations.values()].map((c) => ({ ...c })), badge: modeBadge.textContent, badgeFull: modeBadge.title,
      // lane J r2
      ownsKeyboard: !!(st.claimed && iOwn()), kbdChip: kbdChip.style.display !== 'none', sent: st.sent, echo: echoEl.style.display === 'none' ? null : echoEl.textContent, ripples: st.ripples.map((r) => ({ ...r })), youPt: st.youPt ? { ...st.youPt } : null, youShown: youEl.style.display !== 'none', reclaims: st.reclaims, align: LIVE_ALIGN,
      // MULTIVIEW (design-browser-multiview §2 / D3 / D4) — the STRIP's folds are `stripFolded` (`folded` is lane I's bar)
      currentRef: curRef(), rows: st.rows.map((r) => ({ ...r, text: rowLabel(r), name: rowName(r) })), order: st.order.slice(), stripFolded: st.folded.slice(), stripShown: strip.style.display !== 'none', capText: capBtn.textContent, capFull: capBtn.classList.contains('full'), machineFull: capBtn.classList.contains('machine-full'), sessionEnded: st.sessionEnded, released: !!(st.error && st.hollow), notStarted: !!(st.error && st.error.browserState === 'not-started'), statusText: statusEl ? statusEl.textContent : null,
      bar: fold.last(), folded: fold.folded(), foldedRows: foldedRows().map((r) => ({ label: r.label, disabled: !!r.disabled })) }), // lane I: the census re-runs barLayout on `bar`
    layoutBar: () => fold.layoutNow(), // lane I: the census asks for the verdict NOW (never waiting a frame)
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
  try { app.wm.focusWindow(target.id); } catch { /* gone */ }
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
  registerMenuItem({ menu: 'window', group: '1_window', order: 35, id: 'window/browser-bind', kind: 'bind', when: (c) => !!(c.win && c.win.type === 'browser-live' && c.win._browserLive && !c.win._browserLive.isBound()), label: (c) => c.win._browserLive.bindLabel(), run: (c) => { c.win._browserLive.toggleBind(); } });
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
  if (app.isMobile) return [];                                                   // a phone renders tabs only; the desktop client binds and the layout syncs
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
export function installBrowserLive(App) {
  App.prototype.onBrowserDigestChanged = function (prev, digest) { return autoBindLiveViews(this, prev, digest); };
  /** lane J r2: THE mediator question every focus-into-a-text-box path asks — true while a live view on this
   *  client drives the agent's browser (src/lib/keyboard-owner.js is the one registry). */
  App.prototype.takeoverOwnsKeyboard = function () { return keyboardOwned(); };
  // MULTIVIEW D3: the icon-merge drop between two live views of one session folds back (tab-group.js _mergeDrop asks here)
  App.prototype.foldBackLive = function (win, into) { return foldBackLive(this, win, into); };
}

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) ── one window per (session, pane); N windows = N viewers on ONE upstream
registerWindowType({
  type: 'browser-live', label: 'Agent browser (live)',
  icon: UI_ICONS.browserLive, // the ONE agent-browser glyph (icons.js; design-browser-faces direction B)
  action: 'openBrowserLive', replay: (app, spec, { syncId } = {}) => app.openBrowserLive({ sessionId: spec.sessionId, profileId: spec.profileId || null, syncId }),
});

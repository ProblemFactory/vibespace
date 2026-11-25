'use strict';
/**
 * IDLE PAINT STOPS (lane browser-swiftshader-cpu, 2026-10-07 — userW inc-muyp9vj6-tv0m: a hidden-window browser drew a page
 * nobody watched at nine cores). PURE, imports nothing: the keeper only DRIVES it (src/server/browser-keeper.js tick → the
 * page watch's socket, src/server/browser-dialogs.js freezePaint / thawPaint).
 *
 * MEASURED (scripts/measure-hidden-window-cpu.mjs, agent-browser 0.38.1 + Chrome 154.0.8037.57 on the CLI's own Xvfb, the
 * synthetic page under the shipped args, 10 s per act): IDLE_PAINT_PROOF below. Only freezing the page stops the drawing on
 * an Xvfb (no window manager: a minimized window keeps painting; focus emulation changes nothing) — and Chrome's freeze
 * HIDES the page (WasHidden) without a way back through the lifecycle command alone: `active` leaves it hidden, no frame.
 * The page is shown again by its tab strip: a blank tab opened and closed in front of it, then the page activated.
 */
const IDLE_PAINT_MS = 30 * 1000;   // no viewer and no verb for this long ⇒ the browser stops drawing
const IDLE_PAINT_PROOF = Object.freeze({
  measured: '2026-10-07', version: '2.369.233', chrome: '154.0.8037.57', agentBrowser: '0.38.1', set: 'the shipped hidden-window args',
  none: { gpu: 99.8, frames10s: 600 },
  frozen: { gpu: 0, frames10s: 0, undoActiveOnly: 'no frame in 3 s, visibilityState hidden — also with bringToFront, a screenshot, a 200 ms screencast or a window-state cycle after it' },
  frozenThenFlip: { gpu: 0, frames10s: 0, resumeMs: 23, fpsAfter: 60, undo: 'active + a blank tab opened and closed in front + the page activated' },
  minimized: { gpu: 100.5, frames10s: 600, why: 'no window manager on the Xvfb: the window is never iconified' },
  focusOff: { gpu: 96.6, frames10s: 600 },
  // lane idle-paint-default-on (2026-10-20): the same acts on the FLEET image, the reason the switch is on by default
  fleet: Object.freeze({
    measured: '2026-10-20', image: 'vibespace:3.7.0', chrome: '154.0.8037.92', agentBrowser: '0.38.1', set: 'the shipped hidden-window args',
    dashboard: { gpu: 99.8, frozenGpu: 0, frozenFrames10s: 0, resumeMs: 31, fpsAfter: 60, page: 'a chart + WebGL + an iframe' },
    light: { gpu: 4, frozenGpu: 0, frozenFrames10s: 0, resumeMs: 43, fpsAfter: 60, page: 'a CSS spinner + two shimmer bars' },
  }),
});

/**
 * THE DEFAULT of the owner's switch `browser.idlePaintFreeze`: ON since 2.369.332 (lane idle-paint-default-on — the owner's
 * 2026-10-20 「可以」 on IDLE_PAINT_PROOF.fleet: a page nobody watches burns the fleet image's GPU process at 99.8 % / 4 %,
 * frozen 0 %, back within a frame of the next verb or viewer). ONE value: the schema row (src/lib/settings-schema.js) and the
 * keeper's read (sweepIdlePaint) both take it, never a literal of their own. A default never rewrites a stored value: an
 * instance whose owner set the switch keeps what it set.
 */
const IDLE_PAINT_DEFAULT = true;

/**
 * Should this browser draw right now? `enabled` = the owner's switch `browser.idlePaintFreeze` (ON by default since
 * 2.369.332 — IDLE_PAINT_DEFAULT; read at each sweep — lane browser-swiftshader-cpu-r2: off ⇒ never a freeze, and a
 * browser frozen before the switch went off is thawed; an ABSENT `enabled` here is off: the keeper always passes the value
 * it read), `viewers` = live views on it, `lastVerbAt` / `lastViewerAt` = the
 * last verb / the last viewer (ms, 0 = never), `driving` = a verb in flight or a person driving it, `busy` = something a
 * frozen page would hide (a dialog open, a navigation pending), `frozen` = what was done last.
 * → `{paint, act: 'freeze' | 'thaw' | null, why}` — `act` is the change to make (null = leave it as it is).
 */
function idlePaintVerdict({ enabled = false, viewers = 0, lastVerbAt = 0, lastViewerAt = 0, now = 0, driving = false, busy = false, frozen = false, idleMs = IDLE_PAINT_MS } = {}) {
  const last = Math.max(Number(lastVerbAt) || 0, Number(lastViewerAt) || 0);
  let why = null;
  if (enabled !== true) why = 'off';
  else if (driving) why = 'driving';
  else if ((Number(viewers) || 0) > 0) why = 'watched';
  else if (busy) why = 'busy';
  else if (!(Number(now) - last >= idleMs)) why = 'recent';
  const paint = why !== null;
  return { paint, act: paint ? (frozen ? 'thaw' : null) : (frozen ? null : 'freeze'), why: why || 'idle' };
}

/** Is a browser launched on a rung nobody can see (the hidden window, headless)? `display` = the launch's display fact
 *  (src/browser-display.js displayFact). A window on a real desktop is never this module's: a person may be looking at it. */
function unseenRung(display) {
  if (!display || typeof display !== 'object') return false;
  return display.headed === false || !!(display.fallback && display.fallback.rung === 'hidden-window');
}

/**
 * THE THAW'S FLIP TAB IS ONE NO DRIVER TAKES (rows B-98f5 / B-bcf8, lane bl-browser-a, box rows 715-725, 2026-11-24). A frozen
 * page is shown again by its tab strip: a tab opened in front of it, then closed (IDLE_PAINT_PROOF.frozenThenFlip). A driver
 * that sees every tab (the raw road: a conversation's own browser) takes every page tab it is told of: its drain attaches and
 * prepares the tab under its one lock, and a tab that dies mid-prepare holds that lock 30 s (every command of that session
 * waits); unpinned, the tab also becomes its ACTIVE tab, and its going leaves the session on the LAST tab, not its own, with no
 * notice. So the flip tab is born at an address the driver's own filter never takes:
 *   Chromium at 154.0.8037.57, chrome/common/webui_url_constants.h:
 *     `inline constexpr char kChromeUIVersionURL[] = "chrome://version/";`
 *   agent-browser at v0.38.2, cli/src/native/browser.rs (the event road and the connect road, discover_and_attach_targets):
 *     `(target.target_type == "page" || target.target_type == "webview")
 *        && (target.url.is_empty() || !is_internal_chrome_target(&target.url))`
 *     with is_internal_chrome_target = starts with `chrome://`, `chrome-extension://` or `devtools://`.
 * MEASURED (test-browser-hidden-paint probe 10, box row 725: Chrome 154.0.8037.57 + agent-browser 0.38.2 on the raw road): the
 * flip at this address held 0 of 180 (with no command in flight, with commands ending inside its life, asked inside its life:
 * listed by neither a pinned nor an unpinned session); every birth address `chrome://version/`; the unpinned session's next
 * command on its own page every time. The about:blank flip of before: 2 holds of 30 s in 100, and the unpinned session moved to
 * another tab in 35 of 100. The flip at this address shows a frozen front as the blank did (hidden to visible, 30 frames in
 * 500 ms, ten of ten); nothing of it stays (no tab back at a restore, no History row). The hub reads the tab's own birth address
 * every time (browser-dialogs.js showFront, and once before a browser's first freeze): an address the driver would take means
 * that browser is not frozen at all (it paints), said once in the journal (`idle_paint_flip_tab_taken`).
 * A DRIVER UPDATE THAT CHANGES ITS FILTER turns test-browser-tabs's flip pins and test-browser-hidden-paint leg g red: re-read
 * should_track_target at the new tag before the floor moves (src/browser-profiles.js FLOOR_VERSION).
 */
const FLIP_TAB_URL = 'chrome://version/';
const DRIVER_UNTAKEN_PREFIXES = Object.freeze(['chrome://', 'chrome-extension://', 'devtools://']);
/** Would the driver (its should_track_target at v0.38.2) leave a page tab born at this address alone? An EMPTY address is taken. */
function driverLeavesUrl(url) { const u = String(url == null ? '' : url); return u !== '' && DRIVER_UNTAKEN_PREFIXES.some((p) => u.startsWith(p)); }

module.exports = { IDLE_PAINT_MS, IDLE_PAINT_PROOF, IDLE_PAINT_DEFAULT, idlePaintVerdict, unseenRung, FLIP_TAB_URL, DRIVER_UNTAKEN_PREFIXES, driverLeavesUrl };

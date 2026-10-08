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
});

/**
 * Should this browser draw right now? `enabled` = the owner's switch `browser.idlePaintFreeze` (OFF by default, read at
 * each sweep — lane browser-swiftshader-cpu-r2: an unproven thaw never runs by default; off ⇒ never a freeze, and a
 * browser frozen before the switch went off is thawed), `viewers` = live views on it, `lastVerbAt` / `lastViewerAt` = the
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

module.exports = { IDLE_PAINT_MS, IDLE_PAINT_PROOF, idlePaintVerdict, unseenRung };

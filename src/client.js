import { App } from './lib/app.js';
import { sharedGets } from './lib/shared-gets.js';
import { applyUiPrefs, getStateSync } from './lib/utils.js';
import { applyI18nToDom, t } from './lib/i18n.js';
import { showToast } from './lib/utils.js';
import { installIncidentRecorder } from './lib/incident-recorder.js';
import { installTelemetry, track, metric, reportBootTime, installLongTaskWatch, installFetchTimingWatch, recentLongTasks, gpuRenderer, installCompositorStallWatch, installScreenWatch, installInputStamp, recentCompositorStalls } from './lib/telemetry-client.js';
import { continueExit } from './lib/mobile-back.js';
import { restoreSheetOrder } from './lib/sheet-order.js'; // B-78db line 914's cure: the release's stylesheet order back at the bundle's start
import { installSideColumn } from './lib/side-column.js'; // B-78db: the home-screen copy draws under the system's side column (viewport-fit=cover) and reads it
import { wakeKind, fellBehind, WAKE_GAP_MS, CATCH_UP_SETTLE_MS } from './lib/page-wake.js'; // B-8165: the wake's kind, and whether the page fell behind (PURE)
// lane phone-back-reload (round 2): an older VibeSpace page the phone's exit LANDED on goes on back and never boots the
// app — the promise settles only if this page stays (its ONE named load)
// B-360d part 1 (主开发 r2197): A GET IN FLIGHT IS SHARED — every caller that asks the same read (no signal, no body) before it
// lands gets its own copy of the one answer (the load asked sixteen routes twice); nothing is kept after it lands, writes are never
// shared (src/lib/shared-gets.js). Installed here, before the exit hop and the App: every fetch from then on goes through it. The
// imports above run first: a fetch at a module's top level goes unshared
try { window.fetch = sharedGets(window.fetch.bind(window)); } catch { }
try { restoreSheetOrder(); } catch { } // B-78db (主开发 r4115): the six sheets back at their release place in the head — every style injected later wins its ties as at the release
try { installSideColumn(); } catch { } // B-78db (主开发 r3933): cover for the home-screen copy BEFORE the app lays out; html[data-sidecol] read at every resize
const exitHop = continueExit();
installTelemetry(); // BEFORE App: a boot crash must be captured, not silent
installLongTaskWatch(); // main-thread stall ring — feeds the suspend-vs-block verdict below
installFetchTimingWatch(); // the page's last 20 requests (route, ms) — an incident snapshot carries them (lane vault-slow-load)
installCompositorStallWatch(); // rAF-vs-timer discriminator — measures GPU/compositor freezes from inside the page
installScreenWatch(); // DPR changes + screen moves (the owner's two freeze triggers), into the ring the freeze capture carries
installInputStamp(); // pointer/key timestamps — the paint-gap verdict's "a person was there" signal (2.369.339)
window.__vsCompStalls = recentCompositorStalls; // incident snapshots read the ring
setTimeout(() => { try { const g = gpuRenderer(); window.__vsGpu = g; if (g) track('event', 'gpu-renderer', g.slice(0, 120)); } catch { } }, 4000);
// ── Page-SUSPEND wake detector (2.321.0, inc-msp3klen "对话卡在输出直到我发
// 消息"). Best-fit diagnosis: the browser FROZE the page (Page Lifecycle /
// energy saver) — ws frames queue in the renderer while the network process
// keeps auto-answering the server's pings, so the server heartbeat correctly
// sees a live transport and never evicts; on wake everything flushes in one
// burst (11ms for 14.5min of backlog in the capture) at the exact moment the
// user interacts. The page can't prevent the freeze — what it CAN do is make
// the wake VISIBLE (a labelled toast instead of a mystery stall report),
// MEASURE it (telemetry gap), and belt-resync the versioned stores in case
// the queue was dropped rather than flushed. A 5s timer that should never
// gap: >45s between ticks = we were suspended.
{
  let lastTick = Date.now();
  const framesNow = () => { try { return Number(window.app?.ws?.rxCount) || 0; } catch { return 0; } };
  // B-8165: the frames handled when the browser FROZE the page (Page Lifecycle `freeze`) — none is handled from then to the wake.
  // A page only THROTTLED (hidden: one timer a minute) handled every frame live, so without a freeze the count is the wake's own.
  let framesAtFreeze = null;
  try { document.addEventListener('freeze', () => { framesAtFreeze = framesNow(); }, { capture: true }); } catch { }
  setInterval(() => {
    const now = Date.now();
    const gap = now - lastTick;
    lastTick = now;
    const framesBefore = framesAtFreeze != null ? framesAtFreeze : framesNow();
    framesAtFreeze = null;
    // SUSPEND vs MAIN-THREAD BLOCK (2.338.0): a JS task that blocks 45s+ gaps this timer exactly like a page freeze — but it
    // also shows up in the longtask ring; the PURE verdict (src/lib/page-wake.js) sums the gap's long tasks
    let verdict = null;
    try { verdict = wakeKind({ gap, longTasks: recentLongTasks(), now: Date.now() }); } catch { verdict = gap > WAKE_GAP_MS ? 'suspend' : null; }
    if (verdict) {
      try { track('event', `page-${verdict === 'suspend' ? 'suspend' : 'block'}-wake`, `${Math.round(gap / 1000)}s`); } catch { }   // measured at once — a page that freezes again inside the settle still says it
      // belt: re-request store deltas as if we had reconnected (the queued ws
      // frames usually already caught us up — this covers a dropped queue)
      try { getStateSync()?._stateHandler?.(true); } catch { } // was app.stateSync — never assigned, the belt was dead code
      // B-8165: the toast answers what was MISSED, not the sleep — frames that reached the page after the freeze (the held ones,
      // the belt's replies) beyond the count it froze with; a page nobody looks at tells nobody
      setTimeout(() => {
        if (document.visibilityState !== 'visible') return;
        if (fellBehind({ framesBefore, framesAfter: framesNow() })) { try { showToast(t('Browser suspended this page for {n}s — caught up now', { n: Math.round(gap / 1000) })); } catch { } }
      }, CATCH_UP_SETTLE_MS);
    }
  }, 5000);
}
window.addEventListener('DOMContentLoaded', async () => {
  if (exitHop) await exitHop;
  applyUiPrefs(); // DPI zoom + UI font scale BEFORE App measures anything (no post-boot jump)
  applyI18nToDom(); // translate index.html static text BEFORE App reads/moves DOM
  try {
    window.app = new App();
    installIncidentRecorder(window.app); // panic-button rings — after App so ws exists
  } catch (e) {
    track('error', 'App boot crash: ' + (e.message || e), 'constructor', e.stack);
    throw e;
  }
  await window.app.ready;
  reportBootTime(); // nav start → workspace restored (telemetry metric)
  const splash = document.getElementById('loading-screen');
  // the fade takes no clicks: at opacity 0 the splash still covers everything (z-index 999999) until the 300 ms timer
  // removes it — a starved loop stretches that — and it swallowed the first press after the page loaded (B-b122, the
  // .190 heavy red); pointer-events go the moment the fade starts
  if (splash) { splash.style.pointerEvents = 'none'; splash.style.opacity = '0'; setTimeout(() => splash.remove(), 300); }
  // B-78db (主开发 r4111 / r4114): <html>'s inline ground (public/index.html — the first paint in the splash's own colour, in place of
  // WebKit's white) is the LAUNCH's only: it goes as the splash does, so the person's theme (style.css: html, body var(--bg-root))
  // is the page's ground from here on — an inline style would outrank it for the whole session (a light theme kept a dark ground)
  document.documentElement.style.removeProperty('background');
});

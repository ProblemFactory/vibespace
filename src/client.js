import { App } from './lib/app.js';
import { applyUiPrefs } from './lib/utils.js';
import { applyI18nToDom, t } from './lib/i18n.js';
import { showToast } from './lib/utils.js';
import { installIncidentRecorder } from './lib/incident-recorder.js';
import { installTelemetry } from './lib/telemetry-client.js';
installTelemetry(); // BEFORE App: a boot crash must be captured, not silent
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
  setInterval(() => {
    const now = Date.now();
    const gap = now - lastTick;
    lastTick = now;
    if (gap > 45000) {
      try { track('page-suspend-wake', { detail: `${Math.round(gap / 1000)}s` }); } catch { }
      // belt: re-request store deltas as if we had reconnected (the queued ws
      // frames usually already caught us up — this covers a dropped queue)
      try { window.app?.stateSync?._stateHandler?.(true); } catch { }
      try { showToast(t('Browser suspended this page for {n}s — caught up now', { n: Math.round(gap / 1000) })); } catch { }
    }
  }, 5000);
}
window.addEventListener('DOMContentLoaded', async () => {
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
  if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 300); }
});

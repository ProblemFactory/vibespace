import { App } from './lib/app.js';
import { applyUiPrefs } from './lib/utils.js';
import { applyI18nToDom } from './lib/i18n.js';
import { installTelemetry, track, reportBootTime, installOverlapTracer } from './lib/telemetry-client.js';
import { installIncidentRecorder } from './lib/incident-recorder.js';
installTelemetry(); // BEFORE App: a boot crash must be captured, not silent
installOverlapTracer(); // TEMPORARY (code-line overlap diagnosis — see telemetry-client.js)
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

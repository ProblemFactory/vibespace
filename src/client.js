import { App } from './lib/app.js';
import { applyI18nToDom } from './lib/i18n.js';
import { installTelemetry, track, reportBootTime, installOverlapTracer } from './lib/telemetry-client.js';
installTelemetry(); // BEFORE App: a boot crash must be captured, not silent
installOverlapTracer(); // TEMPORARY (code-line overlap diagnosis — see telemetry-client.js)
window.addEventListener('DOMContentLoaded', async () => {
  applyI18nToDom(); // translate index.html static text BEFORE App reads/moves DOM
  try {
    window.app = new App();
  } catch (e) {
    track('error', 'App boot crash: ' + (e.message || e), 'constructor', e.stack);
    throw e;
  }
  await window.app.ready;
  reportBootTime(); // nav start → workspace restored (telemetry metric)
  const splash = document.getElementById('loading-screen');
  if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 300); }
});

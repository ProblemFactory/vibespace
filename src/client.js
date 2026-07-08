import { App } from './lib/app.js';
import { applyI18nToDom } from './lib/i18n.js';
window.addEventListener('DOMContentLoaded', async () => {
  applyI18nToDom(); // translate index.html static text BEFORE App reads/moves DOM
  window.app = new App();
  await window.app.ready;
  const splash = document.getElementById('loading-screen');
  if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 300); }
});

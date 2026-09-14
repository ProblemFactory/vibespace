import { t } from './i18n.js';
import { fetchJson } from './utils.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { createVncView, streamUrl } from './vnc-view.js';

/**
 * In-container desktop window — renders the localhost-bound VNC server
 * through the cookie-authenticated /api/vnc WebSocket bridge (since 2026-09-13
 * the singleton id on the ONE desktop bridge, src/server/desktop-stream.js).
 * Single login: no VNC password, no separate port, no subdomain (see
 * src/vnc.js).
 *
 * The picture itself — noVNC loading, DPI counter-zoom (inc-mtdrm922),
 * resize/scale policy, clipboard, status chip — is the SHARED component
 * src/lib/vnc-view.js, used by every `desktop-app` window too; this file only
 * decides WHAT to show (the singleton) and gates the connect on POST
 * /api/vnc/start. Behaviour is byte-for-byte the pre-extraction window
 * (scripts/test-vnc-view.mjs pins it against the retired file).
 *
 * Singleton per client (one framebuffer, N windows would fight over input).
 */
export function openDesktop(app, { syncId } = {}) {
  for (const [id, win] of app.wm.windows) {
    if (win._isDesktop) { app.wm.focusWindow(id); return win; }
  }
  app._hideWelcome();
  const winInfo = app.wm.createWindow({
    title: t('Desktop'), type: 'desktop', syncId,
    openSpec: { action: 'openDesktop' },
  });
  winInfo._isDesktop = true;

  const view = createVncView(winInfo.content, {
    url: streamUrl('/api/vnc'),
    // start (or adopt) the server first; a failure's own text wins over the generic label
    before: async () => {
      let st = null;
      try { st = await fetchJson('/api/vnc/start', { method: 'POST' }); } catch {}
      if (!st || st.error || !st.running) return { ok: false, error: st?.error || null };
      return { ok: true };
    },
  });

  winInfo.onClose = () => view.dispose();
  view.connect();
  return winInfo;
}

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) ── singleton per client (see above)
registerWindowType({
  type: 'desktop', label: 'Desktop', singleton: true,
  icon: svgIcon16('<rect x="1.5" y="2.5" width="13" height="9" rx="1"/><path d="M8 11.5V14M5 14h6"/>'),
  action: 'openDesktop', replay: (app, spec, { syncId } = {}) => app.openDesktop({ syncId }),
});

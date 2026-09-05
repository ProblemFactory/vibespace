import { t } from './i18n.js';
import { fetchJson, showToast } from './utils.js';
import { registerWindowType, svgIcon16 } from './window-types.js';

// noVNC uses top-level await, which can't live inside our IIFE bundle — it's
// built as a SEPARATE ESM file (public/novnc.js, see the build script) and
// dynamic-imported on first use, so non-desktop users never download it.
// The URL is computed (not a literal) so esbuild leaves the import at runtime.
let _rfbClass = null;
async function loadRFB() {
  if (!_rfbClass) {
    const mod = await import(new URL('/novnc.js', location.origin).href);
    _rfbClass = mod.default;
  }
  return _rfbClass;
}

/**
 * In-container desktop window (noVNC) — renders the localhost-bound VNC
 * server through the cookie-authenticated /api/vnc WebSocket bridge. Single
 * login: no VNC password, no separate port, no subdomain (see src/vnc.js).
 *
 * Singleton per client (one framebuffer, N windows would fight over input).
 * resizeSession asks the server to match the window (TigerVNC RandR);
 * scaleViewport covers servers that can't resize (plain Xvfb).
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

  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#000';
  // COORDINATE SPACES MUST COINCIDE (inc-mtdrm922, owner-reproduced at DPI
  // 90%: the remote XFCE menu highlighted one row ABOVE the cursor): under
  // the body DPI zoom, noVNC mixes viewport px (clientX/getBoundingClientRect)
  // with layout px (clientWidth) — the remote pointer lands ~zoom× off,
  // growing with distance from the canvas origin. Counter-zoom the container
  // so the canvas lives at NET zoom 1: every coordinate space lines up and
  // the framebuffer maps ~1:1 to device pixels (sharper, too). var()-reactive,
  // so a live DPI change keeps it correct.
  container.style.zoom = 'calc(1 / var(--ui-scale, 1))';

  const bar = document.createElement('div');
  bar.className = 'desktop-bar';
  const status = document.createElement('span');
  status.className = 'desktop-status';
  status.textContent = t('Connecting…');
  const pasteBtn = document.createElement('button');
  pasteBtn.className = 'file-tool-btn';
  pasteBtn.style.cssText = 'width:auto;padding:0 8px;font-size:10px';
  pasteBtn.textContent = t('Paste');
  pasteBtn.title = t('Send your clipboard text into the desktop');
  const reBtn = document.createElement('button');
  reBtn.className = 'file-tool-btn';
  reBtn.style.cssText = 'width:auto;padding:0 8px;font-size:10px;display:none';
  reBtn.textContent = t('Reconnect');
  bar.append(status, pasteBtn, reBtn);

  const mount = document.createElement('div');
  mount.style.cssText = 'flex:1;min-height:0;position:relative;overflow:hidden';

  container.append(bar, mount);
  winInfo.content.appendChild(container);

  let rfb = null;
  let closed = false;

  const setStatus = (txt, { error = false, reconnect = false } = {}) => {
    status.textContent = txt;
    status.style.color = error ? 'var(--red, #e55)' : '';
    reBtn.style.display = reconnect ? '' : 'none';
  };

  const connect = async () => {
    if (closed) return;
    setStatus(t('Starting desktop…'));
    let st = null;
    try {
      st = await fetchJson('/api/vnc/start', { method: 'POST' });
    } catch {}
    if (!st || st.error || !st.running) {
      setStatus(st?.error || t('Desktop unavailable on this server'), { error: true, reconnect: true });
      return;
    }
    if (closed) return;
    setStatus(t('Connecting…'));
    let RFB;
    try { RFB = await loadRFB(); }
    catch { setStatus(t('Desktop unavailable on this server'), { error: true, reconnect: true }); return; }
    if (closed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    try { rfb?.disconnect(); } catch {}
    rfb = new RFB(mount, `${proto}://${location.host}/api/vnc`);
    rfb.scaleViewport = true;   // fit when the server can't resize
    rfb.resizeSession = true;   // ask the server to match the window (RandR)
    rfb.addEventListener('connect', () => setStatus(t('Connected')));
    rfb.addEventListener('disconnect', (e) => {
      if (closed) return;
      setStatus(e.detail?.clean ? t('Disconnected') : t('Connection lost'), { error: !e.detail?.clean, reconnect: true });
    });
    // Desktop-side copies surface into the browser clipboard (HTTPS only).
    rfb.addEventListener('clipboard', (e) => {
      const text = e.detail?.text;
      if (text) navigator.clipboard?.writeText(text).catch(() => {});
    });
  };

  pasteBtn.onclick = async () => {
    if (!rfb) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) { rfb.clipboardPasteFrom(text); showToast(t('Clipboard sent')); }
    } catch {
      showToast(t('Clipboard unavailable (needs HTTPS + permission)'), { type: 'error' });
    }
  };
  reBtn.onclick = connect;

  winInfo.onClose = () => {
    closed = true;
    try { rfb?.disconnect(); } catch {}
    rfb = null;
  };

  connect();
  return winInfo;
}

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) ── singleton per client (see above)
registerWindowType({
  type: 'desktop', label: 'Desktop', singleton: true,
  icon: svgIcon16('<rect x="1.5" y="2.5" width="13" height="9" rx="1"/><path d="M8 11.5V14M5 14h6"/>'),
  action: 'openDesktop', replay: (app, spec, { syncId } = {}) => app.openDesktop({ syncId }),
});

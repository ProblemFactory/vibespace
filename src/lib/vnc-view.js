// THE SHARED PICTURE VIEW (docs/design-desktop-apps.zh.md §2 row 6; P8-1,
// 2026-09-13) — the noVNC loading, DPI counter-zoom, resize/scale policy,
// focus + input forwarding, clipboard, status chip and (optional) reconnect
// ladder that used to live inline in desktop-window.js, extracted so the
// singleton Desktop window and every `desktop-app` window render through ONE
// component instead of a twin. It knows NO window type: the caller hands it
// a host element, a ws url and a `before` gate (the singleton's POST
// /api/vnc/start; a desktop app's "is the record ready"), and gets back the
// handles. scripts/test-vnc-view.mjs pins desktop-window's pre-extraction
// behaviour BYTE FOR BYTE against this component (labels, transitions, the
// counter-zoom rule) with the retired file as the control.
import { t } from './i18n.js';
import { showToast, COUNTER_ZOOM } from './utils.js';

// noVNC uses top-level await, which can't live inside our IIFE bundle — it's
// built as a SEPARATE ESM file (public/novnc.js, see the build script) and
// dynamic-imported on first use, so non-desktop users never download it.
// The URL is computed (not a literal) so esbuild leaves the import at runtime.
let _rfbClass = null;
export async function loadRFB() {
  if (!_rfbClass) {
    const mod = await import(new URL('/novnc.js', location.origin).href);
    _rfbClass = mod.default;
  }
  return _rfbClass;
}

/** COORDINATE SPACES MUST COINCIDE (inc-mtdrm922, owner-reproduced at DPI
 *  90%: the remote XFCE menu highlighted one row ABOVE the cursor): under the
 *  body DPI zoom, noVNC mixes viewport px (clientX/getBoundingClientRect) with
 *  layout px (clientWidth) — the remote pointer lands ~zoom× off, growing with
 *  distance from the canvas origin. Counter-zoom the container so the canvas
 *  lives at NET zoom 1: every coordinate space lines up and the framebuffer
 *  maps ~1:1 to device pixels (sharper, too). var()-reactive, so a live DPI
 *  change keeps it correct. Exported so the suite pins the exact rule. */
export { COUNTER_ZOOM }; // the ONE definition is utils.js (shared with every xterm container since 2.369.118)

/** The bounded auto-reconnect ladder (ms) a caller may opt into. */
export const RECONNECT_LADDER = [1000, 2000, 4000, 8000, 15000];

/** The ws url for a stream id — the singleton keeps its historic path. */
export function streamUrl(pathname) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${pathname}`;
}

/**
 * createVncView(host, opts) — mounts the picture view into `host`.
 *   url           — the cookie-authed ws bridge url (streamUrl('/api/vnc') …), or a
 *                   FUNCTION called at every (re)connect (the desktop-app pane mints a
 *                   fresh per-socket viewer id each time — the id is bound to ONE socket)
 *   before        — optional async () => { ok, error } gate run before every
 *                   connect (the singleton starts its server here); `error`
 *                   is shown verbatim when present, else labels.unavailable
 *   labels        — { starting, unavailable } overrides (defaults = the
 *                   singleton Desktop's historic strings)
 *   autoReconnect — false (the Desktop window's behaviour: a Reconnect button
 *                   only) | true (walk RECONNECT_LADDER after an unclean drop)
 *   onStatus      — optional (state, detail) observer: 'starting' | 'connecting'
 *                   | 'connected' | 'disconnected' | 'error'
 *   loadRFB       — injectable loader (the node suite hands a fake RFB)
 * Returns { container, bar, mount, status, connect, disconnect, setStatus,
 *           addControl, focus, get rfb(), dispose }.
 */
export function createVncView(host, { url, before = null, labels = {}, autoReconnect = false, onStatus = null, loadRFB: loader = loadRFB } = {}) {
  const L = { starting: t('Starting desktop…'), unavailable: t('Desktop unavailable on this server'), ...labels };
  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#000';
  container.style.zoom = COUNTER_ZOOM;

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
  host.appendChild(container);

  let rfb = null;
  let closed = false;
  let wanted = false;   // connect() was asked and nobody has called disconnect()/dispose() since
  let attempt = 0;
  let retryTimer = null;
  let state = 'idle';

  const emit = (s, detail) => { state = s; try { onStatus?.(s, detail); } catch {} };
  const setStatus = (txt, { error = false, reconnect = false } = {}) => {
    status.textContent = txt;
    status.style.color = error ? 'var(--red, #e55)' : '';
    reBtn.style.display = reconnect ? '' : 'none';
  };
  const scheduleRetry = () => {
    if (!autoReconnect || closed) return;
    const wait = RECONNECT_LADDER[Math.min(attempt, RECONNECT_LADDER.length - 1)];
    if (attempt >= RECONNECT_LADDER.length) return; // the ladder is bounded — the button remains
    attempt++;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { if (!closed) connect(); }, wait);
  };

  const connect = async () => {
    if (closed) return;
    wanted = true;
    clearTimeout(retryTimer);
    setStatus(L.starting);
    emit('starting');
    if (before) {
      let gate = null;
      try { gate = await before(); } catch {}
      if (!gate || !gate.ok) {
        setStatus(gate?.error || L.unavailable, { error: true, reconnect: true });
        emit('error', gate?.error || L.unavailable);
        scheduleRetry();
        return;
      }
    }
    if (closed) return;
    setStatus(t('Connecting…'));
    emit('connecting');
    let RFB;
    try { RFB = await loader(); }
    catch { setStatus(L.unavailable, { error: true, reconnect: true }); emit('error', L.unavailable); return; }
    if (closed) return;
    try { rfb?.disconnect(); } catch {}
    rfb = new RFB(mount, typeof url === 'function' ? url() : url);
    rfb.scaleViewport = true;   // fit when the server can't resize
    rfb.resizeSession = true;   // ask the server to match the window (RandR)
    rfb.addEventListener('connect', () => { attempt = 0; setStatus(t('Connected')); emit('connected'); });
    rfb.addEventListener('disconnect', (e) => {
      if (closed) return;
      setStatus(e.detail?.clean ? t('Disconnected') : t('Connection lost'), { error: !e.detail?.clean, reconnect: true });
      emit('disconnected', { clean: !!e.detail?.clean });
      // A server that DIES is a CLEAN close to noVNC (its connected→close path
      // never calls _fail; measured 2026-09-13 on a SIGKILLed server), so the
      // ladder keys on "do we still want the picture", never on `clean`.
      if (wanted) scheduleRetry();
    });
    // Desktop-side copies surface into the browser clipboard (HTTPS only).
    rfb.addEventListener('clipboard', (e) => {
      const text = e.detail?.text;
      if (text) navigator.clipboard?.writeText(text).catch(() => {});
    });
  };

  // 2.369.136 (userW inc-mubu8xdg-pvwa "desktop 的 paste 用不了"): the button
  // used to be a silent no-op on a disconnected view and a one-line toast on
  // every clipboard failure, and the focus stayed on the button so the next
  // keystrokes went nowhere. Now: a disconnected view says so; a refused or
  // empty clipboard opens a PASTE BOX (Ctrl+V lands in a textarea through the
  // `paste` event, which works on plain http and without the permission);
  // every successful send hands the focus back to the desktop.
  let pasteBox = null;
  const closePasteBox = ({ refocus = true } = {}) => { if (pasteBox) { if (pasteBox.parentNode && pasteBox.parentNode.removeChild) pasteBox.parentNode.removeChild(pasteBox); else pasteBox.remove(); pasteBox = null; } if (refocus) focus(); };
  const sendText = (text) => { if (!rfb || !text) return false; rfb.clipboardPasteFrom(text); showToast(t('Clipboard sent')); focus(); return true; };
  const showPasteBox = (why) => {
    if (pasteBox) { pasteBox.querySelector('textarea')?.focus(); return; }
    pasteBox = document.createElement('div');
    pasteBox.className = 'vnc-paste-box';
    const note = document.createElement('div');
    note.className = 'vnc-paste-note';
    note.textContent = why === 'insecure' ? t('This page is not served over HTTPS, so the browser will not hand over the clipboard — paste here instead (Ctrl+V), then Send.')
      : why === 'denied' ? t('The browser refused clipboard access (permission) — paste here instead (Ctrl+V), then Send.')
        : why === 'empty' ? t('The clipboard is empty or holds no text — paste here instead (Ctrl+V), then Send.')
          : t('Clipboard unavailable (needs HTTPS + permission)');
    const ta = document.createElement('textarea');
    ta.className = 'vnc-paste-input'; ta.rows = 3; ta.placeholder = t('Paste text here…');
    const row = document.createElement('div'); row.className = 'vnc-paste-actions';
    const send = document.createElement('button'); send.type = 'button'; send.className = 'file-tool-btn vnc-paste-send'; send.textContent = t('Send');
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'file-tool-btn vnc-paste-cancel'; cancel.textContent = t('Cancel');
    send.onclick = () => { const v = ta.value; if (!v) { ta.focus(); return; } if (sendText(v)) closePasteBox({ refocus: false }); };
    cancel.onclick = () => closePasteBox();
    ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closePasteBox(); } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send.click(); } });
    row.append(send, cancel);
    pasteBox.append(note, ta, row);
    container.insertBefore(pasteBox, mount);   // under the bar, above the picture
    ta.focus();
  };
  pasteBtn.onclick = async () => {
    if (!rfb || state !== 'connected') { showToast(t('The desktop is not connected — reconnect first'), { type: 'error' }); return; }
    let text = null, why = null;
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') why = 'insecure';
    else {
      try { text = await navigator.clipboard.readText(); }
      catch (e) { why = (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) ? 'denied' : 'error'; }
    }
    if (text) { sendText(text); return; }
    // an unclassified failure keeps the retired window's exact toast (the
    // byte-for-byte control) — and opens the box, which is the way out
    if (why === 'error') showToast(t('Clipboard unavailable (needs HTTPS + permission)'), { type: 'error' });
    showPasteBox(why || 'empty');
  };
  reBtn.onclick = () => { attempt = 0; connect(); };

  const disconnect = () => { wanted = false; clearTimeout(retryTimer); try { rfb?.disconnect(); } catch {} rfb = null; };
  const dispose = () => { closed = true; disconnect(); if (pasteBox) { if (pasteBox.parentNode && pasteBox.parentNode.removeChild) pasteBox.parentNode.removeChild(pasteBox); else pasteBox.remove(); pasteBox = null; } };
  /** Extra chrome a window type wants in the bar (inserted before Paste). */
  const addControl = (el) => { bar.insertBefore(el, pasteBtn); return el; };
  const focus = () => { try { rfb?.focus(); } catch {} };

  return { container, bar, mount, status, connect, disconnect, setStatus, addControl, focus, dispose, get rfb() { return rfb; }, get state() { return state; }, get pasteOpen() { return !!pasteBox; }, get wanted() { return wanted; } };
}

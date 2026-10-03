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
//
// SINCE P8-2 chunk x2 (2026-09-22) the chrome + the ladder are the SHARED
// picture shell (picture-shell.js) — the xpra view (xpra-view.js) stands on
// the same bar; this file keeps only what is RFB: loading noVNC, the RFB
// policy writes, its clipboard events and its transitions. The clipboard
// CHROME is the shell's too (the Paste flow + its paste box, 2.369.136; the
// plain-http copy chip, owner acceptance 2): a desktop-side copy used to be a
// silent `navigator.clipboard?.writeText` — nothing at all on plain http.
//
// x5 (docs/design-desktop-apps §7 P8-2 "x5 多客户端 = 单活跃 viewer"):
// `setMode('active'|'watch'|'blocked')` — only the ACTIVE pane drives the
// display (view-only otherwise; noVNC then sends no SetDesktopSize and
// `scaleViewport` fits the picture); becoming active re-asks the server for
// this pane's size. A BLOCKED pane's socket has no server behind it (the
// bridge opens one when it becomes active): noVNC simply waits for the banner.
import { t } from './i18n.js';
import { showToast, COUNTER_ZOOM } from './utils.js';
import { createPictureShell, RECONNECT_LADDER, streamUrl, pageIsSecure, closeWordsKey } from './picture-shell.js';

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

/** The bounded auto-reconnect ladder + the ws url helper live in the shell; re-exported for the callers that import them here. */
export { RECONNECT_LADDER, streamUrl };

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
 *   lastClose     — optional async () => {code} | null: the bridge's own record of the stream's last close (the singleton:
 *                   GET /api/vnc/last-close) — worded into the status chip on a disconnect (lane desktop-keepalive K3)
 * Returns { container, bar, mount, status, connect, disconnect, setStatus,
 *           addControl, focus, get rfb(), dispose }.
 */
export function createVncView(host, { url, before = null, labels = {}, autoReconnect = false, onStatus = null, loadRFB: loader = loadRFB, lastClose = null, credentials = null, resizeSession = true } = {}) {
  const shell = createPictureShell(host, { labels, autoReconnect, onStatus, focus: () => focus(), ladderWords: true }); // K3: the ladder rung + the bridge's words in the chip
  const { container, bar, mount, status, pasteBtn, reBtn, labels: L, setStatus, addControl, emit } = shell;

  let rfb = null;
  let refused = null; // design 014 D1: the RFB whose sign-in was refused / cancelled (its words stay, no retry)
  let rfbLive = false; // K2: noVNC logs "Tried changing state of a disconnected RFB object" for a disconnect() on a dead RFB — never ask
  let mode = 'active'; // x5

  const connect = async () => {
    if (shell.closed) return;
    shell.want();
    setStatus(L.starting);
    emit('starting');
    if (before) {
      let gate = null;
      try { gate = await before(); } catch {}
      if (!gate || !gate.ok) {
        setStatus(gate?.error || L.unavailable, { error: true, reconnect: true });
        emit('error', gate?.error || L.unavailable);
        shell.scheduleRetry(connect);
        return;
      }
    }
    if (shell.closed) return;
    setStatus(t('Connecting…'));
    emit('connecting');
    let RFB;
    try { RFB = await loader(); }
    catch { setStatus(L.unavailable, { error: true, reconnect: true }); emit('error', L.unavailable); return; }
    if (shell.closed) return;
    try { if (rfb && rfbLive) rfb.disconnect(); } catch {}
    rfb = new RFB(mount, typeof url === 'function' ? url() : url);
    rfbLive = true;
    const mine = rfb;
    if (mode !== 'active') { try { rfb.viewOnly = true; } catch {} } // x5: only the active pane drives the display (set BEFORE resizeSession asks)
    rfb.scaleViewport = true;   // fit when the server can't resize
    rfb.resizeSession = true;   // ask the server to match the window (RandR)
    if (!resizeSession) rfb.resizeSession = false; // design 014 D1: never a machine's whole PHYSICAL desktop — its picture is scaled
    // design 014 D1: a server that asks for a sign-in (a Mac's Screen Sharing, a TightVNC service) — the page asks the
    // person (`credentials(types)`) and hands the answer to noVNC ONLY; a refused sign-in stops the ladder (no retry loop)
    if (credentials) {
      rfb.addEventListener('credentialsrequired', async (e) => {
        let c = null;
        try { c = await credentials((e.detail && e.detail.types) || ['password']); } catch { c = null; }
        if (mine !== rfb || shell.closed) return;
        if (!c) { refused = mine; shell.unwant(); try { rfb.disconnect(); } catch {} setStatus(t('Sign-in cancelled'), { reconnect: true }); return; }
        try { rfb.sendCredentials(c); } catch {}
      });
      rfb.addEventListener('securityfailure', (e) => { refused = mine; shell.unwant(); setStatus(t('The machine refused the sign-in: {why}', { why: (e.detail && e.detail.reason) || t('wrong name or password') }), { error: true, reconnect: true }); emit('error', 'securityfailure'); });
    }
    rfb.addEventListener('connect', () => { shell.resetLadder(); shell.setCloseWords(''); setStatus(t('Connected')); emit('connected'); });
    rfb.addEventListener('disconnect', (e) => {
      if (mine === rfb) rfbLive = false;
      if (shell.closed) return;
      if (refused === mine) { emit('disconnected', { clean: false }); return; } // design 014 D1: the sign-in's own words stay
      setStatus(e.detail?.clean ? t('Disconnected') : t('Connection lost'), { error: !e.detail?.clean, reconnect: true });
      emit('disconnected', { clean: !!e.detail?.clean });
      // K3: the bridge's own words for this close (a terminate() sends no frame; noVNC never exposes a reason)
      if (lastClose) Promise.resolve().then(() => lastClose()).then((c) => { const k = c && closeWordsKey(c.code); if (!k || shell.closed || shell.state === 'connected') return; shell.setCloseWords(t(k)); if (!/…/.test(status.textContent)) status.textContent = (e.detail?.clean ? t('Disconnected') : t('Connection lost')) + ' — ' + t(k); }).catch(() => { });
      // A server that DIES is a CLEAN close to noVNC (its connected→close path
      // never calls _fail; measured 2026-09-13 on a SIGKILLed server), so the
      // ladder keys on "do we still want the picture", never on `clean`.
      if (shell.wanted) shell.scheduleRetry(connect);
    });
    // Desktop-side copies surface into the browser clipboard on a secure
    // context (silently, as before) and as the shell's click-to-copy chip on
    // plain http or when the API refuses — never a silent no-op.
    rfb.addEventListener('clipboard', (e) => {
      const text = e.detail?.text;
      if (text) shell.deliverCopy(text, { secure: pageIsSecure(), clipboard: navigator.clipboard, toast: false });
    });
  };

  // browser → desktop: the shell's Paste flow (2.369.136: a dead view says so,
  // a refused / empty / API-less clipboard opens the paste box, every send
  // hands the focus back to the desktop)
  const sendText = (text) => {
    if (!rfb || !text) return false;
    // K2: noVNC drops a paste on a view-only RFB without a word — a watching pane says so instead of "Clipboard sent"
    if (rfb.viewOnly) { showToast(t('This pane is watching — press Resume here to type into the desktop'), { type: 'error' }); return false; }
    rfb.clipboardPasteFrom(text); showToast(t('Clipboard sent')); focus(); return true;
  };
  pasteBtn.onclick = () => shell.pasteFromClipboard({
    connected: () => !!rfb && shell.state === 'connected',
    notConnected: t('The desktop is not connected — reconnect first'),
    send: sendText,
    clipboard: typeof navigator !== 'undefined' ? navigator.clipboard : null,
    // K2: a press is intent — a stream that is not connecting already is (re)started now
    reconnect: () => { if (shell.state === 'starting' || shell.state === 'connecting') return; shell.resetLadder(); connect(); },
  });
  reBtn.onclick = () => { shell.resetLadder(); connect(); };

  const disconnect = () => { shell.unwant(); try { rfb?.disconnect(); } catch {} rfb = null; };
  const dispose = () => { shell.close(); disconnect(); };
  const focus = () => { try { rfb?.focus(); } catch {} };
  /** x5: 'active' drives the display (and re-asks for this pane's size), 'watch' / 'blocked' are view-only. */
  const setMode = (m) => {
    const next = m === 'watch' || m === 'blocked' ? m : 'active';
    if (next === mode) return;
    mode = next;
    try { if (rfb) { rfb.viewOnly = mode !== 'active'; if (mode === 'active') rfb.resizeSession = resizeSession; } } catch {}
  };

  return { container, bar, mount, status, copyChip: shell.copyChip, connect, disconnect, setStatus, addControl, focus, dispose, setMode, get mode() { return mode; }, get rfb() { return rfb; }, get state() { return shell.state; }, get wanted() { return shell.wanted; }, get pasteOpen() { return shell.pasteOpen; }, get copiedText() { return shell.copiedText; } };
}

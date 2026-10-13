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
import { installSubtleFallback } from './aes-fallback.js';
import { clientCuts, updateTimer, rfbScreens, cursorPlan, scaleRgba } from '../desktop-screens.js'; // lane desktop-v2-entry: the stats' timing table + the -308 skimmer
import { qualityPlan, pictureChanging, sentInput, refreshRequest, pasteChord, pasteText, STILL_MS } from '../desktop-quality.js'; // lane desktop-v2-latency

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
/** The stream KIND this view shows (a record's `stream`) — desktop-app-window.js registers the view under it. */
export const STREAM_KIND = 'rfb';
/** lane mac-ard-signin: how long a sign-in handed to noVNC may go unanswered before the view says it could not complete. */
export const SIGNIN_BOUND_MS = 20000;

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
 *   channel       — lane desktop-v2-entry: true = this view opens the WebSocket itself and hands it to noVNC (1.7 takes a
 *                   channel); every FramebufferUpdateRequest it sends is timed (`stats()` — the update round trip + fps)
 *   onScreens     — optional (screens[]) observer: the server's ExtendedDesktopSize screen rects (the patched noVNC's
 *                   `vsscreens`, read by the PURE rfbScreens); `setCrop(rect|null)` shows one rect of the framebuffer, scaled
 *   ladder        — lane desktop-v2-latency (needs `channel`): THE QUALITY LADDER — the PURE qualityPlan re-asked at every input
 *                   and every update request; a new rung = ONE SetEncodings; `onQuality(plan)` observes it; `quality` reads it
 *   pasteKeys     — lane desktop-v2-latency: Ctrl/⌘+V in the picture sends the page's clipboard text (ClientCutText), then the V
 *   lastClose     — optional async () => {code} | null: the bridge's own record of the stream's last close (the singleton:
 *                   GET /api/vnc/last-close) — worded into the status chip on a disconnect (lane desktop-keepalive K3)
 * Returns { container, bar, mount, status, connect, disconnect, setStatus,
 *           addControl, focus, get rfb(), dispose }.
 */
export function createVncView(host, { url, before = null, labels = {}, autoReconnect = false, onStatus = null, loadRFB: loader = loadRFB, lastClose = null, credentials = null, resizeSession = true, channel = false, onScreens = null, ladder = false, onQuality = null, pasteKeys = false } = {}) {
  const shell = createPictureShell(host, { labels, autoReconnect, onStatus, focus: () => focus(), ladderWords: true }); // K3: the ladder rung + the bridge's words in the chip
  const { container, bar, mount, status, pasteBtn, reBtn, labels: L, setStatus, addControl, emit } = shell;

  let rfb = null;
  // lane win-desktop-cursor-hdr: the pointer's path now ({path, factor, side} — the stats row says it) and, once a pointer was
  // too big to draw here, the machine paints it for the rest of this view (every reconnect leaves the pseudo-encodings out)
  let cursorNow = null, serverCursor = false;
  let refused = null; // design 014 D1: the RFB whose sign-in was refused / cancelled (its words stay, no retry)
  let rfbLive = false; // K2: noVNC logs "Tried changing state of a disconnected RFB object" for a disconnect() on a dead RFB — never ask
  let mode = 'active'; // x5
  let timer = updateTimer(); // lane desktop-v2-entry: FramebufferUpdateRequest out → the next one (a fresh table per connect)
  let crop = null; // the rect of the framebuffer shown (null = all of it) — kept across reconnects
  // lane desktop-v2-latency: the applied rung, the last input / picture change, the link's slow verdict, the settle timer, our socket
  let quality = null, lastActive = null, slowLink = false, stillT = null, liveCh = null;
  // lane mac-ard-signin (owner 2026-10-12: the Mac's name + password typed, then 连接中… for 268 s): the sign-in handed to
  // noVNC and not answered yet — { rfb, timer, off }. It ends at 'connect', at a refusal, or as a NAMED failure: noVNC's
  // async auth rejecting (it has no error event — the rejection is unhandled, so this view listens for one from noVNC's
  // own code while it waits), 20 s of silence, or the socket closing before the desktop came. Never 连接中… past a sign-in.
  let signing = null;
  const endSignIn = () => { if (!signing) return; clearTimeout(signing.timer); signing.off(); signing = null; };
  const signInFailed = (mine, why) => {
    if (mine !== rfb || shell.closed || refused === mine) return;
    endSignIn();
    refused = mine; shell.unwant(); // its words stay (the disconnect that follows keeps them) and the ladder does not re-ask the sign-in
    setStatus(t('The sign-in could not be completed: {why}', { why }), { error: true, reconnect: true });
    emit('error', 'signin');
    if (rfbLive) { try { mine.disconnect(); } catch {} }
  };

  const connect = async () => {
    if (shell.closed) return;
    endSignIn();
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
    // lane mac-ard-signin: a Mac's ARD sign-in encrypts with WebCrypto, which an http page (not a secure context) lacks —
    // the PURE AES stands in as an own `crypto.subtle` there (src/lib/aes-fallback.js); a secure context never sees it
    if (credentials) installSubtleFallback(globalThis.crypto);
    const u = typeof url === 'function' ? url() : url;
    let ch = null;
    if (channel) {
      // lane desktop-v2-entry: our own socket, handed to noVNC — its sends are read (types only) for the timing table
      const t0 = timer = updateTimer();
      ch = new WebSocket(u);
      const send0 = ch.send.bind(ch);
      // lane desktop-v2-latency: the request's incremental flag (a full refresh is not a change) and the person's input (the ladder)
      ch.send = (d) => {
        let asked = false, changed = false, input = false;
        try { const b = d instanceof Uint8Array ? d : new Uint8Array(d); const now = performance.now(); for (const m of clientCuts(b)) { if (m.type === 3) { if (t0.request(now, b[m.at + 1] !== 0)) changed = true; asked = true; } else if (sentInput(m.type, b, m.at)) input = true; } } catch { /* never in the way of the bytes */ }
        const r = send0(d);
        // after the send: noVNC's flush() resets its send queue only once this returns — a quality write in here would
        // append SetEncodings to the queue being sent and send the input's bytes twice (measured in test-desktop-v2-latency)
        if (input || asked) queueMicrotask(() => judge(input ? 'input' : changed ? 'change' : 'request'));
        return r;
      };
      ch.addEventListener('message', (e) => { try { t0.received(performance.now(), (e.data && (e.data.byteLength || e.data.size)) || 0); } catch { /* the bytes are noVNC's */ } });
      liveCh = ch;
    }
    rfb = new RFB(mount, ch || u);
    rfbLive = true;
    const mine = rfb;
    if (mode !== 'active') { try { rfb.viewOnly = true; } catch {} } // x5: only the active pane drives the display (set BEFORE resizeSession asks)
    rfb.scaleViewport = true;   // fit when the server can't resize
    rfb.resizeSession = true;   // ask the server to match the window (RandR)
    if (!resizeSession) rfb.resizeSession = false; // design 014 D1: never a machine's whole PHYSICAL desktop — its picture is scaled
    if (crop) { try { rfb.vsCrop = crop; } catch { /* an unpatched noVNC: the whole screen */ } }
    // lane win-desktop-cursor-hdr (owner 2026-10-13 "鼠标如此巨大"): the machine's pointer at the picture's scale (the patched
    // noVNC asks vsCursor for each image and again when the scale changes); one past 128 px → the machine paints it (a
    // second SetEncodings without the pointer pseudo-encodings, sent after the message being read) and a dot marks ours
    rfb.vsServerCursor = serverCursor;
    rfb.vsCursor = (img, scale) => {
      const dot = mine.constructor.cursors && mine.constructor.cursors.dot;
      if (serverCursor) return dot || null;
      const p = cursorPlan(img, scale);
      if (!(img && img.w > 0 && img.h > 0)) return null;
      cursorNow = { path: p.path, factor: p.factor, side: Math.max(img.w, img.h) };
      if (p.path === 'server') {
        serverCursor = true; mine.vsServerCursor = true;
        queueMicrotask(() => { try { if (mine === rfb && rfbLive) mine._sendEncodings(); } catch { /* gone */ } });
        return dot || null;
      }
      return p.path === 'scaled' ? { rgbaPixels: scaleRgba(img.rgbaPixels, img.w, img.h, p.w, p.h), hotx: p.hotx, hoty: p.hoty, w: p.w, h: p.h } : null;
    };
    // lane desktop-v2-latency: the first rung rides noVNC's own first SetEncodings (written before 'connect', nothing extra is sent)
    if (ladder) { clearTimeout(stillT); stillT = null; lastActive = null; quality = qualityPlan({ slow: slowLink }); try { rfb.qualityLevel = quality.qualityLevel; rfb.compressionLevel = quality.compressionLevel; } catch { /* noVNC's defaults */ } if (onQuality) { try { onQuality(quality); } catch { /* the observer's own */ } } }
    if (onScreens) rfb.addEventListener('vsscreens', (e) => { if (mine !== rfb) return; const sc = rfbScreens(e.detail && e.detail.bytes); if (sc) { try { onScreens(sc); } catch { /* the observer's own */ } } });
    // design 014 D1: a server that asks for a sign-in (a Mac's Screen Sharing, a TightVNC service) — the page asks the
    // person (`credentials(types)`) and hands the answer to noVNC ONLY; a refused sign-in stops the ladder (no retry loop)
    if (credentials) {
      rfb.addEventListener('credentialsrequired', async (e) => {
        let c = null;
        try { c = await credentials((e.detail && e.detail.types) || ['password']); } catch { c = null; }
        if (mine !== rfb || shell.closed) return;
        if (!c) { refused = mine; shell.unwant(); try { rfb.disconnect(); } catch {} setStatus(t('Sign-in cancelled'), { reconnect: true }); return; }
        try { rfb.sendCredentials(c); } catch (err) { signInFailed(mine, String((err && err.message) || err).slice(0, 160)); return; }
        endSignIn();
        setStatus(t('Signing in…'));
        const onRejection = (ev) => { const r = ev && ev.reason; if (/novnc/i.test(String((r && r.stack) || ''))) signInFailed(mine, String((r && r.message) || r).slice(0, 160)); };
        globalThis.addEventListener?.('unhandledrejection', onRejection);
        signing = { rfb: mine, timer: setTimeout(() => signInFailed(mine, t('the machine did not answer in {n} s', { n: SIGNIN_BOUND_MS / 1000 })), SIGNIN_BOUND_MS), off: () => globalThis.removeEventListener?.('unhandledrejection', onRejection) };
      });
      rfb.addEventListener('securityfailure', (e) => { if (signing && signing.rfb === mine) endSignIn(); refused = mine; shell.unwant(); setStatus(t('The machine refused the sign-in: {why}', { why: (e.detail && e.detail.reason) || t('wrong name or password') }), { error: true, reconnect: true }); emit('error', 'securityfailure'); });
    }
    rfb.addEventListener('connect', () => { if (signing && signing.rfb === mine) endSignIn(); shell.resetLadder(); shell.setCloseWords(''); setStatus(t('Connected')); emit('connected'); });
    rfb.addEventListener('disconnect', (e) => {
      if (mine === rfb) rfbLive = false;
      if (shell.closed) return;
      if (signing && signing.rfb === mine) signInFailed(mine, t('the machine closed the connection')); // lane mac-ard-signin: a close while signing in
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

  // lane desktop-v2-latency (design q-030 §4): THE QUALITY LADDER. An input or an update request re-asks the PURE plan (a request
  // that closed a change counts the picture as moving when the timing table says so — never our own refresh, which would
  // re-read the last second's changes and flip back to fluid once); a still screen is re-asked by a timer STILL_MS after the
  // last activity. A new rung = ONE SetEncodings: noVNC re-sends them on each quality / compression write, so the compression
  // rides the quality write. Becoming still also asks ONCE for the shown display again (non-incremental): a still screen sends
  // nothing, so what was drawn on the fluid rung would stay blurry.
  const judge = (cause, now = performance.now()) => {
    if (!ladder || !rfb || shell.state !== 'connected') return;
    const st = timer.stats(now);
    const moving = cause === 'input' || (cause === 'change' && pictureChanging(st));
    if (moving) lastActive = now;
    const p = qualityPlan({ moving, idleMs: lastActive == null ? null : now - lastActive, kbps: st.kbps, slow: slowLink });
    slowLink = p.slow;
    clearTimeout(stillT); stillT = null;
    if (!p.still) stillT = setTimeout(() => { stillT = null; judge('timer'); }, Math.max(20, STILL_MS - (now - lastActive)) + 5);
    const was = quality;
    quality = p;
    if (was && was.rung === p.rung) { if (onQuality && (was.why !== p.why || was.slow !== p.slow)) { try { onQuality(p); } catch { /* the observer's own */ } } return; }
    try {
      if (rfb.qualityLevel !== p.qualityLevel) { rfb._compressionLevel = p.compressionLevel; rfb.qualityLevel = p.qualityLevel; }
      else if (rfb.compressionLevel !== p.compressionLevel) rfb.compressionLevel = p.compressionLevel;
    } catch { /* noVNC refused a level */ }
    if (p.still && was && !was.still && liveCh && liveCh.readyState === 1) {
      const fb = fbSize(); const area = crop || (fb && { x: 0, y: 0, w: fb.w, h: fb.h });
      if (area) { try { liveCh.send(refreshRequest(area)); } catch { /* the socket is closing */ } }
    }
    if (onQuality) { try { onQuality(p); } catch { /* the observer's own */ } }
  };
  // lane desktop-v2-latency (design q-030 §4): local → remote. Ctrl/⌘+V in the picture is kept from noVNC (its keydown handler
  // cancels the key, and a cancelled key raises no `paste` — measured in Chrome 154); the browser's own paste then lands on the
  // focused canvas: its text/plain goes as ClientCutText, then the V (the machine pastes what it now holds; the Ctrl/⌘ noVNC sent
  // is still down there). Nothing to paste ⇒ the V alone. Text only; a secret pasted is the person's own act — no guard, no log.
  if (pasteKeys) {
    let chord = null, chordT = null;
    const pressV = (k) => { try { if (rfb && !rfb.viewOnly) rfb.sendKey(k.keysym, k.code); } catch { /* not connected */ } };
    mount.addEventListener('keydown', (e) => {
      const k = pasteChord(e);
      if (!k || !rfb || rfb.viewOnly || shell.state !== 'connected') return;
      e.stopPropagation(); // noVNC never sees it — and no preventDefault: the browser's paste must still happen
      chord = k; clearTimeout(chordT);
      chordT = setTimeout(() => { const c = chord; chord = null; if (c) pressV(c); }, 80);
    }, true);
    mount.addEventListener('paste', (e) => {
      if (!rfb || rfb.viewOnly) return;
      e.preventDefault();
      const text = pasteText(e.clipboardData ? e.clipboardData.getData('text/plain') : null);
      if (text) { try { rfb.clipboardPasteFrom(text); } catch { /* not connected */ } }
      const c = chord; chord = null; clearTimeout(chordT);
      if (c) pressV(c);
    });
  }

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

  const disconnect = () => { endSignIn(); clearTimeout(stillT); stillT = null; shell.unwant(); try { rfb?.disconnect(); } catch {} rfb = null; };
  const dispose = () => { shell.close(); disconnect(); };
  const focus = () => { try { rfb?.focus(); } catch {} };
  /** x5: 'active' drives the display (and re-asks for this pane's size), 'watch' / 'blocked' are view-only. */
  const setMode = (m) => {
    const next = m === 'watch' || m === 'blocked' ? m : 'active';
    if (next === mode) return;
    mode = next;
    try { if (rfb) { rfb.viewOnly = mode !== 'active'; if (mode === 'active') rfb.resizeSession = resizeSession; } } catch {}
  };

  /** lane desktop-v2-entry: show ONE rect of the framebuffer (fb pixels), scaled to the pane — or all of it (null). Never reconnects. */
  const setCrop = (r) => { crop = r && r.w > 0 && r.h > 0 ? { x: r.x, y: r.y, w: r.w, h: r.h } : null; try { if (rfb) rfb.vsCrop = crop; } catch { /* unpatched */ } };
  const fbSize = () => { try { return rfb && rfb._fbWidth > 0 ? { w: rfb._fbWidth, h: rfb._fbHeight } : null; } catch { return null; } };
  const stats = () => timer.stats(performance.now());
  return { setCrop, fbSize, stats, get cursor() { return cursorNow; }, get crop() { return crop; }, get quality() { return quality; }, container, bar, mount, status, copyChip: shell.copyChip, connect, disconnect, setStatus, addControl, focus, dispose, setMode, get mode() { return mode; }, get rfb() { return rfb; }, get state() { return shell.state; }, get wanted() { return shell.wanted; }, get pasteOpen() { return shell.pasteOpen; }, get copiedText() { return shell.copiedText; } };
}

// THE PICTURE SHELL (P8-2 chunk x2, 2026-09-22) — what every remote-picture
// view shares, extracted from vnc-view.js when the xpra view arrived so the
// two views are ONE bar and ONE ladder instead of a twin: the counter-zoomed
// container (inc-mtdrm922: the picture lives at NET zoom 1 under the UI
// scale), the `.desktop-bar` with its status chip / Paste / hidden Reconnect,
// the mount, `setStatus`, `addControl`, and the BOUNDED reconnect ladder keyed
// on `wanted` (connect() was asked and nobody called disconnect()/dispose()
// since — never on a transport's "clean" flag, measured 2026-09-13: a
// SIGKILLed server is a CLEAN close to noVNC). It knows NO protocol: the
// view that owns it decides what a connect is; the shell only keeps the
// chrome and the ladder honest.
// THE CLIPBOARD CHROME is shell too (owner acceptance 2, 2026-09-21 — both
// ways, on EVERY rung: the fleet image has no xpra 6.x, so the RFB rung is
// what most users see): the Paste flow + its PASTE BOX (2.369.136, userW
// inc-mubu8xdg-pvwa — a dead view says so; a refused / empty / API-less
// clipboard opens a textarea whose native paste works on plain http and on a
// touch screen; every send hands the focus back) and the COPY CHIP (a copy
// made inside the remote app goes to navigator.clipboard on a secure context;
// on plain http a copy the user's OWN copy chord caused, arriving inside the
// browser's 5 s activation window, is written by execCommand with no click
// (round 3, A1 — the view stamps the chord, `clipboardDelivery` judges its
// age); anything else — and an API refusal — is "Copied in the app — click to
// copy", which copies through the click's user gesture; the first chip on a
// plain-http page of this device also shows the one-time "Enable HTTPS for
// seamless copy" hint with the docs link). A view hands in only its
// own send / focus / secure-context facts. scripts/test-vnc-view.mjs pins the literals
// (the retired desktop-window.js is its control) across vnc-view.js AND this
// file; scripts/test-xpra-client.mjs censuses that `.desktop-bar` is built
// here and nowhere else.
// SEAMLESS (round 3 lane B, docs/design-desktop-apps-seamless §3.3): the
// container carries `.picture-shell` so a seamless window's CSS can fold the
// bar into its 0-height hot zone; `setFloatingChip(true)` makes the copy chip
// (and the one-time hint) a FLOATING chip at the pane's top-right while the
// bar is folded — it hides itself after FLOATING_CHIP_MS (the design's honest
// list: "pane 右上角浮 chip，10 s 自隐"), the click still copies.
import { t } from './i18n.js';
import { COUNTER_ZOOM, showToast } from './utils.js';
import { UI_ICONS } from './icons.js';

/** A floating copy chip (a seamless window's folded bar) hides itself after this long. */
export const FLOATING_CHIP_MS = 10000;

/** The bounded auto-reconnect ladder (ms) a caller may opt into. */
export const RECONNECT_LADDER = [1000, 2000, 4000, 8000, 15000];

/** Chrome's transient user activation lasts 5 s (MEASURED 2026-09-23, docs/design-desktop-apps-seamless §2.1 M1: an
 *  asynchronous execCommand('copy') on plain http succeeds 0…4800 ms after a trusted Ctrl+C, fails from 5200 ms). */
export const GESTURE_WINDOW_MS = 5000;

/** THE PASTE PRESS SAYS WHAT HAPPENED, EVERY TIME (lane desktop-keepalive K2, userW inc-muoshmqn-dect: two presses,
 *  nothing visible, NO toast in the ring). The .198 flow had two silent paths, both reproduced in test-vnc-view §9:
 *  the paste box opened WITHOUT a toast (a plain-http page, a refused permission, an empty clipboard — a box the eye
 *  can miss under the bar), and a `readText()` that never settles (a permission prompt nobody answers) did nothing at
 *  all. Now: every press is said (a toast — the ring keeps it), the read has a deadline, and a press while the stream
 *  is not connected QUEUES the text, kicks the reconnect (a press is intent) and pastes when the stream is back —
 *  or says, after PASTE_WAIT_MS, that it was not pasted. PURE verdict: state → 'send' | 'queue' | 'refuse'. */
export const PASTE_WAIT_MS = 30000;
export const CLIPBOARD_READ_MS = 3000;
export function pasteVerdict(state, { closed = false } = {}) {
  if (closed) return 'refuse';
  if (state === 'connected') return 'send';
  if (state === 'idle' || !state) return 'refuse';  // the view never started a stream
  return 'queue';                                     // starting / connecting / disconnected / error
}
/** The words of a box opening (every box opening is SAID — a toast — never only drawn). */
export function pasteBoxToastKey(why) {
  return why === 'insecure' ? 'This page cannot read your clipboard — paste into the box under the bar, then Send'
    : why === 'denied' ? 'The browser refused clipboard access — paste into the box under the bar, then Send'
      : why === 'timeout' ? 'The browser is still asking for clipboard permission — answer it, or paste into the box under the bar'
        : 'Your clipboard holds no text — paste into the box under the bar, then Send';
}
/** The bridge's last close code (GET /api/vnc/last-close `code`) → the status chip's words (null = say nothing more). */
export function closeWordsKey(code) {
  return code === 'unanswered' ? 'the browser stopped answering'
    : code === 'server-closed' ? 'the desktop server closed the stream'
      : code === 'browser-closed' ? 'the connection dropped'
        : code === 'session-ended' ? 'the desktop session ended'
          : code === 'blocked' ? 'another window is driving it'
            : null;
}

/** Where a copy made inside the remote app goes (round 3, A1 — docs/design-desktop-apps-seamless §3.1):
 *    'api'     — the async Clipboard API: a secure context that has it (unchanged);
 *    'gesture' — plain http, and the user's OWN copy chord in this pane (Ctrl/⌘+C, +X) was pressed `gestureAge` ms
 *                ago, inside the browser's activation window: execCommand('copy') on a hidden textarea, NO click
 *                (the browser's own return value is the second gate — false ⇒ the chip);
 *    'chip'    — anything else (a copy nobody made on this page: an agent, a timer, another client; a stale or
 *                missing gesture): the click-to-copy chip — never a silent no-op (owner acceptance 2). */
export function clipboardDelivery({ secure = false, canWrite = false, gestureAge = null } = {}) {
  if (secure && canWrite) return 'api';
  return typeof gestureAge === 'number' && Number.isFinite(gestureAge) && gestureAge >= 0 && gestureAge < GESTURE_WINDOW_MS ? 'gesture' : 'chip';
}

/** THE ONE-TIME HTTPS HINT (A1): the first time this DEVICE needs the chip on a plain-http page, one line says how the
 *  copy becomes seamless and links the docs section (three routes; the product serves no TLS). Per device = localStorage. */
export const COPY_HINT_KEY = 'vibespace.desktopCopyHintShown';
export const HTTPS_DOCS_URL = 'https://github.com/ProblemFactory/vibespace/blob/master/docs/getting-started.md#https-for-seamless-copy';
/** Is the hint due? Only on a NON-secure page, only while this device has never shown it (storage unreadable ⇒ not due). */
export function copyHintDue({ secure = false, storage = null } = {}) {
  if (secure || !storage) return false;
  try { return !storage.getItem(COPY_HINT_KEY); } catch { return false; }
}

/** The page's secure-context fact ('unknown' outside a browser counts as NOT secure). */
export function pageIsSecure() {
  return typeof isSecureContext !== 'undefined' ? !!isSecureContext : false;
}

/** Copies through a user gesture without the async API (plain http). select() FOCUSES the temporary textarea and its
 *  removal drops the focus to <body>, so the element that held it (the pane's IME) gets it back ({preventScroll}) —
 *  else every key after a Ctrl+C in the app is swallowed with no sign (desktop A r1, measured on the real rung). */
export function copyViaSelection(text, doc = document) {
  const prev = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
  const ta = doc.createElement('textarea');
  ta.value = String(text ?? '');
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  doc.body.appendChild(ta);
  let ok = false;
  try { ta.select(); ta.setSelectionRange(0, ta.value.length); ok = !!doc.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  if (prev && doc.activeElement !== prev && typeof prev.focus === 'function') { try { prev.focus({ preventScroll: true }); } catch {} }
  return ok;
}

/** The ws url for a stream id — the singleton keeps its historic path. */
export function streamUrl(pathname) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${pathname}`;
}

/**
 * createPictureShell(host, opts) — mounts the chrome into `host`.
 *   labels        — { starting, unavailable } (the singleton Desktop's historic
 *                   strings by default)
 *   autoReconnect — false (a Reconnect button only) | true (walk RECONNECT_LADDER
 *                   after a drop while still wanted)
 *   onStatus      — optional (state, detail) observer
 *   background    — the mount's background colour (the RFB view keeps the
 *                   retired '#000'; the xpra pane is a theme var — no root, no black)
 *   focus         — the view's own focus (the paste box hands the focus back to it)
 * Returns { container, bar, mount, status, pasteBtn, reBtn, copyChip, labels, setStatus,
 *           addControl, emit, scheduleRetry, resetLadder, want, unwant,
 *           pasteFromClipboard, openPasteBox, closePasteBox, deliverCopy,
 *           showCopied, hideCopied, close, get state(), get wanted(), get closed(),
 *           get pasteOpen(), get copiedText() }.
 * `scheduleRetry(connect)` arms the next rung with the caller's own connect;
 * `want()`/`unwant()` flip the ladder's key; `close()` ends everything.
 */
export function createPictureShell(host, { labels = {}, autoReconnect = false, onStatus = null, background = '#000', focus = null, ladderWords = false } = {}) {
  const L = { starting: t('Starting desktop…'), unavailable: t('Desktop unavailable on this server'), ...labels };
  const container = document.createElement('div');
  container.className = 'picture-shell';
  // the retired window's literal, verbatim (test-vnc-view §2 pins it); a view may recolour it
  const containerCss = 'display:flex;flex-direction:column;height:100%;background:#000';
  container.style.cssText = background === '#000' ? containerCss : containerCss.replace('#000', background);
  container.style.zoom = COUNTER_ZOOM;

  const bar = document.createElement('div');
  bar.className = 'desktop-bar';
  const status = document.createElement('span');
  status.className = 'desktop-status';
  status.textContent = t('Connecting…');
  const pasteBtn = document.createElement('button');
  pasteBtn.className = 'file-tool-btn desktop-paste';
  pasteBtn.style.cssText = 'width:auto;padding:0 8px;font-size:10px';
  pasteBtn.textContent = t('Paste');
  pasteBtn.title = t('Send your clipboard text into the desktop');
  const reBtn = document.createElement('button');
  reBtn.className = 'file-tool-btn';
  reBtn.style.cssText = 'width:auto;padding:0 8px;font-size:10px;display:none';
  reBtn.textContent = t('Reconnect');
  // the copy chip sits AFTER Reconnect so `addControl` (before Paste) keeps its slots; hidden until a copy needs a click
  const copyChip = document.createElement('button');
  copyChip.className = 'file-tool-btn desktop-copied-chip';
  copyChip.style.cssText = 'width:auto;padding:0 8px;font-size:10px';
  copyChip.style.display = 'none';
  copyChip.textContent = t('Copied in the app — click to copy');
  copyChip.title = t('The application put text on its clipboard; this page cannot write yours without a click (plain http)');
  // the one-time HTTPS hint (A1) rides beside the chip: a sentence, a docs link, a dismiss — hidden until due
  const copyHint = document.createElement('span');
  copyHint.className = 'desktop-copy-hint';
  copyHint.style.display = 'none';
  const hintText = document.createElement('span');
  hintText.className = 'desktop-copy-hint-text';
  hintText.textContent = t('Enable HTTPS for seamless copy');
  const hintLink = document.createElement('a');
  hintLink.className = 'desktop-copy-hint-link';
  hintLink.href = HTTPS_DOCS_URL; hintLink.target = '_blank'; hintLink.rel = 'noopener';
  hintLink.textContent = t('How to enable HTTPS');
  hintLink.title = t('Three ways to serve this page over HTTPS (the docs)');
  const hintClose = document.createElement('button');
  hintClose.type = 'button';
  hintClose.className = 'file-tool-btn desktop-copy-hint-close';
  hintClose.title = t('Dismiss');
  hintClose.setAttribute('aria-label', t('Dismiss'));
  hintClose.innerHTML = UI_ICONS.close;
  hintClose.onclick = () => { copyHint.style.display = 'none'; };
  copyHint.append(hintText, hintLink, hintClose);
  bar.append(status, pasteBtn, reBtn, copyChip, copyHint);

  const mount = document.createElement('div');
  mount.style.cssText = 'flex:1;min-height:0;position:relative;overflow:hidden';

  container.append(bar, mount);
  host.appendChild(container);

  let closed = false;
  let wanted = false;   // connect() was asked and nobody has called disconnect()/dispose() since
  let attempt = 0;
  let retryTimer = null;
  let state = 'idle';

  let pending = null;    // K2: {text, send, timer} — ONE queued paste (the latest press wins)
  const emit = (s, detail) => {
    state = s; try { onStatus?.(s, detail); } catch {}
    if (s === 'connected' && pending) { const p = pending; pending = null; clearTimeout(p.timer); try { p.send(p.text); } catch {} }
  };
  const queuePaste = (text, send) => {
    if (pending) clearTimeout(pending.timer);
    const p = { text, send, timer: null };
    p.timer = setTimeout(() => { if (pending === p) { pending = null; showToast(t('Not pasted — the desktop did not come back within 30 s; press Reconnect'), { type: 'error' }); } }, PASTE_WAIT_MS);
    pending = p;
  };
  const setStatus = (txt, { error = false, reconnect = false } = {}) => {
    status.textContent = txt;
    status.style.color = error ? 'var(--red, #e55)' : '';
    reBtn.style.display = reconnect ? '' : 'none';
  };
  /** Arms the next rung of the ladder around the caller's connect (a no-op
   *  unless autoReconnect and not closed; the ladder is bounded — the button remains). */
  const scheduleRetry = (connect) => {
    if (!autoReconnect || closed) return;
    const wait = RECONNECT_LADDER[Math.min(attempt, RECONNECT_LADDER.length - 1)];
    if (attempt >= RECONNECT_LADDER.length) return;
    attempt++;
    // K3: the bar counts the ladder ("Reconnecting 2/5…") — the rung the stream is on, never a bare "Connection lost". OPT-IN
    // (`ladderWords`): the VNC view's own chip says only "Connection lost"; the xpra view's already names its reason and keeps it
    if (ladderWords) status.textContent = t('Reconnecting {n}/{total}…', { n: attempt, total: RECONNECT_LADDER.length }) + (lastCloseWords ? ' — ' + lastCloseWords : '');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { if (!closed) connect(); }, wait);
  };
  const resetLadder = () => { attempt = 0; clearTimeout(retryTimer); };
  let lastCloseWords = '';
  /** K3: what the bridge said about the last close, worded (set by the view on a disconnect; '' clears it). */
  const setCloseWords = (w) => { lastCloseWords = String(w || ''); };
  const want = () => { wanted = true; clearTimeout(retryTimer); };
  const unwant = () => { wanted = false; clearTimeout(retryTimer); };
  /** Extra chrome a window type wants in the bar (inserted before Paste). */
  const addControl = (el) => { bar.insertBefore(el, pasteBtn); return el; };
  const focusView = () => { try { focus?.(); } catch {} };

  // ── browser → app: the Paste flow and its PASTE BOX ──
  let pasteBox = null;
  const closePasteBox = ({ refocus = true } = {}) => { if (pasteBox) { if (pasteBox.parentNode && pasteBox.parentNode.removeChild) pasteBox.parentNode.removeChild(pasteBox); else pasteBox.remove(); pasteBox = null; } if (refocus) focusView(); };
  /** The textarea route (`send(text)` → true when it went in; the view toasts + refocuses). */
  const openPasteBox = (why, send) => {
    if (pasteBox) { pasteBox.querySelector('textarea')?.focus(); return; }
    pasteBox = document.createElement('div');
    pasteBox.className = 'vnc-paste-box';
    const note = document.createElement('div');
    note.className = 'vnc-paste-note';
    note.textContent = why === 'insecure' ? t('This page is not served over HTTPS, so the browser will not hand over the clipboard — paste here instead (Ctrl+V), then Send.')
      : why === 'denied' ? t('The browser refused clipboard access (permission) — paste here instead (Ctrl+V), then Send.')
        : why === 'empty' ? t('The clipboard is empty or holds no text — paste here instead (Ctrl+V), then Send.')
          : why === 'timeout' ? t('The browser is still asking for clipboard permission — answer it, or paste here (Ctrl+V), then Send.')
          : t('Clipboard unavailable (needs HTTPS + permission)');
    const ta = document.createElement('textarea');
    ta.className = 'vnc-paste-input'; ta.rows = 3; ta.placeholder = t('Paste text here…');
    const row = document.createElement('div'); row.className = 'vnc-paste-actions';
    const sendBtn = document.createElement('button'); sendBtn.type = 'button'; sendBtn.className = 'file-tool-btn vnc-paste-send'; sendBtn.textContent = t('Send');
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'file-tool-btn vnc-paste-cancel'; cancel.textContent = t('Cancel');
    sendBtn.onclick = () => { const v = ta.value; if (!v) { ta.focus(); return; } if (send(v)) closePasteBox({ refocus: false }); };
    cancel.onclick = () => closePasteBox();
    ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closePasteBox(); } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendBtn.click(); } });
    row.append(sendBtn, cancel);
    pasteBox.append(note, ta, row);
    container.insertBefore(pasteBox, mount);   // under the bar, above the picture
    ta.focus();
  };
  /** The Paste button: a dead view says so (`notConnected`); a readable
   *  clipboard is sent; a refused / empty / API-less one opens the box with
   *  its reason. `clipboard` is the API the view may use (null on plain http). */
  const pasteFromClipboard = async ({ connected, notConnected, send, clipboard, reconnect = null }) => {
    const v = pasteVerdict(connected() ? 'connected' : state, { closed });
    if (v === 'refuse') { showToast(notConnected, { type: 'error' }); return 'refused'; }
    if (v === 'queue') {
      showToast(t('The desktop stream is reconnecting — your text is pasted when it is back'));
      try { reconnect?.(); } catch {}
    }
    // every path that ends in a send goes through deliver: connected ⇒ now, else queued until the stream is back
    const deliver = (text) => { if (connected()) return send(text); queuePaste(text, send); return true; };
    let text = null, why = null;
    if (!clipboard || typeof clipboard.readText !== 'function') why = 'insecure';
    else {
      // a permission prompt nobody answers must not swallow the press: the read has a deadline
      let timer = null;
      try { text = await Promise.race([clipboard.readText(), new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('clipboard read timed out'), { name: 'TimeoutError' })), CLIPBOARD_READ_MS); })]); }
      catch (e) { why = (e && e.name === 'TimeoutError') ? 'timeout' : (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) ? 'denied' : 'error'; }
      finally { clearTimeout(timer); }
    }
    if (text) { deliver(text); return v === 'queue' ? 'queued' : 'sent'; }
    // an unclassified failure keeps the retired window's exact toast (the
    // byte-for-byte control); every other box opening is SAID too (K2)
    if (why === 'error') showToast(t('Clipboard unavailable (needs HTTPS + permission)'), { type: 'error' });
    else showToast(t(pasteBoxToastKey(why || 'empty')));
    openPasteBox(why || 'empty', deliver);
    try { pasteBox?.scrollIntoView?.({ block: 'nearest' }); } catch {}
    return 'box';
  };

  // ── app → browser: the API on a secure context, else the COPY CHIP ──
  let copiedText = null;
  let floating = false, floatTimer = null;
  const hideCopied = () => { copiedText = null; copyChip.style.display = 'none'; clearTimeout(floatTimer); floatTimer = null; };
  /** seamless: the chip floats over the pane (the bar is folded) and goes away by itself after FLOATING_CHIP_MS. */
  const armFloat = () => { clearTimeout(floatTimer); floatTimer = null; if (floating && copiedText != null) floatTimer = setTimeout(() => { floatTimer = null; if (floating) { hideCopied(); copyHint.style.display = 'none'; } }, FLOATING_CHIP_MS); };
  const setFloatingChip = (on) => { floating = !!on; container.classList.toggle('picture-shell-floating-chip', floating); armFloat(); };
  const hintStorage = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };
  /** `insecure` = the chip is shown because the PAGE is plain http (not an API refusal) — the one case the hint names. */
  const showCopied = (text, { insecure = false } = {}) => {
    copiedText = String(text); copyChip.style.display = '';
    armFloat();
    const st = hintStorage();
    if (insecure && copyHintDue({ secure: false, storage: st })) {
      copyHint.style.display = '';
      try { st.setItem(COPY_HINT_KEY, String(Date.now())); } catch {}
    }
  };
  copyChip.onclick = () => {
    if (copiedText == null) return;
    if (copyViaSelection(copiedText)) { showToast(t('Copied to your clipboard')); hideCopied(); }
    else showToast(t('Could not copy — select the text in the app and press Ctrl+C again'), { type: 'error' });
  };
  /** A copy made inside the remote app. `toast` = say so when the API or the gesture took it; `gestureAge` = ms since
   *  the user's own copy chord in this view (null = none). Returns the route taken: 'api' | 'gesture' | 'chip' | null. */
  const deliverCopy = (text, { secure = false, clipboard = null, toast = true, gestureAge = null } = {}) => {
    if (!text) return null;
    const how = clipboardDelivery({ secure, canWrite: !!(clipboard && typeof clipboard.writeText === 'function'), gestureAge });
    if (how === 'gesture') {
      // inside the activation window the browser lets a script copy: no click, no chip — its false ⇒ the chip after all
      if (copyViaSelection(text)) { hideCopied(); if (toast) showToast(t('Copied to your clipboard')); return 'gesture'; }
      showCopied(text, { insecure: !secure });
      return 'chip';
    }
    if (how !== 'api') { showCopied(text, { insecure: !secure }); return 'chip'; }
    let p = null;
    try { p = clipboard.writeText(text); } catch { showCopied(text); return 'chip'; }
    Promise.resolve(p).then(() => { hideCopied(); if (toast) showToast(t('Copied to your clipboard')); }, () => showCopied(text));
    return 'api';
  };

  const close = () => { closed = true; unwant(); closePasteBox({ refocus: false }); clearTimeout(floatTimer); };

  return { setCloseWords, get pendingPaste() { return pending ? pending.text : null; }, container, bar, mount, status, pasteBtn, reBtn, copyChip, copyHint, labels: L, setStatus, addControl, emit, scheduleRetry, resetLadder, want, unwant, close, pasteFromClipboard, openPasteBox, closePasteBox, deliverCopy, showCopied, hideCopied, setFloatingChip, get floatingChip() { return floating; }, get state() { return state; }, get wanted() { return wanted; }, get closed() { return closed; }, get pasteOpen() { return !!pasteBox; }, get copiedText() { return copiedText; }, get hintShown() { return copyHint.style.display !== 'none'; } };
}

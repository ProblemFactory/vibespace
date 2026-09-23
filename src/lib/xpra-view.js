// THE XPRA PICTURE VIEW (docs/design-desktop-apps.zh.md §2 row 6 + §7 P8-2
// chunk x2, 2026-09-22; D21 (c) (b): the window is OURS). The seamless
// counterpart of vnc-view.js on the SAME picture shell (picture-shell.js —
// one bar, one status chip, one Paste, one reconnect ladder): a pane at NET
// zoom 1 under the UI scale (the shell's counter-zoom — inc-mtdrm922's rule),
// ONE canvas per xpra top-level window placed where the session says (the
// app window fills the pane and FOLLOWS its size; dialogs inside it; menus
// where X put them), draws painted in order and acked by xpra-client.js,
// keyboard through a hidden textarea (so an IME composes and
// `compositionend` delivers the text), pointer coordinates taken from the
// pane's own rect (viewport px == layout px at net zoom 1 — never mixed),
// the app's own TITLE and ICON handed to the caller for the title bar, and
// the clipboard BOTH WAYS (owner acceptance 2):
//   browser → app: Ctrl+V is left to the browser so the `paste` EVENT fires
//     and its text goes in as a clipboard token followed by the app's own
//     Ctrl+V — the one path that works on plain http; the Paste chip is the
//     SHELL's flow: it reads the async Clipboard API where the page is a
//     secure context, and otherwise (plain http, a refusal, an empty
//     clipboard) opens the shell's paste box — a textarea whose native paste
//     works on plain http AND on a touch screen, then Send — never a silent
//     no-op; every send hands the focus back to the app.
//   app → browser: a copy inside the app arrives as a token; on a secure
//     context it lands in navigator.clipboard; on plain http (the owner's
//     real address is http://<hostname>:port, NOT loopback — loopback is a
//     secure context and proves nothing) the shell's "Copied in the app —
//     click to copy" chip copies through the click's user gesture
//     (execCommand) and goes away; a refused API write falls to the chip too.
// The pane's background is a THEME VAR: no root, no black (acceptance 1).
// x5 (docs/design-desktop-apps §7 P8-2 "x5 多客户端 = 单活跃 viewer"):
// `setMode('active'|'watch'|'blocked')`. WATCH (an agent drives) draws the
// windows where the server has them and SCALES the whole stage to FIT the
// pane (a CSS transform on the stage — aspect kept, never cropped, CENTRED,
// and since 2.369.156 never upscaled: a pane larger than the app shows it at
// 1:1; nothing is sent back, `resize` included); BLOCKED (another client is active) keeps
// a dormant session the bridge holds back and reconnects it at once when the
// bridge cuts it (close 4001) — the window's overlay covers the pane.
// HiDPI + THE APP'S MINIMUM (2.369.158, docs/design-desktop-apps.zh.md §7.6;
// the owner on a devicePixelRatio-2 screen: "the DPI is way too low" and a
// calculator whose keypad was cut off): the pane speaks CSS px to the page and
// DEVICE px to the session — the client gets the pane × `pixelRatio()` and
// every window canvas is sized in device px with a CSS box of device / ratio,
// so a 2× screen shows the app's pixels 1:1 (crisp) instead of 96-dpi pixels
// blown up; the pointer maps CSS → device (and through the stage's scale).
// The stage's contain-fit is no longer Watch-only: when the app's minimum is
// larger than the pane (a phone, a grid cell narrower than the window's own
// clamp) the ACTIVE picture is scaled to fit — never cropped — with the badge
// "Scaled to fit — the app needs at least {w}×{h}"; `onMinSize({w,h}|null)`
// hands the smallest pane (CSS px) to the window, which clamps its own size.
import { t } from './i18n.js';
import { showToast } from './utils.js';
import { createPictureShell, streamUrl, copyViaSelection } from './picture-shell.js';
import { createXpraClient, defaultDecode } from './xpra-client.js';
import { minPaneCss, pixelRatioOf, backingSize } from './xpra-proto.js';

export { streamUrl, copyViaSelection };

const RESIZE_DEBOUNCE_MS = 150;
const Z_BASE = { main: 1000, dialog: 200000, popup: 300000 };

/** bytes → a data: URL (PNG); the base64 alphabet is validated on the way OUT
 *  (the string reaches an <img>.src / a cursor url(), never innerHTML). */
export function pngDataUrl(bytes) {
  if (!bytes || !bytes.length) return null;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x4000) bin += String.fromCharCode.apply(null, bytes.subarray ? bytes.subarray(i, i + 0x4000) : Array.prototype.slice.call(bytes, i, i + 0x4000));
  const b64 = btoa(bin);
  return /^[A-Za-z0-9+/=]+$/.test(b64) ? `data:image/png;base64,${b64}` : null;
}

/** A KeyboardEvent → the plain shape xpra-proto's keyActionFor reads. */
export function keyInputOf(e) {
  const gm = (n) => { try { return !!e.getModifierState?.(n); } catch { return false; } };
  return {
    key: e.key, code: e.code, keyCode: e.keyCode, location: e.location, composing: !!e.isComposing,
    mods: { shift: !!e.shiftKey, control: !!e.ctrlKey, alt: !!e.altKey, meta: !!e.metaKey, altGraph: gm('AltGraph'), capsLock: gm('CapsLock'), numLock: gm('NumLock') },
  };
}
const pointerMods = (e) => ({ shift: !!e.shiftKey, control: !!e.ctrlKey, alt: !!e.altKey, meta: !!e.metaKey });

/**
 * createXpraView(host, opts) — mounts the seamless picture view into `host`.
 *   url           — the bridge ws url or a FUNCTION (a fresh per-socket viewer id each connect)
 *   workerUrl     — the upstream Protocol.js url (or a function) — /api/desktop/<id>/xpra-ui/js/Protocol.js
 *   before        — optional async () => { ok, error } gate before every connect
 *   labels        — { starting, unavailable }
 *   autoReconnect — walk the shell's bounded ladder after a drop while still wanted
 *   onStatus      — (state, detail) observer: 'starting' | 'connecting' | 'connected' | 'disconnected' | 'error'
 *   onTitle(text) / onIcon(dataUrl|null) — the app window's own title and icon
 *   onMinSize({w,h}|null) — the smallest pane (CSS px) the app fits in unscaled (its minimum ÷ the ratio)
 *   dpi           — the DISPLAY's font dpi (the record's `dpi`) — the client's hello/display dpi (a number or a function)
 *   pixelRatio    — () => devicePixelRatio (injectable); CSS px × this = the device px the session speaks
 *   Worker / decode / now / secure / clipboardApi — injectable for the node suite
 * Returns { container, bar, mount, pane, status, connect, disconnect, setStatus, addControl,
 *           focus, dispose, setViewOnly, get client, get state, get wanted, windows() }.
 */
export function createXpraView(host, { url, workerUrl, before = null, labels = {}, autoReconnect = false, onStatus = null, onTitle = null, onIcon = null, onMinSize = null, dpi = 96, pixelRatio = () => (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), Worker: WorkerCtor = undefined, decode = defaultDecode, now = undefined, secure = null, clipboardApi = null, log = console } = {}) {
  const shell = createPictureShell(host, { labels: { starting: t('Starting application…'), unavailable: t('Desktop app unavailable'), ...labels }, autoReconnect, onStatus, background: 'var(--bg-primary)', focus: () => focus() });
  const { container, bar, mount, status, pasteBtn, reBtn, labels: L, setStatus, addControl, emit } = shell;

  const pane = document.createElement('div');
  pane.className = 'xpra-pane';
  // the windows live on a STAGE: identity while this pane drives the app, a fit-scale in Watch (x5)
  const stage = document.createElement('div');
  stage.className = 'xpra-stage';
  const ime = document.createElement('textarea');
  ime.className = 'xpra-ime';
  ime.setAttribute('aria-label', t('Keyboard input for the application'));
  ime.setAttribute('autocomplete', 'off'); ime.setAttribute('autocorrect', 'off'); ime.setAttribute('autocapitalize', 'off'); ime.setAttribute('spellcheck', 'false');
  // the badge of an ACTIVE picture scaled to fit (the app's minimum is larger than the pane — phone / a narrow cell)
  const fitBadge = document.createElement('div');
  fitBadge.className = 'xpra-fit-badge';
  fitBadge.style.display = 'none';
  pane.append(stage, ime, fitBadge);
  mount.appendChild(pane);

  // the plain-http copy chip is the shell's (hidden until a copy arrives that the API cannot take)
  const chip = shell.copyChip;

  const isSecure = () => (secure != null ? !!secure : (typeof isSecureContext !== 'undefined' ? !!isSecureContext : false));
  const clip = () => (clipboardApi !== null ? clipboardApi : (typeof navigator !== 'undefined' ? navigator.clipboard : null));

  let client = null;
  let viewOnly = false;
  let mode = 'active'; // x5: 'active' | 'watch' | 'blocked'
  let stageScale = 1;
  let stageOffset = { x: 0, y: 0 };
  let minSize = null; // the smallest pane (CSS px) — minPaneCss(the main's constraints, the ratio)
  let constraints = null; // the main window's size constraints (device px), as the client last named them
  const ratio = () => pixelRatioOf(typeof pixelRatio === 'function' ? pixelRatio() : pixelRatio);
  let drawRatio = ratio(); // the ratio the windows are laid out with (re-read at every connect / resize)
  /** x5 Watch: the stage scaled so every non-popup window fits the pane (contain — never cropped) and CENTRED in it;
   *  the scale is CAPPED AT 1 (2.369.156, the product's default: a pane larger than the app shows it crisp at 1:1,
   *  never blown up); identity otherwise. The offset is whole pixels so a 1:1 picture stays on the pixel grid.
   *  ACTIVE (2.369.158 r2): scaled ONLY in the minimum case — the app has a minimum (`minSize`) and its MAIN window
   *  sticks out of the pane (the fit never asks below the minimum: a phone, a window capped at the workspace) — the
   *  exact condition of the badge, so an active scale is never silent; a dialog larger than the pane is placed by the
   *  client, never a zoom jump of the whole picture (the verifier: an oversized dialog used to rescale the stage).
   *  An overflow under one CSS px is NOT an overflow (a fractional ratio's rounding; devicePane rounds down, the
   *  pane's clientWidth rounds) — a sub-1 transform would resample the 1:1 picture (blurred at DPR 1.5). */
  const FIT_SLACK_CSS = 1;
  /** r2 — THE DEVICE-PIXEL GRID (measured, DPR 1.5): a window at CSS 65,117 sits at DEVICE 97.5,175.5 and the browser
   *  RESAMPLES the canvas across the half pixel (1.3–1.9 % of the pixels off a 1:1 copy; an integer DPR never shows it).
   *  The stage is nudged right/down by less than one device px so its origin lands ON the device grid. Re-read at every
   *  fit, when the pointer enters the pane and when the window is moved (`resnap`, the window's onMoved). */
  const gridNudge = (ox, oy) => {
    const r = drawRatio;
    if (!(r > 0) || r === 1) return { x: 0, y: 0 };
    let pr = null; try { pr = pane.getBoundingClientRect(); } catch {}
    if (!pr || !Number.isFinite(pr.left) || !Number.isFinite(pr.top)) return { x: 0, y: 0 };
    const nudge = (v) => { const d = v * r; const f = Math.ceil(d - 1e-3) - d; return f > 1e-3 ? f / r : 0; };
    return { x: nudge(pr.left + ox), y: nudge(pr.top + oy) };
  };
  const fitStage = () => {
    let s = 1, ox = 0, oy = 0;
    if (mode !== 'blocked' && client) {
      let bw = 0, bh = 0;
      if (mode === 'watch') {
        for (const w of client.windows.values()) if (w.kind !== 'popup') { bw = Math.max(bw, (w.x + w.w) / drawRatio); bh = Math.max(bh, (w.y + w.h) / drawRatio); }
      } else if (minSize) {
        const main = client.mainWid ? client.windows.get(client.mainWid) : null;
        if (main) { bw = (main.x + main.w) / drawRatio; bh = (main.y + main.h) / drawRatio; }
      }
      const p = paneSize();
      if (bw > 0 && bh > 0) {
        const sw = bw <= p.width + FIT_SLACK_CSS - 1e-9 ? 1 : p.width / bw, sh = bh <= p.height + FIT_SLACK_CSS - 1e-9 ? 1 : p.height / bh;
        s = Math.min(1, sw, sh);
        if (!(s > 0) || !Number.isFinite(s)) s = 1;
        // ACTIVE and unscaled: the app stays at 0,0 (its fit's cell leftover is at the right/bottom, as before) — centred only when scaled
        if (mode === 'watch' || s < 1) { ox = Math.max(0, Math.floor((p.width - bw * s) / 2)); oy = Math.max(0, Math.floor((p.height - bh * s) / 2)); }
      }
    }
    if (!(s > 0) || !Number.isFinite(s)) s = 1;
    const g = gridNudge(ox, oy); ox += g.x; oy += g.y;
    stageScale = s; stageOffset = { x: ox, y: oy };
    const parts = [];
    if (ox || oy) parts.push(`translate(${+ox.toFixed(4)}px, ${+oy.toFixed(4)}px)`);
    if (s !== 1) parts.push(`scale(${s})`);
    stage.style.transform = parts.join(' ');
    const scaled = mode === 'active' && s < 1 && !!minSize;
    fitBadge.style.display = scaled ? '' : 'none';
    if (scaled) fitBadge.textContent = t('Scaled to fit — the app needs at least {w}×{h}', { w: minSize.w, h: minSize.h });
  };
  /** The main window's constraints (device px) → the smallest pane (CSS px) → the window (onMinSize). */
  const applyConstraints = (c) => {
    constraints = c || null;
    const m = minPaneCss(constraints, drawRatio);
    if ((m && minSize && m.w === minSize.w && m.h === minSize.h) || (!m && !minSize)) return;
    minSize = m;
    try { onMinSize?.(m ? { ...m } : null); } catch {}
    fitStage();
  };
  const wins = new Map(); // wid → { el, canvas, ctx }
  const clearWindows = () => { for (const w of wins.values()) w.el.remove(); wins.clear(); };

  const paneSize = () => ({ width: Math.max(1, pane.clientWidth || 1), height: Math.max(1, pane.clientHeight || 1) });

  // ── the windows ──────────────────────────────────────────────────────────
  // HiDPI: a window's box is its DEVICE geometry ÷ the ratio (CSS px); its canvas keeps the device pixels (1:1 on screen)
  // r2: the canvas BACKING is the window rounded up to the ratio's grid step and its CSS box backing ÷ ratio — a size the
  // is a WHOLE CSS px (Chrome snaps a canvas's paint box to whole CSS px — 697.5 or 897.33 CSS resamples, measured), so the
  // picture is drawn 1:1 at an odd device width and a fractional ratio alike (xpra-proto backingSize)
  const place = (win, w) => {
    const r = drawRatio;
    w.el.style.left = `${win.x / r}px`; w.el.style.top = `${win.y / r}px`;
    w.el.style.width = `${win.w / r}px`; w.el.style.height = `${win.h / r}px`;
    w.el.style.zIndex = String((Z_BASE[win.kind] || Z_BASE.main) + Math.min(win.z, 99999));
    const bw = backingSize(win.w, r), bh = backingSize(win.h, r);
    if (w.canvas.width !== bw || w.canvas.height !== bh) {
      // a resize clears a canvas — keep what was painted until the server repaints
      let keep = null;
      if (w.canvas.width > 0 && w.canvas.height > 0) { try { keep = document.createElement('canvas'); keep.width = w.canvas.width; keep.height = w.canvas.height; keep.getContext('2d').drawImage(w.canvas, 0, 0); } catch { keep = null; } }
      w.canvas.width = bw; w.canvas.height = bh;
      if (keep) { try { w.ctx.drawImage(keep, 0, 0); } catch {} }
    }
    const cw = `${bw / r}px`, ch = `${bh / r}px`;
    if (w.canvas.style.width !== cw) w.canvas.style.width = cw;
    if (w.canvas.style.height !== ch) w.canvas.style.height = ch;
  };
  const onWindow = (kind, win) => {
    if (kind === 'new') {
      const el = document.createElement('div');
      el.className = `xpra-win xpra-win-${win.kind}`;
      el.dataset.wid = String(win.wid);
      const canvas = document.createElement('canvas');
      // the CSS box = backing ÷ ratio and the backing store = device px (place) — one app pixel per screen pixel
      el.appendChild(canvas);
      const w = { el, canvas, ctx: canvas.getContext('2d') };
      wins.set(win.wid, w);
      place(win, w);
      stage.appendChild(el);
      if (wins.size === 1) setStatus(t('Connected'));
      fitStage();
      return;
    }
    const w = wins.get(win.wid);
    if (!w) return;
    if (kind === 'geometry' || kind === 'raise') { place(win, w); fitStage(); }
    else if (kind === 'lost') { w.el.remove(); wins.delete(win.wid); fitStage(); if (!wins.size && client && client.state === 'connected') setStatus(t('The application closed its window')); }
  };
  const onPaint = (win, op) => {
    const w = wins.get(win.wid);
    if (!w) return;
    if (op.type === 'image') { try { w.ctx.drawImage(op.img, op.x, op.y, op.w, op.h); } finally { try { op.img.close?.(); } catch {} } }
    else if (op.type === 'scroll') {
      for (const m of op.moves) {
        if (!Array.isArray(m) || m.length < 6) continue;
        const [x, y, mw, mh, dx, dy] = m.map(Number);
        try { w.ctx.drawImage(w.canvas, x, y, mw, mh, x + dx, y + dy, mw, mh); } catch {}
      }
    }
  };

  // ── the clipboard, both ways (the shell's chrome; this view's facts) ───────
  const onClipboard = (text) => shell.deliverCopy(text, { secure: isSecure(), clipboard: clip() });
  const connectedNow = () => !!client && client.state === 'connected';
  const sendPaste = (text) => {
    if (!connectedNow()) { showToast(t('The application is not connected'), { type: 'error' }); return false; }
    if (!text) return false;
    if (client.pasteText(text)) { showToast(t('Pasted into the application')); focus(); return true; }
    return false;
  };
  pasteBtn.onclick = () => shell.pasteFromClipboard({ connected: connectedNow, notConnected: t('The application is not connected'), send: sendPaste, clipboard: isSecure() ? clip() : null });
  ime.addEventListener('paste', (e) => {
    const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    e.preventDefault();
    if (text) sendPaste(text);
  });

  // ── keyboard through the IME textarea ────────────────────────────────────
  ime.addEventListener('keydown', (e) => {
    if (!client || e.isComposing || e.keyCode === 229) return;
    const r = client.keyDown(keyInputOf(e));
    if (r === 'sent') e.preventDefault();
  });
  ime.addEventListener('keyup', (e) => {
    if (!client || e.isComposing || e.keyCode === 229) return;
    const r = client.keyUp(keyInputOf(e));
    if (r === 'sent') e.preventDefault();
  });
  ime.addEventListener('compositionend', (e) => { const text = e.data || ime.value; ime.value = ''; if (client && text) client.typeText(text); });
  ime.addEventListener('input', (e) => {
    if (e.isComposing || (e.inputType && e.inputType.startsWith('insertComposition'))) return;
    const text = e.inputType === 'insertText' && e.data ? e.data : (e.inputType ? '' : ime.value);
    ime.value = '';
    if (client && text) client.typeText(text);
  });

  // ── pointer, from the pane's own rect (viewport px == layout px at net zoom 1) ──
  // → the stage's own coordinates (the fit's offset and scale undone) → DEVICE px (× the ratio): what X speaks
  const paneXY = (e) => {
    const r = pane.getBoundingClientRect();
    const x = (e.clientX - r.left - stageOffset.x) / stageScale, y = (e.clientY - r.top - stageOffset.y) / stageScale;
    return [x * drawRatio, y * drawRatio];
  };
  let moveRaf = 0, lastMove = null;
  pane.addEventListener('pointerenter', () => { if (client) fitStage(); }); // the window may have moved: back onto the device grid
  pane.addEventListener('pointerdown', (e) => {
    ime.focus({ preventScroll: true });
    e.preventDefault();
    if (!client) return;
    try { pane.setPointerCapture(e.pointerId); } catch {}
    const [x, y] = paneXY(e);
    client.pointerButton(x, y, e.button, true, pointerMods(e));
  });
  pane.addEventListener('pointerup', (e) => {
    if (!client) return;
    const [x, y] = paneXY(e);
    client.pointerButton(x, y, e.button, false, pointerMods(e));
    try { pane.releasePointerCapture(e.pointerId); } catch {}
  });
  pane.addEventListener('pointermove', (e) => {
    if (!client) return;
    lastMove = e;
    if (moveRaf) return;
    moveRaf = requestAnimationFrame(() => { moveRaf = 0; const ev = lastMove; lastMove = null; if (!ev || !client) return; const [x, y] = paneXY(ev); client.pointerMove(x, y, pointerMods(ev)); });
  });
  pane.addEventListener('wheel', (e) => { e.preventDefault(); if (!client) return; const [x, y] = paneXY(e); client.wheel(x, y, e.deltaX, e.deltaY, e.deltaMode, pointerMods(e)); }, { passive: false });
  pane.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── the pane follows the window: debounce, then the session re-fits ──────
  let resizeTimer = null;
  const relayout = () => {
    if (!client) return;
    const r = ratio();
    if (r !== drawRatio) { // a monitor move (or a browser zoom) changed the ratio: every box and the minimum follow
      drawRatio = r;
      for (const win of client.windows.values()) { const w = wins.get(win.wid); if (w) place(win, w); }
      applyConstraints(constraints);
    }
    const s = paneSize(); client.resize(s.width, s.height); fitStage();
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(relayout, RESIZE_DEBOUNCE_MS); }) : null;
  ro?.observe(pane);
  // a devicePixelRatio change fires no resize — a resolution media query does (re-armed at each new ratio)
  let dprMq = null;
  const watchRatio = () => {
    try { dprMq?.removeEventListener?.('change', onRatio); } catch {}
    dprMq = null;
    if (typeof matchMedia !== 'function' || typeof pixelRatio !== 'function') return;
    try { dprMq = matchMedia(`(resolution: ${ratio()}dppx)`); dprMq.addEventListener?.('change', onRatio); } catch { dprMq = null; }
  };
  function onRatio() { relayout(); watchRatio(); }
  watchRatio();

  // ── the session ──────────────────────────────────────────────────────────
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
    try { client?.close(); } catch {}
    clearWindows();
    const s = paneSize();
    drawRatio = ratio();
    constraints = null; minSize = null;
    client = createXpraClient({
      url: typeof url === 'function' ? url() : url,
      workerUrl: typeof workerUrl === 'function' ? workerUrl() : workerUrl,
      screen: s, ratio: () => drawRatio, dpi: typeof dpi === 'function' ? dpi() : dpi, Worker: WorkerCtor, decode, now, log,
      on: {
        status: (st, detail) => {
          if (shell.closed) return;
          if (st === 'connected') { shell.resetLadder(); setStatus(t('Waiting for the application window…')); emit('connected', detail); ime.focus({ preventScroll: true }); return; }
          if (st === 'closed') {
            const reason = detail && detail !== 'closed by the window' ? String(detail) : '';
            const ours = detail === 'closed by the window';
            // x5: the bridge CUT this pane (another client resumed here, close 4001) — reconnect at once as a blocked viewer
            // (the upstream Protocol.js words an unmapped close code as "4001: '<reason>'")
            if (!ours && /(^|\D)4001(\D|$)/.test(reason) && shell.wanted) { setStatus(t('Active on another client')); emit('disconnected', { clean: true, reason: 'blocked' }); clearWindows(); shell.resetLadder(); setTimeout(() => { if (!shell.closed && shell.wanted) connect(); }, 0); return; }
            setStatus(ours ? t('Disconnected') : reason ? `${t('Connection lost')}: ${reason}` : t('Connection lost'), { error: !ours, reconnect: true });
            emit('disconnected', { clean: ours, reason });
            if (shell.wanted) shell.scheduleRetry(connect);
          }
        },
        window: onWindow, paint: onPaint, title: (text) => { try { onTitle?.(text); } catch {} },
        icon: ({ data }) => { const u = pngDataUrl(data); if (u) { try { onIcon?.(u); } catch {} } },
        clipboard: onClipboard,
        constraints: applyConstraints,
        // the cursor image is device px: at a ratio > 1 it is declared at that density (image-set) so it keeps its
        // size on screen — assigned after the plain url(), which stays when a browser rejects the image-set form
        cursor: (cur) => {
          const u = cur ? pngDataUrl(cur.data) : null;
          pane.style.cursor = u ? `url(${u}) ${cur.xhot} ${cur.yhot}, auto` : '';
          if (u && drawRatio !== 1) pane.style.cursor = `image-set(url(${u}) ${drawRatio}x) ${Math.round(cur.xhot / drawRatio)} ${Math.round(cur.yhot / drawRatio)}, auto`;
        },
      },
    });
    client.viewOnly = viewOnly || mode !== 'active';
    client.watch = mode === 'watch';
    client.dormant = mode === 'blocked';
    client.connect();
  };
  reBtn.onclick = () => { shell.resetLadder(); connect(); };

  const disconnect = () => { shell.unwant(); try { client?.close(); } catch {} client = null; clearWindows(); };
  const dispose = () => { shell.close(); disconnect(); ro?.disconnect(); clearTimeout(resizeTimer); if (moveRaf) cancelAnimationFrame(moveRaf); try { dprMq?.removeEventListener?.('change', onRatio); } catch {} };
  const focus = () => { try { ime.focus({ preventScroll: true }); } catch {} };
  const setViewOnly = (v) => { viewOnly = !!v; if (client) client.viewOnly = viewOnly || mode !== 'active'; pane.classList.toggle('xpra-view-only', viewOnly || mode !== 'active'); };
  /** x5: 'active' (this pane drives the app) | 'watch' (an agent drives: fit-scaled, nothing sent) | 'blocked' (another client is active: dormant). */
  const setMode = (m) => {
    const next = m === 'watch' || m === 'blocked' ? m : 'active';
    if (next === mode) return;
    mode = next;
    if (client) { client.viewOnly = viewOnly || mode !== 'active'; client.dormant = mode === 'blocked'; client.watch = mode === 'watch'; }
    pane.classList.toggle('xpra-view-only', viewOnly || mode !== 'active');
    pane.classList.toggle('xpra-watch', mode === 'watch');
    if (mode === 'active' && client) { const s = paneSize(); client.resize(s.width, s.height); }
    fitStage();
  };
  /** A DOM-free snapshot of the windows (for the suite / diagnostics). */
  const windows = () => (client ? [...client.windows.values()].map((w) => ({ wid: w.wid, x: w.x, y: w.y, w: w.w, h: w.h, kind: w.kind, title: w.title })) : []);

  const resnap = () => { if (client) fitStage(); };
  return { container, bar, mount, pane, stage, ime, status, chip, fitBadge, resnap, connect, disconnect, setStatus, addControl, focus, dispose, setViewOnly, setMode, windows, get mode() { return mode; }, get stageScale() { return stageScale; }, get ratio() { return drawRatio; }, get minSize() { return minSize ? { ...minSize } : null; }, get stageOffset() { return { ...stageOffset }; }, get client() { return client; }, get state() { return shell.state; }, get wanted() { return shell.wanted; }, get chipText() { return shell.copiedText; }, get pasteOpen() { return shell.pasteOpen; } };
}

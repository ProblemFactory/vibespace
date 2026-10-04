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
//     secure context and proves nothing) a token that follows the user's OWN
//     Ctrl/⌘+C (or +X) in this pane within the browser's 5 s activation
//     window is written by execCommand with NO click (round 3, A1 — the
//     gesture stamp below); any other token gets the shell's "Copied in the
//     app — click to copy" chip, which copies through the click's user
//     gesture and goes away (the first one on this device also shows the
//     one-time "Enable HTTPS for seamless copy" hint); a refused API write
//     falls to the chip too.
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
// SEAMLESS (round 3 lane B, docs/design-desktop-apps-seamless §3.3): the app's own header bar dragging its window
// arrives as the client's `moveresize`; the view hands it to the window (`onMoveResize`) with the gesture's press
// point in VIEWPORT px (`rootToClient` — the X root is the pane's stage, device px) and turns the pane's pointer
// OFF for the rest of that press: capture released (the window manager's drag owns the pointer now), no motion
// forwarded, and the button release still reaches X once — from wherever the pointer is let go (a document-level
// pointerup, per-press AbortController) — so the app never sees a button stuck down. `onMain(meta|null)` and
// `onState(changed)` name the main window's metadata (its `decorations`) and the app's own maximize / minimize.
// THE APP'S FIXED SIZE (lane app-fit-fixed, 2026-10-03, the owner: 「对于自己定死尺寸的窗口我们应该遵循他们的尺寸并且禁止缩放」):
// the client's `on.fixed` (a window whose size the app fixes — WeChat's login, Inkscape's welcome) is handed to the
// window in CSS px (`onFixedSize({w,h}|null)` — device ÷ the ratio, rounded up) and the window ADOPTS it; while
// `fixedFollows()` says the window does (off the phone layout) the picture is NEVER scaled to fit — no badge.
// AN APP'S SECOND WINDOW (design 016 S1, lane app-guest-window): `onFront({wid, title, kind, main}|null)` names the FRONT
// window (the window titles "{app} · {front}" and its ✕ closes that window — `closeFront()`); the minimum `onMinSize` hands
// over is the union of every held window's (the client's), so the window grows to hold WeChat's Moments.
// A WINDOW PER TOP-LEVEL (design 016 S2, lane app-satellite-windows, 2026-10-03): with `onSatellite` the client lays every
// secondary NORMAL window into its own SLOT of the root and this view asks the caller to open a SATELLITE window for it
// (`onSatellite({wid, title})`); that window mounts `attachSatellite(host, wid, callbacks)` — a viewport pane onto the SAME
// session (no socket of its own: ONE connection per app session stays), which draws every canvas of its pane (P.paneOf:
// the window, its dialogs, the popups opened in it) offset by the window's origin, maps its pointer and keys to that
// window, and hands ITS title / minimum / fixed size / metadata / header-bar gesture / maximize-minimize to its window.
// The main pane no longer draws a window that has a bound satellite. Watch and Blocked draw everything in the main pane
// (one picture) and say so in the satellite; a slot lost closes its satellite ('lost' | 'adopted' | 'released'), a
// satellite waiting for a window the session no longer has closes once the window list is in ('missing').
import { t } from './i18n.js';
import { dragEndVerdict } from './drag-end.js'; // the hand-over's hold ends as the WM's drag does (verify r1)
import { showToast } from './utils.js';
import { createPictureShell, streamUrl, copyViaSelection } from './picture-shell.js';
import { createXpraClient, defaultDecode } from './xpra-client.js';
import { minPaneCss, pixelRatioOf, backingSize, fixedSizeOf, sizeHintsOf } from './xpra-proto.js';

export { streamUrl, copyViaSelection };

const RESIZE_DEBOUNCE_MS = 150;
/** A window whose X size SHRINKS keeps its canvas backing (its pixels) this long before the backing follows (lane D
 *  (a)): GTK apps snap to their own size ~650 ms after the map and the belt re-fits them in the SAME task — a backing
 *  shrunk and regrown in between lost the rows past the snapped size, a band of the pane's background until the app
 *  repainted (~110 ms, measured on every GNOME Calculator connect). The element's box still follows at once (it clips). */
export const BACKING_SHRINK_MS = 1000;
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

/** Design 009 §B8: the pane's one starting line — "Starting…", then "Starting… 8 s" once a second has passed. PURE. */
export function startingText(ms) {
  const n = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  return n >= 1 ? t('Starting… {n} s', { n }) : t('Starting…');
}

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
 *   onFixedSize({w,h}|null) — the pane (CSS px) the app's FIXED window needs (lane app-fit-fixed); null = none
 *   onFront({wid,title,kind,main}|null) — the FRONT window (the topmost non-popup; `main` false = an app's second window)
 *   onSatellite({wid,title}) — S2: a secondary top-level got its slot — open (or re-bind) a satellite window for it
 *   fixedFollows  — () => true when the window adopts that size (then the picture is never scaled); default true
 *   dpi           — the DISPLAY's font dpi (the record's `dpi`) — the client's hello/display dpi (a number or a function)
 *   onMain(meta|null) / onState(changed) — the main window's metadata; the app's own maximize / minimize (seamless)
 *   onMoveResize(ev) — the app's header bar moves/resizes its window: {direction, button, main, press:{clientX,clientY}|null}
 *   pixelRatio    — () => devicePixelRatio (injectable); CSS px × this = the device px the session speaks
 *   pictureScale  — () => the record's pictureScale (lane D (a): a fractional scale renders at GDK_SCALE = ⌈s⌉ and is
 *                   SHOWN at s ÷ ⌈s⌉ — the view's ratio is devicePixelRatio ÷ this; 1 = the picture 1:1, as ever)
 *   Worker / decode / now / secure / clipboardApi — injectable for the node suite
 * Returns { container, bar, mount, pane, status, connect, disconnect, setStatus, addControl,
 *           focus, dispose, setViewOnly, get client, get state, get wanted, windows() }.
 */
export function createXpraView(host, { url, workerUrl, before = null, labels = {}, autoReconnect = false, onStatus = null, onTitle = null, onIcon = null, onMinSize = null, onMain = null, onState = null, onMoveResize = null, onFixedSize = null, onFront = null, onSatellite = null, fixedFollows = () => true, dpi = 96, pixelRatio = () => (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), pictureScale = () => 1, Worker: WorkerCtor = undefined, decode = defaultDecode, now = undefined, secure = null, clipboardApi = null, log = console } = {}) {
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
  let fixedDev = null, fixedCss = null; // lane app-fit-fixed: the app's FIXED window (device px, as the client named it) and its pane (CSS px)
  // LANE D (a): the SCREEN's ratio and the picture's own scale — the windows are laid out at their quotient: X px per CSS
  // px = devicePixelRatio ÷ pictureScale (1.5× on a 2× screen = a GDK_SCALE-2 picture at 2.667 X px per CSS px, shown
  // at 0.75); a pictureScale of 1 is the 1:1 picture of 2.369.158, bit for bit
  const screenRatio = () => pixelRatioOf(typeof pixelRatio === 'function' ? pixelRatio() : pixelRatio);
  const pictureK = () => { const k = Number(typeof pictureScale === 'function' ? pictureScale() : pictureScale); return Number.isFinite(k) && k > 0.3 && k <= 1 ? k : 1; };
  const ratio = () => pixelRatioOf(screenRatio() / pictureK());
  let drawRatio = ratio(); // the ratio the windows are laid out with (re-read at every connect / resize)
  let drawK = pictureK();  // the picture scale the windows are laid out with (the same moments)
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
  const gridNudge = (ox, oy, el = pane) => {
    const r = drawRatio;
    if (!(r > 0) || r === 1 || drawK !== 1) return { x: 0, y: 0 }; // a resampled picture (lane D (a)) has no 1:1 grid to land on
    let pr = null; try { pr = el.getBoundingClientRect(); } catch {}
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
      } else if (minSize && !(fixedCss && fixedFollows())) { // a FIXED window the window adopts is never scaled (lane app-fit-fixed)
        const main = client.mainWid ? client.windows.get(client.mainWid) : null;
        if (main && !main.premap) { bw = (main.x + main.w) / drawRatio; bh = (main.y + main.h) / drawRatio; } // a main being announced has no fit yet (lane D (a) F3)
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
  /** lane app-fit-fixed: the app's FIXED window (device px) → the pane it needs (CSS px, rounded up) → the window (onFixedSize). */
  const applyFixed = (f) => {
    fixedDev = f ? { w: f.w, h: f.h } : null;
    const m = fixedDev ? { w: Math.ceil(fixedDev.w / drawRatio - 1e-9), h: Math.ceil(fixedDev.h / drawRatio - 1e-9) } : null;
    if ((m && fixedCss && m.w === fixedCss.w && m.h === fixedCss.h) || (!m && !fixedCss)) return;
    fixedCss = m;
    try { onFixedSize?.(m ? { ...m } : null); } catch {}
    fitStage();
  };
  const wins = new Map(); // wid → { el, canvas, ctx, home (the stage it is drawn on) }
  const clearWindows = () => { for (const w of wins.values()) { clearTimeout(w.shrinkTimer); w.el.remove(); } wins.clear(); };
  // ── S2: the panes that draw this session — the main pane and every SATELLITE (wid → its handle) ──
  const sats = new Map();
  /** The stage a window is drawn on: its satellite's while one is bound and this pane drives the app, else the main one. */
  const stageFor = (win) => { const o = client && mode === 'active' && sats.size ? client.ownerOf(win) : 0; const sat = o ? sats.get(o) : null; return sat && sat.bound ? sat.stage : stage; };
  const home = (win, w) => { const target = stageFor(win); if (w.home !== target) { w.el.remove(); target.appendChild(w.el); w.home = target; } };
  const rehome = () => { if (!client) return; for (const win of client.windows.values()) { const w = wins.get(win.wid); if (w) home(win, w); } fitStage(); for (const sat of sats.values()) sat.refresh(); };

  const paneSize = () => ({ width: Math.max(1, pane.clientWidth || 1), height: Math.max(1, pane.clientHeight || 1) });

  // ── the windows ──────────────────────────────────────────────────────────
  // HiDPI: a window's box is its DEVICE geometry ÷ the ratio (CSS px); its canvas keeps the device pixels (1:1 on screen)
  // r2: the canvas BACKING is the window rounded up to the ratio's grid step and its CSS box backing ÷ ratio — a size the
  // is a WHOLE CSS px (Chrome snaps a canvas's paint box to whole CSS px — 697.5 or 897.33 CSS resamples, measured), so the
  // picture is drawn 1:1 at an odd device width and a fractional ratio alike (xpra-proto backingSize)
  const place = (win, w, shrinkNow = false) => {
    const r = drawRatio;
    w.el.style.left = `${win.x / r}px`; w.el.style.top = `${win.y / r}px`;
    w.el.style.width = `${win.w / r}px`; w.el.style.height = `${win.h / r}px`;
    w.el.style.zIndex = String((Z_BASE[win.kind] || Z_BASE.main) + Math.min(win.z, 99999));
    let bw = backingSize(win.w, r), bh = backingSize(win.h, r);
    if (!shrinkNow && w.r === r && (w.canvas.width > bw || w.canvas.height > bh)) {
      // a shrink keeps the backing for BACKING_SHRINK_MS (see the constant) — the element clips it meanwhile
      bw = Math.max(bw, w.canvas.width); bh = Math.max(bh, w.canvas.height);
      clearTimeout(w.shrinkTimer);
      w.shrinkTimer = setTimeout(() => { w.shrinkTimer = null; const cur = client && client.windows.get(win.wid); if (cur && wins.get(win.wid) === w) place(cur, w, true); }, BACKING_SHRINK_MS);
    }
    w.r = r;
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
      home(win, w);
      if (wins.size === 1) { everMapped = true; stopWait(); setStatus(t('Connected')); }
      fitStage();
      for (const sat of sats.values()) sat.refresh();
      return;
    }
    const w = wins.get(win.wid);
    if (!w) { if (kind === 'meta') for (const sat of sats.values()) sat.refresh(); return; }
    if (kind === 'geometry' || kind === 'raise') { place(win, w); home(win, w); fitStage(); }
    else if (kind === 'lost') { clearTimeout(w.shrinkTimer); w.el.remove(); wins.delete(win.wid); fitStage(); if (!wins.size && client && client.state === 'connected') setStatus(t('The application closed its window')); }
    for (const sat of sats.values()) sat.refresh();
  };
  const onPaint = (win, op) => {
    const w = wins.get(win.wid);
    if (!w) return;
    // a window with an ALPHA channel (Chrome's own frame: `has-alpha`, rounded top corners) is CLEARED under each draw first —
    // composited over what was there, a translucent pixel would blend with stale ones (upstream xpra-html5 clears the same way)
    if (op.type === 'image') { try { if (win.meta && win.meta['has-alpha']) w.ctx.clearRect(op.x, op.y, op.w, op.h); w.ctx.drawImage(op.img, op.x, op.y, op.w, op.h); } finally { try { op.img.close?.(); } catch {} } }
    else if (op.type === 'scroll') {
      // every move of ONE scroll packet reads the picture as it was BEFORE the packet (upstream xpra-html5's do_paint
      // draws each from its draw canvas into the offscreen one): applied one after another on the same canvas, a later
      // move read rows an earlier one had already overwritten — ghost rows until the next full repaint (measured on
      // chrome://settings: 593 overlapping reads in 66 packets). One snapshot per packet, one reusable canvas per window.
      const moves = op.moves.filter((m) => Array.isArray(m) && m.length >= 6).map((m) => m.map(Number));
      if (!moves.length) return;
      let src = w.canvas;
      if (moves.length > 1) {
        try {
          const snap = (w.scrollSrc ||= document.createElement('canvas'));
          if (snap.width !== w.canvas.width || snap.height !== w.canvas.height) { snap.width = w.canvas.width; snap.height = w.canvas.height; }
          const sctx = snap.getContext('2d');
          sctx.clearRect(0, 0, snap.width, snap.height);
          sctx.drawImage(w.canvas, 0, 0);
          src = snap;
        } catch { src = w.canvas; }
      }
      for (const [x, y, mw, mh, dx, dy] of moves) { try { w.ctx.drawImage(src, x, y, mw, mh, x + dx, y + dy, mw, mh); } catch {} }
    }
  };

  // ── the clipboard, both ways (the shell's chrome; this view's facts) ───────
  // THE GESTURE STAMP (round 3, A1): the instant of the user's OWN trusted copy chord (Ctrl/⌘+C or +X) that this pane
  // forwarded to the app — the app's token arriving inside the browser's 5 s activation window is written to the local
  // clipboard with no click on plain http. ONE chord, at most ONE write: every delivery spends the stamp, so a later
  // copy nobody made here (an agent, a timer, another client) meets no stamp and keeps the chip.
  const clock = typeof now === 'function' ? now : () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let copyGestureAt = null;
  const onClipboard = (text) => {
    const gestureAge = copyGestureAt == null ? null : clock() - copyGestureAt;
    copyGestureAt = null;
    shell.deliverCopy(text, { secure: isSecure(), clipboard: clip(), gestureAge });
  };
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

  // ── keyboard through the IME textarea (one per pane: the main's and each satellite's) ──
  /** S2: a pane's keys reach a window OF that pane — the X focus is moved there first when another pane holds it. */
  const aim = (owner) => { if (client && sats.size && !viewOnly && mode === 'active') client.focusPane(owner); };
  const wireIme = (el, owner) => {
    el.addEventListener('keydown', (e) => {
      if (!client || e.isComposing || e.keyCode === 229) return;
      aim(owner);
      const r = client.keyDown(keyInputOf(e));
      if (r === 'sent') e.preventDefault();
      else if (r === 'copy' && e.isTrusted === true && !e.repeat) copyGestureAt = clock(); // forwarded to the app: its token may follow
    });
    el.addEventListener('keyup', (e) => {
      if (!client || e.isComposing || e.keyCode === 229) return;
      const r = client.keyUp(keyInputOf(e));
      if (r === 'sent') e.preventDefault();
    });
    el.addEventListener('compositionend', (e) => { const text = e.data || el.value; el.value = ''; if (client && text) { aim(owner); client.typeText(text); } });
    el.addEventListener('input', (e) => {
      if (e.isComposing || (e.inputType && e.inputType.startsWith('insertComposition'))) return;
      const text = e.inputType === 'insertText' && e.data ? e.data : (e.inputType ? '' : el.value);
      el.value = '';
      if (client && text) { aim(owner); client.typeText(text); }
    });
  };
  wireIme(ime, 0);

  // ── pointer, from the pane's own rect (viewport px == layout px at net zoom 1) ──
  // → the stage's own coordinates (the fit's offset and scale undone) → DEVICE px (× the ratio): what X speaks
  const paneXY = (e) => {
    const r = pane.getBoundingClientRect();
    const x = (e.clientX - r.left - stageOffset.x) / stageScale, y = (e.clientY - r.top - stageOffset.y) / stageScale;
    return [x * drawRatio, y * drawRatio];
  };
  // ONE POINTER PER PANE (S2: the main's and each satellite's): `xy` maps a pointer event to the ROOT (device px); the press
  // in flight (for a window-manager gesture the app starts in the middle of it) and, once one started, the window
  // manager's hold on the pointer: { pointerId, button, xy (the last pane point), ctl (its document listener) }
  const pointerOf = (el, xy) => ({ el, xy, press: null, wmHold: null, raf: 0, last: null });
  const mainPtr = pointerOf(pane, paneXY);
  const releaseWmHold = (ptr, e) => {
    const h = ptr.wmHold; ptr.wmHold = null;
    if (!h) return;
    try { h.ctl.abort(); } catch {}
    // the button is still down in X (the app handed the gesture over mid-press): release it once, where it was let go
    if (client) { const xy = e && ptr.el.isConnected ? ptr.xy(e) : h.xy; client.pointerButton(xy[0], xy[1], h.button, false, e ? pointerMods(e) : {}); }
  };
  const wirePointer = (ptr, imeEl) => {
    const pane = ptr.el; // THIS pointer's pane (the main's, or a satellite's)
    pane.addEventListener('pointerdown', (e) => {
      imeEl.focus({ preventScroll: true });
      e.preventDefault();
      if (!client) return;
      try { pane.setPointerCapture(e.pointerId); } catch {}
      const [x, y] = ptr.xy(e);
      ptr.press = { pointerId: e.pointerId, button: e.button, xy: [x, y], client: { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId } }; // the pointerId rides with the hand-over: the title bar / handle CAPTURES it (lane-drag-release)
      client.pointerButton(x, y, e.button, true, pointerMods(e));
    });
    pane.addEventListener('pointerup', (e) => {
      if (!client) return;
      if (ptr.wmHold) return; // the window manager's gesture owns this press — its document listener releases the button in X
      ptr.press = null;
      const [x, y] = ptr.xy(e);
      client.pointerButton(x, y, e.button, false, pointerMods(e));
      try { pane.releasePointerCapture(e.pointerId); } catch {}
    });
    pane.addEventListener('pointermove', (e) => {
      if (!client || ptr.wmHold) return;
      ptr.last = e;
      if (ptr.raf) return;
      ptr.raf = requestAnimationFrame(() => { ptr.raf = 0; const ev = ptr.last; ptr.last = null; if (!ev || !client) return; const [x, y] = ptr.xy(ev); client.pointerMove(x, y, pointerMods(ev)); });
    });
    pane.addEventListener('wheel', (e) => { e.preventDefault(); if (!client) return; const [x, y] = ptr.xy(e); client.wheel(x, y, e.deltaX, e.deltaY, e.deltaMode, pointerMods(e)); }, { passive: false });
    pane.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  pane.addEventListener('pointerenter', () => { if (client) fitStage(); }); // the window may have moved: back onto the device grid
  wirePointer(mainPtr, ime);

  // ── seamless: the app's header bar hands its move / resize to OUR window ──
  /** The X root point (device px; the root is the pane's stage) → viewport px. */
  const rootToClient = (xr, yr) => {
    const r = pane.getBoundingClientRect();
    return { clientX: r.left + stageOffset.x + (xr / drawRatio) * stageScale, clientY: r.top + stageOffset.y + (yr / drawRatio) * stageScale };
  };
  const onClientMoveResize = (ev) => {
    const cancel = ev.direction === 11;
    // S2: the gesture belongs to the pane that draws its window — a satellite's header bar moves THAT window
    const o = client && sats.size ? client.ownerOf(client.windows.get(ev.wid)) : 0, sat = o ? sats.get(o) : null;
    const viaSat = !!(sat && sat.bound && mode === 'active');
    const ptr = viaSat ? sat.ptr : mainPtr;
    const press = ptr.press;
    if (!cancel && press && !ptr.wmHold) {
      // the window manager owns the pointer from here: no capture, no motion to X, the release sent once
      const ctl = new AbortController();
      ptr.wmHold = { pointerId: press.pointerId, button: press.button, xy: press.xy, ctl };
      try { ptr.el.releasePointerCapture(press.pointerId); } catch {}
      // THE HOLD ENDS WHEN THE WINDOW MANAGER'S DRAG ENDS (lane-drag-release verify r1, finding #2): the same PURE verdict
      // the WM's doors ask (src/lib/drag-end.js) — the release / cancel of THIS pointer, a move of it with no button (a
      // release the page never saw), the window's blur, the page hidden. It used to wait for a pointerup alone, so a
      // drag the WM ended on blur left the pane deaf (no motion to X) and the X button down until the next click anywhere.
      const st = { active: true, pointerId: press.pointerId };
      const endHold = (e) => {
        const v = dragEndVerdict({ type: e && e.type, buttons: e && e.buttons, pointerId: e && e.pointerId, hidden: typeof document !== 'undefined' && document.hidden === true }, st);
        if (!v.end) return;
        st.active = false; ptr.press = null;
        releaseWmHold(ptr, v.why === 'release' || v.why === 'cancel' || v.why === 'released-unseen' ? e : null); // no point ⇒ released where the press was
      };
      for (const k of ['pointerup', 'pointercancel', 'pointermove', 'visibilitychange']) document.addEventListener(k, endHold, { signal: ctl.signal });
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('blur', endHold, { signal: ctl.signal });
    }
    const hasRoot = Number.isFinite(ev.xRoot) && Number.isFinite(ev.yRoot) && (ev.xRoot !== 0 || ev.yRoot !== 0);
    // the gesture starts where the pointer WENT DOWN in this pane (its own press, viewport px) — the app's x_root/y_root
    // only when no press is in flight (a keyboard move): Chrome 153 reports its root point +10,+5 off the real press
    // (measured, both frame modes), so the window moved 110/59 for a 120/64 drag; GNOME Calculator's was exact
    const pressAt = !cancel && press && press.client ? { ...press.client } : hasRoot ? (viaSat ? sat.rootToClient(ev.xRoot, ev.yRoot) : rootToClient(ev.xRoot, ev.yRoot)) : null;
    const out = { direction: ev.direction, button: ev.button, main: ev.main, wid: ev.wid, press: pressAt, held: !!ptr.wmHold };
    try { if (viaSat) sat.cb.onMoveResize?.(out); else onMoveResize?.(out); } catch (e) { log?.warn?.(`[xpra] onMoveResize threw: ${e && e.message}`); }
  };

  // ── the pane follows the window: debounce, then the session re-fits ──────
  let resizeTimer = null;
  const relayout = () => {
    if (!client) return;
    const r = ratio();
    if (r !== drawRatio) { // a monitor move (or a browser zoom) changed the ratio: every box and the minimum follow
      drawRatio = r; drawK = pictureK();
      for (const win of client.windows.values()) { const w = wins.get(win.wid); if (w) place(win, w); }
      applyConstraints(constraints);
      applyFixed(fixedDev);
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
    try { dprMq = matchMedia(`(resolution: ${screenRatio()}dppx)`); dprMq.addEventListener?.('change', onRatio); } catch { dprMq = null; } // the SCREEN's ratio — a (resolution: 2.667dppx) query never matches, so it never fired on a monitor move
  };
  function onRatio() { relayout(); watchRatio(); }
  watchRatio();

  // ── STARTING (design 009 §B8, the owner saw "Waiting for the app window…" for 10 s and more): until the app's FIRST
  // window maps in this pane, every wait word (starting, connecting, waiting for the window) is ONE line that counts the
  // seconds — "Starting… 8 s" (PURE startingText); a reconnect after the app has shown itself keeps its own words. Any other
  // status (an error, the ended sentence, a window) stops the count. ──
  let waitSince = 0, waitTimer = null, everMapped = false;
  const stopWait = () => { if (waitTimer) clearInterval(waitTimer); waitTimer = null; waitSince = 0; };
  const waitWords = (fallback) => {
    if (everMapped) { stopWait(); setStatus(fallback); return; }
    if (!waitSince) waitSince = Date.now();
    setStatus(startingText(Date.now() - waitSince));
    if (!waitTimer) waitTimer = setInterval(() => { if (everMapped || !waitSince || shell.closed) { stopWait(); return; } setStatus(startingText(Date.now() - waitSince)); }, 1000);
  };
  const statusFromOutside = (...a) => { stopWait(); setStatus(...a); };

  // ── the session ──────────────────────────────────────────────────────────
  const connect = async () => {
    if (shell.closed) return;
    shell.want();
    waitWords(L.starting);
    emit('starting');
    if (before) {
      let gate = null;
      try { gate = await before(); } catch {}
      if (!gate || !gate.ok) {
        stopWait();
        setStatus(gate?.error || L.unavailable, { error: true, reconnect: true });
        emit('error', gate?.error || L.unavailable);
        shell.scheduleRetry(connect);
        return;
      }
    }
    if (shell.closed) return;
    waitWords(t('Connecting…'));
    emit('connecting');
    try { client?.close(); } catch {}
    clearWindows();
    for (const sat of sats.values()) sat.unbind(); // S2: a new session — each satellite re-binds by wid once its slot is named
    const s = paneSize();
    drawRatio = ratio(); drawK = pictureK();
    constraints = null; minSize = null;
    client = createXpraClient({
      url: typeof url === 'function' ? url() : url,
      workerUrl: typeof workerUrl === 'function' ? workerUrl() : workerUrl,
      screen: s, ratio: () => drawRatio, cover: () => drawK !== 1, dpi: typeof dpi === 'function' ? dpi() : dpi, Worker: WorkerCtor, decode, now, log,
      slots: () => typeof onSatellite === 'function', // S2: a window per top-level only where the caller can open one
      on: {
        status: (st, detail) => {
          if (shell.closed) return;
          if (st === 'connected') { shell.resetLadder(); waitWords(t('Waiting for the application window…')); emit('connected', detail); ime.focus({ preventScroll: true }); listWait(); return; }
          if (st === 'closed') {
            const reason = detail && detail !== 'closed by the window' ? String(detail) : '';
            const ours = detail === 'closed by the window';
            // x5: the bridge CUT this pane (another client resumed here, close 4001) — reconnect at once as a blocked viewer
            // (the upstream Protocol.js words an unmapped close code as "4001: '<reason>'")
            stopWait();
            if (!ours && /(^|\D)4001(\D|$)/.test(reason) && shell.wanted) { setStatus(t('Active on another client')); emit('disconnected', { clean: true, reason: 'blocked' }); clearWindows(); shell.resetLadder(); setTimeout(() => { if (!shell.closed && shell.wanted) connect(); }, 0); return; }
            setStatus(ours ? t('Disconnected') : reason ? `${t('Connection lost')}: ${reason}` : t('Connection lost'), { error: !ours, reconnect: true });
            emit('disconnected', { clean: ours, reason });
            if (shell.wanted) shell.scheduleRetry(connect);
          }
        },
        window: onWindow, paint: onPaint, title: (text) => { try { onTitle?.(text); } catch {} },
        // F3 (lane D (a)): the window hears the main's metadata (a CSD app folds its bars) and the client gets the pane of
        // AFTER that, inside this call — a main being announced is fitted and mapped at the final pane (no re-fit, no snap-back)
        main: (win) => { try { onMain?.(win ? { ...win.meta } : null); } catch {} if (client && win && mode === 'active') { const s = paneSize(); client.resize(s.width, s.height); } },
        state: (win, changed) => { if (client && win && win.wid === client.mainWid) { try { onState?.({ ...changed }); } catch {} } else { const sat = win && sats.get(win.wid); if (sat && sat.bound) { try { sat.cb.onState?.({ ...changed }); } catch {} } } },
        slot: onSlot,
        ready: () => { sessionListed = true; for (const sat of [...sats.values()]) sat.settle(); },
        moveresize: onClientMoveResize,
        icon: ({ data }) => { const u = pngDataUrl(data); if (u) { try { onIcon?.(u); } catch {} } },
        clipboard: onClipboard,
        constraints: applyConstraints,
        fixed: applyFixed,
        front: (win) => { try { onFront?.(win ? { wid: win.wid, title: win.title, kind: win.kind, main: !!client && win.wid === client.mainWid } : null); } catch {} },
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

  const disconnect = () => { shell.unwant(); releaseWmHold(mainPtr, null); mainPtr.press = null; try { client?.close(); } catch {} client = null; clearWindows(); for (const sat of sats.values()) sat.unbind(); try { onMain?.(null); } catch {} try { onFront?.(null); } catch {} };
  const dispose = () => { stopWait(); shell.close(); disconnect(); for (const sat of [...sats.values()]) sat.gone('main-closed'); ro?.disconnect(); clearTimeout(resizeTimer); clearTimeout(listTimer); if (mainPtr.raf) cancelAnimationFrame(mainPtr.raf); try { dprMq?.removeEventListener?.('change', onRatio); } catch {} };
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
    rehome(); // S2: Watch / Blocked draw every window in this pane (one picture); active hands them back to their satellites
  };
  /** A DOM-free snapshot of the windows (for the suite / diagnostics). */
  const windows = () => (client ? [...client.windows.values()].map((w) => ({ wid: w.wid, x: w.x, y: w.y, w: w.w, h: w.h, kind: w.kind, title: w.title })) : []);

  // ── S2: THE SATELLITE PANE (design 016 §4 lane B, `createSatellitePane`) ──────────────────────────────────────────────
  let sessionListed = false, listTimer = null;
  /** The session's window list is in at the server's startup-complete — or 3 s after the hello, whichever comes first. */
  function listWait() { sessionListed = false; clearTimeout(listTimer); listTimer = setTimeout(() => { if (client && client.state === 'connected') { sessionListed = true; for (const sat of [...sats.values()]) sat.settle(); } }, 3000); }
  /** The client named a slot (a secondary top-level laid beside the main) or took one away. */
  function onSlot(wid, rect) {
    const sat = sats.get(wid);
    if (rect) {
      if (sat) sat.bind();
      // asked AFTER the client's own step (a new window is mapped first; the satellite's pane size then fits it in its slot)
      else if (mode === 'active' && !viewOnly && typeof onSatellite === 'function') queueMicrotask(() => {
        const win = client && client.slotOf(wid) && !sats.has(wid) && mode === 'active' ? client.windows.get(wid) : null;
        if (win) { try { onSatellite({ wid, title: win.title || '' }); } catch (e) { log?.warn?.(`[xpra] onSatellite threw: ${e && e.message}`); } }
      });
    } else if (sat && client) sat.gone(!client.windows.has(wid) ? 'lost' : client.mainWid === wid ? 'adopted' : 'released');
    rehome();
  }
  /**
   * attachSatellite(host, wid, cb) — a viewport pane onto THIS session at X window `wid`, mounted in another window's `host`.
   *   cb.onTitle(text) / onMinSize({w,h}|null) / onFixedSize({w,h}|null) (CSS px) / onMeta(meta) — the window's own facts
   *   cb.onMoveResize(ev) / onState(changed) — its header-bar gesture and its own maximize / minimize
   *   cb.onGone(why) — 'lost' (the app closed it) | 'adopted' (it became the main) | 'released' | 'missing' (not in the
   *                    session's window list) | 'main-closed' (this view went) | 'replaced'
   * Returns { wid, pane, stage, ime, bound, close (close-window), focus, dispose (the person closed the pane: the window
   * goes back to the main pane), setAppState, resnap, scale, offset, origin }.
   */
  function attachSatellite(host, wid, cb = {}) {
    sats.get(wid)?.gone('replaced');
    const sp = document.createElement('div'); sp.className = 'xpra-pane xpra-satellite';
    const sst = document.createElement('div'); sst.className = 'xpra-stage';
    const sime = document.createElement('textarea'); sime.className = 'xpra-ime';
    sime.setAttribute('aria-label', t('Keyboard input for the application'));
    sime.setAttribute('autocomplete', 'off'); sime.setAttribute('autocorrect', 'off'); sime.setAttribute('autocapitalize', 'off'); sime.setAttribute('spellcheck', 'false');
    const badge = document.createElement('div'); badge.className = 'xpra-fit-badge'; badge.style.display = 'none';
    const note = document.createElement('div'); note.className = 'xpra-satellite-note'; note.style.display = 'none';
    sp.append(sst, sime, badge, note);
    host.appendChild(sp);
    let scale = 1, off = { x: 0, y: 0 }, origin = { x: 0, y: 0 }, timer = null, done = false;
    const last = { title: null, min: null, fixed: null };
    // the pane's point → the ROOT (device px): the fit's offset and scale undone, then the window's origin added back
    const xy = (e) => { const r = sp.getBoundingClientRect(); return [((e.clientX - r.left - off.x) / scale) * drawRatio + origin.x, ((e.clientY - r.top - off.y) / scale) * drawRatio + origin.y]; };
    const sat = {
      wid, cb, pane: sp, stage: sst, bound: false, ptr: pointerOf(sp, xy),
      rootToClient: (xr, yr) => { const r = sp.getBoundingClientRect(); return { clientX: r.left + off.x + ((xr - origin.x) / drawRatio) * scale, clientY: r.top + off.y + ((yr - origin.y) / drawRatio) * scale }; },
      bind() {
        if (done) return;
        if (client && mode === 'active' && client.slotOf(wid) && !sat.bound) { sat.bound = true; rehome(); }
        sat.report(); sat.refresh();
      },
      unbind() { if (!sat.bound) return; sat.bound = false; releaseWmHold(sat.ptr, null); sat.ptr.press = null; last.min = last.fixed = null; rehome(); },
      /** the pane's size → the session (its window is fitted to it, in its slot) — never a pane that is not laid out */
      report() { if (sat.bound && client && sp.clientWidth > 1 && sp.clientHeight > 1) client.setSlotPane(wid, { width: sp.clientWidth, height: sp.clientHeight }); },
      /** the window list is in: a satellite whose window the session no longer has goes (no toast — a reload's leftover) */
      settle() { if (done || sat.bound || !client) return; if (!client.windows.has(wid)) sat.gone('missing'); else if (client.mainWid === wid) sat.gone('adopted'); },
      refresh() {
        if (done) return;
        const win = client && client.windows.get(wid);
        const st = !client || client.state !== 'connected' ? 'connecting' : mode !== 'active' ? mode : sat.bound ? 'bound' : 'connecting';
        const words = st === 'blocked' ? t('Active on another client') : st === 'watch' ? t('Shown in the main window while an agent drives') : st === 'connecting' ? t('Connecting…') : '';
        if (note.textContent !== words) note.textContent = words;
        note.style.display = words ? '' : 'none';
        if (win && sat.bound) {
          if (win.title !== last.title) { last.title = win.title; try { cb.onTitle?.(win.title || ''); } catch {} }
          const m = minPaneCss(client.constraintsOf(wid), drawRatio), mk = m ? `${m.w}x${m.h}` : '';
          if (mk !== last.min) { last.min = mk; try { cb.onMinSize?.(m ? { ...m } : null); } catch {} }
          const f = fixedSizeOf(sizeHintsOf(win.meta)), fc = f ? { w: Math.ceil(f.w / drawRatio - 1e-9), h: Math.ceil(f.h / drawRatio - 1e-9) } : null, fk = fc ? `${fc.w}x${fc.h}` : '';
          if (fk !== last.fixed) { last.fixed = fk; try { cb.onFixedSize?.(fc); } catch {} }
          try { cb.onMeta?.({ ...win.meta }); } catch {}
        }
        sat.fit();
      },
      /** the viewport: the window at the pane's origin, 1:1 — scaled to fit (never cropped) only when it is larger */
      fit() {
        const win = client && sat.bound ? client.windows.get(wid) : null;
        let s = 1, ox = 0, oy = 0;
        if (win) {
          const pw = Math.max(1, sp.clientWidth || 1), ph = Math.max(1, sp.clientHeight || 1), bw = win.w / drawRatio, bh = win.h / drawRatio;
          if (bw > pw + FIT_SLACK_CSS - 1e-9 || bh > ph + FIT_SLACK_CSS - 1e-9) { s = Math.min(1, pw / bw, ph / bh); ox = Math.max(0, Math.floor((pw - bw * s) / 2)); oy = Math.max(0, Math.floor((ph - bh * s) / 2)); }
          origin = { x: win.x, y: win.y };
        }
        if (!(s > 0) || !Number.isFinite(s)) s = 1;
        const g = gridNudge(ox, oy, sp); ox += g.x; oy += g.y;
        scale = s; off = { x: ox, y: oy };
        const parts = [];
        if (ox || oy) parts.push(`translate(${+ox.toFixed(4)}px, ${+oy.toFixed(4)}px)`);
        if (s !== 1) parts.push(`scale(${s})`);
        if (origin.x || origin.y) parts.push(`translate(${+(-origin.x / drawRatio).toFixed(4)}px, ${+(-origin.y / drawRatio).toFixed(4)}px)`);
        sst.style.transform = parts.join(' ');
        badge.style.display = s < 1 ? '' : 'none';
        if (s < 1 && last.min) { const [w, h] = last.min.split('x'); badge.textContent = t('Scaled to fit — the app needs at least {w}×{h}', { w, h }); }
      },
      gone(why) {
        if (done) return;
        done = true; clearTimeout(timer); ro2?.disconnect(); releaseWmHold(sat.ptr, null);
        sats.delete(wid); sp.remove(); rehome();
        try { cb.onGone?.(why); } catch {}
      },
    };
    wireIme(sime, wid);
    wirePointer(sat.ptr, sime);
    sime.addEventListener('paste', (e) => {
      const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      e.preventDefault();
      if (!text || !connectedNow()) return;
      aim(wid);
      if (client.pasteText(text)) { showToast(t('Pasted into the application')); sime.focus({ preventScroll: true }); }
    });
    sp.addEventListener('pointerenter', () => sat.fit());
    const ro2 = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(() => { sat.report(); sat.fit(); }, RESIZE_DEBOUNCE_MS); }) : null;
    ro2?.observe(sp);
    sats.set(wid, sat);
    if (client && client.slotOf(wid)) sat.bind();
    else { if (sessionListed) sat.settle(); sat.refresh(); }
    return {
      wid, pane: sp, stage: sst, ime: sime, note,
      get bound() { return sat.bound; }, get scale() { return scale; }, get offset() { return { ...off }; }, get origin() { return { ...origin }; },
      close: () => (client && sat.bound ? client.closeWindow(wid) : false),
      focus: () => { try { sime.focus({ preventScroll: true }); } catch {} },
      setAppState: (st) => (client && sat.bound ? client.setWindowState(wid, st) : false),
      resnap: () => sat.fit(),
      /** the person closed this satellite's window while its X window lives (a refused or impossible close-window): the
       *  window goes back to the main pane as a guest for this session (S1's shape) — never left drawn nowhere */
      dispose: () => {
        if (done) return;
        const keep = sat.bound && client && client.windows.has(wid) && client.mainWid !== wid;
        done = true; clearTimeout(timer); ro2?.disconnect(); releaseWmHold(sat.ptr, null);
        sats.delete(wid); sp.remove();
        if (keep) client.releaseSlot(wid);
        rehome();
      },
    };
  }

  const resnap = () => { if (client) fitStage(); };
  /** round 3 A2: the outer ✕ — ask the app to close its main window (xpra-client closeMain); false = nothing to ask. */
  const closeApp = () => (client ? client.closeMain() : false);
  /** S1c: the outer ✕ while an app's second window is in front — close THAT window (xpra-client closeFront). */
  const closeFront = () => (client ? client.closeFront() : false);
  /** seamless: the display is told what our window did (maximized / iconified) — the client's setMainState. */
  const setAppState = (st) => (client ? client.setMainState(st) : false);
  return { container, bar, mount, pane, stage, ime, status, chip, fitBadge, resnap, connect, disconnect, setStatus: statusFromOutside, starting: () => waitWords(L.starting), addControl, focus, dispose, setViewOnly, setMode, windows, closeApp, closeFront, setAppState, rootToClient, attachSatellite, satellites: () => [...sats.keys()], fixedSize: () => (fixedCss ? { ...fixedCss } : null), setFloatingChip: shell.setFloatingChip, get wmHeld() { return !!mainPtr.wmHold; }, get mode() { return mode; }, get stageScale() { return stageScale; }, get ratio() { return drawRatio; }, get pictureScale() { return drawK; }, get minSize() { return minSize ? { ...minSize } : null; }, get stageOffset() { return { ...stageOffset }; }, get client() { return client; }, get state() { return shell.state; }, get wanted() { return shell.wanted; }, get chipText() { return shell.copiedText; }, get hintShown() { return shell.hintShown; }, get copyHint() { return shell.copyHint; }, get pasteOpen() { return shell.pasteOpen; } };
}

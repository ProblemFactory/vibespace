// THE XPRA SESSION (P8-2 chunk x2, 2026-09-22) — one connection to one app's
// xpra through the ONE bridge, DOM-FREE: the transport is the upstream
// html5 v21 `Protocol.js` WORKER (served unmodified from the installed
// xpra-html5 package behind our auth at /api/desktop/<id>/xpra-ui/js/,
// MPL-2.0; it frames, rencodeplus-codes and lz4/brotli-inflates every packet
// off the main thread and hands this file plain arrays), the words are
// xpra-proto.js, and everything that touches a canvas or a keyboard event
// is xpra-view.js. Injectable `Worker`, `decode` and `now` so
// scripts/test-xpra-client.mjs drives the whole session under node with a
// fake worker and an out-of-order fake decoder.
//
// WHAT IT DECIDES:
// • the app window IS the picture (owner acceptance 1): the FIRST top-level
//   window is mapped at 0,0 with the pane's size under its own size hints
//   (`fitGeometry`) — the app never appears small in a corner of a root — and
//   `resize(w,h)` re-fits it (the display packet first so the virtual screen
//   and its work area follow, then `configure-window`); every OTHER non-popup window — a
//   dialog, a second top-level — keeps its size and is nudged INSIDE the pane
//   when it maps, when X moves it and when the pane shrinks; popups
//   (override-redirect: menus, tooltips) are drawn where X put them, never
//   moved (X would not honour it).
// • THE BELT (2026-09-22, the verifier's GNOME Calculator: a mode switch
//   resized the app to 40 % of the pane and nothing re-fitted it): the
//   server's own geometry packets (window-move-resize / window-resized — the
//   app resized or moved ITSELF) are checked against the fit; a main off by
//   more than one size increment (or not at 0,0), a secondary window outside
//   the pane, gets ONE corrective configure-window — at most one per window
//   per BELT_GAP_MS (a packet inside the gap after our own configure is its
//   confirmation or X's snap, re-checked when the gap ends), and an app that
//   undoes the fit BELT_MAX_FIGHTS times in a row, each within
//   BELT_FIGHT_MS, wins until the pane or its size hints change (bounded,
//   never a ping-pong — two viewers of different pane sizes included).
// • draws are PAINTED IN ORDER per window — decoding is async and a later
//   png may finish first, so each window carries a promise chain — and every
//   draw is ACKED (`damage-sequence`, decode time or -1 + the error) or the
//   server stops sending after its window of unacked frames.
// • the clipboard: a `clipboard-token` that carries text is surfaced ONCE
//   (deduped against what we sent and what we last received); a
//   `clipboard-request` is answered with the last text pasted here.
// • IME text: `typeText` publishes keycode rows for the composed characters
//   (`keyboard-config`) BEFORE their key presses — the x11 keyboard never
//   invents a keycode (measured on 6.5.3, see xpra-proto.js).
// • `viewOnly` (the window-live Watch mode) drops every input at the source;
//   the bridge would drop it anyway — the client MIRRORS the verdict.
// • HiDPI (2.369.158, docs/design-desktop-apps.zh.md §7.6): the session
//   speaks DEVICE px. `screen` and `resize()` take the pane in CSS px and
//   `ratio` (the view's devicePixelRatio, a number or a function read at
//   every resize) turns it into device px (`devicePane`) — the hello's
//   desktop size, every display-configure, every fit and so every
//   configure-window; windows, draws and pointer coordinates are device px
//   (the view divides for CSS and multiplies the pointer). `dpi` is the
//   DISPLAY's font dpi (the record's, 96 × scale / GDK_SCALE) and never
//   96 × ratio: xpra rewrites Xft.dpi to a client's dpi when it changes
//   (measured), which would quadruple a GDK_SCALE=2 app's text.
//   `on.constraints(hints|null)` names the MAIN window's size constraints
//   (device px) whenever the main window or its constraints change — the
//   view turns them into the smallest pane (`minPaneCss`) and the window
//   manager clamps the VibeSpace window to it; the fit never asks for less
//   than the minimum (a smaller pane shows the picture scaled to fit).
//   THE DISPLAY CONTAINS THE WINDOW IT PLACES (r2, the verifier on a 320x568
//   phone): the display size sent is max(the pane, the main window's fit) —
//   a display the size of the pane under an app fitted to its larger
//   minimum left X clamping the pointer at the display's last row, so the
//   scaled picture's lower keypad rows could not be clicked. `displayFor()`
//   is the ONE rule; every display packet goes through `syncDisplay()`.
// • x5 (docs/design-desktop-apps §7 P8-2 "x5 多客户端 = 单活跃 viewer"): ONE
//   viewer of a window is ACTIVE. `watch` (an agent drives the window) sends
//   NO geometry at all — no fit, no belt, `resize()` only remembers the pane,
//   windows are drawn where the SERVER says (the view scales the picture to
//   fit) — and leaving watch re-fits to this pane (display size + the main's
//   fit). `dormant` (another client is active: the bridge holds this
//   socket's hello and relays nothing) suspends the hello timeout — the
//   server's hello arrives the moment this pane becomes active.
// • SEAMLESS (round 3 lane B, docs/design-desktop-apps-seamless §3.3): the
//   app's OWN header bar moving / resizing its window reaches us as xpra's
//   `initiate-moveresize` (the server is the display's window manager and
//   hands the gesture to the client); it is surfaced as `on.moveresize(ev)`
//   — never acted on here: the X main window stays at 0,0 under the belt, the
//   VIBESPACE window moves (desktop-app-window.js → WindowManager). Only the
//   DRIVING pane hears it (not in Watch / view-only / blocked). `on.main(win)`
//   names the main window and its metadata whenever either changes (the
//   `decorations: 0` of a client-side-decorated app is what makes a window
//   seamless), and `on.state(win, changed)` carries the app's own maximize /
//   minimize (`window-metadata {maximized|iconic}`); `setMainState({maximized|
//   iconified})` tells the display what OUR window did (configure-window's
//   state dict — the ui driver's, measured in xpra 6.5.3 seamless.py).
// • THE APP'S FIXED SIZE (lane app-fit-fixed, 2026-10-03 — the owner's WeChat login in the top-left ~45 % of a blank
//   window, Inkscape's welcome cut at the bottom between two bands): a window whose size constraints FIX its size
//   (minimum = maximum, P.fixedSizeOf) is named by `on.fixed({wid, w, h}|null)` (device px) — the MAIN, else the
//   largest dialog with no parent when the app has no main (Inkscape 1.4.3's welcome is typed DIALOG, modal, with
//   no transient-for — it used to be placed where X centred it and never fitted). Such a lone fixed dialog is mapped
//   at 0,0, kept there by the belt, and the display contains it; the VIEW's window adopts the size (never scaled).
// • AN APP'S SECOND WINDOW (design 016 S1, lane app-guest-window, 2026-10-03 — WeChat's Moments drawn over its main
//   window, cut at the bottom): `on.constraints` carries the main's hints with the minimum raised to the UNION of every
//   held window's (P.unionMin — a second top-level or a dialog grows the pane, never cut); a second NORMAL window is
//   mapped CENTRED over the main (P.placeGuest; the belt keeps it inside as before); `on.front(win|null)` names the FRONT
//   window (P.frontOf — the topmost non-popup by z) on new / raise / lost / its title; `closeFront()` sends close-window
//   to it (the window's ✕ when the front is not the main — closeMain stays the app's own close).
// • A WINDOW PER TOP-LEVEL (design 016 S2, lane app-satellite-windows, 2026-10-03 — the owner's YES): with `slots` on (the
//   view asks for it when it can open satellite windows) every secondary NORMAL window gets a SLOT of the X root to the
//   right of the main's display (P.slotFor — side by side, never overlapping; the root = their union, one display packet),
//   mapped at its slot's origin at its own size, then fitted to its SATELLITE pane once one is attached (`setSlotPane`;
//   the belt keeps it in its slot, P.inSlot); `on.slot(wid, rect|null)` names every slot gained, moved or lost. A dialog
//   transient for a slotted window, and a popup whose origin lies in a slot, belong to that slot (P.paneOf — `ownerOf`):
//   placed inside the slot, counted in ITS minimum (`constraintsOf`), never in the main pane's union or front. The main
//   lost ⇒ the next main is ADOPTED (unslotted, fitted at 0,0); `releaseSlot` hands a window back to the main pane as a
//   guest (its satellite was closed while the X window lives); Watch slots nothing (the windows stay where the active
//   viewer put them) and leaving Watch slots what came meanwhile. ONE connection: a satellite is a pane, never a socket.
import * as P from './xpra-proto.js';

const HELLO_TIMEOUT_MS = 15000;
const PING_EVERY_MS = 5000;
const PASTE_KEY_DELAY_MS = 60; // the token must reach the server before the app's Ctrl+V asks for it (xpra-html5 delays the same way)
export const BELT_GAP_MS = 500;    // at most one corrective configure-window per window per 500 ms
export const BELT_FIGHT_MS = 2000; // an undo within 2 s of our last correction is a FIGHT…
export const BELT_MAX_FIGHTS = 3;  // …and three in a row ⇒ the app wins until the pane or its hints change
export const REFRESH_DELAYS_MS = Object.freeze([200, 500]); // the repaint ask after a client configure / an un-iconify (xpra-html5's own resize-stop timing; measured need on xpra 6.5.4)

/** The browser decoder: bytes + mime → ImageBitmap (closed by the painter). */
export function defaultDecode(bytes, mime) {
  return createImageBitmap(new Blob([bytes], { type: mime }));
}

/**
 * createXpraClient({ url, workerUrl, screen:{width,height} (CSS px), dpi (the display's font dpi), ratio (devicePixelRatio: number | () => number), layout, on, Worker, decode, now, log })
 *   on.status(state, detail)   'connecting' | 'connected' | 'closed'
 *   on.constraints(hints|null) the MAIN window's size constraints (device px) — on every change
 *   on.window(kind, win)       'new' | 'geometry' | 'raise' | 'meta' | 'lost'
 *   on.paint(win, op)          {type:'image', img, x, y, w, h} | {type:'scroll', moves}
 *   on.title(text) / on.icon({w,h,data}) / on.clipboard(text) / on.cursor(cur|null) / on.ready()
 *   on.main(win|null)          the MAIN window (its `meta` included) — when the main changes or its metadata does
 *   on.state(win, changed)     `window-metadata` carrying `maximized` / `iconic` (the keys that changed, as sent)
 *   on.moveresize(ev)          {wid, xRoot, yRoot, direction, button, source, main} — the app asked its window manager to move/resize it
 *   on.fixed(size|null)        {wid, w, h} (device px) — the app FIXED this window's size (min = max); null = no such window
 *   on.front(win|null)         the FRONT window (the topmost non-popup by z) — on a new window, a raise, a loss, its title
 *   on.slot(wid, rect|null)    S2 (`slots` on): a secondary top-level's slot of the root (device px) — gained, moved, lost
 * Returns the session handle (see the tail).
 */
export function createXpraClient({ url, workerUrl, screen, dpi = 96, ratio = 1, cover = false, slots = false, pin = null, layout = 'us', uuid = null, on = {}, Worker: WorkerCtor = (typeof Worker !== 'undefined' ? Worker : null), decode = defaultDecode, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), log = null, helloTimeoutMs = HELLO_TIMEOUT_MS, pasteKeyDelayMs = PASTE_KEY_DELAY_MS, beltGapMs = BELT_GAP_MS, beltFightMs = BELT_FIGHT_MS, beltMaxFights = BELT_MAX_FIGHTS, refreshDelaysMs = REFRESH_DELAYS_MS } = {}) {
  const emit = (name, ...args) => { try { on[name]?.(...args); } catch (e) { log?.warn?.(`[xpra] on.${name} threw: ${e && e.message}`); } };
  const windows = new Map();
  const ime = new P.ImeKeymap();
  const wheel = new P.WheelAccumulator();
  let worker = null, state = 'idle', closedReason = null;
  let serverCaps = null, packetTypes = [];
  const ratioNow = () => P.pixelRatioOf(typeof ratio === 'function' ? ratio() : ratio);
  // lane D (a): a RESAMPLED picture (a fractional scale) rounds the device pane UP so the window covers the pane
  const coverNow = () => !!(typeof cover === 'function' ? cover() : cover);
  let cssPane = { width: Math.max(1, Math.floor(screen?.width || 1)), height: Math.max(1, Math.floor(screen?.height || 1)) };
  let pane = P.devicePane(cssPane, ratioNow(), { cover: coverNow() }); // DEVICE px — what X, the fit and the pointer speak
  let lastConstraints; // the main window's size constraints last announced (undefined = never)
  let lastFixed; // the fixed window's size last announced, 'WxH' | null (undefined = never)
  let lastFront; // the front window last announced, 'wid/main/title' | null (undefined = never)
  let mainWid = 0, focusedWid = 0, zTop = 0;
  let helloTimer = null, pingTimer = null;
  let lastPaste = null, lastReceived = null, viewOnly = false;
  let watch = false, dormant = false; // x5 (see the header)
  let sentDisplay = null; // the display size this client last asked for (device px) — the hello's desktop size first
  // lane e2b (design-agent-browser-v2 §E2.2): THE PIN ({w, h} device px | null) — the X side (the fit, the display, a dialog's
  // place, the hello) speaks the PIN instead of the pane; the view rescales the picture to the pane (upscaling allowed)
  const pinFrom = (p) => (p && p.w > 0 && p.h > 0 ? { w: Math.floor(p.w), h: Math.floor(p.h) } : null);
  let pinNow = pinFrom(pin);
  const fitTarget = () => (pinNow ? { paneW: pinNow.w, paneH: pinNow.h } : { paneH: pane.height, paneW: pane.width });
  const unknownTypes = new Set();
  // design 016 S2: the secondary top-levels a satellite draws, in the order they mapped; each one's satellite pane (device
  // px) once attached; the windows handed back to the main pane for this session; the slots as last laid out
  const slotsOn = () => !!(typeof slots === 'function' ? slots() : slots);
  const slotOrder = [], slotPanes = new Map(), noSlot = new Set();
  let slotRects = new Map();

  const send = (packet) => { if (!worker || state === 'closed') return false; try { worker.postMessage({ c: 's', p: packet }); return true; } catch (e) { log?.warn?.(`[xpra] send failed: ${e && e.message}`); return false; } };
  const finish = (reason) => {
    if (state === 'closed') return;
    state = 'closed'; closedReason = reason || 'closed';
    clearTimeout(helloTimer); clearInterval(pingTimer);
    for (const w of windows.values()) { clearTimeout(w.belt && w.belt.timer); for (const t of w.refreshTimers || []) clearTimeout(t); }
    if (worker) { try { worker.postMessage({ c: 'c' }); } catch {} try { worker.postMessage({ c: 't' }); } catch {} try { worker.terminate?.(); } catch {} }
    worker = null;
    emit('status', 'closed', closedReason);
  };

  // ── windows ──────────────────────────────────────────────────────────────
  const winTitle = (meta) => P.bytesToString(meta && meta.title != null ? meta.title : '');
  /** S2: which pane draws a window — a slot's wid (a satellite) or 0 (the main pane); the windows of one pane. */
  const ownerOf = (win) => P.paneOf(win, slotRects, windows);
  const paneWindows = (owner = 0) => [...windows.values()].filter((w) => ownerOf(w) === owner);
  /** HiDPI / min size: tell the view the MAIN window's constraints (device px) when they change — the minimum raised to
   *  the UNION of every held window's (design 016 S1a: WeChat's Moments, min 880×1120 over a main of 840×816). */
  const announceConstraints = () => {
    const main = mainWid ? windows.get(mainWid) : null;
    const own = main ? P.sizeHintsOf(main.meta) : null;
    const mine = main ? P.unionMin([main]) : null, all = main ? P.unionMin(paneWindows(0)) : null; // S2: a satellite's windows grow ITS window, not this one
    const c = all && (!mine || all.w > mine.w || all.h > mine.h) ? { ...own, 'minimum-size': [all.w, all.h] } : own;
    const key = c ? JSON.stringify(c) : null;
    if (key === lastConstraints) return;
    lastConstraints = key;
    emit('constraints', c ? { ...c } : null);
  };
  /** THE APP'S FIXED WINDOW (see the header; MEASURED on xpra 6.5.4 at 2×: WeChat's login = a NORMAL main, min = max
   *  560×760; Inkscape's welcome = the app's ONLY top-level, DIALOG + modal + no transient-for, min = max 1420×1356): the
   *  window the picture is ABOUT — the main, else the largest dialog with no parent — when its constraints FIX its size. */
  const fixedWindow = () => {
    const main = mainWid ? windows.get(mainWid) : null;
    const subject = main || [...windows.values()].filter((w) => w.kind === 'dialog' && !w.meta['transient-for']).sort((a, b) => (b.w * b.h - a.w * a.h) || (a.wid - b.wid))[0] || null;
    return subject && P.fixedSizeOf(P.sizeHintsOf(subject.meta)) ? subject : null;
  };
  /** S1c: on.front — the FRONT window (P.frontOf) whenever it, its title or whether it is the main changes. */
  const announceFront = () => {
    // S2: the main pane's front — a satellite's window is in front in its own window
    const f = P.frontOf(paneWindows(0));
    const key = f ? `${f.wid}/${f.wid === mainWid}/${f.title}` : null;
    if (key === lastFront) return;
    lastFront = key;
    emit('front', f);
  };
  /** The fixed window when it is a LONE DIALOG (the app has no main): placed at 0,0, contained by the display. */
  const loneFixed = () => { const f = fixedWindow(); return f && f.kind !== 'main' ? f : null; };
  /** on.fixed — the fixed window's size (device px) whenever it changes; null when there is none any more. */
  const announceFixed = () => {
    const f = fixedWindow(), s = f ? P.fixedSizeOf(P.sizeHintsOf(f.meta)) : null;
    const key = s ? `${s.w}x${s.h}` : null;
    if (key === lastFixed) return;
    lastFixed = key;
    emit('fixed', s ? { wid: f.wid, w: s.w, h: s.h } : null);
  };
  /** The display size (device px): the pane, grown to CONTAIN the main window's fit (its minimum may be larger than the pane). */
  const mainDisplay = () => {
    const main = mainWid ? windows.get(mainWid) : null, lone = main ? null : loneFixed();
    const g = main && main.kind === 'main' ? P.fitGeometry(fitTarget(), P.sizeHintsOf(main.meta)) : lone ? { x: 0, y: 0, w: lone.w, h: lone.h } : null;
    const ft = fitTarget(); // lane e2b: the pin's size when pinned, else the pane
    return { width: Math.max(ft.paneW, g ? g.x + g.w : 0), height: Math.max(ft.paneH, g ? g.y + g.h : 0) };
  };
  /** S2: a slot's size — the satellite pane grown to its window's fit, else the window's own size. */
  const slotSizeOf = (win) => {
    const p = slotPanes.get(win.wid);
    if (!p) return { w: win.w, h: win.h };
    const g = P.fitGeometry({ paneW: p.width, paneH: p.height }, P.sizeHintsOf(win.meta));
    return { w: Math.max(p.width, g.w), h: Math.max(p.height, g.h) };
  };
  /** S2: lay the slots out again (P.slotFor) and name every slot gained, moved or lost (on.slot). */
  const layoutSlots = () => {
    const before = slotRects;
    if (!slotOrder.length) slotRects = new Map();
    else { const m = mainDisplay(); slotRects = P.slotFor({ w: m.width, h: m.height }, slotOrder.filter((wid) => windows.has(wid)).map((wid) => ({ wid, ...slotSizeOf(windows.get(wid)) }))).slots; }
    for (const wid of new Set([...before.keys(), ...slotRects.keys()])) {
      const a = before.get(wid), b = slotRects.get(wid);
      if (a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h) continue;
      emit('slot', wid, b ? { ...b } : null);
    }
  };
  /** The display (device px): the main pane's — then, S2, grown to hold every slot. */
  const displayFor = () => {
    const d = mainDisplay();
    for (const s of slotRects.values()) { d.width = Math.max(d.width, s.x + s.w); d.height = Math.max(d.height, s.y + s.h); }
    return d;
  };
  /** S2: a window leaves the slots (adopted as the main, handed back, lost) — the others close up. */
  const unslot = (wid) => { const i = slotOrder.indexOf(wid); if (i < 0) return false; slotOrder.splice(i, 1); slotPanes.delete(wid); layoutSlots(); return true; };
  const beltOthers = (why) => { for (const win of windows.values()) if (win.wid !== mainWid && win.kind !== 'popup') belt(win, why); };
  /** Ask for `displayFor()` when it differs from what this client last asked (or always, `force`) — never in Watch/before the hello. */
  function syncDisplay(force = false) {
    if (state !== 'connected' || watch) return;
    if (slotOrder.length || slotRects.size) layoutSlots(); // S2: the slots follow the main's display (and their panes)
    const d = displayFor();
    if (!force && sentDisplay && sentDisplay.width === d.width && sentDisplay.height === d.height) return;
    sentDisplay = d;
    send(P.displayPacket(packetTypes, { width: d.width, height: d.height, dpi }));
  }
  const pickMain = () => {
    if (mainWid && windows.has(mainWid)) return;
    const next = [...windows.values()].find((w) => w.kind === 'main') || null;
    mainWid = next ? next.wid : 0;
    if (next) unslot(next.wid); // S2: the next main is ADOPTED by the main pane — its slot (and satellite) goes
    if (next) { emit('title', next.title); refit(next); }
    else { emit('title', ''); syncDisplay(); } // no main: the display is the pane again (or contains a lone fixed dialog)
    announceConstraints();
    announceFixed();
    emit('main', next);
  };
  /** The main window follows the pane: a new fit ⇒ configure-window (the server confirms with window-move-resize / window-resized). */
  const refit = (win) => {
    if (!win || win.wid !== mainWid || win.kind !== 'main' || watch || win.premap) return; // a main being announced (lane D (a) F3) is fitted by its own map
    const g = P.fitGeometry(fitTarget(), P.sizeHintsOf(win.meta));
    syncDisplay(); // the display follows the fit FIRST (a minimum larger than the pane grows it; a smaller one gives it back)
    if (g.x === win.x && g.y === win.y && g.w === win.w && g.h === win.h) return;
    const grew = g.w > win.w || g.h > win.h;
    Object.assign(win, g);
    beltOf(win).at = now(); // a client-initiated fit: a packet inside the gap is its confirmation
    send(P.configureWindow(win.wid, g));
    if (grew) refreshSoon(win); // only a window that GREW has a region nothing painted yet
    emit('window', 'geometry', win);
  };
  /** THE REPAINT ASK (the .197 integration, MEASURED on xpra 6.5.4): after a client fit that GREW the window, or an
   *  un-iconify, the server may leave the window's new region unpainted for good (the Calculator minimized, resized by
   *  the sidebar opening, restored: 70.9 % of its right edge and 0 % of its bottom edge drawn); ONE buffer-refresh
   *  repaints it at once. Asked the way xpra-html5 asks after its own resize (+200 ms, +500 ms), debounced per window,
   *  never while the window is iconic, never from Watch / view-only (a refused viewer relays nothing); a shrink or a
   *  same-size configure exposes nothing new and asks nothing. */
  const refreshSoon = (win) => {
    if (!win || watch || viewOnly || !refreshDelaysMs.length) return;
    for (const t of win.refreshTimers || []) clearTimeout(t);
    win.refreshTimers = refreshDelaysMs.map((ms) => setTimeout(() => {
      const w = windows.get(win.wid);
      if (w && state === 'connected' && !dormant && !watch && !viewOnly && !(w.meta && w.meta.iconic)) send(P.bufferRefresh(w.wid));
    }, ms));
  };
  // ── the belt: the server's geometry packets are checked against the fit ──
  const beltOf = (win) => (win.belt ||= { at: 0, fights: 0, gaveUp: false, timer: null });
  const resetBelt = (win) => { const b = beltOf(win); b.fights = 0; b.gaveUp = false; };
  /** Where the window SHOULD be, or null when it already is (within one size increment for the main). */
  const beltTarget = (win) => {
    if (!win || win.kind === 'popup') return null;
    if (win.wid === mainWid && win.kind === 'main') {
      const hints = P.sizeHintsOf(win.meta);
      const g = P.fitGeometry(fitTarget(), hints);
      const inc = Array.isArray(hints && hints.increment) ? hints.increment.map((v) => Math.max(1, Number(v) || 1)) : [1, 1];
      const within = win.x === 0 && win.y === 0 && Math.abs(win.w - g.w) < inc[0] && Math.abs(win.h - g.h) < inc[1];
      return within ? null : g;
    }
    if (win === loneFixed()) return win.x === 0 && win.y === 0 ? null : { x: 0, y: 0, w: win.w, h: win.h }; // the app's fixed window IS the picture: at 0,0
    const slot = slotRects.get(win.wid);
    if (slot) { // S2: a slotted window — at its slot's origin, fitted to its satellite's pane (its own size until one is attached)
      const p = slotPanes.get(win.wid), hints = P.sizeHintsOf(win.meta);
      const g = p ? P.fitGeometry({ paneW: p.width, paneH: p.height }, hints) : { w: win.w, h: win.h };
      const inc = Array.isArray(hints && hints.increment) ? hints.increment.map((v) => Math.max(1, Number(v) || 1)) : [1, 1];
      const at = P.inSlot(win, slot);
      return !at.moved && Math.abs(win.w - g.w) < inc[0] && Math.abs(win.h - g.h) < inc[1] ? null : { x: slot.x, y: slot.y, w: g.w, h: g.h };
    }
    const owner = ownerOf(win);
    if (owner) { const inSat = P.placeInRect(win, slotRects.get(owner)); return inSat.moved ? { x: inSat.x, y: inSat.y, w: win.w, h: win.h } : null; } // a satellite's dialog: inside ITS slot
    const placed = P.placeInside(win, fitTarget());
    return placed.moved ? { x: placed.x, y: placed.y, w: win.w, h: win.h } : null;
  };
  const belt = (win, why) => {
    if (!win || !windows.has(win.wid) || state !== 'connected' || win.kind === 'popup' || watch || win.premap) return;
    const b = beltOf(win);
    clearTimeout(b.timer); b.timer = null;
    const g = beltTarget(win);
    if (!g || b.gaveUp) return;
    const t = now();
    if (b.at && t - b.at < beltGapMs) { b.timer = setTimeout(() => { b.timer = null; belt(windows.get(win.wid), why); }, Math.max(1, Math.ceil(b.at + beltGapMs - t))); return; }
    b.fights = b.at && t - b.at <= beltFightMs ? b.fights + 1 : 1;
    if (b.fights > beltMaxFights) { b.gaveUp = true; log?.log?.(`[xpra] window ${win.wid} undid the fit ${beltMaxFights} times in a row — leaving it at ${win.w}x${win.h}+${win.x}+${win.y} until the pane or its size hints change`); return; }
    const grew = g.w > win.w || g.h > win.h;
    Object.assign(win, g);
    b.at = t;
    send(P.configureWindow(win.wid, g));
    if (grew) refreshSoon(win);
    emit('window', 'geometry', win);
  };
  const newWindow = (p, overrideRedirect) => {
    const wid = p[1];
    if (windows.has(wid)) { log?.warn?.(`[xpra] window ${wid} announced twice`); return; }
    const meta = p[6] && typeof p[6] === 'object' ? p[6] : {};
    const kind = P.windowKind(meta, overrideRedirect);
    let g = { x: p[2], y: p[3], w: Math.max(1, p[4]), h: Math.max(1, p[5]) };
    const isMain = kind === 'main' && !(mainWid && windows.has(mainWid));
    const win = { wid, ...g, meta, kind, title: winTitle(meta), z: ++zTop, mapped: !overrideRedirect, q: Promise.resolve(), premap: isMain && !watch };
    windows.set(wid, win);
    if (!isMain && kind === 'main' && !watch && slotsOn() && !noSlot.has(wid)) { slotOrder.push(wid); layoutSlots(); } // S2: a second top-level gets its slot
    // LANE D (a) F3 — THE MAIN IS NAMED BEFORE IT IS FITTED: `on.main` carries its metadata (a CSD app's
    // `decorations: 0` folds the window's bars — the pane GROWS) and the view answers with resize() INSIDE that call,
    // so the fit and the map below use the FINAL pane. Fitted first, the map was the pane with the bars still up,
    // re-fitted ~160 ms later, and the app snapped back to its mapped size ~760 ms after that (measured on every CSD
    // connect: a 65 CSS px band of background twice). The constraints follow the main (the window's minimum is
    // measured around the folded chrome). refit / belt skip a `premap` window — its own map is the fit.
    if (isMain) { mainWid = wid; emit('title', win.title); emit('main', win); announceConstraints(); }
    if (watch) { /* x5 Watch: drawn where the server has it — the geometry is the active viewer's */ }
    else if (isMain) g = P.fitGeometry(fitTarget(), P.sizeHintsOf(meta));
    else if (win === loneFixed()) g = { x: 0, y: 0, w: g.w, h: g.h }; // the app's FIXED lone dialog (Inkscape's welcome) IS the picture: at 0,0, never where X centred it
    else if (slotRects.has(wid)) { const s = slotRects.get(wid); g = { x: s.x, y: s.y, w: g.w, h: g.h }; } // S2: mapped at its slot's origin, its own size
    else if (kind === 'main') { const m = windows.get(mainWid); const placed = P.placeGuest(g, fitTarget(), m && m.wid !== wid ? m : null); g = { x: placed.x, y: placed.y, w: placed.w, h: placed.h }; } // S1b: a SECOND top-level (WeChat's Moments) centred over the main, inside the pane
    else if (kind !== 'popup' && ownerOf(win)) { const placed = P.placeInRect(g, slotRects.get(ownerOf(win))); g = { x: placed.x, y: placed.y, w: placed.w, h: placed.h }; } // S2: a satellite's dialog, inside ITS slot
    else if (kind !== 'popup') { const placed = P.placeInside(g, fitTarget()); g = { x: placed.x, y: placed.y, w: placed.w, h: placed.h }; } // a dialog: inside, never lost off the pane
    Object.assign(win, g);
    win.premap = false;
    if (isMain || win === loneFixed() || slotRects.has(wid)) syncDisplay(); // the display contains the fit (or the fixed dialog, or S2 the slot) before the map
    if (kind !== 'popup') { announceFixed(); announceConstraints(); } // S1a: a second window's minimum grows the pane
    emit('window', 'new', win);
    if (!overrideRedirect) { send(P.mapWindow(wid, g)); focusWindow(wid); }
  };
  const lostWindow = (wid) => {
    const win = windows.get(wid);
    if (!win) return;
    windows.delete(wid);
    clearTimeout(win.belt && win.belt.timer);
    for (const t of win.refreshTimers || []) clearTimeout(t);
    emit('window', 'lost', win);
    if (focusedWid === wid) focusedWid = 0;
    noSlot.delete(wid);
    const hadSlot = unslot(wid); // S2: its slot goes (on.slot null), the slots to its right close up
    if (mainWid === wid) { mainWid = 0; pickMain(); }
    if (hadSlot || slotRects.size) { syncDisplay(); beltOthers('slots moved'); } // the root shrinks; every slot keeps its window
    const lone = loneFixed(); // the main gone, a lone fixed dialog left: it becomes the picture
    if (lone) { syncDisplay(); belt(lone, 'the fixed window'); }
    announceFixed();
    announceConstraints(); // S1a: the union shrinks back
    announceFront();
  };
  const moveResize = (wid, x, y, w, h) => {
    const win = windows.get(wid);
    if (!win) return;
    if (x != null) { win.x = x; win.y = y; }
    win.w = Math.max(1, w); win.h = Math.max(1, h);
    emit('window', 'geometry', win);
    if (slotRects.has(wid) && !slotPanes.has(wid)) { syncDisplay(); beltOthers('slot resized'); } // S2: a slot follows its own window until a satellite holds it
    belt(win, 'server geometry'); // the app moved/resized itself (or X snapped our fit): back to the fit, bounded
  };
  const focusWindow = (wid) => {
    const win = windows.get(wid);
    if (!win) return;
    focusedWid = wid;
    win.z = ++zTop;
    send(P.focusPacket(wid));
    emit('window', 'raise', win);
    announceFront();
  };
  /** The topmost window under a pane point (popups above dialogs above main), or null. */
  const windowAt = (x, y) => {
    const rank = (w) => (w.kind === 'popup' ? 2e9 : w.kind === 'dialog' ? 1e9 : 0) + w.z;
    return [...windows.values()].filter((w) => x >= w.x && y >= w.y && x < w.x + w.w && y < w.y + w.h).sort((a, b) => rank(b) - rank(a))[0] || null;
  };

  // ── draws, in order, acked ───────────────────────────────────────────────
  const draw = (p) => {
    const d = P.parseDraw(p);
    const win = windows.get(d.wid);
    if (!win) { send(P.damageAck(d.seq, d.wid, d.w, d.h, -1, 'no such window')); return; }
    win.q = win.q.then(async () => {
      const t0 = now();
      try {
        if (d.coding === 'void') { /* nothing to paint */ }
        else if (d.coding === 'scroll') emit('paint', win, { type: 'scroll', moves: Array.isArray(d.data) ? d.data : [] });
        else {
          const mime = P.mimeFor(d.coding);
          if (!mime) throw new Error(`unsupported encoding ${d.coding}`);
          const img = await decode(d.data, mime);
          emit('paint', win, { type: 'image', img, x: d.x, y: d.y, w: d.w, h: d.h });
        }
        send(P.damageAck(d.seq, d.wid, d.w, d.h, Math.max(0, Math.round(now() - t0)), ''));
      } catch (e) {
        send(P.damageAck(d.seq, d.wid, d.w, d.h, -1, String((e && e.message) || e)));
      }
    });
  };

  // ── the app's own header bar moves / resizes ITS window: surfaced, never applied here ──
  const moveResizeAsked = (p) => {
    const m = P.parseMoveResize(p);
    if (!m) return;
    const win = windows.get(m.wid);
    // only the DRIVING pane: a watching / view-only / blocked pane never moves the window of the viewer that is driving
    if (!win || viewOnly || watch || dormant || state !== 'connected') { log?.log?.(`[xpra] initiate-moveresize for window ${m.wid} ignored (${!win ? 'unknown window' : 'not the driving pane'})`); return; }
    emit('moveresize', { ...m, main: m.wid === mainWid });
  };

  // ── packets from the server ──────────────────────────────────────────────
  const onPacket = (p) => {
    if (!Array.isArray(p) || !p.length) return;
    const type = P.bytesToString(p[0]);
    switch (type) {
      case 'open': // the worker's own event: the socket is up ⇒ hello
        emit('status', 'connecting');
        sentDisplay = { ...pane };
        send(['hello', P.helloCaps({ width: fitTarget().paneW, height: fitTarget().paneH, dpi, uuid: uuid || `vibespace-${Math.random().toString(36).slice(2, 10)}`, layout })]);
        return;
      case 'close': finish(closedReason || P.bytesToString(p[1]) || 'the connection closed'); return;
      case 'error': finish(P.bytesToString(p[1]) || 'connection error'); return;
      case 'hello': {
        clearTimeout(helloTimer);
        serverCaps = p[1] && typeof p[1] === 'object' ? p[1] : {};
        packetTypes = Array.isArray(serverCaps['packet-types']) ? serverCaps['packet-types'].map(P.bytesToString) : [];
        send(P.keyboardConfigPacket(packetTypes, { layout }));
        // x5: a hello held while this pane was blocked carried the pane of THAT moment — the display follows the pane of now
        state = 'connected';
        syncDisplay();
        emit('status', 'connected', { version: P.bytesToString(serverCaps.version || '') });
        clearInterval(pingTimer);
        pingTimer = setInterval(() => send(P.pingPacket(now())), PING_EVERY_MS);
        return;
      }
      case 'startup-complete': emit('ready'); return;
      case 'disconnect': { closedReason = p.slice(1).map(P.bytesToString).filter(Boolean).join(' / ') || 'the xpra server disconnected'; finish(closedReason); return; }
      case 'challenge': finish('the xpra server asked for authentication, which this window does not do'); return;
      case 'ping': send(P.pingEcho(p[1], p.length >= 4 ? p[3] : '')); return;
      case 'new-window': newWindow(p, false); return;
      case 'new-override-redirect': newWindow(p, true); return;
      case 'lost-window': lostWindow(p[1]); return;
      case 'window-move-resize': moveResize(p[1], p[2], p[3], p[4], p[5]); return;
      case 'configure-override-redirect': moveResize(p[1], p[2], p[3], p[4], p[5]); return;
      case 'window-resized': moveResize(p[1], null, null, p[2], p[3]); return;
      case 'raise-window': { const w = windows.get(p[1]); if (w) { w.z = ++zTop; emit('window', 'raise', w); announceFront(); } return; }
      case 'window-metadata': {
        const win = windows.get(p[1]);
        const meta = p[2] && typeof p[2] === 'object' ? p[2] : {};
        if (!win) return;
        Object.assign(win.meta, meta);
        if ('title' in meta) { win.title = winTitle(meta); if (win.wid === mainWid) emit('title', win.title); }
        if ('size-constraints' in meta || 'size-hints' in meta) { resetBelt(win); refit(win); announceConstraints(); announceFixed(); if (win === loneFixed()) { syncDisplay(); belt(win, 'the fixed window'); } if (slotPanes.has(win.wid)) { syncDisplay(); beltOthers('size hints'); } }
        if ('title' in meta) announceFront();
        emit('window', 'meta', win);
        if (win.wid === mainWid) emit('main', win);
        if ('maximized' in meta || 'iconic' in meta) { const changed = {}; if ('maximized' in meta) changed.maximized = !!meta.maximized; if ('iconic' in meta) changed.iconic = !!meta.iconic; emit('state', win, changed); }
        return;
      }
      case 'window-icon': { if (p[1] === mainWid && P.bytesToString(p[4]) === 'png' && p[5]) emit('icon', { w: p[2], h: p[3], data: p[5] }); return; }
      case 'draw': draw(p); return;
      case 'eos': return;
      case 'cursor': emit('cursor', P.parseCursor(p)); return;
      case 'clipboard-token': {
        const { text } = P.parseClipboardToken(p);
        if (text == null || text === '' || text === lastPaste || text === lastReceived) return;
        lastReceived = text;
        emit('clipboard', text);
        return;
      }
      case 'clipboard-request': { const reqId = p[1], selection = P.bytesToString(p[2]); send(lastPaste != null ? P.clipboardContents(reqId, selection, lastPaste) : P.clipboardNone(reqId, selection)); return; }
      case 'ping_echo': case 'setting-change': case 'encodings': case 'bell': case 'notify_show': case 'notify_close': case 'info-response':
      case 'initiate-moveresize': case 'window-initiate-moveresize': moveResizeAsked(p); return;
      case 'new-tray': case 'send-file': case 'open-url': case 'pointer-position': case 'set-clipboard-enabled':
      case 'clipboard-enable-selections': case 'clipboard-pending-requests': case 'desktop_size': case 'control': case 'sound-data':
        return;
      default:
        if (!unknownTypes.has(type)) { unknownTypes.add(type); log?.log?.(`[xpra] ignoring packet type ${type}`); }
    }
  };

  // ── the transport ────────────────────────────────────────────────────────
  const connect = () => {
    if (state !== 'idle') return;
    if (!WorkerCtor) { finish('this browser has no Web Workers'); return; }
    state = 'opening';
    try { worker = new WorkerCtor(workerUrl); }
    catch (e) { finish(`the xpra protocol worker could not start: ${(e && e.message) || e}`); return; }
    // The handler is bound to THIS worker instance: a real Worker can still
    // deliver a message queued before terminate(), and finish() nulls `worker`
    // first — a late 'r' then dereferenced null (the 2.369.165 push gate crash).
    // A message from a worker finish() already tore down is ignored, never acted on.
    const w = worker;
    w.onmessage = (e) => {
      if (worker !== w) return;
      const m = e && e.data;
      if (!m || typeof m !== 'object') return;
      if (m.c === 'r') { w.postMessage({ c: 'o', u: url }); return; }
      if (m.c === 'p') { onPacket(m.p); return; }
      if (m.c === 'l') { log?.log?.(`[xpra worker] ${m.t}`); return; }
    };
    worker.onerror = (e) => { finish(`the xpra protocol worker failed: ${(e && (e.message || e.type)) || 'error'}`); };
    armHello();
  };
  function armHello() {
    clearTimeout(helloTimer);
    if (dormant || state === 'connected' || state === 'closed') return; // x5: a blocked pane waits for its turn, not for a timeout
    helloTimer = setTimeout(() => { if (state !== 'connected' && !dormant) finish(`no hello from the xpra server within ${Math.round(helloTimeoutMs / 1000)} s`); }, helloTimeoutMs);
  }
  /** x5: leaving Watch re-fits to THIS pane — the display size first, then the main's fit, dialogs kept inside. */
  function setWatch(v) {
    const was = watch; watch = !!v;
    if (!was || watch || state !== 'connected') return;
    if (slotsOn()) for (const win of windows.values()) if (win.kind === 'main' && win.wid !== mainWid && !slotOrder.includes(win.wid) && !noSlot.has(win.wid)) slotOrder.push(win.wid); // S2: what mapped during Watch gets its slot now
    syncDisplay(true); // the watched viewer set the display — this pane's is asked for again, whatever it last sent
    for (const win of windows.values()) resetBelt(win);
    refit(windows.get(mainWid));
    for (const win of windows.values()) if (win.wid !== mainWid && win.kind !== 'popup') belt(win, 'active again');
  }
  /** lane e2b (§E2.2): pin (or null = unpin) — the main window fits the PIN, never the pane, re-fitted in place (no re-create). */
  function setPin(p) {
    const next = pinFrom(p);
    if ((next && pinNow && next.w === pinNow.w && next.h === pinNow.h) || (!next && !pinNow)) return;
    pinNow = next;
    if (state !== 'connected' || watch) return; // Watch: the active viewer's geometry stands (the view scales)
    syncDisplay();
    for (const win of windows.values()) resetBelt(win);
    refit(windows.get(mainWid));
    for (const win of windows.values()) if (win.wid !== mainWid && win.kind !== 'popup') belt(win, pinNow ? 'pinned' : 'unpinned');
  }
  function setDormant(v) { dormant = !!v; if (dormant) clearTimeout(helloTimer); else if (worker) armHello(); }

  // ── input (every method is a no-op in view-only) ─────────────────────────
  /** The pane in CSS px; the device size (× the ratio of NOW — a monitor move changes it) is what is sent. */
  const resize = (width, height) => {
    cssPane = { width: Math.max(1, Math.floor(width || 1)), height: Math.max(1, Math.floor(height || 1)) };
    const d = P.devicePane(cssPane, ratioNow(), { cover: coverNow() });
    const w = d.width, h = d.height;
    if (w === pane.width && h === pane.height) return;
    pane = { width: w, height: h };
    if (state !== 'connected' || watch) return; // x5 Watch: the pane is remembered, the geometry is the active viewer's (the view scales)
    syncDisplay();
    for (const win of windows.values()) resetBelt(win); // a new pane is a new target: an app that won the last fight is fitted again
    refit(windows.get(mainWid));
    for (const win of windows.values()) if (win.wid !== mainWid && win.kind !== 'popup') belt(win, 'pane resized'); // a shrunk pane keeps dialogs inside
  };
  const foreignDown = new Set(); // keys whose press went through typeText (already released) — their keyup is ignored
  const keyDown = (ev) => {
    const shortcut = P.clipboardShortcut({ key: ev?.key, control: ev?.mods?.control, meta: ev?.mods?.meta });
    if (shortcut === 'paste') return 'paste';
    if (viewOnly) return null;
    const k = P.keyActionFor(ev);
    if (!k) return null;
    if (!P.nativeKey(k)) {
      // a character the published keymap lacks (é on a US layout, a dead-key result): publish a row and press it
      if (k.string && !k.modifiers.some((m) => m === 'control' || m === 'mod1' || m === 'mod4')) { foreignDown.add(ev.code || ev.key); typeText(k.string); return 'sent'; }
      return null;
    }
    send(P.keyAction(focusedWid, k, true));
    return shortcut === 'copy' ? 'copy' : 'sent';
  };
  const keyUp = (ev) => {
    const shortcut = P.clipboardShortcut({ key: ev?.key, control: ev?.mods?.control, meta: ev?.mods?.meta });
    if (shortcut === 'paste') return 'paste';
    if (viewOnly) return null;
    if (foreignDown.delete(ev?.code || ev?.key)) return 'sent';
    const k = P.keyActionFor(ev);
    if (!k || !P.nativeKey(k)) return null;
    send(P.keyAction(focusedWid, k, false));
    return shortcut === 'copy' ? 'copy' : 'sent';
  };
  /** Composed / inserted text (an IME's compositionend, a virtual keyboard's input). */
  function typeText(text) {
    if (viewOnly || !text) return 0;
    const plan = ime.plan(text);
    if (plan.changed) send(P.keyboardConfigPacket(packetTypes, { layout, extra: plan.rows })); // the keymap is reprogrammed before the presses (same socket, same thread on the server)
    for (const k of plan.keys) { send(P.keyAction(focusedWid, k, true)); send(P.keyAction(focusedWid, k, false)); }
    return plan.keys.length;
  }
  const pointerMove = (x, y, mods = {}) => {
    if (viewOnly) return;
    const win = windowAt(x, y);
    send(P.pointerPosition(win ? win.wid : 0, P.pointerCoords(x, y, win), P.modifiersOf(mods)));
  };
  const pointerButton = (x, y, domButton, pressed, mods = {}) => {
    if (viewOnly) return;
    const win = windowAt(x, y);
    if (pressed && win && win.wid !== focusedWid && win.kind !== 'popup') focusWindow(win.wid);
    send(P.buttonAction(win ? win.wid : 0, P.xButton(domButton), pressed, P.pointerCoords(x, y, win), P.modifiersOf(mods)));
  };
  const wheelAt = (x, y, deltaX, deltaY, deltaMode = 0, mods = {}) => {
    if (viewOnly) return;
    const win = windowAt(x, y);
    const coords = P.pointerCoords(x, y, win), m = P.modifiersOf(mods), wid = win ? win.wid : 0;
    for (const [button, n] of wheel.feed(deltaX, deltaY, deltaMode)) for (let i = 0; i < n; i++) { send(P.buttonAction(wid, button, true, coords, m)); send(P.buttonAction(wid, button, false, coords, m)); }
  };
  /** Text from the browser into the app's clipboard; `press` also sends the
   *  app a Ctrl+V after the token has had time to land. */
  const pasteText = (text, { press = true } = {}) => {
    if (viewOnly || text == null || text === '') return false;
    lastPaste = String(text);
    send(P.clipboardToken(lastPaste));
    if (press) setTimeout(() => {
      if (state !== 'connected') return;
      const ctrl = { keyname: 'Control_L', keyval: 0, string: '', keycode: 17, modifiers: [] };
      const v = { keyname: 'v', keyval: 118, string: 'v', keycode: 86, modifiers: ['control'] };
      send(P.keyAction(focusedWid, ctrl, true)); send(P.keyAction(focusedWid, v, true)); send(P.keyAction(focusedWid, v, false)); send(P.keyAction(focusedWid, { ...ctrl, modifiers: ['control'] }, false));
    }, pasteKeyDelayMs);
    return true;
  };

  /** round 3 A2 (docs/design-desktop-apps-seamless §3.2): the OUTER ✕ asks the app to close its MAIN window — xpra
   *  `close-window` = WM_DELETE_WINDOW, so the app may answer with its own "save?" dialog and nothing closes. Never a
   *  dialog's wid (the app's own ✕ on a dialog is the app's), never from Watch / view-only. false = nothing sent. */
  const closeMain = () => {
    if (state !== 'connected' || viewOnly || watch || !mainWid || !windows.has(mainWid)) return false;
    return send(P.closeWindow(mainWid));
  };
  /** S1c (design 016): the outer ✕ while the FRONT window is not the main (WeChat's Moments over its main) — close-window
   *  to THAT window; the app is asked to close only when its main is in front (closeMain). Same guards. false = nothing sent. */
  const closeFront = () => {
    const f = P.frontOf(paneWindows(0));
    if (state !== 'connected' || viewOnly || watch || !f) return false;
    return send(P.closeWindow(f.wid));
  };

  /** S2: the satellite's ✕ — close-window to ITS X window (the app may refuse: nothing closes then). Same guards. */
  const closeWindow = (wid) => {
    if (state !== 'connected' || viewOnly || watch || !windows.has(wid)) return false;
    return send(P.closeWindow(wid));
  };
  /** S2: a satellite's pane (CSS px; null = detached) — its window is fitted to it inside its slot (the root follows). */
  const setSlotPane = (wid, size) => {
    const win = windows.get(wid);
    if (!win || !slotOrder.includes(wid)) return false;
    const p = size ? P.devicePane({ width: Math.max(1, Math.floor(size.width || 1)), height: Math.max(1, Math.floor(size.height || 1)) }, ratioNow(), { cover: coverNow() }) : null;
    const cur = slotPanes.get(wid) || null;
    if (p ? cur && cur.width === p.width && cur.height === p.height : !cur) return true;
    if (p) slotPanes.set(wid, p); else slotPanes.delete(wid);
    if (state !== 'connected' || watch) return true;
    syncDisplay();
    resetBelt(win);
    beltOthers('satellite pane');
    return true;
  };
  /** S2: hand a slotted window back to the main pane for this session (its satellite was closed while it lives) — S1's guest. */
  const releaseSlot = (wid) => {
    const win = windows.get(wid);
    if (!win || !slotOrder.includes(wid)) return false;
    noSlot.add(wid); unslot(wid);
    if (state === 'connected' && !watch) {
      syncDisplay();
      const m = windows.get(mainWid), placed = P.placeGuest(win, fitTarget(), m && m.wid !== wid ? m : null);
      if (placed.moved) { Object.assign(win, { x: placed.x, y: placed.y }); beltOf(win).at = now(); send(P.configureWindow(wid, { x: win.x, y: win.y, w: win.w, h: win.h })); emit('window', 'geometry', win); }
      beltOthers('slot released');
    }
    announceConstraints(); announceFront();
    return true;
  };
  /** S2: keys typed into a pane reach a window OF that pane — the X focus moves to that pane's front when another pane's
   *  window holds it (owner 0 = the main pane). true = a focus packet was sent. */
  const focusPane = (owner = 0) => {
    if (viewOnly || watch || state !== 'connected') return false;
    const f = windows.get(focusedWid);
    if (f && ownerOf(f) === owner) return false;
    const to = P.frontOf(paneWindows(owner));
    if (!to) return false;
    focusWindow(to.wid);
    return true;
  };
  /** S2: a satellite's constraints — its window's hints, the minimum raised to the union of every window of its pane. */
  const constraintsOf = (owner) => {
    const win = windows.get(owner);
    if (!win) return null;
    const own = P.sizeHintsOf(win.meta), all = P.unionMin(paneWindows(owner));
    return all ? { ...own, 'minimum-size': [all.w, all.h] } : own ? { ...own } : null;
  };

  /** Tell the display what OUR window did to the app's main window (`{maximized}` / `{iconified}` — the state dict of
   *  configure-window, applied for the ui driver): the app's own header bar then shows the right button (restore vs
   *  maximize) and an app minimized by its own button draws again once our window is back. Never from Watch / view-only. */
  const setMainState = (st) => setWindowState(mainWid, st);
  /** …the same for any held window (S2: a satellite tells the display what its window did — un-minimized). */
  const setWindowState = (wid, st) => {
    const main = wid ? windows.get(wid) : null;
    if (!main || state !== 'connected' || viewOnly || watch || dormant || !st || typeof st !== 'object') return false;
    const clean = {};
    if ('maximized' in st) clean.maximized = !!st.maximized;
    if ('iconified' in st) clean.iconified = !!st.iconified;
    if (!Object.keys(clean).length) return false;
    if ('maximized' in clean) main.meta.maximized = clean.maximized;
    if ('iconified' in clean) main.meta.iconic = clean.iconified;
    const sent = send(P.configureWindow(main.wid, { x: main.x, y: main.y, w: main.w, h: main.h }, clean));
    if (clean.iconified === false) refreshSoon(main); // back from iconic: the region it was resized to while hidden is asked for
    return sent;
  };

  return {
    connect, close: () => finish('closed by the window'), send, resize, setPin, closeMain, closeFront, closeWindow, setSlotPane, releaseSlot, constraintsOf, ownerOf, paneWindows, focusPane, setMainState, setWindowState, keyDown, keyUp, typeText, pointerMove, pointerButton, wheel: wheelAt, pasteText, focusWindow, windowAt,
    get state() { return state; }, get closedReason() { return closedReason; }, get windows() { return windows; }, get mainWid() { return mainWid; }, get focusedWid() { return focusedWid; }, get frontWid() { const f = P.frontOf(windows.values()); return f ? f.wid : 0; },
    beltState: (wid) => { const w = windows.get(wid); return w && w.belt ? { at: w.belt.at, fights: w.belt.fights, gaveUp: w.belt.gaveUp, pending: !!w.belt.timer } : null; },
    slotOf: (wid) => { const r = slotRects.get(wid); return r ? { ...r } : null; }, get slots() { return new Map([...slotRects].map(([k, v]) => [k, { ...v }])); },
    get pane() { return pane; }, get pin() { return pinNow ? { ...pinNow } : null; }, get display() { return sentDisplay ? { ...sentDisplay } : null; }, get cssPane() { return cssPane; }, get ratio() { return ratioNow(); }, get dpi() { return dpi; },
    get mainConstraints() { const m = mainWid ? windows.get(mainWid) : null; const c = m ? P.sizeHintsOf(m.meta) : null; return c ? { ...c } : null; },
    get fixed() { const f = fixedWindow(), s = f ? P.fixedSizeOf(P.sizeHintsOf(f.meta)) : null; return s ? { wid: f.wid, w: s.w, h: s.h } : null; },
    get serverCaps() { return serverCaps; }, get packetTypes() { return packetTypes; },
    get viewOnly() { return viewOnly; }, set viewOnly(v) { viewOnly = !!v; },
    get watch() { return watch; }, set watch(v) { setWatch(v); }, get dormant() { return dormant; }, set dormant(v) { setDormant(v); },
    get lastPaste() { return lastPaste; }, get lastReceived() { return lastReceived; },
  };
}

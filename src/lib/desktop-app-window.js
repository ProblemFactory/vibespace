// THE `desktop-app` WINDOW (docs/design-desktop-apps.zh.md §2 row 7; P8-1,
// 2026-09-13): one window per app session, tab-group capable, restored from
// its openSpec `{ action:'openDesktopApp', id }` on reload / on every other
// client (N browsers watch ONE display — the picture server is `-shared`).
// The picture is the SHARED component (vnc-view.js) on the ONE bridge
// (/api/desktop/<id>/stream); this file only adds what an app session has
// that the singleton desktop does not: the backend rung + why it fell back
// (the user must know whether they are looking at one window or a whole
// display), CPU/RSS from the keeper's broadcast, the idle countdown, "Keep
// running" and Stop. It never fetches process facts itself — it READS the
// `desktop-apps-updated` broadcast (one GET at open for the first record).
//
// THE `window-live` FORM (P9b, docs/design-agent-browser-v2 §4.3 / §4.9 /
// §6.6): the SAME window, when an agent holds a lease on the app — the bar
// grows the browser live view's three modes (the badge with its exact three
// phrases, Take over, Hand back), the §6.6 class marker ("VibeSpace-started
// window": the other class, the user's own desktop, never appears here) and
// who holds it; the title says it is an agent window; noVNC is view-only in
// Watch and while somebody else drives (the bridge drops that input anyway —
// the client mirrors the server's verdict, it never enforces it). The pane
// names itself with ONE viewer id on its stream upgrade AND its takeover, so
// the lease can say which viewer holds it and the bridge can hand back when
// that socket closes. The lease arrives on the `window-leases-updated`
// broadcast (one GET at open); the mode arithmetic is PURE
// (src/lib/window-live-mode.js).
//
// THE XPRA RUNG (P8-2; chunk x1 2026-09-21 hosted the upstream client in an
// iframe as the D21 (c) (a) VALIDATION SLICE; chunk x2 2026-09-22 draws it
// OURSELVES — D21 (c) (b), §4.4: the window is ours): a record whose `stream`
// is 'xpra' renders through xpra-view.js (one canvas per xpra top-level
// window on the SAME picture shell as the RFB view — DPI-correct at net zoom
// 1, the app window filling the pane and following its size, dialogs inside
// it, the clipboard both ways with the plain-http chip) with the upstream
// html5 protocol WORKER as its transport (served from the installed package
// behind our auth at /api/desktop/<id>/xpra-ui/js/Protocol.js). The picture
// KIND is the record's `stream`, never a backend id, and it is known only
// once the first record answers — so the view is built lazily, the bar's
// controls are added to whichever view it is. The app window's OWN title
// (escaped: setTitle uses textContent) and icon (PNG bytes → a validated
// data: URL → <img>.src, never innerHTML interpolation) reach the title bar;
// the label is the fallback until the protocol names the window.
//
// ONE ACTIVE VIEWER (P8-2 x5, docs/design-desktop-apps.zh.md §7 P8-2 "x5
// 多客户端 = 单活跃 viewer"; the owner's ruling: "直接block掉非active客户端的app
// 界面，因为多客户端同时操作鼠标感觉也会有问题" + "仿照terminal…可以手动take
// over"): the pane reads its state from the `desktop-app-viewers` broadcast
// (+ the lease) through PURE src/desktop-viewers.js `paneState` — ACTIVE (as
// before: its size drives the app), BLOCKED (the picture hidden behind an
// overlay: the app's title as TEXT, "Active on another client", a house
// "Resume here" — the terminal's size-override overlay made the default) or
// WATCH (an agent drives: the picture scaled to fit, nothing sent). Resume
// here flips the pane LOCALLY at once (optimistic — never waiting for the
// broadcast echo) and POSTs /viewers/takeover; the answer or the broadcast
// corrects it. The pane names itself with a stable PUBLIC pane key (`?pane=`)
// beside the per-socket secret viewer id; the broadcast only ever says panes.
//
// HiDPI + THE APP'S MINIMUM (2.369.158, docs/design-desktop-apps.zh.md §7.6;
// the owner's 2026-09-23 report on a devicePixelRatio-2 screen): the xpra view
// renders the app at the record's SCALE (fixed at launch by `desktop.appScale`
// — the bar's `2×` chip says which; a change needs a relaunch) in device px,
// with the record's font `dpi` as the client's dpi. The app's minimum (its size
// constraints, via the view's `onMinSize`) becomes THIS window's minimum —
// pane + this window's own chrome (title bar, status strip), measured in
// viewport px and turned into layout px under the UI scale — through
// WindowManager.setMinSize: the resize drag stops there and a smaller size is
// raised. On a phone the view scales the picture to fit instead.
//
// THE APP'S EXIT CLOSES THIS WINDOW; THE OUTER ✕ IS THE APP'S OWN CLOSE (round 3
// A2, docs/design-desktop-apps-seamless §3.2 — the owner: "我关闭内部窗口之后外部
// 窗口还要额外关闭一次"). A record arriving in a terminal state is decided ONCE by
// PURE `exitCloseVerdict` (src/desktop-apps.js) over the keeper's `windowsAtExit`
// census + this pane's lease: an exit that took its windows with it, or any stop,
// closes the window on EVERY client (each from its own broadcast) after a toast
// "<app> exited" / "<app> stopped"; `failed` keeps its red sentence, an agent lease
// keeps the window with its marker, a window still left on the display keeps it
// too. A dead record met by the FIRST GET (a layout replay of an app that died
// while nobody watched, a record the keeper forgot) opens no window: the window
// is born `desktop-app-pending` (opacity 0, no pointer) and is closed before it
// ever paints. The title-bar ✕ (and every user close: WindowManager.requestClose)
// asks `outerCloseVerdict`: the active xpra pane sends `close-window` to the app's
// MAIN window (the app may show its own save dialog — nothing closes then), a
// second ✕ within OUTER_CLOSE_AGAIN_MS is the Stop; everywhere the app cannot be
// asked (a blocked / Watch pane, an agent lease, the RFB rung, no main window, an
// ended record) the ✕ closes the pane as it always did.
//
// THE SCALE, DERIVED AND PER WINDOW (round 3 A3, docs/design-desktop-apps-seamless §3.4 — the owner: "内部app的dpi
// 也应该是可调的，最好是能从vibespace自身的dpi自动推导"): the launch carries this client's UI scale beside its
// devicePixelRatio (the keeper derives `auto` from their product, PURE scalePick), and the record says where its
// scale came from (`scaleOrigin` auto | setting | chosen) — the chip prints both ("2.5× · auto") and its tooltip the
// numbers (dpr × UI scale, GDK_SCALE, dpi). The ⋯ button (and the title-bar / taskbar menu's "Scale" row) offers
// Scale ▸ Auto (n×) / 1× / 1.5× / 2× from PURE scaleMenuModel; a pick asks first ("the app restarts; unsaved work
// is lost"), then POST …/relaunch: the keeper starts the same app at that scale and stops this one with
// `replacedBy` — and THIS window (on every client, each from the broadcast; the asking one from the answer at once)
// RETARGETS to the successor: same window, same place, the picture reconnects. A layout replay of a replaced id
// follows the chain the same way.
import { t } from './i18n.js';
import { escHtml, fetchJson, showConfirmDialog, showContextMenu, showToast, uiScale } from './utils.js';
import { windowMinForPane } from './window-min-size.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { createVncView, streamUrl } from './vnc-view.js';
import { createXpraView } from './xpra-view.js';
import { windowLiveMode, windowModeBadge, leaseTransition, newViewerId } from './window-live-mode.js';
import { paneState } from '../desktop-viewers.js';
import { exitCloseVerdict, outerCloseVerdict, OUTER_CLOSE_AGAIN_MS, scaleKnobs, scaleMenuModel } from '../desktop-apps.js';
import { launchDpr, launchUiScale } from './desktop-app-launcher.js';
import { UI_ICONS } from './icons.js';
import { registerMenuItem } from './contributions.js';

const WATCH_HINT_EVERY_MS = 8000;

const ICON = svgIcon16('<rect x="1.5" y="2.5" width="13" height="10" rx="1"/><path d="M1.5 5.5h13M4 4h.01M6 4h.01"/>');

/** HiDPI (2.369.158): the scale chip — "2×" / "1.5×" for an xpra record, '' elsewhere (a whole-display rung is CSS px).
 *  Round 3 A3: with its ORIGIN — "2.5× · auto" (derived from the launching screen), "1.5× · chosen" (this window's
 *  Scale ▸), "2× · Settings" (an explicit desktop.appScale); a record from before A3 has no origin: the number alone. */
export function scaleChipText(rec) {
  if (!rec || rec.stream !== 'xpra') return '';
  const s = Number(rec.scale);
  if (!(Number.isFinite(s) && s > 0)) return '';
  const o = scaleOriginWord(rec.scaleOrigin);
  return o ? `${s}× · ${o}` : `${s}×`;
}
function scaleOriginWord(origin) {
  return origin === 'auto' ? t('auto') : origin === 'chosen' ? t('chosen') : origin === 'setting' ? t('Settings') : '';
}
/** The chip's tooltip: the numbers behind the scale (dpr × UI scale for auto, GDK_SCALE and the font dpi). */
export function scaleChipTitle(rec) {
  if (!rec || rec.stream !== 'xpra') return '';
  const k = scaleKnobs(rec.scale);
  const p = { scale: k.scale, gdk: k.gdkScale, dpi: Number.isInteger(rec.dpi) ? rec.dpi : k.dpi };
  const tail = ' ' + t('⋯ → Scale relaunches the app at another scale.');
  if (rec.scaleOrigin === 'auto' && rec.scaleFrom) return t('Scale {scale}× derived from the screen it was launched on: devicePixelRatio {dpr} × UI scale {ui}% — widgets {gdk}×, text at {dpi} dpi.', { ...p, dpr: rec.scaleFrom.dpr, ui: Math.round(rec.scaleFrom.uiScale * 100) }) + tail;
  if (rec.scaleOrigin === 'chosen') return t('Scale {scale}× chosen for this window — widgets {gdk}×, text at {dpi} dpi.', p) + tail;
  if (rec.scaleOrigin === 'setting') return t('Scale {scale}× from Settings → Desktop app scale — widgets {gdk}×, text at {dpi} dpi.', p) + tail;
  return t('The scale this app was started at (Settings → Desktop app scale). A change takes effect when the app is launched again.');
}
/** Round 3 A3: the words for a Scale ▸ row and for the reason CODE a window cannot relaunch (PURE scaleMenuModel). */
export function scaleRowLabel(row) {
  const mark = row.current ? '✓ ' : '\u2003';
  if (row.choice === 'auto') return mark + t('Auto ({scale}×)', { scale: row.scale });
  if (row.choice === 1.5) return mark + t('1.5× (text only in GTK apps)');
  return mark + `${row.choice}×`;
}
export function scaleWhyText(code) {
  if (code === 'lease') return t('An agent holds this app — relaunching it would end the agent\'s lease');
  if (code === 'seat') return t('Active on another client — Resume here first');
  if (code === 'not-xpra') return t('Only an xpra app has a scale — this display is drawn at the browser\'s pixels');
  if (code === 'relaunch-browser') return t('A browser app keeps its profile only for its own session — stop it and launch it again to change its scale');
  if (code === 'not-ready' || code === 'not-found') return t('Only a running app can be relaunched at another scale');
  return '';
}
/** The status-chip text for a record: "vnc-display (xpra not on PATH)". */
export function backendChipText(rec) {
  if (!rec || !rec.backend) return '';
  return rec.fallbackWhy ? `${rec.backend} (${rec.fallbackWhy})` : rec.backend;
}
/** P8-2 x4: the FIT limit of a whole-display rung whose framebuffer cannot
 *  follow the window ('fixed' — Xvfb+x11vnc: the keeper fits the app to the
 *  fixed framebuffer and the browser scales); '' on a rung whose display
 *  follows (Xvnc, xpra) or before the keeper measured the framebuffer. The
 *  binary named is the group's X server (`via` 'Xvfb+x11vnc' ⇒ Xvfb). */
export function fitChipText(rec) {
  if (!rec || rec.fitMode !== 'fixed') return '';
  const by = String(rec.via || '').split('+')[0] || rec.backend || '';
  const fb = rec.fb && rec.fb.w > 0 && rec.fb.h > 0 ? `${rec.fb.w}x${rec.fb.h}` : '';
  return fb ? t('fixed {geometry} ({by}) — install tigervnc for a window that follows', { geometry: fb, by }) : t('fixed display ({by}) — install tigervnc for a window that follows', { by });
}
/** "CPU 3% · 120 MB" or '' when the keeper has not sampled yet. */
export function liveChipText(rec) {
  const l = rec && rec.live;
  if (!l || !Number.isFinite(l.rssBytes)) return '';
  const cpu = Number.isFinite(l.cpuPct) ? `CPU ${Math.max(0, Math.round(l.cpuPct))}% · ` : '';
  return `${cpu}${Math.round(l.rssBytes / 1048576)} MB`;
}
/** Idle countdown text from the record's own clock, computed locally each
 *  second between broadcasts; '' when the app never times out. */
export function idleChipText(rec, now = Date.now()) {
  if (!rec || !(rec.idleTimeoutMs > 0) || rec.state !== 'ready') return '';
  const remaining = Math.max(0, (Number(rec.lastInputAt) || Number(rec.startedAt) || now) + rec.idleTimeoutMs - now);
  const min = Math.ceil(remaining / 60000);
  return min > 1 ? t('idle stop in {n} min', { n: min }) : t('idle stop in under a minute');
}
/** The terminal-state sentence. */
export function endedText(rec) {
  if (!rec) return '';
  if (rec.state === 'failed') return rec.lastError ? t('Failed: {why}', { why: rec.lastError }) : t('Failed');
  if (rec.state === 'exited') {
    if (rec.stoppedBy === 'user') return t('Stopped');
    if (rec.lastError) return t('Exited: {why}', { why: rec.lastError });
    return Number.isInteger(rec.exitCode) ? t('Exited (code {code})', { code: rec.exitCode }) : t('Exited');
  }
  return '';
}

/** round 3 A2: the toast a window closing on its app's end shows ("Calculator exited" / "… stopped"). */
export function exitToastText(rec, name) {
  const app = name || (rec && (rec.appTitle || rec.label)) || t('Desktop app');
  if (!rec || !rec.stoppedBy) return t('{app} exited', { app });
  if (rec.stoppedBy === 'user') return t('{app} stopped', { app });
  if (rec.stoppedBy === 'idle') return t('{app} stopped after {n} min without input', { app, n: Math.max(1, Math.round((Number(rec.idleTimeoutMs) || 0) / 60000)) });
  return rec.lastError ? t('{app} stopped: {why}', { app, why: rec.lastError }) : t('{app} stopped', { app });
}

export function openDesktopApp(app, id, { syncId } = {}) {
  if (typeof id !== 'string' || !id) return null;
  for (const [wid, win] of app.wm.windows) {
    if (win._desktopAppId === id) { app.wm.focusWindow(wid); return win; }
  }
  app._hideWelcome();
  const winInfo = app.wm.createWindow({
    title: t('Desktop app'), type: 'desktop-app', syncId, width: 900, height: 620,
    openSpec: { action: 'openDesktopApp', id },
  });
  winInfo._desktopAppId = id;
  // round 3 A2: unseen until the first record answers — a dead record (a layout replay) closes it before it ever paints
  winInfo.element.classList.add('desktop-app-pending');
  setTimeout(() => { if (!closed) winInfo.element.classList.remove('desktop-app-pending'); }, 3000); // a GET that never answers must not leave an invisible window
  // The viewer id is a per-SOCKET secret (2026-09-21): re-minted at every
  // (re)connect because the bridge binds it to one socket and refuses a second
  // claimant; the takeover answers with an OPAQUE tag, and that tag — never the
  // id — is what the broadcast lease carries and what `mine` compares.
  let viewerId = newViewerId();
  let myTag = null;
  winInfo._windowViewerId = viewerId;
  // x5: the pane's PUBLIC key — stable across its sockets, the only name the viewers broadcast uses for it
  const paneKey = 'pn-' + newViewerId().slice(3, 23);
  winInfo._desktopPaneKey = paneKey;
  // 2.369.156 (the grace): the pane THIS TAB's previous window of this app had (a page reload, a closed-and-reopened
  // window) rides the stream url as `prev` — inside the keeper's grace the successor keeps the seat instead of the app
  // going to another device. Per tab (sessionStorage); only a hint — it never takes a seat that is not being held.
  let prevPane = null;
  const claimPane = () => {
    const prevKey = `vibespace.desktopPane.${id}`;
    prevPane = null;
    try { prevPane = sessionStorage.getItem(prevKey); sessionStorage.setItem(prevKey, paneKey); } catch { /* storage off: no successor hint */ }
    if (prevPane === paneKey || !/^[A-Za-z0-9._-]{1,64}$/.test(prevPane || '')) prevPane = null;
  };
  claimPane();
  let seats = { known: false, active: null, viewers: [] }; // the last `desktop-app-viewers` answer for this app
  let optimistic = null;  // { state, until } — Resume here flips the pane before the answer / the broadcast

  let rec = null;
  let gone = false;
  let closed = false;       // round 3 A2: this window closed itself (its app ended) — late answers are ignored
  let exitDecided = false;  // the terminal-state verdict is taken ONCE (a lease dropping later never re-decides it)
  let closeAskedAt = 0;     // the outer ✕ asked the app (close-window) at — a second ✕ within OUTER_CLOSE_AGAIN_MS stops it
  let lease = null;        // P9b: the agent lease on this app (null = the user's own app, nothing gated)
  let lastHintAt = 0;
  const readyGate = async () => {
    if (!rec) { const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}`); if (r && !r.error) rec = r; }
    if (!rec) return { ok: false, error: t('This desktop app no longer exists') };
    if (rec.state === 'launching') return { ok: false, error: t('Starting application…') };
    if (rec.state !== 'ready') return { ok: false, error: endedText(rec) };
    return { ok: true };
  };
  /** x5: 'active' | 'blocked' | 'watch' — this pane's state (PURE paneState over the lease + the viewers broadcast). */
  const seatState = () => (optimistic && Date.now() < optimistic.until ? optimistic.state : paneState({ lease, myTag, active: seats.active, myPane: paneKey, known: seats.known }));
  const applyViewOnly = () => renderSeat();
  // THE PICTURE KIND IS THE RECORD'S `stream` (never a backend id) — known once the
  // first record answers, so the view is built then; both kinds share the shell.
  let view = null;
  let appTitle = '';      // the app window's own title, from the xpra protocol ('' = none yet)
  const streamKindOf = (r) => (r && r.stream === 'xpra' ? 'xpra' : 'rfb');
  const viewOpts = () => ({
    url: () => { viewerId = newViewerId(); winInfo._windowViewerId = viewerId; return streamUrl(`/api/desktop/${encodeURIComponent(id)}/stream`) + `?viewer=${encodeURIComponent(viewerId)}&pane=${encodeURIComponent(paneKey)}` + (prevPane ? `&prev=${encodeURIComponent(prevPane)}` : ''); }, // the ONE bridge path (test-vnc-view's census) + a fresh per-socket viewer id + the stable pane key (x5) + its predecessor (the grace)
    labels: { starting: t('Starting application…'), unavailable: t('Desktop app unavailable') },
    before: readyGate, autoReconnect: true,
    onStatus: (s) => { if (s === 'connected') applyViewOnly(); },
  });
  const setAppIcon = (dataUrl) => {
    if (!dataUrl || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return;
    const img = document.createElement('img');
    img.className = 'window-app-icon';
    img.alt = '';
    img.src = dataUrl; // the .src PROPERTY — the image-overlay law
    winInfo.iconSpan.replaceChildren(img);
    winInfo._typeIcon = `<img class="window-app-icon" alt="" src="${dataUrl}">`; // the tab bar re-renders from _typeIcon; the url's alphabet was validated above
    if (winInfo._tabChain) app.wm.setTitleMeta(winInfo.id, {});
  };
  const ensureView = (kind) => {
    if (view) return view;
    view = kind === 'xpra'
      ? createXpraView(winInfo.content, { ...viewOpts(), workerUrl: `/api/desktop/${encodeURIComponent(id)}/xpra-ui/js/Protocol.js`, onTitle: (text) => { appTitle = String(text || ''); render(); }, onIcon: setAppIcon, onMinSize: applyMinSize, dpi: () => (rec && Number.isInteger(rec.dpi) ? rec.dpi : 96) })
      : createVncView(winInfo.content, viewOpts());
    view.mount.classList.add('desktop-app-mount');
    winInfo._desktopAppView = view; // the raw handle the heavy suite reads (never the DOM)
    for (const el of [view.bar, view.pane]) if (el && minRo) minRo.observe(el); // the status strip's height is chrome; the pane shown again re-measures (the RFB view has no pane)
    for (const el of controls) view.addControl(el);
    view.mount.appendChild(blockedEl); // x5: the overlay of a blocked pane (hidden while active / watching)
    // in Watch a click on the picture is a hint, never input (the view is view-only; the bridge would drop it anyway)
    view.mount.addEventListener('pointerdown', () => {
      const m = windowLiveMode({ lease, viewerTag: myTag });
      if (!m.leased || m.mine || seatState() !== 'watch') return;
      const now = Date.now();
      if (now - lastHintAt > WATCH_HINT_EVERY_MS) { lastHintAt = now; showToast(m.mode === 'takeover' ? t('Another viewer holds this window') : t('Watch mode — the agent is driving; press Take over to send input'), { duration: 3500 }); }
    }, { capture: true, signal: winInfo._listenerCtl?.signal });
    lastSeat = null;
    applyViewOnly();
    return view;
  };

  // ── the app's minimum → this window's minimum (pane + chrome, viewport px → layout px) ──
  // Re-measured whenever it can change (r2, the verifier: a one-time snapshot went stale): the chrome's own size
  // (the title bar / the status strip — the UI font scale, a wrapping strip), the window becoming visible again
  // (a background tab, another desktop, a minimize: display:none measures nothing — a ResizeObserver fires when
  // it is laid out again, where the old bounded retry gave up after 20 s), and the UI scale (layout = viewport ÷ it).
  let minPane = null, minRaf = 0;
  function applyMinSize(m) { minPane = m || null; applyMinNow(); }
  function applyMinNow() {
    if (!minPane) { app.wm.setMinSize(winInfo.id, null); winInfo._desktopMinPane = null; return; }
    const paneEl = view && view.pane;
    const er = winInfo.element.getBoundingClientRect(), pr = paneEl ? paneEl.getBoundingClientRect() : null;
    if (!pr || !(er.width > 0) || !(pr.width > 0)) return; // hidden: the observer below re-runs this once it is laid out
    const min = windowMinForPane(minPane, { w: er.width - pr.width, h: er.height - pr.height }, uiScale());
    winInfo._desktopMinPane = { ...minPane }; // the raw handle the heavy suite reads
    app.wm.setMinSize(winInfo.id, min);
  }
  const scheduleMin = () => { if (!minPane || minRaf) return; minRaf = requestAnimationFrame(() => { minRaf = 0; applyMinNow(); }); };
  const minRo = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMin) : null;
  minRo?.observe(winInfo.element); minRo?.observe(winInfo.titleBar);
  window.addEventListener('vs:ui-scale', scheduleMin, { signal: winInfo._listenerCtl?.signal });

  // ── x5: the BLOCKED overlay (the terminal's "Resume here", house classes) ──
  const blockedEl = document.createElement('div'); blockedEl.className = 'term-blocked-overlay desktop-app-blocked'; blockedEl.style.display = 'none';
  const blockedTitle = document.createElement('div'); blockedTitle.className = 'desktop-app-blocked-title';
  const blockedMsg = document.createElement('div'); blockedMsg.className = 'term-blocked-msg'; blockedMsg.textContent = t('Active on another client');
  const resumeBtn = document.createElement('button'); resumeBtn.type = 'button'; resumeBtn.className = 'term-blocked-btn desktop-app-resume'; resumeBtn.textContent = t('Resume here');
  resumeBtn.title = t('Make this window the active one — the other client is blocked until it resumes');
  blockedEl.append(blockedTitle, blockedMsg, resumeBtn);
  let lastSeat = null;
  // THE APP'S NAME (LOW-2, 2.369.156): an active / watching pane names the app by its LIVE protocol title (xpra) and
  // the record's otherwise; a BLOCKED pane has no protocol session (or only the last title it saw before the cut),
  // so the RECORD's title — the keeper re-reads it from X while a blocked pane exists — comes first. The launch label
  // only when neither exists. Peer-controlled text: it reaches the page through textContent / setTitle only.
  const titleText = () => (seatState() === 'blocked' ? (rec && rec.appTitle) || appTitle : appTitle || (rec && rec.appTitle)) || (rec && rec.label) || t('Desktop app');
  /** Applies this pane's state to the view: the overlay, the mode (input / geometry / fit), the reconnect of a cut pane. */
  function renderSeat() {
    if (!view) return;
    const st = seatState();
    if (rec) render(); else blockedTitle.textContent = titleText(); // the title bar + the overlay follow the seat (the name's source depends on it) — peer-controlled text, never markup
    if (st === lastSeat) return;
    lastSeat = st;
    const blocked = st === 'blocked';
    blockedEl.style.display = blocked ? '' : 'none';
    view.mount.classList.toggle('desktop-app-is-blocked', blocked);
    if (typeof view.setMode === 'function') view.setMode(st);
    else if (typeof view.setViewOnly === 'function') view.setViewOnly(st !== 'active');
    // a pane the bridge cut (another client resumed) reconnects at once as a blocked viewer — it must stay seated to be re-elected
    if (rec && rec.state === 'ready' && !gone && view.wanted && view.state !== 'connected' && view.state !== 'connecting' && view.state !== 'starting') view.connect();
  }
  const applyViewers = (v) => {
    if (!v || v.id !== id) return;
    seats = { known: true, active: v.active == null ? null : String(v.active), viewers: Array.isArray(v.viewers) ? v.viewers : [] };
    winInfo._desktopSeats = seats; // the raw handle the heavy suite reads (never the DOM)
    renderSeat();
  };
  resumeBtn.onclick = async () => {
    optimistic = { state: 'active', until: Date.now() + 8000 };
    renderSeat(); // the overlay goes NOW — the takeover never waits for the broadcast echo
    if (view && view.state !== 'connected' && view.state !== 'connecting' && view.state !== 'starting') { view.connect(); await new Promise((r) => setTimeout(r, 600)); }
    const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/viewers/takeover`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewerId }) });
    optimistic = null;
    if (!r || r.error) { showToast(r?.error || t('Could not resume here'), { type: 'error' }); renderSeat(); return; }
    if (r.lease && r.lease.takenBy && r.lease.takenBy.tag) myTag = String(r.lease.takenBy.tag);
    if (r.lease !== undefined) lease = r.lease || null;
    applyViewers(r.viewers); renderLease();
    view?.focus();
  };

  // ── the bar: backend rung, CPU/RSS, idle countdown, Keep running, Stop ──
  const backendChip = document.createElement('span'); backendChip.className = 'desktop-app-chip desktop-app-chip-backend';
  const scaleChip = document.createElement('span'); scaleChip.className = 'desktop-app-chip desktop-app-chip-scale'; // HiDPI: the app's scale, fixed at launch
  const fitChip = document.createElement('span'); fitChip.className = 'desktop-app-chip desktop-app-chip-fit'; // P8-2 x4: names a display that cannot follow the window
  fitChip.title = t('This rung’s display cannot resize: the app is fitted to the fixed framebuffer and scaled in the browser. With TigerVNC (Xvnc) the display follows the window.');
  const liveChip = document.createElement('span'); liveChip.className = 'desktop-app-chip desktop-app-chip-live';
  const idleChip = document.createElement('span'); idleChip.className = 'desktop-app-chip desktop-app-chip-idle';
  const keepBtn = document.createElement('button'); keepBtn.className = 'file-tool-btn'; keepBtn.style.cssText = 'width:auto;padding:0 8px;font-size:10px';
  keepBtn.textContent = t('Keep running'); keepBtn.title = t('Never stop this app for being idle');
  const stopBtn = document.createElement('button'); stopBtn.className = 'file-tool-btn desktop-app-stop'; stopBtn.style.cssText = 'width:auto;padding:0 8px;font-size:10px';
  stopBtn.textContent = t('Stop'); stopBtn.title = t('Stop this application and its display');
  // ── P9b: the window-live controls (shown only while an agent holds the lease) ──
  const originChip = document.createElement('span'); originChip.className = 'desktop-app-chip desktop-app-chip-origin';
  originChip.textContent = t('VibeSpace-started window'); originChip.title = t('This window runs on a display VibeSpace started — an agent may act in it. Your own desktop is never listed or addressable.');
  const agentChip = document.createElement('span'); agentChip.className = 'desktop-app-chip desktop-app-chip-agent';
  const modeBadge = document.createElement('span'); modeBadge.className = 'browser-live-mode';
  const takeBtn = document.createElement('button'); takeBtn.className = 'file-tool-btn browser-live-mode-btn'; takeBtn.textContent = t('Take over');
  const handBtn = document.createElement('button'); handBtn.className = 'file-tool-btn browser-live-handback'; handBtn.textContent = t('Hand back'); handBtn.title = t('Hand back to the agent');
  // round 3 A3: the ⋯ button — the window's own menu (Scale ▸ today); the same rows ride the title-bar / taskbar menu
  const moreBtn = document.createElement('button'); moreBtn.type = 'button'; moreBtn.className = 'file-tool-btn desktop-app-more'; moreBtn.style.cssText = 'width:auto;padding:0 6px';
  moreBtn.innerHTML = UI_ICONS.more; moreBtn.title = t('More'); moreBtn.setAttribute('aria-label', t('More'));
  const controls = [originChip, agentChip, modeBadge, takeBtn, handBtn, backendChip, scaleChip, fitChip, liveChip, idleChip, keepBtn, stopBtn, moreBtn];
  // the badge's words come from the PURE table; t() needs the literal keys below to be extractable
  void [t('Agent is driving'), t('You are driving — agent asked to pause'), t('Another viewer is driving — agent asked to pause')];
  const renderLease = () => {
    const m = windowLiveMode({ lease, viewerTag: myTag });
    const show = m.leased;
    for (const el of [originChip, agentChip, modeBadge, takeBtn]) el.style.display = show ? '' : 'none';
    handBtn.style.display = show && m.mode === 'takeover' ? '' : 'none';
    if (!show) { winInfo.content.classList.remove('window-live-driving'); applyViewOnly(); return; }
    const who = lease.sessionName || lease.sessionId || '';
    agentChip.textContent = m.orphaned ? t('Agent gone: {name}', { name: who }) : t('Agent: {name}', { name: who });
    agentChip.title = m.orphaned ? t('The session that held this window is no longer live — the lease is free for the next agent') : t('The agent session holding this window (one holder per window)');
    modeBadge.textContent = t(windowModeBadge(m));
    modeBadge.classList.toggle('takeover', m.mode === 'takeover' && m.mine);
    modeBadge.classList.toggle('other', m.mode === 'takeover' && !m.mine);
    takeBtn.classList.toggle('active', m.mine);
    takeBtn.disabled = m.mode === 'takeover' && !m.mine;
    takeBtn.title = m.mode === 'takeover' && !m.mine ? t('Another viewer holds this window') : t('Take over this window — the agent’s actions are refused and nothing is injected until you hand back');
    winInfo.content.classList.toggle('window-live-driving', m.mine);
    applyViewOnly();
  };
  const applyLease = (next) => {
    const prev = lease; lease = next || null;
    const tr = leaseTransition(prev, lease, myTag);
    if (tr === 'took-over') showToast(t('You are driving this window directly — the agent is not injecting until you hand back'), { duration: 4000 });
    else if (tr === 'handed-back') showToast(t('Control handed back to the agent'), { duration: 3500 });
    else if (tr === 'lapsed') showToast(t('Your takeover lapsed (no input) — the agent is driving again'), { duration: 5000 });
    else if (tr === 'other-took') showToast(t('Another viewer took over this window'), { duration: 3500 });
    renderLease(); render();
  };
  takeBtn.onclick = async () => {
    const m = windowLiveMode({ lease, viewerTag: myTag });
    if (m.mine) return;
    const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/takeover`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewerId }) });
    if (!r || r.error) { showToast(r?.error || t('Could not take over'), { type: 'error' }); return; }
    myTag = r.lease && r.lease.takenBy && r.lease.takenBy.tag ? String(r.lease.takenBy.tag) : null; // my takeover's public name — the only way this pane learns it
    if (r.viewers) applyViewers(r.viewers); // x5: the human who took over is the ACTIVE viewer
    applyLease(r.lease); view?.focus();
  };
  handBtn.onclick = async () => {
    const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/handback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewerId }) });
    if (!r || r.error) { showToast(r?.error || t('Could not hand back'), { type: 'error' }); return; }
    applyLease(r.lease); myTag = null;
  };
  const render = () => {
    if (!rec) return;
    const label = titleText(); // the app window's own title — xpra's protocol names it, on a keeper-fitted rung (and for a blocked xpra pane) the record does — else the label
    app.wm.setTitle(winInfo.id, lease ? t('{label} — agent window', { label }) : label);
    blockedTitle.textContent = label; // x5: the overlay names the app (textContent — the title is peer-controlled)
    backendChip.textContent = backendChipText(rec);
    backendChip.title = rec.fallbackWhy ? t('Backend: {backend} — fell back because {why}', { backend: rec.backend, why: rec.fallbackWhy }) : t('Backend: {backend}', { backend: rec.backend || '' });
    if (rec.stream === 'xpra') backendChip.title += ' — ' + t('xpra streams each app window as pixels; text stays crisp at your screen’s scale');
    const sc = scaleChipText(rec); scaleChip.textContent = sc; scaleChip.style.display = sc ? '' : 'none'; scaleChip.title = scaleChipTitle(rec);
    winInfo._desktopAppStream = rec.stream || null;
    moreBtn.style.display = rec.stream === 'xpra' ? '' : 'none'; // the menu holds Scale ▸ only — nothing to offer on a whole-display rung
    const ft = fitChipText(rec); fitChip.textContent = ft; fitChip.style.display = ft ? '' : 'none';
    const lt = liveChipText(rec); liveChip.textContent = lt; liveChip.style.display = lt ? '' : 'none';
    const it = idleChipText(rec); idleChip.textContent = it; idleChip.style.display = it ? '' : 'none';
    keepBtn.style.display = rec.state === 'ready' && rec.idleTimeoutMs > 0 ? '' : 'none';
    stopBtn.style.display = rec.state === 'ready' || rec.state === 'launching' ? '' : 'none';
    if (rec.state === 'exited' || rec.state === 'failed') {
      if (!gone) { gone = true; view?.disconnect(); }
      view?.setStatus(endedText(rec), { error: rec.state === 'failed', reconnect: false });
    }
  };
  /** round 3 A2: a record in a terminal state, decided ONCE (exitCloseVerdict): close this window with a toast, or keep it
   *  (failed / a lease / a window still on the display) with the ended sentence. `first` = the first GET answered (the
   *  window has not painted: a replayed dead record opens nothing). Returns true when the window closed. */
  function decideExit(r) {
    if (closed) return true;
    if (exitDecided || !r || (r.state !== 'exited' && r.state !== 'failed')) return false;
    exitDecided = true;
    const v = exitCloseVerdict(r, { leased: !!lease });
    winInfo._desktopExitVerdict = v; // the raw handle the heavy suite reads
    if (!v.close) return false;
    const name = (appTitle || r.appTitle || r.label || '');
    closed = true;
    showToast(exitToastText(r, name), { duration: 3500 });
    app.wm.closeWindow(winInfo.id); // programmatic: never vetoed; the layout autosave carries the removal to the other clients
    return true;
  }
  const reveal = () => winInfo.element.classList.remove('desktop-app-pending');
  const applyRecord = (r) => {
    if (closed || followReplacement(r) || decideExit(r)) return;
    reveal();
    rec = r; ensureView(streamKindOf(r)); render();
    // the keeper's answer is the fact: ready (just came up, or ADOPTED after a
    // restart) and the picture is not up ⇒ connect; the view's own ladder
    // covers a dropped transport in between
    if (r.state !== 'ready' || gone) return;
    if (view.state !== 'connected' && view.state !== 'connecting' && view.state !== 'starting') view.connect();
  };
  const refetch = async () => { const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}`); if (closed) return; if (r && !r.error) applyRecord(r); else if (r && r.code === 'not-found') forgotten(); };
  /** The keeper forgot this record (pruned history): nothing to show — the window goes with a toast (never a dead shell). */
  const forgotten = () => { if (closed) return; closed = true; showToast(t('This desktop app no longer exists'), { duration: 3500 }); app.wm.closeWindow(winInfo.id); };

  keepBtn.onclick = async () => {
    const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/keep-alive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!r || r.error) { showToast(r?.error || t('Could not change the idle timeout'), { type: 'error' }); return; }
    applyRecord(r); showToast(t('This app will keep running until you stop it'));
  };
  const stopApp = async () => {
    stopBtn.disabled = true;
    const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    stopBtn.disabled = false;
    if (!r || r.error) { showToast(r?.error || t('Could not stop the app'), { type: 'error' }); return; }
    applyRecord(r); // exited + stoppedBy ⇒ the window closes (exitCloseVerdict) — here AND on every other client from the broadcast
  };
  stopBtn.onclick = stopApp;

  // ── round 3 A2: the OUTER ✕ asks the app (close-window to its main window); a second ✕ within 5 s is the Stop ──
  winInfo.onCloseRequest = () => {
    const now = Date.now();
    const v = outerCloseVerdict({
      state: rec ? rec.state : null, stream: rec ? rec.stream : null, seat: seatState(), leased: !!lease,
      connected: !!view && view.state === 'connected', mainWid: view && view.client ? view.client.mainWid : 0, askedAt: closeAskedAt, now,
    });
    winInfo._desktopCloseVerdict = v; // the raw handle the heavy suite reads
    if (v.act === 'close') return true;
    if (v.act === 'stop') { closeAskedAt = 0; stopApp(); return false; }
    if (!view.closeApp()) return true; // the socket refused the packet: today's pane-only close, never a dead button
    closeAskedAt = now;
    showToast(t('Asked {app} to close — press ✕ again within {n} s to stop it', { app: titleText(), n: Math.round(OUTER_CLOSE_AGAIN_MS / 1000) }), { duration: OUTER_CLOSE_AGAIN_MS });
    return false;
  };

  // ── round 3 A3: the per-window Scale ▸ (a relaunch) and following a replacement ──
  /** The Scale ▸ rows for THIS window (PURE scaleMenuModel; auto = what this client's dpr × UI scale derives now). */
  const scaleItems = () => {
    const m = scaleMenuModel(rec, { dpr: launchDpr(), uiScale: launchUiScale(), leased: !!lease, seat: seatState() });
    const why = scaleWhyText(m.why);
    const rows = m.rows.map((r) => ({ label: scaleRowLabel(r), disabled: r.disabled, action: () => { relaunchAt(r.choice, r.scale); } }));
    return why ? [{ label: why, disabled: true }, ...rows] : rows;
  };
  winInfo._desktopAppScaleItems = scaleItems;
  winInfo._desktopScaleMenu = () => scaleMenuModel(rec, { dpr: launchDpr(), uiScale: launchUiScale(), leased: !!lease, seat: seatState() }); // the raw handle the heavy suite reads
  moreBtn.onclick = (e) => {
    e.stopPropagation();
    const r = moreBtn.getBoundingClientRect();
    showContextMenu(r.left, r.bottom + 2, [{ label: t('Scale'), children: scaleItems() }]);
  };
  let relaunching = false;
  async function relaunchAt(choice, scale) {
    if (relaunching || !rec) return;
    const name = titleText();
    const okd = await showConfirmDialog({ title: t('Relaunch {app} at {scale}×?', { app: name, scale }), message: t('The app restarts at the new scale; unsaved work in it is lost.'), confirmText: t('Relaunch'), danger: true });
    if (!okd || closed) return;
    relaunching = true;
    const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/relaunch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scale: choice, dpr: launchDpr(), uiScale: launchUiScale() }) });
    relaunching = false;
    if (!r || r.error || !r.app || !r.app.id) { showToast(r?.error || t('Could not relaunch the app'), { type: 'error' }); return; }
    showToast(t('{app} relaunched at {scale}×', { app: name, scale: r.app.scale }), { duration: 3500 });
    retarget(r.app.id); // at once — never waiting for the broadcast echo (the other clients follow it from theirs)
  }
  /** A record that names its successor (`replacedBy`): this window follows it — same window, the picture reconnects. */
  function followReplacement(r) {
    if (!r || !r.replacedBy || r.id !== id) return false;
    retarget(r.replacedBy);
    return true;
  }
  function retarget(nextId) {
    if (closed || typeof nextId !== 'string' || !nextId || nextId === id) return;
    // another window already shows the successor (a second client's replay, a manual open): this one goes quietly
    for (const [, w] of app.wm.windows) if (w !== winInfo && w._desktopAppId === nextId) { closed = true; app.wm.closeWindow(winInfo.id); return; }
    if (view) { try { view.dispose(); } catch {} try { view.container.remove(); } catch {} }
    view = null; rec = null; gone = false; exitDecided = false; closeAskedAt = 0; lastSeat = null;
    seats = { known: false, active: null, viewers: [] }; optimistic = null; lease = null; myTag = null;
    applyMinSize(null);
    id = nextId;
    winInfo._desktopAppId = id;
    winInfo._openSpec = { action: 'openDesktopApp', id };
    try { app.wm._notify?.(); } catch { /* optional */ }
    claimPane();
    refetchLease(); refetchViewers();
    fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}`).then((r) => {
      if (closed || winInfo._desktopAppId !== nextId) return;
      if (r && r.code === 'not-found') { forgotten(); return; }
      if (!r || r.error) { ensureView('rfb').setStatus(r?.error ? `${t('Desktop app unavailable')}: ${r.error}` : t('Desktop app unavailable'), { error: true, reconnect: false }); return; }
      applyRecord(r);
      if (rec && rec.state === 'launching') view.setStatus(t('Starting application…'));
    });
  }

  const off = app.ws.onGlobal((m) => {
    if (m.type === 'desktop-app-viewers') { if (m.id === id) applyViewers(m); return; } // x5
    if (m.type === 'window-leases-updated') { const l = (m.leases || []).find((x) => x && x.handle === id) || null; if ((l && !lease) || (!l && lease) || (l && lease && (l.input !== lease.input || l.sessionId !== lease.sessionId || (l.takenBy && l.takenBy.viewerId) !== (lease.takenBy && lease.takenBy.viewerId)))) applyLease(l); else lease = l; return; }
    if (m.type !== 'desktop-apps-updated') return;
    const r = (m.apps || []).find((a) => a.id === id);
    if (r) applyRecord(r);
  });
  const refetchLease = async () => { const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/lease`); if (r && !r.error) applyLease(r.lease); };
  const refetchViewers = async () => { const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/viewers`); if (r && !r.error) applyViewers(r); };
  // a server restart ADOPTS the session before any client reconnects, so the
  // adoption broadcast reaches nobody — re-read the record on every reconnect
  const onWs = (connected) => { if (connected) { refetch(); refetchLease(); refetchViewers(); } };
  app.ws.onStateChange(onWs);
  const tick = setInterval(() => { if (rec && rec.state === 'ready') { const it = idleChipText(rec); idleChip.textContent = it; idleChip.style.display = it ? '' : 'none'; } }, 1000);
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { off?.(); } catch {} try { app.ws.offStateChange?.(onWs); } catch {} clearInterval(tick); });
  winInfo.onMoved = () => view?.resnap?.(); // a moved window puts the picture back on the device-pixel grid (r2)
  winInfo.onClose = () => { minRo?.disconnect(); if (minRaf) cancelAnimationFrame(minRaf); view?.dispose(); };

  renderLease();
  refetchLease();
  refetchViewers();
  // first record, then the connect (the gate re-reads if the GET raced the launch)
  fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}`).then((r) => {
    if (closed) return;
    if (r && r.code === 'not-found') { forgotten(); return; } // a replay of a record the keeper forgot: no window
    if (r && !r.error) { if (followReplacement(r) || decideExit(r)) return; reveal(); rec = r; ensureView(streamKindOf(r)); render(); } // a dead record replayed: closed before it ever painted; a replaced one follows its successor
    else { reveal(); ensureView('rfb').setStatus(r?.error ? `${t('Desktop app unavailable')}: ${r.error}` : t('Desktop app unavailable'), { error: true, reconnect: false }); return; }
    if (rec.state === 'launching') {
      view.setStatus(t('Starting application…'));
      // the broadcast flips it to ready; connect then (applyRecord)
    } else if (rec.state === 'ready') view.connect();
  });
  return winInfo;
}

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) ── one window per app session
registerWindowType({
  type: 'desktop-app', label: 'Desktop app', icon: ICON,
  action: 'openDesktopApp', replay: (app, spec, { syncId } = {}) => app.openDesktopApp(spec?.id, { syncId }),
});

// round 3 A3: the same Scale ▸ rows on the title-bar / taskbar / window-list menu of a desktop-app window
registerMenuItem({
  menu: 'window', group: '1_window', order: 35, id: 'window/desktop-app-scale', kind: 'scale',
  when: (c) => !!c.win && c.win.type === 'desktop-app' && typeof c.win._desktopAppScaleItems === 'function' && c.win._desktopAppStream === 'xpra',
  label: () => t('Scale'), children: (c) => c.win._desktopAppScaleItems(),
});

/** A one-line HTML label for lists (escaped — labels come from the user's own
 *  command line and sync to every client). */
export function appRowHtml(rec) {
  return `<span class="desktop-app-row-label">${escHtml(rec.label || rec.exec || rec.id)}</span> <span class="desktop-app-row-state">${escHtml(rec.state === 'ready' ? t('running') : rec.state === 'launching' ? t('starting') : endedText(rec))}</span>`;
}

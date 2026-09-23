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
import { t } from './i18n.js';
import { escHtml, fetchJson, showToast } from './utils.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { createVncView, streamUrl } from './vnc-view.js';
import { createXpraView } from './xpra-view.js';
import { windowLiveMode, windowModeBadge, leaseTransition, newViewerId } from './window-live-mode.js';
import { paneState } from '../desktop-viewers.js';

const WATCH_HINT_EVERY_MS = 8000;

const ICON = svgIcon16('<rect x="1.5" y="2.5" width="13" height="10" rx="1"/><path d="M1.5 5.5h13M4 4h.01M6 4h.01"/>');

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
  const prevKey = `vibespace.desktopPane.${id}`;
  let prevPane = null;
  try { prevPane = sessionStorage.getItem(prevKey); sessionStorage.setItem(prevKey, paneKey); } catch { /* storage off: no successor hint */ }
  if (prevPane === paneKey || !/^[A-Za-z0-9._-]{1,64}$/.test(prevPane || '')) prevPane = null;
  let seats = { known: false, active: null, viewers: [] }; // the last `desktop-app-viewers` answer for this app
  let optimistic = null;  // { state, until } — Resume here flips the pane before the answer / the broadcast

  let rec = null;
  let gone = false;
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
      ? createXpraView(winInfo.content, { ...viewOpts(), workerUrl: `/api/desktop/${encodeURIComponent(id)}/xpra-ui/js/Protocol.js`, onTitle: (text) => { appTitle = String(text || ''); render(); }, onIcon: setAppIcon })
      : createVncView(winInfo.content, viewOpts());
    view.mount.classList.add('desktop-app-mount');
    winInfo._desktopAppView = view; // the raw handle the heavy suite reads (never the DOM)
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
  const controls = [originChip, agentChip, modeBadge, takeBtn, handBtn, backendChip, fitChip, liveChip, idleChip, keepBtn, stopBtn];
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
  const applyRecord = (r) => {
    rec = r; ensureView(streamKindOf(r)); render();
    // the keeper's answer is the fact: ready (just came up, or ADOPTED after a
    // restart) and the picture is not up ⇒ connect; the view's own ladder
    // covers a dropped transport in between
    if (r.state !== 'ready' || gone) return;
    if (view.state !== 'connected' && view.state !== 'connecting' && view.state !== 'starting') view.connect();
  };
  const refetch = async () => { const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}`); if (r && !r.error) applyRecord(r); };

  keepBtn.onclick = async () => {
    const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/keep-alive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!r || r.error) { showToast(r?.error || t('Could not change the idle timeout'), { type: 'error' }); return; }
    applyRecord(r); showToast(t('This app will keep running until you stop it'));
  };
  stopBtn.onclick = async () => {
    stopBtn.disabled = true;
    const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    stopBtn.disabled = false;
    if (!r || r.error) { showToast(r?.error || t('Could not stop the app'), { type: 'error' }); return; }
    applyRecord(r);
  };

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
  winInfo.onClose = () => view?.dispose();

  renderLease();
  refetchLease();
  refetchViewers();
  // first record, then the connect (the gate re-reads if the GET raced the launch)
  fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}`).then((r) => {
    if (r && !r.error) { rec = r; ensureView(streamKindOf(r)); render(); }
    else { ensureView('rfb').setStatus(t('This desktop app no longer exists'), { error: true, reconnect: false }); return; }
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

/** A one-line HTML label for lists (escaped — labels come from the user's own
 *  command line and sync to every client). */
export function appRowHtml(rec) {
  return `<span class="desktop-app-row-label">${escHtml(rec.label || rec.exec || rec.id)}</span> <span class="desktop-app-row-state">${escHtml(rec.state === 'ready' ? t('running') : rec.state === 'launching' ? t('starting') : endedText(rec))}</span>`;
}

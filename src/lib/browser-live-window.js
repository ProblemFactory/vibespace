// THE LIVE VIEW WINDOW (agent browser P2 — docs/design-agent-browser-v2.md
// §4.2 / §4.4 / §3.7). Window type `browser-live`, registered here so the
// title-bar icon, the taskbar, the tab bar and replayOpenSpec learn it from
// ONE registration; openSpec `{action:'openBrowserLive', sessionId,
// profileId}` persists and replays across refresh, desktops and clients — a
// reload comes back in WATCH mode (a reload must never re-seize controls).
//
// What it draws: the session's browser through the cookie-authed bridge
// (`/api/browser/stream?session=…&profile=…`, src/server/browser-stream.js):
//   · the PICTURE — each `frame` is a base64 JPEG drawn through `img.src`
//     (the image-overlay law: never markup), inside a container at NET
//     ZOOM 1 (utils.js's COUNTER_ZOOM, the vnc-view rule — the literal is spelled ONCE), and
//     the ONE pointer conversion `pointerAt(ev)` maps viewport px → the
//     frame's device px through src/browser-stream.js (`pointerToDevice`)
//     — no mixing of viewport rects with layout widths (inc-mtdrm922);
//   · the URL line (from `url` records / the active tab), the TABS pane, the
//     CONSOLE pane (from `console` records), the ACTIONS pane (P5: the trace
//     timeline of this pane, seeded by GET + the stream's `trace` records), the
//     viewer count, the recording indicator (P5: the profile's live screencast
//     from the digest; click = the Browser profiles panel), a hand-off to the
//     embedded browser window;
//   · the MODE badge + the three modes of §4.3 (P3): Watch ("Agent is
//     driving"), Take over (this viewer holds the input side — pointer,
//     wheel and keys are forwarded as the stream server's CDP-shaped records,
//     `src/browser-stream.js` builds them; the agent's commands are refused
//     `browser_paused` meanwhile), Hand back (a transition: the keeper flips
//     the lease and announces through the gated ladder); a `mode` record from
//     the bridge (another window, the idle sweep, the card's Hand back) moves
//     every viewer at once; a reload comes back in WATCH mode;
//   · the AGENT CURSOR (§4.3 "cursor identity"): while the agent drives, a
//     labelled cursor at the last CDP input coordinates the `command` mirror
//     carried (PURE agentCursorFromCommand + deviceToViewport); hidden while
//     the user drives (the user's own pointer is the cursor);
//   · the --confirm-actions CARD (§4.3): a typed `confirmation` record draws
//     a bar with Confirm / Deny + the daemon's 60 s countdown; the answer is
//     the stream's `confirm` verb (upstream's own confirm/deny underneath);
//   · the SWITCHER STRIP (§3.7): a session with ≥2 attachments gets one tab
//     per attachment inside THIS window, never N windows; each tab carries
//     its own activity light (the stream's `command`/`result` mirrors), the
//     title names the profile of the pane you are looking at, and clicking
//     the title opens §3.2.5's picker; P7: each strip tab carries the
//     per-session OWNER dots of its profile (who else this browser belongs to);
//   · WINDOW BINDING (P7, §4.6): ONE `toggleBind()` behind three surfaces —
//     the bar's "Snap beside <session>" / "Unbind" button, a title-bar button
//     on the standalone window, and the 'window' menu row (the title bar's own
//     menu, reachable from the tab and the phone's long-press) — binds this
//     pane beside its session's window in one tab group (wm.bindSplit,
//     announced ⇒ the 5 s Undo toast — split UX R5) or unbinds (the group
//     stays, nothing moves); the OWNERSHIP badge
//     (wm.setOwnerBadge: the session's own colour + name, N dots when the
//     profile is shared, from the digest's `leases`) rides the title bar and
//     the tab; AUTO-BIND (`browser.autoBindLiveView`, default ON): when a
//     session's browser starts (a NEW lease in the digest) and its window is
//     open on this desktop, the live view is BORN inside that chain
//     (createWindow's intoChain — never created-then-merged) under a
//     deterministic syncId so two clients never open two.
// XSS: page titles and URLs are page-controlled and sync to every client —
// textContent / escHtml only. Theme vars only, SVG icons only.
import { t } from './i18n.js';
import { escHtml, fetchJson, showToast, COUNTER_ZOOM } from './utils.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerMenuItem } from './contributions.js';
import { ownerDots } from './chain-layout.js'; // P7 (§4.6): the per-SESSION owner colour, never the group's
import { UI_ICONS } from './icons.js';
import { STREAM_PATH, MAX_FPS_DEFAULT, pointerToDevice, deviceToViewport, drawnRect, liveTitle, mouseRecord, wheelRecord, keyRecord, touchRecord, modifiersOf } from '../browser-stream.js';
import { agentCursorFromCommand, modeBadge as modeBadgeText } from '../browser-takeover.js';
import { createTraceTimeline } from './browser-trace-view.js'; // agent browser P5 (§4.5 / D35): the Actions pane

const CONSOLE_CAP = 200;
const RECONNECT_MAX = 5;
const HIDDEN_FPS = 2;
const HINT_EVERY_MS = 8000;
/** Pointer moves are forwarded at most this often while the user drives. */
const MOVE_EVERY_MS = 33;
/** Keys the page must see even when the browser chrome would eat them (only while driving). */
const FORWARDED_KEYS = new Set(['Tab', 'Enter', 'Backspace', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', ' ']);

/** The merged sidebar row for a webui id (names, pin, rung — for the picker). */
function sessionRow(app, sessionId) {
  try { return (app.sidebar?._allSessions || []).find((s) => s.webuiId === sessionId) || null; } catch { return null; }
}
/** The session's OWN window on this client (chat or terminal) — the thing a live view binds beside. */
export function sessionWindowFor(app, sessionId) {
  try {
    for (const [winId, view] of app.sessions || []) {
      if (!view || view.sessionId !== sessionId) continue;
      const w = app.wm.windows.get(winId);
      if (w && (w.type === 'chat' || w.type === 'terminal')) return w;
    }
  } catch { /* no sessions map */ }
  return null;
}
/** Is this window a pane of its chain's split? */
function isSplitPane(winInfo) {
  const c = winInfo && winInfo._tabChain;
  return !!(c && c.layout === 'split' && c.split && c.split.pair.includes(winInfo.id));
}
const BIND_SVG = svgIcon16('<rect x="1.5" y="3" width="5.5" height="10" rx="1"/><rect x="9" y="3" width="5.5" height="10" rx="1"/><path d="M7 8h2"/>');

export function openBrowserLive(app, { sessionId, profileId = null, syncId, intoChain = null } = {}) {
  if (!sessionId) { showToast(t('No session to view'), { type: 'error' }); return null; }
  app._hideWelcome?.();
  const winInfo = app.wm.createWindow({
    title: t('Browser (live)'), type: 'browser-live', syncId, intoChain: intoChain || undefined,
    openSpec: { action: 'openBrowserLive', sessionId, profileId: profileId || null },
  });
  const L = createLiveView(app, winInfo, { sessionId, profileId });
  winInfo._browserLive = L;
  winInfo.onClose = () => L.dispose();
  L.connect();
  return winInfo;
}

function createLiveView(app, winInfo, { sessionId, profileId }) {
  const st = {
    sessionId, profileRef: profileId || '', ws: null, closed: false, connected: false,
    frames: 0, frameW: 0, frameH: 0, viewers: 0, mode: 'watch', holder: null, target: null,
    url: '', tabs: [], console: [], lastStatus: null, error: null, attachments: [], defaultId: null,
    running: false, lastCommand: null, reconnects: 0, reconnectTimer: null, lastHintAt: 0, sidePane: null,
    // P3 (§4.3): the input side — our viewer id, whether WE hold it, the agent cursor, the pending confirmations
    you: null, mine: false, modeSince: 0, modeCause: null, cursor: null, confirmations: new Map(), confirmTimer: null, lastMoveAt: 0, buttonsDown: 0,
  };
  const row = () => sessionRow(app, sessionId);

  // ── DOM ──
  const root = document.createElement('div'); root.className = 'browser-live';
  const strip = document.createElement('div'); strip.className = 'browser-live-strip'; strip.style.display = 'none';
  const bar = document.createElement('div'); bar.className = 'browser-live-bar';
  const modeBadge = document.createElement('span'); modeBadge.className = 'browser-live-mode';
  const watchBtn = document.createElement('button'); watchBtn.className = 'file-tool-btn browser-live-mode-btn active'; watchBtn.textContent = t('Watch'); watchBtn.title = t('Watch: the agent drives, you see what it sees');
  const takeBtn = document.createElement('button'); takeBtn.className = 'file-tool-btn browser-live-mode-btn'; takeBtn.textContent = t('Take over'); takeBtn.title = t('Take over the controls — the agent pauses until you hand back');
  const handBtn = document.createElement('button'); handBtn.className = 'file-tool-btn browser-live-handback'; handBtn.textContent = t('Hand back'); handBtn.title = t('Hand the controls back to the agent — it is told the current URL'); handBtn.style.display = 'none';
  const urlEl = document.createElement('span'); urlEl.className = 'browser-live-url'; urlEl.textContent = '';
  const openBtn = document.createElement('button'); openBtn.className = 'file-tool-btn browser-live-open'; openBtn.innerHTML = UI_ICONS.web; openBtn.title = t('Open this URL in the embedded browser');
  const viewersEl = document.createElement('span'); viewersEl.className = 'browser-live-viewers';
  // P5 (D7): the RECORDING indicator reads the profile digest (`recording[profileId]` rides `browser-profiles-updated`); click = the Browser profiles panel where the per-profile opt-in lives
  const recEl = document.createElement('button'); recEl.className = 'file-tool-btn browser-live-rec'; recEl.textContent = t('not recording');
  const tabsBtn = document.createElement('button'); tabsBtn.className = 'file-tool-btn browser-live-side-btn'; tabsBtn.dataset.pane = 'tabs';
  const consBtn = document.createElement('button'); consBtn.className = 'file-tool-btn browser-live-side-btn'; consBtn.dataset.pane = 'console';
  // P5 (§4.5 / D35): the ACTIONS pane — the timeline of the pane you are looking at
  const traceBtn = document.createElement('button'); traceBtn.className = 'file-tool-btn browser-live-side-btn'; traceBtn.dataset.pane = 'trace';
  const timeline = createTraceTimeline(app, { sessionId });
  const reBtn = document.createElement('button'); reBtn.className = 'file-tool-btn browser-live-reconnect'; reBtn.textContent = t('Reconnect'); reBtn.style.display = 'none';
  // P4 (§7.4): the BACKEND CHIP — `chromium 146` / `cloak 146 (free)` from the profile digest; click = the switcher. Hidden for the ephemeral browser (a backend is a property of a PROFILE).
  const backendBtn = document.createElement('button'); backendBtn.className = 'file-tool-btn browser-live-backend'; backendBtn.style.display = 'none'; backendBtn.title = t('This profile’s backend — click to switch');
  // P7 (§4.6): BIND — snap this pane beside its session's window in ONE tab group, or unbind
  const bindBtn = document.createElement('button'); bindBtn.className = 'file-tool-btn browser-live-bind';
  bar.append(modeBadge, watchBtn, takeBtn, handBtn, bindBtn, urlEl, openBtn, viewersEl, recEl, backendBtn, tabsBtn, consBtn, traceBtn, reBtn);
  // …and the same act on the TITLE BAR of the standalone window (the design's affordance; hidden with the title bar once grouped)
  const titleBind = document.createElement('button'); titleBind.className = 'win-btn win-bind'; titleBind.innerHTML = BIND_SVG;
  { const controls = winInfo.titleBar?.querySelector('.window-controls'); if (controls) controls.insertBefore(titleBind, controls.firstChild); }
  // P3: the --confirm-actions cards (one row per pending confirmation)
  const confirms = document.createElement('div'); confirms.className = 'browser-live-confirms'; confirms.style.display = 'none';
  // P4 (§7.4): the agent's `blocked` CLAIMS about this profile — it says WHO claimed it; the one-click "Open with CloakBrowser" is the USER's act (it opens the switcher on the cloak row)
  const blockedBar = document.createElement('div'); blockedBar.className = 'browser-live-blocked'; blockedBar.style.display = 'none';
  const body = document.createElement('div'); body.className = 'browser-live-body';
  const canvas = document.createElement('div'); canvas.className = 'browser-live-canvas';
  // COORDINATE SPACES MUST COINCIDE (inc-mtdrm922): counter-zoom so the picture
  // lives at NET zoom 1 — the JPEG maps ~1:1 to device pixels and no reader
  // of this element mixes viewport px with layout px. var()-reactive.
  canvas.style.zoom = COUNTER_ZOOM;
  const img = document.createElement('img'); img.className = 'browser-live-img'; img.alt = ''; img.draggable = false;
  const statusEl = document.createElement('div'); statusEl.className = 'browser-live-status'; statusEl.textContent = t('Connecting…');
  // P3: the labelled AGENT cursor — a child of the same net-zoom-1 canvas as the picture, so its layout px are the picture's
  const cursorEl = document.createElement('div'); cursorEl.className = 'browser-live-agent-cursor'; cursorEl.style.display = 'none';
  cursorEl.innerHTML = '<svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true"><path d="M1 1l4.5 14 2.2-5.4 5.8-1.2z" fill="var(--accent)" stroke="var(--bg)" stroke-width="1.2" stroke-linejoin="round"/></svg><span class="browser-live-agent-cursor-label"></span>';
  const cursorLabel = cursorEl.querySelector('.browser-live-agent-cursor-label');
  canvas.append(img, cursorEl, statusEl);
  root.tabIndex = 0; // keys are forwarded only while this viewer drives
  const side = document.createElement('div'); side.className = 'browser-live-side'; side.style.display = 'none';
  const tabsPane = document.createElement('div'); tabsPane.className = 'browser-live-tabs';
  const consPane = document.createElement('div'); consPane.className = 'browser-live-console';
  const tracePane = timeline.el; tracePane.classList.add('browser-live-tracepane');
  side.append(tabsPane, consPane, tracePane);
  body.append(canvas, side);
  root.append(strip, bar, blockedBar, confirms, body);
  winInfo.content.appendChild(root);

  const setStatus = (text, { error = false, reconnect = false, hide = false } = {}) => {
    statusEl.textContent = text || '';
    statusEl.style.display = hide ? 'none' : '';
    statusEl.classList.toggle('error', !!error);
    reBtn.style.display = reconnect ? '' : 'none';
  };
  const renderMode = () => {
    const taken = st.mode === 'takeover';
    modeBadge.textContent = t(modeBadge_(st.mode, st.mine));
    modeBadge.classList.toggle('takeover', taken && st.mine);
    modeBadge.classList.toggle('other', taken && !st.mine);
    watchBtn.classList.toggle('active', !taken);
    takeBtn.classList.toggle('active', taken && st.mine);
    takeBtn.disabled = taken && !st.mine;
    takeBtn.title = taken && !st.mine ? t('Another viewer holds the controls') : t('Take over the controls — the agent pauses until you hand back');
    handBtn.style.display = taken ? '' : 'none';
    root.classList.toggle('driving', taken && st.mine);
    renderCursor();
  };
  // the badge's words come from the PURE table; t() needs the literal keys below to be extractable
  const modeBadge_ = (mode, mine) => modeBadgeText({ mode, mine });
  void [t('Agent is driving'), t('You are driving — agent asked to pause'), t('Another viewer is driving — agent asked to pause')];
  /** The agent cursor at the last CDP coordinates — hidden while the user drives or before a frame. */
  const renderCursor = () => {
    const c = st.cursor;
    const show = !!(c && c.x !== null && c.y !== null && st.frameW && st.frameH && !(st.mode === 'takeover' && st.mine));
    cursorEl.style.display = show ? '' : 'none';
    if (!show) return;
    // both sides in the canvas's LAYOUT px (the img fills the canvas; the picture is letterboxed inside)
    const p = deviceToViewport({ x: c.x, y: c.y, elRect: { left: img.offsetLeft, top: img.offsetTop, width: img.clientWidth, height: img.clientHeight }, frameW: st.frameW, frameH: st.frameH });
    if (!p) { cursorEl.style.display = 'none'; return; }
    cursorEl.style.left = p.left + 'px'; cursorEl.style.top = p.top + 'px';
    cursorLabel.textContent = t('agent') + (c.action ? ' · ' + c.action : '');
  };
  /** The --confirm-actions cards: one row each, with the daemon's countdown. */
  const renderConfirms = () => {
    const now = Date.now();
    for (const [id, c] of [...st.confirmations]) if (c.expiresAt && c.expiresAt <= now) st.confirmations.delete(id);
    confirms.innerHTML = '';
    confirms.style.display = st.confirmations.size ? '' : 'none';
    for (const c of st.confirmations.values()) {
      const row = document.createElement('div'); row.className = 'browser-live-confirm';
      const text = document.createElement('span'); text.className = 'browser-live-confirm-text';
      const left = Math.max(0, Math.round(((c.expiresAt || now) - now) / 1000));
      text.textContent = t('The agent wants to run {action} — confirm?', { action: String(c.action || 'an action') }) + (c.category ? ` [${c.category}]` : '') + ' · ' + t('auto-denies in {s}s', { s: left });
      const ok = document.createElement('button'); ok.className = 'file-tool-btn browser-live-confirm-btn'; ok.textContent = t('Confirm'); ok.onclick = () => answerConfirm(c.id, 'confirm');
      const no = document.createElement('button'); no.className = 'file-tool-btn browser-live-confirm-btn deny'; no.textContent = t('Deny'); no.onclick = () => answerConfirm(c.id, 'deny');
      row.append(text, ok, no);
      confirms.appendChild(row);
    }
    if (st.confirmations.size && !st.confirmTimer) st.confirmTimer = setInterval(renderConfirms, 1000);
    if (!st.confirmations.size && st.confirmTimer) { clearInterval(st.confirmTimer); st.confirmTimer = null; }
  };
  function answerConfirm(id, decision) { send({ type: 'confirm', id, decision }); }
  const renderViewers = () => { viewersEl.textContent = t('{n} viewer(s)', { n: st.viewers || 1 }); viewersEl.title = t('Windows watching this browser right now (on every client)'); };
  const renderUrl = () => { urlEl.textContent = st.url || ''; urlEl.title = st.url || ''; openBtn.disabled = !st.url; };
  const renderTabs = () => {
    tabsBtn.textContent = `${t('Tabs')} (${st.tabs.length})`;
    tabsPane.innerHTML = '';
    for (const tab of st.tabs) {
      const d = document.createElement('div');
      d.className = 'browser-live-tab' + (tab.active ? ' active' : '');
      const title = document.createElement('div'); title.className = 'browser-live-tab-title'; title.textContent = String(tab.title || tab.url || tab.tabId || '');
      const url = document.createElement('div'); url.className = 'browser-live-tab-url'; url.textContent = String(tab.url || '');
      d.title = String(tab.url || '');
      d.append(title, url);
      tabsPane.appendChild(d);
    }
  };
  const renderConsole = () => {
    consBtn.textContent = `${t('Console')} (${st.console.length})`;
    consPane.innerHTML = '';
    for (const line of st.console) {
      const d = document.createElement('div');
      d.className = 'browser-live-console-line' + (line.level ? ' level-' + escHtml(String(line.level)).replace(/[^a-z]/gi, '') : '');
      d.textContent = (line.level ? `[${line.level}] ` : '') + String(line.text || '');
      consPane.appendChild(d);
    }
    consPane.scrollTop = consPane.scrollHeight;
  };
  const sessionName = () => { const r = row(); return r ? (r.webuiName || r.name || '') : ''; };
  const renderTitle = () => {
    const name = sessionName();
    const tg = st.target;
    const title = liveTitle({ label: tg ? tg.label : null, alias: tg ? tg.alias : null, sessionName: name, ephemeralWord: t('ephemeral (no profile)') });
    try { app.wm.setTitle(winInfo.id, title); } catch { /* window gone */ }
  };
  // ── P7 (§4.6 / §3.7): the OWNERSHIP badge + the strip's per-pane owner dots, from the digest's leases ──
  const nameOf = (id) => { const s = (app.sidebar?._allSessions || []).find((x) => x.webuiId === id); return s ? (s.webuiName || s.name || '') : ''; };
  const dotsFor = (pid) => ownerDots({ leases: (app._browserProfiles && app._browserProfiles.leases) || [], profileId: pid || null, sessionId, nameOf });
  const ownersEl = (dots) => {
    const el = document.createElement('span'); el.className = 'browser-live-strip-owners';
    for (const d of dots.slice(0, 6)) { const i = document.createElement('i'); i.className = 'win-owner-dot'; i.style.background = String(d.color || ''); el.appendChild(i); }
    el.title = dots.map((d) => String(d.name || d.sessionId)).join('\n');
    return el;
  };
  const renderOwner = () => { const pid = st.target && st.target.profileId ? st.target.profileId : null; try { app.wm.setOwnerBadge?.(winInfo.id, { dots: dotsFor(pid) }); } catch { /* window gone */ } };
  // ── P7 (§4.6): BIND / UNBIND — one act, three surfaces ──
  const isBound = () => isSplitPane(winInfo);
  const bindLabel = () => (isBound() ? t('Unbind') : t('Snap beside {name}', { name: sessionName() || t('its session') }));
  const bindTitle = () => (isBound() ? t('Back to two free windows — the group stays and nothing moves') : t('Show this browser side by side with its session, in one window'));
  const renderBind = () => {
    const bound = isBound();
    bindBtn.classList.toggle('bound', bound); titleBind.classList.toggle('bound', bound);
    bindBtn.textContent = bindLabel(); bindBtn.title = bindTitle(); titleBind.title = bindTitle();
  };
  function toggleBind() {
    if (isBound()) { app.wm.unbindSplit(winInfo._tabChain); renderBind(); return true; }
    const host = sessionWindowFor(app, sessionId);
    if (!host) { showToast(t('Open the session’s window first — there is nothing to snap beside'), { type: 'warn' }); return false; }
    app.wm.bindSplit(host, winInfo, { side: 'right', announce: true }); // a user's explicit act ⇒ the 5 s Undo toast (split UX R5); the auto-bind (createWindow({intoChain})) stays silent
    renderBind();
    return true;
  }
  bindBtn.onclick = () => toggleBind();
  titleBind.onclick = (e) => { e.stopPropagation(); toggleBind(); };
  // every chain transition (bind / unbind / detach / a tab switch) ends in onResize of the displayed panes — re-read the state there
  winInfo.onResize = () => renderBind();
  const renderStrip = () => {
    const atts = st.attachments || [];
    const show = atts.length >= 2;
    strip.style.display = show ? '' : 'none';
    strip.innerHTML = '';
    if (!show) return;
    for (const a of atts) {
      const b = document.createElement('button');
      const current = st.target && st.target.profileId === a.profileId;
      b.className = 'browser-live-strip-tab' + (current ? ' active' : '') + (current && st.running ? ' running' : '');
      b.dataset.profileId = a.profileId;
      const dot = document.createElement('span'); dot.className = 'browser-live-strip-dot';
      const label = document.createElement('span'); label.textContent = String(a.label || a.alias || a.profileId) + (a.isDefault ? ' ' + t('(default)') : '');
      b.append(dot, label, ownersEl(dotsFor(a.profileId))); // §3.7: the per-pane owner badge
      b.title = current ? t('You are looking at this pane') : t('Switch this window to {name}', { name: String(a.label || a.alias || a.profileId) });
      b.onclick = () => { if (!current) switchTo(a.profileId); };
      strip.appendChild(b);
    }
  };
  const renderSide = () => {
    side.style.display = st.sidePane ? '' : 'none';
    tabsPane.style.display = st.sidePane === 'tabs' ? '' : 'none';
    consPane.style.display = st.sidePane === 'console' ? '' : 'none';
    tracePane.style.display = st.sidePane === 'trace' ? '' : 'none';
    tabsBtn.classList.toggle('active', st.sidePane === 'tabs');
    consBtn.classList.toggle('active', st.sidePane === 'console');
    traceBtn.classList.toggle('active', st.sidePane === 'trace');
  };
  const renderTraceBtn = () => { traceBtn.textContent = `${t('Actions')} (${timeline.count()})`; traceBtn.title = t('Every action the agent sent to this browser — before / after frames and where it clicked'); };
  /** P5: which scope the Actions pane shows = the pane you are looking at (a profile, or the ephemeral browser); re-seeded on every hello (a reconnect fills the gap, ids dedup). */
  const syncTrace = () => {
    const tg = st.target;
    const pid = tg && tg.kind !== 'ephemeral' && tg.profileId ? tg.profileId : null;
    timeline.load({ profileId: pid }).then(renderTraceBtn).catch(() => renderTraceBtn());
  };
  /** P5 (D7): the recording indicator from the digest — never fetched here. */
  const renderRec = () => {
    const pid = st.target && st.target.profileId ? st.target.profileId : null;
    const d = app._browserProfiles || {};
    const rec = pid && d.recording ? d.recording[pid] : null;
    const refused = pid && d.recordingRefused ? d.recordingRefused[pid] : null;
    recEl.classList.toggle('on', !!rec);
    if (rec) { recEl.textContent = t('recording'); recEl.title = t('Recording to {file} since {time}', { file: String(rec.file || ''), time: new Date(Number(rec.since) || 0).toLocaleTimeString() }); }
    else if (refused) { recEl.textContent = t('recording refused'); recEl.title = String(refused.error || refused.code || ''); }
    else { recEl.textContent = t('not recording'); recEl.title = pid ? t('Recording is a per-profile opt-in — turn it on in Browser profiles…') : t('An ephemeral browser has no profile to record under'); }
  };
  recEl.onclick = () => { const pid = st.target && st.target.profileId ? st.target.profileId : null; if (app.openBrowserProfiles) app.openBrowserProfiles({ focus: pid }); else showToast(t('Browser profiles are not available'), { type: 'warn' }); };
  /** P4 (§7.4): the chip + the blocked-claim banner, both read from the profile digest (never fetched here). */
  const renderBackend = () => {
    const pid = st.target && st.target.profileId ? st.target.profileId : null;
    const chip = pid && app.browserChipFor ? app.browserChipFor(pid) : null;
    backendBtn.style.display = pid ? '' : 'none';
    backendBtn.textContent = chip || t('backend unknown');
    const claims = app.browserBlockedFor ? app.browserBlockedFor({ profileId: pid, sessionId }) : [];
    blockedBar.replaceChildren();
    blockedBar.style.display = claims.length ? '' : 'none';
    for (const b of claims) {
      const row = document.createElement('div'); row.className = 'browser-live-blocked-row';
      const text = document.createElement('span'); text.className = 'browser-live-blocked-text';
      text.textContent = t('The agent says this page is blocked: {host}', { host: String(b.host || '') }) + (b.why ? ' (' + String(b.why) + ')' : '') + ' — ' + t('it suggests tier {tier}', { tier: b.tier });
      const open = document.createElement('button'); open.className = 'file-tool-btn'; open.textContent = t('Open with CloakBrowser');
      open.disabled = !pid; open.onclick = () => app.openBrowserSwitcher?.({ profileId: pid, sessionId, preselect: 'cloak' });
      const dismiss = document.createElement('button'); dismiss.className = 'file-tool-btn'; dismiss.textContent = t('Dismiss');
      dismiss.onclick = async () => { const r = await fetchJson(`/api/browser/blocked/${encodeURIComponent(b.id)}`, { method: 'DELETE' }); if (!r || r.error) showToast((r && r.error) || t('server unreachable'), { type: 'error' }); };
      row.append(text, open, dismiss);
      blockedBar.appendChild(row);
    }
  };
  backendBtn.onclick = () => { const pid = st.target && st.target.profileId; if (pid) app.openBrowserSwitcher?.({ profileId: pid, sessionId }); };
  renderMode(); renderViewers(); renderUrl(); renderTabs(); renderConsole(); renderSide(); renderBackend(); renderTraceBtn(); renderRec(); renderBind(); renderOwner();

  // ── the attachment set (the strip) ──
  async function refreshSet() {
    if (st.closed) return;
    const r = await fetchJson(`/api/browser/session/${encodeURIComponent(sessionId)}`);
    if (!r || r.error) { st.attachments = []; renderStrip(); return; }
    st.attachments = Array.isArray(r.attachments) ? r.attachments : [];
    st.defaultId = r.defaultProfile || null;
    renderStrip();
  }
  const onGlobal = (msg) => {
    if (st.closed || !msg) return;
    if (msg.type === 'browser-profiles-updated') { refreshSet(); renderBackend(); renderRec(); renderOwner(); }
  };
  app.ws?.onGlobal?.(onGlobal);

  // ── the socket ──
  function send(obj) { try { if (st.ws && st.ws.readyState === 1) st.ws.send(JSON.stringify(obj)); } catch { /* closing */ } }
  function connect() {
    if (st.closed) return;
    if (st.reconnectTimer) { clearTimeout(st.reconnectTimer); st.reconnectTimer = null; }
    try { st.ws?.close(); } catch { /* */ }
    st.connected = false; st.error = null;
    setStatus(t('Connecting…'));
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const q = new URLSearchParams({ session: sessionId });
    if (st.profileRef) q.set('profile', st.profileRef);
    const ws = new WebSocket(`${proto}://${location.host}${STREAM_PATH}?${q}`);
    st.ws = ws;
    ws.onopen = () => { if (ws !== st.ws) return; send({ type: 'config', maxFps: document.hidden ? HIDDEN_FPS : MAX_FPS_DEFAULT }); };
    ws.onmessage = (ev) => { if (ws !== st.ws) return; let m = null; try { m = JSON.parse(ev.data); } catch { return; } onMessage(m); };
    ws.onclose = () => { if (ws !== st.ws) return; st.connected = false; if (st.closed) return; if (!st.error) { setStatus(t('Connection lost'), { error: true, reconnect: true }); scheduleReconnect(); } };
    ws.onerror = () => { /* onclose follows */ };
  }
  function scheduleReconnect() {
    if (st.closed || st.reconnects >= RECONNECT_MAX) return;
    const delay = Math.min(15000, 1000 * Math.pow(2, st.reconnects));
    st.reconnects++;
    st.reconnectTimer = setTimeout(() => { st.reconnectTimer = null; connect(); }, delay);
  }
  function onMessage(m) {
    switch (m.type) {
      case 'hello':
        st.mode = m.mode || 'watch'; st.holder = m.holder || null; st.viewers = m.viewers || 1; st.target = m.target || null;
        st.you = m.you || null; st.mine = !!m.mine; st.modeSince = Number(m.since) || 0;
        renderMode(); renderViewers(); renderTitle(); renderStrip(); renderBackend(); renderRec(); syncTrace(); renderOwner(); renderBind();
        break;
      // P3 (§4.3): the bridge's answer to a takeover/handback — ours or anybody's
      case 'mode': {
        const was = st.mode, wasMine = st.mine;
        st.mode = m.mode || 'watch'; st.holder = m.holder || null; st.mine = !!m.mine; st.modeSince = Number(m.since) || 0; st.modeCause = m.cause || null;
        renderMode();
        if (was === 'takeover' && st.mode === 'watch' && wasMine) {
          if (m.cause === 'idle') showToast(t('Your takeover lapsed (no input) — the agent is driving again'), { duration: 5000 });
          else if (m.cause !== 'explicit') showToast(t('Control returned to the agent'), { duration: 3500 });
        } else if (st.mode === 'takeover' && st.mine && !wasMine) showToast(t('You took over — the agent is paused until you hand back'), { duration: 4000 });
        break;
      }
      case 'mode-ack': if (m.ok && m.mode === 'watch') showToast(t('Control handed back to the agent'), { duration: 3500 }); break;
      case 'confirmation': if (m.id) { st.confirmations.set(m.id, { id: m.id, action: m.action, category: m.category || null, expiresAt: Number(m.expiresAt) || (Date.now() + 60000) }); renderConfirms(); } break;
      case 'confirmation-resolved': if (m.id && st.confirmations.delete(m.id)) renderConfirms(); break;
      case 'confirmation-ack': if (!m.ok) showToast(t('Could not answer the confirmation: {why}', { why: String(m.error || m.code || '') }), { type: 'error' }); else st.confirmations.delete(m.id), renderConfirms(); break;
      case 'viewers': st.viewers = Number(m.n) || 1; renderViewers(); break;
      case 'status':
        st.lastStatus = m;
        if (m.state === 'error') { st.error = m; setStatus(t('Live view unavailable: {why}', { why: String(m.error || m.code || '') }), { error: true, reconnect: true }); }
        else if (m.state === 'connecting') setStatus(t('Starting the browser stream…'));
        else if (m.state === 'upstream-open') { st.connected = true; st.reconnects = 0; setStatus(st.frames ? '' : t('Connected — waiting for the first frame…'), { hide: !!st.frames }); }
        else if (m.state === 'upstream-closed') { st.connected = false; setStatus(t('Stream ended'), { error: true, reconnect: true }); }
        else if (m.state === 'ended') { st.error = m; setStatus(String(m.error || t('Stream ended')), { error: true, reconnect: true }); }
        else if (m.connected !== undefined) { // the upstream's own status record
          if (m.viewportWidth && m.viewportHeight && !st.frameW) { st.frameW = m.viewportWidth; st.frameH = m.viewportHeight; }
        }
        break;
      case 'frame': {
        const data = typeof m.data === 'string' ? m.data : '';
        if (!data) break;
        st.frames++;
        const md = m.metadata || {};
        if (md.deviceWidth) st.frameW = Number(md.deviceWidth) || st.frameW;
        if (md.deviceHeight) st.frameH = Number(md.deviceHeight) || st.frameH;
        img.src = 'data:image/jpeg;base64,' + data; // .src, never markup (the image-overlay law)
        if (st.frames === 1) setStatus('', { hide: true });
        break;
      }
      case 'tabs':
        st.tabs = Array.isArray(m.tabs) ? m.tabs.map((x) => ({ tabId: String(x.tabId || ''), title: String(x.title || ''), url: String(x.url || ''), active: !!x.active })) : [];
        { const act = st.tabs.find((x) => x.active); if (act && act.url && !st.url) { st.url = act.url; renderUrl(); } }
        renderTabs();
        break;
      case 'url': st.url = String(m.url || ''); renderUrl(); break;
      case 'console':
        st.console.push({ level: m.level ? String(m.level).slice(0, 12) : '', text: String(m.text || m.message || '').slice(0, 2000) });
        if (st.console.length > CONSOLE_CAP) st.console.splice(0, st.console.length - CONSOLE_CAP);
        renderConsole();
        break;
      case 'command': {
        st.running = true; st.lastCommand = String(m.action || ''); renderStrip();
        const c = agentCursorFromCommand(m);
        if (c) { st.cursor = c.x === null && st.cursor ? { ...st.cursor, action: c.action, at: c.at } : c; renderCursor(); }
        break;
      }
      case 'result': st.running = false; renderStrip(); break;
      // P5 (§4.5 / D35): the recorder's entry for THIS pane, pushed by the bridge to every viewer (never the bytes)
      case 'trace': if (m.entry && timeline.push(m.entry)) renderTraceBtn(); break;
      case 'refused':
        if (m.code === 'held') showToast(t('Another viewer holds the controls'), { type: 'warn' });
        else if (m.code !== 'watch-mode') showToast(String(m.error || m.code || 'refused'), { type: 'warn' });
        break;
      default: break;
    }
  }
  function switchTo(profileRef) {
    st.profileRef = profileRef || '';
    st.frames = 0; st.url = ''; st.tabs = []; st.console = []; st.running = false; st.reconnects = 0;
    img.removeAttribute('src');
    timeline.clear(); renderTraceBtn(); // the next hello names the pane and re-seeds
    renderUrl(); renderTabs(); renderConsole();
    try { winInfo._openSpec = { action: 'openBrowserLive', sessionId, profileId: st.profileRef || null }; app.wm._notify?.(); } catch { /* optional */ }
    connect();
  }

  // ── chrome actions ──
  openBtn.onclick = () => { if (st.url) app.openBrowser(st.url); };
  reBtn.onclick = () => { st.reconnects = 0; connect(); };
  tabsBtn.onclick = () => { st.sidePane = st.sidePane === 'tabs' ? null : 'tabs'; renderSide(); };
  consBtn.onclick = () => { st.sidePane = st.sidePane === 'console' ? null : 'console'; renderSide(); };
  traceBtn.onclick = () => { st.sidePane = st.sidePane === 'trace' ? null : 'trace'; renderSide(); };
  // P3 (§4.3): the three modes. Watch = the button is a no-op; Take over asks
  // the bridge (the keeper decides, a `mode` record answers every viewer);
  // Hand back is a transition any viewer may trigger.
  watchBtn.onclick = () => { if (st.mode === 'takeover' && st.mine) send({ type: 'handback' }); };
  takeBtn.onclick = () => { if (!(st.mode === 'takeover' && st.mine)) { send({ type: 'takeover' }); root.focus({ preventScroll: true }); } };
  handBtn.onclick = () => send({ type: 'handback' });
  winInfo.titleSpan?.addEventListener?.('click', (e) => { const r = row(); if (r && app.showBrowserProfilePicker) app.showBrowserProfilePicker(r, { x: e.clientX, y: e.clientY }); }, { signal: winInfo._listenerCtl?.signal });
  // INPUT FORWARDING — only while THIS viewer drives; every record is the
  // stream server's CDP shape built by src/browser-stream.js, coordinates
  // through the ONE viewport→device conversion (pointerAt). In Watch mode a
  // click is a hint, never forwarded (the bridge would refuse it typed anyway).
  const driving = () => st.mode === 'takeover' && st.mine;
  const sig = { signal: winInfo._listenerCtl?.signal };
  img.addEventListener('pointerdown', (e) => {
    const p = pointerAt(e);
    if (!driving()) {
      const now = Date.now();
      if (now - st.lastHintAt > HINT_EVERY_MS) { st.lastHintAt = now; showToast(t('Watch mode — the agent is driving; press Take over to send input'), { duration: 3500 }); }
      if (p) canvas.dataset.lastPointer = `${p.x},${p.y}`;
      return;
    }
    e.preventDefault(); root.focus({ preventScroll: true });
    try { img.setPointerCapture(e.pointerId); } catch { /* optional */ }
    st.buttonsDown++;
    const rec = e.pointerType === 'touch' ? touchRecord({ kind: 'start', pt: p }) : mouseRecord({ kind: 'down', pt: p, button: e.button, modifiers: modifiersOf(e) });
    if (rec) send(rec);
  }, sig);
  img.addEventListener('pointermove', (e) => {
    if (!driving()) return;
    const now = Date.now();
    if (now - st.lastMoveAt < MOVE_EVERY_MS) return;
    st.lastMoveAt = now;
    const p = pointerAt(e); if (!p) return;
    const rec = e.pointerType === 'touch' ? (st.buttonsDown ? touchRecord({ kind: 'move', pt: p }) : null) : mouseRecord({ kind: 'move', pt: p, modifiers: modifiersOf(e) });
    if (rec) send(rec);
  }, sig);
  const up = (e) => {
    if (!driving()) return;
    const p = pointerAt(e);
    st.buttonsDown = Math.max(0, st.buttonsDown - 1);
    const rec = e.pointerType === 'touch' ? touchRecord({ kind: 'end', pt: p || { x: 0, y: 0 } }) : (p ? mouseRecord({ kind: 'up', pt: p, button: e.button, modifiers: modifiersOf(e) }) : null);
    if (rec) send(rec);
  };
  img.addEventListener('pointerup', up, sig);
  img.addEventListener('pointercancel', up, sig);
  img.addEventListener('contextmenu', (e) => { if (driving()) e.preventDefault(); }, sig);
  img.addEventListener('wheel', (e) => {
    if (!driving()) return;
    e.preventDefault();
    const p = pointerAt(e); if (!p) return;
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const rec = wheelRecord({ pt: p, deltaX: e.deltaX * k, deltaY: e.deltaY * k, modifiers: modifiersOf(e) });
    if (rec) send(rec);
  }, { ...sig, passive: false });
  const onKey = (e) => {
    if (!driving()) return;
    if (e.target !== root && root.contains(e.target) && e.target.tagName === 'BUTTON') return; // the chrome's own buttons keep their keys
    const printable = e.key.length === 1;
    if (!printable && !FORWARDED_KEYS.has(e.key) && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const rec = keyRecord({ kind: e.type === 'keyup' ? 'up' : 'down', key: e.key, code: e.code, modifiers: modifiersOf(e) });
    if (rec) send(rec);
  };
  root.addEventListener('keydown', onKey, sig);
  root.addEventListener('keyup', onKey, sig);
  const onVis = () => send({ type: 'config', maxFps: document.hidden ? HIDDEN_FPS : MAX_FPS_DEFAULT });
  document.addEventListener('visibilitychange', onVis, { signal: winInfo._listenerCtl?.signal });

  /** Viewport px → the frame's device px (null outside the drawn picture). */
  function pointerAt(ev) {
    if (!st.frameW || !st.frameH) return null;
    const rect = img.getBoundingClientRect();
    return pointerToDevice({ clientX: ev.clientX, clientY: ev.clientY, elRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, frameW: st.frameW, frameH: st.frameH });
  }
  function dispose() {
    st.closed = true;
    try { app.wm.setOwnerBadge?.(winInfo.id, null); } catch { /* window gone */ }
    if (st.confirmTimer) { clearInterval(st.confirmTimer); st.confirmTimer = null; }
    if (st.reconnectTimer) clearTimeout(st.reconnectTimer);
    try { st.ws?.close(); } catch { /* */ }
    st.ws = null;
    try { app.ws?.offGlobal?.(onGlobal); } catch { /* optional */ }
  }
  refreshSet();
  return {
    connect, dispose, switchTo, pointerAt,
    toggleBind, bindLabel, isBound, // P7 (§4.6): the one act behind the bar button, the title-bar button and the window menu row
    el: () => root, img: () => img,
    drawn: () => { const r = img.getBoundingClientRect(); return drawnRect({ left: r.left, top: r.top, width: r.width, height: r.height }, st.frameW, st.frameH); },
    send, // P3: the suite drives the control verbs through the real socket
    state: () => ({ sessionId, profileRef: st.profileRef, connected: st.connected, frames: st.frames, frameW: st.frameW, frameH: st.frameH, viewers: st.viewers, mode: st.mode, target: st.target, url: st.url, tabs: st.tabs.slice(), console: st.console.length, attachments: st.attachments.slice(), running: st.running, lastCommand: st.lastCommand, error: st.error, lastStatus: st.lastStatus, sidePane: st.sidePane,
      backend: backendBtn.style.display === 'none' ? null : backendBtn.textContent, blockedShown: blockedBar.style.display !== 'none', // P4
      trace: timeline.state(), traceBtn: traceBtn.textContent, recording: recEl.textContent, recordingOn: recEl.classList.contains('on'), // P5
      bound: isBound(), bindText: bindBtn.textContent, owners: dotsFor(st.target && st.target.profileId ? st.target.profileId : null).map((d) => ({ sessionId: d.sessionId, name: d.name, color: d.color })), // P7
      you: st.you, mine: st.mine, holder: st.holder, modeSince: st.modeSince, modeCause: st.modeCause, cursor: st.cursor ? { ...st.cursor } : null, cursorShown: cursorEl.style.display !== 'none', confirmations: [...st.confirmations.values()].map((c) => ({ ...c })), badge: modeBadge.textContent }),
  };
}

// ── P7 (§4.6): the title bar's own menu carries the bind act (reachable from the tab and the phone's long-press) ──
registerMenuItem({ menu: 'window', group: '1_window', order: 35, id: 'window/browser-bind', kind: 'bind', when: (c) => !!(c.win && c.win.type === 'browser-live' && c.win._browserLive), label: (c) => c.win._browserLive.bindLabel(), run: (c) => { c.win._browserLive.toggleBind(); } });

// ── P7 (§4.6): AUTO-BIND — a session's browser started (a NEW lease in the digest) and its window is open here ⇒ the live view is BORN inside that chain ──
export function autoBindLiveViews(app, prev, digest) {
  if (!prev || !digest || !Array.isArray(digest.leases)) return [];             // the first digest is a snapshot, not an event
  if (app.settings?.get('browser.autoBindLiveView') === false) return [];
  if (app.isMobile) return [];                                                   // a phone renders tabs only; the desktop client binds and the layout syncs
  const before = new Set((prev.leases || []).map((l) => l && `${l.profileId}|${l.sessionId}`));
  const opened = [];
  for (const l of digest.leases) {
    if (!l || !l.sessionId || !l.profileId || before.has(`${l.profileId}|${l.sessionId}`)) continue;
    const host = sessionWindowFor(app, l.sessionId);
    if (!host || host._hiddenByDesktop || host.isMinimized) continue;           // "its chat window is open" = on the desktop you are looking at
    const exists = [...app.wm.windows.values()].some((w) => w.type === 'browser-live' && w._browserLive && w._browserLive.state().sessionId === l.sessionId);
    if (exists) continue;
    const syncId = 'win-blive-' + l.sessionId;                                   // deterministic: two clients open ONE window, layout-sync sees the same id
    if (app.wm.windows.has(syncId)) continue;
    const w = openBrowserLive(app, { sessionId: l.sessionId, profileId: l.profileId, syncId, intoChain: { hostId: host.id, split: true, side: 'right' } });
    if (w) opened.push(w.id);
  }
  return opened;
}
export function installBrowserLive(App) {
  App.prototype.onBrowserDigestChanged = function (prev, digest) { return autoBindLiveViews(this, prev, digest); };
}

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) ── one window per (session, pane); N windows = N viewers on ONE upstream
registerWindowType({
  type: 'browser-live', label: 'Browser (live)',
  icon: svgIcon16('<rect x="1.5" y="2.5" width="13" height="10" rx="1.5"/><path d="M1.5 5.5h13M4 4h.01M6 4h.01"/><circle cx="8" cy="9" r="1.6"/>'),
  action: 'openBrowserLive', replay: (app, spec, { syncId } = {}) => app.openBrowserLive({ sessionId: spec.sessionId, profileId: spec.profileId || null, syncId }),
});

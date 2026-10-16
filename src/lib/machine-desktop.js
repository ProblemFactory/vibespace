// design 014 D1 (lane desktop-vnc-native, 2026-10-03): a Windows / macOS paired machine's WHOLE DESKTOP — the page side.
//
// Neither macOS nor Windows has X11, so their apps cannot get windows of their own; what both have is a whole-screen
// VNC server: the Mac's own Screen Sharing (switched on once in System Settings), a TightVNC service on Windows
// (installed once through the install dialog — Windows asks for administrator rights on that machine's screen). The
// hub reaches it on the machine's loopback through the agent (src/server/desktop-access.js openMachineDesktop, the
// `vnc-native` rung) and the ONE picture bridge relays it (stream id `machine-desktop.<hostId>`). Here: the machine's
// dialog (its state, "Open its desktop", the one-time setup, "Run on its desktop…") and the window.
//   • people only: the routes and the bridge refuse an agent token by name (`human_only`)
//   • the sign-in (the Mac user's name + password, or the VNC password) is asked HERE each time and handed to noVNC
//     only — it reaches the machine inside the RFB handshake the bridge relays as bytes; nothing keeps it
//   • the window says once what it is: everything on that machine's screen
//   • a whole desktop is a real monitor: the picture is SCALED into the window and the server is never asked to resize
//     (resizeSession off) — the fixed-size rule of app windows does not apply to it
//   • "Run on its desktop…": the exact command is shown before it runs and in the answer; the presets per platform +
//     the owner's 3 latest lines on that machine (this browser's localStorage — the owner's own lines only)
//   • lane machine-desktop-apps (owner 2026-10-11): the apps INSTALLED on the machine, listed ON it by witness (its
//     Start Menu + Uninstall keys / its /Applications — src/installed-apps.js through the device op), filtered here; a
//     press fills the command box with the row's launch line. The presets stay as "Examples", the owner's lines as
//     "Recent". The action row wraps and no button is ever narrower than its words
import { t } from './i18n.js';
import { createModalShell, fetchJson, showToast } from './utils.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { createVncView, streamUrl } from './vnc-view.js';
import { createStreamView } from './stream-view.js'; // lane stream-p1a-transport: the WebRTC rung's <video>, in this same shell
import { pageIsSecure } from './picture-shell.js';
import { keyboardLockGate, NAGLE_REFERENCE, SLOW_KBPS, STILL_MS } from '../desktop-quality.js'; // lane desktop-v2-latency
import { desktopRunPlan, desktopRunPresets, rememberRun, machineDesktopId } from '../machine-desktop-model.js';
import { namesGuiApp } from '../machine-window.js';
import { remoteappProgramOf } from '../remoteapp.js'; // lane remoteapp-r1a: the typed line → the program a RemoteApp starts
import { openRemoteappSettings } from './remoteapp-card.js'; // lane remoteapp-r1b: the machine's RemoteApp settings card
import { openMachineApp } from './machine-app.js'; // lane machine-app-crop: one app of the machine as its own window
import { screenMap, hdrShown, carryPick } from '../desktop-screens.js'; // lane desktop-v2-entry: the OS table + the RFB table → the displays in fb pixels
import { openDesktopPicker, rememberDesktop, rememberDisplays, readRecent } from './desktop-picker.js';
import { enterSubmits } from './chat-enter-keys.js';

const RUNS_KEY = 'vibespace.machineDesktopRuns'; // { [hostId]: [line…] } — the owner's latest lines per machine (≤ 3)
function readRuns() { try { const o = JSON.parse(localStorage.getItem(RUNS_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } }
function saveRun(hostId, line) { const o = readRuns(); o[hostId] = rememberRun(o[hostId], line); try { localStorage.setItem(RUNS_KEY, JSON.stringify(o)); } catch { /* storage refused: nothing remembered */ } }

const nameOf = (m) => String((m && (m.label || m.hostId)) || ''); // a host's name is peer-controlled text: textContent only
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
const btn = (cls, text, onclick) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; b.onclick = onclick; return b; };
const post = (url, body) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const NOTE = 'color:var(--text-secondary);font-size:12px;margin:6px 0';

/** The words of a machine row's state (the PURE row of GET /api/desktop/machines — src/desktop-apps.js desktopPickRow). */
export function desktopStateText(m) {
  const machine = nameOf(m);
  if (m.code === 'offline') return t('{machine} is offline', { machine });
  if (m.code === 'desktop_ready') return m.auth === 'ard' ? t('Ready — it asks for your Mac user name and password') : m.auth === 'user' ? t('Ready — it asks for a user name and password') : m.auth === 'none' ? t('Ready') : t('Ready — it asks for the VNC password');
  if (m.setup === 'darwin') return m.why === 'unsupported_auth' ? t('Screen Sharing answers, but only with a sign-in this viewer cannot speak — on the Mac, open Screen Sharing’s settings and turn on “VNC viewers may control screen with password”') : t('Set up once on the Mac: System Settings → General → Sharing → turn on Screen Sharing');
  return t('Set up once: install TightVNC Server on {machine} — it listens on that machine only', { machine });
}
/** A refused open / run, in words (by the route's code; its own sentence otherwise). */
export function desktopRefusalText(r, m) {
  const machine = nameOf(m);
  const c = r && r.code;
  if (c === 'no_vnc') return desktopStateText({ ...m, code: 'no_vnc', setup: r.platform || m.setup, why: r.vnc && r.vnc.code });
  if (c === 'host_unavailable' || c === 'unsupported-host') return t('{machine} is offline', { machine });
  if (c === 'human_only') return t('Only people can see or use a machine’s whole desktop');
  if (c === 'empty') return t('Type a command to run');
  if (c === 'too_long') return t('That command is too long (at most 1000 characters)');
  if (c === 'multi_line') return t('One line only — a line break would start a second command');
  if (c === 'hidden_chars') return t('The command holds an invisible character — retype it so what runs is what you see');
  if (c === 'run_failed') return t('The command did not start on {machine}', { machine });
  if (c === 'remoteapp_needs_setup') return t('RemoteApp needs {machine}’s Windows sign-in and its pinned certificate — set them once in RemoteApp settings…', { machine }); // lane remoteapp-r1b: its door is the settings card (the launcher opens it)
  if (c === 'rdp_session_busy') return t('{machine} already shows a RemoteApp session — Windows gives one remote session per machine; use that window or stop it first', { machine });
  return (r && r.error) || t('Could not reach {machine}', { machine });
}

/** The sign-in the machine's VNC server asks for — asked HERE, handed to noVNC only, kept nowhere. → creds | null */
function askCredentials(m, types, auth) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const machine = nameOf(m);
    const wantUser = Array.isArray(types) && types.includes('username');
    const { body, close } = createModalShell({ id: 'machine-desktop-signin', title: t('Sign in to {machine}', { machine }), dialogClass: 'machine-desktop-signin', escapeToClose: true, onClose: () => finish(null) });
    const form = document.createElement('form');
    form.append(el('p', NOTE, auth === 'ard' ? t('{machine} asks for your Mac user name and password. VibeSpace does not keep them.', { machine }) : wantUser ? t('{machine} asks for a user name and password. VibeSpace does not keep them.', { machine }) : t('{machine} asks for its VNC password. VibeSpace does not keep it.', { machine })));
    const field = (type, ph) => { const i = el('input', 'display:block;width:100%;box-sizing:border-box;margin:6px 0'); i.type = type; i.autocomplete = 'off'; i.spellcheck = false; i.placeholder = ph; form.append(i); return i; };
    const user = wantUser ? field('text', t('User name')) : null;
    const pass = field('password', t('Password'));
    const row = el('div'); row.className = 'desktop-install-actions';
    const go = btn('btn-create', t('Sign in'), null); go.type = 'submit';
    row.append(btn('file-tool-btn', t('Cancel'), () => close()), go);
    form.append(row);
    form.onsubmit = (e) => { e.preventDefault(); const v = { password: pass.value, ...(user ? { username: user.value } : {}) }; pass.value = ''; finish(v); close(); };
    body.append(form);
    setTimeout(() => (user || pass).focus(), 0);
  });
}

/** THE WINDOW: one per machine in this page (a second open reveals it); the picture through the ONE bridge. `display` = the
 *  display key to show (lane desktop-v2-entry; undefined = the one this browser chose last for the machine, null = all). */
export function openMachineDesktop(app, m, { display } = {}) {
  const id = machineDesktopId(m && m.hostId);
  if (!id) return null;
  for (const [wid, win] of app.wm.windows) if (win._machineDesktop === m.hostId) { app.wm.revealWindow(wid); if (display !== undefined) win._pickDisplay?.(display); return win; }
  app._hideWelcome?.();
  const machine = nameOf(m);
  const winInfo = app.wm.createWindow({ title: t('{machine} — its desktop', { machine }), type: 'machine-desktop' });
  winInfo._machineDesktop = m.hostId;
  const c = winInfo.content;
  c.style.display = 'flex'; c.style.flexDirection = 'column';
  // lane desktop-v2-entry (design q-030 §3): THE SWITCH STRIP replaces the line that said what the window is (its words are the
  // status chip's title now): [machine ▾] [display 1 · 2 · All] [⤢ Full screen] [Connected · 48 ms · 12 fps]; one row that
  // scrolls sideways on a phone
  const strip = el('div'); strip.className = 'desktop-strip';
  const hostBtn = btn('desktop-strip-btn desktop-strip-host', `${machine} ▾`, () => openDesktopPicker(app, { anchor: hostBtn, focusHost: m.hostId }));
  hostBtn.title = t('Switch machine');
  const seg = el('div'); seg.className = 'desktop-strip-displays'; seg.setAttribute('role', 'group'); seg.hidden = true;
  // lane desktop-v2-latency (design q-030 §4): full screen = the window's CONTENT (the strip + the picture); there, on a secure
  // page, navigator.keyboard.lock() hands Esc / Alt+Tab / the Windows key / ⌘ … to the machine while the ⌨ toggle is on
  c.classList.add('desktop-machine-content');
  const fullBtn = btn('desktop-strip-btn', '⤢ ' + t('Full screen'), () => { try { const p = document.fullscreenElement ? document.exitFullscreen() : c.requestFullscreen(); if (p && p.catch) p.catch(() => { }); } catch { /* no fullscreen here */ } });
  const hasLock = () => !!(typeof navigator !== 'undefined' && navigator.keyboard && typeof navigator.keyboard.lock === 'function');
  let wantKeys = true, locked = false;
  const keysBtn = btn('desktop-strip-btn desktop-strip-keys', '⌨ ' + t('Capture shortcuts'), () => {
    const g = keyboardLockGate({ secure: pageIsSecure(), api: hasLock(), fullscreen: true, want: true });
    if (g.why === 'insecure') { showToast(t('Capturing shortcuts needs VibeSpace opened at an https address — this page is http'), { type: 'warn' }); return; }
    if (g.why === 'no_api') { showToast(t('This browser cannot capture shortcuts — Chrome and Edge can'), { type: 'warn' }); return; }
    wantKeys = !wantKeys; lockKeys();
  });
  const drawKeys = () => {
    const g = keyboardLockGate({ secure: pageIsSecure(), api: hasLock(), fullscreen: true, want: wantKeys });
    keysBtn.setAttribute('aria-pressed', String(g.lock));
    keysBtn.classList.toggle('is-locked', locked);
    keysBtn.title = g.why === 'insecure' ? t('Capturing shortcuts needs VibeSpace opened at an https address — this page is http')
      : g.why === 'no_api' ? t('This browser cannot capture shortcuts — Chrome and Edge can')
        : t('In full screen, Esc, Alt+Tab, the Windows key / ⌘ and other shortcuts go to the machine; hold Esc for 2 s to leave full screen') + (g.lock ? '' : '\n' + t('Off — shortcuts stay with this computer'));
  };
  const lockKeys = () => {
    const g = keyboardLockGate({ secure: pageIsSecure(), api: hasLock(), fullscreen: document.fullscreenElement === c, want: wantKeys });
    if (g.lock && !locked) { locked = true; navigator.keyboard.lock().catch(() => { locked = false; drawKeys(); }); }
    else if (!g.lock && locked) { locked = false; try { navigator.keyboard.unlock(); } catch { /* gone with the page */ } }
    drawKeys();
  };
  const onFull = () => { lockKeys(); if (document.fullscreenElement === c) (stream || view)?.focus(); };
  document.addEventListener('fullscreenchange', onFull);
  drawKeys();
  const chip = el('span'); chip.className = 'desktop-strip-status';
  const scope = t('This window shows everything on {machine}’s screen, and what you type here goes to it.', { machine });
  chip.title = scope;
  // the ladder's rung (流畅 / 清晰 …) and the slow-link chip; the status chip opens the comparison row (today · the reference)
  const rungEl = el('span'); rungEl.className = 'desktop-strip-rung'; rungEl.hidden = true;
  const slowEl = el('span'); slowEl.className = 'desktop-strip-slow'; slowEl.hidden = true; slowEl.textContent = t('Slow link');
  // lane win-desktop-cursor-hdr (owner 2026-10-13 "HDR 特别白"): a display in Windows HDR is captured as it is (TightVNC does no
  // tone mapping, we do not transcode) — the bar says so with the remedy; only a measured `hdr: true` shows it
  const hdrEl = el('span'); hdrEl.className = 'desktop-strip-hdr'; hdrEl.hidden = true; hdrEl.textContent = t('HDR on · the picture looks washed out');
  hdrEl.title = t('Windows HDR is captured by TightVNC as it is, with no tone mapping; while you work remotely, turn off "Use HDR" in Windows Settings › Display (or press Win+Alt+B)');
  chip.setAttribute('role', 'button'); chip.tabIndex = 0;
  const cmp = el('div'); cmp.className = 'desktop-strip-compare'; cmp.hidden = true;
  chip.onclick = () => { cmp.hidden = !cmp.hidden; drawChip(); };
  chip.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chip.onclick(); } };
  strip.append(hostBtn, seg, fullBtn, keysBtn, chip, rungEl, slowEl, hdrEl);
  c.append(strip, cmp);
  const pane = el('div', 'position:relative;flex:1 1 auto;min-height:0'); c.append(pane);
  // the displays: the machine's own table (display-facts, once per window) + the server's -308 rects → the PURE screenMap
  const last = readRecent();
  let want = display !== undefined ? display : last && last.hostId === m.hostId ? last.display : null;
  rememberDesktop(m.hostId, want); // the Desktop picker's first row from now on (whichever door opened it)
  let facts = null, rfbTable = null, map = null, asked = false, link = null;
  const shown = () => (map && map.state === 'map' && want != null ? map.displays.find((d) => d.key === want) || null : null);
  const drawSeg = () => {
    if (!map || map.state !== 'map') { seg.hidden = true; seg.replaceChildren(); return; }
    const cur = shown();
    const segBtn = (label, key, title) => { const b = btn('desktop-strip-seg', label, () => pick(key)); b.title = title; b.dataset.key = key == null ? '' : key; b.setAttribute('aria-pressed', String((cur ? cur.key : null) === key)); return b; };
    seg.replaceChildren(...map.displays.map((d) => segBtn(String(d.n), d.key, d.name ? `${d.n} · ${d.name}` : t('Display {n}', { n: d.n }))), segBtn(t('All'), null, t('All')));
    seg.hidden = false;
  };
  const apply = () => { if (!view) return; const d = shown(); view.setCrop(d ? d.rect : null); drawSeg(); hdrEl.hidden = !hdrShown({ screens: facts && facts.ok ? facts.displays : null, map, key: d ? d.key : null }); };
  const pick = (key) => { want = key; rememberDesktop(m.hostId, key); apply(); };
  const remap = () => {
    const fb = view ? view.fbSize() : null; if (!fb) return;
    const prev = map;
    map = screenMap({ fb, screens: facts && facts.ok ? facts.displays : null, rfb: rfbTable });
    // lane heavy3-flake-races: the two tables land in either order and key a display differently — a pick made on the
    // first map stays on its display (the same place), never the whole screen when the names arrive
    const carried = carryPick(prev, map, want);
    if (carried !== want) { want = carried; rememberDesktop(m.hostId, want); }
    if (map.state === 'map') rememberDisplays(m.hostId, map.displays);
    apply(); drawChip();
  };
  const RUNG_WORDS = { sharp: () => t('Sharp'), balanced: () => t('Balanced'), fluid: () => t('Fluid'), lean: () => t('Lean') };
  const drawRung = () => {
    if (!view) { rungEl.hidden = true; slowEl.hidden = true; return; }
    const q = view.quality, st = view.stats();
    rungEl.hidden = !q || view.state !== 'connected';
    if (!q) { slowEl.hidden = true; return; }
    rungEl.textContent = RUNG_WORDS[q.rung]();
    rungEl.dataset.rung = q.rung;
    rungEl.title = [q.still ? t('Sharp while nothing moves; fluid again the moment you work in it') : t('Fluid while you work or the picture moves; sharp {ms} ms after it stops', { ms: STILL_MS }),
      t('Picture quality {q} · compression {c}', { q: q.qualityLevel, c: q.compressionLevel })].join('\n');
    slowEl.hidden = !q.slow || view.state !== 'connected';
    slowEl.title = t('This link measured {kbps} kbps — under {bound} kbps the picture is one step leaner', { kbps: st.kbps == null ? '—' : st.kbps, bound: SLOW_KBPS });
  };
  // lane win-desktop-cursor-hdr: which path draws the machine's pointer (the stats row and the chip's title say it)
  const cursorWords = () => {
    const c = view && view.cursor;
    if (!c) return '';
    if (c.path === 'server') return t('Pointer: painted by the machine into the picture — its {px} px pointer is too big to draw here', { px: c.side });
    if (c.path === 'scaled') return t('Pointer: drawn here at {pct} % of its {px} px, with the picture', { pct: Math.round(c.factor * 100), px: c.side });
    return t('Pointer: drawn here at its own {px} px', { px: c.side });
  };
  const drawChip = () => {
    drawRung();
    if (stream) { drawStream(); return; }
    if (!view || view.state !== 'connected') { chip.textContent = ''; chip.title = scope; cmp.hidden = true; return; }
    const st = view.stats();
    const ms = link && link.hub != null ? link.hub + (link.device || 0) : null;
    chip.textContent = t('Connected · {ms} ms · {fps} fps', { ms: ms == null ? '—' : ms, fps: st.fps });
    chip.title = [scope, t('Browser ⇄ hub {a} ms · hub ⇄ machine {b} ms · update round trip {c} ms · {fps} fps', { a: link && link.hub != null ? link.hub : '—', b: link && link.device != null ? link.device : '—', c: st.roundTripMs == null ? '—' : st.roundTripMs, fps: st.fps }),
      map && map.state === 'unknown' && facts && facts.ok && facts.displays.length > 1 ? t('The layout of its displays could not be read — the whole screen is shown') : '', cursorWords(), refusedWhy ? t('Not streamed: {why}', { why: refusedWhy }) : ''].filter(Boolean).join('\n');
    if (!cmp.hidden) {
      cmp.replaceChildren(
        el('div', null, t('Now: browser ⇄ hub {a} ms · hub ⇄ machine {b} ms · update round trip {c} ms · {fps} fps · {kbps} kbps', { a: link && link.hub != null ? link.hub : '—', b: link && link.device != null ? link.device : '—', c: st.roundTripMs == null ? '—' : st.roundTripMs, fps: st.fps, kbps: st.kbps == null ? '—' : st.kbps })),
        el('div', null, t('Recorded reference: a key press through the same hops took {before} ms before the no-delay fix and {after} ms after (median)', { before: NAGLE_REFERENCE.beforeMs.toFixed(1), after: NAGLE_REFERENCE.afterMs.toFixed(2) })),
        ...(cursorWords() ? [el('div', null, cursorWords())] : []));
    }
  };
  const measure = async () => { const t0 = performance.now(); const r = await fetchJson(`/api/desktop/machine-desktop/link?host=${encodeURIComponent(m.hostId)}`); if (!r || r.error) return; link = { hub: Math.max(0, Math.round(performance.now() - t0 - (r.took || 0))), device: r.device }; drawChip(); };
  let tick = null, n = 0, view = null, stream = null;
  const startVnc = () => {
    view = createVncView(pane, {
      url: streamUrl(`/api/desktop/${id}/stream`),
      autoReconnect: true,
      resizeSession: false,
      channel: true,
      ladder: true, // lane desktop-v2-latency: fluid while moving, sharp when still
      pasteKeys: true, // lane desktop-v2-latency: Ctrl/⌘+V sends this computer's clipboard text, then the V
      onQuality: () => drawRung(),
      onScreens: (sc) => { rfbTable = sc; remap(); },
      onStatus: (state) => {
        if (state === 'connected') {
          if (!asked) { asked = true; fetchJson(`/api/desktop/machine-desktop/displays?host=${encodeURIComponent(m.hostId)}`).then((r) => { facts = r || null; remap(); }); }
          remap();
          if (!tick) tick = setInterval(() => { drawChip(); if (++n % 3 === 1) measure(); }, 1000);
        } else { clearInterval(tick); tick = null; }
        drawChip();
      },
      ...machineViewOpts(m),
    });
    winInfo._desktopView = view;
    view.connect();
  };
  // lane stream-p1a-transport (design q-041 r2 §2 客户端): THE WEBRTC RUNG first — when the machine passes it (its agent streams,
  // a source: src/server/desktop-access.js streamRung) the picture is a <video> in this same shell, its numbers on the strip
  // (getStats: RTT · jitter · fps · decode · kbps, and "via the hub" when the relay carries it); a refusal (an older agent, no
  // screen source yet) quietly shows the VNC picture, a failure AFTER the stream started shows it too and says why
  const streamEl = el('span'); streamEl.className = 'desktop-strip-stream'; streamEl.hidden = true;
  const noteEl = el('span'); noteEl.className = 'desktop-strip-note'; noteEl.hidden = true;
  strip.append(streamEl, noteEl);
  let noteTimer = null, refusedWhy = '';
  const note = (text, title, ms = 0) => { clearTimeout(noteTimer); noteEl.textContent = text; noteEl.title = title || text; noteEl.hidden = !text; if (ms) noteTimer = setTimeout(() => { noteEl.hidden = true; }, ms); };
  const STREAM_WHY = {
    ice_failed: () => t('the connection failed'), ice_disconnected: () => t('the connection dropped'), connect_timeout: () => t('it did not connect in time'),
    answer_failed: () => t('the browser and the machine could not agree'), restart_failed: () => t('it could not reconnect'), link_lost: () => t('the machine’s link dropped'),
    agent_too_old: () => t('the machine’s agent cannot stream yet — update it'), no_screen_source: () => t('the machine’s agent cannot capture its screen yet'),
    too_many_streams: () => t('the machine already streams to two windows'), offer_failed: () => t('the machine could not start it'),
  };
  const streamWords = (code) => (STREAM_WHY[code] ? STREAM_WHY[code]() : t('the machine ended it ({code})', { code: code || '?' }));
  const ms = (v) => (v == null ? '—' : v);
  const drawStream = () => {
    const p = stream ? stream.stats() : null, a = stream ? stream.agent() : null;
    const playing = !!stream && stream.state === 'playing';
    streamEl.hidden = !playing;
    chip.textContent = playing ? t('Stream · {ms} ms · {fps} fps', { ms: ms(p && p.rttMs), fps: ms(p && p.fps) }) : t('Stream · connecting…');
    if (!p) return;
    streamEl.textContent = t('RTT {rtt} ms · jitter {jitter} ms · {fps} fps · decode {decode} ms · {kbps} kbps', { rtt: ms(p.rttMs), jitter: ms(p.jitterMs), fps: ms(p.fps), decode: ms(p.decodeMs), kbps: ms(p.kbps) }) + (p.path === 'relay' ? ' · ' + t('via the hub') : '');
    streamEl.dataset.path = p.path || '';
    chip.title = [scope, t('WebRTC from the machine’s agent: {w}×{h}, sent {sent} fps at {kbps} kbps', { w: ms(p.width), h: ms(p.height), sent: ms(a && a.fps), kbps: ms(a && a.kbps) })].join('\n');
  };
  const inputWords = (ref) => {
    const code = ref && ref.code;
    if (!code) return;
    note(code === 'uipi_blocked' ? t('Windows keeps input away from an administrator window — click another window on the machine first')
      : code === 'input_unsupported' ? t('This machine cannot take input over the stream yet')
        : t('The machine did not take that input ({code})', { code }), null, 8000);
  };
  const startStream = () => {
    stream = createStreamView(pane, {
      hostId: m.hostId,
      hostPlatform: m.setup || null,
      onStatus: () => { drawChip(); if (!tick) tick = setInterval(() => { drawChip(); }, 1000); },
      onStats: () => drawChip(),
      onInput: inputWords,
      onFallback: (code, why, taken) => {
        stream = null; streamEl.hidden = true; clearInterval(tick); tick = null;
        refusedWhy = STREAM_WHY[code] ? streamWords(code) : why || streamWords(code); // the page words a known code in its own language; else the machine's sentence
        if (taken) note(t('Stream stopped ({why}) — showing the VNC picture', { why: streamWords(code) }), why || code);
        chip.title = [scope, t('Not streamed: {why}', { why: refusedWhy })].join('\n');
        startVnc();
      },
    });
    winInfo._streamView = stream;
    stream.connect();
  };
  winInfo._pickDisplay = (key) => pick(key);
  winInfo.onClose = () => { clearInterval(tick); clearTimeout(noteTimer); document.removeEventListener('fullscreenchange', onFull); if (locked) { locked = false; try { navigator.keyboard.unlock(); } catch { /* gone */ } } if (stream) stream.dispose(); if (view) view.dispose(); };
  if (typeof RTCPeerConnection === 'function') startStream(); else startVnc();
  return winInfo;
}

/** The machine's picture options both windows share (the whole desktop's and one app's — lane machine-app-crop): the bridge's
 *  last close, the connect gate (the machine reached, its VNC server answering) and the sign-in asked here each time. */
function machineViewOpts(m) {
  let auth = m.auth || null;
  return {
    lastClose: async () => { const r = await fetchJson(`/api/desktop/machine-desktop/last-close?host=${encodeURIComponent(m.hostId)}`); return r && !r.error ? r.close : null; },
    before: async () => { const r = await post('/api/desktop/machine-desktop/connect', { host: m.hostId }); if (!r || r.error) return { ok: false, error: desktopRefusalText(r, m) }; auth = r.auth || auth; return { ok: true }; },
    credentials: (types) => askCredentials(m, types, auth),
  };
}
/** lane machine-app-crop: "Run as its own window…" — the line confirmed as itself, run with the launch report, then the
 *  app's own window (src/lib/machine-app.js) follows the window that process opens. → the answer | null (cancelled) */
export async function runAsAppWindow(app, m, line) {
  const plan = desktopRunPlan(m.setup, line);
  if (!plan.ok) { showToast(desktopRefusalText({ code: plan.code, error: plan.error }, m), { type: 'error' }); return null; }
  if (!(await confirmRun(m, line))) return null;
  const r = await post('/api/desktop/machine-desktop/run', { host: m.hostId, cmd: line, window: true });
  if (!r || r.error) { showToast(desktopRefusalText(r, m), { type: 'error' }); return null; }
  saveRun(m.hostId, line);
  openMachineApp(app, m, { cmd: line, track: { launched: r.launched || null }, view: machineViewOpts(m), openDesktop: () => openMachineDesktop(app, m), runAgain: () => runAsAppWindow(app, m, line) });
  return r;
}

/** The command, shown as itself, before it runs. → true | false */
function confirmRun(m, line) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const machine = nameOf(m);
    const { body, close } = createModalShell({ id: 'machine-desktop-confirm', title: t('Run on {machine}’s desktop?', { machine }), dialogClass: 'machine-desktop-confirm', escapeToClose: true, onClose: () => finish(false) });
    const pre = el('pre', null, line); pre.className = 'desktop-install-pre machine-desktop-shown';
    const row = el('div'); row.className = 'desktop-install-actions';
    row.append(btn('file-tool-btn', t('Cancel'), () => close()), btn('btn-create', t('Run'), () => { finish(true); close(); }));
    body.append(el('p', NOTE, t('This exact command starts on {machine}’s desktop, as its signed-in user:', { machine })), pre, row);
  });
}

/** A row's source, in words (the OS record it came from). */
const SOURCE_WORDS = { 'start-menu': () => t('Start menu'), uninstall: () => t('Installed programs'), applications: () => t('Applications'), install: () => t('just installed — being listed') };
/**
 * THE MACHINE'S INSTALLED APPS (lane machine-desktop-apps): `set(answer)` draws GET /api/desktop/machine-desktop/apps'
 * answer — `{rows, total, truncated, code?}` (+ `loading` while it is asked); the filter narrows by name. Rows are
 * KEYED by their launch line (a pending row by its name): a re-list moves the existing nodes, never rebuilds them.
 * A press hands the row's launch line to `onPick` — the run door judges it like any typed line.
 */
function installedList(m, { onPick }) {
  const box = el('div'); box.className = 'machine-apps';
  const head = el('div'); head.className = 'machine-apps-head';
  const title = el('span'); title.className = 'machine-apps-title';
  const filter = el('input'); filter.type = 'search'; filter.className = 'machine-apps-filter'; filter.spellcheck = false; filter.autocomplete = 'off';
  filter.placeholder = t('Filter'); filter.setAttribute('aria-label', t('Filter the installed apps'));
  head.append(title, filter);
  const note = el('p'); note.className = 'machine-apps-note';
  const list = el('div'); list.className = 'machine-apps-list'; list.setAttribute('role', 'list');
  box.append(head, note, list);
  const nodes = new Map(); // key → the row's button
  let ans = { rows: [], loading: true }, off = false;
  function draw() {
    const machine = nameOf(m);
    const rows = Array.isArray(ans.rows) ? ans.rows : [];
    const q = filter.value.trim().toLowerCase();
    const shown = q ? rows.filter((r) => String(r.name).toLowerCase().includes(q)) : rows;
    title.textContent = t('Installed on {machine} ({n})', { machine, n: rows.length });
    const words = ans.loading ? t('Listing the apps on {machine}…', { machine })
      : ans.code === 'host_needs_daemon' ? t('The list needs {machine}’s VibeSpace agent updated (it updates itself; check again in a minute)', { machine })
      : ans.code === 'offline' ? (rows.length ? t('{machine} is offline — this is the list it gave last', { machine }) : t('{machine} is offline', { machine }))
      : ans.code ? t('{machine} could not list its apps: {why}', { machine, why: String(ans.error || ans.code).slice(0, 200) })
      : !rows.length ? t('No apps found on {machine}', { machine })
      : ans.truncated ? t('{machine} has {total} apps — the first {n} are listed; filter to find one', { machine, total: ans.total, n: rows.length })
      : q && !shown.length ? t('Nothing matches “{q}”', { q: filter.value.trim() }) : '';
    note.textContent = words;
    note.classList.toggle('is-bad', ans.code === 'host_needs_daemon' || (!!ans.code && ans.code !== 'offline'));
    filter.hidden = !rows.length;
    const keyOf = (r) => r.launch || `pending:${r.name}`;
    const listed = new Set(rows.map(keyOf)), visible = new Set(shown.map(keyOf));
    for (const [key, b] of nodes) if (!listed.has(key)) { b.remove(); nodes.delete(key); } else if (!visible.has(key)) b.remove(); // filtered out: detached, kept
    for (const r of shown) {
      const key = keyOf(r);
      let b = nodes.get(key);
      if (!b) {
        b = document.createElement('button'); b.type = 'button'; b.className = 'machine-apps-row'; b.setAttribute('role', 'listitem');
        b.append(el('span'), el('span')); b.firstChild.className = 'machine-apps-name'; b.lastChild.className = 'machine-apps-src';
        nodes.set(key, b);
      }
      b.firstChild.textContent = r.name;
      b.lastChild.textContent = (SOURCE_WORDS[r.source] || (() => ''))();
      b.title = r.launch || '';
      b.disabled = off || !r.launch;
      b.onclick = () => { if (r.launch) onPick(r.launch); };
      list.append(b); // in order: an existing node moves
    }
    list.hidden = !shown.length;
  }
  filter.oninput = () => draw();
  return { el: box, set(next) { ans = next || { rows: [] }; draw(); }, get: () => ans, disable(v) { off = !!v; draw(); } };
}

/**
 * THE MACHINE'S DIALOG (the launcher opens it for a Windows / macOS row): its state, "Open its desktop", the one-time
 * setup (the Mac's words; Windows' Install… through the launcher's install dialog, `install`), and "Run on its
 * desktop…" — the machine's installed apps, then the Examples / Recent lines, then the command box. `recheck(hostId)`
 * re-reads the machine rows (the probe runs again — an explicit act, never a timer); Check again also lists the
 * machine's apps again (on the machine, now).
 */
export function showMachineDesktopDialog(app, m0, { install = null, recheck = null, closeOpener = null } = {}) {
  let m = m0;
  const machine = nameOf(m);
  const { body, close: closeDialog } = createModalShell({ id: 'machine-desktop-dialog', title: t('{machine} — its desktop', { machine }), dialogClass: 'machine-desktop-dialog', escapeToClose: true });
  // inc-mv51w0ow-crw3 (owner: "选择打开桌面之后不会自动关闭无关对话框直接展示桌面连接窗口"): a press that opens a window closes
  // this dialog AND the one it was opened from (the Apps dialog, `closeOpener`) — the window is what the person asked to see
  const toWindow = () => { closeDialog(); try { closeOpener?.(); } catch { /* the opener is gone already */ } };
  const state = el('p', 'margin:4px 0'); state.className = 'machine-desktop-state';
  const acts = el('div'); acts.className = 'desktop-install-actions';
  const scope = el('p', NOTE, t('Its desktop shows everything on {machine}’s screen, and what you type there goes to it. Only people can open it — agents cannot.', { machine }));
  const runHead = el('div', 'margin-top:12px;font-weight:600', t('Run on its desktop…'));
  const input = el('input', 'flex:1 1 120px;min-width:0;font-family:var(--font-mono, monospace)'); input.type = 'text'; input.spellcheck = false; input.autocomplete = 'off'; input.className = 'machine-desktop-cmd';
  const apps = installedList(m, { onPick: (line) => { input.value = line; pickDefault(); input.focus(); } });
  const presets = el('div'); presets.className = 'machine-apps-chips';
  const runRow = el('div', 'display:flex;flex-wrap:wrap;gap:6px'); // lane remoteapp-r1a: three buttons on a phone wrap below the line (the line keeps 120 px)
  const runBtn = btn('btn-create', t('Run…'), () => run());
  // lane machine-app-crop: "Run as its own window…" beside "Run…" — the DEFAULT (the filled button, Enter) when the line names a
  // GUI app (`open -a …` / `start "" …`); the whole-desktop run stays as it was
  const winBtn = btn('file-tool-btn', t('Run as its own window…'), () => run({ window: true }));
  // lane remoteapp-r1a (design q-024 §1.1): "RemoteApp…" beside it on a Windows machine — the app as a REAL window through Remote
  // Desktop (this machine's xfreerdp on its own xpra display). Offered, never greyed: what the machine still lacks comes back as
  // the launch's answer, in words (R1a: its sign-in + certificate fingerprint — the settings card is the next version)
  const raBtn = m.setup === 'win32' ? btn('file-tool-btn', t('RemoteApp…'), () => remoteApp()) : null;
  if (raBtn) { raBtn.title = t('Open the app as a real window through Remote Desktop (Windows Pro or Enterprise)'); raBtn.className = 'file-tool-btn machine-remoteapp-btn'; }
  for (const b of [winBtn, raBtn, runBtn]) if (b) b.style.cssText = 'width:auto;padding:0 10px;flex:0 0 auto;white-space:nowrap';
  const asWindow = () => namesGuiApp(m.setup, input.value);
  const pickDefault = () => { const w = asWindow(); winBtn.className = w ? 'btn-create' : 'file-tool-btn'; runBtn.className = w ? 'file-tool-btn' : 'btn-create'; };
  input.addEventListener('input', pickDefault);
  runRow.append(input, winBtn, ...(raBtn ? [raBtn] : []), runBtn);
  body.append(state, acts, scope, runHead, apps.el, presets, runRow, el('p', NOTE, t('It starts on {machine}’s desktop as you — the exact command is shown before it runs.', { machine })));
  let asked = 0; // the newest listing asked (an older answer never overwrites a newer one)
  const listApps = async (fresh) => {
    const mine = ++asked;
    apps.set({ ...apps.get(), loading: true });
    const r = await fetchJson(`/api/desktop/machine-desktop/apps?host=${encodeURIComponent(m.hostId)}${fresh ? '&fresh=1' : ''}`);
    if (mine !== asked || !body.isConnected) return;
    apps.set(r && Array.isArray(r.rows) ? r : { rows: apps.get().rows || [], code: (r && r.code) || 'list_failed', error: (r && r.error) || t('server unreachable') }); // a list answer may carry a code (an old agent, offline) — its rows are still the list
  };
  const check = async () => {
    const listed = listApps(true);
    if (recheck) { const next = await recheck(m.hostId); if (next && body.isConnected) { m = next; render(); } }
    await listed;
  };
  function render() {
    state.textContent = desktopStateText(m);
    state.style.color = m.code === 'desktop_ready' ? '' : 'var(--warning, #d9822b)';
    acts.replaceChildren();
    // lane desktop-v2-entry (design q-030 D1): a machine's whole desktop lives under the Desktop button now — this dialog keeps
    // launching apps, and its link says where the desktop lives; a press still shows the window at once (inc-mv51w0ow-crw3)
    // and makes it the Desktop picker's recent choice
    if (m.code === 'desktop_ready') acts.append(btn('desktop-open-link', t('Open its desktop → Desktop'), () => { toWindow(); openMachineDesktop(app, m); }));
    if (m.code === 'no_vnc' && m.setup === 'win32' && install) acts.append(btn('btn-create', t('Install TightVNC Server…'), () => install(m, { what: 'tightvnc', onDone: () => check() })));
    if (m.code !== 'offline' && recheck) acts.append(btn('file-tool-btn', t('Check again'), () => check()));
    if (m.setup === 'win32') { const rs = btn('file-tool-btn machine-remoteapp-settings', t('RemoteApp settings…'), () => openRemoteappSettings(app, m)); rs.title = t('Set up RemoteApp once for this Windows machine: its sign-in and its certificate'); acts.append(rs); } // lane remoteapp-r1b: never greyed — offline, the card says so
    const offline = m.code === 'offline';
    input.disabled = offline; runBtn.disabled = offline; winBtn.disabled = offline; if (raBtn) raBtn.disabled = offline; apps.disable(offline); pickDefault();
    const list = desktopRunPresets(m.setup, readRuns()[m.hostId]);
    input.placeholder = list.length ? t('A command, e.g. {example}', { example: list[0].cmd }) : t('A command');
    const chip = (p) => { const b = btn('file-tool-btn machine-apps-chip', p.label, () => { input.value = p.cmd; pickDefault(); input.focus(); }); b.title = p.cmd; b.disabled = offline; return b; };
    const group = (label, ps) => { if (!ps.length) return null; const g = el('div'); g.className = 'machine-apps-group'; g.append(el('span', null, label), ...ps.map(chip)); return g; };
    presets.replaceChildren(...[group(t('Recent'), list.filter((p) => p.remembered)), group(t('Examples'), list.filter((p) => !p.remembered))].filter(Boolean));
  }
  async function run({ window: own = false } = {}) {
    const line = input.value;
    if (own) { winBtn.disabled = true; const r = await runAsAppWindow(app, m, line); winBtn.disabled = false; if (r) toWindow(); else if (body.isConnected) render(); return; } // the app's window is what the person wants to see now
    const plan = desktopRunPlan(m.setup, line); // the hub judges it again (the same PURE rule)
    if (!plan.ok) { showToast(desktopRefusalText({ code: plan.code, error: plan.error }, m), { type: 'error' }); return; }
    if (!(await confirmRun(m, line))) return;
    runBtn.disabled = true;
    const r = await post('/api/desktop/machine-desktop/run', { host: m.hostId, cmd: line });
    runBtn.disabled = false;
    if (!r || r.error) { showToast(desktopRefusalText(r, m), { type: 'error' }); return; }
    saveRun(m.hostId, line);
    if (body.isConnected) render();
    showToast(t('Started on {machine}: {cmd}', { machine, cmd: r.shown }));
  }
  /** lane remoteapp-r1a: the line's program (src/remoteapp.js remoteappProgramOf) as a RemoteApp of this machine — the hub
   *  judges the request and the machine's setup; a started session opens as this machine's desktop-app window. */
  async function remoteApp() {
    const { program, args } = remoteappProgramOf(input.value);
    raBtn.disabled = true;
    const r = await post('/api/desktop/machine-desktop/remoteapp', { host: m.hostId, program, args });
    raBtn.disabled = false;
    if (!r || r.error) { showToast(desktopRefusalText(r, m), { type: 'error' }); if (r && r.code === 'remoteapp_needs_setup') openRemoteappSettings(app, m); return; } // lane remoteapp-r1b: the refusal's door, opened
    showToast(t('Opening {app} from {machine} through RemoteApp…', { app: r.label || program, machine }));
    toWindow();
    app.openDesktopApp(r.id);
  }
  input.onkeydown = (e) => { if (enterSubmits(e)) { e.preventDefault(); run({ window: asWindow() }); } };
  render();
  listApps(false);
}

// ── WINDOW-TYPE REGISTRATION ── not persisted: a reload never re-opens a machine's whole screen (it asks the sign-in)
registerWindowType({ type: 'machine-desktop', label: 'Machine desktop', persist: false, icon: svgIcon16('<rect x="1.5" y="2.5" width="13" height="9" rx="1"/><path d="M8 11.5V14M5 14h6M4 5.5h8"/>') });

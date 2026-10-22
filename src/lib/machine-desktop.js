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
//   • lane desktop-vnc-remember (owner 2026-10-19): …unless the person ticks 「记住这台机器的登录」 — then, once the machine took
//     it, it is sent to the hub ONCE and sealed in the vault, and the HUB signs in from then on (src/server/rfb-signin.js: the
//     page never gets it back); a refused one reopens the dialog saying so, a locked vault says so; 「忘掉登录」 in the dialog
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
import { createModalShell, fetchJson, showToast, copyText, showContextMenu } from './utils.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { createVncView, streamUrl } from './vnc-view.js';
import { createStreamView } from './stream-view.js'; // lane stream-p1a-transport: the WebRTC rung's <video>, in this same shell
import { createStreamStats } from './stream-stats.js'; // lane stream-window-fixes: THE stats row — shared with one window's stream
import { createStreamPill } from './stream-pill.js'; // lane stream-stats-popup: TRUE full screen — the strip floats over the picture as a pill
import { pageIsSecure } from './picture-shell.js';
import { keyboardLockGate, NAGLE_REFERENCE, SLOW_KBPS, STILL_MS } from '../desktop-quality.js'; // lane desktop-v2-latency
import { desktopRunPlan, desktopRunPresets, rememberRun, machineDesktopId } from '../machine-desktop-model.js';
import { namesGuiApp } from '../machine-window.js';
import { remoteappProgramOf } from '../remoteapp.js'; // lane remoteapp-r1a: the typed line → the program a RemoteApp starts
import { openRemoteappSettings } from './remoteapp-card.js'; // lane remoteapp-r1b: the machine's RemoteApp settings card
import { openMachineApp, openWindowPicker } from './machine-app.js'; // lane machine-app-crop: one app of the machine as its own window; lane stream-p2w-build: one of its windows as a stream
import { screenMap, hdrShown, carryPick } from '../desktop-screens.js'; // lane desktop-v2-entry: the OS table + the RFB table → the displays in fb pixels
import { openDesktopPicker, rememberDesktop, rememberDisplays, readRecent } from './desktop-picker.js';
import { createDisplayPanes, rememberedMode, rememberMode, deviceTag, isPhone, modeOf, displayRows, displayName, displayLabel, sumStats, stillOf, MODE_WORDS, MODE_ICONS, modeRowHtml } from './machine-displays.js'; // lane desktop-display-modes: a machine's several displays — the three modes
import { enterSubmits } from './chat-enter-keys.js';
import { endingVerdict, NEVER_SILENT } from '../stream-model.js'; // lane stream-fallback-never-silent: a played stream never falls to the VNC picture by itself
import { createHandover } from './machine-desktop-handover.js'; // lane desktop-handover: 「交给 agent」 — the stream to ONE agent conversation
import { createMicToggle, createMicCard, createSoundToggle, createSoundCard } from './stream-mic-strip.js'; // lane stream-mic-road: 「麦克风」 — the viewer's voice to the machine's apps; lane speaker-passthrough-v1: 「声音」 — the machine's sound here
import { micDefaultDoors, micRoadWords } from '../mic-model.js'; // lane stream-mic-road: the Machines card's microphone row
import { HDR_DECODE_QUERY, DYNAMIC_RANGE_QUERY, hdrViewerVerdict, hdrMachineVerdict, HDR_KEY, hdrRemembered, rememberHdr } from '../hdr-viewer.js'; // lane stream-hdr-passthrough: 「HDR 直通」

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

/** The sign-in the machine's VNC server asks for — asked HERE and handed to noVNC; kept nowhere UNLESS the person ticks
 *  「记住这台机器的登录」 (lane desktop-vnc-remember: then the sentence says so). `sign` = the hub's word on this machine
 *  (GET …/signins: `refused` — the remembered one did not work, the tick stays on · `locked` — the vault is: no tick, it is
 *  said · `can` — the hub can sign in to this machine itself: only then is the tick offered). → creds (+ remember) | null */
function askCredentials(m, types, auth, sign = null) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const machine = nameOf(m);
    const wantUser = Array.isArray(types) && types.includes('username');
    const s = sign || {};
    const { body, close } = createModalShell({ id: 'machine-desktop-signin', title: t('Sign in to {machine}', { machine }), dialogClass: 'machine-desktop-signin', escapeToClose: true, onClose: () => finish(null) });
    const form = document.createElement('form');
    const words = (kept) => (auth === 'ard'
      ? (kept ? t('{machine} asks for your Mac user name and password. VibeSpace seals them in the vault and signs in by itself while the vault is unlocked.', { machine }) : t('{machine} asks for your Mac user name and password. VibeSpace does not keep them.', { machine }))
      : wantUser ? t('{machine} asks for a user name and password. VibeSpace does not keep them.', { machine }) // a name + password the hub cannot answer itself: never ticked
        : (kept ? t('{machine} asks for its VNC password. VibeSpace seals it in the vault and signs in by itself while the vault is unlocked.', { machine }) : t('{machine} asks for its VNC password. VibeSpace does not keep it.', { machine })));
    const said = el('p', NOTE); said.className = 'machine-desktop-signin-said';
    form.append(said);
    if (s.refused) { const w = el('p', 'color:var(--warning, #d9822b);font-size:12px;margin:6px 0', t('The remembered password did not work — type it again')); w.className = 'machine-desktop-signin-refused'; form.append(w); }
    const field = (type, ph) => { const i = el('input', 'display:block;width:100%;box-sizing:border-box;margin:6px 0'); i.type = type; i.autocomplete = 'off'; i.spellcheck = false; i.placeholder = ph; form.append(i); return i; };
    const user = wantUser ? field('text', t('User name')) : null;
    const pass = field('password', t('Password'));
    let keep = null;
    if (s.locked) { const w = el('p', NOTE, t('The vault is locked — unlock it to sign in automatically')); w.className = 'machine-desktop-signin-locked'; const where = el('p', NOTE, t('Unlock… at the top of the page; For you names what is waiting on it')); where.className = 'machine-desktop-signin-locked-where'; form.append(w, where); } // the owner's words verbatim (test-desktop-signin-chrome ④), the two facts on their own line beside them (test-vault-words)
    else if (s.can) {
      const lab = el('label', 'margin:6px 0'); lab.className = 'dialog-check-row machine-desktop-signin-keep'; // the house checkbox row (the box beside its words)
      keep = document.createElement('input'); keep.type = 'checkbox'; keep.checked = !!s.refused; // a refused one was remembered before: the tick stays on
      keep.onchange = () => { said.textContent = words(keep.checked); };
      lab.append(keep, el('span', null, t('Remember this machine’s sign-in')));
      form.append(lab);
    }
    said.textContent = words(!!(keep && keep.checked));
    const row = el('div'); row.className = 'desktop-install-actions';
    const go = btn('btn-create', t('Sign in'), null); go.type = 'submit';
    row.append(btn('file-tool-btn', t('Cancel'), () => close()), go);
    form.append(row);
    form.onsubmit = (e) => { e.preventDefault(); const v = { password: pass.value, ...(user ? { username: user.value } : {}), ...(keep && keep.checked ? { remember: true } : {}) }; pass.value = ''; finish(v); close(); };
    body.append(form);
    setTimeout(() => (user || pass).focus(), 0);
  });
}
/** lane desktop-vnc-remember: the sign-in the machine just TOOK, sent to the hub ONCE to be sealed (the answer is the row's
 *  state, never the sign-in) — the toast says it was remembered, or why not. */
async function rememberSignin(m, creds) {
  const machine = nameOf(m);
  const r = await post('/api/desktop/machine-desktop/signin', { host: m.hostId, ...creds });
  if (r && !r.error) { showToast(t('{machine}’s sign-in remembered — sealed in the vault', { machine })); return; }
  showToast(r && r.code === 'vault_locked' ? `${t('The vault is locked — unlock it to sign in automatically')} — ${t('Unlock… at the top of the page; For you names what is waiting on it')}` : t('Could not remember the sign-in: {why}', { why: (r && r.error) || t('server unreachable') }), { type: 'error' });
}

/** THE WINDOW: the picture through the ONE bridge (VNC) or the machine's agent (the stream). `display` = the VNC picture's
 *  display key to show (lane desktop-v2-entry; undefined = the one this browser chose last for the machine, null = all).
 *  lane desktop-display-modes — a machine with several displays streams in THREE modes (src/desktop-displays-layout.js), the
 *  window's and remembered per machine in this browser: `mode` 'switch' ③ (ONE window, the switcher restarts the stream on
 *  another display — a phone's only mode) | 'windows' ① (a window PER display; `streamDisplay` = its display's id) | 'all' ②
 *  (every display in ONE window, laid out as on the machine); undefined = the remembered one. ③ / ② = the machine's one window
 *  (a second open reveals it), ① = a display's own window (revealed; a door naming no display re-opens every remembered one).
 *  `syncId` = a REPLAYED window (its openSpec: a reload, another client) — always its own window; it streams at once only for
 *  the device that opened it (`restored` = another one's: one press shows it here), and never asks a sign-in by itself. */
export function openMachineDesktop(app, m, { display, mode: askedMode, streamDisplay: askedDisplay, syncId = null, restored = false } = {}) {
  const id = machineDesktopId(m && m.hostId);
  if (!id) return null;
  const phone = isPhone(app);
  const mem = rememberedMode(m.hostId);
  let mode = modeOf(askedMode !== undefined ? askedMode : mem.mode, { phone });
  if (syncId && app.wm.windows.has(syncId)) { app.wm.revealWindow(syncId, { replay: true }); return app.wm.windows.get(syncId); }
  if (!syncId) {
    const mine = [...app.wm.windows.values()].filter((w) => w._machineDesktop === m.hostId);
    if (mode === 'windows') {
      if (askedDisplay === undefined && mem.displays.length > 1) { // the door that names no display: every display ① had a window for
        let first = null;
        for (const d of mem.displays) { const w = openMachineDesktop(app, m, { display, mode, streamDisplay: d }); first = first || w; }
        return first;
      }
      const key = askedDisplay === undefined ? mem.display : askedDisplay == null ? null : String(askedDisplay);
      const have = mine.find((w) => w._desktopMode === 'windows' && (key == null || w._desktopDisplay === key));
      if (have) { app.wm.revealWindow(have.id); return have; }
      askedDisplay = key;
    } else {
      const have = mine.find((w) => w._desktopMode !== 'windows');
      if (have) { app.wm.revealWindow(have.id); if (display !== undefined) have._pickDisplay?.(display); if (askedDisplay != null) have._pickStream?.(String(askedDisplay)); return have; }
    }
  }
  app._hideWelcome?.();
  const machine = nameOf(m);
  const winInfo = app.wm.createWindow({ title: t('{machine} — its desktop', { machine }), type: 'machine-desktop', ...(syncId ? { syncId } : {}) });
  winInfo._machineDesktop = m.hostId;
  winInfo._desktopMode = mode;
  winInfo._desktopDisplay = mode === 'windows' && askedDisplay != null ? String(askedDisplay) : null;
  const c = winInfo.content;
  c.style.display = 'flex'; c.style.flexDirection = 'column';
  // lane desktop-v2-entry (design q-030 §3): THE SWITCH STRIP replaces the line that said what the window is (its words are the
  // status chip's title now): [machine ▾] [display 1 · 2 · All] [⤢ Full screen] [Connected · 48 ms · 12 fps]; one row that
  // scrolls sideways on a phone
  const strip = el('div'); strip.className = 'desktop-strip';
  const hostBtn = btn('desktop-strip-btn desktop-strip-host', `${machine} ▾`, () => openDesktopPicker(app, { anchor: hostBtn, focusHost: m.hostId }));
  hostBtn.title = t('Switch machine');
  const seg = el('div'); seg.className = 'desktop-strip-displays'; seg.setAttribute('role', 'group'); seg.hidden = true;
  // lane desktop-display-modes: THE MODE CONTROL — the current mode (its icon + words), a press lists the three; shown only for a
  // stream of a machine with two or more displays, never on a phone (③ only)
  const modeBtn = btn('desktop-strip-btn desktop-strip-mode', '', () => { const r = modeBtn.getBoundingClientRect(); showContextMenu(r.left, r.bottom + 2, ['switch', 'windows', 'all'].map((k) => ({ labelHtml: modeRowHtml(k, k === mode), action: () => setMode(k) })), 'context-menu'); });
  modeBtn.hidden = true; modeBtn.title = t('How this machine’s displays are shown');
  // ② on the HDR road (commit 2): each display streams a smaller picture so they keep their frame rate — the strip says so
  const scaledEl = el('span'); scaledEl.className = 'desktop-strip-scaled'; scaledEl.hidden = true;
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
  const onFull = () => { lockKeys(); pill.sync(); stats.close(); if (document.fullscreenElement === c) (stream || many.get(panes.lastPointer()) || [...many.values()][0] || view)?.focus(); }; // lane stream-stats-popup: the pill; a popup of the page behind would not show in full screen; lane desktop-display-modes: ②'s pane under the pointer
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
  // lane stream-hdr-passthrough (q-041 r3 P4 road B): 「HDR 直通」 — the machine's HDR display travels as AV1 10-bit PQ at its own
  // brightness. Shown only where it can work (src/hdr-viewer.js): THIS screen is HDR and this browser decodes WebRTC AV1 in
  // hardware, and the stream's offer says the machine can (its display in HDR, an AV1 10-bit encoder); off until the person turns
  // it on, remembered per machine in this browser; a stream in a window per display / the one window (③ ①), never ②'s panes
  const hdrBtn = btn('desktop-strip-btn desktop-strip-hdr-pass', t('HDR passthrough'), () => { setHdr(!hdrRemembered(hdrMemory(), m.hostId)); });
  hdrBtn.hidden = true;
  hdrBtn.title = t('Show this machine’s HDR as it is — AV1 10-bit PQ at its own brightness (this screen is HDR and this browser decodes it in hardware)');
  chip.setAttribute('role', 'button'); chip.tabIndex = 0;
  const cmp = el('div'); cmp.className = 'desktop-strip-compare'; cmp.hidden = true;
  chip.onclick = () => { if (stream) { stats.toggle(chip); return; } cmp.hidden = !cmp.hidden; drawChip(); }; // lane stream-stats-popup: a stream's summary opens its details
  chip.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chip.onclick(); } };
  strip.append(hostBtn, seg, modeBtn, scaledEl, fullBtn, keysBtn, chip, rungEl, slowEl, hdrEl, hdrBtn);
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
  // lane stream-mac-stall: THE STREAM's switcher — the machine's displays from the stream's own offer (a Mac's: its screen helper's
  // facts; lane desktop-display-modes: a Windows machine's too — its screen source's facts), left to right; a pick restarts the
  // stream on that display. Before, the strip drew the switcher only over the VNC picture — a stream showed the main display
  // lane desktop-display-modes: + 「全部显示器」 (②) and the ▾ menu — each display named (its own name, real pixels, HDR), with
  // 「在新窗口打开」 (①) under ③; the mode control beside it. ② = a pane per display (`many`), ③ / ① = ONE view (`stream`)
  const panes = createDisplayPanes(pane, { onFold: (did, f) => fold(did, f) });
  let streamDisplays = null; // the offer's displays (PURE displayRows), null before it / when the agent names none
  let streamDisplay = askedDisplay != null ? String(askedDisplay) : mode === 'switch' && mem.display ? mem.display : null; // the display ③ / ① shows
  let pickedFromMemory = streamDisplay != null; // a display named before this window streamed (remembered, its openSpec's, a door's) may be gone ⇒ the main one, once
  const folded = new Set(mode === 'all' ? mem.folded : []);
  const many = new Map(); // ② display id → its stream view
  const rowOf = (did) => (streamDisplays || []).find((d) => d.id === did) || null;
  const firstShown = () => { const r = (streamDisplays || []).find((d) => !folded.has(d.id)); return r ? r.id : null; };
  const remember = (patch = {}) => {
    const ones = [...app.wm.windows.values()].filter((w) => w._machineDesktop === m.hostId && w._desktopMode === 'windows' && w._desktopDisplay).map((w) => w._desktopDisplay);
    rememberMode(m.hostId, { mode, ...(mode === 'windows' ? { displays: ones } : {}), ...(mode === 'all' ? { folded: [...folded] } : {}), ...(mode !== 'all' && streamDisplay != null ? { display: streamDisplay } : {}), ...patch });
  };
  // the window's recipe (layout restore + the other clients): the machine, the mode, its display, ②'s folded panes, who opened it
  const setSpec = () => {
    winInfo._openSpec = { action: 'openMachineDesktop', hostId: m.hostId, label: m.label || null, setup: m.setup || null, mode, ...(streamDisplay != null && mode !== 'all' ? { display: streamDisplay } : {}), ...(folded.size && mode === 'all' ? { folded: [...folded] } : {}), by: deviceTag() };
    try { app.wm._notify?.(); } catch { /* the layout's */ }
  };
  const drawTitle = () => { const r = mode === 'windows' ? rowOf(streamDisplay) : null; app.wm.setTitle?.(winInfo.id, r ? t('{machine} — {display}', { machine, display: displayName(r) }) : t('{machine} — its desktop', { machine })); };
  const drawStreamSeg = () => {
    const list = streamDisplays && streamDisplays.length > 1 ? streamDisplays : null;
    modeBtn.hidden = !list || phone;
    if (!list) { seg.hidden = true; seg.replaceChildren(); return; }
    const segBtn = (label, key, title, pressed, onclick) => { const b = btn('desktop-strip-seg', label, onclick); b.title = title; b.dataset.key = key; b.setAttribute('aria-pressed', String(pressed)); return b; };
    const kids = list.map((d) => segBtn(String(d.n), d.id, displayLabel(d), mode === 'all' ? !folded.has(d.id) : d.id === streamDisplay, () => pickStream(d.id)));
    if (!phone) kids.push(segBtn(t('All displays'), '*', MODE_WORDS.all(), mode === 'all', () => setMode('all')));
    const more = btn('desktop-strip-more', '▾', () => { const r = more.getBoundingClientRect(); showContextMenu(r.left, r.bottom + 2, displayMenu(), 'context-menu'); });
    more.title = t('The machine’s displays'); more.setAttribute('aria-label', more.title);
    seg.replaceChildren(...kids, more);
    seg.hidden = false;
    modeBtn.innerHTML = `${MODE_ICONS[mode]} <span></span>`; modeBtn.lastChild.textContent = MODE_WORDS[mode]();
  };
  // the ▾ menu: ③ a row shows that display here, 「在新窗口打开」 gives it a window of its own (①); ① a row = that display's
  // window; ② a row folds / unfolds its pane
  const displayMenu = () => (streamDisplays || []).flatMap((d) => {
    const on = mode === 'all' ? !folded.has(d.id) : d.id === streamDisplay;
    const row = { label: `${on ? '✓ ' : '\u2003'}${displayLabel(d)}`, action: () => (mode === 'all' ? fold(d.id, on) : pickStream(d.id)), ...(d.capturable === false ? { disabled: true, title: t('that display is on another graphics card') } : {}) };
    return mode === 'switch' && !phone ? [row, { label: `\u2003\u2003${t('Open in a new window')}`, action: () => openApart(d.id), disabled: d.capturable === false }] : [row];
  });
  const pickStream = (did) => {
    if (mode === 'windows') { if (did !== streamDisplay) openMachineDesktop(app, m, { mode: 'windows', streamDisplay: did }); return; } // ① that display's own window
    if (mode === 'all') { setMode('switch', did); return; } // ② a number alone = that display, here (③)
    if (!stream || did === streamDisplay) return;
    streamDisplay = did; pickedFromMemory = false; remember(); setSpec(); drawStreamSeg();
    const still = stillOf(stream, panes.pane('')); // THE STILL: the last picture stays until the other display's first
    const old = stream; stream = null; const after = old.key; old.dispose('switched'); // lane desktop-handover: `switched` + `after` — a hand-over rides the switch
    startStream({ kind: 'display', id: did }, { still, after });
  };
  /** ③ 「在新窗口打开」: this window keeps its display as ①, the asked one opens in a window of its own (the same display = this one). */
  const openApart = (did) => { setMode('windows', streamDisplay); if (did !== streamDisplay) openMachineDesktop(app, m, { mode: 'windows', streamDisplay: did }); };
  /** ② one view per shown display, ③ / ① the one view — moving between them keeps every stream that stays. */
  const collapseTo = (keep) => {
    for (const [did, v] of [...many]) if (did !== keep) { many.delete(did); v.dispose(); panes.remove(did); }
    const v = many.get(keep); many.clear();
    streamDisplay = keep;
    if (v) {
      panes.rename(keep, ''); stream = v;
      if ((v._share || 1) > 1 && (v.source() || {}).mode === 'mapped') { const still = stillOf(v, panes.pane('')); stream = null; v.dispose(); startStream({ kind: 'display', id: keep }, { still }); } // ③ / ①: the whole picture again
    } else if (!stream && keep != null) startStream({ kind: 'display', id: keep });
    panes.place({ all: false });
    drawScaled();
  };
  const spreadAll = () => {
    if (!streamDisplays || streamDisplays.length < 2) return;
    if (stream) { // the one view becomes its display's pane — unless that display is folded (then it stops)
      const did = streamDisplay || firstShown(), old = stream; stream = null;
      if (folded.has(did)) { old.dispose(); panes.remove(''); } else { panes.rename('', did); many.set(did, old); }
    }
    for (const d of streamDisplays) if (!many.has(d.id) && !folded.has(d.id) && d.capturable !== false) startMany(d.id);
    placeAll(); reshare();
  };
  // ② ON THE HDR ROAD (commit 2 — measured on the owner's box: one 4K HDR display 7–12 fps, two 3–5 fps each): every view asks
  // its stream for `share` = how many displays this window streams (src/stream-plan.js mappedStepOf: the agent maps every k-th
  // pixel); a mapped view started under another count is restarted (THE STILL covers it); the SDR road and ③ / ① never share
  const shareNow = () => { const n = (streamDisplays || []).filter((d) => !folded.has(d.id) && d.capturable !== false).length; return mode === 'all' && n >= 2 ? n : 1; };
  const restartMany = (did) => { const v = many.get(did); if (!v) return; const still = stillOf(v, panes.pane(did)); many.delete(did); v.dispose(); startMany(did, { still }); };
  const reshare = () => { const n = shareNow(); for (const [did, v] of [...many]) if ((v.source() || {}).mode === 'mapped' && (v._share || 1) !== n) restartMany(did); drawScaled(); };
  const drawScaled = () => {
    const sc = mode === 'all' ? [...many.values()].map((v) => (v.source() || {}).scaled).find(Boolean) : null;
    scaledEl.hidden = !sc;
    if (!sc) return;
    scaledEl.textContent = t('Lower resolution for {n} displays', { n: sc.share });
    scaledEl.title = t('Each HDR display streams at {w}×{h} instead of {fw}×{fh} so {n} of them keep their frame rate', { w: sc.w, h: sc.h, fw: sc.from.w, fh: sc.from.h, n: sc.share });
  };
  const placeAll = () => panes.place({ rows: streamDisplays || [], all: mode === 'all', folded: [...folded] });
  const setMode = (next, chosen = null) => {
    next = modeOf(next, { phone });
    if (next === mode) { if (chosen != null && next === 'switch') pickStream(chosen); return; }
    const prev = mode;
    if (next === 'windows') { // ① this window keeps one display (③'s shown one; ②'s under the pointer last, else the first), every other display opens a window of its own
      const keep = chosen || (prev === 'all' ? panes.lastPointer() || streamDisplay || firstShown() : streamDisplay) || firstShown();
      if (prev === 'all') collapseTo(keep);
      mode = 'windows'; winInfo._desktopMode = mode; winInfo._desktopDisplay = keep; streamDisplay = keep; folded.clear();
      remember(); setSpec(); drawTitle(); drawStreamSeg(); drawChip();
      if (chosen == null) for (const d of streamDisplays || []) if (d.id !== keep && d.capturable !== false) openMachineDesktop(app, m, { mode: 'windows', streamDisplay: d.id });
      remember();
      return;
    }
    // ③ / ② — this window becomes the machine's ONE window: its other windows (①'s) close, their streams with them
    for (const [wid, w] of [...app.wm.windows]) if (w !== winInfo && w._machineDesktop === m.hostId) app.wm.closeWindow(wid);
    mode = next; winInfo._desktopMode = mode; winInfo._desktopDisplay = null;
    if (next === 'all') spreadAll(); else collapseTo(chosen || panes.lastPointer() || streamDisplay || firstShown());
    remember(); setSpec(); drawTitle(); drawStreamSeg(); drawChip(); drawHdr();
  };
  /** ② a pane folds to its stub (its stream stops) / unfolds (a stream again). */
  const fold = (did, f) => {
    if (mode !== 'all') return;
    if (f) { folded.add(did); const v = many.get(did); many.delete(did); if (v) v.dispose(); panes.remove(did); }
    else if (folded.delete(did)) startMany(did);
    remember(); setSpec(); placeAll(); reshare(); drawStreamSeg(); drawChip();
  };
  winInfo._pickStream = (did) => pickStream(did);
  winInfo._setDisplayMode = (k, did) => setMode(k, did);
  const fit = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (mode === 'all') placeAll(); }) : null;
  fit?.observe(pane);
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
    if (c.path === 'own') return t('Pointer: yours — the machine sent none of its own'); // lane stream-cursor (a Mac's Screen Sharing)
    if (c.path === 'server') return t('Pointer: painted by the machine into the picture — its {px} px pointer is too big to draw here', { px: c.side });
    if (c.path === 'scaled') return t('Pointer: drawn here at {pct} % of its {px} px, with the picture', { pct: Math.round(c.factor * 100), px: c.side });
    return t('Pointer: drawn here at its own {px} px', { px: c.side });
  };
  const drawChip = () => {
    drawRung(); tccCheck();
    if (stream || many.size) { drawStream(); return; }
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
  // THE STATS ROW (src/lib/stream-stats.js — lane stream-window-fixes: the same component in one window's stream): the numbers
  // and lane stream-relay-udp's firewall notice — the machine's firewall blocks the direct path (its agent's self-probe), said
  // while the hub relay carries the picture, with the owner's admin line to copy. The notice sits right after the status chip,
  // AHEAD of the numbers (lane stream-relay-udp-ci): the numbers run long on the relay (the path, NVENC · encode) and the strip
  // scrolls sideways, so after them the copy button sat past a desk-sized window's edge (DejaVu: the .296 mirror)
  // lane stream-stats-popup: the numbers sentence LEFT the strip — the chip is the summary (its title carries the sentence), its
  // click opens the details (a table + three charts), pinned in a corner of the picture's pane
  const stats = createStreamStats({ machine, hostId: m.hostId, summary: chip, frame: pane });
  const fwEl = stats.firewall;
  const noteEl = el('span'); noteEl.className = 'desktop-strip-note'; noteEl.hidden = true;
  // lane stream-p3m-build: A MAC'S PERMISSION — macOS keeps the screen (Screen Recording) or the input (Accessibility) from the
  // agent's screen helper until its owner turns it on; a background agent cannot even ask (tccd: "does not allow prompting"),
  // so the strip says which switch, with the Settings pane's link to copy (it opens that pane on the Mac). The next stream
  // start reads the Mac's facts again — the switch flipped, the picture comes
  const tccEl = el('span'); tccEl.className = 'desktop-strip-tcc'; tccEl.hidden = true;
  const tccText = el('span');
  const tccCopy = el('button', null, t('Open System Settings')); tccCopy.type = 'button'; tccCopy.className = 'file-tool-btn desktop-strip-tcc-open';
  let tccLink = null, tccPane = null;
  // lane stream-mac-stall: the Mac shows that pane ITSELF (its agent's `settings-open` op runs `open` on the deep link — no
  // grant needed); copying the link stays only the fallback (an agent that predates the op, or any refusal)
  const PANE_WORDS = { screen: () => t('Screen & System Audio Recording'), accessibility: () => t('Accessibility') };
  tccCopy.onclick = async () => {
    const r = tccPane ? await post('/api/desktop/machine-desktop/settings-open', { host: m.hostId, pane: tccPane }).catch(() => null) : null;
    if (r && r.ok) { showToast(t('Opened System Settings › {pane} on {machine}', { pane: PANE_WORDS[tccPane](), machine })); return; }
    if (tccLink) copyText(tccLink).then(() => showToast(t('Copied — on {machine}, paste it into Safari’s address bar: it opens that Settings pane', { machine })));
  };
  tccEl.append(tccText, tccCopy);
  const MAC_PANES = { screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture', accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility' };
  // commit 2 — the Accessibility banner goes when the machine takes input again (a view's injected count passes the count at
  // the refusal, no newer refusal) or a start's facts say granted; a new refusal shows it again (inputWords)
  let tccAt = 0; const tccBase = new Map();
  const tccViews = () => (stream ? [stream] : [...many.values()]);
  const tccGranted = () => { if (!tccEl.hidden && tccPane === 'accessibility') tccEl.hidden = true; };
  const tccCheck = () => {
    if (tccEl.hidden || tccPane !== 'accessibility') return;
    for (const v of tccViews()) { const inp = (v.agent() || {}).input; if (inp && inp.n > (tccBase.has(v) ? tccBase.get(v) : 0) && !(inp.refused && inp.refused.code === 'accessibility_permission' && inp.refused.at > tccAt)) { tccGranted(); return; } }
  };
  const showTcc = (code, at = 0) => {
    if (code === 'accessibility_permission') { tccAt = at || 0; tccBase.clear(); for (const v of tccViews()) tccBase.set(v, ((v.agent() || {}).input || {}).n || 0); }
    const pane = code === 'accessibility_permission' ? 'accessibility' : 'screen';
    tccLink = MAC_PANES[pane]; tccPane = pane;
    tccText.textContent = code === 'helper_changed_regrant' ? t('The Mac’s screen helper was updated: turn vibespace-screen off and on again under Screen & System Audio Recording')
      : pane === 'accessibility' ? t('The Mac takes no keys or clicks until Accessibility is on for vibespace-screen')
        : t('The Mac shows no picture until Screen Recording is on for vibespace-screen');
    tccEl.title = tccLink; tccEl.hidden = false;
  };
  strip.append(fwEl, tccEl, noteEl);
  // lane stream-stats-popup: TRUE FULL SCREEN — 「全屏」 shows the picture alone and this strip floats over it as a movable pill
  // (src/lib/stream-pill.js): the summary, 「退出全屏」 and ⋯ = the details · the displays · 「捕获快捷键」
  const pill = createStreamPill({ host: c, bar: strip, fullBtn, hostId: m.hostId, menu: () => {
    const segs = [...seg.querySelectorAll('.desktop-strip-seg')];
    return [...(stream ? [{ label: t('Stream details'), action: () => stats.open(chip) }, { separator: true }] : []),
      ...segs.map((b) => ({ label: b.title || b.textContent, checked: b.getAttribute('aria-pressed') === 'true', action: () => b.click() })), ...(segs.length ? [{ separator: true }] : []),
      { label: t('Capture shortcuts'), checked: keysBtn.getAttribute('aria-pressed') === 'true', action: () => keysBtn.click() }];
  } });
  let noteTimer = null, refusedWhy = '';
  const note = (text, title, ms = 0) => { clearTimeout(noteTimer); noteEl.textContent = text; noteEl.title = title || text; noteEl.hidden = !text; if (ms) noteTimer = setTimeout(() => { noteEl.hidden = true; }, ms); };
  const STREAM_WHY = {
    ice_failed: () => t('the connection failed'), ice_disconnected: () => t('the connection dropped'), connect_timeout: () => t('it did not connect in time'),
    stalled: () => t('the picture stopped arriving'), // lane stream-leg-flap: THE STALL (stream-view — frames sent, none decoded)
    answer_failed: () => t('the browser and the machine could not agree'), restart_failed: () => t('it could not reconnect'), link_lost: () => t('the machine’s link dropped'),
    agent_too_old: () => t('the machine’s agent cannot stream yet — update it'), no_screen_source: () => t('the machine’s agent cannot capture its screen yet'),
    too_many_streams: (i) => (i && Number.isInteger(i.cap) ? t('the machine already streams {live} pictures — at most {cap} for its {n} displays (one per display + one)', { live: i.live, cap: i.cap, n: i.displays }) : t('the machine already streams to two windows')), // lane desktop-display-modes: THE PER-MACHINE CAP names its count (an older agent: two)
    offer_failed: () => t('the machine could not start it'),
    // lane stream-p1b-screen: the screen source's own names (src/agentd/stream-screen.js — refused before it starts, or ended)
    no_ffmpeg: () => t('the machine needs ffmpeg 7 or newer (with ddagrab and NVENC) — on its PATH or in {dir}', { dir: '%LOCALAPPDATA%\\vibespace\\ffmpeg\\bin' }),
    no_encoder: () => t('the machine’s ffmpeg has no H.264 encoder'), no_white_level: () => t('the machine’s HDR white level could not be read'),
    display_gone: () => t('the display it showed is gone'), display_other_gpu: () => t('that display is on another graphics card'),
    capture_failed: () => t('the machine’s screen capture could not start'), capture_exited: () => t('the machine’s screen capture stopped'), encoder_exited: () => t('the machine’s video encoder stopped'),
    capture_interrupted: () => t('the machine’s screen capture kept being interrupted'), // lane stream-fallback-never-silent: the source's own restarts ran out
    // lane stream-p3m-build: a Mac's (its screen helper — src/agentd/stream-mac.js)
    no_helper: () => t('the Mac has no screen helper yet — install the Command Line Tools there (xcode-select --install) or update VibeSpace'),
    screen_permission: () => t('Screen Recording is off for vibespace-screen on the Mac'), helper_changed_regrant: () => t('the Mac’s screen helper was updated and needs its Screen Recording switch again'),
    window_minimized: () => t('the window is minimized — restore it to stream'), window_gone: () => t('the window it showed is gone'),
    encoder_failed: () => t('the machine’s video encoder stopped'), no_window_source: () => t('the machine’s agent cannot stream one window yet'),
  };
  const streamWords = (code, info) => (STREAM_WHY[code] ? STREAM_WHY[code](info) : t('the machine ended it ({code})', { code: code || '?' }));
  const ms = (v) => (v == null ? '—' : v);
  const drawStream = () => {
    if (!stream && many.size) { drawMany(); return; }
    const { playing, page: p, agent: a, words } = stats.draw(stream); // the firewall notice + the details' series (src/lib/stream-stats.js)
    chip.textContent = (playing ? t('Stream · {ms} ms · {fps} fps', { ms: ms(p && p.rttMs), fps: ms(p && p.fps) }) : t('Stream · connecting…')) + (a && a.screen && a.screen.hdr ? ' · HDR' : ''); // lane stream-hdr-passthrough
    if (!p) return;
    const sc = a && a.screen; // lane stream-p1b-screen: the machine's own screen — its encoder and what encoding costs there
    chip.title = [scope, ...(words ? [words] : []), t('WebRTC from the machine’s agent: {w}×{h}, sent {sent} fps at {kbps} kbps', { w: ms(p.width), h: ms(p.height), sent: ms(a && a.fps), kbps: ms(a && a.kbps) }), // lane stream-stats-popup: the numbers sentence, here now
      ...(sc && sc.floor != null && sc.kbps != null ? [t('The machine encodes it at {kbps} kbps — never under {floor} kbps for a screen this size', { kbps: sc.kbps, floor: sc.floor })] : []), // lane stream-mac-rate: THE RATE's decision, beside what the page receives
      ...(sc && sc.hdr ? [t('HDR passthrough: AV1 10-bit PQ, at the brightness the machine’s display shows')] : sc && sc.white ? [t('HDR mapped on the machine (SDR white {nits} nits)', { nits: Math.round(sc.white * 0.08) })] : []), ...(sc && sc.note === 'no_hw_encoder' ? [t('software encoding (no hardware encoder found)')] : []),
      t('Pointer: yours — the machine draws none into the picture')].join('\n'); // lane stream-cursor: no source paints the machine's
  };
  // lane desktop-display-modes ② THE STATS of N streams (PURE sumStats): fps and kbps summed over the playing displays, the slowest
  // named — the chip says how many play; its title has the sum's sentence (the numbers' place since lane stream-stats-popup) and
  // each display's own numbers
  const drawMany = () => {
    const rows = [...many].map(([did, v]) => { const p = v.stats(), r = rowOf(did); return { id: did, n: r ? r.n : 0, playing: v.state === 'playing', fps: p && p.fps, kbps: p && p.kbps }; });
    const sum = sumStats(rows), vs = [...many.values()];
    stats.draw(vs.find((v) => v.state === 'playing') || vs[0]); // the firewall notice + the details: any playing display's (one machine, one path)
    const slow = sum.slowest ? rowOf(sum.slowest.id) : null;
    const words = sum.playing ? t('{n} displays · {fps} fps · {kbps} kbps', { n: sum.playing, fps: sum.fps, kbps: sum.kbps }) + (slow ? ' · ' + t('slowest: {display} at {fps} fps', { display: `${slow.n} · ${displayName(slow)}`, fps: sum.slowest.fps }) : '') : '';
    chip.textContent = sum.playing ? t('Stream · {n} displays · {fps} fps', { n: sum.playing, fps: sum.fps }) : t('Stream · connecting…');
    chip.title = [scope, ...(words ? [words] : []), ...rows.map((r) => { const d = rowOf(r.id); return `${d ? displayLabel(d) : r.id}: ${r.playing ? t('{fps} fps · {kbps} kbps', { fps: ms(r.fps), kbps: ms(r.kbps) }) : t('Stream · connecting…')}`; }), t('Pointer: yours — the machine draws none into the picture')].join('\n');
  };
  const inputWords = (ref) => {
    const code = ref && ref.code;
    if (!code) return;
    if (code === 'accessibility_permission') { showTcc(code, ref.at); return; } // lane stream-p3m-build: the Mac's Accessibility switch (commit 2: until it takes input again)
    note(code === 'uipi_blocked' ? t('Windows keeps input away from an administrator window — click another window on the machine first')
      : code === 'switching' ? t('Switching display — that input did not reach the machine') // fix r2: the view's own word (stream-view send)
      : code === 'input_unsupported' ? t('This machine cannot take input over the stream yet')
        : t('The machine did not take that input ({code})', { code }), null, 8000);
  };
  // lane desktop-handover (src/lib/machine-desktop-handover.js): 「交给 agent」 while the stream plays; the person's own input pauses it
  const handover = createHandover({ app, hostId: m.hostId, machine, strip, before: chip, pane, streamOf: () => stream });
  winInfo._handover = handover;
  // lane stream-mic-road (src/lib/stream-mic-strip.js): 「麦克风」 — every stream asks for the microphone's m-line, the first that carries
  // it carries the voice; nothing about it is remembered (a restored window starts it OFF — micStep's `restore`); its door installs
  const micToggle = createMicToggle({ hostId: m.hostId, strip, before: chip, install: () => import('./desktop-app-launcher.js').then(({ showInstallDialog }) => showInstallDialog(m, { what: 'virtual-mic' })) });
  winInfo._micToggle = micToggle;
  // lane speaker-passthrough-v1 (src/lib/stream-mic-strip.js): 「声音」 — every stream asks for the machine's sound track, the first that
  // carries it plays it here; ON is remembered per machine, a RESTORED window (a reload, a layout replay: syncId) says 「点一下开声音」
  const soundToggle = createSoundToggle({ hostId: m.hostId, platform: m.setup || null, strip, before: chip, restored: !!syncId });
  winInfo._soundToggle = soundToggle;
  // A CROWDED STRIP (a narrow window + a notice — test-desktop-webrtc-chrome ⑦: the firewall notice's copy button stays inside the
  // strip at 900 px) drops the words of 「麦克风」 / 「声音」 — their icons and titles stay; a roomy strip keeps them. Measured, not guessed:
  // the class is taken off, the row measured, put back only when it overflows (its own class change is no mutation it watches)
  let tightQueued = false;
  const tighten = () => { tightQueued = false; if (closed) return; strip.classList.remove('is-tight'); if (strip.scrollWidth > strip.clientWidth + 1 && !strip.classList.contains('is-pill')) strip.classList.add('is-tight'); };
  const tightLater = () => { if (!tightQueued) { tightQueued = true; requestAnimationFrame(tighten); } };
  const tightRo = typeof ResizeObserver === 'function' ? new ResizeObserver(tightLater) : null;
  tightRo?.observe(strip);
  const tightMo = typeof MutationObserver === 'function' ? new MutationObserver(tightLater) : null;
  tightMo?.observe(strip, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  // lane desktop-display-modes: a remembered display the machine no longer shows (or cannot capture) ⇒ its main display, once
  const DISPLAY_GONE = ['display_gone', 'display_other_gpu', 'display_unmapped', 'bad_source'];
  /** ② one display's end — said in its pane, the other displays keep streaming. NEVER SILENT per pane (lane stream-leg-flap —
   *  the owner's two displays sat black at 0 fps): a pane that PLAYED is offered again by itself, once (「串流中断：…——正在重新
   *  连接…」 until its picture plays); then — or a pane that never played — 「重试」. → true when `v` was one of them. */
  const paneLadder = new Map(); // ② display id → endingVerdict's { step, at }
  const paneEnd = (v, code, why, info) => {
    const hit = [...many].find(([, x]) => x === v);
    if (!hit) return false;
    const did = hit[0];
    many.delete(did);
    const words = STREAM_WHY[code] ? streamWords(code, info) : why || streamWords(code);
    const lad = paneLadder.get(did) || { step: 0, at: 0 };
    const nv = endingVerdict({ played: v.played, step: lad.step, at: lad.at, now: Date.now() });
    if (v.played) paneLadder.set(did, { step: nv.step, at: nv.at });
    if (nv.act === 'retry') {
      panes.say(did, t('Stream interrupted: {why} — reconnecting…', { why: words }));
      setTimeout(() => { if (!closed && mode === 'all' && !many.has(did) && !folded.has(did)) startMany(did, { said: true }); }, NEVER_SILENT.retryMs);
    } else panes.say(did, t('Not streamed: {why}', { why: words }), { label: t('Try again'), run: () => { panes.say(did, ''); startMany(did); } });
    drawChip();
    return true;
  };
  /** ② a display's own stream, in its pane. */
  const startMany = (did, { still = null, said = false } = {}) => {
    let v = null;
    const share = shareNow();
    v = createStreamView(panes.pane(did), { hostId: m.hostId, hostPlatform: m.setup || null, source: { kind: 'display', id: did, ...(share > 1 ? { share } : {}) },
      onSource: (src) => { if (src && src.tcc && src.tcc.accessibility === 'granted') tccGranted(); drawScaled(); },
      mic: true, onMicReady: (ok) => micToggle.ready(v, ok), // lane stream-mic-road
      audio: true, onSoundReady: (ok) => soundToggle.ready(v, ok), // lane speaker-passthrough-v1
      onStatus: (state, code) => { if (state === 'fallback' || state === 'stopped') { micToggle.ended(v); soundToggle.ended(v); } if (state === 'playing' && still) { still.remove(); still = null; } if (state === 'restarting' && code === 'timeout') { said = true; panes.say(did, t('Stream interrupted: {why} — reconnecting…', { why: streamWords('connect_timeout') })); } if (state === 'playing' && said) { said = false; panes.say(did, ''); } drawChip(); }, onStats: () => drawChip(), onInput: inputWords, // lane stream-leg-flap: the re-offer's words stay until its picture plays (lane werift-lite-multihomed: and a connect that ran out of time is said)
      onFallback: (code, why, taken, info) => { if (still) { still.remove(); still = null; } paneEnd(v, code, why, info); } });
    v._share = share;
    many.set(did, v);
    v.connect();
    if (!tick) tick = setInterval(() => { drawChip(); }, 1000);
  };
  // NEVER SILENT (lane stream-fallback-never-silent — incident inc-mvf7z2a3-9sxi: a playing Mac stream ended on a transient and this
  // window started the VNC picture by itself): once a picture played here, an ending is answered by src/stream-model.js
  // endingVerdict — the same display again (1 s on), the main display (it was gone), then the person's choice 「重试」 /
  // 「显示 VNC 画面」; the last picture stays (`held`) until a stream plays again or the VNC picture is chosen
  const ladder = { played: false, step: 0, at: 0 };
  let held = null, retryTimer = null, closed = false, slowSaid = false;
  const dropHeld = () => { if (held) { held.remove(); held = null; } };
  /** The VNC picture instead of the stream — the rung's old answer before any picture played, or the person's press. */
  const toVnc = (code, why, taken, info, pressed = false) => {
    stats.ended(); clearInterval(tick); tick = null; handover.playing(false); handover.facts(null);
    streamDisplays = null; drawStreamSeg(); // the VNC picture draws its own switcher (remap)
    for (const [did, x] of [...many]) { many.delete(did); x.dispose(); }
    panes.dispose(); held = null;
    refusedWhy = STREAM_WHY[code] ? streamWords(code, info) : why || streamWords(code); // the page words a known code in its own language; else the machine's sentence
    if (code === 'screen_permission' || code === 'helper_changed_regrant') showTcc(code); // lane stream-p3m-build: which switch on the Mac
    if (taken && !pressed) note(t('Stream stopped ({why}) — showing the VNC picture', { why: streamWords(code, info) }), why || code);
    chip.title = [scope, t('Not streamed: {why}', { why: refusedWhy })].join('\n');
    if (syncId && !taken && !pressed) { askVnc(t('Not streamed: {why}', { why: refusedWhy })); return; }
    startVnc();
  };
  /** A played stream ended: `act` = endingVerdict's — 'retry' (the same source, NEVER_SILENT.retryMs on), 'main' (the main display),
   *  'ask' (the two buttons: the VNC picture only on 「显示 VNC 画面」). */
  const interrupted = (act, src, code, why, info) => {
    const words = STREAM_WHY[code] ? streamWords(code, info) : why || streamWords(code);
    chip.title = [scope, t('Stream interrupted: {why}', { why: words })].join('\n');
    handover.playing(false);
    if (act === 'retry') { note(t('Stream interrupted: {why} — reconnecting…', { why: words }), why || code, 8000); clearTimeout(retryTimer); retryTimer = setTimeout(() => { retryTimer = null; if (!closed && !stream) startStream(src); }, NEVER_SILENT.retryMs); return; }
    if (act === 'main') { note(t('Stream interrupted: {why} — reconnecting…', { why: words }), why || code, 8000); pickedFromMemory = false; streamDisplay = null; remember({ display: null }); startStream(null); return; }
    stats.ended(); clearInterval(tick); tick = null; handover.facts(null); note('');
    streamDisplays = null; drawStreamSeg();
    panes.pane(''); panes.say('', t('Stream interrupted: {why}', { why: words }), [
      { label: t('Try again'), run: () => { panes.say('', ''); ladder.step = 1; ladder.at = Date.now(); startStream(src); } },
      { label: t('Show the VNC picture'), run: () => { panes.say('', ''); toVnc(code, why, false, info, true); } },
    ]);
    drawChip();
  };
  /** A replayed window never asks the sign-in by itself (design 014 D1): the VNC picture waits for a press. */
  const askVnc = (words) => {
    const box = el('div'); box.className = 'desktop-display-say desktop-display-ask';
    box.append(el('span', null, words), btn('btn-create desktop-display-say-act', t('Show the VNC picture'), () => { box.remove(); startVnc(); }));
    pane.append(box);
  };
  // ── 「HDR 直通」 (lane stream-hdr-passthrough) ──
  const hdrMemory = () => { try { return localStorage.getItem(HDR_KEY); } catch { return null; } };
  const hdrMq = typeof matchMedia === 'function' ? matchMedia(DYNAMIC_RANGE_QUERY) : null;
  let hdrDecoding; // this browser's answer to HDR_DECODE_QUERY (undefined = not asked yet, null = no API)
  const viewerHdr = () => hdrViewerVerdict({ dynamicRange: !!(hdrMq && hdrMq.matches), decoding: hdrDecoding });
  const machineHdr = () => hdrMachineVerdict(stream ? stream.source() : null);
  /** The HDR road is asked when: this screen + browser can, the machine can (the last offer said), and the person turned it on. */
  const hdrWanted = () => viewerHdr().show && hdrRemembered(hdrMemory(), m.hostId) && (!stream || !stream.source() || machineHdr().can);
  const drawHdr = () => {
    const on = hdrRemembered(hdrMemory(), m.hostId);
    hdrBtn.hidden = !(stream && mode !== 'all' && viewerHdr().show && machineHdr().can);
    hdrBtn.setAttribute('aria-pressed', String(on));
  };
  /** Restart the one view's stream with (or without) the HDR road — THE STILL covers the gap, the hand-over rides it (`after`). */
  const restartHdr = (why) => {
    if (!stream || mode === 'all') { drawHdr(); return; }
    const still = stillOf(stream, panes.pane('')); const old = stream; stream = null; const after = old.key; old.dispose(why);
    startStream(streamDisplay != null ? { kind: 'display', id: streamDisplay } : null, { still, after });
  };
  const setHdr = (on) => {
    try { localStorage.setItem(HDR_KEY, rememberHdr(hdrMemory(), m.hostId, on)); } catch { /* storage refused: this window only */ }
    if (on) note('');
    if (stream && stream.hdr !== hdrWanted()) restartHdr(on ? 'hdr_on' : 'hdr_off'); else drawHdr();
  };
  // the window moved to another screen (an SDR one ⇒ the SDR picture; back on the HDR screen ⇒ HDR again when it is on)
  const onScreenRange = () => { drawHdr(); if (stream && mode !== 'all' && stream.hdr !== hdrWanted()) restartHdr('hdr_screen'); };
  hdrMq?.addEventListener?.('change', onScreenRange);
  // this browser's answer (asked once a window): a window that opens with HDR on waits for it before its first stream (begin, below)
  const hdrAsked = (typeof navigator !== 'undefined' && navigator.mediaCapabilities && typeof navigator.mediaCapabilities.decodingInfo === 'function'
    ? navigator.mediaCapabilities.decodingInfo(HDR_DECODE_QUERY).then((a) => a || null, () => null) : Promise.resolve(null)).then((a) => { hdrDecoding = a; drawHdr(); });
  const startStream = (source = null, { still = null, after = null } = {}) => {
    let v = null;
    v = createStreamView(panes.pane(''), {
      hostId: m.hostId,
      hostPlatform: m.setup || null,
      after,
      hdr: mode !== 'all' && hdrWanted(), // lane stream-hdr-passthrough: 「HDR 直通」 on, where this screen, browser and machine can
      // THE FALLBACK: this browser did not decode the HDR picture (its bytes came, no frame in 2 s) ⇒ the SDR picture, said, the switch off
      onHdrFailed: () => {
        if (v !== stream) return;
        try { localStorage.setItem(HDR_KEY, rememberHdr(hdrMemory(), m.hostId, false)); } catch { /* storage refused */ }
        note(t('HDR passthrough fell back: this browser cannot decode it'), t('The machine sent AV1 10-bit PQ and this browser decoded no frame of it in 2 s — the stream restarted as the SDR picture; turn 「HDR passthrough」 on to try again'));
        restartHdr('hdr_undecodable');
      },
      onOwnerInput: () => handover.ownerInput(),
      onHandover: (f) => handover.facts(f),
      mic: true, onMicReady: (ok) => micToggle.ready(v, ok), // lane stream-mic-road: the m-line asked; the toggle shows once it is there
      audio: true, onSoundReady: (ok) => soundToggle.ready(v, ok), // lane speaker-passthrough-v1: the machine's sound track asked; 「声音」 shows once it is there
      source, // lane stream-mac-stall: a display the switcher picked (else the machine's main one)
      onSource: (src) => {
        if (v !== stream) return;
        if (src && src.tcc && src.tcc.accessibility === 'granted') tccGranted(); // commit 2: the Mac's facts at this start say granted
        streamDisplays = src && Array.isArray(src.displays) && src.displays.length ? displayRows(src.displays) : null; // left to right, numbered, named (PURE)
        if (src && src.display != null) streamDisplay = String(src.display);
        if (mode === 'windows') winInfo._desktopDisplay = streamDisplay;
        if (mode === 'all') spreadAll();
        remember(); setSpec(); drawTitle(); drawStreamSeg(); drawHdr(); // lane stream-hdr-passthrough: the offer says whether the machine can
      },
      onStatus: (state, code) => {
        if (state === 'fallback' || state === 'stopped') { micToggle.ended(v); soundToggle.ended(v); } // lane stream-mic-road: the voice stops with its stream (lane speaker-passthrough-v1: and the machine's sound)
        if (state === 'playing') { ladder.played = true; dropHeld(); } // NEVER SILENT: a picture played here
        // lane werift-lite-multihomed: NEVER SILENT before a picture too — ICE did not reach `connected` within the connect budget
        // (STREAM_LIMITS.connectMs) and the view asks an ICE restart: leg ⑥'s words, until a picture plays (before: 「连接中…」 for
        // the whole restart budget, 45 s, then the VNC picture)
        if (state === 'restarting' && code === 'timeout' && v === stream) { slowSaid = true; note(t('Stream interrupted: {why} — reconnecting…', { why: streamWords('connect_timeout') })); }
        if (state === 'playing' && slowSaid) { slowSaid = false; note(''); }
        if (state === 'fallback' && v === stream && v.played && !held) held = stillOf(v, panes.pane('')); // its last picture stays through the ladder
        if (state === 'playing' && still) { still.remove(); still = null; } drawChip(); handover.playing(state === 'playing'); if (!tick) tick = setInterval(() => { drawChip(); }, 1000); },
      onStats: () => drawChip(),
      onInput: inputWords,
      onFallback: (code, why, taken, info) => {
        if (still) { still.remove(); still = null; }
        if (paneEnd(v, code, why, info)) return; // ② one display's
        if (v !== stream) return; // replaced by a switch
        stream = null;
        if (!taken && pickedFromMemory && source && DISPLAY_GONE.includes(code)) { pickedFromMemory = false; streamDisplay = null; remember({ display: null }); startStream(null); return; }
        const nv = endingVerdict({ ...ladder, now: Date.now(), gone: DISPLAY_GONE.includes(code), named: !!(source && source.id != null) }); // NEVER SILENT
        if (nv.act !== 'fallback') { ladder.step = nv.step; ladder.at = nv.at; interrupted(nv.act, source, code, why, info); return; }
        toVnc(code, why, taken, info);
      },
    });
    stream = v;
    winInfo._streamView = stream;
    stream.connect();
  };
  winInfo._pickDisplay = (key) => pick(key);
  winInfo.onClose = () => { closed = true; clearTimeout(retryTimer); micToggle.dispose(); soundToggle.dispose(); tightRo?.disconnect(); tightMo?.disconnect(); handover.dispose(); pill.dispose(); stats.dispose(); clearInterval(tick); clearTimeout(noteTimer); fit?.disconnect(); document.removeEventListener('fullscreenchange', onFull); hdrMq?.removeEventListener?.('change', onScreenRange); if (locked) { locked = false; try { navigator.keyboard.unlock(); } catch { /* gone */ } } if (stream) stream.dispose(); for (const v of many.values()) v.dispose(); many.clear(); if (view) view.dispose(); };
  // lane desktop-display-modes: the window's recipe from its first moment; a window another device opened (a replay) waits for a
  // press here — every client replaying it must not start a stream nobody watches (each takes one of the machine's streams)
  setSpec(); remember();
  const begin = () => (typeof RTCPeerConnection === 'function' ? startStream(streamDisplay != null && mode !== 'all' ? { kind: 'display', id: streamDisplay } : null) : syncId ? askVnc(t('{machine}’s desktop', { machine })) : startVnc());
  if (restored) { panes.pane(''); panes.say('', t('{machine}’s desktop was open on another device', { machine }), { label: t('Show it here'), run: () => { panes.say('', ''); begin(); } }); }
  else if (hdrRemembered(hdrMemory(), m.hostId) && hdrMq && hdrMq.matches) hdrAsked.then(begin); // lane stream-hdr-passthrough: HDR on ⇒ the browser's answer first
  else begin();
  return winInfo;
}

/** The machine's picture options both windows share (the whole desktop's and one app's — lane machine-app-crop): the bridge's
 *  last close, the connect gate (the machine reached, its VNC server answering) and the sign-in asked here each time. */
function machineViewOpts(m) {
  let auth = m.auth || null;
  return {
    lastClose: async () => { const r = await fetchJson(`/api/desktop/machine-desktop/last-close?host=${encodeURIComponent(m.hostId)}`); return r && !r.error ? r.close : null; },
    before: async () => { const r = await post('/api/desktop/machine-desktop/connect', { host: m.hostId }); if (!r || r.error) return { ok: false, error: desktopRefusalText(r, m) }; auth = r.auth || auth; return { ok: true }; },
    // lane desktop-vnc-remember: the hub's FRESH word on the machine's remembered sign-in (a refusal it met a moment ago on this
    // very connection is in it), then the dialog; a ticked sign-in is sealed once the machine took it (`onAccepted`)
    credentials: async (types) => {
      const r = await fetchJson(`/api/desktop/machine-desktop/signins?host=${encodeURIComponent(m.hostId)}`);
      const c = await askCredentials(m, types, auth, r && !r.error ? r.signin : null);
      if (!c) return null;
      const { remember, ...creds } = c;
      return remember ? { ...creds, onAccepted: () => rememberSignin(m, creds) } : creds;
    },
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
  // lane stream-mic-road: the machine's virtual microphone — its state and its doors (install, the default pair, remove)
  const mic = m.setup === 'win32' || m.setup === 'darwin' ? createMicCard({ hostId: m.hostId, machine, install: install ? (what) => install(m, { what, onDone: () => mic.refresh({ force: true }) }) : null }) : null;
  const sound = m.setup === 'win32' || m.setup === 'darwin' ? createSoundCard({ platform: m.setup }) : null; // lane speaker-passthrough-v1: the sound's consent, said
  body.append(state, acts, ...(mic ? [mic.el] : []), ...(sound ? [sound.el] : []), scope, runHead, apps.el, presets, runRow, el('p', NOTE, t('It starts on {machine}’s desktop as you — the exact command is shown before it runs.', { machine })));
  let asked = 0; // the newest listing asked (an older answer never overwrites a newer one)
  let signin = null; // lane desktop-vnc-remember: the hub's word on this machine's remembered sign-in (GET …/signins)
  const readSignin = async () => { const r = await fetchJson(`/api/desktop/machine-desktop/signins?host=${encodeURIComponent(m.hostId)}`); if (!body.isConnected) return; signin = r && !r.error ? r.signin : null; render(); };
  const listApps = async (fresh) => {
    const mine = ++asked;
    apps.set({ ...apps.get(), loading: true });
    const url = `/api/desktop/machine-desktop/apps?host=${encodeURIComponent(m.hostId)}`;
    let r = await fetchJson(`${url}${fresh ? '&fresh=1' : ''}`);
    if (mine !== asked || !body.isConnected) return;
    // lane desktop-picker-instant: the list the machine gave last is drawn AT ONCE (`listing` — it is listing again: 391–446 apps
    // took 5–20 s on the owner's Windows box); the follow-up waits for the new list
    if (r && r.listing && Array.isArray(r.rows)) { apps.set({ ...r, loading: true }); r = await fetchJson(`${url}&wait=1`); if (mine !== asked || !body.isConnected) return; }
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
    // lane stream-p2w-build: ONE application window of a Windows machine as its own window (its agent captures that window only) — beside the desktop: the two ways to look at the machine; a Mac's too (lane stream-p3m-build's window source — int304's one door)
    if ((m.setup === 'win32' || m.setup === 'darwin') && m.code !== 'offline') { const ws = btn('file-tool-btn machine-window-stream-open', t('Stream one window…'), () => openWindowPicker(app, m, { openDesktop: () => openMachineDesktop(app, m), onOpen: toWindow })); ws.title = t('Show one application window of {machine} as its own window — only that window is sent', { machine }); acts.append(ws); }
    if (m.code === 'no_vnc' && m.setup === 'win32' && install) acts.append(btn('btn-create', t('Install TightVNC Server…'), () => install(m, { what: 'tightvnc', onDone: () => check() })));
    if (m.code !== 'offline' && recheck) acts.append(btn('file-tool-btn', t('Check again'), () => check()));
    if (m.setup === 'win32') { const rs = btn('file-tool-btn machine-remoteapp-settings', t('RemoteApp settings…'), () => openRemoteappSettings(app, m)); rs.title = t('Set up RemoteApp once for this Windows machine: its sign-in and its certificate'); acts.append(rs); } // lane remoteapp-r1b: never greyed — offline, the card says so
    // lane desktop-vnc-remember: 「忘掉登录」 — only while a sign-in is remembered (the next desktop asks again)
    if (signin && signin.kept) { const f = btn('file-tool-btn machine-signin-forget', t('Forget sign-in'), () => forgetSignin()); f.title = t('VibeSpace signs in to {machine}’s desktop by itself with the sign-in sealed in the vault — forget it to be asked again', { machine }); acts.append(f); }
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
  /** lane desktop-vnc-remember: 「忘掉登录」 — the sealed row gone (the answer is the state). */
  async function forgetSignin() {
    const r = await post('/api/desktop/machine-desktop/signin/forget', { host: m.hostId });
    if (!r || r.error) { showToast((r && r.error) || t('server unreachable'), { type: 'error' }); return; }
    signin = r.signin || null;
    showToast(t('{machine}’s sign-in forgotten', { machine }));
    if (body.isConnected) render();
  }
  input.onkeydown = (e) => { if (enterSubmits(e)) { e.preventDefault(); run({ window: asWindow() }); } };
  render();
  listApps(false);
  readSignin();
  if (mic && m.code !== 'offline') mic.refresh();
  // lane desktop-picker-instant: a listing that landed elsewhere (the machine's hello, another window's Check again) is announced —
  // a newer list is read again (from the hub's store: nothing is asked of the machine)
  const offListed = app.ws && typeof app.ws.onGlobal === 'function' ? app.ws.onGlobal((msg) => {
    if (!body.isConnected) { try { offListed?.(); } catch { /* gone */ } return; }
    if (msg && msg.type === 'desktop-installed-updated' && msg.hostId === m.hostId && (msg.listedAt || 0) > (apps.get().listedAt || 0) && !apps.get().loading) listApps(false);
  }) : null;
}

/** lane desktop-display-modes: a machine desktop window from its openSpec (a reload, another client): the machine, its mode and
 *  display, ②'s folded panes — it streams at once for the device that opened it, another device's waits for a press. */
export function replayMachineDesktop(app, spec, { syncId } = {}) {
  const hostId = spec && typeof spec.hostId === 'string' ? spec.hostId : '';
  if (!machineDesktopId(hostId)) return null;
  const m = { hostId, label: typeof spec.label === 'string' ? spec.label.slice(0, 120) : null, setup: spec.setup === 'darwin' || spec.setup === 'win32' ? spec.setup : null, code: 'desktop_ready' };
  if (spec.mode === 'all' && Array.isArray(spec.folded)) rememberMode(hostId, { folded: spec.folded });
  return openMachineDesktop(app, m, { mode: modeOf(spec.mode), streamDisplay: spec.display == null ? null : String(spec.display), syncId: syncId || null, restored: !spec.by || spec.by !== deviceTag() });
}

// ── WINDOW-TYPE REGISTRATION ── lane desktop-display-modes: restored by its openSpec (the mode + display are the window's); a
// replayed window never asks the sign-in by itself (design 014 D1 — the VNC picture waits for a press), another device's waits
registerWindowType({ type: 'machine-desktop', label: 'Machine desktop', icon: svgIcon16('<rect x="1.5" y="2.5" width="13" height="9" rx="1"/><path d="M8 11.5V14M5 14h6M4 5.5h8"/>'),
  action: 'openMachineDesktop', replay: (app, spec, { syncId } = {}) => replayMachineDesktop(app, spec, { syncId }) });

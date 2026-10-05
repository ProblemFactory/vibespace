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
import { t } from './i18n.js';
import { createModalShell, fetchJson, showToast } from './utils.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { createVncView, streamUrl } from './vnc-view.js';
import { desktopRunPlan, desktopRunPresets, rememberRun, machineDesktopId } from '../machine-desktop-model.js';

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

/** THE WINDOW: one per machine in this page (a second open reveals it); the picture through the ONE bridge. */
export function openMachineDesktop(app, m) {
  const id = machineDesktopId(m && m.hostId);
  if (!id) return null;
  for (const [wid, win] of app.wm.windows) if (win._machineDesktop === m.hostId) { app.wm.revealWindow(wid); return win; }
  app._hideWelcome?.();
  const machine = nameOf(m);
  const winInfo = app.wm.createWindow({ title: t('{machine} — its desktop', { machine }), type: 'machine-desktop' });
  winInfo._machineDesktop = m.hostId;
  const c = winInfo.content;
  c.style.display = 'flex'; c.style.flexDirection = 'column';
  c.append(el('div', 'flex:0 0 auto;padding:3px 10px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border)', t('This window shows everything on {machine}’s screen, and what you type here goes to it.', { machine })));
  const pane = el('div', 'position:relative;flex:1 1 auto;min-height:0'); c.append(pane);
  let auth = m.auth || null;
  const view = createVncView(pane, {
    url: streamUrl(`/api/desktop/${id}/stream`),
    autoReconnect: true,
    resizeSession: false,
    lastClose: async () => { const r = await fetchJson(`/api/desktop/machine-desktop/last-close?host=${encodeURIComponent(m.hostId)}`); return r && !r.error ? r.close : null; },
    before: async () => { const r = await post('/api/desktop/machine-desktop/connect', { host: m.hostId }); if (!r || r.error) return { ok: false, error: desktopRefusalText(r, m) }; auth = r.auth || auth; return { ok: true }; },
    credentials: (types) => askCredentials(m, types, auth),
  });
  winInfo.onClose = () => view.dispose();
  view.connect();
  return winInfo;
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

/**
 * THE MACHINE'S DIALOG (the launcher opens it for a Windows / macOS row): its state, "Open its desktop", the one-time
 * setup (the Mac's words; Windows' Install… through the launcher's install dialog, `install`), and "Run on its
 * desktop…". `recheck(hostId)` re-reads the machine rows (the probe runs again — an explicit act, never a timer).
 */
export function showMachineDesktopDialog(app, m0, { install = null, recheck = null } = {}) {
  let m = m0;
  const machine = nameOf(m);
  const { body } = createModalShell({ id: 'machine-desktop-dialog', title: t('{machine} — its desktop', { machine }), dialogClass: 'machine-desktop-dialog', escapeToClose: true });
  const state = el('p', 'margin:4px 0');
  const acts = el('div'); acts.className = 'desktop-install-actions';
  const scope = el('p', NOTE, t('Its desktop shows everything on {machine}’s screen, and what you type there goes to it. Only people can open it — agents cannot.', { machine }));
  const runHead = el('div', 'margin-top:12px;font-weight:600', t('Run on its desktop…'));
  const presets = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin:6px 0');
  const runRow = el('div', 'display:flex;gap:6px');
  const input = el('input', 'flex:1 1 auto;min-width:0;font-family:var(--font-mono, monospace)'); input.type = 'text'; input.spellcheck = false; input.autocomplete = 'off'; input.className = 'machine-desktop-cmd';
  const runBtn = btn('btn-create', t('Run…'), () => run());
  runRow.append(input, runBtn);
  body.append(state, acts, scope, runHead, presets, runRow, el('p', NOTE, t('It starts on {machine}’s desktop as you — the exact command is shown before it runs.', { machine })));
  const check = async () => { if (!recheck) return; const next = await recheck(m.hostId); if (next && body.isConnected) { m = next; render(); } };
  function render() {
    state.textContent = desktopStateText(m);
    state.style.color = m.code === 'desktop_ready' ? '' : 'var(--warning, #d9822b)';
    acts.replaceChildren();
    if (m.code === 'desktop_ready') acts.append(btn('btn-create', t('Open its desktop'), () => { openMachineDesktop(app, m); }));
    if (m.code === 'no_vnc' && m.setup === 'win32' && install) acts.append(btn('btn-create', t('Install TightVNC Server…'), () => install(m, { what: 'tightvnc', onDone: () => check() })));
    if (m.code !== 'offline' && recheck) acts.append(btn('file-tool-btn', t('Check again'), () => check()));
    const offline = m.code === 'offline';
    input.disabled = offline; runBtn.disabled = offline;
    const list = desktopRunPresets(m.setup, readRuns()[m.hostId]);
    input.placeholder = list.length ? t('A command, e.g. {example}', { example: list[0].cmd }) : t('A command');
    presets.replaceChildren(...list.map((p) => { const b = btn('file-tool-btn', p.label, () => { input.value = p.cmd; input.focus(); }); b.style.cssText = 'width:auto;padding:0 10px'; b.title = p.cmd; b.disabled = offline; return b; }));
  }
  async function run() {
    const line = input.value;
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
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } };
  render();
}

// ── WINDOW-TYPE REGISTRATION ── not persisted: a reload never re-opens a machine's whole screen (it asks the sign-in)
registerWindowType({ type: 'machine-desktop', label: 'Machine desktop', persist: false, icon: svgIcon16('<rect x="1.5" y="2.5" width="13" height="9" rx="1"/><path d="M8 11.5V14M5 14h6M4 5.5h8"/>') });

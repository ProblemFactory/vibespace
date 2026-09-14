// THE DESKTOP-APP LAUNCHER (docs/design-desktop-apps.zh.md §2 row 8; P8-1,
// 2026-09-13): the ⚙ "Desktop apps…" row and the toolbar Apps button are
// CONTRIBUTIONS (contributions.js — a command + a gear menu item, never an
// edit to a literal), and the launch dialog is a createModalShell: the
// registry (each row presence-checked by the server, an absent binary is a
// disabled row that SAYS why), the running sessions (open / stop), "Run a
// command" (exec, args, cwd with the shared directory autocomplete) and the
// recents persisted in user state (`desktopAppRecents`, PATCHed — merge-only,
// the B-b87b belt). ≤768px collapses to one column. Every failure reaches a
// toast (fetchJson never throws; the server always answers `{error}`).
// It holds NO session state: the dialog re-reads /api/desktop/apps when it
// opens and listens to the `desktop-apps-updated` broadcast while open.
import { t } from './i18n.js';
import { createModalShell, escHtml, fetchJson, showToast } from './utils.js';
import { registerCommand, registerMenuItem, runCommand } from './contributions.js';
import { setupDirAutocomplete } from './autocomplete.js';

export const COMMAND_ID = 'desktopApps.open';
const RECENTS_KEY = 'desktopAppRecents';
const RECENTS_MAX = 8;
const APPS_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="10" rx="1"/><path d="M1.5 5.5h13M4 4h.01M6 4h.01"/></svg>';

/** The availability sentence for the dialog head — the ladder's verdict in
 *  the same words the status chip uses. */
export function availabilityText(av) {
  if (!av) return t('Checking display backends…');
  if (!av.backend) return t('No display backend on this machine ({why})', { why: av.fallbackWhy || '' });
  return av.fallbackWhy ? t('Windows will use {backend} — {why}', { backend: av.backend, why: av.fallbackWhy }) : t('Windows will use {backend}', { backend: av.backend });
}

/** Merge a launch into the recents list (newest first, de-duplicated on the
 *  command line, capped). PURE — the suite drives it. */
export function pushRecent(list, entry, max = RECENTS_MAX) {
  const key = (e) => JSON.stringify([e.exec, e.args || [], e.cwd || null]);
  const k = key(entry);
  const out = [{ exec: entry.exec, args: entry.args || [], cwd: entry.cwd || null, label: entry.label || entry.exec, at: entry.at || Date.now() }];
  for (const e of Array.isArray(list) ? list : []) { if (key(e) !== k && out.length < max) out.push(e); }
  return out;
}

/** Split a typed args line on whitespace, honouring simple quotes. PURE. */
export function splitArgs(line) {
  const out = []; let cur = ''; let q = null; let had = false;
  for (const ch of String(line || '')) {
    if (q) { if (ch === q) { q = null; } else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; had = true; continue; }
    if (/\s/.test(ch)) { if (cur || had) { out.push(cur); cur = ''; had = false; } continue; }
    cur += ch;
  }
  if (cur || had) out.push(cur);
  return out;
}

export function installDesktopAppLauncher(app) {
  app._desktopAppsAvailable = false;
  registerCommand({ id: COMMAND_ID, title: 'Desktop apps…', icon: APPS_ICON, run: (ctx) => showLaunchDialog((ctx && ctx.app) || app) });
  registerMenuItem({ menu: 'gear', group: '1_admin', order: 45, icon: APPS_ICON, when: (c) => !!c.app._desktopAppsAvailable, label: () => t('Desktop apps…'), run: (c) => runCommand(COMMAND_ID, { app: c.app }) });
  const btn = document.getElementById('btn-desktop-apps');
  if (btn) btn.addEventListener('click', () => runCommand(COMMAND_ID, { app }));

  // Probed at startup AND on every ws reconnect (the Desktop button's lesson:
  // a page loaded during a restart window must self-heal without an F5).
  const probe = (attempt = 0) => {
    fetchJson('/api/desktop/apps').then((d) => {
      if (d == null) throw new Error('probe failed');
      app._desktopAppsAvailable = !!(d.availability && d.availability.backend);
      app._applyChromeSettings?.();
    }).catch(() => { if (attempt < 5) setTimeout(() => probe(attempt + 1), [3000, 8000, 20000, 45000, 90000][attempt]); });
  };
  probe();
  app.ws.onStateChange?.((connected) => { if (connected && !app._desktopAppsAvailable) probe(); });
}

export async function showLaunchDialog(app) {
  const { overlay, body, close } = createModalShell({ id: 'desktop-launch-dialog', title: t('Desktop apps'), dialogClass: 'desktop-launch', escapeToClose: true });
  body.innerHTML = `
    <div class="desktop-launch-avail"></div>
    <div class="desktop-launch-cols">
      <div class="desktop-launch-col">
        <h4>${escHtml(t('Applications'))}</h4>
        <div class="desktop-launch-registry"></div>
        <h4>${escHtml(t('Running'))}</h4>
        <div class="desktop-launch-running"></div>
      </div>
      <div class="desktop-launch-col">
        <h4>${escHtml(t('Run a command'))}</h4>
        <label class="desktop-launch-field"><span>${escHtml(t('Command'))}</span><input type="text" class="desktop-launch-exec" placeholder="xterm" autocomplete="off" spellcheck="false"></label>
        <label class="desktop-launch-field"><span>${escHtml(t('Arguments'))}</span><input type="text" class="desktop-launch-args" placeholder="-fa Monospace -fs 12" autocomplete="off" spellcheck="false"></label>
        <label class="desktop-launch-field"><span>${escHtml(t('Working directory'))}</span><div class="autocomplete-wrapper"><input type="text" class="desktop-launch-cwd" placeholder="~" autocomplete="off" spellcheck="false"><div class="autocomplete-dropdown hidden"></div></div></label>
        <div class="desktop-launch-actions"><button class="btn-create desktop-launch-run">${escHtml(t('Launch'))}</button></div>
        <h4>${escHtml(t('Recent'))}</h4>
        <div class="desktop-launch-recents"></div>
      </div>
    </div>`;
  const $ = (sel) => body.querySelector(sel);
  const availEl = $('.desktop-launch-avail'), regEl = $('.desktop-launch-registry'), runEl = $('.desktop-launch-running'), recEl = $('.desktop-launch-recents');
  const execIn = $('.desktop-launch-exec'), argsIn = $('.desktop-launch-args'), cwdIn = $('.desktop-launch-cwd'), runBtn = $('.desktop-launch-run');
  setupDirAutocomplete(cwdIn, $('.autocomplete-dropdown'));

  let data = null;
  let recents = [];
  const busy = new Set();

  const launch = async (payload, recent) => {
    runBtn.disabled = true;
    const r = await fetchJson('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    runBtn.disabled = false;
    if (!r || r.error) { showToast(r?.error || t('Could not launch the application'), { type: 'error' }); return null; }
    if (recent) {
      recents = pushRecent(recents, { ...recent, label: r.label });
      fetch('/api/user-state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [RECENTS_KEY]: recents }) }).catch(() => {});
    }
    close();
    app.openDesktopApp(r.id);
    return r;
  };

  const render = () => {
    availEl.textContent = availabilityText(data && data.availability);
    availEl.classList.toggle('desktop-launch-avail-bad', !!(data && !data.availability?.backend));
    const capUsed = data?.cap?.used ?? 0, cap = data?.cap?.cap ?? 0;
    regEl.innerHTML = '';
    for (const row of (data?.registry || [])) {
      const b = document.createElement('button');
      b.className = 'desktop-launch-app';
      b.innerHTML = `<span class="desktop-launch-app-label">${escHtml(row.label)}</span><span class="desktop-launch-app-sub">${escHtml(row.available ? (row.reason || row.exec) : (row.reason || t('not on PATH')))}</span>`;
      b.disabled = !row.available || !!row.parkedUntil || !data?.availability?.backend;
      b.title = row.available ? (row.path || row.exec) : (row.reason || '');
      b.onclick = () => launch({ appId: row.id }, null);
      regEl.appendChild(b);
    }
    if (!regEl.children.length) regEl.innerHTML = `<div class="desktop-launch-empty">${escHtml(t('No known applications on this machine'))}</div>`;
    runEl.innerHTML = '';
    const live = (data?.apps || []).filter((a) => a.state === 'ready' || a.state === 'launching');
    for (const a of live) {
      const row = document.createElement('div'); row.className = 'desktop-launch-run-row';
      row.innerHTML = `<span class="desktop-app-row-label">${escHtml(a.label || a.exec)}</span><span class="desktop-app-row-state">${escHtml(a.state === 'ready' ? t('running') : t('starting'))}</span>`;
      const open = document.createElement('button'); open.className = 'file-tool-btn'; open.style.cssText = 'width:auto;padding:0 8px;font-size:10px'; open.textContent = t('Open');
      open.onclick = () => { close(); app.openDesktopApp(a.id); };
      const stop = document.createElement('button'); stop.className = 'file-tool-btn desktop-app-stop'; stop.style.cssText = 'width:auto;padding:0 8px;font-size:10px'; stop.textContent = t('Stop');
      stop.disabled = busy.has(a.id);
      stop.onclick = async () => {
        busy.add(a.id); stop.disabled = true;
        const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(a.id)}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        busy.delete(a.id);
        if (!r || r.error) showToast(r?.error || t('Could not stop the app'), { type: 'error' });
        refresh();
      };
      row.append(open, stop);
      runEl.appendChild(row);
    }
    if (!live.length) runEl.innerHTML = `<div class="desktop-launch-empty">${escHtml(t('Nothing running'))}</div>`;
    else if (cap) { const c = document.createElement('div'); c.className = 'desktop-launch-empty'; c.textContent = t('{used} of {cap} slots in use', { used: capUsed, cap }); runEl.appendChild(c); }
    recEl.innerHTML = '';
    for (const e of recents) {
      const b = document.createElement('button'); b.className = 'desktop-launch-app';
      b.innerHTML = `<span class="desktop-launch-app-label">${escHtml(e.label || e.exec)}</span><span class="desktop-launch-app-sub">${escHtml([e.exec, ...(e.args || [])].join(' '))}${e.cwd ? escHtml(' · ' + e.cwd) : ''}</span>`;
      b.disabled = !data?.availability?.backend;
      b.onclick = () => launch({ exec: e.exec, args: e.args || [], cwd: e.cwd || undefined, label: e.label }, e);
      recEl.appendChild(b);
    }
    if (!recents.length) recEl.innerHTML = `<div class="desktop-launch-empty">${escHtml(t('No recent commands'))}</div>`;
    const dead = !data?.availability?.backend;
    runBtn.disabled = dead;
    execIn.disabled = argsIn.disabled = cwdIn.disabled = dead;
  };
  const refresh = async () => {
    const d = await fetchJson('/api/desktop/apps');
    if (d && !d.error) data = d;
    else if (d && d.error) showToast(d.error, { type: 'error' });
    render();
  };
  runBtn.onclick = () => {
    const exec = execIn.value.trim();
    if (!exec) { showToast(t('Type a command to run'), { type: 'error' }); execIn.focus(); return; }
    const args = splitArgs(argsIn.value);
    const cwd = cwdIn.value.trim() || undefined;
    launch({ exec, args, cwd }, { exec, args, cwd: cwd || null });
  };
  execIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') runBtn.click(); });
  argsIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') runBtn.click(); });

  const off = app.ws.onGlobal((m) => { if (m.type === 'desktop-apps-updated' && overlay.isConnected) { if (data) { data.apps = m.apps; render(); } } });
  const obs = new MutationObserver(() => { if (!overlay.isConnected) { try { off?.(); } catch {} obs.disconnect(); } });
  obs.observe(document.body, { childList: true });

  render();
  fetchJson('/api/user-state').then((s) => { if (s && Array.isArray(s[RECENTS_KEY])) { recents = s[RECENTS_KEY].slice(0, RECENTS_MAX); render(); } });
  await refresh();
  setTimeout(() => execIn.focus(), 0);
  return { overlay, close };
}

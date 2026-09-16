// THE DESKTOP-APP LAUNCHER (docs/design-desktop-apps.zh.md §2 row 8; P8-1,
// 2026-09-13; CATALOG-FIRST since 2026-09-14): the ⚙ "Desktop apps…" row and
// the toolbar Apps button are CONTRIBUTIONS (contributions.js — a command + a
// gear menu item, never an edit to a literal), and the launch dialog is a
// createModalShell that a user who has never seen X11 can use:
//   1. an intro line in plain words (what this does, what to click);
//   2. RUNNING sessions (Open / Stop + the slot count), shown above the
//      catalog whenever there is one;
//   3. the APPLICATIONS catalog as the primary surface — a grid of cards
//      (label + one-line exec/reason + an SVG icon from icons.js), one click
//      launches, a launching card shows a spinner and stays disabled until
//      the record answers; an app whose binary is absent is shown DIMMED with
//      its reason, never hidden; an empty catalog says so in plain words and
//      expands the command form by itself;
//   4. "Advanced: run any command" — exec / args / cwd (the shared directory
//      autocomplete) + Launch + Recent, under a disclosure (a BUTTON with
//      aria-expanded) that is COLLAPSED by default and whose open/closed state
//      persists in user state (`desktopAppAdvancedOpen`, a merge-only PATCH
//      like `desktopAppRecents`, the B-b87b belt);
//   5. the backend availability chip in the ladder's own words.
// ≤768px is one column. Every failure reaches a toast (fetchJson never throws;
// the server always answers `{error}`). The dialog holds NO session state: it
// re-reads /api/desktop/apps when it opens and follows the
// `desktop-apps-updated` broadcast while open.
//
// GEOMETRY (2026-09-14, reproduced at 1000×800@2x — the owner's picture): the
// dialog WIDTH lives on `.dialog.desktop-launch` in style.css, never on the
// body (a body min-width inside .dialog's fixed 440px + overflow:hidden
// clipped the right half), and every programmatic focus here passes
// `{ preventScroll: true }` — an overflow:hidden box is still a scroll
// container, and the UA's focus scroll-into-view on the Command input was
// what scrolled the title off-left. test-desktop-app-window pins the three
// viewports with computed geometry.
import { t } from './i18n.js';
import { createModalShell, escHtml, fetchJson, showToast } from './utils.js';
import { registerCommand, registerMenuItem, runCommand } from './contributions.js';
import { setupDirAutocomplete } from './autocomplete.js';
import { FILE_ICONS, UI_ICONS } from './icons.js';

export const COMMAND_ID = 'desktopApps.open';
const RECENTS_KEY = 'desktopAppRecents';
export const ADVANCED_KEY = 'desktopAppAdvancedOpen';
const RECENTS_MAX = 8;
const APPS_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="10" rx="1"/><path d="M1.5 5.5h13M4 4h.01M6 4h.01"/></svg>';
// The card icon by registry CATEGORY (src/desktop-apps.js DEFAULT_REGISTRY
// rows carry one) — all from icons.js, SVG only, never emoji.
const CATEGORY_ICONS = Object.freeze({ terminal: UI_ICONS.terminal, editor: UI_ICONS.pencil, browser: FILE_ICONS.web, utility: UI_ICONS.wrench });

/** The availability sentence for the dialog head — the ladder's verdict in
 *  the same words the status chip uses. */
export function availabilityText(av) {
  if (!av) return t('Checking display backends…');
  if (!av.backend) return t('No display backend on this machine ({why})', { why: av.fallbackWhy || '' });
  return av.fallbackWhy ? t('Windows will use {backend} — {why}', { backend: av.backend, why: av.fallbackWhy }) : t('Windows will use {backend}', { backend: av.backend });
}

/** The SVG for a catalog card, by the row's category (falls back to the
 *  window glyph). PURE — the suite pins that every answer is an SVG. */
export function cardIconFor(category) {
  return CATEGORY_ICONS[String(category || '')] || APPS_ICON;
}

/** Is the "Advanced" disclosure open at dialog open? PURE: the persisted
 *  preference wins, and an EMPTY catalog forces it open (there is nothing
 *  else to click) without persisting anything. */
export function advancedOpenFor(userState, registryEmpty) {
  if (registryEmpty) return true;
  return userState?.[ADVANCED_KEY] === true;
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

const patchUserState = (patch) => fetch('/api/user-state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => {});

export async function showLaunchDialog(app) {
  const { overlay, body, close } = createModalShell({ id: 'desktop-launch-dialog', title: t('Desktop apps'), dialogClass: 'desktop-launch', escapeToClose: true });
  body.innerHTML = `
    <p class="desktop-launch-intro">${escHtml(t('Opens a graphical program from this machine in a VibeSpace window you drive with your mouse and keyboard. Click an application below to open it, or use “Advanced” to run any command.'))}</p>
    <div class="desktop-launch-avail"></div>
    <section class="desktop-launch-sec desktop-launch-running-sec is-empty">
      <h4>${escHtml(t('Running'))}<span class="desktop-launch-count"></span></h4>
      <div class="desktop-launch-running"></div>
    </section>
    <section class="desktop-launch-sec">
      <h4>${escHtml(t('Applications'))}</h4>
      <div class="desktop-launch-registry desktop-launch-grid"></div>
    </section>
    <div class="desktop-launch-adv">
      <button type="button" class="desktop-launch-adv-toggle" aria-expanded="false" aria-controls="desktop-launch-adv-body">${UI_ICONS.chevronDown}<span>${escHtml(t('Advanced: run any command'))}</span></button>
      <div class="desktop-launch-adv-body collapsed" id="desktop-launch-adv-body">
        <div class="desktop-launch-cols">
          <div class="desktop-launch-col">
            <h4>${escHtml(t('Run a command'))}</h4>
            <label class="desktop-launch-field"><span>${escHtml(t('Command'))}</span><input type="text" class="desktop-launch-exec" placeholder="xterm" autocomplete="off" spellcheck="false"></label>
            <label class="desktop-launch-field"><span>${escHtml(t('Arguments'))}</span><input type="text" class="desktop-launch-args" placeholder="-fa Monospace -fs 12" autocomplete="off" spellcheck="false"></label>
            <label class="desktop-launch-field"><span>${escHtml(t('Working directory'))}</span><div class="autocomplete-wrapper"><input type="text" class="desktop-launch-cwd" placeholder="~" autocomplete="off" spellcheck="false"><div class="autocomplete-dropdown hidden"></div></div></label>
            <div class="desktop-launch-actions"><button class="btn-create desktop-launch-run">${escHtml(t('Launch'))}</button></div>
          </div>
          <div class="desktop-launch-col">
            <h4>${escHtml(t('Recent'))}</h4>
            <div class="desktop-launch-recents"></div>
          </div>
        </div>
      </div>
    </div>`;
  const $ = (sel) => body.querySelector(sel);
  const availEl = $('.desktop-launch-avail'), regEl = $('.desktop-launch-registry'), runEl = $('.desktop-launch-running'), recEl = $('.desktop-launch-recents');
  const runSec = $('.desktop-launch-running-sec'), countEl = $('.desktop-launch-count');
  const advToggle = $('.desktop-launch-adv-toggle'), advBody = $('.desktop-launch-adv-body');
  const execIn = $('.desktop-launch-exec'), argsIn = $('.desktop-launch-args'), cwdIn = $('.desktop-launch-cwd'), runBtn = $('.desktop-launch-run');
  setupDirAutocomplete(cwdIn, $('.autocomplete-dropdown'));

  let data = null;
  let recents = [];
  let advancedOpen = false;
  const busy = new Set();      // stop in flight, by session id
  const launching = new Set(); // card launch in flight, by registry row id

  // Insurance for every programmatic focus in this dialog: preventScroll. The
  // 2026-09-14 defect was the UA scrolling `.dialog` (overflow:hidden is still
  // a scroll container) to bring a clipped input into view.
  const focusQuiet = (el) => { try { el?.focus({ preventScroll: true }); } catch { el?.focus(); } };
  const setAdvanced = (open, { persist = false } = {}) => {
    advancedOpen = !!open;
    advBody.classList.toggle('collapsed', !advancedOpen);
    advToggle.setAttribute('aria-expanded', advancedOpen ? 'true' : 'false');
    if (persist) patchUserState({ [ADVANCED_KEY]: advancedOpen });
  };
  advToggle.onclick = () => { setAdvanced(!advancedOpen, { persist: true }); if (advancedOpen) focusQuiet(execIn); };

  const launch = async (payload, recent) => {
    runBtn.disabled = true;
    const r = await fetchJson('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    runBtn.disabled = false;
    if (!r || r.error) { showToast(r?.error || t('Could not launch the application'), { type: 'error' }); return null; }
    if (recent) {
      recents = pushRecent(recents, { ...recent, label: r.label });
      patchUserState({ [RECENTS_KEY]: recents });
    }
    close();
    app.openDesktopApp(r.id);
    return r;
  };

  const render = () => {
    availEl.textContent = availabilityText(data && data.availability);
    availEl.classList.toggle('desktop-launch-avail-bad', !!(data && !data.availability?.backend));
    const dead = !data?.availability?.backend;
    const capUsed = data?.cap?.used ?? 0, cap = data?.cap?.cap ?? 0;
    // ── the catalog ──
    regEl.innerHTML = '';
    for (const row of (data?.registry || [])) {
      const b = document.createElement('button');
      b.type = 'button';
      const isLaunching = launching.has(row.id);
      const unavailable = !row.available || !!row.parkedUntil;
      b.className = 'desktop-launch-card' + (unavailable ? ' is-unavailable' : '') + (isLaunching ? ' is-launching' : '');
      const sub = isLaunching ? t('Launching…') : row.available ? (row.reason || row.exec) : (row.reason || t('not on PATH'));
      b.innerHTML = `<span class="desktop-launch-card-icon">${isLaunching ? UI_ICONS.refresh : cardIconFor(row.category)}</span><span class="desktop-launch-card-label">${escHtml(row.label)}</span><span class="desktop-launch-card-sub">${escHtml(sub)}</span>`;
      b.disabled = unavailable || dead || isLaunching;
      b.setAttribute('aria-disabled', b.disabled ? 'true' : 'false');
      if (isLaunching) b.setAttribute('aria-busy', 'true');
      b.title = row.available ? (row.path || row.exec) : (row.reason || '');
      b.dataset.appId = row.id;
      b.onclick = async () => {
        if (b.disabled) return;
        launching.add(row.id); render();
        const r = await launch({ appId: row.id }, null);
        if (!r) { launching.delete(row.id); render(); }
      };
      regEl.appendChild(b);
    }
    const registryEmpty = !regEl.children.length;
    if (registryEmpty) regEl.innerHTML = `<div class="desktop-launch-empty">${escHtml(t('No known applications were found on this machine — use “Advanced” below to run any program.'))}</div>`;
    // ── running ──
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
    runSec.classList.toggle('is-empty', !live.length);
    // the count is the LIVE list's (the broadcast refreshes `data.apps`, never the cap snapshot taken at open — a starting session read "0 of 6")
    countEl.textContent = live.length ? (cap ? t('{used} of {cap} slots in use', { used: Math.max(capUsed, live.length), cap }) : t('{n} running', { n: live.length })) : '';
    // ── advanced: recents + the form ──
    recEl.innerHTML = '';
    for (const e of recents) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'desktop-launch-app';
      b.innerHTML = `<span class="desktop-launch-app-label">${escHtml(e.label || e.exec)}</span><span class="desktop-launch-app-sub">${escHtml([e.exec, ...(e.args || [])].join(' '))}${e.cwd ? escHtml(' · ' + e.cwd) : ''}</span>`;
      b.disabled = dead;
      b.onclick = () => launch({ exec: e.exec, args: e.args || [], cwd: e.cwd || undefined, label: e.label }, e);
      recEl.appendChild(b);
    }
    if (!recents.length) recEl.innerHTML = `<div class="desktop-launch-empty">${escHtml(t('No recent commands'))}</div>`;
    runBtn.disabled = dead;
    execIn.disabled = argsIn.disabled = cwdIn.disabled = dead;
    return { registryEmpty };
  };
  const refresh = async () => {
    const d = await fetchJson('/api/desktop/apps');
    if (d && !d.error) data = d;
    else if (d && d.error) showToast(d.error, { type: 'error' });
    return render();
  };
  runBtn.onclick = () => {
    const exec = execIn.value.trim();
    if (!exec) { showToast(t('Type a command to run'), { type: 'error' }); focusQuiet(execIn); return; }
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
  // user state (recents + the disclosure preference) and the registry, then
  // decide the disclosure ONCE: the persisted preference, or forced open by an
  // empty catalog (nothing else to click — not persisted)
  const [state, first] = await Promise.all([fetchJson('/api/user-state'), refresh()]);
  if (state && Array.isArray(state[RECENTS_KEY])) { recents = state[RECENTS_KEY].slice(0, RECENTS_MAX); render(); }
  setAdvanced(advancedOpenFor(state, !!first?.registryEmpty));
  setTimeout(() => {
    if (!overlay.isConnected) return;
    if (advancedOpen) focusQuiet(execIn);
    else focusQuiet(regEl.querySelector('.desktop-launch-card:not(:disabled)') || advToggle);
  }, 0);
  return { overlay, close };
}

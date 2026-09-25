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
//   3b. BROWSERS (B-bfe6, 2026-09-23) — the registry's browser rows under their
//      own heading with the ONE sentence that separates them from the Agent
//      browser (in the section AND in each card's tooltip), an optional
//      "Open URL" (http/https, checked by the PURE `validateBrowserUrl` before
//      the request and by the server again) and a "keep the profile" choice;
//      both ride the launch as `url` / `keepProfile` for a browser row only.
//   6. MACHINES (lane C2, docs/design-desktop-apps-seamless §3.5) — a picker above the catalog: this machine + every
//      paired machine (GET /api/desktop/machines, the PURE machinePickRow verdict), a machine that cannot run apps
//      GREYED with its reason in plain words (never hidden); choosing one re-reads ITS catalog, ladder and cap
//      (GET /api/desktop/apps?host=), the launch carries `host`. A machine without xpra offers
//      "Install xpra on <machine>…": the PLAN first (source, every command), then the run with its log streamed into
//      the dialog; no passwordless sudo ⇒ the commands to copy, said by name.
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
import { copyText, createModalShell, escHtml, fetchJson, showToast, uiScale } from './utils.js';
import { registerCommand, registerMenuItem, runCommand } from './contributions.js';
import { setupDirAutocomplete } from './autocomplete.js';
import { FILE_ICONS, UI_ICONS } from './icons.js';
import { validateBrowserUrl } from '../desktop-apps.js';

export const COMMAND_ID = 'desktopApps.open';
const RECENTS_KEY = 'desktopAppRecents';
export const ADVANCED_KEY = 'desktopAppAdvancedOpen';
const RECENTS_MAX = 8;
const APPS_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="10" rx="1"/><path d="M1.5 5.5h13M4 4h.01M6 4h.01"/></svg>';
// The card icon by registry CATEGORY (src/desktop-apps.js DEFAULT_REGISTRY
// rows carry one) — all from icons.js, SVG only, never emoji.
const CATEGORY_ICONS = Object.freeze({ terminal: UI_ICONS.terminal, editor: UI_ICONS.pencil, browser: FILE_ICONS.web, utility: UI_ICONS.wrench });

/** The launching client's devicePixelRatio for POST /api/desktop/apps (`dpr`, the route accepts 1..3):
 *  a zoomed-out page (< 1) launches at 1, anything above 3 at 3. */
export function launchDpr(v = (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(3, Math.max(1, Math.round(n * 100) / 100)) : 1;
}

/** Round 3 A3: the launching client's UI scale (utils applyUiPrefs' body zoom — 1 on a phone) for the same POST
 *  (`uiScale`, the route accepts 0.6..2): under `desktop.appScale: auto` the app's scale is dpr × this. */
export function launchUiScale(v = uiScale()) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(2, Math.max(0.6, Math.round(n * 100) / 100)) : 1;
}

/** B-bfe6: the ONE sentence that tells a desktop-app browser apart from the Agent browser — the Browsers section
 *  prints it and every browser card carries it in its tooltip (a function: `t` must run after the language loads). */
export const browserNote = () => t('This is your own browser window (an app); the Agent browser is separate');
/** B-bfe6 r1: the SHORT, translated reason a dimmed browser card shows, by the keeper's verdict CODE (the verdict's
 *  own sentence — with its data-dir path — stays the card's tooltip). null ⇒ the card falls back to the sentence. */
export function browserReasonShort(code) {
  if (code === 'snap-profile-unreachable') return t('Snap: cannot reach the data folder');
  if (code === 'browser-absent') return t('not on PATH');
  if (code === 'profile-is-users' || code === 'profile-not-owned') return t('No private profile folder here');
  return null;
}

/** The launch body of a browser card (PURE — the suite drives it): `{appId}` plus the typed URL when there is one
 *  (refused by name when it is not http/https — `{error}`) and `keepProfile` only when chosen. */
export function browserLaunchBody(row, { url = '', keepProfile = false } = {}) {
  const typed = String(url || '').trim();
  const body = { appId: row.id };
  if (typed) {
    const v = validateBrowserUrl(typed);
    if (!v.ok) return { error: v.error, code: v.code };
    body.url = v.url;
  }
  if (keepProfile) body.keepProfile = true;
  return { body };
}

/** The availability sentence for the dialog head — the ladder's verdict in
 *  the same words the status chip uses; lane C2: `machine` = a paired machine's name (absent = this machine). */
export function availabilityText(av, machine = null) {
  if (!av) return t('Checking display backends…');
  if (machine) {
    if (!av.backend) return t('No display backend on {machine} ({why})', { machine, why: av.fallbackWhy || '' });
    return av.fallbackWhy ? t('Windows on {machine} will use {backend} — {why}', { machine, backend: av.backend, why: av.fallbackWhy }) : t('Windows on {machine} will use {backend}', { machine, backend: av.backend });
  }
  if (!av.backend) return t('No display backend on this machine ({why})', { why: av.fallbackWhy || '' });
  return av.fallbackWhy ? t('Windows will use {backend} — {why}', { backend: av.backend, why: av.fallbackWhy }) : t('Windows will use {backend}', { backend: av.backend });
}

/** lane C2: a machine picker row's name ("This machine" for the hub itself — a DISPLAY string, never a spawn input). */
export function machineName(m) { return !m || !m.hostId || m.hostId === 'local' ? t('This machine') : String(m.label || m.hostId); }
/** lane C2: why a machine row is greyed (or what choosing it does), by the PURE verdict's code. '' = nothing to say. */
export function machineWhyText(code) {
  if (code === 'offline') return t('offline');
  if (code === 'host_needs_daemon') return t('needs the agent upgraded');
  if (code === 'no_x11') return t('no X11 (macOS / Windows)');
  if (code === 'connect') return t('connects when chosen');
  return '';
}
/** lane C2: the dialog head's words when a machine's list failed, by the server's code. */
export function machineErrorText(code, machine, why = '') {
  if (code === 'host_needs_daemon') return t('The VibeSpace agent on {machine} is too old to run desktop apps — reconnect the machine to upgrade it', { machine });
  if (code === 'host_unavailable') return t('{machine} is not answering: {why}', { machine, why });
  if (code === 'unsupported-host') return t('{machine} is not a machine on this instance', { machine });
  return why || t('Could not reach {machine}', { machine });
}
/** lane C2: offer "Install xpra on <machine>…" when the chosen machine's facts show no xpra (PURE: the suite drives it). */
export function installOfferFor(av, m) {
  if (!av || (m && m.code === 'no_x11')) return false;
  return !(av.xpra && av.xpra.version);
}
/** lane C2: the install dialog's words for a plan the machine cannot run, by code. */
export function installRefusalText(code) {
  if (code === 'no_x11') return t('This machine runs macOS or Windows — it has no X11 server, so desktop apps cannot run there.');
  if (code === 'no_apt') return t('This Linux has no apt-get — install xpra 6.x by hand from xpra.org.');
  if (code === 'no_repo') return t('Its package sources offer only an old xpra and xpra.org publishes nothing for this release — install xpra 6.x by hand.');
  if (code === 'no_sudo') return t('This machine has no passwordless sudo — run these commands yourself in a terminal there, then check again.');
  if (code === 'no_facts') return t('The agent on this machine did not report what it runs — reconnect it to upgrade the agent.');
  if (code === 'busy') return t('An install is already running on this machine — wait for it to finish, then check again.');
  if (code === 'install_timeout') return t('The install did not finish in time and is still running on this machine — VibeSpace never stops apt halfway. Check again once it ends.');
  if (code === 'install_link_lost') return t('The link to this machine dropped during the install. The install keeps running there — once the machine is back and has finished it, check again.');
  if (code === 'install_unrecorded') return t('The install ended without saying how (it was stopped, or the machine restarted) — check again.');
  return '';
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
  registerMenuItem({ menu: 'gear', parent: 'tools', order: 30, icon: APPS_ICON, /* under Tools ▸ (gear-menu.js head 'tools'; Usage 10 · Background Work 20 · this 30 · Plugins 40) */ when: (c) => !!c.app._desktopAppsAvailable, label: () => t('Desktop apps…'), run: (c) => runCommand(COMMAND_ID, { app: c.app }) });
  const btn = document.getElementById('btn-desktop-apps');
  if (btn) btn.addEventListener('click', () => runCommand(COMMAND_ID, { app }));

  // Probed at startup AND on every ws reconnect (the Desktop button's lesson:
  // a page loaded during a restart window must self-heal without an F5).
  const probe = (attempt = 0) => {
    fetchJson('/api/desktop/apps').then(async (d) => {
      if (d == null) throw new Error('probe failed');
      let ok = !!(d.availability && d.availability.backend);
      // lane C2: no display backend HERE but a paired machine that could run apps (or take the install rung) — the
      // entry stays reachable (the dialog greys what cannot run and offers "Install xpra on <machine>…")
      if (!ok) { const m = await fetchJson('/api/desktop/machines'); ok = !!(m && Array.isArray(m.machines) && m.machines.some((x) => x.hostId !== 'local' && x.code !== 'no_x11')); }
      app._desktopAppsAvailable = ok;
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
    <p class="desktop-launch-intro">${escHtml(t('Opens a graphical program from this machine in a VibeSpace window you drive with your mouse and keyboard — the agent cannot reach it. Click an application below to open it, or use “Advanced” to run any command.'))}</p>
    <div class="desktop-launch-machines" role="group" aria-label="${escHtml(t('Machine'))}"><span class="desktop-launch-machines-label">${escHtml(t('Run on'))}</span></div>
    <div class="desktop-launch-avail"></div>
    <div class="desktop-launch-install is-empty"></div>
    <section class="desktop-launch-sec desktop-launch-running-sec is-empty">
      <h4>${escHtml(t('Running'))}<span class="desktop-launch-count"></span></h4>
      <div class="desktop-launch-running"></div>
    </section>
    <section class="desktop-launch-sec desktop-launch-desk-sec">
      <h4>${escHtml(t('Agents on your real desktop'))}<span class="desktop-launch-desk-state"></span></h4>
      <div class="desktop-launch-desk"></div>
    </section>
    <section class="desktop-launch-sec">
      <h4>${escHtml(t('Applications'))}</h4>
      <div class="desktop-launch-registry desktop-launch-grid"></div>
    </section>
    <section class="desktop-launch-sec desktop-launch-browsers-sec is-empty">
      <h4>${escHtml(t('Browsers'))}</h4>
      <p class="desktop-launch-browser-note">${escHtml(browserNote())}</p>
      <div class="desktop-launch-browser-opts">
        <label class="desktop-launch-field desktop-launch-url-field"><span>${escHtml(t('Open URL (optional)'))}</span><input type="url" class="desktop-launch-url" placeholder="https://" autocomplete="off" spellcheck="false"></label>
        <label class="desktop-launch-check"><input type="checkbox" class="desktop-launch-keep-profile"><span>${escHtml(t('Keep the profile after it closes'))}</span></label>
      </div>
      <div class="desktop-launch-browsers desktop-launch-grid"></div>
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
  const browsersSec = $('.desktop-launch-browsers-sec'), browsersEl = $('.desktop-launch-browsers'), urlIn = $('.desktop-launch-url'), keepIn = $('.desktop-launch-keep-profile');
  const runSec = $('.desktop-launch-running-sec'), countEl = $('.desktop-launch-count');
  const machinesEl = $('.desktop-launch-machines'), installEl = $('.desktop-launch-install');
  let host = 'local';       // lane C2: the machine the catalog + a launch are for
  let machines = [];        // GET /api/desktop/machines (the PURE picker verdicts)
  let listError = null;     // { code, error } when the chosen machine's list failed
  const machineOf = (id) => machines.find((m) => m.hostId === id) || { hostId: id, label: id };
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
    // HiDPI (2.369.158): THIS client's devicePixelRatio rides the launch; round 3 A3: and its UI scale — under
    // `desktop.appScale: auto` the app's scale is derived from dpr × uiScale (VibeSpace's own effective scale here)
    const r = await fetchJson('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, dpr: launchDpr(), uiScale: launchUiScale(), ...(host !== 'local' ? { host } : {}) }) });
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

  const renderMachines = () => {
    for (const el of [...machinesEl.querySelectorAll('.desktop-launch-machine')]) el.remove();
    if (machines.length < 2) { machinesEl.style.display = 'none'; return; } // this machine only: no picker at all (the dialog as before)
    machinesEl.style.display = '';
    for (const m of machines) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'desktop-launch-machine';
      b.dataset.host = m.hostId;
      b.setAttribute('aria-pressed', m.hostId === host ? 'true' : 'false');
      const why = machineWhyText(m.code);
      const nameEl = document.createElement('span'); nameEl.textContent = machineName(m); // a host's name is peer-controlled text
      b.appendChild(nameEl);
      if (why && m.code !== 'ready') { const w = document.createElement('span'); w.className = 'desktop-launch-machine-why'; w.textContent = why; b.appendChild(w); }
      b.disabled = !m.selectable;
      b.title = m.selectable ? machineName(m) : `${machineName(m)} — ${why}`;
      b.onclick = () => { if (b.disabled || host === m.hostId) return; host = m.hostId; data = data ? { apps: data.apps } : null; listError = null; renderMachines(); render(); refresh(); };
      machinesEl.appendChild(b);
    }
  };
  const renderInstall = () => {
    installEl.innerHTML = '';
    const m = machineOf(host);
    const show = !listError && data && data.availability && installOfferFor(data.availability, m);
    installEl.classList.toggle('is-empty', !show);
    if (!show) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'file-tool-btn desktop-launch-install-btn';
    b.textContent = t('Install xpra on {machine}…', { machine: machineName(m) });
    b.title = t('Shows the install plan first — nothing runs until you confirm');
    b.onclick = () => showInstallDialog(m, () => { if (overlay.isConnected) refresh(); });
    installEl.appendChild(b);
  };
  const render = () => {
    const mName = host === 'local' ? null : machineName(machineOf(host));
    availEl.textContent = listError ? machineErrorText(listError.code, mName || machineName(null), listError.error) : availabilityText(data && data.availability, mName);
    availEl.classList.toggle('desktop-launch-avail-bad', !!listError || !!(data && data.availability && !data.availability.backend));
    renderInstall();
    const dead = !!listError || !data?.availability?.backend;
    const capUsed = data?.cap?.used ?? 0, cap = data?.cap?.cap ?? 0;
    // ── the catalog: applications, then browsers (B-bfe6) under their own heading ──
    regEl.innerHTML = '';
    browsersEl.innerHTML = '';
    for (const row of (data?.registry || [])) {
      const b = document.createElement('button');
      b.type = 'button';
      const isLaunching = launching.has(row.id);
      const unavailable = !row.available || !!row.parkedUntil;
      b.className = 'desktop-launch-card' + (unavailable ? ' is-unavailable' : '') + (isLaunching ? ' is-launching' : '');
      // a dimmed BROWSER row says its verdict SHORT and translated (by the server's code); the sentence is its tooltip
      const sub = isLaunching ? t('Launching…') : row.available ? (row.reason || row.exec) : ((row.browser && browserReasonShort(row.reasonCode)) || row.reason || t('not on PATH'));
      // faces B: a startable browser card names its face ("Browser app · chromium"); a dimmed one says only its short reason
      b.innerHTML = `<span class="desktop-launch-card-icon">${isLaunching ? UI_ICONS.refresh : cardIconFor(row.category)}</span><span class="desktop-launch-card-label">${escHtml(row.label)}</span><span class="desktop-launch-card-sub">${escHtml(row.browser && !isLaunching && !unavailable ? `${t('Browser app')} · ${sub}` : sub)}</span>`;
      b.disabled = unavailable || dead || isLaunching;
      b.setAttribute('aria-disabled', b.disabled ? 'true' : 'false');
      if (isLaunching) b.setAttribute('aria-busy', 'true');
      b.title = row.available ? (row.path || row.exec) : (row.reason || '');
      if (row.browser) b.title = `${b.title ? b.title + ' — ' : ''}${browserNote()}`;
      b.dataset.appId = row.id;
      b.onclick = async () => {
        if (b.disabled) return;
        let body = { appId: row.id };
        if (row.browser) {
          const bb = browserLaunchBody(row, { url: urlIn.value, keepProfile: keepIn.checked });
          if (bb.error) { showToast(t('Open URL must be an http:// or https:// address'), { type: 'error' }); focusQuiet(urlIn); return; }
          body = bb.body;
        }
        launching.add(row.id); render();
        const r = await launch(body, null);
        if (!r) { launching.delete(row.id); render(); }
      };
      (row.browser ? browsersEl : regEl).appendChild(b);
    }
    browsersSec.classList.toggle('is-empty', !browsersEl.children.length);
    urlIn.disabled = keepIn.disabled = dead;
    const registryEmpty = !regEl.children.length && !browsersEl.children.length;
    if (!regEl.children.length) regEl.innerHTML = `<div class="desktop-launch-empty">${escHtml(t('No known applications were found on this machine — use “Advanced” below to run any program.'))}</div>`;
    // ── running ──
    runEl.innerHTML = '';
    const live = (data?.apps || []).filter((a) => a.state === 'ready' || a.state === 'launching' || a.state === 'unknown-host-offline'); // lane C2: an app whose machine is not answering is still listed
    for (const a of live) {
      const row = document.createElement('div'); row.className = 'desktop-launch-run-row';
      row.innerHTML = `<span class="desktop-app-row-label">${escHtml(a.label || a.exec)}${a.hostLabel && a.hostId !== 'local' ? `<span class="desktop-launch-host-chip">${escHtml(t('on {machine}', { machine: a.hostLabel }))}</span>` : ''}</span><span class="desktop-app-row-state">${escHtml(a.state === 'ready' ? t('running') : a.state === 'unknown-host-offline' ? t('machine not answering') : t('starting'))}</span>`;
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
    const asked = host;
    const d = await fetchJson(asked === 'local' ? '/api/desktop/apps' : `/api/desktop/apps?host=${encodeURIComponent(asked)}`);
    if (asked !== host) return { registryEmpty: false }; // the person picked another machine meanwhile
    if (d && !d.error) { data = d; listError = null; }
    else if (d && d.error) {
      if (asked === 'local') showToast(d.error, { type: 'error' });
      else { listError = { code: d.code || null, error: d.error }; data = { apps: (data && data.apps) || [], registry: [], availability: null }; } // the head says it, by the machine's name
    }
    return render();
  };
  // ── lane C2: the INSTALL RUNG — the plan first, then the run with its log (never silent) ──
  const showInstallDialog = async (m, onDone) => {
    const name = machineName(m);
    const { body: ib, close: iclose } = createModalShell({ id: 'desktop-install-dialog', title: t('Install xpra on {machine}', { machine: name }), dialogClass: 'desktop-install', escapeToClose: true });
    ib.classList.add('desktop-install-body');
    const note = document.createElement('div'); note.className = 'desktop-install-note'; note.textContent = t('Reading what {machine} runs…', { machine: name });
    const pre = document.createElement('pre'); pre.className = 'desktop-install-pre'; pre.style.display = 'none';
    const log = document.createElement('pre'); log.className = 'desktop-install-pre desktop-install-log'; log.style.display = 'none';
    const actions = document.createElement('div'); actions.className = 'desktop-install-actions';
    const copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.className = 'file-tool-btn'; copyBtn.style.cssText = 'width:auto;padding:0 10px'; copyBtn.textContent = t('Copy commands'); copyBtn.style.display = 'none';
    const goBtn = document.createElement('button'); goBtn.type = 'button'; goBtn.className = 'btn-create'; goBtn.textContent = t('Install'); goBtn.style.display = 'none';
    actions.append(copyBtn, goBtn);
    ib.append(note, pre, actions, log);
    const q = m.hostId === 'local' ? '' : `?host=${encodeURIComponent(m.hostId)}`;
    const r = await fetchJson(`/api/desktop/install-plan${q}`);
    if (!r || r.error) { note.textContent = (r && r.error) || t('Could not read the install plan'); note.classList.add('is-bad'); return; }
    const plan = r.plan || {};
    if (!plan.ok) { note.textContent = installRefusalText(plan.code) || plan.error || ''; note.classList.add('is-bad'); return; }
    pre.textContent = plan.commands.join('\n'); pre.style.display = '';
    copyBtn.style.display = '';
    copyBtn.onclick = async () => { const ok = await copyText(plan.commands.join('\n')); showToast(ok === false ? t('Could not copy — select the commands and copy them') : t('Commands copied'), ok === false ? { type: 'error' } : undefined); };
    const src = plan.source === 'xpra.org' ? t('from xpra.org (xpra {major}.x, pinned) — the package sources on {machine} offer only {apt}', { major: '6', machine: name, apt: plan.aptXpra || t('no xpra') }) : t('from the package sources on {machine}', { machine: name });
    // an install already running there (a restarted hub, another tab) is FOLLOWED, never started twice (verify r2 F3/F4)
    const running = !!(r.facts && r.facts.installing);
    if (!plan.canRun && !running) { note.textContent = installRefusalText('no_sudo'); note.classList.add('is-bad'); return; }
    note.textContent = running ? t('An install is already running on {machine} — follow its log here.', { machine: name }) : t('These commands run on {machine} as root, {source}:', { machine: name, source: src });
    if (running) goBtn.textContent = t('Follow the install');
    goBtn.style.display = '';
    goBtn.onclick = async () => {
      goBtn.disabled = true; copyBtn.disabled = true;
      log.style.display = ''; log.textContent = '';
      note.textContent = t('Installing on {machine}…', { machine: name }); note.classList.remove('is-bad');
      let res;
      try { res = await fetch('/api/desktop/install-xpra', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: m.hostId }) }); }
      catch (e) { note.textContent = t('Could not start the install: {why}', { why: e.message }); note.classList.add('is-bad'); goBtn.disabled = false; return; }
      if (!res.ok || !res.body) { let j = null; try { j = await res.json(); } catch { j = null; } note.textContent = (j && (installRefusalText(j.code) || j.error)) || t('Could not start the install'); note.classList.add('is-bad'); goBtn.disabled = false; return; }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let end = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n'); buf = parts.pop();
        for (const p of parts) {
          if (!p.trim()) continue;
          let o; try { o = JSON.parse(p); } catch { continue; }
          if (o.reattached && !o.done) { note.textContent = t('Still installing on {machine} — re-attached. Its log so far follows.', { machine: name }); note.classList.remove('is-bad'); }
          if (o.log != null) { log.textContent += o.log + '\n'; log.scrollTop = log.scrollHeight; }
          if (o.done || o.error) end = o;
        }
      }
      if (end && end.done) { note.textContent = t('xpra {version} is installed on {machine}', { version: end.installed || '', machine: name }); showToast(t('xpra is installed on {machine}', { machine: name })); onDone?.(); }
      else { note.textContent = (end && (installRefusalText(end.code) || end.error)) || t('The install ended without an answer — the log above says what ran'); note.classList.add('is-bad'); showToast(t('The xpra install on {machine} failed', { machine: name }), { type: 'error' }); goBtn.disabled = false; copyBtn.disabled = false; }
    };
    void iclose;
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
  // ── P10 (design-agent-browser-v2 §6.6 / D27 (b)): the user's side of the
  // OTHER window class — the switch's state and, per window an agent holds on
  // their real desktop, a Pause / Resume that rides the same takeover verdicts
  // a window-live pane uses (the agent answers window_paused meanwhile). Reads
  // GET /api/window/desktop on open and on every window-leases-updated. ──
  const deskEl = body.querySelector('.desktop-launch-desk'), deskState = body.querySelector('.desktop-launch-desk-state');
  const renderDesk = async () => {
    const d = await fetchJson('/api/window/desktop');
    if (!deskEl || !deskEl.isConnected) return;
    deskEl.innerHTML = '';
    if (!d || d.error) { deskState.textContent = ''; deskEl.innerHTML = `<div class="desktop-launch-empty">${escHtml((d && d.error) || t('Off — turn it on in Settings → Agent browser'))}</div>`; return; }
    deskState.textContent = d.enabled ? '' : t('Off — turn it on in Settings → Agent browser');
    const leases = d.enabled ? (d.leases || []) : [];
    if (!leases.length) { deskEl.innerHTML = `<div class="desktop-launch-empty">${escHtml(d.enabled ? t('No agent holds a window on your desktop') : t('Off — turn it on in Settings → Agent browser'))}</div>`; return; }
    for (const l of leases) {
      const row = document.createElement('div'); row.className = 'desktop-launch-run-row desktop-launch-desk-row';
      const paused = l.input === 'user';
      row.innerHTML = `<span class="desktop-app-row-label">${escHtml(l.label || l.handle)} <span class="desktop-app-chip desktop-app-chip-origin">${escHtml(t('your desktop'))}</span></span><span class="desktop-app-row-state">${escHtml(paused ? t('paused — you are in control') : t('held by {name}', { name: l.sessionName || l.sessionId }))}</span>`;
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'file-tool-btn desktop-launch-desk-btn'; btn.style.cssText = 'width:auto;padding:0 8px;font-size:10px'; btn.textContent = paused ? t('Resume agent') : t('Pause agent');
      btn.onclick = async () => {
        btn.disabled = true;
        const r = await fetchJson(`/api/window/desktop/${encodeURIComponent(l.handle)}/${paused ? 'resume' : 'pause'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewerId: 'user' }) });
        if (r && r.error) showToast(r.error, { type: 'error' });
        renderDesk();
      };
      row.appendChild(btn); deskEl.appendChild(row);
    }
  };
  const offDesk = app.ws.onGlobal((m) => { if (m.type === 'window-leases-updated' && overlay.isConnected) renderDesk(); });
  renderDesk();
  const obs = new MutationObserver(() => { if (!overlay.isConnected) { try { off?.(); } catch {} try { offDesk?.(); } catch {} obs.disconnect(); } });
  obs.observe(document.body, { childList: true });

  render();
  // user state (recents + the disclosure preference) and the registry, then
  // decide the disclosure ONCE: the persisted preference, or forced open by an
  // empty catalog (nothing else to click — not persisted)
  fetchJson('/api/desktop/machines').then((r) => { if (r && Array.isArray(r.machines) && overlay.isConnected) { machines = r.machines; renderMachines(); } else if (r && r.error) showToast(r.error, { type: 'error' }); });
  renderMachines();
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

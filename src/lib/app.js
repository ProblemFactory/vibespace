import { ThemeManager, THEMES, BUILTIN_THEMES } from './themes.js';
import { ThemeEditor } from './theme-editor.js';
import { WsManager } from './ws.js';
import { WindowManager } from './window.js';
import { TerminalSession } from './terminal.js';
import { Sidebar } from './sidebar.js';
import { FileExplorer } from './file-explorer.js';
import { FileViewer } from './file-viewer.js';
import { CodeEditor } from './code-editor.js';
import { LayoutManager } from './layout.js';
import { ChatView } from './chat-view.js';
import { Resizer } from './resizer.js';
import { createPopover, fetchJson, initStateSync, installLongPressContextMenu, frontTruncate, escHtml, showContextMenu, showToast, showConfirmDialog, showInputDialog } from './utils.js';
import { t, getLangPref, setLang } from './i18n.js';
import { MobileNav } from './mobile-nav.js';
import { setupDirAutocomplete } from './autocomplete.js';
import { getAvailableFonts } from './terminal.js';
import { SettingsManager } from './settings.js';
import { SETTINGS_SCHEMA } from './settings-schema.js';
import { SettingsUI } from './settings-ui.js';
import { openExternalEditor, closeExternalEditor } from './external-editor.js';
import { CommandMode } from './command-mode.js';
import { updateTaskbar as updateTaskbarFn } from './taskbar.js';
import { openBrowser as openBrowserFn } from './browser-window.js';
import { openTaskDetail as openTaskDetailFn } from './task-detail.js';
import { openSessionProps as openSessionPropsFn } from './session-props.js';
import { openWorkflowDetail as openWorkflowDetailFn } from './workflow-detail.js';
import { DesktopManager } from './desktop-manager.js';
import { CustomizeMode, applyArrangement } from './customize-mode.js';
import { installSessionPalette } from './session-palette.js';
import { createBackendIconHtml, getSessionKey, pickAgentIdentity } from './agent-meta.js';

const BACKEND_SESSION_OPTIONS = {
  claude: {
    models: [{ id: '', label: t('Default') }, { id: 'fable', label: t('fable (latest, 200k)') }, { id: 'fable[1m]', label: t('fable[1m] (latest, 1M)') }, { id: 'opus', label: t('opus (latest, 200k)') }, { id: 'opus[1m]', label: t('opus[1m] (latest, 1M)') }, { id: 'sonnet', label: t('sonnet (latest)') }, { id: 'sonnet[1m]', label: t('sonnet[1m] (latest, 1M)') }, { id: 'haiku', label: t('haiku (latest)') }],
    permissions: [
      { value: '', label: t('Default') },
      { value: 'auto', label: t('Auto') },
      { value: 'bypassPermissions', label: t('Bypass') },
      { value: 'plan', label: t('Plan') },
      { value: 'acceptEdits', label: t('Accept Edits') },
    ],
    efforts: [
      { value: '', label: t('Auto (model default)') },
      { value: 'low', label: t('Low') },
      { value: 'medium', label: t('Medium') },
      { value: 'high', label: t('High') },
      { value: 'xhigh', label: t('XHigh') },
      { value: 'max', label: t('Max (Opus only)') },
      { value: 'ultracode', label: t('Ultracode (xhigh + workflows)') },
    ],
  },
  codex: {
    models: [{ id: '', label: t('Default') }],
    permissions: [
      { value: '', label: t('Default') },
      { value: 'read-only', label: t('Read Only') },
      { value: 'safe-yolo', label: t('Safe Yolo') },
      { value: 'yolo', label: t('Yolo') },
    ],
    efforts: [
      { value: '', label: t('Auto (model default)') },
      { value: 'minimal', label: t('Minimal') },
      { value: 'low', label: t('Low') },
      { value: 'medium', label: t('Medium') },
      { value: 'high', label: t('High') },
      { value: 'xhigh', label: t('XHigh') },
    ],
  },
};

// Fetch available models from server (Claude from bootstrap/v1/models API, Codex from cache)
fetchJson('/api/available-models').then(data => {
  if (!data) return;
  const toSchemaOptions = (models) => models.map(m => ({ value: m.id, label: m.label || m.id || t('Default') }));
  if (data.claude?.length) {
    BACKEND_SESSION_OPTIONS.claude.models = data.claude;
    SETTINGS_SCHEMA['claude.defaultModel'].options = toSchemaOptions(data.claude);
  }
  if (data.codex?.length) {
    BACKEND_SESSION_OPTIONS.codex.models = data.codex;
    SETTINGS_SCHEMA['codex.defaultModel'].options = toSchemaOptions(data.codex);
  }
});
// Fetch effort levels + permission modes from server (parsed from claude --help)
fetchJson('/api/session-options').then(data => {
  if (!data) return;
  if (data.effortLevels?.length) {
    const efforts = [{ value: '', label: t('Auto (model default)') }, ...data.effortLevels.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))];
    BACKEND_SESSION_OPTIONS.claude.efforts = efforts;
    SETTINGS_SCHEMA['claude.defaultEffort'].options = efforts.map(e => ({ value: e.value, label: e.label }));
  }
  if (data.permissionModes?.length) {
    const perms = [{ value: '', label: t('Default') }, ...data.permissionModes.map(p => ({ value: p, label: p }))];
    BACKEND_SESSION_OPTIONS.claude.permissions = perms;
    SETTINGS_SCHEMA['claude.defaultPermissionMode'].options = perms.map(p => ({ value: p.value, label: p.label }));
  }
});

class App {
  constructor() {
    /** Centralized mobile detection — all code should use app.isMobile instead of matchMedia */
    this.isMobile = window.matchMedia('(max-width: 768px)').matches;
    /** Touch-primary device (phones AND tablets) — hover/right-click unavailable */
    this.isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    // Long-press = right-click on touch devices (iOS never fires contextmenu natively)
    if (this.isTouch) installLongPressContextMenu();

    this.settings = new SettingsManager();
    this.themeManager = new ThemeManager();
    this.ws = new WsManager();
    this.wm = new WindowManager(document.getElementById('workspace'));
    this.wm._settings = this.settings;
    this.wm._app = this;
    // Re-render all tab bars when tab wrap setting changes
    this.settings.on('window.tabWrap', () => {
      for (const [, win] of this.wm.windows) {
        if (win._tabChain && win._tabChain.tabs[0] === win.id) this.wm._renderTabBar(win._tabChain);
      }
    });
    this.sessions = new Map();
    this.attachedServerSessions = new Set();
    this.layoutManager = new LayoutManager(this);
    this.desktopManager = new DesktopManager(this);

    // Tag every new window with the active desktop ID
    const origCreateWindow = this.wm.createWindow.bind(this.wm);
    this.wm.createWindow = (opts) => {
      const win = origCreateWindow(opts);
      if (this.desktopManager.activeDesktopId) {
        win._desktopId = this.desktopManager.activeDesktopId;
      }
      return win;
    };

    this.wm.onWindowsChanged = () => {
      this.updateTaskbar();
      this.layoutManager.scheduleAutoSave();
      this._notifySidebarFocus();
      this._updateMobileNavTitle();
    };
    this.sidebar = new Sidebar(this);

    // Load settings asynchronously (non-blocking — modules use defaults until loaded)
    this.settings.load();

    // Sync settings from other clients via WebSocket
    this.ws.onGlobal((msg) => {
      if (msg.type === 'settings-updated' && msg.settings) {
        this.settings.applyRemote(msg.settings);
      }
      if (msg.type === 'custom-themes-updated' && msg.themes) {
        this._applyCustomThemesFromServer(msg.themes);
      }
      if (msg.type === 'accounts-updated' && Array.isArray(msg.accounts)) {
        this._accounts = { ...(this._accounts || {}), accounts: msg.accounts, defaultAccountId: msg.defaultAccountId || null };
      }
    });

    // Anthropic accounts (subscription ↔ API key, per-session billing identity)
    this._accounts = { accounts: [], defaultAccountId: null, subscription: {}, cliKey: {} };
    this.refreshAccounts();

    // Load custom themes from server
    this._loadCustomThemes();

    this._setupToolbar();
    this._setupDialogs();
    this._setupWelcome();
    this._setupGlobalSettings();
    this._setupChromeContextMenus();
    if (!this.isMobile) installSessionPalette(this);
    this._setupGridConfig();
    this._setupLayoutManager();
    this._setupUsage();
    this._commandMode = new CommandMode(this, this.settings);

    // Listen for editor open/close requests (from editor-helper.sh via server HTTP→WebSocket)
    this.ws.onGlobal((msg) => {
      if (msg.type === 'editor-open' && msg.filePath && msg.signalPath) {
        this._openExternalEditor(msg.filePath, msg.signalPath, msg.sessionId);
      } else if (msg.type === 'editor-close' && msg.signalPath) {
        this._closeExternalEditor(msg.signalPath);
      }
    });

    fetch('/api/home').then(r => {
      if (r.status === 401) { location.href = '/login'; throw new Error('unauthorized'); }
      return r.json();
    }).then(d => {
      document.getElementById('input-cwd').placeholder = d.home;
      this._authEnabled = !!d.authEnabled;
    }).catch(()=>{});

    // Initialize unified state sync (server-persisted, versioned diff broadcast, reconnect recovery)
    initStateSync(this.ws);

    // Restore layout after WebSocket is connected (needs active sessions)
    this.ready = new Promise(resolve => {
      setTimeout(async () => {
        await this.layoutManager.loadAutoSave();
        resolve();
      }, 1500);
    });

    // Re-attach all terminal sessions on reconnect (chat sessions handle their own)
    this.ws.onStateChange((connected) => {
      if (!connected) return;
      for (const [winId, session] of this.sessions) {
        if (session instanceof TerminalSession && session.sessionId) {
          this.ws.send({ type: 'attach', sessionId: session.sessionId });
          // Re-attach registers this client at the 120×30 placeholder; the
          // DOM size didn't change so ResizeObserver stays quiet and no real
          // resize would follow. Re-fit explicitly, or once the heartbeat
          // evicts the old ghost the session would shrink to the placeholder.
          requestAnimationFrame(() => { try { session.fit(); } catch {} });
        }
      }
    });

    // Mobile nav bar + gestures (only on mobile)
    this._mobileNav = this.isMobile ? new MobileNav(this) : null;
  }

  _updateMobileNavTitle() {
    if (this._mobileNav) this._mobileNav.updateTitle();
  }

  _setupToolbar() {
    document.querySelectorAll('.layout-btn[data-layout]').forEach(btn => btn.addEventListener('click', () => this.wm.applyLayout(btn.dataset.layout)));
    document.getElementById('btn-new-session').addEventListener('click', () => this.showNewSessionDialog());
    document.getElementById('btn-file-explorer').addEventListener('click', () => this.openFileExplorer());
    document.getElementById('btn-terminal').addEventListener('click', async (e) => {
      // Host-aware (like Files): with remote hosts registered, pick where the
      // shell runs; with none, open a local shell directly (zero friction).
      const btn = e.currentTarget;
      let hostsList = [];
      try { const d = await fetchJson('/api/hosts'); hostsList = d?.hosts || []; } catch {}
      if (!hostsList.length) return this.openShellTerminal();
      const r = btn.getBoundingClientRect();
      showContextMenu(r.left, r.bottom + 4, [
        { label: t('Local'), action: () => this.openShellTerminal() },
        ...hostsList.map(h => ({ label: h.name, action: () => this.openShellTerminal(undefined, { hostId: h.id }) })),
      ]);
    });
    document.getElementById('btn-browser').addEventListener('click', () => this.openBrowser());

    // Apply toolbar/taskbar/sidebar chrome customization settings.
    // While CustomizeMode is active, hidden elements stay ON the canvas
    // (dimmed via .cz-off from _refresh) instead of display:none, so the
    // user can click them back on.
    const applyChromeSettings = () => {
      const s = this.settings;
      const cz = this._customize?.active;
      const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = (on || cz) ? '' : 'none'; };
      show('layout-presets', s.get('toolbar.showLayoutPresets'));
      show('btn-presets', s.get('toolbar.showPresetsButton'));
      show('btn-terminal', s.get('toolbar.showTerminalButton'));
      show('btn-browser', s.get('toolbar.showBrowserButton'));
      show('btn-file-explorer', s.get('toolbar.showFileExplorerButton'));
      const vis = s.get('taskbar.visibility') || 'show';
      show('taskbar', vis !== 'hidden');
      show('taskbar-resize-handle', vis === 'show' && !cz); // no drag-resize while auto-hidden/editing
      document.body.classList.toggle('taskbar-autohide', vis === 'autohide');
      this._ensureTaskbarHotzone(vis === 'autohide');
      // NOTE: no `vis` coupling — previews may be hosted in the toolbar now
      // (chrome.arrangement); a hidden taskbar hides only its own children
      show('desktop-previews', s.get('taskbar.showDesktopPreviews'));
      show('taskbar-usage', s.get('taskbar.showUsage'));
      show('taskbar-status', s.get('taskbar.showWindowCount'));
      document.body.classList.toggle('taskbar-top', s.get('taskbar.position') === 'top');
      document.body.classList.toggle('sidebar-right', s.get('sidebar.position') === 'right');
      // Per-area alignment (chrome.zoneAlign): window items left/center
      // (Win11-style), toolbar-center content left/center/right, tray at the
      // taskbar's left or right end (order swap; [CMD] stays leftmost)
      const za = s.get('chrome.zoneAlign') || {};
      const items = document.getElementById('taskbar-items');
      // `safe center` falls back to start when items overflow (plain center
      // makes the left overflow unreachable in a scroll container)
      if (items) items.style.justifyContent = za['taskbar-items'] === 'center' ? 'safe center' : '';
      const centerZone = document.querySelector('[data-zone="toolbar-center"]');
      if (centerZone) centerZone.style.justifyContent =
        za['toolbar-center'] === 'left' ? 'flex-start' : za['toolbar-center'] === 'right' ? 'flex-end' : '';
      const tray = document.getElementById('taskbar-tray');
      const trayLeft = za['taskbar-tray'] === 'left';
      if (tray) tray.style.order = trayLeft ? '-1' : '';
      const cmd = document.getElementById('cmd-indicator');
      if (cmd) cmd.style.order = trayLeft ? '-2' : '';
      // re-apply main-wrapper margin on the correct side
      this.sidebar?._applySidebarLayoutWidth?.();
    };
    this._applyChromeSettings = applyChromeSettings;
    applyChromeSettings();
    for (const k of ['toolbar.showLayoutPresets', 'toolbar.showPresetsButton', 'toolbar.showTerminalButton',
                     'toolbar.showBrowserButton', 'toolbar.showFileExplorerButton',
                     'taskbar.visibility', 'taskbar.showDesktopPreviews', 'taskbar.showUsage', 'taskbar.showWindowCount',
                     'taskbar.position', 'sidebar.position', 'chrome.zoneAlign']) {
      this.settings.on(k, applyChromeSettings);
    }
    // Element arrangement (which zone hosts which movable, in what order) +
    // per-spring configs — written by CustomizeMode, synced multi-client.
    // Desktop-only: mobile has its own chrome (MobileNav, two-level sidebar),
    // so a desktop arrangement must not re-parent elements there — moving
    // e.g. desktop-previews into an extra toolbar row made that row render
    // on phones (the :empty auto-hide no longer applied).
    const applyArr = () => {
      if (this.isMobile) return;
      applyArrangement(this.settings.get('chrome.arrangement'), this.settings.get('chrome.springs'));
    };
    applyArr();
    this.settings.on('chrome.arrangement', applyArr);
    this.settings.on('chrome.springs', applyArr);
  }

  // Auto-hide taskbar: a thin fixed hotzone on the taskbar's screen edge — the
  // taskbar (position:fixed in this mode, so the workspace keeps full height)
  // slides in while the pointer is over the hotzone or the taskbar itself, and
  // slides away when it leaves. Pure CSS transform; no reflow churn.
  _ensureTaskbarHotzone(on) {
    let hz = document.getElementById('taskbar-hotzone');
    if (!on) { hz?.remove(); return; }
    if (hz) return;
    hz = document.createElement('div');
    hz.id = 'taskbar-hotzone';
    document.body.appendChild(hz);
    const taskbar = document.getElementById('taskbar');
    const reveal = () => document.body.classList.add('taskbar-revealed');
    const conceal = (e) => {
      // stay revealed while a popover spawned from the taskbar is open
      if (document.querySelector('.taskbar-window-list, .usage-popup:not(.hidden), [data-popover]')) return;
      document.body.classList.remove('taskbar-revealed');
    };
    hz.addEventListener('mouseenter', reveal);
    taskbar.addEventListener('mouseenter', reveal);
    taskbar.addEventListener('mouseleave', conceal);
    hz.addEventListener('mouseleave', (e) => { if (e.relatedTarget !== taskbar && !taskbar.contains(e.relatedTarget)) conceal(e); });
  }

  // In-place chrome customization (the pattern desktops/browsers use: right-
  // click the bar itself). These write the SAME settings as the Settings
  // dialog — the menu is just a discoverable shortcut.
  _setupChromeContextMenus() {
    const s = this.settings;
    const check = (label, on) => (on ? '\u2713 ' : '\u2003 ') + label;
    const taskbar = document.getElementById('taskbar');
    taskbar?.addEventListener('contextmenu', (e) => {
      // let taskbar ITEMS keep their own menus; empty areas customize
      if (e.target.closest('.taskbar-item, .desktop-preview, .taskbar-usage')) return;
      e.preventDefault();
      const vis = s.get('taskbar.visibility') || 'show';
      showContextMenu(e.clientX, e.clientY, [
        { label: t('Customize UI…'), action: () => this._customize.enter() },
        { separator: true },
        { label: check(t('Dock to top'), s.get('taskbar.position') === 'top'), action: () => s.set('taskbar.position', s.get('taskbar.position') === 'top' ? 'bottom' : 'top') },
        { label: check(t('Auto-hide'), vis === 'autohide'), action: () => s.set('taskbar.visibility', vis === 'autohide' ? 'show' : 'autohide') },
        { label: check(t('Desktop previews'), s.get('taskbar.showDesktopPreviews')), action: () => s.set('taskbar.showDesktopPreviews', !s.get('taskbar.showDesktopPreviews')) },
        { label: check(t('Usage meters'), s.get('taskbar.showUsage')), action: () => s.set('taskbar.showUsage', !s.get('taskbar.showUsage')) },
        { label: check(t('Window count'), s.get('taskbar.showWindowCount')), action: () => s.set('taskbar.showWindowCount', !s.get('taskbar.showWindowCount')) },
        { label: t('All settings\u2026'), action: () => this._settingsUI?.open() },
      ]);
    });
    const toolbar = document.getElementById('toolbar');
    toolbar?.addEventListener('contextmenu', (e) => {
      if (e.target.closest('button, select, input')) return;
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, [
        { label: t('Customize UI…'), action: () => this._customize.enter() },
        { separator: true },
        { label: check(t('Layout presets'), s.get('toolbar.showLayoutPresets')), action: () => s.set('toolbar.showLayoutPresets', !s.get('toolbar.showLayoutPresets')) },
        { label: check(t('Browser button'), s.get('toolbar.showBrowserButton')), action: () => s.set('toolbar.showBrowserButton', !s.get('toolbar.showBrowserButton')) },
        { label: check(t('Files button'), s.get('toolbar.showFileExplorerButton')), action: () => s.set('toolbar.showFileExplorerButton', !s.get('toolbar.showFileExplorerButton')) },
        { label: check(t('Sidebar on right'), s.get('sidebar.position') === 'right'), action: () => s.set('sidebar.position', s.get('sidebar.position') === 'right' ? 'left' : 'right') },
        { label: t('All settings\u2026'), action: () => this._settingsUI?.open() },
      ]);
    });
  }

  _setupWelcome() {
    document.getElementById('welcome-new').addEventListener('click', () => this.showNewSessionDialog());
    document.getElementById('welcome-files').addEventListener('click', () => this.openFileExplorer());
    this._maybeShowOnboarding();
  }

  // ── First-run onboarding wizard ──
  // Shown once per browser when this instance has no sessions yet (fresh
  // container / new user). Guides: what VibeSpace is → connect Claude/Codex
  // (live install/login status + one-click login) → first session.
  async _maybeShowOnboarding() {
    if (localStorage.getItem('vs-onboarded')) return;
    let hasSessions = false;
    try {
      const d = await fetchJson('/api/sessions');
      hasSessions = (d.sessions || []).length > 0;
    } catch {}
    if (hasSessions) { localStorage.setItem('vs-onboarded', '1'); return; }
    this._showOnboarding();
  }

  // ── Manage Agents dialog: install/login status + login/update actions ──
  // One place for CLI lifecycle instead of scattered menu entries. Login and
  // update both run visibly in a shell terminal window (nothing hidden).
  // Guided "both accounts" setup (subscription OAuth + a saved API key). The
  // CLI's /login is mutually exclusive, so the wizard choreographs the order:
  // Console login FIRST (its minted key gets captured into VibeSpace), then log
  // BACK into the subscription — final state: subscription owns the global
  // login, the API key lives in our store, sessions pick per-spawn. Each login
  // step opens a terminal; a background watcher detects completion and reopens
  // the wizard at the next step.
  _showAccountsWizard() {
    document.getElementById('acct-wizard-overlay')?.remove();
    if (this._acctWatch) { clearInterval(this._acctWatch); this._acctWatch = null; }
    const overlay = document.createElement('div');
    overlay.id = 'acct-wizard-overlay';
    overlay.className = 'dialog-overlay';
    overlay.style.zIndex = '99998';
    const dialog = document.createElement('div'); dialog.className = 'dialog';
    dialog.innerHTML = `<div class="dialog-header"><h3>${t('Set up both Anthropic accounts')}</h3><button class="dialog-close">✕</button></div>
      <div class="dialog-body acct-wizard-body"><div class="ob-loading">${t('Checking…')}</div></div>`;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const done = () => { overlay.remove(); if (this._acctWatch) { clearInterval(this._acctWatch); this._acctWatch = null; } };
    dialog.querySelector('.dialog-close').onclick = done;
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(); });
    const body = dialog.querySelector('.acct-wizard-body');

    // Background watcher: poll until cond(data) is true, then act. Used while a
    // login terminal is open (the wizard closes so the terminal is usable) —
    // completion reopens the wizard at the recomputed next step.
    const watch = (cond, act) => {
      let tries = 0;
      this._acctWatch = setInterval(async () => {
        if (++tries > 100) { clearInterval(this._acctWatch); this._acctWatch = null; return; }
        let d = null;
        try { d = await fetchJson('/api/accounts'); } catch { return; }
        if (d && cond(d)) {
          clearInterval(this._acctWatch); this._acctWatch = null;
          await act(d);
        }
      }, 3000);
    };

    const render = async () => {
      let d = null;
      try { d = await fetchJson('/api/accounts'); } catch {}
      if (!d) { body.innerHTML = `<div class="ob-loading">${t('Server unreachable')}</div>`; return; }
      const sub = !!d.subscription?.loggedIn;
      const hasKey = (d.accounts || []).length > 0;
      const importable = d.cliKey?.present && !d.cliKey.imported;
      const step = (n, state, title, desc, btn) => `
        <div class="acct-step ${state}">
          <span class="acct-step-n">${state === 'done' ? '✓' : n}</span>
          <div class="acct-step-body"><b>${title}</b><div class="agents-note">${desc}</div>${btn || ''}</div>
        </div>`;
      if (sub && hasKey) {
        const nKeys = d.accounts.length;
        const savedLine = nKeys > 1
          ? t("Subscription is the global login and {n} API keys are saved. Every session can pick its account in the New Session dialog or the card's ⚙ — you'll never need /login switching again.", { n: nKeys })
          : t("Subscription is the global login and {n} API key is saved. Every session can pick its account in the New Session dialog or the card's ⚙ — you'll never need /login switching again.", { n: nKeys });
        body.innerHTML = `<div class="acct-wizard-done"><span class="ob-ok" style="font-size:15px">${t('✓ All set')}</span>
          <p class="agents-note">${savedLine}</p></div>`;
        return;
      }
      let html = '';
      // Step 1 — get an API key into VibeSpace
      if (hasKey) {
        html += step(1, 'done', t('API key saved'), `${escHtml(d.accounts[0].name)} (…${escHtml(d.accounts[0].tail)})`);
      } else if (importable) {
        html += step(1, 'active', t('Save your Console key'), t('Your current Console login already minted an API key — one click saves it into VibeSpace (encrypted).'), `<button class="agent-btn primary" id="acct-w-import">${t('Import it')}</button>`);
      } else {
        html += step(1, 'active', t('Log in to your Console account once'),
          t('A terminal will open — in the login menu pick <b>“Anthropic Console account”</b>. This temporarily replaces the subscription login; step 2 restores it right after. VibeSpace auto-captures the key the moment it appears.'),
          `<button class="agent-btn primary" id="acct-w-console">${t('Open login terminal')}</button>`
          + `<div class="agents-note" style="margin-top:4px">${t('Or, if you already have a key: <a href="#" id="acct-w-paste">paste an API key</a>')}</div>`);
      }
      // Step 2 — subscription owns the global login
      if (sub) {
        html += step(2, 'done', t('Subscription logged in'), escHtml(d.subscription.email || ''));
      } else {
        html += step(2, hasKey || importable ? 'active' : 'pending', t('Log back in to your subscription'),
          t('A terminal will open — pick <b>“Claude account with subscription”</b> and finish in the browser. VibeSpace detects it automatically.'),
          (hasKey || importable) ? `<button class="agent-btn primary" id="acct-w-sub">${t('Open login terminal')}</button>` : '');
      }
      body.innerHTML = html;
      body.querySelector('#acct-w-import')?.addEventListener('click', async () => {
        try { const r = await fetchJson('/api/accounts/import-cli', { method: 'POST' }); showToast(t('Imported: {name}', { name: r.account.name })); } catch { showToast(t('Import failed'), { type: 'error' }); }
        render();
      });
      body.querySelector('#acct-w-console')?.addEventListener('click', () => {
        done();
        this.openShellTerminal(undefined, { initialCommand: 'claude /login' });
        showToast(t('Complete the Console login — setup continues automatically'));
        watch((x) => x.cliKey?.present && !x.cliKey.imported, async () => {
          try { await fetchJson('/api/accounts/import-cli', { method: 'POST' }); } catch {}
          showToast(t('Console key captured ✓ — one step left'));
          this._showAccountsWizard();
        });
      });
      body.querySelector('#acct-w-paste')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const key = await showInputDialog({ title: t('Add API key'), label: t('Anthropic API key (from console.anthropic.com)'), placeholder: 'sk-ant-…', confirmText: t('Save') });
        if (key && key.trim()) {
          try { await fetchJson('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key.trim() }) }); } catch {}
        }
        render();
      });
      body.querySelector('#acct-w-sub')?.addEventListener('click', () => {
        done();
        this.openShellTerminal(undefined, { initialCommand: 'claude /login' });
        showToast(t('Complete the subscription login — setup continues automatically'));
        watch((x) => x.subscription?.loggedIn, async () => {
          showToast(t('Subscription restored ✓ — accounts setup complete'));
          this._showAccountsWizard();
        });
      });
    };
    render();
  }

  _showAgentsDialog() {
    document.getElementById('agents-dialog-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'agents-dialog-overlay';
    overlay.className = 'dialog-overlay';
    overlay.style.zIndex = '99998';
    const dialog = document.createElement('div'); dialog.className = 'dialog agents-dialog';
    const header = document.createElement('div'); header.className = 'dialog-header';
    const h3 = document.createElement('h3'); h3.textContent = t('Agents');
    const closeBtn = document.createElement('button'); closeBtn.className = 'dialog-close'; closeBtn.textContent = '\u2715';
    header.append(h3, closeBtn);
    const body = document.createElement('div'); body.className = 'dialog-body agents-dialog-body';
    body.innerHTML = `<div class="ob-loading">${t('Checking\u2026')}</div>`;
    dialog.append(header, body);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const done = () => overlay.remove();
    closeBtn.onclick = done;
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(); });
    overlay.tabIndex = -1;
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } });
    setTimeout(() => overlay.focus(), 0);

    const BACKENDS = [
      { key: 'claude', label: 'Claude Code', loginCmd: 'claude', updateCmd: 'claude update' },
      { key: 'codex', label: 'Codex', loginCmd: 'codex login', updateCmd: 'npm install -g @openai/codex@latest' },
    ];
    // Host selector: agent lifecycle can target a remote machine too. Login/
    // update then run in a shell ON that host (ssh -t).
    let selectedHost = ''; // '' = local
    const run = (cmd) => {
      done();
      if (selectedHost) this.openShellTerminal(undefined, { hostId: selectedHost, initialCommand: cmd });
      else this.openShellTerminal(undefined, { initialCommand: cmd });
    };
    const refresh = async () => {
      let st = {};
      try { st = await fetchJson(selectedHost ? `/api/hosts/${selectedHost}/backend-status` : '/api/backend-status'); } catch {}
      body.innerHTML = '';
      // Host dropdown row
      const hostRow = document.createElement('div');
      hostRow.className = 'agents-host-row';
      const hostLabel = document.createElement('span'); hostLabel.textContent = t('Machine:');
      const hostSel = document.createElement('select'); hostSel.className = 'agents-host-select';
      hostSel.innerHTML = `<option value="">${t('This machine (local)')}</option>`;
      try {
        const hd = await fetchJson('/api/hosts');
        for (const h of hd?.hosts || []) {
          const o = document.createElement('option'); o.value = h.id; o.textContent = `${h.name} (${h.user}@${h.host})`;
          hostSel.appendChild(o);
        }
      } catch {}
      hostSel.value = selectedHost;
      hostSel.onchange = () => { selectedHost = hostSel.value; refresh(); };
      hostRow.append(hostLabel, hostSel);
      body.appendChild(hostRow);
      for (const b of BACKENDS) {
        const info = st[b.key] || {};
        const row = document.createElement('div'); row.className = 'ob-backend';
        const left = document.createElement('div');
        left.innerHTML = `<b>${b.label}</b> ${info.version ? `<span class="ob-ver">${escHtml(info.version)}</span>` : ''}<div>${
          !info.installed ? `<span class="ob-bad">${t('not installed')}</span>`
          : info.loggedIn ? `<span class="ob-ok">\u2713 ${t('logged in')}</span>`
          : `<span class="ob-warn">${t('not logged in')}</span>`
        }</div>`;
        const actions = document.createElement('div'); actions.className = 'agent-actions';
        if (info.installed && !info.loggedIn) {
          const loginBtn = document.createElement('button'); loginBtn.className = 'agent-btn primary'; loginBtn.textContent = t('Log in');
          loginBtn.onclick = () => run(b.loginCmd);
          actions.appendChild(loginBtn);
        }
        if (info.installed) {
          const updBtn = document.createElement('button'); updBtn.className = 'agent-btn'; updBtn.textContent = t('Update');
          updBtn.title = b.updateCmd;
          updBtn.onclick = () => run(b.updateCmd);
          actions.appendChild(updBtn);
        }
        row.append(left, actions);
        body.appendChild(row);
      }
      // ── VibeSpace integration (task context hook) — local machine only.
      // Auto-installed at server start; this row makes the state VISIBLE and
      // repairable for non-engineers (auto-install can fail silently if e.g.
      // the CLI's settings file doesn't exist yet).
      if (!selectedHost) {
        let hs = null;
        try { hs = await fetchJson('/api/agent-hooks'); } catch {}
        if (hs) {
          const row = document.createElement('div'); row.className = 'ob-backend';
          const left = document.createElement('div');
          const stateOf = (k, label) => {
            const st = hs[k] || {};
            if (st.installed) return `<span class="ob-ok">✓ ${label}</span>`;
            if (st.stale) return `<span class="ob-warn">${t('{label}: needs update', { label })}</span>`;
            if (st.parseError) return `<span class="ob-bad">${t('{label}: config unreadable', { label })}</span>`;
            if (!st.fileExists) return `<span class="ob-warn">${t('{label}: run the CLI once first', { label })}</span>`;
            return `<span class="ob-warn">${t('{label}: not installed', { label })}</span>`;
          };
          const allGood = hs.claude?.installed && hs.codex?.installed;
          left.innerHTML = `<b>${t('VibeSpace integration')}</b><div>${stateOf('claude', 'Claude')} &nbsp; ${stateOf('codex', 'Codex')}</div>`
            + `<div class="agents-note" style="margin:4px 0 0">${t("Lets sessions in a Task Group automatically receive the group's context (objective, checklist, shared files).")}</div>`;
          const actions = document.createElement('div'); actions.className = 'agent-actions';
          const installBtn = document.createElement('button');
          installBtn.className = 'agent-btn' + (allGood ? '' : ' primary');
          installBtn.textContent = allGood ? t('Reinstall') : t('Install');
          installBtn.onclick = async () => {
            installBtn.disabled = true;
            try {
              const r = await fetchJson('/api/agent-hooks/install', { method: 'POST' });
              const errs = Object.entries(r?.results || {}).filter(([, v]) => !v.ok);
              if (errs.length) showToast(errs.map(([k, v]) => `${k}: ${v.error}`).join('; '), { type: 'error' });
              else showToast(t('Task Group context hook installed'));
            } catch { showToast(t('Install failed'), { type: 'error' }); }
            refresh();
          };
          actions.appendChild(installBtn);
          if (hs.claude?.installed || hs.codex?.installed || hs.claude?.stale || hs.codex?.stale) {
            const rmBtn = document.createElement('button'); rmBtn.className = 'agent-btn'; rmBtn.textContent = t('Remove');
            rmBtn.title = t('Unregister the hook from both CLIs (sessions stop receiving Task Group context)');
            rmBtn.onclick = async () => {
              rmBtn.disabled = true;
              try { await fetchJson('/api/agent-hooks/uninstall', { method: 'POST' }); showToast(t('Hook removed')); } catch {}
              refresh();
            };
            actions.appendChild(rmBtn);
          }
          row.append(left, actions);
          body.appendChild(row);
        }
      }
      // ── Anthropic accounts (billing identity: subscription ↔ API keys). ──
      // Remote host selected: probe the HOST's login state + offer importing
      // its console key into the central store (keys are host-agnostic — they
      // ship to whichever host a session spawns on).
      if (selectedHost) {
        let racct = null;
        try { racct = await fetchJson(`/api/hosts/${encodeURIComponent(selectedHost)}/accounts-status`); } catch {}
        if (racct && !racct.error) {
          const accts = this._accounts || { accounts: [] };
          const hostLabel = hostSel.options[hostSel.selectedIndex]?.textContent?.split(' (')[0] || t('host');
          const row = document.createElement('div'); row.className = 'ob-backend acct-section';
          const left = document.createElement('div'); left.style.flex = '1';
          const importedTails = new Set((accts.accounts || []).map(a => a.tail));
          left.innerHTML = `<b>${t('Anthropic accounts on {host}', { host: escHtml(hostLabel) })}</b>
            <div style="margin:3px 0">${racct.subscription?.loggedIn
              ? `<span class="ob-ok">${t('✓ Subscription logged in (on the host)')}</span>`
              : `<span class="ob-warn">${racct.cliKey?.present ? t('Subscription: not logged in (a Console login replaced it)') : t('Subscription: not logged in')}</span>`}</div>
            ${racct.cliKey?.present ? `<div style="margin:3px 0">${t('Console key on host: …{tail}', { tail: escHtml(racct.cliKey.tail) })} ${importedTails.has(racct.cliKey.tail) ? `<span class="ob-ok">${t('✓ imported')}</span>` : `<span class="ob-warn">${t('not imported')}</span>`}</div>` : ''}
            <div class="agents-note" style="margin:4px 0 0">${t("API keys live in the central store ({n} saved) and are pushed to the host per session — pick the account in the New Session dialog / card ⚙. 'Subscription' there means THIS host's own login.", { n: (accts.accounts || []).length })}</div>`;
          const actions = document.createElement('div'); actions.className = 'agent-actions';
          const loginBtn = document.createElement('button');
          loginBtn.className = 'agent-btn' + (racct.subscription?.loggedIn ? '' : ' primary');
          loginBtn.textContent = t('Log in on host…');
          loginBtn.title = t('Opens a terminal ON the host running claude /login');
          loginBtn.onclick = () => run('claude /login');
          actions.appendChild(loginBtn);
          if (racct.cliKey?.present && !importedTails.has(racct.cliKey.tail)) {
            const impBtn = document.createElement('button'); impBtn.className = 'agent-btn primary';
            impBtn.textContent = t('Import host key');
            impBtn.onclick = async () => {
              try {
                const r = await fetchJson('/api/accounts/import-cli-host', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostId: selectedHost }) });
                if (r?.account) showToast(t('Imported: {name}', { name: r.account.name })); else showToast(r?.error || t('Import failed'), { type: 'error' });
              } catch { showToast(t('Import failed'), { type: 'error' }); }
              refresh();
            };
            actions.appendChild(impBtn);
          }
          row.append(left, actions);
          body.appendChild(row);
        }
      }
      if (!selectedHost) {
        let acct = null;
        try { acct = await fetchJson('/api/accounts'); } catch {}
        if (acct) {
          const accts = await this.refreshAccounts(); // keep app cache in sync
          const row = document.createElement('div'); row.className = 'ob-backend acct-section';
          const left = document.createElement('div');
          left.style.flex = '1';
          const sub = acct.subscription || {};
          const subLine = sub.loggedIn
            ? `<span class="ob-ok">${t('✓ Subscription — {info}', { info: escHtml(sub.email || t('logged in')) })}</span>`
            : `<span class="ob-warn">${acct.cliKey?.present ? t('Subscription: not logged in (a Console login replaced it)') : t('Subscription: not logged in')}</span>`;
          const keyLines = (accts.accounts || []).map(a => {
            const isDef = accts.defaultAccountId === a.id;
            return `<div class="acct-key-row" data-id="${escHtml(a.id)}">
              <span class="ob-ok">✓</span> <span class="acct-key-name">${escHtml(a.name)}</span>
              <span class="acct-key-tail">API …${escHtml(a.tail)}</span>${isDef ? `<span class="acct-def-badge">${t('default')}</span>` : ''}
              <span class="acct-key-actions">
                <button class="agent-btn acct-test" title="${t("Open a terminal session using this key (approve the CLI's one-time trust prompt here if it appears)")}">${t('Test')}</button>
                <button class="agent-btn acct-def" title="${t('Use for new sessions unless a session picks otherwise')}">${isDef ? t('Unset default') : t('Set default')}</button>
                <button class="agent-btn acct-del" title="${t('Remove from VibeSpace (the key itself stays valid)')}">✕</button>
              </span></div>`;
          }).join('');
          left.innerHTML = `<b>${t('Anthropic accounts')}</b>
            <div style="margin:3px 0">${subLine}</div>
            ${keyLines || `<div class="agents-note">${t('No API keys saved — sessions can only use the CLI’s global login.')}</div>`}
            <div class="agents-note" style="margin:4px 0 0">${t('Each session can pick its account (New Session dialog / card ⚙). Subscription = your Pro/Max plan; API keys bill pay-per-use.')}</div>`;
          const actions = document.createElement('div'); actions.className = 'agent-actions';
          const needsSetup = !sub.loggedIn || !(accts.accounts || []).length;
          const wizardBtn = document.createElement('button');
          wizardBtn.className = 'agent-btn' + (needsSetup ? ' primary' : '');
          wizardBtn.textContent = t('Set up both…');
          wizardBtn.onclick = () => { done(); this._showAccountsWizard(); };
          actions.appendChild(wizardBtn);
          if (acct.cliKey?.present && !acct.cliKey.imported) {
            const impBtn = document.createElement('button'); impBtn.className = 'agent-btn primary';
            impBtn.textContent = t('Import CLI key');
            impBtn.title = t('Save the key your Console login minted ({org} …{tail}) into VibeSpace', { org: escHtml(acct.cliKey.org || ''), tail: escHtml(acct.cliKey.tail || '') });
            impBtn.onclick = async () => {
              try { const r = await fetchJson('/api/accounts/import-cli', { method: 'POST' }); showToast(t('Imported: {name}', { name: r.account.name })); } catch (e) { showToast(t('Import failed'), { type: 'error' }); }
              refresh();
            };
            actions.appendChild(impBtn);
          }
          const addBtn = document.createElement('button'); addBtn.className = 'agent-btn'; addBtn.textContent = t('Add key…');
          addBtn.onclick = async () => {
            const key = await showInputDialog({ title: t('Add API key'), label: t('Anthropic API key (from console.anthropic.com)'), placeholder: 'sk-ant-…', confirmText: t('Save') });
            if (!key || !key.trim()) return;
            const name = await showInputDialog({ title: t('Name this account'), label: t('Shown in account pickers'), placeholder: t('e.g. Company API'), confirmText: t('Save') });
            try {
              const r = await fetchJson('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key.trim(), name: (name || '').trim() }) });
              if (r?.account) showToast(t('Saved: {name} — use Test once to approve the CLI’s trust prompt', { name: r.account.name }));
              else showToast(r?.error || t('Save failed'), { type: 'error' });
            } catch { showToast(t('Save failed'), { type: 'error' }); }
            refresh();
          };
          actions.appendChild(addBtn);
          row.append(left, actions);
          body.appendChild(row);
          // Per-key row actions (event delegation on the section)
          left.onclick = async (e) => {
            const keyRow = e.target.closest?.('.acct-key-row');
            if (!keyRow) return;
            const id = keyRow.dataset.id;
            if (e.target.classList.contains('acct-test')) {
              done();
              this.createSession({ backend: 'claude', mode: 'terminal', cwd: '', accountId: id });
            } else if (e.target.classList.contains('acct-def')) {
              const isDef = accts.defaultAccountId === id;
              try { await fetchJson('/api/accounts/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: isDef ? null : id }) }); } catch {}
              refresh();
            } else if (e.target.classList.contains('acct-del')) {
              const a = (accts.accounts || []).find(x => x.id === id);
              if (!(await showConfirmDialog({ title: t('Remove account'), message: t('Remove "{name}" from VibeSpace? Sessions already running keep working; the key itself stays valid.', { name: a?.name }) }))) return;
              try { await fetchJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch {}
              refresh();
            }
          };
        }
      }
      const foot = document.createElement('div');
      foot.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;';
      const note = document.createElement('p'); note.className = 'agents-note';
      note.textContent = t('Actions open in a terminal window so you can see exactly what runs.');
      const recheck = document.createElement('button'); recheck.className = 'agent-btn'; recheck.textContent = t('Re-check');
      recheck.onclick = refresh;
      foot.append(note, recheck);
      body.appendChild(foot);
    };
    refresh();
  }

  // ── Shared modal shell for the config/password dialogs ──
  _modal(title, { wide = false } = {}) {
    document.getElementById('cfg-dialog-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'cfg-dialog-overlay';
    overlay.className = 'dialog-overlay';
    overlay.style.zIndex = '99998';
    const dialog = document.createElement('div'); dialog.className = 'dialog';
    if (wide) dialog.style.minWidth = '440px';
    const header = document.createElement('div'); header.className = 'dialog-header';
    const h3 = document.createElement('h3'); h3.textContent = title;
    const closeBtn = document.createElement('button'); closeBtn.className = 'dialog-close'; closeBtn.textContent = '✕';
    header.append(h3, closeBtn);
    const body = document.createElement('div'); body.className = 'dialog-body cfg-dialog-body';
    dialog.append(header, body);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    closeBtn.onclick = close;
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    overlay.tabIndex = -1;
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    setTimeout(() => overlay.focus(), 0);
    return { overlay, body, close };
  }

  // ── Backup & migrate (one dialog, Export | Import tabs) ──
  // Merged into a single gs-menu entry after the menu grew too long.
  _showTransferDialog(initialTab = 'export', presetFile = null) {
    const { body: shell, close } = this._modal(t('Backup & migrate'), { wide: true });
    const tabs = document.createElement('div');
    tabs.className = 'cfg-tabs';
    const body = document.createElement('div');
    body.className = 'cfg-tab-body';
    shell.append(tabs, body);
    const mk = (id, label) => {
      const b = document.createElement('button');
      b.className = 'cfg-tab';
      b.dataset.tab = id;
      b.textContent = label;
      b.onclick = () => show(id);
      tabs.appendChild(b);
      return b;
    };
    mk('export', t('Export to file'));
    mk('import', t('Import from file'));
    const show = (id) => {
      for (const t of tabs.children) t.classList.toggle('active', t.dataset.tab === id);
      body.innerHTML = '';
      if (id === 'export') this._buildExportBody(body, close);
      else this._buildImportBody(body, close, presetFile);
    };
    show(initialTab);
  }

  // Non-sensitive sections default-checked; sensitive items (password record,
  // agent CLI credentials) are opt-in and AES-encrypted under a passphrase.
  async _buildExportBody(body, close) {
    body.innerHTML = `<div class="ob-loading">${t('Checking…')}</div>`;
    let info;
    try { info = await fetchJson('/api/config/export-info'); }
    catch { body.innerHTML = `<p class="agents-note">${t('Failed to load export info.')}</p>`; return; }

    body.innerHTML = '';
    const mkRow = (id, label, desc, { checked = true, disabled = false } = {}) => {
      const row = document.createElement('label');
      row.className = 'cfg-row' + (disabled ? ' disabled' : '');
      row.innerHTML = `<input type="checkbox" data-sec="${id}" ${checked && !disabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span class="cfg-row-text"><b>${escHtml(label)}</b><span>${escHtml(desc)}</span></span>`;
      return row;
    };
    const s = info.sections;
    const secWrap = document.createElement('div');
    secWrap.className = 'cfg-rows';
    secWrap.append(
      mkRow('settings', t('Settings'), t('{count} customized option(s), incl. Customize-UI arrangement', { count: s.settings.count })),
      mkRow('customThemes', t('Custom themes'), t('{count} theme(s)', { count: s.customThemes.count })),
      mkRow('layouts', t('Layouts & desktops'), t('{count} layout(s), {desktops} desktop(s), custom grids', { count: s.layouts.count, desktops: s.layouts.desktops })),
      mkRow('userState', t('Session metadata'), t('stars, renames, {groups} group(s), per-session configs', { groups: s.userState.groups })),
      mkRow('bookmarks', t('File bookmarks'), t('{count} bookmark(s)', { count: s.bookmarks.count })),
      mkRow('clientPrefs', t('This browser’s preferences'), t('theme, font, taskbar height')),
    );
    const sensHead = document.createElement('div');
    sensHead.className = 'cfg-sens-head';
    sensHead.innerHTML = `<b>${t('Sensitive')}</b><span> — ${t('off by default; encrypted with a passphrase. The file lets anyone who has it (and the passphrase) log in / use your agent accounts. Treat it like a key.')}</span>`;
    const sensWrap = document.createElement('div');
    sensWrap.className = 'cfg-rows cfg-rows-sens';
    sensWrap.append(
      mkRow('vsPassword', t('VibeSpace password'), info.sensitive.vsPassword ? t('password hash — same password works after import') : t('no password configured'), { checked: false, disabled: !info.sensitive.vsPassword }),
      mkRow('claudeCreds', t('Claude CLI credentials'), info.sensitive.claudeCreds ? t('~/.claude/.credentials.json — no re-login on the new instance') : t('not found on this machine'), { checked: false, disabled: !info.sensitive.claudeCreds }),
      mkRow('codexCreds', t('Codex CLI credentials'), info.sensitive.codexCreds ? '~/.codex/auth.json' : t('not found on this machine'), { checked: false, disabled: !info.sensitive.codexCreds }),
      mkRow('hosts', t('Remote hosts'), info.sensitive.hosts ? t('{n} ssh host(s) + uploaded keys', { n: info.sensitive.hosts }) : t('no hosts configured'), { checked: false, disabled: !info.sensitive.hosts }),
      mkRow('mounts', t('S3 mounts & shares'), info.sensitive.mounts ? t('{n} mount(s) incl. credentials', { n: info.sensitive.mounts }) : t('no mounts configured'), { checked: false, disabled: !info.sensitive.mounts }),
    );
    const passRow = document.createElement('div');
    passRow.className = 'cfg-pass-row hidden';
    passRow.innerHTML = `<label>${t('Encryption passphrase')} <input type="password" id="cfg-exp-pass" placeholder="${t('min 4 chars')}" autocomplete="new-password"></label>`;
    const syncPass = () => {
      const anySens = [...sensWrap.querySelectorAll('input:checked')].length > 0;
      passRow.classList.toggle('hidden', !anySens);
    };
    sensWrap.addEventListener('change', syncPass);

    const err = document.createElement('div'); err.className = 'cfg-err';
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn-create';
    exportBtn.textContent = t('Export');
    exportBtn.onclick = async () => {
      err.textContent = '';
      const sections = [...secWrap.querySelectorAll('input:checked')].map(i => i.dataset.sec);
      const includeSensitive = [...sensWrap.querySelectorAll('input:checked')].map(i => i.dataset.sec);
      const passphrase = passRow.querySelector('input')?.value || '';
      if (!sections.length && !includeSensitive.length) { err.textContent = t('Nothing selected'); return; }
      if (includeSensitive.length && passphrase.length < 4) { err.textContent = t('Passphrase must be at least 4 characters'); return; }
      const clientPrefs = {};
      for (const k of ['theme', 'termFontSize', 'termFontFamily', 'taskbarHeight']) {
        const v = localStorage.getItem(k);
        if (v != null) clientPrefs[k] = v;
      }
      try {
        const res = await fetch('/api/config/export', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sections, includeSensitive, passphrase, clientPrefs }),
        });
        if (!res.ok) { err.textContent = (await res.json().catch(() => ({}))).error || t('Export failed'); return; }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `vibespace-config-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        close();
        showToast(t('Configuration exported'));
      } catch { err.textContent = t('Export failed'); }
    };
    actions.appendChild(exportBtn);
    body.append(secWrap, sensHead, sensWrap, passRow, err, actions);
  }

  // File is inspected CLIENT-side (plain JSON; the sensitive manifest sits
  // outside the ciphertext) → user picks sections → server applies. Each
  // section REPLACES its store. Page reloads afterwards.
  _buildImportBody(body, close, presetFile = null) {
    const pick = document.createElement('div');
    pick.className = 'cfg-import-pick';
    pick.innerHTML = `<button class="btn-create" id="cfg-imp-pick">${t('Choose config file…')}</button><span class="agents-note">${t('a vibespace-config-*.json export')}</span>`;
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'application/json,.json'; fileInput.style.display = 'none';
    body.append(pick, fileInput);
    pick.querySelector('#cfg-imp-pick').onclick = () => fileInput.click();

    const SEC_LABELS = {
      settings: [t('Settings'), (d) => t('{n} option(s)', { n: Object.keys(d).length })],
      customThemes: [t('Custom themes'), (d) => t('{n} theme(s)', { n: Object.keys(d || {}).length })],
      layouts: [t('Layouts & desktops'), (d) => t('{a} layout(s), {b} desktop(s)', { a: Object.keys(d?.layouts || {}).length, b: (d?.desktopMeta || []).length })],
      userState: [t('Session metadata'), (d) => t('{a} group(s), {b} rename(s), {c} star(s)', { a: Object.keys(d?.sessionGroups || {}).length, b: Object.keys(d?.customNames || {}).length, c: Object.keys(d?.starredSessions || {}).length })],
      bookmarks: [t('File bookmarks'), (d) => t('{n} bookmark(s)', { n: (d || []).length })],
      clientPrefs: [t('Browser preferences'), (d) => Object.keys(d || {}).join(', ') || t('empty')],
    };
    const SENS_LABELS = { vsPassword: t('VibeSpace password'), claudeCreds: t('Claude CLI credentials'), codexCreds: t('Codex CLI credentials'), hosts: t('Remote hosts'), mounts: t('S3 mounts & shares') };

    const renderFile = (file) => {
      body.innerHTML = '';
      const head = document.createElement('p');
      head.className = 'agents-note';
      head.textContent = t('Exported {date} — each selected section REPLACES the current data.', { date: file.exportedAt ? new Date(file.exportedAt).toLocaleString() : t('(unknown date)') });
      const secWrap = document.createElement('div');
      secWrap.className = 'cfg-rows';
      for (const [id, data] of Object.entries(file.sections || {})) {
        const meta = SEC_LABELS[id];
        if (!meta) continue;
        const row = document.createElement('label');
        row.className = 'cfg-row';
        row.innerHTML = `<input type="checkbox" data-sec="${id}" checked>
          <span class="cfg-row-text"><b>${escHtml(meta[0])}</b><span>${escHtml(meta[1](data))}</span></span>`;
        secWrap.appendChild(row);
      }
      const sensWrap = document.createElement('div');
      sensWrap.className = 'cfg-rows cfg-rows-sens';
      const passRow = document.createElement('div');
      passRow.className = 'cfg-pass-row hidden';
      passRow.innerHTML = `<label>${t('Decryption passphrase')} <input type="password" autocomplete="off"></label>`;
      if (file.sensitive?.manifest?.length) {
        const sensHead = document.createElement('div');
        sensHead.className = 'cfg-sens-head';
        sensHead.innerHTML = `<b>${t('Sensitive (encrypted)')}</b><span> — ${t('requires the export passphrase')}</span>`;
        body.appendChild(sensHead);
        for (const id of file.sensitive.manifest) {
          const row = document.createElement('label');
          row.className = 'cfg-row';
          row.innerHTML = `<input type="checkbox" data-sec="${id}">
            <span class="cfg-row-text"><b>${escHtml(SENS_LABELS[id] || id)}</b><span>${id === 'vsPassword' ? t('enables password auth; all other devices are logged out') : t('written to this machine')}</span></span>`;
          sensWrap.appendChild(row);
        }
        sensWrap.addEventListener('change', () => {
          passRow.classList.toggle('hidden', !sensWrap.querySelector('input:checked'));
        });
      }
      const err = document.createElement('div'); err.className = 'cfg-err';
      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
      const importBtn = document.createElement('button');
      importBtn.className = 'btn-create';
      importBtn.textContent = t('Import');
      importBtn.onclick = async () => {
        err.textContent = '';
        const sections = [...secWrap.querySelectorAll('input:checked')].map(i => i.dataset.sec);
        const includeSensitive = [...sensWrap.querySelectorAll('input:checked')].map(i => i.dataset.sec);
        const passphrase = passRow.querySelector('input')?.value || '';
        if (!sections.length && !includeSensitive.length) { err.textContent = t('Nothing selected'); return; }
        if (includeSensitive.length && !passphrase) { err.textContent = t('Enter the passphrase'); return; }
        try {
          const res = await fetch('/api/config/import', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file, sections, includeSensitive, passphrase }),
          });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) { err.textContent = d.error || t('Import failed'); return; }
          if (d.clientPrefs) {
            for (const [k, v] of Object.entries(d.clientPrefs)) {
              if (['theme', 'termFontSize', 'termFontFamily', 'taskbarHeight'].includes(k)) localStorage.setItem(k, v);
            }
          }
          close();
          showToast(t('Imported: {sections} — reloading…', { sections: d.applied.join(', ') }));
          setTimeout(() => location.reload(), 900);
        } catch { err.textContent = t('Import failed'); }
      };
      actions.appendChild(importBtn);
      body.append(head, secWrap, sensWrap, passRow, err, actions);
    };

    const readFile = (f) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const file = JSON.parse(reader.result);
          if (file.app !== 'vibespace-config') throw new Error('not a config');
          renderFile(file);
        } catch { body.querySelector('.agents-note').textContent = t('Not a valid VibeSpace config file.'); }
      };
      reader.readAsText(f);
    };
    fileInput.onchange = () => { if (fileInput.files[0]) readFile(fileInput.files[0]); };
    if (presetFile) readFile(presetFile);
  }

  // ── In-app password management ──
  // Setting/changing revokes every other device's token (this browser gets a
  // fresh one). Removing disables auth; env vars won't re-enable a user-set
  // state on the next boot.
  _showPasswordDialog() {
    const enabled = !!this._authEnabled;
    const { body, close } = this._modal(enabled ? t('Change password') : t('Set a password'));
    const form = document.createElement('form');
    form.className = 'cfg-pass-form';
    form.innerHTML = `
      ${enabled ? `<label>${t('Current password')}<input type="password" id="pw-cur" autocomplete="current-password"></label>` : ''}
      <label>${t('New password')}<input type="password" id="pw-new" autocomplete="new-password" placeholder="${t('min 4 chars')}"></label>
      <label>${t('Confirm')}<input type="password" id="pw-conf" autocomplete="new-password"></label>
      <p class="agents-note">${enabled ? t('Changing the password logs out every other device.') : t('Everything (pages, APIs, terminals) will require login afterwards. Other open devices are logged out.')}</p>
      <div class="cfg-err"></div>
      <div class="dialog-actions">
        ${enabled ? `<button type="button" class="btn-cancel cfg-danger" id="pw-remove">${t('Remove password…')}</button>` : ''}
        <button type="submit" class="btn-create">${enabled ? t('Change') : t('Set password')}</button>
      </div>`;
    body.appendChild(form);
    const err = form.querySelector('.cfg-err');
    form.onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = '';
      const nw = form.querySelector('#pw-new').value;
      if (nw.length < 4) { err.textContent = t('At least 4 characters'); return; }
      if (nw !== form.querySelector('#pw-conf').value) { err.textContent = t('Passwords don’t match'); return; }
      try {
        const res = await fetch('/api/auth/set-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current: form.querySelector('#pw-cur')?.value, newPassword: nw }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { err.textContent = d.error || t('Failed'); return; }
        this._authEnabled = true;
        close();
        showToast(enabled ? t('Password changed — other devices were logged out') : t('Password set — other devices were logged out'));
      } catch { err.textContent = t('Failed'); }
    };
    form.querySelector('#pw-remove')?.addEventListener('click', async () => {
      err.textContent = '';
      const cur = form.querySelector('#pw-cur')?.value || '';
      if (!cur) { err.textContent = t('Enter the current password first'); return; }
      const ok = await showConfirmDialog({ title: t('Remove password?'), message: t('Auth will be disabled — anyone who can reach this server gets full access.'), confirmText: t('Remove'), danger: true });
      if (!ok) return;
      try {
        const res = await fetch('/api/auth/set-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current: cur, remove: true }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { err.textContent = d.error || t('Failed'); return; }
        this._authEnabled = false;
        close();
        showToast(t('Password removed — auth disabled'));
      } catch { err.textContent = t('Failed'); }
    });
  }

  _showOnboarding(force = false) {
    const welcome = document.getElementById('welcome');
    if (!welcome) return;
    welcome.classList.remove('hidden');
    welcome.classList.add('onboarding');
    const content = welcome.querySelector('.welcome-content');
    content.dataset.saved = content.dataset.saved || content.innerHTML; // restore target on finish
    let step = 0;
    const done = () => {
      localStorage.setItem('vs-onboarded', '1');
      welcome.classList.remove('onboarding');
      welcome.classList.add('hidden'); // _checkWelcome re-shows it only on an empty desktop
      content.innerHTML = content.dataset.saved;
      // re-wire the plain welcome buttons (innerHTML replace dropped listeners)
      content.querySelector('#welcome-new')?.addEventListener('click', () => this.showNewSessionDialog());
      content.querySelector('#welcome-files')?.addEventListener('click', () => this.openFileExplorer());
      this._checkWelcome();
    };

    const render = () => {
      const dots = [0, 1, 2, 3].map(i => `<span class="ob-dot${i === step ? ' active' : ''}"></span>`).join('');
      if (step === 0) {
        content.innerHTML = `
          <h1>${t('Welcome to VibeSpace')}</h1>
          <p class="ob-sub">${t('Your workspace for coding agents')}</p>
          <div class="ob-points">
            <div class="ob-point"><b>${t('Sessions that never die')}</b><span>${t('Agents keep running through restarts, refreshes, and network drops — reattach from any device.')}</span></div>
            <div class="ob-point"><b>${t('A real window manager')}</b><span>${t('Tile agent chats, terminals, files and editors across virtual desktops.')}</span></div>
            <div class="ob-point"><b>${t('Chat or terminal, your choice')}</b><span>${t('Every session can run as a structured chat or a raw terminal TUI.')}</span></div>
          </div>
          <div class="welcome-actions">
            <button class="welcome-btn" id="ob-next">${t('Get started')}</button>
            <button class="welcome-btn welcome-btn-secondary" id="ob-skip">${t('Skip tour')}</button>
          </div>
          <div class="ob-dots">${dots}</div>`;
        content.querySelector('#ob-next').onclick = () => { step = 1; render(); };
        content.querySelector('#ob-skip').onclick = done;
      } else if (step === 1) {
        content.innerHTML = `
          <h1>${t('Connect your agents')}</h1>
          <p class="ob-sub">${t('VibeSpace drives the official CLIs — log in once, credentials persist')}</p>
          <div class="ob-backends" id="ob-backends"><div class="ob-loading">${t('Checking…')}</div></div>
          <div class="welcome-actions">
            <button class="welcome-btn" id="ob-next">${t('Continue')}</button>
            <button class="welcome-btn welcome-btn-secondary" id="ob-back">${t('Back')}</button>
          </div>
          <div class="ob-dots">${dots}</div>`;
        content.querySelector('#ob-next').onclick = () => { step = 2; render(); };
        content.querySelector('#ob-back').onclick = () => { step = 0; render(); };
        const refresh = async () => {
          let st = {};
          try { st = await fetchJson('/api/backend-status'); } catch {}
          const card = (key, label, loginCmd) => {
            const b = st[key] || {};
            const state = !b.installed ? `<span class="ob-bad">${t('not installed')}</span>`
              : b.loggedIn ? `<span class="ob-ok">✓ ${t('ready')}</span>`
              : `<span class="ob-warn">${t('installed, not logged in')}</span>`;
            const btn = !b.installed ? '' : b.loggedIn ? '' : `<button class="welcome-btn ob-login" data-cmd="${loginCmd}">${t('Log in')}</button>`;
            return `<div class="ob-backend"><div><b>${label}</b> ${b.version ? `<span class="ob-ver">${escHtml(b.version)}</span>` : ''}</div><div>${state} ${btn}</div></div>`;
          };
          const el = content.querySelector('#ob-backends');
          if (!el) return;
          el.innerHTML = card('claude', 'Claude Code', 'claude') + card('codex', 'Codex', 'codex login')
            + `<button class="welcome-btn welcome-btn-secondary ob-recheck">${t('Re-check')}</button>`;
          el.querySelectorAll('.ob-login').forEach(btn => {
            btn.onclick = () => this.openShellTerminal(undefined, { initialCommand: btn.dataset.cmd });
          });
          el.querySelector('.ob-recheck').onclick = refresh;
        };
        refresh();
      } else if (step === 2) {
        const protectedAlready = !!this._authEnabled;
        content.innerHTML = `
          <h1>${t('Protect this workspace')}</h1>
          <p class="ob-sub">${protectedAlready ? t('Password auth is already enabled ✓') : t('Optional — anyone who can reach this server gets full shell access. A password gates pages, APIs, and terminals.')}</p>
          ${protectedAlready ? '' : `
          <div class="ob-pass">
            <input type="password" id="ob-pw" placeholder="${t('Password (min 4 chars)')}" autocomplete="new-password">
            <button class="welcome-btn welcome-btn-secondary" id="ob-gen" title="${t('Generate a random password')}">${t('Generate')}</button>
          </div>
          <div class="cfg-err" id="ob-pw-err"></div>`}
          <div class="welcome-actions">
            ${protectedAlready ? '' : `<button class="welcome-btn" id="ob-setpw">${t('Set password')}</button>`}
            <button class="welcome-btn ${protectedAlready ? '' : 'welcome-btn-secondary'}" id="ob-next">${protectedAlready ? t('Continue') : t('Skip')}</button>
            <button class="welcome-btn welcome-btn-secondary" id="ob-back">${t('Back')}</button>
          </div>
          <div class="ob-alt"><a href="#" id="ob-import">${t('Import a config file from another VibeSpace…')}</a></div>
          <div class="ob-dots">${dots}</div>`;
        content.querySelector('#ob-next').onclick = () => { step = 3; render(); };
        content.querySelector('#ob-back').onclick = () => { step = 1; render(); };
        content.querySelector('#ob-import').onclick = (e) => { e.preventDefault(); this._showTransferDialog('import'); };
        const pwInput = content.querySelector('#ob-pw');
        content.querySelector('#ob-gen')?.addEventListener('click', () => {
          const bytes = new Uint8Array(9);
          crypto.getRandomValues(bytes);
          pwInput.value = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          pwInput.type = 'text'; // show the generated one so the user can save it
        });
        content.querySelector('#ob-setpw')?.addEventListener('click', async () => {
          const errEl = content.querySelector('#ob-pw-err');
          errEl.textContent = '';
          const pw = pwInput.value;
          if (pw.length < 4) { errEl.textContent = t('At least 4 characters'); return; }
          try {
            const res = await fetch('/api/auth/set-password', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newPassword: pw }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { errEl.textContent = d.error || t('Failed'); return; }
            this._authEnabled = true;
            step = 3; render();
          } catch { errEl.textContent = t('Failed'); }
        });
      } else {
        content.innerHTML = `
          <h1>${t('Start your first session')}</h1>
          <p class="ob-sub">${t('Pick a project folder — the agent works inside it')}</p>
          <input type="text" id="ob-cwd" class="ob-cwd" placeholder="~/projects/my-app" autocomplete="off">
          <div class="welcome-actions">
            <button class="welcome-btn" id="ob-chat">${t('Start Chat Session')}</button>
            <button class="welcome-btn welcome-btn-secondary" id="ob-term">${t('Start Terminal Session')}</button>
          </div>
          <div class="ob-alt"><a href="#" id="ob-files">${t('or browse files first')}</a> · <a href="#" id="ob-finish">${t('finish tour')}</a></div>
          <div class="ob-dots">${dots}</div>`;
        const cwdInput = content.querySelector('#ob-cwd');
        fetchJson('/api/home').then(d => { cwdInput.placeholder = d.home; }).catch(() => {});
        const go = (mode) => {
          const cwd = cwdInput.value.trim() || undefined;
          done();
          this.createSession({ cwd, mode, backend: 'claude' });
        };
        content.querySelector('#ob-chat').onclick = () => go('chat');
        content.querySelector('#ob-term').onclick = () => go('terminal');
        content.querySelector('#ob-files').onclick = (e) => { e.preventDefault(); done(); this.openFileExplorer(); };
        content.querySelector('#ob-finish').onclick = (e) => { e.preventDefault(); done(); };
      }
      // ✕ close on every step (Escape works too)
      const close = document.createElement('button');
      close.className = 'ob-close';
      close.innerHTML = '\u2715';
      close.title = t('Close tour');
      close.onclick = done;
      content.appendChild(close);
    };
    this._obKeyHandler?.abort?.();
    this._obKeyHandler = new AbortController();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && welcome.classList.contains('onboarding')) { e.stopPropagation(); done(); this._obKeyHandler.abort(); }
    }, { capture: true, signal: this._obKeyHandler.signal });
    render();
  }

  _setupGlobalSettings() {
    this._fontSize = parseInt(localStorage.getItem('termFontSize')) || 14;
    this._fontFamily = localStorage.getItem('termFontFamily') || getAvailableFonts()[0]?.value || 'monospace';
    this._settingsUI = new SettingsUI(this);
    this._customize = new CustomizeMode(this);

    const btn = document.getElementById('btn-global-settings');
    btn.onclick = (e) => { e.stopPropagation(); this._showGlobalSettings(btn); };
  }

  _showGlobalSettings(anchor) {
    const pop = createPopover(anchor, 'global-settings-popover');
    const rect = anchor.getBoundingClientRect();
    pop.style.left = '';
    pop.style.top = (rect.bottom + 4) + 'px';
    pop.style.right = (window.innerWidth - rect.right) + 'px';

    const opt = (v, l) => { const o = document.createElement('option'); o.value = v; o.textContent = l; return o; };

    // Theme
    const themeLabel = document.createElement('label'); themeLabel.textContent = t('Theme');
    const themeSel = document.createElement('select');
    themeSel.id = 'global-theme-select';
    this._populateThemeSelect(themeSel);
    themeSel.value = this.themeManager.current;
    themeSel.onchange = () => {
      this.themeManager.apply(themeSel.value);
      for (const [, session] of this.sessions) {
        if (session.updateTheme) session.updateTheme(this.themeManager.getTerminalTheme());
      }
    };

    // Theme editor button
    const editBtn = document.createElement('button');
    editBtn.className = 'file-tool-btn';
    editBtn.textContent = '\u270E';
    editBtn.title = t('Theme Editor');
    editBtn.onclick = (e) => { e.stopPropagation(); if (!this._themeEditor) this._themeEditor = new ThemeEditor(this); this._themeEditor.open(); };

    // Font size
    const sizeLabel = document.createElement('label'); sizeLabel.textContent = t('Font Size');
    const sizeRow = document.createElement('div'); sizeRow.className = 'font-size-ctrl';
    const sizeDown = document.createElement('button'); sizeDown.textContent = 'A-';
    const sizeVal = document.createElement('span'); sizeVal.textContent = this._fontSize;
    const sizeUp = document.createElement('button'); sizeUp.textContent = 'A+';
    sizeRow.append(sizeDown, sizeVal, sizeUp);

    const applyFontSize = () => {
      localStorage.setItem('termFontSize', this._fontSize);
      sizeVal.textContent = this._fontSize;
      for (const [, session] of this.sessions) {
        if (session._applyFontSize) {
          // ChatView
          session._applyFontSize(this._fontSize);
        } else if (session.overrides && !session.overrides.fontSize) {
          // TerminalSession
          session.terminal.options.fontSize = this._fontSize;
          try { session.terminal.clearTextureAtlas(); } catch {}
          session.fit();
        }
      }
    };
    sizeDown.onclick = () => { if (this._fontSize > 8) { this._fontSize--; applyFontSize(); } };
    sizeUp.onclick = () => { if (this._fontSize < 28) { this._fontSize++; applyFontSize(); } };

    // Font family
    const fontLabel = document.createElement('label'); fontLabel.textContent = t('Font');
    const fontSel = document.createElement('select');
    for (const f of getAvailableFonts()) {
      const o = opt(f.value === '_sep' ? '' : f.value, f.label);
      if (f.disabled) { o.disabled = true; o.style.fontSize = '9px'; o.style.color = 'var(--text-dim)'; }
      fontSel.appendChild(o);
    }
    fontSel.value = this._fontFamily;
    // A stored font that matches no option (stale localStorage, font list not
    // yet loaded, uninstalled font) left the select BLANK — surface it instead
    if (fontSel.selectedIndex === -1) {
      const curLabel = (this._fontFamily.split(',')[0] || t('Current')).replace(/"/g, '').trim() || t('Current');
      const cur = opt(this._fontFamily, t('{name} (current)', { name: curLabel }));
      fontSel.insertBefore(cur, fontSel.firstChild);
      fontSel.value = this._fontFamily;
    }
    fontSel.onchange = () => {
      this._fontFamily = fontSel.value;
      localStorage.setItem('termFontFamily', this._fontFamily);
      for (const [, session] of this.sessions) {
        if (!session.overrides) continue; // ChatView, not TerminalSession
        if (!session.overrides.fontFamily) {
          session.terminal.options.fontFamily = this._fontFamily;
          try { session.terminal.clearTextureAtlas(); } catch {}
          session.fit();
        }
      }
    };

    // "All Settings" link
    const allSettingsLink = document.createElement('div');
    allSettingsLink.className = 'settings-all-link';
    allSettingsLink.textContent = t('All Settings...');
    allSettingsLink.onclick = () => { pop.remove(); this._settingsUI.open(); };

    const themeRow = document.createElement('div');
    themeRow.style.cssText = 'display:flex;align-items:center;gap:4px';
    themeRow.append(themeSel, editBtn);
    pop.append(themeLabel, themeRow, sizeLabel, sizeRow, fontLabel, fontSel, allSettingsLink);

    // Account / help section — compact menu rows (matches context-menu look)
    const menu = document.createElement('div');
    menu.className = 'gs-menu';
    const item = (svg, label, onClick, danger = false) => {
      const el = document.createElement('div');
      el.className = 'gs-menu-item' + (danger ? ' danger' : '');
      el.innerHTML = `<span class="gs-menu-icon">${svg}</span><span>${label}</span>`;
      el.onclick = () => { pop.remove(); onClick(); };
      return el;
    };
    const I = {
      key: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="11" r="3"/><path d="M7.5 8.5L13 3M11 5l2 2M9 7l1.5 1.5"/></svg>',
      brush: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 2.5c-2.5.5-5.5 3-7 5l2 2c2-1.5 4.5-4.5 5-7z"/><path d="M6.5 7.5c-1.5.3-2.5 1.5-2.5 3.5-1 .5-1.5.5-2.5.5 1 1.5 2.5 2 4 2s2.8-1.3 3-3"/></svg>',
      tour: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.5v3.5M8 5v.5"/></svg>',
      out: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2H3v12h3M10 11l3-3-3-3M13 8H6"/></svg>',
      exp: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V2M5 5l3-3 3 3M3 10v3h10v-3"/></svg>',
      imp: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M5 7l3 3 3-3M3 10v3h10v-3"/></svg>',
      lock: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>',
    };
    const sep = () => { const s = document.createElement('div'); s.className = 'gs-menu-sep'; return s; };
    // workspace tools / data & security / help — grouped, the flat list grew too long
    if (!this.isMobile) menu.append(item(I.brush, t('Customize UI\u2026'), () => this._customize.enter()));
    menu.append(item(I.key, t('Manage agents\u2026'), () => this._showAgentsDialog()));
    // Language is PER-DEVICE (localStorage, not a synced setting) \u2014 names shown
    // in their own language, never translated. Switching reloads the page.
    {
      const I_globe = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c-1.8 1.8-2.7 4-2.7 6.5S6.2 12.7 8 14.5c1.8-1.8 2.7-4 2.7-6.5S9.8 3.3 8 1.5z"/></svg>';
      const pref = getLangPref();
      const cur = { auto: t('Auto (system)'), en: 'English', zh: '\u4e2d\u6587', ja: '\u65e5\u672c\u8a9e' }[pref] || pref;
      const langItem = item(I_globe, `${t('Language')}: ${cur}`, () => {});
      langItem.onclick = (e) => {
        const choices = [['auto', t('Auto (system)')], ['en', 'English'], ['zh', '\u4e2d\u6587'], ['ja', '\u65e5\u672c\u8a9e']];
        showContextMenu(e.clientX, e.clientY, choices.map(([code, label]) => ({
          label: (pref === code ? '\u2713 ' : '\u2007 ') + label,
          action: () => setLang(code), // showContextMenu items use .action, not .onClick
        })));
      };
      menu.append(langItem);
    }
    menu.append(sep(),
      item(I.exp, t('Backup & migrate\u2026'), () => this._showTransferDialog()),
      item(I.lock, this._authEnabled ? t('Change password\u2026') : t('Set password\u2026'), () => this._showPasswordDialog()));
    menu.append(sep(), item(I.tour, t('Welcome tour'), () => this._showOnboarding(true)));
    if (this._authEnabled) {
      menu.append(item(I.out, t('Sign out'), async () => {
        try { await fetch('/api/logout', { method: 'POST' }); } catch {}
        location.href = '/login';
      }, true));
    }
    pop.append(menu);
  }

  _setupGridConfig() {
    const rowsInput = document.getElementById('grid-rows');
    const colsInput = document.getElementById('grid-cols');
    const preview = document.getElementById('grid-preview');

    const updatePreview = () => {
      const r = parseInt(rowsInput.value) || 2, c = parseInt(colsInput.value) || 2;
      preview.style.gridTemplateRows = `repeat(${r}, 1fr)`;
      preview.style.gridTemplateColumns = `repeat(${c}, 1fr)`;
      preview.innerHTML = '';
      for (let i = 0; i < r * c; i++) {
        const cell = document.createElement('div'); cell.className = 'grid-preview-cell'; cell.textContent = i + 1;
        preview.appendChild(cell);
      }
    };

    document.getElementById('btn-add-grid').addEventListener('click', () => {
      updatePreview();
      this._showDialog('dialog-grid');
    });
    rowsInput.addEventListener('input', updatePreview);
    colsInput.addEventListener('input', updatePreview);

    document.getElementById('btn-apply-grid').addEventListener('click', () => {
      const r = parseInt(rowsInput.value) || 2, c = parseInt(colsInput.value) || 2;
      this._addCustomGrid(r, c);
      this.hideDialogs();
    });

    // Load saved custom grids on startup
    this._loadCustomGrids();
  }

  _gridIcon(rows, cols) {
    // For grids up to 4x4, render SVG cells; otherwise show "RxC" text
    if (rows * cols > 16) {
      return `<span style="font-size:9px;font-weight:600;line-height:14px">${rows}x${cols}</span>`;
    }
    const gap = 1, size = 16;
    const cw = (size - gap * (cols + 1)) / cols;
    const ch = (size - gap * (rows + 1)) / rows;
    const sw = Math.min(1.2, 14 / (rows * cols + 4));
    let rects = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = gap + c * (cw + gap), y = gap + r * (ch + gap);
        rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="none" stroke="currentColor" stroke-width="${sw}"/>`;
      }
    }
    return `<svg viewBox="0 0 16 16" width="14" height="14">${rects}</svg>`;
  }

  _renderCustomGridButton(rows, cols) {
    const btn = document.createElement('button');
    btn.className = 'layout-btn custom-grid-btn';
    btn.title = t('{rows}×{cols} grid', { rows, cols });
    btn.innerHTML = this._gridIcon(rows, cols);
    btn.dataset.gridRows = rows;
    btn.dataset.gridCols = cols;
    btn.onclick = () => this.wm.applyLayout(`grid-${rows}-${cols}`);
    // Register this grid size in window manager
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      this._removeCustomGrid(rows, cols);
    };
    return btn;
  }

  async _loadCustomGrids() {
    const data = await fetchJson('/api/layouts');
    this._customGrids = data?.customGrids || [];
    this._renderCustomGridButtons();
  }

  _renderCustomGridButtons() {
    const container = document.getElementById('custom-grids-container');
    container.innerHTML = '';
    for (const g of this._customGrids || []) {
      container.appendChild(this._renderCustomGridButton(g.rows, g.cols));
    }
  }

  async _addCustomGrid(rows, cols) {
    // Apply grid immediately
    this.wm.setGrid(rows, cols);
    // Check if it's a built-in preset — don't save those
    const builtins = [[1,1],[1,2],[2,1],[2,2],[1,3]];
    if (builtins.some(([r,c]) => r === rows && c === cols)) return;
    // Save to server
    const data = await fetchJson('/api/custom-grids', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, cols }),
    });
    if (data) { this._customGrids = data.customGrids || []; this._renderCustomGridButtons(); }
  }

  async _removeCustomGrid(rows, cols) {
    const data = await fetchJson('/api/custom-grids', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, cols }),
    });
    if (data) { this._customGrids = data.customGrids || []; this._renderCustomGridButtons(); }
  }

  _setupUsage() {
    this._usageData = new Map(); // sessionId → usage
    this._codexRateLimit = null;
    const usageEl = document.getElementById('taskbar-usage');
    const popup = document.getElementById('usage-popup');

    usageEl.onclick = () => popup.classList.toggle('hidden');
    document.addEventListener('mousedown', (e) => {
      if (!popup.contains(e.target) && !usageEl.contains(e.target)) popup.classList.add('hidden');
    });

    // Poll usage for active sessions
    this._pollUsage();
  }

  async _pollUsage() {
    const data = await fetchJson('/api/usage');
    if (data?.rateLimit) this._rateLimit = data.rateLimit;
    else if (this._rateLimit === undefined) this._rateLimit = null;
    if (data?.codexRateLimit) this._codexRateLimit = data.codexRateLimit;
    else if (this._codexRateLimit === undefined) this._codexRateLimit = null;
    this._subSignedOut = !!data?.subscriptionSignedOut;
    this._renderUsage();
    setTimeout(() => this._pollUsage(), 30000);
  }

  _renderUsage() {
    const usageEl = document.getElementById('taskbar-usage');
    const popup = document.getElementById('usage-popup');
    const rl = this._rateLimit;
    const codex = this._codexRateLimit;

    if (!rl && !codex) {
      usageEl.innerHTML = '';
      popup.innerHTML = `<div class="empty-hint">${t('No usage data')}</div>`;
      return;
    }

    const usageColor = (pct) => (pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--yellow)' : 'var(--green)');
    // Donut with the window label in the hole — 5h vs 7d distinguishable at a
    // glance instead of two identical pies
    const renderPie = (label, pct) => {
      const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
      const color = usageColor(clamped);
      const deg = Math.round(clamped * 3.6);
      return `<div class="usage-pie usage-donut" title="${label}: ${clamped}%" style="background:conic-gradient(${color} ${deg}deg, var(--bg-input) ${deg}deg)"><span class="usage-donut-label">${label}</span></div>`;
    };
    const renderRow = (backend, primaryLabel, primaryPct, secondaryLabel, secondaryPct) => (
      `<div class="taskbar-usage-row">
        ${createBackendIconHtml(backend, { className: 'taskbar-usage-backend', title: backend === 'codex' ? 'Codex' : 'Claude' })}
        <div class="taskbar-usage-pair">
          ${renderPie(primaryLabel, primaryPct)}
          ${renderPie(secondaryLabel, secondaryPct)}
        </div>
      </div>`
    );
    const renderSectionTitle = (backend, label) => (
      `<div class="usage-section-title">${createBackendIconHtml(backend, { className: 'usage-section-backend', title: label })}<span>${label}</span></div>`
    );

    const rows = [];
    const sections = [];
    const agoText = (ts) => {
      if (!ts) return '—';
      const m = Math.round((Date.now() - ts) / 60000);
      return m < 1 ? t('just now') : t('{m}min ago', { m });
    };
    const fmtReset = (ts) => {
      if (!ts) return '?';
      const d = new Date(ts * 1000), now = new Date();
      const time = d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
      if (d.toDateString() === now.toDateString()) return t('Today {time}', { time });
      const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
      if (d.toDateString() === tmr.toDateString()) return t('Tomorrow {time}', { time });
      return d.toLocaleDateString([], {month:'short',day:'numeric'}) + ' ' + time;
    };

    if (rl) {
      const pct5h = Math.round((rl.fiveHour?.utilization || 0) * 100);
      const color = usageColor(pct5h);
      const pct7d = Math.round((rl.sevenDay?.utilization || 0) * 100);
      const color7d = usageColor(pct7d);
      rows.push(renderRow('claude', '5h', pct5h, '7d', pct7d));
      const scopedSections = [];
      for (const sc of rl.scopedWeekly || []) {
        const pctSc = Math.round((sc.utilization || 0) * 100);
        const colorSc = usageColor(pctSc);
        scopedSections.push(`
      <div class="usage-session">
        <div class="usage-session-name">${t('{name} weekly limit', { name: escHtml(sc.name) })}</div>
        <div class="usage-bar" style="width:100%;margin:4px 0"><div class="usage-bar-fill" style="width:${pctSc}%;background:${colorSc}"></div></div>
        <div class="usage-session-stats">
          <span class="usage-stat">${t('{pct}% used', { pct: pctSc })}</span>
          <span class="usage-stat"><span class="usage-stat-label">${t('Resets')}</span> ${fmtReset(sc.resetsAt)}</span>
        </div>
      </div>`);
      }
      sections.push(`${renderSectionTitle('claude', 'Claude')}
      <div class="usage-session">
        <div class="usage-session-name">${t('5-hour limit')}</div>
        <div class="usage-bar" style="width:100%;margin:4px 0"><div class="usage-bar-fill" style="width:${pct5h}%;background:${color}"></div></div>
        <div class="usage-session-stats">
          <span class="usage-stat">${t('{pct}% used', { pct: pct5h })}</span>
          <span class="usage-stat"><span class="usage-stat-label">${t('Resets')}</span> ${fmtReset(rl.fiveHour?.resetsAt)}</span>
        </div>
      </div>
      <div class="usage-session">
        <div class="usage-session-name">${t('7-day limit')}</div>
        <div class="usage-bar" style="width:100%;margin:4px 0"><div class="usage-bar-fill" style="width:${pct7d}%;background:${color7d}"></div></div>
        <div class="usage-session-stats">
          <span class="usage-stat">${t('{pct}% used', { pct: pct7d })}</span>
          <span class="usage-stat"><span class="usage-stat-label">${t('Resets')}</span> ${fmtReset(rl.sevenDay?.resetsAt)}</span>
        </div>
      </div>${scopedSections.join('')}
      ${this._subSignedOut ? `<div class="usage-note">${t('⚠ Subscription signed out (a Console login replaced it) — pies show its last-known quota. API-billed sessions never appear here.')}</div>` : ''}
      <div class="usage-updated">${t('Updated {ago}', { ago: agoText(rl.fetchedAt) })}</div>`);
    }

    if (codex?.fiveHour || codex?.sevenDay) {
      const pct5h = Math.round(codex.fiveHour?.usedPercent || ((codex.fiveHour?.utilization || 0) * 100));
      const pct7d = Math.round(codex.sevenDay?.usedPercent || ((codex.sevenDay?.utilization || 0) * 100));
      const color5h = usageColor(pct5h);
      const color7d = usageColor(pct7d);
      rows.push(renderRow('codex', '5h', pct5h, '7d', pct7d));
      sections.push(`${renderSectionTitle('codex', 'Codex')}
      <div class="usage-session">
        <div class="usage-session-name">${t('5-hour limit')}</div>
        <div class="usage-bar" style="width:100%;margin:4px 0"><div class="usage-bar-fill" style="width:${pct5h}%;background:${color5h}"></div></div>
        <div class="usage-session-stats">
          <span class="usage-stat">${t('{pct}% used', { pct: pct5h })}</span>
          <span class="usage-stat"><span class="usage-stat-label">${t('Resets')}</span> ${fmtReset(codex.fiveHour?.resetsAt)}</span>
        </div>
      </div>
      <div class="usage-session">
        <div class="usage-session-name">${t('7-day limit')}</div>
        <div class="usage-bar" style="width:100%;margin:4px 0"><div class="usage-bar-fill" style="width:${pct7d}%;background:${color7d}"></div></div>
        <div class="usage-session-stats">
          <span class="usage-stat">${t('{pct}% used', { pct: pct7d })}</span>
          <span class="usage-stat"><span class="usage-stat-label">${t('Resets')}</span> ${fmtReset(codex.sevenDay?.resetsAt)}</span>
          ${codex.planType ? `<span class="usage-stat"><span class="usage-stat-label">${t('Plan')}</span> ${escHtml(codex.planType)}</span>` : ''}
        </div>
      </div>
      <div class="usage-updated">${t('Updated {ago}', { ago: agoText(codex.fetchedAt) })}</div>`);
    }

    usageEl.innerHTML = rows.join('');
    // Per-SECTION freshness: claude and codex poll independently — a stalled
    // claude poll (e.g. signed out) must not make codex's data look stale too.
    popup.innerHTML = sections.join('');
  }

  // Command mode extracted to CommandMode class (src/lib/command-mode.js)

  _setupLayoutManager() {
    document.getElementById('btn-presets').addEventListener('click', () => this._showPresetsDialog());
    document.getElementById('btn-preset-save').addEventListener('click', () => {
      const input = document.getElementById('preset-save-name');
      const name = input.value.trim();
      if (!name) return;
      this.layoutManager.savePreset(name).then(() => {
        input.value = '';
        this._renderPresetsList();
      });
    });
  }

  async _showPresetsDialog() {
    await this.layoutManager.refresh();
    this._renderPresetsList();
    this._showDialog('dialog-presets');
  }

  _renderPresetsList() {
    const list = document.getElementById('saved-presets-list');
    list.innerHTML = '';
    const presets = this.layoutManager._savedPresets;
    const names = Object.keys(presets).sort();
    if (!names.length) {
      list.innerHTML = `<div class="empty-hint">${t('No saved presets. Save current workspace as a preset.')}</div>`;
      return;
    }
    for (const name of names) {
      const preset = presets[name];
      const card = document.createElement('div'); card.className = 'layout-card';
      const isCurrent = name === this.layoutManager._currentName;

      const info = document.createElement('div'); info.className = 'layout-card-info';
      info.innerHTML = `<div class="layout-card-name">${isCurrent ? '● ' : ''}${escHtml(name)}</div>
        <div class="layout-card-meta">${t('{n} windows', { n: preset.windows?.length || 0 })} · ${escHtml(preset.theme || 'dark')} · ${preset.updatedAt ? new Date(preset.updatedAt).toLocaleString() : ''}</div>`;
      info.onclick = () => {
        this.layoutManager.loadPreset(name).then(() => this.hideDialogs());
      };

      const actions = document.createElement('div'); actions.className = 'layout-card-actions';
      const btnOverwrite = document.createElement('button'); btnOverwrite.className = 'layout-card-btn'; btnOverwrite.textContent = '⟳';
      btnOverwrite.title = t('Overwrite with current');
      btnOverwrite.onclick = (e) => { e.stopPropagation(); this.layoutManager.savePreset(name).then(() => this._renderPresetsList()); };
      const btnDel = document.createElement('button'); btnDel.className = 'layout-card-btn delete'; btnDel.textContent = '✕';
      btnDel.title = t('Delete');
      btnDel.onclick = (e) => { e.stopPropagation(); this.layoutManager.deletePreset(name).then(() => this._renderPresetsList()); };
      actions.append(btnOverwrite, btnDel);

      card.append(info, actions);
      list.appendChild(card);
    }
  }

  _setupDialogs() {
    const overlay = document.getElementById('dialog-overlay');
    overlay.querySelectorAll('.dialog-close, .btn-cancel').forEach(btn => btn.addEventListener('click', () => this.hideDialogs()));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.hideDialogs(); });

    // Global Escape: close the transient chrome layer-by-layer — context menus
    // and popovers first, then the modal dialog. Skipped while focus is inside
    // a terminal (Esc is meaningful to TUI apps there).
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      if (e.target.closest?.('.xterm')) return;
      const floats = document.querySelectorAll('[data-popover]');
      if (floats.length) { floats.forEach(el => el.remove()); e.preventDefault(); return; }
      if (!overlay.classList.contains('hidden')) { this.hideDialogs(); e.preventDefault(); }
    });

    const backendInput = document.getElementById('input-backend');
    backendInput.addEventListener('change', () => this._applySessionBackendOptions(backendInput.value, { applyDefaults: true }));
    this._applySessionBackendOptions(backendInput.value || 'claude', { applyDefaults: true });

    // Enter in any text input of the New Session dialog submits it
    document.getElementById('dialog-new-session').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      if (e.target.tagName !== 'INPUT') return;
      // Let the cwd autocomplete accept its highlighted suggestion first
      if (e.target.id === 'input-cwd' && !document.getElementById('cwd-suggestions')?.classList.contains('hidden')) return;
      e.preventDefault();
      document.querySelector('#dialog-new-session .btn-create').click();
    });

    document.querySelector('#dialog-new-session .btn-create').addEventListener('click', () => {
      const backend = document.getElementById('input-backend').value || 'claude';
      const hostId = document.getElementById('input-host')?.value || undefined;
      const cwd = document.getElementById('input-cwd').value.trim();
      if (backend === 'shell') {
        // Plain terminal — reuse openShellTerminal (handles host + defaults)
        this.openShellTerminal(cwd || undefined, { hostId });
        this.hideDialogs();
        return;
      }
      this.createSession({
        backend,
        hostId,
        mode: document.getElementById('input-mode').value,
        cwd,
        name: document.getElementById('input-session-name').value.trim(),
        model: document.getElementById('input-model').value === '__custom__'
          ? (document.getElementById('input-model-custom').value.trim() || '')
          : document.getElementById('input-model').value,
        permission: document.getElementById('input-permission').value,
        effort: document.getElementById('input-effort').value,
        extraArgs: document.getElementById('input-extra-args').value.trim(),
        taskId: document.getElementById('input-task')?.value || undefined,
        accountId: document.getElementById('input-account')?.value || undefined,
      });
      this.hideDialogs();
    });

    // Fork dialog: textarea + "Fork & Send". Sending a first message is what
    // makes the fork actually diverge (claude only mints the fork's new id once
    // it receives input), so the primary action requires non-empty text.
    const forkTa = document.getElementById('fork-first-message');
    const forkBtn = document.getElementById('btn-fork-send');
    if (forkTa && forkBtn) {
      const sync = () => { forkBtn.disabled = !forkTa.value.trim(); };
      forkTa.addEventListener('input', sync);
      forkBtn.addEventListener('click', () => {
        const text = forkTa.value.trim();
        if (!text || !this._pendingFork) return;
        const titleInput = document.getElementById('fork-title');
        const customName = titleInput ? titleInput.value.trim() : '';
        const info = this._pendingFork; const at = this._pendingForkAt;
        this._pendingFork = null; this._pendingForkAt = null;
        this.hideDialogs();
        this._doForkSession(info, text, at, customName);
      });
      forkTa.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); forkBtn.click(); }
      });
    }

    // CWD autocomplete
    this._setupCwdAutocomplete();
  }

  getSessionOptions(backend) {
    return BACKEND_SESSION_OPTIONS[backend] || BACKEND_SESSION_OPTIONS.claude;
  }

  _getBackendSessionDefaults(backend) {
    const prefix = backend === 'codex' ? 'codex' : 'claude';
    const cfg = BACKEND_SESSION_OPTIONS[backend] || BACKEND_SESSION_OPTIONS.claude;
    const legacyEffort = this.settings.get('session.defaultEffort') ?? '';
    let effort = this.settings.get(`${prefix}.defaultEffort`) ?? '';
    if (!effort && !this.settings.isModified(`${prefix}.defaultEffort`) && cfg.efforts.some((opt) => opt.value === legacyEffort)) {
      effort = legacyEffort;
    }
    return {
      model: this.settings.get(`${prefix}.defaultModel`) ?? '',
      permission: this.settings.get(`${prefix}.defaultPermissionMode`) ?? '',
      effort,
      extraArgs: this.settings.get(`${prefix}.defaultExtraArgs`) ?? '',
    };
  }

  _applySessionBackendOptions(backend, { applyDefaults = false } = {}) {
    // Plain shell terminal has no model/permission/effort/mode — hide those
    // rows so the dialog is just Backend / Host / Working Directory / Name.
    const isShell = backend === 'shell';
    for (const [id, hide] of [
      ['row-mode', isShell], ['row-model', isShell], ['custom-model-row', isShell],
      ['row-permission', isShell], ['row-effort', isShell], ['row-extra-args', isShell],
    ]) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', hide);
    }
    if (isShell) return; // nothing else to populate

    const cfg = BACKEND_SESSION_OPTIONS[backend] || BACKEND_SESSION_OPTIONS.claude;
    const modelSel = document.getElementById('input-model');
    const customModelRow = document.getElementById('custom-model-row');
    const customModelInput = document.getElementById('input-model-custom');
    const permissionSel = document.getElementById('input-permission');
    const effortSel = document.getElementById('input-effort');
    const extraArgsInput = document.getElementById('input-extra-args');
    const defaults = this._getBackendSessionDefaults(backend);
    const currentModel = modelSel?.value || '';
    const currentPermission = permissionSel?.value || '';
    const currentEffort = effortSel?.value || '';

    modelSel.innerHTML = '';
    const modelIds = [];
    for (const m of cfg.models) {
      const opt = document.createElement('option');
      const id = typeof m === 'string' ? m : m.id;
      const label = typeof m === 'string' ? (m || t('Default')) : (m.label || m.id || t('Default'));
      opt.value = id;
      opt.textContent = label;
      modelSel.appendChild(opt);
      modelIds.push(id);
    }
    // "Custom..." option for free-text model entry
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = t('Custom...');
    modelSel.appendChild(customOpt);

    const nextModel = applyDefaults
      ? defaults.model
      : (modelIds.includes(currentModel) ? currentModel : defaults.model);
    modelSel.value = modelIds.includes(nextModel) ? nextModel : '';

    // Wire custom model toggle
    modelSel.onchange = () => {
      const isCustom = modelSel.value === '__custom__';
      customModelRow.classList.toggle('hidden', !isCustom);
      if (isCustom && customModelInput) customModelInput.focus();
    };
    customModelRow.classList.add('hidden');

    permissionSel.innerHTML = '';
    for (const optData of cfg.permissions) {
      const opt = document.createElement('option');
      opt.value = optData.value;
      opt.textContent = optData.label;
      permissionSel.appendChild(opt);
    }
    const permissionValue = applyDefaults
      ? defaults.permission
      : (cfg.permissions.some((opt) => opt.value === currentPermission) ? currentPermission : defaults.permission);
    permissionSel.value = cfg.permissions.some((opt) => opt.value === permissionValue) ? permissionValue : '';

    effortSel.innerHTML = '';
    for (const optData of cfg.efforts) {
      const opt = document.createElement('option');
      opt.value = optData.value;
      opt.textContent = optData.label;
      effortSel.appendChild(opt);
    }

    const effortValue = applyDefaults
      ? defaults.effort
      : (cfg.efforts.some((opt) => opt.value === currentEffort) ? currentEffort : defaults.effort);
    effortSel.value = cfg.efforts.some((opt) => opt.value === effortValue) ? effortValue : '';

    if (extraArgsInput && applyDefaults) extraArgsInput.value = defaults.extraArgs || '';
  }

  _setupCwdAutocomplete() {
    const input = document.getElementById('input-cwd');
    const dropdown = document.getElementById('cwd-suggestions');
    // When a host is chosen, completion + recent chips come from that host
    // over ssh instead of the local filesystem.
    setupDirAutocomplete(input, dropdown, {
      endpoint: () => {
        const h = document.getElementById('input-host')?.value;
        return h ? `/api/hosts/${h}/dir-complete` : null;
      },
      // #2: float the selected task's linked folders to the top of the cwd
      // suggestions (highlighted), so starting a session "in" a task recommends
      // its own folders first.
      priorityPaths: () => {
        const tid = document.getElementById('input-task')?.value;
        const t = tid && this.sidebar?._taskById?.(tid);
        return t ? this.sidebar._folderPaths(t) : [];
      },
    });
  }

  // The selected Task Group's folder suggestions for the New Session dialog
  // chips: every linked folder, plus — for recursive folders — nested folders
  // that already contain sessions (e.g. group folder /a with sessions at /a
  // and /a/too ⇒ suggest BOTH /a and /a/too). Subfolder discovery is local
  // sessions only; with a remote host selected we still pin the folder paths
  // themselves (remote cwds aren't reliably in _allSessions).
  _taskCwdSuggestions(hostId) {
    const tid = document.getElementById('input-task')?.value;
    const tg = tid ? this.sidebar?._taskById?.(tid) : null;
    if (!tg) return [];
    const out = []; const seen = new Set();
    const add = (path, tip) => { if (path && !seen.has(path)) { seen.add(path); out.push({ path, tip, color: tg.color || '' }); } };
    for (const f of tg.folders || []) {
      const rec = this.sidebar._folderRec(f);
      add(rec.path, t('Task Group folder ({name})', { name: tg.title }));
      if (rec.recursive && !hostId) {
        const subs = new Map(); // session cwd strictly under the folder -> count
        for (const s of this.sidebar?._allSessions || []) {
          if (s.host || !s.cwd) continue;
          const under = s.cwd.startsWith(rec.path + '/') || (s.realCwd && s.realCwd.startsWith(rec.path + '/'));
          if (under) subs.set(s.cwd, (subs.get(s.cwd) || 0) + 1);
        }
        for (const [c, n] of [...subs.entries()].sort((a, b) => b[1] - a[1]))
          add(c, t('In a Task Group folder — {n} session(s) here', { n }));
      }
    }
    return out;
  }

  // Fill the recent-cwd chip row for the selected host (or local). The
  // selected Task Group's folders are PINNED first as marked chips.
  _fillCwdRecent(hostId) {
    const recentEl = document.getElementById('cwd-recent');
    if (!recentEl) return;
    const taskChips = this._taskCwdSuggestions(hostId);
    const paint = (cwds) => {
      recentEl.innerHTML = '';
      const mkChip = (cwd, { cls, tip, color } = {}) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'cwd-recent-chip' + (cls ? ' ' + cls : '');
        const short = cwd.replace(/^\/home\/[^/]+/, '~');
        if (cls) {
          if (color) { const dot = document.createElement('span'); dot.className = 'tvg-dot'; dot.style.setProperty('--g-color', color); chip.appendChild(dot); }
          const p = document.createElement('span'); p.className = 'cwd-chip-path'; p.textContent = short; chip.appendChild(p);
        } else {
          chip.textContent = short;
        }
        chip.title = tip ? `${tip}\n${cwd}` : cwd;
        chip.onclick = () => { document.getElementById('input-cwd').value = cwd; };
        recentEl.appendChild(chip);
      };
      for (const s of taskChips) mkChip(s.path, { cls: 'cwd-task-chip', tip: s.tip, color: s.color });
      const pinned = new Set(taskChips.map((s) => s.path));
      for (const cwd of cwds.filter((c) => !pinned.has(c)).slice(0, 8)) mkChip(cwd);
    };
    if (hostId) {
      recentEl.innerHTML = `<span class="cwd-recent-loading">${t('loading host paths…')}</span>`;
      fetchJson(`/api/hosts/${hostId}/recent-cwds`).then(d => {
        // strip the "host: " display prefix discovery may add
        paint((d?.cwds || []).map(c => c.includes(': ') ? c.split(': ').pop() : c));
      }).catch(() => { recentEl.innerHTML = ''; });
    } else {
      const seen = new Set();
      const local = [];
      for (const s of [...(this.sidebar?._allSessions || [])].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))) {
        if (!s.cwd || s.host || seen.has(s.cwd)) continue; // skip remote sessions' host-prefixed cwds
        seen.add(s.cwd); local.push(s.cwd);
        if (local.length >= 8) break;
      }
      paint(local);
    }
  }

  _showDialog(id) {
    const overlay = document.getElementById('dialog-overlay'); overlay.classList.remove('hidden');
    overlay.querySelectorAll('.dialog').forEach(d => d.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  }

  showNewSessionDialog({ cwd, backend, hostId, taskId } = {}) {
    if (this.isMobile) this.sidebar.toggle(false); // close sidebar so dialog is visible
    this._showDialog('dialog-new-session');
    // Task dropdown — new sessions can start "in" a task: pre-selected when
    // opened from the task board, freely pickable otherwise. Picking a task
    // prefills the cwd from its first auto-include folder (never clobbers a
    // path the user already typed); the created session is bound to the task
    // and spawned with VIBESPACE_TASK_ID.
    const taskSel = document.getElementById('input-task');
    if (taskSel) {
      taskSel.innerHTML = `<option value="">${t('None')}</option>`;
      for (const tg of this.sidebar?._taskBoardOrder?.() || []) {
        const o = document.createElement('option');
        o.value = tg.id;
        o.textContent = tg.title + (tg.archived ? ' ' + t('(archived)') : '');
        taskSel.appendChild(o);
      }
      taskSel.value = taskId || '';
      taskSel.onchange = () => {
        const tg = this.sidebar?._taskById?.(taskSel.value);
        const cwdInput = document.getElementById('input-cwd');
        const firstFolder = tg?.folders?.[0] && (typeof tg.folders[0] === 'string' ? tg.folders[0] : tg.folders[0].path);
        if (firstFolder && !cwdInput.value.trim()) cwdInput.value = firstFolder;
        // Re-render the quick-fill chips — the group's folders pin to the front
        this._fillCwdRecent(document.getElementById('input-host')?.value || '');
      };
    }
    // Account dropdown (billing identity: subscription OAuth vs an API key).
    // Claude sessions only — remote hosts supported too (the key ships to the
    // remote over ssh stdin, never argv; 'Subscription' there means the
    // REMOTE machine's own login).
    const acctRow = document.getElementById('row-account');
    const acctSel = document.getElementById('input-account');
    const updateAcctRow = () => {
      if (!acctRow || !acctSel) return;
      const be = document.getElementById('input-backend')?.value || 'claude';
      const list = this._accounts?.accounts || [];
      const show = be === 'claude' && list.length > 0;
      acctRow.style.display = show ? '' : 'none';
      if (!show) { acctSel.value = ''; return; }
      const defId = this._accounts?.defaultAccountId;
      const defName = defId ? (list.find(a => a.id === defId)?.name || t('API key')) : t('Subscription');
      const prev = acctSel.value;
      acctSel.innerHTML = '';
      for (const [v, label] of [
        ['', t('Default ({name})', { name: defName })],
        ['subscription', t('Subscription (Pro/Max login)')],
        ...list.map(a => [a.id, t('{name} — API key …{tail}', { name: a.name, tail: a.tail })]),
      ]) {
        const o = document.createElement('option');
        o.value = v; o.textContent = label;
        acctSel.appendChild(o);
      }
      acctSel.value = [...acctSel.options].some(o => o.value === prev) ? prev : '';
    };
    this._updateAcctRow = updateAcctRow; // freshest closure wins
    updateAcctRow();
    if (!this._acctListenersWired) {
      // Wire ONCE (this method runs on every dialog open) — call through the
      // stored freshest updater.
      this._acctListenersWired = true;
      document.getElementById('input-backend')?.addEventListener('change', () => this._updateAcctRow?.());
      document.getElementById('input-host')?.addEventListener('change', () => this._updateAcctRow?.());
    }
    // Host dropdown (remote sessions run over ssh + remote dtach; terminal only until P3)
    const hostSel = document.getElementById('input-host');
    if (hostSel) {
      fetchJson('/api/hosts').then(d => {
        hostSel.innerHTML = `<option value="">${t('Local')}</option>`;
        for (const h of d?.hosts || []) {
          const o = document.createElement('option');
          o.value = h.id; o.textContent = `${h.name} (${h.user}@${h.host})`;
          hostSel.appendChild(o);
        }
        hostSel.value = hostId || '';
        // both terminal and chat supported on remote hosts (chat = ssh -T pipe)
        // switching host re-sources the path list + autocomplete target
        hostSel.onchange = () => this._fillCwdRecent(hostSel.value);
        this._fillCwdRecent(hostSel.value);
      });
    }
    const b = backend || 'claude';
    document.getElementById('input-backend').value = b;
    this._applySessionBackendOptions(b, { applyDefaults: true });
    document.getElementById('input-mode').value = this.settings.get('session.defaultMode') ?? 'chat';
    if (cwd) document.getElementById('input-cwd').value = cwd;
    this._fillCwdRecent(hostId || '');
    document.getElementById('input-cwd').focus();
  }
  hideDialogs() { document.getElementById('dialog-overlay').classList.add('hidden'); document.getElementById('dialog-overlay').querySelectorAll('.dialog').forEach(d => d.classList.add('hidden')); }

  _buildTitleMeta(source = {}) {
    const identity = pickAgentIdentity(source);
    return {
      backend: identity.backend,
      agentKind: identity.agentKind,
      agentRole: identity.agentRole,
      agentNickname: identity.agentNickname,
      sourceKind: identity.sourceKind,
      parentThreadId: identity.parentThreadId,
    };
  }

  // Plain shell terminal — no AI backend, same dtach persistence + window
  // management. Optional initialCommand is typed for the user once the shell
  // is up (e.g. the in-product "Log in to Claude" helper).
  openShellTerminal(cwd, { initialCommand, hostId } = {}) {
    this.createSession({
      backend: 'shell', mode: 'terminal', cwd: cwd || undefined, hostId,
      name: initialCommand ? initialCommand.split(' ')[0] : 'Terminal',
      model: null, permission: null, effort: null, extraArgs: '',
      initialCommand,
    });
  }

  createSession({ cwd, name, model, permission, extraArgs, resumeId, mode, syncId, effort, fork, hostId, backend = 'claude', backendSessionId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId, initialMessage, initialCommand, forkAtUuid, forkTitle, taskId, accountId }) {
    this._hideWelcome();
    const defaults = this._getBackendSessionDefaults(backend);
    const sessionMode = mode || this.settings.get('session.defaultMode') || 'chat';
    const sessionModel = model !== undefined ? model : defaults.model;
    const sessionPermission = permission !== undefined ? permission : defaults.permission;
    const sessionEffort = effort !== undefined ? effort : defaults.effort;
    const sessionExtraArgs = extraArgs !== undefined ? extraArgs : defaults.extraArgs;
    const sessionName = name || (resumeId ? t('Resume {id}', { id: resumeId.substring(0,8) }) : t('Session {n}', { n: this.wm.windowCounter+1 }));
    const sessionKey = backendSessionId || resumeId ? `${backend}:${backendSessionId || resumeId}` : '';
    const winType = sessionMode === 'chat' ? 'chat' : 'terminal';
    const titleMeta = this._buildTitleMeta({ backend, agentKind, agentRole, agentNickname, sourceKind, parentThreadId });
    const winInfo = this.wm.createWindow({ title: sessionName, type: winType, syncId, titleMeta });
    // Correlation id: concurrent creates (e.g. group resume-all) must each
    // match their OWN 'created' reply — an untagged match binds the ChatView
    // to whichever session the server happens to answer first.
    const reqId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    this.ws.send({
      type:'create', backend, hostId: hostId||undefined, mode: sessionMode, cwd: cwd||undefined, sessionName: name||undefined, model: sessionModel||undefined,
      permissionMode: sessionPermission||undefined, effort: sessionEffort||undefined, extraArgs: sessionExtraArgs||undefined,
      tuiRenderer: (backend === 'claude' && sessionMode === 'terminal' ? this.settings.get('claude.tuiRenderer') : '') || undefined,
      agentKind: agentKind || undefined, agentRole: agentRole || undefined, agentNickname: agentNickname || undefined,
      sourceKind: sourceKind || undefined, parentThreadId: parentThreadId || undefined,
      resume: !!resumeId, resumeId: resumeId||undefined, fork: fork||undefined, cols:120, rows:30, reqId,
      taskId: taskId || undefined, // spawns VIBESPACE_TASK_ID into the agent env
      accountId: accountId || undefined, // billing identity: undefined=server default, 'subscription', or acct-… key id
    });

    const handler = (msg) => {
      // Window closed before the server answered — clean up the handler so it
      // doesn't hold winInfo forever (and can't bind a session to a dead window)
      if (!this.wm.windows.has(winInfo.id)) { this.ws.offGlobal(handler); return; }
      if (msg.type === 'created' && msg.reqId === reqId) {
        // Set openSpec now that we have the server session ID (for cross-client sync)
        winInfo._openSpec = {
          action: 'attachSession',
          serverId: msg.sessionId,
          backend,
          backendSessionId: backendSessionId || resumeId || null,
          sessionKey,
          agentKind: agentKind || 'primary',
          agentRole: agentRole || '',
          agentNickname: agentNickname || '',
          sourceKind: sourceKind || '',
          parentThreadId: parentThreadId || null,
          name: sessionName,
          cwd: msg.cwd || cwd || '',
          mode: sessionMode,
        };
        this.layoutManager.scheduleAutoSave(); // re-broadcast with openSpec
        // Persist a fork's chosen title as a custom name once the fork's NEW
        // backend id is adopted (after its first turn). Keyed by webui id; the
        // parent id is remembered so we don't rename the parent before divergence.
        if (forkTitle && resumeId) {
          (this._pendingForkTitles ??= new Map()).set(msg.sessionId, { name: forkTitle, parentId: backendSessionId || resumeId });
        }
        // Session created "in" a task — bind once the backend session id shows
        // up in active-sessions (unknown at creation for claude; folder
        // auto-include already covers tasks with linked folders, this makes
        // the explicit tag stick for folder-less tasks too).
        if (taskId) this.sidebar?._registerPendingTaskBind?.(msg.sessionId, taskId);
        if (msg.mode === 'chat' || sessionMode === 'chat') {
          const chatView = new ChatView(winInfo, this.ws, msg.sessionId, this);
          this.sessions.set(winInfo.id, chatView);
          // Commanded-at-spawn effort (the CLI never reports effort back, so
          // the commanded value is the display source — same as the server's
          // attach-time merge)
          if (sessionEffort) chatView.applyStatus({ effort: sessionEffort });
          winInfo.onClose = () => {
            const shouldKill = (this.settings.get('window.closeBehavior') ?? 'terminate') === 'terminate';
            if (shouldKill) this.ws.send({ type: 'kill', sessionId: msg.sessionId });
            chatView.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome();
          };
          winInfo._notifyChanged = () => this.updateTaskbar();
          // Load JSONL history for resumed sessions (truncated at the fork
          // point when forking from a specific message, so the displayed history
          // matches the fork's actual --resume-session-at boundary).
          if (resumeId) {
            fetch(`/api/session-messages?backend=${encodeURIComponent(backend)}&backendSessionId=${encodeURIComponent(backendSessionId || resumeId)}&cwd=${encodeURIComponent(cwd||'')}&withStatus=1${forkAtUuid ? `&untilUuid=${encodeURIComponent(forkAtUuid)}` : ''}`)
              .then(r => r.json())
              .then(data => {
                if (data.messages?.length) chatView.loadHistory(data.messages, data.total);
                if (data.chatStatus) chatView.applyStatus(data.chatStatus);
              })
              .catch(() => {})
              // Send the fork's first message AFTER history renders, so the
              // echoed user message appends instead of being wiped by loadHistory.
              // This first turn is also what makes the fork diverge (claude mints
              // the fork's new id on first input).
              .finally(() => { if (initialMessage) this._sendChatMessage(msg.sessionId, initialMessage); });
          } else if (initialMessage) {
            this._sendChatMessage(msg.sessionId, initialMessage);
          }
          chatView.focus();
        } else {
          const term = new TerminalSession(winInfo, this.ws, msg.sessionId, this.themeManager, (filePath, signalPath) => {
            this._openExternalEditor(filePath, signalPath);
          }, {}, this.settings);
          this.sessions.set(winInfo.id, term);
          // Automation-command terminals (Log in / Update helpers) are
          // throwaway — closing the window should terminate them directly,
          // never leave a detached login shell lingering, regardless of the
          // global close-behavior setting.
          this._wireTerminalWindow(winInfo, term, msg.sessionId, { ephemeral: !!initialCommand });
          // Type a starter command for the user (shell terminals: login helpers
          // etc.) once the shell has had a beat to print its prompt
          if (initialCommand) {
            setTimeout(() => this.ws.send({ type: 'input', sessionId: msg.sessionId, data: initialCommand + '\r' }), 1200);
          }
          term.focus();
        }
        this.wm.setTitle(winInfo.id, `${sessionName} — ${msg.cwd||cwd||'~'}`);
        this.ws.offGlobal(handler);
      }
    };
    this.ws.onGlobal(handler);
  }

  _wireTerminalWindow(winInfo, term, sessionId, { killOnClose = true, ephemeral = false } = {}) {
    winInfo._ephemeral = ephemeral;
    winInfo.onClose = () => {
      // ephemeral (automation helper) terminals always terminate on close;
      // otherwise honor the global close-behavior (terminate vs detach)
      const shouldKill = ephemeral || (killOnClose && (this.settings.get('window.closeBehavior') ?? 'terminate') === 'terminate');
      if (shouldKill) this.ws.send({ type: 'kill', sessionId });
      term.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome();
    };
    winInfo._notifyChanged = () => this.updateTaskbar();
  }

  killSession(webuiId) {
    this.ws.send({ type: 'kill', sessionId: webuiId });
  }

  async killPid(pid) {
    await fetch('/api/kill-pid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid }) });
  }

  // Find existing window for a server session ID and focus it
  _focusExistingSession(serverId) {
    for (const [winId, term] of this.sessions) {
      if (term.sessionId === serverId) {
        this.wm.focusWindow(winId);
        if (this.wm.windows.get(winId)?.isMinimized) this.wm.restore(winId);
        term.focus();
        return true;
      }
    }
    return false;
  }

  _closeSidebarOnMobile() {
    if (window.innerWidth <= 768 && this.sidebar.isOpen) this.sidebar.toggle(false);
  }

  attachSession(serverId, name, cwd, { mode, syncId, backend = 'claude', backendSessionId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId } = {}) {
    this._closeSidebarOnMobile();
    // If we already have a window for this session, just focus it
    if (this._focusExistingSession(serverId)) return null;

    this._hideWelcome();
    const isChat = mode === 'chat';
    const openSpec = {
      action: 'attachSession',
      serverId,
      name,
      cwd,
      mode,
      backend,
      backendSessionId: backendSessionId || null,
      sessionKey: backendSessionId ? `${backend}:${backendSessionId}` : '',
      agentKind: agentKind || 'primary',
      agentRole: agentRole || '',
      agentNickname: agentNickname || '',
      sourceKind: sourceKind || '',
      parentThreadId: parentThreadId || null,
    };
    const winInfo = this.wm.createWindow({
      title: `${name} — ${cwd}`,
      type: isChat ? 'chat' : 'terminal',
      syncId,
      openSpec,
      titleMeta: this._buildTitleMeta(openSpec),
    });

    this.ws.send({ type: 'attach', sessionId: serverId });

    const handler = (msg) => {
      // Window closed before the server answered (esp. slow huge-JSONL attaches):
      // drop the handler so it can't build a ChatView into a dead winInfo and
      // leave a phantom sessions entry that makes the session un-reopenable.
      if (!this.wm.windows.has(winInfo.id)) { this.ws.offGlobal(handler); return; }
      if ((msg.type === 'error') && msg.sessionId === serverId) { this.ws.offGlobal(handler); return; }
      if (msg.type === 'attached' && msg.sessionId === serverId) {
        if (msg.mode === 'chat' || isChat) {
          const chatView = new ChatView(winInfo, this.ws, serverId, this);
          this.sessions.set(winInfo.id, chatView);
          if (msg.messages?.length) {
            chatView.loadHistory(msg.messages, msg.totalCount, msg.isStreaming, { chatStatus: msg.chatStatus, taskState: msg.taskState, turnMap: msg.turnMap, pendingPermissions: msg.pendingPermissions, streamingLabel: msg.streamingLabel, goal: msg.goal, goalElapsed: msg.goalElapsed, goalStatus: msg.goalStatus, normEpoch: msg.normEpoch });
          }
          if (msg.viewOnly) chatView._setReadOnly();
          winInfo.onClose = () => {
            const shouldKill = !msg.viewOnly && (this.settings.get('window.closeBehavior') ?? 'terminate') === 'terminate';
            if (shouldKill) this.ws.send({ type: 'kill', sessionId: serverId });
            chatView.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome();
          };
          winInfo._notifyChanged = () => this.updateTaskbar();
          chatView.focus();
        } else {
          // Terminal mode (existing)
          const term = new TerminalSession(winInfo, this.ws, serverId, this.themeManager, (fp, sp) => this._openExternalEditor(fp, sp), {}, this.settings);
          this.sessions.set(winInfo.id, term);
          if (msg.buffer) {
            const buf = msg.buffer;
            term._suppressWaiting = true;
            setTimeout(() => { term.terminal.write(buf, () => { term._suppressWaiting = false; term.terminal.scrollToBottom(); term.fit(); }); }, 300);
          }
          this._wireTerminalWindow(winInfo, term, serverId);
          term.focus();
        }
        this.ws.offGlobal(handler);
      }
    };
    this.ws.onGlobal(handler);
    return winInfo;
  }

  attachTmuxSession(tmuxTarget, name, cwd) {
    this._closeSidebarOnMobile();
    // Check if already viewing this tmux target
    for (const [winId, term] of this.sessions) {
      if (term._tmuxTarget === tmuxTarget) {
        this.wm.focusWindow(winId);
        if (this.wm.windows.get(winId)?.isMinimized) this.wm.restore(winId);
        term.focus(); return;
      }
    }

    this._hideWelcome();
    // openSpec from creation: without it, another client's layout-sync diff
    // sees an unknown window and closes it (tmux views were killed on the
    // first remote broadcast)
    const winInfo = this.wm.createWindow({ title: `[tmux] ${name}`, type: 'terminal', openSpec: { action: 'attachTmuxSession', tmuxTarget, name, cwd } });
    const reqId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    this.ws.send({ type: 'tmux-attach', tmuxTarget, name, cwd, cols: 120, rows: 30, reqId });

    const handler = (msg) => {
      if (!this.wm.windows.has(winInfo.id)) { this.ws.offGlobal(handler); return; }
      if (msg.type === 'created' && msg.isTmuxView && msg.reqId === reqId) {
        const term = new TerminalSession(winInfo, this.ws, msg.sessionId, this.themeManager, null, {}, this.settings);
        term._tmuxTarget = tmuxTarget;
        this.sessions.set(winInfo.id, term);
        // Closing window only detaches the tmux view — does NOT kill the session
        this._wireTerminalWindow(winInfo, term, msg.sessionId, { killOnClose: false });
        term.focus();
        this.ws.offGlobal(handler);
      }
    };
    this.ws.onGlobal(handler);
  }

  resumeSession(sessionId, cwd, sessionName, { mode, model, effort, permission, accountId, syncId, backend = 'claude', backendSessionId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId, hostId } = {}) {
    this._closeSidebarOnMobile();
    const targetBackendId = backendSessionId || sessionId;
    // If this session is already open in a LIVE window, focus it
    for (const [winId, term] of this.sessions) {
      if (term.sessionId) {
        const sidebar = this.sidebar;
        const match = (sidebar._allSessions || []).find(s => (s.backendSessionId || s.sessionId) === targetBackendId && (s.backend || 'claude') === backend && s.webuiId);
        if (match && term.sessionId === match.webuiId) {
          this._focusExistingSession(match.webuiId);
          return;
        }
      }
    }
    // Close any TERMINATED/read-only windows for the same backend session
    // (otherwise we'd end up with two windows pointing at the same conversation)
    for (const [winId, term] of [...this.sessions]) {
      const win = this.wm.windows.get(winId);
      const spec = win?._openSpec;
      if (spec?.backend === backend && spec?.backendSessionId === targetBackendId) {
        this.wm.closeWindow(winId);
      }
    }

    const sessionMode = mode || (this.settings.get('session.defaultMode') ?? 'chat');
    // Apply persisted per-session config (gear popover) for any param the caller
    // didn't specify — covers card click, resume-all, chat resume bar, etc.
    const savedCfg = this.sidebar?.getSessionConfig?.({ backend, sessionId, backendSessionId: targetBackendId }) || {};
    // Context task rides across resumes: the first task this session is
    // explicitly tagged with becomes VIBESPACE_TASK_ID again, so the
    // SessionStart hook re-injects task context on every resume.
    const contextTask = this.sidebar?._getSessionTasks?.({ backend, backendSessionId: targetBackendId })?.[0];
    this.createSession({
      cwd,
      name: sessionName,
      resumeId: sessionId,
      mode: sessionMode,
      model: model !== undefined ? model : savedCfg.model,
      permission: permission !== undefined ? permission : savedCfg.permission,
      effort: effort !== undefined ? effort : savedCfg.effort,
      accountId: accountId !== undefined ? accountId : savedCfg.account,
      syncId,
      backend,
      backendSessionId: backendSessionId || sessionId,
      hostId, // remote session resumes ON its host
      agentKind,
      agentRole,
      agentNickname,
      sourceKind,
      parentThreadId,
      taskId: contextTask?.id,
    });
  }

  // Clicking Fork opens a popup for the first message. The fork only diverges
  // into its own session once that message is sent (the backend mints the
  // fork's new id on first input), so prompting up front gives the user an
  // immediately-distinct session instead of a window indistinguishable from a
  // resume. Terminal-mode forks have no chat input, so they fork directly.
  forkSession(sessionInfo) {
    const mode = sessionInfo.webuiMode || this.settings.get('session.defaultMode') || 'chat';
    if (mode !== 'chat') { this._doForkSession(sessionInfo, ''); return; }
    this._openForkDialog(sessionInfo, null);
  }

  // Fork from a specific assistant message (chat fork button). Passes the
  // message uuid as the truncation point (--resume-session-at) so the branch
  // contains the conversation only up to that message.
  forkFromMessage(sessionInfo, messageUuid) {
    this._openForkDialog(sessionInfo, messageUuid || null);
  }

  _openForkDialog(sessionInfo, forkAtUuid) {
    this._pendingFork = sessionInfo;
    this._pendingForkAt = forkAtUuid;
    if (this.isMobile) this.sidebar.toggle(false);
    this._showDialog('dialog-fork');
    // Swap the hint depending on whole-session vs from-a-point fork
    const genHint = document.getElementById('fork-hint-general');
    const atHint = document.getElementById('fork-hint-at');
    if (genHint) genHint.classList.toggle('hidden', !!forkAtUuid);
    if (atHint) atHint.classList.toggle('hidden', !forkAtUuid);
    const titleInput = document.getElementById('fork-title');
    if (titleInput) titleInput.value = this._defaultForkName(sessionInfo); // editable default
    const ta = document.getElementById('fork-first-message');
    const btn = document.getElementById('btn-fork-send');
    if (ta) { ta.value = ''; }
    if (btn) { btn.disabled = true; }
    if (ta) setTimeout(() => ta.focus(), 0);
  }

  // Programmatically send a chat message to a live chat session (used for the
  // fork first-message popup). The server echoes it back via the normalizer, so
  // the ChatView renders it without any local preview.
  _sendChatMessage(sessionId, text) {
    const t = (text || '').trim();
    if (!t) return;
    this.ws.send({ type: 'chat-input', sessionId, text: t, msgId: Date.now() + '-' + Math.random().toString(36).slice(2, 8) });
  }

  // Default fork title: "<base> (forked)" with a numeric suffix to stay unique.
  _defaultForkName(sessionInfo) {
    const baseName = sessionInfo.webuiName || sessionInfo.name || 'Session';
    const allNames = (this.sidebar._allSessions || []).map(s => s.webuiName || s.name || '');
    let forkName = `${baseName} (forked)`;
    let n = 2;
    while (allNames.includes(forkName)) { forkName = `${baseName} (forked ${n++})`; }
    return forkName;
  }

  _doForkSession(sessionInfo, initialMessage = '', resumeAt = null, customName = '') {
    const backend = sessionInfo.backend || 'claude';
    const resumeId = sessionInfo.backendSessionId || sessionInfo.sessionId;
    const forkName = (customName && customName.trim()) || this._defaultForkName(sessionInfo);

    const mode = sessionInfo.webuiMode || this.settings.get('session.defaultMode') || 'chat';
    // --resume-session-at <uuid> truncates the fork to up-to-and-including that
    // assistant message (claude-only). uuid has no spaces, so it tokenizes
    // cleanly inside the extraArgs string.
    const forkArgs = backend === 'claude'
      ? ('--fork-session' + (resumeAt ? ` --resume-session-at ${resumeAt}` : ''))
      : '';
    this.createSession({
      cwd: sessionInfo.cwd,
      name: forkName,
      resumeId,
      mode,
      backend,
      backendSessionId: resumeId,
      fork: true,
      extraArgs: forkArgs,
      initialMessage,
      forkAtUuid: resumeAt || undefined,
      forkTitle: forkName,
    });
  }

  // Open a stopped session as view-only (load JSONL, no claude --resume)
  viewSession(sessionId, cwd, sessionName, { syncId, backend = 'claude', backendSessionId, agentKind, agentRole, agentNickname, sourceKind, parentThreadId, hostId } = {}) {
    this._closeSidebarOnMobile();
    this._hideWelcome();
    const resolvedSessionId = backendSessionId || sessionId;
    const viewId = backend === 'claude' ? `view-${resolvedSessionId}` : `view-${backend}-${resolvedSessionId}`;
    const openSpec = {
      action: 'viewSession',
      sessionId,
      backend,
      backendSessionId: resolvedSessionId,
      sessionKey: `${backend}:${resolvedSessionId}`,
      agentKind: agentKind || 'primary',
      agentRole: agentRole || '',
      agentNickname: agentNickname || '',
      sourceKind: sourceKind || '',
      parentThreadId: parentThreadId || null,
      hostId: hostId || undefined,
      cwd,
      name: sessionName,
    };
    const winInfo = this.wm.createWindow({
      title: `${sessionName || t('History')} — ${cwd}`,
      type: 'chat',
      syncId,
      openSpec,
      titleMeta: this._buildTitleMeta(openSpec),
    });
    const chatView = new ChatView(winInfo, this.ws, viewId, this, { readOnly: true });
    this.sessions.set(winInfo.id, chatView);

    // Request view-only attach — server loads JSONL without spawning claude
    this.ws.send({
      type: 'attach',
      sessionId: viewId,
      viewOnly: true,
      backend,
      backendSessionId: resolvedSessionId,
      claudeSessionId: backend === 'claude' ? resolvedSessionId : undefined,
      host: hostId || undefined, // remote session: server pulls the transcript over ssh first
      cwd,
      name: sessionName,
    });

    const handler = (msg) => {
      // Window closed (or the server replied error) before 'attached' — drop the
      // handler so a stale fire can't call loadHistory on a disposed ChatView
      // (which throws mid-dispatch and swallows every later handler's message).
      if (!this.wm.windows.has(winInfo.id)) { this.ws.offGlobal(handler); return; }
      if (msg.type === 'error' && msg.sessionId === viewId) { this.ws.offGlobal(handler); return; }
      if (msg.type === 'attached' && msg.sessionId === viewId) {
        this.ws.offGlobal(handler);
        if (msg.messages?.length) {
          chatView.loadHistory(msg.messages, msg.totalCount, false, { chatStatus: msg.chatStatus });
        }
      }
    };
    this.ws.onGlobal(handler);
    winInfo.onClose = () => { this.ws.offGlobal(handler); chatView.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome(); };
    winInfo._notifyChanged = () => this.updateTaskbar();
    return winInfo;
  }

  // Replay a serialized openSpec to recreate a window (for cross-client sync)
  replayOpenSpec(spec, syncId) {
    switch (spec.action) {
      case 'attachSession': {
        // The saved serverId/name may be STALE — the dtach instance dies and
        // gets resumed under a new server id while the spec persists in the
        // autosave (and the name was captured at window creation, before any
        // rename). Re-resolve against the live session list like restoreState
        // does; a spec replayed verbatim attaches to a nonexistent session and
        // leaves a blank window that re-persists the stale spec forever.
        const backend = spec.backend || 'claude';
        const bsid = spec.backendSessionId || null;
        const live = this.sidebar?._webuiSessions || [];
        let serverId = spec.serverId;
        let name = spec.name;
        let cwd = spec.cwd;
        if (bsid && !live.some(s => s.id === serverId)) {
          const alive = live.find(s => (s.backend || 'claude') === backend
            && (s.backendSessionId || s.claudeSessionId) === bsid);
          if (alive) {
            serverId = alive.id;
            name = alive.name || name;
            cwd = alive.cwd || cwd;
          } else if (live.length) {
            // Session is dead — open read-only history with a Resume bar
            // instead of a blank window stuck on a failed attach
            this.viewSession(bsid, cwd, this.sidebar?.getCustomName(spec.sessionKey || bsid) || name, {
              syncId, backend, backendSessionId: bsid,
              agentKind: spec.agentKind, agentRole: spec.agentRole,
              agentNickname: spec.agentNickname, sourceKind: spec.sourceKind,
              parentThreadId: spec.parentThreadId,
            });
            break;
          }
        }
        if (bsid) name = this.sidebar?.getCustomName(spec.sessionKey || bsid) || name;
        this.attachSession(serverId, name, cwd, {
          mode: spec.mode,
          syncId,
          backend,
          backendSessionId: bsid,
          agentKind: spec.agentKind,
          agentRole: spec.agentRole,
          agentNickname: spec.agentNickname,
          sourceKind: spec.sourceKind,
          parentThreadId: spec.parentThreadId,
        });
        break;
      }
      case 'openFileExplorer':
        this.openFileExplorer(spec.path, { syncId, host: spec.host });
        break;
      case 'openFile':
        this.openFile(spec.path, spec.name, { syncId });
        break;
      case 'openEditor':
        this.openEditor(spec.path, spec.name, { syncId });
        break;
      case 'openBrowser':
        this.openBrowser(spec.url, { syncId });
        break;
      case 'openTaskDetail':
        this.openTaskDetail(spec.taskId, { syncId });
        break;
      case 'openSessionProps':
        this.openSessionProps(spec.sessionKey, { syncId });
        break;
      case 'openWorkflowDetail':
        this.openWorkflowDetail(spec.runId, { syncId, claudeSessionId: spec.claudeSessionId, cwd: spec.cwd, name: spec.name });
        break;
      case 'attachTmuxSession':
        this.attachTmuxSession(spec.tmuxTarget, spec.name, spec.cwd);
        break;
      case 'viewSession':
        this.viewSession(spec.sessionId, spec.cwd, spec.name, {
          hostId: spec.hostId,
          syncId,
          backend: spec.backend || 'claude',
          backendSessionId: spec.backendSessionId || spec.sessionId,
          agentKind: spec.agentKind,
          agentRole: spec.agentRole,
          agentNickname: spec.agentNickname,
          sourceKind: spec.sourceKind,
          parentThreadId: spec.parentThreadId,
        });
        break;
      case 'viewSubagent': {
        const title = t('Agent: {desc}', { desc: spec.description || t('Subagent') });
        const winInfo = this.wm.createWindow({
          title,
          type: 'chat',
          syncId,
          openSpec: spec,
          titleMeta: this._buildTitleMeta({
            backend: spec.backend || 'claude',
            agentKind: spec.agentKind || 'subagent',
            agentRole: spec.agentRole,
            agentNickname: spec.agentNickname,
            sourceKind: spec.sourceKind,
            parentThreadId: spec.parentThreadId,
          }),
        });
        const view = new ChatView(winInfo, this.ws, spec.virtualId, this, { readOnly: true });
        this.sessions.set(winInfo.id, view);
        this.ws.send({
          type: 'attach',
          sessionId: spec.virtualId,
          parentSessionId: spec.parentSessionId,
          backend: spec.backend || 'claude',
          backendSessionId: spec.backendSessionId || spec.claudeSessionId,
          claudeSessionId: spec.claudeSessionId,
          cwd: spec.cwd,
        });
        const handler = (msg) => {
          if (!this.wm.windows.has(winInfo.id)) { this.ws.offGlobal(handler); return; }
          if (msg.type === 'error' && msg.sessionId === spec.virtualId) { this.ws.offGlobal(handler); return; }
          if (msg.type === 'attached' && msg.sessionId === spec.virtualId) {
            this.ws.offGlobal(handler);
            if (msg.messages?.length) view.loadHistory(msg.messages, msg.totalCount, msg.isStreaming);
          }
        };
        this.ws.onGlobal(handler);
        winInfo.onClose = () => { this.ws.offGlobal(handler); view.dispose(); this.sessions.delete(winInfo.id); this._checkWelcome(); };
        break;
      }
    }
  }

  openFileExplorer(startPath, { syncId, host } = {}) {
    this._hideWelcome();
    const openSpec = { action: 'openFileExplorer', path: startPath, host: host || undefined };
    const winInfo = this.wm.createWindow({ title: t('File Explorer'), type: 'files', syncId, openSpec });
    if (host) winInfo._explorerHost = host; // read by FileExplorer constructor
    const explorer = new FileExplorer(winInfo, this, startPath);
    winInfo._explorer = explorer;
    winInfo.onClose = () => this._checkWelcome();
    return winInfo;
  }

  openBrowser(url, opts) { return openBrowserFn(this, url, opts); }

  openTaskDetail(taskId, opts) { return openTaskDetailFn(this, taskId, opts); }

  openSessionProps(sessionRef, opts) { return openSessionPropsFn(this, sessionRef, opts); }

  // Anthropic accounts (billing identity). Full snapshot incl. subscription
  // login state + importable CLI key; the accounts-updated broadcast keeps the
  // list fresh between refreshes.
  refreshAccounts() {
    return fetchJson('/api/accounts').then(d => {
      if (d) this._accounts = { accounts: d.accounts || [], defaultAccountId: d.defaultAccountId || null, subscription: d.subscription || {}, cliKey: d.cliKey || {} };
      return this._accounts;
    }).catch(() => this._accounts);
  }

  openWorkflowDetail(runId, opts) { return openWorkflowDetailFn(this, runId, opts); }

  // Session state keys (backend:backendSessionId) of every window currently
  // blinking "waiting for input" — the idle-detection signal the task board
  // aggregates into per-task attention (design §7: observe, never act).
  getWaitingSessionKeys() {
    const keys = new Set();
    for (const winInfo of this.wm.windows.values()) {
      if (!winInfo.element?.classList?.contains('window-waiting')) continue;
      const spec = winInfo._openSpec;
      let backend = spec?.backend || 'claude';
      let bsid = spec?.backendSessionId || null;
      if (!bsid && spec?.serverId) {
        const live = (this.sidebar?._webuiSessions || []).find(s => s.id === spec.serverId);
        if (live) { backend = live.backend || backend; bsid = live.backendSessionId || live.claudeSessionId || null; }
      }
      if (bsid) keys.add(`${backend}:${bsid}`);
    }
    return keys;
  }

  openFile(filePath, fileName, opts) {
    FileViewer.open(this, filePath, fileName, opts);
  }

  openEditor(filePath, fileName, opts = {}) {
    this._hideWelcome();
    // Front-truncate the path (like the file explorer) so the taskbar/title-bar
    // CSS end-ellipsis keeps the filename visible instead of cutting it off.
    const title = opts._tempFile ? t('View: {name}', { name: fileName }) : frontTruncate(filePath);
    const openSpec = opts._tempFile ? undefined : { action: 'openEditor', path: filePath, name: fileName };
    const winInfo = this.wm.createWindow({ title, type: 'editor', syncId: opts.syncId, openSpec });
    winInfo._filePath = filePath; winInfo._fileName = fileName;
    new CodeEditor(winInfo, filePath, fileName, this, opts);
    winInfo.onClose = () => {
      if (opts._onCloseDelete) opts._onCloseDelete();
      this._checkWelcome();
    };
    return winInfo;
  }

  // Delegate to extracted external-editor.js module
  _openExternalEditor(filePath, signalPath, sessionId) { openExternalEditor(this, filePath, signalPath, sessionId); }
  _closeExternalEditor(signalPath) { closeExternalEditor(this, signalPath); }

  _hideWelcome() { document.getElementById('welcome').classList.add('hidden'); }
  _checkWelcome() {
    const activeDesk = this.desktopManager?.activeDesktopId;
    let hasWindows = false;
    if (activeDesk) {
      for (const [, win] of this.wm.windows) {
        if (win._desktopId === activeDesk && !win._hiddenByDesktop) { hasWindows = true; break; }
      }
    } else {
      hasWindows = this.wm.windows.size > 0;
    }
    if (!hasWindows) document.getElementById('welcome').classList.remove('hidden');
    else document.getElementById('welcome').classList.add('hidden');
  }

  // Switch to the window's desktop and flash it
  // Start Move mode on a session's window from the sidebar — the recovery
  // path when a window was dragged off-screen and can't be grabbed anymore.
  // Resolves tab groups to the host and switches to the window's desktop first.
  moveSessionWindow(serverSessionId) {
    for (const [winId, term] of this.sessions) {
      if (term.sessionId !== serverSessionId) continue;
      const win = this.wm.windows.get(winId);
      if (!win) break;
      let targetId = winId, targetWin = win;
      if (win._tabChain && win._tabChain.tabs[0] !== winId) {
        const hostId = win._tabChain.tabs[0];
        const host = this.wm.windows.get(hostId);
        if (host) {
          targetId = hostId; targetWin = host;
          const tabIdx = win._tabChain.tabs.indexOf(winId);
          if (tabIdx >= 0) this.wm.switchTab(win._tabChain, tabIdx);
        }
      }
      const dm = this.desktopManager;
      const start = () => this.wm.startMoveMode(targetId);
      if (dm && targetWin._desktopId && targetWin._desktopId !== dm.activeDesktopId) {
        dm.switchTo(targetWin._desktopId).then(start);
      } else {
        start();
      }
      break;
    }
  }

  goToWindow(serverSessionId) {
    for (const [winId, term] of this.sessions) {
      if (term.sessionId === serverSessionId) {
        const win = this.wm.windows.get(winId);
        if (!win) break;

        // Resolve tab group: find host and switch to target tab
        let targetWin = win, targetId = winId;
        if (win._tabChain && win._tabChain.tabs[0] !== winId) {
          const hostId = win._tabChain.tabs[0];
          const host = this.wm.windows.get(hostId);
          if (host) {
            targetWin = host; targetId = hostId;
            const tabIdx = win._tabChain.tabs.indexOf(winId);
            if (tabIdx >= 0) this.wm.switchTab(win._tabChain, tabIdx);
          }
        }

        const dm = this.desktopManager;
        const doFlash = () => {
          if (targetWin.isMinimized) this.wm.restore(targetId);
          this.wm.focusWindow(targetId);
          targetWin.element.classList.add('window-find-flash');
          setTimeout(() => targetWin.element.classList.remove('window-find-flash'), 3000);
        };
        if (dm && targetWin._desktopId && targetWin._desktopId !== dm.activeDesktopId) {
          dm.switchTo(targetWin._desktopId).then(doFlash);
        } else {
          doFlash();
        }
        const session = this.sessions.get(winId);
        if (session) session.focus?.();
        break;
      }
    }
  }

  // Flash a window's title bar + taskbar item to help user find it
  flashWindow(serverSessionId) {
    for (const [winId, term] of this.sessions) {
      if (term.sessionId === serverSessionId) {
        const win = this.wm.windows.get(winId);
        if (!win) break;

        const dm = this.desktopManager;

        // Resolve the visible window: if in a tab group, find the host and switch to this tab
        let flashWin = win;
        let flashWinId = winId;
        if (win._tabChain && win._tabChain.tabs[0] !== winId) {
          const hostId = win._tabChain.tabs[0];
          const host = this.wm.windows.get(hostId);
          if (host) {
            flashWin = host;
            flashWinId = hostId;
            // Switch to the target tab
            const tabIdx = win._tabChain.tabs.indexOf(winId);
            if (tabIdx >= 0) this.wm.switchTab(win._tabChain, tabIdx);
          }
        }

        // If window is on another desktop, flash its rect in the desktop preview
        if (dm && flashWin._desktopId && flashWin._desktopId !== dm.activeDesktopId) {
          dm._flashingWinId = flashWinId;
          dm._renderSwitcher();
          setTimeout(() => { dm._flashingWinId = null; dm._renderSwitcher(); }, 3000);
          break;
        }

        flashWin.element.classList.add('window-find-flash');
        // Match by winId — index-based mapping diverged from taskbar order as
        // soon as tab groups or a second desktop existed (taskbar skips those)
        const taskbarItem = document.querySelector(`.taskbar-item[data-win-id="${CSS.escape(flashWinId)}"]`);
        if (taskbarItem) taskbarItem.classList.add('find-flash');
        // Also flash in desktop preview
        if (dm) {
          dm._flashingWinId = flashWinId;
          dm._renderSwitcher();
        }
        if (flashWin.isMinimized) this.wm.restore(flashWinId);
        this.wm.focusWindow(flashWinId);
        setTimeout(() => {
          flashWin.element.classList.remove('window-find-flash');
          if (taskbarItem) taskbarItem.classList.remove('find-flash');
          if (dm) { dm._flashingWinId = null; dm._renderSwitcher(); }
        }, 3000);
        break;
      }
    }
  }

  renameBackendSession(sessionRef, newName) {
    if (!sessionRef || typeof sessionRef !== 'object') return;
    this.ws.send({
      type: 'rename-session',
      webuiId: sessionRef.webuiId || undefined,
      sessionKey: getSessionKey(sessionRef) || undefined,
      backendSessionId: sessionRef.backendSessionId || sessionRef.sessionId || undefined,
      name: newName || '',
    });
  }

  syncSessionName(sessionRef, newName) {
    const targetKey = (sessionRef && typeof sessionRef === 'object')
      ? getSessionKey(sessionRef)
      : (typeof sessionRef === 'string' && sessionRef.includes(':') ? sessionRef : '');
    for (const [winId, term] of this.sessions) {
      if (!term.sessionId) continue;
      const allSess = this.sidebar?._allSessions || [];
      const match = allSess.find((s) => {
        if (s.webuiId !== term.sessionId) return false;
        if (targetKey) return getSessionKey(s) === targetKey;
        if (typeof sessionRef === 'string') return s.sessionId === sessionRef || s.backendSessionId === sessionRef;
        return false;
      });
      if (match) {
        const cwd = match.cwd || '';
        this.wm.setTitle(winId, `${newName} — ${cwd}`);
        break;
      }
    }
  }

  syncSessionIdentity(allSessions = []) {
    for (const [winId, session] of this.sessions) {
      const win = this.wm.windows.get(winId);
      if (!win) continue;
      const spec = win._openSpec || {};
      const match = allSessions.find((entry) => {
        if (entry.webuiId && session.sessionId === entry.webuiId) return true;
        const entryKey = entry.sessionKey || `${entry.backend || 'claude'}:${entry.backendSessionId || entry.sessionId}`;
        const specKey = spec.sessionKey || `${spec.backend || win.titleMeta?.backend || 'claude'}:${spec.backendSessionId || spec.sessionId || ''}`;
        return !!(spec.sessionKey || spec.backendSessionId || spec.sessionId) && entryKey === specKey;
      });
      if (!match) continue;
      // Persist a fork's chosen title as a custom name once its NEW backend id
      // is adopted (after the first turn) — before that, match.backendSessionId
      // is still the parent's, and renaming then would clobber the parent.
      const pendingFork = this._pendingForkTitles?.get(session.sessionId);
      if (pendingFork && match.backendSessionId && match.backendSessionId !== pendingFork.parentId) {
        this.sidebar.setCustomName?.(match.sessionKey || getSessionKey(match), pendingFork.name);
        this._pendingForkTitles.delete(session.sessionId);
      }
      this.wm.setTitleMeta(winId, this._buildTitleMeta(match));
      this.wm.setAuthBadge?.(winId, match.auth || null); // billing key in the title bar
      if (win._openSpec) {
        Object.assign(win._openSpec, {
          backend: match.backend || win._openSpec.backend || 'claude',
          backendSessionId: match.backendSessionId || match.sessionId,
          sessionKey: match.sessionKey || getSessionKey(match),
          name: match.name || win._openSpec.name || '',
          agentKind: match.agentKind || 'primary',
          agentRole: match.agentRole || '',
          agentNickname: match.agentNickname || '',
          sourceKind: match.sourceKind || '',
          parentThreadId: match.parentThreadId || null,
        });
      }
      if (win._openSpec?.action === 'viewSession' || win._openSpec?.action === 'attachSession') {
        const displayName = this.sidebar.getCustomName?.(match) || match.webuiName || match.name || win._openSpec?.name || win.title || t('Session');
        const cwd = match.cwd || win._openSpec?.cwd || '';
        this.wm.setTitle(winId, cwd ? `${displayName} — ${cwd}` : displayName);
      }
    }
  }

  _notifySidebarFocus() {
    // Find the claude session ID for the currently focused terminal window
    const activeWinId = this.wm.activeWindowId;
    const term = this.sessions.get(activeWinId);
    if (term && term.sessionId) {
      const allSess = this.sidebar?._allSessions || [];
      const match = allSess.find(s => s.webuiId === term.sessionId);
      if (match) {
        this.sidebar.highlightSession(match.sessionId);
        return;
      }
    }
    // No terminal focused — clear highlight
    this.sidebar.highlightSession(null);
  }

  updateTaskbar() {
    updateTaskbarFn(this);
    if (this.desktopManager) this.desktopManager._renderSwitcher();
    // Task attention rides the same signal: every waiting-blink toggle and
    // window open/close funnels through here (winInfo._notifyChanged), so the
    // board's ⚠ badges stay live without their own event plumbing. Debounced —
    // updateTaskbar fires in bursts during layout changes.
    clearTimeout(this._taskAttnTimer);
    this._taskAttnTimer = setTimeout(() => this.sidebar?.refreshTaskAttention?.(), 250);
  }

  _populateThemeSelect(sel) {
    sel.innerHTML = '';
    const opt = (v, l) => { const o = document.createElement('option'); o.value = v; o.textContent = l; return o; };
    for (const name of BUILTIN_THEMES) sel.appendChild(opt(name, name.charAt(0).toUpperCase() + name.slice(1)));
    const customKeys = this.themeManager.getThemeNames().filter(n => n.startsWith('custom-'));
    if (customKeys.length) {
      const sep = document.createElement('option'); sep.disabled = true; sep.textContent = '── Custom ──'; sel.appendChild(sep);
      for (const key of customKeys) sel.appendChild(opt(key, key.slice(7)));
    }
  }

  _refreshThemeDropdown() {
    const sel = document.getElementById('global-theme-select');
    if (sel) { this._populateThemeSelect(sel); sel.value = this.themeManager.current; }
  }

  async _loadCustomThemes() {
    const themes = await fetchJson('/api/custom-themes');
    if (!themes) return;
    this._applyCustomThemesFromServer(themes);
    this.themeManager.applyPendingTheme();
  }

  _applyCustomThemesFromServer(themes) {
    // Unregister deleted themes
    for (const key of this.themeManager.getThemeNames().filter(n => n.startsWith('custom-'))) {
      const name = key.slice(7);
      if (!themes[name]) this.themeManager.unregisterCustomTheme(name);
    }
    // Register/update
    for (const [name, data] of Object.entries(themes)) {
      this.themeManager.registerCustomTheme(name, data.css, data.terminal);
    }
    this._refreshThemeDropdown();
    // Update terminal themes
    for (const [, session] of this.sessions) {
      if (session.updateTheme) session.updateTheme(this.themeManager.getTerminalTheme());
    }
  }
}

export { App };

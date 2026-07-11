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
import { anchorFixedPopup, createPopover, createModalShell, fetchJson, initStateSync, installLongPressContextMenu, frontTruncate, escHtml, showContextMenu, showToast, showConfirmDialog, showInputDialog } from './utils.js';
import { t, tc, getLangPref, setLang } from './i18n.js';
import { installManageAgents } from './manage-agents.js';
import { installUsageMeter } from './usage-meter.js';
import { installSessionLifecycle } from './session-lifecycle.js';
import { installSetupFlows } from './setup-flows.js';
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
import { openDesktop as openDesktopFn } from './desktop-window.js';
import { openTaskDetail as openTaskDetailFn } from './task-detail.js';
import { openTaskLog as openTaskLogFn } from './task-log.js';
import { openUsageWindow } from './usage-window.js';
import { openSessionProps as openSessionPropsFn } from './session-props.js';
import { openWorkflowDetail as openWorkflowDetailFn } from './workflow-detail.js';
import { DesktopManager } from './desktop-manager.js';
import { CustomizeMode, applyArrangement } from './customize-mode.js';
import { installSessionPalette } from './session-palette.js';
import { installUserTodos } from './user-todos-panel.js';
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
    // Codex effort levels are model-specific since GPT-5.6 (sol/terra add
    // max+ultra) — build the dropdown from the union of the models' reported
    // levels instead of the stale hardcoded ladder. Rank keeps a sane order.
    const rank = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
    const union = [...new Set(data.codex.flatMap(m => m.efforts || []))]
      .sort((a, b) => (rank.indexOf(a) + 1 || 99) - (rank.indexOf(b) + 1 || 99));
    if (union.length) {
      const efforts = [{ value: '', label: t('Auto (model default)') },
        ...union.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))];
      BACKEND_SESSION_OPTIONS.codex.efforts = efforts;
      SETTINGS_SCHEMA['codex.defaultEffort'].options = efforts.map(e => ({ value: e.value, label: e.label }));
    }
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

// localStorage keys that ride the config export's clientPrefs section — the
// export gather and the import write-back MUST use the same list (a key only
// in one direction silently drops). Per-device view prefs included on purpose:
// migrating to a new deployment shouldn't reset language/usage-view choices.
const CLIENT_PREF_KEYS = [
  'theme', 'termFontSize', 'termFontFamily', 'taskbarHeight',
  'vibespace.lang', 'vibespace.usageAccount', 'vibespace.usageAccountCodex',
  'vibespace.quotaRefreshAck', 'vs-onboarded',
];

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
    this.wm.app = this; // mediator back-ref (title-bar billing badge → switcher)
    this.wm._settings = this.settings;
    this.wm._app = this;
    // Re-render all tab bars when tab wrap setting changes
    // Hook-card visibility: pure CSS toggle so flipping the setting applies
    // to every open chat instantly, both directions (no re-render).
    const applyHookVis = () => document.body.classList.toggle('hide-hook-cards', this.settings.get('chat.showHookCards') === false);
    applyHookVis();
    this.settings.on('chat.showHookCards', applyHookVis);
    setTimeout(applyHookVis, 2000); // re-apply once the async settings load lands
    // Empty-thinking visibility (chat.hideEmptyThinking, default ON): same
    // pure-CSS body-class toggle. Flipping it changes run-collapse adjacency
    // (hidden cards are transparent to runs) — re-decorate open chats too.
    const applyEmptyThink = () => {
      document.body.classList.toggle('hide-empty-thinking', this.settings.get('chat.hideEmptyThinking') !== false);
      for (const [, s] of this.sessions || []) s._updateRuns?.(); // constructor runs this before this.sessions exists
    };
    applyEmptyThink();
    this.settings.on('chat.hideEmptyThinking', applyEmptyThink);
    setTimeout(applyEmptyThink, 2000);
    // Keep the activity spinner ROTATING under prefers-reduced-motion (opt-in
    // — the default pulse read as "blinking/broken" to some users).
    const applySpinRM = () => document.body.classList.toggle('spin-under-rm', this.settings.get('chat.reducedMotionSpin') === true);
    applySpinRM();
    this.settings.on('chat.reducedMotionSpin', applySpinRM);
    setTimeout(applySpinRM, 2000);
    // Consecutive thinking/Bash run collapse: re-decorate every open chat when
    // the setting flips (the per-view MutationObserver only fires on content).
    this.settings.on('chat.collapseRuns', () => {
      for (const [, s] of this.sessions) s._updateRuns?.();
    });
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
        this._accounts = { ...(this._accounts || {}), accounts: msg.accounts, defaultAccountId: msg.defaultAccountId || null, defaultCodexAccountId: msg.defaultCodexAccountId || null };
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
    installUserTodos(this); // global "For you" inbox (agent-filed user TODOs)
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
      this._repoDir = d.repoDir || null; // server install dir (⚙ self-update)
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

    // Desktop (noVNC) availability — one startup probe gates the ⚙ menu entry
    fetchJson('/api/vnc/status').then((d) => { this._vncAvailable = !!d?.available; }).catch(() => {});

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
      show('taskbar-user-todos', s.get('taskbar.showUserTodos'));
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
                     'taskbar.visibility', 'taskbar.showDesktopPreviews', 'taskbar.showUserTodos', 'taskbar.showUsage', 'taskbar.showWindowCount',
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
    // The taskbar element PERSISTS across hotzone recreation (toggling
    // autohide off/on) — re-adding its listeners each time stacked duplicates.
    if (!taskbar._hzWired) {
      taskbar._hzWired = true;
      taskbar.addEventListener('mouseenter', reveal);
      taskbar.addEventListener('mouseleave', conceal);
    }
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
        { label: check(t('For-you inbox'), s.get('taskbar.showUserTodos')), action: () => s.set('taskbar.showUserTodos', !s.get('taskbar.showUserTodos')) },
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

  // ── Shared modal shell for the config/password dialogs ──
  

  // ── Backup & migrate (one dialog, Export | Import tabs) ──
  // Merged into a single gs-menu entry after the menu grew too long.
  

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
      mkRow('tasks', t('Task Groups'), t('{count} group(s) incl. checklists & activity logs', { count: s.tasks?.count || 0 })),
      mkRow('pricing', t('Usage pricing table'), t('{count} model rate(s) / account discount(s)', { count: s.pricing?.count || 0 })),
      mkRow('clientPrefs', t('This browser’s preferences'), t('theme, font, language, usage-view choices')),
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
      mkRow('accounts', t('Billing accounts'), info.sensitive.accounts ? t('{n} account(s) — API keys + subscription logins', { n: info.sensitive.accounts }) : t('no accounts configured'), { checked: false, disabled: !info.sensitive.accounts }),
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
      for (const k of CLIENT_PREF_KEYS) {
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
      tasks: [t('Task Groups'), (d) => t('{n} group(s)', { n: (d?.tasks || []).length })],
      pricing: [t('Usage pricing table'), (d) => t('{n} model rate(s) / account discount(s)', { n: Object.keys(d?.tiers || {}).length + Object.keys(d?.accounts || {}).length })],
      clientPrefs: [t('Browser preferences'), (d) => Object.keys(d || {}).join(', ') || t('empty')],
    };
    const SENS_LABELS = { vsPassword: t('VibeSpace password'), claudeCreds: t('Claude CLI credentials'), codexCreds: t('Codex CLI credentials'), hosts: t('Remote hosts'), mounts: t('S3 mounts & shares'), accounts: t('Billing accounts') };

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
              if (CLIENT_PREF_KEYS.includes(k)) localStorage.setItem(k, v);
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
      chart: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13h12"/><rect x="3" y="8" width="2.4" height="4"/><rect x="6.8" y="5" width="2.4" height="7"/><rect x="10.6" y="2.5" width="2.4" height="9.5"/></svg>',
    };
    const sep = () => { const s = document.createElement('div'); s.className = 'gs-menu-sep'; return s; };
    // workspace tools / data & security / help — grouped, the flat list grew too long
    if (!this.isMobile) menu.append(item(I.brush, t('Customize UI\u2026'), () => this._customize.enter()));
    menu.append(item(I.key, t('Manage agents\u2026'), () => this._showAgentsDialog()));
    menu.append(item(I.chart, t('Usage\u2026'), () => this.openUsage()));
    menu.append(item(I.chart, t('Diagnostics report\u2026'), () => this._openDiagnostics()));
    // In-container desktop (noVNC) \u2014 only where a VNC stack exists (probed
    // once at startup; hidden entirely on desktop-less deployments).
    if (this._vncAvailable) {
      const I_desk = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="9" rx="1"/><path d="M8 11.5V14M5 14h6"/></svg>';
      menu.append(item(I_desk, t('Desktop'), () => this.openDesktop()));
    }
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
    // Self-update: runs scripts/update.sh visibly in a shell terminal (same
    // pattern as Manage Agents' CLI updates). The dtach terminal survives the
    // service restart at the end, so the log stays readable throughout.
    if (this._repoDir) menu.append(item(I.key, t('Update VibeSpace\u2026'), () => {
      this.openShellTerminal(this._repoDir, { initialCommand: 'bash scripts/update.sh' });
    }));
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

    document.querySelector('#dialog-new-session .btn-create').addEventListener('click', async (ev) => {
      const createBtn = ev.currentTarget;
      if (createBtn.dataset.busy) return; // Enter + click racing the async check
      const backend = document.getElementById('input-backend').value || 'claude';
      const hostId = document.getElementById('input-host')?.value || undefined;
      const cwd = document.getElementById('input-cwd').value.trim();
      // A typo'd/nonexistent cwd used to fail opaquely at spawn time (pty chdir
      // error → instant "terminated"; remote silently fell back to $HOME).
      // Stat it first and offer to create the folder; on cancel the dialog
      // stays open for correction.
      if (cwd) {
        createBtn.dataset.busy = '1';
        const ok = await this._ensureCwdExists(cwd, hostId).finally(() => delete createBtn.dataset.busy);
        if (!ok) return;
      }
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
    customOpt.textContent = t('Custom…');
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
    // Mobile: #dialog-overlay sits BELOW the full-screen sidebar — every
    // index.html dialog opened from the sidebar was invisible (fork/new-session
    // patched this per-site before; central now).
    if (this.isMobile && this.sidebar?.isOpen) this.sidebar.toggle(false);
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
      const all = this._accounts?.accounts || [];
      const list = all.filter(a => (a.backend || 'claude') === be);
      const onHost = !!document.getElementById('input-host')?.value;
      const show = (be === 'claude' || be === 'codex') && list.length > 0;
      acctRow.style.display = show ? '' : 'none';
      if (!show) { acctSel.value = ''; return; }
      const defId = be === 'codex' ? this._accounts?.defaultCodexAccountId : this._accounts?.defaultAccountId;
      const globalLabel = be === 'codex' ? t('ChatGPT login') : t('Subscription');
      const defName = defId ? (list.find(a => a.id === defId)?.name || t('API key')) : globalLabel;
      const prev = acctSel.value;
      acctSel.innerHTML = '';
      const opts = [
        ['', t('Default ({name})', { name: defName })],
        ['subscription', be === 'codex' ? (onHost ? t('ChatGPT login (on the host)') : t('ChatGPT login')) : t('Subscription (Pro/Max login)')], // the CLI's global login
      ];
      // Subscription accounts on a REMOTE host require the opt-in toggle (their
      // creds ship to the host, exposing the token from that host's IP — a ban
      // risk; default OFF). API keys always ship. Local: always available.
      const allowSubRemote = !!this.settings?.get?.('accounts.shipSubscriptionToRemote');
      for (const a of list) {
        if (a.type === 'subscription') { if (a.loggedIn && (!onHost || allowSubRemote)) opts.push([a.id, t('{name} (subscription)', { name: a.name })]); }
        else opts.push([a.id, t('{name} — API key …{tail}', { name: a.name, tail: a.tail })]);
      }
      for (const [v, label] of opts) {
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
  // New Session guard: stat the typed cwd (host-aware, '~' ok) and offer to
  // create it when missing. Returns true when the path is a usable directory
  // (possibly just created). Any stat failure is treated as "missing" — if the
  // real problem is elsewhere (permissions, unreachable host), the mkdir
  // attempt surfaces the actual error instead of us guessing.
  async _ensureCwdExists(cwd, hostId) {
    const hostQ = hostId ? `&host=${encodeURIComponent(hostId)}` : '';
    const info = await fetchJson(`/api/file/info?path=${encodeURIComponent(cwd)}${hostQ}`);
    if (info && !info.error) {
      if (info.isDirectory === false) {
        showToast(t('“{path}” is a file — a session needs a folder', { path: cwd }), { type: 'error' });
        return false;
      }
      return true;
    }
    const ok = await showConfirmDialog({
      title: t('Folder does not exist'),
      message: hostId
        ? t('“{path}” does not exist on the selected remote host. Create it and start the session there?', { path: cwd })
        : t('“{path}” does not exist. Create it and start the session there?', { path: cwd }),
      confirmText: t('Create folder'),
    });
    if (!ok) return false;
    const r = await fetchJson('/api/mkdir', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: cwd, host: hostId || undefined }),
    });
    if (!r || r.error) {
      showToast(t('Could not create “{path}”: {err}', { path: cwd, err: (r && r.error) || t('server unreachable') }), { type: 'error' });
      return false;
    }
    return true;
  }

  openFileExplorer(startPath, { syncId, host } = {}) {
    this._hideWelcome();
    const openSpec = { action: 'openFileExplorer', path: startPath, host: host || undefined };
    const winInfo = this.wm.createWindow({ title: t('File Explorer'), type: 'files', syncId, openSpec });
    if (host) winInfo._explorerHost = host; // read by FileExplorer constructor
    const explorer = new FileExplorer(winInfo, this, startPath);
    winInfo._explorer = explorer;
    winInfo.onClose = () => { explorer.dispose(); this._checkWelcome(); };
    return winInfo;
  }

  openBrowser(url, opts) { return openBrowserFn(this, url, opts); }
  openDesktop(opts) { return openDesktopFn(this, opts); }

  openTaskDetail(taskId, opts) { return openTaskDetailFn(this, taskId, opts); }
  openTaskLog(taskId, opts) { return openTaskLogFn(this, taskId, opts); }
  openUsage(opts) { return openUsageWindow(this, opts || {}); }

  // Diagnostics report: renders the local telemetry summary (client errors,
  // boot crashes, feature usage) as a static HTML page in the embedded
  // browser — same blob-URL pattern as the chat html Preview button.
  

  openSessionProps(sessionRef, opts) { return openSessionPropsFn(this, sessionRef, opts); }

  // Anthropic accounts (billing identity). Full snapshot incl. subscription
  // login state + importable CLI key; the accounts-updated broadcast keeps the
  // list fresh between refreshes.
  refreshAccounts() {
    return fetchJson('/api/accounts').then(d => {
      if (d) this._accounts = { accounts: d.accounts || [], defaultAccountId: d.defaultAccountId || null, defaultCodexAccountId: d.defaultCodexAccountId || null, subscription: d.subscription || {}, cliKey: d.cliKey || {} };
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
    // Runs on every 5s merge — index once instead of find() per window over
    // the full ~5k-entry list (which also allocated two template strings per
    // probed entry; audit round-2 confirmed hot path).
    const byWebui = new Map();
    const byKey = new Map();
    for (const entry of allSessions) {
      if (entry.webuiId && !byWebui.has(entry.webuiId)) byWebui.set(entry.webuiId, entry);
      const k = entry.sessionKey || `${entry.backend || 'claude'}:${entry.backendSessionId || entry.sessionId}`;
      if (!byKey.has(k)) byKey.set(k, entry);
    }
    for (const [winId, session] of this.sessions) {
      const win = this.wm.windows.get(winId);
      if (!win) continue;
      const spec = win._openSpec || {};
      let match = byWebui.get(session.sessionId) || null;
      if (!match && (spec.sessionKey || spec.backendSessionId || spec.sessionId)) {
        const specKey = spec.sessionKey || `${spec.backend || win.titleMeta?.backend || 'claude'}:${spec.backendSessionId || spec.sessionId || ''}`;
        match = byKey.get(specKey) || null;
      }
      if (!match) continue;
      // Persist a fork's chosen title as a custom name once its NEW backend id
      // is adopted (after the first turn) — before that, match.backendSessionId
      // is still the parent's, and renaming then would clobber the parent.
      const pendingFork = this._pendingForkTitles?.get(session.sessionId);
      if (pendingFork && match.backendSessionId && match.backendSessionId !== pendingFork.parentId) {
        this.sidebar.setCustomName?.(match.sessionKey || getSessionKey(match), pendingFork.name);
        this._pendingForkTitles.delete(session.sessionId);
      }
      // A user-typed New Session name becomes the custom name once the backend
      // id exists (before that there is no stable key to attach it to). A
      // manual rename in the meantime wins — don't clobber it.
      const pendingName = this._pendingCreateNames?.get(session.sessionId);
      if (pendingName && match.backendSessionId) {
        if (!this.sidebar.getCustomName?.(match)) {
          this.sidebar.setCustomName?.(match.sessionKey || getSessionKey(match), pendingName);
        }
        this._pendingCreateNames.delete(session.sessionId);
      }
      this.wm.setTitleMeta(winId, this._buildTitleMeta(match));
      this.wm.setAuthBadge?.(winId, match.auth || null); // billing key in the title bar
      // Mobile has no window title bars → no badge; the chat status bar hosts
      // the identity chip there instead (same click-to-switch).
      if (this.isMobile) session.setBillingIdentity?.(match.auth || null, (el) => this.showBillingSwitcher(winId, el));
      if (win._openSpec) {
        // NEVER write the webui server id into backendSessionId: a session
        // whose CLI hasn't reported its real id yet (remote spawns stay in
        // that state for a long time) used to get `sess-N-…` baked into the
        // spec — other clients then re-resolved against that bogus id, missed,
        // and opened a BLANK view-only window (real report, remote hosts).
        const realBsid = match.backendSessionId
          || (match.sessionId && match.sessionId !== match.webuiId ? match.sessionId : null);
        Object.assign(win._openSpec, {
          backend: match.backend || win._openSpec.backend || 'claude',
          backendSessionId: realBsid || win._openSpec.backendSessionId || null,
          sessionKey: realBsid ? (match.sessionKey || getSessionKey(match)) : (win._openSpec.sessionKey || ''),
          hostId: match.hostId ?? win._openSpec.hostId ?? null,
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
      let match = allSess.find(s => s.webuiId === term.sessionId);
      if (!match) {
        // Terminated/read-only windows: the live entry is gone — match the
        // STOPPED sidebar entry via the identity in the openSpec (also covers
        // view-history windows, whose sessionId never matches a webuiId).
        const spec = this.wm.windows.get(activeWinId)?._openSpec;
        const bsid = spec?.backendSessionId;
        if (bsid) {
          const be = spec.backend || 'claude';
          match = allSess.find(s => (s.backendSessionId || s.sessionId) === bsid && (s.backend || 'claude') === be);
        }
      }
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
    // Waiting-blink propagation to tab headers rides the same funnel (every
    // waiting toggle calls winInfo._notifyChanged → here) — a grouped guest's
    // own titlebar is hidden, so its TAB must carry the blink instead.
    this.wm.refreshTabWaiting?.();
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

// Prototype mixins split out of this file (2.82.0 audit) — installed at import time, before any instantiation.
installManageAgents(App);
installUsageMeter(App);
installSessionLifecycle(App);
installSetupFlows(App);

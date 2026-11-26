import { ThemeManager, THEMES, BUILTIN_THEMES } from './themes.js';
import { waitServerReady, reasonOf } from './boot-ladder.js';
import { staleLook, staleNotice, heldWords, TYPING_QUIET_MS } from './stale-watch.js'; // lane think-tools-phone: a stale page that gave up checks again
import { registerInternalLinks } from './internal-link-door.js'; // lane login-request-card piece 1: the renderers' door
import { targetOf as linkTargetOfPage, pressLink, linkMenu } from './internal-link-ui.js'; // lane login-request-card piece 1: THE press of a link of the scheme (the page's own doors)
import { awaitBootReady, bootDeps, startingLine, retryLine } from './boot-splash.js';
import { installPluginClient } from './plugin-client.js';
import { installKeybindings, registerKeybinding, runCommand } from './contributions.js';
import { buildGearMenu } from './gear-menu.js';
import { BUILD_VERSION } from './build-version.js';
import { navNote } from './nav-log.js'; // lane phone-back-reload: the stale-tab step is a row of the tab's diary
import { track } from './telemetry-client.js';
import { needLine } from './need-line.js'; // lane ui-needs-a-button (gear-and-system-12)
import { WsManager } from './ws.js';
import { WindowManager } from './window.js';
import { installFormHost } from './form-window.js'; // lane dialog-yield: createModalShell's kind 'form' = a small window that yields (desktop tier)
import { TerminalSession } from './terminal.js';
import { Sidebar } from './sidebar.js';
import { FileExplorer } from './file-explorer.js';
import { FileViewer } from './file-viewer.js';
import { CodeEditor } from './code-editor.js';
import { LayoutManager } from './layout.js';
import { ChatView } from './chat-view.js';
import { createReconnectQueue } from './reconnect-queue.js';
import { Resizer } from './resizer.js';
import { createHeldKeeper } from './jobs-held.js';   // B-360d unit 3: the held digest, kept once a page
import { openOatDoor } from './oat-door.js';   // B-8703 (r4586): the identity check's door — PURE
import { heldWordsOf, anchorFixedPopup, drawnAnchorRect, api, configureToasts, registerSettingLinks, createPopover, createModalShell, fetchJson, initStateSync, installLongPressContextMenu, frontTruncate, escHtml, showContextMenu, showToast, showConfirmDialog, showInputDialog, applyUiPrefs, uiScale, setInstanceUrl, markTyped, wasTyped, announceModal } from './utils.js';
import { lateFocus } from './late-focus.js'; // B-c87d: a go-to that lands after an await asks THE door (the keyboard stays where the person last put it)
import { askTails, withTails, credentialDoorWords } from './account-tails.js'; // B-ba7d: the accounts list carries no key tail — the person's read lays it on
import { t, tc, resolveLang } from './i18n.js';
import { stampAt as when, clockOf } from './page-time.js'; // lane ui-language: the ONE formatter of a time / number a person reads
import { themeWord, modelOptions } from './value-words.js'; // lane ui-language: a theme key in the reader's words (the walk's window-manager-9)
import { reportLine, refreshLabel, signInLabel, refusalText, rowsSig, opensFor, notInReport } from './cli-models-words.js'; // PURE (lane agy-models-report): a CLI that reports its own models — the menu's line, its door, the explicit row
import { agoText as agoWords, registerSettingFacts } from './user-todos-row.js'; // the client's relative-time helper («5min ago»), in the device's words
import { installManageAgents } from './manage-agents.js';
import { openAccountModelsDialog } from './account-models.js'; // q-053 §3 (lane models-at-session): a provider with no models — the door to its account's models
import { MENU_EMPTY } from '../model-providers.js'; // PURE: the one line an empty menu says
import { installPluginsUI } from './plugins-ui.js';
import { installUsageMeter } from './usage-meter.js';
import { installSessionLifecycle } from './session-lifecycle.js';
import { installSetupFlows } from './setup-flows.js';
import { MobileNav } from './mobile-nav.js';
import { installMobileBack } from './mobile-back.js'; // lane mobile-back-guard: the phone's back gesture closes the open panel first
import { pathField, appGroups } from './path-field.js'; // lane path-field: THE path field at every door (src/path-candidates.js ranks)
import { installNewSessionForm } from './new-session-form.js'; // lane new-session-form: the two columns, the fold, the right column, the footer
import { createPlan } from './new-session-model.js'; // PURE: what Create sends (lane new-session-layout-v3-build: Agent | Terminal + the harness's own terminal UI → the road + the v2 payload)
import { getAvailableFonts } from './terminal.js';
import { SettingsManager } from './settings.js';
import { SETTINGS_SCHEMA, registerHarnessSettings, isSettingKey } from './settings-schema.js';
import { SettingsUI } from './settings-ui.js';
import { openExternalEditor, closeExternalEditor } from './external-editor.js';
import { CommandMode } from './command-mode.js';
import { updateTaskbar as updateTaskbarFn } from './taskbar.js';
import { openBrowser as openBrowserFn } from './browser-window.js';
import { openDesktop as openDesktopFn } from './desktop-window.js';
import { openDesktopApp as openDesktopAppFn } from './desktop-app-window.js';
import { agentWindowPlacement } from './desktop-app-placement.js';
import { displayedPanes } from './chain-layout.js'; // lane agent-window-no-pop: the panes a split frame shows (the person looks at both)
import { setHubZone, pageZone } from './owner-facts.js'; // B-7960 a: the zone the hub resolved for the owner — the board prints in it
import { setPageZone } from './page-time.js'; // lane ui-language: the ONE formatter prints in the page's zone
import { setStampFormatter } from './usage-source.js'; // lane ui-language: …and the PURE usage-source module renders through it
import { installDesktopAppLauncher } from './desktop-app-launcher.js';
import { installOpenWith } from './open-with.js'; // §7.9: app.openWithDesktopApp (the ONE door) + the file-changed relay
import { openBrowserLive as openBrowserLiveFn, openBrowserLiveBeside as openBrowserLiveBesideFn, installBrowserLive } from './browser-live-window.js'; // agent browser P2 (§4.4): the live view window; P7 (§4.6): auto-bind
import { openTaskDetail as openTaskDetailFn } from './task-detail.js';
import { openTaskLog as openTaskLogFn } from './task-log.js';
import { openUsageWindow } from './usage-window.js';
import { openJobsWindow, openInteractWindow } from './jobs-panel.js';
import { openSearchWindow } from './search-window.js'; // lane global-search: Search everything (window type `search`, ⚙ Tools row, Ctrl+Shift+F)
import { openChannelWindow } from './channel-window.js';
import { focusChannelsPanel, openSearchResults } from './channels-panel.js';
import { openChannelOutbox as openChannelOutboxFn } from './channel-outbox.js';
import { showConnectAccountDialog } from './channel-account-dialogs.js';   // lane pod-oauth-callback: the chat's «Connect <type>» row
import { openIntegrationsWindow } from './integrations-window.js';
import './feedback-sheet.js'; // lane agent-feedback: ⚙ System ▸ Agent feedback… (the module registers its gear row)
import { openSessionProps as openSessionPropsFn } from './session-props.js';
import { openWorkflowDetail as openWorkflowDetailFn } from './workflow-detail.js';
import { openDesign as openDesignFn, openDesignPublishDialog, installDesignWindow } from './design-window.js'; // lane design-window: the Design window (window type `design`) + its publish dialog + the hub's open push
import { openArtifacts as openArtifactsFn } from './artifacts-window.js'; // lane artifacts-list-scale: the Artifacts window (window type `artifacts`) — the chip's list at full size behind its ⤢
import { openDoc as openDocFn } from './doc-window.js'; // lane doc-window: the Doc window (window type `doc`) — a markdown file read, edited and annotated in one rendered view; the editor itself is the lazy public/doc-editor.js
import { DesktopManager } from './desktop-manager.js';
import { noteStoreHeld, noteStoreLifted, noteStoreUnsaved, noteStoreSaved, noteStoreStop, noteStoreStopOver, onStoreLift, refreshStoreHolds, setStoreDoors } from './store-held.js'; // B-225b R7: the page's ONE strip for a held store
import { StageManager, STAGE_ID } from './stage-manager.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { CustomizeMode, applyArrangement } from './customize-mode.js';
import { installToolbarFold } from './toolbar-fold.js'; // lane toolbar-fold: the toolbar never overlaps — words go first, then a ⋯
import { installSessionPalette } from './session-palette.js';
import { installViewportSwitch, readViewportClass } from './viewport-switch.js'; // lane duo-build-1: the viewport class, live
import { isPhoneClass } from '../viewport-class.js';
import { installFoldLadder } from './fold-ladder.js'; // lane duo-build-1 slice 4: the posture ladder (book / laptop on segments:2 only)
import { installKeyboardInset } from './keyboard-inset.js'; // lane duo-build-1 slice 3: the keyboard read from the visual viewport
import { installUserTodos } from './user-todos-panel.js';
import { openInboxWindow } from './inbox-window.js'; // design-user-inbox-reply §9: THE For-you window (the popup's / a row's / the mini inbox's ⤢, ⚙ Communication ▸ For you…)
import { installBrowserProfilePicker } from './browser-profile-picker.js'; // agent browser P1 (§3.2.5): the pin's one entry point + the profile digest
import { installBrowserTakeovers } from './browser-takeover-queue.js'; // lane browser-takeover-queue: the ONE client copy of the takeover requests
import { installBrowserSwitcher } from './browser-switcher.js'; // agent browser P4 (§7.4/§7.5): the backend switcher, the chip, the blocked claims
import { installBrowserTrace } from './browser-trace-view.js'; // agent browser P5 (§4.5/§8 step 3): the profiles panel (the trace surfaces install themselves)
import { installBrowserReplay } from './browser-replay-window.js'; // 2026-09-27: a browser session's replay (window type browser-replay)
import { permissionModeOptions } from './permission-mode-labels.js'; // lane L: permission modes in plain words, the raw value as a hint
import { BACKEND_META, createBackendIconHtml, getSessionKey, pickAgentIdentity, settingsPrefixFor, effortLabel, effortOptions, hasEffortMenu, uiRow, noteModelCatalog, worktreeCapsFor, backendFeatureCaps, billingRow, terminalOnly, accountDefaultsOf, accountRowsOf } from './agent-meta.js';
import { sessionGivenName } from '../session-name.js'; // lane session-title-record: THE name ladder's given rungs (the window title)
import { noteVoicePlugins, followFocus } from './voice-input.js'; // lane voice-everywhere: every microphone follows the voice plugin (absent when off); lane voice-follows-focus: dictation follows the focus
import { enterSubmits } from './chat-enter-keys.js';
import { placeWarmthChip } from './warmth-chrome.js'; // lane cache-warmth-band (q-059 r1b): the prompt-cache warmth summary chip follows For-you like the lock chip
import { initVault, listenVaultDoor, maybeNagVault, unlockFirst, placeVaultChip } from './vault-unlock.js'; // lane vault-e2e-password: the unlock modal after every start, the setup ask until set (lane vault-locked-loud: the ⚙ press unlocks first)
import { initHeldLists, applyHeldLists, placeHeldChip, refreshHeldLists } from './held-lists.js'; // B-f276 family unit B: THE ONE NOTICE of the held lists (the chip; the system panel's section)
import { insideFolder, membershipCwds } from '../task-membership.js'; // PURE (lane open-task-binds): THE Task Group folder rule (a folder includes itself); B-df5f: the page's cwds of a row
import { oatDeadFor, oatExpiredBy } from '../login-expiry.js'; // B-8703 follow: the New Session list reads the ONE verdict + the server's last day

const BACKEND_SESSION_OPTIONS = {
  claude: {
    models: [{ id: '', label: t('Default') }, { id: 'fable', label: t('fable (latest, 200k)') }, { id: 'fable[1m]', label: t('fable[1m] (latest, 1M)') }, { id: 'opus', label: t('opus (latest, 200k)') }, { id: 'opus[1m]', label: t('opus[1m] (latest, 1M)') }, { id: 'sonnet', label: t('sonnet (latest)') }, { id: 'sonnet[1m]', label: t('sonnet[1m] (latest, 1M)') }, { id: 'haiku', label: t('haiku (latest)') }],
    permissions: permissionModeOptions('claude', ['', 'auto', 'bypassPermissions', 'plan', 'acceptEdits'], t),
    efforts: [
      { value: '', label: t('Auto (model default)') },
      { value: 'low', label: t('Low') },
      { value: 'medium', label: t('Medium') },
      { value: 'high', label: t('High') },
      { value: 'xhigh', label: t('XHigh') },
      { value: 'max', label: t('Max (Opus only)') },
      ...effortOptions('claude', [], BACKEND_META.claude.ui.effortExtras), // seed: the declared extras (ultracode) until the server answers
    ],
  },
  codex: {
    models: [{ id: '', label: t('Default') }],
    permissions: permissionModeOptions('codex', ['', 'read-only', 'safe-yolo', 'yolo'], t),
    efforts: [
      { value: '', label: t('Auto (model default)') },
      { value: 'minimal', label: t('Minimal') },
      { value: 'low', label: t('Low') },
      { value: 'medium', label: t('Medium') },
      { value: 'high', label: t('High') },
      { value: 'xhigh', label: t('XHigh') },
    ],
  },
  // OpenCode over ACP (S8): models come from the agent at session start
  // (/api/available-models fills them in once one has run); "permission" =
  // the agent's session mode; no effort ladder (ui.effortLevels null hides the row — hasEffortMenu).
  opencode: {
    models: [{ id: '', label: t('Default') }],
    permissions: permissionModeOptions('opencode', ['', 'build', 'plan'], t),
    efforts: [{ value: '', label: t('Auto (model default)') }],
  },
  // Antigravity CLI (lane antigravity-harness): the docs' model slugs arrive through /api/available-models;
  // "permission" = agy's --mode (or bypass); effort = agy's OWN --effort list, its declared ui.effortLevels (the row the
  // server answers for ?backend=antigravity) — no claude extras (lane effort-menu-per-harness)
  antigravity: {
    models: [{ id: '', label: t('Default') }],
    permissions: permissionModeOptions('antigravity', ['', 'accept-edits', 'auto', 'plan', 'bypassPermissions'], t),
    efforts: effortOptions('antigravity', uiRow('antigravity').effortLevels, uiRow('antigravity').effortExtras, { head: { value: '', label: t('Auto (model default)') } }),
  },
};

// Fetch available models from server (Claude from bootstrap/v1/models API, Codex from cache)
// THE NOTIFY LAW (lane cli-update-needs-nothing, acceptance r1 smaller 2): the boot fetch and every
// `available-models-dirty` broadcast (the hub read a new Claude Code's own model list) apply through ONE function
const applyAvailableModels = (data) => {
  if (!data) return;
  const toSchemaOptions = (models) => modelOptions(models, t);   // lane ui-language: the default row is the page's «Default»
  // EVERY harness's offered models, one rule (lane dc-harness-tail): claude's from bootstrap/v1/models, codex's from
  // its cache, an ACP agent's learned server-side from session/config records (S8)
  for (const be of Object.keys(data)) {
    if (!BACKEND_SESSION_OPTIONS[be] || !data[be]?.length) continue;
    BACKEND_SESSION_OPTIONS[be].models = data[be];
    if (SETTINGS_SCHEMA[`${be}.defaultModel`]) SETTINGS_SCHEMA[`${be}.defaultModel`].options = toSchemaOptions(data[be]);
  }
  // Per-model facts that are not pickable options (multiAgentEffort) — the
  // metadata popup and the status-bar tooltip read them from here (2.369.62).
  for (const be of Object.keys(data)) noteModelCatalog(be, data[be]);
  if (data.codex?.length) {
    // Codex effort levels are model-specific since GPT-5.6 (sol/terra add
    // max+ultra) — build the dropdown from the union of the models' reported
    // levels instead of the stale hardcoded ladder. Rank keeps a sane order.
    const rank = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
    const union = [...new Set(data.codex.flatMap(m => m.efforts || []))]
      .sort((a, b) => (rank.indexOf(a) + 1 || 99) - (rank.indexOf(b) + 1 || 99));
    if (union.length) {
      const efforts = [{ value: '', label: t('Auto (model default)') },
        ...union.map(e => ({ value: e, label: effortLabel('codex', e, { capitalize: true }) }))]; // 'ultra' carries its delegation hint (META.effortHints)
      BACKEND_SESSION_OPTIONS.codex.efforts = efforts;
      SETTINGS_SCHEMA['codex.defaultEffort'].options = efforts.map(e => ({ value: e.value, label: e.label }));
    }
  }
};
const refreshAvailableModels = () => fetchJson('/api/available-models').then(applyAvailableModels);
refreshAvailableModels();
// Fetch claude's effort levels + permission modes from server (parsed from claude --help),
// ASKED FOR claude (lane effort-menu-per-harness: the route answers each backend its own rows).
// The pickers are the parsed levels + the declared extras (the server's gated
// effortExtras; the META seed from an older server) — APPENDED, never replaced:
// swapping the parsed list in dropped ultracode the moment this landed (lane effort-ultracode).
fetchJson('/api/session-options?backend=claude').then(data => {
  if (!data) return;
  if (data.effortLevels?.length) {
    const efforts = effortOptions('claude', data.effortLevels, data.effortExtras ?? BACKEND_META.claude.ui.effortExtras, { head: { value: '', label: t('Auto (model default)') } });
    BACKEND_SESSION_OPTIONS.claude.efforts = efforts;
    SETTINGS_SCHEMA['claude.defaultEffort'].options = efforts.map(e => ({ value: e.value, label: e.label }));
  }
  if (data.permissionModes?.length) {
    const perms = permissionModeOptions('claude', ['', ...data.permissionModes], t); // lane L: words + the raw value as a hint (was the raw value alone)
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
  'vibespace.uiScale', 'vibespace.uiFontScale',
];

class App {
  constructor() {
    /** Centralized mobile detection — all code should use app.isMobile instead of matchMedia. THE VIEWPORT CLASS (PURE
     *  src/viewport-class.js) decides it, and a crossing at runtime (a fold, a rotation) switches it — src/lib/viewport-switch.js
     *  (lane duo-build-1: frozen at boot, a Duo folded to its cover kept the desktop's rail and window geometry) */
    this._vc = readViewportClass();
    this.isMobile = isPhoneClass(this._vc);
    document.documentElement.dataset.vc = this._vc;
    /** Touch-primary device (phones AND tablets) — hover/right-click unavailable */
    this.isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    // Long-press = right-click on touch devices (iOS never fires contextmenu natively)
    if (this.isTouch) installLongPressContextMenu();

    this.settings = new SettingsManager();
    // Toast cards anchor at the inbox button and read their duration live
    configureToasts({
      getSeconds: () => this.settings.get('taskbar.toastSeconds'),
      getAnchor: () => document.getElementById('taskbar-user-todos'),
    });
    // lane setting-doors pick 1: a toast's words (a server notice, a refusal) draw a `vibespace://settings/<key>` naming a known
    // row as a link to it — THE door, openSettingAt; every other word stays text
    registerSettingLinks({ has: isSettingKey, open: (key) => this.openSettingAt(key) });
    // lane login-request-card piece 1: THE door a renderer asks for a link to a conversation / desktop (what the page has, the press, Go · Copy link)
    registerInternalLinks({ targetOf: (kind, ref) => linkTargetOfPage(this, kind, ref), press: (kind, ref, at) => pressLink(this, kind, ref, at), menu: (kind, ref, at, flash) => linkMenu(this, kind, ref, at, flash) });
    // lane setting-doors pick 2: THE LIVE FACTS an agent's proposed change is drawn against (user-todos-row.js registerSettingFacts) —
    // the row's value NOW (this settings store; a hub's «moved» answer to a press is noted until the store hears the row move) and its
    // standing HOLD (GET /api/setting-holds at boot and every reconnect, then every `setting-holds` broadcast). A change of either
    // redraws the For-you rows on the snapshot they hold; a change of the holds redraws an open Settings window too (its held line)
    this._settingHolds = [];
    const saidNow = new Map();   // key → the value the hub answered a press with (until the store says the row moved)
    const proposable = Object.keys(SETTINGS_SCHEMA).filter((k) => SETTINGS_SCHEMA[k] && SETTINGS_SCHEMA[k].proposable === true);
    registerSettingFacts({
      value: (key) => (saidNow.has(key) ? saidNow.get(key) : this.settings.get(key)),
      holdOf: (key) => this._settingHolds.find((h) => h && h.key === key) || null,
      present: (key, v) => { saidNow.set(key, v); try { this._inboxModel?.redraw?.(); } catch { } },
    });
    for (const key of proposable) this.settings.on(key, () => { saidNow.delete(key); try { this._inboxModel?.redraw?.(); } catch { } });
    this._setSettingHolds = (holds) => {
      const was = this._settingHolds || [];
      this._settingHolds = Array.isArray(holds) ? holds.filter((h) => h && typeof h.key === 'string') : [];
      try { this._inboxModel?.redraw?.(); } catch { }
      // only ENDED holds (a return, End now, a hand change — law B): their held lines leave in place, so a row the owner is typing
      // in keeps its focus; a new or changed hold redraws the open Settings (its held line and «End now»)
      const same = (a, b) => a && b && a.value === b.value && a.untilAt === b.untilAt && a.before === b.before;
      if (this._settingHolds.every((h) => same(h, was.find((x) => x.key === h.key)))) {
        for (const el of document.querySelectorAll('.settings-row-held[data-held]')) if (!this._settingHolds.some((h) => h.key === el.dataset.held)) el.remove();
      } else this._settingsUI?.redrawOpen?.();
    };
    this._loadSettingHolds = () => fetchJson('/api/setting-holds').then((d) => { if (d && Array.isArray(d.holds)) this._setSettingHolds(d.holds); });
    this.themeManager = new ThemeManager();
    this.ws = new WsManager();
    this.wm = new WindowManager(document.getElementById('workspace'));
    this.wm.app = this; // mediator back-ref (title-bar billing badge → switcher)
    this.wm._settings = this.settings;
    this.wm._app = this;
    installFormHost(this); // lane dialog-yield: a dialog with fields is a window of this manager, never a backdrop over the chat
    // Re-render all tab bars when tab wrap setting changes
    // Hook-card visibility: pure CSS toggle so flipping the setting applies
    // to every open chat instantly, both directions (no re-render).
    const applyHookVis = () => document.body.classList.toggle('hide-hook-cards', this.settings.get('chat.showHookCards') === false);
    applyHookVis();
    this.settings.on('chat.showHookCards', applyHookVis);
    // The CLI's "Stop hook error occurred" notice (every Stop-hook block, incl.
    // VibeSpace's own nudge) — hidden by default, one body class like the hook cards.
    const applyStopNoticeVis = () => document.body.classList.toggle('hide-stop-hook-notice', this.settings.get('chat.showStopHookErrorNotice') !== true);
    applyStopNoticeVis();
    this.settings.on('chat.showStopHookErrorNotice', applyStopNoticeVis);
    // VibeSpace's notes to the ASSISTANT (lane S3) — one body class, both
    // directions instantly; the fold pass reads the same class ('skip')
    const applyNoteVis = () => { document.body.classList.toggle('hide-assistant-notes', this.settings.get('chat.showAssistantNotes') === false); for (const v of this.sessions?.values?.() || []) v?._updateRuns?.(); };
    applyNoteVis();
    this.settings.on('chat.showAssistantNotes', applyNoteVis);
    // ACCESSIBILITY TREE SIZE (2.369.144, the owner's Windows freeze: Chrome's
    // browser UI thread spent 39.5 s in HandleAXEvents serialising a 27k-node
    // DOM into the accessibility tree because an assistive tool had the mode
    // on). Off ⇒ every chat message list is aria-hidden; new views read it too.
    // On ⇒ each view exposes only the reader's band (ChatView._syncAxExposure,
    // design-accessibility-tree §8) — re-derived here on the flip, so a list that
    // just lost its own attribute does not expose every rendered card until the
    // reader's next scroll. Both flips walk the SAME set — every list, through
    // its own view's backref (`_axView`): a sub-agent viewer is not in
    // app.sessions, so a sessions loop left its band un-derived on the ON flip.
    const applyAxExposure = () => {
      const off = this.settings.get('accessibility.exposeChat') === false;
      document.body.classList.toggle('ax-lean', off);
      for (const el of document.querySelectorAll('.chat-message-list')) {
        if (off) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
        el._axView?._scheduleAxSync?.('setting');
      }
    };
    applyAxExposure();
    this.settings.on('accessibility.exposeChat', applyAxExposure);
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
    this.stage = new StageManager(this); // dynamic desktop view (docs/design-dynamic-desktop.md)
    // NOTE: stage.init() (its SyncStore registration) runs AFTER initStateSync
    // below — calling it here dropped every slot/workspace write silently
    // (getStateSync() was still undefined; real report: the placeholder
    // "never moved" because the dragged slot never persisted).

    // Tag every new window with the active desktop ID
    const origCreateWindow = this.wm.createWindow.bind(this.wm);
    this.wm.createWindow = (opts) => {
      const win = origCreateWindow(opts);
      // Don't clobber a _desktopId set DURING creation: createWindow's tail
      // focus runs the stage materialization, whose identity adoption may
      // already have assigned the window's true home desktop.
      if (!win._desktopId && this.desktopManager.activeDesktopId) {
        win._desktopId = this.desktopManager.activeDesktopId;
      }
      return win;
    };

    this.wm.onWindowsChanged = () => {
      this.updateTaskbar();
      this.layoutManager.scheduleAutoSave();
      this._notifySidebarFocus();
      this._updateMobileNavTitle();
      this._syncInboxBadges?.(); // a window opened/closed/re-tabbed ⇒ its title-bar mini inbox badge (design-user-inbox-reply §3; coalesced)
    };
    this.sidebar = new Sidebar(this);

    // Load settings asynchronously (non-blocking — modules use defaults until loaded)
    this.settings.load();
    this._loadSettingHolds(); // lane setting-doors pick 2: the rows' standing holds (a For-you card's held line, a Settings row's «End now»)

    // B-225b (R4 / R7): a store the hub's start could not read is HELD — ONE strip says it past its silent rungs (the hub's
    // `store-held`; GET /api/stores/held at the boot and every reconnect); at its lift (`store-lifted`) each store's own reader fetches
    setStoreDoors({ importBackup: () => this._showTransferDialog?.('import'), rollback: () => this._showLayoutHistory?.() });
    // (the settings store imports nothing of the strip: suites load it bare) — a save a hold refused is SAID, the controls kept as left
    // («Not now» said ONCE a hold — each refused row says it at the row; a toast per change was noise)
    this.settings.onHeld = (h, o) => { noteStoreHeld(h); const once = h ? `${h.file}|${h.since}` : ''; if (o && o.refused && h && h.rung !== 'silent' && this._notNowSaid !== once) { this._notNowSaid = once; showToast(t('Not now — VibeSpace cannot read your settings right now; this change was not saved.'), { type: 'error' }); } };
    if (this.settings.held) noteStoreHeld(this.settings.held);   // a refusal its boot read met before this line
    // B-ddf3 unit 2 (r1407 (b)): a settings save is answered at the landing on this machine's CLI files — one that did not land is said by name
    this.settings.onCliConfig = (c) => { showToast(t("Saved in VibeSpace, but not yet in this machine's CLI files: {why}", { why: String((c && c.why) || '') }), { type: 'warn' }); };
    onStoreLift('settings.json', () => { try { this.settings.refetch(); } catch { } });
    onStoreLift('custom-themes.json', () => { try { this._loadCustomThemes(); } catch { } });
    onStoreLift('user-state.json', () => { try { this.sidebar?._fetchUserState?.(); } catch { } });
    refreshStoreHolds();
    this.ws.onGlobal((msg) => {
      if (msg.type === 'store-held') noteStoreHeld(msg);
      else if (msg.type === 'store-lifted') noteStoreLifted(msg.file);
      else if (msg.type === 'store-unsaved') noteStoreUnsaved(msg);   // B-225b's second half: a write the storage refused — kept, written again
      else if (msg.type === 'store-saved') noteStoreSaved(msg.file);
      else if (msg.type === 'store-stop-unsaved') noteStoreStop(msg);   // B-225b's remainder: what the last stop lost (or may have)
      else if (msg.type === 'store-stop-over') noteStoreStopOver();
    });
    // B-360d unit 3 (rank 9): THE HELD DIGEST, KEPT ONCE A PAGE — every jobs-updated carries it; each chat view seeds its chip
    // from here (one GET /api/jobs/held a page while none is kept), never from the whole jobs list
    this.jobsHeld = createHeldKeeper({ fetchJson });
    this.ws.onGlobal((msg) => this.jobsHeld.note(msg));
    this.ws.onStateChange((connected) => { if (!connected) this.jobsHeld.drop(); });   // a frame may be missed while away — the next seed asks

    // Sync settings from other clients via WebSocket
    this.ws.onGlobal((msg) => {
      if (msg.type === 'settings-updated' && msg.settings) {
        this.settings.applyRemote(msg.settings, { spend: msg.spend || null });   // r2: the server's in-force spend numbers ride the broadcast
      }
      if (msg.type === 'custom-themes-updated' && msg.themes) {
        this._applyCustomThemesFromServer(msg.themes);
      }
      if (msg.type === 'setting-holds' && Array.isArray(msg.holds)) this._setSettingHolds(msg.holds);   // lane setting-doors pick 2: a press, an «End now», a return
      if (msg.type === 'accounts-updated' && Array.isArray(msg.accounts)) {
        this._accounts = { ...(this._accounts || {}), accounts: accountRowsOf(withTails(msg)), ...accountDefaultsOf(msg), held: msg.held || null, answered: true };   // r3129 (2): the push's `held` — the lift ends the banner on every open page, and a page that never fetched during the hold learns it
        // B-ba7d: the push carries no key tail — the person's last read is laid on, and asked again (coalesced: one ask in flight) — a
        // key added, a key replaced, a provider re-keyed: the next draw reads the new tail, never the old one. ONE ask a tails
        // generation: the push carries its word; the roster's refresh below takes this read (B-ee0a smalls)
        askTails(msg.tailsGen).then(() => { if (this._accounts && Array.isArray(this._accounts.accounts)) this._accounts = { ...this._accounts, accounts: withTails({ accounts: this._accounts.accounts }).accounts }; try { this._agentsRefreshHook?.(); } catch {} try { this._usageNow?.(); } catch {} });   // B-ee0a: the usage tips redraw with the read too // every harness's default field (agent-meta) + the providers' rows (lane lg-providers U5)
        // Live-re-render an OPEN Manage Agents surface — without this the
        // roster only updated on the next manual reopen, so adding an account
        // (esp. one never logged in) left the page unchanged (inc-msl890ua).
        try { this._agentsRefreshHook?.(); } catch {}
        try { this._usageNow?.(); } catch {} // lane account-reset-door: a reset claim / a settled one moved the readings — every device redraws them now
      }
      // agent browser P1: the profile registry digest (every commit broadcasts it — the multi-client law)
      if (msg.type === 'browser-profiles-updated') this._onBrowserProfilesUpdated(msg);
      if (msg.type === 'browser-takeovers-updated') this._onBrowserTakeoversUpdated(msg); // lane browser-takeover-queue: the queue (every surface reads the one copy)
      if (msg.type === 'pool-auto-switched' && Array.isArray(msg.affected)) {
        // B-6217 v2 auto+COLD: the server re-pointed a pool and picked THIS
        // client (exactly one) to restart the affected conversations — every
        // client acting would race duplicate resumes.
        for (const sess of msg.affected) { try { this._poolColdRestart(sess, msg.poolId); } catch {} }
      }
      // B-f698: a conversation exited unexpectedly while working and the server picked THIS client (exactly one)
      // to resume it once — the sidebar Resume's own path; nothing is sent into it (src/server/unexpected-exit.js)
      if (msg.type === 'unexpected-exit-respawn' && msg.session) { try { this._respawnAfterExit(msg.session); } catch {} }
      if (msg.type === 'layout-restored') {
        // Another client restored a rollback point. Without this our stale
        // in-memory layout would be written back on the next window change,
        // silently undoing the restore (adversarial review).
        // lane phone-dock-restore: the broadcast reaches the page that ASKED too (measured: it said «…on another device» above its
        // own «Layout restored») — that page's press says it and reloads (setup-flows `_layoutRestoring`). r2 (P4): ITS OWN is the
        // broadcast that names its rid (r3: the hub's word that it landed — the press says it and reloads, whatever becomes of
        // its POST); another during its press is another device's — said, the reload left to the press (a refused one keeps
        // its error on screen; the hub's staleness gate holds this page's next write)
        const own = this._layoutRestoring;
        if (own && msg.rid && msg.rid === own.rid) { if (msg.unsaved) { noteStoreUnsaved(msg.unsaved); own.unsaved(msg.unsaved); } else own.landed(); return; }   // B-225b's second half: a restore whose write the storage refused is never «restored»
        if (own) { showToast(t('Layout restored on another device')); return; }
        showToast(t('Layout restored on another device — reloading…'));
        if (this.layoutManager) this.layoutManager._restoreReload = true; // the restore armed the reload: nothing of this page's leaves (layout.js _restoreArmed)
        setTimeout(() => location.reload(), 900);
        return;
      }
      if (msg.type === 'session-vcs' && msg.cwd) {
        // A push/commit/merge/rebase the agent reported (design-unknown-records,
        // 2026-09-21): every open File Explorer whose current directory is that
        // cwd or under it re-lists — a rebase or merge changes the tree it shows.
        // The card's git chip rides active-sessions; nothing is auto-opened.
        const root = String(msg.cwd).replace(/\/+$/, '');
        for (const [, win] of this.wm.windows) {
          const ex = win._explorer;
          if (!ex || !ex.currentPath || ex._disposed) continue;
          if ((ex._host || null) !== (msg.host || null)) continue;
          const cur = String(ex.currentPath).replace(/\/+$/, '');
          if (cur === root || cur.startsWith(root + '/')) { try { ex.navigate(ex.currentPath); } catch {} }
        }
      }
      if (msg.type === 'held-lists') applyHeldLists(msg.lists, msg);   // B-f276 family unit B: the set of held lists changed (the chip, the system panel's section)
      if (msg.type === 'server-notice' && msg.text) {
        // Probe-reported condition (2.226.0): server-side silent failures now
        // surface as toasts (+ notification history) instead of dying in the
        // server log. Key-deduped server-side, once per boot per issue.
        // i18n (2026-09-28): a notice that carries {key, params} is worded by THIS device's t(); `text` is the English
        // (+ an optional `then: {key}` sentence after it — the pin notices' "Restarting the conversation to apply it.")
        // a param may be WORDS (`{key, params}` — a row's label): said in this language before the sentence fills (lane setting-doors pick 2)
        const said = (ps) => Object.fromEntries(Object.entries(ps || {}).map(([k, v]) => [k, v && typeof v === 'object' && typeof v.key === 'string' ? t(v.key, v.params || undefined) : v]));
        showToast(msg.i18n && msg.i18n.key ? t(msg.i18n.key, said(msg.i18n.params)) + (msg.i18n.then && msg.i18n.then.key ? ' ' + t(msg.i18n.then.key, msg.i18n.then.params || {}) : '') : msg.text, { type: msg.level >= 2 ? 'error' : undefined });
      }
      if (msg.type === 'sysinfo-alert') {
        // Event-loop degradation (2.235.0): the "everything is slow but CPU
        // looks fine" state — surface it the moment it happens instead of
        // being diagnosed from telemetry after the fact.
        if (msg.kind === 'evloop') {
          showToast(
            t('The server is degraded — its main thread is saturated ({lag}ms median lag). Everything will feel slow; sessions are NOT dead.', { lag: msg.lagMs }),
            { type: msg.level >= 2 ? 'error' : undefined },
          );
          return;
        }
        // Memory pressure (2.216.0, userL's OOM kill): warn BEFORE the
        // kernel kills the pod (which takes every dtach session with it).
        this.sidebar?._railSysBadge?.(msg.pct);
        const top = (msg.procs || [])[0];
        const topStr = top ? ` ${t('Top consumer:')} ${Math.round(top.rss / 1048576)}MB ${(top.cmd || '').slice(0, 48)}` : '';
        showToast(
          t('Memory at {pct}% of the container limit — an OOM kill would end EVERY session.', { pct: msg.pct }) + topStr,
          { type: msg.level >= 2 ? 'error' : undefined },
        );
      }
    });

    // Anthropic accounts (subscription ↔ API key, per-session billing identity)
    this._accounts = { accounts: [], ...accountDefaultsOf(null), subscription: {}, cliKey: {} };
    this.refreshAccounts();
    this.refreshBrowserProfiles(); // agent browser P1: null when the server has no keeper ⇒ every pin surface hides itself
    this.refreshBrowserTakeovers(); // lane browser-takeover-queue: the requests waiting for the person (the Agent browser window, the rail, the live views)

    // Load custom themes from server
    this._loadCustomThemes();

    this._setupToolbar();
    this._setupDialogs();
    this._homeFacts = new Promise((r) => { this._homeFactsSeen = r; }); // B-7959: the answer the tour's first screen counts its steps from
    this._setupWelcome();
    this._setupGlobalSettings();
    this._setupChromeContextMenus();
    if (!this.isMobile) { installSessionPalette(this); this._paletteInstalled = true; } // a phone boot installs it at its first switch to the desktop class
    // THE document-level keybinding dispatcher for registry chords
    // (contributions.js registerKeybinding, Plugin Ph1): ONE bubble-phase
    // listener bound for the app's lifetime under an AbortController. Core
    // shortcuts keep their own capture listeners (command-mode.js /
    // session-palette.js say why); plugin bindings ride this one.
    this._contribCtl = new AbortController();
    installKeybindings(document, { signal: this._contribCtl.signal, getCtx: () => ({ app: this }) });
    // split tabs v2: Ctrl+Shift+PageUp / PageDown move the active tab within its
    // list (the commands live in command-mode.js). Inert unless the active
    // window is in a ≥2-tab group — the browser keeps the chord otherwise; a
    // terminal lets it through only then (terminal.js's key handler).
    const inGroup = () => { const w = this.wm.windows.get(this.wm.activeWindowId); return !!(w && w._tabChain && w._tabChain.tabs.length >= 2); };
    registerKeybinding({ key: 'ctrl+shift+pageup', command: 'chain.moveTabLeft', when: inGroup, inTerminal: true, signal: this._contribCtl.signal });
    registerKeybinding({ key: 'ctrl+shift+pagedown', command: 'chain.moveTabRight', when: inGroup, inTerminal: true, signal: this._contribCtl.signal });
    this._setupGridConfig();
    this._setupLayoutManager();
    this._setupUsage();
    installUserTodos(this); // global "For you" inbox (agent-filed user TODOs)
    this._initMaintenanceBanner(); // operator-onsite transparency strip
    this._initThrowawayBanner(); // B-ba47 shape H: a copy run from a git worktree says so on its first screen
    this._commandMode = new CommandMode(this, this.settings);

    // Listen for editor open/close requests (from editor-helper.sh via server HTTP→WebSocket)
    // the instance's public address can flip while the tab is open (Ports
    // panel → This VibeSpace): every link helper reads it live, no reload
    this.ws.onGlobal((msg) => { if (msg.type === 'instance-url') setInstanceUrl(msg.status?.effectiveUrl || null); });
    this.ws.onGlobal((msg) => { if (msg.type === 'available-models-dirty') refreshAvailableModels(); }); // one signal = one re-read
    // lane agy-models-report: a CLI that reported its own models for an account — every OPEN menu re-reads ONCE, with no
    // `list` (that re-read can never start another listing): the New Session field here, a chat's menu (chat-status-bar)
    this.ws.onGlobal((msg) => {
      if (msg.type !== 'available-models-dirty' || !msg.backend) return;
      if ((document.getElementById('input-backend')?.value || 'claude') === msg.backend) this._refreshModelMenu?.();
      try { window.dispatchEvent(new CustomEvent('vs-available-models-dirty', { detail: { backend: msg.backend, account: msg.account || null } })); } catch { }
    });
    // …and its «Sign in to …» door (the New Session field's line, a chat's menu): a named account's own «Sign in again»; the
    // machine's own login — the resume bar's re-login door (Manage agents, where that login's button is)
    window.addEventListener('vs-cli-models-sign-in', (e) => { const d = e.detail || {}; if (d.account && d.account !== 'machine') this._signInHomeAccount?.(d.backend, d.account); else this.openResumeAccountDoor?.({ kind: 'relogin', accountId: null }); });
    // S9: a harness capability verified at runtime (opencode fork = the serve
    // OpenAPI evidence, probed lazily AFTER this client's /api/home) reaches
    // every open client — the sidebar's Fork row reads BACKEND_META caps
    this.ws.onGlobal((msg) => {
      if (msg.type !== 'harness-caps-updated' || !msg.backend || !msg.caps || !BACKEND_META[msg.backend]?.caps) return;
      Object.assign(BACKEND_META[msg.backend].caps, msg.caps);
      try { this.sidebar?._render?.(); } catch {}
    });
    // S9 (2.369.50): a harness STORE that broke — the opencode serve parked
    // after crashes or stopped as a runaway — must reach the user, not just
    // the journal. The reason rides BACKEND_META (user actions quote it) and
    // a NEW park toasts once.
    this.ws.onGlobal((msg) => {
      if (msg.type !== 'harness-store-updated' || !msg.backend || !BACKEND_META[msg.backend]) return;
      const prev = BACKEND_META[msg.backend].storeReason || null;
      BACKEND_META[msg.backend].storeReason = msg.reason || null;
      if (msg.service !== undefined) BACKEND_META[msg.backend].service = msg.service || null;
      if (msg.reason && msg.reason !== prev) showToast(`${BACKEND_META[msg.backend].label || msg.backend}: ${msg.reason}`, { type: 'error' });
      try { this.sidebar?._render?.(); } catch {}
    });
    // S9 remainder (B-eac2): a conversation was rolled back / restored, or an
    // ask was answered, on THIS or another client. Persistent state changed →
    // every browser must see it without a refresh (multi-client law): the
    // session list carries the new roll-back state, and any open window on
    // that conversation says what happened in-line.
    this.ws.onGlobal((msg) => {
      if (msg.type !== 'opencode-updated') return;
      try { this.sidebar?._poll?.(); } catch {}
      for (const view of this.sessions?.values?.() || []) {
        if (!view?.noteOpencodeChange) continue;
        try { view.noteOpencodeChange(msg); } catch {}
      }
    });
    // A harness's background service is controlled by a built-in PLUGIN
    // (opencode → 'opencode-serve'): enable/disable/"asked once" are instance
    // state, so every client learns them from the same broadcast (multi-client
    // law) and the sidebar's "history is hidden" row follows.
    followFocus(); // lane voice-follows-focus (the owner: 「编辑或者拒绝 Agent 要发的消息」 had no Dropline): ANY text field the person focuses gets the microphone — ONE document focusin, the PURE predicate src/voice-focus.js decides
    this.ws.onGlobal((msg) => {
      if (msg.type === 'plugins-updated') noteVoicePlugins(msg.plugins); // voice input off / no Dropline ⇒ no microphone on any box
      if (msg.type !== 'plugins-updated' || !msg.services) return;
      let changed = false;
      for (const meta of Object.values(BACKEND_META)) {
        if (!meta.servicePlugin) continue;
        const s = msg.services[meta.servicePlugin];
        if (s === undefined) continue;
        meta.service = s || null;
        changed = true;
      }
      if (changed) { try { this.sidebar?._render?.(); } catch {} }
    });
    // lane e2a (design-agent-browser-v2 §E2.1 Placement, D3): the agent's own desktop-app browser opens BESIDE its chat —
    // only on a client that has that chat, through lane F's split door. lane agent-window-no-steal (THE PERSON'S SIDE of D3:
    // an agent's action may PLACE a window; only a person's action may FOCUS one — PURE agentWindowPlacement): placed quiet
    // (never focused, no desktop switch), its taskbar entry pulses; Settings → Desktop apps → "Agent-opened windows come to
    // the front" (default OFF) is D3's old front + focus. lane agent-window-no-pop: beside ONLY where the person looks at
    // that chat, on the chat's desktop when it is another one — else `card`: no window, the chat's badge (its window chip
    // and the launcher's running list open it)
    this.ws.onGlobal((msg) => {
      if (msg.type !== 'desktop-app-opened') return;
      const p = this.agentPlacement(msg);
      if (p.act === 'none') return;
      if (p.act === 'card') { this.wm.markArrived(p.fromWin); return; } // nothing moves on the desk the person is using
      if (p.focus) { if (p.act === 'beside') this.openDesktopApp(msg.appId, { intoChain: this.linkPlacement(p.fromWin) }); else this.openDesktopApp(msg.appId); return; }
      const w = this.openDesktopApp(msg.appId, { intoChain: p.act === 'beside' ? this.linkPlacement(p.fromWin) : undefined, quiet: true });
      if (!w) return;
      if (p.act === 'desk') this.desktopManager?.moveWindowToDesktop(w.id, p.deskId); // created on the chat's desktop: hidden there, no switch
      else if (!w._tabChain) this.wm.placeBehind(w.id); // a free window goes under the active one (a chain guest is drawn by the chat's frame, which keeps its place)
      if (p.badge) this.wm.markArrived(w.id);
    });
    // lane e2a r3 (verify r1 #3/#10): its conversation ended while the user drives / views it — it waits, and says so once here
    this.ws.onGlobal((msg) => {
      if (msg.type !== 'desktop-app-ending' || !msg.appId) return;
      if ([...this.wm.windows.values()].some((w) => w._desktopAppId === msg.appId)) showToast(t('The conversation that opened this browser ended — it closes when you leave'), { duration: 10000 });
    });
    this.ws.onGlobal((msg) => {
      if (msg.type === 'editor-open' && msg.filePath && msg.signalPath) {
        this._openExternalEditor(msg.filePath, msg.signalPath, msg.sessionId, msg.host);
      } else if (msg.type === 'editor-close' && msg.signalPath) {
        this._closeExternalEditor(msg.signalPath);
      }
    });

    listenVaultDoor(this); // B-6f65: the vault's door is heard from here on — before /api/home, whatever app.ready waits for
    fetch('/api/home').then(r => {
      if (r.status === 401) { location.href = '/login'; throw new Error('unauthorized'); }
      return r.json();
    }).then(d => {
      document.getElementById('input-cwd').placeholder = d.home;
      this._localHome = d.home; // restored as the cwd hint when host → Local (B-0d70)
      setHubZone(d.zone);
      setPageZone(pageZone(this)); setStampFormatter(when);   // lane ui-language: every time a surface prints, in the page's zone
      this._authEnabled = !!d.authEnabled;
      this._settingsUI?.redrawOpen?.();   // lane setting-doors f1: Settings › Spending's «Sign-in is off» line follows the flag (it may have drawn before this answer)
      this._ssoEnabled = !!d.ssoEnabled; // Clerk SSO on → password step/import ignored
      this._homeFactsSeen?.(true); // B-7959: whether this workspace is protected is known now
      initVault(this); // THE VAULT (lane vault-e2e-password): locked ⇒ the unlock modal now, behind the sign-in this page just passed
      initHeldLists(this); // B-f276 family unit B: the held lists' first read (then the hub's `held-lists` broadcast)
      this._repoDir = d.repoDir || null; // server install dir (⚙ self-update)
      this._publicUrlDefault = d.publicUrlDefault || null; // cluster-injected agentd.publicUrl default (settings placeholder)
      setInstanceUrl(d.instancePublicUrl || null); // the address every "link to something here" helper uses (utils.absUrl)
      // the Settings window's `when: { harness }` fact (settings-view.js): the harnesses whose CLI resolved here (`cli`)
      if (Array.isArray(d.harnesses)) this._harnessesHere = new Set(d.harnesses.filter((h) => h && h.cli !== false).map((h) => String(h.id)));
      for (const h of Array.isArray(d.harnesses) ? d.harnesses : []) { // ACP harnesses (S8): offered only where their CLI is installed
        // A CONTRIBUTED harness ships its settings table (design-harness-settings
        // §7): derive its Settings section here, exactly like a built-in's.
        if (h.settings) { try { registerHarnessSettings(h.id, h.settings); } catch (e) { console.warn('[harness-settings]', h.id, e.message); } }
        const opt = document.querySelector(`#input-backend option[value="${CSS.escape(String(h.id))}"]`);
        if (opt) opt.hidden = !h.installed;
        // S9: runtime-verified caps (opencode fork = the serve OpenAPI evidence) replace the shipped guess
        if (h.caps && BACKEND_META[h.id]?.caps) Object.assign(BACKEND_META[h.id].caps, h.caps);
        if (BACKEND_META[h.id]) {
          BACKEND_META[h.id].storeReason = h.storeReason || null; // a parked/runaway store carries WHY (2.369.50)
          if (h.service !== undefined) BACKEND_META[h.id].service = h.service || null; // the control plugin's state (opencode-serve, default OFF)
          // passive surface: a park that happened while no client was connected
          // must still be seen on the next page load (one toast per reason)
          if (h.storeReason && !(this._storeReasonShown ||= new Set()).has(h.id + ':' + h.storeReason)) {
            this._storeReasonShown.add(h.id + ':' + h.storeReason);
            showToast(`${BACKEND_META[h.id].label || h.id}: ${h.storeReason}`, { type: 'error' });
          }
        }
      }
    }).catch(() => { this._homeFactsSeen?.(false); }); // B-7959 r2: a failed answer ends the tour's wait at once (never the whole bound)

    // Initialize unified state sync (server-persisted, versioned diff broadcast, reconnect recovery)
    initStateSync(this.ws);
    this.stage.init(); // stage SyncStore — must follow initStateSync (see constructor note)
    installPluginClient(this); // Plugin Ph2: contributed iframe windows register as window types (needs ws for live updates)

    // Restore layout after WebSocket is connected (needs active sessions)
    this.ready = new Promise(resolve => {
      setTimeout(async () => {
        // B-0ece: restore only once the server is ready for a page (GET /api/boot) — a page opened mid-boot
        // says "VibeSpace is starting…" and loads by itself; gave up = the splash shows the reason + Reload
        if (!await awaitBootReady()) return;
        await this.layoutManager.loadAutoSave();
        resolve();
      }, 1500);
    });

    // THE RECONNECT QUEUE (perf lane ⑤b, inc-mtndq0vb's third layer): a
    // SUSPENDED ChatView (hidden desktop / mobile inactive / tab guest /
    // minimized) waits for a slot instead of re-attaching in the same tick as
    // every other window; displayed views attach at once. Slot order = the
    // active desktop first, then the other desktops in their order, windows in
    // their order within one (reconnect-queue.js; delays = view-visibility's
    // PURE reconnectSlot). A drop resets it — the next pass supersedes.
    this._reconnectQueue = createReconnectQueue({ rankOf: (view) => this._reconnectRank(view), pageInFlight: () => this.ws?.attachesInFlight?.() ?? 0 });   // B-a26e r4686: a held window's retry waits under the page's cap of attaches in flight

    // Re-attach all terminal sessions on reconnect (chat sessions handle their own)
    this.ws.onStateChange((connected) => {
      if (!connected) { this._reconnectQueue.reset(); return; }
      this._checkBundleFreshness(); // stale-bundle tab after a server update → one-shot reload
      if (!this._vncAvailable) this._probeVncAvailability(); // may have failed during a restart-window page load
      // Broadcast-only stores go stale across an outage — refetch once per
      // reconnect (2.219.0 audit: maintenance banner + settings missed
      // changes made while this tab was disconnected)
      fetchJson('/api/maintenance').then((m) => { if (m) this._renderMaintenance?.(m); }).catch(() => {});
      try { this.refreshAccounts?.(); } catch { }   // B-ee0a (its delta read): an accounts push missed while away — the list's word decides whether the tails are asked again
      try { this.settings?.refetch?.(); } catch {}
      try { this._loadSettingHolds?.(); } catch {} // lane setting-doors pick 2: the holds are a broadcast-only mirror too
      refreshStoreHolds();   // B-225b R7: a hold said — or lifted — while this page was away (its word never arrives)
      refreshHeldLists().catch(() => { });   // B-f276 unit B (r3212 must 1): the held lists re-read at every reconnect — a lift's one broadcast may have gone out while this page was away
      // user-state too (2.223.4 — the userW names/stars/archives blackout):
      // a boot-time fetch that failed during a restart window left the tab
      // permanently stateless; reconnect re-applies the authoritative copy.
      try { this.sidebar?._fetchUserState?.(); } catch {}
      // Task Groups + session statuses are ALSO broadcast-only mirrors: an
      // agent's vibespace-status/vibespace-task writes and another client's
      // group edits during the outage never arrive, so the board and the
      // status chips render stale state as current until a full reload (and a
      // boot fetch lost to a restart window leaves _tasksLoaded false, which
      // pins task-detail windows on "Loading task…" forever).
      try { this.sidebar?._fetchTasks?.(); } catch {}
      try { this.sidebar?._fetchStatuses?.(); } catch {} // generation-guarded: an answer older than a status frame that landed meanwhile is dropped (lane-redact verify r6)
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

    // Desktop (noVNC) availability gates the ⚙ menu entry + toolbar button.
    // Probed at startup AND re-probed on every ws reconnect: a page that
    // loads during a server restart window gets a failed probe, and a
    // once-only check would hide the Desktop feature for the whole page
    // session (real report — userW onboarded mid-update, "desktop功能直接
    // 被禁用"; F5 was the only cure).
    this._probeVncAvailability();
    installDesktopAppLauncher(this); // ⚙ row + toolbar Apps button + the launch dialog; probes /api/desktop/apps the same way
    installOpenWith(this); // §7.9: "Open with LibreOffice" — the explorer row's door, its menu verdict, the file-changed relay
    installDesignWindow(this); // lane design-window: the hub's `design-open` push opens / raises the window on a client showing that conversation

    // Mobile nav bar + gestures (only on mobile)
    this._mobileNav = this.isMobile ? new MobileNav(this) : null;
    // The phone's back gesture (lane mobile-back-guard): one sentinel history entry — a back closes the topmost panel like Esc,
    // at the sidebar home it arms 「再返回一次退出」. Phone only: a desktop browser's back stays the browser's.
    this._mobileBack = this.isMobile ? installMobileBack(this) : null;
    // THE PHONE'S FIRST SCREEN (lane phone-first-screen, design q-044 decision 5): after the boot's restore the phone opens
    // on the attention list (user-todos-panel.js `app.phoneHome`); an empty list leaves the restore's own screen
    if (this.isMobile) this.ready.then(() => this.phoneHome?.boot?.());
    // A CROSSING AT RUNTIME (lane duo-build-1): a fold / rotation across the phone line rebuilds the chrome a fresh load
    // at the new size would build — never a reload, never a frozen boot-time answer
    this._viewportSwitch = installViewportSwitch(this);
    // THE POSTURE LADDER (slice 4, SPEC-v3 §1.6): <html data-fold> from the six posture / segment media queries — a
    // half-fold arranges only on segments:2; and THE KEYBOARD from the visual viewport (slice 3, SPEC-v3 §7 / §5)
    this._foldLadder = installFoldLadder(this);
    this._keyboardInset = installKeyboardInset();
  }

  /** The viewport class this page shows: 'compact' (the phone page) | 'desktop' (src/viewport-class.js). */
  viewportClass() { return this._vc; }

  /** The reconnect queue's order key for a (suspended) ChatView: [desktop rank, window rank].
   *  Desktop rank 0 = the active desktop (a minimized window / tab guest the user is next to),
   *  then 1 + the desktop's index; window rank = the window's position in the manager's order
   *  (a tab guest sits at its own window's position). An unknown view sorts last. */
  _reconnectRank(view) {
    let winId = null;
    for (const [id, s] of this.sessions) if (s === view) { winId = id; break; }
    const wins = [...this.wm.windows.keys()];
    const wi = winId == null ? -1 : wins.indexOf(winId);
    if (wi < 0) return [1e6, 1e6];
    const win = this.wm.windows.get(winId);
    const dm = this.desktopManager;
    const desks = dm?.desktops || [];
    const d = win?._desktopId;
    const deskRank = !d || d === dm?.activeDesktopId ? 0 : 1 + Math.max(0, desks.findIndex((x) => x.id === d));
    return [deskRank, wi];
  }

  _updateMobileNavTitle() {
    if (this._mobileNav) this._mobileNav.updateTitle();
  }

  _setupToolbar() {
    document.querySelectorAll('.layout-btn[data-layout]').forEach(btn => btn.addEventListener('click', () => this.wm.applyLayout(btn.dataset.layout)));
    // lane toolbar-fold: every toolbar button runs its REGISTERED command — the same one its row in the toolbar's ⋯
    // runs when the button is folded (src/lib/toolbar-fold-model.js names them; Terminal's host picker lives in
    // toolbar-fold.js, anchored at whichever control was pressed)
    document.getElementById('btn-new-session').addEventListener('click', () => runCommand('session.new', { app: this }));
    document.getElementById('btn-file-explorer').addEventListener('click', () => runCommand('explorer.open', { app: this }));
    document.getElementById('btn-terminal').addEventListener('click', (e) => runCommand('toolbar.terminal', { app: this, anchor: e.currentTarget }));
    document.getElementById('btn-browser').addEventListener('click', () => runCommand('browser.open', { app: this }));
    document.getElementById('btn-desktop').addEventListener('click', () => runCommand('desktop.open', { app: this }));

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
      show('btn-desktop', s.get('toolbar.showDesktopButton') && this._vncAvailable);
      show('btn-desktop-apps', s.get('toolbar.showDesktopAppsButton') && this._desktopAppsAvailable);
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
                     'toolbar.showBrowserButton', 'toolbar.showFileExplorerButton', 'toolbar.showDesktopAppsButton',
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
      placeHeldChip(); // B-f276 family unit B: the held lists' chip beside For you, as the vault's
      placeVaultChip(); // lane vault-chip-zone-errors: the vault's lock chip follows For-you into whichever zone it now sits
      placeWarmthChip(); // lane cache-warmth-band: …and so does the warmth summary chip (nothing while there is none)
    };
    applyArr();
    this._applyChromeArrangement = applyArr; // a switch to the desktop class re-applies it (src/lib/viewport-switch.js)
    this.settings.on('chrome.arrangement', applyArr);
    this.settings.on('chrome.springs', applyArr);
    // lane toolbar-fold: after the arrangement — the fold reads the zones in their arranged order at every layout
    this._toolbarFold = installToolbarFold(this);
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
      // (the window list is an `overlap-switcher` [data-popover]; every class
      // named here is one the tree produces — test-taskbar-group §7's census)
      if (document.querySelector('.usage-popup:not(.hidden), [data-popover]')) return;
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
  // ── Maintenance banner (2.189.0): when an operator/support agent is
  // actively connected to this instance troubleshooting it, a persistent
  // amber strip says so (transparency for onsite debugging). Server state
  // survives restarts and auto-expires; the strip is a normal flex child of
  // #main-wrapper, so the workspace reflows proportionally under it.
  // ── Throwaway banner (B-ba47 shape H, the plan's (b)): a copy of VibeSpace run from a git worktree uses a home of its own —
  // the person's CLIs, logins and plugins are not there — so its FIRST screen says so, with the two doors as exact text: start
  // VibeSpace from the clone, or run this copy as the real install. One strip, the first child of #main-wrapper; nothing when
  // the hub is not re-homed.
  _initThrowawayBanner() {
    fetchJson('/api/throwaway').then((v) => {
      if (!v || !v.rehomed || document.getElementById('throwaway-banner')) return;
      const wrap = document.getElementById('main-wrapper');
      if (!wrap) return;
      const el = document.createElement('div');
      el.id = 'throwaway-banner';
      el.innerHTML = `<span class="tb-text">${escHtml(t('This copy of VibeSpace runs from a git worktree, so it uses a home of its own ({home}): your CLIs, logins and plugins are not here.', { home: v.home || '' }))}</span>`
        + (v.checkout ? `<span class="tb-door">${escHtml(t('To use your real install, start VibeSpace from your clone:'))} <code>${escHtml(v.checkout)}</code></span>` : '')
        + `<span class="tb-door">${escHtml(t('Or run this copy as your real install:'))} <code>${escHtml(`${v.overrideEnv || 'VIBESPACE_REAL_INSTALL'}=1`)}</code></span>`;
      wrap.insertBefore(el, wrap.firstChild);
    }).catch(() => {});
  }
  _initMaintenanceBanner() {
    const fmtT = (ts) => clockOf(ts);
    const render = (m) => {
      let el = document.getElementById('maintenance-banner');
      if (!m?.active) { el?.remove(); document.getElementById('mb-timeline')?.remove(); clearTimeout(this._maintTimer); return; }
      if (!el) {
        el = document.createElement('div');
        el.id = 'maintenance-banner';
        const wrap = document.getElementById('main-wrapper');
        if (!wrap) return;
        wrap.insertBefore(el, wrap.firstChild);
      }
      const since = m.since ? fmtT(m.since) : '';
      const ups = m.updates || [];
      const latest = ups[ups.length - 1] || null;
      el.innerHTML = `<span class="mb-ic">🛠</span><span class="mb-text">${escHtml(t('Maintenance: a support agent is connected to this instance for troubleshooting'))}`
        + `${m.message ? ' — ' + escHtml(m.message) : ''}`
        + `${since ? ` <span class="mb-since">(${escHtml(t('since {time}', { time: since }))})</span>` : ''}</span>`
        // live progress: the latest update line pulses in as it changes, so the
        // user SEES the troubleshooting move instead of a frozen banner
        + (latest ? `<span class="mb-update" data-ts="${latest.ts}">▸ ${escHtml(latest.text)} <span class="mb-since">${fmtT(latest.ts)}</span></span>` : '')
        + (ups.length > 1 ? `<button class="mb-log-btn" title="${escHtml(t('Show the full troubleshooting timeline'))}">${escHtml(t('{n} updates', { n: ups.length }))} ▾</button>` : '');
      // pulse only when the latest update actually CHANGED (rebuilds happen on
      // every broadcast — a steady pulse would be noise)
      const upEl = el.querySelector('.mb-update');
      if (upEl && latest && this._maintLastUpdTs !== latest.ts) {
        this._maintLastUpdTs = latest.ts;
        upEl.classList.add('mb-pulse');
        setTimeout(() => upEl.classList.remove('mb-pulse'), 1600);
      }
      el.querySelector('.mb-log-btn')?.addEventListener('click', () => {
        const old = document.getElementById('mb-timeline');
        if (old) { old.remove(); return; }
        const panel = document.createElement('div');
        panel.id = 'mb-timeline';
        panel.dataset.popover = '1'; // global Escape closes it
        panel.innerHTML = [...ups].reverse().map(u =>
          `<div class="mb-tl-row"><span class="mb-tl-time">${fmtT(u.ts)}</span><span>${escHtml(u.text)}</span></div>`).join('');
        el.appendChild(panel);
      });
      clearTimeout(this._maintTimer);
      if (m.until) this._maintTimer = setTimeout(() => render({ active: false }), Math.max(1000, m.until - Date.now()));
    };
    this._renderMaintenance = render; // reconnect refetch re-renders through this
    fetchJson('/api/maintenance').then((m) => { if (m) render(m); }).catch(() => {});
    this.ws.onGlobal((msg) => { if (msg.type === 'maintenance-updated') render(msg.maintenance); });
  }

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
      // Chrome elements are drag-movable BETWEEN the bars (customize mode), so
      // this bar must exempt the same element classes the taskbar does — a
      // preview/usage/taskbar-item dragged up here owns its own menu
      // (2.250.1, real report: right-clicking a desktop preview moved into the
      // toolbar showed "Customize UI…" instead of Rename/Delete).
      if (e.target.closest('button, select, input, .taskbar-item, .desktop-preview, .desktop-preview-wrapper, .taskbar-usage')) return;
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, [
        { label: t('Customize UI…'), action: () => this._customize.enter() },
        { separator: true },
        { label: check(t('Layout presets'), s.get('toolbar.showLayoutPresets')), action: () => s.set('toolbar.showLayoutPresets', !s.get('toolbar.showLayoutPresets')) },
        { label: check(t('Web view button'), s.get('toolbar.showBrowserButton')), action: () => s.set('toolbar.showBrowserButton', !s.get('toolbar.showBrowserButton')) },
        { label: check(t('Files button'), s.get('toolbar.showFileExplorerButton')), action: () => s.set('toolbar.showFileExplorerButton', !s.get('toolbar.showFileExplorerButton')) },
        { label: check(t('Sidebar on right'), s.get('sidebar.position') === 'right'), action: () => s.set('sidebar.position', s.get('sidebar.position') === 'right' ? 'left' : 'right') },
        { label: t('All settings\u2026'), action: () => this._settingsUI?.open() },
      ]);
    });
    // Extra rows (#toolbar-row2 / #taskbar-row2) are ZONES like the bars —
    // without their own handler a right-click there fell through to the
    // browser's native menu (real report). Same menu as their parent bar;
    // same movable-element exemptions.
    for (const [rowId, barId] of [['toolbar-row2', 'toolbar'], ['taskbar-row2', 'taskbar']]) {
      const row = document.getElementById(rowId);
      const bar = document.getElementById(barId);
      if (!row || !bar) continue;
      row.addEventListener('contextmenu', (e) => {
        if (e.target.closest('button, select, input, .taskbar-item, .desktop-preview, .desktop-preview-wrapper, .taskbar-usage')) return;
        e.preventDefault();
        e.stopPropagation();
        // re-dispatch onto the parent bar's handler for an identical menu
        bar.dispatchEvent(new MouseEvent('contextmenu', { clientX: e.clientX, clientY: e.clientY, bubbles: false, cancelable: true }));
      });
    }
  }

  _setupWelcome() {
    document.getElementById('welcome-new').addEventListener('click', () => this.showNewSessionDialog());
    document.getElementById('welcome-files').addEventListener('click', () => this.openFileExplorer(undefined, { attended: true }));   // B-23e5 (a): pressed
    this._maybeShowOnboarding();
  }

  // ── First-run onboarding wizard ──
  // Shown once per browser when this instance has no sessions yet (fresh
  // container / new user). Guides: what VibeSpace is → connect Claude/Codex
  // (live install/login status + one-click login) → first session.
  async _maybeShowOnboarding() {
    if (localStorage.getItem('vs-onboarded')) { maybeNagVault(); return; } // no tour ⇒ the vault's setup ask (while not set up)
    let hasSessions = false;
    try {
      const d = await fetchJson('/api/sessions');
      hasSessions = (d.sessions || []).length > 0;
    } catch {}
    if (hasSessions) { localStorage.setItem('vs-onboarded', '1'); maybeNagVault(); return; }
    // B-7959 (the day-one half): the tour's first screen counts its steps from whether this workspace is protected — a fact
    // only /api/home's answer carries. Drawn before it (/api/sessions answering first, a loaded hub), a protected pod showed
    // FOUR dots, then three at the next press: a flash on the first screen a new person sees. The first draw waits for that
    // answer, BOUNDED: a hub that has not answered in 3 s gets the screen with what is known, drawn again ONCE when it answers
    const known = await Promise.race([this._homeFacts, new Promise((r) => setTimeout(() => r(false), 3000))]);
    // r2: finished or opened meanwhile (⚙ → Welcome tour, another tab) — never opened a second time over it
    if (localStorage.getItem('vs-onboarded') || document.getElementById('welcome')?.classList.contains('onboarding')) return;
    this._showOnboarding();
    if (!known) this._homeFacts.then(() => this._obRedraw?.());
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
      s.tasks?.unread ? (() => { const row = document.createElement('div'); row.className = 'cfg-row cfg-row-held'; row.innerHTML = `<span class="cfg-row-text"><b>${escHtml(t('Task Groups'))}</b><span>${escHtml(t("Task Groups cannot be read right now, so this backup leaves them out — For you says why"))}</span></span>`; return row; })() : mkRow('tasks', t('Task Groups'), t('{count} group(s) incl. backlogs & activity logs', { count: s.tasks?.count || 0 })),   // THE STORE HELD UNREAD (lane bl-windows — the owner's rule: no greyed control with a hint): the hold as a LINE, no checkbox
      s.pricing?.unread ? (() => { const row = document.createElement('div'); row.className = 'cfg-row cfg-row-held'; row.innerHTML = `<span class="cfg-row-text"><b>${escHtml(t('Usage pricing table'))}</b><span>${escHtml(t('Your edited prices cannot be read right now, so this backup leaves them out — the Usage window says why'))}</span></span>`; return row; })() : mkRow('pricing', t('Usage pricing table'), t('{count} model rate(s) / account discount(s)', { count: s.pricing?.count || 0 })),   // r3748 should (lane bl-ci, r3145 unit 2): the prices HELD — a line, no checkbox, never «0 rates» (as Task Groups')
      mkRow('clientPrefs', t('This browser’s preferences'), t('theme, font, language, usage-view choices')),
    );
    const sensHead = document.createElement('div');
    sensHead.className = 'cfg-sens-head';
    sensHead.innerHTML = `<b>${t('Sensitive')}</b><span> — ${t('off by default; encrypted with a passphrase. The file lets anyone who has it (and the passphrase) log in / use your agent accounts. Treat it like a key.')}</span>`;
    const sensWrap = document.createElement('div');
    sensWrap.className = 'cfg-rows cfg-rows-sens';
    // lane ui-needs-a-button (gear-and-system-12): only what EXISTS is a row (a greyed row with «not configured» was a control
    // with a hint); nothing at all ⇒ one line; no VibeSpace password ⇒ that need with «Set a password…» on its line
    const sens = info.sensitive || {};
    const sensRows = [
      sens.vsPassword && mkRow('vsPassword', t('VibeSpace password'), t('password hash — same password works after import'), { checked: false }),
      sens.claudeCreds && mkRow('claudeCreds', t('Claude CLI credentials'), t('~/.claude/.credentials.json — no re-login on the new instance'), { checked: false }),
      sens.codexCreds && mkRow('codexCreds', t('Codex CLI credentials'), '~/.codex/auth.json', { checked: false }),
      sens.hosts && mkRow('hosts', t('Remote hosts'), t('{n} ssh host(s) + uploaded keys', { n: sens.hosts }), { checked: false }),
      sens.mounts && mkRow('mounts', t('S3 mounts & shares'), t('{n} mount(s) incl. credentials', { n: sens.mounts }), { checked: false }),
      sens.accounts && mkRow('accounts', t('Billing accounts'), t('{n} account(s) — API keys + subscription logins', { n: sens.accounts }), { checked: false }),
    ].filter(Boolean);
    if (sensRows.length) sensWrap.append(...sensRows);
    else sensWrap.append(Object.assign(document.createElement('div'), { className: 'cfg-sens-none chat-status-dim', textContent: t('There is no sensitive data to export right now.') }));
    // the B-f276 remainder (H15) meets lane ui-needs-a-button: a HELD machines list is SAID on its own line (no row: what is unread
    // does not exist to export) — never «no hosts», never silence
    if (!sens.hosts && sens.hostsUnread) sensWrap.append(needLine({ words: t('the paired machines cannot be read right now — an export now carries none'), tone: 'info', cls: 'cfg-sens-hosts-held' }));
    if (!sens.mounts && sens.mountsUnread) sensWrap.append(needLine({ words: t('the storage list cannot be read right now — an export now carries none'), tone: 'info', cls: 'cfg-sens-mounts-held' }));   // B-f276 family unit 1
    if (!sens.vsPassword && typeof this._showPasswordDialog === 'function') sensWrap.append(needLine({ words: t('No VibeSpace password is set.'), tone: 'info', cls: 'cfg-sens-pass', doors: [{ label: t('Set a password…'), kind: 'secondary', door: 'set-password', run: () => this._showPasswordDialog() }] }));
    const passRow = document.createElement('div');
    passRow.className = 'cfg-pass-row hidden';
    passRow.innerHTML = `<label>${t('Encryption passphrase')} <input type="password" id="cfg-exp-pass" placeholder="${t('min 4 chars')}" autocomplete="new-password"></label>` + (info.sensitive.secondPassword ? `<label class="cfg-second-row">${t('Second password (the vault)')} <input type="password" id="cfg-exp-second" autocomplete="off"></label>` : ''); // lane vault-contents-window r2: credentials leave a set-up vault only with the second password
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
          body: JSON.stringify({ sections, includeSensitive, passphrase, clientPrefs, ...(includeSensitive.length && info.sensitive.secondPassword ? { secondPassword: passRow.querySelector('#cfg-exp-second')?.value || '' } : {}) }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); err.textContent = d.code === 'TASK_GROUPS_UNREAD' ? t("Task Groups cannot be read right now — nothing was recorded. For you says why and what to do.") : (heldWordsOf(d) || credentialDoorWords(d) || d.error || t('Export failed')); return; }   // THE STORE HELD UNREAD: the page's own words
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
      head.textContent = t('Exported {date} — each selected section REPLACES the current data.', { date: file.exportedAt ? when(file.exportedAt, { full: true, words: true }) : t('(unknown date)') });
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
          // SSO on → an imported password is redundant (login goes through the
          // IdP) and is ignored on the server; disable the row + say why.
          const pwIgnored = id === 'vsPassword' && this._ssoEnabled;
          const sub = id === 'vsPassword'
            ? (pwIgnored ? t('ignored — this instance uses SSO login') : t('enables password auth; all other devices are logged out'))
            : t('written to this machine');
          row.innerHTML = `<input type="checkbox" data-sec="${id}"${pwIgnored ? ' disabled' : ''}>
            <span class="cfg-row-text"><b>${escHtml(SENS_LABELS[id] || id)}</b><span>${sub}</span></span>`;
          if (pwIgnored) row.style.opacity = '0.55';
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
          if (!res.ok && (d.code === 'EVSARCHIVEBUSY' || d.code === 'EVSARCHIVEFAILING')) { const failing = d.code === 'EVSARCHIVEFAILING', applied = (d.applied || []).map((k) => (SEC_LABELS[k] || [k])[0]).join(', '); err.textContent = applied ? (failing ? t("The Activity log's archive write keeps failing — the Task Groups were not imported (already applied: {applied}). Its entries are kept, and the write is retried.", { applied }) : t('The Activity log is still being written to its storage — the Task Groups were not imported (already applied: {applied}). Try again in a moment.', { applied })) : failing ? t("The Activity log's archive write keeps failing — nothing was imported. Its entries are kept, and the write is retried.") : t('The Activity log is still being written to its storage — nothing was changed. Try again in a moment.'); return; }   // B-0248 step 3 (c) (r2104, r2292): the archive's refusal in the page's words — held (busy) or failing; «applied» by the page's own section labels
          if (!res.ok) { err.textContent = d.code === 'TASK_GROUPS_UNREAD' ? t("Task Groups cannot be read right now — nothing was recorded. For you says why and what to do.") : (credentialDoorWords(d) || d.error || t('Import failed')); return; }
          if (d.clientPrefs) {
            for (const [k, v] of Object.entries(d.clientPrefs)) {
              if (CLIENT_PREF_KEYS.includes(k)) localStorage.setItem(k, v);
            }
          }
          // the machines a HELD hosts.json refused (`held`): the page's own sentence (its own: «nothing was changed» beside «Imported» would
          // read as the whole import), in the reader's language — long enough to read before
          // the reload; nothing else imported ⇒ said on the form's line, nothing reloads
          const heldSaid = [Array.isArray(d.held) && d.held.includes('hosts-unread') ? t('Your machines were not imported — VibeSpace cannot read its paired machines right now. Import them again in a few minutes.') : null,
            Array.isArray(d.held) && d.held.includes('storage_unread') ? t('Your storage was not imported — VibeSpace cannot read its storage list right now. Import it again in a few minutes.') : null,   // B-f276 family unit 1
            Array.isArray(d.held) && d.held.includes('accounts_unread') ? t('Your accounts were not imported — VibeSpace cannot read its accounts list right now. Import them again once it reads; For you says why.') : null].filter(Boolean).join(' ') || null;   // the B-f276 family (bl-windows, r3173): the accounts section held — said, never «Imported»
          if (heldSaid && !(d.applied || []).length) { err.textContent = heldSaid; return; }
          close();
          showToast([t('Imported: {sections} — reloading…', { sections: d.applied.join(', ') }), heldSaid].filter(Boolean).join(' '), heldSaid ? { type: 'warn', duration: 8000 } : undefined);
          setTimeout(() => location.reload(), heldSaid ? 8000 : 900);
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
  

  

  _refitAllTerminals() {
    for (const [, session] of this.sessions) {
      if (session.overrides && session.terminal) { // TerminalSession (ChatView has no .overrides)
        // rescale() = font size × the NEW UI scale (the container is counter-
        // zoomed, 2.369.118) + atlas clear + fit — a bare fit() would keep the
        // old glyph size and the terminal would shrink/grow by the scale delta.
        try { session.rescale(); } catch { try { session.fit(); } catch {} }
      }
    }
  }

  _setupGlobalSettings() {
    this._fontSize = parseInt(localStorage.getItem('termFontSize')) || 14;
    this._fontFamily = localStorage.getItem('termFontFamily') || getAvailableFonts()[0]?.value || 'monospace';
    this._settingsUI = new SettingsUI(this);
    this._customize = new CustomizeMode(this);

    const btn = document.getElementById('btn-global-settings');
    btn.onclick = (e) => { e.stopPropagation(); this._pressGlobalSettings(btn); };
    // UI scale re-apply on viewport resize (review F9): applyUiPrefs only ran
    // at boot + gs-menu change, so crossing the 768px mobile boundary either
    // stranded the saved scale (narrow-at-boot) or left the zoom active under
    // the mobile CSS (wide→narrow, 100vw sidebar × zoom = overflow).
    // cheap stamp on EVERY resize frame — chat scroll handlers read it to
    // tell drag-resize displacement from user scrolling (2.339.1 incident:
    // moving/resizing the Chrome window froze the page on the old ungated
    // extends; the stamp keeps the new gates closed for the whole drag)
    window.addEventListener('resize', () => { try { window.__vsViewportResizeAt = Date.now(); } catch { } }, { passive: true });
    let uiRz = null;
    window.addEventListener('resize', () => {
      clearTimeout(uiRz);
      uiRz = setTimeout(() => {
        const before = uiScale();
        applyUiPrefs();
        if (uiScale() !== before) this._refitAllTerminals();
      }, 250);
    });
  }

  /** The ⚙ press — the toolbar's and the phone nav's (lane vault-locked-loud): while the vault is LOCKED the unlock dialog
   *  first, then the menu as today once it closes; otherwise the menu at once. */
  _pressGlobalSettings(anchor) { unlockFirst(() => this._showGlobalSettings(anchor)); }

  _showGlobalSettings(anchor) {
    const pop = createPopover(anchor, 'global-settings-popover');
    const rect = drawnAnchorRect(anchor); // ⚙ folded into the phone's ⋯: from the bar, never a zero rect (lane phone-titlebar-title r5)
    pop.style.left = '';
    pop.style.top = ((rect.bottom + 4) / uiScale()) + 'px';
    pop.style.right = ((window.innerWidth - rect.right) / uiScale()) + 'px';
    // The whole popover is the 'gear' MENU REGISTRY rendered as a tree
    // (gear-menu.js holds the core rows as contributions; a plugin adds rows
    // through the same registerMenuItem({ menu: 'gear', … }) call). The
    // quick appearance controls that used to sit above the rows are the
    // "Appearance ▸" head's panel (src/lib/appearance-panel.js). Mobile
    // shares this menu — the renderer picks flyout vs accordion itself.
    pop.append(buildGearMenu(this, pop));
  }

  // Update-confirm dialog: every changelog entry between the RUNNING version
  // and the canonical repo's latest, then an explicit "Update now".
  async _showUpdateConfirmDialog() {
    const { body, close } = createModalShell({ id: 'update-confirm-dialog', title: t('Update VibeSpace'), bodyClass: 'update-confirm-body', minWidth: 'min(560px, 92vw)', escapeToClose: true, kind: 'decision' }); // decision: a consent — update now or not (the page reloads after); nothing to fill
    body.innerHTML = `<div class="empty-hint">${t('Checking for updates\u2026')}</div>`;
    // The changelog in the DEVICE's language (the same value `vibespace.lang`
    // resolves to); an entry the canonical has not translated comes in English.
    const [v, cl] = await Promise.all([fetchJson('/api/version?fresh=1'), fetchJson(`/api/changelog-diff?fresh=1&lang=${encodeURIComponent(resolveLang())}`)]);
    if (!body.isConnected) return;
    const cur = v?.version || cl?.current || '?';
    const entries = cl?.entries || [];
    // /api/version's `latest` and the changelog are fetched+cached SEPARATELY —
    // their stamps can disagree (real report: badge said "latest" while the
    // list showed the next version's entries). The newest changelog entry
    // carries a version too; trust whichever source is newer.
    const newestEntry = entries[0]?.version || null;
    let latest = v?.latest || cl?.latest || null;
    if (newestEntry && (!latest || this._versionNewer(newestEntry, latest))) latest = newestEntry;
    const newer = latest && this._versionNewer(latest, cur);
    const atLatest = !newer;
    // Already on latest: show the current version's own changelog (server
    // returns it) under a "what's in this version" heading (user request).
    body.innerHTML = `
      <div class="ucl-head">${escHtml(newer ? `v${cur} \u2192 v${latest}` : `v${cur}`)}${
        newer ? `<span class="gs-ver-new ucl-newtag">${t('Update available')}</span>`
              : `<span class="ucl-newtag ucl-latesttag">${t('Latest version')}</span>`}</div>
      ${atLatest && entries.length ? `<div class="ucl-sub">${t('What’s in this version:')}</div>` : ''}
      <div class="ucl-list"></div>
      <div class="dialog-actions">
        <button type="button" class="mounts-btn" data-act="cancel">${t('Close')}</button>
        <button type="button" class="btn-create" data-act="go">${newer ? t('Update now') : t('Re-run update')}</button>
      </div>`;
    // Each entry as a list (text nodes only — the file comes off the network):
    // `v<version> — <date>`, a small heading per
    // section, a list item per bullet; any other line (an old-format entry, an
    // intro) a plain paragraph — never a <pre> wall.
    const listEl = body.querySelector('.ucl-list');
    if (entries.length) for (const e of entries) listEl.append(changelogEntryEl(e));
    else { const hint = document.createElement('div'); hint.className = 'empty-hint'; hint.textContent = t('No changelog details available.'); listEl.append(hint); }
    body.querySelector('[data-act=cancel]').onclick = () => close();
    body.querySelector('[data-act=go]').onclick = () => {
      close();
      this._runSelfUpdate();
    };
  }

  // UI-driven self-update (user directive: no more "terminal opens, runs for
  // a while, then just sits there"). The update runs as a detached server op;
  // this dialog streams its log, survives the service restart by polling
  // /api/version, and reloads the page once the new version answers.
  async _runSelfUpdate() {
    // one subject: the update this hub runs — one at a time
    const { body, raised } = createModalShell({ id: 'self-update-dialog', title: t('Updating VibeSpace'), escapeToClose: false, kind: 'form' });
    if (raised) return;   // raised: the same subject's form, as it was // (no Escape: the update runs on — the page reloads by itself when it is up)
    body.innerHTML = `
      <div class="selfupd-phase"><span class="upload-active-spinner" aria-hidden="true"></span><span class="su-msg">${escHtml(t('Starting update…'))}</span></div>
      <pre class="selfupd-log"></pre>
      <div class="mounts-field-hint">${escHtml(t('Sessions keep running (dtach) — the page reloads by itself when the new version is up.'))}</div>
      <div class="dialog-actions"><button type="button" class="mounts-btn su-reload" style="display:none">${escHtml(t('Reload now'))}</button></div>`;
    const phaseEl = body.querySelector('.su-msg');
    const spinEl = body.querySelector('.upload-active-spinner');
    const logEl = body.querySelector('.selfupd-log');
    const reloadBtn = body.querySelector('.su-reload');
    reloadBtn.onclick = () => location.reload();
    const setPhase = (msg, cls) => { phaseEl.textContent = msg; if (cls) { phaseEl.className = 'su-msg ' + cls; spinEl?.remove(); } };
    const ver = () => fetchJson('/api/version?t=' + Date.now()); // cache-bust so a restart is actually observed
    const startVersion = (await ver())?.version || null;
    const r = await fetchJson('/api/self-update', { method: 'POST' });
    if (!r?.success) { setPhase(r?.error || t('Failed'), 'ob-bad'); return; }
    const t0 = Date.now();
    let done = false, wasDown = false, restartSeen = false;
    // B-0ece: the new server LISTENING is not the new server READY — reload only when its boot phase says so
    // (a page reloaded into a booting fleet server sat on the loading screen); the line counts the sessions back
    const reload = async (msg) => {
      done = true;
      const r = await waitServerReady({ ...bootDeps(), onStatus: (b) => setPhase(startingLine(b)), onRetry: (x) => setPhase(retryLine(x)) });
      if (!r.ok) { const why = reasonOf(r.fail); setPhase(t('The server did not answer {what} ({reason}) after {n} tries.', { what: r.url, reason: t(why.key, why.params), n: r.tries }), 'ob-bad'); reloadBtn.style.display = ''; return; }
      setPhase(msg, 'ob-ok'); setTimeout(() => location.reload(), 1200);
    };
    const tick = async () => {
      if (done || !body.isConnected) return;
      const st = await fetchJson('/api/self-update/status');
      const v = await ver();
      if (st?.log) {
        logEl.textContent = st.log.replace(/__UPDATE_EXIT:\d+\s*$/, '');
        logEl.scrollTop = logEl.scrollHeight;
        if (/restarting/i.test(st.log)) restartSeen = true;
      }
      const exitM = /__UPDATE_EXIT:(\d+)/.exec(st?.log || '');
      // Failure first — a non-zero exit means the build/pull broke; stop.
      if (exitM && exitM[1] !== '0') {
        done = true; setPhase(t('Update failed (exit {code}) — see the log below', { code: exitM[1] }), 'ob-bad');
        reloadBtn.style.display = ''; return;
      }
      // The server going unreachable then reachable again IS the restart —
      // the robust signal that new code is serving (works even when the
      // version number is unchanged, e.g. re-running update on the latest).
      if (!v) { wasDown = true; setPhase(t('Restarting the service…')); }
      else if (startVersion && v.version !== startVersion) { reload(t('Updated to v{v} — reloading…', { v: v.version })); return; }
      else if (v && (wasDown || (restartSeen && exitM && exitM[1] === '0'))) { reload(t('Update complete — reloading…')); return; }
      // Finished, exit 0, but no restart happened at all (no service manager
      // branch of update.sh) — nothing to reload onto; just confirm.
      else if (exitM && exitM[1] === '0' && !restartSeen && Date.now() - t0 > 8000) {
        done = true; setPhase(t('Already up to date (v{v})', { v: v?.version || startVersion }), 'ob-ok'); return;
      }
      if (Date.now() - t0 > 10 * 60 * 1000) {
        done = true; setPhase(t('Timed out — check the log below or data/update.log on the server'), 'ob-bad');
        reloadBtn.style.display = ''; return;
      }
      setTimeout(tick, 900);
    };
    tick();
  }
  /** Is semver a newer than b? (plain x.y.z compare) */
  _versionNewer(a, b) {
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return true;
      if ((pa[i] || 0) < (pb[i] || 0)) return false;
    }
    return false;
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
    // Save to server. A dropped failure silently never created the button and
    // the "saved" preset was gone on the next load.
    try {
      const data = await api('/api/custom-grids', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, cols }),
      });
      this._customGrids = data?.customGrids || [];
      this._renderCustomGridButtons();
    } catch (e) {
      showToast(t('Could not save the grid preset — {reason}', { reason: e?.message || t('server unreachable') }), { type: 'error' });
    }
  }

  async _removeCustomGrid(rows, cols) {
    try {
      const data = await api('/api/custom-grids', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, cols }),
      });
      this._customGrids = data?.customGrids || [];
      this._renderCustomGridButtons();
    } catch (e) {
      showToast(t('Could not remove the grid preset — {reason}', { reason: e?.message || t('server unreachable') }), { type: 'error' });
    }
  }

  // Command mode extracted to CommandMode class (src/lib/command-mode.js)

  _setupLayoutManager() {
    document.getElementById('btn-presets').addEventListener('click', () => runCommand('layout.savedPresets', { app: this })); // lane toolbar-fold: the ⋯ row runs the same command
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
        <div class="layout-card-meta">${t('{n} windows', { n: preset.windows?.length || 0 })} · ${escHtml(themeWord(preset.theme || 'dark', t))} · ${preset.updatedAt ? when(preset.updatedAt) : ''}</div>`;
      info.onclick = () => {
        this.layoutManager.loadPreset(name).then(() => this.hideDialogs());
      };

      const actions = document.createElement('div'); actions.className = 'layout-card-actions';
      const btnOverwrite = document.createElement('button'); btnOverwrite.className = 'layout-card-btn'; btnOverwrite.textContent = t('Overwrite with current'); // lane ui-plain-words window-manager-9: words, not a glyph
      btnOverwrite.title = t('Overwrite with current');
      btnOverwrite.onclick = (e) => { e.stopPropagation(); this.layoutManager.savePreset(name).then(() => this._renderPresetsList()); };
      const btnDel = document.createElement('button'); btnDel.className = 'layout-card-btn delete'; btnDel.textContent = t('Delete');
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
    // Close on backdrop click — but ONLY when the interaction STARTED on the
    // backdrop (inc-mtd1c2sd "我选中个东西结果对话框没了": a text-selection
    // drag that begins inside an input and releases outside fires the click
    // on the common ancestor = the overlay, and the whole dialog vanished
    // mid-form; createModalShell keys on mousedown and is immune).
    let _downOnOverlay = false;
    overlay.addEventListener('mousedown', (e) => { _downOnOverlay = e.target === overlay; });
    overlay.addEventListener('click', (e) => { if (e.target === overlay && _downOnOverlay) this.hideDialogs(); });

    // Global Escape: close the transient chrome layer-by-layer — context menus
    // and popovers first, then the modal dialog. Skipped while focus is inside
    // a terminal (Esc is meaningful to TUI apps there).
    // lane L (the naive-user study, S6-01 / S12-02: "Esc with a dropdown open
    // closes the whole dialog"): an OPEN dropdown owns its Escape — a native
    // <select> whose picker is open (`:open`, Chrome ≥133; a tracked state
    // where the selector is unknown) and any control that already consumed the
    // key (the cwd suggestion list preventDefaults it) close THEMSELVES only;
    // the next Escape closes the dialog.
    const openSelects = new WeakSet(); // fallback only — `:open` is the fact where supported
    const selectPickerOpen = (el) => {
      if (!el || el.tagName !== 'SELECT') return false;
      try { return el.matches(':open'); } catch { return openSelects.has(el); }
    };
    // a capture-phase pointerdown (2.369.182 integration, lane M's census — test-architecture §59: no document
    // mousedown listener outside its closed allow-list): the press that opens / closes a picker, a tracker, never a closer
    document.addEventListener('pointerdown', (e) => {
      const sel = e.target?.closest?.('select');
      if (!sel) return;
      if (openSelects.has(sel)) openSelects.delete(sel); else openSelects.add(sel);
    }, true);
    for (const ev of ['change', 'blur']) document.addEventListener(ev, (e) => { if (e.target?.tagName === 'SELECT') openSelects.delete(e.target); }, true);
    document.addEventListener('keydown', (e) => {
      if (e.target?.tagName === 'SELECT' && e.key !== 'Escape') {
        if (e.key === 'F4' || e.key === ' ' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) openSelects.add(e.target);
        else if (e.key === 'Enter' || e.key === 'Tab') openSelects.delete(e.target);
      }
      if (e.key !== 'Escape' || e.isComposing) return;
      if (e.target.closest?.('.xterm')) return;
      const floats = document.querySelectorAll('[data-popover]');
      if (floats.length) { floats.forEach(el => el.remove()); e.preventDefault(); return; }
      if (selectPickerOpen(e.target)) { openSelects.delete(e.target); return; } // the picker closes; the dialog stays
      if (e.defaultPrevented) return; // a control inside the dialog closed its own list with this key
      if (!overlay.classList.contains('hidden')) { this.hideDialogs(); e.preventDefault(); }
    });

    const backendInput = document.getElementById('input-backend');
    backendInput.addEventListener('change', () => this.applyBackend(backendInput.value, { why: 'pick' }));
    this.applyBackend(backendInput.value || 'claude', { why: 'boot' });

    // Enter in any text input of the New Session dialog submits it
    document.getElementById('dialog-new-session').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      if (e.target.tagName !== 'INPUT') return;
      // Let the path field accept its highlighted candidate first (it prevents that Enter; a plain Enter commits AND submits)
      if (e.target.id === 'input-cwd' && e.defaultPrevented) return;
      e.preventDefault();
      document.querySelector('#dialog-new-session .btn-create').click();
    });

    document.querySelector('#dialog-new-session .btn-create').addEventListener('click', async (ev) => {
      const createBtn = ev.currentTarget;
      if (createBtn.dataset.busy) return; // Enter + click racing the async check
      const openAt = this._openStartNow?.();   // B-c87d r871: the create's start is this press, read before the path's commit and the folder's ensure
      const backend = document.getElementById('input-backend').value || 'claude';
      const hostId = document.getElementById('input-host')?.value || undefined;
      // lane new-session-form: THE PATH FIELD COMMITS FIRST (the contract: Create awaits pf.commit() — a value that does not
      // take is said under the field and in the footer, «Cannot create yet: …», and nothing spawns)
      createBtn.dataset.busy = '1';
      const picked = await Promise.resolve(this._cwdField?.commit()).catch(() => null);
      if (!picked) { delete createBtn.dataset.busy; this._nsPaintFoot?.(); this._nsReveal?.('cwd'); return; }
      const cwd = String(picked.path || '').trim();
      // A typo'd/nonexistent cwd used to fail opaquely at spawn time (pty chdir
      // error → instant "terminated"; remote silently fell back to $HOME).
      // Stat it first and offer to create the folder; on cancel the dialog
      // stays open for correction (the field's ensure: today's confirm under the stub, L1's ticked «create» road).
      {
        const ok = await Promise.resolve(this._cwdField.ensure()).catch(() => false).finally(() => delete createBtn.dataset.busy);
        if (!ok) return;
      }
      // lane new-session-layout-v3-build: WHAT CREATE SENDS is PURE (new-session-model createPlan — the v2 payload, meaning
      // unchanged): the header's Terminal = a login shell (openShellTerminal handles host + defaults); Agent = the harness,
      // in its own terminal UI when the fold's tick says so (mode terminal — ws-create's pty-wrapper road), else the chat.
      // The groups (several, in the order picked), the 「可用工具」 pick, the accounts ticked for THIS conversation (written
      // once its id exists — _nsCreated / _nsGrantPending); an empty name is the folder's own.
      const val = (id) => document.getElementById(id)?.value;
      const plan = createPlan({
        noAgent: terminalOnly(backend), backend, hostId, cwd, tui: !!document.getElementById('input-tui')?.checked,
        name: val('input-session-name'), model: val('input-model'), modelCustom: val('input-model-custom'),
        permission: val('input-permission'), effort: val('input-effort'), extraArgs: val('input-extra-args'),
        taskIds: this._nsTaskIds?.() || [], tools: this._nsToolPick?.() || undefined, accountId: val('input-account'),
        // agent browser P1 (§3.2.5): the row sends an EXPLICIT value, so the origin
        // the client computed (task-group / instance / chosen) rides along as a hint
        browserProfileId: val('input-browser-profile'), browserProfileOrigin: document.getElementById('input-browser-profile')?.dataset.origin,
        // Only sent when the harness HAS the row (the box is hidden + cleared
        // otherwise, but the read is gated too so a stale DOM cannot leak it).
        worktreeSupported: worktreeCapsFor(backend).supported, worktree: !!document.getElementById('input-worktree')?.checked,
      });
      if (plan.login) {
        this.openShellTerminal(plan.login.cwd, { hostId: plan.login.hostId });
        this.hideDialogs();
        return;
      }
      // q-053 §3: the account's provider serves no model — the row says so with its door; Create says it too, never spawns
      if (document.querySelector('#row-model .ns-models-none:not(.hidden)')) { showToast(t('This account’s provider has no models — set them up first'), { type: 'error' }); return; }
      const channels = this._nsChannelTicks?.() || [];
      this.createSession({ ...plan.payload, onCreateResult: (ok, msg) => { if (ok) this._nsCreated?.(msg, { channels }); }, openAt });
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
        if (enterSubmits(e) && !e.shiftKey) { e.preventDefault(); forkBtn.click(); }
      });
    }

    // CWD autocomplete
    this._setupCwdAutocomplete();
  }

  getSessionOptions(backend) {
    return BACKEND_SESSION_OPTIONS[backend] || BACKEND_SESSION_OPTIONS.claude;
  }

  _getBackendSessionDefaults(backend) {
    const prefix = settingsPrefixFor(backend);
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

  /** THE ONE WAY A BACKEND REACHES THE NEW SESSION DIALOG (lane new-session-account-follows-backend, inc-mvi2cv4b-hdwv:
   *  after an Antigravity conversation the next dialog said Claude but still offered Antigravity's accounts — the open
   *  SET the select, which fires no `change`, after the account row had been filled from the previous open's value).
   *  It sets the select AND refills every row derived from it: the session options with this backend's defaults, then
   *  the account row, the browser-profile row and the model menu. The open calls it once it has decided the backend; a
   *  pick calls it through the select's `change`. The rows derive from what the select now HOLDS — what Create sends.
   *  `why` ('boot' | 'open' | 'pick' | a caller's word) rides the incident recorder's op ring. */
  applyBackend(backend, { why = 'pick' } = {}) {
    const sel = document.getElementById('input-backend');
    if (sel) sel.value = backend || 'claude';
    const be = sel ? (sel.value || 'claude') : (backend || 'claude');
    this._applySessionBackendOptions(be, { applyDefaults: true });
    this._refillNewSessionRows();
    try { window.__vsOp?.('ns-backend', { backend: be, why: String(why || 'pick') }); } catch { }
  }

  /** The New Session rows derived from the dialog's CHOICES (its backend, its machine, its Task Group), refilled from
   *  what the selects hold NOW: the account row (this backend's accounts, the machine's words), the browser-profile row
   *  (the group's default profile; none on another machine), the model menu (the account's provider — deferred, so it
   *  reads the account row this pass filled). Whatever applies a choice runs it; no row is filled before its choice. */
  _refillNewSessionRows() {
    this._updateAcctRow?.();
    this._fillBrowserProfileRow?.(this._nsTaskIds?.() || []); // lane new-session-form: the groups picked (only the profiles they admit)
    this._refreshModelMenu?.();
    this._nsRender?.(); // lane new-session-form: the switches, the tools row, the fold, the right column, the footer follow
  }

  _applySessionBackendOptions(backend, { applyDefaults = false } = {}) {
    // Plain shell terminal has no model/permission/effort/mode — hide those
    // rows so the dialog is just Backend / Host / Working Directory / Name.
    const isShell = terminalOnly(backend);
    for (const [id, hide] of [
      ['row-mode', isShell], ['row-model', isShell], ['custom-model-row', isShell], ['row-tui', isShell],
      ['row-permission', isShell], ['row-effort', isShell || !hasEffortMenu(backend)], ['row-extra-args', isShell],
      // Per-session git worktree (owner ruling 9): gated on the CAPS ROW, not
      // on a backend id — a harness without the flag simply has no row, and
      // the box is cleared so a stale tick can never ride a create.
      ['row-worktree', isShell || !worktreeCapsFor(backend).supported],
    ]) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', hide);
    }
    { const wt = document.getElementById('input-worktree'); if (wt && !worktreeCapsFor(backend).supported) wt.checked = false; }
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
    this._modelMenuSig = null; // the harness's seed list is drawn: the account's answer below draws over it
    delete modelSel.dataset.touched; // a new harness: nothing picked yet
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
      // lane agy-models-report: «Refresh from …» is an ACT, not a pick — the field keeps the model it had
      if (modelSel.value === '__refresh__') { modelSel.value = modelSel.dataset.prev || ''; this._askCliModels?.(); return; }
      modelSel.dataset.prev = modelSel.value;
      modelSel.dataset.touched = '1'; // the person's own pick: a report's redraw keeps it (round 2 law E)
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
    this._refreshModelMenu(); // the harness's list above is the seed; the chosen account's provider answers the menu
  }

  // MODELS AT A NEW SESSION (design q-053 r1 §3, lane models-at-session): the model menu is the chosen ACCOUNT'S PROVIDER'S
  // list — the harness's own for a first-party login (as before), exactly the entered or provider-listed rows for a
  // third-party one (GET /api/available-models?backend=&account=). Redrawn whenever the harness, the machine or the account
  // changes (one answer wins: the newest ask). A provider with none is ONE line that says so and opens its account's models.
  _refreshModelMenu() {
    clearTimeout(this._modelMenuTimer);
    this._modelMenuTimer = setTimeout(async () => { // after the account row has followed the same change
      const dlg = document.getElementById('dialog-new-session');
      const be = document.getElementById('input-backend')?.value || 'claude';
      if (!dlg || dlg.classList.contains('hidden') || terminalOnly(be)) return;
      const acctSel = document.getElementById('input-account');
      const rowShown = !!acctSel && document.getElementById('row-account')?.style.display !== 'none';
      const picked = rowShown ? acctSel.value : '';
      const id = picked === 'subscription' ? '' : (picked || (rowShown ? this._accounts?.[billingRow(be).defaultIdField] || '' : ''));
      const seq = (this._modelMenuSeq = (this._modelMenuSeq || 0) + 1);
      const hostId = document.getElementById('input-host')?.value || ''; // another machine ⇒ its menu is the plain shipped rows (lane cli-update-needs-nothing)
      const ans = await fetchJson(`/api/available-models?backend=${encodeURIComponent(be)}&account=${encodeURIComponent(id)}${hostId ? `&host=${encodeURIComponent(hostId)}` : ''}`);
      if (seq !== this._modelMenuSeq || !ans || !Array.isArray(ans.models)) return; // a newer ask, or an older server: the harness's list stays
      if ((document.getElementById('input-backend')?.value || 'claude') !== ans.backend) return;
      this._modelMenuAns = ans;
      // an answer that changes no row never rebuilds the field (the person may be holding it open): its line only
      if (this._modelMenuSig && rowsSig(ans) === this._modelMenuSig) { this._paintModelReport(be, ans); return; }
      this._drawModelMenu(be, ans);
    }, 0);
  }

  // lane agy-models-report: THE LINE under the model field for a CLI that reports its own models — «As reported by Antigravity
  // 5min ago» / «VibeSpace's list — Antigravity has not reported yet» / a failure and its door («Sign in to Antigravity»)
  _paintModelReport(be, ans) {
    const row = document.getElementById('row-model');
    if (!row) return;
    let el = row.querySelector('.ns-models-src');
    const hostSel = document.getElementById('input-host');
    const line = reportLine(ans && ans.report, { t, ago: (ts) => agoWords(ts, t), harness: (ans && ans.report && ans.report.by) || be, machine: hostSel && hostSel.value ? (hostSel.selectedOptions?.[0]?.textContent || hostSel.value) : '' });
    if (!line) { el?.classList.add('hidden'); return; }
    if (!el) { el = document.createElement('small'); el.className = 'ns-models-src'; row.appendChild(el); }
    el.classList.remove('hidden');
    el.classList.toggle('ns-models-src-warn', line.tone === 'warn');
    el.textContent = line.text;
    if (line.door === 'sign-in') {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ns-models-signin'; b.textContent = signInLabel(t, ans.report.by || be);
      const acct = ans.report.account;
      b.onclick = (e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('vs-cli-models-sign-in', { detail: { backend: be, account: acct } })); };
      el.append(' ', b);
    }
  }

  // lane agy-models-report: ask the CLI that reports its own models for the drawn menu's account — `explicit` = the row «Refresh
  // from …» (a press: the floors set aside, once a minute, a refusal said), else THE OPENING of the field (E1: under the
  // floors, silent). The listing's end re-reads the menu (available-models-dirty) — that re-read never lists.
  async _askCliModels({ explicit = true } = {}) {
    const ans = this._modelMenuAns;
    const be = document.getElementById('input-backend')?.value || 'claude';
    if (!ans || !opensFor(ans.report) || ans.backend !== be) return; // another machine's CLI: nothing is asked
    let r = null;
    try { r = await fetch(explicit ? '/api/cli-models/refresh' : '/api/cli-models/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backend: be, account: ans.report.account }) }).then((x) => x.json()); } catch { r = null; }
    if (!r || !r.ok) { if (explicit) showToast(refusalText(r, t, ans.report.by || be), { type: 'error' }); return; }
    if (r.listing && this._modelMenuAns === ans) this._paintModelReport(be, { ...ans, report: { ...ans.report, listing: true } });
  }

  _drawModelMenu(be, ans) {
    const sel = document.getElementById('input-model');
    const row = document.getElementById('row-model');
    const customRow = document.getElementById('custom-model-row');
    if (!sel || !row) return;
    row.dataset.provider = ans.provider?.id || '';
    row.title = ans.provider ? t('Models of {provider}', { provider: t(ans.provider.label) }) : '';
    let none = row.querySelector('.ns-models-none');
    if (ans.empty) {
      sel.innerHTML = '';
      sel.classList.add('hidden');
      customRow?.classList.add('hidden');
      if (!none) { none = document.createElement('button'); none.type = 'button'; none.className = 'ns-models-none'; row.appendChild(none); }
      none.textContent = t(MENU_EMPTY);
      none.classList.remove('hidden');
      none.onclick = (e) => { e.preventDefault(); openAccountModelsDialog({ accountId: ans.account?.id || '', name: ans.account?.name || '', onClose: () => this._refreshModelMenu() }); };
      return;
    }
    none?.classList.add('hidden');
    sel.classList.remove('hidden');
    const prev = sel.value;
    const ids = [];
    sel.innerHTML = '';
    for (const m of ans.models) {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.id === '' ? t('Default') : (m.label || m.id);
      sel.appendChild(o);
      ids.push(m.id);
    }
    this._nsPaintFoot?.(); // the footer's model chip / its «no models» refusal
    if (ans.open) { // the harness judges its own spellings — Custom… stays; a closed provider offers exactly its rows
      const o = document.createElement('option');
      o.value = '__custom__';
      o.textContent = t('Custom…');
      sel.appendChild(o);
    }
    if (ans.report && !ans.report.host) { // lane agy-models-report: the explicit row — ask the CLI now (the onchange keeps the pick)
      const o = document.createElement('option');
      o.value = '__refresh__';
      o.textContent = refreshLabel(t, ans.report.by || be);
      sel.appendChild(o);
    }
    const want = this._getBackendSessionDefaults(be).model;
    // round 2 law E — A REPORT NEVER DROPS A PERSON'S CHOICE: the model they chose (their pick, once they touched the field;
    // untouched, the saved default) that the CLI's report does not list STAYS selected, said as not in the report — never a
    // silent fall to «Default». Only a real report of this machine's CLI; every other menu keeps its rule below.
    const touched = sel.dataset.touched === '1';
    let chosen = null;
    if (ans.report && ans.report.source === 'reported' && opensFor(ans.report)) {
      chosen = touched ? prev : (prev && prev !== '__custom__' && prev !== '__refresh__' ? prev : want);
      if (chosen && chosen !== '__custom__' && chosen !== '__refresh__' && !ids.includes(chosen)) {
        const o = document.createElement('option');
        o.value = chosen;
        o.textContent = notInReport(t, ans.report.by || be, chosen);
        sel.insertBefore(o, sel.firstChild ? sel.firstChild.nextSibling : null); // right under Default
        ids.push(chosen);
      } else if (!ids.includes(chosen)) chosen = null;
    }
    sel.value = chosen && !touched ? chosen
      : ids.includes(prev) || (prev === '__custom__' && ans.open) ? prev
      : ans.open ? (ids.includes(want) ? want : '') : (ans.defaultId && ids.includes(ans.defaultId) ? ans.defaultId : ids[0]);
    sel.dataset.prev = sel.value;
    if (sel.value !== '__custom__') customRow?.classList.add('hidden');
    this._modelMenuSig = rowsSig(ans);
    this._paintModelReport(be, ans);
  }

  // lane new-session-form: THE New Session door of the ONE path field (lane path-field's contract §4): the picked groups in
  // the order picked, the machine, the name typed so far (由名字), the chips row; its verdict is the footer's refusal and
  // the name's placeholder. Create awaits pf.commit(), then pf.ensure() (a ticked missing folder is made there).
  _setupCwdAutocomplete() {
    // lane path-field: THE path field (src/lib/path-field.js) — the selected Task Group's folders first (and one
    // <group folder>/<name> per selected group from the Session Name), recent folders with counts, the listing, a few
    // letters anywhere in the path; computed FOR THE MACHINE chosen (a host's candidates come from that host)
    const input = document.getElementById('input-cwd');
    const hostNow = () => document.getElementById('input-host')?.value || '';
    this._cwdField = pathField(input, {
      // int346: the picked groups in the order picked (selected) — none picked ⇒ every group's folders as candidates (L1's door);
      // lane new-session-group-folder-link: a picked group's chips = its folders + the sub-folders that already hold sessions
      groupsOf: () => appGroups(this._nsTaskIds?.() || []).map((g) => (g.selected ? { ...g, chips: () => this._taskCwdSuggestions(hostNow()).filter((c) => c.group === g.id) } : g)),
      host: () => hostNow() || null,
      name: () => document.getElementById('input-session-name')?.value || '',
      // lane new-session-group-folder-link: THE field's own chips row (#cwd-recent adopted) — 由名字 per picked group + home
      // first, live with the name, then the day-one / recent folders; one row (the owner: 「必须点开 path autocomplete 列表才行」)
      kind: 'folder', chips: true, id: 'new-session-cwd',
      createWhen: t('Create this folder when the session starts'),
      onState: (v) => this._nsCwdState?.(v),
      onCommit: (info) => this._nsFolderCommitted?.(info), // where the folder came from (PURE folderOnCommit: a pick is the person's)
    });   // the name row's input → pf.refresh() is the form's (src/lib/new-session-form.js); so is the folder's origin
  }

  // The selected Task Group's folder suggestions for the New Session dialog
  // chips: every linked folder, plus — for recursive folders — nested folders
  // that already contain sessions (e.g. group folder /a with sessions at /a
  // and /a/too ⇒ suggest BOTH /a and /a/too). Subfolder discovery is local
  // sessions only; with a remote host selected we still pin the folder paths
  // themselves (remote cwds aren't reliably in _allSessions).
  _taskCwdSuggestions(hostId) {
    const out = []; const seen = new Set();
    for (const tg of this._nsGroups?.() || []) { // lane new-session-form: every group picked, in the order picked
      const add = (path, tip) => { if (path && !seen.has(path)) { seen.add(path); out.push({ path, tip, color: tg.color || '', group: tg.id }); } };
      // B-06de cure: the group's folders ON the machine chosen (a hub row on This machine, `h1::/p` → /p on h1) — never the raw
      // `host::/path` as a chip (the wire's folders keep the row's own spelling)
      for (const f of (this.sidebar?._folderPathsOn ? this.sidebar._folderPathsOn(tg, hostId || null) : tg.folders) || []) {
        const rec = this.sidebar._folderRec(f);
        add(rec.path, t('Task Group folder ({name})', { name: tg.title }));
        if (rec.recursive && !hostId) {
          const subs = new Map(); // session cwd inside the folder (the folder itself included — its chip is already pinned above) -> count
          for (const s of this.sidebar?._allSessions || []) {
            if (s.host || !s.cwd) continue;
            const under = membershipCwds({ cwd: s.cwd, realCwd: s.realCwd, host: s.host }).some((c) => insideFolder(c, rec)); // ONE copy of the page's rule (B-df5f cure 2)
            if (under) subs.set(s.cwd, (subs.get(s.cwd) || 0) + 1);
          }
          for (const [c, n] of [...subs.entries()].sort((a, b) => b[1] - a[1]))
            add(c, t('In a Task Group folder — {n} session(s) here', { n }));
        }
      }
    }
    return out;
  }

  // The folder field's words for the machine chosen (the chips are the field's own since lane new-session-group-folder-link —
  // src/lib/path-field.js paints them THROUGH day-one's folderChips: the picked groups' folders pinned first, the home's
  // folders WITH files, «the last one you used», the rest; lane door-day-one-landing: nothing pre-fills, typing stays).
  _cwdHostHint(hostId) {
    const cwdInput = document.getElementById('input-cwd');
    const stillThisHost = () => (document.getElementById('input-host')?.value || '') === (hostId || '');
    if (hostId) {
      // Show the DEVICE/remote home as the empty-cwd hint (B-0d70: the
      // placeholder used to stay the LOCAL home, so a paired Mac showed
      // /home/<user> which doesn't exist there). Reset to a NEUTRAL hint
      // BEFORE the async fetch so an offline/paired device whose /api/home
      // 400s never leaves the stale local home showing (review).
      if (cwdInput) cwdInput.placeholder = t('directory on this machine…');
      if (cwdInput) fetchJson(`/api/home?host=${encodeURIComponent(hostId)}`).then(d => {
        if (d?.home && stillThisHost()) cwdInput.placeholder = d.home;
      }).catch(() => {});
    } else if (cwdInput) {
      // words, not a path (the grey /home/<user> read as a value to copy); an empty field still starts in the home folder
      cwdInput.placeholder = t('Type a folder, or pick one below');
    }
    try { this._cwdField?.refresh(); } catch { } // the field re-ranks + repaints its chips for the machine / the groups now chosen
  }

  _showDialog(id) {
    // Mobile: #dialog-overlay sits BELOW the full-screen sidebar — every
    // index.html dialog opened from the sidebar was invisible (fork/new-session
    // patched this per-site before; central now).
    if (this.isMobile && this.sidebar?.isOpen) this.sidebar.toggle(false);
    const overlay = document.getElementById('dialog-overlay'); overlay.classList.remove('hidden');
    overlay.querySelectorAll('.dialog').forEach(d => d.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    announceModal(overlay); // lane dialog-keys: the static overlay says it opened too (a live view you drive judges who opened it)
  }

  showNewSessionDialog({ cwd, backend, hostId, taskId, taskIds } = {}) {
    if (this.isMobile) this.sidebar.toggle(false); // close sidebar so dialog is visible
    this._showDialog('dialog-new-session');
    // THE CHOICES FIRST (lane new-session-account-follows-backend): every select still holds the PREVIOUS open's value
    // until this open sets it, so the backend and the machine are decided and set before any row derived from them is
    // filled — decide → apply (applyBackend, below) → fill the rest. A machine the list does not hold yet is set again
    // when the list lands (below), and its rows follow it then.
    const b = backend || 'claude';
    const hostSel = document.getElementById('input-host');
    // B-06de cure: a machine the select does not list YET (the first open of a page: its list lands later) gets a provisional row —
    // a Create pressed before the list lands starts ON that machine, never on This machine by default
    if (hostSel && hostId && ![...hostSel.options].some((o) => o.value === hostId)) { const o = document.createElement('option'); o.value = hostId; o.textContent = this.sidebar?._hostNameOf?.(hostId) || hostId; hostSel.appendChild(o); }
    if (hostSel) hostSel.value = hostId || '';
    this._nsHostPicked = false; // set by the person's own pick in the host row (below) — the list's landing keeps it
    // Task Groups — a new session can start "in" SEVERAL (lane new-session-form: the right column's 任务组 chips, in the
    // order picked; the created session is spawned into all of them — taskIds — and bound to each). Pre-picked when
    // opened from a group; a folder the groups give FOLLOWS them until the person edits it (new-session-model folderOn*).
    this._nsOpen({ taskIds: Array.isArray(taskIds) ? taskIds : (taskId ? [taskId] : []) });
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
      const list = all.filter(a => (a.backend || 'claude') === be)
        // TYPE-then-name order, matching the Manage-Agents roster (2.268.5)
        .sort((a, b) => (((a.pooled || a.type === 'pooled') ? 0 : a.type === 'subscription' ? 1 : 2)
          - ((b.pooled || b.type === 'pooled') ? 0 : b.type === 'subscription' ? 1 : 2))
          || String(a.name || '').localeCompare(String(b.name || '')));
      const onHost = !!document.getElementById('input-host')?.value;
      const show = backendFeatureCaps(be).accounts && list.length > 0;
      acctRow.style.display = show ? '' : 'none';
      if (!show) { acctSel.value = ''; return; }
      const bill = billingRow(be); // the declared billing row: words + fields, never an id
      const defId = this._accounts?.[bill.defaultIdField];
      const globalLabel = t(bill.globalLogin);
      const defName = defId ? (list.find(a => a.id === defId)?.name || t('API key')) : globalLabel;
      const prev = acctSel.value;
      acctSel.innerHTML = '';
      const hostId = document.getElementById('input-host')?.value || '';
      const hostRec = hostId ? (this._nsHosts || this.sidebar?._hostsData?.hosts || []).find(h => h.id === hostId) : null;
      const hostName = hostRec?.name || hostId;
      const cliLoginLabel = !onHost ? t(bill.pickLogin)
        : bill.pickLoginHost ? t(bill.pickLoginHost) : t(bill.cliLogin) + ' @ ' + hostName + bill.planSuffix;
      const opts = [
        ['', t('Default ({name})', { name: defName })],
        ['subscription', cliLoginLabel], // the CLI's global login (on the host for remote sessions)
      ];
      // Subscription accounts for a REMOTE host — SAME semantics as the billing
      // switcher (2.198.0/2.199.0; userN's bootloop started here: the dialog
      // hid every named subscription for remote, forcing create-then-switch on
      // an empty session): email-LINKED to the host's own login or HELD on the
      // host (per-host login dir) = usable with zero creds shipped; otherwise
      // shipping needs the opt-in toggle (ban risk, default OFF; never dial).
      // API keys always ship. Local: needs a local login.
      const allowSubRemote = !!this.settings?.get?.('accounts.shipSubscriptionToRemote');
      const hostOwnEmail = onHost && bill.hostLogin
        ? String(this._hostOwnUsage?.[hostId]?.orgEmail || this._hostUsage?.[hostId]?.orgEmail || '').trim().toLowerCase() : '';
      const emailOf = (a) => String(this._accountUsage?.[a.id]?.orgEmail || a.email || (String(a.name || '').includes('@') ? a.name : '')).trim().toLowerCase();
      const hostHeld = (a) => !!a.hostLogins?.[hostId] || (this._hostSubsKnown?.[hostId] || []).includes(a.id);
      // SERVER verdicts (B-f531): warm the probe now; the row rebuilds when
      // the answer lands (_warmHostAccountCache calls _updateAcctRow). While
      // present, verdicts override the legacy cache-derived linked/held.
      if (onHost && hostId) this._warmHostAccountCache?.(hostId);
      const vOf = (a) => (onHost ? this._hostVerdicts?.[hostId]?.[a.id] : null) || null;
      // Without verdicts every "not logged in on {host}" below is a confident
      // claim derived from NO data — it read as definitive for the ~15s probe
      // window (and for 2 min after a failed probe, pre-fix), so users picked
      // a worse account off it. Say which state we're actually in.
      // (gated on the warm state as well — a pre-verdict server answers fine
      // but sends no `verdicts`, and a bare absence test would pin it on
      // "checking…" forever)
      const acctWarm = onHost ? this._hostAcctWarmState?.[hostId] : null;
      const verdictsCold = onHost && !this._hostVerdicts?.[hostId] && (acctWarm === 'pending' || acctWarm === 'error');
      const unknownLabel = acctWarm === 'error'
        ? t('availability on {host} unknown — machine unreachable', { host: hostName })
        : t('checking {host}…', { host: hostName });
      const uncertainIds = new Set(); // disabled only because the probe hasn't answered
      for (const a of list) {
        // a THIRD-PARTY provider (lane lg-providers U5 r1): its own words; on another machine it is not offered as usable
        // (its spawn road runs on this machine only — the create would refuse it)
        if (a.type === 'provider') { opts.push(onHost ? [a.id, t('{name} (third party)', { name: a.name }) + ' — ' + t('this machine only'), true] : [a.id, t('{name} (third party)', { name: a.name })]); continue; }
        // Pooled pseudo-account: neither an API key (the old else-branch
        // labeled it "— API key …undefined") nor a plain subscription.
        // Local-only by design (directory-symlink mechanics).
        if (a.pooled || a.type === 'pooled') {
          if (onHost) opts.push([a.id, a.name + ' — ' + t('pool (this machine only)'), true]);
          else opts.push([a.id, a.name + (a.currentName ? ` → ${a.currentName}` : ' · ' + t('pool'))]);
          continue;
        }
        if (a.type === 'subscription') {
          // B-360d: a sign-in not read yet (or that could not be read) is offered with its state in words — never left out as
          // «signed out»; the spawn's own placement decides it fresh
          const unread = a.facts && a.facts.state !== 'read' ? (a.facts.state === 'unreadable' ? t('sign-in could not be read') : t('sign-in not read yet')) : null;
          if (!bill.hostLogin || !onHost) {
            if (unread && (!onHost || allowSubRemote)) opts.push([a.id, a.name + ' — ' + unread]);
            else if (a.loggedIn && (!onHost || allowSubRemote)) opts.push([a.id, t('{name} (subscription)', { name: a.name })]);
            // Long-lived token (B-211a): usable locally via the env token even
            // with no local login (expired = disabled with the reason)
            else if (bill.longLivedToken && a.oat) opts.push(oatExpiredBy(a)   // B-8703 follow: the server's last day
              ? [a.id, a.name + ' — ' + t('long-lived token expired'), true]
              : [a.id, a.name + ' ' + t('· long-lived token')]);
            continue;
          }
          const v = vOf(a);
          const linked = v ? (v.usable && v.how === 'host-login') : (!!hostOwnEmail && emailOf(a) === hostOwnEmail);
          const held = v ? (v.usable && v.how === 'host-held') : (!linked && hostHeld(a));
          if (linked) opts.push([a.id, a.name + ' ' + t('· is {host}’s machine login (same account)', { host: hostName })]);
          else if (held) opts.push([a.id, a.name + ' ' + t('· own login held on {host}', { host: hostName })]);
          else if ((v ? (v.usable && v.how === 'oat') : !!a.oat) && !oatExpiredBy(a)) opts.push([a.id, a.name + ' ' + t('· via long-lived token')]);
          // B-8703 follow (主开发 r976): the billing menu's ONE verdict — a signed-in account the verdict lets through is not refused here
          else if (oatDeadFor(a, v)) opts.push([a.id, a.name + ' — ' + t('long-lived token expired'), true]);
          else if (v && v.reason === 'held-identity-mismatch') opts.push([a.id, a.name + ' — ' + t('host login belongs to {email}', { email: v.dirEmail || '?' }), true]);
          // !a.localOnly: macOS Keychain-backed logins never ship (PR #23) —
          // the verdict path already blocks via reason 'local-only-mac'
          else if (unread && allowSubRemote && !a.localOnly && hostRec?.transport !== 'dial') opts.push([a.id, a.name + ' — ' + unread]);
          else if (a.loggedIn && allowSubRemote && !a.localOnly && hostRec?.transport !== 'dial') opts.push([a.id, t('{name} (subscription)', { name: a.name })]);
          // Not usable there — show WHY instead of silently omitting (the
          // omission is what taught users the create-then-switch workaround).
          // Uncertain ⇒ say uncertain, never "not logged in".
          else {
            if (verdictsCold) uncertainIds.add(a.id);
            opts.push([a.id, a.name + ' — ' + (verdictsCold ? unknownLabel : t('not logged in on {host}', { host: hostName })), true]);
          }
        } else opts.push([a.id, a.tail ? t('{name} — API key …{tail}', { name: a.name, tail: a.tail }) : a.name]);   // B-ba7d: no tail known yet (the person's read not answered) ⇒ the name alone
      }
      for (const [v, label, disabled] of opts) {
        const o = document.createElement('option');
        o.value = v; o.textContent = label;
        if (disabled) o.disabled = true;
        acctSel.appendChild(o);
      }
      const keep = [...acctSel.options].find(o => o.value === prev && !o.disabled);
      // An UNCONFIRMED disable must not silently drop the user's pick: the row
      // is rebuilt when late verdicts land, so resetting here would leave the
      // dialog on Default while the (now enabled) account looks unselected —
      // i.e. the session gets created on a different account than the user
      // chose, silently. Hold the pick until the machine actually answers.
      const prevOpt = prev ? [...acctSel.options].find(o => o.value === prev) : null;
      if (keep || (prev && uncertainIds.has(prev))) acctSel.value = prev;
      else {
        acctSel.value = '';
        // Reset for a CONFIRMED reason — say it (only when the option is still
        // listed but disabled; a backend switch drops it entirely and needs no
        // alarm).
        if (prevOpt?.disabled) {
          const lost = all.find(a => a.id === prev);
          showToast(t('“{name}” isn’t available for this session — the account reset to Default', { name: lost?.name || prev }), { type: 'error' });
        }
      }
    };
    this._updateAcctRow = updateAcctRow; // freshest closure wins
    if (!this._acctListenersWired) {
      // Wire ONCE (this method runs on every dialog open) — call through the
      // stored freshest updater. (A backend pick is wired once at setup: applyBackend.)
      this._acctListenersWired = true;
      document.getElementById('input-host')?.addEventListener('change', () => this._refillNewSessionRows()); // identity r3: a host pick hides the profile row
      document.getElementById('input-host')?.addEventListener('change', () => { this._nsHostPicked = true; }); // ci-355-red: a programmatic set fires no `change` — this is the person's pick
      document.getElementById('input-account')?.addEventListener('change', () => this._refreshModelMenu?.()); // q-053 §3: the menu follows the account's provider
      // lane agy-models-report (E1): THE OPENING of the model field — a pointer press or an opening key — is the one act here
      // that may ask a CLI that reports its own models (only when the drawn answer says the harness does: `report`)
      const modelSel = document.getElementById('input-model');
      const opened = () => this._askCliModels?.({ explicit: false });
      modelSel?.addEventListener('pointerdown', opened);
      modelSel?.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ' || e.key === 'Enter' || e.key === 'F4') opened(); });
    }
    this.applyBackend(b, { why: 'open' }); // THIS open's backend: the session options, the account row, the profile row, the model menu
    // Host dropdown (remote sessions run over ssh + remote dtach; terminal only until P3)
    if (hostSel) {
      fetchJson('/api/hosts').then(d => {
        const was = hostSel.value;
        this._nsHosts = d?.hosts || []; // account row reads name/transport from here
        hostSel.innerHTML = `<option value="">${t('Local')}</option>`;
        for (const h of d?.hosts || []) {
          const o = document.createElement('option');
          // dial devices have no user@host — show them as a device
          o.value = h.id; o.textContent = h.transport === 'dial' ? `${h.name} (${t('device')})` : `${h.name} (${h.user ? h.user + '@' : ''}${h.host})`;
          hostSel.appendChild(o);
        }
        // the B-f276 remainder's cure (主开发 23:20Z): a HELD list keeps the machine this open names (and the person's pick) as an
        // option worded as unread — never a silent This machine; the create meets the hold by name while it lasts
        if (d && d.unread) for (const id of new Set([hostId, was].filter(Boolean))) { const o = document.createElement('option'); o.value = id; o.textContent = `${id} (${t('cannot be read right now')})`; hostSel.appendChild(o); }
        // a machine the person picked while this list was in flight STAYS picked (ci-355-red: the landing put the open's machine
        // back — a pick in the first moments became This machine, its field and footer with it); gone from the list ⇒ the open's
        hostSel.value = this._nsHostPicked ? was : (hostId || '');
        if (hostSel.selectedIndex < 0) hostSel.value = hostId || '';
        // B-06de cure: a list that landed WITHOUT the machine this dialog was opened on (a failed fetch lists only Local) keeps its
        // provisional row — a Create never falls to This machine for it
        if (hostId && !this._nsHostPicked && hostSel.value !== hostId) { if (![...hostSel.options].some((o) => o.value === hostId)) { const o = document.createElement('option'); o.value = hostId; o.textContent = this.sidebar?._hostNameOf?.(hostId) || hostId; hostSel.appendChild(o); } hostSel.value = hostId; this._updateAcctRow?.(); }
        if (hostSel.value !== was) this._refillNewSessionRows(); // the machine landed only now — a programmatic set fires no `change`
        // both terminal and chat supported on remote hosts (chat = ssh -T pipe)
        // switching host re-sources the path list + autocomplete target
        hostSel.onchange = () => { this._cwdHostHint(hostSel.value); this._nsFolderFollow?.(); }; // a folder that follows the groups is re-derived for this machine
        this._cwdHostHint(hostSel.value);
        this._nsRender?.(); // the machine list landed: the fold (a paired machine used lately), the header dot, the chips
      });
    }
    // lane L (the naive-user study, S6-01 / S12-02: the previous session's name
    // stayed in the field, so typing appended — "S11 chromeS12 first…"). A name
    // names ONE session: the field starts empty on every open. The other rows
    // keep their designed prefills (the cwd the caller passed, the Task Group,
    // the backend defaults applyBackend applied above).
    { const nameInput = document.getElementById('input-session-name'); if (nameInput) nameInput.value = ''; }
    document.getElementById('input-mode').value = this.settings.get('session.defaultMode') ?? 'chat';
    // lane new-session-layout-v3-build: the mode is the fold's tick «Run in the harness's own terminal UI» now (the header's
    // Terminal is a login shell) — the person's default (Settings) ticks it, and a ticked row stands out of the fold
    { const tui = document.getElementById('input-tui'); if (tui) tui.checked = document.getElementById('input-mode').value === 'terminal'; }
    // lane door-day-one-landing: the folder is the caller's (a folder's «+», a Task Group) or EMPTY — never the one the last
    // dialog held (it belonged to another area: testers retyped it 5/5 and 3/3 times); the chips offer the rest.
    // lane new-session-group-folder-link: opened from a group, its folder is DERIVED (it follows the groups until the person
    // edits it — PURE folderOnOpen); the field's line + verdict start from it (its list never pops on open)
    this._nsFolderOpen(cwd || '');
    this._cwdHostHint(hostId || '');
    this._nsRender?.();
    // the name comes first now (lane new-session-form: 会话名称 above 工作目录 — it feeds the folder's 由名字 rows)
    (this.isMobile ? null : document.getElementById('input-session-name'))?.focus();
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

  /** OPEN FROM A WINDOW (split tabs v2, F2 — the owner: "以后从窗口打开文件路径/本地链接的时候
   *  默认side by side展示吧"): where a file / folder opened from window `fromId`
   *  (a chat's path or local link — the ChatView's OWN window, never the active
   *  one) is born. `window.openLinkPlacement` is read HERE, at the act:
   *  'split' (default) = `intoChain {split}` — beside the source (on a chain
   *  already split, the side the source is NOT on: enterSplit); 'tab' = a tab
   *  right after the source; 'window' = today's free window (undefined). No
   *  placement (a free window) when the source is gone, minimized, on another
   *  desktop, the stage is up, or on the phone (R6: one pane — its own window). */
  linkPlacement(fromId) {
    const mode = this.settings?.get('window.openLinkPlacement') ?? 'split';
    if (mode !== 'split' && mode !== 'tab') return undefined;
    const src = fromId ? this.wm.windows.get(fromId) : null;
    if (!src || this.isMobile || this.stage?.isActive) return undefined;
    const host = src._tabChain ? this.wm.windows.get(src._tabChain.tabs[0]) : src;
    if (!host || host.isMinimized || host._hiddenByDesktop || src._hiddenByDesktop) return undefined;
    return { hostId: src.id, split: mode === 'split', side: 'right' };
  }

  /** The dedupe of an open FROM A WINDOW: the same path (same host) already open
   *  in the source window's own chain ⇒ show THAT tab (on its side in a split)
   *  instead of a second window; a `:line` link moves its editor to the line.
   *  Returns whether it did. Nothing else is deduped (a free window stays free). */
  _focusOpenInChain(fromId, { path: p, host, line, dir = false, quiet = false } = {}) {
    const src = fromId ? this.wm.windows.get(fromId) : null;
    const ch = src && src._tabChain;
    if (!ch || !p) return false;
    for (const id of ch.tabs) {
      const w = this.wm.windows.get(id);
      if (!w || id === fromId) continue;
      const wHost = (w._openSpec && w._openSpec.host) || w._explorerHost || '';
      if ((wHost || '') !== (host || '')) continue;
      const same = dir ? (w.type === 'files' && w._explorerPath === p) : ((w.type === 'viewer' || w.type === 'editor' || w.type === 'hex-viewer' || (w.type === 'doc' && !line)) && w._filePath === p);
      if (!same) continue;
      if (quiet) return true; // an AUTOMATIC open of a file already there: nothing moves (lane artifacts-auto-open-quiet)
      this.wm.revealWindow(id); // its own tab (the host's too — inc-muiq348r-jwb5's one door), raised
      if (line && typeof w._gotoLine === 'function') { try { w._gotoLine(line); } catch { } }
      return true;
    }
    return false;
  }

  openFileExplorer(startPath, { syncId, host, from, intoChain, attended = false } = {}) {
    if (from && this._focusOpenInChain(from, { path: startPath, host, dir: true })) return this.wm.windows.get(this.wm.activeWindowId);
    this._hideWelcome();
    const openSpec = { action: 'openFileExplorer', path: startPath, host: host || undefined };
    const winInfo = this.wm.createWindow({ title: t('File Explorer'), type: 'files', syncId, openSpec, intoChain: intoChain || (from ? this.linkPlacement(from) : undefined) });
    if (host) winInfo._explorerHost = host; // read by FileExplorer constructor
    if (attended) winInfo._explorerPressed = true; // B-23e5: a person's press opened it (Open in new window) — its first listing is tried
    const explorer = new FileExplorer(winInfo, this, startPath);
    winInfo._explorer = explorer;
    winInfo.onClose = () => { explorer.dispose(); this._checkWelcome(); };
    return winInfo;
  }

  /** Stale-bundle guard (2.160.1, real fleet incident): a tab left open
   *  across a server update keeps its OLD bundle and silently misbehaves
   *  against the new server — every window blank, creates lost without a
   *  trace, while the sidebar's HTTP polls keep working ("all sessions
   *  died"). The tab that RUNS the update reloads itself; every other tab
   *  never did. On each ws (re)connect, compare the bundle's baked version
   *  with the server's; mismatch → reload ONCE per server version (the
   *  guard keeps dev instances that rebuild without a version bump from
   *  reload-looping). */
  async _checkBundleFreshness() {
    // ONE look at a time (the adversarial read: a timer's look still in its 180-s wait and a reconnect's look polled twice and
    // skipped back-off rungs): a call during a look asks for ONE more look when it ends
    if (this._staleBusy) { this._staleAgain = true; return; }
    this._staleBusy = true;
    try {
      if (!BUILD_VERSION) return;
      // A STALE PAGE THAT GAVE UP CHECKS AGAIN (lane think-tools-phone, 主开发 2026-11-17 — the owner's page ran 2.369.404 against a
      // 2.369.406 hub for twelve hours: the ready wait gave up at a slow boot, «wait», and the socket then stayed up all day). The
      // look is src/lib/stale-watch.js staleLook (PURE, its effects injected here): a give-up looks again on the back-off, a reload
      // HOLDS while a person types or a box holds unsent words, and ONE pinned notice says why the page is behind only while it
      // will not reload now. The existing rules stand: one reload per server version PER TAB (2.240.3 — sessionStorage), the once
      // notice of a reload that did not take, the wait for the hub's ready, the stamp written as the reload fires.
      clearTimeout(this._staleTimer); this._staleTimer = null;
      // the ONE capture listener: the person's own input stamps the typing rule's clock and marks the box TYPED (observed, never declared) —
      // a trusted input, or the microphone's words (voice-input.js marks their event with the global symbol vibespace.voice.spoken: the
      // mic never focuses the box, so its event is script-made)
      if (!this._staleTyping) { const T = this._staleTyping = { at: 0 }; document.addEventListener('input', (e) => { if (!e.isTrusted && !e[Symbol.for('vibespace.voice.spoken')]) return; T.at = Date.now(); if (e.target?.tagName === 'TEXTAREA') markTyped(e.target); }, true); }
      const memo = this._staleMemo || (this._staleMemo = { n: 0, srv: null });
      const keyOf = (v) => 'vibespace.reloaded-for.' + v, noticeKeyOf = (v) => 'vibespace.stale-said.' + v;
      await staleLook({
        bundle: BUILD_VERSION,
        fetchVersion: async () => (await fetchJson('/api/version'))?.version || null,
        store: { reloaded: (v) => !!sessionStorage.getItem(keyOf(v)), noticed: (v) => !!sessionStorage.getItem(noticeKeyOf(v)), markNoticed: (v) => { const noticeKey = noticeKeyOf(v); sessionStorage.setItem(noticeKey, String(Date.now())); } },
        pending: () => !!this._staleReloadAt,
        typing: () => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName)) && Date.now() - this._staleTyping.at < TYPING_QUIET_MS; },
        // work a reload would LOSE: an editor window's unsaved file (_editorDirty — the code and doc editors), or words the person TYPED
        // in a box during this page's life and no landed save or send has released (heldWords — a box nobody typed in never holds, whatever
        // it shows). The listener marks a multi-line box (a TEXTAREA) only — a single-line field, a search box, never holds by typing;
        // a box of any kind holds when a person's PRESS filled it and marked it (a drafter's billed proposal: learn-card.js, settings-ui.js).
        // NOT the chat box: its draft is saved 300 ms after a keystroke and comes back at load; key proxies (the live view's,
        // xpra's, xterm's) hold nothing — their keys are already sent
        unsaved: () => [...this.wm.windows.values()].some((w) => typeof w._editorDirty === 'function' && w._editorDirty())
          || heldWords([...document.querySelectorAll('textarea, input')].filter((x) => !x.matches('.chat-input, .browser-live-kbd, .xpra-ime, .xterm-helper-textarea')).map((x) => ({ typed: wasTyped(x), text: x.value, enabled: !x.disabled && !x.readOnly, connected: x.isConnected }))),
        // B-0ece: reload onto a server READY for a page, not one still booting (else the tab sits on the splash)
        waitReady: () => waitServerReady({ ...bootDeps() }),
        gaveUp: memo,
        schedule: (ms) => { clearTimeout(this._staleTimer); this._staleTimer = setTimeout(() => this._checkBundleFreshness(), ms); },
        say: (v, why) => this._staleSay(v, why),
        notice: (v) => showToast(t('This tab still runs VibeSpace {old} after its one reload for {new} — reload it yourself to update', { old: BUILD_VERSION, new: v }), { type: 'warn', duration: 12000 }),
        note: (d2, extra = {}) => navNote({ k: 'stale', b: BUILD_VERSION, s: memo.srv, d2, n: extra.n, why: extra.why }),   // the look's two extras by name (the diary's privacy census: a literal row, no spread)
        // the reload is PENDING, and the once-per-version stamp waits for the moment it fires (acceptance round 2: stamped
        // 800 ms early, a reconnect inside that window read «already reloaded» and burned the one notice — no reload yet)
        reload: (v) => {
          this._staleReloadAt = Date.now();
          try { track('event', 'stale-bundle-reload', BUILD_VERSION + ' -> ' + v); } catch { }
          showToast(t('VibeSpace was updated — reloading this tab…'));
          const key = keyOf(v);
          setTimeout(() => { sessionStorage.setItem(key, String(Date.now())); location.reload(); }, 800);
        },
      });
    } catch { } finally {
      this._staleBusy = false;
      if (this._staleAgain) { this._staleAgain = false; if (!this._staleReloadAt) { clearTimeout(this._staleTimer); this._staleTimer = setTimeout(() => this._checkBundleFreshness(), 0); } }
    }
  }

  /** THE ONE PINNED NOTICE of a page that is behind and will not reload now (stale-watch.js staleNotice): why, in words, with
   *  Reload as one press. Patched in place when the reason changes; its ✕ hides it FOR THAT VERSION (per tab); `v` null takes it
   *  away. The tries and the hold go on in silence whatever it shows. */
  _staleSay(v, why) {
    const hideKey = v ? 'vibespace.stale-hidden.' + v : '';
    const n = staleNotice({ v, why, hidden: !!(hideKey && sessionStorage.getItem(hideKey)) });
    const el = this._staleNoticeEl;
    if (!n) { if (el) { el.remove(); this._staleNoticeEl = null; } return; }
    if (el && el.isConnected && el.dataset.why === why) return;   // said already — never a second toast
    if (el) el.remove();
    const toast = showToast(t(n.words), { type: 'warn', pinned: true, action: { label: t(n.door), run: () => location.reload() } });
    toast.dataset.why = why;   // pinned (showToast): no timer, and the stack's cap of 4 never drops it
    toast.querySelector('.global-toast-x')?.addEventListener('click', () => { try { sessionStorage.setItem(hideKey, '1'); } catch { } });
    this._staleNoticeEl = toast;
  }


  _probeVncAvailability(attempt = 0) {
    fetchJson('/api/vnc/status').then((d) => {
      // fetchJson resolves null/undefined on HTTP errors — treat as a failed
      // probe (retry), not as "server says unavailable".
      if (d == null) throw new Error('probe failed');
      // B-323e follow (r2030 (3c)): a lookup that got NO REPLY is not «not installed» — the Desktop entry stays (opening it looks
      // again and says why), the picker's local row says it, and the probe asks again on the same back-off as a failed one
      this._vncLookup = d.lookup === 'no-reply' ? 'no-reply' : null;
      this._vncAvailable = !!d.available || this._vncLookup === 'no-reply';
      this._vncSeat = d.seat || null; // lane desktop-v2-entry (D4): the Desktop picker's local row says a Wayland seat's words
      if (this._vncLookup && attempt < 5) setTimeout(() => this._probeVncAvailability(attempt + 1), [3000, 8000, 20000, 45000, 90000][attempt]);
      const b = document.getElementById('btn-desktop');
      if (b) b.style.display = (this._vncAvailable && this.settings.get('toolbar.showDesktopButton') !== false) ? '' : 'none';
    }).catch(() => {
      // Page loaded during a server-restart window: retry with backoff so the
      // Desktop entry self-heals without needing an F5 or a ws transition
      // (userW hit the vanish repeatedly during an update storm).
      if (attempt < 5) setTimeout(() => this._probeVncAvailability(attempt + 1), [3000, 8000, 20000, 45000, 90000][attempt]);
    });
  }

  openBrowser(url, opts) { return openBrowserFn(this, url, opts); }
  openDesktop(opts) { return openDesktopFn(this, opts); }
  openDesktopApp(id, opts) { return openDesktopAppFn(this, id, opts); }
  /** agent browser P3 (§4.3): an EXPLICIT handback from the session card — the
   *  server flips the lease and announces through the gated ladder. */
  browserHandback(sessionId) {
    if (!sessionId) return;
    fetchJson('/api/browser/handback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) }).then((r) => {
      if (!r || r.error) { showToast(t('Handback failed: {why}', { why: r?.error || t('server unreachable') }), { type: 'error' }); return; }
      showToast(t('Control handed back to the agent'), { duration: 4000 });
    });
  }
  openBrowserLive(opts) { return openBrowserLiveFn(this, opts); } // agent browser P2: {sessionId, profileId?, syncId?}
  openBrowserLiveBeside(win, sessionId) { return openBrowserLiveBesideFn(this, win, sessionId); } // lane I: the window menu's live view — bound beside `win`, open-or-focus

  openTaskDetail(taskId, opts) { return openTaskDetailFn(this, taskId, opts); }
  openTaskLog(taskId, opts) { return openTaskLogFn(this, taskId, opts); }
  openUsage(opts) { return openUsageWindow(this, opts || {}); }
  openJobs(opts) { return openJobsWindow(this, opts || {}); }
  openSearch(opts) { return openSearchWindow(this, opts || {}); }
  openJobInteract(jobId, opts) { return openInteractWindow(this, jobId, opts || {}); }
  openChannel(adapterId, convId, opts) { return openChannelWindow(this, adapterId, convId, opts || {}); }
  /** .212: an agent's channel search AS RESULTS — the search dialog pre-filled, scoped to one conversation or grouped. */
  openChannelSearch(opts) { return openSearchResults(this, opts || {}); }
  /** lane pod-oauth-callback (study 1 L1 / study 2 M2): the Connect an account dialog OPEN ON ONE TYPE — the chat's
   *  «Connect <type>» row (an agent's `vibespace-channels connect <kind>`); the types are the panel's own (`kinds`). */
  async openChannelConnect(kind, { flowId = null, conversation = null } = {}) {   // B-8edd: `flowId` = the landed sign-in a For-you item names; B-e630: `conversation` {sessionKey, webuiId} — the chat it was opened from (its browser-profile fold)
    const d = await fetchJson('/api/channels?scope=accounts');
    if (!d || d.error) { showToast(t('Channels are not available on this instance'), { type: 'error' }); return null; }
    return showConnectAccountDialog(this, d.kinds || [], { kind: typeof kind === 'string' ? kind : null, flowId: typeof flowId === 'string' && flowId ? flowId : null, conversation: conversation && conversation.sessionKey ? conversation : null });
  }
  /** THE For-you window (design-user-inbox-reply §9) — a singleton kind; `{itemId, sessionKey, syncId}`:
   *  select that item / scope to that session; an open window is revealed and re-pointed (a replay never re-points). */
  openInbox(opts) { return openInboxWindow(this, opts || {}); }
  /** THE Outbox window (P3, design §9.2) — a singleton kind. */
  openChannelOutbox(opts) { return openChannelOutboxFn(this, opts || {}); }
  openMountReauth(id) { return this.sidebar?.openMountReauth?.(id); }
  /** B-8703 (主开发 r4450): For you's door of the long-lived token identity check — THAT account's long-lived token dialog (the row's
   *  own «Long-lived token…» in Manage agents opens the same) — src/lib/oat-door.js decides: the row in the list ⇒ its dialog; a list that
   *  cannot be read ⇒ said; a list not yet arrived ⇒ asked first; «gone» only once the list answered without it (r4586) */
  openOatDialog(id) {
    return openOatDoor({ id, getList: () => this._accounts, ask: () => this.refreshAccounts(), open: (a) => this._oatDialog?.(id, a), say: (w) => showToast(w),
      goneWords: () => t('This account is no longer in your list — there is nothing left to check: close this notice.'), heldWords: () => heldWordsOf({ code: 'accounts_unread' }) });   // r4586: «gone» only after the list ANSWERED without it
  }
  /** The Channels PANEL (the rail). Returns false where there is no rail —
   *  the caller (the ⚙ row) is gated on the same fact, so a dead entry point
   *  is never offered rather than offered and refused. */
  openChannels(opts) { return focusChannelsPanel(this, opts || {}); }
  /** ⚙ → Integrations (design §14.5). Every consumer deep-links to ITS card:
   *  `openIntegration('lark')` scrolls to and highlights that row; an id that
   *  no longer exists opens the window with nothing highlighted, never throws. */
  openIntegration(id, opts) { return openIntegrationsWindow(this, { focus: id || null, ...(opts || {}) }); }
  /** A DOOR TO ONE SETTING (lane setting-doors pick 1 — the owner: «…提供一个 vibespace://settings/ 之类的链接可以让我点了之后直通
   *  对应的选项来改»): THE ONE door every `vibespace://settings/<key>` link opens through — the chat's setting span
   *  (chat-renderers setupLinkHandler), a For-you item's words (user-todos-actions openLink, kind `setting`) and a toast
   *  (utils registerSettingLinks). Settings opens ON that row (settings-ui open({ focusKey })): its section in view, its nav
   *  group unfolded, an advanced / unused row drawn for this open, the row marked; a phone shows that section alone; an
   *  open Settings window moves there. A key that is no row opens Settings as the ⚙ does. A LINK OPENS, IT NEVER WRITES:
   *  no value rides it and nothing here touches a setting. */
  openSettingAt(key) {
    return this._settingsUI?.open(isSettingKey(key) ? { focusKey: key } : {});
  }

  // Diagnostics report: renders the local telemetry summary (client errors,
  // boot crashes, feature usage) as a static HTML page in the embedded
  // browser — same blob-URL pattern as the chat html Preview button.
  

  openSessionProps(sessionRef, opts) { return openSessionPropsFn(this, sessionRef, opts); }

  // Anthropic accounts (billing identity). Full snapshot incl. subscription
  // login state + importable CLI key; the accounts-updated broadcast keeps the
  // list fresh between refreshes.
  refreshAccounts() {
    return fetchJson('/api/accounts').then((d0) => askTails(d0 && d0.tailsGen).then((tl) => [d0, tl])).then(([d0, tl]) => {   // B-ee0a: the list's word decides whether the last read holds
      const d = withTails(d0, tl);   // B-ba7d: the list carries no key tail; the person's own read (POST /api/accounts/tails) lays it on
      if (d) this._accounts = { accounts: accountRowsOf(d), ...accountDefaultsOf(d), subscription: d.subscription || {}, cliKey: d.cliKey || {}, held: d.held || null, answered: true };   // answered: the list was asked and said (B-8703 r4586: its door's «gone» waits for it) // every harness's default field (agent-meta); `held`: the B-f276 family (r2947)
      if (d?.hostNames) this._hostNamesKnown = d.hostNames; // id→name for chips (2.244.1)
      return this._accounts;
    }).catch(() => this._accounts);
  }

  openWorkflowDetail(runId, opts) { return openWorkflowDetailFn(this, runId, opts); }
  /** lane agent-window-no-pop — THE FACTS every door that places an agent's window hands the PURE verdict (the desktop-app
   *  browser, the Design window, the live view): this client's chat windows (`looking` = the active window is that chat or
   *  a pane its split frame shows — the person is in that conversation), the active window, the shown desk, the phone, the
   *  page's visibility, the front setting → agentWindowPlacement's cell. */
  agentPlacement(msg) {
    const active = this.wm.activeWindowId || null;
    const chats = [...(this.sessions?.entries?.() || [])].map(([winId, v]) => {
      const w = this.wm.windows.get(winId); const ch = w && w._tabChain; const top = ch ? this.wm.windows.get(ch.tabs[0]) || w : w;
      const looking = !!active && (active === winId || !!(ch && ch.tabs.includes(active) && displayedPanes(ch).includes(String(winId))));
      return { winId, sessionId: v?.sessionId, minimized: !top || !!top.isMinimized, hidden: !top || !!top._hiddenByDesktop, deskId: top?._desktopId || null, looking };
    });
    return agentWindowPlacement({ msg, chats, active, desk: this.desktopManager?.activeDesktopId || null, phone: !!this.isMobile, visible: document.visibilityState !== 'hidden', front: this.settings?.get('desktop.agentWindowsFront') === true });
  }
  /** lane design-window-placement — PLACE a window a non-human opened (today the `design-open` push), the agent-window-no-steal
   *  rule: an agent's action may PLACE a window, only a person's may FOCUS one. The PURE verdict (the same the agent browser
   *  asks) decides; then `open(p, { focus })` MAKES (or, for an already-open design, re-pulses) the window and returns
   *  `{ win, fresh }`. A FRESH window is positioned here — beside its chat (snapped: the conversation to the left half, the
   *  Design to the right), on the chat's desktop (no switch), or behind the active window — and its taskbar entry pulses; an
   *  EXISTING one placed itself (markArrived + its tab, never raised), so it is left where the person put it. The front
   *  setting restores the old front + focus. lane agent-window-no-pop: `card` (the chat is not where the person looks) opens
   *  NOTHING — `card(p)` leaves the chat's card, and the chat's taskbar entry gets the badge; the person's Open is the door.
   *  (The desktop-app-opened handler keeps its own inline mechanics above — its already-open case restacks rather than
   *  re-pulses — so this serves the Design window; both read ONE verdict.) */
  placeAgentWindow(msg, open, card = null) {
    const p = this.agentPlacement(msg);
    if (p.act === 'none') return null;
    if (p.act === 'card') { this.wm.markArrived(p.fromWin); if (card) card(p); return null; } // nothing moves on the desk the person is using
    const r = open(p, { focus: !!p.focus }) || {};
    const w = r.win;
    if (!w || p.focus) return w || null; // the front setting (or a person's door inside `open`) already focused it
    if (r.fresh) { // an EXISTING window placed itself (never raised); only a FRESH one is positioned + pulsed here
      const host = p.fromWin && this.wm.windows.get(p.fromWin);
      if (p.act === 'beside' && host) { this.wm.snapToHalf(p.fromWin, 'left'); this.wm.snapToHalf(w.id, 'right'); } // the owner's picture: the conversation LEFT, the Design RIGHT, same desktop — a geometry change, never a focus change (the person is in that conversation)
      else if (p.act === 'desk') this.desktopManager?.moveWindowToDesktop(w.id, p.deskId); // created on the chat's desktop: hidden there, no switch
      else if (!w._tabChain) this.wm.placeBehind(w.id); // a free window goes under the active one
      if (p.badge) this.wm.markArrived(w.id);
    }
    return w;
  }
  /** The Design window for one design folder ({host, dir, sessionId}) — the chip's Open, the hub's push, layout replay. */
  openDesign(opts) { return openDesignFn(this, opts || {}); }
  /** The design publish dialog (the window's Publish… and the chip's). */
  publishDesign(opts) { return openDesignPublishDialog(this, opts || {}); }
  /** The Doc window for one markdown file ({host, path, from}) — openFile's `.md` route, layout replay. */
  openDoc(opts) { return openDocFn(this, opts || {}); }
  openArtifacts(opts) { return openArtifactsFn(this, opts || {}); }

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

  // Host id → display name, resolved for remote-file window titles etc. Lazily
  // loaded from /api/hosts and cached (the sidebar's _hostNames is only present
  // once the Remote tab has rendered, so titles showed the raw host id).
  hostName(id) { return (this._hostNames && this._hostNames[id]) || id; }
  async _ensureHostNames() {
    if (this._hostNames) return this._hostNames;
    this._hostNames = {};
    try { const d = await fetchJson('/api/hosts'); for (const h of d?.hosts || []) this._hostNames[h.id] = h.name; } catch {}
    // keep it fresh when hosts change
    if (!this._hostNamesWired) { this._hostNamesWired = true; this.ws.onGlobal((m) => { if (m.type === 'hosts-updated' || m.type === 'user-state-updated') this._hostNames = null; }); }
    return this._hostNames;
  }

  /** `opts.from` = the window the open came FROM (F2): the same path already in
   *  its chain is shown instead; otherwise the placement is resolved NOW (the
   *  act) and rides `opts.intoChain` through FileViewer.open's async checks.
   *  `opts.quiet` (lane artifacts-auto-open-quiet — ONLY the chat's automatic open of a doc the agent wrote): the window
   *  is created QUIET (createWindow) — never the focus, the caret or the keyboard; a user's own open never passes it. */
  /** lane chat-mermaid: 「放大」 — a diagram's source at full size in a viewer window (FileViewer.openDiagram). */
  openDiagram(code, opts = {}) { return FileViewer.openDiagram(this, { code, ...opts }); }

  openFile(filePath, fileName, opts = {}) {
    // lane outbox-attachment-preview: a file served BY URL (`{rawUrl, fileName, title}` — an attachment, no path on any disk)
    if (filePath && typeof filePath === 'object' && filePath.rawUrl) return FileViewer.openUrl(this, filePath);
    // lane doc-window: a markdown file opens as the Doc window (rendered, editable, commentable); a `:line` link, the hex
    // view and a derived temp file keep the editor's door. `from` (a window id) → the chat session it shows = the owner witness
    if (/\.(md|markdown)$/i.test(fileName || filePath) && !opts.line && !opts.hex && !opts._tempFile && !opts.via) {
      if (opts.from && this._focusOpenInChain(opts.from, { path: filePath, host: opts.host, quiet: !!opts.quiet })) return;
      return this.openDoc({ host: opts.host || '', path: filePath, from: (opts.from && this.sessions.get(opts.from)?.sessionId) || '', intoChain: opts.from ? this.linkPlacement(opts.from) : opts.intoChain, syncId: opts.syncId, ...(opts.quiet ? { quiet: true } : {}), ...(opts.attended ? { attended: true } : {}) });   // B-23e5: a press rides into the doc window's first read
    }
    if (opts.from) {
      if (this._focusOpenInChain(opts.from, { path: filePath, host: opts.host, line: opts.line, quiet: !!opts.quiet })) return;
      const { from, ...rest } = opts;
      opts = { ...rest, intoChain: this.linkPlacement(from), fromWin: from }; // lane artifacts-model: the editor's save counts on the source chat's deliverable row
    }
    FileViewer.open(this, filePath, fileName, opts);
  }

  openEditor(filePath, fileName, opts = {}) {
    this._hideWelcome();
    // Front-truncate the path (like the file explorer) so the taskbar/title-bar
    // CSS end-ellipsis keeps the filename visible instead of cutting it off.
    // Remote files carry a "<host>: " prefix (like the explorer) so it's clear
    // the file is NOT local. Name may not be cached yet — set it now with the
    // best value, then re-title once _ensureHostNames resolves.
    const hostPfx = (h) => opts.host ? (h(opts.host) || opts.host) + ': ' : '';
    const title = opts._tempFile ? t('View: {name}', { name: fileName }) : hostPfx((id) => this.hostName(id)) + frontTruncate(filePath);
    // a window the VIEW door opened (lane file-preview-mount: an HTML page's preview, restored by the layout) keeps its door
    const openSpec = opts._tempFile ? undefined : { action: opts.view ? 'openFile' : 'openEditor', path: filePath, name: fileName, ...(opts.host ? { host: opts.host } : {}) };
    const winInfo = this.wm.createWindow({ title, type: 'editor', syncId: opts.syncId, openSpec, intoChain: opts.intoChain, quiet: !!opts.quiet });
    if (opts.host && !opts._tempFile) this._ensureHostNames().then(() => { try { this.wm.setTitle(winInfo.id, this.hostName(opts.host) + ': ' + frontTruncate(filePath)); } catch {} });
    winInfo._filePath = filePath; winInfo._fileName = fileName;
    new CodeEditor(winInfo, filePath, fileName, this, opts);
    winInfo.onClose = () => {
      if (opts._onCloseDelete) opts._onCloseDelete();
      this._checkWelcome();
    };
    return winInfo;
  }

  // Delegate to extracted external-editor.js module
  _openExternalEditor(filePath, signalPath, sessionId, host) { openExternalEditor(this, filePath, signalPath, sessionId, host); }
  _closeExternalEditor(signalPath) { closeExternalEditor(this, signalPath); }

  _hideWelcome() { document.getElementById('welcome').classList.add('hidden'); }
  _checkWelcome() {
    const activeDesk = this.desktopManager?.activeDesktopId;
    let hasWindows = false;
    if (activeDesk) {
      for (const [, win] of this.wm.windows) {
        if (win._desktopId === activeDesk && !win._hiddenByDesktop && win.type !== 'form') { hasWindows = true; break; }
      }
    } else {
      hasWindows = [...this.wm.windows.values()].some((w) => w.type !== 'form'); // lane dialog-yield r2: a form is not a window the welcome counts (closing one re-checks — form-window.js)
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
      // the group moves as ONE frame (its host) and shows THIS session's tab — a host's own tab included
      const host = win._tabChain ? this.wm.windows.get(win._tabChain.tabs[0]) : null;
      const targetId = host ? host.id : winId, targetWin = host || win;
      const dm = this.desktopManager;
      const start = () => { this.wm.revealWindow(win.id); this.wm.startMoveMode(targetWin.id); };   // the windows held, their ids read when the switch lands (r2355)
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
        this.goToWinId(winId);
        break;
      }
    }
  }

  // Window-id based go-to (2.212.0): the title-bar/taskbar "Switch window"
  // submenu targets ANY window type, not just sessions. Same semantics as
  // goToWindow: tab-chain resolve, stage-aware, cross-desktop switch, flash.
  // The window itself is shown through wm.revealWindow (inc-muiq348r-jwb5: a
  // group's HOST is switched to as well — this used to resolve only a guest).
  goToWinId(winId, { since } = {}) {   // B-c87d: `since` = when the person's go-to began, for a caller that lands after an await
    const win = this.wm.windows.get(winId);
    if (!win) return;
    // the FRAME that carries it (a tab group's host) — the desktop, the flash
    const targetWin = (win._tabChain && this.wm.windows.get(win._tabChain.tabs[0])) || win;

    const dm = this.desktopManager;
    const doFlash = () => {
      this.wm.revealWindow(win.id);   // the window held, its id read when the switch lands (r2355)
      targetWin.element.classList.add('window-find-flash');
      setTimeout(() => targetWin.element.classList.remove('window-find-flash'), 3000);
    };
    if (this.stage?.isActive) {
      // On the stage, "go to" means MATERIALIZE as the hero — focusWindow
      // is the stage's interception point. Switching desktops out from
      // under the stage desynced the view (real report: desktop switched
      // while the preview stayed on the stage).
      doFlash();
    } else if (dm && targetWin._desktopId && targetWin._desktopId !== dm.activeDesktopId) {
      dm.switchTo(targetWin._desktopId).then(doFlash);
    } else {
      doFlash();
    }
    const session = this.sessions.get(winId);
    if (session && since !== undefined) lateFocus(session, { win, since });   // B-c87d: a late go-to keeps the keys where the person put them since
    else if (session) session.focus?.();
  }

  // Flash a window's title bar + taskbar item to help user find it
  flashWindow(serverSessionId) {
    for (const [winId, term] of this.sessions) {
      if (term.sessionId === serverSessionId) {
        const win = this.wm.windows.get(winId);
        if (!win) break;

        const dm = this.desktopManager;

        // Resolve the visible window: a tab group flashes as its HOST frame, showing THIS tab
        const host = win._tabChain ? this.wm.windows.get(win._tabChain.tabs[0]) : null;
        const flashWin = host || win;
        const flashWinId = flashWin.id;

        // If window is on another desktop, flash its rect in the desktop preview ('find' never switches a
        // desktop) — its group is set to show THIS tab there, raised nowhere
        if (dm && flashWin._desktopId && flashWin._desktopId !== dm.activeDesktopId) {
          this.wm.revealWindow(winId, { raise: false });
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
        this.wm.revealWindow(winId); // THIS session's own tab (a host too — inc-muiq348r-jwb5), the group restored, raised
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
      this._nsGrantPending?.(session.sessionId); // lane new-session-form: the ticked accounts' access rows + the tools pick, once the session's own id exists
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
      if (this.isMobile) session.setBillingIdentity?.(match.auth || null, (el) => this.showBillingSwitcher(win.id, el));   // the window held (r2355)
      session.setCostBasis?.(match.auth || null); // lane door-healthy-chat: the cost chip's «· included in your subscription»
      if (win._openSpec) {
        // NEVER write the webui server id into backendSessionId: a session
        // whose CLI hasn't reported its real id yet (remote spawns stay in
        // that state for a long time) used to get `sess-N-…` baked into the
        // spec — other clients then re-resolved against that bogus id, missed,
        // and opened a BLANK view-only window (real report, remote hosts).
        const realBsid = match.backendSessionId
          || (match.sessionId && match.sessionId !== match.webuiId ? match.sessionId : null);
        const specWas = JSON.stringify(win._openSpec);
        Object.assign(win._openSpec, {
          backend: match.backend || win._openSpec.backend || 'claude',
          backendSessionId: realBsid || win._openSpec.backendSessionId || null,
          sessionKey: realBsid ? (match.sessionKey || getSessionKey(match)) : (win._openSpec.sessionKey || ''),
          // Live session entries carry the host under `host` (not `hostId`) —
          // reading only match.hostId meant a remote session's spec NEVER got
          // its host backfilled, so after the session died the replay/view
          // fetch went host-less and opened blank (real fleet report: 5
          // pre-hostId-era windows on userL's layout, dead after an OOM).
          hostId: match.host ?? match.hostId ?? win._openSpec.hostId ?? null,
          name: match.name || win._openSpec.name || '',
          agentKind: match.agentKind || 'primary',
          agentRole: match.agentRole || '',
          agentNickname: match.agentNickname || '',
          sourceKind: match.sourceKind || '',
          parentThreadId: match.parentThreadId || null,
        });
        // the identity it learned (a backend id landing, a host backfilled) is persisted by the layout autosave —
        // asked HERE, where it changed (lane badge-stale: it used to ride setTitleMeta's per-merge notify, which is
        // now a no-op for an unchanged meta; the autosave's own gates — user-dirty, unchanged state — still apply)
        if (JSON.stringify(win._openSpec) !== specWas) this.layoutManager?.scheduleAutoSave?.();
      }
      if (win._openSpec?.action === 'viewSession' || win._openSpec?.action === 'attachSession') {
        // THE name ladder's given rungs (src/session-name.js: the rename › a given name › the CLI's own title — lane
        // session-title-record), then the window's own fallbacks — a title the CLI picks mid-session renames the window live
        // lane door-day-one-landing (the naive-user studies: the first chat stayed «Session 3»): after the given rungs, the FIRST
        // MESSAGE (discovery's `name` — the card's rung ④) names the window before the server's generated «Session N»; a row
        // with no transcript yet carries name === webuiName, so the order only matters once the first message exists
        const displayName = sessionGivenName(match, this.sidebar.getCustomName?.(match)) || match.name || match.webuiName || win._openSpec?.name || win.title || t('Session');
        const cwd = match.cwd || win._openSpec?.cwd || '';
        this.wm.setTitle(winId, cwd ? `${displayName} — ${cwd}` : displayName);
      }
    }
      try { this.stage?.onIdentitySync?.(); } catch { }
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
    for (const name of BUILTIN_THEMES) sel.appendChild(opt(name, themeWord(name, t)));   // the ONE theme word (value-words.js)
    const customKeys = this.themeManager.getThemeNames().filter(n => n.startsWith('custom-'));
    if (customKeys.length) {
      const sep = document.createElement('option'); sep.disabled = true; sep.textContent = '── ' + t('Custom') + ' ──'; sel.appendChild(sep);
      for (const key of customKeys) sel.appendChild(opt(key, key.slice(7)));
    }
    // plugin-contributed themes (Plugin Ph4) — labelled "<label> (plugin)" by the plugin client
    const pluginThemes = this.themeManager.getPluginThemes?.() || [];
    if (pluginThemes.length) {
      const sep = document.createElement('option'); sep.disabled = true; sep.textContent = '── Plugins ──'; sel.appendChild(sep);
      for (const th of pluginThemes) sel.appendChild(opt(th.key, th.label));
    }
  }

  _refreshThemeDropdown() {
    const sel = document.getElementById('global-theme-select');
    if (sel) { this._populateThemeSelect(sel); sel.value = this.themeManager.current; }
  }

  async _loadCustomThemes() {
    const themes = await fetchJson('/api/custom-themes');
    if (!themes) return;
    // B-225b (R4, R13): a HELD themes file is no list — nothing registered or dropped from it, and the pending theme keeps
    // waiting (never the 'dark' fallback written in its place); its lift loads them again (onStoreLift above)
    if (typeof themes.error === 'string') { noteStoreHeld(themes.held); return; }   // (a refusal's words — a theme may be NAMED «error»: its value is an object)
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

/** One changelog entry `{version, head, body, lang}` (GET /api/changelog-diff)
 *  as DOM: `v<version> — <date>`, then per line of the body a heading
 *  (`### Section`, the section word already in the file's language), a list
 *  item (`- bullet`) or a paragraph (anything else: an old-format entry, an
 *  intro). textContent throughout; `lang` on the box so CJK text gets its own
 *  font. */
function changelogEntryEl(e) {
  const el = (tag, cls) => { const x = document.createElement(tag); if (cls) x.className = cls; return x; };
  const plain = (s) => s.replace(/\*\*(.+?)\*\*/g, '$1');
  const box = el('div', 'ucl-entry');
  if (e.lang) box.lang = e.lang;
  const ver = el('div', 'ucl-ver');
  const date = (/^\S+\s+—\s+(\d{4}-\d{2}-\d{2})$/.exec(String(e.head || '').trim()) || [])[1];
  ver.textContent = `v${e.version}${date ? ` — ${date}` : ''}`;
  box.append(ver);
  let ul = null;
  for (const raw of String(e.body || '').split('\n')) {
    const line = raw.trim();
    if (!line) { ul = null; continue; }
    let m;
    if ((m = /^#{3,6}\s+(.+)$/.exec(line))) { const h = el('h4', 'ucl-sec'); h.textContent = plain(m[1]); box.append(h); ul = null; continue; }
    if ((m = /^[-*]\s+(.+)$/.exec(line))) {
      if (!ul) { ul = el('ul', 'ucl-items'); box.append(ul); }
      const li = el('li'); li.textContent = plain(m[1]); ul.append(li);
      continue;
    }
    const para = el('p', 'ucl-para'); para.textContent = plain(line); box.append(para); ul = null;
  }
  return box;
}

// Prototype mixins split out of this file (2.82.0 audit) — installed at import time, before any instantiation.
installManageAgents(App);
installPluginsUI(App);

installUsageMeter(App);
installSessionLifecycle(App);
installSetupFlows(App);
installBrowserProfilePicker(App);
installBrowserTakeovers(App);
installNewSessionForm(App); // lane new-session-form
installBrowserLive(App); // agent browser P7 (§4.6): onBrowserDigestChanged → the live view born beside its session
installBrowserSwitcher(App);
installBrowserTrace(App);
installBrowserReplay(App);

// ── WINDOW-TYPE REGISTRATIONS (Plugin Ph1): the kinds App itself opens ──
registerWindowType({
  type: 'files', label: 'File Explorer',
  icon: svgIcon16('<path d="M2 3h4l2 2h6v8H2V3z"/>'),
  action: 'openFileExplorer', replay: (app, spec, { syncId } = {}) => app.openFileExplorer(spec.path, { syncId, host: spec.host }),
});
registerWindowType({
  type: 'editor', label: 'Editor',
  icon: svgIcon16('<path d="M11.5 1.5l3 3L5 14H2v-3z"/>'),
  action: 'openEditor', replay: (app, spec, { syncId } = {}) => app.openEditor(spec.path, spec.name, { syncId, host: spec.host }),
});

/**
 * Settings Schema — single source of truth for all configurable options.
 *
 * Each key is a dotted path (e.g. 'toolbar.showLayoutPresets').
 * Only non-default values are persisted (sparse storage).
 */

import { t } from './i18n.js';

const SETTINGS_SCHEMA = {
  // ── Toolbar & Layout ──
  'toolbar.showLayoutPresets': {
    type: 'boolean', default: true, label: t('Show layout presets'),
    description: t('Show the entire layout presets bar (built-in presets, custom grids, and + add button)'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'toolbar.showBrowserButton': {
    type: 'boolean', default: true, label: t('Show Browser button'),
    description: t('Show the embedded-browser button in the toolbar'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'toolbar.showTerminalButton': {
    type: 'boolean', default: true, label: t('Show Terminal button'),
    description: t('Show the plain-shell terminal button in the toolbar'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'toolbar.showPresetsButton': {
    type: 'boolean', default: true, label: t('Show Presets button'),
    description: t('Show the saved workspace presets button in the toolbar'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'toolbar.showFileExplorerButton': {
    type: 'boolean', default: true, label: t('Show Files button'),
    description: t('Show the file explorer button in the toolbar'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'sidebar.position': {
    type: 'enum', default: 'left', options: [
      { value: 'left', label: t('Left') },
      { value: 'right', label: t('Right') },
    ], label: t('Sidebar position'),
    description: t('Which screen edge the session sidebar docks to'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'taskbar.position': {
    type: 'enum', default: 'bottom', options: [
      { value: 'bottom', label: t('Bottom') },
      { value: 'top', label: t('Top') },
    ], label: t('Taskbar position'),
    description: t('Dock the taskbar (window list, desktop previews, usage) to the top or bottom of the screen'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'taskbar.visibility': {
    type: 'enum', default: 'show', options: [
      { value: 'show', label: t('Always visible') },
      { value: 'autohide', label: t('Auto-hide (reveal on edge hover)') },
      { value: 'hidden', label: t('Hidden') },
    ], label: t('Taskbar visibility'),
    description: t('Auto-hide slides the taskbar away and reveals it when the pointer touches the screen edge. Hidden removes it entirely (desktops still switch with Ctrl+Alt+Left/Right)'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'taskbar.showDesktopPreviews': {
    type: 'boolean', default: true, label: t('Show desktop previews'),
    description: t('Show the virtual-desktop miniature previews in the taskbar'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'taskbar.showUsage': {
    type: 'boolean', default: true, label: t('Show usage meters'),
    description: t('Show the 5h/7d rate-limit donuts in the taskbar'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'taskbar.showUserTodos': {
    type: 'boolean', default: true, label: t('Show the "For you" inbox'),
    description: t('Show the inbox of items agents filed for you (decisions/input needed) in the taskbar'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'taskbar.showWindowCount': {
    type: 'boolean', default: true, label: t('Show window count'),
    description: t('Show the "N windows" counter/list button in the taskbar'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'toolbar.showCommandMode': {
    type: 'boolean', default: true, label: t('Enable command mode'),
    description: t('Enable Ctrl+\\ command mode for keyboard-driven window management'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'layout.enableDragSnap': {
    type: 'boolean', default: true, label: t('Snap on drag'),
    description: t('Snap windows to grid cells or screen edges when dragging'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'layout.enableShiftDragSelection': {
    type: 'boolean', default: true, label: t('Shift-drag cell selection'),
    description: t('Hold Shift while dragging title bar to select a range of grid cells'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'layout.shakeBypassSnap': {
    type: 'boolean', default: true, label: t('Shake to bypass snap'),
    description: t('Shake a window vigorously for ~1 second while dragging to turn off grid/edge snap for the rest of that drag (a mouse-only alternative to holding Alt)'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'layout.shakeBypassSeconds': {
    type: 'number', default: 1, min: 0.3, max: 3, step: 0.1, label: t('Shake duration (seconds)'),
    description: t('How long you must keep shaking before grid snap turns off. Lower = triggers faster (but easier to trigger by accident).'),
    category: t('Toolbar & Layout'), liveApply: true,
  },

  'taskbar.desktopPreviewRatio': {
    type: 'number', default: 70, min: 30, max: 100, step: 5,
    label: t('Desktop preview size (%)'),
    description: t('How much of the taskbar height the desktop preview occupies (rest goes to label text)'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'chrome.arrangement': {
    type: 'json', default: null,
    label: t('Chrome element arrangement'),
    description: t('Which bar hosts each movable element, in what order ({zone: [elementId, …]}). Managed by Customize mode (⚙ → Customize UI… → drag elements); edit by hand only if you know what you are doing.'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'chrome.zoneAlign': {
    type: 'json', default: null,
    label: t('Chrome alignment'),
    description: t('Alignment per area: taskbar-items left/center (Windows-11-style centered icons), toolbar-center left/center/right, taskbar-tray left/right end. Managed by Customize mode.'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'chrome.springs': {
    type: 'json', default: null,
    label: t('Spring configs'),
    description: t('Per-spring config: {mode:"flex", weight:1-9} (strength = flex-grow share) or {mode:"fixed", px:N} (rigid spacer). Managed by Customize mode (click a spring).'),
    category: t('Toolbar & Layout'), liveApply: true,
  },

  // ── Window ──
  'window.enableBounceOnFocus': {
    type: 'boolean', default: false, label: t('Bounce on remote focus'),
    description: t('Briefly scale-bounce windows when focused from sidebar or taskbar'),
    category: t('Window'), liveApply: true,
  },
  'window.tabWrap': {
    type: 'boolean', default: false,
    label: t('Multi-row tabs'),
    description: t('Allow tab bar to wrap into multiple rows when there are many tabs (like a flow layout)'),
    category: t('Window'), liveApply: true,
  },
  'window.closeBehavior': {
    type: 'enum', default: 'terminate',
    options: [
      { value: 'terminate', label: t('Terminate session') },
      { value: 'detach', label: t('Detach (keep alive)') },
    ],
    label: t('Window close behavior'),
    description: t('What happens when closing a terminal window: terminate the session, or detach and keep it running'),
    category: t('Window'), liveApply: true,
  },
  'window.activeHighlightIntensity': {
    type: 'enum', default: 'normal',
    options: [
      { value: 'subtle', label: t('Subtle') },
      { value: 'normal', label: t('Normal') },
      { value: 'strong', label: t('Strong') },
    ],
    label: t('Active window highlight'),
    description: t('How prominently the focused window is highlighted (subtle = shadow only, normal = accent border, strong = border + glow)'),
    category: t('Window'), liveApply: true,
  },

  // ── Terminal ──
  'terminal.minimumContrastRatio': {
    type: 'number', default: 1, min: 1, max: 21, step: 0.5,
    label: t('Minimum contrast ratio'),
    description: t('Auto-adjust text colors to meet this contrast ratio (4.5 = WCAG AA). Set to 1 to disable.'),
    category: t('Terminal'), liveApply: false,
  },
  'terminal.preserveCustomTitle': {
    type: 'boolean', default: false, label: t('Preserve custom session title'),
    description: t('Prevent Claude\'s OSC title updates from overwriting user-set session names'),
    category: t('Terminal'), liveApply: true,
  },
  'terminal.preserveScrollOnFit': {
    type: 'boolean', default: false, label: t('Preserve scroll on resize'),
    description: t('Keep viewport scroll position anchored when terminal is resized'),
    category: t('Terminal'), liveApply: true,
  },
  'terminal.waitingBlinkBehavior': {
    type: 'enum', default: 'onlyUnfocused',
    options: [
      { value: 'always', label: t('Always') },
      { value: 'onlyUnfocused', label: t('Only when window not focused') },
      { value: 'never', label: t('Never') },
    ],
    label: t('Waiting blink behavior'),
    description: t('When to show the orange blink on idle terminals'),
    category: t('Terminal'), liveApply: true,
  },

  // ── Chat ──
  'chat.compactMode': {
    type: 'boolean', default: true, label: t('Compact mode'),
    description: t('Dense document-style layout instead of chat bubbles. Closer to TUI information density.'),
    category: t('Chat'), liveApply: true,
  },
  'chat.roleIndicator': {
    type: 'enum', default: 'border',
    options: [
      { value: 'border', label: t('Color border') },
      { value: 'background', label: t('Background tint') },
      { value: 'icon', label: t('Icon') },
      { value: 'label', label: t('Text label (You/Claude)') },
    ],
    label: t('Role indicator style'),
    description: t('How to visually distinguish user vs assistant messages in compact mode.'),
    category: t('Chat'), liveApply: true,
  },

  // ── Session ──
  'session.defaultMode': {
    type: 'enum', default: 'chat',
    options: [
      { value: 'terminal', label: t('Terminal') },
      { value: 'chat', label: t('Chat') },
    ],
    label: t('Default session mode'),
    description: t('Default mode for new sessions and single-click resume from sidebar'),
    category: t('Session'), liveApply: true,
  },
  'accounts.shipSubscriptionToRemote': {
    type: 'boolean', default: false,
    label: t('Ship subscription logins to remote hosts'),
    description: t('OFF (recommended): a subscription (Pro/Max) account can only run on THIS machine; for a remote host, log in on the host instead. Turning this ON copies the subscription’s login to the remote host — its token then appears from that host’s IP (often a datacenter), which can look like account abuse to Anthropic and risk a ban. API-key accounts are always allowed on remote hosts and are unaffected by this.'),
    category: t('Session'), liveApply: true,
  },
  'agents.stopBookkeepingNudge': {
    type: 'boolean', default: true,
    label: t('Stop-time bookkeeping nudge for agents'),
    description: t('When an agent finishes a turn while its board state is stale (no status update in 10 minutes), it gets one short follow-up asking it to set vibespace-status, mirror open questions with vibespace-ask, and log finished work — then it stops. At most once per 30 minutes per session. Claude enforces this via a blocking Stop hook; Codex via its wrapper at turn end.'),
    category: t('Session'), liveApply: true,
  },
  'agents.perTurnToolReminder': {
    type: 'boolean', default: true,
    label: t('Per-turn tool reminder for agents'),
    description: t('Injects a one-line (~250 byte) reminder of the vibespace tools (status / ask / task) with every prompt you send, so agents keep using them in long sessions — the full rules injected at session start scroll out of the working context over time. Turn off to save the few tokens per turn.'),
    category: t('Session'), liveApply: true,
  },
  'accounts.onDemandQuotaRefresh': {
    type: 'enum', default: 'manual',
    options: [
      { value: 'manual', label: t('Manual only (⟳ button)') },
      { value: 'auto', label: t('Auto on popup open (when >30 min stale)') },
      { value: 'off', label: t('Off (never contact Anthropic)') },
    ],
    label: t('On-demand quota refresh (model-scoped limits like Fable)'),
    description: t('The passive statusline feed only carries the 5h/7d windows — model-scoped weekly limits (e.g. Fable) can ONLY come from asking Anthropic’s usage endpoint with the account’s own login token. This is the same non-billable call the CLI makes when you run /usage, throttled to ≥60s per account and honoring rate-limit backoff, and it NEVER runs on a timer. It is user-initiated traffic, categorically different from the background polling that has gotten accounts banned — but it is still an off-CLI request with a subscription token, so it is your call: Manual = only when you click ⟳; Auto = also once when you open the quota popup and the data is stale; Off = never (the ⟳ button disappears and scoped limits stay unknown).'),
    category: t('Session'), liveApply: true,
  },
  'accounts.activeUsagePolling': {
    type: 'boolean', default: false, confirmOn: true,
    label: t('⚠ Actively poll subscription usage (automation risk)'),
    description: t('OFF (recommended): usage bars are captured passively from your live terminal sessions — VibeSpace never contacts Anthropic on its own. Turning this ON restores the old behavior: the server calls Anthropic’s usage endpoint on a ~90s timer with each subscription’s token, even for idle accounts. That off-CLI, fixed-cadence, non-human traffic is exactly what can get a Pro/Max account flagged as automated and BANNED — a real account was banned+refunded for this. Only enable it if you accept that risk (e.g. to see live usage for chat-only or idle accounts).'),
    category: t('Session'), liveApply: true,
  },

  // ── Claude ──
  'claude.defaultModel': {
    type: 'enum', default: '', combobox: true,
    options: [
      { value: '', label: t('Default') },
      { value: 'fable', label: 'fable (latest, 200k)' },
      { value: 'fable[1m]', label: 'fable[1m] (latest, 1M context)' },
      { value: 'opus', label: 'opus (latest, 200k)' },
      { value: 'opus[1m]', label: 'opus[1m] (latest, 1M context)' },
      { value: 'sonnet', label: 'sonnet (latest)' },
      { value: 'sonnet[1m]', label: 'sonnet[1m] (latest, 1M context)' },
      { value: 'haiku', label: 'haiku (latest)' },
    ], // dynamically updated from /api/available-models; Custom... allows typing full model IDs
    label: t('Default model'),
    description: t('Select an alias or choose "Custom..." to type a specific model ID (e.g. claude-opus-4-6-20250414).'),
    category: t('Claude'), liveApply: true,
  },
  'claude.defaultPermissionMode': {
    type: 'enum', default: '',
    options: [
      { value: '', label: t('Default') },
      { value: 'auto', label: t('Auto') },
      { value: 'bypassPermissions', label: t('Bypass') },
      { value: 'plan', label: t('Plan') },
      { value: 'acceptEdits', label: t('Accept Edits') },
    ],
    label: t('Default permission mode'),
    description: t('Default Claude permission mode for new or resumed Claude sessions.'),
    category: t('Claude'), liveApply: true,
  },
  'claude.defaultEffort': {
    type: 'enum', default: '', combobox: true,
    options: [
      { value: '', label: t('Auto (model default)') },
      { value: 'low', label: t('Low') },
      { value: 'medium', label: t('Medium') },
      { value: 'high', label: t('High') },
      { value: 'max', label: t('Max') },
    ], // dynamically updated from claude --help; Custom... allows typing values like xhigh
    label: t('Default effort level'),
    description: t('Select a level or choose "Custom..." to type any value (e.g. xhigh).'),
    category: t('Claude'), liveApply: true,
  },
  'claude.defaultExtraArgs': {
    type: 'text', default: '',
    label: t('Default extra args'),
    description: t('Extra Claude CLI args appended when starting a Claude session.'),
    category: t('Claude'), liveApply: true,
  },
  'claude.tuiRenderer': {
    type: 'enum', default: '',
    options: [
      { value: '', label: t('Auto (CLI preference)') },
      { value: 'fullscreen', label: t('Fullscreen (flicker-free)') },
      { value: 'classic', label: t('Classic (main screen)') },
    ],
    label: t('Terminal TUI renderer'),
    description: t('Renderer for terminal-mode Claude sessions. "Fullscreen" forces the flicker-free alternate-screen renderer with virtualized scrollback (CLAUDE_CODE_NO_FLICKER=1, same as /tui fullscreen); "Classic" forces the main-screen renderer; "Auto" follows the preference saved by the CLI (/tui). Applies to newly started sessions.'),
    category: t('Claude'), liveApply: true,
  },

  // ── Codex ──
  'codex.defaultModel': {
    type: 'enum', default: '', combobox: true,
    options: [
      { value: '', label: t('Default') },
    ],
    label: t('Default model'),
    description: t('Select a known model or choose "Custom..." to type a specific model ID.'),
    category: t('Codex'), liveApply: true,
  },
  'codex.defaultPermissionMode': {
    type: 'enum', default: '',
    options: [
      { value: '', label: t('Default') },
      { value: 'read-only', label: t('Read Only') },
      { value: 'safe-yolo', label: t('Safe Yolo') },
      { value: 'yolo', label: t('Yolo') },
    ],
    label: t('Default permission mode'),
    description: t('Default Codex permission mode for new or resumed Codex sessions.'),
    category: t('Codex'), liveApply: true,
  },
  'codex.defaultEffort': {
    type: 'enum', default: '',
    options: [
      { value: '', label: t('Auto (model default)') },
      { value: 'minimal', label: t('Minimal') },
      { value: 'low', label: t('Low') },
      { value: 'medium', label: t('Medium') },
      { value: 'high', label: t('High') },
      { value: 'xhigh', label: t('XHigh') },
    ],
    label: t('Default effort level'),
    description: t('Default Codex reasoning effort for new or resumed Codex sessions.'),
    category: t('Codex'), liveApply: true,
  },
  'codex.defaultExtraArgs': {
    type: 'text', default: '',
    label: t('Default extra args'),
    description: t('Extra Codex CLI args appended when starting a Codex session.'),
    category: t('Codex'), liveApply: true,
  },

  // ── Sidebar ──
  'sidebar.defaultTab': {
    type: 'enum', default: 'folders',
    options: [
      { value: 'folders', label: t('Folders (sessions by directory)') },
      { value: 'tasks', label: t('Task Groups') },
      { value: 'mounts', label: t('Remote') },
    ],
    label: t('Default sidebar tab'),
    description: t('Which sidebar tab opens on page load'),
    category: t('Sidebar'), liveApply: false,
  },
  'sidebar.defaultBoardView': {
    type: 'enum', default: 'groups',
    options: [
      { value: 'groups', label: t('Groups (board with member sessions)') },
      { value: 'tasks', label: t('Tasks (flat list, sorted by urgency)') },
    ],
    label: t('Task Groups tab: default view'),
    description: t('Which sub-view the Task Groups tab shows on page load'),
    category: t('Sidebar'), liveApply: false,
  },
  'sidebar.defaultStatusFilter': {
    type: 'multiSelect', default: ['live', 'tmux', 'external', 'stopped'],
    options: [
      { value: 'live', label: t('Live') },
      { value: 'tmux', label: 'Tmux' },
      { value: 'external', label: t('External') },
      { value: 'stopped', label: t('Stopped') },
      { value: 'archived', label: t('Archived') },
    ],
    label: t('Default status filter'),
    description: t('Which session statuses to show by default'),
    category: t('Sidebar'), liveApply: false,
  },
  'sidebar.enableStatusQuickTabs': {
    type: 'boolean', default: false, label: t('Status quick tabs'),
    description: t('Show quick-filter tabs (ALL/LIVE/STOP/...) below the search bar'),
    category: t('Sidebar'), liveApply: false,
  },

  // ── Session Card ──
  'sessionCard.clickBehavior': {
    type: 'enum', default: 'focus',
    options: [
      { value: 'focus', label: t('Focus window') },
      { value: 'expand', label: t('Expand card') },
      { value: 'flash', label: t('Flash window') },
      { value: 'goto', label: t('Go to window (switch desktop + flash)') },
    ],
    label: t('Card click behavior'),
    description: t('What happens when clicking a session card: focus/open the window, expand card details, or flash/bounce the window'),
    category: t('Session Card'), liveApply: false,
  },
  'sessionCard.findMode': {
    type: 'enum', default: 'find',
    options: [
      { value: 'find', label: t('Find (flash in place)') },
      { value: 'goto', label: t('GoTo (switch desktop + flash)') },
    ],
    label: t('Find button mode'),
    description: t('Default behavior for the Find button in session cards'),
    category: t('Session Card'), liveApply: true,
  },
  'sessionCard.clickToCopy': {
    type: 'boolean', default: false, label: t('Click detail values to copy'),
    description: t('Click on ID, Path, Time, or Tasks values to copy them to clipboard'),
    category: t('Session Card'), liveApply: false,
  },
  'sessionCard.visibleFields': {
    type: 'multiSelect', default: ['id', 'backend', 'cwd', 'started', 'status', 'groups'],
    options: [
      { value: 'id', label: t('Session ID') },
      { value: 'backend', label: t('Agent Backend / Role') },
      { value: 'cwd', label: t('Working Directory') },
      { value: 'started', label: t('Started Time') },
      { value: 'status', label: t('Status') },
      { value: 'groups', label: t('Task Groups') },
    ],
    label: t('Visible detail fields'),
    description: t('Choose which fields to show in the expanded session card'),
    category: t('Session Card'), liveApply: false,
  },
  'sessionCard.detailTruncation': {
    type: 'enum', default: 'left',
    options: [
      { value: 'left', label: t('Truncate left (show end)') },
      { value: 'right', label: t('Truncate right (show start)') },
    ],
    label: t('Detail value truncation'),
    description: t('When text overflows, truncate from the left (shows filename) or right (shows path start)'),
    category: t('Session Card'), liveApply: false,
  },
};

// Ordered category list for UI rendering
const SETTINGS_CATEGORIES = [
  t('Toolbar & Layout'),
  t('Window'),
  t('Terminal'),
  t('Chat'),
  t('Session'),
  t('Claude'),
  t('Codex'),
  t('Sidebar'),
  t('Session Card'),
];

export { SETTINGS_SCHEMA, SETTINGS_CATEGORIES };

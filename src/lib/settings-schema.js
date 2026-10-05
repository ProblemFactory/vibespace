/**
 * Settings Schema — single source of truth for all configurable options.
 *
 * Each key is a dotted path (e.g. 'toolbar.showLayoutPresets').
 * Only non-default values are persisted (sparse storage).
 *
 * Two OPTIONAL row fields decide what the Settings window draws (B-df40, the
 * design desk's settings-cleanup §2 P2; the rules + WHEN_KINDS live in
 * ./settings-view.js, PURE): `tier: 'advanced'` (absent = everyday — drawn
 * only while "Show advanced settings" is on) and `when: <clause> | [clauses]`
 * (the row matters only while every clause holds — another row's value, a
 * machine fact, an installed harness CLI, a linked channel vendor; otherwise
 * it is hidden, never greyed, and a search still finds it). A derived harness
 * row takes its table's `when` (the Codex / OpenCode sections). test-architecture
 * 44e is the build-time gate on both fields.
 */

import { t } from './i18n.js';
import { HARNESS_SETTINGS, settingPath, checkTable, rowsOfKind } from '../harness-settings.js'; // PURE (CJS): the descriptor-declared per-harness tables — the Claude/Codex/OpenCode sections are DERIVED from them (docs/design-harness-settings.zh.md §4)
import { whenClauses } from './settings-view.js'; // PURE: the tier / when rules (WHEN_KINDS) — re-exported below
import { CHANNEL_SETTINGS, settingPath as channelSettingPath } from '../channel-settings.js'; // PURE (CJS): the per-vendor channel rows — the Channels "Per vendor" block is DERIVED from them (B-df40 part 3)

const SETTINGS_SCHEMA = {
  // ── Toolbar & Layout ──
  'toolbar.showLayoutPresets': {
    type: 'boolean', default: true, label: t('Show layout presets'),
    description: t('Show the entire layout presets bar (built-in presets, custom grids, and + add button)'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'toolbar.showBrowserButton': {
    type: 'boolean', default: true, label: t('Show Web view button'),
    description: t('Show the embedded-browser button in the toolbar'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  // 2.369.97 (userW, inc-mu1qa5gj-9qe9 "找不到右上角的desktop了"): this key was
  // READ by applyChromeSettings and by customize mode since 2.111.4 but never
  // DECLARED, so `settings.get` answered undefined and the button hid whenever
  // chrome settings were re-applied after the VNC probe — which 2.369.96's
  // desktop-apps probe started doing on every page load.
  'toolbar.showDesktopButton': {
    type: 'boolean', default: true, label: t('Show Desktop button'),
    description: t('Show the shared-desktop (VNC) button in the toolbar (hidden anyway when this machine has no VNC server)'),
    when: { fact: 'vnc' },
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'toolbar.showDesktopAppsButton': {
    type: 'boolean', default: true, label: t('Show Apps button'),
    description: t('Show the desktop-application launcher button in the toolbar (hidden anyway when this machine has no display backend)'),
    when: { fact: 'desktopApps' },
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
  'sidebar.activityRail': {
    type: 'boolean', default: true, label: t('Activity rail (vscode-style)'),
    description: t('A vertical icon rail on the sidebar edge hosting the session panels (Folders / Task Groups / Remote / Ports) plus Agents, Plugins and quick launchers. Turn off to restore the classic tab bar and keep Agents/Plugins as dialogs.'),
    category: t('Sidebar'), liveApply: true,
  },
  'sidebar.railPersistent': {
    type: 'boolean', default: true, label: t('Keep the rail when the sidebar is collapsed'),
    description: t('vscode behavior: collapsing the sidebar leaves the 44px icon rail on screen — click any icon to expand back. Off = collapsing hides everything.'),
    when: { setting: 'sidebar.activityRail', is: true },
    category: t('Sidebar'), liveApply: true,
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
    when: { setting: 'layout.enableDragSnap', is: true },
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'desktop.dynamicEnabled': {
    type: 'boolean', default: false, label: t('Dynamic desktop (Stage)'),
    description: t('A special desktop at the left of the strip: sessions materialize into a shared slot together with their own workspace of helper windows. See docs/design-dynamic-desktop.md'),
    category: t('Window'), liveApply: true,
  },
  'desktop.idleTimeoutMin': {
    type: 'number', default: 0, min: 0, max: 1440, step: 5, label: t('Desktop app idle timeout (minutes)'),
    description: t('0 (the default) never stops an app for sitting still. Set minutes to stop a desktop application window that had no input for that long; "Keep running" in a window exempts that app.'),
    when: { fact: 'desktopApps' },
    tier: 'advanced',
    category: t('Desktop apps'), liveApply: true,
  },
  'desktop.appScale': {
    type: 'enum', default: 'auto', options: [
      { value: 'auto', label: t('Auto (this screen)') },
      { value: '1', label: '1×' },
      { value: '1.5', label: '1.5×' }, // lane D (a): a fraction is a real scale (drawn at 2×, shown at 75 %)
      { value: '2', label: '2×' },
    ], label: t('Desktop app scale (xpra)'),
    description: t('How large a desktop application draws itself, for sharp text on high-resolution screens. Auto: derived from the screen you launch it from — its pixel ratio × your UI scale (a 2× screen at UI scale 125 % = 2.5×). A fractional scale (1.5×, 2.5×) scales buttons and text alike: the app is drawn at the next whole scale and shown smaller, a little softer than a whole scale. The scale is fixed when the app starts; a window\'s ⋯ → Scale relaunches it at another one, and its status bar shows the scale and where it came from.'),
    when: { fact: 'desktopApps' },
    category: t('Desktop apps'), liveApply: true,
  },
  'desktop.seamless': {
    type: 'enum', default: 'auto', options: [
      { value: 'auto', label: t('Auto (apps that draw their own title bar)') },
      { value: 'off', label: t('Off (always show the window frame)') },
    ], label: t('Seamless desktop app windows'),
    description: t('An app that draws its own title bar (GTK header bars, e.g. GNOME Calculator) is shown with NO VibeSpace title bar or status strip: drag its own header bar to move the window. Hover the top edge (or hold Alt) to bring the bars back; the taskbar menu of the window has every control. Paused while an agent drives the app, in a tab group and on a phone. A window\'s ⋯ → Show window frame overrides this per app.'),
    when: { fact: 'desktopApps' },
    category: t('Desktop apps'), liveApply: true,
  },
  'desktop.backendPrefs': {
    type: 'string', default: '',
    label: t('Desktop app display backend order'),
    description: t('Comma-separated rung ids that reorder the picture-backend ladder for NEW desktop apps on this instance, e.g. "vnc-display, xpra" to keep the whole-display rung first. Empty = installed order (xpra > vnc-display > desktop-singleton). Unknown ids are ignored; a running app keeps the backend it started with.'),
    when: { fact: 'desktopApps' },
    tier: 'advanced',
    category: t('Desktop apps'), liveApply: true,
  },
  'desktop.stageKeepAlive': {
    type: 'number', default: 3, min: 0, max: 10, step: 1, label: t('Stage: workspaces kept alive'),
    description: t('How many recent session workspaces stay loaded (hidden) for instant switching; older ones are saved and closed'),
    when: { setting: 'desktop.dynamicEnabled', is: true },
    tier: 'advanced',
    category: t('Window'), liveApply: true,
  },
  'layout.presetOneShot': {
    type: 'boolean', default: false, label: t('Layout buttons apply once'),
    description: t('A layout button arranges the current windows once and returns to free-form. Off (default): it also keeps that grid active, so windows snap to its cells until you pick Freeform'),
    when: { setting: 'toolbar.showLayoutPresets', is: true },
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'layout.shakeBypassSnap': {
    type: 'boolean', default: true, label: t('Shake to bypass snap'),
    description: t('Shake a window vigorously for ~1 second while dragging to turn off grid/edge snap for the rest of that drag (a mouse-only alternative to holding Alt)'),
    when: { setting: 'layout.enableDragSnap', is: true },
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'layout.shakeBypassSeconds': {
    type: 'number', default: 1, min: 0.3, max: 3, step: 0.1, label: t('Shake duration (seconds)'),
    description: t('How long you must keep shaking before grid snap turns off. Lower = triggers faster (but easier to trigger by accident).'),
    when: [{ setting: 'layout.enableDragSnap', is: true }, { setting: 'layout.shakeBypassSnap', is: true }],
    tier: 'advanced',
    category: t('Toolbar & Layout'), liveApply: true,
  },

  'taskbar.desktopPreviewRatio': {
    type: 'number', default: 70, min: 30, max: 100, step: 5,
    label: t('Desktop preview size (%)'),
    description: t('How much of the taskbar height the desktop preview occupies (rest goes to label text)'),
    when: { setting: 'taskbar.showDesktopPreviews', is: true },
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'chrome.arrangement': {
    type: 'json', default: null,
    label: t('Chrome element arrangement'),
    description: t('Which bar hosts each movable element, in what order ({zone: [elementId, …]}). Managed by Customize mode (⚙ → Customize UI… → drag elements); edit by hand only if you know what you are doing.'),
    tier: 'advanced',
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'chrome.zoneAlign': {
    type: 'json', default: null,
    label: t('Chrome alignment'),
    description: t('Alignment per area: taskbar-items left/center (Windows-11-style centered icons), toolbar-center left/center/right, taskbar-tray left/right end. Managed by Customize mode.'),
    tier: 'advanced',
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'chrome.springs': {
    type: 'json', default: null,
    label: t('Spring configs'),
    description: t('Per-spring config: {mode:"flex", weight:1-9} (strength = flex-grow share) or {mode:"fixed", px:N} (rigid spacer). Managed by Customize mode (click a spring).'),
    tier: 'advanced',
    category: t('Toolbar & Layout'), liveApply: true,
  },

  // ── Window ──
  'window.tabWrap': {
    type: 'boolean', default: false,
    label: t('Multi-row tabs'),
    description: t('Allow tab bar to wrap into multiple rows when there are many tabs (like a flow layout)'),
    category: t('Window'), liveApply: true,
  },
  // split tabs v2 (docs/design-split-ux.zh.md §8, inc-muhfb5al-jzk6 — the owner: "拖动窗口后是直接side by side
  // 还是普通tabbed，以及打开文件路径/链接默认用并排还是独立窗口也都加入设置选项"). Both are read AT THE ACT
  // (tab-group.js _afterUserMerge / app.js linkPlacement → settings.get), never cached at boot.
  'window.mergeDropLayout': {
    type: 'enum', default: 'tabs',
    options: [
      { value: 'tabs', label: t('Tabs (then offer side by side)') },
      { value: 'split', label: t('Side by side at once') },
    ],
    label: t('Dropping a window onto another'),
    description: t('What a window dragged onto another window\'s icon or tab bar becomes: grouped as tabs (a toast offers "Show side by side"), or shown side by side at once — the dragged window on the right, with Undo (it goes back where it was) and Unsplit (stay grouped as tabs).'),
    category: t('Window'), liveApply: true,
  },
  'window.openLinkPlacement': {
    type: 'enum', default: 'split',
    options: [
      { value: 'split', label: t('Side by side with the window') },
      { value: 'tab', label: t('As a tab of the window') },
      { value: 'window', label: t('In its own window') },
    ],
    label: t('Opening a file path or link from a window'),
    description: t('Where a file or folder opened from a chat (a path or a local link) appears: beside that chat window (the side it is not on, if it is already side by side), as a tab next to it, or in its own free window. Opening the same path again from the same window shows the tab it is already in. The phone always opens its own window.'),
    category: t('Window'), liveApply: true,
  },
  'window.closeBehavior': {
    type: 'enum', default: 'detach',
    options: [
      { value: 'terminate', label: t('Terminate session') },
      { value: 'detach', label: t('Detach (keep alive)') },
    ],
    label: t('Window close behavior'),
    description: t('What happens when closing a session window: detach and keep it running (default — the session stays in the sidebar for re-attach), or terminate it. Automation helper terminals always terminate.'),
    category: t('Window'), liveApply: true,
  },
  'window.titlebarSwitchScope': {
    type: 'enum', default: 'overlap',
    options: [
      { value: 'overlap', label: t('Overlapping this window') },
      { value: 'desktop', label: t('Current desktop windows') },
      { value: 'all', label: t('All windows') },
    ],
    label: t('Title-bar "Switch window" scope'),
    description: t('Which windows the title-bar right-click menu\'s "Switch window" submenu lists: only windows overlapping this one (classic), every window on the current desktop, or all windows across desktops (entries name their desktop; picking one switches to it).'),
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
  'terminal.webgl': {
    type: 'boolean', default: true, label: t('WebGL renderer'),
    description: t('Draw terminals with WebGL (fast). Turn it off to test whether GPU-side freezes come from the terminals — new terminals then use the DOM renderer (existing ones keep theirs until reopened).'),
    category: t('Terminal'), liveApply: false,
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
    when: { setting: 'chat.compactMode', is: true },
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
  // lane-dead-bridge (2026-09-30): read by the server's dead-bridge watch (src/server/bridge-watch.js via serverSetting)
  'session.deadBridgeMinutes': {
    type: 'number', default: 3, min: 0, max: 60, step: 1,
    label: t('Reconnect a silent conversation after (minutes)'),
    description: t('When a conversation has sent VibeSpace nothing for this long while its agent is still working (its output file or its API requests say so), VibeSpace reconnects to its output by itself and shows what it missed as caught up — nothing is re-run. 0 turns this off.'),
    tier: 'advanced',
    category: t('Session'), liveApply: true,
  },
  'accounts.shipSubscriptionToRemote': {
    type: 'boolean', default: false,
    label: t('Ship subscription logins to remote hosts'),
    description: t('OFF (recommended): a subscription (Pro/Max) account can only run on THIS machine; for a remote host, log in on the host instead. Turning this ON copies the subscription’s login to the remote host — its token then appears from that host’s IP (often a datacenter), which can look like account abuse to Anthropic and risk a ban. API-key accounts are always allowed on remote hosts and are unaffected by this.'),
    tier: 'advanced',
    category: t('Session'), liveApply: true,
  },
  'chat.showHookCards': {
    type: 'boolean', default: true,
    label: t('Show hook cards in chat'),
    description: t('Hook events (context injections, plugin hooks, stop nudges) render as collapsible ✓/✗ cards. Turn off to hide them all — applies to open chats instantly.'),
    category: t('Chat'), liveApply: true,
  },
  // The CLI's own notification queue calls EVERY Stop-hook block an "error"
  // (`system/notification` key stop-hook-error, priority immediate, live stream
  // only) — so VibeSpace's bookkeeping nudge, an expected block, painted a red
  // card at every stop (2.369.120–.125 as the Unknown-event fall-back card,
  // .126 as an immediate notice + toast; owner 2026-09-21: "本质上是预期行为,
  // 每次都这样渲染好丑"). The nudge itself stays visible as the "Stop hook
  // feedback" card and the Stop-hook summary card; this notice adds nothing.
  'accessibility.exposeChat': {
    type: 'boolean', default: true, label: t('Expose chat transcripts to assistive technology'),
    description: t('On: assistive tools see the messages near where you are reading — every rendered card farther than two viewports from the visible area is marked aria-hidden, so the browser\'s accessibility tree stays small however long the conversation grows (nothing visual or keyboard-reachable changes). Off: whole transcripts are marked aria-hidden — turn it off when an assistive tool (an IME, PowerToys, …) still makes Chrome or Edge freeze on large conversations (Chrome serialises the tree on the browser UI thread: 39 s for 27k nodes, measured).'),
    category: t('Chat'), liveApply: true,
  },
  // lane S3 (naive-user study 2, "聊天里到处是给助手看的内部文字"): what VibeSpace
  // tells the ASSISTANT — the Stop hook's bookkeeping nudge, the session-start
  // tools intro, the per-turn reminder — renders as ONE grey line (and folds
  // under the 'note' kind of chat.collapseKinds). Off = never shown at all; the
  // assistant still receives every word.
  'chat.showAssistantNotes': {
    type: 'boolean', default: true,
    label: t('Show VibeSpace notes to the assistant'),
    description: t('VibeSpace talks to the assistant too: a reminder to update its status before it stops, the list of VibeSpace tools at the start of a session, a short per-turn reminder. Each shows as one grey line ("VibeSpace reminded the assistant to update its status") you can expand to read. Off hides them entirely — the assistant still receives them. Applies to open chats instantly.'),
    category: t('Chat'), liveApply: true,
  },
  'chat.showStopHookErrorNotice': {
    type: 'boolean', default: false,
    label: t("Show the CLI's 'Stop hook error' notice"),
    description: t("The CLI posts a 'Stop hook error occurred' notice whenever a Stop hook blocks — including VibeSpace's own bookkeeping nudge, which is expected, not an error. Off hides that notice (the 'Stop hook feedback' and hook summary cards stay); on shows it as a red immediate notice. Applies to open chats instantly."),
    when: { setting: 'chat.showHookCards', is: true },
    category: t('Chat'), liveApply: true,
  },
  'chat.hideEmptyHooks': {
    type: 'boolean', default: true,
    label: t('Hide hooks with no output'),
    description: t('Hooks like PostToolUse fire on every tool call with nothing to show — by default those render no card at all. Turn off to see every hook event. Applies to newly loaded history (reopen the window for existing views).'),
    when: { setting: 'chat.showHookCards', is: true },
    category: t('Chat'), liveApply: true,
  },
  'chat.enterSends': {
    type: 'boolean', default: true,
    label: t('Enter sends the message'),
    description: t('On a desktop keyboard Enter sends and Shift+Enter inserts a newline. Turn off to make Enter insert a newline and send with Ctrl+Enter (\u2318+Enter on a Mac) \u2014 while a turn runs, the line under the composer names the send key. Phones and tablets follow \u201cEnter sends on touch devices\u201d.'),
    category: t('Chat'), liveApply: true,
  },
  'chat.touchEnterSends': {
    type: 'boolean', default: false,
    label: t('Enter sends on touch devices'),
    description: t('On phones and tablets the keyboard\u2019s enter key inserts a newline by default (soft keyboards have no Shift+Enter, so this is the only way to type one) and messages are sent with the send button. Turn on to make enter send instead.'),
    category: t('Chat'), liveApply: true,
  },
  'chat.hideEmptyThinking': {
    type: 'boolean', default: true,
    label: t('Hide empty thinking blocks'),
    description: t('Thinking cards with no visible text (redacted or zero-length thinking) are hidden. They never count toward or break run collapsing. Turn off to see every thinking card — applies to open chats instantly.'),
    category: t('Chat'), liveApply: true,
  },
  'chat.collapseRuns': {
    type: 'boolean', default: true,
    label: t('Collapse runs of working cards'),
    description: t('Consecutive working cards (kinds picked below) fold behind a one-line summary, like the Claude Code TUI — click to expand. The summary shows per-kind counts, the touched file names (✎ marks writes, memory/… marks agent-memory files) and a ✗ failure count. Searching expands everything.'),
    category: t('Chat'), liveApply: true,
  },
  'chat.collapseKinds': {
    // SEMANTIC kinds, one global set for every backend (Track B, owner-decided:
    // per-provider checkbox copies = config sprawl) — each backend's normalizer
    // maps its own tool names in (claude Bash / codex exec are both 'bash').
    type: 'multiSelect', default: ['thinking', 'bash', 'read', 'memory', 'mcp', 'skill', 'agent', 'search', 'image', 'note'],
    options: [
      // lane S3 (naive-user study 2): what VibeSpace says to the ASSISTANT — the
      // Stop nudge, the tools intro, the per-turn reminder. ON by default: a note
      // is folded with the calls it asked for (chat.showAssistantNotes hides it)
      { value: 'note', label: t('VibeSpace notes to the assistant (status reminders, the tools intro, per-turn reminders)') },
      { value: 'thinking', label: t('Thinking blocks') },
      { value: 'search', label: t('Web searches / fetches (WebSearch, WebFetch, web_search)') },
      { value: 'image', label: t('Image views (Read of an image file / view_image)') },
      { value: 'bash', label: t('Command runs (Bash / exec / terminal)') },
      { value: 'read', label: t('File reads') },
      { value: 'write', label: t('File writes (Write/Edit/Patch)') },
      { value: 'memory', label: t('Agent memory files (reads AND writes)') },
      { value: 'mcp', label: t('MCP tool calls (any server)') },
      { value: 'skill', label: t('Skill launches') },
      { value: 'agent', label: t('Sub-agent orchestration (spawn/wait/messages)') },
      // NOT in the default set: a sub-agent's report is the answer the user is
      // reading, not orchestration noise (B-7473 integration 2026-09-06)
      { value: 'report', label: t('Sub-agent reports (a child agent’s written answer)') },
      // NOT in the default set (lane group-report-card): a group message handed to this agent is what the owner
      // asked to SEE in the conversation — it folds only when the user ticks it
      { value: 'group', label: t('Group messages delivered to this agent (vibespace-msg)') },
      // NOT in the default set (lane peer-card-fold): a message another agent, a worker or a job sent — content the
      // owner reads; it already arrives folded to one line (chat.foldPeerMessages), and that line stays in a folded run
      { value: 'peer', label: t('Messages from other agents and jobs (outside a group)') },
      // NOT in the default set (2.369.120, owner): an Unknown event — a harness
      // record VibeSpace does not recognize — is the fall-back card and must
      // stay visible until the user decides it is noise.
      { value: 'unknown', label: t('Unknown events / new fields on known records (harness records VibeSpace does not recognize)') },
    ],
    label: t('Card kinds that collapse'),
    description: t('Which card kinds fold into the summary line, by MEANING — the same setting covers every backend (claude Bash and codex exec are both command runs). Enabled kinds collapse TOGETHER as one interleaved group (think → read → edit → run is the real work pattern; per-kind groups rarely get long enough to fold). Memory = operations on the agent\'s own memory directory — housekeeping, folded by default and listed as memory/<name> in the summary; project-file writes are off by default — diffs are usually worth seeing. A run of only thinking needs two or more; any tool card folds immediately. Cards waiting for your approval never fold.'),
    when: { setting: 'chat.collapseRuns', is: true },
    category: t('Chat'), liveApply: true,
  },
  'chat.foldPeerMessages': {
    // lane peer-card-fold (owner 2026-10-02: five worker reports, each under an H1, filled the window): a message
    // another agent / worker / group / job sent arrives as its head + one preview line + Show (src/lib/peer-card-model.js)
    type: 'boolean', default: true,
    label: t('Fold messages from other agents and jobs'),
    description: t('A message another agent, a worker, a group or a background job sent this chat arrives folded to its sender and first line; press Show to read the whole message. A one-line message is never folded. Turn off to show every such message whole.'),
    category: t('Chat'), liveApply: true,
  },
  'chat.reducedMotionSpin': {
    type: 'boolean', default: false,
    label: t('Keep the spinner rotating under reduced motion'),
    description: t('With "reduce motion" enabled in your OS, the working spinner normally swaps its rotation for a gentle opacity pulse. Turn this on to keep the rotation instead (the pulse can read as blinking).'),
    category: t('Chat'), liveApply: true,
  },
  'chat.uploadDir': {
    type: 'string', default: '',
    label: t('Upload files to'),
    description: t('Where files dropped or attached in chat are saved. Empty = the session’s working directory (default). Set an absolute path (e.g. ~/Downloads or /data/uploads) to collect every upload in one place, or a name (e.g. uploads) for a folder under the working directory. For remote sessions the path is on the remote machine.'),
    category: t('Chat'), liveApply: true,
  },
  'agents.vibespaceIntegration': {
    type: 'boolean', default: true,
    label: t('VibeSpace agent integration (master switch)'),
    description: t('Everything the AGENT can see or use from VibeSpace. ON (default): sessions get the VibeSpace hooks (Task Group context, per-turn reminders, stop nudge) and the vibespace-status/ask/task tools on their PATH. OFF: the model gets a pristine claude/codex — the hook registration is removed from ~/.claude/settings.json and ~/.codex/hooks.json immediately (restored on re-enable, unless you had removed the hook manually in Manage Agents), new sessions spawn with no VibeSpace env or tools, and already-running sessions stop receiving injected context, nudges and task reads. Model-INVISIBLE plumbing keeps working either way: passive usage capture (statusline), billing/account env, the Ctrl+G editor, session persistence and remote transport. Every option below only applies while this is ON.'),
    category: t('Integration'), liveApply: true,
  },
  // ── AGENT BROWSER (P0, docs/design-agent-browser-v2 §3.2) ──────────────
  // Four environment variables at spawn; no VibeSpace process, no daemon. The
  // kill switch exists because every path in this feature falls back
  // structurally: OFF restores exactly today's behaviour (one shared profile,
  // one shared session) for sessions spawned after the change.
  'browser.isolateSessions': {
    type: 'boolean', default: true,
    label: t('Give each session its own agent browser'),
    description: t('ON (default): a session that runs the agent-browser CLI gets its own browser — its own tabs, its own cookies and its own daemon — so two agents stop stealing each other\'s window and `close --all` can only close the caller\'s own. Costs four environment variables at spawn and nothing else: no extra VibeSpace process. OFF: sessions fall back to the single shared profile named by ~/.agent-browser/config.json, which is what every agent used before. Applies to sessions started after the change; a running session keeps the browser it has — and one that has none (it started while this was off, or before the feature) gets its own at its next browser command.'),
    category: t('Agent browser'), liveApply: true,
  },
  'browser.idleTimeoutMs': {
    type: 'number', default: 900000, min: 0, max: 86400000,
    label: t('Close an idle agent browser after (ms)'),
    description: t('How long an agent\'s browser may sit idle before its daemon shuts itself down. Set explicitly because the installed CLI has NO default (and newer ones exempt browsers with a visible window), so nothing else would ever reclaim the browsers this feature creates — one per browsing session instead of one per machine. 0 = never shut down, which is the CLI\'s own meaning and a real choice; anything unreadable falls back to 15 minutes.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  'browser.headed': {
    // ENUM, not a boolean: the honest default is "whatever your own config
    // says", and a checkbox cannot express three states — it would render
    // "inherit" as "off" and turn the first click into a decision the user
    // never made.
    type: 'enum', default: '', options: [
      { value: '', label: t('Inherit from ~/.agent-browser/config.json') },
      { value: 'yes', label: t('Show the window') },
      { value: 'no', label: t('Headless') },
    ],
    label: t('Show the agent browser window'),
    // lane hooks-create H5 (the owner's decision 2026-10-01) — its rule (UNSET + no desktop + Xvfb ⇒ the hidden-window rung)
    // is OFF in 2.369.200 (browser-display NO_DESKTOP_WINDOW_DEFAULT): these words say .199's meaning until it ships (still OFF in 2.369.202)
    description: t('Whether an agent\'s browser draws a real window on this machine\'s desktop. Unset (default): whatever your own ~/.agent-browser/config.json says. A visible window per session is one framebuffer per session and, on the installed CLI, is also exempt from the idle timeout above.'),
    category: t('Agent browser'), liveApply: true,
    // lane headless-fallback (2026-09-28): a PREFERENCE — the row also shows the FACT (this machine's display now, read-only):
    // a window asked of a machine with no desktop session runs headless instead of failing
    fact: 'browser-display',
  },
  // lane headless-fallback addendum (2026-09-29): what a browser that asks for a window does on a machine with NO desktop
  // session — `auto` (default): a normal window on an invisible display when Xvfb is installed there (it looks like the
  // browser a person uses to sign-in pages), else headless; `headless`: always headless. Read at every launch.
  'browser.noDisplayMode': {
    type: 'enum', default: 'auto', options: [
      { value: 'auto', label: t('A hidden window when Xvfb is installed, else headless') },
      { value: 'headless', label: t('Always headless') },
    ],
    label: t('When this machine has no desktop session'),
    description: t('What an agent\'s browser does when it asks for a window but nobody is logged in to this machine\'s desktop. A hidden window (default, when Xvfb is installed) is a normal browser on an invisible screen — sign-in pages see an ordinary browser; headless has no screen at all and some sign-in pages refuse it. Either way the pages work and you can watch and take over in the live view. Applies to the next browser that starts.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  // lane browser-propose (step 1, 2026-09-30): the ONE launch flag that stops the agent's Chromium announcing automation
  // (`navigator.webdriver` — measured false with it, headed and headless, on agent-browser 0.38.1). Read at every launch
  // of a chromium browser VibeSpace composes the config for; a user's own AutomationControlled value always wins.
  'browser.automationFlag': {
    type: 'boolean', default: true,
    label: t('Do not announce the agent browser as automated'),
    description: t('ON (default): the agent\'s browser starts with --disable-blink-features=AutomationControlled, so pages no longer read it as an automated browser (navigator.webdriver is false). It hides that one signal only — a site that still refuses the browser makes the agent propose a switch to CloakBrowser, which you approve. If your own ~/.agent-browser/config.json already names an AutomationControlled value, yours is kept. Applies to the next browser that starts; CloakBrowser is not affected.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  // ── AGENT BROWSER P3 (design-agent-browser-v2 §4.3 / §4.3.1) ──────────
  'browser.takeoverIdleMs': {
    type: 'number', default: 600000, min: 0, max: 86400000,
    label: t('Hand the browser back to the agent after this long without input (ms)'),
    description: t('When you take over an agent\'s browser in the live view and then walk away, control goes back to the agent by itself after this many milliseconds without your input, so an abandoned takeover never parks an agent for ever. 0 = never (only an explicit Hand back or closing the live view returns control). Anything under 30 s is raised to 30 s.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  // ── BROWSE YOURSELF (B-6ae8, the owner 2026-09-28 ruling 8): how long the user's OWN tab is kept after his browsing
  //    window closes, when HE launched the browser (a tab in a browser an agent launched keeps the takeover idle above) ──
  'browser.humanKeepMs': {
    type: 'number', default: 43200000, min: 0, max: 604800000,
    label: t('Keep your own browsing tab after its window closes (ms)'),
    description: t('When you open a profile\'s browser yourself (Browse yourself) and close its window without pressing Close, your tab stays open this long so you can continue where you were, and the browser keeps running for it. 12 hours by default. When you joined a browser an agent had started, your tab is kept as long as the takeover time above instead. 0 = keep it until you press Close or the browser stops; anything under 1 minute is raised to 1 minute.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  // ── (verify S2 r4's `browser.fenceScriptsWhileDriven` was RETIRED 2026-09-27 by the owner's ruling — "直接打断所有脚本和agent操作":
  //    a takeover interrupts every script and page edit of the agent on every instance; a stored value is ignored and said once by the keeper) ──
  'browser.announceIdleHandback': {
    // §4.3.1's zero-spend default: an idle handback is nobody's action, so by
    // default it delivers NOTHING into the conversation (the lease flips, the
    // live view and the card update, one "For you" item is filed, the notice
    // rides your next message). ON routes it through the same declared
    // reason and the same unattended-spend ceiling as the explicit handback.
    type: 'boolean', default: false,
    label: t('Announce an idle handback into the conversation (billed turn)'),
    description: t('OFF (default): when your takeover lapses on its own, the agent is told nothing until its next browser command succeeds or you send your next message — no billed turn is opened by a timer. ON: the lapse is announced into the conversation like an explicit Hand back (a turn the agent is billed for), under the same unattended-spend ceiling (Settings → Spending).'),
    category: t('Agent browser'), liveApply: true,
  },
  // ── AGENT BROWSER P4 (design-agent-browser-v2 §7.2 / §7.2.1) ──────────
  // lane-cloak (2026-09-28): the §7.2.1 record is a measurement, and cloak as a
  // PROFILE's browser is opt-in by the user's own acts — the install
  // (Manage agents) and the switch (the profile's browser dialog). lane
  // dc-browser-providers: the CONTAINER form's switch (browser.cloak.enabled,
  // a docker plan that was never run) is deleted, and the two live cloak rows
  // below are no longer hidden behind it.
  // P4 second half (§7.4): the in-place switch opens the SAME profile directory
  // with the CloakBrowser Chromium (+ `--fingerprint=<seed>`); this names that
  // program when it was installed some other way. Empty = the one Manage
  // agents installed (lane-cloak: the pinned, measured build — never a PATH
  // guess: the `cloakbrowser` command is the vendor's management CLI).
  // lane browser-admin 2b: THE BROWSER CLI VibeSpace drives — the one on PATH (as before), or the version its flag table was
  // measured on, installed by VibeSpace into its data folder (the Agent browser panel's Install the measured version…), or a
  // version you name (installed the same way; its flags are judged both ways — the table was measured on another). Read by
  // the browser keeper (src/server/browser-keeper.js cliPin) on every resolve of the CLI.
  'browser.cli': {
    type: 'string', default: 'path',
    label: t('Browser CLI version'),
    description: t('Which agent-browser VibeSpace drives: "path" = the one on this computer\'s PATH; "pinned" = the version VibeSpace was tested with, installed by VibeSpace (Agent browser panel → Install the measured version…); or a version number such as 0.39.2, installed the same way.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  'browser.cloak.executablePath': {
    type: 'string', default: '',
    label: t('CloakBrowser program file'),
    description: t('The CloakBrowser browser program (its chrome file), for when it was installed some other way. Leave it empty to use the one installed from Manage agents.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  // lane-cloak: THE SITES a running cloak browser may reach — the keeper's
  // egress proxy admits exactly the §7.2.1 record's run hosts (measured: none)
  // + these (src/browser-profiles cloakRunAllowlist)
  'browser.cloak.egressAllowlist': {
    type: 'string', default: '',
    label: t('Sites CloakBrowser may open (hosts, comma-separated)'),
    description: t('The only sites a CloakBrowser browser may reach, through this instance\'s allowlisting proxy: exact hostnames, or ".example.com" for a domain and every sub-domain. Empty (default): it opens no site at all. Measured: CloakBrowser itself needs no site of its own, so this list is all it can reach — its maker\'s download and update hosts are refused. Loopback and link-local addresses are never admitted.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  'browser.actionTrace': {
    // D35 (owner 2026-09-13): default ON — the first action that ever needs a
    // review is otherwise the one unrecorded. A fill's value / a type's text
    // are NEVER stored (only their length); kept by SIZE per profile
    // (browser.traceBytesPerProfile, 2026-09-27 — never by age; src/browser-trace.js).
    type: 'boolean', default: true,
    label: t('Record the agent\'s browser actions (before/after screenshots)'),
    description: t('ON (default): every action an agent sends to its browser is kept as a before and an after screenshot with the click point or element box and the command — expandable on the tool card in the transcript, as a timeline in the live view and as a replay of each browser session. A fill\'s value and a type\'s text are never stored (only their length). Each profile keeps its records up to the size below; over it, the oldest sessions\' screenshots are removed first and every action list stays. A screenshot of a logged-in page is a secret. OFF: nothing is recorded.'),
    category: t('Agent browser'), liveApply: true,
  },
  'browser.traceBytesPerProfile': {
    // 2026-09-27 (the owner: "记录不要按照 7 天上限，而是按照容量，每个浏览器 profile 最多保留 1GB 记录"): the ONE
    // retention rule of the action trace — per profile (the temporary browsers together count as one), in MB;
    // src/browser-trace.js traceBytesLimit reads it (the 64 MB floor is enforced there too). No age rule anywhere.
    type: 'number', default: 1024, min: 64, max: 102400, step: 64,
    label: t('Browser records kept per profile (MB)'),
    description: t('How much each profile\'s browser records may take — the before/after screenshots and the list of actions. Over it, the screenshots of the oldest sessions are removed first; the list of what the agent did is always kept. Records are never removed for being old. Default 1024 MB (1 GB), at least 64 MB.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  // lane browser-resume (§3.9, the owner's ruling 1, 2026-09-30: "state survives the process"): a conversation's own
  // browser keeps its logins + its tabs after it closes, until the conversation ends or these bounds (src/browser-kept.js
  // reads all three — keptLimits; the floors are enforced there too). Never by a short timer; a running browser is never trimmed.
  'browser.keepConversationBrowser': {
    type: 'boolean', default: true,
    label: t('Keep each conversation\'s own browser'),
    description: t('ON (default): when the agent\'s own browser for a conversation closes — after its turn ends, when it idles out, when you stop it, or when VibeSpace restarts — its logins and its open tabs are kept for that conversation, and its next browser command starts it again with them. They go when the conversation ends, when you press Forget in the Agent browser panel, or when the kept browsers pass the sizes below (the least recently used first). A conversation fenced to allowed domains keeps its tabs only. OFF: each browser starts empty again (for conversations started or resumed from now on).'),
    category: t('Agent browser'), liveApply: true,
  },
  'browser.keptBytesPerConversation': {
    type: 'number', default: 512, min: 64, max: 102400, step: 64,
    label: t('Kept browser size per conversation (MB)'),
    description: t('How much one conversation\'s kept browser may take on disk. Over it, its caches are removed first (the browser rebuilds them); its logins are never removed for this. Default 512 MB, at least 64 MB.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  'browser.keptBytesTotal': {
    type: 'number', default: 4096, min: 256, max: 1048576, step: 256,
    label: t('Kept browsers, total (MB)'),
    description: t('How much all kept conversation browsers may take together. Over it, whole kept browsers are removed, the one used longest ago first. A browser that is running is never removed. Default 4096 MB (4 GB), at least 256 MB.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  'browser.autoBindLiveView': {
    // Agent browser P7 (design-agent-browser-v2 §4.6): default ON — an
    // agent-driven browser must not lose its owner, and a live view born
    // inside the session's chain is the one that never can.
    type: 'boolean', default: true,
    label: t('Open the live view beside the session when its browser starts'),
    description: t('ON (default): when a session attaches a browser profile and its window is open on the desktop you are looking at, the live view opens bound beside it — two panes in one window, so the browser never loses its owner. OFF: open it yourself (session menu → Agent browser — live view) and bind it with "Snap beside" (or group it with the session\'s window as tabs, then choose "Show side by side"). An ephemeral browser (no profile) is never auto-opened.'),
    category: t('Agent browser'), liveApply: true,
  },
  'browser.fitPageToView': {
    // lane S4 (naive study 2, 2026-09-26 — "实况画面只占窗格上面一截" + the phone's desktop-width strip): default ON —
    // the page is laid out at the live view's size (src/browser-fit.js). OFF = the pre-S4 view: the page keeps its own
    // size and the picture is scaled into the pane.
    type: 'boolean', default: true,
    label: t('Lay the agent’s page out at the live view’s size'),
    description: t('ON (default): while a live view is open, the agent’s page takes the size of the view’s pane — the picture fills the pane, and a phone sees the page at phone width. With several views, the one driving decides, else the largest on screen; when nobody has watched for 5 seconds the page goes back to its own size. A size the agent chose itself (set viewport / set device) is never overridden — the view scales it and offers “Fit the page to the window”. OFF: the page keeps its own size and the view scales the picture.'),
    category: t('Agent browser'), liveApply: true,
  },
  // ── MULTIVIEW (docs/design-browser-multiview.zh.md D4 / B-325a) ──────────
  // D4: the cap is a CONVERSATION's property — this is only its default (a
  // Task Group's default beats it; the conversation's own value, set from the
  // Agent browser window's chip or Session Properties, beats both). The
  // machine's ceiling (six, shared with desktop apps) stays the hard top.
  // lane browser-windows (U4, the owner 2026-10-01: "profile全局上限是6个？能不能允许用户配置？"): the machine's ceiling of
  // running agent browsers is a setting — the keeper's CONCURRENT_CAP (6) is its default; read at every start
  'browser.maxRunning': {
    type: 'number', default: 6, min: 1, max: 32,
    label: t('Browsers running at once on this machine'),
    description: t('The most agent browsers (desktop apps counted with them) that may run on this machine at the same time: 6 by default, 1 to 32. Several conversations on one profile share its one browser, each in its own window, so they count once. At the ceiling a new browser is refused by name — the agent is told which of its own run and how many others do — and nothing starts until one idles out or you stop one. A change applies to the next browser that starts; nothing running is stopped. The resource guard still only reports a browser that uses too much memory or CPU.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  'browser.defaultPerConversationCap': {
    type: 'number', default: 3, min: 1, max: 6,
    label: t('Browsers one conversation may run at once'),
    description: t('The default number of browsers one conversation (with its helpers) may have running at the same time. Each conversation can change its own from the count in its Agent browser window or in Session Properties, and a Task Group can give its new conversations a different default (a conversation keeps the group default it started with). The machine keeps its own ceiling (Browsers running at once on this machine, six by default), shared with desktop apps.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  // B-325a: a conversation's own browser (and its helpers') is let go a few
  // minutes after its turn ends — the tab stays in the window, hollow, and the
  // next command starts it again. Never while you drive it or watch it. Chat
  // sessions only (lane P verify r2): a terminal session publishes no turn.
  'browser.idleReleaseAfterTurnMs': {
    type: 'number', default: 180000, min: 0, max: 86400000,
    label: t('Release a conversation\'s browser after its turn ends (ms)'),
    description: t('How long after a turn ends the conversation\'s own browser (and its helpers\' browsers) keep running before they are released. The tab stays in the Agent browser window and the next command starts the browser again. Never while you are driving it or watching it in a live view. Chat sessions only: a terminal session\'s browser keeps running until its idle timeout. 0 = never release; anything under 30 s is raised to 30 s.'),
    tier: 'advanced',
    category: t('Agent browser'), liveApply: true,
  },
  // ── AGENT BROWSER P10 (design-agent-browser-v2 §7.6 tier 3 / §6.6, D27 (b)) ──
  // THE SWITCH with its own consent: windows on the user's REAL desktop become
  // window targets. OFF by default; confirmOn = the confirmation dialog IS the
  // consent; turning it off drops every such lease at once (the engine reads
  // it at every verb, at its tick and at boot). Agents cannot write settings,
  // so this is a user act by construction.
  'window.realDesktopTargets': {
    type: 'boolean', default: false, confirmOn: true,
    label: t('\u26a0 Let agents address windows on your real desktop (tier 3)'),
    description: t('OFF (default): an agent may act only in windows VibeSpace started on its own private displays; your own desktop is never listed. ON: every application on this machine\u2019s accessibility bus becomes a window target an agent can read (its accessibility tree contains the text on your screen) and act in through the actions a node itself declares \u2014 including the window you are typing in. Nothing is ever injected on this class (no chords, no point clicks); every such row is marked \u201cyour desktop\u201d; you can pause an agent per window (Desktop apps \u2192 Agents on your real desktop); turning this OFF drops every such lease at once.'),
    when: { fact: 'desktopApps' },
    tier: 'advanced',
    category: t('Desktop apps'), liveApply: true,
  },
  'browser.defaultProfile': {
    // The INSTANCE rung of the profile pin ladder (design-agent-browser-v2
    // §3.2.5): a profile id or label every NEW session lands on unless it, its
    // conversation or its Task Group says otherwise. Empty = ephemeral (D3).
    type: 'string', default: '',
    label: t('Default browser profile for new sessions'),
    description: t('The id or label of a browser profile (Browser panel / vibespace-browser profiles) that new sessions are pinned to when nothing more specific applies. Empty (default): sessions browse an ephemeral browser and keep no logins. A session\'s own choice, its conversation\'s earlier pin and its Task Group\'s default all outrank this.'),
    category: t('Agent browser'), liveApply: true,
  },
  'agents.contextInjection': {
    type: 'boolean', default: true,
    label: t('Inject Task Group context'),
    description: t('Deliver each session\'s Task Group context (objective, shared-context folder index, activity log, update diffs) into the agent via hooks. OFF: agents get no group payloads at all — the reporting tools below still work if enabled. The per-group "Inject context" checkbox in the group\'s detail window is the finer-grained version of this.'),
    when: { setting: 'agents.vibespaceIntegration', is: true },
    category: t('Integration'), liveApply: true,
  },
  'agents.toolStatus': {
    type: 'boolean', default: true,
    label: t('Agent tool: vibespace-status (board state)'),
    description: t('Lets agents self-report working/blocked/needs-input/… onto the session board. OFF: the tool is no longer taught in injected context or reminders, its endpoint refuses with skip-and-continue guidance, and the stop-time bookkeeping nudge (which is keyed on status staleness) never fires. Synthesized states (idle detection) keep working.'),
    when: { setting: 'agents.vibespaceIntegration', is: true },
    category: t('Integration'), liveApply: true,
  },
  'agents.toolAsk': {
    type: 'boolean', default: true,
    label: t('Agent tool: vibespace-ask (the For you tray)'),
    description: t('Lets agents mirror questions/decisions into the For you tray. OFF: not taught, endpoint refuses with skip-and-continue guidance — agents ask only in chat.'),
    when: { setting: 'agents.vibespaceIntegration', is: true },
    category: t('Integration'), liveApply: true,
  },
  'agents.toolTask': {
    type: 'boolean', default: true,
    label: t('Agent tool: vibespace-task (activity log & backlog)'),
    description: t('Lets agents log finished work into the group activity log and park items in the group backlog. OFF: not taught, the progress/backlog write endpoints refuse with skip-and-continue guidance; reading group state (vibespace-task show) still works while context injection is on.'),
    when: { setting: 'agents.vibespaceIntegration', is: true },
    category: t('Integration'), liveApply: true,
  },
  'agents.toolJobs': {
    type: 'boolean', default: true,
    label: t('Agent tool: vibespace-job (background work)'),
    description: t('Lets agents register services, long tasks and cron schedules that outlive their conversation (Background Work window). OFF: not taught, endpoints refuse with skip-and-continue guidance; existing jobs keep running and stay visible to you.'),
    when: { setting: 'agents.vibespaceIntegration', is: true },
    category: t('Integration'), liveApply: true,
  },
  // lane exit-transfer (design 013 B, 2026-10-03): THE bound of an agent's `vibespace-exit pull` / `push` (one file between
  // this machine and a paired one) — in MB (the browser trace's precedent); src/exit-reach.js transferMaxOf reads it
  // (absent ⇒ 1 GiB, at least 1 MB). A bigger file is refused `too_big` by name with both numbers.
  'exit.transferMaxBytes': {
    type: 'number', default: 1024, min: 1, max: 1048576, step: 64,
    label: t('Largest file an agent may pull or push, in MB'),
    description: t('Agents with "Run commands on it" on a paired machine can copy one file at a time between that machine and this one (vibespace-exit pull / push — sha256-checked, shown as a card and in the machine\'s command list). A bigger file is refused and nothing is copied. Default 1024 MB (1 GB).'),
    category: t('Integration'), liveApply: true,
  },
  'agents.jobNotify': {
    type: 'boolean', default: true,
    label: t('Background jobs: notify the owner conversation'),
    description: t('When a background job finishes, fails, is parked, or needs input, its owner conversation gets a message through Claude Code’s own cross-session messaging inbox (delivered by the CLI under its inbound rules; an idle session starts a turn, billed like a typed prompt). When the conversation is closed, the notification is stashed and injected the next time it resumes. Per-group override in the Task Group detail window; per-job override at creation (--notify on/off).'),
    category: t('Background Work'), liveApply: true,
  },
  // ── Background Work TRIAGE (2026-09-14, docs/design-background-work.md §13):
  // terminal one-shots leave the live list for data/jobs-archive.json. The two
  // clocks are SETTINGS; an explicit 0 means "never archive that class". An
  // UNACKNOWLEDGED failure is never archived at any age — the failed clock
  // starts at the acknowledgement, not at the failure.
  'jobs.archiveDoneAfterHours': {
    type: 'number', default: 24, min: 0, max: 720, step: 1,
    label: t('Archive finished tasks after (hours)'),
    description: t('A one-shot task that finished successfully leaves the Background Work list for the archive this many hours after it ended (its runs, delivery log and acknowledgement are kept; poll/show of the id still answer). 0 = never archive finished tasks.'),
    tier: 'advanced',
    category: t('Background Work'), liveApply: true,
  },
  'jobs.archiveFailedAfterDays': {
    type: 'number', default: 7, min: 0, max: 90, step: 1,
    label: t('Archive acknowledged failures after (days)'),
    description: t('A failed, missed, interrupted or unverified one-shot leaves the list this many days after somebody ACKNOWLEDGED it (its owner conversation was notified, an owner agent polled it, or you expanded its row). An unacknowledged failure is never archived. 0 = never archive failures.'),
    tier: 'advanced',
    category: t('Background Work'), liveApply: true,
  },
  'agents.stopNudgeStaleMinutes': {
    type: 'number', default: 10, min: 0, max: 240, step: 1,
    label: t('Stop nudge: staleness threshold (minutes)'),
    description: t('The nudge only fires when the session has not updated its board status for this long. Lower = agents are reminded more eagerly; higher = quieter. 0 = always considered stale (with cooldown 0 too, the nudge fires on EVERY stop — one bookkeeping mini-turn per turn).'),
    when: [{ setting: 'agents.vibespaceIntegration', is: true }, { setting: 'agents.stopBookkeepingNudge', is: true }],
    tier: 'advanced',
    category: t('Integration'), liveApply: true,
  },
  'agents.stopNudgeCooldownMinutes': {
    type: 'number', default: 30, min: 0, max: 720, step: 1,
    label: t('Stop nudge: cooldown per session (minutes)'),
    description: t('After nudging a session once, wait at least this long before nudging it again — the ceiling on how often an agent pays the bookkeeping mini-turn. 0 = no cooldown.'),
    when: [{ setting: 'agents.vibespaceIntegration', is: true }, { setting: 'agents.stopBookkeepingNudge', is: true }],
    tier: 'advanced',
    category: t('Integration'), liveApply: true,
  },
  'tasks.backlogNudgeAt': {
    type: 'number', default: 20, min: 0, max: 1000, step: 1,
    label: t('Backlog cleanup nudge: items per session'),
    description: t('When one session holds this many open backlog items (claimed or parked by it), its backlog commands and its per-turn backlog note ask it to finish, drop or merge items before parking more. 0 = never.'),
    tier: 'advanced',
    category: t('Integration'), liveApply: true,
  },
  'agents.stopBookkeepingNudge': {
    type: 'boolean', default: true,
    label: t('Stop-time bookkeeping nudge for agents'),
    description: t('When an agent finishes a turn while its board state is stale (no status update in 10 minutes), it gets one short follow-up asking it to set vibespace-status, mirror open questions with vibespace-ask, and log finished work — then it stops. At most once per 30 minutes per session. Claude enforces this via a blocking Stop hook; Codex via its wrapper at turn end.'),
    when: { setting: 'agents.vibespaceIntegration', is: true },
    category: t('Integration'), liveApply: true,
  },
  'ports.watchNew': {
    type: 'boolean', default: true,
    label: t('Notify when a machine opens a new port'),
    description: t('VS Code-style port discovery: linked machines (paired devices / connected hosts) are checked every ~30s, and a service that STARTS listening (a dev server, a database) shows a toast offering to forward it. Ports above 32767 and ports already forwarded are ignored. Turn off to stop the background checks.'),
    category: t('Session'), liveApply: true,
  },
  // THE KEY IS A LEGACY SPELLING, THE FEATURE IS NOT (owner ruling 2026-09-08;
  // design-harness-settings 2026-09-20: deliberately NOT a row of the claude
  // table below — it is generic, so it stays a hand-written Chat row here.
  // auto-resume is generic). It is the instance default for EVERY harness that
  // can both classify a limit and restart a turn — capsOf(backend).autoResume
  // .supported — so the copy says so. The KEY keeps its 'claude.' prefix on
  // purpose: renaming a persisted settings key is a migration, and this one is
  // read by every session that already has a per-session override recorded
  // against it (src/server/auto-resume.js globalDefault).
  'claude.autoResumeOnLimit': {
    type: 'boolean', default: false,
    label: t('Continue automatically when a usage limit resets'),
    description: t('DEFAULT for new chat sessions on any agent that reports usage limits (Claude, Codex): when the account is out of quota and there is no other account to switch to, wait for the reset — or for the quota to come back early — and then continue the interrupted task by itself. Each session can override this in the chat status bar. Off by default because continuing spends quota without you being there.'),
    category: t('Spending'), liveApply: true,
  },
  // lane design-systems-home (design 003 §2 S5): the design system a new design follows when the agent names none
  // (vibespace-design new copies its tokens.css); the chat's design chip preselects it. Read by the hub (serverSetting).
  'design.defaultSystem': {
    type: 'string', default: '',
    label: t('Default design system'),
    description: t('The design system a new design follows when none is named: its tokens.css is copied into the design and the check warns on colours and font sizes outside it. The name of a design system (the Design window\'s home lists them). Empty = none.'),
    category: t('Chat'), liveApply: true,
  },
  'agentd.publicUrl': {
    type: 'string', default: '',
    label: t('This instance\'s public address (for reverse mounts)'),
    description: t('The https/http URL a remote machine uses to reach THIS VibeSpace (reverse mounts, remote agent installs, page share links). Leave blank to let each browser use its own address. The Ports panel\'s "This VibeSpace" row can map the whole instance to an frp URL, which takes precedence while mapped WITHOUT changing this value.'),
    tier: 'advanced',
    category: t('Session'), liveApply: true,
  },
  'agentd.autoGraduate': {
    tier: 'advanced',
    type: 'boolean', default: true, category: t('Session'),
    label: t('Move machines to a ws link automatically'),
    description: t('When an SSH machine\u2019s agent is reachable, install it as a service so it dials back over WebSocket \u2014 fewer per-command SSH spawns and a link that notices breakage. Only runs when a public URL is set above; SSH always stays as the rescue channel.'),
  },
  'agentd.localPipeSessions': {
    tier: 'advanced',
    type: 'boolean', default: false, category: t('Session'),
    label: t('Local sessions via device daemon (R6)'),
    description: t('New local chat sessions run as device-daemon pipe sessions instead of dtach — the session-brain final form (survives server restarts via the daemon). Existing sessions are never migrated; any daemon failure falls back to dtach at spawn. Leave off until the device-assisted consumer path has soaked.'),
  },
  'agentd.localDiscovery': {
    tier: 'advanced',
    type: 'boolean', default: false, category: t('Session'),
    label: t('Local session discovery via device daemon'),
    description: t('The 5s session-list sweep reads its filesystem facts (lock files, transcript listing, tail ids) from the device daemon\'s snapshot — computed in a daemon child process, so a slow or network-mounted home directory can never stall the server. Local enrichment (window mapping, tmux) is unaffected. Falls back to the local scan on any failure.'),
  },
  'agents.injectPreamble': {
    type: 'text', default: '',
    label: t('Custom agent instructions (injected)'),
    description: t('Your own standing instructions for every agent session, injected at the TOP of the VibeSpace hook context (task context or the baseline tools intro). Delivered once per session and re-delivered when you change it — never on every turn. Edit comfortably in Manage Agents → Agent instructions. Max 4000 chars.'),
    when: { setting: 'agents.vibespaceIntegration', is: true },
    category: t('Integration'), liveApply: true,
  },
  'agents.perTurnExtra': {
    type: 'text', default: '',
    label: t('Per-turn reminder extra (injected EVERY prompt)'),
    description: t('Short custom text placed at the top of the per-turn reminder — reaches the agent on EVERY message you send, so keep it tight (≤500 chars; it costs tokens each turn). Delivers even if the standard tool reminder is turned off. Edit in Manage Agents → Agent instructions.'),
    when: { setting: 'agents.vibespaceIntegration', is: true },
    tier: 'advanced',
    category: t('Integration'), liveApply: true,
  },
  'agents.stopNudgeExtra': {
    type: 'text', default: '',
    label: t('Stop-nudge extra (injected when the bookkeeping nudge fires)'),
    description: t('Custom text placed at the top of the stop-time bookkeeping nudge (≤500 chars) — e.g. extra end-of-turn duties for your agents. Edit in Manage Agents → Agent instructions.'),
    when: [{ setting: 'agents.vibespaceIntegration', is: true }, { setting: 'agents.stopBookkeepingNudge', is: true }],
    tier: 'advanced',
    category: t('Integration'), liveApply: true,
  },
  'agents.perTurnToolReminder': {
    type: 'boolean', default: true,
    label: t('Per-turn tool reminder for agents'),
    description: t('Injects a one-line (~250 byte) reminder of the vibespace tools (status / ask / task) with every prompt you send, so agents keep using them in long sessions — the full rules injected at session start scroll out of the working context over time. Turn off to save the few tokens per turn.'),
    when: { setting: 'agents.vibespaceIntegration', is: true },
    tier: 'advanced',
    category: t('Integration'), liveApply: true,
  },
  'agents.contextUpdateDiffs': {
    type: 'boolean', default: true,
    label: t('Task Group updates as diffs'),
    description: t('When a Task Group changes mid-session, agents receive only WHAT changed (new activity entries, objective edits, backlog changes, changed shared files) instead of the whole group context again. The full context is still delivered on first contact and after a server restart. Turn off to always re-send the complete state.'),
    when: { setting: 'agents.vibespaceIntegration', is: true },
    tier: 'advanced',
    category: t('Integration'), liveApply: true,
  },
  'agents.allowGroupManagement': {
    type: 'boolean', default: false,
    label: t('Allow agents to manage Task Groups'),
    description: t('Lets sessions YOU designate as "Group manager" (Session Properties) create and configure Task Groups via their CLI — create/update/bind/unbind, the same organize-only operations you perform in the UI. Paths they may use are limited by the roots setting below; every operation is recorded in the group\'s activity log. Off = the API refuses all agents.'),
    when: { setting: 'agents.vibespaceIntegration', is: true },
    category: t('Integration'), liveApply: true,
  },
  'agents.stopNudgeMaxUnanswered': {
    type: 'number', default: 3, min: 0, max: 100, step: 1,
    label: t('Stop nudge: give up after this many unanswered nudges'),
    description: t('A session that has never reported a board status is being asked for bookkeeping it does not do — and every nudge costs a real mini-turn. After this many nudges with no status report at all, that session is not nudged again (any status report resets the count). 0 = never give up.'),
    when: [{ setting: 'agents.vibespaceIntegration', is: true }, { setting: 'agents.stopBookkeepingNudge', is: true }],
    tier: 'advanced',
    category: t('Integration'), liveApply: true,
  },
  'agents.groupManagementRoots': {
    type: 'string', default: '~',
    label: t('Group management path roots'),
    description: t('Comma-separated absolute path prefixes a manager agent may use for a group\'s context folder / auto-include folders (~ = your home). Keeps agents from pointing context injection at arbitrary paths.'),
    when: [{ setting: 'agents.vibespaceIntegration', is: true }, { setting: 'agents.allowGroupManagement', is: true }],
    tier: 'advanced',
    category: t('Integration'), liveApply: true,
  },
  // ── SPENDING (docs/design-account-hardening.md §4.4c, owner decisions D2/D3/D6)
  // Every turn VibeSpace starts WITHOUT you passes one authorizer with these
  // ceilings, counted per credential slot and persisted across restarts
  // (data/spend-budget.json). Measured driver on this instance: 603 Stop-nudge
  // mini-turns over two months (536M cached tokens read on the turns they
  // forced; 21 of them on ONE conversation inside ONE hour), and an auto-resume
  // loop that once fired 130 billed continues into a wall in one night.
  'spend.unattendedPerIdentityHour': {
    type: 'number', default: 30, min: 0, max: 200, step: 1,
    label: t('Unattended turns per account per hour'),
    description: t('The most turns VibeSpace may start by itself on ONE account in a rolling hour — the auto-continue after a usage limit, the Stop bookkeeping nudge, Background Work notifications and messages from other sessions all count. Turns YOU type are never counted. 0 = no automatic turns at all on any account. When a budget is spent the refusal is journalled and filed in the \u201cFor you\u201d inbox; nothing is lost — a notification that cannot be delivered live is injected into the conversation\u2019s next turn instead.'),
    category: t('Spending'), liveApply: true,
  },
  'spend.unattendedPerIdentityDay': {
    type: 'number', default: 200, min: 0, max: 2000, step: 5,
    label: t('Unattended turns per account per day'),
    description: t('The same ceiling over a rolling 24 hours. An account can be busy for an hour without spending its whole day.'),
    category: t('Spending'), liveApply: true,
  },
  'spend.unattendedPerInstanceDay': {
    type: 'number', default: 800, min: 0, max: 10000, step: 10,
    label: t('Unattended turns for this instance per day'),
    description: t('The ceiling across every account together, over a rolling 24 hours — the bound that still holds when a new subscription is added mid-incident.'),
    category: t('Spending'), liveApply: true,
  },
  'spend.budgetNoticePct': {
    type: 'number', default: 80, min: 0, max: 100, step: 5,
    label: t('Warn when a spending budget reaches (%)'),
    description: t('File one \u201cFor you\u201d item when an account (or this instance) has used this share of its unattended-turn budget, so the ceiling is never a surprise. 0 = never warn.'),
    category: t('Spending'), liveApply: true,
  },
  'spend.allowOverageTurns': {
    type: 'boolean', default: false, confirmOn: true,
    label: t('\u26a0 Allow unattended turns while an account bills paid overage'),
    description: t('OFF (recommended): while an account reports that it is using PAID OVERAGE, VibeSpace refuses every turn it would have started by itself on that account — a turn nobody asked for is a quota decision when quota is included and a dollar decision when it is not. Turns YOU type always run. Turn this ON only if you want automatic continues to keep going at pay-per-use prices.'),
    tier: 'advanced',
    category: t('Spending'), liveApply: true,
  },
  // ── Channels (docs/design-communication-panel.zh.md §7.4 / fence 12, P2) ──
  'channels.pushCoalesceSeconds': {
    type: 'number', default: 60, min: 0, max: 600, step: 5,
    label: t('Coalesce pushed messages before waking an agent (seconds)'),
    description: t('Polling batches a minute of messages into ONE wake by nature; a push lane delivers them one by one, so a burst of 30 would become 30 billed turns. While a push lane carries messages, matched hits are gathered for this many seconds and delivered as one wake that lists them all. 0 = wake per message. Poll and scan lanes are already batches and never wait.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  // ── Channels: THE AGGREGATED IM's time and capacity numbers (owner ruling
  //    2026-09-26: "all of these time and capacity parameters should be
  //    configurable"; design §6.2 / §6.5). Every one is read LIVE by the
  //    channels engine through serverSetting — a change applies at the next
  //    tick, no restart. The engine keeps the same defaults beside its reads.
  'channels.pollHotSec': {
    type: 'number', default: 30, min: 10, max: 300, step: 5,
    label: t('Refresh a busy conversation every (seconds)'),
    description: t('A conversation open in a window, or with a message in the last hour, is "hot" and fetched this often. The vendor\'s own minimum still applies (Gmail: 30 s). Push, when it carries messages, makes polling a slow safety net instead.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.pollWarmSec': {
    type: 'number', default: 300, min: 30, max: 900, step: 30,
    label: t('Refresh a recent conversation every (seconds)'),
    description: t('A conversation with a message in the last day ("warm") is fetched this often.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.pollColdSec': {
    type: 'number', default: 900, min: 60, max: 900, step: 60,
    label: t('Refresh every other conversation every (seconds, at most 900)'),
    description: t('Every other conversation ("cold") is fetched this often — never less often than every 15 minutes. This is also how often the conversation list itself is re-read and the safety-net cadence while push carries messages.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.hotRecentMinutes': {
    type: 'number', default: 60, min: 5, max: 1440, step: 5,
    label: t('A conversation is busy for this long after a message (minutes)'),
    description: t('How recent the last message must be for a conversation to count as busy (hot).'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.warmRecentHours': {
    type: 'number', default: 24, min: 1, max: 168, step: 1,
    label: t('A conversation is recent for this long after a message (hours)'),
    description: t('How recent the last message must be for a conversation to count as recent (warm).'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.agentRefreshFloorSec': {
    type: 'number', default: 20, min: 5, max: 900, step: 5,
    label: t('An agent may refresh a conversation at most every (seconds)'),
    description: t('"vibespace-channels refresh" is refused, with the wait, when the conversation was fetched less than this long ago — an agent cannot turn itself into a polling loop. Every refresh counts against the account\'s vendor budget.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.agentBudgetSharePct': {
    type: 'number', default: 25, min: 5, max: 100, step: 5,
    label: t('Agent refreshes may use at most (% of an account\'s vendor budget per minute)'),
    description: t('Every "vibespace-channels refresh" counts against the account\'s vendor budget. Agents together may spend at most this share of each minute, so the conversations you watch keep their refresh cadence; past it an agent\'s refresh is refused with the wait. 100 = no separate limit.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.historyPageSize': {
    type: 'number', default: 50, min: 10, max: 200, step: 10,
    label: t('Messages per history page'),
    description: t('A new conversation is fetched one page deep; older pages load when you scroll up in its window. Lark serves at most 50 per request.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.attachmentBudgetMB': {
    type: 'number', default: 5120, min: 64, max: 102400, step: 64,
    label: t('Attachment cache per account (MB)'),
    description: t('Attachments and images are downloaded when you open them and kept per account up to this size; the least recently opened ones are removed first. They are never executed.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  // The per-VENDOR rows (Lark / Gmail requests per minute and per second) are DERIVED from
  // src/channel-settings.js below (deriveChannelTable, B-df40 part 3) — the Channels "Per vendor" block.
  // ── lane channel-threads (2026-09-28, spec §3.7, drain rule 20): reactions + threads ──
  'channels.reactionsPerMin': {
    type: 'number', default: 20, min: 0, max: 600, step: 5,
    label: t('Reactions: list calls per minute per account'),
    description: t('Reactions are read only for the messages an open window shows, one call per message, at most this many a minute per account (0 = never list — reactions arrive only as live events). Checked before the account\'s per-minute vendor budget, so reading reactions never takes the budget new messages need.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.reactionsTtlMin': {
    type: 'number', default: 10, min: 1, max: 1440, step: 1,
    label: t('Reactions: minutes a fetched list stays fresh'),
    description: t('A visible message whose reactions were read within this many minutes is not read again; the chips show the stored count and their tooltip says how old it is.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.threadFloorSec': {
    type: 'number', default: 60, min: 10, max: 3600, step: 10,
    label: t('Threads: seconds between two loads of one thread'),
    description: t('Opening a thread loads its replies from the vendor (where they are not listed with the conversation — Lark topics); the same thread is loaded again at most this often.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  // lane lark-threads (A2, 2026-10-01): THE RECENT-ROOTS RECHECK — a message read before anyone answered it in a thread
  // (Lark names the thread on its first message only once the thread exists) is found again by re-reading each active
  // conversation's newest page this often (and at once on the owner's Refresh)
  'channels.threadRecheckSec': {
    type: 'number', default: 3600, min: 300, max: 86400, step: 300,
    label: t('Threads: seconds between two checks of a chat for new threads'),
    description: t('Where thread replies are not listed with the conversation (Lark), a message read before anyone replied to it in a thread is found again by re-reading the newest page of each chat active in the last 14 days this often — one request per chat. Pressing Refresh in a chat checks it at once.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  // lane lark-threads (B5): how a Lark person's name is SHOWN — the nickname the organization gives them, else their
  // name, then (optionally) one of their profile fields in parentheses, the way Lark shows it; the vendor name stays the title
  'channels.larkNameField': {
    type: 'enum', default: 'department', options: [
      { value: 'none', label: t('Name only') },
      { value: 'department', label: t('Name (department)') },
      { value: 'jobTitle', label: t('Name (job title)') },
    ], label: t('Lark: how people are named'),
    description: t('A person is shown by the nickname your organization gives them, else their name, followed by their department or job title in parentheses when you choose one — the way Lark shows it. Reading profiles needs the sign-in to allow it (the account card says when it does not). A name you set yourself on an author always wins.'),
    when: { channel: 'lark' },
    category: t('Channels'), liveApply: true,
  },
  // design 018: the relay page a workspace Slack app typed into THIS instance sends members back through (a company
  // preset names its own relayUrl). The default is the project's own static page; empty = this instance's own https
  // address, else the member pastes the code the app's page shows. Read by the hub (serverSetting).
  'channels.slackRelayUrl': {
    type: 'string', default: 'https://problemfactory.github.io/vibespace/slack/',
    label: t('Slack: relay page'),
    description: t('The https page Slack sends a member back to after they press Allow, for a workspace app whose Client ID and Secret were typed here (a company preset names its own). The page only returns the browser to a VibeSpace on a private network; anywhere else it shows the code to paste back. Register the same address under the app’s Redirect URLs. Empty = this instance’s own https address, else the code is pasted back.'),
    when: { channel: 'slack' },
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  // lane lark-search-poll (B-5aab, design §8 + owner decision 4): THE CHANGE FEED — one account-wide search per tick
  // names every conversation with a new message (Lark: groups, single chats, thread replies)
  'channels.feedEverySec': {
    type: 'number', default: 30, min: 10, max: 300, step: 5,
    label: t('New-message search: seconds between two searches'),
    description: t('An account that offers a new-message search (Lark) asks it this often which conversations have new messages — one request finds them all, including single chats and thread replies.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.feedOverlapSec': {
    type: 'number', default: 60, min: 30, max: 600, step: 10,
    label: t('New-message search: seconds each search re-reads'),
    description: t('Each search also covers the last seconds of the previous one, so a message the vendor indexes late is still found. At least 30.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.feedBackfillDays': {
    type: 'number', default: 7, min: 0, max: 30, step: 1,
    label: t('New-message search: days of single chats found at first'),
    description: t('The first search after an account is connected (or re-authorized) also lists the single chats of this many days — as read, waking nobody. 0 = only new ones.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  'channels.relaxedPollSec': {
    type: 'number', default: 300, min: 60, max: 900, step: 30,
    label: t('Once the search finds everything: seconds between checks of each chat'),
    description: t('When the search has been measured to find every new message (at most 2 % missed over 200), each conversation is still checked on its own at least this often — an open window stays at the fast cadence. If the search starts missing messages, the normal cadence returns by itself.'),
    tier: 'advanced',
    category: t('Channels'), liveApply: true,
  },
  // ── Channels outbox GUARDS (design §9.1, decision 9, P3): they stack on
  //    the channel policy and can only TIGHTEN it. Audit is always on and is
  //    not a setting. Off-hours needs a time zone; without one that guard is
  //    OFF, never guessed.
  'channels.guardLinksReview': {
    type: 'boolean', default: true,
    label: t('Outbox: a message with a link always needs your approval'),
    description: t('A proposal whose text carries a link goes to review even on a channel whose policy is "send directly". A guard can only tighten a policy, never relax it.'),
    category: t('Channels'), liveApply: true,
  },
  'channels.guardAttachmentsReview': {
    type: 'boolean', default: true,
    label: t('Outbox: a message with an attachment always needs your approval'),
    description: t('A proposal carrying an attachment goes to review even on a "send directly" channel.'),
    category: t('Channels'), liveApply: true,
  },
  'channels.offHoursTz': {
    type: 'string', default: '',
    label: t('Outbox: working-hours time zone (empty = the off-hours guard is off)'),
    description: t('An IANA zone such as Asia/Shanghai or America/Los_Angeles. Outside working hours every proposal goes to review. Leave empty and nothing is guessed: a wrong zone would silently send everything (or nothing) to review.'),
    category: t('Channels'), liveApply: true,
  },
  'channels.offHoursStart': {
    type: 'string', default: '09:00',
    label: t('Outbox: working hours start (HH:MM)'),
    description: t('Only used when the time zone above is set. Mon–Fri.'),
    when: { setting: 'channels.offHoursTz', isNot: '' },
    category: t('Channels'), liveApply: true,
  },
  'channels.offHoursEnd': {
    type: 'string', default: '18:00',
    label: t('Outbox: working hours end (HH:MM)'),
    description: t('Only used when the time zone above is set.'),
    when: { setting: 'channels.offHoursTz', isNot: '' },
    category: t('Channels'), liveApply: true,
  },
  // ── The sender honesty line (design §9.5, decision 17 as overruled, P4):
  //    OFF by default. The message goes out as the user's own words; who the
  //    other side will see is said on the approval card and in the receipt.
  //    Each adapter row can override this default (Channels panel).
  'channels.senderHonestyLine': {
    type: 'boolean', default: false,
    label: t('Outbox: append a "drafted by <agent>" line to messages an agent drafted'),
    description: t('OFF (recommended): a message goes out exactly as you approved it. ON: an agent-drafted message ends with one line naming the drafting agent. Your own drafts never get one. Each channel can override this in the Channels panel. Either way the approval card and the receipt say who the recipient will see.'),
    category: t('Channels'), liveApply: true,
  },
  'pool.reserveFloorPct': {
    type: 'number', default: 15, min: 0, max: 90, step: 5,
    label: t('Keep this much of each account\u2019s weekly quota in reserve (%)'),
    description: t('The account pool drains the member whose weekly window resets soonest, which is right while there is a choice about when to burn quota — measured, it took one account from 60% to 95% of its weekly window in 12.4 hours. Below this floor a member stops being a VOLUNTARY switch target: it still serves its own conversations, and a conversation whose current account is genuinely dead may still escape onto it. 0 = no floor (the pre-2026-09 behaviour).'),
    category: t('Spending'), liveApply: true,
  },
  'pool.avoidOverageMembers': {
    type: 'boolean', default: false,
    label: t('Do not switch conversations onto an account billing paid overage'),
    description: t('While an account is using paid overage its utilization stays under 100% even though every token costs money, so the pool\u2019s \u201cmost remaining\u201d ranking actively prefers it. With this on, such a member is not a voluntary switch target (an escape from a dead account still uses it, and it keeps serving its own conversations). Off by default: watch the quota panels for a week first — such an account wears a money icon there.'),
    category: t('Spending'), liveApply: true,
  },
  'accounts.onDemandQuotaRefresh': {
    type: 'enum', default: 'manual',
    options: [
      { value: 'manual', label: t('Manual only (⟳ button)') },
      { value: 'auto', label: t('Auto on popup open (when >30 min stale)') },
      { value: 'auto-cli', label: t('Auto via the CLI (burn-aware background refresh)') },
      { value: 'off', label: t('Off (never contact Anthropic)') },
    ],
    label: t('On-demand quota refresh (model-scoped limits like Fable)'),
    description: t('The passive statusline feed only carries the 5h/7d windows — model-scoped weekly limits (e.g. Fable) can ONLY come from asking Anthropic’s usage endpoint with the account’s own login token. This is the same non-billable call the CLI makes when you run /usage, throttled to ≥60s per account and honoring rate-limit backoff, and it NEVER runs on a timer. It is user-initiated traffic, categorically different from the background polling that has gotten accounts banned — but it is still an off-CLI request with a subscription token, so it is your call: Manual = only when you click ⟳; Auto = also once when you open the quota popup and the data is stale; Off = never (the ⟳ button disappears and scoped limits stay unknown); Auto via the CLI = a background loop spawns `claude -p /usage` (the official binary makes the fetch — this app never calls the endpoint itself) with a BURN-AWARE cadence: refreshes within minutes when the dead-reckoner sees real spending drift, 45min-with-jitter staleness cap for active accounts, and idle accounts are never polled.'),
    category: t('Session'), liveApply: true,
  },
  'usage.dashboard': {
    type: 'json', default: null,
    label: t('Usage dashboard panels'),
    description: t('The configurable panel layout of the Usage window ({metric, dim, chart, span, topN} per panel). Managed by the Usage window itself (Panels… menu, per-panel ✎/⋯); edit by hand only if you know what you are doing.'),
    tier: 'advanced',
    category: t('Session'), liveApply: true,
  },
  'telemetry.enabled': {
    type: 'boolean', default: true,
    label: t('Local diagnostics (errors + feature usage)'),
    description: t('Records page errors, boot crashes and coarse feature events (window opened, session created — names only, never content) into data/telemetry/ on THIS server. Nothing leaves your instance unless a forward URL is set below. Powers the ⚙ → Diagnostics report.'),
    category: t('Session'), liveApply: true,
  },
  'telemetry.forwardUrl': {
    type: 'text', default: '',
    label: t('Forward diagnostics to a central collector (URL)'),
    description: t('Optional, for team deployments: POST event batches (with an anonymous per-instance id) to this URL so one maintainer can see errors across all instances. Leave empty to keep everything local.'),
    tier: 'advanced',
    category: t('Session'), liveApply: true,
  },
  'telemetry.forwardToken': {
    type: 'text', default: '',
    label: t('Central collector token'),
    description: t('Sent as a Bearer Authorization header with forwarded batches when the collector requires a shared token (a VibeSpace collector always does). Leave empty if none is required.'),
    when: { setting: 'telemetry.forwardUrl', isNot: '' },
    tier: 'advanced',
    category: t('Session'), liveApply: true,
  },
  'usage.otelTruth': {
    type: 'boolean', default: true,
    label: t('Per-request billing truth (local telemetry)'),
    description: t('New LOCAL claude sessions export the CLI’s own OpenTelemetry api_request events to this VibeSpace instance over loopback (never to any external endpoint). Each event names the organization that ACTUALLY billed the request, so the usage ledger, quota estimates and pool decisions stay correct even while a running session still holds a pre-switch token after a pool account switch. Zero extra Anthropic traffic — the CLI pushes locally. Applies to sessions started after the change.'),
    tier: 'advanced',
    category: t('Session'), liveApply: true,
  },
  'accounts.activeUsagePolling': {
    type: 'boolean', default: false, confirmOn: true,
    label: t('⚠ Actively poll subscription usage (automation risk)'),
    description: t('OFF (recommended): usage bars are captured passively from your live terminal sessions — VibeSpace never contacts Anthropic on its own. Turning this ON restores the old behavior: the server calls Anthropic’s usage endpoint on a ~90s timer with each subscription’s token, even for idle accounts. That off-CLI, fixed-cadence, non-human traffic is exactly what can get a Pro/Max account flagged as automated and BANNED — a real account was banned+refunded for this. Only enable it if you accept that risk (e.g. to see live usage for chat-only or idle accounts).'),
    tier: 'advanced',
    category: t('Session'), liveApply: true,
  },

  'taskbar.toastSeconds': {
    type: 'number', default: 6, min: 2, max: 60,
    label: t('Notification popup duration (seconds)'),
    description: t('How long toast cards (new inbox items, errors, confirmations) stay on screen. They appear next to the inbox button and every one is kept in the inbox popup’s Notifications tab.'),
    tier: 'advanced',
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'mounts.vfsCacheMaxSizeGB': {
    type: 'number', default: 10, min: 1, max: 500,
    label: t('Storage mount cache size (GB)'),
    description: t('Per-mount disk budget for the rclone read/write cache (vfs-cache-mode full). Reads are cached chunk-wise on local disk; writes land locally and upload in the background — the cache survives crashes and resumes uploading on reconnect. Applied when a mount (re)connects.'),
    tier: 'advanced',
    category: t('Session'), liveApply: true,
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
  'tasks.autoStyleOrder': {
    type: 'enum', default: 'interleaved',
    options: [
      { value: 'interleaved', label: t('All dimensions from the start (textures early)') },
      { value: 'solid-first', label: t('Solid colors first (textures after 36 groups)') },
    ],
    label: t('Task Group auto-style order'),
    description: t('How automatic Task Group styles are sequenced. "All dimensions" cycles lightness bands AND line-style textures from the first groups (maximum visual difference — the 4th group is already dashed); "Solid first" uses 36 solid color slots before any texture (a cleaner look for small setups). Applies live; changing it re-renders existing auto styles.'),
    category: t('Sidebar'), liveApply: true,
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
    category: t('Session Card'), liveApply: true,
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
    category: t('Session Card'), liveApply: true,
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
    category: t('Session Card'), liveApply: true,
  },
};

// RETIRED KEYS (B-df40 part 1): a key listed there never comes back as a row — scripts/test-architecture.mjs 44d.
// PURE (CJS), shared by identity with the boot migration 2026-10-settings-rows-retired that strips the stored values.
export { RETIRED_SETTING_KEYS } from '../retired-settings.js';

// ── HARNESS SECTIONS ARE DERIVED (docs/design-harness-settings.zh.md §4) ──
// The Claude / Codex / OpenCode categories are not hand-written rows any more:
// every row comes from the harness's DECLARED table in src/harness-settings.js
// (the same object the server reads through harnessSetting() and the
// descriptor carries by identity), re-wrapped with the real t() here so the
// same English key hits the same zh/ja entry. The persisted path is
// `${prefix}.${key}` — byte-identical to the old literal keys, so nothing in
// data/settings.json moves. Each derived entry also carries `harness` (the
// prefix) and `apply` (spawn | server | cli-config) so the Settings window can
// say WHERE a value goes and, for a cli-config row, WHICH machines it reached
// (the apply chip + receipts). scripts/test-harness-settings.mjs pins the
// derived rows field-equal to the pre-derivation schema snapshot.
const HARNESS_SETTING_OWNERS = new Map(); // prefix → { category, paths[], table }
function deriveHarnessRow(tbl, r) {
  const entry = { type: r.type, default: r.default, label: t(r.label), description: t(r.description), category: t(tbl.category), liveApply: true, harness: tbl.prefix, apply: r.apply };
  if (r.options) entry.options = r.options.map((o) => ({ value: o.value, label: t(o.label) }));
  for (const k of ['combobox', 'min', 'max', 'step']) if (r[k] !== undefined) entry[k] = r[k];
  // the view fields (settings-view.js): the row's own tier, and the TABLE's `when` on every row of it
  // (`when: { harness: 'codex' }` hides the whole Codex section where that CLI is not installed)
  if (r.tier !== undefined) entry.tier = r.tier;
  const when = [...whenClauses(tbl.when), ...whenClauses(r.when)];
  if (when.length) entry.when = when.length === 1 ? when[0] : when;
  return entry;
}
function deriveHarnessTable(tbl) {
  const paths = [];
  for (const r of tbl.rows) { const p = settingPath(tbl.prefix, r.key); SETTINGS_SCHEMA[p] = deriveHarnessRow(tbl, r); paths.push(p); }
  HARNESS_SETTING_OWNERS.set(tbl.prefix, { category: t(tbl.category), paths, table: tbl });
  return paths;
}
for (const tbl of Object.values(HARNESS_SETTINGS)) deriveHarnessTable(tbl);
/** A CONTRIBUTED harness's table (design §7; arrives on /api/home): validated
 *  with the contributor rules — its prefix must be its own id, never a
 *  built-in namespace — then derived exactly like a built-in one. Mirrors
 *  registerPluginSettings below. Throws on an invalid table. */
export function registerHarnessSettings(id, table) {
  const errs = checkTable(table, { contributed: { id } });
  if (errs.length) throw new Error(`harness settings for '${id}' refused: ${errs.join('; ')}`);
  unregisterHarnessSettings(id);
  const paths = deriveHarnessTable(table);
  const cat = t(table.category);
  if (paths.length && !SETTINGS_CATEGORIES.includes(cat)) SETTINGS_CATEGORIES.push(cat);
  return paths;
}
export function unregisterHarnessSettings(id) {
  if (Object.prototype.hasOwnProperty.call(HARNESS_SETTINGS, id)) throw new Error(`harness '${id}' is built-in; its settings cannot be unregistered`);
  const own = HARNESS_SETTING_OWNERS.get(id);
  if (!own) return false;
  for (const p of own.paths) delete SETTINGS_SCHEMA[p];
  HARNESS_SETTING_OWNERS.delete(id);
  if (![...HARNESS_SETTING_OWNERS.values()].some((o) => o.category === own.category)) {
    const i = SETTINGS_CATEGORIES.indexOf(own.category);
    if (i >= 0) SETTINGS_CATEGORIES.splice(i, 1);
  }
  return true;
}
/** The harness whose section a category is (built-in or registered), with the
 *  CLI config files its cli-config rows write — for the section's intro line
 *  and the per-row apply chip. null for a non-harness category. */
export function harnessSectionFor(category) {
  for (const [prefix, own] of HARNESS_SETTING_OWNERS) {
    if (own.category !== category) continue;
    const files = Object.entries(own.table.files || {}).map(([id, f]) => ({ id, rel: '~/' + f.rel.join('/'), format: f.format }));
    const written = new Set(rowsOfKind(own.table, 'cli-config').map((r) => r.apply.file));
    return { prefix, files: files.filter((f) => written.has(f.id)) };
  }
  return null;
}
/** `~/.claude/settings.json` for a (prefix, file id) — the display path of a cli-config row's target. */
export function harnessFileRel(prefix, fileId) {
  const own = HARNESS_SETTING_OWNERS.get(prefix);
  const f = own && own.table.files && own.table.files[fileId];
  return f ? '~/' + f.rel.join('/') : null;
}
export function harnessSettingPaths(prefix) { return [...(HARNESS_SETTING_OWNERS.get(prefix)?.paths || [])]; }
/** The section title of a harness prefix ('Codex') — the name in "the Codex CLI is not installed on this machine". */
export function harnessCategory(prefix) { return HARNESS_SETTING_OWNERS.get(prefix)?.category || null; }

// ── Per-VENDOR channel rows, DERIVED (B-df40 part 3, the design desk's settings-cleanup §2 P3) ──
// The harness precedent applied to channel adapters: src/channel-settings.js declares each vendor's budget / pace rows
// ONCE; the adapter's caps spread them, the engine's SETTING_BOUNDS derives its bounds from them, and here each becomes
// a Channels row under today's key (`channels.budgetLarkPerMin` …). Every derived row is advanced (a per-minute or
// per-second pace — the tier rule), matters only while an account of that vendor is linked (`when: { channel }`), and
// carries `channel` (the Settings window draws it in the "Per vendor" block with "Read by the Channels engine · Lark").
const CHANNEL_SETTING_OWNERS = new Map(); // vendor → { vendorName, paths[] }
function deriveChannelRow(tbl, r) {
  return {
    type: r.type, default: r.default, min: r.min, max: r.max, ...(r.step !== undefined ? { step: r.step } : {}),
    label: t(r.label), description: t(r.description),
    tier: 'advanced', when: { channel: tbl.vendor },
    category: t('Channels'), liveApply: true, channel: tbl.vendor,
  };
}
function deriveChannelTable(tbl) {
  const paths = [];
  for (const r of tbl.rows) { const p = channelSettingPath(r.key); SETTINGS_SCHEMA[p] = deriveChannelRow(tbl, r); paths.push(p); }
  CHANNEL_SETTING_OWNERS.set(tbl.vendor, { vendorName: tbl.vendorName, paths });
  return paths;
}
for (const tbl of Object.values(CHANNEL_SETTINGS)) deriveChannelTable(tbl);
/** The settings paths a vendor's table derived (`['channels.budgetLarkPerMin', 'channels.larkRequestsPerSec']`). */
export function channelSettingPaths(vendor) { return [...(CHANNEL_SETTING_OWNERS.get(vendor)?.paths || [])]; }
/** A channel vendor's name in the user's language ('Lark', 'Gmail'); a vendor without a table reads its slug capitalised. */
export function channelVendorName(vendor) {
  const own = CHANNEL_SETTING_OWNERS.get(vendor);
  return own ? t(own.vendorName) : String(vendor || '').charAt(0).toUpperCase() + String(vendor || '').slice(1);
}


// Ordered category list for UI rendering.
//
// THIS LIST IS THE RENDER LOOP, NOT A HINT. SettingsUI._renderContent groups
// every row by `schema.category` and then renders by iterating THIS ARRAY — a
// category that is missing here is grouped into a bucket nobody reads, so its
// rows are unreachable in the product AND invisible to search ("No settings
// match your search."). Measured on this file before the fix: 118 settings,
// 108 rendered, 10 dropped — the seven `Spending` rows (every money ceiling,
// the overage consent and the EDF reserve floor, while three shipped strings
// told the user to go to "Settings → Spending") and the three `OpenCode` rows,
// which had been invisible since they shipped.
// scripts/test-architecture.mjs §44 is the census that makes the next omission
// fail the BUILD; adding a category here is the whole fix.
// The ORDER follows docs/settings.md's "All Settings Reference" so the nav and
// the manual read the same way top to bottom — a convention, not an enforced
// invariant: §44 asserts MEMBERSHIP (which is what makes a setting reachable),
// never the sequence.
const SETTINGS_CATEGORIES = [
  t('Toolbar & Layout'),
  t('Window'),
  t('Terminal'),
  t('Chat'),
  t('Session'),
  t('Integration'),
  t('Background Work'),
  t('Spending'),
  t('Agent browser'),
  t('Desktop apps'),
  t('Channels'),
  t('Claude'),
  t('Codex'),
  t('OpenCode'),
  t('Sidebar'),
  t('Session Card'),
];

// ── PLUGIN-CONTRIBUTED SETTINGS (Plugin Ph4, 2.369.30 — docs/plugins.md) ──
// `contributes.settings[]` of an ENABLED plugin registers here as
// `plugin.<id>.<key>` under the category "Plugin: <label>". The Settings
// window, SettingsManager (sparse storage + settings-updated WS sync) and the
// plugin host API all read SETTINGS_SCHEMA live, so registering is the only
// step; unregister on disable removes the rows (stored values stay in the
// sparse store, harmless, and come back when the plugin is re-enabled).
// REGISTRATION FUNCTIONS ONLY — nothing outside this module mutates the
// schema object or the category list directly.
const PLUGIN_SETTING_OWNERS = new Map(); // pluginId → { category, paths[] }
export function pluginSettingPath(pluginId, key) { return `plugin.${pluginId}.${key}`; }
export function registerPluginSettings(pluginId, label, items) {
  unregisterPluginSettings(pluginId);
  const category = t('Plugin: {name}', { name: label || pluginId });
  const paths = [];
  for (const s of Array.isArray(items) ? items : []) {
    if (!s || typeof s.key !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(s.key)) continue;
    const path = pluginSettingPath(pluginId, s.key);
    const entry = { label: String(s.label || s.key), description: String(s.description || ''), category, liveApply: true, plugin: pluginId };
    if (s.type === 'boolean') Object.assign(entry, { type: 'boolean', default: !!s.default });
    else if (s.type === 'number') Object.assign(entry, { type: 'number', default: Number.isFinite(Number(s.default)) ? Number(s.default) : 0, min: s.min, max: s.max, step: s.step });
    else if (s.type === 'select') Object.assign(entry, { type: 'enum', default: String(s.default ?? ''), options: (Array.isArray(s.options) ? s.options : []).map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: String(o?.value ?? ''), label: String(o?.label ?? o?.value ?? '') })) });
    else Object.assign(entry, { type: 'string', default: String(s.default ?? '') });
    SETTINGS_SCHEMA[path] = entry;
    paths.push(path);
  }
  if (paths.length && !SETTINGS_CATEGORIES.includes(category)) SETTINGS_CATEGORIES.push(category);
  PLUGIN_SETTING_OWNERS.set(pluginId, { category, paths });
  return paths;
}
export function unregisterPluginSettings(pluginId) {
  const own = PLUGIN_SETTING_OWNERS.get(pluginId);
  if (!own) return false;
  for (const p of own.paths) delete SETTINGS_SCHEMA[p];
  PLUGIN_SETTING_OWNERS.delete(pluginId);
  if (![...PLUGIN_SETTING_OWNERS.values()].some((o) => o.category === own.category)) {
    const i = SETTINGS_CATEGORIES.indexOf(own.category);
    if (i >= 0) SETTINGS_CATEGORIES.splice(i, 1);
  }
  return true;
}
export function listPluginSettings(pluginId) { return [...(PLUGIN_SETTING_OWNERS.get(pluginId)?.paths || [])]; }

// ── SETTINGS GROUPS (2.369.132, owner: "所有设置界面也可以做一下设置分级") ──
// The nav is a TREE: group heads over the categories. SETTINGS_CATEGORIES stays
// the census of what renders (§44); a group only ORDERS and FOLDS. Every
// category maps to exactly one group (test-architecture pins it); a category
// no group names falls into the trailing groups by rule — a plugin's
// "Plugin: <label>" under Plugins, anything else under Other — never dropped.
const SETTINGS_GROUPS = [
  { id: 'appearance', label: t('Appearance & layout'), categories: [t('Toolbar & Layout'), t('Window'), t('Sidebar'), t('Session Card')] },
  { id: 'sessions', label: t('Sessions & chat'), categories: [t('Session'), t('Chat'), t('Terminal')] },
  { id: 'harness', label: t('Harnesses'), categories: [t('Claude'), t('Codex'), t('OpenCode')] },
  { id: 'services', label: t('Services'), categories: [t('Integration'), t('Channels'), t('Background Work'), t('Agent browser'), t('Desktop apps')] }, // Agent browser (agent browser v2, 2.369.134; the category was 'Browser' before the direction-B rename) is a service the instance runs — profiles, keeper, proxy
  { id: 'spending', label: t('Spending'), categories: [t('Spending')] },
  { id: 'plugins', label: t('Plugins'), categories: [] },
  { id: 'other', label: t('Other'), categories: [] },
];
/** The group a category belongs to (id). A contributed harness table lands in
 *  'harness'; a plugin's category in 'plugins'; anything unknown in 'other'. */
export function settingsGroupOf(category) {
  for (const g of SETTINGS_GROUPS) if (g.categories.includes(category)) return g.id;
  for (const own of HARNESS_SETTING_OWNERS.values()) if (own.category === category) return 'harness';
  if (/^Plugin: /.test(category) || [...PLUGIN_SETTING_OWNERS.values()].some((o) => o.category === category)) return 'plugins';
  return 'other';
}
/** SETTINGS_CATEGORIES re-ordered by group (the render + nav order); every
 *  listed category appears exactly once — the census set is untouched. */
export function orderedCategories(cats = SETTINGS_CATEGORIES) {
  const byGroup = new Map(SETTINGS_GROUPS.map((g) => [g.id, []]));
  for (const c of cats) byGroup.get(settingsGroupOf(c)).push(c);
  const out = [];
  for (const g of SETTINGS_GROUPS) {
    const own = byGroup.get(g.id);
    // a static group keeps its declared order, then any late-registered category of that group
    const declared = g.categories.filter((c) => own.includes(c));
    out.push(...declared, ...own.filter((c) => !declared.includes(c)));
  }
  return out;
}
export function settingsGroups() { return SETTINGS_GROUPS.map((g) => ({ id: g.id, label: g.label })); }

/** A number typed into a schema row, CLAMPED to the row's own bounds
 *  (2026-09-26, lane R2 verify: the Settings window stored 1800 for a
 *  "at most 900" row while the engine silently ran 900). `{value, bound}` —
 *  `bound` is 'max' | 'min' when the value was moved (the input then says
 *  so), null when it was in range. PURE: the input and the suites share it. */
export function clampToSchema(schema, num) {
  const n = Number(num);
  if (!schema || !Number.isFinite(n)) return { value: n, bound: null };
  if (schema.max !== undefined && n > schema.max) return { value: schema.max, bound: 'max' };
  if (schema.min !== undefined && n < schema.min) return { value: schema.min, bound: 'min' };
  return { value: n, bound: null };
}

export { SETTINGS_SCHEMA, SETTINGS_CATEGORIES, SETTINGS_GROUPS };
// The closed `when` tag set, the facts and the tiers (defined in settings-view.js, PURE) — exported here too,
// beside the rows they annotate: lane channel-declared-settings derives `when: { channel }` rows on this set.
export { WHEN_KINDS, WHEN_FACTS, TIERS } from './settings-view.js';

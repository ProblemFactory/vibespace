/**
 * Settings Schema — single source of truth for all configurable options.
 *
 * Each key is a dotted path (e.g. 'toolbar.showLayoutPresets').
 * Only non-default values are persisted (sparse storage).
 */

import { t } from './i18n.js';
import { HARNESS_SETTINGS, settingPath, checkTable, rowsOfKind } from '../harness-settings.js'; // PURE (CJS): the descriptor-declared per-harness tables — the Claude/Codex/OpenCode sections are DERIVED from them (docs/design-harness-settings.zh.md §4)

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
  // 2.369.97 (userW, inc-mu1qa5gj-9qe9 "找不到右上角的desktop了"): this key was
  // READ by applyChromeSettings and by customize mode since 2.111.4 but never
  // DECLARED, so `settings.get` answered undefined and the button hid whenever
  // chrome settings were re-applied after the VNC probe — which 2.369.96's
  // desktop-apps probe started doing on every page load.
  'toolbar.showDesktopButton': {
    type: 'boolean', default: true, label: t('Show Desktop button'),
    description: t('Show the shared-desktop (VNC) button in the toolbar (hidden anyway when this machine has no VNC server)'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'toolbar.showDesktopAppsButton': {
    type: 'boolean', default: true, label: t('Show Apps button'),
    description: t('Show the desktop-application launcher button in the toolbar (hidden anyway when this machine has no display backend)'),
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
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'desktop.dynamicEnabled': {
    type: 'boolean', default: false, label: t('Dynamic desktop (Stage)'),
    description: t('A special desktop at the left of the strip: sessions materialize into a shared slot together with their own workspace of helper windows. See docs/design-dynamic-desktop.md'),
    category: t('Window'), liveApply: true,
  },
  'desktop.idleTimeoutMin': {
    type: 'number', default: 30, min: 0, max: 1440, step: 5, label: t('Desktop app idle timeout (minutes)'),
    description: t('A desktop application window with no input for this long is stopped; 0 = never. "Keep running" in a window exempts that app.'),
    category: t('Window'), liveApply: true,
  },
  'desktop.stageKeepAlive': {
    type: 'number', default: 3, min: 0, max: 10, step: 1, label: t('Stage: workspaces kept alive'),
    description: t('How many recent session workspaces stay loaded (hidden) for instant switching; older ones are saved and closed'),
    category: t('Window'), liveApply: true,
  },
  'layout.presetOneShot': {
    type: 'boolean', default: false, label: t('Layout buttons apply once'),
    description: t('A layout button arranges the current windows once and returns to free-form. Off (default): it also keeps that grid active, so windows snap to its cells until you pick Freeform'),
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
  'chat.showHookCards': {
    type: 'boolean', default: true,
    label: t('Show hook cards in chat'),
    description: t('Hook events (context injections, plugin hooks, stop nudges) render as collapsible ✓/✗ cards. Turn off to hide them all — applies to open chats instantly.'),
    category: t('Chat'), liveApply: true,
  },
  'chat.hideEmptyHooks': {
    type: 'boolean', default: true,
    label: t('Hide hooks with no output'),
    description: t('Hooks like PostToolUse fire on every tool call with nothing to show — by default those render no card at all. Turn off to see every hook event. Applies to newly loaded history (reopen the window for existing views).'),
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
    type: 'multiSelect', default: ['thinking', 'bash', 'read', 'memory', 'mcp', 'skill', 'agent', 'search', 'image'],
    options: [
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
      // NOT in the default set (2.369.120, owner): an Unknown event — a harness
      // record VibeSpace does not recognize — is the fall-back card and must
      // stay visible until the user decides it is noise.
      { value: 'unknown', label: t('Unknown events / new fields on known records (harness records VibeSpace does not recognize)') },
    ],
    label: t('Card kinds that collapse'),
    description: t('Which card kinds fold into the summary line, by MEANING — the same setting covers every backend (claude Bash and codex exec are both command runs). Enabled kinds collapse TOGETHER as one interleaved group (think → read → edit → run is the real work pattern; per-kind groups rarely get long enough to fold). Memory = operations on the agent\'s own memory directory — housekeeping, folded by default and listed as memory/<name> in the summary; project-file writes are off by default — diffs are usually worth seeing. A run of only thinking needs two or more; any tool card folds immediately. Cards waiting for your approval never fold.'),
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
  'agents.contextInjection': {
    type: 'boolean', default: true,
    label: t('Inject Task Group context'),
    description: t('Deliver each session\'s Task Group context (objective, shared-context folder index, activity log, update diffs) into the agent via hooks. OFF: agents get no group payloads at all — the reporting tools below still work if enabled. The per-group "Inject context" checkbox in the group\'s detail window is the finer-grained version of this.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.toolStatus': {
    type: 'boolean', default: true,
    label: t('Agent tool: vibespace-status (board state)'),
    description: t('Lets agents self-report working/blocked/needs-input/… onto the session board. OFF: the tool is no longer taught in injected context or reminders, its endpoint refuses with skip-and-continue guidance, and the stop-time bookkeeping nudge (which is keyed on status staleness) never fires. Synthesized states (idle detection) keep working.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.toolAsk': {
    type: 'boolean', default: true,
    label: t('Agent tool: vibespace-ask (your inbox)'),
    description: t('Lets agents mirror questions/decisions onto your "For you" inbox. OFF: not taught, endpoint refuses with skip-and-continue guidance — agents ask only in chat.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.toolTask': {
    type: 'boolean', default: true,
    label: t('Agent tool: vibespace-task (activity log & backlog)'),
    description: t('Lets agents log finished work into the group activity log and park items in the group backlog. OFF: not taught, the progress/backlog write endpoints refuse with skip-and-continue guidance; reading group state (vibespace-task show) still works while context injection is on.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.toolJobs': {
    type: 'boolean', default: true,
    label: t('Agent tool: vibespace-job (background work)'),
    description: t('Lets agents register services, long tasks and cron schedules that outlive their conversation (Background Work window). OFF: not taught, endpoints refuse with skip-and-continue guidance; existing jobs keep running and stay visible to you.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.jobNotify': {
    type: 'boolean', default: true,
    label: t('Background jobs: notify the owner conversation'),
    description: t('When a background job finishes, fails, is parked, or needs input, its owner conversation gets a message through Claude Code’s own cross-session messaging inbox (delivered by the CLI under its inbound rules; an idle session starts a turn, billed like a typed prompt). When the conversation is closed, the notification is stashed and injected the next time it resumes. Per-group override in the Task Group detail window; per-job override at creation (--notify on/off).'),
    category: t('Integration'), liveApply: true,
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
    category: t('Background Work'), liveApply: true,
  },
  'jobs.archiveFailedAfterDays': {
    type: 'number', default: 7, min: 0, max: 90, step: 1,
    label: t('Archive acknowledged failures after (days)'),
    description: t('A failed, missed, interrupted or unverified one-shot leaves the list this many days after somebody ACKNOWLEDGED it (its owner conversation was notified, an owner agent polled it, or you expanded its row). An unacknowledged failure is never archived. 0 = never archive failures.'),
    category: t('Background Work'), liveApply: true,
  },
  'agents.vibespaceChannel': {
    type: 'boolean', default: false,
    label: t('VibeSpace channel (experimental)'),
    description: t('Registers VibeSpace as a Claude Code channel in NEW local claude sessions (research-preview CLI feature, enabled per spawn via the development-channels flag). Job notifications then arrive as structured <channel source="vibespace"> events instead of plain peer messages, and this becomes the bridge for future external chat integrations. Sessions must be recreated to pick up a change. Leave off unless experimenting.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.stopNudgeStaleMinutes': {
    type: 'number', default: 10, min: 0, max: 240, step: 1,
    label: t('Stop nudge: staleness threshold (minutes)'),
    description: t('The nudge only fires when the session has not updated its board status for this long. Lower = agents are reminded more eagerly; higher = quieter. 0 = always considered stale (with cooldown 0 too, the nudge fires on EVERY stop — one bookkeeping mini-turn per turn).'),
    category: t('Integration'), liveApply: true,
  },
  'agents.stopNudgeCooldownMinutes': {
    type: 'number', default: 30, min: 0, max: 720, step: 1,
    label: t('Stop nudge: cooldown per session (minutes)'),
    description: t('After nudging a session once, wait at least this long before nudging it again — the ceiling on how often an agent pays the bookkeeping mini-turn. 0 = no cooldown.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.stopBookkeepingNudge': {
    type: 'boolean', default: true,
    label: t('Stop-time bookkeeping nudge for agents'),
    description: t('When an agent finishes a turn while its board state is stale (no status update in 10 minutes), it gets one short follow-up asking it to set vibespace-status, mirror open questions with vibespace-ask, and log finished work — then it stops. At most once per 30 minutes per session. Claude enforces this via a blocking Stop hook; Codex via its wrapper at turn end.'),
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
    category: t('Chat'), liveApply: true,
  },
  'agentd.publicUrl': {
    type: 'string', default: '',
    label: t('This instance\'s public address (for reverse mounts)'),
    description: t('The https/http URL a remote machine uses to reach THIS VibeSpace (reverse mounts, remote agent installs, page share links). Leave blank to let each browser use its own address. The Ports panel\'s "This VibeSpace" row can map the whole instance to an frp URL, which takes precedence while mapped WITHOUT changing this value.'),
    category: t('Session'), liveApply: true,
  },
  'agentd.autoGraduate': {
    type: 'boolean', default: true, category: t('Integration'),
    label: t('Move machines to a ws link automatically'),
    description: t('When an SSH machine\u2019s agent is reachable, install it as a service so it dials back over WebSocket \u2014 fewer per-command SSH spawns and a link that notices breakage. Only runs when a public URL is set above; SSH always stays as the rescue channel.'),
  },
  'agentd.localPipeSessions': {
    type: 'boolean', default: false, category: t('Integration'),
    label: t('Local sessions via device daemon (R6)'),
    description: t('New local chat sessions run as device-daemon pipe sessions instead of dtach — the session-brain final form (survives server restarts via the daemon). Existing sessions are never migrated; any daemon failure falls back to dtach at spawn. Leave off until the device-assisted consumer path has soaked.'),
  },
  'agentd.localDiscovery': {
    type: 'boolean', default: false, category: t('Integration'),
    label: t('Local session discovery via device daemon'),
    description: t('The 5s session-list sweep reads its filesystem facts (lock files, transcript listing, tail ids) from the device daemon\'s snapshot — computed in a daemon child process, so a slow or network-mounted home directory can never stall the server. Local enrichment (window mapping, tmux) is unaffected. Falls back to the local scan on any failure.'),
  },
  'agents.injectPreamble': {
    type: 'text', default: '',
    label: t('Custom agent instructions (injected)'),
    description: t('Your own standing instructions for every agent session, injected at the TOP of the VibeSpace hook context (task context or the baseline tools intro). Delivered once per session and re-delivered when you change it — never on every turn. Edit comfortably in Manage Agents → Agent instructions. Max 4000 chars.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.perTurnExtra': {
    type: 'text', default: '',
    label: t('Per-turn reminder extra (injected EVERY prompt)'),
    description: t('Short custom text placed at the top of the per-turn reminder — reaches the agent on EVERY message you send, so keep it tight (≤500 chars; it costs tokens each turn). Delivers even if the standard tool reminder is turned off. Edit in Manage Agents → Agent instructions.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.stopNudgeExtra': {
    type: 'text', default: '',
    label: t('Stop-nudge extra (injected when the bookkeeping nudge fires)'),
    description: t('Custom text placed at the top of the stop-time bookkeeping nudge (≤500 chars) — e.g. extra end-of-turn duties for your agents. Edit in Manage Agents → Agent instructions.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.perTurnToolReminder': {
    type: 'boolean', default: true,
    label: t('Per-turn tool reminder for agents'),
    description: t('Injects a one-line (~250 byte) reminder of the vibespace tools (status / ask / task) with every prompt you send, so agents keep using them in long sessions — the full rules injected at session start scroll out of the working context over time. Turn off to save the few tokens per turn.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.contextUpdateDiffs': {
    type: 'boolean', default: true,
    label: t('Task Group updates as diffs'),
    description: t('When a Task Group changes mid-session, agents receive only WHAT changed (new activity entries, objective edits, backlog changes, changed shared files) instead of the whole group context again. The full context is still delivered on first contact and after a server restart. Turn off to always re-send the complete state.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.allowGroupManagement': {
    type: 'boolean', default: false,
    label: t('Allow agents to manage Task Groups'),
    description: t('Lets sessions YOU designate as "Group manager" (Session Properties) create and configure Task Groups via their CLI — create/update/bind/unbind, the same organize-only operations you perform in the UI. Paths they may use are limited by the roots setting below; every operation is recorded in the group\'s activity log. Off = the API refuses all agents.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.stopNudgeMaxUnanswered': {
    type: 'number', default: 3, min: 0, max: 100, step: 1,
    label: t('Stop nudge: give up after this many unanswered nudges'),
    description: t('A session that has never reported a board status is being asked for bookkeeping it does not do — and every nudge costs a real mini-turn. After this many nudges with no status report at all, that session is not nudged again (any status report resets the count). 0 = never give up.'),
    category: t('Integration'), liveApply: true,
  },
  'agents.groupManagementRoots': {
    type: 'string', default: '~',
    label: t('Group management path roots'),
    description: t('Comma-separated absolute path prefixes a manager agent may use for a group\'s context folder / auto-include folders (~ = your home). Keeps agents from pointing context injection at arbitrary paths.'),
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
    category: t('Spending'), liveApply: true,
  },
  // ── Channels (docs/design-communication-panel.zh.md §7.4 / fence 12, P2) ──
  'channels.pushCoalesceSeconds': {
    type: 'number', default: 60, min: 0, max: 600, step: 5,
    label: t('Coalesce pushed messages before waking an agent (seconds)'),
    description: t('Polling batches a minute of messages into ONE wake by nature; a push lane delivers them one by one, so a burst of 30 would become 30 billed turns. While a push lane carries messages, matched hits are gathered for this many seconds and delivered as one wake that lists them all. 0 = wake per message. Poll and scan lanes are already batches and never wait.'),
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
    category: t('Channels'), liveApply: true,
  },
  'channels.offHoursEnd': {
    type: 'string', default: '18:00',
    label: t('Outbox: working hours end (HH:MM)'),
    description: t('Only used when the time zone above is set.'),
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
    description: t('While an account is using paid overage its utilization stays under 100% even though every token costs money, so the pool\u2019s \u201cmost remaining\u201d ranking actively prefers it. With this on, such a member is not a voluntary switch target (an escape from a dead account still uses it, and it keeps serving its own conversations). Off by default: watch the quota panels for a week first — they now say \u201cpaid overage in use\u201d.'),
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
    category: t('Session'), liveApply: true,
  },
  'telemetry.forwardToken': {
    type: 'text', default: '',
    label: t('Central collector token'),
    description: t('Sent as a Bearer Authorization header with forwarded batches when the collector requires a shared token (a VibeSpace collector always does). Leave empty if none is required.'),
    category: t('Session'), liveApply: true,
  },
  'usage.otelTruth': {
    type: 'boolean', default: true,
    label: t('Per-request billing truth (local telemetry)'),
    description: t('New LOCAL claude sessions export the CLI’s own OpenTelemetry api_request events to this VibeSpace instance over loopback (never to any external endpoint). Each event names the organization that ACTUALLY billed the request, so the usage ledger, quota estimates and pool decisions stay correct even while a running session still holds a pre-switch token after a pool account switch. Zero extra Anthropic traffic — the CLI pushes locally. Applies to sessions started after the change.'),
    category: t('Session'), liveApply: true,
  },
  'accounts.activeUsagePolling': {
    type: 'boolean', default: false, confirmOn: true,
    label: t('⚠ Actively poll subscription usage (automation risk)'),
    description: t('OFF (recommended): usage bars are captured passively from your live terminal sessions — VibeSpace never contacts Anthropic on its own. Turning this ON restores the old behavior: the server calls Anthropic’s usage endpoint on a ~90s timer with each subscription’s token, even for idle accounts. That off-CLI, fixed-cadence, non-human traffic is exactly what can get a Pro/Max account flagged as automated and BANNED — a real account was banned+refunded for this. Only enable it if you accept that risk (e.g. to see live usage for chat-only or idle accounts).'),
    category: t('Session'), liveApply: true,
  },

  'taskbar.toastSeconds': {
    type: 'number', default: 6, min: 2, max: 60,
    label: t('Notification popup duration (seconds)'),
    description: t('How long toast cards (new inbox items, errors, confirmations) stay on screen. They appear next to the inbox button and every one is kept in the inbox popup’s Notifications tab.'),
    category: t('Toolbar & Layout'), liveApply: true,
  },
  'mounts.vfsCacheMaxSizeGB': {
    type: 'number', default: 10, min: 1, max: 500,
    label: t('Storage mount cache size (GB)'),
    description: t('Per-mount disk budget for the rclone read/write cache (vfs-cache-mode full). Reads are cached chunk-wise on local disk; writes land locally and upload in the background — the cache survives crashes and resumes uploading on reconnect. Applied when a mount (re)connects.'),
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
  'sessionCard.detailTruncation': {
    type: 'enum', default: 'left',
    options: [
      { value: 'left', label: t('Truncate left (show end)') },
      { value: 'right', label: t('Truncate right (show start)') },
    ],
    label: t('Detail value truncation'),
    description: t('When text overflows, truncate from the left (shows filename) or right (shows path start)'),
    category: t('Session Card'), liveApply: true,
  },
};

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

export { SETTINGS_SCHEMA, SETTINGS_CATEGORIES };

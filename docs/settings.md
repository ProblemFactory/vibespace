# Settings

## Overview

The settings system has three layers:

1. **Global settings** (toolbar ⚙) — Quick access to theme, font size, font family
2. **Per-terminal settings** (window ⚙) — Override theme/font/size per terminal window
3. **Full settings UI** — VS Code-style dialog with all options, including backend-specific Claude/Codex launch defaults, accessible via "All Settings" link

Settings are stored server-side (sparse storage — only non-default values persisted) and sync across all connected clients via WebSocket.

## Opening Settings

- **Toolbar ⚙** → Quick popover with theme, font size (A-/A+), font family, and "All Settings" link
- **"All Settings"** → Full settings, category navigation and search. It opens as a **normal window** (not a blocking overlay), so you can drag it aside, resize it, and tweak a setting while watching the effect on your workspace live. Opening it again focuses the existing window.
- **Everyday and advanced.** The window opens on the everyday settings. Timers, byte budgets, request paces, raw JSON state and operator switches are **advanced**: they draw while the header's **Show advanced settings** switch is on (remembered per device), and otherwise each category ends with a line "N advanced settings hidden · Show".
- **Only what applies here.** A setting that cannot matter on this machine or in this setup is hidden, never greyed: the Codex and OpenCode sections without that CLI installed, **Desktop apps** without a display backend, a Lark-only row without a linked Lark account, a row that depends on another switch while that switch is off. A search still finds every setting, with a chip that says why it is not in use here; a setting you changed always stays visible.
- **Per-terminal ⚙** → Gear icon on each terminal window's title bar

## Global Settings (Quick Access)

The toolbar gear opens a popover with:

| Control | Description |
|---------|-------------|
| Theme dropdown | Switch between 6 themes |
| A- / A+ buttons | Decrease / increase terminal font size |
| Font family dropdown | Select terminal font (web fonts + system fonts) |

Changes apply immediately to all terminals that don't have per-terminal overrides.

## Language (English / 中文 / 日本語)

The ⚙ menu has a **Language** entry: Auto (follows your browser/system), English,
中文, or 日本語. The choice is **per device** (stored in this browser, not synced) —
your phone can run in Japanese while your desktop stays in English against the
same server. Switching reloads the page. Untranslated strings fall back to
English automatically. Agent-facing content (injected task context, CLI help
text) intentionally stays English.

## Backend Defaults

The full settings dialog has separate **Claude** and **Codex** sections. These defaults are applied when:

- Creating a new session with that backend
- Resuming a stopped session with that backend
- Switching the backend selector in the new-session dialog

Shared behavior such as default **Chat/Terminal** mode still lives under the generic **Session** section.

## Per-Terminal Overrides

Each terminal window's ⚙ popover allows overriding:

| Setting | Default behavior |
|---------|-----------------|
| Theme | "Default" follows global theme |
| Font size | "Default" checkbox follows global size |
| Font family | "Default" follows global font |

When "Default" is selected, the terminal follows whatever the global setting is. Set a specific value to override for just that terminal.

Overrides persist in the layout auto-save.

## All Settings Reference

Every setting is listed below, the advanced ones and the ones that only apply in some setups included. Since 2.369.203 the five desktop-application rows (`desktop.idleTimeoutMin`, `desktop.appScale`, `desktop.seamless`, `desktop.backendPrefs`, `window.realDesktopTargets`) live in their own **Desktop apps** category (Services), `claude.autoResumeOnLimit` under **Spending** (it starts billed turns), the three `agentd.*` device-daemon switches under **Session** and `agents.jobNotify` under **Background Work** — the keys did not change, so stored values stay where they are.

<!-- settings-reference:begin — the tables below are GENERATED from src/lib/settings-schema.js by scripts/gen-settings-reference.mjs (test-architecture 44d): edit the prose around a table, never a table -->

### Toolbar & Layout

<!-- settings-table: Toolbar & Layout -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `toolbar.showLayoutPresets` | boolean | `true` | **Show layout presets** — Show the entire layout presets bar (built-in presets, custom grids, and + add button) |
| `toolbar.showBrowserButton` | boolean | `true` | **Show Web view button** — Show the embedded-browser button in the toolbar |
| `toolbar.showDesktopButton` | boolean | `true` | **Show Desktop button** — Show the shared-desktop (VNC) button in the toolbar (hidden anyway when this machine has no VNC server) |
| `toolbar.showDesktopAppsButton` | boolean | `true` | **Show Apps button** — Show the desktop-application launcher button in the toolbar (hidden anyway when this machine has no display backend) |
| `toolbar.showTerminalButton` | boolean | `true` | **Show Terminal button** — Show the plain-shell terminal button in the toolbar |
| `toolbar.showPresetsButton` | boolean | `true` | **Show Presets button** — Show the saved workspace presets button in the toolbar |
| `toolbar.showFileExplorerButton` | boolean | `true` | **Show Files button** — Show the file explorer button in the toolbar |
| `sidebar.position` | enum | `left` | **Sidebar position** — Which screen edge the session sidebar docks to |
| `taskbar.position` | enum | `bottom` | **Taskbar position** — Dock the taskbar (window list, desktop previews, usage) to the top or bottom of the screen |
| `taskbar.visibility` | enum | `show` | **Taskbar visibility** — Auto-hide slides the taskbar away and reveals it when the pointer touches the screen edge. Hidden removes it entirely (desktops still switch with Ctrl+Alt+Left/Right) |
| `taskbar.showDesktopPreviews` | boolean | `true` | **Show desktop previews** — Show the virtual-desktop miniature previews in the taskbar |
| `taskbar.showUsage` | boolean | `true` | **Show usage meters** — Show the 5h/7d rate-limit donuts in the taskbar |
| `taskbar.showUserTodos` | boolean | `true` | **Show the "For you" inbox** — Show the inbox of items agents filed for you (decisions/input needed) in the taskbar |
| `taskbar.showWindowCount` | boolean | `true` | **Show window count** — Show the "N windows" counter/list button in the taskbar |
| `toolbar.showCommandMode` | boolean | `true` | **Enable command mode** — Enable Ctrl+\ command mode for keyboard-driven window management |
| `layout.enableDragSnap` | boolean | `true` | **Snap on drag** — Snap windows to grid cells or screen edges when dragging |
| `layout.enableShiftDragSelection` | boolean | `true` | **Shift-drag cell selection** — Hold Shift while dragging title bar to select a range of grid cells |
| `layout.presetOneShot` | boolean | `false` | **Layout buttons apply once** — A layout button arranges the current windows once and returns to free-form. Off (default): it also keeps that grid active, so windows snap to its cells until you pick Freeform |
| `layout.shakeBypassSnap` | boolean | `true` | **Shake to bypass snap** — Shake a window vigorously for ~1 second while dragging to turn off grid/edge snap for the rest of that drag (a mouse-only alternative to holding Alt) |
| `layout.shakeBypassSeconds` | number | `1` | **Shake duration (seconds)** — How long you must keep shaking before grid snap turns off. Lower = triggers faster (but easier to trigger by accident). |
| `taskbar.desktopPreviewRatio` | number | `70` | **Desktop preview size (%)** — How much of the taskbar height the desktop preview occupies (rest goes to label text) |
| `chrome.arrangement` | json | — | **Chrome element arrangement** — Which bar hosts each movable element, in what order ({zone: [elementId, …]}). Managed by Customize mode (⚙ → Customize UI… → drag elements); edit by hand only if you know what you are doing. |
| `chrome.zoneAlign` | json | — | **Chrome alignment** — Alignment per area: taskbar-items left/center (Windows-11-style centered icons), toolbar-center left/center/right, taskbar-tray left/right end. Managed by Customize mode. |
| `chrome.springs` | json | — | **Spring configs** — Per-spring config: {mode:"flex", weight:1-9} (strength = flex-grow share) or {mode:"fixed", px:N} (rigid spacer). Managed by Customize mode (click a spring). |
| `taskbar.toastSeconds` | number | `6` | **Notification popup duration (seconds)** — How long toast cards (new inbox items, errors, confirmations) stay on screen. They appear next to the inbox button and every one is kept in the inbox popup’s Notifications tab. |
<!-- /settings-table -->

> Tip: the easiest way to change all of the above is **Customize mode** (⚙ menu → Customize UI…, or right-click empty toolbar/taskbar space → Customize UI…). It's a Firefox-style edit mode: every customizable element gets outlined on the real UI — **click** an element to hide/show it (hidden elements stay dimmed on screen while editing, so nothing disappears), **drag** an element to reorder it or move it to a different bar entirely (toolbar center, toolbar right, or the taskbar tray — e.g. drag the desktop previews and usage meters into the toolbar, then hide the whole taskbar). Segmented pills next to the taskbar/sidebar switch position (Top/Bottom, Left/Right) and taskbar visibility (Show/Auto-hide/Hidden), and mini **alignment chips** appear next to each alignable area: window items left/centered (Windows-11 style), toolbar-center content left/center/right, and the tray at the taskbar's left or right end. **+ Spring** inserts a flexible space (macOS-toolbar style) that pushes its neighbors apart — drag it between two elements for justify-between-style layouts (e.g. previews centered, usage pushed to the right edge). Click a spring to configure it: **Flexible** with a strength weight (two springs at 1× and 3× split leftover space 1:3) or **Fixed** width — in px or **% of screen width**, plus Remove. The **Match…** button enters a pick mode: click any bar element (the "☰ VibeSpace" section, a button, the previews…) to copy its width into the spring; keep clicking to *sum* multiple elements' widths; Done or Escape finishes. That's the one-click way to align an extra row's center with the toolbar's center: spring at the row start → Match → click the ☰ VibeSpace section. Two **extra bar rows** exist below the toolbar and next to the taskbar — invisible until you drag elements into them (e.g. give the layout presets their own full row), auto-hidden again when emptied. Escape or Done exits; Reset restores chrome defaults. A few core anchors (☰ sidebar toggle, the ⚙ gear, the window-item strip) are deliberately not movable; the New Session button is movable but can't be hidden. The right-click menus also keep direct toggles for quick single changes.

### Window

<!-- settings-table: Window -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `desktop.dynamicEnabled` | boolean | `false` | **Dynamic desktop (Stage)** — A special desktop at the left of the strip: sessions materialize into a shared slot together with their own workspace of helper windows. See docs/design-dynamic-desktop.md |
| `desktop.stageKeepAlive` | number | `3` | **Stage: workspaces kept alive** — How many recent session workspaces stay loaded (hidden) for instant switching; older ones are saved and closed |
| `window.tabWrap` | boolean | `false` | **Multi-row tabs** — Allow tab bar to wrap into multiple rows when there are many tabs (like a flow layout) |
| `window.mergeDropLayout` | enum | `tabs` | **Dropping a window onto another** — What a window dragged onto another window's icon or tab bar becomes: grouped as tabs (a toast offers "Show side by side"), or shown side by side at once — the dragged window on the right, with Undo (it goes back where it was) and Unsplit (stay grouped as tabs). |
| `window.openLinkPlacement` | enum | `split` | **Opening a file path or link from a window** — Where a file or folder opened from a chat (a path or a local link) appears: beside that chat window (the side it is not on, if it is already side by side), as a tab next to it, or in its own free window. Opening the same path again from the same window shows the tab it is already in. The phone always opens its own window. |
| `window.closeBehavior` | enum | `detach` | **Window close behavior** — What happens when closing a session window: detach and keep it running (default — the session stays in the sidebar for re-attach), or terminate it. Automation helper terminals always terminate. |
| `window.titlebarSwitchScope` | enum | `overlap` | **Title-bar "Switch window" scope** — Which windows the title-bar right-click menu's "Switch window" submenu lists: only windows overlapping this one (classic), every window on the current desktop, or all windows across desktops (entries name their desktop; picking one switches to it). |
| `window.activeHighlightIntensity` | enum | `normal` | **Active window highlight** — How prominently the focused window is highlighted (subtle = shadow only, normal = accent border, strong = border + glow) |
<!-- /settings-table -->

### Terminal

<!-- settings-table: Terminal -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `terminal.minimumContrastRatio` | number | `1` | **Minimum contrast ratio** — Auto-adjust text colors to meet this contrast ratio (4.5 = WCAG AA). Set to 1 to disable. |
| `terminal.webgl` | boolean | `true` | **WebGL renderer** — Draw terminals with WebGL (fast). Turn it off to test whether GPU-side freezes come from the terminals — new terminals then use the DOM renderer (existing ones keep theirs until reopened). |
| `terminal.preserveScrollOnFit` | boolean | `false` | **Preserve scroll on resize** — Keep viewport scroll position anchored when terminal is resized |
| `terminal.waitingBlinkBehavior` | enum | `onlyUnfocused` | **Waiting blink behavior** — When to show the orange blink on idle terminals |
<!-- /settings-table -->

### Chat

<!-- settings-table: Chat -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `chat.compactMode` | boolean | `true` | **Compact mode** — Dense document-style layout instead of chat bubbles. Closer to TUI information density. |
| `artifacts.autoOpenDocs` | boolean | `true` | **Open a new document beside the chat automatically** — When the agent writes a NEW document (.md, .txt, .docx, .pdf…) while the chat is on screen, it opens beside the chat without taking the keyboard — the caret stays where you were typing. Not on a phone. Off = its card in the chat only. An edit never opens it again. The same switch is in the Artifacts chip. |
| `chat.roleIndicator` | enum | `border` | **Role indicator style** — How to visually distinguish user vs assistant messages in compact mode. |
| `chat.showHookCards` | boolean | `true` | **Show hook cards in chat** — Hook events (context injections, plugin hooks, stop nudges) render as collapsible ✓/✗ cards. Turn off to hide them all — applies to open chats instantly. |
| `accessibility.exposeChat` | boolean | `true` | **Expose chat transcripts to assistive technology** — On: assistive tools see the messages near where you are reading — every rendered card farther than two viewports from the visible area is marked aria-hidden, so the browser's accessibility tree stays small however long the conversation grows (nothing visual or keyboard-reachable changes). Off: whole transcripts are marked aria-hidden — turn it off when an assistive tool (an IME, PowerToys, …) still makes Chrome or Edge freeze on large conversations (Chrome serialises the tree on the browser UI thread: 39 s for 27k nodes, measured). |
| `chat.showAssistantNotes` | boolean | `true` | **Show VibeSpace notes to the assistant** — VibeSpace talks to the assistant too: a reminder to update its status before it stops, the list of VibeSpace tools at the start of a session, a short per-turn reminder. Each shows as one grey line ("VibeSpace reminded the assistant to update its status") you can expand to read. Off hides them entirely — the assistant still receives them. Applies to open chats instantly. |
| `chat.showStopHookErrorNotice` | boolean | `false` | **Show the CLI's 'Stop hook error' notice** — The CLI posts a 'Stop hook error occurred' notice whenever a Stop hook blocks — including VibeSpace's own bookkeeping nudge, which is expected, not an error. Off hides that notice (the 'Stop hook feedback' and hook summary cards stay); on shows it as a red immediate notice. Applies to open chats instantly. |
| `chat.hideEmptyHooks` | boolean | `true` | **Hide hooks with no output** — Hooks like PostToolUse fire on every tool call with nothing to show — by default those render no card at all. Turn off to see every hook event. Applies to newly loaded history (reopen the window for existing views). |
| `chat.enterSends` | boolean | `true` | **Enter sends the message** — On a desktop keyboard Enter sends and Shift+Enter inserts a newline. Turn off to make Enter insert a newline and send with Ctrl+Enter (⌘+Enter on a Mac) — while a turn runs, the line under the composer names the send key. Phones and tablets follow “Enter sends on touch devices”. |
| `chat.touchEnterSends` | boolean | `false` | **Enter sends on touch devices** — On phones and tablets the keyboard’s enter key inserts a newline by default (soft keyboards have no Shift+Enter, so this is the only way to type one) and messages are sent with the send button. Turn on to make enter send instead. |
| `chat.hideEmptyThinking` | boolean | `true` | **Hide empty thinking blocks** — Thinking cards with no visible text (redacted or zero-length thinking) are hidden. They never count toward or break run collapsing. Turn off to see every thinking card — applies to open chats instantly. |
| `chat.collapseRuns` | boolean | `true` | **Collapse runs of working cards** — Consecutive working cards (kinds picked below) fold behind a one-line summary, like the Claude Code TUI — click to expand. The summary shows per-kind counts, the touched file names (✎ marks writes, memory/… marks agent-memory files) and a ✗ failure count. Searching expands everything. |
| `chat.collapseKinds` | multiSelect | `["thinking","bash","read","memory","mcp","skill","agent","search","image","note"]` | **Card kinds that collapse** — Which card kinds fold into the summary line, by MEANING — the same setting covers every backend (claude Bash and codex exec are both command runs). Enabled kinds collapse TOGETHER as one interleaved group (think → read → edit → run is the real work pattern; per-kind groups rarely get long enough to fold). Memory = operations on the agent's own memory directory — housekeeping, folded by default and listed as memory/&lt;name> in the summary; project-file writes are off by default — diffs are usually worth seeing. A run of only thinking needs two or more; any tool card folds immediately. Cards waiting for your approval never fold. |
| `chat.foldPeerMessages` | boolean | `true` | **Fold messages from other agents and jobs** — A message another agent, a worker, a group or a background job sent this chat arrives folded to its sender and first line; press Show to read the whole message. A one-line message is never folded. Turn off to show every such message whole. |
| `chat.reducedMotionSpin` | boolean | `false` | **Keep the spinner rotating under reduced motion** — With "reduce motion" enabled in your OS, the working spinner normally swaps its rotation for a gentle opacity pulse. Turn this on to keep the rotation instead (the pulse can read as blinking). |
| `chat.uploadDir` | string | `''` | **Upload files to** — Where files dropped or attached in chat are saved. Empty = the session’s working directory (default). Set an absolute path (e.g. ~/Downloads or /data/uploads) to collect every upload in one place, or a name (e.g. uploads) for a folder under the working directory. For remote sessions the path is on the remote machine. |
| `design.defaultSystem` | string | `''` | **Default design system** — The design system a new design follows when none is named: its tokens.css is copied into the design and the check warns on colours and font sizes outside it. The name of a design system (the Design window's home lists them). Empty = none. |
<!-- /settings-table -->

### Session

<!-- settings-table: Session -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `session.defaultMode` | enum | `chat` | **Default session mode** — Default mode for new sessions and single-click resume from sidebar |
| `session.deadBridgeMinutes` | number | `3` | **Reconnect a silent conversation after (minutes)** — When a conversation has sent VibeSpace nothing for this long while its agent is still working (its output file or its API requests say so), VibeSpace reconnects to its output by itself and shows what it missed as caught up — nothing is re-run. 0 turns this off. |
| `accounts.shipSubscriptionToRemote` | boolean | `false` | **Ship subscription logins to remote hosts** — OFF (recommended): a subscription (Pro/Max) account can only run on THIS machine; for a remote host, log in on the host instead. Turning this ON copies the subscription’s login to the remote host — its token then appears from that host’s IP (often a datacenter), which can look like account abuse to Anthropic and risk a ban. API-key accounts are always allowed on remote hosts and are unaffected by this. |
| `ports.watchNew` | boolean | `true` | **Notify when a machine opens a new port** — VS Code-style port discovery: linked machines (paired devices / connected hosts) are checked every ~30s, and a service that STARTS listening (a dev server, a database) shows a toast offering to forward it. Ports above 32767 and ports already forwarded are ignored. Turn off to stop the background checks. |
| `agentd.publicUrl` | string | `''` | **This instance's public address (for reverse mounts)** — The https/http URL a remote machine uses to reach THIS VibeSpace (reverse mounts, remote agent installs, page share links). Leave blank to let each browser use its own address. The Ports panel's "This VibeSpace" row can map the whole instance to an frp URL, which takes precedence while mapped WITHOUT changing this value. |
| `agentd.autoGraduate` | boolean | `true` | **Move machines to a ws link automatically** — When an SSH machine’s agent is reachable, install it as a service so it dials back over WebSocket — fewer per-command SSH spawns and a link that notices breakage. Only runs when a public URL is set above; SSH always stays as the rescue channel. |
| `agentd.localPipeSessions` | boolean | `false` | **Local sessions via device daemon (R6)** — New local chat sessions run as device-daemon pipe sessions instead of dtach — the session-brain final form (survives server restarts via the daemon). Existing sessions are never migrated; any daemon failure falls back to dtach at spawn. Leave off until the device-assisted consumer path has soaked. |
| `agentd.localDiscovery` | boolean | `false` | **Local session discovery via device daemon** — The 5s session-list sweep reads its filesystem facts (lock files, transcript listing, tail ids) from the device daemon's snapshot — computed in a daemon child process, so a slow or network-mounted home directory can never stall the server. Local enrichment (window mapping, tmux) is unaffected. Falls back to the local scan on any failure. |
| `accounts.onDemandQuotaRefresh` | enum | `manual` | **On-demand quota refresh (model-scoped limits like Fable)** — The passive statusline feed only carries the 5h/7d windows — model-scoped weekly limits (e.g. Fable) can ONLY come from asking Anthropic’s usage endpoint with the account’s own login token. This is the same non-billable call the CLI makes when you run /usage, throttled to ≥60s per account and honoring rate-limit backoff, and it NEVER runs on a timer. It is user-initiated traffic, categorically different from the background polling that has gotten accounts banned — but it is still an off-CLI request with a subscription token, so it is your call: Manual = only when you click ⟳; Auto = also once when you open the quota popup and the data is stale; Off = never (the ⟳ button disappears and scoped limits stay unknown); Auto via the CLI = a background loop spawns `claude -p /usage` (the official binary makes the fetch — this app never calls the endpoint itself) with a BURN-AWARE cadence: refreshes within minutes when the dead-reckoner sees real spending drift, 45min-with-jitter staleness cap for active accounts, and idle accounts are never polled. |
| `usage.dashboard` | json | — | **Usage dashboard panels** — The configurable panel layout of the Usage window ({metric, dim, chart, span, topN} per panel). Managed by the Usage window itself (Panels… menu, per-panel ✎/⋯); edit by hand only if you know what you are doing. |
| `telemetry.enabled` | boolean | `true` | **Local diagnostics (errors + feature usage)** — Records page errors, boot crashes and coarse feature events (window opened, session created — names only, never content) into data/telemetry/ on THIS server. Nothing leaves your instance unless a forward URL is set below. Powers the ⚙ → Diagnostics report. |
| `telemetry.forwardUrl` | text | `''` | **Forward diagnostics to a central collector (URL)** — Optional, for team deployments: POST event batches (with an anonymous per-instance id) to this URL so one maintainer can see errors across all instances. Leave empty to keep everything local. |
| `telemetry.forwardToken` | text | `''` | **Central collector token** — Sent as a Bearer Authorization header with forwarded batches when the collector requires a shared token (a VibeSpace collector always does). Leave empty if none is required. |
| `usage.otelTruth` | boolean | `true` | **Per-request billing truth (local telemetry)** — New LOCAL claude sessions export the CLI’s own OpenTelemetry api_request events to this VibeSpace instance over loopback (never to any external endpoint). Each event names the organization that ACTUALLY billed the request, so the usage ledger, quota estimates and pool decisions stay correct even while a running session still holds a pre-switch token after a pool account switch. Zero extra Anthropic traffic — the CLI pushes locally. Applies to sessions started after the change. |
| `accounts.activeUsagePolling` | boolean | `false` | **⚠ Actively poll subscription usage (automation risk)** — OFF (recommended): usage bars are captured passively from your live terminal sessions — VibeSpace never contacts Anthropic on its own. Turning this ON restores the old behavior: the server calls Anthropic’s usage endpoint on a ~90s timer with each subscription’s token, even for idle accounts. That off-CLI, fixed-cadence, non-human traffic is exactly what can get a Pro/Max account flagged as automated and BANNED — a real account was banned+refunded for this. Only enable it if you accept that risk (e.g. to see live usage for chat-only or idle accounts). |
| `mounts.vfsCacheMaxSizeGB` | number | `10` | **Storage mount cache size (GB)** — Per-mount disk budget for the rclone read/write cache (vfs-cache-mode full). Reads are cached chunk-wise on local disk; writes land locally and upload in the background — the cache survives crashes and resumes uploading on reconnect. Applied when a mount (re)connects. |
<!-- /settings-table -->

### Agent browser

The agent browser — the browser the AGENT drives (named **Agent browser** in the
UI since 2.369.168; the toolbar's globe is the separate **Web view**, an iframe
you drive). The agent reaches it only through `vibespace-browser <verb>`; the
browser engine (`agent-browser`, installed separately) is hidden from the
session PATH, and VibeSpace records, watches and reaps each conversation's own
browser. Turning the first setting off gives every session one shared,
unmanaged browser (a `close --all` is refused there, `shared_browser`).

<!-- settings-table: Agent browser -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `browser.isolateSessions` | boolean | `true` | **Give each session its own agent browser** — ON (default): a session that runs the agent-browser CLI gets its own browser — its own tabs, its own cookies and its own daemon — so two agents stop stealing each other's window and `close --all` can only close the caller's own. Costs four environment variables at spawn and nothing else: no extra VibeSpace process. OFF: sessions fall back to the single shared profile named by ~/.agent-browser/config.json, which is what every agent used before. Applies to sessions started after the change; a running session keeps the browser it has — and one that has none (it started while this was off, or before the feature) gets its own at its next browser command. |
| `browser.idleTimeoutMs` | number | `900000` | **Close an idle agent browser after (ms)** — How long an agent's browser may sit idle before its daemon shuts itself down. Set explicitly because the installed CLI has NO default (and newer ones exempt browsers with a visible window), so nothing else would ever reclaim the browsers this feature creates — one per browsing session instead of one per machine. 0 = never shut down, which is the CLI's own meaning and a real choice; anything unreadable falls back to 15 minutes. |
| `browser.headed` | enum | `''` | **Show the agent browser window** — Whether an agent's browser draws a real window on this machine's desktop. Unset (default): whatever your own ~/.agent-browser/config.json says. A visible window per session is one framebuffer per session and, on the installed CLI, is also exempt from the idle timeout above. |
| `browser.noDisplayMode` | enum | `auto` | **When this machine has no desktop session** — What an agent's browser does when it asks for a window but nobody is logged in to this machine's desktop. A hidden window (default, when Xvfb is installed) is a normal browser on an invisible screen — sign-in pages see an ordinary browser; headless has no screen at all and some sign-in pages refuse it. Either way the pages work and you can watch and take over in the live view. Applies to the next browser that starts. |
| `browser.automationFlag` | boolean | `true` | **Do not announce the agent browser as automated** — ON (default): the agent's browser starts with --disable-blink-features=AutomationControlled, so pages no longer read it as an automated browser (navigator.webdriver is false). It hides that one signal only — a site that still refuses the browser makes the agent propose a switch to CloakBrowser, which you approve. If your own ~/.agent-browser/config.json already names an AutomationControlled value, yours is kept. Applies to the next browser that starts; CloakBrowser is not affected. |
| `browser.idlePaintFreeze` | boolean | `false` | **Stop drawing in a browser nobody watches** — Stop drawing in a browser nobody watches or drives for 30 s (hidden window / headless). The browser is thawed before the next command. |
| `browser.takeoverIdleMs` | number | `600000` | **Hand the browser back to the agent after this long without input (ms)** — When you take over an agent's browser in the live view and then walk away, control goes back to the agent by itself after this many milliseconds without your input, so an abandoned takeover never parks an agent for ever. 0 = never (only an explicit Hand back or closing the live view returns control). Anything under 30 s is raised to 30 s. |
| `browser.humanKeepMs` | number | `43200000` | **Keep your own browsing tab after its window closes (ms)** — When you open a profile's browser yourself (Browse yourself) and close its window without pressing Close, your tab stays open this long so you can continue where you were, and the browser keeps running for it. 12 hours by default. When you joined a browser an agent had started, your tab is kept as long as the takeover time above instead. 0 = keep it until you press Close or the browser stops; anything under 1 minute is raised to 1 minute. |
| `browser.announceIdleHandback` | boolean | `false` | **Announce an idle handback into the conversation (billed turn)** — OFF (default): when your takeover lapses on its own, the agent is told nothing until its next browser command succeeds or you send your next message — no billed turn is opened by a timer. ON: the lapse is announced into the conversation like an explicit Hand back (a turn the agent is billed for), under the same unattended-spend ceiling (Settings → Spending). |
| `browser.cli` | string | `path` | **Browser CLI version** — Which agent-browser VibeSpace drives: "path" = the one on this computer's PATH; "pinned" = the version VibeSpace was tested with, installed by VibeSpace (Agent browser panel → Install the measured version…); or a version number such as 0.39.2, installed the same way. |
| `browser.cloak.executablePath` | string | `''` | **CloakBrowser program file** — The CloakBrowser browser program (its chrome file), for when it was installed some other way. Leave it empty to use the one installed from Manage agents. |
| `browser.cloak.egressAllowlist` | string | `''` | **Sites CloakBrowser may open (hosts, comma-separated)** — The only sites a CloakBrowser browser may reach, through this instance's allowlisting proxy: exact hostnames, or ".example.com" for a domain and every sub-domain. Empty (default): it opens no site at all. Measured: CloakBrowser itself needs no site of its own, so this list is all it can reach — its maker's download and update hosts are refused. Loopback and link-local addresses are never admitted. |
| `browser.actionTrace` | boolean | `true` | **Record the agent's browser actions (before/after screenshots)** — ON (default): every action an agent sends to its browser is kept as a before and an after screenshot with the click point or element box and the command — expandable on the tool card in the transcript, as a timeline in the live view and as a replay of each browser session. A fill's value and a type's text are never stored (only their length). Each profile keeps its records up to the size below; over it, the oldest sessions' screenshots are removed first and every action list stays. A screenshot of a logged-in page is a secret. OFF: nothing is recorded. |
| `browser.traceBytesPerProfile` | number | `1024` | **Browser records kept per profile (MB)** — How much each profile's browser records may take — the before/after screenshots and the list of actions. Over it, the screenshots of the oldest sessions are removed first; the list of what the agent did is always kept. Records are never removed for being old. Default 1024 MB (1 GB), at least 64 MB. |
| `browser.keepConversationBrowser` | boolean | `true` | **Keep each conversation's own browser** — ON (default): when the agent's own browser for a conversation closes — after its turn ends, when it idles out, when you stop it, or when VibeSpace restarts — its logins and its open tabs are kept for that conversation, and its next browser command starts it again with them. They go when the conversation ends, when you press Forget in the Agent browser panel, or when the kept browsers pass the sizes below (the least recently used first). A conversation fenced to allowed domains keeps its tabs only. OFF: each browser starts empty again (for conversations started or resumed from now on). |
| `browser.keptBytesPerConversation` | number | `512` | **Kept browser size per conversation (MB)** — How much one conversation's kept browser may take on disk. Over it, its caches are removed first (the browser rebuilds them); its logins are never removed for this. Default 512 MB, at least 64 MB. |
| `browser.keptBytesTotal` | number | `4096` | **Kept browsers, total (MB)** — How much all kept conversation browsers may take together. Over it, whole kept browsers are removed, the one used longest ago first. A browser that is running is never removed. Default 4096 MB (4 GB), at least 256 MB. |
| `browser.autoBindLiveView` | boolean | `true` | **Open the live view beside the session when its browser starts** — ON (default): when a session attaches a browser profile and its window is open on the desktop you are looking at, the live view opens bound beside it — two panes in one window, so the browser never loses its owner. OFF: open it yourself (session menu → Agent browser — live view) and bind it with "Snap beside" (or group it with the session's window as tabs, then choose "Show side by side"). An ephemeral browser (no profile) is never auto-opened. |
| `browser.fitPageToView` | boolean | `true` | **Lay the agent’s page out at the live view’s size** — ON (default): while a live view is open, the agent’s page takes the size of the view’s pane — the picture fills the pane, and a phone sees the page at phone width. With several views, the one driving decides, else the largest on screen; when nobody has watched for 5 seconds the page goes back to its own size. A size the agent chose itself (set viewport / set device) is never overridden — the view scales it and offers “Fit the page to the window”. OFF: the page keeps its own size and the view scales the picture. |
| `browser.maxRunning` | number | `6` | **Browsers running at once on this machine** — The most agent browsers (desktop apps counted with them) that may run on this machine at the same time: 6 by default, 1 to 32. Several conversations on one profile share its one browser, each in its own window, so they count once. At the ceiling a new browser is refused by name — the agent is told which of its own run and how many others do — and nothing starts until one idles out or you stop one. A change applies to the next browser that starts; nothing running is stopped. The resource guard still only reports a browser that uses too much memory or CPU. |
| `browser.defaultPerConversationCap` | number | `3` | **Browsers one conversation may run at once** — The default number of browsers one conversation (with its helpers) may have running at the same time. Each conversation can change its own from the count in its Agent browser window or in Session Properties, and a Task Group can give its new conversations a different default (a conversation keeps the group default it started with). The machine keeps its own ceiling (Browsers running at once on this machine, six by default), shared with desktop apps. |
| `browser.idleReleaseAfterTurnMs` | number | `180000` | **Release a conversation's browser after its turn ends (ms)** — How long after a turn ends the conversation's own browser (and its helpers' browsers) keep running before they are released. The tab stays in the Agent browser window and the next command starts the browser again. Never while you are driving it or watching it in a live view. Chat sessions only: a terminal session's browser keeps running until its idle timeout. 0 = never release; anything under 30 s is raised to 30 s. |
| `browser.defaultProfile` | string | `''` | **Default browser profile for new sessions** — The id or label of a browser profile (Browser panel / vibespace-browser profiles) that new sessions are pinned to when nothing more specific applies. Empty (default): sessions browse an ephemeral browser and keep no logins. A session's own choice, its conversation's earlier pin and its Task Group's default all outrank this. |
<!-- /settings-table -->

Remote sessions (ssh / paired device) get the session and namespace isolation
and the idle timeout, but keep that machine's own profile directory: the
throwaway-profile half names a local file we validate and a local directory we
sweep, and a per-session directory nothing sweeps is exactly the orphan problem
this feature exists to end.

### Integration

Everything VibeSpace adds *into* your agent sessions lives here — and all of it can be turned off.

<!-- settings-table: Integration -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `agents.vibespaceIntegration` | boolean | `true` | **VibeSpace agent integration (master switch)** — Everything the AGENT can see or use from VibeSpace. ON (default): sessions get the VibeSpace hooks (Task Group context, per-turn reminders, stop nudge) and the vibespace-status/ask/task tools on their PATH. OFF: the model gets a pristine claude/codex — the hook registration is removed from ~/.claude/settings.json and ~/.codex/hooks.json immediately (restored on re-enable, unless you had removed the hook manually in Manage Agents), new sessions spawn with no VibeSpace env or tools, and already-running sessions stop receiving injected context, nudges and task reads. Model-INVISIBLE plumbing keeps working either way: passive usage capture (statusline), billing/account env, the Ctrl+G editor, session persistence and remote transport. Every option below only applies while this is ON. |
| `agents.contextInjection` | boolean | `true` | **Inject Task Group context** — Deliver each session's Task Group context (objective, shared-context folder index, activity log, update diffs) into the agent via hooks. OFF: agents get no group payloads at all — the reporting tools below still work if enabled. The per-group "Inject context" checkbox in the group's detail window is the finer-grained version of this. |
| `agents.toolStatus` | boolean | `true` | **Agent tool: vibespace-status (board state)** — Lets agents self-report working/blocked/needs-input/… onto the session board. OFF: the tool is no longer taught in injected context or reminders, its endpoint refuses with skip-and-continue guidance, and the stop-time bookkeeping nudge (which is keyed on status staleness) never fires. Synthesized states (idle detection) keep working. |
| `agents.toolAsk` | boolean | `true` | **Agent tool: vibespace-ask (the For you tray)** — Lets agents mirror questions/decisions into the For you tray. OFF: not taught, endpoint refuses with skip-and-continue guidance — agents ask only in chat. |
| `agents.toolTask` | boolean | `true` | **Agent tool: vibespace-task (activity log & backlog)** — Lets agents log finished work into the group activity log and park items in the group backlog. OFF: not taught, the progress/backlog write endpoints refuse with skip-and-continue guidance; reading group state (vibespace-task show) still works while context injection is on. |
| `agents.toolJobs` | boolean | `true` | **Agent tool: vibespace-job (background work)** — Lets agents register services, long tasks and cron schedules that outlive their conversation (Background Work window). OFF: not taught, endpoints refuse with skip-and-continue guidance; existing jobs keep running and stay visible to you. |
| `exit.transferMaxBytes` | number | `1024` | **Largest file an agent may pull or push, in MB** — Agents with "Run commands on it" on a paired machine can copy one file at a time between that machine and this one (vibespace-exit pull / push — sha256-checked, shown as a card and in the machine's command list). A bigger file is refused and nothing is copied. Default 1024 MB (1 GB). |
| `agents.stopNudgeStaleMinutes` | number | `10` | **Stop nudge: staleness threshold (minutes)** — The nudge only fires when the session has not updated its board status for this long — and never after a turn that already reported its status or progress (vibespace-status / vibespace-task / vibespace-ask during that turn). Lower = agents are reminded more eagerly; higher = quieter. 0 = always considered stale (with cooldown 0 too, the nudge fires on every stop of a turn that did not report — at most one bookkeeping mini-turn per turn). |
| `agents.stopNudgeCooldownMinutes` | number | `30` | **Stop nudge: cooldown per session (minutes)** — After nudging a session once, wait at least this long before nudging it again — the ceiling on how often an agent pays the bookkeeping mini-turn. 0 = no cooldown. |
| `tasks.backlogNudgeAt` | number | `20` | **Backlog cleanup nudge: items per session** — When one session holds this many open backlog items (claimed or parked by it), its backlog commands and its per-turn backlog note ask it to finish, drop or merge items before parking more. 0 = never. |
| `agents.stopBookkeepingNudge` | boolean | `true` | **Stop-time bookkeeping nudge for agents** — When an agent finishes a turn while its board state is stale (no status update in 10 minutes), it gets one short follow-up asking it to set vibespace-status, mirror open questions with vibespace-ask, and log finished work — then it stops. At most once per 30 minutes per session. Claude enforces this via a blocking Stop hook; Codex via its wrapper at turn end. |
| `agents.injectPreamble` | text | `''` | **Custom agent instructions (injected)** — Your own standing instructions for every agent session, injected at the TOP of the VibeSpace hook context (task context or the baseline tools intro). Delivered once per session and re-delivered when you change it — never on every turn. Edit comfortably in Manage Agents → Agent instructions. Max 4000 chars. |
| `agents.perTurnExtra` | text | `''` | **Per-turn reminder extra (injected EVERY prompt)** — Short custom text placed at the top of the per-turn reminder — reaches the agent on EVERY message you send, so keep it tight (≤500 chars; it costs tokens each turn). Delivers even if the standard tool reminder is turned off. Edit in Manage Agents → Agent instructions. |
| `agents.stopNudgeExtra` | text | `''` | **Stop-nudge extra (injected when the bookkeeping nudge fires)** — Custom text placed at the top of the stop-time bookkeeping nudge (≤500 chars) — e.g. extra end-of-turn duties for your agents. Edit in Manage Agents → Agent instructions. |
| `agents.perTurnToolReminder` | boolean | `true` | **Per-turn tool reminder for agents** — Injects a one-line (~250 byte) reminder of the vibespace tools (status / ask / task) with every prompt you send, so agents keep using them in long sessions — the full rules injected at session start scroll out of the working context over time. Turn off to save the few tokens per turn. |
| `agents.contextUpdateDiffs` | boolean | `true` | **Task Group updates as diffs** — When a Task Group changes mid-session, agents receive only WHAT changed (new activity entries, objective edits, backlog changes, changed shared files) instead of the whole group context again. The full context is still delivered on first contact and after a server restart. Turn off to always re-send the complete state. |
| `agents.allowGroupManagement` | boolean | `false` | **Allow agents to manage Task Groups** — Lets sessions YOU designate as "Group manager" (Session Properties) create and configure Task Groups via their CLI — create/update/bind/unbind, the same organize-only operations you perform in the UI. Paths they may use are limited by the roots setting below; every operation is recorded in the group's activity log. Off = the API refuses all agents. |
| `agents.stopNudgeMaxUnanswered` | number | `3` | **Stop nudge: give up after this many unanswered nudges** — A session that has never reported a board status is being asked for bookkeeping it does not do — and every nudge costs a real mini-turn. After this many nudges with no status report at all, that session is not nudged again (any status report resets the count). 0 = never give up. |
| `agents.groupManagementRoots` | string | `~` | **Group management path roots** — Comma-separated absolute path prefixes a manager agent may use for a group's context folder / auto-include folders (~ = your home). Keeps agents from pointing context injection at arbitrary paths. |
<!-- /settings-table -->

> **Removed 2026-09-07: `agents.opencodeServeAutostart`.** The OpenCode background service (`opencode serve` on 127.0.0.1, which makes STOPPED OpenCode conversations list / open / resume / fork) is now the built-in **OpenCode background service** plugin — ⚙ → Plugins — and it is **off by default**. The first time you use OpenCode, VibeSpace offers to turn it on (once; "Not now" is remembered for the whole instance). `VIBESPACE_OPENCODE_SERVE=0/1` still overrides the plugin as an ops switch and the Plugins panel shows it as "forced by the environment". A stored value for the old setting is ignored — no migration.

> **Removed 2026-10 (B-df40): `agents.vibespaceChannel`, `window.enableBounceOnFocus`, `terminal.preserveCustomTitle`, `sessionCard.detailTruncation`.** The *VibeSpace channel* (2.344.0) registered VibeSpace as a Claude Code channel — the CLI's channels research preview, spawned with `--dangerously-load-development-channels server:vibespace` and a per-session socket under `data/channel-socks/` — and was the first rung of the message delivery ladder when switched on; it was experimental, default off and superseded (it is NOT the Channels feature, which is untouched). The other three rows were never applied by anything (no caller asked for the bounce, nothing set a custom title to preserve, no element read the truncation). The boot migration `2026-10-settings-rows-retired` archives any stored value of these keys (and of the long-graduated `agentd.dataPlane` / `agentd.remoteSessions` / `agentd.sessions`) in `data/migrations.json`'s report, strips them from `data/settings.json` and removes the leftover sockets. The list is `RETIRED_SETTING_KEYS` (src/retired-settings.js); `scripts/test-architecture.mjs` 44d refuses a row or a read of any of them.

### Background Work

One-shot tasks that reached a terminal state are triaged (2026-09-14, docs/design-background-work.md §13): a failure counts as **unacknowledged** until its owner conversation was notified, an owner agent polled it, or you expanded its row — the rail badge counts only awaiting-user + unacknowledged failures. Terminal one-shots are then **archived** into `data/jobs-archive.json` (newest 2000 kept; runs, delivery log and acknowledgement travel with the record; `poll`/`show`/`logs` of an archived id still answer, `vibespace-job list --archived` lists them, the panel's "Archived · N" row opens them on demand).

<!-- settings-table: Background Work -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `agents.jobNotify` | boolean | `true` | **Background jobs: notify the owner conversation** — When a background job finishes, fails, is parked, or needs input, its owner conversation gets a message through Claude Code’s own cross-session messaging inbox (delivered by the CLI under its inbound rules; an idle session starts a turn, billed like a typed prompt). When the conversation is closed, the notification is stashed and injected the next time it resumes. Per-group override in the Task Group detail window; per-job override at creation (--notify on/off). |
| `jobs.archiveDoneAfterHours` | number | `24` | **Archive finished tasks after (hours)** — A one-shot task that finished successfully leaves the Background Work list for the archive this many hours after it ended (its runs, delivery log and acknowledgement are kept; poll/show of the id still answer). 0 = never archive finished tasks. |
| `jobs.archiveFailedAfterDays` | number | `7` | **Archive acknowledged failures after (days)** — A failed, missed, interrupted or unverified one-shot leaves the list this many days after somebody ACKNOWLEDGED it (its owner conversation was notified, an owner agent polled it, or you expanded its row). An unacknowledged failure is never archived. 0 = never archive failures. |
<!-- /settings-table -->

### Channels

A linked Lark or Gmail account is an aggregated IM (2026-09-26, docs/design-communication-panel §5 invariant 6 / §6.2 / §6.5): every conversation in the account's scope is listed and fetched, each on its own refresh time — **hot** (open in a window, or a message in the last hour), **warm** (a message in the last day), **cold** (everything else, at most 15 minutes). A conversation's row menu (Refresh every ▸) overrides its time: 30 s / 1 min / 5 min / 15 min / Paused / Automatic. Every number below applies live, at the next tick. A number typed outside a row's range is kept at its nearest bound and a toast says so (every number setting, since lane R2 verify); a value stored out of range by hand is used clamped and logged once (`[channels] setting … is above its maximum …`).

<!-- settings-table: Channels -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `channels.pushCoalesceSeconds` | number | `60` | **Coalesce pushed messages before waking an agent (seconds)** — Polling batches a minute of messages into ONE wake by nature; a push lane delivers them one by one, so a burst of 30 would become 30 billed turns. While a push lane carries messages, matched hits are gathered for this many seconds and delivered as one wake that lists them all. 0 = wake per message. Poll and scan lanes are already batches and never wait. |
| `channels.pollHotSec` | number | `30` | **Refresh a busy conversation every (seconds)** — A conversation open in a window, or with a message in the last hour, is "hot" and fetched this often. The vendor's own minimum still applies (Gmail: 30 s). Push, when it carries messages, makes polling a slow safety net instead. |
| `channels.pollWarmSec` | number | `300` | **Refresh a recent conversation every (seconds)** — A conversation with a message in the last day ("warm") is fetched this often. |
| `channels.pollColdSec` | number | `900` | **Refresh every other conversation every (seconds, at most 900)** — Every other conversation ("cold") is fetched this often — never less often than every 15 minutes. This is also how often the conversation list itself is re-read and the safety-net cadence while push carries messages. |
| `channels.hotRecentMinutes` | number | `60` | **A conversation is busy for this long after a message (minutes)** — How recent the last message must be for a conversation to count as busy (hot). |
| `channels.warmRecentHours` | number | `24` | **A conversation is recent for this long after a message (hours)** — How recent the last message must be for a conversation to count as recent (warm). |
| `channels.agentRefreshFloorSec` | number | `20` | **An agent may refresh a conversation at most every (seconds)** — "vibespace-channels refresh" is refused, with the wait, when the conversation was fetched less than this long ago — an agent cannot turn itself into a polling loop. Every refresh counts against the account's vendor budget. |
| `channels.agentBudgetSharePct` | number | `25` | **Agent refreshes may use at most (% of an account's vendor budget per minute)** — Every "vibespace-channels refresh" counts against the account's vendor budget. Agents together may spend at most this share of each minute, so the conversations you watch keep their refresh cadence; past it an agent's refresh is refused with the wait. 100 = no separate limit. |
| `channels.historyPageSize` | number | `50` | **Messages per history page** — A new conversation is fetched one page deep; older pages load when you scroll up in its window. Lark serves at most 50 per request. |
| `channels.attachmentBudgetMB` | number | `5120` | **Attachment cache per account (MB)** — Attachments and images are downloaded when you open them and kept per account up to this size; the least recently opened ones are removed first. They are never executed. |
| `channels.reactionsPerMin` | number | `20` | **Reactions: list calls per minute per account** — Reactions are read only for the messages an open window shows, one call per message, at most this many a minute per account (0 = never list — reactions arrive only as live events). Checked before the account's per-minute vendor budget, so reading reactions never takes the budget new messages need. |
| `channels.reactionsTtlMin` | number | `10` | **Reactions: minutes a fetched list stays fresh** — A visible message whose reactions were read within this many minutes is not read again; the chips show the stored count and their tooltip says how old it is. |
| `channels.threadFloorSec` | number | `60` | **Threads: seconds between two loads of one thread** — Opening a thread loads its replies from the vendor (where they are not listed with the conversation — Lark topics); the same thread is loaded again at most this often. |
| `channels.threadRecheckSec` | number | `3600` | **Threads: seconds between two checks of a chat for new threads** — Where thread replies are not listed with the conversation (Lark), a message read before anyone replied to it in a thread is found again by re-reading the newest page of each chat active in the last 14 days this often — one request per chat. Pressing Refresh in a chat checks it at once. |
| `channels.larkNameField` | enum | `department` | **Lark: how people are named** — A person is shown by the nickname your organization gives them, else their name, followed by their department or job title in parentheses when you choose one — the way Lark shows it. Reading profiles needs the sign-in to allow it (the account card says when it does not). A name you set yourself on an author always wins. |
| `channels.slackRelayUrl` | string | `https://problemfactory.github.io/vibespace/slack/` | **Slack: relay page** — The https page Slack sends a member back to after they press Allow, for a workspace app whose Client ID and Secret were typed here (a company preset names its own). The page only returns the browser to a VibeSpace on a private network; anywhere else it shows the code to paste back. Register the same address under the app’s Redirect URLs. Empty = this instance’s own https address, else the code is pasted back. |
| `channels.feedEverySec` | number | `30` | **New-message search: seconds between two searches** — An account that offers a new-message search (Lark) asks it this often which conversations have new messages — one request finds them all, including single chats and thread replies. |
| `channels.feedOverlapSec` | number | `60` | **New-message search: seconds each search re-reads** — Each search also covers the last seconds of the previous one, so a message the vendor indexes late is still found. At least 30. |
| `channels.feedBackfillDays` | number | `7` | **New-message search: days of single chats found at first** — The first search after an account is connected (or re-authorized) also lists the single chats of this many days — as read, waking nobody. 0 = only new ones. |
| `channels.relaxedPollSec` | number | `300` | **Once the search finds everything: seconds between checks of each chat** — When the search has been measured to find every new message (at most 2 % missed over 200), each conversation is still checked on its own at least this often — an open window stays at the fast cadence. If the search starts missing messages, the normal cadence returns by itself. |
| `channels.guardLinksReview` | boolean | `true` | **Outbox: a message with a link always needs your approval** — A proposal whose text carries a link goes to review even on a channel whose policy is "send directly". A guard can only tighten a policy, never relax it. Also switched in the policy row (a conversation's or an account's Reach & policy…). |
| `channels.guardAttachmentsReview` | boolean | `true` | **Outbox: a message with an attachment always needs your approval** — A proposal carrying an attachment goes to review even on a "send directly" channel. Off = an agent with send authority on a "send directly" channel sends files without asking. Also switched in the policy row (a conversation's or an account's Reach & policy…). |
| `channels.guardOffHours` | boolean | `true` | **Outbox: outside working hours every message needs your approval** — Applies once a working-hours time zone is set below. Off = an agent with send authority on a "send directly" channel sends at any hour. Also switched in the policy row (a conversation's or an account's Reach & policy…). |
| `channels.offHoursTz` | string | `''` | **Outbox: working-hours time zone (empty = the off-hours guard is off)** — An IANA zone such as Asia/Shanghai or America/Los_Angeles. Outside working hours every proposal goes to review. Leave empty and nothing is guessed: a wrong zone would silently send everything (or nothing) to review. |
| `channels.offHoursStart` | string | `09:00` | **Outbox: working hours start (HH:MM)** — Only used when the time zone above is set. Mon–Fri. |
| `channels.offHoursEnd` | string | `18:00` | **Outbox: working hours end (HH:MM)** — Only used when the time zone above is set. |
| `channels.senderHonestyLine` | boolean | `false` | **Outbox: append a "drafted by &lt;agent>" line to messages an agent drafted** — OFF (recommended): a message goes out exactly as you approved it. ON: an agent-drafted message ends with one line naming the drafting agent. Your own drafts never get one. Each channel can override this in the Channels panel. Either way the approval card and the receipt say who the recipient will see. |
| `channels.budgetLarkPerMin` | number | `60` | **Lark: requests per minute per account** — Lark allows 1000 requests a minute per API for the whole app across every instance and user that shares it. When an account reaches this budget its refreshes wait for the next minute, and the account card says so. |
| `channels.larkRequestsPerSec` | number | `5` | **Lark: requests per second per account** — Requests are spread evenly: at most this many a second, and never faster than the per-minute budget above allows. Lark allows 50 a second per API for the whole app across every instance and user that shares it. |
| `channels.budgetGmailPerMin` | number | `3000` | **Gmail: quota units per minute per account** — Gmail allows 6000 quota units a minute per user (a thread read costs 40, a change check 2). When an account reaches this budget its refreshes wait for the next minute, and the account card says so. |
| `channels.gmailUnitsPerSec` | number | `40` | **Gmail: quota units per second per account** — Reads are spread evenly: at most this many quota units a second (a thread read costs 40, so 40 = one thread a second), and never faster than the per-minute budget above allows. Google refuses bursts well inside its 6000-a-minute cap; when it does, the account waits a few seconds and the card says so. |
| `channels.budgetSlackPerMin` | number | `40` | **Slack: requests per minute per account** — Slack limits every method on its own (reading a conversation's history: 50 a minute for your own app). This is the account's whole minute across all of them; when an account reaches it, its refreshes wait for the next minute and the account card says so. |
| `channels.slackRequestsPerSec` | number | `2` | **Slack: requests per second per account** — Requests are spread evenly: at most this many a second, and never faster than the per-minute budget above allows. |
<!-- /settings-table -->

The last four rows are the **Per vendor** block at the end of Settings → Channels (B-df40, 2.369.203): each integration declares its own budget and pace rows ONCE in `src/channel-settings.js` — the window's row, the engine's bounds and default, and the adapter's caps all derive from that table, under the same keys as before. They are advanced and show only while an account of that vendor is linked (a search, or a value you changed, still shows them, with the reason). A new integration adds one entry there and nothing else.

The other Channels settings (push coalescing, the outbox guards, off-hours, the sender line) are in Settings → Channels with their own descriptions.

### Spending

Every turn VibeSpace starts **without you** — the auto-continue after a usage limit, the Stop bookkeeping nudge, Background Work notifications, messages from another session, a Codex reset credit — passes ONE authorizer with the ceilings below. Turns *you* type are never counted. The counters are per **credential slot** (the account a turn will actually bill, so nine conversations parked on one subscription share one budget) and they are **persisted** in `data/spend-budget.json`: a release restart no longer hands the automatic spenders a fresh hour. A refusal is journalled and filed in the "For you" inbox, and nothing is lost — a notification that cannot be delivered live is injected into that conversation's next turn instead.

<!-- settings-table: Spending -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `claude.autoResumeOnLimit` | boolean | `false` | **Continue automatically when a usage limit resets** — DEFAULT for new chat sessions on any agent that reports usage limits (Claude, Codex): when the account is out of quota and there is no other account to switch to, wait for the reset — or for the quota to come back early — and then continue the interrupted task by itself. Each session can override this in the chat status bar. Off by default because continuing spends quota without you being there. |
| `spend.unattendedPerIdentityHour` | number | `30` | **Unattended turns per account per hour** — The most turns VibeSpace may start by itself on ONE account in a rolling hour — the auto-continue after a usage limit, the Stop bookkeeping nudge, Background Work notifications and messages from other sessions all count. Turns YOU type are never counted. 0 = no automatic turns at all on any account. When a budget is spent the refusal is journalled and filed in the “For you” inbox; nothing is lost — a notification that cannot be delivered live is injected into the conversation’s next turn instead. |
| `spend.unattendedPerIdentityDay` | number | `200` | **Unattended turns per account per day** — The same ceiling over a rolling 24 hours. An account can be busy for an hour without spending its whole day. |
| `spend.unattendedPerInstanceDay` | number | `800` | **Unattended turns for this instance per day** — The ceiling across every account together, over a rolling 24 hours — the bound that still holds when a new subscription is added mid-incident. |
| `spend.budgetNoticePct` | number | `80` | **Warn when a spending budget reaches (%)** — File one “For you” item when an account (or this instance) has used this share of its unattended-turn budget, so the ceiling is never a surprise. 0 = never warn. |
| `spend.allowOverageTurns` | boolean | `false` | **⚠ Allow unattended turns while an account bills paid overage** — OFF (recommended): while an account reports that it is using PAID OVERAGE, VibeSpace refuses every turn it would have started by itself on that account — a turn nobody asked for is a quota decision when quota is included and a dollar decision when it is not. Turns YOU type always run. Turn this ON only if you want automatic continues to keep going at pay-per-use prices. |
| `pool.reserveFloorPct` | number | `15` | **Keep this much of each account’s weekly quota in reserve (%)** — The account pool drains the member whose weekly window resets soonest, which is right while there is a choice about when to burn quota — measured, it took one account from 60% to 95% of its weekly window in 12.4 hours. Below this floor a member stops being a VOLUNTARY switch target: it still serves its own conversations, and a conversation whose current account is genuinely dead may still escape onto it. 0 = no floor (the pre-2026-09 behaviour). |
| `pool.avoidOverageMembers` | boolean | `false` | **Do not switch conversations onto an account billing paid overage** — While an account is using paid overage its utilization stays under 100% even though every token costs money, so the pool’s “most remaining” ranking actively prefers it. With this on, such a member is not a voluntary switch target (an escape from a dead account still uses it, and it keeps serving its own conversations). Off by default: watch the quota panels for a week first — such an account wears a money icon there. |
<!-- /settings-table -->

### Claude

Since 2.369.123 the Claude / Codex / OpenCode sections are DERIVED from each harness's declared settings table (docs/design-harness-settings.zh.md). Every row shows an *apply chip* under it — "Applies to new sessions · `--brief`", "Read by VibeSpace · pool engine", or "Written into the CLI config" with the target file and key, a fresh receipt for this machine ("✓ written 3 min ago", "⚠ is 30 (wanted 36500) — written again at the next start", "? will be created at the next start — or press Apply" (with a working Apply beside it), "? ~/.claude not found — the CLI has not run on this machine, so nothing is written", "⚠ not valid after a hand edit — not touched") and a "Check machines…" button that reads every registered host. The same chips appear on Manage Agents → Machines.

<!-- settings-table: Claude -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `claude.outputStyle` | enum | `''` | **Default output style (Claude)** — The CLI output style new chat sessions start with. "Concise" makes Claude lead with results and skip preamble. Blank = the CLI's own default. A stream-json session cannot switch style mid-conversation, so a change takes effect on the next resume; the chat status bar sets it per session. |
| `claude.defaultModel` | enum | `''` | **Default model** — Select an alias or choose "Custom..." to type a specific model ID (e.g. claude-opus-4-6-20250414). Applies to NEW sessions: a resumed conversation keeps the model the Claude CLI recorded for it (a transcript names the model that served a turn but never its 1M-context variant, so VibeSpace commands none) — set one for a specific conversation under Session parameters on its card. |
| `claude.defaultPermissionMode` | enum | `''` | **Default permission mode** — Default Claude permission mode for new or resumed Claude sessions. |
| `claude.defaultEffort` | enum | `''` | **Default effort level** — Select a level or choose "Custom..." to type any value (e.g. xhigh). Applies to NEW sessions: nothing Claude writes records the effort a turn ran at, so a resume commands none and the CLI’s own config decides — set one for a specific conversation under Session parameters on its card. |
| `claude.defaultExtraArgs` | text | `''` | **Default extra args** — Extra Claude CLI args appended when starting a Claude session. |
| `claude.disableModelFallback` | boolean | `false` | **Disable model fallback** — When safeguards flag a message, pause the turn instead of automatically switching to another model (the CLI's "Switch models when a message is flagged" set to off). Applies to new sessions at start and to running chat sessions from their next turn; sessions started while enabled also cover their subagents. A stopped turn shows a notice — rephrase and resend to continue. |
| `claude.autoContinueAtUsageLimit` | boolean | `false` | **Let Claude Code continue by itself at a usage limit** — Claude Code's own wait-and-continue at a usage limit (its autoContinueAtUsageLimit setting). Chat sessions never run it — VibeSpace starts Claude Code non-interactively there, and VibeSpace's own auto-resume (with the unattended-spend ceiling and the account pool) is what continues them, when it is on. In terminal sessions it is the only automatic continue: off (the default) means a terminal session stops at the limit, the limit dialog offers the wait as a choice, and nothing continues it by itself; on leaves Claude Code's own setting alone (its default is on), so terminal sessions continue by themselves at the reset — outside the unattended-spend ceiling. Applies to newly started sessions. |
| `claude.allowAgentTools` | boolean | `true` | **Let the agent use VibeSpace's own tools without asking** — VibeSpace's own agent tools — its browser (vibespace-browser), status, task, inbox, messages, desktop windows, channels, manuals, and the list of its published pages — run without a permission card for every step, in every permission mode. Only these tools: any other command still asks, and so does the part of a command line that runs something else. Starting a background shell command (vibespace-job run) still asks, because it can run anything, and publishing a page (vibespace-page publish) asks every time, unless the session runs with full access (Never ask), where it runs as it always did. The trade-off: anything the agent can read, it can type or upload into a web page without asking — except an upload from ~/.claude, ~/.ssh, ~/.vibespace, ~/.codex or VibeSpace's account stores, which the browser tool refuses. The browser tool also writes files (a screenshot, a PDF, a download) only under the project directory, /tmp or ~/Downloads — never over your keys, logins or config. Off = every step asks again. Applies to newly started and resumed sessions; nothing is written to your Claude settings file. |
| `claude.transcriptRetentionDays` | number | `36500` | **Keep Claude Code conversations for (days)** — Claude Code deletes conversation transcripts older than this at every start (its own default is 30 days). VibeSpace writes the value into ~/.claude/settings.json (cleanupPeriodDays) at start-up and whenever it changes, and onto remote hosts when their agent tools are installed. 0 = leave Claude Code's own setting alone. |
| `claude.brief` | boolean | `false` | **Let the agent send you messages and files (--brief)** — Starts new Claude sessions with the CLI's agent-to-user channel enabled: the agent gets the SendUserMessage and SendUserFile tools and VibeSpace renders each call as a highlighted "message for you" card (files are published to a private link in this instance). Off by default because it changes how the agent writes — with --brief, plain text outside the tool is hidden from the message view. Applies to newly started sessions. |
| `claude.systemPromptSnapshot` | enum | `''` | **System prompt snapshot (--system-prompt-snapshot)** — Passes the CLI's --system-prompt-snapshot flag to new Claude sessions: "on" records the system prompt once per conversation and reuses it verbatim on every request and resume, which keeps the prompt cache warm across resumes. Blank = leave the CLI's own default alone. |
| `claude.excludeDynamicSystemPromptSections` | boolean | `false` | **Move per-machine prompt sections into the first message** — Passes --exclude-dynamic-system-prompt-sections: the cwd, environment info, memory paths and git status move out of the system prompt and into the first user message, so the cached prefix is identical across machines and users. Only applies with the default system prompt. Off by default — measure before turning it on. |
| `claude.autocompact` | enum | `''` | **Auto-compact window size (--autocompact)** — Passes --autocompact to new Claude sessions. "auto", or a token budget between 100k and 1M (e.g. 500k, 200000). A smaller window compacts sooner, which keeps each request cheaper at the cost of more compaction. Blank = the CLI decides. A value the CLI would reject is ignored rather than passed on. |
| `claude.tuiRenderer` | enum | `''` | **Terminal TUI renderer** — Renderer for terminal-mode Claude sessions. "Fullscreen" forces the flicker-free alternate-screen renderer with virtualized scrollback (CLAUDE_CODE_NO_FLICKER=1, same as /tui fullscreen); "Classic" forces the main-screen renderer; "Auto" follows the preference saved by the CLI (/tui). Applies to newly started sessions. |
<!-- /settings-table -->

### Codex

<!-- settings-table: Codex -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `codex.outputStyle` | enum | `''` | **Default response style (Codex)** — The personality new Codex chat sessions start with. Blank = leave it to your own ~/.codex/config.toml (this is the default; VibeSpace used to force "pragmatic" on every session). Unlike Claude, a running Codex session CAN be re-styled from the chat status bar — it applies from the next turn. |
| `codex.limitResetCredit` | enum | `off` | **Use stored reset credits on a usage limit (Codex)** — ChatGPT plans can hold rate-limit reset credits. A consumed credit starts a NEW window at once: the limit is full again and the next reset moves one full window from now (Claude's web reset works differently — it refills in place and the weekly reset time does not move; Claude Code offers it only as the interactive /limit-reset). Because a re-opened window is worth most right at the limit, VibeSpace judges a credit worth using as soon as a limit is hit — except the last credit with less than a tenth of a window left. A conversation that is mid-turn or whose prompt cache is still warm tries the credit before switching accounts (a switch re-bills the whole context); a cold one switches first and uses a credit only when no pool member can take it. "Off" (the default) never spends one by itself; "Ask" files one decision in For you per limit; "Auto" spends it for you, within the unattended-spend ceiling. |
| `codex.defaultModel` | enum | `''` | **Default model** — Select a known model or choose "Custom..." to type a specific model ID. Applies to NEW sessions: a resumed conversation keeps its own value (set one for a specific conversation under Session parameters on its card). |
| `codex.defaultPermissionMode` | enum | `''` | **Default permission mode** — Default Codex permission mode for new or resumed Codex sessions. |
| `codex.defaultEffort` | enum | `''` | **Default effort level** — Default Codex reasoning effort for NEW Codex sessions. A resumed conversation keeps the effort its own last turn ran at; set one for a specific conversation under Session parameters on its card. |
| `codex.defaultExtraArgs` | text | `''` | **Default extra args** — Extra Codex CLI args appended when starting a Codex session. |
| `codex.historyPersistence` | enum | `save-all` | **Keep Codex conversations on disk** — Codex records each conversation as a rollout file under ~/.codex/sessions only while [history] persistence is "save-all" (its own default). VibeSpace writes this value into ~/.codex/config.toml (comments and formatting preserved) at start-up and whenever it changes, and onto remote hosts when their agent tools are installed or a session starts there. "None" means Codex writes nothing and this instance shows no history for those sessions. |
<!-- /settings-table -->

### OpenCode

These three shipped without an entry in `SETTINGS_CATEGORIES`, which is the Settings panel's render loop,
so they were never rendered, never searchable and never documented. Fixed 2026-09-09, together with the
same omission that had made every `Spending` row above unreachable; `scripts/test-architecture.mjs` §44
now fails the build if a category ever goes unlisted again.

<!-- settings-table: OpenCode -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `opencode.defaultModel` | enum | `''` | **Default model** — A model id the agent offers (provider/model, e.g. opencode/big-pickle) — the list fills from the agent once a session has started; empty keeps the agent default. Applies to NEW sessions: a resumed conversation keeps the model OpenCode’s own session record names (that needs the OpenCode background service; without it the default applies and the server log says which rung it used). |
| `opencode.defaultPermissionMode` | enum | `''` | **Default permission mode** — Default OpenCode session mode for new sessions: build executes tools per its permission rules, plan disallows edits. |
| `opencode.defaultExtraArgs` | text | `''` | **Default extra args** — Extra OpenCode CLI args appended when starting an OpenCode session. |
<!-- /settings-table -->

### Sidebar

<!-- settings-table: Sidebar -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sidebar.activityRail` | boolean | `true` | **Activity rail (vscode-style)** — A vertical icon rail on the sidebar edge hosting the session panels (Folders / Task Groups / Remote / Ports) plus Agents, Plugins and quick launchers. Turn off to restore the classic tab bar and keep Agents/Plugins as dialogs. |
| `sidebar.railPersistent` | boolean | `true` | **Keep the rail when the sidebar is collapsed** — vscode behavior: collapsing the sidebar leaves the 44px icon rail on screen — click any icon to expand back. Off = collapsing hides everything. |
| `sidebar.defaultTab` | enum | `folders` | **Default sidebar tab** — Which sidebar tab opens on page load |
| `tasks.autoStyleOrder` | enum | `interleaved` | **Task Group auto-style order** — How automatic Task Group styles are sequenced. "All dimensions" cycles lightness bands AND line-style textures from the first groups (maximum visual difference — the 4th group is already dashed); "Solid first" uses 36 solid color slots before any texture (a cleaner look for small setups). Applies live; changing it re-renders existing auto styles. |
| `sidebar.defaultBoardView` | enum | `groups` | **Task Groups tab: default view** — Which sub-view the Task Groups tab shows on page load |
| `sidebar.defaultStatusFilter` | multiSelect | `["live","tmux","external","stopped"]` | **Default status filter** — Which session statuses to show by default |
| `sidebar.enableStatusQuickTabs` | boolean | `false` | **Status quick tabs** — Show quick-filter tabs (ALL/LIVE/STOP/...) below the search bar |
<!-- /settings-table -->

### Session Card

<!-- settings-table: Session Card -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sessionCard.clickBehavior` | enum | `focus` | **Card click behavior** — What happens when clicking a session card: focus/open the window, expand card details, or flash/bounce the window |
| `sessionCard.findMode` | enum | `find` | **Find button mode** — Default behavior for the Find button in session cards |
| `sessionCard.clickToCopy` | boolean | `false` | **Click detail values to copy** — Click on ID, Path, Time, or Tasks values to copy them to clipboard |
| `sessionCard.visibleFields` | multiSelect | `["id","backend","cwd","started","status","groups"]` | **Visible detail fields** — Choose which fields to show in the expanded session card |
<!-- /settings-table -->

### Desktop apps

<!-- settings-table: Desktop apps -->
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `desktop.idleTimeoutMin` | number | `0` | **Desktop app idle timeout (minutes)** — 0 (the default) never stops an app for sitting still. Set minutes to stop a desktop application window that had no input for that long; "Keep running" in a window exempts that app. |
| `desktop.appScale` | enum | `auto` | **Desktop app scale (xpra)** — How large a desktop application draws itself, for sharp text on high-resolution screens. Auto: derived from the screen you launch it from — its pixel ratio × your UI scale (a 2× screen at UI scale 125 % = 2.5×). A fractional scale (1.5×, 2.5×) scales buttons and text alike: the app is drawn at the next whole scale and shown smaller, a little softer than a whole scale. The scale is fixed when the app starts; a window's ⋯ → Scale relaunches it at another one, and its status bar shows the scale and where it came from. |
| `desktop.seamless` | enum | `auto` | **Seamless desktop app windows** — An app that draws its own title bar (GTK header bars, e.g. GNOME Calculator) is shown with NO VibeSpace title bar or status strip: drag its own header bar to move the window. Hover the top edge (or hold Alt) to bring the bars back; the taskbar menu of the window has every control. Paused while an agent drives the app, in a tab group and on a phone. A window's ⋯ → Show window frame overrides this per app. |
| `desktop.backendPrefs` | string | `''` | **Desktop app display backend order** — Comma-separated rung ids that reorder the picture-backend ladder for NEW desktop apps on this instance, e.g. "vnc-display, xpra" to keep the whole-display rung first. Empty = installed order (xpra > vnc-display > desktop-singleton). Unknown ids are ignored; a running app keeps the backend it started with. |
| `window.realDesktopTargets` | boolean | `false` | **⚠ Let agents address windows on your real desktop (tier 3)** — OFF (default): an agent may act only in windows VibeSpace started on its own private displays; your own desktop is never listed. ON: every application on this machine’s accessibility bus becomes a window target an agent can read (its accessibility tree contains the text on your screen) and act in through the actions a node itself declares — including the window you are typing in. Nothing is ever injected on this class (no chords, no point clicks); every such row is marked “your desktop”; you can pause an agent per window (Desktop apps → Agents on your real desktop); turning this OFF drops every such lease at once. |
<!-- /settings-table -->

<!-- settings-reference:end -->

## Storage Details

- Settings are **sparse** — only non-default values are stored
- Server-side: `data/settings.json` with in-memory cache
- Changes broadcast via WebSocket `settings-updated` message
- Settings with `liveApply: true` take effect immediately
- Settings with `liveApply: false` take effect on next page load or component creation

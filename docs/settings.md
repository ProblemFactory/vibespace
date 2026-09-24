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

### Toolbar & Layout

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `toolbar.showLayoutPresets` | boolean | `true` | Show the layout presets bar (built-in + custom grids + add button) |
| `toolbar.showCommandMode` | boolean | `true` | Enable Ctrl+\\ command mode |
| `toolbar.showBrowserButton` | boolean | `true` | Show the Browser button in the toolbar |
| `toolbar.showFileExplorerButton` | boolean | `true` | Show the Files button in the toolbar |
| `toolbar.showTerminalButton` | boolean | `true` | Show the Terminal button in the toolbar |
| `toolbar.showPresetsButton` | boolean | `true` | Show the saved-presets button in the toolbar |
| `sidebar.position` | enum | `left` | Dock the session sidebar to the `left` or `right` edge |
| `taskbar.position` | enum | `bottom` | Dock the taskbar (windows, desktops, usage) to the `bottom` or `top` |
| `taskbar.visibility` | enum | `show` | `show` / `autohide` (slides away, reveals on edge hover) / `hidden` |
| `taskbar.showDesktopPreviews` | boolean | `true` | Show virtual-desktop previews in the taskbar |
| `taskbar.showUsage` | boolean | `true` | Show the 5h/7d usage donuts |
| `taskbar.showWindowCount` | boolean | `true` | Show the "N windows" counter/list |
| `layout.enableDragSnap` | boolean | `true` | Snap windows to grid cells or screen edges when dragging |
| `layout.enableShiftDragSelection` | boolean | `true` | Hold Shift while dragging to select a range of grid cells |
| `layout.shakeBypassSnap` | boolean | `true` | Shake a window vigorously for ~1s while dragging to turn off grid/edge snap for the rest of that drag |
| `layout.shakeBypassSeconds` | number | `1` | How long (0.3–3s) you must keep shaking before grid snap turns off |
| `taskbar.desktopPreviewRatio` | number | `70` | Desktop preview size as % of taskbar height (30-100) |
| `chrome.arrangement` | json | `null` | Which bar hosts each movable element, in what order — written by Customize-mode drag |
| `chrome.zoneAlign` | json | `null` | Per-area alignment: window items left/center (Win11-style), toolbar center left/center/right, tray left/right end — written by Customize-mode chips |
| `chrome.springs` | json | `null` | Per-spring config: flexible with strength weight, or fixed width (px / % of screen) — written by the spring popover |

> Tip: the easiest way to change all of the above is **Customize mode** (⚙ menu → Customize UI…, or right-click empty toolbar/taskbar space → Customize UI…). It's a Firefox-style edit mode: every customizable element gets outlined on the real UI — **click** an element to hide/show it (hidden elements stay dimmed on screen while editing, so nothing disappears), **drag** an element to reorder it or move it to a different bar entirely (toolbar center, toolbar right, or the taskbar tray — e.g. drag the desktop previews and usage meters into the toolbar, then hide the whole taskbar). Segmented pills next to the taskbar/sidebar switch position (Top/Bottom, Left/Right) and taskbar visibility (Show/Auto-hide/Hidden), and mini **alignment chips** appear next to each alignable area: window items left/centered (Windows-11 style), toolbar-center content left/center/right, and the tray at the taskbar's left or right end. **+ Spring** inserts a flexible space (macOS-toolbar style) that pushes its neighbors apart — drag it between two elements for justify-between-style layouts (e.g. previews centered, usage pushed to the right edge). Click a spring to configure it: **Flexible** with a strength weight (two springs at 1× and 3× split leftover space 1:3) or **Fixed** width — in px or **% of screen width**, plus Remove. The **Match…** button enters a pick mode: click any bar element (the "☰ VibeSpace" section, a button, the previews…) to copy its width into the spring; keep clicking to *sum* multiple elements' widths; Done or Escape finishes. That's the one-click way to align an extra row's center with the toolbar's center: spring at the row start → Match → click the ☰ VibeSpace section. Two **extra bar rows** exist below the toolbar and next to the taskbar — invisible until you drag elements into them (e.g. give the layout presets their own full row), auto-hidden again when emptied. Escape or Done exits; Reset restores chrome defaults. A few core anchors (☰ sidebar toggle, the ⚙ gear, the window-item strip) are deliberately not movable; the New Session button is movable but can't be hidden. The right-click menus also keep direct toggles for quick single changes.

### Window

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `window.enableBounceOnFocus` | boolean | `false` | Scale-bounce when focused from sidebar/taskbar |
| `window.tabWrap` | boolean | `false` | Allow tab bar to wrap into multiple rows |
| `window.closeBehavior` | enum | `terminate` | Close window: terminate session, or detach (keep alive for re-attach) |
| `window.activeHighlightIntensity` | enum | `normal` | Focused window highlight: subtle (shadow), normal (accent border), strong (border + glow) |
| `desktop.idleTimeoutMin` | number | `30` | A desktop application window with no input for this long is stopped; `0` = never. "Keep running" in a window exempts that app. Stamped on each app at launch (changing it never touches a running app) |
| `desktop.backendPrefs` | string | *(empty)* | Comma-separated rung ids that reorder the desktop-app picture-backend ladder for NEW apps on this instance, e.g. `vnc-display, xpra` to keep the whole-display rung first. Empty = installed order (`xpra` > `vnc-display` > `desktop-singleton`). Unknown ids are ignored; a running app keeps the backend it started with |

### Terminal

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `terminal.minimumContrastRatio` | number | `1` | Auto-adjust text colors for contrast (4.5 = WCAG AA, 1 = disabled). Auto-set to 4.5 for light backgrounds. |
| `terminal.preserveCustomTitle` | boolean | `false` | Prevent Claude's title updates from overwriting user-set names |
| `terminal.preserveScrollOnFit` | boolean | `false` | Keep scroll position anchored on terminal resize |
| `terminal.webgl` | boolean | `true` | Draw terminals with WebGL. Off ⇒ new terminals use the DOM renderer (the A/B lever for GPU-side freezes; 2.369.137). |
| `accessibility.exposeChat` | boolean | `true` | On ⇒ assistive tools see the messages near where you are reading: every rendered card farther than two viewports from the visible area is aria-hidden (the reader's band — the browser's accessibility tree stays small however long the conversation grows and never grows with paging, gap slabs or search; nothing visual or keyboard-reachable changes; the focused, jumped-to or search-revealed card stays exposed until you scroll away). Off ⇒ whole chat message lists are aria-hidden (the Windows/UIA freeze lever, 2.369.144). Hidden-desktop windows are always aria-hidden. |
| `terminal.waitingBlinkBehavior` | enum | `onlyUnfocused` | When to blink on idle: always, only when unfocused, never |

### Chat

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `chat.compactMode` | boolean | `true` | Dense document-style layout instead of chat bubbles |
| `chat.uploadDir` | string | *(empty)* | Where chat drag-drop/attached files land: empty = session working directory; absolute path (`~/Downloads`, `/data/uploads`) collects all uploads in one place; a bare name (`uploads`) = subfolder under the working directory. Remote sessions resolve it on the remote machine |
| `chat.touchEnterSends` | boolean | `false` | On touch devices, make the keyboard's enter key send instead of inserting a newline (default: newline; send via the ▶ button) |
| `chat.roleIndicator` | enum | `border` | How to distinguish user vs assistant messages: color border, background tint, icon, or text label |

### Session

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `session.defaultMode` | enum | `chat` | Default mode for new sessions and single-click resume: Terminal or Chat |

### Browser

The agent browser (`agent-browser`, installed separately and run by the agent
from its own shell). VibeSpace contributes four environment variables at spawn
and nothing else — no extra process, no daemon. Turning the first one off
restores exactly the pre-2026-09-13 behaviour: one shared profile, one shared
session, and `agent-browser close --all` closing every agent's browser.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `browser.isolateSessions` | boolean | `true` | Give each session its own agent browser — its own tabs, cookies and daemon, ephemeral by default. Applies to sessions started after the change; a running session keeps the environment it was started with. |
| `browser.idleTimeoutMs` | number | `900000` | How long an agent's browser may sit idle before its daemon shuts itself down. Set explicitly because the installed CLI has **no** default and newer ones exempt browsers with a visible window — nothing else reclaims them. `0` = never. |
| `browser.takeoverIdleMs` | number | `600000` | Also the idle window of a takeover on an agent's WINDOW (P9b — the same lease.input, the same rule). When you take over an agent's browser in the live view and walk away, control goes back to the agent by itself after this many ms without your input (an abandoned takeover never parks an agent for ever). `0` = never; anything under 30 s is raised to 30 s. |
| `browser.announceIdleHandback` | boolean | `false` | Applies to a window takeover too (P9b). OFF: an idle handback tells the agent nothing until its next browser command succeeds or your next message (no billed turn is opened by a timer; one "For you" item is filed). ON: the lapse is announced into the conversation like an explicit Hand back — a billed turn under the same unattended-spend ceiling (Settings → Spending). |
| `window.realDesktopTargets` | boolean | `false` | **Tier 3 (P10).** OFF: an agent may act only in windows VibeSpace started on its own private displays; your desktop is never listed. ON (a confirmation dialog is the consent): every application on this machine's accessibility bus becomes a window target an agent can read (the tree contains the text on your screen) and act in through the actions a node itself declares — including the window you are typing in; nothing is ever injected on this class (no chords, no point clicks); rows are marked "your desktop"; pause an agent per window under Desktop apps → Agents on your real desktop; turning it OFF drops every such lease at once. |
| `browser.autoBindLiveView` | boolean | `true` | ON: when a session attaches a browser profile and its window is open on the desktop you are looking at, the live view opens bound beside it — two panes in one window (design §4.6), under one shared window id so a second client never opens a second copy. OFF: open the live view yourself (session menu → Live browser view) and bind it with "Snap beside" (or group it with the session's window as tabs, then use the tab strip's side-by-side button or the window menu's "Show side by side"). No drag ever splits a window. Never on a phone (tabs only there); an ephemeral browser (no profile) is never auto-opened. |
| `browser.headed` | enum | `""` (inherit) | Whether the agent's browser draws a real window on this machine's desktop: *inherit* (whatever your own `~/.agent-browser/config.json` says) / *show the window* / *headless*. Three states on purpose — a checkbox would render "inherit" as "off" and make the first click a decision you never made. One visible window per session is one framebuffer per session, and on the installed CLI it is also exempt from the idle timeout above. |
| `browser.cloak.enabled` | boolean | `false` | OFF: the `cloak` provider is refused by name. ON: once its §7.2.1 egress measurement is recorded on this build, a `cloakserve` container may be started on this machine's loopback (free tier, one session) on an internal docker network whose only way out is the allowlisting egress proxy below. Turning it on downloads and starts nothing — the pinned package is installed by you, after the measurement. |
| `browser.cloak.executablePath` | string | `""` (PATH) | Where the `cloakbrowser` binary is, for switching a profile to the `cloak` backend in place (the same profile directory opened by that binary with the profile's own fingerprint seed). Empty: looked up on PATH. VibeSpace never downloads it — installing it is your act, after the egress measurement is recorded. |
| `browser.cloak.egressAllowlist` | string | `""` | The only hosts a cloakserve container may reach through this instance's allowlisting proxy: exact hostnames, or `.example.com` for a domain and every sub-domain. Empty admits nothing; loopback and link-local targets are never admitted. |

Remote sessions (ssh / paired device) get the session and namespace isolation
and the idle timeout, but keep that machine's own profile directory: the
throwaway-profile half names a local file we validate and a local directory we
sweep, and a per-session directory nothing sweeps is exactly the orphan problem
this feature exists to end.

### Integration

Everything VibeSpace adds *into* your agent sessions lives here — and all of it can be turned off.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `agents.vibespaceIntegration` | boolean | `true` | **Master switch — everything the AGENT can see or use.** OFF = the model gets a pristine claude/codex: hook registration removed from `~/.claude/settings.json` + `~/.codex/hooks.json` immediately (restored on re-enable unless you removed the hook manually in Manage Agents), new sessions spawn with no VibeSpace env/tools, and already-running sessions stop receiving injected context, nudges and task reads. Model-invisible plumbing is exempt and keeps working: passive usage capture (statusline), billing/account env, Ctrl+G editor, session persistence, remote transport. Every option below applies only while this is ON. |
| `agents.stopBookkeepingNudge` | boolean | `true` | Stop-time bookkeeping nudge (one short follow-up when a session ends a turn with stale board state) |
| `agents.stopNudgeStaleMinutes` | number | `10` | Nudge only when the session hasn't updated its status for this long (1-240) |
| `agents.stopNudgeCooldownMinutes` | number | `30` | Minimum gap between nudges per session (2-720) |
| `agents.perTurnToolReminder` | boolean | `true` | One-line vibespace-tools reminder injected with every prompt |
| `agents.contextUpdateDiffs` | boolean | `true` | Mid-session Task Group changes delivered as diffs instead of full re-injection |
| `agents.injectPreamble` | text | `''` | Custom standing instructions injected once per session (≤4000 chars) |
| `agents.perTurnExtra` | text | `''` | Custom text injected with EVERY prompt (≤500 chars) |
| `agents.stopNudgeExtra` | text | `''` | Custom text prepended to the stop nudge (≤500 chars) |
| `agents.stopNudgeMaxUnanswered` | number | `3` | Stop nudging a session that has **never** reported a board status after this many nudges (any status report resets the count). `0` = never give up |
| `agents.allowGroupManagement` | boolean | `false` | Let designated "Group manager" sessions create/configure Task Groups via CLI |
| `agents.groupManagementRoots` | string | `~` | Comma-separated path prefixes manager agents may use for group folders |

> **Removed 2026-09-07: `agents.opencodeServeAutostart`.** The OpenCode background service (`opencode serve` on 127.0.0.1, which makes STOPPED OpenCode conversations list / open / resume / fork) is now the built-in **OpenCode background service** plugin — ⚙ → Plugins — and it is **off by default**. The first time you use OpenCode, VibeSpace offers to turn it on (once; "Not now" is remembered for the whole instance). `VIBESPACE_OPENCODE_SERVE=0/1` still overrides the plugin as an ops switch and the Plugins panel shows it as "forced by the environment". A stored value for the old setting is ignored — no migration.

### Background Work

One-shot tasks that reached a terminal state are triaged (2026-09-14, docs/design-background-work.md §13): a failure counts as **unacknowledged** until its owner conversation was notified, an owner agent polled it, or you expanded its row — the rail badge counts only awaiting-user + unacknowledged failures. Terminal one-shots are then **archived** into `data/jobs-archive.json` (newest 2000 kept; runs, delivery log and acknowledgement travel with the record; `poll`/`show`/`logs` of an archived id still answer, `vibespace-job list --archived` lists them, the panel's "Archived · N" row opens them on demand).

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `jobs.archiveDoneAfterHours` | number | `24` | A successfully finished one-shot leaves the live list this many hours after it ended. `0` = never |
| `jobs.archiveFailedAfterDays` | number | `7` | A failed / missed / interrupted / unverified one-shot leaves the list this many days after somebody **acknowledged** it; an unacknowledged failure is never archived. `0` = never |

### Spending

Every turn VibeSpace starts **without you** — the auto-continue after a usage limit, the Stop bookkeeping nudge, Background Work notifications, messages from another session, a Codex reset credit — passes ONE authorizer with the ceilings below. Turns *you* type are never counted. The counters are per **credential slot** (the account a turn will actually bill, so nine conversations parked on one subscription share one budget) and they are **persisted** in `data/spend-budget.json`: a release restart no longer hands the automatic spenders a fresh hour. A refusal is journalled and filed in the "For you" inbox, and nothing is lost — a notification that cannot be delivered live is injected into that conversation's next turn instead.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `spend.unattendedPerIdentityHour` | number | `12` | Most unattended turns on ONE account in a rolling hour. `0` = no automatic turns at all |
| `spend.unattendedPerIdentityDay` | number | `60` | The same ceiling over a rolling 24 hours |
| `spend.unattendedPerInstanceDay` | number | `200` | The ceiling across every account together — the bound that still holds when a subscription is added mid-incident |
| `spend.budgetNoticePct` | number | `80` | File one "For you" item when a budget reaches this share. `0` = never warn |
| `spend.allowOverageTurns` | boolean | `false` | OFF: while an account reports it is using **paid overage**, every turn VibeSpace would have started by itself on it is refused (with overage on, utilization stays under 100% while every token is billed pay-per-use). Turns you type always run |
| `pool.reserveFloorPct` | number | `15` | Keep this much of each account's **weekly** quota in reserve: below it a member stops being a *voluntary* pool switch target. It still serves its own conversations, and a conversation whose account is genuinely dead may still escape onto it. `0` = no floor |
| `pool.avoidOverageMembers` | boolean | `false` | Also keep the pool from switching conversations *onto* an account billing paid overage (escapes ignore it) |

### Claude

Since 2.369.123 the Claude / Codex / OpenCode sections are DERIVED from each harness's declared settings table (docs/design-harness-settings.zh.md). Every row shows an *apply chip* under it — "Applies to new sessions · `--brief`", "Read by VibeSpace · pool engine", or "Written into the CLI config" with the target file and key, a fresh receipt for this machine ("✓ written 3 min ago", "⚠ is 30 (wanted 36500) — written again at the next start", "? not found — start the CLI once", "⚠ not valid after a hand edit — not touched") and a "Check machines…" button that reads every registered host. The same chips appear on Manage Agents → Machines.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `claude.defaultModel` | combobox | `''` | Default Claude model — dropdown aliases + "Custom..." for specific model IDs (e.g. claude-opus-4-6-20250414). Populated from `/api/available-models` (Claude `/v1/models`). **NEW sessions only (B-6b6d): a resumed conversation keeps its own model** — for claude that is whatever the CLI recorded, because VibeSpace commands nothing (a transcript names the model that served a turn but never its 1M-context variant, so passing the served id back would silently drop `[1m]`); a per-session override (card → Session parameters) still wins. |
| `claude.defaultPermissionMode` | enum | `''` | Default Claude permission mode for new or resumed Claude sessions |
| `claude.defaultEffort` | enum | `''` | Default Claude effort for NEW Claude sessions. Nothing claude writes records the effort a turn ran at, so a resume with no per-session pick commands **no** effort at all and the CLI's own config decides (B-6b6d) |
| `claude.defaultExtraArgs` | text | `''` | Extra Claude CLI args appended when starting a Claude session |
| `claude.disableModelFallback` | boolean | `false` | When safeguards flag a message, pause the turn instead of automatically switching models (CLI `switchModelsOnFlag:false` at spawn + `apply_flag_settings` to running chat sessions; `CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK=1` covers subagents of newly started sessions). A stopped turn shows a notice — rephrase and resend |
| `claude.brief` | boolean | `false` | Start new Claude sessions with the CLI's agent-to-user channel (`--brief`): the agent gets the `SendUserMessage` / `SendUserFile` tools and VibeSpace renders each call as a highlighted "message for you" card (files publish to a private link on this instance). OFF by default because it changes how the agent writes — with `--brief`, plain text outside the tool is hidden from the message view |
| `claude.systemPromptSnapshot` | enum | `''` (CLI default) | `--system-prompt-snapshot on\|off` — record the system prompt once per conversation and reuse it verbatim on every request and resume, which keeps the prompt cache warm across resumes. Blank = leave the CLI's own default alone |
| `claude.excludeDynamicSystemPromptSections` | boolean | `false` | `--exclude-dynamic-system-prompt-sections` — move the per-machine sections (cwd, env info, memory paths, git status) out of the system prompt and into the first user message, so the cached prefix is identical across machines and users. Only applies with the default system prompt |
| `claude.autocompact` | combobox | `''` (CLI default) | `--autocompact auto\|100k–1M` — the auto-compact window size. Compaction is what breaks the cached prefix, so a smaller window trades more compactions for cheaper requests. A value the CLI would reject is dropped rather than passed on |
| `claude.transcriptRetentionDays` | number | `36500` | Written into `~/.claude/settings.json` as `cleanupPeriodDays` (Claude Code's own default sweeps transcripts after 30 days at every start — the conversations VibeSpace's history is made of). Written at start-up and on change, and onto remote hosts at the next agent-tools install or session start. `0` = leave Claude Code's own value alone |
| `claude.tuiRenderer` | enum | `''` (Auto) | TUI renderer for terminal-mode Claude sessions: Auto (CLI `/tui` preference), Fullscreen (flicker-free alt-screen, `CLAUDE_CODE_NO_FLICKER=1`), Classic (main screen) |

### Codex

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `codex.defaultModel` | combobox | `''` | Default Codex model — dropdown + "Custom..." for specific model IDs. Populated from ~/.codex/models_cache.json. **NEW sessions only (B-6b6d): a resumed thread keeps its own model**, read back from the rollout’s last `turn_context`; a per-session override (card → Session parameters) still wins. |
| `codex.defaultPermissionMode` | enum | `''` | Default Codex permission mode for new or resumed Codex sessions |
| `codex.defaultEffort` | enum | `''` | Default Codex reasoning effort for NEW Codex sessions — a resumed thread keeps the effort its own last `turn_context` ran at (B-6b6d) |
| `codex.defaultExtraArgs` | text | `''` | Extra Codex CLI args appended when starting a Codex session |
| `codex.historyPersistence` | enum | `save-all` | Written into `~/.codex/config.toml` as `[history] persistence` (comments and formatting preserved; verified against codex-cli 0.154.0). `save-all` keeps every conversation (rollout) on disk — the codex analogue of Claude's retention; `none` makes Codex write no rollouts, so this instance shows no history for those sessions; `''` = leave config.toml alone. A config.toml the writer cannot read safely (inline table, array of tables, multi-line string, a root scalar named `history`, dotted `history.*` keys plus a `[history]` header) is refused by name and never overwritten; a symlinked config.toml (dotfiles) is written through and stays a symlink, its mode is kept; a value outside the listed options is never written — the default applies and the server log names it |

### OpenCode

These three shipped without an entry in `SETTINGS_CATEGORIES`, which is the Settings panel's render loop,
so they were never rendered, never searchable and never documented. Fixed 2026-09-09, together with the
same omission that had made every `Spending` row above unreachable; `scripts/test-architecture.mjs` §44
now fails the build if a category ever goes unlisted again.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `opencode.defaultModel` | combobox | `''` | A model id the agent offers (`provider/model`); the list fills from the agent once a session has started, empty keeps the agent default. NEW sessions only — a resumed conversation keeps the model OpenCode's own session record names (that needs the OpenCode background service; without it the default applies and the server log says which rung it used) |
| `opencode.defaultPermissionMode` | enum | `''` | Default OpenCode session mode for new sessions: `build` executes tools per its permission rules, `plan` disallows edits |
| `opencode.defaultExtraArgs` | text | `''` | Extra OpenCode CLI args appended when starting an OpenCode session |

### Sidebar

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sidebar.activityRail` | boolean | `true` | vscode-style vertical icon rail (Folders/Task Groups/Remote/Ports panels + Agents/Plugins + launchers); off = classic tab bar + modal dialogs |
| `sidebar.railPersistent` | boolean | `true` | Collapsing the sidebar keeps the 44px rail strip on screen (vscode-style); click any icon to expand back |
| `sidebar.defaultStatusFilter` | multiSelect | live, tmux, external, stopped | Which statuses to show by default (excludes archived) |
| `sidebar.enableStatusQuickTabs` | boolean | `false` | Show ALL/LIVE/TMUX/EXT/STOP/ARCH quick-filter tabs |
| `sidebar.defaultTab` | enum | `folders` | Which sidebar tab opens on page load (folders / tasks / mounts) |
| `tasks.autoStyleOrder` | enum | `interleaved` | Auto Task-Group style sequencing: `interleaved` cycles lightness bands + line-style textures from the first groups (max difference, 4th group already dashed); `solid-first` uses 36 solid slots before any texture (cleaner for small setups). Live; reaches the server allocator so manual-pick masking matches |
| `sidebar.defaultBoardView` | enum | `groups` | Which Task Groups sub-view opens on load (groups / tasks) |

### Session Card

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sessionCard.clickBehavior` | enum | `focus` | Card click: focus window, expand details, flash window, or goto (switch desktop + flash) |
| `sessionCard.findMode` | enum | `find` | Find button default: find (flash in place) or goto (switch desktop + flash) |
| `sessionCard.clickToCopy` | boolean | `false` | Click detail values (ID, path, time) to copy to clipboard |
| `sessionCard.visibleFields` | multiSelect | all fields | Which fields to show in expanded card details |
| `sessionCard.detailTruncation` | enum | `left` | Truncate long values from left (show filename) or right (show path start) |

## Storage Details

- Settings are **sparse** — only non-default values are stored
- Server-side: `data/settings.json` with in-memory cache
- Changes broadcast via WebSocket `settings-updated` message
- Settings with `liveApply: true` take effect immediately
- Settings with `liveApply: false` take effect on next page load or component creation

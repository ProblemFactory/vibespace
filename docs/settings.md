# Settings

## Overview

The settings system has three layers:

1. **Global settings** (toolbar ⚙) — Quick access to theme, font size, font family
2. **Per-terminal settings** (window ⚙) — Override theme/font/size per terminal window
3. **Full settings UI** — VS Code-style dialog with all options, including backend-specific Claude/Codex launch defaults, accessible via "All Settings" link

Settings are stored server-side (sparse storage — only non-default values persisted) and sync across all connected clients via WebSocket.

## Opening Settings

- **Toolbar ⚙** → Quick popover with theme, font size (A-/A+), font family, and "All Settings" link
- **"All Settings"** → Full settings dialog with category navigation and search
- **Per-terminal ⚙** → Gear icon on each terminal window's title bar

## Global Settings (Quick Access)

The toolbar gear opens a popover with:

| Control | Description |
|---------|-------------|
| Theme dropdown | Switch between 6 themes |
| A- / A+ buttons | Decrease / increase terminal font size |
| Font family dropdown | Select terminal font (web fonts + system fonts) |

Changes apply immediately to all terminals that don't have per-terminal overrides.

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
| `taskbar.desktopPreviewRatio` | number | `70` | Desktop preview size as % of taskbar height (30-100) |
| `chrome.arrangement` | json | `null` | Which bar hosts each movable element, in what order — written by Customize-mode drag |

> Tip: the easiest way to change all of the above is **Customize mode** (⚙ menu → Customize UI…, or right-click empty toolbar/taskbar space → Customize UI…). It's a Firefox-style edit mode: every customizable element gets outlined on the real UI — **click** an element to hide/show it (hidden elements stay dimmed on screen while editing, so nothing disappears), **drag** an element to reorder it or move it to a different bar entirely (toolbar center, toolbar right, or the taskbar tray — e.g. drag the desktop previews and usage meters into the toolbar, then hide the whole taskbar). Segmented pills next to the taskbar/sidebar switch position (Top/Bottom, Left/Right) and taskbar visibility (Show/Auto-hide/Hidden). Escape or Done exits; Reset restores chrome defaults. A few core anchors (☰ sidebar toggle, the ⚙ gear, the window-item strip) are deliberately not movable; the New Session button is movable but can't be hidden. The right-click menus also keep direct toggles for quick single changes.

### Window

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `window.enableSnapAnimation` | boolean | `true` | Animate window snap transitions |
| `window.enableBounceOnFocus` | boolean | `false` | Scale-bounce when focused from sidebar/taskbar |
| `window.tabWrap` | boolean | `false` | Allow tab bar to wrap into multiple rows |
| `window.closeBehavior` | enum | `terminate` | Close window: terminate session, or detach (keep alive for re-attach) |
| `window.activeHighlightIntensity` | enum | `normal` | Focused window highlight: subtle (shadow), normal (accent border), strong (border + glow) |

### Terminal

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `terminal.minimumContrastRatio` | number | `1` | Auto-adjust text colors for contrast (4.5 = WCAG AA, 1 = disabled). Auto-set to 4.5 for light backgrounds. |
| `terminal.preserveCustomTitle` | boolean | `false` | Prevent Claude's title updates from overwriting user-set names |
| `terminal.preserveScrollOnFit` | boolean | `false` | Keep scroll position anchored on terminal resize |
| `terminal.waitingBlinkBehavior` | enum | `onlyUnfocused` | When to blink on idle: always, only when unfocused, never |

### Chat

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `chat.compactMode` | boolean | `true` | Dense document-style layout instead of chat bubbles |
| `chat.roleIndicator` | enum | `border` | How to distinguish user vs assistant messages: color border, background tint, icon, or text label |

### Session

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `session.defaultMode` | enum | `chat` | Default mode for new sessions and single-click resume: Terminal or Chat |

### Claude

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `claude.defaultModel` | combobox | `''` | Default Claude model — dropdown aliases + "Custom..." for specific model IDs (e.g. claude-opus-4-6-20250414). Populated from bootstrap API. |
| `claude.defaultPermissionMode` | enum | `''` | Default Claude permission mode for new or resumed Claude sessions |
| `claude.defaultEffort` | enum | `''` | Default Claude effort for new or resumed Claude sessions |
| `claude.defaultExtraArgs` | text | `''` | Extra Claude CLI args appended when starting a Claude session |
| `claude.tuiRenderer` | enum | `''` (Auto) | TUI renderer for terminal-mode Claude sessions: Auto (CLI `/tui` preference), Fullscreen (flicker-free alt-screen, `CLAUDE_CODE_NO_FLICKER=1`), Classic (main screen) |

### Codex

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `codex.defaultModel` | combobox | `''` | Default Codex model — dropdown + "Custom..." for specific model IDs. Populated from ~/.codex/models_cache.json. |
| `codex.defaultPermissionMode` | enum | `''` | Default Codex permission mode for new or resumed Codex sessions |
| `codex.defaultEffort` | enum | `''` | Default Codex reasoning effort for new or resumed Codex sessions |
| `codex.defaultExtraArgs` | text | `''` | Extra Codex CLI args appended when starting a Codex session |

### Sidebar

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sidebar.defaultStatusFilter` | multiSelect | live, tmux, external, stopped | Which statuses to show by default (excludes archived) |
| `sidebar.enableStatusQuickTabs` | boolean | `false` | Show ALL/LIVE/TMUX/EXT/STOP/ARCH quick-filter tabs |

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

# Keyboard Shortcuts

## Terminal Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+G** | Open external editor (split-pane CodeMirror) |
| **Ctrl+V** | Paste text or image from clipboard |
| **Ctrl+C** | Copy selection to clipboard (sends SIGINT if no selection) |
| *(phone key row)* **Copy screen** | Copy the visible terminal text — the touch stand-in for drag-select + Ctrl+C; the row also carries Esc / Tab / ⇧Tab / sticky Ctrl / arrows / paste / ^C ^G ^R ^Z ^D ^\ |

## Chat Mode Shortcuts

| Shortcut | Action |
|----------|--------|
| **Enter** | Send message (normal mode) |
| **Ctrl+Enter** | Send message (expanded input mode) |
| **Shift+Enter** | Insert newline |
| **Ctrl+F** | Open search bar *(phone: the magnifier chip at the left of the status bar — live windows only, like the key)* |
| **Enter** (in search) | Next search result |
| **Shift+Enter** (in search) | Previous search result |
| **Escape** (in search) | Close search bar |
| **/** | Show slash command autocomplete |
| **Tab** / **Enter** (in autocomplete) | Accept selected slash command |
| **Arrow Up/Down** (in autocomplete) | Navigate slash command list |
| **Ctrl+V** | Paste image as attachment |
| **Alt+Enter** | *(while a turn is running, harnesses that support steering)* Send **now** — inject into the running turn instead of queueing it |

### Sending while a turn is running

`Enter` always sends. What the agent does with a message sent **during** a turn
depends on the harness, and the composer says so in a one-line hint under the
box while the turn runs:

| Harness | `Enter` | `Alt+Enter` | Hint shown |
|---------|---------|-------------|------------|
| Codex | queued — runs after this turn | **injects it into the running turn** (the agent sees it at its next reply) | `Enter queues · Alt+Enter injects now` |
| OpenCode (ACP) | queued — runs after this turn | *(nothing special — plain send)* | `Enter queues` |
| Claude Code | the CLI holds it; no queue state is published | *(nothing special — plain send)* | none |
| Terminal | n/a | n/a | none |

The chord is gated on the harness's capability row (`inputModes.steer`) **and**
on the running wrapper advertising the queue — never on a backend name — so it
is simply not a chord where it could not work, and `Ctrl/Cmd+Enter` keeps
meaning "send" everywhere. It is a contributed command (`chat.steerNow`), so a
plugin can rebind it or run it.

**Touch / ≤768px:** no chords — a bolt button appears beside **Send** while a
turn runs on a steer-capable session and does the same thing.

**If the turn ends first,** the message simply runs next — immediately, which
is what "now" asked for — and the window says nothing. It only tells you the
injection did not happen when *that* turn was still running and the agent never
picked the message up.

## Virtual Desktop Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+Alt+Left** | Switch to previous desktop |
| **Ctrl+Alt+Right** | Switch to next desktop |

## Command Mode

Press **Ctrl+\\** to enter command mode. A yellow **[CMD]** indicator appears in the taskbar.

Command mode auto-exits after **2 seconds** or on **Escape**. All commands are single keystrokes.

### Window Commands

| Key | Action |
|-----|--------|
| **←** | Snap window to left half |
| **→** | Snap window to right half |
| **↑** | Snap window to top half |
| **↓** | Snap window to bottom half |
| **1-9** | Snap to grid cell N |
| **10+** | Digits accumulate for 500ms (e.g., press `1` then `2` for cell 12) |
| **m** | Maximize / restore window |
| **w** | Close window |
| **Tab** | Cycle to next window (stays in command mode) |
| **]** | Move active window to next desktop |
| **[** | Move active window to previous desktop |
| **v** | Side by side on / off for the active window's tab group (the active tab on the left, the most recently used other tab on the right; 5 s Undo toast). Not in a group of ≥ 2 tabs ⇒ a toast "Group two windows first" |
| **V** | Swap the left and right panes of a side-by-side group |
| **{** / **}** | Move the active tab one place left / right in its tab group (in side-by-side mode: within its own half). Stays in command mode, so it can move several places |

### Global Commands

| Key | Action |
|-----|--------|
| **f** | Switch to freeform mode (no grid) |
| **g** | Prompt for grid dimensions (e.g., "3x3") |
| **n** | Open new session dialog |
| **s** | Toggle sidebar |
| **b** | Open embedded browser |
| **e** | Open file explorer |
| **d** | Switch to next desktop |
| **D** | Switch to previous desktop |

## Drag Modifiers

| Modifier | Action |
|----------|--------|
| **Alt + drag** | Bypass grid snap (free positioning) |
| **Drag + Shift** | Hold Shift while dragging to select rectangular cell range |

> **Note**: For Shift cell selection, start dragging first, then press and hold Shift. The selection activates mid-drag.

## Window Title Bar

| Action | Result |
|--------|--------|
| **Double-click** title bar | (reserved) |
| **Right-click** title bar | Window menu (Switch window ▸, Move, Minimize, **Show side by side ▸ Beside {name} (on the right)** in a tab group of ≥ 2 / **Unsplit** + **Swap left and right** when split, session verbs, Move to Desktop, Close) |
| **Right-click** a tab | That tab's own window menu |
| Click the **side-by-side button** (two-column icon, tab strip) | Tab group: show the active tab and the last one you used side by side. Split: Unsplit / Swap left and right |
| **Drag a tab sideways** | Reorder it in the tab bar (a marker shows where it lands; **Esc** cancels). In side-by-side mode, dragging it across the middle moves it to the other side. Drag a tab **down** to pull it out as its own window |
| **Ctrl+Shift+PageUp / PageDown** | Move the active tab one place left / right in its tab group (in side-by-side mode: within its own half). Only inside a tab group; in a regular browser tab the browser may keep this chord for itself ("move tab") — command mode `{` / `}` always works |
| Click **─** | Minimize window |
| Click **□** | Maximize / restore |
| Click **✕** | Close window |
| Click **⧉/□** indicator | Show overlapping windows list |

## Sidebar

| Action | Result |
|--------|--------|
| **Double-click** session name | Rename session |
| **Drag** session card | Drop on group header to assign |
| **Click** ▸ arrow | Expand/collapse session details |
| **Click** ★ | Toggle star |
| **Click** 📦 | Toggle archive |
| **Right-click** group header | Context menu (Rename, Linked folders, Delete) |

## File Explorer

| Action | Result |
|--------|--------|
| **Double-click** folder | Navigate into folder |
| **Double-click** file | Open in appropriate viewer |
| **Right-click** item | Context menu (Open, Edit, Delete, Sessions, Add to group) |
| **Drag** file to terminal | Type shell-escaped path |
| **Drag** folder to group header | Link folder to group |
| **Drag** file/folder to bookmarks | Add bookmark |
| **Tab** in path bar | Autocomplete directory |

## Editor Shortcuts

| Shortcut | Action |
|----------|--------|
| **Shift+Alt+F** | Format document (Prettier for JS/TS/JSON/HTML/CSS/MD/YAML/GraphQL; server-side for Python/Go/Rust/Shell) |
| **Ctrl+S** | Save file |

## PPTX Viewer Shortcuts

| Shortcut | Action |
|----------|--------|
| **Arrow Left** / **Arrow Up** | Previous slide |
| **Arrow Right** / **Arrow Down** | Next slide |

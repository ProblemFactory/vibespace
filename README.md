# VibeSpace

A web workspace for **coding agents**. Run, manage, and switch between many concurrent agent CLI sessions from one browser — with a tiling window manager, a structured chat view, a file explorer, and a code editor.

VibeSpace is **backend-agnostic**: it drives any coding-agent / agent-harness CLI through a small adapter interface. [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [Codex](https://github.com/openai/codex) are supported out of the box; adding another harness is a matter of writing one adapter (see [Backends](#backends)).

![License](https://img.shields.io/badge/license-MIT-blue)

## Why

Coding agents run in the terminal, one session at a time, and their state is trapped in whatever shell you launched them from. VibeSpace turns that into a persistent, multi-session workspace:

- **Many agents at once** — tile, tab, and group dozens of sessions across virtual desktops, each one a different agent, repo, or task.
- **Survives everything** — sessions run inside `dtach`, so they outlive server restarts, dropped SSH connections, and closed browser tabs. Reopen the page and everything is exactly where you left it.
- **Two ways to view a session** — a full TUI terminal, or a structured **chat view** with rendered markdown, tool/diff visualization, and inline permission prompts. Switch per session.
- **One UI, any backend** — the same window manager, chat view, search, and session management work identically whether the underlying agent is Claude Code, Codex, or something you wire up yourself.

## Backends

A backend is any coding-agent CLI, wrapped by a `BackendAdapter` (`src/adapters/`). The adapter owns the launch flags, the streaming/JSON protocol, permission/approval mapping, and session discovery for that tool — everything above it (window manager, chat UI, search, layout sync, file explorer) is shared and backend-neutral.

| Backend | CLI | Status |
|---------|-----|--------|
| **Claude Code** | `claude` | First-class — terminal + chat, permission prompts, subagents, goals |
| **Codex** | `codex` | First-class — terminal + chat (app-server JSON-RPC), approvals, plan/TODO, goals |
| *Your own* | any | Add an adapter in `src/adapters/` + register it in `src/adapters/index.js` |

You only need to install the CLI(s) for the backend(s) you actually use — at least one.

## Features

### Dual-Mode Sessions
- **Terminal mode** — full TUI via xterm.js with dtach persistence (survives server restarts)
- **Chat mode** — structured message view with markdown rendering, tool visualization, and interactive permissions
- Default mode configurable per-user; split button on resume to choose Terminal or Chat — per backend

### Chat Mode
- **Normalized message system** — a per-backend normalizer converts raw agent output (stream-json, JSON-RPC, …) into normalized messages with stable IDs, merged tool calls, and streaming text edits. The `BackendAdapter` interface keeps this pluggable.
- **Tool visualization** — Edit diffs (flex layout, wrap toggle), Read/Write with syntax highlighting (30 languages via highlight.js) + line numbers + searchable language picker
- **Interactive permissions** — Allow / Always Allow / Deny inline on tool cards (maps to each backend's native permission/approval protocol)
- **Subagent support** — Agent tool cards show live status; View Log opens a read-only ChatView via per-subagent normalizers
- **Goals** — set a session objective the agent auto-continues toward (native goal loop on backends that support it)
- **Team deployment** — optional password auth, Docker/compose with random first-boot password; fully rearrangeable chrome via a Firefox-style **Customize mode** (show/hide + drag elements between bars, springs, alignment, extra rows — see [docs/customize-ui.md](docs/customize-ui.md))
- **Remote hosts & shared storage** (shipped) — run sessions on registered ssh hosts, browse/edit their files ([docs/files-cross-host.md](docs/files-cross-host.md)), and mount shared storage (S3/Drive/WebDAV/SFTP/VibeSpace↔VibeSpace, [docs/mounts.md](docs/mounts.md)). Longer-term per-user-account collaboration remains a design sketch in [docs/design-collaboration.md](docs/design-collaboration.md)
- **Fork** — branch a chat into an independent session (with an editable title); fork the whole session or from any past assistant message (truncated to that point), then continue from a first message
- **Search** — Ctrl+F with the CSS Custom Highlight API, match counter, prev/next across full history; seek-loads the middle of huge sessions on demand
- **Whole-conversation minimap** — semantic, time-coordinate scrollbar covering the entire session (not just the loaded window); drag/click to jump anywhere, lazily seeking into multi-hundred-MB histories
- **Status bar** — model, context %, cache ratio, cost, permission mode (clickable), background tasks (clickable popup)
- **Virtual scroll** — sliding DOM window (~150 max), auto-trim, deferred live messages when viewing history
- **View-only mode** — open stopped sessions as read-only (📋 View History); auto-converts on session terminate
- **Draft persistence** — chat input auto-saved to the server, synced across clients (Telegram-style)
- **Interrupt** — dual mechanism (protocol request + delayed SIGINT fallback) for reliability
- **TODO display** — live task tracking above the input area, restored from wrapper metadata
- **Reconnect sync** — auto re-attach, StateSync resync for drafts/settings

### Terminal Mode
- **Multi-session terminals** with dtach persistence (survive server restarts)
- **Pin-to-bottom** — scroll up freezes output; scroll back or click the arrow to resume
- **Idle detection** — the window title bar + taskbar blink when the agent finishes and waits for input
- **Clipboard image paste** — Ctrl+V images from the clipboard directly into the agent's TUI
- **Ctrl+G external editor** — split-pane CodeMirror integration without screen clearing

### Window Manager
- **Tiling window manager** with drag/resize, grid snap, edge snap, custom grid presets, command mode (Ctrl+\\)
- **Virtual desktops** — multiple independent workspaces with per-desktop grid; Ubuntu-style miniature previews in the taskbar showing live window positions; drag windows between desktops; waiting windows blink across desktops
- **Tab groups** — drag window icons together to merge into Chrome-style tab groups; drag a tab out to split
- **Snap memory** — snapping saves the original size; dragging out of snap restores it
- **Overlap switcher** — right-click a title bar to switch between overlapping windows
- **Resizable taskbar** — drag the top edge (36–120px); all elements scale proportionally; synced across clients
- **Move mode** — window attaches to the cursor, click to place (taskbar context menu or command mode)
- **Proportional tracking** — windows keep relative positions on workspace resize
- **Multi-client layout sync** — workspace state broadcast to all clients; smart diff syncs positions, open/close, navigation; openSpec pattern for window-creation sync

### Sessions
- **Session discovery** — auto-detects running agent sessions across backends (Live / Tmux / External / Stopped)
- **Session groups** — Folders | Groups dual tab, folder linking, drag sessions/folders into groups
- **Session management** — star/archive, rename, status filters, quick tabs, click behavior (focus/expand/flash/goto)
- **Per-session config** — override model / reasoning effort / permission mode per session, persisted across clients
- **Session cards** — ID mid-truncation, CWD left-truncation, click-to-copy, backend + mode composite icons
- **Multi-device sync** — share sessions across browsers, auto-resize to the smallest real client

### File Management
- **File explorer** with list/icon views, drag-to-terminal, upload/download, bookmarks
- **File viewers** — PDF, images (zoom + pan), video, audio, CSV, Excel, Word, PowerPoint, hex
- **Code editor** (CodeMirror 6) — syntax highlighting, markdown/HTML preview, server-side format, jump to line from `:line` paths
- **Clickable paths & links** — in chat messages and tool cards; click to copy, Ctrl+click (or tap → menu on touch) to open; supports `:line`, `:line:col`, `:line-line` suffixes

### Mobile & Touch
- Responsive layout with a dedicated mobile nav, two-level folder/group sidebar, and edge-swipe gestures
- Long-press = right-click — every context menu works on touch
- Horizontally scrollable code blocks and tables

### General
- **Embedded browser** with URL bar and a node-unblocker proxy mode for iframe-restricted sites
- **6 color themes** (Dark, Light, Dracula, Nord, Solarized, Monokai) + a custom theme editor (~50 CSS vars + 16 ANSI colors, live preview)
- **Settings system** — VS Code-style UI, per-terminal overrides, per-backend launch defaults (model/effort/permission)
- **Multilingual UI** — English / 中文 / 日本語, per-device choice (⚙ → Language), English fallback for anything untranslated
- **Presets** — save/restore full workspace state (windows, positions, grid, theme, fonts)
- **Usage monitoring** — per-backend rate-limit pie charts (e.g. 5h / 7d) in the taskbar, click for details
- **WebSocket auto-reconnect** — re-attaches all active sessions on connection recovery

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/ProblemFactory/vibespace/master/install.sh | bash
```

The installer will:
1. Check for Node.js 18+, dtach, and at least one agent CLI (`claude` and/or `codex`); it auto-installs dtach if needed
2. Prompt for an install location (default: `~/vibespace`)
3. Clone the repo, install dependencies, and build

> **Updating from "Claude Code WebUI"?** The project was renamed to VibeSpace — migration is seamless. Re-running the installer detects a pre-rename install at `~/claude-code-webui` and updates it in place, preserving all sessions, layouts and settings. A manual `git pull` in an existing clone also keeps working — nothing is keyed to the old name. See [CHANGELOG](CHANGELOG.md) for details.

### Prerequisites

| Dependency | macOS | Ubuntu/Debian | Fedora/RHEL |
|-----------|-------|---------------|-------------|
| **Node.js 18+** | `brew install node` | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo bash - && sudo apt install -y nodejs` | `sudo dnf install nodejs` |
| **dtach** | `brew install dtach` | `sudo apt install dtach` | `sudo dnf install dtach` |
| **An agent CLI** (≥1) | — | — | — |
| &nbsp;&nbsp;• Claude Code | `npm install -g @anthropic-ai/claude-code` | same | same |
| &nbsp;&nbsp;• Codex | install `codex`, ensure it's on `PATH` | same | same |

After installing a backend CLI for the first time, run it once (`claude` / `codex`) to complete login/setup.

## Usage

```bash
cd ~/vibespace
npm start
```

Open `http://localhost:3456` in your browser.

### Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3456` | Server port |
| `HOST` | `0.0.0.0` | Bind address. Use `127.0.0.1` for local-only access |
| `CLAUDE_CMD` | `claude` | Path to the Claude Code CLI binary |
| `CODEX_CMD` | `codex` | Path to the Codex CLI binary |

Example: `PORT=8080 HOST=127.0.0.1 npm start`

### Updating

Re-run the install command, or:
```bash
cd ~/vibespace
git pull
npm install
npm run build
```

## How It Works

```
Terminal mode:
  Browser (xterm.js) <-> WebSocket <-> node-pty (dtach) <-> pty-wrapper.js <-> agent CLI
                                                                  |
                                                            buffer file (persistent)

Chat mode:
  Browser (ChatView) <-> WebSocket <-> node-pty (dtach) <-> chat-wrapper.js <-> agent CLI (stream-json / JSON-RPC)
                                                                  |
                                                            buffer file (JSON lines)
```

- **dtach** provides PTY detach/attach with zero rendering overhead (unlike tmux/screen)
- **pty-wrapper.js** (terminal) and the per-backend **chat wrapper** (chat) run inside dtach and capture output to buffer files
- Both wrappers survive server restarts — dtach keeps them alive independently of the server
- The **server** manages sessions, broadcasts I/O to all connected clients, and routes each session through its backend adapter
- The **client** is vanilla JS with xterm.js (terminal), ChatView (chat), CodeMirror 6 (editor), and a custom window manager
- A **`BackendAdapter`** per backend (`src/adapters/`) encapsulates launch flags, the streaming protocol, permission mapping, and session discovery — so the UI never special-cases a specific agent

## Adding a Backend

1. Create `src/adapters/<your-tool>.js` extending `BackendAdapter` (`src/adapters/base.js`): launch args, chat wrapper, permission/approval formatting, session discovery.
2. Register it in `src/adapters/index.js` via `createAdapterRegistry`.
3. If chat mode needs protocol normalization, add a message manager (mirroring `message-manager.js` / `codex-message-manager.js`) and wire it in `src/normalizers.js`.

Everything else — windows, chat UI, search, minimap, layout sync, file explorer — works unchanged.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+G | Open external editor (split-pane CodeMirror) |
| Ctrl+V | Paste text or images from the clipboard |
| Ctrl+C | Copy selection (SIGINT if no selection) |
| Ctrl+\ | Enter command mode (tmux-style prefix) |
| CMD → ←/→/↑/↓ | Snap window to half screen |
| CMD → 1-9+ | Snap to grid cell N (digits accumulate for 500ms) |
| CMD → m / w / Tab | Maximize / Close / Cycle next window |
| CMD → f/g/n/s/b/e | Freeform / Grid / New session / Sidebar / Browser / Files |
| CMD → d/D | Switch to next / previous desktop |
| CMD → ]/[ | Move active window to next / previous desktop |
| Ctrl+Alt+←/→ | Switch desktop (non-command-mode) |
| Drag + Shift | Hold Shift while dragging title bar to select a rectangular cell range |
| Alt+drag | Bypass grid snap |
| Right-click title bar | Switch between overlapping windows |

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Linux | Full support | Primary development platform |
| macOS | Full support | Requires Homebrew for dtach. If node-pty fails: `npm rebuild node-pty --build-from-source` |
| WSL2 | Should work | Install dtach via apt |
| Windows (native) | Not supported | Requires WSL2 or a remote Linux server |

## Documentation

See the **[docs/](docs/)** directory for detailed guides:

- [Getting Started](docs/getting-started.md) — Installation, first run, quick tour
- [Chat Mode](docs/chat-mode.md) — Structured messages, tool visualization, permissions, search, subagents
- [Terminal Management](docs/terminal.md) — Persistence, multi-device, clipboard, fonts
- [Window Manager](docs/window-manager.md) — Grid, snap, command mode, presets, virtual desktops, tab groups
- [Session Management](docs/sessions.md) — Discovery, groups, star/archive, drag-drop, filters
- [File Explorer](docs/file-explorer.md) — Browsing, bookmarks, viewers, code editor
- [External Editor](docs/editor.md) — Ctrl+G split-pane CodeMirror integration
- [Customize UI](docs/customize-ui.md) — Edit mode for the chrome: show/hide, drag, springs, alignment, extra rows
- [Embedded Browser](docs/browser.md) — Iframe browser with proxy mode
- [Settings](docs/settings.md) — All configuration options
- [Keyboard Shortcuts](docs/keyboard-shortcuts.md) — Complete reference

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

MIT

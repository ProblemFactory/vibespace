# Documentation

VibeSpace is a backend-agnostic web workspace for **coding agents** — it drives any agent CLI through a `BackendAdapter`, with Claude Code and Codex supported out of the box. These guides are written backend-neutral; where a detail is specific to a backend it's called out inline.

## Guides

- **[Getting Started](getting-started.md)** — Installation, first run, quick tour
- **[Chat Mode](chat-mode.md)** — Structured Claude/Codex messages, tool visualization, permissions, search, subagents
- **[Terminal Management](terminal.md)** — Claude/Codex terminal sessions, persistence, multi-device sync, clipboard paste, idle detection, fonts
- **[Window Manager](window-manager.md)** — Grid layouts, snap, command mode, presets, virtual desktops, tab groups
- **[Session Management](sessions.md)** — Claude/Codex discovery, groups, star/archive, drag-drop, filters, dual-mode resume
- **[File Explorer](file-explorer.md)** — Browsing, bookmarks, viewers, code editor, clickable paths
- **[External Editor](editor.md)** — Ctrl+G split-pane CodeMirror integration
- **[Embedded Browser](browser.md)** — Iframe browser with proxy mode
- **[Customize UI](customize-ui.md)** — Edit mode for the chrome: show/hide, drag between bars, springs, alignment, extra rows
- **[Settings](settings.md)** — Global/per-terminal/chat settings plus Claude and Codex launch defaults
- **[Deployment](deployment.md)** — Password authentication, Docker/compose, team server setup

## Reference

- **[Keyboard Shortcuts](keyboard-shortcuts.md)** — Complete shortcut and drag modifier reference

## Architecture

See [CLAUDE.md](../CLAUDE.md) in the project root for:
- Data flow diagrams
- File structure and code location map
- Design decisions and lessons learned
- API reference (REST + WebSocket)
- Bug fix history

- **[Collaboration Design](design-collaboration.md)** — Remote sessions, multi-host gateway, shared storage, session migration (roadmap)
- **[Codex Support Plan](codex-support-plan.md)** — Research notes, parity gaps, and phased integration plan for first-class Codex support

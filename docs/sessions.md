# Session Management

## Session Discovery

The sidebar automatically discovers all Claude Code sessions on your machine using a **lock-first algorithm**:

1. Scans Claude Code lock files (`~/.claude/sessions/*.json`)
2. Filters to alive PIDs, verifies the process is actually `claude`
3. Checks if the process runs inside tmux (attachable) or another terminal
4. Matches each lock to its most recent JSONL file by project directory
5. All unmatched JONLs become STOPPED sessions

### Session Statuses

| Status | Badge | Description | Click action |
|--------|-------|-------------|-------------|
| **LIVE** | Green | WebUI-managed (dtach) | Focus existing window |
| **TMUX** | Blue | Running in external tmux | View session (closing won't kill it) |
| **EXTERNAL** | Gray | Running in unknown terminal | Not clickable |
| **STOPPED** | Dim | Not running | Resume via `claude --resume` |

## Sidebar Views

The sidebar has two tabs:

### Folder bulk operations

Right-click (or long-press) a folder header for folder-level actions:

- **Archive N stopped sessions** — archive every stopped, non-archived session in the folder at once (one toast confirms the count). The go-to move for folders full of auto-generated sessions.
- **New session here** / **Copy path**

Folders with more than 100 sessions and nothing live start **collapsed** so they don't dominate the sidebar; expanding one (or jumping to a session inside it) is remembered.

### Folders tab
Sessions grouped by working directory. Each folder header shows:
- Session count
- Green dot if any session is live
- **+** button to create a new session in that directory
- **🔗** button to link the folder to a task (auto-include)

### Tasks tab
The task board — tasks tag sessions across directories and carry an optional goal, status, and attention. See [Tasks](#tasks) below.

## Session Modes

Each session runs in one of two modes:

- **Terminal** -- full TUI rendered via xterm.js (the classic Claude Code experience)
- **Chat** -- structured message view with markdown, tool visualization, and permissions (see [Chat Mode](chat-mode.md))

Chat sessions display a speech bubble icon next to their status badge in the sidebar.

### Default mode

Configure the default mode for new sessions and single-click resume via Settings > Session Card > **Default session mode**. The default is Chat.

### Choosing mode on resume

When resuming a stopped session, the resume button uses your default mode. A split button next to it lets you explicitly choose Terminal or Chat. The mode you last used for a session is persisted.

### Per-session parameters

A gear button (⚙) next to the Resume button opens a config popover where you can override **Model**, **Effort**, and **Permission Mode** for that specific resume. Each option has a checkbox — unchecked means "use global default" (greyed out), checked means the override is active. Changing a dropdown while unchecked auto-checks it. All three fields support "Custom..." for typing arbitrary values (model IDs like `claude-opus-4-7`, effort levels like `xhigh`, etc.).

### Mobile sidebar

On mobile (≤768px), the sidebar uses a **two-level navigation** instead of the desktop's collapsible folder groups:

- **Level 1**: folder or group list — each entry shows a folder/group icon, path (middle-truncated), session count, and live count. Tap to drill in.
- **Level 2**: session cards inside one folder/group, with a back button at top. Only this folder's sessions are rendered (~5-20 cards instead of 1600+).

The mobile nav bar provides: ☰ sidebar toggle, session title (tap for window switcher with desktop tabs), ✕ close window, + new session. Image upload button appears next to the chat input on mobile.

## Forking

Forking branches a chat session into a **new, independent session** that shares the conversation history up to the fork point. The original is left untouched, so you can explore an alternative direction without losing your place.

### Fork a whole session

The **Fork** button in a session card's expanded panel opens a popup with:

- **Title** — pre-filled with `<name> (forked)`, editable, so you can fork straight into the title you want. The title sticks to the forked window and its sidebar card (it won't fall back to a first-message-derived name after the fork stops or you reload).
- **First message** — sending it is what makes the branch actually **diverge**. The agent only mints the fork's new session id on its first turn, so until you send something a freshly-forked window is indistinguishable from a plain resume.

### Fork from a specific message

Inside a chat, every assistant message has a small **fork** icon (next to "open in editor") on hover. It branches a new session containing the conversation **up to and including that message**, then continues from your first message — handy for "go back to that decision point and try something else." (Claude only; the forked window's history is truncated to match.)

## Session Cards

Each session appears as a compact card showing: name, status badge, mode icon (for chat), and expand arrow.

### Card click behavior

Configurable via Settings > Session Card > **Card click behavior**:

| Mode | Click action | How to expand | How to open/resume |
|------|-------------|---------------|-------------------|
| **Focus** (default) | Opens/focuses the session window | ▸ arrow button | Click itself |
| **Expand** | Expands/collapses card details | Click itself | Buttons in detail panel |
| **Flash** | Flashes/bounces the session window | ▸ arrow button | Buttons in detail panel |

### Session card display

Session card details use smart truncation for readability:
- **Session ID** -- mid-truncated (first and last characters visible, middle replaced with ellipsis)
- **Working directory** -- left-truncated (shows the end of the path, which is most informative)
- **Click-to-copy** -- when enabled (Settings > Session Card > **Click to copy**), clicking the session ID or CWD copies it to the clipboard

### Expanded card details

Click the ▸ arrow to expand any card. The detail panel shows:
- Session ID, working directory, start time, status
- Tasks membership
- Action buttons: Rename, Find, Attach/Resume, Terminate (red, with confirmation)

Configure visible fields via Settings > Session Card > **Visible detail fields**.
Configure truncation direction via Settings > Session Card > **Detail truncation**.

### Star and archive

- **★** — Star a session to pin it to the top of its group (in sidebar and taskbar)
- **📦** — Archive a session to hide it from the default view

Archived sessions are only visible when "Archived" is included in the status filter.

### Rename

Double-click a session name in the sidebar to rename it. The custom name:
- Displays in the sidebar, window title bar, and taskbar
- Is used as `--name` when resuming the session
- Syncs to all connected clients via WebSocket

### Find / GoTo

The expanded detail panel has a split button that toggles between **Find** and **GoTo** modes (click the ▾ arrow to switch):

- **Find** — flashes the window title bar, taskbar item, and desktop preview rect (cyan, 3 seconds). If the window is on another desktop, only the preview rect flashes.
- **GoTo** — switches to the window's desktop, focuses and flashes it. For tab group windows, switches to the correct tab first.

The mode is persisted via settings (`sessionCard.findMode`) and synced across clients.

### Move (recover off-screen windows)

Next to Find/GoTo, the **Move** button starts window Move mode from the sidebar: the window detaches and follows your cursor — click to place it. This is the recovery path when a window was accidentally dragged off-screen and its title bar can't be grabbed anymore. It switches to the window's desktop first and resolves tab groups to the host window. (Desktop only — Move mode needs a pointer.)

## Status Filters

The filter button (top of sidebar) opens a multi-select dropdown:
- **Live**, **Tmux**, **External**, **Stopped**, **Archived**
- Default: all except Archived

### Quick tabs

Enable via Settings > Sidebar > **Status quick tabs** to show one-click filter tabs below the search bar: ALL / LIVE / TMUX / EXT / STOP / ARCH.

## Tasks

A **task** is a durable unit of work above individual sessions: it tags sessions across directories and can carry a goal, status, plan, and progress. Tasks are a superset of the old Groups — your existing groups were migrated automatically (they behave exactly as before; use **Convert to task** to give one a goal and lifecycle).

### The board (Tasks tab)

Each task renders as a collapsible section: status chip (`active` / `paused` / `blocked` / `done`, colored), title, linked-folder count, live dot, a **⚠ attention badge** when a bound agent is waiting for your input (from the same idle detection that blinks window titles), session count, a details button, and ▶ resume-all. Order: tasks needing attention first, then working tasks, then plain groups, done last. Sessions not in any task appear under **Untagged**.

### Creating a task

Click **"+ New Task"** on the board (opens the detail window), or "+ New task" at the bottom of any task checklist popover.

### Tagging sessions (many-to-many)

- **Session card**: expand a card → **Tasks ▾** → check/uncheck tasks
- **Drag session**: drop a session card on a task header
- **Folder auto-include**: sessions whose working directory is under a linked folder join automatically (see below)

### Auto-include folders

Link folders to a task so every session under them (including subdirectories) joins automatically:

- **Folders tab**: 🔗 button on a folder header → check tasks
- **File explorer**: right-click a folder → "Add to task"
- **Drag a folder** from the file explorer onto a task header
- **Detail window**: "+ Link folder path" with autocomplete

Manage: right-click a task header → **Linked folders**, or the detail window (auto-included sessions show a dim "via folder" tag).

### Task detail window

The details button (or context menu → Details…) opens a per-task window: title, status dropdown, **objective** (shared definition of the goal), **plan** checklist, **progress** log (timestamped notes), bound sessions (with unbind), auto-include folders, **context folder** (the task's shared context directory — will be injected into bound sessions' context in an upcoming release), and a board color. Everything saves immediately and syncs to all clients.

### Task header actions

- **▶** — Resume/attach all sessions in the task
- **Details button** — open the detail window
- **Right-click** — Details… / Rename / Status ▸ / Convert to task / Linked folders / Delete
- **Drop target** — drag sessions or folders onto the header

### Attention

When a bound session's agent finishes and waits for input (the window-title blink), the task's header shows a blinking **⚠ N** and the Tasks tab itself gets a ⚠ — a board-level "which of my agents need me" view. VibeSpace only observes and surfaces; it never acts on the agent.

### Multi-client sync

Tasks live server-side in `data/tasks.json` and broadcast to all connected clients (`tasks-updated`); star/archive/name state stays in `data/user-state.json`. Changes made on one device appear instantly on all others.

### Archiving whole projects

"Archive project" in the Recent zone archives every session under that folder **and remembers the folder** — sessions created there later start archived too (previously new sessions popped back unarchived). The same button unarchives the whole project when viewing archived sessions; unarchiving a single session dissolves the folder rule (that session stays visible, the rest remain archived).

## Recent & History on a remote host

When remote hosts are registered (Remote tab), the **Recent** zone header gains a host selector. Switching it from Local to a host runs live session discovery on that machine over ssh (`~/.claude` lock files + project JSONLs, same lock-first algorithm as local, 15-second cache) and lists that host's sessions grouped by project — the switcher scopes BOTH zones: Recent shows the host's last 7 days, History its older sessions — stopped ones are click-to-resume **on that host**, running ones show a REMOTE badge (external terminal, not attachable). The refresh button re-scans; the choice persists per browser. Local recent listing is untouched while a host is selected, and there is no background ssh polling — discovery only runs while you're looking at it.

Remote sessions are first-class in the list: cards show the real session name (from the first user message), star/archive, the expand panel, **View History**, and **Resume** — identical to local cards. History works because the server pulls the session's JSONL over ssh into a local cache (`data/remote-jsonl/<host>/`, invalidated by remote size+mtime — one ssh stat when fresh) the first time you view or resume it; scroll-back pagination, search, and the minimap then operate on the cache like any local transcript. A resumed remote session shows its full pre-resume history in the chat window.

The Recent and History zones have **independent** host switchers, and remote cards/headers carry an inner **host color strip** next to the project strip (no inner strip = local) so mixed-machine lists separate visually.

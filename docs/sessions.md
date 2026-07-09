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

The sidebar has three tabs:

- **Folders** — sessions grouped by working directory (below).
- **Task Groups** — the Task Group board (岗位; see [Task Groups](#task-groups)).
- **Remote** — registered ssh hosts (machines) and storage mounts. See [Remote hosts / files](files-cross-host.md) and [Mounts](mounts.md).

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
- **🔗** button to link the folder to a Task Group (auto-include)

### Task Groups tab
The Task Group board. Two sub-views (**Groups | Tasks**):
- **Groups** — each Task Group with its member sessions grouped under it.
- **Tasks** — a flat list of every session (活儿), sorted by urgency/status; sessions tagged into ≥1 group sort to the top, untagged ones sink to the bottom. A "+ New session in a Task Group…" card at the top opens a group picker → the pre-filled New Session dialog; right-clicking a card's group color bar opens that group's full action menu.

See [Task Groups](#task-groups) below.

## Session Modes

Each session runs in one of two modes:

- **Terminal** -- full TUI rendered via xterm.js (the classic Claude Code experience)
- **Chat** -- structured message view with markdown, tool visualization, and permissions (see [Chat Mode](chat-mode.md))

Chat sessions display a speech bubble icon next to their status badge in the sidebar.

### Default mode

Configure the default mode for new sessions and single-click resume via Settings > Session > **Default session mode**. The default is Chat.

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
- Task Group membership
- Action buttons: Rename, Find, Attach/Resume, Terminate (red, with confirmation)

Right-clicking a card (or long-pressing on touch) opens a full quick-action context menu, and **Properties** (also on that menu) opens a dedicated window with the session's full identity, state history timeline, billing identity, config overrides, Task-Group toggles, and the agent's own step list — so you don't have to expand the card for everything.

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

## Task Groups

A **Task Group** (岗位) is a durable *role* that tags sessions across directories — it groups the sessions (活儿) working toward it and carries a shared **objective**, a **Checklist** (backlog of work items), an **Activity log** (timestamped notes), auto-include folders, a shared **context folder**, and a board color. A Task Group has **no status of its own** — it's a persistent role, so the only lifecycle flag is **archived**. Work status lives on the *sessions* (see [Session status](#session-status-agent-set-user-overridable)). Task Groups are a superset of the old Groups — your existing groups were migrated automatically; use **Convert to task** to give one an objective, checklist and activity log.

> Naming note: the code and older internals still say "task" in wire names (`/api/tasks*`, the `tasks-updated` event, JSON fields `plan`/`progress`, CLI subcommands `plan-check`/`plan-add`/`progress`). The user-facing concept is **Task Group**.

### The board (Task Groups tab)

Each Task Group renders as a collapsible section: title, an **archived** chip if archived, linked-folder count, live dot, a **⚠ attention badge** when a member agent is waiting for your input (from the same idle detection that blinks window titles), session count, a details button, and ▶ resume-all. Order: groups needing attention first, then the rest, archived last. Sessions not in any group appear under **Untagged**. The tab also has a **Groups | Tasks** sub-view toggle (see [Task Groups tab](#task-groups-tab)).

### Creating a Task Group

Click **"+ New Task Group"** on the board (opens the detail window), or "+ New task" at the bottom of any Task-Group checklist popover.

### New session in a Task Group

The **+** button on a group header (or right-click → "New session in this task…") opens the normal New Session dialog **pre-filled**: the group pre-selected in the **Task** dropdown and the working directory set to the group's first auto-include folder — you confirm every parameter as usual. With a group selected, the quick-fill chips under the Working Directory input **pin the group's folders first** (marked with the group's color dot) — and for folders with subfolders included, nested folders that already contain sessions are suggested too (e.g. group folder `/a` plus sessions at `/a/too` ⇒ chips for both `/a` and `/a/too`, session-count in the tooltip). The Task dropdown is also available when creating a session from anywhere else. The created session is tagged to the group automatically; membership is otherwise **live-derived** server-side (there is no `VIBESPACE_TASK_ID` env — a fresh session records `_initialGroupId` only to cover the window before the tag lands).

### Tagging sessions (many-to-many)

A session belongs to 0..N Task Groups, resolved live from: an explicit tag ∪ a linked-folder match ∪ the group it was spawned into. Change any of these and the agent picks it up on its next turn — no respawn.

- **Session card**: expand a card → **Task Groups ▾** → check/uncheck groups (or the right-click menu → Task Groups submenu)
- **Drag session**: drop a session card on a group header
- **Folder auto-include**: sessions whose working directory is under a linked folder join automatically (see below)

### Auto-include folders

Link folders to a Task Group so every session under them (including subdirectories, per a per-folder recursive toggle) joins automatically:

- **Folders tab**: 🔗 button on a folder header → check groups
- **File explorer**: right-click a folder → "Add to task"
- **Drag a folder** from the file explorer onto a group header
- **Detail window**: "+ Link folder path" with autocomplete

Manage: right-click a group header → **Linked folders**, or the detail window (auto-included sessions show a dim "via folder" tag).

### Task Group detail window

The details button (or context menu → Details…) opens a per-group window: title, **objective**, **Checklist** (the group's backlog — tick items as they're done), **Activity log** (timestamped notes), bound sessions (with unbind), auto-include folders (each with a recursive toggle), **context folder** + an **Inject this group's context into its sessions** toggle, and a board color. Everything saves immediately and syncs to all clients. Editing color/toggles no longer scrolls the window back to the top.

The detail window can also **export** the group to a committable markdown file (**Export**), and the board's **Import…** card reads such a file back in — so a Task Group can live in a repo and travel between VibeSpace instances.

### Task Group header actions

- **▶** — Resume/attach all sessions in the group
- **Details button** — open the detail window
- **Right-click** — Details… / Rename / Convert to task / Linked folders / Delete
- **Drop target** — drag sessions or folders onto the header

### Attention

When a member session's agent finishes and waits for input (the window-title blink), or declares itself **blocked** via session status (below), the group's header shows a blinking **⚠ N** and the Task Groups tab itself gets a ⚠ — a board-level "which of my agents need me" view. VibeSpace only observes and surfaces; it never acts on the agent.

## Task context injection

A session that **belongs to a Task Group** begins each turn with the group's context in the agent's head: the group state (objective, checklist, recent activity), an index of the files in the context folder (the agent reads what it needs with its own tools), and the working rules. The injected guidance frames the context folder as the group's **shared memory between agents** — not a place to publish deliverables for the user — and tells agents to proactively write up knowledge other sessions of the group will need (conventions, gotchas, decisions, cross-role details — e.g. a dev session documenting technical specifics a compliance session depends on), to never modify `<contextDir>/.vibespace/` (generated; `TASK.md` there always mirrors the group state), and to report session state with `vibespace-status`. Injection covers **every** group a session belongs to and re-fires when the group's content changes; a per-group **Inject context** toggle can opt a group out while keeping membership/board/`vibespace-task` working. A session in **no** group still gets a one-time baseline intro teaching the `vibespace-status` tool.

It is delivered **only through the harness's own hooks / native mechanisms** — VibeSpace never rewrites your message to smuggle it in. `vibespace-hook.mjs` is registered automatically for the `SessionStart` and `UserPromptSubmit` events (a true no-op only *outside* a VibeSpace session, i.e. when the `VIBESPACE_API`/token env is absent).

- **Claude** sessions (terminal and chat, local and on remote hosts, and again on every resume) receive the context via the hook.
- **Codex** chat sessions also receive it: Codex's app-server runs the hook but ignores its output, so the Codex wrapper injects the same context natively via `thread/inject_items` (a `role:'developer'` message) before each turn.

For **remote** sessions, VibeSpace distributes the hook and the task tools to `~/.vibespace/bin` on the remote host and opens an ssh reverse tunnel so they reach back to VibeSpace; a group's context folder is also live-synced to the remote and injected with path translation — so a remote Claude session gets the same task context as a local one.

The hook is installed automatically when the server starts. To check or repair it, open **⚙ → Manage agents…** — the "VibeSpace integration" row shows the status for both CLIs with one-click Install / Remove.

Agents can also **report back** with the `vibespace-task` command (the injected context teaches them): `vibespace-task progress "what I did"` adds a timestamped entry to the Activity log, `plan-check 2` ticks a checklist item, `plan-add "new step"` extends the checklist. Commands are scoped server-side to the session's own group membership via its per-session token — if the session belongs to several groups it passes `--group <id>` (validated to be one it belongs to). There is **no** `vibespace-task status` subcommand: a Task Group has no status; a session reports its *own* state with `vibespace-status <working|needs-input|blocked|review|done>`.

VibeSpace also maintains `<contextDir>/.vibespace/TASK.md` — a generated, always-current markdown mirror of the group state that agents and humans can read from disk.

## Session status (agent-set, user-overridable)

Every session can carry a **status indicator**: a state (`working` / `needs-input` / `blocked` / `review` / `done`), an urgency (`low` / `normal` / `high` / `urgent`), and an optional reason. It renders as a colored chip on the session card (urgency adds `!` / `!!`; urgent pulses), and blocked sessions feed their Task Groups' ⚠ badges. Urgency also drives the sidebar sort order.

**Agents set their own status.** Sessions are spawned with a small CLI on PATH — the agent just runs it with its ordinary shell tool:

```
vibespace-status blocked --urgency high --reason "waiting for DB credentials"
vibespace-status working
vibespace-status clear
vibespace-status show
```

It authenticates with a per-session token from the environment, so an agent can only set its own session's status.

**You can overwrite it.** Click the chip (or the Status row in the expanded card) → pick state/urgency, or Clear. If you change or clear a status the **agent** had set, the agent is told about it in a note attached to your next message — so it learns your preference instead of silently fighting you over the indicator.

## The "For you" inbox (global user TODO list)

The status indicator says *that* a session is waiting on you; the **"For you"
inbox** says *what for* — as discrete, checkable items. When an agent hits
something only you can settle (a decision between approaches, credentials or
content only you have, something it wants reviewed), it files an item:

```
vibespace-ask "Which auth flow should signup use?" --detail "Option A ... Option B ... I lean A." --urgency high
vibespace-ask list
vibespace-ask resolve <id|text>     # the agent resolves it once you answer in chat
```

Each item belongs to the session that filed it (that session's own TODO list
for you); the **taskbar inbox button** merges every session's open items into
one panel — grouped by session, sorted urgent-first, with a count badge and a
toast when something new arrives. Click a group header (or an item) to **jump
straight to that session** and handle it; ✓ marks it done, ✕ dismisses, ↺
reopens. Recently-resolved items stay visible (dimmed) for context. Re-filing
the same open question refreshes it instead of duplicating, and a per-session
cap keeps a looping agent from flooding the list. Works from remote-host
sessions too (the CLI ships with the other VibeSpace tools).

### Multi-client sync

Task Groups live server-side in `data/task-groups.json`, session statuses in `data/session-status.json`, the "For you" inbox in `data/user-todos.json`; all broadcast to connected clients (`tasks-updated` / `session-status-updated` / `user-todos-updated`). Star/archive/name state stays in `data/user-state.json`. Changes made on one device appear instantly on all others. (These runtime files are gitignored — never committed.)

### Archiving whole projects

"Archive project" in the Recent zone archives every session under that folder **and remembers the folder** — sessions created there later start archived too (previously new sessions popped back unarchived). The same button unarchives the whole project when viewing archived sessions; unarchiving a single session dissolves the folder rule (that session stays visible, the rest remain archived).

## Recent & History on a remote host

When remote hosts are registered (Remote tab), the **Recent** zone header gains a host selector. Switching it from Local to a host runs live session discovery on that machine over ssh (`~/.claude` lock files + project JSONLs, same lock-first algorithm as local, 15-second cache) and lists that host's sessions grouped by project — the switcher scopes BOTH zones: Recent shows the host's last 7 days, History its older sessions — stopped ones are click-to-resume **on that host**, running ones show a REMOTE badge (external terminal, not attachable). The refresh button re-scans; the choice persists per browser. Local recent listing is untouched while a host is selected, and there is no background ssh polling — discovery only runs while you're looking at it.

Remote sessions are first-class in the list: cards show the real session name (from the first user message), star/archive, the expand panel, **View History**, and **Resume** — identical to local cards. History works because the server pulls the session's JSONL over ssh into a local cache (`data/remote-jsonl/<host>/`, invalidated by remote size+mtime — one ssh stat when fresh) the first time you view or resume it; scroll-back pagination, search, and the minimap then operate on the cache like any local transcript. A resumed remote session shows its full pre-resume history in the chat window.

The Recent and History zones have **independent** host switchers, and remote cards/headers carry an inner **host color strip** next to the project strip (no inner strip = local) so mixed-machine lists separate visually.

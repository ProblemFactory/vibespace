# Changelog

All notable changes to this project will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/),
and this project uses [Semantic Versioning](https://semver.org/).

## [2.42.0] — 2026-07-06

### Changed — session card / Task View
- The expanded card's **Task Groups** field now lists folder-auto-include
  membership too (marked "(folder)"), not just explicit tags — it was showing
  "None" for folder-derived members.
- Task View shows a session's group membership as **left color bars** (one per
  group, hover for the name/objective, click to open) instead of a badge row
  below the card — saves vertical space; multiple groups stack multiple bars.
- **Urgency defaults to `normal`** for any session that has a state (live or
  agent-declared), so it's no longer blank; the agent/user can still raise it.
  Sorting treats missing urgency as normal too.
- **Card background is tinted by urgency** in Task View (urgent → red, high →
  amber, normal → faint blue, low → faint grey; subtle).

## [2.41.1] — 2026-07-06

### Fixed
- Task View wrongly showed sessions as **untagged** when they belonged to a Task
  Group via an **auto-include folder** (not an explicit tag). Task View now uses
  the same membership rule as the Group board (`_getSessionTaskGroups` = explicit
  tag ∪ folder match), so a group's folder members appear under it.
- **Symlinked cwd**: a session opened under a symlinked path (e.g.
  `claude-code-webui` → `vibespace`) now matches a folder set on the real path.
  Discovery stamps a resolved `realCwd`; both the client membership check and the
  server's context injection (`groupsForSession`) match cwd or realCwd.

## [2.41.0] — 2026-07-06

### Changed — Task View follow-ups
- The **Groups | Tasks** switch is now a proper sub-tab bar under the
  Folders/Task Groups/Remote tabs (same visual language), not a segmented pill.
- Task View shows **all** sessions: tagged ones sorted on top, **untagged sunk
  to a labeled section at the bottom** (live/active untagged listed; the count
  of stopped untagged is surfaced with a pointer to Folders instead of piling
  thousands of historical sessions here).
- Added a **sort** control (Urgency+status / Status / Recent / Name) and a
  **status filter** (show only chosen states) above the list; both persist.
- The Tasks tab is no longer narrowed by the live/stopped status filter or the
  quick-view tabs — a Task Group's members (often stopped) always show. The bare
  **New Session** card is gone from the Tasks tab (it has New Task Group).

## [2.40.0] — 2026-07-06

### Added
- **Tasks tab — Groups | Tasks view toggle.** *Groups* is the existing board
  (Task Groups/岗位 with their member sessions). *Tasks* is a new flat view of
  every session tagged into a Task Group (活儿), sorted by urgency then status
  (blocked/needs-input float up, done sinks), each card showing its cwd and the
  group(s) it belongs to (click a group badge to open it). Choice persists.

### Fixed
- Session-state chip icon (working/done/…) was slightly low and a different size
  from the config-gear badge. Both icons are now a uniform 10×10 and the chip
  centers them (inline-flex); the state icon no longer hard-codes its own size.

## [2.39.0] — 2026-07-06

### Changed — Task Groups (岗位/活儿 concept refactor)

Aligned the task system to the intended model: a **Task Group** (岗位) is a
persistent role; a **session** is the unit of work (活儿); **status lives on the
session**, not the group.

- **Session status** gained `done`. A Task Group has no status — only archived
  (a role never "completes"). Removed the `vibespace-task status` subcommand and
  the `/api/agent/task-status` endpoint; `done` is reported via `vibespace-status done`.
- **Many-to-many, live belonging**: a session belongs to 0..N Task Groups,
  derived live (explicit tag / auto-include folder / spawned-into group). A
  UI bind/drag/folder change reaches the agent on its next turn with no respawn.
  Removed the single `session._taskId` and the `VIBESPACE_TASK_ID` spawn env —
  belonging is resolved server-side from the session token.
- **Injection** now covers every belonged group and re-injects a group whenever
  it changes — a UI edit, another session's `vibespace-task`, or files the user
  hand-writes into the group's context folder.
- **`vibespace-task --group <id>`** with enforced isolation — a session may only
  read/write Task Groups it belongs to.
- **Per-group injection toggle** (`injectContext`) — opt a group out of context
  injection while keeping it on the board and reportable via vibespace-task.
- **Checklist ↔ session** loose link: ticking a step records which session did it
  (informational, shown in the detail window).
- **Rename**: `TaskManager` → `TaskGroupManager`, `src/tasks.js` →
  `src/task-groups.js`, `data/tasks.json` → `data/task-groups.json` (migrated
  forward automatically on first boot; the legacy file is left in place).
  User-visible UI now says "Task Group". Wire names (JSON fields, API paths, the
  `tasks-updated` event, CLI command names) are kept for data/contract compatibility.

## [2.38.0] — 2026-07-06

### Added

- **Every VibeSpace-managed session now learns to report its status — not just task-bound ones.** Previously a session only got injected context (and thus only learned about `vibespace-status` / `vibespace-task`) if it was linked to a task; a plain session's agent had no idea it could report its state, so the board couldn't reflect what it was doing unless you'd bound a task. Now every VibeSpace session gets a small baseline injection at start teaching it `vibespace-status` (working / needs-input / blocked / review + urgency). Task-bound sessions still get the full task context (which already covers both tools). Injected once per session. This is delivered through the harness's own SessionStart/UserPromptSubmit hook — no message rewriting — and works without a task because session status is stored globally (`data/session-status.json`), independent of any task or context folder.

### Changed

- **Session-status disk writes are debounced.** The in-memory state and the live UI broadcast update immediately (as before), but the write to `data/session-status.json` is now coalesced (500ms) and content-compared, so a burst of status reports from many sessions no longer does a synchronous full-file write per update; flushed on exit. (Correctness was never at risk — single process + synchronous writes have no read-modify-write race — this purely cuts redundant I/O now that more sessions report status.)

## [2.37.5] — 2026-07-06

### Changed

- **The status-tag text↔icon switch measures against the title's DISPLAYED area**, not its full text. The name is flexible and its shown width shrinks as the tags grow, so a card collapses its status chip to an icon when the tags reach the *currently displayed* title width (`clientWidth`) — the accurate "the tags are out-widthing the visible title" signal. (2.37.4 compared against the untruncated text width, which was off once the title itself got squeezed.)

## [2.37.4] — 2026-07-06

### Changed

- **The status-tag text↔icon switch is now per-card and content-driven** (was a fixed sidebar-width threshold, which felt arbitrary). A card collapses its status chip to an icon only when its tags are as wide as the title, so tags never out-width the name. Re-measured per card on any width change.

## [2.37.3] — 2026-07-06

### Changed

- **Session cards back to two rows** (three wasted vertical space). Row 1 = a **connection-status dot** (LIVE/TMUX green, EXTERNAL amber, STOPPED dim, left of the name) + name + tags; row 2 (Tasks view) = the session's cwd. The intrinsic connection state is now that colored dot instead of a LIVE/STOPPED text badge — its label shows on hover and in the expanded card.
- **Status tags adapt to the sidebar width**: the working / needs-input / blocked / review chip shows its text on a wide sidebar and collapses to just an icon when the sidebar is narrow (CSS container query). Config stays a gear icon.
- **Instant hover tooltips**: icon-only badges (config gear, narrow status chips, the connection dot, host) show their label the moment you hover, via a custom tooltip — no more ~1s native-title delay.

### Fixed

- **Adding a folder to a task now refreshes the list immediately.** The task detail window used to skip re-rendering whenever any field was focused (to avoid clobbering what you were typing); it now skips only while a field actually has text, so an emptied add-field (right after you add a folder or step) refreshes and re-focuses for the next entry.

## [2.37.2] — 2026-07-06

### Changed — roomier card layouts

- **Session cards are now up to three rows** so the name is never crowded off: row 1 = the name alone; row 2 = its tags (role, a config gear, host, the status chip, and the connection badge); row 3 — in the **Tasks view** only, where a task's sessions can live in different directories — the session's own **working directory**, left-truncated so the meaningful tail is visible. Fixes the squeeze the always-on status chip introduced in 2.37.0 (names had collapsed to a single character).
- **Per-session custom config is a single gear icon**, with the model/effort/permission details in its tooltip (it used to print the full model id inline, e.g. "claude-opus-4-8", eating the row).

## [2.37.0] — 2026-07-06

### Task system review — status visibility, clarity, safer agent tools

- **See each session's status at a glance.** Every live session card now shows a status chip — working / waiting for input / blocked / review — synthesized from what VibeSpace already observes (the agent's own report if it made one, otherwise the idle/active signal). Chips the agent or you set are solid; ones VibeSpace inferred are dashed. **Urgency drives the sidebar order**: sessions the agent flagged urgent/high (or that are blocked / waiting for you) float to the top.
- **Recursive folders, now configurable.** A task's linked folders each have a "subfolders" toggle — on (default) auto-includes sessions anywhere under the folder; off restricts to sessions whose directory is exactly that folder.
- **New sessions recommend the task's folders.** Starting a session in a task floats its linked folders to the top of the working-directory suggestions (highlighted).
- **Clearer task detail.** "Plan" → "Checklist" and "Progress" → "Activity log" everywhere (the UI, the generated TASK.md, and the context injected into agents), each with a one-line explanation. "Repo file" is now "Export / Import" (with an Import button and a clearer description). The context-folder field no longer says "coming in P2" — it describes what it does. Task colors are now clearly visible on the board (a bold color bar + tinted title) instead of a 2px edge.
- **Agents are less likely to misuse the reporting tools.** `vibespace-task` / `vibespace-status` now print usage AND the current state when run with no arguments, list the valid subcommands on a typo, and catch the common "task status vs this session's state" mix-up with a corrective hint. The injected context spells out that the commands are already scoped to the agent's own task (no task id to pass), disambiguates the two enums, and tells the agent to self-check by running a command bare. The injected activity log is capped at the last 30 entries with a pointer to the full log.

## [2.36.1] — 2026-07-06

### Added

- **Workflow viewer now works while a run is in progress.** Previously "View Workflow" only worked after a dynamic workflow finished (the rich snapshot is written once at the end) — opening it mid-run showed "snapshot not found". It now falls back to a **live view** built from the run's journal + agent transcripts: a pulsing "Running" chip, an "N agents · M done · running…" line, and one row per agent (running/done) with a live-updating transcript via View Log. The panel polls every ~2.5s and automatically switches to the full phase/label/token view the moment the run finishes. (Phase names, labels and token totals only exist in the end-of-run snapshot, so the running view shows agent count + per-agent state + transcripts.)

## [2.36.0] — 2026-07-05

### Added

- **Workflow detail viewer (dynamic-workflow / ultracode observability).** When Claude runs a dynamic workflow in chat, its tool card now has a **View Workflow** button. It opens a panel showing the run's phases, every agent with its state (queued/running/done/error), model and the run's token/tool totals — and each agent has a **View Log** that opens its full transcript in the read-only viewer. This is a *post-hoc* view: Claude Code writes the rich phase/agent snapshot once, when the run finishes (live progress is a TUI-only render layer with no file or stream to read — verified empirically and against the third-party claude-view tool, which reaches the same conclusion). Killed/failed runs show their frozen mid-run state.

## [2.35.0] — 2026-07-05

### Added

- **Task updates reach the agent on its next message.** When a task changes (its objective, plan, progress, or status — edited in the UI or reported by another session), the agent gets the refreshed task context injected on its very next turn, marked as an update. It stays quiet when nothing changed. Works on both Claude (via its UserPromptSubmit hook) and Codex.
- **Codex chat now receives task context natively.** Previously Codex's app-server ignored the hook output, so Codex sessions didn't get auto-injected task context. VibeSpace now delivers it through Codex's own `thread/inject_items` (a developer-role message appended to the thread), verified end-to-end. Codex sessions started in a task now know the task — and get the same on-next-turn updates as Claude.
- **`run.sh` supervised launcher.** Starts the server and automatically restarts it if it exits (e.g. an out-of-memory kill under system memory pressure) — dtach sessions survive, so agents aren't lost. Bare `node server.js` stays down after a kill; `./run.sh` brings it back.

### Fixed

- **Ultracode effort in the chat effort menu.** The effort dropdown (and the per-session config) now offer **ultracode** (and the previously-missing xhigh). Researched the real mechanism from the CLI: ultracode isn't an effort *level* but a separate mode (xhigh + dynamic-workflow orchestration), so it's wired via the CLI's own `ultracode` settings key rather than as a bogus effort value.

## [2.34.0] — 2026-07-05

### Changed

- **Task context is now delivered ONLY through the harness's native hooks — never by rewriting your message.** The earlier approach of prepending context to the user's first message (for Codex and remote sessions) was removed: modifying the input stream bypasses the CLI's own mechanisms and is unstable. `vibespace-hook.mjs` now registers for **both** `SessionStart` (task context) and `UserPromptSubmit` (status-override notices, and first-prompt context where SessionStart doesn't fire), for both Claude Code and Codex.

### Added

- **Remote sessions get the full task integration (P3 remote).** Spawning a session on a remote host now opens an ssh reverse tunnel so the remote agent's tools and hook reach VibeSpace, distributes the `vibespace-status` / `vibespace-task` tools + the hook to `~/.vibespace/bin` on the remote, and registers the hook in the remote's own Claude/Codex config. Verified end-to-end on a real remote box: the agent received the task's context and reported progress back through the tunnel.
- **Repo task files (P4).** A task can be exported to a committable markdown file (YAML frontmatter + objective + plan + progress) from the task detail window, and imported back from such a file via the board's "Import…" card. The structured store stays authoritative — the file is a shareable projection, not a live-parsed source.

### Hardened (adversarial review before release)

- Remote spawn: the task id is now validated to the `T-…` shape and env values are shell-quoted before interpolation into the ssh command (closes a command-injection vector on the taskId).
- Task-context is strictly scoped to the session's own task (a per-session token can't read another task's context).
- Hook management: the "Remove" button is now durable (a persisted opt-out stops startup from re-registering); the status endpoint no longer errors on a hand-edited/malformed hooks file; config writes use a compare-and-swap to avoid clobbering a concurrent CLI write.
- Repo import tolerates CRLF files and preserves the progress log and objectives that contain markdown headings.

### Known limitation

- **Codex chat sessions do not yet receive auto-injected task context.** Codex's app-server (JSON-RPC) mode runs hook *commands* but does not inject their returned context into the model (verified empirically against codex-cli 0.142.5); the hook is registered and will work if/when Codex adds app-server hook-injection. Claude sessions (terminal + chat, local + remote) are fully covered.

## [2.33.0] — 2026-07-05

### Added

- **Hook management in Manage Agents** — the task-context hook now has a visible home: **⚙ → Manage agents…** shows a "VibeSpace integration" row with plain-language per-CLI status (installed / not installed / needs update / config unreadable) and one-click **Install / Reinstall / Remove**. It still installs itself automatically at server start; the dialog exists so non-engineers can see that it's working and fix it if it isn't. Removal only ever touches VibeSpace's own entry — other hooks are never modified.
- **`vibespace-task` — agents report task progress** — sessions started from a task can now write back to the board with their ordinary shell tool: `vibespace-task progress "what I did"` (timestamped, session-tagged), `plan-check <step>` / `plan-add "step"`, `status <active|paused|blocked|done>`, and `show`. Writes are validated and scoped server-side to the session's own task; the task detail window, board, and `TASK.md` update live. The injected task context teaches agents these commands automatically.

## [2.32.0] — 2026-07-05

### Added

- **Task context injection (P2)** — a session started or resumed **in a task** now begins with the task's context already injected: objective, plan, recent progress, an index of the context folder's files (the agent reads what it needs), and the working rules (don't touch the generated `.vibespace/`, share artifacts in the folder, report with `vibespace-status`).
  - **Claude**: via Claude Code's native SessionStart hook — registered automatically (idempotent, non-destructive to existing hooks), a no-op for any session not started from a VibeSpace task. Works for terminal and chat sessions, and re-fires on resume.
  - **Codex**: no session-start hook exists in current Codex, so the context rides on the session's first message (shown as a collapsible dim block).
  - VibeSpace now also generates `<contextDir>/.vibespace/TASK.md` — an always-current markdown mirror of the task state, kept in lockstep with every task change (the program is its only writer).
  - Verified end-to-end on both backends with a codeword placed only in the task objective — both models answered it.

## [2.31.0] — 2026-07-05

### Added

- **Session status indicators** — every session can carry a state (`working` / `needs-input` / `blocked` / `review`) + urgency (`low`→`urgent`) + reason, shown as a colored chip on the session card (urgent pulses). **Agents set their own status**: sessions now spawn with a `vibespace-status` CLI on PATH (per-session token auth) so an agent can report `vibespace-status blocked --urgency high --reason "…"` from its normal shell tool. **You can overwrite it** from the chip's popover — and if you change or clear an agent-set status, the agent is told in a note attached to your next message, so it learns your preference. Blocked sessions feed their tasks' ⚠ attention badges alongside idle-waiting.
- **New session in a task** — the New Session dialog gained a **Task** dropdown; the task board's + button and context menu open the dialog pre-filled (task selected, working directory = the task's first auto-include folder) while you confirm all parameters. The session is tagged to the task automatically and spawned with `VIBESPACE_TASK_ID` in its environment (groundwork for context injection).

### Changed

- **Your existing groups are now full tasks** — the migrated groups (kind `group`) were upgraded to kind `task` (status/objective/plan/progress available); fresh migrations now produce tasks directly.

## [2.30.0] — 2026-07-05

### Added

- **Task system (P1)** — the Groups tab grew into a **task board** (design: `docs/design-task-system.md`; tasks ⊃ groups, existing groups migrated automatically and behave exactly as before):
  - A task tags sessions across directories (many-to-many) and can carry a **status** (active/paused/blocked/done), **objective**, **plan checklist**, and **progress log** — all stored server-side in `data/tasks.json` (authoritative for everything the board shows, synced to every client live).
  - **Task detail window**: structured editor for all of the above, plus bound sessions (with unbind and dim "via folder" rows), auto-include folders with path autocomplete, a **context folder** designation (its content will be injected into bound sessions in an upcoming release), and a board color.
  - **Attention**: when a bound agent finishes and waits for input (the same idle detection that blinks window titles), the task header shows a blinking **⚠ N** and the Tasks tab itself lights up — a board-level "which agents need me" view. Observation only; VibeSpace never drives the agent.
  - Bind from the session card (Tasks ▾ checklist), by dragging a card/folder onto a task header, from the file explorer ("Add to task"), or via folder auto-include. Right-click a task for Details / Rename / Status / Convert to task / Linked folders / Delete.
  - Legacy `sessionGroups`/`groupFolders` in user-state migrate once into `kind:'group'` tasks and stay dormant; tasks are included in config export/import.

### Fixed

- **Archived folders now cover future sessions** — "Archive project" records the folder itself (`archivedFolders` in user-state), so a session created in that folder later starts archived instead of popping the project back into Recent (the final piece of the "archive didn't stick" saga). The same button unarchives the whole project; unarchiving a single session dissolves the folder rule into per-session archives so it sticks.

## [2.29.1] — 2026-07-05

### Added

- **Model auto-fallback warning** — when the harness silently swaps models mid-session (e.g. Fable overloaded → served by Opus; the CLI writes a `fallback` marker), the chat now surfaces it: the status-bar model badge turns amber with ⚠ and the actual serving model (tooltip explains; click to re-pick), and a dim system notice appears in the stream. Clears automatically when the requested model is served again. Alias-tolerant ("fable" vs "claude-fable-5" is not a false positive).
- **Mid-session model/effort picks persist** — choosing a model or effort from the chat status bar now saves it as that session's per-session config (the same store as the Resume gear popover), so the next resume starts with the same choice.

## [2.29.0] — 2026-07-05

### Changed

- **Storage is now one flat list of connections** — the special "My storage" card is gone. Every place your files live (S3, Google Drive, Nextcloud/WebDAV, SFTP, an imported share, another VibeSpace) is an equal row in one list; **Connect storage** adds any type and connects it in one step. This removes the confusing split where S3 had a privileged card while everything else lived in a separate list (and the "is my Google Drive "My storage"? how do I mount it?" confusion).
- **Sharing moved onto the connection** — instead of a global "share" button tied to the special slot, each S3 connection that holds your own full credentials shows a **share** button on its row that mints a down-scoped link for a subfolder. It reads the credentials straight from that connection, so no separate owner-key config exists. Imported shares and non-S3 types don't show it (they can't mint).
- Legacy `VIBESPACE_S3_*` / earlier `myStorage` config auto-migrates to a normal S3 connection named "My storage" on first boot. Verified end-to-end (mint from a row → import → read a real MinIO object).

## [2.28.7] — 2026-07-05

### Fixed

- **“Archive project” now archives the WHOLE folder** — the Recent-zone project archive button only archived the sessions it showed (the last 7 days, capped), leaving the folder’s older sessions un-archived. Those reappeared later (surfaced by History or a fresh discovery after a server restart), which looked like the archive hadn’t stuck. It now archives every session under that working directory. (Session archive state itself was always persisted correctly — server-side in `data/user-state.json` and client-side in localStorage — verified surviving a restart + refresh.)

## [2.28.6] — 2026-07-05

### Changed

- **Plain-language storage actions** — the primary buttons now say **Connect** / **Disconnect** instead of “mount”/“unmount” (footer “Connect storage”, per-row Connect/Disconnect, “Import & connect”); “mount” remains only in tooltips and advanced contexts. The two share buttons are now symmetric — **Share a cloud folder** (from your S3 storage) vs **Share a local folder** (a folder on this machine, over the bridge) — so the difference is obvious.

## [2.28.5] — 2026-07-05

### Fixed / Added

- **Share a folder from the file explorer** — folder right-click and the background menu gain “Share this folder…”, which opens the bridge-share dialog with the path prefilled (local explorers only). Previously sharing was reachable only from the Storage tab.
- **File-explorer submenu no longer sticks** — hovering a plain menu item now dismisses an open sibling submenu (e.g. the “Sessions ▸” flyout) instead of leaving it floating.
- **Properties opens instantly** — the dialog appears immediately with the fast info filled in and the recursive folder size streams in afterward (“calculating…”), instead of the click hanging for seconds on a big folder’s `du` and popping up later.
- **Machines connectivity auto-checks** — hosts are probed automatically on the Remote tab (and re-probed when older than 2 minutes), updating each dot in place, so status is meaningful without clicking the link button.
- **Remote tab no longer flickers** — the session poll no longer rebuilds the whole Storage/Machines panel every few seconds; it repaints only on real changes (and even then keeps the old panel up until the new one is ready).
- **Advanced options fields fixed** — the collapsed “Advanced options” inputs were rendering at ~half width because they’d dropped out of the dialog’s flex layout; they’re full-width again. The label no longer says “rclone”.
- **Path fields get autocomplete** — the bridge-share folder, SFTP key/remote paths, and custom mount path now have the same Tab/type-ahead directory completion as the file explorer’s path bar (SFTP remote path completes over the chosen host).

## [2.28.4] — 2026-07-05

### Changed

- **Storage/Mounts UI made non-engineer friendly** (from a full UX audit). S3 fields now explain themselves ("Server address (endpoint)", "Bucket (storage container)", "Access key — from your provider's Access Keys page", etc.) with a where-do-I-get-this hint on each; source types read in plain language ("Cloud storage (S3 / MinIO)", "A server over SSH (SFTP)"); RO/RW render as "Read-only"/"Read-write"; share descriptors say "expires in 7 days" / "no expiry" instead of "STS"/"revocable". Advanced knobs (extra rclone options, custom mount path) collapse under an "Advanced options" disclosure. "Mint"→"Create", "Bootstrap"→"Set up", "Host"→"Machine"; the empty state and notes no longer mention `VIBESPACE_S3_*`, `mc`, or `STS`. Section headers gained one-line descriptions, and the SSH-key picker and public-key instructions now explain what a key is and what to do with it. Mount errors are prefixed "Couldn't connect:".

## [2.28.3] — 2026-07-05

### Added

- **Import an rclone config file** — Storage → *Import rclone config* takes a pasted `rclone.conf`, previews every remote in it (name + backend type; wrapper remotes like `crypt`/`alias` shown greyed as unsupported), and imports the ones you tick as mounts. Verified end-to-end against real MinIO.

### Fixed

- The Cloudflare Accept-Encoding signing fix (and V2-auth probe) now applies to **any** s3-backed mount — custom-rclone and rclone.conf-imported s3 remotes, not just the native S3 type — so object reads through a proxied endpoint no longer hang.

## [2.28.2] — 2026-07-05

### Added

- **Custom rclone backends** — a new *Custom (any rclone backend)* mount type takes any rclone backend name (dropbox, b2, azureblob, mega, …) plus its config as `key = value` lines, so anything rclone supports can be mounted without waiting for a dedicated type. Verified end-to-end (S3 backend via the generic path).
- **Extra rclone options on every type** — an advanced `key = value` field merged into the rclone config of any mount (custom API keys, tuning flags like `chunk_size`, provider quirks).
- **Custom Google Drive OAuth client** — optional client ID/secret fields (your own Google Cloud project, avoids rclone's shared quota); the guided Connect flow uses them too.

All custom param values are AES-256-GCM encrypted at rest like every other secret.

## [2.28.1] — 2026-07-05

### Added / Changed

- **No terminal needed for mounts.** Google Drive now connects with a guided **Connect Google Drive** button — VibeSpace runs the OAuth handshake (server resolves the real Google consent URL; same-machine browsers complete hands-free, remote deployments paste the redirect address back) and fills the token automatically. No more `rclone authorize` on the command line.
- **One-click rclone install** — if rclone isn't present, the Storage section offers an **Install rclone** button that downloads the official pinned binary into `data/bin` (no package manager). All mounts use it automatically.
- **SFTP prefill from registered hosts** — pick a host in the SFTP add-mount form and its address/user/port/key are filled in.
- Per-field help text in the add-mount dialog (e.g. where to find a Nextcloud WebDAV URL).

## [2.28.0] — 2026-07-05

### Added

- **Multiple mount source types** — the Storage section's **Add mount** now supports S3/MinIO, **Google Drive** (paste the `rclone authorize "drive"` token), **WebDAV / Nextcloud**, **SFTP** (ssh host + key/password), and **another VibeSpace** — one dialog, per-type fields. All secrets AES-256-GCM encrypted at rest; rclone-obscured passwords are obscured only at mount time. Verified SFTP end-to-end against a real host (read + write).
- **VibeSpace-to-VibeSpace mounting (WebDAV bridge)** — **Share via bridge** mints a scoped mount token (`vsmt_…`) + `vibespace-mount:v1:…` link for a folder of this machine; another instance imports it to mount that folder RO/RW. Tokens are stored hashed, carry a chroot root + ro/rw enforced on every request (traversal and symlink escapes rejected), and are revocable. The bridge is standard WebDAV (`/dav`, Bearer auth), so rclone/Finder/phone file managers can mount it too. Verified loopback: RO write-block, scope enforcement, RW round-trip.
- **My storage configured in-app** — the personal S3 store (and share-minting owner key) is now set in the UI (Storage → Configure S3… / Edit), encrypted in config. `VIBESPACE_S3_*` env vars are imported once on first boot for backward compatibility, then the in-app config is canonical and rides in config export/import. Env vars are no longer required.

## [2.27.2] — 2026-07-04

### Fixed

- **Mobile rendered desktop chrome customization** — a custom arrangement (e.g. desktop previews moved into an extra toolbar row) was applied on phones too, drawing the extra row on top of the mobile UI. Arrangement/springs are now desktop-only (mobile keeps its own chrome), plus a media-query guard hides the extra bar rows on small screens outright.

## [2.27.1] — 2026-07-04

### Fixed

- **Mounts through Cloudflare-fronted MinIO** — proxies that rewrite the `Accept-Encoding` header broke rclone's SigV4 signature (`SignatureDoesNotMatch`; reads silently retry-looped, looking like a hang). Mounts now add `--s3-use-accept-encoding-gzip=false` when the installed rclone supports it (1.63+), and a one-time signing probe falls back to V2 signatures for permanent-credential mounts on rclone builds where the flag doesn't help (≥1.70, aws-sdk-go-v2). STS shares on such builds fail with an explanatory error instead of hanging. Verified end-to-end against a real Cloudflare-fronted MinIO: RW mount, STS share mint → import → RO read/write-block, server-restart adoption, revoke.

## [2.27.0] — 2026-07-04

### Added

- **Host color strips** — session cards and project headers carry a second, inner 3px strip in a stable per-host color next to the outer project strip (no inner strip = this machine), so mixed local/remote sessions in the Active zone separate at a glance.
- **History has its own host switcher** — independent of Recent's: browse one host's recent work while digging through another's (or Local's) history. Explicit host-scoped empty states ("No sessions older than 7 days on AIDev") so an empty zone reads as data, not breakage; picking a host auto-expands the zone.

## [2.26.0] — 2026-07-04

### Added

- **Remote session history over ssh** — the server fetches a remote session's JSONL into a local cache (invalidated by remote size+mtime; one ssh stat when fresh) whenever you view or resume it. Pre-resume history now renders in the chat window (verified: 342-message remote transcript), View History works for remote sessions, and pagination/search/minimap all operate on the cache like a local transcript. This also removes the failure mode where a live reply could be lost on a history-less remote attach.
- **Remote cards are now full session cards** — same card as local sessions: real name extracted from the first user message during discovery (string- and block-form content), host badge, star/archive, expand panel with details, View History and Resume buttons. The stripped-down two-line remote card is gone.

## [2.25.0] — 2026-07-04

### Added

- **Recent + History host switcher** — the sidebar's Recent section can switch from Local to any registered remote host (one switcher scopes both zones: Recent = that host's last 7 days, History = its older sessions, same time split as local): sessions on that machine are discovered live over ssh (lock-first, cached 15s, no background polling), grouped by project with per-host colors, and stopped ones resume **on that host** with one click (verified end-to-end: same session id, full model context restored, live replies). Running remote sessions show a REMOTE badge. Includes a re-scan button; the selection persists per browser.
- Remote discovery hardening: works when the remote login shell is zsh (an unmatched glob previously aborted the whole scan → "0 sessions"), skips subagent transcripts, and extracts each session's real cwd from the JSONL head (the encoded project dir name is ambiguous).

### Fixed

- `/api/active` and the on-connect WebSocket session list both dropped `host`/`hostName` — remote sessions lost their host badge and host-prefixed grouping after every refresh/reconnect until the next broadcast.

## [2.24.0] — 2026-07-04

### Added

- **Terminal host picker** — the toolbar Terminal button lists Local + registered remote hosts when any are configured (direct local shell otherwise); "Open Terminal Here" in a remote explorer opens the shell on that host in that directory.
- **Host-aware bookmarks** — bookmarks record the host they were created on: remote bookmarks show a host badge, and clicking one switches the explorer to that host and navigates. Dedup, drag-to-bookmark, and "Open in new window" are all host-aware.
- **Explorer host persistence** — file explorer windows restore their host across page refreshes, layout sync, and presets (an `AIDev: /tmp` window no longer comes back as a local `/tmp` window).

## [2.23.2] — 2026-07-04

### Added

- **Cross-host folder transfer** — folders now copy/move between hosts directly (drag between explorer windows, or copy/paste): the source streams a `tar` of the tree through the server into a `tar` extract on the destination. No temp archive; permissions, executable bits, and symlinks preserved. Renaming during transfer works, existing destinations return a conflict prompt, and cross-host *move* removes the source after a successful transfer.
- **Cross-host copy/paste** — the file clipboard now remembers which host it was copied from, so Copy on one host + Paste on another transfers the items (previously the paths were misread as belonging to the destination host).

## [2.23.1] — 2026-07-04

### Added / Fixed

- **Cross-host drag between file explorers** — drag a file from one explorer window to another on a different host and it transfers automatically (same host = remote cp; cross-host or host↔local = streamed through the server). Verified both directions against a real remote.
- **Project colors clarified** — the per-project color now appears at project level: Recent headers carry a colored dot naming each project's color, and both Active and Recent cards of the same project share that color's left strip, so a running session ties to its Recent siblings at a glance.
- **Fixed:** the per-terminal ⚙ settings popover was invisible (missing `position:fixed` laid it out off-screen) — clicking it now shows the theme/font controls under the gear.

## [2.23.0] — 2026-07-04

### Added (collaboration)

- **Files across hosts** — the file explorer gains a host dropdown next to the path bar: browse and *edit* files on any registered ssh host with full parity (list / open / create / rename / delete / upload / download / compress / extract / properties), each op one ssh command reusing the host's key. Drag or copy a file between two explorer windows on different hosts and it transfers automatically (same host = remote cp; cross-host or host↔local = streamed through the server). See [docs/files-cross-host.md](docs/files-cross-host.md).

## [2.22.0] — 2026-07-04

### Added / Changed (remote + session management)

- **Remote hosts, verified against a real box.** Register an ssh host (paste/upload a private key or reuse `~/.ssh`), one-click connectivity test (latency + which of dtach/node/claude/codex are installed → toast + READY badge), and a **Bootstrap** dialog with a live streaming log that idempotently installs the missing tools.
- **Remote sessions everywhere they make sense.** New Session gets a Host dropdown and a **Terminal (plain shell)** backend (the form adapts — no model/permission rows for a shell); choosing a host re-sources the working-directory autocomplete and recent-path chips over ssh. Manage Agents gets a Machine dropdown so you can check/log-in/update a CLI on a remote host.
- **Batch session management.** A manage-mode toggle in the sidebar lets you *mark* running sessions to terminate and/or archive without the list reshuffling; a top bar shows the count and applies everything at once.
- **Automation terminals are throwaway.** Login/update helper terminals now always terminate when you close them, instead of lingering as detached shells.
- Mobile uses the same three-zone workbench; the oh-my-zsh update prompt no longer eats the first character of auto-typed commands.
- **Archive a whole project in one click** — each Recent-zone project header has an archive-all button, for folders full of throwaway sessions.
- **Config export/import now covers remote hosts and S3 mounts** (opt-in, encrypted): migrating to a fresh instance carries your ssh hosts + uploaded keys and your mount definitions + credentials, not just settings.

### Changed (session list redesign)

- **Three-zone workbench** — the Folders tab now renders ACTIVE (every running session as a two-line card: name + badges, dim abbreviated path below, per-project colored strip, starred first, same-project adjacent) / RECENT (stopped in the last 7 days, grouped by project, capped at 5 per project with expanders — session floods can't bury the list) / HISTORY (collapsed + search-first; typing in the filter searches it, expansion pages 60 at a time). A dozen live agents are now one glance instead of a scroll through thousands of stopped cards.
- **Ctrl+K session palette** — fuzzy switcher over every session (name/path/host; live first). Enter focuses a live session or resumes a stopped one; typing a `/path` or `~path` offers "new session here". Works everywhere except inside terminals.
- **Unified filter** — Status / Backend / Location / Agent sections in ONE popover behind the funnel button; the separate live-filter button and its row are gone.

## [2.21.0] — 2026-07-04

### Added (collaboration P2)

- **Remote hosts** — the sidebar tab (renamed **Remote**) gains a Hosts section: register ssh machines (your `~/.ssh` keys, or an app-generated ed25519 key with the public key surfaced for `authorized_keys`), one-click **connectivity test** (latency + which of dtach/node/claude/codex are installed → READY / NEEDS SETUP badge), and **Bootstrap** — a step-progress dialog with an expandable live log that idempotently installs dtach, Node.js (nvm) and the Claude CLI on the target.
- **Remote terminal sessions** — the New Session dialog has a Host dropdown; the session runs as `local dtach → ssh -t → remote dtach → claude`, so network drops and local server restarts never kill the remote agent. Remote sessions mix into the main session list grouped under a `host:` prefix with a host badge.
- **Location filter** — the backend-filter popover gains a Location section: show only Local sessions or only those on chosen hosts.
- **Remote chat sessions** (P3 core) — the Host dropdown works for chat mode too: stream-json flows over a clean `ssh -T` pipe through the existing chat-wrapper/normalizer stack (the full chat UI — permissions, tools, status bar — against a remote agent). Trade-off vs terminal mode: an ssh drop ends the remote process (the transcript survives on the remote and is resume-able); terminal mode keeps the remote agent alive through drops via remote dtach.
- Remaining for later: resuming remotely-discovered stopped sessions, merging remote discovery into the main list, remote transcript search.

## [2.20.0] — 2026-07-04

### Added (collaboration P1)

- **Mounts tab** (sidebar, next to Folders | Groups) — rclone-backed shared S3 storage:
  - **My storage**: instances provisioned with `VIBESPACE_S3_*` env get a one-click mount of their bucket prefix.
  - **Share a folder**: mint a *down-scoped* credential for any folder under your prefix with your own key — permanent revocable MinIO service accounts when `mc` is available (bundled in the Docker image), STS AssumeRole temporary credentials (≤7 days) otherwise. Revoke from the "Shares I created" list.
  - **Import share link**: paste a `vibespace-share:v1:…` link → the folder mounts read-only/read-write as granted. Links embed the credential — treat them as secrets.
  - Mounts survive server restarts (detached rclone, adopted on boot + auto-remount), credentials are encrypted at rest and never appear in argv, mount base configurable (`VIBESPACE_MOUNT_BASE`, default `~/vibespace-mounts`) with per-mount custom paths. See [docs/mounts.md](docs/mounts.md).

## [2.19.0] — 2026-07-04

### Added

- **Config export / import (Backup & migrate)** — ⚙ menu → Backup & migrate… exports the whole instance configuration to a single JSON file: settings (incl. Customize-UI arrangement), custom themes, layouts & virtual desktops, session metadata (stars/renames/groups/per-session configs), file bookmarks, and this browser's preferences. **Sensitive items are opt-in and always encrypted** (AES-256-GCM under an export passphrase): the VibeSpace password record and Claude/Codex CLI credentials — so migrating to a fresh container can carry your logins without ever writing them in plaintext. Import (same dialog / the onboarding wizard) shows the file's contents with per-section checkboxes; each selected section replaces the current data. Login tokens are never exported.
- **In-app password management** — ⚙ menu → Set/Change password…: set a password (enables auth), change it (requires the current one), or remove it (disables auth). Setting or changing **logs out every other device**; the acting browser keeps a fresh session. A password set (or removed) in-app always wins over `VIBESPACE_PASSWORD` at the next boot.
- **Onboarding wizard: "Protect this workspace" step** — set a password, generate a random one, or skip; plus an "Import a config file" entry so a new container is password-protected and fully configured in one step.
- **⚙ menu reorganized** — grouped with separators (workspace tools / data & security / help) after the flat list grew too long; export+import merged into one tabbed "Backup & migrate" dialog.

## [2.18.0] — 2026-07-04

### Added

- **Customize mode** — a Firefox-style edit mode replacing settings-list hunting for chrome customization (⚙ menu → **Customize UI…**, or right-click empty toolbar/taskbar space). The workspace dims and every customizable element is outlined *on the real UI*: click an element to hide/show it (hidden elements stay dimmed on the canvas while editing, so nothing ever disappears), hover for a what-is-this tooltip, and segmented pills float next to the bars they control — taskbar position (Bottom/Top) + visibility (Show/Auto-hide/Hidden), sidebar position (Left/Right). Bottom panel: Reset / All settings… / Done; Escape exits. Everything writes the existing settings keys, so persistence and multi-client sync are unchanged.
- **Drag elements between bars** (in Customize mode) — every customizable element can now be *dragged* to reorder it within its bar or move it to a different bar entirely: toolbar center, toolbar right, or the taskbar tray. A ghost follows the cursor, target zones light up, and an insertion marker shows exactly where it will land. The flagship workflow: drag the desktop previews and usage donuts into the toolbar, then hide the whole taskbar — nothing is lost. Arrangement persists (`chrome.arrangement`) and syncs across clients; Reset restores the stock layout. Core anchors (☰, ⚙, the window-item strip) stay put by design; New Session is movable but never hideable.
- **Move from the sidebar** — session cards' expand panel gains a **Move** button that starts window Move mode (window follows the cursor, click to place), switching to the window's desktop first. This is the recovery path for a window accidentally dragged off-screen with no grabbable title bar.
- Toolbar **Terminal** and **Presets** buttons are now hideable too (`toolbar.showTerminalButton`, `toolbar.showPresetsButton`).
- The taskbar right side is now a **tray** (`#taskbar-tray`): desktop previews, usage meters, and the window counter sit in one horizontal row (previously usage/count were stacked in a fixed column) — each independently hideable, orderable, and movable.
- **Alignment controls** (in Customize mode) — mini alignment chips appear next to each alignable area: window items left-aligned or centered (Windows-11 style), toolbar-center content left/center/right, and the tray at the taskbar's left or right end. Persisted as `chrome.zoneAlign`, synced, covered by Reset.
- The window counter is now a **compact chip** — a window-stack icon + bare count (tooltip carries the full "N windows — click for window list" label) instead of a wide text label that wasted tray space.
- **Springs (flexible space)** — the "+ Spring" button in Customize mode inserts an invisible flexible spacer (macOS-toolbar style) that pushes its neighbors apart; drag it between elements for justify-between layouts (previews centered, usage pushed right, etc.). Springs show as hatched ↔ bars while editing; click one to remove it.
- **Extra bar rows** — two optional full-width rows (below the toolbar, next to the taskbar) that appear when you drag elements into them and vanish when emptied. E.g. give the layout presets their own row under the toolbar.
- Fixed: desktop preview labels disappeared when previews were moved into the toolbar — they now shrink to fit instead of being hidden.
- **Configurable springs** — click a spring to open its config popover: **Flexible** with a strength weight (1–9; two springs at 1× and 3× split the leftover space 1:3) or **Fixed** width in px (a rigid spacer — e.g. mirror the "☰ VibeSpace" section's width at the start of an extra row so both rows' centered content lines up on the same axis), plus Remove. Live-applied, persisted (`chrome.springs`), synced.
- Fixed: the window-list popup always opened upward — off-screen when the window-count chip is hosted in the top toolbar. It (and the tab-group list) now flips below the anchor when there's no room above; the per-window right-click menu likewise opens downward when invoked in the top half of the screen instead of being bottom-anchored.
- Window-list rows are now **right-clickable** with the same per-window menu as taskbar items (Move / Minimize / Move to Desktop / Close). The list stays open under the menu (right-clicking used to dismiss it, which felt jarring) and refreshes in place after the action.
- **Spring width sources** — fixed springs now take px or **% of screen width** (unit toggle converts in place), and the **Match…** button enters a width-pick mode: click any bar element (e.g. the "☰ VibeSpace" section) to copy its width into the spring, keep clicking to sum several elements, Done/Escape to finish. One-click recipe for aligning an extra row's center with the toolbar's: spring at row start → Match → click the VibeSpace section. While picking, the config popover parks mid-screen so it can never cover the element you're trying to click.

### Fixed

- **Disconnected chat input is no longer frozen.** While the server connection is down, the input box used to be disabled with pointer-events off — you couldn't even select the text you'd already typed to copy it. Now the input stays fully interactive offline: select, copy, keep drafting (drafts sync after reconnect); only *sending* is blocked, with a toast and your draft kept intact. The send button dims to show the state.

## [2.17.0] — 2026-07-03

### Added (team deployment)

- **Password authentication** (optional — off unless configured). Set `VIBESPACE_PASSWORD` or let the container generate one. Guards all pages, APIs, WebSockets, and the browser proxy; login sessions are HttpOnly-cookie tokens persisted server-side (survive restarts, 180d), per-IP rate limiting on the login form, Sign out in the ⚙ menu, automatic bounce to `/login` when a token expires mid-session.
- **Docker deployment**: `Dockerfile` + `docker-compose.yml` — dtach/zip/git/Claude CLI included, runs as non-root (required for bypassPermissions), volumes for data / Claude credentials / workspace, and a **random workspace password generated + printed on first boot**. See [docs/deployment.md](docs/deployment.md).
- **UI chrome customization** (Settings → Toolbar & Layout): taskbar docked top or bottom, sidebar docked left or right, and show/hide toggles for the taskbar itself, desktop previews, usage donuts, the window counter, layout presets, and the Browser/Files toolbar buttons — all live-apply, all synced across clients.
- **Fixed: messages frozen after a server restart** (the status label kept updating but no new messages appeared). Message IDs are a per-normalizer counter; a server restart rebuilds the normalizer and the new numbering collides with what the client already rendered — new messages were silently swallowed by duplicate detection. The attach payload now carries a normalizer epoch; when a client reconnects across a restart it detects the epoch change and reloads the whole view from the fresh payload instead of incrementally catching up. Verified live: restart → epoch change → history intact → new message renders without refresh.
- **Toolbar polish**: all toolbar buttons are now a uniform 26px with truly centered icons (inline SVGs were baseline-aligned, sitting low next to their labels; the text-only New Session button computed a different height). New Session gains a matching plus icon.
- **Shell terminals** no longer show zsh's stranded inverse-video "%" artifact at the top (PROMPT_EOL_MARK suppressed in the spawn env — the width-mismatch between PTY spawn size and client replay size left it visible).
- **Manage Agents dialog** (⚙ → Manage agents…) — one place for CLI lifecycle: per-backend install/version/login status, **Log in** and **Update** buttons (claude update / npm upgrade for Codex), Re-check. All actions run visibly in a terminal window. Replaces the separate login menu entries.
- **Fix**: the New Session dialog's Working Directory input was ~half the width of its sibling fields (the autocomplete wrapper had no width rule).
- **First-run onboarding wizard** — a fresh instance greets new users with a 3-step tour: what VibeSpace is → live Claude/Codex install+login status with one-click in-product login → pick a folder and start the first session. Re-runnable anytime from ⚙ → "Show welcome tour". New `GET /api/backend-status` reports CLI install/version/login state.
- **Plain shell terminals** — a Terminal toolbar button (and "Open Terminal Here" on any folder) opens your login shell in a normal window: same dtach persistence, multi-device sync, and window management as agent sessions, no AI attached. Great for git, builds, and one-off commands without leaving the workspace.
- **In-product CLI login** — ⚙ menu → "Log in to Claude" / "Log in to Codex" opens a shell with the CLI already started, so non-terminal folks can complete the OAuth flow without knowing any commands (a fully guided wizard is on the collaboration roadmap).
- **Auto-hide taskbar respects the sidebar** — it previously spanned the full viewport width and slid underneath the open sidebar; it (and its reveal hotzone) now inset by the sidebar's live width on the correct side, following opens/closes/resizes with the same animation.
- **Taskbar auto-hide** — `taskbar.visibility`: always visible / auto-hide (slides off-screen, reveals when the pointer touches the edge) / hidden.
- **Right-click customization** — right-click empty taskbar or toolbar space to toggle chrome elements in place (the same settings, one click closer), the pattern desktops and browsers use.
- **Hardening**: a malformed client WebSocket message can no longer crash the server (found when an array reached a string-expecting handler — the whole process died; the dispatch is now isolated per message).
- **Fix**: the new enum settings (positions) rendered as blank dropdowns — options were plain strings where the settings UI expects value/label pairs.
- **Collaboration & remote-session design** ([docs/design-collaboration.md](docs/design-collaboration.md)): multi-host gateway architecture, shared-storage recipes (NFS / JuiceFS-on-S3 / rclone), team memory conventions, cross-host session migration ("a session is one JSONL file"), identity/presence roadmap.

## [2.16.0] — 2026-07-03

### Fixed

- **Chat status bar survives refresh/restart properly.** Two gaps: (1) the context%/cache/usage lookup only scanned the newest 200 records, but hundreds of stdout-only system records (which never dedup against the transcript) sit at the end of the merged history — the scan missed every assistant usage record and the context pie vanished on refresh (scan depth now 2000); (2) the reasoning-effort badge was only kept in memory — now persisted in session metadata (like the permission mode) at create/resume and on every mid-session effort change, so it survives server restarts. Sessions started before this fix show `effort: ?` until their next effort change or recreation (the CLI never reports effort back).
- **Minimap/search jumps no longer drift away ~1.5s after landing.** Re-enabling content-visibility after a jump collapses off-screen elements *asynchronously*; the old one-shot scroll compensation measured before the collapse (and delta-tracking fought the browser's own scroll anchoring — observed scrollTop yanked to 0). The restore now simply replays the landing: re-centers the jump target (or the exact search match range) with the proven multi-frame convergence, skipped if you already scrolled away.
- **Reconnect polish**: while the server is down, each failed 2s retry appended another "Disconnected from server" marker to every chat window — now exactly one Disconnected/Reconnected pair per outage. Reconnect catch-up also clamps its window accounting (server totals can shift across restarts), fixing a drifted position indicator.

### Added (File Explorer overhaul)

- **Archives**: right-click files/folders → **Compress to Archive** (.zip / .tar.gz / .tar / .tar.xz, multi-select supported); double-click a .zip/.tar.* → **contents preview** (entry tree with sizes, filter box, "N files · X MB uncompressed" summary); click an entry inside the archive to open it with the normal viewer (code, images, PDF — extracted on demand, nothing else touched); **Extract Here / Extract to Folder…** on archive files and **Extract All** in the preview (existing files are never overwritten). Folders get **Download as Zip** (streamed, no temp file).
- **Multi-select**: Ctrl/Cmd+click toggles, Shift+click selects a range, Ctrl+A selects all; right-click a selection for bulk Compress / Copy / Cut / Delete.
- **Copy / Cut / Paste**: full clipboard for files and folders (context menu or Ctrl+C/X/V), works **across explorer windows** — cut items show dimmed until pasted; pasting into the same folder auto-renames ("name (copy)"); name conflicts ask once whether to overwrite. Plus one-click **Duplicate**.
- **Background right-click menu**: Paste, New File, New Folder, Select All, Refresh, Copy Path, Properties (previously right-clicking empty space did nothing).
- **Properties dialog**: type, size (recursive for folders via du), item count, modified/created times, permissions — for any file, folder, or the current directory.
- **Keyboard**: Delete key deletes the selection (with confirm); icon view now supports the same right-click menu as list view.

## [2.15.0] — 2026-07-03

### Security

- **Fixed stored XSS in six UI surfaces.** Session working-directory paths (sidebar folder headers), layout-preset names/themes, drag-ghost window titles, the Codex plan badge, and the image-zoom overlay all interpolated user- or peer-controlled strings into `innerHTML` without escaping. Because these values sync across all connected clients, a session in a directory named `<img onerror=…>` (or a maliciously-named preset) could run script in every browser that rendered it. All are now escaped; the image overlay is built by DOM property assignment (defeating the decoded-`data:`-URL escape).
- **Fixed CSS injection via custom-theme keys.** The theme sanitizer only stripped `{}` from values, not keys — a variable named `--x:red} *{…` broke out of the rule to inject arbitrary CSS on every client. Keys are now validated as `--custom-property` names and values reject CSS-breaking chars, on both the client and the server.

### Fixed

- **CRITICAL: sessions spawned by a server that was itself (re)started from inside a Claude Code session silently never persisted their conversations.** The server inherited the parent session's `CLAUDE_CODE_CHILD_SESSION=1` env var and passed it to every CLI it spawned; that single variable puts Claude Code into child-session mode — no lock file, no project transcript. Conversations looked fine live, but terminate + resume (in the WebUI **or** in the CLI itself) lost everything after that point. The server now strips the inherited Claude session env at startup (`CLAUDECODE`, `CLAUDE_CODE_*`, `CLAUDE_EFFORT`, stale `CLAUDE_WEBUI_*`) and, on restart, names any still-running sessions that were spawned poisoned (they stay transcriptless until recreated). Verified end-to-end: terminal conversation → terminate → resume in chat now shows the terminal turns.
- **A session could become permanently un-openable.** Closing a chat/view window while its attach was still in flight (common on huge sessions) leaked the one-time handler and left a phantom session entry, so the window's "focus existing" path returned true forever and the session couldn't be reopened until reload. The attach handlers now drop themselves when the window is gone or the server replies with an error (matching the create path).
- **Scroll-up pagination could lock permanently.** A failed history fetch (e.g. server restart mid-scroll) left the `_loading` flag stuck `true`, blocking all further pagination. Wrapped in try/finally.
- **One buggy handler no longer drops WebSocket messages app-wide.** The client WS dispatch now isolates each handler in try/catch, so a throwing (e.g. disposed) handler can't abort delivery of `layout-sync`/`settings-updated`/`editor-open` to everything after it.
- **Search: pressing Escape right after typing no longer leaves stuck highlights.** The debounced search timer is now cancelled on clear.
- **Jumped-to history browses in both directions.** After jumping into old history, scrolling *down* now seek-loads newer messages continuously (previously only scrolling up worked — downward was a dead end until you clicked "return to latest"). The browse DOM is capped (far-away slabs are dropped and transparently re-loaded when you scroll back), so long browsing stays smooth. A search hit that's already on screen just scrolls to it instead of replacing the view, and the stale position indicator is hidden while browsing history.

## [2.14.0] — 2026-07-02

### Changed

- **Terminal rendering rebuilt on the WebGL renderer.** The old DOM renderer laid rows out with browser-rounded letter spacing while the size calculation used the unrounded cell width — the accumulated fraction is what clipped the rightmost column. WebGL renders device-pixel-aligned cells (integer cell metrics), eliminating that entire class of bugs, and repaints far faster (less TUI flicker). Falls back to the DOM renderer where WebGL is unavailable.
- **No more "terminal smaller than the window" look.** The sub-cell remainder around the character grid is now painted in the terminal theme's own background instead of window-chrome color, so it blends in. Cell metrics also refresh automatically on browser zoom / monitor changes (device-pixel-ratio watcher).
- **Claude Code's flicker-free fullscreen TUI integrated.** New setting Claude → **Terminal TUI renderer**: "Fullscreen (flicker-free)" starts terminal-mode Claude sessions with the alternate-screen renderer + virtualized scrollback (`CLAUDE_CODE_NO_FLICKER=1`, same as `/tui fullscreen`); "Classic" forces the main-screen renderer; "Auto" follows the CLI's own saved preference. The WebUI's scroll-freeze machinery now detects alternate-screen TUIs and writes through instead of queueing frames (correct behavior for the fullscreen renderer, vim, htop, …).
- **Multi-client terminal fixes.** (1) Refreshing a page no longer leaves the terminal garbled: a freshly attached client whose window fits the same size as the PTY got no SIGWINCH, so the TUI never repainted and the client was stuck with a partial buffer replay — the server now nudges the PTY one column down and back on a client's first fit (same trick as dtach's `-r winch`), forcing a clean repaint. (2) When another, smaller client caps the terminal size, the unused area now shows a tmux-style hatched boundary plus a badge ("80×20 — limited by a smaller client") instead of the terminal just being mysteriously small. (3) **Take over from a bigger screen**: the badge has a "Use my size" button that forces the PTY to this window's size (e.g. working outside while a small window at home stays attached) — the smaller client's view is blocked behind a "Resume here" overlay that takes the size back with one click; ownership follows the owner's live resizes and auto-releases when the owner disconnects.
- **Fable's separate weekly limit in usage details.** Anthropic added model-scoped weekly caps (currently Fable); they ride in the usage API's `limits[]` as `weekly_scoped` entries and now show as their own bar ("Fable weekly limit") in the usage popup.
- **5h vs 7d usage distinguishable at a glance.** The taskbar usage pies are now donuts with the window label (5h / 7d) in the hole, instead of two identical circles.
- **Mobile terminal keyboard rebuilt.** The key row grows from 9 to 15 keys: Esc, Tab, ⇧Tab (cycle permission modes), a **sticky Ctrl** (next typed letter becomes Ctrl+letter — soft keyboards have no Ctrl), all four arrows with hold-to-repeat, 📋 **paste** (text *and images*: async Clipboard API on HTTPS, or a long-press paste pad over HTTP that feeds the same pipeline as desktop Ctrl+V), and ^C ^G ^R ^Z ^D ^\. Ctrl+G (split-pane editor) works from the key row.
- **Fixed: switching model left the chat stuck on "thinking…".** The CLI's `set_model` confirmation echo is a user record with no turn behind it; the streaming tracker treated any user record as a turn start and waited forever for a result. Local-command echoes no longer count as turn starts.
- **Change reasoning effort mid-session in chat mode.** The effort badge next to the model is its own dropdown (low/medium/high/xhigh/max + reset). Claude has no documented effort switch in stream-json — `/effort` is blocked non-interactively — but the CLI's own remote transport uses `apply_flag_settings {effortLevel}`, which we verified live changes thinking depth ~9x between max and low and even overrides a spawn-time `--effort` flag. Codex applies it from the next turn (per-turn param). Since Claude never reports effort back, the badge shows the last *commanded* value and its tooltip says so; a fresh chat shows `model: ?` / `effort: ?` until real values exist.
- **Change model mid-session in chat mode.** The model badge in the chat status bar is now a dropdown (like the permission mode): pick any available model or type a custom ID. Claude switches instantly via the stream-json `set_model` control request; Codex applies it from the next turn. The badge shows the model the CLI actually resolved (from its own confirmation echo), not the alias you clicked.
- **Honest model/context display.** The status bar no longer guesses: the model badge always renders — showing the CLI-reported value or an explicit `model: ?` when nothing has been reported yet; the `[1m]` suffix is no longer stripped; and when the context-window size is unknown the bar shows `<used>/?` instead of a percentage computed against an assumed 200k window (which was wrong by 5x on 1M sessions).
- **Clipboard image paste fixed (Linux).** The server trusted the inherited `DISPLAY` blindly — a stale value (e.g. `:99` with no X server behind it) silently broke every xclip call, and under XWayland the compositor's `XAUTHORITY` cookie is also required. The server now probes for a *working* display at startup (all X sockets × all auth cookie candidates) and uses that pair for its own clipboard calls and for spawned sessions. The startup log reports the detected display, or says clipboard paste is unavailable — instead of failing silently.

## [2.13.0] — 2026-07-01

### Changed

- **Huge sessions now scroll like small ones — pure streaming seek, no truncation notice.** Sessions whose transcript is too large to hold in memory (hundreds of MB) previously loaded as a head + tail with a visible "Session history truncated" seam card in the middle, and jumping into the elided middle was unreliable. Now the chat loads the recent tail only and treats the entire earlier history as one continuous virtual scroll: scrolling up transparently seek-loads older messages (by byte offset) all the way back to the first message, with no seam marker and nothing to click.
- **Search and minimap jumps are now precise on any session size.** Every jump (search result, minimap marker) teleports to a slab seek-loaded around the target's absolute file position, then locks onto the exact match with iterative, content-shift-proof centering. This is immune to the index drift that made jumps miss on very large and actively-growing sessions. A "return to latest" affordance (the scroll-to-bottom button) brings you back to the live conversation.
- Full-file search already covered the whole transcript; it now lands correctly on the match instead of near it, and the highlighted result stays highlighted as the view settles.
- **Jumps are fast and land in one click.** The byte-offset index used for seeking now extends incrementally (scanning only newly-appended bytes) instead of re-reading the whole file, so jumps stay ~150ms even while a session is actively being written. Each jump loads a smaller slab, forces stable element heights, and scrolls to the target before the first paint — so it lands exactly centered instead of doing a big scroll, missing, and needing several clicks.
- **Search results are now unmissable.** Jumping to a match scrolls it fully into view even when it's buried inside a long card that has its own scrollbar (code blocks, tool output) — previously the outer list scrolled but the match stayed hidden inside the card. The current match is a solid high-contrast highlight (distinct from the other dimmer hits) and a pulse briefly flashes right on it, so you can tell exactly where it is.
- **Full-file search streams results progressively** (`less`-style). Instead of blocking until the whole (hundreds-of-MB) file is scanned, matches now stream in as they're found: the counter shows a live `N… searching` that climbs and finalizes to the total when done, and the first match is jumped to immediately. The scan reads the file asynchronously so it no longer blocks other requests, and starting a new search cancels the previous one.

## [2.12.0] — 2026-06-28

### Fixed

- **Multi-client sync stability** — operations on one client no longer get undone and replayed by stale echoes from other clients. Layout broadcasts are sequence-stamped (stale ones dropped), clients only re-broadcast state the user actually caused, inbound state is deferred while you're mid-drag, and proportional bounds are quantized so clients with different window sizes converge instead of ping-ponging forever.
- **Window drag performance** — all drag/resize mousemove work (snap highlight, merge hit-tests, preview updates) is now coalesced to once per frame instead of running at raw pointer rate (up to 1000Hz); resizing a terminal no longer re-fits xterm per event. Sidebar session polling pauses in hidden tabs.
- **Font dropdown showed blank** when the stored font matched no option — now shown as "(current)".

### Added / Improved (UX review follow-ups)

- **Folder bulk operations** — right-click a sidebar folder header: archive all stopped sessions at once, new session here, copy path. Folders with >100 sessions and nothing live start collapsed.
- **In-app dialogs everywhere** — every native `prompt/alert/confirm` (rename, group ops, file create/rename/delete, terminate, review targets, theme editor, settings reset, command-mode grid) replaced with themed dialogs (Enter confirms, Esc cancels, destructive actions get a red confirm).
- **Escape closes overlays** — context menus and popovers first, then the open dialog (except while typing in a terminal).
- **Global toasts** — one consistent notification stack; file operation failures now surface instead of failing silently.
- **New Session dialog** — recent working directories as one-click chips; Enter submits.
- **Density & mobile** — thinking blocks are slimmer (runs of consecutive blocks no longer drown content); the mobile chat status bar is one swipeable line instead of wrapping into 2-3 rows.
- **Discoverability** — taskbar items get full-title tooltips (groups list every tab), the cache-ratio badge explains itself, and command mode (`Ctrl+\`) shows its key map while armed.

## [2.11.0] — 2026-06-26

### Added

- **Fork sessions** — fork a chat session into an independent branch that shares the history so far; the original is left untouched. Clicking Fork opens a popup with an editable **Title** and a **first message** (sending that message is what makes the branch actually diverge — the agent mints the fork's new id on its first turn). The chosen title sticks on the window and in the sidebar, even after the fork stops or the page reloads.
- **Fork from any message** — each assistant message in chat shows a fork (GitHub repo-forked) icon next to "open in editor"; it branches a new session truncated to the conversation up to and including that message, then continues from your first message (`claude --resume … --resume-session-at <uuid> --fork-session`).
- **Stacked tab-group taskbar items** — grouping windows into tabs now shows ONE stacked taskbar entry (the unique tab icons offset like a card stack + a count badge) instead of hiding the grouped windows. Click it to expand a list of the tabs and jump to any of them; the active tab's title is shown; right-click acts on the whole group.

### Fixed

- **A Claude fork behaved exactly like a resume** — the WebUI never adopted Claude's stream-json session id, so a forked window shadowed the original and the fork's transcript was orphaned. The chat parser now adopts the fork's new id on its first turn (guarded so a normal resume can't be hijacked).
- **Editor highlight covered the selection** — the current-line highlight hid the selection on the first/last selected line. Suppressed while a selection exists; the fix now also survives the editor losing focus (uses the CodeMirror `editorAttributes` facet instead of a DOM class, which CodeMirror rebuilds on focus change).
- **Splitting a tab out of a group froze the drag** and left the grid snap-preview dashed area stuck — the drag listeners were torn down mid-drag by the tab-bar re-render. They're now scoped per-drag.
- **Editor window/taskbar title now front-truncates** the file path (`…/dir/file.js`) like the file explorer, so the filename stays visible.
- **Office file icons unified** — Excel and PowerPoint now match Word's folded-document look; the Python file icon is the clean official logo.
- **Chat loading spinner no longer freezes under OS "Reduce Motion"** — it pulses instead of stopping, so it still signals activity without the rotation reduced-motion suppresses.

## [2.10.0] — 2026-06-24

### Added

- **Chat file/folder upload** — drag-drop onto a chat (desktop) or a paperclip button → Files/Folder menu (mobile): files/folders are saved into the session's working directory and the path(s) inserted into the input box. Backend-agnostic; reuses `/api/upload`.
- **Colored file-explorer icons** — each file/folder icon is tinted by category (`fic-<category>`: folders amber, images purple, video red, audio cyan, code green, …) so types are distinguishable at a glance.
- **Non-invasive usage monitoring** — usage now comes from the non-billable `GET /api/oauth/usage` with a **read-only** OAuth token (never refreshed). Stops consuming quota to measure quota and stops rotating Claude Code's refresh token, fixing the macOS daily-re-login (#20). Polls ~5 min with 429 backoff + keep-last-known.
- **Cache-busting** — `index.html` is served with `?v=<mtime>` on every local js/css asset + `Cache-Control: no-cache`, so updates land on a normal refresh (no hard-refresh needed).

### Fixed

- **Sidebar jump-to-session** now auto-expands a collapsed/lazy folder before scrolling (previously did nothing when the target was hidden).
- **Sidebar no longer re-renders on every poll** — `startedAt` (an active session's file mtime) was in the change-digest, so the list churned + lost scroll while browsing. Dropped it; scroll position preserved across re-renders.
- **Remaining colorful emoji → SVG** (🎯 goal, ⏳ hourglass, 🪙 budget, ⏸/⛔ goal status, ⚡ cache ratio).
- **Chat drag-upload overlay was permanently visible** — the new overlay toggled a `.hidden` class but this project has no global `.hidden` rule, so it was never hidden. Added the scoped rule; overlay shows on drag, hides on a dragover-idle timer.
- **walter's reports**: URL double-escape of `&` in chat links (#16), and silent resume failure from a 32KB session-meta read truncating past an early large attachment (#18).

## [2.9.0] — 2026-06-22

### Changed

- **Renamed the project to VibeSpace** (was "Claude Code WebUI"). This is a branding change only — the underlying Claude Code / Codex CLIs it manages are unchanged. Display name, page title, console banner, `package.json` name (`vibespace`), default install directory (`~/vibespace`) and the GitHub repo (`github.com/ProblemFactory/vibespace`) all updated.
- **Repositioned as backend-agnostic.** Docs (README, getting-started, docs index, CLAUDE.md overview) no longer center on Claude Code — VibeSpace is a workspace for *any* coding agent / agent-harness CLI, driven through a `BackendAdapter`. Claude Code and Codex are the supported backends out of the box; adding another is a single adapter. The installer now requires **at least one** backend (`claude` and/or `codex`) instead of hard-requiring Claude.

### Migration (seamless for existing installs)

- **No data migration needed.** All persisted state — `data/` (layouts, session metadata, dtach sockets, buffers, drafts, settings), browser `localStorage`, and dtach session sockets (`cw-` prefix unchanged) — is independent of the project name. An in-place `git pull` keeps every session, layout and setting intact.
- **`install.sh` adopts a pre-rename install automatically**: if `~/claude-code-webui` exists and `~/vibespace` doesn't, the installer updates it in place (keeping the folder name and all data) instead of cloning a fresh copy, and points the git remote at the renamed repo. The folder is deliberately **not** renamed — dtach session sockets are bound to absolute paths, so moving the folder would orphan running sessions. Rename the folder yourself later (after stopping the server) if you want it to match.
- GitHub redirects the old repo URL, so a manual `git pull` from an existing clone also keeps working unchanged.

### Added

- **Markdown tables scroll horizontally** (`.chat-table-wrap`): wide tables in chat now scroll instead of overflowing — essential on mobile, where off-screen columns were previously unreachable.

## [2.8.2] — 2026-06-09

### Added

- **Persistent goal entry point in the chat status bar**: a dim 🎯 is always shown when no goal is active — clicking it opens a set-a-goal popup (condition input + "Resume previous"). Active goals show status icon + elapsed + objective as before.
- **Codex status bar parity**: reasoning effort next to the model badge, sandbox policy in the permission tooltip, cumulative session token usage (in/cached/out/reasoning) in the context-pie tooltip, and Codex's plan tool (`update_plan`) now drives the same TODO display above the input that Claude's TodoWrite does.

### Fixed

- **Spontaneous terminal shrink + apparent disconnect mid-use**: `resizeSessionToMin` min'd over all clients while ghost/placeholder entries sat at a hardcoded 120×30 (the attach placeholder, or a subagent View-Log window registered into the parent session). Compounded by no WS heartbeat, so half-open connections lingered. Now only genuinely-fitted terminal clients drive PTY size (`real:true`), subagent viewers never participate (`viewer:true`), a 30s ping/pong heartbeat evicts ghosts, and terminals re-fit on reconnect.
- **Status bar empty until the first reply after resume/attach**: model and context window were derived only from `result.modelUsage` / system-init records, which are stream-json stdout-only and never in the JSONL. Now falls back to `assistant.message.model`, infers the context window from observed usage (>190k ⇒ 1M beta), and restores the permission mode from the session's launch args. Codex unaffected (rollout JSONL carries it natively).
- **Codex resume showed no goal for the whole first turn**: resuming a thread with an active goal auto-continues by Codex design, but the wrapper only emitted a goal event at turn end. It now emits `goal_updated` right after the startup `thread/goal/get`. Replacing an active goal (`/goal B` over A) now also saves A to `_prevGoal` for resume.
- **Codex live token% / rate limits were dead paths**: the `thread/tokenUsage/updated` notification's v2 shape (`{tokenUsage:{total,last,modelContextWindow}}`) was read with nonexistent field names, and rate limits were looked for on the wrong notification — both now parsed correctly (`account/rateLimits/updated` carries the limits).

### Changed

- **Claude `/goal` uses the CLI's native goal mechanism** (parity with Codex; superseded the wrapper simulation + 200-iteration cap from 2.8.0). The CLI's Stop hook drives continuation and met-detection; the server tails the JSONL for `goal_status` attachments (stdout-gap) to sync state. Requires CLI ~2.1.1xx (`/goal` `supportsNonInteractive`).

## [2.8.1] — 2026-06-09

### Changed

- **Claude `/goal` switched to the CLI's native goal mechanism** (parity with Codex). CLI ~2.1.1xx added `supportsNonInteractive` to `/goal`, so it now dispatches as a real command in stream-json (verified live on 2.1.170) — the wrapper forwards `/goal <text>` / `/goal clear` instead of simulating continuation. The CLI's Stop hook drives both auto-continue and **met-detection** (which the simulation never had), so the v2.8.0 200-iteration safety cap is gone — goals terminate when their condition is met, with `reason`/`iterations`/`durationMs`/`tokens` reported.
- `goal_status` attachments are JSONL-only (not emitted on stream-json stdout — same gap class as subagent messages #8262), so the server tails the session JSONL after each turn to sync goal state, broadcasts `Goal met: …` with the hook's reasoning, and writes the cleared state back to the wrapper meta so restarts don't resurrect a finished goal.

## [2.8.0] — 2026-06-09

Full-project code review release: 8 parallel review agents audited every subsystem (server, wrappers, WS/stores, routes, window manager, sidebar, chat UI, viewers, CSS), followed by five fix batches covering ~120 findings.

### Added

- **Fable 5 model tier**: `fable` / `fable[1m]` aliases in all model lists; model discovery switched to `/v1/models` with OAuth Bearer (the bootstrap endpoint's `additional_model_options` now returns null), so new full model IDs appear automatically.
- **Per-session config persistence**: model/effort/permission overrides from the gear popover are now stored in user state (`sessionConfigs`, key `backend:backendSessionId`), synced multi-client, applied by ALL resume paths (card click, resume-all, chat resume bar, layout restore), and surfaced as a purple gear badge on session cards (tooltip shows the full config).
- **Hex viewer**: auto-loads chunks on scroll; offset gutter shows real file offsets after a jump; jump scrolls to its target.
- **Accessibility**: pinch-zoom re-enabled (was `user-scalable=no`), hover-revealed controls visible on touch devices, chat minimap non-interactive on touch, `prefers-reduced-motion` support.
- **Theme system**: per-theme `--accent-fg`/`--magenta`/`--cyan`/`--hover-overlay` variables; hardcoded indigo/green/red follow the theme accent via `color-mix`; Nord/Monokai accent-background buttons now readable; Light-theme scrollbars/hovers visible.

### Fixed (highlights)

- **Claude thinking content rendered empty** — the normalizer read `block.text` but Claude sends `block.thinking`. All thinking blocks now display.
- **Sidebar lazy rendering never fired** — the IntersectionObserver was created *after* `observe()` calls registered on its disconnected predecessor; the Groups tab rendered permanently empty and off-screen folders stayed blank.
- **Codex AskUserQuestion always declined** — questionnaire answers (`toolInput.answers`) never reached the wrapper; the adapter now translates them to `responseData.{decision,answers}`.
- **XSS hardening** — `escHtml` escapes quotes (attribute-context injection); DOMPurify sanitizes all markdown rendering; file paths/error messages escaped in hex viewer, external editor, browser overlay, explorer/editor error cards.
- **Zombie sessions after attach-PTY death** — stale PTY exits no longer null a freshly re-attached PTY or tear down live subagent watchers/normalizer listeners; dead attach PTYs auto-re-attach with bounded retries.
- **Data-loss windows closed** — all persistence JSON writes are atomic (tmp+rename); SyncStores and layouts flush on shutdown; user-state migration no longer POSTs a stale localStorage cache over other devices' changes; CodeEditor/external editor surface write failures instead of reporting "Saved".
- **Window manager leaks** — per-window/per-tab document listeners released on close (previously leaked the full window DOM per close); ChatView removes its settings listeners; `_messages` no longer grows unboundedly with duplicates.
- **Concurrent create cross-wiring** — `create`/`created` correlate via reqId (group resume-all could bind a ChatView to the wrong session); tmux view windows get an openSpec so remote layout-sync stops closing them.
- **Performance** — Codex thread metadata cached by mtime with head-only reads (sidebar polls re-parsed every session file); user-state writes skip the Codex tree scan when no legacy keys exist; Codex history conversion no longer O(n²); taskbar updates in place on focus changes; streaming markdown re-renders coalesce per frame; waiting/find blink animates composited opacity instead of repainting box-shadow; `/api/sessions` gets a 2s response cache.
- **Logic** — WebUI goals re-check state before auto-continuing and cap at 200 turns (paused, resumable); CSV viewer parses quoted fields and estimates totals correctly (large files were capped at ~10k rows); upload names are confined to the destination directory; upload failures no longer record success; goal status icons show for Codex (case mismatch); AskUserQuestion multi-select can't submit empty; ~340 lines of verified dead code/CSS removed (the typo'd notification-card selector now styles correctly).

### Removed

- Dead `/api/session-groups` CRUD routes (7 endpoints, unreachable, conflicting data shape that corrupted state if invoked). Groups remain managed through `/api/user-state`.

## [2.7.0] — 2026-06-02

### Added

- **`/goal` command in chat mode (Claude + Codex)**: set a session-scoped objective the agent auto-continues toward until met.
  - **Claude**: `/goal <text>` sets the goal; wrapper auto-sends a continuation message after each `result` (turn end) so the model keeps working. CLI's own `/goal` (Stop hook) is also detected — `goal_status` attachments in stream-json sync `session._goal`. `/goal`, `/goal clear`, `/goal resume` semantics match the CLI.
  - **Codex**: uses the app-server's **native** goal loop via `thread/goal/set` RPC (objective stored in Codex's SQLite, auto-continues with developer messages). Wrapper queries `thread/goal/get` on startup and after each `turn/completed` to sync authoritative state (`objective`, `status`, `timeUsedSeconds`, `tokensUsed` — note camelCase). Resuming a thread with an active goal auto-continues by Codex design.
  - **Status bar goal indicator**: 🎯 + status icon (▶ active / ⏸ paused / ✓ complete) + elapsed time + truncated objective. Click for popup with full text, elapsed/status, Continue (when not active) and Clear buttons. Elapsed comes from protocol (`timeUsedSeconds`), not a wall clock — updates per turn.
  - Goal state persisted in wrapper meta + session, survives server restart (read in `restoreSessions`), broadcast to all clients via `goal-updated`.
- **Interactive AskUserQuestion UI**: `AskUserQuestion` tool calls (via `control_request` `tool_name === 'AskUserQuestion'`) render as a paginated questionnaire — one question per page with ← → navigation, selectable option cards, a custom-answer input per question, and a Submit enabled only when all are answered. Response uses `approved: true` + `toolInput.answers` keyed by question text.
- **Fork button on session cards**: branches a session from its history. Claude uses `--fork-session`; Codex uses the app-server's `thread/fork` RPC (confirmed to return a new thread with `forkedFromId`). Fork name auto-generated: "Name (forked)", "(forked 2)", etc.
- **Hook event rendering**: `hook_response` → collapsed "✓ Hook: name" card (expand for output); `stop_hook_summary` → "N hooks ran". `hook_started` ignored.
- **CLI command notification cards**: `<command-name>`, `<local-command-stdout>`, `<system-reminder>`, `<task-notification>`, and goal Stop-hook directives render as compact dim notification cards instead of raw XML user messages.

### Fixed

- **Session history lost after server restart**: attach only loaded JSONL when `normalizer.total === 0`, but PTY `processLive` could populate partial buffer data first, skipping the full history (e.g. 4367 messages → 63). Now uses a `_historyLoaded` flag and re-creates the normalizer from full JSONL + buffer on first attach.
- **Duplicate Codex messages from JSONL/buffer overlap**: JSONL records carry an `item_id` that buffer records lack, so `JSON.stringify(payload)` fingerprints differed and dedup failed. Now strips `item_id`/`itemId` before fingerprinting.
- **Resume opening a second window for a terminated conversation**: clicking Resume in the sidebar while a terminated (read-only) window for the same session was still open created a duplicate stuck window. `resumeSession` now closes any window whose `_openSpec.backendSessionId` matches the target before creating the resumed window.
- **File explorer Copy Path over HTTP**: `navigator.clipboard` is undefined in non-HTTPS contexts, so the optional chain silently skipped the fallback. Replaced inline code with the shared `copyText` utility.
- **Codex `apply_patch` Update cards expanded by default**: `renderPatchDiff` had `open` on the diff `<details>`. Now collapsed like other tool cards.

## [2.6.1] — 2026-05-09

### Fixed

- **Mid-stream attach showed `isStreaming: false`**: `_isStreaming` was only set from PTY output (user message echo), causing a timing gap where a second client attaching mid-stream would see the session as idle. Now set to `true` immediately when the server sends `chat-input` to the PTY, before waiting for the round-trip echo. Verified with multi-client sync test.

## [2.6.0] — 2026-05-09

### Added

- **Codex fork history merge**: Codex `thread/resume` always creates a new thread ID (fork by design). Now tracks `forkedFrom` chain on the session: when `backendSessionId` changes, the old ID is appended. `CodexSessionMessages` loads the full chain (oldest → newest) with fingerprint dedup, so resumed sessions show their complete history. Forked-from threads hidden from sidebar to avoid duplicates. Persisted in metadata, survives restarts. Supports multi-level forks (A → B → C).
- **Explicit server-side streaming state**: replaced the fragile heuristic that derived `isStreaming` from normalizer message statuses with an explicit `session._isStreaming` flag. Tracked from deterministic protocol signals: Claude (`result`/`compact_boundary`/`user`), Codex (`task_started`/`task_complete`/`turn_aborted`/`task_failed`). Initialized from wrapper metadata on restore, cleared on exit. Eliminates the race condition where `processLive` created stale streaming entries before `convertHistory` finalized them.

### Fixed

- **`/compact` leaving chat stuck on 'thinking'**: after `/compact`, stream-json emits `user` messages (compact summary) but no `result`, leaving the normalizer with stale streaming assistant messages. `MessageManager._processUser` now calls `_finalizeStreaming` on new user message arrival. Wrapper also treats `compact_boundary` system message as end-of-stream.
- **Stale streaming messages causing permanent 'responding' indicator**: `_finalizeStreaming()` broke at first non-streaming message, leaving interleaved stale ones. Now scans to `role==='user'` boundary. `_deriveTypingLabel` also stops at user messages to ignore stale turns.
- **`isStreaming` in attach response**: was `sm.isStreaming || hasStreamingMsg` — stale wrapper meta overrode normalizer's correct state. Changed to normalizer-first: prefer `hasStreamingMsg` when normalizer has messages, fall back to wrapper meta only when empty.
- **Broken pty stdin false positives**: buffer-growth check failed for opus[1m] (10-30s before first token). Wrapper now writes `_stdin_ack` to stdout immediately on stdin receipt; server checks for ack. Fallback to buffer growth for old wrappers without ack support.

## [2.5.0] — 2026-05-08

### Added

- **View-only fallback on server restart**: when a chat/terminal session's dtach process died (full server/machine restart), layout restore now opens it as view-only (JSONL history + Resume button) instead of silently dropping the window.
- **Auto-detect broken pty stdin**: after server restart, if a chat-input write produces no buffer output within 5s, the pty is re-attached automatically and the message re-sent. Uses buffer growth check (not just meta.streaming) to avoid false positives from slow API responses.

### Changed

- **Folder '+' opens dialog**: clicking '+' on a folder header now opens the New Session dialog with cwd prefilled, instead of immediately creating with defaults.
- **captureState saves cwd**: layout auto-save now persists `cwd` for both terminal and chat windows (needed for view-only fallback).
- **restoreState fetches /api/sessions**: stopped session lookup no longer depends on sidebar._allSessions being loaded (race condition fix).

### Fixed

- **Codex thinking messages lost during/after tool calls**: `_finalizeStreaming()` prematurely cleared `streamingReasoningMessages` map on every new text stream, and `_processReasoningItem()` created duplicates. Now reasoning is only finalized on turn-end events, and finalized items update existing streaming messages in-place.
- **Lazy folder rendering empty folders**: IntersectionObserver only handled `'placeholder'` state, not `'pending'` (initial state for off-screen folders). Folders below the fold never rendered their cards.
- **Broken pty stdin false positive**: previous detection only checked `meta.streaming` which races with debounced meta writes. Now checks buffer length growth as primary signal.
- **Thinking/streaming state not syncing across clients**: `isStreaming` in attach response only read wrapper meta (can lag). Now also checks normalizer messages for `status==='streaming'`. `_reattach()` now calls `_syncTypingIndicator()` after fetching missed messages.

## [2.4.0] — 2026-04-25

### Added

- **Mobile UI overhaul**: comprehensive responsive redesign tested on Pixel 10 Pro XL via ADB.
  - **Two-level sidebar navigation**: folder list (level 1) → session list (level 2) with back button. Replaces the single giant scrollable list (~1600 DOM nodes → ~20). Both Folders and Groups tabs use this pattern.
  - **Window switcher**: tap the nav bar title to see all open windows, switch or close them. Includes desktop tabs when 2+ virtual desktops exist (tap to switch desktop, list updates in-place).
  - **Close button** (✕) in nav bar to close the active window. Auto-focuses the most recently used window after closing.
  - **Image upload button** in chat input area (mobile only) — opens system file picker for images since Ctrl+V paste isn't available on mobile.
  - **Edge swipe gesture**: swipe right from left edge opens sidebar, swipe left closes it.
  - **Folder/group icons**: folder 📁 and people 👥 SVG icons on mobile navigation cards.
  - **Lazy folder rendering**: IntersectionObserver defers rendering session cards until their folder group enters viewport (desktop optimization too).
- **Effort combobox**: effort setting (both global and per-session) now has "Custom..." option for typing values like `xhigh` that the CLI may not list but models support.
- **Per-session config Custom...**: all three rows (Model, Effort, Permission) in the per-session config popover now support free-form Custom... input, not just Model.
- **Auto-detect effort levels**: server parses `--effort` options from `claude --help` and serves via `GET /api/session-options`. Frontend updates dropdowns dynamically.

### Changed

- **Mobile architecture split**: extracted `mobile-nav.js` (MobileNav class) and `sidebar-render-mobile.js` (mixin) from app.js and sidebar-render.js. Centralized `app.isMobile` flag replaces scattered `matchMedia` checks.
- **Mobile CSS**: `100dvh` for keyboard-aware layout, sticky nav bar, full-screen fixed sidebar (z-index 90000), larger touch targets (32-44px), 16px font in chat input, rounded input corners, folder path middle-truncation.
- **Mobile link handling**: tap opens directly (file viewer / new tab) instead of copying. Desktop Ctrl+click behavior unchanged.

### Fixed

- **Background tasks accumulating** (40+ stale "running" tasks in status bar): stream-json rarely emits `task_notification` for background Bash commands. Now tasks are deleted from wrapper meta on completion, and command-type tasks are cleaned up on turn end (`result` message).
- **Mobile nav bar not showing**: CSS source order issue — `#mobile-nav { display:none }` defined after `@media` block.
- **Mobile sidebar behind windows**: z-index 1000 vs window z-index 5000+.
- **Star/archive icons too small on mobile**: inline `style="width:12px"` overridden with `!important`.
- **Filter buttons not toggleable on mobile**: re-click created new popover instead of closing.
- **Groups tab empty on mobile**: wrong `_getGroupSessions` call signature.
- **Drill-down reset on session click**: `_render()` lost drill-down state. Fixed with `_mobileDrilldown` state tracking.
- **No focus transfer after closing window**: closed active window left blank screen on mobile.

## [2.3.0] — 2026-04-22

### Added

- **Per-session model/effort/permission config**: Gear button (⚙) in the Resume split button group opens a popover with Model, Effort, and Permission overrides. Each row has a checkbox — unchecked = greyed out (use global default), checked = per-session override active. Model supports "Custom..." for specific model IDs. Overrides are passed to `claude --resume --model X --effort Y --permission-mode Z`.
- **"Not logged in" detection + login helper**: When a session exits because the CLI's OAuth token expired, the chat window shows a dedicated login bar with "Open Login Terminal" (opens a terminal to run `/login`) and "Retry" buttons, instead of a blank read-only window.

### Fixed

- **Session config was inline panel taking too much space**: Changed to a compact popover anchored to a gear button.
- **Config gear icon was a sun**: Replaced with actual gear SVG.

## [2.2.1] — 2026-04-20

### Fixed

- **Resume/new session broken on older Claude CLI**: Claude Code <2.1.98 doesn't support `--name`, causing immediate exit code 1 and read-only window. Server now parses `claude --help` at startup to detect supported flags and only passes `--name` when available.
- **Startup banner showed hardcoded "v2.0"**: Now reads version from package.json dynamically.

## [2.2.0] — 2026-04-18

### Added

- **Upload redesign**: Upload button now opens a Chrome-style popover menu with "Upload Files", "Upload Folder" (webkitdirectory), upload history list (last 10, click to reopen), and "Clear History". Active uploads show with spinner + cancel in the menu.
- **Inline upload progress**: Uploading files appear as real file-list rows with a Mac Finder-style progress bar (accent fill in the size column area), percentage label, and cancel button. Survives folder navigation — rows re-render via `_renderItems`.
- **Upload button ring progress**: SVG circle ring on the upload button fills during active uploads (Chrome download-button style). Hidden when idle.
- **Upload history persistence**: Stored via SyncStore `uploads` — persisted to disk, broadcast to all clients in real-time.
- **Folder upload**: `webkitdirectory` input preserves relative paths; server creates nested directories via `mkdirSync({recursive: true})`.
- **Combobox model selector**: Model settings now show a dropdown of known aliases plus a "Custom..." option that reveals a text input for typing specific model IDs (e.g. `claude-opus-4-6-20250414`). Works for both Claude and Codex.
- **Opus and WMA audio formats** added to file type registry.
- **Path-based file serving route**: `GET /api/file/serve/*` maps URL paths to filesystem paths, enabling `<base href>` for HTML preview.

### Changed

- **OAuth token auto-refresh**: Server stores full OAuth credentials (accessToken + refreshToken + expiresAt). Expired tokens are automatically refreshed via `platform.claude.com/v1/oauth/token` using the same client_id as Claude Code. Both model discovery and rate limit polling use the async token getter.
- **Model discovery via bootstrap API**: OAuth users now fetch models from `/api/claude_cli/bootstrap` (supports OAuth, same endpoint Claude Code uses) instead of `/v1/models` (API key only). Falls back to `ANTHROPIC_API_KEY` + `/v1/models` when OAuth unavailable.
- **HTML preview uses `<base href>` + `allow-same-origin`**: Relative paths (CSS, images, fonts, JS) now resolve correctly via the path-based serve route. Live editing still works via srcdoc.
- **HTML preview re-renders on resize**: ResizeObserver triggers debounced srcdoc rewrite so JS-computed layouts recalculate at new dimensions.
- **Popover/context menu viewport clamping**: All popovers and context menus now check bounds after render and nudge back on-screen if clipped by viewport edges.

### Fixed

- **Upload progress bar not filling**: Fill element was `display:inline` (span default) — width/height had no visual effect. Fixed with `display:block`.
- **Upload popover had no background**: Missing `background/border/box-shadow` CSS.

## [2.1.0] — 2026-04-16

### Added

- **Resume button on read-only chat windows**: every read-only ChatView (view-history, terminated, exited) now shows a "Resume this session" button in place of the input area. Click resumes via `app.resumeSession()` and closes the read-only window — unifies the three read-only scenarios so users never have to go back to the sidebar just to continue chatting. Subagent viewers (`sub-*`) are excluded since they can't be resumed.
- **Tab drag-out merge**: dragging a tab out of a tabbed window can now merge into another window's tab bar or icon (including the original group), in addition to becoming standalone.
- **Shared tab-merge hit-test helper** (`_detectTabMergeTarget` on tab-group mixin): unifies window.js titleBar drag, icon drag, and tab drag-out. All three use `elementFromPoint` (not `getBoundingClientRect`) so occluded icons never match.
- **Stacked Workspaces app icon**: replaced the ⚡ emoji favicon + loading splash with a custom SVG — three layered window rectangles (representing virtual desktops) with mini tiled window thumbnails in the front pane, using the brand indigo gradient.
- **CHANGELOG.md**: this file. Past changes are best tracked via `git log` and CLAUDE.md's "Bug Fixes Applied" section.

### Changed

- **Interrupt uses delayed-fallback instead of dual-interrupt**: sending Stop now issues the `control_request` interrupt immediately and schedules SIGINT 2 seconds later. Before firing, the wrapper meta is re-read — if `streaming:false`, SIGINT is skipped. Sending a new chat message during the window also cancels the pending SIGINT. Avoids the "Stop kills the whole session" problem in newer Claude Code versions that exit on SIGINT instead of just interrupting the turn. Historical SIGINT was kept as a safety net for bugs #17466 and #3455; the delayed approach keeps the safety net without its side effects.
- **Tab drag-out follows titleBar-drag pattern for merge zones**: the detached window itself acts as the cursor-following preview in empty space (with snap highlights). Entering a tab merge zone collapses it to a small `.tab-ghost` preview (window `display:none`). Leaving restores the window. Previously the detached window stayed visible while merge target was indicated only via `.tab-drop-target` — confusing, since it wasn't clear merging would occur.
- **Icon drag auto-hides source window**: source window is set to `visibility:hidden` once drag threshold is crossed, since the ghost represents it. Restored on mouseup.
- **Detached tab window raised to front**: calling `focusWindow` right after `_detachFromChain` so the cursor-following preview is never hidden behind the original chain host or other windows.
- **Version bump**: 2.0.0 → 2.1.0 (minor: new user-visible features, all backward-compatible).

### Fixed

- **Dragging a window's icon onto itself made the window disappear**. Root cause: `getBoundingClientRect`-based hit-test matched a stacked window underneath whose iconSpan rect happened to overlap the cursor. Fixed via the new `_detectTabMergeTarget` helper (uses `elementFromPoint`, skips the dragged element).
- **Hit-test on tab bar drops never worked**: window.js queried `.tab-bar` (wrong class — actual is `.tab-bar-tabs`). Now works.
- **Tab drag-out mini preview invisible when hovering the original tabbed window**: the detached window was being hidden on merge-target hover, but it *was* the preview. Restored window + swapped to titleBar-drag pattern (hide only when a ghost takes over).

### Notes for future changelogs

- Keep entries user-visible and short. One-liners are fine.
- For internal refactors without behavior change, use a single line under "Changed" — readers can always check `git log` for commit-level detail.
- CLAUDE.md's "Bug Fixes Applied" is the authoritative long-form technical log; CHANGELOG is for release notes.

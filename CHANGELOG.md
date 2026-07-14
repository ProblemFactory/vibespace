# Changelog

## 2.135.4 — 2026-07-14
- **One Google Drive, no more "rclone version vs native version"** (user request): every `rclone`-backend-`drive` mount (rclone.conf import / custom-added) is now MIGRATED to the native `drive` type on load — its client/token/scope/folder carried over from the raw params into the first-class fields, any non-drive tuning params preserved as extra options. rclone.conf import and custom-add both normalize a `drive` backend to the native type up front. The rclone-drive-specific edit/submount UI branches are retired — there is a single Drive concept and code path. Migration is idempotent and lossless (guarded by a one-time marker).

## 2.135.3 — 2026-07-14
- **rclone-backed Google Drive mounts are now first-class Drives** (real report: an imported/custom `drive` rclone remote had an incomplete edit dialog — no OAuth client picker, and its submounts had no cloud-side source): a mount whose rclone backend is `drive` now gets the SAME controls as a native Drive record — OAuth client preset picker, cloud-side scope (My Drive / Shared with me / Shared drive), the **List shared drives** picker, and single-folder `root_folder_id` — in both the edit dialog and the "New submount" dialog. Existing records migrate transparently (the scope is inferred from the stored rclone params, then edited via the friendly fields which take over). Preset selection resolves to the instance's env clients, so the secret never lands in the record.

## 2.135.2 — 2026-07-14
- Fixed the Gmail edit dialog showing a blank (placeholder 200) after you saved "Messages to sync = 0": zero is a valid value (= everything) but was treated as empty, so it round-tripped to blank on reopen. It now prefills 0 correctly.

## 2.135.1 — 2026-07-14
- **Edit dialogs now actually show the stored Drive/Gmail settings** (real report: "why does my OAuth client say custom?" — the config endpoint the edit dialog reads never included the drive scope fields or ANY gmail fields, so every select fell back to its default no matter what was stored; an earlier fix had landed in the config-BUNDLE exporter instead). Cloud-side scope, shared-drive id, OAuth preset, sync count, labels, grouping — all prefill correctly now, for submounts too.
- **Changing a Gmail mount's sync scope (labels filter / query / message count) now forces a reseed**: the persisted history cursor kept the sync incremental, so newly-in-scope OLD mail (e.g. clearing the INBOX filter to pull archived mail) never arrived. The reseed is cheap — the directory is the dedup index, existing files are skipped.

## 2.135.0 — 2026-07-14
- **Gmail can now sync the WHOLE mailbox** (user report "why only 981?" — the default INBOX label filter was the cap; archived mail carries no INBOX label and spam/trash are API-excluded by default): the labels filter now defaults to EMPTY = everything (archived + spam/trash included), and **Messages to sync = 0 means everything** (hard cap 200k, quota-paced with the live card progress).
- **Label-folder layouts**: new "By label, then month/day" grouping files each mail under `Inbox/ Archive/ Sent/ Spam/ Trash/ Drafts/` (Gmail's own precedence — "archived" = not in the inbox) with date folders inside. Default for new Gmail mounts.
- **Labels picker**: "List labels" in the add AND edit dialogs pulls the account's real labels (system + user) — click to build the comma filter, no more guessing label ids.
- **Edit dialogs de-text-boxed across storage types**: OAuth client preset and Gmail folder-grouping are real dropdowns, big JSON tokens moved to textareas, WebDAV vendor became an editable select (it wasn't even patchable server-side before).

## 2.134.4 — 2026-07-14
- **Submounts are now the first-class way to attach Shared Drives / shared-with-me** (user insight — that's where zero-reauth lives: ONE authorized Google credential, N children each pointing at a different cloud-side scope): the "New submount" dialog under a Drive connection gets the **List shared drives** picker (over the parent's stored credentials, no token pasting), scope-conditional fields (the Shared-drive row only shows for that scope), and the single-shared-folder **Folder ID** field.

## 2.134.3 — 2026-07-14
- **Shared-drive picker items now actually apply on click** (real report: "clicking a listed drive does nothing") — the menu items used the wrong callback key for showContextMenu (`onClick` instead of `action`), so selecting a drive threw silently.
- **Editing an EXISTING Google Drive mount can now really change the cloud-side scope** (real report): the edit dialog's scope field was a raw text input demanding magic strings — it's a proper My Drive / Shared with me / Shared drive dropdown now, and the edit dialog gained the same **List shared drives** picker as the add dialog (works for submounts too, resolving credentials through the parent). Saving still auto-reconnects the mount with the new settings.

## 2.134.2 — 2026-07-14
- **Fixed "undefined" painted over every .eml filename** in the file explorer (real report): the .eml registration referenced a FILE_ICONS key that doesn't exist, so the literal string "undefined" rendered into the icon slot. Emails now get a proper envelope icon.
- **Gmail sync progress count no longer truncates** ("53/979…" — the label now never ellipsizes; the bar shrinks instead).
- **Date grouping option for Gmail mounts** (user request — a flat directory with 10^5+ emails hurts every file tool): synced mail lands in `YYYY-MM/` (default for new mounts) or `YYYY-MM-DD/` subfolders, or flat. Dedup spans subfolders and pre-grouping flat files, so switching it on mid-life re-downloads nothing; existing mounts keep their current flat layout unless edited.

## 2.134.1 — 2026-07-14
- Gmail storage cards now say what they ARE (a sync, not a live mount) and show it live: a **progress bar on the card** while a pass downloads ("Syncing 37/200…", server broadcasts throttled updates as it moves), an indeterminate shimmer while checking for new mail, and "Synced — N emails · time · account" when idle; stopping the sync says the synced emails stay. The add dialog states the sync semantics up front.

## 2.134.0 — 2026-07-14
- **Gmail as a folder** (new mount type): connect a Gmail account (guided sign-in, no terminal; uses the instance's preset OAuth clients or a custom one — gmail.readonly scope) and the newest N messages (+ everything new, incrementally) sync into the mount folder as `.eml` files — open them in the new built-in **email viewer** (subject/from/date card, text↔HTML toggle with the HTML part fully sandboxed, attachment downloads). Read-only archive by design: unmounting stops the sync but keeps the files; deletions in Gmail never delete files. Filters: label list and a full Gmail search query. Engine deliberately NOT a filesystem mount — sync-to-folder is the proven design (GYB); the directory itself is the dedup index (message id in the filename), so state can never drift.
- **Dynamic-desktop fixes** (two user-reproduced bugs): ① activating a stage hero no longer paints a phantom window at the SLOT position on its home desktop's preview (previews now draw staged windows at their home geometry); ② a session card's **GoTo** while the stage is active now materializes the window as the hero instead of switching desktops out from under the stage (which left the preview stuck on the stage while the actual desktop changed).

## 2.133.0 — 2026-07-14
- **Preset Google OAuth clients** (e.g. one Internal client per organization + one published-external for everyone else): `VIBESPACE_GDRIVE_CLIENTS` env (JSON `[{key,label,clientId,clientSecret},…]`, helm `gdrive.clients`) injects instance-preset clients; the Drive add-dialog gets an **OAuth client picker** (presets / rclone built-in / custom id+secret), a mount stores only the preset KEY — secrets never persist app-side and rotating the env rotates every mount. Authorize flow, shared-drive lister, and re-auth all resolve presets. Legacy single `VIBESPACE_GDRIVE_CLIENT_ID/SECRET` still works as the `default` preset.

## 2.132.0 — 2026-07-14
- **Manager-agent Task Group administration** (issue #21, walter's majordomo flow): a session the user designates as **Group manager** (new toggle in Session Properties) can create and configure Task Groups from its CLI — `vibespace-task group-list / group-create / group-update / group-bind / group-unbind`. Double-gated and off by default (new setting **"Allow agents to manage Task Groups"** must ALSO be on); contextDir/auto-include paths are restricted to allowlisted roots (setting, default = home); every operation lands in the group's activity log attributed to the acting session, so the board shows exactly what the majordomo did. Organize-only by design: no delete, no spawning, no agent-loop control — the same config operations the user performs in the UI. Route `/api/agent/group-admin`; smoke test scripts/test-group-admin.mjs.

## 2.131.0 — 2026-07-14
- **Google Drive mounts can now target "Shared with me" and Shared Drives** (user request): every Drive mount (and every SUBMOUNT — each runs its own rclone daemon, so children under one credential can each pick a different scope) gets a **Cloud-side scope** selector (My Drive / Shared with me / Shared drive), a Shared-Drive picker (**List shared drives** button → `rclone backend drives` server-side), and an advanced **Folder ID** field — the confirmed pattern for mounting ONE folder someone shared with you (`root_folder_id`; it deliberately wins over the shared-with-me flag, which rclone guidance says must not be combined with it).
- **Instance-default Google OAuth client** (`VIBESPACE_GDRIVE_CLIENT_ID`/`_SECRET`, helm `gdrive.clientId/clientSecret`): admin-injected via env, used by Drive authorize + mounts whenever the user doesn't supply their own client, never persisted in instance data. Timely: Google is retiring rclone's shared client during 2026, so a default client stops every user needing their own GCP project.

## 2.130.0 — 2026-07-13
- **`vibespace-task backlog-edit <id|#|text> [--text …] [--detail …]`** (agent CLI + `/api/agent/task-backlog` `edit` verb): edit a parked backlog item IN PLACE — the stable `B-xxxx` id stays, so references elsewhere (docs, memory, other agents' notes) survive and the change surfaces to claimants as a "reworded" diff, not a drop+new-id churn. `--detail ""` (or `-`) clears the detail. Fills a real gap: agents previously could only drop+re-add to change an item, minting a fresh id and orphaning every reference (the B-55e2→B-5052 churn that motivated this).
- **Onboarding/Manage-Agents guided login terminal no longer clipped on the right** (real report — the "Log in to Claude Code" modal cut off the auth URL and status text): the width was a `min-width` on the dialog BODY, but `.dialog` is a fixed `width:440px; overflow:hidden`, so the wider body (and the terminal box inside it) overflowed and got clipped at the dialog edge. Width now sits on the dialog itself (`min(760px, 94vw)`, the same pattern the accounts dialog uses); the status line wraps instead of overflowing.

## 2.129.1 — 2026-07-13
- Creating a **Codex CHAT session on a remote host now fails fast with an honest error** instead of silently spawning a broken session (the remote-chat branch force-appends claude stream-json flags — into codex argv they just killed the spawn opaquely). Terminal mode on the host and local codex chat are unaffected; full remote codex chat support stays parked (backlog B-0588 — needs the keeper/offset machinery in the codex wrapper + remote thread discovery).

## 2.129.0 — 2026-07-13
- **Manage Agents shows the VibeSpace footprint on a remote host** (transparency follow-up to the 2.126.0 argv incident, backlog B-34bb): selecting a machine now renders a "VibeSpace integration on <host>" row — per-tool state under `~/.vibespace/bin` compared against the LOCAL copies by content hash (current / outdated / absent; per-tool detail in the tooltip), hook registration in the HOST's own Claude/Codex configs, node availability, and keeper session files — with explicit **Install/Reinstall** (same tar-over-stdin channel the per-spawn distribution uses; registers the hook) and a danger-confirmed **Remove** (unregisters ONLY our hook entry from the host's CLI configs via the register script's new `--uninstall` mode, then deletes exactly our tool files; per-session token files are left alone). The row says plainly that creating a remote session re-installs everything automatically (per-spawn distribution is the zero-drift design). Probe is one read-only ssh round trip (`GET /api/hosts/:id/agent-tools`); verified live: outdated detection → install → uninstall (both harnesses' hooks cleanly unregistered, foreign hooks untouched) → reinstall.

## 2.128.0 — 2026-07-13
- Usage window: remote hosts moved OUT of the Account chips into their own **Device** filter row (user directive — hosts are devices, not accounts): All / This machine / each remote host, gating the ENTIRE view (totals, panels, breakdowns) top-level via a new `host` param on /api/usage-stats. Selecting a remote device hides the local Account row (its usage is the host's own login); host buckets no longer appear as account chips. Host rows in the ledger's host dimension now carry the device's display name.

## 2.127.0 — 2026-07-13
- **Usage now covers remote hosts** (v1, claude transcripts): opening the Usage window kicks an incremental ledger HARVEST over ssh — a scanner ships to each host (stdin, never argv), walks its `~/.claude/projects` with remote-side byte cursors, and returns per-request NDJSON events that merge into the local ledger as a per-host bucket (`atype:'host'`, billing category `remote-host`, labeled with the host's name). The window's existing Account chips then switch to the host like any other account; server-throttled 15min/host, first pass scans everything, later passes only新增. Host events keep their baked attribution (the local attribution log knows nothing about remote sids and used to re-bucket them to global — guarded). Interrupted transfers lose nothing: the remote cursor only advances after a fully flushed send, and rid-dedup absorbs re-emissions.
- **The quota popup gets a "Remote hosts" section**: each configured host's OWN login quota (5h/7d bars + reset times), fetched ONLY by the per-host ⟳ — a single human-gated request using the host's own login token read over ssh (READ-ONLY, never refreshed — §ban-safety; hosts with no/expired token get an honest "log in / run claude there first"). Snapshots persist in `data/usage-cache/host-<id>.json`.

## 2.126.0 — 2026-07-13
- **SECURITY / hygiene: remote spawns no longer put secrets or blobs in the command line.** The remote-session prelude used to inline ~300KB of base64 tool blobs AND the per-session `vsst_` token into the ssh inner command — argv is world-readable via /proc/cmdline on the remote host, so any local user could `ps` the token and impersonate the agent through the reverse tunnel (and the wall of base64 looked outright alarming — real user report). Now the tools + token ship over ssh STDIN as one tar stream into `~/.vibespace/bin` (token = 0600 dotfile, removed at kill), and the inner command references the token via a `VAR="$(cat …)"` shell prefix assignment — the same never-in-argv rule the account-key path has always followed. The visible remote process line is now a short PATH/hook-register prelude.
- i18n dictionaries rebuilt deduplicated (duplicate keys accumulated by earlier bulk merges caused esbuild warnings in every self-update log; last-occurrence values kept — identical runtime behavior).

## 2.125.1 — 2026-07-13
- Fixed (for real this time) searching a remote session by id showing "No sessions": the sidebar's zero-local-matches empty-state RETURNED before the workbench ever rendered — the 2.124.0 remote-search fixes lived downstream of that return and were unreachable whenever the query matched nothing local (exactly the session-id case). With a search active the workbench now always renders (selected-host zone without the 7-day cutoff + cross-host Remote matches). Applies to desktop and the mobile sidebar alike (both share the workbench).

## 2.125.0 — 2026-07-13
- **SSH connection reuse (ControlMaster)** for every short-lived per-op ssh (remote discovery, remote file browsing, transcript fetch, rsync): the first op pays the handshake, the next ~10 minutes ride a persisted shared master — per-op latency drops from ~1s to tens of ms and auth storms disappear. Deliberately NOT applied to session pipes (a session becoming the master would couple unrelated sessions to its lifetime). Masters live under a short per-uid tmp dir (`/tmp/vs-cm-<uid>/`) — the deep data-dir path overflowed the ~104-char unix-socket limit on the first attempt.
- **Reconnect state is visible**: while a remote chat session's ssh pipe is down, the chat status bar shows a pulsing amber "⟳ host reconnecting (n)…" chip (tooltip explains the session keeps running on the host); it clears the moment bytes flow again. Rides a `_remote_state` line from the wrapper → `remote-state` WS broadcast + the attach payload (survives refresh).
- codex remote chat (through the same keeper) parked in the backlog — the path was never wired for codex; 2.124.0 covers claude.
## 2.124.0 — 2026-07-13
- **Remote session stability overhaul** (user directive — the "remote chat goes blank on an ssh blip" class; a full C/S rearchitecture is parked in the backlog, this is the resilient transitional layer):
  - **Remote CHAT sessions now persist on the host, independent of ssh** (`data/bin/vibespace-remote-keeper`, distributed to `~/.vibespace/bin` like the other tools): claude runs DETACHED (setsid) under a keeper daemon — stdout appends to a buffer file, stdin arrives via a unix socket. An ssh drop kills only the pipe; the local chat-wrapper reconnects with backoff (1s→30s), substituting the byte offset it has consumed, and the keeper replays exactly the missed bytes. Input typed while disconnected is queued and flushed after reconnect. The session ends only when claude itself exits on the host (a `_remote_exit` sentinel travels through the buffer; the keeper never restarts an exited session). Verified live against a real host: ssh SIGKILL'd mid-session → remote process survived → offset reattach with zero replay → clean exit sentinel.
  - **SSH keepalive everywhere** (`ServerAliveInterval=15`, `CountMax=4`, `TCPKeepAlive`): half-open pipes from silent network drops now die within ~60s so the reconnect layers can act — previously they lingered for the whole TCP timeout looking "alive".
  - **Remote TERMINAL sessions auto-reconnect too**: pty-wrapper respawns a non-zero-exit ssh with backoff (the remote `dtach -A` reattaches the surviving CLI); a yellow "[vibespace] connection lost — reconnecting…" line shows in the terminal. Clean exit 0 still ends the session.
  - **Kill really kills**: terminating a remote chat session now also stops the keeper + claude on the host (best-effort ssh stop).
  - **Discovery state sync**: remote session discovery results persist to disk (`data/remote-sessions-cache.json`) — after a reload or while a host is unreachable the sidebar shows the last-known list (marked stale) instead of an empty zone; the per-host cache is invalidated right after a remote create/kill so the list updates on the next poll instead of after the TTL.
  - **Parity fix (sidebar search)**: searching now covers EVERYTHING on the selected host — the Recent zone's 7-day cutoff hid older remote sessions from an id search, and the cross-host "Remote matches" section deliberately skips the selected host, so those sessions were findable nowhere. (History zone suppresses the would-be duplicates while searching.)
## 2.123.1 — 2026-07-13
- Claiming a backlog item now WARNS about co-claimants (user question surfaced the gap): the claim ack echoes the item and lists the OTHER sessions already holding it — the CLI prints "note: ALSO claimed by … — coordinate to avoid duplicate work"; re-claiming your own item says so instead of silently succeeding. (Multiple simultaneous claims are by design — that's the two-sessions-take-one-item flow; the resolution notification reaches every claimant.)
## 2.123.0 — 2026-07-13
- Backlog **claim model** (user directive, same day as 2.122.0): every item now has a **stable short id** (`B-xxxx`) and a `claimedBy` list of sessions. Parking an item auto-claims it. **Change notifications are TARGETED**: a backlog event (parked/resolved/dropped/claimed/unclaimed/reworded/removed) is injected only into sessions that **created or claimed** that item — e.g. two sessions claim one item, one resolves it, the other is notified; everyone else keeps just the one-line count pointer. The injected reminder block is now "items CLAIMED by this session" (was "parked by"). The id is designed to travel: **click it in the viewer to copy**, paste it to ANY agent of the group ("看一下 backlog B-ab12") — that agent runs `vibespace-task backlog B-ab12` to see the full item (creator, claimants, detail — works for resolved items too) and `backlog-claim B-ab12` to take it. New CLI: `backlog <id|#|text>` (show one), `backlog-claim`, `backlog-unclaim`; all refs accept id / open-list number / unique text. Viewer upgrades: id chip (copy on click), claimants shown per item with per-claim remove ×, "unclaimed" marker, parked/resolved attribution retained; task-detail rows get the id chip + claim tooltip. Diff matching switched from occurrence-indexed text to the stable ids (text edits now read as "reworded" instead of REMOVED+NEW). Ids round-trip through repo-file export/import (`- [ ] [B-xxxx] text`) and config bundles; existing items get ids + creator-auto-claims backfilled once at boot.
## 2.122.0 — 2026-07-13
- Task Group **Backlog** (user decision, replacing yesterday's removed checklist with a DIFFERENT concept): the group's parking lot for **non-immediate** items — decisions the user deferred ("以后再说/等我决定"), work they said comes later. Explicitly NOT agent work steps (those stay on each session's own todo/Steps). Items carry status open/done/dropped + who parked/resolved them. Agents get `vibespace-task backlog` (list) / `backlog-add "item" [--detail]` / `backlog-done <n|text>` / `backlog-drop`, and are taught to park items when the user defers something and to never start parked items unasked. **Injection is summary-only (user directive): the hook never dumps the backlog** — a session sees a short reminder block for the open items IT parked (so it re-surfaces them to the user), plus a single "N open parked items — `vibespace-task backlog`" pointer line otherwise; backlog CHANGES ride the normal diff updates as one-line events (PARKED/RESOLVED/DROPPED, occurrence-indexed like the retired checklist diff). Full backlog lives in TASK.md, `show`, and the UI: a Backlog section in task-detail (open items + ✓ done / ⊘ drop / park input) and a Backlog tab in the log viewer (status filter, attribution chips, inline edit, reopen). Repo-file export/import round-trips it (`- [ ]`/`- [x]`/`- [-]`). One-time migration: the 2.121.0-dormant checklist's UNCHECKED items seed the backlog as open items (checked history stays dormant).
## 2.121.0 — 2026-07-13
- REMOVED: the Task Group checklist/backlog (user decision — a group-level backlog never made sense: agents don't care about other agents' backlogs; work items live at the SESSION level, i.e. the agent's own native todo list already surfaced as each card's Steps). Cut across every surface: the task-detail Checklist section, the log viewer's Checklist tab (now a pure Activity-log viewer), the `vibespace-task plan-check/plan-uncheck/plan-add` subcommands (now print a redirect; the server answers old CLI copies — e.g. on remote hosts — with 410 + guidance), the injected context's Checklist section + `plan-check` teaching line, the diff-update's Checklist deltas, TASK.md, and repo-file export. Legacy `## Checklist`/`## Plan` sections in existing exported files are still recognized as section stops on import (content dropped). Stored `plan` arrays are kept DORMANT in data/task-groups.json — nothing is destroyed, the data is just never rendered or written again; config-bundle import passes it through.
## 2.120.0 — 2026-07-13
- Injected activity log: per-entry char cap so one very long progress note can't starve the rest (user directive). Three layers now: at most 12 newest entries, each note truncated to 200 chars (overflow flagged † and recoverable via `show --full`), then the byte budget, then the route's final 9600-byte inline hard-cap. Result: you see MORE history lines rather than a couple of long ones eating the whole budget. Applied to both the full-context and the diff-update activity rendering. (The per-entry truncation uses a clean char slice — an earlier word-boundary regex gutted CJK notes, which have no spaces.)
## 2.119.0 — 2026-07-13
- Agent context injection now stays INLINE: the prompt-context route hard-caps the final `additionalContext` at 9600 bytes. Binary-search established that Claude Code wraps a hook's additionalContext into a `<persisted-output>` 2KB-preview + on-disk file at EXACTLY 10240 bytes (10 KiB) — below that it's fully in the model's context, at/above it the agent must Read a file (the 2.68.0 "never learned the tools" failure mode). The cap tail-truncates the oldest activity-log lines at a UTF-8-safe newline boundary and appends a `vibespace-task show --full` pointer, so the tools-first head is always inline and nothing critical is lost. (Corrects the old "~2KB truncation" belief — there was never a 2KB cap.)
## 2.118.0 — 2026-07-13
- Blank-window telemetry: the chat view now emits diagnostic events for the un-debuggable "session window blank" class — `chat-view-blank-with-content` (server reports the session has messages but nothing rendered), `chat-view-blank-persistent` (a deferred 2.5s check finds the DOM still empty despite claimed content), and `chat-attach-failed` (attach errored → read-only). Each carries NON-CONTENT debug context only (backend, local-vs-remote + host, read-only/streaming/ws-off flags, window bounds, session id — never message text), so a user's "it went blank" report arrives with enough to reproduce. Surfaces in the admin Investigate/breakdown by event name.
## 2.117.0 — 2026-07-13
- Session naming: sessions whose first turn is an injected `<vibespace-task-context>`/`<system-reminder>` (or a slash-command echo) no longer fall back to the directory name — both local and remote discovery now SKIP synthetic first-turn records and take the first REAL user message. Remote discovery previously grep'd only ONE user record (`-m1`) and gave up on a `<`-tag; it now scans the first several and picks the first real one (matches local naming). (VibeSpace names from the first user message; it does not read claude's own session summary/title, which older CLIs don't write anyway.)
- Sidebar search now covers ALL remote hosts: with an active filter query the Folders workbench loads every configured host on demand and shows a "Remote matches" section across hosts (not just the one selected in the Recent/History switcher). Deduped against live sessions.
- Ctrl+K palette now matches on session id (backendSessionId/claudeSessionId/sessionId), not just name/cwd/host.

## 2.116.0 — 2026-07-13
- Remote session sidebar: fixed a duplicate card after resuming a remote session — the same session showed BOTH live (in Running, as a webui-managed session) AND stopped (in Recent, from the independent remote ssh-discovery path, which reports remote CHAT sessions as stopped since they have no remote dtach lock). The Recent/History remote zones now dedup discovered sessions against the live webui list by session id (`_wbFilterRemote`).
- Ctrl+K session palette now searches REMOTE sessions too (it previously only saw local + live-remote sessions, never remote stopped ones). It merges already-discovered remote sessions, kicks a one-time ssh scan of every configured host on open (results stream in), and resumes a remote pick with its `hostId` so `--resume` runs on the right machine.

## 2.115.0 — 2026-07-13
- Optional persistent ops log (`src/opslog.js`, env-gated no-op by default): with `VIBESPACE_OPSLOG_DIR` set the server tees its console output to daily-rotated files (`server-YYYY-MM-DD.log`, retention `VIBESPACE_OPSLOG_KEEP_DAYS`, default 30d) plus boot/exit/crash markers — typically pointed at a path-scoped CephFS subtree shared with a fleet admin, so instance logs survive pod recreation and are centrally scannable without any logging infrastructure (no per-node agents, no log database). `VIBESPACE_OPSLOG_CEPHFS_*` env makes the server kernel-mount the subtree itself (same mechanism as My storage). Hung-mount-proof: async writes behind a 10s circuit breaker (one stuck write disables the logger; the app is never blocked — the 2.108.3 threadpool lesson). Helm: `opslog.{enabled,secretName,dir,keepDays}` (secret carries mons/fsName/client/key/path; name defaults to `u-<user>-opslog`).

## 2.114.1 — 2026-07-13
- Usage popup: multi-subscription identity un-confusion (real report: the "CLI login" entry looked like two accounts had swapped quotas). Root cause: `~/.claude.json`'s recorded identity (oauthAccount) goes STALE after a `/login` account switch — the config file said one account while the login token actually belonged to another, so the on-demand ⟳ fetched the other account's quota under the wrong label. Fix: the human-gated ⟳ refresh now also captures the token's TRUE identity (org uuid/name via the CLI's own roles endpoint — one extra read-only call per click, never scheduled); the global↔named account link prefers org-uuid equality over the config email (and a proven-different org BREAKS a stale email match); the popup labels the CLI login with the token-derived identity and shows an amber warning when it contradicts the config file (with the /login remedy). The statusline hook preserves the captured identity through passive writes, like scopedWeekly. New smoke: `scripts/test-usage-link.mjs` (9 checks).

## 2.114.0 — 2026-07-13
- Observability integrations (both optional, env/settings-gated, off by default): (1) **PostHog product analytics** — set `posthog.host` + `posthog.key` (settings, or `VIBESPACE_POSTHOG_HOST/_KEY` env / helm `posthog.*`) and the client loads posthog-js with autocapture and FULLY MASKED session recording (all inputs and all text hidden — interaction shapes only, in line with the names-only telemetry philosophy); disabled whenever local diagnostics (`telemetry.enabled`) are off. (2) **Prometheus metrics exporter** — `VIBESPACE_METRICS_PORT` (helm `metrics.enabled`) serves a hand-rolled `/metrics` on a SEPARATE non-ingress port (RSS/heap/event-loop/live-sessions/ws-clients/leak canaries + version info), scraped in-cluster via standard `prometheus.io/*` pod annotations.

## 2.113.1 — 2026-07-12
- Diff injection: SEVERAL Task Groups changing on one turn now deliver as ONE combined `<vibespace-task-update>` block whose header line enumerates every changed group with a phrase summary ("工作: 3 new activity · 个人项目: 1 checklist change + 3 new activity"), per-group sections following smallest-first (user directive: stacked per-group blocks meant the ~2KB truncation preview could hide the very fact that a second group changed). Same rule extended to every multi-block delivery: the manifest now names EVERY block (diff groups, full re-deliveries, newly-bound groups), not just kinds.

## 2.113.0 — 2026-07-12
- Agent context injection: Task Group UPDATES now deliver as DIFFS (user request — the full re-injection was several KB of repetition per change). Each session snapshots what it last saw per group; a mid-session change injects a compact `<vibespace-task-update>` block listing only the actual deltas: added/checked/unchecked/removed checklist items (with who), objective/title edits, changed shared-context files, and the new activity entries — with `show --full` pointers and a ~5KB cap. Full context still goes out on first contact and after a server restart; no-op edits (e.g. re-saving an unchanged objective) now inject nothing at all. Toggle: Settings → Session → "Task Group updates as diffs" (default on).
- Agent context injection: several first-time groups arriving on one prompt (the codex first-prompt path) now deliver as ONE layered multi-group context instead of N full payloads each repeating the tools section.
- Diff delivery hardening (10-finding adversarial review, all fixed or documented): duplicate-text checklist items pair by occurrence (a check on the 2nd duplicate was silently lost / phantom lines repeated forever); designating or changing a group's shared context folder mid-session falls back to a FULL delivery (the file index + conventions must be taught); `|` in filenames no longer shears the file-change parse; remote sessions no longer get a dead TASK.md pointer; mixed deliveries (a newly-bound group's full context + other groups' diffs) are manifest-headed with the small diffs first so the ~2KB truncation preview can never hide one part entirely; oversized combined deliveries always lead with the persisted-output rescue line.

## 2.112.7 — 2026-07-12
- Self-update: fixed a recurring "update failed — package-lock.json local changes would be overwritten" abort. update.sh reset the generated files with a COMBINED `git checkout -- package-lock.json data/bin/vibespace-status`; on instances where data/bin/vibespace-status is untracked (generated + gitignored), that whole command aborts on the bad pathspec and resets NEITHER file, so package-lock.json stayed dirty and the ff pull aborted. Now each path is reset independently (package-lock.json alone; tracked data/bin helpers per-path), with a stash-and-retry belt.

## 2.112.6 — 2026-07-12
- Window manager: stage-hidden windows are now invisible to every "visible windows" filter (close-time auto-focus-next, layout presets, overlap switcher/indicator) — closing the hero used to auto-focus a stage-hidden previous hero and yank every staged client back to it
- Stage: the ACTIVE HERO is now SHARED across clients (user directive — the walk-over scenario: a device left idle on the stage mirrors what you do on another device, so walking over shows the current workspace). Staged clients follow hero switches live (deferred while you're mid-drag); closing the hero shows the placeholder everywhere; ENTERING the stage adopts the shared hero. Which tab is staged at all remains per-tab, like the active desktop.

## 2.112.5 — 2026-07-12
- Stage MULTI-CLIENT: fixed a data-loss bug — materializing a session that had no local window created a stage-owned copy under a fresh winId; leaving to the desktop that (per other clients) held that session's window then broadcast a state without it, CLOSING the window on every client ("窗口A两个客户端都看不到了"). Materialization now ADOPTS the desktop record's identity (rekey to its winId + home desktop + geometry + maximize state), with a leave-time retry for late-arriving session ids. Reproduced and verified with a two-browser-client harness.
- Stage: maximized heroes handled first-class — borrow un-maximizes onto the slot, hand-back restores home geometry BEFORE re-maximizing (so a later un-maximize lands at home size, not slot size)
- Stage live sync across clients: slot moves, stage grid changes, and the active hero's workspace set (aux open/close/move) now mirror to other staged clients in real time; which view a tab shows (staged or not, which hero) stays per-tab like the active desktop

## 2.112.4 — 2026-07-12
- Stage: leaving the stage returns the hero window to its normal desktop at its HOME geometry (it kept the stage slot size before); temporary leave + re-enter re-borrows the slot seamlessly
- Stage: grid config set while on the stage now persists (stage SyncStore `grid` key; desktop autosave stays suppressed)
- Stage: window drags between the stage and normal desktops are blocked in BOTH directions (previews are not drop targets across the boundary); the placeholder can no longer escape onto a normal desktop (guard + self-heal + never captured into desktop records)
- Settings live-apply: the Dynamic desktop toggle takes effect immediately (stage preview appears/disappears; disabling while staged returns to the previous desktop) — no page refresh
- Settings live-apply: session-card settings (click behavior, click-to-copy, visible fields, detail truncation) re-render the sidebar immediately — no page refresh

## 2.112.3 — 2026-07-12

- **Fixed the Stage slot never persisting** (real report: the placeholder "never moved" — it dragged fine but every materialization landed back top-left). `stage.init()` ran BEFORE `initStateSync()` in the app constructor, so the 'stage' SyncStore was never registered and every slot/workspace write was **silently dropped** (StateSync.set no-ops on unknown stores). Init reordered + a lazy store-registration guard on every stage read/write. CDP-verified closed loop: drag → slot persists across page loads → placeholder AND materialized hero land at the persisted position.

## 2.112.2 — 2026-07-12

- **Stage workspaces: full replay audit across every window type** (design §4b matrix covers all 17 openSpec actions). New guards: `openEditor` replays validate the file first; **editors with unsaved changes are never LRU-evicted** (CodeEditor now exposes dirty state on the window record — closing one silently lost the edits); task detail/log replays skip when the task group was deleted (the window used to open then immediately self-close); workflow-detail replays probe `/api/workflow` and skip on 404.

## 2.112.1 — 2026-07-12

- **Stage workspaces: restoration conditions per window class** (design §4b). Files opened from INSIDE an archive now record their recipe (`via: archive+entry`) — a replay whose temp file is gone re-extracts it fresh. Replays pre-validate their target (file/info probe); unrecoverable windows (dead blob pages, recipe-less temps, deleted files) are skipped with one summary toast instead of opening broken viewers, and temp/blob-backed windows with no recipe are exempt from LRU eviction (closing them would lose them forever).

## 2.112.0 — 2026-07-12

- **NEW: Dynamic desktop ("Stage")** — settings toggle `desktop.dynamicEnabled` (default off). A special desktop at the LEFT of the strip (separated preview with the slot outline): sessions can't be placed there directly; while it's active, ANY switch-to-session action materializes that session into a shared, freely draggable/resizable SLOT, together with its own recorded workspace of helper windows (file explorers, viewers, editors… bound automatically while that session is the hero, replayed via openSpec + stage geometry on return, scroll offsets/live explorer path restored). Closing the hero returns the placeholder; switching heroes hides the previous workspace (LRU keep-alive, setting `desktop.stageKeepAlive`, default 3 — beyond it aux windows close and replay on demand; session windows are never closed by the stage). The incoming hero stacks at the BOTTOM so a moved slot never covers a workspace's aux windows. Same window can live on a normal desktop and the stage (one window, two geometries). Ctrl+Alt+Left from the leftmost desktop enters; Right leaves. Design: docs/design-dynamic-desktop.md. CDP smoke-verified 12/12 on an isolated instance.
- **Update dialog no longer contradicts itself** (real report: "Latest version" badge above v2.111.30's changelog): `/api/version`'s `latest` and the changelog are cached separately and can disagree — the dialog now trusts whichever source names the newer version.

## 2.111.30 — 2026-07-12

- **Update detection no longer lags hours behind** (real report: an instance on 2.111.25 said "no update" while .29 was out). The latest-version + changelog fetches were cached 6 hours server-side; now 15 min, and the gear menu / update dialog pass `?fresh=1` (60s floor) so opening them always checks properly.

## 2.111.29 — 2026-07-12 (P0)

- **Fixed a syntax error that broke the entire `vibespace-status` CLI** on any instance running 2.111.24–2.111.28. The 2.111.24 "reason + detail required" help text used a shell line-continuation backslash (`… \`) at the END of a single-quoted JS string in the generator template — the `\'` escaped the closing quote, so every regenerated `data/bin/vibespace-status` failed to parse and `vibespace-status <anything>` exited with a SyntaxError. The example is now a single line with no trailing backslash. The file regenerates correctly on the next server start; a live instance can also just re-run its Update.

## 2.111.28 — 2026-07-12

- Follow-up to 2.111.26: the `.gitignore` entry for the generated `data/bin/vibespace-status` had an INLINE comment (`path  # ...`) — .gitignore has no inline comments, so the whole line became the pattern and never matched, letting `git add -A` re-track the file. Comment moved to its own line; verified `git check-ignore` now ignores it and `git add -A` no longer picks it up.

## 2.111.27 — 2026-07-12

- **When SSO (Clerk) is configured, the onboarding password step is skipped** — login is handled by the identity provider, so a local password is redundant. The step shows a short "SSO is configured, no password needed" note + Continue instead of the password inputs. On config import, an included `vsPassword` record is now IGNORED under SSO (the import row is disabled with an "ignored — this instance uses SSO login" note, and the server reports `vsPassword: skipped (SSO configured)`). New `auth.ssoEnabled` surfaced through `/api/home`.

## 2.111.26 — 2026-07-12

- **Fixed self-update failing with "Your local changes to data/bin/vibespace-status would be overwritten"**. That file is REGENERATED on every server startup by createStatusHelper() but was also tracked in git, so each boot dirtied the working tree and blocked `git pull --ff-only`. It's now untracked (.gitignore, like data/bin/code) and update.sh resets it — plus any other regenerated tracked file under data/bin/ — before pulling. One-time manual unblock for an instance stuck on the old update.sh: in its shell run `cd ~/vibespace && git checkout -- data/bin/vibespace-status && git pull --ff-only` (or just discard it, then re-click Update).

## 2.111.25 — 2026-07-12

- The injected context's "Reporting back" section now shows COPY-READY complete invocations (fenced one-liners with `--detail`, and `--reason` + `--detail` on the status sample) — the first call an agent copies is already the valid form, instead of learning the required flags via rejection.

## 2.111.24 — 2026-07-12

- Waiting states now require the COMPLETE reason: `blocked`/`needs-input`/`review` must carry BOTH `--reason` (one line for the board chip) AND `--detail` (full context: options, what was tried, the recommendation) — rejected at CLI pre-flight and the agent route otherwise. Same-state records already carrying both still accept reason-less tweaks (urgency bumps). The status CLI usage spells the requirement out.

## 2.111.23 — 2026-07-12

- **`vibespace-status blocked/needs-input/review` without a reason is now REJECTED** (CLI pre-flight + server-side, matching error text) — a bare waiting state on the board tells the user nothing. The error teaches the fix: `--reason "…" ` + say it in chat + mirror with vibespace-ask. Grace: tweaking (e.g. `--urgency`) a same-state record that already carries a reason still passes.

## 2.111.22 — 2026-07-12

- **Self-update dialog now reliably auto-reloads** (real report: it didn't). It keyed the reload on the version NUMBER changing, so re-running the update while already on the latest never reloaded. Now it detects the restart itself — the server going unreachable then reachable again (or a version bump) — cache-busts `/api/version`, and reloads on that. Non-zero exit / genuine no-op / timeout are distinguished, with a manual "Reload now" fallback button always available.
- **Agent tool injection slimmed to a discovery layer**: the per-session `<vibespace-task-context>` "how to report back" block is now a compact list (each tool + when to reach for it) instead of the full ~2.3KB rules dump — detailed syntax/caveats moved to each CLI's own output (run with no args) and to point-of-use reminders. `vibespace-status` prints a "you're waiting on the user — say it in chat + mirror with vibespace-ask" reminder when set to blocked/needs-input/review; its usage carries the honesty guidance.

## 2.111.21 — 2026-07-12

- **Onboarding CLI login/install now runs in an EMBEDDED terminal modal** (user directive: no more "opens a detached terminal, hides the wizard, never comes back"). The wizard stays on screen; the modal polls `/api/backend-status` and closes itself with a ✓ the moment the login/install lands, refreshing the status cards.
- **Update VibeSpace is now a UI progress dialog** — the update runs as a detached server op streaming its log into the dialog; the dialog survives the service restart and **reloads the page automatically** once the new version answers. Failure shows the exit code + log. No more terminal that "runs for a while then just sits there".
- **Unmount / mountpoint change / remove now sweep the leftover mountpoint directory when it is empty** (never recursive — non-empty dirs are left alone).
- `vibespace-ask` now reminds the agent, in its own output, to ALSO post the full question in the chat reply (real pattern: agents filed the inbox item and ended the turn silently).

## 2.111.20 — 2026-07-12

- **Usage meters no longer vanish on instances without captured data** (real report: k8s instances with showUsage on showed nothing). Chat sessions never produce the passive statusline feed, so a fresh chat-only instance had zero usage cache and the meter row was skipped entirely. A machine with a CLI login now renders gray "no data yet" donuts + a popup note explaining where data comes from (terminal sessions, or the on-demand ⟳).
- **New setting `layout.presetOneShot`**: layout buttons arrange windows once and return to free-form, instead of keeping the grid armed for every future drag (default remains the persistent grid).
- **Settings window scroll-spy**: the left category nav highlights the section currently in view as you scroll.
- **Gear menu regrouped by nature**: ① Customize UI / Language ② Manage agents / Usage / Diagnostics ③ Backup / Password / Update ④ Welcome tour / Sign out; Diagnostics got its own pulse icon (was sharing Usage's chart icon).

## 2.111.19 — 2026-07-12

- Desktop availability probe retries with backoff (3s→90s, 5 attempts) when it fails — a page loaded during a server-restart window now self-heals without an F5 or a WebSocket reconnect (the button vanished repeatedly for a user during an update storm).

## 2.111.18 — 2026-07-12

- **Archive extraction shows a persistent progress bar** (user request: big archives looked frozen for minutes). Extraction now runs as a server-side op — a streamed listing pass counts total entries, then unzip/tar verbose output drives a live per-entry counter — polled by the client and rendered through the same machinery as uploads: inline progress row in the file list, upload-button ring, popover entry, with cancel. Remote-host extraction keeps the plain synchronous path. Also fixed skip-existing tolerance for modern tar ("File exists" vs "already exists" — the old sync path mis-reported success as an error too).

## 2.111.17 — 2026-07-12

- **Dragging a FOLDER onto the file explorer now works** (real report: "dragging a folder from the Mac always fails"). The explorer's OS-drop handler used the flat `dataTransfer.files` list, which represents a dragged folder as one unreadable pseudo-File — the upload always failed. It now recurses the tree via the entries API (`collectDroppedFiles`, shared with the chat drop path, which already did this correctly) and recreates the folder structure at the destination. Server round-trip verified with CJK names, spaces, and deep nesting.

## 2.111.16 — 2026-07-12

- **Mac Finder can now WRITE into mounted shares** (real report: walter's Finder mount was read-only). Finder requires WebDAV class 2 (locking) to mount read-write — with class 1 it silently mounts read-only regardless of permissions. /dav now advertises `DAV: 1, 2` and implements advisory LOCK/UNLOCK (fake single-writer locks, nginx-dav_ext-style) + accept-and-ignore PROPPATCH; read-only tokens reject LOCK (403) so Finder correctly shows them read-only. Verified: OPTIONS/LOCK/PUT/PROPPATCH/UNLOCK green, rclone Bearer path unaffected.
- Share dialog also emits a ready-to-paste **rclone config section** (webdav + bearer_token) next to the Finder info.

## 2.111.15 — 2026-07-12

- "Share a local folder" now also shows the Finder/Explorer connection info (dav URL + raw token) so a Mac can mount the share natively without decoding the bridge link.

## 2.111.14 — 2026-07-12

- **/dav accepts Basic auth with the mount token as the password** — macOS Finder (Cmd+K) and Windows Explorer can now mount a shared folder natively: server `https://<instance>/dav`, any username, password = the `vsmt_…` token from "Share a local folder". rclone Bearer unchanged.
- **Storage dialogs fully localized** (real report: Share a local folder / Import rclone config / Import share link / Connect storage were English-only) — 82 strings wrapped, zh+ja dictionaries +98 entries each.

## 2.111.13 — 2026-07-12

- **Desktop feature no longer vanishes for the whole page session** when the page happens to load during a server restart (real report: walter onboarded mid-update and the Desktop button was "disabled"). The `/api/vnc/status` availability probe ran once at startup with failures swallowed; it now re-probes on every WebSocket reconnect until it succeeds.

## 2.111.12 — 2026-07-12

- **Terminal wide-spaced font (FOUT) can no longer get stuck permanently** (hit during walter's onboarding). The 2.105.0 fix polls for the web font's registration for only 20s — on a slow route to Google Fonts (cold-cache first visit, cross-border) the CSS lands after the cap, the repaint never fires, and the terminal keeps fallback-measured wide cells with web-font glyphs forever. Added an event-driven backstop: `document.fonts` `loadingdone` (no time limit) triggers the atlas-clear + refit whenever the font finally arrives; watchers are de-duplicated on re-entry and cleaned in dispose. Immediate user workaround on an affected session: reload the page (warm cache paints correctly) or nudge the font size.

## 2.111.11 — 2026-07-12

- Removed the temporary code-block overlap diagnostic probe (2.111.10 fix user-verified on device).

## 2.111.10 — 2026-07-12

- **Code-block line overlap: the REAL fix, proven by construction.** `renderCodeBlock` split `hljs.highlight()` output by `\n`, but hljs emits spans that CROSS newlines (markdown emphasis paired `_` from `min_size`…`max_bytes` across lines). The split left one line with an unclosed `<span>` and a later line with a stray `</span>`; embedded in the per-line template, that stray close ended `.chat-code-text` EARLY, dumping the rest of the line as extra anonymous flex items — `flex:1 + min-width:0` squeezed the real span to ~47px and its `white-space:pre` text painted OVER the siblings (overprint when unwrapped, a ~7-char narrow column when wrapped). Byte-exact match with the on-device probe (82-char span at 47.4px, layout rows clean). Fix: `splitHighlightedLines()` carries open spans across line fragments (close at line end, re-open at next start) — every row self-contained and balanced; also applied to `rehighlightCodeBlock`. Verified: the previously-corrupt real document renders 60 rows, 0 anomalies, in headless Chrome at mobile width. (2.111.8's content-visibility and 2.111.9's text-size-adjust theories were both refuted by the probe — kept as hygiene, documented as not-the-cause.)

## 2.111.9 — 2026-07-12

- **Actually fixed the mobile code-block text overlap** (2.111.8's content-visibility theory was refuted by an on-device probe). Real cause: `text-size-adjust` was never set, so Android Chrome's text autosizer (font boosting) inflated/rewrapped the 11px code font — rewrapping `white-space: pre` lines into narrow columns painted over adjacent rows while layout stayed clean (probe: rows perfectly stacked, one 82-char span squeezed to 47.4px vs 353.2px siblings). Fix: `html { -webkit-text-size-adjust: 100%; text-size-adjust: 100% }`. The on-device diagnostic probe stays one release for verification.

## 2.111.8 — 2026-07-12

- **Fixed chat code blocks painting overlapping lines (long-standing, root-caused)**. `.chat-msg` uses `content-visibility: auto` with `contain-intrinsic-size: auto` — which REMEMBERS the last-rendered height. A code block's height is width-sensitive when wrapped (narrower → more wrapped rows → taller), so a message first rendered at desktop width cached a short height; scrolling it off then back on a narrower viewport (mobile, or a window resize) reused that stale short height, making the box shorter than its content and the code lines paint over each other. This exactly explains why it was persistent, never self-healed on scroll, and never reproduced on a fresh narrow-width first render. Code-block messages are now carved out of the content-visibility height cache (`:has(.chat-code-block)`), so their height is always measured live. Also removes the scroll tracer added in 2.111.4-5 (the scroll-jump fix is verified).

## 2.111.7 — 2026-07-11

- **Direct CephFS subtree sharing (bypasses the WebDAV proxy)**. Sharing a folder from a CephFS "My storage" now mints a PATH-SCOPED cephx key via an in-cluster minter and produces a `vibespace-cephmount:` link; the receiver kernel-mounts the subtree directly at full flash bandwidth instead of relaying every byte through the source instance's Node process. The minted key is scoped to exactly the shared subpath (verified: `mds allow r path=…`), listed under "Shares I created", and Revoke deletes the key cluster-side. Env-gated (`VIBESPACE_CEPHMINT_URL`/`_TOKEN`) — without a minter, sharing falls back to the WebDAV bridge as before. Cross-cluster/external sharing still uses the bridge.

## 2.111.6 — 2026-07-11

- **Inbox readability (user request)**: every item gets a ⤢ viewer — a dedicated dialog with the text+detail rendered as markdown, fully selectable, with a Copy button. Item text in the popup is selectable now too (a real selection no longer triggers the jump-and-close). And the agent guidance is strengthened everywhere (session intro, per-turn reminder, stop nudge, CLI usage, group context): the inbox is a NOTIFICATION MIRROR — the full content must also appear in the chat reply, never only in the inbox.

## 2.111.5 — 2026-07-11

- **Paging up no longer jumps / slams to the top (root fix, tracer-diagnosed)**. The scroll compensation used scrollHeight DELTAS — but under `content-visibility: auto` a freshly inserted batch measures at its ~80px per-message ESTIMATE while the trimmed batch had REAL heights, so the delta could go NEGATIVE: the tracer caught an insert-50/trim-50 page SHRINKING scrollHeight by 312px, the compensation clamping scrollTop to 0 (slammed to the very top), and the top sentinel then load-looping at the clamp. All four paging paths (extend-top, trim-top-adjacent flows, gap slab loads, gap trims) now preserve position by ANCHORING the topmost visible element and restoring its offset after the mutation — layout ground truth regardless of estimated heights. The scroll tracer stays in for verification.

## 2.111.4 — 2026-07-11

- **Sidebar localization pass (user reports)**: the Folders tab zone headers (Active / Recent / History), "No running sessions" and the other workbench empty states, and the Remote tab's action rows (Add machine / Connect storage / Import share link / Import rclone config / Share a local folder), Bridge tokens section, Revoke buttons+confirms, and the footer notes are now translated (zh/ja).
- **Storage rows**: dropped the `→` arrow between the type tag and the mount path (user request) — the line is now `[Type] /path`.
- **TEMPORARY: chat scroll-jump tracer.** Paging up in chat still occasionally jumps; every scroll-affecting path (extendTop/Bottom, trims, run-fold anchor restores, gap slabs, jumps) now records into a per-view ring buffer, and an unexplained scrollTop jump (>600px with no recent wheel and no expected compensation) ships the buffer to telemetry as `chat-scroll-jump` (kind `trace`, 64KB detail). Zero overhead beyond object pushes; remove after diagnosis.

## 2.111.3 — 2026-07-11

- **Update dialog on the latest version now shows this version's changelog** instead of an empty "already latest" line (user request): the `/api/changelog-diff` endpoint returns the current version's own entry when nothing newer exists, and the dialog renders it under "What's in this version" with a *Latest version* tag.
- **In-container Desktop: Chromium wouldn't launch after a pod restart** (real report). Chromium's profile `SingletonLock` (persisted in the PVC) records the pod hostname+pid; after a pod recreation it points at a dead pod and Chromium refuses to start ("profile in use on another computer"). The entrypoint now clears the stale lock on every boot.
- **Desktop panel launchers bind directly to their apps** (`xfce4-terminal` / `thunar` / `chromium` / `xfce4-settings-manager`) instead of `exo-open --launch <Category>`, which silently no-ops without a registered preferred app (user directive: bind the browser straight to Chromium). Image-level; carried on the next image build.
- **Default pod resources raised to 8 CPU / 32 GiB memory** (limit) in the Helm chart.

## 2.111.2 — 2026-07-11

- **In-container Desktop: the panel "Settings" button did nothing (real report)**. The stock XFCE panel generated on first desktop boot ships an EMPTY 4th launcher — a button with no command — plus Terminal/File-Manager launchers that use `exo-open --launch <Category>`, which silently no-ops when no preferred app is registered. The deployment image now bakes a curated XFCE default (`/etc/xdg/xfce4/…`): the empty launcher becomes a real Settings Manager launcher, and `helpers.rc` registers Terminal=xfce4-terminal / Files=Thunar / Browser=chromium so all the panel buttons work. Applies to FRESH desktops; an already-generated user config is repaired with a one-line fix (see the private deploy README). Image-level change — carried on the next image build.

## 2.111.1 — 2026-07-11

- **In-container Desktop stopped opening ("Too many security failures", real report)**: TigerVNC blacklists a source host after a few unauthenticated connect-then-drop attempts — but EVERY desktop connection comes from 127.0.0.1 (the cookie-authed WS bridge), and VibeSpace's own `portListening` health probe connects and immediately closes the socket, which TigerVNC counts as a failed attempt. A handful of status polls poisoned the blacklist and locked the desktop out. The VNC server now launches with `-UseBlacklist 0` (safe — the bridge is the only route in and it already authenticates; the blacklist protected nothing and only self-DoSed). Restart the desktop once (kill the stale Xtigervnc / redeploy) to clear an already-tripped blacklist.
- **Update-confirm dialog was clipped**: the changelog dialog set its width on the BODY, but `.dialog` is a fixed 440px `overflow:hidden` box, so the wider body overflowed and cut off the action buttons. Width now goes on the dialog shell (`minWidth`).

## 2.111.0 — 2026-07-11

**Noticeable notifications (user reports: the floating toast had no background and went unseen; error toasts too)**

- All toasts — inbox items, errors, confirmations — are now **cards anchored next to the inbox button**: real background, colored edge, shadow, close button. (Root cause of the invisibility: the old style referenced undefined CSS tokens, so the background resolved transparent.)
- Toast duration is configurable: Settings → *Notification popup duration (seconds)* (default 6).
- The inbox popup has **two pages**: the real Inbox (default) and **Notifications** — the recent popup history (messages only, kept locally, live-updating).

**Update flow: changelog confirmation (user directive)**

- Clicking ⚙ *Update VibeSpace…* no longer updates immediately — a dialog lists **every changelog entry between your running version and the latest**, and the update runs only after you confirm (`GET /api/changelog-diff`; offline-safe). Per-patch changelog discipline continues.

**Storage rows decluttered (user directives)**

- The connection-type tag ([S3], [Drive], [OneDrive]…) moved off the name row into the detail line: `[Type] → /mount/path` — and now shows for every type including S3.
- The confusing plug/download **Connect icon is now a text chip** ("Connect"), only shown on deliberately-disconnected rows (adds auto-connect and 2.110.0's supervision keep mounts up otherwise).
- The **duplicate-mount button is gone** (superseded by submounts) and **Remove moved into the Edit dialog** (fewer per-row icons; still confirm-guarded, still refuses while a credential has children).

**Read-only mounts explain write failures (user report: "创建文件失败" said nothing)**

- Creating/renaming/deleting files inside a read-only mount now says WHY: the server appends "“<name>” is connected READ-ONLY…" when the failing path is under an RO mount (generic read-only note for other EROFS), and the file explorer surfaces the server's reason instead of a bare "failed" toast.

## 2.110.1 — 2026-07-11

- The ⚙ *Update VibeSpace…* row is now two lines (user request): action label on top, `vCURRENT → vLATEST` below (highlighted when an update is available; just `vCURRENT` when up to date).

## 2.110.0 — 2026-07-11

**Hardened rclone mounts: read/write caching + auto-recovery (user directive: 最稳定、性能最好、自动恢复)**

- **`--vfs-cache-mode full`** on every rclone mount: reads cached chunk-wise on local disk, writes land locally and upload in the background. The cache is **persistent per mount** (`data/vfs-cache/<id>`; `VIBESPACE_VFS_CACHE_DIR` overrides the root) — dirty writes survive a daemon crash and resume uploading on reconnect (verified: SIGKILL the daemon 0.5s after a write, auto-remount, object lands). Bounded IO (`--timeout 60s --contimeout 15s` + retries) so a flaky backend degrades instead of hanging; new setting `mounts.vfsCacheMaxSizeGB` (default 10). Flags are gated on the installed rclone knowing them (an old system rclone falls back to `writes` mode).
- **Auto-reconnect supervision**: a mount whose daemon died or whose IO hung (torn down by the hung-mount defense) now self-heals — the health watchdog remounts it with backoff (1→2→5→10 min cap), surfacing "auto-reconnecting (attempt N)". Auth-class failures (revoked/expired) are excluded — they need the user and keep their actionable error. Only an explicit Unmount stops supervision (`desired` now only ever reflects USER intent; internal teardowns keep it).
- **rclone binary NFS trap fixed**: executing the 57 MB pinned binary from a network filesystem demand-pages it through the mount on every run (~22 s wall, measured). `rcloneBin()` now copies it once to `~/.cache/vibespace/` (keyed by size+mtime) and execs the local copy — 22 s → 0.03 s.

**Containers: in-place update + restart (user report: "miku cc里部署的instance不能自动更新+重启")**

- The pod entrypoint now runs the server under a **respawn supervisor** instead of `exec` — `scripts/update.sh` (⚙ → Update VibeSpace…) kills the server pid and the loop respawns it on the new code; dtach agent sessions share the PID namespace and **survive the restart**. The server writes `data/server.pid`; `VIBESPACE_SUPERVISED=1` advertises the restart path (also exported by `run.sh`). Needs one new image rollout; after that, updates are fully in-place.

**Version visibility**: the ⚙ menu's *Update VibeSpace…* row now shows the running version, and highlights `vX → vY` when the canonical repo has a newer release (`GET /api/version`; latest checked lazily, cached 6 h, offline-safe).

## 2.109.5 — 2026-07-11

Three chat-card bugs (all user-reported):

- **Scrolling up through history no longer jumps / load-loops on collapsed Bash runs.** The run fold ran on a 180ms-debounced observer — AFTER `_extendTop` had already compensated the scroll position — so freshly loaded Bash cards folded out from above the viewport, the view yanked, and the top sentinel re-triggered another load in a loop ("翻不回来"). `_updateRuns` now anchors the topmost visible element across every pass (any timing path stays still, including opening/closing search), the pagination paths fold new cards in the same task as their scroll compensation, and the open/closed memory of a run is keyed by ANY member instead of the first — prepending older members onto a run no longer re-collapses the one being read.

- **A tool card waiting for permission approval no longer folds into a run-collapse group.** The thinking/Bash run fold used to swallow a Bash card whose Allow/Deny buttons were pending — the turn stalled with no visible prompt. An unresolved permission now breaks the run and stays visible; it folds back after resolve. (The permission overlay is injected in place, which the runs MutationObserver can't see — the permission edit path re-evaluates the fold directly.)
- **An answered AskUserQuestion questionnaire can no longer resurrect as awaiting-input.** Cooperating gaps closed: (1) the `control_response` only ever lived in server memory (it goes to claude's stdin; the wrapper's `.buf` tees stdout only) so a restart-rebuilt history was request-without-response — the normalizer's tool_result merge now auto-resolves an unresolved permission (a result proves the question was answered), and the reverse replay order can no longer flip a settled card back to pending (the error→pending restore now applies only to interrupt-flushed tools); (2) is_error alone is NOT read as denial — an approved tool that then fails keeps "✓ Allowed"; only the CLI's canned user-rejection text marks "✗ Denied"; (3) `activePendingPermissions()` judged "resolved" from only the last 100 records — a session that kept working pushed the answer out of the window and every attach re-advertised the stale request (same class as the old chatStatus 200-record scan bug; now scans all records); (4) the client-side attach injection now skips tools that already completed. Verified against the real stuck session's JSONL+buffer plus a 9-order replay matrix through the actual rebuild pipeline.
- **Chat windows no longer rebuild their run folds in a permanent 180ms loop** — the `_runsMutating` flag never actually suppressed the MutationObserver's self-trigger (callbacks deliver on a microtask after the flag resets); the pass now drains its own records via `takeRecords()`.
- **An opened run fold no longer snaps shut when its tool completes** — the open/closed memory is keyed by element, and the completion re-render swaps the element (`replaceWith`); membership now transfers across the swap (review-confirmed: a single-Bash fold opened to watch live output re-collapsed the moment the result landed).

## 2.109.4 — 2026-07-11

- **Env-provisioned My storage unmounted on first boot**: `mounts.pathGuard` was mis-nested INSIDE the broadcast callback, so a construction-time broadcast (env-import add→_notify→broadcast) hit the mounts-const TDZ and threw out of `add()` before it set desired=mounted — the root cause behind the cephfs/S3 first-boot glitch.
- Helm: nil-safe s3/cephfs/fuse conditionals (`--reuse-values` on an instance without an s3 block nil-pointered).

## 2.109.3 — 2026-07-11

- **Env-provisioned CephFS My storage self-heals to desired=mounted on every boot** — a first-import race / pre-cephfs-code boot could leave it permanently unmounted.

## 2.109.2 — 2026-07-11

- **CephFS health-probe tolerance**: the native cephfs mount gets a longer probe window (12s — an MDS session on a cold mount can spike a first `ls`) and requires TWO consecutive hangs before the watchdog auto-disconnects a trusted deployment mount (a single blip won't tear it down).

## 2.109.1 — 2026-07-11

**Native all-flash CephFS "My storage" (user-approved, replaces the slow RGW S3)** — a new `cephfs` mount type does a kernel `mount -t ceph` via sudo (the container has passwordless sudo + SYS_ADMIN + AppArmor Unconfined). Env-provisioned (`VIBESPACE_CEPHFS_MONS/NAME/PATH/USER/SECRET`) as "My storage", taking precedence over S3 when both are set. Per-user quota is enforced on the CephFS subtree (`ceph.quota.max_bytes`), shown as the filesystem size. Editable name + mount point, connection env-locked (like the S3 My storage). Helm: `cephfs.*` values + a widened securityContext gate (fuse OR cephfs); image adds `ceph-common`. Verified live on a deployed instance: mounts at boot, survives both health sweeps, 1T quota, writable, server stays responsive. No CSI driver needed — the pod's kernel ceph client mounts the scoped subtree directly.

## 2.109.0 — 2026-07-11

**Structural IO isolation (user directive "把IO隔离，不用重写")** — every LOCAL user-path filesystem op in the file routes now runs in a dedicated `worker_threads` pool (`src/safe-fs.js` + `src/safe-fs-worker.js`, 4 workers, each with its own libuv threadpool) with a per-op deadline and kill+respawn on a stuck worker. A hung mount can no longer starve the main event loop / shared pool — the structural fix behind today's tactical guards. Path resolution / traversal checks stay in the main process; the worker only executes the already-resolved absolute path. `?host=` remote ops are untouched. Verified: during a 6.3s dead-mount connect, 41 concurrent good listings (max 7ms) + 41 logins (max 6ms) stayed fast, zero failures.

**Revoked/expired share now surfaces to the receiver (user-flagged: "revoke了token接受方如何提示")** — a fuse mount to a revoked share still "mounts" and a cached mountpoint `ls` lies about it, so the health probe is now 3-state (ok / error / **hung**) and revocable mounts (imported shares, VibeSpace bridges, expiring credentials) get an uncached BACKEND re-auth probe that catches a 401/403. The row shows "connected but every file errors — the share may have been revoked…" instead of a green mount whose files all error; it clears automatically if access is re-granted. Non-revocable mounts (your own S3/Drive) skip the extra round-trip. Verified e2e across mount-of-already-revoked and revoke-while-mounted.

**Storage Edit dialog prefills real values** — `GET /api/mounts/:id/config` returns the decrypted connection config so the Edit dialog shows the actual tokens/keys/params (user directive: no "blank = keep" placeholders). Save diffs against the fetched original (unchanged secrets aren't re-encrypted; an emptied rclone param is removed). Env-provisioned records return no secrets.

Verified against two password-auth instances end to end: bridge shares (RO/RW, RO-write rejected at fuse AND /dav), path-traversal rejection, self-mount refusal, garbage-link errors, credential/submount unmount lifecycle (unmount one submount leaves siblings + credential intact; remove-credential-with-children refused; mountpoint left empty & re-mountable), and source-instance-frozen keeping the receiver responsive.

## 2.108.8 — 2026-07-11

- **`window.closeBehavior` default is now DETACH** (user directive — no per-type exception): closing a session window keeps the session alive in the sidebar for re-attach. Automation helper terminals still always terminate. (Replaces the 2.108.7 shell-only default.)
- **Edit dialog prefills real values**: `GET /api/mounts/:id/config` returns the fully decrypted connection config (tokens/keys included) so the storage Edit dialog shows the actual current values instead of "blank = keep" placeholders (user directive). Env-provisioned records return no secrets (connection is deployment-owned).

## 2.108.7 — 2026-07-11

**Shell terminals detach on close by default (user report: "创建terminal关闭就没了，这是预期吗？")** — it WAS the documented default (`window.closeBehavior: terminate`), but it's the wrong default for plain shells: an agent session resumes from its transcript, a shell has nothing to resume — terminate destroys it irrecoverably. Now, until the user sets closeBehavior explicitly, shell terminals DETACH on window close (dtach keeps them alive, they stay in the sidebar's LIVE list, restarts don't kill them — tmux semantics) while agent sessions keep the terminate default. An explicit setting overrides both. New `SettingsManager.isSet()` distinguishes user-set from schema-default (get() can't). Automation helper terminals (Log in / Update) still always terminate. Verified e2e: open → close → session alive + listed → reattach works.

## 2.108.6 — 2026-07-11

**Robustness, phase 1 (user directive: "让后端稍微robust一点")**
- **Threadpool canary**: every 10s a stat() of the server's own package.json must round-trip through the libuv pool within 5s — the wedge class that took an instance down twice today is INVISIBLE to event-loop-lag metrics (the loop stays idle while the pool starves). Three consecutive breaches log loudly, record a `srv-threadpool-wedged` telemetry event, and kick the mount health sweep immediately instead of waiting its 60s timer. Detects ANY future pool-wedge cause, not just mounts.
- **K8s livenessProbe** (helm): a SUSTAINED unresponsive instance (up-but-wedged livelock — crash-restart never fires) now self-restarts after ~5min of failed probes. Deliberately generous: a restart kills in-pod dtach sessions, so only a truly dead instance trips it.

## 2.108.5 — 2026-07-11

**Self-mount guard (real incident: "test-share 打开就卡住")** — a VibeSpace bridge share minted by an instance and then imported back into the SAME instance mounts its own `/dav` through fuse: every file op becomes fuse → HTTP → the same node process → threadpool → waiting on fuse — a self-referential loop that deadlocks under a couple of concurrent ops. Bridge tokens are minted locally, so the check is trivial: a bearer token found in OUR OWN token store means the link points back at us. Refused in all three places with "open the shared folder directly instead": add, share-link import, and mount() of pre-existing records (the user's imported test share now shows the explanation instead of freezing).

## 2.108.4 — 2026-07-11

**Hung-mount defense, part 2 — close the pile-up window.** 2.108.3's watchdog reclaims a dead mount, but during the ~6s connect-probe window an open file-explorer window pointed at the mountpoint could still stuff the libuv threadpool with never-returning fs ops — the server then degraded for minutes while they drained (real follow-up incident: user clicked Connect on the unreachable-host mount, instance stalled again). Now:
- **Path circuit breaker**: the whole connect window (block before the fuse mount is spawned, release on probe pass) and any detected-hung mount root fail EVERY file-route op under them fast with 503 "storage is connecting or not responding" — verified: 8 concurrent listings against a dead mountpoint mid-connect all return in 0.0s, server stays at 1ms.
- **libuv threadpool 4 → 32** (`UV_THREADPOOL_SIZE`, set at the top of server.js): headroom so a handful of stragglers can't starve every async fs/dns op server-wide.

## 2.108.3 — 2026-07-11

**Hung-mount defense (real incident: the xingweil instance went unreachable)** — an SMB mount whose host only resolves on the user's home LAN stayed fuse-"mounted" while every IO on it hung; node's libuv threadpool filled with stuck fs ops, `/login` took 130s, the readiness probe (1s) failed and the pod dropped out of the Service. The main event loop was IDLE the whole time (`ep_poll`) — the threadpool was the choke point. Two defenses, both e2e-verified against a reproduced dead-SMB mount:
- **Post-mount IO probe** (`mount()`): after the fuse mount appears, list the mountpoint from a CHILD process with a 6s guard — a hang unmounts immediately, kills the rclone daemon, persists `desired: unmounted`, and reports "storage connected but IO hangs (host unreachable from this machine?)". An error exit (EIO) counts as responsive — only a stuck child trips it.
- **Health watchdog** (`startHealthWatchdog`, 60s + one sweep 15s after boot): covers mounts ADOPTED at boot (restore() skips mount()'s probe) and mounts that die later — same child-process probe, same auto-disconnect ("storage stopped responding … auto-disconnected to protect the server"). One bad mount can never take the server down again.
- Daemon teardown matches by exact `/proc/*/cmdline` argv (a wedged rclone survives lazy unmount and dial-retries forever; `pkill -f` can't safely quote arbitrary mountpoint paths).

## 2.108.2 — 2026-07-11

**Storage submounts — the "credential" concept dissolved (user directive after testing 2.108.0):**
- EVERY top-level storage row can now hold submounts (＋ on S3/rclone/Drive/SFTP rows — `remote:path` children under any connection, not just converted credentials). Children still resolve connection through the parent, so a token refresh heals all of them.
- Root-unmountable records (auto-detected bucket-scoped S3/R2 tokens) are now marked **credential-only with a key ICON in place of the status dot** — no text badge, and **no Connect action** (its root is known dead; submounts carry the mount state). The row shows the remote source instead of a meaningless local path.
- Auto-heal: if a credential-only record's token later CAN open the root (rescoped), the next mount attempt clears the flag.
- Submounts can't nest (clear error), duplicate (⧉) stays top-level-only.

**Instance image 3.2.0** (deploy): the instance user gets passwordless sudo (user request — in-terminal apt installs; rootfs is ephemeral, persistent setup belongs in `~/.vibespace-init.sh` which can now sudo). Live on xingweil.

## 2.108.1 — 2026-07-11

Three long-open bugs fixed by parallel root-cause agents, each verified end-to-end in isolated instances:

- **Discovery misclaim with parallel same-cwd sessions** (real incident: 4 external sessions read as 5; killing one flagged the WRONG id stopped; resuming it collided with a live session): lock→JSONL claiming no longer trusts mtime. New shared pure `claimJsonls` (unit-tested, `scripts/test-claim-jsonls.mjs`): exact id → tail scan (a resumed session writes its CURRENT id into the ORIGINAL-named file; last-tail-id = current writer) → mtime only over no-evidence files (brand-new sessions). Local `/api/sessions` AND remote ssh discovery share it; a lock with no transcript yet lists under its own id instead of stealing one. Full 5263-session sweep: 780ms.
- **Externally-started remote sessions opened BLANK in chat mode**: the resume history fetch never passed `?host=`, so a remote transcript nothing had ever cached came back empty (VibeSpace-started sessions only worked because attach/view had warmed the cache). Every history consumer (resume load, pagination, turn map, search) now carries the host; `view-<uuid>` ids are no longer misparsed as `view-<backend>-…` (that broke remote View-History pagination/search); zero-message transcripts say so instead of rendering a silent blank pane.
- **Thinking runs never folded** ("只有Bash折叠了"): real thinking cards are structurally never adjacent — the adjacent pairs are EMPTY thinking stubs (redacted/zero-length; 1383 pairs in one real 442MB transcript), and those invisible stubs also broke Bash-run adjacency. New `chat.hideEmptyThinking` (default ON, instant toggle) hides empty thinking cards, and hidden cards (empty thinking, hidden hook cards) are now TRANSPARENT to run collapsing — they neither count nor break adjacency. Corrected the stale `collapseRuns` setting description.

## 2.108.0 — 2026-07-11

**Storage: credentials as first-class items (user request — the rclone `remote:path` model)**
- A **credential** is the remote before the colon (connection settings only); **mount points** nest under it as `remote:path` rows (↳ indented, key badge on the parent). One credential backs any number of mounts, and refreshing its token/keys heals all of them at once (children resolve connection through the parent at mount time).
- **Auto-detection**: mounting a pathless S3-family record whose token can't list the account root (bucket-scoped R2/S3 tokens — the FishR2 trap: fuse mount "succeeds", every IO returns EIO) probes first, converts the record to a credential, and says exactly what to do. A credential whose token CAN list root (Google Drive, account-wide keys) mounts normally — no artificial restriction.
- **AccessDenied with a path now fails fast with guidance** ("check the bucket name — S3 buckets are lowercase letters/digits/hyphens") instead of mounting a dead folder. Root-caused live: `Example_Prod_Data` is the display name; the actual bucket is `example-prod-data` (S3 names can't contain uppercase/underscores).
- New: `POST /api/mounts/:id/children`, `POST /api/mounts/:id/convert`; credential delete refused while mount points exist; export/import carries kind+parent links (re-linked by name on the target instance).
- **Full parameter editing for non-env mounts** (user directive: only env-provisioned connections are locked): every type's edit dialog now exposes ALL its connection fields — custom-rclone per-parameter rows (blank = keep, `-` = remove, add-new pair), Drive token/client, WebDAV/SFTP hosts+secrets. Server PATCH branches for sftp/webdav actually write the right fields now (they set unused keys before).
- **Google Drive re-authorization**: when Google reports `invalid_grant` (revoked/expired token — real case on a deployed instance), the error line and the edit dialog offer "Re-authorize Google Drive…" — the guided OAuth flow runs with the mount's own client creds and writes the fresh token back into the record (and its children), then reconnects. `POST /api/mounts/gdrive-auth/start {mountId}` + `POST /api/mounts/:id/drive-token`.
- Import-rclone-config dialog layout fix: `.dialog-body label` (0,1,1) crushed the remote checkbox rows into columns — same specificity clash class as `label.cfg-row`.

**Codex: duplicate assistant messages fixed (user report)**
- Newer Codex serializes the SAME assistant message differently in the wrapper buffer (`item_id`) vs the rollout JSONL (`id` + a metadata passthrough object) — the merge fingerprint missed the twins AND the normalizer's stream-key missed the in-place update, so every buffered assistant message rendered twice after attach/restart. Both layers fixed; verified on the reporter's real 2GB rollout (3 duplicated texts → 0).

## 2.107.1 — 2026-07-11

- **openSpec windows survive page refresh**: restoreState's typed branches ended at `browser` — settings/desktop/usage/task-detail/workflow windows silently VANISHED on reload (real report). A generic fallback now replays any saved openSpec (verified: settings window save→reload→restored).
- **Env-provisioned storage: connection locked** (user directive): endpoint/bucket/keys come from the deployment env (a change re-imports) — editing them in-app is refused server-side; name and MOUNT POINT are editable (custom mount point field added to the edit dialog for all mounts).

## 2.107.0 — 2026-07-11

**Storage: edit + derive (user request — a mis-pathed mount had no fix but delete/re-add)**
- ✎ **Edit** on every mount row: name, and per-type connection fields (S3 endpoint/bucket/prefix/keys with blank-keeps-secret; custom-rclone remote path — the FishR2-class fix; Drive folder). A connected mount reconnects with the new settings. Renaming is refused while a bridge share points into the mount (its chroot path would silently break).
- ⧉ **New mount from this connection**: same credentials, different bucket/path/prefix — one imported R2/S3 credential can back any number of mounts (PATCH /api/mounts/:id + POST /api/mounts/:id/duplicate).
- Env-provisioned "My storage" can no longer be deleted in-app (deployment-managed; a changed provisioning re-imports it) — edit/rename/unmount only, per user directive.

## 2.106.5 — 2026-07-11

- **Run collapse, tuned live with the user**: thinking + Bash fold as ONE mixed group; ANY Bash starts a fold immediately (single included, pending/running included — the bottom streaming indicator shows activity, and a running member adds "· running…" to the fold header); pure-thinking folds at ≥2; the newest-message exemption is gone. Fold headers carry the assistant color bar in border mode.
- **User vs assistant role bars distinguishable in every theme**: the user bar was `--accent` — TEAL by default, visually adjacent to the assistant's green (worse in green-accent themes, surfaced by the new theme chips). User bar is now blue.

## 2.106.4 — 2026-07-11

- **Remote tab broken on a fresh instance (real report: "remote 功能直接坏了")**: with ZERO sessions, the sidebar's no-sessions early-return fired before the mounts dispatch — the Remote tab rendered the Folders empty state ("+ New Session" / "No sessions") instead of machines+storage. Latent since the tab existed; invisible on any instance with sessions. The mounts branch now dispatches first (it doesn't depend on the session list at all).

## 2.106.3 — 2026-07-11

- **VIBESPACE_S3_* env import works on existing instances**: the one-shot `_envImported` flag burned on the very FIRST boot even with no env set, so a managed instance that gained the S3 env later (helm upgrade) never imported its personal storage. Import is now keyed by the env's endpoint|bucket|prefix SIGNATURE — set/changed env imports on next boot, a user-deleted mount stays deleted while the signature is unchanged.

## 2.106.2 — 2026-07-11

- **Remote session with NO account picked no longer fails on the default subscription (real report)**: resuming/creating on a remote host without specifying an account resolved the LOCAL default (a subscription) and died on the §ban-safety shipping gate. When the account came from the default (not an explicit pick) and could only reach the host by shipping subscription creds, the spawn now falls back to the HOST's own CLI login. An explicitly chosen subscription still errors with guidance; an opted-in shipSubscriptionToRemote still ships.
- **Regression fixes from 2.106.0/1 (both user-reported within the hour)**: (1) the wizard backend-card polish leaked into Manage Agents — `.ob-backend` is SHARED, and the unscoped nowrap/ellipsis blew the dialog open horizontally while the edit orphaned the row background/padding; original rule restored, polish scoped under `#welcome`. (2) Run-collapse didn't actually hide anything: `.chat-compact .chat-msg { display: block }` (compact is the DEFAULT) out-specified the bare `.chat-run-collapsed` — verified by COMPUTED display this time (9/9 none), not class presence.

## 2.106.1 — 2026-07-11

- **Sidebar scroll no longer breaks on refresh (real report)**: EVERY `_render()` now preserves the list scroll — broadcast-triggered re-renders (tasks-updated / session-status-updated / user-state-updated, fired constantly by agents' vibespace-task/status calls) used to reset it to top; only the 5s-poll digest path preserved it. A view change (tab / board sub-view / mobile drill-down) still resets deliberately.
- **Top bars no longer follow the bottom taskbar's drag-resize (real report)**: the adaptive size vars live on :root for cross-bar hosting — they're now pinned to defaults inside #toolbar and #toolbar-row2.
- **Taskbar sizing is recoverable (real report: "margin grows after one resize, never returns")**: the JS-derived size vars never matched the CSS defaults even at the same height, and nothing cleared the inline override. Double-click the resize handle to reset; a synced height at the CSS default is applied as a reset too.

## 2.106.0 — 2026-07-11

**Chat: TUI-style run collapse (new setting, default ON)**
- `chat.collapseRuns`: three or more consecutive thinking-only messages (or Bash tool cards) fold behind a clickable "N × …" line, like the Claude Code TUI. Decoration-only (a MutationObserver re-decorates on appends/edits/trims — nothing reparents, so virtual scroll/gap-seek/index mapping are untouched); the newest message never collapses (live progress stays visible); an open search bar expands everything (reveal must reach members); user-opened runs stay open across rebuilds (WeakSet by first member).
- `chat.reducedMotionSpin` (opt-in): keep the activity spinner ROTATING under prefers-reduced-motion instead of the default opacity pulse (the pulse read as "blinking" — user request).

**Onboarding**
- Log in / Install from the wizard no longer abandons the tour (real report: "clicking Log in skips onboarding") — the wizard PAUSES (not marked done) and a floating "↩ Back to setup" pill re-enters at the same step.
- Backend card layout polish: name+version ellipsize on one line, actions no longer squeeze.

**Settings window syncs across clients** (user request): it now carries an `openSpec` like every other window — persisted in the layout and replayed on other clients (was deliberately transient since 2.53.0).

**Deploy image**: Chromium launches in the container now (`/etc/chromium.d/99-container`: `--no-sandbox --disable-dev-shm-usage` — the sandbox can't work unprivileged and /dev/shm is tiny; acceptable in a single-user container).

## 2.105.2 — 2026-07-11

**Remote-host session blank on other clients (real report) — three cooperating fixes**
- ROOT CAUSE 1 (pollution): `syncSessionIdentity` and `captureState` wrote the WEBUI server id into `backendSessionId` whenever the CLI hadn't reported its real id yet — remote spawns stay in that state for a long time (the id only arrives via remote discovery). Other clients then re-resolved the openSpec against that bogus id, missed, and opened a BLANK view-only window. All three sites now refuse to bake a webui id (`match.sessionId === match.webuiId` guard).
- ROOT CAUSE 2 (race): a layout-sync replay can arrive BEFORE the receiving client's session list knows a just-created serverId — `replayOpenSpec` treated that as "session dead" and fell to viewSession-with-bogus-id. It now attaches directly by serverId (the server is authoritative; a genuinely dead session's attach errors into the read-only path anyway) and treats a bsid equal to the serverId (legacy polluted autosaves) as no bsid. Same legacy guard in `restoreState`.
- `hostId` now rides in attachSession openSpecs (create + attach + identity sync) and is threaded to the dead-session viewSession fallbacks, so a remote session's history view resolves over ssh after the session dies.
- Bonus (found reproducing): a REFUSED create (e.g. the remote subscription-shipping policy) left a permanently blank window with no feedback — the create handler now surfaces the server's error in the window + a toast.
- Verified by controlled repro: polluted spec + session-unknown race on a second client → was a blank viewOnly shell, now a live chat with input.

## 2.105.1 — 2026-07-11

- **First-terminal ugly font, the OTHER half (still reproduced on managed instances after 2.105.0)**: the font LIST builds asynchronously (queryLocalFonts + /api/fonts, which runs fc-list server-side — slow on a container's first call). A terminal created before it resolves fell back to bare `monospace` and KEPT it forever — the reported "switch fonts and it heals" is exactly that. A fallback-created terminal now upgrades to the real default the moment the list lands (atlas rebuild + refit + the 2.105.0 FOUT watcher re-armed for the new family). The 2.105.0 registration-polling half was verified on a true cleared-cache run: faces registered-but-unloaded at terminal open → poll → load() pulls the binaries → repaint.
- **Codex login is always `--device-auth`** (user directive): plain `codex login` starts a localhost:1455 callback server on the machine running the CLI — unreachable from the user's browser on remote hosts AND managed/container instances. Device auth (URL + one-time code) works everywhere; wizard + Manage Agents updated.

## 2.105.0 — 2026-07-11

**Terminal font FOUT: the real fix (registration polling)**
- 2.100.6's fix didn't survive a COLD-CACHE first visit (real report from a fresh managed instance): before the Google Fonts CSS itself loads, EVERY fonts API lies — `document.fonts.load(spec)` resolves empty immediately (no face registered), `fonts.ready` resolves early ("no loads pending" ≠ "my font arrived"), and `check(spec)` returns TRUE for an unregistered family (verified live — it only returns false for a registered-but-unloaded face). Both old triggers fired before the font existed.
- The one honest signal is REGISTRATION: the family appears in `document.fonts` only once its CSS has landed. `_refreshOnFontReady` now polls for that (500ms × 40), then `load()`s for real and rebuilds the texture atlas when faces actually deliver. Warm cache = zero work; system/local fonts = no repaint needed (first paint was already correct). Verified deterministically: late-injected font CSS → repaint 513ms after it lands; warm path → 0 spurious repaints.

**Onboarding: theme choice on step 0 (user request)**
- Theme chips (all 6 built-ins, with color dots) next to the language chips — applied LIVE via ThemeManager (per-device, like the ⚙ picker), the wizard itself recolors as immediate feedback.

**TEMPORARY: code-line overlap tracer**
- A long code-block line painting its wrapped continuation over itself (Chrome/mac, persistent, scroll doesn't heal; a fresh rebuild of the same card measures clean). `installOverlapTracer` (telemetry-client.js) samples visible code lines every 10s and ships one geometry+computed-style diagnostic when sibling rows overlap or a row paints taller than its box. Removed once diagnosed — same playbook as the 2.100.3 drag tracer.

## 2.104.1 — 2026-07-11

- Clerk login page: clerk-js v5 from the CDN self-bootstraps `window.Clerk` as an INSTANCE via the `data-clerk-publishable-key` script attribute — constructing it threw "window.Clerk is not a constructor" (real report from the first deployed test). The loader now sets the attribute and accepts both shapes.
- Deploy image: seed the PVC checkout with `git reset --hard $VIBESPACE_REF` instead of `git checkout` — a SHA ref left the seed (and thus every user's ~/vibespace) on a detached HEAD, breaking `git pull` self-update.

## 2.104.0 — 2026-07-11

**In-container desktop via integrated noVNC (deployment queue ④) — single login, no second password**
- New `desktop` window type: noVNC renders a LOCALHOST-bound VNC server through the cookie-authenticated `/api/vnc` WebSocket bridge (websockify semantics, backpressure-paused TCP). The ⚙ menu gains a **Desktop** entry only where a VNC stack exists (one startup probe).
- `src/vnc.js` VncManager: lazy lifecycle — nothing runs until the first desktop window POSTs `/api/vnc/start`; Xvnc + XFCE session spawn DETACHED so an app-only VibeSpace restart doesn't kill the desktop, and an already-listening port is ADOPTED (also the bring-your-own-VNC/KasmVNC path). `-localhost -SecurityTypes None` is safe because the cookie-authed bridge is the only route in.
- noVNC ships as a SEPARATE ESM bundle (`public/novnc.js`, dynamic-imported on first use) — it uses top-level await, which can't live in the IIFE main bundle; non-desktop users never download it.
- Deploy image: TigerVNC + XFCE + Chromium + Noto CJK fonts (lazy — zero cost for users who never open a desktop).
- **Fixed a latent WS bug found on the way**: `ws`'s `WebSocketServer({server, path:'/ws'})` upgrade listener `abortHandshake(400)`s EVERY non-matching upgrade — it had been silently killing `/proxy/` site WebSockets, and killed the VNC bridge on arrival. The main wss is now `noServer` and ONE upgrade dispatcher routes `/ws`, `/proxy/`, `/api/vnc` (each cookie-authed) and destroys the rest.
- Verified E2E locally (adopt path): status→start→bridge→RFB handshake→1280×800 framebuffer canvas, reconnect overlay, clipboard both ways wired.

## 2.103.0 — 2026-07-11

**Clerk SSO (deployment queue ③) — optional, env-gated, zero new dependencies**
- `VIBESPACE_CLERK_PUBLISHABLE_KEY` turns the login page into a dual-mode page: password form (when a password is set) + "Sign in with SSO" via Clerk's hosted UI (ClerkJS loaded from the Clerk frontend-API host derived from the publishable key). With no password set, Clerk alone enables auth.
- `POST /api/clerk-login`: verifies the Clerk session JWT against Clerk's JWKS (RS256 via pure node:crypto — kid lookup with rotation refetch, exp/nbf ±60s, issuer check, alg pinned), gates on `VIBESPACE_CLERK_ALLOWED_EMAILS` (comma list, `@domain` entries allow a domain, EMPTY rejects everyone — authn ≠ authz on a per-user instance), then issues the SAME cookie token as password login — middleware/WS/agent tokens all unchanged. No Clerk secret key needed anywhere.
- Already-signed-in-at-Clerk visitors are exchanged automatically on page load; a 403 (wrong account) offers a "Switch account" sign-out link. The email claim requirement (dashboard: session-token custom claims or a `vibespace` JWT template) is surfaced as an actionable error.
- `Auth` grew a `passwordEnabled` (vs `enabled`) split so Clerk-only instances behave: set-password needs no "current" when none exists, remove-password keeps auth on under Clerk, token store initializes without auth.json.
- Helm: `clerk.publishableKey/allowedEmails` values → env. Verified by unit tests (signature/expiry/issuer/alg-none/unknown-kid attack cases) + route-level E2E (Clerk-only 401 gate, exchange→cookie→authed, allowlist 403, missing-claim hint).

## 2.102.0 — 2026-07-11

**Onboarding for managed deployments (deployment queue ②)**
- Wizard step 0 gains language chips (Auto / English / 中文 / 日本語) — picking one reloads into that language; since `vs-onboarded` isn't set yet, the wizard re-enters in the picked language.
- One-click **Install** for a missing CLI: wizard step 1 and Manage Agents both show an Install button when a backend is `not installed` (claude → official native installer `curl …/install.sh | bash`, user-local ~/.local/bin, no root; codex → `npm install -g @openai/codex@latest`), run in a visible shell terminal like Log in/Update.
- Wizard step 2: when a password is already set (managed instances arrive with a preset env password), a **Change password…** button opens the standard password dialog so a new user can claim the instance with their own password.
- Deploy image: codex now pre-installed next to claude; the npm global tree is chown'd to `vibe` (root-owned /usr/local is why `npm i -g`/`claude update` EACCESed in-container); `~/.local/bin` on PATH (native-installer CLIs land on the PVC and survive image rebuilds).

## 2.101.0 — 2026-07-11

**Fleet telemetry: any instance can be the central collector (deployment queue ①)**
- New `POST /api/telemetry/ingest`: enabled only when `VIBESPACE_TELEMETRY_INGEST_TOKEN` is set (the shared Bearer token is both the on-switch and the gate, timing-safe compare; cookie-auth exempt — senders have no cookie). Forwarded batches land in per-month `central-YYYY-MM.ndjson` shards, each record stamped with the sender's anonymous instance id, original timestamps/versions preserved (clamped to a sane window). Same privacy model as local events: names/stacks/metrics only, never content.
- Forwarding now sends `Authorization: Bearer <token>` (new setting `telemetry.forwardToken`); `telemetry.forwardUrl`/`forwardToken` fall back to `VIBESPACE_TELEMETRY_FORWARD_URL`/`_TOKEN` env vars so a managed deployment configures the whole fleet via helm/compose without touching per-user settings (user setting still wins).
- ⚙ → Diagnostics report grows a **Fleet** section on a collector instance: per-instance events/errors/versions/last-seen table + errors grouped across instances (`GET /api/telemetry/central-summary`).
- Helm chart: new `telemetry.forwardUrl/forwardToken/ingestToken` values → env (tokens via the instance Secret).
- Verified E2E: forward→ingest with correct token lands (inst id + remote version + original ts preserved); wrong/missing token rejected; instance id sanitized.

**Terminal query-response junk (`^[]11;rgb:ffff/ffff/ffff^[[3;1R` echoed at the prompt — real report)**
- Root cause: with dtach every attached browser client is a full terminal emulator, so an app's terminal query (OSC 11 background color, `\e[6n` cursor position, DA…) was answered by EVERY attached client — the app consumes one answer and the tty ECHOES the extras as literal junk. Buffer replay on re-attach re-answered the stored queries the same way.
- Server fix (ws-handler `input`): pure query-response chunks are forwarded from ONE designated client only (the size owner, else the oldest attached) when >1 client is attached. Known accepted collision: modified-F3 (`\e[1;2R`) from a non-owner client in a multi-client session.
- Client fix (terminal.js + session-lifecycle.js): while restored buffer content replays, xterm.js's auto-answers to stored query sequences are dropped (`_replaying` flag) — they were answered live long ago.

## 2.100.6 — 2026-07-11

- Terminal font FOUT: on a fresh page load the web fonts (Fira Code etc.) can finish loading AFTER the terminal's first paint, which already cached the fallback glyph in the WebGL texture atlas — so the terminal stayed on an ugly fallback font until a manual font switch rebuilt the atlas (real report: "ugly until I switch fonts a few times"). `_refreshOnFontReady` now explicitly `document.fonts.load()`s the configured family + awaits `document.fonts.ready`, then `clearTextureAtlas()` + refits (with a settle pass) so the terminal repaints in the real font automatically.

## 2.100.5 — 2026-07-11

- Chat links: a local filesystem path opened as an http URL. A **markdown link to a local file** (`[doc](/home/x/y.md)` → `<a href="/home/x/y.md">`) reached the click handler as a URL and `window.open('/home/…')` made the browser resolve it to `http://<host>/home/…`. Now any link whose href is an absolute (`/…`) or home (`~/…`) path that isn't a real URL scheme is reclassified as a file path and opens in the file viewer (centralized in `_linkTargets`, so Open/Copy labels are right too). Bare (non-markdown) absolute paths already classified correctly — this covers the markdown-link case.

## 2.100.4 — 2026-07-11

- Removed the temporary drag tracer (2.100.3's coordinate-space fix confirmed by the user). The viewport→workspace conversion invariant is documented in CLAUDE.md for future drag code.

## 2.100.3 — 2026-07-11

**Drag drift: the REAL fix (coordinate-space mixup, diagnosed from a live trace)**
- 2.100.2's stale-dx fix was correct but not the reported bug. A temporary drag tracer (frames shipped via telemetry from the user's own drag) showed the tracking math was perfect — in the wrong coordinate space: every "center on cursor" re-anchor wrote **viewport** `e.clientX/Y` into **workspace-relative** `style.left/top`. With the sidebar open the window landed a full sidebar-width (~260px) away from the pointer the instant it left its snap, then tracked parallel at that offset — invisible with the sidebar closed, which is why it survived so long.
- Fixed by converting the cursor into workspace space at all seven re-anchor sites: window.js un-snap, un-maximize, merge-ghost leave, desktop-preview leave; tab-group.js tab detach, cursor-follow, merge-leave (tab drag-out had the same parallel-offset bug).
- The diagnostic tracer stays in this build for one confirmation round (snapped/maximized drags only, auto-ships frames on mouseup); removed next release.

## 2.100.2 — 2026-07-11

**Desktop-preview staleness + snapped-window drag drift**
- **Blank preview after switching desktops** (report): lazy-replayed windows get their `gridBounds` from async capture timers AFTER the switcher's last render, and nothing re-rendered it — the newly active desktop's preview stayed white until the next unrelated interaction. `switchTo` now schedules digest-invalidating refreshes (+400ms/+1300ms); verified across a full 3-desktop round trip.
- **Preview rect frozen mid-drag after re-snapping to the same zone** (report): the drag path live-mutates the active preview's rects DIRECTLY, which the switcher's change-digest cannot see — a drag ending on identical bounds skipped the rebuild and the stale rect persisted forever. Every `_captureGridBounds` (drag end, snap timers, resize, applyLayout) now triggers a debounced digest-invalidating `refreshSwitcher()`.
- **Snapped window drifting away from the pointer while dragged** (report): `processMove` computed the drag delta against `startX` BEFORE the un-snap branch re-anchored `initL/startX` mid-frame, then applied the stale delta on top of the new anchor — the window rode at a constant offset equal to the pointer's first-frame sweep (large under rAF coalescing). Position now derives from the current anchor at application time; the un-maximize drag path had the same defect and is fixed by the same line.

## 2.100.1 — 2026-07-11

**Backup & migrate dialog layout fixed**
- The section checkboxes rendered ABOVE their labels (one tall stack per row, endless scrolling — real report): `.dialog-body label`'s `flex-direction: column` out-ranked `.cfg-row` by specificity. Rows are `label.cfg-row` flex-row now, laid out in a **two-column grid** (one column on phones) — the whole dialog fits without scrolling.
- Phone: `createModalShell`'s wide-variant inline `min-width: 440px` overflowed 390px screens past the `width: 95vw` clamp (width and min-width are separate properties) — the mobile dialog rule now forces `min-width: 0 !important`, fixing every wide modal on phones.

## 2.100.0 — 2026-07-11

**Config export covers everything recent (centralized-deployment migration review)**
- Reviewed every store the recent feature era added against Backup & migrate. Already covered (settings section): dashboard panels, agent instructions, stop-nudge thresholds, telemetry toggles, per-session billing configs (userState). Fixed the gaps:
- **Billing accounts now export/import** (sensitive, passphrase-encrypted): API keys are decrypted out of the machine-local store for transport and re-encrypted under the TARGET machine's own key on import; each Claude subscription's creds dir (`.credentials.json`/`.claude.json`) and each Codex account's `auth.json` travel as whitelisted files, recreated 0700/0600 with the codex shared-home symlinks reseeded. Existing ids are never clobbered; defaults carry over only if unset locally. Verified end-to-end on an isolated instance: both subscriptions arrive `loggedIn:true` with correct identities; wrong passphrase rejected.
- **Task Groups were silently unexportable** — the server supported the section since 2.53.0 but the export dialog never had the row, and the import dialog's label map skipped unknown sections. Both fixed (checklists + activity logs + context-dir config ride along).
- **Usage pricing table** (model rates + per-account discounts) is a new export section.
- **clientPrefs** now include language, usage-view account choices, quota-refresh ack and the onboarding flag (gather + import write-back share one key list).
- NOT in the config file by design: the usage **ledger** (data/usage-history/, ~80MB — copy the directory during migration to keep analytics history), session statuses & the For-you inbox (runtime state), caches (usage-cache, remote-jsonl, codex-models-seen).

## 2.99.3 — 2026-07-11

**Dashboard split-series panels (two-dimensional analysis: day × account etc.)**
- A panel can now cross its main dimension with a second one: the editor's new **“Split series by”** select turns a line chart into one line per split key and a bar chart into **stacked bars** — `总 tokens · 按天 × 账号` (per-account daily token burn, the motivating ask), cost per day per model, requests per hour per project, whatever combination. Top-6 split keys by volume keep their own series, the tail folds into “Other”; account/session keys resolve to their display names.
- Server side: `UsageHistory.aggregate` accepts `pivots` (pairs of dimension keys) and returns `pivots['a:b']` rows whose cells carry the same finalized bucket shape as group rows — one pass over the event cache, no extra scans. `GET /api/usage-stats?pivot=day:account,day:model` (validated, ≤6 crosses).
- The window's single fetch requests exactly the pivots the saved panels need (`panelPivots`); an edit or preset that introduces a new cross refetches instead of rendering a hole. The **Account reconciliation preset** now leads with day×account stacked tokens + day×account cost lines.
- Chart.js gotcha fixed in the process: datasets not bound to a configured scale (`yAxisID`) make Chart.js mint a phantom default axis alongside the real one.

## 2.99.2 — 2026-07-11

**Mobile navigation coherence + usage window horizontal-scrollbar elimination**
- **Sidebar now auto-yields on mobile whenever a window opens or gets focused** (real report: card menu → Properties looked like a no-op — the window landed BEHIND the full-screen sidebar overlay). Centralized in `wm.createWindow`/`wm.focusWindow` (`_mobileYieldSidebar`, guarded by `layoutManager._restoring` so boot restore / remote layout-sync never yank the sidebar mid-browse) instead of per-call-site patches — covers Properties, task detail/log, file explorer, View History, viewers, cross-desktop Go-to-window, everything. `_showDialog` closes it too (the `#dialog-overlay` dialogs sit below the sidebar; fork/new-session had per-site patches, now central). Audited the rest: utils dialogs (z 99998) and context menus/popovers (z 99999) already render above the sidebar (z 90000) — no change needed.
- **Mobile window-switcher billing chip no longer strands its menu** (report: tapping the chip closed the window list, leaving the switcher menu floating context-less). The list now stays open underneath — its outside-tap close follows the app's chained-popover rule (taps inside `[data-popover]` / dialogs are child interactions, not dismissals).
- **Usage window: horizontal scrollbars eliminated across sizes** (report: adaptivity was still insufficient). The whole class of blowouts was grid items' default `min-width:auto`: `.udash-grid` tracks are now `minmax(0,1fr)`, panels are `min-width:0` + `container-type:inline-size` (content can never dictate panel width), stat numbers scale with the panel (`font-size: clamp(14px,10cqw,30px)`), tables scroll inside their panel body, `.usage-seg` segments wrap, classic view's `minmax(340px,…)` floors at `min(340px,100%)`, and `.usage-body` is `overflow-x:hidden` as the final guarantee. Verified zero overflow at 420–1100px in both dashboard and classic views.

## 2.99.1 — 2026-07-11

**Current-session billing switcher on mobile + dashboard window-width adaptivity**
- **切换当前会话的 sub**: mobile windows have no title bars, so the desktop's identity badge (the current-session switch entry) simply didn't exist there. Two stand-ins: a **billing chip in the chat status bar** (account name pill next to model/effort, mobile-only — desktop keeps the title-bar badge; fed by the same `syncSessionIdentity` broadcast, click → the switcher menu) and a **billing chip on every mobile window-switcher row** (tap title → each session window shows its account; tap chip → switcher).
- **Usage dashboard now adapts to the WINDOW's width, not the screen's** — `.usage-body` is a `container-type: inline-size` container and the panel grid folds to one column under 700px container width, so a narrow usage window on a wide desktop reflows too (Chart.js re-fits via its own ResizeObserver). The phone media query stays as a no-container-query fallback.

## 2.99.0 — 2026-07-10

**Mobile adaptation of the recent feature batch (usage, quota, multi-account)**
- **Mobile nav gained two entry points** the phone never had (the taskbar — quota pies, inbox, gear — is hidden ≤768px): a **⚙ gear** opening the full gs-menu (Usage window, Manage agents, Diagnostics report, Settings, Backup…) and a **worst-of quota donut chip** (max utilization across all Claude/Codex buckets, usual green/amber/red coloring) opening the usage popup — 剩余用量 + the per-account switcher chips now fully reachable on phones.
- Usage popup + global-settings popover render as full-width sheets under the nav bar on phones (stylesheet `!important` clamps deliberately beat the JS anchor's inline position).
- **Usage dashboard: one panel per row on phones** — the 2-col grid pushed the right column off a 390px screen. Also fixed `.udash-add` forcing an implicit second grid track via `grid-column: span 2` (→ `1 / -1`, correct at any column count), which kept the whole grid at 712px even in 1-col mode.
- **Billing switcher from the session card context menu** (right-click / long-press → “Switch billing…”): `showBillingSwitcher` now accepts a session object + `{x,y}` anchor — no window needed, which is what phones require (no title bars → no identity badge). A stopped session's “current” account is its saved on-resume config. Desktop badge path unchanged.
- Verified on a 390×844 viewport: task-log viewer, Manage Agents dialog (account rosters + donuts), and the Diagnostics report already render well full-screen — no changes needed there.

## 2.98.0 — 2026-07-10

**Dashboard: ONE chart engine for everything (Chart.js v4, modular)**
- Replaced uPlot + homegrown bars/donut with Chart.js across all chart types — line, bar and doughnut now share ONE interaction model: hover tooltips with per-metric formatting, clickable legends (toggle series), subtle animations, uniform theming from CSS tokens. uPlot removed (it can't do donuts; two chart engines was the inconsistency being complained about). Modular registration keeps the cost at ~150KB.
- Bars auto-orient: sequential dimensions (hour/weekday/day) render vertical, categorical (model/account/project) horizontal; multi-metric bars get per-unit dual axes like lines.
- Chart lifecycle managed: instances destroyed before every re-render and on window close (Chart.js keeps a global registry + per-chart ResizeObserver — undisposed instances leak).
- Fixed a black-charts regression: color resolution probed computed styles in a detached DOM tree — panels now attach to the document before charts render.
- **Richer presets** (5 now): Cost overview (8 panels incl. hour-of-day cost), Token throughput (cache read/write/fresh-input grouped bars, hit-ratio+requests dual line), Account reconciliation (multi-metric table + grouped bars), Time patterns, NEW Model comparison (cost/requests donuts + 4-metric table + output-vs-input bars).

## 2.97.0 — 2026-07-10

**Dashboard: multi-metric panels on uPlot**
- Adopted uPlot (~50KB, the time-series engine Grafana's ecosystem uses) for line charts — the one place a focused library beats hand-rolled canvas. Donut/bars/stat/table stay dependency-free.
- A panel now takes MULTIPLE metrics (`metrics: []`, editor = checkbox grid; old single-metric configs migrate transparently): line charts render one series per metric with **automatic dual axes by unit** (cost $ left, requests count right — mixing units Just Works), live legend with hover readouts and per-series toggling, and resize-aware fitting.
- Grouped bar rows (per-metric bars normalized to their own max + mini legend), stat panels render a row of big numbers, tables use the selected metrics as columns. Default presets show it off (cost+requests dual-axis trend; total+output tokens).

## 2.96.0 — 2026-07-10

**Usage window: configurable panel dashboard (Grafana/Posthog-style)**
- A panel = METRIC × DIMENSION × CHART: 9 metrics (est. cost, requests, total/output/fresh-input/cache-read/cache-write tokens, cache hit ratio, sessions) × 11 dimensions (total, day, model, account, billing, project, mode, host, hour, weekday, session) × 5 chart types (big-number stat, bar rows, line, donut, table). All panels feed off the single existing /api/usage-stats fetch.
- Per-panel ✎ editor (metric/dimension/chart/top-N/width) and ⋯ menu (move, half/full width, remove); "+ Add panel"; four presets (Cost overview / Token throughput / Account reconciliation / Time patterns) under the Panels… menu; the pre-2.96 fixed layout survives as "Classic view".
- Layout persists in settings (`usage.dashboard`) → synced across clients like all settings. Charts are dependency-free (canvas line, conic-gradient donut, DOM bar rows) and fully theme-tokened.

## 2.95.0 — 2026-07-10

**Telemetry: full observation-point sweep**
- Client: `ws-outage-ms` (per reconnect — verified capturing a real 9.7s restart outage), `gap-slab-load-ms` (huge-session scroll slabs, both directions), `history-render-ms` (chat attach render), `chat-search-ms` (streaming full-file search), `session-create-roundtrip-ms` (create → created), `upload-mbps` (>1MB uploads).
- Server 5-min sampler additions: `srv-ws-clients`, `srv-subagent-watchers` + `srv-normalizer-msgs` + `srv-buffer-files` (leak canaries for the exact classes the 2.81–2.91 audits kept finding), rolling HTTP window (`srv-http-reqs-5min` / `avg-ms` / `max-ms`) with slow-request events (>1.5s, route sanitized to 3 path segments — user paths never enter the ledger), `srv-usage-scan-ms`, and `srv-jsonl-parse-ms` (slow tail re-parses >200ms, via a zero-coupling global hook).
- First real finding on day one: the server event loop blocks for seconds during boot (restoreSessions' synchronous scans) — now measured instead of anecdotal.

## 2.94.0 — 2026-07-10

**Telemetry: performance metrics**
- Client (passive, numbers-only): `boot-to-ready-ms` (nav start → workspace restored), `js-heap-mb` + `dom-nodes` + `open-windows` sampled at +30s then every 10 min (the long-lived-tab leak signals), and long-task jank aggregated per minute (`longtask-count/max/total`) via PerformanceObserver. Metrics have their own 500-sample budget so periodic sampling can't eat the error cap.
- Server: `srv-rss-mb` / `srv-heap-mb` / `srv-evloop-max-lag-ms` (1s-probe max drift) / `srv-live-sessions` every 5 min.
- Diagnostics report gains a Performance metrics table: n / p50 / p95 / max / latest per metric. Aggregation lives in `Telemetry.summary()` (`kind:'metric'` records carry a numeric `value`).

## 2.93.0 — 2026-07-10

**File-split backlog closed — every named split landed**
- server.js → src/agent-routes.js (`setupAgentRoutes`, 375 lines: user-todo / session-status / task-context / prompt-context / stop-check / task CRUD endpoints + injection helpers) on top of 2.92.0's usage-cluster split; server.js 3306 → 2578 lines.
- file-explorer.js → file-explorer-uploads.js (upload popover/batches/history/ring) + file-explorer-ops.js (context/background menus, clipboard, rename/delete/duplicate, archive ops, properties); 1668 → 1113 lines.
- app.js → setup-flows.js (onboarding wizard, Backup & migrate, password dialogs, diagnostics report); 2082 → 1817 lines.
- Every extraction verified with the free-identifier lint (eslint no-undef) + a live boot/dialog smoke — the class of silent boot crash that bit the 2.82.0 and 2.92.0 splits (esbuild and node --check both pass free identifiers).

## 2.92.0 — 2026-07-10

**Design-audit backlog: ALL six deferred items closed**
- Full i18n for the file explorer, file/hex viewers and the workflow detail window (+171 keys, zh/ja complete, params/orphans audited; `tc('table','Columns')` disambiguates table columns from grid column count).
- Menu-label casing standardized (review menu Title Case → sentence case; `Custom...` unified to `Custom…` everywhere; dictionary keys migrated in lockstep).
- Modal shells deduplicated: one `createModalShell` helper in utils.js now backs 8 formerly hand-rolled overlays (−62 lines; per-site close-lifecycle side effects preserved; deliberately NOT data-popover — the global Escape blind-remove would skip onClose side effects).
- path-autocomplete dedup verified already done (stale backlog entry — all 7 consumers route through setupDirAutocomplete).
- CSV/XLSX/PPTX viewers restyled from inline styles onto viewers.css classes with theme tokens (virtual-scroll offsets/slide transforms stay inline — genuinely dynamic); CodeMirror light theme accent-derived via color-mix into light surfaces.

**Splits (perf backlog, part 2)**
- chat-view.js gap-seek machinery (17 methods, ~390 lines) → src/lib/chat-view-seek.js prototype mixin.
- server.js usage/rate-limit cluster (536 lines) → src/usage-routes.js setupUsage() (verified with a stub-eval harness after two free-identifier boot crashes — esbuild/node --check don't catch those).

**Fixes**
- Telemetry-captured gap-seek crash: `_extendTop`'s insertion anchor used a bare `.chat-msg` selector that can match a NESTED element → NotFoundError; now `:scope >` + validated fragment insert.

## 2.91.0 — 2026-07-10

**Audit round-3: all 10 remaining verified findings landed** (each adversarially verified against real data before fixing)
- Server: `_lastAttrib` capped (cap-only — delete-on-kill would re-append duplicate attribution lines on resume); remote-transcript cache cleaned on host removal + 30-day boot sweep for orphans; rclone mount logs drop to NOTICE (the INFO vfs heartbeat grew logs unrotated for weeks and polluted the failure diagnostic tail).
- Leaks: host-bootstrap dialog's ws handler (TDZ + orphan-removal path, now self-unregistering); CodeEditor's document-level theme MutationObserver (now tied to the window's abort signal — the onClose chain missed closes during the initial async load); Google-Drive OAuth token poll dies with its dialog instead of running 10 more minutes.
- Hot paths: chat minimap visible-range scan breaks at the viewport edge and resumes from the last frame's index (was getBoundingClientRect on EVERY rendered message per scroll frame); taskbar Move mode is rAF-coalesced like every other drag path; sidebar merge builds a webui Map once instead of an Array.find per system session (O(n×m) on 5000-entry lists per 5s poll); minimap live-turn append is incremental (was a full marker rebuild per message).

## 2.90.1 — 2026-07-10

- Layout-sync hardening: the user-dirty send gate now EXPIRES 60s after the last real input. A client whose dirty bit stuck (an idle tab left open, a stray automation client) used to echo STALE window positions after every remote apply — reverting other clients' fresh drags and replaying old layouts after drag end (observed as "multi-client sync broken: drags don't propagate, then old drags replay"). The echo carries a fresh seq, so the anti-ping-pong seq guard can't catch it; expiring the dirty bit closes the hole at the source.

## 2.90.0 — 2026-07-10

**Deleting the active desktop no longer wipes the adjacent desktop's layout (real report)**
- `deleteDesktop` on the active desktop hand-rolled its switch: it only un-hid windows already IN THE DOM. A target desktop never visited since page load keeps its windows only in saved state (they lazy-replay on first `switchTo`) — so it presented EMPTY, and the closing autosave then persisted that emptiness over the target's real layout. Repro: create a desktop → switch to it → delete it → the previously-last desktop's layout wiped (and its taskbar preview went blank). The delete now runs the FULL `switchTo` pipeline (lazy window replay + grid restore), waits out an in-flight switch (whose re-entry guard would otherwise leave the active pointer on a deleted desktop), and falls back to the old path only if the switch bails.

## 2.89.3 — 2026-07-10

- Manage Agents → Agent instructions is now a collapsed-by-default advanced section grouped with the VibeSpace integration row (summary shows "customized" when any field is set). Layout redone: labelled field per injection surface, and the stop-nudge conditions read as complete sentences with the number inputs embedded inline (they used to wrap one word per line).

## 2.89.2 — 2026-07-10

**THE restart history-truncation bug (root cause of "重启之后消息都没了")**
- A 2.80.0 typo in the hook-card normalizer (`output` instead of `raw.output`, message-manager.js) threw a ReferenceError on EVERY `system/hook_response` record. The live path swallowed it per-line, and hook_response exists only in the stdout buffer (never in the JSONL), so it hid for 9 releases — but the attach-time HISTORY REBUILD after a server restart crashed at the first buffered hook record, amputating everything after it: later replies missing, stale user message pinned at the end, pending tool cards gone. Adversarially root-caused with an offline reproduction over the affected session's real data (3,946 messages restored vs 3,883 truncated).
- Hardening so this class can't recur: `convertHistory` isolates each record (a malformed record skips, never amputates), and `_historyLoaded` is set only AFTER a successful rebuild (set-before-work turned one crash into a permanently truncated view because re-attaches skipped the rebuild).

## 2.89.1 — 2026-07-10

**Restart data-loss hardening (real incident chain)**
- The 30s-post-boot orphan sweep (2.83.0) keyed on activeSessions — a live dtach session the restore didn't re-adopt in time had its buffer UNLINKED while the wrapper kept writing the deleted inode: live streaming looked fine, but every later restart rebuilt history without the buffer. Sweep is now AGE-BASED (only files untouched for 7 days; dead buffers stop being written, so age is race-free by construction).
- Session-meta tombstones: teardown deletes the meta, but debounced/straggler writers could fire after the delete and resurrect the file from a partial object — sockNames are unique per spawn, so writes to a tombstoned name are now dropped.

## 2.89.0 — 2026-07-10

- **Stop-nudge firing conditions configurable**: `agents.stopNudgeStaleMinutes` (default 10, clamp 1–240) and `agents.stopNudgeCooldownMinutes` (default 30, clamp 2–720) — editable inline next to the stop-nudge text in Manage Agents → Agent instructions, and in Settings.
- Tab groups no longer show a stray "global" billing badge left of the tabs (the host's pre-merge standalone badge survived the merge); badges now live ONLY on tab items while grouped, and the last remaining window gets its standalone badge back immediately when a group dissolves.

## 2.88.1 — 2026-07-10

- Billing badges on tabbed windows: tab-bar rebuilds (switch/merge/detach/drag) destroyed the badge span while the identity-keyed no-op guard prevented re-insertion until the billing identity changed — badges randomly vanished on grouped windows. The guard is now self-healing (verifies the badge actually exists before skipping), tab-bar renders re-apply all tabs' badges immediately, and a detached window's standalone title bar gets its badge back.

## 2.88.0 — 2026-07-10

**Mid-turn user messages no longer vanish from history (real data-visibility loss)**
- Messages sent while the agent is working are recorded in the JSONL ONLY as `queued_command` attachments — never as user records. The normalizer dropped every non-hook attachment, so any history rebuilt from the JSONL (server restart, resume under another account, view-only) silently ERASED the user's own words — 211 records in one real session. Now rendered as normal user messages (typed-flagged, echo-deduped against the live buffer copy).

**Per-hook agent instruction customization (Manage Agents → Agent instructions)**
- The single preamble box is now three fields, one per injection surface, each with its own cadence and cost profile: **Session context** (once per session + on edit, ≤4000), **Per-turn reminder** (rides at the very top of EVERY prompt — even on prompts that carry a bigger delivery, and even with the standard tool reminder off; ≤500), **Stop nudge** (prepended to the end-of-turn bookkeeping reminder; ≤500). Settings keys: `agents.injectPreamble` / `agents.perTurnExtra` / `agents.stopNudgeExtra`.

## 2.87.0 — 2026-07-10

**Server-side settings reads were ALL broken (real config bug)**
- 9 server code paths read settings via `getSyncStore('settings')` — the dormant, EMPTY migration-target store — instead of data/settings.json where /api/settings actually persists. Every server-honored setting silently behaved as its default no matter what you configured: `accounts.onDemandQuotaRefresh` (off/auto modes never applied), `accounts.activeUsagePolling`, `accounts.shipSubscriptionToRemote` (could never be enabled), `agents.perTurnToolReminder` / `agents.stopBookkeepingNudge` (couldn't be turned off), `telemetry.enabled` / `telemetry.forwardUrl`, `chat.hideEmptyHooks`. New `serverSetting()` reads the real store (persistence.js exposes its cached `readSettings`); all sites migrated and E2E-verified.

**Custom agent instructions (Manage Agents → Agent instructions)**
- A user-configured preamble injected at the TOP of every VibeSpace hook delivery (`<vibespace-user-instructions>` block) — customize fleet-wide agent behavior (reply language, house rules). Delivered once per session and re-delivered when edited (sha-gated), never per turn. Textarea in Manage Agents; also a Settings entry (`agents.injectPreamble`, ≤4000 chars). Works for claude (SessionStart) and codex (prompt-context) alike.

**Fixes**
- Billing switch / resume no longer teleports the conversation into a default centered window: the old window's geometry (bounds, pre-snap size, maximized) is snapshotted before kill and applied to the resumed window; plain resume of a terminated read-only window inherits its geometry the same way.
- A user message that happens to START with hook-ish text (e.g. pasting "Stop hook feedback: …") is no longer misclassified as a dim notification card: provenance now beats text shape (CLI's promptSource marker / our _fromWebui flag → real user message; isSynthetic → notification).
- Stop-hook block reasons and other tagged notifications were hard-truncated at 80 chars with no way to read the rest — now full text behind the expander (generic Stop hook feedback gets its own labeled card).
- Perf (audit round 3, adversarially verified): subagent fs.watch handles + double-buffered transcripts leaked for agents that never emit task_notification (interrupted turn / CLI death) — 10-min inactivity sweep at turn end; /api/usage codex fallback no longer walks the entire ~/.codex/sessions tree every 30s (date-pruned to 14 days) and the session-meta account map is TTL-cached 60s.

## 2.86.0 — 2026-07-10

**Checklist items get the summary+detail split (matching Activity entries, 2.69.0)**
- A checklist item now carries an optional `detail` (≤6000 chars: acceptance criteria, paths, background) next to its one-line text — no more cramming full context into one line.
- Log viewer checklist tab: items with detail expand in place (†), every item has ✎ **inline edit** (text + detail) and the add-row has a † toggle for attaching detail to new items; attribution tooltips show full timestamps; markdown export includes details as blockquotes.
- End-to-end: `vibespace-task plan-add "text" --detail "..."`; `show` marks † and `show --full` prints them; TASK.md renders details as blockquotes; the injected context stays dense († marker only, budget-safe) and teaches agents to read details via `show --full` before picking an item up; repo export/import round-trips details.
- task-detail compact editor: † on detailed items expands in place (full editing lives in the ⧉ viewer).

## 2.85.0 — 2026-07-10

**Task Group log viewer (Checklist + Activity outgrow the detail editor)**
- New full-window viewer (`src/lib/task-log.js`, window type task, openSpec `openTaskLog`): two tabs — **Checklist** (open/done sections, write-through checkboxes, add/delete) and **Activity log** (all entries newest-first, grouped by day with per-day counts, † details expand inline). Text search, per-session filter dropdown, "Copy as Markdown" of the current filtered view.
- **Session attribution everywhere**: activity rows show the filing session as a chip (resolved to its display name; click a chip to filter to that session); checklist items now record who queued them (`addedBy`/`addedAt` — agent session key or `user` for UI adds) and who ticked them (`by` existed, `doneAt` new). Older items simply have no chips.
- Entry points: ⧉ buttons on the Checklist and Activity sections in task-detail, and "Checklist & activity…" in the board header context menu.

## 2.84.0 — 2026-07-10

**Observability (for team rollout iteration)**
- Local-first telemetry: client global error capture (window.onerror / unhandledrejection / App-constructor boot crashes — installed BEFORE App so the "silent blank page" class is caught), coarse feature events (window opened, session created — names only, never content), server fatals. Appends to `data/telemetry/events-YYYY-MM.ndjson`; nothing leaves the instance unless `telemetry.forwardUrl` is set (team deployments: batches POST with an anonymous per-instance id).
- ⚙ → Diagnostics report…: grouped recent errors (with stacks), events/day chart, by-event and by-version tables — rendered in the embedded browser.
- Settings: `telemetry.enabled` (default on, local-only), `telemetry.forwardUrl` (default empty).

**Usage ledger attribution fix (real data bug)**
- A newly added subscription showed usage from BEFORE it was registered: `_acctAt`'s "request predates the first attribution entry" fallback billed pre-binding history to the account's earliest entry, and the meta-account fallback did the same for the initial backfill (the ledger shipped 2.61.0 and scanned week-old transcripts AFTER accounts were attached). Fixed: pre-binding requests → global (10-min grace for spawn-ordering skew); one-time rebake re-attributed 20,304 baked events (94% of one account's total was misattributed).

**Fixes**
- Embedded browser: `blob:`/`data:` URLs no longer get an `http://` prefix (blank iframe) — this had silently broken the chat html Preview button too.

All notable changes to this project will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/),
and this project uses [Semantic Versioning](https://semver.org/).

## [2.83.0] — 2026-07-10

### Performance — audit round 2 (6 agents: server + cross lanes, 4 verifications)
Server, weeks-uptime class:
- Killed sessions leaked every subagent fs.watch/retry-timer/normalizer (the
  kill path deleted the session before onExit's teardown could run — teardown
  now runs inside the kill case); completed agents' buffered messages are
  freed 60s after task_notification (previously retained twice, unbounded).
- Codex sessions were renamed on EVERY tool call (function_call payload.name
  is the tool name) — two sync meta writes + two broadcasts each, forever.
  Names now come only from session_meta/wrapper_meta.
- /api/sessions: cache TTL 2s→4.5s (every 5s poll used to miss), per-session
  blocking pgrep now 15s-cached, codex /proc fd-walk 10s-cached. Measured:
  0.36s sweep → 0.011s cached poll.
- Unbounded maps capped: _lastAttrib, _sessionMetaCache, _realCwdCache.
Client, days-uptime class:
- Live pinned chats now trim their DOM (verified: trim previously ran only on
  pagination — a streaming chat open for days grew without bound).
- Desktop switcher no longer rebuilds all previews on every window
  mousedown/focus/blink (digest guard); Session Properties debounces its
  full re-render off the 5s broadcast storm; sidebar text filter debounced;
  session-status broadcasts skip identical snapshots; workflow-detail and
  read-only-view polls back off while the tab is hidden; usage pies/popup
  skip identical HTML; syncSessionIdentity indexes sessions once per merge;
  language-picker list memoized; terminal fit-timer/paste-pad cleaned on
  dispose; onboarding keydown released on finish; taskbar hotzone listeners
  no longer stack; fork/create pending-name maps cleaned on window close;
  subagent viewer attach handler self-guards (documented invariant).

## [2.82.0] — 2026-07-10

### Refactor — app.js split into prototype mixins (3,861 → 2,045 lines)
Three cohesive clusters extracted verbatim (AST-based, acorn) into
install-mixins following the existing sidebar-*.js pattern: manage-agents.js
(accounts dialog/rosters/wizard), usage-meter.js (quota pies + popup +
on-demand refresh), session-lifecycle.js (create/attach/resume/fork/view/kill
+ billing switcher + openSpec replay). Zero call-site changes — everything
still runs as App methods. Smoke-verified live: window restore, badges,
usage popup, shell terminal create/close, Manage Agents rosters.

## [2.81.0] — 2026-07-10

### Performance — long-session leak fixes (multi-agent audit, round 1)
- FileExplorer gained a real dispose(): its ws handler + ResizeObserver +
  in-flight upload XHRs used to outlive the window and pin the whole instance
  (detached DOM included) forever. Verified: handler count returns to baseline
  on close.
- Terminal scroll-up output queue is capped (4MB→keep 2MB): a busy agent left
  unpinned for hours grew one giant string toward hundreds of MB that xterm
  discarded at repin anyway.
- Upload history pruned to the newest 100 entries (grew forever, synced to
  every client on every load).
- Server: session buffer/wrapper-meta files now unlink on real teardown + a
  boot sweep removes orphans (193 files / 28MB swept on first run).

### Added — running workflows visible in the chat status bar
Dynamic-workflow launches show a live chip (name + done/agents, 8s poll while
running) in the session's status bar; click opens the live workflow detail
window. Chips re-arm after refresh from the loaded history tail.

## [2.80.1] — 2026-07-10

### Fixed — title-bar billing badges vanished on fresh page loads
Identity sync (badges, title metadata) was gated behind the sidebar's
change-digest; 2.72.0 made the digest so stable that a freshly loaded page —
whose windows restore after the first merge — never got badges at all. The
sync now runs on every merge (it is internally no-op-guarded).

### Changed — hook cards: full content, standard toolbars
Hook outputs are never truncated anymore (20000/600-char caps removed). The
expandable body starts word-wrapped, carries the standard Wrap/Copy toolbar,
and the summary row gains an Editor button that opens the full payload in a
temp editor.

## [2.80.0] — 2026-07-10

### Fixed — injected hook context is now actually visible
The context a hook injects rides its own attachment type
(hook_additional_context) which the 2.77.0 renderer didn't handle — so
context injections never showed. They now render as "✓ Hook context:
<tag>" cards with the full payload expandable, deduped against the same
hook's stdout copy by content.

### Added — hook visibility settings
`chat.showHookCards` (default on): hide ALL hook cards — a pure CSS toggle,
applies to open chats instantly. `chat.hideEmptyHooks` (default on): hooks
with no output render no card; turn off to see every hook event (applies to
newly loaded history).

## [2.79.2] — 2026-07-10

### Fixed — "N hooks ran" dumped raw shell scripts inline
hookInfos often carries no name, only the command — which can be an embedded
~1KB shell script (claude-mem's is), and 2.76.0's "name the hooks" change
pasted it inline. The summary now shows short script names ("3 hooks ran
(vibespace-hook.mjs, bun-runner.js, hook.mjs)") with the full commands behind
the expandable card body.

## [2.79.1] — 2026-07-10

### Fixed — empty hook cards flooding the chat
2.77.0 rendered a card for EVERY hook attachment; hooks like PostToolUse fire
per tool call with no output (or just the {"continue":true} protocol ack) and
flooded the view. Successful hooks now render only when they produced real
content (protocol-ack JSON unwrapped to its additionalContext; stderr-only
warnings from successful plugins ignored); failures always show.

## [2.79.0] — 2026-07-10

### Added — stop-time bookkeeping nudge (with teeth)
When an agent finishes a turn while its board state is stale (no vibespace-
status update in 10 minutes), it now gets one short follow-up — set your
status, mirror open questions to the inbox, log finished work — and then
stops. Claude: a blocking Stop hook (stop_hook_active-guarded, never loops).
Codex: the wrapper fires the same server arbiter at turn/completed and runs
one synthetic bookkeeping turn (the app-server has no blockable Stop in
JSON-RPC mode). At most once per 30 minutes per session; setting
`agents.stopBookkeepingNudge` (default on) disables it.

## [2.78.0] — 2026-07-10

### Added — per-turn tool micro-reminder for agents
Every prompt you send now carries a one-line (~330 byte) reminder of the
vibespace tools (status / ask / task) when no bigger context is being
delivered — the full rules injected at session start scroll out of the
agent's working context over long sessions and tool usage decays. Setting
`agents.perTurnToolReminder` (default on) turns it off. Claude receives it
via the UserPromptSubmit hook, Codex via the wrapper's per-turn inject.

## [2.77.0] — 2026-07-10

### Changed — multi-group injection is layered, and truncation is now recoverable
Per-group blocks meant group 1's activity log could push groups 2..N entirely
out of a truncated view. The payload is now layered: every group is named on
line 1, then the tool rules once, then all identities, all shared folders,
all activity logs (budget-converged; 3 groups = 8.1KB vs 10.2KB before).
Verified empirically how the CLI handles oversized hook context (30KB marker
probe): it persists to disk and shows a 2KB head preview that NAMES the full
file — so both payload shapes now open with one line teaching agents to Read
that file first. Truncation degrades by layer and is self-rescuing.

### Added — hook details visible in chat history
Hook attachments in the transcript (name + full output, including injected
context) now render as expandable ✓/✗ Hook cards in history replay, and the
"N hooks ran" summary names the hooks. Live/replay double-render deduped.

## [2.76.1] — 2026-07-10

### Changed — vibespace-ask semantics: mirror every chat question
Per user directive: agents must file an inbox item WHENEVER they ask the user
something in chat (or end a turn waiting on decision/input/review) — not only
for "things that specifically need the user" — because the user is often not
watching that window. And the moment the user answers anywhere (chat counts),
the agent resolves the item itself. Rewritten in all three teaching surfaces
(no-task intro, task-group context, the CLI usage text). Payload budgets
re-measured: single 7.4KB, 2-group 7.2KB, 3-group 10.2KB (tools still first).

## [2.76.0] — 2026-07-10

### Fixed — multi-group sessions could never learn the vibespace tools
A session in 2+ Task Groups got the "How to report back" section repeated per
group (2 groups = 9.8KB, 3 = 15.7KB) — past the hook persist threshold, so
those agents saw only a ~2KB head preview and never learned vibespace-ask /
shared-context (the 2.68.0 failure, back through a different door). Now the
tools section is emitted once, FIRST (byte ~158), and per-group log budgets
shrink until the total fits: 2 groups = 6.9KB inline, 3 = 10.0KB with the
rules still inside any preview.

### Fixed — localization audit (user-requested)
Full sweep of today's 8 releases: coverage-gap + param/tag parity checks were
clean except 'Preview'; a multi-agent review of every changed file found three
unwrapped tooltip/label strings (billing-badge 'Console login' / 'API key',
metadata popup 'uuid'). All wrapped, dictionaries complete (zh/ja 1126 keys).

### Fixed — `vibespace-ask --help` filed "--help" as a user todo
Observed in real data. help/-h/--help (and any flag-looking first argument)
now print usage instead of filing an item.

## [2.75.2] — 2026-07-10

### Fixed — account roster donut columns misaligned
The "last refreshed" age label only rendered when >5 min old, so a freshly
refreshed row's right-aligned donuts shifted 28px relative to its neighbors.
The age slot now always renders at a fixed min-width (and switches to hours
past 99 min); measured: donut and star columns identical across all rows.

## [2.75.1] — 2026-07-10

### Fixed — relative-path links now find files deeper than the session folder
Clicking `SCRIPTS.md` failed when the file actually lived at
`cwd/default_voice_examples/SCRIPTS.md`. After the direct candidates miss, the
resolver now runs a bounded server-side search under the session cwd (depth 5,
deps/VCS pruned, 3s cap): a single hit opens directly, several hits show a
picker. Verified on the exact conversation that prompted the report.

## [2.75.0] — 2026-07-10

### Fixed — CRITICAL: sessions created after the service migration died on every restart
systemd's default KillMode=control-group killed every dtach session spawned by
the service on each restart (pre-migration sessions lived outside the cgroup
and survived — which is why only newly-resumed sessions kept "terminating").
The unit now uses KillMode=process: only the node server is killed; dtach
masters survive. Verified: a freshly resumed session's master lived through a
restart and reconnected.

### Added — relative-path linkify + click-time resolution
Agents reference files as `SCRIPTS.md`, `generate.py`, `B2BTasks/x/final/` —
absolute-only linkify missed all of it. Backtick code spans that look like a
relative path or filename are now clickable: Ctrl+click resolves against the
session cwd (direct join, overlap-merge on a shared segment, cwd parent; first
existing candidate opens in the right viewer/explorer, host-aware). Injected
session context now also teaches agents to write absolute paths. ```html code
blocks get a Preview button (renders in the embedded browser).

## [2.74.0] — 2026-07-10

### Added — per-message metadata popup
Right-click a chat message's left color strip (long-press on touch) to see
everything known about that record: serving model, token usage (input / cache
read / cache write / output), service tier, stop reason, request ID, message
ID, uuid, transcript line — with click-to-copy ids and a Copy-as-JSON button.

### Added — one-step update
`./scripts/update.sh` pulls, installs, builds, and restarts the service in one
go; ⚙ → "Update VibeSpace…" runs it in a shell terminal (which survives the
restart thanks to dtach). The systemd unit also gained the PATH fix (hotfix)
so spawned CLIs resolve claude/codex under systemd's minimal environment.

### Fixed — tool calls no longer show "Interrupted" after a server restart
A long-running tool survived the restart fine (dtach), but the history replay
appended every stream-json-only record (earlier turns' `result`s) after the
whole JSONL — so a stale result replayed after the still-pending tool_use and
flushed it to ✗ Interrupted. The JSONL+buffer merge is now position-preserving.

## [2.73.0] — 2026-07-10

### Added — systemd user service
`./scripts/install-service.sh` installs VibeSpace as a systemd user service
(`vibespace.service`): Restart=always (verified surviving SIGKILL),
OOMScoreAdjust=-500, unlimited start retries for late-appearing network
mounts, lingering enabled so it runs without an active login. Manage with
`systemctl --user restart vibespace`, logs via `journalctl --user -u
vibespace`. The service runs a prebuilt tree — build at deploy, then restart.

## [2.72.0] — 2026-07-10

### Added — on-demand quota refresh is now configurable, with a warning
New setting "On-demand quota refresh": Manual (default — ⟳ button only),
Auto (also once on popup open when scoped data is >30 min stale), or Off
(never contact Anthropic; the server refuses too). The first ⟳ click shows a
one-time explainer of exactly what the call is. The setting description spells
out the risk model: user-initiated /usage-equivalent traffic vs the background
polling that has gotten accounts banned.

### Fixed — sidebar re-rendered every few seconds (Remote tab / expanded cards flicker)
The change-digest was order-sensitive while discovery orders sessions by
transcript mtime — with several busy sessions the array reshuffled on nearly
every 5s poll with zero content change (measured live: 5058 entries, 0
changed), fully re-rendering the sidebar. The digest is now order-insensitive;
25s instrumented after the fix: 0 re-renders.

## [2.71.0] — 2026-07-10

### Added — billing identity on every window title + in-place switching
Every Claude/Codex window now carries a billing chip in its title bar
(subscription account name / CLI login as a neutral chip, API keys amber,
codex accounts included). Clicking it opens a switcher: pick another account,
confirm, and the session restarts on it with the conversation continuing via
resume (a true in-process swap is impossible — the account is spawn env). The
choice persists as the session's per-session config, and it also works on
already-terminated read-only windows.

### Fixed — terminated windows lost their identity
After a sidebar terminate, the read-only window's Resume button silently did
nothing and focusing the window no longer highlighted the session in the
sidebar — the live-list entry is gone at that point. Both paths now fall back
to the identity captured in the window's openSpec.

## [2.70.0] — 2026-07-10

### Fixed — Fable weekly quota back in the usage popup
The passive statusline feed only ever carries the 5h/7d windows (verified
against the CLI 2.1.206 payload builder) AND each passive write clobbered the
stored model-scoped buckets to [] — so Fable vanished with 2.60.0. Now: the
statusline hook preserves scoped data, and a new user-initiated
`POST /api/usage/refresh` (popup ⟳ / auto on open when >30min stale, ≥60s per
account, honors 429 backoff, never scheduled) fetches the full window set —
the human-gated equivalent of running /usage in the CLI. Scoped bars show
their own "as of" age.

### Changed — Manage Agents usage readouts are mini donuts
Per-account usage in the rosters is now compact conic-gradient donuts
(5h / 7d / scoped), same visual language as the taskbar quota pies, replacing
the wide label+bar+percent rows.

### Performance — Usage window no longer re-reads the ledger per request
/api/usage-stats re-read + re-parsed every shard on every request — seconds of
CPU at 218k events, and 18s observed while a concurrent full-disk scan was
saturating IO (contention, not baseline storage latency). Events are now
cached in memory with append-only incremental reads, scan() is throttled
(15s), session-meta reads are TTL-cached, and the ledger warms at boot.
18s → ~0.3s under load; also immune to future background-IO contention.

## [2.69.1] — 2026-07-10

### Fixed — "For you" inbox: details viewable, origin session visible
Item details now render behind a collapsed "detail" expander on BOTH open and
resolved rows (previously resolved rows showed no detail at all). Resolved
rows also name the session that filed them and jump to it on click, same as
open rows. Expander clicks no longer bubble into the jump-and-close.

## [2.69.0] — 2026-07-10

### Added — summary + detail split for agent reports
`vibespace-task progress` and `vibespace-status` now take a one-line summary
plus an optional `--detail "full context"`. Everything inline shows only the
summary — board rows, status chips, and the injected context (entries with
detail carry a `†` marker) — so the byte-budgeted injection fits far more
history without losing information. Details are on demand: `vibespace-task
show --full`, click-to-expand rows in the Task Group window, a "detail"
expander in Session Properties, and indented blockquotes in TASK.md.

## [2.68.0] — 2026-07-10

### Fixed — agents never learned the vibespace tools (hook payload truncation)
Field report + forensics from an agent: Claude Code persists an oversized hook
context to disk and shows the agent only a ~2KB head preview — and our payload
put a ~24KB Activity log FIRST with the tool instructions LAST, so agents saw a
pure-log preview and never discovered `vibespace-task/-status/-ask` (observed:
almost no tool usage fleet-wide). The injected context is now ordered
identity → objective/checklist → **tool instructions** → shared folder →
Activity log last, and the log is byte-budgeted (whole payload ≈8KB, stays
inline; newest entries win, with a "last N of M" pointer). Multi-group
sessions split the budget. Real-data check: 27.5KB → 7.9KB with instructions
starting at byte 557.

## [2.67.4] — 2026-07-10

### Fixed — the Ctrl+G "blank terminal" was a scroll bug, not a renderer quirk
Investigation (buffer forensics on two identically-spawned sessions) disproved
the earlier "fullscreen renderer" explanation: neither session ever used the
alt screen and both had identical env — the content was there all along, but
the editor-open path called `fit()` WITHOUT the follow-up `scrollToBottom()`
(the close path had it), so the shrunken viewport could park in the blank
region below the content — randomly per window, which is why two windows
"behaved differently". Now the open path scrolls to bottom; the centered
explainer remains only as a fallback for genuinely empty buffers, with honest
neutral wording.

## [2.67.3] — 2026-07-10

### Fixed — Ctrl+G editor toolbar buttons were never styled
The split-editor's Wrap/A-/A+/Theme buttons had NO CSS rule at all — raw
browser-default buttons (thick borders, wrong font), which the design pass
missed because `external-editor.js` sat in no auditor's file list. They now use
the canonical secondary-button recipe. A follow-up sweep for other JS-built
buttons with no CSS rule confirmed this was the only one.

## [2.67.2] — 2026-07-10

### Fixed — Ctrl+G polish: no more mouse-garbage or mystery blank pane
While the CLI waits on the Ctrl+G editor its fullscreen TUI leaves the alt
screen (blank terminal half) and the tty sits in cooked+echo mode with mouse
tracking still enabled — so moving the mouse over the terminal echoed literal
`^[[<55;26;14M` junk (and buffered it as input for the CLI). Mouse reports are
now suppressed for that window while the editor is open, and the blank half
carries a hint pill ("Editing below — Save & Close to hand the file back").

## [2.67.1] — 2026-07-10

### Fixed — terminal image paste + Ctrl+G editor
Two long-standing breakages, both environmental:
- **Ctrl+G** broke the moment password auth was enabled: the `code` helper
  script's POST to `/api/editor/open` has no cookie and there was never an
  exemption — 401, and claude hung on "Save and close editor to continue…".
  The script now authenticates with its per-session token (same trust model as
  the agent endpoints), validated by the route.
- **Image paste** died when the compositor restarted (Xwayland mints a NEW
  auth-cookie file; every running session keeps the old path → "Invalid
  MIT-MAGIC-COOKIE-1"). The server now merges the working cookie into
  `~/.Xauthority` and hands sessions that stable path, so future rotations heal
  via a re-probe (the paste route retries through it once) — no respawns
  needed. Existing sessions were healed in place by merging the new cookie into
  the old file.

## [2.67.0] — 2026-07-10

### Changed — new default accent: teal (goodbye AI-indigo)
The Dark and Light themes' default accent moves from the ubiquitous
AI-product indigo (#6366f1) to a modern teal — vivid `#2dd4bf` with dark
foreground text on Dark (the contemporary dark-on-vivid treatment, ~8:1
contrast), deep `#0f766e` with white text on Light (5.9:1). Deliberately
distinct from the semantic green/blue/yellow/red so badges stay readable.
Carried through everywhere the old indigo was hardcoded: terminal cursor and
selection colors, CodeMirror caret/cursor/fold (now theme-var driven — fixes
the audit backlog item), the favicon/splash logo gradient and loading bar, and
the login page. Dracula/Nord/Solarized/Monokai and custom themes keep their own
accents; the theme editor can restyle everything as before.

## [2.66.1] — 2026-07-10

### Fixed — waiting blink reaches tabs and window lists
When windows are grouped or stacked, the "agent replied" blink only lived on
the (hidden) window titlebar — the tab headers didn't blink, and neither did
the rows in the taskbar stack popup, the window-list popup, or the overlap
switcher, so you couldn't tell WHICH window wanted attention. Now: tab headers
carry the blink (kept live through the same update funnel as the taskbar) and
all three list popups blink the exact row (group rows aggregate their tabs).
Switching to a waiting tab acknowledges the blink.

## [2.66.0] — 2026-07-10

### Changed — one design language across every window
A 6-surface design audit (86 findings) drove a consistency pass over all
windows, dialogs, popups and toolbars — density preserved (this is a pro tool),
divergence removed:

- **One button system**: primary = accent fill + `--accent-fg` text + accent-hover
  (fixes white-on-pastel text on Dracula/Nord/Monokai; no more opacity/brightness
  hover tricks), secondary = one compact recipe with the accent border+text hover,
  plus a proper `.danger` variant (was a red fill inside an accent border).
- **One popover chrome** for every dropdown/menu/panel (bg, border, radius,
  shadow) — chat's four hand-rolled dropdowns join the app-wide spec and now
  dismiss on Escape like everything else.
- **Theme correctness**: ~40 hardcoded palette colors (badge tints, status chips,
  chat tier colors, workflow states, diff/permission tints, scrollbar hover,
  CSV zebra) now flow through theme vars / `color-mix` — custom themes and all 6
  built-ins render them correctly; Firefox gets themed thin scrollbars.
- **Conflicting duplicate rules fixed**: `.usage-note` (warnings amber via a new
  `.usage-warn`, info notes back to neutral), `.usage-section-title` (one
  canonical section-title spec: 11px caps for titles, child spans keep their
  casing — emails/account names never uppercase), `.usage-bar-fill`.
- **Scales normalized**: radii on the `--radius`/`--radius-sm`/pill(999px)
  tokens, integer type scale (9/10/11/12/13), one toolbar spec across
  explorer/media/editor/hex/archive, one section-title + micro-label spec,
  aligned empty states, 6px state dots, onboarding aligned with the dialog spec.

## [2.65.2] — 2026-07-10

### Fixed — inbox/usage popups follow their buttons
The "For you" inbox and usage-pies popups were pinned to the bottom-right by
CSS, so moving their buttons (customize mode — another bar, left alignment,
top-docked taskbar) left the popup opening far away from the icon. They now
anchor to the button's live position on open: flip above/below by screen half,
align to the button edge, clamp into the viewport, and grow away from the
button so live re-renders stay glued to it.

## [2.65.1] — 2026-07-09

### Fixed — New Session custom names now stick in the sidebar
A name typed in the New Session dialog showed on the window title but the
sidebar silently replaced it with your first message: sidebar names come from
the transcript's first user message unless a **custom name** exists, and the
dialog's name was never persisted as one. It now becomes the session's custom
name once the backend session id is adopted (same mechanism as fork titles);
a manual rename done in the meantime wins.

## [2.65.0] — 2026-07-09

### Added — the "For you" inbox (global user-facing TODO list)
Agents can now file things that need **you** — a decision to make, input only
you can give, something to review — with the new `vibespace-ask` CLI (taught to
every VibeSpace session, local and remote). Each item belongs to its session
(your "task"); the new **taskbar inbox** merges every session's items into one
list, grouped by session, sorted urgent-first, with a count badge, a toast when
a new item arrives, and **one click to jump to the owning session** to handle
it (✓ done / ✕ dismiss / ↺ reopen; agents can also resolve their own items once
you answer in chat). This is the inverse of the agent's own todo list — it's
the queue of what the fleet is waiting on *you* for. Persisted in
`data/user-todos.json`; re-filing the same open question refreshes instead of
duplicating; a per-session open cap keeps a looping agent from flooding you.

## [2.64.1] — 2026-07-09

### Fixed / clarified — Usage window vendor separation
- **Codex "cache writes 0" was misleading**: codex rollouts do not report
  cache-write token counts at all (verified against records written minutes ago
  by 0.144.0 — the usage struct has no such field), so a codex-only view now
  shows **"— · not reported by Codex"** instead of a fake 0. (Historical
  context: cache writes were also free on GPT-5.5-era OpenAI billing; 5.6+
  bills them 1.25× but the data still isn't reported, so cost estimates can't
  include it.)
- **Account chips follow the Backend filter** — Backend=Codex no longer shows
  Claude accounts (and vice versa); an account selection from the other backend
  is cleared instead of yielding a permanently empty view.
- **Vendor logos everywhere identities/models mix**: account chips, By-account
  rows, By-model rows, and the Pricing editor's account list all carry the
  Claude/Codex brand mark.
- **Pricing editor listed only what the current filter left visible** (e.g. a
  codex-filtered dashboard shrank it to one row) — it now lists every account
  from the unfiltered union.
- **Top sessions show session names** (from session-meta; sessions not created
  in VibeSpace keep the id).

## [2.64.0] — 2026-07-09

### Added — Codex multi-account parity (Usage window + quota pies)
The 2.62/2.63 account features only handled Claude — Codex accounts were
invisible (user-reported):
- **Ledger**: the two CLIs' machine logins were conflated into one bucket — now
  split (`Claude CLI login` vs `Codex CLI login`, separate billing categories),
  and the Usage window's Account chips list both plus every named ChatGPT
  account, with the same email-linked merge (machine login == named account →
  one chip).
- **Quota pies**: codex rate-limit snapshots are now bucketed **per account**
  (live sessions report their own account; recent rollout tails attribute via
  the thread's session-meta), and the codex popup section gained the same
  account switcher chips as Claude — Auto (default account) / CLI login / each
  ChatGPT account, with email-linked dedupe and newest-wins merge.
- **Manage Agents**: the Codex roster now shows the machine login's email, a
  `= "Name"` hint when it IS a named account, per-account 5h/7d usage bars,
  and "set email…" for API-key-mode logins whose identity isn't in the token.

## [2.63.0] — 2026-07-09

### Added — Codex usage in the ledger (it was never mined)
The Usage window's ledger only scanned Claude transcripts — Codex sessions
never produced a single event and the Backend=Codex filter was always empty.
The scanner now also mines **Codex rollouts** (`~/.codex/sessions`): each
`token_count` event's `last_token_usage` is one request (fresh input = input −
cached; output includes reasoning), deduped by a synthetic id built from the
thread's strictly-monotonic cumulative total; model/cwd come from the preceding
`turn_context` and persist in the scan cursor. Account attribution works the
same as Claude (codex-subscription accounts split correctly). Ships **real
OpenAI pricing tiers** (GPT-5.6 Sol $5/$30 · Terra $2.50/$15 · Luna $1/$6,
GPT-5.5 $5/$30, 5.4 $2.50/$15, 5.4-mini $0.75/$4.50, 5.3-codex $1.75/$14;
cached input at 10%) — tier matching is now data-driven (longest key in
pricing.json wins), and the Pricing editor lists every tier. Scanning is
**chunked** (a 1.9GB rollout exceeds Node's string limit) — first pass over
2.3GB ≈ 8s, incremental after.

### Added — Usage window: account filter + custom date range
The dashboard gained an **Account** chip row (All / each account / CLI login) —
the whole window (tiles, trend, every breakdown) follows the selection. When
the machine's CLI login IS a named account (email link), the two buckets render
as **one** chip covering both. And the Range control gained **Custom…** with
from/to date pickers.

## [2.62.0] — 2026-07-09

### Added — per-account usage switching
The taskbar usage pies (and their popup) can now show **any** Claude account,
not just the default: the popup gained a chip row — **Auto** (follow the default
account, the old behavior), the machine's **CLI login**, and every named
subscription (★ marks the default). Per-device preference. When the CLI login
**is** one of the named accounts (same email), the two render as **one** entry
and their passively-captured usage merges **newest-wins** in both directions —
no duplicate/conflicting pies for the same real account. Accounts whose login
flow didn't record an email (identity is unknowable from creds alone) get a
**"set email…"** affordance in Manage Agents so you can declare the identity and
enable the merge; the Manage-Agents CLI-login row also says `= "Name"` when linked.

### Added — create missing folders from New Session
Typing a nonexistent path in the New Session dialog now offers to **create the
folder** (works for remote hosts too) instead of failing opaquely at spawn time
("terminated" locally, silent $HOME fallback remotely). A file path is rejected
with a clear message; cancel keeps the dialog open.

### Fixed — shell/codex terminals died instantly ("terminated")
Since 2.60.0 the passive-usage statusLine injection appended `--settings` to
**every** local terminal spawn — but only the claude CLI understands that flag,
so plain shell terminals (including the Manage Agents **Update/Log in** helpers)
and local codex terminal sessions exited immediately. The injection is now gated
on the claude backend.

### Added — GPT-5.6 (Sol/Terra/Luna) support
Codex reasoning-effort options are now **dynamic per model** from the CLI's own
models cache instead of a hardcoded ladder — GPT-5.6 Sol/Terra expose the new
**max** and **ultra** efforts (ultra = multi-agent), Luna up to max, and the chat
status-bar effort dropdown offers exactly what the session's current model
supports. The server also keeps a **union** of models seen across cache rewrites:
a still-running old codex CLI re-fetches the (version-gated) cache and would
otherwise erase the 5.6 entries minutes after they appeared. The 5.6 models
themselves arrive via the codex CLI (≥0.144.0) — use Manage Agents → Update
(fixed above), then start a new codex session.

## [2.61.1] — 2026-07-09

### Changed — real Anthropic prices + per-account pricing
Cost estimates now use the current official API prices (researched + verified):
**Fable 5 is $10/$50 per Mtok** (it's a published price, not a placeholder), and
a bug where Opus used the *deprecated* $15/$75 instead of the current **$5/$25**
was fixed — estimates were ~3× too high. Pricing is now **per-account**: give any
API-key account its own **discount %** or full rate override (different keys bill
differently) via the new **Pricing** editor in the Usage window; subscriptions
use the default as the API-equivalent reference.

### Fixed — Usage tiles now reconcile
"Total tokens" is dominated by cached reads (usually >95%), which wasn't shown as
its own tile — so it looked like the numbers didn't add up. Cached reads / cache
writes / fresh input / output are now peer tiles that visibly sum to the total.

### Changed — snappier usage refresh
`/api/usage` is a cheap local read now (passive capture, no Anthropic call), so
the taskbar pies refresh every **8s** (was 30s; 30s when the tab is hidden) and
the passive statusline write throttle dropped 25s → 8s — usage reflects a
just-finished turn within seconds, still zero Anthropic calls.

## [2.61.0] — 2026-07-09

### Added — Usage window (permanent per-request token ledger)
New **⚙ → Usage** window with a full analytics dashboard over your token usage.
A permanent, append-only ledger (`data/usage-history/`) is mined from Claude
Code's own JSONL transcripts — **works for both terminal and chat sessions**
(the transcript is mode-independent) — and keeps the atomic facts forever, so it
survives transcript rotation/deletion and any future report can just read it.

Each record is one API request, **deduped by requestId** (a single request
appears on 2–3 transcript records with identical usage — summing raw records
would multi-count). Scanning is incremental (per-file byte cursor), so even
hundreds of MB of history scan in a few seconds.

**Accurate account attribution (no mixing):** every request records WHICH
account it billed to and its billing **type**, so **subscription usage and
API-key usage are never conflated** (they're covered by your plan vs real $).
Attribution is per-request **by time** — a session resumed under a different
account is split correctly — via a permanent attribution log; unattributed
sessions (the CLI's own global login) are their own clearly-labeled bucket.

The dashboard shows: headline tiles (est. API-equivalent cost, total tokens,
cache-hit ratio, requests/sessions, fresh input, cache writes), a daily trend
chart, and breakdowns **by billing type, account, model, project, mode, cache
efficiency, hour-of-day and weekday activity, and top sessions** — with a
range/backend filter and **CSV export**. Cost is an estimate (API-equivalent;
subscriptions are plan-covered) from an editable price table
(`data/usage-history/pricing.json`).

## [2.60.2] — 2026-07-09

### Changed — the taskbar usage pies now follow your DEFAULT account
The 5h / 7d pies used to always show the machine's global login. If you'd starred
a named subscription as your default (so new sessions bill to it), running a
session on it appeared to do nothing — its usage updated in Manage Agents but not
the taskbar. Now the pies follow the **default account** (the popup shows its
name + "refreshes when you run it in a terminal session"), falling back to the
global login when nothing is starred.

### Added — passive model discovery
The model dropdown now **learns the full model IDs of models you actually run**,
harvested from the same status-line hook — no `/v1/models` API call. Built-in
aliases (fable/opus/sonnet/haiku[+1m]) are always present; used models add their
exact dated IDs. (Claude Code keeps no local model cache and stream-json doesn't
emit the model list, so this is the only zero-call way to grow it.)

### Fixed — account roster on a remote host reflects the local-only rule
With a remote host selected, subscription rows are now dimmed with a "· this
machine only" hint and their Test button explains the situation instead of firing
a create the server rejects; the section note says API keys ship to the host
while subscriptions are local-only (unless you enable the opt-in). Matches the
2.60.0 default.

## [2.60.1] — 2026-07-09

### Added — active usage polling as an explicit opt-in (default off)
The old OAuth-based usage auto-refresh is back, but only as a clearly-labeled
opt-in: **Settings → "⚠ Actively poll subscription usage (automation risk)"**
(default **off**). Off (the default) means VibeSpace never contacts Anthropic on
its own — usage stays passive (captured from your live terminal sessions).
Turning it on restores the background poll (global login ~5 min + one named
subscription per 90 s) and pops a **danger confirm dialog** spelling out that
this off-CLI, fixed-cadence traffic is what can get a Pro/Max account flagged as
automated and banned. Use it only if you accept that risk (e.g. to see live
usage for chat-only or idle accounts).

The hourly `/v1/models` fetch with a subscription OAuth token is gated behind the
**same** toggle (it's the same off-CLI background pattern). Off by default, the
model dropdown falls back to the built-in CLI aliases; an API key is always used
when present.

## [2.60.0] — 2026-07-09

### Changed — subscription usage is now captured passively (no background API polling)
VibeSpace no longer calls Anthropic's usage endpoint on a timer with a
subscription's OAuth token. A fixed-cadence, 24/7 background call using a
subscription token — for accounts that may be idle, from a server — is exactly
the "automated / non-human access outside the official client" pattern that can
get a Pro/Max account flagged and banned (Consumer Terms §3.7; the 2026-02-20
OAuth clarification). Instead the **5h / 7d usage bars are captured passively**:
a new status-line hook (`data/bin/vibespace-usage`) reads the rate-limit figures
the CLI **already** receives during a real interactive session and caches them —
**zero extra API calls**, and only for accounts you're actually using. Terminal
sessions refresh usage this way; chat (stream-json) sessions have no status line,
so a chat-only account shows its last-known value. Idle accounts are never
contacted.

### Changed — subscriptions no longer ship to remote hosts by default
Running a subscription (Pro/Max or ChatGPT) on a **remote host** is now **off by
default**. Putting a subscription's login on another machine (often a datacenter
IP) is both outside the spirit of a personal subscription and an
impossible-travel / datacenter signal that can look like account abuse. The
recommended path is now to **log in on the host itself** ("Manage agents → select
host → Log in on host…"), so the work bills to that machine's own login.
**API-key accounts still ship to remote hosts** (that's the sanctioned path for
server/automation use). To opt in for subscriptions anyway, enable **Settings →
"Ship subscription logins to remote hosts."** The server enforces the gate — a
blocked attempt fails with a clear message rather than silently shipping creds.

### Docs
New **[docs/accounts.md](docs/accounts.md)** now includes a "Staying within
Anthropic's terms" section documenting these design choices; README and CLAUDE.md
reworded to describe multi-account support as switching between **your own**
logins (like signing in/out), using the official CLIs interactively.

## [2.59.1] — 2026-07-09

### Changed — account scoping made unambiguous in Manage agents
Picking a remote host used to silently change what the accounts section meant —
it was unclear whether a login would land in VibeSpace or on the host. Now ONE
unified roster with explicit scoping: the first row is always the **selected
machine's own CLI login** (pick AIDev → "CLI login on AIDev", with a
"Log in on AIDev…" button that clearly acts ON that machine, plus an inline
"Import its key" when the host has an unimported Console key). Every named
account below is **stored in VibeSpace** — machine-independent, usable by
sessions on any machine (credentials ship per session) — and no longer
disappears when you switch machines. The note under the list spells out the
split. The ChatGPT/OpenAI roster gets the same treatment (remote login uses
`codex login --device-auth` — a plain `codex login` would open a callback
server on the host, unreachable from your browser). Test buttons run ON the
selected machine.

### Changed — "远程主机" terminology (zh)
Remote machines are now consistently called **远程主机** in the Chinese UI
(was the ambiguous 主机): sidebar Remote-tab section header, New Session row,
session Properties, filter labels. The Manage-agents machine dropdown (which
includes 本机) is labeled 机器. The sidebar Remote-tab section headers are now
translatable (they were hardcoded English).

### Fixed — remote creds shipping is concurrency- and rotation-safe
Shipping a subscription's creds dir to a host no longer `rm -rf`s the remote
copy (a concurrent session of the same account on the same host would have had
its creds yanked mid-run). Extraction is per-file **newest-wins**
(`tar --keep-newer-files`): OAuth refresh tokens rotate, so after a remote
session refreshes, the host copy holds the live token — re-shipping the stale
local copy over it would have broken the account on that host.

## [2.59.0] — 2026-07-08

### Added — multiple ChatGPT (Codex) logins, switchable per session
Codex now supports the same multi-account model Claude Code got in 2.56–2.58:
hold **several ChatGPT logins at once** and pick one per session. Each account
gets its own isolated `CODEX_HOME` whose `sessions/` and `config.toml` are
symlinks to the shared `~/.codex` — so **auth is isolated per account** while
your **threads and settings stay unified** (one session list, one config). Add
one via **Manage agents → ChatGPT / OpenAI accounts → Add ChatGPT account…**; it
opens a terminal running `codex login --device-auth` (a URL + one-time code, so
it works even when your browser is on a different machine). Star an account to
make it the default for new Codex sessions; pick a specific one in the New
Session dialog or the card ⚙.

### Added — subscriptions on remote hosts
Named subscription accounts (both Claude and Codex) can now be picked for a
**remote-host session**. The account's creds dir ships to the host per session
over an ssh-stdin **tar stream** (channel-encrypted, lands in a 0700 dir) and
the CLI is pointed at it (`CLAUDE_SECURESTORAGE_CONFIG_DIR` / `CODEX_HOME`) — the
same process-env-only, never-argv discipline as the API-key path. For Codex the
host's `sessions/` + `config.toml` are symlinked so threads/settings stay shared
on the host. (Previously subscriptions were local-only.)

### Changed — accounts grouped under their CLI in Manage agents
The account rosters now render **directly under their backend**: Anthropic
accounts under **Claude Code**, ChatGPT/OpenAI accounts under **Codex** — instead
of one Anthropic-only section at the bottom. Each backend keeps its own default
account. Row columns (icon · name · usage · actions) are grid-aligned so the
CLI-login peer row lines up with the richer account rows.

## [2.58.0] — 2026-07-08

### Added — per-subscription usage in the account manager
Each subscription row in **Manage agents → Anthropic accounts** now shows a
compact **5h / 7d usage readout** (mini bars + %, green/amber/red by level), so
you can see at a glance which account has quota left before switching to it. The
CLI global-login row shows the same from the main usage poll. Data is the
per-account poll (server round-robins it, read-only token); idle accounts show
last-known with a "Nm ago" staleness note (their usage isn't changing anyway).

## [2.57.1] — 2026-07-08

### Fixed — account identity no longer clobbered; global login shown as a peer
- Adding a subscription/Console account no longer overwrites the GLOBAL login's
  displayed identity in `~/.claude.json`. The login now runs with BOTH
  `CLAUDE_CONFIG_DIR` and `CLAUDE_SECURESTORAGE_CONFIG_DIR` pointed at the
  account's own pre-seeded dir (seeded with onboarding-complete flags, so no
  first-run screen), isolating creds AND identity. `~/.claude` is untouched.
  NOTE: this isolation is LOGIN-only — running a session on an account sets only
  `CLAUDE_SECURESTORAGE_CONFIG_DIR`, so `.claude.json`/settings/projects stay
  SHARED across all accounts (config never reverts on switch).
- The CLI's own global (~/.claude) login is now a **peer row** in the account
  list with the same star toggle, instead of a separate status line — it's the
  default whenever no named account is starred.
- The Manage Agents **Test** session is now ephemeral (closing its window always
  terminates it, never leaves a detached test session).

## [2.57.0] — 2026-07-08

### Changed — account manager polish (multi-subscription)
- Accounts now read as **peers**: every row carries the same controls, and the
  "default for new sessions" is a single **star toggle** (filled = default,
  click to set/clear) instead of an asymmetric "Set default / Unset default"
  button.
- **Rename** any account (subscription or API key) — a pencil button per row.
- Manage Agents account rows use **SVG icons** (crown / key / star / pencil / ✕)
  instead of emoji.
- The session card's subscription billing badge shows a crown SVG + just the
  account's **first character** (full name in the tooltip), so it stays compact.

## [2.56.3] — 2026-07-08

### Fixed — terminal paste broke non-TUI prompts (root cause of the login failure)
Pasting text into a terminal ALWAYS wrapped it in bracketed-paste markers
(`\x1b[200~…\x1b[201~`), even when the running program hadn't enabled
bracketed-paste mode. For a plain (non-TUI) stdin prompt like `claude auth
login`'s "Paste code here", the markers landed in the input as literal bytes
(and there's no submit newline), so the paste looked dead and then failed the
code exchange. Now paste goes through xterm's `terminal.paste()`, which emits
the markers ONLY when the app set `\x1b[?2004h` (TUIs do; plain prompts
don't) — correct in both cases. Fixed across desktop paste, the clipboard-API
path, and the mobile paste pad. This is what blocked the add-subscription /
add-Console login.

## [2.56.2] — 2026-07-08

### Fixed
- Subscription/Console login FAILED — 2.56.1 used `claude /login`, but that TUI
  slash-command errors from a shell ("/login isn't available in this
  environment"). Now uses the real subcommand `claude auth login --claudeai`
  (subscription) / `--console` (Console account), which prints an OAuth URL to a
  hosted callback + a paste-code prompt (works headlessly), with
  CLAUDE_SECURESTORAGE_CONFIG_DIR only (no onboarding).
- Testing a not-yet-signed-in subscription opened a blank window (the server
  correctly rejects the spawn). Now it shows a clear message instead, and
  not-logged-in subscriptions are hidden from the New Session account picker.

## [2.56.1] — 2026-07-08

### Fixed
- Add-subscription / add-Console-account login opened with an empty
  `CLAUDE_CONFIG_DIR`, which triggered Claude's first-run onboarding ("weird UI")
  and broke the OAuth code paste (no echo → 400). The login now sets ONLY
  `CLAUDE_SECURESTORAGE_CONFIG_DIR` (config dir stays `~/.claude`, no onboarding)
  and uses `claude /login` (the proven flow). Credentials are still isolated;
  the global login's tokens stay untouched.
- Added a standalone **"Add Console account…"** entry (its API key is captured in
  an isolated login so your subscription creds aren't wiped by the console
  `/login`).

## [2.56.0] — 2026-07-08

### Added — multiple Claude subscriptions, switchable per session
You can now hold several Claude Pro/Max logins at once and pick which one bills
each session — the counterpart to per-session API-key switching. **Manage agents
→ Anthropic accounts → "+ Add subscription…"**: name it, and a terminal opens to
sign in with that account; the login is captured into its own isolated store, so
it does NOT disturb your current/global login. Each account then appears in the
New Session dialog, the card ⚙, and Session Properties account pickers (👑), and
a session's card shows 👑<name> so you never burn the wrong plan. The usage popup
tracks each subscription's 5h/7d quota (idle accounts show last-known).

Mechanism (verified against claude 2.1.205): each subscription is a real dir
holding only its `.credentials.json`, read by the CLI via
`CLAUDE_SECURESTORAGE_CONFIG_DIR` — this relocates the credential store ONLY, so
transcripts, session discovery and settings stay shared in `~/.claude`. Local
Claude sessions in this release (remote hosts + Codex are later phases). Holding
your own paid accounts and driving the official CLI per-account is Anthropic's
acknowledged "accepted" pattern (not the banned third-party-OAuth-proxy path).

### Changed
- Chat hook notices show their FULL detail — the 500-char truncation is gone
  (the output stays inside the collapsed disclosure, height-capped with a scroll).

## [2.55.3] — 2026-07-08

### Fixed
- The model auto-fallback chat notice ("⚠ Model auto-fallback: X → Y …") was
  hardcoded English — it's built server-side in the normalizer, so client
  t() never saw it. The structured from/to now ride the message and
  renderSystemMsg localizes it client-side (en/zh/ja). The status-bar
  fallback tooltip was already localized.

## [2.55.2] — 2026-07-08

### Added
- Session right-click menu: **Open working directory** — opens the file
  explorer at the session's cwd (host-aware: a remote session's folder opens
  on its host).

## [2.55.1] — 2026-07-08

### Fixed — i18n homograph collision ("Plan")
The usage popup labeled the Codex subscription plan "规划模式" — the
English-string-as-key design collided the permission mode "Plan" with the
billing "Plan". Added pgettext-style contexts: `tc(ctx, str)` looks up
`ctx::str` and falls back to English (never the un-contexted translation).
The usage popup now uses `tc('billing', 'Plan')` → 套餐 / プラン. Swept every
short key used in multiple files for further homograph collisions — "Plan"
was the only one.

## [2.55.0] — 2026-07-08

### Added — create a session for a Task Group from the flat Tasks view
The Task Groups tab's flat **Tasks** sub-view now has a "+ New session in a
Task Group…" card at the top: it opens a group picker (color-marked, board
order) and launches the pre-filled New Session dialog for the chosen group
(first auto-include folder as cwd, group folders pinned in the chips) — no
more switching back to the Groups board just to spawn into a group.
Right-clicking a session card's group color bar also opens that group's full
action menu (New session in this task…, Details, Rename, …).

## [2.54.3] — 2026-07-08

### Fixed
- Path chips showed the `~` at the END (`/workspace/vibespace~`): the rtl
  front-truncation trick reorders leading bidi-neutral characters to the
  visual end. Added the LTR-mark anchor (same as session cards) to the New
  Session cwd chips, Task-Group chips, mount paths, and the Ctrl+K palette
  paths.

## [2.54.2] — 2026-07-08

### Fixed
- Model / effort status-bar dropdowns sometimes "did nothing" on click (a
  faint dark sliver, then nothing): the dropdown box was created EMPTY and
  populated by an async fetch whose failure silently removed it. Now a
  Loading… row shows immediately, and on fetch failure the dropdown falls
  back to the client-side ladder (effort: low…max + ultracode; model: CLI
  aliases + Custom…) instead of vanishing. Also guards against a
  non-positioned popup container re-anchoring the dropdown off-screen.

## [2.54.1] — 2026-07-08

### Changed — injected context reframes the shared context folder
The per-turn Task Group injection now describes the context folder as the
group's **shared memory between agents** (documents/records passed session ↔
session), explicitly *not* a place to publish deliverables for the user — and
instructs agents to proactively curate knowledge there when other sessions of
the group will need it (conventions, gotchas, decisions with reasons,
cross-role details — e.g. a dev session writing up technical specifics a
compliance session depends on), preferring consolidation over piling up new
files. Both local and remote (live-synced copy) variants updated.

## [2.54.0] — 2026-07-08

### Added — Task Group folders pinned in the New Session quick-fill chips
When a Task Group is selected in the New Session dialog, the click-to-fill
directory chips under Working Directory now **pin the group's linked folders
first**, marked with the group's color dot. For folders with "subfolders"
enabled, nested folders that **already contain sessions** are suggested too —
group folder `/a` plus sessions at `/a/too` yields chips for both `/a` and
`/a/too` (tooltip shows the session count; symlinked checkouts match via the
real path). Chips re-render when you change the Task dropdown. (This is the
chip row — distinct from the autocomplete dropdown, which already floated
group folders.)

### Fixed
- Task Group detail: Activity log entries now have a subtle divider between
  them (multi-line notes visually ran together), and rows can no longer
  compress/overlap inside the scroller.

## [2.53.0] — 2026-07-08

### Changed — Settings is now a non-blocking window
The settings page opens as a normal, same-level workspace **window** instead
of a blocking modal overlay — drag it aside, resize it, and change a setting
while watching the effect on your workspace live. It's a singleton (opening it
again focuses the existing window) and transient (not persisted in the layout,
not restored on refresh, not synced to other clients).

### Added
- **Configurable shake duration**: how long you must shake a window before grid
  snap turns off is now a setting (**Toolbar & Layout → Shake duration
  (seconds)**, `layout.shakeBypassSeconds`, default 1s, range 0.3–3s). It's
  re-read at the start of each drag, so changes apply immediately — pair it with
  the now-windowed Settings to dial it in live.

## [2.52.0] — 2026-07-08

### Added — shake to bypass grid snap
Shaking a window vigorously for about a second while dragging now latches
"grid/edge snap off" for the rest of that drag — a mouse-only alternative to
holding **Alt**. A "Grid snap off" badge follows the cursor and the window
gets a dashed outline while active; it re-enables automatically on the next
drag. Detected by counting per-frame direction reversals (≥3 in a 500ms
sliding window = vigorous) sustained for ~1s, so a couple of accidental
jiggles never trigger it. New setting **Toolbar & Layout → Shake to bypass
snap** (`layout.shakeBypassSnap`, default on). Scoped to the title-bar move
drag (not resize). Fully i18n'd (en/zh/ja).

## [2.51.0] — 2026-07-08

### Added — full-UI i18n (English / 中文 / 日本語)
The entire human-facing UI now switches language: ⚙ menu → **Language**
(Auto / English / 中文 / 日本語; per-device, stored in localStorage — a
Japanese phone and an English desktop can share one server). Gettext-style
design: the English string IS the dictionary key (`t('New Session')`),
missing entries fall back to English, switching reloads the page.
`src/lib/i18n.js` runtime + `i18n-zh.js`/`i18n-ja.js` dictionaries (869
entries each, generated from 880 extracted keys — brands/model ids stay
English by design). Covered surfaces: index.html chrome (data-i18n), sidebar
+ session cards + context menus, app dialogs (New Session / Manage Agents /
accounts wizard / backup / onboarding / usage popup), Task Group detail,
Session Properties, chat chrome (tool cards / permissions / search /
minimap / status bar / input), full settings schema + dialog. Agent-facing
injected context and docs remain English. `scripts/i18n-extract.mjs`
extracts all keys for dictionary audits (key exactness, {param} and HTML-tag
preservation checks).

### Added
- **Agent tool cards show the model**: a chip next to the description —
  declared `input.model` at render, upgraded live to the actually-serving
  `message.model` from the subagent stream.

### Fixed
- Subagent live status ("N messages · View Log") rendered OUTSIDE the tool
  card for background agents (instant tool completion skipped the pending
  anchor), and completed cards got a duplicate View Log button.
- The generic tool-card "wrench" icon read as an eyedropper/color picker —
  redrawn as a real open-end wrench; Bash/shell tools (incl. Codex
  exec_command) now use a dedicated terminal icon instead.
- Task Group detail window no longer scrolls back to the top after every
  edit (color, toggles) — scroll position is preserved across re-renders.
- Session Properties "Agent steps": rows compressed and overlapped inside
  the 180px scroller (flex-shrink) — fixed; open steps now list first and
  completed ones collapse to the last 2 with an expandable "N more" row.
- `vibespace-status` CLI tolerates the `set` prefix alias and a positional
  reason argument (both observed agent misuses; the reason was silently
  dropped before).

## [2.50.0] — 2026-07-08

### Added — mobile flat Task View
The mobile Task Groups tab now has the same **Groups | Tasks** sub-views as
desktop: Groups keeps the two-level drill-down; Tasks is the flat
urgency-sorted 活儿 list (same renderer as desktop — group color bars, cwd on
cards, untagged actives at the bottom with a stopped-count pointer). The sort
menu button works on mobile there too; the header filter menu's State section
applies as on desktop. Back from a group drill-down restores the sub-tab bar.

## [2.49.1] — 2026-07-08

### Fixed (mobile)
- Mobile Task Group cards showed "undefined ·" in the meta line — leftover
  `task.status` read (removed in the 2.39.0 refactor); shows "archived" now.
- Mobile "Untagged" drill-down would render EVERY stopped session (thousands,
  since 2.47.0 stopped narrowing the tasks tab) — now lists active ones only
  with a stopped-count pointer to Folders, matching the desktop Task View.
- The sort button no longer shows on the mobile Task Groups tab (its Task View
  sort menu has no effect there — mobile keeps the drill-down list).

## [2.49.0] — 2026-07-08

### Added — session right-click menu + Properties window
- **Right-click a session card** (long-press on touch) for quick actions
  without expanding: focus/resume (chat/terminal), view history, fork,
  star/archive/rename, set status, Task Groups submenu (toggle membership;
  folder-derived marked), copy ID/path, find/go-to/move window, Properties,
  terminate.
- **Properties window** (also a button in the expanded card): the full
  reference sheet for one session — identity (ID/agent/mode/machine/cwd/
  started/connection), current state with a Change button + the status history
  timeline, billing (this run's identity + the on-resume account selector),
  saved config overrides, Task Group membership toggles, and the agent's todo
  steps. Live-synced; replays across clients and layout restores.

## [2.48.4] — 2026-07-08

### Fixed
- **Terminate from the sidebar left the session's window looking alive** (no
  read-only flip): the kill handler removes the session from activeSessions
  before the PTY's async onExit runs, and onExit's stale-PTY guard (from the
  2026-06 review batch) then returns without ever emitting 'exited'. The kill
  handler now broadcasts 'exited' (reason: terminated) itself,
  deterministically. Verified with a live create→kill reproduction.

## [2.48.2] — 2026-07-07

### Fixed
- The per-session **Account** override (card ⚙) never saved: `setSessionConfig`
  whitelisted only model/effort/permission and silently dropped the `account`
  key. Picking an API key in the gear now persists, shows in the config badge,
  and applies on every resume path.

## [2.48.1] — 2026-07-07

### Added
- The billing key also shows in the **window title bar** (and on tabs in a tab
  group): amber key on API-billed sessions, dashed "?" on unknown ones —
  synced live from the same per-session auth source as the card badge.

## [2.48.0] — 2026-07-07

### Added — per-session billing identity (who's spending what)
Every Claude session now carries its billing identity, so sessions that keep
burning API money after you re-login to the subscription stay visible:
- Amber key badge on **every API-billed session** — via a chosen API key OR a
  Console global login at spawn (tooltip says which). Subscription sessions
  stay quiet. Pre-tracking busy sessions show a dashed "?" badge (their init
  record scrolled out of the buffer) and self-resolve on the next resume.
- Truth source: the CLI's own init record (`apiKeySource`: none=subscription,
  '/login managed key'=Console, ANTHROPIC_API_KEY=env key), captured live and
  persisted; falls back to the spawn-time global-login state (marked
  "estimated"). Backfill on restart from the session buffer + /proc env probe.

### Added — remote host account status
- Manage Agents with a host selected now shows the HOST's Anthropic login
  state (subscription / console key), a "Log in on host…" terminal button, and
  one-click **Import host key** into the central store.

### Changed — one control row on the Task Groups tab
- The flat Tasks view's embedded Sort/Filter toolbar is gone: the header's
  sort button is context-aware (opens the urgency/status/recent/name menu
  there), and the session-state filter became the first section of the unified
  filter menu. Search + Filter + Sort now live side by side in one row, and
  the search box narrows ALL sub-views of the tab.

### Fixed
- Usage popup: no longer stretched by the signed-out note (max-width + wrap),
  and each backend section shows its OWN "Updated X ago" — a stalled Claude
  poll no longer makes Codex's data look stale.

## [2.47.1] — 2026-07-07

### Fixed
- 2.47.0 wrongly hid the unified filter button on the Task Groups tab: despite
  its "backend filter" name it holds FOUR dimensions (connection status /
  backend / machine / agent kind), and three of them still apply there — they
  kept filtering silently with no visible control. The button now shows on both
  session tabs, and the menu hides its (genuinely inapplicable) Status section
  on the Task Groups tab.
- Naming: the sidebar text input now says "Search..." — it clashed with the
  Task View "Filter" button (two things labeled filter).

## [2.47.0] — 2026-07-07

### Changed — sidebar per-tab cleanup + defaults
- **One filter/sort story per tab**: the Folders tab keeps the full global set
  (text/backend filter, sort, quick tabs); the Task Groups tab now shows only
  the text filter + manage mode (its views carry their own sort/status-filter
  toolbar — the duplicated global controls are hidden there); the Remote tab
  hides all of it.
- **Default view settings**: `sidebar.defaultTab` (open the app on Folders /
  Task Groups / Remote) and `sidebar.defaultBoardView` (Task Groups tab opens
  in Groups or the flat Tasks view). In-session switching stays transient; the
  setting is the persistence (synced across clients).
- **Task View now respects stars**: ★ is the tiebreaker right after the
  primary sort key (urgency/status/recent modes), matching the Folders sort
  precedence (urgency first, then ★, then recency). Name sort stays purely
  alphabetical. (The Groups view already respected stars via the shared
  session sort.)

## [2.46.0] — 2026-07-07

### Added — the agent's own TODO list, surfaced on the board (活儿的步骤)
The session-level checklist was already there all along — the agent's native
TodoWrite (Claude) / plan tool (Codex) / the newer TaskCreate-TaskUpdate family
(CLI ≥2.1.2xx). VibeSpace now OBSERVES it instead of inventing a parallel store:

- Session cards show a **progress pill** (`3/7` + current step in the tooltip)
  while steps are underway (hidden when all done); the expanded card shows the
  full **Steps** list (works for stopped sessions too, read from the transcript
  via a new `GET /api/session-todos`).
- Live capture rides the existing stream parse for both backends; the
  TaskCreate/TaskUpdate family is replayed CRUD-style (the created id only
  appears in the tool RESULT text).
- The Task Group **Checklist is repositioned as the group's BACKLOG** of work
  items (UI hint + injected guidance): the user queues work items, any session
  picks one up and ticks it off; agents keep their working steps in their own
  session TODO — which the board now shows.

## [2.45.0] — 2026-07-07

### Added — remote context-folder auto-sync
Remote sessions now get their Task Groups' **context folders auto-synced onto
the host** (`~/.vibespace/ctx/<groupId>`, bidirectional rsync, newer file wins,
no deletes, `.vibespace/` excluded), and the **injected file index is
path-translated** to the remote copy — a remote agent can actually read (and
write back) the group's shared files. Sync triggers: session spawn, every 60s
while a live remote session belongs to the group, and whenever an injection
delivers fresh context. Remote artifacts sync back → the local signature
changes → every member session re-injects next turn.

## [2.44.0] — 2026-07-07

### Changed — task-system review fixes
- **One membership rule everywhere**: the Groups board now matches folder
  membership by cwd OR symlink-resolved realCwd, via the same helper Task View
  and the expanded card use (`_sessionFolderMatch`) — mirroring the server.
- **Content-gated re-injection**: only edits an agent actually sees (title /
  objective / checklist / activity / context folder) re-inject a group's
  context. Binding a session, changing color, toggles etc. no longer blast a
  full "was UPDATED" context to every member agent (`contentUpdatedAt`).
- Sessions whose Task Groups are ALL injection-off now still get the one-time
  `vibespace-status` intro (they could never learn to self-report before).
- **Stale state decay**: a stopped session's declared working/needs-input no
  longer shows as a live chip or bumps sorting (a dead card advertising
  "working" was misinformation); done/review/blocked persist but render dashed.
  `done` sessions sink to the bottom of the Folders sort.
- Injection hot path: realpath + context-folder-signature caches (the signature
  walk ran per prompt per group on the hook's 3s-timeout path).

### Added — API accounts on remote hosts
- Per-session account switching now works for **remote sessions** too: the key
  ships to the host over **ssh stdin** into a mode-600 file and the spawn
  command references it via a shell prefix assignment — the key value never
  appears in any argv on either machine (verified end-to-end on a real remote
  host via /proc: remote CLI env has the key, zero cmdline leaks both sides).
  The Account selector now shows for remote Claude sessions; deleting an
  account best-effort removes its key file from all hosts.

## [2.43.1] — 2026-07-07

### Fixed
- Manage Agents dialog: widened to 560px and the accounts section switched to a
  column layout (buttons no longer truncate/wrap at the 440px default width).

## [2.43.0] — 2026-07-07

### Added — Anthropic account switching (subscription ↔ API, per session)

The CLI's `/login` is mutually exclusive — logging into a Console account wipes
the subscription OAuth (and vice versa), switching everything globally.
VibeSpace now keeps API keys in its own encrypted store and injects
`ANTHROPIC_API_KEY` into a session's spawn environment, so both identities
coexist and **every session picks its own billing account**:

- **Manage Agents → Anthropic accounts**: subscription login status, saved API
  keys (add / import the key a Console login minted / rename / delete / set
  default / Test), and a **"Set up both…" wizard** that walks ordinary users
  through the one-time choreography — Console login first (its key is captured
  automatically), then log back into the subscription. Login steps open a
  terminal; VibeSpace detects completion and continues by itself.
- **Per-session choice**: Account row in the New Session dialog and in the
  card's ⚙ config popover (persisted; applies to every resume path — resuming
  with a different account is how you move a conversation's billing, e.g. when
  the subscription weekly cap is hit).
- **Visibility**: API-key sessions show an amber key badge (name + key tail in
  the tooltip); the usage popup explains when the subscription is signed out
  and that API sessions never appear in the quota pies.
- Keys are AES-256-GCM encrypted at rest (mode-600 files) and travel only via
  the process-env channel — never argv (verified: zero /proc/cmdline leaks).

### Fixed
- Five `writeSessionMeta` callers rebuilt session meta from hardcoded field
  lists, silently dropping later-added keys (`agentToken`, `taskId`,
  `accountId`) on id-capture / rename / fork-adoption. All now merge into the
  existing meta.

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

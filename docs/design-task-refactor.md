# Task System Refactor — align to the user's concept model (岗位 / 活儿)

**Status: ✅ IMPLEMENTED — shipped as 2.39.0 (2026-07-06). P1→P2→P3→P4→P6→P5 + P0 (rename) all done + verified; commits `25b0a18`(P1) `62f0208`(P2) `c9231b5`(P3) `d0a2f89`(P4) `f58e0e1`(P6) `4fff818`(P5) + P0a/P0b + the 2.39.0 release.**
Deviations from this blueprint, by design (recorded in the CLAUDE.md 2.39.0 refactor note): **wire/contract + internal-symbol names were KEPT** — JSON fields `plan`/`progress`, API paths `/api/tasks*` + `/api/agent/task*`, the `tasks-updated` WS event, CLI command names (`plan-check`/`plan-add`/`progress`), the internal `_state.tasks` map key, and the client-side symbol/file names (`sidebar-tasks.js`, `_taskUpdate`, …). Rationale: renaming them is pure cosmetic, invisible to users/agents, high-churn, and would break data + config-export round-trip compatibility. The RENAME that shipped is the concept-carrier layer only: `TaskManager`→`TaskGroupManager`, `src/tasks.js`→`src/task-groups.js`, `data/tasks.json`→`data/task-groups.json` (auto-migrated), and all user-visible UI strings → "Task Group".
Already shipped earlier this session (kept): 2.38.0 baseline tool injection (no-group sessions get a `vibespace-status` intro) + session-status debounced disk write.
**Update 2.121.0 (2026-07-13): the group-level Checklist was REMOVED entirely (user decision — agents don't care about other agents' backlogs; work items live at the session level as the agent's own todo/Steps). Every Checklist/`plan-*` mention below is historical; stored `plan` arrays stay dormant in the JSON.**

## 1. Why (the naming/concept mismatch)

The code's `Task` (in `tasks.json` / `TaskManager`) is actually the user's **Task Group** (a "岗位" / role). The user's **Task** is a **session** (a concrete piece of work). The user's **Task Status** is our **session status**. Every past "task" confusion came from this. User decision: **align the code AND the UI to the user's model — full rename, for consistency** (not UI-only).

## 2. Target model (locked)

- **Task Group (岗位 / a role)** = today's `tasks.json` entity. Holds Objective, Checklist (today `plan`), Activity Log (today `progress`), `contextDir`, `folders`, member sessions. **NO single status** — a role persists indefinitely; it only has **archive** (a lifecycle flag, not a task status). A session belongs to **0..N** Task Groups (many-to-many; the existing `sessions[]` tag already supports this).
- **Task (活儿) = a session.** The execution unit. Has a **Task Status** (= today's session status **plus `done`**): `working / needs-input / blocked / review / done`. Belongs to 0..N Task Groups and inherits their shared context. Optionally (loosely) claims a Checklist item.
- **Task Status** = session-level state. `vibespace-status` reports it. `done` = this piece of work is finished.
- **Injection** = a session receives the shared context of **ALL Task Groups it belongs to** (each block labeled with its group), refreshed incrementally on any change.
- **`vibespace-task`** reports to a **Task Group** (progress / check a Checklist item / …), and **may only act on a group the session belongs to** (enforced).

## 3. Naming map (full rename)

| Now (code) | After |
|---|---|
| `Task` / `TaskManager` / `tasks.json` / `/api/tasks*` | `TaskGroup` / `TaskGroupManager` / `task-groups.json` / `/api/task-groups*` (keep back-compat read of old file on first load → migrate) |
| task `kind:'task'` / `kind:'group'` | Task Group is the single kind (drop the task/group split; migrated groups are just Task Groups). Objective/Checklist/etc optional. |
| task `.status` (active/paused/blocked/done) | **REMOVED** from the group; group gets `archived: bool` only |
| task `.plan` | keep field name or rename to `checklist` (UI already says "Checklist") — decide during impl; internal rename preferred for consistency |
| task `.progress` | keep or rename to `activityLog` (UI says "Activity log") |
| session status (`session-status.js`, STATES) | **Task Status**; add `done` to STATES |
| `session._taskId` (single context task) | **REMOVED** — belonging is derived from group membership (`groupsForSession`) |
| `VIBESPACE_TASK_ID` (env, single) | initial tag only (belonging is derived live); may become `VIBESPACE_TASK_GROUP_ID(S)` |
| UI "Task" / "Tasks tab" / "task board" / "New session in this task" | "Group / 岗位" language; the board lists Task Groups, each with its member Tasks (sessions) |

Note the tension: UI already renamed plan→Checklist, progress→Activity log (2.37.x). Internal fields still `plan`/`progress`. Full-consistency rename means aligning internal too. Do it carefully (grep-driven, one field at a time, keep migration reads of the old shape).

## 4. Phases (impl order: P1 → P2 → P3 → P4 → P6 → P5, with P0 rename woven in)

**P0 · Full rename (woven through, not a big-bang):** Task→TaskGroup across `tasks.js`, `sidebar-tasks.js`, `task-detail.js`, `session-card.js`, `ws-handler.js`, `server.js` endpoints, routes, docs. `data/tasks.json` → `data/task-groups.json` with a one-time migration read of the old file. Keep each rename step behind a green build.

**P1 · Status lands on the Task (session), not the Group.**
- `session-status.js`: add `done` to `STATES`. Add its icon/color to `SESSION_STATE_META` (sidebar-tasks.js), render in the card chip + popover.
- Remove group `.status` (active/paused/blocked/done) from `tasks.js` + board (`sidebar-tasks.js` `TASK_STATUS_META`, status chip/dot) + `task-detail.js` (status select). Group keeps `archived`.
- `vibespace-task`: drop the `status` subcommand (groups have no status). `done` is reported via `vibespace-status done`.
- Migrate: existing group `.status` dropped; a `done` group MAY auto-archive.

**P2 · Multi-group belonging + kill the single context task.**
- `tasks.js`: add `groupsForSession(key, cwd)` → all groups whose `sessions[]` includes key OR whose folders match cwd (reuse `_getTaskSessionKeys` logic inverted).
- Injection endpoints (`/api/agent/task-context`, `/api/agent/prompt-context` in server.js): derive groups via `groupsForSession`; inject the concatenated context of ALL belonged groups (each block headed by the group name). `renderContext` becomes per-group; a new wrapper concatenates.
- **Remove `session._taskId`.** Belonging is live-derived, so `bind`/drag-onto-group takes effect IMMEDIATELY at the next turn (fixes the old "bind ≠ context task" gap), `unbind` removes it. `VIBESPACE_TASK_ID` at spawn is just an initial tag.

**P3 · `vibespace-task --group` + enforced isolation.**
- CLI: add `--group <id>`. One group → optional (defaults to it). Multiple → required; missing → error listing the session's groups.
- Server `/api/agent/task*`: validate `--group ∈ groupsForSession(session)` — **403 otherwise** (enforces "a Task may only touch groups it belongs to"). Replaces the old single-`_taskId` scoping.

**P4 · Injection full lifecycle (incremental updates).**
- Per-session per-group seen version: `session._groupSeenAt = { groupId: updatedAt }`.
- `prompt-context`: for each belonged group, if `group.updatedAt > seen[groupId]` → inject that group's current state marked "UPDATED", bump seen. So ANY group change reaches all its sessions on their NEXT turn.
- _(Superseded in 2.113.0, user request: an UPDATE now injects only the DELTA — the session snapshots each group at delivery (`s._groupSnap`) and `tasks.renderContextDiff` emits a `<vibespace-task-update>` block of just the changed checklist items / objective edits / changed contextDir files / new activity. Full state still on first delivery + after restart; toggle `agents.contextUpdateDiffs`.)_
- Trigger sources to cover (user: cover ALL): (1) another session's `vibespace-task` (bumps group.updatedAt — already does via `TaskManager.update/addProgress`), (2) user edits objective/checklist/activity in the UI (bumps updatedAt), (3) **user hand-writes files in `contextDir`** — needs a signal: watch `contextDir` (fs.watch) or compare the file-index/mtimes on each prompt and treat a change as an update. User explicitly wants (3) done now (not deferred).

**P6 · Per-group injection toggle** (user asked): each Task Group gets an `injectContext: bool` (default true) in `task-detail.js`; when false its context isn't injected. Baseline `vibespace-status` intro for sessions belonging to NO group stays (2.38.0).

**P5 · Checklist ↔ session loose link (last, NOT enforced):** a Checklist item may be annotated with which session is doing/finished it (text association only). UI shows it. No hard binding.

## 5. Constraints (must hold)

- **Isolation (enforced, not just advisory):** a session's `vibespace-task` can only read/write groups it belongs to (P3 403). Same hard guarantee the old single-`_taskId` token gave, generalized to the group set.
- **No message rewriting:** all injection stays via the harness's own SessionStart/UserPromptSubmit hook (`vibespace-hook.mjs`) → `hookSpecificOutput.additionalContext`. Codex ignores SessionStart output → gets everything via `prompt-context` (first prompt + updates).
- **Control-plane boundary:** VibeSpace organizes/presents/persists/observes; never drives the agent loop. Groups + status + injection are all observe/present/report, not orchestration.

## 6. Current code anchors (for post-compaction navigation)

> **PRE-IMPLEMENTATION SNAPSHOT — superseded by what shipped (2.39.0).** The anchors below were written before the refactor landed; the ACTUAL current names differ: `src/tasks.js`→**`src/task-groups.js`**, `TaskManager`→**`TaskGroupManager`**, `data/tasks.json`→**`data/task-groups.json`**; a Task Group has **no `.status`** (the STATUSES field was dropped); session `STATES` now **include `done`**; `session._taskId`→**`session._initialGroupId`** with live belonging via `groupsForSession`/`resolveAgentGroup`; and there is **no `VIBESPACE_TASK_ID` env**. See the CLAUDE.md "2.39.0 refactor" note for the authoritative current map.

- `src/task-groups.js` (was `src/tasks.js`) — `TaskGroupManager` (was `TaskManager`): create/update/remove/bind/unbind/addProgress, `renderContext(id)` / `renderMultiContext(ids)` (the `<vibespace-task-context>` block), `renderTaskMd(t, cap)`, `groupsForSession`/`_getTaskSessionKeys`, folders are `{path, recursive}`, `plan`=Checklist, `progress`=Activity log. NO `.status` field (Task Groups only have `archived`).
- `src/session-status.js` — `SessionStatusManager`: `STATES=[working,needs-input,blocked,review]` (add `done`), debounced `_save`/`_flush`/`flush`, `data/session-status.json`.
- `server.js` — `agentSession(req,res,{needTask})`, `/api/agent/task-context` (task ctx OR `SESSION_TOOLS_INTRO` baseline), `/api/agent/prompt-context` (task update on `updatedAt > _taskSeenAt` + baseline + status notice), `createHookHelper()` (generates `vibespace-hook.mjs` — no longer gates on taskId), `sessionStatus.flush()` in `shutdown()`.
- `data/bin/vibespace-task` (static CLI, scoped server-side to session's `_taskId`), `vibespace-status` (generated in `createStatusHelper`).
- `src/ws-handler.js` — `session._taskId` set at spawn from `data.taskId`; `remoteAgentSetup()` distributes tools + reverse tunnel; env injects `VIBESPACE_API/SESSION_TOKEN/TASK_ID`.
- `src/lib/sidebar-tasks.js` — board render, `SESSION_STATE_META` (+ `_si` icons), `TASK_STATUS_META`, `_getTaskSessionKeys`, `_folderRec`, bind/unbind, `_sessionSortRank`.
- `src/lib/task-detail.js` — the group detail window (objective/checklist/activity/folders/contextDir/color/export-import).
- `src/lib/session-card.js` — card, connection dot, adaptive status chip (`fitTags`, clientWidth), config gear.
- Existing design docs: `docs/design-task-system.md` (original P1–P4).

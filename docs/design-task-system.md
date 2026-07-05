# Task System — Design

Status: **DESIGN** (2026-07-05). Supersedes the shelved walter `feat/task-centric` approach (see below). This document is the agreed design before implementation.

## 1. Vision & the hard boundary

A **task** is a durable, cross-session unit of work that sits *above* individual agent sessions. Today the durable thing in VibeSpace is a session (one JSONL); a task groups sessions, carries a persistent objective + context, and surfaces which of its agents need attention.

**The boundary that shapes everything (do not cross):** VibeSpace is the **control plane** — it *organizes, presents, persists, and offers sanctioned extension points*. It is **not** the orchestration plane — it does **not** drive the agent loop, decide what the agent does next, auto-spawn/auto-continue, or inject words into the model by reaching around the harness. That is the harness's job (native `/goal`, hooks, MCP).

Litmus test for any task-system feature: *does it DECIDE/INFLUENCE what the agent does/thinks/when it runs, or does it MANAGE/PRESENT/ORGANIZE work the user or harness drives?* The former is an intrusion. Where a feature genuinely needs to put context in front of the agent, it does so **through the harness's own mechanisms** (a SessionStart hook, an MCP tool) that the user opts into — never through the stream wrapper.

Why walter's version was shelved: it drove context injection through the webUI wrapper (putting words in the agent's mouth) and depended on a private external "claude-ops" system (external markdown + a cron sentinel). This design keeps the good ideas (task-as-unit, attention surfacing) but routes every agent-facing action through native harness extension points, and keeps VibeSpace self-contained.

## 2. What we're solving (user-confirmed pain points)

1. **Multi-session organization / tracking** — many agent sessions at once; group them by task and see each task's progress/state instead of a wall of loose sessions.
2. **Attention** — spot the agent that's stuck / waiting / making no progress, from a board, at a glance.
3. **Cross-session persistent objective + context** — a task's goal, shared context, and progress survive across sessions and days.

Explicitly **out of scope** (user did not choose it): auto-scheduling / fleet automation (auto-spawn, auto-assign, auto-continue). That's orchestration.

## 3. Core model

**Task = a tag, and tasks are a SUPERSET of Groups** (user-confirmed). A task is a group with a goal + lifecycle + attention. Existing user groups stay as-is (a task with no objective/status behaves exactly like today's group); the Groups tab grows into the task board. One grouping system, not two.

```
Task {
  id            "T-<yymmdd>-<slug>"        // stable, human-readable
  title
  status        active | paused | done | blocked
  attention     null | { reason, since }    // surfaced, set by signals (see §7) or manually
  sessions      [sessionKey, ...]           // bound sessions (backend:backendSessionId)
  contextDir    null | "<abs path>"         // the task's shared context FOLDER (§4a)
  pinnedFile    "TASK.md"                   // file inside contextDir injected VERBATIM (default TASK.md)
  createdAt, updatedAt
}
```

The `objective` lives in the pinned file inside `contextDir` (not a DB field) — human-editable, agent-readable/writable, one source of truth.

**State source (user-confirmed): split by nature** — task METADATA (id/title/status/sessions/attention/contextDir) lives in `data/tasks.json` (atomic write + `tasks-updated` WS broadcast, same pattern as hosts/mounts/user-state); task CONTENT (objective, progress, shared artifacts) lives in the context folder as plain files (§4a/§5), where both the user (via VibeSpace UI) and agents (via their file tools) read/write it. Self-contained with zero external setup; repo participation is just pointing contextDir into a repo (§6).

### 3.1 Data structures

Task METADATA lives in `data/tasks.json` (new `TaskManager`, atomic write + `tasks-updated` WS broadcast + export/import, exactly like hosts/mounts). The existing `sessionGroups`/`groupFolders` in user-state.json **migrate in** on first load (a group = a task with `kind:'group'`, no goal/lifecycle). user-state keeps star/archive/customNames/etc.

```
data/tasks.json
{
  "version": 1,
  "tasks": {
    "T-260705-refactor-auth": {
      "id":         "T-260705-refactor-auth",   // stable; T-<yymmdd>-<slug(title) || rand6>
      "title":      "Refactor auth layer",
      "kind":       "task",                       // "task" | "group" (migrated groups; no goal/lifecycle)
      "sessions":   ["claude:<uuid>", "codex:<uuid>"],  // bound session keys (was sessionGroups[name])
      "folders":    ["/path/to/repo"],            // auto-include sessions by cwd (was groupFolders[name])
      "contextDir": "/path/to/.vibespace/T-260705-refactor-auth",  // null = no agent participation / no injection
      "pinnedFile": "TASK.md",                    // injected verbatim; default TASK.md
      "color":      null,                          // optional board color (else cwd-hash like today)
      "createdAt":  1700000000000,
      "updatedAt":  1700000000000,

      // ── CACHED from the context folder (see §5); folder is the truth, these are for the board ──
      "status":     "active",                      // active | paused | blocked | done   (from TASK.md frontmatter)
      "attention":  null,                          // { reason, since }                   (from TASK.md `blocked:` or a signal)
      "lastProgress": { "at": ..., "session": "claude:<uuid>", "line": "…" }  // from progress.md tail
    }
  }
}
```

**ID:** `T-<yymmdd>-<slug>` where slug = kebab of the title, or a 6-char random suffix when the title doesn't slug cleanly (CJK/spaces). Stable forever (used in `VIBESPACE_TASK_ID` + the contextDir folder name). Migrated groups get an id too; their CJK names stay in `title`.

**Truth-source split (the rule that keeps sync sane):**

| field | source of truth | who writes |
|---|---|---|
| id, title, kind, sessions, folders, contextDir, pinnedFile, color | `data/tasks.json` | VibeSpace UI only (agents never touch structure/binding) |
| status, attention(blocked) | `TASK.md` frontmatter *(if contextDir set)*, else tasks.json | agent (frontmatter) **or** user (UI → writes frontmatter); VibeSpace caches to tasks.json for the board |
| objective / plan | `TASK.md` body | agent or user (CodeMirror on the file) |
| progress | `progress.md` (append-only) | agent appends; user views (or appends via UI) |

So `data/tasks.json` owns *structure*; the *content* an agent and a human both touch lives in files, where each field has exactly ONE writable home — no bidirectional loops.

## 4. Binding → context injection (the key mechanism)

**Confirmed feasible on BOTH harnesses.** Claude Code and Codex (≥0.14x) use the SAME hooks.json schema (`SessionStart`/`UserPromptSubmit`/`Stop`, `{type:'command', command}`), and a SessionStart hook returning `{ additionalContext }` injects into the session's context. Live evidence on this machine: the org's own `claude-task-tracker` plugin (ProblemFactory) runs ONE hook.mjs from both `~/.claude` plugin hooks AND `~/.codex/hooks.json`, and its SessionStart handler already returns `additionalContext`. So one dual-harness hook script covers both backends.

Flow:
1. User binds a session to a task (or starts a new session "in" a task from the board).
2. VibeSpace spawns that session with `VIBESPACE_TASK_ID=T-...` in its env (dtach/ssh spawn line, same place `CLAUDE_WEBUI_*` go).
3. A **VibeSpace hook script** (one .mjs, registered for both harnesses) runs at SessionStart, reads `VIBESPACE_TASK_ID`, fetches `GET /api/tasks/:id/context` from the local VibeSpace, and returns `additionalContext`.
4. The agent starts knowing the task — natively, opt-in, no wrapper injection.

### 4a. What gets injected: the task context folder (user-designed)

Each task can designate a **context folder** (`contextDir`) — the task's shared brain, visible to every bound agent (it's just a directory; agents on remote hosts see it via a mount/shared path when applicable). The injected `additionalContext` is assembled from it:

1. **The pinned file** (default `TASK.md`, user-choosable) — injected **verbatim**: the objective, constraints, current plan.
2. **A listing of the other files** in the folder (name/path + size/mtime) — injected as an index so the agent knows what reference material exists and can READ what it needs with its normal file tools (no context bloat from injecting everything).
3. **The task skill** — short instructions telling the agent the conventions: "this is your task folder; append progress to progress.md; update status/blocked in TASK.md frontmatter; put artifacts other agents need here." This replaces MCP entirely (user decision): the agent participates through ordinary file reads/writes, and VibeSpace **watches the folder** (fs.watch) to reflect status/progress on the board. No protocol, no tools to install — any agent that can edit files can participate.

Properties: opt-in (env var), sanctioned hook API, degrades gracefully (no hook → session starts normally; no contextDir → inject just title/status), user-authored content. The `/goal` lesson applied: delegate to the native mechanism.

## 5. Agent participation = files, not MCP (user decision)

No MCP server. The injected skill (§4a) defines simple file conventions inside `contextDir`:
- `TASK.md` (pinned) — objective + a small frontmatter block (`status:`, `blocked:` reason) the agent may update.
- `progress.md` — append-only progress notes (`## <date> <session>` sections).
- anything else — shared artifacts/reference docs for sibling agents.

VibeSpace **watches the folder** and parses just those two conventions to drive the board (status changes, blocked reasons, latest progress line). The agent uses its normal Read/Write tools; nothing to install beyond the hook. This is control-plane by construction: agents report by writing files; VibeSpace observes and presents.

**UI for the same state:** the task detail view lets the USER edit everything the agent can — open/edit the pinned file (CodeMirror editor already exists), browse the context folder (file explorer exists), change status/attention directly. User and agents share one medium: the folder.

## 6. Repo task files (optional, bidirectional, agent-driven)

For teams who want tasks to live in the repo (walter's instinct, done right and optional):
- **Export**: a task → `tasks/T-*.md` with YAML frontmatter (id/title/status) + the objective body. VibeSpace writes it, or the agent does via `task_update` + file tools.
- **Import / link**: point a VibeSpace task at an existing repo task file; VibeSpace reads it for display and (optionally) watches it for changes.
- No hard dependency: with no repo file, tasks live purely in `data/tasks.json`. The repo file is a projection/sync target, never required.

## 7. Attention / observability (harness-native signals only)

The board shows which agents need you, from signals VibeSpace **already has** — no external sentinel:
- **Idle-waiting**: the existing OSC-title idle detection (✳ vs braille spinner) already tells us an agent finished and is waiting. Per-task, aggregate this into a "waiting" count/flag.
- **No-progress / stuck**: derive from existing signals (no output for N minutes while "working", repeated identical tool calls, error loops) — pure observation of the session, no intervention.
- **Agent-declared blocked**: via `task_update` `attention` (§5).

VibeSpace only *detects-by-observing* + *surfaces* + lets the user *acknowledge*. It never auto-acts on attention (no auto-nudge, no auto-spawn).

## 8. UI

- **Task board** (new sidebar tab or a mode of the workbench): tasks as cards/columns by status; each card shows title, bound-session count, progress, and an attention badge (blinking when an agent needs input). Click a task → its sessions + objective + progress log.
- **Bind/unbind**: from a session card ("Add to task ▸") — reuses the existing group-assignment interaction (task is a tag, like groups). "New session in this task" spawns a session with the task env var set.
- **Task ↔ existing Groups**: Groups already exist (user-defined session groupings). A task is a *richer* group (objective + status + attention + optional agent participation). Decide during build whether tasks are a superset of groups or a parallel concept — lean toward **tasks are groups with a goal + lifecycle**, to avoid two overlapping grouping systems.

## 9. Architecture summary

```
server:  src/tasks.js  TaskManager (data/tasks.json, atomic + tasks-updated broadcast)
         routes: /api/tasks CRUD, /api/tasks/:id/context (hook reads this), bind/unbind
         spawn: inject VIBESPACE_TASK_ID into bound sessions (ws-handler spawn line)
         watch: fs.watch on each task's contextDir → parse TASK.md frontmatter + progress.md → board
hook:    ONE dual-harness hook script (same schema in ~/.claude plugin hooks and ~/.codex/hooks.json;
         proven by the org's claude-task-tracker) — SessionStart → VIBESPACE_TASK_ID →
         GET /api/tasks/:id/context → additionalContext (pinned file + folder index + task skill)
client:  task board = Groups tab grown up (tasks ⊃ groups); task detail view (objective editor via
         CodeMirror, folder browse, status/attention); bind via existing group-assignment interaction;
         attention from OSC idle detection + folder-declared blocked
```

## 10. Phasing

- **P1 (MVP, pure control-plane, zero agent-facing pieces):** TaskManager + `data/tasks.json` + task board (Groups-superset migration) + bind sessions (tag) + per-task attention from the EXISTING idle detection + context folder designation + task detail UI (edit pinned file / browse folder). No hook yet. Delivers pains #1 and #2.
- **P2 (context injection):** the dual-harness SessionStart hook + `VIBESPACE_TASK_ID` spawn + `/api/tasks/:id/context` (pinned file verbatim + folder index + task skill). Delivers pain #3.
- **P3 (agent participation):** contextDir watcher parsing TASK.md frontmatter + progress.md → agent-declared status/blocked/progress on the board. (Files, not MCP.)
- **P4 (repo sync):** contextDir can BE a repo directory (tasks/T-*/ in a repo) — export/link conventions.

Ship and validate each phase before the next. P1 is the safe, high-value core; P2–P4 add the agent-facing surface, each through a native harness extension point.

## 11. Boundary check (per pillar)

| Pillar | Control-plane? | Why |
|---|---|---|
| Task-as-tag + board | ✅ pure | organizes/presents; user drives |
| Attention surfacing | ✅ | detect-by-observing existing signals + manual ack; never auto-acts |
| Context injection via SessionStart hook | ✅ | harness's own mechanism, opt-in, user-authored context; VibeSpace doesn't touch the loop |
| Agent participation via files in contextDir | ✅ | agent uses its ordinary file tools by choice; VibeSpace watches + presents |
| Repo task-file sync | ✅ | a projection of state; agent writes files with its own tools |
| ~~auto-spawn / auto-continue / auto-assign~~ | ❌ excluded | that's orchestration — the harness's `/goal` and the user own it |

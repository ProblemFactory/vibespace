# Task System — Design

Status: **P1+P2 SHIPPED** (P1 2.30.0, session-status/new-session-from-task 2.31.0, P2 injection 2.32.0 — all 2026-07-05). P2 note: codex 0.142.x has NO session-start hook (only user_prompt_submit/permission_request), so codex gets the context attached to its first chat message until a native hook exists; claude uses the real SessionStart hook (nested hookSpecificOutput shape REQUIRED). P3 vibespace-task CLI shipped 2.33.0 (local sessions; endpoints scoped to the session's context task; hook install surfaced in Manage Agents). Remaining: P3 remote half (ssh reverse tunnel + remote tool distribution) and P4 (repo sync). Design agreed 2026-07-05; supersedes the shelved walter `feat/task-centric` approach (see below).

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

**Task = a tag, and tasks are a SUPERSET of Groups** (user-confirmed). A task is a group with a goal + lifecycle + attention. Existing user groups stay as-is (a task with no goal behaves exactly like today's group); the Groups tab grows into the task board. One grouping system, not two.

**Tagging is many-to-many** (a session can carry several task tags — that's what "tag" means). But **context injection uses ONE task per session** (the task the session was created under, carried in `VIBESPACE_TASK_ID`) — you can't inject two conflicting objectives. So: multi-tag for organization, single "context task" for injection.

**Two INDEPENDENT, both-optional folder bindings** (user clarification — don't conflate them):
- `folders[]` — **auto-include folders**: sessions whose cwd is under these are auto-added to the task (= today's `groupFolders`). Absent → sessions are added manually.
- `contextDir` — the **context folder**: the task's shared brain, injected into its context sessions (§4a). Absent → no injection / no agent file-participation; the task is still a fully usable board item.

A task can have neither, either, or both.

```
Task {
  id            "T-<yymmdd>-<slug>"        // stable
  title
  kind          "task" | "group"           // migrated groups = "group" (no goal/lifecycle)
  status        active | paused | blocked | done   // AUTHORITATIVE in tasks.json (see §3.2)
  attention     null | { reason, since }           // backbone = VibeSpace idle detection (§7)
  sessions      [sessionKey, ...]           // tagged sessions (many-to-many)
  folders       [absPath, ...]              // auto-include folders (optional)
  contextDir    null | absPath              // context folder (optional, §4a)
  // the tracked file is always <contextDir>/.vibespace/TASK.md (generated; §5)
  color, createdAt, updatedAt
}
```

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

### 3.2 Truth model — structured store is authoritative; files are a RAW-displayed workspace

**`data/tasks.json` is the single source of truth for everything the UI renders** — title, kind, status, attention, tags, folders, contextDir. The UI reads and writes it directly (structured, reliable, no markdown parsing anywhere in the render path). This is the correction to an earlier draft that put status in `TASK.md` frontmatter: **an agent is non-deterministic and may ignore any file convention, so the board must never depend on parsing agent-authored markdown.**

The context folder's files (`TASK.md`, `progress.md`, artifacts) are the **shared human+agent workspace**, and VibeSpace shows them **raw** (existing CodeMirror / file explorer — zero parsing to display). Their relationship to the structured store:

| field | authoritative | how it's set |
|---|---|---|
| title, kind, tags(sessions), folders, contextDir, color | `tasks.json` | user in UI (and VibeSpace auto-tag by `folders`) |
| **status** | `tasks.json` | user in UI (always), OR VibeSpace idle detection (active↔waiting), OR a best-effort agent signal (below) |
| **attention** (needs-you) | `tasks.json` | **backbone = VibeSpace idle/no-progress detection** (§7, zero agent cooperation) + optional agent-declared blocked |
| objective, progress, artifacts | the files in `contextDir` | agent (its file tools) + user (CodeMirror), shown RAW in the detail view |

**Agent signals are best-effort enrichment with a reliable native fallback.** The board is fully populated from user input + VibeSpace's own observation *even if no agent ever touches a file*. If an agent DOES follow the skill's convention, VibeSpace best-effort enriches (a "blocked: <reason>" chip, a "latest progress" line) — but a malformed or missing file just means no enrichment, never a broken or blank board (last-good wins; the raw file is still there for humans). See §5 for exactly how the agent reports and how VibeSpace consumes it safely.

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

## 5. Two classes of task files (user decision, rev 4/5)

The context folder is physically split by writability (rev 5: the untouchable class lives in its OWN subfolder, and the injected context says so explicitly):

```
<contextDir>/
  .vibespace/          ← Class A: program-managed, agents MUST NOT modify (injection says so)
    TASK.md            ← generated by VibeSpace from the structured store
  …everything else…    ← Class B: free files & assets, agents edit freely
```

**Class A — the tracked file (structured, agent-NEVER-edits-directly).** `TASK.md` with a specific format: objective, status, plan/checklist, progress log. Agents don't write it with file tools — it is **generated by VibeSpace** from the structured store (`tasks.json` + progress entries), so its format is guaranteed by construction (the only writer is a program). Its content is what gets **programmatically assembled and injected** into bound sessions' context. Humans edit it through the task detail UI (structured fields + objective editor), never by fighting the generator. The injected skill states plainly: *"everything under `.vibespace/` is generated and read-only for you — report changes with the `vibespace-task` tool instead."* Directory-level separation makes the rule trivially clear (one path prefix), and VibeSpace can additionally watch `.vibespace/` and regenerate on any foreign write.

**Class B — free files & assets (agent-editable).** Everything else in `contextDir`: findings, designs, artifacts, reference docs. Agents create/edit these freely with normal file tools; the injection includes an **index** of them (names/paths) so agents pull what they need. VibeSpace displays them raw (file explorer / CodeMirror) and never parses them.

### 5.1 How agents modify Class A: a tool that calls VibeSpace

Agents change task state (status, progress notes, plan check-offs, blocked+reason) by **calling a tool that hits VibeSpace's API** — not by editing the file:

- **The tool**: a tiny CLI shipped by VibeSpace (`vibespace-task`), invoked via the agent's ordinary Bash tool. Subcommands mirror the API: `status <active|blocked|done> [--reason …]`, `progress "<note>"`, `plan-check <item>`, `show`. It reads `VIBESPACE_TASK_ID` + `VIBESPACE_API` from the session env (both injected at spawn).
- **Transport**: local sessions hit `http://127.0.0.1:<port>` directly. **Remote sessions** get an ssh **reverse tunnel** (`-R <port>:localhost:<port>` added to the existing ssh spawn line) so the same URL works on the remote host — the tool is transport-agnostic.
- **Server side**: `/api/tasks/:id/agent` endpoints validate every write (enum status, size-capped notes), update `tasks.json` + the progress log, **regenerate `TASK.md`**, and broadcast `tasks-updated`. A scoped per-task token in the env (like the bridge's `vsmt_`) authenticates it without exposing the whole API.
- The injected **skill** teaches exactly this: "report status/progress with `vibespace-task …`; NEVER edit TASK.md directly (it's generated); put shared artifacts in this folder."

This answers "万一 agent 没按约定怎么办": the worst a misbehaving agent can do is (a) not report — board still correct from user input + VibeSpace idle detection; (b) edit TASK.md anyway — the next regeneration overwrites it (optionally VibeSpace diffs & warns); (c) garbage tool calls — rejected by validation. The structured surface cannot be corrupted because agents have no write path to it except the validated API.

### 5.2 What VibeSpace parses: nothing of the agent's

The injection payload = render(tasks.json structured state) + verbatim Class-A body sections (objective text, authored in UI) + Class-B file index. No agent-authored text is ever parsed for meaning — Class B is displayed raw and listed by name only.

### 5.3 The user edits the same state in the UI

Task detail view: structured fields (title, status, tags, plan items, folders, contextDir) edit `tasks.json` directly; the objective editor writes the objective section; `TASK.md` regenerates after every change. The folder browser shows Class B raw. One truth, three views (UI, generated TASK.md, injected context).

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

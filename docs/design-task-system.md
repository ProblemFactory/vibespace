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

**Task = a tag** (user-confirmed). It's a first-class object that sessions are tagged with; a session belongs to zero or one task; a task has many sessions. It is NOT a container that owns/locks sessions (walter's claim/lock model is dropped — too heavy, too close to orchestration).

```
Task {
  id            "T-<yymmdd>-<slug>"        // stable, human-readable
  title
  objective     markdown                    // the persistent goal + context injected into bound sessions
  status        active | paused | done | blocked
  attention     null | { reason, since }    // surfaced, set by signals (see §7) or manually
  sessions      [sessionKey, ...]           // bound sessions (backend:backendSessionId)
  repoFile      null | "<abs path or repo-relative>"  // optional linked task file (§6)
  createdAt, updatedAt
}
```

**State source (user-confirmed): VibeSpace owns it** — `data/tasks.json` (atomic write + `tasks-updated` WS broadcast, same pattern as hosts/mounts/user-state). Two escape hatches, both agent-driven:
- Agents can **read/update** task state via an MCP tool / skill (§5).
- A task can **export to / sync with a repo task file** (§6), written by the agent with its normal file tools.

This makes VibeSpace self-contained (works with zero external setup) while letting agents and repos participate when wanted.

## 4. Binding → context injection (the key mechanism)

**Confirmed feasible** — this is exactly how existing SessionStart hook plugins (e.g. `claude-mem`) already inject context: a hook emits `hookSpecificOutput.additionalContext` at session start and the harness adds it to the session's context. We use the harness's own mechanism; VibeSpace never touches the stream.

Flow:
1. User bind a session to a task (or starts a new session "in" a task from the task board).
2. VibeSpace spawns that session with an env var, e.g. `VIBESPACE_TASK_ID=T-...` (injected in the dtach/ssh spawn line, same place `CLAUDE_WEBUI_*` go).
3. A **VibeSpace SessionStart hook plugin** (shipped by us, installed once into `~/.claude/settings` or as a plugin) runs at session start, reads `VIBESPACE_TASK_ID`, fetches that task's `objective` + live progress from VibeSpace's local API (`GET /api/tasks/:id/context`), and emits it as `additionalContext`.
4. The agent starts already knowing the task's goal and state — natively, opt-in, no wrapper injection.

Properties: opt-in (only fires when the env var is present), uses the sanctioned hook API, degrades gracefully (hook absent → session just starts normally), and the injected text is *user-authored task context*, not VibeSpace deciding agent behavior. This is the `/goal` lesson applied: delegate to the native mechanism.

Open question for implementation: ship the hook as a **Claude Code plugin** (cleanest, versioned, `/plugin` install) vs. a settings-snippet the onboarding writes. Plugin preferred.

## 5. Agent-writable state (MCP / skill)

VibeSpace exposes a small **MCP server** (local, stdio or the session's env-addressable HTTP) giving the bound agent tools to participate in its task:
- `task_get` — read the current task (objective, status, progress, sibling sessions).
- `task_update` — set status, append a progress note, set/clear `attention` with a reason ("blocked on X").
- `task_note` — append to a running shared context/log the task carries.

The agent *chooses* to call these (a tool, not a compulsion) — squarely control-plane: the agent reports up, VibeSpace stores + presents. This is how an agent marks itself blocked, which the board then surfaces (§7) — detection stays with the agent/harness, VibeSpace only stores + shows.

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
hook:    a Claude Code plugin — SessionStart → read VIBESPACE_TASK_ID → GET context → additionalContext
mcp:     a small MCP server exposing task_get/task_update/task_note to bound agents
client:  task board UI (sidebar), bind-to-task on session cards, attention surfacing
         reuse: group-assignment interaction, OSC idle detection, workbench cards
```

## 10. Phasing

- **P1 (MVP, pure control-plane, zero agent-facing pieces):** TaskManager + `data/tasks.json` + task board UI + bind sessions to tasks (tag) + per-task attention from the EXISTING idle detection. No hook, no MCP yet. This alone delivers pains #1 and #2 and is unambiguously in-scope.
- **P2 (context injection):** the SessionStart hook plugin + `VIBESPACE_TASK_ID` spawn + `/api/tasks/:id/context`. Delivers pain #3.
- **P3 (agent participation):** the MCP server (task_get/update/note) → agent-declared progress + blocked.
- **P4 (repo sync):** export/import/link task files.

Ship and validate each phase before the next. P1 is the safe, high-value core; P2–P4 add the agent-facing surface, each through a native harness extension point.

## 11. Boundary check (per pillar)

| Pillar | Control-plane? | Why |
|---|---|---|
| Task-as-tag + board | ✅ pure | organizes/presents; user drives |
| Attention surfacing | ✅ | detect-by-observing existing signals + manual ack; never auto-acts |
| Context injection via SessionStart hook | ✅ | harness's own mechanism, opt-in, user-authored context; VibeSpace doesn't touch the loop |
| Agent MCP task tools | ✅ | tools the agent *chooses* to call; agent reports up, VibeSpace stores |
| Repo task-file sync | ✅ | a projection of state; agent writes files with its own tools |
| ~~auto-spawn / auto-continue / auto-assign~~ | ❌ excluded | that's orchestration — the harness's `/goal` and the user own it |

# Design: Background Work — agent-detachable Services, Long Tasks, and Cron

Status: **IMPLEMENTED 2.342.0** (2026-08-17, owner-approved; per-machine only — cross-machine execution parked pending owner design). This doc remains the authoritative spec; deferred residue: remote hostId, resource caps, --publish deep wiring, port-sweep suppression, taskbar badge segment, Session Properties row, systemd/crontab one-click import, panel tier-2 iframe.
v1→v2: three-lens red team (40 findings, 5 critical) incorporated.
v2→v3 (owner decisions 2026-08-17): ① services must survive a pod rebuild via
boot replay — that is sufficient; long tasks need NOT survive pod rebuilds.
② **No automatic agent triggering from cron/task completion** — the automation
red line stands (the only conceivably-acceptable future form would be an
explicitly-metered `claude -p` run on an API-key account; deferred
indefinitely). Instead, job events reach a conversation as **passively injected
context at natural turn boundaries**, byte-budgeted. ③ Agents obtain results
primarily via **poll**, not wakeups. ④ New: **Interaction Panels** — an agent
running a user-interactive long task (verification codes, scan-QR-then-enter)
can present a simple UI to the user; the definition mechanism is §6.4.
Evidence base and archetypes: §2 (mined from 2.1 GB of this machine's agent
history; private verbatim evidence in the personal-group shared context).

---

## 1. Problem statement

Agent work constantly produces processes and obligations that must **outlive the
conversation**; every VibeSpace primitive today is session-bound. Observed
workarounds (all real, recurring): `nohup`/`setsid` roulette (leaks — the 12 GB
orphan dev-server incident behind B-16d9); escapes to `systemd --user` + crontab
(a daily agent automation hand-built as timer + retry script + chat-mirror, with
secrets baked into unit files and 4 silent failures in 3 weeks); sessions parked
as pollers (CI watchers re-armed by hand a dozen times); future-dated backlog
items as poor-man's cron; results landing in `/tmp` with no context after the
launcher compacted; `pkill -f` matching the agent's own cmdline (twice); and
post-restart recovery by human broadcast because no inventory exists.

| Kind | One-liner | Lifecycle |
|---|---|---|
| **Service** | "keep this process up" | boot replay (incl. across pod rebuilds), restart policy, health check, no completion |
| **Long task** | "run to completion; I may be gone by then" | one-shot, interruptible, pollable, carries a context payload echoed at poll time; dies with the pod (accepted) |
| **Cron** | "do X on a schedule / at a date" | fires an action: **spawn a task** or **notify the user** (никогда an agent) |

## 2. Use-case archetypes (mined, deduplicated)

**Services** — (1) dev server for verification, findable/stoppable after the
conversation; (2) serve-to-the-outside (test HTTP servers, webhook/OAuth targets
— wants stable published URL + liveness); (3) shared auxiliary infra (headless-
Chrome rig, mock backends, VNC stack — "start if absent, reuse otherwise"); (4)
always-on watchers with remediation (a tunnel silently dead 9 days); (5)
interactive background process holding stdin across turns → now §6.4.

**Long tasks** — (6) multi-hour convergence watches; (7) batch/collection jobs
where overlapping restarts corrupted output (single-instance locking); (8)
await-external-event (human QR scan, endpoint healthy — unbounded, never
silently expires); (9) **poll-later with amnesia**: the poller needs the
original intent — the context payload — echoed with the result.

**Cron** — (10) recurring patrols (quiet-success, escalate-only notify); (11)
future-dated one-shots weeks out; (12) periodic maintenance. (Scheduled *agent
runs* are explicitly out of scope — red line, §3.)

**Cross-cutting** — registration-first (port-sweep discovery stays as the stray
fallback); kill by handle only, re-verified at kill time; per-run history with
retained logs and exit causes; boot = adopt-first; first-class visualization.

## 3. Hard fences

- **No automatic agent triggering. (owner decision, v3)** Cron actions and task
  completions never start or wake an agent. The passive channel (§6.3b) only
  injects awareness into a conversation's *next natural turn*. Rationale: an
  unattended agent run on a subscription identity is the automation red line
  (ban postmortem); the only future-acceptable form would be an explicitly
  metered `claude -p` on an API-key account, and that is deferred indefinitely —
  it is NOT part of this design's M1–M3.
- **§ban-safety by policy + guardrails** (red team: structure alone cannot see
  inside stored argv): create/edit-time refusal of job argv/env/health-cmd
  matching vendor hosts or credential-material paths (`api.anthropic.com`,
  `.credentials.json`, `data/subs`, `CLAUDE_CODE_OAUTH*`, …) with a teaching
  error; schedule floors (default 15 min for agent-created recurring) +
  mandatory jitter; health probes run through the same sanitized async spawn
  path (agentEnv-stripped, hard timeout, group-kill) with jittered intervals;
  negative-control tests (a vendor-credential job spec must be refused).
- **Not a plugin replacement**; **not a distributed scheduler in v1** (`hostId`
  is a parameter from day one, local-only M1); **does not replace** the goal
  loop or harness background Bash (§8 teaches the negative space).

## 4. Data model

Store `data/jobs.json` (writeJsonAtomic, SIGINT/SIGTERM flush, mutations
broadcast `jobs-updated`), per-run logs `data/job-logs/<jobId>/<runTs>.log`.

```jsonc
{
  "id": "jb-3f9a2c",
  "kind": "service|task|cron",
  "name": "collect-x",              // unique per OWNER SCOPE (not global): collision
                                     // auto-suffixes with a warning; ids are the only
                                     // global handle (no existence oracle / squatting)
  "note": "…", "hostId": null,       // null = this instance; machine id in M2

  "cmd": { "argv": [...], "cwd": "/abs", "env": { /* NON-secret; values render to owner/user only, never in jobs-updated payloads */ } },
  "envFrom": ["MY_TOKEN"],           // resolved at spawn from the user-managed secrets store (§7)

  // service
  "restart": "on-failure|always|never",
  "health": { "type": "port|http|cmd", "value": "8088", "intervalS": 60 },  // jittered, sanitized, harmless-probe law
  "ports": [8088], "publish": false,

  // task
  "singleInstance": true,            // per-RECORD concurrent-run lock; enforcement re-verifies
                                     // liveness of the last run's process, never record state alone
  "timeoutMs": null,
  "untilOutput": "COLLECTED",        // literal substring in M1 (regex only via linear-time vet);
                                     // matched against bounded appended tail chunks only (§5)

  // cron
  "schedule": { "cron": "41 9 * * *" } | { "everyMs": 1800000, "jitterPct": 20 } | { "at": "…" },
  "catchUp": "once",                 // default once for {at}; a passed {at} under catchUp:none
                                     // goes terminal `missed` AND fires notify (no silent expiry)
  "expiry": null,
  "action": { "type": "spawn-task", "task": { /* embedded task spec */ } }
          | { "type": "notify", "text": "…", "urgency": "low|normal|high" },
                                     // v3: wake-* actions REMOVED (red line)

  "context": { "payload": "…" },     // cap 8 KB (fits the 9600 B inline injection budget after
                                     // wrapping; CJK-safe truncation); echoed on single-job poll;
                                     // `list` shows first line + byte count

  "interaction": { "pending": null, "answers": [] },   // §6.4 panel state

  // ownership: keyed to CONVERSATION LINEAGE (resume mints a new webui session id)
  "owner": {
    "conversation": { "backend": "claude", "id": "<backendSessionId>" },   // + fork-chain match
    "sessionId": "…", "sessionCreatedAt": 0,   // secondary, collision-proof tuple
    "createdBy": "agent|user",
    "groupsSnapshot": ["T-…"]        // refreshed eagerly on every mutation + periodic sweep
  },
  "access": { "view": "group", "control": "session", "lockedBy": null },
                                     // agent defaults: view=group (fallback all when
                                     // ungrouped), control=session; user locks stick (§7)
  "stopWithOwner": false,

  "desiredUp": true,
  "state": "up|down|starting|failed|done|interrupted|unverified|scheduled|missed|awaiting-user",
  "proc": { "pid": 0, "starttime": 0, "bootId": "…", "argvHash": "…" },
                                     // identity = pid+starttime+bootId; argv-hash secondary only
  "supervise": { "consecutiveFails": 0, "parkedAt": null },   // persisted; boot skips parked
  "runs": [ { "startedAt":0,"endedAt":0,"exit":143,"cause":"ok|ok(until-output)|error|interrupted|oom|timeout|env-restart|missed","log":"…","trigger":"manual|boot|cron|restart-policy" } ]
}
```

## 5. Engine

Tier routing: PURE `src/job-model.js` (schedule math, jitter, state machine,
permission predicates, vendor-pattern vet, panel-schema validation) · ORCH
`src/jobs.js` + server.js wiring stanza · agent endpoints in agent-routes.js ·
REST `/api/jobs*` · CLI `data/bin/vibespace-job` (static tracked, AGENT_TOOLS) ·
CLIENT `src/lib/jobs-panel.js` (+ `src/lib/job-interact.js` §6.4) · M2 DEVICE
`job-*` agentd ops.

- **Single-engine lock**: `data/jobs.lock` (pid+starttime, stale-safe) before
  adopt/replay; a second server process (the #127 class) gets read-only view +
  loud notice — never adopts, replays, or fires crons.
- **Failure isolation**: engine init after listen, try/catch; endpoints 503
  until engine-ready; ANY init failure files a persistent user notice + panel
  banner. Per-job try/catch. Crash loops: success = uptime ≥ 60 s, backoff
  5 s→10 m, cap 6 → park `failed` + notify; `consecutiveFails/parkedAt` persist;
  boot replay skips parked services. Store corruption: rename `.corrupt-<ts>`,
  reconcile from pidfiles + log-dir names into `unverified` records, block
  same-name re-registration until resolved, salvage-parse best-effort.
- **Process identity & spawn**: intent-before-spawn (`starting` + pidfile path
  flushed); setsid-detached via a tiny wrapper whose first act writes its own
  pidfile {pid, starttime, bootId, argvHash}; boot reconciles pidfiles +
  declared-port liveness BEFORE replay decisions. Adopt and every kill re-verify
  the full stamp at act time. Tasks are adopt-first too; non-adoptable-but-
  possibly-alive parks `unverified`, never terminal-while-running.
- **Survival promise (v3, simplified per owner decision)**: services survive ANY
  restart — same-process-tree restarts by detach+adopt, pod rebuilds by **boot
  replay** (respawn from spec; that is the accepted semantic). Long tasks
  survive server restarts where detach holds (systemd/bare) and are honestly
  marked `cause:"env-restart"` + owner notified when a pod rebuild kills them —
  no checkpoint magic promised. CLI/panel state the per-runtime promise.
- **untilOutput mechanics**: per-job byte-offset cursor, incremental
  appended-tail reads with per-tick byte budget, per-line length cap; M1 literal
  substrings; match → grace 30 s → SIGTERM group → `ok(until-output)`.
- **GC**: age-based only; never GC a record whose stamp verifies alive; never
  unlink a non-terminal run's log (rotate via wrapper reopen, don't unlink).
- **Ports integration**: registered `ports` suppress the "new port" toast
  (service row instead; annotation waits on engine-ready); orphan detector
  consults the registry; orphan toast gains **"Track this"** (adopts as
  `restart:never` health-only, "restart command unknown" — /proc can't
  reconstruct env/venv); `--publish` composes with forward/frp for stable URLs.

## 6. Semantics

### 6.1 Service
Register → `desiredUp:true` → supervised start. `stop` always sets
`desiredUp:false` (resurrection needs explicit `start` — no stop-vs-disable
footgun). Health probes: sanitized env, async, timeout, jittered.

### 6.2 Long task
Created via `run`; id returned immediately. Poll (non-blocking) returns state +
exit cause + payload + bounded log tail. `--wait` long-poll: server clamp 600 s,
waiter caps per job/token, resolve-with-state on shutdown; **CLI caps --wait at
100 s** (under the harness Bash 120 s default) and traps termination to print
current state. Interrupt = verified kill, graceful→hard. Progress via
`vibespace-job progress` (job env carries VIBESPACE_JOB_ID). **Completion is
learned by polling** (owner decision); §6.3b's passive injection additionally
tells the conversation at its next natural turn.

### 6.3a Cron actions (v3: two only)
- **spawn-task** — embedded task spec, full task semantics.
- **notify** — inbox item carrying the job id, one-click pause/delete; per-job
  rate cap + dedupe window (identical text collapses with a counter); agent-set
  `high` on a schedule auto-downgrades after the first unacked repeat.
Schedules jittered with floors (§3); `catchUp:"once"` make-up runs are marked
`trigger:boot`; a missed `{at}` under `catchUp:none` goes `missed` + notify —
no silent skip exists anywhere.

### 6.3b Passive context injection (replaces wake; owner decision)
Job events for jobs owned by (or visible to) a conversation — finished, failed,
parked, awaiting-user — queue per conversation and are delivered ONLY at
natural injection points, through the existing prompt-context path (the
pendingNotice / task-context channel agent-routes already budgets):
- **SessionStart / first prompt**: the jobs digest — one line per visible job,
  failed and awaiting-user first: `jb-3f9a task done 2h ago — collect-x —
  vibespace-job poll jb-3f9a`.
- **Next user turn** (UserPromptSubmit): only NEW events since last delivery,
  one line each.
- **Budget management (owner concern; PROTOTYPE-VALIDATED 2026-08-17)**: the
  jobs section is byte-capped (default 600 B) with tail-first truncation to a
  `…+N more — vibespace-job list` pointer and a degenerate one-line floor
  (`## Background jobs: N — vibespace-job list`, 44 B); name display is
  code-point-clipped at 24 chars (CJK-safe — never a split multibyte char).
  Placement: inside the existing SessionStart/prompt-context payload, after
  tools/rules and group context, BEFORE activity logs; **sacrifice order** when
  the global INLINE_CAP (9600 B, margin under the harness's exact-10240
  persisted-output wrap) is tight: activity logs shrink first, then the jobs
  digest folds to its floor line, then drops entirely — group context is never
  displaced. Measured worst cases (prototype, seeds test-job-model): 40 jobs
  with max-length CJK names → 558 B; 200 adversarial jobs → 547 B; 7-event
  update block → 569 B; merged into a 9350 B existing payload → 9396 B (floor
  applied), 9520 B → 9566 B, 9580 B → digest dropped; zero jobs/events ⇒ zero
  bytes. Markers advance at render; delivery re-checks VISIBILITY at render
  time (an access narrowed after an event queued is honored).
No mid-turn injection, no autonomous turns, no Stop-hook extension: an idle
conversation learns about job events when the user next engages it, or the
agent polls — poll is the primary interface (owner decision).

### 6.4 Interaction Panels (agent-authored UI for user-interactive tasks)
The mined cases: enter an SMS/2FA code, scan a QR then type the resulting code,
choose an option mid-task, approve a step. Design principle: **declarative
widgets, never agent HTML in our DOM** (stored-XSS law).

**Tier 1 (this design): declarative panel schema.** The agent (or the running
job itself) posts a panel:

```jsonc
// vibespace-job ask <id> --form '<json>'   (or --form @file.json)
{
  "title": "扫码登录",
  "blocks": [
    { "type": "md",     "text": "手机扫下面的二维码，然后把短信验证码填进来。" },
    { "type": "image",  "path": "/tmp/qr-login.png" },      // served via the file API; path access-checked against the job cwd/allowlist
    { "type": "input",  "id": "code", "label": "验证码", "placeholder": "6 位数字", "pattern": "\\d{6}" },
    { "type": "choice", "id": "env",  "label": "环境", "options": ["prod", "staging"], "default": "prod" },
    { "type": "buttons","options": [ { "id": "submit", "label": "提交", "style": "primary" },
                                     { "id": "cancel", "label": "取消" } ] }
  ],
  "timeoutS": 1800                    // panel expires → job sees {expired:true}
}
```

Widget set (M1): `md` (DOMPurify-sanitized markdown), `image` (file-API path,
`.src` assignment never innerHTML), `input`, `textarea`, `choice` (radio/
select), `checkbox`, `buttons`, `progress` (read-only bar the job can update).
Validation (`pattern`, `required`) runs client-side AND server-side (PURE
schema validator in job-model). Schema size cap 32 KB; one pending panel per
job (a new `ask` replaces it, versioned so a stale submit is rejected loudly).

Flow: job posts panel → job `state:"awaiting-user"` → amber badge segment +
toast + inbox item ("collect-x 需要你输入 — 打开面板") → the panel renders in a
small window (window type `job-interact`, openSpec-replayable, mobile-friendly
since blocks stack vertically) → user submits → answers append to
`interaction.answers` → the job reads them: `vibespace-job answers <id>
[--wait 100]` (same long-poll mechanics as §6.2) or, if the job was started
with `--stdin-open`, each answer is also written to the job's stdin as one JSON
line (covers curses-less simple scripts). Multi-round: post another panel.
Everything renders escaped; the user's answers are visible to owner/user only
(they may contain codes — treated like secrets in logs: literal-redacted if
they match envFrom values, and never echoed in `list`).

**Tier 2 (M3, only if tier 1 proves insufficient): sandboxed HTML app** — agent
writes an HTML file rendered in `<iframe sandbox="allow-scripts">` (no
same-origin, no cookies) with a tiny postMessage bridge (`vsui.submit(obj)`,
`vsui.progress(p)`); our DOM never touches agent markup. Deferred.

## 7. Permissions & secrets

- `view`/`control` ∈ session|group|all; agent defaults view=group (fallback
  `all` when ungrouped), control=session. Owner = conversation-lineage match,
  verified on the fast path; mismatch ⇒ surfaced for re-owning in the panel.
- **Mutation ≠ control**: editing cmd/env/envFrom/action/schedule/panel = owner
  or user only; group/all control covers start/stop/kill/ack only (no
  cross-session prompt/argv injection).
- **User locks stick**: `lockedBy:'user'` refuses agent access-edits (teaching
  error) and survives rm+recreate via a (scope,name) tombstone (30 d).
- **Secrets, honest threat model**: same-UID processes can ultimately read
  anything; `envFrom` keeps secrets out of argv//proc-cmdline, the store,
  broadcasts, and the UI — not away from a determined same-UID reader. Secrets
  file written from the user UI only (0600); server literal-redacts known
  secret values from log tails/progress/answers before returning or
  broadcasting; cmd.env values render to owner/user only. M2 remote jobs get a
  security subsection before implementation (device-side 0600 files over the
  mux never argv; no subscription-account material in remote job env; watch
  re-arm on daemon reconnect as a three-touch assert).
- **No existence oracle** (agent must never learn about jobs it cannot view):
  every agent-facing read path filters by `view` BEFORE rendering — the
  session-start digest, prompt-context updates, `list` (counts never include or
  hint at hidden jobs), and name-collision handling (names are scope-namespaced
  precisely so a collision error can only ever reference the caller's own
  jobs). `poll`/`logs`/`stop` on a non-visible id return the IDENTICAL reply as
  a nonexistent id — `no job "jb-x" visible to this session — vibespace-job
  list` — never a 403 that confirms existence. `jobs-updated` WS broadcasts
  carry full data but reach cookie-authed browser clients only (agents hold no
  WS; their surfaces are the filtered vsst_ endpoints). Filter unit-pinned in
  test-job-model (owner-lineage / groupmate / stranger fixture trio).
- User (cookie-auth) always has full view+control; every denial teaches.

## 8. CLI — full specification (`vibespace-job`, static tracked)

Conventions: `<ref>` = job id (`jb-…`) or scoped name; durations accept
`30s/10m/6h`; all verbs honor access scopes server-side; every error names the
fix; no-args prints usage + the caller's visible jobs. From inside a job
process the same CLI works (env carries VIBESPACE_API + job token +
VIBESPACE_JOB_ID, so `progress`/`ask`/`answers` need no `<ref>`).

```text
CREATE (one verb; flags pick the kind)
  vibespace-job run "CMD" --name NAME [common] [service|task|cron flags]
    common:
      --cwd DIR              default: caller session cwd
      --context "TEXT"       amnesia-proof brief, ≤8KB, echoed on poll (@file to read from file)
      --env K=V …            non-secret env (repeatable)
      --secret NAME …        envFrom reference (values managed in the panel UI, never via CLI)
      --view session|group|all     default group
      --control session|group|all  default session
      --host MACHINE         M2; default local
    service (--keep-up):
      --keep-up              makes it a service
      --restart on-failure|always|never   default on-failure
      --health port:3000 | http://127.0.0.1:3000/healthz | cmd:"CMD"   optional
      --port N …             declared listeners (annotates port sweep)
      --publish              expose via forward/frp; URL shown in panel + `poll`
      --stop-with-owner      opt-in coupling to the owning conversation
    task (default kind):
      --until "TEXT"         literal marker in output ⇒ completion (grace 30s then TERM)
      --timeout 6h           default unbounded
      --stdin-open           keep stdin pipe open (interaction answers mirror to stdin)
      --no-single-instance   allow concurrent runs of this record (default: locked)
      --notify-user          file an inbox item on completion/failure
    cron (a schedule flag makes it a cron; CMD becomes the spawned task):
      --every 30m [--jitter 20%]   floor 15min for agent-created
      --cron "41 9 * * *"
      --at "2026-09-05 06:00"      one-shot; catchUp defaults once
      --notify-on fail|done|always|never   default fail
  vibespace-job notify-cron --name NAME (--every…|--cron…|--at…) --text "…" [--urgency low|normal|high]
                                       # cron whose action is notify-only (no process)

READ
  vibespace-job list [--kind service|task|cron] [--all] [--json]
                                       # one line per job: id state name uptime/next-fire + payload first line
  vibespace-job poll <ref> [--wait 100] [--tail 40] [--json]
                                       # state, exit+cause, timestamps, FULL context payload,
                                       # log tail; --wait long-polls (CLI cap 100s, prints
                                       # state on timeout/TERM — never silent)
  vibespace-job logs <ref> [--run N] [--tail 200]

CONTROL
  vibespace-job stop <ref> [--force]   # task: TERM→(grace)→KILL; service: desiredUp=false then stop
  vibespace-job start <ref>            # service/cron (also un-parks a failed service)
  vibespace-job rm <ref> [--stop]      # refuses on any non-terminal job; --stop kills-verified
                                       # first; --orphan (logged) is the only live-abandon path
  vibespace-job access <ref> [--view X] [--control X]   # refused if user-locked
  vibespace-job progress "TEXT"        # from inside the job (or: progress <ref> "TEXT")

INTERACTION (§6.4)
  vibespace-job ask --form @panel.json [--timeout 30m]   # from inside the job (or ask <ref>)
  vibespace-job answers [--wait 100] [--all]             # poll user replies (or answers <ref>)
```

Sample outputs (teaching-shaped):

```text
$ vibespace-job run "python3 collect.py" --name collect-x --context "goal: 500 prompts; output: /data/x.jsonl; resume: rerun with --resume" --until "COLLECTED"
started jb-3f9a2c (task collect-x) — log data/job-logs/jb-3f9a2c/20260817-1102.log
this job OUTLIVES your conversation. Poll it (even from a future session):
  vibespace-job poll jb-3f9a2c
runtime note: server restarts survive; a container rebuild kills tasks (checkpoint your work).

$ vibespace-job poll jb-3f9a2c --tail 3
jb-3f9a2c collect-x [task] state=done exit=0 cause=ok(until-output) ran 2h42m (ended 13:44Z)
context: goal: 500 prompts; output: /data/x.jsonl; resume: rerun with --resume
log tail (3/48219 lines):
  [498/500] prompt saved
  [499/500] prompt saved
  COLLECTED 500 prompts → /data/x.jsonl
next: vibespace-job logs jb-3f9a2c --tail 200 · vibespace-job rm jb-3f9a2c
```

Injected teaching (ONE block, negative space included): *"turn-scoped waits →
background Bash/Monitor · session continuation → /goal · anything that must
OUTLIVE this conversation → `vibespace-job run "cmd" --name x --context "…"`
(--keep-up = service · --every/--at = schedule) · never harness cron (expires)
· machine-fireable dates → `--at`, not a dated backlog item"* — plus the
session-start jobs digest (§6.3b) so resumed sessions rediscover their work
(`backlog-add` with a leading ⏰/date pattern prints a pointer to `--at`).

## 9. UI / UX

**Entry points**: rail icon (stack/gears glyph) + ⚙ menu "Background Work" +
window type `jobs` (openSpec `openJobs`, replayable); taskbar shows a
severity-segmented badge (red failed · amber awaiting-user · green
done-unacked) reusing the 2.339.0 segmented-badge pattern; every count
clickable → panel filtered to that state.

**Jobs window** (two-line rows; live via `jobs-updated`, no polling; countdown
humanized on a 30 s unref'd tick):

```
┌ Background Work ────────────────────────────── [＋ New] [⚙] ┐
│ SERVICES · 2 up · 1 parked                                   │
│ ● dev-server      :3000 ↗ https://…frp…/        up 3h 12m    │
│   会话「重构」· 组 个人项目 · on-failure · ♥port    [Stop][Logs] │
│ ✖ mock-api        parked (6 crashes, exit 1)               │
│   backoff exhausted 11:02 · 点 Start 重试            [Start][Logs] │
│ TASKS · 1 running · 1 awaiting you · 1 done                  │
│ ◐ collect-x       2h42m · 「347/500 done」          [Stop][Logs] │
│   ctx: goal: 500 prompts; output: /data/x.jsonl…             │
│ ✋ qr-login        awaiting your input (12m)        [Open panel] │
│ ✔ export-pdf      done 08-16 · exit 0 · ok          [🗑][Logs]  │
│ CRON · 2 scheduled                                           │
│ ⏰ daily-patrol    41 9 * * * ±20% · next ~3h       [Pause][Runs]│
│ ⏰ sep5-check      at 09-05 06:00 · in 18d          [Pause][Runs]│
└──────────────────────────────────────────────────────────────┘
```

**Detail view** (row click): identity (id copy-chip, owner conversation +
group chips, host); state timeline; **run history ring** — one row per run
(start/end · duration · exit+cause · trigger · log link opening the existing
file viewer); context payload block (monospace, copy button); access row
(view/control dropdowns + 🔒 user-lock toggle; agent-attempted changes show as
refused events); health/schedule editors (owner/user only); publish URL with
copy; danger zone (rm rules from §8 surfaced as buttons with the same
refusals). All strings escHtml — plain text everywhere (XSS law; M1 gate
asserts it).

**Interaction panel window** (`job-interact`, small, centered, mobile = full
width): title bar carries the job name + remaining timeout; blocks stack
vertically; submit disabled until validation passes; after submit shows
"已提交，任务继续运行" and auto-closes unless the job posts another panel.
Arrival UX: toast + amber badge + inbox item; clicking any of them opens the
panel window. Panel state is openSpec-replayable (restart-safe).

**Toasts** (existing anchored-card system): service crash/park, task
done/failed (with job name + one-click open), panel arrival. Quiet-success
crons show nothing (their `notify-on fail` default only surfaces failures).

**Session Properties** gains "Background work": jobs owned by this
conversation; killing a session never blocks on jobs — informational dialog
with per-job stop checkboxes, default keep-running (detachment is the thesis);
`--stop-with-owner` jobs are pre-checked.

**Escape visibility (M1)**: a collapsed "Outside the registry" section lists
detected `systemd --user` units + crontab entries read-only, so hand-rolled
escapes are at least visible where the registry lives; M2 import = register +
disable source atomically.

## 10. Milestones & gates

- **M1 (local core)**: store + PURE model + engine (service/task/cron with
  spawn-task + notify) + adopt/replay + single-engine lock + full CLI (§8) +
  REST + jobs window + detail + until-output + polls + passive injection
  (§6.3b) + orphan-track + escape listing. Gates: test-job-model (schedule
  math, state machine, vendor-pattern refusal, panel-schema validation),
  test-jobs-engine (worktree: spawn → SIGKILL server → reboot → adopt-by-stamp;
  second-engine refusal; probe-env assert; until-output completion;
  GC-never-on-live), restore-smoke assertion (registered service survives
  restart), panel XSS assert, resume-owner-conversation poll test, arch-tier
  entries, kb + CHANGELOG same-commit.
- **M1.5**: Interaction Panels tier 1 (§6.4) + `--stdin-open` + answers
  long-poll + `job-interact` window.
- **M2**: remote hostId via agentd ops (capability-gated, three-touch, parity,
  remote-secrets subsection) · resource caps (prlimit; cgroup where available) ·
  `--publish` deep integration · systemd/crontab import (register + disable
  source atomically).
- **M3**: job templates (deploy monitor, health watchdog + remediation, patrol
  battery) · fleet/admin aggregate view · panel tier 2 (sandboxed iframe) if
  tier 1 proves insufficient.

## 11. Remaining open questions

1. Retention defaults: runs ring 20 / logs 50 MB per job (rotated) / done-task
   records 14 d — tune?
2. Interaction Panels in M1.5 as scoped here, or pull `input`+`buttons`-only
   minimal panels into M1 (the QR/code case is the live pain)?
3. The jobs digest budget (600 B default) — enough, or make it a setting under
   `agents.*`?

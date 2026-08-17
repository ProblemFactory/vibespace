# Design: Background Work — agent-detachable Services, Long Tasks, and Cron

Status: **DRAFT v2 for owner review** (2026-08-17). Nothing implemented.
v1 → v2: a three-lens adversarial review (lifecycle / security / ergonomics, 40
findings, 5 critical) is fully incorporated; the criticals each reshaped a core
section and are marked ⚠REDTEAM where they landed.
Origin: owner request 2026-08-17 — "本地开启一个服务给外界用…不想绑定到对话上…在
vibespace 里注册一个服务…长任务…允许 agent 在启动任务的时候注入更多 context 信息…
再次 poll 结果的时候可以看到回传的 context 信息。cron 也差不多道理。"
Evidence: full mine of this machine's agent history (2.1 GB transcripts / 32
workspaces + instance production data + live systemd/crontab escapes) → ~45
incidents → the archetypes in §2. Private verbatim evidence lives in the
personal-group shared context, not this public doc.

---

## 1. Problem statement

Agent work constantly produces processes and obligations that must **outlive the
conversation**; every VibeSpace primitive today is session-bound. Observed
workarounds (all real, recurring): `nohup`/`setsid` roulette (leaks — the 12 GB
orphan dev-server incident behind B-16d9); escapes to `systemd --user` + crontab
(a daily agent automation hand-built as timer + retry script + chat-mirror, with
secrets baked into unit files and 4 silent failures in 3 weeks); sessions parked
as pollers (CI watchers re-armed by hand a dozen times); future-dated backlog
items as poor-man's cron ("session cron 撑不到该日期"); results landing in `/tmp`
with no context after the launcher compacted; `pkill -f` matching the agent's own
cmdline (twice); and post-restart recovery by human broadcast ("check whether
your background tasks need restarting") because no inventory exists.

Three kinds of registered work over one skeleton:

| Kind | One-liner | Lifecycle |
|---|---|---|
| **Service** | "keep this process up" | boot replay, restart policy, health check, no completion |
| **Long task** | "run to completion; I may be gone by then" | one-shot, interruptible, pollable (blocking or not), carries a context payload echoed at poll time |
| **Cron** | "do X on a schedule / at a date" | fires an action: spawn a task, wake an agent, or notify the user |

## 2. Use-case archetypes (mined, deduplicated)

**Services** — (1) dev server for verification that must be findable/stoppable
after the conversation (today: port-sweep discovery after the fact; leaks on
deleted cwd); (2) serve-to-the-outside (listening-test HTTP server, webhook/OAuth
targets — external systems call in whether or not a conversation is alive; wants
stable published URL + liveness); (3) shared auxiliary infra (headless-Chrome CDP
rig, mock backends pgrep-checked before every test, VNC observation stack —
"start if absent, reuse otherwise"); (4) always-on watchers with remediation (a
tunnel was silently dead 9 days because nothing owned a health check); (5)
interactive background process holding stdin across turns (device-auth code
entry via mkfifo plumbing today).

**Long tasks** — (6) multi-hour convergence watches (rebuilt as chopped 30-min
shell loops today); (7) batch/collection jobs where overlapping restarts have
corrupted output (needs single-instance locking); (8) await-external-event
(human QR scan, hardware power-cycle, endpoint healthy — unbounded, must never
silently expire); (9) **poll-later with amnesia**: the launcher has compacted or
died before completion; the poller needs the original intent — the context
payload — echoed with the result.

**Cron** — (10) recurring patrols (quiet-success, escalate-only); (11)
future-dated one-shots weeks out ("verify the contract auto-terminated on Sep
5"); (12) scheduled agent runs (retry/backoff, run history, failure surfacing —
today a hand-built systemd timer with forensics-by-mtime); (13) periodic
maintenance (cleanup, compaction).

**Cross-cutting demands** — registration-first (discovery stays as the stray
fallback); kill by handle only with kill-time re-verification; per-run history
with retained logs and exit causes; boot = adopt-first, never respawn over a
living process; first-class visualization (invisible wakeups have already
confused the user once).

## 3. Hard fences (honest version) ⚠REDTEAM

- **§ban-safety is enforced by policy + guardrails, not magically by structure.**
  A job is arbitrary user-UID code: it *could* read credential files and curl a
  vendor endpoint on a schedule — exactly the ban-postmortem pattern — and no
  source-level whitelist can see inside stored argv. Therefore:
  - **Create/edit-time refusal**: job argv/env/health-cmd and cron prompts are
    scanned for vendor hosts and credential-material paths (`api.anthropic.com`,
    `.credentials.json`, `data/subs`, `CLAUDE_CODE_OAUTH*`, …); matches are
    refused with a teaching error citing §ban-safety. (Friction, not proof — but
    it converts "easy accident" into "deliberate circumvention".)
  - **Schedule floors + mandatory jitter**: agent-created recurring schedules
    have a floor (default 15 min) and always jitter; fixed metronomes are not
    expressible. Health probes get the same jitter and run through the same
    sanitized async spawn path as jobs (probe env = agentEnv-stripped; hard
    timeout; process-group kill) — a probe is never a side door.
  - **Negative-control tests**: test-job-model refuses a vendor-credential job
    spec; test-jobs-engine asserts probe env is stripped; test-vendor-whitelist
    remains the source-level law for OUR code.
  - The injected teaching block explicitly marks "cron + usage/quota polling" as
    a ban-risk pattern to never build.
- **No `-p` inference from jobs** (program-use billing): scheduled agent runs
  happen only by waking/spawning **interactive** sessions (§6.3).
- **Agent-created `wake-new-session` crons require explicit user approval before
  first fire** (§6.3) — unattended recurring billed sessions are a user decision,
  never an agent default. ⚠REDTEAM
- **Not a plugin replacement** (plugins = installable host capabilities; the
  Plugin 2.0 effort may later consume jobs as a runtime primitive). **Not a
  distributed scheduler in v1** (`hostId` is a parameter from day one, local-only
  M1; remote = agentd ops in M2 with its own security subsection). **Does not
  replace** the goal loop or harness background Bash; §8 teaches the negative
  space explicitly.

## 4. Data model

Store `data/jobs.json` (writeJsonAtomic, SIGINT/SIGTERM flush, every mutation
broadcasts `jobs-updated`), per-run logs `data/job-logs/<jobId>/<runTs>.log`.

```jsonc
{
  "id": "jb-3f9a2c",
  "kind": "service|task|cron",
  "name": "collect-x",              // unique per OWNER SCOPE (not global) ⚠REDTEAM:
                                     // scope-namespaced; collision auto-suffixes with a
                                     // warning; ids are the only global handle (no
                                     // existence oracle / name squatting across groups)
  "note": "…", "hostId": null,       // null = this instance; machine id in M2

  "cmd": { "argv": [...], "cwd": "/abs", "env": { /* NON-secret; values never rendered to non-owner viewers nor in jobs-updated payloads */ } },
  "envFrom": ["MY_TOKEN"],           // resolved at spawn from the secrets store (§7)

  // service
  "restart": "on-failure|always|never",
  "health": { "type": "port|http|cmd", "value": "8088", "intervalS": 60 },  // jittered; sanitized async spawn; harmless-probe law
  "ports": [8088],

  // task
  "singleInstance": true,            // per-RECORD concurrent-run lock; enforcement
                                     // re-verifies liveness of the last run's process
                                     // (pid+stamp), NEVER record state alone ⚠REDTEAM
  "timeoutMs": null,
  "untilOutput": "COLLECTED|DONE",   // literal substring in M1; regex only if it passes a
                                     // linear-time vet; matched against bounded appended
                                     // tail chunks only (§5) ⚠REDTEAM

  // cron
  "schedule": { "cron": "41 9 * * *" } | { "everyMs": 1800000, "jitterPct": 20 } | { "at": "…" },
  "catchUp": "once",                 // DEFAULT once for {at} one-shots ⚠REDTEAM; a passed
                                     // {at} under catchUp:none goes terminal `missed` and
                                     // FIRES THE NOTIFY PATH (no silent expiry)
  "expiry": null,
  "action": { "type": "spawn-task"|"wake"|"notify", ... },
  "approval": "none|pending|approved", // agent-created wake-new-session ⇒ pending (§6.3)

  "context": { "payload": "…" },     // cap 8 KB (fits the real 9600 B inline injection cap
                                     // after wrapping; CJK-safe truncation) ⚠REDTEAM; full
                                     // payload echoed on single-job poll; `list` shows
                                     // first line + byte count (context-burn guard)

  // ownership ⚠REDTEAM (the flagship resume-later case): keyed to CONVERSATION LINEAGE,
  // not the webui session id — resume mints a new webui session.
  "owner": {
    "conversation": { "backend": "claude", "id": "<backendSessionId>" },  // + fork chain matching (forkedFrom)
    "sessionId": "…", "sessionCreatedAt": 0,   // secondary; collision-proof tuple
    "createdBy": "agent|user",
    "groupsSnapshot": ["T-…"]        // refreshed EAGERLY on every job mutation + periodic
                                     // sweep while owner lives (session deaths rarely
                                     // emit a delete event) ⚠REDTEAM
  },
  "access": { "view": "group", "control": "session", "lockedBy": null },
                                     // agent-created defaults: view=group (fallback all
                                     // when ungrouped), control=session ⚠REDTEAM
  "stopWithOwner": false,            // detachment is the default everywhere (§9)

  "desiredUp": true,
  "state": "up|down|starting|failed|done|interrupted|unverified|scheduled|missed",
  "proc": { "pid": 0, "starttime": 0, "bootId": "…", "argvHash": "…" },
                                     // identity = pid+starttime+bootId (argv-hash is
                                     // secondary confirmation only) — pid reuse by an
                                     // IDENTICAL-argv respawn is the COMMON case ⚠REDTEAM
  "supervise": { "consecutiveFails": 0, "parkedAt": null },  // persisted: parked-failed
                                     // services are NOT resurrected by boot replay
  "runs": [ { "startedAt":0,"endedAt":0,"exit":143,"cause":"ok|ok(until-output)|error|interrupted|oom|timeout|env-restart|owner-dead|missed","log":"…","trigger":"manual|boot|cron|restart-policy" } ]
}
```

## 5. Engine

Tier routing: PURE `src/job-model.js` (schedule math, jitter, state machine,
permission predicates, vendor-pattern vet) · ORCH `src/jobs.js` + server.js
wiring stanza · agent endpoints in `src/agent-routes.js` · REST `/api/jobs*` ·
CLI `data/bin/vibespace-job` (static tracked, AGENT_TOOLS) · CLIENT
`src/lib/jobs-panel.js` (window type `jobs`) · M2 DEVICE `job-*` agentd ops.

**Single-engine lock** ⚠REDTEAM: before adopt/replay the engine takes
`data/jobs.lock` (pid+starttime, stale-safe re-verification). A second server
process against the same data/ (the #127 class) gets a read-only registry view +
a loud notice — it never adopts, replays, or fires crons (no double-spawned
services, no double-billed cron sessions).

**Failure isolation.** Engine initializes after listen, in try/catch; endpoints
return 503-retry-after until engine-ready; **any** init failure (not just store
corruption) files a persistent user notice + telemetry and renders an
"engine down" banner in the panel — services-not-replayed must be loud. Per-job
try/catch; crash-looping services: success = uptime ≥ 60 s (else "consecutive"
never trips — the RestartSec pitfall), exponential backoff 5 s→10 m, cap 6 →
park `failed` + notify; `consecutiveFails/parkedAt` persist and **boot replay
skips parked services** (they need an explicit poke). Store corruption: rename
`.corrupt-<ts>`, then **reconcile before accepting registrations** — rebuild a
skeleton from surviving pidfiles + `data/job-logs/<id>/` names, mark entries
`unverified` for adoption, block same-name re-registration until resolved,
best-effort salvage-parse of the corrupt file (never convert one bad parse into
orphans + double-spawns). ⚠REDTEAM

**Process identity & spawn.** Spawn protocol closes the crash window: write
intent first (`starting` + pidfile path, flushed), spawn setsid-detached through
a tiny wrapper whose first act atomically writes its own pidfile with
{pid, starttime, bootId, argvHash}; boot reconciles pidfiles + declared-port
liveness BEFORE deciding to replay. Adopt and every kill re-verify the full
stamp at act time; argv-hash alone never authorizes a kill. Tasks are
adopt-first too; a non-adoptable-but-possibly-alive process parks its record
`unverified` with a loud notice — never terminal-while-running. ⚠REDTEAM

**Runtime-survival matrix** ⚠REDTEAM (detected at boot, surfaced in CLI success
output + panel):

| Runtime | Detach survives server restart? | Promise shown |
|---|---|---|
| systemd user unit (KillMode=process) | yes | full |
| bare `node server.js` / run.sh | yes until the terminal/box dies | full (weaker host) |
| container/pod (fleet) | **no** — pod rebuild kills the PID namespace | "replay-only: services restart, tasks die — checkpoint your work" |

Container-mode task deaths record `cause:"env-restart"` (distinct from
`interrupted`); catchUp storms after long downtime are budgeted (§6.3).

**untilOutput mechanics** ⚠REDTEAM: per-job byte-offset cursor, incremental
appended-tail reads only (per-tick byte budget), hard per-line length cap before
matching; M1 = literal substrings (regex later only through a linear-time vet at
create time, rejected with a teaching error). Match → grace 30 s → SIGTERM to
the group → `ok(until-output)` (never leave the process running under a `done`
record; never hard-kill at the marker — flush/checkpoint corruption lesson).

**GC.** Age-based only; a record whose stamp still verifies alive is never GC'd
regardless of state; a non-terminal run's log is never unlinked — size caps
enforce by rotation (wrapper reopen), not unlink (deleted-but-open fd = the
12 GB class self-inflicted). ⚠REDTEAM

**Ports integration.** Registered `ports` annotate the sweep (service row
instead of "new port" toast — annotation waits on engine-ready); orphan detector
consults the registry; the orphan toast gains **"Track this"** — adoption
creates a `restart:never`, health-check-only record marked "adopted — restart
command unknown" (a /proc cmdline can't reconstruct env/venv; restart policies
unlock only after cmd/cwd is supplied). ⚠REDTEAM `--publish` composes with the
existing forward/frp path for the serve-to-the-outside case.

## 6. Semantics

### 6.1 Service
Register → `desiredUp:true` → supervised start. Stop **always** sets
`desiredUp:false` (no systemctl stop-vs-disable footgun; resurrection requires
explicit start). Health probes: sanitized env, async, hard timeout, jittered
interval, harmless-probe law (the VNC blacklist incident).

### 6.2 Long task
`vibespace-job run "cmd" --name X --context "…"` → id immediately.
- **Poll (non-blocking)**: state + exit cause + context payload + bounded log
  tail. **Poll --wait**: server long-poll, **server-side clamp 600 s**, waiter
  caps per job and per token, resolve-with-state on server shutdown (never
  dangle into SIGTERM); the **CLI caps --wait at 100 s** — under the harness
  Bash 120 s default timeout — and traps termination to print current state, so
  a harness kill still returns useful output; usage text teaches non-blocking +
  completion wakeup as primary, `--wait` labeled "short tails only". ⚠REDTEAM
- **Interrupt**: verified-kill (stamp re-check), graceful then hard.
- **Progress**: `vibespace-job progress <id> "text"` (job env carries
  VIBESPACE_JOB_ID); rendered escaped (§9).
- **Completion**: owner conversation live → wakeup (§6.3 primitive); always →
  `jobs-updated` + panel badge; `--notify-user` files an inbox item. Nothing is
  lost if the owner is gone: any authorized session polls later.

### 6.3 Cron
Schedules in the PURE model; jittered; floors per §3.
- **spawn-task**: embedded task spec, full task semantics.
- **wake (owner conversation)** — this is a **new primitive** and is specified,
  not assumed ⚠REDTEAM: the server injects an autonomous user-turn into the
  owner's chat session over the wrapper stdin, **queue-until-idle** (never while
  the session is streaming, never while a synced draft exists in
  data/drafts.json; delivered when idle), carrying `origin:{kind:'cron-wake',
  jobId}` so the normalizer/renderer path shows the existing wakeup CARD (the
  2.229.2 invisibility fix), not a fake "You" bubble. Terminal-mode or read-only
  owners degrade to `notify`. Active native goal → defer until the goal loop is
  idle. Payload rides inside the turn under the injection budget (head +
  `vibespace-job poll <id>` pointer when over).
- **wake (new-session)** (M2): spawns a fresh INTERACTIVE chat session (normal
  spawn path: agentEnv, billing identity via the account system, transcript,
  board integration), ordering pinned bind-group → ctx-sync → spawn so the
  scheduled run has its 岗位 context. **Agent-created instances land
  `approval:"pending"` — an inbox card (billing identity, schedule, est.
  runs/day) the user confirms before the first fire**; user-created fire
  immediately. maxConcurrent:1 + per-cron daily cap; boot catch-up spawns are
  serialized with a global budget (default 2; the rest become notify items).
  ⚠REDTEAM
- **notify**: inbox item carrying the job id with one-click pause/delete;
  per-job rate cap + dedupe window (identical text collapses with a counter);
  agent-set `high` urgency on a schedule auto-downgrades after the first
  unacked repeat. ⚠REDTEAM
- **deadOwner default = `notify`** (inbox item with the full payload + one-click
  "open a session with this brief"); `new-session` and `skip` are explicit
  opt-ins, and a skipped fire still writes a run entry `cause:owner-dead` —
  there is no silent skip anywhere in the subsystem. ⚠REDTEAM

## 7. Permissions & secrets

- `view` and `control` ∈ session|group|all; agent-created defaults **view=group**
  (fallback `all` for ungrouped sessions — the resume-later case must work),
  control=session. Owner = conversation-lineage match (§4) — verified on the
  fast path and on wake delivery; mismatch ⇒ treated as dead-owner + surfaced
  for re-owning in the panel.
- **Mutation is NOT control** ⚠REDTEAM: editing cmd/env/envFrom/action/schedule
  = owner or user only (group/all control covers start/stop/kill/ack). A
  non-owner can never rewrite a wake prompt (cross-session prompt injection) or
  repoint argv at the secrets store.
- **User locks stick**: `lockedBy:'user'` refuses agent access-edits with a
  teaching error, and survives rm+recreate via a (scope,name) tombstone for 30
  days. Access widening by non-owner control holders requires owner or user.
- **Secrets, honest threat model** ⚠REDTEAM: same-UID processes can ultimately
  read anything; `envFrom`'s value is keeping secrets out of argv (/proc
  cmdline), out of the store/broadcasts/UI, and out of casual log exposure — not
  out of a determined same-UID reader. Concretely: the secrets file is written
  from the user UI only (0600, values never in agent responses); the server
  literal-redacts known secret values from log tails/progress before returning
  or broadcasting; cmd.env values render only to owner/user. M2 remote jobs get
  their own subsection before implementation: device-side secret files 0600
  delivered over the mux never argv, wiped on rm, and an explicit refusal to
  ship subscription-account material into remote job env (ban-postmortem rule),
  plus job-state watch re-arm on daemon reconnect as a three-touch assert.
- User (cookie-auth) always has full view+control. Every denial is a teaching
  error naming the fix.

## 8. Agent surface

**One creation verb** ⚠REDTEAM: `vibespace-job run "cmd" [--keep-up] [--at T |
--every 30m | --cron "expr"] --name X --context "…"` — `--keep-up` makes it a
service, a schedule flag makes it a cron; `service`/`cron` subcommands remain as
human aliases. One injected example demonstrates all three kinds. Other verbs:
`list`, `poll [--wait]`, `logs`, `progress`, `stop` (kind-appropriate; service ⇒
desiredUp=false), `start`, `access`, `rm` — where **rm refuses on any
non-terminal job** (`rm --stop` kills-verified then removes; `rm --orphan` is
the only way to abandon a live process, logged and sweep-annotated). ⚠REDTEAM

**Teaching the negative space** ⚠REDTEAM (one clause each in the injection
line): turn-scoped → harness background Bash/Monitor; session-scoped
continuation → goal loop; must outlive the conversation → `vibespace-job`;
harness cron → don't (expires); machine-fireable dates → cron job, not a dated
backlog item (`backlog-add` with a leading ⏰/date pattern prints a pointer to
`cron add`; backlog remains for human-actioned items).

**Session-start jobs digest** ⚠REDTEAM: SessionStart/first-prompt injection
includes a byte-budgeted one-line-per-job digest of jobs visible to the session
(failed first, budgeted last per the injection law): `jb-3f9a running 3h —
collect-x — vibespace-job poll jb-3f9a`. `run`/`--keep-up` warn on near-name or
same-cwd+argv matches before creating (anti-double-register).

## 9. Visualization

- Jobs window (`jobs`, openSpec `openJobs`): three sections, **two-line rows**
  (identity / status), coarse humanized next-fire on a 30 s unref'd tick, exact
  times in detail. Detail: run ring (cause + log link), payload, access
  controls (with lock), health config. Live via `jobs-updated`.
- **XSS invariant** ⚠REDTEAM: every job-record string (name, note, progress,
  payload, cron prompt, log tails) renders via escHtml/textContent — plain text
  only, never innerHTML/markdown; the wake card reuses the existing escaped
  renderer. An M1 gate asserts this.
- Attention: failed service / completed-unacked task → severity-segmented
  taskbar badge + toast; cron fires render as wakeup cards.
- Session Properties "Background work" row; **kill paths never block**: default
  everywhere (UI kill, agent kill, sweeps, resume-guard) is **keep running** —
  the dialog is informational with stop checkboxes; `stopWithOwner:true` is the
  opt-in coupling. ⚠REDTEAM
- M1 also **lists detected systemd-user/crontab escapes read-only** in the
  panel (visibility before migratability); M2 import = register + disable the
  source unit in one atomic operation with a dry-run diff. ⚠REDTEAM

## 10. Milestones & gates

- **M1 (local core)**: store + PURE model + engine (service/task/cron with
  spawn-task, wake-owner, notify) + adopt/replay + single-engine lock + CLI +
  REST + panel + until-output + polls + orphan-track affordance + escape
  listing. Gates: `test-job-model` (incl. vendor-pattern refusal negative
  control), `test-jobs-engine` (worktree: spawn → SIGKILL server → reboot →
  adopt-by-stamp; second-engine refusal; probe-env assert; until-output
  completion; GC-never-on-live), restore-smoke assertion (registered service
  survives restart), panel XSS assert, resume-owner-conversation poll test (the
  flagship promise), arch-tier entries, kb + CHANGELOG same-commit.
- **M2**: wake-new-session (+ approval flow) · remote hostId via agentd ops
  (capability-gated, three-touch, parity test, remote-secrets subsection) ·
  resource caps (prlimit; cgroup where available) · `--publish` deep
  integration · systemd/crontab import.
- **M3**: job templates (deploy monitor, health watchdog + remediation, patrol
  battery) · fleet/admin aggregate view · group dashboards.

## 11. Open questions for the owner

1. **wake-new-session approval** — v2 bakes in "explicit user approval before
   first fire" for agent-created scheduled sessions (red-team: unattended
   recurring billed sessions must be a user decision). Confirm, or prefer a
   softer default (auto-approve under N runs/day)?
2. **Container fleet promise** — pods can't detach across rebuilds. Is
   "replay-only + loud labeling" acceptable for fleet users in M1, or should M2
   prioritize a device-daemon-hosted runner (jobs live under the machine's
   agentd, not the pod) to give real survival there?
3. **Retention defaults** — runs ring 20 / logs 50 MB/job (rotated) /
   done-tasks 14 d?
4. **Interactive stdin handle** (archetype 5) — M2 `vibespace-job send <id>`,
   or park until a second real need?
5. **Scope of M1 review** — proceed to implementation after this doc's review,
   or want a thinner walking skeleton first (service + task only, cron in a
   fast-follow)?

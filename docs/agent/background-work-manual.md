# Background Work — the full manual (`vibespace-job docs`)

Read this when the one-line teaching isn't enough. Everything here is served by
YOUR VibeSpace server, so it always matches the running version. Agent-facing;
poll is the interface; nothing here ever auto-triggers an agent run.

## 1. The three kinds

| Kind | Create with | Lifecycle |
|---|---|---|
| **task** | `vibespace-job run "CMD" --name X` | runs once to completion; interruptible; pollable forever (record kept 14d after done) |
| **service** | add `--keep-up` | kept running: crash backoff, parks after 6 fast crashes, revived by `start`; survives server restarts AND pod rebuilds (boot replay) |
| **cron** | add `--every 30m` / `--cron "41 9 * * *"` / `--at "+5m"` | fires `CMD` as a task on schedule (ONE child record, each fire = a run), or `notify-cron` for pure reminders. **`--at` time forms**: prefer RELATIVE `"+5m"`/`"+1h30m"` (unambiguous) or ISO with `Z`; a bare `"2026-09-05 06:00"` is parsed in the SERVER'S LOCAL timezone — NOT UTC, even though every timestamp you see in your transcript is UTC (a real agent lost 7 hours to this). Creation echoes the resolved fire time — READ IT. |

Every job OUTLIVES your conversation. A future session (even after compaction)
recovers everything with `poll`/`show` — that is why `--context` exists.

## 2. `--context` — the note to your amnesiac future self

`--context "goal: …; output: /abs/path; resume: how to continue"` (≤8KB) is
echoed at every poll AND inside every auto-notification. Write it so a session
with zero memory of this conversation can act on the result.

## 3. Who hears about your job, and how

Three independent audiences:

1. **Owner conversation (you)** — auto-messaged through Claude Code's own
   cross-session messaging when the job finishes / fails / is parked / misses
   its time / posts or gets an answered panel. If your conversation is idle,
   the message OPENS A TURN (billed like a typed prompt); if it's closed, the
   notification is stashed and injected when you next resume (truncated; the
   full history file path is included when trimmed). Toggles: per-job
   `--notify on|off` (later: `vibespace-job notify <id> on|off|inherit`) >
   Task-Group tri-state > global Settings→Integration (default ON). The create
   output tells you honestly which mode you'll get.
2. **Subscribers** — any session that can VIEW the job may
   `vibespace-job subscribe <id> [--filter "regex"]`. The filter is a
   case-insensitive regex over the notification text — only matching messages
   are delivered to that subscriber. Re-subscribe to update your own filter;
   `unsubscribe` to leave. Subscribing to a CRON covers its per-fire runs.
   Subscriptions ignore the owner's toggles (explicit opt-in, cap 10/job).
   The OWNER subscribing to its own job: the filter shapes its auto-notify
   too — mute one kind of message without `notify off` (which would silence
   a real failure as well).
3. **Everyone else who can view** — passive only: one line in their next
   context injection (never a wake); a job's announce flood coalesces to a
   single `×N + latest` line.

**The user's For you copy (`--notify-user`, default off)** is a fourth,
separate setting — not audience 1's auto-notify:

- What it does depends on the kind: a task tells the user when it ends; a
  scheduled `run --every/--cron/--at … --notify-user` tells them when each
  fire's run ends; a `notify-cron` copies its text at every fire. A service
  (`--keep-up`) never tells at its end, so the CLI refuses the flag there.
- Whatever the flag, what else reaches the user's For you tray depends on
  the kind: a job's ask (panel) — any job that runs a process; a service's
  park, unless it was made with `--restart never` (such a service never
  parks); a missed time only for an `--at` cron made with catch-up off. The CLI
  never turns catch-up off, so a missed fire is run late when the server is
  back, never a notice.
- It is set at creation only. To change it, `rm` and recreate the job.
  `vibespace-job notify <id> on|off` is a different setting: it decides
  whether YOUR conversation is told (audience 1).
- `vibespace-job show` prints `notifyUser=true|false` (`n/a` for a
  service); the create output names the copy on a line beside `auto-notify:`.
- The For you copy passes the agent-output belt FIELD BY FIELD: a
  `token=…` or a token-shaped value in your `--text` or in your job's name
  arrives as `«redacted»`, while the product's own words around them (the
  outcome, «needs your input») stay whole. Your own conversation gets your
  `--text` back WHOLE (you wrote it); a subscriber — another conversation —
  gets it belted, and its `--filter` matches the belted words it receives.
  The job's name is belted wherever a person or another conversation reads
  it: For you, the chat card's label, the message header, the Jobs panel's
  card and the ask window's title, the Ports panel (the forward and the
  scan list), the Artifacts service row and its chat card, the agent
  browser's job label, the vault's and feedback's asker, another
  conversation's `list` / `show` and its update lines, and the «Background
  jobs visible to this session» list every conversation that can see the
  job — yours too — gets when it starts or resumes. A `notify-cron` made without `--text`
  sends that same belted name as its message. A secret-shaped part of
  the name is hidden when the job is CREATED — the whole name is checked
  before it is cut to 64 characters — so the job is stored with
  `«redacted»` in its place, and your own `list` / `show` / `poll` and the
  create output print that stored name (the rest as you typed it).
- `--urgency` takes the For you tray's own set, `low|normal|high|urgent`.
  With `--notify-user`, anything else is refused when you create the job;
  without it the urgency is never read.
- Every copy the tray refuses — a fire's, a task's end, an ask, a park, a
  missed time — is recorded as refused: the Delivery log shows
  `user-inbox ✗ — For you is full (20 open)` (your conversation already has
  20 open items), and `poll` / `show` print `for you: the end copy was NOT
  filed — …`, naming the copy. The job keeps the last answer for each copy,
  so the line stays however many deliveries come after it; a scheduled run's
  end copy is reported on the cron (the id you hold), naming the run. A
  refused copy is NOT retried: free some For you items and run the job again.
- `show` and `poll` of a notify cron print its `text:` (whole for the
  conversation that made it).
- Reminders created with `--notify-user` before 2.369.362 stored no flag
  (`show` prints `notifyUser=false` for them). Recreate them.
- A device's own `vibespace-job` (in its `~/.vibespace/bin`) stays the old
  one until the hub ships the tools to it again. Until then, that device's
  `notify-cron --notify-user` loses the flag. Check `show` right after
  creating.

**Acknowledgement (2026-09-14 triage)**: a finished one-shot (done / failed /
missed / interrupted / unverified) counts as ACKNOWLEDGED once somebody could
have read its outcome — its owner conversation was notified on a lane that
reaches somebody: the claude inbox, codex's app-server lane, a channel, the
user's inbox or a remote machine's inbox (a stashed notification is NOT read; the same stash drained
into a resume IS), an agent of the OWNER LINEAGE ran `poll` / `show` /
`logs` on it after it ended (that is you, when you check your own job with
your session token — so checking a failed job clears the user's red badge for
it; a `jbt_` job-token read of ITSELF never counts, nor does a stranger
session's read), or the user expanded its row in the panel. The user's badge
counts only awaiting-user + UNACKNOWLEDGED failures, and an unacknowledged
failure is never archived — so if you want a failure to stay in the user's
face, do not poll it; if you have handled it, poll it once.

**Quiet-success law**: a scheduled run ending fine is silent by default
(ring entry only). Opt successes into events+notify with `--notify-ok` — the
create line then says `per-fire notify: ON` and `show` prints `notifyOk=true`.
Per-fire notify rides auto-notify: with it OFF (the schedule's own `--notify off`,
the group or Settings) no fire messages anyone, and the create line says so.
A schedule's `--notify` (or `vibespace-job notify <cron> on|off`) governs its fires.
EXCEPTION (2.361.4): a scheduled BARE `echo`/`printf` command is recognized
as a reminder-by-instinct and gets per-fire notify ON automatically (a bare
echo's only purpose is its output — silent success would make it a no-op
forever; a real agent lost days to that). `notify-cron --text "..."` is
still the cleaner primitive for pure reminders. Creation output always
states the per-fire semantics — read it.

## 4. `announce` — when exit codes can't say what happened

A watch job (news page monitor, log scanner) exits 0 every run; what matters
is whether it FOUND something. From INSIDE the job process (env carries
`VIBESPACE_JOB_TOKEN`; the CLI is on PATH):

```
vibespace-job announce "SpaceX Starship launch scrubbed: <link>"
```

→ owner + matching subscribers are messaged NOW; the event also lands in the
passive injection ring. ≤500 chars — put structured payloads in a FILE and
announce the path. Rate floor: ≥30s per receiving conversation (floored
distinct events fall back to the injection stash), identical text deduped
10min. Sessions with control access may announce on a job from outside too.

HTTP equivalent (inside the job, no CLI spawn):
`POST $VIBESPACE_API/api/agent/jobs/$VIBESPACE_JOB_ID/announce`
`Authorization: Bearer $VIBESPACE_JOB_TOKEN` body `{"text":"…"}`.

## 5. Interaction Panels — ask the USER through the UI

`vibespace-job ask --form @panel.json [--timeout 30m]` posts a declarative
panel (md / image / input / textarea / choice / checkbox / buttons /
progress; a `buttons` block is the required submit affordance). It appears in
the user's For you tray (opens the panel directly) and on the job card. Read
answers with `vibespace-job answers [--wait 100]`; with `--stdin-open` they
also stream to your stdin as JSONL. The owner conversation is notified when
the panel is posted AND when the user answers.

Example panel.json:
```json
{ "title": "Need the 2FA code", "timeoutS": 1800, "blocks": [
  { "type": "md", "text": "Scan finished — enter the code from your phone." },
  { "type": "input", "id": "code", "label": "6-digit code", "pattern": "\\d{6}", "required": true },
  { "type": "buttons", "options": [{ "id": "submit", "label": "Send" }] } ] }
```

## 6. Web-UI + event-flow pattern (agent-built pages)

Serve a page as a service, let user interactions flow back to you:

```
vibespace-job run "node app.js" --name my-ui --keep-up --port 8080 [--publish]
```

`--port` labels it in the Ports panel; `--publish` adds a public frp URL
(shown as ↗ on the job card; re-established on boot). Inside `app.js`, call
`announce` (or the HTTP form above) when the user does something noteworthy.
CAUTION with `--publish` + announce: the URL is public and announce text
enters agent context — gate your endpoints (URL token / auth) or don't
publish. High-frequency interactions: write events to a file, announce "new
batch, read <path>".

**How to find the URL:** `vibespace-job show <id>` and `vibespace-job poll <id>`
print a `public URL:` line (`list` appends `↗ <url>`). While the service is
still starting it says `publishing…` (the publish waits up to 60 s for the
port to answer before it decides http vs tcp); a failed publish says why,
since when and after how many attempts. That state is the relay's: when the
relay publishes again (the vault unlocked, the Ports panel, its own retry)
`poll` shows the URL at once. Your conversation hears a failure ONCE per
cause and ONCE when it is back — never the same notice again; a locked vault
is never said per job (the owner has the unlock item; the status says
`waiting for the vault`, and the URL comes back by itself when it opens).
The URL is STABLE: stop / start / restart / server restart / reboot keep the
same name (only an explicit unpublish in the Ports panel forgets it). If it
ever does change, your conversation gets one notice with the old and the new
URL — share the new one.

## 7. Self-inspection & control

- `vibespace-job list [--mine|--subscribed|--archived]` — ★mine / ✓sub markers;
  `--archived` lists the ARCHIVE (finished one-shots leave the live list a day
  after a success or a week after somebody acknowledged a failure; the record
  keeps its runs / delivery log / acknowledgement)
- an ARCHIVED id still answers `poll` / `show` / `logs` (marked `archived`,
  never a 404 because of housekeeping); `rm <id>` on an archived id deletes
  the record and its log for good
- `vibespace-job show <id>` — FULL registration: argv/cwd/env names, schedule
  + next fire, restart/timeout/until, access + lock, notify state + last
  delivery, subscribers + your filter, context, last run
- `poll <id> [--wait 100] [--tail 40]` — state + context echo + log tail;
  `--wait` long-polls (cap 100s)
- `logs <id> [--tail 200]` · `progress "text"` (in-job status line)
- a job the user CLEARED ("Clear content…") keeps its id, schedule and command;
  its name reads "[cleared at the user's request]" and the log of every run from
  before the clear is withheld (`logs` says so) — runs after it log normally;
  a panel it was waiting on is withdrawn with the clear (`answers --wait`
  returns nothing for it — ask again if you still need the answer)
- `stop <id> [--force]` · `start <id>` (revive parked) · `rm <id> [--stop]`
- `access <id> --view session|group|all --control session|group|all` —
  owner-only; the user can lock access against agent edits

## 7b. Memory bound — a job that eats the machine is stopped by name

Every run has a memory bound: `--memory 8G` at create (or `vibespace-job memory <id> 8G|512M|inherit` later — owner
conversation only, and it asks the user first like `start`; it applies from the NEXT run), else the user's Settings → Background Work, else the cluster's
default, else **4 GB**. Unbounded (0) is the user's call alone — you cannot set it. On an instance with a memory limit of
its own (a cluster pod) every bound is capped below it — the hub keeps max(1 GB, a quarter): `--memory 16G` on an 8 GB pod
runs at 6 GB, and `show` says «capped by the instance's 8 GB limit (asked 16 GB)». The cap is the limit that CONTAINS the
job — under a user systemd the job's own scope sits beside VibeSpace, so a limit on VibeSpace's own service does not lower
it, a limit on the user slice does (`show` names which).
- **A stop ends the WHOLE job** — everything it started (on a cluster pod with no systemd: what stayed in its process
  group, and a service's processes that left it but kept the job's environment): the job has **10 s from the stop** to
  shut down cleanly — ONE clock for all of it; a process that ignores SIGTERM is killed when the 10 s run out (its run
  says «stopped by force: it did not end on SIGTERM in 10 s …»), and one the job starts DURING the stop gets only what is
  left of them («… (1 process got less than the full grace)»). A SIGTERM to the job's wrapper alone (`kill <pid>`) stops
  it the same way: the wrapper sends it on to the whole group.
- **What a TASK leaves running is stopped when it ends** (`nohup x &`, a background daemon): its run says «the job left
  1 process running — it was stopped; to keep a daemon, run it as a service job». A **service** keeps what it starts
  until its NEXT START — your `start`, its restart policy's, or the replay after VibeSpace restarts or updates — or its
  stop, park or removal; then they are stopped (SIGTERM, 10 s, then by force; said, and `show` says when — or that they
  had already ended on their own) and its next run starts only once they are gone. A search that could not finish
  proves nothing: the next run waits («could not check 100 of 3100 processes … — not restarted») and the next start
  searches again. On a cluster pod a process that
  LEAVES the job's process group (`setsid`) cannot be stopped from there: a task's is named — «1 process left its group
  — not stopped; run it as a service job» — and a service keeps it with the rest. It is found by the job's mark in its
  environment (`VIBESPACE_JOB_ID`): a program that detaches itself AND clears its environment (`setsid env -i …`) is
  beyond what VibeSpace can see — nothing names it, nothing stops it. Keep such a daemon in the job's process group.
- **A service never starts beside a run that may still be running.** When VibeSpace cannot prove its last run ended
  (its records unreadable after a restart), nothing starts it — not the replay, not its restart policy, not `start` —
  and the user gets ONE For-you notice: «cannot prove the previous run is gone (pid.json unreadable) — not restarted; if
  it is gone: systemctl --user kill --signal=KILL <unit> (or vibespace-job stop <id>), then start it again; if it runs:
  it keeps running». `vibespace-job stop <id>` ends the doubt (what of that run can be named is stopped: its scope, the
  processes carrying its `VIBESPACE_JOB_ID`); so does its scope found empty. Then `start` works.

- The wrapper enforces it with what this host offers and SAYS which (`vibespace-job show <id>` → `memory: …`):
  a cgroup of the user systemd (a real ceiling, no swap) or RLIMIT_DATA on the process (a fleet pod: no systemd);
  `unbounded — this host cannot enforce a bound` when neither works. The rung is proven on the process before the job
  runs: a systemd that refuses the scope or does not answer in 3 s only moves the job to the next rung (the why says so).
- Past the bound the job ends `cause=oom-bound` — «stopped: used more than 4 GB». `cause=oom` = killed by an OOM
  from OUTSIDE its bound (the whole instance ran out).
- **Two out-of-memory ends in a row PARK the job** («parked: out of memory twice — raise its bound or fix the job»):
  a service is no longer restarted — not by its backoff, not when VibeSpace restarts — until someone runs
  `vibespace-job start <id>`. Raise the bound first (`vibespace-job memory <id> 8G`) or fix the leak.
- Any other end — ok, error, a restart of VibeSpace — resets the count.
- On a cluster ONE process past the pod's limit kills the whole instance (your conversation included); a run that
  died that way counts too when the instance's own OOM record shows it (a restart for another reason never counts).
- Under RLIMIT_DATA node counts ~600 MB of its own reservations against the bound — under ~512 MB node cannot
  even start. Give a node job at least 1G. A size under 256M is refused by name.

## 8. Permissions model (why you can't see some jobs)

view/control scopes: `session` (owner conversation only) / `group` (sessions
sharing a Task Group with the creator — the default view) / `all`. An id you
can't view behaves as NONEXISTENT (uniform not-found — don't retry, it's not
an error in your call). Owner = conversation lineage (survives resume).
Mutations (access/notify/rm of others' jobs) need ownership; `announce` needs
control; `subscribe` needs view only.

## 9. Environment inside a job process

`VIBESPACE_API` · `VIBESPACE_JOB_ID` · `VIBESPACE_JOB_TOKEN` (acts on THIS
job only: progress/ask/announce) · secrets you referenced with `--env-from`
(user manages values in ⚙→Background Work; values are literal-redacted from
log tails) · `data/bin` on PATH. Ambient vendor credentials are STRIPPED, and a job
whose command obviously reads a subscription sign-in — Claude's
`.credentials.json`, codex's `auth.json`, OpenCode's login file, VibeSpace's
account folders, the macOS keychain item, an OAuth token variable or a pasted
token — is refused at create, at start and at every run (its cmd, cwd, a
health probe, an `--env-from` name, a scheduled run's command): background use
of a subscription login is the class that got a subscription banned. Calling
any API with your own key is fine. This is a reminder against obvious reads of
sign-in files, NOT a sandbox.

### The agent browser inside a job

A job may use the agent browser as its owner conversation: the same profile,
the same who-may-use, its own window; its actions appear in the
conversation's browser trace as the job's. Concretely:

* `vibespace-browser <verb>` works in a job's script as it does in the
  conversation (it reads `VIBESPACE_JOB_TOKEN`). It runs in the profile the
  conversation has **pinned** (or its default attachment) — the same logins.
  Pin the profile the job needs FROM the conversation before scheduling it;
  with nothing pinned the job is refused `job_no_profile`.
* The job gets its **own window** in that browser (one window per holder): it
  never moves the conversation's tab, and the user can watch or take over the
  job's window apart from the conversation's.
* Admission is the conversation's: if the user keeps that profile to other
  conversations, the job is refused `not_owner` exactly as the conversation
  would be.
* A job may read and act (open, click, snapshot, tabs, dialogs, status) but
  never change the conversation's browsers — `use`, `pin`, `new`,
  `new-child`, `detach`, `backend`, `blocked`, `site-hint`, `site-reset` and
  `resume` are refused `job_token`; run those from the conversation.
* `vibespace-browser status` in a job names the profile its page verbs land
  on and the conversation's pin. A screenshot, PDF or download may be saved
  under the job's own working directory (its `--cwd`), /tmp or ~/Downloads.
* It keeps browsing while its run is alive, even after the conversation that
  created it stopped; when the run ends its window closes and its lease is
  released. A finished job's token is refused `job_not_running`.

## 10. Picking the right tool (negative space)

- Turn-scoped waits (a build, a test run) → your harness's background Bash/Monitor
- In-session continuation ("keep going until X") → `/goal`
- Must OUTLIVE the conversation → THIS
- Harness cron → never (dies with the session); dated obligations → `--at`
- Reminders for YOURSELF (dated obligations) → `notify-cron` (each fire wakes YOUR conversation; since 2.363.1 the user's For you tray is NOT copied unless you add `--notify-user` — §3 «The user's For you copy» says what it does per kind, that it is set at creation, and that a reminder made before 2.369.362 must be recreated — the fire text is usually agent-facing, so relay to the user yourself via chat/vibespace-ask when warranted)
- Simple user forms → Interaction Panels (§5) before building a web page (§6)

## The full teaching behind the session intro's pointer line

Every session's first prompt carries ONE line for this tool and points here (2.369.227 — the first prompt context must leave room for notices and messages). These are the words it used to carry in full:

Background work that must OUTLIVE this conversation (a dev server, a monitor, a batch job, a schedule) — never nohup/systemd/harness-cron. Register it with `vibespace-job` and get it back later BY POLLING, even from a future session:

```sh
vibespace-job run "python3 collect.py" --name collect-x --context "goal: 500 prompts; output: /data/x.jsonl; resume: rerun with --resume"
```

```sh
vibespace-job poll <id> (echoes your --context brief with the result — write one that explains everything to your future amnesiac self)
```

Flags pick the kind: --keep-up = keep-alive service · --every 30m / --cron "41 9 * * *" / --at "2026-09-05 06:00" = schedule. Your conversation is auto-messaged when a job finishes/fails/asks (create output says so); inside a job, `vibespace-job announce "found X"` notifies NOW (watch jobs: exit code ≠ newsworthiness); `subscribe <id> [--filter regex]` = get another visible job's messages; `list --mine|--subscribed` and `show <id>` re-inspect everything you registered. Turn-scoped waits stay in background Bash/Monitor; /goal covers in-session continuation; dated obligations go to --at, not the group backlog. FULL manual anytime: `vibespace-job docs`; every tool: `vibespace-docs [status|ask|task|jobs]`.

Background work that must OUTLIVE this conversation (a dev server, a monitor, a batch job, a schedule) — never nohup/systemd/harness-cron. Register it with `vibespace-job` and get the result later BY POLLING, even from a future session:

(`vibespace-job poll <id>` echoes your --context brief with the result — write one your amnesiac future self can act on. --keep-up = keep-alive service · --every 30m / --cron "41 9 * * *" / --at "2026-09-05 06:00" = schedule · dated obligations go to --at, not the backlog. Your conversation is auto-messaged on completion/failure/ask; in-job `announce "found X"` notifies NOW; `subscribe <id> [--filter regex]` follows another visible job; `list --mine|--subscribed` / `show <id>` re-inspect full params. Full manual: `vibespace-job docs`.)

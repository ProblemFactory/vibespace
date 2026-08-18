# Background Work — the full manual (`vibespace-job docs`)

Read this when the one-line teaching isn't enough. Everything here is served by
YOUR VibeSpace server, so it always matches the running version. Agent-facing;
poll is the interface; nothing here ever auto-triggers an agent run.

## 1. The three kinds

| Kind | Create with | Lifecycle |
|---|---|---|
| **task** | `vibespace-job run "CMD" --name X` | runs once to completion; interruptible; pollable forever (record kept 14d after done) |
| **service** | add `--keep-up` | kept running: crash backoff, parks after 6 fast crashes, revived by `start`; survives server restarts AND pod rebuilds (boot replay) |
| **cron** | add `--every 30m` / `--cron "41 9 * * *"` / `--at "2026-09-05 06:00"` | fires `CMD` as a task on schedule (ONE child record, each fire = a run), or `notify-cron` for pure reminders |

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
3. **Everyone else who can view** — passive only: one line in their next
   context injection (never a wake); a job's announce flood coalesces to a
   single `×N + latest` line.

**Quiet-success law**: a scheduled run ending fine is silent by default
(ring entry only). Opt successes into events+notify with `--notify-ok`.

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
the user's For-you inbox (opens the panel directly) and on the job card. Read
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

## 7. Self-inspection & control

- `vibespace-job list [--mine|--subscribed]` — ★mine / ✓sub markers
- `vibespace-job show <id>` — FULL registration: argv/cwd/env names, schedule
  + next fire, restart/timeout/until, access + lock, notify state + last
  delivery, subscribers + your filter, context, last run
- `poll <id> [--wait 100] [--tail 40]` — state + context echo + log tail;
  `--wait` long-polls (cap 100s)
- `logs <id> [--tail 200]` · `progress "text"` (in-job status line)
- `stop <id> [--force]` · `start <id>` (revive parked) · `rm <id> [--stop]`
- `access <id> --view session|group|all --control session|group|all` —
  owner-only; the user can lock access against agent edits

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
log tails) · `data/bin` on PATH. Ambient vendor credentials are STRIPPED —
jobs must never talk to LLM vendor APIs (creation refuses vendor/credential
patterns; that class got a subscription banned — don't try to work around it).

## 10. Picking the right tool (negative space)

- Turn-scoped waits (a build, a test run) → your harness's background Bash/Monitor
- In-session continuation ("keep going until X") → `/goal`
- Must OUTLIVE the conversation → THIS
- Harness cron → never (dies with the session); dated obligations → `--at`
- Reminders for the USER (not a process) → `notify-cron`
- Simple user forms → Interaction Panels (§5) before building a web page (§6)

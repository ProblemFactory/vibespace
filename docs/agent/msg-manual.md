# vibespace-msg — messaging other agent sessions (groups)

Every message lives in a **group**. A group has at least two agent sessions,
and the user is an implicit member of every group — they read everything in
the Channels panel and can post into it. Use groups for coordination between
sessions — handoffs, questions, findings another running agent needs. For
durable knowledge use the Task Group's shared context folder; for group-wide
progress use `vibespace-task progress` (every member sees it passively).

## Groups

- **Groups exist only because somebody made one.** `vibespace-msg group create
  <name> <member…> [--context "why"]` makes a group: you are in it, plus the
  sessions you name, plus the user. There is NO automatic group per Task
  Group — a group nobody asked for would only be noise.
- **A direct message is a two-member group.** `vibespace-msg send <agent>
  "…"` finds or creates the group of exactly you two — the same group every
  time, from either side. A direct group never takes a third member.
- **Each member decides how much it hears** — its notify mode in that group
  (the table below). The default is `next-turn`: new messages are batched into
  ONE report that arrives as context on that member's next turn the USER
  starts. It costs nothing and it can never set off an echo chamber of agents
  waking each other. `mention` hears ONLY what @names it (woken for it; the
  rest is not queued — an "at-style" group); `always` wakes it
  for every message; `mute` hears nothing. Waking is a billed turn — the
  price of each mode is in the table.
- **An invite carries its reason.** `--context "…"` becomes ONE line in the
  group's log that everyone sees, and it is the first thing the invitee
  reads. An invite is an act toward the invitee, so it wakes them at once
  (unless they muted the group); `--quiet` adds them without waking.
- **New members see from their join on.** Their report holds only what was
  said after they joined, plus the invite context. Older history is there to
  read on purpose: `vibespace-msg read <group> --before <ts>`.
- **Every answer says what it cost.** `send`, `group create` and `group
  invite` print the wake count — `woke 2 agents = 2 billed turns` — and which
  wakes the spend ceiling refused (those members get it on their next turn).
- **The user sits in every group.** In the Channels panel the user sees
  every group's whole log (the first screen is the group list), can create
  groups and invite you, can change ANY member's notify mode (yours too), and
  can post — their messages are signed `User` in your report and they go out
  directly (never as a draft for approval). A user message that @names you
  wakes you like any @mention; otherwise it follows your notify mode.

## Commands

```
vibespace-msg list                              # who you can see/message
vibespace-msg group list                        # the groups you are in (id · members · unread · your notify mode); `groups` = the same
vibespace-msg send <name|id|group> "text" [--at <member>]… [--wake] [--yes]
vibespace-msg dispatch <agent> --file brief.md | "text"   # = send <agent> --wake --compact-first "text"
vibespace-msg read <group> [--before <ts>] [--limit N]
vibespace-msg group create <name> <member…> [--context "why"] [--quiet] [--yes]
vibespace-msg group invite <group> <member…> [--context "why"] [--quiet] [--yes]
vibespace-msg group leave <group>
vibespace-msg group kick <group> <member>       # the group's creator only
vibespace-msg group rename <group> <new name>
vibespace-msg group archive <group>             # the group's creator only; the log is kept
vibespace-msg group notify <group> <next-turn|mention|always|mute>
```

- `send <agent>` posts into your **direct group** with that session — the
  two-member group of the pair, created the first time and the SAME group
  every time after, from either side. `send <group>` (its id `g-…` or its
  name) posts into a group you belong to.
- A group is only ever made by somebody on purpose (`group create`, or the
  first `send <agent>`). There is no automatic group per Task Group.
- Members are named by session name or conversation id (`vibespace-msg list`);
  `<group>` is a group id (`g-…`) or its name. Names are resolved by the
  server; a name that fits more than one session (or more than one of your
  groups) is REFUSED with the candidates listed — repeat with one of the ids.
  A name that is both one of your groups and a session you can message is
  refused the same way (`g-…` and a conversation id are never ambiguous).
  Nothing is ever guessed.
- **An @ is resolved when you SEND it.** Every `@<member name>` or
  `@<conversation id>` in the text becomes that member's id at that moment;
  an @ that names nobody in the group, or two members at once, is REFUSED
  (`unknown-mention` / `ambiguous-mention`) with the candidates, and nothing is
  sent. An @ inside backticks is code, never a mention — write a literal
  "@word" as `` `@word` ``. `--at <name|id>` (repeatable) names a member
  explicitly; one the text does not already @ is written in front of it.
- A report line names who a message mentions as a FIELD, by id:
  `- [ts] alpha [mentions: you (<your conversation id>), beta (<id>)]: …` —
  "you" is decided by YOUR id, never by matching your name in the words.
- A refusal prints `vibespace-msg: refused [<code>] — <why>` and the remedy on
  the next line, and exits 1 (2 = not inside a session, 3 = server
  unreachable). The codes: `unreachable` (not found or outside your reach —
  one answer for both), `not-found` (no such group of yours), `ambiguous`,
  `not-member`, `not-allowed` (creator-only), `archived`, `pair-group`,
  `job-token`, `bad-notify`, `bad-name`, `too-few-members`, `self`,
  `unknown-mention` / `ambiguous-mention` (an @ that names no member, or two),
  `confirm-wakes` (the command would wake more than 5 agents — nothing was
  sent; the refusal says how many; repeat with `--yes` only if waking them all
  NOW is worth that many billed turns).
- **Inside a Background Work job** (`VIBESPACE_JOB_TOKEN`) the CLI speaks as
  the conversation that owns the job: `list`, `group list`, `read` and `send`
  work (a `send <agent>` only into a direct group that already exists);
  creating a group or changing membership (`create` / `invite` / `leave` /
  `kick` / `rename` / `archive` / `notify`) is refused with `job-token` — do
  that from the conversation.

## Being woken by a reply

A direct group defaults to next-turn for BOTH sides, so a reply waits for your next turn. Either side may decide otherwise, per message:

| who | how | cost |
|---|---|---|
| the ASKER | `vibespace-msg send <agent> "question" --await` — the FIRST reply by anyone else within 2 h wakes you ONCE | one billed turn (yours), only if they reply |
| the REPLIER | `vibespace-msg send <agent> "answer" --wake` — wakes them now (as always) | one billed turn |

Both at once = still ONE wake. A second reply, a reply after 2 h, a reply you were already handed, or you muted / left / not running ⇒ no wake (the reply waits for your next turn). `read` shows `(awaiting reply)` / `(woke you HH:MMZ)` / `(await expired)`. The replier sees "(<asker> asked to be woken by your reply …)"; if you must not wake them, do not reply in that group.

## When the other conversation ended

A message to a conversation that was archived (or is gone) is never "waiting": `read` says `not delivered — <name>'s conversation was archived`; a STOPPED one still waits (`<name> is stopped — delivered when it resumes`). A direct group whose other side ended is CLOSED (`group list` shows `(closed)`, `read` still works), and `send` to that agent is refused `ended`.

## Hand over what you made (--artifact)

`vibespace-msg send <agent> "the design is ready" --artifact /abs/designs/doc-ui /abs/path/report.md` (every path after
`--artifact` until the next flag; `--artifact` may also repeat)
hands YOUR OWN artifacts (a file this conversation wrote, a design folder it opened, a page it published as `/p/<id>`)
to the receiver: they appear in the receiver's chat as cards ("Handed over by <you>") and in its Artifacts list; a
design opens in the user's Design window. Up to 20 per message; nothing is copied (the receiver must run on the same
machine); the reach is the message's. Into a group, name the receiver (`@name` or `--at`). `vibespace-design open
<dir> --for <conversation>` does the same for one design. A subagent (Task) needs none of this — its writes are
already the parent conversation's.

## When does the receiver see it? (READ THIS — it decides the cost)

Each member of each group has a **notify mode** — its own choice, set with
`group notify` (the user can set anyone's in the panel):

| mode | what reaches that member |
|---|---|
| `next-turn` (default) | new messages are collected into ONE report, delivered as context on its next turn **the user starts** — no extra turn, no cost |
| `mention` | ONLY messages that @name it reach it: each wakes it NOW, and its report holds only those — the rest is never queued (`read` the group on purpose) |
| `always` | woken NOW by every message |
| `mute` | nothing (read the group on purpose with `read`) |

- **A wake is a BILLED turn for the receiver.** It happens when you @name a
  member (`@alpha` or `@<conversation id>` in the text — every mode but mute;
  `@测试请看` works too: a change of script ends the name),
  when you pass `--wake` (= an @ of every other member), for members on
  `always`, and for each invitee of `group create`/`invite` (unless `--quiet`).
  VibeSpace's spend ceiling may refuse a wake; then the message still lands in
  the group and reaches that member on its next turn — you are told which.
- **The count comes BEFORE the act.** A `send` / `group create` / `invite` that
  would wake **more than 5** agents is refused `confirm-wakes` with the number
  (every @, `--wake`, invitee and `always` member counted) until you add
  `--yes`. And **at most 8 of your wakes go out per minute** — the rest are
  refused `rate floor` (not billed; the message still reaches them next turn).
- **Without a wake the message is free**: it waits in the group and arrives
  in the receiver's next user-started turn as a report. Default to this.
  Wake only when the other agent must act NOW.
- Group messages reach YOU the same way: a `### Group messages since your last
  turn` section on your next turn (only messages since you joined; older ones
  are named with a `read <group> --before <ts>` pointer; a long message is cut
  to one line and followed by `(N message(s) above cut short — the whole text:
  vibespace-msg read <group> --before <ts> --limit <n>)` — run it to read the
  rest), or right away when someone @names you (unless you muted the group).
  When a turn has no room left for a report, the groups waiting are still
  NAMED — they arrive on your next turn.
- **Where a message stands**: every message line of `vibespace-msg read` ends
  with its recipients' state — ` — waiting for beta's next turn` (not handed
  over yet: it rides beta's next report), ` — read by beta` (its report or
  wake went out), ` — beta is muted (never reads it)`, ` — beta left`; a group
  lists them by state (`waiting: a, b · read: c`). The user sees the same line
  under the message in the Channels window, so "I sent it" and "they read it"
  are never confused: a message you sent that still says *waiting* has not
  reached anyone yet.

## Dispatch a brief to a worker

A coordinator that keeps long-lived WORKER conversations hands each its next
brief with ONE verb — and the worker is **compacted first**, so the brief does
not pay for the whole history of the briefs before it:

```
vibespace-msg dispatch <agent> --file brief.md      # the brief from a file (a long brief never rides argv)
vibespace-msg dispatch <agent> "text"
vibespace-msg send <agent> --wake --compact-first "text"   # the same thing
```

- **Counted, twice at most**: the wake is ONE billed turn for the worker,
  under the same spend ceiling and the same wake pace as `send --wake` (one
  wake per worker per 30 s, 8 per minute). The COMPACTION is a model call
  nobody typed, so it is counted too — authorized (held) under the same
  unattended ceiling BEFORE `/compact` is typed, as its own turn. When the
  ceiling or the pace says no, nothing is compacted and the brief reaches the
  worker on its next turn (free), said. The answer names both counts.
- **Whose worker**: an agent compacts only a worker in a **Task Group it
  belongs to as well** — a reach the owner opened (a session's reachability,
  a group's external visibility) lets you MESSAGE and wake a conversation,
  never wipe its context. Outside a shared Task Group the brief goes without
  a compaction, said. Membership IS the marker: the owner put you both in that
  group on purpose (they created it), so compacting a co-worker is their
  standing choice — the group's objective text is not read, only who is in it.
- **Idle targets only — by the harness AND by the person**: `/compact` is sent
  only to a worker that is a live CHAT session, IDLE, on a harness that says
  when a compaction ends (Claude Code today), and whose OWNER has neither sent
  input NOR edited its draft for 10 minutes — a conversation a person is using,
  or is composing a reply in (an unsent draft counts), is never compacted by an
  agent. (A person who is only reading, having last typed more than 10 minutes
  ago, is not seen — the quiet window is the fence.) A worker in the middle of a turn, already compacting,
  with its owner at the keyboard, or on another harness gets the brief WITHOUT
  a compaction — the answer says why. A TERMINAL session is refused
  (`not-chat`, nothing sent): use `send --wake`.
- **Seen by the owner**: the worker's chat shows the compaction as yours —
  the spinner label names your conversation ("asked by <you> through
  vibespace-msg dispatch") and the live record carries `origin dispatch`.
- **The wait**: the command waits for the compaction to end (1–2 minutes on a
  large conversation), at most 3 minutes; past that the brief is delivered
  anyway — it waits behind the compaction — and the answer says the
  compaction's end was NOT OBSERVED (`unknown`: it may have finished, or still
  be running — an old CLI or a wrapper restarted mid-compaction emits no end
  record). Never "did not finish": that is not known.
- **The worker's reply wakes you**: a successful dispatch sets YOUR notify mode
  on that direct group to `always`, so when the worker replies you are woken
  with it — a report you dispatched never waits for the user to type into your
  conversation first. The answer says it ("the worker's reply wakes you
  (always)"). To stop being woken by that worker, `vibespace-msg group notify
  <group> next-turn` (or `mute`).
- **A retry re-sends nothing**: the same brief (your conversation, the worker,
  the text) within 10 minutes of being delivered is answered `ALREADY
  delivered` — no second compaction, no second wake, nothing posted — even
  after a server restart (the ledger is on disk). If the server restarted
  mid-wait (your request died after `/compact` was typed but before the brief
  was posted), the retry skips the compaction and posts the brief, said.
  **To send the SAME text again on purpose** (a standing brief the worker
  should run a second time, a re-dispatch after a wall), add `--again`: it
  bypasses the "already delivered" replay with a fresh attempt (a new
  compaction if the worker is idle, a new wake). Without it the identical text
  is treated as a lost-answer retry and swallowed.
- **What the answer says**: `compacted` (the CLI reported success), `NOT
  compacted` (it failed — the CLI's words — ended without success, or could
  not start; the brief was delivered anyway), `compaction outcome UNKNOWN`
  (no end record within the wait), `no compaction` (skipped, with the reason)
  or `ALREADY delivered` (a replay); whether the compaction was counted; then
  whether the worker was woken (billed, on which account) or gets it on its
  next turn.
- To an AGENT only (a group has no one conversation to compact); from a
  conversation only — a Background Work job never dispatches.

## Inviting

- Only members can invite; you can invite a session only if you can message
  it (Reach below). Inviting someone already in the group does nothing and
  says so. A direct (two-member) group takes no third member — create a group.
- `--context "…"` is the reason they are being added: it becomes a line in the
  group's log that everyone sees, and it is the FIRST thing the invitee reads.
- The invitee sees the messages from its join on; it can `read` older history
  on purpose.

## Leaving, removing, archiving

- `leave` yourself; the creator can `kick` a member; the creator can `archive`
  the group (the log stays readable). A direct group ends (is archived) when
  one side leaves; the next `send <agent>` starts a new one.

## Reach (who can I talk to?)

- **Same Task Group** — always mutual (see + message). This is the default
  collaboration boundary.
- **Other Task Groups** — closed unless the USER opened them: a Task Group can
  be made externally `visible` or `messageable`, or one session can be opened
  (Session Properties). `visible` is not enough to message or invite; you
  cannot widen your own reach — ask the user if you need a scope opened.
- Uniform errors: "not found" and "not reachable" are the same answer by design.

## Etiquette + limits

- State what you need and whether you expect a reply.
- 16KB cap per message — for anything bigger, write a file and send its
  absolute path.
- The same text to the same target within 10 minutes is not resent. At most
  ONE wake per member per 30 seconds from you, and at most 8 wakes per minute
  in all — whatever caused them (`@name`, `--wake`, an invite, an `always`
  member): a wake past either limit is refused as `rate floor` (not billed),
  the message is still posted and reaches that member on its next turn. The
  limits survive a server restart. A wake the spend ceiling refused does not
  count against the per-member 30 s limit, but it DOES count toward your 8 per
  minute — retrying into a refusal cannot hammer the ceiling.
- A session sends only once it has a conversation id of its OWN (after its
  first turn; a fork of another conversation carries its parent's id for a few
  seconds after it starts); before that `send` is refused `bad-member` — wait
  a moment and repeat the command.
- Replies arrive in YOUR conversation (a report on your next turn, or a wake
  if they @name you); there is nothing to poll. `vibespace-msg group list`
  shows unread counts.

## The full teaching behind the session intro's pointer line

Every session's first prompt carries ONE line for this tool and points here (2.369.227 — the first prompt context must leave room for notices and messages). These are the words it used to carry in full:

Other agent sessions may be working alongside you. `vibespace-msg list` shows the ones you can reach (your Task Group by default); `vibespace-msg send <name|id|group> "text"` posts into your direct (two-member) group with them, or into a group — by default it reaches them on THEIR next turn at no cost, `--wake` (or an @name in the text) wakes them now as a billed turn. `vibespace-msg group create <name> <member…>` makes a group. Group messages reach you here as a report on your next turn. Manual: vibespace-docs msg.

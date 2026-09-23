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
  waking each other. `mention` wakes it when it is @named; `always` wakes it
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
vibespace-msg send <name|id|group> "text" [--wake] [--yes]
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
- A refusal prints `vibespace-msg: refused [<code>] — <why>` and the remedy on
  the next line, and exits 1 (2 = not inside a session, 3 = server
  unreachable). The codes: `unreachable` (not found or outside your reach —
  one answer for both), `not-found` (no such group of yours), `ambiguous`,
  `not-member`, `not-allowed` (creator-only), `archived`, `pair-group`,
  `job-token`, `bad-notify`, `bad-name`, `too-few-members`, `self`,
  `confirm-wakes` (the command would wake more than 5 agents — nothing was
  sent; the refusal says how many; repeat with `--yes` only if waking them all
  NOW is worth that many billed turns).
- **Inside a Background Work job** (`VIBESPACE_JOB_TOKEN`) the CLI speaks as
  the conversation that owns the job: `list`, `group list`, `read` and `send`
  work (a `send <agent>` only into a direct group that already exists);
  creating a group or changing membership (`create` / `invite` / `leave` /
  `kick` / `rename` / `archive` / `notify`) is refused with `job-token` — do
  that from the conversation.

## When does the receiver see it? (READ THIS — it decides the cost)

Each member of each group has a **notify mode** — its own choice, set with
`group notify` (the user can set anyone's in the panel):

| mode | what reaches that member |
|---|---|
| `next-turn` (default) | new messages are collected into ONE report, delivered as context on its next turn **the user starts** — no extra turn, no cost |
| `mention` | woken NOW when a message @names it; otherwise like next-turn |
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
- A session sends only once it has a conversation id (after its first turn);
  before that `send` is refused `bad-member`.
- Replies arrive in YOUR conversation (a report on your next turn, or a wake
  if they @name you); there is nothing to poll. `vibespace-msg group list`
  shows unread counts.

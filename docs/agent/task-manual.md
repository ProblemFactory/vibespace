# vibespace-task — full manual

The Task Group (岗位) shared memory: a persistent board every session of the
group reads, now and in the future. Three surfaces: the activity LOG
(progress), the parking lot (BACKLOG), and the group state (show).

Sessions in MULTIPLE groups must pass `--group <T-id>` on every call; your
context injection names each group's id.

## Activity log — after each meaningful piece of work

```
vibespace-task --group <id> progress "one-line summary" --detail "specifics other agents may need"
```

- The log is for OTHER AGENTS (and future you). Anything the USER needs must
  also be in your chat reply.
- Write the detail as a handoff: ids, paths, decisions and WHY, gotchas.
- Keep your own working steps in your session todo list, not here.

## Backlog — the parking lot (NON-immediate only)

```
vibespace-task --group <id> backlog-add "one-line item" --detail "context for whoever picks it up"
vibespace-task --group <id> backlog                 # list (open items, claim marks)
vibespace-task --group <id> backlog <B-id>          # one item in full
vibespace-task --group <id> backlog-claim <B-id>    # take ownership (changes notify you)
vibespace-task --group <id> backlog-unclaim <B-id>  # hand it back
vibespace-task --group <id> backlog-done <B-id>     # decided or finished
vibespace-task --group <id> backlog-drop <B-id>     # will not do (say why in chat)
```

- Park anything the user defers ("later" / "let me think") so it isn't lost.
- Parking auto-CLAIMS for you; claimed items resurface in your context.
- NEVER start a parked item unasked. If the user hands you a B-id: view it,
  claim it, then work it.
- Dated obligations do NOT belong here — use `vibespace-job run … --at`.

### Priority and what you are reminded of

```
vibespace-task --group <id> backlog-add "item" --priority high      # high | normal (default) | low
vibespace-task --group <id> backlog-edit <B-id> --priority low
```

- `high` = must not be forgotten; `low` = someday. The listing prints `!` for
  high and `↓` for low, highest priority first, newest first within a
  priority, with `(you)` / `(claimed by N)` / `(unclaimed)` — list numbers
  follow that order.
- A number (`backlog-done 3`) means the item printed as 3 in the list YOU
  were last shown by `backlog` / `show` — not the current order, which shifts
  whenever anybody parks an item. If that item was resolved or deleted since,
  the verb refuses and changes nothing. Prefer the `B-xxxx` id for mutating
  verbs; `backlog-done` / `-drop` print the id and text of what they resolved.
- When you are handed the group's context you are reminded of the open items
  YOU claimed (up to 5, by priority then recency), plus one line naming the
  open HIGH items no running session owns (nobody claimed it, or every
  claimant is no longer running) — claim it if it is yours to carry.
  Everything else is only a count. Limit: a claim is tied to the session key
  it was made under; a conversation that was stopped and never resumed stops
  owning its items for this reminder, and one resumed later owns them again.

### When you hold too many

The backlog has no size limit, so it is on you to keep your share small. You
"hold" every open item you claimed or parked. When that reaches the
instance's threshold (setting `tasks.backlogNudgeAt`, default 20; 0 = off),
`backlog-add`, `backlog-edit` and `backlog-claim` print a `note:` line, and
the same paragraph reaches you on every turn (in the per-turn reminder, and at
the end of your group context when it is injected; several groups share one
paragraph): how many you hold,
how many are older than 14 days, and the oldest ids. Clean up before parking
more:

```
vibespace-task --group <id> backlog-done <B-id>                        # finished / decided
vibespace-task --group <id> backlog-drop <B-id>                        # obsolete
vibespace-task --group <id> backlog-edit <B-id> --detail "merged: …"   # merge same-topic items into one…
vibespace-task --group <id> backlog-drop <B-id2>                       # …and drop the rest
```

The note never blocks anything (the exit code stays 0), and `backlog-done` /
`backlog-drop` / `backlog-unclaim` never print it — they shrink what you hold.
Unclaiming an item you parked does not stop it counting as yours; resolve or
drop it instead.

## Reading group state

```
vibespace-task --group <id> show [--full]   # objective, folders, recent activity, backlog heads
```

`--full` re-reads everything (use after compaction). The group's shared
context FOLDER (named in your injection) is the group's文件记忆 — organize
durable knowledge there yourself; the `.vibespace/` subfolder is generated,
read-only.

## Group admin (designated managers only)

A session the user marked as Group Manager (Session Properties) additionally
gets create/configure/bind verbs across ALL groups — taught in-context when
granted; actions are audited in each group's activity log.

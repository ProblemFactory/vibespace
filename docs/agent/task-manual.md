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

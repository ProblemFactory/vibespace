# vibespace-msg — messaging other agent sessions (Communication Channels v1)

Send a message to another agent session; it arrives in THEIR conversation as
a peer message (rendered as a card, injected mid-turn or waking an idle
session). This is for coordination between sessions — handoffs, questions,
findings another running agent needs NOW. For durable knowledge use the
group's shared context folder; for group-wide progress use `vibespace-task
progress` (every member sees it passively, nobody gets woken).

## Commands

```
vibespace-msg list                    # who you can see/message
vibespace-msg send <name|id> "text"   # deliver (or queue if unreachable)
```

`list` shows: ✉ = messageable, · = visible only. Names resolve to the
conversation id; if a name is ambiguous, use the id. Machines are handled for
you — a session on another machine is addressed exactly the same way.

## Reach (who can I talk to?)

- **Same Task Group** — always mutual (see + message). This is the default
  collaboration boundary.
- **Other groups** — closed unless the USER opened them: a group can be made
  externally `visible` or `messageable` (group settings), or one session can
  be individually opened (Session Properties). You cannot widen your own
  reach — ask the user if you need a scope opened.
- Uniform errors: "not found" and "not visible to you" are the same answer
  by design.

## Cost + etiquette (READ THIS)

- Delivering to an IDLE session opens a **billed turn** for the receiver —
  message like you'd interrupt a colleague, not like logging. State what you
  need and whether you expect a reply.
- Rate floor: 1 message per target per 30s; identical text deduped 10min.
- 16KB cap — for anything bigger, write a file and send the absolute path.
- If the target is unreachable, the message is QUEUED and injected at their
  next turn ("Messages that arrived while unreachable") — you'll be told.
- Replies arrive in YOUR conversation as peer-message cards; nothing to poll.

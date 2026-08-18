# vibespace-ask — full manual

Files an item into the USER's global For-you inbox: something only the human
can do (a decision, missing input, a review). The inverse of your own todo
list. The inbox is a NOTIFICATION MIRROR — the full question, options and
your recommendation must ALSO be in your chat reply; never let the inbox be
the only copy.

## Verbs

```
vibespace-ask "the question"  --detail "options + your recommendation" --urgency high
vibespace-ask list                     # your session's open items
vibespace-ask resolve <id|text-match>  # the MOMENT they answer (a chat answer counts)
```

- One item per genuine decision — don't split a single question into several
  items, don't re-file what's already open (re-filing the same text refreshes
  the existing item instead of duplicating).
- `--urgency low|normal|high|urgent` drives the taskbar badge tier.
- RESOLVE YOURSELF when the user answers anywhere (chat included). Leaving
  answered items open trains the user to ignore the inbox.

## What the user sees

Taskbar inbox button with per-urgency count pills; items grouped by session
(clicking jumps into your conversation); a viewer with copyable markdown.
Items you file with detail ship up to 2000 chars of context — write the
detail so the user can decide WITHOUT opening the conversation.

## When NOT to use it

- Progress reports → `vibespace-task progress` (group log), not the inbox.
- Things YOU will do later → your own todo list / group backlog.
- Job events → automatic (Background Work notifies); don't hand-file those.

# vibespace-ask — full manual

Files an item into the USER's global For-you inbox: something only the human
can do (a decision, missing input, a review). The inverse of your own todo
list. The inbox is a NOTIFICATION MIRROR — the full question, options and
your recommendation must ALSO be in your chat reply; never let the inbox be
the only copy.

## Verbs

```
vibespace-ask "the question"  --detail "options + your recommendation" --urgency high
vibespace-ask "Run the migration now?" --options "run now|wait for backup"
vibespace-ask list                     # your session's open items
vibespace-ask resolve <id|text-match>  # the MOMENT they answer (a chat answer counts)
vibespace-ask show <id>                # one item of yours in full, any status, with the user's reply
```

- `--options "A|B|C"` = up to 6 one-click answers (≤ 40 chars each, distinct,
  non-empty, no `|` inside a label — `"A||B"` or a trailing `|` is refused by
  name, never trimmed away). The user sees them as chips; clicking one replies
  with exactly that label. Decisions with options sort first in the inbox.

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

## Replies from the inbox

The user can answer an item right in the inbox. The reply reaches you as an
ordinary USER message (their own typing — it may arrive mid-turn and be
queued like anything they type), shaped exactly like this:

```
[For you reply #ut-3f9a1c2b7d]
> filed 12 min ago (2026-09-23 06:02 UTC) · urgency high
> Approve the migration plan before I continue
> detail:
> Options: A) run now  B) wait for tonight's backup. I recommend B.
> … (detail cut at 1500 of 1987 chars — `vibespace-ask show ut-3f9a1c2b7d` prints the whole item)
> options: run now | wait for backup

wait for backup — and tell me when it is done.
```

- Line 1 is always `[For you reply #<id>]` — the id of YOUR item it answers.
- Every `> ` line quotes the item: when it was filed and its urgency, the
  whole text, `> detail:` and the first 1500 chars of the detail (a cut adds
  the `… (detail cut at …)` line, only when something was cut), and
  `> options: …` when the item had options.
- After one blank line: the user's reply, verbatim. With options it may be
  exactly one of your labels (a chip click).
- The item is already resolved (`resolved by reply`) when you read this —
  `vibespace-ask resolve <id>` on it is a harmless no-op. Answer in chat.

## When NOT to use it

- Progress reports → `vibespace-task progress` (group log), not the inbox.
- Things YOU will do later → your own todo list / group backlog.
- Job events → automatic (Background Work notifies); don't hand-file those.

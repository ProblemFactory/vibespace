# vibespace-ask — full manual

Files an item into the USER's **For you tray** — the tray at the bottom right
of their screen (top right on a phone): something only the human can do (a
decision, missing input, a review). The inverse of your own todo list. The
tray is a NOTIFICATION MIRROR — the full question, options and your
recommendation must ALSO be in your chat reply; never let the tray be the
only copy.

**Name it the way the user sees it.** When you tell the user you filed
something, say "I added it to the For you tray at the bottom right" — never
"your inbox" or "your queue": no button on their screen carries those words,
and a user told "check your inbox" does not know where to look.

## Verbs

```
vibespace-ask "the question"  --detail "options + your recommendation" --urgency high
vibespace-ask "Run the migration now?" --options "run now|wait for backup"
vibespace-ask list                     # your session's open items
vibespace-ask resolve <id|text-match>  # the MOMENT they answer (a chat answer counts)
vibespace-ask show <id>                # one item of yours in full, any status, with the user's reply
vibespace-ask clear <id>               # an item YOU filed: it stays in the tray with its time, its words become "[cleared at the user's request]"
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

The For you button in the taskbar (bottom right by default) with per-urgency
count pills; a new item also pops a toast naming where the tray is ("Added to
For you (bottom right)"); items grouped by session
(clicking jumps into your conversation); a ⤢ on every item opens the For you
WINDOW, where a long item is read at full width (markdown rendered — headings,
lists, code blocks, tables), answered, marked done or dismissed.
Items you file with detail ship up to 8000 chars of context (the question
itself up to 500) — write the detail so the user can decide WITHOUT opening
the conversation. A longer detail is cut and the CLI SAYS so (`NOTE: your
--detail was CUT at 8000 characters`): the part after the cut never reached
the user — put the whole content in your chat reply.

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

## The full teaching behind the session intro's pointer line

Every session's first prompt carries ONE line for this tool and points here (2.369.227 — the first prompt context must leave room for notices and messages). These are the words it used to carry in full:

Whenever you ask the user ANYTHING — a question in chat, or ending a turn waiting on their decision/input/review — ALSO file it in their For you tray with `vibespace-ask`. They are often NOT watching this window; the tray is how they find waiting questions across all sessions. When you mention it to the user, call it "the For you tray at the bottom right" (where it sits on their screen) — never "your inbox", a word they cannot find on screen:

```sh
vibespace-ask "question or decision needed" [--detail "context + your recommendation"] [--urgency low|normal|high|urgent] [--options "A|B|C"]
```

```sh
vibespace-ask list / vibespace-ask resolve <id|text> / vibespace-ask show <id>
```

The user can reply from the For you tray: that message opens with `[For you reply #<id>]` and quotes your item; an option chip replies with the label itself.

The MOMENT the user answers (in chat or anywhere), resolve the item YOURSELF with `vibespace-ask resolve` — never leave answered items for them to tick. Not for your own working steps — those belong in your normal todo list.

The For you item is a NOTIFICATION MIRROR, not the message itself: everything you file (the question, options, your recommendation) must ALSO appear IN FULL in your chat reply — never say something only in the tray (the user reads and copies from chat; tray rows are hard to read at length).

Whenever you ask the user anything or end a turn waiting on them — file it in their For you tray (bottom right of their screen: say that, never "your inbox") AND write the full question (options + recommendation) in your CHAT REPLY; the tray only notifies, never the sole copy:

Resolve it YOURSELF the moment they answer (chat counts): `vibespace-ask resolve <id>`

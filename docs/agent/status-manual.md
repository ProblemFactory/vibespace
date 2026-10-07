# vibespace-status — full manual

Your session's LIVE state on the user's board (sidebar chips, task board,
fleet views). Set it the MOMENT it changes — a stale state misroutes the
user's attention.

## States

```
vibespace-status working      --reason "one line"
vibespace-status needs-input  --reason "…" --detail "options + your recommendation" --urgency high
vibespace-status blocked      --reason "what blocks you" --detail "what you tried, options" --urgency high
vibespace-status review       --reason "what to review" --detail "where, what to look at" --urgency normal
vibespace-status done         --reason "what finished"
```

- `working` — actively executing. reason = current focus, one line.
- `needs-input` / `blocked` / `review` — WAITING states: `--reason` AND
  `--detail` are both REQUIRED (the detail is what lets the user act without
  re-asking you). Mirror the actual question with `vibespace-ask` too.
- `done` — this piece of work is finished. Set it even if the conversation
  stays open.

`--urgency low|normal|high|urgent` colors the chip and orders attention.

## Semantics worth knowing

- Status is SESSION-scoped (this conversation), independent of Task Groups.
- If the USER overrides your status in the UI, you receive a notice injected
  into your next turn — respect it; don't silently flip it back.
- Rapid flapping is noise: set working once per phase, not per tool call.
- `vibespace-status` with no args prints usage + your current state.

## The end-of-turn reminder

When your state has gone stale, VibeSpace may stop you at the end of a turn
with "VibeSpace bookkeeping before you stop …" — a note from VibeSpace, not
from the user, which the user sees only as a folded grey line. Answer it with
the calls it lists (status first) and then stop: **do not restate your
answer** — the user already has it above — and end with at most one short
line, or nothing. Never tell the user about the bookkeeping itself ("Status is
set to done …" is not news to them).

## The full teaching behind the session intro's pointer line

Every session's first prompt carries ONE line for this tool and points here (2.369.227 — the first prompt context must leave room for notices and messages). These are the words it used to carry in full:

Report your OWN status so the user can see it on their session board — use the `vibespace-status` command (already on your PATH):

```sh
vibespace-status <working|needs-input|blocked|review|done> [--urgency low|normal|high|urgent] [--reason "why"]
```

```sh
vibespace-status show (or run it with no arguments) — prints usage + your current status
```

Keep it honest and current: `working` while making progress; `blocked` or `needs-input` (with a higher urgency) the moment you are stuck or waiting on the user; `review` when you want them to look; `done` when this piece of work is finished.

Your session's live state on the board — set it the MOMENT it changes. Waiting states REQUIRE both flags:

```sh
vibespace-status blocked --reason "what you're waiting on" --detail "context: options, what you tried, your recommendation" --urgency high
```

(states: working | needs-input | blocked | review | done — `done` when this piece of work is finished)

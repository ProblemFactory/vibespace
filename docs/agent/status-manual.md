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

# vibespace-feedback — full manual

Tell the maintainers what felt WRONG about VibeSpace while you worked: a command
whose usage misled you, a flow that took five steps where one should do, a
refusal you could not act on, a manual that was missing the one fact you
needed, a screen the user had to explain to you. One short report per thing.
The user reads every report (⚙ System ▸ Agent feedback…) and the people who
build VibeSpace read them to fix the system.

## Send one

```
vibespace-feedback "what felt wrong, and where" [--about <tool|flow>] [--kind cli|flow|ui|docs|other]
vibespace-feedback --text-file report.txt --about vibespace-task --kind cli
vibespace-feedback --text - --about vibespace-browser <<'TXT'
…a longer or quoted report…
TXT
```

- The report is ONE argument, up to 2000 characters: **what you tried, what
  happened, what you expected**. Name the exact command or screen.
- `--about` (up to 60 characters): the tool (`vibespace-task`) or a word for
  the flow (`group dispatch`, `browser takeover`).
- `--kind`: `cli` (a command's words or behaviour), `flow` (a sequence of
  steps), `ui` (something on the user's screen), `docs` (a manual or the
  teaching), `other` (the default).
- A word after the report is refused (exit 2, nothing sent) — a quote that
  closed early; use `--text-file` or `--text -` (stdin) for quoted text.
- The answer says `sent: N characters` — the server's count of what it kept.

## What happens to it

- It lands on THIS VibeSpace only (data/feedback.json) — nothing is sent
  anywhere else. The user sees it under ⚙ System ▸ Agent feedback… (newest
  first) and marks it handled when it is dealt with — or the maintainer
  conversation does, naming the release that shipped the fix.
- WHO sent it is the server's fact: this conversation's name, its Task Group,
  the harness and the VibeSpace version are added for you — never pass them.
- The same report (same words, same `--about`) seen in the last 24 hours —
  from any conversation — is COUNTED instead of added: the answer says
  `already reported … ×N`. A repeat is useful signal, not noise; still, check
  `vibespace-feedback list` before you send the same thing twice yourself.
- One report per 10 seconds from a conversation (`paced` names the wait).
- The list keeps the 500 most recent reports.

## Your own reports

```
vibespace-feedback list
```

Prints the reports this conversation sent (or repeated): id, time, kind ·
about, `open` / `handled` (`handled in 2.369.NNN` when the release that fixed
it was named), `×N` when it was reported more than once, and the text. `vibespace-feedback` with no arguments prints the usage and this list.

## When NOT to use it

- A question the user must answer → `vibespace-ask` (their For you tray).
- Your own progress → `vibespace-task progress`; your state → `vibespace-status`.
- A bug in the user's own project → tell the user in chat.

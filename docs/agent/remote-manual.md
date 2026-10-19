# What VibeSpace did on its machines — `vibespace-remote`

Every act this VibeSpace takes ON a paired machine — a command, a file written or removed, a secret placed,
keys typed, a connection to another host on that machine's network, a new device agent pushed — is ONE
audit line, kept on both ends (this VibeSpace's `data/device-audit.jsonl` and the machine's own
`state/acts.log`). Each line names WHO asked:

- `human:<a sign-in>` — the user, from a browser they are signed in with;
- `agent:<conversation>` — a conversation (yours, when you ran `vibespace-exit run`, opened a session there…);
- `job:<id>` — a Background Work job;
- `system:<module>` — VibeSpace's own upkeep (a usage harvest, a mount check, an agent update).

## The verb

```
vibespace-remote audit [--since <dur>] [--machine <m>] [--by <subject>] [--limit N]
```

Lists the acts **you** (this conversation) asked for, newest first:
`when · machine · op · what · verdict · duration · (by …)`. "What" is a bounded summary — the command's
argv head, a path, a size — never a secret, a file's bytes, typed keys or a message's text (their size
only); an output head (≤ 200 bytes, secrets redacted) follows on its own line.

- `--since 90s | 15m | 2h | 3d` — only the recent ones.
- `--machine <id|name>` — one machine.
- `--by <subject>` — your own subject only. Another subject's acts are the **user's** to read: the
  machine card's **Activity…** (Manage agents → Machines) shows every line; asking here for another
  subject is refused `human_only` (exit 3).
- `--limit N` — at most N lines (default 50, at most 500).

A line `refused (no "by" — never sent)` is an act the hub refused to send because nobody was named
for it — say so to the user if you see one.

## What reaches the user without asking

Three events are URGENT For-you items for the user (never for you): a new pairing command minted, a
machine dialing in from an address it never used, and a device agent update pushed to a machine.

# vibespace-vault — the vault's state and its lock

Every credential this VibeSpace stores (API keys, OAuth tokens, mount secrets, channel tokens, app logins, passkeys) is
sealed under ONE vault key, and only the user's **second password** opens it. After every restart the vault is **locked**
until the user unlocks it from the page; while locked, anything that needs a stored credential refuses by name
(`vault_locked`) — nothing is read, nothing is made.

```
vibespace-vault [status]   the state: unlocked / locked / not set up
vibespace-vault lock       lock it now
vibespace-vault totp <name> [--json]   a two-step code the user granted you: the code + its seconds left
```

- **status** — `unlocked` (stored credentials open), `LOCKED` (they stay sealed until the user unlocks), or `not set up`
  (the user has not chosen a second password yet; ⚙ System ▸ Vault…).
- **lock** — locks at once: the key in memory is zeroed. Use it when you suspect a leak or finish a task that should not
  leave credentials open. Connections that are already running keep what they hold until they reconnect.

- **totp <name>** — the CURRENT two-step (TOTP) code the vault keeps under `<name>`, e.g. `492118 (17 s left)` (`--json`:
  `{name, code, secondsLeft, period}`), when the user granted that code to this conversation or to its task group (Vault
  window ▸ 用于…). A code works once and dies when its seconds run out: type it at once, and with fewer than 5 s left wait
  for the next one. You never get the SEED (the secret the codes come from) — not here, not anywhere. Not granted ⇒
  `not_granted`: tell the user which code you need and why, and wait; a conversation that ended and came back needs a
  new grant. Every answer is in the vault's audit.

**Never ask the user for the second password, and never try to unlock, set up or change the vault** — those are the
user's own doors on the page (an agent token is refused `human_only`).

**When a tool you need says the vault is locked (`vault_locked`), the user has already been told** — VibeSpace notes
every refusal and their For you tray names who was stopped and what (this conversation included), with an Unlock
button. Do not ask them to unlock it, do not file a `vibespace-ask` about it and do not repeat it in chat: wait, or do
other work, and try the tool again later.

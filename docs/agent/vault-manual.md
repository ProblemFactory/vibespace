# vibespace-vault — the vault's state and its lock

Every credential this VibeSpace stores (API keys, OAuth tokens, mount secrets, channel tokens, app logins, passkeys) is
sealed under ONE vault key, and only the user's **second password** opens it. After every restart the vault is **locked**
until the user unlocks it from the page; while locked, anything that needs a stored credential refuses by name
(`vault_locked`) — nothing is read, nothing is made.

```
vibespace-vault [status]   the state: unlocked / locked / not set up
vibespace-vault lock       lock it now
```

- **status** — `unlocked` (stored credentials open), `LOCKED` (they stay sealed until the user unlocks), or `not set up`
  (the user has not chosen a second password yet; ⚙ System ▸ Vault…).
- **lock** — locks at once: the key in memory is zeroed. Use it when you suspect a leak or finish a task that should not
  leave credentials open. Connections that are already running keep what they hold until they reconnect.

**Never ask the user for the second password, and never try to unlock, set up or change the vault** — those are the
user's own doors on the page (an agent token is refused `human_only`). When a tool you need says the vault is locked,
tell the user and wait; `vibespace-ask` is the way to ask them to unlock.

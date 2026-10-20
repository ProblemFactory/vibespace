# vibespace-vault — the vault's state, its lock, and your own secrets

Every credential this VibeSpace stores (API keys, OAuth tokens, mount secrets, channel tokens, app logins, passkeys) is
sealed under ONE vault key, and only the user's **second password** opens it. After every restart the vault is **locked**
until the user unlocks it from the page; while locked, anything that needs a stored credential refuses by name
(`vault_locked`) — nothing is read, nothing is made.

```
vibespace-vault [status]   the state: unlocked / locked / not set up
vibespace-vault lock       lock it now
vibespace-vault list       the stored secrets the user opened for runs — a reference each, never a value
vibespace-vault run [--env NAME=vault://…]… [--file NAME=vault://…|@<template>]… [--stdin vault://…] [--timeout <s>] -- <command…>
vibespace-vault totp <name> [--json]   a two-step code the user granted you: the code + its seconds left
  vibespace-vault mint <name> [--length 24] [--charset ascii-printable|alnum|digits] [--for <host/service>]   the hub makes a random secret and seals it — you never see it
  vibespace-vault put <name> --from-file <0600 file> | --stdin   seal a value you ALREADY have (never on the command line)
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

## Using a stored secret in a command — `vibespace-vault run`

You never see a stored value. You write a **reference** where it goes; the hub puts the value into the command it starts
for you and hands you back the output with the value blanked to `[vault:<store>/<row>/<field>]`.

- **References**: `vault://<store>/<row>/<field>` — `vibespace-vault list` prints the ones you may use (the user opens each
  one for agent runs in ⚙ System ▸ Vault…, «Usable by agent runs»; off by default — if what you need is not listed, ask the
  user in the chat). In a template file the same reference is `$VAULT{<store>/<row>/<field>}`. A secret your own
  conversation minted or stored is `vault://agent:<scope>/<name>` — only your conversation may use it, once the user opens it.
- **How the value reaches the command** (never its command line — every user of the machine can read that):
  - `--env GH_TOKEN=vault://…` — an environment variable (the usual way: gh, aws, psql's PGPASSWORD, rclone);
  - `--file KEY=vault://…` — a 0600 file, its PATH in `$KEY`; `$VAULT_FILE{KEY}` (or `$VAULT_FILE{<store>/<row>/<field>}`)
    in the command is that path: `ssh -i '$VAULT_FILE{KEY}' host`, `curl -K '$VAULT_FILE{CFG}' https://…`;
  - `--file CFG=@./curl.cfg` — a TEMPLATE you wrote (in the project, the temp folder or ~/Downloads) whose `$VAULT{…}` are
    filled in: `.npmrc`, a kubeconfig, a `my.cnf`, a curl config with a header;
  - `--stdin vault://…` — the value and a newline on stdin (`docker login --password-stdin`, `gh auth login --with-token`).
  Quote `$VAULT_FILE{…}` so your own shell leaves it alone. The file is shredded when the command ends.
- **The user decides each new command SHAPE** (the tool, its flags, the hosts, the secrets — file names and other
  positional words may change): an urgent card in their For you — 允许一次 / 此形状总是 / 拒绝. On a shared (cluster)
  instance every run asks unless they chose «always»; on their own machine a shape they allowed once runs again without
  asking until the vault locks. The call waits up to 60 s for the answer — `ask_denied`, `ask_expired` and friends mean
  nothing ran.
- **Refused by name, before anything runs**: a reference on the command line (`argv_refused`); a tool that prints,
  transforms, packs, copies or traces what it reads (`cat`, `echo`, `env`, `base64`, `xxd`, `tar`, `openssl`, `cp`, `tee`,
  `strace` …: `tool_prints_secrets`); a wrapper (`sudo`, `xargs`, `timeout`, `nohup` …: `tool_wraps_another`); VibeSpace's
  own CLIs; env names that change what the tool loads or obeys (`LD_PRELOAD`, `NODE_OPTIONS`, `GIT_SSH_COMMAND`, `PATH`,
  a proxy …: `env_refused`); a value under 8 bytes; a login, pairing, channel or passkey entry — they have their own doors.
  A shell or an interpreter (`bash -c …`, `python script.py`) may run, but its whole command line is its shape and it is
  never «always».
- **It runs on this instance**, in your folder (the project, the temp folder or ~/Downloads), 120 s by default
  (`--timeout`, ≤ 600 s), output ≤ 2 MiB; the exit code is the command's. When it ends, anything it left running ends
  too. A remote conversation and `--on` are not here yet. Each run prints a receipt (the user's record carries the same).
- **The vault locks while it runs ⇒ the command is stopped** and you get `vault_locked` — the user was told; wait.
- **The scrubber is a sieve, not a wall**: it blanks the value as itself, base64, URL-encoded, JSON-escaped and hex in the
  output. Never try to get around it — do not write the value into a file and read it back, do not transform it, do not
  send it anywhere the user did not see on the card. Every run is recorded (the command, the secrets it used, what came of
  it — never the value).

## Your own secrets — `mint` and `put` (design q-043 §9)

You can put a secret into the vault **in your own namespace** — entries named `agent:<this conversation>/<name>`. You choose
only the short `<name>` (letters, digits, `.` `_` `-`); VibeSpace adds the conversation scope for you, so you can never write
into another conversation's namespace. Creating an entry needs no approval from the user (it costs nothing and leaks nothing).

- **mint `<name>`** — the **hub** generates a random value and seals it. You get back only the entry name and a `vault://`
  reference; **you never see the value.** Use it when something needs a secret you do not need to read yourself — registering
  an account, setting a service password, generating a token. Pick the charset and length for the target site
  (`--charset ascii-printable|alnum|digits`, `--length` 8–256, default 24 printable ASCII). The user can reveal the value in
  ⚙ System ▸ Vault… behind the second password (it is meant to be typed somewhere). Provenance: *agent minted · never shown.*
- **put `<name>`** — seal a value you **already have** (a key a vendor page handed you). The value rides a **0600 file**
  (`--from-file`) or **stdin** (`--stdin`) — **never the command line** (argv is readable, and the vault refuses a value sent
  any other way). Provenance: *agent stored · the agent saw the plaintext* — the copy in this transcript is **not** protected,
  so rotate the value when you can; the Vault window says so too.

**What you never get:** the value of anything in the vault. `mint` never returns it; there is no command to read a stored
value back. Using a secret (filling a form, running a command with it) is a separate, later capability — not `mint`/`put`.
Both refuse a **locked** vault by name (`vault_locked`): wait or do other work, exactly as for `status` above — never ask the
user to unlock it.

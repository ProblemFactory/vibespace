# vibespace-vault — what you can do with the vault, and what you never get

Every credential this VibeSpace stores (API keys, OAuth tokens, mount secrets, channel tokens, app logins, passkeys,
two-step seeds) is sealed under ONE vault key that only the user's **second password** opens. After every restart the
vault is **locked** until the user unlocks it on this instance's page.

**What you never get: a value.** No verb, route or message hands an agent a stored value, a two-step seed or a key —
there is no `vibespace-vault get`, and there never will be. You get a **use** (the hub does the thing with the value)
and a **receipt** (`vr-…`, the same one the user's record carries). **Never ask the user for the second password, and
never try to unlock, set up or change the vault** — those are the user's own doors on the page (an agent is refused
`human_only`). **Everything you print is kept** (the transcript, progress lines, For-you details, messages): never write a
credential into any of them.

```
vibespace-vault [status]            the state: unlocked / LOCKED / not set up
vibespace-vault lock                lock it now (a suspected leak, the end of a sensitive task)
vibespace-vault totp <name>         the CURRENT two-step code of an entry the user granted this conversation — never its seed
vibespace-vault mint <name> [--length 24] [--charset ascii-printable|alnum|digits] [--for <host/service>]
                                    the HUB makes a random secret in YOUR namespace and seals it — you never see it
vibespace-vault put <name> --from-file <0600 file> | --stdin
                                    seal a value you ALREADY have (never on the command line)
vibespace-vault run [--env NAME=vault://…]… [--file NAME=vault://…|@<template>]… [--stdin vault://…] [--timeout <s>] -- <command…>
                                    run a command with a stored secret you never see
vibespace-vault list                what you may use in a run: entries the user opened for runs, or granted to you
vibespace-vault request <vault://…> --for "<purpose>"
                                    ask the user for an entry, with what you will run with it
vibespace-vault request "<what you need>" --purpose "<why>" [--into <row>.<field> | --kind api-key|password|secret] [--name <label>] [--host <h>[,<h>…]]
                                    ask the user to PASTE a secret you do not have — a masked box in their For you tray
vibespace-vault uses                your grants, your open requests, your own uses (entry, purpose, when, outcome, receipt)
```

## When the vault is locked

**When a tool you need says the vault is locked (`vault_locked`), the user has already been told** — VibeSpace notes every
refusal itself, and their For you tray names who was stopped and what (this conversation included), with an Unlock button;
a person unlocks it on this instance's page. Do not ask them to unlock it, do not file a `vibespace-ask` about it and do
not repeat it in chat: wait, or do other work, and try the tool again later. Every vault door says it in the same words:
*the vault is locked — a person unlocks it on this instance's page; the user has already been told (their For you tray
names what is waiting on it) — do not ask them to unlock it or for its password: wait, or do other work, and try again
later.*

A lock — by the user, by an agent's `vibespace-vault lock`, or by the idle timer — **ends at once**: every grant an answer
gave you (once / 8 hours), every request still waiting in For you (withdrawn `vault_locked`), every run card waiting, every
`vibespace-vault run` still running (stopped; you get `vault_locked`), and the user's own window that shows stored values.
Ask again after the unlock.

## Namespaces — what a reference may name

- `vault://<store>/<row>/<field>` — the user's stored secrets that a run may use: storage secrets (a mount's keys) and app
  logins. `vibespace-vault list` prints the ones you may use. Each is **closed for runs until the user opens it** (⚙ System
  ▸ Vault…, the row's «Usable by agent runs» — for every conversation) **or answers your `request`** (for yours alone).
- `vault://agent:<scope>/<name>` — YOUR OWN entries (`mint` / `put`): the scope is this conversation, added by the hub; you
  choose only `<name>` (letters, digits, `.` `_` `-`). Another conversation's own entry is never yours (`use_not_granted`).
- **Never referenced by a run**: sign-in and login tokens, machine pairing tokens, channel tokens, passkeys, automation
  keys, the stores' own keys — each has its own door (`entry_has_its_own_door` names it).

## Asking for an entry — `request` and `uses`

When a run answers `entry_not_runnable` (closed) or `use_not_granted`, ask the user — once, with the purpose:

    vibespace-vault request vault://mounts/backup/secretKey --for "upload tonight's backup to the bucket"

That files **one** question in the user's For you tray: «<this conversation> asks to use a stored secret», the entry (its
label and reference) and your purpose in your words (a value pasted into it is «redacted»). **Nothing waits on it** and it
never expires; do other work. A second request for the same entry while one is open answers `request_pending`; after a
Deny, the same entry answers `request_quiet` for 10 minutes. The user answers **Allow once** (your next run with it,
within 8 hours), **For 8 hours** (every run with it for 8 hours) — both ask them for the second password, as opening the
entry does — or **Deny**.
A grant opens the entry for this conversation the way «Usable by agent runs» opens it for everyone: each NEW kind of
command still shows the user its run card first. A lock ends every grant.

`vibespace-vault uses` prints what you hold now and what you did: your live grants (entry, purpose, until), your requests
still waiting, and your own uses newest first — entry, purpose, when, door, outcome, receipt. Never a value; never another
conversation's.

## A secret you do not have — `request "<what>"` (the paste box)

Never ask for a password or a key in the chat. Ask the user to paste it into the vault:

    vibespace-vault request "the OpenAI key for the judged rules" --purpose "judge your notification rules" --into llm.apiKey
    vibespace-vault request "the sandbox's admin password" --purpose "log in to the sandbox and reset the demo data" --kind password --name "Sandbox admin"

That files **one** item in the user's For you tray — what you need (your words), what for, and WHERE it goes — with a
masked box, 「存入保险库」 and 「拒绝」. `--into <row>.<field>` names an Integrations card's secret field (`llm.apiKey`,
`dropline.apiKey`, `cloud:browserbase.apiKey` …; VibeSpace uses it there itself); without it the value becomes a NEW vault
entry of `--kind` (api-key · password · secret, default secret) labelled `--name` (default: your words). The CLI answers the
request id; **nothing waits on it** — do other work. At your next turn you read the receipt: **STORED** and where (a field
id, or the entry's `vault://secrets/secret:<id>/secret` — which this conversation may use in `run` for 8 hours: the user's
paste is the grant), **REFUSED** (do not ask again for 10 minutes), or **WITHDRAWN** (the user locked the vault — ask again
once it is unlocked). You never see the value. The same place asked twice while one is open answers the same id; at most 4
open per conversation. `vibespace-vault uses` lists your paste boxes still waiting.

**Name where you will use it** — `--host 192.168.1.1` (host names or addresses, comma-separated, at most 8; never a
wildcard): the request box then tells the user that THIS conversation may use the new entry in commands to those hosts for
**8 hours** (unless they turned that off), and after the paste your receipt says so. Within those 8 hours, commands to those
hosts run — a new KIND of command still shows its card, another host still shows its card, and a vault lock ends the grant.
A paste always makes a NEW entry (the same label gives a new id). If the user turned the setting off, the paste grants
nothing: your receipt tells you to `request` the secret, and the user opens the entry in the Vault window. `vibespace-vault
list` shows an entry you may use as yours «with no card for <hosts>».

## Using a stored secret in a command — `run`

You write a **reference** where the value goes; the hub puts the value into the command it starts for you and hands you
back the output with the value blanked to `[vault:<store>/<row>/<field>]`.

**No card each time** when the user gave this conversation a **standing approval** for the entry and the hosts your command
reaches (the Vault window's «Who may use it…», or their «Always» on an earlier card — `vibespace-vault list` says «with no
card for <hosts>»), or — if they turned it on — when their **policy judge** finds the command inside the policy they wrote
for the entry. The answer then says `by: grant` / `by: policy`. Another host, or a command whose destination cannot be told
(a shell, an interpreter, a config file), still shows them its card.

- **How the value reaches the command** (never its command line — every user of the machine can read that):
  - `--env GH_TOKEN=vault://…` — an environment variable (the usual way: gh, aws, psql's PGPASSWORD, rclone);
  - `--file KEY=vault://…` — a 0600 file, its PATH in `$KEY`; `$VAULT_FILE{KEY}` (or `$VAULT_FILE{<store>/<row>/<field>}`)
    in the command is that path: `ssh -i '$VAULT_FILE{KEY}' host`, `curl -K '$VAULT_FILE{CFG}' https://…`;
  - `--file CFG=@./curl.cfg` — a TEMPLATE you wrote (in the project, the temp folder or ~/Downloads) whose `$VAULT{…}` are
    filled in: `.npmrc`, a kubeconfig, a `my.cnf`, a curl config with a header;
  - `--stdin vault://…` — the value and a newline on stdin (`docker login --password-stdin`, `gh auth login --with-token`).
  Quote `$VAULT_FILE{…}` so your own shell leaves it alone. The file is shredded when the command ends.
- **The run card — the user decides each new command SHAPE**: an urgent For-you card «<this conversation> wants to run a
  command with a stored secret» showing the whole command (references, never values), the program that runs, the secrets
  and how each is given, the hosts, the folder — **Allow once / Always for this shape / Deny** (允许一次 / 此形状总是 / 拒绝).
  *This shape = the tool + its flags + the hosts + the entries; positional arguments may change.* On a shared (cluster)
  instance every run asks unless the user chose «always»; on their own machine a shape allowed once runs again without
  asking until the vault locks. «Always» is not offered for a shell, an interpreter, a tool whose destination is unknown,
  or a program an agent could have written. The call waits up to 60 s for the answer.
- **Refused by name, before anything runs**: a reference on the command line (`argv_refused`); a tool that prints,
  transforms, packs, copies or traces what it reads (`cat`, `echo`, `env`, `base64`, `xxd`, `tar`, `openssl`, `cp`, `tee`,
  `strace` …: `tool_prints_secrets`); a wrapper (`sudo`, `xargs`, `timeout`, `nohup` …: `tool_wraps_another`); VibeSpace's
  own CLIs; env names that change what the tool loads or obeys (`LD_PRELOAD`, `NODE_OPTIONS`, `GIT_SSH_COMMAND`, `PATH`, a
  proxy …: `env_refused`); a value under 8 bytes (`entry_too_short_to_mask`).
- **It runs on this instance**, in your folder (the project, the temp folder or ~/Downloads), 120 s by default
  (`--timeout`, ≤ 600 s), output ≤ 2 MiB; the exit code is the command's. When it ends, anything it left running ends
  too. A remote conversation and `--on` are not here yet (`device_road_later`).
- **The scrubber is a sieve, not a wall**: the output is scrubbed of the value's common spellings; a command that
  re-encodes it can still show it — the owner sees the whole command before it runs. (The spellings: itself, base64,
  base32, URL-encoded, JSON-, HTML- or backslash-escaped, hex, UTF-16, quoted-printable, coloured or wrapped. A part of a
  value is never blanked; a value under 8 bytes is never used at all.) Never try to get around it — do not write the
  value into a file and read it back, do not transform it, do not send it anywhere the user did not see on the card. Every run is recorded (the command, the secrets it used, what came
  of it — never the value).

## Your own secrets — `mint` and `put`

- **mint `<name>`** — the **hub** generates a random value and seals it as `agent:<this conversation>/<name>`. You get back
  only the name and a `vault://` reference; **you never see the value.** For registering an account, setting a service
  password, generating a token. Pick the charset and length for the target (`--charset ascii-printable|alnum|digits`,
  `--length` 8–256, default 24 printable ASCII). The user can reveal it in ⚙ System ▸ Vault… behind the second password.
  Provenance: *agent minted · never shown.*
- **put `<name>`** — seal a value you **already have** (a key a vendor page handed you). It rides a **0600 file**
  (`--from-file`) or **stdin** (`--stdin`) — **never the command line** (`value_in_argv`). Provenance: *agent stored · the
  agent saw the plaintext* — the copy in this transcript is **not** protected, so rotate the value when you can.

Creating needs no approval (it costs nothing and leaks nothing); USING your own entry in a run follows the rules above.

## Every refusal and the door the user uses

| Code | What it means | The user's door |
|---|---|---|
| `vault_locked` | the vault is locked; the user has already been told | Unlock… at the top of the page (the second password) — wait |
| `vault_not_set_up` | no second password yet — nothing is sealed | ⚙ System ▸ Vault… (set it up) |
| `human_only` | a person's door (unlock, set up, change, show a value, open for runs, answer a card) | the page |
| `entry_not_runnable` | the entry is closed for runs | the Vault window row's «Usable by agent runs» — or your `request` in For you |
| `use_not_granted` | this conversation may not use it (another conversation's own entry, or a grant that ended) | your `request` in For you |
| `entry_has_its_own_door` | a sign-in / pairing / channel token, a passkey, a key | the door the answer names (Channels panel, Accounts…) |
| `entry_unknown` | no such entry (any more) | — (`vibespace-vault list`) |
| `request_pending` · `request_quiet` | you already asked for that entry / the user said no a moment ago (10 minutes) | For you (the open question) |
| `ask_pending` · `ask_denied` · `ask_expired` · `ask_unfiled` · `ask_changed` | the run card waits / said no / got no answer in 60 s / could not be filed / changed after it was shown — nothing ran | For you (the run card) |
| `not_granted` (totp) | the user has not granted this two-step code to this conversation | the Vault window ▸ the code's 用于… |
| `argv_refused` · `tool_prints_secrets` · `tool_wraps_another` · `env_refused` · `entry_too_short_to_mask` · `cwd_refused` | the run's plan is refused | — (change the command) |
| `job_no_use` | a Background Work job never uses a stored secret | run it from the conversation |
| `device_road_later` | a run on a paired machine is not here yet | — |
| `too_many_runs` · `too_many_requests` · `too_many_askers` | too many at once (4 runs, or 8 open requests, per conversation; 32 conversations asking at once) | — (wait) |
| `bad_name` · `value_in_argv` · `bad_length` · `bad_charset` | mint / put's own words | — |

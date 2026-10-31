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
vibespace-vault totp <name>         the CURRENT two-step code of an entry you added (totp add) or the user granted you — never its seed
vibespace-vault totp add <name> --from-file <0600 file> | --stdin
                                    store a two-step seed you hold (the otpauth:// link or the seed) as a two-step entry
vibespace-vault login add <origin> --user <name> --from-file <0600 file> | --stdin [--totp <name>]
                                    store a website login you hold (its password) — the browser kernel fills it
vibespace-vault mint <name> [--length 24] [--charset ascii-printable|alnum|digits] [--for <host/service>]
                                    the HUB makes a random secret in YOUR namespace and seals it — you never see it
vibespace-vault put <name> --from-file <0600 file> | --stdin
                                    seal a value you ALREADY have (never on the command line)
vibespace-vault run [--env NAME=vault://…]… [--file NAME=vault://…|@<template>]… [--stdin vault://…] [--timeout <s>] -- <command…>
                                    run a command with a stored secret you never see
vibespace-vault list                what you may use in a run: your own entries, entries the user opened for runs or granted to you
vibespace-vault request <vault://…> --for "<purpose>"
                                    ask the user for an entry, with what you will run with it
vibespace-vault request <vault://…> --standing --for "<purpose>" [--host <h>[,<h>…] [--tool <cli>]] [--command "<program> [options] <script>"]
                                    ask ONCE for a STANDING grant — the same as the user setting «Who may use it…» on its row
vibespace-vault request "<what you need>" --purpose "<why>" [--into <row>.<field> | --kind api-key|password|secret] [--name <label>] [--host <h>[,<h>…]]
                                    ask the user to PASTE a secret you do not have — a masked box in their For you tray
vibespace-vault uses                your grants (standing ones too), your open requests, your own uses (entry, purpose, when, outcome, receipt)
```

## When a run card goes unanswered

If the user does not answer your run card within its minute, your `vibespace-vault run` is refused `ask_expired` — but the card does **not** disappear. It stays in their For you tray as a *late* card for 24 hours, and if they allow it late, **your next run of that exact command passes once** with no new card (round 23: the pass is for THAT command — a different command, even of the same program, draws its own card); then it is spent — run it again and a fresh card appears. So on `ask_expired`, do not re-file a `vibespace-ask` or nag in chat: do other work and simply run the same command again later — a late allow will let that next run through. A late deny, a lock, or the 24 hours ends it.

If the same command will run many times (a loop over 40 files), the refusal — and a run the user let through once (`# vibespace-vault run: …` on stderr) — names the better road: **ask once for a standing grant** (next section). One card instead of forty.

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
  choose only `<name>` (letters, digits, `.` `_` `-`). **Yours to use with no switch, no grant and no card** — this
  conversation runs with them without asking anyone (it keeps them if it ends and comes back). Another conversation's own
  entry is never yours (`use_not_granted`).
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

`vibespace-vault uses` prints what you hold now and what you did: your live grants (entry, purpose, until), your standing
grants («standing · <scope> · since <when>»), your requests still waiting, and your own uses newest first — entry, purpose,
when, door, outcome, receipt, and «by grant · standing vg-…» when a standing grant let it through. Never a value; never
another conversation's.

## Asking ONCE for a standing grant — `request --standing`

When you will use an entry again and again (a script over many files, a deploy you run every hour), ask the user ONCE for
exactly the standing permission they would otherwise configure by hand on the entry's row («Who may use it…»):

    vibespace-vault request vault://app-secrets/tts/apiKey --standing --host api.tts.example --for "call the TTS API for the narration"
    vibespace-vault request vault://app-secrets/tts/apiKey --standing --command "python3 transcribe.py" --for "transcribe the 40 interview segments"

- `--host` — where your commands **connect** with it (a host name or address, e.g. `api.openai.com`, `192.168.1.1`; never «any
  host»). Use it for a tool whose destination VibeSpace reads from the command (curl, gh, ssh, psql …). A **wildcard** host
  (`*.example.com`) is for ONE tool — name it: `--host '*.example.com' --tool curl` (without `--tool` it is refused
  `tool_required`, with this very recipe); the grant then covers that tool only.
- `--command "<program> [options] <script>"` — for a program whose destination VibeSpace **cannot** read: a shell or an
  interpreter running a SCRIPT FILE (`python3 transcribe.py`, `python3 -u transcribe.py`, `node upload.js`, `bash sync.sh`,
  `deno run -A main.ts`, `dotnet app.dll`). Name it as you run it, up to and including the script, from the folder you run it
  in — the hub resolves the program on your PATH and pins every word up to the script plus the script's real path and the
  sha256 of its bytes. What follows the script is free (`part01.mp3`, `part02.mp3` …). Only the options the interpreter's
  pin grammar names are pinned; **inline code or a module run is never pinned** (`-c`, `-e`, `--eval`, `eval`, `-m`, `-r`
  …: `command_not_pinnable` — «write the code to a file and run that»), nor an option the grammar does not know, code on
  stdin, a file that is not that interpreter's script, `bun` / `pwsh` / `cmd`, or a program outside the shell and
  interpreter tables (it may run code its arguments name — run a script through its interpreter, or ask with `--host`).
  A word with a URI scheme is a module the interpreter resolves itself, never a file (`deno run npm:pkg/main.ts`,
  `jsr:`, `file:`, `data:`: `why: 'specifier'`); a shell script is named by its path (`bash ./sync.sh`, not `bash sync.sh`
  — a bare name may be looked up on PATH: `why: 'path-search'`).
  A known tool asks with `--host` (`command_has_hosts`). **If you change the script (or the program, or its options), it
  is a new command** — its next run shows the user a card again.

That files **one** card: «<this conversation> asks for a standing grant on a stored secret» with your purpose, the scope
(«for commands to api.tts.example» / «for the command python3 transcribe.py — VibeSpace cannot see where it sends the
secret; Allow means you trust this command itself») and «until you revoke it». Nothing waits on it. The user answers
**Allow (standing)** (with the second password) or **Deny** (every ask you make for that entry — standing or plain, any
scope — is then quiet for 10 minutes: `request_quiet`; ask once after it, with the scope you want). Their Allow is the
entry's own row: it has no end and a lock does not end it (a locked vault runs nothing; once unlocked, your runs go on with
no card); they see it on the row — «agent 申请 · 11:46» — and ✕ takes it back. The same scope is asked once while open
(`request_pending`); one you already hold answers that you hold it (`already: 'timed'` + its end when what you hold is
time-limited). Each host and each command you hold carries ITS OWN end: a standing grant or a card's «Always» (30 days)
adds the host or command it names and never touches the others; it replaces only the SAME host or command when you hold it
with another end (or its grant ended) — and the user's card says so. If what a card would write changed after the user saw
it, their answer writes nothing: the card is drawn again with the new words (`ask_redrawn`) and they answer again. `list`
and `uses` show it «standing · <scope> · since <when>», each host and command with its own end («hosts a.example (until …),
b.example»). A run outside the scope (another host, another script, another program) still shows its card — and that card's
**«Always (this command)»** (offered where VibeSpace cannot read the destination) writes the same kind of grant from the
user's side.

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
**8 hours** (unless they turned that off), and after the paste your receipt says so. Within those 8 hours, a command TOWARD
those hosts runs with no card; a command to ANY OTHER host still shows the user its card, and a vault lock ends the grant.
Name no host and the grant admits nothing — every command shows the user its card. A paste always makes a NEW entry (the same
label gives a new id). If the user turned the setting off, the paste grants nothing: your receipt tells you to `request` the
secret, and the user opens the entry in the Vault window. `vibespace-vault
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
  asking until the vault locks. **Your own entries draw no card** (see «Your own secrets» below); a card that does come
  says who stored each secret and why it asks. «Always» is not offered for a shell, an interpreter, a tool whose destination is unknown,
  or a program an agent could have written. The call waits up to 60 s for the answer.
- **Refused by name, before anything runs**: a reference on the command line (`argv_refused`); a tool that prints,
  transforms, packs, copies or traces what it reads (`cat`, `echo`, `env`, `base64`, `xxd`, `tar`, `openssl`, `cp`, `tee`,
  `strace` …: `tool_prints_secrets`); a wrapper (`sudo`, `xargs`, `timeout`, `nohup` …: `tool_wraps_another`); VibeSpace's
  own CLIs; env names that change what the tool loads or obeys (`LD_PRELOAD`, `NODE_OPTIONS`, `GIT_SSH_COMMAND`, `PATH`, a
  proxy, an interpreter's own startup-code variable — `LUA_INIT`, `PHPRC`, `DOTNET_STARTUP_HOOKS`, `R_PROFILE_USER`,
  `JULIA_DEPOT_PATH`, `PYTHONWARNINGS` …: `env_refused`); a value under 8 bytes (`entry_too_short_to_mask`).
- **It runs on this instance**, in your folder (the project, the temp folder or ~/Downloads), 120 s by default
  (`--timeout`, ≤ 600 s), output ≤ 2 MiB; the exit code is the command's. When it ends, anything it left running ends
  too. A remote conversation and `--on` are not here yet (`device_road_later`).
- **The output scrubber replaces the VALUES you injected, never a field by its name, and never cuts the output** (round 21): it blanks each injected value and its common encodings (raw, base64, hex, URL, JSON-escaped, UTF-16, …) to `[vault:<store>/<row>/<field>]` wherever they appear — a JSON field the tool returns that happens to be named `key` / `auth` / `token` is the tool's own data and is left alone (it is not a secret unless its VALUE is one you injected), and the whole output arrives (a value cut off by the 2 MiB bound, a timeout or a lock shows a `[vault:…]` placeholder only over the trailing bytes that could be a half value — clean output at a cut arrives clean, never a dropped byte; round 23).
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

Creating needs no approval (it costs nothing and leaks nothing), and neither does USING your own entry: `run` with it asks
nobody — no switch, no grant, no card (`list` names it «yours»; `request` for it answers that it is yours). The ONE question
left is for a **minted** value: a run that sends it to a host other than the one you minted it `--for` (or to any host,
without `--for`) shows the user ONE card naming both hosts; once allowed, that host is asked no more until the vault locks.
A command whose destination cannot be told asks too: a shell, an interpreter, a config file, a routing flag, the project's
own code, a client's shell escape (`psql -c '\! …'`, `psql -f <file>`, `mysql -e 'system …'`) — and a known tool naming no host the vault can read (`curl -s` with no address, `psql` over a service or
`PGSERVICE`, `rclone remote:`, `git push origin`, `kubectl` on its kubeconfig): every tool the vault knows reaches the
network, so «no host read» is not «no host». It asks ONCE per command shape on the user's own machine and EVERY run on a
shared (cluster) instance, unless the user chose «Always for this shape» (where offered, behind the second password). A host
written without `https://` (`curl api.example.com`), in a connection string (`psql "host=…"`), attached (`-hdb.example.com`)
or in a host list (`postgresql://a,b/db`) is read like any other. So name the host, in the tool itself:
`curl https://<its host>/…`, `psql -h <its host>` — never a script. Every use is still recorded (`uses`), scrubbed and refused
by the same tables.

## A Background Work job that needs a secret — `vibespace-job run … --vault`

A job that runs after this conversation (a bot, a sync, a cron) needs its key at EVERY start — after a crash, after VibeSpace restarts, at each fire. Declare it when you create the job; the hub hands it over each time:

```
vibespace-job run "python3 bot.py" --name tg-bot --keep-up --vault TG_TOKEN=vault://agent:<this conversation>/tg-token
```

- `--vault NAME=vault://…` — up to 8 per job; NAME is upper case (`^[A-Z][A-Z0-9_]{0,63}$`). The job's record and `vibespace-job show` keep the REFERENCE, never the value.
- **Which entries:** your OWN entry (what `put` / `mint` made in this conversation) or a key the user stored for agents (`vault://secrets/secret:<id>/secret`). Another conversation's entry is refused `use_not_granted`; a sign-in, a pairing, a channel or a store key `entry_not_for_jobs`.
- **Who approves — what works in THIS version:** a value you PUT (you saw it) needs nobody — the job starts at once. A value the hub MINTED, or a key the user stored, needs the user's approval of THIS job (once per job, never per start), and **the approval card arrives in a later update: in this version nothing can approve it, so such a job waits and does not start.** To run now, store the key as this conversation's own entry (`vibespace-vault put <name> --stdin`) and reference `vault://agent:<this conversation>/<name>` — `put` takes the key in hand, so a minted value (you never saw it) cannot be put.
- **What the CLI says:** a job that waits is never «started» — `run` and `start` print `waiting: … NOT started — <what it waits for and the door>` first (exit 0: the job exists; `show` / `poll` say the same), and a schedule whose fires would wait prints `scheduled: … — but each fire's run WAITS`.
- **How the job reads it:** its env holds only `TG_TOKEN_FD=4` (the first value fd 4, the next 5 …). Read that fd ONCE, early:
  - python: `token = open(int(os.environ["TG_TOKEN_FD"]), "rb").read().decode()`
  - sh: `TOKEN=$(cat <&4)` (the number `$TG_TOKEN_FD` names)
  - node: `const token = require('fs').readFileSync(Number(process.env.TG_TOKEN_FD), 'utf8')`
  A second read is empty, and `/dev/fd/4` cannot be opened (it is a socket) — read the NUMBER. A program that re-execs itself or starts a reloader (Flask / uvicorn `--reload`, a `subprocess` with `close_fds`) does not hand the fd on: read the value first and keep it in memory.
- **Where it never is:** the job's env, its argv, its spec file, data/, the hub's journal, the audit (one `vault-use` line per start: its name, the door `service`, a receipt — `ok` once the job's wrapper took the value, `refused:<why>` when it refused the run before reading it, e.g. `refused:update_window` while VibeSpace updates; a refused start is no use), a card or any answer to you. The job's log is masked by the VALUE (every spelling `run` knows) and by shape before it is written — a job given values is never started without that masker.
- **Your program's own side:** in sh, `curl -H "Authorization: Bearer $TOKEN"` puts the value on curl's ARGV (any `ps` shows it) — hand it on stdin or a file the tool reads (`curl -H @-`); an `export` puts it in the env of every child. Where the program keeps it after reading is the program's.
- **Locked:** a start while the vault is locked WAITS — never a failed run, never a park — and starts by itself when a person unlocks it (⚙ System ▸ Vault…); the user's unlock item names the job. Locking the vault does not stop a job that runs.
- **What it does not promise:** this keeps a value from being SHOWN by accident. An agent that changes the program can make it print the value, and a value already given cannot be taken back — to retire a key, rotate it at its provider.
- A job never calls the vault itself: `vibespace-vault run / request / uses` with a job's token answer `job_no_use`.

## A seed or a login you hold — `totp add` and `login add`

**A two-step seed or a website password goes in as ITS KIND — never as a free `put`.** The vault then does the work and you
never need the value again:

- **totp add `<name>`** — the `otpauth://` link or the base32 seed, from a **0600 file** (`--from-file`) or **stdin**
  (`--stdin`), never the command line. It becomes the two-step entry `totp:<name>`, yours: `vibespace-vault totp <name>`
  answers its CURRENT code to this conversation with no grant (another conversation needs the user's 用于…). You never read
  the seed back. A name already in the vault is refused (`exists` — pick another).
- **login add `<origin>` --user `<name>`** — a website login you were given: its password from a 0600 file or stdin,
  optionally `--totp <name>` (a two-step entry YOU added with `totp add` — another is refused `bad_totp`). It becomes a web-login entry, yours: `vibespace-browser
  login <origin> --user <name>` fills it on your tab (the kernel fills — you never see the password, nor the code) with no
  grant; another conversation needs the user's 用于…. A login already kept for that account is never written over
  (`login_exists`).

Both answer the entry's name — never the value. The copy in this transcript is not protected: tell the user to rotate a
password you were handed in the chat when they can.

## Every refusal and the door the user uses

| Code | What it means | The user's door |
|---|---|---|
| `vault_locked` | the vault is locked; the user has already been told | Unlock… at the top of the page (the second password) — wait |
| `vault_not_set_up` | no second password yet — nothing is sealed | ⚙ System ▸ Vault… (set it up) |
| `human_only` | a person's door (unlock, set up, change, show a value, open for runs, answer a card) | the page |
| `entry_not_runnable` | the entry is closed for runs (never one of your own) | the Vault window row's «Usable by agent runs» — or your `request` in For you |
| `use_not_granted` | this conversation may not use it (another conversation's own entry, or a grant that ended) | your `request` in For you |
| `entry_has_its_own_door` | a sign-in / pairing / channel token, a passkey, a key | the door the answer names (Channels panel, Accounts…) |
| `entry_unknown` | no such entry (any more) | — (`vibespace-vault list`) |
| `request_pending` · `request_quiet` | you already asked for that entry / the user said no a moment ago (10 minutes) | For you (the open question) |
| `scope_required` · `command_unreadable` · `command_has_hosts` · `standing_bad_host` | a standing request named no scope / a `--command` whose script is missing or over 1 MiB / a known tool (ask `--host`) / not a host | — (fix the words) |
| `command_not_pinnable` (+ `why`) | the `--command` cannot be pinned to what runs: inline code or a module (`-c` / `-e` / `eval` / `-m` …), an option the interpreter's grammar does not name, no script, a file that is not its script, an interpreter with no grammar, a program outside the tables | write the code to a file and ask for «<interpreter> <file>» — or ask with `--host` |
| `tool_required` · `standing_bad_tool` | a wildcard `--host` with no `--tool` / a `--tool` that is not a CLI whose destination VibeSpace reads | add `--tool <the CLI you run>` (curl, gh, aws …) |
| `ask_pending` · `ask_denied` · `ask_expired` · `ask_unfiled` · `ask_changed` | the run card waits / said no / got no answer in 60 s / could not be filed / changed after it was shown — nothing ran | For you (the run card) |
| `not_granted` (totp) | the user has not granted this two-step code to this conversation (a code you added yourself needs no grant) | the Vault window ▸ the code's 用于… |
| `exists` · `login_exists` | `totp add` / `login add`: that name or that account is in the vault already | — (another name; the user deletes) |
| `argv_refused` · `tool_prints_secrets` · `tool_wraps_another` · `env_refused` · `entry_too_short_to_mask` · `cwd_refused` | the run's plan is refused | — (change the command) |
| `job_no_use` | a Background Work job never calls the vault itself | declare its values when you create it: `vibespace-job run … --vault NAME=vault://…` (below) |
| `device_road_later` | a run on a paired machine is not here yet | — |
| `too_many_runs` · `too_many_requests` · `too_many_askers` | too many at once (4 runs, or 8 open requests, per conversation; 32 conversations asking at once) | — (wait) |
| `bad_name` · `value_in_argv` · `bad_length` · `bad_charset` | mint / put's own words | — |

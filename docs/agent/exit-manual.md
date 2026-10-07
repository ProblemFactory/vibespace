# A paired machine as an exit — `vibespace-exit`

Use this ONLY when a request needs THAT machine's network position (a region, an internal / VPN network,
a fixed source IP) or must run ON that machine (its GPU, its tools, its files). By default you go direct
(this instance's own network). Reach for an exit deliberately, for the one command that needs it.

## Who may (the user decides)

The user opens each paired machine to conversations under "Who can use it" (Remote tab → the machine
row's exit icon, or Manage agents → Machines). TWO separate grants per machine:

- **Borrow its network** — `use` / `url`: a SOCKS5 proxy; the tool runs HERE, only its traffic leaves
  from the machine. Proxy-aware TCP only (curl / git / most CLIs honour `ALL_PROXY`); never ICMP, UDP
  is spotty.
- **Run commands on it** — `run`: a command runs ON the machine as its user, up to 30 s. With "ask me
  each time" every command first waits (≤ 60 s) for the user's Allow in their For you tray — ask the
  user in the chat too; a refused or unanswered ask names itself.

`vibespace-exit list` prints what THIS conversation may do on each machine (`network: yes/no ·
commands: yes/ask/no`). A refusal names the grant you lack and that the user can allow it under "Who
can use it" — never another conversation. Background Work jobs (`jbt_` tokens) can never use an exit.

## The verbs

```
vibespace-exit list                      machines open to THIS conversation
eval "$(vibespace-exit use <machine>)"   export ALL_PROXY / HTTPS_PROXY / HTTP_PROXY for this shell line
vibespace-exit url <machine>             just the socks5h url (for --proxy)
vibespace-exit run <machine> -- <cmd>    run <cmd> ON the machine (≤ 30 s)
vibespace-exit runs [<machine>] [--limit N]   your own recent runs there, newest first
vibespace-exit pull <machine> <remote-path> [<local-path>] [--overwrite]   copy ONE file from the machine to here
vibespace-exit push <local-path> <machine> <remote-path> [--overwrite]     copy ONE file from here to the machine
```

`<machine>` = its id, its exact name or a unique substring of either; omit it when only one machine is
open to you.

## The shell is the MACHINE's (read this before `run`)

`run` hands the machine ONE line; the machine's own agent runs it under the interpreter it has:

- **Windows** — `cmd.exe /d /s /c "<line>"`. One line only: join steps with `&` or `&&` (a line
  break would be refused by name — `cmd.exe runs one line`). Inner quotes, pipes, `%VAR%` and `^` are
  cmd's own; nothing is re-quoted on the way. PowerShell needs its own call: `powershell -NoProfile
  -Command "…"`. Paths use backslashes or quoted forward slashes as cmd accepts them.
- **macOS / Linux / BSD** — `sh -lc <line>`: a login shell, so the user's PATH applies; multi-line
  commands are fine.

The machine's row (Remote tab) states its platform once it has dialed in. A machine whose agent is
older than this VibeSpace still gets the old `sh -lc` form — on a Windows machine that fails at once
with `sh: not found on that machine`; ask the user to update the agent there (the row's Test connection
does it).

## What comes back, and what is kept

- `run` prints the command's stdout and stderr whole (the machine keeps 1 MiB of stdout / 64 KiB of
  stderr per run — a cut is said) and exits with the command's own exit code; `124` = killed at the
  30 s cap; a recorded line on stderr says `# ran on <machine> — exit N, 1.2 s (recorded)`.
- On Windows a `run` line is at most 8191 characters (cmd.exe's own limit) and ONE line — a longer or
  multi-line command is refused by name before anything runs.
- On Windows the output is decoded per the machine's console code page (GBK on a Chinese system, …)
  unless it is already UTF-8; the reply's `encoding` names the decoding used.
- **A command that could not START is said by name** — `could not start `hostname` on "<machine>" —
  sh: not found on that machine (ENOENT); nothing ran.` — and the CLI exits with the shell's own code:
  `127` not found, `126` not executable. Never a bare "exit 1" for a child that never ran.
- Every run leaves a card in the user's chat ("Machines · <machine>": the exit line, the first lines of
  stderr — else stdout — and "Show output"), the machine's row shows its last run, and the user's
  "Commands…" list on the machine keeps the last 50 runs with the **first 4 KiB of stdout and stderr**
  (the stored heads; credentials inside URLs are cut, and a secret SHAPE — a private-key block, a
  secret-named `KEY=value`, a bearer, a known token prefix, `password <x>` — is kept as `«redacted»`;
  the whole stream still comes back to you). `vibespace-exit runs` prints the same heads for
  YOUR runs only — one line per run (the verdict, the duration, the interpreter, the command) and the
  first line of its output. You never see another conversation's runs.
- A revoke while a command runs cannot stop it (no cancel); the record says access was removed.

## Files: `pull` / `push`

- One regular file per call, under the SAME grant as `run` (and its "ask me each time": the ask shows
  `pull <remote> → <local>`). The machine's agent reads / writes it with its own file operations — no
  shell, so it works the same on Windows; no 30 s cap and no output bound: the bound is the user's
  setting (default 1 GiB; a bigger file is refused `too_big` with both sizes).
- The remote path is absolute in the machine's own spelling (`C:\Users\me\out.zip`, `/home/me/out.zip`;
  `~/…` when its agent expands it). A folder: archive it first with `run` (`tar -czf`, `Compress-Archive`).
- A pull lands at `<local-path>` (default `./<the remote file's name>`; an existing folder takes the
  file inside it) — only under this conversation's project directory, /tmp or ~/Downloads, never in
  ~/.ssh, ~/.claude, a `.git` or VibeSpace's data (`local_path_refused`). An existing file is replaced
  only with `--overwrite` (`exists` otherwise), on either side.
- Every 8 MiB window is checked against the machine's sha256 (an agent older than this checks the
  size: "size verified"); the CLI prints where it landed, the size and the whole sha256. A push needs
  the machine's agent 2.369.205 or later (`device_agent_outdated` says so; pull works with any agent).
- Not resumable: any failure (`hash_mismatch`, `transfer_failed` — a stall, the file changing while it
  is read, your access removed mid-way) keeps NOTHING on the receiving side; run it again.
- A pull's local folder is judged again when the bytes are written and when the file is put in
  place: a folder moved, replaced or removed since you asked is refused (`local_path_refused`, with
  the reason) and never re-made. One pull per local file at a time: a second pull into the same file
  is refused `target_busy` until the first one ends.
- Each transfer is ONE card in the chat and ONE row in the machine's command list (`runs` shows
  `pulled N bytes`). A conversation running on another machine cannot pull (`remote_session`: the local
  path would be the VibeSpace machine's disk).

## Rules

- Never pass tokens or secrets on the command line of a `run`: the whole command is shown to the user
  (the ask, the card, the audit) and kept in the machine's command list.
- Prefer `use` (the tool runs here) when a proxy-aware tool will do; `run` when you need ICMP / UDP /
  the machine's own DNS, tools or files.
- A command carrying Unicode direction controls or invisible characters is refused before it is shown
  (the user must read exactly what runs).

## The full teaching behind the session intro's pointer line

Every session's first prompt carries ONE line for this tool and points here (2.369.227 — the first prompt context must leave room for notices and messages). These are the words it used to carry in full:

If a request needs a DIFFERENT machine's network position (a region, an internal/VPN network, a fixed source IP), you can borrow a paired machine's network for that ONE command with `vibespace-exit` (default: go direct — only reach for an exit deliberately):

```sh
vibespace-exit list machines the user enabled as exits
```

```sh
eval "$(vibespace-exit use <machine>)"; curl https://ifconfig.me (borrow its egress via SOCKS for proxy-aware TCP tools)
```

```sh
vibespace-exit run <machine> -- <cmd> run the command ON that machine (ICMP/UDP/its DNS); a file: vibespace-exit pull / push
```

(SOCKS can't carry ping/UDP and needs a proxy-aware tool — when `use` won't work, `run` will. Nothing is available until the user enables a machine as an exit.)

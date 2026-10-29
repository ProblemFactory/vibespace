# `vibespace` — your sessions on this machine, with or without the hub

When the hub is up you use the web page. When it is not — frozen, crashed, restarting, or its data folder sits on a
network drive that stopped answering — the sessions themselves keep running (dtach), and `vibespace` reaches them from
the machine itself. It never calls the hub first, never kills and never deletes; it reads no vault and no account.

## Where it is

The hub installs it on the machine's own disk at every start, next to the session list it keeps there:

```
~/.vibespace/local/bin/vibespace              the command
~/.vibespace/local/sessions.<hub>.json        the session list each hub keeps (one file per hub — rewritten on every change, every 30 s)
```

- If `~/.vibespace` is (or leads, through a symlink) onto a network drive, the hub uses `/var/tmp/vibespace-<uid>/`
  instead, then the runtime folder — and says so in its log: `[local-index] sessions index for the person's CLI: …`.
  A `/var/tmp/vibespace-<uid>` someone else made (a symlink, another owner, open to others) is refused by name.
- The command is refreshed when the hub starts. `scripts/update.sh` restarts the hub, so the copy follows; after a
  manual `git pull` without a restart, `vibespace` stays the old one until the next start.
- A hub run from a worktree or a temp folder (a lane, a test) keeps its list under its own root
  (`<root>/data/local-index/`) — never in your home — and `<root>/data/bin/vibespace` reads it there.

Put it on your PATH once — at the top of `~/.bashrc` (before any "not interactive, stop here" line, so ssh sees it too):

```
export PATH="$HOME/.vibespace/local/bin:$PATH"
```

## The four commands

```
vibespace ls [--json]                  the sessions of every hub here: alive / dead / unknown, kind, agent, name, folder, age
vibespace status [--json]              each hub (up / frozen / stopped / down), its data/ (answering?), the load, its last log lines
vibespace attach <session> [--take]    a TERMINAL session's live screen — detach with Ctrl-\ (the session keeps running)
vibespace chat <session> [-n N]        a CHAT session: its last N messages (20), then type a line + Enter to send it;
                                       Esc or /stop = Stop the running turn · Ctrl-C = leave (the session keeps running)
```

`<session>` is its id (or the end of it) or its exact name. At a terminal it can also be its number in `vibespace ls`
or a unique part of its name — the command then shows the name and asks before it attaches or sends anything.

- **alive / dead / unknown** is what the machine says NOW (does the session's socket answer, does its process still
  run) — not what the hub last wrote. **unknown** = the machine could not tell (for example its socket sits on a drive
  that does not answer); the line under the table says why.
- **TURN** (working / needs you / idle) comes from the hub; while the hub is not up it shows `?` rather than a stale word.
- **status** asks each hub once (2 s). *frozen* = its process runs but it does not answer — the 2026-10-27 shape;
  *stopped* = it stopped cleanly; *down* = its process is gone without a word. Two hubs on one machine are listed
  apart, the one systemd runs first.
- **attach** is for when the hub is down or frozen. While the hub is up and answering, it refuses and says why: a
  second viewer on the session's socket can make the hub's own view miss output. `--take` attaches anyway.
- **chat** never stays connected to the session: each line is handed over and the connection let go, and the reply is
  read from the session's own log file. Each line is confirmed by the session («not acknowledged in 6 s» if it is
  not); Stop says «Stop taken» only once the session confirms it. Every reply is shown once; one the session changes
  after it was shown is shown again, marked «(updated)».

## Over ssh

```
ssh <box> vibespace ls
ssh <box> vibespace status
ssh -t <box> vibespace attach <id>        # a screen needs -t
ssh -t <box> vibespace chat <id>
```

(Without the PATH line: `ssh <box> ~/.vibespace/local/bin/vibespace ls`.) In a script, a line can be piped in by the
session's id or exact name: `echo "please wrap up" | vibespace chat sess-12-1793191978321 --wait 10` sends it, prints
the reply for 10 s, and exits 1 if the line was not confirmed. A number is refused there: numbers move when an older
session ends, so a script's line could reach another conversation.

## What it cannot do

- A session whose socket sits on a drive that does not answer cannot be reached by anyone until the drive answers;
  `vibespace` says so in 2 s instead of hanging (by hand, `ls` or `dtach -a` on that folder hangs).
- While the hub is up, a line you send from `vibespace chat` gets its reply in the web view, but the line itself shows
  there only when the conversation reloads.
- If you and the web send a line at the very same moment, the two can arrive torn. The session then refuses both and
  says so — the web shows «A message did not reach Claude…», `vibespace chat` sends its line once more. Sessions
  started before 2.369.361 cannot refuse a torn line, so while the hub is up `vibespace chat` is read-only for them.
- It cannot answer a permission ask (Allow / Deny) in a chat: it says the agent is asking — the turn waits — and the
  hub's page answers it.
- When you attach to a terminal, your window size becomes the session's size (the web's view of it follows).
- It is your door, not an agent's: inside an agent session or a background job every command refuses — even a bare
  `vibespace` (an agent talks to another session with `vibespace-msg`). The check reads the session's environment; a
  program that removes it on purpose reaches only what the same user could already read in the hub's data folder.
- Text from a session (a name, a message, a log line) is shown, never obeyed: control characters appear as `␛`, `␍`.
- On a machine where no hub has run (a paired device, an ssh host) it says «no VibeSpace hub has run here» and where to
  look instead.

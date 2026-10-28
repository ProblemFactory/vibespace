# `vibespace` — your sessions on this machine, with or without the hub

When the hub is up you use the web page. When it is not — frozen, crashed, restarting, or its data folder sits on a
network drive that stopped answering — the sessions themselves keep running (dtach), and `vibespace` reaches them from
the machine itself. It never calls the hub first, never kills and never deletes; it reads no vault and no account.

## Where it is

The hub installs it on the machine's own disk at every start, next to the session list it keeps there:

```
~/.vibespace/local/bin/vibespace          the command
~/.vibespace/local/sessions.json          the session list the hub keeps (rewritten on every change, every 30 s)
```

(If your home folder is itself on a network drive, the hub uses `/var/tmp/vibespace-<uid>/` instead and says so in its
log: `[local-index] sessions index for the person's CLI: …`.)

Put it on your PATH once — at the top of `~/.bashrc` (before any "not interactive, stop here" line, so ssh sees it too):

```
export PATH="$HOME/.vibespace/local/bin:$PATH"
```

## The four commands

```
vibespace ls [--json]            the sessions: alive / dead / unknown, kind, agent, name, folder, age
vibespace status [--json]        the hub (up / frozen / stopped / down), data/ (answering?), the load, the hub's last log lines
vibespace attach <session>       a TERMINAL session's live screen — detach with Ctrl-\ (the session keeps running)
vibespace chat <session> [-n N]  a CHAT session: its last N messages (20), then type a line + Enter to send it;
                                 Esc or /stop = Stop the running turn · Ctrl-C = leave (the session keeps running)
```

`<session>` is its number in `vibespace ls`, its id (or the end of it), or its name (or a unique part of it).

- **alive / dead / unknown** is what the machine says NOW (does the session's socket answer, does its process still
  run) — not what the hub last wrote. **unknown** = the machine could not tell (for example its socket sits on a drive
  that does not answer); the line under the table says why.
- **TURN** (working / needs you / idle) comes from the hub; while the hub is not up it shows `?` rather than a stale word.
- **status** asks the hub once (2 s). *frozen* = its process runs but it does not answer — the 2026-10-27 shape;
  *stopped* = it stopped cleanly; *down* = its process is gone without a word.

## Over ssh

```
ssh <box> vibespace ls
ssh <box> vibespace status
ssh -t <box> vibespace attach 3        # a screen needs -t
ssh -t <box> vibespace chat 3
```

(Without the PATH line: `ssh <box> ~/.vibespace/local/bin/vibespace ls`.) In a script, a line can be piped in:
`echo "please wrap up" | vibespace chat 3 --wait 10` sends it and prints the reply for 10 s.

## What it cannot do

- A session whose socket sits on a drive that does not answer cannot be reached by anyone until the drive answers;
  `vibespace` says so in 2 s instead of hanging (by hand, `ls` or `dtach -a` on that folder hangs).
- A line you type in `vibespace chat` goes straight to the session. While the hub is up its web view shows the reply,
  not your line (until the conversation reloads).
- It cannot answer a permission ask (Allow / Deny) in a chat: it says the agent is asking — the turn waits — and the
  hub's page answers it.
- When you attach to a terminal, your window size becomes the session's size (the web's view of it follows).
- It is your door, not an agent's: inside an agent session or a background job every command refuses (an agent
  talks to another session with `vibespace-msg`).
- On a machine where no hub has run (a paired device, an ssh host) it says «no VibeSpace hub has run here» and where to
  look instead.

# Accounts & Billing Identity

VibeSpace can hold **many logins per backend** — several Claude Pro/Max
subscriptions, Anthropic Console/API keys, and several ChatGPT accounts — and
lets **each session pick which one it bills through**. The CLIs themselves only
support one login at a time (`/login` replaces the previous one); VibeSpace is
what escapes that.

Manage everything in **⚙ → Manage agents…** — each backend's account roster
renders directly under it (Anthropic under Claude Code, ChatGPT/OpenAI under
Codex).

## The mental model: machine logins vs VibeSpace accounts

There are two different kinds of login, and the roster shows the split
explicitly:

| | Where it lives | Shown as |
|---|---|---|
| **The machine's own CLI login** | On that machine (`~/.claude` / `~/.codex`) | The first row — "CLI login" (local) or "CLI login on AIDev" (remote host selected) |
| **VibeSpace accounts** | In VibeSpace's own store (`data/`) | Every named row below it |

- Picking a **remote host** in the Machine dropdown changes only the first row —
  it now shows *that host's* own login, and its "Log in on \<host\>…" button
  opens a terminal **on that host**; the login lands there, not in VibeSpace.
- The **named accounts never change with the machine** — they're stored by
  VibeSpace and work for sessions on *any* machine. When a session spawns on a
  remote host, the account's credentials ship to that host automatically
  (over the encrypted ssh channel, into a private `~/.vibespace/` dir).
- The **Add subscription… / Add ChatGPT account… / Add API key…** buttons always
  add to VibeSpace's store, regardless of which machine is selected.

## Account types

| Type | How it bills | How it's held |
|---|---|---|
| **Claude subscription** (Pro/Max) | Your plan's quota | Its own isolated credentials dir; the CLI reads it via `CLAUDE_SECURESTORAGE_CONFIG_DIR` (transcripts/settings stay shared in `~/.claude`) |
| **Anthropic Console / API key** | Pay-per-use | AES-256-GCM encrypted in VibeSpace's store; injected as `ANTHROPIC_API_KEY` |
| **ChatGPT (Codex)** | Your ChatGPT plan | Its own isolated `CODEX_HOME` whose `sessions/` and `config.toml` are symlinks to the shared `~/.codex` — auth is per-account, threads and settings stay unified |

## Adding accounts

- **Add subscription…** — opens a terminal running the Claude OAuth login
  scoped to a fresh isolated dir. Sign in with the account you want to add;
  your existing logins are untouched. VibeSpace detects completion and names
  the account after the email/plan (rename anytime via the pencil).
- **Add ChatGPT account…** — same idea via `codex login --device-auth`
  (a URL + one-time code, so it works even when your browser is on a different
  machine than the server).
- **Add Console account…** — runs the Console login in a throwaway isolated
  dir so it can't wipe your subscription login, then captures the minted API
  key into the store.
- **Add API key…** — paste a raw `sk-ant-…` key.
- **Import its key** (remote host row) — copies a Console key found on the
  host into VibeSpace so any machine can use it.

Use **Test** on any row to open a throwaway terminal session billing through
that account (on the selected machine); closing the window terminates it.

## Picking an account per session

- **New Session dialog** — Account row (filtered to the session's backend;
  "Default" = the starred account, or the machine's own login when none is
  starred).
- **Session card ⚙** — per-session override, persisted; **resuming with a
  different account moves the conversation's billing** (e.g. subscription limit
  hit → switch to an API key and continue).
- **Session Properties → Billing** — shows what the running session actually
  bills through, and an "On resume" account override.

The **star** on a roster row makes it the default for new sessions of that
backend (each backend has its own default). Starring none = the machine's own
CLI login is the default.

Session cards show a billing badge: amber key = API-billed, crown + first
letter = a named subscription.

## Usage bars

Subscription rows show compact **5h / 7d usage bars** (per-account poll,
read-only — VibeSpace never refreshes or rewrites OAuth tokens). Idle accounts
show last-known values with an "Nm ago" staleness note.

## Remote hosts: what ships, what doesn't

When a session on a remote host uses a VibeSpace account:

- **API key** — the key value streams over ssh-stdin into a `0600` file on the
  host and is referenced via a shell prefix assignment. It never appears in any
  argv on either machine.
- **Subscription (Claude or ChatGPT)** — the account's credential files stream
  over ssh-stdin (tar) into a private `0700` dir on the host; extraction is
  per-file *newest-wins*, so a token refreshed on the host is never overwritten
  by a stale local copy, and concurrent sessions of the same account never have
  their credentials yanked.
- Deleting an account best-effort removes its key file / creds dirs from every
  registered host.

Nothing about the host's own `~/.claude` / `~/.codex` logins is modified by any
of this — those change only via the explicit "Log in on \<host\>…" button.

## Security notes

- API keys are AES-256-GCM encrypted at rest (`data/accounts.json` +
  `data/.accounts-key`); subscription credential dirs live under `data/subs/`
  and `data/codex-subs/`. All of these are gitignored — never commit `data/`.
- Credentials ride the process-env channel (or ssh-stdin for remote), never
  command-line arguments.
- VibeSpace reads OAuth credentials strictly read-only; token refresh is left
  entirely to the CLIs (refresh tokens rotate — an external refresher would
  break the login).

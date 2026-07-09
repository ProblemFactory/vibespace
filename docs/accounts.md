# Accounts & Billing Identity

VibeSpace lets you keep **more than one login per backend signed in at the same
time** — several Claude Pro/Max subscriptions, Anthropic Console/API keys, and
several ChatGPT accounts — and choose **which one each session uses**. The CLIs
themselves only keep one login active at a time (signing into another replaces
the previous one); VibeSpace just remembers each of *your own* logins separately
so you don't have to sign in and out to switch between them.

Everything runs through the **official `claude` / `codex` binaries**, driven
interactively the same way you'd use them in a terminal. VibeSpace does not
reverse-engineer the auth, proxy anyone else's credentials, or call Anthropic's
API behind the CLI's back — see [Staying within the terms](#staying-within-anthropics-terms)
below.

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
- The **named accounts never change with the machine** — they're your own
  logins stored by VibeSpace, and a session can use them on any machine you've
  connected.
- The **Add subscription… / Add ChatGPT account… / Add API key…** buttons always
  add to VibeSpace's store, regardless of which machine is selected.

## Account types

Each account is one of **your own** logins, kept in its own isolated store so
signing into one never disturbs another:

| Type | How it bills | How it's held |
|---|---|---|
| **Claude subscription** (Pro/Max) | Your plan's quota | Its own credentials dir; the CLI reads it via `CLAUDE_SECURESTORAGE_CONFIG_DIR` (only the secret store is relocated — projects/sessions/settings stay in `~/.claude`, so transcripts stay shared) |
| **Anthropic Console / API key** | Pay-per-use | AES-256-GCM encrypted in VibeSpace's store; injected as `ANTHROPIC_API_KEY` |
| **ChatGPT (Codex)** | Your ChatGPT plan | Its own `CODEX_HOME` whose `sessions/` and `config.toml` are symlinks to the shared `~/.codex` — auth is per-account, threads and settings stay unified |

Holding several of your own subscriptions is treated the same as logging in and
out of the official app — you're switching between accounts you personally own,
not sharing one account with other people or pooling access.

## Adding accounts

- **Add subscription…** — opens a terminal running the official Claude OAuth
  login, scoped to a fresh isolated dir. Sign in with the account you want to
  add; your other logins are untouched. VibeSpace reads back the email/plan and
  names the account (rename anytime via the pencil).
- **Add ChatGPT account…** — same idea via `codex login --device-auth` (a URL +
  one-time code, so it works even when your browser is on a different machine
  than the server).
- **Add Console account…** — runs the Console login in a throwaway isolated dir
  so it can't wipe your subscription login, then captures the minted API key.
- **Add API key…** — paste a raw `sk-ant-…` key.
- **Import its key** (remote host row) — copies a Console key found on the host
  into VibeSpace so any machine can use it.

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

## Usage bars — passive, from your real sessions

Subscription rows show compact **5h / 7d usage bars**. This data is captured
**passively**: while you run an interactive session, the CLI already receives
your 5h/7d rate-limit figures in its normal API responses and reports them (via
its status-line contract), and VibeSpace simply caches what the CLI already
knows. **VibeSpace makes no background calls to read usage** — nothing pings
Anthropic on a timer, and idle accounts are never contacted (their usage isn't
changing anyway; they show the last value with an "Nm ago" note).

Because the figures come from real session activity, usage refreshes when you're
actually using an account in a **terminal** session. Chat (stream-json) sessions
have no status line, so a chat-only account shows its last-known usage until you
next run it in a terminal.

## Remote hosts

When a session on a remote host uses a VibeSpace account:

- **API key** — the key value streams over ssh-stdin into a `0600` file on the
  host and is referenced via a shell prefix assignment. It never appears in any
  argv on either machine. API keys are the sanctioned way to run on servers, so
  they're always allowed on remote hosts.
- **Subscription (Claude or ChatGPT)** — **off by default.** Running a
  subscription on a remote host would put that subscription's login on a
  different machine (often a datacenter), which is both outside the spirit of a
  personal subscription and a pattern that can look like account abuse. The
  recommended path is to **log in on the host itself** (Manage agents → select
  the host → "Log in on host…") so the work bills to that machine's own login.
  If you understand the risk and still want it, enable **Settings → "Ship
  subscription logins to remote hosts"**; VibeSpace then streams the credential
  dir over ssh-stdin into a private `0700` dir on the host (per-file
  newest-wins, so a token the host refreshed is never overwritten by a stale
  copy).
- Deleting an account best-effort removes its key file / creds dirs from every
  registered host.

Nothing about the host's own `~/.claude` / `~/.codex` logins is modified by any
of this — those change only via the explicit "Log in on host…" button.

## Staying within Anthropic's terms

VibeSpace is designed to be a convenience layer over the official CLIs, not a
way around Anthropic's terms. The relevant choices:

- **Only the official CLI, run interactively.** Sessions launch the real
  `claude` / `codex` binaries. VibeSpace never uses `-p`/`--print` or the Agent
  SDK for subscription sessions (those are the modes Anthropic documents as
  belonging on the paid API), and never spoofs the CLI's identity.
- **No background use of subscription credentials.** Usage is read passively
  from what the CLI itself already reports (above) — there is no timer that
  calls Anthropic's API with a subscription token, which is the behavior most
  likely to be flagged as automated/non-human access.
- **Subscriptions stay on your own machine by default.** Running a subscription
  from a remote/datacenter host is opt-in and clearly flagged; the default is to
  log in on the host.
- **Your own accounts only.** Multi-account support is for switching between
  logins you personally own, like signing in and out of the app — not for
  sharing one account among people or reselling access.
- **Anything programmatic belongs on the API.** If you want unattended,
  scripted, or server automation, use an **API-key** account (pay-per-use),
  which is the sanctioned path for that.

If you ever get a policy notice on an account, the safest response is to stop
using it through any tooling, contact Anthropic for the specific reason, and
move programmatic workloads to an API key. Anthropic's terms are the source of
truth; this document is guidance, not legal advice.

## Security notes

- API keys are AES-256-GCM encrypted at rest (`data/accounts.json` +
  `data/.accounts-key`); subscription credential dirs live under `data/subs/`
  and `data/codex-subs/`. All of these are gitignored — never commit `data/`.
- Credentials ride the process-env channel (or ssh-stdin for remote), never
  command-line arguments.
- VibeSpace reads OAuth credentials strictly read-only; token refresh is left
  entirely to the CLIs (refresh tokens rotate — an external refresher would
  break the login).

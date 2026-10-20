# vibespace-api — VibeSpace's own automation API

The user mints **automation keys** in the Vault window (⚙ System ▸ Vault contents… ▸ «Automation keys»). Each key holds a
closed list of **verbs**. The user **grants** a key to a conversation or to a Task Group, and then any conversation the
grant covers can call those verbs.

You never see, hold or pass a key's value. Every call carries only your own session token. The hub judges each call
(the grant × the verb × the vault's state), runs it, and writes one audit line.

```
vibespace-api keys                                the keys this conversation may use: name · verbs · how it holds each
vibespace-api call <verb> [--key <name|id>] [--json '{…}'] [--<arg> <value>]…
vibespace-api audit [--key <name|id>] [--since <ISO time>] [--limit N]   this conversation's own audit lines
```

## Keys and grants

- **keys** — the keys a grant lets this conversation use now: its own grants and its Task Groups'. Each line shows the
  key's name and id, its verbs, and the grant it comes through (`session:<id>` or `group:<task id>`, and `once` for a
  one-time grant). A key's value is never printed; no command and no route returns it.
- **No grant yet?** Call the verb anyway. If exactly one key holds that verb, the hub files an **urgent card** in the
  user's For you tray ("<this conversation> wants to use the automation key …") and your call **waits** (≤ 60 s).
  - The user can answer **Allow once** (this call only), **Always for this conversation** (a grant they can take back in
    the Vault window), or **Deny**.
  - Each verb asks on its **own card** (a rename and an open are two questions); each answer releases only its own call.
  - A refusal or no answer is final for **10 minutes** for that key, this conversation and that verb (`ask_quiet`). Do not loop.
  - If your call stops waiting (the command is killed or times out), it is withdrawn: the card closes and a later answer runs
    nothing (`caller_gone` in the audit). Call again when you need it.
- **Several keys hold the verb** and none is granted ⇒ `key_ambiguous`. Name one with `--key`.

## Calling a verb

```
vibespace-api call conversations.rename --name "Lane foo"                         rename THIS conversation
vibespace-api call conversations.rename --name "Worker 2" --target <conversation id>
```

- **Arguments.** Pass them as `--<name> <value>` pairs or as one JSON object with `--json`. An unknown argument is refused
  by name (`bad_args`).
- **Another conversation (`--target`).** It must be one the same key is granted to, directly or through one of its Task
  Groups. Otherwise the call is refused `not_granted`, and nothing happens.
- **Another conversation the key opened** is within its reach too: the worker you open is yours to name, bind, invite and end.
- **The verbs.** The table is closed; a new verb arrives with its own release:

| verb | arguments | billed |
|---|---|---|
| `conversations.open` | `cwd`, `backend?`, `mode?`, `name?`, `model?`, `effort?`, `permission?`, `task?`, `pool?` | **yes** (a conversation nobody typed into — the spend ceiling decides first) |
| `conversations.status` | `target` | no (a read) |
| `conversations.rename` | `name`, `target?` | no |
| `conversations.bind` | `target`, `task` (a Task Group this conversation is in) | no |
| `conversations.end` | `target` | no |
| `groups.invite` | `group`, `target` (an agent group this conversation is in; added without a wake) | no |

## The typed verbs

The same verbs, one command each — they print the hub's whole answer as JSON (the ids you need next):

```
vibespace-api conversations open --cwd <absolute path> [--name "…"] [--backend claude] [--mode chat|terminal]
              [--model opus] [--effort xhigh] [--permission bypassPermissions] [--task <T-…>] [--pool <pool-…>]
vibespace-api conversations status <target>
vibespace-api conversations rename <target> "<name>"
vibespace-api conversations bind <target> <T-…>
vibespace-api conversations end <target>
vibespace-api groups invite <g-…|group name> <target>
```

`<target>` is a conversation id, `<backend>:<id>` or a session id (`sess-…`); `--key <name|id>` picks a key.

- **open** answers `sessionId` (`sess-…`) and — it waits up to 20 s for it — the conversation's own id (`claudeSessionId`,
  `sessionKey`). Still `pending: true`? Poll `conversations status <sess-…>` before you bind or invite it.
- Only these choices cross: backend, mode, cwd, name (≤ 60 characters), model, effort, permission mode (the backend's own
  values — a refused one is named: `bad_model`, `bad_effort`, `bad_permission_mode`, …), Task Group, account or pool.
  A resume, a fork, a remote machine or extra CLI arguments are not an automation's to ask for.

**Opening a worker (the coordinator's road):**

```
vibespace-api conversations open --cwd /var/tmp/vibespace-lanes --name "lane foo" --model opus --effort xhigh \
    --permission bypassPermissions --pool <pool-…>                 → {"sessionId": "sess-…", "sessionKey": "claude:<id>", …}
vibespace-api conversations bind <sess-…> <T-…>                    the Task Group
vibespace-api groups invite <g-…> <sess-…>                          the lane group (no wake — brief it with vibespace-msg)
…the lane's work…
vibespace-api conversations end <sess-…>
```

## The answers

| code | means |
|---|---|
| `vault_locked` (423) | the vault is locked — every call waits until the user unlocks it on the page. Tell them; never ask for the password (exit code 3) |
| `not_granted` | no grant lets this conversation use the key (or a `--target` the key does not reach) |
| `key_revoked` / `verb_not_in_scope` | the user revoked the key / the key does not hold this verb |
| `ask_denied` / `ask_expired` / `ask_quiet` | the user refused / nobody answered in 60 s / a refusal is still in its 10 minutes |
| `once_spent` | a one-time grant was used; the next call asks again |
| `caller_gone` (410) | the audit's word for a call that stopped waiting on its card — it was withdrawn and nothing ran |
| `subject_ended` | this conversation is not running any more |
| `session_only` | a background job's token was used — only conversations use automation keys for now |
| `spend_refused` (429) | the spend ceiling is full — `bucket` names it (`hour-cap`, `day-cap`, `instance-cap`, …), `retryAfter` when it frees; nothing was opened |
| `pending` (409) | the conversation has not reported its id yet — poll `conversations status` |
| `bad_args` / `unknown_field` / `bad_cwd` / `bad_name` / `bad_model` / `bad_effort` / `bad_permission_mode` / … | the argument it names is malformed or not allowed |

## The audit

**audit** prints this conversation's own lines, oldest first, from `data/automation-audit.jsonl` (mode 0600). A line holds
when, the key, the verb, names and ids only (never a text body), the outcome, and whether the user was asked. The user
sees the same file, and each key in the Vault window shows when it was last used.

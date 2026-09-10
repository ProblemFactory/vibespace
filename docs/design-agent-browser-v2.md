# Agent-browser system v2 — profiles, isolation, and a live view VibeSpace owns

**Status:** DESIGN ONLY. No product code exists for any of this. Nothing here is shipped, and
nothing here should be read as a description of current behaviour.

**Owner request (three parts, verbatim intent):** (1.a) add a fingerprint browser such as
CloakBrowser to widen the set of sites agents can reach; (1.b) a better profile system —
different tasks get different profiles that run concurrently and independently, *and* one
profile can be driven by several sessions at once, like several windows, ending today's
interference; (1.c) put the browser picture inside VibeSpace so the user watches the agent work
and can intervene by hand — look at how Codex desktop does it.

**Base:** master @ `9516bd8d` (2.369.87).

**Reading order:** CLAUDE.md's three-tier routing table decides where each piece of this lands;
§ban-safety, the spawn-hygiene law and "never block the event loop" constrain it; the fork-tax
measurement (2026-09-10) sets the rule about who is allowed to spawn a process. **Round 2
(2026-09-09)** answered an adversarial critique of round 1 — eight findings, all upheld, plus
three defects found while verifying them; the verification evidence and the two places the
critique's own sub-claims were imprecise are in **Appendix B**. The changes that most affect a
reader who saw round 1: §3.2 grew a user-data-dir *decision* (round 1 specified a configuration
that cannot work), §4.3.1 is new (an announcement into a conversation is a billed turn and this
design owes it a gate), §3.4 no longer claims the lease is a boundary, and §10 publishes a range
instead of a point estimate.

**Round 3 (2026-09-10)** answers four owner questions and folds each one into the architecture,
the phases and the decisions rather than appending them: **Q1 session persistence UX** — how a
user pins a session to a profile in one action, how that pin survives resume and fork, how a
Task Group carries a default, and how a mid-session pin reaches a RUNNING agent without a restart
(§3.2.5, D14–D16); **Q2 the live backend switch** — the mechanics of handing one user-data-dir to
another binary, the one-way Chromium version ladder, what a changed fingerprint costs, the seat
gate, and the fact that "this page is blocked" is a CLAIM the agent makes and never a detection we
manufacture (§7.4, D17); **Q5 window binding** — tab groups gain a side-by-side layout so an
agent-driven browser cannot lose its owner (§4.6, D18–D19); **Q6 native client windows** — how to
render ONE native window over a poor link and, separately, whether an agent can read that client's
messages at all (§4.7–§4.8, D20–D21). Two new phases (P7, P8) and four new suites carry them, the
totals in §10 are re-derived, and §12 grew from 14 entries to 22 — §1's measurements are
unchanged except where this round re-measured them on this box.

**Round 4 (2026-09-10)** answers an adversarial critique of round 3: six findings, **all upheld**,
with the verification evidence in **Appendix C**. One is a rendering defect and the most
consequential of the set — a blank line terminated §11's table, so this round's whole set of eight
new decisions, **D14–D21, rendered as a wall of pipe characters** in every renderer. Three more
replace a borrowed mechanism with the one that actually holds (the badge's colour source, `split`'s
invariant, and `task-group`'s standing as an origin), one replaces §4.7's universal — which the
product itself falsifies — with a named exception, and the last makes §10's bounding sentence cite
a figure its own table publishes. **No decision's recommendation changed.**

---

## 0. Thesis

Today an agent that wants a browser runs a CLI that VibeSpace has never heard of, against a
single shared browser profile that every other agent is also using. VibeSpace contributes
nothing and therefore protects nothing: it cannot say whose window that is, cannot show the
user what is happening, and cannot stop one agent from closing another's tab.

The fix is not to write a browser. Upstream already ships every hard primitive we need —
isolated sessions, one-tab-per-session binding inside a shared browser, a localhost stream
server with an input channel, providers. What is missing is an **owner**: something that knows
which profile belongs to which task, hands each session a tab it is allowed to touch, keeps the
process alive for exactly as long as it should live, and renders the picture through VibeSpace's
own auth so the user can watch and take over.

That owner is VibeSpace. This document specifies it.

Three sentences carry the whole design:

1. **A VibeSpace session gets its own browser by default.** Isolation is the default, not an
   option, and it costs **four environment variables** at spawn — no new process of ours, no new
   daemon. Round 1 said "two"; §3.2 says why the other two (the user-data-dir and an explicit
   idle timeout) are not optional, and why the first of them is a decision the owner makes (D12)
   rather than something this document can leave unstated.
2. **A profile is a browser; a session is a tab in it.** "Several sessions on one profile" is
   several pinned tabs in one browser, each owned by exactly one session, with a lease so two
   sessions can never drive the same tab.
3. **The picture is a VibeSpace window fed by a server-side bridge** — the same shape as the
   existing `/api/vnc` bridge — so the stream port never reaches a browser and the stream token
   never reaches an agent.

---

## 1. What exists today, measured

### 1.1 The mechanism of the interference

Agents call the `agent-browser` CLI straight from their shell. There is no VibeSpace
integration of any kind: no route, no window, no registry, no env var. `git grep agent-browser`
over the tracked tree returns **exactly one hit, and it is a comment** — `docs/screenshot-helper.js`
line 2, "Run via browser console or inject via agent-browser". Not one line of product code has
ever known this tool exists.

The user-level config on this machine is:

```json
{
  "args": "--no-sandbox,--disable-blink-features=AutomationControlled,--ozone-platform=wayland",
  "profile": "/home/<user>/.agent-browser/default-profile",
  "headed": true
}
```

That file is not advisory. The CLI's own `--help` states the precedence, and it is the fact the
rest of this document has to be built on:

> lowest to highest priority: 1. `~/.agent-browser/config.json` (user-level defaults) ·
> 2. `./agent-browser.json` (project overrides) · 3. **environment variables (override config
> file values)** · 4. CLI flags (override everything)

So a key present in that file applies to **every** invocation that does not override it, and an
environment variable **is** a legitimate override — which is what makes P0 possible at all, and
which is also why P0 has to say something about `profile` rather than passing over it (§3.2).

Three properties of that file cause every symptom the owner described:

* **`profile` is a single path.** Every agent that does not pass `--profile` lands in the same
  Chromium user-data-dir: one cookie jar, one history, one window.
* **No `session` is set,** so every agent that does not pass `--session` lands in the *default*
  session of that profile — the same browser context and, before upstream's tab binding, the
  same active tab. Two agents interleaving commands take turns stealing the active tab from
  each other; `agent-browser close` closes it for both; `close --all` closes every session on
  the box.
* **`headed: true` on the Wayland desktop** means the window is real and visible in the desktop
  session — which is why the interference is *visible* to the user, and also why the desktop VNC
  window is the only way anyone has ever watched an agent browse.

### 1.2 The sprawl, measured

`~/.agent-browser` on this machine: **59 directories, 53 of them profile directories, 98 GB
total, of which 6.8 GB is the single shared `default-profile`.** The 53 profile dirs are the
fossil record of agents that *did* know to pass `--profile`: one per task, created ad hoc,
never registered, never garbage-collected, never described anywhere. They are proof that the
per-task-profile instinct is right and that nothing owns the result.

Re-measured 2026-09-09: 59 directories (56 of them carrying a Chromium `Default/` or
`Local State`), still 98 GB, still 6.8 GB in `default-profile`. The counts drift upward on
their own, which is the point.

**Correction to round 1, verified against the installed binary.** Round 1 wrote that no browser
daemon was running "consistent with upstream's 1-hour idle timeout". That inference does not
hold on the build we actually have: 0.32.0's own `--help` says
`AGENT_BROWSER_IDLE_TIMEOUT_MS  Auto-shutdown daemon after N ms of inactivity (**disabled by
default**)`. The 1-hour default arrives in 0.33.1 (§1.3). So on this machine, today, **nothing
shuts an agent's browser down** — an absent daemon means nobody had used it recently or
something else killed it, not that a timeout collected it. Everything §1.2 said about disk
stands; the sentence about CPU was an unsupported explanation and P0's envelope (§3.2) is
sized without it.

**The standing cost of a browser here, measured 2026-09-09 without launching anything** (four
idle headless Chromium instances left behind by this repo's own headless-chrome test legs —
which is itself the leak the gate-hygiene notes track):

| Per Chromium instance | Measured |
|---|---|
| OS processes | **6** (browser, 2 zygotes, gpu, network service, renderer) |
| RSS, summed over the 6 | **573 MB – 1.07 GB** |
| PSS, summed over the 6 (the honest figure — Chromium shares heavily) | **420 – 667 MB** |
| inotify **instances** held | **2** (browser process + network service) |

The last row is the one that bites first: `fs.inotify.max_user_instances` is **128 per uid** on
this box, and the gate-hygiene notes record suites already going red at 122/128. Twelve
concurrent per-session browsers is 24 instances — a fifth of the ceiling — on top of every
daemon, watcher and leaked fixture already holding one. §3.2 turns these numbers into a bound.

Caveats stated so the numbers are not over-read: these are *headless* instances sitting idle on
test fixtures. A headed Chromium showing a real page is heavier, and both figures grow with
tabs. The measurement to take before P0 ships is the same one at k = 1, 4, 12 under the exact
flags P0 passes (§9, §12.10).

### 1.3 Installed vs latest

Installed: **0.32.0**. Latest: **0.37.1**. The gap matters, because the single most important
primitive for (1.b) landed in **0.34.0** and is *not* in the installed build (`agent-browser
--help` on 0.32.0 has zero occurrences of `pin-tab`).

| Version | What it gives this design |
|---|---|
| 0.33.1 | Daemon **idle timeout, default 1 h** (`--idle-timeout`, `AGENT_BROWSER_IDLE_TIMEOUT_MS`, `0` disables). Headed and user-attached browsers exempt. This is why an unowned browser does not accumulate forever today. |
| 0.33.2 | Stream server **input priority** (reader task split from writer loop, so a click does not queue behind a frame write), per-client `{"type":"config","maxFps":N}` (1–120, 0 = uncapped) and opt-in `{"type":"config","pacing":"ack"}`; both settable on the connect URL (`?pacing=ack&maxFps=10`); frames carry a monotonic `seq`; `AGENT_BROWSER_STREAM_QUALITY` / `_MAX_WIDTH` / `_MAX_HEIGHT`. **Latest-wins frame delivery.** |
| **0.34.0** | **Persistent session→tab binding** for shared Chrome. `--pin-tab` per session; an externally closed tab returns a stable `tab_gone` error instead of silently adopting a neighbour; JSON carries `data.targetId` (stable across daemon restarts) and `data.lastUrl`. Explicitly fixes "parallel sessions sharing one Chrome hijacking each other's tabs". **This is the mechanism for (1.b).** |
| 0.35.0 | `--ca-cert` / `AGENT_BROWSER_CA_CERT` — private proxy CA trust into an isolated NSS store (matters if a profile rides a MITM-ing corporate proxy). |
| 0.35.2 | Dashboard / reverse-proxy hardening: same-origin provenance enforcement against DNS rebinding and form/header smuggling; reverse-proxied origins require exact HTTPS allowlisting **and generated token auth**; tokenless loopback still allowed. |
| 0.37.0 | `record start` / `record restart` at **30 fps** via `Page.startScreencast`, `--fps 1-60`, WebM/MP4, `doctor` reports ffmpeg. New tabs inherit the session's headers / credentials / UA / locale / timezone / geo / routes / init-scripts **before first navigation**. |
| 0.37.1 | Windows headless isolation + process cleanup on daemon exit or forced termination. |

**Version floor for this design: ≥ 0.34.0 for anything shared-profile; ≥ 0.35.2 before any
non-loopback exposure; ≥ 0.37.0 for recording.** Recommend pinning **0.37.1** and treating the
floor as a checked precondition, not an assumption (§9, §11 D1).

### 1.4 Primitives we get for free (verified against the installed build's own docs)

* `--session <name>` / `AGENT_BROWSER_SESSION` — isolated context: cookies, local/session
  storage, IndexedDB, cache, history, tabs.
* `--namespace <name>` / `AGENT_BROWSER_NAMESPACE` — isolates **daemon sockets and
  restore-state directories**. One daemon per socket path; different namespaces are different
  daemons.
* `--profile <name|path>` / `AGENT_BROWSER_PROFILE` — persistent user-data-dir.
* `--restore` — auto save/restore of cookies + storage keyed by the session name, with
  `--restore-check-url|-text|-fn` validation and periodic autosave
  (`AGENT_BROWSER_AUTOSAVE_INTERVAL_MS`, default 30 s).
* `session id --scope worktree --prefix <p>` — a *stable, derived* session id. Upstream's own
  recommended default for agents, because worktrees are how parallel agent runs are arranged.
  We deliberately do **not** use it (§3.2).
* `--cdp <port|url>` / `AGENT_BROWSER_CDP`, `connect <port>`, `get cdp-url`, `--auto-connect`.
* `stream enable [--port]` / `disable` / `status`; `AGENT_BROWSER_STREAM_PORT`. Streaming is
  session-scoped and, on current builds, always available on an OS-assigned localhost port.
* `--allowed-domains` / `AGENT_BROWSER_ALLOWED_DOMAINS`, `--action-policy`,
  `--confirm-actions`, `confirm` / `deny`.
* `-p <provider>` (browserbase, browserless, kernel, browseruse, agentcore, ios) and
  `plugin add` provider plugins — the shape a new provider slots into.
* `auth save|login`, `--credential-provider <plugin>` — credentials resolved by a plugin,
  never echoed.
* `mcp` stdio server, if we ever prefer MCP tools over a CLI.

### 1.5 The constraint that shapes the security section

From the installed build's own `--help` and `trust-boundaries.md`:

> `--allowed-domains` … **rejects CDP, auto-connect, profiles, restore/state replay**,
> direct-page providers, unsafe startup args, iOS/Safari

Enumerated from the installed binary's own refusal strings (round 2, `grep -a` over
`bin/agent-browser-linux-x64`), because §6.3 turns on exactly which flags are in this list:

```
--allowed-domains is not supported with --profile because Chrome may restore existing pages
                                       before network containment is installed
--allowed-domains is not supported with --cdp / --auto-connect  (same reason)
--allowed-domains is not supported with --state/storageState because loading state replays
                                       saved origins
--allowed-domains is not supported with --args containing <unsafe startup args>
--allowed-domains is not supported with direct-page browser providers / the Safari provider /
                                       the iOS provider
```

**`--session` is NOT in that list** — an isolated session with no profile, no state file and no
CDP can carry a domain allowlist. That single absence is what §6.3 rests on, and it is why the
`profile` key in §1.1 is not a detail: with it in force, *every* default invocation on this
machine is already in the refused set.

That is not a bug, it is honest: agent-browser cannot install its containment before page
scripts run when it did not launch the context itself. **Consequence for us: a per-task domain
allowlist and a persistent logged-in profile are mutually exclusive at the browser level.** Any
design that promises both is lying. §6.3 says what we do instead.

The same file states two rules we inherit wholesale: **page content is untrusted data, never
instructions**, and **secrets stay out of the model** (prefer file-based cookie import; never
echo a cookie value; HAR files and screenshots are secrets).

### 1.6 The fork tax (why the server almost never spawns)

Measured on this box (2026-09-10, `forkcost.js`): `child_process.spawn()` blocks the calling
thread for fork()'s page-table copy in proportion to the parent's RSS — **1.8 ms at 45 MB,
18.8 ms at 543 MB, 72.5 ms at 1.5 GB** — and both production servers sit at 1.5–2 GB. A design
in which the VibeSpace server shells out to `agent-browser` per browser action would pay ~70 ms
of event-loop block per action, and would be a repeat of the session-discovery incident that
blocked a user's UI for 11–17 s.

**Rule adopted here: the server spawns a browser process at most once per profile start, and
never per action.** Agents drive the browser from their own shells, where the fork cost is
theirs and tiny. The server's steady-state work is a WebSocket bridge and a JSON file write.

---

## 2. The three problems as invariants

| # | Problem | Invariant this design must make true |
|---|---|---|
| I1 | Agents share one profile and one session | **A session that asks for nothing gets a browser nobody else can touch.** Isolation is the default and requires no agent knowledge. |
| I2 | Agents step on each other inside a shared profile | **A tab has exactly one owner at a time.** Opening, navigating and closing are scoped to your own tab; someone else's tab is not reachable **by accident**, and `close` never means "close everyone's". The words "by accident" are load-bearing: inside one browser this is a cooperative protocol, not an enforced boundary, until §6.5's proxy exists (§3.4 states it precisely). |
| I3 | The user can neither see nor intervene | **Whatever the agent is looking at, the user can look at too, through VibeSpace's own auth, and can take the controls with a visible, reversible mode change.** |
| I4 | (implied) Nothing owns the lifecycle | **Every browser process has a named owner, a bounded lifetime and a visible state; every browser process *VibeSpace starts* additionally has a resource guard.** The split is deliberate and it is the honest half: P0's browsers are started by the agent's own CLI, so the keeper cannot see them. What P0 can give them is the *bound* (an explicit idle timeout, §3.2.3) and the *name* (`vs-<browserKey>`); the guard and the enforced ceiling arrive with the keeper in P1. Between P0 and P1 the default path is bounded but unguarded, and that is stated rather than implied. |
| I5 | (implied) Widening site access | **Fingerprint evasion is a provider choice per profile, never a global default, and never the first answer** — for any site with an account, a human login through the live view beats it. |

---

## 3. Architecture

### 3.1 Four objects

```
PROFILE            a browser identity: user-data-dir + provider + fingerprint seed + proxy
  └─ BROWSER       at most one running process per profile, owned by VibeSpace, with a CDP url
       └─ TAB      one per attached VibeSpace session, pinned, leased to exactly one owner
            └─ VIEW  N viewers (browser windows / clients) over one server-side bridge
```

* **PROFILE** is persistent state and a record in `data/browser-profiles.json`.
* **BROWSER** is a process with a keeper, a runaway guard and an idle timeout.
* **TAB** is the unit of ownership. `--pin-tab` makes it real at the CLI level; the lease makes
  it enforceable at the VibeSpace level.
* **VIEW** is a window type; several viewers share one upstream stream connection.

### 3.2 Session model — the default is four env vars, and one of them is a decision

At spawn (`src/ws-create.js`, the same stanza that already sets `VIBESPACE_API`,
`CLAUDE_WEBUI_SESSION_ID` and the per-session `vsst_` token), a session with integration ON also
gets:

```
AGENT_BROWSER_SESSION=vs-<browserKey>
AGENT_BROWSER_NAMESPACE=vs-<browserKey>
AGENT_BROWSER_IDLE_TIMEOUT_MS=<bound, §3.2.3>
<the user-data-dir decision, §3.2.2>
```

Still no process of ours, no route, no daemon — but round 1 called it "two variables", and that
sentence hid three defects: the **value** was wrong (it named a key that changes on every resume,
§3.2.1), and two variables were **missing**, each of which independently decides whether P0 works
at all (the user-data-dir, §3.2.2; the idle timeout, §3.2.3). None of the three is a detail: the
first leaks a browser per resume, the second makes the configuration impossible, the third leaves
every browser this feature creates with nothing to collect it.

#### 3.2.1 `browserKey` is the conversation, and the webui id is not it

Round 1 wrote `vs-<webuiId>` and justified it with "our identity is the conversation, not the
directory". The justification is right and the spelling contradicts it: `src/ws-create.js`
mints

```js
const seq = ++sessionCounterRef.value;
const id  = 'sess-' + seq + '-' + Date.now();          // ws-create.js:233-234
```

inside the **same `create` case** that handles resume (`data.resume && data.resumeId`) and fork.
CLAUDE.md states the same fact independently — "one conversation ⇒ many keys over resumes". So
with `vs-<webuiId>`, **every resume is a new browser**: a new namespace, a new daemon, a new
pinned tab, and a lease on disk that names a session id nothing will ever look up again. Because
a live lease is exactly what sets `AGENT_BROWSER_IDLE_TIMEOUT_MS=0` (§3.5), the leak is not
merely untidy — the stale lease reads as live and holds a Chromium open with nothing specified
to reap it.

The fix is the ladder this repository already has for "a conversation's own value survives a
resume":

* `browserKey` is minted **once**, `bk-<8 hex>`, and written to that session's `session-meta`.
* On a create carrying `data.resume && data.resumeId && !data.fork`, the server resolves the
  prior key: `data.resumeId` is the *conversation* id, `session-meta` filenames carry the webui
  keys, and `reading-repair.js`'s `_sessionKeyMap(dataDir)` is the existing join between those
  two namespaces (one conversation ⇒ many webui keys, newest first). Found ⇒ reuse; not found ⇒
  mint, and say so in the log.
* **A fork mints a new key.** A fork is a new conversation; it should not inherit another
  conversation's cookies or pinned tab.
* The shape is `src/resume-continuity.js`'s, deliberately: a continuation restores the
  conversation's own value, a new session gets a fresh one, and the *origin* of the answer is
  stated rather than inferred. This is a cite, not a re-invention — `browserKey` has no harness
  source, so it takes the registry's own record as its source.

`vs-<browserKey>` therefore survives resume, restart-in-place and reconnect, and changes on
exactly the one event where it should.

#### 3.2.2 The user-data-dir is a decision, never an omission

Round 1 said, in §1.1, that `profile` in `~/.agent-browser/config.json` is "a single path" every
non-`--profile` agent lands in — and then said, in §3.2, that a default session is "ephemeral —
no `--profile`". Both cannot be true. §1.1 is the one that survives verification (the CLI's
documented precedence, quoted there): with that key in force, a session that sets only
`SESSION` and `NAMESPACE` still resolves to the shared 6.8 GB `default-profile`, and P0 breaks in
two ways at once — it is not ephemeral (which is D3's whole rationale), and N per-session daemons
each try to launch Chromium against **one** user-data-dir, which Chromium's process singleton
does not permit.

So P0 must state which of these it does. They are not equivalent and the differences are the
whole feature:

| Variant | What the session gets | Chromium dir conflict | `close --all` blast radius | Can carry `--allowed-domains` | Cookie jar afterwards |
|---|---|---|---|---|---|
| **A.** `SESSION` only, config `profile` left in force | separate context, **one** shared browser | none (one daemon owns the dir) | still every session | no (a profile is present) | shared, grows for ever |
| **B.** `SESSION` + `NAMESPACE`, config `profile` left in force | own daemon | **CONFLICT** — N daemons, one dir | scoped | no | shared |
| **C.** `SESSION` + `NAMESPACE` + `AGENT_BROWSER_PROFILE=<per-session scratch dir>` | own daemon, own dir | none | scoped | no | per session, **must be swept** |
| **D.** `SESSION` + `NAMESPACE` + `AGENT_BROWSER_CONFIG` pointed at a VibeSpace-written config with **no** `profile` key | own daemon, **no** user-data-dir | none | scoped | **yes** | none — truly ephemeral |

Round 1 described **D**'s behaviour while shipping **B**'s configuration. That is the defect.

**Recommendation: D, with C as the fallback** (owner decision D12). D is the only variant that
delivers what §3.2 and §6.3 both promise, and it is one env var. Its costs are real and stated:

* `AGENT_BROWSER_CONFIG` **replaces** the default config files, so the generated file must carry
  the user's own `args` (`--no-sandbox`, `--ozone-platform=wayland`, …) forward or the browser
  fails to start on this desktop. It is generated per instance, not per session — one file,
  rewritten when the user's config changes, `writeJsonAtomic` like every other store.
* The CLI **exits with an error** if `--config` points at a missing or invalid file (its own
  `--help` says so). That is a hard dependency in the fail-*unsafe* direction: a bug in our
  writer breaks a tool that works today. The env var is therefore set **only after** the file is
  verified readable at spawn; if it is not, we fall back to C, and if C's directory cannot be
  made we set neither and log the reason — P0's guarantee degrades to A rather than to "no
  browser".
* C's scratch dirs are owned state and must be swept on session end plus at boot; they are **not**
  D3(b) ("auto-create a persistent profile per session") coming back through the side door,
  because they are named by `browserKey`, live under `data/`, and are removed. If they are ever
  *kept*, they are registry records with an owner, or they are the 53-orphan problem on a
  schedule.

Whichever way D12 goes, the P0 gate asserts the **resolved user-data-dir of two concurrent
sessions**, not the two env-var strings (§9). Round 1's gate would have passed on variant B.

#### 3.2.3 The bound, because P0 turns one browser into N

P0 is honestly "no new process **of ours**" — and it is also the moment one shared Chromium
becomes one per browsing session. §1.2's measured envelope (6 OS processes, 420–667 MB PSS and
**2 inotify instances** per instance, against a 128-per-uid ceiling this box already trips) is
what that costs. Three things follow, and none of them can wait for the keeper:

* **The idle timeout is set explicitly, at spawn.** It is a third env var, the same cost as the
  first two. Do not inherit the default: the installed 0.32.0 has it **disabled** (§1.2), and
  even on ≥ 0.33.1 the 1-hour default **exempts headed browsers** — and this machine's config is
  `headed: true`, so the exemption is the live case, not the corner. Proposed value: 15 min for a
  session with no lease.
* **Headedness becomes ours to state** (owner decision D13). N headed Chromiums on one Wayland
  desktop is N visible windows, which is what "several windows" in the owner's request asks for —
  and it is also N framebuffers no timeout will collect. Once §4's live view exists, headless +
  the live view is strictly better for the agent case; headed stays available per profile.
* **A per-instance ceiling on concurrent browsers**, with a stated behaviour at the ceiling
  (refuse the start, name the sessions holding browsers, offer to stop one). P0 can *state* the
  arithmetic and expose the count through `src/browser-facts.js`; only the keeper (P1) can
  *enforce* it, because enforcement needs something that counts. That gap is named in I4 rather
  than papered over.

#### 3.2.4 Why the two names

`--session` isolates the browser context; `--namespace` isolates the **daemon socket and
restore-state directory**. With both, one session's daemon crash, `close --all`, or idle-timeout
shutdown cannot reach another session's browser. `close --all` — the command most likely to be
typed by an agent tidying up — becomes scoped to the caller by construction. This is still the
highest-value line in the design, and it is still about five lines of code; §3.2.2 is the reason
those five lines are not the whole of P0.

Why *not* upstream's `session id --scope worktree`: two VibeSpace sessions in the same worktree
would derive the *same* id and re-create the interference. Our identity is the conversation, not
the directory — and §3.2.1 is what makes that sentence true rather than aspirational. Remote
sessions get the same variables through the existing `envPairs` / `fsWrite` paths that already
carry `VIBESPACE_API`; integration-OFF sessions carry nothing agent-visible and must carry
nothing here either.

**Default profile behaviour: none, under variant D** — no user-data-dir, no `--restore`, no
cookie jar, and `--allowed-domains` available. An agent that needs to stay logged in must ask for
a profile, and asking is how VibeSpace learns the profile exists.

#### 3.2.5 The pin — how a session gets a persistent profile, and how that choice survives

(Owner question Q1.) §3.2's default is **ephemeral**, and that is right: most browsing is "open it,
read it, throw it away". One class of session is not — a session that logs into a vendor portal or
holds a work account needs the **same** cookie jar every time. This section is about the fewest
actions in which a user can say so, and about how that sentence survives resume, fork and restart.

**This is a knob, and this repository already has the ladder for knobs.** `resumeSpawnPick` in
`src/resume-continuity.js` answers exactly this shape: an **explicit** choice beats everything;
with no explicit choice a **continuation** restores the conversation's own value; a **new** session
takes the instance default; and the **origin** of the answer is stated rather than inferred. The
profile pin uses that ladder verbatim:

| Rung | Source of the fact | origin |
|---|---|---|
| The user's or agent's explicit choice **for this session** | `session-meta.browserProfileId` | `chosen` |
| The profile this **conversation** last ran on (resume / restart) | the registry joined through `_sessionKeyMap` | `conversation` |
| The default profile of this session's **Task Group** | `browserProfileId` in `task-groups.json` | `task-group` |
| The instance default (setting `browser.defaultProfile`, empty by default) | settings | `instance` |
| Nothing at all ⇒ ephemeral, §3.2.2's variant D | — | `harness` |

`hasSource` is **always true** here, for the same reason it is for `browserKey`: this knob's source
is not some harness's transcript, it is **our own registry**, which is readable by construction.

**`task-group` is a FIFTH value in a frozen four-value vocabulary, so it is a two-site edit and the
edit has to be named.** `src/resume-continuity.js:56` is
`const SPAWN_ORIGINS = Object.freeze(['chosen','conversation','instance','harness']);` with the
comment "The vocabulary BOTH tiers speak (the client labels these strings in
`src/lib/agent-meta.js`; nothing else may invent one)"; the client mirror `spawnValueOrigin`
(`agent-meta.js:338`) whitelists exactly those four and falls through to `responseStyleOrigin` for
anything else — i.e. a fifth string does not throw, it **silently renders a wrong label**. So one of
two, decided in the same change: **(a)** `'task-group'` joins `SPAWN_ORIGINS` **and**
`spawnValueOrigin`'s whitelist (plus its zh/ja entries), or **(b)** the pin carries its own origin
type and does not borrow that vocabulary at all. This design takes **(a)**, because the pin's other
four rungs are verbatim the same concepts and two vocabularies for one question is how twins are
born. `test-browser-pin`'s fast leg asserts it: every pin origin the product emits is in
`SPAWN_ORIGINS` and the client mirror recognises it, with an off-vocabulary string as the negative
control.

**That rung must not change `resumeSpawnPick`'s signature.** That is a PURE function serving every
knob — model, effort, response-style — and adding a fifth rung to it makes every knob carry a
concept only the profile needs. The move is: resolve "Task-Group default vs instance default" into
one value **before** calling it, then **replace** `instance` with `task-group`. **This is not
`applyOriginHint`'s downgrade** (round 3 said it was, and that was wrong): that function's own
contract is verbatim "It may only DOWNGRADE a 'chosen' to a fact the user did not state, never
upgrade or re-point anything", i.e. chosen → instance/harness, whereas `instance → task-group` is a
**more specific** claim — the direction it forbids. The reason that does hold is a different one:
**`instance` and `task-group` both mean *the user did not state this for this session*,** so
replacing one with the other **adds information without changing the claim**, and it still never
touches the **value**.

**A fork inherits the pin but not the key.** These are two different things: `browserKey` is
**identity** (a fork is a new conversation and must not inherit another one's pinned tab, §3.2.1),
while the profile pin is a **preference** ("this kind of work uses this login"), and the branch that
forked off wanting it is exactly what a user means. So a fork mints a new `browserKey`, **copies**
`browserProfileId`, and the log says both sentences.

**UX: the pin has one entry point, and it appears on four surfaces that already exist.** They are
not four implementations — they are one command (`session.pinBrowser`, registered in
`contributions.js`'s command table) with four `registerMenuItem` registrations:

* **Sidebar session-card right-click** — the `'session-card'` menu, group `3_admin`, next to
  `session.switchBilling` (the same class of act: change an identity this session runs under). This
  is the fast path: right-click → "Browser profile" → the list of existing profiles, with
  **"New persistent profile from this session's browser…"** and **"Unpinned (ephemeral)"** on top.
* **Session Properties** — a `Browser` section beside the `Billing` one: the current profile, its
  **origin** (that column of the table above, spelled out: "your choice for this session" / "this
  conversation's own value" / "Task-Group default" / "instance default"), the backend chip (§7.4),
  the number of attached sessions, and the same picker. This is the **explaining** surface; the
  right-click menu is the **acting** one.
* **The live-view window's title bar** — the profile name *is* that window's title; clicking it
  opens the same picker. A user watching the browser work wants to change **that** one.
* **The New Session dialog** — one picker row, defaulting to the Task Group's default if this
  session is bound to one. That row sends an **explicit** value, so the server can only read it as
  `chosen`; the client therefore sends the origin it computed alongside it as `spawnOriginHint`,
  exactly as it does for model and effort (B-6b6d r3: what the client filled in on the user's behalf
  must say on the wire that it did).

**"New persistent profile from this session's current browser"** is the first item in that menu, and
what it does has a name: **adopt**. Under variant C that is a **move** of the `browserKey`-named
scratch directory under `data/` to `~/.agent-browser/vs-bp-<id>` plus a registry record — the login
that exists right now is kept in place. Under variant D **there is no directory to adopt** (that is
the whole point of D), so D's honest form of that item is "create an empty persistent profile and
**reopen** this browser", and the menu must say so rather than let the user believe the login they
just completed was saved. This is another instance of §7.1's capability law: a control that cannot
work is disabled with a reason instead of failing at use time.

**A mid-session pin must reach a RUNNING agent, and must not restart it.** Three paths, each with
its honest boundary:

1. **The environment variable cannot get there.** An already-spawned shell's environment is
   immutable. So we do not change it — we change **what it points at**: under variant D
   `AGENT_BROWSER_CONFIG` names a file, and for a pinned session that file becomes **per session**
   (named by `browserKey`), so a pin is one `writeJsonAtomic`; under variant C
   `AGENT_BROWSER_PROFILE` names a **symlink**, and re-pointing a symlink (symlink-to-temp + rename)
   is exactly what `repointPoolSymlink` in `src/account-material.js` already does — borrowed
   verbatim, never written a second time. **Its failure mode is inherited verbatim too: re-pointing
   does nothing to a browser that is already running.** The account-pool lesson is "a re-point takes
   effect on the CLI's **next** request"; here it is "on the **next browser launch**". So pinning a
   session that holds a live browser either waits for the keeper to collect that browser when it
   goes idle, or says plainly "the new profile applies from the next browser" — and which sentence
   the UI shows depends on whether a lease exists right now, which is a **fact that can be looked
   up**, not a guess.
2. **The agent asks.** `vibespace-browser status` prints the current profile, its origin and the
   lease. That is the pull half: always available, free.
3. **Push it, and by default spend nothing.** A pin is a **user action**, which means the user is
   sitting there typing — so it rides the `pendingNotice` channel `src/session-status.js` already
   owns: a `<system-reminder>` appended to the user's **next** message. Zero billed turns, zero new
   mechanism. Only when the session is **idle** and the user explicitly asks does it go through
   §4.3.1's delivery ladder (a new declared reason `'browser-pin'`, added to `SPEND_REASONS` in the
   same change as its producer), setting `browser.announcePin`, default **OFF**. This is the same
   rule as §4.3.1's "three moments, three answers" table, applied to a fourth moment.

**The Task-Group default (a 岗位 carrying a default profile for all its sessions)** is one field on
`task-groups.json` and one picker row in task-detail, beside `contextDir` and `externalVisibility`.
It is simply the third rung above: it **never** beats a session's own explicit choice, and never
beats the conversation's own history. Binding or unbinding a Task Group does **not** rewrite the pin
of a session already running — a default is where a new session starts, not a retroactive edit of
existing ones.

### 3.3 The profile registry

`data/browser-profiles.json`, written through `writeJsonAtomic` (tmp+rename) and flushed on
SIGINT/SIGTERM like every other store; broadcast on change (`browser-profiles-updated`) so every
open client updates live — the multi-client law.

```jsonc
{
  "version": 1,
  "profiles": [{
    "id": "bp-<8 hex>",                     // minted here; never user-supplied
    "label": "Vendor portal",               // human name, shown in UI, never a path component
    "dir": "~/.agent-browser/vs-bp-<id>",   // the user-data-dir; adopted dirs keep their path
    "provider": "chromium",                 // chromium | cloak | cdp | cloud:<name>
    "fingerprintSeed": 118293,              // provider-specific; null for plain chromium
    "proxy": null,                          // proxy URL; the SECRET half never leaves the server
    "host": null,                           // null = this machine; else a hostId (ssh host / device)
    "allowedDomains": null,                 // see §6.3 — refused on a persistent profile
    "owner": { "kind": "task|session|instance", "id": "…" },
    "sharing": "owner",                     // owner | instance (§6.2)
    "record": false,                        // per-profile screencast opt-in
    "lastChromiumMajor": null,              // §7.4's version ladder — the highest major that has written `dir`
    "lastBackend": null,                    // which provider wrote it last (forensics beside the major)
    "createdAt": 0, "lastUsedAt": 0, "notes": ""
  }],
  "leases": [{ "profileId": "…", "browserKey": "bk-…", "sessionId": "…", "targetId": "…",
               "since": 0, "input": "agent", "viewers": 0 }],
  "siteHints": [{ "host": "portal.example", "backend": "cloak",
                  "by": "agent", "at": 0, "why": "…" }]   // §7.4 — a CLAIM, with who made it
}
```

`browserKey` is the durable half and `sessionId` is the *current* carrier of that conversation
(§3.2.1): the lease is looked up by `browserKey`, and `sessionId` exists so boot reconciliation
(§3.5) can ask "is anybody still carrying this?" without a second derivation. A resume rewrites
`sessionId` in place; it never creates a second lease.

Three rules about this file:

* **It is a registry, not a copy.** Cookies, storage and fingerprint material stay in the
  browser's own directory. Moving 98 GB is not a migration, it is an outage.
* **`provider` IS the backend, and §7.4 changes that field.** There is deliberately no second
  `backend` key: one question, one answer — the rule this document applies to `browserKey` and to
  the reading slot applies here too. `lastChromiumMajor` is a *different* question ("what has
  written these bytes") and is the one fact §7.4's version ladder may not take from the directory
  alone.
* **`id` is minted, `label` is free text.** The label never reaches a path, an argv, or a
  spawned command — the display-strings-never-reach-a-spawn law (a host-labelled cwd once did,
  which is why the law exists).
* **A lease is not evidence that anything is running.** It is a claim about a process, written by
  one boot and read by the next; §3.5's reconciliation is what keeps the claim honest, and
  nothing may act on a lease it has not reconciled.

### 3.4 Lease semantics — I2, precisely

A **lease** is `(profileId, sessionId) → targetId`. It is created when a session attaches to a
profile and destroyed when the session ends or detaches.

* Attaching runs `--cdp <the profile's cdp url> --session vs-<browserKey> --pin-tab` and, if the
  session has no bound tab, `tab new`. Upstream then keeps the binding across commands and daemon
  restarts, and `data.targetId` is stable.
* **You may act only on your own tab.** With `--pin-tab`, acting after your tab was closed
  returns `tab_gone` with `data.targetId` — a typed error, not a silent adoption of the
  neighbour's tab.
* **`close` is redefined for shared profiles.** The wrapper CLI (§5) turns `close` into "close my
  tab and drop my lease", and refuses `close --all` on a shared profile with a message naming how
  many other sessions are attached. The underlying browser is stopped only by its keeper.
* **Input has one holder.** `lease.input` is `agent` or `user`. The live view's takeover flips it
  (§4.3). A session and a *human* share one tab, and the lease says which of them is driving.

**What the lease is, stated precisely, because round 1 overstated it.** Round 1 asserted "two
*sessions* never share a tab at all" as a *property*. It is not one. A profile's CDP endpoint is
unauthenticated by design (§6.1) and confers authority over **every** target in that browser, so
any session that can reach the endpoint can drive any tab in it, including during a human
takeover. On a single-uid box the endpoint is not even secret: it is discoverable from
`agent-browser get cdp-url`, from the daemon socket, and from `/proc/<pid>/environ` of any
process the same user owns.

So the correct statement is: **a shared profile is a shared-authority boundary, and the lease is
the protocol by which cooperating parties stay out of each other's tabs.** Inside one owner's own
sessions that is the same trust level every other VibeSpace agent surface runs at. Between
*different* owners it is not a boundary at all, which is why `sharing: "instance"` is gated on
§6.5's mediating proxy rather than shipped beside the cooperative lease (§6.2, D6).

### 3.5 The keeper (I4)

`src/server/browser-keeper.js`, modelled directly on `src/opencode-serve.js`, whose scar tissue
we should inherit rather than re-earn:

* **Lazy.** Nothing runs until a profile is started. No timer, no socket, no fs handle exists for
  a feature nobody has used — the rule the OpenCode plugin had to learn twice.
* **One process per profile, reuse-or-spawn,** with a record on disk so a VibeSpace restart
  **adopts** rather than orphans. `stop()` clears only records it owns (a record naming another
  process is never cleared).
* **Ownership before signalling.** Every `await` between "decide to take this" and "publish it"
  re-checks a cancel epoch; the pid of a recorded process is classified before any signal
  (`ours` / `other` / `unknown` / `blind`), and an unverifiable pid is *parked with a reason*,
  never killed and never overwritten. `src/cli-identity.js` already owns "is this process what I
  think it is" plus the liveness ladder (`kill -0` → `/proc` → `ps`); a browser pid asks that
  module, never a fresh `ps` grep.
* **Runaway guard.** A Chromium with 200 tabs is the same failure class as the OpenCode serve
  that burned 209 CPU-minutes: sample `/proc`; on sustained CPU or an RSS blowout, stop it, park
  it with a named reason, emit telemetry, tell the user. Chromium's normal floor is higher than a
  serve's, so the thresholds are **per-provider**, not global.
* **Idle.** Do not delegate to a default: set the timeout explicitly (§3.2.3 — it is disabled on
  the installed build and exempts headed browsers on newer ones). A profile with at least one
  **reconciled** live lease sets `AGENT_BROWSER_IDLE_TIMEOUT_MS=0` and is stopped by the keeper
  when its last lease drops (plus a grace, so a session restart does not cost a cold browser).
* **Boot reconciliation, before anything is kept alive.** `IDLE_TIMEOUT_MS=0` is the most
  dangerous single line in this design: it converts "a lease exists on disk" into "a Chromium
  never exits". So on start, and before any timeout is disabled, the keeper walks the persisted
  leases and, for each one, asks whether **its `browserKey` is carried by a live session**
  (`activeSessions`, the same map every other restore path consults). A lease nobody carries is
  dropped, its `targetId` closed, and its profile returned to the ordinary idle timeout — logged
  by key and by reason. This runs on the same boot path as `restoreSessions()` and it runs
  *before* the first `IDLE_TIMEOUT_MS=0`, not after. Round 1 specified only the half that keeps
  browsers alive across a restart; `test-browser-keeper` now proves both halves (§9).
* **A ceiling with a stated behaviour at the ceiling.** The keeper is the first thing in this
  design that can count, so the concurrent-browser ceiling from §3.2.3 is enforced here: at the
  ceiling a start is refused with the sessions currently holding browsers named, and an explicit
  "stop that one" offered. Refusing loudly beats an OOM on a box whose systemd unit exists partly
  to survive one.
* **Spawn hygiene.** `agentEnv()`-style sanitised environment; secrets (proxy password, provider
  license key) ride the environment or a file, **never argv** — argv is world-readable on this
  box and is exactly what the writer sweep reads.

### 3.6 Where each piece lands (CLAUDE.md's routing table, applied)

| Piece | Module | Tier | Gate |
|---|---|---|---|
| Registry schema, id/label validation, lease decisions, provider capability table, `browserEnvFor(session)` | `src/browser-profiles.js` | **PURE** (imports nothing) | `test-browser-profiles` (fast) |
| "What browsers exist / are running on this machine", version-floor probe | `src/browser-facts.js` | **SHARED** (the daemon bundles it) | parity suite — a one-sided edit fails it |
| Device op `browser-serve` (start/stop/status/cdp-url on a paired machine) | `src/agentd/agentd.js` handler + capability in the hello-ack + client method | **DEVICE** | `test-browser-providers` (heavy): real-daemon test + capability gate asserted (an old daemon is never asked — unknown ops hang) |
| Keeper, routes, the WS bridge, access layer (`hostId` is a parameter) | `src/server/browser-keeper.js`, `browser-routes.js`, `browser-access.js` | **ORCH** | `test-browser-live` (heavy, real binary) |
| Live view window, profiles panel | `src/lib/browser-live-window.js` (+ `registerWindowType`) | **CLIENT** | headless-chrome leg |
| Agent CLI + manual | `data/bin/vibespace-browser`, `docs/agent/browser-manual.md`, `AGENT_TOOLS` | agent surface | `test-browser-cli` |
| The pin ladder (§3.2.5) + the backend-switch decision and its version ladder (§7.4) | `src/browser-profiles.js` (PURE half) + `src/server/browser-backend.js` (ORCH: stop / restart / re-open the leases) | **PURE + ORCH** | `test-browser-pin` (fast) + `test-browser-backend` (fast decision, heavy switch) |
| Split tab groups (§4.6): `layout`/`split` on the chain, the divider, the born-into-a-chain path | `src/lib/tab-group.js`, `src/lib/layout.js` (persist + sync key) | **CLIENT** | `test-window-binding` (headless chrome) |
| Native-window forwarding (§4.7) + the chat adapters (§4.8) | `src/xpra-serve.js` (SHARED facts) + `src/server/xpra-bridge.js` + `src/adapters-chat/<name>.js` | **SHARED + ORCH** | `test-native-window` (heavy) |

`hostId` is a parameter, never a branch: `browser-access.js` picks the transport (local keeper /
`browser-serve` device op / ssh) and nothing downstream asks "is this remote?" again — the same
shape as `src/server/opencode-access.js`. `server.js` gains **wiring stanzas only**; its size
ratchet is a build gate.

---

## 4. The live view (1.c)

### 4.1 What Codex desktop actually does, and what we take

Researched from OpenAI's own documentation and contemporaneous coverage:

* The Codex desktop app has a **built-in browser panel** giving "a shared view of websites and
  local web apps inside a chat" — user and agent see the same rendered page.
* **Control alternates.** The user drives manually, or hands control to the agent (by asking, or
  by referencing the browser); when the agent drives, **a distinct agent cursor takes over the
  mouse**, and the design explicitly allows *multiple agents to hold their own cursors* rather
  than seizing the user's screen.
* **Approval gates.** It asks before using a website, and requires confirmation for sensitive
  actions — submitting information, purchases, permission changes, deletions — plus explicit
  approval before full CDP inspection in developer mode.
* **Isolation is the default:** "a browser profile that is separate from your regular browser. It
  doesn't automatically share your existing tabs or browser session."
* The agent reports its work through rendered screenshots and DOM inspection, reviewed alongside
  the code diff.

What we take: the shared view, the explicit control handover with a **visible cursor identity**,
the approval gate on sensitive actions, and profile isolation as the default. What we add,
because our situation differs: many concurrent sessions on one instance, so the view is *per
session* and the cursor identity is *per lease holder*, not global.

### 4.2 Transport: bridge the stream server (the `/api/vnc` shape)

Upstream's stream server is exactly what we need, and its constraints make the choice for us:

* WebSocket on `ws://127.0.0.1:<port>`; **clients must originate from localhost / `127.0.0.1` /
  `::1` / `file://` — anything else gets 403.**
* Server→client JSON: `frame` (base64 JPEG + `seq` + device dimensions, scroll position, capture
  timestamp), `status`, `tabs`, `url`, `console`. Frames are latest-wins; the rest is ordered.
* Client→server JSON: `input_mouse`, `input_keyboard`, `input_touch`,
  `{"type":"config","maxFps":N}`, `{"type":"config","pacing":"ack"}`, `{"type":"ack","seq":N}`.

Because the origin check refuses a real browser origin, the connection **must** be made
server-side — which is what we want anyway. `GET /api/browser/stream?session=<id>` upgrades a
cookie-authed WebSocket and bridges it to that session's stream port, in the shape of
`bridgeVncSocket()` including its backpressure discipline (pause the upstream side when
`ws.bufferedAmount > 8 MB`, resume under 1 MB — a fast framebuffer and a slow client is a memory
bomb otherwise, which the VNC bridge learned the hard way).

| Option | Verdict |
|---|---|
| **Bridge the stream WS through `/api/browser/stream`** | **Chosen.** Reuses a proven pattern; single login; the stream port and any future token never reach the client; the input path is the documented one with 0.33.2 priority; multi-viewer is one upstream connection fanned out. |
| Iframe upstream's dashboard (`:4848`) | Rejected. It is a *whole app* (activity feed, AI chat, session creation) with its own auth surface; embedding it puts a second control plane inside ours and hands the browser a direct route to the daemon. Useful as a *debug* target, not as the product. |
| VNC the headed browser through the existing desktop window | Rejected as the primary. It is what happens today and it is why interference is visible: one framebuffer, one input queue, every agent at once. Keep it as the fallback for headed profiles on a desktop. |
| CDP `Page.startScreencast` ourselves | Rejected. Re-implements 0.33.2's pacing/priority work and puts a per-frame CDP consumer inside the server's event loop. |
| Periodic screenshots | Rejected as the live view; kept as the *transcript* artefact (§4.5). |

**Multi-viewer:** one upstream connection per session, fanned out to N clients. The `maxFps` sent
upstream is the **max** across viewers; each viewer is served at its own rate. Input is accepted
only from the viewer holding the user side of the lease.

### 4.3 Takeover and handback

Three modes on the window, always visible, never ambiguous:

| Mode | Frames | User input | Agent commands | Badge |
|---|---|---|---|---|
| **Watch** (default) | yes | ignored | run normally | "Agent is driving" |
| **Take over** | yes | forwarded | refused with `browser_paused` | "You are driving — agent asked to pause" |
| **Hand back** | — | — | — | transition (§4.3.1 decides whether anything is *delivered*) |

* Taking over flips `lease.input` to `user`. An agent whose next command is refused must be able
  to read *why* without guessing — the `tab_gone` precedent: a typed, stable code beats a
  timeout. `browser_paused` carries who took over and when.
* Handing back flips it to `agent` and includes the **current URL** so the agent re-orients — the
  human may have navigated, logged in, or solved a captcha, which is the point.
* **Idle handback** after a configurable inactivity window, so a takeover somebody walked away
  from does not park an agent for ever.
* The badge says "agent asked to pause", not "agent paused", because §3.4 is honest about what
  the lease can enforce. Until §6.5's proxy exists this is a request the agent honours, and the
  UI does not get to promise more than the mechanism delivers.
* The **cursor identity** borrows Codex's idea: while the agent drives, the view draws a labelled
  agent cursor at the last CDP input coordinates; while the user drives, the user's own pointer is
  the cursor and the agent's is hidden. Two viewers watching one tab see the same picture.
* **Sensitive-action approval** rides upstream's own mechanism rather than a second one:
  `--confirm-actions <categories>` plus `confirm` / `deny`. A pending confirmation surfaces as a
  card in the live view *and* in the conversation, and either one can answer it.

#### 4.3.1 Announcing a handback is spending money, and this design owes that a gate

Round 1 wrote "announced into the conversation" three times and never once said what an
announcement **is**. In this codebase it is a turn nobody typed. CLAUDE.md's routing table names
that category explicitly — "*a turn nobody typed* (auto-resume's continue, the Stop nudge,
Background Work notifications, agent messages … anything that starts a BILLED turn with no
per-occurrence owner action)" — and routes it to `src/spend-authorizer.js` +
`src/server/spend-guard.js`. Verified against the source, round 2:

* The delivery ladder `src/server/conversation-deliver.js` is the **one** implementation
  (`deliverToConversation`) and it is fully instrumented: `authorizeSpend` before the rungs, the
  authorization **held** until settlement, `releaseSpend` at the single `finally`.
* `SPEND_REASONS` in `src/spend-authorizer.js` is a **closed** frozen set of exactly five
  reasons; an undeclared one fails closed (`unknown-reason`). The set's own comment says it holds
  only reasons a producer passes **today**, and `scripts/test-spend-paths.mjs` asserts *both*
  directions — a declared-but-unused reason fails as loudly as an undeclared one. So the reason
  and its producer land in the **same change** or neither does.
* That suite's census is **per site, not per file**: `deliver-ladder: /deliverToConversation\s*\(/`
  is one of its primitives, so a call in `src/server/browser-*.js` with no gate in scope above it
  **reddens the fast tier, i.e. blocks the push** (`scripts/ci.mjs` lists the suite as `fast`, and
  the fast tier is the tracked pre-push hook). There is no version of this feature that quietly
  skips the gate.
* The lane matters for the bill: `backend-caps.notificationDelivery()` returns `steer` only for a
  `rpc-queue` harness (codex) with `inputModes.steer`. For a claude peer the lane is `cli-inbox`,
  and an **idle** recipient means a billed turn. "It only steers into a running turn" is true for
  one harness and false for the other.

Round 1's own text made the worst version reachable: an **idle handback fires on a timer**, so it
is a billed turn produced by nobody's action, repeatable, once per abandoned takeover, with no
ceiling anywhere in 800 lines.

**What this design does instead — three moments, three different answers:**

| Moment | Owner acted? | Delivers into the conversation? | Why |
|---|---|---|---|
| **Take over** | yes (the click) | **No** | The agent learns from the typed `browser_paused` on its next command — immediate, precise, free. A delivery would tell it something it is about to be told anyway. |
| **Explicit hand back** | yes (the click) | **Yes**, through the ladder | The agent may be *idle and waiting*; nothing but a turn wakes it, and the URL it needs to re-orient rides that turn. This is a per-occurrence owner action, which is exactly the thing CLAUDE.md's category excludes — but it still opens a billed turn, so it still goes through the ladder and still takes a ceiling. |
| **Idle handback** | **no** (a timer) | **No, by default** | Zero-spend by construction: flip the lease, update the live view and the session card, file one "For you" item saying the takeover lapsed, and let the agent discover it when its next command **succeeds**. Setting `browser.announceIdleHandback`, default **OFF**, routes it through the same reason and the same ceiling for anyone who wants the turn. |

Mechanically:

* One new declared reason — `'browser-handback': { turn: true, what: 'the browser control
  handback announcement' }` — added to `SPEND_REASONS` in the same change as its producer.
* **Every** announcement goes through `deliverToConversation(cid, text, { spendReason:
  'browser-handback', kind: 'notification' })`. Never a second delivery path: the ladder owns the
  rung ladder, the stash, the peer card and the settlement, and a browser module that re-implements
  any of that is a twin by construction.
* `kind: 'notification'` is correct here (VibeSpace is speaking, nobody is waiting for a reply),
  which buys the codex-with-a-running-turn case for free and changes nothing for claude.
* A refusal **loses nothing**: the ladder stashes, and the words ride the next turn. The lease
  flip is a *state change* and happens regardless — the agent is never left blocked because a
  budget was spent.
* One precision the critique got slightly wrong, recorded because the difference matters:
  routing through the ladder with **no** `spendReason` is not refused — the ladder defaults to
  `'peer-message'` (`conversation-deliver.js`, "an unknown/absent reason is 'peer-message'"). That
  is arguably worse than a refusal: the turn is charged, but to another producer's name, and the
  journal and the "For you" notice both lie about who spent it. Declaring the reason is what makes
  the ledger readable, not merely what makes the call legal.

### 4.4 The window

A new window type `browser-live`, registered in its owning module via `registerWindowType`, so the
title-bar icon, the taskbar, the tab bar and `replayOpenSpec` all learn about it from one
registration — the registry exists precisely so a kind is not added in three places (and so an
unknown openSpec action is loud instead of silently vanishing).

* `openSpec: { action: 'openBrowserLive', sessionId, profileId }` → persists and replays across
  refresh, desktops and other clients.
* `persist: true`. It is not transient: a user who refreshes mid-takeover must get the window back
  — in **Watch** mode, because a reload must not silently re-seize the controls.
* Chrome: mode switcher, URL line (from the stream's `url` messages), tab list, viewer count,
  recording indicator, and a hand-off to the existing embedded browser window for "open this URL
  myself".
* **DPI:** the desktop window's lesson applies verbatim — under body zoom, mixing viewport px
  (`clientX`, rects) with layout px (`clientWidth`) lands the remote pointer off by the zoom
  factor, growing with distance from the origin. The canvas lives at net zoom 1
  (`zoom: calc(1 / var(--ui-scale, 1))`), and pointer coordinates are converted once, in one
  helper, with a test.
* **XSS:** page titles and URLs are page-controlled strings that sync to every client. They go
  through `escHtml`, never `innerHTML`, and the frame is drawn to a `<canvas>` / `<img>` via the
  `.src` property — never interpolated markup (the image-overlay law).
* **Theme/UI conventions:** theme vars only, SVG icons only, `createModalShell` for any dialog,
  no native `confirm()` — the standing UI laws.

### 4.5 Recording for the transcript

0.37 gives `record start` at 30 fps via `Page.startScreencast`, `--fps 1-60`, WebM/MP4, with
ffmpeg availability reported by `doctor`. Per-profile opt-in (`record: false` by default), written
under `data/browser-recordings/<profileId>/<sessionId>-<ts>.webm`, linked from the conversation,
with an age-based sweep like every other buffer store.

Default **off**, for two reasons: video of a logged-in profile is a secret (upstream's own trust
boundary says so about screenshots already), and 30 fps WebM of a long session is a storage bill
nobody has budgeted. A cheap always-on middle ground exists: keep the last frames the bridge
already holds in memory and write one JPEG per agent action as a transcript thumbnail.

---

### 4.6 Window binding — one group, two panes side by side

(Owner question Q5.) The live view is its own window (D9), and that is right — but a browser window
an agent is driving **loses its owner** the moment somebody drags it away. The owner's proposal is
to extend **tab groups** (`src/lib/tab-group.js`) so a group can show two tabs side by side while
still being **one** group. This section is the data model, the interaction, the lifecycle, and why
it needs almost no new geometry code.

**Why this is nearly free: the DOM is already the right shape.** The chain model is
`chain = { tabs: [hostId, ...guestIds], active }`, the host owns the physical `.window` element, and
**every guest's `content` element is already appended into the host's element**, with the
`.tab-hidden` class deciding which one is visible (`restoreTabChain` does exactly this, line by
line). So "two tabs side by side" is, at the DOM level, **not adding `.tab-hidden` to two of them**,
putting them in a flex row, and drawing a divider between. The window's **external** geometry does
not change at all.

**Data model: the chain gains two fields; `tabs` and `active` do not change by a byte.**

```jsonc
chain = {
  tabs: ['win-1', 'win-2', 'win-3'],   // unchanged: tabs[0] is the host
  active: 0,                            // unchanged: in split, = the focused pane
  layout: 'tabs',                       // NEW: 'tabs' | 'split'; a missing field reads as 'tabs'
  split: { pair: ['win-1','win-2'], ratio: 0.5, dir: 'row' }   // NEW: meaningful only when layout==='split'
}
```

`tabs` and `active` keep their meanings because **every existing code path reads them** —
`switchTab`, `_detachFromChain`, `_renderTabBar`, the focus handover in `removeFromTabChain`, the
layouts persistence, the multi-client sync. A split is **another rendering mode of the same chain**,
not a second kind of chain. A chain may perfectly well have five tabs with two of them paired: the
rest stay in the tab bar, and what clicking one of them does is an owner decision (D19).

**`split` is a REFERENCE into `tabs`, so it owes an invariant — and nothing enforces one today.**
`pair` holds window ids, and every chain mutation splices `tabs` and touches nothing else:
`addToTabChain` (`chain.tabs.splice` / `push`), `_detachFromChain`, and the **host-promotion**
branch that `removeFromTabChain` reaches through `_detachFromChain` (`src/lib/tab-group.js`
477-497: when `idx === 0 && chain.tabs.length > 1` it promotes `tabs[1]` to host, re-parents every
guest's `content` into the new host's element, and splices the old host out). The chat window is
**normally the host** (it existed first, and the browser is merged into *its* chain), so "close the
chat tab of a three-tab split chain" is a **reachable** path: it removes a `pair` member while the
chain survives. The lifecycle paragraph below enumerated only two cases — "the browser pane goes
away" and "the session is terminated" — and the second is true of **termination** but not of
**closing the window**, while host promotion and "drag the other pane out" were not covered at all.

The invariant: **`split` is validated against `tabs` on every chain mutation.** Any `pair` entry not
in `tabs` ⇒ `layout` collapses to `'tabs'` and `split` is dropped (never a dangling id, and never a
guessed substitute — the guessed pane is the very thing "whose browser is that" has to answer); and
when the **host changes**, even if both `pair` members survive, those two panes must move into the
new host's element with the rest of the `content` and be re-laid-out — because a split renders
**inside** the host's element (that is this section's "the DOM is already the right shape", read in
the other direction). This rule lives in **one** place: a new `_normalizeChain(chain)` called by
`createTabChain` / `addToTabChain` / `_detachFromChain`. It does **not** exist today
(`grep -rn '_normalizeChain' src/` returns nothing), which is exactly why the rule has to be
written down — three call sites each hand-writing the check is the twin drift this repository has
paid for repeatedly.

**Persistence goes through the one choke point that already exists.** `layout.js` already writes
`winState.tabChain = { tabs, active }` plus `isTabGuest` into layouts and restores through
`restoreTabChain(validTabs, active)`; the two new fields ride along, and the write still goes
through `writeLayouts` — the one choke point every layout write passes through, and where the layout
rollback points hang. **A missing field is `'tabs'`**, so old records need no migration.

**Multi-client sync has a real trap, and it is named now.** `layout.js` keys remote-vs-local chains
by `rw.tabChain.tabs.join(',')`. **That key does not carry the layout.** So a remote client flipping
the same set of tabs from tabs to split reads locally as "this chain has not changed" and nothing
happens — a silent state fork, exactly the class this repository keeps hitting. The key must become
`tabs.join(',') + '|' + layout + '|' + (split ? a quantised ratio : '')`, or the comparison must
compare those two fields explicitly. This one owes an assertion that can go red, not a comment.

**gridBounds needs no change at all.** `_syncChainBounds` copies the host's `gridBounds` to every
guest; a split chain is still **one** rectangle from the outside, and the ratio only divides it
inside. So the proportional grid tracking, snap, desktop switching and minimise all keep working —
which is the whole reason "extend tab groups" beats "invent a new two-window container".

**The divider drag follows this repository's three existing laws:** a **per-drag**
`AbortController` (never a per-render one — that tears itself down mid-drag), rAF-coalesced
mousemove, and **one coordinate conversion**: `uiScale`'s body zoom scales rects and `clientX` but
not `clientWidth`, so the ratio must be computed in one kind of pixel (layout px) — the same law as
the VNC pointer incident and as §4.4's canvas. The ratio is clamped to `[0.15, 0.85]`, and
**double-clicking the divider returns it to 0.5**.

**Interaction:**

* **The bind affordance** lives on the live-view window's title bar (a "snap beside <session name>"
  button). Clicking it merges this window into the chain that holds that session's chat window, sets
  `layout` to `'split'` and `pair` to those two. The existing drag-icon-onto-icon merge keeps
  working and produces `'tabs'`; **dropping on the left or right half of the title bar** produces
  `'split'` (matching the window manager's existing snap feel), and that is the one new drop zone.
* **Auto-bind**: setting `browser.autoBindLiveView` (default **ON**). When a session's browser
  starts and its chat window is open, the live view is **born inside that chain** rather than
  created-then-merged — the latter produces a visible jump plus a layout-autosave churn. This
  requires `createWindow` to accept "born into this chain", which is the one piece of genuinely new
  window-manager code in this phase.
* **Detach at any time**: drag either pane out of the tab bar, or use "unbind" on the title bar, and
  you are back to two free windows — through the `_detachFromChain` that already exists.
* **Moves, minimises and desktop switches happen together**, because they are one window. That is
  precisely the property the owner asked for.

**Lifecycle: when the agent session ends or the browser closes, the pane collapses and the group
stays.** The chain is never dissolved — dissolving it would move the user's **chat** window, which
they never asked for. So when the browser pane goes away, `layout` returns to `'tabs'` and the
remaining tabs are unchanged; if only one is left, the existing `_ungroupLast` runs. In the other
direction, when the **chat** side ends (the session is terminated) nothing moves: a dead session's
history is still readable, and the browser may still belong to somebody else. A third case was
missing and is now answered by the invariant above: **closing the chat window** (as opposed to
terminating the session) goes through host promotion, so a `pair` member disappears ⇒ `layout`
collapses to `'tabs'` and the browser window stays in the chain as an ordinary tab; **dragging
either pane out** converges the same way, through `_detachFromChain` → `_normalizeChain`. Three
paths, one decision.

**The ownership badge.** The browser tab carries the session's colour and name, so "this browser
belongs to that session" holds at a glance. **The colour is derived per SESSION, and deliberately
not the one the session card uses today — because the session card has no colour.** The only
consumers of `seqTaskColor` / `taskGroupColor` are `sidebar-tasks.js`, `task-detail.js` and
`session-props.js:499`, and every call is keyed on a **task-GROUP** record
(`seqTaskColor(t.colorSeq, …)` / `taskGroupColor(g)`); `session-card.js` never calls either
(`grep -n 'seqTaskColor\|taskGroupColor\|colorSeq' src/lib/session-card.js
src/lib/sidebar-render.js` returns nothing). Borrowing the group colour fails on exactly the two
shapes the badge exists for: a session bound to **no** task group — the ordinary ad-hoc case — has
no colour to draw at all, and **two sessions in the same group** get the **same** colour, which is
precisely the case the badge is there to disambiguate. So what is reused is the pure sequence
function itself, keyed on the **session's own** counter: the webui id is `sess-<seq>-<ms>`
(`src/ws-create.js:234`), and `seqTaskColor(k)` on that `<seq>` gives this session its own slot
(the sequence's property is that every prefix stays far enough apart, so the first N sessions are
pairwise distinguishable). The task-group colour is untouched and stays beside it as the **group**
badge — two questions, two colour sources. Honest boundary: `<seq>` survives a **server restart**
(`boot-restore.js:200` reuses `meta.webuiSessionId`) but a **resume** mints a new webui key, so the
colour changes there. That is acceptable, because the badge answers "which of the windows on my
screen right now is which", not a durable cross-resume identity. **A profile used by several
sessions shows all of its owners**: the
badge becomes N dots, listed one per line in the title, sourced from §3.3's `leases` ("who is
attached" is already a recorded fact; this only draws it). That is also this design's
**visibility** answer to (1.b)'s "one profile driven by several sessions" half.

* **Mobile = tabs only.** Split is meaningless at ≤768px, so `mobile-nav.js` renders a split chain
  as tabs. But one rule has to be written down: **a mobile client never writes its own flattening
  back to layouts.json** — otherwise somebody glancing at their phone destroys the split on the
  desktop. This is the same class as the four anti-ping-pong guards in multi-client layout sync, and
  it is implemented as: on mobile, preserve the remote `layout` / `split` fields verbatim when
  syncing layouts.

### 4.7 Native client windows — rendering one window, not a whole desktop

(Owner question Q6.) A chat tool like WeChat has a native Linux client; WhatsApp does not. The
question is how to put **one** native window inside VibeSpace's browser UI over a **poor network**
(target: typing still usable at 200 ms RTT / 1 Mbps).

**One conclusion belongs first, because it re-orders the whole table: at 200 ms RTT every path an
AGENT can also drive pays one RTT per keystroke.** The page runs on the server's machine in this
deployment with the user at the other end, so the echo takes a round trip. What differs is not
whether it works but **how it degrades**: whether bandwidth follows **one window** or **a whole
desktop**, and whether the protocol drops quality under high latency instead of queueing. The
industry's own rule of thumb for remote desktops says the same thing: latency beats bandwidth.

**That conclusion has one named exception, and it belongs here rather than under a universal the
product itself falsifies: VibeSpace already ships a path with genuine local echo.**
`src/lib/browser-window.js`'s `openBrowser(app, url, { syncId, proxy })` is an embedded browser
window with a URL bar and a proxy toggle; with the toggle on it fetches through the full-rewriting
node-unblocker proxy mounted at `/proxy/` (`server.js:636-647`, its auth ordering at `:236`, its
WebSocket upgrade dispatch at `:1853`). What renders there is **DOM in the user's own browser**, so
typing echoes locally and owes no round trip at all. It is rejected here for two specific reasons
rather than by assertion: **(i)** the page runs in the user's browser, so cookies and localStorage
live client-side and there is **no CDP target** — the agent cannot drive it, and "the agent can
drive it" is the entire point of §3's profiles; **(ii)** a rewriting proxy does not carry WhatsApp
Web's service worker or its persistent WebSocket (§12.23 records that I did not measure this half).
So it stays in the product as the "let a human glance at a web page" tool, not as a candidate for
this section.

So the real recommendation is an **architectural** one rather than a protocol one: **a path where
the agent talks to a protocol or a DOM always beats one where it talks to pixels.** For a web chat
tool the agent drives CDP and the picture is only for the human; for a native client the picture
**is** the only interface for both — which makes native clients structurally worse for agents, not
merely slower.

| Path | What it is | Rank on a poor link | Verdict |
|---|---|---|---|
| **(v) Run its web version inside a profile of this design** | WhatsApp Web *is* a web app; it lives in a fingerprint profile and needs no native client at all | **1 (best)** | **First choice wherever a usable web version exists.** Zero new stack: §3's profiles, §4's live view and §7.4's backends all apply unchanged, and the agent drives CDP rather than pixels |
| **(iii) Xpra seamless + the HTML5 client** | Per-**window** forwarding of X11 apps, adaptive encodings (webp / jpeg / h264 / vp8 / av1), WebSocket transport, runs headless under Xvfb / Xdummy | **2** | **First choice for a genuinely native client.** Bandwidth follows that **one** window instead of a desktop; MPL-2.0; http digest / scram auth and http origin validation since 6.6; current release 7.0 (2026-08-27) |
| **(ii) KasmVNC / TigerVNC with adaptive encodings** | Still a whole desktop, but with a WebP / JPEG quality ladder and a video mode | 3 | A fallback. Better than today, but still paying a whole desktop's price for one window |
| **(i) Today's whole-desktop noVNC** (`src/vnc.js`) | One framebuffer, one input queue | 4 (worst) | Kept as the escape hatch (D10 already decided this), not as the answer to this question |
| **(iv) The Wayland family** | waypipe / wayvnc / weston-rdp / Broadway | — | **None of them reaches a browser.** waypipe needs a Wayland compositor on the client side and a browser is not one; wayvnc and weston-rdp turn the problem back into VNC / RDP; Broadway serves GTK apps only |

**Xpra's wiring is the same shape as §4.2.** Xpra's HTML5 client connects to its own server over
WebSocket; we do **not** expose that port to a browser but bridge it server-side, the way `/api/vnc`
and `/api/browser/stream` already do (`GET /api/xpra/stream?window=<id>`, cookie-authed, the same
backpressure discipline). This is not an arrangement we invented: `jupyter-xprahtml5-proxy` is
exactly "wrap Xpra in Jupyter's own auth". The client half has two options — self-host upstream's
HTML5 client as static assets (MPL-2.0; its own docs describe installing it under another web
server's path; known issue: inside an iframe it hits a `sessionStorage` access restriction) — or
render it ourselves with `xpra-html5-client` (npm, Apache-2.0, 2.3.0, a TypeScript client library),
which fits §4.4's "the window is ours" shape better. **This is an owner decision (D21)**, because it
is the trade between hosting somebody else's whole frontend and writing our own rendering layer, and
this repository has a stated bias against the former (§4.2's reasons for refusing to embed
upstream's dashboard apply verbatim).

**Recommendation per app:**

* **WhatsApp — take (v).** There is no official desktop client on Linux, and WhatsApp Web is a
  proper web app; multi-device supports up to four linked devices, working independently of the
  primary phone for **up to 14 days**. Those 14 days are a real operational cost and belong in the
  UI ("this linked device needs to see the phone before <date>") rather than being discovered when
  it silently drops.
* **WeChat — take (iii)**, running the official native Linux client (Tencent, November 2024;
  deb / rpm / AppImage) under Xpra's seamless mode. The web version (`wx.qq.com` /
  `web.wechat.com`) is widely reported to refuse login for many accounts, **but that is an
  account-level policy and I could not verify its current scope** (§12) — so the flow must be "try
  the web version once with the owner's own account, and only fall back to the native client if it
  refuses", not "assume a native client is required".

**This path's resource bill is measured with §1.2's ruler.** An Xvfb plus a chat client plus an Xpra
server is another set of processes, RSS and inotify instances (and this box has already tripped the
128-per-uid ceiling). So it shares §3.5's ceiling and runaway guard rather than inventing a second
set — the keeper is already the thing in this design that can count. (Measured read-only on this
box: `Xvfb` is installed; `xpra` and a WeChat client are **not** — so every number in this section is
**unmeasured** until P8 actually installs them.)

### 4.8 The data side — reading a local client's own store

Bringing the picture in answers "can a human use it". "**Can an agent read those messages**" is a
different question, and its answer differs **per app** for verifiable cryptographic reasons, not for
reasons of taste.

**WhatsApp Web: metadata is readable; bodies are readable only inside the page.** WhatsApp Web keeps
messages in IndexedDB with the bodies encrypted under AES-CBC; the cleartext part includes contacts,
groups, and message metadata (senders, recipients, timestamps, chats). The keys are the crux: they
are stored through the **CryptoKey API** as **non-extractable** keys — an API whose purpose is to
let JavaScript **use** them without being able to **export** them. The known way to read the bodies
(a widely cited public write-up) is to **run code inside the page**: monkey-patch
`crypto.subtle.decrypt` and keep the key once it is called with arguments that decrypt.

The adapter's shape is therefore **decided by that fact**, not chosen by us: **it is an init-script
injected into this profile that reads the store from inside the page and posts the result out** —
which happens to be a capability this design already holds (since 0.37 a new tab inherits the
session's init-scripts **before first navigation**; CDP is already there). Its honest cost belongs
in writing: this is automating WhatsApp's own web client inside the user's **own** logged-in
session — no third-party protocol implementation, no new device registration, so it is **not** the
Baileys risk class; but it is still automation of the web client and still in ToS grey territory.

**Why not a protocol library.** `whatsapp-web.js` is essentially the same class as our path (it also
drives a real WhatsApp Web), whereas **Baileys implements the protocol from scratch**, i.e.
registers as a **new linked device**. Public reports agree that this class — "tools that
reverse-engineer WhatsApp Web (Baileys, WAHA, Evolution API) carry critical ban risk and typically
last 2–8 weeks before detection" — is the risky one, and Meta's detection surface includes device
fingerprinting at registration plus behavioural analysis of messaging. So the trade is clear:
**reading the real client's own DB, inside its own page**, beats **standing up a second protocol
client**. And if the actual use case is "message customers", the correct answer is the official
WhatsApp Business API (a different product, a different number, near-zero ban risk under policy),
not wiring the owner's personal number to automation.

**WeChat: technically possible, and my recommendation is not to build it.** The official Linux
client's local store is SQLCipher (Tencent's WCDB), the key lives in process memory in a
recognisable format, and public tools do extract it and decrypt `msg_*.db` on Windows, macOS and
Linux. Three reasons not to make it part of the product:

1. **It is scraping a proprietary client's process memory.** This class breaks by construction on
   every client update, and the shape of "breaking" is **quietly reading garbage**.
2. **A measured boundary on this box: `/proc/sys/kernel/yama/ptrace_scope` is `1`**, i.e. only an
   **ancestor** may ptrace (reading `/proc/<pid>/mem` also requires `PTRACE_MODE_ATTACH`). A WeChat
   the user started themselves is unreadable to VibeSpace; to make it readable, **we** would have to
   start it — and "we start it so that we can read its memory" is a sentence that argues against
   itself as a default.
3. **It plainly crosses the ToS**, and in some jurisdictions it is a legal question rather than an
   engineering one.

So WeChat's recommendation splits: the **picture** goes through §4.7's Xpra (for the human), and the
**data** goes through official channels (the Official Account / Work WeChat open APIs) if what the
owner wants is an agent handling business messages. If the owner explicitly wants the local-store
path, it is a **separate, explicit owner decision (D20)** and it should live in a **plugin** rather
than in core — which is exactly the line D2 drew for CloakBrowser: proprietary things with a legal
face go through a consent flow.

**How the adapter plugs in.** VibeSpace already has this interface and it is not new: Communication
Channels v1 (`src/msg-acl.js` + `src/server/conversation-deliver.js` + `data/bin/vibespace-msg`) was
designed with "external sources — Gmail/Lark/Slack — later feed the same ladder with their own
`source` tags; every stash envelope already carries one" written into it. So a chat adapter is
**not** a new subsystem:

* It is an **async local-client source**: a `create(deps)` factory exposing `start()` / `stop()` /
  `state()` and an event that produces **envelopes**
  (`{source: 'whatsapp', threadId, from, text, at, attachments}`); `src/gmail-sync.js` is the shape
  this repository already has for it (a remote store synced into local facts).
* Outbound goes through the **same delivery ladder** `deliverToConversation`, and therefore inherits
  the stash, the peer card and §4.3.1's spend gate for free — an inbound WhatsApp message waking an
  **idle** session is a billed turn, so it needs a declared reason (`'chat-inbound'`), added to
  `SPEND_REASONS` in the same change as its producer.
* Reachability uses `msg-acl.js`'s Task-Group boundary rather than a second one — and inherits its
  honesty verbatim: that is a **coordination** boundary, not a security one.
* Every adapter carries a **capability** row (§7.1's law): can it read history, can it send, are
  bodies readable, how often must it see the phone. A control that cannot work is disabled with its
  reason instead of failing at use time.

## 5. The agent-facing surface

### 5.1 `vibespace-browser` (STATIC tracked, in `AGENT_TOOLS`)

Modelled on `data/bin/vibespace-page`: `VIBESPACE_API` + `VIBESPACE_SESSION_TOKEN` (or
`VIBESPACE_JOB_TOKEN`), no VibeSpace internals, full manual behind `vibespace-docs browser`.

```
vibespace-browser profiles                       # what exists, who owns it, who is attached
vibespace-browser use <label|id>                 # attach THIS session to a profile;
                                                 #   prints the env to export, or execs a subshell
vibespace-browser new <label> [--provider …] [--proxy …] [--fingerprint …]
vibespace-browser detach                         # drop the lease, close my tab
vibespace-browser watch                          # print the live-view path for the user
vibespace-browser status                         # my tab, my lease, who holds input,
                                                 #   my profile AND ITS ORIGIN (§3.2.5)
vibespace-browser pin <label|id> | --none        # pin THIS session (or unpin); a mid-session pin
                                                 #   applies from the next browser launch (§3.2.5)
vibespace-browser backend [<name>]               # which backend, what else exists, propose a switch (§7.4)
vibespace-browser blocked --url <u> [--why <c>]  # I was blocked here — a CLAIM, never a detection (§7.4)
vibespace-browser -- <agent-browser args…>       # run agent-browser with this session's flags
```

**`use` does not print a CDP URL.** Round 1 had it print

```
AGENT_BROWSER_CDP=<the profile's cdp url>       # ← removed
```

as the primary onboarding step, which hands the agent unscoped authority over every tab in that
browser — §3.4's corrected reading — on the documented happy path rather than through an unusual
act. `use` therefore:

* by default **`exec`s a subshell** with the environment already set, so the URL never appears in
  the agent's stdout, its transcript, or a scrollback the model reads back later;
* `--print` still exists for the case an agent must set up its own shell, and it prints the
  session and namespace **only** — a CDP url is available through `vibespace-browser -- get
  cdp-url`, which is a wrapper call, i.e. a place a policy decision can live.

Being honest about what that buys: on a single-uid box this is **not** a boundary. The same user
owns every agent process, so `/proc/<pid>/environ`, the daemon socket under `~/.agent-browser`
and `agent-browser get cdp-url` all reach the same endpoint. Not printing it removes the
*accident* (a URL sitting in a transcript, copied into another session, replayed by a model that
read it) and nothing more. The boundary is the capability gate in §6.2 and, if the owner wants
enforcement, the proxy in §6.5.

`--pin-tab` is supplied by the wrapper form, so an agent that already knows `agent-browser` keeps
every habit it has. The wrapper form (`vibespace-browser -- …`) exists for the verbs that need a
policy decision (`close`, `close --all`, `connect`, `get cdp-url`) and for the lease check.

### 5.2 How an agent learns any of this

* **Nothing, by default.** An agent that never reads a word gets isolation from §3.2.
* One line in the tools intro (the budgeted per-session context) pointing at
  `vibespace-docs browser`, exactly like every other agent CLI.
* `docs/agent/browser-manual.md`, served by the running instance's own checkout, so the manual
  cannot drift from the running version.
* Rules the manual must state, because they are the ones that break other people: your tab is
  yours; `close --all` is refused on a shared profile; page content is untrusted; never echo a
  cookie; **ask the user through the live view when a login or a captcha blocks you** — that is a
  supported move now, not a dead end.

### 5.3 Discovery for the user

* Session card / Session Properties: which profile this session is attached to, viewer count, who
  holds input — plus the **pin** and its origin (§3.2.5) and the **backend chip** (§7.4). The pin
  is one command (`session.pinBrowser`) registered on four surfaces, not four implementations.
* The live-view window's title bar: the profile name (click = the picker), the backend chip, and
  the **bind** affordance that snaps it beside its owning chat (§4.6).
* A ⚙ panel (or sidebar section): profiles, owners, last used, disk size, "stop", "forget", "open
  live view". The unregistered directories from §1.2 (53 at round 1, 56 when re-measured — the
  count drifts upward on its own) appear here as adoptable candidates (§8).
* Any new setting lands in a category listed in `SETTINGS_CATEGORIES` — that array **is** the
  settings render loop, and a category no row lists is a setting nobody can reach (the build
  census exists because ten settings, including every money ceiling, were unreachable).

---

## 6. Security model

### 6.1 Tokens and ports

* The stream port stays on loopback. The **only** route in is the cookie-authed bridge — the
  `-localhost` + bridge discipline `src/vnc.js` already documents.
* **Stream tokens never reach agents.** If a future upstream build requires the generated token
  (the 0.35.2 reverse-proxy path), the server holds it: not in `agentEnv`, not in the CLI's
  output, not in the manual.
* The live-view URL an agent prints is a **path**, resolved client-side against the address the
  user actually opens VibeSpace at — the published-pages rule (a server does not know how it is
  reached; guessing an origin once put a machine hostname into a chat reply).
* CDP is unauthenticated by design. A profile's CDP endpoint binds loopback; a remote one is
  reached only through the daemon's mux (§7.3), never a port listening on a LAN.

### 6.2 Who may attach to a profile

`sharing: "owner"` (default) = the owning task's sessions only. `sharing: "instance"` = any
session on this instance. There is no cross-instance sharing: a profile is live credentials, and
it travels only as an explicit, human-driven export.

**`sharing: "instance"` has a precondition, and it is P6.** Because a shared profile is a
shared-authority boundary (§3.4) and its CDP endpoint is unauthenticated (§6.1), "any session on
this instance" means "any session may drive any of these tabs, including during a human
takeover". Inside one owner's own sessions that is the trust level every VibeSpace agent surface
already runs at, and `sharing: "owner"` says exactly that. `sharing: "instance"` widens it past
the owner's own work, so it is **defined in the schema and refused at the API** until the
mediating proxy exists — refused with the reason, the capability-row discipline of §7.1, not a
silent absence. This is a change from round 1, which listed both values as available while §6.5
conceded the enforcement gap; owner request (1.b)'s "one profile driven by several sessions at
once" is delivered by `sharing: "owner"` today and by `"instance"` after D6/P6.

### 6.3 Domain restriction, honestly

Because `--allowed-domains` refuses profiles / CDP / restore (§1.5), a persistent profile cannot
carry it. So:

* **A session with no user-data-dir at all can and should use it** — that is the case it was
  built for, and it is the case agents hit most often: open a page, read it, throw it away.
  Verified in §1.5: `--session` is **not** in the refusal list, so an isolated session with no
  profile, no state replay and no CDP carries an allowlist happily. **This is true only under
  §3.2.2's variant D.** Under B or C the default session has a user-data-dir and
  `--allowed-domains` is refused by the binary — round 1 asserted the benefit while specifying a
  configuration that forfeits it, and D12 is where that gets decided rather than assumed.
* **Persistent profiles get containment one level down**: the profile's own proxy (already a
  registry field) with an allowlist at the proxy, or host/container egress control. The registry
  records `allowedDomains` for an ephemeral profile and **refuses** it on a persistent one with a
  message saying why, rather than accepting a flag that will be silently dropped.

### 6.4 Data at rest

* Profile directories are `0700`, outside the repo, never in a backup that leaves the box without
  an explicit act.
* Proxy passwords and provider license keys live in the server-side registry (or the existing
  credential-provider plugin path): never in argv, never in `agentEnv`, never in a log line.
* Recordings and HARs are secrets; the sweep deletes them on a schedule and the UI says so.
* `forget` on a profile archives, then removes; it never silently destroys — the
  archive-never-destroy law every store here follows.

### 6.5 What the lease is not

Any process that can reach a profile's CDP endpoint can drive any tab in that browser, including
during a human takeover. This is not an agent going out of its way: it is what CDP is, and on a
single-uid box the endpoint is discoverable from the daemon socket, from `get cdp-url`, and from
another agent's `/proc/<pid>/environ`. Round 1 framed it as "if an agent runs `agent-browser
--cdp <url>` **by hand**", which understated it — §5.1 no longer prints the URL, and that removes
an accident, not the capability. The lease is cooperative. Two honest positions:

* **Ship it cooperative** and say so in the UI ("agent paused" = a request the agent honours).
  Every VibeSpace agent surface today is cooperative in exactly this way.
* **Or mediate CDP** (Decision D6): the keeper hands each session a per-session CDP URL served by
  a small proxy that scopes `Target.*` to the leased target and refuses `Input.*` /
  `Page.navigate` while the user holds input. Real enforcement — and one more moving part on a
  latency-sensitive path.

Recommendation: cooperative in phases 0–5 **for `sharing: "owner"` only**, with `"instance"`
refused until the proxy exists and the proxy specified and gated behind D6. A cooperative lease
between one owner's own sessions matches every other surface here; a cooperative lease sold as
isolation between *different* owners is the UI promising something the mechanism cannot keep.

---

## 7. Providers

### 7.1 The abstraction

A provider answers four questions: **how do I start a browser for this profile**, **what CDP URL
do I hand out**, **what does it cost**, **what can it not do**. Upstream's `-p <provider>` and its
provider plugins are the template; our registry adds the profile identity.

| Provider | Start | CDP | Fingerprint | Cost | Notes |
|---|---|---|---|---|---|
| `chromium` (default) | local `agent-browser` with `--profile <dir>` | keeper reads `get cdp-url` | none beyond `--disable-blink-features=AutomationControlled` | free | today's behaviour, now owned |
| `cloak` | CloakBrowser binary as `--executable-path`, or its `cloakserve` CDP endpoint | `ws://127.0.0.1:9222` (loopback, §6.1) | 73 claimed source-level C++ patches, per-connection seed | free tier 1 session / $19 5 / $49 20 / $199 200 / $499 2000 (list prices observed 2026-09) | §7.2 |
| `cdp` (remote) | nothing — the browser is somebody else's | a `hostId` + a remote loopback port, tunnelled | whatever that browser is | free | §7.3 |
| `cloud:<name>` | upstream's browserbase / browserless / kernel / browseruse / agentcore | the provider's | the provider's | per vendor | API keys are server-side secrets; never in `agentEnv` |

A provider is a **row, not an `if` chain** — the backend-caps discipline. A capability a provider
lacks ("cannot be headed", "cannot take `--allowed-domains`") is a field the UI reads, so a
control that cannot work is disabled with a reason rather than failing at use time.

### 7.2 CloakBrowser — what is verified, and the due diligence still owed

Verified from the vendor site, the npm registry and the repository (2026-09):

* npm `cloakbrowser`, latest **0.5.10**, MIT, maintainer `cloakhq`, repository
  `CloakHQ/cloakbrowser`, one dependency (`tar`), optional peers `playwright-core` /
  `puppeteer-core` / `socks-proxy-agent` / `mmdb-lib`, **no postinstall script**. Also published
  on PyPI and Docker Hub.
* **The wrapper is open source; the Chromium patches are not.** The repository ships wrappers
  (Python / JS / .NET), examples and tests. The "73 source-level C++ patches" are compiled into a
  binary the wrapper downloads on first launch (~200 MB) from the vendor host
  (`CLOAKBROWSER_DOWNLOAD_URL`), cached in `~/.cloakbrowser` (`CLOAKBROWSER_CACHE_DIR`).
* Downloads are documented as verified against **a pinned Ed25519 signature over published
  checksums** before extraction.
* Free = an older Chromium major, one concurrent session, gated by a sign-in; Pro = the current
  major and 5–2000 sessions, gated by `CLOAKBROWSER_LICENSE_KEY` (stored at
  `~/.cloakbrowser/license.key`). **Whether validation is offline or a phone-home is
  undocumented.**
* CDP is a first-class entry point: `--remote-debugging-port=9222`, plus a `cloakserve` mode
  (`docker run -d -p 127.0.0.1:9222:9222 …`) that accepts a per-connection `?fingerprint=<seed>`
  — exactly the shape our per-profile seed wants, and a container boundary for free.
* "CloakBrowser Manager" is a self-hosted anti-detect profile manager (unlimited profiles, each
  with its own fingerprint / proxy / cookies) — heavily overlapping §3.3 and, in my reading,
  **not** something to adopt: it would be a second registry with its own opinion about who owns a
  profile, and no idea what a VibeSpace session is.

Two cautions I would not ship without resolving:

1. **The search surface around this name is polluted.** At least four GitHub repositories carry
   near-identical descriptions, several titled "Download CloakBrowser". That is the shape of a
   lure. The only entry points we should ever use are the npm/PyPI package published by `cloakhq`
   and the repository it declares; any "download" link surfaced by a search engine is out of
   scope by policy.
2. **We would be running an unaudited proprietary binary with network access beside a live cookie
   jar.** Signature pinning is the right control and it is the vendor's own claim; we should
   verify it once ourselves, pin a version, and keep the binary away from any profile holding
   credentials we care about until it has run a while on throwaway ones.

#### 7.2.1 The control for "does it phone home", written down as a precondition

Round 1 put this in an aside and named `test-vendor-whitelist` as the place it "gets caught".
That suite cannot catch it (§9), so the control is stated here as a **P4 precondition with a
recorded result**, in the shape this repository already uses for exactly this question.

* **The measurement**, modelled verbatim on `src/local-oracles.js` — the registry of
  human-triggered CLI reads where *every* entry carries its own proof (`tool`, `date`, CLI
  `version`, per-run **INET connect counts**), measured with
  `env -i HOME=<empty dir> PATH=… strace -f -qq -e trace=network`, counting every
  `connect(AF_INET|AF_INET6)` and treating a DNS `connect(…:53)` as INET because resolving a
  vendor host is already the decision to talk to it. Four runs are recorded: first launch (the
  ~200 MB download is expected to connect — the number is the point), a second launch from cache,
  a launch with a license key present, and a 10-minute idle browser. A record with no counts is
  not a record.
* **CloakBrowser is not, and cannot be, a `local-oracles` entry.** That registry is for
  *zero-network* reads; a browser is definitionally a network tool. It contributes the *shape* of
  the proof, not the verdict, and the record lives beside the provider row in the registry so the
  UI can show what was measured and when.
* **Then make the boundary enforcing rather than observed.** §7.2 already reaches for the
  `cloakserve` Docker container; that container gets an **egress allowlist** (the pinned download
  host at install time, then nothing but the sites a profile is actually for). A measurement is a
  snapshot of one version's behaviour; an allowlist is a property of the deployment, and it is the
  only one of the two that survives the vendor shipping a new binary.
* **Version pinning is part of the control**, not hygiene: the measurement describes the version
  it was taken against, and an unpinned auto-download silently invalidates it.
* If a suite is wanted, it asserts the **container's egress policy** and the presence of a
  well-formed proof record — never our own source text, which is all a source census can see.

**Recommendation:** adopt it as an *opt-in provider on the free tier first*, self-hosted, via
Docker `cloakserve` on loopback, on profiles that start with no credentials. Buy a tier only when
a measured site actually needs it. And note the ordering that matters: **for any site with an
account, a human login through the live view (§4.3) beats fingerprint evasion** — it is free, it
is risk-neutral, and it is a capability this design gives us anyway.

### 7.3 Remote and fleet

"A browser on a paired Mac with the user's real profile" decomposes into two different things:

* **Transport is nearly free.** `PortForwardManager` already binds a local `127.0.0.1` port and
  pipes it into `device.tcpForward(remotePort)` over the existing agentd data plane — the same mux
  VNC and device mounts use. A browser's loopback CDP port on a paired machine becomes a local
  URL; `--cdp <local url>` does the rest. NAT-proof, nothing public.
* **"The user's real profile" is blocked by Chrome itself.** Since **Chrome 136**,
  `--remote-debugging-port` is not honoured against the default user-data-dir; you must point at a
  non-default `--user-data-dir`, and a non-standard directory uses a different encryption key, so
  a copied profile does not simply carry its cookies across. Any plan that says "just attach to
  the browser they are already signed into" is, on current Chrome, false.

So the shipped answer is: **a dedicated profile on that machine, logged in once by a human through
the live view.** One interaction, auditable, and not dependent on undocumented profile-copying
behaviour. (Whether a copied profile's cookies survive on macOS Keychain / Windows App-Bound
Encryption is listed in §12 as unverified.)

---

### 7.4 Switching a live profile to another backend

(Owner question Q2.) The user or the agent hits a page the default Chromium cannot open and must
switch backend **immediately**, without losing cookies, localStorage or logins. This section is the
mechanics, the UX, the agent tool, the cost gate and the failure mode.

**Mechanics: the backend is a property of the profile, not of the browser.** The registry already
has the `provider` field (§3.3); a switch changes that field and makes the keeper do it again. Three
verified facts decide what that can achieve:

* **CloakBrowser accepts an explicit persistent directory.** `launch_persistent_context("./my-profile")`
  in the repository's own documentation is that path, and agent-browser has supported a custom
  executable path since 0.8.7. So "the same user-data-dir, opened by the other binary" is a
  supported shape on both sides.
* **The fingerprint seed is a launch parameter, not something stored in the profile.** Verbatim from
  the repository docs: `--fingerprint=seed` — "Deterministic identity from the seed. Same seed =
  same fingerprint across launches. Use this for session persistence (returning visitor)." So the
  durable half is **`fingerprintSeed` in our registry**, not the directory. §3.3 already carries
  that field; it now has a job.
* **Chromium's profile version stamp is one-way.** A user-data-dir written by a **newer** Chromium
  is refused by an older one ("Your profile can not be used because it is from a newer version of
  Google Chrome"). And the version gap here is real: CloakBrowser's **free tier ships Chromium 146
  and Pro ships 151** (repository docs, verbatim, with 58 / 73 patches respectively). So **the
  upgrade is one-way**: once this directory has been opened by the higher major, there is no going
  back.

That gives the **version ladder**, which is the core decision of a switch and which must run
**before** a single byte moves:

| Case | What happens |
|---|---|
| The target backend's major is **≥** the major that last wrote this directory | Switch. Record the new major. |
| The target backend's major is **<** the major that last wrote it | **Refuse**, naming both versions, with two ways out: upgrade that backend, or **clone** the profile (the export half below, stating what it will lose) |
| The directory has **no** recorded major (adopted, or predating this design) | Read its own `Last Version` read-only; if that cannot be read, treat it as unknown, **refuse the automatic downgrade**, and require one explicit human confirmation |

"Which backend's major last wrote this" is recorded in the **registry** (`lastChromiumMajor` +
`lastBackend`), for the reason this repository keeps re-learning: **the fact a guard reads must not
be the fact a bad write produces.** The directory's own `Last Version` is written by the browser and
is of course the primary evidence; the registry copy is written by us and keeps "this profile has
been opened by Pro" decidable when the directory cannot be read. When they disagree, take the
**higher** one — the conservative direction: refusing one legitimate downgrade is cheaper than
allowing one that destroys a profile.

**The switch sequence, and why the lease survives it:**

1. Record each lease's `lastUrl` (carried in the JSON since 0.34) and its `browserKey`.
2. **Stop the browser process** (the `--pin-tab` bindings, the CDP endpoint and every `targetId` die
   with it). This step is not optional: Chromium's process singleton means one user-data-dir can be
   open by exactly one browser at a time (Chromium's own `user_data_dir.md`, verbatim: "two running
   Chrome instances cannot share the same user data directory"), so there **is no** live handover.
3. Start the new backend against the **same directory** with the **same `fingerprintSeed`**.
4. Walk the lease table: `tab new` to each lease's own `lastUrl`, re-`--pin-tab`, write the new
   `targetId` back into the lease.
5. The lease was **never destroyed** — it is looked up by `(profileId, browserKey)` (§3.3) and only
   `targetId` is re-minted. So no session re-attaches, and the agent's next command lands on its own
   tab.

To the agent and to the user, the gap in the middle is **a named `browser_restarting` refusal**, not
a timeout — the same family as `tab_gone` and `browser_paused`.

**A changed fingerprint is a new machine as far as the site is concerned.** This has to be said in
full in the dialog, because it is the one place a switch **loses** something: the cookie jar crosses
untouched, but a site that binds a session to a fingerprint (which is precisely what anti-bot
vendors do) sees a new device and **may require a fresh login**. Therefore:

* a profile's `fingerprintSeed` is **minted once at creation** and carried through every subsequent
  switch;
* going from `chromium` (no seed) to `cloak` (a seed) is **by definition** a fingerprint change, and
  the dialog is worded from that fact ("this profile had no stable fingerprint before; after the
  switch, sites may ask you to log in again");
* the reverse (`cloak` → `chromium`) is the same, **and** must additionally pass the version ladder
  — which is the common path on which a downgrade is refused.

**"Export / import" is the explicitly lossy fallback**, for the cross-machine and cross-provider
cases (a cloud provider's directory is not ours to open). agent-browser's own `--state` / `--restore`
is Playwright's `storageState` shape: cookies, localStorage, and an **opt-in** IndexedDB snapshot
(Playwright's docs, verbatim: "Set to `true` to include IndexedDB in the storage state snapshot"),
**excluding** sessionStorage. And it has one hard boundary, which is also the key to §4.8: **a
non-extractable `CryptoKey` cannot be carried by storageState** — that is what "non-extractable"
means — so an application that stores its local decryption keys as non-extractable CryptoKeys, as
WhatsApp Web does, **does not bring its login across** an export/import. That is not our defect, it
is the point of that API; the dialog must name **which sites this path will drop** rather than say a
vague "you may need to log in again".

**UX:**

* **A backend chip**, in two places: the live-view window's title bar, and the profile's row in the
  profiles panel. It shows the current backend plus its major (`chromium 14x` / `cloak 146 (free)`)
  and opens the switcher. A chip rather than a buried menu, because "which browser am I on" is the
  one thing a user wants to know at the moment they are blocked.
* **A one-click "Open with CloakBrowser" on the blocked-page state.** Where that state comes from is
  the agent paragraph below — the point is that this button appears **only when somebody claims to
  be blocked**, and it says **who** claimed it.
* **A per-profile default backend** (a registry field), so "this profile is for that kind of work"
  is said once.
* **Per-site memory**: "this site needs cloak". Keyed by **exact host**, not by registrable domain —
  a registrable domain needs a public-suffix list, which is a second source of truth that expires,
  and the cost of exact hosts is only that two subdomains of one site are recorded twice. This
  memory stores a **claim**, so it stores **who claimed it, when, and why**
  (`{host, backend, by: 'agent'|'user', at, why}`), and each row can be deleted from the profiles
  panel.

**The agent tool:**

```
vibespace-browser backend                    # which backend I am on, what else exists, what each can do
vibespace-browser backend <name>             # propose a switch to <name>
vibespace-browser blocked --url <u> [--why <code>] [--evidence <text>]
                                             # I was blocked on this page — a CLAIM, not a detection
```

**`blocked` is reported by the agent, not detected by us, and that sentence belongs in the
protocol.** We have no reliable way to see "this is an anti-bot block" from a page: what can be had
deterministically is HTTP 403/429 and the signatures of known challenge pages. So the server
**never** claims to have detected a block; it records an attributed claim, the UI says "the agent
says this page is blocked", and the one-click button is the **user's** act. Conversely, when a
navigation really does return 403/429, `vibespace-browser`'s error carries `hint: 'may-need-cloak'`
— a **hint**, worded so it cannot be mistaken for a detection (the same family as §4.3.1's "a
producer we ship must be named": a claim must carry its source).

**A switch is a proposal, and it goes through the owner / lease check.** A profile may have several
sessions attached (§3.4), and a switch **stops everybody's browser**. So: under `sharing: "owner"`
only the owner's sessions may switch directly; in every other case (another session holds a lease,
or somebody holds `input: 'user'`) it is downgraded to a **proposal** — one "For you" item addressed
to the owner, naming who proposed it, for which URL, and which sessions it would affect. **A profile
somebody is driving (`input: 'user'`) is never interrupted by an agent's proposal.**

**The cost gate: CloakBrowser is licensed per concurrent session.** The free tier is **one**
concurrent session (behind a GitHub sign-in); Pro is 5 / 20 / 200 / 2000 (repository docs, verbatim).
So the switch dialog must show **seats**: used / total / after this switch. Behaviour at the ceiling
is the same shape as §3.5's browser ceiling — **refuse loudly, name the profiles currently holding
seats, and offer to stop one**. That count is the keeper's job (it is the first thing in this design
that can count) and it is **per provider**, not global. The free tier's single concurrent session
means a second cloak profile must either wait or be paid for — hide that, and the user spends an
afternoon debugging a browser that appears to fail at random.

**Failure mode: the binary is not installed.** As everywhere else: a **named** refusal
(`backend_unavailable`, carrying the provider name and what is missing), a row in the profiles panel
and the switch dialog that is **disabled with its reason written on it**, and an install action in
Manage Agents (`cloakbrowser` is an npm package, installing it is a user act, and it goes through
§7.2.1's egress precondition — **measure first, then install**, not the other way round). **Never**
download the 200 MB binary without the user having asked for it.

## 8. Migration from the shared default profile

Nothing is deleted, and none of the 98 GB moves.

1. **Ship §3.2 first, alone.** New sessions become isolated. Existing running sessions keep the
   old behaviour until they restart. Interference stops accruing on day one, before any registry
   or UI exists.
2. **Adopt the default profile as a registry record** named "Shared (legacy)", `sharing:
   "instance"`, marked legacy in the UI. It keeps working; agents that explicitly ask for it get a
   pinned tab instead of a stolen one.
3. **Offer adoption of the orphans** (53 → 56 between round 1 and round 2; §1.2). The panel lists unregistered directories with size and
   last-use date; the user labels the ones worth keeping, and the rest are listed for deletion
   with their sizes shown. Deletion is a human act, never a sweep — a cookie jar is somebody's
   login, and this repository already has an incident where a pattern match killed a live session.
4. **Config file: never edited, always overridden.** `~/.agent-browser/config.json` stays exactly
   as the user wrote it — `headed: true` on the desktop is their choice and the VNC path still
   works — but round 1's "leave it alone" was not a complete answer, because leaving it alone
   means its `profile` key applies to every session P0 creates (§1.1, §3.2.2). The migration step
   is therefore: **neutralise it per session through the environment, never by rewriting the
   file.** Under variant D that is one generated config (which copies the user's own `args`
   forward and omits `profile`), regenerated whenever their file changes; under C it is a
   per-session `AGENT_BROWSER_PROFILE`. Either way the user's file is read, never written — an
   agent editing a human's dotfile is its own incident class — and profiles started by the keeper
   pass their flags explicitly.
5. **Rollback** at every phase is "stop passing the env vars" / "stop the keeper" / "delete the
   generated config". Every path falls back to today's behaviour structurally — the
   activation-switch discipline the three-tier campaign uses — and because step 4 never wrote to
   the user's file, rollback has nothing to restore.

---

## 9. Gates

Each phase lands with its own suite, and the tier table in `scripts/ci.mjs` gets a row per suite
or the build census fails — a suite in no tier is a suite nobody runs. Round 1 wrote that
sentence and then left P4 and P5 with no suite at all; both now have one.

| Suite | Tier | Covers | What it proves |
|---|---|---|---|
| `test-browser-profiles` | fast | P0, P1 | PURE registry: id minting, a label never reaching a path, lease transitions, provider capability rows, `browserEnvFor(session)` for local / remote / integration-off. **The env half asserts the RESOLVED user-data-dir of two concurrent sessions** (§3.2.2 — asserting the two env-var strings passes on variant B, the broken one), the `browserKey` continuity ladder (new / resume / fork), and the explicit idle-timeout value. Negative control: a session with integration OFF gets **no** browser env. |
| `test-browser-cli` | fast | P0, P1 | The wrapper's verb table, the `close --all` refusal on a shared profile, typed `browser_paused` / `tab_gone` passthrough, behaviour with no token or no API, and that **`use` never prints a CDP URL** (§5.1) — with the round-1 spelling as its negative control. |
| `test-browser-keeper` | heavy | P1 | Real `agent-browser` ≥ floor: reuse-or-spawn, adopt across a restart, **boot reconciliation** (a persisted lease whose `browserKey` no live session carries is dropped and its target closed BEFORE any `IDLE_TIMEOUT_MS=0` — the half round 1 omitted, with a pre-fix control that leaks a browser), park-with-a-reason on an unverifiable pid, runaway stop, clear-only-your-own-record, ceiling refusal naming the holders. **Skips loudly, with evidence**, when the binary is absent or below the floor. |
| `test-browser-live` | heavy | P2, P3 | Real browser + real stream + the real bridge: two sessions on one profile drive their own tabs and never each other's (the I2 proof, with a **pre-fix control that reproduces the hijack**), a viewer sees frames through cookie auth only, backpressure holds, takeover refuses agent input and handback restores it. Headless-chrome leg for the window at 375×667 and at a non-1 DPI zoom. |
| `test-browser-providers` | fast + heavy | **P4** | fast: the provider capability rows and the exact refusal a provider produces for a capability it lacks (a disabled control names its reason), plus the presence and shape of the CloakBrowser egress proof record (§7.2.1) — a provider row with a `blocks:` claim whose caps row is not actually false FAILS, the `local-oracles` discipline. heavy: the real `browser-serve` daemon op against a real daemon **with its capability gate asserted** (an old daemon is never asked — unknown ops hang), and the remote `cdp` provider over `tcpForward`. |
| `test-browser-housekeeping` | fast | **P5** | The retention/adoption DECISION as a PURE function, printing what it spared and why — the repo's own sweep law: **never demand a removal nothing is allowed to perform** (a grace window for anything that may be in flight, named with its age). Negative controls: nothing is ever proposed for deletion without an explicit human act, and `forget` archives BEFORE it removes. |
| `test-browser-pin` | fast | **P0, P1** | The pin ladder as a PURE decision: explicit / conversation / Task-Group / instance / none, with the ORIGIN each rung states, and that a fork **copies the pin and mints a new key** (§3.2.5). The mid-session half is a WIRING PIN: the re-pointed symlink (or the rewritten per-session config) is what the next launch resolves, and the suite asserts the running browser is **unaffected** — the honest half. Plus the vocabulary case: every pin origin the product emits is in `SPAWN_ORIGINS` and the client's `spawnValueOrigin` whitelist recognises it (§3.2.5's two-site edit; the negative control is an off-vocabulary string, which must go red — in production it only renders a wrong label). Negative controls: a Task-Group default never beats a session's own choice; binding a group does not rewrite a running session's pin. |
| `test-browser-backend` | fast + heavy | **P4** | fast: the version ladder as a PURE decision over a matrix (target ≥ / < / unrecorded, registry-vs-`Last Version` disagreement ⇒ take the HIGHER), the seat arithmetic and its refusal text, the site-hint record carrying WHO claimed it, and `blocked` being a claim the server never manufactures. heavy: a real switch — stop, re-open one tab per lease at its `lastUrl`, re-pin, rewrite `targetId`, **the lease object never destroyed**; plus the not-installed refusal naming the provider. |
| `test-window-binding` | fast + heavy | **P7** | fast: the chain model with `layout`/`split`/`ratio` — a missing `layout` reads as `'tabs'`, the ratio clamps, and **the multi-client sync key changes when only the layout changes** (§4.6's named trap, with the pre-fix key as its negative control). Three more: **close the host tab of a three-tab split chain ⇒ `layout === 'tabs'` and no dangling id in `split`** (the `_normalizeChain` invariant, with the pre-fix shape that leaves a dangling `pair` as its negative control); **two sessions in one task group produce distinguishable badges**; and **a session bound to no group produces a badge at all** (the two shapes on which borrowing the group colour fails). heavy (headless chrome): bind → two panes in one window, divider drag under a non-1 DPI zoom lands where the pointer is, move/minimise/desktop-switch keep them together, closing the browser pane collapses to tabs **without moving the chat window**, and a mobile viewport renders tabs **without writing its flattening back**. |
| `test-native-window` | heavy | **P8** | A real Xpra server + a real X client under Xvfb through the real cookie-authed bridge: one window arrives, input reaches it, the stream port is never reachable from a browser, and the backpressure discipline holds. **Skips loudly, with evidence**, when `xpra` or `Xvfb` is absent (measured 2026-09-10 on this box: `Xvfb` present, `xpra` absent). The bandwidth/latency numbers §4.7 needs are produced here, not asserted — the suite RECORDS them under a named budget so a regression is visible. |
| `test-spend-paths` | fast | **P3** | Not a new suite — the existing census, which this feature must not redden. Its `deliver-ladder` primitive matches `deliverToConversation(` **per site**, so any announcement in `src/server/browser-*.js` needs the gate in scope above it; and its closed-set assertion means `'browser-handback'` must be declared AND used in the same change (§4.3.1). |
| `test-architecture` | build | all | Tier edges: PURE imports nothing, SHARED never reaches up, the daemon bundle carries no orchestrator markers, `server.js` stays inside its size ratchet, and §44 — every settings category renders, so `browser.announceIdleHandback` and the rest reach a section a user can open. |
| `test-session-schema` | fast | P1, P3 | Every new `session._field` (`_browserProfileId`, `_browserKey`, `_browserTargetId`, `_browserInput`) has an owner row. |
| `test-vendor-whitelist` | fast | all | **That this design introduces no new Anthropic call.** Round 1 also claimed this suite is "where a provider phoning home gets caught" — that claim is **deleted**: it is a source census over `src/`, `server.js` and `data/bin/` for Anthropic endpoint strings within ±4 lines of a request primitive. It cannot observe a third-party binary's traffic and CloakBrowser's host is not in its regex. The control for that risk is §7.2.1's measured proof record plus the container's egress allowlist, and the suite that asserts the **container's egress policy** is `test-browser-providers`, not this one. |

Two suite-hygiene rules this feature is unusually exposed to, both already law here: **no
fast-tier suite may claim a machine-global name** (a browser wants a fixed port and
`~/.agent-browser` — use per-pid scratch paths and free ports), and **a suite that spawns a
browser owns its children's lifetime**, killing on exit *and* on timeout. The 2026-09-09 sweep
found 2089 leaked fixture processes, orphan chromes among them; a browser suite is the single
easiest way to make that worse, and §1.2's measurement was taken **on four such leaks**.

## 10. Phased plan

One **agent-round** = ~1 h implementer + ~20 min adversarial verify (measured 2026-09-10 over 32
workflows / 130 agents). Calendar at **2 rounds/day**. Ranges reflect the measured convergence
spread: 14 of 32 workflows converged in one round, 8 needed 3–6.

| Phase | Content | Rounds (point) | Range | Days (point) | Ships value on its own? |
|---|---|---|---|---|---|
| **P0 — Zero interference** | `AGENT_BROWSER_SESSION` + `_NAMESPACE` + explicit `_IDLE_TIMEOUT_MS` at spawn (local + remote paths), **the §3.2.2 user-data-dir variant with its fallback ladder**, the `browserKey` continuity ladder (§3.2.1), version-floor probe with an honest "your agent-browser is too old for shared profiles" notice, the k = 1/4/12 resource measurement (§1.2, §12.10), one line in the tools intro, `docs/agent/browser-manual.md`, `test-browser-profiles` (env half, asserting the resolved dir), **plus the pin's env indirection (§3.2.5) — the per-session generated config or the re-pointed symlink — so a mid-session pin never needs a restart**. | **5** | 4–7 | 2.5 | **Yes — the whole of (1.b)'s "stop interfering" half.** |
| **P1 — Registry + keeper + lease** | `src/browser-profiles.js` (PURE), `browser-keeper.js` incl. **boot reconciliation and the concurrency ceiling**, `data/browser-profiles.json` + atomic writes + broadcast, `/api/browser/*`, attach/detach/lease, `vibespace-browser` CLI + `AGENT_TOOLS` + manual, migration steps 1–2, **the pin ladder + the Task-Group default + the four pin surfaces + "adopt this session's browser" (§3.2.5)**, `test-browser-pin`. | **8** | 6–12 | 4 | Yes — per-task profiles that concurrently coexist, with `--pin-tab` semantics. |
| **P2 — Live view** | `/api/browser/stream` bridge (+ backpressure), `browser-live` window type, multi-viewer fan-out, URL/tab/console panes, DPI-correct canvas, `test-browser-live`. | **6** | 5–9 | 3 | **Yes — (1.c) minus the hands.** |
| **P3 — Takeover / handback** | Lease input holder, mode switcher, input forwarding, `browser_paused`, **the §4.3.1 spend wiring** (`'browser-handback'` in `SPEND_REASONS`, the ladder call, `browser.announceIdleHandback` default OFF, the `test-spend-paths` census staying green), idle handback, agent cursor, `--confirm-actions` cards. | **5** | 4–7 | 2.5 | Yes — completes (1.c). |
| **P4 — Providers** | Provider rows + capability gating; **the CloakBrowser egress precondition performed and recorded first** (§7.2.1), then opt-in on the free tier via loopback `cloakserve` with an egress allowlist; remote `cdp` provider over `tcpForward`; the `browser-serve` device op (three-touch rule); **the live backend SWITCH (§7.4) — the version ladder, the seed carried across, the lease-driven tab re-open, seats in the dialog, per-site hints, and the agent's `blocked` CLAIM**; `test-browser-providers` + `test-browser-backend`. | **9** | 7–13 | 4.5 | Yes — (1.a), and the fleet story. |
| **P5 — Recording + housekeeping** | Per-profile screencast opt-in, transcript thumbnails, retention sweep, profiles panel with sizes, orphan adoption (migration step 3), `test-browser-housekeeping`. | **4** | 3–6 | 2 | Yes — the transcript half. |
| **P6 — Hard mediation** | CDP-mediating proxy: target scoping + input refusal during takeover, per-session CDP URLs. **A stated precondition of `sharing: "instance"`** (§6.2), not merely an option if D6 says the cooperative lease is not enough. | **6** | 4–9 | 3 | Only as enforcement — but `sharing: "instance"` stays refused until it lands. |
| **P7 — Window binding** | `layout`/`split`/`ratio` on the tab chain, the title-bar bind affordance + the left/right title-bar drop zone, the born-into-a-chain `createWindow` path, the divider (per-drag controller, rAF, one coordinate conversion), the ownership badge from `leases`, the layouts persist + **the sync-key fix**, mobile tabs-only without write-back, `test-window-binding`. | **5** | 4–8 | 2.5 | Yes — an agent-driven browser stops losing its owner. **Needs P2** (there must be a live view to bind); independent of P3–P6. |
| **P8 — Native client windows** | The Xpra rung (§4.7): a keeper under §3.5's ceiling and runaway guard, `GET /api/xpra/stream` in the `/api/vnc` shape, the client half per D21, the 200 ms / 1 Mbps measurement, and per-app routing (WhatsApp → the web version in a profile; WeChat → the native client, only after the web version is tried). Then the §4.8 adapter for whichever app the owner names, feeding the existing Communication-Channels ladder with its own `source` tag and a declared `'chat-inbound'` spend reason. `test-native-window`. | **7** | 5–11 | 3.5 | Yes — but it is the least verified phase in the document and its range says so. Independent of every other phase except §4.2's bridge shape. |

**Totals, published as the range rather than the point** (round 1 published only the point
estimate of a range whose top its own risk paragraph pointed at):

| Scope | Range | Point estimate | **Risk-weighted** (P2, P4 and P8 at the top of their ranges, the rest at the point) |
|---|---|---|---|
| **P0–P5** | **29–54 rounds ≈ 14.5–27 days** | 37 ≈ 18.5 days | **44 rounds ≈ 22 days** |
| **P0–P6** | **33–63 rounds ≈ 16.5–31.5 days** | 43 ≈ 21.5 days | **50 rounds ≈ 25 days** |
| **P0–P8** (everything the owner asked for) | **42–82 rounds ≈ 21–41 days** | 55 ≈ 27.5 days | **66 rounds ≈ 33 days** |

The risk-weighted column is the one to plan against, and it is weighted for a stated reason:
P2 and P4 depend on a third-party binary's real behaviour rather than on our own code, which is
also why §12 lists three of their assumptions as unverified. Two further honesty notes: 55 % of
workflow wall time in the last sample had **no agent running** (concurrency cap, session limits,
serial integration), so "days" here is agent capacity and not elapsed time; and the ranges above
are per-phase — the joint distribution is not the sum of the extremes, so P0–P8's **82 rounds** is
the sum-of-extremes pessimistic bound, not a forecast, and the figure to plan against is the same
row's risk-weighted **66**. (Round 3 printed 46 here; that was round 2's P0–P8 number, stranded
once P7 and P8 were added, and it appears in none of this section's tables.)

**Alternative order, if the owner wants value earliest:** P0 → P2 → P1 → P3. P2 can run against
upstream's per-session stream *before* the registry exists, because §3.2 already gave every
session its own browser. Measured against round 3's point estimates: P2 completes at round 11
instead of round 19, i.e. **~4 days earlier (3–6 days across P1's own range)** — round 1 said
"about a week earlier", which is not what its own numbers give, and round 2's "~3 days" was
correct for round 2's smaller P1. The cost is retro-fitting the profile selector into a window
that already exists: roughly one extra round, so the ordering is worth about 7 net rounds of
earlier feedback.

**P7 changes that calculus, and the owner should know it.** Window binding (§4.6) is what makes a
live view legible when the agent is driving, and it needs only P2. So the earliest-value order is
**P0 → P2 → P7 → P1 → P3**: at the point estimates that reaches "the user watches the agent
browse, in a window visibly bound to the conversation that owns it" at round 16 — the whole of
(1.c) plus the binding — while the canonical order reaches only the unbound live view at round 19.
P8 is deliberately not in that sequence: it answers a different question (§4.7) and its range says
how little is known about it.

## 11. DECISIONS FOR THE OWNER

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | **Upgrade `agent-browser` to 0.37.1?** The `--pin-tab` binding that makes shared profiles safe is 0.34+; installed is 0.32.0. | (a) upgrade and pin; (b) stay and ship P0 only; (c) vendor a pinned copy. | **(a) upgrade to 0.37.1 and pin it**, with the floor checked at runtime and a named degradation below it. Without it, (1.b)'s "several sessions, one profile" cannot be done safely and I would not build it. |
| **D2** | **Core-lazy or plugin?** | (a) core, lazy — nothing runs until a browser is asked for (the `vnc.js` shape); (b) a built-in plugin, default OFF (the `opencode-serve` shape). | **(a) core-lazy for the registry / keeper / view; plugin-style consent for CloakBrowser only.** P0 is environment variables, which must be on by default or they fix nothing; a third-party proprietary binary is exactly what a consent flow is for. |
| **D3** | **Default profile policy for a session that asks for nothing.** | (a) ephemeral, no cookies kept; (b) auto-create a per-session persistent profile; (c) keep today's shared default. | **(a) ephemeral** — and see **D12**, which is the same question asked at the level where it is actually decided. Persistence should be a request, because a request is how the profile gets an owner and a label. (b) recreates the 53-orphan problem automatically, on a schedule; D12's variant C is *not* (b), because those directories are named, owned and swept — but only if the sweep ships with them. |
| **D4** | **Adopt CloakBrowser now, and at which tier?** | (a) free tier, self-hosted, opt-in per profile, **after §7.2.1's egress measurement is performed and recorded**; (b) Solo $19/mo; (c) Team $49/mo; (d) not yet — human-login-through-live-view first. | **(a), with the measurement as a hard precondition rather than an aside** — it costs nothing and tells us whether the sites in question actually need it. Move to a paid tier only against a measured failure on a named site. Never the global default. Round 1 named `test-vendor-whitelist` as the control for the phone-home risk; that was wrong (§9), so the control is now a recorded proof record plus an enforcing egress allowlist on the container. |
| **D5** | **Does a browser ever run on a machine other than this one?** | (a) local only for now; (b) paired devices via the `browser-serve` op + `tcpForward` (P4); (c) cloud providers with API keys. | **(b), in P4, and only for machines already paired.** (c) puts a vendor key and every page we visit on someone else's infrastructure and deserves its own decision with its own §ban-safety review. |
| **D6** | **Cooperative lease or hard CDP mediation?** | (a) cooperative for `sharing: "owner"`, with `sharing: "instance"` REFUSED until P6; (b) build P6 now and offer both; (c) cooperative for both and say so in the UI. | **(a).** Between one owner's own sessions a cooperative lease matches every other surface here, and §5.1 removes the accident that made it worse. Between *different* owners it is not a boundary at all (§3.4), so `"instance"` is refused with its reason rather than shipped with a badge that promises isolation the mechanism cannot keep. This is a change from round 1, which listed both values as available while conceding the gap in §6.5. |
| **D7** | **Recording default.** | (a) off, opt-in per profile; (b) on for attached profiles; (c) thumbnails always, video opt-in. | **(c).** One JPEG per agent action is nearly free and makes the transcript useful; 30 fps video of a logged-in profile is a secret with a storage bill. |
| **D8** | **What happens to the orphan profile directories (53–56, 98 GB — §1.2)?** | (a) list them, let the user adopt or delete; (b) auto-adopt all; (c) auto-delete anything older than N days. | **(a).** A cookie jar is somebody's login; a sweep that deletes one is the same class of mistake as the incident where a `(deleted)` match killed a live session. |
| **D9** | **Does the live view get its own window type, or a pane in the chat window?** | (a) window type `browser-live`; (b) a chat pane like Codex desktop's right-hand panel. | **(a) window type.** VibeSpace *is* a window manager; a window can be tiled beside the chat, moved to a desktop, opened on a phone and shared across clients — all of which the registry gives us for free, and none of which a chat pane does. |
| **D10** | **Keep the headed-browser-on-the-Wayland-desktop path?** | (a) yes, as a fallback for headed profiles; (b) drop it once P2 ships. | **(a) keep it.** It is the escape hatch when a stream cannot start, and it is how the machine's own desktop session gets debugged. It just stops being the only way to watch. |
| **D11** | **Is an announcement into the conversation worth a billed turn, and which of the three moments get one?** (§4.3.1 — the delivery ladder is fully spend-gated, `SPEND_REASONS` is a closed set that fails closed, and an idle handback fires on a **timer**, i.e. exactly CLAUDE.md's "a turn nobody typed".) | (a) none of the three — state changes only, and the agent learns from `browser_paused` / from its next command succeeding; (b) explicit handback only; (c) explicit handback + idle handback, both through the ladder under a new declared reason; (d) all three. | **(b), with (c) available as a setting that defaults OFF.** The explicit handback is a per-occurrence owner action and it is the one moment an *idle* agent cannot learn about any other way — the URL it needs to re-orient rides that turn. The takeover needs nothing (the typed refusal is immediate and free). The idle handback is the one with no owner action at all, so it is zero-spend by default: flip the lease, update the live view, file one "For you" item, and let the agent find out when its next command works. Whatever the answer, the reason is declared in `SPEND_REASONS` and the ladder is the only delivery path — a browser module that posts into a conversation any other way reddens `test-spend-paths`. |
| **D12** | **Which isolation variant does P0 ship?** (§3.2.2 — the config file's `profile` key applies to every invocation that does not override it, so "no `--profile`" is not the default, it is a decision.) | (A) `SESSION` only; (B) `SESSION` + `NAMESPACE` with the config profile left in force; (C) add a per-session scratch `AGENT_BROWSER_PROFILE`; (D) add `AGENT_BROWSER_CONFIG` pointing at a VibeSpace-written config with no `profile` key. | **(D), falling back to (C), then to (A), each fallback logged with its reason.** D is the only variant that is actually ephemeral, the only one that can carry `--allowed-domains` (§6.3), and the only one with no Chromium user-data-dir contention. **(B) is not an option** — it is what round 1 accidentally specified and it cannot work: N daemons, one user-data-dir. The cost of D is honest and stated: the CLI hard-errors on a missing/invalid `--config`, so the file is verified before the variable is set. |
| **D13** | **Headed by default, and what is the concurrent-browser ceiling?** (§3.2.3 — measured: 6 processes, 420–667 MB PSS and 2 inotify instances per Chromium, against a 128-per-uid inotify ceiling this box already trips; and the 1 h idle timeout **exempts headed browsers**, while the installed build has no default timeout at all.) | (a) keep `headed: true` for everything and set only the idle timeout; (b) headless by default for agent sessions once the live view exists (P2), headed per profile on request; (c) headless immediately, live view or nothing. | **(b), with the explicit idle timeout from day one.** Until P2 the desktop VNC window is the only way to watch, so headed has to stay reachable; once the live view exists, headless is strictly better for the agent case and it is the variant the idle timeout actually collects. Ceiling: propose **8 concurrent browsers per instance**, refused loudly at the ceiling with the holders named — but the number should be re-set from P0's own k = 1/4/12 measurement rather than from this paragraph. |
| **D14** | **Where does the pin live, and does a Task Group carry a default?** (§3.2.5 — the pin is one command; the question is which surfaces register it and whether a 岗位 may set a default for every session it owns.) | (a) the session-card right-click only; (b) the four surfaces (card menu, Session Properties, the live-view title bar, the New Session dialog); (c) (b) plus a Task-Group default rung. | **(c).** The four surfaces are one command with four `registerMenuItem` registrations, not four implementations, so the cost is the registrations. The Task-Group rung is what makes "this 岗位 always works in the vendor portal" a thing you say once — and it sits BELOW the conversation's own value, so it can never overwrite work a session already did. |
| **D15** | **Does a fork inherit the profile pin?** (§3.2.5 — `browserKey` deliberately does not.) | (a) inherit the pin (identity still fresh); (b) inherit neither; (c) inherit both. | **(a).** A pin is a preference ("this kind of work uses this login") and a key is an identity. (c) would give a fork another conversation's pinned tab, which is the defect §3.2.1 exists to prevent; (b) makes every fork of a portal session log in again for no reason. |
| **D16** | **Does a mid-session pin announce itself into the conversation?** (§3.2.5, the same category as D11 — an announcement is a billed turn.) | (a) never — the agent learns from `vibespace-browser status` and from its next launch landing in the new profile; (b) the free path only (a `<system-reminder>` on the user's next message); (c) (b) plus a delivery-ladder turn when the session is idle, behind a setting. | **(c) with the setting default OFF**, which is exactly (b) in practice. A pin is a user action, so the user is right there typing and the `pendingNotice` channel costs nothing. The ladder path exists for the one shape that channel cannot serve — an idle session the owner wants to redirect now — and it is declared, gated and off by default like every other unattended turn. |
| **D17** | **Do we ship the live backend switch, and who pays for CloakBrowser's seats?** (§7.4 — free = ONE concurrent session; Pro = 5 / 20 / 200 / 2000.) | (a) no switch — a profile's backend is fixed at creation; (b) switch on the free tier only, with the seat count shown and a loud refusal at the ceiling; (c) (b) plus a paid tier bought up front. | **(b).** The switch is the feature the owner asked for, and the free tier is enough to answer the only question that matters — does this site actually open. The seat count belongs in the dialog rather than in a support conversation later; buy a tier against a measured failure on a named site (D4's rule, unchanged). |
| **D18** | **Is auto-bind ON by default?** (§4.6 — when a session's browser starts and its chat window is open, the live view is born inside that chain in split.) | (a) ON; (b) OFF, bind is always a click; (c) ON only when the chat window is wide enough. | **(a) ON.** The binding is the answer to "whose browser is that", and a default that has to be discovered does not answer it. It is one setting, reversible per window by dragging a pane out, and the group is never dissolved on its own — so the worst case of being wrong is one drag. (c) is a hidden rule that will look like a bug on the day it does not fire. |
| **D19** | **In a split chain with a third tab, what does clicking that tab do?** (§4.6 — a chain may hold five tabs with two of them paired.) | (a) it replaces the non-owner pane; (b) the whole chain flips back to `'tabs'`; (c) a third pane opens. | **(a).** It keeps the binding (the chat pane, the thing the browser is bound TO, stays put) and it is the least surprising: the pane you were not looking at is the one that changes. (c) is refused on measurement grounds — three panes are all unusable below a width most people run, and the ratio model would have to become a tree. (b) silently destroys a layout the user built. |
| **D20** | **Do we build a WeChat local-store adapter?** (§4.8 — SQLCipher via WCDB, key in process memory; on this box `ptrace_scope` is `1`, so only an ancestor may read it.) | (a) no — picture via Xpra, data via the official Official-Account / Work-WeChat APIs; (b) yes, in core; (c) yes, but only in a plugin, with explicit consent, and only for a client VibeSpace started itself. | **(a), with (c) as the answer if the owner insists.** It is memory-scraping a proprietary client that breaks silently on every update, it crosses the ToS plainly, and the only way to make it technically work is to have VibeSpace start WeChat *so that* it can read its memory — a sentence that argues against itself as a default. If it is built, it is a plugin (D2's line for proprietary things with a legal face), never core. |
| **D21** | **Xpra's client half: host upstream's HTML5 app, or render it ourselves?** (§4.7 — MPL-2.0 app vs `xpra-html5-client`, Apache-2.0, on npm.) | (a) host the upstream HTML5 client as static assets behind our auth; (b) render with the client library inside a VibeSpace window type; (c) (a) first as a proving slice, then (b). | **(c).** (a) is the fastest way to learn whether the transport is good enough at 200 ms / 1 Mbps, which is the open question — but §4.2's reasons for refusing to embed upstream's dashboard apply here too (a whole app with its own controls inside ours, plus a known iframe `sessionStorage` restriction), so it is a proving slice and not the product. The window this design already specifies (§4.4: DPI-correct canvas, escaped titles, theme vars) is the shape (b) lands in. |

---

## 12. What I could not verify

1. **The stream protocol against a running browser.** Message shapes, `seq`, the input schema and
   the 403 origin rule are taken from upstream's documentation and changelog, not from a live
   socket. I deliberately did not start a browser: this box hosts the production instance plus
   ~160 checkouts, and the machine-hygiene notes are explicit that leaked browsers and daemons are
   a standing problem. **The first implementation task in P2 is to capture one real session's
   frames and pin the shapes in a fixture.**
2. **`--pin-tab` under our exact pattern** — N sessions, one profile, concurrent commands, one tab
   closed externally. The changelog says it fixes precisely this, but I have not run it (the
   installed build lacks the flag). P1 must reproduce the hijack on the *old* behaviour as a
   negative control and show it gone on the new one; a green test with no pre-fix control proves
   nothing here.
3. **Whether CloakBrowser's license check phones home,** what its binary sends, and whether the
   Ed25519 signature verification is implemented as described. All three are vendor claims. They
   are checkable in an afternoon and the check is now a **written P4 precondition with a recorded
   result** (§7.2.1), in the `src/local-oracles.js` proof shape — not an aside, and not
   something `test-vendor-whitelist` can do (§9).
4. **The real fingerprint benefit.** "73 patches" and "30/30 tests" are vendor marketing. I have
   not measured any site that agents actually fail on today, and I do not have a list of them.
   **Ask the owner for two or three concrete sites**; without them, D4 is being decided on a
   brochure.
5. **Copied-profile cookie decryption** on macOS (Keychain) and Windows (App-Bound Encryption) for
   the "use the user's real profile" path. The Chrome 136 restriction is documented and verified;
   what survives a profile copy is not, and I would not design around it.
6. **Cost of the bridge under real load** — N viewers × M sessions of base64 JPEG through the node
   event loop. The VNC bridge is the precedent and it holds, but JPEG-in-JSON is heavier than raw
   RFB, and `maxFps` is the knob. Needs measuring in P2, with the 8 MB / 1 MB backpressure
   thresholds re-checked rather than copied on faith.
7. **Whether agents will actually adopt the wrapper CLI.** P0 works whether they do or not, which
   is why it is P0. Everything above P1 assumes an agent asks for a profile; if they do not, the
   registry stays empty and the honest conclusion is that the surface is wrong, not the agents.
8. **Codex desktop's exact takeover affordances** — the pixel-level behaviour of the agent cursor,
   and whether handback is explicit or timed. I have the documented behaviour and press coverage,
   not the application. §4.3's idle handback is my addition, not something I observed — which is
   part of why D11 asks whether it should deliver anything at all.
9. **Remote sessions' env path for these variables.** `envPairs` / `fsWrite` already carry
   `VIBESPACE_API` on ssh, dial and daemon-pipe spawns; I read the call sites but did not run one,
   so P0 must assert delivery on each transport rather than assume symmetry. Variant D (§3.2.2)
   makes this harder in a way worth naming: `AGENT_BROWSER_CONFIG` points at a **file**, and a
   remote session needs that file on ITS machine — so the remote path is variant C or A until
   the config is shipped the way `AGENT_TOOLS` already ships the agent CLIs.

Added in round 2, all of them consequences of this round's own changes:

10. **The resource envelope of N concurrent browsers.** §1.2's per-instance numbers are real but
    they were taken on four *idle headless* leaks, not on the shape P0 creates (k concurrent,
    under P0's exact flags, headed or not, with pages loaded). The k = 1/4/12 measurement is a
    P0 task and the ceiling in D13 is a proposal until it is done.
11. **The Chromium user-data-dir singleton, not measured.** §3.2.2 calls variant B impossible
    because two Chromium launches cannot share one user-data-dir; that is Chromium's documented
    process-singleton behaviour and the reason the whole variant table exists, but I did **not**
    launch two browsers to watch it fail — this box hosts the production instance plus ~160
    checkouts, and §12.1's reason for not starting browsers applies. The failure mode if I am
    wrong is *better* than assumed, not worse (B would merely be slow rather than broken), and
    P0's gate asserts the resolved dir either way.
12. **`AGENT_BROWSER_CONFIG`'s exact semantics.** The CLI's `--help` says a custom config is
    loaded "instead of the defaults" and that a missing/invalid file is a hard error; whether it
    replaces *both* the user-level and project-level files, and whether `extensions` still merge,
    is documented ambiguously and not tested. P0 must run it once before committing to variant D
    — the fallback ladder exists because of this.
13. **The `browserKey` join across a resume.** `_sessionKeyMap` reads webui keys off
    `session-meta` filenames and `data.resumeId` is the conversation id; I read both but did not
    drive a resume through them, so P0 owes a real resume/fork leg rather than an assumption that
    the two namespaces line up.
14. **Whether the spend ceiling's defaults are the right ones for this producer.** The declared
    budget is per credential slot (12/h, 60/day), shared with auto-resume and Background Work.
    An explicit handback is rare, so it should never bind — but "should never" is a prediction,
    and the honest test is a week of real use with the journal read afterwards.

Added in round 3, all of them consequences of the owner's four questions:

15. **The two Chromium majors the version ladder is about.** CloakBrowser's own repository states
    free = Chromium 146 and Pro = 151; I did **not** read which Chromium major the installed
    `agent-browser` bundles, so I cannot say today whether a `chromium → cloak` switch is an
    upgrade or a downgrade on this machine. That is the ladder's very first question and P4 must
    answer it by measurement before the switch ships.
16. **That Chromium actually refuses the older-major open.** The refusal text and the direction are
    documented and widely reported, but I did not run two majors against one directory — for the
    same reason as §12.1 and §12.11. The failure mode if I am wrong is *better* than assumed (the
    ladder refuses a switch that would have worked), which is why the ladder is written to err
    toward refusal.
17. **Whether a fingerprint change logs a real site out.** §7.4 says a switch "may require a fresh
    login" because that is what fingerprint-bound sessions do by construction — but that is a
    statement about the technique, not a measurement of any site the owner uses. It shares §12.4's
    gap: **ask the owner for two or three concrete sites**.
18. **What agent-browser's `--restore` actually carries.** Playwright's `storageState` has an
    opt-in `indexedDB` flag, documented; whether agent-browser passes it is not something I read.
    So "export/import is lossy" is certain in the CryptoKey direction (that is what
    non-extractable means) and *unspecified* for IndexedDB in general. P4 must state the exact
    loss set in the dialog, which means measuring it first.
19. **The split-chain change against a real second client.** §4.6's sync-key trap is derived from
    reading `layout.js`'s `tabs.join(',')` key, not from running two browsers and flipping a chain
    on one of them. It is named as a trap and gated by a test precisely because it is a reading.
20. **Every number in §4.7.** Nothing there is measured by me and nothing measured by anyone else
    was found for the target (200 ms RTT / 1 Mbps): the public comparison of ssh -X / xpra /
    waypipe I read is explicitly qualitative, and this box has `Xvfb` but no `xpra` and no WeChat
    client. The per-window-vs-whole-desktop *argument* is sound; the ranking's exact spacing is
    not evidence. P8 produces those numbers as its first task.
21. **WeChat's web-version restriction today.** It is widely reported that many accounts cannot
    sign in to the web client, but it is an account-level policy and I could not confirm its
    current scope. This is why §4.7's flow is "try the web version once with the owner's own
    account first" rather than "install a native client".
22. **Whether WhatsApp Web's key handling still matches the write-up.** The non-extractable
    `CryptoKey` design and the monkey-patch technique are documented in a public analysis and in
    forensic literature, both of which describe a build older than today's. §4.8's adapter shape
    follows from that design; if the vendor has changed it, the adapter's shape changes with it,
    and P8 must re-check before writing code.
23. **That the `/proxy` local-echo path cannot carry WhatsApp Web — reasoning, not measurement.**
    §4.7's first reason for rejecting `src/lib/browser-window.js` (the page runs in the user's
    browser, there is no CDP target, the agent cannot drive it) is read off the source and is
    certain; the second (that node-unblocker's rewriting proxy does not carry its service worker or
    its persistent WebSocket) I did not run. It does not affect the conclusion — the first reason
    alone rejects the path — but anyone who later wants `/proxy` as a "let a human look at this
    site" path must measure it first.

---

## Appendix A — sources

* **agent-browser**: the installed 0.32.0 build (`--help`, `skill-data/core/references/*`
  including `session-management.md`, `trust-boundaries.md`, `commands.md`, `proxy-support.md`),
  plus upstream `CHANGELOG.md`, `README.md` and the current `streaming.md` /
  `session-management.md` for 0.33.0–0.37.1. Apache-2.0, `vercel-labs/agent-browser`.
* **CloakBrowser**: `cloakbrowser.dev`, the npm registry metadata for `cloakbrowser`, and the
  `CloakHQ/cloakbrowser` repository. MIT wrapper, proprietary binary.
* **Codex in-app browser**: OpenAI's own documentation (`developers.openai.com/codex/browser`,
  which redirects to `learn.chatgpt.com/docs/browser`) and contemporaneous coverage of the desktop
  app's browser panel and agent cursor.
* **Chrome 136 remote-debugging restriction**: Chrome for Developers, "Changes to remote debugging
  switches to improve security".
* **Round-2 measurements (2026-09-09, this machine, read-only — nothing was launched):** the
  installed CLI's own `--help` (config precedence, the env table's "disabled by default" idle
  timeout, the boolean-override syntax); `grep -a` over `bin/agent-browser-linux-x64` for the
  `--allowed-domains` refusal strings; `/proc` for the per-Chromium process count, RSS, PSS and
  inotify-instance figures in §1.2 (four idle headless instances left by this repo's own test
  legs) and `/proc/sys/fs/inotify/max_user_instances` for the ceiling; `~/.agent-browser` for the
  re-counted directories and `du` for the 98 GB / 6.8 GB figures.
* **VibeSpace (round 2 additions):** `src/spend-authorizer.js`, `src/server/conversation-deliver.js`,
  `scripts/test-spend-paths.mjs`, `scripts/test-vendor-whitelist.mjs`, `src/local-oracles.js`,
  `src/backend-caps.js` (`notificationDelivery`), `src/ws-create.js` (the id-minting lines),
  `src/resume-continuity.js`, `src/reading-repair.js` (`_sessionKeyMap`), and the gate-hygiene /
  fork-tax measurements of 2026-09-09..10.
* **VibeSpace**: `src/vnc.js` and the `/api/vnc` bridge in `server.js`,
  `src/lib/desktop-window.js`, `src/lib/browser-window.js`, `src/lib/window-types.js`,
  `src/opencode-serve.js`, `src/port-forward.js`, `src/cli-identity.js`, `src/session-schema.js`,
  `src/lib/settings-schema.js`, `src/ws-create.js`, `data/bin/vibespace-page`, `scripts/ci.mjs`,
  and the machine-hygiene / fork-tax measurements of 2026-09-09..10.
* **Round-3 sources (2026-09-10), for the owner's four questions:**
  * **Xpra** — the project's own docs (Seamless mode; Encodings: auto/webp/jpeg/avif/png and
    VP8/VP9/H.264/HEVC/AV1 with `min-quality`/`min-speed` tuning) and `docs/CHANGELOG.md`
    (7.0, 2026-08-27; 6.6 added http digest + scram authentication and http origin validation;
    6.5 added the Wayland backend). `Xpra-org/xpra-html5` (MPL-2.0, installable under another web
    server's path, with a known iframe `sessionStorage` restriction) and the independent npm
    package `xpra-html5-client` (Apache-2.0, 2.3.0). `jupyter-xprahtml5-proxy` as the precedent
    for wrapping Xpra in a host application's own auth.
  * **KasmVNC** — the project wiki's "Differences From TigerVNC" and its performance pages
    (TightJPEG / TightWEBP / TightQOI quality ladder, video mode).
  * **CloakBrowser** — the `CloakHQ/cloakbrowser` repository, for the three facts §7.4 rests on:
    free = Chromium 146 (58 patches) / Pro = 151 (73 patches); `launch_persistent_context(dir)`;
    `--fingerprint=seed` as a LAUNCH parameter ("same seed = same fingerprint across launches");
    the concurrent-session tiers (1 free, then 5 / 20 / 200 / 2000); and `cloakserve`'s
    per-connection seed query parameters with its own per-seed temporary profile directories.
  * **Chromium** — `docs/user_data_dir.md` ("two running Chrome instances cannot share the same
    user data directory"), plus the documented profile-version refusal ("Your profile can not be
    used because it is from a newer version of Google Chrome").
  * **Playwright** — `browserContext.storageState()`'s opt-in `indexedDB` option, verbatim.
  * **agent-browser's own changelog** — custom executable path (0.8.7), Chrome-profile support
    that COPIES the profile to a temp dir (0.24.1), `--restore` / `--restore-save` (0.31.0), and
    0.37.1 (2026-09-08) still being the newest release.
  * **WhatsApp** — the public write-up on backing up data through the multi-device web client
    (IndexedDB, AES-CBC bodies, non-extractable `CryptoKey`s, the `crypto.subtle.decrypt`
    monkey-patch) plus the forensic literature on WhatsApp Web's IndexedDB; and the multi-device
    limits (four linked devices, up to 14 days independent of the primary phone).
  * **WeChat** — the official native Linux client (Tencent, November 2024; deb / rpm / AppImage)
    and the public tooling that extracts WCDB/SQLCipher keys from the running client's memory on
    Windows, macOS and Linux.
  * **Unofficial WhatsApp libraries** — public reports on the ban risk of protocol-level clients
    (Baileys / WAHA / Evolution API) versus the official Business API.
  * **This machine, read-only, 2026-09-10:** `/proc/sys/kernel/yama/ptrace_scope` = `1`;
    `Xvfb` present at `/usr/bin/Xvfb`; `xpra` and a WeChat client absent.
  * **VibeSpace (round 3):** `src/lib/tab-group.js` (the chain model, `_syncChainBounds`,
    `restoreTabChain`, `_detachFromChain`, `_ungroupLast`), `src/lib/layout.js` (the
    `tabs.join(',')` sync key and the tabChain persistence), `src/lib/contributions.js` +
    `src/lib/session-card.js` (the `'session-card'` menu and its groups),
    `src/resume-continuity.js` (`resumeSpawnPick` / `applyOriginHint`), `src/task-groups.js`,
    `src/session-status.js` (`pendingNotice`), `src/account-material.js`
    (`repointPoolSymlink`), `src/lib/settings-schema.js` (`SETTINGS_CATEGORIES` — there is no
    Browser category yet), and `docs/kb-file-structure.md`'s Communication Channels v1 entry.

---

## Appendix B — critique log (round 2)

An adversarial critic read round 1 and filed eight findings. Every one was checked against the
source before anything was changed; the verification commands and the exact evidence are below,
because "verified" is a claim about what was run, not a feeling about a diff. **All eight are
upheld.** Two carry a correction where the critic's sub-claim was imprecise, and both corrections
make the finding *worse*, not weaker. Three additional defects were found while verifying and are
recorded at the end.

| # | Finding | Verdict | Where it landed |
|---|---|---|---|
| 1 | Idle handback delivers a turn nobody typed, with no mention of the spend authorizer anywhere in 804 lines | **UPHELD** (one sub-claim corrected) | §4.3.1 (new), §9 `test-spend-paths` row, §10 P3, D11 |
| 2 | §1.1 and §3.2 assert opposite things about `config.json`'s `profile`, so P0 cannot hold | **UPHELD** | §1.1 (precedence), §1.5 (rejection list), §3.2.2 (variant table), §6.3, §8.4, §9, D12 |
| 3 | `use` prints the raw CDP URL — I2 is defeated by the documented happy path | **UPHELD** | §5.1, §3.4, §6.2, §6.5, D6 |
| 4 | `vs-<webuiId>` is not the conversation; every resume leaks a pinned tab and a lease that disables the idle timeout | **UPHELD** | §3.2.1, §3.3, §3.5 (boot reconciliation), §9, §12.13 |
| 5 | The `test-vendor-whitelist` claim is false — it is a source census and cannot see a binary's traffic | **UPHELD** | §9 (claim deleted), §7.2.1 (new), §12.3, D4 |
| 6 | P4 and P5 have no suite, which §9's own opening sentence calls disqualifying | **UPHELD** | §9 (`test-browser-providers`, `test-browser-housekeeping`), §10 |
| 7 | P0 turns one Chromium into N and the doc never measures it; I4 is worded to exclude the default path | **UPHELD** | §1.2 (measured), §2 (I4 re-worded), §3.2.3, §3.5 (ceiling), D13, §12.10 |
| 8 | The headline schedule publishes only the point estimate of a range whose top the risk paragraph names | **UPHELD** | §10 (range + risk-weighted headline; the "about a week" claim corrected to ~3 days) |

**Verification notes, including the two corrections.**

* **Finding 1, corrected sub-claim.** The critic wrote that routing the announcement through the
  ladder "is refused on every fire (a silently dead feature)". That is true only if the producer
  declares its own `spendReason`. `src/server/conversation-deliver.js` defaults an unknown or
  absent reason to `'peer-message'` ("an unknown/absent reason is 'peer-message', the same
  conservative default the lane itself uses"), which is a **declared** reason — so a reason-less
  call is charged, not refused. That is worse than the critic's version, not better: the turn is
  billed to another producer's name, and the budget journal plus the "For you" notice both
  misattribute it. Everything else in the finding is exact: `SPEND_REASONS` is
  `Object.freeze({...})` with five entries and `authorizeUnattendedSpend` returns
  `no('unknown-reason', …)` for anything else; `scripts/test-spend-paths.mjs` declares
  "PER SITE, NOT PER FILE" with `deliver-ladder: /deliverToConversation\s*\(/` among its
  primitives; and `notificationDelivery()` returns `steer` only for `peerDelivery === 'rpc-queue'`
  with `inputModes.steer`, i.e. claude's lane is `cli-inbox` and an idle recipient is a billed
  turn.
* **Finding 2, verified in both directions.** The CLI's own `--help` prints the precedence table
  quoted in §1.1 (config file < environment < flags), so the `profile` key really does apply to
  every un-overridden invocation, and an environment variable really is a legitimate override —
  which is what makes the fix possible at all. The `--allowed-domains` refusal strings were
  enumerated from the installed binary (`grep -a` over `bin/agent-browser-linux-x64`) and the
  critic's quoted string is verbatim; the useful discovery is what is **absent** from that list
  (`--session`), which is what §6.3 now rests on.
* **Finding 5, verified.** `scripts/test-vendor-whitelist.mjs` walks `src/` (skipping `src/lib`),
  `server.js` and `data/bin/`, matching
  `/api\.anthropic\.com|platform\.claude\.com|console\.anthropic\.com|claude\.ai\/|anthropic-beta/`
  near a request primitive; its own header says the contract is "which code may construct a
  request to Anthropic is pinned HERE". The critic's fix is adopted, and improved by pointing at
  `src/local-oracles.js`, which already implements exactly the proof discipline this needs
  (tool + date + version + per-run INET connect counts, re-measured live when `strace` and the
  CLI are both present, with measured-and-rejected candidates kept forever as negative controls).
  The one nuance worth stating: CloakBrowser cannot itself be a `local-oracles` entry — that
  registry is for **zero-network** reads and a browser is a network tool. It borrows the shape,
  not the verdict.
* **Finding 8, arithmetic re-derived.** Round 1's per-phase ranges summed to 21 low / 41 high
  against a published point of 27; the critic's numbers are exact. Round 2's phases changed (P0,
  P3, P4 and P5 all grew), so the new figures are 25 / 31 / 46 with a risk-weighted 37. While
  re-deriving, the **"about a week earlier"** claim for the alternative order turned out to be
  wrong on round 1's own numbers too: P2 completed at round 15 canonically and round 9
  alternatively, i.e. 6 rounds = **3 days**, not a week. Corrected in §10.

**Three defects found while verifying, which the critic did not file.**

* **§1.2's idle-timeout inference is unsupported on the installed build.** Round 1 explained the
  absent daemon as "consistent with upstream's 1-hour idle timeout", but 0.32.0's own `--help`
  says `AGENT_BROWSER_IDLE_TIMEOUT_MS … (disabled by default)`. Nothing collects an agent's
  browser on this machine today. This makes finding 7 materially worse and is why §3.2.3 sets the
  timeout explicitly instead of relying on a default.
* **The 1-hour default, where it exists, exempts headed browsers** — and this machine's config is
  `headed: true`, so the exemption is the live case rather than a corner. Folded into §3.2.3 and
  D13.
* **`--session` is not in `--allowed-domains`' refusal list.** Round 1 asserted the ephemeral
  benefit without checking which flags actually conflict; the enumeration in §1.5 both confirms
  §6.3's intent and shows it is conditional on D12 choosing a variant with no user-data-dir.

**What round 2 deliberately did not do.** It did not launch a browser (§12.1's reason still
holds, and §12.11 states the one claim that is therefore unmeasured), it did not change the
three-tier routing in §3.6, and it did not soften any of round 1's own "what I could not verify"
entries — that list grew from 9 to 14.


---

## Appendix C — critique log (round 4)

An adversarial critic read round 3's revision and filed six findings. **All six are upheld**, each
checked against the source before anything was changed; what follows is the command that was run
and the answer it gave, because "verified" is a claim about what was run and not a feeling about a
diff. None was judged wrong, so this round has no rejected entry.

| # | Severity | Finding | Verdict | Where it landed |
|---|---|---|---|---|
| 1 | high | The blank line between D13 and D14 terminates §11's GFM table, so **this round's whole set of eight new decisions, D14–D21, renders as a wall of pipes** | **UPHELD** | One line deleted in each doc (`.md:1636` / `.zh.md:1414`) |
| 2 | medium | The ownership badge reuses "the colour the session card already uses", and the session card has **no** colour: `task-color-seq.js` colours **task groups** | **UPHELD** | §4.6 badge paragraph rewritten as a per-session derivation + two new fast cases in `test-window-binding` |
| 3 | medium | `split.pair` holds window ids with no rule governing it under chain mutation; host promotion is a reachable path that leaves a dangling id | **UPHELD** | §4.6's new `_normalizeChain` invariant + a third lifecycle case + one new fast case |
| 4 | medium | §4.7's "no path here can do local echo" is falsified by the product itself: `/proxy` + `src/lib/browser-window.js` is one | **UPHELD** | §4.7's conclusion restated as "every path an **agent can also drive**", with the exception and its two rejection reasons written out + §12.23 |
| 5 | low | `task-group` is a fifth value in the **frozen** four-value `SPAWN_ORIGINS`, and the `applyOriginHint` rule borrowed to justify it points the opposite way | **UPHELD** | §3.2.5 names the two-site edit + replaces the wrong justification + `test-browser-pin`'s vocabulary assertion |
| 6 | low | The sentence whose whole job is to bound the estimate cites **46 rounds**, a figure that exists in none of its own tables (round 2 residue) | **UPHELD** | §10 now says 82 (sum of extremes) against 66 (risk-weighted) |

**Verification notes.**

* **Finding 1.** Rendering §11 of both files with the repo's own `marked` yields exactly **one**
  `<table>` with 14 `<tr>` (header + D1–D13) per file, while D14 and D21 land in `<p>` with literal
  pipes. Scanning every consecutive pipe-block in both files: 18 blocks each, exactly one per file
  whose first line has no delimiter row after it — `.md:1637` and `.zh.md:1415`, both immediately
  preceded by an empty line. After the fix, re-rendering gives one `<table>` with **22** `<tr>`
  (header + D1–D21) and zero `<p>` in §11 of each file.
* **Finding 2.** `grep -n 'seqTaskColor\|taskGroupColor\|colorSeq' src/lib/session-card.js
  src/lib/sidebar-render.js` returns **nothing**; the repo-wide consumers are `sidebar-tasks.js:258/270`,
  `task-detail.js` and `session-props.js:499`, every one keyed on a task-group record. The critic's
  proposed replacement source (the `sess-<seq>` counter in the webui id) checks out:
  `src/ws-create.js:234` is `'sess-' + seq + '-' + Date.now()`. But the sub-claim "stable across
  resume" is **imprecise** and the doc is narrower for it: `boot-restore.js:200` reuses
  `meta.webuiSessionId` on a **server restart** only, while a resume through ws-create mints a new
  key. The doc therefore states "survives a restart, changes on a resume" and says why that is
  acceptable for a badge.
* **Finding 3.** The three chain-mutation sites in `src/lib/tab-group.js` were read: `addToTabChain`
  (splice/push at 176-181), `_detachFromChain` (467) and `removeFromTabChain` (546, which does not
  touch `tabs` itself and delegates). The host-promotion branch is at 477-497, guarded by exactly
  `idx === 0 && chain.tabs.length > 1`. `grep -rn '_normalizeChain' src/` returns nothing, so "this
  rule has no home today" holds. One correction: the critic attributed the host branch to
  `removeFromTabChain`; it is in `_detachFromChain`, and the doc names the latter — which does not
  change the finding, only makes "one place" point somewhere real. One thing the critic did not say
  but the same invariant must answer was added: a split renders **inside the host's element**, so a
  host change must move and re-lay-out both panes even when both `pair` members survive.
* **Finding 4.** `src/lib/browser-window.js:8` is
  `openBrowser(app, url, { syncId, proxy = false })` and `:74` is
  `iframe.src = proxyMode ? '/proxy/' + u : u`; `server.js:636-647` mounts node-unblocker at
  `/proxy/`, `:236` makes the body parser skip it, `:1861` dispatches its WebSocket upgrade. And
  `browser-window.js` appeared **zero** times in the body (only in Appendix A's source list,
  `.md:1785` / `.zh.md:1538`), with `unblocker` and `/proxy` appearing nowhere at all. The
  conclusion is restated as the critic proposed — every path an **agent can also drive** pays one
  RTT — and the ranking is unchanged.
* **Finding 5.** `src/resume-continuity.js:56`'s `SPAWN_ORIGINS` is an `Object.freeze` of four
  values whose comment forbids inventing a fifth; `agent-meta.js:338`'s `spawnValueOrigin`
  whitelists the same four and falls through to `responseStyleOrigin`, so the consequence of a fifth
  string is a **silently wrong label**, not an error. `applyOriginHint`'s JSDoc is verbatim "It may
  only DOWNGRADE a 'chosen' to a fact the user did not state, never upgrade or re-point anything",
  which is indeed the opposite direction from `instance → task-group`. The doc now rests on the
  justification that does hold (both rungs mean the same thing, so the swap adds information without
  changing the claim).
* **Finding 6.** Re-derived from the phase rows: 5+8+6+5+9+4 = 37 (P0–P5), range 29–54; +6 gives
  43 / 33–63 (P0–P6); +5+7 gives 55 / 42–82 (P0–P8); risk-weighted (P2, P4, P8 at range top) gives
  44 / 50 / 66 — each matching the published table. `46` occurs nowhere else in §10; it is round 2's
  P0–P8 figure (Appendix B's "25 / 31 / 46").

**One defect found while verifying, which the critic did not file.** After finding 1, both files
were rendered whole to look for **any** emphasis that fails to parse (the test: a literal `**`
surviving into the rendered HTML). The Chinese doc had one, in §5.1:
``默认**`exec` 一个子 shell**``. Under CommonMark's flanking rules a `**` preceded by a CJK
character (neither whitespace nor punctuation) and followed by punctuation — here a backtick —
**cannot open** emphasis, so that line rendered with two literal `**`. The English twin is fine
because its `**` is preceded by a space. The fix moves 默认 inside the emphasis
(``**默认 `exec` 一个子 shell**``) with no change of meaning. This is finding 1's class: **in the
Chinese doc, a `**` butted against a Han character is a defect that never throws and only ever
renders as literal asterisks**, visible only after rendering. After the sweep, both files render
with zero unparsed emphasis outside code fences.

**What round 4 deliberately did not do.** It did not launch a browser (§12.1's reason still holds),
did not change any decision's recommendation, did not move a phase's round count (finding 6 only
made the bounding sentence cite its own table), and did not soften any "what I could not verify"
entry — that list grew from 22 to 23.

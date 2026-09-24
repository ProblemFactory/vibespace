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

**Round 5 (2026-09-10)** answers three owner questions and, as before, folds each one **into** the
architecture, the phases and the decisions rather than appending it: **Q7 multi-browser,
multi-agent** — one session may drive **several** browsers at once and one agent may spawn
sub-agents that each want their own, so "pin a profile" becomes **the default of a SET** rather
than a singleton, every command is addressed to a **handle**, and "reconcile data across a personal
and a work profile" becomes a first-class shape (§3.7, D22–D24); **Q8 explicit profile selection** —
the anti-default-blindness mechanism at three layers: every tool answer names the profile it acted
on, a change to the attachment set makes the NEXT command a typed `profile_changed` refusal, the
per-turn micro-reminder carries it to the model, and the chat status bar grows a Browser chip that
turns amber when what the agent actually used and what the user pinned disagree (§3.8, D25–D26);
**Q9 local windows as computer-use targets** — whether an agent can drive **any native window** the
way it drives a browser: a `vibespace-window` family beside the browser one, an honest per-platform
capability matrix (X11/Xwayland, the three Wayland roads, a nested compositor we run ourselves, a
paired Mac), an evaluation of AT-SPI2 as the DOM of a native window, the lease/takeover security
model, and its own phase P9 (§4.9, §5.1.1, §6.6, D27–D30). §2 grows two invariants, §9 three suites,
§10 re-derives the totals and adds P9 to the risk-weighted column, and §12 grows from 23 entries to
31. **Every claim about this machine in this round is a read-only measurement taken that day**
(GNOME Wayland + Xwayland, AT-SPI's nine applications and its traversal speed,
`org.gnome.Shell.Introspect.GetWindows` answering AccessDenied, `/dev/uinput` at 0600, the portal's
interface list, 80 of 128 inotify instances already held), and each one is written beside the
sentence it supports.

**Round 7 (2026-09-11)** answers one owner directive and one queued question, and as before folds
both **into** the architecture, phases and decisions rather than appending them: **a configuration
surface for integration keys** — the owner, verbatim: "对于指纹浏览器和 communication panel 这种
可能需要配置自己的 key 的情况，要考虑怎么提供配置界面，让我们集群里的用户可以自行配置（当然 lark
这种集群里能提供默认 oauth client 的就提供默认）". This track is a **consumer** of the shared
**Integrations & keys** layer (the layer itself is defined in the communication-panel document):
`cloak`'s key and every `cloud:<name>`'s key become rows in `src/integration-registry.js`, stored
encrypted by `src/server/integration-store.js`, resolved as **the user's own > the cluster default >
none**, with a source chip on the switcher and, when a key is missing, a named refusal plus an
actionable `app.openIntegration(id)` way out (§7.5, I8, D32–D33). One finding came out of verifying
it and is **true today**: `agentEnv()` is a **DROP list plus one prefix rule**, so a cluster key
injected under **the vendor's own** env name would be in every agent's environment
(`src/ws-handler.js:112-121`) — which is why the cluster may inject only under
`VIBESPACE_INTEGRATION_*`. **Q10, the detection ladder** — the owner's 2026-09-10 question ("is
agent-browser CDP; would a bank like Mercury detect it; do we also need a pure computer-use
version?"): agent-browser is CDP end to end (measured in the binary), today's only stealth is one
launch flag the user wrote in their own config, upstream issue #120 is still open admitting that is
not enough, the classic `Runtime.enable` leak is largely dead so any patch aimed at one leak is a
depreciating asset, and **banks run on device fingerprint + behaviour + new-device step-up**, so a
fingerprint browser may be **worse** than plain Chromium on that class of site. The landing is three
sibling provider rows in §7.1 (tier 1 CDP / tier 2 fingerprint CDP / tier 3 **pure computer-use on
the user's own real browser, with no CDP and no automation flags**), a `siteHints` `tier` that is
**legal only while no provider has been chosen** and is **never auto-escalated**, and tier 3's own
phase P10 (§7.6, D31). §2 gains invariant I8, §3.3
and §3.6 gain a rule and a row, §9 gains a suite and four key legs, §10's P4 goes from 9 to 10 rounds
with an explicit **cross-track dependency**, P10 is new and the totals are re-derived, §11 gains
D31–D33, and §12 grows from 33 items to 39. **Every claim about the installed build in this round is
a read-only measurement taken that day against `bin/agent-browser-linux-x64` and its README**, and
every claim about this repository carries a file:line.

**Round 8 (2026-09-11)** answers an adversarial critique of round 7: eight findings, **all upheld**,
with the verification evidence in **Appendix E**. All three `high`s land on the section round 7
itself had just written, and all three are the same thing — **a contract that was declared and then
not honoured**: ① the six registry rows declared a `test` but gave it neither a `test.kind` (the
shared layer's **closed set**) nor a runner registration, and brought in five third-party hosts
nobody had declared — while the shared layer's right to say "the store constructs no vendor request"
**rests on** the consumer having declared its hosts; the six rows now carry kinds, all six runners
are registered by `src/server/browser-backend.js`, `cloak`'s row drops to `shape-only` (a real
launch-probe would trigger both the 200 MB download and §7.2.1's egress precondition, and neither
belongs on a card opened to paste a key), and there is a new **per-row derived** egress declaration
(`browserless` / `kernel` take their host from **the field the user typed**, so a constant allowlist
is the wrong shape). ② The seat **total** had exactly one source — one human Test click — while
D32's recommended configuration guarantees that click **never happens**; the total is now **three
states** (known-and-fresh / known-but-stale / **unknown**), the tier is read back from **the first
real launch**, `SEAT_TIER_STALE_MS` mirrors this repository's own `OVERAGE_STALE_MS`, and **an
unknown total never satisfies the ceiling test**. ③ There are **three** failure modes, not two: a
fleet-shared free-tier key has one seat and the keeper counts only this instance, so the ceiling
refusal is **structurally unreachable** in D32's recommended configuration and the user gets an
unnamed launch failure — verbatim the harm §7.4 warns about three paragraphs earlier; hence
`backend_seat_taken`, carried as a stated **precondition** of D32's recommendation. Four `medium`s:
the key has no cross-machine channel today yet sits in the phase that puts a keeper on a paired
device (`keyScope: 'local-only'` + the new **D34**); `siteHints.tier` contradicted §3.3's "no second
tier field" (the rule narrows to "`tier` is legal only while `backend === null`", both schema blocks
change, and the gate asserts that sentence); five of the six `consumers` cells named **themselves**
(replaced by the two modules that really call `resolveIntegration`); and `local-window` was treated
as a provider one could "switch" to (new capability cells `keyScope` / `canSwitchTo` / `ownsDir` /
`leaseKind`, plus §7.6's new rule 3). One `low` corrects why `cloak` uses the env (**two** of the
three channels miss disk, and by §6.5's own threat model env is the weaker one; the real reason is
that `cloakserve` is a **separate process**, so the in-process option is unreachable). §7.1 gains a
capability-cell table, §7.4's seats and failure modes are rewritten, §7.5 gains the Test-contract
table, the egress declaration and the runner registration, §7.6 goes from four rules to five, §9's
key legs go from four to eight and `test-browser-backend` gains the three seat states and the source
fork, §11 gains **D34**, and §12 grows from 39 entries to 41. **P4's round count did not move (still
10), and the cell says why.**

**Round 6 (2026-09-10)** answers an adversarial critique of round 5: six findings, **all upheld**,
with the verification evidence in **Appendix D**. Two highs each name a claim that would have been
**false on the day it shipped**: the whole anti-default-blindness mechanism lives in
`vibespace-browser` while this design's **own default path is a direct `agent-browser` call**, so I6
is narrowed to "a command through our CLI" and the half that can be closed structurally is actually
closed (a non-default attachment's directory is minted by the server and never printed — §3.7,
§12.32); and §4.9's capability law was enforced for one verb although, of the four action verbs,
`key` (a chord) has **no road on the accessibility tree at all** and `click @ref` works only on
nodes that **declare an action** — which this round **re-measured**, getting stronger numbers than
the critic's (503 nodes across nine applications: `Action` on 66, `EditableText` on 33, and **only 6
of 43 `button` nodes** exposing `Action`), so the matrix's action row splits into four, §5.1.1 gains
a per-verb capability table, and D28 is narrowed to the scope its measurements support. Three
mediums each kill a sentence about a mechanism that does not exist: the sub-agent row's
contradiction with D23; "zero new mechanism" (`pendingNotice` is **one** slot, one hardcoded
renderer, one consumer that breaks on the first hit); and a `LIVE_SESSION_FACTS` row that cannot
carry two values and whose digest becomes a constant if made an object. One low puts the AT-SPI walk
back under the "never block the event loop" law (bounded child, per-call timeout, node budget) and
names the binding every figure in this round was taken through (`libatspi`'s cache, §12.33). **No
decision's recommendation changed** — what changed is that D23 and D28 are each narrowed to the
scope their measurements support; §12 grows from 31 entries to 33.

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
| I6 | (implied, Q7/Q8) One session may hold several profiles at once | **A command THROUGH OUR CLI acts on the profile it NAMES, and when more than one is reachable it must name one.** Ambiguity is refused by name with the handles listed, never resolved by a default; and every answer states the profile it just acted on — so "it used the wrong profile" is visible on the next command instead of after the work is done. "Through our CLI" is load-bearing rather than a hedge: this design's own default path **is** a direct `agent-browser` call (the whole of §3.2 is four environment variables), which reaches none of our code. §3.7 writes that residual down together with the half of it that can be closed structurally — an invariant that cannot hold on the default path is false the day it ships unless its wording is narrowed. |
| I7 | (implied, Q9) A window target IS the user's desktop | **A native window is leased like a tab and observed like a DOM.** Input is injected only while the lease holder is the agent and the user has not taken over; where an accessibility tree can be read, coordinates are never guessed from pixels; and a window we did **not** start is a stricter road (D27). |
| I8 | (implied, owner 2026-09-11) Users across the fleet must be able to configure their own keys | **A provider key is owned by the user, defaulted by the cluster, and never comes one step closer to an agent.** Precedence is always "the user's own > the cluster default > none"; a consumer **never reads `process.env` itself**, it asks `resolveIntegration(id)`; the cluster may inject only under `VIBESPACE_INTEGRATION_*`, because that is the prefix `agentEnv()` structurally drops (`src/ws-handler.js:117`), while the vendor's own env name appears only in the **one** provider child that is spawned; and "no key" is a **named refusal plus an actionable way out** (open that card), never a silent fallback. |

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
   owns: a `<system-reminder>` appended to the user's **next** message. Zero billed turns — but **not**
   zero new mechanism: that slot is today a **single** fixed-shape field with one hardcoded renderer
   and an injection site that consumes one and breaks, so this design's two producers (this
   `'browser-pin'` and §3.8's layer ② profile change) would overwrite each other and the
   status-override notice besides. §3.8's layer ② writes that change out — a queue, dispatch on
   `kind`, a draining injection site — and it is **one** change shared by both, not one each. Only when the session is **idle** and the user explicitly asks does it go through
   §4.3.1's delivery ladder (a new declared reason `'browser-pin'`, added to `SPEND_REASONS` in the
   same change as its producer), setting `browser.announcePin`, default **OFF**. This is the same
   rule as §4.3.1's "three moments, three answers" table, applied to a fourth moment.

**The Task-Group default (a 岗位 carrying a default profile for all its sessions)** is one field on
`task-groups.json` and one picker row in task-detail, beside `contextDir` and `externalVisibility`.
It is simply the third rung above: it **never** beats a session's own explicit choice, and never
beats the conversation's own history. Binding or unbinding a Task Group does **not** rewrite the pin
of a session already running — a default is where a new session starts, not a retroactive edit of
existing ones.

**And that pin is the default of a SET, not a singleton (Q7).** The ladder above answers "which
profile does an **unaddressed** command land on", and from the first day that answer should have
been called the **default attachment**: a session holds an attachment **set**
(`attachments: [{profileId, alias}]`) with exactly one marked default. While the set has one member
everything written in this section holds verbatim, which is the shape of nearly every session. Once
it has two or more, §3.7 takes over: a command must name a handle, and `pin` changes only the
**default**. That is not a reversal of this section — it is writing down the quantifier it has been
carrying implicitly.

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
    "provider": "chromium",                 // chromium | cloak | cdp | cloud:<name> | local-window
                                            //   THE BACKEND AND THE TIER (§7.4, §7.6). Never a key:
                                            //   the key lives in the integration store (§7.5).
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
  "siteHints": [{ "host": "portal.example", "tier": null, "backend": "cloak",
                  "by": "agent", "at": 0, "why": "…" }]   // §7.4 — a CLAIM, with who made it.
                                            //   `backend` MAY be null (a tier-only claim, made
                                            //   before any provider is chosen); `tier` is legal
                                            //   ONLY then — once `backend` names a provider the
                                            //   tier is DERIVED from it (§7.6 rule 2) and is
                                            //   never stored twice.
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
  alone. **The tier is likewise not a new field on a profile record**: it is derived from
  `provider` (§7.1's two tables), because a provider sits on exactly one tier, and storing it twice
  is building yourself a twin that will drift. **But the `tier` inside `siteHints` is a different
  thing, and it is not a twin.** A site claim can be true *before any provider has been chosen*
  ("this site needs tier 3") — §7.6's rule 2 is explicit that a failure produces only a
  **suggestion**, and all a suggestion can say is "change tier", because *which* provider within
  tier 2 is a separate question. In that shape `backend` is `null` and `tier` is the **only** thing
  the claim carries. So the rule is one enforceable sentence: **`tier` is legal only while
  `backend` is `null`**; the moment `backend` names a provider the tier is derived from it and never
  stored a second time. §9's `test-browser-tier3` asserts **that sentence**, not "no `tier` field
  anywhere" — the latter contradicts §7.6, and a gate that contradicts the design it gates is the
  thing that is wrong. The same distinction governs §7.1's capability-cell table: **the derivation
  lives in a PURE table, and the persisted record stores not one of those cells.**
* **A profile references a provider's `id`, never its key.** There is no `apiKey` / `licenseKey` /
  `token` field in this file and there will not be one: keys live in `data/integrations.json`,
  encrypted through secret-box, resolved by `resolveIntegration(provider)` **at the instant the
  keeper spawns** (§7.5). Both consequences are deliberate: **rotating one cluster env rotates every
  profile** (the Drive-presets rule, `src/mounts.js:2211`), and `data/browser-profiles.json` stays a
  file you can paste whole into an issue.
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
* **A sub-agent's lease is its parent's lease plus a suffix.** A tab a sub-agent takes is recorded
  under `bk-<parent>.<n>` (§3.7), so the parent session's teardown reaps them **by prefix**: a
  sub-agent ends silently (it has no `onExit` to give us), and "the parent is gone and a child still
  holds a tab" is §1.2's 53 orphan directories one layer up. A child lease is an ordinary row in the
  registry whose `browserKey` carries a suffix — not a second record type.

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
| Provider keys (§7.5) — **this track is only the CONSUMER**: the registry rows, one `resolveIntegration(provider)` before the keeper spawns, the switcher reading `publicView(id)`, and the `app.openIntegration(id)` deep link | the layer itself is `src/integration-registry.js` (PURE), `src/server/integration-store.js` (ORCH) and `src/secret-box.js` (SHARED), **owned by the communication-panel track**; this track adds only its own rows and two call sites | **PURE + ORCH + CLIENT** (the layer) · this track = the call sites | the layer: `test-integration-registry` (that track's) · this track: the key legs of `test-browser-providers` (§9) |
| Split tab groups (§4.6): `layout`/`split` on the chain, the divider, the born-into-a-chain path | `src/lib/tab-group.js`, `src/lib/layout.js` (persist + sync key) | **CLIENT** | `test-window-binding` (headless chrome) |
| The attachment set, handle resolution, the ambiguity refusal, the audit line (§3.7) + the anti-default-blindness decision (§3.8) | `src/browser-profiles.js` (PURE: `resolveHandle` / `attachmentsFor` / `handleRefusal` / `profileChangeNotice`) | **PURE** | `test-browser-handles` (fast) + `test-profile-blindness` (fast + heavy) |
| Native-window forwarding (§4.7) + the chat adapters (§4.8) + a window target's facts and actions (§4.9) | `src/xpra-serve.js` (SHARED facts) + `src/window-targets.js` (SHARED: enumeration / a11y snapshot / the input-backend ladder; **the AT-SPI walk runs in a bounded child/worker with a per-call timeout and a node budget — one D-Bus round trip per node, and an application that stops answering blocks until libdbus's 25 s default, so it never runs on the server's or the daemon's event loop, §4.9**) + `src/server/xpra-bridge.js` + `src/adapters-chat/<name>.js` + `data/bin/vibespace-window` | **SHARED + ORCH + agent surface** | `test-native-window` (heavy) + `test-window-target` (heavy) |

`hostId` is a parameter, never a branch: `browser-access.js` picks the transport (local keeper /
`browser-serve` device op / ssh) and nothing downstream asks "is this remote?" again — the same
shape as `src/server/opencode-access.js`. `server.js` gains **wiring stanzas only**; its size
ratchet is a build gate.

### 3.7 One session, several browsers — the attachment set, handles and sub-agents

(Owner question Q7.) Up to this point the document has quietly assumed "one session = one browser".
That assumption holds for the common shape and fails for the thing the owner actually asked for:
**one session may drive several browsers at once** (a personal profile and a work profile, with the
task being to reconcile the two), and **one agent may spawn sub-agents that each want a browser**.
This section writes the quantifier down and answers what "pinning" means in the plural.

**The model: a session holds an attachment set, exactly one of which is the default.** The
registry's `leases` are already the record of "which session is attached to which profile" (§3.3),
so nothing new is stored: a session's attachment set **is** its set of leases, and
`session-meta.browserProfileId` (§3.2.5's pin) is re-read from "this session's profile" to "this
session's **default** profile". `vibespace-browser use <label|id> [--alias <name>]` adds an
attachment and gives it a short alias (defaulting to the label's slug), `detach [--profile <handle>]`
removes one, and `pin` changes only the default. An empty set is §3.2.2's ephemeral browser,
verbatim.

**Addressing: the handle is an argument of the command, not a property of the shell — because a
sub-agent's shell is not ours.** That is decided by a measured fact rather than by taste:
**VibeSpace does not spawn sub-agents.** A claude sub-agent is a sidechain record on the same CLI
process's stdout (`src/session-store.js:308`'s `isSubagentMessage` reads
`parent_tool_use_id || isSidechain`, and `src/session-schema.js`'s `_subNormalizers` is a map of
"one normalizer per sub-agent" — one process, one stdout); a codex sub-agent is a thread its own
app-server owns. Both environments froze at the moment the parent process was spawned. The only
things we **can** hand an environment to are the ones we spawn ourselves: the session (§3.2's four
variables) and a Background Work job (`jobEnv({…})` at `src/jobs.js:375`, which is already how
`VIBESPACE_JOB_TOKEN` travels). Hence:

| The shape of the command | Where it lands | Set of exactly one | Set of two or more |
|---|---|---|---|
| A bare command (`vibespace-browser snapshot`) | the default attachment | runs; the answer names the profile | **named refusal** `profile_required`, listing every handle and which one is the default |
| `--profile <id\|alias>` | the one named | runs | runs |
| A shell that exported `VIBESPACE_BROWSER=<alias>` | that shell's default | runs | runs (identical to putting `--profile` on every command) |
| A sub-agent's bare command | whatever environment it inherited | the parent's browser — **this is today's physics**, and D23 recommends against relying on it when the parent's default is a persistent logged-in profile | refused (`profile_required`, the same one a bare command gets); the "you are a sub-agent" clause is added only when the server can **see** a sidechain open right now — see below |
| `--profile <a filesystem path>` | — | **refused**: this CLI's `--profile` takes a registry handle; register a path with `vibespace-browser new` | same |
| A **direct** `agent-browser` command (not through our CLI at all) | the user-data-dir this session's env points at, i.e. **the default attachment** | runs | still the default — **we cannot refuse it**, see below |

That last row is load-bearing: `agent-browser`'s own `--profile` takes exactly a name **or a path**
(§1.4), so an agent that already knows `agent-browser` will naturally hand us a directory — and that
is precisely how §1.2's 53 unowned directories came to exist. A flag that is spelled the same and
means something else must be separated **loudly**, and the refusal must carry the command that turns
a path into a handle.

**And the last row is the residual this section owes, so it is written down rather than routed
around.** §3.2's default path **is** a direct `agent-browser` call — the whole of P0 is four
environment variables, "no process of ours, no route, no daemon", and §5.2's first bullet says "an
agent that never reads a word gets isolation from §3.2". A bare direct command therefore runs
through none of our code: layer ①'s `profile_changed` refusal **cannot reach it**, and neither can
`profile_required`. Half of that can be closed structurally; the other half has to be admitted:

* **The half that closes: make a non-default attachment unreachable without a handle.** The config
  in the session's env (variant D) or the symlink (variant C) names the user-data-dir of the
  **default attachment only**; a non-default attachment's directory is minted by the server and
  handed only to the child process that `vibespace-browser --profile <h>` execs, and is **never
  printed** (§5.1's "`use` does not print a CDP URL" rule, generalised to directories). A direct
  command therefore **cannot reach browser #2**: `--session` and `--profile` are indeed
  per-invocation flags (§1.4), but it cannot fill in a value it was never told. I6 holds **by
  construction** for everything except the default, rather than by good behaviour.
* **The half that must be admitted: a bare direct command always lands on the default attachment,
  and we cannot refuse it.** That is the boundary of layer ①'s guarantee — its scope is **commands
  issued through `vibespace-browser`**, and I6's wording has been narrowed to match. The honest
  comparison is §5.1's paragraph about the CDP URL, and it is the same reading verbatim: on a
  single-uid box this is **not** a boundary. It removes the *accident* (an agent that was never told
  the directory name cannot resolve it) and not the *capability* (the same uid can of course `ls`
  it). Enforcement is still only §6.5's proxy.

`test-browser-handles` pins both halves: with two attachments, a **direct** `agent-browser`
invocation carrying that session's own env resolves to the default profile's user-data-dir **and
resolves to no other**, while the same bare command through our CLI gets `profile_required`. The
first half is layer ①'s honest boundary and the second is its guarantee; both need an assertion, or
the boundary is only prose.

**A sub-agent's default is its own ephemeral browser, but it has to ask.** The environment cannot
reach it (previous paragraph), so "every sub-agent automatically gets a fresh browser" is a promise
we cannot keep: the `AGENT_BROWSER_SESSION` a claude sub-agent's bare command carries **is the
parent's**. The honest form is therefore a verb: `vibespace-browser new-child` mints a child handle
`bk-<parent>.<n>` and prints its own env line (the sub-agent exports it in its own tool call, or
simply passes `--profile` on every command), with the lease recorded under the parent by prefix
(§3.4) ⇒ **the parent's teardown reaps the child**. A parent may equally write one of its own
handles into the sub-agent's task description ("use `--profile work`"), in which case the child
**shares** the parent's tab and `--pin-tab`'s mutual exclusion still holds: one tab, one owner, so
two sub-agents on one handle queue rather than steal tabs from each other. Which of the two is right
is a property of the task, so both exist and **the default is the former** (D23): the commonest use
of a sub-agent is "go look this up", and putting it inside the parent's logged-in identity is the
larger grant. **So the exactly-one cell in the table above states physics rather than a blessing**:
a sub-agent that never calls `new-child` really is working inside the parent's browser, and when the
parent's default is a persistent logged-in profile that is exactly what D23 argues against relying
on.

**And "you are a sub-agent" needs a mechanism that can say it, or it is a sentence about a mechanism
that does not exist.** The previous paragraph already proves the CLI cannot: the env and the token
it receives are **byte-identical** to the parent's, so it cannot tell whose call this is — putting
that clause in the CLI's refusal text is the very class §6.6 kills ("describing window captures as
'going through the same redaction' would be a sentence about a mechanism that does not exist"). The
only thing that can tell is the SERVER: it already parses this session's stdout, and
`session._subNormalizers` is the map of "one normalizer per running sub-agent"
(`src/server/stdout/claude-stream-json.js:288` creates it, `:1065` reaps it after
`task_notification`), while a claude parent is **blocked** inside the Task tool the whole time. So
the clause is added by the ROUTE when this session has a sidechain open, and it carries its race:
reaping has a 60-second grace period, so "a sub-agent that just finished" and "the parent itself"
are indistinguishable inside that window. The clause is therefore always a **diagnostic aside** and
never the **reason** for the refusal — the reason is always `profile_required`'s handle list, which
is true for everybody. A codex sub-agent is a thread its own app-server owns and our stdout carries
no equivalent signal, so that side gets no clause at all.

**Cross-profile work is a first-class shape, and it lands on two commands.** The owner's example —
reconciling a personal and a work profile — is, in this model:

```
vibespace-browser --profile work     snapshot          # the table in the work account
vibespace-browser --profile personal snapshot          # the table in the personal account
                                                       ... the model reconciles, then
vibespace-browser --profile work     fill @e7 "…"
```

There is no "cross-profile transaction" and there should not be: two browsers are two identities,
and any API that folded them into one call would be unable to say which side failed on the first
failure. The registry records **which session touched which profile** (`leases`' `since` plus an
append-only `data/browser-audit.jsonl`: `{at, sessionId, browserKey, profileId, verb, ok}`) — this
is an audit, not telemetry: a persistent profile is a live credential, "who used it, when, to do
what" is a question the user is entitled to ask, and §6.4's retention and archive rules apply
unchanged (a `fill`'s **content** is never recorded, only the verb).

**The live view: one bound pane plus a switcher strip, not N panes.** §4.6 lets the live-view window
bind side by side with its session inside one tab group; when a session has N browsers, that **one**
window grows a switcher strip inside it (one tab per attachment, each carrying §4.6's
per-session-derived owner badge) rather than opening N panes — for the reason D19 already measured:
three panes are unusable at the width most people run, and here the third pane would halve it again.
Each tab on the strip shows its own activity indicator (which one is running a command), and the
title bar names the profile of **the pane you are looking at** (clicking it opens §3.2.5's picker).
The drawing for a profile shared by **several sessions** is unchanged: §4.6's badge becomes N dots
listed one per line in the title, sourced from `leases`. Two questions, two surfaces: the strip
answers "which browsers does my session have", the badge answers "who else does this browser belong
to".

**The resource bound bites in the plural, and it is machine-wide.** §1.2 measured 6 processes,
420–667 MB PSS and **2 inotify instances** per Chromium, while `fs.inotify.max_user_instances` on
this box is **128**; **measured read-only 2026-09-10: this uid already holds 80, leaving 48** — i.e.
room for **24 more** browsers machine-wide, and that budget is shared with every other inotify user
(our daemon, watchers, every esbuild, every test fixture). So §3.2.3's concurrency ceiling is
**per instance**, and one session's own attachment set **counts against** it: three sessions holding
three profiles each is nine browsers. The keeper's refusal at the ceiling (§3.5) must therefore name
**which session's which attachment** hit it and offer to stop that one — not merely "at the
ceiling", because in the plural model "who is holding them" has a non-trivial answer for the first
time.

### 3.8 "Which profile am I on?" — anti-default-blindness at three layers

(Owner question Q8.) The pain is concrete: an agent starts on the ephemeral default browser, the
user pins a real profile mid-task, the agent never notices and keeps working in the ephemeral one;
or two profiles are available, it silently uses the default, and only much later does anyone
discover that both needed work. What those two shapes share is **silence**: nothing today tells an
agent that its profile changed, and it has no reason to ask. Three layers, each covering a different
stretch:

| Layer | Mechanism | The shape it covers |
|---|---|---|
| ① The tool surface (reaches a RUNNING agent — for commands issued through our CLI) | Every command's **answer** carries `profile: work (pinned by user 2m ago)`; the snapshot and screenshot headers name it too; when the attachment set changes, the **next** command is refused once with a typed `profile_changed` | A running agent — an environment variable cannot reach it, but its own next call to the CLI certainly can |
| ② The model surface (once per turn, free) | `pendingNotice` (`src/session-status.js`) appends one `<system-reminder>` line to the user's **next** message: `browser profile changed: <old> → <new>`; the session-start context lists the current attachment set | A **stopped** agent, or a running one that has not called the CLI again yet |
| ③ The UI (for the user, not the model) | A status-bar Browser chip: the profile the agent **last actually used** vs the **pinned** default; amber when they differ, opening "agent is still on the ephemeral profile — remind it?" with a one-click nudge | The user — and this is the only surface that answers "I pinned it, now what?" |

**①'s mechanism is a refusal, not a notice.** That distinction is the weight of this section: a hint
stuffed into stdout only **hopes** the model reads it, whereas a `profile_changed` refusal means the
command **did not run** and the model must re-issue it with the handle spelled out. It is
**one-time**: after the refusal the new default applies and bare commands run normally again (else a
mid-session pin would double every remaining command in the session). It fires on a **change of the
attachment set's fingerprint** (the default moved, one was added, one was removed), remembered per
session as "this session has been told about this fingerprint", so it speaks exactly once per
change rather than once per command. That is also why it must be typed
(`{ok:false, code:'profile_changed', was, now, handles}`) rather than a sentence of English: §5.1
already set the same rule for `browser_paused` / `tab_gone` — **an agent must be able to read why it
was refused without guessing**.

**② spends only what is already being spent, but it is not "zero new mechanism".** A pin is a **user
action**, so the user is sitting there typing and the `<system-reminder>` rides their next message —
zero billed turns, verbatim the same rule as D16. **The money half is free; the carrier half is not**,
and the earlier wording got that wrong. Today's `pendingNotice` is a **single slot** on the
session-status record with the fixed shape `{agent, user, at}`
(`src/session-status.js:110/125/141`), `renderNotice` (`:177–188`) is hardcoded to the
status-override sentence, and the sole injection site consumes **one** and breaks:

```js
for (const k of [key, `webui:${id}`]) {                 // src/agent-routes.js:563–566
  const notice = sessionStatus.consumeNotice(k);
  if (notice) { parts.push(...); break; }
}
```

So a browser-profile notice must either invent a second shape the renderer does not have, or
**overwrite** a pending status-override notice (and be overwritten by the next `setByUser`) — a
silently dropped `<system-reminder>` in a feature whose entire purpose is that a notice is not
silently dropped. And the collision is not hypothetical: this document already asks the same slot to
carry a **third** producer (§3.2.5's path 3, `'browser-pin'`). So say what the carrier actually
needs: promote `pendingNotice` to a per-session **queue** of typed notices `{kind, …}` with
`renderNotice` dispatching on `kind` (`'status-override'` keeps today's text verbatim), and change
the injection site to **drain** rather than `break` at the first. That is a small mechanism change,
stated as a small mechanism change instead of as "zero new mechanism"; it goes on P1's content line,
and `test-profile-blindness`'s fast half pins it with a status override and a profile change both
pending and **both** reaching the next prompt, with today's single-slot behaviour as the negative
control.

Only "the session is **stopped** and the user explicitly wants it woken now" goes through §4.3.1's delivery ladder under its own declared reason
(`'browser-profile-notice'`, added to `SPEND_REASONS` in the same change as `'browser-handback'`),
behind a setting that defaults **OFF**. The "remind it" button on ③'s chip is **a per-occurrence
owner action on every click**, so it may take the ladder — but it still passes the same ceiling,
because it still opens a billed turn (D26).

**③ has to be written into `LIVE_SESSION_FACTS` or it cannot be drawn.** That table at
`src/lib/sidebar.js:73` is the **one** list of per-session live facts the `active-sessions` payload
publishes, and `_mergeAndRender()` only repaints when its **digest** changes — this repository has
paid for that six times (`worktree`, `outputStyle` and `remoteState` all died on that table). And this chip is by definition **two** facts side by side (what the agent last actually used vs
what is pinned), so the row written earlier — `browserProfile: { digest: (v) => v || '' }` — was
**wrong twice**. One scalar cannot carry two values (the pinned half lives in
`session-meta.browserProfileId`, and by this document's own argument `LIVE_SESSION_FACTS` is the
**one** list the payload publishes such facts through, so the client could not compute "should this
be amber" at all). And if the value is made the obvious object `{active, pinned}`,
`liveFactsDigestPart` (`src/lib/sidebar.js:96–103`) does `out += ':' + d(s[k])` — verified in node:
`{active:'a',pinned:'b'}` and `{active:'x',pinned:'y'}` both digest to `":[object Object]"`,
**byte-identical**, so the chip would **never repaint** on a change: the seventh instance of the
class the previous paragraph cites. So state both halves explicitly, one of two ways — two scalar
rows

```js
browserProfileActive: { digest: (v) => v || '' },   // what the agent last actually used
browserProfilePinned: { digest: (v) => v || '' },   // the pinned default
```

or one row whose digest **projects the pair to a string**
(``{ digest: (v) => v ? `${v.active}|${v.pinned}` : '' }``). From which a rule, because it outlives
this chip: **a digest over an object must PROJECT, never return the object** — every `digest: null`
row in that table is deliberately carried-only, while a digest that *returns an object* looks like
it gates and is in fact a constant. That also changes its gate: `test-profile-blindness`'s heavy half
cannot be two fresh renders ("neutral when they agree, amber when they do not" passes under this bug),
it must be a **mutation** — render, then change only `active` on the same session, and assert the
chip flips neutral→amber without a full rebuild, with `digest: (v) => v || ''` over an object as the
negative control, which must go red. Otherwise these two rows are exactly the class that table says
should **gate** the render: cheap scalars that change at most a few times per session (a pin, an
agent using a different handle), as opposed to `todo`/`auth`, which change several times per turn
and are deliberately carried-only.

**The "explicit choice" rule, and its refusal.** The owner also asked for something harder: when a
session has ≥2 attachments and the user's message **mentions** a profile alias, nothing may be
inferred — the agent must name it. Mechanically that is still ①'s one rule (≥2 ⇒ a handle is
required), so no second machine is needed; what is needed is that the **manual says so**, plus a
negative control: with only one attachment the same message produces **no** refusal (otherwise the
rule would turn the commonest shape into two commands). What is deliberately **not** built is
"guess the alias out of the user's message" — that is an implicit natural-language resolution, and
killing implicit resolution is this whole section's purpose.

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
  working and produces `'tabs'`. **(Revised 2026-09-23, docs/design-split-ux.zh.md R1–R5) no drag
  ever splits any more** — the old "drop on the left / right half of the title bar = split" covered
  80 % of a title bar with no dwell; the owner, dragging a window toward the left edge to snap it,
  landed in a split, on the side chosen by the half of the TARGET's bar (dragged left, landed
  right). It is deleted and no body zone replaces it. A window drag = move / snap / grid; **the tab
  merge (icon stack / tab bar) is the one exception to ordinary drag-and-snap**. A split is the
  EXPLICIT second step after a merge: the strip's two-column button `.tab-split-btn` (the active tab
  on the left, the most recently active other tab on the right; right after a merge the button
  pulses once and a 5 s toast "Grouped as tabs · Show side by side" does it in one click), the
  window menu (in a group of ≥ 2 tabs: "Show side by side ▸ Beside {name} (on the right)", the
  clicked window on the left and keeping the focus — every user entry keeps it on the window acted
  on (split r1); in a split: Unsplit / Swap left and right) and command mode (`Ctrl+\`
  then `v` toggles the split, `V` swaps; outside a group a toast says to group two windows first).
  The live view's "Snap beside" goes through the same undoable entry. In a split the SAME button is the badge (Unsplit / Swap
  left and right; the divider's right-click offers the same two), the strip is drawn in VISUAL order
  (the left pane's tab on the left, a bar between them, each pane tab underlined in its owner
  colour), and every user-initiated split can be undone for 5 s. The side is always named by the
  verb (the initiator on the left by default), never by a pointer position.
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

### 4.9 Local windows as computer-use targets

(Owner question Q9.) Can an agent drive **any local native window** the way it drives a browser —
handing the agent a window as an object with `snapshot` / `screenshot` / `click` / `type`? Yes, but
**how far it works varies by platform and by toolkit**, and the whole value of this section is
writing that table down honestly instead of making a promise that is true everywhere.

**The dividing line first, because it is the same one as §4.7: an agent that talks to a protocol or
a DOM always beats one that talks to pixels.** A browser is easy to drive not because it is a
browser but because it gives two things at once: a queryable **tree** whose elements have stable
references (the DOM / the accessibility tree) and a **protocol** for acting on an element (CDP). A
native window gives only pixels — **unless its toolkit exports an accessibility tree**. So this
section's answer is: **AT-SPI2 is the DOM of a native window**, and pixels are its fallback, not the
other way round.

**That is not theory; it is measured read-only on this box, 2026-09-10.** The
`toolkit-accessibility` switch is `false` and the AT-SPI registry is alive anyway
(`/usr/libexec/at-spi2-registryd` is running and `Atspi.get_desktop(0)` reports **nine
applications**: gnome-shell (clutter), mutter-x11-frames (GTK), ibus-extension-gtk3,
update-notifier, xdg-desktop-portal-gtk, gjs, snapd-desktop-integration and two more). Walking a
real application's tree yields exactly what a snapshot needs: `role` (frame / panel / label /
button), `name`, and the `Text` / `Action` / `Component` interfaces — `Component` gives geometry (so
a node maps to a click point) and `Action` gives the actions the node **declares about itself**
(literal values measured: `click`, `window.minimize`, `clipboard.copy`). It is fast enough:
`mutter-x11-frames` 24 nodes in 13 ms and a real application 61 nodes in 10 ms ⇒ **~1,800–6,100
nodes/second**. `Action.do_action` is therefore an action channel that **goes through no input
injection at all**: it acts on a node, so Wayland's "no global input injection" rule does not reach
it — the single most important conclusion here, and one that holds **per node, not per window**. The
next paragraph is that coverage.

**Coverage has to be measured beside that conclusion, or the conclusion reads as a promise that is
true everywhere (measured read-only 2026-09-10).** Walking all nine applications, capped at 400
nodes each — 503 nodes — the interface census is `Component` **494**, `Action` **66**,
`EditableText` **33**, `Text` 51. Walking breadth-first to a single flat 600-node budget instead
(same box, same moment) gives `Component` 599, `Action` **52**, `EditableText` 52, `Text` 52 — both
samples are real, and the per-app one is the better of the two, because a flat budget is eaten by one
application's panel subtree. Those three numbers decide three different verbs:

* **`click @ref` works only on nodes that declare an action.** 66/503 (52/600 under the flat
  budget). More to the point, split by role: of **43 `button` nodes measured, only 6** expose
  `Action` — and `button` is precisely the role an agent most wants to click. For the rest the only
  road is that node's `Component` geometry, i.e. a coordinate click, i.e. injection, i.e. the thing
  this matrix's action row says Wayland's rule "does not reach". Incidentally, **32 of the 66
  actions have the empty string as their name**, so "pick the action by name" is not universally
  available either.
* **`type` needs `EditableText`.** 33/503 (52/600 under the flat budget) — and on this one the
  source cited in this very section records "GTK3/GTK4/Qt5/Tk each needing their own text-input
  path", so it is **per toolkit** as well.
* **`key` (a chord) has no tree road at all.** The measured action names are `click`, `activate`,
  `edit`, `expand or contract`, `menu`, `clipboard.*`, `window.*`, `link.*`, `selection.*` — all
  application-declared semantic actions, with no concept of a chord among them. AT-SPI's only
  keyboard primitive is the **registry-level** `Atspi.generate_keyboard_event` (measured present,
  beside `generate_mouse_event`), and that is XTEST, i.e. injection, so it inherits every limit of
  the injection row. (`Action.get_key_binding` is a **read**: it tells you what key a node says it is
  bound to; it does not press it.)

The conclusion survives but narrows: the accessibility tree is the primary channel for
**observation** and the preferred channel for **action** — and "preferred" has four different
answers for four verbs, which is why the matrix below splits the action row into four and why
§5.1.1's capability law is enforced per verb.

**What everyone else does (the comparison the owner asked for).** Three sources, all pointing the
same way. **Anthropic's computer use is pixel-only** — the current toolset
`computer_toolset_20260801` has 17 member tools (`screenshot`, `zoom`, the click family, `type`,
`key`, `scroll`, `wait`, …), coordinates are **screenshot pixels** (a caller that scales must map
them back), and the documentation names no accessibility-tree channel; **the same vendor's browser
use reads the accessibility tree**. **OpenAI's ChatGPT desktop "Work with Apps" reads app content
through the macOS Accessibility API** (with a VS Code extension for VS Code), macOS-only — i.e.
both vendors' **local-application** integrations are accessibility-tree READS rather than pixel
bots, and Codex desktop's browser panel (§4.1) is the DOM road by construction. Third-party
implementations agree: cua's Linux driver uses "AT-SPI 2 over D-Bus for the accessibility tree" with
input over XTEST, while **native Wayland is still preview** (its own
`CUA_DRIVER_RS_ENABLE_WAYLAND=1` flag, explicitly lacking screen capture and AT-SPI parity); and the
MIT `agent-sh/computer-use-linux` makes window enumeration a descending ladder (GNOME Shell
extension → GNOME Introspect → COSMIC → KWin scripting → hyprctl → i3 IPC → generic X11/EWMH) with
Wayland input preferring the RemoteDesktop portal and falling back to uinput.

**The capability matrix (this box's measurements and documentation, each labelled).**

| What you want to do | X11 / Xwayland (this box today) | Wayland via portal | Wayland via uinput | A nested X we start ourselves (Xvfb+Xpra, §4.7) | A paired Mac (§7.3) |
|---|---|---|---|---|---|
| Enumerate windows | **Yes, but it sees only X11 clients** (measured: `xwininfo -root -children` lists 19 Xwayland toplevels — mutter-x11-frames, ibus, one X11 dialog; native Wayland windows are structurally invisible) | GNOME's `org.gnome.Shell.Introspect.GetWindows` **measured AccessDenied here** (the Shell allows only a D-Bus sender allowlist = the XDG portals, or unsafe mode); other compositors each have their own IPC | None (uinput is input only) | **Yes, completely**: our X server holds only the applications we started | CGWindowList / ScreenCaptureKit can enumerate |
| Capture **one** window's pixels | Yes (XComposite / `ffmpeg -f x11grab`; `xwd` and `import` are both absent here, `ffmpeg` is present) | ScreenCast portal (PipeWire, one interactive grant) | None | Yes, and **per window** is Xpra's whole job | ScreenCaptureKit's `SCContentFilter` can name a single window (`CGWindowListCreateImage` deprecated since macOS 15) |
| Inject pointer + keyboard | Yes (XTEST; `xdotool` / `wmctrl` present here) — **but only into X11 clients** | RemoteDesktop portal: `NotifyPointerMotion*` / `NotifyKeyboardKeycode`, or `ConnectToEIS` handing off to libei (the interface is present here; `libei.so.1` / `libeis.so.1` 1.3.901 installed) | ydotool + `/dev/uinput` (**unusable here**: measured `crw------- root root`, and the uinput module is not loaded) | Yes (our own X, full XTEST authority) | Requires Accessibility permission (non-sandboxed + signed) |
| Read the accessibility tree (= this window's DOM) | **Yes, and independent of the display protocol** (AT-SPI is D-Bus; measured here: 9 applications, ~1,800–6,100 nodes/s) | Same (AT-SPI does not go through the compositor) | Same | Same | AXUIElement (same permission) |
| **Act**: `click @ref` (a node that declares an action) | `Atspi.Action.do_action` — **but only where the node exposes `Action`**: measured across all nine apps, **66 of 503 nodes**, and **6 of 43 `button` nodes** | Same — **Wayland's "no global injection" does not reach this** | Same | Same | AXUIElement's `AXPress` and friends |
| **Act**: `type` into a field | `Atspi.EditableText.insert_text` / `set_text_contents`, only where the node exposes `EditableText` (measured 33/503); and per the source cited above, text input is **per toolkit** besides | Same | Same | Same | Set `AXValue` |
| **Act**: `key` / a chord (`ctrl+s`) | **No tree road at all** — AT-SPI's action vocabulary has no concept of a chord (measured action names above); the only keyboard primitive is the registry-level `Atspi.generate_keyboard_event`, i.e. **XTEST = injection** | Injection only ⇒ the portal (D29, unproven) | Injection only ⇒ uinput (unusable here) | Yes (our own X, full XTEST authority) | Post a `CGEvent` (Accessibility permission) |
| **Act**: `click --at <x>,<y>` (coordinates) | Injection only (XTEST), and only into X11 clients | Injection only ⇒ the portal (D29, unproven) | Injection only ⇒ uinput (unusable here) | Yes | Post a `CGEvent` (Accessibility permission) |

**Four conclusions fall straight out of that table:**

1. **The accessibility tree is the only channel that holds in every column**, so it is the
   **primary** implementation of `snapshot` and the preferred implementation of `click`, with pixels
   filling in where it has no answer (an image, a canvas, a custom-drawn control). That is the same
   shape as the browser half: `agent-browser snapshot` also returns an accessibility tree with
   references like `@e3`. **But "every column" is not "every node"**: the 66/503 measured above
   (6/43 for buttons) is that conclusion's honest bound, and the verb `key` has no cell on the tree
   at all — in a column with no injection backend a chord is simply **not possible**, which is why
   §5.1.1 makes it refuse with its probe result exactly like `click --at`.
2. **Input injection is a three-road ladder that degrades per platform, and each road's
   availability must be probed at runtime rather than inferred from the platform's name** — this box
   is the counter-example: a Wayland desktop where X11 injection works for Xwayland clients, the
   portal interface is present, and uinput is unusable.
3. **Enumerating windows is the most fragile link**, and it happens to be the first step of "hand
   the agent a window as an object": both roads have a named failure here (X11 cannot see Wayland
   clients; GNOME's Introspect refuses us). So the first version of window targets **lists only the
   windows we started ourselves** (D27) — the cell that is complete and needs nobody's permission.
4. **The "nested X we start ourselves" column is green throughout**, and it is exactly the stack
   §4.7 already designed for native chat clients (Xvfb + Xpra seamless). So window targets are
   **not a new layer**: they are §4.7's transport plus a new observation/action surface.

**How it plugs into the live view.** Entirely by reuse: `GET /api/xpra/stream?window=<id>` is the
same server-side bridge (§4.7), and a window target merely gives that pane a `window-live` form and
a title naming which window it is. §4.6's binding, §4.3's three modes (Watch / Take over / Hand
back) and §4.3.1's spend gate apply verbatim — taking over and handing back a window target is the
same act as for a tab, because they share one `lease.input`.

**The background-service question must be measured before it is designed around.** The VibeSpace
server runs under `systemd --user`, and the portal's session is interactively granted (`Start`
"typically result[s] in the portal presenting a dialog letting the user select what to share"),
while public reports record **portal/D-Bus paths being denied in background/systemd contexts**. So
"the server holds a RemoteDesktop portal session itself" is the **first thing P9 measures**, not an
assumption the architecture may rest on; if it does not hold, the Wayland column reduces to
`persist_mode=2` + `restore_token` (documented: permissions "persist until explicitly revoked", the
token invalidated after a single use) with one human click, or to column 4 alone.

**This walk runs in a bounded child/worker, never on the server's or the daemon's event loop.** §0
cites the "never block the event loop" law and §4.2 applies it (the CDP `Page.startScreencast` idea
is rejected for putting a per-frame consumer "inside the server's event loop") — and §4.9's own
figures put the same law in front of us: a snapshot is one D-Bus round trip **per node**, so 600
nodes at the measured ~1,800–6,100 nodes/s is 0.1–0.33 s of round trips, and an application that
**stops answering its own a11y bus** blocks each call until the D-Bus timeout (libdbus's default is
25 s) — exactly the shape of the outages this law was written from (the FUSE threadpool, the
`execFileSync` sweep freeze). And `src/window-targets.js` is **SHARED** in §3.6, i.e. the daemon
bundles it, so the block would land in the daemon too. So: the walk follows the precedent
`transcript-worker.js` / SafeFs already set — a bounded child or worker, with **a per-call timeout
and a whole-walk node budget**, and a node that does not answer inside the budget is reported as an
**unreadable subtree** rather than stalling the walk.

**One more decision that has to be named: which binding the node side uses.** Every AT-SPI number in
this round was taken through `python3` + GObject introspection (Appendix A's own evidence line says
so), and that road goes through `libatspi`, which carries AT-SPI's **caching** ([the Linux Foundation's
AT-SPI D-Bus page](https://wiki.linuxfoundation.org/accessibility/d-bus) records "data accessed most
often is transferred with accessible objects and cached by the AT-SPI bindings, with synchronous
method calls replaced by asynchronous D-Bus signals wherever possible" as a design point of the
protocol). P9 therefore has two roads, and **the speed figures above do not transfer to the second**:
either speak AT-SPI's D-Bus interfaces from node directly (a generic D-Bus client such as
[`dbus-next`](https://github.com/dbusjs/node-dbus-next) — no maintained node-specific AT-SPI binding
was found this round, but "not found" is not "does not exist", so P9 looks first), in which case
there is **no libatspi cache** and the per-node cost must be re-measured; or spawn a GI helper, in
which case the fork tax §1.6 already measures applies. That is an input to P9, not an implementation
detail that can be left blank, so it goes into §12.

**Honest boundary (nothing in this section is a number about speed).** `xpra` is not installed here
(§4.7 already records this), so the end-to-end latency of a window target is entirely unmeasured;
AT-SPI's speed measures **traversal**, not "one `do_action` to a visible change"; and all nine
applications were GTK/clutter — **Qt and Electron coverage is measured at zero on this box**
(Electron typically exports a tree only when it detects an AT client). All of this goes into §12.

## 5. The agent-facing surface

### 5.1 `vibespace-browser` (STATIC tracked, in `AGENT_TOOLS`)

Modelled on `data/bin/vibespace-page`: `VIBESPACE_API` + `VIBESPACE_SESSION_TOKEN` (or
`VIBESPACE_JOB_TOKEN`), no VibeSpace internals, full manual behind `vibespace-docs browser`.

```
vibespace-browser profiles                       # what exists, who owns it, who is attached
vibespace-browser attachments                    # MY set: every handle, which one is the default (§3.7)
vibespace-browser use <label|id> [--alias <a>]   # attach THIS session to a profile (adds to the set);
                                                 #   prints the env to export, or execs a subshell
vibespace-browser new <label> [--provider …] [--proxy …] [--fingerprint …]
vibespace-browser new-child                      # mint a CHILD handle bk-<parent>.<n> for a sub-agent
vibespace-browser detach [--profile <handle>]    # drop that lease, close my tab
vibespace-browser watch                          # print the live-view path for the user
vibespace-browser status                         # my tab, my lease, who holds input,
                                                 #   my profile AND ITS ORIGIN (§3.2.5)
vibespace-browser pin <label|id> | --none        # pin THIS session (or unpin); a mid-session pin
                                                 #   applies from the next browser launch (§3.2.5)
vibespace-browser backend [<name>]               # which backend, what else exists, propose a switch (§7.4)
vibespace-browser blocked --url <u> [--why <c>]  # I was blocked here — a CLAIM, never a detection (§7.4)
vibespace-browser -- <agent-browser args…>       # run agent-browser with this session's flags

  --profile <id|alias>                           # WHICH browser this command acts on (§3.7);
                                                 #   REQUIRED once this session has >1 attachment,
                                                 #   never a filesystem path — that is a named refusal
  env VIBESPACE_BROWSER=<alias>                  # the same choice, pinned for one shell
```

**Every answer names the profile it acted on (§3.8's layer ①).** That is not decoration: a
snapshot's header, a screenshot's metadata and every verb's closing line carry
`profile: work (bp-3f9a1c02) · pinned by user 2m ago · 2 attachments on this session`. When the
attachment set's fingerprint changes, the next command gets a typed refusal
`{ok:false, code:'profile_changed', was, now, handles}` — once, after which the new default applies.
The reason is in §3.8: a hint stuffed into stdout only hopes the model reads it, while a refusal
means the command **did not run**.

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
policy decision (`close`, `close --all`, `connect`, `get cdp-url`) and for the lease check. **Which
means `snapshot`/`fill`/`click` are expected to run as plain `agent-browser`, and that is where
§3.7's residual comes from**: the wrapper is a SUBSET, so layer ①'s guarantee covers exactly that
subset. The half that can be closed structurally is closed there — a non-default attachment's
user-data-dir is minted by the server, handed only to the child process we exec, and never printed,
the same rule as this section's "`use` does not print a CDP URL" and with the same honesty: it
removes the accident, it does not create a boundary.

#### 5.1.1 `vibespace-window` — the window target beside the browser target (§4.9)

Same family, same auth, same lease; the only difference is that the thing addressed is a window
rather than a tab:

```
vibespace-window list                            # window targets I may address (§4.9's column 4 first)
vibespace-window open <app> [--title <t>]        # start an app under OUR Xvfb+Xpra and return a handle
vibespace-window attach <handle>                 # take the lease on it (the same lease object as a tab)
vibespace-window snapshot <handle>               # THE a11y tree: role/name/text/actions/bounds + @refs
vibespace-window screenshot <handle> [--out p]   # pixels — the FALLBACK, never the primary read
vibespace-window click <handle> @e7              # act on a NODE (AT-SPI do_action), not on coordinates
vibespace-window click <handle> --at <x>,<y>     # act on a POINT — refused when no injection backend
vibespace-window type <handle> "…"               # text into the focused node
vibespace-window key  <handle> ctrl+s            # a chord
vibespace-window watch <handle>                  # print the live-view path (the 'window-live' pane)
vibespace-window detach <handle>                 # drop the lease; the app keeps running
```

Three rules, each a direct translation of §4.9's matrix: **(i) `@ref` beats coordinates** (the
references `snapshot` mints come from the accessibility tree, the same habit as `agent-browser
snapshot`'s `@e3`, so an agent that already knows the browser half learns nothing new); **(ii) a
verb that cannot work is disabled with its reason rather than failing at use time** (§7.1's
capability law) — and that law is enforced **per verb, not only for `click --at`**, because §4.9's
matrix gives four different answers for the four action verbs:

| Verb | What the tree road requires | In a column with no injection backend (Wayland, D29 unproven) |
|---|---|---|
| `click <h> @e7` | that node exposes `Action` (measured 66/503; 6/43 for buttons) | node has `Action` ⇒ works; node does **not** ⇒ **refuses with the probe result**, never a silent degrade to a coordinate click |
| `type <h> "…"` | that node exposes `EditableText` (measured 33/503, and per toolkit) | has it ⇒ works; does not ⇒ refuses as above |
| `key <h> ctrl+s` | **no road exists** (AT-SPI's action vocabulary has no chord) | **always refuses**, with the probe result as the reason — this verb is not possible in that column |
| `click <h> --at <x>,<y>` | **no road exists** (it is coordinates by definition) | **always refuses**, with the probe result as the reason |

The load-bearing line there is **"never silently degrade to a coordinate click when the node has no
`Action`"**: that degrade would let an explicitly-refused channel (injection) back in through the
side door, and at the moment the agent believes it is using the tree. **(iii) `list` shows only the
windows we started ourselves** by default, the user's own desktop windows require D27 to be opened
deliberately, and while it is open every such row is marked as "your desktop".

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
* The chat status bar's **Browser chip** (§3.8's layer ③): the profile the agent **last actually
  used**, beside the **pinned** default; amber when they differ, opening "agent is still on <old> —
  remind it?" with a one-click nudge (D26). It needs **two** scalars in `LIVE_SESSION_FACTS`
  (`browserProfileActive` and `browserProfilePinned`), or one row whose digest **projects** the pair
  to a string — one scalar cannot carry the two values it compares, and a digest that returns the
  object is a constant, so the chip never repaints (§3.8).
* When a session has several attachments, the live-view window carries a **profile switcher strip**
  inside it (one tab per attachment plus the owner badge) rather than N side-by-side panes (§3.7;
  the reason is the width D19 already measured).
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

### 6.6 A window target is the user's desktop (§4.9's security model)

Every rule from the browser half holds verbatim (the same `lease.input`, the same §4.3 three modes,
the same server-side bridge, the same "the stream port never reaches a browser"). What follows is
what is **only** true of window targets:

* **Two classes of window, two roads, and the UI must keep them apart.** Windows **we started**
  (`vibespace-window open`, running under our own Xvfb+Xpra) are the default class: their existence,
  lifetime and pixels are ours, and an agent acting inside one is no more dangerous than an agent
  acting inside a browser tab. Windows **on the user's own desktop** are the other class, and by
  default they are **not listed and not addressable** (D27) — because a click there is a click in
  the user's real session, including the window they are typing in right now. Opening that class is
  an explicit owner decision, every such row is then marked "this is your desktop", and the live
  view's title says so too.
* **Input is injected only while the lease holder is the agent and the user has not taken over.**
  That is §4.3 verbatim, but it has a second enforcement point here: **the user can touch that
  window directly with their own keyboard and mouse at any time**, and that does not pass through
  us. So a window target's "take over" additionally **stops injecting** and says on the pane that
  you are driving it directly; resuming injection is an explicit act. The cooperative boundary is
  exactly as honest as §6.5's: what we can guarantee is that **we** do not inject, not that nobody
  else can.
* **Both the pixels and the tree are secrets.** A window's accessibility tree contains **body text**
  (the `Text` interface exists to read text), so a `snapshot` can leak more than a screenshot rather
  than less. §6.4 applies verbatim: screenshots and recordings default off, have a retention period,
  and are archived rather than destroyed. **There is no "redaction hook" here, and that has to be
  written down rather than borrowed**: nothing in this design redacts content anywhere today, so
  describing window captures as "going through the same redaction" would be a sentence about a
  mechanism that does not exist. The primitives that do exist are three — recording off by default
  (D7), "secrets stay out of the model" (§1.5, inherited from upstream), and the per-action
  transcript thumbnail; real redaction is a separate feature that owes its own evidence.
* **The portal's consent is the user's, not ours.** If the Wayland road ends up using the
  RemoteDesktop portal, that grant dialog is clicked by the **user**, and `persist_mode=2` +
  `restore_token` is what keeps it from being clicked every time (documented: permissions "persist
  until explicitly revoked", the token invalidated after a single use). That token is a standing
  grant, so it lives server-side under §6.4's rules — never in `agentEnv`, never in CLI output — and
  "which session used it, when, to do what" goes into §3.7's audit stream.
* **`--at <x>,<y>` is the one that needs a reason.** Acting on a node (`@ref`) is auditable: the
  audit line can record "clicked the button named Minimize". Acting on a coordinate records nothing
  meaningful, and it is the only path that can touch something we are **not looking at**. So it is
  refused when no injection backend exists (§5.1.1), it still requires the lease and still requires
  the target to be in the "we started it" class when it does exist, and the audit line marks it
  explicitly as `by:'point'`.

## 7. Providers

### 7.1 The abstraction

A provider answers **six** questions: **how do I start a browser for this profile**, **what CDP URL
do I hand out**, **what does it cost**, **what can it not do**, **where does its key come from**
(§7.5), and **which tier of the access ladder is it** (§7.6). Upstream's `-p <provider>` and its
provider plugins are the template; our registry adds the profile identity.

| Provider | Tier (§7.6) | Start | CDP | Fingerprint | Cost and key (§7.5) | Notes |
|---|---|---|---|---|---|---|
| `chromium` (default) | 1 | local `agent-browser` with `--profile <dir>` | keeper reads `get cdp-url` | none beyond `--disable-blink-features=AutomationControlled` | free; needs no key | today's behaviour, now owned |
| `cloak` | 2 | CloakBrowser binary as `--executable-path`, or its `cloakserve` CDP endpoint | `ws://127.0.0.1:9222` (loopback, §6.1) | 73 claimed source-level C++ patches, per-connection seed | free tier 1 session / $19 5 / $49 20 / $199 200 / $499 2000 (list prices observed 2026-09); key = registry row `cloak` | §7.2 |
| `cdp` (remote) | 1 | nothing — the browser is somebody else's | a `hostId` + a remote loopback port, tunnelled | whatever that browser is | free; needs no key | §7.3 |
| `cloud:<name>` | 2 | upstream's browserbase / browserless / kernel / browseruse / agentcore | the provider's | the provider's | per vendor; key = registry row `cloud:<name>`, **a server-side secret, never in `agentEnv`** | §7.5 names every row's fields |
| `local-window` (new, §7.6) | **3** | starts nothing — it is a real browser window already open on the user's **own** desktop | **none** — observation through the AT-SPI accessibility tree + pixels (§4.9), action through §4.9's injection ladder | whatever the user's machine is | free; needs no key, but needs a live desktop session | §7.6, D31; requires D27's option (b) and §10's P10 |

A provider is a **row, not an `if` chain** — the backend-caps discipline. A capability a provider
lacks ("cannot be headed", "cannot take `--allowed-domains`", "has no CDP", "has no key") is a
field the UI reads, so a control that cannot work is disabled with a reason rather than failing at
use time — and the `local-window` row turns "has no CDP" from an awkwardness into a **value** in
this table, which is exactly why it is a row and not a special case.

**The capability cells those mechanisms actually read.** The table above answers "what is it"; the
one below answers "what does each mechanism in the registry do with it". They are two tables
because they are read at different moments: the first is for a human, the second is what §7.4's
switch, §3.3's directory ownership, P5's sweep, §7.5's key and §3.4's lease have to ask **before**
they act — and the backend-caps discipline is a row, not an `if` chain.

| Provider | `keyScope` | `canSwitchTo` (§7.4) | `ownsDir` | `leaseKind` (§3.4) |
|---|---|---|---|---|
| `chromium` | `none` | `in-place` | yes | `tab` |
| `cloak` | `local-only` | `in-place` | yes | `tab` |
| `cdp` (remote) | `none` | `no` — it is somebody else's browser, so "switch to cdp" is really a second profile | no | `tab` |
| `cloud:<name>` | `local-only` | `export-only` — a vendor's directory is not ours to open (§7.4's export/import paragraph, which already states what it drops) | no | `tab` |
| `local-window` | `none` | **`no`** | **no** — its state is the user's own Chrome/Firefox profile, not the record's `dir` | **`window-target`** |

Three readings, each of which closes a place that would otherwise fail silently:

* **`keyScope: 'local-only'` is a refusal, not a label.** A provider that needs a key is **refused**
  on a profile whose `host != null`, and the switcher's row is disabled with its reason
  (`provider_needs_local_key`). The reasoning, together with D34, is in §7.5: that plaintext key has
  **no** channel to another machine today, while §6.4 says verbatim that it "lives in the registry
  server-side".
* **There is deliberately no `swept` cell.** P5's retention sweep acts on `dir`, so "is it swept"
  **is** `ownsDir`, and a second field would be exactly the twin §3.3's third rule forbids. P5
  sweeps precisely the rows with `ownsDir: true` — a sentence that is an assertion in
  `test-browser-housekeeping`, not a comment.
* **The three "no"s on the `local-window` row together are §7.6's rule 3**: escalating to tier 3
  does **not** re-point an existing profile. It has no `dir`, no `fingerprintSeed`, is never a
  target of §7.4's version ladder, and is never touched by P5's sweep — because every one of those
  mechanisms acts on **a directory we own**, and this tier has no such directory at all.

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
* **Every row in the switcher carries a SOURCE chip (§7.5).** A backend that needs a key is labelled
  `cluster default` / `your own key` / `not configured`, taken from `publicView(id)` (the **masked**
  view — the switcher never reads plaintext). The `not configured` row is **disabled with its reason
  written on it** — §7.1's capability-row discipline — and its action is
  `app.openIntegration('cloak')`: one click that lands on that card in ⚙ → Integrations, focused. So
  "no key" is already said **before** the user clicks, which is what makes D33's named refusal the
  last net rather than the first.
* **A one-click "Open with CloakBrowser" on the blocked-page state.** Where that state comes from is
  the agent paragraph below — the point is that this button appears **only when somebody claims to
  be blocked**, and it says **who** claimed it.
* **A per-profile default backend** (a registry field), so "this profile is for that kind of work"
  is said once.
* **Per-site memory**: "this site needs cloak". Keyed by **exact host**, not by registrable domain —
  a registrable domain needs a public-suffix list, which is a second source of truth that expires,
  and the cost of exact hosts is only that two subdomains of one site are recorded twice. This
  memory stores a **claim**, so it stores **who claimed it, when, and why**
  (`{host, tier, backend, by: 'agent'|'user', at, why}` — `tier` is the cell §7.6 adds, and
  `backend` stays because "which provider within tier 2" is a different question), and each row can
  be deleted from the profiles panel. **Never auto-escalate**: a failure produces only a suggestion
  (§7.6's rule 2).

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
So the switch dialog must show **seats**: used / total / after this switch. That count is the
keeper's job (it is the first thing in this design that can count) and it is **per provider**, not
global. The free tier's single concurrent session means a second cloak profile must either wait or
be paid for — hide that, and the user spends an afternoon debugging a browser that appears to fail
at random.

**Those two numbers come from two different places, and the total has three states rather than
two.** The *used* count is **the keeper's own**, because I found no vendor interface that answers
"how many seats is this key holding right now" (§12.35). The *total* (the tier) does **not** come
from Test: §7.5 gives `cloak`'s row `test.kind: 'shape-only'` (zero network, it validates the
`cb_…` shape), and the reason is written there — a real probe needs the 200 MB binary **and**
§7.2.1's recorded egress proof first, and neither of those should be triggered by opening a card to
paste a key into. The tier therefore comes from **the first real launch**: when the keeper starts
`cloakserve` it reports its plan, and that is read back and recorded as `{tier, at}` — a by-product
of a launch **the user already asked for**, not a poll (§ban-safety is about quota polling, and
there is not even a timer here). So the total has three states, and the third one is the **normal**
state under a cluster default:

| Total | When | What the dialog shows | At the ceiling |
|---|---|---|---|
| known and fresh | this key launched successfully at least once within `SEAT_TIER_STALE_MS` (7 days) | `N used / M total`, **with the age of that reading** ("tier read from a launch 3 h ago") | refuse, worded as below |
| known but stale | the last successful launch is older than 7 days | degrades to "unknown", while saying what the **last** tier was and when — an expired verdict may be a hint, never a constraint | **does not refuse** |
| **unknown** | **this key has never launched successfully.** Under a cluster default this is the normal state: D32's recommendation is that the cluster injects the default key, and such a user never opens that card at all | "seat limit unknown — it becomes known the first time this key actually launches a browser", and **never a fabricated number** | **does not refuse** |

**An unknown total can never satisfy the ceiling test.** That is an invariant rather than a wording
choice: `unknown` is neither `0` nor `∞` and does not take part in the comparison; a ceiling refusal
is possible **only while the total is known and fresh**. The 7 days is not arbitrary — it is the
shape this repository already runs (`OVERAGE_STALE_MS = 7 * 24 * 3600 * 1000`,
`src/spend-authorizer.js:259`: a claim that **refuses** something must carry a date), and it is the
same shape the shared layer writes for itself ("a `testedAt` does not stay green for ever; a verdict
never outlives the reading it describes"). It also bites almost never here: the reading is refreshed
by the very act it constrains (a launch), so only a key that has not launched in a long time can go
stale — and such a key's *used* count on this instance is 0 anyway.

**Three failure modes, three named refusals.** **(1) The binary is not installed**:
`backend_unavailable` (carrying the provider name and what is missing). **(2) The key is not
configured**: `backend_no_key` (carrying the provider name, the registry row id, and the
**actionable** way out — open that card in Integrations, D33). **(3) The seat is held by somebody
else**: `backend_seat_taken`. None is a timeout and none is a silent fallback; the reasoning is in
D33. As everywhere else: a **named** refusal, a row in the profiles panel and the switch dialog that
is **disabled with its reason written on it**, and an install action in Manage Agents
(`cloakbrowser` is an npm package, installing it is a user act, and it goes through §7.2.1's egress
precondition — **measure first, then install**, not the other way round). **Never** download the
200 MB binary without the user having asked for it.

**The third one is not a completion — it is the DEFAULT failure mode under a cluster default, and
neither of the other two covers it.** The reason is structural: D32 recommends the cluster injects
the **free tier** (one concurrent session), while *used* is the keeper's count and **it can only
count this instance**. So when another pod holds that single seat, this instance reads "0 used /
1 total" (more often "0 used / unknown total"), the ceiling test **never fires at all**, the spawn
goes out, and what the user sees is whatever `cloakserve` prints — precisely the afternoon the
paragraph above exists to prevent. The keeper therefore classifies a `cloakserve` launch that fails
**license/concurrency validation** as `backend_seat_taken`, and that refusal must say three things:
**which provider**, **that this key is the cluster default so its seats are shared fleet-wide** (so
"stop one of yours" is the wrong advice — this instance may be holding none), and the one-click way
out `app.openIntegration('cloak')` → "use my own key".

**The wording at the ceiling forks on where the key came from, because the two cases can state
different facts.** The key is **the user's own** ⇒ every seat is on this instance ⇒ the shape of
§3.5's browser ceiling: **refuse loudly, name the profiles currently holding seats, and offer to
stop one**. The key is the **cluster default** ⇒ this instance cannot list those profiles (they are
in other people's pods) ⇒ the refusal **may not pretend** it can: it says "cluster default (seats
shared with other users; N used on this instance)" plus the one-click way out, never a fraction
pretending to be global. **A refusal may only state what its own reason knows** — the same law this
repository's 2.369.x auto-resume batch wrote down, and here it is what rescues D32's own sentence
("at the ceiling the advice is: switch to your own key") from pointing at a ceiling that is
structurally unreachable in the configuration D32 recommends.

**That refusal's wording depends on a fact I have not measured**, and it is written down as §12.40:
what `cloakserve` actually returns when a free-tier key's one seat is held **on another machine**.
The public material says only that "concurrent local free sessions are serialized" (§12.35) — a
statement about **one machine**. So P4's first actions gain one more: take a free-tier key, start it
on two machines at once, and record the answer verbatim — the classifier keys on that answer, not on
my guess; until it is measured, `backend_seat_taken`'s criterion can only be "the launch failed and
the error names licensing/concurrency", and that sentence goes into the code comment waiting to be
narrowed.

### 7.5 Where a provider's key comes from

(Owner directive, 2026-09-11, verbatim: "对于指纹浏览器和 communication panel 这种可能需要配置
自己的 key 的情况，要考虑怎么提供配置界面，让我们集群里的用户可以自行配置（当然 lark 这种集群里
能提供默认 oauth client 的就提供默认）" — *for integrations like the fingerprint browser and the
communication panel that may need the user's own key, work out how to provide a configuration
surface so users across our fleet can configure it themselves; where the cluster can supply a
default OAuth client, as with Lark, supply one.*)

Several rows of §7.1's table need **a key the user owns**: `cloak`'s CloakBrowser license key, and
every `cloud:<name>`'s vendor API key. This section says where those keys live, how the cluster
supplies a default, how a user overrides it, and why the key never comes one step closer to an
agent.

**This is not a mechanism this design owns — this section is a CONSUMER of it.** The shared
**Integrations & keys** layer is defined in **the integration-keys section of
`docs/design-communication-panel.zh.md`** (this section is aligned against the round-8 canonical
copy, commit `d02afcbb` on branch `design-communication-panel-r2`, where the shared layer is now
`## 14. 集成密钥与配置界面` and `## 13. 密钥、过期、失败` is left to an adapter's own
tokens). **The authoritative anchor across the two documents is the
module names, not the section number** (§12.34) — this section uses those names verbatim:

| Name | What it is | How this track uses it |
|---|---|---|
| `src/integration-registry.js` | The **PURE** table, importing nothing: one ROW per integration, `{id, label, fields:[{key,label,secret,required,placeholder,help,validate}], clusterEnv, setup:{callbackUrl,callbackNote,prerequisites} (optional), test:{kind,describe,caveat}, consumers:[…], docs}` | This track contributes the six rows below; `test.kind` comes from the shared layer's **closed set**, and `consumers` holds **module paths** (that census requires each name to be a file that exists AND to really call `resolveIntegration('<id>')`). **None of this track's six rows declares a `setup`**, and that is said rather than assumed: `setup` holds "what the user must finish in the vendor's console before the consent page can succeed" (the callback URL, the scopes, a published version), while CloakBrowser and the five `cloud:*` rows are **pure keys** — no consent page, and not one value to copy into a vendor console. So the shared layer's rule that **a row declaring `setup.prerequisites` must declare `test.caveat`** does **not bind** this track's six rows (it binds an OAuth row like Lark); the card's "never render a bare tick" discipline still applies |
| `src/server/integration-store.js` | **ORCH**: `data/integrations.json` written with `writeJsonAtomic`, secret fields encrypted through secret-box. **A record holds exactly two things**: `values` (what the user typed) and `clusterKey` (the cluster preset the user picked) — **`source` is DERIVED at read time and never stored** (a stored `source` fights the "a vanished cluster default answers `none`" rule, and a record holding only a selector is **not** "the user's own credentials"). `resolveIntegration(id)` → `{source:'user'\|'cluster'\|'none', clusterKey, values, label, fromEnv, testedAt, lastOk, lastError, missing:[]}`; `publicView(id)` masks every secret field to `••••` + last 4; `setIntegration(id, patch)` (a field omitted = unchanged, `''` = cleared), `clearUserValues(id)`, `useClusterDefault(id)`, `test(id)`; every write broadcasts `integrations-updated` carrying the **masked** view | the keeper asks `resolveIntegration` **before** it spawns a provider, and never reads env itself |
| Routes | `GET /api/integrations` (the masked list; every row also carries `setup`, `clusterKey`, `clusterOptions` and `testCaveat`) · `PUT /api/integrations/:id` = `setIntegration` (a field omitted = unchanged, `''` = cleared); a payload carrying `{use:'cluster'}` runs `useClusterDefault(id)` and **refuses by name** when there is no cluster default; a payload carrying `{clusterKey:'<key>'}` stores the **selector** and no value at all · `POST /api/integrations/:id/test` · `DELETE /api/integrations/:id` = `clearUserValues(id)`, i.e. **"clear my key": always allowed**, dropping the user override and then **landing wherever precedence lands** (`'cluster'` when there is a cluster default, `'none'` when there is not) — it is **not** `useClusterDefault`, which is the radio and refuses when there is none | §7.4's switcher reads the masked list for the source and the Test verdict; **never the plaintext** |
| ⚙ → **Integrations** (集成与密钥) | Window type `integrations` (`registerWindowType`, openSpec `{openIntegrations, focus:<id>}`), rendered like the Plugins cards — one card per registry row with a **SOURCE chip** (cluster default / your own / not configured), a "Use cluster default" (through `PUT {use:'cluster'}` → `useClusterDefault(id)`, disabled **and saying why** when there is no cluster default) vs "Use my own key" choice, the declared fields (secrets get **Replace**, never Reveal), a Test button with its last verdict (vendor error text escaped), and a "Where is this used" line; **≤768px renders the same cards single-column** | every consumer deep-links to its own card: `app.openIntegration(id)` |
| Precedence | **the user's own > the cluster default > none**, no exceptions | §7.4's switcher, the keeper, and any future provider row all ask the same answer |

This shape already runs twice in this repo; this section did not invent it.
`MountManager.drivePresets()` / `_driveClient()` (`src/mounts.js:2189` / `:2211`) read cluster
presets from `VIBESPACE_GDRIVE_CLIENTS`, **a record stores only the preset KEY** so rotating the env
rotates every consumer, and the precedence is verbatim "explicit custom client wins; else its chosen
preset; else the single/first preset; else the tool's built-in", with the UI offering "Custom (own
client id/secret)" and a `type:'password'` secret field (`src/lib/sidebar-mounts.js:1750-1771`).
`PluginManager._frpCfg()` (`src/plugins.js:569-580`) lets a **user override** in
`data/plugins.json` win over the cluster's env defaults, tells the UI the value came from the
cluster through `fromEnv` (`:686`), exposes only `hasToken` and **never the token** (`:694`), and
default-enables the plugin when the cluster injected the env (`_frpEffectiveEnabled`, `:584-589`).

**The registry rows this track contributes.** The field names are not invented — they are the
installed 0.32.0 binary's own env names (measured with `strings bin/agent-browser-linux-x64`, plus
its README's provider tables):

| `id` | Fields (`secret` marked †) | The vendor's own env name (appears **only** in that child) | Cluster may inject | Consumers (`consumers`) |
|---|---|---|---|---|
| `cloak` | `licenseKey` † (empty = free tier) | `CLOAKBROWSER_LICENSE_KEY` (`cb_…`) | `VIBESPACE_INTEGRATION_CLOAK_LICENSEKEY` | `src/server/browser-backend.js`, `src/server/browser-keeper.js` |
| `cloud:browserbase` | `apiKey` † | `BROWSERBASE_API_KEY` | `VIBESPACE_INTEGRATION_CLOUD_BROWSERBASE_APIKEY` | same two |
| `cloud:browserless` | `apiKey` †, `apiUrl`, `stealth` | `BROWSERLESS_API_KEY` / `BROWSERLESS_API_URL` / `BROWSERLESS_STEALTH` | same shape | same two |
| `cloud:kernel` | `apiKey` †, `endpoint`, `stealth` | `KERNEL_API_KEY` / `KERNEL_ENDPOINT` / `KERNEL_STEALTH` | same shape | same two |
| `cloud:browseruse` | `apiKey` † | `BROWSER_USE_API_KEY` | same shape | same two |
| `cloud:agentcore` | the vendor's own set (unverified) | per upstream's provider table | same shape | same two |

**The `consumers` column is the same for all six rows, and that is a conclusion rather than
laziness**: there are exactly two places in this track that call `resolveIntegration(id)` —
`src/server/browser-backend.js` (the switcher's source chip, and the Test runner registered below)
and `src/server/browser-keeper.js` (the one resolve before a spawn, which is what §9's leg (ii)
names). **What this column may never hold is "§7.1's `cloak` row"**: the shared layer's census
requires every name to **be a file that exists** and to **actually call** `resolveIntegration('<id>')`,
so a row naming itself satisfies neither, and it cancels the field's stated purpose ("which feature
reads it"). §7.1's rows and §7.4's switcher are the right answer **in the surrounding prose**, where
they read correctly; in `consumers` they are false.

Those two `stealth` fields are **values**, not capability promises: they are each vendor's own
implementation, with no public specification, and zero measurement in this round (§12.38). They are
in this table because they are something a user or a cluster **can set**, and a settable thing
belongs in this table.

**Why `cloak`'s licence goes through the env — stated correctly.** The vendor accepts three
channels: `CLOAKBROWSER_LICENSE_KEY`, an in-process `licenseKey` option, and
`~/.cloakbrowser/license.key` (§12.35). The first version of this reason said "the one channel of
the three that does not hit disk" — which is **wrong on its own terms**: the in-process option does
not hit disk either, and by this document's own threat model (§6.5) the env is the **weaker** of
those two non-disk channels, because a process under the same uid can read
`/proc/<pid>/environ`. The real reason holds up: we start `cloakserve` as **a separate process**
(§7.2's Docker/loopback shape), so the **in-process** option is not reachable from here at all —
the choice is between env and a file, and env wins because a file would persist the key in cleartext
**outside** `data/integrations.json`'s secret-box encryption and **outside** the `sensitive` export
list below, so it would follow neither the key rotation nor the export passphrase gate. §6.5's
`/proc/<pid>/environ` boundary is therefore **accepted**, not denied: what this section removes is
the **accident** (a key sitting in every agent's environment), not a boundary it pretends to build.

**Each row's Test is a contract, and its `kind` comes from the shared layer's closed set.** That
layer makes `test.kind` one of `credential-exchange` / `shape-only` / `reachability` and **derives
the button's own wording from it**, for a reason: a button that claims to "test the connection" and
never goes near the network is lying. This track's six contracts:

| `id` | `test.kind` | What the runner actually does (`describe`) | The **one** host it may reach | Button text |
|---|---|---|---|---|
| `cloak` | `shape-only` | Zero network: validate the `cb_…` shape. **Starts no process**, downloads no bytes. The tier comes from the first real launch (§7.4) | none | Check format (no network) |
| `cloud:browserbase` | `credential-exchange` | One bounded read-only request to the vendor's own sessions endpoint with that key; creates no session, runs no page | that row's constant host (§12.41) | Test connection |
| `cloud:browserless` | `credential-exchange` | same | **the host inside that row's own `apiUrl` field** — which the user typed | Test connection |
| `cloud:kernel` | `credential-exchange` | same | **the host inside that row's own `endpoint` field** | Test connection |
| `cloud:browseruse` | `credential-exchange` | same | that row's constant host (§12.41) | Test connection |
| `cloud:agentcore` | `credential-exchange` | same (the fields themselves are unverified, as the table above already says) | the host derived from that row's own region field (§12.41) | Test connection |

**Why `cloak`'s row is `shape-only` rather than "start one throwaway `cloakserve` and read the
tier".** That Test has **two preconditions**, and both collide with when this card gets opened: the
200 MB binary — §7.4 says verbatim **never** download it without the user having asked — and
§7.2.1's recorded egress proof. A card a user opens merely to **paste a key** should not be the
trigger for either. So why not ask the shared layer for a fourth kind (`local-launch-probe`)? Because
that set is closed for a reason: the button's wording is derived from the kind, so a fourth kind is
a fourth sentence that needs explaining — and the thing it would buy, the tier, is free at **the
first real launch**, which already sits behind those two preconditions. This section therefore takes
the honest answer the closed set offers and writes the cost into §7.4's three-state table.

**Who registers the runner.** The shared layer's `test(id)` **constructs no vendor request of its
own**: it calls the runner the consumer registered at wiring time
(`registerIntegrationTest(id, fn)`), and "a row that declares a `test` without registering a runner
is a dead control ⇒ the census goes red". All six of this track's rows are registered by
`src/server/browser-backend.js` at wiring time — the same module as the first name in `consumers`,
and that is not a coincidence: **whoever declares the row, whoever registers its runner and whoever
calls `resolveIntegration(id)` must be one module**, or that census only ever finds three names that
do not know about each other.

**This track's own third-party egress declaration.** The shared layer's right to say "the store
constructs no vendor request, and this layer will not become a second file holding N vendor hosts"
**rests on** the consumer having already declared its hosts; and §9's `test-vendor-whitelist` row
says verbatim that it is an **Anthropic-only** source census, so it neither sees nor should see these
rows. This track's declaration is the following three clauses — part of the design, not an
implementation detail:

1. **CloakBrowser** — it has **no Test entry** in this declaration (`shape-only`, zero network). Its
   egress surface is §7.2.1's **container egress allowlist**: the pinned download host at install
   time, then nothing but the sites this profile is actually for. A measurement is a snapshot of one
   version's behaviour; an allowlist is a property of the deployment, and only the latter survives
   the vendor shipping a new binary.
2. **The five `cloud:*` rows** — **exactly one** host each, and where that host comes from is
   **derived per row** rather than listed as constants: `browserless` and `kernel` take theirs from
   **the field the user typed** (`apiUrl` / `endpoint`, in the table above), and `agentcore`'s varies
   by region. So the declaration is written as a **rule**: **a runner may reach only the one host
   derived from its own row's fields, and nothing else**; a host it cannot derive is a named refusal,
   never a "let us try the default host". A constant allowlist is the **wrong shape** here, because
   for two of the rows it cannot express the right answer at all.
3. **There is no third clause.** Outside those Tests this track's server sends **no** third-party
   request: a provider's traffic belongs to the browser process itself (`cloak` inside its container,
   `cloud:*` at the vendor), which is §6.3's and §7.2.1's subject.

§9's `test-browser-providers` therefore gains a leg: **the set of hosts these runners can reach is
exactly the set the rule above derives**; the negative control is a runner with its host written as
a constant — it must go red, because a constant is precisely what bypasses "the `apiUrl` the user
typed", which is the reason the rule exists.

**The key never comes one step closer to an agent, and there is a trap here that has to be named.**
`agentEnv()` (`src/ws-handler.js:112-121`) is not an **allow** list — it is a **DROP list plus one
prefix rule**: it drops the six names in `AGENT_ENV_DROP`, every `npm_*`, and every `VIBESPACE_*`
that is not in `AGENT_ENV_KEEP` (nine names, `:101-105`). **Every other name it passes through
verbatim.** So if the cluster injected under **the vendor's own name** (`BROWSERBASE_API_KEY=…`),
that key would be in **every** agent CLI's environment, readable with one `env` — which is exactly
the shape the comment above that function (`:88-100`) names verbatim ("the helm chart injects
VIBESPACE_PASSWORD (the login password!), S3/CephFS/Drive/frps credentials and the telemetry token
— an agent could read all of them with one `env`"). So this rule is not hygiene, it is
construction:

* **The cluster may inject only under `VIBESPACE_INTEGRATION_<ID>_<FIELD>`**, plus the JSON list
  `VIBESPACE_INTEGRATIONS=[{id,label,values:{…}}]`. The reason is structural: the `VIBESPACE_`
  prefix is precisely the class `agentEnv` drops, and these names are **not** in `AGENT_ENV_KEEP` —
  that nine-name list is an explicit table, so adding a row takes somebody writing one, which makes
  "forgot to add it" the safe direction.
* **The vendor's own env name appears only in the environment of the one child the keeper spawns
  for that provider**, with the value taken from `resolveIntegration` at the instant of the spawn —
  never a file, never argv, never a log line, never `agentEnv`. This is the same rule as §6.4's
  "proxy passwords and provider auth keys live in the registry server-side"; this section only gives
  it an implementation and one concrete way it would be violated.
* **A consumer never reads `process.env` itself.** The standing sweep is owned by the shared layer,
  and it matches the env **NAME**, not an access expression: the regex
  `/VIBESPACE_INTEGRATIONS?\b|VIBESPACE_INTEGRATION_/` appearing anywhere **outside**
  `src/server/integration-store.js` = red, over a file set derived from `git ls-files` (through
  `scripts/git-env.mjs`'s sanitized git environment) and **printed** by the suite, with the two
  evasions as its negative controls — the bracket form `process.env['VIBESPACE_INTEGRATIONS']` and
  the destructure form `const { VIBESPACE_INTEGRATIONS } = process.env`. This track's modules are its
  **subjects**, and §9 gains a leg for it.
* Exactly the same shape as §6.1's "the stream token never reaches an agent": a secret kept out of
  `agentEnv` can still be read out of **the server's own** `/proc/<pid>/environ` by a process under
  the same uid (§6.5 already writes that honest boundary down once). What this section removes is
  the **accident** (a key sitting in every agent's environment, one `env` away), not a boundary it
  is pretending to build.
* **That key has no channel to another machine today, so it does not travel.** The whole rule above
  lives **inside this process**: nothing between `resolveIntegration`'s answer and the spawn crosses
  a transport. But a profile whose `host != null` is spawned on an ssh host or a paired device
  (§7.3, D5's option (b), §10's P4 — **the same phase** as this key half), and pushing the plaintext
  key down the agentd mux would make §6.4's "provider auth keys live in the registry server-side"
  false on the spot, with no channel carrying it, no rule governing it and no test driving it. So
  §7.1's capability cells give `keyScope`: **a `local-only` provider is refused when `host != null`**
  (`provider_needs_local_key`, the switcher's row disabled with its reason) rather than quietly
  spawning without a key and failing at the far end. This is a **decision**, not an omission —
  whether to change it is **D34**: the only decent channel is the daemon's existing
  **credential-material** path (the sealed-orders shape, `src/account-material.js`), and that owes
  its own decision row, its own line in §6.4, and a **REMOTE arm** on §9's leg (ii) driven by a real
  daemon. None of the three exists today, so today's answer is a refusal — and one written into the
  capability table where the UI can read it.

**Export.** Integration keys join the `sensitive` list of `/api/config/export-info`
(`src/routes/persistence.js:679-686`, today vsPassword / claudeCreds / codexCreds / hosts / mounts /
accounts), so they leave with a config export only when the user **explicitly opts in and supplies a
passphrase** (`:708-712`, the ≥4-character gate). **They never go in settings.** The settings
SyncStore broadcasts every value to every client and exports in plain; `SETTINGS_CATEGORIES`
(`src/lib/settings-schema.js:935-948`, which **is** SettingsUI's render loop, test-architecture §44)
already has an `Integration` category today, but that category holds **switches**, not **secrets** —
and a secret in settings is a secret sent to every open tab. So any browser switch this design adds
(auto-binding, recording, per-site memory) may go in `SETTINGS_CATEGORIES` (and **must**, or it does
not render), while keys go in the Integrations window without exception.

**At-rest encryption is a P0 precondition, not this track's code.** Today that `aes-256-gcm` pair
lives in `MountManager._enc` / `_dec` (`src/mounts.js:369-382`; the key file is `data/.mounts-key`,
`0600`, minted on first use, `src/mounts.js:47` + `:360-367`). The shared layer extracts it into
`src/secret-box.js` (**SHARED**, **one** primitive) with mounts migrating behind a parity test. This
track does not implement it — it **depends** on it, which is why §10's P4 carries an explicit
cross-track dependency line.

**How a cluster admin supplies a default.** A helm `integrations:` block → a Secret → env, the same
shape that already runs for Drive presets:
`deploy/helm/vibespace-user/templates/main.yaml:159-170` is verbatim
`valueFrom: { secretKeyRef: … }`, **never** a plain `value:` (in the same stanza
`VIBESPACE_GDRIVE_CLIENT_ID` is plain while `…_SECRET` goes through secretKeyRef, because only the
latter is a secret). The exact values block and the `deploy/README.md` section are owned by the
shared layer's document; this track only declares the `id`s and field names it needs (the table
above).

**Fleet redirect URIs — this track does not consume them, but both documents must say the same
sentence.** A cluster OAuth client registered ONCE has to work for N instances with N public URLs
(helm injects `VIBESPACE_PUBLIC_URL` per instance, `main.yaml:172-176`). Two routes: **(a) the
existing loopback + paste-back flow** — the redirect lands in **the browser on the user's own
machine**, the UI asks them to paste the address bar back, and we forward it to the local listener;
`src/mounts.js:2172-2183` says verbatim that this shape already runs for Drive ("Remote deployment:
the redirect to 127.0.0.1 fails in the USER'S browser, but the code is in the address bar — the UI
asks them to paste that URL back"), and it needs **not one line of change** for a **cluster** app,
because the instance's public URL is never the redirect target. **(b) a cluster auth relay**
(`https://auth.<cluster>/cb` with signed state, forwarding to the instance's public URL) — better
UX, but new infrastructure, a new trusted middleman, and a new availability dependency.
**Recommendation: (a) for v1, with (b) as a later phase behind an owner decision.** What each vendor
allows: **Lark requires an exact-match redirect URI** (hence (a) uses one **fixed** registered
loopback URL, the shared layer's §12.4 decision 4); **Google allows several exact URIs and relaxes
the port for loopback**; **CloakBrowser is an API key with no redirect at all** — every row in this
track's table above is a pure key, so this paragraph is **background** for this document rather than
a dependency, written here only so the next reader does not think it was overlooked.

### 7.6 The three-tier access ladder — CDP, fingerprint browser, pure computer-use (D31)

(The owner's 2026-09-10 question, folded into the architecture only in this round: "agent-browser 是
CDP 吗，Mercury 这类银行会不会检测……是不是还得一个纯 computer use 版本" — *is agent-browser CDP;
would a bank like Mercury detect it; do we also need a pure computer-use version?*)

**The facts first, each one naming its source.**

* **agent-browser is CDP end to end.** Not an inference: `strings` on the installed 0.32.0
  `bin/agent-browser-linux-x64` yields `struct CdpMessage` / `struct CdpReply` / `struct CdpError` /
  `Target.createTarget` / `Page.navigate` / `Input.dispatchMouseEvent` / `GetFullAXTreeResult`
  (= `Accessibility.getFullAXTree`), and `--cdp` / `connect` / `get cdp-url` are already in §1.4.
  The one exception is a **WebDriver** backend in the same binary
  (`src/native/webdriver/{client,backend,appium,ios}.rs`, error string verbatim "… is not supported
  on the WebDriver backend") — and it serves iOS / Safari / Appium, not evasion.
* **The only "stealth" today is one launch flag, and the user put it in their own config.**
  `--disable-blink-features=AutomationControlled` is in this machine's
  `~/.agent-browser/config.json` (§1.1, verbatim), and inside the binary it appears only in the
  **example text** for `--args`
  (`e.g., --args "--no-sandbox,--disable-blink-features=AutomationControlled"`). Upstream ships no
  stealth layer.
* **But upstream does have a first-class interface to hang one on.** The 0.32.0 README documents the
  plugin capability `launch.mutate`: "Use a launch mutator plugin for **stealth** or local launch
  customization. The plugin can append Chrome args, extensions, and init scripts before the browser
  starts"; the example plugin name is verbatim `stealth` / `agent-browser-plugin-stealth`, and it is
  capability-gated (`agent-browser --confirm-actions plugin:stealth:launch.mutate open …`). The same
  page also says "agent-browser keeps browser automation, redaction-sensitive output, and policy
  enforcement in core" — i.e. plugins are **out of process**. **That gives tier 2 a second route
  that does not swap the binary** (§7.4 is the swap-the-binary route). Whether a published
  implementation exists is unverified (§12.37).
* **Upstream itself admits this is not enough.** `vercel-labs/agent-browser` issue **#120**
  ("Feature Request: Add stealth mode via AGENT_BROWSER_STEALTH environment variable",
  shkumbinhasani, 2026-01-15, **still open**) says modern bot detection — naming Cloudflare,
  DataDome, PerimeterX and reCAPTCHA — checks far more than one signal, that launch flags like
  `--disable-blink-features=AutomationControlled` address "one detection vector", and lists WebGL
  vendor/renderer fingerprinting, plugin and mime-type enumeration, Chrome runtime properties, and
  inconsistent browser feature detection.
* **The classic `Runtime.enable` leak is mostly dead, and that is exactly why a patch is not the
  answer.** A 2025 Chrome update altered the serialization path the classic check observed, so the
  getter stopped firing on current versions; and the rebrowser / Patchright generation of patches
  simply **stops sending** the command — a "patch war" between the two, whose outcome is that this
  **one** signal is largely inert in 2026. What remains is four layers: **protocol side effects**
  (anything that behaves differently when a debugger is attached is a viable probe), **injected
  residue** (observable objects like `$cdc_` and `__playwright__binding__`), **evaluation
  fingerprints** (code injected through CDP executes differently from code that arrived with the
  page), and **absence patterns** (a perfectly silent session is itself informative, combined with
  server-class rendering and datacenter network indicators). In other words: **a patch aimed at one
  leak is a depreciating asset**, which is precisely why this design does **not** write a stealth
  layer and makes it a provider row instead (§7.1's capability-row discipline).
* **Banks take a different road, and that road is unfavourable to a fingerprint browser.** The
  behavioural-biometrics and device-intelligence industry (one vendor's DeviceIQ launch material,
  2026-03, names verbatim the detection of device spoofing, emulators, **cloaked browsers**,
  jailbroken devices and data wiping; the same vendor claims continuous collection of 3,000+
  anonymized signals including keystroke and mouse activity and AI agent usage; as of 2026 Q1 more
  than 30 of the world's largest 100 banks and 357 financial institutions in total) means a bank's
  judgement rests on **device fingerprint + behaviour + new-device step-up**, not on a JS challenge.
  **The consequence is counter-intuitive**: a fingerprint browser makes you look like **a new
  device**, and the correct response to a new device, for a bank, is **to require verification** —
  so **tier 2 may be worse than tier 1 on that class of site**, which is the part the owner's
  question got right.
* **Whether a particular bank actually blocks is measurable only per site.** This round made no real
  attempt against any named site, so the owner's ask for "2–3 concrete failing sites" **stands**, and
  it is the only half of D31 that evidence can move (§12.36).

**Hence three tiers, and they are three sibling provider rows in §7.1, not an `if` chain:**

| Tier | Provider | Observation / action | What the site sees | Cost | Latency & precision | Where it is used |
|---|---|---|---|---|---|---|
| **1** | `chromium` (optionally with a `launch.mutate` plugin) | CDP: DOM + accessibility tree + `Input.*`, acting by element reference | an automated Chrome, undisguised beyond one launch flag | free; 6 processes / 420–667 MB PSS per instance on this machine (§1.2) | fastest, most precise | the default; everything that does not actively block |
| **2** | `cloak` / `cloud:*` (including each vendor's own `*_STEALTH` switch, §7.5) | still CDP — same verbs, same profile model | **another machine**: source-level fingerprint patches, a per-connection seed (§7.2) | CloakBrowser free 1 concurrent / $19 up; cloud providers metered (keys in §7.5) | same order as tier 1, plus one launch and possibly a network hop | content sites and anti-scrape stacks; **for any site with an account, try a human login through the live view first (I5)** |
| **3** | **`local-window` (new)** | **no CDP, no automation flags**: pixels + the AT-SPI accessibility tree (§4.9), input through §4.9's per-platform injection ladder | **the user's own real browser profile** — an ordinary Chrome/Firefox window; nothing to detect but **behaviour** | free, but it needs a live desktop session plus §4.7's transport | slowest, least precise: one `snapshot` is **one D-Bus round trip per node** (measured 1,800–6,100 nodes/sec, §4.9), `click @ref` holds only on nodes that **self-report an action** (66 of 503 nodes, **6 of 43 `button`s**), and `key` (a chord) has **no path at all** on the tree | banks, and any site doing new-device step-up; **needs the user present** |

Five rules fall straight out of that table:

1. **Tier 3 is not a stronger tier 2 — it is a different trade.** Tier 2 buys "looks like a machine
   nobody automated"; tier 3 buys "**is** that machine" — at the cost of an order of magnitude in
   both precision and speed, and it inherits every empty cell of §4.9's matrix verbatim (on this
   machine: X11 enumeration cannot see Wayland clients, GNOME's `Introspect` answers us
   AccessDenied, `/dev/uinput` is unusable).
2. **Per-site memory grows a `tier` field, and it is legal only while `backend` is `null`.** §7.4's
   `siteHints` goes from `{host, backend, by, at, why}` to `{host, tier, backend, by, at, why}`, and
   `backend` stays because "which provider within tier 2" is a different question. But the two fields
   may **not** carry the same fact at the same time: a provider sits on exactly one tier (the table
   above), so once `backend` names one the tier is derived from it — storing it again is the twin
   §3.3's third rule forbids. And the reason `tier` needs to exist at all is the second half of this
   rule: a failure produces only a **suggestion**, and all a suggestion can say is "change tier"
   ("this site needs tier 3"), at a moment when no provider has been chosen and `backend` is `null`.
   So the rule is one enforceable sentence: **`tier` is legal only while `backend === null`**, and
   both §3.3 and §9's `test-browser-tier3` assert that sentence. **Never auto-escalate**: the actual
   escalation is a **user act with the notice** required by §3.8's anti-default-blindness rule,
   because moving to tier 3 means this agent starts operating the user's **real** logged-in state.
3. **Escalating to tier 3 does not re-point an existing profile — it opens a window target.** This
   has to be said out loud, because §7.4's "the backend is a property of the profile, and a switch
   changes that field" is **not true** of tier 3, and following it has silent consequences: a tier-3
   target's state lives in the user's own Chrome/Firefox profile, **not** in the record's `dir`, so
   "switching" would quietly abandon the cookie jar the profile exists for while pointing P5's
   retention sweep at a directory that is either ours-and-empty or the user's real browser profile.
   §7.1's capability cells therefore give `local-window` three "no"s (`canSwitchTo: no`,
   `ownsDir: no`, `leaseKind: 'window-target'`), and this rule is how to read them: when a
   `siteHints` tier-3 suggestion is acted on, the user's action opens a §4.9 **window target** — the
   thing that row actually names — rather than rewriting some profile's `provider`; a tier-3 record
   carries **no** `dir`, **no** `fingerprintSeed`, is never a target of §7.4's version ladder, and is
   never touched by P5's sweep. Its lease is §4.9's window-target kind (keyed on the window handle,
   not on `browserKey`/`targetId`), and §6's owner rules apply verbatim — which is the next rule.
4. **Tier 3's security model is §6.6's, not §6.2's.** A tier-3 target is a real window on the user's
   desktop with their own login in it. §6's lease and owner rules apply verbatim, plus two that
   belong only to this tier: **the user's take-over always wins** (the instant `lease.input` flips to
   the user, the agent's injection is refused, §4.3), and **it requires D27's option (b)** (the
   "windows on the user's real desktop" cell, which needs an explicit opt-in and its own consent) —
   the first version of window targets lists only the windows **we started**, and the bank use case
   is precisely not in that cell. That is why tier 3 gets its own phase (§10's **P10**) rather than a
   checkbox inside P4.
5. **The escalation ladder must say why it escalated.** `vibespace-browser blocked`'s **claim**
   (§7.4) now carries a suggested tier, and the UI still says "the agent says this page is blocked
   and suggests tier N", **never** "we detected a block"; the 403/429 `hint` likewise goes from
   `hint:'may-need-cloak'` to `hint:{tier:2|3, why}`, still worded so it cannot be mistaken for a
   detection (the same family as §4.3.1's "a producer we ship must be named").

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
| `test-browser-providers` | fast + heavy | **P4** | fast: the provider capability rows and the exact refusal a provider produces for a capability it lacks (a disabled control names its reason), plus the presence and shape of the CloakBrowser egress proof record (§7.2.1) — a provider row with a `blocks:` claim whose caps row is not actually false FAILS, the `local-oracles` discipline. heavy: the real `browser-serve` daemon op against a real daemon **with its capability gate asserted** (an old daemon is never asked — unknown ops hang), and the remote `cdp` provider over `tcpForward`. **Plus the four key legs (§7.5)**: (i) **a consumer never reads env itself** — put a full set of fake provider keys into the server's `process.env`, run the **real** `agentEnv()` (it is exported, `src/ws-handler.js:1657`), and assert not one of them is in the returned object; the negative control is the same set injected under **the vendor's own names** (`BROWSERBASE_API_KEY=…`), which must go red (today it passes them straight through, `:112-121`); (ii) the keeper asks `resolveIntegration(provider)` **exactly once** before a spawn, and the spawned child's environment carries that vendor env name while **its parent's does not**; (iii) the three precedence states (user / cluster / none) yield three different `source` values over one fixture, and `publicView` never emits a plaintext secret (asserted on the **returned object**, not on its rendering); (iv) a **named refusal**: switching to a backend with no key returns `backend_no_key` and **spawns nothing** (negative control: falling back to `chromium`, the thing D33 explicitly rejects). **Plus this round's four**: (v) **all six rows register a runner** — run `src/server/browser-backend.js`'s wiring and assert `registerIntegrationTest(id, fn)` was called once for each of the six ids (negative control: a row that declares a `test` and registers nothing must go red — that is exactly the shared layer's "dead control", and this track has to be able to catch it itself); (vi) **the egress declaration is DERIVED** — the set of hosts each runner can reach equals exactly the set §7.5's rule derives, with `browserless` / `kernel` taking theirs from **that row's own field** (drive it twice with two different `apiUrl`s and the host must follow), negative control a runner whose host is written as a constant, which must go red; (vii) **`cloak`'s Test is zero-network** — run its runner and assert **zero** child processes, zero sockets, zero bytes downloaded, while a malformed key produces a named `validate` complaint (negative control: a runner that starts `cloakserve`, which must go red because it bypasses §7.4's two preconditions); (viii) **`keyScope` is a refusal** — a profile with `host != null` switching to `cloak` / `cloud:*` gets `provider_needs_local_key` and **spawns nothing, resolves nothing, and hands no value to any transport** (negative control: the version that lets it through, which must go red; this leg is also where D34 would grow its remote arm if it is ever answered the other way). The sweep that goes red on the env **NAME** (`/VIBESPACE_INTEGRATIONS?\b\|VIBESPACE_INTEGRATION_/`, over a `git ls-files`-derived file set the suite prints, with the bracket and destructure spellings as its negative controls) outside the store belongs to the shared layer's `test-integration-registry`; this track's modules are its subjects — which is why §10's P4 carries a cross-track dependency line. |
| `test-browser-housekeeping` | fast | **P5** | The retention/adoption DECISION as a PURE function, printing what it spared and why; **the sweep's scope is exactly the provider rows with `ownsDir: true`** (§7.1's capability cells), negative control a `cloud:*` or `local-window` record queued for sweeping, which must go red — that directory is not ours — the repo's own sweep law: **never demand a removal nothing is allowed to perform** (a grace window for anything that may be in flight, named with its age). Negative controls: nothing is ever proposed for deletion without an explicit human act, and `forget` archives BEFORE it removes. |
| `test-browser-pin` | fast | **P0, P1** | The pin ladder as a PURE decision: explicit / conversation / Task-Group / instance / none, with the ORIGIN each rung states, and that a fork **copies the pin and mints a new key** (§3.2.5). The mid-session half is a WIRING PIN: the re-pointed symlink (or the rewritten per-session config) is what the next launch resolves, and the suite asserts the running browser is **unaffected** — the honest half. Plus the vocabulary case: every pin origin the product emits is in `SPAWN_ORIGINS` and the client's `spawnValueOrigin` whitelist recognises it (§3.2.5's two-site edit; the negative control is an off-vocabulary string, which must go red — in production it only renders a wrong label). Negative controls: a Task-Group default never beats a session's own choice; binding a group does not rewrite a running session's pin. |
| `test-browser-backend` | fast + heavy | **P4** | fast: the version ladder as a PURE decision over a matrix (target ≥ / < / unrecorded, registry-vs-`Last Version` disagreement ⇒ take the HIGHER), the site-hint record carrying WHO claimed it (plus §7.6's rule 2: a record that names a `backend` may **not** carry a `tier`, negative control the version that writes both), and `blocked` being a claim the server never manufactures. **Seats are three states, not a number**: known-and-fresh / known-but-stale / **unknown**, each with its own dialog text and ceiling behaviour, and the two load-bearing ones are — **an unknown total never satisfies the ceiling test** (negative controls treat `unknown` as `0` and as `∞`; both must go red) and **a stale verdict degrades to unknown** (push the clock past `SEAT_TIER_STALE_MS` and the same fixture must change its answer; negative control the version that drops the age). Plus a **source fork**: the key is the user's own ⇒ the refusal names the profiles holding seats; the key is the cluster default ⇒ the refusal **may not** list any profile and says "seats shared with other users; N used on this instance" plus the one-click way out (negative control: the version that lists local profiles under a cluster default). heavy: a real switch — stop, re-open one tab per lease at its `lastUrl`, re-pin, rewrite `targetId`, **the lease object never destroyed**; plus a leg for **each of the three** named refusals (`backend_unavailable` for not-installed, `backend_no_key` for no key, and the classification of a licence/concurrency launch failure as `backend_seat_taken` saying "this key is the cluster default" — that last one's input is a **recorded** `cloakserve` failure, and which recording depends on §12.40's measurement, so until it is taken the leg pins the classifier's **shape** rather than the vendor's words). |
| `test-window-binding` | fast + heavy | **P7** | fast: the chain model with `layout`/`split`/`ratio` — a missing `layout` reads as `'tabs'`, the ratio clamps, and **the multi-client sync key changes when only the layout changes** (§4.6's named trap, with the pre-fix key as its negative control). Three more: **close the host tab of a three-tab split chain ⇒ `layout === 'tabs'` and no dangling id in `split`** (the `_normalizeChain` invariant, with the pre-fix shape that leaves a dangling `pair` as its negative control); **two sessions in one task group produce distinguishable badges**; and **a session bound to no group produces a badge at all** (the two shapes on which borrowing the group colour fails). heavy (headless chrome): bind → two panes in one window, divider drag under a non-1 DPI zoom lands where the pointer is, move/minimise/desktop-switch keep them together, closing the browser pane collapses to tabs **without moving the chat window**, and a mobile viewport renders tabs **without writing its flattening back**. |
| `test-native-window` | heavy | **P8** | A real Xpra server + a real X client under Xvfb through the real cookie-authed bridge: one window arrives, input reaches it, the stream port is never reachable from a browser, and the backpressure discipline holds. **Skips loudly, with evidence**, when `xpra` or `Xvfb` is absent (measured 2026-09-10 on this box: `Xvfb` present, `xpra` absent). The bandwidth/latency numbers §4.7 needs are produced here, not asserted — the suite RECORDS them under a named budget so a regression is visible. |
| `test-browser-handles` | fast | **P1** | The attachment set as a PURE decision: a set of exactly one resolves a bare command to the default; a set of ≥2 answers a bare command with the named refusal `profile_required` **listing every handle and which is the default** (a refusal without that list FAILS — it is the only diagnostic this agent can get); the refusal for a `--profile` given a **filesystem path**, carrying the command that registers it as a handle; a child handle `bk-<parent>.<n>` reaped by the parent's teardown **by prefix**; one audit line per verb with **content never recorded** (a `fill` logs the verb only). **Plus both halves of the direct path (§3.7)**: with two attachments, a **direct** `agent-browser` invocation carrying that session's own env resolves to the default profile's user-data-dir **and resolves to no other** (a non-default attachment's directory is minted by the server and never printed), while the same bare command through our CLI gets `profile_required` — the first is layer ①'s honest boundary and the second is its guarantee, and both need an assertion or the boundary is only prose. Negative controls: a session with one attachment **never** needs a handle (else the rule turns the commonest shape into two commands); a handle naming a profile this session is not attached to is **refused**, not silently attached. |
| `test-profile-blindness` | fast + heavy | **P1, P2** | fast: `profile_changed` is **one-time** (one utterance per fingerprint, bare commands run afterwards), it fires on the **attachment set's fingerprint** rather than per command, and it is typed (`{code, was, now, handles}`); plus the wording of the `<system-reminder>` and its zero-spend delivery path (§3.8's layer ②); **plus the carrier itself**: a status override and a profile change both pending, and **both reaching the next prompt** (the negative control is today's single slot with its `break` on the first hit, which must drop one). heavy (headless chrome, 375×667): this leg is a **mutation**, not two fresh renders — render, then change only "what the agent last used" on the same session, and assert the chip flips neutral→amber with both names **without a full rebuild**; the negative control is a digest of `(v) => v \|\| ''` over an **object** (verified in node: two different objects both digest to `":[object Object]"`), which must go red. "Neutral when they agree, amber when they do not" as two fresh renders is **not** this leg, because both pass under that bug (this repository has paid for that table six times). |
| `test-browser-tier3` | fast + heavy | **P10** | fast: the ladder as a PURE decision — `tier(provider)` derived from §7.1's two tables (**a profile RECORD carries no `tier` field**, §3.3; and a `siteHints` `tier` is **legal only while `backend === null`** — negative controls write both together, and write a `tier`-only hint that then re-points some profile's `provider`; both must go red), the `siteHints` rule that it **never auto-escalates** (a tier 1/2 failure produces a **suggestion**; the negative control writes it as an automatic switch and must go red), `blocked` claims and the 403/429 `hint` both carrying **who claimed it** and **never** calling themselves a detection, and the exact refusal the `local-window` row produces for every capability it lacks (no CDP, no `--allowed-domains`, no `--pin-tab`). heavy: a real Chrome window on a real X server with **no** `--remote-debugging-port` and **no** CDP — `snapshot` comes from the real AT-SPI tree, one `click @ref` lands on a node that self-reports an action, and one chord **refuses with the probe result** (§4.9: it has no tree road) — asserting throughout that the browser process's argv carries **no** automation flag at all. That last assertion IS the definition of tier 3, which is why it is an assertion rather than a sentence. |
| `test-window-target` | heavy | **P9** | A real Xvfb + a real Xpra + a real GTK client: `list` shows only the windows we started, `snapshot` mints `@ref`s from the **real AT-SPI tree** (role/name/bounds all asserted present), `click @ref` changes that application's state through `do_action` (verified by the application's **own tree**, not by pixels), `click --at` **refuses with the probe result** when no injection backend exists, **`key` (a chord) likewise refuses with the probe result** when there is no injection backend (there is no tree road for it, so the verb is simply not possible in that column), **`click @ref` on a node that exposes no `Action` refuses rather than silently degrading to a coordinate click** (negative control: the same node still refuses even when an injection backend IS present — that rule is about the node, not about the column), `snapshot` additionally **reports its own interface census** for the walk it just did (how many nodes carried `Action` / `EditableText`) so §4.9's 66/503 and 6/43 can be re-checked on another desktop, the walk runs in a **bounded child** and a node that does not answer is reported as an unreadable subtree rather than stalling it, and the lease plus §4.3's three modes are the same object a tab uses. Every cell of the capability matrix is a **runtime probe** rather than a platform name, and the suite **prints** what it probed; **skips loudly, with evidence**, when `xpra`, `Xvfb` or AT-SPI is missing (2026-09-10 on this box: `Xvfb` present, `xpra` absent, AT-SPI present and reporting 9 applications). The numbers §4.9 admits it has not measured are produced here under a named budget. |
| `test-spend-paths` | fast | **P3** | Not a new suite — the existing census, which this feature must not redden. Its `deliver-ladder` primitive matches `deliverToConversation(` **per site**, so any announcement in `src/server/browser-*.js` needs the gate in scope above it; and its closed-set assertion means `'browser-handback'` and `'browser-profile-notice'` (§3.8) must each be declared AND used in the same change (§4.3.1). |
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
| **P1 — Registry + keeper + lease** | `src/browser-profiles.js` (PURE), `browser-keeper.js` incl. **boot reconciliation and the concurrency ceiling**, `data/browser-profiles.json` + atomic writes + broadcast, `/api/browser/*`, attach/detach/lease, `vibespace-browser` CLI + `AGENT_TOOLS` + manual, migration steps 1–2, **the pin ladder + the Task-Group default + the four pin surfaces + "adopt this session's browser" (§3.2.5)**, `test-browser-pin`, **plus the attachment set and handle addressing (§3.7) + anti-default-blindness layers ① and ② (§3.8) — `attachments`/`new-child`/`--profile`, the two named refusals `profile_required` and `profile_changed`, the audit stream, and the zero-spend `pendingNotice` — including the small change that makes it a **queue** (typed `{kind,…}`, `renderNotice` dispatching on `kind`, a draining injection site instead of `break` on the first), because today's single slot would let this design's two producers overwrite each other and the status-override notice besides**, `test-browser-handles`, `test-profile-blindness` (the fast half). | **10** | 8–15 | 5 | Yes — per-task profiles that concurrently coexist, with `--pin-tab` semantics; **and for the first time one session may hold several at once**. |
| **P2 — Live view** | `/api/browser/stream` bridge (+ backpressure), `browser-live` window type, multi-viewer fan-out, URL/tab/console panes, DPI-correct canvas, **the in-window profile switcher strip for a session with several attachments (§3.7) and the amber status-bar Browser chip (§3.8's layer ③, including its `LIVE_SESSION_FACTS` row and digest)**, `test-browser-live`, `test-profile-blindness` (the heavy half). | **7** | 6–10 | 3.5 | **Yes — (1.c) minus the hands.** |
| **P3 — Takeover / handback** | Lease input holder, mode switcher, input forwarding, `browser_paused`, **the §4.3.1 spend wiring** (`'browser-handback'` in `SPEND_REASONS`, the ladder call, `browser.announceIdleHandback` default OFF, the `test-spend-paths` census staying green), idle handback, agent cursor, `--confirm-actions` cards. | **5** | 4–7 | 2.5 | Yes — completes (1.c). |
| **P4 — Providers** | Provider rows + capability gating; **the CloakBrowser egress precondition performed and recorded first** (§7.2.1), then opt-in on the free tier via loopback `cloakserve` with an egress allowlist; remote `cdp` provider over `tcpForward`; the `browser-serve` device op (three-touch rule); **the live backend SWITCH (§7.4) — the version ladder, the seed carried across, the lease-driven tab re-open, seats in the dialog, per-site hints, and the agent's `blocked` CLAIM**; **plus §7.5's key-consumer half** — this track's own registry rows, one `resolveIntegration(provider)` before the keeper spawns, the switcher's source chip, the `app.openIntegration(id)` deep link, the `backend_no_key` named refusal, and §9's eight key legs; **plus round 8's clauses, which land in this cell and add no rounds** — the six rows' `test.kind` (`cloak` = `shape-only`, the five `cloud:*` = `credential-exchange`), the six runners registered by `src/server/browser-backend.js`, §7.5's **per-row derived** egress declaration, the seat display's **three states** (with `SEAT_TIER_STALE_MS` and "an unknown total never satisfies the ceiling"), the tier read back from **the first real launch**, the third named refusal `backend_seat_taken`, and `keyScope: 'local-only'`'s `provider_needs_local_key` refusal on `host != null`; `test-browser-providers` + `test-browser-backend`. **This cell's first actions gain one zero-code measurement**: §12.40 (what `cloakserve` returns when a free-tier key's seat is held **on another machine**), because `backend_seat_taken`'s criterion keys on that answer. **Cross-track dependency, stated rather than implied: P4 cannot land before the communication-panel track's P0** — `src/integration-registry.js`, `src/server/integration-store.js` and the extracted `src/secret-box.js` (with mounts migrated behind a parity test) all belong to that track's P0, while this track writes only its own rows and two call sites. The dependency is **one-way**: that track's P0 needs nothing from this one, so the two lines run in parallel and only P4's merge point is gated. Rounds 1–6 sized this cell at **9**; the consumer half of keys (rows + two call sites + one chip + one refusal + four legs) measures **+1**, so the cell is now **10**. **Round 8 did not move that number, and the reason is stated rather than assumed**: everything it adds is a clause **inside** things this cell already counts — the registry rows were always going to be written (now with a `kind` and a `describe`), the runners were always going to be registered (one `registerIntegrationTest` line each), the seats were always going to be displayed (now with two more states), the refusals were always written one at a time (now there are three) — and §12.40's measurement is **zero code**. The only genuinely new implementation is the per-row egress rule, a helper inside the runner. So the cell stays at **10**, and what grew is §9: four key legs became eight. | **10** | 8–14 | 5 | Yes — (1.a), and the fleet story. |
| **P5 — Recording + housekeeping** | **Action trace (D35, owner 2026-09-13): for every agent action a before-JPEG and an after-JPEG, the action's position (click point / target element box / input landing) and the command itself, as an expandable entry on the transcript's tool card and as a timeline in the live-view window for later review**, per-profile screencast opt-in, transcript thumbnails, retention sweep, profiles panel with sizes, orphan adoption (migration step 3), `test-browser-housekeeping`. | **4** | 3–6 | 2 | Yes — the transcript half. |
| **P6 — Hard mediation** | CDP-mediating proxy: target scoping + input refusal during takeover, per-session CDP URLs. **A stated precondition of `sharing: "instance"`** (§6.2), not merely an option if D6 says the cooperative lease is not enough. | **6** | 4–9 | 3 | Only as enforcement — but `sharing: "instance"` stays refused until it lands. |
| **P7 — Window binding** | `layout`/`split`/`ratio` on the tab chain, the title-bar bind affordance + ~~the left/right title-bar drop zone~~ (deleted 2026-09-23 for an explicit button after a merge — docs/design-split-ux.zh.md), the born-into-a-chain `createWindow` path, the divider (per-drag controller, rAF, one coordinate conversion), the ownership badge from `leases`, the layouts persist + **the sync-key fix**, mobile tabs-only without write-back, **the per-pane owner badge on the switcher strip's tabs (§3.7)**, `test-window-binding`. | **6** | 5–9 | 3 | Yes — an agent-driven browser stops losing its owner. **Needs P2** (there must be a live view to bind); independent of P3–P6. |
| **P8 — Native client windows** | The Xpra rung (§4.7): a keeper under §3.5's ceiling and runaway guard, `GET /api/xpra/stream` in the `/api/vnc` shape, the client half per D21, the 200 ms / 1 Mbps measurement, and per-app routing (WhatsApp → the web version in a profile; WeChat → the native client, only after the web version is tried). Then the §4.8 adapter for whichever app the owner names, feeding the existing Communication-Channels ladder with its own `source` tag and a declared `'chat-inbound'` spend reason. `test-native-window`. | **7** | 5–11 | 3.5 | Yes — but it is the least verified phase in the document and its range says so. Independent of every other phase except §4.2's bridge shape. |
| **P9 — Window targets** | §4.9's window targets: `src/window-targets.js` (SHARED: enumeration / the AT-SPI snapshot and `@ref` minting / the **runtime-probed** input-backend ladder), `data/bin/vibespace-window` + its manual (§5.1.1), the `window-live` pane reusing §4.7's bridge, the lease and three modes shared with tabs, and §6.6's two-class boundary plus its audit line. **The first task is to measure four things**: whether the portal is usable at all from a `systemd --user` background context, AT-SPI's coverage on Qt/Electron, the end-to-end latency from one `do_action` to a visible change, and **which AT-SPI binding the node side uses and what it costs per node** (every figure in this round was taken through `python3` + GI, i.e. through `libatspi` and its cache; a direct node D-Bus client has no such cache and a spawned GI helper pays §1.6's fork tax — both need re-measuring, §12.33). **The walk itself runs in a bounded child/worker** (per-call timeout, whole-walk node budget), never on the server's or the daemon's event loop — one D-Bus round trip per node, and an application that stops answering blocks until libdbus's 25 s default. **The scope stays D27's option (a)** — only the windows we started; tier 3 (§7.6, the browser on the user's **real** desktop) is **P10**, not this. `test-window-target`. | **8** | 6–13 | 4 | Yes — for the first time an agent can operate an application that is not a browser. **Needs P8's transport** (Xvfb+Xpra) and P2's bridge shape; independent of P3–P7. |
| **P10 — Tier 3 (window targets on the real desktop)** | §7.6's `local-window` provider row: **D27's option (b)** (windows on the user's real desktop, behind an explicit opt-in and its own consent), columns 1 and 2 of §4.9's matrix re-verified against **the user's own session** (X11's XComposite/x11grab, or Wayland's ScreenCast portal — each with its own named failure on this box), `siteHints.tier` and the never-auto-escalate rule, tier 3's own security surface (§6.6's two-class boundary plus **the user's take-over always wins**), and the exact refusal §7.1's row produces for every capability it lacks. **The first task is to measure §12.36 and §12.39**: which tier 2–3 named sites fail on, and the end-to-end latency from one `do_action` to a visible change — and §12.36's measurement **can be made today, with no code at all**, so it belongs **before** this phase rather than inside it. `test-browser-tier3`. | **6** | 4–12 | 3 | Yes — that class of site (banks) becomes reachable for the first time. But it is the **least verified** phase in this document, and its range says so. **Needs P9** (the observation/action layer); the transport half reuses §4.7's bridge **shape** but **not** its Xvfb+Xpra cell — capturing a user's real desktop goes through the other two columns. |

**Totals, published as the range rather than the point** (round 1 published only the point
estimate of a range whose top its own risk paragraph pointed at):

| Scope | Range | Point estimate | **Risk-weighted** (P2, P4, P8, P9 and P10 at the top of their ranges, the rest at the point) |
|---|---|---|---|
| **P0–P5** | **33–59 rounds ≈ 16.5–29.5 days** | 41 ≈ 20.5 days | **48 rounds ≈ 24 days** |
| **P0–P6** | **37–68 rounds ≈ 18.5–34 days** | 47 ≈ 23.5 days | **54 rounds ≈ 27 days** |
| **P0–P8** | **47–88 rounds ≈ 23.5–44 days** | 60 ≈ 30 days | **71 rounds ≈ 35.5 days** |
| **P0–P9** | **53–101 rounds ≈ 26.5–50.5 days** | 68 ≈ 34 days | **84 rounds ≈ 42 days** |
| **P0–P10** (with tier 3 — everything the owner asked for) | **57–113 rounds ≈ 28.5–56.5 days** | 74 ≈ 37 days | **96 rounds ≈ 48 days** |

**Two cells moved this round relative to round 6, and both are in the table above rather than buried
in prose**: P4 goes from **9** rounds to **10** (§7.5's key-consumer half — the rows, two call
sites, one chip, one refusal, four legs), and **P10 is new** (§7.6's tier 3, point 6, range 4–12).
The P0–P9 row therefore moves from 100 to 101, and "everything the owner asked for" is now P0–P10.

The risk-weighted column is the one to plan against, and it is weighted for a stated reason:
P2 and P4 depend on a third-party binary's real behaviour rather than on our own code, which is
also why §12 lists three of their assumptions as unverified; P8 and P9 are the same, only more so —
they depend on a machine's desktop stack (compositor, portals, accessibility bus), and every
measurement this document has of that layer comes from **one** machine. **P10 is worse than any of
them, and its range (4–12, the widest here) says so**: what it depends on is not our machine but
**the user's** — their desktop, their browser, their logged-in state — and this document has
**zero** measurements of that machine (§12.39). Two further honesty notes:
55 % of workflow wall time in the last sample had **no agent running** (concurrency cap, session
limits, serial integration), so "days" here is agent capacity and not elapsed time; and the ranges
above are per-phase — the joint distribution is not the sum of the extremes, so P0–P10's **113
rounds** is the sum-of-extremes pessimistic bound, not a forecast, and the figure to plan against is
the same row's risk-weighted **96** (or **84** if you stop at P0–P9).

**Alternative order, if the owner wants value earliest:** P0 → P2 → P1 → P3. P2 can run against
upstream's per-session stream *before* the registry exists, because §3.2 already gave every
session its own browser. Measured against this round's point estimates: P2 completes at round 12
instead of round 22, i.e. **10 rounds ≈ 5 days earlier (4–7.5 days across P1's own 8–15 range)** —
round 1 said "about a week earlier", which is not what its own numbers give; round 2's "~3 days"
and round 3's "~4 days" were each correct for the smaller P1 of their day, and P1 grew the
attachment set and handle addressing this round, so the gap grew with it. The cost is retro-fitting
the profile selector into a window that already exists: roughly one extra round, so the ordering is
worth about 9 net rounds of earlier feedback.

**P7 changes that calculus, and the owner should know it.** Window binding (§4.6) is what makes a
live view legible when the agent is driving, and it needs only P2. So the earliest-value order is
**P0 → P2 → P7 → P1 → P3**: at the point estimates that reaches "the user watches the agent
browse, in a window visibly bound to the conversation that owns it" at round 18 — the whole of
(1.c) plus the binding — while the canonical order reaches only the unbound live view at round 22.
P8 and P9 are deliberately not in that sequence: they answer a different question (§4.7, §4.9) and
their ranges say how little is known about them.

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
| **D17** | **Do we ship the live backend switch, and who pays for CloakBrowser's seats?** (§7.4 — free = ONE concurrent session; Pro = 5 / 20 / 200 / 2000.) | (a) no switch — a profile's backend is fixed at creation; (b) switch on the free tier only, with the seat count shown and a loud refusal at the ceiling; (c) (b) plus a paid tier bought up front. | **(b).** The switch is the feature the owner asked for, and the free tier is enough to answer the only question that matters — does this site actually open. The seat count belongs in the dialog rather than in a support conversation later; buy a tier against a measured failure on a named site (D4's rule, unchanged). **Round 7 adds one clause without changing this recommendation**: the *used* count comes from **the keeper's own counting**, because no vendor interface answers "how many seats is this key holding right now" (§12.35). **Round 8 corrects the other number, also without changing the recommendation**: the *total* (the tier) does **not** come from Test — `cloak`'s `test.kind` is `shape-only` (zero network; the reason is in §7.5: a real probe needs the 200 MB binary and §7.2.1's egress proof first, and neither should be triggered by opening a card to paste a key) — so the tier comes from **the first real launch**, and before that it is **unknown**. The seat display is therefore **three states** (known-and-fresh / known-but-stale / unknown), and **an unknown total never satisfies the ceiling test**: that is an invariant rather than a wording choice, because D32's recommended configuration guarantees most fleet users sit in the third state. And when the key is the **cluster default** (D32), the keeper can only count this instance, so that row must say so. |
| **D18** | **Is auto-bind ON by default?** (§4.6 — when a session's browser starts and its chat window is open, the live view is born inside that chain in split.) | (a) ON; (b) OFF, bind is always a click; (c) ON only when the chat window is wide enough. | **(a) ON.** The binding is the answer to "whose browser is that", and a default that has to be discovered does not answer it. It is one setting, reversible per window by dragging a pane out, and the group is never dissolved on its own — so the worst case of being wrong is one drag. (c) is a hidden rule that will look like a bug on the day it does not fire. |
| **D19** | **In a split chain with a third tab, what does clicking that tab do?** (§4.6 — a chain may hold five tabs with two of them paired.) | (a) it replaces the non-owner pane; (b) the whole chain flips back to `'tabs'`; (c) a third pane opens. | **(a).** It keeps the binding (the chat pane, the thing the browser is bound TO, stays put) and it is the least surprising: the pane you were not looking at is the one that changes. (c) is refused on measurement grounds — three panes are all unusable below a width most people run, and the ratio model would have to become a tree. (b) silently destroys a layout the user built. |
| **D20** | **Do we build a WeChat local-store adapter?** (§4.8 — SQLCipher via WCDB, key in process memory; on this box `ptrace_scope` is `1`, so only an ancestor may read it.) | (a) no — picture via Xpra, data via the official Official-Account / Work-WeChat APIs; (b) yes, in core; (c) yes, but only in a plugin, with explicit consent, and only for a client VibeSpace started itself. | **(a), with (c) as the answer if the owner insists.** It is memory-scraping a proprietary client that breaks silently on every update, it crosses the ToS plainly, and the only way to make it technically work is to have VibeSpace start WeChat *so that* it can read its memory — a sentence that argues against itself as a default. If it is built, it is a plugin (D2's line for proprietary things with a legal face), never core. |
| **D21** | **Xpra's client half: host upstream's HTML5 app, or render it ourselves?** (§4.7 — MPL-2.0 app vs `xpra-html5-client`, Apache-2.0, on npm.) | (a) host the upstream HTML5 client as static assets behind our auth; (b) render with the client library inside a VibeSpace window type; (c) (a) first as a proving slice, then (b). | **(c).** (a) is the fastest way to learn whether the transport is good enough at 200 ms / 1 Mbps, which is the open question — but §4.2's reasons for refusing to embed upstream's dashboard apply here too (a whole app with its own controls inside ours, plus a known iframe `sessionStorage` restriction), so it is a proving slice and not the product. The window this design already specifies (§4.4: DPI-correct canvas, escaped titles, theme vars) is the shape (b) lands in. |
| **D22** | **When a session has ≥2 attachments, is the handle mandatory?** (§3.7 — "one session, one browser" is an implicit quantifier today.) | (a) mandatory: a bare command gets a named refusal listing every handle; (b) fall through to the default silently; (c) mandatory only for state-changing verbs, reads take the default. | **(a).** (b) is the machine that produces Q8's pain: a silent default resolution is the **only** way "the agent did the whole thing in the wrong profile" happens. (c) sounds gentler and is worse — it lands a `snapshot` and the `click` after it in **different** browsers, a failure shape no reader would ever imagine. The cost is 18 characters per command, and only on the sessions that really do hold several browsers. |
| **D23** | **What does a sub-agent get by default?** (§3.7 — VibeSpace does not spawn sub-agents, so we cannot hand them an environment.) | (a) its own ephemeral browser, minted as a child handle by `new-child`; (b) inherit the parent's default attachment; (c) nothing until the parent hands it a handle explicitly. | **(a).** The commonest use of a sub-agent is "go look this up", and putting it inside the parent's logged-in identity is the larger grant; the child lease hangs off the parent by prefix so the parent's teardown reaps it (§3.4). **But state honestly that (b) is today's physics**: a claude sub-agent shares its parent's process and environment, so "default (a)" is achieved by the sub-agent **calling the CLI once**, not by environment isolation — a sub-agent that never calls `new-child` is in fact in (b). The manual must say that in its first paragraph, and §3.7's exactly-one cell now says it **too** — it previously read "this is the default, and it is right", which blessed the very grant this decision argues against. One residual follows (§12.25): a sub-agent that never calls `new-child` acts inside the parent's logged-in identity, and **nothing in the product can currently detect or prevent it** — the server can see that a sidechain is open (`session._subNormalizers`), which is enough for a diagnostic aside on the refusal but not enough to be the refusal's **reason**. |
| **D24** | **How do a session's N browsers appear in the live view?** (§3.7.) | (a) one bound pane plus an in-window profile switcher strip (one owner badge per tab); (b) N side-by-side panes; (c) N separate windows. | **(a).** (b) is already refused by the measurement behind D19 — three panes are unusable at the width most people run, and here the third would halve it again. (c) throws away the very thing §4.6 exists for (an agent-driven browser must not lose its owner): three free windows, one user, and nobody knows which belongs to whom. The strip also gives something neither (b) nor (c) does: it **is** the list of "which browsers does my session have", which is Q7's question itself. |
| **D25** | **After the attachment set changes, is `profile_changed` a one-time refusal or a hint?** (§3.8's layer ①.) | (a) refuse once: the next bare command does not run and must be re-issued with a handle, after which the new default applies; (b) attach a line to the answer and let the command run; (c) hint on every command until the agent acknowledges explicitly. | **(a).** A hint stuffed into stdout only **hopes** the model reads it, and "it did not notice" is the entire reason this feature exists. (c) turns one mid-session pin into double the cost for every remaining command in the session. (a) costs exactly one round trip and buys a **structural** guarantee: the command that would have landed in the old profile did not run. |
| **D26** | **Does the amber chip's "remind it" spend a billed turn?** (§3.8's layer ③, the same class as D11/D16.) | (a) no — write `pendingNotice` and wait for the user's next message; (b) go through the delivery ladder under its own declared reason, because the click is an owner action; (c) push automatically whenever the session is stopped. | **(b), while (a) is what actually happens when the session is alive.** The chip turns amber exactly when "the agent is running, and on the wrong profile", and there `pendingNotice` suffices (the user is right there). Only a **stopped** session that the user clicks the button for needs a turn to wake it — that is a click with a per-occurrence owner action, exactly the thing CLAUDE.md's category excludes, but it still opens a billed turn, so it still passes the same ladder and the same ceiling under the declared reason `'browser-profile-notice'`. (c) is explicitly refused: that is a timed push with no owner action at all. |
| **D27** | **Which windows may a window target address?** (§4.9 — measured here: X11 enumeration cannot see Wayland clients, and GNOME's Introspect answers AccessDenied to us.) | (a) only the ones **we started** (applications under Xvfb+Xpra); (b) plus windows on the user's real desktop, behind an explicit switch; (c) neither. | **(a) first, with (b) as an explicit switch carrying its own consent.** Column (a) is green throughout §4.9's matrix, needs nobody's permission, and is the whole of the "an agent works in a native application" use case — the window the user is typing in right now is not in that use case. Every (b) row must be marked "this is your desktop", and its real barrier is not technical but §6.6's: a click there is a click in the user's real session. |
| **D28** | **Is a window target's PRIMARY observation channel the accessibility tree or pixels?** (§4.9 — measured here: AT-SPI available, 9 applications, ~1,800–6,100 nodes/s.) | (a) tree primary, pixels fallback; (b) pixels primary, tree as a hint; (c) pixels only (which is what Anthropic's computer use is). | **(a).** Not a preference — it is the rule this document has already written twice: talking to a tree beats talking to pixels (§4.7's conclusion, and Codex's own browser panel in §4.1). It also has two properties only (a) has: `Action.do_action` means **acting** needs no input injection either (so Wayland's "no global injection" does not reach it), and an audit line can record "clicked the button named Minimize" instead of "clicked (412, 88)". **But that first property must be stated at its measured scope**: `do_action` removes the need for injection only **for the subset of nodes that declare an action** (measured 2026-09-10: 66 of 503 nodes, and 6 of 43 `button` nodes), while `type` has its own condition (`EditableText`, 33/503) and `key` (a chord) has **no road on the tree at all**. So this decision is unconditional about the **observation** channel ("tree primary"); the action half splits into four answers per verb, written into §4.9's matrix and §5.1.1's capability table. (c) is the cell we **must** be able to degrade to (custom-drawn controls, canvases, images), so it is the fallback rather than the road. |
| **D29** | **Which road does input injection take on Wayland?** (§4.9 — the portal's RemoteDesktop interface is present here, `libei`/`libeis` 1.3.901 installed, `/dev/uinput` is 0600 with the module not loaded.) | (a) the RemoteDesktop portal (`ConnectToEIS` preferred), with `persist_mode=2` + `restore_token` remembering the grant; (b) ydotool/uinput, requiring ops to open up `/dev/uinput`; (c) neither — support only X11/Xwayland and our own nested X. | **(a), with (c) as the status quo until it is proven to work.** (b) is explicitly not recommended: it asks for a device node that can synthesise global input to be handed to this uid, a far larger grant than the feature itself, and it bypasses every consent mechanism the compositor has. (a) has a precondition that must be measured first — **our server runs under `systemd --user`**, and public reports record portal/D-Bus being denied in background contexts (§12). So P9's first task is to measure it; if it fails we land on (c), and (c) plus D28's `do_action` still covers a substantial share of actions. |
| **D30** | **Do we build window targets on a paired Mac?** (§4.9, §7.3 — macOS's two TCC gates.) | (a) no — the fleet story stays browser-only (§7.3 already decided this); (b) yes, through an agentd op using ScreenCaptureKit + AXUIElement. | **(a), with the reason written down rather than left blank.** Neither gate is "show one dialog": Accessibility requires the process to be **non-sandboxed and signed**, and Screen Recording on macOS 26 (Tahoe) is publicly reported to **require an app bundle** — a plain executable does not even appear in System Settings' privacy list, so it can neither be granted nor be granted-to (a computer-use project's public issue from 2026-01 records exactly this shape: windows missing from screenshots while ScreenCaptureKit returns a TCC error even with permission in the database). And VibeSpace's form on a paired machine is precisely a plain executable started by a daemon. So the first step of (b) is not code, it is answering "do we ship a signed app bundle on macOS" — a product decision, not this section's. |
| **D31** | **How many tiers of the access ladder do we ship?** (§7.6 — the owner's 2026-09-10 question: is agent-browser CDP, would a bank like Mercury detect it, do we also need a pure computer-use version.) | (a) ship tiers 1+2 only (CDP + fingerprint browser); (b) 1+2+3, with tier 3 after the window-target phase (P10); (c) tier 3 first — banks are the owner's actual case. | **(b).** Tiers 1 and 2 answer "this content site is blocked by an anti-scrape stack", a question CloakBrowser's free tier can answer, and they share **one CDP channel, one set of verbs, one profile model** — the increment is a single row in §7.1, which is exactly why they ship together. Tier 3 is different physics: no CDP, no element references, a different empty cell per platform (§4.9's matrix), and it **requires** §4.9's window targets plus D27's option (b) (the user's real desktop) — so folding it into P4 would double the length of an already least-certain phase. (c) is refused by this one thing: the first step on the bank road is not writing code, it is **measuring which tier 2–3 named sites actually fail on** (§12.36), and that measurement can be made today with no code at all. If they pass on tier 1, P10 drops to the bottom of the list; if they fail even on tier 3 (behavioural biometrics, §7.6), P10 should not be built either. **Measure first, then schedule** — the same rule D4 applies to CloakBrowser. |
| **D32** | **CloakBrowser's key: one team key from the cluster, or one per user?** (§7.5, and the "where the cluster can supply a default, supply one" half of the owner's 2026-09-11 directive — while this row is licensed **per concurrent session**.) | (a) only the user's own key; (b) the cluster injects a default key and the user may override it; (c) a cluster key with no override. | **(b), but the key the cluster injects is the **free tier**, and the seat display must say it is shared fleet-wide.** (b) is the same shape as Drive presets (`src/mounts.js:2189`) and the frp relay (`src/plugins.js:569`), and it is the half of the owner's directive that asks for a default. But it has a consequence **peculiar to an integration licensed per concurrency** that must be rendered rather than documented: the seats of a shared key are consumed by **every user on that default**, so one of A's browsers makes B's switch fail — while the keeper can only count **this instance** (§12.35: no vendor interface answers "how many seats is this key holding right now"). So the source chip reads "cluster default (seats shared with other users; N used on this instance)", and the advice at the ceiling is **switch to your own key** (one click, §7.5), not "ask the admin to upgrade the team tier". **Round 8 gives this recommendation one explicit precondition, because the previous version's advice pointed at a ceiling that is structurally unreachable in this very configuration**: when somebody else holds the shared key's seat, this instance reads "0 used / unknown total", the ceiling test never fires, and so "at the ceiling" **never happens** under a cluster default — what the user gets is an unnamed launch failure. (b)'s precondition is therefore §7.4's third named refusal `backend_seat_taken` (the keeper classifies a licence/concurrency launch failure, names the provider, says this key is the cluster default with fleet-wide seats, and offers the one click out), **not** a delegation to that local ceiling. It also owes §12.40's measurement. (c) is refused: a per-profile paid capability is not the admin's decision to make for the user, and the override is free — which is also why `useClusterDefault(id)` and `setIntegration(id, …)` are two separate actions. |
| **D33** | **What happens when you switch to a backend whose key is not configured?** (§7.4 / §7.5.) | (a) refuse loudly and open the Integrations card; (b) fall back to `chromium` silently; (c) fall back to `chromium` with an announcement. | **(a).** This is the same family as §7.4's "the binary is not installed" named refusal (`backend_no_key` beside `backend_unavailable`), and the Integrations card is the **actionable** way out — `app.openIntegration('cloak')`, one click, focused. (b) is refused explicitly: the user pressed "Open with CloakBrowser" precisely because `chromium` could not open it, so a silent fallback shows them the same failure again without telling them why — the textbook shape of this repo's no-silent-failures law. (c) sounds gentler and is worse: it spends a **billed turn** saying something to a user who is sitting in front of the screen (the D11/D16 test), and it still leaves them on the page that will not open. What keeps (a) from stinging is not the refusal but the fact that **the switcher says it before you click** (not configured = a row disabled with its reason plus a source chip, §7.1's capability-row discipline) — so the refusal is the last net, not the first. |
| **D34** | **May a key-bearing provider ever run on a machine other than this one?** (§7.5, §7.1's `keyScope` cell — D5's option (b) puts a keeper on a paired device, **in P4**, the same phase as this key half.) | (a) **Refuse** — a `keyScope: 'local-only'` provider is a row disabled with its reason (`provider_needs_local_key`) whenever `host != null`; (b) let the key travel through the daemon's existing **credential-material** channel (the sealed-orders shape, `src/account-material.js`). | **(a), and written into the capability table now.** This is not caution, it is **the only answer today's document supports**: §6.4 says verbatim that "provider auth keys live in the registry server-side", which (b) would make false on a remote profile; and §9's leg (ii) ("the spawned child's environment carries that vendor env name while its parent's does not") is an assertion that can only be made **in-process**, with no remote arm today. So landing (b) owes three things, none optional: **this decision row itself**, **a line in §6.4** saying when that key may cross the mux, and **a REMOTE arm on §9's leg (ii)** driven by a **real daemon**. Until all three exist, a vague default would let a plaintext key travel quietly — while (a) costs **nothing** in P4: the remote-browser story (§7.3, D5) already answers "a dedicated profile on that machine, logged in once by a human", which runs `chromium` or `cdp`, and both rows have `keyScope: none`. |
| **D35** | **Record the agent's action trace?** (Owner 2026-09-13: "for every agent browser session, record the before/after screen change (screenshots are enough) and the action position for every action the agent sends, so the user can review it later".) | (a) A setting, default ON: a before- and an after-JPEG per action + an action-position overlay + the command, kept per profile for 7 days or 200 MB whichever is smaller, expandable on the transcript tool card, a timeline in the live-view window; (b) default OFF, opt-in per profile; (c) positions only, no screenshots. | **(a).** It is the natural extension of D7's "one JPEG per action" — one more "before" frame and the click point / element box drawn on it keep the cost near zero, while the whole value of a review is "where did it click and what did the page become"; (b) leaves the first action that ever needs a review unrecorded; (c) is no review at all without the frames. Retention rides D8's sweep; frames go through §6's redaction hooks. |

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

Added in round 5, all of them consequences of this round's own three questions:

24. **Whether `--pin-tab` really lets N tabs in ONE browser be driven concurrently.** In §3.7's
    multi-attachment model, "one session holding two profiles" is two **browsers** (two processes,
    two CDP endpoints) and that half has no such question; the question belongs to its mirror —
    (1.b)'s "one profile driven by several sessions". The changelog says 0.34.0 fixes exactly
    "parallel sessions sharing one Chrome hijacking each other's tabs", but **whether concurrent
    commands are serialised by that daemon** I have not measured, and that is the whole of whether
    "two agents working inside one login at once" is fast. P1 measures it on the real binary.
25. **Sub-agent environment inheritance: read, not run.** A claude sub-agent is a same-process
    sidechain (`src/session-store.js:308`, `src/session-schema.js`'s `_subNormalizers`), a codex one
    is a thread its app-server owns, and a Background Work job goes through `jobEnv({…})` at
    `src/jobs.js:375` — all three are readings. D23's "default (a)" rests on the first, so P1 must
    actually spawn a sub-agent, run `vibespace-browser status` inside it, and check that the
    `AGENT_BROWSER_SESSION` it reports is the parent's. **And whatever that measurement says, one
    residual holds today**: a sub-agent that never calls `new-child` acts inside the parent's
    logged-in identity, and nothing in the product can detect or prevent it — the env and token the
    CLI receives are byte-identical to the parent's. The server can see that a sidechain is open
    (`session._subNormalizers`), which is enough for a diagnostic aside on the refusal (§3.7), but
    that aside carries the 60-second reap-grace race, so it is never the refusal's reason.
26. **The resource envelope of k browsers running at once, in the plural.** §1.2's per-instance
    numbers were taken on four **idle headless** leaks; this round only re-measured the capacity
    side (**2026-09-10: 80 of 128 inotify instances already held, 48 free**). There is not one
    number for the shape "one session, three profiles", and D13's proposed ceiling (8) was proposed
    under the single-attachment assumption.
27. **Whether the `profile_changed` refusal actually changes a model's behaviour.** The mechanical
    half is certain (the command **did not run**), but "so it re-issues with the handle" is a
    **prediction** about model behaviour. The manual and the refusal text must be written as one
    actionable sentence, and after P1 someone should read real sessions: did the re-issue that
    followed a refusal carry a handle?
28. **Xpra's control-channel command set.** The documentation has both
    `xpra control [CONNECTIONSTRING] command` (with `help` listing them all) and
    `xpra list-windows`, but **xpra is not installed on this box**, so what fields that road returns
    for window enumeration, and whether a window id can be acted on there, is entirely unverified.
    One of P9's first tasks.
29. **Whether the portal is usable at all from a `systemd --user` background service.** This box's
    portal **does** expose RemoteDesktop / ScreenCast / InputCapture (measured), `Start` is
    documented as "typically" presenting a dialog, and a public computer-use project reports
    **portal/D-Bus paths being denied in background/systemd contexts**. VibeSpace's server is
    exactly such a process. If this does not hold, D29 lands on (c) — so it must be measured before
    it is designed around.
30. **AT-SPI coverage on Qt and Electron: zero measurements on this box.** All nine applications
    measured are GTK/clutter/gjs; Electron typically exports a tree only when it detects an AT
    client, and `toolkit-accessibility` is `false` here (AT-SPI works anyway — which itself shows
    that switch is not a master switch, but what it means for other toolkits I did not test).
    §4.9's conclusion that the accessibility tree is the primary channel is **measured** for GTK and
    **inferred** for Qt/Electron. **And even on GTK, that conclusion's honest bound is a ratio
    rather than a "yes"**: walking all nine applications at 400 nodes each — 503 nodes — gives
    `Action` on 66 and `EditableText` on 33, while only **6 of 43 `button` nodes** expose `Action`;
    a breadth-first walk to a flat 600-node budget gives `Action` 52/600. These are numbers about
    **this desktop at this moment**, not a constant about GTK — which is why
    `test-window-target`'s `snapshot` leg reports its own interface census, so it can be re-checked
    on another desktop.
31. **The current shape of macOS's two TCC gates.** Accessibility requiring non-sandboxed + signed,
    and Screen Recording on Tahoe requiring an app bundle, both come from public documentation and
    a public issue from 2026-01 — **not from my own measurement on a Mac** (this box is Linux).
    D30's "no" therefore rests on second-hand evidence; if the owner wants to push (b), the first
    step is re-checking both on a real Mac.

Added in round 6, both of them consequences of this round's own changes:

32. **"A direct `agent-browser` command cannot reach a non-default attachment" is reasoning from
    construction, not a measurement.** §3.7's containment rests on the config in the session's env
    (variant D) or the symlink (variant C) naming only the default attachment's user-data-dir, with
    no other directory ever printed. That depends on `agent-browser`'s own configuration precedence
    behaving **exactly** as the documentation quoted in §1.1 describes — and §12.12 already lists
    `AGENT_BROWSER_CONFIG`'s exact semantics as unverified (whether "instead of the defaults"
    replaces the project-level file too, whether `extensions` still merge, is documented
    ambiguously). So P0 measures this alongside its commitment to variant D: stand up two
    attachments, run one direct command with the session's own env, and confirm the directory it
    resolves to is **exactly** the default one. If the precedence is not that, this half of the
    containment does not exist and I6 needs narrowing a second time — which is also why it is now
    worded "a command through our CLI" rather than "a command".
33. **Which AT-SPI binding the node side uses, and what it costs per node.** Every AT-SPI figure in
    this round (9 applications, ~1,800–6,100 nodes/s, 66/503, 6/43) was taken through `python3` +
    GObject introspection, i.e. through `libatspi`, and AT-SPI's D-Bus design names **caching** as
    one of its own design points. So those speed figures hold **for that road only**: speaking
    D-Bus from node directly (a generic client such as `dbus-next`) gets no such cache and the real
    per-node round-trip cost must be re-measured, while spawning a GI helper pays the fork tax §1.6
    already measures. No maintained node-specific AT-SPI binding was found this round, but "not
    found" is not "does not exist" (this repository has paid for that class of claim), so this is
    written as an input P9 must look up and measure rather than a question that already has an
    answer.
34. **The final heading of the shared Integrations & keys section.** This track is its **consumer**,
    and it is being written in the **same round** as this document. This version is aligned against
    `docs/design-communication-panel.zh.md` at commit `d02afcbb` on branch
    `design-communication-panel-r2`, where that section now reads `## 14. 集成密钥与配置界面`
    (round 7 read commit `14785475`, where it was still `## 13. 密钥、过期、失败`) — both documents
    are still on their own branches, so this heading is **still not final** and the section number
    may move again next round. So
    this document cites it by **module name** throughout (`src/integration-registry.js`,
    `src/server/integration-store.js`, `src/secret-box.js`, `resolveIntegration`, `publicView`,
    `app.openIntegration`) rather than by section number — **the names are the contract, the title
    is not**. If the two documents diverge on a name, the divergence is the defect, not a wording
    difference.
35. **Whether CloakBrowser exposes a "seats in use" query.** The public material says only that the
    package does **automatic license-plan detection** (a validated free key launches without user
    confirmation, and concurrent local free sessions are serialized), that the license key travels
    over three channels — `CLOAKBROWSER_LICENSE_KEY`, a `licenseKey` option, and
    `~/.cloakbrowser/license.key` — and that its format is `cb_…`. I found **no** interface that
    answers "how many seats is this key holding right now". So §7.4's seat display is **ours to
    count** (the keeper counts this instance). **Round 8 corrects this entry's second half**: the
    previous version said "the Test verdict can only give the tier plus one successful launch" — and
    round 8 removed that Test, because §7.5 sets `cloak`'s `test.kind` to `shape-only` (zero network:
    a launch-style probe would need the 200 MB binary and §7.2.1's recorded egress proof first, and
    neither should be triggered by opening a card to paste a key). **The tier therefore comes from
    the first real launch** (`cloakserve` reports its plan when the keeper starts it) and is
    **unknown** before that, which is why §7.4's seat display has three states. This is precisely why
    D32's "a shared key's seats are fleet-wide and the chip must say so" cannot be solved by a query.
    The `cloud:*` vendors may differ; also unverified.
36. **Which tier a named site actually fails on.** This round made no attempt against any real
    site — not tier 1, not tier 2, certainly not tier 3. All of §7.6's table is about **mechanism**,
    not a reading of any one site, and the owner's ask for "2–3 concrete failing sites" is the only
    input evidence can move on this whole ladder. **That measurement needs no code** (run the
    installed 0.32.0 by hand), so it belongs **before** P10 rather than inside it — D31's
    recommendation is built on this item.
37. **Whether `agent-browser-plugin-stealth` is a real published package.** In 0.32.0's README it is
    an **example**: the `launch.mutate` capability is real, documented and capability-gated
    (`--confirm-actions plugin:stealth:launch.mutate`), and the protocol request type is spelled
    out; but I did **not** verify on npm that an implementation by that name exists, and I ran no
    launch mutator. So §7.6 says "upstream has a first-class interface to hang one on", **not**
    "there is one available".
38. **What the cloud providers' `*_STEALTH` switches actually change.** `BROWSERLESS_STEALTH` and
    `KERNEL_STEALTH` are both in the installed binary's env table and its README (documented
    defaults `true` and `false` respectively), but behind them is each vendor's own implementation
    with no public specification, and I did not measure them. §7.5 therefore treats them as
    **fields** (a value a user or a cluster may set) and not as a capability promise — the mirror
    image of §7.1's "a capability a provider lacks is a field the UI reads": an **unmeasured**
    capability does not get into a caps row.
39. **Tier 3's end-to-end latency and success rate, zero measurements.** §4.9 already records that
    `xpra` is not installed on this box and that end-to-end latency was never measured; tier 3
    inherits that whole item and adds weight to it: a bank login is a run of short forms plus a
    very likely step-up, and this document has **not one number** for "one `do_action` to a visible
    change", let alone any measurement of **the user's own machine's** desktop stack (every figure
    in §4.9 comes from this one). So P10's first task is to measure it, not to build it, and P10's
    range (4–12, the widest in this document) is the price of that ignorance.
40. **What `cloakserve` actually returns when a free-tier key's one seat is held on ANOTHER
    machine.** The public material says only that "concurrent local free sessions are serialized"
    (§12.35) — a statement about **one machine**, while in D32's recommended configuration (the
    cluster injects one free-tier key) the other claimant is **in another pod**. §7.4's third named
    refusal `backend_seat_taken` keys its **criterion** on that answer: is it a launch failure, a
    silent serialized wait, does the error carry matchable words. The measurement needs **two
    machines and one free-tier key, and no code**, so it sits in P4's first actions; until it is
    taken, the classifier's criterion can only be "the launch failed and the error names
    licensing/concurrency", that sentence goes into the code comment waiting to be narrowed, and
    §9's leg pins the classifier's **shape** rather than the vendor's words.
41. **The exact vendor host behind each of the five `cloud:*` rows.** §7.5's egress declaration is a
    **rule** ("a runner may reach only the one host derived from its own row's fields"), and that
    rule can be written and enforced today; but three of the rows need a **constant**
    (browserbase / browseruse / agentcore by region), and this round did **not** verify those
    hostnames — doing so means reading those providers' implementations inside the installed binary
    or each vendor's documentation, and this document's discipline about third-party endpoints is
    "measure it or write it in this section". Two rows (`browserless` / `kernel`) need **no**
    constant at all, because their host **is** the `apiUrl` / `endpoint` the user typed — which is
    also why that declaration is a derivation rule and not a constant allowlist: **a constant table
    cannot express the right answer for those two rows.** The first implementation step is to read
    those three constants and put them in the registry rows, and because §9's leg (vi) asserts **set
    equality** it is sensitive to a wrong constant and explicitly fails on a missing one (a row
    whose host cannot be derived is a named refusal, never a "let us try the default host").
42. **Cross-document parity was checked by grep, not by a semantic tool.** This round re-checked
    §7.5's contract against the round-8 canonical copy at commit `d02afcbb` on branch
    `design-communication-panel-r2` (`resolveIntegration`'s return shape, `source` never being
    stored, the `clearUserValues` / `useClusterDefault` split, `setup` / `clusterKey` /
    `clusterOptions` / `testCaveat` in the `GET /api/integrations` payload, and the env-**NAME**
    census), and the method was **grepping identifier by identifier**: what that proves is that those
    names and those shapes are verbatim identical on both sides, **not that the two documents' prose
    says the same thing**. Another round on the canonical copy means another pass here — and the only
    thing that goes red by itself is the shared layer's own `test-integration-registry`, which scans
    **code**, not these two documents.

---

## Appendix A — sources

* **agent-browser**: the installed 0.32.0 build (`--help`, `skill-data/core/references/*`
  including `session-management.md`, `trust-boundaries.md`, `commands.md`, `proxy-support.md`),
  plus upstream `CHANGELOG.md`, `README.md` and the current `streaming.md` /
  `session-management.md` for 0.33.0–0.37.1. Apache-2.0, `vercel-labs/agent-browser`.
* **Round-5 sources (2026-09-10), for the owner's three questions:**
  * **XDG Desktop Portal** — the official `org.freedesktop.portal.RemoteDesktop` documentation: the
    method set (CreateSession / SelectDevices / Start / **ConnectToEIS** /
    NotifyPointerMotion(Absolute) / NotifyPointerButton / NotifyKeyboardKeycode /
    NotifyKeyboardKeysym / NotifyTouch*), the device bitmask (1 KEYBOARD / 2 POINTER /
    4 TOUCHSCREEN), absolute motion having to name a **PipeWire stream node**, `persist_mode`'s
    three values and the single-use `restore_token`, and `Start` "typically result[ing] in the
    portal presenting a dialog letting the user select what to share". Plus whot's write-up on
    libei's integration into the RemoteDesktop and InputCapture portals.
  * **Anthropic's computer use tool** — the official documentation: the current toolset
    `computer_toolset_20260801` (17 member tools including `zoom`), `computer_20251124` as the
    earlier beta version, **coordinates being screenshot pixels** with the caller mapping any
    scaling back, and the resolution guidance ("1024x768 or 1280x720 … avoid resolutions above
    1920x1080"); the documentation names **no** accessibility-tree channel — while the same
    vendor's browser use reads exactly that.
  * **OpenAI's ChatGPT desktop "Work with Apps"** — the official help centre: **for most apps it
    queries content through macOS's Accessibility API**, with a VS Code extension for VS Code;
    terminals contribute the last 200 lines of open panes and editors the full content of the
    foremost window's open panes up to a truncation limit; macOS only.
  * **Third-party Linux computer-use implementations** — cua's "Inside Linux computer-use"
    (AT-SPI 2 over D-Bus for the accessibility tree, keyboard moved from XSendEvent to **XTEST**,
    native Wayland still preview and lacking screen capture and AT-SPI parity, GTK3/GTK4/Qt5/Tk
    each needing their own text-input path) and `agent-sh/computer-use-linux` (MIT: the window
    enumeration ladder GNOME extension → GNOME Introspect → COSMIC → KWin scripting → hyprctl →
    i3 IPC → generic X11/EWMH; Wayland input preferring the RemoteDesktop portal and falling back
    to uinput; and an explicit note that **portal/D-Bus paths are denied in background/systemd
    contexts**).
  * **GNOME Shell Introspect** — `org.gnome.Shell.Introspect.GetWindows` returns AccessDenied to
    callers outside an allowlist of D-Bus senders (primarily the XDG portals), or unless the shell
    is in unsafe mode.
  * **macOS** — Apple's documentation: `CGWindowListCreateImage` deprecated since macOS 15,
    ScreenCaptureKit naming a single window through `SCContentFilter`, and
    `AXIsProcessTrustedWithOptions` prompting only when passed `kAXTrustedCheckOptionPrompt`; plus
    a computer-use project's public issue from 2026-01: on macOS 26 (Tahoe) a non-bundled
    executable does not appear in the Screen Recording privacy list, windows are missing from
    screenshots, and ScreenCaptureKit returns a TCC error.
  * **Xpra** — `xpra control [CONNECTIONSTRING] command` (with `help` listing them) and
    `xpra list-windows` are the documented runtime control surface; seamless mode presents "only
    the windows and features you choose to forward" to the client.
  * **This machine, read-only, 2026-09-10:** `XDG_SESSION_TYPE=wayland` with
    `Xwayland :1 -rootless`; `xwininfo -root -children` listing 19 X11 toplevels only; `gdbus`
    asking `Introspect.GetWindows` and getting AccessDenied; the portal exposing RemoteDesktop /
    ScreenCast / InputCapture / Clipboard; `libei.so.1` / `libeis.so.1` 1.3.901 and
    `/usr/libexec/gnome-remote-desktop-daemon` present; `/dev/uinput` at `crw------- root root`
    with the uinput module not loaded; `grim` present but failing on GNOME ("compositor doesn't
    support wlr-screencopy-unstable-v1"); `xdotool` / `wmctrl` / `xprop` / `xwininfo` / `Xvfb` /
    `ffmpeg` present and `xwd` / `import` / `ydotool` / `xpra` / `weston` / `cage` absent;
    `toolkit-accessibility` `false` while the AT-SPI registry is alive and reports 9 applications,
    with traversal measured at 24 nodes / 13 ms and 61 nodes / 10 ms (~1,800–6,100 nodes/s) and
    nodes declaring actions such as `click` / `window.minimize` / `clipboard.copy`;
    `fs.inotify.max_user_instances` = 128 with **80** already held by this uid; `~/.agent-browser`
    still 59 directories / 98 GB and `agent-browser --version` = 0.32.0.
  * **VibeSpace (round 5):** `src/session-store.js` (`isSubagentMessage`), `src/session-schema.js`
    (`_subNormalizers`), `src/jobs.js` (`jobEnv`), `src/lib/sidebar.js` (`LIVE_SESSION_FACTS` and
    its digest half), `src/session-status.js` (`pendingNotice`) and `src/agent-routes.js` (the
    prompt-context injection site).
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
  * **Round 7 sources (2026-09-11), for the owner's integration-key directive and Q10's detection
    ladder:**
    * **The installed agent-browser 0.32.0, binary and README, read-only** —
      `strings bin/agent-browser-linux-x64` yields the CDP surface (`struct CdpMessage` /
      `CdpReply` / `CdpError`, `Target.createTarget`, `Page.navigate`,
      `Input.dispatchMouseEvent`, `GetFullAXTreeResult`), the WebDriver backend that serves only
      iOS/Safari/Appium (`src/native/webdriver/{client,backend,appium,ios}.rs`),
      `--disable-blink-features=AutomationControlled` appearing **only** in the example text for
      `--args`, and the cloud providers' env names (`BROWSERBASE_API_KEY`, `BROWSERLESS_API_KEY` /
      `_API_URL` / `_STEALTH`, `KERNEL_API_KEY` / `_ENDPOINT` / `_STEALTH`, `BROWSER_USE_API_KEY`).
      Its README gives the plugin capabilities (`credential.read` / `browser.provider` /
      `launch.mutate` / `command.run`), the example plugin name `agent-browser-plugin-stealth`, the
      capability gate `--confirm-actions plugin:stealth:launch.mutate`, "agent-browser keeps browser
      automation, redaction-sensitive output, and policy enforcement in core", and the documented
      defaults of `BROWSERLESS_STEALTH` / `KERNEL_STEALTH`.
    * **`vercel-labs/agent-browser` issue #120** — "Feature Request: Add stealth mode via
      AGENT_BROWSER_STEALTH environment variable" (shkumbinhasani, 2026-01-15, still open): modern
      bot detection (Cloudflare / DataDome / PerimeterX / reCAPTCHA) checks far more than one
      signal, launch flags address "one detection vector", and the list of WebGL vendor/renderer,
      plugin and mime enumeration, Chrome runtime properties, and inconsistent feature detection.
    * **The state of CDP detection in 2026** — public analysis: a 2025 Chrome update altered the
      serialization path the classic `Runtime.enable` check observed so the getter stopped firing on
      current versions, while the rebrowser / Patchright generation of patches simply stops sending
      the command — that **one** signal is largely inert; what remains is protocol side effects,
      injected residue (`$cdc_`, `__playwright__binding__`), evaluation fingerprints, and absence
      patterns (with server-class rendering and datacenter network indicators).
    * **Bank-side device and behavioural intelligence** — one behavioural-biometrics vendor's
      2026-03 DeviceIQ launch material (naming the detection of device spoofing, emulators,
      **cloaked browsers**, jailbroken devices and data wiping; claiming continuous collection of
      3,000+ anonymized signals including keystroke and mouse activity and AI agent usage; more than
      30 of the world's largest 100 banks and 357 financial institutions as of 2026 Q1). **Used only
      to establish that this industry judges on device + behaviour + new-device step-up**, not as a
      reading of any named bank (§12.36).
    * **CloakBrowser's license channels** — `CLOAKBROWSER_LICENSE_KEY` / a `licenseKey` option /
      `~/.cloakbrowser/license.key`, format `cb_…`; 1 concurrent session on free, 5 / 20 / 200 /
      2000 paid; automatic license-plan detection and serialization of concurrent local free
      sessions. **No** seats-in-use query (§12.35).
  * **VibeSpace (round 7):** `src/ws-handler.js` (the DROP-list semantics of `AGENT_ENV_KEEP` /
    `AGENT_ENV_DROP` / `agentEnv()` and the comment above them naming the secrets helm injects,
    `:88-121`, exported at `:1657`), `src/mounts.js` (`drivePresets()` `:2189`, `_driveClient()`'s
    precedence `:2211`, the loopback paste-back flow `:2172-2183`, `_enc`/`_dec` `:369-382` and
    `.mounts-key` `:47`+`:360-367`), `src/plugins.js` (`_frpCfg()` `:569-580` letting a user override
    beat the cluster env, `fromEnv` `:686`, exposing only `hasToken` `:694`, default-enabled when the
    cluster injected `:584-589`), `src/lib/sidebar-mounts.js` ("Custom (own client id/secret)" and
    the `type:'password'` field, `:1750-1771`), `src/routes/persistence.js` (the `sensitive` list of
    `/api/config/export-info` `:679-686` and the ≥4-character passphrase gate `:708-712`),
    `src/lib/settings-schema.js` (`SETTINGS_CATEGORIES` `:935-948` — an `Integration` category
    already exists, a Browser one still does **not**),
    `deploy/helm/vibespace-user/templates/main.yaml` (the Drive presets' `secretKeyRef` shape
    `:159-170`, `VIBESPACE_PUBLIC_URL` `:172-176`).
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

---

## Appendix D — critique log (round 6)

An adversarial critic read round 5's revision and filed six findings. **All six are upheld**, each
checked against the source before anything was changed; what follows is the command that was run and
the answer it gave, because "verified" is a claim about what was run and not a feeling about a diff.
None was judged wrong, so this round has no rejected entry.

| # | Severity | Finding | Verdict | Where it landed |
|---|---|---|---|---|
| 1 | high | The anti-default-blindness mechanism lives entirely in `vibespace-browser`, while the design's **own default path is a direct `agent-browser` call** — so with ≥2 attachments a bare direct command silently resolves to the default, which is verbatim the failure Q8 names and the invariant I6 forbids | **UPHELD** | §2's I6 narrowed, §3.7 gains a row + both halves (the structural containment / the admitted residual), §3.8 layer ①'s header, §5.1, §9 `test-browser-handles`, §12.32 |
| 2 | high | The capability law is enforced for one verb (`click --at`), while two of the four action verbs have **no tree road at all**: `key` (a chord) has no AT-SPI primitive, and `click @ref` works only on nodes that DECLARE an action — measured, 52 of 600 nodes | **UPHELD** (re-measured here, and the finding gets stronger) | §4.9's action row split into **four**, a new coverage paragraph, §5.1.1's capability table, D28 narrowed, §9 `test-window-target`, §12.30 |
| 3 | medium | §3.7's sub-agent row contradicts D23 (the row blesses what D23 argues against), and it promises a refusal clause conditioned on a fact the section has just proved nothing can observe | **UPHELD** | §3.7's row rewritten + a new paragraph on the mechanism that could say it, D23, §12.25 |
| 4 | medium | "Zero new mechanism" is false: `pendingNotice` is a **single** typed slot with one hardcoded renderer whose sole consumer stops at the first hit, so two notices eat each other | **UPHELD** | §3.8 layer ② rewritten, §3.2.5 path 3, §10 P1's content line, §9 `test-profile-blindness` (fast) |
| 5 | medium | The prescribed `LIVE_SESSION_FACTS` row cannot carry the two values the chip compares; and if the value is the obvious object, the digest is a constant — the exact failure that paragraph invokes | **UPHELD** | §3.8 layer ③ rewritten (two scalars or a projecting digest, plus the general rule), §5.3, §9 `test-profile-blindness` (heavy, now a mutation leg) |
| 6 | low | The AT-SPI walk is placed in a **SHARED** module (which the daemon bundles) with no statement that it runs out-of-process or bounded; and every figure in this round was taken through a binding the design never names | **UPHELD** | §4.9 gains two paragraphs (bounded child / the binding decision), §3.6's routing row, §10 P9, §12.33 |

**Verification notes.**

* **Finding 1.** §3.2 says verbatim "no process of ours, no route, no daemon"; §5.2's first bullet
  says verbatim "an agent that never reads a word gets isolation from §3.2"; and §5.1 scopes the
  wrapper form to a subset of verbs (`close` / `close --all` / `connect` / `get cdp-url` plus the
  lease check) — the three sentences together mean `snapshot`/`fill`/`click` run as plain
  `agent-browser`. §1.4 records that `--session` and `--profile` are both per-invocation flags, and
  §3.2.5's path 1 records that "an already-spawned shell's environment is immutable". So layer ①
  cannot reach the direct path, and the hole is structural. This round splits it: the half that can
  be closed is closed (a non-default attachment's directory is minted by the server and never
  printed), and the remainder is admitted together with a narrowed I6 — an invariant that does not
  hold on the default path is a false sentence on the day it ships.
* **Finding 2.** Re-measured this round, and the numbers came out **stronger** than the critic's.
  The critic's `Component` 599 / `Action` 52 / `EditableText` 52 / `Text` 52 over a flat 600-node
  budget was **reproduced verbatim**. Re-walking per application at 400 nodes each (503 nodes over
  nine apps) gives `Component` 494 / `Action` **66** / `EditableText` **33** — and split by role,
  **only 6 of 43 `button` nodes expose `Action`**, i.e. the role an agent most wants to click is
  where the tree road is most often absent; a further **32 of the 66 actions have the empty string
  as their name**. The `key` half was checked too: `Atspi.generate_keyboard_event` and
  `generate_mouse_event` both exist, but they are **registry-level** device-event generators (XTEST
  on X11, i.e. injection), and the only key-related member of `Action` is `get_key_binding`, which
  is a **read**. The `type` half does have a tree road: `EditableText.insert_text` /
  `set_text_contents` (measured method names), conditional on the node exposing `EditableText`.
* **Finding 3.** The row's "this is the default, and it is right" disagrees with both the paragraph
  twelve lines below it and D23's recommendation; and `src/session-store.js:308`'s
  `isSubagentMessage` plus `_subNormalizers` confirm the same-process sidechain, hence that the CLI
  cannot tell callers apart. Rather than merely deleting the clause, this round adopts the mechanism
  the critic proposed: `src/server/stdout/claude-stream-json.js:288` creates the map and `:1065`
  reaps it after `task_notification` with a 60-second grace — so the server **does** know whether a
  sidechain is open, which is enough for a diagnostic aside, while that same grace period is exactly
  why it can never be the refusal's **reason**.
* **Finding 4.** Three readings, all verbatim: `src/session-status.js:110/125/141` make
  `pendingNotice` one slot of fixed shape `{agent, user, at}`; `:177–188`'s `renderNotice` is
  hardcoded to the status-override sentence; and `src/agent-routes.js:563–566` loops over two keys,
  consuming one and breaking. And this document already asks the same slot to carry a third producer
  (§3.2.5's `'browser-pin'`), so the collision is not hypothetical even within this one document.
* **Finding 5.** Verified in node: `(v) => v || ''` applied to `{active:'a',pinned:'b'}` and to
  `{active:'x',pinned:'y'}` yields `":[object Object]"` in both cases through
  `liveFactsDigestPart`'s `out += ':' + d(s[k])` (`src/lib/sidebar.js:96–103`) — byte-identical. The
  critic's point about the gate is equally right and matters more: **"neutral when they agree, amber
  when they do not" are two fresh renders and both pass under the bug**, so that leg becomes a
  mutation (change one value, assert the chip flips with no full rebuild) with the object digest as
  its negative control.
* **Finding 6.** §0 cites the law and §4.2 applies it to reject CDP screencasting, while §4.9 got no
  such treatment — although its own figures (one D-Bus round trip per node; 0.1–0.33 s for 600
  nodes) plus an application that stops answering (libdbus's 25 s default timeout) are precisely the
  shape of the outages the law was written from, and §3.6 lists `src/window-targets.js` as
  **SHARED**, so the daemon would take the block too. The binding half is equally right: Appendix A's
  own evidence line records that these figures were taken through `python3` + GI, which goes through
  `libatspi` and its AT-SPI cache — so they **cannot** be carried over to a hand-rolled node D-Bus
  client.

**What round 6 deliberately did not do.** It did not launch a browser (§12.1's reason still holds),
did not change any decision's recommendation (D23's and D28's **answers** are unchanged — what
changed is that each is narrowed to the scope its measurements support), did not move any phase's
round count (findings 2, 4 and 6 land inside the existing P1 and P9 content lines), and did not
soften any "what I could not verify" entry — that list grew from 31 to 33.

---

## Appendix E — critique log (round 8)

An adversarial critic read round 7's revision and filed eight findings. **All eight are upheld**,
each checked against the source before anything was changed — "verified" is a claim about what was
run, not a feeling about a diff. None was judged wrong, so this round has no rejected entry. **All
three `high`s land on the section round 7 itself had just written (§7.5)**, and that is a reading in
its own right: a freshly written section that casts itself as "the consumer of a shared layer" is
most likely to miss exactly **the things that layer requires of its consumers**.

| # | Severity | Finding | Verdict | Where it landed |
|---|---|---|---|---|
| 1 | high | §7.5's six rows declare a `test` with **no `kind`** (the shared layer's closed set), **no runner registration**, and bring in five third-party hosts nobody declared | **UPHELD** | §7.5 gains the Test-contract table + the runner registration + the egress declaration; `cloak` drops to `shape-only`; §9 `test-browser-providers` legs (v)(vi)(vii); §12.41 |
| 2 | high | The seat **total** has one source (a human Test click) which D32's recommended configuration guarantees never happens; no unknown state, no staleness rule | **UPHELD** | §7.4's seats become three states + `SEAT_TIER_STALE_MS`; the tier is read at the first real launch; D17, D32, §12.35 follow; §9 `test-browser-backend` gains the three-state and staleness legs |
| 3 | high | There are **three** failure modes: when a fleet-shared key's seat is held elsewhere the ceiling refusal is **structurally unreachable**, and the user gets an unnamed launch failure | **UPHELD** | §7.4 gains `backend_seat_taken` + the ceiling wording forked on key source; D32 carries it as a precondition; §12.40; §9 gains a leg |
| 4 | medium | §7.5's key rule is written for a local keeper while D5's option (b) puts a keeper on a paired device — **in the same P4** | **UPHELD** | §7.1 gains the `keyScope` cell; §7.5 gains a bullet (`provider_needs_local_key`); new **D34**; §9 leg (viii) |
| 5 | medium | §7.6 adds `tier` to `siteHints` while §3.3 and §9's gate both say "no second tier field" — the gate contradicts the design, and neither schema block was updated | **UPHELD** | §3.3's rule and both schema blocks change; §7.6's rule 2 narrows to "`tier` is legal only while `backend === null`"; `test-browser-tier3` and `test-browser-backend` assert that sentence |
| 6 | medium | Five of the six `consumers` cells name **the row itself**, so the shared layer's "a live file that really calls `resolveIntegration`" census is vacuous | **UPHELD** | §7.5's table takes the two real module paths + a paragraph on why all six are the same and why "§7.1's row" is right in prose and false in `consumers` |
| 7 | medium | `local-window` is treated as a provider one can "switch" to, though it has no `dir`, no seed and no CDP — the version ladder, the seed carry and P5's sweep are meaningless or dangerous on it | **UPHELD** | §7.1 gains the capability-cell table (`canSwitchTo` / `ownsDir` / `leaseKind`); §7.6 gains rule 3; `test-browser-housekeeping` gains the sweep-scope assertion |
| 8 | low | "the one channel of the three that does not hit disk" is wrong on its own terms (two do not), and by §6.5's threat model env is the weaker of the two | **UPHELD** | §7.5 states the real reason (`cloakserve` is a separate process ⇒ the in-process option is unreachable; a file would sit outside secret-box and outside the export passphrase gate) and accepts §6.5's boundary explicitly |

**Verification notes.**

* **Finding 1.** `grep -c 'registerIntegrationTest\|credential-exchange\|shape-only\|reachability'`
  over both documents returns **0** for each; `grep -cE 'browserbase\.com|browserless\.|api\.kernel|browser-use\.com|bedrock'`
  likewise **0**. The shared layer (`design-communication-panel-r2` at `696c38f8`, §14.2/§14.3) says
  verbatim that `test.kind` is a closed set and **derives the button's wording from it**, that "a row
  that declares a `test` without registering a runner is a dead control ⇒ the census goes red", and
  that "the store constructs no vendor request … this layer will not become a second file holding N
  vendor hosts" — where the *reason* for that last sentence is that the consumer has **already**
  declared its hosts. This track did neither. Separately §9's `test-vendor-whitelist` row states
  verbatim that it is an **Anthropic-only** source census, so it cannot catch those five hosts. And
  `cloak`'s Test carried two unstated preconditions (the 200 MB binary, §7.2.1's egress proof) on a
  card a user opens merely to paste a key.
* **Finding 2.** §7.4, verbatim: "the *total* (the tier) comes from the **Test verdict** of §7.5's
  registry row". `grep -n 'testedAt'` finds two occurrences, both beside that sentence — no second
  source, and no never-tested state. Meanwhile D32's recommendation is (b), the cluster injects the
  default key, which is precisely the case where a user has **no reason** to open that card. The
  shared layer's own §14.3 even writes "a `testedAt` does not stay green for ever … a verdict never
  outlives the reading it describes" — this section cited that layer without citing that rule.
* **Finding 3.** §7.4 itself says the *used* count is "**the keeper's own**" and that "the keeper can
  only count **this instance**, while the seats are shared across the whole fleet"; D32 recommends
  the cluster inject the **free tier** (one concurrent session). Put together: another pod holds the
  one seat ⇒ this instance reads 0/1 ⇒ the ceiling does not fire ⇒ the spawn proceeds ⇒ the user
  sees whatever `cloakserve` prints — while three paragraphs earlier §7.4 wrote "hide that, and the
  user spends an afternoon debugging a browser that appears to fail at random". D32's "at the ceiling
  the advice is switch to your own key" therefore pointed at a ceiling that is **structurally
  unreachable** in the configuration D32 itself recommends; and the existing ceiling wording ("name
  the profiles currently holding seats") **cannot even be composed** in the fleet case, because those
  profiles are not on this instance.
* **Finding 4.** §3.3's record: `"host": null, // null = this machine; else a hostId`; D5's answer is
  "**(b), in P4**"; §10's P4 lists the `browser-serve` device op and "§7.5's key-consumer half" in
  the **same cell**; and neither §7.1 nor §7.5 restricted `cloak` / `cloud:*` to `host: null`.
  §7.5's rule is written purely locally ("the vendor's own env name appears only in the environment
  of the one child **the keeper** spawns"), and §9's leg (ii) asserts "the spawned child's
  environment carries that vendor env name while **its parent's** does not" — an assertion only
  makeable **in one process**. So §6.4's "provider auth keys live in the registry server-side" is
  false for a remote cloak profile. This round picks (a) (refuse) and writes it as a capability cell,
  because (b)'s three debts are all unpaid today.
* **Finding 5.** §3.3's third bullet, verbatim: "**The tier is likewise not a new field**: it is
  derived from `provider` … storing it twice is building yourself a twin that will drift", while
  `siteHints` is a top-level key of **that same file** (schema at `.md:676` / `.zh.md:577`); §9's
  `test-browser-tier3` says verbatim "(there is **no** second `tier` field, §3.3)". Both schema
  blocks also still printed the old shape without `tier`, so the record shown to a reader was not the
  record §7.6 described. The fix is not to delete §7.6's field: all a **suggestion** can say is
  "change tier", and at that moment no provider has been chosen, so `backend` is `null` and `tier` is
  the only thing the claim carries. The rule therefore narrows to "`tier` is legal only while
  `backend === null`" and the gate asserts **that sentence** — a gate that contradicts the design it
  gates is the thing that is wrong.
* **Finding 6.** The six cells read verbatim "§7.1's `cloak` row" / "the `cloud:browserbase` row" …,
  identical in both languages; only `cloak` additionally named the keeper. The shared layer's §14.2
  requires "each name is a file that exists AND really calls `resolveIntegration('<id>')`", and its
  own example is file paths (`consumers: ['src/channels/lark.js', 'src/channels/live/lark.js']`). A
  name pointing at itself satisfies neither, and it cancels the field's stated purpose. This track
  has exactly two modules that call `resolveIntegration`, and §3.6's routing table already names
  both (`src/server/browser-backend.js`, `src/server/browser-keeper.js`).
* **Finding 7.** §3.3's `provider` now lists `local-window` among its legal values; §7.4 says "the
  backend is a property of the profile … a switch changes that field", and its machinery is "the
  version ladder, the seed carried across, the lease-driven tab re-open" — none of which has a
  subject on a provider §7.1 itself describes as "starts nothing" with "**none**" for CDP. §7.6's
  rule 2 also makes escalation to tier 3 "a **user act** with the notice", i.e. the switcher offers
  it. But a tier-3 target's state is in the user's own browser profile, not in the record's `dir`, so
  `fingerprintSeed`, `lastChromiumMajor` and §10's P5 sweep (all of which act on `dir`) are either
  meaningless or dangerous. §7.6's rule 3 therefore says escalation does **not** re-point an existing
  profile, and the capability cells turn those three "no"s into fields the UI reads.
* **Finding 8.** The cell read verbatim "we use **only** the env, the one channel of the three that
  does not hit disk". The in-process `licenseKey` option does not hit disk either, so the count is
  wrong; and this document's own §6.5 says a process under the same uid can read
  `/proc/<pid>/environ`, a boundary §7.5 itself re-states four bullets later — so the justification
  both miscounted and, on this document's own threat model, chose the weaker of the two non-disk
  channels. The real reason is sound and shorter: `cloakserve` runs as a **separate process** (§7.2's
  Docker/loopback shape), so the in-process option is not reachable from here at all.

**What round 8 deliberately did not do.** It did not launch a browser (§12.1's reason still holds),
did not change any decision's **recommendation** (D17's and D32's answers are unchanged — what
changed is that one of D17's two numbers was corrected at its source and D32 gained an explicit
precondition), did not move any phase's round count (P4 is still 10, **and the cell says why instead
of leaving it blank**: everything added is a clause inside things that cell already counts, and the
only genuinely new implementation is one helper inside a runner), and did not soften any "what I
could not verify" entry — that list grew from 39 to 41, and one of the new entries (§12.40) is
written into P4's first actions as a **zero-code** measurement, because the criterion of a named
refusal should not be my guess.

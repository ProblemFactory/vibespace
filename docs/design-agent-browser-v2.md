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
measurement (2026-09-10) sets the rule about who is allowed to spawn a process.

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
   option, and it costs two environment variables at spawn — no new process, no new daemon.
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

No browser daemon was running at the time of measurement — consistent with upstream's 1-hour
idle timeout — so the standing cost is disk, not CPU.

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
| I2 | Agents step on each other inside a shared profile | **A tab has exactly one owner at a time.** Opening, navigating and closing are scoped to your own tab; someone else's tab is not reachable by accident, and `close` never means "close everyone's". |
| I3 | The user can neither see nor intervene | **Whatever the agent is looking at, the user can look at too, through VibeSpace's own auth, and can take the controls with a visible, reversible mode change.** |
| I4 | (implied) Nothing owns the lifecycle | **Every browser process VibeSpace starts has a named owner, a bounded lifetime, a resource guard and a visible state.** |
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

### 3.2 Session model — the default costs two env vars

At spawn (`src/ws-create.js`, the same stanza that already sets `VIBESPACE_API`,
`CLAUDE_WEBUI_SESSION_ID` and the per-session `vsst_` token), a session with integration ON also
gets:

```
AGENT_BROWSER_SESSION=vs-<webuiId>
AGENT_BROWSER_NAMESPACE=vs-<webuiId>
```

That is the whole of I1. Two variables, no process, no route, no daemon. Every existing agent
habit (`agent-browser open …` with no flags) becomes isolated **without the agent knowing
anything**, because upstream reads both from the environment.

Why `--namespace` as well as `--session`: `--session` isolates the browser context;
`--namespace` isolates the **daemon socket and restore-state directory**. With both, one
session's daemon crash, `close --all`, or idle-timeout shutdown cannot reach another session's
browser. `close --all` — the command most likely to be typed by an agent tidying up — becomes
scoped to the caller by construction. This is the highest-value line in the design and it is
about five lines of code.

Why *not* upstream's `session id --scope worktree`: two VibeSpace sessions in the same worktree
would derive the *same* id and re-create the interference. Our identity is the conversation, not
the directory. Remote sessions get the same variables through the existing `envPairs` / `fsWrite`
paths that already carry `VIBESPACE_API`; integration-OFF sessions carry nothing agent-visible
and must carry nothing here either.

**Default profile behaviour: none.** A default session is *ephemeral* — no `--profile`, no
`--restore`. It dies with the daemon's idle timeout and leaves no cookie jar. An agent that
needs to stay logged in must ask for a profile, and asking is how VibeSpace learns the profile
exists.

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
    "createdAt": 0, "lastUsedAt": 0, "notes": ""
  }],
  "leases": [{ "profileId": "…", "sessionId": "…", "targetId": "…",
               "since": 0, "input": "agent", "viewers": 0 }]
}
```

Two rules about this file:

* **It is a registry, not a copy.** Cookies, storage and fingerprint material stay in the
  browser's own directory. Moving 98 GB is not a migration, it is an outage.
* **`id` is minted, `label` is free text.** The label never reaches a path, an argv, or a
  spawned command — the display-strings-never-reach-a-spawn law (a host-labelled cwd once did,
  which is why the law exists).

### 3.4 Lease semantics — I2, precisely

A **lease** is `(profileId, sessionId) → targetId`. It is created when a session attaches to a
profile and destroyed when the session ends or detaches.

* Attaching runs `--cdp <the profile's cdp url> --session vs-<webuiId> --pin-tab` and, if the
  session has no bound tab, `tab new`. Upstream then keeps the binding across commands and daemon
  restarts, and `data.targetId` is stable.
* **You may act only on your own tab.** With `--pin-tab`, acting after your tab was closed
  returns `tab_gone` with `data.targetId` — a typed error, not a silent adoption of the
  neighbour's tab.
* **`close` is redefined for shared profiles.** The wrapper CLI (§5) turns `close` into "close my
  tab and drop my lease", and refuses `close --all` on a shared profile with a message naming how
  many other sessions are attached. The underlying browser is stopped only by its keeper.
* **Input has one holder.** `lease.input` is `agent` or `user`. The live view's takeover flips it
  (§4.3). Two *sessions* never share a tab at all; a session and a *human* share one tab, and the
  lease says which of them is driving.

What the lease is **not**, honestly: with agents invoking the CLI directly, it is a cooperative
protocol, not a security boundary (§6.5, Decision D6).

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
* **Idle.** Delegate to upstream's own idle timeout for unattached browsers; a profile with at
  least one live lease sets `AGENT_BROWSER_IDLE_TIMEOUT_MS=0` and is stopped by the keeper when
  its last lease drops (plus a grace, so a session restart does not cost a cold browser).
* **Spawn hygiene.** `agentEnv()`-style sanitised environment; secrets (proxy password, provider
  license key) ride the environment or a file, **never argv** — argv is world-readable on this
  box and is exactly what the writer sweep reads.

### 3.6 Where each piece lands (CLAUDE.md's routing table, applied)

| Piece | Module | Tier | Gate |
|---|---|---|---|
| Registry schema, id/label validation, lease decisions, provider capability table, `browserEnvFor(session)` | `src/browser-profiles.js` | **PURE** (imports nothing) | `test-browser-profiles` (fast) |
| "What browsers exist / are running on this machine", version-floor probe | `src/browser-facts.js` | **SHARED** (the daemon bundles it) | parity suite — a one-sided edit fails it |
| Device op `browser-serve` (start/stop/status/cdp-url on a paired machine) | `src/agentd/agentd.js` handler + capability in the hello-ack + client method | **DEVICE** | real-daemon test; capability gate (an old daemon is never asked — unknown ops hang) |
| Keeper, routes, the WS bridge, access layer (`hostId` is a parameter) | `src/server/browser-keeper.js`, `browser-routes.js`, `browser-access.js` | **ORCH** | `test-browser-live` (heavy, real binary) |
| Live view window, profiles panel | `src/lib/browser-live-window.js` (+ `registerWindowType`) | **CLIENT** | headless-chrome leg |
| Agent CLI + manual | `data/bin/vibespace-browser`, `docs/agent/browser-manual.md`, `AGENT_TOOLS` | agent surface | `test-browser-cli` |

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
| **Take over** | yes | forwarded | refused with `browser_paused` | "You are driving — agent paused" |
| **Hand back** | — | — | — | transition, announced into the conversation |

* Taking over flips `lease.input` to `user`, and the transition is **announced into the
  conversation** as a system line ("The user took the browser controls"). An agent whose next
  command is refused must be able to read *why* without guessing — the `tab_gone` precedent: a
  typed, stable code beats a timeout.
* Handing back flips it to `agent`, announces "controls returned", and includes the **current
  URL** so the agent re-orients — the human may have navigated, logged in, or solved a captcha,
  which is the point.
* **Idle handback** after a configurable inactivity window, so a takeover somebody walked away
  from does not park an agent forever. Announced the same way.
* The **cursor identity** borrows Codex's idea: while the agent drives, the view draws a labelled
  agent cursor at the last CDP input coordinates; while the user drives, the user's own pointer is
  the cursor and the agent's is hidden. Two viewers watching one tab see the same picture.
* **Sensitive-action approval** rides upstream's own mechanism rather than a second one:
  `--confirm-actions <categories>` plus `confirm` / `deny`. A pending confirmation surfaces as a
  card in the live view *and* in the conversation, and either one can answer it.

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
vibespace-browser status                         # my tab, my lease, who holds input
vibespace-browser -- <agent-browser args…>       # run agent-browser with this session's flags
```

`use` prints (and can `exec`) exactly:

```
AGENT_BROWSER_CDP=<the profile's cdp url>
AGENT_BROWSER_SESSION=vs-<webuiId>
AGENT_BROWSER_NAMESPACE=vs-<webuiId>
```

plus `--pin-tab` supplied by the wrapper form, so an agent that already knows `agent-browser`
keeps every habit it has. The wrapper form (`vibespace-browser -- …`) exists for the three verbs
that need a policy decision (`close`, `close --all`, `connect`) and for the lease check.

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
  holds input.
* A ⚙ panel (or sidebar section): profiles, owners, last used, disk size, "stop", "forget", "open
  live view". The 53 unregistered directories from §1.2 appear here as adoptable candidates (§8).
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

### 6.3 Domain restriction, honestly

Because `--allowed-domains` refuses profiles / CDP / restore (§1.5), a persistent profile cannot
carry it. So:

* **Ephemeral sessions (the default) can and should use it** — that is the case it was built for,
  and it is the case agents hit most often: open a page, read it, throw it away.
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

If an agent runs `agent-browser --cdp <url>` by hand, it can drive any tab in that browser,
including during a human takeover. The lease is cooperative. Two honest positions:

* **Ship it cooperative** and say so in the UI ("agent paused" = a request the agent honours).
  Every VibeSpace agent surface today is cooperative in exactly this way.
* **Or mediate CDP** (Decision D6): the keeper hands each session a per-session CDP URL served by
  a small proxy that scopes `Target.*` to the leased target and refuses `Input.*` /
  `Page.navigate` while the user holds input. Real enforcement — and one more moving part on a
  latency-sensitive path.

Recommendation: cooperative in phases 0–5, with the proxy specified and gated behind D6.

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

## 8. Migration from the shared default profile

Nothing is deleted, and none of the 98 GB moves.

1. **Ship §3.2 first, alone.** New sessions become isolated. Existing running sessions keep the
   old behaviour until they restart. Interference stops accruing on day one, before any registry
   or UI exists.
2. **Adopt the default profile as a registry record** named "Shared (legacy)", `sharing:
   "instance"`, marked legacy in the UI. It keeps working; agents that explicitly ask for it get a
   pinned tab instead of a stolen one.
3. **Offer adoption of the 53 orphans.** The panel lists unregistered directories with size and
   last-use date; the user labels the ones worth keeping, and the rest are listed for deletion
   with their sizes shown. Deletion is a human act, never a sweep — a cookie jar is somebody's
   login, and this repository already has an incident where a pattern match killed a live session.
4. **Config file:** leave `~/.agent-browser/config.json` alone. `headed: true` on the desktop is
   the user's choice and the VNC path still works; profiles started by the keeper pass their own
   flags explicitly and never inherit the default `profile` key (the wrapper always passes one).
5. **Rollback** at every phase is "stop passing the env vars" / "stop the keeper". Every path
   falls back to today's behaviour structurally — the activation-switch discipline the three-tier
   campaign uses.

---

## 9. Gates

Each phase lands with its own suite, and the tier table in `scripts/ci.mjs` gets a row per suite
or the build census fails — a suite in no tier is a suite nobody runs.

| Suite | Tier | What it proves |
|---|---|---|
| `test-browser-profiles` | fast | PURE registry: id minting, a label never reaching a path, lease transitions, provider capability rows, `browserEnvFor(session)` for local / remote / integration-off. Negative control: a session with integration OFF gets **no** browser env. |
| `test-browser-cli` | fast | The wrapper's verb table, the `close --all` refusal on a shared profile, typed `browser_paused` / `tab_gone` passthrough, behaviour with no token or no API. |
| `test-browser-keeper` | heavy | Real `agent-browser` ≥ floor: reuse-or-spawn, adopt across a restart, park-with-a-reason on an unverifiable pid, runaway stop, clear-only-your-own-record. **Skips loudly, with evidence**, when the binary is absent or below the floor. |
| `test-browser-live` | heavy | Real browser + real stream + the real bridge: two sessions on one profile drive their own tabs and never each other's (the I2 proof, with a **pre-fix control that reproduces the hijack**), a viewer sees frames through cookie auth only, backpressure holds, takeover refuses agent input and handback restores it. Headless-chrome leg for the window at 375×667 and at a non-1 DPI zoom. |
| `test-architecture` | build | Tier edges: PURE imports nothing, SHARED never reaches up, the daemon bundle carries no orchestrator markers, `server.js` stays inside its size ratchet, every settings category renders. |
| `test-session-schema` | fast | Every new `session._field` (`_browserProfileId`, `_browserTargetId`, `_browserInput`) has an owner row. |
| `test-vendor-whitelist` | fast | No new vendor request is introduced. A browser *the user drives* is not a vendor call; a *provider* that phones home on a timer would be, and this suite is where that gets caught. |

Two suite-hygiene rules this feature is unusually exposed to, both already law here: **no
fast-tier suite may claim a machine-global name** (a browser wants a fixed port and
`~/.agent-browser` — use per-pid scratch paths and free ports), and **a suite that spawns a
browser owns its children's lifetime**, killing on exit *and* on timeout. The 2026-09-09 sweep
found 2089 leaked fixture processes, orphan chromes among them; a browser suite is the single
easiest way to make that worse.

---

## 10. Phased plan

One **agent-round** = ~1 h implementer + ~20 min adversarial verify (measured 2026-09-10 over 32
workflows / 130 agents). Calendar at **2 rounds/day**. Ranges reflect the measured convergence
spread: 14 of 32 workflows converged in one round, 8 needed 3–6.

| Phase | Content | Rounds | Days | Ships value on its own? |
|---|---|---|---|---|
| **P0 — Zero interference** | `AGENT_BROWSER_SESSION` + `_NAMESPACE` at spawn (local + remote paths), version-floor probe with an honest "your agent-browser is too old for shared profiles" notice, one line in the tools intro, `docs/agent/browser-manual.md`, `test-browser-profiles` (env half). | **3** (2–4) | 1.5 | **Yes — the whole of (1.b)'s "stop interfering" half.** |
| **P1 — Registry + keeper + lease** | `src/browser-profiles.js` (PURE), `browser-keeper.js`, `data/browser-profiles.json` + atomic writes + broadcast, `/api/browser/*`, attach/detach/lease, `vibespace-browser` CLI + `AGENT_TOOLS` + manual, migration steps 1–2. | **6** (5–9) | 3 | Yes — per-task profiles that concurrently coexist, with `--pin-tab` semantics. |
| **P2 — Live view** | `/api/browser/stream` bridge (+ backpressure), `browser-live` window type, multi-viewer fan-out, URL/tab/console panes, DPI-correct canvas, `test-browser-live`. | **6** (5–9) | 3 | **Yes — (1.c) minus the hands.** |
| **P3 — Takeover / handback** | Lease input holder, mode switcher, input forwarding, `browser_paused`, conversation announcements, idle handback, agent cursor, `--confirm-actions` cards. | **4** (3–6) | 2 | Yes — completes (1.c). |
| **P4 — Providers** | Provider rows + capability gating; CloakBrowser opt-in (free tier, loopback `cloakserve`, signature verification performed once by us); remote `cdp` provider over `tcpForward`; the `browser-serve` device op (three-touch rule) for paired machines. | **5** (4–8) | 2.5 | Yes — (1.a), and the fleet story. |
| **P5 — Recording + housekeeping** | Per-profile screencast opt-in, transcript thumbnails, retention sweep, profiles panel with sizes, orphan adoption (migration step 3). | **3** (2–5) | 1.5 | Yes — the transcript half. |
| **P6 — Hard mediation (optional)** | CDP-mediating proxy: target scoping + input refusal during takeover, per-session CDP URLs. Only if D6 says the cooperative lease is not enough. | **6** (4–9) | 3 | Only as enforcement. |

**Totals:** P0–P5 = **27 rounds ≈ 13.5 days**; with P6 = **33 rounds ≈ 16.5 days**.

Two things the measured data says about this schedule, stated so it is not read as a promise:
55 % of workflow wall time in the last sample had **no agent running** (concurrency cap, session
limits, serial integration), so "days" here is agent capacity, not elapsed time; and P2/P4 are the
phases most likely to land at the top of their range, because they depend on a third-party
binary's real behaviour rather than on our own code.

**Alternative order, if the owner wants value earliest:** P0 → P2 → P1 → P3. P2 can run against
upstream's per-session stream *before* the registry exists, because §3.2 already gave every
session its own browser — which puts "I can see what the agent is doing" in the owner's hands
about a week earlier. The cost is retro-fitting the profile selector into a window that already
exists: roughly one extra round.

---

## 11. DECISIONS FOR THE OWNER

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | **Upgrade `agent-browser` to 0.37.1?** The `--pin-tab` binding that makes shared profiles safe is 0.34+; installed is 0.32.0. | (a) upgrade and pin; (b) stay and ship P0 only; (c) vendor a pinned copy. | **(a) upgrade to 0.37.1 and pin it**, with the floor checked at runtime and a named degradation below it. Without it, (1.b)'s "several sessions, one profile" cannot be done safely and I would not build it. |
| **D2** | **Core-lazy or plugin?** | (a) core, lazy — nothing runs until a browser is asked for (the `vnc.js` shape); (b) a built-in plugin, default OFF (the `opencode-serve` shape). | **(a) core-lazy for the registry / keeper / view; plugin-style consent for CloakBrowser only.** P0 is environment variables, which must be on by default or they fix nothing; a third-party proprietary binary is exactly what a consent flow is for. |
| **D3** | **Default profile policy for a session that asks for nothing.** | (a) ephemeral, no cookies kept; (b) auto-create a per-session persistent profile; (c) keep today's shared default. | **(a) ephemeral.** Persistence should be a request, because a request is how the profile gets an owner and a label. (b) recreates the 53-orphan problem automatically, on a schedule. |
| **D4** | **Adopt CloakBrowser now, and at which tier?** | (a) free tier, self-hosted, opt-in per profile; (b) Solo $19/mo; (c) Team $49/mo; (d) not yet — human-login-through-live-view first. | **(a) now, free tier, credential-free profiles only** — it costs nothing and tells us whether the sites in question actually need it. Move to a paid tier only against a measured failure on a named site. Never the global default. |
| **D5** | **Does a browser ever run on a machine other than this one?** | (a) local only for now; (b) paired devices via the `browser-serve` op + `tcpForward` (P4); (c) cloud providers with API keys. | **(b), in P4, and only for machines already paired.** (c) puts a vendor key and every page we visit on someone else's infrastructure and deserves its own decision with its own §ban-safety review. |
| **D6** | **Cooperative lease or hard CDP mediation?** | (a) cooperative (agents honour `browser_paused`); (b) mediating proxy (P6). | **(a) first, (b) specified but unbuilt.** Every agent surface here is cooperative today; if a real incident shows an agent driving through a takeover, P6 is already designed. |
| **D7** | **Recording default.** | (a) off, opt-in per profile; (b) on for attached profiles; (c) thumbnails always, video opt-in. | **(c).** One JPEG per agent action is nearly free and makes the transcript useful; 30 fps video of a logged-in profile is a secret with a storage bill. |
| **D8** | **What happens to the 53 orphan profile directories (98 GB)?** | (a) list them, let the user adopt or delete; (b) auto-adopt all; (c) auto-delete anything older than N days. | **(a).** A cookie jar is somebody's login; a sweep that deletes one is the same class of mistake as the incident where a `(deleted)` match killed a live session. |
| **D9** | **Does the live view get its own window type, or a pane in the chat window?** | (a) window type `browser-live`; (b) a chat pane like Codex desktop's right-hand panel. | **(a) window type.** VibeSpace *is* a window manager; a window can be tiled beside the chat, moved to a desktop, opened on a phone and shared across clients — all of which the registry gives us for free, and none of which a chat pane does. |
| **D10** | **Keep the headed-browser-on-the-Wayland-desktop path?** | (a) yes, as a fallback for headed profiles; (b) drop it once P2 ships. | **(a) keep it.** It is the escape hatch when a stream cannot start, and it is how the machine's own desktop session gets debugged. It just stops being the only way to watch. |

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
   are checkable in an afternoon (strace on a throwaway profile, plus reading the wrapper), and
   that check is a P4 precondition, not an assumption.
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
   not the application. §4.3's idle handback is my addition, not something I observed.
9. **Remote sessions' env path for these two variables.** `envPairs` / `fsWrite` already carry
   `VIBESPACE_API` on ssh, dial and daemon-pipe spawns; I read the call sites but did not run one,
   so P0 must assert delivery on each transport rather than assume symmetry.

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
* **VibeSpace**: `src/vnc.js` and the `/api/vnc` bridge in `server.js`,
  `src/lib/desktop-window.js`, `src/lib/browser-window.js`, `src/lib/window-types.js`,
  `src/opencode-serve.js`, `src/port-forward.js`, `src/cli-identity.js`, `src/session-schema.js`,
  `src/lib/settings-schema.js`, `src/ws-create.js`, `data/bin/vibespace-page`, `scripts/ci.mjs`,
  and the machine-hygiene / fork-tax measurements of 2026-09-09..10.

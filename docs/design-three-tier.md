# Three-tier architecture: frontend / orchestrator / device layer

**Status**: APPROVED (2026-08-10) — rounds R0–R6 in progress. This is the formal design record;
requirement discussions happen outside this repository.
**Companion**: docs/design-cs-unification.md (the module-level migration ledger this generalizes).

## Summary

VibeSpace separates into three tiers:

- **F — frontend**: the browser bundle. Talks to one server WS/HTTP endpoint. Unchanged.
- **O — orchestrator** (`vibespace-server`): registries (accounts catalog, machines, task groups,
  layouts, settings), policy (billing selection, pool switch decisions, resume breakers), the
  permanent usage ledger + pricing + estimator, secrets-at-rest, the browser protocol, static
  serving, and a normalized transcript **mirror** + conversation-location **index** (so history
  stays readable when an owning machine is unreachable).
- **D — device layer** (`vibespace-device`): ONE codebase running on EVERY machine — including
  the server's own machine as **device #0** — owning all per-machine facts and execution:
  session lifecycle and persistence, transcript parsing, credential/login state, file
  management, usage fact collection. Transports (unix socket / ssh-stdio / ws dial; more can be
  added) live UNDER the device API: every transport carries the same ops.

The motivating defect class: per-machine logic living in the orchestrator forces twin
implementations (a local one and a remote one), and whoever fixes one never exercises the other.
Documented instances include a remote usage scanner that lagged its local twin for six weeks, a
resume-safety sweep that existed remotely but not locally, a session-naming rule that had
silently diverged between local and remote, per-CLI capability facts served from the wrong
machine, and an entire transfer-integrity bug class that exists only because multi-MB transcripts
cross the wire to be parsed centrally.

## Design principles

1. **Fat OWNERSHIP, thin daemon PROCESS.** The daemon keeps every live session pipe on its
   machine alive; nothing it does may ever endanger that. All heavy work (fs, discovery walks,
   JSONL parsing, usage scans) runs in daemon-side **worker threads** with deadline → terminate →
   respawn, behind the lean mux/pipe supervisor. The worker entry is **embedded in the single
   bundle** (`new Worker(__filename)` + role flag) — a second shipped artifact through the
   installer/versioned-dir/re-exec chain is a fleet-brick vector (the 2.185.2 class).
2. **"Local = device #0" means shared implementation, not mandatory socket transit.** One module
   behind `xFor(hostId)`: local callers invoke it in-process (no serialization tax on hot paths),
   remote callers over the mux. The remaining branch selects a transport for ONE implementation —
   exactly what the CS rule permits.
3. **Authority moves down; code stays shared.** The server keeps the shared parser as a library
   to read its mirror (dead-host read-only rescue and resume host-inference must survive machine
   loss). The daemon bundle is esbuild-built from `src/`, so daemon and server genuinely share
   modules; daemon self-upgrade ships device-layer code fleet-wide automatically.

## Device op families

All ops are capability-gated per-op via the hello handshake; consumers keep a per-op fallback
ladder (device op → legacy ssh script → honest named error). Legacy ssh scripts remain forever as
the bootstrap/rescue channel and for daemon-less ssh hosts.

| Family | Contents |
|---|---|
| `probe.*` | per-machine CLI facts (version, permission modes, effort levels, install layer), credential/login state (read-only), sysinfo, workflow state, pipe liveness (the daemon answers about its OWN registry), validated pid kill |
| `discovery.v2` | session claims computed on-device in a worker (lock matching, naming, tmux facts, codex metas, realCwd); the orchestrator passes its webui-pid map in and does only cross-machine merging |
| `usage.scan` | the shared ledger walker bundled into the daemon; NDJSON usage events over count-gated byte channels; device-side byte cursors; attribution applied at ingest — one ingest pipeline for local and remote |
| `transcript.*` | attach / gap / turnmap / streaming search / task state, parsed in daemon workers **where the bytes live**; the wire carries parsed results (KB), not raw multi-MB files |
| `session.events` | typed push stream: id adoption, usage records (carrying both request-id and message-id), limit banners, permission-mode acks, streaming labels, served-model changes, todos, tool progress, subagent lifecycle |
| `session.open/kill` | abstract session spec (backend, mode, cwd, resume/fork, account descriptor); the device resolves binaries, composes persistence, sanitizes env, injects the statusline; `place-secret` is the one 0600-file + `$(cat)` secret channel on every transport |

## Account management split

Credential **material** and login **lifecycle** belong to the device tier: each machine's CLI
login, held credential directories, token refresh (done by the CLI on that machine, under its
own locks), and platform keychains already live wholly on their machines. The server-machine's
credential directories (`data/subs/`) are properly understood as **device #0's account store** —
the server machine is not special.

The orchestrator keeps:

- the **catalog** (known identities, display names, per-machine availability — UI state, no
  credential material),
- **initial distribution** (user-entered API keys and minted long-lived tokens are encrypted at
  rest in the server vault and placed onto machines via `place-secret`; one-time subscription
  shipping stays opt-in and off by default),
- **selection policy and statistics** (which account a session bills to; pool switch decisions;
  ledger aggregation, per-request attribution).

The orchestrator's ongoing involvement is "decisions and descriptors only, never material".

### Pool management

Decision = orchestrator; execution = device; plus a **sealed-orders emergency reflex**:

- The switch decision needs cross-machine member quota states, weekly reset deadlines, and the
  learned consumption model — only the orchestrator has these.
- The mechanical act (re-pointing the credential symlink) happens on the machine holding the
  directories.
- After every evaluation the orchestrator pushes the pool's ranked member snapshot (a few hundred
  bytes) to the holding device. The device executes a local fallback switch ONLY when it both
  observes a hard limit banner locally AND cannot reach the orchestrator, reporting the event on
  reconnect (time-based ledger attribution reconciles). Policy remains single-brained: outside
  that double condition the device never acts on its own.

Latency analysis: historical near-misses in pool switching were caused by missing **signal
sources**, never by decision placement; the event-driven path runs in 1–6 s and remote transport
adds ≤0.3 s. Proactive switching (act while meaningful headroom remains) makes decision timing
non-critical by design.

### Quota refresh origin

The human-gated on-demand quota refresh is issued **by the machine that holds the login**
(decision 2026-08-10): the token is then used from the same IP its CLI sessions use, removing a
token-appears-from-a-foreign-IP signal. The safety law is therefore a **whitelist**: the ONLY
device op that may reach the vendor API is the human-gated, throttled read-only quota query;
credential probes never refresh tokens; nothing else on the device protocol may originate a
vendor call. A guard test enforces the whitelist structurally.

### Cross-device usage aggregation

- **Quota readings** are global per-account facts and already merge across sources keyed by
  identity (org uuid > lowercased email > account id).
- **The ledger** is per-machine-bucketed today (a remote machine cannot attribute requests to
  accounts); in the target state device-reported usage events carry account attribution from the
  spawn descriptor, so per-account cost coverage approaches completeness and the learned-rate
  mechanism demotes to covering out-of-management consumption.
- **Device-offline bias**: complete coverage creates a new fragility — the learned rate falls to
  ≈1× (it no longer compensates for invisible spend), so an ACTIVE device going offline means
  missing cost and an UNDERestimate (the dangerous direction: late switches). Mechanisms, all
  generalizations of existing guards: per-source watermarks with offline-vs-idle distinction
  (link state is known); uncertainty-widened estimates with pessimistic-edge pool decisions
  while an active source is dark; reconnect backfill inserted in source-timestamp order and
  never treated as freshest (the stale-reading poisoning class); anchor pairs spanning an
  offline gap excluded from rate learning. Anchors are cross-machine redundant: any machine's
  reading of the same account re-anchors the identity stream, so the bias window ends at the
  next ground truth from ANY source, not at the device's return.

## Prerequisite: content-derived message ids (R0)

Message ids are currently per-normalizer counters, so every parser rebuild renumbers and forces a
full client view reset. Daemon self-upgrade restarts are routine, so device-side parsing is
impossible until ids derive from content: `mid = sessionId + ':' + (uuid || message.id ||
hash(record))`. Then a device-parsed history and a server-parsed live stream merge by
construction (dedup by id across producers) — the transition needs no flag day. Independent
value: server restarts stop renumbering. Pinned risk: placeholder uuids and pre-uuid records must
hash identically across transports or messages double-render.

## Rounds

| # | Round | Contents | Retires / unlocks |
|---|---|---|---|
| R0 ✅ 2.280.0 | Message ids | content-derived mids, server-only, soak | prerequisite for all device-side parsing |
| R1 ✅ 2.281.0 | Machine facts | `probe.*` family (`src/machine-probes.js`); hosts consume op-first, local calls in-proc | probe twin-scripts demoted to fallback |
| R2 ✅ 2.282.0 | Worker isolation | embedded worker tier (FS_ACTIONS single object); fs-ops through it with deadline/terminate/respawn; loop-lag canary; hang-isolation proven on a real FIFO wedge | unlocks file-ops unification and all later heavy ops |
| R3 ◐ steps 1–2 = 2.283.0/2.285.0 | Transcript service | extract the parse stack behind one interface (pure refactor — DONE: src/transcript-service.js, HTTP read family rerouted) → daemon-hosted `transcript-op` dark + byte-identical parity suite (DONE: scripts/test-transcript-parity.mjs, 19 asserts incl. multi-window payloads and the huge-file seek family) → remote reads switch. Replacement substrate (mirror + location index) proven BEFORE the raw remote cache demotes to fallback | the slab-sync integrity class; faster remote history |
| R4 ◐ steps 1–2 = 2.286.0/2.287.0 | Usage + events | walker into the daemon (DONE: `src/usage-walker.js` bundled, `usage-scan` op in a child process, two-phase cursor commit, per-op capability gating via hello `capabilities`) → push-triggered harvest (DONE: daemon transcript-dir watch incl. codex → debounced dirty → server harvest kick + discovery invalidation; ~1min ledger freshness for any remote activity) → codex rollouts in all three walkers (DONE — the remote codex coverage gap closed) → full `session.events` typed stream; local double-feeds during cutover (id dedup makes overlap harmless) | remote live-estimate gap; the shipped scanner and its parity test |
| R5 ◐ steps 1–2 = 2.288.0/2.290.0 | Discovery | snapshot walk moved into a daemon child (loop never blocks on a slow home fs) → claim algorithm extracted to `discovery-facts.interpretDiscoveryLines` (DONE: one shared impl, golden-fixture test) → on-device claims (`discovery.v2` op, dark + parity) → local discovery harvests device #0 behind a flag once poll latency is proven | the ssh discovery script (to fallback) |
| R6 | Session ownership | local creates via device #0 `session.open`; adoption-based — existing sessions stay attachable forever, nothing force-migrated | the local-dtach special path |
| — | Session brain | device-side live stdout parsing + buffer ownership + spawn resolution | a separate campaign; the above is its prerequisite |

## Risk register

- **SPOF inversion**: today a server crash leaves sessions alive; a daemon crash takes a
  machine's session pipes. Mitigations are structural: heavy work only in killable workers;
  OOM-priority inversion in fleet containers (the kernel should prefer killing the restartable
  server); hard worker heap bounds; staged rollout + versioned-dir rollback + upgrade drain.
- **Version skew**: per-op capability gating with per-op fallback (never per-host); a lagging
  daemon loses features loudly, never silently.
- **Retirement-order law**: a legacy path dies only after its replacement has survived a full
  release exercising the rescue paths, and a forced-fallback smoke keeps the fallback exercised
  (fallbacks drift too).
- **Vendor-call surface**: the whitelist above, enforced by a guard test.
- **WAN paging latency**: slab loads move from local-fs seek to a WAN round trip on dialed
  devices; prefetch + immutable-slab caching absorb it; first-open latency improves massively
  (parsed KBs instead of raw MBs).

## Enabled later

Multiple servers orchestrating one device (the daemon is already multi-server); peer-to-peer
instance pairing as "a server is another client of the device protocol"; per-machine capability
honesty everywhere.

## Repository hygiene rule (2026-08-10)

Formal, neutral design records belong in this public repository. Requirement/communication
notes, personal identifiers (local usernames, home paths, machine names), and
organization-specific details do not — they live in private notes outside git. The push guard's
external denylist enforces this for future commits.

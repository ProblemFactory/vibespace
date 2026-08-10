# Three-tier architecture: frontend / orchestrator / device layer

**Status**: DESIGN — awaiting owner go/no-go per round. Produced 2026-08-10 from a 9-agent
inventory+design pass (6 line-anchored responsibility readers over server.js / ws-handler /
transcripts / device layer / accounts+usage / files+discovery, then 3 independent architecture
proposals — purist, incremental, data-plane-first — which **converged on the same verdict**).
Companion: docs/design-cs-unification.md (the module-level campaign this generalizes).

## The owner's question (verbatim intent)

> 要么服务端和设备端是同一套代码，要么服务端只负责对设备端暴露的数据的编排，所有 session 管理、
> 聊天记录解析、登陆状态管理、文件管理 API 等等功能都应该在设备端，然后本地和远端设备共用同一套
> 代码（底层传输可以支持 ssh，ws，socks 等）。

## Verdict

**The fat-device model is right — as the end state.** The incident history proves the diagnosis:
essentially every recurring defect class is per-machine logic living in the orchestrator —
twin-set drift (usage scanner lagged 6 weeks; probe scripts vs local probes behind the
2.186.7/2.188.0 same-dialog contradictions), local-only feature gaps (writer sweep, tmux
classification, live odometer, remote codex usage invisible), wrong-machine facts
(`/api/session-options` serves the LOCAL `claude --help` to remote sessions), and the whole
slab-sync integrity class (2.187.0/2.188.1) that exists only because 45MB transcripts cross the
wire to be parsed.

The "either/or" in the question resolves as **both, one per layer**:

- **"同一套代码"** is true at the *module* level and already mechanically proven: the device
  daemon is an esbuild bundle over `src/` (discovery-facts precedent), device #0 = same
  binary/mux/ops, and self-upgrade ships device code fleet-wide for free — the strongest
  practical argument for the model.
- **"服务端只负责编排"** is the end state for *authority*: the server keeps registries
  (accounts/hosts/task-groups/layouts/settings), ALL policy (billing pick, pool EDF engine,
  model-lock repin, resume breakers, multi-client size-min), the permanent ledger + pricing +
  estimator, secrets-at-rest, browser protocol, frontend serving. It stops walking `~/.claude`,
  stops spawning CLIs directly, stops parsing transcripts as its primary role.

### Three amendments (all three designs demanded them independently)

1. **Fat OWNERSHIP ≠ fat daemon PROCESS.** The daemon's prime invariant — nothing it does may
   ever kill a session pipe — survives only if ALL heavy work (fs, discovery walks, JSONL parse,
   usage scans) runs in daemon-side **worker threads** with deadline → terminate → respawn,
   behind the lean mux/pipe supervisor. The worker entry is **embedded in the single bundle**
   (`new Worker(__filename, {workerData:{role:'worker'}})`) — a second shipped artifact threaded
   through installer/versioned-dir/re-exec is a fleet-brick vector (the 2.185.2 re-exec-argv
   class). This worker tier is also the unlock for the file-ops CS exception.
2. **"local = device #0" means SHARED IMPLEMENTATION, not mandatory mux transit.** One module
   behind `xFor(hostId)`; local calls it in-process (no serialization tax on the hot paths —
   attach, 5s discovery poll, slab seeks), remote calls it over the mux. The remaining branch
   selects a *transport* for ONE implementation — exactly what the CS rule permits. Forcing
   local reads through the daemon socket buys protocol purity at real latency cost and a
   daemon-restart blast radius for zero correctness gain.
3. **The server keeps the shared parser as a LIBRARY** to read its normalized MIRROR — dead-host
   view-only rescue (2.217.0, lengyue ×12) and resume host-inference (2.218.0) must keep working
   when the owning machine is unreachable. Authority moves; code residency is shared.

## Target architecture

```
┌──────────── F: browser ────────────┐
│ bundle.js — UI only; talks ONE ws  │
└────────────────┬───────────────────┘
┌────────────────┴───────────────────┐
│ O: vibespace-server (orchestrator) │  registries · policy · billing/pool · ledger+pricing
│  - browser ws/http, auth, static   │  secrets-at-rest · telemetry agg · normalized MIRROR
│  - composes N devices' facts       │  + conversation-location INDEX (dead-host rescue)
└──┬──────────┬──────────┬───────────┘
   │ in-proc  │ mux/ssh  │ mux/ws-dial        ← transports UNDER the device API
┌──┴────┐ ┌───┴───┐ ┌────┴──┐
│ D #0  │ │ D ssh │ │ D dial│   D: vibespace-device — ONE codebase everywhere
└───────┘ └───────┘ └───────┘
  CORE  = mux + transports + pty/pipe session registry + self-upgrade (lean, unchanged discipline)
  WORKERS = fs pool · transcript service · discovery sweep · usage walker · creds probes
            (embedded Worker(__filename) role; deadlines; terminate/respawn)
  CHILDREN = pty-wrapper/chat-wrapper (battle-tested; parse crashes can never touch claude)
```

**Device op families** (all version-gated via hello `caps`; per-OP fallback ladder: device op →
ssh script → honest named error; ssh scripts survive forever as the bootstrap/rescue channel):

- `probe.*` — probe-cli (THAT machine's `claude --help` facts: permModes/effortLevels/
  supportsName/installLayer), probe-creds (read-only, never-refresh), probe-sysinfo,
  probe-workflow-state, pipe-liveness (daemon answers about its OWN registry, exec-proof
  startTime), kill-agent-pid (validate-then-SIGTERM on the pid's own machine).
- `discovery.v2` — snapshot returns CLAIMS (claimJsonls + naming + tmux facts + codex metas +
  realCwd computed on-device in a worker); orchestrator passes the webuiPid→sid map in.
- `usage.scan` — the shared walker bundled (claude subagents/workflows AND codex rollouts —
  closes the remote-codex gap); NDJSON over count-gated byte channels; device-side byte cursors;
  attribution applied at INGEST (ingestRemoteEvents becomes THE ingest, local and remote alike).
- `transcript.*` — attach/gap/turnmap/search-stream/taskState served from daemon workers at the
  data; `session.events` — typed push stream (id-adopted, usage-record carrying BOTH rid and mid
  — the 2.267.3 join rule, limit-banner, perm-mode ack, streaming-label, served-model/fallback,
  todo, tool-progress, subagent lifecycle).
- `session.open/kill` — abstract spec (backend, mode, cwd, resume/fork, account DESCRIPTOR —
  never server-local paths); device resolves binaries, composes persistence, sanitizes env
  (incl. the CLAUDE_CODE_CHILD_SESSION strip), injects the statusline; `place-secret` = the one
  0600-file + `$(cat)` channel on every transport.

## The enabling prerequisite (ships FIRST, alone)

**Content-derived message ids**: `mid = ${sessionId}:${uuid || message.id || hash(srcLine)}`
replacing the per-normalizer counter. Without it, every daemon self-upgrade re-exec (ROUTINE,
2.185.2) renumbers and full-resets every open chat fleet-wide. With it, a device-parsed HISTORY
and a server-parsed LIVE stream **merge by construction** — the transition can straddle machines
with no flag-day. Independent value on day one: server restarts stop renumbering (`_normEpoch`
demotes from load-bearing to belt). Risk to pin in tests: placeholder uuids (…-000000000001) and
pre-uuid records must hash STABLY across transports or messages double-render.

## Rounds (each independently shippable; product works throughout)

| # | Round | Contents | Unlocks / retires |
|---|-------|----------|-------------------|
| R0 | Message ids | content-derived mids, server-only, soak | prerequisite for ALL device-side parsing |
| R1 | Machine facts | `probe.*` family; hosts.js + accounts.js consume op-first (device #0 included) | retires probe twin-scripts; fixes session-options wrong-machine facts |
| R2 | Worker isolation | embedded worker tier + fs-op through it + loop-lag canary | THE unlock: file-ops exception, all later heavy ops |
| R3 | Transcript service | extract `src/transcript-service.js` (pure refactor) → daemon-hosted ops DARK behind flag → byte-identical parity → remote reads switch. **Replacement substrate BEFORE retirement**: conversation-location index + normalized mirror proven, THEN data/remote-jsonl demotes to fallback | retires slab-sync class (2.187.0/2.188.1); WAN seeks need prefetch |
| R4 | Usage + live events | walker into daemon; `session.events` streams; noteLive/kickPoolEval/markLimitBanner consume; local double-feeds during cutover (rid/mid dedup makes overlap harmless) | closes remote-odometer + remote-codex gaps; retires shipped usage-scan + its parity test |
| R5 | Discovery on-device | snapshot+claims in worker; local /api/sessions harvests device #0 behind flag (5s-poll latency proven first) | retires ssh discovery script to fallback |
| R6 | Session ownership | local creates via device #0 open-session/open-pipe; **adoption-based** — in-field dtach/keeper sessions stay attachable forever, nothing force-migrated | retires the local-dtach special path |
| — | Session brain | device-side stdout parsing + buffer ownership + spawn/billing resolution | a SEPARATE campaign; everything above is its prerequisite |

## Risk register (binding mitigations)

- **SPOF inversion**: today a server crash leaves dtach sessions alive; a daemon crash tomorrow
  takes every session on the machine. Mitigations are structural, not aspirational: nothing
  heavy on the daemon main loop (workers only), OOMScoreAdjust inversion in the fleet container
  (the kernel must prefer killing the restartable server), hard worker heap bounds, staged
  rollout + current-symlink rollback + upgrade-drain (finish in-flight ops, never kill pipes).
- **Version skew**: per-OP caps gating with ssh fallback (never per-host); a lagging daemon
  loses features loudly, never silently (walter's offline-after-update class).
- **Retirement order law**: a legacy path (remote-jsonl cache, ssh scripts, keeper) dies only
  AFTER its replacement survives a full release exercising the rescue paths — and keeps a
  forced-fallback smoke so the fallback cannot rot (the 6-week-drift lesson applies to our own
  fallbacks too).
- **§ban-safety multiplication**: creds logic on N devices instead of one audited server. Law:
  the device protocol contains NO op that originates an Anthropic call (probe-creds is
  read-only-never-refresh); enforced by a grep-class guard test, not review vigilance.
- **Byte-channel discipline**: every streamed op resolves on COUNTED BYTES, never a control-done
  (2.187.0); one shared gated-channel helper, mandatory for new ops.
- **Overlay seam** (R3): the 2.74.0 position-preserving merge stays single-implementation inside
  the service; callers ship their stdout-buffer tail until the session brain moves.

## What this makes possible later

N servers orchestrating one device (the daemon is already multi-server); peer-to-peer instance
pairing (B-9069) as "a server is just another client of the device protocol"; browser-direct
device links for LAN latency; per-machine capability honesty everywhere (each machine's own CLI
facts, login state, quota).

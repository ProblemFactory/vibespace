# Design: Remote C/S Architecture (远程常驻 agent daemon)

Status: APPROVED direction, pre-implementation blueprint + progress anchor. Decisions
settled with the user 2026-07-13 (chat session 9f4cd444; backlog item **B-55e2**).
Supersedes the ssh-pipe-per-capability model for daemon-equipped hosts; the 2.124.0–2.127.0
transitional layer (keeper / reconnect / keepalive / harvest) remains the design's proven
seed — the daemon GENERALIZES it, it does not discard it.

## 1. Problem

Today every remote capability is its own bespoke ssh plumbing:

| capability | mechanism today |
|---|---|
| remote chat session | local chat-wrapper → `ssh -T` → remote keeper daemon → claude |
| remote terminal | local pty-wrapper → `ssh -t` → remote `dtach -A` → CLI |
| session discovery | per-poll ssh shell script scanning `~/.claude` (claude ONLY), 15s cache |
| agent tools / API | per-spawn tar over ssh stdin + per-session REVERSE TUNNEL (random port 20000-60000) |
| file ops | ssh-per-op (remote-fs.js), ~50ms each even with ControlMaster |
| usage ledger | per-open ssh harvest scanner (15min throttle) |
| quota | read-only ssh token peek |
| ctx sync | rsync on a 60s timer |

Consequences: the protocol stream (stream-json / JSON-RPC) crosses the WAN — every
resilience feature is a patch on that (keeper+offset is exactly such a patch); codex remote
chat was never wired (B-0588); everything is poll-based; discovery is a PARALLEL shell
implementation that drifts from the local JS (the 2.117.0 naming-degradation class);
per-session reverse tunnels bind random ports on the remote.

## 2. Decision record (2026-07-13, user-confirmed)

1. **Transport topology: BOTH directions in v1** (user: "双向都做v1").
   A) server dials the host over ssh (stdio bridge to the daemon's unix socket) — zero new
   ports, reuses ssh trust, works from a NAT'd home server to cloud hosts;
   B) daemon dials OUT to the server (`wss://<server>/agentd`, VS Code tunnel-style) — for
   hosts the server cannot ssh into but which can reach the server (fleet pods; tailnet
   peers). One protocol, transport-agnostic framing.
2. **Terminals migrate too** (user: "都迁移吧 但是考虑用性能更高更稳定的方案").
   Scheme chosen for stability: the daemon runs the LOCAL server's proven pty stack ON the
   host — `dtach -c` + pty-wrapper as the persistent pty OWNER, daemon attaches via node-pty
   and relays bytes. NOT daemon-owned ptys: a daemon-held pty master dies with the daemon
   (SIGHUP to the CLI — the VS Code weakness). Daemon restart/upgrade = re-attach, sessions
   never die. Zero WAN inside the pty pipeline; the channel carries only bytes + resize.
3. **Lifecycle: VS Code Remote model, NO systemd requirement** (user: "学习vscode类似的方案…
   可以ssh上去主动启动。也可以是用户手动在remote上安装后反向连回vibespace").
   On-demand: first connection ssh-spawns a flock-singleton, setsid-detached daemon from a
   versioned install dir; it persists after ssh exits and never idle-exits while sessions
   live. Host reboot → next connect re-spawns (acceptable cold start). Manual/reverse mode:
   a one-liner installer on the host + a pairing token → daemon dials out (transport B).
4. **Coexistence: HARD CUT per host** (user: "装了 daemon 就硬切"). Once a host runs the
   daemon, legacy ssh paths are DISABLED for it (per capability as each milestone lands;
   full cutover at the final milestone). Rescue path = the daemon install/uninstall itself
   still rides plain ssh (Manage Agents / Machines UI), so a bricked daemon is always
   recoverable by reinstall — but there is no silent fallback double-path to maintain.

Derived decisions (stated in review, not objected):

5. **Thin daemon, fat server**: normalization (MessageManager & friends) STAYS server-side.
   The daemon relays raw buffer bytes / raw CLI stream lines with offsets. Rationale: the
   normalizers are the fastest-evolving code in the repo; keeping them local means daemon
   upgrades are rare and the protocol stays byte-oriented and stable.
6. **Sessions are NEVER daemon children** (the keeper lesson, now an invariant): every
   session process is setsid-detached with its own buffer/meta files; the daemon is a
   SUPERVISOR that (re)attaches. Daemon death/upgrade never kills a session.
7. **Auth: host-level long-lived token** (`vsht_…`), minted at install, stored 0600 on the
   host, sha256-hashed in `data/hosts.json`. BOTH transports authenticate with it in the
   hello frame (yes, even over ssh — defense in depth); revocable per host in the UI. This
   retires per-session reverse tunnels AND per-spawn token shipping: agent tools talk to the
   daemon's 0700 unix socket, the daemon relays to the server over the one channel.
8. **Node runtime**: install prefers host node ≥18 (probed like today's bootstrap); if
   absent, the installer downloads the pinned official static build into the install dir
   (VS Code-style). Never depends on nvm being sourced at spawn time again.
9. **§ban-safety invariants carry over unchanged**: quota reads stay read-only + human-gated;
   no background OAuth polling; subscription creds shipping stays opt-in; nothing secret or
   bulky ever enters argv (protocol is all stdio/socket).

## 3. Architecture

```
LOCAL SERVER                                REMOTE HOST
┌─────────────────────────┐                 ┌──────────────────────────────────┐
│ hosts.js → AgentdClient │══ transport A ══│ vibespace-agentd (flock single-  │
│  (mux protocol, one     │   ssh stdio     │  ton, setsid, versioned dir)     │
│   channel per host)     │══ transport B ══│  ├─ session supervisor           │
│ normalizers / UI /      │   wss dial-out  │  │   ├─ chat: chat-wrapper +     │
│ usage ledger / tasks    │                 │  │   │   codex-chat-wrapper      │
│  (ALL stay local)       │                 │  │   │   (run ON host, keeper-   │
└─────────────────────────┘                 │  │   │    style detached)        │
                                            │  │   └─ term: dtach -c + pty-    │
        one binary-framed mux:              │  │       wrapper, node-pty attach│
        chan 0 = JSON control               │  ├─ discovery (session-store.js  │
        chan N = byte streams               │  │   + codex-session-store.js,   │
        (pty, buffers, files)               │  │   fs.watch → push)            │
                                            │  ├─ fs ops / ctx sync / usage    │
                                            │  │   scan / quota peek           │
                                            │  └─ 0700 unix socket ← agent     │
                                            │      tools (vibespace-status/…)  │
                                            └──────────────────────────────────┘
```

The daemon is best understood as **a headless mini VibeSpace session layer**: the pty/dtach
infrastructure, wrappers, and discovery code of server.js, running on the host, speaking a
mux protocol instead of serving browsers. Maximum code reuse, one implementation of
discovery/wrappers everywhere (kills the shell-script drift class).

## 4. Protocol

- **Framing**: length-prefixed binary mux — `[u32 len][u8 type][u32 chan][payload]`.
  Channel 0 carries newline-JSON control messages; numbered channels carry raw byte streams
  (pty io, buffer replay, file transfer). Hand-rolled (~200 lines, unit-tested) — the daemon
  must stay a zero-dependency single-file bundle. Simple per-channel credit flow control so
  a fat file transfer can't starve a pty stream.
- **Handshake**: `hello {protoVersion, daemonVersion, platform, arch, nodeVersion,
  capabilities[], hostToken}` → server verifies token + compares versions → `ok` or
  `upgrade` (server streams the new bundle; daemon swaps its versioned dir and restarts
  itself — sessions survive by invariant #6; server reconnects).
- **Heartbeat**: ping/pong on chan 0 every 10s, 3 misses = dead on both sides (no more
  half-open ambiguity).
- **Resync**: connection is stateless-resumable. Server attaches sessions with
  `{sessionId, offset}` (byte offset into the host-side buffer — the keeper model);
  discovery sends a full snapshot on connect then incremental push (fs.watch on
  `~/.claude/projects` + `~/.codex/sessions` + lock dirs); non-session events (usage) use a
  cursor the daemon persists (today's remote cursor file, unchanged semantics).
- **Multi-server**: the daemon accepts multiple concurrent server connections (the user
  works from more than one machine; dtach allowed this implicitly — keep it). Sessions are
  host-global, not per-server.

## 5. Daemon lifecycle (VS Code model)

- **Install layout**: `~/.vibespace/agentd/<version>/` (bundle + optional pinned node),
  `~/.vibespace/agentd/current` symlink, state in `~/.vibespace/agentd/state/` (host token
  0600, usage cursor, logs w/ rotation). The existing `~/.vibespace/bin` agent tools remain
  (now installed once by the daemon installer, refreshed on daemon upgrade — the 2.129.0
  Manage Agents row becomes the daemon status/install/upgrade UI).
- **Spawn**: transport A connects → if socket absent, run the launcher (flock singleton →
  setsid daemon → wait for socket). Reboot cold-start is one extra round trip.
- **Self-upgrade**: server-initiated on handshake mismatch. Atomic dir swap + re-exec.
  Never touches session processes. A failed upgrade is recovered by the ssh install path
  (rescue invariant from decision #4).
- **Uninstall**: stop daemon, remove install dir + unregister hook (reuses the 2.129.0
  `--uninstall` machinery), leave session transcripts alone.

## 6. Session transport details

**Chat (claude + codex)**: chat-wrapper / codex-chat-wrapper run ON the host under the
daemon (spawned detached exactly like the local dtach model; the keeper's buffer+socket
pattern becomes the daemon's internal session supervisor). Raw stream lines land in host-side
buffer files; the daemon relays bytes from a requested offset over a mux channel; the SERVER
feeds its normalizers exactly as if reading a local buffer. This wires codex remote chat
(B-0588) structurally: the JSON-RPC pipe never leaves the host. Interrupt/permission/control
messages ride chan 0 as JSON (`session-stdin` writes).

**Terminal**: daemon spawns `dtach -c <sock> -E pty-wrapper …` on the host (same argv the
local server builds today), attaches via node-pty, relays pty bytes on a mux channel;
resize = control message → daemon's node-pty resize (multi-client min-size arbitration
stays server-side, unchanged). Scrollback buffer file is written by pty-wrapper on the host
as today → reconnect replay identical to local restore. node-pty ships as prebuilt binaries
for linux-x64/arm64 + darwin-arm64/x64 inside the daemon bundle; an unsupported arch keeps
that host's terminals on the legacy path (the ONE documented exception to hard-cut).

**Agent tools / hooks**: `vibespace-status/-task/-ask` + the hook connect to the daemon's
unix socket (env `VIBESPACE_AGENTD_SOCK` replaces `VIBESPACE_API`+tunnel); the daemon relays
to the server over the channel, tagging the session identity server-side from the session
registry (per-session `vsst_` tokens remain for request scoping, but never leave the host —
the daemon holds them).

## 7. Capability migration table

| legacy mechanism | daemon-host replacement | milestone |
|---|---|---|
| remote chat keeper (2.124.0) | absorbed as daemon session supervisor | M1 |
| per-spawn tools tar (2.126.0) | installed once at daemon install, refreshed on upgrade | M1 |
| reverse tunnel + random port | deleted → daemon socket relay | M1 |
| discovery shell script + cache | daemon push (shared JS discovery); cache stays as last-known while disconnected | M2 |
| remote terminal dtach-over-ssh | daemon-attached dtach + byte relay | M2 |
| remote-fs ssh-per-op | protocol file ops (same `?host=` shapes client-side) | M3 |
| rsync ctx sync (60s timer) | daemon file sync, event-driven | M3 |
| usage-scan per-open harvest (2.127.0) | daemon incremental scan + push (cursor in daemon state) | M3 |
| quota ssh token peek | daemon local read (read-only, human-gated — unchanged) | M3 |
| accounts key shipping over ssh stdin | over the channel into 0600 files (same rules) | M3 |
| ControlMaster (2.125.0) | kept for transport A bootstrap + rescue ssh | — |
| host bootstrap flow | extended: installs the daemon (idempotent steps + UI progress) | M0 |
| Manage Agents integration row (2.129.0) | becomes daemon install/status/upgrade surface | M0 |

## 8. Milestones

- **M0** — protocol mux + daemon skeleton + install/launch (transport A) + handshake/
  self-upgrade + **loopback test mode** (spawn the daemon locally and treat localhost as a
  "remote" — the e2e harness for everything after).
- **M1** — chat sessions through the daemon (claude AND codex), agent-tool socket relay,
  reverse tunnels retired. Hard-cut chat on daemon hosts.
- **M2** — terminals through the daemon (node-pty prebuilds), discovery push. Hard-cut.
- **M3** — fs ops, ctx sync, usage/quota, account provisioning. Hard-cut; legacy per-op
  code now runs only for daemon-less hosts.
- **M4** — transport B (dial-out) + manual installer + pairing-code UX in Machines UI.
- **M5** — cleanup: gate legacy paths behind "host has no daemon", docs, migration notes.

## 9. Invariants (do not regress)

1. Session processes are setsid-detached, never daemon children; daemon death/upgrade
   kills nothing.
2. Normalization stays server-side; the daemon ships bytes, not semantics.
3. Nothing secret or bulky in argv, ever (2.126.0); tokens live in 0600 files / sockets.
4. §ban-safety: no scheduled OAuth calls, quota reads read-only + human-gated,
   subscription-to-remote stays opt-in.
5. Daemon listens ONLY on a 0700 unix socket (+ dial-out client connections); never TCP.
6. Hard cut is per-capability per-milestone; the ssh rescue path (install/uninstall/repair)
   must always work with the daemon fully broken.
7. The buffer-offset resume contract (keeper heritage) is the compatibility surface —
   changing it requires a protocol version bump, not a silent format change.

## 10. Progress

- 2026-07-13 — direction + the 4 fork decisions settled with the user; this document.

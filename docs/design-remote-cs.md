# Design: C/S Architecture — Unified Device Model (控制面/会话面分离)

Status: APPROVED direction, pre-implementation blueprint + progress anchor. Two decision
rounds with the user 2026-07-13 (chat session 9f4cd444; backlog item **B-5052** (原 B-55e2, 换代承载设计定稿)).
Round 2 upgraded the scope from "remote hosts get a daemon" to a **unified device model**
(user: "本机也变成了'远程'的一种，只是连接的 daemon 在本地而已 … 逼迫所有功能都必须保证
远程能用，所有设备不管是本地还是远程一视同仁").

The 2.124.0–2.127.0 transitional layer (keeper / reconnect / keepalive / harvest) is the
proven seed; the daemon GENERALIZES it.

## 1. The model

**Split VibeSpace into a control plane and a session plane:**

- **Server (control plane)** — the workspace: HTTP/UI, browser WS, auth, layouts/desktops,
  Task Groups, session-status board, user-todos, accounts store, usage LEDGER + pricing,
  settings, themes, drafts, telemetry, and ALL normalizers (MessageManager & friends).
  Owns no machine. After full migration the server needs no node-pty (pure JS — deployment
  simplification).
- **Daemon (session plane / "machine agent", `vibespace-agentd`)** — one per DEVICE,
  **including localhost**: session spawn/supervision (dtach + pty-wrapper + chat wrappers),
  session discovery (shared JS + fs.watch push), file ops, transcript seek/search
  primitives, usage transcript scanning, quota creds peek, clipboard/X display, editor
  helper bridge, VNC bridge, mounts (late milestone).

**Localhost is device #0**: the server auto-spawns and supervises a REAL local daemon and
talks to it over the SAME mux protocol on a unix socket. No in-process shortcut, no
special-cased local path — that is the forcing function: every feature works remotely
*by construction* because there is no other code path. The M0 "loopback test mode" is
simply the production local configuration.

```
                    ┌──────────────── SERVER (control plane) ───────────────┐
   browsers ══WS══▶ │ UI · auth · boards · tasks · ledger · normalizers     │
                    └───┬————————————————┬———————————————————┬─────────────┘
                        │ unix socket    │ transport A (ssh   │ transport B (daemon
                        │ (same mux!)    │ stdio bridge)      │ dials out, wss)
                  ┌─────▼─────┐    ┌─────▼─────┐        ┌─────▼─────┐
                  │ agentd    │    │ agentd    │        │ agentd    │
                  │ LOCALHOST │    │ ssh host  │        │ paired    │
                  └───────────┘    └───────────┘        └───────────┘
                  each daemon: sessions (dtach+wrappers, detached) · discovery(push)
                  · fs ops · transcript seek/search · usage scan · quota peek
                  · clipboard/X · editor bridge · VNC bridge · [mounts later]
```

## 2. Decision record (2026-07-13, user-confirmed)

1. **Transport topology: BOTH in v1** ("双向都做v1"). A) server dials over ssh (stdio
   bridge / unix-socket forward) — zero new ports, ssh trust, NAT-friendly; B) daemon dials
   OUT (`wss://<server>/agentd`, VS Code tunnel-style, pairing token) — for hosts the
   server can't ssh into. Localhost uses the unix socket directly. One transport-agnostic
   protocol.
2. **Terminals migrate too** ("都迁移吧 但是考虑用性能更高更稳定的方案") — via the
   HIGHEST-STABILITY scheme: the daemon runs the local server's proven pty stack on the
   device — `dtach -c` + pty-wrapper as the persistent pty OWNER, daemon attaches via
   node-pty and relays bytes. NOT daemon-owned ptys: a daemon-held pty master dies with the
   daemon (SIGHUP → CLI death — the VS Code Remote weakness). Daemon restart/upgrade =
   re-attach; sessions never die. Zero WAN (and zero cross-process hops) inside the pty
   pipeline itself.
3. **Lifecycle: VS Code model, NO systemd** ("学习vscode类似的方案 … ssh上去主动启动 …
   也可以用户手动在remote上安装后反向连回"). On-demand flock-singleton, setsid-detached,
   spawned from a versioned install dir on first connect; persists after ssh exits; host
   reboot → next connect re-spawns. Manual install + pairing token = transport B entry.
   The LOCAL daemon is spawned/supervised by the server itself (crash → backoff respawn) —
   zero user management.
4. **Hard cut** ("装了 daemon 就硬切"): a device with a daemon uses ONLY daemon paths
   (per capability as milestones land). Localhost is hard-cut from the milestone that ships
   it. Rescue = the ssh install/repair/uninstall path works with the daemon fully broken;
   local rescue = pin to previous release.
5. **Unified device model** (round 2, quoted above): localhost is a device like any other;
   "host" generalizes to "device"; the Machines UI grows a permanent, undeletable
   **This machine** row with the same status/integration/health surface as remote devices
   (the 2.129.0 integration row and the 2.128.0 usage Device filter were the precursors).

Derived decisions (stated in review, not objected):

6. **Thin daemon, fat server**: normalization stays server-side; the daemon ships bytes and
   runs only MECHANICAL byte/line-level primitives (buffer relay, JSONL line-index/seek/
   search-stream — these must run next to the file; shipping a 500MB transcript to the
   server to seek it would be absurd). Semantics never move.
7. **Sessions are NEVER daemon children** (keeper lesson → invariant): setsid-detached,
   own buffer/meta files; the daemon is a supervisor that (re)attaches. Daemon death or
   upgrade kills nothing. Same guarantee now applies LOCALLY to server restarts too —
   strictly better than today.
8. **Auth: host-level long-lived token** (`vsht_`), minted at install (auto for localhost),
   0600 on device, sha256-hashed server-side, presented in hello on EVERY transport (unix
   socket included — uniformity). Retires per-session reverse tunnels and per-spawn token
   shipping: agent tools + hooks talk to the daemon's 0700 unix socket
   (`VIBESPACE_AGENTD_SOCK`), daemon relays; per-session `vsst_` tokens still scope
   requests but never leave the device.
9. **Node runtime**: prefer device node ≥18; else installer downloads the pinned official
   static build into the install dir. node-pty ships as prebuilt binaries (linux-x64/arm64,
   darwin-arm64/x64) in the daemon bundle; unsupported arch = that device's terminals stay
   on the legacy path (the ONE hard-cut exception).
10. **§ban-safety invariants unchanged**: quota reads read-only + human-gated; no scheduled
    OAuth calls; subscription-to-remote opt-in; nothing secret/bulky in argv ever.
11. **Migration order: LOCAL-FIRST extraction.** Build the daemon by extracting the local
    session layer and hard-cutting localhost first; remote is then "the same daemon over
    ssh". Daily driving exercises the new path immediately; remote rides proven code.

## 3. Protocol

- **Framing**: length-prefixed binary mux — `[u32 len][u8 type][u32 chan][payload]`.
  Chan 0 = newline-JSON control; chan N = byte streams (pty io, buffer replay, file
  transfer, search results). Hand-rolled (~200 lines, unit-tested; daemon stays a
  zero-dependency single-file bundle + node-pty prebuilds). Per-channel credit flow control
  (a fat upload must not starve a pty stream). Binary channels are REQUIRED for local
  performance parity (uploads/downloads/CSV streaming relay through server↔daemon pipes,
  no JSON re-encoding).
- **Handshake**: `hello {protoVersion, daemonVersion, platform, arch, nodeVersion,
  capabilities[], hostToken}` → `ok | upgrade` (server streams new bundle; daemon swaps
  versioned dir + re-execs; sessions survive by invariant #7).
- **Heartbeat**: ping/pong 10s, 3 misses = dead, both sides.
- **Resync**: stateless-resumable — session attach carries `{sessionId, offset}` (byte
  offset into device-side buffers, the keeper heritage); discovery = full snapshot on
  connect + fs.watch incremental push; usage scan keeps a device-side cursor.
- **Multi-server**: a daemon accepts multiple concurrent servers (the user works from
  several machines; dtach allowed this implicitly). Corollary of the unified model: machine
  A's LOCAL daemon can simultaneously be machine B's REMOTE daemon — two VibeSpace servers
  sharing devices is a supported topology, not an accident.

## 4. Daemon lifecycle

- **Install layout**: `~/.vibespace/agentd/<version>/` + `current` symlink; state in
  `~/.vibespace/agentd/state/` (host token, usage cursor, rotated logs). On localhost the
  daemon POINTS AT the existing `data/` session dirs (sockets/buffers/session-meta) so the
  M-local flip adopts running sessions with zero file moves — adoption IS today's
  restoreSessions, executed by a different process.
- **Spawn**: local = server child-with-backoff supervision; remote A = ssh launcher (flock
  singleton → setsid → wait for socket); remote B = user-run installer + pairing code.
- **Self-upgrade**: server-initiated on handshake mismatch; atomic dir swap + re-exec;
  never touches sessions. Broken daemon → ssh reinstall (remote) / release rollback (local).
- **Uninstall**: stop daemon, remove install dir, unregister hook (2.129.0 `--uninstall`
  machinery), transcripts untouched.

## 5. Session transport

**Chat (claude + codex)**: wrappers run ON the device under the daemon (detached, keeper
pattern as internal supervisor). Raw stream lines land in device-side buffer files; daemon
relays from requested offsets; SERVER normalizers consume as if local. Codex remote chat
(B-0588) is structurally absorbed: the JSON-RPC pipe never leaves the device.
Control (interrupt/permission/set-model/goal) rides chan 0 JSON.

**Terminal**: daemon spawns `dtach -c + pty-wrapper` (same argv the server builds today —
spawn SPECS are still assembled server-side: adapters/settings/billing are semantics),
attaches via node-pty, relays bytes; resize = control message; multi-client min-size
arbitration stays server-side. Scrollback buffers written by pty-wrapper on the device;
reconnect replay identical to today's local restore.

**Transcript access**: seek/line-index/streaming-search primitives (readJsonlBounded,
getJsonlLineIndex, searchJsonlFullStream — already mechanical, shared modules) run
daemon-side; the server requests slabs/results over channels. The whole-file remote-jsonl
cache retires — huge remote transcripts get the SAME lazy seek behavior as local ones
(today remote history pulls entire files; this is a major win).

## 6. Capability migration table

| capability | today | unified-model home | milestone |
|---|---|---|---|
| local session spawn/restore | server in-process (pty/dtach infra) | LOCAL daemon (extracted) | M1 |
| remote chat keeper (2.124.0) | per-session keeper | absorbed as daemon session supervisor | M2 |
| remote terminal | dtach-over-ssh | daemon-attached dtach + byte relay | M2 |
| per-spawn tools tar (2.126.0) | every spawn | installed once with daemon, refreshed on upgrade | M2 |
| reverse tunnels + random ports | per session | DELETED → daemon socket relay (local too) | M1/M2 |
| discovery | local: in-process scan; remote: shell script + cache | daemon push (shared JS), everywhere | M3 |
| file ops | local: routes/files.js + safe-fs pool; remote: ssh-per-op | daemon fs ops (safe-fs pool + hung-mount defense move in); `?host=` shapes unchanged; remote-fs.js retires | M3 |
| transcript seek/search | local: direct fs; remote: whole-file cache | daemon-side primitives + slab streaming | M3 |
| usage transcript scan | local: in-process; remote: harvest scanner | daemon incremental scan + push | M3 |
| passive statusline capture | LOCAL terminals only | all devices (daemon syncs usage-cache) — remote passive capture unlocked, still zero API calls | M3 |
| quota peek | local read / remote ssh peek | daemon local read (read-only, human-gated) | M3 |
| ctx folder sync | rsync timer | daemon file sync, event-driven | M3 |
| clipboard / X display | server-machine only | daemon capability → remote paste works | M4 |
| Ctrl+G editor helper | server HTTP (local-biased) | daemon socket bridge → uniform incl. remote | M4 |
| VNC bridge | server-machine only | daemon capability (per-device desktop) | M4+ |
| accounts key provisioning | ssh stdin files | over channel into 0600 files (same rules) | M2 |
| mounts (rclone) | server-machine only | per-device daemon management | M5+ |
| ControlMaster (2.125.0) | per-op ssh accel | kept: transport A bootstrap + rescue ssh | — |
| host bootstrap / Manage Agents row (2.129.0) | tools install UI | daemon install/status/upgrade surface; Machines gets permanent "This machine" row | M0/M1 |

## 7. Milestones (local-first)

- **M0** — mux protocol + daemon skeleton + LOCAL lifecycle (server spawns/supervises,
  unix socket, vsht_ auto-mint) + handshake/self-upgrade + e2e harness (= the local config).
- **M1** — extract the SESSION layer into the daemon; localhost hard-cuts: chat + terminal
  locally through the daemon (dtach adoption migrates running sessions in place); agent
  tools + hooks move to the daemon socket; local reverse of the tunnel model gone.
- **M2** — the same daemon over ssh (install/handshake/upgrade); remote chat (claude AND
  codex — B-0588 lands here) + terminals; reverse tunnels + per-spawn tar retired.
- **M3** — capabilities unify: discovery push, fs ops, transcript slabs, usage scan +
  passive capture, quota, ctx sync. remote-fs.js / discovery scripts / harvest scanner /
  remote-jsonl cache retire.
- **M4** — transport B (dial-out + pairing UX); device-parity features: clipboard, editor
  helper, VNC bridge.
- **M5** — mounts per device; legacy-path cleanup (daemon-less ssh paths remain only as
  the documented rescue/bootstrap layer); docs.

## 8. Invariants (do not regress)

1. Sessions are setsid-detached, never daemon children; daemon OR server death/upgrade
   kills nothing.
2. Normalization and spawn-spec assembly stay server-side; the daemon ships bytes and runs
   only mechanical primitives.
3. NO special-cased local path: localhost goes through the same daemon + protocol as every
   device. (The forcing function — resist every "just for local" shortcut.)
4. Nothing secret or bulky in argv (2.126.0); tokens in 0600 files/sockets only.
5. §ban-safety: no scheduled OAuth calls; quota human-gated read-only; sub-creds-to-remote
   opt-in; passive statusline capture stays zero-API-call.
6. Daemon listens ONLY on a 0700 unix socket (+ outbound dial); never TCP-listens.
7. Hard cut is per-capability per-milestone; ssh rescue (install/repair/uninstall) must
   work with the daemon fully broken.
8. The buffer-offset resume contract is the compatibility surface — protocol version bump
   to change, never a silent format change.

## 9. Honest costs / risks

- **Two processes on every deployment** (server + local daemon): ~1 extra node process;
  supervision + log surfacing are new server duties. Accepted for uniformity.
- **M1 is the riskiest flip** (the most-used path changes). Mitigations: dtach adoption ==
  today's restoreSessions; developed behind a branch/flag, flipped in ONE release, sessions
  survive the flip by construction.
- **Local perf**: unix-socket hop is ~µs latency (imperceptible for pty echo); throughput
  paths (upload/download/CSV) MUST use binary channels end-to-end — no JSON re-encoding.
- **Debugging indirection**: two processes + protocol for any local bug — mitigated by the
  local config being identical to remote (bugs reproduce locally by definition).
- **node-pty prebuilds**: bundle grows; exotic arch → documented terminal fallback.
- **Data split**: device state (sockets/buffers/session-meta/usage-cursor) vs server state
  (layouts/tasks/ledger/settings) must be explicit; localhost daemon reuses existing dirs
  to make the split a no-move migration.

## 10. Progress

- 2026-07-13 — round 1: daemon direction + 4 fork decisions settled.
- 2026-07-13 — round 2: **unified device model** (localhost = device #0, no special local
  path) settled; local-first milestone reorder; doc rewritten.

---

## M0 wire-level addendum (2026-07-14, implementation decisions — these ARE the protocol-v1 compatibility surface, invariant #8 applies)

- **Frame types** (`[u32 len][u8 type][u32 chan][payload]`, len covers type+chan+payload):
  `0=DATA` (payload bytes for the channel; chan 0 payload = newline-delimited JSON), `1=CLOSE` (half-close a channel, empty payload), `2=CREDIT` (payload = u32 bytes granted), `3=PING`/`4=PONG` (empty payload, chan ignored).
- **Channels**: chan 0 always open (control, credit-exempt). Byte channels are opened IMPLICITLY by first DATA/announcement on a fresh id; the CONNECTING side (the server) allocates ids ≥1 — the daemon only ever replies on ids it was given. CLOSE is per-direction; both directions closed = id reusable (don't reuse in practice; u32 space is plenty).
- **Credit flow control**: per byte-channel, initial window 262144 bytes each direction; the receiver returns consumed bytes via CREDIT; a sender with window 0 buffers (bounded) and waits. Chan 0 exempt (small lines only).
- **Handshake**: client (server process) sends first — chan0 `{op:'hello', protoVersion, hostToken, serverVersion}`; daemon answers `{op:'hello-ack', protoVersion, daemonVersion, platform, arch, nodeVersion, capabilities:[]}` (bad token → `{op:'auth-fail'}` + close). The SERVER then decides: `{op:'ok'}` (proceed) or `{op:'upgrade', version, size}` followed by the new bundle streamed on chan 1 → daemon writes `~/.vibespace/agentd/<version>/agentd.js`, fsyncs, repoints `current` symlink, replies `{op:'upgrade-done'}`, re-execs itself; the client reconnects and re-handshakes.
- **daemonVersion = the release version** (package.json) — rollback = repoint `current` to the previous versioned dir.
- **Heartbeat**: PING every 10s from both sides; 3 missed PONGs = dead (close + client respawn path).
- **Sockets/paths**: daemon listens on `~/.vibespace/agentd/state/agentd.sock` (0700 dir, 0600 socket); state dir also holds `token` (0600 vsht_ plaintext, device side), `agentd.log` (rotated at 5MB ×2), `agentd.lock` (flock singleton), `agentd.pid`.
- **vsht_ server side**: `data/agentd-tokens.json` `{ [deviceId]: sha256 }` — plaintext never stored server-side; device #0 ('local') auto-minted at first boot.
- **Local lifecycle (open question 8 resolved)**: the daemon is ALWAYS setsid-detached (uniform with remote); the server supervises by CONNECT — connect fails → (re)spawn from `current` with flock preventing doubles → retry with backoff 0.5/1/2/5s. No child-process supervision (a server restart must not touch the daemon).
- **M0 capabilities[]**: empty. The field exists so M1 can gate session-layer adoption per daemon.

---

## Milestone status (2026-07-14, implementation record)

| Milestone | Status | Delivered | Acceptance |
|---|---|---|---|
| M0 protocol+skeleton | **DONE** 2.140.0 | mux (framing/credits/heartbeat), agentd lifecycle (flock/setsid/0700 socket/multi-server), vsht_ auth, self-upgrade re-exec | test-mux (4) + test-agentd (12) |
| M1 local sessions | **DONE** 2.141.0, flag `agentd.sessions` off | daemon session primitive (node-pty lazy), DeviceManager.openSession, gated attachToDtach w/ local fallback | test-agentd-session (dtach survives drop); real-pod WS session verified |
| M2 ssh transport | **DONE** 2.142.x–2.143.0, flag `agentd.remoteSessions` off | --stdio bridge, transport abstraction, persistent pipe-sessions (keeper semantics in-daemon), hosts.installAgentd, agentd-attach (keeper-run contract) | test-agentd-remote (5) + robustness (5: bidi/jitter/latency/concurrency) + wired-chain (7, real chat-wrapper) + AIDev real-ssh incl multi-drop jitter |
| Transport B dial-out | **DONE** 2.144.0 | zero-dep RFC6455 client, --dial persist+redial, /api/agentd-dial (single-dispatcher, dial-token gated), dial-pair mint | test-agentd-dial (8: dial/auth/session/redial/refusal) |
| M3 data-plane primitives | **PRIMITIVES DONE** 2.145.0 | fs-op (stat/list/write/mkdir/rm/read-range byte-chan), discovery raw-facts snapshot + fs.watch dirty push (claim algo stays server-side) | test-agentd-m3m4 M3.1–M3.3 (incl multibyte-split slab, dead-lock filtering, dirty push) |
| M4 device capabilities | **PRIMITIVES DONE** 2.145.0 (dial-out shipped above) | run-cmd (argv-only bounded exec = clipboard shape), tcp-connect loopback forward (= VNC bridge shape), Ctrl+G shape via fs+run-cmd | test-agentd-m3m4 M4.1–M4.3 (bidirectional tcp, stdin exec, device edit round-trip) |
| M5 mounts + cleanup | **SHAPE DONE** 2.145.0 | mount-class = persistent pipe session + run-cmd health probe + teardown (lifecycle verified); rclone-on-device rides these primitives | test-agentd-m3m4 M5 |

UPDATE 2026-07-14 (2.146.0): the four DATA-PLANE switchovers are WIRED behind
`agentd.dataPlane` (default off, per-path ssh fallback): RemoteFs fs ops,
discovery (raw-facts synthesized into the ssh-script line format → unchanged
parser), transcript INCREMENTAL slab sync (append-only delta fetch), usage
harvest via run-stream. Acceptance: test-agentd-switchover.mjs vs a real host
with legacy-vs-device cross-checks. Still ssh-path-default; graduation =
flipping defaults after real-world soak. Remaining consumers (clipboard/X,
VNC-to-device, mounts-on-device) are NEW capabilities (nothing to switch) —
their primitives (run-cmd / tcp-forward / pipe-session lifecycle) are shipped
and acceptance-tested; productizing them is feature work, not architecture.

Original note — remaining after this record: UI/consumer SWITCHOVER work — pointing the existing
server subsystems (files.js ?host=, discovery ssh script, remote-jsonl cache,
usage harvest, clipboard/X, VNC bridge, mounts) at these primitives behind flags,
then the legacy ssh-per-op paths retire per capability (invariant #7: ssh stays
as rescue). The PROTOCOL and DEVICE side of every milestone is implemented and
acceptance-tested; switchovers are mechanical consumer swaps.

## Graduation directives (2026-07-15, user-ordered — the closing milestone)

Three direct orders after the 2.153.x device-utility batch:

1. **Merge dial devices into the hosts model, now.** A paired device must be a
   COMPLETE host: it appears in New Session's machine picker, session discovery
   (the user's Mac must show in the Folders list), Files' host select, usage —
   everything an ssh host can do. Implementation: hosts records grow
   `transport: 'dial' | 'ssh'` (dial records carry `deviceId`, no ssh fields);
   `hosts.device(id)` resolves dial hosts via `deviceForDial`; every device-
   backed path (M2 pipe sessions, M3 fs/discovery/transcript/usage) is FORCED
   for dial hosts regardless of the agentd.* flags (there is no ssh fallback);
   ssh-only paths (rsync ctx sync, keeper distribution, accountsStatus probes)
   need device equivalents or graceful degradation with honest errors.
2. **The local machine runs the SAME daemon as device #0, for real.** Local
   sessions/fs go through the daemon by default (agentd.sessions + dataPlane
   graduate ON locally) — "这样可以逼迫我们保证整个架构是正确工作的". Soak on
   the dev instance first, fleet after.
3. **Rename the daemon: `vibespace-device`** (user: "不要叫agentd, 进程列表分不清").
   Bundle → `data/bin/vibespace-device.js`, `process.title = 'vibespace-device'`
   at daemon startup, install roots → `~/.vibespace/device[@<host>]`, installers/
   docs/serve routes renamed; existing `~/.vibespace/agentd*` installs migrate
   (or keep working via a compat path check) — never strand a paired device.

Suggested slices: A rename (mechanical, global) → B hosts `transport:'dial'`
(+ discovery via device raw-facts, spawn via pipe-sessions) → C local flags
default-on + soak → D legacy ssh layer retirement. Delivered so far (2.150.0 →
2.153.1): device-folder-mount root-cured (WebDAV, 7ms), pairing UI + per-OS
commands + multi-instance roots, device machine-rows with test/mount/unpair,
DeviceMounts auto-heal, 17-assert e2e with a real daemon dialing.

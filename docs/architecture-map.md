# VibeSpace Architecture Map

> **Status:** routing document for future agents. Derived from a 6-subsystem cartography pass + a 17-defect confirmed-bug pass (2026-08). Line numbers are *as of that pass* and drift — always re-grep. `CLAUDE.md` remains the invariant/incident record; this file is the **"which file owns this decision"** index that CLAUDE.md does not provide.
>
> **Read order for a new change:** (1) the decision table at the bottom → (2) the owning subsystem's module table → (3) the Ownership Rules it cites → (4) only then the code.

## 0. Shape of the codebase

~33k lines server-side (`server.js` + `src/*`), ~45k client-side (`src/lib/*`). Five files hold a third of the server: `server.js` (5,623), `src/mounts.js` (2,516), `src/ws-handler.js` (2,412), `src/hosts.js` (1,552), `src/task-groups.js` (1,272). The two biggest are *not* cohesive modules — `server.js` is ~8 subsystems co-located and `ws-handler.js`'s `case 'create'` is 1,400 lines. That is the single structural fact behind most of the confirmed defect list (parity gaps, duplicate spawn-line assembly, discarded transport signals): **semantics are duplicated because the module boundary that would have made them shared does not exist yet.**

---

## 1. Subsystem index

| Subsystem | Owning files | What it *decides* |
|---|---|---|
| **core-server** | `server.js`, `src/ws-handler.js`, `src/adapters/*` | Whether a session exists, how it spawns, how its bytes are parsed, whether it survives restart |
| **accounts-usage** | `accounts.js`, `account-pool-auto.js`, `usage-history.js`, `usage-anchors.js`, `usage-estimator.js`, `usage-routes.js` | Which identity a spawn bills, whether an account is usable, what quota/cost is true |
| **remote-transport** | `hosts.js`, `remote-fs.js`, `agentd/{mux,client,agentd,attach-cli,ws-min}.js`, `dial-session-bridge.js`, `machine-mounts.js`, `device-mount.js`, `port-forward.js`, `exit-proxy.js` | How we reach another machine and what a machine is allowed to do |
| **agent-integration** | `agent-routes.js`, `task-groups.js`, `session-status.js`, `user-todos.js`, `data/bin/*` | What the *model* is told, what the model may write back |
| **storage** | `mounts.js`, `webdav.js`, `gmail-sync.js`, `safe-fs.js`, `routes/files.js` | Where bytes live, what may block the event loop |
| **client-shell** | `lib/app.js`, `lib/window.js`, `lib/layout.js`, `lib/desktop-manager.js`, `lib/stage-manager.js`, `lib/tab-group.js`, `lib/taskbar.js`, `lib/customize-mode.js`, `lib/sidebar*.js` | Window identity, geometry, multi-client convergence |
| **client-session-ux** | `lib/session-lifecycle.js`, `lib/session-card.js`, `lib/session-props.js`, `lib/manage-agents.js`, `lib/usage-*.js` | What the user is *told* about a session's identity/billing/state |
| **client-chat** | `lib/chat-view.js`, `chat-view-seek.js`, `chat-renderers.js`, `chat-input.js`, `chat-status-bar.js`, `chat-search.js`, `chat-minimap.js`, `message-manager.js`, `codex-message-manager.js`, `session-store.js` | How a transcript is normalized, paged, rendered |
| **platform** | `auth.js`, `clerk-auth.js`, `telemetry.js`, `incident.js`, `sysinfo.js`, `opslog.js`, `plugins.js`, `vnc.js` | Access, observability, host capabilities |

---

## 2. Modules by subsystem

### 2.1 core-server

| File | Responsibility |
|---|---|
| `server.js` | *Nominally*: bootstrap, dtach/PTY infra, session-meta persistence, manager wiring, shutdown flush belts. *Actually also*: both backend stdout parsers, the pool engine, agent-hook registration, generated helper scripts, dial registry, restore/readopt/migrations, ~1,100 lines of inline REST routes. |
| `src/ws-handler.js` | WS protocol dispatch (create/attach/kill/chat-input/control/resize/sync) + `agentEnv()` spawn-env sanitation + heartbeat. `case 'create'` additionally owns all remote provisioning + four transport-specific spawn-line assemblies. |
| `src/adapters/{claude-code,codex,shell}.js` | Backend CLI knowledge: flags, control-request formats, canned-string parsers (`parseLimitBanner`, `parseGetUsageResponse`), permission mapping. **Missing their other half** — record handling lives in `server.js`'s parsers. |
| `src/session-store.js` | JSONL access/merge, discovery helpers, `claimJsonls`, `dedupWebuiSockets`, offline task-state scan. |
| `src/dial-session-bridge.js` | Loopback TCP ⇄ device pipe/pty session bridge for dial machines. |
| `src/transcript-worker.js`, `safe-fs.js` | Off-main-thread transcript scans and user-path fs. |

### 2.2 accounts-usage

| File | Responsibility |
|---|---|
| `accounts.js` | Credential store (API key / claude sub dir / codex CODEX_HOME / pooled symlink / oat) **+ the two spawn authorities**: `resolveForSpawn()` and `evaluateOnHost()` **+** pool store mechanics (`setPoolTarget` symlink dance). |
| `account-pool-auto.js` | Pure EDF switch decision math over usage-cache entries. Zero I/O, zero network — by design. |
| `usage-history.js` | The permanent per-request ledger: incremental transcript/rollout scan, rid dedup, by-time account+pool attribution, pricing, `aggregate()`. |
| `usage-anchors.js` | Ground-truth anchor recorder + `identityKeyFor` (orgUuid > email > id) + ledger odometer. |
| `usage-estimator.js` | Rate learning + dead-reckoning estimates + live-odometer ring. |
| `usage-routes.js` | The quota HTTP surface **and** the only Anthropic network calls; passive ingest; global↔named identity link; codex rate-limit summarizer. |

**Note:** the pool feature is deliberately three-layered — *math* (`account-pool-auto`), *mechanics* (`accounts`), *triggering* (`server.js`). Respect the split; don't collapse it into one file.

### 2.3 remote-transport

| File | Responsibility |
|---|---|
| `hosts.js` | Machine registry **and the only legitimate channel factory**: `sshArgs`/`_ssh`, `_hostShell`, `device()`/`deviceBounded()`. Currently also carries six foreign domains (account probes, usage harvest, transcript cache, workflow probe, provisioning, resume policy). |
| `remote-fs.js` | Per-op remote fs mirroring local `/api/file*` shapes; device fast path + ssh legacy body per method. |
| `agentd/mux.js` | The wire: length-prefixed frames, credit-flow byte channels, credit-exempt chan-0 control. Shipped identically in daemon and server — **one protocol, one file.** |
| `agentd/client.js` | `DeviceManager`: connect ladder, self-upgrade, op API (`openSession`/`openPipeSession`/`fs*`/`runCmd`/`runStream`/`tcpForward`/`reverseForward`/`serveFolder`/`serveSocks`). |
| `agentd/agentd.js` | The field daemon: singleton, pipe/pty sessions, fs ops, discovery raw facts, tunnels, embedded WebDAV + SOCKS5, dial-out. |
| `machine-mounts.js` | Push/pull machine mounts + heal sweeps + token lifecycle. |
| `port-forward.js` | Persisted forwards over `tcpForward`, proto probe/override, frp publish glue **+ (misplaced) local port/process observability**. |
| `exit-proxy.js` | On-demand SOCKS egress borrow, gated by `hosts.allowExit`. |

### 2.4 agent-integration

`agent-routes.js` (every agent-facing endpoint; injection order/size is load-bearing) · `task-groups.js` (岗位 store, context rendering, backlog, TASK.md) · `session-status.js` · `user-todos.js` · `data/bin/*` (agent CLIs — **static tracked** for new tools; only `code`/`vibespace-status`/hook scripts are generated).

### 2.5 storage / platform / client
See `CLAUDE.md` § File Structure for per-file detail; the ownership rules below are what a change must satisfy.

---

## 3. Ownership Rules (imperative, citable)

### Billing & identity
- **OR-1** Any decision about *which account a spawn bills* or *whether an account is usable on a machine* goes through `accounts.resolveForSpawn()` / `accounts.evaluateOnHost()`. Consume verdicts; never re-derive linked/held/blocked/oat anywhere (client or server). Six field incidents came from parallel verdict code (B-f531).
- **OR-2** Display derivations of billing (`sessionAuth`, `_billingHow`, badges, chips) are *accounts-owned semantics* even when the code sits elsewhere. A new rung added to one must be added to all.
- **OR-3** The `created` reply's `billing` field is **post-facto truth**, not the request echo. Any path that does not actually apply the requested account (adoption, rescue, degrade) must report what really happened — the client persists this as the on-resume account.
- **OR-4** Anything writing `.credentials.json` / a creds dir (import, merge, pool re-point) goes through `accounts.js` and honors: no rewrite while a session of that account runs; CLI advisory-lock order `.oauth_refresh.lock` → `<realpath(dir)>.lock`; pooled dirs are symlinks (`unlink`, never `rmSync`).

### Quota (§ban-safety — treat as a legal line, not a preference)
- **OR-5** Network calls to Anthropic for quota/identity exist **only** in `usage-routes.js`, and only human-gated (⟳) or explicitly opt-in. Never attach one to a timer, hook, or turn-end. New passive signals write into `data/usage-cache/*.json` instead.
- **OR-6** The usage-cache entry shape has exactly two writers: `usage-routes._parseUsage` and `data/bin/vibespace-usage`. Everyone else is read-only. A new field must be added to *both* writers (the hook's preserve-merge list included) or it gets clobbered.
- **OR-7** Pool auto-switch decisions stay pure and file-only (`account-pool-auto.js`); triggering/broadcast/attribution stays server-side. A policy change touches the math file + `scripts/test-pool-auto.mjs` and nothing else.
- **OR-8** Ledger truth (event schema, rid dedup, cursors, pricing, aggregation dims) is `usage-history.js`'s alone. Ask it for cost-of-a-window; do not iterate its `_events`/`_cost`/`_evCache`.
- **OR-9** Every billing-identity transition (pool re-point, billing switch, resume, adopt) must call `recordUsageAttribution` **at the transition moment** — the ledger attributes by time.
- **OR-10** A new model = a new `pricing.json` tiers key (data-driven substring match), never code.

### Spawn, secrets, restart-survival
- **OR-11** Every spawn path builds env via `agentEnv()`. Secrets and bulk data never ride argv on either machine: tar-over-stdin / `dm.fsWrite` into 0600 files referenced by `VAR="$(cat …)"` prefix assignments; passphrases via child env. `/proc/cmdline` is world-readable.
- **OR-12** Subscription OAuth never ships to a remote/dial machine without `accounts.shipSubscriptionToRemote`. An oat is the sanctioned cross-machine channel.
- **OR-13** Anything that must survive a server restart lives in `data/session-meta`, written via `writeSessionMeta` with **spread-first** (`{...readSessionMeta(sockName), ...}`) — hardcoded field lists have dropped later-added keys five times — **and** must be read back in *both* `restoreSessions` and `readoptOrphanKeeperSessions`.
- **OR-14** Session teardown logic must exist in **both** the ws `kill` case and `setupSessionPty`'s onExit real-teardown branch; onExit early-returns once the session leaves `activeSessions`, so onExit-only cleanup silently never runs for killed sessions.
- **OR-15** Create-time refusals live in the fixed ladder at the top of `case 'create'` (resume-already-live → no-convo breaker → host inference/keeper attach → cwd label-strip/preflight). New refusal classes join the ladder with an error `code` and an honest message. **Never a silent fallback.**
- **OR-16** `active-sessions` payload fields are added **only** in `activeSessionsPayload()` — it is the single builder for broadcasts *and* the per-connection snapshot (a second field list has silently starved reconnecting clients twice).

### Machines & transport
- **OR-17** Opening any channel to a machine goes through `hosts.js` (`sshArgs`/`_ssh`/`_hostShell`/`device()`/`deviceBounded()`). Never spawn `ssh` with your own options — you lose keepalives, ControlMaster policy, and the fresh-probe invariant.
- **OR-18** `deviceBounded(id, ms)` for read-only/interactive consumers; bare `device()` for session-*establishing* paths (`findKeeperFor`, `_hostShell` inside create, `homeDir`-for-cwd). Backwards either hangs a UI for minutes or SIGTERMs a healthy claude. Test mocks must implement `deviceBounded`.
- **OR-19** Dial hosts never fall back to ssh (they have none) — throw or return an honest unreachable. Ssh hosts always keep the legacy ssh fallback after a failed device fast path.
- **OR-20** Any new byte-channel consumer **counts bytes** to decide completion. Chan-0 control is credit-exempt and overtakes queued data; "resolve on the done marker" truncates at exactly one window (2.187.0).
- **OR-21** The daemon does mechanical primitives only (bytes, spawns, raw facts). Interpretation (claiming, naming, normalization, billing) stays server-side. A new op = daemon branch + `client._tryOnce` dispatch entry + graceful behavior against **old** daemons in the field (self-upgrade is eventual).
- **OR-22** Nothing may kill a session child on transport events. Pipe children are setsid-detached, sentinel-signaled, adopted-not-respawned; link death **detaches** (disowns reverse listeners, kills only attach ptys). Conversely: a transport death **must** be propagated to the consumer that can recover from it — swallowing it strands the session (see D-1 defect class).
- **OR-23** Interpreting what a remote credential/login *means* is `accounts.evaluateOnHost`; `hosts` probes report raw facts only.
- **OR-24** Egress boundary: `tcp-connect` stays loopback (plus an explicit user-chosen LAN target for jump forwards); the daemon SOCKS5 is the one sanctioned arbitrary-connect point; the policy gate (`allowExit`) lives on the host record.
- **OR-25** Remote transcript/file caching lives behind `hosts._fetchRemoteByFind` only — never stamp meta for bytes not received; cache-valid requires the local file to actually hold `meta.size`.

### Agent-facing surface
- **OR-26** Hook config in `~/.claude/settings.json` / `~/.codex/hooks.json` is touched only via the `ensureAgentHooks`/`stripAgentHookEntries`/`_patchHookFile` cluster, gated by `hookRegistrationSafe` (temp-server guard), the integration master switch, and the opt-out marker. Remote hosts go through the shipped `vibespace-hook-register.mjs`.
- **OR-27** Generated `data/bin` helper CONTENT is a contract (`hosts.agentToolsStatus` sha256-compares against local copies). Prefer **static tracked files** for new agent CLIs. Never end a JS template string with a bare backslash (P0 2.111.29). `vibespace-status` stays gitignored.
- **OR-28** Injected-context order and byte budget are load-bearing: tools-first head must stay inline under the 9,600-byte cap; activity log is tail-truncated last. Read `agent-routes.js`'s notes before touching payloads.
- **OR-29** A disabled tool must be neither taught nor served; per-feature toggles compose from `enabledTools()`.

### Cross-cutting
- **OR-30** Server-side settings reads go through `serverSetting()`. Never `getSyncStore('settings')` (dormant empty store — returns defaults silently).
- **OR-31** Heavy transcript work goes through `transcript-worker`; user-path fs in routes goes through `app.locals.safeFs`; existence checks use child processes with timeouts. Never sync node fs on a possibly-FUSE path in the main process.
- **OR-32** Server→client: per-session events use `broadcastToSession`; global operator-facing notices use `serverNotice(key, text)` (dedup + retained until a client connects). Never invent a WS type for a probe result.
- **OR-33** Backend-specific CLI knowledge (record shapes, canned error strings, control formats, flags) belongs in `adapters/<backend>.js` — *including* when the call site is a `server.js` parser. New death signatures go only into `classifyCliDeath`.
- **OR-34** A record read from **both** stdout and JSONL must accept both key casings (snake vs camel) — the same record arrives differently per transport.
- **OR-35** A route that accepts `?host=` must have an `rfs(req)`/device branch, and its remote implementation must return the **same response shape** as the local one. A missing branch silently serves a same-path *local* file — the worst failure mode in this codebase.

### Client (from CLAUDE.md; restated as rules)
- **OR-36** Every window type sets `_openSpec` unconditionally (even on the syncId replay path) and mutable state that must survive refresh lives *in* the spec. `wm.closeWindow` must purge the desktop record.
- **OR-37** No native `prompt/alert/confirm`; no global `.hidden` rule — every component ships its own; verify hiding by computed style.
- **OR-38** All persistent state broadcasts to other clients; a UI action chained after a store write must not wait on the broadcast echo (upsert locally, let the broadcast overwrite idempotently).
- **OR-39** Every per-session config writer must be in the `sessionConfigs` field whitelist (three silent-drop incidents).
- **OR-40** All drag handlers convert pointer deltas viewport→layout by dividing by `uiScale()`; proportional bounds use `offsetWidth`, never `getBoundingClientRect`.
- **OR-41** Wrap human-visible chrome in `t()`; never wrap protocol values, stored/compared strings, or agent-facing content. Dictionary parity is build-checked.

---

## 4. Cross-file contracts (change all sites together)

| Contract | Sites |
|---|---|
| Discovery raw-facts line format (`LOCK/J/H/N/T/K/C/HC`) | `hosts.js` ssh script · `hosts.js` device synthesizer · `agentd.js` discovery snapshot · parser + `claimJsonls` |
| mux protocol v1 | `agentd/mux.js` (server) ≡ `agentd/mux.js` (bundled daemon) — bump `PROTO_VERSION` |
| Usage-cache entry shape | `usage-routes._parseUsage` · `data/bin/vibespace-usage` · consumed by pool-auto/anchors/estimator |
| `AGENT_TOOLS` list | `hosts.js` static list · ws-handler per-spawn distribution · uninstall path |
| Auto-color sequence | `src/task-color-seq.js` required by server **and** imported by client (must sequence identically) |
| Local vs remote route shapes | `routes/files.js` local handlers ≡ `remote-fs.js` methods |
| Live todo capture vs offline scan | `server.js` `applyTaskToolUpdate` ≡ `session-store.scanTaskEventsFull` |
| Model match | server `modelsMatch` ≡ client `_modelMismatch` |
| Anchor file slug | `usage-anchors._file` ≡ `usage-estimator._file` |

---

## 5. "Where does my change go" — decision table

| # | Change class | Edit here | Must also touch | Rules |
|---|---|---|---|---|
| 1 | New CLI stdout/JSONL record type | `adapters/<backend>.js` parser + the `setupSessionPty` branch | `CLAUDE_STREAM_TYPES` breadcrumbs; both key casings | OR-33, OR-34 |
| 2 | New canned CLI error / death signature | `classifyCliDeath` only | — | OR-33 |
| 3 | New account type or usability rule | `accounts.evaluateOnHost` + `resolveForSpawn` | `scripts/test-account-verdicts.mjs`; every display surface consumes verdicts | OR-1, OR-2 |
| 4 | New quota signal (passive) | writer into `data/usage-cache` + `_parseUsage` | `data/bin/vibespace-usage` preserve-merge | OR-5, OR-6 |
| 5 | Pool switching policy | `account-pool-auto.js` | `scripts/test-pool-auto.mjs` | OR-7 |
| 6 | New ledger dimension / pricing | `usage-history.js` (+`pricing.json`) | usage-window dashboard dims | OR-8, OR-10 |
| 7 | New daemon op | `agentd.js` serveConnection + `client._tryOnce` dispatch | old-daemon feature detection; byte counting if it carries data | OR-20, OR-21 |
| 8 | New remote fs/route with `?host=` | `routes/*.js` **and** `remote-fs.js` | shape parity with the local handler; dial-no-fallback | OR-19, OR-35 |
| 9 | New machine probe / health check | `hosts._hostShell` consumer | measure the *connection kind* the consumer uses; `deviceBounded` choice | OR-17, OR-18 |
| 10 | New per-session persisted field | `writeSessionMeta` (spread-first) | `restoreSessions` **and** `readoptOrphanKeeperSessions` | OR-13 |
| 11 | New per-session UI config | `sessionConfigs` whitelist in `sidebar-state.js` | every resume path that applies it | OR-39 |
| 12 | New field on session cards | `activeSessionsPayload()` | card renderer; sidebar merge digest | OR-16 |
| 13 | New WS message type | `ws-handler.js` switch | client `ws.js` handler; try/catch isolation | OR-32 |
| 14 | New REST endpoint | `src/routes/*.js` (not `server.js`) | auth exemptions if agent-facing | OR-30 |
| 15 | New setting | `settings-schema.js` + a **change listener** if read at render time | `serverSetting()` server-side; `onSettingsWrite` if it has a side effect | OR-30 |
| 16 | New session teardown/cleanup | ws `kill` case **and** onExit teardown branch | mechanism-agnostic for remote (keeper *and* agentd sids) | OR-14 |
| 17 | New spawn env var / secret to a machine | `agentEnv()` allowlist + the provisioning closure | 0600 file + `$(cat)`; never argv | OR-11, OR-12 |
| 18 | New agent tool / agent endpoint | static file in `data/bin` + `agent-routes.js` + `AGENT_TOOLS` | teaching text in `sessionToolsIntro`/`renderContext`; toggle gating | OR-27, OR-28, OR-29 |
| 19 | New injected-context content | `task-groups.renderContext*` + `agent-routes` | byte budget; diff path (`renderContextDiff`); `scripts/test-prompt-context.mjs` | OR-28 |
| 20 | New window type | `wm.createWindow` + `replayOpenSpec` case | `_openSpec` unconditional; `TRANSIENT_WINDOW_TYPES` decision | OR-36 |
| 21 | New mount/storage type | `mounts.js` `_rcloneFor` + type record | health sweep, child-process probes only | OR-31 |
| 22 | New user-visible string/dialog/toast | component + `i18n-zh/ja` | `npm run build` i18n check; `showToast`/`createModalShell` | OR-37, OR-41 |

---

# Refactor Plan

**Ground rules.** This is a production fleet with live dtach sessions that survive server restarts, in-field daemons on user machines, and secrets in spawn paths. Therefore:

1. **Fix the 17 confirmed defects on the *current* structure first**, as small patches. Do not bundle a bug fix into a move — a move makes the patch un-backportable to an instance running an older build.
2. Each batch below is independently shippable and reverts cleanly. Never combine a Phase-1 batch with a Phase-2 batch in one release.
3. Verification per batch = the named existing tests + `npm run build` + a real session smoke (`scripts/dbg-local-session-smoke.mjs`) for anything touching spawn/parse/restore.
4. **No file moves that change generated `data/bin` output bytes, wire formats, or on-disk paths.** Ever, in any phase, without a version bump and a field-daemon compatibility note.
5. Anything the cartography rated `dangerous` stays in Phase 3 and gets its own design round. Two items are explicitly **do-not-move** (see D-6).

---

## Phase 1 — Mechanical moves (no behavior change)

Each is a cut/paste plus imports. Nothing here changes control flow, on-disk state, or wire formats.

### Batch M1 — pure helpers out of `server.js`
| Move | To | Note |
|---|---|---|
| `classifyCliDeath` | `adapters/claude-code.js` | Makes it importable by ws-handler/hosts; keeps OR-33 enforceable |
| `modelsMatch` | new `src/model-match.js` (the `task-color-seq.js` shared-pure precedent) | Server twin of the client's `_modelMismatch` — this move is the prerequisite for de-duplicating them in Phase 2 |
| `detectXDisplay` / `stabilizeXAuth` / `refreshXEnv` + the `X_ENV` singleton | new `src/x-env.js` | **Preserve the by-reference mutable-object contract verbatim** (consumers hold the object, not a copy) |
| `bridgeVncSocket` | `vnc.js` | Only external dep is the upgrade-dispatcher ws |
| `remoteSysinfo` + `REMOTE_SYSINFO_SCRIPT` | `sysinfo.js` (inject `hosts._hostShell`) | Route becomes a one-liner |

*Verify:* build; `scripts/test-sys-panel.mjs`; a clipboard paste on a live terminal (x-env); open the Desktop window (vnc).

### Batch M2 — live/offline task-state convergence
Move `applyTaskToolUpdate`, `emitTaskListTodos`, `updateSessionTodos` → `session-store.js`, next to `scanTaskEventsFull`. Broadcast stays a callback injected from `server.js`.
*Why now:* the live path and the offline replay of the same tool families drifting is the 2.180.1 bug class; co-location makes the drift visible in review.
*Verify:* `scripts/test-task-scan.mjs`; a live session with TodoWrite + a restart.

### Batch M3 — codex thread heuristic
Move `pickCodexThreadCandidate` + `normalizeComparablePath` from `ws-handler.js` → `codex-session-store.js`.
*Verify:* `scripts/test-codex-remote-wrapper.mjs` + a codex resume.

### Batch M4 — usage-subsystem private-reach cleanup
| Move | To |
|---|---|
| `costBetween` / `costBetweenMulti` | public `UsageHistory` methods (e.g. `costForAccounts(ids, from, to)`) |
| anchor file slug + line reader (duplicated in `usage-estimator._file`/`lines()`) | one exported `anchorFileFor()` / `readAnchorLines()` in `usage-anchors.js` |
| three copies of the model→family classifier | one exported `modelFamily(model)` in `usage-history.js` next to `_tier` |
| `uh._evCache.rids` reach-through | public `UsageHistory.hasRid(rid)` |

*Why now:* all four are silent-failure shapes (a slug divergence makes the estimator learn from zero anchors with no error; a renamed `_evCache` turns rid-dedup into a permanent no-op that double-counts exactly during fast-burn windows).
*Verify:* `scripts/test-usage-anchors.mjs`, `test-pool-auto.mjs`, `test-account-pool.mjs`; compare `/api/usage-stats` totals before/after on a real ledger.

### Batch M5 — agentd source hygiene + host-home unification
- Split `serveFolder` (+`_davEntry`/`_davHref`/`_xmlEsc`) and `serveSocks` out of `agentd.js` into `src/agentd/serve-folder.js` / `serve-socks.js`. **Source-only split** — `npm run build:agentd` still emits one bundled file; keep the trailing-slash/root-confinement comments attached (that comment is a real 403 incident).
- `remote-fs._devHome` → call `hosts.homeDir` (one per-host home cache instead of two).
- `exit-proxy.resolve()` → `hosts.resolveRef(ref, {filter})`, exit-proxy passes its `allowExit` filter.

*Verify:* `scripts/test-agentd-devicemount.mjs`, `test-agentd-socks.mjs`, `test-exit-proxy.mjs`, `dbg-pair-smoke.mjs` (needs a real dialed device), byte-compare the built daemon's behavior against a paired machine.

### Batch M6 — route extraction (the stalled `src/routes/` pattern)
Move the inline REST clusters out of `server.js` into `setup(deps)`-style routers, following `routes/files.js`/`persistence.js`/`usage-routes.js`. Do these as **separate commits**, largest-blast-radius last:

1. `routes/ops.js` — self-update, maintenance, version, changelog-diff, incident, telemetry
2. `routes/tasks.js` — `/api/tasks*`
3. `routes/plugins.js` — `/api/plugins*`
4. `routes/machines.js` — machine-mounts, port-forwards, exits/allow-exit/agent-exit
5. `routes/mounts.js` — mounts, mount-tokens, gdrive/gmail auth
6. `routes/accounts.js` — accounts, pool, oat
7. `routes/hosts.js` — hosts CRUD, agent-tools, recent-cwds — **excluding** `graduate-dial` and `dial-pair`, which carry transport logic and belong with D-4

*Why last in Phase 1:* it is ~1,100 lines of pure re-parenting, so it is the safest bulk win, but it touches auth exemptions and `app.locals` wiring — do it after the smaller batches have proven the release cadence.
*Verify:* build; hit each moved route once (a scripted curl pass); `scripts/test-tool-toggles.mjs`, `test-integration-toggle.mjs`, `test-agents-overview.mjs`.

---

## Phase 2 — Careful consolidations (single-authority designs)

Each one unifies a semantic that is currently duplicated. Each needs a written single-authority statement in the moved module's header comment, and each is a *behavior-preserving* change that must be proven by a differential test, not by inspection.

### C1 — Remote account probes become account-domain
**Move:** `hosts.accountsStatus`, `readRemoteOAuth`, `readRemoteSubOAuth`, `cliPrimaryKey`, `renameHostSubDir` → a new `src/accounts-remote.js` taking `hosts._hostShell` as a dependency.
**Single authority:** `accounts.js` + `accounts-remote.js` jointly own "what a credential on a machine means"; `hosts` reports raw shell facts only (OR-23).
**Why:** these already say in-comment that they *mirror* AccountManager's local probes; the mirror drifted once (2.188.0 apiKeyHelper contradiction).
**Risk control:** the return shape is the `hostFacts` contract for `evaluateOnHost` — snapshot the shape in `scripts/test-account-verdicts.mjs` before and after; probes must keep riding `_hostShell` so dial devices stay covered.

### C2 — One machine-login creds reader
**Move:** `usage-routes._readOAuthCreds` / `getOAuthToken` → `accounts.js` as `globalUsageToken()` / peer of `subscriptionStatus()`.
**Why:** it is the **fourth** independent parser of the same `claudeAiOauth` shape and the *only* one with the macOS Keychain branch — so `subscriptionStatus()` and the usage probe can disagree on a Mac.
**Risk control:** read-only, never-refresh semantics must move verbatim (§ban-safety). Test on a Linux instance *and* reason explicitly about the Keychain branch.

### C3 — One device-first/ssh-fallback dispatcher
**Unify:** `remote-fs._run` + its ~12 per-method `_dev` branches, `machine-mounts._run`, `hosts._hostShell`, and the inline variants in `dirComplete`/`killRemotePid`/`_fetchRemoteByFind` → one `hosts.runOnMachine(...)` family with **explicit** parameters for the semantics each caller chose today (`throw` vs `{code:1}`, script vs argv, rethrow-for-dial vs swallow).
**Why:** this is the subsystem's biggest copy-paste liability and the direct cause of the remote-parity defect class (per-method divergence in `info()`/`stat()`/`readText()`).
**Risk control:** parameterize, do not normalize — a swallow→throw flip breaks the mount dialogs' honest errors. Do it method-by-method with `scripts/test-agentd-switchover.mjs` (real-host legacy-vs-device cross-check) after each.
**Bundle with:** the `archiveList` response-shape fix and the missing `?host=` branches (`extract-entry`, `/api/file/excel`, `/api/file/csv`) — those *are* this defect class, and the shared dispatcher is what stops them recurring. Factor the `unzip -l` / `tar -tvf` line parsers into one exported helper used by local and remote.

### C4 — Host provisioning cluster
**Move:** `BOOTSTRAP_STEPS`, `bootstrapScript`, the prototype-attached `bootstrap()`, `installAgentTools`, `uninstallAgentTools`, `installAgentd`, `agentToolsStatus`, static `AGENT_TOOLS` → `src/host-provision.js`.
**Why:** the prototype attachment *after* the class body is the code admitting it was bolted on.
**Risk control:** `AGENT_TOOLS` must stay the single list shared with ws-handler's per-spawn distribution; the POSIX node-finder strings (2.244.4) and the tar-over-stdin channel move **verbatim**. Verify with `test-node-bootstrap.mjs` + a real host install/uninstall round trip.

### C5 — Agent hooks + generated helpers
- **Move** `HOOK_FILES`/`HOOK_EVENTS`/`_findOurHookIn`/`_patchHookFile`/`agentHooksStatus`/`hookRegistrationSafe`/`ensureAgentHooks`/`stripAgentHookEntries`/`removeAgentHooks`/`checkAgentHookHealth`/`syncHookRegistration` → `src/agent-hooks.js` (deps: `HOOK_CMD`, `serverNotice`).
- **Move** `createEditorHelper`/`createStatusHelper`/`createHookHelper`/`userStatuslineCmd` → `src/agent-helpers.js`, templates as separate files rather than templates-in-templates.
**Why:** co-locating `agent-hooks.js` with the shipped `vibespace-hook-register.mjs` makes local/remote drift visible; the helper generators are where the P0 backslash-at-end-of-template incident happened.
**Risk control:** **output bytes and paths must be identical** (`agentToolsStatus` sha256-compares them). Diff generated files byte-for-byte before/after. Run `test-integration-toggle.mjs`, `test-tool-toggles.mjs`, plus a boot with the temp-server guard active.

### C6 — Feature clusters out of `server.js` (self-contained, injectable deps)
| Move | To | Note |
|---|---|---|
| `checkClaudeGoalStatus` + goal fragments | `src/goal-sync.js` | JSONL-tail sync for a CLI gap |
| `syncRemoteGroupCtx`/`ctxGroupsOf`/`scheduleCtxSync`/timer/`remoteCtxBaseFor` | `src/ctx-sync.js` | keep next to the `renderContext` ctxBase consumer |
| `_srvConsoleRing` state, `_incidentServerState`, `_incidentTargets` | `incident.js` | the console.* wrapper **stays installed as early as today** |
| `recordUsageAttribution` + `_lastAttrib` | `usage-history.js` | baker and reader (`_acctAt`/`_poolAt`) in one file — the no-double-count invariant becomes reviewable |
| `refreshAvailableModels`/`refreshCodexModels`/aliases/union-persist | `src/model-discovery.js` | keep the §ban-safety gate on the OAuth `/v1/models` fetch |
| `sessionAuth` | `accounts.js` (or `src/billing-display.js` beside it) | every rung restates accounts semantics (OR-2) |
| codex rate-limit summarizer (6 functions, ~180 lines) | `src/codex-usage.js` | third copy of the rollout-filename regex — unify with `usage-history`'s |
| `hosts.harvestUsage` | usage side, `hosts` supplies only the channel | preserve the throttle map + consuming-cursor semantics exactly |
| `hosts.fetchWorkflowState` | workflow domain | nonce payload format + 1MB dial clamp comment travel with it |
| port-forward's local observability (`detectLocal`, `_resolveInodeProcs`, `_classifyOrphan`, `killOrphan`, `PORT_SCAN`/`NONWEB*`) | `sysinfo.js` | `killOrphan`'s at-kill-time deleted-cwd re-verification is load-bearing; `_resolveInodeProcs` async-ness is a 2.241.2 event-loop fix |

### C7 — Model-match de-duplication
After M1, make the client import the shared `model-match.js` (esbuild pulls CJS like `task-color-seq.js`) so `modelsMatch` and `_modelMismatch` are one function. Alias-vs-full-id semantics (the bare-alias `startsWith` false-match) must be settled in the shared file.

---

## Phase 3 — Dangerous / structural (each needs its own design round)

Named only. Do not start any of these as a side effect of Phase 1/2.

- **D-1 · Split `setupSessionPty`'s two backend parsers into per-backend stream wiring** (`adapters/*` or `src/session-stream-{claude,codex}.js`). ~660 lines interleaving ~10 independent concerns (billing truth, model lock, pool odometer, goal, todos, subagents, permission truth). *Design must settle:* the shared mutable-session contract, ordering guarantees between concerns (e.g. served-model capture before repin), and how the main-thread-only guards (`!parent_tool_use_id && !isSidechain`) survive the split.
- **D-2 · Extract the remote/dial spawn provisioning from `ws-handler`'s `case 'create'`** into `src/spawn-remote.js` shared with `readoptOrphanKeeperSessions` (which today hand-rebuilds the same keeper inner command). *This is the highest-value structural fix* — three of the confirmed defects (wrong pipe sid on ssh kill, adopt-vs-billing, missing `_resumeSpawn` persistence) live in the seam between the create case and the restore path. *Design must settle:* the `{prelude, envPairs, tokenAssign, reverse}` interface, the adopt-vs-respawn decision point, and the sid identity used by teardown.
- **D-3 · Extract the pool/live-usage engine** (`sweepUsageAnchors`, `markLimitBanner`, `maybePoolAutoSwitch*`, `kickPoolEval`, `armWorkflowUsageWatcher`, the 30s timer, `writeUsageCacheForKey`, `probeUsage*`) into `src/pool-engine.js`. *Dangerous because* it re-points the creds symlink (changes what future spawns bill), writes ledger attribution, asks clients to restart conversations, and `markLimitBanner` rides the live stdout parse — i.e. it is entangled with D-1.
- **D-4 · Extract the dial-device registry** (`deviceForDial` and its stop()ed-dm/stale-stream invariants, `agentdHostToken`, `agentdMintDialPair`, `unpairDialDevice`, `ensureAgentdOnHost`, `daemonPtyShim`, the `/api/device-dial` upgrade branch incl. dial-in healing and back-tunnel re-own) into `src/agentd/dial-registry.js`; move `graduate-dial`/`dial-pair` routes with it. *Design must settle:* the complete on-dial-in heal sequence — and it should **add the pipe-attach re-own that is missing today** (the dial-chat-freeze defect), which is a behavior change, not a move.
- **D-5 · Extract `restoreSessions` + `readoptOrphanKeeperSessions`** into `src/session-restore.js` (against D-2's spawn helper), and the two one-shot home-rename migrations into `src/boot-migrations.js`. *Dangerous because* restore is the restart-survival contract; a dropped field or a reordered dedup silently loses live sessions.
- **D-6 · Discovery line-format three-site contract** (`hosts.js` ssh script, `hosts.js` device synthesizer, `agentd.js` snapshot) → co-locate parser + format with `claimJsonls`. Requires a fixture test spanning all three producers *first*; without it, drift silently loses remote sessions.
- **Explicitly DO NOT MOVE (documented decisions, not oversights):**
  - `hosts.findKeeperFor` — misplaced in spirit (it is resume policy, not transport), but it carries review-hardened adopt-vs-sweep invariants whose violation SIGTERMs a healthy claude. If ever moved: whole function + comments, atomically, re-tested on a real host.
  - `accounts.js` pool store mechanics (`setPoolTarget`'s symlink-to-temp+rename+utimes, `remove()`'s unlink-not-rmSync) — the symlink **is** the creds dir, which `accounts.js` owns. Moving these without their comments is a spawn-billing incident.
  - `agentd/mux.js` — the cleanest module in the tree; its only wart (post-construction callback mutation) lives in `client.js`, not here.

---

## Sequencing summary

```
defect patches (current structure)
        ↓
M1 → M2 → M3 → M4 → M5 → M6        (Phase 1, one release each, revertible)
        ↓
C3 (+ remote-parity defects) → C1 → C2 → C4 → C5 → C6 → C7
        ↓
design round: D-2  →  D-1  →  D-3  →  D-4  →  D-5  →  D-6
```

**Non-goals of this plan:** no wire-format changes, no on-disk layout changes, no generated-file content changes, no consolidation of the deliberate three-layer pool split, and no "while I'm here" behavior fixes inside a move commit.

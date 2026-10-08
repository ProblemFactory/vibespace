# VibeSpace

> **HOW TO USE (tiered knowledge, 2026-08-13):** CLAUDE.md is the auto-loaded INDEX + LAWS. The detailed operating essays live in `docs/kb-*.md` and are read ON DEMAND:
> **kb-file-structure.md** (per-file essays — read BEFORE modifying a file) · **kb-design-lessons.md** (§1–§17 + review invariants; §-references resolve there) · **kb-features.md** (shipped-behavior reference) · **kb-patterns.md** (cross-cutting coding patterns) · **kb-api.md** (REST/WS reference) · **kb-bugfix-invariants.md** (incident essays) · **docs/history-archive.md** (ancient chronicle).
> **Contract: before changing a subsystem, read its kb entries; when your change alters behavior, update the kb file IN THE SAME COMMIT — the kb files ARE the operating manual, this file only indexes them.**
> **Size law (2026-09-15, owner: "避免 context rotting"): this file is an INDEX — every entry here is a HEAD of ≤ ~300 chars ending in a `⇒ kb-…` pointer; the full essay (invariants, incidents, measurements) lives ONLY in the kb file it points to (`kb-design-lessons.md §18` = the full three-tier routing-table rows + the long laws). Never grow an index line into an essay again: write the essay in the kb file and put one line here.**
> **Index law (lane claude-md-diet, B-23e7 — this file is re-sent at every session start AND after every compaction): CLAUDE.md stays ≤ 100 000 bytes (test-architecture §82 ratchet). The per-file lines live in the kb-file-structure.md INDEX head, the per-incident lines in the kb-bugfix-invariants.md INDEX head. A new incident = a kb-bugfix-invariants entry + ONE index line at the head of kb-bugfix-invariants.md (≤ 300 chars); a changed file = its kb-file-structure INDEX line + essay — CLAUDE.md gets a line only for a law or a routing-table change.**

## Project Overview
A backend-agnostic web workspace for **coding agents** — manage many concurrent agent CLI sessions with a tiling window manager, file explorer, and code editor. Each backend (Claude Code, Codex, …) is driven through a `BackendAdapter` (`src/adapters/`); the UI, window manager, chat view, and session layer stay backend-neutral. Sessions run via native agent CLIs inside **dtach** for persistence across server restarts. (Project was "Claude Code WebUI" before the 2026-06-22 rename to VibeSpace — references to the `claude`/Claude Code CLI tool itself are unchanged.)

## How to Build and Run
```bash
# One-line install (checks deps, clones, builds):
curl -fsSL https://raw.githubusercontent.com/Member Q/vibespace/master/install.sh | bash

# Or manually:
npm install
npm run build   # esbuild bundles src/client.js → public/bundle.js (~1.8MB)
node server.js  # starts on port 3456 (or PORT env var)
# ./run.sh      # supervised: build once, then respawn on exit (survives an OOM kill)

# PRODUCTION (this machine runs it this way since 2.73.0): systemd USER service
./scripts/install-service.sh        # installs+enables ~/.config/systemd/user/vibespace.service (linger on)
systemctl --user restart vibespace  # THE way to restart after a build — do NOT kill+nohup by hand
./scripts/update.sh                 # pull+install+build+restart in one step (⚙ → Update VibeSpace… runs this in a shell terminal; dtach sessions survive)
journalctl --user -u vibespace -f   # logs (no more /tmp/vibespace-server.log)
# Unit: Restart=always/RestartSec=5 (survives OOM/crash — verified via SIGKILL), OOMScoreAdjust=-500,
# StartLimitIntervalSec=0 (retries forever while the NFS workspace mounts late), **KillMode=process**
# (CRITICAL — the default control-group KillMode killed every dtach session spawned AFTER the service
# migration on each restart, while pre-migration sessions survived; real incident, one session died on
# every restart. Only the node main process may be killed on stop), and baked PATH (node dir +
# ~/.local/bin — systemd's minimal env broke every CLI spawn; real incident). The service does NOT
# build — build at deploy, then restart. dtach sessions survive restarts by design.
```

## Architecture

### ⚑ THE THREE-TIER FINAL FORM (2.319.0) — where a NEW CHANGE goes, and which test gates it

The 2026-08 campaign (docs/design-three-tier.md, R0–R6 + session-brain + closure marathon) reached its terminal shape. Before writing code, route the change:

| The change touches… | It belongs in… | Gated by (run BEFORE commit) |
|---|---|---|
| **Facts about a machine** (discovery, sysinfo, probes, usage walk, transcript parse, ctx sync, writer sweep, shell prelude) | The SHARED module (src/discovery-facts, sysinfo, machine-probes, usage-walker, transcript-service, ctx-sync, writer-sweep, remote-shell) — the daemon bundles it, one implementation runs where the facts live; ssh scripts are FALLBACK RUNGS only | The module's parity suite: test-discovery-interpret / test-sysinfo-op / test-usage-walk-parity / test-transcript-parity / test-ctx-sync / test-writer-sweep / test-remote-shell — a one-sided edit FAILS them |
| **A new device op** | src/agentd/agentd.js handler + capability in the hello-ack + client method. THREE-TOUCH RULE (2.300.0, bit twice): reply carries `op` in the client's id-keyed routing set; unsolicited pushes get their own branch BEFORE prevControl; watches re-arm on reconnect. Reply via `mux.control`, never an invented helper | A real-daemon test (test-sysinfo-op is the template); capability-gate assert (old daemons are never asked — unknown ops HANG) |
| **Live session stdout consumers** (served model, usage odometer, banners, todos…) | `claudeSideEffects` in server.js — ONE implementation fed by the parse AND the device stream through `sbSeenFirst` (parse registers, device fills gaps). Never a new inline consumer in the parse block (= src/server/stdout/claude-stream-json.js since S5 … ⇒ kb-design-lessons §18 | test-session-brain-dark (mid parity is suffix-wise — every normalizer prefixes its own session id) |
| **Session creation/supervision** | The daemon pipe-session path (R6, `agentd.localPipeSessions`) is the FINAL form; dtach is the legacy path that dies by attrition. New spawn features go through buildRemoteExec (remote) / the r6Argv seam (local). … ⇒ kb-design-lessons §18 | test-remote-shell drift guard; test-agentd-session; **test-restore-liveness** (real fault-injected daemons + a real self-upgrading daemon under an end-to-end restore) |
| **A one-shot data migration** (reshaping stores on old→new update) | src/server/migrations.js (this instance) or the DEVICE_MIGRATIONS registry in agentd.js (devices, runs at daemon boot/self-upgrade) — BOTH through the shared runner src/migration-runner.js: ledger-keyed run-at-most-once, failed = retry next boot never block … ⇒ kb-design-lessons §18 | scripts/test-migrations.mjs (157) |
| **A turn nobody typed** (auto-resume's continue, the Stop nudge, Background Work notifications, agent messages, a codex reset credit, a browser control handback — anything that starts a BILLED turn with no per-occurrence owner action) | src/spend-authorizer.js (PURE decision) + src/server/spend-guard.js (ORCH: persisted `data/spend-budget.json`, journal, inbox), constructed by the pool engine so the identity is its OWN `fireIdentityFor`. Each producer's local floor stays as UX PACING … ⇒ kb-design-lessons §18 | test-spend-paths (308) + test-architecture §44 — the grep-derived census FAILS an unwired SITE; all three money-gate layers fail CLOSED |
| **A quota READING — its shape, who may write it, who may read it** | `src/quota-model.js` (PURE: the typed LIMIT SET — an account holds a LIST of limits, each with its own windows and provenance; `limitFor` is the ONE accessor, `windowState` fences off the not-yet-started window whose "reset" slides with the clock … **B-855a c1: the /usage panel probe may only WRITE the account it PROVES — isolated CLAUDE_CONFIG_DIR per spawn + identity verified against the API-derived window before any write, else archived as `panel-identity`** **inc-mubu23bd-5vxi: a stream reading names its lane through the producer's per-window fields; `seven_day_overage_included` IS the model-cap lane, never plan** ⇒ kb-design-lessons §18 | test-fable-cap-pool-storm (360) + test-quota-model (358: the per-limitId merge that never collapses, the empty-window drift fixture … |
| **Quota/vendor calls** | NOWHERE new. Exactly two files may construct vendor requests; the quota-refresh op (human-gated, on the login-holding machine) is the ONE device-side vendor surface. Passive capture (statusline/rate_limit_event/banners) is always preferred. **auto-cli (2.329.0** … ⇒ kb-design-lessons §18 | test-vendor-whitelist (64) FAILS any new vendor call until deliberately allowlisted with its gates |
| **Auto-resume / any "continue a stopped turn by itself"** | The DESCRIPTOR's two hooks — `quota.signalFromStream` (how a LIMIT shows up) and `descriptor.resume {form, deliver}` (how a TURN is restarted) — plus the harness-neutral core in src/server/auto-resume.js. `capsOf(backend).autoResume` is DERIVED (`deriveAutoResume` … ⇒ kb-design-lessons §18 | test-harness-contract (the conformance run: every row re-derived from its descriptor, every declared verb driven arm→fire into a stub of its own channel, a harness without one proven never-armed … |
| **Pool/billing decisions** | src/account-pool-auto.js (pure) + the engine in server.js; per-session links (plan C) resolve via poolCurrentFor(pool, webuiId). Every blocked outcome must SPEAK with named buckets. … **EVERY reading AND every rejection is attributed to the credential SLOT (the token-slot-validated link); a running claude follows its link from the next turn (MEASURED 2.1.281, `hotSwitchEvidence`); the OTel org is a machine-wide LABEL, never a member; a record > 2 min late never moves the pool** — the slot is resolved ONCE PER TURN (`rejectionSlotFor` / `readingSlotFor`), every blocked outcome SPEAKS with named buckets, placement follows the REQUEST model (lock > pick > spawn > served-if-not-a-fallback); USAGE CREDITS (B-ad05): `overageState().mode==='allowed'` ranks a member LAST (last resort only), a parked pool answers `on-credits` + ONE 6 h notice, spend-guard unchanged. SOFT band + warm mid-turn ⇒ moves at its first stop. ROOT FIX DESIGNED, NOT SHIPPED: docs/design-account-hardening.md (ONE lease + ONE write choke point + ONE spend authorizer). warm-cache: a warm conversation is never moved proactively (edf held; a wall still moves it). reset credit: warm ⇒ credit first, cold ⇒ switch first; ONE credit per account wall, spent as the member the process HOLDS (`accounts.poolMemberOfSession`: credit, reading, wall, continue, ledger, badge). **THE SPARE LANE (B-8a65):** a cap the request does NOT draw (`spareScoped`, the projection's set-aside) LEADS `edfCompare` after the priority; a spawn (`placing`) and an idle hot-pool conversation (> `SPARE_MOVE_MARGIN_PCT`) leave spare-rich members; EDF never moves onto more spare. ⇒ kb-design-lessons §18 | test-pool-auto (333) + test-account-pool (50) + test-pool-placement-ui (38) + test-account-verdicts (45) + test-auto-resume (233) + test-auto-resume-loop (221) + test-login-expiry (257) + test-readings-attribution (515) + test-codex-pool (269) … |
| **A channel ADAPTER, or anything about a channel RECORD** (docs/design-communication-panel.zh.md) | The adapter goes in `src/channels/<kind>.js` behind the registry's contract (`src/channels/index.js`) and NOTHING downstream learns its name — **gate on the capability row, never on an adapter id**, exactly as `src/backend-caps.js` does for harnesses. Groups: explicit, next-turn free, a wake billed + paced … ⇒ kb-design-lessons §18 | test-channel-groups + test-msg-cli-groups + test-channels-groups-ui (heavy: -groups-e2e) + test-channel-record (incl. the grep-derived FRAME CENSUS over every hyphenated tag the tree writes) + test-channel-caps (incl. r3's `off` leg with a scratch-dir patched copy) + test-channels-aggregate (the aggregated IM: scheduler arithmetic, budgets, grains) + test-channel-drain (a refresh-scheduling rule goes in PURE src/channel-drain.js, never the engine: the seeded walk) … |
| **Text a PEER wrote, toward an AGENT** (mail, Lark, dialog, group msg, job output, For-you quote, peer msg) | ONE belt `src/peer-text.js` toAgentText at every door; each door = a census ROW (rule + wiring pin), a new door without one is red ⇒ kb-design-lessons §18 | test-peer-text-census (102) |
| **An INTEGRATION CREDENTIAL — a key a user or a cluster provides for a vendor (a Lark app, a Google OAuth client, a browser license)** (docs/design-communication-panel.zh.md §14, P0b) | The ROW goes in PURE `src/integration-registry.js` (fields, cluster env names, the setup block, the Test declaration, `consumers` — and it lands WITH its consumer or names its `wiredIn` phase, decision 25 … ⇒ kb-design-lessons §18 | test-integration-registry (fast, 194 — incl. the env-NAME census over the tracked-file list, PRINTED, and the BUILDER census beside it with the verifier's built-name probe as its control … |
| **A desktop application window / a display backend** | PURE `src/desktop-apps.js` (rungs, ladder, fit, install plan) + PURE `src/office-open.js` (open a document in LibreOffice, §7.9) + SHARED `src/desktop-display.js` + SHARED `src/desktop-serve.js` (the machine half + the `desktop-serve` op, C1) + ORCH keeper (policy + a paired machine's registry, C2) / `desktop-access.js` / bridge / routes / views ⇒ kb-design-lessons §18 | test-desktop-apps, -display, -viewers, -serve, test-office-open, test-xpra-client, test-vnc-view (fast); heavy (incl. test-desktop-remote) ⇒ kb-design-lessons §18 |
| **The agent browser** (spawn env / profiles / live view / takeover / mediation / trace / window targets; design-agent-browser-v2.zh.md §3.2–§7.6, P0–P10) | PURE verdicts in `src/browser-*.js` + `src/window-*.js`, ORCH in `src/server/browser-*.js` + `window-targets-engine.js`, the CLIs `vibespace-browser` / `vibespace-window` … ⇒ kb-design-lessons §18 | test-browser-* + test-window-targets + test-live-strip (fast); test-browser-live / -multiview / -mediation-chrome / -tier3-chrome + test-window-target / -binding (heavy) |
| **A design canvas / an artboard** (the Design window) | PURE `src/design-model.js` (manifest, verdicts, THE ONE bundler) + ORCH `src/server/design-engine.js` / `src/routes/design.js` + the CLI `vibespace-design` + the client `design-window.js` / `design-canvas.js` / `design-pick.js`; frames `allow-scripts` ONLY ⇒ kb-design-lessons §18 | test-design-model + test-design-routes + test-design-canvas + test-design-docs (fast); heavy test-design-window |
| **A DELIVERABLE (an artifact row)** — a file the agent wrote, its card, the Artifacts chip | PURE `src/artifacts.js` + each descriptor's `artifactsOf` hook; ONE writer src/server/artifact-registry.js ⇒ kb-file-structure "src/artifacts.js" | test-artifacts, test-harness-contract |
| **A server cache a client also caches** | The invalidation entry point must NOTIFY (the 2.309.0 rule) — hook on the ONE entry point, never per call site | test-remote-discovery-dirty's drift guard pattern |

**ACTIVATION SWITCHES (code complete, soak-gated — flip deliberately, in order):** ① watch `sb-parity-hit/miss` in Diagnostics (step-2/3 live parity) → ② `agentd.localDiscovery` on (after `local-disc-snap-ms` looks sane on YOUR storage) → ③ `agentd.localPipeSessions` on (R6 — only after ①② soak; the design's sequencing law). Rollback = flip off; every path falls back structurally.

**ENFORCEMENT (2.323.0; PHYSICAL since 2.325-2.326): the tier rules above are a RED TEST, not prose** — scripts/test-architecture.mjs (107 asserts — incl. §43, the GATE CENSUS: every scripts/test-*.mjs is in exactly one ci.mjs tier or in EXCLUDED with a reason; and §44 … ⇒ kb-design-lessons §18

**STANDING SWEEP (the sysinfo lesson, 2.314.0): "twin-sets = 0" is not a state, it's a metric to re-measure.** A user caught a missed local/remote twin AFTER closure. When touching any "how much X" reader, grep for its sibling on the other transport first.


### Stack
- **Backend**: Node.js + Express + WebSocket (`ws`) + `node-pty` + dtach
- **Frontend**: Vanilla JS (ES modules) bundled with esbuild, xterm.js for terminals, CodeMirror 6 for editor
- **Session persistence**: dtach — claude processes run in dtach sessions, survive server restarts
- **Data persistence**: `data/layouts.json`, `data/session-meta/*.json`, `data/sockets/cw-*`

### Data Flow
```
Terminal mode:
  Browser (xterm.js) ←→ WebSocket ←→ node-pty (dtach -a) ←→ dtach socket ←→ pty-wrapper.js ←→ claude CLI
                                                                                  ↓
                                                                            buffer file (raw PTY)

Chat mode:
  Browser (ChatView) ←→ WebSocket (msg create/edit/meta) ←→ MessageManager ←→ server ←→ chat-wrapper.js ←→ claude --stream-json
                                                                   ↓
                                                          BackendAdapter (swappable)
```

## Cross-cutting laws (the always-loaded digest — full text lives in the kb files)

- **§ban-safety**: NEVER call Anthropic on a timer with a subscription token; vendor requests live in EXACTLY two files (scripts/test-vendor-whitelist.mjs enforces); passive capture is the default; the ONE owner-approved exception is auto-cli (`claude -p /usage`: burn-aware fast rung + owner-directed slow idle rung at a WANDERING 30–60min threshold, never a fixed cadence) — do NOT generalize it. Full: kb-design-lessons §9 + the routing table above.
- **Program-use billing**: sessions run interactive PTY mode — never `-p`/`--print`/Agent SDK for inference (moves usage to metered programmatic billing).
- **Public repo hygiene**: ZERO company/cluster detail, ZERO personal identifiers (users are userL/userW/userN in docs); secret-scan CI + pre-push guard.
- **Worktree-only smokes**: NEVER run server.js/boot smokes from the repo dir — repo data/ is PRODUCTION (#127 class); git worktree + own data/ + symlinked node_modules; harnesses set VIBESPACE_SKIP_AGENT_HOOKS=1. … ⇒ kb-design-lessons §18
- **Release discipline (THE TIER RULE, B-f4cb)**: bump + CHANGELOG + commit + push; CHANGELOG.md/.zh/.ja = the user's (docs/changelog-style.md, gate test-changelog-style); docs/changelog-engineering.md = ours. FAST = PURE/in-process < 10 s; HEAVY = server/browser/binary. ⇒ kb-design-lessons §18
- **CS separation**: `hostId` is a PARAMETER, never a branch — one implementation against a machine handle; new facts-about-a-machine code goes in the SHARED modules with a parity suite (routing table above).
- **Multi-client**: every persistent state change broadcasts to other clients live; UI actions chained after a store write must NOT wait for the broadcast echo.
- **Cache invalidation must NOTIFY**: a server cache a client also caches → the invalidation entry point pushes the recomputed RESULT (one dirty signal = one computation).
- **i18n quick rules**: `t()` with ENGLISH-STRING-AS-KEY on human-visible chrome ONLY (never protocol values/stored strings/agent-facing text); keep `escHtml()` around `t()`; sidebar cluster imports `t as tr`; same-spelling-different-meaning ⇒ `tc(ctx,str)`; new keys need zh+ja entries (i18n-check runs in build). Full: kb-design-lessons §16.
- **UI conventions**: theme vars only (no literal colors), `--radius`/`--radius-sm`, createModalShell for dialogs, NO native prompt/alert/confirm, SVG icons only (never emoji), `data-popover` Esc protocol, no global `.hidden`. Full: kb-design-lessons §17.
- **Injection budgets**: hook additionalContext wraps into <persisted-output> at exactly 10 KiB — tools/rules first, logs byte-budgeted last, 9600B hard cap (agent-routes).
- **Spawn hygiene**: agent sessions get `agentEnv()` (sanitized env, never raw process.env); display strings (host-labeled cwds) never reach a spawn; secrets ride env/files, NEVER argv.
- **Danger constants (memorize)**: NEVER delete data/sockets/cw-* (the socket IS the session). Production restart = `systemctl --user restart vibespace` ONLY (KillMode=process is load-bearing — the default killed every dtach session). Restarting the server from inside a Claude session is safe ONLY because of the CLAUDE_CODE_* env sanitizer in server.js (never remove it — silent transcript loss). Buffer/meta sweeps are age-based; kill-path teardown runs BEFORE activeSessions delete.
- **XSS**: NEVER interpolate user/peer-controlled strings into innerHTML unescaped (they sync to ALL clients — one miss = stored XSS fleet-wide); markdown goes through DOMPurify.sanitize(marked.parse()); build image overlays via .src property, never innerHTML.
- **Atomic persistence**: every data/*.json write goes through writeJsonAtomic (tmp+rename); stores flush on SIGINT/SIGTERM — a bare writeFileSync is silent data loss on the exact crash path the product exists to survive.
- **Listener lifecycle**: window-scoped document listeners bind to `winInfo._listenerCtl.signal` (AbortController, aborted on close); per-drag listeners get a per-drag controller — never a per-render one (tears down MID-DRAG).
- **Drag/resize ends at ONE door**: every drag door is fed from the element that CAPTURED the pointer (`src/lib/drag-feed.js`), ended ONCE by the PURE `src/lib/drag-end.js` verdict; `body.wm-dragging` shields every other pane; test-window-drag §5 = the door census ⇒ kb-patterns.md
- **Never block the event loop**: no sync fs/exec against mountpoints, /dav-sharing processes, or discovery sweeps — child processes/workers with timeouts only (three whole-instance outages: FUSE threadpool, execFileSync sweep freeze, device-mount self-deadlock).
- **No silent failures**: a failed USER action must reach the user (toast/dialog/server-notice) — telemetry having it ≠ reported; fetchJson never throws, so callers check `r?.error`.
- **Working mode**: route every change through the three-tier table above (it names the module AND the gating test); fixes go to git only — the user self-updates; bookkeeping via vibespace-status/-task/-ask each turn.

## File Structure — INDEX in docs/kb-file-structure.md

**File index: docs/kb-file-structure.md `## INDEX` head — read it before modifying a file; ~574 lines, one per file (the ⇒ marker = that file's full essay further down the same file). The task → file map and the server-side key functions follow it there.** ⇒ kb-file-structure.md

## Developer Guide: Where to Find & Modify Code

### Common Tasks → File Location Map

Moved verbatim to docs/kb-file-structure.md `## TASK → FILE MAP` (right after the file INDEX). ⇒ kb-file-structure.md

### Architecture Patterns — INDEX

**Full text: docs/kb-patterns.md (moved verbatim). Cross-cutting coding patterns — the mediator rule, one-time WS handlers, agentEnv() spawn sanitization, no-native-dialogs, drag rAF coalescing, uiScale drag conversions, popover/toast conventions, sidebar poll digest. Read before writing frontend chrome or a new spawn path.** Index:

- All frontend cross-class communication goes through `App` (mediator pattern). Classes receive a…
- One-time WebSocket handler pattern: Register via `ws.onGlobal()`, match on `type` + `sessionId`,…
- Debounced auto-save: `LayoutManager.scheduleAutoSave()` waits 2s after last change. Blocked by …
- Resizer: Reusable component with `inside: true` mode for fixed-position elements (sidebar). Don'…
- Layout restore: `attachSession()` returns `winInfo` synchronously (the DOM element). Position is…
- Proportional bounds tracking: `win.gridBounds` stores position `{left, top, width, height}` as f…
- Title-bar right-click = full window menu (2.212.0): showWindowContextMenu (taskbar.js, shared wi…
- WebSocket reconnect re-attach: On WS reconnect, all active sessions are re-attached. Timeout ≠ d…
- Layout sync (multi-client): State-based — full workspace state broadcast via `layout-sync` WS me…
- Atomic openSpec: `createWindow({ openSpec })` sets the openSpec before `_notify()` fires, ensuri…
- ChatView module split: ChatView is the controller (virtual scroll, op dispatch). Rendering deleg…
- Shared utilities: `createPopover(anchor, className, opts)` handles popover positioning/dedup/clo…
- Agent sessions get a SANITIZED env, never raw `process.env` (2.227.12, `agentEnv()` in ws-handle…
- Server-side settings reads use `serverSetting(key)` (server.js; ws-handler gets it via deps) — b…
- No native dialogs: `prompt()/alert()/confirm()` are banned — use `showInputDialog`/showConfirmD…
- Drag mousemove is rAF-coalesced everywhere (window.js titlebar drag + resize, tab-group icon dra…
- Cursor→window positioning MUST convert viewport→workspace coords (2.100.3, trace-diagnosed real …
- UI scale (DPI) + UI font size (2.257.0, per-DEVICE like the language): gs-menu rows writing loca…
- Sidebar session poll (5s) pauses while `document.hidden` (30s heartbeat + immediate catch-up on …
- Tab groups (chain model): Windows can be merged into tab groups by dragging one window's icon on…
- Tab merge hit-test: Shared helper `_detectTabMergeTarget(x, y, sourceWinId, hiddenEls)` on tab-g…
- Window type icons: Each window type has an inline SVG icon (`TYPE_ICONS` in tab-group.js): termi…
- Move mode: Right-click taskbar → Move. Full-screen overlay blocks all UI interaction. Window res…
- Loading screen: Inline splash in HTML (no CSS dependency). Fades out after `app.ready` promise r…
- Resume-all boot popup (2.250.0): sessions that come back STOPPED restore as read-only history wi…
- Keyed-row reconciliation replaces innerHTML wherever an editor may live (2.369.169, For-you panel): patch rows by data-id, never detach a box in use ⇒ kb-patterns.md
- showContextMenu takes ONE class name (add modifiers with classList.add after) · every chrome suite pre-sets `vs-onboarded` via scratch.mjs `ONBOARDED_SOURCE` before each navigate (§47 census — the wizard also skips itself on a box WITH sessions, so a miss is green locally, red on the runner) ⇒ kb-patterns.md

### Server-Side Key Functions

Moved verbatim to docs/kb-file-structure.md `## SERVER-SIDE KEY FUNCTIONS`. ⇒ kb-file-structure.md

## Key Design Decisions & Lessons Learned — INDEX

**Full text: docs/kb-design-lessons.md (moved verbatim; §-numbers unchanged). Read the relevant § BEFORE touching that area; update it in the same commit.**

- **§1 dtach for session persistence** — dtach NOT tmux (zero rendering layer); `dtach -c` never `-n`; NEVER delete socket files (the socket IS the session); pty-wrapper tees output to the buffer file.
- **§2 Mouse/scroll** — no middle layer; strip `\e[I`/`\e[O` focus events from onData; 6 tmux approaches failed (docs/history-archive.md).
- **§3 Ctrl+G external editor** — fake `code` script (GUI-editor whitelist trick) + HTTP bridge; never print to the terminal from the helper; POST carries the vsst_ Bearer.
- **§4 Session discovery** — LOCK-FIRST; claimJsonls exact→tail→mtime (mtime only over no-tail-evidence files); each lock claims ≤1 JSONL; status values tmux/external/stopped.
- **§5 Project path recovery** — cwd→dir encoding `replace(/[/._]/g,'-')` is deterministic; the reverse is ambiguous, prefer forward.
- **§6/6a/6b/6c Layout** — autosave/restore + gridBounds fractions; custom grid presets; MULTI-CLIENT sync anti-ping-pong (4 guards: seq, user-dirty w/ 60s expiry, defer-while-interacting, rounding epsilon — do not regress ANY); virtual desktops (visibility:hidden model, purge-vs-preserve on close).
- **§7/7a Modular frontend + mobile** — App mediator; isMobile/isTouch; long-press=contextmenu (never on selectable text — a selection); mobile yield-sidebar is CENTRAL.
- **§8/8a/8b xterm + rendering** — WebGL renderer (do not remove), clearTextureAtlas on font change, alt-screen awareness, query-response arbitration, self-hosted fonts (never third-party origin); hljs span-split fix; 交付夜 invariants (self-update dialog, /dav DAV class 2, archive ops, VNC probe retry, mountpoint hygiene ladder).
- **§9 Usage / rate limits — §ban-safety home** — DEFAULT = passive statusline capture; active poll is OPT-IN (accounts.activeUsagePolling); read-only token NEVER refreshes; OAuth Bearer + anthropic-beta header; approach history in docs/history-archive.md.
- **§10 Settings** — schema-driven; only add settings with working code; serverSetting() server-side (never the SyncStore).
- **§11 Chat mode dual-arch** — THE big one: chat-wrapper stream-json, permission stdio protocol, subagent virtual sessions, workflow viewer, goal loop (claude native + codex thread/goal RPC), interrupt delayed-fallback, model/effort/permission mid-session switches, model lock v2, fallback policy, task wakeups. Read §11 in the kb before ANY chat-pipeline change.
- **§12 Font discovery** — queryLocalFonts → fc-list fallback; client fonts are what matter.
- **§13 StateSync** — versioned diff broadcast + reconnect resync; register stores before set() (writes silently drop otherwise).
- **§14 Syntax highlighting** — 30 langs, EXT_TO_LANG, splitHighlightedLines carries the span stack.
- **§15 Frontend optimization** — minify+gzip; delivery-stall watchdog; stale-tab reload is PER-TAB (sessionStorage); index.html route injects ?v=mtime cache-busting.
- **§16 i18n** — see Laws digest above + kb §16 for the full wrapping rules.
- **§17 UI design conventions** — see Laws digest above + kb §17 for the token/radius/type tables.
- **2026-06-09 review invariants (v2.8.0)** + **2026-07-03 review invariants** — two do-NOT-regress lists (escHtml quotes, atomic JSON writes, AbortController listeners, XSS rules, one-time WS handler self-guards…). In the kb.

## API Reference — INDEX

**Full REST + WebSocket reference: docs/kb-api.md (moved verbatim). Adding/changing a route or WS message type ⇒ update kb-api.md in the same commit.** Quick shape: REST under /api/* (files, sessions, usage, accounts, hosts, mounts, tasks, agent-facing vsst_ endpoints), WS /ws (create/attach/input/kill + msg/layout-sync/state-sync families), /dav WebDAV, /proxy.

## Features Summary — INDEX

**Full behavior reference: docs/kb-features.md (moved verbatim). These sections describe SHIPPED behavior with embedded do-not-regress notes — read the relevant one before changing that surface.**

- **Deployment & Onboarding** — auth (password/Clerk SSO), Docker/K8s/Helm, onboarding wizard, config export/import (4-touch-point gotcha), Manage Agents, account switching + billing identity + verdicts (the accounts mega-essay), chrome customization/springs/zones, toolbar scale, mounts/storage rows, remote hosts + keeper, orphan sweep, kill-path teardown, async discovery sweep.
- **Terminal Management** — dtach sessions, per-terminal settings, bell/idle detection, clipboard image paste, CJK, multi-device size, contrast.
- **Chat Mode** — message rendering, permission cards, relative-path linkify, metadata popup, virtual scroll, minimap, search, drafts, uploads, resume bar, read-only views.
- **Window Manager** — snap/grid/presets, shake-bypass, tab groups, move mode, virtual desktops, taskbar stacking, resume-all boot popup.
- **Session Management** — Task Groups (岗位) refactor + backlog claim model + status/urgency + injection contracts + repo task files + remote ctx sync + group admin + New-Session prefills + right-click menu + Session Properties + per-session config. The 2.39.0 concept-refactor block SUPERSEDES older bullets where they conflict.
- **File Management** — explorer, multi-select, clipboard ops, archives, viewers (PDF/DOCX/XLSX/PPTX/CSV/hex/eml), uploads, cross-host.
- **UI** — themes, theme editor, embedded browser + proxy normalization, window-list popup.

### claude CLI 中途文本丢失 (2026-07-13, 上游bug — 产品无辜, 勿再向内排查)
stream-json 下 assistant 的 `thinking→text→thinking→tool_use` 三明治形状响应, 其 text 块会在**长寿会话**中被 CLI 从 stdout 流和 JSONL 转录**双双丢弃**(模型上下文保留 → 永久分叉; 全新会话不复现, 连同形状都不复现; wrapper/normalizer/renderer 逐层验证无辜)。用户视角="agent 没回复"。取证档案+判别矩阵+issue草稿: ~/workspace/AIWorkspace/SharedContext/claude-cli-text-loss.md。Agent 准则: 实质内容只放 turn 末尾消息(其后无工具调用), 中途只发可丢弃状态行。

- **2.284.0 field-test batch invariants**: message-meta billing row is THREE-state honest (host-namespaced `h:<id>:` rid suffix-match / not-yet-harvested says so + session identity / no-requestId falls back to session-level — never a silently missing row) … ⇒ kb-bugfix-invariants.md

### Bug Fixes Applied — INDEX

**Every incident line (459, moved verbatim by lane claude-md-diet) lives in docs/kb-bugfix-invariants.md `## INDEX` head, the essays below it (ancient one-liners in docs/history-archive.md) — search there before re-diagnosing a familiar symptom. A new incident adds its line THERE, not here.** ⇒ kb-bugfix-invariants.md

The 15 most recent (the last 7 days, dated by the commit that added each; copies — the INDEX head is the record):

- (2026-10-08) A PAGE THAT ANSWERED EVERY COMMAND WAS CALLED NOT RESPONDING (browser-held-not-hung): one tab's unanswered Page.enable read as a hung page. 不变量 = 'not responding' is a claim about the page's answers; a watch that cannot see in says so as itself. ⇒ kb-bugfix-invariants.md
- (2026-10-07) THE .229 MIRROR: A TAB READ PRUNED THE JOB WINDOW'S NEWEST ROOT (mirror-green-229, test-jobs-browser F11): CDP read before the await, holders after ⇒ a tab stamped between was pruned, the finalize closed nothing. 不变量 = a read prunes only what it could have seen. ⇒ kb-bugfix-invariants.md
- (2026-10-08) THE ARTIFACTS POPOVER RAN OFF THE VIEWPORT AND HAD ONE ORDER (owner, 43 + 174 rows) — 不变量 = a list of deliverables is bounded, filterable, grouped and sorted on the client over the same rows; the window is the same model at full size (kb-bugfix-invariants)
- (2026-10-08) THE OWNER COULD NOT OPEN WHAT THE AGENT FOUND (the memo was keyed by the agent's scope; hits missing from the copy were counted, not shown) — 不变量 = what one searcher found for a conversation is remembered for that conversation; a remembered hit is shown, with its context, never a count
- (2026-10-08) A MESSAGE TO A CONVERSATION THAT ENDED WAITED FOR EVER (owner 2026-10-07) — 不变量 = a record's state is a fact about its addressee; a dead addressee is said and the pair group closes (kb-bugfix-invariants)
- (2026-10-08) THE ACCOUNT'S POLICY HAD A ROUTE AND NO DOOR (userW 2026-10-07) — 不变量 = every grain that holds a value has a door the owner can find, and a refusal that names a value names where to change it (kb-bugfix-invariants)
- (2026-10-08) THE HIDDEN WINDOW DREW A PAGE NOBODY WATCHED AT NINE CORES (userW 2026-10-07) — 不变量 = software GL is for WebGL only, never raster; a browser nobody watches or drives paints nothing (switch browser.idlePaintFreeze, off; a thaw never touches another conversation's window) (kb-bugfix-invariants)
- (2026-10-08) THE CLI'S OWN UI CHATTER WORE THE RED 'UNKNOWN EVENT' CARD (cli-2-1-288-records) — 不变量 = a record is known by its measured shape and version; the oracle is pinned per CLI version, never to the box (kb-bugfix-invariants)
- (2026-10-08) A REPLY TO A MESSAGE AN AGENT SENT WOKE NOBODY (owner 2026-10-07) — 不变量 = what an agent sent is its own thread of concern: a reply to it, in any shape the channel has, reaches the sender; on a group each member for its own sends (kb-bugfix-invariants)
- (2026-10-08) THE AGENT COULD WATCH ONLY BY KEYWORD WHILE THE OWNER HAD TWELVE RULE KINDS (owner 2026-10-07) — 不变量 = one notification grammar, one validator, two doors (the dialog and the CLI); authority stays the owner's (kb-bugfix-invariants)
- (2026-10-08) A MAIN CONVERSATION'S OWN ASK BLINKED A HIDDEN DESKTOP AND TOLD THE TRAY NOTHING (a fleet user, 22 h) — 不变量 = an ask nobody answered in a minute is a For-you item, filed once, resolved by its answer
- (2026-10-08) A SIXTEEN-MINUTE SILENCE RE-READ A WHOLE MAILBOX (B-5134) — 不变量 = a gap in a cursor feed is one walk from the cursor; silence is never evidence of misses (kb-bugfix-invariants)
- (2026-10-08) THE SCHEDULER CARD WALKED 90 000 ROWS EVERY PASS (B-7978) — 不变量 = a census is read off kept facts; a pass is O(due + touched), never O(rows) (kb-bugfix-invariants)
- (2026-10-08) A SEARCH BY THE NAME A PERSON READS FOUND NOTHING, AND THE MISSING PERMISSION WAS A LOG LINE — 不变量 = the name a person reads is a search key; a permission the product lacks is said where the owner looks (kb-bugfix-invariants)
- (2026-10-08) EVERY RESTART RE-LISTED EVERY MAILBOX (B-6638) — 不变量 = a cursor the vendor gives us is persisted; a restart resumes, it never re-asks what it already knows (kb-bugfix-invariants)

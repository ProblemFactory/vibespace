# Lag / silent-failure / CS-separation audit — findings inventory & campaign plan

Date: 2026-08-10 · Source: 9-agent workflow audit `wf_30c39ca3-f79` (89 raw findings, 8 lenses) · Owner ask: (1) transition-state indicators on every slow path, (2) zero silently-dropped errors in the remote-sync chain, (3) full CS separation — local runs the SAME logic as remote (local = device #0) so remote-only bugs stop existing.

This document is the CAMPAIGN ANCHOR: phases below are executed release by release; check items off here as they ship (edit in place, note the version).

## Shared patterns (build once, retire the class)

### fetchJson thrower / result-check sweep
fetchJson never throws (returns null on failure, error bodies as data) — so try/catch around it is dead code fleet-wide. Add a throwing variant in utils.js (api(url, opts) → throws on null with 'Server unreachable' and on x.error) plus a lint-style sweep of existing sites; failure path = toast (the neighboring add-key handler already models it).
*Covers:* manage-agents roster ⋯ actions (~10 sites), plugins-ui api(), usage-window dashboard load + pricing save, custom grids, sidebar-mounts mount step, settings _save (res.ok variant), autocomplete chips — retires the entire 'false success toast / silent no-op' class (T1-14, T2-10, T2-12, T2-20, T4-1, T4-2).

### Stale-serve contract ({stale, fetchedAt, error} on every host-scoped cache)
discoverSessions already stale-marks; make it the universal contract: _fetchRemoteByFind, usage-cache host snapshots, harvest results, hosts-data bootstrap all return staleness + last-success metadata, and API/attached payloads thread it (transcriptStale, per-host harvest errors, verdict probe state). Server side is ~1 field per cache; clients render via the chip primitive below.
*Covers:* T1-7 (transcript banner), T1-11 (discovery cards), T1-12 (verdict probe state), T2-12/T2-13 (usage), T2-19 (zone age), T4-6 (quota pill age).

### pending/stale/error host-state chip primitive
One client helper (utils.js) rendering the three transition states with consistent visual language — amber 'checking {host}…' pulse, dim 'as of Xm ago' age, amber 'host unreachable — showing cached' — matching the existing session-card remoteState chip. Every host-scoped panel consumes it instead of hand-rolling (or omitting) per-surface indicators.
*Covers:* billing switcher + New Session rows (T2-4), remote zones + cross-host search (T2-19), Machines probe dot (T4-7), mounts connecting state (T2-15), integration row stub (T2-21), ChatView stale-history banner (T1-7), Usage device filter (T2-12).

### serverNotice degrade funnel for the spawn chain
Any best-effort degrade during spawn/kill emits a keyed serverNotice (the 2.226.0 channel built exactly for probe→user reporting) + a session-meta flag: tool-ship failure (also suppresses teaching dead tools via the existing enabledTools() composition), dial deviceAgentSetup degrade, agentd→keeper fallback (record effective transport for Session Properties), ctx-sync persistent failure, remote-kill unconfirmed, writer-sweep skipped, crash loop detected.
*Covers:* T1-2, T1-3, T2-14, T3-3, T4-5 — one funnel replaces 7 console.warn dead-ends.

### settle-on-link-death DeviceManager contract + bounded ops + leases
Rule: every DeviceManager handler registers onExit/onClose that SETTLES its promises (ready, done) — mux.onDead currently notifies only handlers that opted in; audit runStream, openSession/openPipeSession, and any future byte-channel consumer. Companions: deviceBounded for all fire-and-forget data-plane ops (remote kill), and timestamped expiring leases instead of boolean busy flags (_harvestBusy).
*Covers:* T1-3, T1-5, T1-6 — the whole 'promise pending forever after one flap' class, sibling of the 2.246.2 deviceBounded invariant applied to OPS not just connects.

### ws.request-with-placeholder as the only attach primitive
One attachWithPlaceholder(winInfo, msg, opts) helper: renders a 'Loading history from <host>…' placeholder at window creation, uses ws.request (isAlive guard + resend + timeout), observes attach-ack to reword the timeout to 'may still be working', and renders error replies / empty attaches as explicit system lines. Retires the bare-ws.send + hand-rolled-handler class (the wsRequest helper recommended by two prior review rounds, finally scoped).
*Covers:* T2-1 (create/attach), T2-2 (_viewIntoWindow), T2-3 (subagent viewer), plus the dead-session rescue path — every remaining blank-window-forever scenario.

### no execFileSync on the event loop (execFileP rule)
The 2.242.0 rule extended repo-wide: any ssh/subprocess call reachable from a request/WS handler uses the async execFileP already exported by session-store. Grep-able invariant; the create path is the last big violator.
*Covers:* T1-4 (four create-path sites); prevents recurrence in future remote features.

### reconnect-refetch registry
One list in app.js's onStateChange of every client mirror to refetch on ws reconnect (user-state and maintenance are already there; add tasks, session-status, hosts-data, settings-save retry). New broadcast-fed mirrors must register or they inherit the outage-staleness bug by default.
*Covers:* T2-11, T2-19 hosts bootstrap, T2-10 save retry.

### shared remote-shell prelude + single fact-collector (CS unification)
The structural T3 program: buildRemoteShellPrelude() consumed by all 5 spawn builders; discoverySnapshot as the one discovery fact source (K lines, shared extractName, tmux facts, codex names); one usage-walker module built into the shipped scanner; unified ctx-sync semantics. Ordered by incident density: spawn builders (5+ incidents) → discovery (2) → usage-scan (1 live) → ctx-sync (1).
*Covers:* T3-1 through T3-4 — converts 'every fix lands N times' into 'one implementation, all transports'.

## Phased plan

### Phase 1 — server-side correctness under lag (1 release): stop destroying state and freezing the loop
- [ ] src/hosts.js:957 findKeeperFor → three-state {found|empty|error}, ssh leg ≥15s; callers (ws-handler.js:279/1165/1256) refuse-or-retry on {error} instead of sweeping (T1-1)
- [ ] src/ws-handler.js:1276+1179 writer-sweep failure on a respawn resume → fail the create with a retryable error + serverNotice; keeperSid-adoption path unaffected (T1-2)
- [ ] src/ws-handler.js:2288-2320 remote kill: deviceBounded(~8s) for dial, check both legs' outcomes, serverNotice on unconfirmed kill; add kill-not-found error reply at :2216 + backendSessionId from the 4 remaining kill senders (T1-3, T3-6)
- [ ] src/ws-handler.js:746/902/952/1274 — four execFileSync('ssh') → execFileP, same timeouts (T1-4)
- [ ] src/agentd/client.js:427 runStream onExit/onClose settle done + overall deadline; usage-routes _harvestBusy → timestamped lease (T1-5)
- [ ] src/agentd/client.js:320 openSession/openPipeSession settled-flag + rejectReady on pre-ready link death; DialSessionBridge 30s belt (T1-6)
- [ ] src/hosts.js:1157 harvestUsage dial → rethrow device error, reset throttle on any failure (T3-6)
- [ ] src/remote-fs.js:252 write() dial rethrow guard (mirror info()); :334 downloadZipTo close-code handling (T2-17)
- [ ] src/ws-handler.js:1047 IMMEDIATE drift fix: add the PATH export + nvm sourcing to the ssh-terminal builder (T3-1 hot fix)
- [ ] data/bin/vibespace-usage-scan:83 port the 2.265.0 subagents/** + workflows walk (T1-15 hot fix)
- [ ] server.js:2202 restoreSessions chains handle.ready → setupSessionPty, catch → localAttach (T2-18)

### Phase 2 — client-side lies (1 release): staleness channels + the surfaces that claim success on failure
- [ ] src/hosts.js:991 _fetchRemoteByFind returns {path, stale, fetchedAt} (typed error when no cache); thread transcriptStale/transcriptError through ws-handler attach (:2071/:2173/:2009) + /api/session-messages; ChatView amber cached-history banner with Retry (T1-7)
- [ ] src/lib/chat-view-seek.js:192 gap-seek: null ≠ fromLine 0 — keep cursor, retry row, never _finishSeek on failure (T1-8)
- [ ] src/routes/sessions.js:168 /api/session-history-gap host branch + &host= at the 5 client sites (seek slabs ×3, minimap init, streaming search) (T3-5)
- [ ] src/lib/sidebar.js:671 poll keeps previous _systemSessions on failure + N-consecutive-failures staleness row (T1-9)
- [ ] src/lib/sidebar-workbench.js:341 manage-mode marks resolve against _wbRemoteHosts, killPid gets host, 'N skipped' in the toast (T1-10)
- [ ] src/lib/sidebar-workbench.js:257 thread stale/staleAt into cards → 'last known · Xm ago' chip + zone header row (T1-11)
- [ ] src/lib/session-lifecycle.js:649 _warmHostAccountCache failure → state 'error' + ~15s retry TTL, never fresh warmAt; switcher/New-Session render 'availability unknown' rows (T1-12)
- [ ] src/lib/session-props.js:170 Properties account select reads _hostVerdicts + fires _warmHostAccountCache (B-f531 compliance) (T1-13)
- [ ] src/lib/sidebar-mounts.js:923/1688/1827 mount step through the throwing api() — error keeps the dialog open, no premature success toast (T1-14)
- [ ] src/lib/file-explorer.js:590 drag-copy sends progress:1 → _trackTransferOp (T1-17)
- [ ] src/lib/file-explorer.js:600 navigate() nav-seq (discard stale responses) + 300ms-grace loading row (T1-16)
- [ ] routes/files.js:1143 remote stat emits duSize (T3-6)

### Phase 3 — shared primitives build-out (1-2 releases): retire the classes, not the instances
- [ ] utils.js: fetchJson thrower api() + sweep — manage-agents ⋯ actions (×10), plugins-ui, usage-window load + pricing save, custom grids, settings _save res.ok + reconnect retry (T2-10, T2-12, T2-20, T4-1, T4-2)
- [ ] utils.js: pending/stale/error host-state chip primitive; apply to billing switcher + updateAcctRow 'checking {host}…' (T2-4), remote zones ⟳/age/search rows (T2-19), Machines testing dot (T4-7), mounts connecting flag in list() + row (T2-15), integration-row stub (T2-21)
- [ ] session-lifecycle.js: attachWithPlaceholder helper — create/attach placeholder + attach-ack observation + reworded timeout (T2-1); _viewIntoWindow → ws.request + placeholder (T2-2); subagent viewer error/empty rendering + server-side fetch-failure threading (T2-3)
- [ ] server.js/ws-handler.js: serverNotice degrade funnel — tool-ship failure (+ suppress dead-tools teaching), dial deviceAgentSetup degrade (+ log per-tool swallows), agentd→keeper fallback (+ effective transport in session meta), ctx-sync per-group lastSyncOk/Error in task-detail, crash-loop notice (T2-14, T4-5)
- [ ] app.js:334 reconnect-refetch registry: add _fetchTasks + session-status (+ hosts-data reset from T2-19) (T2-11)
- [ ] chat-view.js:777 pagination catch + res.ok + spinner (T2-5)
- [ ] manage-agents.js: roster-render warn row (:1001), watcher-timeout final-probe+toast (:341), refresh-all summary toast (:502) (T2-6/7/8)
- [ ] session-props.js:131 loading placeholders terminate with error lines (T2-9)
- [ ] usage-routes.js:478 readRemoteOAuth unreachable-vs-token-absent + throttle-after-probe; usage-window per-host harvest errors + last-harvest timestamp (T2-12, T2-13)
- [ ] file-explorer-ops.js:388 remote extraction through the extractOps pattern (T2-16)

### Phase 4 — CS unification (2 releases, T3 by incident density)
- [ ] ws-handler.js: extract buildRemoteShellPrelude() consumed by all 5 remote builders; run writerSweepScript on LOCAL resumes of externally-held conversations too (T3-1)
- [ ] Discovery unification: agentd discoverySnapshot gains keeper/pipe metas (K lines) + tmux facts + shipped-raw-head naming; one shared extractName() over local heads and remote lines; remote codex names extracted (T3-2, T4-10, hosts.js:1364)
- [ ] Ctx-sync semantics unified (caps both ways with skipped-files report, or chunked dial reads); per-group sync status record feeding the Phase-3 funnel (T3-3)
- [ ] usage-scan built from one shared walker module required by usage-history.js; codex rollout harvest follow-up (T3-4)
- [ ] Exploratory: local spawn via device #0 openPipeSession (single spawn ladder — parameterized tool-ship/account-placement/writer-sweep over dm.runCmd/fsWrite) (T3-1 long-term)

### Phase 5 — polish (rides any release)
- [ ] file-explorer.js:266 bookmarks save toast + reconcile fetch (T4-1)
- [ ] chat-input.js:471 /goal optimistic chip + timeout restore-as-draft (T4-3)
- [ ] Remote dir autocomplete: ~4-5s fsList timeout + {error:'host unreachable'} shape through routes/files.js:119 → dropdown/chips 'host not responding' state (T4-4)
- [ ] manage-agents.js:1261 collapsed-accordion quota pill age label (T4-6)
- [ ] sidebar-workbench.js:149 shared matchesFilter(s, f) for local + remote + cross-host search (T4-8)
- [ ] routes/files.js:83 locate over dm.runCmd or {unsupported:'remote'} (T4-9)

## Tiered findings (deduped)

### T1 (17)

1. **T1-1**
   - file: src/hosts.js
   - line: 957
   - surface: remote resume adopt-vs-respawn (findKeeperFor)
   - class: silent-error
   - severity: high
   - mergedLenses: ['spawn-chain', 'hosts-dataplane', 'divergence-census']
   - problem: catch{return null} makes probe FAILURE (10s ssh timeout — below the documented ≥15s session-establishing bar) indistinguishable from 'no live keeper'; callers then run the writer sweep and SIGTERM the healthy surviving remote claude mid-turn. The code's own comment (hosts.js:946-951) names this exact hazard.
   - fix: Three-state result ({found}|{empty}|{error}); raise ssh leg to ≥15s; on {error} skip the sweep and refuse the resume with a retryable 'host is slow — a live copy may still be running' error (or re-probe once).
2. **T1-2**
   - file: src/ws-handler.js
   - line: 1276
   - surface: pre-resume writer sweep (ssh 1276 + dial 1179)
   - class: silent-error
   - severity: high
   - mergedLenses: ['spawn-chain', 'hosts-dataplane', 'divergence-census']
   - problem: Both sweep legs console.warn-and-continue on failure — under exactly the lag the sweep exists for, the resume proceeds to spawn a SECOND writer onto the same JSONL (B-4058 double-writer class) with zero user-visible signal.
   - fix: When the sweep fails AND the resume is a respawn (no keeperSid adoption), fail the create with a retryable error (ignoreNoConvo-style override), or minimally serverNotice that the double-writer guard was skipped.
3. **T1-3**
   - file: src/ws-handler.js
   - line: 2288
   - surface: Terminate of a remote/dial session (kill case, 2288-2320)
   - class: silent-error
   - severity: high
   - mergedLenses: ['spawn-chain', 'hosts-dataplane', 'divergence-census']
   - problem: exited/'terminated' broadcasts BEFORE teardown resolves; ssh execFile err ignored, dial killPipeSession swallowed at 3 layers, and the dial leg rides the UNBOUNDED ~2.7min device() ladder. UI reports success while the host-side claude keeps running/billing (double-writer at next resume). Related: kill with an unresolvable id silently no-ops (2216, no else reply; 4 client senders omit backendSessionId).
   - fix: deviceBounded(id, ~8s) for the dial kill; check both legs' outcomes and on failure serverNotice('terminated locally, but the process on <host> could not be confirmed dead'); reply {type:'error', code:'kill-not-found'} when no session resolves and pass backendSessionId from the remaining kill senders.
4. **T1-4**
   - file: src/ws-handler.js
   - line: 746
   - surface: create/resume spawn ladder — event loop
   - class: unbounded-op
   - severity: high
   - mergedLenses: ['spawn-chain', 'divergence-census']
   - problem: Four execFileSync('ssh') calls on the create path (tool tar :746 20s, API-key ship :902 15s, sub-creds tar :952 20s, writer sweep :1274 20s) block the WHOLE server event loop — a lossy host (banner-hang mode, 2.246.2) can freeze every client's WS traffic ~60-70s per create. Exactly the 2.242.0 discovery-freeze class, never applied to the spawn chain.
   - fix: Convert all four to the async execFileP helper session-store already exports (handler is already async; keep the same timeouts — the fix is only sync→async).
5. **T1-5**
   - file: src/agentd/client.js
   - line: 427
   - surface: DeviceManager.runStream (remote usage harvest)
   - class: unbounded-op
   - severity: high
   - mergedLenses: ['hosts-dataplane']
   - problem: runStream registers only {onData, onExitMsg}; mux link-death notifies via onClose/onExit — neither present — so link death mid-stream leaves `done` pending FOREVER. hosts.harvestUsage hangs, and usage-routes' _harvestBusy=true is held across the await: one flap permanently kills remote usage collection for ALL hosts until restart.
   - fix: Add onExit/onClose that settle done with {error:'device link lost'} + an overall deadline; make _harvestBusy a timestamped lease that expires.
6. **T1-6**
   - file: src/agentd/client.js
   - line: 320
   - surface: openSession/openPipeSession ready promise (dial chat + terminal)
   - class: unbounded-op
   - severity: high
   - mergedLenses: ['hosts-dataplane']
   - problem: handle.ready settles only on an explicit open/error control; a link death between open request and daemon reply fires onExit before the consumer assigned it (post-await) — ready stays pending forever, DialSessionBridge hangs at await, window blank indefinitely with no retry. The pre-ready twin of the B-b87b CRITICAL fixed only for the post-ready data path.
   - fix: Track settled flag; stored onExit/onClose rejectReady('device link lost') while ready is unsettled; belt: Promise.race the bridge's await with ~30s deadline emitting session-error.
7. **T1-7**
   - file: src/hosts.js
   - line: 991
   - surface: remote transcript cache (_fetchRemoteByFind) + attach swallow (ws-handler.js:2071-2179, routes/sessions.js:69)
   - class: stale-cache-lie + silent-error
   - severity: high
   - mergedLenses: ['chat-transcripts', 'divergence-census']
   - problem: Stale-serve on host-down returns a bare path — no staleness channel (unlike discovery's {stale:true}); all attach/viewOnly/session-messages consumers swallow the fetch error into console.error. A days-old transcript renders as current; a COLD cache renders a blank chat indistinguishable from an empty conversation ('No messages in this session's transcript yet' misdiagnosis).
   - fix: Return {path, stale, fetchedAt} from every stale-serve branch (typed error when no cache); thread transcriptError/transcriptStale into the 'attached' payload + /api/session-messages; ChatView renders an amber 'showing cached copy from <time> — <host> unreachable' banner with Retry.
8. **T1-8**
   - file: src/lib/chat-view-seek.js
   - line: 192
   - surface: huge-session scroll-up gap seek
   - class: silent-error
   - severity: high
   - mergedLenses: ['chat-transcripts', 'client-silent-failures']
   - problem: .catch(()=>null) → _gapCursor=0 → _finishSeek permanently REMOVES the seek sentinel: one transient fetch failure silently ends all earlier-history loading for the window's lifetime — the conversation appears to begin at the failure point.
   - fix: On data==null keep _gapCursor unchanged, clear _gapLoading, show a transient 'couldn't load earlier messages — scroll to retry' row; only a real fromLine===0 may finish the seek.
9. **T1-9**
   - file: src/lib/sidebar.js
   - line: 671
   - surface: 5s session poll (/api/sessions)
   - class: silent-error
   - severity: high
   - mergedLenses: ['sidebar-discovery']
   - problem: No res.ok/data.error check: a transient 500 (e.g. unguarded readdirSync racing a deleted project dir) sets _systemSessions=[] — the ENTIRE session list vanishes and flip-flops back next poll; the outer catch{} additionally hides network failure with no staleness marking.
   - fix: On failure KEEP the previous _systemSessions (never replace with []); after N consecutive failures show a dim 'session list may be out of date' header row.
10. **T1-10**
   - file: src/lib/sidebar-workbench.js
   - line: 341
   - surface: manage-mode batch terminate/archive on remote discovered cards
   - class: silent-error
   - severity: high
   - mergedLenses: ['sidebar-discovery']
   - problem: Marks resolve only against _allSessions — remote discovered sessions (in _wbRemoteHosts) are silently dropped, then the toast claims 'applied' anyway; user confirms a danger dialog, gets success, remote claude keeps running. Even resolvable kills call killPid WITHOUT host — the exact host-less local-kill bug fixed in 2.191.0 at session-card.js.
   - fix: Also resolve against _wbRemoteHosts (key `${backend}:${sessionId}`), pass s.host to killPid, count unresolvable marks as 'N skipped' in the toast.
11. **T1-11**
   - file: src/lib/sidebar-workbench.js
   - line: 257
   - surface: Recent/History remote zones — stale discovery cards
   - class: stale-cache-lie
   - severity: high
   - mergedLenses: ['sidebar-discovery']
   - problem: Server stale-marks unreachable-host discovery ({stale, staleAt}) but the client drops the flag at 3 layers (_loadRemoteHost, _remoteToCardSession whitelist, zone count) — hours-old scans of a dead host render as fresh, including 'external' cards implying live processes.
   - fix: Thread stale/staleAt into _remoteToCardSession; amber 'last known · Xm ago' chip on stale cards + a 'showing cached results — host unreachable' zone header row.
12. **T1-12**
   - file: src/lib/session-lifecycle.js
   - line: 649
   - surface: _warmHostAccountCache (billing switcher + New Session verdicts)
   - class: silent-error
   - severity: high
   - mergedLenses: ['agents-accounts', 'client-silent-failures']
   - problem: Probe failure stamps warmState='done' + fresh warmAt BEFORE the error check — no retry for the full 2-min TTL, and both surfaces keep rendering legacy-fallback verdicts as DEFINITIVE wrong reasons ('never finished signing in', 'not logged in on {host}') instead of 'host unreachable — availability unknown'.
   - fix: On failure set state 'error' with ~15s retry TTL (never stamp fresh warmAt); renderers show 'couldn't reach {host} — account availability unknown' rows and rebuild-in-place when a retry lands.
13. **T1-13**
   - file: src/lib/session-props.js
   - line: 170
   - surface: Session Properties 'On resume' account select
   - class: divergent-logic
   - severity: high
   - mergedLenses: ['agents-accounts']
   - problem: Computes linked/held/blocked CLIENT-side from cold caches, never reads _hostVerdicts nor warms — a direct violation of the B-f531 rule ('NEVER add a surface that computes its own linked/held/blocked') that already caused 4 incidents on sibling surfaces; on a fresh page every host-held/linked subscription is wrongly blocked and never un-greys.
   - fix: Call app._warmHostAccountCache(rHost) and prefer _hostVerdicts verbatim (broadcast-driven re-render gives rebuild-on-arrival for free), keeping current logic only as probe-in-flight fallback — same structure as showBillingSwitcher.
14. **T1-14**
   - file: src/lib/sidebar-mounts.js
   - line: 923
   - surface: Storage connect (add mount / import share / pull-mount rw, lines 923/1688/1827)
   - class: silent-error
   - severity: high
   - mergedLenses: ['client-silent-failures']
   - problem: The actual mount step is a bare unchecked fetch followed immediately by a SUCCESS toast + dialog close — exactly the failure-prone step (fuse mount vs slow/denied backend) reports success on failure; a one-step regression from the file's own api() thrower standard used for record creation.
   - fix: Route the mount POST through the throwing api() wrapper; on error keep the dialog open showing the server message BEFORE any success toast.
15. **T1-15**
   - file: data/bin/vibespace-usage-scan
   - line: 83
   - surface: remote usage ledger harvest
   - class: divergent-logic
   - severity: high
   - mergedLenses: ['divergence-census']
   - problem: Shipped reimplementation of the local UsageHistory walk never got the 2.265.0 subagents/** + workflows fix — every remote host's workflow/subagent usage (~$205/run measured invisible locally) is missing from the ledger TODAY, under-reporting remote $ and re-poisoning dead-reckoning rates for host-billed identities.
   - fix: Port the subagents/** walk now (immediate); structurally, build the scanner from the same walker module usage-history.js requires so the twins cannot diverge again (T3-4).
16. **T1-16**
   - file: src/lib/file-explorer.js
   - line: 600
   - surface: explorer navigation (esp. ?host=) — pending state + response race
   - class: no-indicator + race
   - severity: high
   - mergedLenses: ['files-mounts', 'client-silent-failures']
   - problem: navigate() has zero pending state AND no request sequencing: on a lagging host users re-click, and two in-flight navigates race — the SLOWER (older) response can overwrite the newer directory. refresh()/setHost share the path.
   - fix: Monotonic nav-seq per call (discard stale responses) + a ~300ms-grace 'Loading {path}…' dim/row cleared in success and error paths.
17. **T1-17**
   - file: src/lib/file-explorer.js
   - line: 590
   - surface: explorer→explorer drag-drop copy (cross-host relay)
   - class: no-indicator
   - severity: high
   - mergedLenses: ['files-mounts']
   - problem: _receiveDraggedFile posts /api/file/copy WITHOUT progress:1 (unlike _paste's 2.215.0 fix) — a multi-GB cross-host tar relay shows nothing until the terminal toast; users re-drag, stacking concurrent relays.
   - fix: Send progress:1 and route the opId through the existing this._trackTransferOp(opId, label, destPath), exactly as _paste does.

### T2 (21)

1. **T2-1**
   - file: src/lib/session-lifecycle.js
   - line: 319
   - surface: create/resume/attach window — blank until reply
   - class: no-indicator
   - severity: high
   - mergedLenses: ['spawn-chain', 'chat-transcripts']
   - problem: Window body is empty from createWindow until 'created'/'attached' builds the ChatView — lawfully 5-60s remote (homeDir ladder, tool tar, writer sweep, transcript pull); the 12/15s timeout toast misdiagnoses a slow host as a broken connection and invites an abandoning reload. The initial attach (line 491) also never observes the existing attach-ack proof-of-life (consumed only by _reattach).
   - fix: Pending placeholder ('Creating on <host>… / Loading history from <host>…') in winInfo.content at creation, removed by the reply; attach matchFn observes attach-ack and rewords/suppresses the timeout to 'may still be working'; consider a create-ack mirroring attach-ack.
2. **T2-2**
   - file: src/lib/session-lifecycle.js
   - line: 1096
   - surface: View History window (_viewIntoWindow incl. dead-session rescue)
   - class: no-indicator
   - severity: high
   - mergedLenses: ['chat-transcripts', 'client-silent-failures']
   - problem: viewOnly attach is bare ws.send + hand-rolled handler: no timeout/resend/placeholder; _reattach skips readOnly windows, so a ws drop mid-remote-pull leaves the window PERMANENTLY blank — indistinguishable from an empty conversation.
   - fix: Switch to ws.request({...}, handler, {isAlive, resend:true, timeoutMs:20000, onTimeout: 'still loading — the host may be slow'}) (viewOnly attach is idempotent) + 'Loading transcript…' placeholder.
3. **T2-3**
   - file: src/lib/chat-view.js
   - line: 1727
   - surface: subagent / workflow-agent View Log viewer
   - class: silent-error
   - severity: medium
   - mergedLenses: ['chat-transcripts', 'client-silent-failures']
   - problem: 'error' reply is treated as pure cleanup (offGlobal + return) and empty 'attached' renders nothing — remote workflow agents under host lag give a permanently blank read-only window; server-side fetchAgentJsonl failure is console-only. Layout-replay path (session-lifecycle.js:1276) shares the gap.
   - fix: Mirror _viewIntoWindow: appendSystem(msg.message || 'Agent transcript could not be loaded') on error, explicit 'No messages…' empty-state, ws.request with timeout; thread the server-side fetch failure into the reply.
4. **T2-4**
   - file: src/lib/session-lifecycle.js
   - line: 773
   - surface: billing switcher + New Session account row cold-cache window
   - class: no-indicator
   - severity: medium
   - mergedLenses: ['agents-accounts']
   - problem: While the ~15s probe is in flight, fallback verdicts render as definitive disabled rows with no 'checking {host}…' marker; rows flip under the cursor when the rebuild lands; updateAcctRow (app.js:1780) additionally shows 'not logged in on {host}' derived from NO data and silently resets a now-disabled selection to Default.
   - fix: While warmState==='pending', append a dim '⟳ checking accounts on {host}…' row and suffix fallback reasons '(unconfirmed)'; label uncertain New-Session options '{name} — checking {host}…'; toast when a rebuild invalidates the current selection.
5. **T2-5**
   - file: src/lib/chat-view.js
   - line: 777
   - surface: chat pagination (_extendTop/_extendBottom/_fetchMessagePage)
   - class: silent-error
   - severity: medium
   - mergedLenses: ['chat-transcripts']
   - problem: try/finally with no catch → unhandled rejection, scroll-up silently does nothing; _fetchMessagePage never checks res.ok so a 500 maps to 'no more history'; remote pagination can stall ~15s with no affordance.
   - fix: Catch with one throttled 'couldn't load older messages — scroll to retry' row; check res.ok; small top spinner while _loading.
6. **T2-6**
   - file: src/lib/manage-agents.js
   - line: 1001
   - surface: machine sections — roster render swallow
   - class: silent-error
   - severity: medium
   - mergedLenses: ['agents-accounts']
   - problem: try{await render}catch{} makes any roster throw vanish the whole accounts section — this exact swallow already hid the racct ReferenceError for releases and is still in place.
   - fix: .usage-warn row 'Accounts roster failed to render — {message}' in the catch + telemetry event (rail-dispose-failed pattern).
7. **T2-7**
   - file: src/lib/manage-agents.js
   - line: 341
   - surface: login-completion watchers (5 sites)
   - class: silent-error
   - severity: medium
   - mergedLenses: ['agents-accounts']
   - problem: All watchers give up silently after ~5min — a login completed later (MFA, slow OAuth) is never finalized and the account stays 'not logged in' with no explanation.
   - fix: On timeout: one final probe + refresh, then toast 'Stopped watching for the login — press Re-check if you completed it'.
8. **T2-8**
   - file: src/lib/manage-agents.js
   - line: 502
   - surface: ⟳ Refresh-all fan-out
   - class: silent-error
   - severity: medium
   - mergedLenses: ['agents-accounts']
   - problem: Failures surface only as inline rows — on the Accounts tab / collapsed accordions the row doesn't exist and errors are dropped entirely; Anthropic calls were made, click 'succeeded', zero evidence of failure (静默失败零容忍).
   - fix: Accumulate row-less failures into one summary toast/header line, or skip targets whose section isn't rendered.
9. **T2-9**
   - file: src/lib/session-props.js
   - line: 131
   - surface: Session Properties — status history + Agent steps
   - class: silent-error
   - severity: medium
   - mergedLenses: ['agents-accounts', 'client-silent-failures']
   - problem: Both fetches .catch(()=>{}) — placeholders replaced only in .then, so any failure (esp. remote transcript-backed todos) shows permanent 'Loading…'.
   - fix: On catch/!r.ok replace the placeholder with 'Couldn't load — {reason}' (+ host name); broadcast-driven re-render is the retry.
10. **T2-10**
   - file: src/lib/settings.js
   - line: 192
   - surface: settings persistence (every toggle)
   - class: silent-error
   - severity: medium
   - mergedLenses: ['client-silent-failures']
   - problem: POST wrapped in catch{} and res.ok never checked — a dropped save leaves local UI showing the new value while server/other clients keep the old; server-read settings (agents.* integration switches) silently don't apply; quiet revert on reload.
   - fix: Check res.ok, toast 'Setting could not be saved — will retry', re-run _save() once on ws reconnect (onStateChange hook already exists).
11. **T2-11**
   - file: src/lib/app.js
   - line: 334
   - surface: WS reconnect resync — tasks + session-status mirrors
   - class: stale-cache-lie
   - severity: medium
   - mergedLenses: ['client-silent-failures']
   - problem: Reconnect refetches maintenance/settings/user-state but NOT tasks or session-status — outage-window changes never arrive; a failed boot _fetchTasks leaves task-detail on 'Loading task…' forever. Exact class already fixed for user-state (2.223.4).
   - fix: Add _fetchTasks + session-status refetch to the onStateChange reconnect block; toast once when the boot fetch fails.
12. **T2-12**
   - file: src/lib/usage-window.js
   - line: 113
   - surface: Usage dashboard load + pricing save + harvest errors
   - class: silent-error
   - severity: medium
   - mergedLenses: ['client-silent-failures', 'hosts-dataplane']
   - problem: Three sibling gaps: fetchJson null renders as 'No usage recorded yet' (a lie); pricing save toasts 'Prices saved' on failure and discards edits; per-host harvest {error} entries (line 160) are discarded so days-stale remote ledger data shows unmarked.
   - fix: Distinguish null from empty (error panel + Retry); check pricing save result before leaving the editor; render per-host harvest errors + last-successful-harvest timestamp in the Device filter area.
13. **T2-13**
   - file: src/usage-routes.js
   - line: 478
   - surface: remote host quota ⟳
   - class: silent-error
   - severity: medium
   - mergedLenses: ['hosts-dataplane']
   - problem: readRemoteOAuth returns null for BOTH token-absent and host-unreachable — route answers 'no valid login token — log in on the host' (wrong remediation) when the host is merely down; throttle stamped BEFORE the probe blocks immediate retry.
   - fix: Distinguish {unreachable:true} from token-absent; only stamp the throttle after the probe reached the host.
14. **T2-14**
   - file: src/ws-handler.js
   - line: 772
   - surface: spawn-chain degrades (tool ship :772, dial deviceAgentSetup :1006, agentd→keeper fallback :1336, ctx sync server.js:3700)
   - class: silent-error
   - severity: medium
   - mergedLenses: ['spawn-chain', 'divergence-census']
   - problem: Four best-effort degrades are console-only: tools not shipped but still TAUGHT (dead-end training, the exact class enabledTools() prevents); dial setup degrades to zero integration invisibly (per-tool fsWrite swallows ship PARTIAL sets with no log); keeper fallback hides recurring provisioning failures; ctx sync failure leaves agents taught file paths that don't exist on the host.
   - fix: One serverNotice degrade funnel: keyed notice per degraded spawn naming host + what's missing; session flag suppresses/annotates the tools teaching; record effective transport in session meta (Session Properties shows it); per-group lastSyncOk/Error surfaced in task-detail.
15. **T2-15**
   - file: src/mounts.js
   - line: 599
   - surface: storage rows during connect window + machine pull-mount errors (machine-mounts.js:589)
   - class: no-indicator + silent-error
   - severity: medium
   - mergedLenses: ['files-mounts']
   - problem: 10-25s connect window exposes no 'connecting' state to other clients (row opacity wiped by any broadcast); pull mounts that fail every retry while the machine is ONLINE render a grey 'Pending — remounts when reachable' lie with the real reason unreachable from the UI.
   - fix: Expose connecting flag in list() + _notify() at connect start (amber pulsing dot); record last _up() failure per pull rec, expose as error in list(), render via the existing mounts-errline pattern.
16. **T2-16**
   - file: src/lib/file-explorer-ops.js
   - line: 388
   - surface: remote archive extraction
   - class: divergent-logic
   - severity: medium
   - mergedLenses: ['files-mounts']
   - problem: wantProgress = !this._host gates the polled op to LOCAL only — remote falls back to a synchronous POST with zero feedback for up to 5 min, resurrecting remote-only the exact pre-2.111.18 bug.
   - fix: Run remote extraction through the same extractOps pattern (drive via _run/runStream counting lines); minimally an indeterminate 'Extracting {name}…' row for the remote branch.
17. **T2-17**
   - file: src/remote-fs.js
   - line: 252
   - surface: file write to a dial device + remote Download-as-Zip (:334)
   - class: silent-error
   - severity: medium
   - mergedLenses: ['files-mounts']
   - problem: write()'s dial catch falls through to the ssh branch whose sshArgs throws the misleading 'dial-out device has no ssh' lecture, masking the real device error (info()/stat() already have the guard); downloadZipTo has no close-code handler so a missing zip binary/dead dir saves a 0-byte .zip as a successful download.
   - fix: Mirror the info() guard in write() (rethrow for transport==='dial'); handle child close code in downloadZipTo (destroy socket / error status; optionally pre-probe `command -v zip`).
18. **T2-18**
   - file: server.js
   - line: 2202
   - surface: session restore via local device #0 (agentd M1)
   - class: silent-error
   - severity: medium
   - mergedLenses: ['hosts-dataplane']
   - problem: restoreSessions never awaits handle.ready — a later session-error (dead dtach socket) only rejects the un-awaited promise; localAttach() fallback never runs and the restored terminal sits permanently blank.
   - fix: Chain h.ready.then(setupSessionPty).catch(→localAttach); attach a no-op catch to keep the rejection observed.
19. **T2-19**
   - file: src/lib/sidebar-workbench.js
   - line: 82
   - surface: remote-zone plumbing (hosts bootstrap :82, retry loop :103, ⟳ feedback :92, cache age :90, cross-host search :166)
   - class: silent-error + no-indicator
   - severity: medium
   - mergedLenses: ['sidebar-discovery']
   - problem: Five sibling gaps in one file: _hostsDataLoading never resets on failure (host switchers gone for the tab lifetime); fetch-failure stores sessions:null defeating the retry guard (tight retry loop, error never on screen); ⟳ with a cached list gives zero feedback for tens of seconds; one-shot cache shows no age while the local zone refreshes at 5s; search skips loading/errored hosts with no 'searching {host}…' or failure rows.
   - fix: finally-reset + array-guard + reconnect retry for hosts data; keep prior sessions + lastFailAt backoff on catch; spinning ⟳ + 'refreshing…' suffix while loading-with-cache; 'as of Xm ago' on stale snapshots; per-host searching/failed rows under Remote matches.
20. **T2-20**
   - file: src/lib/manage-agents.js
   - line: 1912
   - surface: roster ⋯ actions + plugins dialog (plugins-ui.js:76)
   - class: silent-error
   - severity: medium
   - mergedLenses: ['client-silent-failures']
   - problem: fetchJson never throws, so every roster mutation's catch is dead code (rename/delete/default/note/email ×10 sites silently no-op and repaint old state); plugins api() passes null through, toasting 'Installed' with nothing installed.
   - fix: Sweep with the fetchJson-thrower pattern (T-shared-1): check !r || r.error at each site; plugins api() throws on null.
21. **T2-21**
   - file: src/lib/manage-agents.js
   - line: 1072
   - surface: machine section — integration row probe
   - class: silent-error
   - severity: low
   - mergedLenses: ['agents-accounts']
   - problem: Integration probe runs after the loading row is removed; failure = row simply absent, indistinguishable from 'not applicable' — a user debugging broken remote injection sees nothing.
   - fix: 'Integration: checking…' stub row, replaced by the real row or an inline 'probe failed — {host} unreachable' warn line.

### T3 (6)

1. **T3-1**
   - file: src/ws-handler.js
   - line: 1047
   - surface: spawn command builders — 5 remote shell templates + 4 transport ladders + local
   - class: divergent-logic
   - severity: high
   - mergedLenses: ['divergence-census', 'spawn-chain']
   - incidentDensity: highest — AMBIENT_OAT_UNSET needed 5 applications (2.267.0); dial sweep/ctx/kill each shipped missing once; CONCRETE LIVE DRIFT: ssh-terminal builder (:1047) lacks the PATH export + nvm sourcing the other 4 have → remote terminal dies 'command not found' where remote chat works
   - problem: Every spawn-env fix must land N times across dial-terminal/ssh-terminal/dial-chat/ssh-chat-agentd/ssh-chat-keeper + local; writerSweepScript exists only in the remote branch so a LOCAL resume of an externally-held conversation has NO double-writer guard at all.
   - fix: IMMEDIATE: add the missing PATH export to :1047 (Phase 1). Then extract buildRemoteShellPrelude(h, {cwd, integrationOn, tokenAssign, acctEnv, envPairs}) consumed by all five, and run writerSweepScript locally too; long-term route local spawn through device #0 openPipeSession so all transports build the identical command.
2. **T3-2**
   - file: src/hosts.js
   - line: 1210
   - surface: session discovery — triple implementation (local sweep / ssh script / agentd snapshot)
   - class: divergent-logic
   - severity: medium
   - mergedLenses: ['divergence-census', 'sidebar-discovery']
   - incidentDensity: high — 2.117.0 naming fix had to land twice; remote codex names are null unconditionally (cards degrade to folder labels); remote tmux claudes classify as unattachable 'remote-running'; agentd snapshot (default-ON path) carries no K keeper lines so keeperSid attach-hints are silently absent
   - problem: Naming/classification logic hand-synced across routes/sessions.js extractSessionMeta, the hosts.js grep script (:1364-1381), and the synthesized snapshot; only claimJsonls is shared.
   - fix: Make discoverySnapshot the ONE fact collector: ship raw early user records / run one shared extractName() over both; add keeper/pipe metas + tmux facts to the snapshot and synthesize K lines in the device branch; eventually local /api/sessions consumes device #0's snapshot.
3. **T3-3**
   - file: server.js
   - line: 3700
   - surface: ctx-folder sync — three implementations (local none / ssh rsync / dial per-file hash)
   - class: divergent-logic
   - severity: medium
   - mergedLenses: ['divergence-census', 'spawn-chain']
   - incidentDensity: medium — dial-only caps (≤400 files / ≤2MB) mean a 3MB context file reaches ssh hosts but silently never a dial device; per-file swallows already produced the 'agents taught paths that never existed' class (B-b87b)
   - problem: Divergent semantics + invisible failures; injected file index lists files that never arrived.
   - fix: Unify caps (explicit skipped-files report both ways, or chunked reads for dial); per-group lastSyncOk/lastSyncError on the record, surfaced in task-detail + serverNotice on persistent failure with live remote members; fall back to local paths / omit the index when the last sync failed (overlaps T2-14).
4. **T3-4**
   - file: data/bin/vibespace-usage-scan
   - line: 1
   - surface: remote usage scanner — shared walker module
   - class: divergent-logic
   - severity: medium
   - mergedLenses: ['divergence-census']
   - incidentDensity: one confirmed live divergence (T1-15); scanner is also claude-only v1 so remote codex usage is never harvested
   - problem: Shipped twin of usage-history.js's walk with no shared source.
   - fix: After the Phase-1 hot port, extract one walker module built into the shipped scanner from the same source usage-history.js requires; add codex rollout support as a follow-up.
5. **T3-5**
   - file: src/routes/sessions.js
   - line: 168
   - surface: /api/session-history-gap — no ?host= (seek slabs, full-file search, whole-conversation minimap)
   - class: divergent-logic
   - severity: medium
   - mergedLenses: ['chat-transcripts']
   - incidentDensity: violates the documented 2.108.1 'EVERY history consumer passes ?host=' rule — the exact class that made externally-started remote sessions open blank
   - problem: Remote huge-session Ctrl+F search and the time-minimap read the local cache frozen at last attach — silently missing every turn since, while the identical local session works.
   - fix: Add the host branch (throttled fetchSessionJsonl/fetchCodexJsonl before findSessionJsonlPath) + append &host= at the 5 client fetch sites (chat-view-seek.js:64/153/169/319, chat-view.js:909, chat-search.js:170).
6. **T3-6**
   - file: src/hosts.js
   - line: 1157
   - surface: harvestUsage dial fallthrough + kill-not-found (ws-handler.js:2216) + duSize shape (routes/files.js:1143)
   - class: divergent-logic
   - severity: medium
   - mergedLenses: ['hosts-dataplane', 'spawn-chain', 'files-mounts']
   - incidentDensity: each is the B-b87b shape-drift class; cheap point fixes riding Phase 1/2
   - problem: Dial harvest failure surfaces the dead ssh branch's 'has no ssh' error + throttle reset lives in unreachable code (15-min silent lockout); kill with unresolvable id has no else reply; remote /api/file/stat returns `du` while the client reads `duSize` → remote folder size always 'unknown' despite the 30s du succeeding.
   - fix: Rethrow e2 for dial + reset throttle on any failure; kill-not-found error reply (in T1-3); emit duSize (keep du) or read `duSize ?? du` client-side.

### T4 (10)

1. **T4-1**
   - file: src/lib/file-explorer.js
   - line: 266
   - surface: bookmarks save
   - class: silent-error
   - problem: POST failure swallowed after local re-render — edit silently reverts on next load.
   - fix: Toast in the catch + re-fetch /api/bookmarks to reconcile.
2. **T4-2**
   - file: src/lib/app.js
   - line: 1278
   - surface: custom grid presets add/remove
   - class: silent-error
   - problem: fetchJson null → silent no-op.
   - fix: else-branch toast 'Could not save grid preset — server unreachable'.
3. **T4-3**
   - file: src/lib/chat-input.js
   - line: 471
   - surface: /goal command
   - class: silent-error
   - problem: Fire-and-forget ws.send, textarea cleared — goal text vanishes if the wrapper is dead.
   - fix: Optimistic 'setting goal…' on the 🎯 chip cleared by goal-updated; ~10s timeout → toast + restore text as draft.
4. **T4-4**
   - file: src/hosts.js
   - line: 634
   - surface: remote dir autocomplete (hosts.js:634 + routes/files.js:119 + autocomplete.js:54)
   - class: silent-error + unbounded-op
   - mergedLenses: ['hosts-dataplane', 'divergence-census', 'agents-accounts']
   - problem: fsList inherits 30s default (local budget is 500ms); every failure collapses to [] — down host indistinguishable from 'no matching dirs'; recent-cwds chips silently empty on failure (dead .catch).
   - fix: Short timeoutMs (~4-5s) on fsList; return {suggestions:[], error:'host unreachable'} so the dropdown/chips can render 'host not responding' instead of empty.
5. **T4-5**
   - file: src/ws-handler.js
   - line: 1483
   - surface: resume crash-loop detector
   - class: silent-error
   - problem: ≥3-creates-in-10min detection is console+telemetry only; loops from causes other than 'No conversation found' restart invisibly.
   - fix: Promote to serverNotice ('conversation <id> restarted Nx in 10 min — something is failing at spawn').
6. **T4-6**
   - file: src/lib/manage-agents.js
   - line: 1261
   - surface: Machines tab collapsed accordion quota pill
   - class: stale-cache-lie
   - problem: Persisted host snapshot (possibly days old) renders with no age marker, unlike row-level _acctUsageHtml.
   - fix: Append the same fetchedAt age label to the pill text/title.
7. **T4-7**
   - file: src/lib/sidebar-mounts.js
   - line: 660
   - surface: Machines rows connectivity auto-probe
   - class: no-indicator
   - problem: In-flight probe renders as grey 'Not tested yet' for up to 10s on panel open.
   - fix: Pulsing dot + 'testing…' tooltip while _hostTesting.has(h.id).
8. **T4-8**
   - file: src/lib/sidebar-workbench.js
   - line: 149
   - surface: sidebar text filter — remote field coverage
   - class: divergent-logic
   - problem: Remote filter matches only cwd/projDir/name/sessionId — 'codex' finds every local codex session and zero remote ones.
   - fix: Factor one shared matchesFilter(s, f) used by _wbFilterRemote, _renderRemoteSearchAll and the local path.
9. **T4-9**
   - file: src/routes/files.js
   - line: 83
   - surface: rel-path locate fallback on remote hosts
   - class: divergent-logic
   - problem: ?host returns {hits:[]} — remote rel-path clicks report 'not found' with no marker.
   - fix: Route the bounded find over dm.runCmd (identical prune list, 3s bound) or return {unsupported:'remote'} so the client explains the limitation.
10. **T4-10**
   - file: src/agentd/agentd.js
   - line: 900
   - surface: discovery-snapshot missing keeper metas
   - class: divergent-logic
   - problem: Snapshot never scans run/ or state/sessions — no K lines on the default dataPlane path; absorbed today only by findKeeperFor's re-probe.
   - fix: Folded into T3-2 (add keeper/pipe metas to the snapshot).

## Raw findings (89, by lens — full evidence)

### lens: agents-accounts

- **[high/silent-error]** `src/lib/session-lifecycle.js:649` — Billing switcher + New Session account row (_warmHostAccountCache)
  - problem: When the host accounts-status probe fails (unreachable/slow host, route returns {error} which fetchJson parses fine), _warmHostAccountCache stamps _hostAcctWarmState='done' + _hostAcctWarmAt=Date.now() at lines 647-648 BEFORE the `if (!r || r.error) return` — so for the full 2-min TTL no retry fires, verdicts never arrive, and both the billing switcher and the New Session account row keep rendering legacy-fallback verdicts ("never finished signing in", "can't ship to {host}", "not logged in on {host}") as definitive disabled rows. The user is never told the host probe failed; a perfectly usable host-held/linked subscription reads as broken for 2 minutes, with a confident WRONG reason instead of "host unreachable — availability unknown".
  - fix: On `!r || r.error`, do not stamp a fresh warmAt (allow immediate retry, matching the .catch path), record a per-host 'probe-failed' state, and have the switcher/account-row renderers show an amber "couldn't reach {host} — account availability unknown" row instead of the definitive fallback reasons; optionally toast once.
- **[high/divergent-logic]** `src/lib/session-props.js:170` — Session Properties — 'On resume' account select
  - problem: The subBlocked/hostLinked/hostSubHeld logic (lines 164-174) computes linked/held/blocked CLIENT-side from cold caches (app._hostOwnUsage[rHost].orgEmail, app._hostSubsKnown[rHost]) and never reads _hostVerdicts nor calls _warmHostAccountCache — the file has zero references to either. This violates the B-f531 rule ("NEVER add a new surface that computes its own linked/held/blocked — read verdicts") that already fixed the switcher, New Session dialog, and Manage-Agents roster after the 2.239.2 incident. On a fresh page, a remote session's Properties disables every host-held/linked subscription as "blocked on this host" with a wrong tooltip and — since this surface fires no probe — it never un-greys unless some OTHER surface happens to warm the cache. It also misses every verdict-only reason (held-identity-mismatch, oat rungs, not-on-this-host).
  - fix: Have the render call app._warmHostAccountCache(rHost) (the render already re-runs on broadcasts, so the rebuild-on-arrival pattern works for free) and prefer app._hostVerdicts[rHost][a.id] verbatim, keeping the current logic only as the probe-in-flight fallback — same structure as showBillingSwitcher's vOf/subBlock.
- **[medium/no-indicator]** `src/lib/session-lifecycle.js:773` — Billing switcher cold-cache window
  - problem: While the accounts-status probe (bounded ~15s server-side via _hostShell) is in flight after showBillingSwitcher fires _warmHostAccountCache, the menu renders the legacy fallback verdicts (lines 812-844) as definitive disabled rows — there is no "checking {host}…" marker anywhere in the menu, so the user cannot distinguish 'this account genuinely can't run there' from 'the probe hasn't answered yet'. When the answer lands the menu is silently removed and rebuilt in place (line 657-661), so rows flip disabled→enabled under the cursor with no explanation; under a slow host the wrong state is readable (and actionable — the user picks a worse account) for up to ~15s.
  - fix: When rHostId is set and _hostVerdicts[rHostId] is absent while _hostAcctWarmState[rHostId]==='pending', append a dim disabled row "⟳ checking accounts on {host}…" and suffix the fallback-derived disabled reasons with "(unconfirmed)"; keep the existing rebuild-on-arrival.
- **[medium/silent-error]** `src/lib/manage-agents.js:1001` — Manage-Agents machine sections — account rosters
  - problem: renderMachine wraps both roster renders in `try { await this._renderClaudeAccounts(actx); } catch {}` (lines 912-913 and 1001-1002), and the renderers themselves bail silently (`if (!acct) return` at 1416; `catch { return }` at 543) — any throw or /api/accounts fetch failure makes the ENTIRE accounts roster silently vanish from that machine's section with no error row. This exact swallow already hid a real ReferenceError (`racct`) that killed the codex roster on every host view for releases (admitted in the comment at lines 593-595), and the swallow is still in place, so the next such bug again renders as 'this machine just has no accounts'.
  - fix: In the catch, append a one-line `.usage-warn` row ("Accounts roster failed to render — {message}") into the section, and fire a telemetry event (rail-dispose-failed pattern) instead of an empty catch.
- **[medium/silent-error]** `src/lib/manage-agents.js:341` — Host/subscription login watchers (Manage-Agents)
  - problem: Every login-completion watcher gives up SILENTLY after ~5 min: _watchHostLogin stops at `++tries > 50` (line 341), the _addSubscription finalize poller at `++tries > 100` (line 81), _addConsoleAccount (line 108), _addCodexSubscription (line 139), and the wizard's watch (line 740) — all `clearInterval; return` with no toast. The user was explicitly told "VibeSpace captures it automatically", so a login completed after minute 5 (slow host, user reading OAuth pages, MFA) is never finalized/announced: the account silently stays "not logged in" and the surface never refreshes, with nothing telling the user the watcher stopped or that a manual re-check is needed.
  - fix: On watcher timeout, show a toast ("Stopped watching for the {host} login after 5 min — if you completed it, press Re-check / reopen Add subscription to finish capture") and/or run one final probe + refresh before exiting; consider extending the interval instead of hard-stopping.
- **[medium/silent-error]** `src/lib/manage-agents.js:502` — Manage-Agents ⟳ Refresh-all fan-out
  - problem: _refreshAllQuota builds targets for EVERY configured host from this._agentsHostsList (lines 489-494) regardless of what is rendered, but failures only surface as inline `.acct-refresh-err` on an existing `.acct-key-row` — `if (!row || !row.isConnected) return;` (line 502) drops the error entirely. On the Accounts tab no host sections exist at all, and on the Machines tab a collapsed accordion's section contains no rows (fill() only runs on expand) — so every failed host refresh ('No valid token', throttled, unreachable) for a non-expanded machine is silently discarded; the Anthropic call was made, the click 'succeeded', and the user sees zero evidence anything failed (静默失败零容忍).
  - fix: Accumulate failures whose row is missing and surface them once at the end as a summary toast ("Refresh failed for {hostA}, {hostB}: …") or as a line under the Refresh-all header; alternatively skip building targets for hosts whose section isn't rendered on the current tab.
- **[medium/silent-error]** `src/lib/session-props.js:131` — Session Properties — status history + Agent steps
  - problem: Both async sections use raw fetch with `.catch(() => {})`: the status-history fetch (line 113, catch at 131) and the /api/session-todos fetch (line 246, catch at 275). Their "Loading history…"/"Loading…" placeholders are only replaced inside .then — on any failure (server hiccup, non-JSON error body, or for a REMOTE session a slow/dead host behind the transcript-backed todos endpoint) the section shows a permanent 'Loading…' with no error and no retry, indistinguishable from an op still in progress. Under host lag the Agent-steps section can sit on 'Loading…' forever.
  - fix: In each catch (and on !r.ok), replace the placeholder with an inline error line ("Couldn't load — {reason}" + the host name for remote sessions) and let the existing broadcast-driven re-render act as the retry.
- **[medium/stale-cache-lie]** `src/lib/app.js:1780` — New Session dialog — remote host account row (updateAcctRow)
  - problem: With a host selected and verdicts cold (probe in flight, or permanently absent after a failed probe per the _warmHostAccountCache swallow), the fallback branch renders the definitive disabled option "{name} — not logged in on {host}" for any account not found in the page caches — a confident claim derived from NO data. There is no 'checking {host}…' state on the row, and when the probe lands the options are silently rebuilt (a previously-selected option that became disabled silently resets the select to Default at lines 1789-1790). Under host lag the user reads and acts on wrong availability for up to ~15s, or for 2 min after a failed probe.
  - fix: While _hostAcctWarmState[hostId]==='pending' (or after a failed probe), label uncertain accounts "{name} — checking {host}…" (disabled) instead of the definitive 'not logged in on {host}', and show a toast when a rebuild invalidates the user's current selection.
- **[low/stale-cache-lie]** `src/lib/manage-agents.js:1261` — Manage-Agents Machines tab — collapsed accordion quota pill
  - problem: The collapsed-header worst-bucket pill (lines 1254-1262) renders the persisted usage-cache host snapshot (this._hostOwnUsage[h.id], i.e. usage-cache/host-<id>.json — potentially days old) with NO age marker: neither the pill text nor its title includes hu.fetchedAt, unlike the row-level _acctUsageHtml which appends a '{n}m/{n}h' age span. A dead or long-unrefreshed host shows a healthy-looking green '5h 12%' that looks current.
  - fix: Append the same age label used by _acctUsageHtml (from hu.fetchedAt, shown when >5 min) to the pill text/title so the header reads e.g. '5h 12% · 3h'.
- **[low/silent-error]** `src/lib/manage-agents.js:1072` — Manage-Agents machine section — VibeSpace-integration row probe
  - problem: The remote integration probe (`/api/hosts/:id/agent-tools`, an ssh/dial round-trip) and the local `/api/agent-hooks` fetch (line 1011) run AFTER the section's '.ob-loading' was removed at line 898 — while they are in flight the section looks complete with the row simply absent, and on failure the empty catch + `if (rs && rs.tools)` guard means the row never appears at all: a failed probe is indistinguishable from 'integration not applicable', so a user checking why remote context injection is broken sees nothing.
  - fix: Render an 'Integration: checking…' stub row before the probe and replace it with either the real row or an inline 'probe failed — {host} unreachable' warn line in the catch.
- **[low/no-indicator]** `src/lib/autocomplete.js:54` — New Session dialog — remote cwd autocomplete + recent-path chips
  - problem: With a host selected, dir completion goes to `/api/hosts/:id/dir-complete` but setupDirAutocomplete has no pending state and `.catch(() => {})` — on a slow host the user types and simply nothing appears (stale suggestions from the previous keystroke may linger), and a failed probe is indistinguishable from 'no matching directories'. Same for the recent-cwds chips (app.js:1638-1645): fetchJson never rejects, so a failed probe resolves d=null → paint([]) quietly replaces the 'loading host paths…' indicator with an empty row identical to 'no recent paths' (the .catch at 1645 is dead code).
  - fix: Show a dim 'searching {host}…' item in the dropdown while the fetch is in flight and an 'x could not reach {host}' item on failure; for the chip row, render a small warn chip ('host paths unavailable') instead of silently emptying.
### lens: chat-transcripts

- **[high/silent-error]** `src/ws-handler.js:2077` — remote chat history load (attach / view-only / subagent attach)
  - problem: All three remote transcript pulls in the attach branch swallow failure with console.error only: live attach (ws-handler.js:2071-2078), viewOnly attach (2173-2179), and subagent fetchAgentJsonl (2009-2013); /api/session-messages does the same (routes/sessions.js:69). The 'attached' reply carries no error/warning field, so with the host unreachable and a cold/partial cache the window renders empty or buffer-only history: the live-attach client path (session-lifecycle.js:456) skips loadHistory entirely on empty messages, and the viewOnly path shows the misdiagnosing note "No messages in this session's transcript yet." — the user never learns the host pull failed (violates 静默失败零容忍).
  - fix: Capture the fetch error and thread it into the attached payload (e.g. transcriptError: {message, hostId} / transcriptPartial: true); ChatView renders an inline amber notice with a Retry action, same shape as the exited-reason classifier surfacing.
- **[high/stale-cache-lie]** `src/hosts.js:991` — remote transcript cache (view-history / chat history of remote sessions)
  - problem: _fetchRemoteByFind deliberately serves the stale cached transcript when the host is down (60s _hostDownUntil memo at line 991, ssh-failure fallback at 1056, file-gone-remotely at 1059) — correct resilience — but it returns only a bare path: meta.fetchedAt is written (line 1041/1070) yet never propagated, and no consumer marks the view. A View History window of a remote session on a dead host renders a days-old transcript that looks fully current; the amber 'host unreachable' remoteState chip only covers LIVE sessions' wrapper state, not history windows. The remote-discovery cache is stale-marked (the quality bar); this cache is not.
  - fix: Return {path, stale: true, fetchedAt} from _fetchRemoteByFind on every stale-serve branch, thread it through the attach/'attached' payload and /api/session-messages, and render a dim 'showing cached copy from <time> — <host> unreachable' banner in ChatView.
- **[high/no-indicator]** `src/lib/session-lifecycle.js:1096` — View History window (_viewIntoWindow, incl. dead-session rescue)
  - problem: The viewOnly attach is a bare ws.send with a hand-rolled onGlobal handler: no timeoutMs/onTimeout, no resend on reconnect (attachSession right above uses ws.request with all three), and no loading placeholder — during the server-side remote pull (ssh probe 15s + cat bounded at 120s, hosts.js:1048/1065) the read-only window is an empty chat pane. Worse, _reattach explicitly skips readOnly windows (chat-view.js:1894) and the restart-audit skips them in the reconnect loop, so a ws drop or lost reply mid-pull leaves the window PERMANENTLY blank with no error and no retry — indistinguishable from an empty conversation.
  - fix: Convert to this.ws.request({...viewOnly attach}, handler, {isAlive, timeoutMs: 12000, onTimeout: toast, resend: true}) (viewOnly attach is idempotent), and render a 'Loading transcript…' placeholder row until 'attached' arrives.
- **[medium/silent-error]** `src/lib/chat-view-seek.js:192` — huge-session continuous scroll-up (gap/seek slab loading)
  - problem: _loadEarlierGap fetches a slab with .catch(() => null) (line 169); on failure data is null, so line 192 sets markerEl._gapCursor = 0 (fromLine not finite) and line 200 calls _finishSeek, which permanently removes the seek sentinel (line 210) and unobserves. One transient server hiccup / network blip while scrolling up a huge session silently and permanently ends earlier-history loading for that window — the conversation appears to begin at the failure point, with zero notice.
  - fix: Distinguish failure from completion: on data === null leave _gapCursor unchanged and back off/retry (or show an inline 'couldn't load earlier history — scroll to retry' row); only call _finishSeek when the server explicitly returns fromLine === 0.
- **[medium/divergent-logic]** `src/routes/sessions.js:168` — huge-session gap endpoint for remote sessions (seek slabs, full-file search, whole-conversation minimap)
  - problem: /api/session-history-gap never reads req.query.host and never refreshes the remote cache (it goes straight to findSessionJsonlPath), and none of its client callers send host either — chat-view-seek.js:64/153/169/319, chat-view.js:909 (_initGapMinimap), chat-search.js:170 (full-file streaming search) — while the sibling /api/session-messages path does refresh per request (routes/sessions.js:63-70, chat-view.js:760, chat-search.js:146). This violates the documented 2.108.1 rule ('EVERY history consumer passes ?host='): a local huge session's search/minimap/slabs read the live JSONL, but a remote one reads the local cache frozen at the last attach/pagination — Ctrl+F full-file search and the time-minimap silently miss every turn written since, behaving differently from the identical local session.
  - fix: Add the same host branch to /api/session-history-gap (throttled hosts.fetchSessionJsonl/fetchCodexJsonl before findSessionJsonlPath) and append &host= in the five client fetch sites (seek slabs, info, fullturnmap, streaming search).
- **[medium/silent-error]** `src/lib/chat-view.js:1727` — subagent / workflow-agent View Log viewer (remote parents especially)
  - problem: The subagent viewer's attach handler swallows both failure shapes: an 'error' reply is offGlobal'd and returned with nothing rendered (line 1727), and an 'attached' with zero messages renders nothing at all (lines 1730-1732 — no equivalent of _viewIntoWindow's 'No messages…' note at session-lifecycle.js:1126). Server side compounds it: a failed remote fetchAgentJsonl is console.error-only (ws-handler.js:2013) and a missing live buffer replies attached with empty messages (2058). Also plain ws.send — no watchdog/resend. View Log on a remote workflow agent with the host slow or unreachable = a blank read-only window forever, no message, no error.
  - fix: In the handler, render msg.message (error case) or an explicit 'No transcript found for this agent' empty-state into the viewer; have the server include the remote fetch failure in the reply; use ws.request with a timeout toast like attachSession.
- **[medium/no-indicator]** `src/lib/session-lifecycle.js:437` — opening/resuming a session window (attach + create, remote hosts especially)
  - problem: Between wm.createWindow and the 'attached'/'created' reply the window body is completely empty — the ChatView (status bar, message list) is only constructed inside the reply handler (attachSession line 454, createSession line 251). A remote attach legally takes 15-120s (inline hosts.fetchSessionJsonl: ssh probe 15s, cat bounded 120s at hosts.js:1065) and a remote resume spends 10s+ in findKeeperFor plus tool shipping; the only feedback is a 12s/15s toast whose wording ('check the connection or reload the tab') misdiagnoses a legitimately slow host as a broken connection. The user stares at a blank window with no 'connecting to <host> / loading history' state.
  - fix: Append a pending placeholder (spinner + 'Loading history from <host>…' / 'Starting session on <host>…') to winInfo.content at creation, removed when the reply builds the ChatView/terminal; reword the timeout toast to 'still working — the host may be slow' once attach-ack-style proof-of-life exists for create.
- **[low/silent-error]** `src/lib/chat-view.js:777` — chat history pagination (scroll-up/down _extendTop/_extendBottom)
  - problem: _extendTop (769-816) and _extendBottom (995-1016) wrap the fetch in try/finally with no catch — a rejected _fetchMessages (server briefly down, degraded network) escapes as an unhandled promise rejection from the unawaited scroll-handler call sites (lines 259/267): scroll-up just silently does nothing. _fetchMessagePage (762-763) also never checks res.ok, so a 500 JSON body maps to messages=[] = 'no more history'. On a remote session each pagination request can additionally stall ~15s server-side (route-side fetchSessionJsonl refresh) with no loading affordance.
  - fix: Add a catch that shows one throttled inline row/toast ('couldn't load older messages — scroll to retry'), check res.ok in _fetchMessagePage, and reuse the _loading flag to show a small top-of-list spinner while a page is in flight.
### lens: client-silent-failures

- **[high/silent-error]** `src/lib/chat-view-seek.js:192` — Chat huge-session scroll-up (gap seek)
  - problem: A gap-slab fetch failure is mapped to null (`.catch(() => null)` at line 169), which makes `markerEl._gapCursor = (data && Number.isFinite(data.fromLine)) ? data.fromLine : 0` set the cursor to 0 — the very next check `_gapCursor <= 0` calls `_finishSeek`, which permanently REMOVES the seek sentinel. One transient failure (server restart mid-scroll, event-loop lag, remote-transcript slab timing out) silently disables ALL earlier-history loading for the window's lifetime: the conversation appears to 'begin here' with no error and no retry.
  - fix: On `data == null` (fetch failure) keep `_gapCursor` unchanged, clear `_gapLoading`, and render a transient inline marker ('couldn't load earlier messages — scroll up to retry') instead of falling through to the cursor-0/_finishSeek path; only a real `fromLine === 0` reply may finish the seek.
- **[high/silent-error]** `src/lib/sidebar-mounts.js:923` — Storage connect (Remote tab: pull-mount rw path, import share, add mount)
  - problem: Three dialogs (lines 923, 1688, 1827) run the actual connect as bare `await fetch('/api/mounts/<id>/mount', {method:'POST'})` with the response entirely unchecked, then immediately toast SUCCESS ('Storage connected' / 'Share imported') and close the dialog. Exactly the failure-prone step — fuse mount against a slow/unreachable/denied backend — can fail while the user is told it worked; the truth only appears if they later notice the row's error state. The record creation above it uses the throwing `api()` wrapper, so this is a one-step regression from the file's own standard.
  - fix: Route the mount step through the local `api()` thrower too, so a mount error surfaces in the dialog (which _mountsDialog already renders) BEFORE the success toast; on error keep the dialog open with the server's message.
- **[medium/silent-error]** `src/lib/manage-agents.js:1912` — Manage Agents account roster ⋯ actions (rename/email/note/delete/set-default, claude + codex)
  - problem: Every roster mutation is `try { await fetchJson(...) } catch {}` followed by `refresh()` — but fetchJson NEVER throws (utils.js:545 returns null on failure and returns error bodies as data), so the catch is dead code and the result ({error} or null) is never checked. Sites: doEmail 1901/669, doRename 1912/691, doDelete 1919/698, doNote 1933, set-default 1953/711/663/1841, wizard key-paste 810. A failed rename/delete/default-set (server lagging, host key-sweep error, validation reject) silently no-ops: refresh repaints the old state and the user never learns why their action didn't take.
  - fix: Check the fetchJson result at each site: `const r = await fetchJson(...); if (!r || r.error) showToast(r?.error || t('… failed — server unreachable'), {type:'error'})` — same pattern the neighboring 'Show key…' and add-key (line 1684) handlers already use.
- **[medium/silent-error]** `src/lib/usage-window.js:113` — Usage dashboard load
  - problem: `state.data = await fetchJson(...)` at line 85 cannot throw, so the `catch { showToast('Could not load usage') }` at line 86 is dead code; on server failure/lag state.data is null and render() shows 'No usage recorded yet for this range. Run some sessions…' (line 113) — a factual lie: a failed load is presented as an empty ledger, steering the user to a wrong conclusion instead of a retry.
  - fix: Distinguish null from empty: after the fetch, `if (state.data === null) { showToast + render an error panel with a Retry button }`; reserve the 'No usage recorded yet' copy for a real 200 with zero requests.
- **[medium/silent-error]** `src/lib/usage-window.js:360` — Usage pricing editor save
  - problem: save.onclick awaits `fetchJson('/api/usage-stats/pricing', …)` without checking the result; the `catch { showToast('Save failed') }` can never fire because fetchJson swallows. A failed save (outage, HTTP error) toasts 'Prices saved', switches back to the dashboard, and discards the user's edit buffer — false success plus silent data loss of the edits.
  - fix: Check the fetchJson return: `const r = await fetchJson(...); if (!r || r.error) { showToast(t('Save failed…'), {type:'error'}); save.disabled = false; return; }` and only then toast success and leave the editor.
- **[medium/stale-cache-lie]** `src/lib/app.js:334` — WS reconnect resync (task-group board + session-status chips)
  - problem: The reconnect block refetches maintenance, settings, and user-state — but the client mirrors for TASKS (`_fetchTasks`, sidebar-tasks.js:61, boot fetch swallowed by `catch {}` at line 222) and SESSION-STATUS (sidebar-tasks.js:62, `.catch(() => {})`) update only via `tasks-updated`/`session-status-updated` broadcasts with no reconnect refetch. Changes made during an outage (an agent's vibespace-status/vibespace-task writes, another client's group edits) never arrive: the task board and status chips render stale state as current until a full reload. A boot-time fetch that fails during a restart window additionally leaves `_tasksLoaded=false`, so task-detail/task-log windows stay on 'Loading task…' forever (task-detail.js:49). This is the exact class already fixed for user-state (2.223.4) and user-todos — tasks and session-status were left out.
  - fix: Add `this.sidebar?._fetchTasks?.()` and a session-status refetch to the onStateChange reconnect block next to the existing `_fetchUserState()` call, and surface a one-time toast when the boot _fetchTasks fails instead of the empty catch.
- **[medium/silent-error]** `src/lib/settings.js:192` — Settings persistence (every settings toggle)
  - problem: `_save()` wraps the POST /api/settings in `try { await fetch(...) } catch {}` and never checks res.ok — a save during an outage, or any HTTP error (500, 413), is silently dropped. The local UI keeps showing the new value (localStorage backup), but the server and every other client keep the old one; server-read settings (agents.* integration switches, mounts.*, claude.*) silently do not apply. On the next reload the value quietly reverts with no explanation.
  - fix: Check `res.ok`, toast on failure ('Setting could not be saved — will retry'), and re-run `_save()` once on the next ws reconnect (the onStateChange hook already exists in this class for applyRemote).
- **[medium/silent-error]** `src/lib/chat-view.js:1727` — Subagent / workflow-agent 'View Log' viewer
  - problem: The View Log attach handler treats an `error` reply as pure cleanup: `if (msg.type === 'error' …) { this.ws.offGlobal(handler); return; }` — the read-only window stays permanently BLANK with no message. Same on the layout-replay path (session-lifecycle.js:1276), which also renders nothing when `msg.messages` is empty. Remote workflow agents (transcript fetched over ssh, 2.191.0) hit this under host lag: user clicks View Log, gets an empty window, and never learns the transcript fetch failed. The sibling `_viewIntoWindow` (session-lifecycle.js:1114) already does `appendSystem(msg.message)` — these two paths lack its equivalent.
  - fix: Mirror _viewIntoWindow: on `error` call `view._renderers.appendSystem(msg.message || t('Agent transcript could not be loaded.'))`, and on an empty `attached` render the 'No messages…' system line.
- **[medium/no-indicator]** `src/lib/session-lifecycle.js:1096` — View History window (view-only attach, incl. remote transcript pull)
  - problem: _viewIntoWindow sends the view-only `attach` (which for a remote session makes the server pull the transcript over ssh — legitimately seconds, up to the 15s ssh budget) with a plain `ws.send` + onGlobal handler: the ChatView pane is completely BLANK until 'attached' arrives, with no 'Loading…' hint, no timeout, and no resend — unlike attachSession at line 437 which uses `ws.request`. If the server restarts between request and reply (the documented blank-shell class) the window stays blank forever.
  - fix: Render an initial `appendSystem(t('Loading history…'))` (replaced by loadHistory), and switch to `this.ws.request(msg, matchFn, { isAlive, resend: true, timeoutMs: 20000, onTimeout: show 'still loading — the host may be slow' })` like the live-attach path.
- **[medium/silent-error]** `src/lib/session-lifecycle.js:646` — Billing switcher / New Session host-account verdicts (_warmHostAccountCache)
  - problem: When the per-host accounts-status probe fails (fetchJson null or {error} — a lagging/unreachable host), the code marks `_hostAcctWarmState[hostId] = 'done'` and returns: the open billing switcher keeps its cold verdicts (named subscriptions greyed as unusable) with nothing telling the user the probe FAILED, and the 2-minute 'done' TTL blocks any retry. The documented 'cold-page lie' acceptance covered consumers that never warm — here the warm itself fails and is cached as success.
  - fix: On failure set state to 'error' with a short (~15s) retry TTL, and if the billing menu for that host is still open, insert a dim row 'couldn't reach {host} to check account availability — retrying' instead of leaving the greyed rows unexplained.
- **[medium/silent-error]** `src/lib/plugins-ui.js:76` — Plugins dialog actions (Install/Start/Stop/enable-at-boot)
  - problem: The `api()` helper only throws on `x?.error` — but fetchJson returns NULL on network failure/server lag, which passes the check and resolves successfully. Clicking Install while the server is unreachable therefore toasts 'Installed' (line 92) with nothing installed; Start/Stop/boot-toggle likewise complete silently with no effect, and the re-render shows the unchanged state with no explanation.
  - fix: In `api()`: `.then((x) => { if (!x) throw new Error(t('Server unreachable')); if (x.error) throw new Error(x.error); return x; })` so the existing button-level catch/toast fires.
- **[medium/no-indicator]** `src/lib/file-explorer.js:600` — File explorer directory navigation (esp. ?host= remote listings)
  - problem: `navigate()` awaits the /api/files fetch with zero pending state: on a laggy remote host (per-op ssh listing, seconds under contention) the OLD directory stays fully rendered and interactive with nothing indicating a navigation is in flight — users double-click again, queueing more slow requests. Errors do surface (red hint in the list), but the waiting phase shows literally nothing.
  - fix: On navigate start, set a lightweight pending affordance (dim the list / spinner in the path bar) after a ~300ms grace timer (so fast local navs stay flicker-free), cleared in both the success and error paths; drop stale responses when a newer navigate superseded them.
- **[low/silent-error]** `src/lib/session-props.js:131` — Session Properties window (State history + Agent steps sections)
  - problem: Both async sections write a 'Loading history…'/'Loading…' hint then fetch with `.catch(() => {})` (lines 131 and 275): on failure — likely for remote sessions where /api/session-todos?host= walks an ssh-fetched transcript — the hint stays on screen forever with no error and no retry; the section looks permanently loading.
  - fix: In the catch, replace the hint with an honest line ('Could not load — {err}' or 'host unreachable') so the section terminates instead of pretending to still load.
- **[low/silent-error]** `src/lib/app.js:1278` — Custom grid presets (+ add / right-click remove)
  - problem: _addCustomGrid/_removeCustomGrid do `const data = await fetchJson('/api/custom-grids', …); if (data) {…}` — on failure (null) they silently do nothing: the preset button never appears (or never disappears) with no toast, and the user's saved preset quietly doesn't exist on next load.
  - fix: Add an else branch: `showToast(t('Could not save grid preset — server unreachable'), {type:'error'})` (and the mirror message for remove).
- **[low/silent-error]** `src/lib/chat-input.js:471` — /goal command (chat input interception)
  - problem: All four /goal forms are fire-and-forget `ws.send({type:'set-goal', …})` and the textarea is cleared immediately; the only feedback is the eventual `goal-updated` broadcast. If the wrapper is dead, the session's host is lagging, or the server drops the message, the user's goal text vanishes with no pending indicator, no error, and no way to know it was lost.
  - fix: Show an optimistic 'setting goal…' state on the 🎯 status-bar chip when a set-goal is sent, cleared by goal-updated; after a ~10s timeout with no broadcast, toast 'Goal not confirmed — the session may be unresponsive' and restore the text as a draft.
### lens: divergence-census

- **[high/unbounded-op]** `src/ws-handler.js:1274` — remote session create/resume (WS 'create' case)
  - problem: Four execFileSync('ssh') calls sit on the create path — agent-tools tar ship (line 746, timeout 20000), API-key ship (line 902, 15000), subscription-creds tar ship (line 952, 20000), and the pre-resume writer sweep (line 1274, 20000). Each one BLOCKS the Node event loop synchronously; a lagging host can stack them to ~60-70s of whole-server freeze from ONE remote create/resume — every other client, chat stream, and WS heartbeat stalls. This is exactly the 2.242.0 discovery-sweep stall class (execFileSync chain froze the fleet pod 5.1s/sweep), fixed there via execFileP but never applied to the create path.
  - fix: Convert all four sites to the async execFileP helper already exported by session-store (the create handler is already async; each call is already awaited-adjacent). Keep the same timeouts; the fix is only sync→async so the loop keeps pumping.
- **[high/silent-error]** `src/hosts.js:957` — remote resume adopt-vs-respawn (findKeeperFor + writer sweep)
  - problem: findKeeperFor ends in `catch { return null; }` — a probe FAILURE (ssh timeout at its own 10s bound, host lag, transient network) is indistinguishable from a clean 'no live keeper'. The caller (ws-handler.js:1254-1258, its own empty catch) then runs the writer sweep, which SIGTERMs any claude holding the transcript — i.e. under lag the healthy surviving remote claude the code exists to ADOPT gets killed and respawned. The code's own comment (hosts.js:946-951) names this exact hazard for deviceBounded but the catch→null reintroduces it for every error path. Worse, if the sweep itself then times out it is console.warn'd and the resume continues anyway (ws-handler.js:1276) — the double-JSONL-writer incident class (B-4058, lengyue's 12 orphans) with zero user-facing signal on either failure.
  - fix: Make findKeeperFor return a three-state result ({found}|{empty}|{error}); on {error} skip the sweep and either retry once or refuse the resume with a 'host is slow — a live copy may still be running' error. On writer-sweep failure, abort the resume (or require an explicit ignore flag like ignoreNoConvo) instead of console.warn-and-continue, and send a server-notice.
- **[high/silent-error]** `src/ws-handler.js:2320` — Terminate of a remote session (WS 'kill' case)
  - problem: The remote teardown is fire-and-forget with every failure swallowed: dial branch `dm.killPipeSession` wrapped in try{}catch{} inside a .catch(()=>{}) chain (lines 2288-2292), and the ssh branch's execFile callback ignores err entirely (lines 2309-2313) — plus hosts.device() there runs the UNBOUNDED connect ladder (~2.7min). The 'exited reason:terminated' broadcast at line 2320 fires unconditionally, so with the host lagging/offline the UI tells the user the session was terminated while the remote claude keeps running — the documented double-writer/orphan class the dial fix was written for, now silent only in the failure branch.
  - fix: Have the remote-kill promise report its outcome: on failure, serverNotice(key, "couldn't reach <host> — the remote claude may still be running; it will reappear as external on next discovery", {level:'warn'}) and tag the discovered orphan. Use hosts.deviceBounded for the dial kill so the attempt resolves in seconds.
- **[high/stale-cache-lie]** `src/hosts.js:991` — remote chat history / view-only transcript load
  - problem: _fetchRemoteByFind serves the cached transcript on host-down (hostDownUntil memo line 991, ssh-fail fallback line 1056) but returns ONLY a path — there is no staleness channel, unlike discovery which stale-marks every session ({stale:true}, hosts.js:1317). Every consumer (ws attach ws-handler.js:2071-2077, viewOnly 2173-2178, /api/session-messages routes/sessions.js:63-69, session-todos :779 with a fully empty catch) swallows the fetch error into console.error and renders whatever the cache holds: a days-old transcript displays as current history with no marker, and a COLD cache renders a blank chat with no error at all — the user cannot distinguish 'empty conversation' from 'host unreachable'.
  - fix: Return {path, stale:true, staleAt} from _fetchRemoteByFind's fallback branches (and throw a typed error when there is no cache); thread it into the 'attached' payload (a remoteHistoryStale field next to the existing remoteState) and the /api/session-messages response so the chat view can show the amber 'host unreachable — showing cached history as of X' equivalent of the session-card chip.
- **[high/divergent-logic]** `data/bin/vibespace-usage-scan:83` — remote usage ledger harvest (Usage window + dead-reckoning rates)
  - problem: The remote scanner is a shipped REIMPLEMENTATION of the local UsageHistory walk, and it silently lags it: line 83 `if (!fn.endsWith('.jsonl')) continue; // top-level session transcripts only` — the 2.265.0 local fix (usage-history.js:266-292 mining <sid>/subagents/** and subagents/workflows/wf_*/agent-*.jsonl, because workflow agents' usage exists ONLY there — measured ~$205/run invisible and 3-4× poisoned learned rates) was never ported. Every remote host's workflow/subagent usage is missing from the ledger today, under-reporting remote $ and (for host-billed identities) recreating the exact estimator-poisoning bug just fixed locally. The header also notes 'Claude-only v1' — remote codex usage is never harvested at all.
  - fix: Port the subagents/** walk into vibespace-usage-scan now; structurally, extract ONE shared walker module (the scanner is bundled/shipped as a file — build it from the same source usage-history.js requires) so local scan fixes cannot diverge from the remote twin again.
- **[high/divergent-logic]** `src/ws-handler.js:1047` — session spawn command builders (local + ssh/dial × terminal/chat)
  - problem: There are FIVE hand-assembled remote shell templates (dial-terminal :1010, ssh-terminal :1047, dial-chat :1194, ssh-chat-agentd :1309, ssh-chat-keeper :1341) plus a sixth separate local spawn (:1390) — every spawn-env fix must be applied N times (AMBIENT_OAT_UNSET needed all 5 in 2.267.0). Concrete drift already shipped: the ssh-TERMINAL builder (:1047) is the only remote template WITHOUT `export PATH="$HOME/.local/bin:$PATH"` + nvm sourcing (present in :1010/:1194/:1309/:1341), so on a host whose non-interactive profile omits ~/.local/bin (where the native installer puts claude), remote CHAT spawns fine while remote TERMINAL dies 'command not found' — a mode-specific remote-only bug no local test can catch.
  - fix: Extract one buildRemoteShellPrelude(h, {cwd, integrationOn, tokenAssign, acctEnv, envPairs}) returning the cd/PATH/nvm/AMBIENT_OAT_UNSET prefix, consumed by all five sites (add the missing PATH export to :1047 immediately); longer term route the local spawn through device #0's openPipeSession so local and remote build the identical command.
- **[medium/divergent-logic]** `src/hosts.js:1210` — session discovery (sidebar Recent/History, running-state truth)
  - problem: Discovery fact-collection is TRIPLE-implemented: local = the routes/sessions.js async sweep (locks + pgrep + tmux panes + extractSessionMeta JSON naming), ssh = the shell script at hosts.js:1210-1268 (regex-on-truncated-line naming :1373-1380, head -200/-60 caps, NO tmux classification — remote tmux claudes are unattachable generic 'remote-running'), agentd = discoverySnapshot synthesized into script lines (:1292-1307). Only claimJsonls is shared. The 2.117.0 naming regression had to be fixed twice (session-store._sessionMeta AND the grep script) — the classic divergent-twin incident; any future naming/classification fix must again land in three places or remote silently drifts.
  - fix: Make the agentd discoverySnapshot the ONE fact collector: local /api/sessions consumes device #0's snapshot through the same synthesized-line parser (falling back to the current sweep only when the daemon is down), and enrich the snapshot with tmux-pane facts so remote tmux sessions classify/attach like local ones. Then delete the ssh script's naming regex in favor of shipping extractSessionMeta's logic in the daemon.
- **[medium/divergent-logic]** `server.js:3700` — task-group context folder sync to remote hosts (agent context freshness)
  - problem: Ctx sync has three divergent implementations — local (no sync, direct dir), ssh (two rsync passes, no size limits), dial (per-file hash sync with dial-ONLY caps: ≤400 files / ≤2MB each, server.js:3711) — so a 3MB context file syncs to ssh hosts but silently never reaches a dial device, and >400-file folders truncate arbitrarily. Every failure is invisible: the whole-sync catch is console.warn only (:3700), and the dial path swallows EVERY per-file fsWrite/fsReadRange error in bare catch{} (:3752, :3765) — a remote agent quietly works from stale/partial context (its injected file index even lists files that never arrived) with no board indicator, no server-notice, nothing.
  - fix: Unify semantics (either apply the caps both ways with an explicit skipped-files report, or lift them for dial via chunked reads); record per-group lastSyncOk/lastSyncError on the task group and surface it in task-detail + as a serverNotice when a sync for a group with LIVE remote members keeps failing.
- **[medium/silent-error]** `src/ws-handler.js:772` — remote spawn agent-tools distribution (vibespace-status/ask/task on the host)
  - problem: Tool distribution to the host is 'best-effort': on tar/ssh failure (likely precisely when the host lags) it console.error's and the session spawns anyway (lines 769-774). But context injection still TEACHES the agent vibespace-status/vibespace-ask/vibespace-task with copy-ready invocations — on this session they are 'command not found', training dead ends (the exact failure mode the enabledTools() composition was built to prevent), and neither the user nor the agent is told the integration silently degraded.
  - fix: On distribution failure, set a session flag that (a) suppresses/annotates the tools section for this session's injections ('tools unavailable on this host this session') and (b) emits a serverNotice so the user sees integration degraded and can retry via Manage Agents → Install.
- **[low/silent-error]** `src/routes/files.js:119` — directory autocomplete on remote hosts (New Session cwd, mount dialogs, path bar)
  - problem: The remote branch maps EVERY failure to res.json({suggestions: []}) (files.js:119), and the layers below do the same (hosts.dirComplete dial catch → [] at hosts.js:640, ssh leg .catch(() => '') at :643) — a down/lagging host is indistinguishable from 'no matching directories', and there is no local-style 500ms budget (the local branch at :121 has one; remote can dangle ~6s then silently empty). Users typing a cwd for a remote session just see completions stop working.
  - fix: Return {suggestions: [], error: 'host unreachable'} from the remote catch (client already gets a JSON shape it can annotate), and wrap the remote call in the same 500ms-2s route-level deadline the local branch enforces so the dropdown shows a quick 'host slow — no completions' state instead of hanging.
- **[low/divergent-logic]** `src/routes/files.js:83` — relative-path link resolution in chat (locate fallback)
  - problem: `if (req.query.host) return res.json({ hits: [] });` — the bounded-find locate fallback for clicked relative paths is local-only, and the remote branch returns empty hits with no marker, so for remote sessions a rel-path click that would resolve via locate locally silently reports 'not found' — remote users get a degraded feature with no explanation, and the divergence is invisible to local testing.
  - fix: Route the same bounded find over the device link (dm.runCmd `find <cwd> -maxdepth 5 -name <base>` with the identical prune list and 3s bound — the primitive already exists), or at minimum return {hits: [], unsupported: 'remote'} so the client can say 'search-by-name not available on remote hosts' instead of a bare not-found.
### lens: files-mounts

- **[high/no-indicator]** `src/lib/file-explorer.js:600` — File explorer navigation (?host= remote browsing)
  - problem: navigate() awaits /api/files with zero pending state: between fetch start and response the explorer keeps rendering the PREVIOUS directory unchanged (path input, listing, title all stale). A remote listing legitimately takes seconds (RemoteFs._run default timeout is 15s; deviceBounded ladder + BSD stat-loop fallback on macOS hosts), so double-clicking a folder on a lagging host looks like a dead click — users re-click or navigate again, and since there is no request sequencing, two in-flight navigates race and the SLOWER (older) response can overwrite the newer directory. refresh() and setHost→_loadHome share the same path. The preview panel (line 1079) has a 'Loading...' hint; the main listing has nothing.
  - fix: On fetch start: dim the listing and insert an inline 'Loading {path}…' row (mounts-loading pattern), and stamp a monotonic nav-seq captured per call — discard responses whose seq is stale. Clear the indicator in the existing catch/render paths.
- **[high/no-indicator]** `src/lib/file-explorer.js:590` — Explorer→explorer drag-drop copy (cross-host relay)
  - problem: _receiveDraggedFile posts /api/file/copy WITHOUT progress:1, unlike _paste (which got the 2.215.0 _trackTransferOp fix). A cross-host folder drag runs crossHostTransfer's tar relay holding the single HTTP response for the whole transfer — the relay stream itself has no deadline (ssh banner-hang path is unbounded; keepalives don't cover pre-banner) — so a multi-GB or lagging-host drag shows NOTHING (no row, no ring, no cancel) until the terminal toast. Users assume the drop failed and re-drag, stacking concurrent relays.
  - fix: Send progress: 1 in the body and route the returned opId through the existing this._trackTransferOp(opId, label, destPath), exactly as _paste does; keep the current toast as the terminal notice.
- **[medium/divergent-logic]** `src/lib/file-explorer-ops.js:388` — Archive extraction on a remote host
  - problem: `const wantProgress = !this._host` gates the polled extraction op to LOCAL only: on a remote host the client falls back to the plain synchronous POST /api/archive/extract (files.js:780 → RemoteFs.archiveExtract, timeoutMs 300000) with no progress row, no ring, and not even an initial toast — a big archive on a lagging host looks completely frozen for up to 5 minutes. This resurrects, remote-only, the exact pre-2.111.18 bug the local op machinery was built to fix ('a big archive used to hold the HTTP request for minutes with zero feedback').
  - fix: Run remote extraction through the same op pattern (server keeps an extractOps entry, drives the remote unzip/tar via _run or runStream counting entry lines, client polls extract-status as today); minimally, render a persistent indeterminate 'Extracting {name}…' upload-row for the remote branch instead of nothing.
- **[medium/silent-error]** `src/remote-fs.js:252` — File write to a dial-out device (upload, editor save, New File)
  - problem: write()'s dial fast path catches ANY device-side failure bare (`catch { /* legacy */ }`) and falls through to the ssh branch, where hosts.sshArgs (hosts.js:360) throws '"X" is a dial-out device — it has no ssh; this operation must ride the device link'. So when fsWrite fails on a stalled/laggy device link, the user's upload/save error toast shows the misleading transport lecture instead of the real cause (timeout, permission, disk full). info() and stat() already carry the explicit `if (transport === 'dial') throw e` guard for exactly this masking class — write() lacks it.
  - fix: Mirror the info() guard in write()'s catch: `catch (e) { if (this._host(id)?.transport === 'dial') throw e; }` so dial hosts surface the genuine device error and only ssh hosts fall through to the legacy body.
- **[medium/silent-error]** `src/machine-mounts.js:589` — Machine pull mounts (machine folder → this workspace)
  - problem: A recorded pull mount that fails to come up retries in _healthSweep every 5min with `this._up(rec)...catch(() => {})`, and onMachineLinked's heal only writes the reason to the server log (line 519). list() (line 134) exposes NO error field for pull records, so a mount that fails every attempt while the machine is ONLINE (serve-folder path gone, rclone spawn failure, tunnel port conflict) renders forever as a grey dot whose tooltip says 'Pending — remounts when the machine is reachable' — a lie (the machine IS reachable; the mount is erroring) with the actual reason unreachable from the UI. Storage rows (mounts.js _errors → m.error → .mounts-errline) have the equivalent; machine mounts lack it.
  - fix: Record the last _up() failure per rec (this._pullErrors.set(rec.id, e.message) in the sweep/heal catches, cleared on success), expose it as `error` in list()'s pull mapping, and render it through the existing mounts-errline pattern in _buildMachineMountRow (which already has the ↻ remount affordance).
- **[medium/divergent-logic]** `src/routes/files.js:1143` — File Properties dialog (remote folders)
  - problem: The remote branch of /api/file/stat returns the recursive size as `du` while the local branch returns it as `duSize` (line 1164). The only consumer, _showProperties (file-explorer-ops.js:494), reads exclusively `d2?.duSize` — so for ANY remote host the Properties dialog always resolves the folder size to 'unknown', even after the up-to-30s remote du succeeded (its result is computed, shipped, and dropped). Silent remote-only feature breakage — the exact B-b87b shape-drift class the shared parseArchiveListing was created to retire.
  - fix: Emit `duSize: s.du` (keep `du` for compat) in the remote branch of /api/file/stat, or have the client read `d2?.duSize ?? d2?.du`.
- **[medium/silent-error]** `src/remote-fs.js:334` — Remote 'Download as Zip' (explorer folder download)
  - problem: downloadZipTo's ssh branch sets Content-Type/Disposition for a successful zip, spawns `cd … && zip -r - …`, pipes stdout, and discards stderr with NO close-code handler (unlike downloadTo's 404-on-fail). If the remote lacks the zip binary (common on minimal hosts), the dir is gone, or ssh dies mid-stream, stdout just ends — the browser saves a 0-byte/truncated .zip as a seemingly successful download, and nothing anywhere tells the user it failed.
  - fix: Handle child 'close': if code !== 0 and nothing was written, end with an error status (or destroy the socket so the browser marks the download failed instead of complete); optionally pre-probe `command -v zip` and return a 400 with a clear message before setting attachment headers.
- **[low/no-indicator]** `src/mounts.js:599` — Storage rows during a mount connect window
  - problem: mount() can legitimately spend 10–25s in its connect window (5s mountpoint wait + 6s IO probe + v4/v2 auth probes), guarded by the server-side _connecting set — but list() exposes only desired/mounted/error, never a connecting flag. Every OTHER client shows a plain grey 'Not mounted' dot the whole time, and even the initiating client's only feedback (row opacity 0.6 set at sidebar-mounts.js:437) is wiped by any mounts-updated broadcast that re-renders the panel mid-connect (e.g. another mount's health sweep). The row never says 'connecting'.
  - fix: Expose `connecting: this._connecting?.has(m.id) || false` in list(), broadcast _notify() at connect start, and render an amber pulsing dot + 'Connecting…' label in _buildMountRow when set.
- **[low/silent-error]** `src/lib/file-explorer.js:266` — Explorer bookmarks (add/rename/reorder/remove)
  - problem: _saveBookmarks swallows the POST failure with a bare `catch {}` while every caller has already re-rendered the local array as if the change succeeded — under server lag/restart the bookmark edit silently never persists and quietly reverts on the next page load or bookmarks-updated broadcast. Violates the 静默失败零容忍 rule: a user action fails with no toast/inline notice.
  - fix: In the catch, showToast(t('Bookmark change not saved: {msg}'), { type: 'error' }) and re-fetch /api/bookmarks to reconcile the local list with server truth.
### lens: hosts-dataplane

- **[high/unbounded-op]** `src/agentd/client.js:427` — remote usage harvest (Usage window) / agentd runStream
  - problem: DeviceManager.runStream's session handler registers only {onData, onExitMsg} (client.js:427-430). The mux link-death path (mux.onDead at client.js:241) notifies handlers via onClose/onExit only — runStream has neither, and its stall timer arms only AFTER a stream-exit control arrived (check() at 422-425). So if the device link dies or wedges mid-stream (heartbeat kills it ~40s in, or a half-open ssh bridge), the returned `done` promise NEVER settles. Consumer hosts.harvestUsage (hosts.js:1153) then hangs forever, and usage-routes.js:411-427 holds `_harvestBusy=true` across the await — every later POST /api/usage-stats/harvest-hosts returns {busy:true} permanently until server restart. One flap during a harvest silently kills remote usage collection for ALL hosts.
  - fix: In runStream, add onExit/onClose to the session handler that settle the done promise with {error:'device link lost'}, plus an overall deadline option; alternatively wrap hosts.harvestUsage's device path in a hard deadline (the deviceBounded pattern applied to the op, not just the connect) and make _harvestBusy a timestamped lease that expires.
- **[high/silent-error]** `src/hosts.js:957` — remote resume adopt-vs-sweep (findKeeperFor)
  - problem: findKeeperFor swallows EVERY failure into `catch { return null; }` (hosts.js:957) — including the 10s _hostShell timeout on a merely-slow host (and the ssh leg's 10s is below the documented ≥15s session-establishing bar the dial leg honors). Callers (ws-handler.js:1256-1259, 1165-1167, 279) cannot distinguish 'probe answered: no live keeper' from 'probe failed', so on host lag >10s the resume path falls into writerSweepScript (ws-handler.js:1260/1174) and SIGTERMs the healthy surviving claude it would have adopted — exactly the failure mode the code's own comment (hosts.js:947-951) warns a deadline produces. The user just sees a resumed session; the kill of the survivor is invisible.
  - fix: Return a distinct sentinel on probe FAILURE (e.g. {error:true}) vs a clean null; on probe failure the resume should refuse with an honest 'host not responding — retry' error (or re-probe once) instead of proceeding to sweep+respawn; raise the ssh-leg timeoutMs to ≥15s per the documented invariant.
- **[high/unbounded-op]** `src/agentd/client.js:320` — dial device session open (chat + terminal via DialSessionBridge)
  - problem: openPipeSession/openSession's `handle.ready` promise settles only on an explicit session-open/pipe-session-open (resolveReady) or session-error (rejectReady) control message. The registered handler's onExit is `(code) => handle.onExit?.(code)` (client.js:323-324), and handle.onExit is assigned by the consumer only AFTER `await handle.ready` (dial-session-bridge.js:110-120, 85-87) — so a device-link death between the open request and the daemon's reply (mux.onDead fires s.onExit(-1)) is a no-op and `ready` stays pending FOREVER. DialSessionBridge._serve then hangs at `await handle.ready`, never sends session-error, and the attach client keeps a healthy loopback socket to a hung bridge: the dial chat/terminal window stays blank indefinitely with no retry (chat-wrapper respawns only on attach-process exit) and no error — the pre-ready twin of the B-b87b CRITICAL that was fixed only for the post-ready data path.
  - fix: In openSession/openPipeSession, track a `settled` flag and make the stored onExit/onClose handlers rejectReady(new Error('device link lost')) while ready is unsettled; belt: Promise.race the bridge's `await handle.ready` with a ~30s deadline that emits session-error to the attach client.
- **[medium/divergent-logic]** `src/hosts.js:1157` — remote usage harvest on dial devices
  - problem: harvestUsage's device-path catch (hosts.js:1157) swallows the real error and falls through to the ssh branch — but for a dial host `sshArgs` throws synchronously inside the Promise executor ('is a dial-out device — it has no ssh'), so the surfaced error names a nonexistent transport problem instead of the actual device-link failure. Worse, the 15-min throttle was already stamped at entry (line 1142) and the reset (`_usageHarvestAt.set(id, 0)`, line 1163) lives in the unreachable execFile callback, so a failed dial harvest is silently throttled for 15 minutes with a misleading error. The ssh fallback branch is dead code for dial that only masks the device path's diagnosis.
  - fix: For h.transport==='dial', rethrow the device-path error (e2) directly instead of falling into the ssh branch, and reset the throttle timestamp on any failure so the next kick retries.
- **[medium/silent-error]** `src/lib/usage-window.js:160` — Usage window remote-host ledger freshness
  - problem: The Usage window kicks POST /api/usage-stats/harvest-hosts and reads ONLY the summed `added` count; the server's per-host `{error}` entries (usage-routes.js:425) are discarded and the outer `.catch(() => {})` swallows transport failures. A host whose harvest has been failing for days shows its old ledger events in the Device filter with zero staleness marking or error — the user believes remote usage is current. This is the exact class the remote-discovery stale-marked cache fixed for the sidebar, missing here.
  - fix: Render per-host harvest errors from the response (e.g. an amber line in the Usage controls: 'host X: ledger harvest failing — <reason>, data as of <last ingest>'), and surface the last-successful-harvest timestamp per host bucket.
- **[medium/silent-error]** `src/usage-routes.js:478` — remote host quota ⟳ (usage popup / Agents machine view)
  - problem: hosts.readRemoteOAuth/readRemoteSubOAuth return null for BOTH 'no token on the host' and 'host unreachable/timed out' (hosts.js:1178, 1195 — `catch { return null; }`). The refresh route then tells the user 'no currently-valid login token on the host — log in / run claude there first' (usage-routes.js:478, 455) — a wrong diagnosis with wrong remediation when the host is merely down or lagging. The 60s throttle is also stamped BEFORE the probe (lines 476/453), so an immediate retry after the failed probe reports {throttled:true}.
  - fix: Make readRemoteOAuth throw (or return {unreachable:true}) on _hostShell failure so the route can answer 'host unreachable — could not check its login' distinctly from token-absent; only stamp the throttle after a probe actually reached the host.
- **[medium/silent-error]** `src/ws-handler.js:2288` — Terminate of a remote/dial chat session
  - problem: The dial terminate teardown rides raw `hosts.device(session.host)` (full ~2.7min connect ladder, not deviceBounded) and ends in `.catch(() => {})` (ws-handler.js:2288-2292); the ssh teardown's execFile callback likewise ignores its error (2309-2313). The 'exited/terminated' broadcast at 2320 fires unconditionally, so when the device is offline or lagging the UI reports the session terminated while the device-side claude survives — still writing the JSONL and burning quota — and the user is never told the remote kill failed (violates 静默失败零容忍; recovery only happens if a later resume's writer sweep runs).
  - fix: Use deviceBounded(id, 8000) for the teardown, and on failure send a server-notice/toast: 'terminated locally, but the claude process on <host> could not be reached — it may still be running there' (mirror the amber remoteState chip wording).
- **[medium/silent-error]** `src/ws-handler.js:1276` — pre-resume writer sweep (remote resume)
  - problem: Both writer-sweep legs degrade-and-continue on failure: ssh `execFileSync(... writerSweepScript ...)` catch → `console.warn('[remote] pre-resume cleanup failed (continuing)')` (ws-handler.js:1276) and the dial twin at 1179. Under host lag the 20s sweep times out but the subsequent respawn (over a fresh, possibly-recovered connection) succeeds — recreating the double-JSONL-writer the sweep exists to prevent ('resume did nothing / session ends'), with only a server-side console line. The user gets a working-looking resumed window while a second writer corrupts the transcript.
  - fix: When the sweep fails AND the resume is a respawn (no keeperSid adoption), fail the create with 'host not responding — could not verify no other process is writing this conversation; retry' instead of continuing, or at minimum surface a server-notice that the double-writer guard was skipped.
- **[medium/silent-error]** `server.js:2202` — session restore via local device #0 (agentd M1)
  - problem: restoreSessions' M1 branch calls deviceMgr.openSession(...) and wires the pty shim as soon as the promise resolves — it never awaits `handle.ready`. If the daemon later answers `session-error` (dead dtach socket, spawn failure), the error only rejects the un-awaited ready promise (logged by the global unhandledRejection handler) — the shim never emits data or exit, the localAttach() fallback at 2204 never runs (it only covers connect() rejection), and the restored terminal window sits permanently blank with no error and no local-pty rescue.
  - fix: Chain `.then((h) => h.ready.then(() => { setupSessionPty(...); repaintClients(); }))` so a session-error rides the existing `.catch` into localAttach(); also attach a no-op catch to handle.ready in openSession to keep the rejection observed.
- **[low/unbounded-op]** `src/hosts.js:634` — remote directory autocomplete (New Session / mounts dialogs)
  - problem: dirComplete's device path bounds the connect (deviceBounded 4000) and the $HOME probes (5s) but `dm.fsList(base)` (hosts.js:634) inherits the _request 30s default — on a wedged-but-connected link a keystroke's autocomplete request can sit 30s (the local equivalent uses a 500ms timeout). And for dial hosts every failure collapses to `return []` (line 640), indistinguishable from 'no matching directories' — the user sees an empty dropdown, not a connectivity problem.
  - fix: Pass a short timeoutMs (~4-5s) to fsList (add a timeout option to _request-backed fs ops), and let the route return a distinguishable error/flag so the autocomplete dropdown can render 'host not responding' instead of silently empty.
- **[low/divergent-logic]** `src/agentd/agentd.js:900` — remote session discovery over the agentd data plane
  - problem: The daemon's discovery-snapshot returns only {locks, jsonls, codexRollouts} — it never scans ~/.vibespace/run or ~/.vibespace/*/state/sessions, while the legacy ssh discovery script emits `K` keeper-meta lines (hosts.js:1230-1232) that feed keeperBySession → per-card keeperSid. Since dataPlane is default ON, the synthesized path (hosts.js:1293-1307 builds LOCK/J/H/N/T/C but no K) is the primary one for ALL hosts, so discovered cards' keeperSid attach-hint is silently absent in the default configuration and the two discovery paths return different data — the exact remote-only-divergence class; today it is only absorbed because the resume path re-probes via findKeeperFor (ws-handler.js:1254 comment admits 'dial discovery carries no pipe sids').
  - fix: Add keeper/pipe-session metas to the daemon's discovery-snapshot (scan run/ + state/sessions like findKeeperFor does) and synthesize K lines in hosts.discoverSessions' device branch so both paths yield identical facts.
### lens: sidebar-discovery

- **[high/stale-cache-lie]** `src/lib/sidebar-workbench.js:257` — Sidebar Recent/History remote zones (discovered session cards)
  - problem: hosts.discoverSessions serves last-known results marked `{...s, stale: true, staleAt}` when a host is unreachable (src/hosts.js:1315-1318), but the client drops the flag everywhere: _loadRemoteHost stores only {sessions, error} (line 99), _remoteToCardSession whitelists sessionId/name/cwd/status/pid/mtime and omits `stale`/`staleAt` (lines 257-278), and _buildRecentHead counts stale entries in the zone count (lines 51-54). A dead host's hours-old scan renders as fresh discovery — including `remote-running`→'external' cards implying live processes that may have exited long ago — indistinguishable from a healthy host.
  - fix: Thread s.stale/staleAt into _remoteToCardSession and render an amber 'last known · Xm ago' chip on stale cards (same visual language as the session card's remoteState chip); show a 'showing cached results — host unreachable' row above the zone when st.sessions[0]?.stale, next to the existing ⟳ button.
- **[high/silent-error]** `src/lib/sidebar-workbench.js:341` — Sidebar manage-mode batch terminate/archive on remote discovered cards
  - problem: Manage-mode mark buttons render on EVERY card incl. remote discovered ones (session-card.js:280-303), but _applyManageMarks resolves marks only against this._allSessions (line 334) — remote discovered sessions live in _wbRemoteHosts, so `if (!s) continue;` (line 341) silently drops their marks, then line 376 toasts '(terminate 1) applied' anyway. User confirms a danger dialog to terminate a remote external claude, gets a success toast, and the remote process keeps running. Even if resolution worked, line 357 calls `this.app.killPid(s.pid)` WITHOUT the host argument — the exact host-less local-kill bug fixed at session-card.js:764/832 in 2.191.0.
  - fix: Also resolve marks against the _wbRemoteHosts session lists (key = `${backend}:${sessionId}`), pass s.host to killPid, and count unresolvable marks into the toast as 'N skipped' (or refuse marking cards that can't be resolved) instead of unconditionally claiming success.
- **[high/silent-error]** `src/lib/sidebar.js:671` — Sidebar 5s session poll (/api/sessions)
  - problem: _poll does `const data = await res.json()` with no res.ok/data.error check, then `this._systemSessions = data.sessions || []`. A transient 500 from the discovery sweep (e.g. the un-guarded fs.readdirSync(projPath) at src/routes/sessions.js:637 racing a deleted project dir, or any sweep throw under NFS lag) parses as `{error}` → sessions becomes [] → the ENTIRE discovered session list vanishes from the sidebar for ≥5s and flip-flops back on the next good poll (empty↔full flicker under sustained lag). The outer `catch {}` (line 673) additionally swallows network failures so a frozen list carries no staleness marking at all.
  - fix: Check res.ok/data.error and on failure KEEP the previous _systemSessions (never replace with []); after N consecutive failures show a dim 'session list may be out of date' row or badge in the sidebar header instead of silently rendering the last snapshot.
- **[medium/silent-error]** `src/lib/sidebar-workbench.js:103` — Remote zone discovery fetch retry (server unreachable case)
  - problem: The .catch path stores `sessions: null`, which defeats the retry guard at line 90 (`cur.loading || cur.sessions` — null is falsy), and every retry start (line 91) clears the error before render. So when the fetch itself fails (server restarting, proxy 502 returning HTML that breaks r.json()), _renderRemoteRecent(line 188) → _loadRemoteHost → immediate retry → failure → relevant()→_render → retry… — a tight retry loop with no backoff whose visible state is a permanent 'Scanning sessions over ssh…' row; the 'Discovery failed' row set at line 103 is never on screen for the selected host.
  - fix: On catch, keep prior sessions (`sessions: cur?.sessions || null`) plus the error, mark `lastFailAt`, and make the line-90 guard also skip when a recent failure exists (backoff, e.g. 10s); render the stored error alongside the stale list instead of clearing it at retry start.
- **[medium/no-indicator]** `src/lib/sidebar-workbench.js:92` — Remote zone ⟳ re-scan button (Recent line 69, History line 585)
  - problem: Clicking 'Re-scan sessions on this host' with a cached list gives zero feedback: the comment at line 92 claims '_render shows the scanning row immediately' but the scanning row only renders when `st.loading && !st.sessions` (lines 192, 566) — with cached sessions present the zone re-renders the OLD list unchanged, the button doesn't spin or disable, and on a slow host (up to 12s device deadline + 20s ssh) the user sees nothing happen for tens of seconds and typically re-clicks.
  - fix: While `st.loading && st.sessions`, add a spinning class to the ⟳ button and a dim 'refreshing…' suffix on the zone count (the '…' pattern already exists for the no-cache case); clear on completion.
- **[medium/silent-error]** `src/lib/sidebar-workbench.js:82` — Sidebar host switcher bootstrap (/api/hosts fetch)
  - problem: _ensureHostsData sets `_hostsDataLoading = true` and on failure `.catch(() => {})` never resets it — every later call early-returns at line 77, so if the one boot-time /api/hosts fetch fails (page loaded during a server restart window, the exact class fixed elsewhere in 2.223.4), the Recent/History host switchers and cross-host search NEVER appear for the tab's lifetime with no error and no retry. A non-ok JSON response is equally terminal: `this._hostsData = d` stores the `{error}` object, which is truthy, permanently satisfying the guard.
  - fix: Reset _hostsDataLoading in a .finally, only assign _hostsData when d?.hosts is an array, and retry on the next _ensureHostsData call (or on ws reconnect, matching the app.js reconnect-refetch pattern).
- **[medium/no-indicator]** `src/lib/sidebar-workbench.js:166` — Cross-host sidebar search ('Remote matches' section)
  - problem: Typing a search fans _loadRemoteHost out to every configured host (line 465), but _renderRemoteSearchAll skips any host still loading OR whose discovery failed via `if (!st || !st.sessions) continue;` — while scans are in flight (up to ~32s per slow host) the user sees only local matches with no 'searching N remote hosts…' indicator and may conclude nothing matches remotely; a host whose scan errored is silently absent forever (its error renders only when that host is selected in a zone switcher, lines 193/594 — never in search results).
  - fix: In _renderRemoteSearchAll, render a dim 'searching {host}…' row for hosts with st.loading and a one-line 'search on {host} failed: …' row for st.error, under the Remote matches head.
- **[medium/stale-cache-lie]** `src/lib/sidebar-workbench.js:90` — Remote zone client-side discovery cache (Recent/History)
  - problem: _loadRemoteHost early-returns whenever sessions exist (`if (!fresh && cur && (cur.loading || cur.sessions)) return;`) — the remote zone renders a ONE-SHOT scan indefinitely with no age shown (zero-polling is deliberate per the 2.124.0 design, but nothing marks the snapshot's age): a remote-running session that ended hours ago keeps its amber 'external' card, new sessions never appear, and only killPid's post-terminate fresh reload (session-lifecycle.js:374) or the manual ⟳ updates it. The local Recent zone next to it refreshes every 5s, so the two zones silently disagree about 'now'.
  - fix: Record fetchedAt in the host state and render 'as of Xm ago' next to the zone count when older than ~2min (the usage popup's existing 'Updated Xmin ago' pattern); optionally auto-refresh when the tab regains visibility and the snapshot is older than the server's 15s TTL by minutes.
- **[medium/divergent-logic]** `src/hosts.js:1364` — Remote vs local session discovery (naming + metadata)
  - problem: Local discovery (src/routes/sessions.js:668 extractSessionMeta — full JS head parse) and remote discovery (hosts.js:1364-1381 — shell `grep -m6` N-lines, 2000-byte truncation, regex content extraction) are two hand-synced implementations of session naming; the 2.117.0 tag-skip fix had to be applied twice and any future naming rule change must again land in both. Remote codex rollouts additionally get `name: null` unconditionally (hosts.js:1444) while local listCodexThreads extracts real names — remote codex cards degrade to folder-name labels. The agentd discoverySnapshot path already synthesizes the same line format (hosts.js:1276-1308) but only for dial/dataPlane hosts; local /api/sessions never rides the device#0 snapshot at all.
  - fix: Move name extraction into the shared JS side: have the remote script/snapshot ship raw early user records (it already ships N lines) and run ONE shared extractName() over both local heads and remote N-lines; extend the codex snapshot with head-name extraction. Longer term, serve local discovery from the same DeviceManager discoverySnapshot as device #0 per the stated unification target.
- **[low/divergent-logic]** `src/lib/sidebar-workbench.js:149` — Sidebar text filter — remote vs local field coverage
  - problem: _wbFilterRemote matches only cwd/projDir/name/sessionId (lines 149-150) while the local filter in _renderInner matches sessionKey, webuiName, backend, sourceKind, agentKind, agentRole, agentNickname too (src/lib/sidebar.js:852-863). Concretely, searching 'codex' lists every local codex session but no remote codex rollout (backend:'codex' isn't consulted remotely) — the same query silently means different things per machine.
  - fix: Extend _wbFilterRemote (and _renderRemoteSearchAll's inline copy at lines 166-169) to also match s.backend and any other fields present on discovered sessions, or factor one shared matchesFilter(s, f) used by both paths.
- **[low/no-indicator]** `src/lib/sidebar-mounts.js:660` — Remote tab Machines rows — connectivity auto-probe
  - problem: While _autoTestHosts has a probe in flight (up to 10s fresh-ssh, hosts.js:583), the row's dot renders the no-status branch: grey 'off' with tooltip 'Not tested yet' (lines 657-660) — indistinguishable from never-probed, so on panel open every ssh machine looks untested/possibly-dead for the probe window with no 'testing…' state; the row only changes when the in-place swap lands (line 609).
  - fix: When this._hostTesting?.has(h.id), render a distinct pulsing dot class + 'testing…' tooltip in _buildHostRow (the row is already rebuilt in place when the probe resolves).
### lens: spawn-chain

- **[high/silent-error]** `src/ws-handler.js:2309` — Terminate (kill) of a remote/dial session
  - problem: The kill case broadcasts `exited reason:'terminated'` (line 2320) and deletes the session BEFORE the remote teardown resolves, and every remote-teardown failure is swallowed: the ssh leg `execFile('ssh', …, {timeout:15000}, () => {…})` ignores its err argument entirely (2309-2313), the dial leg wraps killPipeSession/token-rm in per-step `catch {}` plus an outer `.catch(() => {})` (2288-2292), and the whole block sits in `try {…} catch {}` (2317). On a slow/unreachable host the user sees instant 'terminated' success while the host-side claude keeps running and writing the JSONL (double-writer at the next resume, billing keeps burning). Zero toast/serverNotice; not even a console line.
  - fix: Check the teardown result: on ssh err/timeout or dial rejection, emit serverNotice('kill-remote-failed-<host>', 'Terminated locally, but the process on <host> could not be confirmed dead — it may still be running') and mark the discovered session card (remoteState-style chip) until discovery confirms it stopped.
- **[high/silent-error]** `src/ws-handler.js:1276` — Remote resume — pre-resume writer sweep (B-4058)
  - problem: Both writer-sweep invocations degrade-and-continue on failure: ssh `execFileSync(…writerSweepScript…, {timeout:20000})` → `catch (e) { console.warn('[remote] pre-resume cleanup failed (continuing)') }` (1276), dial `dm.runCmd(…)` → same console.warn (1179). Under exactly the failure the sweep exists for (host lag > 20s, banner hang), the sweep is skipped and the resume proceeds to spawn a SECOND writer onto the same JSONL — the transcript-corruption class B-4058 was built to prevent — with no user-visible signal that cleanup was skipped.
  - fix: When the sweep fails on a resume, either refuse with a retryable error (like cwd-missing) or attach a warning to the `created` reply + serverNotice ('could not verify no other process is writing this conversation on <host> — transcript may double-write') so the user can choose to wait/retry.
- **[high/unbounded-op]** `src/ws-handler.js:746` — Server event loop — remote create/resume spawn ladder
  - problem: The create path still runs SYNCHRONOUS ssh on the event loop: tool distribution `execFileSync('ssh', …, {input:tar, timeout:20000})` (746-747), subscription-creds ship `execFileSync('ssh', …, {timeout:20000})` (952), and the writer sweep `execFileSync('ssh', …, {timeout:20000})` (1274) — sequentially up to ~60s on one create. On a lossy host (TCP opens, banner hangs — the documented 2.246.2 mode) each call blocks until its timeout, freezing EVERY client's WS traffic, polls and live sessions — the exact whole-server-freeze class the 2.242.0 async-discovery fix removed, never applied to the spawn chain.
  - fix: Convert the three execFileSync ssh calls to async execFile (the create handler is already async; the 15-20s deadlines can stay per the session-establishing invariant) so a slow host stalls only that create, not the whole server.
- **[high/no-indicator]** `src/lib/session-lifecycle.js:319` — New/resumed session window during create
  - problem: createSession opens the window at line 35 but nothing renders inside it until the 'created' reply builds the ChatView/TerminalSession (line 250+). A remote create lawfully takes 5-60s (hosts.homeDir full ladder, cwd preflight, tool tar, writer sweep, ensureAgentdOnHost provisioning — all before 'created' at ws-handler.js:1645), during which the user stares at a BLANK window; the only feedback is the 15s timeout toast 'Creating the session is taking unusually long — check the connection or reload the tab', which misdiagnoses a slow host as a connection problem and invites a reload that abandons the create (resend is gated to claude resumes only, so a fresh remote create lost to a reconnect leaves a spec-less shell that evaporates on refresh).
  - fix: Render a pending placeholder ('Creating on <host>… / provisioning tools / cleaning up previous writer') in the window at creation, add a server create-ack (mirror of attach-ack, ws-handler.js:1984) so the ladder's progress is visible, and reword the timeout to the 'may still be in progress' pattern.
- **[medium/silent-error]** `src/ws-handler.js:772` — ssh remote spawn — agent tool distribution
  - problem: remoteAgentSetup's tar-over-ssh shipping failure is `console.error('[remote] tool distribution failed')` then continue (769-774): the session spawns with VIBESPACE_API/reverse tunnel still armed (776-788) but no tools, no hook registration and no vsst_ token on the host — the agent is then taught (via context injection) copy-ready `vibespace-status/-task/-ask` invocations that all fail as command-not-found. No serverNotice, no session chip; the user only sees the agent flailing.
  - fix: On shipping failure, serverNotice keyed per host ('agent tools could not be installed on <host> — vibespace-status/task/ask will not work in this session') and suppress the tools-teaching context for that session (don't teach dead commands).
- **[medium/silent-error]** `src/ws-handler.js:1006` — Dial device spawn — deviceAgentSetup degrade path
  - problem: On dial spawns the entire agent setup (tools fsWrite, token, hook-register, VIBESPACE_API reverseForward back-tunnel) degrades to `{envPairs:[], tokenAssign:''}` with only `console.warn('[dial] agent setup degraded')` (1006 terminal, 1191 chat) — integration is completely dead for that session with zero user-visible signal. Inside deviceAgentSetup the degradation is even quieter: per-tool fsWrite failures are swallowed with no log at all (819-823), the editor helper write is `catch { }` (830), and hook registration is `.catch(() => {})` (841), so a PARTIAL tool set ships invisibly.
  - fix: Same remedy as the ssh path: one serverNotice per degraded spawn naming the host and what's missing, plus at minimum a console line for the per-tool swallows so incident bundles can see partial ships.
- **[medium/silent-error]** `src/ws-handler.js:1336` — ssh remote chat — agentd provisioning → keeper fallback
  - problem: `ensureAgentdOnHost` failure falls back to the legacy keeper with only `console.warn('[device] remote provisioning failed — keeper fallback')` (1335-1338). The underlying cause (bundle upload failure, node missing, disk full on host) never reaches the user or Manage-Agents, and the session silently runs on the legacy transport (no incremental slab sync, no keeper-attach optimization, different kill semantics) — a divergence the user can neither see nor act on; recurring provisioning failures on a host stay invisible forever.
  - fix: serverNotice once per host per boot ('could not provision the device agent on <host> (<reason>) — session running on the legacy transport') and record the effective transport in session meta so Session Properties shows it.
- **[medium/silent-error]** `server.js:3700` — Remote context-folder sync (task groups)
  - problem: syncRemoteGroupCtx swallows every failure: `catch (e) { console.warn('[ctx-sync]', …) }` (3700), scheduleCtxSync wraps in `catch { }` (3779), and syncDialGroupCtx swallows per-file fsWrite/fsReadRange errors (3751-3752, 3760-3765). Meanwhile remoteCtxBaseFor still path-translates the injected file index to <remoteHome>/.vibespace/ctx/<groupId>, so after a failed/partial sync the agent is TAUGHT file paths that don't exist or are stale on the host — the exact 'dial agents were taught file paths that never existed' class the B-b87b comment describes — and neither the user nor the task-detail UI ever learns the sync is failing.
  - fix: Track last-sync ok/error per host:group; on persistent failure serverNotice + show a sync-status line in task-detail / the session's group context, and fall back to local paths (or omit the file index) when the last sync for that host failed.
- **[medium/no-indicator]** `src/lib/session-lifecycle.js:491` — Initial session attach (window restore / sidebar click)
  - problem: The initial attachSession request only matches 'error'/'attached' (437-485) — the server's synchronous attach-ack proof-of-life (ws-handler.js:1984) is consumed exclusively by chat-view.js's reconnect _reattach ladder. So on a remote session whose transcript pull or history rebuild lawfully exceeds 12s, the window sits blank and the timeout toast fires with the pre-2.234.1 wording 'check the connection or reload the tab' even though the ack already proved the server is alive and working — the exact misdiagnosis the attach-ack pattern was built to remove, missing on this surface.
  - fix: Have the attach ws.request matchFn observe attach-ack: switch the blank window to a 'loading history from <host>…' placeholder, and once acked reword/suppress the 12s toast to the 'may still be loading' pattern.
- **[medium/silent-error]** `src/hosts.js:952` — Remote resume — findKeeperFor adopt-vs-respawn probe
  - problem: findKeeperFor runs _hostShell with timeoutMs:10000 and `catch { return null }` (952, 957) — despite the inline comment and the documented invariant that adopt-vs-respawn probes need the full ladder or ≥15s, because a timeout 'reads as no live keeper'. Under host lag >10s the probe silently returns null, every consumer (ws-handler.js:279, 1165, 1256) proceeds to the writer sweep, and the sweep SIGTERMs the perfectly healthy remote claude mid-turn before respawning — a destructive downgrade with no notice anywhere (the catch even eats the timeout distinction).
  - fix: Raise the bound to ≥15s per the invariant and distinguish timeout from definitive-absent: on timeout, either retry once or surface ('could not verify whether the conversation is still running on <host> — restarting it') before sweeping.
- **[medium/silent-error]** `src/ws-handler.js:2216` — Terminate — unknown/stale session id
  - problem: The kill case is `if (session) {…}` with NO else reply (2216-2217): a kill whose sessionId is stale AND whose backendSessionId fallback misses (or was never sent — session-lifecycle's killSession (358) and the three onClose kill senders (259, 332, 462) send sessionId only, unlike chat-view/manage-agents which pass backendSessionId) silently does nothing. The client fire-and-forgets, so the user's Terminate click produces no error, no toast, and a still-live session — the pre-2.179.0 no-op'd-kill shape survives on these senders.
  - fix: Reply `{type:'error', code:'kill-not-found'}` when no session resolves so clients can toast 'session not found — refresh the sidebar', and pass backendSessionId from the remaining kill senders.
- **[medium/divergent-logic]** `src/ws-handler.js:1082` — Spawn chain — local vs ssh vs dial transports
  - problem: The create case contains four transport-specific reimplementations of the same ladder: tool shipping (ssh = sync tar-over-stdin all-or-nothing at 732-775; dial = async per-file fsWrite with per-file swallows at 816-841; local = PATH prepend), account placement (remoteAccountEnv ssh tar vs deviceAgentSetup fsWrite vs localEnv), and the writer sweep — writerSweepScript is defined INSIDE the remote chat branch (1082) and runs only on ssh (1274) and dial (1177) resumes: a LOCAL resume of a conversation still held by an external/orphaned local claude has NO sweep at all (the resume-already-live guard at 202-218 checks only activeSessions = webui-managed), so the local branch can still double-write the JSONL in exactly the case the remote branches were hardened against. Every recent remote-only incident (dial sweep missing, B-218d keeper-vs-agentd routing, dial ctx sync missing) came from one branch getting a fix the siblings lacked.
  - fix: Route the spawn ladder through hosts.device(id) uniformly (local = device #0 DeviceManager already exists via agentd.sessions): one writer-sweep, one tool-ship, one account-placement implementation parameterized by dm.runCmd/fsWrite, so a fix lands on all transports at once — starting by running writerSweepScript locally too.
- **[low/silent-error]** `src/ws-handler.js:1483` — Resume crash-loop detector
  - problem: The ≥3-creates-in-10min crash-loop detector emits only `console.warn` + a telemetry event (1482-1485); the no-convo breaker covers just one loop cause ('No conversation found'), so a conversation looping for any other reason (bad saved flags, dead account, host-side instant death) restarts repeatedly with no user-facing signal that a loop is happening.
  - fix: Promote the detection to serverNotice ('conversation <id> has restarted Nx in 10 minutes — something is failing at spawn; check the session card') so the user learns about the loop the moment it's detected.

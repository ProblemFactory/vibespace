'use strict';
/**
 * WHAT THE MAIN LOOP SPENDS ITSELF ON, BY OWNER (lane hub-loop-stalls, unit loop-day-report, piece M3 — the measurement
 * release: the share of the hour's main-thread time by FUTURE OWNER, read off the journal of a pod nobody opens the page of).
 * PURE: the OWNERS table and the HELPERS list, the booking of one answer, the fold of one take. The ORCH halves are the
 * watchdog thread (src/server/sync-fs-witness-worker.js: the census's ticks and asks) and the main side's `census()` (the
 * take, once an hour, src/server/sync-fs-witness.js).
 *
 * THE LAW (cure r2, S2): THE OWNER OF A FILE IS ITS FUTURE OWNER — the end-state design's (interface · vault · channels ·
 * money · workspace · machines · conversation, the machine side). Every file the hub can load matches EXACTLY ONE owner by
 * a rule on its install-relative path, or sits on the ONE short list of SHARED HELPERS — modules that hold no state and
 * belong to nobody (scripts/test-loop-census.mjs ② counts it over the tree: unowned 0, a new file with no row is red by name).
 * CURE r3 (T1): A FILE WHOSE OWN CODE DOES TWO OWNERS' WORK IS BOOKED UNDER ITS OWN NAME, NEVER ON ONE OF THEM — the
 * SPLIT list (short, explicit, one line of why each: which owners), each its own bucket `split:<short>` outside the seven;
 * no owner's rule matches a split file, so the seven hold only files that are one owner's. Never a function or line table:
 * the file's name is the honest answer, and it is what the refactor has to cut.
 *
 * THE CENSUS — commit 1's sampler at a LOW rate over the whole hour, never a profiler: Runtime.evaluate of the one
 * constant SAMPLE_EXPR (src/loop-hold.js) from the watchdog THREAD, nothing enabled, no .cpuprofile, no file, no journal
 * line. One tick every CENSUS_EVERY_MS on average (each interval drawn between half and one and a half of it, as a
 * capture's — a fixed period phase-locks with the hub's own timers), classed EXACTLY as a capture's tick
 * (src/cpu-capture.js tickOf — the main thread's kernel state first: asleep in its own loop's poll with the beat fresh is
 * IDLE and never asked; a hold open is HELD; stopped; another ask out, a capture or a profile running is NOT SAMPLED);
 * else ONE ask, or booked on the census's own ask in flight. An answer books its ticks (bookOf) on the OWNER of the first
 * OWNED frame walking OUTWARD from the innermost — or, when that first frame is a SPLIT file's, on that file's own bucket
 * (`split:<short>`) — the walk passes Node's internals, built-ins, node_modules, eval'd code and install files with no
 * row (data/plugins/…), and passes a SHARED HELPER's frame counting it (`viaHelper`); it never passes an owned or a split
 * frame. The instrument's own frames are trimmed (src/loop-hold.js instrumentTrim), and time inside a native
 * call, a parse, a synchronous system call is its JavaScript caller's (an ask lands at the first JavaScript). 'outside'
 * when no frame of the stack is owned (Node's internals or a library alone, or helpers alone); 'native' when the stack has
 * no JavaScript frame; `deep` when the sample's frame list was FULL (FRAME_LIMIT) with no owned frame in it — booked
 * outside, the owner may lie beyond the limit. COUNTS ONLY: no frame, path or name is kept.
 * ITS PRIORITY IS THE LOWEST: it asks only when no ask is in flight and no capture or profile runs, and a hold, a capture or
 * a profile that finds its ask in flight TAKES it as its own (the watchdog's takeCensusAsk) — none waits behind it.
 * THE COST, bounded and said in the take: each ask's own run on the main thread (the note's µs, as a capture sums it)
 * summed and its largest kept; one past ASK_BOUND_MS halves the rate, no slower than one per CENSUS_FLOOR_MS; the hour's
 * take resets the counts and the rate. AN ASK UNDER THE BOUND NEVER HALVES THE RATE, so the bound's worst case is a loop
 * busy the whole hour asked 3 600 times at 4 ms each + DISPATCH_MS: 3 600 × 4.3 ms ≈ 15.5 s an hour (0.43 %) — the
 * measured ask (≈ 0.45 ms paid) makes that hour ≈ 1.6 s. Paused — its ticks counted, nothing asked — by the flags that stop
 * a capture: the setting off or not read yet, a debugger port open, the heap near its limit (and with no inspector).
 */
const CC = require('./cpu-capture.js');
const LH = require('./loop-hold.js');

const CENSUS_EVERY_MS = 1000;   // one tick a second on average: ≤ 3600 an hour, an ask only when the loop is not idle
const CENSUS_FLOOR_MS = 8000;   // a halved rate goes no slower than one tick per 8 s
const ASK_BOUND_MS = CC.ASK_BOUND_MS;   // one ask's own run past this (4 ms, the capture's) ⇒ the rate halves; at or under it, never
const TAKE_WAIT_MS = 2000;   // the main side waits this long for the watchdog thread's take, then answers null
// cure r1 (R1): THE PRICE THE MAIN THREAD PAYS for one ask beyond its own run — the inspector's dispatch of Runtime.evaluate (the
// message, the compile of the constant expression, the answer's serialization), MEASURED (ldr/census/results.txt: ABBA, the main
// thread's schedstat with the census on and off, a 6 MB and a 1 GB heap): 0.40–0.43 ms paid a piece of which 0.11–0.16 ms is the
// ask's own run ⇒ 0.27–0.33 ms of dispatch, taken at 0.3 ms. The own run is measured LIVE, ask by ask; the dispatch is this constant.
const DISPATCH_MS = 0.3;
// THE SAMPLE'S FRAME LIMIT: SAMPLE_EXPR asks V8 for 32 frames (Error.stackTraceLimit) and skips its own ⇒ at most 31 come back
// (both forms; test-loop-census pins it against the expression). A list this long may have been cut: an owner can lie beyond it.
const FRAME_LIMIT = 31;

// ── THE OWNERS — rules on the INSTALL-RELATIVE path; every file the hub loads matches EXACTLY ONE owner's (the census leg
// counts the matches, never an order). `name`: the file's whole name; `lead`: its name begins with one of these words (a
// whole dash-word); `but`: a family of names minus the ones another owner holds — each for a file directly in src/,
// src/server/, src/routes/ or src/lib/ (one name = one engine: its model, its engine, its route, its page half); `dir`: a
// folder of src/ whose files are all one owner's. A file whose OWN code does two owners' work matches NO rule: it is a
// SPLIT row below (cure r3, T1). Where a file holds one owner's work and only CALLS another's, it is the first's.
const F = '^src/(?:server/|routes/|lib/)?';
const name = (w) => new RegExp(`${F}(?:${w})\\.[cm]?js$`);
const lead = (w) => new RegExp(`${F}(?:${w})(?:-[\\w.-]*)?\\.[cm]?js$`);
const but = (head, not) => new RegExp(`${F}${head}(?!(?:${not})\\.[cm]?js$)[\\w.-]+\\.[cm]?js$`);
const dir = (d) => new RegExp(`^src/(?:${d})/`);
// the families two owners share, each spelled ONCE (the owner's rule and the other's `but` read the same words)
const BROWSER_ROWS = 'profiles|kept|passkey-store|engines|builds|builds-keeper|installs|cli-install|clone|clone-run|bindings|key|takeover|takeover-request|stale|tabs|human|handback|propose|job-principal';
const BROWSER_VAULT = 'login|logins';
const BROWSER_SPLIT = 'keeper';   // src/server/browser-keeper.js — a SPLIT row (the registry AND the keeper of running browsers)
const QUOTA_HARNESS = 'claude-quota|codex-quota|null-quota|antigravity-usage|antigravity-wall';
const CODEX_MONEY = 'reset-helper|fork-ledger-purge';
const OWNERS = Object.freeze([
  { id: 'interface', words: 'the interface: the page protocol and its fan-out, sign-in, the page-written stores — and the hub process’s own (the listener, boot and exit, the store writer, the loop’s instrument)',
    rules: [/^src\/agentd\/(?:mux|answer-caps)\.js$/,   // lane lg-remote-hardening (B-7f0b D8): the device link's bound beside its frames
      dir('interface'), /^src\/agentd\/chan-(?:duplex|socket)\.js$/, name('door|link-proof|start-pipe|hub-port|interface-party|piped-auth|landing-lang'),   // the separation (M1): the interface's own process, its link, the door class, the hub's port
      name('ws-heartbeat|ws-keepalive|session-broadcast|sync-store|op-seq|static-public|app-csp|csp-reports|frame-host|auth|signin-table|login-page|clerk-auth|write-origin|path-dot-segment|tls|tls-plan|login-words|signin-witness|signin-witness-worker|persistence|landing-answer|user-state-ops|editor|custom-theme-normalize|retired-settings|desktop-record|layout-sync-door|day-one|phone-doors|changelog-style|instance-url'),
      name('runtime-boot|throwaway-root|root-facts|runtime-floor|node-runtime|boot-phase|boot-trace|migration-runner|migration-reads|ops-routes|exit-hook|exit-settle|child-starter|child-starter-proc|store-writer|store-writer-worker|store-read|store-hold|store-read-hold|held-lists|settings-held-strict|fd-close|store-exit-keeper|telemetry|telemetry-summary-worker|opslog|timed-sync|fd-budget|fd-gauge|memory-census|memory-sampler|memory-enforce|worker-memory|cpu-capture|sync-fs-witness|sync-fs-witness-worker'),
      lead('loop|incident'),
      name('ui-needs'),   // lane ui-needs-a-button: the need table of the page's sentences (PURE, no state; read by test-needs-doors)
      name('temp-sweepers')] },   // r1213: the table of the hub's own temp-root sweepers at boot (PURE data; scripts/scratch.mjs reads it)
  { id: 'vault', words: 'the vault: the key and every sealed entry, the mask and its belt, the integration credentials, web logins',
    rules: [lead('vault|secret|key-file|sealed-json|totp|integrations?|app-secrets|cluster-presets|preset-layers|ssh-key|credential-words|agent-output-belt|webauthn-sign|login-hold-words'),
      name(`browser-(?:${BROWSER_VAULT})`)] },
  { id: 'channels', words: 'the channels: mail and chat sign-ins, the index and message logs, the scheduler, vendor calls, the outbox, webhooks, the OAuth landing',
    rules: [dir('channels'), lead('channels'), but('channel-', 'groups(?:-[\\w.-]*)?'),
      lead('webhook|gmail-sync|mail-frame|oauth-loopback|oauth-doors|consent-road|roster-pass|api-call-words'), name('api-call-words\\.generated'),
      name('peer-text')] },   // cure r3: the channel record's belt — it requires src/channel-record.js and runs its frame rule at every call
  { id: 'money', words: 'accounts and money: the pool, usage and readings, the spend guard, auto-resume, the delivery ladder (stash, retry, wakes)',
    // run-reads (B-403e): KEPT, with its reason (follow-up 5) — src/loop-hold.js instrumentTrim passes the helper's frames when a
    // caller follows (INSTRUMENT_FILES), so a hold is booked on its CALLER (the pass, a record, a broadcast, a store's write); it
    // keeps them only for a stack that is the helper's ALONE (no caller of ours: its memo-drop microtask) — THIS rule books that to money
    rules: [name('account-(?:pool-auto|usage-routes|models|tails|display-facts|identity)|login-tie|run-reads|key-names|pool-pin-record|ndjson-lines'),   // ndjson-lines (row B-360d, at its move onto the .416 root: the helpers' list is held at 16 there): an ndjson file read by its lines in bounded reads through its CALLER's descriptor — its two callers money's (the OTel stash's replay, the ledger backfill); key-names (B-ee0a smalls): the default key name's ONE function, PURE; account-display-facts (B-360d): the accounts list's kept sign-in facts · pool-pin-record (lane lg-group-parents B-526c unit 2): the person's pool pin record
       but('usage-', 'walker'),
      name('archive-roll'),   // B-360d part 3 U2: the reading archive's roll (a rename to its day's shard)
      lead('quota|spend|auto-resume|auto-cli|reset-credit|reading|ledger|stash|provider|providers|model-providers|model-family|wait|park-step|record-lateness|slot-transitions|sealed-orders|window-stamp|weekly-lanes-unfold|plan-names|claude-plan-catalog|login-expiry|cost-segments|catalog-pricing|rate-limit-capture|otel-truth|stream-wall|queued-wakes|queued-file-for-you|conversation-deliver|refresh-note|fixture-ledger-purge|agy-turn-usage|cli-usage-door|door-reads|after-turn-read|stopped-by|bulk-resume|delivery-wake'),
      name(`codex-(?:${CODEX_MONEY})|oat-(?:file-sync|identity|identity-model|shape-routes)`), new RegExp(`^src/harnesses/(?:${QUOTA_HARNESS})\\.js$`)] },
  { id: 'workspace', words: 'the workspace: tasks, agent groups, For you, grants, automation, artifact rows, the design and doc registries, the decision engine, voice, feedback',
    rules: [lead('task|member-facts|backlog-select|groups-engine|groups-hold|channel-groups|group-card|msg-acl|worker-dispatch|dispatch-model|foryou|inbox|user-todos|main-asks?|helper-asks?|attention-model|grant-model|grants|ask-grant|ask-setting|setting-holds|automation|artifacts|artifact-registry|doc|published-pages|decision|rule-learning|text-model-client|voice|dropline|feedback|conversation-index|conversation-spec|search-index|search-model|records?-clear|assistant-note|notification-senders|session-status|may-use|end-proposals?'),
      name('image-attach-rule'),   // B-c9ed: THE picture rule — the For-you reply route judges a picture again with it (PURE)
      name('design'), but('design-', 'fs')] },
  { id: 'machines', words: 'the machines registry: hosts and pairing, browser records and leases, jobs records, mounts, desktop apps and windows, plugins, exits',
    rules: [dir('app-kinds|mount-providers|plugins|browser-backends'),
      lead('host-tokens|host-keys|host-key-watch|mutual-auth|agent-listener|push-mount-door|pairing-token|dial-pairing|dial-health|dial-facts|agentd-signature|device|engine-kernel|engine-distribution|apps|install-slot|installs|ffmpeg-install|mic-install|machine-needs|watch-door|machine-mounts|mount|path-mounts|vfs-cache-place|rclone-obscure|storage-path|storage-facts|fs-canary|relay-token|tailnet|tailscale-dns|hub-act|desktop-apps|desktop-app-keeper|desktop-browser-app|desktop-handover|desktop-machines-cache|encoded-command|modifier-map|ssh-config-block'),
      name('mounts-plugins-wiring|plugins'), but('plugin-', 'loader'), but('jobs?-', 'logs-sweep(?:-worker)?'),   // cure r3: hosts, mounts, port-forward, plugin-loader, jobs are SPLIT rows
      name('app-card|app-manifest|app-recipes|app-system|window-(?:reach|request|targets|targets-engine|desktop|unshown)|exit-(?:proxy|reach|routes|shell)'),
      name(`browser|browser-(?:${BROWSER_ROWS})`)] },
  { id: 'conversation', words: 'the conversation, the machine side: create and spawn, the stream parse and its side effects, the hook’s door, files, the keepers’ processes, machine facts',
    rules: [dir('spawn|adapters|agent-routes|server/stdout'), name('signal-ledger') /* B-346d's recorder: the hub's own signals to the keepers' processes */, new RegExp(`^src/harnesses/(?!(?:${QUOTA_HARNESS})\\.js$)[\\w.-]+\\.js$`),
      but('browser-', `${BROWSER_ROWS}|${BROWSER_VAULT}|${BROWSER_SPLIT}`), but('stream-', 'wall'), but('cli-', 'usage-door'), but('agy-', 'turn-usage'), but('codex-', CODEX_MONEY),
      lead('ws-create|spawn-priority|job-logs-sweep|backend-caps|agent-env|agent-cli|agent-tool|hooks-late|hook-root-watch|seen-marks|turn|message|acp|opencode|normalizers|transcript|user-input|user-channel|permission|bypass-auto-allow|queue|goal-sync|compaction-watch|bridge|dial-session-bridge|discovery-facts|sysinfo|machine-probes|ctx-sync|writer-sweep|remote-shell|remote-fs|webdav|files|chat-attachments|dir-slice|dir-collect|cdp|vnc|rfb-signin|novnc-patch|pty-duck|wrapper-files|kept-copies|writes-lost|local-index|local-oracles|resume|rewind|workflow|new-session-spec|path-candidates|path-text|boot-restore|keeper-limits|runaway-guard|memory-pressure|office-open|remoteapp|proc|safe-fs|file-writes|hub-pool|git-identity|harness|owner-facts|tray-words|server-root|safety-stop|record-shape|search-card|collab-row|text-window|peer-messaging|otel-ingest|signin-model|claude-signin|claude-subscription-login|claude-lock-capture|claude-model-catalog|claude-oat|oat-mint|backend-status-route|stop-nudge|model-ask|model-echo|egress-proxy|machine-desktop-model|machine-window|machine-app|mic-model|sound-model|installed-apps|app-serve|app-system-serve|app-squashfs|app-witness|sent-record|sent-provenance|cwd-wait'),
      name('marked-walk|marked-walk-child'),   // B-d8f4 (9): what carries a job's mark, walked in a child through the starter (the forced end, the clear's kept walk, the doubt's stop)
      name('chat-ring'),   // B-5a4d remainder: THE one trim of a claude chat's ring (PURE; the stream parser and the three appenders)
      name('nice-program'),   // B-460d's remainder: THE nice program's look — the hub's starts and the device agent's hello (SHARED)
      name('lock-context'),   // B-6c55: the context a lock keeps (PURE; ws-create, ws-handler, the pool's repin)
      name('model-core'),   // batch 21's cure: a Claude model id's core — the catalog's name rule the lock's verdict shares (PURE)
      name('settings-file-words'),   // B-8dcf part two: a person's own settings file at a claude start (PURE; the adapter, the create, jobs wiring)
      name('attach-read'),   // lane resume-all-paced L3: every attach reads a codex history off the loop, acked while it waits (ws-handler)
      name('subagent-transcript'),   // lane lg-recovery (主开发 r2374): a finished agent's transcript found and read off the loop — the sub-agent attach, the route, the live watcher's finder
      name('bulk-read'),   // B-cd4b r1062: the bulk mark's ONE place — a paced resume's FIRST history read only (PURE; transcript-service, ws-handler)
      name('billing-pick'),   // unit «billing pick alive»: a subscription pick sets the machine's key helper aside (PURE; the create)
      name('settings-merge|settings-merge-device'),   // B-e7c0 (paired machine): the create's ONE bounded ask of a paired machine's agent to merge the person's settings file there
      name('said-journal'),   // B-cd4b (the wrapper's hold): every said line on disk before it is said — the wrappers' journal, the restore's fence (SHARED)
      name('handed-records'),   // B-5a4d's root (unit 1): a handed frame's record by its conversation — read off the loop beside the transcript, drawn by the history read
      name('handed-sweep'),   // B-5a4d's root (the age sweep, r3249): the handed records' only remover — one boot pass beside the aged wrapper files, off the loop
      name('utf8-stream'),   // B-b968: ONE UTF-8 decoder per terminal / conversation output stream (PURE; pty-duck, the re-attach shim, the agent's chat tail)
      name('helper-fact'),   // B-bc9f: a Claude settings file's key-helper fact — ONE rule for the create and a paired machine's probe (PURE)
      name('ckpt-switch'),   // row B-437e U0: the checkpoint switch's PURE verdict (the probe, the release road, their suites)
      name('claude-route-names'),   // B-e7c0 cure: the CLI's route / credential names (PURE) the managed rule and the merge both read
      name('conversation-env'),   // B-ba47's follow-up: the names the create and the spawns write into a conversation's child (PURE; the suites' scratch import and §112 read it — no hub path loads it, so no helper slot: 主开发 r863's should)
      name('home-verdict|home-links'),   // B-ba47 pick B + shape H: whose home a process runs on and the env a re-homed one hands on (PURE), and the re-home's file-system half (the resolver, the linker) — the suites' scratch import and the hub's boot first act (src/server/throwaway-root.js, its owner the boot's)
      name('claude-level-signal'),   // B-24e2: the background signal's declaration + the build's identity, out of the catalog (PURE; the catalog, the device's scan)
      name('left-behind|left-behind-door|left-behind-line'),   // B-69a7: what a stopped turn's command tool left running — the read (SHARED; the hub and the device agent) and the hub's door
      name('managed-claude-settings'),   // lane lg-providers (主开发 23:45Z): does the machine's managed Claude settings set a key helper, credential or address (the create, the provider Test)
      name('usage-walker|design-fs|window-live-wiring|exit-call|exit-facts|unexpected-exit|account-material|login-shell|remote-cli|login-state|conversation-ops|conversation-facts|sessions|sessions-(?:assemble|sweep|sweep-worker)|session-(?:brain|stdout|store|schema|meta-verdict)|desktop-(?:access|backends|display|fit|pin|serve|stream|viewers|webrtc)')] },
].map((o) => Object.freeze({ ...o, rules: Object.freeze(o.rules) })));
// THE SHARED HELPERS — ONE short list: modules that hold NO state and belong to nobody. The walk passes a helper's frame
// (counting `viaHelper`), so its time is the owner's that called it. A helper matches no owner's rule.
const HELPERS = Object.freeze([
  ['src/server/lazy.js', 'a Proxy over a getter that re-resolves on every access and never caches — the extracted modules reach a late singleton through it'],
  ['src/store-pace.js', 'the store writer’s PURE pace: when a dirty store is written, from the numbers its caller hands in'],
  ['src/argv-words.js', 'PURE, imports nothing: one command line ↔ its words'],
  ['src/shell-words.js', 'PURE: the shell’s words read off a command line; its module tables are constants'],
  ['src/when-words.js', 'PURE formatter of an instant in a zone; its one module map memoizes Intl formatters by zone (rebuilt from nothing, no fact)'],
  ['src/hidden-chars.js', 'PURE: is this character hidden — a constant set'],
  ['src/file-disposition.js', 'PURE: the one spelling of a Content-Disposition that names a file'],
  ['src/file-type-table.js', 'PURE data: extension → category, icon, viewer'],
  ['src/sock-path.js', 'a path helper: where a unix socket may live (fs and crypto handed in, nothing kept)'],
  ['src/server/hub-tmp.js', 'a path helper: the hub’s own folder under the temp folder, made and judged per call, and its age sweep run unawaited (fs handed in, nothing kept)'],
  ['src/safe-fetch.js', 'one request to a non-vendor URL with its decoding belt; nothing kept between calls'],
  ['src/egress-fence.js', 'the address verdict and one fenced request to an owner-configured address; nothing kept between calls'],
  ['src/cache-bounds.js', 'PURE: no fs, no clock, nothing at module level — the ceilings, and eviction and slab classes acting on the map or slab their CALLER owns'],
  ['src/fixture-guard.js', 'PURE: the one declaration of what a test fixture looks like'],
  ['src/client-swap-step.js', 'PURE, imports nothing: the client-swap rule (what was said, the client in force, who must act → the act) the channel accounts and the storage mounts share'],
  ['src/owner-mark.js', 'r1213: a temp folder\'s owner mark — written, read and judged per call on the folder its CALLER made (the sign-in card, the token mint); nothing kept'],
].map(([path, why]) => Object.freeze({ path, why })));
const HELPER = 'helper';
const HELPER_SET = new Set(HELPERS.map((h) => h.path));
// THE SPLIT FILES (cure r3, T1) — a file whose OWN code does the work of two (or more) owners, by the design's «split» rows
// or as a door whose inline bodies do another owner's work: booked under its OWN name, bucket `split:<short>`, outside the
// seven. `owners` in the table's order; `why` = one line of which owners and where. This list's ORDER is the order the hourly
// line prints the buckets. No owner's rule matches a split file (test-loop-census ②); a file that only CALLS another owner's
// engine is not split (its call books the engine's frame). A file the tree already cut (desktop-app-keeper → desktop-serve,
// window-targets-engine → window-targets, design-engine → design-fs) is one owner's and stays off this list.
const SPLIT_PREFIX = 'split:';
const SPLIT = Object.freeze([
  ['src/ws-handler.js', 'ws-handler', ['interface', 'conversation'], 'the page protocol (state-set, layout-sync, the desktops) AND, inline, the machine’s verbs: attach reads the transcript, input, interrupt, queue-op, permission-response, set-model / set-effort / set-goal'],
  ['server.js', 'server', ['interface', 'workspace', 'machines', 'conversation'], 'the listener, the app and the page sockets AND inline bodies of other owners: the to-dos routes (workspace; the Task Groups’ store, routes and context sync moved to src/server/task-groups-wiring.js), the port-forward and machine-mount routes (machines), the machine’s sysinfo routes, the device stream’s records parsed into the live consumers (hosts.onSessionEvents), the resize to the smallest client (conversation)'],
  ['src/agent-routes.js', 'agent-routes', ['channels', 'workspace', 'machines', 'conversation'], 'the agent’s door (prompt-context, task-context, stop-check) AND, inline, the channels verbs, the message, task, backlog and page verbs (workspace) and the jobs verbs (machines)'],
  ['src/hosts.js', 'hosts', ['machines', 'conversation'], 'the host registry, pairing and the ssh install (machines) AND the machine facts read over ssh: session discovery, the transcript mirror and its cache, the usage harvest (the machine side)'],
  ['src/agentd/client.js', 'agentd-client', ['interface', 'machines'], 'install, the token mint and the signed self-upgrade (machines) AND the device link itself: connect, the handshake, every op’s request and answer (the interface terminates every link)'],
  ['src/server/browser-keeper.js', 'browser-keeper', ['machines', 'conversation'], 'the profile registry, leases and pins (machines) AND the keeper of running browsers: spawn, adoption by pid + starttime, the /proc resource sample, the stop (the machine’s keepers child)'],
  ['src/jobs.js', 'jobs', ['machines', 'conversation'], 'the job record, schedule and approvals (machines) AND the process: the wrapper’s spawn, its pid + starttime + boot-id identity at every act, logs, the lock, the cgroup read (the machine agent)'],
  ['src/mounts.js', 'mounts', ['machines', 'conversation'], 'mount definitions, share minting and sealed credentials (machines) AND the rclone children started detached, adoption from /proc/mounts, the remount and the fusermount ladder (the machine agent)'],
  ['src/port-forward.js', 'port-forward', ['machines', 'conversation'], 'forward records and publishing (machines) AND the hub machine’s own port scan (ss, the sockets’ owners in /proc) and the orphan kill (the machine agent)'],
  ['src/server/plugin-loader.js', 'plugin-loader', ['machines', 'conversation'], 'the plugin registry, consent and tool shims (machines) AND each plugin server’s child: the fork under --permission, its restarts, its IPC (the machine’s starter)'],
  ['src/accounts.js', 'accounts', ['money', 'conversation'], 'the account catalog and its policy (money) AND the login files under data/subs and codex-subs, their merge and removal, the pool links read and swept (the machine agent — the design’s Account and Pool rows)'],
  ['src/server/home-rename.js', 'home-rename', ['interface', 'workspace', 'machines', 'conversation'], 'the boot home-rename migration (B-8033, moved out of server.js’s inline bodies): claude’s project folders re-encoded through the harness hook (the conversation’s files) AND the recorded /home/<old> paths rewritten in other owners’ stores — layouts (interface), Task Groups (workspace), mounts and machine mounts (machines), session metas (conversation)'],
  ['src/server/migrations.js', 'migrations', ['interface', 'vault', 'channels', 'money', 'workspace', 'machines'], 'the design’s own split row (each service migrates its own stores): one registry reshapes readings and the ledger, channel credentials, task groups and grants, browser profiles and desktop apps, the vault’s grants, the settings'],
].map(([path, short, owners, why]) => Object.freeze({ path, short, owners: Object.freeze(owners), why })));
const splitIdOf = (short) => `${SPLIT_PREFIX}${short}`;
const SPLIT_BY_PATH = new Map(SPLIT.map((s) => [s.path, splitIdOf(s.short)]));
const OUTSIDE = Object.freeze({ id: 'outside', words: 'outside the hub’s owned code: no owned or split frame on the stack (Node’s internals or a library alone, or shared helpers alone)' });
const NATIVE_WORDS = 'on the CPU outside JavaScript (no JavaScript frame on the stack)';
const TICK_WORDS = `a tick every ${CENSUS_EVERY_MS / 1000} s on average from the watchdog thread, classed by the main thread's kernel state first (asleep in its own loop's poll = idle, never asked); a busy tick is booked on the OWNER of the first owned frame walking outward from the innermost — a file that holds two owners' work is its own bucket (split:<short>), never one of them — passing only shared helpers, libraries and Node's internals (viaHelper = booked through a helper; outside = no owned frame; deep = a full ${FRAME_LIMIT}-frame list with no owned frame, the owner may lie beyond it) (${CC.NATIVE_NOTE})`;
// THE FOLD'S IDS, in the order of its shares: the seven owners, the split buckets (the SPLIT list's order), outside
const IDS = Object.freeze([...OWNERS.map((o) => o.id), ...SPLIT.map((s) => splitIdOf(s.short)), OUTSIDE.id]);

/** PURE: an install-relative path → its BUCKET: an owner id, `split:<short>` for a file on the SPLIT list, HELPER ('helper')
 *  for a shared helper, or null (no row: outside src/ and server.js, or a file only the page or the device agent loads that
 *  no rule names). The FIRST owner whose rule matches — the census leg proves no hub-side file matches two, and no rule
 *  matches a split file or a helper. */
function ownerOf(rel) {
  const p = String(rel || '');
  if (HELPER_SET.has(p)) return HELPER;
  const split = SPLIT_BY_PATH.get(p);
  if (split) return split;
  for (const o of OWNERS) if (o.rules.some((re) => re.test(p))) return o.id;
  return null;
}
const NATIVE_BOOK = Object.freeze({ owner: 'native', viaHelper: false, deep: false });
/** PURE: an answered ask's text (the sample's own encoding, src/loop-hold.js SAMPLE_EXPR) → where its ticks go:
 *  {owner: <an owner id> | 'split:<short>' | 'outside' | 'native', viaHelper, deep}, or null — NOT SAMPLED (a debugger's or
 *  an accessor's stand-down, frames unreadable). The walk goes OUTWARD from the innermost frame and stops at the first frame
 *  of an OWNED or a SPLIT file — a split file's frame is booked on its own bucket, never on an owner of its (cure r3, T1: a
 *  sample inside a door's own inline body is that door file's, not the interface's); it passes Node's internals, built-ins,
 *  node_modules, eval'd frames and install files with no row, and a shared helper's frame (viaHelper: the bucket was reached
 *  through ≥ 1 helper). No owned or split frame ⇒ 'outside' (deep: the sample's list was full — FRAME_LIMIT frames before
 *  the instrument's trim — so an owner may lie beyond it). */
function bookOf(text, root) {
  const r = CC.rawFramesOf(text);
  if (r.form !== 'calls' && r.form !== 'string') return null;
  const frames = LH.instrumentTrim(r.frames, root);
  if (!frames.length) return NATIVE_BOOK;
  let viaHelper = false;
  for (const f of frames) {
    if (f.evalish) continue;
    const at = CC.relOf(f.file, root);
    if (at.kind !== 'install' || CC.packageOf(at.rel)) continue;
    const o = ownerOf(at.rel);
    if (o === HELPER) { viaHelper = true; continue; }
    if (o) return { owner: o, viaHelper, deep: false };
  }
  return { owner: OUTSIDE.id, viaHelper: false, deep: r.frames.length >= FRAME_LIMIT };
}
/** PURE: THE COST'S BOUND — the census's mean interval after an ask whose own run on the main thread took `askMs`: doubled
 *  (the rate halved) when past `boundMs`, never slower than `floorMs`; null = unchanged */
function slowerAfter(everyMs, askMs, { boundMs = ASK_BOUND_MS, floorMs = CENSUS_FLOOR_MS } = {}) {
  return Number.isFinite(askMs) && askMs > boundMs && Number.isFinite(everyMs) && everyMs * 2 <= floorMs ? everyMs * 2 : null;
}
/** the counts a census starts an hour with */
const emptyTicks = () => ({ idle: 0, held: 0, stopped: 0, notSampled: 0, paused: 0 });

/** PURE: ONE take (the watchdog's {fromM, toM, everyMs, ticks, pausedBy, families, viaHelper, deep, asks, askOwnMs, askMaxMs,
 *  halved}) → {sampledTicks, busyTicks, busyShare (of the sampled), shares — in THIS order (IDS): the SEVEN owners
 *  [{family, words, ticks, share}], then one row per SPLIT bucket in the list's order [{family: 'split:<short>', short, why,
 *  ticks, share}], then outside [{family, words, ticks, share}] — each a share of the BUSY ticks; native {ticks, share of the
 *  busy}, viaHelper {ticks} and deep {ticks} (busy ticks among the booked: reached through a helper; a full list with no
 *  owned frame), idle / held / stopped {ticks, share of the sampled}, notSampled {ticks, paused, pausedBy}, cost {asks,
 *  ownMs, meanMs, maxMs, halved, dispatchMs, paidMs}, words}. The shares and native sum to 1 (busy = the owners', the split
 *  buckets' and outside's ticks + native's); an id the table does not know (a retired owner, a split file no longer on the
 *  list) is outside's. */
function censusFold(take) {
  const t = take && typeof take === 'object' ? take : {};
  const n = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
  const tk = t.ticks || {}, fam = t.families || {};
  const by = Object.fromEntries(IDS.map((id) => [id, 0]));
  for (const [k, v] of Object.entries(fam)) if (k !== 'native') by[IDS.includes(k) ? k : OUTSIDE.id] += n(v);
  const native = n(fam.native);
  const busy = IDS.reduce((s, id) => s + by[id], native);
  const idle = n(tk.idle), held = n(tk.held), stopped = n(tk.stopped);
  const sampled = busy + idle + held + stopped;
  const of = (x, total) => (total > 0 ? x / total : null);
  const shares = [
    ...OWNERS.map((o) => ({ family: o.id, words: o.words, ticks: by[o.id], share: of(by[o.id], busy) })),
    ...SPLIT.map((s) => { const id = splitIdOf(s.short); return { family: id, short: s.short, why: s.why, ticks: by[id], share: of(by[id], busy) }; }),
    { family: OUTSIDE.id, words: OUTSIDE.words, ticks: by[OUTSIDE.id], share: of(by[OUTSIDE.id], busy) },
  ];
  const asks = n(t.asks), ownMs = n(t.askOwnMs);
  return {
    fromM: Number.isFinite(t.fromM) ? t.fromM : null, toM: Number.isFinite(t.toM) ? t.toM : null, everyMs: Number.isFinite(t.everyMs) ? t.everyMs : null,
    sampledTicks: sampled, busyTicks: busy, busyShare: of(busy, sampled), shares,
    native: { ticks: native, share: of(native, busy), words: NATIVE_WORDS },
    viaHelper: { ticks: n(t.viaHelper) }, deep: { ticks: n(t.deep) },
    idle: { ticks: idle, share: of(idle, sampled) }, held: { ticks: held, share: of(held, sampled) }, stopped: { ticks: stopped, share: of(stopped, sampled) },
    notSampled: { ticks: n(tk.notSampled) + n(tk.paused), paused: n(tk.paused), pausedBy: { ...(t.pausedBy || {}) } },
    cost: { asks, ownMs, meanMs: asks ? ownMs / asks : null, maxMs: n(t.askMaxMs), halved: t.halved || null, dispatchMs: asks * DISPATCH_MS, paidMs: ownMs + asks * DISPATCH_MS },
    words: TICK_WORDS,
  };
}

module.exports = { OWNERS, HELPERS, HELPER, SPLIT, SPLIT_PREFIX, splitIdOf, OUTSIDE, IDS,NATIVE_WORDS, TICK_WORDS, FRAME_LIMIT, NATIVE_BOOK, ownerOf, bookOf, slowerAfter, emptyTicks, censusFold, CENSUS_EVERY_MS, CENSUS_FLOOR_MS, ASK_BOUND_MS, TAKE_WAIT_MS, DISPATCH_MS };

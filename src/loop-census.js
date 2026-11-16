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
 *
 * THE CENSUS — commit 1's sampler at a LOW rate over the whole hour, never a profiler: Runtime.evaluate of the one
 * constant SAMPLE_EXPR (src/loop-hold.js) from the watchdog THREAD, nothing enabled, no .cpuprofile, no file, no journal
 * line. One tick every CENSUS_EVERY_MS on average (each interval drawn between half and one and a half of it, as a
 * capture's — a fixed period phase-locks with the hub's own timers), classed EXACTLY as a capture's tick
 * (src/cpu-capture.js tickOf — the main thread's kernel state first: asleep in its own loop's poll with the beat fresh is
 * IDLE and never asked; a hold open is HELD; stopped; another ask out, a capture or a profile running is NOT SAMPLED);
 * else ONE ask, or booked on the census's own ask in flight. An answer books its ticks (bookOf) on the OWNER of the first
 * OWNED frame walking OUTWARD from the innermost — the walk passes Node's internals, built-ins, node_modules, eval'd code
 * and install files with no row (data/plugins/…), and passes a SHARED HELPER's frame counting it (`viaHelper`); it never
 * passes an owned frame. The instrument's own frames are trimmed (src/loop-hold.js instrumentTrim), and time inside a native
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
// folder of src/ whose files are all one owner's. Where a file serves two, its owner is the owner of its STATE.
const F = '^src/(?:server/|routes/|lib/)?';
const name = (w) => new RegExp(`${F}(?:${w})\\.[cm]?js$`);
const lead = (w) => new RegExp(`${F}(?:${w})(?:-[\\w.-]*)?\\.[cm]?js$`);
const but = (head, not) => new RegExp(`${F}${head}(?!(?:${not})\\.[cm]?js$)[\\w.-]+\\.[cm]?js$`);
const dir = (d) => new RegExp(`^src/(?:${d})/`);
// the families two owners share, each spelled ONCE (the owner's rule and the other's `but` read the same words)
const BROWSER_ROWS = 'profiles|kept|passkey-store|engines|builds|builds-keeper|installs|cli-install|clone|clone-run|bindings|key|takeover|takeover-request|stale|tabs|human|handback|propose|job-principal|keeper';
const BROWSER_VAULT = 'login|logins';
const QUOTA_HARNESS = 'claude-quota|codex-quota|null-quota|antigravity-usage|antigravity-wall';
const CODEX_MONEY = 'reset-helper|fork-ledger-purge';
const OWNERS = Object.freeze([
  { id: 'interface', words: 'the interface: the page protocol and its fan-out, sign-in, the page-written stores — and the hub process’s own (the listener, boot and exit, the store writer, the loop’s instrument)',
    rules: [/^server\.js$/, /^src\/agentd\/mux\.js$/,
      name('ws-handler|ws-heartbeat|ws-keepalive|session-broadcast|sync-store|op-seq|static-public|app-csp|csp-reports|frame-host|auth|clerk-auth|write-origin|tls|tls-plan|login-words|persistence|user-state-ops|editor|custom-theme-normalize|retired-settings|desktop-record|day-one|phone-doors|changelog-style|instance-url'),
      name('runtime-boot|runtime-floor|node-runtime|boot-phase|boot-trace|migrations|migration-runner|ops-routes|exit-hook|exit-settle|store-writer|store-writer-worker|store-exit-keeper|telemetry|opslog|timed-sync|fd-budget|fd-gauge|memory-census|memory-sampler|worker-memory|cpu-capture|sync-fs-witness|sync-fs-witness-worker'),
      lead('loop|incident')] },
  { id: 'vault', words: 'the vault: the key and every sealed entry, the mask and its belt, the integration credentials, web logins',
    rules: [lead('vault|secret|key-file|sealed-json|totp|integrations?|app-secrets|cluster-presets|preset-layers|ssh-key|credential-words|agent-output-belt|webauthn-sign|login-hold-words'),
      name(`browser-(?:${BROWSER_VAULT})`)] },
  { id: 'channels', words: 'the channels: mail and chat sign-ins, the index and message logs, the scheduler, vendor calls, the outbox, webhooks, the OAuth landing',
    rules: [dir('channels'), lead('channels'), but('channel-', 'groups(?:-[\\w.-]*)?'),
      lead('webhook|gmail-sync|mail-frame|msg-acl|oauth-loopback|oauth-doors|consent-road|roster-pass|api-call-words'), name('api-call-words\\.generated')] },
  { id: 'money', words: 'accounts and money: the pool, usage and readings, the spend guard, auto-resume, the delivery ladder (stash, retry, wakes)',
    rules: [name('accounts|account-(?:pool-auto|usage-routes|models)'), but('usage-', 'walker'),
      lead('quota|spend|auto-resume|auto-cli|reset-credit|reading|ledger|stash|provider|model-providers|model-family|wait|park-step|record-lateness|slot-transitions|sealed-orders|window-stamp|weekly-lanes-unfold|plan-names|claude-plan-catalog|login-expiry|cost-segments|catalog-pricing|rate-limit-capture|otel-truth|stream-wall|queued-wakes|conversation-deliver|refresh-note|backend-caps|fixture-ledger-purge|agy-turn-usage|cli-usage-door'),
      name(`codex-(?:${CODEX_MONEY})|oat-(?:file-sync|identity|identity-model|shape-routes)`), new RegExp(`^src/harnesses/(?:${QUOTA_HARNESS})\\.js$`)] },
  { id: 'workspace', words: 'the workspace: tasks, agent groups, For you, grants, automation, artifact rows, the design and doc registries, the decision engine, voice, feedback',
    rules: [lead('task|backlog-select|groups-engine|channel-groups|group-card|foryou|inbox|user-todos|main-asks?|helper-asks?|attention-model|grant-model|grants|ask-grant|automation|artifacts|artifact-registry|doc|published-pages|decision|rule-learning|text-model-client|voice|dropline|feedback|conversation-index|conversation-spec|search-index|search-model|records?-clear|assistant-note|notification-senders|session-status'),
      name('design'), but('design-', 'fs')] },
  { id: 'machines', words: 'the machines registry: hosts and pairing, browser records and leases, jobs records, mounts, desktop apps and windows, plugins, exits',
    rules: [dir('app-kinds|mount-providers|plugins|browser-backends'), /^src\/agentd\/client\.js$/,
      lead('hosts|host-tokens|pairing-token|dial-pairing|dial-health|dial-facts|agentd-signature|device|engine-kernel|engine-distribution|apps|install-slot|installs|ffmpeg-install|mic-install|machine-needs|machine-mounts|mounts?|path-mounts|vfs-cache-place|rclone-obscure|storage-path|storage-facts|fs-canary|port-forward|plugins?|relay-token|tailnet|tailscale-dns|jobs?|hub-act|desktop-apps|desktop-app-keeper|desktop-browser-app|desktop-handover|desktop-machines-cache|encoded-command|modifier-map'),
      name('app-card|app-manifest|app-recipes|app-system|window-(?:reach|request|targets|targets-engine|desktop)|exit-(?:proxy|reach|routes|shell)'),
      name(`browser|browser-(?:${BROWSER_ROWS})`)] },
  { id: 'conversation', words: 'the conversation, the machine side: create and spawn, the stream parse and its side effects, the hook’s door, files, the keepers’ processes, machine facts',
    rules: [dir('spawn|adapters|agent-routes|server/stdout'), new RegExp(`^src/harnesses/(?!(?:${QUOTA_HARNESS})\\.js$)[\\w.-]+\\.js$`),
      but('browser-', `${BROWSER_ROWS}|${BROWSER_VAULT}`), but('stream-', 'wall'), but('cli-', 'usage-door'), but('agy-', 'turn-usage'), but('codex-', CODEX_MONEY),
      lead('ws-create|agent-routes|agent-env|agent-cli|agent-tool|hooks-late|hook-root-watch|seen-marks|turn|message|acp|opencode|normalizers|transcript|user-input|user-channel|permission|bypass-auto-allow|queue|goal-sync|compaction-watch|bridge|dial-session-bridge|discovery-facts|sysinfo|machine-probes|ctx-sync|writer-sweep|remote-shell|remote-fs|webdav|files|chat-attachments|dir-slice|cdp|vnc|rfb-signin|novnc-patch|pty-duck|wrapper-files|kept-copies|writes-lost|local-index|local-oracles|resume|rewind-ops|workflow|new-session-spec|path-candidates|boot-restore|keeper-limits|runaway-guard|memory-pressure|office-open|remoteapp|proc|safe-fs|git-identity|harness|owner-facts|tray-words|server-root|safety-stop|record-shape|search-card|collab-row|text-window|worker-dispatch|dispatch-model|peer-messaging|otel-ingest|signin-model|claude-signin|claude-subscription-login|claude-lock-capture|claude-model-catalog|claude-oat|oat-mint|backend-status-route|stop-nudge|model-ask|model-echo|egress-proxy|machine-desktop-model|machine-window|machine-app|mic-model|sound-model|installed-apps|app-serve|app-system-serve|app-squashfs|app-witness'),
      name('usage-walker|design-fs|window-live-wiring|exit-call|exit-facts|unexpected-exit|account-material|login-shell|login-state|conversation-ops|sessions|session-(?:brain|stdout|store|schema)|desktop-(?:access|backends|display|fit|pin|serve|stream|viewers|webrtc)')] },
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
  ['src/safe-fetch.js', 'one request to a non-vendor URL with its decoding belt; nothing kept between calls'],
  ['src/egress-fence.js', 'the address verdict and one fenced request to an owner-configured address; nothing kept between calls'],
  ['src/peer-text.js', 'PURE: the one belt on peer text toward an agent, run at every door by the door’s owner'],
  ['src/cache-bounds.js', 'PURE: no fs, no clock, nothing at module level — the ceilings, and eviction and slab classes acting on the map or slab their CALLER owns'],
  ['src/fixture-guard.js', 'PURE: the one declaration of what a test fixture looks like'],
].map(([path, why]) => Object.freeze({ path, why })));
const HELPER = 'helper';
const HELPER_SET = new Set(HELPERS.map((h) => h.path));
const OUTSIDE = Object.freeze({ id: 'outside', words: 'outside the hub’s owned code: no owned frame on the stack (Node’s internals or a library alone, or shared helpers alone)' });
const NATIVE_WORDS = 'on the CPU outside JavaScript (no JavaScript frame on the stack)';
const TICK_WORDS = `a tick every ${CENSUS_EVERY_MS / 1000} s on average from the watchdog thread, classed by the main thread's kernel state first (asleep in its own loop's poll = idle, never asked); a busy tick is booked on the OWNER of the first owned frame walking outward from the innermost, passing only shared helpers, libraries and Node's internals (viaHelper = booked on an owner through a helper; outside = no owned frame; deep = a full ${FRAME_LIMIT}-frame list with no owned frame, the owner may lie beyond it) (${CC.NATIVE_NOTE})`;
const IDS = Object.freeze([...OWNERS.map((o) => o.id), OUTSIDE.id]);

/** PURE: an install-relative path → its owner id, HELPER ('helper') for a shared helper, or null (no row: outside src/ and
 *  server.js, or a file only the page or the device agent loads that no rule names). The FIRST owner whose rule matches —
 *  the census leg proves no hub-side file matches two. */
function ownerOf(rel) {
  const p = String(rel || '');
  if (HELPER_SET.has(p)) return HELPER;
  for (const o of OWNERS) if (o.rules.some((re) => re.test(p))) return o.id;
  return null;
}
const NATIVE_BOOK = Object.freeze({ owner: 'native', viaHelper: false, deep: false });
/** PURE: an answered ask's text (the sample's own encoding, src/loop-hold.js SAMPLE_EXPR) → where its ticks go:
 *  {owner: <an owner id> | 'outside' | 'native', viaHelper, deep}, or null — NOT SAMPLED (a debugger's or an accessor's
 *  stand-down, frames unreadable). The walk goes OUTWARD from the innermost frame and stops at the first OWNED one; it
 *  passes Node's internals, built-ins, node_modules, eval'd frames and install files with no row, and a shared helper's
 *  frame (viaHelper: the owner was reached through ≥ 1 helper). No owned frame ⇒ 'outside' (deep: the sample's list was
 *  full — FRAME_LIMIT frames before the instrument's trim — so an owner may lie beyond it). */
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
 *  halved}) → {sampledTicks, busyTicks, busyShare (of the sampled), shares [{family, words, ticks, share}] — the SEVEN owners
 *  and outside, each a share of the BUSY ticks, larger first (ties in the table's order), native {ticks, share of the busy},
 *  viaHelper {ticks} and deep {ticks} (busy ticks among the booked: reached through a helper; a full list with no owned
 *  frame), idle / held / stopped {ticks, share of the sampled}, notSampled {ticks, paused, pausedBy}, cost {asks, ownMs,
 *  meanMs, maxMs, halved, dispatchMs, paidMs}, words}. The shares and native sum to 1 (busy = the owners' and outside's
 *  ticks + native's); an id the table does not know is outside's. */
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
  const order = new Map(IDS.map((id, i) => [id, i]));
  const shares = IDS.map((id) => ({ family: id, words: id === OUTSIDE.id ? OUTSIDE.words : OWNERS[order.get(id)].words, ticks: by[id], share: of(by[id], busy) }))
    .sort((a, b) => b.ticks - a.ticks || order.get(a.family) - order.get(b.family));
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

module.exports = { OWNERS, HELPERS, HELPER, OUTSIDE, IDS, NATIVE_WORDS, TICK_WORDS, FRAME_LIMIT, NATIVE_BOOK, ownerOf, bookOf, slowerAfter, emptyTicks, censusFold, CENSUS_EVERY_MS, CENSUS_FLOOR_MS, ASK_BOUND_MS, TAKE_WAIT_MS, DISPATCH_MS };

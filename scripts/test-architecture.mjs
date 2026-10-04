#!/usr/bin/env node
// ARCHITECTURE CONFORMANCE (2.323.0, owner directive "更强有力的手段保证分离"):
// the three-tier separation is enforced STRUCTURALLY, not by documentation —
// the vendor-whitelist mechanic generalized to the whole dependency graph.
// Any new cross-tier require FAILS this suite until it is DELIBERATELY added
// to an allowlist below with a reason. Documentation rots; a red test does not.
//
// TIERS (docs/design-three-tier.md):
//   DEVICE     src/agentd/agentd.js + mux/reexec/ws-min — runs on EVERY machine
//   SHARED     fact modules the daemon bundles — one implementation per concern
//   PURE       decision modules — no I/O AT ALL (safe in any process, incl. browser)
//   ORCH       server.js, hosts.js, ws-handler.js, routes/* — this instance only
//   CLIENT     src/lib/** — the browser
//
// RULES (direction of knowledge): DEVICE/SHARED/PURE know nothing of ORCH or
// CLIENT. ORCH may use everything below it. CLIENT may use only PURE (via the
// esbuild bundle) — never ORCH internals.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GIT_REDIRECTORS, gitEnvFrom } from './git-env.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

const rel = (p) => path.relative(REPO, p).replace(/\\/g, '/');
const read = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf-8'); } catch { return ''; } };
function requiresOf(f) {
  const s = read(f);
  const out = new Set();
  for (const m of s.matchAll(/require\(['"]([^'"]+)['"]\)/g)) out.add(m[1]);
  for (const m of s.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/g)) out.add(m[1]);
  for (const m of s.matchAll(/(?:^|\n)\s*export\s[^;]*?from\s+['"]([^'"]+)['"]/g)) out.add(m[1]); // re-exports are imports too
  return [...out];
}
const resolveRel = (from, spec) => {
  if (!spec.startsWith('.')) return null; // builtin or package
  let p = path.normalize(path.join(path.dirname(from), spec)).replace(/\\/g, '/');
  if (!p.endsWith('.js') && fs.existsSync(path.join(REPO, p + '.js'))) p += '.js';
  return p;
};

// ── Tier membership (path-based; NEW files inherit their directory's tier) ──
const PURE = new Set(['src/timed-sync.js' /* design 011 lane 1 (store-timing): the store-write clock — performance.now + counters, imports nothing; §72 */, 'src/channel-search.js' /* design 010 (B-c9be): the vendor snippet's ONE reader, the merge, the full-search refusal table, the dialog's coverage / status words — the store, the engine, the adapters and the dialog share them; imports only channel-record (PURE → PURE) */, 'src/channel-focus.js' /* design 008 (B-3cf8): the first screen's predicate (statusTag) + the first read's candidate test + the page rules — the engine's first read and the panel's keyed store share them; imports nothing */, 'src/app-recipes.js' /* design 009: the recipes table — imports nothing */, 'src/app-card.js' /* design 009: THE one card of an app install — its view + the digest of what it showed, shared by the engine and the client; imports nothing */, 'src/record-lateness.js' /* lane-hot-switch: a late record is not a live fact — the stream clock + the look-ahead, imports nothing */, 'src/hidden-chars.js', 'src/assistant-note.js' /* B-40f8: text addressed to the assistant — the note rule + THE turn preview, server builders and client alike; imports nothing */, 'src/window-desktop.js', 'src/plugin-manifest.js', 'src/account-pool-auto.js', 'src/model-family.js', 'src/task-color-seq.js', 'src/ssh-key-format.js', 'src/session-schema.js', 'src/otel-truth.js', 'src/msg-acl.js', 'src/backend-caps.js',
  // AGENT BROWSER (design-agent-browser-v2 §3.6): the identity/spawn-env decisions, the
  // registry + lease model and the keeper's verdicts — imports nothing (P0/P1); and the ONE
  // constants home every process keeper counts and bounds by (src/keeper-limits.js)
  'src/browser-profiles.js', 'src/keeper-limits.js',
  'src/browser-job-principal.js', // lane jobs-browser: a Background Work job browses AS its owner conversation (child handle, the owner's admission + pin, route lists, the release rule); imports only browser-profiles
  // BROWSER TAKEOVER (design-browser-takeover §3): the ONE browser CLI's verb table — the router,
  // the child env and (r3) the config rule; imports nothing, shipped beside the CLI to hosts
  'src/browser-verbs.js',
  // AGENT BROWSER P4 second half (design §7.4/§7.5/§7.6): the live backend SWITCH and the
  // key-consumer half as DECISIONS — version ladder, seats in three states, the six rows'
  // vendor env / launch args / derived test host, site hints, the blocked claim, the gate
  'src/browser-switch.js',
  // AGENT BROWSER P5 (design §4.5 / §6.4 / §7.1 / §8 step 3, D7 / D8 / D35): the action-trace
  // ENTRY (what is kept, what is never — a fill's value), the after-frame pick, the retention
  // PLAN, the recording gate, the sweep SCOPE (= exactly the ownsDir rows) and the forget /
  // orphan verdicts — imports only the sibling PURE registry model
  'src/browser-trace.js',
  // AGENT BROWSER P6 (design §6.2 / §6.5 / D6): the CDP MEDIATION RULES — target scoping, the
  // session gate, browser_paused, the whole-browser acts, the scope's growth/shrinkage, the
  // per-session url/env composition — imports only the sibling PURE census (the proxy does the I/O)
  'src/browser-mediation.js',
  'src/cdp-census.js', // verify S2 r4: ONE row per method of the installed Chrome's protocol, classed — the paused fence reads the class; imports nothing
  'src/browser-windows.js', // lane browser-windows (2026-10-01): a window per holder — the measured placement (WINDOWS_PROOF), the window mates, the watch mode, the cap setting; imports nothing
  'src/browser-interrupt.js', // the owner's ruling (2026-09-27): the takeover's words (browser_interrupted), what was in flight off the trace, the takeover→handback cycle; imports nothing
  'src/browser-sessions.js', // browser SESSIONS (2026-09-27): markers, pairing, the chat cards of one conversation, the replay model; imports nothing
  'src/browser-recording-retention.js', // the video recordings' own 7 d / 200 MB bound (the trace became size-only, 2026-09-27); imports nothing
  'src/retired-settings.js', // B-df40 part 1 (lane settings-prune): THE retired settings-key list + the pure strip the boot migration archives through; the schema re-exports it (44d) — imports nothing
  'src/browser-recipes.js', // lane browser-recipes (2026-10-02): the recipe pointer + the no-display sentence the status route, the first verb's refusal and the tools intro share; imports only browser-display (PURE → PURE)
  'src/browser-display.js', // lane headless-fallback (2026-09-28): headed is a preference, the display is a fact — the display verdict + the launch plan + the words; imports nothing (the keeper, the daemon's browser-serve and the client bundle share it)
  'src/search-card.js', // web-search card renderer + title query + twin key — shared server (codex normalizer) + browser (chat-renderers)
  'src/path-linkify.js', // where a chat file path ENDS (CJK punctuation) — shared browser (chat-renderers) + node tests; imports nothing
  'src/file-disposition.js', // lane raw-filename: THE one Content-Disposition that names a file (both RFC 6266 forms) — files.js + remote-fs.js; imports nothing
  'src/collab-row.js', // codex multi-agent collab row labels/HTML — esc/t/icons injected, so the XSS rule is unit-provable
  'src/model-echo.js', // the CLI's `Set model to` echo — ONE parser for the status bar, the command-card label and the server's model-lock repin
  'src/design-model.js', // the Design window's canvas model (lane design-core): the manifest, the layout, one artboard's verdict, the ONE bundler, the comment line, the published page's state block — imports nothing (the hub requires it, the window bundles it)
  'src/design-tokens.js', // lane design-systems-home: a design system's token check — tokens.css against an artboard's literal colours / font sizes (warnings); requires only design-model.js (the hub's alone: the viewer bundle stays budgeted)
  'src/server-root.js', // lane hook-root-guard: rootVerdict — is this server the owner's instance (checkout) or a worktree / tmp / override root that must never write the owner's CLI config; imports nothing
  'src/changelog-style.js', // the user changelog's style rules (lint + parity of CHANGELOG.md / .zh / .ja) — test-changelog-style runs them over the three files; imports nothing
  'src/preset-layers.js', // lane cluster-presets: the company presets' per-key merge (cluster < release override), the ONE parser of both preset JSON shapes, the value-free diff + the Integrations line's words — imports only the PURE registry (a row's label); the server reader and the bundle share it
  // login-session lifetime (2026-09-07): the claude harness descriptor reads the
  // credential file, this decides what the numbers MEAN; pool decisions + accounts
  // + the watcher all consume it, so it must stay dependency-free
  'src/login-expiry.js',
  // THE RESUME LADDER (B-6b6d): "the conversation's own value wins on a resume,
  // the instance default is a NEW-session default" — ONE decision for the spawn
  // (ws-create) and for what the client is allowed to send (session-lifecycle).
  'src/resume-continuity.js',
  // WHOSE NUMBERS ARE THESE (inc-mts8a8mr-ulmm): the lag shadow + the window
  // identity guard. PURE because the shipped statusline tool carries a VERBATIM
  // mirror of its core block (a checkout-less host cannot require src/), and a
  // rule with an import is a rule that cannot be mirrored.
  'src/reading-lag.js',
  // THE SPEND CEILING (design-account-hardening §4.4c / P9): the decision every
  // producer of a turn nobody typed passes through, plus `overageState` — the
  // ONE reader of the overage record, asked by the authorizer, by the pool's
  // voluntary-target rule and by BOTH quota panels. PURE so the browser can
  // bundle it and the rule is unit-provable in one place.
  'src/spend-authorizer.js',
  'src/rewind-ops.js', // claude tombstone / codex thread_rolled_back → ONE 'rewound' meta op; index-stable marking, no I/O
  // THE FRESH-WINDOW EDGE (2026-09-08): does a normalized quota reading say the
  // wall a conversation is waiting on is gone? PURE because both producers ask
  // it (claude rate_limit_event, codex rate_limits_updated) and because the
  // answer AUTHORISES A BILLED TURN — that decision must be unit-testable
  // without a server.
  'src/auto-resume-signal.js',
  'src/record-clear.js', // "Clear content…" (2026-09-28): the five record kinds, which text fields a clear replaces, WHO may clear (owner any · an agent its own session's · a job token never), the group log's replacement-record fold — the stores' doors, the routes and the client dialog ask ONE definition
  'src/inbox-reply.js', // a reply to a For-you item (design-user-inbox-reply D1): the quote block, its parser, the ONE availability verdict — the route and the panel ask the same rule (lane S1 verify r3: its card_item rung is a lookup into helper-ask.js's table)
  'src/helper-ask.js', // lane S1: a helper's permission ask — the record, the Agent call, the chip / card / inbox words, and (verify r3) THE ask's transition table every consumer looks up
  'src/permission-outcome.js', // lane S1 verify r5: the CENSUS of the CLI's own permission-outcome sentences — the one reader of a tool_result's word (a main card and a helper's ask); unknown is never allowed
  'src/safety-stop.js', // lane classifier-stop-card: the CENSUS of the CLI's own safety-stop sentences — the claude normalizer's one reader of a stop (the notice + its model-only nudge → ONE card)
  'src/turn-state.js', // authoritative turn state: the live consumer and the attach reconciliation must decide identically
  'src/opencode-remote.js', // S9 remainder: the OpenCode-serve OP TABLE + runOpencodeOp — one definition the local rung, the agentd op and the shipped ssh script all obey
  'src/permission-rules.js', // READ-ONLY permission-rule model + DOM-free tree renderer (owner ruling 10) — shared server (readers) + browser (the view)
  'src/local-oracles.js', // the human-triggered zero-network CLI oracle registry + its measured proofs and REJECTED candidates (ruling 6) — server runs them, the menu mirrors them
  // THE TYPED QUOTA MODEL (B-9213/B-8b12): what a LIMIT SET is, which limit
  // governs a model, and whether a window has started. Three consumers need the
  // identical rules and only one has a checkout — the orchestrator's write path
  // + pool, the browser bundle's three quota panels, and (like reading-lag) the
  // shipped statusline tool. A rule with an import is a rule that cannot be
  // mirrored, and a second spelling of "does this bucket count" is the twin
  // class this file exists to fail.
  'src/quota-model.js',
  // CHANNELS v2 (docs/design-communication-panel.zh.md §2). Two PURE modules:
  //   channel-record — the ONE normalized message shape every adapter produces
  //     (and the frame-marker neutering an external body owes every consumer)
  //   channel-caps   — the ONE place that answers "does this control exist"
  //     (`offers`) and "which lane is carrying this row" (`laneState` /
  //     `scanState`). A declaration is an upper bound and a resolution may
  //     only narrow; both the panel and the ingest engine ask THESE, never
  //     `caps.receive`, which is why they must be importable from the browser
  //     bundle and from a node suite with no server at all.
  'src/channel-record.js', 'src/channel-caps.js',
  //   peer-text — THE belt on peer text toward an agent (lane peer-census, 2026-09-29): bound → the hidden
  //     characters folded → the frame rule per line and per inline piece, composed ONCE over channel-record's
  //     frame rule and hidden-chars' set (PURE → PURE); every census row of test-peer-text-census that claims the
  //     rule calls it (channel-filter, channel-groups, inbox-reply, job-model, agent-routes, channels-engine).
  'src/peer-text.js',
  //   channel-filter — the rule matcher + the honest estimator + the
  //     assignment model (its two authority caps, the round-robin, the
  //     pacing verdict) + the §7.5 renderer an agent is handed. Imports only
  //     channel-record (PURE → PURE) for the frame neutering, so the whole
  //     money-adjacent decision chain after `store.append` is testable with
  //     no server (design §6.1), and the editor bundles it for its rule kinds.
  'src/channel-filter.js',
  //   channel-policy — the outbox STATE MACHINE (every allowed transition names
  //     its actor; `unknown` leaves only through reconcile), `decideOutbound`
  //     (guards stack on the channel policy and only tighten it; fail closed
  //     on an unknown policy / an unparseable guard; off-hours needs a zone or
  //     is OFF) and the RECEIPT with its three identity fields (design §9).
  //     Imports only channel-record (PURE → PURE) for the frame neutering.
  //   channel-acl — AgentReach (design §8): hidden < requestable < visible,
  //     MAX over grants, widen-only, one row per (principal, scope, origin),
  //     the uniform not-found. Imports only msg-acl (PURE → PURE) for the
  //     ladder shape + the ONE crosswalk the built-in Agents adapter uses.
  'src/channel-policy.js', 'src/channel-acl.js',
  //   channel-drain — THE DRAIN'S SCHEDULING DECISION (lane R2 verify r9): the
  //     refresh / drain step function over a snapshot (`next` names the one next
  //     action, `apply` returns the next snapshot) — every "what next, who is
  //     answered, when does the pass end" of the channels engine, which only
  //     drives it. Imports nothing, reads no clock: seven rounds of an
  //     async-interleaved imperative scheduler each grew an ordering bug; a pure
  //     step function is pinned by a seeded invariant walk (test-channel-drain).
  'src/channel-drain.js',
  //   channel-blocks — THE RENDER LAYER'S RUNGS (design §25, 2026-09-27): raw →
  //     the typed block tree (the generic rung, the mail rung, the Lark rung,
  //     the stored-record rung, cleanSubject, the preview). The adapters run it
  //     at ingest, the engine at read time for a stored record, the browser
  //     bundle for the fallback — one definition. Imports only channel-record
  //     (PURE → PURE), where the block SCHEMA lives beside the record.
  'src/channel-blocks.js',
  //   channel-thread + channel-reactions (lane channel-threads, 2026-09-28): a message's PLACE (what it answers,
  //     which thread, the thread's root, counts, the pane mode, the agent's words) and a message's REACTIONS
  //     (the fold of the side log, the vocabulary rule, the words — never a reactor's name to an agent). Both
  //     import only channel-record (PURE → PURE); the window, the pane, the engine and the suites share them.
  'src/channel-thread.js', 'src/channel-reactions.js',
  //   channel-facts (lane message-facts, B-f066): a message's FACTS — the kinds' words, the fold, the summary / details /
  //     chips, the agent's line; imports only channel-record (PURE → PURE), where the facts SCHEMA lives beside the record
  'src/channel-facts.js',
  // INTEGRATIONS & KEYS (docs/design-communication-panel.zh.md §14.2, P0b): the
  // ONE table of integration rows — fields, cluster env names, setup blocks
  // (Lark's callback URL is defined HERE and only here), test declarations,
  // consumers — plus the PURE precedence rule user > cluster > none and the
  // masking rule. The browser renders the declarations; the server store is the
  // only thing that ever sees a value.
  'src/integration-registry.js',
  // THE SPAWN-ENV SANITIZER (2026-09-14): one rule for the orchestrator's agentEnv() AND
  // the daemon's spawnEnv()/its own birth — the daemon is a second holder of the server
  // env, so the filter has to run in both processes and the daemon bundles it
  'src/agent-env.js',
  // DESKTOP APPS (docs/design-desktop-apps §2, 2026-09-13): the ONE constants home every
  // process keeper bounds by (opencode-serve reads it too) + the registry/ladder/state-machine
  // model — decisions only, the machine facts are src/desktop-display.js (SHARED)
  'src/keeper-limits.js', 'src/desktop-apps.js',
  // OPEN WITH LIBREOFFICE (docs/design-desktop-apps §7.9, the owner's ruling 2026-09-27 ②): the office table, the
  // open-with verdict (the file rule, THE MACHINE RULE, the app), the argv and the closed install set — imports
  // nothing; the machine keeper, the routes, the machine facts, the daemon bundle and the browser bundle share it
  'src/office-open.js',
  // P8-2 x5 (docs/design-desktop-apps §7 P8-2): ONE active viewer per app window — the election, the
  // active/blocked/watch rule with the agent lease, the broadcast shape; bundled into the window too
  'src/desktop-viewers.js',
  // DESKTOP LANE E (docs/design-desktop-apps-seamless §3.6, 2026-09-25): WHO may address a window (hidden by
  // default, sessions + Task Groups, one row per principal, the opener's own row), the share MODE table
  // (auto | tree | pixels) and the pixel road's plan — imports nothing; engine, routes, request producer + bundle
  'src/window-reach.js',
  // HARNESS SETTINGS (docs/design-harness-settings.zh.md §2, 2026-09-20): the per-harness
  // DECLARED tables + validator + coerce + the plan builder — imports nothing, bundled into the
  // browser (settings-schema derives the harness sections), required by the server and the daemon
  'src/harness-settings.js',
  // CHANNEL SETTINGS (B-df40 part 3, design desk settings-cleanup §2 P3): the per-vendor budget / pace tables — the
  // harness precedent for channel adapters; imports nothing, bundled (settings-schema derives the "Per vendor" rows),
  // required by the adapters (caps spread budgetOf / paceOf), the registry (undeclared keys refused) and the engine
  'src/channel-settings.js',
  // THE node-pty DUCK's listener SET (B-ae4b): daemonPtyShim, the R6 pipe duck and the OpenCode
  // serve terminal share it so setupSessionPty's liveness stamp is never replaced by the consumer
  'src/pty-duck.js',
  // A WORKFLOW RUN DIR's view (2026-09-26): labels/phases from journal + meta files, liveness from
  // mtimes, the stalled sentence — the route builds its view with it and the window + the chat
  // card word a stalled run with it (bundled), so it may import nothing
  // LANE-PAIRING (B-7007, 2026-09-28): the dial's facts — the address list, the custom-address verdict, the
  // daemon's failure classifier, the header reader, the dial-status reducer, THE row state — bundled into the daemon
  // AND the browser, so it imports nothing; and WHO MAY USE A MACHINE AS AN EXIT (two lists, the verdict, the stamp,
  // the ask) — imports only window-reach's principal spelling (PURE → PURE), bundled into the exit dialog. (Listed
  // BEFORE workflow-disk: test-workflow-disk pins that module as the list's last entry.)
  'src/dial-facts.js', 'src/exit-reach.js',
  // LANE-EXIT-RUN-OUTPUT (2026-10-01): THE SHELL IS THE DEVICE'S FACT — the shell plan per platform (cmd.exe / sh), the
  // spawn-failure judge and its one wording; imports nothing; the daemon bundles it (it runs where the command runs),
  // exit-reach composes its words, the row / card words in the bundle read its platform labels
  'src/exit-shell.js',
  // verify r1 F1 (2026-10-01): THE SECRET SHAPES a stored command head never keeps — imports only browser-trace's
  // CREDENTIAL_WORDS (PURE); exit-reach's outputHeads calls it once; the bundle carries it with exit-reach
  'src/secret-shapes.js',
  // design 011 lane 3 (the usage index SHADOW): what a ledger row becomes in the index, the shard-mark verdict, the ONE
  // grouped aggregate pass, its fold, the comparison of two answers — imports nothing (the worker and the owner ask it)
  'src/usage-index-model.js',
  'src/workflow-disk.js']);
const SHARED = new Set(['src/discovery-facts.js', 'src/sysinfo.js', 'src/machine-probes.js', 'src/usage-walker.js',
  'src/transcript-service.js', 'src/ctx-sync.js', 'src/writer-sweep.js', 'src/remote-shell.js', 'src/account-material.js',
  // THE agent-CLI process identity, one rule in two spellings (B-3185 r3): the JS twin
  // (discovery-facts, so the daemon bundles it) beside the shell text the sweep and the
  // ssh discovery CO leg embed verbatim. node builtins only.
  'src/cli-identity.js',
  // AGENT BROWSER machine FACTS (design-agent-browser-v2 §3.6 row 2): the installed-version
  // probe (P0) + a recorded daemon's identity/usage and the four CLI calls a profile
  // browser's lifecycle needs (P1) — node builtins + the PURE model + cli-identity
  'src/browser-facts.js',
  // AGENT BROWSER P4 (design §3.6 row 3 / §7.3): the `browser-serve` op table + runner — start /
  // status / stop / cdp-url / version of a PROFILE browser where it runs; the daemon bundles it
  // and the hub runs it in-process for device #0 (fs/os/path + the PURE model + browser-facts)
  'src/browser-serve.js',
  // THE ONE usage-cache write path (quota-model-v2, 2.369.86): fs/path + the PURE model +
  // lazily the harness parsers; the daemon bundles it, so it may never reach up into ORCH.
  // Listed here so a cross-tier edge fails on the classification rule itself, not only
  // transitively via the daemon-bundle marker check (round-6 verifier).
  'src/usage-cache-write.js',
  'src/session-store.js', 'src/codex-session-store.js', 'src/normalizers.js', 'src/message-manager.js',
  'src/codex-message-manager.js', 'src/adapters/base.js', 'src/adapters/claude-code.js', 'src/adapters/codex.js',
  'src/adapters/shell.js', 'src/adapters/index.js', 'src/usage-estimator.js', 'src/usage-anchors.js', 'src/safe-fs.js',
  'src/transcript-worker.js', 'src/ssh-key.js', 'src/migration-runner.js', 'src/peer-messaging.js',
  // rate-limit-capture is fs/path-only by design ("so the device daemon can bundle it") — SHARED, not ORCH
  'src/rate-limit-capture.js',
  // harness descriptors (docs/design-harness-plugins.md §2.2): declarations + pure hooks over SHARED parsers;
  // the daemon may bundle them (S5 kept the stream CONSUMERS in ORCH under src/server/stdout/ — descriptors only NAME the protocol) — they must never reach up into ORCH
  'src/harnesses/index.js', 'src/harnesses/claude.js', 'src/harnesses/codex.js', 'src/harnesses/shell.js',
  'src/harnesses/claude-quota.js', 'src/harnesses/codex-quota.js', 'src/harnesses/null-quota.js',
  // ACP v1 harness (S8): generic descriptor factory + first agent, adapter, normalizer (+ store reader)
  'src/harnesses/acp.js', 'src/harnesses/opencode.js', 'src/adapters/acp.js', 'src/acp-message-manager.js',
  // codex 0.153 thread/read fallback (B-21e4 item 5): pure Thread→records mapper + one bounded app-server read; node builtins only
  'src/codex-thread-read.js',
  // OpenCode serve-mode store facts (S9): 127.0.0.1 client + locator/keeper + 'acp-events' synthesis — facts about a machine
  'src/opencode-serve.js',
  // S9 remainder (B-eac2): the LIVE lane that replaced the 10s list poll —
  // the serve's SSE stream + an fs.watch on the sqlite store (the only lane
  // that sees another opencode process). Node builtins only; the daemon
  // bundles it with opencode-serve.
  'src/opencode-events.js',
  // THE channel store (docs/design-communication-panel.zh.md §5): fs+path only.
  // It knows how bytes are laid out under data/channels/ and nothing about
  // adapters, ACLs, policy or money — and it deliberately exposes no
  // "write the whole index back" call, because the serialized owner in
  // src/server/channels-engine.js is the index's only writer (§5.1).
  'src/channel-store.js',
  // THE at-rest encryption primitive (design §14.7, decision 24): fs + path +
  // crypto only. One primitive, N key files — mounts' `data/.mounts-key`, the
  // integrations store's, the channels token store's — and a key is created on
  // ENOENT only; every other errno is typed.
  'src/secret-box.js',
  // THE OAuth consent-flow machine, dual-mode (design §12.4, P1): node http +
  // crypto + the PURE registry (for the ONE Lark callback definition). It knows
  // no vendor — adapters hand it a consent-URL builder and an exchange — so it
  // may never reach up into ORCH.
  'src/oauth-loopback.js',
  // desktop-app machine FACTS (design-desktop-apps §2 row 2): binaries on PATH, -displayfd X
  // allocation, the Xauthority writer, the RFB banner read-probe, window enumeration (P9 reuses
  // it), the xpra version probe; hostId is a parameter — node builtins + cli-identity only
  'src/desktop-display.js',
  // DESKTOP APPS LANE C1 (design-desktop-apps-seamless §3.5): THE MACHINE HALF of the desktop-app keeper —
  // bring-up, part identity, the marker census, teardown, the fit belt, the resource sample, the record file —
  // + the `desktop-serve` op table and runner; the daemon bundles it and the hub keeper runs it in-process for
  // device #0 (fs/os/path + the PURE model + desktop-display). The policy stays in src/server/desktop-app-keeper.js
  'src/desktop-serve.js',
  // WINDOW TARGETS (design-agent-browser-v2 §4.9, P9 first half): the AT-SPI snapshot / @ref
  // minting / input-backend probe ladder / the acts — node builtins + desktop-display; the
  // traversal itself is a bounded SUBPROCESS (src/window-targets-helper.py), never in-process
  'src/window-targets.js',
  // THE SHARED CLI-CONFIG APPLIER (design-harness-settings §6): fs/path/os only — the CAS JSON
  // writer, the comment-preserving TOML setter, applyConfigPlan/readConfigPlan, the receipt codec.
  // Its FILE TEXT is embedded into the shipped remote helper, so it may never reach up into ORCH.
  'src/harness-config.js',
  // LANE-PAIRING ④ (B-7007): WHERE A UNIX SOCKET MAY LIVE — the daemon's rung ladder, the ownership verdict, the
  // witness reader; node builtins only (crypto; fs by injection) — the daemon, its --stdio bridge and the hub's
  // local transport read the ONE rule
  'src/sock-path.js',
  // lane-pairing verify-r3: THE ONE DOOR of a pairing token (mint / hash / constant-time compare) — node crypto only;
  // the hub's gate + minter and the device's hello share it (the daemon bundles it)
  'src/pairing-token.js']);
const DEVICE = new Set(['src/agentd/agentd.js', 'src/agentd/mux.js', 'src/agentd/reexec.js', 'src/agentd/version.js', 'src/agentd/worker-pool.js', 'src/agentd/ws-min.js']);
const ORCH_FILES = ['server.js', 'src/hosts.js', 'src/ws-handler.js', 'src/ws-create.js', 'src/agentd/client.js'];
const isOrch = (p) => p === 'server.js' || p === 'src/ws-handler.js' || p === 'src/ws-create.js' || p === 'src/hosts.js' || p === 'src/agentd/client.js'
  || p.startsWith('src/routes/') || p.startsWith('src/server/') || p.startsWith('src/channels/') || ['src/mounts.js', 'src/accounts.js', 'src/task-groups.js', 'src/usage-history.js',
    'src/usage-routes.js', 'src/agent-routes.js', 'src/session-status.js', 'src/user-todos.js', 'src/webdav.js', 'src/vnc.js',
    'src/auth.js', 'src/clerk-auth.js', 'src/telemetry.js', 'src/opslog.js', 'src/incident.js', 'src/remote-fs.js',
    'src/machine-mounts.js', 'src/exit-proxy.js', 'src/port-forward.js', 'src/plugins.js', 'src/gmail-sync.js',
    'src/sync-store.js', 'src/conversation-index.js'].includes(p);
const isClient = (p) => p.startsWith('src/lib/') || p === 'src/client.js';

// Deliberate exceptions — each with a reason (the vendor-whitelist mechanic).
const EXCEPTIONS = new Map([
  // client bundles PURE modules directly (CJS pulled into esbuild) — by design
  ['src/lib/utils.js->src/task-color-seq.js', 'pure module, shared server+browser by design (re-exported)'],
  ['src/lib/sidebar-mounts.js->src/ssh-key-format.js', 'pure module, shared server+browser by design'],
  ['src/lib/usage-meter.js->src/quota-model.js', 'pure module, shared server+browser by design — the quota panels ask the SAME accessor the pool and the write path do (B-9213: an account holds several limits and the panel used to show whichever pushed last)'],
  // The freshness chip and the identity warning are SENTENCES, and the server
  // cannot compose them: the digest is broadcast to every client at once
  // while the language is per DEVICE (localStorage). So the resolver returns
  // STRUCTURE and the two client surfaces render it with their own `t` —
  // which is also the only way the build's i18n scan can see those keys at
  // all (they used to leave the server as DATA and shipped English-only).
  ['src/lib/channels-panel.js->src/channel-caps.js', 'pure module, shared server+browser by design — the panel composes the freshness sentence in the DEVICE\'s language from the server\'s structured claim'],
  ['src/lib/channel-window.js->src/channel-caps.js', 'pure module, shared server+browser by design — same rule as the panel, for the context bar and the identity warning'],
  ['src/lib/channel-filter-editor.js->src/channel-filter.js', 'pure module, shared server+browser by design — the editor draws the CLOSED rule set and validates a rule with the same code the route refuses it with, so the two cannot disagree'],
  ['src/lib/channel-filter-editor.js->src/channel-caps.js', 'pure module, shared server+browser by design — the editor words the per-lane wake latency from the digest\'s structured lane, like the panel\'s chip'],
  // g3 (design §22): the IM-first panel's arithmetic asks the PURE group model for the group
  // namespace, the notify modes, the owner's actor id and `mentionsIn` — so the wake PREVIEW under
  // the composer and the engine's wakeVerdict read ONE definition of what an @ is.
  ['src/lib/channel-groups-view.js->src/channel-groups.js', 'pure module, shared server+browser by design — the wake preview and the engine apply the SAME mention rule; the group namespace / notify modes / owner id are spelled once'],
  ['src/lib/channel-outbox.js->src/channel-caps.js', 'pure module, shared server+browser by design — the approval card composes the §9.5 identity warning from the digest\'s structure in the device\'s language, exactly as the composer does'],
]);

// 1) PURE modules: zero requires of ANY kind beyond other PURE modules.
for (const f of PURE) {
  const reqs = requiresOf(f);
  const badBuiltin = reqs.filter((r) => !r.startsWith('.'));
  const badRel = reqs.map((r) => resolveRel(f, r)).filter((p) => p && !PURE.has(p));
  ok(!badBuiltin.length && !badRel.length, `PURE ${f} imports nothing but pure (${badBuiltin.join(',') || badRel.join(',') || 'clean'})`);
}

// 2) SHARED modules: may use node builtins + PURE + other SHARED — never ORCH/CLIENT/DEVICE.
for (const f of SHARED) {
  const bad = requiresOf(f).map((r) => resolveRel(f, r)).filter((p) => p && (isOrch(p) || isClient(p) || DEVICE.has(p)));
  ok(!bad.length, `SHARED ${f} never reaches up (${bad.join(',') || 'clean'})`);
}

// 3) DEVICE tier: only SHARED + PURE + its own files. Reaching into the
//    orchestrator from the daemon is the exact re-coupling this suite exists
//    to prevent — the daemon runs on machines that have no orchestrator.
for (const f of DEVICE) {
  const bad = requiresOf(f).map((r) => resolveRel(f, r)).filter((p) => p && !SHARED.has(p) && !PURE.has(p) && !DEVICE.has(p));
  ok(!bad.length, `DEVICE ${f} pulls only shared/pure/device (${bad.join(',') || 'clean'})`);
}

// 4) CLIENT: never imports ORCH or DEVICE modules (ws/HTTP is the ONLY channel).
const libFiles = fs.readdirSync(path.join(REPO, 'src/lib')).filter((x) => x.endsWith('.js')).map((x) => 'src/lib/' + x);
let clientBad = [];
for (const f of [...libFiles, 'src/client.js']) {
  for (const r of requiresOf(f)) {
    const p = resolveRel(f, r);
    if (!p) continue;
    if ((isOrch(p) || DEVICE.has(p) || SHARED.has(p)) && !EXCEPTIONS.has(`${f}->${p}`)) clientBad.push(`${f} -> ${p}`);
  }
}
ok(!clientBad.length, `CLIENT talks to the server over the wire only (${clientBad.slice(0, 4).join('; ') || 'clean'})`);

// 5) the daemon BUNDLE self-containment: build output must exist and must not
//    mention orchestrator filenames (a bundled hosts.js would mean the device
//    tier swallowed the orchestrator).
const bundle = read('data/bin/vibespace-agentd.js');
ok(bundle.length > 0, 'daemon bundle exists');
// match module MARKERS (esbuild emits '// src/<path>' banners per bundled
// file), not free text — comments legitimately mention orchestrator names
ok(!/\/\/ src\/ws-handler\.js|\/\/ src\/ws-create\.js|\/\/ src\/hosts\.js|\/\/ server\.js/.test(bundle), 'daemon bundle contains no orchestrator modules');

// 6) server.js is BOOTSTRAP + WIRING only (2.325.0 decomposition terminal
//    state: 6423 → ~1900 lines, mechanisms live in src/server/*). The budget
//    is a ratchet — new server-side code goes in a src/server module (see the
//    CLAUDE.md routing table), never back into server.js. If a legitimate
//    wiring stanza pushes past the budget, raise it deliberately in the same
//    commit that explains why.
{
  const serverLines = read('server.js').split('\n').length;
  ok(serverLines <= 2100, `server.js stays bootstrap-sized (${serverLines} ≤ 2100 lines — new mechanisms go in src/server/*)`);
  // §48 (2.369.134): CODE APPENDED AFTER A MID-LINE // IS A COMMENT. The mounts-plugins wiring call in server.js
  // carried three chunk notes mid-line; one chunk appended `getTelemetry: …` after them (never wired, the
  // default null hid it) and the r-fix moved `activeSessions,` after them too — every browser route answered
  // "no such live session", while test-plugin-loader's `/, activeSessions,$/m` pin was satisfied BY THE COMMENT.
  // Census: in the bootstrap + wiring files no line may carry an object key (`name: () =>` / `name: (x) =>`)
  // or a `, activeSessions,` after its first `//` outside a string.
  {
    const files = ['server.js', ...fs.readdirSync(path.join(REPO, 'src/server')).filter((f) => f.endsWith('-wiring.js')).map((f) => 'src/server/' + f)];
    const bad = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(REPO, f), 'utf8').split('\n');
      lines.forEach((l, i) => {
        const c = l.indexOf('//'); if (c < 0) return;
        const head = l.slice(0, c); if ((head.match(/'/g) || []).length % 2 || (head.match(/`/g) || []).length % 2 || /https?:$/.test(head)) return;
        const tail = l.slice(c + 2);
        if (/\b[a-zA-Z_]\w*: \((\w+(, \w+)*)?\) =>/.test(tail) || /, activeSessions,\s*$/.test(tail)) bad.push(`${f}:${i + 1}`);
      });
    }
    ok(bad.length === 0, `§48 no object key rides after a mid-line // in the bootstrap/wiring files (${files.length} files)`, bad);
    // negative control: the exact 2.369.134 shape trips the census
    const ctl = 'x: 1, // note getTelemetry: () => { try { return t; } catch { return null; } }, activeSessions,';
    const cc = ctl.indexOf('//'); const ct = ctl.slice(cc + 2);
    ok(/\b[a-zA-Z_]\w*: \((\w+(, \w+)*)?\) =>/.test(ct) && /, activeSessions,\s*$/.test(ct), '§48 control: the shipped line shape is caught');
  }
  // §48b ("Clear content…" verify r1, the fourth strike of the mid-line-comment class): a STATEMENT appended
  // after a mid-line `//` is a comment — `reasonInp.value = …; // a cleared reason is not offered back for
  // editing reasonInp.placeholder = tr('optional');` shipped in src/lib/sidebar-tasks.js and the Reason box lost
  // its placeholder. Census over EVERY product file (src/**, server.js, the shipped agent tools): a line's
  // comment tail (the `//` preceded by whitespace, outside a string, not a URL, not a regex like /^\//) may not
  // END with an assignment statement `x.y = …;`. Measured 2026-09-28: one hit (the shipped line), zero elsewhere.
  {
    const files = ['server.js'];
    const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = d + '/' + e.name; if (e.isDirectory()) { if (e.name !== 'node_modules') walk(rel); } else if (/\.(m?js)$/.test(e.name)) files.push(rel); } };
    walk('src');
    for (const e of fs.readdirSync(path.join(REPO, 'data/bin'), { withFileTypes: true })) if (e.isFile() && /^(vibespace-(task|ask|job|msg|channels|docs|page|usage|hook|hook-register|browser|window|remote-keeper|usage-scan|opencode-op)(\.m?js)?|.*-wrapper\.js|pty-wrapper\.js)$/.test(e.name)) files.push('data/bin/' + e.name);
    const judge = (l) => {
      const m = /(^|\s)\/\/(.*)$/.exec(l); if (!m) return false;
      const head = l.slice(0, l.length - m[0].length + m[1].length);
      if (/^\s*$/.test(head) || /^\s*\*/.test(head)) return false;                                     // a whole-line comment / a doc block
      if ((head.match(/'/g) || []).length % 2 || (head.match(/`/g) || []).length % 2 || (head.match(/"/g) || []).length % 2) return false; // inside a string
      return /\b[a-zA-Z_$][\w$]*\.[a-zA-Z_$][\w$]*\s=\s[^=].*;\s*$/.test(m[2]);
    };
    const bad = [];
    for (const f of files) { let src; try { src = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { continue; } src.split('\n').forEach((l, i) => { if (judge(l)) bad.push(`${f}:${i + 1}`); }); }
    ok(bad.length === 0, `§48b no assignment statement rides at the end of a mid-line // comment in the product files (${files.length} files)`, bad);
    ok(judge("    reasonInp.type = 'text'; reasonInp.value = cur.clearedAt ? '' : (cur.reason || ''); // a cleared reason is not offered back for editing reasonInp.placeholder = tr('optional');"), '§48b control: the shipped sidebar-tasks line is caught');
    ok(!judge("      if (h.location && /^\\//.test(h.location) && !h.location.startsWith('/svc/')) h.location = `/svc/${p.name}${h.location}`;") && !judge("  const u = 'https://x.y/z'; // see x.y = 1; in the docs") , '§48b control: a regex `/^\\//` and a `//` inside a string are not comments');
  }
  const mods = fs.readdirSync(path.join(REPO, 'src/server')).filter((f) => f.endsWith('.js'));
  ok(mods.length >= 14, `src/server/ holds the decomposed modules (${mods.length} ≥ 14)`);
}

// 7) freeze the exceptions list: an exception nobody uses anymore must be
//    removed (dead allowlist entries hide future violations behind them).
for (const [edge] of EXCEPTIONS) {
  const [from, to] = edge.split('->');
  const live = requiresOf(from).map((r) => resolveRel(from, r)).includes(to);
  ok(live, `exception still in use: ${edge} (remove dead allowlist entries)`);
}

// 8) every RELATIVE require/import must RESOLVE to an existing file (2.341.1,
//    userW's mount outage — 6th lost-binding incident, first of the
//    RELATIVE-PATH subclass: extraction #13 carried server.js's
//    require('./package.json') into src/server/dial-pairing.js where it
//    resolves to nothing and throws only when a dial op RUNS. Free-variable
//    checks, boot smokes and the route battery all miss a call-time require
//    with a bad relative path; this static walk cannot.)
{
  const allFiles = ['server.js'];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(REPO, dir))) {
      const p = dir + '/' + e;
      if (fs.statSync(path.join(REPO, p)).isDirectory()) walk(p);
      else if (/\.(js|mjs|cjs)$/.test(e)) allFiles.push(p);
    }
  })('src');
  const broken = [];
  for (const f of allFiles) {
    const s = read(f);
    for (const m of s.matchAll(/(?:require\(|from\s+)['"](\.[^'"]+)['"]/g)) {
      const base = path.normalize(path.join(path.dirname(f), m[1])).replace(/\\/g, '/');
      const cands = [base, base + '.js', base + '.json', base + '.mjs', base + '/index.js'];
      if (!cands.some((c) => fs.existsSync(path.join(REPO, c)))) broken.push(`${f}: ${m[1]}`);
    }
  }
  ok(!broken.length, `every relative require/import resolves (${broken.slice(0, 3).join('; ') || 'all resolve'})`);
}

// 9) SERVER-side private methods that are CALLED must be DEFINED in-file
//    (2.343.1, the _notify incident: a dead-code sweep deleted PluginManager's
//    _notify() while 8 call sites remained — every plugin broadcast and the
//    publish path threw for weeks; no battery saw a call-time method miss).
//    Scoped to server tiers only — src/lib uses prototype mixins (methods
//    defined across files) and would false-positive.
{
  const svFiles = allFilesFor9().filter((f) => !f.startsWith('src/lib/'));
  const broken = [];
  for (const f of svFiles) {
    const s9 = read(f);
    const called = new Set([...s9.matchAll(/this\.(_[a-zA-Z0-9]+)\(/g)].map((m) => m[1]));
    for (const name of called) {
      const woCalls = s9.replace(new RegExp(`this\\.${name}\\(`, 'g'), '');
      const defined = new RegExp(`(^|\\s)${name}\\s*\\(`, 'm').test(woCalls) || new RegExp(`this\\.${name}\\s*=`).test(s9) || new RegExp(`${name}\\s*:`).test(s9);
      if (!defined) broken.push(`${f}: this.${name}() called but never defined`);
    }
  }
  ok(!broken.length, `server-side private methods are defined where called (${broken.slice(0, 3).join('; ') || 'clean'})`);
  function allFilesFor9() {
    const out = ['server.js'];
    (function walk(dir) {
      for (const e of fs.readdirSync(path.join(REPO, dir))) {
        const p9 = dir + '/' + e;
        if (fs.statSync(path.join(REPO, p9)).isDirectory()) walk(p9);
        else if (p9.endsWith('.js')) out.push(p9);
      }
    })('src');
    return out;
  }
}

// 41. Settings bounds/defaults have ONE home (inc-mt0mozsp): the Manage
//     Agents instructions tab carried a hardcoded pre-2.210.0 copy of the
//     stop-nudge bounds ([min 1/2] + `Number(v) || dflt`) that silently
//     reverted an explicit 0 ("every stop" mode) back to 10/30. UI code must
//     read SETTINGS_SCHEMA, never re-declare a schema row's numbers inline.
{
  const ma = read('src/lib/manage-agents.js');
  ok(!/stopNudge\w*Minutes'\s*:\s*\[/.test(ma) && ma.includes('SETTINGS_SCHEMA[key]'),
    'manage-agents reads stop-nudge bounds from SETTINGS_SCHEMA (no hardcoded twin)');
  ok(!/Number\(inp\.value\)\s*\|\|/.test(ma),
    'no falsy-default coalescing on number inputs (explicit 0 is a valid value)');
}

// 42. NO CONTROL BYTES IN SOURCE (steer-all round 4). Two raw NUL bytes — one
//     used as the separator inside a Map key, one echoed in the comment above
//     it — made src/codex-session-store.js BINARY: file(1) called it "data",
//     `grep -n USER_RETRACTION_EVENT` on the very file that DEFINES that
//     constant printed nothing at all, and ripgrep answered "binary file
//     matches" with no line. Every search-driven read of that module — a
//     review, an incident, a twin sweep — silently skipped it. A separator
//     that cannot collide with the data is fine; spelling it as a raw byte
//     instead of the escape (byte-identical at runtime) is not.
//
//     ROUND 5 — THE CENSUS READS SOURCE, NOT THE WORKING TREE. Round 4 walked
//     the three roots with readdirSync, but data/bin is exactly where the
//     PRODUCT installs its own runtime artifacts: installRclone() drops a
//     64 MB arch-specific `rclone` there (gitignored since 2.368.9) plus
//     rclone-dl.zip, and boot generates vibespace-status and the agentd
//     bundle. Byte 7 of that download is a NUL, so the census turned
//     `npm run build` RED on every instance that had ever used a storage
//     mount — and this build is not optional: it is the pre-push release gate
//     AND the in-app "Update VibeSpace…" step, so the service never
//     restarted. `git ls-files` answers "what is SOURCE" structurally, which
//     puts every gitignored runtime artifact out of scope BY CONSTRUCTION
//     rather than by an extension blocklist the next 64 MB download would
//     evade again (432 tracked files: ~3 ms to LIST, ~25 ms to read the
//     9.3 MB of source — where the walk it replaces also read that 64 MB
//     binary in full just to look at byte 7). No git metadata
//     (tarball / git-archive / npm pack) ⇒ the source list is unknowable ⇒
//     SKIP with a reason: a census may decline to run, but it must never fail
//     a build over files it was never meant to read.
//
//     ROUND 6 — THE CENSUS'S OWN GIT INHERITED THE AMBIENT ENVIRONMENT. Round
//     5 answered "what is SOURCE" with git, and then ran git — read AND write
//     — with `process.env`. But git's whole repository-location layer lives in
//     the environment: GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE / GIT_COMMON_DIR
//     / GIT_OBJECT_DIRECTORY / GIT_CONFIG_PARAMETERS … each one silently
//     re-points a `git -C <tmpdir> …` at a DIFFERENT repository, and this
//     suite runs inside `npm run build`, which runs inside the release gate
//     and the in-app "Update VibeSpace…" — i.e. inside hook processes that
//     export exactly those names (measured on git 2.51: a pre-commit hook is
//     handed GIT_INDEX_FILE and GIT_PREFIX; GIT_DIR is normal for any tool
//     driving a worktree). Reproduced three ways, in throwaway repos:
//     (a) GIT_DIR at a linked worktree's gitdir ⇒ the control's `git init`
//     REINITIALISED that repo and flipped core.bare=false→true in the SHARED
//     config, after which `git status` in the main checkout dies "this
//     operation must be run in a work tree" — which breaks scripts/update.sh's
//     `git pull --ff-only`, ci.mjs's green marker, and (see the SKIP note
//     below) makes the census itself SKIP green forever; this happened to the
//     production checkout and was repaired by hand. (b) GIT_INDEX_FILE at
//     another repo's index ⇒ the REPO census read the FOREIGN listing (432
//     files → 1) so the suite went RED describing a tree that is not ours,
//     while `git add -f` staged the raw-NUL fixture into that repo and
//     replaced its .gitignore entry. (c) plain repo + GIT_DIR ⇒ the fixture is
//     staged there too. The fix is ONE sanitized environment used by EVERY git
//     this suite spawns; the explicit --git-dir/--work-tree on the write side
//     is belt-and-braces only, because it is NOT sufficient: measured,
//     `git --git-dir=A --work-tree=A add` under GIT_INDEX_FILE=B/.git/index
//     still writes B's index. A test that has to run inside someone else's
//     process must NAME the environment it runs its own tools in.
//
//     ROUND 6b — A SKIP MUST QUOTE THE FAILURE, NOT GUESS THE CAUSE. The skip
//     line asserted "no readable git index (export/tarball)" without ever
//     checking that. A checkout whose core.bare was flipped TRUE prints the
//     same green line even though `git ls-files` there answers perfectly (only
//     `rev-parse --show-toplevel` dies, because bare means "no work tree") —
//     so the accident above disabled the census AND told everyone the tree was
//     a tarball. Now: --show-toplevel failing falls back to `rev-parse
//     --git-dir` (ownership = <base>/.git is itself a repository entry, so a
//     tmpdir merely sitting INSIDE another repo still cannot borrow that
//     index), and every skip carries git's own failing command + its stderr.
//
//     ROUND 7a — THE NEGATIVE CONTROL WAS STILL RUNNING IN SOMEONE ELSE'S
//     ENVIRONMENT. Round 6 sanitized every git EXCEPT the one whose whole job
//     is to be unsanitized: the RAW leg that proves the sanitizer matters. It
//     built its `git add -f` env as `{ ...process.env, GIT_DIR, GIT_WORK_TREE,
//     GIT_INDEX_FILE }` — three of the 25 names GIT_REDIRECTORS enumerates
//     pinned, the other 22 still ambient. Measured, in throwaway repos: with
//     GIT_OBJECT_DIRECTORY (or GIT_COMMON_DIR) exported at a third repository,
//     that write puts its blobs THERE — a repo this suite was never pointed at
//     — and `npm run build` stays green while doing it; and when the same
//     ambient name points somewhere unwritable (a nonexistent dir, a 0500 dir)
//     or at a non-repo, `npm run build` goes RED on the line "the guarded
//     assert above is the sanitizer working, not the controls failing to run"
//     — a message that accuses the sanitizer of a failure caused by a variable
//     nobody in this file ever named. A negative control is a control: it may
//     differ from the guarded run in exactly ONE named way. So the raw leg's
//     env is now the SANITIZED base plus exactly the three decoy redirectors
//     it is testing, and `repoStamp` hashes the WHOLE .git tree (round 6's
//     config/index/HEAD stamp could not see the object channel at all, which
//     is precisely the channel those two names steer). The block's own
//     negative control for THIS finding is a third repository: the two names
//     really are exported into our process for the whole block, and it must be
//     byte-identical afterwards — with a sacrificial fourth repo proving the
//     pre-fix base still reaches one (i.e. that the environment is genuinely
//     hostile and the stamp genuinely detects the write).
//
//     ROUND 7b — THE SENTENCE OVERCLAIMED ITS SCOPE. "no source file carries a
//     NUL byte" was measured over `git ls-files -- src data/bin scripts`, i.e.
//     432 of the repository's 556 tracked files. The 124 outside included
//     server.js (the bootstrap this very suite ratchets), install.sh, run.sh,
//     editor-helper.sh, deploy/docker/*.sh, docs/screenshot-helper.js and
//     docs/examples/hello-plugin/server.js — every one of them a file a human
//     greps. The roots were never the point (the point was "tracked", which is
//     what puts the 64 MB rclone out of scope), so the pathspec is gone: the
//     census reads EVERY tracked file, and the scope pin now names server.js
//     and install.sh alongside the three root witnesses.
{
  // A legitimately binary FIXTURE is not source; everything else in the index
  // is text by construction. Measured 2026-09-07 over all 556 tracked files:
  // 24 are skipped by extension (4 .png screenshots + 20 .woff2 fonts) and 0
  // of the remaining 532 carry a NUL. A NEW binary fixture ⇒ add its extension
  // here WITH a comment naming the file; never a directory exclusion (the
  // tracked CLIs in data/bin must stay in scope).
  // .docx (lane docx-viewer, 2026-09-27): a Word file is a ZIP container —
  // scripts/fixtures/docx/{apa-title-page,embedded-font,hostile,long-80-pages}.docx,
  // generated by scripts/fixtures/docx/gen.py and read by test-docx-viewer(-model).
  // .AppImage (design 009 lane apps-install-core, 2026-10-03): an ELF stub + a SquashFS image —
  // scripts/fixtures/apps-installers/{capp-chat,capp-chat-xz,capp-chat-zstd,hostile}.AppImage,
  // read by test-app-manifest's SquashFS reader legs and test-apps-engine / test-app-install.
  const BINARY_EXT = new Set(['.zst', '.gz', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.wasm', '.pdf', '.zip', '.tar', '.docx', '.appimage']);

  const tmpDirs = [];
  const mkTmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `arch-nul-${tag}-`)); tmpDirs.push(d); return d; };
  // A repo's on-disk identity, byte-exact: EVERY file under .git, content-
  // hashed (round 7 — the old ['config','index','HEAD'] stamp was blind to
  // .git/objects, and the object store is exactly what GIT_OBJECT_DIRECTORY
  // and GIT_COMMON_DIR re-point). Anything a redirected git touches shows up.
  const repoStamp = (repo) => {
    const out = [];
    const walk = (dir, rel) => {
      let ents;
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { out.push(`${rel || '.'}/:<unreadable:${e.code}>`); return; }
      for (const e of ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        const p = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(p, r);
        else { try { out.push(`${r}:${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`); } catch (err) { out.push(`${r}:<unreadable:${err.code}>`); } }
      }
    };
    walk(path.join(repo, '.git'), '');
    return JSON.stringify(out);
  };

  // ── THE ONE SANITIZED GIT ENVIRONMENT (round 6) ──────────────────────────
  // Audited against git 2.51's own documented GIT_* list (git(1) "ENVIRONMENT
  // VARIABLES", gitrepository-layout(5), git-config(1)). We DELETE every name
  // that can re-point git at another repository, index, object store or config
  // — the config channels included, because `core.bare` / `core.worktree` /
  // `safe.directory` injected through them reach the same place indirectly.
  // We deliberately KEEP: PATH and the rest of the process env (we want the
  // machine's real git and its real ~/.gitconfig — the controls pass `-f` so a
  // global core.excludesFile still cannot shrink them); GIT_CONFIG_NOSYSTEM
  // and GIT_ATTR_NOSYSTEM (they only REMOVE ambient system files — strictly
  // more isolation, never less); GIT_EXEC_PATH (it belongs to the git on PATH);
  // GIT_AUTHOR_*/GIT_COMMITTER_*/GIT_EDITOR/GIT_PAGER/GIT_TERMINAL_PROMPT and
  // the GIT_TRACE* diagnostics (this suite never commits, never opens an
  // editor and never touches a network, so none of them can steer it).
  //
  // THE LIST AND THE FILTER NOW LIVE IN scripts/git-env.mjs (the fast/heavy
  // gate split, 2026-09-07): the pre-push hook DETACHES a heavy gate run, and
  // that child inherits the hook's git environment exactly like this suite
  // does — two spellings of "which names re-point git" would be two behaviours
  // the moment either is touched. This block's controls below still prove the
  // shared filter on real repositories, so the import is covered, not assumed.

  // ── ROUND 7: THIS BLOCK REALLY RUNS IN A HOSTILE ENVIRONMENT ─────────────
  // The suite cannot re-exec itself, so it exports the two redirectors that
  // own git's OBJECT channel — the ones round 6's stamp could not see and the
  // raw leg left ambient — into its own process, aimed at a throwaway repo,
  // for the whole of the block below. Every git spawned from here on is
  // therefore running with GIT_OBJECT_DIRECTORY/GIT_COMMON_DIR set at a
  // repository nobody names on any command line; the assert at the end of the
  // block is that it is byte-identical. Created BEFORE the injection, with an
  // env sanitized by the same function, so the fixture itself cannot be bent.
  let ambientThird = null, ambientBefore = null;
  const ambientSaved = new Map();
  const restoreAmbient = () => {
    for (const [k, v] of ambientSaved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    ambientSaved.clear();
  };
  {
    const bootEnv = gitEnvFrom(process.env);
    const d = mkTmp('ambient-third');
    fs.mkdirSync(path.join(d, 'src'), { recursive: true });
    fs.writeFileSync(path.join(d, 'src/third.js'), 'const third = 1;\n');
    const i = spawnSync('git', ['init', '-q', d], { cwd: d, encoding: 'utf-8', env: bootEnv });
    const a = (!i.error && i.status === 0)
      ? spawnSync('git', ['--git-dir', path.join(d, '.git'), '--work-tree', d, 'add', '-A'], { cwd: d, encoding: 'utf-8', env: bootEnv })
      : { status: 1 };
    if (!i.error && i.status === 0 && a.status === 0) {
      ambientThird = d;
      for (const [k, v] of [['GIT_OBJECT_DIRECTORY', path.join(d, '.git', 'objects')], ['GIT_COMMON_DIR', path.join(d, '.git')]]) {
        ambientSaved.set(k, process.env[k]);
        process.env[k] = v;
      }
      ambientBefore = repoStamp(d);
    }
  }

  const GIT_ENV = gitEnvFrom(process.env);
  // EVERY git in this block goes through these, read side and write side.
  const gitIn = (base, args, env = GIT_ENV, opts = {}) =>
    spawnSync('git', ['-C', base, ...args], { encoding: 'utf-8', env, ...opts });
  const gitWhy = (r) => (!r ? '(not run)' : r.error
    ? `spawn failed: ${r.error.code || r.error.message}`
    : `exit ${r.status}: ${String(r.stderr || '').trim().replace(/\s+/g, ' ').slice(0, 160) || '(no stderr)'}`);
  const samePath = (a, b) => { try { return fs.realpathSync(a) === fs.realpathSync(b); } catch { return false; } };

  // The tracked-source listing for a tree: { files } when git can answer FOR
  // THAT TREE, else { skip: <git's own failing command + stderr> }. Ownership
  // matters because a tmpdir that happens to sit inside some other repo must
  // never borrow that repo's index.
  const trackedSource = (base, env = GIT_ENV) => {
    let owns = false, why = '';
    const top = gitIn(base, ['rev-parse', '--show-toplevel'], env);
    if (!top.error && top.status === 0) {
      owns = samePath(top.stdout.trim(), base);
      if (!owns) why = `git -C <base> rev-parse --show-toplevel → ${JSON.stringify(top.stdout.trim())}, which is not <base> (a tmpdir inside someone else's repo may not borrow its index)`;
    } else {
      // core.bare=true kills --show-toplevel ("must be run in a work tree")
      // while leaving the index perfectly readable. Ask for the git dir.
      const gd = gitIn(base, ['rev-parse', '--git-dir'], env);
      let entry = false; try { entry = fs.existsSync(path.join(base, '.git')); } catch {}
      if (!gd.error && gd.status === 0 && entry) owns = true;
      else why = `git -C <base> rev-parse --show-toplevel: ${gitWhy(top)}; --git-dir: ${gitWhy(gd)}${entry ? '' : '; and <base>/.git is not a repository entry'}`;
    }
    if (!owns) return { skip: why };
    // NO PATHSPEC (round 7): "source" is defined by the INDEX, not by a list of
    // directories — the roots were an unstated 432-of-556 sample that quietly
    // excluded server.js, install.sh, run.sh and every deploy/docs script.
    const ls = gitIn(base, ['ls-files', '-z'], env, { encoding: null, maxBuffer: 64 * 1024 * 1024 });
    if (ls.error || ls.status !== 0) return { skip: `git -C <base> ls-files: ${gitWhy(ls)}` };
    return { files: (ls.stdout ? ls.stdout.toString('utf-8') : '').split('\0').filter(Boolean) };
  };
  const census = (base, env = GIT_ENV) => {
    const t = trackedSource(base, env);
    if (t.skip) return t; // the caller SKIPS — never fails
    const offenders = [];
    for (const f of t.files) {
      if (BINARY_EXT.has(path.extname(f).toLowerCase())) continue;
      let buf;
      try { buf = fs.readFileSync(path.join(base, f)); } catch { continue; } // tracked but absent from the work tree
      const at = buf.indexOf(0);
      if (at !== -1) offenders.push(`${f} (byte ${at}, line ${buf.slice(0, at).toString('utf-8').split('\n').length})`);
    }
    return { files: t.files, offenders };
  };

  const c42 = census(REPO);
  if (c42.skip) {
    ok(true, `NUL-byte census SKIPPED — the tracked-source listing is genuinely unobtainable here, and a census must never fail a build over files it cannot scope; git's own words: ${c42.skip}`);
  } else {
    ok(!c42.offenders.length,
      `no TRACKED file carries a NUL byte — one makes the WHOLE file invisible to grep/rg (${c42.files.length} tracked files, whole index; ${c42.offenders.slice(0, 3).join('; ') || 'clean'})`);
    // SCOPE PIN: a mis-scoped listing (wrong pathspec, wrong repo, renamed
    // tree) passes VACUOUSLY. Name files the census MUST have read — the
    // incident's own module, this suite, a tracked extension-less data/bin CLI
    // (the root where the untracked artifacts live), and two files that live
    // in NEITHER of the old roots: the bootstrap this suite ratchets, and the
    // installer every new checkout runs.
    const seen = new Set(c42.files);
    const pins = ['src/codex-session-store.js', 'scripts/test-architecture.mjs', 'data/bin/vibespace-task', 'server.js', 'install.sh'];
    ok(pins.every((f) => seen.has(f)),
      `census scope really is the WHOLE index — src + scripts + data/bin AND the root files outside them (a vacuous listing cannot pass; ${c42.files.length} files; missing: ${JSON.stringify(pins.filter((f) => !seen.has(f)))})`);
  }

  // ── CONTROLS, in throwaway repos ─────────────────────────────────────────
  // "Source" is defined by the INDEX, so the fixture has to have one.
  // Planted-but-untracked is the rclone class and must be structurally
  // invisible; that is the whole point of the round-5 fix.
  const plantFixture = (dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'data', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/clean.js'), 'const k = `a\\u0000b`; // the escape, not the byte\n');
    fs.writeFileSync(path.join(dir, 'src/dirty.js'), Buffer.concat([Buffer.from('const k = `a'), Buffer.from([0]), Buffer.from('b`;\n')]));
    fs.writeFileSync(path.join(dir, 'src/rollout.zst'), Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x01]));
    // the rclone class: an extension-less binary the PRODUCT installs into a
    // scanned root, gitignored exactly like the real one.
    fs.writeFileSync(path.join(dir, '.gitignore'), 'data/bin/rclone\n');
    fs.writeFileSync(path.join(dir, 'data/bin/rclone'), Buffer.concat([Buffer.from('\x7fELF'), Buffer.alloc(2048)]));
    // ...and an untracked source file, to prove the gate is the INDEX and not .gitignore.
    fs.writeFileSync(path.join(dir, 'src/untracked.js'), Buffer.concat([Buffer.from('x'), Buffer.from([0]), Buffer.from('\n')]));
  };
  // WRITE SIDE: the target repo is named on the command line (positional dir
  // for init, --git-dir/--work-tree for add/config) AND cwd is that repo AND
  // the env is sanitized. Only the last of the three defeats GIT_INDEX_FILE.
  const initRepo = (repo, env = GIT_ENV) =>
    spawnSync('git', ['init', '-q', repo], { cwd: repo, encoding: 'utf-8', env });
  // -f so a developer's global core.excludesFile (e.g. a blanket *.zst) can
  // never quietly shrink the control — we still never add data/bin/rclone.
  const addFixture = (repo, env = GIT_ENV) =>
    spawnSync('git', ['--git-dir', path.join(repo, '.git'), '--work-tree', repo,
      'add', '-f', '--', 'src/clean.js', 'src/dirty.js', 'src/rollout.zst', '.gitignore'],
    { cwd: repo, encoding: 'utf-8', env });
  const setBare = (repo, v, env = GIT_ENV) =>
    spawnSync('git', ['--git-dir', path.join(repo, '.git'), 'config', 'core.bare', v],
      { cwd: repo, encoding: 'utf-8', env });
  const tmp42 = mkTmp('ctl');
  try {
    plantFixture(tmp42);

    const noMeta = census(tmp42);
    ok(!!noMeta.skip && /rev-parse/.test(noMeta.skip),
      `CONTROL: a tree with no git metadata SKIPS, and the skip QUOTES git instead of guessing a cause (${JSON.stringify(String(noMeta.skip).slice(0, 110))})`);

    const init = initRepo(tmp42);
    const add = (!init.error && init.status === 0) ? addFixture(tmp42) : null;
    if (init.error || init.status !== 0 || !add || add.status !== 0) {
      ok(true, `CONTROLS SKIPPED: git init/add unavailable here (${gitWhy(add && add.status !== 0 ? add : init)})`);
    } else {
      const found = census(tmp42);
      ok(!found.skip && found.offenders.length === 1 && found.offenders[0].startsWith('src/dirty.js (byte 12, line 1)'),
        `CONTROL: a TRACKED NUL is found, while the \\u0000 escape and a binary fixture are not (${JSON.stringify(found.offenders || found.skip)})`);
      ok(!found.skip && !found.files.some((f) => f === 'data/bin/rclone' || f === 'src/untracked.js'),
        `CONTROL: files the product installs/generates at runtime are OUT OF SCOPE — untracked never reaches the census, however big or binary (${JSON.stringify(found.files || found.skip)})`);

      // ROUND 6b: the state the accident LEFT BEHIND. core.bare=true makes
      // --show-toplevel die while ls-files still answers; before the --git-dir
      // fallback this printed the same green "export/tarball" SKIP forever.
      const flip = setBare(tmp42, 'true');
      const topWhileBare = gitIn(tmp42, ['rev-parse', '--show-toplevel']);
      const bared = flip.status === 0 ? census(tmp42) : null;
      const unflip = flip.status === 0 ? setBare(tmp42, 'false') : null;
      ok(flip.status === 0 && topWhileBare.status !== 0 && !!bared && !bared.skip && bared.offenders.length === 1
        && !!unflip && unflip.status === 0 && !census(tmp42).skip,
        `CONTROL: a core.bare=true checkout has no work tree (--show-toplevel: ${gitWhy(topWhileBare)}) yet a perfectly readable index, so the census RUNS instead of skipping green (${JSON.stringify(bared && (bared.offenders || bared.skip))})`);

      // OWNERSHIP PIN for that fallback: `--git-dir` answers from ANY depth,
      // so the relaxation must not let a directory borrow an ancestor repo's
      // index — with the work tree alive (--show-toplevel names the ancestor)
      // and with it flagged bare (only <base>/.git can say "the repo is here").
      const inner = path.join(tmp42, 'src');
      const innerLive = census(inner);
      const flip2 = setBare(tmp42, 'true');
      const innerBare = flip2.status === 0 ? census(inner) : null;
      if (flip2.status === 0) setBare(tmp42, 'false');
      ok(!!innerLive.skip && !!innerBare && !!innerBare.skip,
        `CONTROL: a directory INSIDE another repo never borrows that repo's index — bare or not (live: ${JSON.stringify(String(innerLive.skip).slice(0, 70))}; bare: ${JSON.stringify(String(innerBare && innerBare.skip).slice(0, 70))})`);

      // ── ROUND 6a: THE AMBIENT-ENVIRONMENT NEGATIVE CONTROL ───────────────
      // Two decoy repos, one hostile environment. Through the sanitizer the
      // decoy must be BYTE-IDENTICAL afterwards; raw, it must change — the
      // second half is what proves the first is the sanitizer's doing and not
      // the controls quietly failing to run at all.
      const makeDecoy = (tag) => {
        const d = mkTmp(tag);
        fs.mkdirSync(path.join(d, 'src'), { recursive: true });
        fs.writeFileSync(path.join(d, 'src/decoy.js'), 'const decoy = 1;\n');
        fs.writeFileSync(path.join(d, '.gitignore'), 'decoy-ignores-nothing\n');
        if (initRepo(d).status !== 0) return null;
        const a = spawnSync('git', ['--git-dir', path.join(d, '.git'), '--work-tree', d, 'add', '-A'],
          { cwd: d, encoding: 'utf-8', env: GIT_ENV });
        return a.status === 0 ? d : null;
      };
      const hostileFor = (decoy) => ({
        ...process.env,
        GIT_DIR: path.join(decoy, '.git'),
        GIT_WORK_TREE: decoy,
        GIT_INDEX_FILE: path.join(decoy, '.git', 'index'),
        GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.bare', GIT_CONFIG_VALUE_0: 'true',
        GIT_CONFIG_PARAMETERS: "'core.bare'='true'",
        GIT_PREFIX: 'src/', GIT_NAMESPACE: 'decoy', GIT_CEILING_DIRECTORIES: decoy,
        GIT_OBJECT_DIRECTORY: path.join(decoy, '.git', 'objects'),
        GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(decoy, '.git', 'objects'),
        GIT_COMMON_DIR: path.join(decoy, '.git'), GIT_TEMPLATE_DIR: decoy,
        GIT_LITERAL_PATHSPECS: '1', GIT_INDEX_VERSION: '4', GIT_CONFIG_NOSYSTEM: '1',
      });
      const guarded = makeDecoy('decoy-guarded');
      const exposed = makeDecoy('decoy-exposed');
      if (!guarded || !exposed) {
        ok(true, 'CONTROLS SKIPPED: could not build the ambient-environment decoy repos');
      } else {
        const hostile = hostileFor(guarded);
        const cleaned = gitEnvFrom(hostile);
        ok(GIT_REDIRECTORS.every((k) => !(k in cleaned)) && !('GIT_CONFIG_KEY_0' in cleaned) && !('GIT_CONFIG_VALUE_0' in cleaned)
          && cleaned.PATH === hostile.PATH && cleaned.GIT_CONFIG_NOSYSTEM === '1',
          `CONTROL: the sanitizer drops every repo/index/object/config REDIRECTOR incl. the numbered GIT_CONFIG_KEY_n/VALUE_n pairs, and keeps PATH + the strictly-more-isolating GIT_CONFIG_NOSYSTEM (${GIT_REDIRECTORS.length} names audited)`);

        // (a) SANITIZED: run the whole control sequence (skip-probe + init +
        //     add + census) in a fresh fixture while the hostile names point
        //     at `guarded`. Nothing outside the fixture may move.
        const under = mkTmp('ctl-guarded');
        plantFixture(under);
        const beforeG = repoStamp(guarded);
        const preSkip = census(under, gitEnvFrom(hostile));
        const gi = initRepo(under, gitEnvFrom(hostile));
        const ga = gi.status === 0 ? addFixture(under, gitEnvFrom(hostile)) : { status: 1 };
        const gc = census(under, gitEnvFrom(hostile));
        ok(repoStamp(guarded) === beforeG,
          'CONTROL (the round-6 finding itself): with the sanitized environment, a hostile GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE/GIT_CONFIG_* leaves the OTHER repo byte-identical — every file under .git content-hashed, objects included (round 7)');
        ok(!!preSkip.skip && gi.status === 0 && ga.status === 0 && !gc.skip && gc.offenders.length === 1 && gc.offenders[0].startsWith('src/dirty.js'),
          `CONTROL: ...and the controls still did their real work in the throwaway repo, so the assert above is not vacuous (${JSON.stringify(gc.offenders || gc.skip)})`);

        // (b) RAW: the fixture repo really exists (created sanitized), and only
        //     the `add` runs with the three decoy redirectors in place. It must
        //     reach `exposed` — measured: --git-dir/--work-tree do NOT override
        //     GIT_INDEX_FILE, which is exactly why the env is the fix.
        //     ROUND 7: the base is GIT_ENV, not process.env. A negative control
        //     may differ from the guarded run in exactly the ONE way it is
        //     testing; `{ ...process.env, <3 names> }` left the other 22
        //     redirectors ambient, so this write landed wherever the caller's
        //     GIT_OBJECT_DIRECTORY/GIT_COMMON_DIR said (measured: a third repo,
        //     silently — or, when that name pointed at a nonexistent/read-only
        //     directory, a RED build blaming the sanitizer for it).
        const overExposed = mkTmp('ctl-exposed');
        plantFixture(overExposed);
        const rawEnv = { ...GIT_ENV, GIT_DIR: path.join(exposed, '.git'), GIT_WORK_TREE: exposed, GIT_INDEX_FILE: path.join(exposed, '.git', 'index') };
        const beforeE = repoStamp(exposed);
        const ei = initRepo(overExposed);
        const ea = ei.status === 0 ? addFixture(overExposed, rawEnv) : { status: 1 };
        // …and SAY the one-variable rule at the site, so a future `...process.env`
        // fails here rather than only through the whole-block assert below.
        const rawCarries = GIT_REDIRECTORS.filter((k) => k in rawEnv);
        ok(ei.status === 0 && ea.status === 0 && repoStamp(exposed) !== beforeE
          && JSON.stringify(rawCarries) === JSON.stringify(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']),
          `NEGATIVE CONTROL: the same write control, differing from the guarded run in EXACTLY the three redirectors it names (${JSON.stringify(rawCarries)}), DOES reach the other repo (${gitWhy(ea)}) — the guarded assert above is the sanitizer working, not the controls failing to run`);

        // (c) ROUND 7's own negative control, on a SACRIFICIAL fourth repo: the
        //     PRE-FIX base — `{ ...process.env, GIT_DIR, GIT_WORK_TREE,
        //     GIT_INDEX_FILE }`, three of 25 names pinned — really does carry
        //     `git add` into a repository named on no command line, because
        //     the ambient environment owns the object channel. We aim the two
        //     ambient names at `probe` for the duration of this one call so
        //     that `ambientThird` (asserted untouched below, over the WHOLE
        //     block) keeps its meaning. If this leg ever goes green-by-nothing,
        //     the ambient environment is not hostile and the assert below is
        //     vacuous — so they are two halves of one control.
        const probe = ambientThird ? makeDecoy('decoy-probe') : null;
        const leakField = probe ? mkTmp('ctl-leak') : null;
        let leakMoved = false, leakWhy = 'probe repo unavailable', preFixCarries = null;
        if (probe && leakField) {
          plantFixture(leakField);
          const beforeP = repoStamp(probe);
          const li = initRepo(leakField);
          const aimed = new Map();
          for (const [k, v] of [['GIT_OBJECT_DIRECTORY', path.join(probe, '.git', 'objects')], ['GIT_COMMON_DIR', path.join(probe, '.git')]]) {
            aimed.set(k, process.env[k]); process.env[k] = v;
          }
          //     THE SAME ONE-VARIABLE RULE AS (b), APPLIED TO THIS LEG: the
          //     pre-fix base is spelled on the SANITIZED env plus exactly the
          //     two ambient names this control is about. `{ ...process.env, … }`
          //     left the other twenty redirectors ambient, so a caller whose
          //     shell already exported GIT_LITERAL_PATHSPECS=1/
          //     GIT_ICASE_PATHSPECS=1 (git perfectly healthy) or
          //     GIT_CONFIG_COUNT=1 turned `npm run build` RED here — with a
          //     message blaming the round-7 finding for its own environment.
          //     What is being demonstrated is the OBJECT channel, and that is
          //     named, not inherited.
          const preFixEnv = {
            ...GIT_ENV,
            GIT_OBJECT_DIRECTORY: process.env.GIT_OBJECT_DIRECTORY,
            GIT_COMMON_DIR: process.env.GIT_COMMON_DIR,
            GIT_DIR: path.join(exposed, '.git'),
            GIT_WORK_TREE: exposed,
            GIT_INDEX_FILE: path.join(exposed, '.git', 'index'),
          };
          for (const k of Object.keys(preFixEnv)) if (preFixEnv[k] === undefined) delete preFixEnv[k];
          preFixCarries = GIT_REDIRECTORS.filter((k) => k in preFixEnv);
          const la = li.status === 0 ? addFixture(leakField, preFixEnv) : { status: 1 };
          for (const [k, v] of aimed) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
          leakMoved = li.status === 0 && la.status === 0 && repoStamp(probe) !== beforeP;
          leakWhy = gitWhy(la);
        }
        const PREFIX_EXPECTED = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY'];
        ok(leakMoved && JSON.stringify(preFixCarries) === JSON.stringify(PREFIX_EXPECTED),
          `NEGATIVE CONTROL (the round-7 finding itself): the PRE-FIX base — sanitized, PLUS exactly the object-channel names this leg demonstrates (${JSON.stringify(preFixCarries)}) — carries the very same write into a THIRD repository named on no command line, because 3 pinned names cannot protect the object channel (${leakWhy})`);
      }
    }

    // ── ROUND 7: THE WHOLE BLOCK, MEASURED FROM OUTSIDE ────────────────────
    // Every git above ran with GIT_OBJECT_DIRECTORY and GIT_COMMON_DIR
    // exported at `ambientThird`. Not one of them may have written a byte
    // there — including the raw negative control, whose entire job is to be
    // hostile in the three ways it NAMES. The env assert keeps this honest:
    // an assert about an environment that was never set is not an assert.
    if (!ambientThird) {
      ok(true, 'CONTROLS SKIPPED: could not build the ambient third repository (git init/add unavailable here)');
    } else {
      const stillHostile = process.env.GIT_OBJECT_DIRECTORY === path.join(ambientThird, '.git', 'objects')
        && process.env.GIT_COMMON_DIR === path.join(ambientThird, '.git');
      const after = repoStamp(ambientThird);
      ok(stillHostile && after === ambientBefore,
        `CONTROL (the round-7 finding itself): with GIT_OBJECT_DIRECTORY + GIT_COMMON_DIR exported at a third repository for the WHOLE census block, that repository is byte-identical afterwards — every .git file hashed, objects included (hostile env still set: ${stillHostile})`);
    }
  } finally {
    restoreAmbient();
    for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  }
}

// 43. THE GATE CENSUS (2026-09-07, B-4c5a — the fast/heavy split). A test
//     suite that is in no runner is not a test: before the split, 99 of the
//     184 files matching scripts/test-*.mjs were in NO list at all — not in
//     the gate, not written down as skipped, invisible to everyone including
//     the people who wrote them (test-usage-estimator and test-task-wakeup-
//     card each spent months in that hole and joined the gate only after an
//     incident). So the tier table is now a CENSUS: every scripts/test-*.mjs
//     is either 'fast', 'heavy' (with a stated reason: chrome / server / cli /
//     binary / slow) or in EXCLUDED with the reason it cannot be gated. This
//     assert lives here so it runs inside `npm run build` — i.e. inside BOTH
//     tiers and the in-app "Update VibeSpace…" — and not only in the gate that
//     the new suite might not be in yet.
//
//     SCOPE: readdir, not `git ls-files`. §42 round 5 reads the source list
//     from git because the PRODUCT writes runtime products into the working
//     tree (data/bin/rclone) — nothing writes scripts/test-*.mjs, and the case
//     this census exists for is precisely a suite you just wrote and have not
//     committed. Reading the index would let exactly that one fall through.
{
  const ci = await import('./ci.mjs');
  const disk = ci.listSuiteFiles(REPO);
  const f = ci.censusFindings(disk);
  ok(disk.length > 100, `census scope is non-vacuous (${disk.length} scripts/test-*.mjs on disk)`);
  ok(!f.unclassified.length, `every scripts/test-*.mjs is in a tier or EXCLUDED (${f.unclassified.slice(0, 6).join(', ') || 'none missing'})`);
  ok(!f.inBoth.length, `no suite is both tiered and excluded (${f.inBoth.join(', ') || 'clean'})`);
  ok(!f.duplicated.length, `no suite is listed twice (${f.duplicated.join(', ') || 'clean'})`);
  ok(!f.ghosts.length, `every listed suite has a scripts/<name>.mjs (${f.ghosts.join(', ') || 'clean'})`);
  ok(!f.badTier.length, `every tier is 'fast' or 'heavy' (${f.badTier.join(', ') || 'clean'})`);
  ok(!f.reasonless.length, `every heavy/excluded entry states WHY (${f.reasonless.slice(0, 6).join(', ') || 'clean'})`);
  ok(f.counted.fast > 0 && f.counted.heavy > 0,
    `both tiers are populated (${f.counted.fast} fast + ${f.counted.heavy} heavy + ${f.counted.excluded} excluded = ${f.counted.fast + f.counted.heavy + f.counted.excluded} of ${f.counted.disk})`);
  // NEGATIVE CONTROL: the census must actually be able to go red. Feed it a
  // disk listing containing a suite nobody classified and a table naming a
  // file that does not exist — an assert that cannot fail is not an assert.
  const nc = ci.censusFindings([...disk, 'test-not-in-any-tier'],
    [{ name: 'test-ghost-suite', tier: 'heavy', why: 'chrome' }, { name: 'test-ghost-suite', tier: 'fast' }, ...ci.SUITES],
    ci.EXCLUDED);
  ok(nc.unclassified.includes('test-not-in-any-tier') && nc.ghosts.includes('test-ghost-suite') && nc.duplicated.includes('test-ghost-suite'),
    'NEGATIVE CONTROL: the census reports an unclassified suite, a ghost entry and a duplicate (it can go red)');
  // THE WIRING PINS (hook ⇄ workflow ⇄ package.json) LIVE IN
  // scripts/test-ci-gate.mjs, NOT HERE, and that is a rule with a scar: this
  // block runs inside `npm run build`, and several browser suites build a
  // PARTIAL COPY of the tree in a throwaway worktree (test-window-menu copies
  // src+public+server.js+scripts onto a HEAD checkout). A build-time assert
  // that compares files OUTSIDE the copied set fails in every one of those
  // worktrees for reasons that have nothing to do with the code under test —
  // measured: the package.json pin turned test-window-menu into a 300 s
  // timeout and then a bare "Command failed: npm run build". A build-time
  // check may only read what a build reads; cross-file wiring is a suite's job.
}

// 44. THE SETTINGS CATEGORY CENSUS (2026-09-09). `SETTINGS_CATEGORIES` is not
//     a hint about ordering — it IS SettingsUI's render loop. `_renderContent`
//     groups every row by `schema.category` (creating a bucket for whatever it
//     finds) and then renders by iterating that ARRAY, so a category nobody
//     listed is grouped and dropped: its rows are unreachable in the product
//     and invisible to the search box, which answers "No settings match your
//     search." There is no second write path — `serverSetting()` reads the
//     sparse data/settings.json, and only this UI writes it.
//
//     Measured before the fix: 118 settings, 108 rendered, 10 NEVER RENDERED —
//     the seven `Spending` rows (every unattended-spend ceiling, the overage
//     consent and the EDF reserve floor, while the pool's blocked notice, the
//     spend guard's inbox item and the overage chip all told the user to open
//     "Settings → Spending") plus three `OpenCode` rows that had been invisible
//     since the day they shipped. Nothing was red: no suite compared the two
//     sets, which is exactly why the second omission could ride in behind the
//     first.
//
//     It lives HERE, in the build, because the defect is one missing array
//     entry in a file every feature touches, and because it reads only
//     src/lib/** — inside the partial-copy set the browser suites build (the
//     §43 scar). The assert is the CONSEQUENCE ("every row renders"), not just
//     set inclusion, and the UI's own coupling is pinned so the replay cannot
//     drift away from the loop it stands for.
{
  const schemaMod = await import('../src/lib/settings-schema.js');
  const { SETTINGS_SCHEMA, SETTINGS_CATEGORIES } = schemaMod;
  const ui = read('src/lib/settings-ui.js');

  /** SettingsUI._renderContent, verbatim in shape: group by category, then
   *  render by walking the ordered list. Returns the paths that reach a
   *  section. */
  const renderedPaths = (schema, cats) => {
    const grouped = {};
    for (const cat of cats) grouped[cat] = [];
    for (const [p, s] of Object.entries(schema)) {
      const cat = s.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    }
    const out = [];
    for (const cat of cats) for (const p of grouped[cat] || []) out.push(p);
    return out;
  };

  const all = Object.keys(SETTINGS_SCHEMA);
  const cats = [...new Set(Object.values(SETTINGS_SCHEMA).map((s) => s.category))];
  ok(all.length > 50 && cats.length > 5 && SETTINGS_CATEGORIES.length > 5,
    `settings census scope is non-vacuous (${all.length} settings in ${cats.length} categories, ${SETTINGS_CATEGORIES.length} listed)`);
  // 44b. A KEY THE CHROME APPLIER READS MUST BE DECLARED (2026-09-14, userW's
  // inc-mu1qa5gj-9qe9): `toolbar.showDesktopButton` was read by
  // applyChromeSettings and by customize mode's hideKey table since 2.111.4
  // and never declared, so `settings.get` answered undefined ⇒ the Desktop
  // button hid whenever chrome settings were re-applied after the VNC probe —
  // latent for 250 releases, triggered on every load by 2.369.96's Apps probe.
  // The census reads the two consumers' own text: every `s.get('<key>')` in
  // app.js's applyChromeSettings and every `hideKey: '<key>'` in customize-mode.
  {
    const appSrc = fs.readFileSync(path.join(REPO, 'src/lib/app.js'), 'utf8');
    const czSrc = fs.readFileSync(path.join(REPO, 'src/lib/customize-mode.js'), 'utf8');
    const block = (appSrc.match(/const applyChromeSettings = \(\) => \{[\s\S]*?\n    \};/) || [''])[0];
    const read = [...block.matchAll(/s\.get\('([a-zA-Z.]+)'\)/g)].map((m) => m[1]);
    const hide = [...czSrc.matchAll(/hideKey:\s*'([a-zA-Z.]+)'/g)].map((m) => m[1]);
    const want = [...new Set([...read, ...hide])];
    const missing = want.filter((k) => !SETTINGS_SCHEMA[k]);
    ok(block.length > 200 && read.length >= 8 && hide.length >= 8, `44b scope is non-vacuous (${read.length} keys read by applyChromeSettings, ${hide.length} customize hideKeys)`);
    ok(missing.length === 0, `every chrome/customize settings key is DECLARED in the schema${missing.length ? ' — missing: ' + missing.join(', ') : ''}`);
    ok(want.includes('toolbar.showDesktopButton') && SETTINGS_SCHEMA['toolbar.showDesktopButton']?.default === true, 'the incident\'s own key is read, declared and defaults to shown');
    ok(['toolbar.showZzzNope'].every((k) => !SETTINGS_SCHEMA[k]), 'NEG: an undeclared key is what this census reports (the schema does not silently accept unknowns)');
  }
  // 44c (2.369.132): the nav is a TREE — groups only ORDER and FOLD the census set.
  {
    const { orderedCategories, settingsGroupOf, settingsGroups, SETTINGS_GROUPS } = schemaMod;
    const ordered = orderedCategories();
    const sameSet = ordered.length === SETTINGS_CATEGORIES.length && new Set(ordered).size === ordered.length && SETTINGS_CATEGORIES.every((c) => ordered.includes(c));
    ok(sameSet, `orderedCategories() is a PERMUTATION of SETTINGS_CATEGORIES (${ordered.length} categories, none dropped, none twice)`, { ordered, cats: SETTINGS_CATEGORIES });
    const ids = settingsGroups().map((g) => g.id);
    const orphan = SETTINGS_CATEGORIES.filter((c) => !ids.includes(settingsGroupOf(c)));
    ok(orphan.length === 0, 'every category maps to a group that exists (a category no static group names still lands in plugins/other by rule)', orphan);
    const unknown = SETTINGS_GROUPS.flatMap((g) => g.categories).filter((c) => !SETTINGS_CATEGORIES.includes(c));
    ok(unknown.length === 0, 'no group names a category that is not in the census (a typo in a group would silently move nothing)', unknown);
    ok(/for \(const cat of orderedCategories\(\)\)/.test(ui) && /settingsGroupOf\(cat\)/.test(ui) && /settings-nav-group-head/.test(ui), 'the UI walks orderedCategories() for the sections and hangs each nav item under its group head');
    ok(/data-apply-kind|dataset\.applyKind/.test(ui) && /'cli-config'/.test(ui) && /'spawn'/.test(ui) && /'server'/.test(ui), 'a harness section renders three sub-blocks by apply kind (global cli-config / per-session spawn / VibeSpace server)');
  }
  // 44e (B-df40 part 2, 2026-10-03): the two VIEW fields are a closed vocabulary, checked where the build runs.
  // `when` decides whether a row is drawn and `tier` whether it waits for "Show advanced settings"
  // (src/lib/settings-view.js); at runtime a clause the client cannot decide HIDES NOTHING, so a typo would be
  // a silent no-op — this census makes it red instead: every clause carries exactly one WHEN_KINDS tag and only
  // its own keys, a `setting` names a row that exists, a `fact` is one the Settings window builds (read off
  // `_buildFacts`'s object literal), a `harness` is a declared table, a `channel` a slug; every `tier` ∈ TIERS.
  // Category membership (§44 above) is untouched: a hidden row still renders when searched or modified.
  {
    const { WHEN_KINDS, WHEN_FACTS, TIERS } = schemaMod;
    const factsBlock = (ui.match(/_buildFacts\(rerender\) \{[\s\S]*?const facts = \{([\s\S]*?)\n    \};/) || ['', ''])[1];
    const built = [...factsBlock.matchAll(/^\s+([a-zA-Z]+):/gm)].map((m) => m[1]);
    const OWN = { setting: ['setting', 'is', 'isNot'], fact: ['fact'], harness: ['harness'], channel: ['channel'] };
    const HSM = await import('../src/harness-settings.js');
    const harnesses = Object.keys((HSM.default || HSM).HARNESS_SETTINGS);
    const whenCensus = (schema) => {
      const errs = [];
      for (const [p, r] of Object.entries(schema)) {
        if (r.tier !== undefined && !TIERS.includes(r.tier)) errs.push(`${p}: tier ${JSON.stringify(r.tier)}`);
        if (r.when === undefined) continue;
        for (const c of Array.isArray(r.when) ? r.when : [r.when]) {
          const tags = c && typeof c === 'object' ? WHEN_KINDS.filter((k) => k in c) : [];
          if (tags.length !== 1) { errs.push(`${p}: a clause needs exactly one of ${WHEN_KINDS.join('|')} (${JSON.stringify(c)})`); continue; }
          const k = tags[0];
          const extra = Object.keys(c).filter((x) => !OWN[k].includes(x));
          if (extra.length) errs.push(`${p}: ${k} clause with foreign keys ${extra.join(',')}`);
          if (k === 'setting' && !schema[c.setting]) errs.push(`${p}: when.setting '${c.setting}' has no row`);
          if (k === 'setting' && 'is' in c && 'isNot' in c) errs.push(`${p}: is AND isNot`);
          if (k === 'fact' && (!WHEN_FACTS.includes(c.fact) || !built.includes(c.fact))) errs.push(`${p}: fact '${c.fact}' is not one the Settings window builds`);
          if (k === 'harness' && !harnesses.includes(c.harness)) errs.push(`${p}: harness '${c.harness}' has no table`);
          if (k === 'channel' && !/^[a-z][a-z0-9-]*$/.test(String(c.channel))) errs.push(`${p}: channel '${c.channel}' is not a vendor slug`);
        }
      }
      return errs;
    };
    const withWhen = Object.values(SETTINGS_SCHEMA).filter((r) => r.when).length;
    const advanced = Object.values(SETTINGS_SCHEMA).filter((r) => r.tier === 'advanced').length;
    ok(withWhen >= 30 && advanced >= 60 && WHEN_FACTS.every((f) => built.includes(f)), `44e scope is non-vacuous (${withWhen} rows carry a when, ${advanced} are advanced; the facts the window builds: ${built.join(', ')})`);
    const errs = whenCensus(SETTINGS_SCHEMA);
    ok(errs.length === 0, `44e every \`when\` clause is one closed tag over a real row / built fact / declared harness, every tier ∈ {${TIERS.join(',')}}${errs.length ? ' — ' + errs.slice(0, 4).join('; ') : ''}`);
    const planted = { ...SETTINGS_SCHEMA,
      'zz.a': { category: 'Chat', when: { weather: 'rain' } }, 'zz.b': { category: 'Chat', when: { setting: 'chat.nope', is: true } },
      'zz.c': { category: 'Chat', when: { fact: 'gpu' } }, 'zz.d': { category: 'Chat', tier: 'expert' }, 'zz.e': { category: 'Chat', when: [{ harness: 'zed' }] } };
    ok(whenCensus(planted).length === 5, 'NEGATIVE CONTROL: an unknown tag, a dangling setting key, an unbuilt fact, an unknown tier and an undeclared harness are each reported (this census can go red)');
    ok(/settingsViewModel\(SETTINGS_SCHEMA, \{ categories: SETTINGS_CATEGORIES/.test(ui), '44e the window draws the view model over the census list (the coupling the hiding rides on)');
    // B-df40 part 3: the per-VENDOR rows DERIVED from src/channel-settings.js carry their view fields — advanced, and
    // `when: { channel: <its vendor> }` — and `channel` on the entry names a vendor some table declares
    const CSM = await import('../src/channel-settings.js');
    const CST = CSM.default || CSM;
    const channelCensus = (schema, tables) => {
      const errs = [];
      for (const tbl of Object.values(tables)) for (const r of tbl.rows) {
        const p = CST.settingPath(r.key), e = schema[p];
        if (!e) { errs.push(`${p}: no derived row`); continue; }
        if (e.tier !== 'advanced') errs.push(`${p}: tier ${JSON.stringify(e.tier)}`);
        if (!(Array.isArray(e.when) ? e.when : [e.when]).some((c) => c && c.channel === tbl.vendor)) errs.push(`${p}: no when: { channel: '${tbl.vendor}' }`);
        if (e.channel !== tbl.vendor) errs.push(`${p}: channel ${JSON.stringify(e.channel)}`);
      }
      for (const [p, e] of Object.entries(schema)) if (e.channel !== undefined && !Object.prototype.hasOwnProperty.call(tables, e.channel)) errs.push(`${p}: channel '${e.channel}' has no table`);
      return errs;
    };
    const chErrs = channelCensus(SETTINGS_SCHEMA, CST.CHANNEL_SETTINGS);
    const derivedN = Object.values(SETTINGS_SCHEMA).filter((r) => r.channel).length;
    ok(derivedN === 6 && !chErrs.length && !whenCensus(SETTINGS_SCHEMA).length, `44e the per-vendor rows derived from src/channel-settings.js (${derivedN}) are advanced and carry \`when: { channel }\` of their own vendor${chErrs.length ? ' — ' + chErrs.join('; ') : ''}`);
    const lk = SETTINGS_SCHEMA['channels.budgetLarkPerMin'], gm = SETTINGS_SCHEMA['channels.gmailUnitsPerSec'];
    const plantedCh = { ...SETTINGS_SCHEMA, 'channels.budgetLarkPerMin': { ...lk, tier: undefined }, 'channels.gmailUnitsPerSec': { ...gm, when: { channel: 'lark' } }, 'channels.zz': { category: 'Channels', channel: 'teams' } };
    ok(channelCensus(plantedCh, CST.CHANNEL_SETTINGS).length === 3, 'NEGATIVE CONTROL: a derived row without its tier, one whose `when` names another vendor, and a row claiming an undeclared vendor are each reported');
  }
  ok(/for \(const cat of SETTINGS_CATEGORIES\)/.test(ui) && /grouped\[cat\]/.test(ui),
    'SettingsUI still RENDERS by iterating SETTINGS_CATEGORIES (the coupling this census stands for)');

  const rendered = renderedPaths(SETTINGS_SCHEMA, SETTINGS_CATEGORIES);
  const dropped = all.filter((p) => !rendered.includes(p));
  ok(dropped.length === 0,
    `every setting reaches a rendered section (${rendered.length}/${all.length}${dropped.length ? ' — DROPPED: ' + dropped.slice(0, 6).join(', ') : ''})`);
  const unlisted = cats.filter((c) => !SETTINGS_CATEGORIES.includes(c));
  ok(unlisted.length === 0, `every schema category is in SETTINGS_CATEGORIES (${unlisted.join(', ') || 'clean'})`);
  // A listed category with no rows is a nav entry that can never appear — the
  // dead-allowlist-row rule, applied to the other direction of the same list.
  const empty = SETTINGS_CATEGORIES.filter((c) => !cats.includes(c));
  ok(empty.length === 0, `no listed category is empty (${empty.join(', ') || 'clean'})`);

  // NEGATIVE CONTROL: the same code, over a schema carrying a category nobody
  // listed, must drop it — an assert that cannot go red is not an assert.
  const ncSchema = { ...SETTINGS_SCHEMA, 'zz.synthetic': { type: 'boolean', default: false, label: 'x', description: 'x', category: 'Nobody Listed This' } };
  const ncRendered = renderedPaths(ncSchema, SETTINGS_CATEGORIES);
  ok(!ncRendered.includes('zz.synthetic') && ncRendered.length === rendered.length,
    'NEGATIVE CONTROL: a row in an unlisted category is silently dropped by the render loop (this census can go red)');
  ok(renderedPaths(ncSchema, [...SETTINGS_CATEGORIES, 'Nobody Listed This']).includes('zz.synthetic'),
    'POSITIVE CONTROL: listing that category is the whole fix (one array entry)');
}

// 44d. THE SETTINGS REFERENCE IS GENERATED, AND A RETIRED KEY STAYS RETIRED (B-df40 part 1, lane settings-prune).
//     (i) docs/settings.md's "All Settings Reference" tables have ONE writer, scripts/gen-settings-reference.mjs, from
//     SETTINGS_SCHEMA: the hand-written tables had drifted (40+ rows missing, dead rows documented — the 2026-10 audit).
//     This leg regenerates in memory and fails when the file differs. docs/ sits OUTSIDE the partial-copy set the
//     browser suites build (§43's scar): a suite that copies src/ onto a HEAD checkout while a row change is still
//     UNCOMMITTED sees HEAD's tables — commit the regenerated file with the row (the §52 docs/agent census lives with
//     the same exposure). (ii) RETIRED_SETTING_KEYS (src/retired-settings.js, re-exported by the schema; the boot
//     migration 2026-10-settings-rows-retired strips their stored values) may never come back: no schema row, and no
//     quoted literal of one anywhere under src/ or in server.js — a `serverSetting('…')`, a `settings.get('…')`, a
//     listener list — outside the list's own file.
{
  const schemaMod = await import('../src/lib/settings-schema.js');
  const { SETTINGS_SCHEMA, RETIRED_SETTING_KEYS } = schemaMod;
  const gen = await import('./gen-settings-reference.mjs');
  const doc = read('docs/settings.md');
  let regenerated = null, genErr = null;
  try { regenerated = gen.renderReference(SETTINGS_SCHEMA, doc); } catch (e) { genErr = e.message; }
  const region = doc.slice(doc.indexOf(gen.REGION_BEGIN), doc.indexOf(gen.REGION_END));
  const keys = Object.keys(SETTINGS_SCHEMA);
  const undocumented = keys.filter((k) => !region.includes('| `' + k + '` |'));
  ok(!genErr && region.length > 1000 && undocumented.length === 0, `44d scope: docs/settings.md carries the generated region and every one of the ${keys.length} schema rows has its table line${genErr ? ' — ' + genErr : undocumented.length ? ' — missing: ' + undocumented.slice(0, 6).join(', ') : ''}`);
  ok(regenerated === doc, '44d the reference tables equal what scripts/gen-settings-reference.mjs renders from the schema' + (regenerated === doc ? '' : ' — STALE: run `node scripts/gen-settings-reference.mjs` and commit docs/settings.md with the row change'));
  // NEGATIVE CONTROLS: a planted stale line, and a schema row the file has never seen, must both read as stale.
  const lineOf = (k) => (doc.match(new RegExp('^\\| `' + k.replace(/\./g, '\\.') + '` \\|.*$', 'm')) || [''])[0];
  const victim = lineOf('chat.compactMode') || lineOf(keys[0]);
  const planted = doc.replace(victim, victim.replace(/\| \*\*/, '| **(stale) '));
  ok(victim && planted !== doc && gen.renderReference(SETTINGS_SCHEMA, planted) !== planted, 'NEGATIVE CONTROL: a hand-edited table line is what 44d reports (the gate can go red)');
  const grown = { ...SETTINGS_SCHEMA, 'zz.synthetic': { type: 'boolean', default: false, label: 'Synthetic', description: 'x', category: SETTINGS_SCHEMA[keys[0]].category } };
  ok(gen.renderReference(grown, doc) !== doc && gen.renderReference(grown, doc).includes('| `zz.synthetic` |'), 'NEGATIVE CONTROL: a new schema row the tables lack reads as stale, and the generator adds its line');
  ok(gen.renderReference(SETTINGS_SCHEMA, regenerated || doc) === (regenerated || doc), 'the generator is idempotent (a second run changes nothing)');

  // (ii) the retired-key census
  ok(Array.isArray(RETIRED_SETTING_KEYS) && RETIRED_SETTING_KEYS.length >= 7 && RETIRED_SETTING_KEYS.includes('agents.vibespaceChannel'), `44d the schema re-exports RETIRED_SETTING_KEYS (${(RETIRED_SETTING_KEYS || []).length} keys)`);
  const asRow = (schema) => (RETIRED_SETTING_KEYS || []).filter((k) => Object.prototype.hasOwnProperty.call(schema, k));
  ok(asRow(SETTINGS_SCHEMA).length === 0, `44d no retired key is a schema row${asRow(SETTINGS_SCHEMA).length ? ' — back: ' + asRow(SETTINGS_SCHEMA).join(', ') : ''}`);
  const quoted = (texts) => {
    const hits = [];
    for (const [f, text] of texts) for (const k of RETIRED_SETTING_KEYS || []) {
      if (new RegExp('[\'"`]' + k.replace(/\./g, '\\.') + '[\'"`]').test(text)) hits.push(f + ': ' + k);
    }
    return hits;
  };
  const srcTexts = [['server.js', read('server.js')]];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const p = dir + '/' + e.name;
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs|cjs)$/.test(e.name) && p !== 'src/retired-settings.js') srcTexts.push([p, read(p)]);
    }
  })('src');
  const reads = quoted(srcTexts);
  ok(srcTexts.length > 300 && reads.length === 0, `44d no retired key is read or named in quotes under src/ or server.js (${srcTexts.length} files)${reads.length ? ' — ' + reads.slice(0, 6).join('; ') : ''}`);
  ok(asRow({ ...SETTINGS_SCHEMA, 'agents.vibespaceChannel': { type: 'boolean', default: false, label: 'x', description: 'x', category: 'Integration' } }).length === 1
    && quoted([['src/planted.js', "if (serverSetting('agents.vibespaceChannel') === true) spawnTheSocket();"]]).length === 1
    && quoted([['src/planted.js', "settings?.get(\"sessionCard.detailTruncation\") ?? 'left'"]]).length === 1,
    'NEGATIVE CONTROL: a re-added retired row and a planted serverSetting / settings.get read of a retired key are what 44d reports');
}

// 45. THE PER-ITEM SPAWN CENSUS (2026-09-09, userW's pod: 27 of 27 session
//     creates and kills followed by an 11-17 s event-loop block). A spawn is
//     paid by the PARENT — fork(2) copies the caller's page tables on the
//     calling thread (measured on this box: 1.8 ms at 45 MB RSS, 18.8 ms at
//     543 MB, 67-73 ms at 1.5 GB) — and a loop over N sessions lines N of them
//     up inside ONE tick, whether it awaits or not. The rule is therefore not
//     "few spawns" but "NO SPAWN PER ITEM" on anything a poll, a create or a
//     kill can reach: those facts come from /proc through THE process reader
//     (src/cli-identity.js), and the survivors are one-per-sweep or no-/proc
//     fallbacks, each named below WITH its reason.
//
//     ROUND 2 — THE FILE SET IS DERIVED, NOT TYPED. Round 1 wrote the three
//     sweep modules into a literal array, and the very next reader of the very
//     same fact — `refreshWebuiPids()` in server.js, one SYNCHRONOUS
//     `pgrep -P <childPid>` per live session, in-band on every kill and 3 s
//     after every create — was invisible to it: measured 9.16 s of blocked
//     loop for 61 sessions at 1.5 GB RSS, for the identical 244 pids /proc
//     hands over in 1.6 ms. A hand-written file list is the tool this class has
//     already defeated twice here (test-writer-sweep §17 r7 is the first), so
//     both halves below derive their scope and PRINT what they walked:
//
//       (a) THE PID-QUESTION CENSUS — repo-wide. Every tracked JS file the
//           server or the daemon runs, every spawn whose argv names a
//           process-table tool (`ps`/`pgrep`/`pidof`/`pstree`/`lsof`/`fuser`).
//           That family IS what this incident is made of ("who is this pid's
//           parent", "what did it fork", "who holds this file"), it is small
//           enough to reason about one row at a time, and it is the half that
//           would have caught server.js.
//       (b) THE SWEEP-MODULE CENSUS — every spawn, in the modules that answer
//           the sweep's own named facts. The file set is resolved BY LOOKING UP
//           WHERE EACH FACT IS DEFINED, so moving a function keeps its
//           enforcement and a fact that grew a second definition goes red.
//           This half is what catches a per-session `git` or `stat` — a fork
//           that (a) would never see.
//
//     WHAT THESE TWO CANNOT SEE, stated as narrowly as the code allows (round 3
//     had to correct this sentence once already, so it is worth being exact):
//       · (a) matches a call whose FIRST ARGUMENT is a process-table tool
//         spelled as a LITERAL, whatever the callee is named. A tool name held
//         in a VARIABLE (`execFile(cmd, ['-p', pid])`) is invisible to it.
//       · (b) is blind to a module that neither defines a sweep fact nor is
//         one — a per-session `execFile('git', …)` in src/ws-handler.js still
//         passes both halves.
//     Both gaps are covered from the other side by the FILE-BLIND consequence
//     census in scripts/test-discovery-spawn.mjs, which counts every
//     child_process entry point the REAL sweep, the REAL refreshWebuiPids and
//     the REAL kill-path socket lookup take, wherever the fork was written.
{
  const GIT_ENV45 = gitEnvFrom(process.env);
  const lsFiles = spawnSync('git', ['-C', REPO, 'ls-files', '-z'],
    { encoding: 'utf-8', env: GIT_ENV45, maxBuffer: 64 * 1024 * 1024 });
  // SKIP QUOTES GIT (§42 round 6): a self-invented reason turns "this census
  // was switched off" into "there was nothing to look at". Half (b) still runs
  // — it reads named files and needs no index.
  const gitOk = !lsFiles.error && lsFiles.status === 0 && lsFiles.stdout;
  const gitWhy45 = lsFiles.error ? `spawn failed: ${lsFiles.error.code || lsFiles.error.message}`
    : `exit ${lsFiles.status}: ${String(lsFiles.stderr || '').trim().replace(/\s+/g, ' ').slice(0, 160) || '(no stderr)'}`;
  // SCOPE: EVERY tracked JS except two named exclusions — over-inclusion only
  // widens enforcement, a false negative IS the defect (test-writer-sweep §17
  // r7). `scripts/` is out because the suites deliberately SPELL the forbidden
  // shapes as controls (this very block holds two `execFileSync('ps', …)`
  // literals) and because no product path requires anything from there — which
  // is ASSERTED below rather than assumed. `public/` is out because it is the
  // built bundle: a tracked bundle.js would carry cli-identity's own allowlisted
  // `ps` calls under a second filename and redden the build for a legitimate
  // act. `docs/` is IN (2 tracked files, measured clean) — the earlier "it's
  // prose" exclusion was an unaudited sample, and docs/examples/hello-plugin is
  // code somebody runs. The listing is the git INDEX, never a readdir, because
  // data/bin holds a 64 MB untracked `rclone` (the §42 round-5 lesson, same
  // directory).
  const inScope = (f) => /\.(js|mjs|cjs)$/.test(f)
    && !f.startsWith('scripts/') && !f.startsWith('public/');
  const tracked = gitOk
    ? (lsFiles.stdout || '').split('\0').filter(Boolean).filter(inScope)
    : [];

  // Every way this repo STARTS A CHILD PROCESS, in JS. `exec` is the awkward
  // one: `re.exec(str)` is a regex match, not a fork, so the bare form is taken
  // only when it is NOT a method call, plus the dotted spellings of
  // child_process itself. A DECLARATION is not a call (`function execFileP(cmd,
  // args…)`), so it is blanked first.
  const SPAWN_CALL = /\b(?:execFileSync|execFileP|execFile|execSync|spawnSync|spawn|execImpl)\s*\(|(?<![.\w$])exec\s*\(|\b(?:cp|childProcess|child_process|proc)\.exec\s*\(/;
  // A PROMISIFIED ALIAS IS STILL A FORK (round 3). SPAWN_CALL is a list of
  // CALLEE NAMES, so `execFileAsync(` (src/ws-handler.js's own idiom, handed to
  // ws-create through ctx) and `sh(` (src/incident.js) match none of them —
  // `execFile` needs a `(` immediately after it. Two live process-table spawns
  // were therefore absent from the census's own printed inventory, and a
  // per-session `pgrep -P` loop spelled that way passed EVERY gate on the kill
  // path, i.e. the incident's own trigger. The signal this census claims to
  // census is the ARGV, so derive from the TOOL: a call whose FIRST argument is
  // a process-table tool name is a site whatever the callee is called. The
  // trailing `,` keeps `_trimGapDom('top')`-shaped calls out, and `top` is
  // deliberately NOT in this list (a bare `snap('top')` is not a fork) — the
  // union with SPAWN_CALL still covers `execFile('top', …)`. MEASURED over the
  // same 243 tracked files: 16 sites → 18, zero false positives.
  const TOOL_FIRST = /[A-Za-z_$][\w$]*\s*\(\s*['"`](?:ps|pgrep|pkill|pidof|pstree|lsof|fuser)['"`]\s*,/;
  const PID_TOOL = /['"`](?:ps|pgrep|pkill|pidof|pstree|lsof|fuser|top)['"`]/;
  const spawnScan = (l) => String(l).replace(/\bfunction\s+\w+\s*\(/g, 'function DECLARED(');
  const isSpawnComment = (l) => /^\s*(\/\/|\*|\/\*|#)/.test(l);
  // The tool name usually sits on the spawn's own line; a wrapped call puts it
  // on the next one or two. Over-inclusion is the safe direction here — it can
  // only demand one more reason row.
  const spawnSites = (text, { pidOnly }) => {
    const lines = String(text).split('\n');
    const out = [];
    lines.forEach((line, i) => {
      const scanned = spawnScan(line);
      if (isSpawnComment(line) || !(SPAWN_CALL.test(scanned) || TOOL_FIRST.test(scanned))) return;
      if (pidOnly && !PID_TOOL.test(lines.slice(i, i + 3).filter((l) => !isSpawnComment(l)).join('\n'))) return;
      out.push({ n: i + 1, line });
    });
    return out;
  };

  // ── (a) THE PID-QUESTION CENSUS ────────────────────────────────────────────
  const PID_ALLOWED = [
    { file: 'src/cli-identity.js', needle: "execFileSync('ps', ['-p', String(pid), '-o', 'args=']", why: 'NO-/proc FALLBACK ONLY (procArgv, rung 2 of the identity rule).' },
    { file: 'src/cli-identity.js', needle: "execImpl('ps', ['-p', String(pid), '-o', 'uid=,args=']", why: 'NO-/proc FALLBACK ONLY (readPsIdentity, per-pid memo) — the {uid, argv} value read the signalling callers share.' },
    { file: 'src/cli-identity.js', needle: "execImpl('ps', ['-eo', 'pid=,ppid=']", why: 'NO-/proc FALLBACK ONLY, and ONE PER SWEEP for the WHOLE table (parentIndex, memoised) — this is the shape that REPLACED one `ps` per pid. Never reached where /proc exists.' },
    { file: 'src/cli-identity.js', needle: "execFile('pgrep', ['-f', String(needle)]", why: 'NO-/proc FALLBACK ONLY (pidsMatchingCmdline) — ONE per question for the WHOLE table, never one per candidate. Where /proc exists the rung above it reads every `/proc/<pid>/cmdline` into ONE reused buffer, which is why the kill path now starts no child process at all.' },
    { file: 'src/session-store.js', needle: "execFileP('ps', ['-p', String(pid), '-o', 'comm=']", why: 'NO-/proc FALLBACK ONLY (isProcessClaudeAsync), reached from isLockClaude when a lock carries no numeric procStart AND there is no procfs. On a procfs machine the rung above it is `isCliProcess`, pure file reads.' },
    { file: 'src/discovery-facts.js', needle: "spawnSync('lsof', ['-Fpn', '+D', root]", why: 'NO-/proc FALLBACK ONLY (macOS/BSD codex liveness), ONE per scan of the whole sessions tree.' },
    { file: 'src/agentd/agentd.js', needle: "spawnSync('ps', ['-p', String(pid), '-o', 'lstart=']", why: 'NO-/proc FALLBACK ONLY (pidStartTime) — /proc/<pid>/stat field 22 is the rung above it. Asked when a pipe session is adopted, not per poll.' },
    { file: 'src/agentd/agentd.js', needle: "execFileSync('ps', ['-p', String(pid), '-o', 'command=']", why: 'NO-/proc FALLBACK ONLY (acquireSingleton), and ONCE per daemon start — /proc/<pid>/cmdline is the rung above it.' },
    { file: 'src/plugins.js', needle: "execFileSync('pgrep', ['-x', 'tailscaled']", why: 'ONE per tailscale status read (a plugin card), never per session; the loop under it reads /proc cmdlines, not more spawns.' },
    { file: 'src/server/boot-restore.js', needle: "execFileSync('fuser', [path.join(SOCKETS_DIR, sockFile)]", why: 'BOOT ONLY (restoreSessions, once per surviving socket, before this server serves anybody) — "is this dtach socket still owned" has no /proc rung that does not re-implement fuser. Out of scope on purpose: the incident is create/kill/poll, and a boot pays this once.' },
    { file: 'src/server/boot-restore.js', needle: "execFileSync('fuser', [socketPath]", why: 'BOOT ONLY (same sweep, the per-socket branch).' },
    { file: 'src/server/boot-restore.js', needle: "execFileSync('pgrep', ['-f', socketPath], { encoding: 'utf-8', timeout: 2000 });", why: 'BOOT ONLY — the second rung of the same liveness question when `fuser` is absent.' },
    { file: 'src/server/boot-restore.js', needle: "for (const p of execFileSync('pgrep', ['-f', socketPath]", why: 'BOOT ONLY, and only for a socket already judged a DUPLICATE husk that must be retired — a handful per boot at most.' },
    { file: 'src/sysinfo.js', needle: "execFile('ps', ['aux', '--sort=-rss']", why: 'ONE per sysinfo read (topProcs), never per item; PS_MAX_BUFFER governs its size.' },
    { file: 'src/sysinfo.js', needle: "execFile('ps', ['aux']", why: 'ONE per sysinfo read — the fallback for a `ps` with no --sort.' },
    { file: 'src/sysinfo.js', needle: "execFile('ps', ['axo', PS_COLUMNS]", why: 'ONE per process-list read (listProcs), the System panel table.' },
    { file: 'src/transcript-service.js', needle: "execFileSync('fuser', [fp]", why: 'ONE per human-triggered `rescue` — the two-writer refusal. Not on any poll.' },
    { file: 'src/incident.js', needle: "sh('ps', ['-eo', 'pid,ppid,lstart,etime,rss,stat,args']", why: 'ONE per HUMAN-TRIGGERED incident capture ("Report a problem"), and the WHOLE-TABLE form — the frozen scene is exactly what a human needs and /proc would only re-implement `ps`. Not on any poll, create or kill. Spelled through a promisified alias, which is why TOOL_FIRST exists.' },
  ];
  if (!gitOk) {
    ok(true, `(a) PID-QUESTION CENSUS SKIPPED — \`git -C <repo> ls-files\` could not answer here: ${gitWhy45}`);
  } else {
    const pidWalked = [], pidStray = [], pidHit = new Set();
    for (const f of tracked) {
      for (const s of spawnSites(read(f), { pidOnly: true })) {
        pidWalked.push(`${f}:${s.n}`);
        const a = PID_ALLOWED.find((x) => x.file === f && s.line.includes(x.needle));
        if (a) pidHit.add(a.needle); else pidStray.push(`${f}:${s.n}: ${s.line.trim().slice(0, 110)}`);
      }
    }
    console.log(`  · (a) pid-question census walked ${tracked.length} tracked files, ${pidWalked.length} sites: ${pidWalked.join(', ')}`);
    ok(tracked.length > 100 && pidWalked.length >= 10,
      `(a) scope is non-vacuous (${tracked.length} files, ${pidWalked.length} process-table spawns)`);
    // SCOPE SELF-PROOF: an assert that cannot name the files it exists for is
    // a census of nothing. These four are the incident's own modules.
    for (const must of ['server.js', 'src/session-store.js', 'src/cli-identity.js', 'src/server/boot-restore.js']) {
      ok(tracked.includes(must), `(a) scope really covers ${must}`);
    }
    ok(!pidStray.length, `(a) every process-table spawn is allowlisted WITH a reason (${pidStray.slice(0, 4).join(' | ') || 'clean'})`);
    const pidDead = PID_ALLOWED.filter((a) => !pidHit.has(a.needle)).map((a) => `${a.file}:${a.needle}`);
    ok(!pidDead.length, `(a) no dead allowlist rows (${pidDead.join(' | ') || 'all live'})`);
    // THE FIX ITSELF, asserted where it was made: server.js asks the reader.
    const srv = read('server.js');
    const srvCode = srv.split('\n').filter((l) => !isSpawnComment(l)).join('\n');
    ok(!/pgrep/.test(srvCode), '(a) no `pgrep` survives in server.js code (refreshWebuiPids was the last one)');
    ok(/readChildPids\(meta\.childPid\)/.test(srvCode) && /require\('\.\/src\/cli-identity'\)/.test(srvCode),
      '(a) refreshWebuiPids asks THE process reader for the wrapper\'s children');
    // …and `scripts/` really is out of the product's path, which is the only
    // thing that makes excluding it from the scope honest.
    const productRequiresScripts = tracked.filter((f) => /require\(['"][^'"]*\/scripts\//.test(read(f)));
    ok(!productRequiresScripts.length, `(a) no in-scope file requires anything from scripts/ (${productRequiresScripts.join(', ') || 'clean'})`);
  }

  // ── (b) THE SWEEP-MODULE CENSUS ────────────────────────────────────────────
  // The facts a poll / create / kill asks for, and therefore the modules whose
  // EVERY spawn needs a reason. Resolved by definition lookup: a fact that
  // moved keeps its enforcement, a fact that grew a twin or vanished goes red.
  const SWEEP_FACTS = ['discoverClaudeSessions', 'refreshWebuiPids', 'readChildPids', 'readPpid',
    'findTmuxTargetAsync', 'getTmuxPaneMapAsync', 'listOpenCodexRolloutPaths'];
  const defOwner = (name, pool) => {
    const def = new RegExp(`^(?:async\\s+)?function\\s+${name}\\s*\\(|^\\s*(?:const|let)\\s+${name}\\s*=`, 'm');
    return pool.filter((f) => def.test(read(f)));
  };
  // Where git could not answer, fall back to the modules this repo has always
  // held these facts in — SAID, not silently.
  const defPool = gitOk ? tracked
    : ['server.js', 'src/session-store.js', 'src/cli-identity.js', 'src/discovery-facts.js'];
  const sweepFiles = new Set();
  const ambiguous = [];
  for (const name of SWEEP_FACTS) {
    const owners = defOwner(name, defPool);
    if (owners.length !== 1) ambiguous.push(`${name} → ${JSON.stringify(owners)}`);
    for (const o of owners) sweepFiles.add(o);
  }
  ok(!ambiguous.length,
    `(b) every sweep fact resolves to exactly ONE defining module (${ambiguous.join(' | ') || 'clean'})`);
  const SWEEP_ALLOWED = [
    { file: 'src/session-store.js', needle: 'execFile(cmd, args,', why: 'THE async exec primitive itself, the body of execFileP. It starts nothing on its own — this census is about its CALLERS.' },
    { file: 'src/session-store.js', needle: "execFileP('tmux', ['list-panes'", why: 'ONE PER SWEEP, and only where a `tmux` binary is on PATH (statted, never `which`); the map is cached for TMUX_MAP_TTL_MS so a create/kill burst shares it. This is the one child process a sweep may start.' },
    { file: 'src/session-store.js', needle: "execFileP('ps', ['-p', String(pid), '-o', 'comm=']", why: 'NO-/proc FALLBACK ONLY (isProcessClaudeAsync) — see (a).' },
    { file: 'src/cli-identity.js', needle: "execFileSync('ps', ['-p', String(pid), '-o', 'args=']", why: 'NO-/proc FALLBACK ONLY (procArgv) — see (a).' },
    { file: 'src/cli-identity.js', needle: "execImpl('ps', ['-p', String(pid), '-o', 'uid=,args=']", why: 'NO-/proc FALLBACK ONLY (readPsIdentity) — see (a).' },
    { file: 'src/cli-identity.js', needle: "execImpl('ps', ['-eo', 'pid=,ppid=']", why: 'NO-/proc FALLBACK ONLY, ONE per sweep for the whole table — see (a).' },
    { file: 'src/cli-identity.js', needle: "execFile('pgrep', ['-f', String(needle)]", why: 'NO-/proc FALLBACK ONLY (pidsMatchingCmdline), ONE per question — see (a).' },
    { file: 'src/discovery-facts.js', needle: "spawnSync('lsof', ['-Fpn', '+D', root]", why: 'NO-/proc FALLBACK ONLY (macOS/BSD codex liveness), ONE per scan — see (a).' },
    // (lane cluster-presets P6: server.js's three BOOT-ONLY spawns — the auto-update's
    // git pull / npm install / npm run build — moved to src/server/auto-update.js,
    // which defines no sweep fact; their rows went with them.)
  ];
  const swWalked = [], swStray = [], swHit = new Set();
  for (const f of [...sweepFiles].sort()) {
    const text = read(f);
    ok(text.length > 0, `(b) census can read ${f}`);
    for (const s of spawnSites(text, { pidOnly: false })) {
      swWalked.push(`${f}:${s.n}`);
      const a = SWEEP_ALLOWED.find((x) => x.file === f && s.line.includes(x.needle));
      if (a) swHit.add(a.needle); else swStray.push(`${f}:${s.n}: ${s.line.trim().slice(0, 110)}`);
    }
  }
  console.log(`  · (b) sweep-module census walked ${[...sweepFiles].sort().join(', ')} — ${swWalked.length} sites: ${swWalked.join(', ')}`);
  ok(sweepFiles.size >= 4 && swWalked.length >= SWEEP_ALLOWED.length,
    `(b) scope is non-vacuous (${sweepFiles.size} modules, ${swWalked.length} spawn sites)`);
  ok(sweepFiles.has('server.js'),
    '(b) server.js is IN SCOPE because it defines refreshWebuiPids — the reader round 1 could not see');
  ok(!swStray.length, `(b) every spawn in a sweep module is allowlisted WITH a reason (${swStray.slice(0, 4).join(' | ') || 'clean'})`);
  const swDead = SWEEP_ALLOWED.filter((a) => !swHit.has(a.needle)).map((a) => `${a.file}:${a.needle}`);
  ok(!swDead.length, `(b) no dead allowlist rows (${swDead.join(' | ') || 'all live'})`);

  // ── NEGATIVE CONTROLS, over the SAME scanner, without touching the tree ────
  // ① the two retired per-item shapes, verbatim, must be caught by (a);
  // ② the exact mutation that proved round 1 blind — a per-session
  //    `ps -p … -o ppid=` inside refreshWebuiPids — must be caught in
  //    server.js's real text with the line spliced in;
  // ③ a per-session `git` spawn, which (a) cannot see by construction, must be
  //    caught by (b) — the reason (b) exists;
  // ④ the same lines behind a `//` are prose, not offenders.
  const retired = [
    "    const out = await execFileP('pgrep', ['-P', String(childPid)], { timeout: 2000 });",
    "  const out = await execFileP('ps', ['-p', String(pid), '-o', 'ppid='], { timeout: 2000 });",
    "          const ch = execFileSync('pgrep', ['-P', String(meta.childPid)], { encoding: 'utf-8', timeout: 2000 }).trim();",
  ];
  const caughtByA = retired.filter((line) => spawnSites(line, { pidOnly: true }).length === 1);
  ok(caughtByA.length === 3,
    `NEGATIVE CONTROL ①②: the retired per-lock \`ps -o ppid=\`, the retired per-session \`pgrep -P\` and the shipped server.js spelling are all caught by (a) (${caughtByA.length}/3)`);
  // Both splices are measured as a DELTA against the tree as it stands, so the
  // control describes what IT added and nothing else — on a tree somebody has
  // already broken, an absolute count would go red for a reason that is not
  // this control's subject and would say the wrong thing about why.
  const ANCHOR45 = 'for (const p of readChildPids(meta.childPid)) webuiPids.add(p);';
  const srvText = read('server.js');
  ok(srvText.includes(ANCHOR45), 'NEGATIVE CONTROL setup: the splice anchor exists in server.js (a control that cannot be built proves nothing)');
  const strayCount = (text, pidOnly, allow) => spawnSites(text, { pidOnly })
    .filter((s) => !allow.some((x) => x.file === 'server.js' && s.line.includes(x.needle))).length;
  const splice = (line) => srvText.replace(ANCHOR45, `${ANCHOR45}\n        ${line}`);
  const psMut = splice("try { execFileSync('ps', ['-p', String(meta.pid), '-o', 'ppid=']); } catch {}");
  const dA = strayCount(psMut, true, PID_ALLOWED) - strayCount(srvText, true, PID_ALLOWED);
  const dB = strayCount(psMut, false, SWEEP_ALLOWED) - strayCount(srvText, false, SWEEP_ALLOWED);
  ok(dA === 1 && dB === 1,
    `NEGATIVE CONTROL ②: the exact mutation that left round 1's census GREEN is now a stray in BOTH halves (a:+${dA}, b:+${dB})`);
  const gitMut = splice("try { execFileSync('git', ['-C', meta.cwd, 'status']); } catch {}");
  const gA = strayCount(gitMut, true, PID_ALLOWED) - strayCount(srvText, true, PID_ALLOWED);
  const gB = strayCount(gitMut, false, SWEEP_ALLOWED) - strayCount(srvText, false, SWEEP_ALLOWED);
  ok(gA === 0 && gB === 1,
    `NEGATIVE CONTROL ③: a per-session \`git\` spawn is invisible to (a) (+${gA}) and a stray in (b) (+${gB}) — the reason both halves exist`);
  ok(retired.every((l) => isSpawnComment('  // ' + l.trim())),
    'NEGATIVE CONTROL ④: the same lines behind a `//` are prose, not offenders');
  // ⑤ THE ROUND-3 SHAPE: the retired per-session `pgrep -P`, spelled through a
  //    PROMISIFIED ALIAS. Round 2's census matched callee NAMES, so this line
  //    was invisible to BOTH halves — verified on the real tree by splicing it
  //    into ws-handler.js's kill case, where `node scripts/test-architecture.mjs`,
  //    `test-discovery-spawn.mjs` and `test-ws-contract.mjs` all answered
  //    ALL PASS. It is driven twice: as a bare line (the rule) and spliced into
  //    ws-handler's REAL text at the incident's own trigger (the consequence).
  const aliasRetired = "                const out = await execFileAsync('pgrep', ['-P', String(ls._childPid)], { timeout: 2000 });";
  ok(spawnSites(aliasRetired, { pidOnly: true }).length === 1,
    'NEGATIVE CONTROL ⑤: the retired per-session `pgrep -P` spelled through a promisified ALIAS is a site (round 3: it was invisible, and that is how it re-entered the kill path)');
  const WS_ANCHOR = 'refreshWebuiPids();';
  const wsText = read('src/ws-handler.js');
  ok(wsText.includes(WS_ANCHOR),
    'NEGATIVE CONTROL ⑤ setup: the splice anchor exists in src/ws-handler.js\'s kill case (a control that cannot be built proves nothing)');
  const wsStray = (text) => spawnSites(text, { pidOnly: true })
    .filter((s) => !PID_ALLOWED.some((x) => x.file === 'src/ws-handler.js' && s.line.includes(x.needle))).length;
  const wsMut = wsText.replace(WS_ANCHOR, `${WS_ANCHOR}\n${aliasRetired}`);
  const wA = wsStray(wsMut) - wsStray(wsText);
  ok(wA === 1,
    `NEGATIVE CONTROL ⑤: spliced into ws-handler's real kill case it is a stray in (a) (+${wA}) — the exact mutation round 2's census answered ALL PASS on`);
  // …and the FIX itself, asserted where it was made: the kill path asks THE
  // process reader, so ws-handler carries no process-table spawn of its own.
  ok(!wsStray(wsText) && /pidsMatchingCmdline\(session\.socketPath\)/.test(wsText)
    && /require\('\.\/cli-identity'\)/.test(wsText),
    '(a) the kill path asks THE process reader (`pidsMatchingCmdline`) and ws-handler starts no process-table child of its own');
}

// 46. THE LITERAL HARNESS-ID CENSUS (docs/design-harness-settings.zh.md §5,
//     2026-09-20). A harness setting is read on the server through the
//     DESCRIPTOR — `harnessSetting(session.backend, key)` — never through a
//     spelled harness id: `serverSetting('claude.brief')` was the shape that
//     kept every decision point a claude special case (~18 sites), and the
//     "minimal increment" design the reviewers struck down merely moved the
//     literal from the key into the argument (`hsetting('codex', …)`), which a
//     key-only grep would have blessed. Both spellings are censused, over every
//     server-tier file (server.js + src/** minus the client), with a synthetic
//     offender for each so the census can go red. The one generic feature
//     under a legacy `claude.` key (auto-resume's instance default) reads it
//     through GENERIC_LEGACY_KEYS — a NAME, not a literal.
{
  const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(f)) walk(f, out); } else if (/\.js$/.test(e.name)) out.push(f); } return out; };
  const files = ['server.js', ...walk(path.join(REPO, 'src')).map(rel).filter((p) => !p.startsWith('src/lib/') && p !== 'src/client.js')];
  const KEY_LITERAL = /serverSetting\(\s*['"](?:claude|codex|opencode)\./g;
  const ARG_LITERAL = /harness(?:Setting|Declares|SpawnSettings)\(\s*['"](?:claude|codex|opencode)['"]/g;
  const hits = [];
  for (const f of files) {
    const s = read(f);
    for (const re of [KEY_LITERAL, ARG_LITERAL]) for (const m of s.matchAll(re)) hits.push(`${f}: ${m[0]}`);
  }
  ok(files.length > 80 && files.includes('src/server/usage-pool-engine.js') && files.includes('src/ws-create.js') && files.includes('src/server/auto-resume.js'),
    `46 scope is non-vacuous and covers the deciding files (${files.length} server-tier files)`);
  ok(hits.length === 0, `no server-tier file spells a harness id into a settings read (serverSetting('<id>.…') / harnessSetting('<id>', …))${hits.length ? ' — ' + hits.slice(0, 5).join(' ; ') : ''}`);
  const nc1 = "  brief: (() => { try { return serverSetting('claude.brief') === true; } catch { return false; } })(),";
  const nc2 = "  if (harnessSetting('codex', 'limitResetCredit') !== 'auto') return false;";
  ok([...nc1.matchAll(KEY_LITERAL)].length === 1 && [...nc2.matchAll(ARG_LITERAL)].length === 1,
    'NEGATIVE CONTROL: the old key-literal shape AND the argument-literal shape are both offenders (this census can go red)');
  ok([...`serverSetting(GENERIC_LEGACY_KEYS.autoResumeOnLimit)`.matchAll(KEY_LITERAL)].length === 0 && /GENERIC_LEGACY_KEYS\.autoResumeOnLimit/.test(read('src/server/auto-resume.js')),
    'the generic auto-resume default is read by NAME (GENERIC_LEGACY_KEYS), which the census does not count');
  // 46b. A CATEGORY LITERAL THE CATEGORY LIST CANNOT MATCH (the 2.369.120 side
  //      finding): `category: 'Integration'` beside `t('Integration')` in the
  //      list renders into a bucket nobody lists under zh/ja — §44 runs in node
  //      with no language and cannot see it, so the SPELLING is pinned here.
  const schema = read('src/lib/settings-schema.js');
  const bare = [...schema.matchAll(/category:\s*'[^']+'/g)].map((m) => m[0]);
  ok(bare.length === 0, `every schema category is spelled t('…') (bare literals: ${bare.join(', ') || 'none'})`);
  ok([..."    type: 'boolean', default: true, category: 'Integration',".matchAll(/category:\s*'[^']+'/g)].length === 1, 'NEGATIVE CONTROL: a bare category literal is what 46b reports');
  // 46c. THE HARNESS SECTIONS ARE DERIVED, NOT HAND-WRITTEN: no `'claude.`/
  //      `'codex.`/`'opencode.` key literal remains in the schema except the
  //      ONE generic legacy row (auto-resume, category Spending since 2.369.202).
  const literalRows = [...schema.matchAll(/^  '(claude|codex|opencode)\.[a-zA-Z]+':/gm)].map((m) => m[0].trim());
  ok(literalRows.length === 1 && literalRows[0] === "'claude.autoResumeOnLimit':", `the schema hand-writes exactly ONE harness-prefixed row — the generic legacy auto-resume default (found: ${literalRows.join(', ')})`);
}

// 47. THE ONBOARDED-FLAG CENSUS (2.369.125 r7, the Actions mirror on cc89d748).
//     The first-run Welcome wizard is skipped when localStorage 'vs-onboarded'
//     is set OR when the machine already has sessions (app.js _checkOnboarding)
//     — so a chrome suite that never sets the flag is green on every developer
//     box and red on the runner (empty ~/.claude): the wizard's modal covered
//     the chrome under test and its capture-phase Escape ate the first Esc
//     (test-gear-menu's two Esc legs; the three suites red on every mirror run
//     since 2.369.75 sat under the same modal). ONE source string lives in
//     scripts/scratch.mjs; every suite passes it to
//     Page.addScriptToEvaluateOnNewDocument BEFORE each Page.navigate, on the
//     same receiver. A suite that deliberately exercises the wizard declares
//     `// onboarding-under-test` and is exempt; a suite whose `Page.navigate`
//     literals are CDP MESSAGES driven through the agent-browser mediation
//     proxy (P6 — a real chrome, never VibeSpace's page, so there is no wizard
//     to skip) declares `// cdp-protocol-under-test` and is exempt likewise.
{
  const scope = fs.readdirSync('scripts').filter((f) => /^test-.*\.mjs$/.test(f)).map((f) => 'scripts/' + f).filter((f) => fs.readFileSync(f, 'utf8').includes("'Page.navigate'"));
  const judge = (s) => {
    if (s.includes('// onboarding-under-test') || s.includes('// cdp-protocol-under-test')) return null;
    if (!/import\s*\{[^}]*\bONBOARDED_SOURCE\b[^}]*\}\s*from\s*'\.\/scratch\.mjs'/.test(s)) return 'no ONBOARDED_SOURCE import from ./scratch.mjs';
    const navs = [...s.matchAll(/'Page\.navigate'/g)].map((m) => m.index);
    const sets = [...s.matchAll(/addScriptToEvaluateOnNewDocument'\s*,\s*\{\s*source:\s*ONBOARDED_SOURCE\s*\}/g)].map((m) => m.index);
    for (const at of navs) if (!sets.some((i) => i < at)) return 'a Page.navigate with no ONBOARDED_SOURCE addScript before it';
    return null;
  };
  const bad = scope.map((f) => [f, judge(fs.readFileSync(f, 'utf8'))]).filter(([, why]) => why);
  ok(scope.length >= 30, `§47 census scope is non-vacuous (${scope.length} chrome suites navigate a page)`);
  ok(bad.length === 0, `every chrome suite pre-sets 'vs-onboarded' through ONBOARDED_SOURCE before every Page.navigate${bad.length ? ' — ' + bad.map(([f, w]) => f + ': ' + w).join('; ') : ''}`);
  ok(judge("import { scratch } from './scratch.mjs';\nawait cdp('Page.navigate', { url: U });") !== null && judge("import { scratch, ONBOARDED_SOURCE } from './scratch.mjs';\nawait cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: U });") === null && judge("// onboarding-under-test\nawait cdp('Page.navigate', { url: U });") === null, 'NEGATIVE CONTROL: a bare navigate is caught, the shared idiom passes, the declared exemption passes');
}


// 49. THE WAKE-DOOR CENSUS (r3 of agent groups, 2026-09-23). With auth OFF the
//     owner's routes are reachable by any local caller, so every owner route
//     that can start a BILLED turn (a group post/create/invite, and the
//     Channels engine's propose/approve/send — the built-in Agents adapter's
//     send IS a wake through the delivery ladder) must hand its door BOTH the
//     consent echo and the pacer. r2 fenced the group routes and left three
//     side doors beside them; this census reads every router.post/put in
//     src/routes/channels.js and fails a wake-capable one that does not.
{
  const src = fs.readFileSync('src/routes/channels.js', 'utf8');
  const blocks = (text) => text.split(/\n(?=router\.(?:post|put|get|delete)\()/).filter((b) => /^router\.(post|put)\(/.test(b));
  const WAKES = /engine\(\)\.(propose|approve)\(|\bge\.(post|create|invite)\(/;
  const judge = (text) => blocks(text).filter((b) => WAKES.test(b)).filter((b) => {
    const calls = [...b.matchAll(/(engine\(\)\.(?:propose|approve)|\bge\.(?:post|create|invite))\(([^\n]*)/g)];
    return calls.some((m) => !(/consent: /.test(m[2]) && /mayWake: /.test(m[2])) && !/wakeGuards\(/.test(m[2]));
  }).map((b) => b.split('\n')[0].slice(0, 90));
  const wakeBlocks = blocks(src).filter((b) => WAKES.test(b));
  ok(wakeBlocks.length >= 5, `§49 census scope is non-vacuous (${wakeBlocks.length} owner routes can start a billed turn)`);
  const bad = judge(src);
  ok(bad.length === 0, `§49 every wake-capable owner route hands its door the consent echo AND the pacer${bad.length ? ' — ' + bad.join('; ') : ''}`);
  ok(judge("router.post('/api/x/:id/send', async (req, res) => {\n  answer3(res, await engine().propose({ kind: 'user' }, a, b, { text }));\n});") .length === 1 && judge("router.post('/api/x/:id/send', async (req, res) => {\n  answer3(res, await engine().propose({ kind: 'user' }, a, b, { text }, wakeGuards(b)));\n});").length === 0, '§49 NEGATIVE CONTROL: a planted side door with no guards is caught; the guarded spelling passes');
}

// 50. THE REAL-CLI KEY CENSUS (B-5f0b, 2026-09-23). The 2.369.69 red was a
//     real `codex app-server` leg on a logged-out CODEX_HOME: the server's own
//     idle drain starts a turn, and only the missing login made it die on a
//     401 — a fake home removes the LOGIN, never an env key, so a leaked
//     OPENAI_API_KEY / CODEX_API_KEY would have BILLED that turn (and
//     ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN outrank the oat a claude leg
//     seeds). Every suite (and the wire probe) that resolves a REAL claude /
//     codex / opencode by name spawns it through scratch.mjs's
//     withoutVendorKeys(), or declares `// real-cli-env: <why>` — a leg whose
//     child env is built from nothing, or that only reads the binary.
{
  const REAL_CLI = /command -v (claude|codex|opencode)\b|(?:spawn|spawnSync|execFile|execFileSync)\(\s*'(?:codex|claude|opencode)'|OPENCODE_CMD \|\| 'opencode'|execSync\(\s*'(?:codex|claude|opencode) /;
  const judge = (s) => {
    if (!REAL_CLI.test(s)) return null;
    const decl = /\/\/ real-cli-env: (.{10,})/.exec(s);
    if (decl) return null;
    if (!/import\s*\{[^}]*\bwithoutVendorKeys\b[^}]*\}\s*from\s*'\.\/scratch\.mjs'/.test(s)) return 'resolves a real agent CLI but imports no withoutVendorKeys from ./scratch.mjs (and declares no `// real-cli-env:` reason)';
    if ((s.match(/withoutVendorKeys\(/g) || []).length < 1) return 'imports withoutVendorKeys but never calls it';
    return null;
  };
  const scope = fs.readdirSync('scripts').filter((f) => /^(test|probe)-.*\.mjs$/.test(f)).map((f) => 'scripts/' + f).filter((f) => f !== 'scripts/test-architecture.mjs' && REAL_CLI.test(fs.readFileSync(f, 'utf8')));   // this census's own control strings are not a spawn
  ok(scope.length >= 8, `§50 census scope is non-vacuous (${scope.length} suites resolve a real agent CLI by name)`);
  const bad = scope.map((f) => [f, judge(fs.readFileSync(f, 'utf8'))]).filter(([, why]) => why);
  ok(bad.length === 0, `§50 every real-CLI suite strips the ambient vendor keys (or declares why it need not)${bad.length ? ' — ' + bad.map(([f, w]) => f + ': ' + w).join('; ') : ''}`);
  ok(judge("const srv = spawn('codex', ['app-server'], { env: { ...process.env, CODEX_HOME: home } });") !== null
    && judge("import { withoutVendorKeys } from './scratch.mjs';\nconst srv = spawn('codex', ['app-server'], { env: { ...withoutVendorKeys(process.env), CODEX_HOME: home } });") === null
    && judge("// real-cli-env: the child env is {PATH, HOME} only\nexecSync('command -v codex');") === null
    && judge("// real-cli-env: x\nexecSync('command -v codex');") !== null,
  '§50 NEGATIVE CONTROL: a bare real-codex spawn is caught, the shared strip passes, a reasoned declaration passes, a reason-less one does not');
  const { VENDOR_KEY_ENV, withoutVendorKeys } = await import(path.resolve('scripts/scratch.mjs'));
  const planted = withoutVendorKeys({ PATH: '/bin', OPENAI_API_KEY: 'a', CODEX_API_KEY: 'b', ANTHROPIC_API_KEY: 'c', ANTHROPIC_AUTH_TOKEN: 'd' });
  ok(['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'].every((k) => VENDOR_KEY_ENV.includes(k) && !(k in planted)) && planted.PATH === '/bin',
    '§50 withoutVendorKeys strips all four ambient credentials and keeps everything else');
}

// §50b THE REAL-CODEX HOME CENSUS (lane hook-root-guard, B-c77a, 2026-10-02).
//     The owner's ~/.codex/config.toml carried 676 `[projects."/tmp/vs-qs-real-…"]
//     trust_level = "trusted"` tables (692 in all): test-queue-steer ⑥ ran the
//     wrapper against a REAL `codex app-server` with the AMBIENT CODEX_HOME,
//     once per heavy run. A real app-server child owns a config it may write,
//     so every site that starts one (a spawn / exec whose call text names
//     `app-server`) pins CODEX_HOME — inline, or through an env variable whose
//     initializer names it — or declares `// real-cli-home: <why>` within the
//     three lines above. A stub (`process.execPath, '-e', STUB`) is not a site.
{
  const CALL = /\b(?:spawn|spawnSync|execSync|execFile|execFileSync)\(/;
  // the call's own text: from the token to its matching close paren (strings and
  // templates skipped), so a multi-line options object is judged whole
  const callTextAt = (text, at) => {
    let i = text.indexOf('(', at), depth = 0, q = null;
    for (; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '(') depth++;
      else if (c === ')' && --depth === 0) break;
    }
    return text.slice(at, i + 1);
  };
  const sitesIn = (text) => {
    const lines = text.split('\n'), out = [];
    let offset = 0;
    lines.forEach((l, i) => {
      const lineAt = offset; offset += l.length + 1;
      const m = CALL.exec(l);
      if (!m || /^\s*\/\//.test(l)) return;
      const call = callTextAt(text, lineAt + m.index);
      const argv = call.indexOf('{') < 0 ? call : call.slice(0, call.indexOf('{'));
      if (!/'app-server'|`[^`]*\bapp-server\b/.test(argv)) return;
      const envVar = (/\benv:\s*([A-Za-z_$][\w$]*)\s*[,}]/.exec(call) || [])[1];
      const varPins = envVar && new RegExp(`(?:const|let|var)\\s+${envVar.replace(/\$/g, '\\$')}\\s*=[^;]*\\bCODEX_HOME\\b`).test(text);
      const declared = lines.slice(Math.max(0, i - 3), i).some((x) => /\/\/ real-cli-home: .{10,}/.test(x));
      out.push({ line: i + 1, text: l.trim().slice(0, 100), pinned: /\bCODEX_HOME\b/.test(call) || !!varPins || declared });
    });
    return out;
  };
  const files = fs.readdirSync('scripts').filter((f) => /^(test|probe|measure)-.*\.mjs$/.test(f) && f !== 'test-architecture.mjs').map((f) => 'scripts/' + f);
  const sites = files.flatMap((f) => sitesIn(fs.readFileSync(f, 'utf8')).map((x) => ({ file: f, ...x })));
  ok(sites.length >= 3 && sites.some((x) => x.file === 'scripts/test-queue-steer.mjs'), `§50b census scope is non-vacuous (${sites.length} real app-server spawn sites: ${sites.map((x) => x.file.replace('scripts/', '') + ':' + x.line).join(', ')})`);
  const bad = sites.filter((x) => !x.pinned);
  ok(bad.length === 0, `§50b every real codex app-server child runs on a pinned CODEX_HOME (never the owner's ~/.codex)${bad.length ? ' — ' + bad.map((x) => `${x.file}:${x.line} ${x.text}`).join('; ') : ''}`);
  const leg6 = sitesIn(fs.readFileSync('scripts/test-queue-steer.mjs', 'utf8')).find((x) => /codex-chat-wrapper\.js'\), buf, sidecar/.test(x.text));
  ok(leg6 && leg6.pinned, 'test-queue-steer ⑥ (the 676-trust-entries writer) is a site and pins CODEX_HOME');
  { // THE RETIRED BYTES: the census catches leg ⑥ exactly as it shipped (lane base b924041f)
    const r = spawnSync('git', ['show', 'b924041f:scripts/test-queue-steer.mjs'], { encoding: 'utf8', env: gitEnvFrom(process.env), maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) console.log(`  SKIP (LOUD): §50b retired-bytes control — git cannot read b924041f here (${(r.stderr || '').trim().slice(0, 80)})`);
    else {
      const old = sitesIn(r.stdout).find((x) => /codex-chat-wrapper\.js'\), buf, sidecar/.test(x.text));
      ok(old && old.pinned === false, '§50b RETIRED-BYTES CONTROL: leg ⑥ as it shipped (b924041f, ambient CODEX_HOME) is caught by this census');
    }
  }
  const ctl = (src) => sitesIn(src).map((x) => x.pinned);
  ok(String(ctl("const w = spawn(process.execPath, [W, buf, sc, 'codex', 'app-server'], {\n  env: { ...withoutVendorKeys(process.env), CODEX_WEBUI_CWD: dir },\n});")) === 'false'
    && String(ctl("const e = { ...process.env, CODEX_HOME: h };\nconst srv = spawn('codex', ['app-server'], { env: e });")) === 'true'
    && String(ctl("// real-cli-home: reads --version only, writes nothing\nexecSync(`codex app-server --help`);")) === 'true'
    && String(ctl("const e = { ...process.env };\nconst srv = spawn('codex', ['app-server'], { env: e });")) === 'false'
    && ctl("const w = spawn(process.execPath, [W, b, m, process.execPath, '-e', STUB], { env: {} });").length === 0,
  '§50b NEGATIVE CONTROL: the pre-fix leg ⑥ shape is caught, a pinned env variable passes, a reasoned declaration passes, an unpinned variable is caught, a stub is no site');
}

// §51 A SUITE NEVER WRITES A PATCHED COPY INTO THE TREE (B-0220 generalized,
// 2.369.164 batch r1). A negative control used to load a copy of a product
// module written as a SIBLING in src/ (so its relative requires resolved),
// gitignored, unlinked on exit, swept by PID at start. Gitignored hides a file
// from git only: every suite that SCANS src/ while such a copy exists counts it
// as product code (a 2026-09-22 integration: test-auto-resume-loop's census
// counted test-new-member-wake's mutant engine, 3 red, green alone), a SIGKILL
// strands it, and seven of the families were not even ignored (a dirty tree
// mid-run). The ONE place a copy goes is scripts/mutant-copy.mjs (the process's
// scratch dir, `require`/relative imports re-bound to the real module's path).
// DERIVED: every scripts/*.mjs write (writeFileSync/copyFileSync) whose target
// is `path.join(<the checkout>, 'src…')`, `path.join(<the checkout>,
// path.dirname(rel))`, or a variable assigned one of those — <the checkout> =
// a name bound from `import.meta.url` + '..'. The two generated build
// artifacts a bare run stands in for (src/lib/build-version.js,
// src/agentd/version.js) are the declared exceptions. And .gitignore carries
// no wildcard `.js` pattern that could apply under src/ — a stray copy must be
// VISIBLE, never hidden.
console.log('§51 no suite writes a patched copy into the tree');
{
  const judge = (src) => {
    const checkout = new Set();
    for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*[^;\n]*import\.meta\.url[^;\n]*['"]\.\.['"][^;\n]*/g)) checkout.add(m[1]);
    for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*[^;\n]*['"]\.\.['"][^;\n]*import\.meta\.url[^;\n]*/g)) checkout.add(m[1]);
    if (!checkout.size) return [];
    const C = [...checkout].join('|');
    const inTree = new RegExp(`path\\.(?:join|resolve)\\(\\s*(?:${C})\\s*,\\s*(?:['"\`]src\\b|path\\.dirname\\()`);
    const vars = new Map();   // name → its definition (the exception is judged on WHAT it names)
    for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*([^;\n]+)/g)) if (inTree.test(m[2])) vars.set(m[1], m[2]);
    // one hop: a name joined under an in-tree DIRECTORY variable (`path.join(SRC_DIR, …)`)
    for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*([^;\n]+)/g)) {
      const j = /path\.join\(\s*(\w+)\s*,/.exec(m[2]);
      if (j && vars.has(j[1])) vars.set(m[1], vars.get(j[1]) + ' ' + m[2]);
    }
    // the TARGET argument: writeFileSync's first, copyFileSync's SECOND (its first is the source — copying a
    // product module OUT of the tree into a scratch dir is exactly what a patched copy should do; the 2.369.168
    // integration's test-browser-verbs controls were counted by their source path). Top-level commas only.
    const targetAt = (from, nth) => {
      let depth = 0, q = null, i = from, arg = 0, start = from;
      for (; i < src.length && i < from + 600; i++) {
        const ch = src[i];
        if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
        if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') { if (depth === 0) break; depth--; }
        else if (ch === ',' && depth === 0) { if (arg === nth) break; arg++; start = i + 1; }
      }
      return arg === nth ? src.slice(start, i) : null;
    };
    const hits = [];
    for (const m of src.matchAll(/(writeFileSync|copyFileSync)\(\s*/g)) {
      const raw = targetAt(m.index + m[0].length, m[1] === 'copyFileSync' ? 1 : 0);
      if (raw == null) continue;
      const a = raw.trim();
      const call = a;
      const direct = new RegExp('^' + inTree.source).test(call) || (/^path\.join\(\s*(\w+)\s*,/.test(a) && vars.has(/^path\.join\(\s*(\w+)/.exec(a)[1]));
      if (!(direct || vars.has(a))) continue;
      const line = src.slice(0, m.index).split('\n').length;
      if (/build-version\.js|agentd\/version\.js/.test(a + ' ' + (vars.get(a) || ''))) continue;   // the generated build artifacts (declared exceptions)
      hits.push(`${line}: ${a.slice(0, 70)}`);
    }
    return hits;
  };
  const scope = fs.readdirSync('scripts').filter((f) => f.endsWith('.mjs') && f !== 'test-architecture.mjs').map((f) => 'scripts/' + f);
  const bad = scope.map((f) => [f, judge(fs.readFileSync(f, 'utf8'))]).filter(([, h]) => h.length);
  ok(scope.length >= 100, `§51 census scope is non-vacuous (${scope.length} scripts)`);
  ok(bad.length === 0, `§51 no script writes into src/ (patched copies go through scripts/mutant-copy.mjs)${bad.length ? ' — ' + bad.map(([f, h]) => f + ' [' + h.join(' ; ') + ']').join(' | ') : ''}`);
  const HDR = "const REPO = path.resolve(new URL('..', import.meta.url).pathname);\n";
  ok(judge(HDR + "const f = path.join(REPO, path.dirname(rel), 'vs-spend-mut-' + process.pid + '.js');\nfs.writeFileSync(f, src);").length === 1
    && judge(HDR + "const SRC_DIR = path.join(REPO, 'src/server');\nconst f = path.join(SRC_DIR, `vs-browser-mut-${process.pid}.js`);\nfs.writeFileSync(f, src);").length === 1
    && judge(HDR + "fs.writeFileSync(path.join(REPO, 'src/lib', `.chat-view.prefix-${process.pid}.js`), cut);").length === 1
    && judge(HDR + "const f = MUT.write('src/server/auto-resume.js', src);\nfs.writeFileSync(path.join(ROOT, 'src', 'x.js'), s);").length === 0
    && judge(HDR + "const bv = path.join(REPO, 'src/lib/build-version.js');\nif (!fs.existsSync(bv)) fs.writeFileSync(bv, 'x');").length === 0
    && judge(HDR + "fs.copyFileSync(path.join(REPO, 'src/browser-verbs.js'), path.join(D5, 'vibespace-browser-verbs.js'));").length === 0
    && judge(HDR + "fs.copyFileSync(path.join(ROOT, 'x.js'), path.join(REPO, 'src/lib', `vs-x-${process.pid}.js`));").length === 1,
  '§51 NEGATIVE CONTROL: the sibling shapes (dirname(rel), an in-tree dir variable, a direct join) are caught; a mutant-copy write, a scratch-root `src`, and the build-version stand-in are not; copyFileSync is judged by its DESTINATION (a copy out of src/ passes, a copy into src/ is caught)');
  const gi = fs.readFileSync('.gitignore', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const hides = gi.filter((l) => /\*/.test(l) && /\.js$/.test(l) && (l.startsWith('src/') || !l.includes('/')));
  ok(hides.length === 0, `§51 .gitignore hides no wildcard .js family under src/ (a stray copy must be visible)${hides.length ? ' — ' + hides.join(', ') : ''}`);
  // the helper's own contract, driven: a CJS copy resolves the real module's
  // relative requires, keeps its line numbers, and lives outside the checkout
  const { mutantCopies } = await import(path.resolve('scripts/mutant-copy.mjs'));
  const M = mutantCopies('arch51', REPO);
  const orig = fs.readFileSync('src/server/spend-guard.js', 'utf8');
  const loaded = (() => { try { return M.load('src/server/spend-guard.js', orig); } catch (e) { return e; } })();
  const body = fs.readFileSync(M.files[0], 'utf8');
  ok(typeof loaded.create === 'function' && body.split('\n').length === orig.split('\n').length && !path.relative(REPO, M.files[0]).startsWith('src'),
    '§51 mutant-copy: a CJS copy of a module with relative requires loads, keeps every line number, and is written outside the checkout');
  const esm = M.write('src/lib/chat-view.js', fs.readFileSync('src/lib/chat-view.js', 'utf8'));
  const eb = fs.readFileSync(esm, 'utf8');
  ok(esm.endsWith('.mjs') && !/from\s*['"]\.\.?\//.test(eb) && /from "file:\/\//.test(eb),
    '§51 mutant-copy: an ESM copy has every relative specifier rewritten to the real file\'s URL');
}

// 52. THE BROWSER TAKEOVER CENSUS (docs/design-browser-takeover.zh.md §2 I1/I5,
//     owner 2026-09-24: "vibespace 完全接管浏览器工具 … 从系统 path 隐藏
//     agent-browser"). Two facts the agent's road rests on, both grep-derived:
//     (a) every executable STATIC tracked data/bin tool — each `vibespace-*`
//         and the `agent-browser` SHIM — is in HostManager.AGENT_TOOLS, so it
//         ships to every ssh host / paired device (a shim that stays home
//         leaves the real binary first on a remote PATH). Two are shipped on
//         demand by their own path and say so below.
//     (b) I5 — the agent never hears the hidden CLI's NAME: zero occurrences in
//         the teaching output (both Browsing variants, the attachment-set line,
//         the whole tools intro with its window line), in docs/agent/*.md, and in
//         the STRING LITERALS (acorn tokens — a comment is not something the
//         agent is told) of EVERY tracked agent CLI (r2: data/bin/vibespace-*, the
//         index's own list — r1 scanned two) and of the route / engine modules
//         whose refusals reach the agent (r2 adds window-targets + browser-trace);
//         the agentd bundle's hits must be floorNotice's user notice. The shim is the one exception (it
//         must name what it hides to point past it). A file name that merely
//         CONTAINS the word (`~/.agent-browser/`, `agent-browser.json`) is a
//         path, not the tool, and is not counted.
{
  const require = (await import('node:module')).createRequire(import.meta.url);
  const { HostManager } = require('../src/hosts.js');
  const EXEMPT = { 'vibespace-usage-scan': 'shipped on demand by the usage harvest (hosts.js usage-scan rung)', 'vibespace-opencode-op': 'shipped on demand by opencode-access (base64 over ssh)' };
  const ls = String(spawnSync('git', ['ls-files', '-s', 'data/bin'], { cwd: REPO, encoding: 'utf8', env: gitEnvFrom(process.env) }).stdout || '').trim().split('\n').filter(Boolean);
  // the INDEX says what is a tracked tool (data/bin also holds generated and downloaded files)
  const tracked = new Map(ls.map((l) => { const m = /^(\d+) \S+ \d+\t(.+)$/.exec(l); return [path.basename(m[2]), m[1]]; }));
  const onDisk = fs.readdirSync(path.join(REPO, 'data/bin')).filter((n) => (/^vibespace-/.test(n) || n === 'agent-browser') && tracked.has(n));
  const execs = onDisk.filter((n) => (fs.statSync(path.join(REPO, 'data/bin', n)).mode & 0o111) !== 0);
  ok(execs.length >= 15 && execs.includes('vibespace-browser'), `§52a census scope is non-vacuous (${execs.length} executable tracked tools)`);
  const missingFrom = (list) => execs.filter((n) => !list.includes(n) && !EXEMPT[n]);
  const missing = missingFrom(HostManager.AGENT_TOOLS);
  ok(missing.length === 0, `§52a every executable static tool ships to remote hosts (AGENT_TOOLS) — missing: ${missing.join(', ') || 'none'}`);
  ok(HostManager.AGENT_TOOLS.includes('agent-browser') && fs.existsSync(path.join(REPO, 'data/bin/agent-browser')), '§52a the agent-browser SHIM is a shipped tool');
  ok(HostManager.AGENT_TOOLS.includes('vibespace-browser-verbs.js'), '§52a the verb table the shipped vibespace-browser runs ships beside it');
  ok(JSON.stringify(missingFrom(HostManager.AGENT_TOOLS.filter((n) => n !== 'vibespace-browser'))) === '["vibespace-browser"]', '§52a NEGATIVE CONTROL: the list without vibespace-browser is reported missing exactly that tool');

  const acorn = require('acorn');
  const NAME = /(?<![.\w/-])agent-browser(?!\.json|[\w-])/g;
  const count = (t) => (String(t).match(NAME) || []).length;
  const literalsOf = (src, sourceType = 'script') => {
    const out = [];
    for (const tok of acorn.tokenizer(src, { ecmaVersion: 'latest', allowHashBang: true, sourceType, allowReturnOutsideFunction: true })) {
      if (tok.type === acorn.tokTypes.string || tok.type === acorn.tokTypes.template) out.push(String(tok.value));
    }
    return out;
  };
  const literalsOfModule = (src) => literalsOf(src, 'module');
  const ar = require('../src/agent-routes.js');
  const T = { status: true, ask: true, task: true, jobs: true };
  const set1 = { attachments: [{ alias: 'work', isDefault: true, profileId: 'bp-00000001' }] };
  const set2 = { attachments: [{ alias: 'work', isDefault: true, profileId: 'bp-00000001' }, { alias: 'personal', isDefault: false, profileId: 'bp-00000002' }] };
  const teaching = [ar.browserIntroLine('D'), ar.browserIntroLine('none'), ar.browserSetLine(set1), ar.browserSetLine(set2),
    ar.sessionToolsIntro(T, { browserVariant: 'D' }), ar.sessionToolsIntro(T, { browserVariant: 'none' })];
  ok(teaching.every((t) => t.length > 50) && /vibespace-browser/.test(teaching[0]), '§52b the teaching scope is non-vacuous (both variants, the set line, the whole intro)');
  const teachHits = teaching.reduce((n, t) => n + count(t), 0);
  ok(teachHits === 0, `§52b the teaching lines never name the hidden CLI (${teachHits} occurrence(s))`);
  const docs = fs.readdirSync(path.join(REPO, 'docs/agent')).filter((f) => f.endsWith('.md'));
  ok(docs.length >= 10 && docs.includes('browser-manual.md') && docs.includes('web-access-skill.md'), `§52b the manual scope is non-vacuous (${docs.length} docs/agent/*.md, the browser manual and the skill text among them)`);
  const docHits = docs.map((f) => [f, count(fs.readFileSync(path.join(REPO, 'docs/agent', f), 'utf8'))]).filter(([, n]) => n);
  ok(docHits.length === 0, `§52b docs/agent/*.md never name the hidden CLI (${docHits.map(([f, n]) => f + ':' + n).join(', ') || 'none'})`);
  // r2 (finding 4): EVERY tracked agent CLI (data/bin/vibespace-*, the index's own list — the design's I5
  // names them all), not a hand-picked two; the two browser CLIs keep their non-vacuity floor
  const cliFiles = onDisk.filter((n) => /^vibespace-/.test(n)).map((n) => 'data/bin/' + n);
  ok(cliFiles.length >= 15 && cliFiles.includes('data/bin/vibespace-browser') && cliFiles.includes('data/bin/vibespace-window'), `§52b r2 the agent-CLI scope is the tracked census (${cliFiles.length} data/bin/vibespace-* files)`);
  for (const f of cliFiles) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf8');
    const lits = f.endsWith('.mjs') ? literalsOfModule(src) : literalsOf(src);
    const hits = lits.filter((l) => count(l));
    const floor = f === 'data/bin/vibespace-browser' || f === 'data/bin/vibespace-window' ? 20 : 0;
    ok(lits.length > floor && hits.length === 0, `§52b ${f}'s string literals never name the hidden CLI (${lits.length} literals; ${hits.map((h) => JSON.stringify(h.slice(0, 60))).join(', ') || 'none'})`);
  }
  // r1 (finding 4): the ROUTE ERROR strings reach the agent too (`printRefusal` prints `error` / `remedy` /
  // `waysOut` verbatim) — a remedy naming the hidden CLI is a dead road (the shim exits 2, `--state` is
  // refused). Scope: every string literal (acorn tokens — comments are not told) of the modules whose
  // refusals the browser routes and the keeper hand back. Explicit exceptions, each with its reason:
  //   · a literal that IS the bare name (`'agent-browser'`) — a value (the binary a resolver spawns, a
  //     provider row's `binary` field), never a sentence;
  //   · `floorNotice` in browser-profiles.js — a server notice to the USER ('agent-browser-floor'), whose
  //     remedy is the user's own install, never an agent-facing string;
  //   · path / file-name shapes (`~/.agent-browser/config.json`, `agent-browser.json`) — the NAME regex.
  // r2 (finding 4): + the window-targets and browser-trace route / engine modules — their refusals reach
  // the agent through `vibespace-window` / the trace routes the same way (clean today; a planted sentence
  // there must redden the gate, the negative control below proves it does)
  // r3 (finding 3): the scope is a GLOB, not a hand-kept list — a new route module, or a browser / window
  // engine module in src/server/, is scanned the moment it exists (r2's fixed nine-file array let a planted
  // sentence in a new src/routes/zzz.js or the unlisted src/server/browser-stream.js stay green). The PURE
  // decision modules whose refusal sentences the routes hand back stay named explicitly.
  const ROUTE_PURE = ['src/browser-switch.js', 'src/browser-profiles.js', 'src/browser-serve.js'];
  const routeScope = (routesListing, serverListing) => [
    ...routesListing.filter((n) => n.endsWith('.js')).map((n) => 'src/routes/' + n),
    ...serverListing.filter((n) => /^(browser|window)-[\w-]*\.js$/.test(n)).map((n) => 'src/server/' + n),
    ...ROUTE_PURE,
  ].sort();
  const ROUTE_FILES = routeScope(fs.readdirSync(path.join(REPO, 'src/routes')), fs.readdirSync(path.join(REPO, 'src/server')));
  ok(['src/routes/browser.js', 'src/routes/window-targets.js', 'src/routes/browser-trace.js', 'src/server/browser-keeper.js', 'src/server/window-targets-engine.js', 'src/server/browser-trace.js', 'src/server/browser-stream.js', 'src/server/browser-env.js'].every((f) => ROUTE_FILES.includes(f)) && ROUTE_FILES.length >= 20,
    `§52b r3 the route/engine scope is the glob (every src/routes/*.js + src/server/{browser,window}-*.js + ${ROUTE_PURE.length} PURE modules: ${ROUTE_FILES.length} files), r2's nine included`);
  ok(routeScope(['browser.js', 'zzz-r3probe.js'], ['browser-zzz.js', 'window-zzz.js', 'other.js']).join() === ['src/browser-profiles.js', 'src/browser-serve.js', 'src/browser-switch.js', 'src/routes/browser.js', 'src/routes/zzz-r3probe.js', 'src/server/browser-zzz.js', 'src/server/window-zzz.js'].join(),
    '§52b r3 NEGATIVE CONTROL: a NEW route module and a NEW browser/window engine module enter the scope by existing (the verifier\'s zzz-r3probe.js shape)');
  // user-facing-only functions, each with its reason — a hit inside one of these is not an agent-facing string:
  //   · floorNotice — a server notice to the USER ('agent-browser-floor'), whose remedy is their own install;
  //   · journal — browser-env's OPERATOR journal lines (the server log), never an answer to an agent
  const USER_ONLY_FNS = { 'src/browser-profiles.js': ['floorNotice'], 'src/server/browser-env.js': ['journal'] };
  const fnSpans = (src, names) => {
    const out = [];
    if (!names.length) return out;
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.type === 'FunctionDeclaration' && n.id && names.includes(n.id.name)) out.push([n.start, n.end, n.id.name]);
      for (const k of Object.keys(n)) if (k !== 'type' && n[k] && typeof n[k] === 'object') walk(n[k]);
    };
    walk(acorn.parse(src, { ecmaVersion: 'latest', allowHashBang: true, sourceType: 'script', allowReturnOutsideFunction: true }));
    return out;
  };
  const routeHitsOf = (f, src) => {
    const skip = fnSpans(src, USER_ONLY_FNS[f] || []);
    const out = [];
    for (const tok of acorn.tokenizer(src, { ecmaVersion: 'latest', allowHashBang: true, sourceType: 'script', allowReturnOutsideFunction: true })) {
      if (tok.type !== acorn.tokTypes.string && tok.type !== acorn.tokTypes.template) continue;
      const v = String(tok.value);
      if (v === 'agent-browser' || !count(v)) continue;
      if (skip.some(([a, b]) => tok.start > a && tok.start < b)) continue;
      out.push(v);
    }
    return out;
  };
  let routeLits = 0;
  for (const f of ROUTE_FILES) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf8');
    routeLits += literalsOf(src).length;
    const hits = routeHitsOf(f, src);
    ok(hits.length === 0, `§52b r1 ${f}'s string literals (route errors, remedies, ways out, labels) never name the hidden CLI (${hits.map((h) => JSON.stringify(h.slice(0, 70))).join(', ') || 'none'})`);
  }
  ok(routeLits > 400 && Object.entries(USER_ONLY_FNS).every(([f, fns]) => fnSpans(read(f), fns).length === fns.length), `§52b r1 the route-string scope is non-vacuous (${routeLits} literals) and every user-only exception still exists (as a function the parser finds)`);
  {
    // r3: the exception is the FUNCTION, not the file — the same sentence outside `journal` is caught
    const esrc = read('src/server/browser-env.js');
    const plantedOut = esrc.replace('function create(', "const R3X = 'run agent-browser open to check';\nfunction create(");
    ok(plantedOut !== esrc && routeHitsOf('src/server/browser-env.js', plantedOut).length === 1 && routeHitsOf('src/server/browser-env.js', esrc).length === 0,
      '§52b r3 NEGATIVE CONTROL: the name planted in browser-env OUTSIDE its journal function is caught (the exception is one function wide)');
    const ssrc = read('src/server/browser-stream.js');
    const plantedS = ssrc.replace("'use strict';", "'use strict';\nconst X = 'run agent-browser stream enable';");
    ok(plantedS !== ssrc && routeHitsOf('src/server/browser-stream.js', plantedS).length === 1, '§52b r3 NEGATIVE CONTROL: the name planted in a patched copy of src/server/browser-stream.js (unlisted in r2) is caught');
  }
  ok(routeHitsOf('src/browser-switch.js', fs.readFileSync(path.join(REPO, 'src/browser-switch.js'), 'utf8').replace("'use strict';", "'use strict';\nconst X = 'then agent-browser --state / --restore';")).length === 1, '§52b r1 NEGATIVE CONTROL: the pre-fix `switch_export_only` remedy planted into a patched copy is caught');
  {
    const wsrc = fs.readFileSync(path.join(REPO, 'src/routes/window-targets.js'), 'utf8');
    const planted = wsrc.replace("'use strict';", "'use strict';\nconst X = 'for the web run agent-browser open <url>';");
    ok(planted !== wsrc && routeHitsOf('src/routes/window-targets.js', planted).length === 1, '§52b r2 NEGATIVE CONTROL: the name planted into a patched copy of a NEWLY scanned module (routes/window-targets.js) is caught');
  }
  // r2: the agentd BUNDLE (data/bin/vibespace-agentd.js, a gitignored build output) carries the scanned sources;
  // its only hits may be `floorNotice`'s — the user-only notice (esbuild re-chunks templates, so a hit must be
  // a fragment of that function's rendered sentences, not a source literal)
  {
    const bundle = path.join(REPO, 'data/bin/vibespace-agentd.js');
    if (!fs.existsSync(bundle)) console.log('  - §52b r2 the agentd bundle is not built in this tree (npm run build:agentd) — its sources are scanned above');
    else {
      const BP = require('../src/browser-profiles.js');
      const rendered = [BP.floorNotice({ state: 'too-old', installed: '0.1.0', floor: '0.32.0' }), BP.floorNotice({ state: 'unknown' })].filter(Boolean);
      const bHits = literalsOf(fs.readFileSync(bundle, 'utf8')).filter((l) => count(l));
      const foreign = bHits.filter((h) => !rendered.some((r) => r.includes(h)));
      ok(rendered.length === 2 && foreign.length === 0, `§52b r2 the agentd bundle names the hidden CLI only inside floorNotice's user notice (${bHits.length} fragment(s); foreign: ${foreign.map((h) => JSON.stringify(h.slice(0, 60))).join(', ') || 'none'})`);
    }
  }

  // NEGATIVE CONTROLS: the census must be able to go red — a planted literal in
  // a patched copy of the CLI, a planted word in a teaching line, and the path
  // shapes it deliberately does NOT count
  const cliSrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
  const planted = cliSrc.replace("'use strict';", "'use strict';\nconsole.log('try agent-browser directly');");
  ok(literalsOf(planted).filter((l) => count(l)).length === 1, '§52b NEGATIVE CONTROL: a patched CLI copy with the name in one string literal is caught');
  ok(count(teaching[0].replace('vibespace-browser <verb>', 'agent-browser <verb>')) === 1, '§52b NEGATIVE CONTROL: the word injected into a teaching line is caught');
  ok(count('~/.agent-browser/config.json and ./agent-browser.json and design-agent-browser-v2') === 0 && count('run `agent-browser open`.') === 1, '§52b the counter ignores path/file-name shapes and counts the command name (backticked, at a sentence end)');
}

// §53 (2.369.168, design-browser-faces direction B): ONE GLYPH, ONE DEFINITION.
// The agent browser's window-with-a-dot is the ⚙ row's, the status-bar chip's,
// the phone sheet's and the live view's window-kind icon — a hand-copied path in
// a second module is how two glyphs drift into two meanings (the globe did
// exactly that: one path, three faces). Census over every src/lib module: the
// 16-grid path string appears ONCE (icons.js); the 24-grid rail variant once
// (sidebar-rail.js); the globe is no longer the agent's anywhere.
{
  const BL16 = '<rect x="1.5" y="2.5" width="13" height="10" rx="1.5"/><path d="M1.5 5.5h13M4 4h.01M6 4h.01"/><circle cx="8" cy="9" r="1.6"/>';
  const BL24 = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M6.5 7h.01M9.5 7h.01"/><circle cx="12" cy="14" r="2.2"/>';
  const libDir = path.join(REPO, 'src/lib');
  const libs = fs.readdirSync(libDir).filter((f) => f.endsWith('.js') && f !== 'build-version.js');
  const texts = Object.fromEntries(libs.map((f) => [f, fs.readFileSync(path.join(libDir, f), 'utf8')]));
  const occIn = (tx, needle) => Object.entries(tx).flatMap(([f, s]) => { const n = s.split(needle).length - 1; return n ? [[f, n]] : []; });
  const occ = (needle) => occIn(texts, needle);
  const o16 = occ(BL16), o24 = occ(BL24);
  ok(libs.length > 100 && o16.length === 1 && o16[0][0] === 'icons.js' && o16[0][1] === 1, `§53 the 16-grid browser-live glyph is defined ONCE, in icons.js (${JSON.stringify(o16)})`);
  ok(/^\s*browserLive:\s*_s\('/m.test(read('src/lib/icons.js')), '§53 …as UI_ICONS.browserLive through `_s()` (aria-hidden + focusable=false like every icon)');
  ok(o24.length === 1 && o24[0][0] === 'sidebar-rail.js' && o24[0][1] === 1 && /^\s*browser: R\('<rect x="3" y="5"/m.test(read('src/lib/sidebar-rail.js')), `§53 the 24-grid rail variant is RAIL_ICONS.browser, once (${JSON.stringify(o24)})`);
  const users = libs.filter((f) => /UI_ICONS\.browserLive\b/.test(fs.readFileSync(path.join(libDir, f), 'utf8'))).sort();
  // (the session card's menu renders text rows only — showContextMenu draws no `icon` — so the card menu carries the NAME, not the glyph)
  ok(['browser-live-window.js', 'browser-trace-view.js', 'chat-status-bar.js', 'mobile-nav.js'].every((f) => users.includes(f)), `§53 its consumers read the one definition (${users.join(' ')})`);
  // NEGATIVE CONTROL: a planted second copy in a scratch listing is counted
  const planted = occIn({ ...texts, 'browser-live-window.js': texts['browser-live-window.js'] + `\nconst COPY = svgIcon16('${BL16}');` }, BL16);
  ok(planted.length === 2 && planted.some(([f]) => f === 'browser-live-window.js'), `§53 NEGATIVE CONTROL: the pre-rename shape (a local svgIcon16 copy in browser-live-window.js) planted into a patched listing is caught (${JSON.stringify(planted)})`);
}

// §54 (2026-09-25, the Chrome desktop-app incident + the owner's ruling "这个keeper到底是干啥的，没必要别乱加会影响
// 使用的feature"): ONE RESOURCE VERDICT, TWO OUTCOMES. (a) the memory threshold is COMPARED only in
// src/runaway-guard.js — three verbatim copies each compared a per-process VmRSS SUM with it and stopped a fresh
// Google Chrome at "RSS 2.0 GB"; (b) no keeper but the HEADLESS OpenCode serve stops or parks for a resource: a
// desktop app / an agent browser a person or an agent is using is REPORTED. Grep-derived over every src/ file
// (comments stripped), with a planted negative control for each rule.
console.log('§54 one resource verdict; only the headless serve stops for a resource');
{
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(REPO, dir))) {
      const p = dir + '/' + e;
      if (fs.statSync(path.join(REPO, p)).isDirectory()) walk(p);
      else if (/\.(js|mjs|cjs)$/.test(e)) files.push(p);
    }
  })('src');
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  const code = Object.fromEntries(files.map((f) => [f, strip(read(f))]));
  const CMP = /(?:[<>]=?\s*[\w.$\[\]'"]*\bGUARD_(?:MEM|RSS)_BYTES\b|\bGUARD_(?:MEM|RSS)_BYTES\b[\w.$\]'"]*\s*[<>]=?)/;
  const cmpSites = (tx) => Object.entries(tx).filter(([, t]) => CMP.test(t)).map(([f]) => f);
  ok(JSON.stringify(cmpSites(code)) === JSON.stringify(['src/runaway-guard.js']), `§54a the memory threshold is compared in exactly ONE file, src/runaway-guard.js (${JSON.stringify(cmpSites(code))})`);
  ok(!Object.entries(code).some(([, t]) => /\bGUARD_RSS_BYTES\b/.test(t)), '§54a …and the RSS-sum name GUARD_RSS_BYTES is spoken by no src/ code (only a comment may remember it)');
  ok(JSON.stringify(cmpSites({ ...code, 'src/server/desktop-app-keeper.js': code['src/server/desktop-app-keeper.js'] + '\nif (s.rssBytes > limits.GUARD_MEM_BYTES) x();' }).sort()) === JSON.stringify(['src/runaway-guard.js', 'src/server/desktop-app-keeper.js']), '§54a NEGATIVE CONTROL: a planted keeper-side comparison is counted');
  // (b) the stop/park side. Every file that asks the verdict is a keeper; only opencode-serve may act on it by stopping.
  const askers = files.filter((f) => /\bresourceVerdict\(/.test(code[f]) && f !== 'src/runaway-guard.js').sort();
  ok(JSON.stringify(askers) === JSON.stringify(['src/opencode-serve.js', 'src/server/browser-keeper.js', 'src/server/desktop-app-keeper.js']), `§54b the verdict's askers are the three keepers (${askers.join(' ')})`);
  // STRUCTURAL, not a deny-list of spellings (r2 review: `stop(id, { why: v.over })`, `why: 'over-limit'`, a bare
  // `stop(id)` and `store.resourceHoldUntil[..] =` all walked past the old regexes). Three rules per report-only keeper:
  //  (1) THE SAMPLED BLOCK — from `const <v> = RG.resourceVerdict(` to the loop's `if (dirty) commit();` (the scope of
  //      the block-scoped verdict + level; nothing else can see them) — may only write the guard slot (`g.…`), `dirty`,
  //      its own `let` locals and the two maps `guard`/`live`, and may call no stop / retire / kill / remove / fs / Set|Map add|delete|clear;
  //  (2) EVERY stop( call in the file names a `why` from a CLOSED allow-list (the shorthand `{ why }` only where the
  //      function's callers are themselves allow-listed: retireEphemeral);
  //  (3) outside the sampled block the file never reads the verdict's facts (`.over`, `.overKind`, `.report`).
  // + 'turn-idle' (MULTIVIEW B-325a, docs/design-browser-multiview.zh.md §4): the release of a conversation's ephemeral
  //   browser a few minutes after its TURN ended — a lifecycle why, never a resource one (the verdict is not read there)
  const STOP_WHYS = ['user', 'idle', 'relaunch', 'switch', 'conversation gone', 'child handle dropped', 'turn-idle'];
  const argsAt = (t, i) => { let d = 0, j = i; for (; j < t.length; j++) { const c = t[j]; if (c === '(') d++; else if (c === ')' && --d === 0) break; } return t.slice(i + 1, j); };
  const sampledBlock = (t) => {
    const m = /const (\w+) = RG\.resourceVerdict\(/.exec(t); if (!m) return null;
    const end = t.indexOf('if (dirty) commit();', m.index); if (end < 0) return null;
    return { start: m.index, end, text: t.slice(m.index, end), v: m[1] };
  };
  const blockOffences = (tx) => {
    const out = [];
    const bad = [[/(?<![\w$])stop\(|\.stop\(/, 'a stop'], [/\bretire\w*\(|\bremoveProfile\(/, 'a retire'], [/\bkill\(/, 'a kill'], [/\bfs\.\w+/, 'an fs call'], [/\.(?:add|delete|clear)\(/, 'a Set/Map add|delete|clear']];
    for (const [re, what] of bad) if (re.test(tx)) out.push(what);
    for (const m of tx.matchAll(/(?<![\w$.])(\w+)\.set\(/g)) if (!['guard', 'live'].includes(m[1])) out.push(`a ${m[1]}.set(`);
    const locals = new Set([...tx.matchAll(/\blet\s+([\w$]+)/g)].map((m) => m[1])); // block-local, gone with the block
    const decl = tx.replace(/\b(?:const|let|var)\s+[\w$]+\s*=/g, '');
    for (const m of decl.matchAll(/([A-Za-z_$][\w$]*(?:\s*(?:\.[\w$]+|\[[^\]]*\]))*)\s*(?:\+|-|\*|\/|\|\||&&|\?\?)?=(?![=>])/g)) {
      const target = m[1].replace(/\s+/g, '');
      if (!(target === 'dirty' || /^g\./.test(target) || locals.has(target))) out.push(`an assignment to ${target}`);
    }
    return out;
  };
  const stopOffences = (t) => {
    const out = [];
    for (const m of t.matchAll(/(?<![\w$.])stop\(/g)) {
      if (/function\s+$/.test(t.slice(Math.max(0, m.index - 12), m.index))) continue; // the definition
      const args = argsAt(t, m.index + 4);
      const lit = /,\s*\{\s*why:\s*'([^']*)'\s*\}\s*$/.exec(args);
      if (lit && STOP_WHYS.includes(lit[1])) continue;
      if (/,\s*\{\s*why\s*\}\s*$/.test(args)) {
        const defn = /function retireEphemeral\(\w+, why = '([^']*)'\)/.exec(t);
        const callers = [...t.matchAll(/(?<!function )retireEphemeral\(([^)]*)\)/g)].map((c) => (/,\s*'([^']*)'\s*$/.exec(c[1]) || [])[1]);
        if (defn && STOP_WHYS.includes(defn[1]) && callers.length && callers.every((w) => STOP_WHYS.includes(w)) && (t.match(/\bstop\(\w+, \{ why \}\)/g) || []).length === 1) continue;
      }
      out.push(`stop(${args.trim()})`);
    }
    return out;
  };
  const offenders = (tx) => {
    const out = {};
    for (const f of askers.filter((x) => x !== 'src/opencode-serve.js')) {
      const t = tx[f], blk = sampledBlock(t), o = [];
      if (!blk) o.push('no sampled block (const <v> = RG.resourceVerdict( … if (dirty) commit();)');
      else {
        o.push(...blockOffences(blk.text));
        const outside = t.slice(0, blk.start) + t.slice(blk.end);
        if (/\.(?:over|overKind|report)\b/.test(outside)) o.push('the verdict\'s facts read outside the sampled block');
      }
      o.push(...stopOffences(t));
      if (o.length) out[f] = o;
    }
    return out;
  };
  ok(Object.keys(offenders(code)).length === 0, `§54b no report-only keeper stops, retires, parks or writes a store for a resource — structurally (${JSON.stringify(offenders(code))})`);
  ok(['src/server/desktop-app-keeper.js', 'src/server/browser-keeper.js'].every((f) => { const b = sampledBlock(code[f]); return b && b.text.length > 400 && /\bRG\.reportTransition\(/.test(b.text) && /\bserverNotice\?\.\(/.test(b.text); }), '§54b CONTROL setup: both sampled blocks are found and carry the report level + the notice');
  const PLANTS = [
    ['lvl.fire stop with why: v.over', 'if (lvl.fire) stop(rec.id, { why: v.over }).catch(() => { });'],
    ["why: 'over-limit'", "if (v.over) stop(rec.id, { why: 'over-limit' }).catch(() => { });"],
    ['a bare stop after a lastError', 'if (v.over) { rec.lastError = v.over; stop(rec.id).catch(() => { }); }'],
    ['a park under a new store key', 'if (v.over) store.resourceHoldUntil[rec.appId] = t + 3600e3;'],
    ["why: 'user' (an allow-listed word)", "if (v.over) stop(rec.id, { why: 'user' });"],
    ['a park in a new Map', 'if (v.over) { parkedUntil.set(rec.id, t + 3600e3); }'],
    ['a state flip', "if (v.over) rec.state = 'failed';"],
    ['a profile retire', "if (lvl.fire) retireProfile(rec, { why: 'idle' });"],
  ];
  const plantIn = (f, stmt) => { const t = code[f], b = sampledBlock(t); return { ...code, [f]: t.slice(0, b.end) + stmt + '\n        ' + t.slice(b.end) }; };
  const caughtIn = PLANTS.map(([n, stmt]) => [n, ['src/server/desktop-app-keeper.js', 'src/server/browser-keeper.js'].every((f) => Object.keys(offenders(plantIn(f, stmt))).includes(f))]);
  ok(caughtIn.every(([, c]) => c), `§54b NEGATIVE CONTROL: all ${PLANTS.length} planted spellings INSIDE the sampled block are caught in both keepers (${JSON.stringify(caughtIn.filter(([, c]) => !c))})`);
  const plantEnd = (f, stmt) => ({ ...code, [f]: code[f] + '\n' + stmt });
  const caughtEnd = PLANTS.slice(0, 5).map(([n, stmt]) => [n, Object.keys(offenders(plantEnd('src/server/desktop-app-keeper.js', stmt))).includes('src/server/desktop-app-keeper.js')]);
  ok(caughtEnd.every(([, c]) => c), `§54b NEGATIVE CONTROL: the stop / park spellings OUTSIDE the block (a later reader of the verdict, an unlisted why, a bare stop) are caught too (${JSON.stringify(caughtEnd.filter(([, c]) => !c))})`);
  const plantStored = plantEnd('src/server/browser-keeper.js', "function sweepHot() { for (const [id, l] of live) if (l.over) stop(id, { why: 'idle' }); }");
  ok(Object.keys(offenders(plantStored)).includes('src/server/browser-keeper.js'), '§54b NEGATIVE CONTROL: a later sweep that stops on the STORED live row\'s `over` (with an allow-listed why) is caught');
  ok(/if \(why\) parkRunaway\(why\)/.test(code['src/opencode-serve.js']) && /const why = v\.over;/.test(code['src/opencode-serve.js']), '§54b the headless serve alone stops + parks, on the verdict\'s `over`');
  const parkReaders = files.filter((f) => /\brunawayParkedUntil\b/.test(code[f])).sort();
  ok(JSON.stringify(parkReaders) === JSON.stringify(['src/server/migrations.js']), `§54b the park map lives on only in the migration that voids it (${JSON.stringify(parkReaders)})`);
  ok(/\bRG\.reportTransition\(/.test(code['src/server/desktop-app-keeper.js']) && /\bRG\.reportTransition\(/.test(code['src/server/browser-keeper.js']), '§54b both report-only keepers route `over` through the report level (a notice when a crossing begins — hysteresis + floor + delivery in runaway-guard.reportTransition)');
  const plantStop = { ...code, 'src/server/desktop-app-keeper.js': code['src/server/desktop-app-keeper.js'] + "\nstop(rec.id, { why: 'runaway' });" };
  const PARK = /\brunaway(?:Parked)?Until\b|\bparkRunaway\b|\bParkedUntil\b/;
  ok(Object.keys(offenders(plantStop)).includes('src/server/desktop-app-keeper.js') && !PARK.test(code['src/server/browser-keeper.js']) && !PARK.test(code['src/server/desktop-app-keeper.js']), '§54b NEGATIVE CONTROL: the pre-fix spelling (why: \'runaway\') is caught, and the old park names are spoken by neither report-only keeper');
}

// §55 A SUITE THAT KILLS A WRAPPER WAITS FOR ITS EXIT BEFORE REMOVING ITS DIR
// (2.369.172 r1 — the Actions mirror's red on test-codex-p2-client: `ENOTEMPTY:
// directory not empty, rmdir /tmp/vs-cxfork-…`). Since 2.369.172 every wrapper
// answers SIGTERM with a synchronous record whose last act is a log APPEND that
// creates the log file when absent; a suite that `kill('SIGTERM')`s the wrapper
// and `rmSync(dir)`s in the same tick races that append — green on a fast box,
// red on the 2-vCPU runner. The ONE idiom is scripts/scratch.mjs `stopWrapper`
// (kill → await exit, SIGKILL after a grace → rmSync with retries). DERIVED:
// every scripts/test-*.mjs that spawns a data/bin/*wrapper*.js AND removes a
// directory imports stopWrapper, or at least waits on an 'exit' event.
console.log('§55 a suite that kills a wrapper waits for its exit before removing its dir');
{
  const judge = (src) => {
    const spawnsWrapper = /data\/bin\/(?:chat|pty|codex-chat)-wrapper\.js/.test(src);
    const removes = /\brmSync\s*\(/.test(src);
    // only a CATCHABLE signal runs the wrapper's record (SIGKILL writes nothing — kill-then-rm is safe there)
    const catchableKill = /\.kill\(\s*(?:['"]SIG(?:TERM|HUP|INT)['"]\s*)?\)/.test(src);
    if (!spawnsWrapper || !removes || !catchableKill) return null;
    const idiom = /import\s*\{[^}]*\bstopWrapper\b[^}]*\}\s*from\s*'\.\/scratch\.mjs'/.test(src);
    const waits = /\b(?:once|on)\s*\(\s*['"]exit['"]/.test(src);
    return idiom || waits ? null : 'spawns a wrapper and removes a dir with no stopWrapper import and no exit wait';
  };
  const suites = fs.readdirSync(path.join(REPO, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f)).sort();
  const bad = [];
  let scope = 0;
  for (const f of suites) {
    const src = fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8');
    // in scope: spawns a wrapper, removes a dir, and ends the wrapper (a catchable kill, or the idiom that hides one)
    if (/data\/bin\/(?:chat|pty|codex-chat)-wrapper\.js/.test(src) && /\brmSync\s*\(/.test(src) && (/\.kill\(\s*(?:['"]SIG(?:TERM|HUP|INT)['"]\s*)?\)/.test(src) || /\bstopWrapper\b/.test(src))) scope++;
    const why = judge(src); if (why) bad.push(f + ': ' + why);
  }
  ok(scope >= 4, `§55 census scope is non-vacuous (${scope} suites spawn a wrapper and remove a dir)`);
  ok(bad.length === 0, `§55 every such suite stops the wrapper through stopWrapper (or waits for its exit) before removing its dir${bad.length ? ' — ' + bad.join(' | ') : ''}`);
  const blind = "spawn(process.execPath, [path.join(REPO, 'data/bin/codex-chat-wrapper.js'), buf, meta]);\ntry { w.kill('SIGTERM'); } catch {}\nfs.rmSync(dir, { recursive: true, force: true });";
  const idiom = "import { stopWrapper } from './scratch.mjs';\n" + blind;
  const waiter = "spawn(process.execPath, [path.join(REPO, 'data/bin/pty-wrapper.js'), buf, meta]);\nawait new Promise((r) => w.once('exit', r));\nfs.rmSync(dir, { recursive: true, force: true });";
  const noWrapper = "spawn('node', ['server.js']);\ntry { w.kill('SIGTERM'); } catch {}\nfs.rmSync(dir, { recursive: true, force: true });";
  const sigkill = "spawn(process.execPath, [path.join(REPO, 'data/bin/chat-wrapper.js'), buf, meta]);\nw.kill('SIGKILL');\nfs.rmSync(dir, { recursive: true, force: true });";
  const bareKill = "spawn(process.execPath, [path.join(REPO, 'data/bin/chat-wrapper.js'), buf, meta]);\ntry { w.stdin.end(); w.kill(); } catch {}\nfs.rmSync(dir, { recursive: true, force: true });";
  ok(judge(blind) !== null && judge(bareKill) !== null && judge(idiom) === null && judge(waiter) === null && judge(noWrapper) === null && judge(sigkill) === null,
    '§55 NEGATIVE CONTROL: the kill-then-rm shape is caught (SIGTERM and the bare kill()); the stopWrapper import passes; an explicit exit wait passes; a suite that spawns no wrapper is out of scope; a SIGKILL (the record never runs) is out of scope');
}

// §56 A CAPABILITY IS PINNED BY CONTENT, NEVER BY THE LIST'S TAIL (desktop lane C verify r2 F5, 2026-09-25).
// The daemon's hello-ack capability list GROWS at its end: lane C1 appended desktop-serve after browser-serve and
// test-browser-providers' `"browser-serve"]` pin went red (fixed in C2 verify); test-desktop-remote pinned
// `desktop-serve"]` twice the same way, and test-opencode-remote survived only on an adjacency fallback. A suite
// that finds a capability by the `]` after it goes red the day ANY capability is added after it. DERIVED: no
// scripts/test-*.mjs spells an `-serve` capability followed by the closing bracket — as a regex (`serve["']\]`,
// `serve'\]`) or as esbuild's string (`serve"]'`); the list is found by its key (`capabilities: [ … ]`).
console.log('§56 a capability is pinned by content, never by the capability list\'s tail');
{
  const TAIL = /-serve(?:(?:\["'\]|["'])\\\]|"\](?=['`]))/;
  const suites = fs.readdirSync(path.join(REPO, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f) && f !== 'test-architecture.mjs').sort();
  const hits = [];
  for (const f of suites) {
    const lines = fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8').split('\n');
    lines.forEach((l, i) => { if (TAIL.test(l)) hits.push(`${f}:${i + 1}`); });
  }
  ok(suites.length > 100, `§56 census scope is every suite (${suites.length})`);
  ok(hits.length === 0, `§56 no suite pins a capability by the list's tail${hits.length ? ' — ' + hits.join(' ') : ''}`);
  const planted = [
    `ok(/["']desktop-serve["']\\]/.test(bundleText));`,
    `ok(/'opencode-serve'\\]/.test(agentd));`,
    `const capFrom = '"browser-serve", "desktop-serve"]';`,
    'const capFrom = `"browser-serve"]`;',
  ];
  const clean = [
    `ok(/capabilities: \\[[^\\]]*"desktop-serve"[^\\]]*\\]/.test(b));`,
    `mkDm(['desktop-serve'])`,
    `R({ hostId: 'a', connected: true, capabilities: ['desktop-serve'], platform: 'linux' })`,
    `argv: ['opencode', 'serve']`,
  ];
  ok(planted.every((l) => TAIL.test(l)) && !clean.some((l) => TAIL.test(l)), `§56 NEGATIVE CONTROL: the four tail spellings (regex both quotes, esbuild's string, a template) are caught; the by-content regex, a stub capability array and a plain argv are not (${JSON.stringify(planted.filter((l) => !TAIL.test(l)).concat(clean.filter((l) => TAIL.test(l))))})`);
}

// §57 NO SCRATCH SERVER CLAIMS THE SINGLETON DESKTOP'S :7 / 5901 (2026-09-25 — the heavy RED on 69720f2b:
// test-desktop-app-window's singleton leg read `null` twice). src/vnc.js's singleton Desktop takes the MACHINE-GLOBAL
// X display :7 and RFB port 5901 unless VIBESPACE_VNC_DISPLAY / VIBESPACE_VNC_PORT name others, and ADOPTS whatever
// listens on its port. With Xtigervnc on this box every scratch server that opened the Desktop started or adopted ONE
// Xtigervnc — another run's, left behind under a deleted scratch dir (observed live) — and a keeper's Xvfb, whose
// `-displayfd` hands out the lowest free number, could hold :7 so the singleton could not start at all (reproduced:
// the leg's exact `null`). The "gate suites never claim machine-global names" class (§6 for literal ports/paths):
// these names are IMPLICIT — the server's defaults — so the census is on the spawn ENV. DERIVED: every
// scripts/test-*.mjs spawn of `server.js` (argv `['server.js']`, `['-r', x, 'server.js']`, `[path.join(x, 'server.js')]`)
// names an env that carries scratch.mjs `vncEnv()` — inline, or through the variable / spread it is built from.
console.log('§57 every suite that spawns server.js hands it per-run singleton-Desktop names (scratch.mjs vncEnv)');
{
  // …and (2.369.181) a server.js spawned THROUGH a launcher — `spawn(DBUS, ['--', process.execPath, 'server.js'])`, the
  // shape lane D's test-desktop-app-snap used (dbus-run-session): node is an argv ELEMENT there, never the command, and the
  // first cut of this census read it as no spawn at all (the suite booted with the machine-global :7 / 5901)
  const SPAWN = /\b(?:spawn|fork)\(\s*(?:(?:process\.execPath|'node'|"node")\s*,\s*\[[^\]]*?|[A-Za-z_$][\w$.]*\s*,\s*\[[^\]]*?(?:process\.execPath|'node'|"node")\s*,[^\]]*?)(?:['"`]server\.js['"`]|path\.join\([^)]*?['"`]server\.js['"`]\s*\))\s*\]/g;
  // walk(t, i, false) = the balanced text from the opening bracket at `i`; walk(t, i, true) = from `i` to the end of its statement (strings skipped)
  const walk = (t, i, stopAtStatementEnd) => {
    let d = 0, q = null;
    for (let j = i; j < t.length; j++) {
      const c = t[j];
      if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if ('{(['.includes(c)) d++;
      else if ('})]'.includes(c)) { if (stopAtStatementEnd && d === 0) return t.slice(i, j); d--; if (!stopAtStatementEnd && d === 0) return t.slice(i, j + 1); }
      else if (stopAtStatementEnd && d === 0 && (c === ';' || c === '\n')) return t.slice(i, j);
    }
    return t.slice(i);
  };
  // offsets inside a string literal, a template's text, a regex literal or a comment: a spawn SPELLED there is data (a
  // control or a pin), never a spawn. Templates nest through `${ … }` (a brace-depth stack); a regex literal is told
  // from a division by the token before it (a regex carrying a backtick desynced the first cut for 90 lines).
  const dataRanges = (t) => {
    const out = [], tpl = []; let depth = 0;
    const chunk = (j) => { // template text from the ` or } at j to the next ` or ${
      let k = j + 1;
      while (k < t.length && t[k] !== '`' && !(t[k] === '$' && t[k + 1] === '{')) k += t[k] === '\\' ? 2 : 1;
      out.push([j, k + 1]);
      if (t[k] === '$') { tpl.push(depth); depth++; return k + 1; }
      return k;
    };
    for (let j = 0; j < t.length; j++) {
      const c = t[j], n = t[j + 1];
      if (c === '/' && (n === '/' || n === '*')) { const e = n === '/' ? t.indexOf('\n', j) : t.indexOf('*/', j + 2); const end = e < 0 ? t.length : e + (n === '/' ? 0 : 2); out.push([j, end]); j = end - 1; continue; }
      if (c === '"' || c === "'") { let k = j + 1; while (k < t.length && t[k] !== c && t[k] !== '\n') k += t[k] === '\\' ? 2 : 1; out.push([j, k + 1]); j = k; continue; }
      if (c === '/' && /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\breturn|\btypeof)\s*$/.test(t.slice(Math.max(0, j - 12), j))) {
        let k = j + 1, cls = false;
        while (k < t.length && t[k] !== '\n' && (cls || t[k] !== '/')) { if (t[k] === '\\') k++; else if (t[k] === '[') cls = true; else if (t[k] === ']') cls = false; k++; }
        out.push([j, k + 1]); j = k; continue;
      }
      if (c === '`') { j = chunk(j); continue; }
      if (c === '}' && tpl.length && depth - 1 === tpl[tpl.length - 1]) { depth--; tpl.pop(); j = chunk(j); continue; }
      if (c === '{') depth++; else if (c === '}') depth--;
    }
    return out;
  };
  const judge = (t) => {
    const data = dataRanges(t);
    const isData = (i) => data.some(([a, b]) => i >= a && i < b);
    const defsOf = (name) => [...t.matchAll(new RegExp(`(?:\\b(?:const|let|var)\\s+|(?:^|[;{}\\n])\\s*)${name.replace(/\$/g, '\\$')}\\s*=(?![=>])\\s*`, 'g'))].map((m) => walk(t, m.index + m[0].length, true));
    const carries = (text, depth = 0) => {
      if (/\bvncEnv\s*\(/.test(text) || (/\bVIBESPACE_VNC_DISPLAY\b/.test(text) && /\bVIBESPACE_VNC_PORT\b/.test(text))) return true;
      if (depth > 4) return false;
      for (const m of text.matchAll(/\.\.\.\s*\(?\s*([A-Za-z_$][\w$]*)\b(?!\s*[.(])/g)) if (defsOf(m[1]).some((d) => carries(d, depth + 1))) return true;
      return false;
    };
    const findings = []; let spawns = 0;
    for (const m of t.matchAll(SPAWN)) {
      if (isData(m.index)) continue;
      spawns++;
      const line = t.slice(0, m.index).split('\n').length;
      let j = m.index + m[0].length; while (/[\s,]/.test(t[j] || '')) j++;
      const opts = t[j] === '{' ? walk(t, j, false) : '';
      const e = /\benv\s*:\s*/.exec(opts);
      let envText = null;
      if (e) { const k = e.index + e[0].length; if (opts[k] === '{') envText = walk(opts, k, false); else { const id = /^[A-Za-z_$][\w$]*/.exec(opts.slice(k)); if (id) envText = defsOf(id[0]).join('\n'); } }
      else if (/[{,]\s*env\s*[,}]/.test(opts)) envText = defsOf('env').join('\n');
      if (envText === null) findings.push(`line ${line}: names no env (inherits the machine-global :7/5901)`);
      else if (!carries(envText)) findings.push(`line ${line}: its env carries no vncEnv() names`);
    }
    return { spawns, findings };
  };
  // NO EXEMPTIONS: this file and test-fixture-isolation spell the shape only inside string literals (their controls),
  // which the census reads as data — asserted, so a real spawn added to either is judged like any other.
  for (const f of ['test-architecture.mjs', 'test-fixture-isolation.mjs']) {
    const src = fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8');
    const spelled = [...src.matchAll(SPAWN)].length;
    ok(spelled > 0 && judge(src).spawns === 0, `§57 ${f} spells a server.js spawn ${spelled}× — only inside string literals (its controls), so it is out of scope by the rule, not by a list`);
  }
  const suites = fs.readdirSync(path.join(REPO, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f)).sort();
  const scope = [], bad = [];
  for (const f of suites) { const r = judge(fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8')); if (!r.spawns) continue; scope.push(f); for (const x of r.findings) bad.push(`${f} ${x}`); }
  ok(scope.length >= 50 && scope.includes('test-desktop-app-window.mjs'), `§57 census scope is non-vacuous (${scope.length} suites spawn server.js, the incident's suite among them)`);
  ok(bad.length === 0, `§57 every server.js spawn carries the per-run singleton-Desktop names${bad.length ? ' — ' + bad.join(' | ') : ''}`);
  // §57b B-442c (2026-10-02, the 16:23 OOM that stopped the production service): A SUITE THAT BOOTS A SCRATCH SERVER ENDS WHAT
  // THAT SERVER STARTED — scratch.mjs endRootedProcesses (cwd / HOME / the daemon's own VIBESPACE_*_ROOT / argv), called by the
  // suite or by a scripts/ module it imports. The server's device daemon is setsid-detached by design and title-rewritten, so
  // killing the server or `pkill -f <root>` leaves it; a suite that only deletes its root leaves it running on a deleted
  // bundle — test-restore-liveness's §4 orphan grew to 45.7 GB (src/agentd/worker-pool.js is bounded since). DEBT: the suites
  // that predate the rule, by name; the list only SHRINKS (an entry that complies now, or is gone, is red until removed).
  const ENDS_DEBT = new Set([
    'test-agents-overview.mjs', 'test-attach-ack.mjs', 'test-attach-rescue.mjs', 'test-ax-budget.mjs', 'test-browser-continuity.mjs', 'test-browser-identity.mjs',
    'test-browser-live-ui.mjs', 'test-browser-live.mjs', 'test-browser-multiview.mjs', 'test-browser-propose-chrome.mjs', 'test-browser-resume-ui.mjs', 'test-channel-jump.mjs',
    'test-channel-threads-ui.mjs', 'test-channel-window-render.mjs', 'test-channels-aggregate-ui.mjs', 'test-channels-e2e.mjs', 'test-channels-groups-e2e.mjs', 'test-channels-panel-redraw.mjs',
    'test-chat-e2e.mjs', 'test-chat-hygiene-ui.mjs', 'test-chat-paging.mjs', 'test-cli-cmd-refresh.mjs', 'test-client-boot.mjs', 'test-collab-live-counter.mjs',
    'test-cwd-recreate.mjs', 'test-desktop-app-snap.mjs', 'test-desktop-app-window.mjs', 'test-desktop-drop.mjs', 'test-desktop-reorder.mjs', 'test-desktop-resume-paging.mjs',
    'test-desktop-vnc-fit.mjs', 'test-desktop-xpra-window.mjs', 'test-desktop-xpra.mjs', 'test-fold-ux.mjs', 'test-fork-restore.mjs', 'test-gear-menu.mjs',
    'test-ghost-host-heal.mjs', 'test-graduate-dial.mjs', 'test-group-report-card.mjs', 'test-harness-honesty.mjs', 'test-helper-ask-ui.mjs', 'test-inbox-reply-ui.mjs',
    'test-incident.mjs', 'test-integration-toggle.mjs', 'test-integrations-ui.mjs', 'test-jobs-panel.mjs', 'test-minimap-jump.mjs', 'test-mobile-gaps.mjs',
    'test-new-session-dialog.mjs', 'test-office-desktop.mjs', 'test-opencode-plugin.mjs', 'test-opencode-s9.mjs', 'test-permission-rules.mjs', 'test-profile-blindness-chip.mjs',
    'test-queue-steer.mjs', 'test-readings-attribution.mjs', 'test-reattach-stagger-ui.mjs', 'test-reconnect-storm.mjs', 'test-restore-smoke.mjs', 'test-resume-breaker.mjs',
    'test-roster-reset-eta.mjs', 'test-run-collapse-fold.mjs', 'test-sidebar-empty-remote.mjs', 'test-sidebar-rail.mjs', 'test-sidebar-scroll.mjs', 'test-split-close-resurrect.mjs',
    'test-split-ux.mjs', 'test-stage-overlap.mjs', 'test-stage-preview.mjs', 'test-sys-panel.mjs', 'test-taskbar-group-ui.mjs', 'test-tasks-mirror-race.mjs',
    'test-title-chips-ui.mjs', 'test-toolbar-resize.mjs', 'test-turn-truth-ui.mjs', 'test-ui-scale.mjs', 'test-update-dialog.mjs', 'test-window-binding.mjs',
    'test-window-menu.mjs', 'test-worktree-userchan-ui.mjs',
    // the 2.369.202 integration: server-booting suites the OTHER lanes of this release (and .200) added beside lane
    // runaway-daemon's rule — the same debt, named; each leaves this list when it calls endRootedProcesses
    'test-apps-ui.mjs', 'test-channel-lark-threads-ui.mjs', 'test-channel-names-ui.mjs', 'test-chat-send-landing.mjs', 'test-desktop-keepalive-chrome.mjs',
    'test-mobile-select.mjs', 'test-page-link-ui.mjs', 'test-peer-card-fold-ui.mjs']);
  const endsIn = (t) => { const data = dataRanges(t); return [...t.matchAll(/\bendRootedProcesses\s*\(/g)].some((m) => !data.some(([a, b]) => m.index >= a && m.index < b)); };
  const harnesses = fs.readdirSync(path.join(REPO, 'scripts')).filter((f) => /\.mjs$/.test(f) && !/^test-/.test(f) && f !== 'scratch.mjs' && endsIn(fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8')));
  const endsVia = (t) => endsIn(t) || harnesses.some((h) => new RegExp(`from\\s+['"]\\./${h.replace('.', '\\.')}['"]`).test(t));
  const noEnd = scope.filter((f) => !endsVia(fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8')));
  const fresh = noEnd.filter((f) => !ENDS_DEBT.has(f)), stale = [...ENDS_DEBT].filter((f) => !noEnd.includes(f));
  ok(harnesses.includes('pairing-ui-harness.mjs') && scope.includes('test-restore-liveness.mjs') && !noEnd.includes('test-restore-liveness.mjs'),
    `§57b the census reads harnesses (${harnesses.length}: ${harnesses.join(', ')}) and the incident's suite (test-restore-liveness) ends what its servers started`);
  ok(fresh.length === 0, `§57b every server-booting suite ends what its server started (scratch.mjs endRootedProcesses)${fresh.length ? ' — NEW without it: ' + fresh.join(' ') : ''} (${noEnd.length} named debt)`);
  ok(stale.length === 0, `§57b the debt list only shrinks${stale.length ? ' — complies now or gone, REMOVE from ENDS_DEBT: ' + stale.join(' ') : ''}`);
  // NEGATIVE CONTROLS: a spawn with vncEnv and no end is named; an end spelled only in a comment or a string still is; a harness import is not
  const fake = (body) => `import { vncEnv } from './scratch.mjs';\nconst c = spawn(process.execPath, ['server.js'], { env: { ...(await vncEnv()) } });\n${body}\n`;
  ok(!endsVia(fake('')) && !endsVia(fake('// endRootedProcesses(ROOT)')) && !endsVia(fake("const s = 'endRootedProcesses(ROOT)';")) && endsVia(fake('endRootedProcesses(ROOT);')) && endsVia(fake("import { h } from './pairing-ui-harness.mjs';")),
    '§57b NEGATIVE CONTROLS: no end / an end in a comment / in a string are named; a real call or a harness import passes');
  // §57b end
  // NEGATIVE CONTROLS: the incident's own pre-fix shape (a named env, no names), an inline env, a spawn with NO env,
  // the preload and path.join argv forms — caught; the idiom through each route (inline, a variable, a spread of a
  // variable, a function-built env, the two literal names) — passes; a git ls-files ending in 'server.js' is no spawn.
  const plant = {
    named: "const srvEnv = { ...process.env, PORT: String(PORT), HOME: home };\nconst bootServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: 'ignore' }); return srv; };",
    inline: "const srv = spawn('node', ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });",
    none: "const srv = spawn(process.execPath, ['-r', preload, 'server.js'], { cwd: wt, stdio: 'ignore' });",
    joined: "const srv=spawn('node',[path.join(wt,'server.js')],{cwd:wt,env:{...env,PORT:String(PORT)},stdio:'ignore'});",
    wrapped: "const s = spawn(DBUS, ['--', process.execPath, 'server.js'], { cwd: wt, detached: true, env: { ...process.env, PORT: String(port), HOME: home } });",
  };
  const pass = {
    inline: "const VNC_ENV = await vncEnv();\nconst srv = spawn('node', ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT) } });",
    named: "const VNC_ENV = await vncEnv();\nconst srvEnv = { ...process.env, ...VNC_ENV, PORT: String(PORT) };\nsrv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv });",
    spread: "const VNC_ENV = await vncEnv();\nconst srvEnv = { ...process.env, ...VNC_ENV };\nconst sc = spawn(process.execPath, ['server.js'], { cwd: wtc, env: { ...srvEnv, PORT: String(P2) } });",
    fn: "const VNC_ENV = await vncEnv();\nconst srvEnv = (extra = {}) => ({ ...process.env, ...VNC_ENV, ...extra });\nsrv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv(extraEnv) });",
    shorthand: "const env = { ...process.env, ...(await vncEnv()) };\nconst c = spawn(process.execPath, ['server.js'], { cwd: wt, env, stdio: 'ignore' });",
    literal: "const srv = spawn('node', ['server.js'], { env: { ...process.env, VIBESPACE_VNC_DISPLAY: ':1234', VIBESPACE_VNC_PORT: String(P) } });",
    wrapped: "const s = spawn(DBUS, ['--', process.execPath, 'server.js'], { cwd: wt, detached: true, env: { ...process.env, ...(await vncEnv()), PORT: String(port) } });",
    git: "execFileSync('git', ['-C', REPO, 'ls-files', '-z', '--', 'src', 'server.js'], {});",
    quoted: "const ctl = \"const srv = spawn('node', ['server.js'], { env: { PORT } });\"; // spawn(process.execPath, ['server.js'])",
  };
  const caught = Object.entries(plant).filter(([, v]) => judge(v).findings.length === 1).map(([k]) => k);
  const passed = Object.entries(pass).filter(([, v]) => judge(v).findings.length === 0).map(([k]) => k);
  ok(caught.length === Object.keys(plant).length && passed.length === Object.keys(pass).length && judge(pass.git).spawns === 0 && judge(pass.quoted).spawns === 0,
    `§57 NEGATIVE CONTROL: the pre-fix shapes are caught (${caught.join(', ')}), the idiom passes by every route (${passed.join(', ')}); a git ls-files and a spawn spelled in a string or comment are no spawn`);
}

// §58 EVERY ICON A MODULE NAMES EXISTS (lane I, 2026-09-25 — the owner's live-view screenshot printed the word
// "undefined" in the bar: `openBtn.innerHTML = UI_ICONS.web` since 2.369.134, while `web` lives in FILE_ICONS and
// UI_ICONS has `globe`; innerHTML = undefined writes the literal string). DERIVED: every `UI_ICONS.k` /
// `FILE_ICONS.k` / `UI_ICONS['k']` spelled anywhere under src/ is a key of that object in src/lib/icons.js.
console.log('§58 every UI_ICONS / FILE_ICONS name a module spells exists in icons.js');
{
  const icons = await import(new URL('../src/lib/icons.js', import.meta.url).href);
  const have = { UI_ICONS: new Set(Object.keys(icons.UI_ICONS || {})), FILE_ICONS: new Set(Object.keys(icons.FILE_ICONS || {})) };
  const walk = (dir) => fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : /\.(c|m)?js$/.test(d.name) ? [path.join(dir, d.name)] : []));
  const files = walk('src');
  const misses = (texts) => {
    const out = [];
    for (const [f, src] of Object.entries(texts)) {
      for (const m of src.matchAll(/\b(UI_ICONS|FILE_ICONS)(?:\.([A-Za-z_$][\w$]*)|\[\s*['"]([^'"]+)['"]\s*\])/g)) {
        const k = m[2] || m[3];
        if (!have[m[1]].has(k)) out.push(`${f}:${src.slice(0, m.index).split('\n').length} ${m[1]}.${k}`);
      }
    }
    return out;
  };
  const texts = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]));
  const refs = Object.values(texts).reduce((n, src) => n + (src.match(/\b(?:UI_ICONS|FILE_ICONS)(?:\.[A-Za-z_$]|\[\s*['"])/g) || []).length, 0);
  ok(have.UI_ICONS.size > 50 && have.FILE_ICONS.size > 10 && refs > 100, `§58 census scope is non-vacuous (${have.UI_ICONS.size} UI + ${have.FILE_ICONS.size} FILE icons, ${refs} references in ${files.length} files)`);
  const bad = misses(texts);
  ok(bad.length === 0, `§58 every icon reference resolves${bad.length ? ' — ' + bad.join(' | ') : ''}`);
  const planted = misses({ ...texts, 'src/lib/browser-live-window.js': texts['src/lib/browser-live-window.js'] + "\nopenBtn.innerHTML = UI_ICONS.web;\nx.innerHTML = UI_ICONS['nope'];" });
  ok(planted.length === 2 && planted.every((p) => p.startsWith('src/lib/browser-live-window.js:')), `§58 NEGATIVE CONTROL: the shipped miss (UI_ICONS.web) and a bracket miss planted into a patched listing are both caught (${planted.join(' | ')})`);
}

// §59 ONE OUTSIDE-PRESS CLOSER (lane M, inc-muhms5kt-0ejl — the owner: "vibespace中的悬浮菜单，不相应在app画面里的点击
// 自动隐藏"). Every floating menu / popover / popup closed on a document `mousedown`, and an app's picture cancels its
// `pointerdown` — which suppresses the compatibility mousedown in EVERY phase (measured in Chrome: pointerdown 1×,
// click 1×, mousedown 0×) — so no menu ever closed on a press into the picture. The ONE closer is utils.js
// `onOutsidePress` (capture-phase pointerdown). GREP-DERIVED over every client module (comments stripped):
//  (a) no document / window / documentElement / body-level `mousedown` or `click` listener (addEventListener or an
//      on<event> property) outside a CLOSED allow-list of interaction MODES that are not closers — each row must still
//      match (a dead row fails);
//  (b) every document-level `pointerdown` listener is CAPTURE-phase (a bubble one is blind to a pane that stops it);
//  (c) the helper's own body arms `pointerdown` capture+passive and never calls preventDefault / stopPropagation.
// Planted negative controls for (a) and (b).
console.log('§59 one outside-press closer: no document mousedown/click closer, every document pointerdown in the capture phase');
{
  const ALLOW = [
    // move mode (taskbar → Move): a full-screen overlay takes every press, the capture mousedown PLACES the window and
    // swallows the press (preventDefault + stopImmediatePropagation) — an interaction mode, not a closer
    { file: 'src/lib/window.js', re: /document\.addEventListener\('mousedown', onClick, true\)/, why: 'move mode places the window' },
    // customize mode's width pick: window-capture handlers PREEMPT drag/toggle handlers while picking (each click ADDS a width)
    { file: 'src/lib/customize-mode.js', re: /window\.addEventListener\('mousedown', onDown, true\)/, why: 'width-pick swallows the press' },
    { file: 'src/lib/customize-mode.js', re: /window\.addEventListener\('click', onClick, true\)/, why: 'width-pick adds a width per click' },
  ];
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  const files = ['src/client.js', ...fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => 'src/lib/' + f)];
  const code = Object.fromEntries(files.map((f) => [f, strip(read(f))]));
  const RECV = String.raw`(?:\bdocument|\bwindow|\bglobalThis|\bself|\bownerDocument|\bdocumentElement|document\.body)`;
  const PRESS = new RegExp(RECV + String.raw`\s*\??\.\s*addEventListener\(\s*['"\x60](mousedown|click)['"\x60]`, 'g');
  const PROP = new RegExp(RECV + String.raw`\s*\.\s*on(mousedown|click)\s*=(?!=)`, 'g');
  const PDOWN = new RegExp(RECV + String.raw`\s*\??\.\s*addEventListener\(\s*['"\x60]pointerdown['"\x60]`, 'g');
  const argsAt = (t, i) => { let d = 0, j = i; for (; j < t.length; j++) { const c = t[j]; if (c === '(') d++; else if (c === ')' && --d === 0) break; } return t.slice(i, j + 1); };
  const census = (tx) => {
    const press = [], bubble = [];
    for (const [f, t] of Object.entries(tx)) {
      for (const re of [PRESS, PROP]) for (const m of t.matchAll(re)) {
        const line = t.slice(t.lastIndexOf('\n', m.index) + 1, t.indexOf('\n', m.index) < 0 ? t.length : t.indexOf('\n', m.index));
        if (!ALLOW.some((a) => a.file === f && a.re.test(line))) press.push(`${f}: ${line.trim().slice(0, 90)}`);
      }
      for (const m of t.matchAll(PDOWN)) {
        const call = argsAt(t, t.indexOf('(', m.index));
        // capture = a trailing `true` argument or an options object carrying `capture: true` (the helper's own named
        // options `o` — pinned by (c) — is admitted in utils.js only)
        if (!/,\s*true\s*\)$/.test(call) && !/\bcapture\s*:\s*true\b/.test(call) && !(f === 'src/lib/utils.js' && /,\s*o\s*\)$/.test(call))) bubble.push(`${f}: ${call.slice(0, 90)}`);
      }
    }
    return { press, bubble };
  };
  const real = census(code);
  ok(real.press.length === 0, `§59a no document/window-level mousedown or click listener outside the ${ALLOW.length}-row mode allow-list${real.press.length ? ' — ' + real.press.join(' | ') : ''}`);
  const dead = ALLOW.filter((a) => !a.re.test(code[a.file] || ''));
  ok(dead.length === 0, `§59a every allow-list row still names a live listener (no dead rows)${dead.length ? ' — dead: ' + dead.map((a) => a.file + ' ' + a.why).join(' | ') : ''}`);
  ok(real.bubble.length === 0, `§59b every document-level pointerdown listener is capture-phase${real.bubble.length ? ' — ' + real.bubble.join(' | ') : ''}`);
  // (c) the helper: capture + passive pointerdown, the options object `o` is { capture: true, passive: true, … }, and
  // its body never cancels or stops anything (the press must still reach the app)
  const U = code['src/lib/utils.js'];
  const h0 = U.indexOf('export function onOutsidePress('), h1 = U.indexOf('export function attachPopoverClose(');
  const helper = h0 >= 0 && h1 > h0 ? U.slice(h0, h1) : '';
  ok(!!helper && /const o = \{ capture: true, passive: true, signal: ctl\.signal \};/.test(helper) && /document\.addEventListener\('pointerdown', \(e\) => \{/.test(helper), '§59c onOutsidePress arms document pointerdown with { capture: true, passive: true, signal } (the `o` the (b) rule admits)');
  ok(!!helper && !/preventDefault|stopPropagation|stopImmediatePropagation/.test(helper), '§59c …and its body calls neither preventDefault nor stopPropagation (the press still reaches the app)');
  const apc = (() => { const a = U.indexOf('export function attachPopoverClose('); const b = a >= 0 ? U.indexOf('\n}\n', a) : -1; return a >= 0 && b > a ? U.slice(a, b) : ''; })();
  ok(/export function attachPopoverClose\(popover, \.\.\.excludeEls\) \{/.test(apc) && /const dispose = onOutsidePress\(popover, \(\) => popover\.remove\(\), \{ exclude: excludeEls \}\);/.test(apc) && /return dispose;/.test(apc) && !/addEventListener|setTimeout/.test(apc), '§59c attachPopoverClose (createPopover / showContextMenu / the hand-built menus) is the helper, not a second closer (it only stamps lane K\'s ownership fields — `_closeExclude` the live list the helper reads, `_closeCtl` the disposer)');
  const users = files.filter((f) => f !== 'src/lib/utils.js' && /\bonOutsidePress\(/.test(code[f])).sort();
  const WANT = ['src/lib/chat-input.js', 'src/lib/chat-renderers.js', 'src/lib/chat-status-bar.js', 'src/lib/chat-view.js', 'src/lib/customize-mode.js', 'src/lib/mobile-nav.js', 'src/lib/usage-meter.js', 'src/lib/user-todos-panel.js'];
  ok(WANT.every((f) => users.includes(f)), `§59 the eight hand-built closers route through it (${users.map((f) => f.replace('src/lib/', '')).join(' ')})`);
  // NEGATIVE CONTROLS over a patched listing (nothing written): the pre-lane closer shapes are caught
  const plant = (f, add) => census({ ...code, [f]: code[f] + '\n' + add });
  const c1 = plant('src/lib/chat-status-bar.js', "setTimeout(() => document.addEventListener('mousedown', close), 0);");
  const c2 = plant('src/lib/usage-meter.js', "document.addEventListener(\n  'click', (e) => { if (!popup.contains(e.target)) popup.classList.add('hidden'); });");
  const c3 = plant('src/lib/mobile-nav.js', "setTimeout(() => document.addEventListener('pointerdown', onTap), 0);");
  const c4 = plant('src/lib/chat-view.js', "document.onmousedown = close;");
  const c5 = plant('src/lib/window.js', "document.addEventListener('mousedown', onOther, true);");
  const c6 = plant('src/lib/chat-view.js', "const o = {}; document.addEventListener('pointerdown', close, o);");
  ok(c1.press.length === 1 && c2.press.length === 1 && c4.press.length === 1 && c5.press.length === 1 && c3.bubble.length === 1 && c3.press.length === 0 && c6.bubble.length === 1,
    `§59 NEGATIVE CONTROL: a planted document mousedown closer (the pre-lane shape), a multi-line click closer, an onmousedown property, a second capture mousedown in an allow-listed file, a bubble-phase pointerdown closer and a named-options one outside the helper are each caught (${[c1, c2, c4, c5].map((c) => c.press.length).join('/')} press, ${c3.bubble.length}/${c6.bubble.length} bubble)`);
}

// §60 THE BROWSER TOOL'S WRITE FENCE IS THE SESSION'S DIRECTORY, AND NO BROWSER DAEMON RUNS IN THE CHECKOUT
// (lane L r5 — the round-3 adversarial verify on 33781ed1: F1 CRITICAL, a relative write target was judged in the
// CLI's frame and WRITTEN in the daemon's, whose cwd was the launcher's — the keeper's execFile named none, so the
// SERVER's = the checkout, and `pdf ./data/bin/vibespace-hook.mjs` overwrote a hook every session runs; F3 MAJOR, the
// fence was the invoking shell's cwd because NO spawn path exported VIBESPACE_SESSION_CWD). Numbered 60 at the 2.369.182 integration: master holds
// §56–§58, lane M §59. DERIVED, each with a negative control:
//   a. every spawn path exports the session's own cwd — the LOCAL argv (`r6Argv`, which the dtach spawn AND the R6
//      daemon pipe both run) carries `VIBESPACE_SESSION_CWD=${spawnCwd}`; every REMOTE builder composes
//      buildRemoteExec (five), whose output carries the export (run, not grepped); ws-create spells the name once;
//   b. the CLI's fence reads ONLY that variable (`sessionRoot()` names no process.cwd()), the binary is handed the
//      IN-FRAME argv and spawned with the private cwd;
//   c. the server tree launches the browser CLI only through browser-facts' runtime, whose execFile names the cwd
//      `runDir()` chose — and `runDir` refuses the checkout even when a caller injects it.
console.log('§60 the browser tool writes in the session\'s frame; no browser daemon runs in the checkout');
{
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const wc = read('src/ws-create.js');
  const r6Block = (src) => { const a = src.indexOf('const r6Argv = ['); const b = a < 0 ? -1 : src.indexOf('spawnCmd, ...spawnArgs,', a); return a >= 0 && b > a ? src.slice(a, b) : ''; };
  const judgeLocal = (src) => /`VIBESPACE_SESSION_CWD=\$\{spawnCwd\}`/.test(r6Block(src)) && /openPipeSession\(\{[^}]*args: r6Argv\.slice\(1\)/.test(src) && /pty\.spawn\(DTACH_CMD, \[[^\]]*\.\.\.r6Argv\]/.test(src);
  ok(judgeLocal(wc), '§60a the LOCAL argv (r6Argv — run by the dtach spawn AND the R6 daemon pipe) exports VIBESPACE_SESSION_CWD=${spawnCwd}');
  ok(!judgeLocal(wc.replace('`VIBESPACE_SESSION_CWD=${spawnCwd}`', '`VIBESPACE_SESSION_CWDX=${spawnCwd}`')) && !judgeLocal(wc.replace('args: r6Argv.slice(1)', 'args: otherArgv.slice(1)')), '§60a NEGATIVE CONTROL: a local argv without the pair, or an R6 pipe that stops running r6Argv, is caught');
  const RS = req('../src/remote-shell.js');
  const shq = (x) => `'${String(x).replace(/'/g, `'"'"'`)}'`;
  const exported = (line) => line.includes(`VIBESPACE_SESSION_CWD=${shq('/w x')}; export VIBESPACE_SESSION_CWD; `) && line.indexOf('VIBESPACE_SESSION_CWD=') < line.indexOf('exec env ');
  const line = RS.buildRemoteExec({ cwd: '/w x', shq, parts: ['a'] });
  ok(exported(line) && exported(RS.buildRemoteExec({ cwd: '/w x', shq, parts: ['K=v'], tail: ' node keeper run sid 0 --' })), '§60a buildRemoteExec (every remote builder) exports the session cwd before the exec — the tail (keeper) form too');
  ok(!exported(line.replace(RS.sessionCwdExport('/w x', shq), '')), '§60a NEGATIVE CONTROL: the pre-r5 remote line (no export) is caught');
  ok((wc.match(/buildRemoteExec\(\{/g) || []).length === 5 && (wc.match(/VIBESPACE_SESSION_CWD=/g) || []).length === 1, `§60a all five remote builders compose buildRemoteExec and ws-create spells the variable once — the local pair (${(wc.match(/buildRemoteExec\(\{/g) || []).length} builders, ${(wc.match(/VIBESPACE_SESSION_CWD=/g) || []).length} spelling)`);
  const cli = read('data/bin/vibespace-browser');
  const fnBody = (src, name) => { const a = src.indexOf(`function ${name}(`); if (a < 0) return ''; let d = 0; for (let i = src.indexOf('{', a); i >= 0 && i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return src.slice(a, i + 1); } return ''; };
  const judgeCli = (src) => { const sr = fnBody(src, 'sessionRoot'); return sr.includes('process.env.VIBESPACE_SESSION_CWD') && sr.includes('process.env.VIBESPACE_JOB_CWD') && !/process\.cwd\(\)/.test(sr) && /spawn\(bin\.path, argv, \{[^}]*\bcwd: runCwd\.dir/.test(src) && /const argv = closeAllScoped \? framed\.argv\.filter\(\(x\) => x !== '--all'\) : \[\.\.\.framed\.argv\];/.test(src) && /writeRefusal\(framed\.writes\)/.test(src); };
  ok(judgeCli(cli), '§60b the CLI fences writes to VIBESPACE_SESSION_CWD (a job: VIBESPACE_JOB_CWD — accept-fixes-jobs F6) only (never process.cwd()), re-judges and hands the IN-FRAME argv, and spawns the binary in the private cwd');
  ok(!judgeCli(cli.replace('const v = IN_JOB ? process.env.VIBESPACE_JOB_CWD : process.env.VIBESPACE_SESSION_CWD;', 'const v = (IN_JOB ? process.env.VIBESPACE_JOB_CWD : process.env.VIBESPACE_SESSION_CWD) || process.cwd();')) && !judgeCli(cli.replace('{ stdio, env, cwd: runCwd.dir }', '{ stdio, env }')) && !judgeCli(cli.replace("const argv = closeAllScoped ? framed.argv.filter((x) => x !== '--all') : [...framed.argv];", "const argv = closeAllScoped ? rest.filter((x) => x !== '--all') : [...rest];")), '§60b NEGATIVE CONTROL: the r4 fence (the shell\'s cwd), a spawn with no cwd, and the r4 hand-over (words as typed — lane H\'s close --all filter over `rest`) are each caught');
  const bf = read('src/browser-facts.js');
  const judgeRt = (src) => /execFileImpl\(bin, args, \{[^}]*\bcwd: dc\.dir \}/.test(src) && /const dc = runDir\(daemonCwd\);/.test(src);
  const srcJs = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.join(d, e.name); if (e.isDirectory()) walk(r); else if (/\.js$/.test(e.name)) srcJs.push(r); } };
  walk('src');
  const runtimes = srcJs.filter((f) => /\bcreateBrowserRuntime\s*\(/.test(read(f)) && f !== 'src/browser-facts.js');
  ok(judgeRt(bf) && runtimes.length >= 2 && runtimes.every((f) => /\bF\.createBrowserRuntime\(/.test(read(f))), `§60c every browser-CLI launch from the server tree is browser-facts' runtime (${runtimes.join(' ')}), and its execFile names the cwd runDir() chose`);
  ok(!judgeRt(bf.replace('maxBuffer: 4 * 1024 * 1024, cwd: dc.dir }', 'maxBuffer: 4 * 1024 * 1024 }')), '§60c NEGATIVE CONTROL: the pre-r5 runtime (an execFile with no cwd — the SERVER\'s, the checkout) is caught');
  const F = req('../src/browser-facts.js');
  const refusedCheckout = F.runDir(() => ({ ok: true, dir: REPO }));
  const chosen = F.runDir();
  ok(refusedCheckout.ok === false && refusedCheckout.code === 'daemon_cwd_refused' && chosen.ok && chosen.dir !== REPO && !chosen.dir.startsWith(REPO + '/') && !REPO.startsWith(chosen.dir + '/'), `§60c runDir refuses the checkout even when injected, and chooses ${chosen.dir} (outside it)`);
}

// §61 A RELEASE VERDICT NEEDS A KNOWN TURN (lane P verify r2 F1, 2026-09-26). The
// keeper releases a conversation's ephemeral browser a few minutes after its
// TURN ended, asking the wiring's `conversationFacts`. `turnOf` reads
// `_isStreaming`, which only CHAT consumers write — a TERMINAL-mode session
// (plain claude/codex in a PTY) read 'idle' forever and its browser (and its
// helpers') was released 3 min after the last verb, MID-WORK. The turn is
// answered only where the session's mode PUBLISHES turn facts (`turnKnown`);
// anywhere else it is null = unknown = never released. Pinned on the wiring
// (the one place the keeper's facts are composed) and on the PURE predicate.
console.log('§61 the release verdict reads a turn only where the mode publishes one (turnKnown)');
{
  const W = read('src/server/mounts-plugins-wiring.js');
  const lift = (src) => { const m = /\n( +)conversationFacts: (\(bk\) => \{[\s\S]*?\n\1\}),\n/.exec(src); return m ? m[2] : null; };
  // every `turnOf(` in the block is the consequent of a `turnKnown(s) ?` whose alternative is null
  const judge = (blk) => {
    if (!blk) return 'no conversationFacts block';
    const calls = [...blk.matchAll(/turnOf\(/g)].length;
    const gated = [...blk.matchAll(/\bturnKnown\(s\)\s*\?\s*[\w.]*turnOf\(s\)\s*:\s*null\b/g)].length;
    if (!calls) return 'the block answers no turn at all';
    return calls === gated ? null : `${calls - gated} turnOf( read(s) not gated by turnKnown(s) ? … : null`;
  };
  const blk = lift(W);
  const why = judge(blk);
  ok(!!blk && why === null, `§61 the wiring's conversationFacts answers { turn } only through turnKnown(s) ? turnOf(s) : null${why ? ' — ' + why : ''}`);
  let TF = null; try { TF = (await import('node:module')).createRequire(import.meta.url)('../src/server/turn-facts.js'); } catch { TF = null; }
  ok(!!TF && typeof TF.turnKnown === 'function' && TF.turnKnown({ mode: 'chat' }) === true && TF.turnKnown({ mode: 'terminal', _isStreaming: false }) === false && TF.turnKnown({ mode: 'terminal', _isStreaming: true }) === false && TF.turnKnown(null) === false && TF.turnKnown({}) === false,
    '§61 PURE turnKnown: a chat session publishes turn facts; a terminal one (whatever its fields say), a mode-less record and nothing do not');
  ok(!!TF && TF.turnOf({ mode: 'terminal' }) === 'idle' && TF.turnDigest(new Map([['a', { mode: 'terminal' }]])) === '', '§61 …turnOf / turnDigest are unchanged (the For-you running dot may read a terminal session idle — it releases nothing)');
  // NEGATIVE CONTROL: the pre-fix block (the verifier's shape) and a partially gated one are caught
  const preFix = "(bk) => {\n        let s = null;\n        for (const x of activeSessions.values()) if (x && x._browserKey === bk) { s = x; break; }\n        if (!s) return { turn: null };\n        return { turn: require('./turn-facts.js').turnOf(s) };\n      }";
  const half = "(bk) => {\n        const TF = require('./turn-facts.js');\n        if (s.mode === 'chat') return { turn: TF.turnOf(s) };\n        return { turn: TF.turnKnown(s) ? TF.turnOf(s) : null };\n      }";
  const alwaysIdle = "(bk) => {\n        return { turn: 'idle' };\n      }";
  const reverted = lift(W.replace(/TF\.turnKnown\(s\) \? TF\.turnOf\(s\) : null/, 'TF.turnOf(s)'));
  ok(judge(preFix) !== null && judge(half) !== null && judge(alwaysIdle) !== null && !!reverted && reverted !== blk && judge(reverted) !== null,
    '§61 NEGATIVE CONTROL: the pre-fix answer `{ turn: turnOf(s) }`, a second ungated read beside a gated one, a block that answers no turn, and the wiring with its gate reverted (lifted the same way) are all caught');
}

// §62 A WINDOW THE USER NAMES IS REVEALED AS ITSELF (inc-muiq348r-jwb5, 2026-09-26).
// The owner on a phone: "我在手机上怎么切换不到 vibespace 大开发这个 session？" — the
// window was the HOST of a tab group showing its GUEST, and wm.focusWindow raises
// a FRAME: it switched the group's tab for a guest only. Every door that NAMES a
// window (the phone switcher's row, a sidebar card, the palette, the window list,
// go-to, find, an open-link dedupe, a singleton re-open) ended there, so naming
// the host changed nothing on screen while the title and the highlight said it
// did. The fix is ONE door, wm.revealWindow (PURE revealTab: the host is a tab
// like any other), and this census holds the whole client to it: every
// `.focusWindow(` / `wm.restore(` call in src/lib is a RAISE-ONLY site listed with
// its reason (a pointer press — pressTab keeps the tab on show; a machine path —
// the record decides; the door's own internals), and every door is counted, so a
// new path that names a window with a bare focusWindow is RED here until it is
// routed through revealWindow (or argued into the raise-only list).
console.log('§62 every path where the user names a window goes through wm.revealWindow');
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
  const cnt = (src, re) => (strip(src).match(re) || []).length;
  const FOCUS = /\.focusWindow\(/g, RESTORE = /(?:\bwm|this)\.restore\??\.?\(/g, DOOR = /\.revealWindow\(/g;
  // RAISE-ONLY sites: [focusWindow calls, restore calls, why]
  const RAISE_ONLY = {
    'src/lib/window.js': [9, 2, 'the door\'s own raise (revealWindow: its replay branch + the raise), restore\'s raise, createWindow\'s focus of a NEW window, the POINTER (_focusFromPointer ×2, beginDragFromPointer), startMoveMode, _focusMostRecent (the close / minimize handoff)'],
    'src/lib/tab-group.js': [3, 0, 'a detach and the two close handoffs — machine'],
    'src/lib/layout.js': [4, 2, 'boot restore / remote apply / preset re-apply — the RECORD decides the tab (§6b)'],
    'src/lib/stage-manager.js': [3, 0, 'the stage raising its own hero (_stageBypass ×2) + materialize named a guest of the hero\'s own group: its plain raise-only focus (verify r2 of inc-munl8jkl-gaih — shouldIntercept says no, so focusWindow never re-enters materialize)'],
    'src/lib/command-mode.js': [1, 1, 'the Tab cycle steps FRAMES (each group on the tab it shows) — it names no tab'],
    'src/lib/desktop-app-window.js': [2, 0, 'the capture pointerdowns of the main window and of a satellite (design 016 S2) — a PRESS keeps the tab'],
    'src/lib/browser-live-window.js': [1, 0, 'the fallback for an app without goToWinId (a stub app in a suite) — goToWinId IS the door'],
    'src/lib/taskbar.js': [0, 1, 'the window menu\'s Restore — a frame\'s own menu restores the frame'],
    'src/lib/session-lifecycle.js': [0, 1, '_focusExistingSession\'s REPLAY branch (a layout replay found the window already open)'],
  };
  // THE DOORS: [revealWindow calls, where]
  const DOORS = {
    'src/lib/mobile-nav.js': [2, 'the phone switcher\'s window row + its Minimized row (the incident)'],
    'src/lib/taskbar.js': [3, 'activateWindow (every taskbar button), the grouped chooser\'s row, the window list\'s row'],
    'src/lib/window.js': [1, 'the overlap switcher\'s row'],
    'src/lib/app.js': [5, 'goToWinId (go-to / Switch window / inbox / live view), flashWindow here + on another desktop, moveSessionWindow, _focusOpenInChain'],
    'src/lib/session-lifecycle.js': [2, '_focusExistingSession (sidebar card, palette, For-you / explorer / chat links, resume-already-open) + the tmux view'],
    'src/lib/chat-view.js': [2, 'the two sub-agent viewer dedupes'],
    'src/lib/workflow-detail.js': [2, 'the workflow window + its agent-log dedupe'],
    'src/lib/design-window.js': [1, 'the Design window\'s one-per-(host, dir) re-open (a replay passes { replay })'],
    'src/lib/design-home.js': [1, 'the Design window home\'s one-per-client re-open (a replay passes { replay }) — lane design-systems-home'],
    'src/lib/machine-desktop.js': [1, 'a machine\'s whole-desktop window: one per machine per page, a second open reveals it — design 014 D1'],
    'src/lib/desktop-app-window.js': [2, 'the singleton re-open (a replay passes { replay }) + a satellite the app just opened, in front — design 016 S2'],
    ...Object.fromEntries(['settings-ui', 'usage-window', 'task-log', 'task-detail', 'session-props', 'channel-window', 'channel-outbox', 'channels-panel', 'jobs-panel', 'integrations-window', 'sidebar-rail', 'browser-trace-view', 'desktop-window', 'browser-live-window', 'inbox-window']
      .map((n) => ['src/lib/' + n + '.js', [1, n === 'browser-live-window' ? 'the fold-back (D3)' : 'the singleton re-open (a replay passes { replay })']])),
  };
  const judge = (srcs) => {
    const bad = [];
    for (const [f, src] of Object.entries(srcs)) {
      const [fa, ra, why] = RAISE_ONLY[f] || [0, 0, null];
      const fc = cnt(src, FOCUS), rc = cnt(src, RESTORE), dc = cnt(src, DOOR), dw = (DOORS[f] || [0])[0];
      if (fc !== fa || rc !== ra) bad.push(`${f}: ${fc} .focusWindow( / ${rc} wm.restore( where the raise-only list says ${fa} / ${ra}${why ? ' (' + why + ')' : ''} — a path where the USER names a window goes through wm.revealWindow`);
      if (dc !== dw) bad.push(`${f}: ${dc} .revealWindow( door(s) where the census counts ${dw}${DOORS[f] ? ' (' + DOORS[f][1] + ')' : ''}`);
    }
    return bad;
  };
  const libFiles = fs.readdirSync(path.join(REPO, 'src/lib')).filter((n) => n.endsWith('.js')).map((n) => 'src/lib/' + n);
  const srcs = Object.fromEntries(libFiles.map((f) => [f, read(f)]));
  const listed = [...new Set([...Object.keys(RAISE_ONLY), ...Object.keys(DOORS)])];
  ok(libFiles.length >= 100 && listed.every((f) => srcs[f]), `§62 census scope: every src/lib/*.js (${libFiles.length} files); every listed file exists`);
  const bad = judge(srcs);
  ok(bad.length === 0, `§62 every .focusWindow( / wm.restore( in src/lib is a listed RAISE-ONLY site and every door is counted (${Object.values(DOORS).reduce((a, [n]) => a + n, 0)} doors in ${Object.keys(DOORS).length} files)${bad.length ? ' — ' + bad.join('; ') : ''}`);
  // the door's own shape: the PURE verdict, the ONE persisted tab path; the pointer keeps the tab
  const wj = read('src/lib/window.js');
  const body = (src, name) => { const i = src.indexOf('\n  ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\n  }\n', i); return src.slice(i, j); };
  const rw = body(wj, 'revealWindow'), fp = body(wj, '_focusFromPointer');
  ok(/const i = revealTab\(ch, id\);/.test(rw) && /if \(i >= 0\) this\.switchTab\(ch, i\);/.test(rw) && !/\.active\s*=/.test(rw) && /if \(replay\) \{ this\.focusWindow\(id\); return true; \}/.test(rw),
    '§62 revealWindow = PURE revealTab → switchTab (the tab click\'s own persisted, synced path — never a hand-written `active`); a replay only raises');
  const pointerPin = (b) => b.length > 40 && /pressTab\(ch, /.test(b) && !/revealWindow|revealTab/.test(b);
  ok(pointerPin(fp), '§62 _focusFromPointer (a PRESS) asks PURE pressTab and never the door — a press keeps the tab on show');
  const pin = (f, name, re) => { const b = body(read(f), name); return b.length > 40 && re.test(b) && !/\.focusWindow\(/.test(strip(b)); };
  ok(pin('src/lib/mobile-nav.js', '_buildWindowItem', /wm\.revealWindow\(win\.id\)/) && pin('src/lib/session-lifecycle.js', '_focusExistingSession', /this\.wm\.revealWindow\(winId, \{ replay \}\)/) && pin('src/lib/app.js', 'goToWinId', /this\.wm\.revealWindow\(winId\)/),
    '§62 the incident\'s doors spell it: the phone switcher row, _focusExistingSession (sidebar card / palette), goToWinId — no bare focusWindow in their bodies');
  ok(/export function activateWindow\(app, id\) \{[^}]*app\.wm\.revealWindow\(id\);/.test(read('src/lib/taskbar.js')), '§62 activateWindow (every taskbar button) is the door');
  // NEGATIVE CONTROLS (string copies, nothing written): the pre-fix switcher row, a new bare focus in an unlisted file,
  // a door silently turned back into a raise, a pointer path that switches tabs
  const mn = srcs['src/lib/mobile-nav.js'];
  const preFix = { ...srcs, 'src/lib/mobile-nav.js': mn.replace('item.onclick = () => { pop.remove(); wm.revealWindow(win.id); };', 'item.onclick = () => { pop.remove(); wm.focusWindow(win.id); };') };
  const planted = { ...srcs, 'src/lib/zz-new-panel.js': 'export function openZz(app) { for (const [, w] of app.wm.windows) if (w.type === "zz") { app.wm.focusWindow(w.id); return w; } }\n' };
  const raised = { ...srcs, 'src/lib/settings-ui.js': srcs['src/lib/settings-ui.js'].replace('this.app.wm.revealWindow(existing.id, { replay: !!syncId });', 'this.app.wm.focusWindow(existing.id);') };
  const commented = { ...srcs, 'src/lib/zz-new-panel.js': '// app.wm.focusWindow(w.id) is how this used to read\n/* wm.restore(x) */\n' };
  ok(preFix['src/lib/mobile-nav.js'] !== mn && judge(preFix).length === 1 + 1 && judge(planted).length === 1 && judge(raised).length === 2 && judge(commented).length === 0,
    `§62 NEGATIVE CONTROL: the pre-fix switcher row (${judge(preFix).length} findings), a bare focus planted in an unlisted file (${judge(planted).length}), a singleton door turned back into a raise (${judge(raised).length}) are caught; a commented-out call is not counted (${judge(commented).length})`);
  const fpBad = body(wj.replace('const target = pressTab(ch, paneWin ? paneWin.id : null);', 'const target = pressTab(ch, paneWin ? paneWin.id : null); this.revealWindow(win.id);'), '_focusFromPointer');
  ok(fpBad !== fp && !pointerPin(fpBad), '§62 NEGATIVE CONTROL: the pointer path patched to reveal (a press that would switch tabs) fails the pointer pin');
}

// §63 THE CHANNEL WITNESS CENSUS (docs/design-communication-panel.zh.md §26, backlog B-099e — the owner: "那就按照这个
// 做吧", plan A, passive). The chat's "which conversation is the agent working on" rows exist ONLY because every agent
// route that touches a channel conversation records it on the calling session (src/server/channel-touches.js through
// agent-routes' `touchChannel`). A new verb added without the call would be a hole nobody sees: the agent reads, the
// user's card stays empty. GREP-DERIVED over src/agent-routes.js (comments stripped): every
// `app.<verb>('/api/agent/channels/…'` handler body (up to its closing `});` at column 0) calls `touchChannel(`, or
// is on the CLOSED exemption list WITH its reason (an exemption nothing matches is red too). And the owner's two reads
// (src/routes/channels.js) refuse an agent's bearer. Controls are string copies (nothing written).
console.log('§63 every agent channel route that touches a conversation records it (the channel witness)');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  const EXEMPT = {
    'GET /api/agent/channels/list': 'enumerates the conversations the agent may see — it reads none of them',
    // the .195 merge (lane channel-withdraw beside this census): the drafter takes back its OWN undecided draft by proposal
    // id — it reads no conversation and drafts nothing; the draft's card says it was withdrawn and by whom, and the draft
    // itself was recorded as a `reply` / `compose` touch when it was made
    'POST /api/agent/channels/proposals/:id/withdraw': 'takes back the caller\'s own undecided draft by id — no conversation is read or drafted (the draft was recorded when it was made)',
  };
  const handlers = (src) => [...src.matchAll(/^app\.(get|post|put|patch|delete)\('(\/api\/agent\/channels\/[^']*)'/gm)].map((m) => {
    const end = src.indexOf('\n});', m.index);
    return { route: `${m[1].toUpperCase()} ${m[2]}`, body: strip(src.slice(m.index, end < 0 ? src.length : end)) };
  });
  const judge = (src) => {
    const hs = handlers(src);
    const bad = hs.filter((h) => !EXEMPT[h.route] && !/\btouchChannel\(/.test(h.body)).map((h) => `${h.route} never calls touchChannel`);
    for (const r of Object.keys(EXEMPT)) if (!hs.some((h) => h.route === r)) bad.push(`exemption '${r}' matches no handler (a dead exemption)`);
    if (!/const touchChannel = \(id, touches\) => \{[^\n]*\.recordMany\(id, touches\)/.test(src)) bad.push('touchChannel is not the witness\'s recordMany');
    return { n: hs.length, bad };
  };
  const ar = read('src/agent-routes.js');
  const j = judge(ar);
  ok(j.n >= 8, `§63 census scope is non-vacuous (${j.n} /api/agent/channels/ handlers)`);
  ok(j.bad.length === 0, `§63 every /api/agent/channels/ handler records its touch or is exempt with a reason (${Object.keys(EXEMPT).length} exempt)${j.bad.length ? ' — ' + j.bad.join('; ') : ''}`);
  const rc = read('src/routes/channels.js');
  const route = (p) => { const i = rc.indexOf(`router.get('${p}'`); return i < 0 ? '' : rc.slice(i, rc.indexOf('\n});', i)); };
  ok(['/api/channel-touches', '/api/channels/:adapterId/:convId/touches'].every((p) => /if \(isAgentBearer\(req\)\) return res\.status\(403\)/.test(route(p))),
    '§63 the owner\'s two witness reads (the session ring, the conversation\'s touchers) refuse an agent\'s bearer 403 first');
  // NEGATIVE CONTROLS: the read handler without its record, a new verb planted without one, a call that is only a comment
  const noRead = ar.replace("  if (r && r.ok) touchChannel(id, [{ op: 'read',", "  if (r && r.ok) void (id, [{ op: 'read',");
  const planted = ar + "\napp.get('/api/agent/channels/peek', (req, res) => {\n  res.json({ ok: true });\n});\n";
  const commented = ar + "\napp.get('/api/agent/channels/peek', (req, res) => {\n  // touchChannel(id, [])\n  res.json({ ok: true });\n});\n";
  const jr = judge(noRead), jp = judge(planted), jc = judge(commented);
  ok(noRead !== ar && jr.bad.length === 1 && /GET \/api\/agent\/channels\/read/.test(jr.bad[0]) && jp.bad.length === 1 && /peek/.test(jp.bad[0]) && jc.bad.length === 1,
    `§63 NEGATIVE CONTROL: the read handler without its record (${jr.bad.length}), a planted verb (${jp.bad.length}) and a verb whose only call is a comment (${jc.bad.length}) are each caught`);
}

// §66 PAIRING THAT SAYS WHERE AND WHY · EXIT ACCESS WITH A WHO (lane-pairing, B-7007 — the owner's MacBook
// 2026-09-27). Four censuses, each grep-derived with a string-copy control (nothing written):
//   (a) `allowExit` has NO reader left outside the ONE PURE reader (src/exit-reach.js exitAccessOf) and the
//       migration (migrateExitAccess + migrations.js migrateExitLists); a `delete x.allowExit` strip is not a read
//   (b) THE MINT: `agentdMintDialPair(` is called from the dial-pair ROUTE and graduateHostToDial only (two user
//       buttons), and the client POSTs /api/device/dial-pair from ONE site — the pairing dialog's `pair`, reachable
//       only from its Create pairing / Generate a new command button (and Enter in the name field) — never from a
//       dialog-open path (the incident: every re-open minted a new token)
//   (c) THE RUN BOUND: the daemon's run-cmd cap literal equals EXIT_RUN_TIMEOUT_MS; the exit routes carry no 120000
//   (d) a dial machine's row words never read `online` alone: `_buildHostRow` (sidebar-mounts) and the Machines
//       card (manage-agents) derive dot / badge / words from dialRowState
console.log('§66 pairing + exit access: allowExit readers · the mint · the run bound · row words from dialRowState');
{
  const strip = (t) => t.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l.replace(/\s\/\/\s.*$/, ''))).join('\n');
  // (a)
  const fnSpan = (src, head) => { const i = src.indexOf(head); if (i < 0) return ''; const e = src.indexOf('\n}', i); return src.slice(i, e < 0 ? src.length : e); };
  const allowReaders = (files) => {
    const bad = [];
    for (const [f, src0] of files) {
      const src = strip(src0);
      let allowed = '';
      if (f === 'src/exit-reach.js') allowed = fnSpan(src, 'function exitAccessOf(') + fnSpan(src, 'function migrateExitAccess(');
      if (f === 'src/server/migrations.js') { const i = src.indexOf('function migrateExitLists('); allowed = i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i)); }
      src.split('\n').forEach((l, i) => {
        if (!/allowExit/.test(l)) return;
        if (!/allowExit/.test(l.replace(/\bdelete [\w.]+\.allowExit;?/g, ''))) return; // only strips (`delete x.allowExit`) on this line
        if (/note: "/.test(l)) return; // the migration's own prose note
        if (allowed && allowed.includes(l)) return;
        bad.push(`${f}:${i + 1}`);
      });
    }
    return bad;
  };
  const scope = [];
  (function walk(d) { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (/\.(js|mjs|cjs)$/.test(e.name) && !/i18n-(zh|ja)\.js$/.test(e.name)) scope.push(r); } })('src');
  for (const e of fs.readdirSync(path.join(REPO, 'data/bin'))) if (!/^vibespace-agentd/.test(e) && fs.statSync(path.join(REPO, 'data/bin', e)).isFile()) scope.push('data/bin/' + e);
  scope.push('server.js');
  const files = scope.map((f) => [f, read(f)]);
  const badA = allowReaders(files);
  ok(scope.length > 300 && badA.length === 0, `§66a allowExit has no reader outside exitAccessOf / the migration (${scope.length} files)${badA.length ? ' — ' + badA.join(' ') : ''}`);
  const plantedA = allowReaders([...files, ['src/lib/sidebar-mounts.js', read('src/lib/sidebar-mounts.js') + "\nconst on = h.allowExit ? 'accent' : '';\n"]]);
  ok(plantedA.some((x) => x.startsWith('src/lib/sidebar-mounts.js')), '§66a NEGATIVE CONTROL: the pre-lane toggle\'s `h.allowExit ?` read planted into sidebar-mounts is caught');
  // (b)
  const mintSites = (fs2) => {
    const out = [];
    for (const [f, src0] of fs2) {
      const src = strip(src0);
      for (const m of src.matchAll(/agentdMintDialPair\(/g)) {
        const before = src.slice(Math.max(0, m.index - 40), m.index);
        if (/function\s+$/.test(before) || /\(\.\.\.a\) => $/.test(before)) continue; // the definition / the lazy wiring alias
        const head = src.lastIndexOf("app.post(['/api/device/dial-pair'", m.index);
        const grad = src.lastIndexOf('async function graduateHostToDial(', m.index);
        const where = head >= 0 && (grad < head) ? 'dial-pair route' : grad >= 0 ? 'graduateHostToDial' : `${f}@${m.index}`;
        out.push(`${f}:${where}`);
      }
    }
    return out;
  };
  const ms = mintSites(files);
  ok(JSON.stringify(ms.sort()) === JSON.stringify(['src/server/mounts-plugins-wiring.js:dial-pair route', 'src/server/mounts-plugins-wiring.js:graduateHostToDial']), `§66b agentdMintDialPair is called from the dial-pair route and graduateHostToDial only (${JSON.stringify(ms)})`);
  const clientPosts = (fs2) => fs2.filter(([f]) => f.startsWith('src/lib/')).flatMap(([f, src]) => [...strip(src).matchAll(/\/api\/device\/dial-pair/g)].map((m) => ({ f, i: m.index, src: strip(src) })));
  const cp = clientPosts(files);
  const pairOk = (c) => {
    if (!c || c.f !== 'src/lib/sidebar-mounts.js') return false;
    const open = c.src.lastIndexOf('async _showDevicePairDialog(', c.i);
    const pairAt = c.src.lastIndexOf('const pair = async () => {', c.i);
    const end = c.src.indexOf('\n    },', open);
    const body = c.src.slice(open, end);
    const beforePair = c.src.slice(open, pairAt);
    return open >= 0 && pairAt > open && c.i < end && !/dial-pair/.test(beforePair) && /go\.onclick = pair;/.test(body) && /\{ if \(e\.key === 'Enter'\) pair\(\); \}/.test(body) && (body.match(/\bpair\(\)/g) || []).length === 1;
  };
  ok(cp.length === 1 && pairOk(cp[0]), `§66b the client POSTs /api/device/dial-pair from ONE site — the pairing dialog's button handler (Create pairing / Generate a new command), never its open path (${cp.map((c) => c.f).join(', ')})`);
  const sm = read('src/lib/sidebar-mounts.js');
  const openMint = sm.replace("      let picker = null;\n      try {\n        const a = await api(`/api/device/dial-addresses", "      api('/api/device/dial-pair', { method: 'POST', body: '{}' });\n      let picker = null;\n      try {\n        const a = await api(`/api/device/dial-addresses");
  const cpOpen = clientPosts(files.map(([f, src]) => [f, f === 'src/lib/sidebar-mounts.js' ? openMint : src]));
  ok(openMint !== sm && !(cpOpen.length === 1 && pairOk(cpOpen[0])), '§66b NEGATIVE CONTROL: a mint planted in the dialog\'s OPEN path (the incident) is caught');
  // (c)
  const E = (await import(path.join(REPO, 'src/exit-reach.js'))).default;
  const cap = (read('src/agentd/agentd.js').match(/timeout: Math\.min\(Number\(msg\.timeoutMs\) \|\| 10000, (\d+)\)/) || [])[1];
  ok(Number(cap) === E.EXIT_RUN_TIMEOUT_MS && E.EXIT_RUN_TIMEOUT_MS === 30000, `§66c the daemon's run-cmd cap (${cap}) is EXIT_RUN_TIMEOUT_MS (${E.EXIT_RUN_TIMEOUT_MS}) — one number: daemon, CLI help, card`);
  ok(!/120000/.test(strip(read('src/server/exit-routes.js'))) && !/120000/.test(strip(read('src/exit-proxy.js'))) && /up to 30 s/.test(read('data/bin/vibespace-exit')), '§66c no 120 000 promise is left on the exit path; the CLI says 30 s');
  const capOf = (src) => Number((src.match(/timeout: Math\.min\(Number\(msg\.timeoutMs\) \|\| 10000, (\d+)\)/) || [])[1]);
  ok(capOf(read('src/agentd/agentd.js').replace('|| 10000, 30000)', '|| 10000, 120000)')) !== E.EXIT_RUN_TIMEOUT_MS, '§66c NEGATIVE CONTROL: the daemon cap raised to 120 000 without the constant is caught');
  // (d)
  const hostRow = (src) => { const i = src.indexOf('    _buildHostRow(h) {'); const e = src.indexOf('\n    },\n', i); return i < 0 ? null : strip(src.slice(i, e)); };
  const card = (src) => { const i = src.indexOf('for (const h of hostsList) {'); const e = src.indexOf('body.appendChild(det);', i); return i < 0 ? null : strip(src.slice(i, e)); };
  const hr = hostRow(sm), mc = card(read('src/lib/manage-agents.js'));
  ok(hr && mc && !/\bh\.online\b/.test(hr) && !/\bh\.online\b/.test(mc) && /dialRowState\(h\)/.test(hr) && /dialRowState\(h\)/.test(mc), '§66d the machine row and the Machines card read the dial words from dialRowState, never `online` alone');
  ok(/\bh\.online\b/.test(hostRow(sm.replace("const dot = isDial ? (rs.state === 'connected'", "const dot = isDial ? (h.online"))), '§66d NEGATIVE CONTROL: the pre-lane `h.online ?` words planted back into the row are caught');
}

// §64 REACTIONS NEVER WAKE (lane channel-threads, spec §5.4 / §6.2 — the brief's recommendation adopted as a rule
// WITH a census, not prose). A reaction is a SIDE record: it is folded at read time and it may reach an agent only as
// ONE digest line on its FREE next-turn stash (`stashFor`) — never through the wake door (`billedWake`), the watcher
// funnel (`onFresh`), the delivery ladder (`deliverToConversation`) or a watcher's `wake`. GREP-DERIVED over
// src/server/channels-engine.js (comments stripped): every engine function that writes a side record
// (`store.appendSide(`) plus the push lane's side branch are the SEEDS; the census walks every engine function they
// call (a call `name(` or a `setTimeout(name`), transitively, and fails any reached body that calls a wake site. Three
// BOUNDARIES are not descended, each with its reason (a boundary nothing reaches is a dead exemption — red). The
// adapters' `eventToSide(` callers must hand the result to the lane as a `kind: 'side'` event (never a record), and
// nothing outside the engine / the store writes a side record. Controls are string copies (nothing written).
console.log('§64 a reaction never opens a turn (the side-record census)');
{
  const ENGP = 'src/server/channels-engine.js';
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  const WAKE_SITES = /\b(billedWake|onFresh|deliverToConversation|wake)\s*\(/;
  const BOUNDARY = {
    kick: 'a reaction on a conversation with no row asks for that conversation\'s ordinary MESSAGE pass (attack 13: the row is born); what that pass finds are messages, judged as messages — the reaction itself is never a hit',
    adapterFor: 'the account\'s live entry accessor (the adapter instance the fold asks selfId / the vocabulary of) — it starts no pass and delivers nothing',
    notify: 'the `channels-updated` broadcast to the windows (the RESULT of the fold) — a broadcast is never a turn',
  };
  const census = (src) => {
    const code = strip(src);
    const decls = [...code.matchAll(/\n  (?:async\s+)?function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1], at: m.index }));
    const bodies = new Map();
    decls.forEach((d, i) => bodies.set(d.name, code.slice(d.at, i + 1 < decls.length ? decls[i + 1].at : code.length)));
    const names = new Set(bodies.keys());
    const s0 = code.indexOf("if (ev.kind === 'side' && ev.side) {");
    const s1 = s0 < 0 ? -1 : code.indexOf('const convId = ev.convId', s0);
    if (s0 < 0 || s1 < 0) return { seeds: [], reached: [], bad: ['the push lane\'s side branch was not found'], deadBoundary: [] };
    bodies.set('<push side branch>', code.slice(s0, s1));
    const seeds = ['<push side branch>', ...[...bodies].filter(([n, b]) => n !== 'onPushEvent' && n !== '<push side branch>' && /\bstore\.appendSide\(/.test(b)).map(([n]) => n)];
    const seen = new Set(), via = new Map(), queue = seeds.slice();
    while (queue.length) {
      const n = queue.shift();
      if (seen.has(n)) continue;
      seen.add(n);
      if (BOUNDARY[n]) continue;
      const b = bodies.get(n) || '';
      for (const m of [...b.matchAll(/\b(\w+)\s*\(/g), ...b.matchAll(/setTimeout\(\s*(\w+)\b/g)]) if (names.has(m[1]) && m[1] !== n && !seen.has(m[1])) { if (!via.has(m[1])) via.set(m[1], n); queue.push(m[1]); }
    }
    const pathTo = (x) => { const p = [x]; while (via.has(p[0])) p.unshift(via.get(p[0])); return p.join(' → '); };
    const bad = [...seen].filter((n) => !BOUNDARY[n] && WAKE_SITES.test(bodies.get(n) || '')).map((n) => `${pathTo(n)} calls ${(bodies.get(n).match(WAKE_SITES) || [])[1]}(`);
    const deadBoundary = Object.keys(BOUNDARY).filter((k) => !seen.has(k));
    return { seeds, reached: [...seen], bad, deadBoundary };
  };
  const esrc = read(ENGP);
  const c = census(esrc);
  ok(c.seeds.length >= 2 && c.seeds.includes('appendSides') && c.reached.includes('flushSide') && c.reached.includes('reactionDigest'), `§64 census scope is non-vacuous (seeds: ${c.seeds.join(', ')}; ${c.reached.length} functions reached, incl. the side broadcast and the digest)`);
  ok(c.bad.length === 0, `§64 no path from a side record reaches a wake site (billedWake / onFresh / deliverToConversation / wake)${c.bad.length ? ' — ' + c.bad.join('; ') : ''}`);
  ok(c.deadBoundary.length === 0, `§64 every declared boundary is reached (${Object.keys(BOUNDARY).length}, each with its reason)${c.deadBoundary.length ? ' — dead: ' + c.deadBoundary.join(', ') : ''}`);
  ok(/deliver\.stashFor\(cid, \{ source: 'channel', kind: 'notification', fromName: RX_DIGEST_FROM/.test(esrc) && !/function reactionDigest[\s\S]{0,4000}?deliverToConversation/.test(strip(esrc).slice(strip(esrc).indexOf('function reactionDigest'), strip(esrc).indexOf('function reactionDigest') + 4000)), '§64 the digest is written to the FREE stash (`stashFor`) — the one way a reaction reaches an agent');
  // the adapters: an eventToSide result leaves as a `kind: 'side'` event; nothing outside the engine / store writes a side record
  const lark = read('src/channels/live/lark.js');
  const e2s = [...strip(lark).matchAll(/eventToSide\(/g)].length;
  ok(e2s >= 2 && /kind: 'side'/.test(lark) && !/kind: 'record'[^\n]*eventToSide|eventToSide[^\n]*kind: 'record'/.test(lark), `§64 the Lark lane's eventToSide results (${e2s} sites) leave as kind 'side' events — never as a record the funnel would judge`);
  const walkJs = (d, out = []) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const f = `${d}/${e.name}`; if (e.isDirectory()) walkJs(f, out); else if (/\.js$/.test(e.name)) out.push(f); } return out; };
  const writers = walkJs('src').filter((f) => !['src/channel-store.js', ENGP].includes(f) && /\.appendSide\(/.test(strip(read(f))));
  ok(writers.length === 0, `§64 only the engine writes a side record (store.appendSide callers outside it: ${writers.length ? writers.join(', ') : 'none'})`);
  // NEGATIVE CONTROLS: the digest through the ladder, the side branch through the funnel, a new helper that wakes
  const viaLadder = esrc.replace("try { deliver.stashFor(cid, { source: 'channel', kind: 'notification', fromName: RX_DIGEST_FROM,", "try { deliver.deliverToConversation(cid, '', {}); deliver.stashFor(cid, { source: 'channel', kind: 'notification', fromName: RX_DIGEST_FROM,");
  const viaFunnel = esrc.replace("      if (w.appended) notifySide(rec.id, sideConv, w.msgs);\n", "      if (w.appended) { notifySide(rec.id, sideConv, w.msgs); track(onFresh(rec, sideConv, [], { lane })); }\n");
  const viaHelper = esrc.replace('      try { reactionDigest(rec, convId, ids, folded); }', '      try { reactionDigest(rec, convId, ids, folded); nudgeOnReaction(rec, convId); }').replace('  function reactionDigest(', '  function nudgeOnReaction(rec, convId) { return billedWake({ conv: convId }, () => null); }\n  function reactionDigest(');
  const [cl, cf, ch] = [viaLadder, viaFunnel, viaHelper].map(census);
  ok(viaLadder !== esrc && viaFunnel !== esrc && viaHelper !== esrc && cl.bad.length >= 1 && /reactionDigest calls deliverToConversation/.test(cl.bad.join()) && cf.bad.length >= 1 && /<push side branch> calls onFresh/.test(cf.bad.join()) && ch.bad.some((x) => /nudgeOnReaction calls billedWake/.test(x)),
    `§64 NEGATIVE CONTROL: the digest through the ladder (${cl.bad.length}), the side branch through the funnel (${cf.bad.length}) and a new helper the broadcast calls that wakes (${ch.bad.length}) are each caught`, JSON.stringify([cl.bad, cf.bad, ch.bad]));
  // §49's twin: the owner's reaction routes add / remove a reaction as the user — never a propose / approve (a wake door)
  const rsrc = read('src/routes/channels.js');
  const rxBlocks = rsrc.split(/\n(?=router\.(?:post|put|get|delete)\()/).filter((b) => /^router\.(post|delete)\('[^']*\/reactions/.test(b));
  ok(rxBlocks.length >= 3 && rxBlocks.every((b) => !/engine\(\)\.(propose|approve)\(|billedWake|deliverToConversation/.test(b)) && rxBlocks.some((b) => /engine\(\)\.react\(/.test(b)) && rxBlocks.some((b) => /engine\(\)\.unreact\(/.test(b)),
    `§49/§64 the owner's reaction routes (${rxBlocks.length}: add, remove, the trickle) call react / unreact / the list read — never a propose / approve, so §49's wake-door census rightly does not name them (a reaction can never start a turn: sendStartsTurn is a MESSAGE fact)`);
  // …and the agent's react verb is recorded by the witness under its own op
  const ar = strip(read('src/agent-routes.js'));
  const reactH = ar.slice(ar.indexOf("app.post('/api/agent/channels/react'"), ar.indexOf('\n});', ar.indexOf("app.post('/api/agent/channels/react'")));
  ok(/touchChannel\(id, \[\{ op: 'react'/.test(reactH) && /eng\.proposeReaction\(/.test(reactH) && !/eng\.react\(|eng\.unreact\(/.test(reactH), '§63/§64 the agent\'s react handler PROPOSES (proposeReaction — never the direct act) and records its touch as op `react`');
}

// §65 THE ACCESS GATE CENSUS (lane channel-threads verify r2, IDENTITY — the r1 digest and the r2 await / proposal holes
// were each ONE producer that never asked reach; this is the census of the class). GREP-DERIVED, comments stripped:
//   (A) THE AGENT'S ANSWERS — every engine function an `/api/agent/channels/` handler calls (src/agent-routes.js, `eng.<fn>(`),
//       plus the ones they hand their answer to (FOLLOW): (A1) a reach gate appears before the first data read; (A2) an
//       async one that awaits after its gate asks AGAIN after its last await (or is exempt with a reason); (A3) none
//       answers a bare `proposalView(` — an agent's view of a proposal is `agentProposalView` (the fate only once reach
//       is gone).
//   (B) THE AGENT'S STASH / LADDER — every engine function that calls `deliver.stashFor(` / `deliver.deliverToConversation(`
//       carries a gate (the digest's `mayHear`, a watcher's `stillInEffect` / `stillWatched`, the receipt's `drafterSees`).
//   (C) THE OWNER'S SURFACES — every function that calls `broadcast(` / `userTodos.add(` is on a CLOSED list (the owner's
//       cookie / ws / For-you inbox — reachFor answers `visible` for the user); a new one is red until named.
//   (D) THE CLI — every API path data/bin/vibespace-channels names is an agent route (never the owner's, which serves `by`).
// Controls are string copies (nothing written): a gate removed from one producer is RED.
console.log('§65 every producer that can carry a conversation\'s facts to an agent asks reach first — and again after an await');
{
  const ENGP = 'src/server/channels-engine.js';
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  const GATE = /\b(?:ACL\.canSee\(|reachFor\(ctx\b|stillSees\((?:ctx|\{)|agentProposalView\((?:ctx|by)\b|mayHear\(|stillInEffect\(|stillWatched\b|drafterSees\(|withdrawRefusal\(|F\.rowNames\(r, ctx\))/g;
  const DATA = /\b(?:store\.(?:readTail|readSide|search|findRecord)\(|withView\(|threadRead\(|reactionsFor\(|proposalView\b|deliver\.(?:stashFor|deliverToConversation)\()/;
  // lane channel-attach-read: an agent's attachment hands EVERY answer to agentAttachmentAnswer, which asks reach again
  const FOLLOW = { withdrawProposal: ['withdrawNow'], attachment: ['agentAttachmentAnswer'] };
  const EXEMPT_AWAIT = {
    request: 'answers the caller\'s OWN request record (its reason, the conversation key it named) — nothing the conversation produced; the await is the index write of that record',
    withdrawProposal: 'hands its answer to withdrawNow (judged as its own row)',
    attachment: 'an agent\'s answer after the fetch / the join / the held write goes through agentAttachmentAnswer, which asks reach AGAIN (judged as its own row); the owner\'s window calls it with no principal',
  };
  const OWNER = {
    notify: 'the `channels-updated` broadcast to the owner\'s windows (the ws is the owner\'s cookie session)',
    notifyOutbox: 'the Outbox broadcast to the owner\'s windows',
    pointerSync: 'the owner\'s For-you pointer to proposals awaiting approval',
    composePointerSync: 'the owner\'s For-you pointer to composed messages awaiting approval',
    speakUnknown: 'the owner\'s For-you item for a lost outcome',
    speakFailure: 'the owner\'s For-you item for a failing account',
    speakUnsaved: 'the owner\'s For-you item for an unsaved token',
    request: 'files the OWNER\'s For-you item for an agent\'s access request (the owner decides it)',
    fileWatchRequest: 'files the OWNER\'s For-you item for an agent\'s WAKE watch request (lane channel-agent-watch: the owner approves the billed notification)',
  };
  const census = (esrc, asrc, cli) => {
    const code = strip(esrc);
    const decls = [...code.matchAll(/\n  (?:async\s+)?function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1], at: m.index }));
    const bodies = new Map();
    decls.forEach((d, i) => bodies.set(d.name, code.slice(d.at, i + 1 < decls.length ? decls[i + 1].at : code.length)));
    const ar = strip(asrc);
    const handlers = [...ar.matchAll(/^app\.(get|post|put|patch|delete)\('(\/api\/agent\/channels\/[^']*)'/gm)].map((m) => { const end = ar.indexOf('\n});', m.index); return ar.slice(m.index, end < 0 ? ar.length : end); });
    const roster = new Set();
    for (const h of handlers) for (const m of h.matchAll(/\beng\.(\w+)\(/g)) roster.add(m[1]);
    for (const n of [...roster]) for (const f of FOLLOW[n] || []) roster.add(f);
    const bad = [];
    for (const n of roster) {
      const b = bodies.get(n);
      if (!b) { bad.push(`(A) ${n}: an agent route calls it but the engine declares no such function`); continue; }
      const gates = [...b.matchAll(GATE)].map((m) => m.index);
      const d = DATA.exec(b);
      if (!gates.length && !FOLLOW[n]) bad.push(`(A1) ${n} never asks reach`);
      else if (gates.length && d && d.index < gates[0]) bad.push(`(A1) ${n} reads ${d[0]} before it asks reach`);
      const firstGate = gates.length ? gates[0] : -1;
      const awaits = [...b.matchAll(/\bawait\b/g)].map((m) => m.index).filter((i) => i > firstGate);
      if (awaits.length && !EXEMPT_AWAIT[n] && !(gates.length && gates[gates.length - 1] > awaits[awaits.length - 1])) bad.push(`(A2) ${n} answers after an await without asking reach again`);
      if (/\bproposalView\b/.test(b)) bad.push(`(A3) ${n} answers a bare proposalView( — an agent's view of a proposal is agentProposalView`);
    }
    const ladder = [...bodies].filter(([, b]) => /\bdeliver\.(?:stashFor|deliverToConversation)\(/.test(b)).map(([n]) => n);
    for (const n of ladder) if (!(bodies.get(n).match(GATE) || []).length) bad.push(`(B) ${n} hands an agent something without a gate`);
    const owners = [...bodies].filter(([, b]) => /\bbroadcast\(|\buserTodos\.add\(/.test(b)).map(([n]) => n);
    for (const n of owners) if (!OWNER[n]) bad.push(`(C) ${n} is a new owner surface (broadcast / For-you) — name it with its reason`);
    for (const n of Object.keys(OWNER)) if (!owners.includes(n)) bad.push(`(C) owner surface '${n}' matches no function (a dead row)`);
    for (const n of Object.keys(EXEMPT_AWAIT)) if (!roster.has(n)) bad.push(`(A2) exemption '${n}' is no agent answer (a dead row)`);
    const paths = [...cli.matchAll(/['`"](\/api\/[^'`"$]*)/g)].map((m) => m[1]);
    for (const p of paths) if (!p.startsWith('/api/agent/channels/')) bad.push(`(D) the CLI calls ${p} — not an agent route`);
    return { roster: [...roster], ladder, owners, paths, bad };
  };
  // (D) for the EXIT CLI too (lane-exit-run-output E4): a machine's command history has an OWNER route
  // (GET /api/hosts/:id/exit-runs — every conversation's runs there, 403 for any bearer) and an AGENT route
  // (GET /api/agent/exit/runs — the caller's own); data/bin/vibespace-exit may name agent routes only
  const exitCliPaths = (src) => [...src.matchAll(/['`"](\/api\/[^'`"$?]*)/g)].map((m) => m[1]);
  const exitCliBad = (src) => exitCliPaths(src).filter((p) => !p.startsWith('/api/agent/exit')).map((p) => `(D) vibespace-exit calls ${p} — not an agent route`);
  const esrc = read(ENGP), asrc = read('src/agent-routes.js'), cli = read('data/bin/vibespace-channels');
  const c = census(esrc, asrc, cli);
  const xcli = read('data/bin/vibespace-exit');
  const xpaths = exitCliPaths(xcli);
  ok(xpaths.length >= 4 && xpaths.some((p) => p === '/api/agent/exit/runs') && exitCliBad(xcli).length === 0, `§65 (D) vibespace-exit names agent routes only (${xpaths.length} paths incl. /api/agent/exit/runs) — never the owner's /api/hosts/:id/exit-runs`, exitCliBad(xcli));
  const xctl = exitCliBad(xcli.replace("'/api/agent/exit/runs?'", "'/api/hosts/' + machine + '/exit-runs?'"));
  ok(xctl.length === 1 && /vibespace-exit calls \/api\/hosts\//.test(xctl[0]), '§65 (D) NEGATIVE CONTROL: the exit CLI pointed at the owner\'s command list (/api/hosts/…/exit-runs) is caught by name', xctl);
  ok(/isAnyBearer\(req\)\) return res\.status\(403\)\.json\(\{ error: 'the machine\\'s command history is the user\\'s/.test(read('src/server/exit-routes.js')), '§65 (C) the owner\'s command list refuses any bearer 403 human_only (exit-routes.js)');
  const want = ['listFor', 'readFor', 'readThreadFor', 'agentRefresh', 'agentThreadRefresh', 'propose', 'proposeReaction', 'compose', 'replaceProposal', 'withdrawProposal', 'withdrawNow', 'searchFor', 'statusFor', 'accessFor', 'request', 'attachment', 'agentAttachmentAnswer'];
  ok(want.every((n) => c.roster.includes(n)) && c.ladder.length >= 4 && c.paths.length >= 10, `§65 census scope is non-vacuous (${c.roster.length} agent answers, ${c.ladder.length} ladder producers: ${c.ladder.join(', ')}, ${c.owners.length} owner surfaces, ${c.paths.length} CLI paths)`, JSON.stringify(c.roster));
  ok(c.bad.length === 0, `§65 every agent answer asks reach first and again after an await, every stash/ladder producer carries a gate, every owner surface is named, the CLI names agent routes only${c.bad.length ? ' — ' + c.bad.join('; ') : ''}`);
  // NEGATIVE CONTROLS (string copies): one gate removed from one producer each
  const cut = (src, a, b) => { if (src.split(a).length !== 2) return null; return src.replace(a, b); };
  const controls = [
    ['the thread read without its reach door', cut(esrc, "  function readThreadFor(ctx, adapterId, convId, msg, { limit = 50 } = {}) {\n    const { en, rec } = convFor(adapterId, convId);\n    if (!en || !rec || rec.enabled === false) return ACL.notFound();\n    if (!ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();", "  function readThreadFor(ctx, adapterId, convId, msg, { limit = 50 } = {}) {\n    const { en, rec } = convFor(adapterId, convId);\n    if (!en || !rec || rec.enabled === false) return ACL.notFound();"), /\(A1\) readThreadFor/],
    ['status answering the whole proposal', cut(esrc, '    return { ok: true, proposals: mine.slice(0, 50).map((p) => agentProposalView(ctx, p)) };', '    return { ok: true, proposals: mine.slice(0, 50).map(proposalView) };'), /\(A3\) statusFor/],
    ['the agent\'s walk without its re-ask', cut(esrc, "    if (!stillSees(ctx, adapterId, convId)) return ACL.notFound();\n    // a thread this conversation never named", "    // a thread this conversation never named"), /\(A2\) agentThreadRefresh/],
    ['the reaction digest without mayHear', cut(esrc, '      if (!mayHear(cid)) continue;\n', ''), null],
    ['a new owner surface', esrc.replace('  function reactionDigest(', '  function nudgeOwner(x) { return broadcast({ type: \'x\', x }); }\n  function reactionDigest('), /\(C\) nudgeOwner/],
    ['the attachment answer without its re-ask', cut(esrc, '    if (!stillSees(ctx, adapterId, convId)) return ACL.notFound();\n    if (!r || !r.ok) return r;', '    if (!r || !r.ok) return r;'), /\(A1\) agentAttachmentAnswer never asks reach/],   // lane channel-attach-read (appended: controls[3] is patched by index below)
  ];
  // (the digest control: mayHear's declaration stays, so the census's (B) still finds a gate token — the RUNTIME leg,
  // test-channels-engine ⑱ (c), is that producer's control; here a digest with NO gate token at all)
  controls[3][1] = controls[3][1] && controls[3][1].replace(/    const reach = new Map\(\);\n    const mayHear = [\s\S]*?\n    \};\n/, '');
  controls[3][2] = /\(B\) reactionDigest/;
  const planted = asrc.replace("app.get('/api/agent/channels/status',", "app.get('/api/agent/channels/peek', (req, res) => {\n  const hit = agentSession(req, res);\n  res.json(eng.peekFor(hit));\n});\napp.get('/api/agent/channels/status',");
  const plantedEng = esrc.replace('  function statusFor(ctx, proposalId = null) {', '  function peekFor(ctx) { return { ok: true, rows: store.readTail(\'a\', \'c\', { limit: 5 }) }; }\n  function statusFor(ctx, proposalId = null) {');
  const cp = census(plantedEng, planted, cli);
  const cliBad = census(esrc, asrc, cli.replace("'/api/agent/channels/list'", "'/api/channels/list'"));
  const results = controls.map(([name, src, re]) => { const r = src ? census(src, asrc, cli) : { bad: ['(setup) the control\'s anchor was not found once'] }; return { name, ok: !!src && r.bad.some((x) => re.test(x)), bad: r.bad }; });
  ok(results.every((r) => r.ok) && cp.bad.some((x) => /\(A1\) peekFor never asks reach/.test(x)) && cliBad.bad.some((x) => /\(D\) the CLI calls \/api\/channels\/list/.test(x)),
    `§65 NEGATIVE CONTROLS: ${results.map((r) => `${r.name} (${r.ok ? 'RED' : 'missed'})`).join(', ')}, a planted agent route over an ungated read (RED), the CLI pointed at an owner route (RED)`, JSON.stringify(results.filter((r) => !r.ok)));
}

// §65b lane lark-threads (B3): THE OWNER'S NAME FOR AN AUTHOR is an OWNER surface — its one route (PATCH
// /api/channels/:adapterId/authors/:id) refuses an agent bearer BY NAME before it reaches the engine, no agent route
// (src/agent-routes.js) and no CLI path (data/bin/vibespace-channels) names `setAlias` / `/authors/`, and the engine's
// setter answers through `notify` (the owner's `channels-updated`) — never a ladder / stash. A string copy without the
// refusal is RED.
console.log('§65b the owner\'s name for an author: owner-only, never an agent surface');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  const judge = (rsrc, asrc, cli, esrc) => {
    const R = strip(rsrc), E = strip(esrc);
    const at = R.indexOf("router.patch('/api/channels/:adapterId/authors/:id'");
    const body = at < 0 ? '' : R.slice(at, R.indexOf('\n});', at));
    const refuse = body.indexOf('refuseAgentBearer(req, res'), call = body.indexOf('engine().setAlias(');
    const fn = E.slice(E.indexOf('  async function setAlias('), E.indexOf('\n  }\n', E.indexOf('  async function setAlias(')));
    return {
      route: at >= 0 && refuse > 0 && call > refuse,
      agentFree: !/setAlias|\/authors\//.test(strip(asrc)) && !/\/authors\//.test(cli),
      ownerOnly: /notify\(\[\], \{ full: false, extra: \{ authors:/.test(fn) && !/deliver\.(?:stashFor|deliverToConversation)\(/.test(fn),
    };
  };
  const rsrc = read('src/routes/channels.js'), asrc = read('src/agent-routes.js'), cli = read('data/bin/vibespace-channels'), esrc = read('src/server/channels-engine.js');
  const j = judge(rsrc, asrc, cli, esrc);
  ok(j.route && j.agentFree && j.ownerOnly, '§65b the alias route refuses an agent bearer before the engine; no agent route / CLI path names it; the setter answers the owner\'s broadcast only', JSON.stringify(j));
  const noRefuse = rsrc.replace("    if (refuseAgentBearer(req, res, 'a name for an author is the owner\\'s — an agent token may not set one')) return;\n", '');
  const plantedAgent = asrc + "\napp.patch('/api/agent/channels/authors/:id', (req, res) => res.json(eng.setAlias('a', req.params.id, req.body.alias)));\n";
  ok(noRefuse !== rsrc && !judge(noRefuse, asrc, cli, esrc).route && !judge(rsrc, plantedAgent, cli, esrc).agentFree, '§65b NEGATIVE CONTROLS: the route without its agent refusal (RED), a planted agent route over the setter (RED)');
}

// §64b lane channel-threads i18n: every t() / tr() literal the lane's client surfaces draw has a zh AND a ja entry
// (i18n-check in the build proves the two dictionaries agree; this proves the new words are IN them)
console.log('§64b the lane\'s new words are in both dictionaries');
{
  const dictOf = (f) => { const m = new Set(); for (const ln of read(f).split('\n')) { const x = /^  ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"): /.exec(ln); if (x) { try { m.add(new Function('return ' + x[1])()); } catch { } } } return m; };
  const zh = dictOf('src/lib/i18n-zh.js'), ja = dictOf('src/lib/i18n-ja.js');
  // 2026-09-28 (reply placements): + the PURE policy (the card's placement line, its refusal words) and the touch row's words
  const FILES = ['src/channel-caps.js', 'src/lib/channel-thread-pane.js', 'src/lib/reaction-picker.js', 'src/lib/channel-window.js', 'src/lib/channel-outbox.js', 'src/lib/channel-words.js', 'src/lib/channel-filter-editor.js', 'src/lib/channel-account-dialogs.js', 'src/channel-policy.js', 'src/channel-touch.js'];
  const keys = new Set();
  for (const f of FILES) for (const m of read(f).matchAll(/\b(?:t|tr)\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g)) { try { keys.add(new Function('return ' + m[1])()); } catch { } }
  const LANE = ['{n} replies', 'last {age}', 'in thread', 'Reply in thread…', 'Add reaction', 'in thread · open to load', 'replying to a message not loaded', 'Lands inside this thread', 'This group does not allow replies in threads', 'Reactions can be read after one Re-authorize ({scopes})', '{names} and {n} more', 'Search emoji', 'Replaces your {glyph}', 'That emoji is not one this channel allows', 'You already reacted with that', 'This message has reached its reaction limit', 'This message cannot be reacted to', 'Only a reaction you added can be removed', 'This channel has no reactions', 'Replying in a thread is not offered here', 'Reactions are not offered here ({why})', '{agent} wants to react {glyph} to {author}: "{quote}"', 'Quoted reply — to {author}: "{quote}"', 'Reply in thread, also shown in the chat — under {author}: "{quote}"', 'That message is inside a thread — a reply to it goes in the thread', 'drafted a reply in a thread'];
  // one literal predates the lane and is the same glyph in every language (a lone ellipsis — the "…" menu button)
  const SAME_IN_EVERY_LANGUAGE = new Set(['…']);
  const missing = [...keys].filter((k) => !SAME_IN_EVERY_LANGUAGE.has(k) && (!zh.has(k) || !ja.has(k)));
  ok(LANE.every((k) => keys.has(k)) && keys.size >= 100, `§64b the census reads the lane's surfaces (${keys.size} literals, the ${LANE.length} spec §4.6 / §9 strings among them)`, LANE.filter((k) => !keys.has(k)).join(' | '));
  ok(missing.length === 0, `§64b every literal has zh + ja${missing.length ? ' — missing: ' + missing.slice(0, 8).join(' | ') : ''}`);
}

// §67 THE HOT-SWITCH VERDICT IS A MEASUREMENT (lane-hot-switch, 2026-09-30). Every reader of
// `capsOf(backend).hotSwitch === 'verified'` (the pool's hot re-point, ws-create's held stamp, the
// held-member rule, the reset credit's identity) acts as if a RUNNING process follows its link. The
// first 'verified' (2.368.21) rested on a file-system test and decompiled code, and a telemetry
// label was later read as its refutation. So: a 'verified' row carries `hotSwitchEvidence` whose
// record file SHOWS the link followed on the pinned CLI, plus the heavy gate that re-measures the
// installed CLI; nothing but the caps rows ever states the verdict, and no runtime prober flips it.
console.log('§67 the hot-switch verdict is a measurement with its record');
{
  const caps = (await import('node:module')).createRequire(import.meta.url)(path.join(REPO, 'src/backend-caps.js'));
  const verdictProblems = (rows) => {
    const bad = [];
    for (const [be, row] of Object.entries(rows)) {
      if (!['verified', 'impossible', 'unverified'].includes(row.hotSwitch)) bad.push(`${be}: unknown verdict ${JSON.stringify(row.hotSwitch)}`);
      if (row.hotSwitch !== 'verified') continue;
      const ev = row.hotSwitchEvidence;
      if (!ev || !ev.cli || !ev.measuredAt || !ev.mechanism || !ev.record || !ev.gate) { bad.push(`${be}: 'verified' without a complete hotSwitchEvidence`); continue; }
      let rec = null; try { rec = JSON.parse(read(ev.record)); } catch { }
      if (!rec) { bad.push(`${be}: the record ${ev.record} is unreadable`); continue; }
      if (!String(rec.cli || '').startsWith(ev.cli)) bad.push(`${be}: the record measured ${rec.cli}, the row pins ${ev.cli}`);
      const m2 = rec.variants?.symlink?.requests?.msg2 || [];
      if (!(m2.length && m2.every((a) => a === 'B:200'))) bad.push(`${be}: the record does not show the link followed (symlink msg2 = ${JSON.stringify(m2)})`);
      if (!fs.existsSync(path.join(REPO, ev.gate))) bad.push(`${be}: the gate ${ev.gate} is missing`);
    }
    return bad;
  };
  const bad = verdictProblems(caps.BACKEND_CAPS);
  ok(bad.length === 0 && caps.capsOf('claude').hotSwitch === 'verified', `§67 every 'verified' row carries a record that shows the link followed${bad.length ? ' — ' + bad.join(' | ') : ''}`);
  const ciSrc = read('scripts/ci.mjs');
  ok(/\{ name: 'test-claude-hot-switch', tier: 'heavy'/.test(ciSrc), '§67 the re-measuring gate is in the HEAVY tier (a real binary)');
  ok(caps.setVerifiedCap('claude', 'hotSwitch', 'impossible') === false && caps.setVerifiedCap('claude', 'hotSwitchEvidence', null) === false && caps.capsOf('claude').hotSwitch === 'verified',
    '§67 no runtime prober can flip the switching verdict (setVerifiedCap refuses it)');
  // nothing but the caps rows (and the ACP harness's own row) STATES a verdict
  const writers = [];
  const walk67 = (dir) => fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk67(dir + '/' + d.name) : /\.(c|m)?js$/.test(d.name) ? [dir + '/' + d.name] : []));
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
  for (const f of walk67('src')) {
    if (!f.endsWith('.js') || f === 'src/backend-caps.js' || f === 'src/harnesses/acp.js') continue;
    const src = strip(read(f));
    if (/hotSwitch\s*:\s*['"]/.test(src) || /\.hotSwitch\s*=[^=]/.test(src)) writers.push(f);
  }
  ok(writers.length === 0, `§67 no module outside the caps rows states or assigns a hotSwitch verdict${writers.length ? ' — ' + writers.join(' ') : ''}`);
  // NEGATIVE CONTROLS: the checker sees a bare 'verified' and a record that shows the process HELD
  const ctl1 = verdictProblems({ x: { hotSwitch: 'verified' } });
  const heldRec = path.join(os.tmpdir(), 'vs-arch-hotsw-' + process.pid + '.json');
  fs.writeFileSync(heldRec, JSON.stringify({ cli: '9.9.9', variants: { symlink: { requests: { msg2: ['A:200'] } } } }));
  let ctl2;
  try { ctl2 = verdictProblems({ y: { hotSwitch: 'verified', hotSwitchEvidence: { cli: '9.9.9', measuredAt: 'x', mechanism: 'x', record: path.relative(REPO, heldRec), gate: 'scripts/test-claude-hot-switch.mjs' } } }); } finally { try { fs.unlinkSync(heldRec); } catch { } }
  ok(ctl1.some((x) => /without a complete hotSwitchEvidence/.test(x)) && ctl2.some((x) => /does not show the link followed/.test(x)),
    '§67 NEGATIVE CONTROLS: a bare \'verified\' and a record showing the process held its first member are both caught', JSON.stringify({ ctl1, ctl2 }));
}

// §68 A SUITE'S REACH INTO A HOME IS $HOME (lane profile-lock-roll verify r6; r5's F5 held, fixed here). A suite that must not touch
// the owner's home is run under a pinned HOME; a read of `os.userInfo().homedir` (the passwd entry) or a literal `/home/<name>`
// reaches past the pin — test-browser-propose-chrome linked the OWNER's ~/.agent-browser/browsers into its fake home that way
// (read-only binaries, never profiles; os.homedir() now, like test-browser-live). DERIVED over every scripts/*.mjs: no
// `userInfo().homedir` outside a comment (test-browser-verbs' preload DESCRIBES the passwd read it pins — a comment line); a
// literal /home/<name> is red only when <name> is a REAL account of this machine (/etc/passwd, a home under /home/) — the scripts'
// fixture homes (/home/u, /home/user, /home/tester, /home/vibe, …) are strings, never a reach.
console.log('§68 a suite reaches a home through $HOME only');
{
  let locals = new Set(); try { locals = new Set(fs.readFileSync('/etc/passwd', 'utf8').split('\n').map((l) => l.split(':')).filter((p) => p[5] && p[5].startsWith('/home/')).map((p) => p[0])); } catch { locals = new Set(); }
  const judge = (src, accounts = locals) => { const hits = []; const code = src.split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n'); for (const m of code.matchAll(/userInfo\(\)\s*\.\s*homedir/g)) hits.push(`${code.slice(0, m.index).split('\n').length}: userInfo().homedir`); for (const m of code.matchAll(/['"`]\/home\/([^/'"`\s]+)/g)) if (accounts.has(m[1])) hits.push(`${code.slice(0, m.index).split('\n').length}: /home/${m[1]}`); return hits; };
  const scope = fs.readdirSync('scripts').filter((f) => f.endsWith('.mjs') && f !== 'test-architecture.mjs').map((f) => 'scripts/' + f);
  const bad = scope.map((f) => [f, judge(fs.readFileSync(f, 'utf8'))]).filter(([, h]) => h.length);
  ok(scope.length >= 100, `§68 census scope is non-vacuous (${scope.length} scripts; ${locals.size} local accounts under /home)`);
  ok(bad.length === 0, `§68 no suite reads the passwd home or names a real account's /home/<name>${bad.length ? ' — ' + bad.map(([f, h]) => f + ' [' + h.join(' ; ') + ']').join(' | ') : ''}`);
  ok(judge("const realBrowsers = path.join(os.userInfo().homedir, '.agent-browser');").length === 1 && judge("// a comment naming os.userInfo().homedir\nconst h = path.join(os.homedir(), 'x');").length === 0 && judge("const h = '/home/alice/.agent-browser';", new Set(['alice'])).length === 1 && judge("const h = '/home/u/.agent-browser'; const g = path.join(os.homedir(), 'x');", new Set(['alice'])).length === 0,
    '§68 NEGATIVE CONTROLS: the passwd read is caught (not in a comment); a real account\'s literal home is caught; a fixture home and os.homedir() pass');
  // verify r7 (T2 ④): the PRODUCT too — a lane env pins HOME to a scratch home and src/ must never reach the real one past it:
  // src/**, server.js read NO passwd home (the keeper's own ~/.agent-browser is os.homedir()); data/bin holds exactly TWO deliberate
  // passwd reads, each with its reason in the file — vibespace-browser reads THE ACCOUNT's home on purpose (r4 takeover finding 2:
  // an agent's `HOME=/tmp/mine` must not make its file "the machine's own config"), vibespace-window lists every home spelling for
  // the screenshot allow-list. A third site, or one of these without its reason, is red.
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : (e.name.endsWith('.js') || e.name.endsWith('.mjs') ? [path.join(d, e.name)] : [])));
  const srcScope = [...walk('src'), 'server.js'];
  const srcBad = srcScope.map((f) => [f, judge(fs.readFileSync(f, 'utf8')).filter((h) => h.includes('userInfo().homedir'))]).filter(([, h]) => h.length);
  ok(srcScope.length >= 300, `§68 src census scope is non-vacuous (${srcScope.length} files)`);
  ok(srcBad.length === 0, `§68 src/ + server.js read no passwd home (the product reaches a home through $HOME / os.homedir() only)${srcBad.length ? ' — ' + srcBad.map(([f, h]) => f + ' [' + h.join(' ; ') + ']').join(' | ') : ''}`);
  const BIN_ALLOW = { 'data/bin/vibespace-browser': /THE ACCOUNT'S HOME, never \$HOME/, 'data/bin/vibespace-window': /SHOT_HOMES/ };
  const binFiles = fs.readdirSync('data/bin').filter((f) => { try { return fs.statSync(path.join('data/bin', f)).isFile(); } catch { return false; } }).map((f) => 'data/bin/' + f);
  const binHits = binFiles.map((f) => { const src = fs.readFileSync(f, 'utf8'); return [f, judge(src).filter((h) => h.includes('userInfo().homedir')), src]; }).filter(([, h]) => h.length);
  const binUnlisted = binHits.filter(([f]) => !(f in BIN_ALLOW)).map(([f, h]) => f + ' [' + h.join(' ; ') + ']');
  const binUnreasoned = binHits.filter(([f, , src]) => f in BIN_ALLOW && !BIN_ALLOW[f].test(src)).map(([f]) => f);
  const binMissing = Object.keys(BIN_ALLOW).filter((f) => !binHits.some(([g]) => g === f));
  ok(binUnlisted.length === 0 && binUnreasoned.length === 0 && binMissing.length === 0, `§68 data/bin reads the passwd home at exactly its two DELIBERATE sites, each carrying its reason (${binHits.map(([f]) => f).join(', ')})${binUnlisted.length ? ' — unlisted: ' + binUnlisted.join(' | ') : ''}${binUnreasoned.length ? ' — reason missing: ' + binUnreasoned.join(', ') : ''}${binMissing.length ? ' — allow-listed but gone (prune the list): ' + binMissing.join(', ') : ''}`);
}

// §69 EVERY ROOT PACKAGE RUN GOES THROUGH THE MACHINE'S ONE PACKAGE SLOT (Layer 0 apps, docs/design-app-persistence.zh.md
// §3.1 — "一台机器一个包槽": the xpra install, the LibreOffice installs and now the apps (install / remove / refresh / the
// boot replay) are the THIRD kind of `sudo -n` site, and the slot is what keeps two apt runs off one machine). DERIVED over
// the server tree (src/, comments stripped; the browser bundle in src/lib is out — it spawns nothing):
//   (a) a line that runs a PACKAGE MANAGER under `sudo -n` exists only in a DECLARED row (a remote host's bootstrap, before
//       any VibeSpace agent — hence any slot — runs there);
//   (b) the argv-array spelling `['sudo', '-n'` (a root SCRIPT the slot runs) is built in exactly the two plan builders:
//       desktop-apps.js installArgv and app-manifest.js appArgv;
//   (c) their outputs reach a machine only through the slot: `installArgv(` and `plan.argv` are read only in
//       src/server/desktop-access.js, `installLauncherArgv(` only there (runArgv), `appArgv(` only in the machine half
//       (src/app-serve.js — whose plans hand the argv to the slot);
//   (d) every direct `execFile('sudo'` / `spawn('sudo'` names a command that is neither a package manager nor a shell.
console.log('§69 every root package run goes through the machine\'s ONE package slot');
{
  const PKG = /\b(?:apt-get|apt|dpkg|yum|dnf|apk|zypper|pacman)\b/;
  // comment LINES only (a `/*` inside a shell script held in a template literal — `bin/*` — must not swallow the code after it)
  const strip68 = (t) => t.split('\n').map((l) => (/^\s*(?:\/\/|\*|\/\*)/.test(l) ? '' : l)).join('\n');
  const walk68 = (dir) => fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? (d.name === 'lib' && dir === 'src' ? [] : walk68(dir + '/' + d.name)) : /\.(c|m)?js$/.test(d.name) ? [dir + '/' + d.name] : []));
  const DECLARED = { 'src/hosts.js': 'a REMOTE host\'s bootstrap installs dtach over ssh before any VibeSpace agent runs there — no slot exists yet; nothing of the apps catalog' };
  const census = (files) => {
    const out = { pkgLines: [], argvBuilders: [], consumers: { installArgv: [], planArgv: [], launcher: [], appArgv: [] }, directSudo: [] };
    for (const [f, raw] of Object.entries(files)) {
      const t = strip68(raw);
      t.split('\n').forEach((l, i) => {
        if (/sudo -n /.test(l) && PKG.test(l.slice(l.indexOf('sudo -n')))) out.pkgLines.push(`${f}:${i + 1}`);
        if (/\[\s*'sudo'\s*,\s*'-n'/.test(l)) out.argvBuilders.push(f);
        if (/(?:^|[^\w.])installArgv\(|\bM\.installArgv\(/.test(l) && !/function installArgv\(/.test(l)) out.consumers.installArgv.push(f); // desktop-apps' — never browser-switch's own npm argv (SW.installArgv)
        if (/\bplan\.argv\b/.test(l)) out.consumers.planArgv.push(f);
        if (/\binstallLauncherArgv\(/.test(l) && !/function installLauncherArgv\(/.test(l)) out.consumers.launcher.push(f);
        if (/\bappArgv\(/.test(l) && !/function appArgv\(/.test(l)) out.consumers.appArgv.push(f);
        const m = /\b(?:execFile|execFileSync|spawn|spawnSync)\(\s*'sudo'\s*,\s*\[\s*'-n'\s*,\s*'([^']+)'/.exec(l);
        if (m && (PKG.test(m[1]) || /^(?:sh|bash|dash)$/.test(m[1]))) out.directSudo.push(`${f}:${i + 1} (${m[1]})`);
      });
    }
    const uniq = (a) => [...new Set(a)].sort();
    out.argvBuilders = uniq(out.argvBuilders);
    for (const k of Object.keys(out.consumers)) out.consumers[k] = uniq(out.consumers[k]);
    return out;
  };
  const files = Object.fromEntries(walk68('src').concat(['server.js']).map((f) => [f, read(f)]));
  const c = census(files);
  ok(Object.keys(files).length > 150 && c.argvBuilders.length >= 2, `§69 census scope: the server tree (${Object.keys(files).length} files)`);
  const undeclared = c.pkgLines.filter((x) => !DECLARED[x.split(':')[0]]);
  ok(undeclared.length === 0 && c.pkgLines.some((x) => x.startsWith('src/hosts.js:')), `§69a a package manager under \`sudo -n\` only in a declared row (${c.pkgLines.join(' ')})${undeclared.length ? ' — UNDECLARED: ' + undeclared.join(' ') : ''}`);
  ok(JSON.stringify(c.argvBuilders) === JSON.stringify(['src/app-manifest.js', 'src/desktop-apps.js']), `§69b the root-script argv ['sudo', '-n', …] is built only by the two plan builders (${c.argvBuilders.join(' ')})`);
  ok(JSON.stringify(c.consumers.installArgv) === JSON.stringify(['src/server/desktop-access.js']) && JSON.stringify(c.consumers.planArgv) === JSON.stringify(['src/server/desktop-access.js']) && JSON.stringify(c.consumers.launcher) === JSON.stringify(['src/server/desktop-access.js']) && JSON.stringify(c.consumers.appArgv) === JSON.stringify(['src/app-serve.js']),
    `§69c their argv reaches a machine only through the slot (installArgv / plan.argv / installLauncherArgv in desktop-access.js; appArgv in the machine half): ${JSON.stringify(c.consumers)}`);
  ok(c.directSudo.length === 0, `§69d no direct sudo exec of a package manager or a shell${c.directSudo.length ? ' — ' + c.directSudo.join(' ') : ''}`);
  // NEGATIVE CONTROLS — each planted shape in a patched listing is caught by its rule
  const plant = (f, line) => ({ ...files, [f]: (files[f] || '') + '\n' + line + '\n' });
  const p1 = census(plant('src/server/apps-engine.js', "const r = await run('sh', ['-c', 'sudo -n apt-get install -y gimp']);"));
  const p2 = census(plant('src/desktop-serve.js', "const argv = ['sudo', '-n', 'sh', '-c', 'apt-get install -y x'];"));
  const p3 = census(plant('src/routes/apps.js', 'const launch = M.installLauncherArgv(argv, { stateDir });'));
  const p4 = census(plant('src/server/jobs.js', "execFile('sudo', ['-n', 'apt-get', 'install', '-y', name], cb);"));
  const p5 = census(plant('src/server/apps-engine.js', "execFile('sudo', ['-n', 'sh', '-c', script], cb);"));
  ok(p1.pkgLines.some((x) => x.startsWith('src/server/apps-engine.js:')) && p2.argvBuilders.includes('src/desktop-serve.js') && p3.consumers.launcher.includes('src/routes/apps.js') && p4.directSudo.some((x) => x.startsWith('src/server/jobs.js:')) && p5.directSudo.some((x) => x.startsWith('src/server/apps-engine.js:')),
    '§69 NEGATIVE CONTROLS: a `sudo -n apt-get` line outside the slot, a third root-script argv builder, a second launcher caller, a direct sudo of a package manager and of a shell are each caught');
  ok(strip68("  // sudo -n apt-get install y\n   * sudo -n apt-get install z\n").split('\n').every((l) => !/sudo -n/.test(l)), '§69 a comment line naming `sudo -n apt-get` is no site');
}

// ═══ §70 THE WS KEEPALIVE CENSUS (lane stream-ping, browser-windows BL-r5-2) ═══════════════════════════════════════
// every long-lived ws bridge (src/server/*-stream.js — grep-derived, a new bridge joins by its name) arms THE ONE keepalive
// rule (src/ws-keepalive.js: 20 s ping, two silent rounds ⇒ terminated + named) and pings nowhere by hand. A bridge
// without it kept a half-open viewer counted until the kernel's TCP timeout (the live view, until this lane).
{
  const bridges = fs.readdirSync(path.join(REPO, 'src/server')).filter((f) => /-stream\.js$/.test(f));
  const kaBad = (name, src) => [
    ...(/require\(['"]\.\.\/ws-keepalive\.js['"]\)/.test(src) ? [] : [`${name}: no require('../ws-keepalive.js')`]),
    ...(/\bKA\.armKeepalive\(/.test(src) ? [] : [`${name}: never arms the keepalive`]),
    ...(/\.ping\(\)/.test(src.replace(/\/\/[^\n]*/g, '')) ? [`${name}: pings by hand`] : []),
  ];
  const bad = bridges.flatMap((f) => kaBad(f, read('src/server/' + f)));
  ok(bridges.length >= 2 && bridges.includes('browser-stream.js') && bridges.includes('desktop-stream.js') && !bad.length, `§70 every src/server/*-stream.js arms the ONE ws keepalive (${bridges.join(', ')})${bad.length ? ' — ' + bad.join('; ') : ''}`);
  ok(kaBad('planted-stream.js', 'const t = setInterval(() => ws.ping(), 20000);').length === 3, '§70 NEGATIVE CONTROL: a planted bridge with its own pinger is red three ways');
  // verify r1 T1⑤ — THE SCOPE, stated and enforced: every ws server in server.js + src/** is a *-stream.js bridge (above)
  // or named HERE with the reason it needs no keepalive of this rule; a new long-lived ws server is red until classified
  const WSS_OUTSIDE = {
    'server.js': 'the /ws main socket (src/server/ws-heartbeat.js, the stall-aware 2.369.16 heartbeat) + the agentd dial-in (the device mux pings; a re-dial replaces the socket)',
    'src/server/cdp-mediator.js': 'loopback-only CDP clients on 127.0.0.1 (no NAT or proxy between the ends: no half-open peer)',
  };
  const wssSites = /new WebSocketServer\(/.test(read('server.js')) ? ['server.js'] : [];
  (function walkWss(d) { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = d + '/' + e.name; if (e.isDirectory()) { if (e.name !== 'node_modules') walkWss(rel); } else if (/\.(c|m)?js$/.test(e.name) && /new WebSocketServer\(|new WebSocket\.Server\(/.test(read(rel))) wssSites.push(rel); } })('src');
  const unclassified = (sites) => sites.filter((f) => !/^src\/server\/[^/]+-stream\.js$/.test(f) && !WSS_OUTSIDE[f]);
  ok(wssSites.length >= 4 && !unclassified(wssSites).length, `§70 THE SCOPE: every ws server is a *-stream.js bridge or named outside the rule with its reason (${wssSites.join(', ')})${unclassified(wssSites).length ? ' — UNCLASSIFIED: ' + unclassified(wssSites).join(', ') : ''}`);
  ok(unclassified([...wssSites, 'src/server/agent-mux.js']).join() === 'src/server/agent-mux.js', '§70 NEGATIVE CONTROL: a planted ws server outside *-stream.js and unnamed is red by name');
}

// §71 A RAW SECRET IS COMPARED THROUGH ONE CONSTANT-TIME DOOR (B-8dda, lane agent-cli-fixes, 2026-10-02). A session's
// `vsst_` token (`s.agentToken`) is the bearer secret every agent call presents, and the OTel exporter's per-boot header
// is another; eight lookups compared them with `===`, which stops at the first differing character (lane-pairing r3
// found two). Every compare of a raw secret goes through src/pairing-token.js `sameToken` (both sides through
// `tokenMatches`' sha256 digests, timingSafeEqual). Census over server.js + src (comments stripped): no comparison
// operator touches a token-shaped operand — `agentToken`, the `x-vibespace-otel` header; a presence check against
// null / undefined and `typeof` stay legal. Planted lines prove the census sees each form.
console.log('§71 a raw secret is compared only through sameToken');
{
  // line-preserving: a JSDoc / block-comment line and a `//` tail go; code is never swallowed (a whole-file `/\*…*\/`
  // strip eats from a '/api/*' string to the next comment end — server.js's site vanished that way)
  const strip68 = (t) => t.split('\n').map((ln) => (/^\s*(\/\*|\*)/.test(ln) ? '' : ln.replace(/\/\*.*?\*\//g, '').replace(/(^|\s)\/\/.*$/, '$1'))).join('\n');
  // verify r1: a SAME-LOGICAL-LINE rule, not an operand grammar — the first census (an operand chain ending in the secret,
  // beside ===) saw 2 of 11 planted spellings; a template literal, startsWith / endsWith / includes, s['agentToken'],
  // the OTel header read into a local or through req.get, a job's raw jbt_ and a compare split over two lines all
  // passed. A line naming a raw secret — `agentToken` in any spelling, a job's `_tokenRaw` — beside ANY compare is a
  // hit once the door's own calls and the presence checks (typeof, null / undefined) are taken out; the OTel header is
  // READ only inside sameToken( (a local would carry it past any line rule). Map lookups keyed by the presented value
  // (auth.js cookie tokens) and digest compares (jobByToken, MountTokens) name no raw secret — legal.
  const SECRET68 = /(?<![\w$])(?:agentToken|_tokenRaw)(?![\w$])/;
  const CMP68 = /===|!==|==|!=|\.(?:startsWith|endsWith|includes|indexOf|lastIndexOf|localeCompare)\(|\bObject\.is\(|\bcase\b/;
  const DOOR68 = /\b(?:sameToken|tokenMatches)\((?:[^()]|\([^()]*\))*\)/g;
  const CHAIN68 = String.raw`[\w$.?\[\]'"]+`;
  const PRESENCE68 = new RegExp(String.raw`typeof\s+${CHAIN68}\s*[!=]==?\s*(['"])\w+\1|${CHAIN68}\s*[!=]==?\s*(?:null|undefined)\b|\b(?:null|undefined)\s*[!=]==?\s*${CHAIN68}`, 'g');
  const OTEL68 = /['"]x-vibespace-otel['"]/;
  // a line that opens with a compare (or follows one ending in a compare) joins its predecessor, numbered by the first
  const logical68 = (text) => strip68(text).split('\n').reduce((out, ln, i) => {
    const prev = out[out.length - 1];
    if (prev && (/^\s*(?:===|!==|==|!=|\.(?:startsWith|endsWith|includes|indexOf|lastIndexOf|localeCompare)\()/.test(ln) || /(?:===|!==|==|!=)\s*$/.test(prev.t))) prev.t += ' ' + ln.trim();
    else out.push({ n: i + 1, t: ln });
    return out;
  }, []);
  const bad68 = (t) => { const rest = t.replace(DOOR68, ' ').replace(PRESENCE68, ' '); return (SECRET68.test(rest) && CMP68.test(rest)) || OTEL68.test(rest); };
  const hits68 = (file, text) => logical68(text).flatMap((l) => (bad68(l.t) ? [`${file}:${l.n}: ${l.t.trim().slice(0, 100)}`] : []));
  const walk68 = (dir) => fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk68(dir + '/' + d.name) : /\.(c|m)?js$/.test(d.name) ? [dir + '/' + d.name] : []));
  const files68 = ['server.js', ...walk68('src')];
  const found68 = files68.flatMap((f) => hits68(f, read(f)));
  ok(files68.length > 300 && found68.length === 0, `§71 no compare of a raw secret outside sameToken in server.js + src (${files68.length} files)${found68.length ? ' — ' + found68.join(' | ') : ''}`);
  const pt = read('src/pairing-token.js');
  ok(/function sameToken\(presented, secret\) \{[^}]*tokenMatches\(presented, tokenHash\(secret\)\)/.test(pt) && /module\.exports = \{[^}]*\bsameToken\b/.test(pt), '§71 sameToken is tokenMatches over the secret\'s digest, exported from the one door');
  const SITES68 = ['server.js', 'src/agent-routes.js', 'src/server/window-targets-engine.js', 'src/server/mounts-plugins-wiring.js', 'src/server/exit-routes.js', 'src/routes/browser.js', 'src/server/otel-ingest.js'];
  const noDoor = SITES68.filter((f) => !/\bsameToken\(/.test(strip68(read(f))));
  ok(noDoor.length === 0 && (strip68(read('src/agent-routes.js')).match(/\bsameToken\(/g) || []).length >= 2, `§71 every lookup site compares through sameToken${noDoor.length ? ' — missing: ' + noDoor.join(' ') : ''}`);
  const { sameToken } = (await import('node:module')).createRequire(import.meta.url)(path.join(REPO, 'src/pairing-token.js'));
  ok(sameToken('vsst_ab12', 'vsst_ab12') && !sameToken('vsst_ab13', 'vsst_ab12') && !sameToken('vsst_ab1', 'vsst_ab12') && !sameToken(undefined, 'vsst_ab12') && !sameToken('vsst_ab12', undefined) && !sameToken('', ''),
    '§71 sameToken: equal ⇒ true; one character, a prefix, a missing or an empty side ⇒ false');
  // verify r1: what a request can carry instead of a string (a JSON body's number / array / object, a repeated header) is
  // false, never a throw — and so is a non-string secret
  const odd68 = [[123, 'vsst_ab12'], [['vsst_ab12'], 'vsst_ab12'], [{ toString: () => 'vsst_ab12' }, 'vsst_ab12'], [Buffer.from('vsst_ab12'), 'vsst_ab12'], [null, 'vsst_ab12'], ['vsst_ab12', 42], ['vsst_ab12', ['vsst_ab12']], ['vsst_ab12x'.repeat(50), 'vsst_ab12']];
  const thrown68 = [], yes68 = [];
  for (const [a, b] of odd68) { try { if (sameToken(a, b) !== false) yes68.push(JSON.stringify([a, b]).slice(0, 40)); } catch (e) { thrown68.push(e.message); } }
  ok(thrown68.length === 0 && yes68.length === 0, `§71 sameToken: a number, an array, an object, a Buffer, null, a non-string secret, a long mismatch ⇒ false, never a throw${thrown68.length ? ' — threw: ' + thrown68.join(' | ') : ''}${yes68.length ? ' — true for: ' + yes68.join(' | ') : ''}`);
  // NEGATIVE CONTROLS: each form a lookup has taken — and each spelling verify r1 planted past the first census — is
  // caught; a presence check, typeof, the door itself, a Map lookup and the exporter's header line are not
  const caught = ['if (s.agentToken === token) return [s, id];', 'if (token !== sess.agentToken) continue;', 'for (const [id, s] of m) if (s && s.agentToken==tok) return id;', "if (loop && req.headers['x-vibespace-otel'] === token) return true;", 'return a.agentToken != b;',
    'return `${s.agentToken}` === token;', 'return token.startsWith(s.agentToken);', 'return s.agentToken.endsWith(token);', "return s['agentToken'] === token;", "const h = req.headers['x-vibespace-otel'];", "return req.get('x-vibespace-otel') === token;",
    'return [s.agentToken].includes(token);', 'return job._tokenRaw === raw;', 'return token == agentToken;', 'return Object.is(s.agentToken, token);', 'switch (token) { case s.agentToken: return true; }', 'return s.agentToken\n    === token;', 'if (token ===\n  s?.agentToken) return s;'];
  const legal = ["if (typeof s.agentToken === 'string') n++;", 'if (s.agentToken === undefined) continue;', 'if (null == s.agentToken) continue;', 'if (sameToken(token, s.agentToken)) return [s, id];', "const fresh = !!token && token === h.fresh;",
    "if (loop && sameToken(req.headers['x-vibespace-otel'], token)) return true;", 'const t = byToken.get(token);', "agentToken: 'vsst_' + crypto.randomBytes(12).toString('hex'),", "OTEL_EXPORTER_OTLP_HEADERS: 'x-vibespace-otel=' + token,", "if (!job._tokenRaw) { job._tokenRaw = 'jbt_' + hex; }", "if (token && token.startsWith('vsst_')) for (const [id, s] of m) if (s && sameToken(token, s.agentToken)) break;"];
  const flagged = (l) => logical68(l).some((x) => bad68(x.t));
  const missed = caught.filter((l) => !flagged(l)), wrong = legal.filter((l) => flagged(l));
  ok(missed.length === 0 && wrong.length === 0, `§71 NEGATIVE CONTROLS: ${caught.length} planted compares caught, ${legal.length} legal lines pass${missed.length ? ' — missed: ' + missed.join(' | ') : ''}${wrong.length ? ' — wrongly caught: ' + wrong.join(' | ') : ''}`);
}

// §72 EVERY WRITE OF A NAMED STORE IS TIMED (design 011 lane 1, store-timing, 2026-10-03). src/timed-sync.js STORES is
// the CLOSED list of named stores; a write row's `sites` are the functions that write its file. Census (comments
// stripped): inside each site every sync write call — writeJsonAtomic / writeBuffersAtomic / writeFileSync /
// appendFileSync / _writeAtomic — sits inside a `timedSync('<a row of that file and site>', …)` span; the unwrapped ones
// are printed. Every timedSync call in server.js + src names a row by a literal; every row is used in its own file.
// Planted controls prove the census sees an unwrapped write, a wrong name and a computed name.
console.log('§72 every write of a named store is timed (src/timed-sync.js STORES)');
{
  const { STORES } = (await import('node:module')).createRequire(import.meta.url)(path.join(REPO, 'src/timed-sync.js'));
  const strip72 = (t) => t.split('\n').map((ln) => (/^\s*(\/\*|\*)/.test(ln) ? '' : ln.replace(/(^|\s)\/\/.*$/, '$1'))).join('\n');
  // the matching close of the bracket at `i` — strings, template literals and comments skipped
  const close72 = (t, i) => {
    const open = t[i], shut = open === '{' ? '}' : ')';
    let depth = 0;
    for (let k = i; k < t.length; k++) {
      const c = t[k];
      if (c === '"' || c === "'" || c === '`') { for (k++; k < t.length && t[k] !== c; k++) if (t[k] === '\\') k++; continue; }
      if (c === '/' && t[k + 1] === '*') { k = t.indexOf('*/', k + 2) + 1 || t.length; continue; }
      if (c === open) depth++;
      else if (c === shut && --depth === 0) return k;
    }
    return -1;
  };
  const body72 = (t, fn) => {
    const m = new RegExp(String.raw`(^|\n)[ \t]*(?:async\s+)?(?:function\s+)?${fn}\s*\([^)]*\)\s*\{`).exec(t);
    if (!m) return null;
    const at = m.index + m[0].length - 1;
    return { text: t.slice(at, close72(t, at) + 1), at };
  };
  const WRITE72 = /\b(?:writeJsonAtomic|writeBuffersAtomic|writeFileSync|appendFileSync|_writeAtomic)\s*\(/g;
  // not the store: writeIndex's VERIFY drift log (a debug env var), the OTel exporter's per-boot token file
  const EXEMPT72 = [/fs\.appendFileSync\(verifyTo,/, /fs\.writeFileSync\(tokenFile,/];
  const unwrapped72 = (text, okNames) => {
    const spans = [];
    for (const m of text.matchAll(/\btimedSync\(\s*'([^']+)'/g)) { const o = m.index + m[0].indexOf('('); spans.push({ name: m[1], a: o, b: close72(text, o) }); }
    const out = [];
    for (const m of text.matchAll(WRITE72)) {
      const line = text.slice(text.lastIndexOf('\n', m.index) + 1, text.indexOf('\n', m.index) < 0 ? undefined : text.indexOf('\n', m.index));
      if (EXEMPT72.some((re) => re.test(line))) continue;
      if (!spans.some((sp) => sp.a < m.index && m.index < sp.b && okNames.includes(sp.name))) out.push(line.trim().slice(0, 110));
    }
    return out;
  };
  const rows72 = Object.entries(STORES);
  const bad = [], seen = [];
  for (const [name, row] of rows72.filter(([, r]) => r.kind === 'write')) {
    const src = strip72(read(row.file));
    for (const site of row.sites) {
      const b = body72(src, site);
      if (!b) { bad.push(`${row.file}: site ${site}() not found`); continue; }
      const okNames = rows72.filter(([, r]) => r.file === row.file && r.sites.includes(site)).map(([n]) => n);
      for (const l of unwrapped72(b.text, okNames)) bad.push(`${row.file} ${site}(): ${l}`);
      if (b.text.includes(`timedSync('${name}'`)) seen.push(name + '@' + site);
    }
  }
  ok(bad.length === 0, `§72 every sync write inside a named store's sites is inside its timedSync (${rows72.filter(([, r]) => r.kind === 'write').length} write rows)${bad.length ? ' — UNWRAPPED: ' + [...new Set(bad)].join(' | ') : ''}`);
  const writeSites = rows72.filter(([, r]) => r.kind === 'write').flatMap(([n, r]) => r.sites.map((s) => n + '@' + s));
  const dead = writeSites.filter((x) => !seen.includes(x));
  ok(dead.length === 0, `§72 every write row's site really times under that row's name${dead.length ? ' — not used: ' + dead.join(' ') : ''}`);
  const walk72 = (dir) => fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk72(dir + '/' + d.name) : /\.(c|m)?js$/.test(d.name) ? [dir + '/' + d.name] : []));
  const calls = [], computed = [];
  for (const f of ['server.js', ...walk72('src')]) {
    if (f === 'src/timed-sync.js') continue;
    const t = strip72(read(f));
    for (const m of t.matchAll(/\btimedSync\(\s*('([^']*)'|[^'\s])/g)) { if (m[2] === undefined) computed.push(f); else calls.push([f, m[2]]); }
  }
  const unknown = calls.filter(([f, n]) => !STORES[n] || STORES[n].file !== f);
  ok(computed.length === 0 && unknown.length === 0 && calls.length >= rows72.length, `§72 ${calls.length} timedSync calls, each a literal row of the table, in that row's own file${computed.length ? ' — computed name in: ' + computed.join(' ') : ''}${unknown.length ? ' — unknown / misplaced: ' + unknown.map((x) => x.join(':')).join(' ') : ''}`);
  const unused = rows72.filter(([n, r]) => !calls.some(([f, c]) => c === n && f === r.file)).map(([n]) => n);
  ok(unused.length === 0, `§72 every row is used${unused.length ? ' — dead rows: ' + unused.join(' ') : ''}`);
  // NEGATIVE CONTROLS: an unwrapped write, a write under another file's name, a write beside (not inside) its timedSync
  const planted = [
    ['  _save() {\n    fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2));\n  }', 1],
    ["  _save() {\n    timedSync('jobs.write', () => fs.writeFileSync(tmp, x));\n  }", 1],
    ["  _save() {\n    timedSync('task-groups.write', () => 0); fs.writeFileSync(tmp, x);\n  }", 1],
    ["  _save() {\n    timedSync('task-groups.write', () => { fs.writeFileSync(tmp, x); fs.renameSync(tmp, f); });\n  }", 0],
  ];
  const got = planted.map(([t]) => unwrapped72(body72(t, '_save').text, ['task-groups.write']).length);
  ok(got.join() === planted.map(([, n]) => n).join(), `§72 NEGATIVE CONTROLS: unwrapped / wrong name / beside the span caught, a wrapped write passes (${got.join()})`);
  const jobsBare = strip72(read('src/jobs.js')).replace("timedSync('jobs.write', () => writeJsonAtomic(this.file, [...this.jobs.values()]));", 'writeJsonAtomic(this.file, [...this.jobs.values()]);');
  const hit = unwrapped72(body72(jobsBare, '_save').text, ['jobs.write', 'jobs-notifs.write']);
  ok(hit.length === 1 && /writeJsonAtomic\(this\.file/.test(hit[0]), `§72 CONTROL: the real jobs.js _save with its jobs.json write unwrapped is printed (${hit.join(' | ')})`);
}

// §73 THE USAGE INDEX IS A SHADOW, ON ITS OWN THREAD (design 011 lane 3, L1 — 2026-10-03). The ledger's SQLite index
// feeds NOTHING in this release: its one reader is the comparer beside the Usage window's read. And the database is
// touched from ONE thread: `node:sqlite` is named in exactly one file (src/usage-index-worker.js), DatabaseSync is
// spelled nowhere else, that file is never require()d (it refuses to run on the main thread) and only the owner
// (src/server/usage-index.js) spawns it; the owner's read doors (queryAggregate, workerStats) are called nowhere but
// inside the owner, and the owner is wired by account-usage-routes.js alone, which asks it only to start and compare.
// DERIVED over server.js + src/** with comments stripped; NEGATIVE CONTROLS plant each forbidden line in a real file.
console.log('§73 the usage index: node:sqlite in one file, never on the main thread, and no reader but the comparer');
{
  const strip72 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
  const walk72 = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk72(d + '/' + e.name) : /\.(c|m)?js$/.test(e.name) ? [d + '/' + e.name] : []));
  const files72 = ['server.js', ...walk72('src')];
  const WORKER = 'src/usage-index-worker.js', OWNER = 'src/server/usage-index.js', WIRING = 'src/server/account-usage-routes.js';
  const judge72 = (texts) => {
    const bad = [];
    for (const [f, raw] of Object.entries(texts)) {
      const t = strip72(raw);
      if (f !== WORKER && /['"`]node:sqlite['"`]/.test(t)) bad.push(`${f} names node:sqlite`);
      if (f !== WORKER && /\bDatabaseSync\b/.test(t)) bad.push(`${f} spells DatabaseSync`);
      if (/require\(\s*[^)]*usage-index-worker/.test(t)) bad.push(`${f} require()s the worker`);
      if (f !== OWNER && f !== WORKER && /usage-index-worker/.test(t)) bad.push(`${f} spawns the worker`);
      if (f !== OWNER && /\b(?:queryAggregate|workerStats)\s*\(/.test(t)) bad.push(`${f} reads the index`);
      if (f !== WIRING && f !== OWNER && /require\(\s*['"`][^'"`]*server\/usage-index(?:\.js)?['"`]|require\(\s*['"`]\.\/usage-index(?:\.js)?['"`]/.test(t)) bad.push(`${f} wires the owner`);
    }
    const w = strip72(texts[WIRING] || '');
    const asked = [...w.matchAll(/\busageIndex\.(\w+)/g)].map((m) => m[1]).filter((n) => n !== 'compare' && n !== 'start');
    if (asked.length) bad.push(`${WIRING} asks the owner for ${[...new Set(asked)].join(', ')}`);
    return bad;
  };
  const texts72 = Object.fromEntries(files72.map((f) => [f, read(f)]));
  const found72 = judge72(texts72);
  ok(files72.length > 300 && texts72[WORKER] && texts72[OWNER] && found72.length === 0, `§73 the census over ${files72.length} files is clean${found72.length ? ' — ' + found72.join(' | ') : ''}`);
  ok(/['"]node:sqlite['"]/.test(strip72(texts72[WORKER])) && /if \(isMainThread\) throw new Error\(/.test(texts72[WORKER]) && /new Worker\(workerFile/.test(texts72[OWNER]),
    '§73 the worker names node:sqlite, refuses the main thread, and the owner spawns it as a Worker');
  ok(/usageIndex\.compare\(answer, \{ from, to, backend, accounts, hostFilter, pivots \}\);\n\s*res\.json\(answer\);/.test(texts72[WIRING]),
    '§73 the comparer is asked in the same synchronous step as the Usage window\'s own answer, before it is sent');
  ok(/this\._pushIndex\(shard, text\);/.test(texts72['src/usage-history.js']) && (texts72['src/usage-history.js'].match(/(?:timedSync\('usage-shards\.write', \(\) => fs\.appendFileSync\(shard, text\)\)|fs\.appendFileSync\(shard, text\)); this\._pushIndex\(shard, text\);/g) || []).length === 2,   // int204: store-timing's span around the append
    '§73 both commit points (the walk, the remote harvest) push right after their append');
  const plant = (f, line) => ({ ...texts72, [f]: texts72[f] + '\n' + line + '\n' });
  const PLANTS = [
    ['src/server/usage-pool-engine.js', 'const sums = await usageIndex.queryAggregate({ from });'],
    ['src/usage-estimator.js', 'const st = await getUsageIndex().workerStats();'],
    ['server.js', "const { DatabaseSync } = require('node:sqlite');"],
    ['src/usage-history.js', "const db = new DatabaseSync(':memory:');"],
    [OWNER, "require('../usage-index-worker.js');"],
    ['src/server/session-stdout.js', "const ix = require('./usage-index.js').create({});"],
    [WIRING, 'usageIndex.queryAggregate({}).then((x) => res.json(x));'],
  ];
  const missed72 = PLANTS.filter(([f, l]) => judge72(plant(f, l)).length === 0).map(([f, l]) => `${f}: ${l}`);
  const legal72 = judge72(plant('src/server/usage-pool-engine.js', '// the usage index (node:sqlite, DatabaseSync, queryAggregate) feeds nothing yet'));
  ok(missed72.length === 0 && legal72.length === 0, `§73 NEGATIVE CONTROLS: ${PLANTS.length} planted readers / openers caught, a comment naming them passes${missed72.length ? ' — missed: ' + missed72.join(' | ') : ''}${legal72.length ? ' — wrongly flagged: ' + legal72.join(' | ') : ''}`);
}

// ── design 014 D1 (lane desktop-vnc-native): a Windows / macOS machine's WHOLE DESKTOP rides EXISTING doors — no new
// device op (the agent's tcp-connect + run-cmd / run-stream), and the kind is NOT a keeper session (no idle verdict, no
// resource sample, no record): the access layer holds it, the bridge relays it ──
console.log('§D014 the vnc-native rung: no new device op, no keeper rows');
{
  const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const RUNG = /vnc-native|machine-desktop|machineDesktop|MACHINE_DESKTOP|VNC_NATIVE|tightvnc/i;
  const census = (s) => ['src/agentd/agentd.js', 'src/agentd/client.js', 'src/desktop-serve.js', 'src/server/desktop-app-keeper.js'].filter((f) => RUNG.test(s[f]));
  const srcs = Object.fromEntries(['src/agentd/agentd.js', 'src/agentd/client.js', 'src/desktop-serve.js', 'src/server/desktop-app-keeper.js'].map((f) => [f, rd(f)]));
  const hit = census(srcs);
  ok(hit.length === 0, `§D014 the agent (agentd.js + its client), the desktop-serve op table and the keeper name nothing of the rung${hit.length ? ' — ' + hit.join(', ') : ''}`);
  const acc = rd('src/server/desktop-access.js');
  const a = acc.indexOf('// ── design 014 D1'), b = acc.indexOf('/** ONE file of a paired machine');
  const calls = a > 0 && b > a ? [...new Set([...acc.slice(a, b).matchAll(/\bdm\.(\w+)\(/g)].map((m) => m[1]))].sort() : null;
  ok(JSON.stringify(calls) === '["runCmd","runStream","status","tcpForward"]', `§D014 the access layer reaches the machine ONLY through existing agent calls (tcpForward, runCmd, runStream — and the handle's own status()): ${JSON.stringify(calls)}`);
  const wiring = rd('src/server/window-live-wiring.js');
  ok(/MD\(id\) \? access\.machineDesktopTarget\(id\) : keeper\.streamTarget\(id\)/.test(wiring) && /onInput: \(id\) => \{ if \(MD\(id\)\) return; keeper\.noteInput\(id\);/.test(wiring), '§D014 the bridge resolves a machine desktop through the access layer, never the keeper, and its input never reaches the keeper\'s idle clock');
  ok(census({ ...srcs, 'src/agentd/agentd.js': srcs['src/agentd/agentd.js'] + "\nif (msg.op === 'machine-desktop') { }" }).length === 1 && census({ ...srcs, 'src/server/desktop-app-keeper.js': srcs['src/server/desktop-app-keeper.js'] + '\n// a vnc-native idle row' }).length === 1, '§D014 CONTROL: a planted daemon op / keeper row naming the rung is caught');
}

// lane exit-transfer (design 013 B): a NEW device op is THREE touches + a capability gate — the daemon's handler, the
// hub client's method that asks the capability BEFORE it sends the op (an unknown op hangs an old agent until its
// timeout), and the capability string in the hello-ack list. Derived for `write-stream` (an agent's push).
console.log('§74 a new device op is three touches + its capability gate (write-stream)');
{
  const ad70 = read('src/agentd/agentd.js'), cl70 = read('src/agentd/client.js');
  const three = (adSrc, clSrc) => {
    const caps = (adSrc.match(/capabilities: \[([^\]]*)\]/) || [])[1] || '';
    const i = clSrc.indexOf('async fsWriteStream('), body = i >= 0 ? clSrc.slice(i, i + 2500) : '';
    const gate = body.indexOf("capabilities?.includes?.('fs-write-stream')"), op = body.indexOf("action: 'write-stream'");
    return { handler: /\} else if \(msg\.action === 'write-stream'\) \{\s*\n\s*await writeStreamOp\(msg, p, rid\);/.test(adSrc) && /async function writeStreamOp\(msg, p, rid\)/.test(adSrc),
      client: i >= 0 && gate >= 0, gateFirst: gate >= 0 && op > gate, capability: /'fs-write-stream'/.test(caps) };
  };
  const t70 = three(ad70, cl70);
  ok(t70.handler && t70.client && t70.capability, `§74 write-stream: the daemon's handler, the client's gated method and the capability string are all present (${JSON.stringify(t70)})`);
  ok(t70.gateFirst, '§74 the client asks the capability BEFORE the op is sent (an old agent is never asked an op it lacks)');
  const noCap = three(ad70.replace("'fs-portable', 'fs-write-stream']", "'fs-portable']"), cl70);
  const noGate = three(ad70, cl70.replace("capabilities?.includes?.('fs-write-stream')", 'capabilities'));
  const late = three(ad70, cl70.replace("    if (!conn.info?.capabilities?.includes?.('fs-write-stream'))", "    await this._request({ op: 'fs-op', action: 'write-stream', step: 'probe' });\n    if (!conn.info?.capabilities?.includes?.('fs-write-stream'))"));
  ok(noCap.capability === false && noGate.client === false && late.gateFirst === false, `§74 NEGATIVE CONTROLS: the capability dropped from the hello-ack, the gate removed, an op sent before the gate — each caught (${JSON.stringify([noCap.capability, noGate.client, late.gateFirst])})`);
}

// ── design 016 S2 (lane app-satellite-windows, 2026-10-03): ONE xpra CONNECTION PER APP SESSION — an app's second top-level
// opens its own VibeSpace window (a SATELLITE), whose pane is a viewport of the main window's session: the x5 rule (one
// active viewer per connection) and the belt hold only while no satellite opens a stream. DERIVED: the satellite window's
// body (desktop-app-window.js openSatelliteWindow) and the view's satellite pane (xpra-view.js attachSatellite) name no
// stream url, no view, no client, no worker; xpra-view.js builds ONE client per view; CONTROLS plant each opener. ──
console.log('§S2 a satellite window opens no connection of its own');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
  const OPENERS = /streamUrl\(|\/stream\b|createXpraView\(|createVncView\(|createXpraClient\(|new\s+(?:WorkerCtor|Worker|WebSocket)\(|\bworkerUrl\b/;
  const bodyOf = (src, start, end) => { const a = src.indexOf(start), b = src.indexOf(end, a + 1); return a >= 0 && b > a ? src.slice(a, b) : ''; };
  const judge = (daw, xv) => {
    const bad = [];
    const sat = strip(bodyOf(daw, 'function openSatelliteWindow(', '// ── WINDOW-TYPE REGISTRATION'));
    const pane = strip(bodyOf(xv, 'function attachSatellite(', '  const resnap = '));
    if (!sat || !pane) bad.push('the satellite bodies are not found');
    if (OPENERS.test(sat)) bad.push(`openSatelliteWindow opens a stream (${sat.match(OPENERS)[0]})`);
    if (OPENERS.test(pane)) bad.push(`attachSatellite opens a stream (${pane.match(OPENERS)[0]})`);
    const clients = (strip(xv).match(/createXpraClient\(/g) || []).length;
    if (clients !== 1) bad.push(`xpra-view.js builds ${clients} clients (one per view)`);
    if (!/handle = entry\.view\.attachSatellite\(mount, wid, cb\);/.test(sat)) bad.push('the satellite does not bind to the main window\'s view');
    return bad;
  };
  const daw = read('src/lib/desktop-app-window.js'), xv = read('src/lib/xpra-view.js');
  const found = judge(daw, xv);
  ok(found.length === 0, `§S2 the satellite window and its pane open nothing — they bind to the main window's ONE view${found.length ? ' — ' + found.join(' | ') : ''}`);
  const plantIn = (src, start, line) => { const i = src.indexOf('{', src.indexOf(start)); return src.slice(0, i + 1) + '\n  ' + line + '\n' + src.slice(i + 1); };
  const PLANTS = [
    ['daw', "const v2 = createXpraView(mount, { url: () => streamUrl(`/api/desktop/${id}/stream`) });"],
    ['daw', 'const ws2 = new WebSocket(location.href);'],
    ['xv', "const c2 = createXpraClient({ url: typeof url === 'function' ? url() : url });"],
    ['xv', 'const w2 = new Worker(workerUrl);'],
  ];
  const missed = PLANTS.filter(([f, l]) => judge(f === 'daw' ? plantIn(daw, 'function openSatelliteWindow(', l) : daw, f === 'xv' ? plantIn(xv, 'function attachSatellite(', l) : xv).length === 0).map(([f, l]) => `${f}: ${l}`);
  const legal = judge(plantIn(daw, 'function openSatelliteWindow(', '// a satellite never calls createXpraView( or streamUrl( — the main window does'), xv);
  ok(missed.length === 0 && legal.length === 0, `§S2 NEGATIVE CONTROLS: ${PLANTS.length} planted openers caught, a comment naming them passes${missed.length ? ' — missed: ' + missed.join(' | ') : ''}${legal.length ? ' — wrongly flagged: ' + legal.join(' | ') : ''}`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

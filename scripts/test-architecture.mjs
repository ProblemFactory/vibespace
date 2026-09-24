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
const PURE = new Set(['src/window-desktop.js', 'src/plugin-manifest.js', 'src/account-pool-auto.js', 'src/model-family.js', 'src/task-color-seq.js', 'src/ssh-key-format.js', 'src/session-schema.js', 'src/otel-truth.js', 'src/msg-acl.js', 'src/backend-caps.js',
  // AGENT BROWSER (design-agent-browser-v2 §3.6): the identity/spawn-env decisions, the
  // registry + lease model and the keeper's verdicts — imports nothing (P0/P1); and the ONE
  // constants home every process keeper counts and bounds by (src/keeper-limits.js)
  'src/browser-profiles.js', 'src/keeper-limits.js',
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
  // per-session url/env composition — imports nothing (the proxy does the I/O)
  'src/browser-mediation.js',
  'src/search-card.js', // web-search card renderer + title query + twin key — shared server (codex normalizer) + browser (chat-renderers)
  'src/path-linkify.js', // where a chat file path ENDS (CJK punctuation) — shared browser (chat-renderers) + node tests; imports nothing
  'src/collab-row.js', // codex multi-agent collab row labels/HTML — esc/t/icons injected, so the XSS rule is unit-provable
  'src/model-echo.js', // the CLI's `Set model to` echo — ONE parser for the status bar, the command-card label and the server's model-lock repin
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
  // P8-2 x5 (docs/design-desktop-apps §7 P8-2): ONE active viewer per app window — the election, the
  // active/blocked/watch rule with the agent lease, the broadcast shape; bundled into the window too
  'src/desktop-viewers.js',
  // HARNESS SETTINGS (docs/design-harness-settings.zh.md §2, 2026-09-20): the per-harness
  // DECLARED tables + validator + coerce + the plan builder — imports nothing, bundled into the
  // browser (settings-schema derives the harness sections), required by the server and the daemon
  'src/harness-settings.js',
  // THE node-pty DUCK's listener SET (B-ae4b): daemonPtyShim, the R6 pipe duck and the OpenCode
  // serve terminal share it so setupSessionPty's liveness stamp is never replaced by the consumer
  'src/pty-duck.js']);
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
  // WINDOW TARGETS (design-agent-browser-v2 §4.9, P9 first half): the AT-SPI snapshot / @ref
  // minting / input-backend probe ladder / the acts — node builtins + desktop-display; the
  // traversal itself is a bounded SUBPROCESS (src/window-targets-helper.py), never in-process
  'src/window-targets.js',
  // THE SHARED CLI-CONFIG APPLIER (design-harness-settings §6): fs/path/os only — the CAS JSON
  // writer, the comment-preserving TOML setter, applyConfigPlan/readConfigPlan, the receipt codec.
  // Its FILE TEXT is embedded into the shipped remote helper, so it may never reach up into ORCH.
  'src/harness-config.js']);
const DEVICE = new Set(['src/agentd/agentd.js', 'src/agentd/mux.js', 'src/agentd/reexec.js', 'src/agentd/version.js', 'src/agentd/ws-min.js']);
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
  const BINARY_EXT = new Set(['.zst', '.gz', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.wasm', '.pdf', '.zip', '.tar']);

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
    { file: 'server.js', needle: "execFileSync('git', ['-C', repoDir, 'pull', '--ff-only']", why: 'BOOT ONLY, ONCE (the auto-update pull, before anything is served).' },
    { file: 'server.js', needle: "execFileSync('npm', ['install'", why: 'BOOT ONLY, ONCE, and only when the pull actually moved.' },
    { file: 'server.js', needle: "execFileSync('npm', ['run', 'build']", why: 'BOOT ONLY, ONCE, same branch.' },
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
  //      ONE generic legacy row (auto-resume, category Chat).
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

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

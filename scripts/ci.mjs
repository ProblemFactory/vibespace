#!/usr/bin/env node
// THE MANDATORY RELEASE GATE — TWO TIERS (2.336.0, owner directive "发版之前能
// 有个强制CI过程，确保至少核心工作流都是能用的"; SPLIT 2026-09-07, B-4c5a).
//
// WHY THE SPLIT. The single battery reached 85 suites / 11.5 min — longer than
// anyone waits before a push and longer than GitHub's SSH idle timeout, which
// is how the "run the gate first, then push" green-marker dance (2.369.51) was
// born and how `VIBESPACE_SKIP_CI=1` started looking reasonable. A gate people
// route around is not a gate. So the battery is now two tiers with two
// different jobs:
//
//   FAST   (`npm run ci`, the pre-push gate) — build + every suite that costs
//          less than ~10 s, PLUS the one real haiku chat turn. Target ≤2 min.
//          Fail-fast: the first red stops the run and blocks the push.
//   HEAVY  (`npm run ci:heavy`) — headless chrome, real worktree servers, real
//          agent CLIs, the real opencode binary, and anything over ~10 s. The
//          pre-push hook launches it DETACHED after the fast tier is green, in
//          its own git worktree at the sha being pushed. Runs every suite (no
//          fail-fast — a background run should report ALL the damage) and
//          writes data/ci-heavy/<sha>.{green,red}.
//
// THE HEAVY TIER STILL BLOCKS — ONE PUSH LATER. A red heavy marker on any
// commit that is an ANCESTOR of HEAD blocks the NEXT push (`--check-heavy`,
// called first by the hook, ONCE PER PUSHED REF — the question is about the
// commits being published, not about whichever branch happens to be checked
// out) until a newer green run descends from it or the operator uses the
// existing VIBESPACE_SKIP_CI=1 bypass. That is the honest trade: the fast tier
// proves the push is not obviously broken, the heavy tier proves it is
// actually good, and nothing rides on top of a known-red commit.
//
// ONE HEAVY TIER PER MACHINE (2026-09-07 round 2). Two heavy runs on one box
// double the load the suites' budgets were measured under, and until 2.369.76
// the heavy suites also claimed machine-global names (fixed ports, fixed /tmp
// checkouts) so two runs DESTROYED each other and the loser wrote a red that
// blocked the next push. The names are gone (scripts/scratch.mjs — per-pid
// paths, free ports; test-ci-gate §6 scans BOTH tiers for the fixed shapes,
// because the 40ad936d red came from a VERIFIER AGENT running one suite from
// its own checkout, which no lock covers); the lock stays for the load. Two
// mechanisms keep the tier serial, and both are needed because this box hosts
// ~160 checkouts of this repository driven by parallel agents:
//   · the LAUNCHER supersedes: a run in flight for an ANCESTOR of the sha
//     being pushed is killed, because the newer commit subsumes it and its
//     half-finished verdict is worthless. A run for the same sha is refused;
//     anything else is launched and queues (below).
//   · the RUN takes an exclusive MACHINE lock (literal `/tmp`, per uid —
//     NEVER os.tmpdir(), which follows TMPDIR and would name a process
//     environment rather than a machine; see defaultLockPath) for its
//     whole duration and waits — bounded — for its turn. Timing out writes NO
//     verdict and says so (a run that never happened must not look like one),
//     and a stale lock whose holder is gone is stolen.
// A marker is a claim about a commit; every path that cannot honestly make one
// refuses UP FRONT (a dirty in-place tree) or says NO VERDICT WRITTEN at the
// end. "HEAVY GATE GREEN" is never printed for a run nobody recorded.
//
// EVERY suite under scripts/test-*.mjs is in exactly one tier or in EXCLUDED
// with a reason — asserted by `--census` (and by test-architecture, so it runs
// inside `npm run build`). Before the split, 99 of the 184 suites on disk were
// in NO list at all: they neither ran nor were they written down anywhere.
//
// THE TABLE IS THIS GATE'S, THE SUITE SOURCES ARE THE GATED COMMIT'S (round 6).
// Every isolated run — the whole heavy tier, and a fast run for a pushed tip
// that is not HEAD — gates a commit that may not contain every name in the
// table above. That is an ABSENCE, not a failing suite: it is skipped LOUDLY,
// counted, named in the closing line and recorded in the marker (`absent`), and
// a run in which EVERY suite was absent claims nothing at all. See runSuite.
//
// Modes:
//   node scripts/ci.mjs                  the FAST gate (+ .git/ci-green marker)
//   node scripts/ci.mjs --isolate --sha=<x>  the FAST gate in a scratch
//                                        worktree AT <x> — what the hook runs
//                                        when a pushed ref's tip is not the
//                                        commit you have checked out (no
//                                        marker: it did not gate your tree)
//   node scripts/ci.mjs --heavy --isolate   the HEAVY tier at HEAD, in its own
//                                        worktree (this is `npm run ci:heavy`,
//                                        the command a blocked push is told to
//                                        run — it always earns a marker)
//   node scripts/ci.mjs --heavy          the HEAVY tier against THIS tree; only
//                                        a clean tree can earn a marker, so a
//                                        dirty one is refused up front (exit 2)
//                                        unless --dirty-ok says "no verdict, run
//                                        it anyway"
//   node scripts/ci.mjs --heavy-launch <sha> [--range=<old>..<new>]
//                                        detach a heavy run for <sha>. With a
//                                        range it is the AFFECTED tier (only the
//                                        suites whose inputs the range touches)
//                                        unless the newest FULL green marker is
//                                        older than 24 h — then the FULL tier.
//                                        THE LAUNCHER DECIDES, no cron.
//                                        ALREADY GREEN (B-3ccf): a fresh GREEN
//                                        marker for exactly <sha> (newer than
//                                        its commit, not partial, FULL — or
//                                        AFFECTED over the same range) prints
//                                        "heavy already GREEN for <sha> (<age>),
//                                        not relaunching" and exits 0 with no
//                                        run; a RED or partial marker relaunches.
//   node scripts/ci.mjs --heavy --affected --range=<old>..<new>
//                                        (alias --heavy-affected) the impact-
//                                        scoped tier by hand; --range=<sha> alone
//                                        means "everything <sha> has that no
//                                        remote-tracking ref has"
//   node scripts/ci.mjs --check-heavy    exit 1 if a red heavy blocks a push
//   node scripts/ci.mjs --status         last heavy result per sha
//   node scripts/ci.mjs --census         the tier census self-test
//   node scripts/ci.mjs --reap           kill scratch-dir orphans (what every suite run does after itself),
//                                        printing every victim (pid, ppid, command, root, rule);
//                                        --reap --dry-run prints the same list and signals nothing
// Ops flags: --markers=<dir> (where heavy results live), --head=<sha> (which
// commit the verdict is about), --only=a,b (a subset of the heavy tier, e.g.
// re-running one suite after a fix; an unknown name is a loud exit 2),
// --lock=<file> + --lock-wait-ms=<n> (the machine lock — a test drives its own
// so it never contends with, or waits for, a real heavy run).
// VIBESPACE_CI_LANES=<n> overrides the heavy tier's parallel lane count (1 = the
// pre-2026-09-15 strictly sequential tier — what a test that asserts ORDER wants).
// Exit codes: 0 green · 1 red · 2 refused (dirty tree / bad --only) · 3 the
// tier did not run (never got the machine lock) · 4 ABORTED (superseded, the
// lock taken, or terminated from outside — it stopped mid-tier). 0 and 1 are
// the only VERDICTS; 2/3/4 all mean "no verdict was written", and none of them
// may ever be 0, because the Actions heavy job's only signal is the exit code.
// Mirrored in .github/workflows/ci.yml (fast and heavy as separate jobs).
// Gate for this file: scripts/test-ci-gate.mjs.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gitEnvFrom } from './git-env.mjs';

const HERE = fileURLToPath(import.meta.url);
const repo = path.resolve(path.dirname(HERE), '..');
// This file is imported by scripts/test-architecture.mjs (the census) and is
// launched from a git hook, so EVERY git it runs gets the sanitized
// environment — a hook exports GIT_DIR/GIT_INDEX_FILE and the heavy tier runs
// `git worktree add` (scripts/git-env.mjs has the full essay).
const GIT_ENV = gitEnvFrom(process.env);

// ─────────────────────────────────────────────────────────────────────────
// THE TIER TABLE. `tier` is 'fast' or 'heavy'; every HEAVY entry states WHY it
// is not in the fast tier — chrome / server / cli / binary / slow / adopted —
// with the measured wall time that says so, because "heavy" without a reason
// is where suites go to be forgotten. Both tiers are ordered by MEASURED cost,
// cheap first, so a pure-logic regression fails in seconds.
// ─────────────────────────────────────────────────────────────────────────
export const SUITES = [
  // ── FAST TIER — the pre-push gate. MEASURED cheap→expensive so a
  // pure-logic regression fails in seconds. Nothing here launches a
  // browser and nothing here costs ~10s; the one deliberate exception is
  // test-chat-e2e (a real haiku turn, ~10s, real quota) — it stays because
  // it is the only proof in the whole battery that a real turn works.
  { name: 'test-lazy', tier: 'fast' },
  { name: 'test-migrations', tier: 'fast' },
  { name: 'test-auto-cli-refresh', tier: 'fast' },
  { name: 'test-task-wakeup-card', tier: 'fast' }, // background-task lifecycle closure incl. the real record order (tool_result BEFORE the completion notification); also joined the gate late (same class)
  { name: 'test-agentd-upgrade-loop', tier: 'fast' },
  { name: 'test-pool-auto', tier: 'fast' },
  { name: 'test-fable-cap-pool-storm', tier: 'fast' }, // the 2026-09-13 storm: placement must follow the REQUEST model (a safety-classifier fallback is announced once and then silent), a model-cap rejection must mark the model's cap and not the plan lane (claude has no `seven_day_fable` type), and a healthy current member is never "no member can serve it" — real engine + real pool + real symlinks + the real stdout consumer, each fix with a patched-copy pre-fix control
  { name: 'test-desktop-apps', tier: 'fast' }, // DESKTOP APPS (docs/design-desktop-apps §6): the PURE model — registry validation, the resolveBackend ladder over the full presence matrix with §3's fallback text verbatim, the state machine, cap/runaway/idle/adoption verdicts, the ONE constants home. No process, ~0.1s
  { name: 'test-desktop-display', tier: 'fast' }, // desktop-display facts: -displayfd allocation never collides, the Xauthority writer admits/refuses real clients, enumeration on a real Xvfb, the xpra probe on a fake binary; every binary leg SKIPs with its reason when absent; per-pid scratch, no fixed display or port (~3s with Xvfb)
  { name: 'test-runaway-guard', tier: 'fast' }, // THE RESOURCE VERDICT (2026-09-25, the Chrome desktop-app incident + the owner's ruling): memory judged by the sample's own footprint metric (PSS, or anon+shm for ONE process), a per-process sum (summed RSS / anon-sum) never judged, the CPU rule + reaped ticks unchanged, the report level (r2: re-arm band + hourly floor + undelivered ⇒ re-sent; the oscillation fixture ⇒ one notice), the notice words, the per-provider numbers; negative controls (an rssBytes comparison trips on the incident fixture; no hysteresis ⇒ 1010101010; an undelivered notice latched) in scratch copies (<1 s, pure)
  { name: 'test-terminal-ui-scale', tier: 'fast' }, // 2.369.118 (userW inc-mu92zsgw-6c9y): every xterm container is counter-zoomed against the body DPI zoom and every font-size writer scales by uiScale() — the wiring pins; the chrome leg is test-terminal-zoom-select (heavy)
  { name: 'test-desktop-stream-keepalive', tier: 'fast' }, // 2.369.118 (userW inc-mu3lmd4s-dmwf): the desktop bridge pings every PING_MS, terminates a silent peer after two rounds and NAMES every close (real ws client + a TCP stand-in server, ~1s); the singleton Desktop walks the reconnect ladder; 2.369.156 r7 §5: the held-bytes cap — a viewer declaring a 2 GiB packet is closed 1009 packet-too-large in its first chunk with memory bounded, the other viewer untouched (control = the uncapped bridge, ~3s)
  { name: 'test-claude-retention', tier: 'fast' }, // 2.369.118 → 2.369.123: claude.transcriptRetentionDays (default 36500) → cleanupPeriodDays through the SHARED CLI-config applier (ensureCliConfig) + the shipped helper driven by VIBESPACE_CLI_CONFIG (apply / --status / --uninstall; r7: through a symlinked settings.json, and a `..` plan never reaches the applier) + the three env sites pinned; scratch HOME only
  { name: 'test-agent-tool-rules', tier: 'fast' }, // LANE L (the naive-user study 2, 2026-09-25: 7–15 'Permission: Bash' cards per browser task, Always Allow never sticking): the PURE rule table src/agent-tool-rules.js (every rule a 2.1.281 PREFIX rule; vibespace-job run/start/access held; the AGENT_TOOLS census — every vibespace-* tool allowed or held, with a why; every job verb decided), the matcher mirror of the CLI's prefix semantics, widenSuggestions (the CLI's two-word suggestion → the tool's rule), the plain words + the close --all scope, the adapter carrying the rules in the ONE --settings flag on every spawn (row off ⇒ none; a user's inline allow/deny kept; a --settings FILE untouched), the control_response naming `updatedPermissions` never `permission_updates` (stripped by the CLI — every Always Allow had been a plain Allow), the claude row, the permission-mode words, zh+ja, and a binary oracle (EVIDENCE SKIP without the CLI). ~0.3 s
  { name: 'test-harness-settings', tier: 'fast' }, // docs/design-harness-settings.zh.md §8: checkTable refusals, derived schema rows field-equal to the 2.369.120 snapshot, harnessSetting coercion, the plan (off ⇒ not written), applyConfigPlan/readConfigPlan on a scratch HOME (JSON + the comment-preserving TOML setter's fixtures: replace/append/dotted/refusals/idempotence/CRLF; r7: symlinked configs written THROUGH + modes kept + a dangling link refused, the duplicate-key shapes, the REAL codex loading every produced file — evidence-SKIP without the binary — and the rel re-check), the closed enum vocabulary, registerHarnessSettings prefix rules, the receipt wording, the live-verb fan-out
  { name: 'test-vnc-view', tier: 'fast' }, // the shared picture view: inc-mtdrm922's counter-zoom rule, the grep census that vnc-view.js is the ONE noVNC surface, and desktop-window.js byte-for-byte against the RETIRED file (the sanitized-git control; ONE deliberate change named — the plain-http copy chip), §5 the Paste flow's paste box (2.369.136, now the shell's), §6 the desktop-side copy on plain http — fake DOM + fake RFB, ~3s
  { name: 'test-desktop-serve', tier: 'fast' }, // DESKTOP APPS LANE C1 (docs/design-desktop-apps-seamless.zh.md §3.5): the desktop-serve OP TABLE — the closed nine-op set answered BY NAME by the runner (a table op the runner stopped naming is caught), every literal op a src/ caller passes inside the table, every failure {ok:false, code, error} with a runner-without-its-catch patched copy as the control, the daemon's three touches (hello-ack capability, both handler arms replying desktop-serve-result through the bundled runner against ONE per-process machine keeper, the client's id-keyed routing set + its capability gate naming host_needs_daemon), the SHARED tier's requires, the hub keeper holding device #0's machine keeper + ONE store, and desktop-access over fakes (local in-process, a paired device verbatim, an ssh host without a daemon refused host_needs_daemon < 1 s, the picture forward piping bytes both ways, ref-counted). LANE C2 §6–§10: the xpra install plan table (apt ≥ 5 vs xpra.org pinned 6.x, refusals by code, a malformed codename never scripted), the picker verdict, the hub REGISTRY of a paired machine's apps over a stub device (never the local store, idle via the op, the report judged once, offline kept + re-adopted, keeper.local, byte-identical local list), streamEndpointFor (+ the half-closed / gone viewer races released once, a pre-fix copy leaking as the control), the routes (host, machines, plan, NDJSON install, busy 409 first), machines() never connecting, the install past its deadline (install_timeout, the child waited out never killed, the slot held ⇒ busy, install_link_lost), the sudo probe itself over a fake sudo (a no-probe copy as the control). VERIFY r2: a viewer RESET during the forward is no uncaught error (F1, process-level trap, a pre-fix copy raising ECONNRESET as the control); the DETACHED install (F3/F4): it outlives a SIGKILLed starter, a re-created access layer re-attaches to the machine's pidfile slot (one install; the in-memory pre-fix starts two), a lost link / a timed-out-then-lost install holds the slot until the machine says gone, the freeing line naming the evidence. ~12.6 s, no display
  { name: 'test-desktop-viewers', tier: 'fast' }, // P8-2 x5 (docs/design-desktop-apps §7 P8-2 "x5 多客户端 = 单活跃 viewer"): the PURE one-active-viewer rule (active/blocked/watch with the agent lease, first attach, re-election by recency with the naive most-recently-joined pick as the control, panes never socket ids in the broadcast), the keeper's election + its desktop-app-viewers broadcast, the BRIDGE over fake xpra + rfb upstreams composed as the wiring composes it (blocked ⇒ no upstream and 0 packets either way, Resume here ⇒ the old active cut 4001 and the held hello/keymap/display/geometry replayed in order, an agent driving ⇒ picture only, a human takeover replaying the held kinds, the active leaving ⇒ the dormant one takes over, the session ending closes blocked sockets) with the pre-x5 bridge as a patched-copy control, the /viewers/takeover route and the wiring pins. ~1 s, no display
  { name: 'test-xpra-client', tier: 'fast' }, // P8-2 x2 (docs/design-desktop-apps §7): the PURE xpra words (hello caps, every packet form vs xpra-html5 v21 on 6.5.3, the browser-key → keysym rule incl. the U<hex> IME path, the pane FIT under size hints, the wheel-as-buttons accumulator, the clipboard delivery rule), the DOM-free session over a FAKE worker (fit-before-map, every non-popup window placed inside, §2b the bounded BELT undoing the app's own resize/move with its within-one-increment control, draws painted IN ORDER under an out-of-order decoder and every one acked, the clipboard both ways with dedupe, resize ⇒ display-configure + refit, view-only drops input, a disconnect names its reason, no-hello closes), the view under a fake DOM (the plain-http chip vs the API branch, the shell's paste box on plain http / a refusal and the not-connected refusal, Ctrl+V left to the browser, composition → typed text, pointer from the pane's rect, the ladder), and the grep census (one worker site, one .desktop-bar, a theme-var pane, the worker asset spelled once). ~2 s, no chrome
  { name: 'test-desktop-seamless', tier: 'fast' }, // ROUND 3 LANE B (docs/design-desktop-apps-seamless §3.3, D3): the PURE seamless verdict over its FULL 192-row matrix against the design's formula (why = wanted first, then the pause; per-app toggle precedence; the global off; lease / chain / phone / disconnected holding even a forced on) with a pause-less patched-copy control, the reveal arithmetic (250 ms hover, Alt, the 1.5 s linger, leave = fold) as PURE transitions, moveResizeAction / windowStateAction / the frame key+choice+menu, the REAL WindowManager seams over a fake DOM (beginDragFromPointer = the title bar's own drag from the press point, beginResizeFromPointer = the handles' own resize with the minimum, a CANCEL restoring either, a tab guest dragging its host) and the wiring / CSS / menu / i18n pins. ~0.3 s, no browser
  { name: 'test-desktop-app-scale', tier: 'fast' }, // DESKTOP LANE D (b) (docs/design-desktop-apps-seamless §3.4 note, the owner's 2026-09-25 report): THE PER-APP DEFAULT SCALE + THE CLICKABLE CHIP — the widened explicit set (1/1.5/2/2.5/3, each spelled EXACTLY by scaleKnobs — lane D (a)'s ceil rule and a browser row's dpi rule; the Settings enum unchanged), the launch request's `scaleChoice` carried or refused by name, scalePick's precedence table (a window's choice > the app default (origin app) > an explicit Settings value > auto) with a no-app-default patched copy failing exactly its app rows, the client's PURE model (one key per app = the frame key; auto REMOVES; the launch field; the card menu; Make n× the default) with a stores-auto copy as the control, the words ("1.5× · App default", the chip a control only when the window can relaunch, zh + ja), the ROUTE refusing a bad value before a paired machine is asked (a check-less copy lets it through) and the hub handing it over INSIDE the op body, ONE user-state loader for both per-app maps — and (lane D verify) that loader over a fake socket: a reconnect re-reads, a save is an edit of the server's current map (a stale page never wipes another client's key), a refusal rolls back; three patched-copy controls. ~1 s, no browser
  { name: 'test-usage-eta', tier: 'fast' }, // the compact per-donut reset countdown (src/lib/usage-eta.js): the band table at every boundary with an INJECTED clock, the B-8b12 refusal of an empty window, and the PURE census
  { name: 'test-browser-profiles', tier: 'fast' }, // AGENT BROWSER P0 (design-agent-browser-v2 §3.2/§9): the ENVIRONMENT half — the four spawn variables for local AND remote, the RESOLVED user-data-dir (§9 says assert the directory, because the two env strings pass on variant B, the broken one), the (D)→(C)→(N)→none ladder with its journalled reasons (the design's A/B are MEASURED rejects — r3), the browserKey continuity ladder, the D1 floor probe's outcomes over a fake binary, the pin indirection's no-restart property read back off the FILE, r3's three legs (the CLI's project-level `./agent-browser.json` layered with two patched-copy pre-fix controls, the host-decided remote fragment driven under every shell on the box + its `-L` sweep control, and 0600/0700 modes with a umask-independent control), and r4's: a FENCED config never lands on rung C (⑰, two patched-copy controls + the C rung's cwd record for the pin), the PURE predicate and the shipped fragment's awk driven over ONE "names a profile" table under every shell × every awk with round 3's grep as the control (⑭), the socket-root rule (⑱, an owned 0700 dir under the suite's OWN scratch base, a planted symlink refused) and its launch-free real-binary pair (⑨: `session info --json` + the argument-check refusal). ~4s, no ports, no fixed /tmp path, never the production /tmp/vs-ab-<uid>; the real-binary legs SKIP with evidence
  { name: 'test-browser-pin', tier: 'fast' }, // AGENT BROWSER P1 first half (design-agent-browser-v2 §3.3–§3.5, §5.1, §8 steps 1–2): the PURE registry/lease/verdict decisions and the five-rung pin ladder with its two-site vocabulary (SPAWN_ORIGINS + the client mirror), then the REAL keeper over a FAKE `agent-browser` on PATH (a daemon that is a real `sleep`): attach/detach leases, one browser per profile, the ceiling naming its holders, boot reconciliation dropping an orphaned lease BEFORE anything is kept alive, adoption across a keeper "death" by pid+starttime (a recycled/unproven pid is never signalled), the runaway stop + park, the migration's legacy record, the routes on an in-process express app and the shipped CLI (`use --print` never prints a CDP url; `close --all` refused on a shared profile). ~5 s, no ports claimed by name, no real browser, scratch dirs only
  { name: 'test-browser-handles', tier: 'fast' }, // AGENT BROWSER P1 second half (design-agent-browser-v2 §3.7 + §3.8 layer ①, §3.2.5 adopt): the ATTACHMENT SET + HANDLES — the PURE aliases/child handles/path-vs-handle/set view/fingerprint/`resolveHandle` outcomes (profile_required listing every handle with the default marked, the sub-agent clause an ASIDE, not_attached, ambiguous, profile_path_refused with the `new --adopt` remedy) + the one-time `profile_changed` bookkeeping + the audit line (verb only, never a fill's content), then the REAL keeper over a fake `agent-browser` (aliases, resolveFor = blindness check THEN handle, children minted/resolved/reaped by prefix, the audit file, adoptScratch moving a scratch dir under ~/.agent-browser/), then the routes + the shipped CLI + a REAL browser-env: two attachments ⇒ a bare `--` command refused, `--profile`/VIBESPACE_BROWSER run under that profile's daemon, a USER pin re-points the per-session config WITHOUT a restart (the direct `agent-browser` command resolves to the DEFAULT's dir and to no other) and the CLI's next command is refused ONCE with was → now, the agent's own pin never is. ~5 s, port 0, scratch dirs only
  { name: 'test-browser-continuity', tier: 'fast' },
  { name: 'test-browser-verbs', tier: 'fast' }, // BROWSER TAKEOVER C2 (design-browser-takeover §3 T1 / §4 T2 / §10): the PURE router src/browser-verbs.js (12 OURS words; the collision set COMPUTED from the checked-in --help census == {profiles}; page / refused-by-name with a remedy; identity/launch flags; --enable/--init-script beside open; batch judged per line; the same rules after `--`; resolveRealBinary skips the shim dirs and the shim by content) + the SHIM data/bin/agent-browser (exit 2, one line naming the vibespace-browser command; a forwarding copy is caught) + the CLI over a fake server (`click` ≡ `-- click`, local refusals with ZERO server calls, `use --print` not_offered, `new-child` prints only VIBESPACE_BROWSER, binary_absent behind a shim); r1: every flag-ordered `get … cdp-url` spelling, and the ENV TWINS of refused flags never reaching a fake real binary on any /resolve kind (a pre-fix patched copy is the control); r2: only the NOUN decides (`get attr @e cdp-url` passes, a boolean flag's `true`/`false` skipped so `get --json true cdp-url` is refused), the --help GLOBAL-option census over VALUE_FLAGS, the SOCKET ROOT legs (the answer's socketDir/runtimeDir win over a decoy SOCKET_DIR/XDG, rung H keeps only `<base>/vs-ab-<uid>`), patched r1 copies as controls. ~3 s, port 0, scratch dirs only r3: VALUE_FLAGS/BOOL_FLAGS EQUAL the measured global-flag fixture (scripts/browser-flag-census.mjs; `--idle-timeout` was the gap), the `get` noun allow-list, every-reading judgement of an unknown flag, the config rule (sanctionedConfig: a project file only narrows, no raw-debugging switch) + the answer's `config` set last + the CLI's composed file, rung H's lstat; patched r2 copies as controls. r4: a navigation to the web only (every spelling of file:/chrome:/about:version/… refused, web controls), `state load` of a crafted file, the stdin batch in the binary's JSON form (the fake reads ONLY JSON), the ACCOUNT's passwd home (a --require preload injects it; a disagreeing $HOME refused, once with the real entry), the older-server config, the version gate, the census CLI; patched r3 copies as controls.
  { name: 'test-browser-ephemeral', tier: 'fast' }, // BROWSER TAKEOVER C3 (design-browser-takeover §5 T3, D2/D7/D8): the MANAGED EPHEMERAL browser — PURE record shape / set exclusion / the ceiling counting ephemerals + the desktop-app count seam (`browser_cap` naming every holder; a named start keeps `cap`, control) + the REAL keeper, routes and shipped CLI over a fake agent-browser: first verb ⇒ ONE record (ns vs-<key>), ONE lease `ephemeral`, ONE audit line, /resolve kind:'ephemeral' with the session's EXACT pairs (the browser-env resolver never asked), reuse, idle-out = stopped + relaunch, the live-view port PARITY with the legacy path, takeover pause, fork/child records, conversation death ⇒ record removed (a named profile never), the 7th conversation refused, runaway park, restart adoption; r2: every /resolve kind names the keeper's socket root (rung H only hostSocketBase) and a decoy SOCKET_DIR + XDG through the shipped CLI lands on it (the r1 table beside a CLI copy is the control). ~6 s, port 0, scratch dirs + an isolated HOME r3: the keeper launches a config-less browser with its named file, /resolve names the same `config`, a command from a directory holding its own agent-browser.json runs with it; the pre-r3 keeper in a patched copy is the control. r4: the keeper names its own machine*.json only while lstat says it is its regular file with its content (a swapped-in symlink / an edit re-written; the r3 existsSync check in a patched copy is the control). lane H ④: the ephemeral is a HOLDER ROW (digest + status `leases`, `browserLive`), its start/verb/stop are seam events that HOLD the verb until the recorder armed, `browser_stopped` without a CLI ask, the REAL recorder taps it with no viewer (boot too); a mutant-copy keeper dropping the row is the control. verify r1: a dead ephemeral is judged by its PROCESS before the tick (0 CLI asks) and the REAL bridge's upstream close takes its row out at once; only the verb that started the browser waits for the arming (stuck ⇒ the next verbs 0 ms; a failed arming backs off); `detach` on an ephemeral is an ephemeral seam event that retires it now and says so; naive study 2: a sub-agent's browser is tapped under its OWN pairs (`~child:`, the real bridge) and recorded; each with a mutant-copy control. ⑤ the keeper is the ONLY launcher of a profile browser (CDP, never the directory; every call repeats the launch view) and a view never starts one, over a fake binary that behaves like 0.38.1 (per-session daemons, a held profile lock, launch-view restarts), three mutant-copy controls.
  { name: 'test-cli-cmd-refresh', tier: 'fast' }, // B-a18e: the agent-CLI path re-resolved at SPAWN time when the boot answer went stale (the installer-window restart) — the helper over injected facts, the wiring pins, and a scratch server whose fake claude is renamed A → B → A between spawns (each spawn runs it where it NOW is, no restart; gone everywhere ⇒ the old error path + one line). ~8 s, dtach required (SKIP names it)
  { name: 'test-browser-takeover', tier: 'fast' }, // AGENT BROWSER P3 (design-agent-browser-v2 §4.3/§4.3.1): the PURE takeover/handback/idle/announce verdicts + the CDP-shaped input records, the REAL keeper's input side over the fake agent-browser (browser_paused on resolve, idle lapse on the keeper's own tick with an injected clock, detach, the confirmation registry answered through the CLI's own confirm/deny), the announcer's three moments against a fake ladder (one billed site under 'browser-handback', a refusal stashed + noticed), the REAL bridge over a fake upstream (mode records, holder-only forwarding, held, viewer-left), the routes in-process and the shipped CLI's refusal; lane J: the picture-vs-page table (4 shapes × 2 windows × 2 zooms ≤ 1 px, the pre-fix formula as control), the bridge's viewport record (first frame / picture / tab / takeover, replay, the private cdp_url pair, a failed read said once), the CDP reader over a fake endpoint, the trace's frame size + wiring pin. ~6s, no real chromium
  { name: 'test-browser-providers', tier: 'fast' }, // AGENT BROWSER P4 first half (design-agent-browser-v2 §7.1–§7.3, §7.2.1, §3.6 row 3): the PURE provider rows with their capability cells and the exact typed refusal each control produces (provider_unavailable naming the §7.2.1 refusal, provider_needs_local_key on host != null, provider_local_only, provider_lacks_capability per cell), the local-oracles discipline over the egress proof record (a `blocks` claim's cell IS false; a measured record without its four runs FAILS), the cdp env pair + url re-pointing, the cloakserve plan's typed refusals + docker argv, the egress allowlist verdict table; the SHARED browser-serve runner over the fake agent-browser; a REAL agentd daemon answering `browser-serve` with its capability asserted and an old daemon never asked; the ORCH access layer forwarding a paired machine's CDP port over a fake tcpForward (bytes round-trip), the keeper's remote chromium / remote cdp / local cdp records (never pid-signalled, stop closes the forward), the routes (providers, create with host/cdpPort, refusals by name) and the allowlisting egress proxy over real loopback sockets. ~8s, port 0, scratch dirs, no real browser, no vendor call
  { name: 'test-browser-backend', tier: 'fast' }, // AGENT BROWSER P4 second half (design-agent-browser-v2 §7.4 / §7.5 / §7.6, D17 / D32–D34, round 8): the PURE switch model in src/browser-switch.js — the version ladder over a matrix (target ≥ / < / unrecorded, registry-vs-`Last Version` disagreement ⇒ the HIGHER), the carried seed, the fingerprint sentence, SEATS AS THREE STATES (known-fresh / known-stale / unknown; an unknown total never satisfies the ceiling — controls that treat it as 0 and as ∞ are red; a stale verdict degrades past SEAT_TIER_STALE_MS), the ceiling wording forked on key source (the user's own names holders; the cluster default lists no profile and offers the one click out), the launch-failure classifier's SHAPE (backend_seat_taken), the site hint carrying WHO claimed it with `tier` legal only while `backend === null`, `blocked` a CLAIM the server never manufactures, the gate's ORDER (keyScope refused before any key is resolved) — then the REAL keeper over a fake `agent-browser` playing cloak: the gate's three named refusals (backend_unavailable / backend_no_key + action / backend_seat_taken) and a real in-place switch (stop → same dir + carried seed → one tab re-opened per lease at its lastUrl → re-pinned → targetId rewritten → the lease OBJECT never destroyed; attach/resolve answer browser_restarting mid-way), a proposal when another session holds a lease, the routes + the shipped CLI's `backend`/`blocked`. ~4 s, port 0, scratch dirs only, no real browser, no vendor call
  { name: 'test-browser-housekeeping', tier: 'fast' }, // AGENT BROWSER P5 (design-agent-browser-v2 §4.5 / §6.4 / §7.1 / §8 step 3, D7 / D8 / D35): the PURE trace model (the action table — an observation is never traced; a fill's value / a type's text never stored, only their length; the position kinds; the after-frame pick matrix; the retention PLAN naming every removal's rule; the recording gate by name; the sweep SCOPE = exactly the provider rows with ownsDir true, the cloud:* / local-window / cdp / remote records refused `not_ours` as the negative control; the housekeeping verdict that never answers "delete" and names the in-flight grace with its age; forget refused while leased or running; the orphan candidates + path verdict), the REAL recorder over a fake bridge + a stub keeper (before-frame off the ring, after-frame by settle / latest / same, the box probe through the runtime, 0600 files + index, the fill value absent from every byte on disk, tap-end finalizing, the lease seam arming/disarming, the setting gate, the sweep by age and by size, forget = rename beside + ledger BEFORE the record goes, orphans listed / adopted / forgotten, the ONE permanent deletion refusing anything not `.forgotten-`, recording start/stop through the lease's own session + the floor refusal), the routes in-process (session-id OR browser-key match, the frame served nosniff, PATCH's editable fields, host refused by name), and the REAL keeper's seam over the fake agent-browser (attach → attach + browser-ready, updateProfile → profile-updated, detach → detach, the digest hook merged into list()). ~6 s, port 0, scratch dirs only, no real browser, no vendor call
  { name: 'test-browser-mediation', tier: 'fast' }, // AGENT BROWSER P6 (design-agent-browser-v2 §6.2 / §6.5 / D6): the §6.2 sharing verdict (instance only where the mediating proxy exists and on this machine), the PURE CDP mediation rules over literal messages (target scoping, the session gate, browser_paused while the user drives, the whole-browser acts refused, scope growth/shrinkage, the measured Chrome ordering replayed) and the REAL proxy over a fake CDP upstream on loopback (two grants on one browser — the second cannot see or touch the first's tab; /json twins re-pointed; unknown token 404; revoke closes the lease's tabs; repoint 1012); takeover C3 ⑤: raw CDP (connect / get cdp-url / --cdp / --auto-connect) refused by the router AND the shipped CLI with zero server calls, a takeover pauses resolveFor for the managed ephemeral browser and an attachment alike; ③b (desktop lane C verify r2): a client that RESETS or half-closes while its upstream opens is no uncaught error and leaves no upstream open (a pre-fix copy as the control). The real-chrome exit proof is test-browser-mediation-chrome (heavy).
  { name: 'test-browser-tier3', tier: 'fast' }, // AGENT BROWSER P10 (design-agent-browser-v2 §7.6 tier 3 / §7.1's local-window row / §4.9 columns 1-2 / §6.6, D27 (b) / D31): PURE src/window-desktop.js (the closed refusal set, the D27 (b) consent verdict, the desktop rows = the bus minus ours + this process every one marked, key / click --at refused BY NAME on the class, watch no_live_view, the §4.9 capture matrix per window, the MEASUREMENT RECORD under the local-oracles discipline with negative controls — a rung wired without its ok cell goes red — and hintAction that never answers auto), the registry (the tier DERIVED from the row, a profile record with no tier field, the local-window row wired behind provider_needs_consent, the exact refusal for cdp / allowed-domains / pin-tab / live-view / start / switch / sweep / remote with chromium as the control, a tier-3 PROFILE refused tier3_is_a_window_target, the site-hint rule's both-at-once control, the tier-3 blocked sentence that says "your act" and never "detected"), then the ENGINE over a fake keeper + a fake helper + the routes + the shipped CLI: the switch OFF lists nothing of the class and refuses attach 403 desktop_consent_off; ON lists the bus minus ours; one holder; snapshot / click @ref / type reach the helper with the desktop pid; key and click --at are refused BEFORE any helper call with xdotool "present"; the user's pause over the cookie route ⇒ window_paused; every audit line origin:desktop; the lease persists across a rebuild; the switch OFF drops it at the next verb (by:consent) and at boot. ~3 s, port 0, scratch dirs, no display, no browser
  { name: 'test-window-targets', tier: 'fast' }, // AGENT BROWSER P9 first half (design-agent-browser-v2 §4.9 / §5.1.1 / §6.6, D27 (a) / D28 / D29): the PURE verdicts (the closed chord vocabulary, the action preference that never picks showContextMenu unnamed, the per-verb capability law — key / click --at refused with the probe rows when no wired injection backend exists, click @ref / type never gated by injection), the BOUNDED subprocess over fake helpers (a hung helper is SIGKILLed at the wall and answers helper_timeout with the child dead; garbage ⇒ helper_error; a missing interpreter ⇒ python3_missing; a11y_unavailable passed through), the engine over a fake keeper (one holder per window, not_attached / window_leased, refs per snapshot, the audit line without text) and the routes' status map; then a REAL leg on this box's own Xvfb + the GTK fixture through the real helper — refs minted from the real tree with the census printed, click @ref changing the app's state as read back from ITS tree, the label-drawn button refused node_has_no_action with AND without an injection backend, type through EditableText, ctrl+s and a canvas point click landing (the app's own witness labels) and both refused with the probe when xdotool is taken away, a PNG screenshot of the frame — SKIPs with evidence without python3-gi/Atspi/Gtk or Xvfb; takeover r2: a desktop-app BROWSER is refused by row, exec name, launcher program or running exe (the measured fixture scripts/fixtures/window-targets/browser-execs.json, this box's installed browsers, a shell copy named `chrome`; gedit / chromium-thumbnailer / infobrowser controls; the r1 rule in a patched engine copy is the negative control) LANE E VERIFY R2: deterministic race legs + the PER-SITE census (every held()/heldOrUnlink(/stillHeld( call removed alone turns a leg red), reach_unreadable (a throwing Task Group store keeps the lease; control: the fold-to-[] copy), the cancellable injection (a takeover / revoke kills the lease's own child and releases the held keys — real-display leg + a no-release control; control: cancelActs neutered), TYPE_MAX × delay fits the scaled timeout.
  { name: 'test-window-reach', tier: 'fast' }, // DESKTOP LANE E (docs/design-desktop-apps-seamless §3.6, the owner's D1–D7): the PURE reach + share-mode model src/window-reach.js — the 30-cell principal × scope × caller table (hidden by default, sessions by conversation / webui key, Task Groups by membership NOW), one row per principal, own-row revoke, widen-only over 256 grant sequences, the opener's self-open row, the 72-cell D7 mode table (pixels refuses snapshot / click @ref / type @ref with the owner's sentence; auto probes then follows its resolution) with the measured resolutions (xterm no tree, Chrome's closed 4-frame tree, the calculator), the pixel plan / visibility / point mapping on the measured calculator + Chrome geometry, the request text, the picker, the launch memory, the session key = server.js sessionStatusKey; three patched-copy controls (group rows ignored, a kind-wide revoke, pixels letting the tree through). < 1 s, no process
  { name: 'test-window-binding-model', tier: 'fast' }, // AGENT BROWSER P7 (design-agent-browser-v2 §4.6 / §3.7, D19 / D24) the fast half: the PURE chain model in src/lib/chain-layout.js (a missing layout reads as tabs, the ratio clamps, `split` validated against `tabs` in ONE place with the pre-fix dangling-pair shape as the negative control, the multi-client sync key that changes when only the layout changes with the pre-fix `tabs.join(',')` key as its control, a ratio-only change applied in place, displayed panes wide vs NARROW, D19 (a)'s replaceable pane, the bind pair by side, the one grid-columns spelling), the ownership badge (two sessions in one task group distinguishable, a session in no group badged at all, every owner once with the viewer first), and the wiring pins (every chain mutation normalizes, layout.js keys by chainSyncKey with the pre-fix key gone, captureState persists layout + split, the divider's one kind of pixel, syncHiddenViews' narrow-split hider, the ≤768px stylesheet rule, §6b's four anti-ping-pong guards untouched; split UX chunk 1: dropSide gone, visualTabOrder / swappedPair / splitPartner, the drop-zone pins FLIPPED negative, _afterUserMerge once per user merge drop and never on restore / sync, the button / glyph / undo pins). ~0.2 s, no DOM
  { name: 'test-live-strip', tier: 'fast' }, // MULTIVIEW (docs/design-browser-multiview.zh.md §2 A1 + D4, lane P): the PURE strip arithmetic of the Agent browser window (src/lib/live-strip-layout.js) — the FOLD at 1400 / 900 / 600 px (the tab you look at never folds, a browser running a command outlasts a quiet one, ties right to left, the design's six zh/en labels), the FIRST-SEEN order (a new browser at the tail, nothing shown moves), ≤16-char labels, the own/cap CHIP (red at the conversation's cap, the machine ceiling a separate flag) + its Stop list (never a driven or released browser; a shared profile says so), the PER-CONVERSATION cap verdict beside the MACHINE ceiling (which refuses first, the remedy naming the chip's own text, the other holders counted never named); two patched-copy controls (the shown tab may fold, left-to-right folding). ~0.2 s, no DOM
  { name: 'test-chain-layout', tier: 'fast' }, // SPLIT TABS v2 (docs/design-split-ux.zh.md §8, inc-muhfb5al-jzk6, 2026-09-25) the PURE model of src/lib/chain-layout.js: every tab of a split belongs to a SIDE (ordered `split.left` / `split.right`, union = tabs, each id once, pair[i] on side i, strip = left ++ right — held after each step of a seeded random walk of every verb), the creation rule, an emptied side ending the split, the old-record repair, moveTab / showTab / removeTab / swapSides, chainSyncKey carrying the order + the cut + the pair (never the ratio), and four patched-copy negative controls; v2 verify r1 ⑪: the HELD divider ratio (holdRatio / heldRatio / releaseRatio — a local drag a remote record could not know wins for ≤ 60 s, never in the key or a clone) + two more controls (no expiry, blind to a moved ratio). ~0.3 s, no DOM
  { name: 'test-profile-blindness', tier: 'fast' }, // AGENT BROWSER P1 second half, the FAST half of §3.8 (layers ① + ②): the session-status notice slot is a QUEUE of typed {kind,…} notices (a status override and a browser-profile change BOTH pending survive each other, renderNotice dispatches on kind with the status-override sentence verbatim, unknown kind refused loudly, bounded, an older build's single `pendingNotice` lifted at load), the REAL /api/agent/prompt-context DRAINS (both reach ONE prompt, none the next, the webui:<id> record too), the session-start context lists the current attachment set, and END TO END a USER's mid-task pin through the UI route re-points the running session's config (no restart), queues the typed browser-pin notice into the real store, the next prompt carries it as one <system-reminder>, the keeper refuses the next command once — and the path names no spend reason. The heavy half (layer ③'s chip MUTATION leg) is not here. ~3 s, port 0, scratch dirs only // AGENT BROWSER P0 r5 (design-agent-browser-v2 §3.2.1 + D1): what survives a HEADLESS restart and a KILL, on a real worktree server — the too-old notice reaches the first client to connect after a boot that had none (round 4 latched before delivery; measured zero frames at Ready+6.3 s), and a Terminate → Resume of one conversation keeps ONE browser key through data/browser-env/bindings.json (round 4's rung read only the meta file the kill path unlinks); r6: a FORK of that conversation leaves the parent's binding untouched (the fork's process carries a different key, the choke-point rule held without the store's belt), and the parent's next resume lands on its own key with ONE namespace ever spawned for it (round 5 re-bound the parent to the fork within 800 ms). Fast tier: free port, scratch worktree + scratch HOME, a FAKE agent-browser (0.30.0, `--version` only) and a FAKE claude on CLAUDE_CMD — no real CLI, no browser, no vendor call, ~10 s.
  { name: 'test-spend-paths', tier: 'fast' }, // THE SPEND CEILING (design-account-hardening §4.4c/P9 + D2/D3/D6/D8): the grep-derived census of every producer that can start a turn nobody typed, the persisted per-identity budget, overage, the EDF reserve floor and the four fail-closed sites. 0.6s, no ports, no fixed /tmp path
  { name: 'test-rate-limit-capture', tier: 'fast' },
  { name: 'test-quota-model', tier: 'fast' }, // the TYPED limit set (B-9213 three concurrent codex limits) + the ONE usage-cache write path + the empty-window rule (B-8b12) + the writer census and the reader census — the money store's shape gate

  { name: 'test-public-links', tier: 'fast' }, // every "link to something here" surface uses the instance's public address (not the browser origin)
  { name: 'test-remote-shell', tier: 'fast' },
  { name: 'test-mount-oauth-probe', tier: 'fast' }, // dead OAuth token behind a healthy-looking mount: probe eligibility + slow clock + phrasings + Re-authorize button; §4 D2 (integrations 4a): a Drive client switch lands WITH its token (applyDriveToken client), children bounce, Gmail through its PATCH
  { name: 'test-compaction-ux', tier: 'fast' }, // prompt_too_long → guidance card + /compact turn label + two-step Stop (normalizer behavioral + wiring pins)
  { name: 'test-job-model', tier: 'fast' },
  { name: 'test-jobs-triage', tier: 'fast' }, // Background Work TRIAGE (design §13): the real engine + real user routes over the neutral fixture — acknowledgement stamps, the archive sweep with an injected clock (who archives / who stays / unacked never), read-through, the cap, a restart, one broadcast per sweep, the CLI's list --archived against a fake API. ~2s, no fixed port/path
  { name: 'test-usage-estimator', tier: 'fast' }, // dead-reckoning core; was OUTSIDE the gate (silent-stale class) until the 2.368.13 delta-relative calib change touched it
  { name: 'test-remote-discovery-dirty', tier: 'fast' },
  { name: 'test-resume-all-desktops', tier: 'fast' }, // pure scan + the WIRING pin (the 2.331.0 dead-fix lesson)
  { name: 'test-ctx-sync', tier: 'fast' },
  { name: 'test-workflow-live-view', tier: 'fast' }, // 2.369.119 (owner "怎么这个内外实现还不一样"): ONE live view for the Workflow card and the View Workflow window — PURE mergeLiveWorkflow (tree over disk skeleton by agentId, journal retry verdicts win) + normalizer taskInfoById + every live branch of /api/workflow wrapped
  { name: 'test-workflow-disk', tier: 'fast' }, // 2026-09-26 (owner: a workflow window read 运行中 + eleven "(agent)" rows for a run stalled two days): PURE src/workflow-disk.js parseRunDir — labels/phases from the journal's started lines + agent meta.json (CLI ≥ 2.1.267), the liveness verdict from the run's mtimes (no write for 10 min, no live tree, no snapshot ⇒ stalled, never running); the journal arithmetic moved verbatim (pre-move reference); the REAL route over a scratch HOME (stalled / running / live tree / snapshot untouched / resumed / pre-2.1.267) + the REAL remote probe script run by sh; zh/ja words; patched-copy controls (ignore metas, no liveness) go red; lane Q verify: treeAlive (a tree's proof of life has a clock — aliveAt) + liveNoteKind tables, the route under a REAL normalizer (wire order + level set) and a REAL rebuildHistory (2-day / 1-min replays), remote meta-only + no-clock legs, route / normalizer / probe copies as controls (the level set's two layers each proven alone); ~2 s
  { name: 'test-unknown-records', tier: 'fast' }, // 2.369.119 (owner "未知的 event 不要直接过滤掉"): an unhandled top-level type / system subtype not on the DECLARED known-ignored lists becomes ONE dim card per name per session on the live path (claude + codex); handled/ignored/history never do; the consumer-type census
  { name: 'test-record-shape', tier: 'fast' }, // design-unknown-records §3 (owner ruling (b), 2026-09-21): a KNOWN record carrying undeclared fields is a card + a breadcrumb — PURE src/record-shape.js census over the tracked fixtures, synthetic drift/merge/telemetry-once, enum drift with the handler still running, the BINARY ORACLE over the installed claude's zod union (every subtype/type on exactly one list, every declared shape's fields ⊆ known ∪ ignored; SKIP without a binary), the negative control (ignored emptied ⇒ §1 red)
  { name: 'test-task-lifecycle', tier: 'fast' }, // background Agent/Workflow/Bash lifecycle from HISTORY (launch acks + persisted notifications) + inc-mudv05ja-n5rv: the live Workflow card patched in place, never swapped, while the run is live, in the CLI's real agent words (real normalizer → real ChatView/renderers/status bar over a parsing mini DOM, pre-fix negative control)
  { name: 'test-freeze-probe', tier: 'fast', why: 'pure: the freeze probe\'s self-gap verdict (a hidden / returning tab is not a freeze)' },
  { name: 'test-codex-quota', tier: 'fast' }, // codex quota P0+P1: window-by-length normalization (0.149.x single-window), exhaustion markers kept, persistence, estimator inclusion
  { name: 'test-peer-delivery', tier: 'fast' }, // peerDelivery registry lane: codex rpc-queue rung (real deliver.create + sidecar) + wiring pins
  { name: 'test-cli-usage-parse', tier: 'fast' },
  { name: 'test-account-relogin', tier: 'fast' },
  { name: 'test-peer-command-card', tier: 'fast' }, // inc-mu6bfv1t-4drq: a harness-delivered peer message renders at turn START (command_lifecycle uuid → the JSONL record, real consumer + real normalizer, msg_id dedup against the result rung)
  { name: 'test-peer-msg-card', tier: 'fast' }, // peer message visible on the LIVE stream (result.origin mining + 3-site dedup) + the codex twin (injectPeerCard, webui_peer marker live/rebuild, marker-blind twin dedup, feedPeerCard no longer false for codex)
  { name: 'test-stdout-registry', tier: 'fast' }, // S5 stdout consumer registry: descriptor caps.streamProtocol → ONE consumer (src/server/stdout/); unknown protocol = loud console.error + telemetry + RAW passthrough (never stream-json); each consumer on a fake pty feeds representative records to its REAL normalizer + id adoption / streaming flag / _stdin_ack / todos / engine calls; wiring pins
  { name: 'test-account-pool', tier: 'fast' },
  { name: 'test-mount-stranded', tier: 'fast' }, // stranded writes under a DISCONNECTED mount point: quarantine-never-delete on connect + shadowedBy predicate + TASK.md writer guard + wiring pins
  { name: 'test-pool-signed-out', tier: 'fast' },
  { name: 'test-owner-batch-2369-32', tier: 'fast' }, // owner batch 2.369.32: codex resume model continuity (last turn_context) + wrapper model pin, sidebar primary-only default, codex ⟳ dispatch, auto-resume origin label, 'not started' reset display
  { name: 'test-reset-credit-verdict', tier: 'fast' }, // docs/design-reset-credits.zh.md §4/§6: the PURE reset-credit verdict — both vendors' tables (wall × remaining × time-left × credits × cooldown × use-by × replenishes × warm/cold × pool alternative × ladder position), CREDIT_FLOOR, the anthropic knee at exactly W/b, describeUse wording, patched-copy negative controls, and the WIRING PINS (the engine calls the verdict and forks on warmth; both normalizers + the arm card carry the offer)
  { name: 'test-reset-credit-ui', tier: 'fast' }, // docs/design-reset-credits.zh.md §5 (p2): the manual use — the PURE dialog sentences, the roster chip (claude disabled WITH its reason), the route over the REAL engine + a stub wrapper (not_supported by name / no_live_session / ONE verb through the authorizer / cooldown / no_credits / spend_refused / agent refused / a person's failure reported, never laddered) with patched-copy controls, and the three entry points calling ONE dialog
  { name: 'test-codex-pool', tier: 'fast' }, // codex pooled account cold-switch v1: store/spawn/self-heal + engine gates + wrapper signal relay + list() pool shape for every backend + ONE shared pool menu/roster pins (2.369.18)
  { name: 'test-vendor-whitelist', tier: 'fast' },
  { name: 'test-account-verdicts', tier: 'fast' },
  { name: 'test-window-minsize', tier: 'fast' }, // 2.369.158 (docs/design-desktop-apps §7.6, the owner's cropped calculator): a window's OWN minimum — the PURE rule (the .window floor, the drag clamp that keeps the opposite edge, raise-to-min, the window minimum from a content minimum + chrome under the UI scale), the REAL WindowManager.setMinSize + resize drag over a fake DOM (a minimized window never shrunk from a zero reading, the phone layout never raised) with a patched copy of the pre-fix drag as the control, and the wiring pins (desktop-app-window → setMinSize, the phone min 0 !important). <1 s, no browser
  { name: 'test-title-chips', tier: 'fast' }, // lane G (2026-09-25, the owner's tab strip "V.." beside "≋ 全部 → UCI Max"): THE TITLE WINS — the PURE chipMode table (full / compact / icon at their exact boundaries, monotonic in the room), memberShortName / chipWords / titleMinText / inboxCountText, three patched-copy controls of the rule (always-full = the pre-fix chip, full-while-six-characters-show, no icon floor), the REAL WindowManager._fitChip over a fake box (same answer from every starting form, overflow, not-laid-out, measured once per words) with a label-only-room patched window.js as the control, and the wiring pins (every re-decision trigger, ONE ResizeObserver unobserved on close, one rAF per burst, the tooltip's full words, the CSS forms, the inbox chip's flex:none + 99+). <1 s, no browser
  { name: 'test-browser-faces', tier: 'fast' }, // THE THREE BROWSER FACES RENAMED (docs/design-browser-faces.zh.md direction B, takeover §7 / D10): every face's label at its source (toolbar Web view, the phone '+' sheet's three rows + gates + the session picker, card-menu commands, Session Properties, Settings category + Services group, customize, the Apps dialog's intro / 'Browser app ·' gate / pointers, trace + live-view pointers, rail) with the ids pinned unchanged; the i18n census (every new key in zh AND ja with the tabled words, every retired key gone unless still said, a live-t() control); the mockup-parity control (index.json 12/12 drawn, every shot's own control undrawn, a planted undrawn record refused); the doc's SHIPPED line. ~0.2 s, reads files only
  { name: 'test-live-bar-layout', tier: 'fast' }, // LANE I (2026-09-25, the owner's zh live-view screenshots — labels stacked one glyph per line, "undefined" in the bar): the PURE chrome-bar fold rule src/lib/live-bar-layout.js over hand-computed tables (priority, right-to-left ties, the ⋯ charged, never-fold overflow, absent items, DOM order, the live view's real table at zh 600/400/330) + 3000 seeded bars (fits / minimal / monotone), the short mode badge (zh + ja), THE CASCADE-TIE CENSUS (no (0,1,0) style.css rule on a file-tool-btn companion class sets a property viewers.css's 24×24 icon rule wins — the root cause), the wiring pins (both views fold through bar-fold.js, URL / status minimums = their CSS, ONE mode toggle, the globe, the window menu's live-view row, zh + ja), mutant-copy controls (fold by position; the ⋯ forgotten) + a planted pre-fix rule. ~0.3 s, no browser
  { name: 'test-window-types', tier: 'fast' }, // window-type registry (Plugin Ph1): node-functional dispatch + loud unknown-action + the exact core type/action sets + no switch/TYPE_ICONS literal left
  { name: 'test-taskbar-group', tier: 'fast' }, // A GROUPED TASKBAR BUTTON (lane K, 2026-09-25, owner "这个体验比较差"): the PURE verdicts of src/lib/taskbar-group.js — the click table (behind ⇒ activate, in front ⇒ chooser, a drag's release ⇒ none, every pointer type, with or without an open hover chooser), the hover table (fine pointer only, never touch / drag / another popover, the ~300 ms intent both sides), in-front, keys; patched-copy CONTROLS (the old always-chooser click fails the 8 behind clicks; a hover that forgets touch); wiring pins over the COMMENT-STRIPPED taskbar.js (the single button asks none of it; verify r1: the chooser's cleanup disposes createPopover's outside-click close); §9 the REAL attachPopoverClose run in node over a fake document honouring { signal } (dispose after / before arming, a popover gone by another path self-heals, the LIVE exclusion list; master's function and the r1-minor one = the controls); the five verify-r1 lows pinned (a pen hovers, a rebuild re-anchors the chooser, a row's right-click = that tab's window menu + re-list, restoreTabChain notifies) + THE PRODUCER CENSUS over the class names the two "another popover" guards query (taskbar.js _otherPopoverOpen, app.js's autohide conceal guard), each guard's pre-fix `.taskbar-window-list` = its control; §10 the pen leg's judge (scripts/pen-hover-judge.mjs) over 360 fake-clock interleavings of Chrome's post-layout mouse re-target vs the CDP sample (the patched last-enter slot red on exactly the losing order) + §11 the REAL hoverStep (movement arms once per GROUP visit, an enter never, 'away' ends it) over 378 timed scripts (controls: every enter an arrival; 'away' ignored); zh + ja words. ~0.3 s
  { name: 'test-status-bar-chips', tier: 'fast' }, // THE STATUS BAR UPDATES IN PLACE (design-accessibility-tree §3 row 8 (b), §8 lean, chunk a3): the REAL ChatStatusBar driven through a 40-line counting fake DOM — ① the same chip node object survives 20 context%/cache/cost/turn-state ticks (hot chips re-write their markup, cold chips never, zero elements created) ② turn-state / health / held / workflow chips appear at their place and leave with the neighbours' identity intact, the goal chip flips on ONE element ③ attribute parity with the innerHTML era (raw titles, classless cache/cost, the pie markup) ④ NEGATIVE CONTROL: a scratch copy neutered to the whole-bar rebuild fails ① ⑤ wiring pins (render ends in _reconcile, no this._element.innerHTML, the one delegated click listener)
  { name: 'test-ax-paint', tier: 'fast' }, // paint-only OUT of the accessibility tree at the source (design-accessibility-tree §3 rows 2+3 lean, chunk a2): icons.js `_s()` aria-hidden + focusable=false over every exported value, the icon-only <button> census (template + DOM-built: an aria-hidden icon is no longer a name ⇒ title/aria-label required; a DOM-built rhs is icon-only when nothing but icons / whitespace strings is left, e.g. `icon + ' '`; classifier negative-controlled on a fixture AND on a scratch copy of src/lib with a planted nameless button), every gutter/diff-prefix/run-arrow/spinner/resize-handle/minimap-strip site marked, the CSS glyph census (every generated ▸/▾/·/LRM glyph in the alt-text form `content: '…' / ""`, no sentence carries it)
  { name: 'test-harness-contract', tier: 'fast' }, // S1 harness registry conformance: every registered harness passes the same descriptor/adapter/normalizer/wrapper/store/client-META assertions; unknown ids throw
  { name: 'test-tool-toggles', tier: 'fast' }, // per-feature Integration toggles: a disabled agent CLI is neither taught (context/reminder/stop nudge) nor served (403) — was outside the gate and rotted on a literal CLI count for 27 releases (B-0e1b)
  { name: 'test-image-cards', tier: 'fast' }, // image media cards against the REAL renderer in node: claude Read(image) + codex view_image → one expandable /api/file/raw card (host-qualified), non-image cards unchanged, XSS, codex call_id dedupe + input_image lifting, wiring pins
  { name: 'test-otel-truth', tier: 'fast' }, // per-request billing truth: parser + loopback ingest + bake override + wiring pins
  { name: 'test-search-card-title', tier: 'fast' }, // search cards carry the query in the TITLE (claude WebSearch/WebFetch, codex web_search, ACP search): pure helper + the REAL renderer (esbuild→node) incl. XSS escaping + wiring pins
  { name: 'test-path-linkify', tier: 'fast' }, // where a chat file path ENDS: CJK/fullwidth punctuation terminates it, CJK filenames still link (owner screenshot 2026-09-10); pre-fix negative control + renderer wiring pin
  { name: 'test-model-echo', tier: 'fast' }, // the /model confirmation echo — ONE parser (src/model-echo.js) for the status bar, the command-card label and the lock repin: the backticked echo verbatim (CLI ≥2.1.257; last plain alias (id) 2.1.226) + the old echo as the control + ANSI/display-name forms, the REAL renderer label, wiring pins + a no-inline-regex census (25)
  { name: 'test-backlog-no-truncation', tier: 'fast' }, // THE BACKLOG STORE NEVER TRUNCATES (2026-09-22: a group at exactly the old 200-item cap lost every backlog-add silently while the CLI echoed a stranger's id): 2000 items round-trip, the REAL route echoes the STORED item by identity, source pins (no CAPS.backlogItems, no positional echo), the REAL CLI against a pre-2.369.150 server's backlog-only answer (exact-text match, never position; r.item-only control); `--priority` that older server ignores is SAID, never claimed (add + edit, no-check control)
  { name: 'test-backlog-priority', tier: 'fast' }, // BACKLOG PRIORITY + OWNERSHIP-AWARE SELECTION (owner 2026-09-22: no cap — priority + ownership pick what every push shows): PURE sortBacklog/selectReminders + oldest-first negative control, store normalize + repo-file round-trip, the REAL route (400 outside high|normal|low, sorted numbering), _backlogNoteLines (5 owned by priority+recency + the unclaimed-HIGH line), the REAL CLI over loopback, wiring pins, the Backlog tab (sort + chip + Priority menu/editor write, pins with cut-copy controls)
  { name: 'test-backlog-nudge', tier: 'fast' }, // THE BACKLOG CLEANUP NUDGE (2026-09-22): a session holding ≥ tasks.backlogNudgeAt (default 20, 0 = off) open items it claimed or parked is asked in ONE ≤500 B paragraph to finish / drop / merge — PURE ownedOpen/backlogNudge/nudgeText, the REAL route (add/edit/claim nudge, done/drop/unclaim/show never, the threshold through serverSetting), _backlogNoteLines, EVERY TURN through the REAL task-context + prompt-context (r2), ONE paragraph for N groups + 2/3 groups × 60 CJK items ≤ 9600 B untrimmed + task-context capped inline (r2), the REAL CLI's `note:` line, the setting row + zh/ja, each leg with a patched-copy control
  { name: 'test-fork-groups', tier: 'fast', why: 'pure + source-driven: a fork lands in its source\'s Task Groups (owner 2026-09-25) — the plan, the fork-source-id wait, the real _doForkSession / pending-bind queue driven, the one-fork-create census; the terminal-mode fork end to end (real lock capture over scratch lock files → real TaskGroupManager in a scratch data dir), the parent/fork capture race (locks in both orders), the PID WITNESS (two sessions created together, stray/dead locks, a lock after the old 17 s window, real process trees over /proc), the restored fork flag; round 3: the writer witness over a real wrapper→claude→sleep tree, the no-sidecar rule on ONE lock, a pending chat fork captured, the boot dedup through the real dedupWebuiSockets, the real chat consumer (glued dtach preamble, a torn record reported), the real boot-restore R6 re-open (arm spied), code-only wiring pins; sixteen mutant-copy controls; re-homes its own process; ~4 s, no browser, no server' },
  { name: 'test-outside-press', tier: 'fast' }, // THE ONE OUTSIDE-PRESS CLOSER (lane M, inc-muhms5kt-0ejl: no floating menu closed on a press into an app's picture — the pane cancels pointerdown, so no mousedown): the PURE verdicts (inside / anchor / the picture / nested popover / ignore / root gone; mouse at down, touch+pen only as a TAP) + the REAL utils.js onOutsidePress under a fake document and a browser dispatch model (capture passive arming, the xpra-like pane and the noVNC-like canvas close, the press never cancelled or stopped, persistent / signal / root-gone / attachPopoverClose) + CONTROLS: the pre-lane closer verbatim stays open over the pane, two mutant copies (the helper on mousedown; in the bubble phase behind a stopping pane) stay open. ~0.2 s
  { name: 'test-user-todos-layout', tier: 'fast' }, // the For-you popup keeps rows in their slots while open (inc-mtw02kbq-kj96: a ✓ slid the next row under the pointer); PURE layout + pre-fix control + wiring pin; ⑪ B-328d: THE CENSUS — every two-argument .add( on any receiver declares its producer `origin` (grep-derived, fails an unwired site; r2: aliased/?. evasions as controls) + the store's fail-closed throw + the HELD notice filter
  { name: 'test-inbox-reply', tier: 'fast' }, // design-user-inbox-reply D1 (chunk 1): the reply quote block (compose/parse round trip, the 1500 cut, hostile strings verbatim), replyVerdict's five projections, the store's options + resolveByReply + options-first order, the route over the REAL sender + claude adapter (one frame = composeReply, every refusal by name with nothing written, agent tokens 403), the turn fact, wiring pins + a patched-copy control
  { name: 'test-user-todos-expiry', tier: 'fast' }, // SPEND NOTICES LIVED FOREVER AS ACTIONS (2.369.152): add() takes a validated expiresAt, a merge keeps the LATER end, expireDue resolves only due OPEN items (one broadcast, a count), the store sweeps at load + on an unref'd 5-min timer, spend-guard stamps hour +60 min / day +24 h / refusal +6 h — every leg beside a patched-copy control (the migration leg lives in test-migrations)
  // CHANNELS v2 / the communication panel (docs/design-communication-panel.zh.md).
  // All PURE/SHARED logic — no server, no chrome, no vendor call anywhere: the
  // fake adapter talks to nothing.
  { name: 'test-channel-record', tier: 'fast' }, // the ONE normalized record: the dedup key, `@_user_N` ordinals, and an external body carrying our own frame markers coming out INERT
  { name: 'test-channel-caps', tier: 'fast' }, // laneState (DEMOTED > LIVE > CLAIM) + scanState (freshness > platform > client > grant > 'ui') + the convCaps TTL + offers/identityWarning/freshnessClaim, each with its own control
  { name: 'test-channel-store', tier: 'fast' }, // §5.1's leg: TWO CONCURRENT PASSES each advancing their own cursor, with the read-modify-write shape as the negative control
  { name: 'test-channels-engine', tier: 'fast' }, // the ingest engine over the REAL store: a transient append failure costs a RE-READ never a skip, a failing adapter's health survives a healthy neighbour's pass, markRead never broadcasts a no-op, and a route may not mint an index row — each with a patched-copy PRE-FIX control; P1a ⑤ the BURST DAY: newest-first paging to the anchor over the real loop, 340+320 records whole with zero duplicates, the anchor advances only after a complete walk and never on a budget-cut one
  { name: 'test-channel-adapter-contract', tier: 'fast' }, // every registered adapter through all three receive modes + both scan sources, plus the grep census that no call site outside src/channels/ branches on `kind`
  { name: 'test-secret-box', tier: 'fast' }, // src/secret-box.js: byte parity with mounts' former _enc/_dec (both directions), key minted on ENOENT ONLY (every other errno TYPED), 0600, never overwrites — with the bare-catch copy as the standing negative control
  { name: 'test-integration-registry', tier: 'fast' }, // design §14: the PURE table + the store (publicView never leaks plaintext, last-4 at the 12 boundary, omit-vs-'' , user > cluster > none, inject-then-remove ⇒ none WITH a reason, the delegating row's prefer/multi) + the env-NAME census over `git ls-files` and the no-timer-calls-test( census, each with a synthetic offender
  { name: 'test-oauth-field-parity', tier: 'fast' }, // design-integrations-per-account §4/§8.1 #12 (D1–D8): the storage + channel account dialogs are ONE component (src/lib/mounts-dialog.js) — its exports, no second renderer on either side, every SHARED spelling asserted on BOTH sides, every re-authorize = reauthDialog, switching the client = re-authorize on both sides (D2), each side's Edit button order (the channel's = the r4 mockup's), Remove… in Edit, D8's sentence, the design's §4 i18n key list parsed from the design doc (drawn as built + zh + ja), each rule with a patched in-memory control (0.1s)
  { name: 'test-channels-lark-shape', tier: 'fast' }, // design §6.3/§12.1/§13 (P1): the Lark READ adapter over RECORDED fixtures — auth.state's four-valued ladder (the resolver's answer is an INPUT), the FIXED-mode consent flow on a FREE port, PAGING TO THE ANCHOR across pages (both continuation spellings), every msg_type to plain text, `@_user_N` ordinals, typed failures, the refresh + invalid_grant, the credential-exchange Test runner; P4 ⑧ (84): send = ONE documented request with `uuid` = the idempotency key (hashed past 50), a reply hits the reply endpoint, convCaps NARROWS to [] with `send-scope-not-granted` until BOTH dotted send scopes are held, a transport failure after the request left is `detail.lost` while a 403 is a plain refusal, reconcile = found-in-chat / the SAME uuid re-issued inside the hour / landed:false only on a COMPLETE scan past it / unknown otherwise; zero vendor calls
  { name: 'test-channels-gmail-shape', tier: 'fast' }, // design §6.3/§12.2/§14.2 (P1): the Gmail READ adapter over RECORDED fixtures — the DELEGATING row resolved through the REAL integration store on a TWO-PRESET env (org1 + channels, no 'default') and connected END TO END through the REAL engine on the EPHEMERAL loopback, threads as conversations under the include query, history.list incremental (nothing changed = one request; 404 = reseed; a dead thread = skip), the MIME tree to plain text, the shape-only Test; P4 ⑧ (90): the TWO-PHASE send (one anchor read → drafts.create → `onHandle` BETWEEN the phases → drafts.send; the MIME chains In-Reply-To/References on the anchor's Message-ID), a phase-2 transport failure is LOST with the handle while a phase-1 one is a refusal, reconcile = draft still exists ⇒ never sent + discarded / draft gone + our SENT message in the thread ⇒ landed / no evidence ⇒ unknown, the handle-less drafts.list fallback; zero vendor calls
  { name: 'test-channels-push', tier: 'fast' }, // design §6.4 / fence 11 / decisions 18+20 (P1b): the REAL engine + REAL store + a REAL lane over a fake push SERVER (ws on a free port) — the ack after durability (+ a replayed event id, + a crash injected between persist and index), heartbeat silence ⇒ push-dead ⇒ fast cadence, stop() terminal for an arm in flight, THE EXIT: a declared-but-not-exclusive lane demotes itself with its numbers, the demotion changes what it carries (kick, poll, no sample, never self-heals), a re-declaration zeroes and retries once; shared/unknown never carry; the route; the Lark lane over a stub SDK; the Gmail pull lane over a fake fetch. Zero vendor calls
  { name: 'test-channel-filter', tier: 'fast' }, // design §7.1-§7.5 (P2): every rule kind's truth table, any/every with `why` as a CONTRACT, the estimator's honesty (a match-all rule ⇒ totalPerDay === matchedPerDay; a corpus shorter than the window ⇒ truncated; the reader's cap ⇒ sampled), the assignment's two authority caps + the read-time clamp, the round-robin, the pacing verdict, and the §7.5 block (≤6 records, "(N older elided)", byte budget, a vendor body carrying our frame markers or heading coming out INERT)
  { name: 'test-channels-lane-parity', tier: 'fast' }, // design §6.1 / fence 12 (P2): ONE day of traffic through push (content) / poll / scan against the REAL engine + REAL store + REAL spend guard ⇒ the same record set, the same wake count, the same charge; the push lane with `channels.pushCoalesceSeconds` = 0 wakes MORE (the window is what buys the batch back); a record pushed once and polled once is one record and no second wake
  { name: 'test-channel-outbox', tier: 'fast' }, // design §9.1/§9.4 (P3): the PURE state machine (every allowed + every forbidden transition, with its actor), guards that only TIGHTEN (a direct policy + a link ⇒ review), fail-closed on an unknown policy / an unparseable guard, off-hours OFF without a zone, the TTL; then the REAL engine + fake adapter: propose → pointer filed → approve (edited) → sent → pointer retracted → receipt via noWake, reject, expiry, `unknown` never auto-retried, the audit attempt/outcome pair; P4 §9.4 (107): THE IDEMPOTENCY MATRIX (the key IS the proposal id on the send and on every reconcile, the wire text + attempt instant stamped BEFORE the request, a two-phase handle persisted the moment it exists) + THE RECONCILE MATRIX (lost ⇒ unknown never failed; landed ⇒ sent + receipt + the item retracted; not-landed ⇒ failed; no evidence ⇒ still unknown with the asks counted and nothing re-sent; a typed refusal ⇒ failed; `idempotency:'none'` cannot be asked; the boot sweep turns a `sending` corpse into unknown by actor `boot`)
  { name: 'test-channel-acl', tier: 'fast' }, // design §8 (P3): hidden by default, MAX over grants, widen-only (a group grant is never narrowed by a member row), request → exactly one grant + the group default byte-identical, the uniform not-found, origin on every grant; THE NEGATIVE CONTROL: a user grant beside an assignment grant survives un-assign byte-for-byte (through the real engine)
  { name: 'test-channel-groups', tier: 'fast' }, // AGENT GROUPS (design §22, owner D1/D2 + §22.5): the PURE model (shape, pairKey symmetry, every membership transition incl. archive-on-pair-drop, the notify enum, THE wakeVerdict table mode × @mention × invite × --quiet × mute, reportFor since-join + context first + byte budget + the read --before pointer), groups.json through channel-store's ONE door (the read-modify-write negative control), the engine over the REAL store + REAL ladder with a recording authorizer (reach refused by name, an invite wakes N, next-turn wakes nobody and reports ONCE, mention wakes only the named, always's refusal journaled + still logged + reported, send <agent> = ONE symmetric pair), the turn gate through the REAL prompt-context route (a machine turn gets no report), the one-writer census with a planted writer
  { name: 'test-channels-groups-ui', tier: 'fast' }, // THE IM-FIRST PANEL, fast half (design §22, chunk g3): the PURE list/composer/autocomplete/picker/fold arithmetic (src/lib/channel-groups-view.js) + THE WAKE PREVIEW's parity with the engine's wakeVerdict over notify³ × five texts (a mute-blind preview as the control); the owner's own external send DIRECT (no policy, no guard; an agent's `direct` ignored; no send-as-user ⇒ refused by name; audit propose→attempt→outcome), the digest's lastText, the groups engine's owner read mark (derived unread, a no-op mark broadcasts nothing) + live roster over the REAL stores; the XSS census over the five client files with a planted `innerHTML` of a group name as its control, the composer split decided only by composerMode, no adapter-id branch, the fold PATCHed to user state, the i18n census's new data paths; wiring pins
  { name: 'test-msg-cli-groups', tier: 'fast' }, // AGENT GROUPS CLI (design §22.5, chunk g2): data/bin/vibespace-msg against a STUB server — every verb's request (group create/invite/leave/kick/rename/archive/notify/list, read --before/--limit, send --wake), THE WAKE ECHO ("woke N agents = N billed turns", said at 0 too), typed refusals with code + candidates + remedy (exit 1; 2 outside a session; 3 server gone), the JOB fence refused locally with no request (control: a session token reaches the stub); then the ROUTES over the REAL engine + store + ladder: an ambiguous member / group name refused WITH the candidates and nothing written (control: a unique name creates + wakes via peer-message), a jbt_ token lists/reads/posts but never creates (control: the owner's own token makes the pair); the manual's Groups section, the docs index line, and the ONE ≤ 300 B groups pointer in the Reporting-back teaching with a patched-copy negative control
  { name: 'test-channels-agent-cli', tier: 'fast' }, // design §11 (P3): data/bin/vibespace-channels driven against a STUB server — list/read/reply/status/request; `reply` only proposes; a hidden conversation and a nonexistent one print the SAME uniform error; `send-not-available` says so and creates nothing
  { name: 'test-channels-identity', tier: 'fast' }, // design §9.5 (P3): the sent body carries NO honesty line and none of draftedBy/approvedBy (they stay in this instance's audit log); `identityMarking` drives the card's warning structure + the receipt's three fields (`unknown` as loud as `marked`); `reply` on a sendAs:[] conversation returns send-not-available and creates NO proposal; r4: an approval after convCaps expired re-resolves and refuses with the adapter's reason instead of sending; P4 ⑤ (48): REAL `sentAs` receipts — the receipt carries the identity the VENDOR answered with, the audit outcome line follows it, the adapter row records the observed sender_type (§21 item 3); ⑥ the sender honesty switch OFF by default (the body byte for byte), ON appends exactly one line naming the drafting agent said before and after, a USER draft never gets one, the per-adapter override beats the instance setting
  { name: 'test-channels-egress', tier: 'fast' }, // design §3.1 fence 1 (P1a): the EGRESS CENSUS — every host literal in a server-side file that constructs a request is a claim: a channel adapter's must be in its own EGRESS (both directions), any other (file, host) must be allowlisted WITH a reason (seeded at birth with gmail-sync + mounts), dead entries fail; the source list is ls-files through the sanitized env, SKIP with the tool's own words when the tree has no source list
  { name: 'test-channels-accounts', tier: 'fast' }, // the ACCOUNT MODEL (2026-09-22, owner's mounts analogy): N adapter records per kind, each stamped at connect with the credential it was minted under (`cluster:<presetKey>` / `own`) — two Gmail accounts under two presets refresh with THEIR OWN client ids, flipping the integration's default leaves the first on its client (a patched engine copy that hands the adapter no key reproduces the silent swap), a withdrawn preset answers preset-gone BY NAME and never another client, an unknown key mints nothing, `own` is offered only when the values are complete, a further account's disconnect removes only its own record + index rows, the routes (`{credentialKey, newAccount}` / per-account reauthorize / the P1a per-kind path), the Lark keyed rung read LIVE off the record; zero vendor calls
  { name: 'test-oauth-loopback', tier: 'fast' }, // design §12.4: the DUAL-MODE consent flow — ephemeral (Gmail) and fixed (Lark) binds, the two gmail-sync `state` checks verbatim on the handler AND on paste-back, a PRE-BOUND fixed port ⇒ a NAMED port-busy refusal + paste-back (never an opaque EADDRINUSE), the port released on completion/cancel/timeout; every port under test is a FREE one
  { name: 'test-pricing-tiers', tier: 'fast' }, // reference prices per MODEL VERSION (Fable 5.1 cache hits $0.25 vs Fable 5 $1; Sonnet 5 $2/$10; Opus 5.5 $4/$20 hit $0.20 vs a measured result's own list cost; Mythos 5 / 5.1 on Fable's two tiers, never `_default`), longest-key match, old pricing.json gains keys without clobbering edits, the installed binary's catalog tiers as an oracle
  { name: 'test-attach-rebuild', tier: 'fast' }, // first-attach history rebuild is time-sliced + gated (live records replay in order), heartbeat is stall-aware, kills are acknowledged + re-sent until acked
  { name: 'test-path-mounts', tier: 'fast' }, // /svc/<name>/ reverse proxy: real http+ws round trips + store rules
  { name: 'test-contributions', tier: 'fast' }, // commands + menus (when/group/order) + keybindings registry (Plugin Ph1): node-functional dispatch/ordering/filtering/dispatcher, the three migrated core menus ≡ verbatim legacy builders over a state matrix, ws-handler `default:` on the REAL handler (no sessionId in the reply), plugin-scoped removal, wiring pins
  { name: 'test-published-pages', tier: 'fast' }, // instance-hosted shareable HTML: publish/serve/auth-gate/CSP-sandbox/upsert + wiring pins
  { name: 'test-usage-walk-parity', tier: 'fast' },
  { name: 'test-usage-origin', tier: 'fast' }, // who spent this: the ledger's origin dimension ('main' | 'subagent' | 'workflow'), the session×origin pivot behind the Usage window's session table, "By project" attributed to the PARENT repo instead of an agent's throwaway worktree, and the source census that the three columns / the By-origin group / the project tooltip are actually wired
  { name: 'test-proxy-post', tier: 'fast' }, // proxied POST body reaches the target (real unblocker; the json-parser-skips-/proxy/ pin)
  { name: 'test-auto-resume', tier: 'fast' }, // continue-after-limit-reset (tri-state gate, never-early/twice, restart-survival) + CLI output style at spawn
  { name: 'test-new-member-wake', tier: 'fast' }, // a member that BECOMES usable (login success / human ⟳) re-drives the pool and releases the conversations armed on exhaustion: the 2026-09-08 incident replayed on the real engine + real pool + real symlinks + real auto-resume, each half of the wake proven load-bearing on its own, the polled routes' fingerprint gate measured with the engine floor wound back, and the breaker/cap/quarantine proven still in force
  { name: 'test-codex-sandbox-net', tier: 'fast' }, // codex sandbox keeps loopback open for the vibespace-* tools: real `codex sandbox` A/B (evidence-SKIP without the binary) + wrapper/adapter/probe pins
  { name: 'test-codex-subagents', tier: 'fast' }, // B-7473 sub-agent visibility: the PURE row builder (labels/coalescing/XSS marker proof), the renderer + chat-view click-through/fold wiring, and GET /api/subagents over a temp CODEX_HOME with real parent+child rollout heads; ④ (2026-09-24) the v2 sub-agent classification on every rung — local listing, daemon snapshot child, the REAL ssh script under sh — against scripts/fixtures/codex-subagent-v2 + a generated 45-rollout store (every listed rollout classified past the 30 head-fact slots) + the sidebar's per-page kind filter and its remote-spanning tab census, with mutant-copy controls
  { name: 'test-window-anchor-heal', tier: 'fast' }, // inc-mu6djxxt-8166: a legacy pre-isolation anchor heals from the isolated panel, the ⟳ route falls to the panel when the guard archived the live reading, a hot-switched session's OTel never vetoes the witness ring
  { name: 'test-usage-probe-log', tier: 'fast' }, // the raw /usage probe ring (2.369.109): PURE clip/rotate/read + the panel rung through the REAL setupUsage with a fake claude (written / spawn-failed / no-buckets) + the control rung through the REAL engine (written / timeout / unparsed) + wiring pins
  { name: 'test-quota-source', tier: 'fast' }, // harness S4: per-harness QuotaSignalSource (normalize/signalFromStream/probe/classifyAuthFailure on real shapes) + the caps-routed probe dispatcher (no claude spawn for codex identities) + wiring pins
  { name: 'test-server-globals', tier: 'fast' },
  { name: 'test-peer-messaging', tier: 'fast' },
  { name: 'test-plugin-loader', tier: 'fast' }, // Plugin Ph2: manifest validator matrix + a real fixture plugin (iframe assets w/ sandbox CSP, forked server process, proxied routes, agent-tool shim, enable/disable lifecycle) + client wiring pins
  { name: 'test-codex-p2-client', tier: 'fast' }, // codex P2 client rows: fork via thread/fork (real wrapper vs stub), onboarding per-backend readiness, switcher codex quota, permission-mode seeds
  { name: 'test-wrapper-files', tier: 'fast' },
  { name: 'test-ci-gate', tier: 'fast' },
  { name: 'test-design-kit', tier: 'fast' }, // /design kit from the installed CLI: extraction (cli-dir + binary parity), adaptation all-or-nothing, helper --check, wiring
  { name: 'test-usage-ledger-perf', tier: 'fast' }, // inc-mtox23xw: the estimator's per-pair ledger walk is O(log n + k) + interval-memoized (it blocked the loop 10-59s); parity vs brute force + timing pins
  { name: 'test-codex-effort-meta', tier: 'fast' }, // the effort a TURN ran at (owner: "调成了 ultra 但 metadata 显示 xhigh"): the resume race reproduced against a stub app-server with the REAL wrapper (+ a negative control in master's record shapes), set-effort reaching the app-server AND the live status, per-message meta following its own turn, the wrapper_meta fallback, the merge fold vs codex's own copy, the session-meta writer, and the "ultra (multi-agent · reasoning …)" label read from the model catalog
  { name: 'test-plugin-security', tier: 'fast' }, // plugin-system security regressions (2.369.43): shim code-injection via manifest free text, capability-path collapsing, agent-tools consent gate, reinstall-under-a-trusted-id, proxied-reply headers, per-child stop mark, upload cleanup
  { name: 'test-local-device', tier: 'fast' },
  { name: 'test-exit-forensics', tier: 'fast', why: 'B-3052: the REAL chat/pty/codex wrappers against a fake CLI (~50 s) — a child killed by a signal is named in the meta + log, a signalled wrapper records itself, still dies 128+signo and hands its child only what the default action did, the record never re-creates files the kill path unlinked (also under real dtach), the reconnect-window record, the _remote_exit sentinel signal through the REAL keeper, the real setupSessionPty teardown line/event/tomb pair + 7-day sweep (with and without a .buf), r4: the teardown fed AT the socket EOF in the incident order (master dies first) waits for the wrapper, the record is first and never torn, one patched-copy control per change' },
  { name: 'test-pty-duck', tier: 'fast' }, // B-ae4b: every node-pty duck holds a listener SET (daemon / R6 pipe / OpenCode serve terminal) — the liveness stamp AND the consumer through the real setupSessionPty, the one-slot census, the pre-fix control
  { name: 'test-agent-msg', tier: 'fast' }, // Channels v1: ACL matrix + delivery ladder + wiring pins
  { name: 'test-plugin-trust', tier: 'fast' }, // Plugin Ph4: validator (settings/themes/capabilities/module tier), consent 409 + trusted enable + drift re-prompt, module 403/200 + theme serving, node --permission denial vs granted path, install path/zip/Zip-Slip/update/uninstall-to-trash, shim shipping, client pins
  { name: 'test-codex-history', tier: 'fast' }, // codex rollout coverage: custom_tool_call_output routing, sub-agent visibility, live contextWindow, encrypted reasoning, web_search_end cards (rollout-only searches, live twin dedup, 0.14x call pairing)
  { name: 'test-transcript-parity', tier: 'fast' },
  { name: 'test-text-window', tier: 'fast' }, // perf lane A: the attach slab is a TEXT window (src/text-window.js) — the pure table (floor / maxRecords / maxBytes / determinism / isTextCard), the three normalizers' tailWindow twin parity, a real conversion's same-slab ids, and the wiring pins at every attach path
  { name: 'test-jsonl-incremental', tier: 'fast' }, // perf lane C: the incremental JSONL tail cache (src/adapters/codex.js readJsonlTail + session-store's span entry) against a VERBATIM copy of the 2.369.160 reader — append reads only the appended bytes, the 34 MiB threshold slide, shrink/replace/rewrite ⇒ full, the unterminated line once, no read on an unchanged file, the async warm, SessionMessages cold = warm (+ the merge memo)
  { name: 'test-op-seq', tier: 'fast' }, // perf lane D: the per-session op ring (src/op-seq.js) — monotonic seq, cap + byte eviction, since inside ⇒ the exact frames / older ⇒ lagged with the oldest, reset on a new epoch, the laggedVerdict table, the resume rung, the verbatim replay splice
  { name: 'test-codex-0153', tier: 'fast' }, // codex 0.153.4 remainder (B-21e4): fork ordinal (Referenced-fork prefix cut, sub-agent start ordinal, wrapper forked_from echo) + the rows added below it
  { name: 'test-sysinfo-op', tier: 'fast' },
  { name: 'test-opencode-serve', tier: 'fast' }, // S9 OpenCode serve-mode store: mock serve (client, session→acp-events synthesis, discover cache/negative-cache/hang budget ≤2s, keeper reuse/spawn/crash-park/stop, serve-backed reader, caps verdict) + wiring pins
  { name: 'test-ci-heavy-launch', tier: 'fast' },
  { name: 'test-codex-zst', tier: 'fast' }, // harness S3: descriptor store (discover/locate/forkChain/writerSweep/remoteFind) + codex facts off the hot path (worker walk, dir-mtime cache, /proc liveness) + zstd rollouts (readers, walker+scanner lockstep, NC/CO discovery lines)
  { name: 'test-agentd-session', tier: 'fast' },
  { name: 'test-instance-url', tier: 'fast' }, // this instance's own public address: frp mapping layered over agentd.publicUrl (never written), one publisher of the relay proxy
  { name: 'test-chat-frame-guard', tier: 'fast' }, // 38MB-poisoning trio: poison guard + frame-file bypass (real claude AND codex wrappers, loud rejections) + rescue + capability-only gate pins
  { name: 'test-discovery-interpret', tier: 'fast' },
  { name: 'test-discovery-spawn', tier: 'fast' }, // ZERO spawns per session in the local sweep (userW's 11-17s loop block after every create/kill): the /proc process-tree reads + their no-/proc rungs, the census over 50 locks + 50 live sessions, and master's own session-store as the negative control (101 spawns)
  { name: 'test-restore-smoke', tier: 'fast' }, // the end-to-end boot + session-lifecycle + 29-route GET battery (the lost-export class only shows at boot or route-run time). 8.9s measured: the most expensive thing the fast tier is willing to pay for
  { name: 'test-roster-live-usage', tier: 'fast' }, // 2026-09-18 owner: the Agents roster repaints its usage cells from the 8 s poll (stamped cells + rosterUsageSnapshot + _repaintRosterUsage); the chrome proof is test-roster-reset-eta §1d
  { name: 'test-roster-soon-rows', tier: 'fast' }, // 2026-09-18 owner: the two-soonest highlight never lands on the POOL row (it mirrors a member's countdown) — real markSoonRows over a fake list + the row-template pins
  { name: 'test-hidden-view-suspend', tier: 'fast' }, // inc-mu6bfv1t-4drq: mobile / tab / minimized hiders suspend the ChatView like the desktop one (reason set + WindowManager.syncHiddenViews + wiring pins); perf ⑤b: the reconnectSlot table + the reconnect queue (displayed now, suspended by slot, un-hide = now, dispose/drop dequeue)
  { name: 'test-chat-trim-guard', tier: 'fast' }, // fold-dominated window trim guard (inc-mtajy6wr white-screen) pins
  { name: 'test-chat-e2e', tier: 'fast' }, // ONE real haiku turn through the full chat pipeline (oat token slot; SKIPs without ~/.config/vibespace/ci-oat)
  // LAST ON PURPOSE (2026-09-09): the standing sweep for test-fixture litter in
  // the developer's REAL ~/.claude/projects. Within the fast tier this really
  // does run after every suite that could write one — the heavy tier is
  // detached, so a heavy-tier leak is caught by the NEXT push's fast tier. It
  // claims no port and creates no fixed /tmp path (scratch()), reads the real
  // home only, and prints the rule it applied.
  { name: 'test-fixture-isolation', tier: 'fast' },

  // ── HEAVY TIER — MEASURED cheap→expensive. Two origins, both stated per
  // row: the suites that already paid for the 11.5-minute battery (chrome,
  // real worktree servers, real agent CLIs, the real opencode binary), and
  // the 83 ADOPTED on 2026-09-07 — suites that were in NO runner at all,
  // which is what the census (B-4c5a) was filed for. Adopted suites land
  // here rather than in fast even when they are cheap: the fast tier is the
  // CURATED pre-push battery, and an unaudited suite earns a place in it
  // deliberately, with a measurement — never by default.
  { name: 'test-paging-collapse-guard', tier: 'heavy', reads: ['src/lib/chat-view.js'], why: 'adopted 2026-09-07, was in NO runner (14ms)' }, // COLLAPSED-GEOMETRY guard, pinned against the REAL incident numbers (inc-mso818ry). The scroll tracer recorded 14 extendTop landings in the affected window: 11…
  { name: 'test-browser-resources', tier: 'heavy', why: 'launches up to 12 real Chromium instances (~90s, ~20 GB RSS at peak) — what only the binary can answer: that two sessions really stop seeing each other (with a pre-fix control), the k=1/4/12 envelope §12.10 makes a P0 deliverable, (r3) that a project-level fence survives the generated config and that two remote-shaped sessions both launch on a profile-naming host (round 2\'s line reproduces the SingletonLock collision), and (r4) that a fenced session on rung N browses where round 3\'s rung C is refused by the CLI, that a pin RELAUNCHES the running browser on the next command (page lost, new pid on the pinned dir), and the HOME 38/39 pair: round 3 refused at 39 where the bare CLI works, r4\'s AGENT_BROWSER_SOCKET_DIR launches' },
  { name: 'test-browser-live-ui', tier: 'heavy', why: 'headless chrome (a 3200×1100 page) on a worktree server with a fake claude + a fake agent-browser over fake stream upstreams, a real `vibespace-browser open`, and (when the box has a display rung) a real xterm desktop app under an agent lease — ~170 measured + shot states incl. ⑥ the split floor (real divider drags; ~3 min; SKIPs without chrome / dtach, the strip legs without a display rung)' }, // LANE I (2026-09-25, the owner: "你这些UI都检查过吗？"): THE LIVE-VIEW BAR, SEEN — a screenshot + rect census of the agent browser's live view (the owner's ephemeral path) at zh/ja/en × 600/900/1400 × dark/light × free/bound × Watch/Take over, two profiles (strip + backend chip), and the desktop-app strip (no lease / agent lease / your takeover): no overlapping paint rects, no wrapped label (> 1.7 × its font or > 1 line), every button's words fit, nothing outside the bar, no undefined/null/NaN/[object; THE FOLD re-derived by barLayout from the page's own inputs, the ⋯ exactly when folded (never gratuitous — an independent max-content measurement), its menu = the folded items with live counts; the chat WINDOW menu's "Agent browser — live view" (present with a browser, absent without; opens BOUND beside; open-or-focus; one Unsplit on a bound pane); controls = a neutral stylesheet swap stays green, patched copies of public/style.css without the bar rules (live bar + strip) or without nowrap alone (unfolded) go RED. PNG + JSON per state under /tmp/vibespace-live-ui-shots/run-<pid>-<time>/ (newest three kept)
  { name: 'test-browser-live', tier: 'heavy', why: 'headless chrome + a worktree server + one REAL chromium (~60-90 s)' }, // AGENT BROWSER P2 (design-agent-browser-v2 §4.2/§4.4/§3.7): the PURE stream rules over the REAL captured 0.32.0 shapes (scripts/fixtures/browser-stream/session-0.32.0.json), the real bridge on a real http server over a fake upstream (cookie auth before the upgrade, fan-out on ONE upstream connection with replay, maxFps = the max across viewers, typed watch-mode refusals, per-viewer frame drop + upstream pause/resume at the VNC numbers, typed teardown), the browser-live window in headless chrome on a worktree server (frames drawn, URL/tabs panes, the switcher strip for two attachments, viewer count, the DPI pointer helper at ui-scale 1/0.8 and 375×667), and one real headless chromium through the real stream server + real bridge (SKIPs with evidence); lane H ③b: the shipped CLI's first `open` in a chat session with no attachment ⇒ within 5 s a split live view born beside the chat (silent), the navigation in data/browser-trace/ephemeral, the tool card's thumbnail, both chips, grey on stop / reconnect on the next verb, CONTROL a worktree keeper copy dropping the ephemeral holder row ⇒ none of it; ④ launches with its streamed config (the week-long exit-21 skip was the suite) and records a real `open`; naive study 2: ① one live view per session (liveViewPlan) + a stopped view's resume rule + the `~child:` target (patched-copy controls), ③b "Open live view" twice ⇒ ONE window and the focus in its chain, a stopped browser's view keeps its last frame with "Browser stopped" — CONTROL the pre-fix client rebuilt in the leg's own worktree ⇒ 3 windows and "Agent is driving"; lane J ⑤ (inc-muhgv0fb-9i4u): the REAL rung end to end — a session's own ephemeral browser (headless, and headed on its own 2560×1440 Xvfb) opened by the real vibespace-browser, the live view in chrome as the owner's client (DPR 2/1 × UI scale 100/125 % × a 1400×800 and a 700×900 window), Take over, a real click on grid cell (10,5) lands within 2 px; CONTROL = the pre-fix belief (the metadata IS the frame) in a patched copy through the same socket (71 px / 132 px or dropped); a new tab + set viewport re-read; the leg reaps its daemons
  { name: 'test-browser-mediation-chrome', tier: 'heavy', why: 'one REAL headless chrome behind the mediating proxy + the real agent-browser as two sessions (~20-40 s; SKIPs with evidence without a chrome / the binary)' }, // AGENT BROWSER P6 (design-agent-browser-v2 §6.2 / §6.5 / D6 — the §10 P6 row's EXIT): through a second lease's mediated url a real Chrome shows only that lease's tab, attach/close/activate of the other's tab are target_out_of_scope, a takeover makes navigate/Input.* browser_paused while reads answer, Browser.close is method_refused, revoke closes the lease's own tabs and leaves the other's; then the real agent-browser 0.32 as two sessions — each `tab list` is its own, the typed browser_paused lands inside the CLI's own JSON, `close --all` never reaches Browser.close; r1 ③: the real binary answers `get --json cdp-url` and honours the AGENT_BROWSER_CDP twin when run directly (the controls for test-browser-verbs' router and env legs), and through vibespace-browser the same shell lands on the lease's browser with the twins dropped. r2 ③: the real binary is the ORACLE — every `get … cdp-url` spelling run for real with the router held to it (`get attr #e cdp-url` a read), another SOCKET_DIR is another daemon, through vibespace-browser the answer's root wins and the decoy dirs stay empty; the suite reaps its own daemon namespace dirs. r3: the installed binary's global flags re-measured against the router's tables; every measured flag fuzzed between `get` and `cdp-url` on a live daemon; the config-file twin (a bare command from a hostile directory runs its executable with its raw port, through vibespace-browser nothing of it lands); the suite's runs inherit no AGENT_BROWSER_* of the shell starting them. r4: a real chrome launched by the binary — bare, `open chrome://version` + `open file://…/DevToolsActivePort` and a crafted `state load` print/land on the endpoint (the controls); through vibespace-browser every spelling is refused with no /resolve; the stdin batch (bare plain lines are Invalid JSON, both forms run through the CLI). naive study 2 ④: the REAL keeper + the real 0.38.1 + a real Chrome — two sessions on ONE named profile both run on their own tabs with exactly one Chrome on its directory, the keeper's recorded pid alive after its own `get cdp-url` (the launch view), the stream port answered; CONTROL the pre-fix env (the directory) dies on SingletonLock on the real binary.
  { name: 'test-browser-tier3-chrome', tier: 'heavy', why: 'launches a REAL Google Chrome / Chromium window on its own Xvfb with NO CDP and drives it through AT-SPI (~20-40 s; SKIPs with evidence without a chrome / Xvfb / python3-gi / a session bus)' }, // AGENT BROWSER P10 — the §9 test-browser-tier3 row's heavy half: the browser is listed as a desktop-class row, snapshot comes from the real AT-SPI tree, one click @ref lands on a node that self-reports an action, a chord and a point click refuse by name although xdotool is on PATH, screenshot is x11grab of the window's own pixmap (§4.9 column 1), and the browser's argv carries NO automation flag before and after — the definition of tier 3 as an assertion
  { name: 'test-window-target', tier: 'heavy', why: 'server: boots the desktop-app keeper\'s REAL Xvfb + x11vnc + a GTK app and drives vibespace-window as a child process (~20-40 s; SKIPs with evidence without python3-gi / Xvfb / x11vnc / a session bus)' }, // AGENT BROWSER P9 second half (design-agent-browser-v2 §4.3 / §4.9 / §6.6, the §9 row): the sieve\'s strip (a refused KeyEvent cut out, the update request beside it relayed), the window noun in the shared takeover model, the PURE window-live mode arithmetic, the engine over a fake keeper (the lease PERSISTS across a rebuild, orphans, reconcile grace, takeover/handback/idle/viewer-left, the audit with origin), the ONE announcer taking a window handback, the bridge policy over a fake RFB server, then the REAL leg: an agent CLI drives the fixture through the API, a second session is refused by the lease, a viewer in Watch cannot type into it, the user\'s takeover pauses the agent and lets the same key land, the handback is announced, a restart keeps the lease
  { name: 'test-window-binding', tier: 'heavy', why: 'headless chrome (a desktop page + a 390×844 phone page) on a worktree server with a fake claude + a fake agent-browser over a fake stream upstream (~2-3 min; SKIPs without chrome / dtach)' }, // AGENT BROWSER P7 (design-agent-browser-v2 §4.6 / §3.7, D19 / D24 — the §10 P7 row's EXIT): auto-bind births the live view inside the chat's chain as a split (one visible window, two measured panes, the deterministic syncId, frames drawn, the ownership badge in the session's own colour), the bar's Unbind / Snap beside round trip, the divider under body zoom 1.25 landing within 4 px of the pointer + double-click, a real title-bar drag / minimise / restore / a desktop switch keeping the panes together, closing the browser pane collapsing to tabs WITHOUT moving the chat (rect before == after), the three-tab chain (D19 (a) replaces the non-anchor pane; closing the CHAT host promotes with no dangling id), layouts.json carrying layout + split, a PHONE page restoring the split in its model while displaying one pane and its own save leaving the split on disk and on the desktop, a remote same-tabs layout flip applied (the pre-fix key would not), a ratio-only change applied in place, a shared profile = two owner dots, a second profile = the strip with per-pane dots
  { name: 'test-title-chips-ui', tier: 'heavy', why: 'headless chrome (a 1280×900 desktop page, booted four times: this box\'s face, DejaVu Sans forced, back, the control) on a worktree server with a fake claude and three chat sessions, two esbuild bundles (~34 s; SKIPs without chrome / dtach)' }, // 2.369.179 lane G, THE TITLE WINS on a real page: a pooled session in a 3-tab chain at 640 px with inbox chips — every tab title readable: ≥ 6 characters beside a compact chip (the rule\'s own guarantee), ≥ 5 beside an icon (the floor — the message names the label px and the platform face; a Range over the rendered text; measured 7 under Noto Sans, 6 under DejaVu Sans), every billing chip compact/icon, the hover tooltip and the chip's data-tip lead with "全部 → UCI Max", the click opens the switcher whose pool row names it; a 2-tab chain 1240 → 400 → 1240 px re-decided by the ResizeObserver alone (compact → icon → compact); one window at 1240 px full + the whole title, at 340 px the standalone bar yields; a member switch re-decides with the new short name; NEGATIVE CONTROL: a patched always-full title-chips.js bundled in place (scripts/mutant-copy.mjs) ⇒ every tab title ≤ 3 characters; legs 1–5 run AGAIN under 'DejaVu Sans' forced on html, body — the Actions runner\'s system-ui (this box resolves Noto Sans) — the labels proven drawn in it by CSS.getPlatformFontsForNode, every check prefixed [DejaVu Sans] (that pass SKIPs with a reason without the face)
  { name: 'test-browser-multiview', tier: 'heavy', why: 'headless chrome (a 1280×900 desktop page, then a 390×844 phone page) on a worktree server with a fake claude (four chat sessions), a fake agent-browser and four fake stream upstreams; real clicks, a real right-click and a real icon drag through CDP (~1.5 min; SKIPs without chrome / dtach)' }, // MULTIVIEW (docs/design-browser-multiview.zh.md §3 (b) + D3 / D5, lane P): two chats grouped as tabs each get a browser — the first born BESIDE its chat (one pane ⇒ chat | browser), the second a quiet PULSING tab on the browser side (the shown pair and the window unchanged, never a third pane); a REAL click on the other chat ⇒ the right FOLLOWS to its browser and back — ZERO relay reconnects (the live views keep their socket objects, no fake upstream sees a second connection); two chats ALREADY side by side ⇒ the new browser is a tab on its chat's side, nothing moves; a session's second browser grows its strip, a real right-click → Open in new window = a second Agent browser window with its own selection; fold back through the window menu (the main one selects that tab) and through the ONE drag exception (the icon dropped on the group folds back, never a chain of two views of one session); a reload restores the group (members, sides, pair) and both views reconnect and draw; the phone shows one pane and a switch there never follows
  { name: 'test-split-ux', tier: 'heavy', why: 'headless chrome (a 1280×900 desktop page, a second desktop client, a 390×844 phone page) on a worktree server with a fake claude and three chat sessions; real title-bar drags through CDP (~1.5-2 min; SKIPs without chrome / dtach)' }, // SPLIT UX (docs/design-split-ux.zh.md §6 chunk 3, the owner's gestures 2026-09-23): G1 — a window dragged 409 px LEFT and released on the right half of a snapped window's title bar is MOVED to the pointer (±8 px), never split (and the §1 path inside the top band takes the snap the indicator promised); G2 — the drop at the workspace's left edge over that bar is the left snap (±2 px); a 1.5 s hold over another window's body never splits; the icon-stack merge (the one drag exception) pulses the strip's side-by-side button + a "Grouped as tabs · Show side by side" toast whose one click splits with the active tab LEFT, the strip in pane order, one glyph between the pane tabs, owner-colour underlines (computed); the badge's Unsplit / Swap (host ±1 px); Undo after an announced split (±2 px) and the stale-undo toast; the divider lit on hover + its right-click menu; a second desktop client following the split and a swap (the chainSyncKey rebuild, no echo revert); the phone one pane, no button / glyph, never flattening; command mode Ctrl+\\ v / V Split r1 (leg 11, a third session): the strip button re-labelled after a plain tab switch, the merge toast withdrawn by a split / speaking when stale, the menu's Beside keeping the focus. Split tabs v2 (leg 12, L1–L10) + v2 verify r1: L1b a 640 px host at 0.85 paints no tab under the window controls (the right column's floor, the margin tail, the badge stepping aside; control = the as-shipped columns + padding); L11 a real divider drag on client 2 across client 1's structural change survives, reaches client 1 + the disk in ONE send, no echo (control = the hold neutered: the as-shipped snap-back); L4a a pointer drag moves a SHOWN tab, the API keeps a hidden one hidden; L6 / L9 the active id follows the restore's re-key; L7b the merge-as-split toast's Unsplit keeps the drop slot (control = the plain Unsplit); L7c a drop onto an already-split chain offers Undo under both settings.
  { name: 'test-profile-blindness-chip', tier: 'heavy', why: 'headless chrome + a worktree server (~40 s) — the HEAVY half of §3.8 (the fast half is test-profile-blindness)' }, // AGENT BROWSER P2 (design-agent-browser-v2 §3.8 layer ③): the status-bar Browser chip as a MUTATION on a real server — a USER pin draws it neutral, the agent's own resolve (the real agent route, the session's own token) onto another attachment flips it AMBER without a reload while the sidebar's digest gate opens (both halves are scalar LIVE_SESSION_FACTS rows with their own digest), the same fact again leaves the gate shut, the dropdown states both facts, the one-click nudge queues the zero-spend browser-profile notice that the next prompt context carries once (the route names no spend reason), back on the pin ⇒ neutral and the nudge refused nothing-to-remind, no attachment ⇒ the ephemeral browser is named
  { name: 'test-get-usage-parse', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (16ms)' }, // B-7edc: get_usage control-request builder + rate_limits→cache parser. Pure pieces — the LIVE ws-correlation is validated separately on a real chat session (the…
  { name: 'test-permission-mode-ack', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (16ms)' }, // Regression test for the tracked set_permission_mode flow (2.195.0). CLI ground truth (verified live on claude 2.1.215, scripts in the 2.195.0 changelog entry)…
  { name: 'test-resume-desktop', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (16ms)' }, // Pool cold-restart + resume must keep each conversation on its HOME desktop (a fleet user, inc-mso43urh: a pool target switch cold-restarted sessions across
  { name: 'test-session-palette-search', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (16ms)' }, // Palette search: userW's real regression (inc-msjro90z-n6y3) + guards. "cmd+K 搜 best ever 搜不到 best ever toB signing 的 session，只能搜到 vendor session"
  { name: 'test-usage-pace', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (16ms)' }, // Parity test for src/lib/usage-pace.js vs claude-swap's pace.py logic (B-87fe).
  { name: 'test-device-mount-rclone', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (17ms) — server' }, // device-folder-mount LAST MILE (2.150.0): a REAL rclone `webdav` mount over the device chain (serve-folder → tcp-forward → rclone mount), verifying the device's…
  { name: 'test-frp-plugin', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (17ms) — server' }, // LIVE test for the frp plugin (B-0b60 public exposure) against the REAL frps relay. Needs the relay env: set VIBESPACE_FRPS_* directly, or point…
  { name: 'test-tool-progress', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (17ms)' }, // tool_progress must never be treated as a subagent message (2.227.7). Real record shape captured from a live stream buffer.
  { name: 'test-fallback-policy', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (18ms)' }, // claude.disableModelFallback contract test (2.228.0). Covers the three mechanisms: (1) spawn — buildSessionArgs merges switchModelsOnFlag:false into ONE --settings…
  { name: 'test-model-fallback-notice', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (18ms)' }, // REAL record shape captured from the transcript
  { name: 'test-usage-anchors', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (18ms)' }, // Dead-reckoning data foundation: identity key precedence (survives sub remove+re-add), anchor dedup by fetchedAt, cost-delta pairing.
  { name: 'test-creds-symlink-swap', tier: 'heavy', reads: ['src/account-material.js'], why: 'adopted 2026-09-07, was in NO runner (19ms)' }, // Design guard for pooled hot-swap (B-6217/B-71c3): the session's credential directory is a SYMLINK to the canonical account dir; swapping accounts = re-pointing that…
  { name: 'test-session-id-race', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (19ms)' }, // Session id / socket-name COUNTER RACE (2026-08-11, proven in production data on a fleet instance: four sessions minted ids sess-21/22/31/34 all carried sockName…
  { name: 'test-message-ids', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (20ms) — server' }, // R0 — content-derived message ids (docs/design-three-tier.md). The old id was `${sessionId}:${counter}` — every parser rebuild renumbered everything, which forces…
  { name: 'test-page-attachments', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (21ms)' }, // Regression test for CLI-injected PDF page images (2.194.0). A Read on a PDF ships the extracted pages into model context as image-only user records: LIVE = one…
  { name: 'test-dedup-sockets', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (22ms)' }, // dedupWebuiSockets — restore-time conversation dedup (2.185.3, real owner "重复session" report). A plain `claude --resume` REUSES the conversation id, so a resume of a…
  { name: 'test-eml', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (22ms)' }, // Unit tests for src/lib/eml.js — run: node scripts/test-eml.mjs
  { name: 'test-remote-attribution', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (22ms)' }, // Per-account attribution for REMOTE ledger events (2.294.0, the owner's live complaint: a remote message's billing row could only say "<host>'s machine login").…
  { name: 'test-onedrive-resolve', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (23ms)' }, // OneDrive drive_id/drive_type resolution (2.268.8) — rclone's onedrive backend refuses to create the fs without both in config, and the guided add flow has no…
  { name: 'test-usage-scan-subagents', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (23ms)' }, // 2.265.0: the ledger scan must mine SUBAGENT + WORKFLOW agent transcripts (<proj>/<sid>/subagents/**). Workflow agents' API usage exists ONLY there — the…
  { name: 'test-claim-jsonls', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (24ms)' },
  { name: 'test-task-colors', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (26ms)' }, // Task-group color scalability (2.230.0): auto-distinct colors for unset groups must be deterministic (same id → same color, every client/restart) and well-spread…
  { name: 'test-conversation-index', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (29ms)' }, // Conversation-location index (R3 tail): host-inference / dead-host rescue can locate a conversation the raw transcript cache has never seen (ownership recorded from…
  { name: 'test-graduate-dial', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (30ms) — server' }, // B-6640 e2e: graduate a REAL ssh machine to dial-out and back. Runs a THROWAWAY server in a git worktree (its own data/ — never touches a live instance) with the…
  { name: 'test-machine-migrate', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (31ms) — server' }, // B-f3e8 migration guard: dial-tokens.json → host records (dialTokenHash) and host-mounts.json + device-mounts.json → machine-mounts.json. The token migration MUST be…
  { name: 'test-agent-env', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (34ms)' }, // agentEnv() contract test (2.227.12) — the sanitizer that keeps the server's container runtime env (and the instance's chart-injected SECRETS) out of agent sessions.…
  { name: 'test-transcript-switchover', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (36ms) — server' }, // R3/R5 switchover ladders: the device is PRIMARY, every fallback rung still works, and the live-session overlay is never bypassed.
  { name: 'test-usage-link', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (37ms)' }, // Smoke for the global↔named usage-account link (usage-routes ingestPassiveUsage): org-uuid evidence must beat a stale ~/.claude.json email, and a proven-different
  { name: 'test-context-diff', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (50ms)' }, // Unit tests for TaskGroupManager.snapshotForDiff / renderContextDiff — the diff-based Task Group update injection (2.113.0). Pure store-level tests (no server)…
  { name: 'test-task-scan', tier: 'heavy', reads: ['src/session-store.js'], why: 'adopted 2026-09-07, was in NO runner (53ms)' }, // Task-tool scan regression (2.180.1 — real report: a long-completed task showed as in_progress in Steps forever): (a) COMPACTION re-appends retained records…
  { name: 'test-claude-subscription-login', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (70ms) — cli' },
  { name: 'test-layout-history', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (81ms)' }, // Layout rollback points (2.296.0). A layout-destroying bug was previously unrecoverable: sessions survive, but WHERE they lived is gone, and when the damage EMPTIES…
  { name: 'test-discovery-facts', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (98ms) — server' }, // ONE interpretation of discovery facts, any machine (CS separation, 2.278.0). The collectors legitimately differ (local rich sweep / daemon snapshot / ssh script…
  { name: 'test-group-admin', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (99ms)' }, // Route-level smoke for /api/agent/group-admin (2.132.0, issue #21 — manager agent delegation). Fake express + real TaskGroupManager in a temp dir. Asserts the DOUBLE…
  { name: 'test-prompt-context', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (119ms) — cli' }, // Route-level smoke for /api/agent/prompt-context — the diff-update delivery (2.113.0). Drives setupAgentRoutes with a fake express app + a real TaskGroupManager in a…
  { name: 'test-agentd-reexec-argv', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (154ms) — server' }, // Self-upgrade re-exec must PRESERVE the original argv (2.185.2, real owner↔Mac dial outage). The dial transport reads `--dial <url> --dial-token <t>` from…
  { name: 'test-node-bootstrap', tier: 'heavy', reads: ['scripts/vibespace-agentd-install.sh'], why: 'adopted 2026-09-07, was in NO runner (226ms) — server' }, // Node-free pairing: the installer's node RESOLUTION + PROVISIONING contract (2.246.0). Hermetic — a local HTTP fixture stands in for nodejs.org/dist, so
  { name: 'test-gmail-sync', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (324ms)' }, // Offline e2e for the Gmail sync engine (2.134.0): a mock Gmail API served on 127.0.0.1 + a patched API base exercises seed sync, filename shape (RFC2047
  { name: 'test-exit-proxy', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (325ms) — server' }, // ExitProxyManager (task #164): opt-in gating, machine resolution, and the SOCKS forward's byte pipe + lifecycle. The daemon SOCKS5 protocol itself is covered by…
  { name: 'test-mux', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (425ms) — server' }, // Unit test for src/agentd/mux.js — framing round-trip, chan-0 JSON control, byte-channel data, and CREDIT flow control (a fat transfer must not starve a
  { name: 'test-ssh-key-dialog', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (650ms) — chrome' },
  { name: 'test-ssh-key', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (757ms)' },
  { name: 'test-device-secret-quota', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (794ms) — server' }, // place-secret + quota-refresh device ops (2.298.0, design §Account split / §Quota refresh origin) against a REAL daemon. The quota op's VENDOR call is deliberately…
  { name: 'test-agentd-socks', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (903ms) — server' }, // On-demand EGRESS through a device (task #164): the daemon serves a SOCKS5 proxy on its loopback, the server reaches it via tcpForward, and a real SOCKS5 client…
  { name: 'test-agentd-bigread', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (910ms) — server' }, // Big-transfer integrity over the device plane (2.187.0). The mux control channel is credit-EXEMPT, so fs-done / stream-exit could OVERTAKE data still queued behind…
  { name: 'test-device-agent-setup', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (953ms) — server' }, // deviceAgentSetup primitives over a REAL dialed-in daemon (graduation B.3): the ws-handler dial branch ships agent tools + the 0600 token via fsWrite, registers the…
  { name: 'test-agentd-devicemount', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (1221ms) — server' }, // device-folder-mount CHAIN acceptance (2.150.0): the daemon serves a folder over WEBDAV on 127.0.0.1 (serve-folder), the server reaches it through the mux via…
  { name: 'test-transcript-worker', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (1268ms)' }, // Transcript worker contract + main-thread-block regression (2.235.0, the userL degradation follow-up). Generates a >34MB JSONL (forces the bounded tail path + line…
  { name: 'test-machine-probes', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (1270ms) — server' }, // R1 — machine fact probes, one implementation for every machine (docs/design-three-tier.md `probe.*`). The same facts existed three ways: the local backend-status…
  { name: 'test-attach-ack', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (1788ms) — server' }, // attach-ack proof-of-life contract (2.234.1, userL mass false-death incident): EVERY ws attach — real, sub-, or nonexistent id — must get a synchronous attach-ack…
  { name: 'test-login-expiry', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (1934ms here; a browser leg\'s cost follows machine load)' }, // a subscription's LOGIN SESSION has its own absolute deadline: pure reading (incl. the CLI-wiped shape), pool gates (dead ⇒ never usable, near ⇒ never a switch target), the once-per-threshold inbox ladder on a fake clock (restart-survival + re-login reset), the STRING every blocked/inbox surface prints (a login is never a spent quota bucket; a wiped file is never "expired" at a future date), wiring pins
  { name: 'test-agentd', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (3068ms) — server' }, // M0 e2e for vibespace-agentd (docs/design-remote-cs.md "= the local config"). Builds the daemon bundle into a temp install root, then via DeviceManager:
  { name: 'test-agentd-tunnel', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (3417ms) — server' }, // REVERSE-FORWARD (tunnel) acceptance (2.148.0, "互挂云盘去公网化"): the daemon binds 127.0.0.1:<port> ON THE DEVICE and pushes every accepted connection back over the mux to…
  { name: 'test-remote-lasterror', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (3724ms)' }, // meta.remote.lastError contract (2.228.1, the userL "host reconnecting (9) with no reason" report): when the remote transport child dies, the wrapper must record the…
  { name: 'test-agentd-dial', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (3733ms) — server' }, // Transport B e2e (dial-out, M4-lite): a daemon behind "NAT" dials OUT to the server over websocket (hand-rolled zero-dep client in the bundle); the server speaks the…
  { name: 'test-incident', tier: 'heavy', reads: ['src/incident.js'], why: 'adopted 2026-09-07, was in NO runner (4056ms) — chrome' }, // Incident-capture contract smoke (2.238.0): POST /api/incident writes a bundle with client rings + server state, append attaches a follow-up, /api/incidents lists…
  { name: 'test-workflow-usage-tailer', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (4571ms)' }, // Workflow usage tailer (2.270.0) — the race regression test: the launch ack precedes the run dir's creation by ~17ms in real runs, so the tailer MUST arm on a dir…
  { name: 'test-agentd-remote', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (4624ms) — server' }, // M2 e2e: the agentd protocol over the SSH STDIO BRIDGE + persistent pipe-sessions (docs/design-remote-cs.md M2). The "remote" is localhost over a real `ssh` process…
  { name: 'test-cwd-recreate', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (4897ms) — server' },
  { name: 'test-port-forward', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (5242ms) — server' }, // Unit test for PortForwardManager (B-0b60 tunnel path): detect() parsing + end-to-end piping through a MOCK device (tcpForward → a real loopback echo server standing…
  { name: 'test-usage-events-push', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (5276ms) — server' }, // usage-events PUSH stream (R4 finale) against a REAL daemon: transcript growth → walker child → batched chan-0 push → server ack commits the device-side cursor…
  { name: 'test-usage-scan-op', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (5940ms) — cli' }, // R4 step 1 — the daemon's `usage-scan` op, end to end against a REAL daemon (docs/design-three-tier.md `usage.scan`). WHAT IT PINS: (1) the op's events match the…
  { name: 'test-sidebar-scroll', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (6336ms) — chrome' }, // Sidebar lazy-folder scroll preservation (2.228.3, recurring user report: "scroll down, click a card's expand arrow → the list jumps back to the top"). Mechanism…
  { name: 'test-terminal-zoom-select', tier: 'heavy', why: 'headless chrome: real xterm from node_modules under body zoom 1.25/0.8, CDP mouse drags — the un-fixed page selects row 20×scale, the counter-zoomed page selects row 20 (~6s)' }, // 2.369.118, userW inc-mu92zsgw-6c9y
  { name: 'test-desktop-drop', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (6696ms) — chrome' }, // Desktop-preview drop resolves the target desktop by the preview's OWN id, NOT by DOM index (task #165, real report: dropping a window on a preview landed it on the…
  { name: 'test-ghost-host-heal', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (7202ms) — chrome' }, // GHOST-HOST SELF-HEAL (2.334.1, real fleet report): a persisted Recent/History host selection whose host record was REMOVED left the switcher <select> rendering…
  { name: 'test-auto-resume-loop', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (7458ms; ~14s since B-0220 — it runs a HELD test-new-member-wake beside itself, the pair a 2026-09-22 integration hit by chance) — cli' }, // THE AUTO-RESUME FIRE LOOP (2026-09-07 incident; owner decision ut-1c6c15a2db ①④). What happened, from the frozen journal (last 6h of the production server):
  { name: 'test-harness-honesty', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (7631ms here; a browser leg\'s cost follows machine load)' }, // the 2026-09-07 survey's four defects: codex personality is the USER's choice (unset ⇒ key absent; thread/settings/update applies it live), one explicit reply shape per ServerRequest method (+ MCP elicitation as a question card, unsupported ⇒ JSON-RPC error not a hang), the ACP unknown-sessionUpdate breadcrumb, and image_gen/sleep shape-equal across all THREE producers (live wrapper / rollout / thread-read) with a headless-chrome leg proving the image really draws
  { name: 'test-sidebar-empty-remote', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (7799ms) — chrome' }, // Zero-local-sessions + a configured remote host must still render the workbench with its Recent host switcher (2.186.8, real report: a fresh instance with a remote…
  { name: 'test-codex-remote-wrapper', tier: 'heavy', reads: ['data/bin/codex-chat-wrapper.js'], why: 'adopted 2026-09-07, was in NO runner (8128ms) — server' }, // E2E for codex-chat-wrapper's REMOTE MODE (2.139.0, B-0588): a minimal JSON-RPC app-server stub runs under the REAL vibespace-remote-keeper; the wrapper attaches…
  { name: 'test-agentd-adopt', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (8362ms) — server' }, // Pipe-session ADOPTION across a daemon restart (the 2026-07-17 userL outage): a remote chat child is spawned as `sh -lc '… exec … <cli>'`, so after the execs its…
  { name: 'test-agentd-wired', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (8902ms) — server' }, // M2 WIRED-CHAIN e2e: the full production pipeline with the agentd path ON — chat-wrapper (remote mode) → agentd-attach bridge → standing daemon → persistent pipe…
  { name: 'test-run-collapse-fold', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (9004ms) — chrome' }, // CDP smoke: a Skill card folds, and a newly appended foldable card is folded BEFORE it can paint (no flash) — 2.227.9.
  { name: 'test-queue-steer', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (9.2s → 46.9s measured after the ⑭ restart leg: three worktree-server boots, a real dtach wrapper and a browser; a browser leg\'s cost follows machine load)' }, // QUEUED vs STEERED input (owner ask): the backend-caps inputModes row + client META twin, the formatQueueOp adapter verb (refusals name the reason), the ws 'queue-op' caps gate + coded refusal, the normalizer's queue meta op + bubble chips + multi-queue semantics, a DOM-free render of the queue strip from the REAL ChatInput (incl. XSS), and the REAL wrapper against a REAL `codex app-server` (no turn — evidence-SKIP without the binary; a renamed queue method fails there), and (⑬/⑭) the queue across a RESTART: the rebuilt normalizer's `queue: []` is a GUESS (`queueKnown`), the wrapper re-states it on demand (`queue-resync`), proven end to end against a worktree server + a real dtach wrapper + a headless browser
  { name: 'test-agentd-workers', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (10s) — server' }, // R2 — daemon worker isolation (docs/design-three-tier.md). THE INVARIANT: a hung filesystem path (dead FUSE mount class) may starve a WORKER — which the pool then…
  { name: 'test-local-discovery-device', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (11s) — cli' }, // B-47e2 — the local discovery sweep's FS facts from device #0, flag-gated. PARITY: with a synthetic HOME (locks + transcripts + a resumed session's tail-id case)…
  { name: 'test-stage-overlap', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (11s) — chrome' }, // Stage pile-at-slot regression smoke (userW's 超级重叠, 2.209.0): BUG: Stage → normal desktop → Stage round trip revealed EVERY slot-parked ex-hero at identical slot…
  { name: 'test-minimap-jump', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (12s) — chrome' }, // INDEX-mode minimap jump landing (inc-msnyti7z-c5sb: "minimap 跳转又不准" on a tool-heavy 4.4MB remote session). The incident trace showed the exact failure: jumpToIndex…
  { name: 'test-session-brain-dark', tier: 'heavy', why: 'slow, server (13s)' }, // SESSION-BRAIN STEP 2 (dark double-feed) against a REAL daemon. Pins: (1) the daemon's device-side normalizer stream emits ops for a live pipe session's stdout; (2)…
  { name: 'test-fold-ux', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (14s here; a browser leg\'s cost follows machine load)' }, // run-fold honesty (ToolSearch = tool lookups, never MCP; pure summary composer) + expanded-run legibility (rail/floating bar/footer) — node unit + headless-chrome fixture (SKIPs the chrome half without chrome)
  { name: 'test-resume-breaker', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (14s) — server' }, // transcript EXISTS under the fake HOME (the "known" case)
  { name: 'test-agentd-robustness', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (14s) — server' }, // M2 ROBUSTNESS e2e (docs/design-remote-cs.md M2): adversarial verification of the ssh-bridge + persistent pipe-session model under real-world stress — 1.…
  { name: 'test-sidebar-rail', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (15s here; a browser leg\'s cost follows machine load)' }, // rail panels + process manager CDP battery (was manual-only and went silently stale — the 9-item assert was red for 12 releases; no rebuild: overlays the gate's own build; SKIPs without chrome)
  { name: 'test-sealed-orders', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (17s) — server' }, // SEALED-ORDERS emergency reflex (design §Pool management) vs a REAL daemon: the device executes a LOCAL pool fallback switch ONLY under the double condition (limit…
  { name: 'test-attach-rescue', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (19s) — chrome' }, // Attach-error view-only rescue smoke (2.217.0 — userL's 12 blank windows): BUG: after the server loses its sessions (OOM kill, pod recreation), every saved layout…
  { name: 'test-gear-menu', tier: 'heavy', why: 'chrome — the ⚙ menu tree in both modes (~40s; SKIPs without chrome)' }, // ⚙ menu hierarchy (docs/design-gear-menu-hierarchy.md): desktop 1280×800 = top-level row budget, hover-intent flyout on screen, ArrowDown/ArrowLeft/Enter drive a stubbed action, Esc closes ONE layer then the popover, outside mousedown closes, the Appearance panel keeps the popover open; phone 390×844 with touch + hover:none = inline accordion, every row ≥ 44 px, a tap runs the action, no hover dispatched
  { name: 'test-taskbar-group-ui', tier: 'heavy', why: 'chrome with a real mouse on a worktree server — three File Explorer windows, a tab group, CDP mouse / pen / touch / keys, two rebuilt control bundles, two reloads, one leg at CPU ×20 (~90 s; SKIPs without chrome)' }, // A GROUPED TASKBAR BUTTON end to end (lane K): (a) click behind ⇒ the group's active tab focused + raised, no chooser even when the pointer rests; (b) click in front ⇒ the pinned chooser above the button, a row switches the tab, Esc / a click elsewhere close it; (c) hover ≥ the intent on the PAGE clock ⇒ the non-modal chooser (focus untouched), across the gap onto a lit row, gone after the leave grace (pixels in its box change), a 150 ms cross-over never opens; (d) a real title-bar drag over the button never opens; (e) touch taps: activate, then the chooser; (f) Enter / ArrowUp / ArrowDown / Esc; (g) the single button unchanged (click focuses, again minimizes); (h) right-click = the window menu; (j) verify r1: 30 hover open/leave cycles with no click leave the document's mousedown / keydown listener counts unchanged; (k) a rebuild under an open chooser re-anchors it (aria-expanded, Esc focus, a click on the rebuilt button keeps the SAME chooser); (l) a pen hovers — attributed to its own TYPED enter (scripts/pen-hover-judge.mjs), Chrome's post-open mouse re-target waited for, the pre-fix last-enter slot red on the same record; (l2) the same at CPU ×20; (o) a rebuild under a RESTING pointer (after a click / an Esc-dismissed hover) grows nothing, a return after a rebuild-window leave still hovers; (m) right-click on a chooser row = that tab's window menu, the chooser pinned beneath, its Close closes THAT tab; (n) a reload shows a restored group as ONE grouped button with no input; CONTROL: the scratch bundle rebuilt with the old always-chooser click ⇒ (a) red; CONTROL 2: the r1 disposer + the four low fixes reverted ⇒ (j) +30, (k) focus on body, (l) no open, (m) no menu, (n) SSS, (o) a chooser under the clicked pointer (hoverStep's enter row reverted)
  { name: 'test-ui-scale', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (24s) — chrome' }, // UI scale (DPI) + UI font scale + locked-model-badge restyle smoke (2.257.0). - locked badge: SVG lock in currentColor on the accent pill (no more orange
  { name: 'test-remote-keeper', tier: 'heavy', reads: ['data/bin/vibespace-remote-keeper'], why: 'adopted 2026-09-07, was in NO runner (27s) — server' }, // E2E test for data/bin/vibespace-remote-keeper — the remote-side persistence layer for remote chat sessions (2.124.0). Simulates the local chat-wrapper's
  { name: 'test-codex-p2-wrapper', tier: 'heavy', why: 'slow (28s)' }, // codex P2 wrapper: queue-while-busy, slash commands + real compact, live MCP/web/image/compaction records — real wrapper vs stub app-server
  { name: 'test-opencode-plugin', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (29s here; a browser leg\'s cost follows machine load)' }, // the OpenCode background service is a PLUGIN, default OFF (owner 2026-09-07): fresh instance spawns nothing, enable/replay/disable over HTTP on a real server, env override, and the first-use dialog in headless chrome (asked once, Enable resumes the pending action)
  { name: 'test-acp-harness', tier: 'heavy', why: 'slow, binary (33s)' }, // S8 generic ACP v1 harness: the REAL acp-wrapper against a mock ACP agent (initialize → session/new → prompt → tool_call → request_permission → cancel → load) + normalizer shapes + stdout consumer + wiring pins
  { name: 'test-toolbar-resize', tier: 'heavy', why: 'adopted 2026-09-07, was in NO runner (36s) — chrome' }, // Toolbar-resize persistence smoke (2.252.1 — the 2.250.1 snap-back rootfix). The bug: cssDefault()/def read the COMPUTED --toolbar-height, which the drag
  { name: 'test-writer-sweep', tier: 'heavy', why: 'slow, binary (40s)' }, // ONE writer sweep, any machine (CS separation, 2.276.0). Before this, the sweep existed three times — ssh, dial, and NOT AT ALL for local — so a local resume of a…
  { name: 'test-chat-paging', tier: 'heavy', why: 'chrome — three fixtures incl. the 48 MB huge compact-mode one (§1c, inc-mubvu3a4-x8sb) driven by real CDP wheel gestures on the fix AND on a pre-fix control copy (two bundle builds, two worktree servers; ~4-5 min)' }, // Chat virtual-scroll paging stability (2026-07-30 user report: "翻页过程中会 往上跳一大截，往回翻也会意外跳跃"). Drives a REAL view-only ChatView over a synthetic 700-record transcript… §4b the fold-dominated window (2.369.129); §4c/§4d the huge compact-mode session: the per-gesture rules of scripts/paging-gesture-rules.mjs (no jump back > 1.5 viewports · no pin / bottom landing before the window reaches the tail · blank ≤ 25 % · the ring never empty after a page) + the pre-fix control that must reproduce the incident
  { name: 'test-ax-budget', tier: 'heavy', why: 'chrome — CDP accessibility tree over a scratch server (one chrome, two bundle builds — the fix and the neutered-band control — on the §1c fixture; ~75 s)' }, // THE ACCESSIBILITY-TREE MEASUREMENT LEG (docs/design-accessibility-tree.zh.md §3 row 0 lean / §4; 2.369.144's 50,150-node root cause): Accessibility.enable → getFullAXTree, TOTAL + NON-IGNORED per scope (list / window / minimap / sidebar) joined by backendNodeId; ① positive control ② OQ1 — aria-hidden on the list must drop ≥ 80 % of its non-ignored subtree, whether TOTAL falls too is the PRINTED verdict that decides the band's attribute ③ the growth over four page-ups (printed with its cause — the trim's keep zone filling inside the band) ④ THE READER'S BAND on a teleport + two 2,000-line gap slabs: the band census on its own edge, the GROWTH INVARIANT (a second slab moves NON-IGNORED ≤ 10 %), the per-window pin at measured ×1.25, ①b/④e the minimap strip ≤ 10 with an in-page control ⑤ the setting's two meanings (false = the list, true = the band re-derived on the flip) ⑥ NEGATIVE CONTROL: the band neutered at source in a scratch copy (second bundle build) must GROW > 30 % and expose every far card ⑦ FOCUS: a focus landing in a band-hidden card (.focus() and Shift+Tab from after the list) exposes it in the focus event's own task — the attribute read in-task and Chrome's "Blocked aria-hidden" warning count, the handler blocked in-page as the control
  { name: 'test-collab-live-counter', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (53s here; a browser leg\'s cost follows machine load)' }, // the live sub-agent traffic readout (2026-09-07): the PURE composers (counts/pluralisation/age granularity/live vs frozen) + the normalizer's per-row record timestamps, then headless chrome — a REAL codex rollout opened read-only (frozen totals, nothing ticking, no encrypted blob in the DOM) and a LIVE codex chat session behind a stub app-server (head grows, age ticks, spinner switches and yields, everything freezes at turn end)
  { name: 'test-client-boot', tier: 'heavy', always: true, why: 'chrome — the fast tier never launches a browser (70s here; a browser leg\'s cost follows machine load)' }, // headless-chrome app boot (the FRONTEND face of 打不开; SKIPs without chrome)
  { name: 'test-jobs-engine', tier: 'heavy', why: 'slow (71s)' }, // Background Work ENGINE gate (real spawns in an isolated tmp dataDir — never the repo's production data/). Pins: spawn→adopt-by-stamp across engine generations…
  { name: 'test-mobile-gaps', tier: 'heavy', why: 'chrome + a worktree server at 390×844 with a mobile UA + touch emulation, real long-press touch sequences, a real dtach shell (~60s; SKIPs without chrome)' }, // docs/design-mobile-gaps.md top-10 + measured defects: every lifted touch target ≥36px, the nav For-you sheet, the "+" long-press sheet, the explorer single column / Select mode, the status-bar search, the message long-press menu (hover buttons gone), the switcher "+" / long-press menus, the minimize guard, the terminal key row + Copy screen, the System/Ports/Channels windows, the wrapped settings nav
  { name: 'test-new-session-dialog', tier: 'heavy', why: 'chrome + a worktree server + a stub claude behind the real chat-wrapper asking permissions like the CLI (~15 s; SKIPs without chrome / dtach)' }, // LANE L on a real page: the New Session dialog never carries the name, Escape with an open picker / the cwd suggestion list closes only that list (a text-field Escape as the control; A2b the constructed shape where the page gets the key), the permission modes as words + the raw value (en + zh); the spawned CLI's own argv carries --settings permissions.allow (claude.allowAgentTools off ⇒ none, the control); the browser card's face + "Open <url>", Always Allow sending the WIDENED rule as `updatedPermissions`, the hovered Allow staying green (hovered Deny as the control), one real click answering a card, the close --all scope on a Bash card that also runs pgrep, and `git status` as the unwidened control. Measured red on the pre-fix build: 22 finding legs, every control green.
  { name: 'test-inbox-reply-ui', tier: 'heavy', why: 'chrome + a worktree server + a stub claude behind the real chat-wrapper answering real turns (~45 s; SKIPs without chrome)' }, // design-user-inbox-reply chunk 2: the For-you reply on a real page — hostile title/option/detail render as text (+ an innerHTML negative control), the running dot idle→running→idle through the active-sessions broadcast with no row rebuilt, a reply typed + Enter reaches the stub's stdin quoted and resolves the row in place, a stopped session's button disabled with the verdict's sentence, a half-typed box survives a broadcast (same node, text, focus), an option chip sends its label, the phone sheet's reply controls ≥36 px and Esc folds the box before the sheet; chunk 3: the title-bar mini inbox — per-window badge counts (a stopped view-only window its own, notices never), the popover lists exactly that session's rows and replies through the typing path, Escape layering, the badge on the tab in a chain, a hostile session name as text, a key-filter-less patched copy as the isolation control
  { name: 'test-jobs-panel', tier: 'heavy', why: 'chrome + a worktree server seeded with the neutral triage fixture (~60s; SKIPs without chrome)' }, // Background Work TRIAGE panel (design §13) at 1200×800 (rail) AND 375×667 (window): the badge counts only awaiting + unacknowledged failures, a group holding an unacked failure is expanded by default while a done-only group is collapsed, a collapse persists across a reload (user-state jobsPanelFolds), a failed row shows its last line, the summary names the held notifications, the "Archived · N" row fetches only on click
  { name: 'test-desktop-app-keeper', tier: 'heavy', why: 'launches a real X server + x11vnc + an app per leg, SIGKILLs a keeper process and re-adopts, waits out an idle timeout and a CPU-burner runaway (~40s); SKIPs with its reason when Xvfb/x11vnc are absent' }, // docs/design-desktop-apps §6 row 3: launch → port listens → RFB handshake → record on disk → SIGKILL + rebuild ⇒ adopted → stop clean (/proc census equal, no orphan X); the ws bridge (auth 401 / 404 / an unknown kind 501 / rfb AND xpra relayed / bytes + input reports / the window-live policy PER PACKET on xpra) + §12 the real xpra rung (incl. a crashed xpra's Xvfb reaped, keeper up and keeper down) + §13 the fit belt's fork counts and the WM-frame leg (VIBESPACE_TEST_WM_DIR) + §14/§15/§16 a Watch viewer on the real xpra (lifecycle cut; the keymap and display-size fences + their takeover replay, "abc" typed into a real xterm, the holder's display size standing) + §13 (b2) the rfb twin on the real Xvnc; routes incl. a host with no access layer refused 503 host_unavailable (lane C2; v1's 400 retired) + §18 B-bfe6 a browser's OWN profile (0700, argv, removed at stop / app-exit / boot, kept on request, refusals by name, a no-retire control)
  { name: 'test-desktop-app-window', tier: 'heavy', why: 'chrome + a worktree server + real Xvfb/x11vnc: launch from the dialog → window → canvas not black → a second client → SIGKILL + reboot ⇒ adopted + reconnects → Stop ⇒ exited (~90s); SKIPs without chrome or Xvfb' }, // docs/design-desktop-apps §6 row 4
  { name: 'test-desktop-xpra-window', tier: 'heavy', budgetMs: 2100000, why: 'chrome + a worktree server + the REAL xpra rung (xpra 6.5.3 + Xvfb + xterm): the seamless window filling the pane at two sizes with the pixels measured, the app\'s own title, typed text read back from the app, the clipboard both ways at the X level (xclip) on the loopback (secure) and the plain-http hostname (insecure) pages incl. REAL pastes on plain http (Ctrl+V on the pane, the Paste chip\'s box + Send), a third size under the UI scale (net zoom 1 measured, the X pointer at the same coordinates via xdotool), §4 the belt on the real rung (xterm resizing/moving itself fitted back, a second top-level at +2000+1500 placed inside, GNOME Calculator\'s mode switch keeping ≥ 95 % — SKIP without gnome-calculator), §6 HiDPI at DPR 2 (the canvas IS the screen pixel for pixel, the app\'s minimum clamping the window, phones) and §7 the r2 findings (DPR 1.5 pixel identity, the phone\'s lower rows + corner, a DPR-1 takeover, the 1.5× xterm cell) each against a patched-copy control server, §8 B-bfe6 a REAL browser launched from the dialog\'s Browsers section with an Open URL (window maps, the URL landed, the page title in the title bar, the keeper\'s 0700 profile, Stop removes it; a snap or absent browser SKIPPED with its reason), §12 LANE B seamless (a CSD calculator loses our bars, its header-bar drag moves our window, hover / Alt reveal, the pauses and the hatches, a forced-false control copy), §13 LANE C2 the main legs with host=<a scratch daemon PAIRED to the worktree server> (the picker, the device\'s ladder, the launch there, the window through the hub forward, the pane covered, the title naming the machine, keys into the device\'s file, Stop), §15 LANE D (a) the scale geometry (GNOME Calculator at DPR 2 and 1 through the window\'s own Scale ▸ rows auto → 1 → 1.5 → 2 → auto → 1 + a resize: the picture covers the pane, the window follows the scale, the column ∝ the true scale, every map at its final size), §16 real Chrome under seamless, one control copy for both, §17 lane M the ⚙ menu / a window context menu / the ⋯ Scale ▸ menu / a createPopover each CLOSE on a trusted click into a live GNOME Calculator picture while the calculator takes the digit, against a mutant-copy server whose closer is the pre-lane bubble mousedown (each stays open) (~1000 s + ~540 s — its own budget); SKIPs with evidence without chrome / xpra / xauth / xterm' }, // docs/design-desktop-apps §7 P8-2 chunk x2 (D21 (c) (b)) — the exit conditions of the chunk, measured on this box
  { name: 'test-desktop-app-snap', tier: 'heavy', budgetMs: 1200000, why: 'chrome + a worktree server under its own dbus-run-session + the REAL xpra rung with REAL google-chrome and gnome-calculator: a matrix of Chrome and Calculator × DPR 2 / 1 × UI 100 / 125 % on a 1920×963 page with the sidebar at 470, ten trusted acts each (rest, the right third of 1×3, right / left / top / bottom halves, the bottom-right of 2×2, maximize, restore, a 700 px resize) + at DPR 2 / UI 100 % the r2 flows (minimize / maximize → the sidebar opens → restore / un-maximize, the widen / narrow cascade, a phone round trip), every state measured (window / pane / picture vs #workspace) and judged on a decoded screenshot (the picture\'s last 40 device columns and rows found on screen), + a pre-fix control copy (~12 min); SKIPs with evidence without chrome / xpra / xauth / dbus-run-session' }, // inc-muhmqvzf-jodk (2026-09-26, the owner: "chrome吸附在右侧，右侧有截断"): a snapped desktop-app window never clips its picture — the owner's case (Chrome, DPR 2, the right third of a 1×3 grid) 0 px hidden; CONTROL = the pre-fix placement levers pulled back (the owner's case hangs past the workspace, the calculator's bottom half and its UI-125 % rest are cut)
  { name: 'test-desktop-remote', tier: 'heavy', why: 'binary + daemon: a REAL agentd booted from the built bundle under a scratch HOME as the fake paired device + the REAL xpra rung (xpra + Xvfb + xterm) on it, five daemon boots (~38 s); SKIPs with evidence without xpra / Xvfb / xauth / xterm' }, // DESKTOP APPS LANE C1 (design-desktop-apps-seamless §3.5, D5/D8): through src/server/desktop-access.js ⇒ facts ⇒ launch an xterm ON THE DEVICE (its record in the device\'s own ~/.vibespace/desktop-apps.json) ⇒ forwardPort (hub loopback → dm.tcpForward) ⇒ a REAL xpra hello through the forward ⇒ "abc" typed lands in the app\'s file (latencies printed, §8-7) ⇒ windows / keep-alive / status ⇒ the daemon SIGKILLed and a new one ADOPTS the live record at boot ⇒ stop leaves nothing carrying the marker; the capability gate: a daemon copy without the capability ⇒ host_needs_daemon in < 1 s, CONTROL = the copy without the handler answers nothing (the hang), an ssh host without a daemon + an unknown host refused by name; LANE C2 §7: the REAL hub keeper + the REAL bridge over that daemon (a launch with host followed to ready, the upgrade resolved through streamEndpointFor to the hub forward, a real xpra hello + pings + keys typed THROUGH THE BRIDGE, the forward released, offline ⇒ kept + 404, stop) + the capability gate through the hub keeper's launch; C2 verify §8: an op IN FLIGHT when the link dies answers host_unavailable in ms (a pre-fix client copy waits out its timeout), run-stream's per-op belt, an install run past its deadline with the device's child waited out; VERIFY r2: the capability found by content (F5), the device's facts reporting the detached install (installing ⇒ lastInstall), the daemon SIGKILLed mid-install ⇒ the install still ends (a pre-fix rung copy dies with it), the hub's side of the link destroyed with a 4 MB run-stream producer in flight ⇒ resumed into ~/.vibespace/run-stream/<pid>.log and finished (F2; the bundle without the orphan resume leaves it paused)
  { name: 'test-desktop-xpra', tier: 'heavy', why: 'a worktree server with PASSWORD AUTH on + the REAL xpra rung (xpra 6.5.3 + its own Xvfb + xterm), driven from node through the routes and the ONE ws bridge (~50 s): bring-up, the loopback-only binding check with a non-loopback TCP connect REFUSED, 401 / 404 / a real rencodeplus hello through the relay, resize-follows against X\'s own geometry, the clipboard both ways at the X level (xclip), keep-alive vs idle stop with the setting patched live, adoption of xpra AND vnc-display records across a SIGKILL + reboot; SKIPs with evidence without xpra / xauth / Xvfb / an X app' }, // docs/design-desktop-apps §7 P8-2 chunk x3 — the rung CLOSED on the real server (no chrome; the chrome half is test-desktop-xpra-window)
  { name: 'test-desktop-vnc-fit', tier: 'heavy', why: 'chrome + a worktree server + the REAL Xvnc rung (TigerVNC 1.15 + xterm): the app fitted to the framebuffer, the VibeSpace window resized twice with the framebuffer following within 2 s and the app rect equal to it (black pixels outside the app counted and printed), the title bar = the title of the app window as text, the same follow under vibespace.uiScale 125 (net zoom 1, the pointer on the same X pixel), then the FIXED spelling (a PATH without Xvnc ⇒ Xvfb+x11vnc) with its chip; SKIPs with evidence without Xvnc / Xvfb+x11vnc / chrome / an X app (~60 s)' }, // P8-2 x4 (docs/design-desktop-apps §7): the vnc-display rung fits the window too
  { name: 'test-roster-reset-eta', tier: 'heavy', why: 'chrome + a worktree server: the Manage Agents roster rendered with clock-derived resets — the label under every donut, none under an empty-state window, the removed row-level line, row heights and the cluster alignment at 1200×800 and the mobile modal at 375×667' },
  { name: 'test-reconnect-storm', tier: 'heavy', why: 'chrome + 19 live chat sessions (real chat-wrapper, stub claude) behind a scratch server, twice (fix vs a scratch copy with the stagger neutered)' }, // perf lane ⑤b, inc-mtndq0vb: a socket drop with 5 visible + 14 hidden chat windows — attaches/s peak at the server, visible attached p95, the hidden spread, srv-loop-gap-ms, an un-hide mid-queue, identical-skip parity; the harness perf chunks C/D measure on
  { name: 'test-desktop-resume-paging', tier: 'heavy', why: 'chrome — the fast tier never launches a browser (224s here; a browser leg\'s cost follows machine load)' }, // inc-mtq5bpjt-0o0n end-to-end: a PINNED window survives a real desktop switch on a real >34MB transcript (gap sentinel installed), incl. the input-less scrollTop→0 probes and the round-3 TRUSTED-input legs (a real click must NOT disarm the resume repair, a real wheel/scrollbar drag must), WITH a source-level negative control that rebuilds the bundle with the gates patched out (SKIPs without chrome; ~3.5 min, two chrome runs + two bundle builds)
  // ── integrated 2.369.72 (suites master added while the split branch was open; all HEAVY: chrome / real serve / real wrapper / >10 s) ──
  { name: 'test-init-frame', tier: 'heavy', why: 'chrome + binary: headless 375×667 census of the status-bar panels + a dump of the installed CLI (2s here with the chrome legs skipped)' },
  { name: 'test-opencode-remote', tier: 'heavy', why: 'binary + slow: the shipped ssh op script over real child processes (21s)' },
  { name: 'test-opencode-s9', tier: 'heavy', why: 'server + chrome: real opencode serve + headless chrome + real processes (227s)' },
  { name: 'test-permission-rules', tier: 'heavy', why: 'cli: the real chat-wrapper stdin verb + local oracles (strace + real CLIs when present) (10s)' },
  { name: 'test-readings-attribution', tier: 'heavy', why: 'chrome: real engine/pool/symlinks + the headless §10 panel legs (3s here with chrome skipped)' },
  { name: 'test-turn-truth-ui', tier: 'heavy', why: 'chrome: a live ChatView in headless chrome + the real stdout consumer (9s)' },
  { name: 'test-integrations-ui', tier: 'heavy', why: 'server + chrome: a real worktree server (the vendor stub preloaded), a bundle build, a 375×667 page and a second client (~3 min)' }, // design §14.5 on the six browser key rows (the only cards since r4): the source chip walk, Replace never reveals, a PUT failure toasts, the deep link, two clients, zero-network Tests only; ⑩ design-integrations-per-account r4 chunk 3: the channel account card + dialogs end to end against scripts/fixtures/channels-vendor-stub.cjs (type-first Connect, presets / Custom / the Lark callback row, the consent in the dialog, the health line / ↳ rows / login-only, the ⋯ order D6, Edit → Re-authorize on a client switch, Duplicate with its own consent, the dead-sign-in error line healed by Re-authorize, the custom secret prefilled, Remove refused by name, in-place repaint, 375 px, pixel probes)
  { name: 'test-mounts-dialog-extract', tier: 'heavy', why: 'chrome: headless chrome over raw CDP on file:// bundles, no server — six real storage dialogs rendered through the shared module and through the byte-for-byte 2.369.160 baseline, compared by outerHTML and decoded pixels, with a one-character control; §3 D2: the storage Edit dialog — a client switch opens Re-authorize under the NEW client, the token lands WITH it, against a patched copy with the decision neutered (21s)' }, // D1 of design-integrations-per-account: the extraction of _mountsDialog/oauthLinkRow/_wireOAuthConnect is pixel-identical; the baseline fixture proved against 348aa226 when the history is present; D2 (4a) the Edit dialog draws identically and Save re-authorizes on a client switch
  { name: 'test-channels-e2e', tier: 'heavy', why: 'server + chrome: a real worktree server, a bundle build, TWO chrome pages and a SIGKILL+reboot (~90s)' }, // the P0 exit conditions end to end: a fake conversation in the panel, opened as a window, surviving a restart, synced between two clients, two passes each advancing their own cursor, and a READ-ONLY conversation with NO send control; P3 (design §9): the composer proposes, the inline approval card + the other client's Outbox window render ONE record (identity row + the `unknown` warning), one For-you pointer filed with its id on the row and retracted by the engine, Approve sends through the fake adapter and the second client repaints off `channel-outbox-updated`, the audit log holds propose→approve→attempt→outcome with draftedBy/approvedBy/sentAs/identityMarking, Reject carries its reason and writes no attempt, and the outbox survives the SIGKILL + reboot; P4 ⑪ (§9.4/§9.5): a send whose answer was LOST lands as `unknown` with the For-you item and a Check outcome button, Check outcome from the card settles it to sent (the item retracted as `system`, reconcile-attempt → reconcile-outcome audited, nothing re-sent), the panel's sender-line switch reads OFF (instance default) and a user's own draft carries no sender-line note even after a channel turns it on, the reconciled proposal survives the reboot
  { name: 'test-channels-groups-e2e', tier: 'heavy', why: 'server + chrome + two dtach fixture sessions: a real worktree server adopting two stub-CLI sessions, headless chrome, a page reload (~60s)' }, // AGENT GROUPS IN THE PANEL (design §22.5, chunk g3): the first screen IS the group list; New group (live sessions, nothing pre-selected, the "will wake N" echo) with a HOSTILE name rendered as text everywhere; each invitee's stub CLI records ONE invite frame with the context; the owner sets alpha → always in the detail and sends as You: alpha's stub records the wake, beta's (next-turn) records nothing, the toast says woke 1; the @-autocomplete + a mention wake; the list reorders by activity in place with zero fetches; an agent's post shows unread, opening the window reads it; the Accounts fold survives a reload — every wake through the REAL ladder + authorizer into a recording stub
  { name: 'test-channels-i18n', tier: 'heavy', why: 'server + chrome: drives scripts/dbg-comm-surfaces.mjs at zh AND ja (two worktree boots per language, headless chrome over every panel/window/outbox/editor/wizard/Integrations surface, ~4 min)' }, // a3 of the comm-panel polish (owner "似乎没太做好 i18n"): ZERO Latin-only visible text nodes on the eight surfaces under zh and ja outside a PRINTED allowlist (proper nouns, URLs, ids, the fixture's own data by DOM path); a planted English literal turns the PURE census red (the negative control runs before chrome)
  { name: 'test-worktree-userchan-ui', tier: 'heavy', why: 'chrome: headless chrome + the LIVE_SESSION_FACTS drift guard (4s here with chrome skipped)' },
  { name: 'test-fork-restore', tier: 'heavy', why: 'server + dtach + a fake CLI: a scratch copy of the tree booted twice (SIGKILL between) with two parents and three pending forks, then the same run on a copy carrying the pre-fix boot dedup (~70s)' }, // fork-group round 3: a restart beside pending forks retires no parent, and the terminal fork / the chat fork announced while the server was down / the chat fork whose init is the first line after the re-attach each adopt their own id
  { name: 'test-restore-liveness', tier: 'heavy', always: true, why: 'server + daemon: fault-injected vibespace-device daemons, real dtach fixtures and three worktree-server boots over a self-upgrading daemon (86s)' },
];

// Suites that are in NEITHER tier, each with the reason it cannot be gated.
// This list is the census's escape hatch and it is deliberately uncomfortable
// to add to: an entry here is a suite nobody runs.
export const EXCLUDED = [
  { name: 'test-agentd-m3m4', why: 'RED on this checkout 2026-09-07 (6542ms) — fails "live claude lock reported; dead AND pid-reused locks filtered" (a real daemon-side assertion, not a missing resource). A debt WITH EVIDENCE, not a shrug: fix it, then move it into a tier' },
  { name: 'test-agentd-real-ssh', why: 'MANUAL: needs a REAL remote host — `node scripts/test-agentd-real-ssh.mjs <hostId>` (hostId from data/hosts.json; key auth + node on the host). No unattended runner can supply one' },
  { name: 'test-agentd-switchover', why: 'MANUAL: needs a REAL remote host id argument (same M2 family as test-agentd-real-ssh)' },
  { name: 'test-agents-overview', why: 'RED on this checkout 2026-09-07 (72s) — chrome; fails three asserts — water-level-coloured switcher percentages, the scoped bucket in the preview, and the login terminal opening. In no runner, so it rotted unseen: exactly what this census exists for. A debt WITH EVIDENCE, not a shrug: fix it, then move it into a tier' },
  { name: 'test-architecture', why: 'chained by `npm run build` — tier conformance AND this census itself, so it already runs in both tiers and in the in-app update' },
  { name: 'test-auto-graduate', why: 'RED on this checkout 2026-09-07 (26ms) — fails "requires an operator-declared URL and never self-publishes to the relay" — a pure assert, most likely superseded by the 2.367.0 instance-url rules and never re-read because nothing ran it. A debt WITH EVIDENCE, not a shrug: fix it, then move it into a tier' },
  { name: 'test-bundle-globals', why: 'chained by `npm run build` (client free-variable scan of the just-built bundle)' },
  { name: 'test-desktop-reorder', why: 'NOT RE-RUNNABLE on this checkout 2026-09-07 (chrome, 12s) — it passes on a clean run and FAILS on the immediately following one, deterministically: measured pass/fail/pass/fail over four consecutive runs (6 FAILED, "toolbar resize handle exists" + "--toolbar-scale drives the rendered toolbar size"). It boots chrome on a FIXED CDP port with no --user-data-dir, so run N+1 inherits run N. Never in the gate, so nothing ever ran it twice. A debt WITH EVIDENCE: give it a free port + its own profile, then move it into a tier' },
  { name: 'test-host-mounts', why: 'MANUAL: `node scripts/test-host-mounts.mjs <hostId> [publicHost]` — needs a real ssh host to mount from' },
  { name: 'test-host-mounts-tunnel', why: 'MANUAL: `node scripts/test-host-mounts-tunnel.mjs <hostId>` — needs a real ssh host for the tunnel leg' },
  { name: 'test-integration-toggle', why: 'RED on this checkout 2026-09-07 (6893ms) — fails "task-context delivers content while ON" (the server answers {"success":true,"context":""}). A debt WITH EVIDENCE, not a shrug: fix it, then move it into a tier' },
  { name: 'test-session-schema', why: 'chained by `npm run build` (the live-session `_field` registry)' },
  { name: 'test-stage-preview', why: 'CANNOT RUN on a shared machine (chrome, 7s) — it hard-codes PORT=3987 / CDP 9337 with no free-port fallback, so it fails "page threw: Error: no app" whenever anything else holds the port. Measured 2026-09-07: :3987 was held by an ORPHANED throwaway server from another checkout (pid 2840592, cwd /tmp/vs-boot-lex (deleted)) and the suite failed 3/3 while that process lived. A debt WITH EVIDENCE: adopt the freePort() helper test-client-boot already uses, then move it into a tier' },
  { name: 'test-sys-panel', why: 'RED on this checkout 2026-09-07 (15s) — chrome; fails "3 range chips". A debt WITH EVIDENCE, not a shrug: fix it, then move it into a tier' },
  { name: 'test-window-menu', why: 'RED on this checkout 2026-09-07 (chrome, ~4 min) — fails "menu has Rename" and "scope=all lists the non-overlapping terminal", then the harness itself throws (TypeError: reading \'click\' of undefined). NOTE: its first two runs died as "Command failed: npm run build" because it copies scripts/ onto a HEAD worktree and a build-time assert compared files it had not copied — that was OUR bug, fixed; this is the real failure. A debt WITH EVIDENCE: fix it, then move it into a tier' },
  { name: 'test-ws-contract', why: 'chained by `npm run build` (WS_CTX_CONTRACT ⇄ destructures ⇄ call site)' },
];

export const listSuiteFiles = (root = repo) =>
  fs.readdirSync(path.join(root, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f)).map((f) => f.replace(/\.mjs$/, '')).sort();

// PURE: the census over a name list (no I/O — test-architecture feeds it the
// same disk listing and asserts the same findings).
export function censusFindings(diskNames, suites = SUITES, excluded = EXCLUDED) {
  const disk = new Set(diskNames);
  const tierOf = new Map(), exclOf = new Map(), duplicated = [];
  for (const s of suites) { if (tierOf.has(s.name)) duplicated.push(s.name); tierOf.set(s.name, s.tier); }
  for (const e of excluded) { if (exclOf.has(e.name)) duplicated.push(e.name); exclOf.set(e.name, e.why); }
  return {
    counted: { fast: suites.filter((s) => s.tier === 'fast').length, heavy: suites.filter((s) => s.tier === 'heavy').length, excluded: excluded.length, disk: disk.size },
    unclassified: [...disk].filter((n) => !tierOf.has(n) && !exclOf.has(n)),
    inBoth: [...disk].filter((n) => tierOf.has(n) && exclOf.has(n)),
    duplicated,
    ghosts: [...new Set([...tierOf.keys(), ...exclOf.keys()])].filter((n) => !disk.has(n)),
    badTier: suites.filter((s) => s.tier !== 'fast' && s.tier !== 'heavy').map((s) => s.name),
    reasonless: [
      ...suites.filter((s) => s.tier === 'heavy' && !(s.why || '').trim()).map((s) => s.name),
      ...excluded.filter((e) => !(e.why || '').trim()).map((e) => e.name),
    ],
  };
}

// MACHINE-GLOBAL FIXTURES (2026-09-07 round 2). A suite that claims a name the
// whole BOX shares — a literal port it binds, a fixed /tmp path it creates,
// removes or checks a worktree into — cannot survive a second run of anything.
// In the heavy tier that is contained by the machine lock; in the FAST tier it
// is not, because the fast tier is fail-fast, has no retry and blocks the push
// directly, so one squatter from any of this box's ~160 checkouts turns a
// perfectly good push red. (Measured on the code this replaced: with a plain
// listener on :3991, the pre-fix test-attach-ack — which the fast tier reached
// through the launcher self-test's slice — hung 240 s to its budget; with the
// free port it passes in 2 s under the same squatter.) PURE so the rule can be
// asserted over every fast suite with the pre-fix shapes as negative controls.
//
// It is deliberately narrow: a port DERIVED from freePort()/env is not a claim,
// and a /tmp string that is only ever a fixture VALUE (a `cwd` inside a fake
// record) creates nothing. What counts is a literal that reaches an ACT.
const FIXTURE_ACTS = /(worktree|mkdirSync|mkdtempSync|rmSync|rmdirSync|unlinkSync|writeFileSync|symlinkSync|cpSync|createServer|\.listen\(|spawn|exec(?:Sync|File|FileSync)?\(|rm -rf|cp -r)/;

// A COMMENT BINDS NOTHING. Found the moment §6 first ran: the comment in
// test-ci-gate explaining "a verbatim `const PORT = 3991` control made the
// suite report itself" made the suite report itself. Line-wise on purpose —
// string state resets at every newline, so a regex literal carrying a quote
// (`/['"]/`) can at worst mis-scan its OWN line instead of eating the file;
// block-comment state is the only thing carried across lines.
function stripComments(src) {
  let inBlock = false;
  return src.split('\n').map((line) => {
    let out = '', quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i], n = line[i + 1];
      if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
      if (quote) { out += c; if (c === '\\') { out += n === undefined ? '' : n; i++; } else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; out += c; continue; }
      if (c === '/' && n === '/') break;
      if (c === '/' && n === '*') { inBlock = true; i++; continue; }
      out += c;
    }
    return out;
  }).join('\n');
}

export function machineGlobalFixtures(source) {
  const ports = new Set(), paths = new Set();
  const src = stripComments(source);
  const lines = src.split('\n');
  const port = (v) => { const n = Number(v); if (n > 0 && n <= 65535) ports.add(n); };
  // (a) a literal that IS the port: `const PORT = 3991`, `const TARGET_PORT =
  //     18941`, `.listen(3991`. Uppercase-only for the name form — a lowercase
  //     `port: 3456` passed to a factory binds nothing, and flagging it would
  //     buy an allowlist, which is where rules go to rot.
  for (const m of src.matchAll(/(?:(?:\b(?:const|let|var)\s+|,\s*)[A-Z0-9_]*PORT[A-Z0-9_]*\s*=\s*|\.listen\(\s*)(\d{2,5})\b/g)) port(m[1]);
  // (b) a literal BOUND TO A NAME that is later listened on / handed to a
  //     child as PORT (`const P = 3991` … `spawn(…, { PORT: String(P) })`).
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(\d{2,5})\b/g)) {
    const [, name, n] = m;
    const bound = new RegExp(`(?:\\.listen\\(\\s*|PORT\\s*:\\s*(?:String\\(\\s*)?)${name.replace(/\$/g, '\\$')}\\b`);
    if (bound.test(src)) port(n);
  }
  // (a) a complete /tmp literal used on a line that acts on the filesystem
  for (const line of lines) {
    for (const m of line.matchAll(/(['"`])(\/tmp\/[A-Za-z0-9._/-]+)\1/g)) {
      if (/^\s*\+/.test(line.slice(m.index + m[0].length))) continue; // concatenated with something unique
      if (FIXTURE_ACTS.test(line)) paths.add(m[2]);
    }
  }
  // (b) a complete /tmp literal BOUND TO A NAME whose name later reaches one
  //     (`const wt = '/tmp/vs-ack-smoke'` … `git worktree add ${wt}`)
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])(\/tmp\/[A-Za-z0-9._/-]+)\2/g)) {
    const [, name, , p] = m;
    const used = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
    if (lines.some((line) => used.test(line) && FIXTURE_ACTS.test(line))) paths.add(p);
  }
  return { ports: [...ports], paths: [...paths] };
}

// ── running one suite ────────────────────────────────────────────────────
// Headless-chrome suites boot a worktree server + a browser; on a box that is
// also running other agents' gates they legitimately take minutes (three
// load-only reds on 2026-09-06 at the flat 300s cap). A hang still fails —
// the budget is generous for the browser suites only, never removed. The
// heavy tier is unattended, so it can afford to wait longer than the fast one.
// A row may name its OWN budget (`budgetMs`) when its measured wall is known to exceed its class's — stated on the row,
// never a blanket raise (lane D (a), 2026-09-25: test-desktop-xpra-window measured 718–774 s before its §15/§16 legs).
const budgetFor = (s) => (Number(s.budgetMs) > 0 ? Number(s.budgetMs) : s.tier === 'fast' ? 300000 : /chrome/.test(s.why || '') ? 900000 : 600000);

// ONE runner for both tiers. `root` is the checkout the suite runs in — the
// repo for the fast tier and for a manual `npm run ci:heavy`, an isolated
// worktree at the pushed sha for a hook-launched heavy run (suites resolve
// their own repo root from their file location, so the WORKTREE's copy of the
// suite is what must be executed).
// A child that died on a SIGNAL somebody SENT to this run was killed from
// OUTSIDE — the launcher superseding our whole process group, an operator, or
// a supervisor shutting us down. That is not a fact about the code under test,
// and heavyGate uses it to refuse a verdict.
//
// SO THE SIGNAL LIST IS AN ALLOWLIST, NOT "ANY SIGNAL" (round 4 finding). A
// crash signal is a FACT ABOUT THE CODE UNDER TEST and must be RED — measured
// on this box, both of the ways a suite dies of memory look like a signal:
//   · a V8 heap-limit OOM   ⇒ {status:null, signal:'SIGABRT'}  (FATAL ERROR:
//     Reached heap limit — V8 calls abort() itself)
//   · the kernel OOM killer ⇒ {status:null, signal:'SIGKILL'}  (external
//     memory: RSS grows outside the heap cap and the kernel takes it)
//   · a native crash        ⇒ SIGSEGV / SIGBUS / SIGILL / SIGFPE
// Reading any of those as "somebody superseded us" made the tier ABANDON at
// that suite, skip every suite after it, write NO marker and exit 0 — so the
// Actions heavy job (whose signal IS the exit code, `--heavy --dirty-ok`)
// showed a GREEN tick for a tier that crashed and ran nothing else, and
// locally nothing blocked the next push. SIGKILL is deliberately on the RED
// side even though an operator's `kill -9` lands there too: the two are
// indistinguishable from here, and the costs are not symmetrical — a wrong RED
// blocks one push and is cleared by re-running `npm run ci:heavy`, a wrong
// "abandoned" is a silent green for a tier that never ran.
//
// Supersession sends SIGTERM (`process.kill(-pid, 'SIGTERM')` in heavyLaunch),
// Ctrl-C sends SIGINT and a lost terminal sends SIGHUP; those three are the
// whole outside set. Our OWN budget kill is excluded by name inside it:
// spawnSync reports ETIMEDOUT for that one (measured: {signal:'SIGTERM',
// error:{code:'ETIMEDOUT'}}), and a hung suite IS a red.
export const OUTSIDE_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];
export const killedFromOutside = (r) => !!(r && r.signal && OUTSIDE_SIGNALS.includes(r.signal) && !(r.error && r.error.code === 'ETIMEDOUT'));

// A SUITE THE GATED COMMIT DOES NOT CONTAIN IS AN ABSENCE, NOT A RED (round
// 6). Both tiers take the suite TABLE from the ci.mjs that is RUNNING and the
// suite SOURCES from the commit being gated, and those are two different
// commits whenever `--isolate --sha=<x>` is used (the fast tier's non-HEAD
// push, every heavy run). A name the running table has and the gated commit
// does not is not a failing suite — there is nothing there to fail. Before
// this, `node <scratch>/scripts/<name>.mjs` exited MODULE_NOT_FOUND ⇒ RED ⇒
// the push was hard-blocked, and the fast tier is fail-fast so it stopped
// there. Reproduced with the real module against real history: `--isolate
// --sha=<master's tip>` died on test-ci-gate ("Cannot find module
// /tmp/vs-ci-fast-5d54ffe5-861442/scripts/test-ci-gate.mjs") after 51 green
// suites, and 5d54ffe5 is missing exactly the 2 fast suites this branch adds —
// so once this gate is integrated, EVERY branch and tag that predates it is
// unpushable. Measured across this repository: master's tip 2 of 73 fast
// suites absent, master~300 42 of 73, the v2.30.0 tag all 73.
//   It is scoped to `absentIsSkip` (i.e. to an isolated run) ON PURPOSE: for an
// in-place run the table and the tree come from the same checkout, so a
// missing file means THIS tree disagrees with its own table — a red, and one
// `--census` already reports as a ghost inside `npm run build`.
// ── SCRATCH-ORPHAN REAPER (2.369.104) ─────────────────────────────────────────
// Every worktree server a suite boots spawns a DETACHED local device daemon
// (vibespace-device — setsid, by design: production's daemon must outlive a
// server restart) and usually wrapper/child node processes; a suite's teardown
// kills the server it spawned and nothing else. MEASURED on the dev box,
// 2026-09-16: 504 vibespace-device processes (34.8 GB RSS, up to 76 h old),
// 552 node processes under /tmp/vs-* scratch dirs and 2,137 orphaned
// `dtach -a` bridge clients — 86 GB used, load 15, the owner's display blank.
// EVIDENCE, NEVER A HEURISTIC: a process is a scratch orphan only when one of
// its ROOTS lies under a `/tmp/vs-<name>-<random>` scratch dir (the shape
// scripts/scratch.mjs mints; production is rooted in a checkout) AND either
// that scratch dir is GONE (the suite cleaned up and left the process behind)
// or every process rooted there is reparented (no live suite owns any of
// them) and older than the fixture stale floor. A ci.mjs runner is never a
// candidate (the isolated heavy tier lives in /tmp/vs-ci-heavy-* for its
// whole run), and a group with ANY live-parented member is left alone — that
// is a suite in flight, possibly another lane's.
// LANE H VERIFY r1 (2026-09-25): CANDIDACY IS EVIDENCE, NEVER A NAME. The
// sweep used to drop every process whose executable was not on REAP_NAMES
// BEFORE it looked at the evidence, so a leaked `agent-browser-linux-x64`
// daemon (its roots only in AGENT_BROWSER_SOCKET_DIR / _PROFILE / _CONFIG, its
// cwd a checkout) and a `headless_shell` (its root only in --user-data-dir)
// were invisible under a GONE scratch dir while `--reap` said "no scratch
// orphans" — the class that leaked 1045 daemons/Chromes (47 GB). Now: the
// roots are cwd, HOME, the device/agentd roots, the three agent-browser env
// names and a `--user-data-dir=` argv (a Chrome's cwd is inherited and is
// often `/` or a checkout); a GONE root lists every process rooted there that
// nobody alive outside the group owns, WHATEVER its name (a user's shell in a
// deleted dir, parented by its terminal, is owned and spared); the name
// allowlist below survives ONLY for the not-gone/stale rule, where the dir
// still exists and a name is the one extra fact that it is a suite's.
export const SCRATCH_ROOT_RE = /^\/tmp\/vs-[A-Za-z0-9._-]+/;
// LANE H VERIFY r2 (M2): THE PRODUCT'S OWN ROOT IS NEVER SCRATCH. src/browser-profiles.js socketDirDecision's
// long-home remedy is `<base>/vs-ab-<uid>` (`vs-ab-u` when the uid is unknown) under the LITERAL /tmp — the scratch
// shape exactly, and AGENT_BROWSER_SOCKET_DIR is a root, so a production daemon and its Chrome were candidates
// ('scratch dir gone' after a tmp cleaner, 'orphaned' by name when not). That exact shape is excluded here, and
// scripts/scratch.mjs refuses to mint it (`scratch('ab')`), so no suite can ever hide under it either.
export const PRODUCT_ROOT_RE = /^\/tmp\/vs-ab-(?:\d+|u)$/;
/** LANE H VERIFY r2 (L3): a Chrome that rewrote its process title has ONE space-joined /proc cmdline (a CfT build: no
 *  NUL at all, measured on this box) — the flag is read off the joined string too, both spellings. VERIFY r3 (MINOR 2):
 *  ONLY off such a cmdline — a NUL-separated argv is read exactly (the value is the whole element, a space in it
 *  included), and a flag merely MENTIONED inside another argument (a script's code, `sh -c '…'`) roots nothing. */
const UDD_JOINED_RE = /(?:^|\s)--user-data-dir(?:=|\s+)(\S+)/g;
// LANE N (2026-09-25, found on test-browser-resources: 140 live leftovers from 20 runs): A ROOT NAMED ONLY IN THE
// ARGUMENTS. A worktree server's terminal sessions run with the REAL HOME and cwd `/tmp`, so their scratch root appears
// nowhere but their arguments — `dtach -c /tmp/vs-browser-res-<pid>/wt/data/sockets/cw-…`, `node /tmp/vs-browser-res-<pid>/
// wt/data/bin/pty-wrapper.js …` — and they were never candidates. A root is taken where an argv element STARTS with the
// scratch shape or is a `<flag>=<scratch>` element (`--user-data-dir=…`, `-auth=…`); the product's own root is never one.
// Read like lane H's --user-data-dir (verify r3 MINOR 2, the integration of 2.369.180): a NUL-separated argv is read
// EXACTLY — a path merely MENTIONED inside another argument (`sh -c '… --user-data-dir=/tmp/vs-…'`) roots nothing — and
// only a title-rewritten cmdline (`joined`: ONE string, no NUL) is split on whitespace and read word by word.
// scratchRootsOf takes these AFTER cwd + ROOT_ENV + the --user-data-dir reading.
export function argvScratchRoots(argv = [], { joined = argv.length <= 1 } = {}) {
  const out = [];
  const take = (p) => { const r = SCRATCH_ROOT_RE.exec(p)[0]; if (!PRODUCT_ROOT_RE.test(r) && !out.includes(r)) out.push(r); };
  for (const a of argv) {
    const s = String(a || '');
    if (joined) { for (const tok of s.split(/\s+/)) for (const m of tok.matchAll(/(?:^|=)(\/tmp\/vs-[A-Za-z0-9._-]+)/g)) take(m[1]); }
    else { const m = /^(?:[^\s=]+=)?(\/tmp\/vs-[A-Za-z0-9._-]+)/.exec(s); if (m) take(m[1]); }
  }
  return out;
}
export const REAP_NAMES = new Set(['node', 'npm', 'claude', 'codex', 'opencode', 'Xvfb', 'Xvnc', 'Xtigervnc', 'x11vnc', 'xmessage', 'esbuild', 'dtach']); // Xtigervnc (lane N 2026-09-25, the heavy RED on 69720f2b): the singleton Desktop's X server by its own argv[0] (`Xvnc` is only Debian's symlink) — a leaked `Xtigervnc :7` under a GONE scratch dir held the machine-global :7/5901 for the next run to adopt (observed: cwd a deleted /tmp/vs-deskapp-smoke-*, adopted 40 s later by another run's server; test-ci-gate §9b)
/** The environment names that ROOT a process (besides its cwd and a Chrome's --user-data-dir). */
export const ROOT_ENV = ['HOME', 'VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT', 'AGENT_BROWSER_SOCKET_DIR', 'AGENT_BROWSER_PROFILE', 'AGENT_BROWSER_CONFIG'];
/** Every scratch root a process names, in order (cwd, ROOT_ENV, --user-data-dir), de-duplicated. `joined` = its /proc
 *  cmdline carried NO NUL (a title-rewritten process: the one string is scanned as words); default: a one-element argv. */
export function scratchRootsOf({ cwd = '', env = {}, argv = [], joined = argv.length <= 1 } = {}) {
  const cands = [cwd, ...ROOT_ENV.map((k) => env[k])];
  for (let j = 0; j < argv.length; j++) {
    const a = String(argv[j] || '');
    if (a.startsWith('--user-data-dir=')) cands.push(a.slice('--user-data-dir='.length));
    else if (a === '--user-data-dir' && j + 1 < argv.length) cands.push(argv[j + 1]);
  }
  if (joined) for (const m of argv.join(' ').matchAll(UDD_JOINED_RE)) cands.push(m[1]);
  cands.push(...argvScratchRoots(argv, { joined })); // lane N: a root named only in the arguments (dtach / pty-wrapper)
  const out = [];
  for (const c of cands) { const m = SCRATCH_ROOT_RE.exec(String(c || '')); if (m && !PRODUCT_ROOT_RE.test(m[0]) && !out.includes(m[0])) out.push(m[0]); }
  return out;
}
const reapNamed = (a0) => REAP_NAMES.has(a0) || a0.startsWith('vibespace-devic') || a0.startsWith('chrome');
// verify r2 L3: a process answers to its argv[0] (the first whitespace token — a title-rewritten Chrome's argv is one
// string) OR its /proc comm (/usr/bin/google-chrome's comm is `chrome`); never comm alone (the claude CLI's comm is its version)
const reapNamedProc = (i) => reapNamed(i.a0) || (!!i.comm && reapNamed(i.comm));
const REAP_STALE_MS = 10 * 60 * 1000; // = src/fixture-guard.js FIXTURE_STALE_MS (a run in flight is never older)
function procRead(procRoot, pid, f) { try { return fs.readFileSync(path.join(procRoot, String(pid), f)); } catch { return null; } }
function procInfo(procRoot, pid) {
  const stat = procRead(procRoot, pid, 'stat'); if (!stat) return null;
  const s = stat.toString('latin1'); const rp = s.lastIndexOf(')'); if (rp < 0) return null;
  const ppid = Number(s.slice(rp + 2).split(' ')[1]);
  const raw = (procRead(procRoot, pid, 'cmdline') || Buffer.alloc(0)).toString('utf8').replace(/\0+$/, '');
  const argv = raw.split('\0').filter((x, i) => i === 0 || x);
  const joined = !raw.includes('\0'); // verify r3: no NUL = a title-rewritten cmdline (read as words); else exact argv
  const first = argv[0] ? String(argv[0]).split(/\s+/)[0] : '';
  let comm = ''; const cb = procRead(procRoot, pid, 'comm'); if (cb) comm = cb.toString('utf8').trim();
  const a0 = first ? path.basename(first) : comm;
  let cwd = ''; try { cwd = fs.readlinkSync(path.join(procRoot, String(pid), 'cwd')); } catch { }
  const env = {}; const eb = procRead(procRoot, pid, 'environ');
  if (eb) for (const kv of eb.toString('utf8').split('\0')) { const i = kv.indexOf('='); if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1); }
  let bornMs = null; try { bornMs = fs.statSync(path.join(procRoot, String(pid))).mtimeMs; } catch { }
  return { pid, ppid, a0, comm, argv, joined, cwd, env, bornMs };
}
/** The orphans a sweep would reap: [{pid, name, root, why}]. PURE over a proc
 *  root (a test drives a fake one). `now`/`staleMs`/`exists` are parameters
 *  for the same reason. */
export function scratchOrphans({ procRoot = '/proc', now = Date.now(), staleMs = REAP_STALE_MS, exists = (d) => fs.existsSync(d), self = process.pid } = {}) {
  let pids = [];
  try { pids = fs.readdirSync(procRoot).filter((d) => /^\d+$/.test(d)).map(Number); } catch { return []; }
  const infos = new Map();
  for (const pid of pids) { const i = procInfo(procRoot, pid); if (i) infos.set(pid, i); }
  const systemd = new Set([1, ...[...infos.values()].filter((i) => i.a0 === 'systemd').map((i) => i.pid)]);
  const skip = new Set(); // this process and its ancestors
  for (let q = self; q && infos.has(q) && !skip.has(q); q = infos.get(q).ppid) skip.add(q);
  // a process's GROUP is its FIRST root in scratchRootsOf's order (cwd first, as
  // before — a daemon a heavy suite still has in flight under the isolated
  // worktree stays grouped there); existence is asked once per root
  const existsMemo = new Map();
  const isGone = (r) => { if (!existsMemo.has(r)) existsMemo.set(r, !!exists(r)); return !existsMemo.get(r); };
  const groups = new Map();
  for (const i of infos.values()) {
    if (skip.has(i.pid)) continue;
    if (i.argv.some((a) => /scripts\/ci\.mjs$/.test(a))) continue; // a gate runner, never a candidate
    const root = scratchRootsOf(i)[0]; if (!root) continue;
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  // verify r2 L7: the judgement runs to a FIXPOINT — a parent outside a group that is itself a victim of this sweep
  // (another gone root's orphan) owns nothing, so its children are listed in the SAME sweep, not the next one
  // verify r3 (LOW 4): bounded by the candidates, never a constant — every round that continues adds a victim, so a chain
  // of N gone groups needs N rounds (a cap of 8 listed 8 of a chain of 10 and left the rest for the next sweep)
  const victimPids = new Set();
  const maxRounds = [...groups.values()].reduce((n, m) => n + m.length, 0) + 1;
  let out = [];
  for (let round = 0; round < maxRounds; round++) {
    out = judgeGroups();
    const before = victimPids.size;
    for (const o of out) victimPids.add(o.pid);
    if (victimPids.size === before) break;
  }
  return out;
  function judgeGroups() {
  const out = [];
  for (const [root, members] of groups) {
    const gone = isGone(root);
    const inGroup = new Set(members.map((i) => i.pid));
    // a member is OWNED when walking its parents (through fellow members) reaches a
    // live process outside the group — a suite, a runner, this process, a user's
    // terminal; reaching systemd/init, a vanished pid or a victim of this very sweep means nobody owns it
    const orphaned = (i) => { let q = i; const seen = new Set(); while (q && !seen.has(q.pid)) { seen.add(q.pid); if (systemd.has(q.ppid)) return true; const p = infos.get(q.ppid); if (!p) return true; if (!inGroup.has(p.pid)) return victimPids.has(p.pid); q = p; } return true; };
    let victims = [], why = null;
    if (gone) {
      // the dir is gone: every member nobody alive outside the group owns, WHATEVER its name
      why = 'scratch dir gone';
      victims = members.filter(orphaned);
    } else {
      // the dir still exists: only when NO member is owned and all are stale — and then
      // only the executables a suite starts (the name is the one extra fact here)
      const live = members.some((i) => !orphaned(i));
      const ages = members.map((i) => (i.bornMs == null ? Infinity : now - i.bornMs));
      const oldEnough = Math.min(...ages) >= staleMs;
      if (!live && oldEnough) { why = `orphaned ${Math.round(Math.min(...ages) / 60000)} min (no live suite owns ${root})`; victims = members.filter(reapNamedProc); }
    }
    for (const i of victims) out.push({ pid: i.pid, name: i.a0, root, why, cmd: i.argv.slice(0, 3).join(' ').slice(0, 120), ppid: i.ppid });
  }
  return out;
  }
}
/** THE VICTIM LIST, ONE LINE PER PID (B-a965, 2026-09-24): a sweep that named only its
 *  roots left "22 roots / 34 processes" unattributable after a stray `ci.mjs --help`
 *  reaped a lane's detached servers under /tmp/vs-work. PURE over the list. */
export function reapReport(list) {
  const roots = [...new Set(list.map((o) => o.root))];
  const head = `[ci] reaping ${list.length} scratch orphan process(es) from ${roots.length} finished scratch dir(s): ${roots.slice(0, 4).join(' ')}${roots.length > 4 ? ' …' : ''}`;
  return [head, ...list.map((o) => `[ci]   pid ${o.pid} (ppid ${o.ppid}) ${o.name}: ${o.cmd || o.name} — root ${o.root} — ${o.why}`)];
}
/** SIGTERM, then SIGKILL the survivors after `graceMs`. Returns the list it acted on. */
export function reapScratchOrphans({ log = console.log, graceMs = 3000, ...opts } = {}) {
  const list = scratchOrphans(opts);
  if (!list.length) return list;
  for (const line of reapReport(list)) log(line);
  for (const o of list) { try { process.kill(o.pid, 'SIGTERM'); } catch { } }
  const until = Date.now() + graceMs;
  while (Date.now() < until && list.some((o) => alive(o.pid))) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  for (const o of list) { if (alive(o.pid)) { try { process.kill(o.pid, 'SIGKILL'); } catch { } } }
  return list;
}
// THE LANES' TWIN (2026-09-16, the 2.369.104 ↔ lanes integration). The sync
// reaper above waits its grace inside `Atomics.wait`, which is fine after a
// spawnSync suite but would freeze the async runner — and with it every other
// lane's completion — for up to 3 s per call. Same evidence, same kills, the
// grace awaited on the event loop instead. `scratchOrphans` already spares a
// sibling lane's suite in flight (its scratch dir exists and its server is a
// live child of this runner), so the sweep is safe to run mid-tier.
export async function reapScratchOrphansAsync({ log = console.log, graceMs = 3000, ...opts } = {}) {
  const list = scratchOrphans(opts);
  if (!list.length) return list;
  for (const line of reapReport(list)) log(line);
  for (const o of list) { try { process.kill(o.pid, 'SIGTERM'); } catch { } }
  const until = Date.now() + graceMs;
  while (Date.now() < until && list.some((o) => alive(o.pid))) await new Promise((r) => setTimeout(r, 100));
  for (const o of list) { if (alive(o.pid)) { try { process.kill(o.pid, 'SIGKILL'); } catch { } } }
  return list;
}

/** `--reap` BY HAND (lane H verify r1): the operator is shown EVERY victim — the
 *  per-pid report (pid, ppid, command head, root, the rule that fired) before the
 *  first SIGTERM, then a closing line naming any survivor. `--dry-run` prints the
 *  same report and signals nothing. */
export function reapByHand({ dryRun = false, log = console.log, ...opts } = {}) {
  if (dryRun) {
    const list = scratchOrphans(opts);
    if (!list.length) { log('[ci] no scratch orphans'); return 0; }
    for (const line of reapReport(list)) log(line);
    log(`[ci] --dry-run: ${list.length} process(es) listed above, none signalled`);
    return 0;
  }
  const list = reapScratchOrphans({ log, ...opts });
  if (!list.length) { log('[ci] no scratch orphans'); return 0; }
  const left = list.filter((o) => alive(o.pid));
  log(`[ci] reaped ${list.length - left.length} of ${list.length} scratch orphan process(es)${left.length ? ` — ${left.length} still alive after SIGKILL: ${left.map((o) => o.pid).join(' ')}` : ''}`);
  return 0;
}

function runSuite(s, { root = repo, absentIsSkip = false, sha = '' } = {}) {
  if (absentIsSkip && !fs.existsSync(path.join(root, 'scripts', s.name + '.mjs'))) {
    console.log(`  ⊘ ${s.name} — SKIPPED: not present at ${shortSha(sha)} (this gate's table names it; the commit being gated does not contain it, so this run says nothing about it)`);
    return { ok: true, ms: 0, absent: true };
  }
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', s.name + '.mjs')],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: budgetFor(s), encoding: 'utf-8', env: GIT_ENV });
  const ms = Date.now() - t;
  try { reapScratchOrphans({}); } catch (e) { console.log(`  · scratch reaper skipped: ${e && e.message}`); } // a suite may not leave a daemon behind (2.369.104)
  const stdout = r.stdout || '';
  if (r.status === 0) { console.log(`  ✓ ${s.name} (${ms}ms) — ${(stdout.trim().split('\n').pop() || 'ok').slice(0, 80)}`); return { ok: true, ms }; }
  console.log(`\n✗ ${s.name} FAILED (${ms}ms${r.error ? ', ' + r.error.code : ''}${r.signal ? ', ' + r.signal : ''})`);
  console.log(stdout.split('\n').slice(-40).join('\n'));
  console.log(r.stderr || '');
  return { ok: false, ms, killedFromOutside: killedFromOutside(r) };
}

// The ASYNC twin of runSuite for the lanes: same argv, same budget, same verdict
// shape ({ok, ms, killedFromOutside}) plus `lines` — the output is BUFFERED and
// printed when the suite completes, tagged with its lane, so N concurrent
// suites never interleave. A budget kill is spelled exactly as spawnSync spells
// it ({signal:'SIGTERM', error:{code:'ETIMEDOUT'}}) so killedFromOutside keeps
// telling our own kill from a supersede's. Resolves on 'exit' (+ a short grace
// for buffered output) rather than 'close': a suite that leaks a server holding
// our pipes would otherwise hold the lane until its budget.
function runSuiteAsync(s, { root = repo, absentIsSkip = false, sha = '', lane = 1, inflight = new Set() } = {}) {
  return new Promise((resolve) => {
    if (absentIsSkip && !fs.existsSync(path.join(root, 'scripts', s.name + '.mjs'))) {
      resolve({ ok: true, ms: 0, absent: true, lines: [`  ⊘ ${s.name} — SKIPPED: not present at ${shortSha(sha)} (this gate's table names it; the commit being gated does not contain it, so this run says nothing about it)`] });
      return;
    }
    const t = Date.now();
    const tag = `[lane ${lane}]`;
    let child;
    try {
      child = spawn(process.execPath, [path.join(root, 'scripts', s.name + '.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: GIT_ENV });
    } catch (e) {
      resolve({ ok: false, ms: 0, killedFromOutside: false, lines: [`\n✗ ${s.name} FAILED (0ms, ${e.code || e.message}) ${tag}`] });
      return;
    }
    inflight.add(child);
    let stdout = '', stderr = '', error = null, done = false;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const budget = setTimeout(() => { error = { code: 'ETIMEDOUT' }; try { child.kill('SIGTERM'); } catch { } }, budgetFor(s));
    child.on('error', (e) => { error = error || e; });
    const finish = (status, signal) => {
      if (done) return;
      done = true;
      clearTimeout(budget);
      inflight.delete(child);
      const ms = Date.now() - t;
      if (status === 0) { resolve({ ok: true, ms, lines: [`  ✓ ${s.name} (${ms}ms) ${tag} — ${(stdout.trim().split('\n').pop() || 'ok').slice(0, 80)}`] }); return; }
      const r = { status, signal, error };
      resolve({ ok: false, ms, killedFromOutside: killedFromOutside(r), lines: [
        `\n✗ ${s.name} FAILED (${ms}ms${error ? ', ' + error.code : ''}${signal ? ', ' + signal : ''}) ${tag}`,
        stdout.split('\n').slice(-40).join('\n'),
        stderr || ''] });
    };
    child.on('exit', (status, signal) => { setTimeout(() => finish(status, signal), 250); });
    child.on('close', (status, signal) => finish(status, signal));
  });
}

function runBuild({ cwd = repo, log = console.log } = {}) {
  const t = Date.now();
  const r = spawnSync('npm', ['run', 'build'], { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000, encoding: 'utf-8', env: GIT_ENV });
  const ms = Date.now() - t;
  if (r.status === 0) { log(`  ✓ npm run build (${ms}ms)`); return { ok: true, ms }; }
  log(`\n✗ npm run build FAILED (${ms}ms${r.signal ? ', ' + r.signal : ''})`);
  log((r.stdout || '').split('\n').slice(-40).join('\n'));
  log(r.stderr || '');
  return { ok: false, ms, killedFromOutside: killedFromOutside(r) };
}

// ── LANES (2026-09-15, owner: "heavy gate太占用时间了吧 不能优化一下") ──────
// MEASURED on data/ci-heavy/d0e7a8d4.log: 108 suites run STRICTLY SEQUENTIALLY
// = 2069 s (34.5 min) — writer-sweep 414 s, opencode-s9 226, desktop-resume-
// paging 225, desktop-app-keeper 104, queue-steer 87, restore-liveness 86,
// client-boot 72, jobs-engine 71 — on a 32-cpu box that sat mostly idle, after
// 40 min WAITING on the machine lock for a run nobody could ever push (see
// heavyLaunch). So the tier now runs over N worker LANES, LONGEST-FIRST from the
// previous markers' timings (a long tail scheduled last is the whole wall; with
// no measurement the table's cheap→expensive order is read backwards), and
// every suite that claims a machine-wide resource — the SERIAL rows below, plus
// anything machineGlobalFixtures flags — runs in ONE serial lane AFTER the
// parallel lanes drain, alone on the box, which is the load its budgets were
// measured under. N = clamp(cpus/8, 2, 4): a lane is a headless chrome + a
// worktree server + an esbuild, ~8 cpus of burst. Per-suite output is BUFFERED
// and printed in completion order tagged with its lane, so two suites never
// interleave a stack trace. The marker records lanes + every suite's timing.
export const FULL_EVERY_MS = 24 * 60 * 60 * 1000;
export const SERIAL = [
  { name: 'test-opencode-s9', why: 'a REAL `opencode serve` with its sqlite store, inotify watches, /proc runaway guard and store-watch lane — measured against a box with ONE serve, and the uid-wide inotify instance limit is what turned it into two 900 s timeouts on 2026-09-14' },
  // NOT here, measured (2026-09-15): test-writer-sweep (its scans are narrowed
  // to its own pids, and its ONE whole-box positive control only finds a holder
  // of ITS transcript), test-desktop-app-keeper and test-desktop-app-window
  // (X displays come from -displayfd, x11vnc ports from freePort, the /proc
  // census is keyed by the ids in each suite's OWN store, and the keeper suite
  // is written for two checkouts running it at once) — all three ran in the
  // parallel lanes with the rest; the serial lane was 444 s of a ~16 min tier
  // and moving them is what brought the wall under 15 min.
];
export function laneCount({ cpus = os.cpus().length, env = process.env } = {}) {
  const forced = Number(env.VIBESPACE_CI_LANES);
  if (Number.isInteger(forced) && forced >= 1) return forced;
  return Math.max(2, Math.min(4, Math.floor(cpus / 8)));
}
// PURE: split the tier into the parallel queue and the serial queue, each
// longest-first. `timings` = name→ms from the previous markers; a suite with no
// measurement keeps its TABLE position read backwards (the table is
// cheap→expensive, so "late in the table" is the next-best guess at "long").
// `keepOrder` (--only) runs the names exactly as given — the launcher self-test
// asserts which of two suites ran first.
export function scheduleLanes(suites, { timings = {}, serial = SERIAL, fixtures = machineGlobalFixtures, sourceOf = () => '', keepOrder = false } = {}) {
  const serialWhy = new Map(serial.map((s) => [s.name, s.why]));
  const parallel = [], serialQ = [];
  suites.forEach((s, idx) => {
    let why = serialWhy.get(s.name) || '';
    if (!why) {
      const f = fixtures(sourceOf(s.name) || '');
      if (f.ports.length || f.paths.length) why = `claims a machine-global fixture (${[...f.ports, ...f.paths].join(' ')})`;
    }
    const row = { ...s, idx, prevMs: typeof timings[s.name] === 'number' ? timings[s.name] : null };
    if (why) serialQ.push({ ...row, serialWhy: why }); else parallel.push(row);
  });
  const longestFirst = (a, b) => ((b.prevMs || 0) - (a.prevMs || 0)) || (b.idx - a.idx);
  if (!keepOrder) { parallel.sort(longestFirst); serialQ.sort(longestFirst); }
  return { parallel, serial: serialQ };
}
// name→ms from the newest markers that carry timings (newest wins per suite;
// an affected run only names the suites it ran, so several are read).
export function previousTimings(dir, depth = 6) {
  const out = {};
  for (const m of readMarkers(dir).filter((m) => (m.kind === 'green' || m.kind === 'red') && Array.isArray(m.timings)).slice(0, depth)) {
    for (const t of m.timings) if (t && t.name && typeof t.ms === 'number' && !(t.name in out)) out[t.name] = t.ms;
  }
  return out;
}

// ── IMPACT SCOPE (2026-09-15) ────────────────────────────────────────────────
// The push-time tier runs only the suites whose INPUTS the pushed range
// touches: the suite file plus everything it requires/imports transitively
// through the real graph (the walk test-architecture makes), plus the
// repo-relative files it names as fixtures, plus a declared `reads:` list per
// row where a path is built from segments, plus the product itself for a suite
// that BOOTS it (server.js / npm run build / a worktree) — and every row that
// says `always: true` (the restore/boot smokes). A dependency bump is a global
// input. A range whose files cannot be listed selects EVERYTHING and says why:
// "could not tell" must never read as "nothing changed" (the hook's round-4
// rule, one layer down). A FULL run is still owed once per 24 h — the launcher
// decides which to start (fullTierDue) and `ci:status` says which comes next.
const GLOBAL_INPUTS = ['package.json', 'package-lock.json'];
const BOOT_INPUTS = ['server.js', 'src/', 'public/', 'data/bin/'];
const BOOTS_THE_PRODUCT = /server\.js|npm run build|esbuild|worktree add|bundle\.js|scratchHome\(/;
// A repo-relative literal, with or without a leading '/' — `REPO + '/src/x.js'`
// spells the same file (2026-09-16: 9 heavy suites load their module that way
// and were selected by NOTHING when it changed — test-conversation-index,
// test-session-brain-dark, test-machine-probes, test-layout-history among them).
const LITERAL_INPUT = /(['"`])\/?((?:src|data\/bin|docs|public|scripts)\/[A-Za-z0-9._\/-]+|server\.js)\1/g;
// The concatenated LOADER shapes: require(REPO + '/src/x.js'), import(REPO +
// '/src/x.js'), require(`${REPO}/src/x.js`) — a load, so the file is WALKED
// and the selection says "loads", never "names".
const CONCAT_LOAD = /(?:require|import)\(\s*(?:[A-Za-z_$][\w$]*\s*\+\s*['"]\/((?:src|data\/bin|scripts)\/[A-Za-z0-9._\/-]+|server\.js)['"]|`\$\{[A-Za-z_$][\w$]*\}\/((?:src|data\/bin|scripts)\/[A-Za-z0-9._\/-]+|server\.js)`)\s*\)/g;
const specsOf = (src) => {
  const out = new Set();
  for (const m of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)) out.add(m[1]);
  // require.resolve('../src/x.js') (test-gmail-sync patches a copy of the
  // module it resolves) and createRequire(import.meta.url)('../src/x.js')
  // (test-model-fallback-notice) — both load the file, both were invisible
  for (const m of src.matchAll(/require\.resolve\(\s*['"]([^'"]+)['"]\s*\)/g)) out.add(m[1]);
  for (const m of src.matchAll(/createRequire\([^)]*\)\(\s*['"]([^'"]+)['"]\s*\)/g)) out.add(m[1]);
  for (const m of src.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/g)) out.add(m[1]);
  for (const m of src.matchAll(/(?:^|\n)\s*export\s[^;]*?from\s+['"]([^'"]+)['"]/g)) out.add(m[1]);
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.add(m[1]);
  for (const m of src.matchAll(/new URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url/g)) out.add(m[1]);
  return [...out];
};
function resolveLocal(fromRel, spec, root) {
  if (!spec.startsWith('.')) return null;
  const base = path.normalize(path.join(path.dirname(fromRel), spec)).replace(/\\/g, '/');
  for (const cand of [base, base + '.js', base + '.mjs', base + '.cjs', base + '.json', base + '/index.js']) {
    try { if (fs.statSync(path.join(root, cand)).isFile()) return cand; } catch { }
  }
  return null;
}
/** The files (exact) and prefixes (directories) a heavy suite's verdict depends on. */
export function suiteInputs(s, { root = repo } = {}) {
  const files = new Set(), prefixes = new Set(), seen = new Set();
  // HOW each input got in (the first reason wins), so a selection can say
  // "boots the product" instead of "reads src/lib/i18n-ja.js" for a suite that
  // never opens that file — the reason in the log is what a reader trusts.
  const via = new Map();
  const queue = [];
  const enq = (rel, how) => { if (!via.has(rel)) via.set(rel, how); queue.push(rel); };
  enq(`scripts/${s.name}.mjs`, 'suite');
  const readRel = (rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf-8'); } catch { return ''; } };
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel); files.add(rel);
    const text = readRel(rel);
    if (!text) continue;
    for (const spec of specsOf(text)) { const r = resolveLocal(rel, spec, root); if (r) enq(r, 'import'); }
    if (!rel.startsWith('scripts/')) continue;
    // a SUITE names its fixtures and `path.join(REPO, 'src/x.js')` modules as
    // repo-relative literals; a directory literal is a prefix, a file is walked
    for (const m of text.matchAll(CONCAT_LOAD)) enq(m[1] || m[2], 'import');
    for (const m of text.matchAll(LITERAL_INPUT)) {
      const p = m[2];
      try { const st = fs.statSync(path.join(root, p)); if (st.isDirectory()) { const d = p.replace(/\/?$/, '/'); prefixes.add(d); if (!via.has(d)) via.set(d, 'literal'); } else enq(p, 'literal'); } catch { /* names nothing on disk */ }
    }
    if (BOOTS_THE_PRODUCT.test(text)) for (const p of BOOT_INPUTS) { (p.endsWith('/') ? prefixes : files).add(p); if (!via.has(p)) via.set(p, 'boot'); }
  }
  for (const r of s.reads || []) { (r.endsWith('/') ? prefixes : files).add(r); if (!via.has(r)) via.set(r, 'reads'); }
  return { files, prefixes, via };
}
/** The sentence a selection prints: how `s` depends on the changed file `hit` (`p` = the directory prefix that matched, if any). */
const dependsHow = (kind, hit, p) => {
  if (p) return kind === 'boot' ? `boots the product (${hit} changed under ${p})` : kind === 'reads' ? `declares reads: ${p} (${hit} changed)` : `names ${p} (${hit} changed)`;
  return kind === 'suite' ? `is the suite file (${hit} changed)` : kind === 'import' ? `loads ${hit} (through its import graph)` : kind === 'boot' ? `boots the product (${hit} changed)` : kind === 'reads' ? `declares reads: ${hit}` : `names ${hit}`;
};
/** The files a range changed — `a..b` = `git diff a b`; a lone sha = its whole unpublished range. null = git could not answer. */
export function changedFiles(range, root = repo) {
  const m = /^(.+)\.\.(.+)$/.exec(range || '');
  const args = m ? ['diff', '--name-only', m[1], m[2]] : ['log', '--name-only', '--format=', range, '--not', '--remotes'];
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8', env: GIT_ENV, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return { files: null, error: ((r.stderr || '').trim().split('\n')[0] || `git exited ${r.status}`) };
  return { files: [...new Set((r.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean))] };
}
/** PURE over its inputs: which of `suites` the changed files select, and why each one.
 *  `root` = the tree whose SUITE SOURCES are read (the gated commit's checkout);
 *  `gitRoot` = the repository whose objects answer the range (defaults to root). */
export function affectedSuites({ range, suites, root = repo, gitRoot = root, changed } = {}) {
  const ch = Array.isArray(changed) ? { files: changed } : changedFiles(range, gitRoot);
  const why = new Map();
  const pick = (s, reason) => { if (!why.has(s.name)) why.set(s.name, reason); };
  if (ch.files === null) for (const s of suites) pick(s, `the changed files could not be listed (${ch.error}) — everything runs`);
  else {
    const global = ch.files.filter((f) => GLOBAL_INPUTS.includes(f));
    for (const s of suites) {
      if (s.always) { pick(s, 'always: true (a boot/restore smoke runs on every push)'); continue; }
      if (global.length) { pick(s, `${global[0]} changed (a global input — dependencies)`); continue; }
      const { files, prefixes, via } = suiteInputs(s, { root });
      for (const f of ch.files) {
        if (files.has(f)) { pick(s, dependsHow(via.get(f), f)); break; }
        const p = [...prefixes].find((pre) => f.startsWith(pre));
        if (p) { pick(s, dependsHow(via.get(p), f, p)); break; }
      }
    }
  }
  const selected = suites.filter((s) => why.has(s.name));
  const head = ch.files === null
    ? `[ci:heavy] impact scope ${range}: the changed files could not be listed (${ch.error}) — running EVERYTHING (could not tell ≠ nothing changed)`
    : `[ci:heavy] impact scope ${range}: ${ch.files.length} changed file(s) ⇒ ${selected.length} of ${suites.length} heavy suites${selected.length < suites.length ? ` (${suites.length - selected.length} unaffected: not run, not judged)` : ''}`;
  const summary = [head, ...selected.map((s) => `    · ${s.name} ← ${why.get(s.name)}`)].join('\n');
  return { selected, why, changed: ch.files, error: ch.error || null, summary };
}
/** Is a FULL heavy run owed? The 24 h safety net behind the affected tier is a
 *  full (not partial, not affected) green that JUDGED EVERY SUITE IT NAMED
 *  (`absent` empty — a full run at an old tag that skipped 108 of 110 suites
 *  judged two; 2026-09-16 verifier) and, when `sha` is given, lies on the SAME
 *  LINE OF HISTORY as the push (an ancestor or a descendant — markers are per
 *  checkout, so a green on an unrelated branch says nothing about this one).
 *  The newest such green must be younger than FULL_EVERY_MS. `sha` is optional
 *  on purpose: `ci:status` without --head asks only about age and completeness. */
export function fullTierDue(dir, now = Date.now(), { sha, repoRoot = repo } = {}) {
  const fulls = readMarkers(dir).filter((m) => m.kind === 'green' && !m.partial && m.scope !== 'affected');
  if (!fulls.length) return { due: true, why: 'no FULL green heavy run on record', newest: null, ageMs: null };
  let rejected = null;
  for (const m of fulls) {
    const ageMs = now - (m.endedAt || 0);
    const absent = (m.absent || []).length;
    if (absent) { rejected = rejected || { due: true, why: `the newest FULL green (${shortSha(m.sha)}) judged ${Math.max(0, (m.suites || 0) - absent)} of ${m.suites || '?'} suites (${absent} absent at that commit) — not a full verdict`, newest: m, ageMs }; continue; }
    if (sha && m.sha && !sameLineOfHistory(m.sha, sha, repoRoot)) { rejected = rejected || { due: true, why: `the newest FULL green (${shortSha(m.sha)}) is on another line of history (neither an ancestor nor a descendant of ${shortSha(sha)})`, newest: m, ageMs }; continue; }
    if (ageMs > FULL_EVERY_MS) return { due: true, why: `the newest FULL green (${shortSha(m.sha)}) is ${Math.round(ageMs / 3600000)} h old`, newest: m, ageMs };
    return { due: false, why: `a FULL green (${shortSha(m.sha)}) is ${Math.round(ageMs / 60000)} min old`, newest: m, ageMs };
  }
  return rejected;
}
/** Is `a` an ancestor or a descendant of `b` (or the same commit)? A commit the repository does not know is on no line of ours. */
const sameLineOfHistory = (a, b, root = repo) => {
  const isAnc = (x, y) => spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', x, y], { env: GIT_ENV }).status === 0;
  return isAnc(a, b) || isAnc(b, a);
};

// ── heavy-run markers (data/ci-heavy/<sha>.{green,red,pid,log}) ───────────
const markerDir = (dir) => dir || path.join(repo, 'data', 'ci-heavy');
const shortSha = (s) => String(s || '').slice(0, 8);

function readMarkers(dir) {
  const d = markerDir(dir);
  let files = [];
  try { files = fs.readdirSync(d); } catch { return []; }
  const out = [];
  for (const f of files) {
    const m = /^([0-9a-f]{7,40})\.(green|red|pid|skipped)$/.exec(f);
    if (!m) continue;
    let rec = {};
    try { rec = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch {}
    out.push({ ...rec, sha: rec.sha || m[1], kind: m[2], file: path.join(d, f) });
  }
  return out.sort((a, b) => (b.endedAt || b.startedAt || 0) - (a.endedAt || a.startedAt || 0));
}

const gitIn = (root, args) => {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8', env: GIT_ENV });
  return r.status === 0 ? (r.stdout || '').trim() : null;
};
const gitOut = (args) => gitIn(repo, args);
// EPERM means the process EXISTS and belongs to somebody else — the one answer
// this predicate must not report as "gone", because the caller's next move is
// to steal its lock or supersede its run.
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// PID IDENTITY. A pid outlives nothing and gets recycled; a stale pid file
// naming a reused number would either block every future launch ("already
// running") or make a lock unstealable. So a record that NAMED what it started
// must still name it — `cmd` is a fragment of the child's own argv, compared
// against /proc. A record that does not say (an older file, one written by
// hand in a test) is trusted as before: unknown is not the same as wrong.
const pidCmdline = (pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim(); } catch { return null; } };
function pidStillRunning(rec) {
  if (!rec || !rec.pid || !alive(rec.pid)) return false;
  if (!rec.cmd) return true;
  const cur = pidCmdline(rec.pid);
  if (cur === null) return true; // no /proc (or no permission): cannot tell ⇒ trust
  return cur.includes(rec.cmd);
}

// KILLING NEEDS POSITIVE EVIDENCE, READING DOES NOT. `pidStillRunning` trusts a
// record that does not name what it started, because the cost of being wrong is
// a launch we refuse. Superseding SIGTERMs a process GROUP, so the cost of
// being wrong there is somebody else's work — a recycled pid, or a pid file an
// older ci.mjs wrote without a `cmd`. So this asks /proc directly and answers
// NO when it cannot tell (no /proc, no permission): the run then simply queues
// on the machine lock, which is the correct outcome, just slower. This is the
// cli-identity rule in miniature — identify the process by what it IS running.
function looksLikeHeavyRun(pid) {
  const cur = pidCmdline(pid);
  if (cur === null) return false;
  // `--heavy` exactly, not `--heavy-launch`: the launcher is a short-lived
  // process that never appears in a pid file, and `\b` would match it.
  return /(^|[/\s])ci\.mjs(\s|$)/.test(cur) && /--heavy(\s|$)/.test(cur);
}

// A heavy run is IN FLIGHT when its pid file names a living process that is
// still the run it claims to be.
const inFlight = (dir) => readMarkers(dir).filter((m) => m.kind === 'pid' && m.pid && pidStillRunning(m));

// ── THE MACHINE LOCK ─────────────────────────────────────────────────────
// The heavy suites claim machine-global names (test-attach-ack USED to bind
// :3991 and check a worktree out at a fixed /tmp path it force-removed first —
// fixed at the source because it was the destructive one; three more suites
// still share that port and four share :3989, and the lock is what keeps THEM
// from meeting). Two heavy runs on one box therefore
// delete each other's checkouts and steal each other's ports, and the loser
// writes a RED that blocks the next push — a false verdict the retry-once
// absorber cannot rescue, because the competing run holds the fixture for its
// whole 16 minutes. The lock is per MACHINE (os.tmpdir()) and not per checkout
// because the resources are: this box hosts ~160 worktrees of this repository.
// Per uid, so two users never fight over one file they cannot unlink.
// The lock's PATH has to be a machine name, and `os.tmpdir()` is not one — it
// follows TMPDIR/TMP/TEMP, so two agents with different TMPDIRs would each take
// "the machine lock" and neither would wait. The resources being protected do
// not move with TMPDIR (a bound port is machine-global, and the /tmp checkouts
// the suites claim are literal `/tmp` strings), so the lock lives at literal
// /tmp wherever that exists, and falls back to os.tmpdir() only where it does
// not. Exported so the gate's own gate can prove TMPDIR does not move it.
export function machineTmpDir() {
  try { if (process.platform !== 'win32' && fs.statSync('/tmp').isDirectory()) return '/tmp'; } catch { }
  return os.tmpdir();
}
export const defaultLockPath = () => path.join(machineTmpDir(), `vibespace-ci-heavy-${typeof process.getuid === 'function' ? process.getuid() : 'u'}.lock`);
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

/**
 * Take the machine's heavy-tier lock, waiting up to `waitMs` for the current
 * holder. Returns {ok:true, release()} · {ok:false, timedOut, holder} · or
 * {ok:false, error} when a lock cannot be used at all (read-only tmp) — the
 * caller then runs UNLOCKED and says so in the marker, because a lock that
 * cannot be taken must never be able to stop the gate from running.
 */
function acquireMachineLock(lockPath, { waitMs, sha, onWait } = {}) {
  const deadline = Date.now() + Math.max(0, waitMs || 0);
  let announced = false;
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, sha, root: repo, cmd: 'ci.mjs', startedAt: Date.now() }) + '\n');
      fs.closeSync(fd);
      return {
        ok: true,
        path: lockPath,
        release() { const cur = readJson(lockPath); if (!cur || cur.pid === process.pid) { try { fs.unlinkSync(lockPath); } catch { } } },
      };
    } catch (e) {
      if (e.code !== 'EEXIST') return { ok: false, error: e };
      const holder = readJson(lockPath);
      // A holder that is gone (reboot, SIGKILL, recycled pid) leaves a file
      // behind; stealing it is the only way the tier ever runs again.
      if (!pidStillRunning(holder)) { try { fs.unlinkSync(lockPath); continue; } catch { /* someone else won the race — loop */ } }
      if (Date.now() >= deadline) return { ok: false, timedOut: true, holder };
      if (!announced && onWait) { announced = true; onWait(holder); }
      sleepSync(3000);
    }
  }
}

/**
 * THE BLOCK RULE. A red heavy marker blocks the next push when its commit is
 * an ancestor of HEAD (i.e. this branch is built ON TOP of a known-red commit)
 * and no green heavy run for a DESCENDANT of it exists. Markers for commits
 * this repository no longer knows (amended/rebased away) are ignored — they
 * describe a history nobody is pushing.
 *
 * `repoRoot` is a PARAMETER, not this file's location: the ancestry question
 * belongs to whichever repository is being pushed (scripts/test-ci-gate.mjs
 * asks it of a throwaway repo with real commits — a rule about git history has
 * to be tested against real git history).
 */
export function heavyBlocker({ dir, head, repoRoot = repo } = {}) {
  const HEAD = head || gitIn(repoRoot, ['rev-parse', 'HEAD']);
  if (!HEAD) return null;
  const exists = (sha) => gitIn(repoRoot, ['cat-file', '-e', sha + '^{commit}']) !== null;
  const isAncestor = (a, b) => spawnSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', a, b], { env: GIT_ENV }).status === 0;
  const all = readMarkers(dir);
  const reds = all.filter((m) => m.kind === 'red' && exists(m.sha));
  // A PARTIAL green (`--only=…`) is not evidence that the tier passed, so it
  // can never clear a block — otherwise re-running one suite would unlock a
  // commit the rest of the tier never saw. A partial RED still blocks: a suite
  // really did fail on that commit.
  const greens = all.filter((m) => m.kind === 'green' && !m.partial && exists(m.sha));
  // An AFFECTED green (2026-09-15) is green for ITS push only: it clears a red
  // only when every suite that failed there was in the set it actually ran. A
  // red of either scope blocks alike.
  const coversRed = (g, red) => g.scope !== 'affected' || (red.failed || []).every((f) => Array.isArray(g.selected) && g.selected.includes(f));
  for (const red of reds) {
    if (!isAncestor(red.sha, HEAD)) continue;
    const cleared = greens.some((g) => g.sha !== red.sha && isAncestor(red.sha, g.sha) && isAncestor(g.sha, HEAD) && coversRed(g, red));
    if (!cleared) return red;
  }
  return null;
}

// Keep the last N results (with their logs). A red older than that stops
// blocking — deliberate: 30 heavy runs is far past the point where "fix it or
// bypass it" was the honest answer, and an unbounded directory of 10-minute
// logs is its own problem.
function pruneMarkers(dir, keep = 30) {
  const d = markerDir(dir);
  const results = readMarkers(dir).filter((m) => m.kind !== 'pid');
  for (const m of results.slice(keep)) {
    for (const ext of ['green', 'red', 'skipped', 'log', 'pid']) { try { fs.unlinkSync(path.join(d, `${m.sha}.${ext}`)); } catch {} }
  }
}

// ── the scratch worktree, ONE implementation for both tiers ──────────────
// The working tree keeps moving under a run, and a verdict that NAMES a sha
// has to have tested that sha. The heavy tier has always run this way; the
// fast tier does it when a pushed ref's tip is not the commit you have checked
// out (round 5). Also keeps the #127 law: never run server.js against the
// repo's PRODUCTION data/. The name carries the pid, so `scripts/dbg-ci-
// mutations.mjs --reap-only` can tell a live run's scratch from litter, and a
// previous run that was SIGKILLed leaves a registration behind — prune before
// adding so `git worktree list` stays honest.
function addScratchWorktree(sha, tag) {
  spawnSync('git', ['-C', repo, 'worktree', 'prune'], { env: GIT_ENV });
  const wt = path.join(os.tmpdir(), `vs-ci-${tag}-${shortSha(sha)}-${process.pid}`);
  const add = spawnSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, sha], { encoding: 'utf-8', env: GIT_ENV });
  if (add.status !== 0) throw new Error(`git worktree add failed: ${(add.stderr || '').trim()}`);
  try { fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules')); } catch {}
  return wt;
}
function removeScratchWorktree(wt) {
  try { spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { env: GIT_ENV }); } catch {}
  try { fs.rmSync(wt, { recursive: true, force: true }); } catch {}
  try { spawnSync('git', ['-C', repo, 'worktree', 'prune'], { env: GIT_ENV }); } catch {}
}

// ── modes ────────────────────────────────────────────────────────────────
/**
 * THE FAST TIER. `isolate` runs it in a scratch worktree at `sha` instead of
 * against this working tree — INVARIANT ⑭ ("the verdict is about the refs
 * being PUSHED") reaching the last place in the hook that had not heard it.
 * Reproduced before the fix: standing on `main` and pushing a branch whose tip
 * adds src/broken.js, the tier ran in a tree that did not contain that file
 * and printed ALL GREEN. The closing line now NAMES its subject either way, so
 * "ALL GREEN" can never again be a sentence about a tree nobody is publishing.
 */
function fastGate({ sha: wantSha, isolate } = {}) {
  const t0 = Date.now();
  const fast = SUITES.filter((s) => s.tier === 'fast');
  const sha = wantSha || gitOut(['rev-parse', 'HEAD']);
  let runRoot = repo, wt = null, cleaned = false;
  const cleanup = () => { if (cleaned || !wt) return; cleaned = true; removeScratchWorktree(wt); };
  // A killed run must not leave a checkout in /tmp and a registration `git
  // worktree prune` can never remove (⑯). `finally` covers the ordinary exits
  // below; these cover the Ctrl-C a person aims at a push. Deliberately NOT
  // heavyGate's `for (const sig of ['SIGTERM', …]) {` spelling — one set, one
  // name (OUTSIDE_SIGNALS), and the two mutation anchors stay distinct.
  if (isolate) for (const sig of OUTSIDE_SIGNALS) process.on(sig, () => { console.error(`\n[ci] ${sig} — cleaning up the scratch worktree for ${shortSha(sha)}`); cleanup(); process.exit(143); });
  try {
    if (isolate) { wt = addScratchWorktree(sha, 'fast'); runRoot = wt; }
    console.log(`release gate — FAST tier: build + ${fast.length} suites (heavy tier: ${SUITES.filter((s) => s.tier === 'heavy').length} suites, runs after the push)${isolate ? ` — ISOLATED worktree at ${shortSha(sha)}` : ''}`);
    if (!runBuild({ cwd: runRoot }).ok) { console.error('\n✗ build FAILED — release gate is RED, do not push\n'); return 1; }
    const absent = [];
    for (const s of fast) {
      const r = runSuite(s, { root: runRoot, absentIsSkip: !!isolate, sha });
      if (r.absent) { absent.push(s.name); continue; }
      if (!r.ok) { console.error(`\n✗ ${s.name} — release gate is RED, do not push\n`); return 1; }
    }
    // NOTHING RAN IS NOT A PASS. An old tag or a commit that predates the gate
    // contains none of these suites (measured: v2.30.0 ⇒ 73 of 73 absent), and
    // "ALL GREEN" for a run of zero suites is the vacuous green the `--only`
    // typo guard already refuses elsewhere. It does NOT block the push — an
    // absence is not evidence of breakage, and blocking every old ref is the
    // defect this round is fixing — it just refuses to claim anything.
    if (absent.length === fast.length) {
      console.log(`\nNO VERDICT — the fast tier could not gate ${shortSha(sha)}: none of its ${fast.length} suites exist at that commit (an old tag, or a commit that predates them). Nothing ran, so nothing is claimed; the push is not blocked by an absence.`);
      return 0;
    }
    const ran = fast.length - absent.length;
    const subject = isolate ? `for ${shortSha(sha)} (isolated worktree at the commit being pushed)` : '(this working tree)';
    console.log(`\nALL GREEN — fast gate passed in ${Math.round((Date.now() - t0) / 1000)}s ${subject}${absent.length ? ` — ${ran} of ${fast.length} suites ran; ${absent.length} not present at that commit` : ''}`);
    if (absent.length) console.log(`[ci] SKIPPED (absent at ${shortSha(sha)}, not run and not judged): ${absent.join(', ')}`);
    // The marker's contract is "HEAD, clean, passed", so an isolated run at
    // some other commit must not write one — it proves nothing about the tree
    // the next push would skip the tier for (⑫: say so, do not go quiet).
    if (isolate) console.log(`[ci] green marker not written: this run gated ${shortSha(sha)} in a scratch worktree, not the tree you have checked out`);
    else writeGreenMarker();
    return 0;
  } finally { cleanup(); }
}

// GREEN MARKER (2.369.51): the pre-push hook accepts a fresh marker for the
// EXACT tree instead of re-running the gate inside the SSH session (GitHub
// closes an idle connection before a long gate finishes). Only a CLEAN tree
// earns the marker — the sha must describe what was tested.
function writeGreenMarker() {
  try {
    const dirty = gitOut(['status', '--porcelain']);
    if (dirty === null) { console.log('[ci] green marker not written: git could not read this tree'); return; }
    if (dirty) { console.log('[ci] tree is dirty — no green marker (commit first, then re-run the gate)'); return; }
    const sha = gitOut(['rev-parse', 'HEAD']);
    const gitDir = gitOut(['rev-parse', '--git-dir']);
    if (!sha || !gitDir) { console.log('[ci] green marker not written: git could not name HEAD'); return; }
    fs.writeFileSync(path.resolve(repo, gitDir, 'ci-green'), `${sha} ${Date.now()}\n`);
    console.log(`[ci] green marker written for ${shortSha(sha)} — a push of this exact tree within 60 min skips the in-hook run`);
  } catch (e) { console.log('[ci] green marker not written: ' + e.message); }
}

async function heavyGate({ sha: wantSha, isolate, dir, only, dirtyOk, lock, lockWaitMs, pidFile, range }) {
  const t0 = Date.now();
  const all = SUITES.filter((s) => s.tier === 'heavy');
  // `--only=a,b` re-runs part of the tier (after a fix, or from the self-test).
  // An unknown name is LOUD: silently running zero suites and stamping a green
  // marker is the worst possible outcome of a typo.
  let heavy = only ? only.map((n) => {
    const hit = all.find((s) => s.name === n);
    if (!hit) { console.error(`✗ --only: '${n}' is not a heavy suite`); process.exit(2); }
    return hit;
  }) : all;
  const sha = wantSha || gitOut(['rev-parse', 'HEAD']);
  const d = markerDir(dir);
  // IMPACT SCOPE (--affected --range): the suites the range touches, printed
  // with a reason per suite before a build is spent. THE GRAPH IS THE GATED
  // COMMIT'S, NOT THIS CHECKOUT'S (2026-09-16, verifier): the selection used
  // to be made here, against the working tree — so a push from another
  // checkout (a flow the hook explicitly keeps working) or a tree that had
  // moved on read the wrong import graph. Reproduced on a stub: master checked
  // out (test-x imports src/a.js), branch feat rewires test-x to src/b.js in
  // c1 and changes src/b.js in c2 ⇒ affectedSuites(c1..c2) from the checkout
  // selected NOTHING. So the selection is made INSIDE the try, after the
  // scratch worktree exists, from the suite sources AT the sha (`root:
  // runRoot`) while the range is still answered by this repository's objects
  // (`gitRoot: repo`). A selection that turns out to be the whole tier IS a
  // full run.
  let scope = 'full', impact = null;
  const scoped = !!(range && !only);
  // REFUSE UP FRONT, NOT AT THE END. This decision is made at t=0 and it
  // decides whether the run can produce a verdict at all; announcing it after
  // sixteen minutes — under a closing line that said GREEN — cost a blocked
  // developer the whole tier and left them just as blocked (round 2 finding).
  // `npm run ci:heavy` now passes --isolate, so the command a blocked push is
  // told to run always earns a marker; --dirty-ok is the deliberate "run it
  // against my working tree, I know there will be no verdict".
  const dirtyAtStart = isolate ? '' : gitOut(['status', '--porcelain']);
  if (dirtyAtStart && !dirtyOk) {
    console.error('\n[ci:heavy] REFUSED — this tree is DIRTY, so a marker for ' + shortSha(sha) + ' would not describe what ran.');
    console.error('  Commit first, or:');
    console.error('    npm run ci:heavy               runs the tier in an isolated worktree at HEAD (writes the marker)');
    console.error('    node scripts/ci.mjs --heavy --dirty-ok   runs it against this tree, NO verdict written\n');
    return 2;
  }
  let runRoot = repo, wt = null;
  console.log(`release gate — HEAVY tier${scoped ? '' : `: ${heavy.length} suites`} for ${shortSha(sha)}${isolate ? ' (isolated worktree)' : ''}${scoped ? ` — impact scope ${range}: the suites are selected from the sources AT ${shortSha(sha)}, after checkout` : ''}`);
  if (dirtyAtStart) console.log('[ci:heavy] --dirty-ok: this tree is dirty ⇒ NO VERDICT will be written for ' + shortSha(sha) + ' (said now, not in sixteen minutes)');

  // ONE HEAVY TIER PER MACHINE. Wait for our turn before spending a build.
  const lockPath = lock || defaultLockPath();
  const waitMs = lockWaitMs === undefined ? 40 * 60 * 1000 : lockWaitMs;
  const held = acquireMachineLock(lockPath, {
    waitMs, sha,
    onWait: (h) => console.log(`[ci:heavy] another heavy run holds ${lockPath} (pid ${h && h.pid}, ${h && h.sha ? shortSha(h.sha) : '?'}) — waiting up to ${Math.round(waitMs / 60000)} min for the machine (the suites share ports and /tmp checkouts)`),
  });
  if (!held.ok && held.timedOut) {
    // NOT a verdict. Nothing ran, so nothing is claimed — the note exists so
    // `ci:status` can say "this commit has no heavy run" out loud instead of
    // looking identical to "nobody has pushed lately".
    try {
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, `${sha}.skipped`), JSON.stringify({ sha, result: 'skipped', reason: 'machine lock held by another heavy run', holder: held.holder || null, endedAt: Date.now(), ms: Date.now() - t0 }, null, 2) + '\n');
    } catch { }
    console.error(`\nHEAVY TIER SKIPPED for ${shortSha(sha)} — never got the machine lock (${lockPath}) within ${Math.round(waitMs / 60000)} min. NO VERDICT WRITTEN.`);
    return 3;
  }
  if (!held.ok) console.log(`[ci:heavy] running WITHOUT the machine lock (${held.error && held.error.code}) — the marker will say so`);

  // CLEAN UP EVEN WHEN WE ARE KILLED. A heavy run is now SUPERSEDED by the
  // next push (the launcher SIGTERMs it), and node's default SIGTERM does not
  // run `finally` — so without this the killed run leaves a full checkout in
  // /tmp, a registration in `git worktree list` that `worktree prune` will
  // never remove (the directory still exists), and the machine lock held
  // until its pid is reaped. Idempotent: the finally calls the same function.
  // A SIGNAL HANDLER CANNOT PREEMPT A SYNCHRONOUS RUN — so the abort is also a
  // synchronous QUESTION, asked between suites. Found by mutation-testing the
  // handler above with a kill that lands after `git worktree add` (the earlier
  // timing was measuring git's own cleanup): heavyGate is spawnSync from top to
  // bottom, so a SIGTERM delivered mid-build is queued on the event loop and
  // cannot run until the whole tier has finished — the superseded run kept
  // going and then stamped a marker whose build had been KILLED, i.e. a RED for
  // the exact commit the newer run replaced. That is the false-red this round
  // exists to remove, reintroduced by the fix for it.
  //
  // Two independent pieces of evidence, both synchronous and both read at the
  // moment they matter: our pid file was removed (the superseding launcher
  // unlinks it), or the machine lock is no longer ours (somebody judged us dead
  // and stole it). The pid-file check ARMS on first sight rather than at
  // startup, because the launcher writes that file just after spawning us and
  // a run that never had one (a manual `ci:heavy`) must never trip it.
  // The pid file is passed IN (`--pid-file`), never inferred: a check that
  // armed itself the first time it happened to SEE the file could not fire at
  // all if the supersede landed before its first look, and `abandoned()` is
  // only consulted a handful of times. Being TOLD "you have one" makes its
  // absence unambiguous. The launcher writes it BEFORE spawning (with pid 0,
  // rewritten once the pid exists) so the reverse race cannot happen either.
  let signalled = '';
  const noteChildResult = (r) => { if (r && r.killedFromOutside && !signalled) signalled = 'this run was terminated from outside (a child died on a signal we did not send)'; return r; };
  const abandoned = () => {
    if (signalled) return signalled;
    if (pidFile && !fs.existsSync(pidFile)) return 'superseded by a newer push (our pid file was removed)';
    if (held.ok) { const cur = readJson(lockPath); if (!cur || cur.pid !== process.pid) return 'the machine lock was taken from us (we were judged dead)'; }
    return '';
  };

  // The suites in flight on the lanes: a signal handler (below) and an abort
  // noticed by any lane SIGTERM them so the run ends now rather than at the
  // slowest child's budget.
  const inflight = new Set();
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    for (const c of inflight) { try { c.kill('SIGTERM'); } catch { } }
    if (held.ok) held.release();
    try { fs.unlinkSync(pidFile || path.join(d, `${sha}.pid`)); } catch {}
    if (wt) removeScratchWorktree(wt);
  };
  // A SIGNAL ENDS THE RUN, IT DOES NOT PREEMPT IT (2026-09-15, the lanes made
  // this reachable: with spawnSync the handler could only ever run after the
  // whole tier). The suites in flight are SIGTERMed (SIGKILL 10 s later for
  // one that ignores it), the lanes stop at their next synchronous question,
  // the closing line says ABORTED / NO VERDICT and `finally` cleans up — the
  // same exit as a supersede noticed by the pid file. Only a run still alive
  // 30 s after the signal is forced out (cleanup first).
  for (const sig of OUTSIDE_SIGNALS) {
    process.on(sig, () => {
      console.error(`\n[ci:heavy] ${sig} — superseded or cancelled; stopping the suites in flight, NO verdict will be written for ${shortSha(sha)}`);
      signalled = signalled || `this run was terminated from outside (${sig})`;
      for (const c of inflight) { try { c.kill('SIGTERM'); } catch { } }
      setTimeout(() => { for (const c of inflight) { try { c.kill('SIGKILL'); } catch { } } }, 10000).unref();
      setTimeout(() => { console.error('[ci:heavy] still running 30 s after the signal — forcing exit'); cleanup(); process.exit(143); }, 30000).unref();
    });
  }
  try {
    if (isolate) {
      // The working tree keeps moving while a ten-minute run is in flight, so
      // a marker that NAMES a sha has to have tested that sha (see
      // addScratchWorktree — ONE implementation, shared with the fast tier).
      wt = addScratchWorktree(sha, 'heavy');
      runRoot = wt;
    }
    if (scoped) {
      // …from the tree that RUNS (see the IMPACT SCOPE note above): the
      // scratch worktree at the sha, or — without --isolate — this checkout,
      // which is then the tree the suites execute in (a clean HEAD, or a
      // --dirty-ok run that earns no verdict anyway).
      impact = affectedSuites({ range, suites: all, root: runRoot, gitRoot: repo });
      heavy = impact.selected;
      if (heavy.length < all.length) scope = 'affected';
      console.log(`[ci:heavy] ${heavy.length} suites for ${shortSha(sha)}${scope === 'affected' ? ` — AFFECTED scope (${all.length - heavy.length} of ${all.length} unaffected by ${range})` : ` — the selection is the whole tier (a FULL run)`}`);
      console.log(impact.summary);
    }
    // Ask BEFORE the build too: a signal that landed during `git worktree add`
    // is only noticed here, and a build for a run that is already over is
    // the round-2 supersede cost one step earlier.
    let abandonedWhy = abandoned();
    const build = abandonedWhy ? { ok: false } : noteChildResult(runBuild({ cwd: runRoot }));
    const failed = [], flaky = [], timings = [], absent = [];
    let laneN = 0, serialNames = [];
    // The build is the first thing a supersede kill lands on, so ask before
    // believing its failure — and before spending the rest of the tier.
    abandonedWhy = abandonedWhy || abandoned();
    // Say it wherever it is first noticed — the abort can be true before the
    // suite loop is ever entered (a supersede that lands during the build),
    // and a run that goes quiet is the thing this whole round is against.
    if (abandonedWhy) console.log(`\n[ci:heavy] stopping: ${abandonedWhy}`);
    // ONE lane = one worker pulling from a queue. The abort is still a
    // synchronous QUESTION asked between suites — at every lane's loop top and
    // again before a retry — and the first lane to hear "yes" says so ONCE and
    // SIGTERMs the suites the other lanes still have in flight.
    let stopSaid = false;
    const stop = (why) => {
      if (stopSaid) return;
      stopSaid = true;
      console.log(`\n[ci:heavy] stopping: ${why}`);
      for (const c of inflight) { try { c.kill('SIGTERM'); } catch { } }
    };
    const laneWorker = async (queue, lane) => {
      for (;;) {
        abandonedWhy = abandonedWhy || abandoned();
        if (abandonedWhy) { stop(abandonedWhy); break; }
        const s = queue.shift();
        if (!s) break;
        let r = noteChildResult(await runSuiteAsync(s, { root: runRoot, absentIsSkip: !!isolate, sha, lane, inflight }));
        console.log(r.lines.join('\n'));
        // a suite may not leave a daemon behind (2.369.104) — the lanes sweep
        // after every suite exactly as the sync runner does, without blocking
        try { await reapScratchOrphansAsync({}); } catch (e) { console.log(`  · scratch reaper skipped: ${e && e.message}`); }
        // Absent at the commit being gated (round 6): not run, not judged, and
        // not counted in `timings` — a marker that named 97 suites when 42 of
        // them do not exist at that sha is a claim nobody made.
        if (r.absent) { absent.push(s.name); continue; }
        if (!r.ok) {
          // …BUT NEVER RETRY A SUITE WE OURSELVES KILLED. Supersession SIGTERMs
          // the process GROUP, so the suite in flight dies with the runner's
          // own kill — and `noteChildResult` has just recorded that. Asking
          // `abandoned()` at the loop top only is not enough: the answer
          // becomes true HERE, one line before the most expensive thing the
          // tier does. Measured in a throwaway repo (a 90 s heavy stub,
          // superseded 6 s in): the superseded run spent the whole retry while
          // still HOLDING the machine lock, and the newer run sat in "waiting
          // up to 40 min for the machine" — the exact opposite of the reason
          // supersession kills instead of queueing (round 2 ①a). Retry-once
          // exists for a flaky FIXTURE (another checkout squatting :3987), and
          // its answer here is discarded anyway: this run writes no verdict.
          abandonedWhy = abandoned();
          if (abandonedWhy) { console.log(`\n[ci:heavy] stopping: ${abandonedWhy}`); break; }
          // RETRY ONCE. This tier's verdict BLOCKS the next push, and many of
          // these suites hard-code a port or a /tmp path — on a machine that
          // hosts several checkouts, one of them squatting :3987 is not a
          // regression in the code being pushed. A suite that fails and then
          // passes is recorded as FLAKY, not red: it does not block, and both
          // outcomes are in the log and in the marker, so the flakiness is
          // visible instead of being laundered into a green.
          console.log(`  … ${s.name} failed — retrying once before calling it red`);
          const again = noteChildResult(await runSuiteAsync(s, { root: runRoot, lane, inflight }));
          console.log(again.lines.join('\n'));
          if (again.ok) { flaky.push(s.name); r = again; } else { failed.push(s.name); }
        }
        timings.push({ name: s.name, ms: r.ms, ok: r.ok, lane: String(lane) });
      }
    };
    if (!build.ok && !abandonedWhy) failed.push('npm run build');
    else if (!abandonedWhy) {
      laneN = laneCount();
      const sourceOf = (name) => { try { return fs.readFileSync(path.join(runRoot, 'scripts', name + '.mjs'), 'utf-8'); } catch { return ''; } };
      const plan = scheduleLanes(heavy, { timings: previousTimings(dir), sourceOf, keepOrder: !!only });
      serialNames = plan.serial.map((s) => s.name);
      console.log(`[ci:heavy] ${laneN} parallel lane(s) over ${plan.parallel.length} suites (longest first), then 1 serial lane over ${plan.serial.length}${plan.serial.length ? ': ' + plan.serial.map((s) => `${s.name} (${s.serialWhy.split(/[—;]/)[0].trim()})`).join(', ') : ''}`);
      const parallelQ = [...plan.parallel];
      const tPar = Date.now();
      await Promise.all(Array.from({ length: Math.max(1, Math.min(laneN, parallelQ.length)) }, (_, i) => laneWorker(parallelQ, i + 1)));
      const parMs = Date.now() - tPar;
      if (plan.serial.length && !abandonedWhy) {
        console.log(`[ci:heavy] parallel lanes drained in ${Math.round(parMs / 1000)}s — serial lane: ${plan.serial.map((s) => s.name).join(', ')}`);
        await laneWorker([...plan.serial], 'S');
      }
      const sum = timings.reduce((a, t) => a + t.ms, 0);
      if (!abandonedWhy) console.log(`[ci:heavy] lanes: ${laneN} parallel (${Math.round(parMs / 1000)}s) + serial (${Math.round((Date.now() - tPar - parMs) / 1000)}s); suites summed ${Math.round(sum / 1000)}s = what a sequential tier would have taken`);
    }
    const rec = {
      sha, result: failed.length ? 'red' : 'green', failed,
      flaky: flaky.length ? flaky : undefined,
      startedAt: t0, endedAt: Date.now(), ms: Date.now() - t0,
      suites: heavy.length, isolated: !!isolate, host: os.hostname(),
      // The suites this gate's table names that the gated COMMIT does not
      // contain: not run, not judged. Named in the marker so `ci:status` and
      // the Diagnostics report can say what the verdict is about rather than
      // implying all `suites` of them ran.
      absent: absent.length ? absent : undefined,
      partial: only ? only.slice() : undefined,
      unlocked: held.ok ? undefined : true,
      // 2026-09-15: the scope ('full' | 'affected'), what selected it, the lane
      // count, which suites ran serially, and EVERY suite's timing (the next
      // run's longest-first schedule reads them; ten were not enough to plan).
      scope,
      range: range || undefined,
      selected: scope === 'affected' ? heavy.map((s) => s.name) : undefined,
      changed: impact && impact.changed ? impact.changed.length : undefined,
      lanes: laneN || undefined,
      serial: serialNames.length ? serialNames : undefined,
      timings: timings.sort((a, b) => b.ms - a.ms),
    };
    // A marker is a CLAIM about a commit, so it is only written when the run
    // can honestly make it. THREE refusals: a run that was abandoned (killed by
    // a newer push, or judged dead and stripped of the lock — it did not finish
    // and its failures are OUR doing), a dirty in-place tree (the sha would not
    // describe what ran — normally refused at t=0, reachable here only via
    // --dirty-ok), and a PARTIAL run trying to overwrite a full verdict (a
    // `--only` re-run must not erase what the whole tier said).
    const existing = readMarkers(dir).find((m) => m.sha === sha && (m.kind === 'green' || m.kind === 'red') && !m.partial);
    let noVerdict = '';
    if (abandonedWhy || (abandonedWhy = abandoned())) noVerdict = abandonedWhy;
    else if (dirtyAtStart) noVerdict = 'the tree was DIRTY — the sha would not describe what ran';
    // …and a run in which EVERY suite was absent judged nothing (round 6): an
    // old ref that predates them would otherwise earn a GREEN marker for a run
    // of zero suites — the vacuous green `--only` already refuses on a typo.
    else if (absent.length && absent.length === heavy.length) noVerdict = `every suite in this run is absent at ${shortSha(sha)} — nothing ran, so nothing is claimed`;
    else if (only && existing) noVerdict = `partial run — keeping the existing FULL ${existing.kind.toUpperCase()} marker for ${shortSha(sha)}`;
    if (noVerdict) {
      console.log('\n[ci:heavy] ' + noVerdict);
    } else {
      fs.mkdirSync(d, { recursive: true });
      for (const ext of ['green', 'red', 'skipped']) { try { fs.unlinkSync(path.join(d, `${sha}.${ext}`)); } catch {} }
      fs.writeFileSync(path.join(d, `${sha}.${rec.result}`), JSON.stringify(rec, null, 2) + '\n');
      pruneMarkers(dir);
    }
    // THE CLOSING LINE IS THE ONE PEOPLE READ. "HEAVY GATE GREEN" is a claim
    // about a commit; when no marker was written there is no such claim, and
    // saying it anyway is how a developer waits out the whole tier and stays
    // blocked without knowing why (round 2 finding).
    // An ABANDONED run did not pass — it stopped. Printing "GREEN" for a tier
    // that ran zero suites, even with "NO VERDICT WRITTEN" beside it, hands the
    // next reader a sentence they can quote out of context; that is the exact
    // dishonesty this round is about, one word smaller.
    const verdict = abandonedWhy
      ? `HEAVY TIER ABORTED for ${shortSha(sha)} after ${Math.round(rec.ms / 1000)}s (${timings.length} of ${heavy.length} suites ran)`
      : failed.length
        ? `HEAVY ${noVerdict ? 'TIER' : 'GATE'} RED for ${shortSha(sha)} in ${Math.round(rec.ms / 1000)}s — failed: ${failed.join(', ')}`
        : `HEAVY ${noVerdict ? 'TIER' : 'GATE'} GREEN for ${shortSha(sha)} in ${Math.round(rec.ms / 1000)}s (${heavy.length - absent.length} of ${heavy.length} suites${absent.length ? ` ran; ${absent.length} not present at that commit` : ''})`;
    console.log('\n' + verdict + (scope === 'affected' ? ` — AFFECTED scope: ${heavy.length} of ${all.length} heavy suites selected by ${range}; a FULL run is still owed once per 24 h` : '') + (noVerdict ? ` — NO VERDICT WRITTEN (${noVerdict})` : ''));
    if (absent.length) console.log(`[ci:heavy] SKIPPED (absent at ${shortSha(sha)}, not run and not judged): ${absent.join(', ')}`);
    if (flaky.length) console.log(`[ci:heavy] FLAKY (failed, passed on retry — not blocking, but they did fail once): ${flaky.join(', ')}`);
    // AN ABORTED TIER MUST NEVER EXIT 0 (round 4 finding). `failed` is empty
    // for an abandoned run by construction — it stopped instead of judging —
    // so `failed.length ? 1 : 0` handed it the success code, and the Actions
    // heavy job (whose only signal is the exit code) showed a green tick for a
    // tier that ran zero suites. Exit 4 = ABORTED: the run did not finish and
    // wrote no verdict, which is neither green (0), red (1), refused (2) nor
    // "never got the machine lock" (3). Every one of those non-zero codes means
    // "do not read this as a pass"; only 0 and 1 are verdicts.
    if (abandonedWhy) return 4;
    return failed.length ? 1 : 0;
  } finally {
    cleanup();
  }
}

// DETACHED LAUNCH. No setsid/nohup dependency: node detaches its own child and
// unrefs it, so the hook returns immediately and the run survives the hook,
// the ssh session and the terminal. The child gets the SANITIZED git env —
// a pre-push hook exports GIT_DIR/GIT_INDEX_FILE and every heavy suite runs
// `git worktree add`. (The project's own detached-job primitive — jobs.js /
// data/bin/job-wrapper.js — needs a running server and a session token, so it
// is not reachable from a git hook.)
// A SHA ON NO BRANCH IS ABANDONED (2026-09-15). MEASURED on d0e7a8d4's log:
// 4472 s wall, of which 40 min was "waiting up to 40 min for the machine" on a
// run for d5e3e587 — a commit that had been AMENDED AWAY and could never be
// pushed, yet was not an ancestor of anything, so the round-2 rule queued
// behind it for its full budget. A run for a sha that no local branch tip and
// no REMOTE-TRACKING ref can reach is superseded on the same path as an
// ancestor (SIGTERM the group, unlink its pid file, no marker); a run for the
// tip of a LIVE branch nobody replaced still waits — two branches may be
// pushed. EVERY refs/remotes/ ref counts, not origin/master alone (2026-09-16,
// verifier): this workflow deletes the LOCAL branch after a push as routine
// worktree cleanup, and a sha origin/<branch> still carries HAS been pushed —
// its verdict is wanted. d5e3e587, the 40-minute case, was on NO ref at all.
const reachableFromABranch = (sha) => {
  const r = spawnSync('git', ['-C', repo, 'for-each-ref', '--contains', sha, 'refs/heads/', 'refs/remotes/'], { encoding: 'utf-8', env: GIT_ENV });
  return r.status !== 0 || !!(r.stdout || '').trim(); // a git too old to answer ⇒ treat as live (queue, never kill)
};
// ALREADY GREEN (B-3ccf, 2.369.164). A hand-run `npm run ci:heavy` before the
// push leaves data/ci-heavy/<sha>.green, and the pre-push hook then launched
// the SAME tier for the SAME sha again — measured on 2.369.102: a 35-min re-run
// that held the machine lock for a verdict already on disk. The launcher now
// asks first. A marker is only EVIDENCE when all of these hold:
//   · it is a GREEN for exactly this sha (a RED still relaunches — a fix
//     re-pushed at the same sha, a flaky red — the push hook's re-run is how
//     it clears);
//   · it is not PARTIAL (`--only=…` judged a slice, never the tier);
//   · its FILE is newer than the sha's commit time (a marker older than the
//     commit it names was not written by a run of that commit — a planted,
//     copied or clock-skewed file claims nothing);
//   · its scope covers what this launch would run: a FULL green covers any
//     launch; an AFFECTED green covers only an AFFECTED launch over the SAME
//     range (a launch the 24 h net turned FULL is not covered by a slice).
// PURE over its inputs (the marker records, their mtimes, the commit time) so
// test-ci-heavy-launch drives every arm; heavyLaunch feeds it the disk.
export function heavyAlreadyGreen({ markers = [], sha, full, commitTimeMs, scope, range, now = Date.now() } = {}) {
  const mine = (m) => m.sha === sha || (full && m.sha === full);
  const red = markers.find((m) => m.kind === 'red' && mine(m));
  const g = markers.find((m) => m.kind === 'green' && mine(m));
  if (!g) return { skip: false, why: red ? 'the marker for this sha is RED' : 'no green marker for this sha' };
  if (red && (red.mtimeMs || 0) >= (g.mtimeMs || 0)) return { skip: false, why: 'a RED marker for this sha is at least as new as its green' };
  if (g.partial) return { skip: false, why: `the green is PARTIAL (${[].concat(g.partial).join(',')}) — a slice, not the tier` };
  if (!(commitTimeMs > 0) || !((g.mtimeMs || 0) > commitTimeMs)) return { skip: false, why: 'the green marker is not newer than the commit it names' };
  const markerFull = g.scope !== 'affected';
  if (!markerFull && !(scope === 'affected' && range && g.range === range)) {
    return { skip: false, why: scope === 'affected' ? `the green is AFFECTED over ${g.range || '?'}, this launch is over ${range}` : 'the green is AFFECTED and this launch is FULL' };
  }
  const ageMs = Math.max(0, now - g.mtimeMs);
  const age = ageMs < 120 * 60000 ? `${Math.round(ageMs / 60000)} min old` : `${Math.round(ageMs / 3600000)} h old`;
  return { skip: true, marker: g, ageMs, age, why: markerFull ? 'a FULL green' : `an AFFECTED green over the same range ${range}` };
}
function heavyLaunch(sha, { dir, only, lock, lockWaitMs, range } = {}) {
  const d = markerDir(dir);
  try { reapScratchOrphans({ log: (m) => console.error(m) }); } catch { } // the tier starts on a box the last runs did not litter (2.369.104)
  if (!sha || gitOut(['cat-file', '-e', sha + '^{commit}']) === null) { console.error(`[ci:heavy] not launching: ${sha ? 'unknown commit ' + shortSha(sha) : 'no sha given'}`); return 0; }
  // SERIALISE THE TIER, NOT JUST THE SHA (round 2 finding). Refusing only a
  // twin for the SAME sha meant two pushes inside one 16-minute window started
  // two full heavy tiers that ate each other's ports and /tmp checkouts, and
  // the loser stamped a RED that blocked the next push. A run for an ANCESTOR
  // of what we are pushing is SUPERSEDED — the newer commit subsumes it and a
  // half-finished verdict about a commit nobody is on top of any more is worth
  // nothing — and killing it now frees the machine instead of queueing behind
  // it. Anything else (a divergent branch, an older push) still gets launched:
  // refusing would leave that commit with no heavy coverage at all, so the
  // child waits for the machine lock instead.
  const running = inFlight(dir);
  const same = running.find((m) => m.sha === sha);
  if (same) { console.error(`[ci:heavy] already running for ${shortSha(sha)} (pid ${same.pid})`); return 0; }
  const isAncestorOfNew = (old) => spawnSync('git', ['-C', repo, 'merge-base', '--is-ancestor', old, sha], { env: GIT_ENV }).status === 0;
  for (const old of running) {
    if (!old.sha || old.sha === sha || gitOut(['cat-file', '-e', old.sha + '^{commit}']) === null) continue;
    const ancestor = isAncestorOfNew(old.sha);
    if (!ancestor && reachableFromABranch(old.sha)) continue; // a live branch's tip: its verdict is still wanted — queue behind it
    // Positive identity before a kill (see looksLikeHeavyRun). Without it, this
    // run queues on the machine lock instead — slower, never destructive.
    if (!looksLikeHeavyRun(old.pid)) {
      console.error(`[ci:heavy] NOT superseding ${shortSha(old.sha)} (pid ${old.pid}): that pid does not read as a heavy run — queueing instead`);
      continue;
    }
    // Detached children are process-group leaders (spawn detached:true), so the
    // negative pid takes the suites down with the runner.
    try { process.kill(-old.pid, 'SIGTERM'); } catch { try { process.kill(old.pid, 'SIGTERM'); } catch {} }
    try { fs.unlinkSync(old.file); } catch {}
    console.error(`[ci:heavy] superseded the run for ${shortSha(old.sha)} (pid ${old.pid}) — ${ancestor ? `${shortSha(sha)} descends from it` : 'that sha is on no local branch and on no remote-tracking ref (amended or rebased away — nobody can push it)'}`);
  }
  // FULL or AFFECTED. The launcher decides, so no external cron is needed: an
  // affected run needs a range, and a full run is owed when the newest FULL
  // green is older than FULL_EVERY_MS (or there is none).
  const due = fullTierDue(dir, Date.now(), { sha });
  const scope = range && !only && !due.due ? 'affected' : 'full';
  // ALREADY GREEN? (B-3ccf, see heavyAlreadyGreen) — asked AFTER supersession
  // on purpose: a run for an ancestor is still superseded (this sha's green
  // subsumes it and the machine is freed), only OUR run is not started.
  {
    const full = gitOut(['rev-parse', sha + '^{commit}']) || sha;
    const ct = Number(gitOut(['show', '-s', '--format=%ct', full]));
    const markers = readMarkers(dir).filter((m) => m.kind === 'green' || m.kind === 'red').map((m) => {
      let mtimeMs = 0; try { mtimeMs = fs.statSync(m.file).mtimeMs; } catch { }
      return { ...m, mtimeMs };
    });
    const g = heavyAlreadyGreen({ markers, sha, full, commitTimeMs: ct > 0 ? ct * 1000 : 0, scope, range });
    if (g.skip) {
      console.error(`[ci:heavy] heavy already GREEN for ${shortSha(sha)} (${g.age}), not relaunching — ${g.why} (${path.relative(repo, g.marker.file)})`);
      return 0;
    }
  }
  fs.mkdirSync(d, { recursive: true });
  const logPath = path.join(d, `${sha}.log`);
  const pidPath = path.join(d, `${sha}.pid`);
  const fd = fs.openSync(logPath, 'w');
  const args = [HERE, '--heavy', '--sha=' + sha, '--isolate', '--markers=' + d, '--pid-file=' + pidPath];
  if (scope === 'affected') args.push('--affected', '--range=' + range);
  if (only) args.push('--only=' + only.join(','));
  if (lock) args.push('--lock=' + lock);
  if (lockWaitMs !== undefined) args.push('--lock-wait-ms=' + lockWaitMs);
  // WRITE IT BEFORE THE SPAWN. The child treats the ABSENCE of this file as
  // "superseded", so it must never be able to look before the file exists.
  // pid 0 = a placeholder nobody reads as in flight (`inFlight` needs a pid).
  const stamp = (pid) => fs.writeFileSync(pidPath, JSON.stringify({ sha, pid, cmd: '--heavy --sha=' + sha, startedAt: Date.now() }) + '\n');
  stamp(0);
  const child = spawn(process.execPath, args, { cwd: repo, detached: true, stdio: ['ignore', fd, fd], env: GIT_ENV });
  child.unref();
  fs.closeSync(fd);
  // `cmd` is a fragment of the child's OWN argv: it is what lets a later
  // launcher tell "still running" from "that pid number belongs to something
  // else now" (pidStillRunning).
  stamp(child.pid);
  console.error(`[ci:heavy] launched the ${scope === 'affected' ? `AFFECTED tier (${range}; ${due.why})` : `FULL tier${range ? ` (${due.why})` : ''}`} for ${shortSha(sha)} (pid ${child.pid}) — ${path.relative(repo, logPath)}; \`npm run ci:status\` for the verdict`);
  return 0;
}

function checkHeavy({ dir, head } = {}) {
  let blocker = null;
  try { blocker = heavyBlocker({ dir, head }); } catch (e) {
    // A broken checker must never silently block every push — but it must not
    // be silent either (§no-silent-failures).
    console.error(`[ci] WARNING: could not read the heavy-gate markers (${e.message}) — not blocking`);
    return 0;
  }
  if (!blocker) return 0;
  const when = blocker.endedAt ? new Date(blocker.endedAt).toLocaleString() : '?';
  console.error(`\n[ci] PUSH BLOCKED — the heavy tier went RED on ${shortSha(blocker.sha)} (${when}), which is an ancestor of HEAD.`);
  console.error(`     failed: ${(blocker.failed || []).join(', ') || '(no suite names recorded)'}`);
  console.error(`     log:    ${path.relative(repo, path.join(markerDir(dir), blocker.sha + '.log'))}`);
  // The recovery has to be REACHABLE. It used to also offer "or wait for the
  // next push's background run" — but the background run is launched BY a
  // push and the push is the thing being refused, so that sentence pointed at
  // a door that only opens from the other side (round 2 finding).
  console.error('     Fix it, COMMIT, then earn a green heavy verdict on the new commit:');
  console.error('       npm run ci:heavy        (the whole tier in an isolated worktree at HEAD, ~17 min; writes the marker that clears this)');
  console.error('     Emergency bypass: VIBESPACE_SKIP_CI=1 git push\n');
  return 1;
}

function status({ dir, head: wantHead } = {}) {
  const all = readMarkers(dir);
  const results = all.filter((m) => m.kind !== 'pid');
  const running = inFlight(dir);
  const lockPath = defaultLockPath();
  const holder = readJson(lockPath);
  const dur = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s` : `${Math.round(ms / 1000)}s`);
  console.log(`heavy gate results (${path.relative(repo, markerDir(dir)) || markerDir(dir)}):`);
  if (!results.length && !running.length) console.log('  (none yet — the next push launches one)');
  // RUNNING vs WAITING is INFERRED, not stored — the child would have to
  // rewrite its pid file to say so, and that races the launcher's supersede.
  // The inference is sound: if a LIVE holder with a different pid has the
  // machine lock, this process cannot be executing suites (and it cannot be an
  // `unlocked` run either — a holder existing proves the lock file works).
  const lockHeld = holder && pidStillRunning(holder) ? holder : null;
  for (const m of running) {
    const state = lockHeld && lockHeld.pid !== m.pid ? `WAITING (for pid ${lockHeld.pid})` : 'RUNNING';
    console.log(`  ${shortSha(m.sha)}  ${state}  started ${new Date(m.startedAt).toLocaleString()}  pid ${m.pid}`);
  }
  for (const m of results.slice(0, 12)) {
    // SKIPPED is not a verdict — it is the absence of one, said out loud, so a
    // commit that never got its turn on the machine cannot be mistaken for one
    // that passed (or for "nobody has pushed lately").
    const label = m.kind === 'skipped' ? 'SKIP ' : m.result === 'green' ? 'GREEN' : 'RED  ';
    const detail = m.kind === 'skipped' ? `no verdict — ${m.reason || 'did not run'}`
      : m.result === 'green' ? `${m.suites} suites` : 'failed: ' + (m.failed || []).join(', ');
    // `absent` is not decoration: it is what makes "97 suites" above true or
    // false, so the CLI carries it exactly like the route and the report do.
    const marks = [m.partial ? `partial: ${m.partial.join(',')}` : '', m.unlocked ? 'ran WITHOUT the machine lock' : '',
      m.scope === 'affected' ? `AFFECTED scope: ${(m.selected || []).length} suites selected by ${m.range || '?'}` : '',
      m.lanes ? `${m.lanes} lanes` : '',
      (m.absent || []).length ? `${m.absent.length} not present at that commit` : '',
      (m.flaky || []).length ? `flaky: ${m.flaky.join(',')}` : ''].filter(Boolean).join('  ');
    console.log(`  ${shortSha(m.sha)}  ${label}  ${dur(m.ms || 0).padStart(6)}  ${new Date(m.endedAt || 0).toLocaleString()}  ${detail}${marks ? '  [' + marks + ']' : ''}`);
  }
  if (holder) console.log(`\nmachine lock: held by pid ${holder.pid} for ${shortSha(holder.sha)}${pidStillRunning(holder) ? '' : ' (DEAD — the next run steals it)'}  ${lockPath}`);
  // An affected green is green for ITS push only; a FULL green is owed once
  // per 24 h, and the next push's launcher will start one when it is.
  const head = wantHead || gitOut(['rev-parse', 'HEAD']);
  const due = fullTierDue(dir, Date.now(), { sha: head || undefined });
  console.log(due.newest
    ? `\nlast FULL green: ${shortSha(due.newest.sha)} ${new Date(due.newest.endedAt || 0).toLocaleString()} (${dur(due.ageMs || 0)} ago) — the next push launches ${due.due ? `a FULL tier (${due.why})` : 'the AFFECTED tier (a full green is required once per 24 h; this one still counts)'}`
    : '\nno FULL green heavy run on record — the next push launches a FULL tier');
  const blocker = heavyBlocker({ dir, head: wantHead });
  console.log(blocker
    ? `\nHEAD ${shortSha(head)}: PUSH BLOCKED by the red run on ${shortSha(blocker.sha)} (${(blocker.failed || []).join(', ')})`
    : `\nHEAD ${shortSha(head)}: not blocked`);
  return 0;
}

function census() {
  const f = censusFindings(listSuiteFiles());
  const problems = [];
  if (f.unclassified.length) problems.push(`${f.unclassified.length} suite(s) in NO tier and NOT excluded: ${f.unclassified.join(', ')}`);
  if (f.inBoth.length) problems.push(`in a tier AND excluded: ${f.inBoth.join(', ')}`);
  if (f.duplicated.length) problems.push(`listed twice: ${f.duplicated.join(', ')}`);
  if (f.ghosts.length) problems.push(`listed but no scripts/<name>.mjs: ${f.ghosts.join(', ')}`);
  if (f.badTier.length) problems.push(`tier is neither fast nor heavy: ${f.badTier.join(', ')}`);
  if (f.reasonless.length) problems.push(`heavy/excluded without a stated reason: ${f.reasonless.join(', ')}`);
  console.log(`census: ${f.counted.disk} suites on disk = ${f.counted.fast} fast + ${f.counted.heavy} heavy + ${f.counted.excluded} excluded`);
  for (const p of problems) console.error('  ✗ ' + p);
  if (!problems.length) console.log('  ✓ every scripts/test-*.mjs is in exactly one tier or excluded with a reason');
  return problems.length ? 1 : 0;
}

function main(argv) {
  const arg = (name) => { const hit = argv.find((a) => a === '--' + name || a.startsWith('--' + name + '=')); return hit === undefined ? undefined : (hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true); };
  const str = (name) => (typeof arg(name) === 'string' ? arg(name) : null);
  // Ops flags (all modes): --markers=<dir> where the heavy results live,
  // --head=<sha> which commit the verdict is about, --only=a,b a subset of the
  // heavy tier. They exist so the gate can be pointed at a throwaway
  // repository/marker dir — a rule about git ancestry has to be testable
  // against real git history, not a mock.
  const dir = str('markers') ? path.resolve(str('markers')) : undefined;
  const head = str('head') || undefined;
  const only = str('only') ? str('only').split(',').map((x) => x.trim()).filter(Boolean) : null;
  // The machine lock is real infrastructure, so a TEST must be able to drive
  // its own instead of contending with (or waiting 40 minutes for) the box's
  // actual heavy run — scripts/test-ci-heavy-launch.mjs passes both.
  const lock = str('lock') ? path.resolve(str('lock')) : (process.env.VIBESPACE_CI_HEAVY_LOCK || undefined);
  const lockWaitMs = str('lock-wait-ms') !== null ? Number(str('lock-wait-ms')) : undefined;
  // --range=<old>..<new> (or --range <x>): the impact scope for --heavy
  // --affected / --heavy-affected, and what --heavy-launch hands its child.
  const rangeArg = str('range') !== null ? str('range') : (argv.includes('--range') ? (argv[argv.indexOf('--range') + 1] || null) : null);
  if (arg('reap')) { process.exit(reapByHand({ dryRun: !!arg('dry-run') })); }
  if (arg('census')) process.exit(census());
  if (arg('status')) process.exit(status({ dir, head }));
  if (arg('check-heavy')) process.exit(checkHeavy({ dir, head }));
  if (arg('heavy-launch') !== undefined) process.exit(heavyLaunch(str('heavy-launch') || argv[argv.indexOf('--heavy-launch') + 1], { dir, only, lock, lockWaitMs, range: rangeArg || undefined }));
  if (arg('heavy') || arg('heavy-affected')) {
    const affected = !!arg('affected') || !!arg('heavy-affected');
    if (affected && !rangeArg) { console.error('✗ --affected needs --range=<old>..<new> (or --range=<sha> for its whole unpublished range)'); process.exit(2); }
    heavyGate({ sha: str('sha'), isolate: !!arg('isolate'), dir, only, dirtyOk: !!arg('dirty-ok'), lock, lockWaitMs, pidFile: str('pid-file') || undefined, range: affected ? rangeArg : undefined })
      .then((code) => process.exit(code), (e) => { console.error('[ci:heavy] crashed: ' + (e && e.stack || e)); process.exit(1); });
    return;
  }
  // `--isolate [--sha=<x>]` gates the COMMIT rather than this working tree —
  // the hook uses it when a pushed ref's tip is not HEAD.
  process.exit(fastGate({ sha: str('sha'), isolate: !!arg('isolate') }));
}

// Only run when EXECUTED — test-architecture imports the tier table.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
